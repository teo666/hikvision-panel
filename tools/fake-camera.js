// A fake Hikvision camera for development and tests: Digest auth, ISAPI XML
// from test/fixtures, PUTs kept in memory, SVG "snapshots".
//
//   node tools/fake-camera.js            → http://127.0.0.1:8081  (user: test / pass: test-pass)

import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseChallenge, buildAuthorization } from '../lib/digest.js';
import { createDecipheriv } from 'node:crypto';
import { deriveAesKey } from '../lib/hik-security.js';

const FIXTURES = fileURLToPath(new URL('../test/fixtures/', import.meta.url));
const fixture = (name) => readFileSync(FIXTURES + name, 'utf8');

const OK = `<?xml version="1.0" encoding="UTF-8"?>
<ResponseStatus version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
<requestURL></requestURL><statusCode>1</statusCode><statusString>OK</statusString><subStatusCode>ok</subStatusCode>
</ResponseStatus>`;
const BAD = `<?xml version="1.0" encoding="UTF-8"?>
<ResponseStatus version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
<requestURL></requestURL><statusCode>6</statusCode><statusString>Invalid Content</statusString><subStatusCode>badXmlContent</subStatusCode>
</ResponseStatus>`;

/**
 * @param {{ username?: string, password?: string, realm?: string }} [o]
 */
