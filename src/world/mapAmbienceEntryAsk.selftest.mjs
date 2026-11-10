// mapAmbienceEntryAsk.selftest.mjs — a battle's covered entry asks the map's air at once whatever the lazy-chunk backoff,
// and a Studio light apply never waits on (or fails for) its re-ask (2026-11-02 audit R6, round 4 F2 review).
// Copyright © 2026 Kevin B. Liu.
//
// The map's air (mapAmbienceAccess.ts, chunk mapAmbience.ts) is a lazy runtime owner under app/lazyChunk.ts (round 2
// U35): a failure is asked again at once after one failure, then past a backoff that doubles to a minute, never offline.
// Every Studio light apply prepares it (main.ts prepareStudioAtmosphere), so a drag through an outage raised that backoff
// to the minute's cap, and a battle entered inside it got the kept failure: the solo entry's optional warm stopped there
// (its night light pool, the early program submission and the visual streams skipped), and the network round failed. And
// a Studio apply awaited the air's re-ask, so a hung transfer held the Studio's light (and its busy 'light' hold), while a
// kept failure failed the light change itself. Now an entry (`{ entry: true }`, main.ts's solo and network entries and
// the capture's battle time) asks at once whatever the backoff (never offline); a Studio apply waits on a first ask only,
// and a re-ask is its `landing` (the Studio prepares again once it lands: game/studioLightLanding.selftest.mjs).
//
// A chunk "fails" the way a browser's import does when the network drops (its loader rejects) and "stalls" the way a
// hung transfer does (it never settles until this test lets it).
import assert from 'node:assert/strict';

let clock = 1000;
performance.now = () => clock; // the lazy chunk's default clock
let onLine = true;
Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true, writable: true });
Object.defineProperty(globalThis.navigator, 'onLine', { get: () => onLine, configurable: true });

const { createMapAmbienceAccess } = await import('./mapAmbienceAccess.ts');
const turns = async (n = 20) => { for (let i = 0; i < n; i++) await new Promise((resolve) => setImmediate(resolve)); };
/** Whether a promise settled, and how: read at once (no unhandled rejection). */
const track = (promise) => {
  const step = { settled: false, value: undefined, error: null };
  promise.then((value) => { step.settled = true; step.value = value; }, (error) => { step.settled = true; step.error = error; });
  return step;
};

/** The real access over a module loader whose network this test sets: 'down', 'stall' (until `release`) or 'up'. */
function air() {
  const state = { network: 'down', asks: 0, prepared: [], release: () => {} };
  let gate = Promise.resolve();
  state.stall = () => { state.network = 'stall'; gate = new Promise((resolve) => { state.release = resolve; }); };
  const runtime = {
    prepare: (seed, mapId, time) => state.prepared.push([seed, mapId, time]),
    setEnabled() {}, setDensityOverride() {}, refreshTier() {}, reset() {}, isActive: () => false,
  };
  state.access = createMapAmbienceAccess(() => ({}), async () => {
    state.asks += 1;
    if (state.network === 'down') throw new TypeError('Failed to fetch dynamically imported module: ./mapAmbience.ts');
    if (state.network === 'stall') await gate;
    return { createMapAmbience: () => runtime };
  });
  return state;
}
const session = { current: () => true };
const ENTRY = Object.freeze({ entry: true });
const problems = [];

// ---- 1. a cold Studio waits on the air's first ask (its first light has the air, as a battle's does)
{
  const a = air();
  a.stall();
  const cold = track(a.access.prepare(0, 'fjord', 'day', session));
  await turns();
  assert.equal(cold.settled, false, 'the cold Studio apply waits for the air\'s first ask');
  a.release();
  await turns();
  assert.deepEqual(a.prepared, [[0, 'fjord', 'day']], 'and prepares the air once it lands');
}

