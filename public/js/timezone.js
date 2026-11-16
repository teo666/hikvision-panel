// Hikvision time zone strings, e.g. "CST-1:00:00DST01:00:00,M3.5.0/02:00:00,M10.5.0/03:00:00".
// POSIX style: the sign is inverted (CST-1 means UTC+1).

export const EU_DST = 'DST01:00:00,M3.5.0/02:00:00,M10.5.0/03:00:00';

/** @returns {{ offsetMinutes: number, dst: string } | null} offset east of UTC */
export function parseTimeZone(tz) {
  const m = /^([A-Z]{3,})([+-])(\d{1,2}):(\d{2})(?::(\d{2}))?(.*)$/.exec(tz || '');
  if (!m) return null;
  const minutes = Number(m[3]) * 60 + Number(m[4]);
  return { offsetMinutes: m[2] === '-' ? minutes : -minutes, dst: m[6] || '' };
}

export function formatTimeZone(offsetMinutes, dst = '') {
  const sign = offsetMinutes > 0 ? '-' : '+';
  const abs = Math.abs(offsetMinutes);
  const hh = Math.floor(abs / 60);
  const mm = String(abs % 60).padStart(2, '0');
  return `CST${sign}${hh}:${mm}:00${dst}`;
}

/** "UTC+01:00" */
export function offsetLabel(offsetMinutes) {
  const sign = offsetMinutes < 0 ? '−' : '+';
  const abs = Math.abs(offsetMinutes);
  return `UTC${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

/** All offsets from UTC−12 to UTC+14, including the half/quarter hours in use. */
export const OFFSETS = [
  ...Array.from({ length: 27 }, (_, i) => (i - 12) * 60),
  -570, -210, 210, 270, 330, 345, 390, 525, 570, 630, 765,
].sort((a, b) => a - b);

/** ISO local time with offset for the camera, e.g. 2026-11-06T15:04:09+01:00 */
export function isoLocal(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${sign}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`
  );
}