export function createFakeCamera({ username = 'test', password = 'test-pass', realm = 'IP Camera(FAKE)', alertEveryMs = 3000 } = {}) {
  const docs = new Map([
    ['/ISAPI/System/deviceInfo', fixture('deviceInfo.xml')],
    ['/ISAPI/System/time', fixture('time.xml')],
    ['/ISAPI/System/Video/inputs/channels/1/overlays', fixture('overlays.xml')],
    ['/ISAPI/System/Video/inputs/channels/1/overlays/capabilities', fixture('overlays-capabilities.xml')],
    ['/ISAPI/System/Video/inputs/channels/1/overlays/text', fixture('overlays-text.xml')],
    ['/ISAPI/System/time/capabilities', fixture('time-capabilities.xml')],
    ['/ISAPI/System/time/ntpServers', fixture('ntp-servers.xml')],
    ['/ISAPI/System/time/ntpServers/capabilities', fixture('ntp-servers-capabilities.xml')],
    ['/ISAPI/Image/channels/1', fixture('image.xml')],
    ['/ISAPI/Image/channels/1/capabilities', fixture('image-capabilities.xml')],
    ['/ISAPI/Streaming/channels/101', fixture('streaming-101.xml')],
    ['/ISAPI/Streaming/channels/101/capabilities', fixture('streaming-101-capabilities.xml')],
    ['/ISAPI/Streaming/channels/102', fixture('streaming-102.xml')],
    ['/ISAPI/Streaming/channels/102/capabilities', fixture('streaming-102-capabilities.xml')],
    ['/ISAPI/System/Network/interfaces/1', fixture('network-interface-1.xml')],
    ['/ISAPI/System/Network/interfaces/1/capabilities', fixture('network-interface-1-capabilities.xml')],
    ['/ISAPI/System/Video/inputs/channels/1/motionDetection', fixture('motion.xml')],
    ['/ISAPI/System/Video/inputs/channels/1/motionDetection/capabilities', fixture('motion-capabilities.xml')],
    ['/ISAPI/Event/triggers/VMD-1', fixture('trigger-vmd.xml')],
    ['/ISAPI/Event/triggersCap', fixture('triggers-cap.xml')],
    ['/ISAPI/Event/schedules/motionDetections/VMD_video1', fixture('schedule-vmd.xml')],
    ['/ISAPI/System/Network/mailing', fixture('mailing.xml')],
    ['/ISAPI/System/Network/ftp', fixture('ftp.xml')],
    ['/ISAPI/System/Network/ftp/capabilities', fixture('ftp-capabilities.xml')],
    ['/ISAPI/Event/notification/httpHosts', fixture('http-hosts.xml')],
    ['/ISAPI/Event/notification/httpHosts/capabilities', fixture('http-hosts-capabilities.xml')],
  ]);
  // Accounts on the camera; 'test' is the administrator the panel logs in with.
  const users = [{ id: '1', userName: username, userLevel: 'Administrator' }];
  let config = Buffer.from('FAKECONFIG v1\n');
  let reboots = 0;
  let lastBackupPassword = null;
  const nonces = new Set();
  const log = [];

  const authorized = (req) => {
    const auth = parseChallenge(req.headers.authorization);
    if (!auth || !nonces.has(auth.nonce) || auth.uri !== req.url || auth.username !== username) return false;
    const expected = buildAuthorization({
      challenge: { realm, nonce: auth.nonce, qop: 'auth' },
      method: req.method,
      uri: auth.uri,
      username,
      password,
      nc: parseInt(auth.nc, 16),
      cnonce: auth.cnonce,
    });
    return parseChallenge(expected).response === auth.response;
  };

  const server = createServer((req, res) => {
    if (!authorized(req)) {
      const nonce = randomBytes(16).toString('hex');
      nonces.add(nonce);
      res.writeHead(401, { 'WWW-Authenticate': `Digest qop="auth", realm="${realm}", nonce="${nonce}", stale="FALSE"` });
      return res.end('Unauthorized');
    }
    const path = req.url.split('?')[0];
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks);
      const body = raw.toString('utf8');
      log.push({ method: req.method, path, body, size: raw.length, contentType: req.headers['content-type'] });
      const xml = (status, text) => {
        res.writeHead(status, { 'Content-Type': 'application/xml' });
        res.end(text);
      };
      const tag = (name) => body.match(new RegExp(`<${name}>([^<]*)</${name}>`))?.[1];

      if (path === '/ISAPI/Event/notification/alertStream' && req.method === 'GET') return alertStream(res, alertEveryMs);
      if (path === '/ISAPI/System/Network/mailing/test' && req.method === 'POST') {
        // Like the camera: 200 with the outcome in <errorDescription>.
        const outcome = !tag('hostName') && !tag('ipAddress') ? 'connect server fail' : tag('password') === 'sbagliata' ? 'password error' : 'ok';
        return xml(200, `<?xml version="1.0" encoding="UTF-8"?><MailingTestResult><errorDescription>${outcome}</errorDescription></MailingTestResult>`);
      }
      if (path === '/ISAPI/System/reboot' && req.method === 'PUT') {
        reboots++;
        return xml(200, OK);
      }
      if (path === '/ISAPI/Security/capabilities' && req.method === 'GET') {
        return xml(200, `<?xml version="1.0" encoding="UTF-8"?><SecurityCap version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
<securityVersion opt="1"/><keyIterateNum>${SECURITY.iterations}</keyIterateNum><isIrreversible>true</isIrreversible><salt>${SECURITY.salt}</salt></SecurityCap>`);
      }
      if (path === '/ISAPI/System/configurationData') {
        // Like the camera: the backup password must come encrypted (security=1).
        const q = new URL(req.url, 'http://x').searchParams;
        const backupPassword = decryptSecret(q, username, password);
        if (!backupPassword) {
          return xml(400, BAD.replace('Invalid Content', 'Invalid XML Content').replace('badXmlContent', 'cfgFileSecretKeyError'));
        }
        lastBackupPassword = backupPassword;
        if (req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': 'attachment; filename="configurationData"' });
          return res.end(config);
        }
        if (req.method === 'PUT') {
          if (!raw.subarray(0, 10).equals(Buffer.from('FAKECONFIG'))) return xml(400, BAD);
          config = raw;
          return xml(200, OK);
        }
      }
      const userPath = path.match(/^\/ISAPI\/Security\/users(?:\/(\d+))?$/);
      if (userPath) {
        if (req.method === 'GET' && !userPath[1]) {
          return xml(200, `<?xml version="1.0" encoding="UTF-8"?>\n<UserList version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">\n${users
            .map((u) => `<User><id>${u.id}</id><userName>${u.userName}</userName><userLevel>${u.userLevel}</userLevel></User>`)
            .join('\n')}\n</UserList>`);
        }
        // Like the real camera: every change needs the administrator's current password.
        if (tag('loginPassword') !== password) return xml(400, BAD.replace('badXmlContent', 'loginPasswordError'));
        if (req.method === 'POST' && !userPath[1]) {
          if (users.some((u) => u.userName === tag('userName'))) return xml(400, BAD.replace('badXmlContent', 'userNameExist'));
          users.push({ id: tag('id'), userName: tag('userName'), userLevel: tag('userLevel') || 'Operator' });
          return xml(200, OK);
        }
        const u = users.find((x) => x.id === userPath[1]);
        if (!u) return xml(404, BAD.replace('badXmlContent', 'notSupport'));
        if (req.method === 'PUT') {
          if (tag('userLevel') && u.userLevel !== 'Administrator') u.userLevel = tag('userLevel');
          return xml(200, OK);
        }
        if (req.method === 'DELETE') {
          if (u.userLevel === 'Administrator') return xml(400, BAD.replace('badXmlContent', 'notSupport'));
          users.splice(users.indexOf(u), 1);
          return xml(200, OK);
        }
      }
      if (/\/ISAPI\/Streaming\/channels\/\d+\/picture$/.test(path)) {
        res.writeHead(200, { 'Content-Type': 'image/svg+xml' });
        return res.end(snapshot(path.includes('/101/') ? [1280, 720] : [640, 360]));
      }
      if (!docs.has(path)) {
        res.writeHead(404, { 'Content-Type': 'application/xml' });
        return res.end(BAD.replace('Invalid Content', 'Invalid Operation').replace('badXmlContent', 'notSupport'));
      }
      if (req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/xml; charset="UTF-8"' });
        return res.end(docs.get(path));
      }
      if (req.method === 'PUT') {
        // Simulate the camera rejecting a value, to exercise error handling.
        // Like the real one, it refuses HTTP as a motion action (not in triggersCap).
        const unsupportedAction = path.startsWith('/ISAPI/Event/triggers/') && body.includes('<notificationMethod>HTTP<');
        if (!body.trim().startsWith('<') || body.includes('REJECT') || unsupportedAction) {
          res.writeHead(400, { 'Content-Type': 'application/xml' });
          return res.end(BAD);
        }
        docs.set(path, body);
        res.writeHead(200, { 'Content-Type': 'application/xml' });
        return res.end(OK);
      }
      res.writeHead(405);
      res.end();
    });
  });

  return { server, docs, log, users, get config() { return config; }, get reboots() { return reboots; }, get lastBackupPassword() { return lastBackupPassword; } };
}

