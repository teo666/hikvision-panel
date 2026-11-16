// <cam-notify>: where events are sent — email, FTP, HTTP host.
// Passwords are never read back from the camera: an empty password field means
// "leave the stored one", like the camera's own UI does.

import { ConfigPage } from '../config-page.js';
import { val, el, isapiUrl, parseXml } from '../isapi.js';
import { esc, errorText } from '../dom.js';
import { isIpv4 } from '../net.js';
import { t } from '../i18n.js';

const MAIL = '/ISAPI/System/Network/mailing';
const FTP = '/ISAPI/System/Network/ftp';
const HTTP = '/ISAPI/Event/notification/httpHosts';

const M = 'mailingList > mailing';
const SMTP = `${M} > sender > smtp`;
const F = 'FTPNotificationList > FTPNotification';
const H = 'HttpHostNotificationList > HttpHostNotification';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const is = (sel, ...values) => (doc) => values.includes(val(doc, sel));
const emailOrEmpty = (label) => (v) => (!v || EMAIL.test(v) ? undefined : t('notify.badEmail', { label }));

/** Server address of a block, whichever form the camera stored it in. */
export const serverOf = (doc, parentSel) => val(doc, `${parentSel} > hostName`) ?? val(doc, `${parentSel} > ipAddress`) ?? '';

/**
 * Store a server address the way the camera expects: addressingFormatType says
 * which element holds it (hostName or ipAddress); only that one is kept. The
 * camera itself switches to <ipAddress> when given an IP, so both must be handled.
 */
function setServer(doc, parentSel, value) {
  const parent = el(doc, parentSel);
  const kind = isIpv4(value) ? 'ipaddress' : 'hostname';
  const child = (name) => [...parent.children].find((c) => c.localName === name);
  const make = (name, after) => {
    const n = doc.createElementNS(parent.namespaceURI, name);
    after ? after.after(n) : parent.prepend(n);
    return n;
  };
  const fmt = child('addressingFormatType') ?? make('addressingFormatType', null);
  fmt.textContent = kind;
  const keep = kind === 'ipaddress' ? 'ipAddress' : 'hostName';
  child(kind === 'ipaddress' ? 'hostName' : 'ipAddress')?.remove();
  (child(keep) ?? make(keep, fmt)).textContent = value;
}

function serverField(parentSel, label, help) {
  return {
    type: 'custom',
    render(doc) {
      if (!el(doc, parentSel)) return '';
      return `<label>${esc(label)}</label>
        <input type="text" data-server maxlength="64" spellcheck="false" value="${esc(serverOf(doc, parentSel))}">
        <small class="muted">${esc(help ?? t('notify.serverHelp'))}</small>`;
    },
    bind(root, doc, changed) {
      const input = root.querySelector('[data-server]');
      input?.addEventListener('input', () => {
        setServer(doc, parentSel, input.value.trim());
        input.removeAttribute('aria-invalid');
        changed();
      });
    },
  };
}

const validServer = (v) => isIpv4(v) || /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i.test(v);

/**
 * Write-only password: shown empty; when typed, a <password> element is put
 * right after `afterSel` (the camera expects it next to the user name).
 */
function passwordField(parentSel, afterSel, label) {
  return {
    type: 'custom',
    render(doc) {
      if (!el(doc, parentSel)) return '';
      return `<label>${esc(label)}</label>
        <input type="password" autocomplete="new-password" data-pass placeholder="${esc(t('notify.passwordKeep'))}">`;
    },
    bind(root, doc, changed) {
      const input = root.querySelector('[data-pass]');
      input?.addEventListener('input', () => {
        const parent = el(doc, parentSel);
        let p = [...parent.children].find((c) => c.localName === 'password');
        if (!input.value) {
          p?.remove();
        } else {
          if (!p) {
            p = doc.createElementNS(parent.namespaceURI, 'password');
            const after = el(doc, afterSel);
            after ? after.after(p) : parent.appendChild(p);
          }
          p.textContent = input.value;
        }
        changed();
      });
    },
  };
}

