// Pure helpers behind the Motion, events and Users pages.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toScreen, fromScreen, addPoint, removePoint, polygonArea, selfIntersects, defaultArea } from '../public/js/regions.js';
import { normalizeTime, checkDay, ALWAYS } from '../public/js/schedule.js';
import { extractAlerts, parseAlert, isHeartbeat } from '../public/js/alerts.js';
import { checkPassword } from '../public/js/password.js';

test('area coordinates: camera grid (Y up) ↔ screen fractions (Y down)', () => {
  assert.deepEqual(toScreen({ x: 50, y: 750 }), [0.05, 0.25]);
  assert.deepEqual(fromScreen(0.05, 0.25), { x: 50, y: 750 });
  assert.deepEqual(fromScreen(-0.2, 1.3), { x: 0, y: 0 }, 'clamped to the picture');
});

test('area editing: add/remove points, area, self-intersection', () => {
  const sq = defaultArea();
  assert.equal(polygonArea(sq), 250_000);
  const five = addPoint(sq);
  assert.equal(five.length, 5);
  assert.equal(polygonArea(five), 250_000, 'midpoint keeps the shape');
  assert.equal(removePoint(five, 2).length, 4);
  assert.equal(removePoint(sq, 0).length, 4, 'never fewer than 4 points');
  assert.ok(!selfIntersects(sq));
  const bowtie = [{ x: 0, y: 0 }, { x: 1000, y: 1000 }, { x: 1000, y: 0 }, { x: 0, y: 1000 }];
  assert.ok(selfIntersects(bowtie));
});

test('schedule: times and day checks', () => {
  assert.equal(normalizeTime('7:30'), '07:30');
  assert.equal(normalizeTime('24:00:00'), '24:00');
  assert.equal(normalizeTime('25:00'), null);
  assert.equal(checkDay([{ begin: '00:00', end: '24:00' }]), null);
  assert.equal(checkDay([{ begin: '08:00', end: '12:00' }, { begin: '14:00', end: '18:00' }]), null);
  assert.equal(checkDay([{ begin: '12:00', end: '08:00' }]), 'order');
  assert.equal(checkDay([{ begin: '08:00', end: '12:00' }, { begin: '11:00', end: '13:00' }]), 'overlap');
  assert.equal(checkDay([{ begin: '8', end: '12:00' }]), 'time');
  assert.equal(checkDay([{ begin: '24:00', end: '24:00' }]), 'time');
  assert.equal(Object.keys(ALWAYS()).length, 7);
});

test('alert stream: complete parts across chunk boundaries, heartbeats', () => {
  const a = (type, state) =>
    `--boundary\r\nContent-Type: application/xml\r\n\r\n<EventNotificationAlert version="2.0"><eventType>${type}</eventType><eventState>${state}</eventState><dateTime>2026-11-06T10:00:00</dateTime><targetType>human</targetType></EventNotificationAlert>\r\n`;
  const stream = a('VMD', 'active') + a('videoloss', 'inactive');
  let buffer = '';
  const got = [];
  for (let i = 0; i < stream.length; i += 37) {
    const out = extractAlerts(buffer + stream.slice(i, i + 37));
    buffer = out.rest;
    got.push(...out.alerts.map(parseAlert));
  }
  assert.equal(got.length, 2);
  assert.deepEqual([got[0].type, got[0].state, got[0].targets], ['VMD', 'active', ['human']]);
  assert.ok(isHeartbeat(got[1]));
  assert.ok(buffer.length <= 64, 'leftover junk does not grow');
});

test('camera password rules', () => {
  assert.equal(checkPassword('short1'), 'length');
  assert.equal(checkPassword('abcdefghijklmnopq'), 'length');
  assert.equal(checkPassword('onlylowercase'), 'kinds');
  assert.equal(checkPassword('Pannello2026', 'pannello'), 'username');
  assert.equal(checkPassword('Pannello2026', 'operatore'), null);
});
