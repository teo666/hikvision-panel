import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkRequest } from '../lib/policy.js';

const ok = (m, p) => assert.equal(checkRequest(m, p).ok, true, `${m} ${p} should be allowed`);
const no = (m, p) => assert.equal(checkRequest(m, p).ok, false, `${m} ${p} should be refused`);

test('allows reading and editing configuration', () => {
  ok('GET', '/ISAPI/System/deviceInfo');
  ok('GET', '/ISAPI/Streaming/channels/101/picture');
  ok('PUT', '/ISAPI/System/Video/inputs/channels/1/overlays');
  ok('PUT', '/ISAPI/System/Video/inputs/channels/1/overlays/text');
  ok('PUT', '/ISAPI/Image/channels/1/supplementLight');
  ok('POST', '/ISAPI/Streaming/channels/101/dynamicCapWithCondition');
  ok('GET', '/ISAPI/Security/users');
});

test('allows maintenance: reboot, backup/restore, user management', () => {
  ok('PUT', '/ISAPI/System/reboot');
  ok('POST', '/ISAPI/Security/users');
  ok('PUT', '/ISAPI/Security/users/1');
  ok('DELETE', '/ISAPI/Security/users/2');
});

test('refuses unrecoverable operations and other security settings', () => {
  no('PUT', '/ISAPI/System/factoryReset');
  no('PUT', '/ISAPI/System/updateFirmware');
  no('PUT', '/ISAPI/System/configurationData'); // only through /api/cameras/<id>/restore
  no('PUT', '/ISAPI/System/activate');
  no('PUT', '/ISAPI/Security/adminAccesses');
  no('PUT', '/ISAPI/Security/webCertificate');
});

test('refuses unknown paths, methods and traversal', () => {
  no('GET', '/ISAPI/Unknown/thing');
  no('GET', '/doc/index.html');
  no('GET', '/ISAPI/System/../Security/users');
  no('GET', '/ISAPI/System//deviceInfo');
  no('PATCH', '/ISAPI/System/time');
  no('PUT', '/ISAPI/System/deviceInfo');
});

test('refusals carry a stable code and an Italian reason', () => {
  assert.deepEqual(checkRequest('PATCH', '/ISAPI/System/time'), {
    ok: false,
    reason: 'Metodo PATCH non ammesso',
    code: 'method_not_allowed',
    params: { method: 'PATCH' },
  });
  assert.equal(checkRequest('PUT', '/ISAPI/System/factoryReset').code, 'operation_forbidden');
  assert.equal(checkRequest('GET', '/ISAPI/Unknown/thing').code, 'path_forbidden');
  assert.equal(checkRequest('GET', '/ISAPI/System//x').code, 'invalid_path');
});
