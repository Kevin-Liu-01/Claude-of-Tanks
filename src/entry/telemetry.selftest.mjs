import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  createEntryTelemetry, describeError, installEntryErrorTelemetry, randomSessionId,
  setTelemetryOptOut, TELEMETRY_ENDPOINT, TELEMETRY_OPT_OUT_KEY, telemetryBuild, telemetryCode,
  telemetryDisabledReason, telemetryEndpoints, telemetryOptOutStored, telemetrySampleRate,
} from './telemetry.ts';
import { validateTelemetryRecord } from '../../server/telemetryRecord.ts';

// The client is exercised in Node with an injected transport, scheduler and
// clock: no DOM, no timers, no network. Every body it produces is then run
// through the shared v2 validator so the client and the sinks cannot drift.

const endpoints = telemetryEndpoints('https://cot-telemetry.example.workers.dev/');
const CAPABILITY = { webgl2: true, rendererFamily: 'apple', software: false, maxTextureUnits: 16, maxTextureSize: 16384,
  vertexTextureUnits: 16, colorBufferFloat: true, storage: true, worker: true, memoryClass: 'high', tier: 'desktop',
  autoTier: 'high', requiredTextureUnits: 16 };

function fixture(options = {}) {
  const bodies = [];
  const timers = [];
  let clock = 10_000;
  const telemetry = createEntryTelemetry({
    build: 'v1.0.0+gabc1234', sessionId: 'sess_fixture_1', origin: 'https://cot.kevinliu.studio', endpoints,
    now: () => clock,
    transport: (endpoint, body) => { bodies.push({ endpoint, body: JSON.parse(body), text: body }); return true; },
    schedule: (callback, delayMs) => { timers.push({ callback, delayMs }); return timers.length; },
    cancel: (handle) => { const timer = timers[handle - 1]; if (timer) timer.cancelled = true; },
    ...options,
  });
  const runTimers = () => {
    for (const timer of timers.filter((entry) => !entry.ran && !entry.cancelled)) { timer.ran = true; timer.callback(); }
  };
  return { telemetry, bodies, timers, runTimers, advance: (ms) => { clock += ms; } };
}

function accepted(body) {
  const validation = validateTelemetryRecord(body);
  assert.equal(validation.ok, true, `server accepts client body: ${JSON.stringify(validation)}`);
  return validation.record;
}

/** A realistic boot: twelve stages with gaps, the capability summary, then ready. */
function cleanBoot(f, { readyMs = 4200 } = {}) {
  const stages = ['renderer', 'sky', 'lighting', 'garage', 'vehicle', 'hud', 'ui', 'audio', 'post', 'ready'];
  const timings = { imports: 12 };
  f.telemetry.stage('renderer', 'begin');
  f.telemetry.send({ kind: 'capability', outcome: 'ok', capability: CAPABILITY });
  stages.forEach((stage, index) => {
    f.telemetry.stage(stage, 'begin');
    f.telemetry.stage(stage, 'end', 100 * (index + 1) + 0.4);
    timings[stage] = 100 * (index + 1);
    timings[`gap>${stage}`] = 3;
  });
  f.telemetry.send({ kind: 'boot_ready', ms: readyMs, mode: 'unknown', timings });
  return timings;
}

