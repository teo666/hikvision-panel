// <cam-network>: IPv4 settings of the wired interface. IPv6 is left untouched.

import { ConfigPage } from '../config-page.js';
import { val } from '../isapi.js';
import { esc } from '../dom.js';
import { t } from '../i18n.js';
import { isIpv4, isNetmask, sameSubnet } from '../net.js';

const IF = '/ISAPI/System/Network/interfaces/1';
const IP = 'NetworkInterface > IPAddress';
const isStatic = (d) => val(d, `${IP} > addressingType`) === 'static';

class CamNetwork extends ConfigPage {
  static get title() {
    return t('nav.network');
  }

  resources() {
    return [{ key: 'net', path: IF, cap: `${IF}/capabilities` }];
  }

  connectedCallback() {
    super.connectedCallback();
    this.intro.innerHTML = `<p class="warning">${esc(t('network.warning'))}</p>`;
  }

  prepare() {
    const d = this.docs.net;
    this.original = { type: val(d, `${IP} > addressingType`), ip: val(d, `${IP} > ipAddress`) };
  }

  sections() {
    return [
      {
        title: t('network.ipv4'),
        key: 'net',
        fields: [
          {
            sel: `${IP} > addressingType`,
            label: t('network.addressing'),
            type: 'select',
            options: ['dynamic', 'static'],
            labels: { dynamic: t('network.dhcp'), static: t('network.static') },
          },
          {
            type: 'custom',
            when: (d) => !isStatic(d),
            render: (d) =>
              `<p class="muted small">${esc(
                t('network.current', {
                  ip: val(d, `${IP} > ipAddress`),
                  mask: val(d, `${IP} > subnetMask`),
                  gateway: val(d, `${IP} > DefaultGateway > ipAddress`),
                }),
              )}</p>`,
            bind() {},
          },
          { sel: `${IP} > ipAddress`, label: t('network.ip'), type: 'ipv4', when: isStatic },
          {
            sel: `${IP} > subnetMask`,
            label: t('network.mask'),
            type: 'ipv4',
            when: isStatic,
            validate: (v) => (isNetmask(v) ? undefined : t('network.badMask')),
          },
          {
            sel: `${IP} > DefaultGateway > ipAddress`,
            label: t('network.gateway'),
            type: 'ipv4',
            when: isStatic,
            validate: (v, d) => {
              const ip = val(d, `${IP} > ipAddress`);
              const mask = val(d, `${IP} > subnetMask`);
              if (!isIpv4(v) || !isIpv4(ip) || !isNetmask(mask)) return undefined; // reported elsewhere
              return sameSubnet(v, ip, mask) ? undefined : t('network.gatewaySubnet');
            },
          },
        ],
      },
      {
        title: t('network.dns'),
        key: 'net',
        fields: [
          { sel: `${IP} > PrimaryDNS > ipAddress`, label: t('network.dns1'), type: 'ipv4' },
          { sel: `${IP} > SecondaryDNS > ipAddress`, label: t('network.dns2'), type: 'ipv4' },
        ],
      },
      {
        title: t('network.link'),
        key: 'net',
        fields: [{ sel: 'Link > MTU', label: t('network.mtu'), type: 'number', unit: 'byte' }],
      },
    ];
  }

  confirmSave() {
    const d = this.docs.net;
    const type = val(d, `${IP} > addressingType`);
    const ip = val(d, `${IP} > ipAddress`);
    if (type === this.original.type && (type === 'dynamic' || ip === this.original.ip)) return null;
    const where = type === 'dynamic' ? t('network.toDhcp') : t('network.toIp', { ip });
    return t('network.confirm', { where });
  }
}

customElements.define('cam-network', CamNetwork);
