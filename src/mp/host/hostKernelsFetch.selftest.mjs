// The browser host's fetch of the world kernels has a bound (round 5 Q1, review r2). The host core's world build
// (matchHostCore.ts buildWorld: a boot's, and a standby's preparation, whose world the boot then awaits) awaits the
// kernels' module (worldCollision.ts loadWorldKernels) before it builds the collision world, and that fetch had no bound:
// a request that never answered did not fall back to the TypeScript. It held the boot until the host runtime's boot timer
// failed it (matchHost.ts, ELECTED_HOST_BOOT_MS, 30 s), and the room elected another seat, whose Worker fetched the same
// asset. Now the fetch, its answer and its bytes, has HOST_KERNELS_FETCH_MS from its start: past it the request is
// aborted (a DOMException named TimeoutError), the world is built on the TypeScript (the same match), and the boot's
// 'ready' says so (kernels ts/'timeout', which the page reports: simKernelsReport.ts).
// Held through the core's own world build over the manifests the build serves; fetch is a platform-like double that
// honours its signal, and the bound's timer is captured and fired by hand, so nothing waits 15 s:
// - a request that never answers: the boot waits on it until the bound, then goes live on the TypeScript, 'timeout';
// - the same through the host runtime (matchHost.ts) and the boot timer the bound protects, armed at its default
//   (ELECTED_HOST_BOOT_MS): the two timers fire in due order on virtual time, and the boot goes live at the bound with the
//   boot timer cleared unfired, where before the bound the boot timer failed it (round 6 V7 review r1: the bound's room
//   is checked against the boot timer the runtime arms, not a literal 30 s, so a shortened boot timer fails here too);
// - a response whose body stalls after its headers is aborted at the bound too (the boot waits for the bytes);
// - a module whose bytes are in before the bound ends it: no timer outlives the fetch.
// Not reproduced here: a browser Worker's fetch on a stalled link (the timing half).
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createHostPortPair } from './hostProtocol.ts';
import { createMatchHostCore } from './matchHostCore.ts';
import { createMatchHost } from './matchHost.ts';
import { planHostBoot } from './hostPlan.ts';
import { createRoom, joinRoom } from '../room/roomPolicy.ts';
import { ELECTED_HOST_BOOT_MS } from '../match/recovery.ts';
import { FakeSignalRelay, RtcWorld } from '../transport/rtcDouble.test-support.ts';
import * as worldCollision from './worldCollision.ts';
import { simKernelsFailureReason } from '../../world/simKernelsStatus.ts';

/** What an unprepared boot needs past the bound for its manifest and world (3.4-4.3 s: worldCollision.ts). */
const BOOT_ROOM_MS = 5_000;
/** How long, in wall time, a boot released at the bound may take to build its world here before it is a load stall. */
const SETTLE_WALL_MS = 120_000;
// a stuck guard, not a cost bound (the receipt's user time is a few seconds; under a heavy load its wall runs minutes)
const watchdog = setTimeout(() => { console.error('hostKernelsFetch.selftest: stuck'); process.exit(1); }, 600_000);
watchdog.unref();
const memoryGuard = setInterval(() => { if (process.memoryUsage().rss > 1.5e9) { console.error('hostKernelsFetch.selftest: RSS past 1.5 GB'); process.exit(1); } }, 200);
memoryGuard.unref();
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const until = async (predicate, label, timeoutMs = 5000) => { const started = Date.now(); while (!predicate()) { if (Date.now() - started > timeoutMs) throw new Error(`timeout: ${label}`); await sleep(10); } };
/** Waits up to timeoutMs for predicate; whether it holds, never a throw. */
const within = async (predicate, timeoutMs) => { const started = Date.now(); while (!predicate() && Date.now() - started < timeoutMs) await sleep(10); return predicate(); };
const turns = async (n = 20) => { for (let i = 0; i < n; i++) await new Promise((resolve) => setImmediate(resolve)); };