{
  const f = fixture();
  assert.equal(f.telemetry.enabled, true);
  assert.equal(f.telemetry.currentStage, 'imports');
  assert.equal(f.telemetry.outcome, null);
  const timings = cleanBoot(f);
  assert.equal(f.telemetry.currentStage, 'ready');
  assert.equal(f.bodies.length, 1, 'a clean boot is exactly one request');
  assert.equal(f.telemetry.sent, 1);
  assert.equal(f.telemetry.outcome, 'ready');
  assert.equal(f.bodies[0].endpoint, endpoints.session);
  assert.ok(f.bodies[0].text.length <= 1500, `the session body stays under 1.5 KB (${f.bodies[0].text.length})`);
  const session = accepted(f.bodies[0].body);
  assert.equal(session.kind, 'session');
  assert.equal(session.outcome, 'ready');
  assert.equal(session.stage, 'ready');
  assert.equal(session.ms, 4200);
  assert.equal(session.mode, 'unknown');
  assert.equal(session.sid, 'sess_fixture_1');
  assert.equal(session.build, 'v1.0.0+gabc1234');
  assert.equal(session.w, undefined, 'an unsampled session carries no weight');
  assert.deepEqual(session.cap, CAPABILITY, 'the capability summary travels once, inside the session record');
  assert.equal(session.capOutcome, 'ok');
  assert.equal(Object.keys(session.t).length, Object.keys(timings).length);
  assert.equal(session.t.vehicle, 500, 'stage ends become the timings map');
  assert.equal(session.t['gap>sky'], 3, 'boot_ready merges the lifecycle gaps');
  assert.equal(session.error, undefined);
  assert.equal(f.timers.length, 0, 'nothing is left scheduled after a clean boot');

  f.telemetry.send({ kind: 'slow_reveal', stage: 'primeReveal', code: 'extended', ms: 1600 });
  f.telemetry.send({ kind: 'slow_reveal', stage: 'primeReveal', code: 'extended', ms: 1700 });
  assert.equal(f.bodies.length, 1, 'a slow reveal is a note, never a request');
  f.telemetry.send({ kind: 'entry_result', mode: 'solo', outcome: 'ok', ms: 3000.6, code: 'slow extended!' });
  assert.equal(f.bodies.length, 2, 'a battle entry after the beacon is one small follow-up');
  assert.equal(f.bodies[1].endpoint, endpoints.session);
  const entry = accepted(f.bodies[1].body);
  assert.equal(entry.kind, 'entry');
  assert.equal(entry.outcome, 'ok');
  assert.equal(entry.mode, 'solo');
  assert.equal(entry.ms, 3001);
  assert.equal(entry.code, 'slow_extended', 'codes are bounded to the beacon alphabet before they leave');
  assert.deepEqual(entry.notes, ['slow_reveal:extended'], 'pending notes ride on the next record, deduplicated');
  assert.ok(f.bodies[1].text.length < 300, `the entry follow-up is small (${f.bodies[1].text.length})`);
  f.telemetry.flush();
  f.telemetry.flushPending();
  assert.equal(f.bodies.length, 2, 'pagehide after a clean session costs nothing');
  f.telemetry.send({ kind: 'entry_result', mode: 'solo', outcome: 'ok' });
  assert.equal(f.bodies.length, 3, 'a second battle spends the last of the three-request budget');
  f.telemetry.send({ kind: 'entry_result', mode: 'solo', outcome: 'failed', code: 'entry_failed' });
  assert.equal(f.telemetry.error('post', new Error('after budget')), true, 'the error is accepted for the count');
  f.runTimers();
  assert.equal(f.bodies.length, 3, 'the request budget is three per session, whatever happens later');
}

