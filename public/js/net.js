// IPv4 helpers. Pure, so they run in Node tests too.

const IPV4 = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

export const isIpv4 = (s) => IPV4.test(s ?? '');

const toInt = (ip) => ip.split('.').reduce((n, o) => (n << 8) + Number(o), 0) >>> 0;

/** A valid, contiguous, non-zero subnet mask (e.g. 255.255.255.0). */
export function isNetmask(m) {
  if (!isIpv4(m)) return false;
  const inv = ~toInt(m) >>> 0;
  return inv !== 0xffffffff && (inv & (inv + 1)) === 0;
}

export const sameSubnet = (a, b, mask) => (toInt(a) & toInt(mask)) === (toInt(b) & toInt(mask));
