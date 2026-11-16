import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatOsdDate } from '../public/js/osd-format.js';

const d = new Date(2026, 10, 6, 15, 4, 9); // Fri 6 Nov 2026 15:04:09

test('date styles', () => {
  assert.equal(formatOsdDate(d, 'YYYY-MM-DD', '24hour'), '2026-11-06 15:04:09');
  assert.equal(formatOsdDate(d, 'MM-DD-YYYY', '24hour'), '11-06-2026 15:04:09');
  assert.equal(formatOsdDate(d, 'DD-MM-YYYY', '24hour', true), '06-11-2026 Fri 15:04:09');
  assert.equal(formatOsdDate(d, 'CHR-YYYY/MM/DD', '24hour'), '2026年11月06日 15:04:09');
});

test('12 hour clock', () => {
  assert.equal(formatOsdDate(d, 'YYYY-MM-DD', '12hour'), '2026-11-06 03:04:09 PM');
  assert.equal(formatOsdDate(new Date(2026, 0, 1, 0, 5, 0), 'YYYY-MM-DD', '12hour'), '2026-01-01 12:05:00 AM');
});
