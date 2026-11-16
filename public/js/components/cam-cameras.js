// <cam-cameras>: add, edit, test and remove cameras.

import * as cams from '../cameras.js';
import { esc, errorText, apiError } from '../dom.js';
import { t } from '../i18n.js';

const EMPTY = { id: null, name: '', url: 'http://', username: '', password: '' };

class CamCameras extends HTMLElement {
  #editing = null; // camera being edited, or EMPTY copy for a new one
  #status = new Map(); // id -> { ok, text }

  connectedCallback() {
    this.onChange = () => this.render();
    addEventListener('cameras-changed', this.onChange);
    addEventListener('camera-selected', this.onChange);
    this.render();
    if (!cams.list().length) this.edit(null);
    this.checkAll();
  }

  disconnectedCallback() {
    removeEventListener('cameras-changed', this.onChange);
    removeEventListener('camera-selected', this.onChange);
  }

  get dirty() {
    return !!this.#editing && this.querySelector('form')?.dataset.touched === 'true';
  }

  /** Ping every camera through the proxy to show whether it answers. */
  async checkAll() {
    await Promise.all(
      cams.list().map(async (c) => {
        try {
          const res = await fetch(`/isapi/${encodeURIComponent(c.id)}/ISAPI/System/deviceInfo`, { signal: AbortSignal.timeout(8000) });
          const text = await res.text();
          const model = text.match(/<model>([^<]*)<\/model>/)?.[1];
          this.#status.set(c.id, res.ok ? { ok: true, text: model || t('cameras.online') } : { ok: false, text: errorFrom(res.status, text) });
        } catch (err) {
          this.#status.set(c.id, { ok: false, text: err.name === 'TimeoutError' ? t('cameras.noAnswer') : errorText(err) });
        }
      }),
    );
    if (this.isConnected) this.renderList();
  }

  render() {
    this.innerHTML = `
      <h1>${esc(t('nav.cameras'))}</h1>
      <div class="cameras-list"></div>
      <div class="cameras-form"></div>
      <p class="muted small">${esc(t('cameras.credentialsNote')).replace('{file}', '<code>data/cameras.json</code>')}</p>`;
    this.renderList();
    this.renderForm();
  }

