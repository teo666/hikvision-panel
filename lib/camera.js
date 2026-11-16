// Camera client: fetch() with Digest auth and a cached challenge.

import { parseChallenge, buildAuthorization } from './digest.js';

export class AuthError extends Error {
  code = 'auth_cooldown';
}

/**
 * @param {object} o
 * @param {string} o.baseUrl e.g. http://192.168.1.229
 * @param {string} o.username
 * @param {string} o.password
 * @param {number} [o.authCooldownMs] after rejected credentials, stop calling the
 *   camera for this long: Hikvision locks the account after a few bad attempts.
 */
export function createCamera({ baseUrl, username, password, authCooldownMs = 60_000 }) {
  let challenge = null;
  let nc = 0;
  let blockedUntil = 0;

  const authHeader = (method, uri) =>
    buildAuthorization({ challenge, method, uri, username, password, nc: ++nc });

  /**
   * @param {string} method
   * @param {string} uri path + query, e.g. /ISAPI/System/deviceInfo
   * @param {{ body?: Buffer|string, headers?: Record<string,string>, signal?: AbortSignal }} [opts]
   * @returns {Promise<Response>}
   */
  async function request(method, uri, { body, headers = {}, signal } = {}) {
    if (Date.now() < blockedUntil) {
      throw new AuthError('Credenziali della camera rifiutate: nuovo tentativo tra poco');
    }
    const send = () =>
      fetch(baseUrl + uri, {
        method,
        body: method === 'GET' || method === 'HEAD' ? undefined : body,
        headers: { ...headers, ...(challenge ? { Authorization: authHeader(method, uri) } : {}) },
        signal,
        redirect: 'manual',
      });

    let res = await send();
    if (res.status !== 401) return res;

    // First request, or the cached nonce expired: retry once with the new challenge.
    const fresh = parseChallenge(res.headers.get('www-authenticate'));
    if (!fresh) return res;
    challenge = fresh;
    nc = 0;
    await res.body?.cancel();
    res = await send();
    if (res.status === 401) {
      blockedUntil = Date.now() + authCooldownMs;
      challenge = null;
    }
    return res;
  }

  return { request };
}
