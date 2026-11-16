// Tiny DOM helpers shared by the components.

import { t, has } from './i18n.js';

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escape a value for use inside HTML text or attributes. */
export const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

/** <option> list for a select, marking the current value. */
export const options = (values, current, labels = {}) =>
  values
    .map((v) => `<option value="${esc(v)}"${v === current ? ' selected' : ''}>${esc(labels[v] ?? v)}</option>`)
    .join('');

/**
 * Error for a JSON error answer of the panel's server ({ error, code, params? }).
 * `code` is stable and gets translated by errorText(); `error` (Italian) is the fallback.
 */
export function apiError(data, status) {
  const err = new Error(data?.error || t('errors.http', { status }));
  if (data?.code) Object.assign(err, { code: data.code, params: data.params });
  return err;
}

/** Human-readable message for any error, translated when the server gave a known code. */
export function errorText(err) {
  if (typeof err?.code === 'string' && has(`server.${err.code}`)) return t(`server.${err.code}`, err.params);
  return err?.message || String(err);
}