{
  const f = fixture();
  f.telemetry.stage('renderer', 'begin');
  f.telemetry.stage('renderer', 'end', 40);
  f.telemetry.stage('sky', 'begin');
  const error = new Error('Injected sky failure');
  error.stack = [
    'Error: Injected sky failure',
    '    at bake (https://cot.kevinliu.studio/assets/sky-Ab12Cd34.js:10:20)',
    '    at run (https://cot.kevinliu.studio/assets/main-Ef56Gh78.js:30:40)',
    '    at async boot (https://cot.kevinliu.studio/assets/main-Ef56Gh78.js:50:60)',
    '    at fourth (https://cot.kevinliu.studio/assets/main-Ef56Gh78.js:70:80)',
  ].join('\n');
  assert.equal(f.telemetry.error(null, error, 'uncaught'), true);
  assert.equal(f.telemetry.error(null, new Error('Injected sky failure'), 'unhandled_rejection'), false,
    'the same message is reported once per session');
  assert.equal(f.telemetry.error('sky', new Error('Second failure'), 'unhandled_rejection'), true);
  assert.equal(f.bodies.length, 0, 'errors coalesce for a second instead of leaving one by one');
  assert.deepEqual(f.timers.map(({ delayMs }) => delayMs), [1000]);
  f.advance(1000);
  f.runTimers();
  assert.equal(f.bodies.length, 2, 'the first error sends the session record; the burst rides in one error record');
  const session = accepted(f.bodies[0].body);
  assert.equal(session.kind, 'session');
  assert.equal(session.outcome, 'error');
  assert.equal(session.stage, 'sky');
  assert.equal(session.ms, 1000, 'a session that never reached ready reports the time elapsed');
  assert.deepEqual(session.t, { renderer: 40 });
  assert.equal(session.error.stage, 'sky', 'an error without an explicit stage is attributed to the current one');
  assert.equal(session.error.code, 'uncaught');
  assert.equal(session.error.message, 'Injected sky failure');
  assert.deepEqual(session.error.frames, [
    'at bake (/assets/sky-Ab12Cd34.js:10:20)',
    'at run (/assets/main-Ef56Gh78.js:30:40)',
    'at async boot (/assets/main-Ef56Gh78.js:50:60)',
  ], 'three origin-stripped frames travel with the message');
  assert.equal(f.bodies[1].endpoint, endpoints.error);
  const second = accepted(f.bodies[1].body);
  assert.equal(second.kind, 'error');
  assert.equal(second.stage, 'sky');
  assert.equal(second.code, 'unhandled_rejection');
  assert.equal(second.ready, false);
  assert.equal(second.error.message, 'Second failure');
  assert.equal(f.telemetry.outcome, 'error');
  assert.equal(f.telemetry.error('sky', new Error('Third failure')), true);
  assert.equal(f.telemetry.error('sky', new Error('Fourth failure')), false, 'three errors per session');
  f.runTimers();
  assert.equal(f.bodies.length, 3, 'a failing session is at most three requests');
  assert.equal(accepted(f.bodies[2].body).error.message, 'Third failure');
  f.telemetry.send({ kind: 'boot_ready', ms: 9000 });
  assert.equal(f.bodies.length, 3, 'a late ready after the session record left changes nothing');
}

{
  const f = fixture();
  f.telemetry.stage('renderer', 'begin');
  f.telemetry.send({ kind: 'capability', outcome: 'halted', code: 'no_webgl2', reason: 'no_webgl2',
    capability: { ...CAPABILITY, webgl2: false, rendererFamily: 'unknown' } });
  assert.equal(f.bodies.length, 1, 'a capability stop ends the session at once');
  const halted = accepted(f.bodies[0].body);
  assert.equal(halted.outcome, 'halted');
  assert.equal(halted.capOutcome, 'halted');
  assert.equal(halted.capCode, 'no_webgl2');
  assert.equal(halted.cap.webgl2, false);
  assert.equal(halted.stage, 'renderer');

  const left = fixture();
  left.telemetry.stage('renderer', 'begin');
  left.telemetry.stage('renderer', 'end', 40);
  left.telemetry.stage('vehicle', 'begin');
  left.advance(7000);
  left.telemetry.flushPending();
  assert.equal(left.bodies.length, 0, 'a hidden tab mid-boot sends nothing: the boot may still finish');
  left.telemetry.flush();
  assert.equal(left.bodies.length, 1, 'pagehide before ready sends the session as left');
  const record = accepted(left.bodies[0].body);
  assert.equal(record.outcome, 'left');
  assert.equal(record.stage, 'vehicle');
  assert.equal(record.ms, 7000);
  left.telemetry.flush();
  assert.equal(left.bodies.length, 1, 'the session record leaves once');

  const notice = fixture();
  notice.telemetry.send({ kind: 'capability', outcome: 'notice', code: 'software_rendering', capability: { ...CAPABILITY, software: true } });
  notice.telemetry.send({ kind: 'entry_result', mode: 'studio', outcome: 'ok' });
  notice.telemetry.send({ kind: 'boot_ready', ms: 12000, mode: 'studio' });
  assert.equal(notice.bodies.length, 1);
  const folded = accepted(notice.bodies[0].body);
  assert.equal(folded.capOutcome, 'notice');
  assert.equal(folded.capCode, 'software_rendering');
  assert.deepEqual(folded.entry, { outcome: 'ok', mode: 'studio' }, 'an entry before the beacon folds into the session record');
  assert.equal(folded.mode, 'studio');

  const hidden = fixture();
  hidden.telemetry.error('sky', new Error('hidden failure'));
  hidden.telemetry.flushPending();
  assert.equal(hidden.bodies.length, 1, 'hiding the page sends a pending error at once');
  assert.equal(accepted(hidden.bodies[0].body).error.message, 'hidden failure');
}