// ---- 2. a Studio drag through an outage keeps the backoff; the next battle's entry inside it asks at once
{
  const a = air();
  // a battle's entry in the outage: it asks once and fails (the solo entry's optional warm stops; a network round fails)
  await assert.rejects(a.access.prepare(1, 'fjord', 'day', undefined, ENTRY), /dynamically imported module/);
  // three minutes of Studio moves (one per 100 ms): each asks only at the policy's backoff points
  let failedMoves = 0;
  for (let i = 0; i < 1800; i++) {
    clock += 100;
    const move = track(a.access.prepare(0, 'fjord', 'day', session));
    await turns(2);
    if (move.error) failedMoves += 1;
  }
  if (failedMoves) problems.push(`${failedMoves} of 1800 Studio applies through the outage failed the Studio's light (the air's kept failure)`);
  assert.ok(a.asks >= 5 && a.asks <= 9, `the Studio's drag asks the failed air at the backoff points (${a.asks} asks)`);
  // offline, an entry asks nothing
  onLine = false;
  const offline = a.asks;
  await a.access.prepare(2, 'fjord', 'day', undefined, ENTRY).catch(() => undefined);
  assert.equal(a.asks, offline, 'an entry while the browser is offline asks nothing');
  onLine = true;
  // the network is back, one second after the drag's last failure: the battle's entry asks at once and prepares the air
  a.network = 'up';
  clock += 1000;
  const before = a.asks;
  try {
    await a.access.prepare(3, 'delta', 'day', undefined, ENTRY);
    assert.deepEqual(a.prepared.at(-1), [3, 'delta', 'day'], 'the entry\'s air is prepared');
  } catch (error) {
    problems.push(`a battle entered inside the backoff a Studio drag raised failed its air (${a.asks - before} asks: ${error.message}; the solo entry's optional warm stopped there, the network round failed)`);
  }
}

// ---- 3. a Studio apply never waits on the air's re-ask: after a failed entry, a hung re-ask settles the apply at once
// (it prepares no air); its landing is true once the module lands while it is the latest prepare and its session live
{
  const a = air();
  await assert.rejects(a.access.prepare(1, 'fjord', 'day', undefined, ENTRY), /dynamically imported module/);
  a.stall();
  const hung = track(a.access.prepare(0, 'fjord', 'golden', session));
  await turns();
  if (!hung.settled) {
    problems.push('a Studio light apply awaited the map air\'s stalled re-ask (its light and the Studio\'s busy hold wait until the browser fails the transfer)');
  } else {
    assert.deepEqual(a.prepared, [], 'it prepares no air while the module is in flight');
    const landing = hung.value?.landing;
    assert.ok(landing instanceof Promise, 'what it did not wait for is its landing');
    const ended = { live: true };
    const later = track(a.access.prepare(0, 'fjord', 'dusk', { current: () => ended.live }));
    await turns();
    ended.live = false; // that later apply's session ends before the module lands
    a.release();
    assert.equal(await landing, false, 'a later prepare makes an earlier landing false');
    assert.equal(await later.value.landing, false, 'a landing whose session ended is false');
    assert.deepEqual(a.prepared, [], 'a landing prepares nothing by itself');
    // the next apply (the Studio's relight) prepares the air at its hour
    await a.access.prepare(0, 'fjord', 'dusk', session);
    assert.deepEqual(a.prepared, [[0, 'fjord', 'dusk']]);
  }
}

// ---- 4. a kept failure inside the backoff leaves the Studio's air off without failing its light
{
  const a = air();
  await assert.rejects(a.access.prepare(1, 'fjord', 'day', undefined, ENTRY), /dynamically imported module/);
  await a.access.prepare(0, 'fjord', 'day', session).catch(() => undefined); // re-asked at once after one failure: fails
  await turns();
  const kept = track(a.access.prepare(0, 'fjord', 'day', session)); // inside the 2 s backoff: the kept failure
  await turns();
  if (kept.error) problems.push(`a Studio apply inside the air's backoff failed the Studio's light (${kept.error.message})`);
  else assert.equal(kept.value?.landing, null, 'nothing in flight: no landing');
}

assert.deepEqual(problems, [], `the map air's entry and Studio asks:\n  ${problems.join('\n  ')}`);
console.log('mapAmbienceEntryAsk.selftest: OK (a battle entry asks the map\'s air at once whatever the backoff; a Studio apply waits on its first ask only, never on or for a re-ask)');
