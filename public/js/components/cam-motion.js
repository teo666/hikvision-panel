// <cam-motion>: motion detection — sensitivity, target types, detection areas drawn
// over a snapshot, weekly schedule, linked actions, and a live event log.

import { ConfigPage } from '../config-page.js';
import { val, el, addChild, capOf, snapshotUrl } from '../isapi.js';
import { esc } from '../dom.js';
import { t } from '../i18n.js';
import { toScreen, fromScreen, defaultArea, addPoint, removePoint, polygonArea, selfIntersects } from '../regions.js';
import { normalizeTime, checkDay, sortRanges, ALWAYS } from '../schedule.js';
import './cam-event-log.js';

const MD = '/ISAPI/System/Video/inputs/channels/1/motionDetection';
const SCHED = '/ISAPI/Event/schedules/motionDetections/VMD_video1';
const TRIG = '/ISAPI/Event/triggers/VMD-1';
const LAYOUT = 'MotionDetectionLayout';
const DAYS = [1, 2, 3, 4, 5, 6, 7];
const METHODS = ['center', 'email', 'FTP', 'HTTP'];
// Capability flag in /ISAPI/Event/triggersCap for each method.
const CAP_FLAG = { center: 'isSupportCenter', email: 'isSupportEmail', FTP: 'isSupportFTP', HTTP: 'isSupportHTTP' };
const MIN_AREA = 2000; // on the 0–1000 grid: 0.2% of the picture

// --- XML <-> plain data -------------------------------------------------------

function readRegions(doc) {
  return [...doc.querySelectorAll(`${LAYOUT} RegionList > Region`)]
    .map((r) => [...r.querySelectorAll('RegionCoordinates')].map((c) => ({ x: Number(val(c, 'positionX')), y: Number(val(c, 'positionY')) })))
    .filter((pts) => pts.length >= 3);
}

function writeRegions(doc, regions) {
  const list = el(doc, `${LAYOUT} RegionList`);
  for (const r of [...list.children]) r.remove();
  regions.forEach((pts, i) => {
    const region = addChild(list, 'Region');
    addChild(region, 'id', i + 1);
    const coords = addChild(region, 'RegionCoordinatesList');
    for (const p of pts) {
      const c = addChild(coords, 'RegionCoordinates');
      addChild(c, 'positionX', p.x);
      addChild(c, 'positionY', p.y);
    }
  });
}

function readSchedule(doc) {
  const week = Object.fromEntries(DAYS.map((d) => [d, []]));
  for (const b of doc.querySelectorAll('TimeBlockList > TimeBlock')) {
    const day = Number(val(b, 'dayOfWeek'));
    const begin = normalizeTime(val(b, 'beginTime'));
    const end = normalizeTime(val(b, 'endTime'));
    if (week[day] && begin && end) week[day].push({ begin, end });
  }
  for (const d of DAYS) week[d] = sortRanges(week[d]);
  return week;
}

function writeSchedule(doc, week) {
  const list = el(doc, 'TimeBlockList');
  for (const b of [...list.children]) b.remove();
  for (const d of DAYS) {
    for (const r of sortRanges(week[d])) {
      const block = addChild(list, 'TimeBlock');
      addChild(block, 'dayOfWeek', d);
      const range = addChild(block, 'TimeRange');
      addChild(range, 'beginTime', r.begin);
      addChild(range, 'endTime', r.end);
    }
  }
}

const methodsOf = (doc) => [...doc.querySelectorAll('EventTriggerNotification')].map((n) => val(n, 'notificationMethod'));

function setMethod(doc, method, on) {
  let list = el(doc, 'EventTriggerNotificationList');
  if (!list) list = addChild(doc.documentElement, 'EventTriggerNotificationList');
  const existing = [...list.children].find((n) => val(n, 'notificationMethod') === method);
  if (on && !existing) {
    const n = addChild(list, 'EventTriggerNotification');
    addChild(n, 'id', method); // same as the method, like the camera's own "center"
    addChild(n, 'notificationMethod', method);
    addChild(n, 'notificationRecurrence', 'beginning');
  } else if (!on && existing) existing.remove();
}

