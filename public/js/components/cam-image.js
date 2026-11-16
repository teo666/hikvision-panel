// <cam-image>: picture settings and the hybrid (IR + white) light.
// Everything lives in one document: /ISAPI/Image/channels/1.

import { ConfigPage } from '../config-page.js';
import { val, snapshotUrl } from '../isapi.js';
import { esc } from '../dom.js';
import { t } from '../i18n.js';

const IMG = '/ISAPI/Image/channels/1';
const is = (sel, ...values) => (doc) => values.includes(val(doc, sel));

const LIGHT_MODE = 'ImageChannel > SupplementLight > supplementLightMode';
const EVENT_CFG = 'ImageChannel > SupplementLight > EventIntelligenceModeCfg';
const MIXED = 'ImageChannel > SupplementLight > mixedLightBrightnessRegulatMode';

class CamImage extends ConfigPage {
  static get title() {
    return t('nav.image');
  }

  resources() {
    return [{ key: 'img', path: IMG, cap: `${IMG}/capabilities` }];
  }

  connectedCallback() {
    super.connectedCallback();
    this.intro.innerHTML = `
      <div class="preview-strip">
        <div class="frame"><img alt="${esc(t('common.preview'))}"></div>
        <div>
          <p class="muted small">${esc(t('image.previewNote'))}</p>
          <button type="button" class="secondary" data-act="refresh">${esc(t('image.refreshPreview'))}</button>
        </div>
      </div>`;
    this.preview = this.intro.querySelector('img');
    this.intro.querySelector('[data-act=refresh]').addEventListener('click', () => this.afterSave());
    this.afterSave();
  }

  afterSave() {
    // Give the sensor a moment to apply the new settings.
    setTimeout(() => (this.preview.src = snapshotUrl(102)), 800);
  }

