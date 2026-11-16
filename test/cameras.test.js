// Camera store and the /api/cameras endpoints.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtemp, rm, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server.js';
import { createCameraStore, normalizeUrl, validateCamera } from '../lib/cameras.js';
import { createFakeCamera } from '../tools/fake-camera.js';

let fake, camUrl, dir;

async function listen(server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return `http://127.0.0.1:${server.address().port}`;
}

before(async () => {
  fake = createFakeCamera();
  camUrl = await listen(fake.server);
  dir = await mkdtemp(join(tmpdir(), 'hik-cams-'));
});

after(async () => {
  fake.server.close();
  await rm(dir, { recursive: true, force: true });
});

test('URL normalization', () => {
  assert.equal(normalizeUrl('192.168.1.229'), 'http://192.168.1.229');
  assert.equal(normalizeUrl(' http://192.168.1.229/ '), 'http://192.168.1.229');
  assert.equal(normalizeUrl('https://cam.local:8443'), 'https://cam.local:8443');
  for (const bad of ['', 'ftp://x', 'http://u:p@x', 'http://x/doc/index.html', 'http://x?a=1', 'http://']) {
    assert.throws(() => normalizeUrl(bad), undefined, bad);
  }
});

test('validation: required fields, partial edits keep the password', () => {
  assert.throws(() => validateCamera({ name: 'a', url: 'x', username: 'u' }), /Password/);
  assert.deepEqual(validateCamera({ name: 'B', password: '' }, { partial: true }), { name: 'B' });
});

test('store: .env seed, persistence, private file', async () => {
  const file = join(dir, 'a', 'cameras.json');
  const s = await createCameraStore({ file, seed: [{ name: 'Camera 1', url: camUrl, username: 'test', password: 'test-pass' }] });
  assert.equal(s.list().length, 1);
  assert.equal(s.list()[0].password, undefined, 'list never exposes passwords');
  assert.equal((await stat(file)).mode & 0o777, 0o600);
  const again = await createCameraStore({ file, seed: [{ name: 'Ignorata', url: camUrl, username: 'x', password: 'y' }] });
  assert.deepEqual(again.list(), s.list(), 'seed is used only when the file does not exist');
});

test('API: add tests the connection, list hides passwords, edit and delete', async () => {
  const file = join(dir, 'b', 'cameras.json');
  const store = await createCameraStore({ file });
  const app = createApp({ store });
  const base = await listen(app);
  const json = { 'Content-Type': 'application/json' };
  try {
    // Wrong password: refused, nothing saved.
    let res = await fetch(`${base}/api/cameras`, {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ name: 'Ingresso', url: camUrl, username: 'test', password: 'wrong' }),
    });
    assert.equal(res.status, 422);
    const refused = await res.json();
    assert.match(refused.error, /Utente o password errati/);
    assert.equal(refused.code, 'bad_credentials', 'stable code for the browser to translate');
    assert.equal(store.list().length, 0);

    // Right password: saved, with the model reported.
    res = await fetch(`${base}/api/cameras`, {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ name: 'Ingresso', url: camUrl, username: 'test', password: 'test-pass' }),
    });
    assert.equal(res.status, 201);
    const { camera, info } = await res.json();
    assert.equal(info.model, 'DS-2CD1043G2-LIU');
    assert.equal(camera.password, undefined);

    res = await fetch(`${base}/api/cameras`);
    const { cameras } = await res.json();
    assert.equal(cameras.length, 1);
    assert.ok(!JSON.stringify(cameras).includes('test-pass'));
    assert.ok((await readFile(file, 'utf8')).includes('test-pass'), 'stored on disk for the proxy');

    // Rename without touching the password; the connection test reuses the stored one.
    res = await fetch(`${base}/api/cameras/${camera.id}`, {
      method: 'PUT',
      headers: json,
      body: JSON.stringify({ name: 'Cortile', password: '' }),
    });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).camera.name, 'Cortile');

    // Test endpoint with an existing id.
    res = await fetch(`${base}/api/cameras/test`, { method: 'POST', headers: json, body: JSON.stringify({ id: camera.id }) });
    assert.equal(res.status, 200);
    await res.json();

    // Offline camera can be added on purpose with force.
    res = await fetch(`${base}/api/cameras`, {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ name: 'Spenta', url: 'http://127.0.0.1:9', username: 'a', password: 'b', force: true }),
    });
    assert.equal(res.status, 201);
    const spenta = (await res.json()).camera;

    res = await fetch(`${base}/api/cameras/${spenta.id}`, { method: 'DELETE' });
    assert.equal(res.status, 200);
    await res.json();
    assert.equal(store.list().length, 1);

    // JSON content type is required for writes (blocks simple cross-site form posts).
    res = await fetch(`${base}/api/cameras`, { method: 'POST', body: '{}' });
    assert.equal(res.status, 422);
    assert.equal((await res.json()).code, 'content_type_json');
  } finally {
    app.close();
  }
});