// --- custom fields ---------------------------------------------------------------

function targetsField() {
  const SEL = `${LAYOUT} > targetType`;
  return {
    type: 'custom',
    render(doc, cap) {
      if (!el(doc, SEL)) return '';
      const opts = capOf(cap, SEL)?.options ?? ['human', 'vehicle'];
      const on = new Set((val(doc, SEL) || '').split(',').filter(Boolean));
      return `<label>${esc(t('motion.targets'))}</label>
        ${opts.map((o) => `<label class="inline"><input type="checkbox" data-target="${esc(o)}"${on.has(o) ? ' checked' : ''}> ${esc(t(`motion.target.${o}`))}</label>`).join('')}
        <small class="muted">${esc(t('motion.targetsHelp'))}</small>`;
    },
    bind(root, doc, changed) {
      for (const box of root.querySelectorAll('[data-target]')) {
        box.addEventListener('change', () => {
          const picked = [...root.querySelectorAll('[data-target]:checked')].map((b) => b.dataset.target);
          el(doc, SEL).textContent = picked.join(',');
          changed();
        });
      }
    },
  };
}

function areasField(page) {
  return {
    type: 'custom',
    render(doc, cap) {
      page.maxAreas = Number(el(doc, `${LAYOUT} RegionList`)?.getAttribute('size')) || 4;
      page.maxPoints = capOf(cap, `${LAYOUT} > regionEdgesNum`)?.max ?? 10;
      return `
        <div class="area-editor">
          <div class="frame area-canvas">
            <img alt="${esc(t('common.preview'))}" src="${snapshotUrl(102)}">
            <svg viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true"></svg>
            <div class="area-handles"></div>
          </div>
          <div class="area-side">
            <div class="area-list"></div>
            <div class="actions">
              <button type="button" class="secondary" data-act="add-area">${esc(t('motion.addArea'))}</button>
              <button type="button" class="secondary" data-act="add-point">${esc(t('motion.addPoint'))}</button>
              <button type="button" class="secondary danger" data-act="remove-area">${esc(t('motion.removeArea'))}</button>
            </div>
            <p class="muted small">${esc(t('motion.areasHelp'))}</p>
          </div>
        </div>`;
    },
    bind(root, doc, changed) {
      page.regions = readRegions(doc);
      page.selected = page.regions.length ? 0 : -1;
      const svg = root.querySelector('svg');
      const handles = root.querySelector('.area-handles');
      const canvas = root.querySelector('.area-canvas');
      const commit = () => {
        writeRegions(doc, page.regions);
        changed();
        draw();
      };
      const point = (ev) => {
        const r = canvas.getBoundingClientRect();
        return [(ev.clientX - r.left) / r.width, (ev.clientY - r.top) / r.height];
      };

      const draw = () => {
        svg.innerHTML = page.regions
          .map((pts, i) => {
            const d = pts.map((p) => toScreen(p).join(',')).join(' ');
            return `<polygon data-area="${i}" class="area${i === page.selected ? ' selected' : ''}" points="${d}"></polygon>`;
          })
          .join('');
        const sel = page.regions[page.selected];
        handles.innerHTML = sel
          ? sel
              .map((p, j) => {
                const [fx, fy] = toScreen(p);
                return `<button type="button" class="area-handle" data-point="${j}" style="left:${fx * 100}%;top:${fy * 100}%"
                  aria-label="${esc(t('motion.point', { n: j + 1 }))}" title="${esc(t('motion.pointHelp'))}"></button>`;
              })
              .join('')
          : '';
        root.querySelector('.area-list').innerHTML = page.regions.length
          ? page.regions
              .map((_, i) => `<button type="button" class="chip${i === page.selected ? ' selected' : ''}" data-pick="${i}">${esc(t('motion.area', { n: i + 1 }))}</button>`)
              .join('')
          : `<p class="muted small">${esc(t('motion.noAreas'))}</p>`;
        root.querySelector('[data-act=add-area]').disabled = page.regions.length >= page.maxAreas;
        root.querySelector('[data-act=remove-area]').disabled = !sel;
        root.querySelector('[data-act=add-point]').disabled = !sel || sel.length >= page.maxPoints;
      };

      // Follow the pointer until release, then save the shape into the document.
      const drag = (target, pointerId, onMove) => {
        target.setPointerCapture(pointerId);
        const move = (e) => onMove(point(e));
        const up = () => {
          target.removeEventListener('pointermove', move);
          target.removeEventListener('pointerup', up);
          target.removeEventListener('pointercancel', up);
          commit();
        };
        target.addEventListener('pointermove', move);
        target.addEventListener('pointerup', up);
        target.addEventListener('pointercancel', up);
      };

      handles.addEventListener('pointerdown', (ev) => {
        const h = ev.target.closest('[data-point]');
        if (!h) return;
        const j = Number(h.dataset.point);
        ev.preventDefault();
        drag(h, ev.pointerId, ([fx, fy]) => {
          page.regions[page.selected][j] = fromScreen(fx, fy);
          const [sx, sy] = toScreen(page.regions[page.selected][j]);
          h.style.left = `${sx * 100}%`;
          h.style.top = `${sy * 100}%`;
          svg.querySelector(`[data-area="${page.selected}"]`).setAttribute('points', page.regions[page.selected].map((p) => toScreen(p).join(',')).join(' '));
        });
      });
      handles.addEventListener('dblclick', (ev) => {
        const h = ev.target.closest('[data-point]');
        if (!h) return;
        page.regions[page.selected] = removePoint(page.regions[page.selected], Number(h.dataset.point));
        commit();
      });
      // Keyboard: arrows move the focused vertex by 1% (Shift: 5%), Delete removes it.
      handles.addEventListener('keydown', (ev) => {
        const h = ev.target.closest('[data-point]');
        if (!h) return;
        const j = Number(h.dataset.point);
        const pts = page.regions[page.selected];
        if (ev.key === 'Delete' || ev.key === 'Backspace') {
          page.regions[page.selected] = removePoint(pts, j);
          commit();
          return;
        }
        const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[ev.key];
        if (!d) return;
        ev.preventDefault();
        const k = ev.shiftKey ? 50 : 10;
        const c = (v) => Math.min(1000, Math.max(0, v));
        pts[j] = { x: c(pts[j].x + d[0] * k), y: c(pts[j].y + d[1] * k) };
        commit();
        root.querySelector(`[data-point="${j}"]`)?.focus();
      });
      svg.addEventListener('pointerdown', (ev) => {
        const poly = ev.target.closest('[data-area]');
        if (!poly) return;
        const i = Number(poly.dataset.area);
        if (i !== page.selected) {
          page.selected = i;
          draw();
          return;
        }
        const start = point(ev);
        const orig = page.regions[i].map((p) => ({ ...p }));
        // Keep the whole shape inside the picture.
        const minX = Math.min(...orig.map((p) => p.x));
        const maxX = Math.max(...orig.map((p) => p.x));
        const minY = Math.min(...orig.map((p) => p.y));
        const maxY = Math.max(...orig.map((p) => p.y));
        ev.preventDefault();
        drag(canvas, ev.pointerId, ([fx, fy]) => {
          const dx = Math.min(1000 - maxX, Math.max(-minX, Math.round((fx - start[0]) * 1000)));
          const dy = Math.min(1000 - maxY, Math.max(-minY, Math.round((start[1] - fy) * 1000)));
          page.regions[i] = orig.map((p) => ({ x: p.x + dx, y: p.y + dy }));
          draw();
        });
      });
      root.querySelector('.area-list').addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-pick]');
        if (!b) return;
        page.selected = Number(b.dataset.pick);
        draw();
      });
      root.querySelector('[data-act=add-area]').addEventListener('click', () => {
        page.regions.push(defaultArea());
        page.selected = page.regions.length - 1;
        commit();
      });
      root.querySelector('[data-act=remove-area]').addEventListener('click', () => {
        page.regions.splice(page.selected, 1);
        page.selected = page.regions.length ? Math.min(page.selected, page.regions.length - 1) : -1;
        commit();
      });
      root.querySelector('[data-act=add-point]').addEventListener('click', () => {
        page.regions[page.selected] = addPoint(page.regions[page.selected]);
        commit();
      });
      draw();
    },
  };
}

