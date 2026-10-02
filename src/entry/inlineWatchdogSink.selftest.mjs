// The inline boot watchdog's telemetry sink (INFRA-P3, 2026-10-01). The deploy strips the sensitive
// VITE_TELEMETRY_URL, so the live document ships `<meta name="cot-telemetry" data-url="">`; the module client recovers
// the official Worker through its official-host rule (telemetryEndpoints in src/entry/telemetry.ts) but the inline
// watchdog posted every terminal verdict to /api/telemetry, a log kept one day. The watchdog now applies the same rule.
// Part 1 holds its pure rule to telemetryEndpoints() over a matrix; part 2 runs the real inline script and reads the
// endpoint its first beacon goes to.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { OFFICIAL_SITE_HOST, OFFICIAL_TELEMETRY_URL } from '../../api/_lib/policy.ts';
import { telemetryEndpoints } from './telemetry.ts';

const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const script = html.match(/<script>\s*(\/\/ CHUNK RECOVERY[\s\S]*?)<\/script>/)?.[1];
assert.ok(script, 'the inline watchdog stays ahead of the module entry');

// The inline literals are the deployment policy's (an inline script cannot import it).
assert.equal(/const OFFICIAL_SITE_HOST = '([^']+)'/.exec(script)?.[1], OFFICIAL_SITE_HOST, 'inline OFFICIAL_SITE_HOST');
assert.equal(/const OFFICIAL_TELEMETRY_URL = '([^']+)'/.exec(script)?.[1], OFFICIAL_TELEMETRY_URL, 'inline OFFICIAL_TELEMETRY_URL');

// Part 1: the pure rule, evaluated on its own, against the module client's rule.
const ruleSource = script.match(/const OFFICIAL_SITE_HOST[\s\S]*?\n {6}function telemetryErrorEndpoint\([\s\S]*?\n {6}\}\n/)?.[0];
assert.ok(ruleSource, 'the watchdog names its sink rule telemetryErrorEndpoint');
const sandbox = {};
runInNewContext(`${ruleSource}\nthis.telemetryErrorEndpoint = telemetryErrorEndpoint;`, sandbox);
const inlineEndpoint = sandbox.telemetryErrorEndpoint;
const bases = ['', '   ', '[SENSITIVE]', 'on', 'https://sink.example.test', 'https://sink.example.test///', ' https://sink.example.test/ ',
  'http://localhost:8787', 'ftp://not-a-sink.example.test', null, undefined];
const hosts = [OFFICIAL_SITE_HOST, ` ${OFFICIAL_SITE_HOST.toUpperCase()} `, 'claudeoftanks.kevinliu.studio', 'claude-of-tanks.vercel.app',
  'claude-of-tanks-abc123-kl01s-projects.vercel.app', `${OFFICIAL_SITE_HOST}.evil.test`, 'localhost', '', undefined];
let cases = 0;
for (const base of bases) {
  for (const hostname of hosts) {
    assert.equal(inlineEndpoint(base, hostname), telemetryEndpoints(base, hostname).error,
      `data-url ${JSON.stringify(base)} on ${JSON.stringify(hostname)}: the watchdog and the module client agree`);
    cases++;
  }
}
assert.equal(inlineEndpoint('', OFFICIAL_SITE_HOST), `${OFFICIAL_TELEMETRY_URL}/v1/error`, 'the live case: empty data-url on the official host');
assert.equal(inlineEndpoint('', 'claude-of-tanks-abc123-kl01s-projects.vercel.app'), '/api/telemetry', 'any other host keeps the fallback');
assert.equal(inlineEndpoint('https://sink.example.test/', OFFICIAL_SITE_HOST), 'https://sink.example.test/v1/error', 'a configured sink wins');

// Part 2: the real script, its first retry surface beacons — where does it go?
function firstBeaconEndpoint({ hostname, dataUrl }) {
  const timers = [];
  const beacons = [];
  let now = 1_000_000;
  const window = { __GAME_READY: false };
  const href = `https://${hostname || 'game.test'}/?tank=leo1a5`;
  const context = {
    window,
    document: {
      hidden: false,
      body: { appendChild() {} },
      createElement: () => ({ classList: { add() {} }, style: {} }),
      getElementById: () => null,
      querySelector: (selector) => (selector.includes('application-version') ? { getAttribute: () => 'v1.0.0+gabc1234' }
        : selector.includes('cot-telemetry') ? { getAttribute: (name) => (name === 'data-url' ? dataUrl : 'on') } : null),
      querySelectorAll: () => ({ length: 3 }),
    },
    navigator: { onLine: true, sendBeacon(endpoint, body) { beacons.push({ endpoint, body: JSON.parse(body) }); return true; } },
    location: { href, hostname, search: '?tank=leo1a5', replace() {} },
    history: { replaceState() {} },
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    addEventListener() {},
    setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; },
    clearTimeout(id) { if (timers[id - 1]) timers[id - 1].cancelled = true; },
    setInterval: () => 1,
    clearInterval() {},
    URL,
    Date: { now: () => now },
    Math,
    PerformanceObserver: class { observe() {} },
    fetch: () => Promise.resolve({ ok: true }),
  };
  runInNewContext(script, context);
  now += 31_000;
  for (const timer of timers.filter((entry) => !entry.cancelled && entry.ms === 30000)) timer.fn();
  assert.ok(beacons.length >= 1, `${hostname}: the silent-download notice beacons`);
  assert.equal(beacons[0].body.kind, 'error');
  return beacons[0].endpoint;
}
assert.equal(firstBeaconEndpoint({ hostname: OFFICIAL_SITE_HOST, dataUrl: '' }), `${OFFICIAL_TELEMETRY_URL}/v1/error`,
  'on the official host an empty data-url reaches the telemetry Worker (Analytics Engine), not the one-day function log');
assert.equal(firstBeaconEndpoint({ hostname: 'claude-of-tanks-abc123-kl01s-projects.vercel.app', dataUrl: '' }), '/api/telemetry',
  'a deployment URL keeps the Vercel fallback');
assert.equal(firstBeaconEndpoint({ hostname: OFFICIAL_SITE_HOST, dataUrl: 'https://sink.example.test' }), 'https://sink.example.test/v1/error',
  'a build-time sink still wins');

console.log(`inlineWatchdogSink.selftest: the inline watchdog's sink equals telemetryEndpoints() on ${cases} cases; the real script beacons to the Worker on the official host`);
