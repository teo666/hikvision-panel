// Translations: one dictionary per language in ./locales/, t() to look strings up.
// Pure apart from localStorage / navigator / document, so it runs in Node tests too.
//
//   t('cameras.editTitle', { name: 'Ingresso' })   → "Modifica Ingresso"
//   t('some.count', { count: 2 })                  → entry { one, other, zero? }: picks the plural form
//
// To add a language: create locales/<code>.js with the same keys as it.js, then add it to LANGUAGES.

import it from './locales/it.js';
import en from './locales/en.js';

/** code → { name: shown in the language menu (in that language), messages } */
export const LANGUAGES = {
  it: { name: 'Italiano', messages: it },
  en: { name: 'English', messages: en },
};

/** Used when the browser language isn't available and for keys a dictionary lacks. */
export const FALLBACK = 'it';

const STORAGE_KEY = 'hikvision-panel.lang';

/** First supported language among the wanted ones ('en-GB' → 'en'), else the fallback. */
export function pickLanguage(wanted = []) {
  for (const w of wanted) {
    const code = String(w ?? '').toLowerCase().split(/[-_]/)[0];
    if (Object.hasOwn(LANGUAGES, code)) return code;
  }
  return FALLBACK;
}

function storedLanguage() {
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

const nav = globalThis.navigator;
let lang = pickLanguage([storedLanguage(), ...(nav?.languages ?? [nav?.language])]);
if (globalThis.document) document.documentElement.lang = lang;

export const getLang = () => lang;

/** Switch language, remember it, update <html lang> and announce it with 'language-changed'. */
export function setLang(code) {
  lang = pickLanguage([code]);
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, lang);
  } catch {}
  if (globalThis.document) document.documentElement.lang = lang;
  globalThis.dispatchEvent?.(new CustomEvent('language-changed', { detail: { lang } }));
  return lang;
}

function lookup(key) {
  return LANGUAGES[lang].messages[key] ?? LANGUAGES[FALLBACK].messages[key];
}

/** Whether a key exists in the current language or in the fallback. */
export const has = (key) => lookup(key) !== undefined;

const pluralRules = {};
const plural = (n) => (pluralRules[lang] ??= new Intl.PluralRules(lang)).select(n);
const warned = new Set();

/**
 * Translate `key`, replacing {name} with params.name. A dictionary entry may be an object
 * of plural forms ({ zero?, one, other }), chosen by params.count. Missing keys return the key.
 */
export function t(key, params = {}) {
  let msg = lookup(key);
  if (msg === undefined) {
    if (!warned.has(key)) {
      warned.add(key);
      console.warn(`i18n: chiave mancante "${key}"`);
    }
    return key;
  }
  if (typeof msg === 'object') {
    const n = Number(params.count);
    msg = (n === 0 && msg.zero) || msg[plural(n)] || msg.other;
  }
  return msg.replace(/\{(\w+)\}/g, (m, name) => (params[name] ?? m).toString());
}
