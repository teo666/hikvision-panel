// Camera list (from the panel's API) and the currently selected camera.

import { setCamera } from './isapi.js';
import { apiError } from './dom.js';

const KEY = 'hikvision-panel.camera';

let cameras = [];
let currentId = null;

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api/cameras${path}`, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw apiError(data, res.status);
  return data;
}

export const list = () => cameras;
export const current = () => cameras.find((c) => c.id === currentId) ?? null;

/** Reload the list and keep (or pick) a current camera. */
export async function refresh() {
  ({ cameras } = await api(''));
  let wanted = currentId;
  if (!wanted) {
    try {
      wanted = localStorage.getItem(KEY);
    } catch {}
  }
  select(cameras.some((c) => c.id === wanted) ? wanted : cameras[0]?.id ?? null, { silent: true });
  dispatchEvent(new CustomEvent('cameras-changed'));
  return cameras;
}

export function select(id, { silent = false } = {}) {
  const changed = id !== currentId;
  currentId = id;
  setCamera(id);
  try {
    if (id) localStorage.setItem(KEY, id);
  } catch {}
  if (changed && !silent) dispatchEvent(new CustomEvent('camera-selected'));
}

export const test = (body) => api('/test', { method: 'POST', body });
export const add = (body) => api('', { method: 'POST', body });
export const update = (id, body) => api(`/${encodeURIComponent(id)}`, { method: 'PUT', body });
export const remove = (id) => api(`/${encodeURIComponent(id)}`, { method: 'DELETE' });
