// The deployment policy module (api/_lib/policy.ts, INFRA-P19, 2026-10-01) is the one source for the canonical site,
// the origins the API admits and the Workers' URLs. Before it, eight runtime copies with three different contents
// lived in api/ice.ts, api/telemetry.ts, api/jev.ts, both wrangler.jsonc files, src/officialHost.ts,
// src/entry/telemetry.ts and src/presentation/siteMetadata.ts. The modules that can import it do; the copies that
// cannot (the Workers' `ALLOWED_ORIGINS` vars and the dependency-free entry telemetry module) are pinned here.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import * as policy from '../api/_lib/policy.ts';
import * as officialHost from '../src/officialHost.ts';
import { SITE_ORIGIN } from '../src/presentation/siteMetadata.ts';
import {
  OFFICIAL_SITE_HOST as ENTRY_SITE_HOST, OFFICIAL_TELEMETRY_URL as ENTRY_TELEMETRY_URL,
} from '../src/entry/telemetry.ts';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

/** JSON with `//` and block comments (wrangler's JSONC); strings keep their `//` (every origin has one). */
function parseJsonc(text) {
  let out = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      out += c;
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') inString = false;
    } else if (c === '"') {
      inString = true;
      out += c;
    } else if (c === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      out += '\n';
    } else if (c === '/' && text[i + 1] === '*') {
      i += 2;
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++;
      i++;
    } else {
      out += c;
    }
  }
  return JSON.parse(out);
}

assert.deepEqual(parseJsonc('{\n  // a comment with "quotes"\n  "a": "https://x.test", /* b */ "b": "c//d"\n}'),
  { a: 'https://x.test', b: 'c//d' }, 'the JSONC reader keeps // inside strings');

// 1. The policy itself: exact https origins, the canonical one first, the aliases and the protected domain admitted.
assert.equal(policy.CANONICAL_ORIGIN, `https://${policy.OFFICIAL_SITE_HOST}`);
assert.equal(policy.ALLOWED_ORIGINS[0], policy.CANONICAL_ORIGIN, 'the canonical origin leads the allow-list');
for (const origin of policy.ALLOWED_ORIGINS) {
  const url = new URL(origin);
  assert.equal(url.origin, origin, `${origin}: an exact origin (scheme and host, no path, port or slash)`);
  assert.equal(url.protocol, 'https:', `${origin}: production origins are https`);
}
assert.equal(new Set(policy.ALLOWED_ORIGINS).size, policy.ALLOWED_ORIGINS.length, 'no duplicate origin');
for (const host of [...policy.ALIAS_HOSTS, policy.PROTECTED_PRODUCTION_HOST]) {
  assert.ok(policy.ALLOWED_ORIGINS.includes(`https://${host}`), `${host} is admitted by the API`);
}
assert.ok(!policy.ALIAS_HOSTS.includes(policy.OFFICIAL_SITE_HOST), 'the canonical host is not its own alias');
assert.deepEqual(policy.ROOMS_ALLOWED_ORIGINS, [policy.CANONICAL_ORIGIN], 'rooms admit the canonical origin alone');
assert.deepEqual(policy.TELEMETRY_ALLOWED_ORIGINS, policy.ALLOWED_ORIGINS, 'telemetry admits the API origins');
for (const list of [policy.ALIAS_HOSTS, policy.ALLOWED_ORIGINS, policy.ROOMS_ALLOWED_ORIGINS, policy.OFFICIAL_STUN_URLS]) {
  assert.ok(Object.isFrozen(list), 'policy lists are frozen');
}
assert.ok(policy.OFFICIAL_STUN_URLS.length > 0 && policy.OFFICIAL_STUN_URLS.every((url) => /^stun:[a-z0-9.-]+:\d+$/.test(url)),
  'the official STUN servers are plain stun: URLs (no credential, no TURN)');
assert.equal(new URL(policy.OFFICIAL_ROOMS_URL).protocol, 'wss:');
assert.equal(new URL(policy.OFFICIAL_TELEMETRY_URL).protocol, 'https:');
assert.ok(policy.isOfficialSiteHost(' COT.kevinliu.studio ') && !policy.isOfficialSiteHost('claudeoftanks.kevinliu.studio')
  && !policy.isOfficialSiteHost(`${policy.OFFICIAL_SITE_HOST}:443`) && !policy.isOfficialSiteHost(null));
// The browser bundle imports the module (through src/officialHost.ts): it must stay dependency-free.
assert.doesNotMatch(read('api/_lib/policy.ts'), /^\s*(?:import|export\s+[^;]*\sfrom)\s/m,
  'api/_lib/policy.ts imports nothing (the browser and the rooms Worker program read it)');

// 2. The API allow-list: the deployment's origins, then COT_ALLOWED_ORIGINS as exact trimmed entries.
assert.deepEqual([...policy.allowedApiOrigins({})], [...policy.ALLOWED_ORIGINS]);
assert.deepEqual([...policy.allowedApiOrigins({ COT_ALLOWED_ORIGINS: ' https://frontend.example.test , ,https://b.example.test' })],
  [...policy.ALLOWED_ORIGINS, 'https://frontend.example.test', 'https://b.example.test']);

