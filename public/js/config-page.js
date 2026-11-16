// ConfigPage: base class for settings pages built from a declarative field list.
//
// A subclass declares (visible strings come from t(), so they follow the chosen language):
//   static get title() { return t('nav.image'); }
//   resources()  → [{ key, path, cap? }]          ISAPI documents to load (and their capabilities)
//   sections()   → [{ title, key, wide?, fields: [...] }] what to show; `key` picks the resource, `wide` spans the row
//   prepare?()                                       runs after loading, before rendering
//   validate?()  → string[]                         extra checks before saving
//   confirmSave?() → string | null                  message to confirm before saving
//   afterSave?()                                     e.g. refresh a preview
//
// Field spec:
//   { sel, label, type: 'bool'|'select'|'range'|'number'|'text'|'ipv4', help?, labels?, unit?,
//     when?: (doc) => boolean, validate?: (value, doc) => string|undefined,
//     format?/parse?: convert between XML text and what the input shows }
//   { type: 'custom', render(doc, cap) → html, bind(root, doc, changed) }
//
// Values are read from and written straight into the XML documents; saving sends
// each modified document back as a whole (read-modify-write).

import { get, put, val, setVal, el, capOf, serializeXml } from './isapi.js';
import { esc, errorText } from './dom.js';
import { t } from './i18n.js';
import { isIpv4 } from './net.js';
import './components/cam-save-bar.js';

let uid = 0;

export class ConfigPage extends HTMLElement {
  static title = '';

  get dirty() {
    return this.bar?.dirty ?? false;
  }

  connectedCallback() {
    this.innerHTML = `<h1>${esc(this.constructor.title)}</h1>
      <div class="page-intro"></div>
      <div class="page-body"><p class="muted">${esc(t('common.loading'))}</p></div>
      <cam-save-bar></cam-save-bar>`;
    this.intro = this.querySelector('.page-intro');
    this.body = this.querySelector('.page-body');
    this.bar = this.querySelector('cam-save-bar');
    this.bar.hidden = true;
    this.bar.onsave = () => this.save();
    this.bar.onreset = async () => {
      await this.load();
      this.bar.dirty = false;
      this.bar.status('', t('save.discarded'));
    };
    this.load();
  }

  async load() {
    try {
      const res = this.resources();
      const loaded = await Promise.all(
        res.map(async (r) => [r.key, await get(r.path), r.cap ? await get(r.cap).catch(() => null) : null]),
      );
      this.docs = Object.fromEntries(loaded.map(([k, d]) => [k, d]));
      this.caps = Object.fromEntries(loaded.map(([k, , c]) => [k, c]));
      this.modified = new Set();
      this.prepare?.();
      this.render();
      this.bar.hidden = false;
    } catch (err) {
      this.body.innerHTML = `<p class="error">${esc(errorText(err))}</p>`;
      this.bar.hidden = true;
    }
  }

  /** Mark a resource as changed and refresh conditional fields. */
  changed(key) {
    this.modified.add(key);
    this.bar.dirty = true;
    this.refreshVisibility();
  }

  render() {
    this.fieldEls = [];
    // One call: custom fields may keep state in their closures between render() and bind().
    const sections = this.sections();
    this.body.innerHTML = sections
      .map((s, si) => {
        const doc = this.docs[s.key];
        const cap = this.caps[s.key];
        const fields = s.fields
          .map((f, fi) => {
            const html = this.fieldHtml(f, doc, cap, `${si}-${fi}`);
            return html ? `<div class="field" data-field="${si}-${fi}">${html}</div>` : '';
          })
          .join('');
        if (!fields) return '';
        return `<fieldset class="card${s.wide ? ' wide' : ''}"${s.when ? ` data-section="${si}"` : ''}>
          <legend>${esc(s.title)}</legend>${s.help ? `<p class="muted small">${esc(s.help)}</p>` : ''}${fields}</fieldset>`;
      })
      .join('');

    sections.forEach((s, si) => {
      const doc = this.docs[s.key];
      s.fields.forEach((f, fi) => {
        const wrap = this.body.querySelector(`[data-field="${si}-${fi}"]`);
        if (!wrap) return;
        this.fieldEls.push({ f, doc, wrap, key: s.key });
        if (f.type === 'custom') return f.bind(wrap, doc, () => this.changed(s.key));
        const input = wrap.querySelector('[data-input]');
        const onEdit = () => {
          const raw = input.type === 'checkbox' ? String(input.checked) : input.value;
          const out = wrap.querySelector('output');
          if (out) out.textContent = raw + (f.unit ? ` ${f.unit}` : '');
          setVal(doc, f.sel, f.parse ? f.parse(raw) : raw);
          input.removeAttribute('aria-invalid');
          this.changed(s.key);
        };
        input.addEventListener(input.tagName === 'SELECT' || input.type === 'checkbox' ? 'change' : 'input', onEdit);
      });
    });
    this.sectionEls = sections.map((s, si) => ({ s, node: this.body.querySelector(`[data-section="${si}"]`) }));
    this.refreshVisibility();
  }

