// Which ISAPI calls the panel may forward to the camera.
// Anything not listed here is refused by the proxy.

const READ = [
  '/ISAPI/System/',
  '/ISAPI/Image/',
  '/ISAPI/Streaming/',
  '/ISAPI/Event/',
  '/ISAPI/Smart/',
  '/ISAPI/ContentMgmt/',
  '/ISAPI/Security/users',
  '/ISAPI/Security/capabilities',
];

const WRITE = [
  '/ISAPI/System/Video/inputs/',
  '/ISAPI/System/time',
  '/ISAPI/System/Network/',
  '/ISAPI/System/Audio/',
  '/ISAPI/Image/',
  '/ISAPI/Streaming/channels/',
  '/ISAPI/Event/',
  '/ISAPI/Smart/',
  // Maintenance: the pages ask for confirmation before using these.
  '/ISAPI/System/reboot',
  '/ISAPI/Security/users',
];

// Never through the panel: unrecoverable from here, or device provisioning.
const DENY = [
  // Backup and restore go through /api/cameras/<id>/backup|restore (they need the encrypted secretkey).
  '/ISAPI/System/configurationData',
  '/ISAPI/System/factoryReset',
  '/ISAPI/System/updateFirmware',
  '/ISAPI/System/upgradeStatus',
  '/ISAPI/System/activate',
];

const SAFE_PATH = /^\/ISAPI\/[A-Za-z0-9_\-./]*$/;

/**
 * @param {string} method
 * @param {string} path ISAPI path without query string
 * @returns {{ ok: true } | { ok: false, reason: string, code: string, params?: object }}
 *   reason: Italian message; code: stable identifier the browser translates
 */
export function checkRequest(method, path) {
  if (!SAFE_PATH.test(path) || path.includes('..') || path.includes('//')) {
    return { ok: false, reason: 'Percorso non valido', code: 'invalid_path' };
  }
  const starts = (list) => list.some((p) => path === p.replace(/\/$/, '') || path.startsWith(p));
  const isRead = method === 'GET' || method === 'HEAD';
  if (!isRead && !['PUT', 'POST', 'DELETE'].includes(method)) {
    return { ok: false, reason: `Metodo ${method} non ammesso`, code: 'method_not_allowed', params: { method } };
  }
  if (starts(DENY) && !(isRead && starts(READ))) {
    return { ok: false, reason: 'Operazione non ammessa dal pannello', code: 'operation_forbidden' };
  }
  if (!starts(isRead ? READ : WRITE)) {
    return { ok: false, reason: 'Percorso ISAPI non ammesso', code: 'path_forbidden' };
  }
  return { ok: true };
}