  renderList() {
    const box = this.querySelector('.cameras-list');
    if (!box) return;
    const list = cams.list();
    const currentId = cams.current()?.id;
    box.innerHTML = list.length
      ? `<div class="camera-cards">${list
          .map((c) => {
            const st = this.#status.get(c.id);
            return `
          <article class="card camera-card${c.id === currentId ? ' selected' : ''}">
            <header>
              <strong>${esc(c.name)}</strong>
              ${c.id === currentId ? `<span class="badge">${esc(t('cameras.inUse'))}</span>` : ''}
            </header>
            <p class="muted small">${esc(c.url)} · ${esc(c.username)}</p>
            <p class="status ${st ? (st.ok ? 'ok' : 'err') : 'muted'}">${esc(st ? st.text : t('cameras.checking'))}</p>
            <div class="actions">
              ${c.id === currentId ? '' : `<button type="button" class="primary" data-use="${esc(c.id)}">${esc(t('cameras.use'))}</button>`}
              <button type="button" class="secondary" data-edit="${esc(c.id)}">${esc(t('cameras.edit'))}</button>
              <button type="button" class="secondary danger" data-remove="${esc(c.id)}">${esc(t('cameras.remove'))}</button>
            </div>
          </article>`;
          })
          .join('')}</div>`
      : `<p class="muted">${esc(t('cameras.empty'))}</p>`;
    if (!this.#editing) box.insertAdjacentHTML('beforeend', `<button type="button" class="primary" data-add>${esc(t('cameras.add'))}</button>`);

    box.querySelector('[data-add]')?.addEventListener('click', () => this.edit(null));
    for (const b of box.querySelectorAll('[data-use]')) b.addEventListener('click', () => {
      cams.select(b.dataset.use);
      location.hash = '#/live';
    });
    for (const b of box.querySelectorAll('[data-edit]')) b.addEventListener('click', () => this.edit(b.dataset.edit));
    for (const b of box.querySelectorAll('[data-remove]')) b.addEventListener('click', () => this.removeCamera(b.dataset.remove));
  }

  edit(id) {
    const c = id ? cams.list().find((x) => x.id === id) : null;
    this.#editing = c ? { ...c, password: '' } : { ...EMPTY };
    this.renderList();
    this.renderForm();
    this.querySelector('.cameras-form input')?.focus();
  }

  renderForm() {
    const box = this.querySelector('.cameras-form');
    if (!box) return;
    const e = this.#editing;
    if (!e) {
      box.innerHTML = '';
      return;
    }
    const isNew = !e.id;
    box.innerHTML = `
      <form class="card camera-form" autocomplete="off" novalidate>
        <h2>${esc(isNew ? t('cameras.new') : t('cameras.editTitle', { name: e.name }))}</h2>
        <div class="field"><label for="cam-name">${esc(t('cameras.name'))}</label>
          <input id="cam-name" name="name" type="text" maxlength="60" required value="${esc(e.name)}" placeholder="${esc(t('cameras.namePlaceholder'))}"></div>
        <div class="field"><label for="cam-url">${esc(t('cameras.url'))}</label>
          <input id="cam-url" name="url" type="text" required spellcheck="false" value="${esc(e.url)}" placeholder="http://192.168.1.229"></div>
        <div class="field"><label for="cam-user">${esc(t('cameras.username'))}</label>
          <input id="cam-user" name="username" type="text" required spellcheck="false" autocomplete="off" value="${esc(e.username)}"></div>
        <div class="field"><label for="cam-pass">${esc(t('cameras.password'))}</label>
          <input id="cam-pass" name="password" type="password" autocomplete="new-password" ${isNew ? 'required' : `placeholder="${esc(t('cameras.passwordKeep'))}"`}></div>
        <p class="form-msg" role="status" aria-live="polite"></p>
        <div class="actions">
          <button type="button" class="secondary" data-act="cancel">${esc(t('common.cancel'))}</button>
          <button type="button" class="secondary" data-act="test">${esc(t('cameras.test'))}</button>
          <button type="submit" class="primary">${esc(isNew ? t('cameras.addSubmit') : t('common.save'))}</button>
          <button type="button" class="secondary" data-act="force" hidden>${esc(t('cameras.forceSave'))}</button>
        </div>
      </form>`;
    const form = box.querySelector('form');
    form.addEventListener('input', () => (form.dataset.touched = 'true'));
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      this.submit(false);
    });
    form.querySelector('[data-act=cancel]').addEventListener('click', () => {
      this.#editing = null;
      this.renderList();
      this.renderForm();
    });
    form.querySelector('[data-act=test]').addEventListener('click', () => this.testForm());
    form.querySelector('[data-act=force]').addEventListener('click', () => this.submit(true));
  }

  formData() {
    const form = this.querySelector('.camera-form');
    const data = Object.fromEntries(new FormData(form));
    if (this.#editing.id) data.id = this.#editing.id;
    return data;
  }

  message(kind, text) {
    const p = this.querySelector('.form-msg');
    p.className = `form-msg ${kind}`;
    p.textContent = text;
  }

  setBusy(busy) {
    for (const b of this.querySelectorAll('.camera-form button')) b.disabled = busy;
  }

  async testForm() {
    this.setBusy(true);
    this.message('', t('cameras.connecting'));
    try {
      const { info } = await cams.test(this.formData());
      this.message('ok', t('cameras.connected', { info: describe(info) }));
    } catch (err) {
      this.message('err', errorText(err));
    } finally {
      this.setBusy(false);
    }
  }

  async submit(force) {
    const data = this.formData();
    const id = data.id;
    delete data.id;
    this.setBusy(true);
    this.message('', t(force ? 'save.saving' : 'cameras.verifying'));
    try {
      const out = id ? await cams.update(id, { ...data, force }) : await cams.add({ ...data, force });
      this.#editing = null;
      if (!id && !cams.current()) cams.select(out.camera.id, { silent: true });
      if (out.info) this.#status.set(out.camera.id, { ok: true, text: out.info.model });
      else this.#status.delete(out.camera.id);
      await cams.refresh(); // re-renders through 'cameras-changed'
      this.checkAll();
    } catch (err) {
      this.message('err', errorText(err));
      // A camera that is offline right now can still be saved on purpose,
      // but not with credentials the camera just rejected.
      const forceBtn = this.querySelector('[data-act=force]');
      if (forceBtn) forceBtn.hidden = ['bad_credentials', 'auth_cooldown', 'password_missing'].includes(err.code);
    } finally {
      if (this.querySelector('.camera-form')) this.setBusy(false);
    }
  }

  async removeCamera(id) {
    const c = cams.list().find((x) => x.id === id);
    if (!c || !confirm(t('cameras.removeConfirm', { name: c.name }))) return;
    try {
      await cams.remove(id);
      if (cams.current()?.id === id) cams.select(null, { silent: true });
      this.#status.delete(id);
      await cams.refresh();
    } catch (err) {
      alert(errorText(err));
    }
  }
}

function describe(info) {
  return [info.model, info.deviceName, info.firmwareVersion].filter(Boolean).join(' · ');
}

function errorFrom(status, text) {
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {}
  return errorText(apiError(data, status));
}

customElements.define('cam-cameras', CamCameras);