function receiversField() {
  return {
    type: 'custom',
    render(doc) {
      const rs = [...doc.querySelectorAll(`${M} > receiverList > receiver`)];
      if (!rs.length) return '';
      return `<label>${esc(t('notify.receivers'))}</label>
        ${rs
          .map(
            (r, i) => `<div class="receiver-row">
          <input type="text" data-r="${i}" data-k="name" maxlength="32" aria-label="${esc(t('notify.receiverName', { n: i + 1 }))}" placeholder="${esc(t('notify.name'))}" value="${esc(val(r, 'name'))}">
          <input type="email" data-r="${i}" data-k="emailAddress" maxlength="64" aria-label="${esc(t('notify.receiverEmail', { n: i + 1 }))}" placeholder="nome@esempio.it" value="${esc(val(r, 'emailAddress'))}">
        </div>`,
          )
          .join('')}`;
    },
    bind(root, doc, changed) {
      const rs = [...doc.querySelectorAll(`${M} > receiverList > receiver`)];
      root.addEventListener('input', (ev) => {
        const inp = ev.target.closest('[data-r]');
        if (!inp) return;
        const node = el(rs[Number(inp.dataset.r)], inp.dataset.k);
        if (node) node.textContent = inp.value.trim();
        changed();
      });
    },
  };
}

const xmlEsc = (v) => String(v ?? '').replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]);

// errorDescription values the camera answers to a test → dictionary keys.
const TEST_RESULTS = {
  ok: 'ok',
  'connect server fail': 'connect',
  'no dns': 'dns',
  'no gateway': 'gateway',
  'password error': 'password',
  'user or password error': 'password',
  'port error': 'port',
  'exchange server fail': 'exchange',
  'unknown error': 'unknown',
};

/**
 * The test request the camera's own UI sends: the settings currently in the form
 * (saved or not), the password only when typed (otherwise the stored one is used).
 */
export function mailingTestXml(doc) {
  const s = (sel) => xmlEsc(val(doc, sel) ?? '');
  const smtp = el(doc, SMTP);
  const password = [...smtp.children].find((c) => c.localName === 'password')?.textContent;
  const auth = val(doc, `${SMTP} > enableAuthorization`) === 'true';
  const host = serverOf(doc, SMTP);
  const isIp = isIpv4(host);
  const receivers = [...doc.querySelectorAll(`${M} > receiverList > receiver`)].filter((r) => val(r, 'emailAddress'));
  return `<?xml version="1.0" encoding="UTF-8"?><mailingTestDescription>
<sendName>${s(`${M} > sender > name`)}</sendName>
<sendEmailAddress>${s(`${M} > sender > emailAddress`)}</sendEmailAddress>
${isIp ? `<addressingFormatType>ipaddress</addressingFormatType><ipAddress>${xmlEsc(host)}</ipAddress>` : `<addressingFormatType>hostname</addressingFormatType><hostName>${xmlEsc(host)}</hostName>`}
<portNo>${s(`${SMTP} > portNo`)}</portNo>
${val(doc, `${SMTP} > enableTLS`) === 'true' ? `<enableTLS>true</enableTLS><startTLS>${s(`${SMTP} > startTLS`) || 'false'}</startTLS>` : ''}
<enableAuthorization>${auth}</enableAuthorization>
${auth ? `<accountName>${s(`${SMTP} > accountName`)}</accountName>${password ? `<password>${xmlEsc(password)}</password>` : ''}` : ''}
<receiverList>${receivers
    .map((r) => `<receiver><id>${xmlEsc(val(r, 'id'))}</id><name>${xmlEsc(val(r, 'name'))}</name><emailAddress>${xmlEsc(val(r, 'emailAddress'))}</emailAddress></receiver>`)
    .join('')}</receiverList>
</mailingTestDescription>`;
}

