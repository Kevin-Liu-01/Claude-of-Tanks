import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  createEntryTelemetry, describeError, installEntryErrorTelemetry, randomSessionId,
  setTelemetryOptOut, TELEMETRY_ENDPOINT, TELEMETRY_OPT_OUT_KEY, telemetryBuild, telemetryCode,
  telemetryDisabledReason, telemetryOptOutStored,
} from './telemetry.ts';
import { validateTelemetryBody } from '../../api/telemetry.ts';

// The client is exercised in Node with an injected transport and scheduler:
// no DOM, no timers, no network. Every body it produces is then run through
// the real server validator so the two halves cannot drift apart.

function fixture(options = {}) {
  const bodies = [];
  const timers = [];
  const telemetry = createEntryTelemetry({
    build: 'v1.0.0+gabc1234', sessionId: 'sess_fixture_1', origin: 'https://cot.kevinliu.studio',
    transport: (endpoint, body) => { bodies.push({ endpoint, body: JSON.parse(body), text: body }); return true; },
    schedule: (callback, delayMs) => { timers.push({ callback, delayMs }); return timers.length; },
    cancel: (handle) => { const timer = timers[handle - 1]; if (timer) timer.cancelled = true; },
    ...options,
  });
  const runTimers = () => {
    for (const timer of timers.filter((entry) => !entry.ran && !entry.cancelled)) { timer.ran = true; timer.callback(); }
  };
  return { telemetry, bodies, timers, runTimers };
}

function accepted(body) {
  const validation = validateTelemetryBody(body, '2026-09-24T00:00:00.000Z');
  assert.equal(validation.ok, true, `server accepts client body: ${JSON.stringify(validation)}`);
  return validation.events;
}

{
  const f = fixture();
  assert.equal(f.telemetry.enabled, true);
  assert.equal(f.telemetry.currentStage, 'imports');
  f.telemetry.stage('renderer', 'begin');
  assert.equal(f.telemetry.currentStage, 'renderer', 'begin marks the stage errors are attributed to');
  f.telemetry.stage('renderer', 'end', 12.6);
  f.telemetry.stage('sky', 'begin');
  assert.equal(f.bodies.length, 0, 'stage events are batched, not sent one by one');
  assert.deepEqual(f.timers.map(({ delayMs }) => delayMs), [400], 'one flush timer is armed for the batch');
  f.runTimers();
  assert.equal(f.bodies.length, 1);
  assert.equal(f.bodies[0].endpoint, TELEMETRY_ENDPOINT);
  const events = accepted(f.bodies[0].body);
  assert.deepEqual(events.map(({ kind, stage, phase, ms }) => [kind, stage, phase, ms]), [
    ['boot_stage', 'renderer', 'begin', undefined],
    ['boot_stage', 'renderer', 'end', 13],
    ['boot_stage', 'sky', 'begin', undefined],
  ]);
  assert.equal(events[0].sid, 'sess_fixture_1');
  assert.equal(events[0].build, 'v1.0.0+gabc1234');
  assert.equal(f.telemetry.sent, 3);

  const error = new Error('Injected sky failure');
  error.stack = [
    'Error: Injected sky failure',
    '    at bake (https://cot.kevinliu.studio/assets/sky-Ab12Cd34.js:10:20)',
    '    at run (https://cot.kevinliu.studio/assets/main-Ef56Gh78.js:30:40)',
    '    at async boot (https://cot.kevinliu.studio/assets/main-Ef56Gh78.js:50:60)',
    '    at fourth (https://cot.kevinliu.studio/assets/main-Ef56Gh78.js:70:80)',
  ].join('\n');
  assert.equal(f.telemetry.error(null, error, 'uncaught'), true);
  assert.equal(f.bodies.length, 2, 'an error flushes immediately');
  const [errorEvent] = accepted(f.bodies[1].body);
  assert.equal(errorEvent.kind, 'boot_error');
  assert.equal(errorEvent.stage, 'sky', 'an error without an explicit stage is attributed to the current one');
  assert.equal(errorEvent.code, 'uncaught');
  assert.equal(errorEvent.error.message, 'Injected sky failure');
  assert.deepEqual(errorEvent.error.frames, [
    'at bake (/assets/sky-Ab12Cd34.js:10:20)',
    'at run (/assets/main-Ef56Gh78.js:30:40)',
    'at async boot (/assets/main-Ef56Gh78.js:50:60)',
  ], 'three origin-stripped frames travel with the message');

  f.telemetry.send({ kind: 'entry_result', mode: 'solo', outcome: 'failed', code: 'cold chunk failed!' });
  assert.equal(f.bodies.length, 3, 'entry results flush immediately');
  const [result] = accepted(f.bodies[2].body);
  assert.equal(result.code, 'cold_chunk_failed', 'codes are bounded to the beacon alphabet before they leave');
}

