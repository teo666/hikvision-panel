import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { t, has, setLang, getLang, pickLanguage, LANGUAGES, FALLBACK } from '../public/js/i18n.js';

const it = LANGUAGES.it.messages;

// Keys added by a test exist only for that test.
const added = [];
function add(lang, key, value) {
  LANGUAGES[lang].messages[key] = value;
  added.push([lang, key]);
}
afterEach(() => {
  for (const [lang, key] of added.splice(0)) delete LANGUAGES[lang].messages[key];
  setLang(FALLBACK);
});

test('interpolation of {name} parameters', () => {
  setLang('it');
  assert.equal(t('cameras.editTitle', { name: 'Ingresso' }), 'Modifica Ingresso');
  assert.equal(t('errors.cameraStatusDetail', { status: 400, detail: 'badXmlContent' }), 'La camera ha risposto 400: badXmlContent');
  setLang('en');
  assert.equal(t('cameras.editTitle', { name: 'Ingresso' }), 'Edit Ingresso');
  // Numbers and zero are inserted; a missing parameter leaves the placeholder visible.
  assert.equal(t('osd.max', { max: 0 }), '(max 0)');
  assert.equal(t('cameras.editTitle'), 'Edit {name}');
});

test('missing key: the key itself comes back, with one warning', (ctx) => {
  const warn = ctx.mock.method(console, 'warn', () => {});
  assert.equal(has('does.not.exist'), false);
  assert.equal(t('does.not.exist'), 'does.not.exist');
  assert.equal(t('does.not.exist'), 'does.not.exist');
  assert.equal(warn.mock.callCount(), 1);
});

test('language fallback: unknown languages and missing translations use Italian', () => {
  assert.equal(setLang('fr'), FALLBACK);
  assert.equal(getLang(), 'it');
  add('it', 'test.onlyItalian', 'Solo in italiano');
  setLang('en');
  assert.equal(getLang(), 'en');
  assert.equal(t('test.onlyItalian'), 'Solo in italiano');
});

test('browser language detection', () => {
  assert.equal(pickLanguage(['en-GB', 'it-IT']), 'en');
  assert.equal(pickLanguage(['de-DE', 'en_US']), 'en');
  assert.equal(pickLanguage(['IT']), 'it');
  assert.equal(pickLanguage(['de', 'fr']), FALLBACK);
  assert.equal(pickLanguage([null, undefined]), FALLBACK);
  assert.equal(pickLanguage(['constructor']), FALLBACK, 'only real languages, not object properties');
});

test('plurals pick the form by count', () => {
  add('it', 'test.cameras', { zero: 'Nessuna camera', one: '{count} camera', other: '{count} camere' });
  add('en', 'test.cameras', { one: '{count} camera', other: '{count} cameras' });
  setLang('it');
  assert.equal(t('test.cameras', { count: 0 }), 'Nessuna camera');
  assert.equal(t('test.cameras', { count: 1 }), '1 camera');
  assert.equal(t('test.cameras', { count: 3 }), '3 camere');
  setLang('en');
  assert.equal(t('test.cameras', { count: 0 }), '0 cameras', 'no `zero` form: falls back to the plural rules');
  assert.equal(t('test.cameras', { count: 1 }), '1 camera');
});

test('every language has the same keys and placeholders as Italian', () => {
  const placeholders = (v) => JSON.stringify([...JSON.stringify(v).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort());
  for (const [code, { messages }] of Object.entries(LANGUAGES)) {
    assert.deepEqual(Object.keys(messages).sort(), Object.keys(it).sort(), `${code}: keys differ from it.js`);
    for (const key of Object.keys(it)) assert.equal(placeholders(messages[key]), placeholders(it[key]), `${code}: ${key}`);
  }
});

test('every error code the server sends has a translation', async () => {
  const { readFile } = await import('node:fs/promises');
  const sources = await Promise.all(['server.js', 'lib/cameras.js', 'lib/policy.js', 'lib/camera.js'].map((f) => readFile(f, 'utf8')));
  const codes = new Set();
  for (const src of sources) {
    for (const m of src.matchAll(/(?:sendError\(res, \d+, |ValidationError\([^)]*?, |code: |code = )'([a-z_]+)'/g)) codes.add(m[1]);
  }
  assert.ok(codes.size > 15, `found only ${codes.size} codes`);
  for (const code of codes) assert.ok(has(`server.${code}`), `missing server.${code}`);
});
