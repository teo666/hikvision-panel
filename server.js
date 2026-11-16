// Hikvision camera panel: static files + authenticated ISAPI proxy.
// Zero dependencies: Node >= 21 built-ins only.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AuthError } from './lib/camera.js';
import { createCameraStore, probe, validateCamera, ValidationError } from './lib/cameras.js';
import { checkRequest } from './lib/policy.js';
import { configurationQuery } from './lib/hik-security.js';

const ROOT = fileURLToPath(new URL('./public/', import.meta.url));
const MAX_BODY = 1024 * 1024;
const MAX_UPLOAD = 32 * 1024 * 1024; // configuration backup files
const SLOW_TIMEOUT_MS = 180_000; // restoring a backup can take a while
const TIMEOUT_MS = 15_000;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
};

// Long-lived streams (MJPEG preview, event stream): no timeout.
const isStream = (path) => /\/httpPreview$|\/alertStream$/.test(path);

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);
const hostname = (host = '') => host.replace(/:\d+$/, '').toLowerCase();

/**
 * @param {{ store: Awaited<ReturnType<typeof createCameraStore>>, loopbackOnly?: boolean }} deps
 *   loopbackOnly: only accept requests addressed to localhost (blocks DNS rebinding).
 */
export function createApp({ store, loopbackOnly = true }) {
  return createServer(async (req, res) => {
    try {
      // Requests must be addressed to this panel, and writes must come from its own pages.
      if (loopbackOnly && !LOOPBACK.has(hostname(req.headers.host))) return send(res, 421, 'Host non ammesso');
      if (!['GET', 'HEAD'].includes(req.method) && req.headers.origin) {
        let originHost = null;
        try {
          originHost = new URL(req.headers.origin).host;
        } catch {}
        if (originHost !== req.headers.host) return sendError(res, 403, 'origin_forbidden', 'Origine non ammessa');
      }
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname.startsWith('/isapi/')) return await proxy(req, res, url, store);
      if (url.pathname === '/api/cameras' || url.pathname.startsWith('/api/cameras/')) return await camerasApi(req, res, url, store);
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed');
      return await serveStatic(res, url.pathname);
    } catch (err) {
      console.error(err);
      if (!res.headersSent) send(res, 500, 'Errore interno');
      else res.destroy();
    }
  });
}

// --- cameras API ------------------------------------------------------------
//   GET    /api/cameras            list (no passwords)
//   POST   /api/cameras            add  {name,url,username,password, force?}  (tests the connection first)
//   POST   /api/cameras/test       test {url,username,password} or {id, ...overrides}
//   PUT    /api/cameras/:id        edit (empty password = keep the current one)
//   DELETE /api/cameras/:id

async function camerasApi(req, res, url, store) {
  const [, , , id, sub] = url.pathname.split('/');
  const body = async () => {
    if (!/^application\/json\b/.test(req.headers['content-type'] || '')) throw new ValidationError('Serve Content-Type: application/json', 'content_type_json');
    const raw = await readBody(req);
    if (raw === null) throw new ValidationError('Richiesta troppo grande', 'body_too_large');
    try {
      return JSON.parse(raw.toString('utf8') || '{}');
    } catch {
      throw new ValidationError('JSON non valido', 'invalid_json');
    }
  };
  const tryProbe = async (cfg) => probe(store.tempClient(cfg));
  const notFound = () => sendError(res, 404, 'camera_not_found', 'Camera non trovata');

  try {
    if (!id && req.method === 'GET') return sendJson(res, 200, { cameras: store.list() });

    if (!id && req.method === 'POST') {
      const input = await body();
      const cfg = validateCamera(input);
      const info = input.force ? null : await tryProbe(cfg);
      return sendJson(res, 201, { camera: await store.add(cfg), info });
    }

    if (id === 'test' && req.method === 'POST') {
      const input = await body();
      const base = input.id ? store.secretFor(input.id) : null;
      if (input.id && !base) return notFound();
      const cfg = base ? { ...base, ...validateCamera(input, { partial: true }) } : validateCamera(input);
      return sendJson(res, 200, { info: await tryProbe(cfg) });
    }

    if (id && sub === 'backup' && req.method === 'POST') {
      if (!store.get(id)) return notFound();
      const { password } = await body();
      return await backupConfig(res, store, id, checkBackupPassword(password));
    }

    if (id && sub === 'restore' && req.method === 'POST') {
      if (!store.get(id)) return notFound();
      let password = '';
      try {
        password = decodeURIComponent(req.headers['x-backup-password'] || '');
      } catch {}
      checkBackupPassword(password);
      const file = await readBody(req, MAX_UPLOAD);
      if (file === null) throw new ValidationError('Richiesta troppo grande', 'body_too_large');
      return await restoreConfig(res, store, id, password, file);
    }

    if (sub) return notFound();

    if (id && req.method === 'PUT') {
      if (!store.get(id)) return notFound();
      const input = await body();
      const patch = validateCamera(input, { partial: true });
      const info = input.force ? null : await tryProbe({ ...store.secretFor(id), ...patch });
      return sendJson(res, 200, { camera: await store.update(id, patch), info });
    }

    if (id && req.method === 'DELETE') {
      return (await store.remove(id)) ? sendJson(res, 200, { ok: true }) : notFound();
    }

    return sendError(res, 405, 'method_not_allowed', `Metodo ${req.method} non ammesso`, { method: req.method });
  } catch (err) {
    if (err instanceof ValidationError) return sendError(res, 422, err.code, err.message, err.params);
    // Backup/restore talk to the camera directly.
    if (err instanceof AuthError) return sendError(res, 502, err.code, err.message);
    if (err.name === 'TimeoutError') return sendError(res, 504, 'camera_timeout', 'La camera non risponde');
    if (err.name === 'TypeError' && err.cause) {
      const detail = err.cause.code || err.cause.message;
      return sendError(res, 502, 'camera_unreachable', `Camera non raggiungibile: ${detail}`, { detail });
    }
    throw err;
  }
}

