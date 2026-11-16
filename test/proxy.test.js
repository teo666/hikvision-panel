// End-to-end: panel server → fake camera with Digest auth.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server.js';
import { createCameraStore } from '../lib/cameras.js';
import { createFakeCamera } from '../tools/fake-camera.js';

let fake, panel, base, dir, store, cam, camUrl;

export async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return `http://127.0.0.1:${server.address().port}`;
}

before(async () => {
  fake = createFakeCamera();
  camUrl = await listen(fake.server);
  dir = await mkdtemp(join(tmpdir(), 'hik-proxy-'));
  store = await createCameraStore({
    file: join(dir, 'cameras.json'),
    seed: [{ name: 'Finta', url: camUrl, username: 'test', password: 'test-pass' }],
  });
  panel = createApp({ store });
  base = await listen(panel);
  cam = `${base}/isapi/${store.list()[0].id}`;
});

after(async () => {
  fake.server.close();
  panel.close();
  await rm(dir, { recursive: true, force: true });
});

test('GET goes through with digest auth', async () => {
  const res = await fetch(`${cam}/ISAPI/System/deviceInfo`);
  assert.equal(res.status, 200);
  assert.match(await res.text(), /<model>DS-2CD1043G2-LIU<\/model>/);
});

test('repeated requests reuse the challenge (nonce count grows)', async () => {
  const before = fake.log.length;
  for (let i = 0; i < 3; i++) assert.equal((await fetch(`${cam}/ISAPI/System/time`)).status, 200);
  assert.equal(fake.log.length - before, 3, 'no extra 401 round trips');
});

test('PUT round-trips the XML body and content type', async () => {
  const path = '/ISAPI/System/Video/inputs/channels/1/overlays';
  const xml = (await (await fetch(`${cam}${path}`)).text()).replace('<enabled>false</enabled>', '<enabled>true</enabled>');
  const res = await fetch(`${cam}${path}`, { method: 'PUT', body: xml, headers: { 'Content-Type': 'application/xml; charset=UTF-8' } });
  assert.equal(res.status, 200);
  assert.match(await res.text(), /<statusString>OK<\/statusString>/);
  const last = fake.log.at(-1);
  assert.equal(last.method, 'PUT');
  assert.equal(last.contentType, 'application/xml; charset=UTF-8');
  assert.equal(fake.docs.get(path), xml);
});

test('camera errors are passed through with their status', async () => {
  const res = await fetch(`${cam}/ISAPI/System/time`, { method: 'PUT', body: '<Time>REJECT</Time>' });
  assert.equal(res.status, 400);
  assert.match(await res.text(), /badXmlContent/);
});

test('policy blocks forbidden calls before they reach the camera', async () => {
  const before = fake.log.length;
  const res = await fetch(`${cam}/ISAPI/System/factoryReset?mode=full`, { method: 'PUT', body: '<x/>' });
  assert.equal(res.status, 403);
  assert.equal(fake.log.length, before);
});

test('unknown camera id is a 404', async () => {
  const res = await fetch(`${base}/isapi/nope/ISAPI/System/deviceInfo`);
  assert.equal(res.status, 404);
  const body = await res.json();
  assert.match(body.error, /Camera non trovata/);
  assert.equal(body.code, 'camera_unknown');
});

test('snapshots stream through', async () => {
  const res = await fetch(`${cam}/ISAPI/Streaming/channels/102/picture`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/svg+xml');
  assert.equal(res.headers.get('cache-control'), 'no-store');
  await res.text();
});

test('wrong credentials: 502, then cool-down without hitting the camera', async () => {
  const bad = await store.add({ name: 'Sbagliata', url: camUrl, username: 'test', password: 'wrong' });
  const first = await fetch(`${base}/isapi/${bad.id}/ISAPI/System/deviceInfo`);
  assert.equal(first.status, 502);
  await first.text();
  const before = fake.log.length;
  const second = await fetch(`${base}/isapi/${bad.id}/ISAPI/System/deviceInfo`);
  assert.equal(second.status, 502);
  const body = await second.json();
  assert.match(body.error, /Credenziali/);
  assert.equal(body.code, 'auth_cooldown');
  assert.equal(fake.log.length, before);
  await store.remove(bad.id);
});

test('cross-site writes and foreign Host headers are refused', async () => {
  const before = fake.log.length;
  const xsite = await fetch(`${cam}/ISAPI/System/time`, {
    method: 'PUT',
    body: '<Time/>',
    headers: { Origin: 'http://evil.example' },
  });
  assert.equal(xsite.status, 403);
  await xsite.text();
  assert.equal(fake.log.length, before);

  // DNS rebinding: the page is served under another name that points at 127.0.0.1.
  const { request } = await import('node:http');
  const status = await new Promise((resolve, reject) => {
    const r = request(`${cam}/ISAPI/System/deviceInfo`, { headers: { Host: 'evil.example' } }, (res) => {
      res.resume();
      resolve(res.statusCode);
    });
    r.on('error', reject);
    r.end();
  });
  assert.equal(status, 421);
});

test('static files and traversal', async () => {
  const index = await fetch(`${base}/`);
  assert.equal(index.status, 200);
  assert.match(await index.text(), /<cam-app>/);
  const js = await fetch(`${base}/js/isapi.js`);
  assert.match(js.headers.get('content-type'), /javascript/);
  await js.text();
  const evil = await fetch(`${base}/..%2fserver.js`);
  assert.equal(evil.status, 404);
  await evil.text();
});

test('event stream passes through without the request timeout', async () => {
  const ctrl = new AbortController();
  const res = await fetch(`${cam}/ISAPI/Event/notification/alertStream`, { signal: ctrl.signal });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /multipart\/mixed/);
  const reader = res.body.getReader();
  const { value } = await reader.read();
  assert.match(Buffer.from(value).toString(), /<eventType>VMD<\/eventType>/);
  ctrl.abort();
});