const MAP = 'longleaf';
const room = createRoom({ roomCode: 'KRNLFT', mode: 'lan', creator: { id: 'me', name: 'Me' }, selection: { specId: 'm1a1_abrams_hc' }, settings: { teamSize: 2, mapId: MAP, botsFill: false }, now: 1000 });
joinRoom(room, { player: { id: 'other', name: 'Other' }, selection: { specId: 't90am' }, team: null, now: 1001 });
const plan = planHostBoot(room, { matchId: 'm1-0000kf01', round: 1, mapId: MAP, mode: 'standard', seed: 7, seat: 0, team: 'alpha', hostId: 'me' }, 'me');
const secret = createHash('sha256').update('host-kernels-fetch').digest('hex');
const bootConfig = (simKernelsUrl) => ({ roomId: 'KRNLFT', matchId: 'm1-0000kf01', generation: 2, mapId: MAP, mode: 'standard', seed: 7, seats: plan.seats,
  bots: plan.bots, countdownS: 1, hostSecret: secret, manifestBase: worldCollision.COLLISION_MANIFEST_ROUTE, simKernelsUrl, resume: null });

// the manifests as the build serves them (the index, then the map's content-addressed file) and the kernels' module
const manifests = new URL('../../../server/world-collision-manifests/', import.meta.url);
const files = new Map();
files.set(`${worldCollision.COLLISION_MANIFEST_ROUTE}/index.json`, readFileSync(new URL('index.json', manifests)));
const mapBytes = readFileSync(new URL(`${MAP}.json`, manifests));
files.set(`${worldCollision.COLLISION_MANIFEST_ROUTE}/${worldCollision.collisionManifestFileName(MAP, createHash('sha256').update(mapBytes).digest('hex'))}`, mapBytes);
const kernelBytes = readFileSync(new URL('../../../crates/cot-sim-wasm/pkg/cot_sim_wasm.wasm', import.meta.url));
const bufferOf = (bytes) => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
/** Each kernels request this receipt saw, by URL: its init (the signal) and how it answers. */
const requests = new Map();
/** How many manifest requests the boots made: a boot asks for its manifest once its kernels' wait has ended. */
let manifestAsks = 0;
/** A response whose body never ends: like a platform's, it errors with the abort's reason when its request is aborted. */
const stalledBody = (signal) => ({ ok: true, status: 200, json: async () => ({}),
  arrayBuffer: () => new Promise((_, reject) => { signal?.addEventListener('abort', () => reject(signal.reason), { once: true }); }) });
const kernelAnswers = {
  '/assets/no-answer.wasm': (init) => new Promise((_, reject) => { init?.signal?.addEventListener('abort', () => reject(init.signal.reason), { once: true }); }),
  '/assets/no-answer-runtime.wasm': (init) => new Promise((_, reject) => { init?.signal?.addEventListener('abort', () => reject(init.signal.reason), { once: true }); }),
  '/assets/body-stalls.wasm': async (init) => stalledBody(init?.signal),
  '/assets/in-time.wasm': async () => ({ ok: true, status: 200, json: async () => ({}), arrayBuffer: async () => bufferOf(kernelBytes) }),
};
const realFetch = globalThis.fetch;
globalThis.fetch = (url, init) => {
  const answer = kernelAnswers[String(url)];
  if (answer) { requests.set(String(url), init); return answer(init); }
  manifestAsks++;
  const bytes = files.get(String(url));
  if (!bytes) return Promise.resolve({ ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0), json: async () => ({}) });
  return Promise.resolve({ ok: true, status: 200, arrayBuffer: async () => bufferOf(bytes), json: async () => JSON.parse(bytes.toString('utf8')) });
};

// a bound of seconds (5-30 s: the core's own timers here are 250 ms and 500 ms, a link's HELLO window 60 s) is captured
// and fired by hand; shorter timers run as ever
const realSetTimeout = globalThis.setTimeout, realClearTimeout = globalThis.clearTimeout;
const bounds = [];
globalThis.setTimeout = (fn, ms, ...args) => {
  if (!(ms >= 5_000 && ms <= 30_000)) return realSetTimeout(fn, ms, ...args);
  const timer = { fn, ms, cleared: false, fired: false };
  bounds.push(timer);
  return timer;
};
globalThis.clearTimeout = (timer) => {
  if (bounds.includes(timer)) timer.cleared = true;
  else realClearTimeout(timer);
};
/** Every captured bound still pending fires (what is pending set its timers first). */
const firePending = async () => {
  await turns();
  for (const timer of bounds) if (!timer.cleared && !timer.fired) { timer.fired = true; timer.fn(); }
  await turns();
};
/** How a promise ended so far, never a throw. */
const state = (promise) => {
  const seen = { now: 'pending', error: null };
  promise.then(() => { seen.now = 'resolved'; }, (error) => { seen.now = 'rejected'; seen.error = error; });
  return seen;
};

