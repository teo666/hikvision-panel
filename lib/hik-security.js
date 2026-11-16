// Hikvision "security=1" parameter encryption, as done by the camera's own web UI.
// Needed for the configuration backup: the camera only exports/imports it with a
// `secretkey` (the backup password) encrypted with a key derived from the
// logged-in user's password.
//
//   key = sha256 chained keyIterateNum times over
//         (isIrreversible ? sha256(user + salt + password) : password) + "AaBbCcDd1234!@#$",
//         first 32 hex chars → AES-128 key
//   secretkey = hex( AES-128-CBC(key, iv, PKCS7)( base64(utf8(backupPassword)) ) )
//   iv = 32 hex chars, sent along as ?iv=

import { createHash, createCipheriv, randomBytes } from 'node:crypto';

const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex');

/**
 * @param {{ username: string, password: string, salt: string, iterations: number, irreversible: boolean }} o
 * @returns {string} 32 hex chars, or '' when the camera uses no iteration (no encryption)
 */
export function deriveAesKey({ username, password, salt, iterations, irreversible }) {
  if (!(iterations > 0)) return '';
  const base = irreversible ? sha256(username + salt + password) : password;
  let key = sha256(`${base}AaBbCcDd1234!@#$`);
  for (let i = 1; i < iterations; i++) key = sha256(key);
  return key.slice(0, 32);
}

/** Encrypt a parameter value the way the camera expects. Returns hex. */
export function encryptParam(value, keyHex, ivHex) {
  const plain = Buffer.from(value, 'utf8').toString('base64');
  const cipher = createCipheriv('aes-128-cbc', Buffer.from(keyHex, 'hex'), Buffer.from(ivHex, 'hex'));
  return Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]).toString('hex');
}

export const newIv = () => randomBytes(16).toString('hex');

/** Parse /ISAPI/Security/capabilities?username=… into the derivation parameters. */
export function parseSecurityCap(xml) {
  const tag = (n) => xml.match(new RegExp(`<${n}>([^<]*)</${n}>`))?.[1];
  const versions = xml.match(/<securityVersion\s+opt="([^"]*)"/)?.[1] ?? '';
  return {
    iterations: Number(tag('keyIterateNum') ?? 0),
    irreversible: tag('isIrreversible') === 'true',
    salt: tag('salt') ?? '',
    version: Number(versions.split(',').filter(Boolean).at(-1) ?? 0),
  };
}

/**
 * Build the query string for configurationData with an encrypted backup password.
 * @param {{ request: Function }} client camera client
 * @param {{ username: string, password: string }} account the panel's camera account
 * @param {string} backupPassword
 */
export async function configurationQuery(client, account, backupPassword) {
  const res = await client.request('GET', `/ISAPI/Security/capabilities?username=${encodeURIComponent(account.username)}`);
  const cap = parseSecurityCap(await res.text());
  const key = deriveAesKey({ ...account, ...cap });
  if (!key || !cap.version) {
    // Camera without parameter encryption: the backup password goes as it is.
    return `?secretkey=${encodeURIComponent(backupPassword)}`;
  }
  const iv = newIv();
  return `?secretkey=${encryptParam(backupPassword, key, iv)}&security=${cap.version}&iv=${iv}`;
}
