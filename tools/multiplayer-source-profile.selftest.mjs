import assert from 'node:assert/strict';
import { summarizeMultiplayerSourceProfile, startMultiplayerSourceProfile } from './multiplayer-source-profile.mjs';

const origin = 'https://game.example.test';
const node = (id, name, path = '', children = []) => ({ id, children,
  callFrame: { functionName: name, url: path, lineNumber: 3, columnNumber: 27, scriptId: 'PRIVATE_SCRIPT' } });
function profile() {
  return { startTime: 1_000_000, endTime: 1_010_000,
    nodes: [node(1, '(root)', '', [2, 3, 4, 5]), node(2, '(idle)'),
      node(3, '(garbage collector)'), node(4, '(program)'),
      node(5, 'update', `${origin}/assets/main-Abcd123.js`, [6, 7, 8]),
      node(6, 'cast', `${origin}/src/world/terrain.ts`),
      node(7, 'PRIVATE_URL?TOKEN', 'https://other.test/PRIVATE_SECRET'),
      node(8, 'update', `${origin}/assets/main-Abcd123.js`)],
    samples: [2, 3, 4, 6, 7, 8], timeDeltas: [1000, 1000, 1000, 2000, 2000, 1000] };
}
const safe = summarizeMultiplayerSourceProfile(profile(), { origin });
assert.equal(safe.profileDurationMs, 10);
assert.equal(safe.sampledDurationMs, 8);
assert.equal(safe.unsampledTailMs, 2);
assert.deepEqual(safe.sampledMs, { application: 3, idle: 1, program: 1, gc: 1, other: 2 });
assert.equal(safe.nonIdleSampledMs, 7);
assert.equal(safe.applicationInclusiveSampledMs, 5,
  'native/private leaves retain only their application ancestor contribution');
assert.equal(safe.functions.length, 2);
const update = safe.functions.find((row) => row.functionName === 'update');
assert.equal(update.selfSampledMs, 1);
assert.equal(update.inclusiveSampledMs, 5, 'recursive same function is counted once per sample');
assert.equal(update.line, 4);
assert.equal(update.column, 28);
assert.equal(safe.bins[0].application, 3);
assert.equal(safe.bins[0].other, 2);
assert.doesNotMatch(JSON.stringify(safe), /PRIVATE|https?:|scriptId|startTime|deoptReason/);
for (const name of ['toString', 'constructor', '__proto__', 'hasOwnProperty', 'valueOf']) {
  const builtin = profile();
  builtin.nodes[1].callFrame.functionName = name;
  const categorized = summarizeMultiplayerSourceProfile(builtin, { origin });
  assert.deepEqual(Object.keys(categorized.sampledMs), ['application', 'idle', 'program', 'gc', 'other']);
  assert.equal(categorized.sampledMs.other, 3, 'URL-less built-ins are not synthetic V8 root categories');
  assert.ok(Object.values(categorized.sampledMs).every(Number.isFinite));
  assert.doesNotMatch(JSON.stringify(categorized), /native code|__proto__|constructor/);
}

const split = profile();
split.endTime = split.startTime + 250000;
split.samples = [6]; split.timeDeltas = [250000];
const splitResult = summarizeMultiplayerSourceProfile(split, { origin });
assert.deepEqual(splitResult.bins.map((row) => row.application), [100, 100, 50],
  'sample weights split across bins rather than all landing in the completion bin');
assert.equal(splitResult.maxSampleIntervalMs, 250, 'sampling gaps remain explicit uncertainty');