function mailTestField(page) {
  return {
    type: 'custom',
    render() {
      return `<div class="actions"><button type="button" class="secondary" data-act="mail-test">${esc(t('notify.test'))}</button></div>
        <p class="test-msg" role="status" aria-live="polite"></p>`;
    },
    bind(root, doc) {
      const btn = root.querySelector('[data-act=mail-test]');
      const msg = root.querySelector('.test-msg');
      const show = (kind, text) => {
        msg.className = `test-msg ${kind}`;
        msg.textContent = text;
      };
      btn.addEventListener('click', async () => {
        const problems = page.mailProblems(true);
        if (problems.length) return show('err', problems.join(' · '));
        btn.disabled = true;
        show('', t('notify.testing'));
        try {
          const res = await fetch(isapiUrl(`${MAIL}/test`), {
            method: 'POST',
            body: mailingTestXml(doc),
            headers: { 'Content-Type': 'application/xml; charset=UTF-8' },
          });
          const text = await res.text();
          let doc2 = null;
          try {
            doc2 = parseXml(text);
          } catch {}
          const desc = doc2 && val(doc2, 'errorDescription');
          if (res.ok && (desc === undefined || desc === 'ok')) {
            show('ok', t('notify.testResult.ok'));
          } else if (desc) {
            const key = TEST_RESULTS[desc];
            show('err', key ? t(`notify.testResult.${key}`) : t('notify.testResult.other', { detail: desc }));
          } else {
            const detail = doc2 ? [val(doc2, 'statusString'), val(doc2, 'subStatusCode')].filter(Boolean).join(' / ') : '';
            show('err', detail ? t('errors.cameraStatusDetail', { status: res.status, detail }) : t('errors.cameraStatus', { status: res.status }));
          }
        } catch (err) {
          show('err', errorText(err));
        } finally {
          btn.disabled = false;
        }
      });
    },
  };
}

class CamNotify extends ConfigPage {
  static get title() {
    return t('nav.notify');
  }

  resources() {
    return [
      { key: 'mail', path: MAIL },
      { key: 'ftp', path: FTP, cap: `${FTP}/capabilities` },
      { key: 'http', path: HTTP, cap: `${HTTP}/capabilities` },
    ];
  }

  connectedCallback() {
    super.connectedCallback();
    this.intro.innerHTML = `<p class="muted">${esc(t('notify.intro'))}</p>`;
  }