function scheduleField(page) {
  return {
    type: 'custom',
    render() {
      return `<div class="schedule"></div>
        <div class="actions">
          <button type="button" class="secondary" data-act="always">${esc(t('motion.always'))}</button>
          <button type="button" class="secondary" data-act="copy">${esc(t('motion.copyMonday'))}</button>
        </div>`;
    },
    bind(root, doc, changed) {
      page.week = readSchedule(doc);
      const box = root.querySelector('.schedule');
      const max = Number(el(doc, 'TimeBlockList')?.getAttribute('size')) || 8;
      const draw = () => {
        box.innerHTML = DAYS.map((d) => {
          const ranges = page.week[d];
          return `<div class="sched-day" data-day="${d}">
            <span class="sched-name">${esc(t(`day.${d}`))}</span>
            <div class="sched-ranges">
              ${ranges.length ? '' : `<span class="muted small">${esc(t('motion.off'))}</span>`}
              ${ranges
                .map(
                  (r, i) => `<span class="sched-range">
                  <input type="text" inputmode="numeric" maxlength="5" placeholder="HH:MM" aria-label="${esc(t('motion.from'))}" data-i="${i}" data-k="begin" value="${esc(r.begin)}">
                  –
                  <input type="text" inputmode="numeric" maxlength="5" placeholder="HH:MM" aria-label="${esc(t('motion.to'))}" data-i="${i}" data-k="end" value="${esc(r.end)}">
                  <button type="button" class="icon" data-del="${i}" aria-label="${esc(t('motion.removeRange'))}">✕</button>
                </span>`,
                )
                .join('')}
              ${ranges.length < max ? `<button type="button" class="icon" data-addrange aria-label="${esc(t('motion.addRange'))}">＋</button>` : ''}
            </div>
          </div>`;
        }).join('');
      };
      const update = () => {
        writeSchedule(doc, page.week);
        changed();
      };
      box.addEventListener('input', (ev) => {
        const inp = ev.target.closest('[data-k]');
        if (!inp) return;
        const d = Number(inp.closest('[data-day]').dataset.day);
        page.week[d][Number(inp.dataset.i)][inp.dataset.k] = normalizeTime(inp.value) ?? inp.value;
        inp.removeAttribute('aria-invalid');
        // Write without re-sorting while typing; sorted on save.
        changed();
      });
      box.addEventListener('click', (ev) => {
        const day = ev.target.closest('[data-day]');
        if (!day) return;
        const d = Number(day.dataset.day);
        if (ev.target.closest('[data-addrange]')) {
          const last = page.week[d].at(-1);
          page.week[d].push(last && last.end !== '24:00' ? { begin: last.end, end: '24:00' } : { begin: '00:00', end: '24:00' });
        } else if (ev.target.closest('[data-del]')) {
          page.week[d].splice(Number(ev.target.closest('[data-del]').dataset.del), 1);
        } else return;
        draw();
        update();
      });
      root.querySelector('[data-act=always]').addEventListener('click', () => {
        page.week = ALWAYS();
        draw();
        update();
      });
      root.querySelector('[data-act=copy]').addEventListener('click', () => {
        for (const d of DAYS.slice(1)) page.week[d] = page.week[1].map((r) => ({ ...r }));
        draw();
        update();
      });
      page.scheduleBox = box;
      draw();
    },
  };
}

