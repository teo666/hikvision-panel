import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isIpv4, isNetmask, sameSubnet } from '../public/js/net.js';
import { parseTimeZone, formatTimeZone, offsetLabel, EU_DST, isoLocal } from '../public/js/timezone.js';

test('IPv4 and netmask validation', () => {
  assert.ok(isIpv4('192.168.1.229'));
  for (const bad of ['192.168.1', '256.1.1.1', '1.2.3.4.5', '', undefined, '01.2.3.a']) assert.ok(!isIpv4(bad), bad);
  for (const m of ['255.255.255.0', '255.255.0.0', '255.255.255.252', '255.255.255.255', '128.0.0.0']) assert.ok(isNetmask(m), m);
  for (const m of ['255.0.255.0', '0.0.0.0', '255.255.255.1', 'x']) assert.ok(!isNetmask(m), m);
});

test('same subnet', () => {
  assert.ok(sameSubnet('192.168.1.229', '192.168.1.1', '255.255.255.0'));
  assert.ok(!sameSubnet('192.168.1.229', '192.168.2.1', '255.255.255.0'));
  assert.ok(sameSubnet('192.168.1.229', '192.168.2.1', '255.255.0.0'));
});

test('Hikvision time zones', () => {
  assert.deepEqual(parseTimeZone('CST-1:00:00'), { offsetMinutes: 60, dst: '' });
  assert.deepEqual(parseTimeZone(`CST-1:00:00${EU_DST}`), { offsetMinutes: 60, dst: EU_DST });
  assert.deepEqual(parseTimeZone('CST+5:30:00'), { offsetMinutes: -330, dst: '' });
  assert.equal(parseTimeZone('garbage'), null);
  assert.equal(formatTimeZone(60), 'CST-1:00:00');
  assert.equal(formatTimeZone(60, EU_DST), `CST-1:00:00${EU_DST}`);
  assert.equal(formatTimeZone(-300), 'CST+5:00:00');
  assert.equal(formatTimeZone(330), 'CST-5:30:00');
  assert.equal(formatTimeZone(0), 'CST+0:00:00');
  assert.equal(offsetLabel(60), 'UTC+01:00');
  assert.equal(offsetLabel(-210), 'UTC−03:30');
});

test('local ISO time carries the offset', () => {
  assert.match(isoLocal(new Date()), /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d[+-]\d\d:\d\d$/);
});
