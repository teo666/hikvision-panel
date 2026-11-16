// Camera registry persisted to a JSON file (credentials included, so the file
// is created readable by the owner only). Passwords never leave the server.

import { readFile, writeFile, rename, mkdir, chmod } from 'node:fs/promises';
import { dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { createCamera, AuthError } from './camera.js';

/** A user-facing error: `code` is stable (the browser translates it), the message is the Italian fallback. */
export class ValidationError extends Error {
  /** @param {string} message @param {string} code @param {Record<string, unknown>} [params] */
  constructor(message, code, params) {
    super(message);
    this.code = code;
    if (params) this.params = params;
  }
}

const clean = (s) => (typeof s === 'string' ? s.trim() : '');

/** Normalize and check a camera URL: http(s), host, optional port, no path. */
export function normalizeUrl(raw) {
  let s = clean(raw);
  if (!s) throw new ValidationError('Indirizzo mancante', 'url_missing');
  if (!/^https?:\/\//i.test(s)) s = `http://${s}`;
  let u;
  try {
    u = new URL(s);
  } catch {
    throw new ValidationError('Indirizzo non valido', 'url_invalid');
  }
  if (!['http:', 'https:'].includes(u.protocol)) throw new ValidationError('Solo http o https', 'url_protocol');
  if (u.username || u.password) throw new ValidationError('Non mettere le credenziali nell’indirizzo', 'url_credentials');
  if ((u.pathname && u.pathname !== '/') || u.search || u.hash) throw new ValidationError('Solo indirizzo e porta, senza percorso', 'url_path');
  return `${u.protocol}//${u.host}`;
}

/**
 * Validate user input for a new camera (or a patch for an existing one).
 * @param {object} input
 * @param {{ partial?: boolean }} [o] partial: fields may be missing, empty password = unchanged
 */
export function validateCamera(input = {}, { partial = false } = {}) {
  const out = {};
  if (!partial || input.name !== undefined) {
    out.name = clean(input.name);
    if (!out.name) throw new ValidationError('Nome mancante', 'name_missing');
    if (out.name.length > 60) throw new ValidationError('Nome troppo lungo', 'name_too_long');
  }
  if (!partial || input.url !== undefined) out.url = normalizeUrl(input.url);
  if (!partial || input.username !== undefined) {
    out.username = clean(input.username);
    if (!out.username) throw new ValidationError('Utente mancante', 'username_missing');
  }
  if (typeof input.password === 'string' && input.password !== '') out.password = input.password;
  else if (!partial) throw new ValidationError('Password mancante', 'password_missing');
  return out;
}

const publicView = ({ id, name, url, username }) => ({ id, name, url, username });

/**
 * Ask the camera who it is. Resolves with { model, deviceName, firmwareVersion }.
 * @param {ReturnType<typeof createCamera>} client
 */
export async function probe(client, timeoutMs = 8000) {
  let res;
  try {
    res = await client.request('GET', '/ISAPI/System/deviceInfo', { signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    if (err.name === 'TimeoutError') throw new ValidationError('La camera non risponde', 'camera_timeout');
    if (err instanceof AuthError) throw new ValidationError(err.message, err.code);
    const detail = err.cause?.code || err.message;
    throw new ValidationError(`Camera non raggiungibile (${detail})`, 'camera_unreachable', { detail });
  }
  const text = await res.text();
  if (res.status === 401) {
    throw new ValidationError(
      'Utente o password errati. Attenzione: dopo alcuni tentativi sbagliati la camera blocca l’account.',
      'bad_credentials',
    );
  }
  if (!res.ok) throw new ValidationError(`La camera ha risposto ${res.status}`, 'camera_status', { status: res.status });
  const tag = (t) => text.match(new RegExp(`<${t}>([^<]*)</${t}>`))?.[1];
  if (!tag('model')) throw new ValidationError('Il dispositivo non sembra una camera Hikvision (manca deviceInfo)', 'not_hikvision');
  return { model: tag('model'), deviceName: tag('deviceName'), firmwareVersion: tag('firmwareVersion') };
}

/**
 * @param {object} o
 * @param {string} o.file path of the JSON file
 * @param {object[]} [o.seed] cameras to start with when the file doesn't exist
 * @param {(cfg: {baseUrl:string, username:string, password:string}) => any} [o.connect]
 */
export async function createCameraStore({ file, seed = [], connect = createCamera }) {
  let cameras;
  try {
    cameras = JSON.parse(await readFile(file, 'utf8')).cameras ?? [];
  } catch (err) {
    if (err.code !== 'ENOENT') throw new Error(`Impossibile leggere ${file}: ${err.message}`);
    cameras = seed.map((c) => ({ id: newId(), ...validateCamera(c) }));
    if (cameras.length) await persist();
  }
  const clients = new Map();

  function newId() {
    return randomBytes(4).toString('hex');
  }

  async function persist() {
    await mkdir(dirname(file), { recursive: true, mode: 0o700 });
    const tmp = `${file}.${process.pid}.tmp`;
    await writeFile(tmp, `${JSON.stringify({ cameras }, null, 2)}\n`, { mode: 0o600 });
    await chmod(tmp, 0o600);
    await rename(tmp, file);
  }

  const find = (id) => cameras.find((c) => c.id === id);

  return {
    list: () => cameras.map(publicView),

    get: (id) => (find(id) ? publicView(find(id)) : null),

    /** HTTP client for a stored camera (cached), or null. */
    client(id) {
      const c = find(id);
      if (!c) return null;
      if (!clients.has(id)) clients.set(id, connect({ baseUrl: c.url, username: c.username, password: c.password }));
      return clients.get(id);
    },

    /** A throwaway client for testing settings before saving them. */
    tempClient: (cfg) => connect({ baseUrl: cfg.url, username: cfg.username, password: cfg.password, authCooldownMs: 0 }),

    /** Credentials of a stored camera, for testing edits that keep the old password. */
    secretFor: (id) => (find(id) ? { ...find(id) } : null),

    async add(input) {
      const cam = { id: newId(), ...validateCamera(input) };
      cameras.push(cam);
      await persist();
      return publicView(cam);
    },

    async update(id, patch) {
      const c = find(id);
      if (!c) return null;
      Object.assign(c, validateCamera(patch, { partial: true }));
      clients.delete(id);
      await persist();
      return publicView(c);
    },

    async remove(id) {
      const i = cameras.findIndex((c) => c.id === id);
      if (i < 0) return false;
      cameras.splice(i, 1);
      clients.delete(id);
      await persist();
      return true;
    },
  };
}