// --- configuration backup ----------------------------------------------------
// The camera exports/imports its configuration only with a backup password
// (`secretkey`), encrypted with a key derived from the panel's camera account —
// which only the server knows. See lib/hik-security.js.

const CONFIG = '/ISAPI/System/configurationData';

function checkBackupPassword(password) {
  if (typeof password !== 'string' || !password) {
    throw new ValidationError('Serve la password del backup', 'backup_password_required');
  }
  // Like the camera's own UI: 1–16 characters (longer ones are refused with cfgFileSecretKeyError).
  if (password.length > 16) throw new ValidationError('Password del backup troppo lunga (massimo 16 caratteri)', 'backup_password_too_long');
  return password;
}

/** Camera refusal → 502 with the camera's reason (subStatusCode / description). */
async function cameraRefusal(res, upstream) {
  const text = await upstream.text();
  const tag = (n) => text.match(new RegExp(`<${n}>([^<]*)</${n}>`))?.[1];
  const detail = [tag('statusString'), tag('subStatusCode')].filter(Boolean).join(' / ') || `HTTP ${upstream.status}`;
  return sendError(res, 502, 'camera_refused', `La camera ha rifiutato: ${detail}`, { detail });
}

async function backupConfig(res, store, id, password) {
  const client = store.client(id);
  const query = await configurationQuery(client, store.secretFor(id), password);
  const upstream = await client.request('GET', CONFIG + query, { signal: AbortSignal.timeout(SLOW_TIMEOUT_MS) });
  if (!upstream.ok) return cameraRefusal(res, upstream);
  res.writeHead(200, {
    'Content-Type': 'application/octet-stream',
    'Content-Disposition': 'attachment; filename="configurationData"',
    'Cache-Control': 'no-store',
  });
  Readable.fromWeb(upstream.body).pipe(res);
}

async function restoreConfig(res, store, id, password, file) {
  const client = store.client(id);
  const query = await configurationQuery(client, store.secretFor(id), password);
  const upstream = await client.request('PUT', CONFIG + query, {
    body: file,
    headers: { 'Content-Type': 'application/octet-stream' },
    signal: AbortSignal.timeout(SLOW_TIMEOUT_MS),
  });
  if (!upstream.ok) return cameraRefusal(res, upstream);
  await upstream.text();
  return sendJson(res, 200, { ok: true });
}

// --- ISAPI proxy: /isapi/<cameraId>/ISAPI/... --------------------------------