{
  const out = fixture({ sample: 0.5, random: () => 0.9 });
  cleanBoot(out);
  assert.equal(out.bodies.length, 0, 'a clean session outside the sample sends nothing');
  out.telemetry.send({ kind: 'entry_result', mode: 'solo', outcome: 'ok' });
  assert.equal(out.bodies.length, 0, 'nor does its clean battle entry');
  out.telemetry.send({ kind: 'entry_result', mode: 'solo', outcome: 'failed', code: 'entry_failed' });
  assert.equal(out.bodies.length, 1, 'a failure inside an unsampled session still sends');
  assert.equal(accepted(out.bodies[0].body).w, undefined);
  out.telemetry.error('post', new Error('sampled-out error'));
  out.runTimers();
  assert.equal(out.bodies.length, 2);
  assert.equal(accepted(out.bodies[1].body).ready, true, 'an error after ready says so');

  const kept = fixture({ sample: 0.25, random: () => 0.1 });
  cleanBoot(kept);
  assert.equal(kept.bodies.length, 1);
  assert.equal(accepted(kept.bodies[0].body).w, 4, 'a sampled clean session carries its weight');
  const failing = fixture({ sample: 0.25, random: () => 0.9 });
  failing.telemetry.error('sky', new Error('before ready'));
  failing.runTimers();
  assert.equal(failing.bodies.length, 1, 'a failing session is never sampled out');
  assert.equal(accepted(failing.bodies[0].body).w, undefined);
}

{
  const full = fixture();
  cleanBoot(full);
  const size = full.bodies[0].text.length;
  const f = fixture({ maxBodyBytes: size - 20 });
  cleanBoot(f);
  const text = f.bodies[0].text;
  assert.ok(text.length <= size - 20, `a session over the budget is trimmed (${text.length})`);
  const trimmed = accepted(f.bodies[0].body);
  assert.deepEqual(trimmed.cap, CAPABILITY, 'gap timings go before the capability summary');
  assert.equal(Object.keys(trimmed.t).some((key) => key.includes('>')), false);
  const tighter = fixture({ maxBodyBytes: size - 200 });
  cleanBoot(tighter);
  assert.ok(tighter.bodies[0].text.length <= size - 200, `the capability summary is dropped next (${tighter.bodies[0].text.length})`);
  assert.equal(accepted(tighter.bodies[0].body).cap, undefined);
  assert.equal(accepted(tighter.bodies[0].body).t.vehicle, 500, 'named stage timings survive every trim');

  const big = fixture();
  big.telemetry.stage('sky', 'begin');
  for (let i = 0; i < 30; i++) big.telemetry.stage(`gap>stage${i}`, 'end', i);
  big.telemetry.error('sky', Object.assign(new Error('x'.repeat(200)), { stack: Array.from({ length: 4 }, (_, i) => `    at f${i} (https://cot.kevinliu.studio/assets/${'y'.repeat(120)}.js:1:1)`).join('\n') }));
  big.runTimers();
  assert.equal(big.bodies.length, 1);
  assert.ok(big.bodies[0].text.length <= 1500, `a maximal folded error still fits the 1.5 KB budget (${big.bodies[0].text.length})`);
  const record = accepted(big.bodies[0].body);
  assert.equal(Object.keys(record.t).length <= 24, true, 'the timings map keeps at most 24 entries');
  assert.equal(record.error.message.length, 200);

  const named = fixture();
  for (let i = 0; i < 24; i++) named.telemetry.stage(`gap>s${i}`, 'end', 1);
  named.telemetry.send({ kind: 'boot_ready', ms: 100, timings: { vehicle: 900, 'gap>late': 5 } });
  const fullMap = accepted(named.bodies[0].body);
  assert.equal(fullMap.t.vehicle, 900, 'a named stage displaces a gap entry once the map is full');
  assert.equal(fullMap.t['gap>late'], undefined, 'a late gap entry does not');
  assert.equal(Object.keys(fullMap.t).length, 24);
}