/**
 * Only the actions the camera supports for motion events (this model: center,
 * email, FTP — asking for HTTP makes it refuse the whole document). Without the
 * capability document, fall back to all of them. Actions already set stay listed.
 */
function supportedMethods(doc, cap) {
  const on = new Set(methodsOf(doc));
  const motionCap = cap && el(cap, 'MotionDetectionTriggerCap');
  if (!motionCap) return METHODS;
  return METHODS.filter((m) => on.has(m) || val(motionCap, CAP_FLAG[m]) === 'true');
}

function actionsField() {
  return {
    type: 'custom',
    render(doc, cap) {
      const on = new Set(methodsOf(doc));
      return supportedMethods(doc, cap).map(
        (m) => `<label class="inline"><input type="checkbox" data-method="${m}"${on.has(m) ? ' checked' : ''}> ${esc(t(`motion.method.${m}`))}</label>`,
      ).join('') + `<small class="muted">${esc(t('motion.methodsHelp'))}</small>`;
    },
    bind(root, doc, changed) {
      for (const box of root.querySelectorAll('[data-method]')) {
        box.addEventListener('change', () => {
          setMethod(doc, box.dataset.method, box.checked);
          changed();
        });
      }
    },
  };
}

// --- page --------------------------------------------------------------------------

class CamMotion extends ConfigPage {
  static get title() {
    return t('nav.motion');
  }

