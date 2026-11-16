// <cam-save-bar>: Save / Reset buttons with a clear outcome message.
// The parent sets `bar.dirty = true` on edits and assigns `bar.onsave`
// (async, throws on failure) and `bar.onreset`.

import { errorText, esc } from '../dom.js';
import { t } from '../i18n.js';

class CamSaveBar extends HTMLElement {
  #dirty = false;
  #busy = false;

  connectedCallback() {
    this.innerHTML = `
      <div class="savebar">
        <span class="savebar-msg" role="status" aria-live="polite"></span>
        <button type="button" class="secondary" data-act="reset">${esc(t('save.reset'))}</button>
        <button type="button" class="primary" data-act="save">${esc(t('save.save'))}</button>
      </div>`;
    this.msg = this.querySelector('.savebar-msg');
    this.saveBtn = this.querySelector('[data-act=save]');
    this.resetBtn = this.querySelector('[data-act=reset]');
    this.saveBtn.addEventListener('click', () => this.save());
    this.resetBtn.addEventListener('click', () => this.onreset?.());
    this.#render();
  }

  get dirty() {
    return this.#dirty;
  }

  set dirty(v) {
    this.#dirty = !!v;
    if (v) this.status('', t('save.unsaved'));
    this.#render();
  }

  status(kind, text) {
    if (!this.msg) return;
    this.msg.className = `savebar-msg ${kind}`;
    this.msg.innerHTML = esc(text);
  }

  async save() {
    if (this.#busy || !this.onsave) return;
    this.#busy = true;
    this.#render();
    this.status('', t('save.saving'));
    try {
      const result = await this.onsave();
      this.#dirty = false;
      this.status('ok', t(result?.rebootRequired ? 'save.savedReboot' : 'save.saved'));
    } catch (err) {
      this.status('err', t('save.failed', { error: errorText(err) }));
    } finally {
      this.#busy = false;
      this.#render();
    }
  }

  #render() {
    if (!this.saveBtn) return;
    this.saveBtn.disabled = this.#busy || !this.#dirty;
    this.resetBtn.disabled = this.#busy || !this.#dirty;
  }
}

customElements.define('cam-save-bar', CamSaveBar);