{
  const f = fixture({ enabled: false });
  assert.equal(f.telemetry.send({ kind: 'boot_ready' }), false);
  f.telemetry.stage('renderer', 'begin');
  f.telemetry.error('renderer', new Error('never sent'));
  f.telemetry.flush();
  f.telemetry.flushPending();
  assert.equal(f.bodies.length, 0, 'a disabled client sends nothing at all');
  const throwing = fixture({ transport: () => { throw new Error('beacon refused'); } });
  throwing.telemetry.send({ kind: 'boot_ready', ms: 1 });
  assert.equal(throwing.telemetry.sent, 1, 'a throwing transport never reaches the caller');
  assert.equal(fixture().telemetry.send({ kind: 'made_up' }), false);
  assert.equal(fixture().telemetry.send({ kind: 'entry_result' }), false, 'an entry result needs an outcome');
}

{
  const storage = new Map();
  const store = { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key) };
  assert.equal(telemetryDisabledReason({}), null);
  assert.equal(telemetryDisabledReason({ selfHosted: true, search: '?telemetry=on' }), 'self-hosted');
  assert.equal(telemetryDisabledReason({ search: '?tank=leo&telemetry=off' }), 'query');
  assert.equal(telemetryDisabledReason({ navigator: { doNotTrack: '1' } }), 'dnt');
  assert.equal(telemetryDisabledReason({ windowDoNotTrack: '1' }), 'dnt');
  assert.equal(telemetryDisabledReason({ navigator: { globalPrivacyControl: true } }), 'dnt');
  assert.equal(telemetryDisabledReason({ navigator: { webdriver: true } }), 'webdriver');
  assert.equal(telemetryDisabledReason({ navigator: { webdriver: true }, search: '?telemetry=on' }), null,
    'a probe can opt back in through the URL');
  setTelemetryOptOut(true, store);
  assert.equal(storage.get(TELEMETRY_OPT_OUT_KEY), 'off');
  assert.equal(telemetryOptOutStored(store), true);
  assert.equal(telemetryDisabledReason({ storage: store }), 'stored');
  setTelemetryOptOut(false, store);
  assert.equal(telemetryOptOutStored(store), false);
  assert.equal(telemetryDisabledReason({ storage: store }), null);
  const blocked = { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); },
    removeItem() { throw new Error('blocked'); } };
  assert.equal(telemetryDisabledReason({ storage: blocked }), null, 'blocked storage is not an opt-out');
  setTelemetryOptOut(true, blocked);
}

{
  const listeners = new Map();
  const host = {
    location: { origin: 'https://cot.kevinliu.studio' },
    addEventListener: (type, listener) => listeners.set(type, listener),
    removeEventListener: (type) => listeners.delete(type),
  };
  const f = fixture();
  const dispose = installEntryErrorTelemetry(f.telemetry, host);
  f.telemetry.stage('lighting', 'begin');
  listeners.get('error')({ target: host, filename: 'https://cot.kevinliu.studio/assets/main-x.js',
    error: new Error('same-origin failure') });
  listeners.get('error')({ target: host, filename: 'chrome-extension://abc/content.js',
    error: new Error('extension failure') });
  listeners.get('error')({ target: { tagName: 'IMG' }, error: null });
  listeners.get('error')({ target: host, filename: '', error: new Error('source-less failure') });
  listeners.get('unhandledrejection')({ reason: new Error('rejected promise') });
  listeners.get('unhandledrejection')({ reason: 'string rejection' });
  f.runTimers();
  const records = f.bodies.map(({ body }) => accepted(body));
  const reported = records.flatMap((record) => [record.error, ...(record.errors || [])].filter(Boolean)
    .map((error) => [error.stage || record.stage, error.code || record.code, error.message]));
  assert.deepEqual(reported, [
    ['lighting', 'uncaught', 'same-origin failure'],
    ['lighting', 'uncaught', 'source-less failure'],
    ['lighting', 'unhandled_rejection', 'rejected promise'],
  ], 'same-origin and source-less exceptions plus rejections report against the current stage, three per session; extensions and resources do not');
  assert.equal(f.bodies.length, 2, 'the burst is the session record plus one error record');
  dispose();
  assert.equal(listeners.size, 0);
}

