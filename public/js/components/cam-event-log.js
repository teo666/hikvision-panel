// <cam-event-log>: events from the camera in real time (alertStream), newest first.
// Connects while visible, reconnects after errors, stops when removed.

import { isapiUrl } from '../isapi.js';
import { esc } from '../dom.js';
import { t, has } from '../i18n.js';
import { extractAlerts, parseAlert, isHeartbeat } from '../alerts.js';

const MAX = 50;
const STREAM = '/ISAPI/Event/notification/alertStream';

class CamEventLog extends HTMLElement {
  #ctrl = null;
  #events = [];
  #retry = null;

  connectedCallback() {
    this.innerHTML = `
      <section class="card wide event-log">
        <header class="event-log-head">
          <h2>${esc(t('events.title'))}</h2>
          <span class="status muted" role="status" aria-live="polite"></span>
          <button type="button" class="secondary" data-act="clear">${esc(t('events.clear'))}</button>
        </header>
        <p class="muted small">${esc(t('events.help'))}</p>
        <ol class="event-list"></ol>
      </section>`;
    this.status = this.querySelector('.status');
    this.list = this.querySelector('.event-list');
    this.querySelector('[data-act=clear]').addEventListener('click', () => {
      this.#events = [];
      this.render();
    });
    this.onVisibility = () => (document.hidden ? this.stop() : this.start());
    document.addEventListener('visibilitychange', this.onVisibility);
    this.render();
    this.start();
  }

  disconnectedCallback() {
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.stop();
  }

  stop() {
    clearTimeout(this.#retry);
    this.#ctrl?.abort();
    this.#ctrl = null;
  }

  async start() {
    if (this.#ctrl || !this.isConnected) return;
    const ctrl = (this.#ctrl = new AbortController());
    this.setStatus('', t('events.connecting'));
    try {
      const res = await fetch(isapiUrl(STREAM), { signal: ctrl.signal });
      if (!res.ok || !res.body) throw new Error(t('errors.http', { status: res.status }));
      this.setStatus('ok', t('events.connected'));
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        const out = extractAlerts(buffer + value);
        buffer = out.rest;
        for (const xml of out.alerts) this.add(parseAlert(xml));
      }
      throw new Error(t('events.closed'));
    } catch (err) {
      if (ctrl.signal.aborted) return;
      this.#ctrl = null;
      this.setStatus('err', t('events.retrying', { error: err.message }));
      this.#retry = setTimeout(() => this.start(), 5000);
    }
  }

  add(ev) {
    if (isHeartbeat(ev)) return;
    this.#events.unshift({ ...ev, at: new Date() });
    this.#events.length = Math.min(this.#events.length, MAX);
    this.render();
  }

  setStatus(kind, text) {
    this.status.className = `status ${kind || 'muted'}`;
    this.status.textContent = text;
  }

  render() {
    const label = (ev) => (has(`events.type.${ev.type}`) ? t(`events.type.${ev.type}`) : ev.type || ev.description);
    this.list.innerHTML = this.#events.length
      ? this.#events
          .map(
            (ev) => `<li class="${ev.state === 'active' ? 'active' : ''}">
          <time>${esc(ev.at.toLocaleTimeString())}</time>
          <strong>${esc(label(ev))}</strong>
          ${ev.targets.length ? `<span class="muted">${esc(ev.targets.map((x) => (has(`motion.target.${x}`) ? t(`motion.target.${x}`) : x)).join(', '))}</span>` : ''}
          <span class="muted">${esc(ev.state === 'active' ? t('events.active') : t('events.ended'))}</span>
        </li>`,
          )
          .join('')
      : `<li class="muted small">${esc(t('events.none'))}</li>`;
  }
}

customElements.define('cam-event-log', CamEventLog);