async function proxy(req, res, url, store) {
  const rest = url.pathname.slice('/isapi/'.length);
  const slash = rest.indexOf('/');
  const camId = slash < 0 ? rest : rest.slice(0, slash);
  const camera = store.client(camId);
  if (!camera) return sendError(res, 404, 'camera_unknown', 'Camera non trovata: aggiungila dalla pagina Camere');
  const path = decodeURIComponent(slash < 0 ? '' : rest.slice(slash));
  const verdict = checkRequest(req.method, path);
  if (!verdict.ok) return sendError(res, 403, verdict.code, verdict.reason, verdict.params);

  const body = await readBody(req, MAX_BODY);
  if (body === null) return sendError(res, 413, 'body_too_large', 'Richiesta troppo grande');

  const ctrl = new AbortController();
  const timer = isStream(path) ? null : setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  res.on('close', () => ctrl.abort());

  let upstream;
  try {
    upstream = await camera.request(req.method, path + url.search, {
      body: body.length ? body : undefined,
      headers: {
        ...(req.headers['content-type'] ? { 'Content-Type': req.headers['content-type'] } : {}),
        Accept: req.headers.accept || '*/*',
      },
      signal: ctrl.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof AuthError) return sendError(res, 502, err.code, err.message);
    if (ctrl.signal.aborted && !res.writableEnded && !res.destroyed) {
      return sendError(res, 504, 'camera_timeout', 'La camera non risponde');
    }
    const detail = err.cause?.code || err.message;
    return sendError(res, 502, 'camera_unreachable', `Camera non raggiungibile: ${detail}`, { detail });
  }

  const headers = { 'Cache-Control': 'no-store' };
  const type = upstream.headers.get('content-type');
  if (type) headers['Content-Type'] = type;
  const disposition = upstream.headers.get('content-disposition');
  if (disposition) headers['Content-Disposition'] = disposition;
  // A 401 here means the stored credentials are wrong: don't let the browser
  // show its own login prompt.
  const status = upstream.status === 401 ? 502 : upstream.status;
  res.writeHead(status, headers);
  if (!upstream.body || req.method === 'HEAD') {
    clearTimeout(timer);
    return res.end();
  }
  const stream = Readable.fromWeb(upstream.body);
  stream.on('end', () => clearTimeout(timer));
  stream.on('error', () => res.destroy());
  stream.pipe(res);
}

async function serveStatic(res, pathname) {
  const rel = normalize(decodeURIComponent(pathname)).replace(/^([/\\])+/, '');
  let file = join(ROOT, rel || 'index.html');
  if (!file.startsWith(ROOT)) return send(res, 404, 'Not found');
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    const data = await readFile(file);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(data);
  } catch {
    send(res, 404, 'Not found');
  }
}

function readBody(req, limit = MAX_BODY) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    // Over the limit: keep reading but drop the data, so the client gets a clean 413.
    req.on('data', (c) => {
      size += c.length;
      if (size <= limit) chunks.push(c);
    });
    req.on('end', () => resolve(size > limit ? null : Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function send(res, status, text) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(text);
}

function sendJson(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(obj));
}

/**
 * JSON error: `code` is stable and translated by the browser (locales/*.js, "server.<code>"),
 * `error` is the Italian message, used when the browser doesn't know the code.
 */
function sendError(res, status, code, error, params) {
  sendJson(res, status, { error, code, ...(params ? { params } : {}) });
}

// --- entry point -----------------------------------------------------------

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    process.loadEnvFile();
  } catch {
    // no .env: rely on the real environment
  }
  const { CAM_URL, CAM_USER, CAM_PASS } = process.env;
  const file = process.env.CAMERAS_FILE || fileURLToPath(new URL('./data/cameras.json', import.meta.url));
  const port = Number(process.env.PORT || 8080);
  const host = process.env.HOST || '127.0.0.1';
  // Legacy .env camera: imported once, the first time the default cameras file is created.
  // Never into a custom CAMERAS_FILE (dev/test lists must not receive real credentials).
  const seed =
    CAM_URL && CAM_USER && CAM_PASS && !process.env.CAMERAS_FILE
      ? [{ name: 'Camera 1', url: CAM_URL, username: CAM_USER, password: CAM_PASS }]
      : [];
  const store = await createCameraStore({ file, seed });
  const app = createApp({ store, loopbackOnly: LOOPBACK.has(host) });
  app.listen(port, host, () => {
    const n = store.list().length;
    console.log(`Pannello camera su http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}  (${n} ${n === 1 ? 'camera' : 'camere'})`);
    if (!LOOPBACK.has(host)) console.warn('Attenzione: il pannello non ha login ed è raggiungibile da altri computer.');
  });
}
