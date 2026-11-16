// Weekly schedules (Hikvision TimeBlockList). Pure, so it runs in Node tests too.
// Days are 1 = Monday … 7 = Sunday; times are "HH:MM", with "24:00" as end of day.

const TIME = /^([01]\d|2[0-3]):[0-5]\d$|^24:00$/;

export const isTime = (s) => TIME.test(s ?? '');
export const minutes = (s) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));

/** Accept "H:MM", "HH:MM:SS" as the camera sometimes sends; return "HH:MM" or null. */
export function normalizeTime(s) {
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(String(s ?? '').trim());
  if (!m) return null;
  const out = `${m[1].padStart(2, '0')}:${m[2]}`;
  return isTime(out) ? out : null;
}

/**
 * Check one day's ranges: valid times, start before end, no overlaps.
 * @param {{begin: string, end: string}[]} ranges
 * @returns {string|null} an error code: 'time', 'order', 'overlap'
 */
export function checkDay(ranges) {
  for (const r of ranges) {
    if (!isTime(r.begin) || !isTime(r.end) || r.begin === '24:00') return 'time';
    if (minutes(r.begin) >= minutes(r.end)) return 'order';
  }
  const sorted = [...ranges].sort((a, b) => minutes(a.begin) - minutes(b.begin));
  for (let i = 1; i < sorted.length; i++) {
    if (minutes(sorted[i].begin) < minutes(sorted[i - 1].end)) return 'overlap';
  }
  return null;
}

/** Ranges sorted by start time. */
export const sortRanges = (ranges) => [...ranges].sort((a, b) => minutes(a.begin) - minutes(b.begin));

/** The whole week, all day. */
export const ALWAYS = () => Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((d) => [d, [{ begin: '00:00', end: '24:00' }]]));