for (const mutate of [
  (p) => { p.samples = [999]; }, (p) => { p.timeDeltas[0] = -1; },
  (p) => { p.samples.pop(); }, (p) => { p.endTime = Infinity; },
  (p) => { p.timeDeltas[0] = 11000; },
  (p) => { p.nodes[0].children.push(999); },
  (p) => { p.nodes[7].children.push(5); },
  (p) => { p.nodes[1].children.push(6); },
  (p) => { p.nodes.push(p.nodes[1]); },
  (p) => { p.nodes = Array(20001).fill(p.nodes[0]); },
  (p) => { p.samples = Array(40001).fill(2); p.timeDeltas = Array(40001).fill(1); },
]) {
  const invalid = profile(); mutate(invalid);
  assert.throws(() => summarizeMultiplayerSourceProfile(invalid, { origin }), /source_profile_invalid_profile/);
}
for (const path of [`${origin}/assets/private.js?PRIVATE_TOKEN`, `${origin}/private/PRIVATE_TOKEN.js`,
  `${origin}/assets/%50RIVATE.js`, `https://PRIVATE_SECRET@game.example.test/assets/main.js`,
  'file:///PRIVATE_PATH/main.js', 'data:text/javascript,PRIVATE_SECRET']) {
  const privateProfile = profile();
  privateProfile.nodes[5].callFrame.url = path;
  privateProfile.nodes[5].callFrame.functionName = 'PRIVATE_TOKEN';
  assert.doesNotMatch(JSON.stringify(summarizeMultiplayerSourceProfile(privateProfile, { origin })), /PRIVATE/);
}
const hostileName = profile();
hostileName.nodes[5].callFrame.functionName = 'PRIVATE_TOKEN=https://SECRET';
assert.doesNotMatch(JSON.stringify(summarizeMultiplayerSourceProfile(hostileName, { origin })), /PRIVATE|SECRET/);

const many = { startTime: 0, endTime: 25000000,
  nodes: [node(1, '(root)', '', Array.from({ length: 100 }, (_, i) => i + 2)),
    ...Array.from({ length: 100 }, (_, i) => node(i + 2, `fn${i}`, `${origin}/assets/main.js`))],
  samples: Array.from({ length: 12500 }, (_, i) => i % 100 + 2), timeDeltas: Array(12500).fill(2000) };
const bounded = summarizeMultiplayerSourceProfile(many, { origin });
assert.equal(bounded.functions.length, 64);
assert.equal(bounded.functionsOmitted, 36);
assert.equal(bounded.bins.length, 250);
assert.ok(bounded.bins.every((row) => row.functions.length <= 5));
assert.ok(JSON.stringify(bounded).length < 200000);

