import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseChallenge, buildAuthorization } from '../lib/digest.js';

test('parses a Hikvision challenge', () => {
  const c = parseChallenge(
    'Digest qop="auth", realm="IP Camera(FD787)", nonce="653639303a62306331343461303a74d7", stale="FALSE"',
  );
  assert.deepEqual(c, { qop: 'auth', realm: 'IP Camera(FD787)', nonce: '653639303a62306331343461303a74d7', stale: 'FALSE' });
});

test('rejects non-digest headers', () => {
  assert.equal(parseChallenge('Basic realm="x"'), null);
  assert.equal(parseChallenge(null), null);
});

test('RFC 2617 example response', () => {
  const header = buildAuthorization({
    challenge: { realm: 'testrealm@host.com', nonce: 'dcd98b7102dd2f0e8b11d0f600bfb0c093', qop: 'auth,auth-int', opaque: '5ccc069c403ebaf9f0171e9517f40e41' },
    method: 'GET',
    uri: '/dir/index.html',
    username: 'Mufasa',
    password: 'Circle Of Life',
    nc: 1,
    cnonce: '0a4f113b',
  });
  const p = parseChallenge(header);
  assert.equal(p.response, '6629fae49393a05397450978507c4ef1');
  assert.equal(p.nc, '00000001');
  assert.equal(p.qop, 'auth');
  assert.equal(p.opaque, '5ccc069c403ebaf9f0171e9517f40e41');
});

test('RFC 7616 SHA-256 example response', () => {
  const header = buildAuthorization({
    challenge: { realm: 'http-auth@example.org', nonce: '7ypf/xlj9XXwfDPEoM4URrv/xwf94BcCAzFZH4GiTo0v', qop: 'auth', algorithm: 'SHA-256', opaque: 'FQhe/qaU925kfnzjCev0ciny7QMkPqMAFRtzCUYo5tdS' },
    method: 'GET',
    uri: '/dir/index.html',
    username: 'Mufasa',
    password: 'Circle of Life',
    nc: 1,
    cnonce: 'f2/wE4q74E6zIJEtWaHKaf5wv/H5QzzpXusqGemxURZJ',
  });
  assert.equal(parseChallenge(header).response, '753927fa0e85d155564e2e272a28d1802ca10daf4496794697cf8db5856cb6c1');
});
