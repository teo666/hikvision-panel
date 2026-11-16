// HTTP Digest authentication (RFC 7616 / RFC 2617), client side.
// Only what Hikvision cameras use: qop="auth", MD5 or SHA-256.

import { createHash, randomBytes } from 'node:crypto';

/**
 * Parse a `WWW-Authenticate: Digest ...` header into its parameters.
 * @param {string} header
 * @returns {Record<string,string> | null}
 */
export function parseChallenge(header) {
  if (!header) return null;
  const m = header.match(/^\s*Digest\s+(.*)$/is);
  if (!m) return null;
  const params = {};
  const re = /([a-z0-9_-]+)\s*=\s*(?:"((?:[^"\\]|\\.)*)"|([^,\s]*))/gi;
  let p;
  while ((p = re.exec(m[1]))) {
    params[p[1].toLowerCase()] = p[2] !== undefined ? p[2].replace(/\\(.)/g, '$1') : p[3];
  }
  return params.nonce && params.realm !== undefined ? params : null;
}

const hashFor = (algorithm = 'MD5') => {
  const name = algorithm.replace(/-sess$/i, '').toUpperCase();
  const node = name === 'SHA-256' ? 'sha256' : name === 'MD5' ? 'md5' : null;
  if (!node) throw new Error(`Unsupported digest algorithm: ${algorithm}`);
  return (s) => createHash(node).update(s).digest('hex');
};

/**
 * Build the `Authorization` header value for one request.
 * @param {object} o
 * @param {Record<string,string>} o.challenge parsed challenge
 * @param {string} o.method HTTP method
 * @param {string} o.uri request-target (path + query)
 * @param {string} o.username
 * @param {string} o.password
 * @param {number} o.nc nonce count (1, 2, ...)
 * @param {string} [o.cnonce] client nonce (random if omitted)
 */
export function buildAuthorization({ challenge, method, uri, username, password, nc, cnonce }) {
  const algorithm = challenge.algorithm || 'MD5';
  const H = hashFor(algorithm);
  cnonce ??= randomBytes(8).toString('hex');
  const ncHex = nc.toString(16).padStart(8, '0');
  const qops = (challenge.qop || '').split(',').map((s) => s.trim()).filter(Boolean);
  const qop = qops.includes('auth') ? 'auth' : qops.length ? null : undefined;
  if (qop === null) throw new Error(`Unsupported qop: ${challenge.qop}`);

  let ha1 = H(`${username}:${challenge.realm}:${password}`);
  if (/-sess$/i.test(algorithm)) ha1 = H(`${ha1}:${challenge.nonce}:${cnonce}`);
  const ha2 = H(`${method}:${uri}`);
  const response = qop
    ? H(`${ha1}:${challenge.nonce}:${ncHex}:${cnonce}:${qop}:${ha2}`)
    : H(`${ha1}:${challenge.nonce}:${ha2}`);

  const q = (s) => `"${String(s).replace(/(["\\])/g, '\\$1')}"`;
  const parts = [
    `username=${q(username)}`,
    `realm=${q(challenge.realm)}`,
    `nonce=${q(challenge.nonce)}`,
    `uri=${q(uri)}`,
    `response=${q(response)}`,
  ];
  if (challenge.algorithm) parts.push(`algorithm=${challenge.algorithm}`);
  if (challenge.opaque !== undefined) parts.push(`opaque=${q(challenge.opaque)}`);
  if (qop) parts.push(`qop=${qop}`, `nc=${ncHex}`, `cnonce=${q(cnonce)}`);
  return `Digest ${parts.join(', ')}`;
}
