// <cam-video>: encoding of the main (101) and sub (102) streams.

import { ConfigPage } from '../config-page.js';
import { val, setVal, capOf } from '../isapi.js';
import { esc } from '../dom.js';
import { t } from '../i18n.js';

// title/help are dictionary keys: video.<key>, video.<key>Help.
const STREAMS = [
  { key: 'main', id: 101 },
  { key: 'sub', id: 102 },
];

const is = (sel, ...values) => (doc) => values.includes(val(doc, sel));
const isNot = (sel, ...values) => (doc) => !values.includes(val(doc, sel));
// maxFrameRate is in hundredths of fps; below 1 fps the camera uses fixed fractions.
const SLOW = { 50: '1/2', 25: '1/4', 12: '1/8', 6: '1/16' };
const fps = (v) => `${SLOW[v] ?? Number(v) / 100} fps`;

/** Width/height come as two parallel opt lists: pair them up. */
function resolutionField() {
  const W = 'Video > videoResolutionWidth';
  const H = 'Video > videoResolutionHeight';
  return {
    type: 'custom',
    render(doc, cap) {
      const ws = capOf(cap, W)?.options ?? [];
      const hs = capOf(cap, H)?.options ?? [];
      const current = `${val(doc, W)}x${val(doc, H)}`;
      const pairs = [...new Set(ws.map((w, i) => `${w}x${hs[i]}`).filter((p) => !p.includes('undefined')))];
      if (!pairs.includes(current)) pairs.unshift(current);
      return `<label>${esc(t('video.resolution'))}</label><select data-res>${pairs
        .map((p) => `<option value="${p}"${p === current ? ' selected' : ''}>${p.replace('x', ' × ')}</option>`)
        .join('')}</select>`;
    },
    bind(root, doc, changed) {
      root.querySelector('[data-res]').addEventListener('change', (e) => {
        const [w, h] = e.target.value.split('x');
        setVal(doc, W, w);
        setVal(doc, H, h);
        changed();
      });
    },
  };
}

class CamVideo extends ConfigPage {
  static get title() {
    return t('nav.video');
  }

  resources() {
    return STREAMS.map((s) => ({
      key: s.key,
      path: `/ISAPI/Streaming/channels/${s.id}`,
      cap: `/ISAPI/Streaming/channels/${s.id}/capabilities`,
    }));
  }

  connectedCallback() {
    super.connectedCallback();
    this.intro.innerHTML = `<p class="muted">${esc(t('video.restartNote'))}</p>`;
  }

  confirmSave() {
    return t('video.confirmSave');
  }

  sections() {
    return STREAMS.map((s) => ({
      title: t(`video.${s.key}`),
      key: s.key,
      help: t(`video.${s.key}Help`),
      fields: [
        {
          sel: 'Video > videoCodecType',
          label: t('video.codec'),
          type: 'select',
          labels: { 'H.264': t('video.codec.h264'), 'H.265': t('video.codec.h265'), MJPEG: t('video.codec.mjpeg') },
        },
        resolutionField(),
        { sel: 'Video > maxFrameRate', label: t('video.frameRate'), type: 'select', format: fps },
        {
          sel: 'Video > videoQualityControlType',
          label: t('video.bitrateType'),
          type: 'select',
          labels: { CBR: t('video.cbr'), VBR: t('video.vbr') },
          when: isNot('Video > videoCodecType', 'MJPEG'),
        },
        {
          sel: 'Video > constantBitRate',
          label: t('video.bitrate'),
          type: 'number',
          unit: 'kbps',
          when: (d) => is('Video > videoQualityControlType', 'CBR')(d),
        },
        {
          sel: 'Video > vbrUpperCap',
          label: t('video.maxBitrate'),
          type: 'number',
          unit: 'kbps',
          when: (d) => is('Video > videoQualityControlType', 'VBR')(d),
        },
        {
          sel: 'Video > fixedQuality',
          label: t('video.quality'),
          type: 'select',
          labels: Object.fromEntries([1, 20, 40, 60, 80, 100].map((q) => [q, t(`video.quality.${q}`)])),
          when: (d) => is('Video > videoQualityControlType', 'VBR')(d) || is('Video > videoCodecType', 'MJPEG')(d),
        },
        {
          sel: 'Video > GovLength',
          label: t('video.gop'),
          type: 'number',
          unit: t('video.gopUnit'),
          help: t('video.gopHelp'),
          when: isNot('Video > videoCodecType', 'MJPEG'),
        },
        { sel: 'Video > H264Profile', label: t('video.h264Profile'), type: 'select', when: is('Video > videoCodecType', 'H.264') },
        {
          sel: 'Video > SmartCodec > enabled',
          label: t('video.smartCodec'),
          type: 'bool',
          help: t('video.smartCodecHelp'),
          when: isNot('Video > videoCodecType', 'MJPEG'),
        },
        { sel: 'Audio > enabled', label: t('video.audio'), type: 'bool' },
        {
          sel: 'Audio > audioCompressionType',
          label: t('video.audioCodec'),
          type: 'select',
          when: is('Audio > enabled', 'true'),
        },
      ],
    }));
  }
}

customElements.define('cam-video', CamVideo);