  refreshVisibility() {
    for (const { f, doc, wrap } of this.fieldEls) if (f.when) wrap.hidden = !f.when(doc);
    for (const { s, node } of this.sectionEls) if (node && s.when) node.hidden = !s.when(this.docs[s.key]);
  }

  fieldHtml(f, doc, cap, id) {
    if (f.type === 'custom') return f.render(doc, cap);
    if (!el(doc, f.sel)) return '';
    const raw = val(doc, f.sel);
    const shown = f.format ? f.format(raw) : raw;
    const c = capOf(cap, f.sel) ?? {};
    const inputId = `f${++uid}-${id}`;
    const help = f.help ? `<small class="muted">${esc(f.help)}</small>` : '';
    const label = (inner) => `<label for="${inputId}">${esc(f.label)}</label>${inner}${help}`;

    switch (f.type) {
      case 'bool':
        return `<label class="inline"><input id="${inputId}" data-input type="checkbox"${raw === 'true' ? ' checked' : ''}> ${esc(f.label)}</label>${help}`;
      case 'select': {
        const given = typeof f.options === 'function' ? f.options(doc, c.options) : f.options;
        let opts = [...new Set(given ?? c.options ?? [raw])];
        if (!opts.includes(raw)) opts = [raw, ...opts];
        const o = opts
          .map((v) => `<option value="${esc(v)}"${v === raw ? ' selected' : ''}>${esc(f.labels?.[v] ?? (f.format ? f.format(v) : v))}</option>`)
          .join('');
        return label(`<select id="${inputId}" data-input>${o}</select>`);
      }
      case 'range': {
        const min = f.min ?? c.min ?? 0;
        const max = f.max ?? c.max ?? 100;
        return label(`<div class="range"><input id="${inputId}" data-input type="range" min="${min}" max="${max}" step="${f.step ?? 1}" value="${esc(shown)}"><output>${esc(shown)}${f.unit ? ` ${esc(f.unit)}` : ''}</output></div>`);
      }
      case 'number': {
        const min = f.min ?? c.min;
        const max = f.max ?? c.max;
        return label(`<div class="with-unit"><input id="${inputId}" data-input type="number" inputmode="numeric"${min !== undefined ? ` min="${min}"` : ''}${max !== undefined ? ` max="${max}"` : ''} value="${esc(shown)}">${f.unit ? `<span class="muted">${esc(f.unit)}</span>` : ''}</div>`);
      }
      case 'ipv4':
      case 'text': {
        const max = f.maxLength ?? (f.type === 'text' ? c.max : 15);
        return label(`<input id="${inputId}" data-input type="text"${f.type === 'ipv4' ? ' inputmode="decimal" spellcheck="false"' : ''}${max ? ` maxlength="${max}"` : ''} value="${esc(shown)}">`);
      }
      default:
        throw new Error(t('field.unknownType', { type: f.type }));
    }
  }

  /** Field-level checks: numeric ranges, IPv4 format, custom validators. */
  collectErrors() {
    const errors = [];
    for (const { f, doc, wrap } of this.fieldEls) {
      if (f.type === 'custom' || wrap.hidden) continue;
      const input = wrap.querySelector('[data-input]');
      const value = val(doc, f.sel);
      let msg;
      if (f.type === 'number' && input.value !== '') {
        const n = Number(input.value);
        if (!Number.isFinite(n) || (input.min !== '' && n < Number(input.min)) || (input.max !== '' && n > Number(input.max))) {
          msg = t('field.outOfRange', { label: f.label, min: input.min || '…', max: input.max || '…' });
        }
      }
      if (f.type === 'number' && input.value === '') msg = t('field.required', { label: f.label });
      if (f.type === 'ipv4' && !isIpv4(value)) msg = t('field.invalidIpv4', { label: f.label });
      msg ??= f.validate?.(value, doc);
      if (msg) {
        errors.push(msg);
        input.setAttribute('aria-invalid', 'true');
      }
    }
    return [...errors, ...(this.validate?.() ?? [])];
  }

  async save() {
    const errors = this.collectErrors();
    if (errors.length) throw new Error(errors.join(' · '));
    const question = this.confirmSave?.();
    if (question && !confirm(question)) throw new Error(t('save.cancelled'));
    let rebootRequired = false;
    // A page may save several documents: say which one the camera refused,
    // and which ones are already stored.
    const part = (key) => [...new Set(this.sections().filter((s) => s.key === key).map((s) => s.title))].join(', ');
    const saved = [];
    for (const r of this.resources()) {
      if (!this.modified.has(r.key)) continue;
      let out;
      try {
        out = await put(r.path, this.docs[r.key]);
      } catch (err) {
        console.warn(`Salvataggio rifiutato: ${r.path}`, err, serializeXml(this.docs[r.key]));
        const msg = t('save.partFailed', { part: part(r.key), error: errorText(err) });
        throw new Error(saved.length ? `${msg} ${t('save.partSaved', { parts: saved.join(', ') })}` : msg);
      }
      rebootRequired ||= out.rebootRequired;
      this.modified.delete(r.key);
      saved.push(part(r.key));
    }
    await this.load();
    await this.afterSave?.();
    return { rebootRequired };
  }
}
