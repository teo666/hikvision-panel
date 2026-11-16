// <cam-time>: clock, time zone and NTP.

import { ConfigPage } from '../config-page.js';
import { val, setVal, el } from '../isapi.js';
import { esc, options } from '../dom.js';
import { t } from '../i18n.js';
import { parseTimeZone, formatTimeZone, offsetLabel, OFFSETS, EU_DST, isoLocal } from '../timezone.js';

const NTP = 'NTPServerList > NTPServer';
const isNtp = (doc) => val(doc, 'timeMode') === 'NTP';

function timeZoneField() {
  return {
    type: 'custom',
    render(doc) {
      const tz = parseTimeZone(val(doc, 'timeZone'));
      if (!tz) return `<label>${esc(t('time.zone'))}</label><p class="muted">${esc(t('time.zoneUnknown', { tz: val(doc, 'timeZone') }))}</p>`;
      const offs = OFFSETS.includes(tz.offsetMinutes) ? OFFSETS : [...OFFSETS, tz.offsetMinutes].sort((a, b) => a - b);
      const labels = Object.fromEntries(offs.map((o) => [String(o), offsetLabel(o)]));
      const custom = tz.dst && tz.dst !== EU_DST;
      return `
        <label>${esc(t('time.zone'))}</label>
        <select data-tz>${options(offs.map(String), String(tz.offsetMinutes), labels)}</select>
        <label class="inline"><input type="checkbox" data-dst${tz.dst ? ' checked' : ''}${custom ? ' disabled' : ''}>
          ${esc(t('time.euDst'))}</label>
        ${custom ? `<small class="muted">${esc(t('time.customDst'))}</small>` : ''}`;
    },
    bind(root, doc, changed) {
      const sel = root.querySelector('[data-tz]');
      const dst = root.querySelector('[data-dst]');
      if (!sel) return;
      const update = () => {
        const current = parseTimeZone(val(doc, 'timeZone'));
        const keepCustom = current.dst && current.dst !== EU_DST;
        setVal(doc, 'timeZone', formatTimeZone(Number(sel.value), keepCustom ? current.dst : dst.checked ? EU_DST : ''));
        changed();
      };
      sel.addEventListener('change', update);
      dst.addEventListener('change', update);
    },
  };
}

function manualClockField() {
  return {
    type: 'custom',
    render(doc) {
      return `
        <label>${esc(t('time.cameraTime'))}</label>
        <p data-clock>${esc(val(doc, 'localTime'))}</p>
        <button type="button" class="secondary" data-sync>${esc(t('time.useComputerTime'))}</button>
        <small class="muted">${esc(t('time.setOnSave'))}</small>`;
    },
    bind(root, doc, changed) {
      root.querySelector('[data-sync]').addEventListener('click', () => {
        doc.syncFromBrowser = true;
        root.querySelector('[data-clock]').textContent = t('time.atSave', { time: isoLocal() });
        changed();
      });
    },
  };
}

class CamTime extends ConfigPage {
  static get title() {
    return t('nav.time');
  }

  resources() {
    return [
      // NTP servers first: switching to NTP mode should find them already set.
      { key: 'ntp', path: '/ISAPI/System/time/ntpServers', cap: '/ISAPI/System/time/ntpServers/capabilities' },
      { key: 'time', path: '/ISAPI/System/time', cap: '/ISAPI/System/time/capabilities' },
    ];
  }

  sections() {
    return [
      {
        title: t('time.clock'),
        key: 'time',
        fields: [
          {
            sel: 'timeMode',
            label: t('time.sync'),
            type: 'select',
            options: ['NTP', 'manual'],
            labels: { NTP: t('time.sync.NTP'), manual: t('time.sync.manual') },
          },
          timeZoneField(),
          { ...manualClockField(), when: (d) => !isNtp(d) },
        ],
      },
      {
        title: t('time.ntpServer'),
        key: 'ntp',
        when: () => isNtp(this.docs.time),
        fields: [
          {
            sel: `${NTP} > addressingFormatType`,
            label: t('time.addressType'),
            type: 'select',
            labels: { hostname: t('time.hostname'), ipaddress: t('time.ipaddress') },
            // Only offer the formats whose address field the camera's document has.
            options: (d, capOpts = ['hostname', 'ipaddress']) =>
              capOpts.filter((o) => el(d, `${NTP} > ${o === 'hostname' ? 'hostName' : 'ipAddress'}`)),
          },
          {
            sel: `${NTP} > hostName`,
            label: t('time.server'),
            type: 'text',
            maxLength: 64,
            when: (d) => val(d, `${NTP} > addressingFormatType`) === 'hostname',
            validate: (v) => (/^[a-z0-9.-]+$/i.test(v || '') ? undefined : t('time.badHostname')),
          },
          {
            sel: `${NTP} > ipAddress`,
            label: t('time.server'),
            type: 'ipv4',
            when: (d) => val(d, `${NTP} > addressingFormatType`) === 'ipaddress',
          },
          { sel: `${NTP} > portNo`, label: t('time.port'), type: 'number' },
          { sel: `${NTP} > synchronizeInterval`, label: t('time.interval'), type: 'number', unit: t('time.minutes') },
        ],
      },
    ];
  }

  async save() {
    const doc = this.docs.time;
    if (doc.syncFromBrowser && !isNtp(doc)) setVal(doc, 'localTime', isoLocal());
    return super.save();
  }
}

customElements.define('cam-time', CamTime);