test('configuration backup: needs the encrypted backup password, download and large restore', async () => {
  // Straight through the proxy the camera refuses: it wants a secretkey.
  const plain = await fetch(`${cam}/ISAPI/System/configurationData`);
  assert.equal(plain.status, 400);
  assert.match(await plain.text(), /cfgFileSecretKeyError/);
  const rawPut = await fetch(`${cam}/ISAPI/System/configurationData`, { method: 'PUT', body: 'x' });
  assert.equal(rawPut.status, 403, 'restore only through the dedicated endpoint');
  await rawPut.text();

  const id = store.list()[0].id;
  const json = { 'Content-Type': 'application/json' };
  const missing = await fetch(`${base}/api/cameras/${id}/backup`, { method: 'POST', headers: json, body: '{}' });
  assert.equal(missing.status, 422);
  assert.equal((await missing.json()).code, 'backup_password_required');

  const down = await fetch(`${base}/api/cameras/${id}/backup`, { method: 'POST', headers: json, body: JSON.stringify({ password: 'Backup-2026' }) });
  assert.equal(down.status, 200);
  assert.equal(down.headers.get('content-type'), 'application/octet-stream');
  assert.equal(Buffer.from(await down.arrayBuffer()).toString(), 'FAKECONFIG v1\n');
  assert.equal(fake.lastBackupPassword, 'Backup-2026', 'the camera decrypted the same password');

  // Bigger than the 1 MB limit for normal requests.
  const big = Buffer.concat([Buffer.from('FAKECONFIG v2\n'), Buffer.alloc(3 * 1024 * 1024, 7)]);
  const up = await fetch(`${base}/api/cameras/${id}/restore`, {
    method: 'POST',
    body: big,
    headers: { 'Content-Type': 'application/octet-stream', 'X-Backup-Password': encodeURIComponent('Backup-2026') },
  });
  assert.equal(up.status, 200);
  await up.json();
  assert.equal(fake.config.length, big.length);

  const refused = await fetch(`${base}/api/cameras/${id}/restore`, {
    method: 'POST',
    body: Buffer.from('not a backup'),
    headers: { 'X-Backup-Password': 'x' },
  });
  assert.equal(refused.status, 502);
  assert.equal((await refused.json()).code, 'camera_refused');

  const tooBigElsewhere = await fetch(`${cam}/ISAPI/System/time`, { method: 'PUT', body: big });
  assert.equal(tooBigElsewhere.status, 413);
  await tooBigElsewhere.text();
});

test('user management needs the administrator password, reboot goes through', async () => {
  const user = (loginPassword) => `<User><id>2</id><userName>pannello</userName><password>Operatore2026</password><userLevel>Operator</userLevel><loginPassword>${loginPassword}</loginPassword></User>`;
  let res = await fetch(`${cam}/ISAPI/Security/users`, { method: 'POST', body: user('sbagliata') });
  assert.equal(res.status, 400);
  assert.match(await res.text(), /loginPasswordError/);
  res = await fetch(`${cam}/ISAPI/Security/users`, { method: 'POST', body: user('test-pass') });
  assert.equal(res.status, 200);
  await res.text();
  assert.deepEqual(fake.users.map((u) => u.userName), ['test', 'pannello']);
  res = await fetch(`${cam}/ISAPI/Security/users/2`, { method: 'DELETE', body: '<User><loginPassword>test-pass</loginPassword></User>' });
  assert.equal(res.status, 200);
  await res.text();
  assert.equal(fake.users.length, 1);

  res = await fetch(`${cam}/ISAPI/System/reboot`, { method: 'PUT' });
  assert.equal(res.status, 200);
  await res.text();
  assert.equal(fake.reboots, 1);
});

test('email test: POST goes through and the outcome comes back', async () => {
  const send = (body) => fetch(`${cam}/ISAPI/System/Network/mailing/test`, { method: 'POST', body, headers: { 'Content-Type': 'application/xml' } });
  let res = await send('<mailingTestDescription><hostName>smtp-relay.example</hostName><password>giusta</password></mailingTestDescription>');
  assert.equal(res.status, 200);
  assert.match(await res.text(), /<errorDescription>ok</);
  res = await send('<mailingTestDescription><hostName>smtp-relay.example</hostName><password>sbagliata</password></mailingTestDescription>');
  assert.match(await res.text(), /password error/);
});

test('backup password longer than 16 characters is refused before reaching the camera', async () => {
  const id = store.list()[0].id;
  const res = await fetch(`${base}/api/cameras/${id}/backup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'x'.repeat(17) }),
  });
  assert.equal(res.status, 422);
  assert.equal((await res.json()).code, 'backup_password_too_long');
});