// 3. The browser's names are the policy's values; the dependency-free entry module repeats two of them verbatim.
assert.equal(officialHost.OFFICIAL_SITE_HOST, policy.OFFICIAL_SITE_HOST);
assert.equal(officialHost.OFFICIAL_ROOMS_URL, policy.OFFICIAL_ROOMS_URL);
assert.equal(officialHost.OFFICIAL_TELEMETRY_URL, policy.OFFICIAL_TELEMETRY_URL);
assert.equal(officialHost.isOfficialSiteHost, policy.isOfficialSiteHost);
assert.doesNotMatch(read('src/officialHost.ts'), /['"]https?:\/\/|kevinliu\.studio['"]|workers\.dev['"]/,
  'src/officialHost.ts re-exports the policy instead of repeating its literals');
assert.equal(SITE_ORIGIN, policy.CANONICAL_ORIGIN, 'site metadata uses the canonical origin');
assert.equal(ENTRY_SITE_HOST, policy.OFFICIAL_SITE_HOST, 'src/entry/telemetry.ts repeats OFFICIAL_SITE_HOST verbatim');
assert.equal(ENTRY_TELEMETRY_URL, policy.OFFICIAL_TELEMETRY_URL, 'src/entry/telemetry.ts repeats OFFICIAL_TELEMETRY_URL verbatim');

// 4. The Workers: ALLOWED_ORIGINS (wrangler vars) equal the policy exactly, and each URL names its Worker.
const allowedOriginsOf = (config) => String(config.vars?.ALLOWED_ORIGINS ?? '').split(',').map((value) => value.trim()).filter(Boolean);
for (const [path, expected] of [
  ['cloudflare/rooms/wrangler.jsonc', policy.ROOMS_ALLOWED_ORIGINS],
  ['cloudflare/rooms/wrangler.test.jsonc', policy.ROOMS_ALLOWED_ORIGINS],
  ['cloudflare/rooms/wrangler.relay.test.jsonc', policy.ROOMS_ALLOWED_ORIGINS],
  ['cloudflare/telemetry/wrangler.jsonc', policy.TELEMETRY_ALLOWED_ORIGINS],
]) {
  const config = parseJsonc(read(path));
  assert.deepEqual(allowedOriginsOf(config), [...expected],
    `${path}: ALLOWED_ORIGINS must equal api/_lib/policy.ts (a change goes live with that Worker's next deploy)`);
}
// 4-preview. 2026-10-30 (phone-controller-266, Main's ruling): the preview rooms Worker (env.preview) admits the policy's
// preview pattern alone, is its own Worker (name, Durable Object namespaces, limiter counters), and its URL names it.
{
  const rooms = parseJsonc(read('cloudflare/rooms/wrangler.jsonc'));
  const preview = rooms.env?.preview;
  assert.ok(preview, 'cloudflare/rooms/wrangler.jsonc has env.preview');
  assert.deepEqual(allowedOriginsOf(preview), [...policy.ROOMS_PREVIEW_ALLOWED_ORIGINS], 'env.preview ALLOWED_ORIGINS must equal ROOMS_PREVIEW_ALLOWED_ORIGINS');
  for (const pattern of policy.ROOMS_PREVIEW_ALLOWED_ORIGINS) {
    assert.equal(pattern.split('*').length, 2, `${pattern}: one wildcard label`);
    assert.match(pattern, /^https:\/\/[a-z0-9-]+-\*-kl01s-projects\.vercel\.app$/, `${pattern}: the team's preview deployments only`);
  }
  assert.equal(preview.vars?.COT_STUN_URLS, policy.OFFICIAL_STUN_URLS.join(','), 'env.preview COT_STUN_URLS');
  assert.notEqual(preview.name, rooms.name, 'the preview is its own Worker');
  assert.equal(new URL(policy.PREVIEW_ROOMS_URL).hostname.split('.')[0], preview.name, 'PREVIEW_ROOMS_URL names the preview Worker');
  const ids = (config) => (config.ratelimits ?? []).map((limit) => limit.namespace_id);
  for (const id of ids(preview)) assert.ok(!ids(rooms).includes(id), `limiter namespace ${id} is the preview's own`);
  assert.deepEqual((preview.durable_objects?.bindings ?? []).map((b) => b.class_name).sort(), ['PadPair', 'Room']);
  for (const name of ['COT_CLOUDFLARE_TURN_KEY_ID', 'COT_CLOUDFLARE_TURN_API_TOKEN', 'COT_TURN_SHARED_SECRET', 'MATCH_SEAT_SECRET']) {
    assert.equal(preview.vars?.[name], undefined, `env.preview commits no ${name} (a secret)`);
  }
}
// 4a. 2026-10-02 (docs/MULTIPLAYER-V2.md §13.14): the STUN servers a seat's relay grant carries without a TURN credential are the
// policy's in the deployed Worker and both test Workers; the relay test Worker's TURN key and token are fake test values, and
// no Worker configuration commits a real relay secret (those are `wrangler secret put`, names only).
for (const path of ['cloudflare/rooms/wrangler.jsonc', 'cloudflare/rooms/wrangler.test.jsonc', 'cloudflare/rooms/wrangler.relay.test.jsonc']) {
  const vars = parseJsonc(read(path)).vars ?? {};
  assert.equal(vars.COT_STUN_URLS, policy.OFFICIAL_STUN_URLS.join(','), `${path}: COT_STUN_URLS must equal OFFICIAL_STUN_URLS of api/_lib/policy.ts`);
  for (const name of ['COT_TURN_SHARED_SECRET', 'COT_TURN_ICE_SERVERS_JSON']) assert.equal(vars[name], undefined, `${path} commits no ${name}`);
  if (path === 'cloudflare/rooms/wrangler.relay.test.jsonc') {
    assert.match(String(vars.COT_CLOUDFLARE_TURN_KEY_ID), /^relay-test-/, 'the relay test Worker\'s key id is a test value');
    assert.match(String(vars.COT_CLOUDFLARE_TURN_API_TOKEN), /^relay-test-/, 'the relay test Worker\'s token is a test value');
  } else {
    for (const name of ['COT_CLOUDFLARE_TURN_KEY_ID', 'COT_CLOUDFLARE_TURN_API_TOKEN']) assert.equal(vars[name], undefined, `${path} commits no ${name} (a secret)`);
  }
}