async function flush() { for (let i = 0; i < 30; i++) await Promise.resolve(); }
function fixture({ create, send, detach, evaluate } = {}) {
  let time = 0;
  let serial = 0;
  let detached = 0;
  const timers = new Map();
  const calls = [];
  const clock = { now: () => time,
    setTimeout(fn, ms) { const id = ++serial; timers.set(id, { at: time + ms, fn }); return id; },
    clearTimeout(id) { timers.delete(id); },
    async advance(ms) {
      await flush(); const end = time + ms;
      for (;;) {
        const next = [...timers].filter(([, item]) => item.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        time = next[1].at; timers.delete(next[0]); next[1].fn(); await flush();
      }
      time = end; await flush();
    } };
  const session = { async send(method, args) {
    calls.push([method, args]);
    const custom = send?.(method, args, clock);
    if (custom !== undefined) return custom;
    return method === 'Profiler.stop' ? { profile: profile() } : {};
  }, async detach() { detached++; return detach?.(); } };
  const page = { target: () => ({ createCDPSession: () => create ? create(session) : session }),
    evaluate: () => evaluate ? evaluate(clock) : 5000 + time };
  return { page, clock, calls, timers, session, get detached() { return detached; } };
}
function released(f) { assert.equal(f.detached, 1); assert.equal(f.timers.size, 0); }

const normal = fixture();
const capture = await startMultiplayerSourceProfile(normal.page, { origin }, normal.clock);
const stopping = capture.stop();
assert.equal(capture.stop(), stopping);
const receipt = await stopping;
released(normal);
assert.deepEqual(normal.calls.map(([method]) => method), [
  'Profiler.enable', 'Profiler.setSamplingInterval', 'Profiler.start', 'Profiler.stop', 'Profiler.disable',
]);
assert.deepEqual(normal.calls[1][1], { interval: 2000 });
assert.equal(receipt.baselinePageTimeMs, 5000);
assert.equal(receipt.diagnosticOverhead, true);
assert.equal(receipt.stopReason, 'owner');
assert.equal(receipt.samplingIntervalUs, 2000);
assert.doesNotMatch(JSON.stringify(receipt), /PRIVATE|https?:/);

const automatic = fixture();
const auto = await startMultiplayerSourceProfile(automatic.page, { origin, durationMs: 10 }, automatic.clock);
await automatic.clock.advance(10);
assert.equal((await auto.stop()).stopReason, 'deadline');
released(automatic);

for (const options of [{ origin: 'https://game.test/path' }, { origin: 'https://secret@game.test' },
  { durationMs: 25001 }, { durationMs: 0 }, { samplingIntervalUs: 999 },
  { samplingIntervalUs: 10001 }, { commandTimeoutMs: 0 }]) {
  const f = fixture();
  await assert.rejects(startMultiplayerSourceProfile(f.page, { origin, ...options }, f.clock),
    /source_profile_invalid_options/);
  assert.equal(f.calls.length, 0);
}

for (const failing of ['create', 'page-time', 'Profiler.enable', 'Profiler.setSamplingInterval',
  'Profiler.start', 'Profiler.stop', 'Profiler.disable', 'detach']) {
  const fail = () => { throw new Error('PRIVATE_TOKEN https://PRIVATE_URL'); };
  const f = fixture({ create: failing === 'create' ? fail : undefined,
    evaluate: failing === 'page-time' ? fail : undefined,
    detach: failing === 'detach' ? fail : undefined,
    send: (method) => { if (method === failing) fail(); } });
  if (['create', 'page-time', 'Profiler.enable', 'Profiler.setSamplingInterval', 'Profiler.start'].includes(failing)) {
    await assert.rejects(startMultiplayerSourceProfile(f.page, { origin }, f.clock), /^Error: source_profile_start_failed$/);
    if (failing !== 'create') released(f);
  } else {
    const sampler = await startMultiplayerSourceProfile(f.page, { origin }, f.clock);
    await assert.rejects(sampler.stop(), /^Error: source_profile_(stop|cleanup)_failed$/);
    released(f);
  }
}

for (const stuck of ['Profiler.stop', 'Profiler.disable', 'detach']) {
  const f = fixture({ send: (method) => method === stuck ? new Promise(() => {}) : undefined,
    detach: stuck === 'detach' ? () => new Promise(() => {}) : undefined });
  const sampler = await startMultiplayerSourceProfile(f.page, { origin, commandTimeoutMs: 10 }, f.clock);
  const result = assert.rejects(sampler.stop(), /^Error: source_profile_(stop|cleanup)_failed$/);
  await f.clock.advance(50); await result; released(f);
}

for (const sameTurn of [false, true]) {
  let resolveCreation;
  const f = fixture({ create: (session) => new Promise((resolve) => { resolveCreation = () => resolve(session); }) });
  const pending = startMultiplayerSourceProfile(f.page, { origin, commandTimeoutMs: 10 }, f.clock);
  const rejected = assert.rejects(pending, /^Error: source_profile_start_failed$/);
  await flush();
  if (sameTurn) resolveCreation();
  // Run the deadline without flushing the just-resolved creation microtask.
  const timer = [...f.timers.entries()][0]; f.timers.delete(timer[0]); timer[1].fn();
  await rejected;
  if (!sameTurn) resolveCreation();
  await flush(); released(f);
  assert.equal(f.calls.filter(([method]) => method === 'Profiler.start').length, 0);
}

console.log('multiplayer source profile selftest: PASS');
