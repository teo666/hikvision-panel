// ISAPI client for the browser. Talks to the panel's proxy (/isapi/<camera>/...),
// which adds the camera credentials. XML is handled natively (DOMParser).

import { t } from './i18n.js';

let cameraId = null;

/** Choose which camera the calls below go to. */
export function setCamera(id) {
  cameraId = id;
}

const base = () => {
  if (!cameraId) throw new IsapiError(t('errors.noCamera'));
  return `/isapi/${encodeURIComponent(cameraId)}`;
};

export class IsapiError extends Error {
  /** @param {string} message @param {{status?: number, statusString?: string, subStatusCode?: string, path?: string}} info */
  constructor(message, info = {}) {
    super(message);
    Object.assign(this, info);
  }
}

const parser = new DOMParser();
const serializer = new XMLSerializer();

/** Parse XML text, throwing on malformed input. */
export function parseXml(text) {
  const doc = parser.parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) throw new IsapiError(t('errors.badXml'));
  return doc;
}

/** Serialize, writing empty elements as <a></a> like the camera does (not <a/>). */
export const serializeXml = (doc) =>
  serializer.serializeToString(doc).replace(/<([A-Za-z_][\w.-]*)((?:\s+[^\s=>]+="[^"]*")*)\s*\/>/g, '<$1$2></$1>');

async function errorFrom(res, path) {
  const text = await res.text();
  const info = { status: res.status, path };
  if (/json/.test(res.headers.get('content-type') || '')) {
    try {
      // The panel's own errors carry a `code` that errorText() translates.
      const data = JSON.parse(text);
      return new IsapiError(data.error || t('errors.http', { status: res.status }), { ...info, code: data.code, params: data.params });
    } catch {}
  }
  try {
    const doc = parseXml(text);
    info.statusString = val(doc, 'statusString');
    info.subStatusCode = val(doc, 'subStatusCode');
  } catch {}
  const detail = [info.statusString, info.subStatusCode].filter(Boolean).join(' / ');
  return new IsapiError(t(detail ? 'errors.cameraStatusDetail' : 'errors.cameraStatus', { status: res.status, detail }), info);
}

/** GET an ISAPI resource and return it as an XML Document. */
export async function get(path, { signal } = {}) {
  const res = await fetch(base() + path, { signal, headers: { Accept: 'application/xml' } });
  if (!res.ok) throw await errorFrom(res, path);
  return parseXml(await res.text());
}

/**
 * PUT/POST an XML document. Resolves with the parsed ResponseStatus,
 * rejects with IsapiError if the camera refuses it.
 */
export async function put(path, doc, { method = 'PUT' } = {}) {
  const body = typeof doc === 'string' ? doc : serializeXml(doc);
  const res = await fetch(base() + path, {
    method,
    body,
    headers: { 'Content-Type': 'application/xml; charset=UTF-8' },
  });
  if (!res.ok) throw await errorFrom(res, path);
  const text = await res.text();
  if (!text.trim()) return { statusCode: 1 };
  const out = parseXml(text);
  const statusCode = Number(val(out, 'statusCode') ?? 1);
  // statusCode 1 = OK, 7 = OK but the camera needs a reboot.
  if (statusCode !== 1 && statusCode !== 7) throw await errorFrom(new Response(text, { status: res.status }), path);
  return { statusCode, rebootRequired: statusCode === 7 };
}

/** Read-modify-write: fetch, let `mutate` change the document, send it back. */
export async function update(path, mutate) {
  const doc = await get(path);
  await mutate(doc);
  return put(path, doc);
}

/** URL of a fresh JPEG snapshot for a streaming channel (101 main, 102 sub). */
export const snapshotUrl = (channel = 101) =>
  `${base()}/ISAPI/Streaming/channels/${channel}/picture?_=${Date.now()}`;

/** Proxy URL of any ISAPI path of the selected camera (streams, downloads). */
export const isapiUrl = (path) => base() + path;

// --- small XML helpers ------------------------------------------------------
// CSS selectors match local names in any namespace, so plain tag names work.

/** @returns {Element|null} */
export const el = (root, selector) => root.querySelector(selector);

/** Text of the first matching element, or undefined. */
export function val(root, selector) {
  const e = root.querySelector(selector);
  return e ? e.textContent : undefined;
}

/** Set the text of the first matching element. Throws if it doesn't exist. */
export function setVal(root, selector, value) {
  const e = root.querySelector(selector);
  if (!e) throw new IsapiError(t('errors.fieldNotFound', { field: selector }));
  e.textContent = String(value);
}

/** Create a child element in the parent's namespace, optionally with text. */
export function addChild(parent, name, text) {
  const doc = parent.ownerDocument;
  const child = doc.createElementNS(parent.namespaceURI, name);
  if (text !== undefined) child.textContent = String(text);
  parent.appendChild(child);
  return child;
}

/**
 * Describe the constraints a capabilities document gives for a field:
 * { options: string[] } for opt="a,b,c", { min, max } for numeric ranges.
 */
export function capOf(capDoc, selector) {
  const e = capDoc?.querySelector(selector);
  if (!e) return null;
  const cap = {};
  const opt = e.getAttribute('opt');
  if (opt) cap.options = opt.split(',');
  for (const k of ['min', 'max']) if (e.hasAttribute(k)) cap[k] = Number(e.getAttribute(k));
  const def = e.getAttribute('def');
  if (def !== null) cap.def = def;
  return cap;
}
