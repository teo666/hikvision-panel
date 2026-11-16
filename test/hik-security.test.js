import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash, createDecipheriv } from 'node:crypto';
import { deriveAesKey, encryptParam, parseSecurityCap } from '../lib/hik-security.js';

const sha = (s) => createHash('sha256').update(s).digest('hex');

test('key derivation follows the camera web UI', () => {
  // isIrreversible: sha256(user + salt + password), then "+ AaBbCcDd1234!@#$", chained 3 times
  let k = sha(`${sha('admin' + 'abc' + 'pw')}AaBbCcDd1234!@#$`);
  k = sha(sha(k));
  assert.equal(deriveAesKey({ username: 'admin', password: 'pw', salt: 'abc', iterations: 3, irreversible: true }), k.slice(0, 32));
  // reversible: the password itself
  assert.equal(deriveAesKey({ username: 'x', password: 'pw', salt: '', iterations: 1, irreversible: false }), sha('pwAaBbCcDd1234!@#$').slice(0, 32));
  assert.equal(deriveAesKey({ username: 'x', password: 'pw', salt: '', iterations: 0, irreversible: true }), '');
});

test('parameter encryption: AES-128-CBC over base64, hex out', () => {
  const key = '00112233445566778899aabbccddeeff';
  const iv = 'ffeeddccbbaa99887766554433221100';
  const hex = encryptParam('Pàssword!', key, iv);
  const d = createDecipheriv('aes-128-cbc', Buffer.from(key, 'hex'), Buffer.from(iv, 'hex'));
  const b64 = Buffer.concat([d.update(Buffer.from(hex, 'hex')), d.final()]).toString();
  assert.equal(Buffer.from(b64, 'base64').toString(), 'Pàssword!');
});

test('security capabilities parsing', () => {
  const cap = parseSecurityCap('<SecurityCap><securityVersion opt="1"/><keyIterateNum>100</keyIterateNum><isIrreversible>true</isIrreversible><salt>abc</salt></SecurityCap>');
  assert.deepEqual(cap, { iterations: 100, irreversible: true, salt: 'abc', version: 1 });
});