for (const [url, dir] of [[policy.OFFICIAL_ROOMS_URL, 'rooms'], [policy.OFFICIAL_TELEMETRY_URL, 'telemetry']]) {
  const config = parseJsonc(read(`cloudflare/${dir}/wrangler.jsonc`));
  assert.equal(new URL(url).hostname.split('.')[0], config.name, `${dir}: the policy URL names the Worker in cloudflare/${dir}/wrangler.jsonc`);
}

// 4b. INFRA-P2 (2026-10-01): each Worker counts its own rate limits. Bindings that share a namespace_id share their
// counters per key (Cloudflare), and rooms reused telemetry's 2609055512, so room upgrades and telemetry posts from one
// address (a household, a LAN party) spent each other's budget. 2609055511 stays the retired signaling Worker's
// (cot-private-rooms is still deployed). A namespace change goes live with that Worker's next deploy.
const namespacesOf = (config) => (config.ratelimits || []).map((limit) => String(limit.namespace_id));
const roomsNamespaces = namespacesOf(parseJsonc(read('cloudflare/rooms/wrangler.jsonc')));
const telemetryNamespaces = namespacesOf(parseJsonc(read('cloudflare/telemetry/wrangler.jsonc')));
// 2026-10-30 (phone-controller-266): the phone controller's pairing counts its own upgrades (PAD_CONNECT_LIMITER)
assert.deepEqual(roomsNamespaces, ['2609055513', '2610300266'], 'the rooms and pad limiters have their own namespaces');
assert.deepEqual(telemetryNamespaces, ['2609055512'], 'the telemetry limiter keeps its namespace');
assert.deepEqual(namespacesOf(parseJsonc(read('cloudflare/rooms/wrangler.test.jsonc'))), roomsNamespaces,
  'the rooms test configuration mirrors the deployed binding');
assert.deepEqual(namespacesOf(parseJsonc(read('cloudflare/rooms/wrangler.relay.test.jsonc'))), roomsNamespaces,
  'the relay test configuration mirrors the deployed binding');
const previewNamespaces = namespacesOf(parseJsonc(read('cloudflare/rooms/wrangler.jsonc')).env.preview);
const allNamespaces = [...roomsNamespaces, ...telemetryNamespaces, ...previewNamespaces];
assert.equal(new Set(allNamespaces).size, allNamespaces.length, 'no two Workers share a rate-limit namespace');
assert.ok(!allNamespaces.includes('2609055511'), 'the retired signaling Worker\'s namespace stays unused');

// 5. No API function keeps its own copy of the allow-list.
const apiFiles = readdirSync(new URL('../api/', import.meta.url)).filter((file) => file.endsWith('.ts'));
assert.ok(apiFiles.length >= 3, 'the API functions are found');
for (const file of apiFiles) {
  const source = read(`api/${file}`);
  for (const host of [...policy.ALIAS_HOSTS, policy.PROTECTED_PRODUCTION_HOST]) {
    assert.ok(!source.includes(host), `api/${file} repeats ${host}: use allowedApiOrigins from api/_lib/policy.ts`);
  }
  assert.doesNotMatch(source, /OFFICIAL_ORIGINS\s*=|function configuredOrigins/, `api/${file} keeps no private allow-list`);
}

console.log(`deployment-policy.selftest: one policy module — ${policy.ALLOWED_ORIGINS.length} API origins, rooms ${policy.ROOMS_ALLOWED_ORIGINS.length}, `
  + 'both Workers\' ALLOWED_ORIGINS, the browser re-export, the site origin and the entry literals agree; no API copy');