{
  assert.deepEqual(describeError('plain text'), { message: 'plain text', frames: [] });
  assert.deepEqual(describeError(null), { message: 'unknown', frames: [] });
  const firefox = Object.assign(new Error('ff'), { stack: 'bake@https://cot.kevinliu.studio/assets/sky-1.js:1:2\nrun@https://cot.kevinliu.studio/assets/main-1.js:3:4' });
  assert.deepEqual(describeError(firefox, 'https://cot.kevinliu.studio').frames,
    ['bake@/assets/sky-1.js:1:2', 'run@/assets/main-1.js:3:4'], 'Firefox/Safari frames are recognised');
  assert.equal(describeError({ message: 'x'.repeat(400) }).message.length, 200);
  assert.equal(telemetryCode(' stall: vehicle/paint '), 'stall:_vehicle_paint');
  assert.equal(telemetryCode(''), 'unknown');
  // 2026-09-25 census: the stamp travelled as v1.0.0_g4a24eb4ad because the code alphabet has no '+'
  assert.equal(telemetryBuild('v1.0.0+gd464a813f.dirty'), 'v1.0.0+gd464a813f.dirty', 'the build stamp keeps its +metadata');
  assert.equal(telemetryBuild(' v1 dev '), '_v1_dev_');
  assert.equal(telemetryBuild(''), 'unknown');
  accepted({ v: 2, sid: 'sess_build_check', build: telemetryBuild('v1.0.0+gd464a813f.dirty'), kind: 'session', outcome: 'ready' });
  for (let i = 0; i < 20; i++) {
    const id = randomSessionId();
    assert.match(id, /^s[a-z0-9]{13,}$/, 'session ids fit the server alphabet');
    accepted({ v: 2, sid: id, build: 'dev', kind: 'session', outcome: 'ready' });
  }
  assert.deepEqual(telemetryEndpoints(undefined), { session: TELEMETRY_ENDPOINT, error: TELEMETRY_ENDPOINT },
    'without VITE_TELEMETRY_URL both records go to the Vercel fallback');
  assert.deepEqual(telemetryEndpoints(' https://cot-telemetry.kk23907751.workers.dev// '),
    { session: 'https://cot-telemetry.kk23907751.workers.dev/v1/session', error: 'https://cot-telemetry.kk23907751.workers.dev/v1/error' });
  assert.deepEqual(telemetryEndpoints('not a url'), { session: TELEMETRY_ENDPOINT, error: TELEMETRY_ENDPOINT });
  assert.equal(telemetrySampleRate(undefined), 1);
  assert.equal(telemetrySampleRate('0.25'), 0.25);
  assert.equal(telemetrySampleRate('1'), 1);
  for (const bad of ['0', '-1', '2', 'half', '']) assert.equal(telemetrySampleRate(bad), 1, `${JSON.stringify(bad)} keeps every session`);
}

const source = await readFile(new URL('./telemetry.ts', import.meta.url), 'utf8');
assert.doesNotMatch(source, /^import\s/m, 'the beacon client imports nothing at all so it can load before the renderer');
assert.match(source, /sendBeacon\(endpoint, text\)/, 'the browser transport prefers sendBeacon');
assert.match(source, /keepalive: true/, 'fetch keepalive is the fallback transport');
assert.match(source, /VITE_SELF_HOSTED\s*===\s*'1'/, 'self-hosted builds compile the beacon out like analytics');
assert.match(source, /VITE_TELEMETRY_URL/, 'the sink origin is a build-time setting');
assert.match(source, /VITE_TELEMETRY_SAMPLE/, 'the clean-session sample is a build-time setting');
assert.match(source, /localStorage/, 'the stored opt-out lives beside the other player settings');
assert.match(source, /'pagehide', \(\) => telemetry\.flush\(\)/, 'pagehide sends the session record when boot never reached ready');

console.log('entry telemetry client: one session record, coalesced errors, follow-ups, the request budget, sampling, opt-outs and server acceptance pass');