try {
  // ---- (round 5 Q1 r2) a request that never answers: the boot goes live on the TypeScript at the bound, 'timeout'
  {
    bounds.length = 0;
    const pair = createHostPortPair();
    const core = createMatchHostCore({ port: pair.worker, reportIntervalMs: 500 });
    const posted = [];
    pair.main.onMessage((message) => posted.push(message));
    pair.main.post({ type: 'boot', config: bootConfig('/assets/no-answer.wasm') });
    await until(() => requests.has('/assets/no-answer.wasm'), 'the kernels requested', 60_000);
    await sleep(300);
    assert.equal(posted.some((message) => message.type === 'ready' || message.type === 'boot_failed'), false,
      'the boot waits on its kernels request');
    await firePending();
    const signal = requests.get('/assets/no-answer.wasm')?.signal;
    assert.ok(signal?.aborted, 'a request with no answer by its bound is aborted (it held the boot until the boot timer failed it)');
    assert.equal(signal.reason?.name, 'TimeoutError', 'aborted with a TimeoutError');
    assert.equal(bounds.length, 1, 'one bound: the request\'s');
    assert.equal(bounds[0].ms, worldCollision.HOST_KERNELS_FETCH_MS, 'the bound is HOST_KERNELS_FETCH_MS');
    assert.ok(worldCollision.HOST_KERNELS_FETCH_MS + BOOT_ROOM_MS < ELECTED_HOST_BOOT_MS,
      'the bound leaves an unprepared boot its world inside the boot timer (ELECTED_HOST_BOOT_MS)');
    await until(() => posted.some((message) => message.type === 'ready' || message.type === 'boot_failed'), 'ready after the bound', SETTLE_WALL_MS);
    assert.equal(posted.some((message) => message.type === 'boot_failed'), false, 'the boot did not fail');
    assert.deepEqual(posted.find((message) => message.type === 'ready').kernels, { mode: 'ts', reason: 'timeout' },
      'the boot goes live on the TypeScript and its ready names the timeout');
    assert.ok(core.actor, 'and its actor runs');
    core.dispose(); pair.main.close();
  }

  // ---- (round 6 V7 review r1) the same through the host runtime and its own boot timer, at its default: the bound
  // fires first, with an unprepared boot's room before the boot timer, and the boot goes live; before the bound, the
  // boot timer failed the boot at 30 s and the room elected again
  {
    bounds.length = 0;
    /** The runtime's timers of seconds (its boot timer), captured as the core's are; shorter ones run as ever. */
    const runtimeTimers = [];
    const pair = createHostPortPair();
    const core = createMatchHostCore({ port: pair.worker, reportIntervalMs: 500 });
    /** The core's word that ends its boot (ready or boot_failed), seen in the same dispatch as the runtime's. */
    const coreEnds = [];
    pair.main.onMessage((message) => { if (message.type === 'ready' || message.type === 'boot_failed') coreEnds.push(message); });
    const relay = new FakeSignalRelay('me', 1);
    const host = createMatchHost({
      playerId: 'me', generation: () => 2, createPort: () => pair.main, createPeerConnection: new RtcWorld().createPeerConnection,
      room: { signaler: relay.signalerFor('me'), reportMatch: async () => {} },
      setTimer: (fn, ms) => {
        if (!(ms >= 5_000)) return realSetTimeout(fn, ms);
        const timer = { fn, ms, cleared: false, fired: false };
        runtimeTimers.push(timer);
        return timer;
      },
      clearTimer: (timer) => { if (runtimeTimers.includes(timer)) timer.cleared = true; else realClearTimeout(timer); },
    });
    const states = [];
    host.onState((next, detail) => states.push(`${next}${detail ? `(${detail})` : ''}`));
    const started = state(host.start(bootConfig('/assets/no-answer-runtime.wasm')));
    await until(() => requests.has('/assets/no-answer-runtime.wasm'), 'the kernels requested through the runtime', 60_000);
    await turns();
    assert.equal(runtimeTimers.length, 1, 'one timer of seconds in the runtime: its boot timer');
    const bootTimer = runtimeTimers[0];
    assert.equal(bootTimer.ms, ELECTED_HOST_BOOT_MS, 'the runtime\'s boot timer is ELECTED_HOST_BOOT_MS (matchHost.ts, its default)');
    // virtual time: each timer of seconds the two armed at the boot's start fires in due order, one at a time, and the
    // real world build gets its time to answer before the next. The port hands the core's ready or boot_failed to this
    // receipt's listener and the runtime's in one dispatch (hostProtocol.ts createHostPortPair), so a runtime still
    // booting after that word has dropped it: a defect, failed at once (round 6 V7 review r3). A boot the fired timer
    // released (it asked for its manifest) with no word from the core within SETTLE_WALL_MS is a world build stalled by
    // load: a timeout, never the next timer, which would read as the hazard (review r2). A boot still held goes on to
    // the next timer.
    const fired = [];
    for (;;) {
      const next = [...bounds.map((timer) => ({ timer, who: 'core' })), ...runtimeTimers.map((timer) => ({ timer, who: 'runtime' }))]
        .filter(({ timer }) => !timer.cleared && !timer.fired).sort((a, b) => a.timer.ms - b.timer.ms)[0];
      if (!next || host.state !== 'booting') break;
      next.timer.fired = true;
      fired.push(`${next.who} ${next.timer.ms}`);
      const asksBefore = manifestAsks;
      next.timer.fn();
      await within(() => host.state !== 'booting' || coreEnds.length > 0, SETTLE_WALL_MS);
      await turns();
      if (host.state === 'booting' && coreEnds.length > 0) {
        assert.fail(`the core posted ${coreEnds[0].type} after ${fired.at(-1)} fired, but the runtime stayed booting (it dropped the core's word)`);
      }
      if (host.state === 'booting' && manifestAsks > asksBefore) {
        throw new Error(`timeout: the boot asked for its manifest after ${fired.at(-1)} fired but did not settle within ${SETTLE_WALL_MS / 1000} s of wall time (load: rerun)`);
      }
    }
    await turns();
    assert.deepEqual(fired, [`core ${worldCollision.HOST_KERNELS_FETCH_MS}`],
      'the kernels\' bound ends the wait, not the boot timer (before the bound, the boot timer failed the boot and the room elected again)');
    assert.deepEqual(states, ['booting(boot)', 'live(started)'], 'the boot goes live and never fails');
    assert.equal(started.now, 'resolved', 'the runtime\'s start resolves');
    assert.equal(bootTimer.cleared, true, 'the live boot clears its boot timer, unfired');
    assert.ok(bounds[0].ms + BOOT_ROOM_MS < bootTimer.ms, 'the bound leaves an unprepared boot its world inside the boot timer the runtime arms');
    assert.deepEqual(coreEnds.find((message) => message.type === 'ready')?.kernels, { mode: 'ts', reason: 'timeout' }, 'its ready names the timeout');
    host.stop();
    core.dispose();
  }

  // ---- (round 5 Q1 r2) a body that stalls after its headers is aborted at the bound too: the boot waits for the bytes
  {
    bounds.length = 0;
    const load = state(worldCollision.loadWorldKernels('/assets/body-stalls.wasm'));
    await turns();
    assert.equal(load.now, 'pending', 'the body is still coming');
    await firePending();
    assert.equal(load.now, 'rejected', 'a body stalled after its answer is aborted at the bound (the boot waits for the bytes)');
    assert.equal(load.error?.name, 'TimeoutError');
    assert.equal(simKernelsFailureReason(load.error), 'timeout', 'reported as the timeout');
  }

  // ---- (round 5 Q1 r2) a module whose bytes are in before the bound ends it: no timer outlives the fetch
  {
    bounds.length = 0;
    const module = await worldCollision.loadWorldKernels('/assets/in-time.wasm');
    assert.ok(module instanceof WebAssembly.Module, 'the module compiles');
    assert.equal(bounds.length, 1, 'the request had its bound');
    assert.equal(bounds[0].cleared, true, 'and the bound ended with the bytes');
    assert.equal(requests.get('/assets/in-time.wasm')?.signal?.aborted, false, 'nothing aborted');
  }
} finally {
  globalThis.fetch = realFetch;
  globalThis.setTimeout = realSetTimeout;
  globalThis.clearTimeout = realClearTimeout;
}

console.log('hostKernelsFetch.selftest: the host\'s kernels fetch has a bound: a request with no answer, or a body stalled after its headers, is aborted at HOST_KERNELS_FETCH_MS and the boot goes live on the TypeScript (ready: ts/timeout), through the host runtime too, with an unprepared boot\'s room inside its boot timer (ELECTED_HOST_BOOT_MS); bytes in time end the bound');