  resources() {
    return [
      { key: 'md', path: MD, cap: `${MD}/capabilities` },
      { key: 'sched', path: SCHED },
      { key: 'trig', path: TRIG, cap: '/ISAPI/Event/triggersCap' },
    ];
  }

  connectedCallback() {
    super.connectedCallback();
    this.log = document.createElement('cam-event-log');
    this.body.after(this.log);
  }

  sections() {
    return [
      {
        title: t('motion.detection'),
        key: 'md',
        fields: [
          { sel: 'MotionDetection > enabled', label: t('motion.enabled'), type: 'bool' },
          { sel: `${LAYOUT} > sensitivityLevel`, label: t('motion.sensitivity'), type: 'range', step: 20, unit: '%' },
          targetsField(),
          { sel: 'MotionDetection > enableHighlight', label: t('motion.highlight'), type: 'bool', help: t('motion.highlightHelp') },
        ],
      },
      { title: t('motion.actions'), key: 'trig', fields: [actionsField()] },
      { title: t('motion.areas'), key: 'md', wide: true, fields: [areasField(this)] },
      { title: t('motion.schedule'), key: 'sched', wide: true, fields: [scheduleField(this)] },
    ];
  }

  validate() {
    const errors = [];
    const targets = el(this.docs.md, `${LAYOUT} > targetType`);
    if (targets && !targets.textContent.trim()) errors.push(t('motion.needTarget'));
    this.regions?.forEach((pts, i) => {
      if (selfIntersects(pts)) errors.push(t('motion.errCross', { n: i + 1 }));
      else if (polygonArea(pts) < MIN_AREA) errors.push(t('motion.errSmall', { n: i + 1 }));
    });
    if (this.week) {
      for (const d of DAYS) {
        const code = checkDay(this.week[d]);
        if (code) {
          errors.push(t(`motion.errSchedule.${code}`, { day: t(`day.${d}`) }));
          this.scheduleBox?.querySelectorAll(`[data-day="${d}"] input`).forEach((i) => i.setAttribute('aria-invalid', 'true'));
        }
      }
      // Times typed but not yet re-sorted: write the final, sorted version.
      if (!errors.length && this.modified.has('sched')) writeSchedule(this.docs.sched, this.week);
    }
    return errors;
  }
}

customElements.define('cam-motion', CamMotion);