{
  const f = fixture({ maxErrors: 2, maxEvents: 6 });
  for (let i = 0; i < 4; i++) f.telemetry.error('vehicle', new Error(`e${i}`));
  assert.equal(f.bodies.length, 2, 'error reports are capped per session');
  f.telemetry.send({ kind: 'boot_ready', ms: 5000 });
  f.telemetry.send({ kind: 'capability', capability: { webgl2: true } });
  f.runTimers();
  assert.equal(f.telemetry.sent, 4);
  assert.equal(f.telemetry.send({ kind: 'boot_ready' }), true);
  assert.equal(f.telemetry.send({ kind: 'boot_ready' }), true);
  assert.equal(f.telemetry.send({ kind: 'boot_ready' }), false, 'the session event cap drops later events');
  f.telemetry.flush();
  assert.equal(f.telemetry.sent, 6);
}

{
  const f = fixture({ maxBodyBytes: 600 });
  for (let i = 0; i < 12; i++) f.telemetry.stage(`stage${i}`, 'end', i * 100);
  f.telemetry.flush();
  assert.ok(f.bodies.length > 1, 'a batch over the body limit is split into several bodies');
  for (const { text, body } of f.bodies) {
    assert.ok(text.length <= 600, 'no body exceeds the limit');
    accepted(body);
  }
  assert.equal(f.bodies.flatMap(({ body }) => body.events).length, 12, 'no event is lost by splitting');
  const huge = fixture({ maxBodyBytes: 300 });
  huge.telemetry.error('post', new Error('x'.repeat(190)));
  assert.equal(huge.bodies.length, 1);
  const [trimmed] = accepted(huge.bodies[0].body);
  assert.equal(trimmed.error, undefined, 'an oversized single event drops its detail rather than the beacon');
  assert.equal(trimmed.code, 'oversized');
  assert.equal(trimmed.stage, 'post');
}

{
  const f = fixture({ enabled: false });
  assert.equal(f.telemetry.send({ kind: 'boot_ready' }), false);
  f.telemetry.stage('renderer', 'begin');
  f.telemetry.error('renderer', new Error('never sent'));
  f.telemetry.flush();
  assert.equal(f.bodies.length, 0, 'a disabled client sends nothing at all');
  const throwing = fixture({ transport: () => { throw new Error('beacon refused'); } });
  throwing.telemetry.send({ kind: 'entry_result', outcome: 'ok' });
  assert.equal(throwing.telemetry.sent, 1, 'a throwing transport never reaches the caller');
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
  const reported = f.bodies.flatMap(({ body }) => accepted(body)).filter(({ kind }) => kind === 'boot_error');
  assert.equal(f.bodies.flatMap(({ body }) => body.events)[0].kind, 'boot_stage',
    'the pending stage batch rides in the first immediate flush');
  assert.deepEqual(reported.map(({ stage, code, error }) => [stage, code, error.message]), [
    ['lighting', 'uncaught', 'same-origin failure'],
    ['lighting', 'uncaught', 'source-less failure'],
    ['lighting', 'unhandled_rejection', 'rejected promise'],
    ['lighting', 'unhandled_rejection', 'string rejection'],
  ], 'same-origin and source-less exceptions plus rejections report against the current stage; extensions and resources do not');
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
  accepted({ v: 1, sid: 'sess_build_check', build: telemetryBuild('v1.0.0+gd464a813f.dirty'), kind: 'boot_ready' });
  for (let i = 0; i < 20; i++) {
    const id = randomSessionId();
    assert.match(id, /^s[a-z0-9]{13,}$/, 'session ids fit the server alphabet');
    accepted({ v: 1, sid: id, build: 'dev', kind: 'boot_ready' });
  }
}

const source = await readFile(new URL('./telemetry.ts', import.meta.url), 'utf8');
assert.doesNotMatch(source, /from '\.\.\/(?!\.\.\/api)[^']+'/,
  'the beacon client imports nothing from the game so it can load before the renderer');
assert.match(source, /sendBeacon\(endpoint, text\)/, 'the browser transport prefers sendBeacon');
assert.match(source, /keepalive: true/, 'fetch keepalive is the fallback transport');
assert.match(source, /VITE_SELF_HOSTED\s*===\s*'1'/, 'self-hosted builds compile the beacon out like analytics');
assert.match(source, /localStorage/, 'the stored opt-out lives beside the other player settings');

console.log('entry telemetry client: batching, caps, opt-outs, error attribution and server acceptance pass');
