// App shell: camera switcher, navigation and hash router. Each route is a custom element.

import './components/cam-save-bar.js';
import './components/cam-live.js';
import './components/cam-info.js';
import './components/cam-osd.js';
import './components/cam-image.js';
import './components/cam-video.js';
import './components/cam-time.js';
import './components/cam-network.js';
import './components/cam-motion.js';
import './components/cam-notify.js';
import './components/cam-users.js';
import './components/cam-cameras.js';
import * as cams from './cameras.js';
import { esc, errorText } from './dom.js';
import { t, has, getLang, setLang, LANGUAGES } from './i18n.js';

const ROUTES = [
  { hash: 'live', label: 'Live', tag: 'cam-live' },
  { hash: 'image', label: 'Immagine', tag: 'cam-image' },
  { hash: 'video', label: 'Video', tag: 'cam-video' },
  { hash: 'osd', label: 'OSD', tag: 'cam-osd' },
  { hash: 'time', label: 'Data e ora', tag: 'cam-time' },
  { hash: 'network', label: 'Rete', tag: 'cam-network' },
  { hash: 'motion', label: 'Movimento', tag: 'cam-motion' },
  { hash: 'notify', label: 'Notifiche', tag: 'cam-notify' },
  { hash: 'users', label: 'Utenti', tag: 'cam-users' },
  { hash: 'info', label: 'Dispositivo', tag: 'cam-info' },
];
const CAMERAS = { hash: 'cameras', label: 'Camere', tag: 'cam-cameras', global: true };
const DEFAULT = 'live';
// Shown labels come from the dictionaries (nav.<hash>); `label` is only the fallback for a route without one.
const routeLabel = (r) => (has(`nav.${r.hash}`) ? t(`nav.${r.hash}`) : r.label);

class CamApp extends HTMLElement {
  async connectedCallback() {
    this.innerHTML = `<header class="topbar"></header><main id="view"></main>`;
    this.header = this.querySelector('.topbar');
    this.view = this.querySelector('#view');
    this.renderHeader();

    addEventListener('language-changed', () => {
      this.renderHeader();
      if (this.loadError) this.showLoadError();
      else if (this.currentRouteDef) this.route({ force: true });
    });
    addEventListener('cameras-changed', () => this.renderSwitcher());
    addEventListener('camera-selected', () => {
      this.renderSwitcher();
      if (!this.currentRouteDef?.global) this.route({ force: true });
    });
    addEventListener('hashchange', () => this.route());

    try {
      await cams.refresh();
    } catch (err) {
      this.loadError = err;
      this.showLoadError();
      return;
    }
    this.route();
  }

  showLoadError() {
    this.view.innerHTML = `<p class="error">${esc(t('app.loadFailed', { error: errorText(this.loadError) }))}</p>`;
  }

  /** Top bar: rebuilt when the language changes. */
  renderHeader() {
    const langs = Object.entries(LANGUAGES)
      .map(([code, l]) => `<option value="${code}"${code === getLang() ? ' selected' : ''}>${esc(l.name)}</option>`)
      .join('');
    this.header.innerHTML = `
      <span class="brand">${esc(t('app.title'))}</span>
      <label class="camera-switch"><span class="sr-only">${esc(t('app.camera'))}</span><select></select></label>
      <nav>${ROUTES.map((r) => `<a href="#/${r.hash}" data-route="${r.hash}">${esc(routeLabel(r))}</a>`).join('')}</nav>
      <a class="cameras-link" href="#/cameras" data-route="cameras">${esc(routeLabel(CAMERAS))}</a>
      <label class="lang-switch"><span class="sr-only">${esc(t('app.language'))}</span><select>${langs}</select></label>`;
    this.switcher = this.querySelector('.camera-switch select');
    this.switcher.addEventListener('change', () => {
      if (this.current?.dirty && !confirm(t('app.leave'))) {
        this.switcher.value = cams.current()?.id ?? '';
        return;
      }
      cams.select(this.switcher.value);
    });
    const langSwitch = this.querySelector('.lang-switch select');
    langSwitch.addEventListener('change', () => {
      // Switching redraws the page from the camera: unsaved edits would be lost.
      if (this.current?.dirty && !confirm(t('app.leaveForLanguage'))) {
        langSwitch.value = getLang();
        return;
      }
      setLang(langSwitch.value);
    });
    if (this.currentRouteDef || this.loadError) this.renderSwitcher();
    this.markCurrent();
  }

  markCurrent() {
    for (const a of this.querySelectorAll('header a')) a.toggleAttribute('aria-current', a.dataset.route === this.currentRouteDef?.hash);
  }

  renderSwitcher() {
    const list = cams.list();
    const cur = cams.current();
    this.switcher.innerHTML = list.length
      ? list.map((c) => `<option value="${esc(c.id)}"${c.id === cur?.id ? ' selected' : ''}>${esc(c.name)}</option>`).join('')
      : `<option value="">${esc(t('app.noCameras'))}</option>`;
    this.switcher.disabled = list.length < 2;
    for (const a of this.querySelectorAll('nav a')) a.toggleAttribute('inert', !cur);
  }

  route({ force = false } = {}) {
    let name = location.hash.replace(/^#\/?/, '') || DEFAULT;
    // Without cameras, only the Cameras page makes sense.
    if (!cams.current() && name !== CAMERAS.hash) {
      history.replaceState(null, '', `#/${CAMERAS.hash}`);
      name = CAMERAS.hash;
    }
    const route = name === CAMERAS.hash ? CAMERAS : ROUTES.find((r) => r.hash === name) ?? ROUTES.find((r) => r.hash === DEFAULT);
    if (!force && route === this.currentRouteDef) return;
    if (!force && this.current?.dirty && !confirm(t('app.leave'))) {
      history.replaceState(null, '', `#/${this.currentRouteDef.hash}`);
      return;
    }
    this.current = document.createElement(route.tag);
    this.currentRouteDef = route;
    this.markCurrent();
    this.view.replaceChildren(this.current);
    const cam = cams.current();
    document.title = `${routeLabel(route)}${cam && !route.global ? ` · ${cam.name}` : ''} · ${t('app.title')}`;
  }
}

customElements.define('cam-app', CamApp);

addEventListener('beforeunload', (e) => {
  if (document.querySelector('#view > *')?.dirty) e.preventDefault();
});