  sections() {
    return [
      {
        title: t('image.adjustments'),
        key: 'img',
        fields: [
          { sel: 'Color > brightnessLevel', label: t('image.brightness'), type: 'range' },
          { sel: 'Color > contrastLevel', label: t('image.contrast'), type: 'range' },
          { sel: 'Color > saturationLevel', label: t('image.saturation'), type: 'range' },
          { sel: 'Sharpness > SharpnessLevel', label: t('image.sharpness'), type: 'range' },
        ],
      },
      {
        title: t('image.light'),
        key: 'img',
        help: t('image.lightHelp'),
        fields: [
          {
            sel: LIGHT_MODE,
            label: t('image.mode'),
            type: 'select',
            labels: {
              eventIntelligence: t('image.light.eventIntelligence'),
              colorVuWhiteLight: t('image.light.colorVuWhiteLight'),
              irLight: t('image.light.irLight'),
              close: t('image.light.close'),
            },
          },
          {
            sel: `${EVENT_CFG} > whiteLightTime`,
            label: t('image.whiteLightTime'),
            type: 'number',
            unit: 's',
            when: is(LIGHT_MODE, 'eventIntelligence'),
          },
          {
            sel: `${EVENT_CFG} > brightnessRegulatMode`,
            label: t('image.intensity'),
            type: 'select',
            labels: { auto: t('image.intensityAuto'), manual: t('image.intensityManual') },
            when: is(LIGHT_MODE, 'eventIntelligence'),
          },
          {
            sel: `${EVENT_CFG} > whiteLightBrightness`,
            label: t('image.whiteLightBrightness'),
            type: 'range',
            unit: '%',
            when: (d) => is(LIGHT_MODE, 'eventIntelligence')(d) && is(`${EVENT_CFG} > brightnessRegulatMode`, 'manual')(d),
          },
          {
            sel: `${EVENT_CFG} > irLightBrightness`,
            label: t('image.irLightBrightness'),
            type: 'range',
            unit: '%',
            when: (d) => is(LIGHT_MODE, 'eventIntelligence')(d) && is(`${EVENT_CFG} > brightnessRegulatMode`, 'manual')(d),
          },
          {
            sel: MIXED,
            label: t('image.intensity'),
            type: 'select',
            labels: { auto: t('image.intensityAuto'), manual: t('image.intensityManual') },
            when: is(LIGHT_MODE, 'colorVuWhiteLight', 'irLight'),
          },
          {
            sel: 'ImageChannel > SupplementLight > whiteLightBrightness',
            label: t('image.whiteLightBrightness'),
            type: 'range',
            unit: '%',
            when: (d) => is(LIGHT_MODE, 'colorVuWhiteLight')(d) && is(MIXED, 'manual')(d),
          },
          {
            sel: 'ImageChannel > SupplementLight > irLightBrightness',
            label: t('image.irLightBrightness'),
            type: 'range',
            unit: '%',
            when: (d) => is(LIGHT_MODE, 'irLight')(d) && is(MIXED, 'manual')(d),
          },
        ],
      },
      {
        title: t('image.dayNight'),
        key: 'img',
        fields: [
          {
            sel: 'IrcutFilter > IrcutFilterType',
            label: t('image.mode'),
            type: 'select',
            // "schedule" needs a time range this camera's settings don't carry yet.
            options: ['auto', 'day', 'night'],
            labels: { auto: t('image.dayNight.auto'), day: t('image.dayNight.day'), night: t('image.dayNight.night') },
          },
          {
            sel: 'IrcutFilter > nightToDayFilterLevel',
            label: t('image.sensitivity'),
            type: 'select',
            help: t('image.sensitivityHelp'),
            when: is('IrcutFilter > IrcutFilterType', 'auto'),
          },
          {
            sel: 'IrcutFilter > nightToDayFilterTime',
            label: t('image.switchDelay'),
            type: 'number',
            unit: 's',
            when: is('IrcutFilter > IrcutFilterType', 'auto'),
          },
        ],
      },
      {
        title: t('image.exposure'),
        key: 'img',
        fields: [
          { sel: 'Shutter > ShutterLevel', label: t('image.shutter'), type: 'select', help: t('image.shutterHelp') },
          {
            sel: 'powerLineFrequency > powerLineFrequencyMode',
            label: t('image.antiFlicker'),
            type: 'select',
            labels: { '50hz': t('image.antiFlicker50'), '60hz': t('image.antiFlicker60') },
          },
          {
            sel: 'WDR > mode',
            label: t('image.wdr'),
            type: 'select',
            labels: { close: t('image.wdr.close'), open: t('image.wdr.open'), auto: t('image.wdr.auto') },
          },
          { sel: 'WDR > WDRLevel', label: t('image.wdrLevel'), type: 'range', when: is('WDR > mode', 'open') },
          { sel: 'BLC > enabled', label: t('image.blc'), type: 'bool' },
          { sel: 'HLC > enabled', label: t('image.hlc'), type: 'bool' },
          { sel: 'HLC > HLCLevel', label: t('image.hlcLevel'), type: 'range', when: is('HLC > enabled', 'true') },
        ],
      },
      {
        title: t('image.whiteBalance'),
        key: 'img',
        fields: [
          {
            sel: 'WhiteBalance > WhiteBalanceStyle',
            label: t('image.mode'),
            type: 'select',
            labels: {
              manual: t('image.wb.manual'),
              auto1: t('image.wb.auto1'),
              auto2: t('image.wb.auto2'),
              locked: t('image.wb.locked'),
              daylightLamp: t('image.wb.daylightLamp'),
              incandescentlight: t('image.wb.incandescentlight'),
              warmlight: t('image.wb.warmlight'),
              naturallight: t('image.wb.naturallight'),
            },
          },
          { sel: 'WhiteBalance > WhiteBalanceRed', label: t('image.wbRed'), type: 'range', when: is('WhiteBalance > WhiteBalanceStyle', 'manual') },
          { sel: 'WhiteBalance > WhiteBalanceBlue', label: t('image.wbBlue'), type: 'range', when: is('WhiteBalance > WhiteBalanceStyle', 'manual') },
        ],
      },
      {
        title: t('image.noise'),
        key: 'img',
        fields: [
          {
            sel: 'NoiseReduce > mode',
            label: t('image.mode'),
            type: 'select',
            options: ['close', 'general'],
            labels: { close: t('image.noise.close'), general: t('image.noise.general') },
          },
          { sel: 'NoiseReduce > GeneralMode > generalLevel', label: t('image.noiseLevel'), type: 'range', when: is('NoiseReduce > mode', 'general') },
        ],
      },
    ];
  }
}

customElements.define('cam-image', CamImage);