  sections() {
    const auth = is(`${SMTP} > enableAuthorization`, 'true');
    return [
      {
        title: t('notify.email'),
        key: 'mail',
        fields: [
          { sel: `${M} > sender > name`, label: t('notify.senderName'), type: 'text', maxLength: 32 },
          {
            sel: `${M} > sender > emailAddress`,
            label: t('notify.senderEmail'),
            type: 'text',
            maxLength: 64,
            validate: emailOrEmpty(t('notify.senderEmail')),
          },
          serverField(SMTP, t('notify.smtpServer'), t('notify.smtpHelp')),
          { sel: `${SMTP} > portNo`, label: t('notify.port'), type: 'number', min: 1, max: 65535 },
          { sel: `${SMTP} > enableTLS`, label: t('notify.tls'), type: 'bool' },
          { sel: `${SMTP} > startTLS`, label: t('notify.startTls'), type: 'bool', when: is(`${SMTP} > enableTLS`, 'true') },
          { sel: `${SMTP} > enableAuthorization`, label: t('notify.smtpAuth'), type: 'bool' },
          { sel: `${SMTP} > accountName`, label: t('notify.user'), type: 'text', maxLength: 64, when: auth },
          { ...passwordField(SMTP, `${SMTP} > accountName`, t('notify.password')), when: auth },
          receiversField(),
          { sel: `${M} > attachment > snapshot > enabled`, label: t('notify.attachSnapshot'), type: 'bool' },
          mailTestField(this),
        ],
      },
      {
        title: t('notify.ftp'),
        key: 'ftp',
        fields: [
          serverField(F, t('notify.server')),
          { sel: `${F} > portNo`, label: t('notify.port'), type: 'number', min: 1, max: 65535 },
          { sel: `${F} > annoyftp`, label: t('notify.anonymous'), type: 'bool' },
          { sel: `${F} > userName`, label: t('notify.user'), type: 'text', maxLength: 32, when: is(`${F} > annoyftp`, 'false') },
          { ...passwordField(F, `${F} > userName`, t('notify.password')), when: is(`${F} > annoyftp`, 'false') },
          {
            sel: `${F} > uploadPath > topDirNameRule`,
            label: t('notify.folder'),
            type: 'select',
            labels: { devName: t('notify.dir.devName'), devId: t('notify.dir.devId'), devIp: t('notify.dir.devIp'), customize: t('notify.dir.customize') },
          },
          {
            sel: `${F} > uploadPath > topDirName`,
            label: t('notify.folderName'),
            type: 'text',
            maxLength: 32,
            when: is(`${F} > uploadPath > topDirNameRule`, 'customize'),
          },
          { sel: `${F} > uploadPicture`, label: t('notify.uploadPicture'), type: 'bool', help: t('notify.uploadPictureHelp') },
        ],
      },
      {
        title: t('notify.http'),
        key: 'http',
        help: t('notify.httpHelp'),
        fields: [
          { sel: `${H} > protocolType`, label: t('notify.protocol'), type: 'select' },
          serverField(H, t('notify.server')),
          { sel: `${H} > portNo`, label: t('notify.port'), type: 'number', min: 1, max: 65535 },
          {
            sel: `${H} > url`,
            label: t('notify.path'),
            type: 'text',
            maxLength: 128,
            help: t('notify.pathHelp'),
            validate: (v) => (!v || v.startsWith('/') ? undefined : t('notify.badPath')),
          },
          {
            sel: `${H} > httpAuthenticationMethod`,
            label: t('notify.httpAuth'),
            type: 'select',
            labels: { none: t('notify.httpAuthNone'), base64: t('notify.httpAuthBasic') },
          },
          { sel: `${H} > userName`, label: t('notify.user'), type: 'text', maxLength: 32, when: is(`${H} > httpAuthenticationMethod`, 'base64') },
          { ...passwordField(H, `${H} > userName`, t('notify.password')), when: is(`${H} > httpAuthenticationMethod`, 'base64') },
        ],
      },
    ];
  }

  /** Email settings that can't work. `forTest`: a server is required too. */
  mailProblems(forTest = false) {
    const errors = [];
    const mail = this.docs.mail;
    const server = serverOf(mail, SMTP);
    if (forTest && !server) errors.push(t('notify.needServer'));
    if (server && (forTest || this.modified.has('mail'))) {
      const anyReceiver = [...mail.querySelectorAll(`${M} > receiverList > receiver`)].some((r) => val(r, 'emailAddress'));
      if (!anyReceiver) errors.push(t('notify.needReceiver'));
      if (!val(mail, `${M} > sender > emailAddress`)) errors.push(t('notify.needSender'));
    }
    for (const r of mail.querySelectorAll(`${M} > receiverList > receiver`)) {
      const v = val(r, 'emailAddress');
      if (v && !EMAIL.test(v)) errors.push(t('notify.badEmail', { label: v }));
    }
    return errors;
  }

  validate() {
    const errors = this.mailProblems();
    const servers = [
      ['mail', SMTP, t('notify.smtpServer')],
      ['ftp', F, `${t('notify.ftp')}: ${t('notify.server')}`],
      ['http', H, `${t('notify.http')}: ${t('notify.server')}`],
    ];
    for (const [key, sel, label] of servers) {
      const v = this.modified.has(key) && el(this.docs[key], sel) ? serverOf(this.docs[key], sel) : '';
      if (v && !validServer(v)) errors.push(t('notify.badHost', { label }));
    }
    return errors;
  }
}

customElements.define('cam-notify', CamNotify);