const SECURITY = { iterations: 100, salt: 'f'.repeat(64) };

/** Decrypt ?secretkey=…&security=1&iv=… with the account's derived key; null if wrong. */
function decryptSecret(q, username, password) {
  const secret = q.get('secretkey');
  const iv = q.get('iv');
  if (!secret || q.get('security') !== '1' || !iv) return null;
  try {
    const key = deriveAesKey({ username, password, salt: SECURITY.salt, iterations: SECURITY.iterations, irreversible: true });
    const d = createDecipheriv('aes-128-cbc', Buffer.from(key, 'hex'), Buffer.from(iv, 'hex'));
    const b64 = Buffer.concat([d.update(Buffer.from(secret, 'hex')), d.final()]).toString('utf8');
    return Buffer.from(b64, 'base64').toString('utf8') || null;
  } catch {
    return null;
  }
}

/** Multipart event stream: a motion event, then heartbeats, until the client goes away. */
function alertStream(res, everyMs) {
  res.writeHead(200, { 'Content-Type': 'multipart/mixed; boundary=boundary' });
  let n = 0;
  const part = (type, state) => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<EventNotificationAlert version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
<ipAddress>127.0.0.1</ipAddress><channelID>1</channelID><dateTime>${new Date().toISOString()}</dateTime>
<activePostCount>1</activePostCount><eventType>${type}</eventType><eventState>${state}</eventState>
<eventDescription>${type} alarm</eventDescription>${type === 'VMD' ? '<targetType>human</targetType>' : ''}
</EventNotificationAlert>`;
    res.write(`--boundary\r\nContent-Type: application/xml; charset="UTF-8"\r\nContent-Length: ${Buffer.byteLength(xml)}\r\n\r\n${xml}\r\n`);
  };
  const tick = () => (n++ % 2 === 0 ? part('VMD', 'active') : part('videoloss', 'inactive'));
  tick();
  const timer = setInterval(tick, everyMs);
  res.on('close', () => clearInterval(timer));
}

function snapshot([w, h]) {
  const t = new Date().toLocaleTimeString('it-IT');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7aa7d6"/><stop offset="0.6" stop-color="#c9d8e6"/><stop offset="0.6" stop-color="#5b6b4a"/><stop offset="1" stop-color="#3c4630"/></linearGradient></defs>
  <rect width="100%" height="100%" fill="url(#g)"/>
  <rect x="${w * 0.15}" y="${h * 0.35}" width="${w * 0.25}" height="${h * 0.25}" fill="#8a6d55"/>
  <rect x="${w * 0.55}" y="${h * 0.25}" width="${w * 0.3}" height="${h * 0.35}" fill="#a3a3a3"/>
  <text x="50%" y="88%" text-anchor="middle" font-family="sans-serif" font-size="${h / 14}" fill="#fff">CAMERA FINTA · ${t}</text>
</svg>`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.FAKE_PORT || 8081);
  createFakeCamera().server.listen(port, '127.0.0.1', () => {
    console.log(`Camera finta su http://127.0.0.1:${port}  (utente: test / password: test-pass)`);
  });
}
