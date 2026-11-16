// Preview of the camera's date/time overlay text. Pure, so it runs in Node tests too.

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const pad = (n) => String(n).padStart(2, '0');

/**
 * @param {Date} d
 * @param {string} dateStyle e.g. YYYY-MM-DD, DD-MM-YYYY, CHR-YYYY/MM/DD
 * @param {string} timeStyle 12hour | 24hour
 * @param {boolean} week show the weekday
 */
export function formatOsdDate(d, dateStyle = 'YYYY-MM-DD', timeStyle = '24hour', week = false) {
  const Y = String(d.getFullYear());
  const M = pad(d.getMonth() + 1);
  const D = pad(d.getDate());
  const chr = dateStyle.startsWith('CHR-');
  const order = dateStyle.replace(/^CHR-/, '').split(/[-/]/);
  const parts = order.map((p) => (p === 'YYYY' ? Y : p === 'MM' ? M : D));
  const date = chr
    ? order.map((p, i) => parts[i] + (p === 'YYYY' ? '年' : p === 'MM' ? '月' : '日')).join('')
    : parts.join('-');

  let h = d.getHours();
  let suffix = '';
  if (timeStyle === '12hour') {
    suffix = h < 12 ? ' AM' : ' PM';
    h = h % 12 || 12;
  }
  const time = `${pad(h)}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${suffix}`;
  return [date, week ? DAYS[d.getDay()] : null, time].filter(Boolean).join(' ');
}
