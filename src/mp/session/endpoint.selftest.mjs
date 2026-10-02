// The room host a page resolves: the configured ws/wss origin, the official site's Worker when the build carries no usable
// value (Vercel's sensitive placeholder `[SENSITIVE]`, deploy 114, 2026-09-28), the LAN helper on a local host, null elsewhere.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as endpoint from './endpoint.ts';
import { LAN_ROOMS_PORT, configuredRoomsUrl, resolveRoomsUrl } from './endpoint.ts';
import { OFFICIAL_ROOMS_URL, OFFICIAL_SITE_HOST, OFFICIAL_TELEMETRY_URL, isOfficialSiteHost } from '../../officialHost.ts';
import { SITE_ORIGIN } from '../../presentation/siteMetadata.ts';

const official = { protocol: 'https:', hostname: OFFICIAL_SITE_HOST };
assert.equal(resolveRoomsUrl({ configured: 'wss://rooms.example.test/', ...official }), 'wss://rooms.example.test', 'a configured wss origin wins');
assert.equal(resolveRoomsUrl({ configured: '[SENSITIVE]', ...official }), OFFICIAL_ROOMS_URL, 'the sensitive placeholder on the site → its Worker');
assert.equal(resolveRoomsUrl({ configured: undefined, ...official }), OFFICIAL_ROOMS_URL, 'an unset value on the site → its Worker');
assert.equal(resolveRoomsUrl({ configured: 'https://not-a-socket.test', ...official }), OFFICIAL_ROOMS_URL, 'a non-socket URL is not configured');
assert.equal(resolveRoomsUrl({ configured: '', protocol: 'https:', hostname: 'COT.kevinliu.studio' }), OFFICIAL_ROOMS_URL, 'the host compares case-insensitively');
assert.equal(resolveRoomsUrl({ configured: '[SENSITIVE]', protocol: 'https:', hostname: 'claude-of-tanks-abc.vercel.app' }), null, 'a preview host has no rooms host');
assert.equal(resolveRoomsUrl({ configured: '[SENSITIVE]', protocol: 'http:', hostname: '127.0.0.1' }), `ws://127.0.0.1:${LAN_ROOMS_PORT}`, 'a local host keeps the LAN helper');
assert.equal(resolveRoomsUrl({ configured: '', protocol: 'https:', hostname: '192.168.1.20' }), `wss://192.168.1.20:${LAN_ROOMS_PORT}`, 'RFC1918 over https → wss helper');
assert.throws(() => resolveRoomsUrl({ configured: 'wss://user:pw@rooms.example.test', ...official }), /credentials/, 'credentials in a real socket URL still throw');
assert.throws(() => resolveRoomsUrl({ configured: 'ws://rooms.example.test', ...official }), /mixed content/, 'ws on an https page still throws');
assert.equal(configuredRoomsUrl('[SENSITIVE]'), null); assert.equal(configuredRoomsUrl(null), null);
assert.equal(configuredRoomsUrl('wss://a.b')?.host, 'a.b');
assert.ok(isOfficialSiteHost(' Cot.Kevinliu.Studio ') && !isOfficialSiteHost('cot.kevinliu.studio:443') && !isOfficialSiteHost(undefined));
// The constants agree with the site's canonical origin and the Workers' names in the repo (docs/DEPLOYS.md rows name the URLs).
assert.equal(new URL(SITE_ORIGIN).host, OFFICIAL_SITE_HOST, 'OFFICIAL_SITE_HOST is the canonical site host');
for (const [url, dir] of [[OFFICIAL_ROOMS_URL, 'rooms'], [OFFICIAL_TELEMETRY_URL, 'telemetry']]) {
  const name = /"name":\s*"([^"]+)"/.exec(readFileSync(new URL(`../../../cloudflare/${dir}/wrangler.jsonc`, import.meta.url), 'utf8'))?.[1];
  assert.equal(new URL(url).hostname.split('.')[0], name, `${dir}: the official URL names the Worker in cloudflare/${dir}/wrangler.jsonc`);
}
// src/entry/telemetry.ts imports nothing (its own receipt pins that), so it repeats the two literals: they must match officialHost.ts.
const telemetrySource = readFileSync(new URL('../../entry/telemetry.ts', import.meta.url), 'utf8');
assert.equal(/OFFICIAL_SITE_HOST = '([^']+)'/.exec(telemetrySource)?.[1], OFFICIAL_SITE_HOST, 'telemetry.ts repeats OFFICIAL_SITE_HOST verbatim');
assert.equal(/OFFICIAL_TELEMETRY_URL = '([^']+)'/.exec(telemetrySource)?.[1], OFFICIAL_TELEMETRY_URL, 'telemetry.ts repeats OFFICIAL_TELEMETRY_URL verbatim');
console.log('endpoint.selftest: configured / official / LAN / preview room hosts, the sensitive placeholder, the Worker names');

// The ICE credential endpoint left with the relay credentials' move into the room (2026-10-02, docs/MULTIPLAYER-V2.md
// §13.14): a page resolves the room host alone, and a private room's ICE comes from the room it is seated in.
assert.equal('resolveIceConfigUrl' in endpoint, false, 'no ICE endpoint is resolved beside the room host any more');
assert.doesNotMatch(readFileSync(new URL('./endpoint.ts', import.meta.url), 'utf8'), /api\/ice|VITE_ICE_CONFIG_URL/, 'endpoint.ts names no credential endpoint');
console.log('endpoint.selftest: no ICE credential endpoint beside the room host (the room mints the relay credentials)');
