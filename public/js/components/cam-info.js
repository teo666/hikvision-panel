// <cam-info>: device information and maintenance (reboot, configuration backup/restore).

import { get, put, val } from '../isapi.js';
import { esc, errorText, apiError } from '../dom.js';
import { t } from '../i18n.js';
import * as cams from '../cameras.js';

// deviceInfo fields shown, labelled by info.<field> in the dictionaries.
const FIELDS = ['deviceName', 'model', 'serialNumber', 'macAddress', 'firmwareVersion', 'firmwareReleasedDate', 'encoderVersion', 'bootVersion'];
const MAX_BACKUP = 32 * 1024 * 1024;

class CamInfo extends HTMLElement {
  #busy = false;
  #poll = null;

  get dirty() {
    return this.#busy;
  }

  async connectedCallback() {
    const title = `<h1>${esc(t('nav.info'))}</h1>`;
    this.innerHTML = `${title}<p class="muted">${esc(t('common.loading'))}</p>`;
    try {
      const [info, time] = await Promise.all([get('/ISAPI/System/deviceInfo'), get('/ISAPI/System/time')]);
      const rows = FIELDS.filter((k) => val(info, k) !== undefined)
        .map((k) => `<tr><th>${esc(t(`info.${k}`))}</th><td>${esc(val(info, k))}</td></tr>`)
        .join('');
      const cam = cams.current();
      const file = `${(cam?.name || 'camera').replace(/[^\w.-]+/g, '_')}-${new Date().toISOString().slice(0, 10)}.bin`;
      this.innerHTML = `
        ${title}
        <div class="page-body">
          <table class="kv">${rows}
            <tr><th>${esc(t('info.cameraTime'))}</th><td>${esc(val(time, 'localTime'))}
              <span class="muted">(${val(time, 'timeMode') === 'NTP' ? 'NTP' : esc(t('info.manual'))})</span></td></tr>
          </table>
          <section class="card maintenance">
            <h2>${esc(t('maint.title'))}</h2>
            <p class="maint-msg" role="status" aria-live="polite"></p>

            <h3>${esc(t('maint.reboot'))}</h3>
            <p class="muted small">${esc(t('maint.rebootHelp'))}</p>
            <div class="actions"><button type="button" class="secondary" data-act="reboot">${esc(t('maint.rebootNow'))}</button></div>

            <h3>${esc(t('maint.backup'))}</h3>
            <p class="muted small">${esc(t('maint.backupHelp'))}</p>
            <form class="maint-form" data-form="backup" autocomplete="off">
              <div class="field"><label for="bk-pass">${esc(t('maint.backupPassword'))}</label>
                <input id="bk-pass" name="password" type="password" autocomplete="new-password" maxlength="16" required></div>
              <div class="field"><label for="bk-pass2">${esc(t('maint.backupPasswordRepeat'))}</label>
                <input id="bk-pass2" name="password2" type="password" autocomplete="new-password" maxlength="16" required></div>
              <small class="muted">${esc(t('maint.backupPasswordHelp'))}</small>
              <div class="actions"><button type="submit" class="secondary">${esc(t('maint.download'))}</button></div>
            </form>

            <h3>${esc(t('maint.restore'))}</h3>
            <p class="muted small">${esc(t('maint.restoreHelp'))}</p>
            <form class="maint-form" data-form="restore" autocomplete="off">
              <div class="field"><label for="rs-file">${esc(t('maint.backupFile'))}</label>
                <input id="rs-file" name="file" type="file" required></div>
              <div class="field"><label for="rs-pass">${esc(t('maint.backupPassword'))}</label>
                <input id="rs-pass" name="password" type="password" autocomplete="off" maxlength="16" required></div>
              <div class="actions"><button type="submit" class="secondary danger">${esc(t('maint.restoreNow'))}</button></div>
            </form>
          </section>
        </div>`;
      this.msg = this.querySelector('.maint-msg');
      this.querySelector('[data-act=reboot]').addEventListener('click', () => this.reboot());
      this.querySelector('[data-form=backup]').addEventListener('submit', (e) => {
        e.preventDefault();
        this.backup(e.target, file);
      });
      this.querySelector('[data-form=restore]').addEventListener('submit', (e) => {
        e.preventDefault();
        this.restore(e.target);
      });
    } catch (err) {
      this.innerHTML = `${title}<p class="error">${esc(errorText(err))}</p>`;
    }
  }

