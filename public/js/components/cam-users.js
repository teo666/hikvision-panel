// <cam-users>: camera accounts — list, add, change password or level, delete.
// The camera asks for the administrator's current password (loginPassword) to
// confirm every change; it is sent once and never stored.

import { get, put, isapiUrl, parseXml, val, IsapiError } from '../isapi.js';
import { esc, errorText } from '../dom.js';
import { t, has } from '../i18n.js';
import { checkPassword } from '../password.js';
import * as cams from '../cameras.js';

const USERS = '/ISAPI/Security/users';
const NS = 'http://www.hikvision.com/ver20/XMLSchema';
const LEVELS = ['Operator', 'Viewer'];

const level = (l) => (has(`users.level.${l}`) ? t(`users.level.${l}`) : l);
const xmlEsc = (s) => String(s).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]);

function userXml({ id, userName, password, userLevel, loginPassword }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<User version="2.0" xmlns="${NS}">
<id>${xmlEsc(id)}</id>
<userName>${xmlEsc(userName)}</userName>
${password ? `<password>${xmlEsc(password)}</password>\n` : ''}${userLevel ? `<userLevel>${xmlEsc(userLevel)}</userLevel>\n` : ''}<loginPassword>${xmlEsc(loginPassword)}</loginPassword>
</User>`;
}

class CamUsers extends HTMLElement {
  #users = [];
  #editing = null; // null, { new: true } or a user

  get dirty() {
    return !!this.#editing && this.querySelector('form')?.dataset.touched === 'true';
  }

  connectedCallback() {
    this.innerHTML = `<h1>${esc(t('nav.users'))}</h1><div class="users-body"><p class="muted">${esc(t('common.loading'))}</p></div>`;
    this.body = this.querySelector('.users-body');
    this.load();
  }

  async load() {
    try {
      const doc = await get(USERS);
      this.#users = [...doc.querySelectorAll('User')].map((u) => ({
        id: val(u, 'id'),
        userName: val(u, 'userName'),
        userLevel: val(u, 'userLevel'),
      }));
      this.render();
    } catch (err) {
      this.body.innerHTML = `<p class="error">${esc(errorText(err))}</p>`;
    }
  }

  render(message) {
    const panelUser = cams.current()?.username;
    const onlyAdmin = this.#users.length === 1 && this.#users[0].userLevel === 'Administrator';
    this.body.innerHTML = `
      <table class="kv users-table">
        <tr><th>${esc(t('users.user'))}</th><th>${esc(t('users.level'))}</th><th></th></tr>
        ${this.#users
          .map(
            (u) => `<tr>
          <td>${esc(u.userName)}${u.userName === panelUser ? ` <span class="badge">${esc(t('users.usedByPanel'))}</span>` : ''}</td>
          <td>${esc(level(u.userLevel))}</td>
          <td class="actions">
            <button type="button" class="secondary" data-edit="${esc(u.id)}">${esc(t('users.edit'))}</button>
            ${u.userLevel === 'Administrator' ? '' : `<button type="button" class="secondary danger" data-del="${esc(u.id)}">${esc(t('users.delete'))}</button>`}
          </td>
        </tr>`,
          )
          .join('')}
      </table>
      ${message ? `<p class="${message.kind}">${esc(message.text)}</p>` : ''}
      ${onlyAdmin && !this.#editing ? `<p class="warning">${esc(t('users.onlyAdmin'))}</p>` : ''}
      ${this.#editing ? this.formHtml() : `<button type="button" class="primary" data-add>${esc(t('users.add'))}</button>`}
      <p class="muted small">${esc(t('users.httpNote'))}</p>`;

    this.body.querySelector('[data-add]')?.addEventListener('click', () => this.edit({ new: true }));
    for (const b of this.body.querySelectorAll('[data-edit]')) b.addEventListener('click', () => this.edit(this.#users.find((u) => u.id === b.dataset.edit)));
    for (const b of this.body.querySelectorAll('[data-del]')) b.addEventListener('click', () => this.edit({ ...this.#users.find((u) => u.id === b.dataset.del), delete: true }));
    if (this.#editing) this.bindForm();
  }

  edit(user) {
    this.#editing = user;
    this.render();
    this.body.querySelector('form input:not([disabled])')?.focus();
  }

  formHtml() {
    const e = this.#editing;
    const isAdmin = e.userLevel === 'Administrator';
    const title = e.new ? t('users.addTitle') : e.delete ? t('users.deleteTitle', { name: e.userName }) : t('users.editTitle', { name: e.userName });
    const field = (id, label, input, help = '') =>
      `<div class="field"><label for="${id}">${esc(label)}</label>${input}${help ? `<small class="muted">${esc(help)}</small>` : ''}</div>`;
    return `
      <form class="card user-form" autocomplete="off" novalidate>
        <h2>${esc(title)}</h2>
        ${e.new ? field('u-name', t('users.user'), `<input id="u-name" name="userName" type="text" maxlength="32" required spellcheck="false">`) : ''}
        ${!e.delete && !isAdmin ? field('u-level', t('users.level'), `<select id="u-level" name="userLevel">${LEVELS.map((l) => `<option value="${l}"${l === (e.userLevel ?? 'Operator') ? ' selected' : ''}>${esc(level(l))}</option>`).join('')}</select>`, t('users.levelHelp')) : ''}
        ${!e.delete ? field('u-pass', e.new ? t('users.password') : t('users.newPassword'), `<input id="u-pass" name="password" type="password" autocomplete="new-password" ${e.new ? 'required' : `placeholder="${esc(t('users.passwordKeep'))}"`}>`, t('users.passwordRules')) : ''}
        ${!e.delete ? field('u-pass2', t('users.passwordRepeat'), `<input id="u-pass2" name="password2" type="password" autocomplete="new-password">`) : ''}
        ${field('u-login', t('users.adminPassword'), `<input id="u-login" name="loginPassword" type="password" autocomplete="current-password" required>`, t('users.adminPasswordHelp'))}
        <p class="form-msg" role="status" aria-live="polite"></p>
        <div class="actions">
          <button type="button" class="secondary" data-act="cancel">${esc(t('common.cancel'))}</button>
          <button type="submit" class="primary${e.delete ? ' danger-fill' : ''}">${esc(e.delete ? t('users.delete') : t('common.save'))}</button>
        </div>
      </form>`;
  }

  bindForm() {
    const form = this.body.querySelector('form');
    form.addEventListener('input', () => (form.dataset.touched = 'true'));
    form.querySelector('[data-act=cancel]').addEventListener('click', () => {
      this.#editing = null;
      this.render();
    });
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      this.submit(form);
    });
  }

  async submit(form) {
    const e = this.#editing;
    const data = Object.fromEntries(new FormData(form));
    const msg = form.querySelector('.form-msg');
    const fail = (text) => {
      msg.className = 'form-msg err';
      msg.textContent = text;
    };
    const userName = e.new ? data.userName?.trim() : e.userName;

    if (e.new && !/^[A-Za-z0-9_.@-]{1,32}$/.test(userName || '')) return fail(t('users.badName'));
    if (e.new && this.#users.some((u) => u.userName === userName)) return fail(t('users.exists'));
    if (!e.delete && (e.new || data.password)) {
      const code = checkPassword(data.password, userName);
      if (code) return fail(t(`users.weak.${code}`));
      if (data.password !== data.password2) return fail(t('users.mismatch'));
    }
    if (!data.loginPassword) return fail(t('users.needAdminPassword'));
    if (e.delete && !confirm(t('users.confirmDelete', { name: e.userName }))) return;

    for (const b of form.querySelectorAll('button')) b.disabled = true;
    msg.className = 'form-msg';
    msg.textContent = t('save.saving');
    try {
      if (e.delete) {
        await this.send('DELETE', `${USERS}/${encodeURIComponent(e.id)}`, userXml({ id: e.id, userName, loginPassword: data.loginPassword }));
      } else if (e.new) {
        const used = new Set(this.#users.map((u) => Number(u.id)));
        let id = 2;
        while (used.has(id)) id++;
        await put(USERS, userXml({ id, userName, password: data.password, userLevel: data.userLevel, loginPassword: data.loginPassword }), { method: 'POST' });
      } else {
        await put(
          `${USERS}/${encodeURIComponent(e.id)}`,
          userXml({ id: e.id, userName, password: data.password || null, userLevel: data.userLevel ?? e.userLevel, loginPassword: data.loginPassword }),
        );
      }
    } catch (err) {
      for (const b of form.querySelectorAll('button')) b.disabled = false;
      return fail(errorText(err));
    }

    // The panel's own account changed password: keep the stored one in sync,
    // or the next request would be refused (and could lock the account).
    let note = { kind: 'ok', text: e.delete ? t('users.deleted', { name: userName }) : t('users.saved', { name: userName }) };
    const cam = cams.current();
    if (!e.new && !e.delete && data.password && cam?.username === userName) {
      try {
        await cams.update(cam.id, { password: data.password });
        note = { kind: 'ok', text: t('users.panelUpdated') };
      } catch (err) {
        note = { kind: 'warning', text: t('users.panelUpdateFailed', { error: errorText(err) }) };
      }
    }
    this.#editing = null;
    await this.load();
    this.render(note);
  }

  /** DELETE with a body: put() only does PUT/POST with a document. */
  async send(method, path, body) {
    const res = await fetch(isapiUrl(path), { method, body, headers: { 'Content-Type': 'application/xml; charset=UTF-8' } });
    if (res.ok) return;
    const text = await res.text();
    let detail = '';
    try {
      const doc = parseXml(text);
      detail = [val(doc, 'statusString'), val(doc, 'subStatusCode')].filter(Boolean).join(' / ');
    } catch {
      try {
        detail = JSON.parse(text).error;
      } catch {}
    }
    throw new IsapiError(detail ? t('errors.cameraStatusDetail', { status: res.status, detail }) : t('errors.cameraStatus', { status: res.status }));
  }
}

customElements.define('cam-users', CamUsers);
