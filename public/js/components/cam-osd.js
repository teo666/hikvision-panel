// <cam-osd>: on-screen display. Edit date/time, channel name and free texts,
// and drag them over a snapshot to position them.
//
// Camera coordinates live on a normalized screen (704x576 here) with the
// origin at the BOTTOM-left: positionY grows upwards.

import { get, put, val, setVal, el, addChild, capOf, snapshotUrl } from '../isapi.js';
import { esc, options, errorText } from '../dom.js';
import { t } from '../i18n.js';
import { formatOsdDate } from '../osd-format.js';

const OVERLAYS = '/ISAPI/System/Video/inputs/channels/1/overlays';
const OVERLAYS_CAP = `${OVERLAYS}/capabilities`;
const TEXTS = `${OVERLAYS}/text`;

// Camera option values with a translation (osd.opt.<value>); the others are shown as they are.
const OPTION_LABELS = ['12hour', '24hour', 'auto', 'customize', 'adaptive', 'alignRight', 'alignLeft', 'allLeft', 'allRight'];
const optionLabels = () => Object.fromEntries(OPTION_LABELS.map((v) => [v, t(`osd.opt.${v}`)]));

class CamOsd extends HTMLElement {
  get dirty() {
    return this.bar?.dirty ?? false;
  }

  connectedCallback() {
    this.innerHTML = `<h1>${esc(t('nav.osd'))}</h1><div class="osd-body"><p class="muted">${esc(t('common.loading'))}</p></div><cam-save-bar></cam-save-bar>`;
    this.body = this.querySelector('.osd-body');
    this.bar = this.querySelector('cam-save-bar');
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
      const [doc, cap, texts] = await Promise.all([get(OVERLAYS), get(OVERLAYS_CAP).catch(() => null), get(TEXTS)]);
      this.doc = doc;
      this.cap = cap;
      this.texts = texts;
      this.screenW = Number(val(doc, 'normalizedScreenWidth')) || 704;
      this.screenH = Number(val(doc, 'normalizedScreenHeight')) || 576;
      this.maxTexts = Number(el(doc, 'TextOverlayList')?.getAttribute('size')) || 4;
      this.step = Number(val(cap ?? doc, 'minOSDMoveValue')) || 1;
      this.render();
    } catch (err) {
      this.body.innerHTML = `<p class="error">${esc(errorText(err))}</p>`;
      this.bar.hidden = true;
    }
  }

  // --- model access ---------------------------------------------------------

  /** Overlays shown on the preview: {key, el, label}. */
  items() {
    const out = [];
    const dt = el(this.doc, 'DateTimeOverlay');
    if (dt && val(dt, 'enabled') === 'true') {
      out.push({
        key: 'date',
        el: dt,
        label: formatOsdDate(new Date(), val(dt, 'dateStyle'), val(dt, 'timeStyle'), val(dt, 'displayWeek') === 'true'),
      });
    }
    const ch = el(this.doc, 'channelNameOverlay');
    if (ch && val(ch, 'enabled') === 'true') out.push({ key: 'name', el: ch, label: val(ch, 'name') });
    this.textEls().forEach((text, i) => {
      if (val(text, 'enabled') === 'true' && val(text, 'displayText')) out.push({ key: `text${i}`, el: text, label: val(text, 'displayText') });
    });
    return out;
  }

  textEls() {
    return [...this.texts.documentElement.children].filter((e) => e.localName === 'TextOverlay');
  }

  changed() {
    this.bar.dirty = true;
    this.renderPreview();
  }

  // --- rendering --------------------------------------------------------------

  render() {
    const d = this.doc;
    const dt = el(d, 'DateTimeOverlay');
    const ch = el(d, 'channelNameOverlay');
    const capOpts = (sel, fallback) => capOf(this.cap, sel)?.options ?? fallback;
    const check = (on) => (on === 'true' ? ' checked' : '');
    const colorMode = val(d, 'frontColorMode');
    const LABELS = optionLabels();

    this.bar.hidden = false;
    this.body.innerHTML = `
      <div class="osd-layout">
        <div>
          <div class="frame osd-preview">
            <img alt="${esc(t('common.preview'))}" src="${snapshotUrl(102)}">
            <div class="osd-layer"></div>
          </div>
          <p class="muted small">${esc(t('osd.dragHelp', { step: this.step }))}</p>
        </div>

        <form class="osd-form" autocomplete="off">
          <fieldset>
            <legend><label><input type="checkbox" data-bind="dt.enabled"${check(val(dt, 'enabled'))}> ${esc(t('osd.dateTime'))}</label></legend>
            <label>${esc(t('osd.dateFormat'))} <select data-bind="dt.dateStyle">${options(capOpts('DateTimeOverlay dateStyle', [val(dt, 'dateStyle')]), val(dt, 'dateStyle'))}</select></label>
            <label>${esc(t('osd.timeFormat'))} <select data-bind="dt.timeStyle">${options(capOpts('DateTimeOverlay timeStyle', [val(dt, 'timeStyle')]), val(dt, 'timeStyle'), LABELS)}</select></label>
            <label class="inline"><input type="checkbox" data-bind="dt.displayWeek"${check(val(dt, 'displayWeek'))}> ${esc(t('osd.showWeekday'))}</label>
          </fieldset>

          <fieldset>
            <legend><label><input type="checkbox" data-bind="ch.enabled"${check(val(ch, 'enabled'))}> ${esc(t('osd.channelName'))}</label></legend>
            <label>${esc(t('osd.text'))} <input type="text" maxlength="32" data-bind="ch.name" value="${esc(val(ch, 'name'))}"></label>
          </fieldset>

          <fieldset>
            <legend>${esc(t('osd.freeTexts'))} <span class="muted">${esc(t('osd.max', { max: this.maxTexts }))}</span></legend>
            <div class="osd-texts"></div>
            <button type="button" class="secondary" data-act="add-text">${esc(t('osd.addText'))}</button>
          </fieldset>

          <fieldset>
            <legend>${esc(t('osd.appearance'))}</legend>
            <label>${esc(t('osd.fontSize'))} <select data-bind="fontSize">${options(capOpts('fontSize', [val(d, 'fontSize')]), val(d, 'fontSize'), LABELS)}</select></label>
            <label>${esc(t('osd.color'))} <select data-bind="frontColorMode">${options(capOpts('frontColorMode', [colorMode]), colorMode, LABELS)}</select></label>
            <label class="color-row"${colorMode === 'customize' ? '' : ' hidden'}>${esc(t('osd.customColor'))}
              <input type="color" data-bind="frontColor" value="#${esc(val(d, 'frontColor') || '000000')}"></label>
            <label>${esc(t('osd.alignment'))} <select data-bind="alignment">${options(capOpts('alignment', [val(d, 'alignment')]), val(d, 'alignment'), LABELS)}</select></label>
            <label class="inline"><input type="checkbox" data-bind="transparent"${check(val(d, 'attribute transparent'))}> ${esc(t('osd.transparent'))}</label>
            <label class="inline"><input type="checkbox" data-bind="flashing"${check(val(d, 'attribute flashing'))}> ${esc(t('osd.flashing'))}</label>
          </fieldset>
        </form>
      </div>`;

    this.layer = this.querySelector('.osd-layer');
    const form = this.querySelector('form');
    form.addEventListener('input', (e) => this.onInput(e));
    form.addEventListener('change', (e) => this.onInput(e));
    form.addEventListener('submit', (e) => e.preventDefault());
    this.querySelector('[data-act=add-text]').addEventListener('click', () => this.addText());
    this.renderTexts();
    this.renderPreview();
  }

  renderTexts() {
    const box = this.querySelector('.osd-texts');
    const texts = this.textEls();
    box.innerHTML = texts.length
      ? texts
          .map(
            (text, i) => `
        <div class="osd-text-row">
          <input type="checkbox" aria-label="${esc(t('osd.showText', { n: i + 1 }))}" data-text="${i}" data-field="enabled"${val(text, 'enabled') === 'true' ? ' checked' : ''}>
          <input type="text" maxlength="44" aria-label="${esc(t('osd.textN', { n: i + 1 }))}" data-text="${i}" data-field="displayText" value="${esc(val(text, 'displayText'))}">
          <button type="button" class="icon" data-remove="${i}" aria-label="${esc(t('osd.removeText', { n: i + 1 }))}">✕</button>
        </div>`,
          )
          .join('')
      : `<p class="muted small">${esc(t('osd.noTexts'))}</p>`;
    for (const b of box.querySelectorAll('[data-remove]')) {
      b.addEventListener('click', () => {
        texts[Number(b.dataset.remove)].remove();
        this.renderTexts();
        this.changed();
      });
    }
    this.querySelector('[data-act=add-text]').disabled = texts.length >= this.maxTexts;
  }

  renderPreview() {
    const items = this.items();
    this.layer.innerHTML = items
      .map((it) => `<div class="osd-item" data-key="${it.key}" tabindex="0" role="button" aria-label="${esc(t('osd.move', { label: it.label }))}">${esc(it.label)}</div>`)
      .join('');
    for (const node of this.layer.children) {
      const it = items.find((x) => x.key === node.dataset.key);
      this.place(node, it.el);
      this.makeDraggable(node, it.el);
    }
  }

  place(node, overlayEl) {
    const x = Number(val(overlayEl, 'positionX')) || 0;
    const y = Number(val(overlayEl, 'positionY')) || 0;
    node.style.left = `${(x / this.screenW) * 100}%`;
    node.style.top = `${((this.screenH - y) / this.screenH) * 100}%`;
  }

  makeDraggable(node, overlayEl) {
    const move = (clientX, clientY, start) => {
      const r = this.layer.getBoundingClientRect();
      const snap = (v) => Math.round(v / this.step) * this.step;
      const nx = (clientX - start.dx - r.left) / r.width;
      const ny = (clientY - start.dy - r.top) / r.height;
      const x = Math.min(this.screenW, Math.max(0, snap(nx * this.screenW)));
      const y = Math.min(this.screenH, Math.max(0, snap(this.screenH - ny * this.screenH)));
      setVal(overlayEl, 'positionX', x);
      setVal(overlayEl, 'positionY', y);
      this.place(node, overlayEl);
    };
    node.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      node.setPointerCapture(e.pointerId);
      const nr = node.getBoundingClientRect();
      const start = { dx: e.clientX - nr.left, dy: e.clientY - nr.top };
      node.classList.add('dragging');
      const onMove = (ev) => move(ev.clientX, ev.clientY, start);
      const onUp = () => {
        node.classList.remove('dragging');
        node.removeEventListener('pointermove', onMove);
        node.removeEventListener('pointerup', onUp);
        node.removeEventListener('pointercancel', onUp);
        this.bar.dirty = true;
      };
      node.addEventListener('pointermove', onMove);
      node.addEventListener('pointerup', onUp);
      node.addEventListener('pointercancel', onUp);
    });
    // Keyboard: arrows move by one step (Shift: 4 steps).
    node.addEventListener('keydown', (e) => {
      const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key];
      if (!d) return;
      e.preventDefault();
      const k = this.step * (e.shiftKey ? 4 : 1);
      const x = Math.min(this.screenW, Math.max(0, Number(val(overlayEl, 'positionX')) + d[0] * k));
      const y = Math.min(this.screenH, Math.max(0, Number(val(overlayEl, 'positionY')) + d[1] * k));
      setVal(overlayEl, 'positionX', x);
      setVal(overlayEl, 'positionY', y);
      this.place(node, overlayEl);
      this.bar.dirty = true;
    });
  }

  // --- editing ----------------------------------------------------------------

  onInput(e) {
    const input = e.target;
    if (input.dataset.text !== undefined) {
      const textEl = this.textEls()[Number(input.dataset.text)];
      setVal(textEl, input.dataset.field, input.type === 'checkbox' ? input.checked : input.value);
      return this.changed();
    }
    const bind = input.dataset.bind;
    if (!bind) return;
    const value = input.type === 'checkbox' ? String(input.checked) : input.value;
    const [scope, field] = bind.includes('.') ? bind.split('.') : [null, bind];
    const root = scope === 'dt' ? el(this.doc, 'DateTimeOverlay') : scope === 'ch' ? el(this.doc, 'channelNameOverlay') : this.doc;
    if (field === 'frontColor') setVal(root, 'frontColor', value.replace('#', '').toUpperCase());
    else if (field === 'transparent' || field === 'flashing') setVal(root, `attribute ${field}`, value);
    else setVal(root, scope ? `:scope > ${field}` : `VideoOverlay > ${field}`, value);
    if (field === 'frontColorMode') this.querySelector('.color-row').hidden = value !== 'customize';
    this.changed();
  }

  addText() {
    const list = this.texts.documentElement;
    const used = new Set(this.textEls().map((o) => Number(val(o, 'id'))));
    let id = 1;
    while (used.has(id)) id++;
    const overlay = addChild(list, 'TextOverlay');
    addChild(overlay, 'id', id);
    addChild(overlay, 'enabled', 'true');
    // Stack new texts down the left side, below the top area.
    addChild(overlay, 'positionX', 0);
    addChild(overlay, 'positionY', Math.max(0, this.screenH - 64 - 32 * (id - 1)));
    addChild(overlay, 'displayText', t('osd.defaultText'));
    this.renderTexts();
    this.changed();
    this.querySelector(`.osd-texts [data-text="${this.textEls().length - 1}"][data-field=displayText]`)?.select();
  }

  async save() {
    const empty = this.textEls().find((o) => !val(o, 'displayText')?.trim());
    if (empty) throw new Error(t('osd.emptyText'));
    const a = await put(OVERLAYS, this.doc);
    const b = await put(TEXTS, this.texts);
    // Reload what the camera actually stored.
    await this.load();
    return { rebootRequired: a.rebootRequired || b.rebootRequired };
  }
}

customElements.define('cam-osd', CamOsd);