  disconnectedCallback() {
    clearTimeout(this.#poll);
  }

  status(kind, text) {
    this.msg.className = `maint-msg ${kind}`;
    this.msg.textContent = text;
  }

  setBusy(busy) {
    this.#busy = busy;
    for (const b of this.querySelectorAll('.maintenance button, .maintenance input')) b.disabled = busy;
  }

  async reboot() {
    if (!confirm(t('maint.confirmReboot', { name: cams.current()?.name ?? '' }))) return;
    this.setBusy(true);
    try {
      await put('/ISAPI/System/reboot', '');
      this.waitOnline(t('maint.rebooting'));
    } catch (err) {
      this.status('err', errorText(err));
      this.setBusy(false);
    }
  }

  /**
   * The camera exports its configuration only with a backup password: the server
   * encrypts it for the camera (see lib/hik-security.js) and streams the file back.
   */
  async backup(form, filename) {
    const { password, password2 } = Object.fromEntries(new FormData(form));
    if (!password) return this.status('err', t('server.backup_password_required'));
    if (password !== password2) return this.status('err', t('users.mismatch'));
    const cam = cams.current();
    this.setBusy(true);
    this.status('', t('maint.downloading'));
    try {
      const res = await fetch(`/api/cameras/${encodeURIComponent(cam.id)}/backup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) throw apiError(await res.json().catch(() => ({})), res.status);
      const url = URL.createObjectURL(await res.blob());
      const a = Object.assign(document.createElement('a'), { href: url, download: filename });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      form.reset();
      this.status('ok', t('maint.downloaded', { file: filename }));
    } catch (err) {
      this.status('err', errorText(err));
    } finally {
      this.setBusy(false);
    }
  }

  async restore(form) {
    const file = form.elements.file.files[0];
    const password = form.elements.password.value;
    if (!file) return;
    if (file.size > MAX_BACKUP) return this.status('err', t('maint.tooLarge'));
    if (!password) return this.status('err', t('server.backup_password_required'));
    const cam = cams.current();
    if (!confirm(t('maint.confirmRestore', { file: file.name, name: cam?.name ?? '' }))) return;
    this.setBusy(true);
    this.status('', t('maint.uploading'));
    try {
      const res = await fetch(`/api/cameras/${encodeURIComponent(cam.id)}/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream', 'X-Backup-Password': encodeURIComponent(password) },
        body: file,
      });
      if (!res.ok) throw apiError(await res.json().catch(() => ({})), res.status);
      form.reset();
      this.waitOnline(t('maint.restored'));
    } catch (err) {
      this.status('err', errorText(err));
      this.setBusy(false);
    }
  }

  /** The camera goes away for a minute or two: poll until it answers again. */
  waitOnline(message) {
    const started = Date.now();
    const offlineSeen = { v: false };
    const tick = async () => {
      const secs = Math.round((Date.now() - started) / 1000);
      this.status('', t('maint.waiting', { message, secs }));
      try {
        await get('/ISAPI/System/deviceInfo', { signal: AbortSignal.timeout(4000) });
        // Answering right after the command means it hasn't gone down yet.
        if (offlineSeen.v || secs > 90) {
          this.status('ok', t('maint.backOnline', { secs }));
          this.setBusy(false);
          return;
        }
      } catch {
        offlineSeen.v = true;
      }
      if (secs > 300) {
        this.status('err', t('maint.notBack'));
        this.setBusy(false);
        return;
      }
      if (this.isConnected) this.#poll = setTimeout(tick, 5000);
    };
    this.#poll = setTimeout(tick, 5000);
  }
}

customElements.define('cam-info', CamInfo);
