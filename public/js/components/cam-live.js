// <cam-live>: live view. Real video when the sub-stream is encoded as MJPEG (the
// browser shows it natively); otherwise JPEG snapshots, one request at a time, at
// most one every 200 ms (or the chosen interval). Pauses when the tab is hidden.

import { snapshotUrl, isapiUrl, get, val } from '../isapi.js';
import { esc } from '../dom.js';
import { t } from '../i18n.js';

class CamLive extends HTMLElement {
  #timer = null;
  #running = false;

  connectedCallback() {
    this.innerHTML = `
      <h1>${esc(t('nav.live'))}</h1>
      <div class="toolbar">
        <label>${esc(t('live.stream'))}
          <select data-k="channel">
            <option value="101">${esc(t('live.main'))}</option>
            <option value="102" selected>${esc(t('live.sub'))}</option>
          </select>
        </label>
        <label>${esc(t('live.refresh'))}
          <select data-k="interval">
            <option value="200" selected>${esc(t('live.upTo5'))}</option>
            <option value="1000">${esc(t('live.every1'))}</option>
            <option value="5000">${esc(t('live.every5'))}</option>
          </select>
        </label>
        <span class="muted" data-k="fps"></span>
      </div>
      <p class="muted small" data-k="mjpeg-hint" hidden>${esc(t('live.mjpegHint'))} <a href="#/video">${esc(t('nav.video'))}</a></p>
      <div class="frame"><img alt="${esc(t('live.alt'))}"><p class="frame-msg"></p></div>`;
    this.img = this.querySelector('img');
    this.msg = this.querySelector('.frame-msg');
    this.fps = this.querySelector('[data-k=fps]');
    this.channel = this.querySelector('[data-k=channel]');
    this.interval = this.querySelector('[data-k=interval]');
    this.channel.addEventListener('change', () => this.#restart());
    this.img.addEventListener('load', () => this.#loaded());
    this.img.addEventListener('error', () => this.#failed());
    this.onVisibility = () => (document.hidden ? this.#stop() : this.#start());
    document.addEventListener('visibilitychange', this.onVisibility);
    this.#start();
    this.#offerMjpeg();
  }

  /** If the sub-stream is MJPEG, offer (and switch to) real video. */
  async #offerMjpeg() {
    const hint = this.querySelector('[data-k=mjpeg-hint]');
    try {
      const doc = await get('/ISAPI/Streaming/channels/102');
      if (!this.isConnected) return;
      if (val(doc, 'Video > videoCodecType') !== 'MJPEG') {
        hint.hidden = false;
        return;
      }
      this.channel.insertAdjacentHTML('afterbegin', `<option value="mjpeg">${esc(t('live.mjpeg'))}</option>`);
      if (this.channel.value === '102') {
        this.channel.value = 'mjpeg';
        this.#restart();
      }
    } catch {
      // No information about the stream: snapshots keep working.
    }
  }

  get #mjpeg() {
    return this.channel.value === 'mjpeg';
  }

  disconnectedCallback() {
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.#stop();
  }

  #start() {
    if (this.#running) return;
    this.#running = true;
    this.#frames = [];
    this.#next();
  }

  #stop() {
    this.#running = false;
    clearTimeout(this.#timer);
    // Closes the MJPEG connection to the camera.
    if (this.#mjpeg) this.img.removeAttribute('src');
  }

  #restart() {
    this.#stop();
    this.#start();
  }

  #frames = [];
  #requestedAt = 0;

  #next() {
    if (!this.#running) return;
    this.interval.disabled = this.#mjpeg;
    this.#requestedAt = performance.now();
    this.img.src = this.#mjpeg
      ? isapiUrl(`/ISAPI/Streaming/channels/102/httpPreview?_=${Date.now()}`)
      : snapshotUrl(this.channel.value);
  }

  #schedule(delay) {
    clearTimeout(this.#timer);
    if (this.#running) this.#timer = setTimeout(() => this.#next(), delay);
  }

  #loaded() {
    this.msg.textContent = '';
    this.img.classList.remove('stale');
    if (this.#mjpeg) {
      this.fps.textContent = t('live.video');
      return; // the stream keeps coming on its own
    }
    const now = performance.now();
    this.#frames = [...this.#frames.filter((at) => now - at < 5000), now];
    const fps = this.#frames.length / 5;
    this.fps.textContent = this.#frames.length > 1 ? `${fps.toFixed(1)} fps` : '';
    // Never hammer the camera: at least 200 ms between requests.
    const wanted = Math.max(200, Number(this.interval.value));
    this.#schedule(Math.max(0, wanted - (now - this.#requestedAt)));
  }

  #failed() {
    this.img.classList.add('stale');
    this.msg.textContent = t('live.unavailable');
    this.#schedule(3000);
  }
}

customElements.define('cam-live', CamLive);
