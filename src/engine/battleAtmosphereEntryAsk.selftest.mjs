// battleAtmosphereEntryAsk.selftest.mjs — a battle's covered entry asks the battle atmosphere's chunks at once whatever
// the lazy-chunk backoff, and a Studio light apply never waits on a re-ask (2026-11-02 audit R6, round 4 F2).
// Copyright © 2026 Kevin B. Liu.
//
// The grounded light model (battleAtmosphereAccess.ts, chunk lightModel.ts), the maps' cloudscapes (cloudPresets.ts,
// chunk cloudscapeLayer.ts) and the atmosphere runtime itself are held under app/lazyChunk.ts (round 3 A4): a failure
// is asked again at once after one failure, then past a backoff that doubles to a minute, never offline. Every prepare
// asks them, and the Studio prepares once per sun-dial or slider move (main.ts prepareStudioAtmosphere ->
// prepare(0, map, ['day'])). Two costs moved with that (round 3 review): during an outage a Studio drag raises the
// failure count once per backoff window, up to the minute's cap, and a battle entered inside that backoff got the kept
// failure and played the whole battle on the authored rig with deck-only clouds (or, for the runtime, failed its
// atmosphere), where every entry used to ask at once; and an apply that made the policy's re-ask awaited that transfer,
// so a stalled import held the Studio's light (and its busy 'light' hold) until the browser failed it. Now a battle
// entry (prepare's `{ entry: true }`, main.ts's solo and network entries) asks every part at once whatever the backoff
// (never offline), and a Studio apply asks as the policy allows and awaits a part's first ask only, never a re-ask
// (round 4 F2 review: the runtime's re-ask too, case 5). What an apply did not wait for is its prepare's `landing`, and
// the Studio lights again once it lands (game/studioLightLanding.selftest.mjs drives that through studio.ts and
// main.ts).
//
// A chunk "fails" the way a browser's import does when the network drops (its resolve throws) and "stalls" the way a
// hung transfer does (its module never finishes arriving: top-level await on a gate this test holds).
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';

let clock = 1000;
performance.now = () => clock; // the lazy chunks' default clock
let onLine = true;
Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true, writable: true });
Object.defineProperty(globalThis.navigator, 'onLine', { get: () => onLine, configurable: true });

const LIGHT = './lightModel.ts';
const CLOUDS = './cloudscapeLayer.ts';
const parentOf = new Map([[LIGHT, '/src/engine/lightModelCore.ts'], [CLOUDS, '/src/engine/cloudPresets.ts']]);
const asked = new Map([[LIGHT, 0], [CLOUDS, 0]]);
/** Per chunk: 'down' (the resolve throws), 'stall' (the module waits on the gate), 'up' (it arrives). */
const network = new Map([[LIGHT, 'down'], [CLOUDS, 'down']]);
let failStall = () => {};
let gate = null;
const holdGate = () => {
  gate = new Promise((_, reject) => { failStall = reject; });
  gate.catch(() => {}); // the stalled modules rethrow it; the gate itself is handled
  globalThis.__cotGate = gate;
};
// stand-ins that record their install (the real modules only refine the light and the layer); each ask its own URL, so a
// module that failed evaluating is never the one the next ask gets
const BODY = new Map([
  [LIGHT, 'export function groundedLightModel() { globalThis.__cotGrounded = (globalThis.__cotGrounded ?? 0) + 1;'
    + ' return () => null; }'],
  [CLOUDS, 'export function cloudscapeLayer() { globalThis.__cotCloudscape = (globalThis.__cotCloudscape ?? 0) + 1;'
    + ' return (legacy) => legacy; }'],
]);
const hook = registerHooks({
  resolve(specifier, context, next) {
    if (asked.has(specifier) && (context.parentURL ?? '').endsWith(parentOf.get(specifier))) {
      const n = asked.get(specifier) + 1;
      asked.set(specifier, n);
      const mode = network.get(specifier);
      if (mode === 'down') throw new TypeError(`Failed to fetch dynamically imported module: ${specifier}`);
      const wait = mode === 'stall' ? 'await globalThis.__cotGate;\n' : '';
      return { url: `data:text/javascript,${encodeURIComponent(`// ask ${n}\n${wait}${BODY.get(specifier)}`)}`, shortCircuit: true };
    }
    return next(specifier, context);
  },
});

const ENTRY = Object.freeze({ entry: true });
const turns = async (n = 20) => { for (let i = 0; i < n; i++) await new Promise((resolve) => setImmediate(resolve)); };
/** Whether a promise settled: read at once (no unhandled rejection), 'pending' while it waits. */
const track = (promise) => {
  const step = { settled: false, value: undefined };
  promise.then((value) => { step.settled = true; step.value = value; }, () => { step.settled = true; });
  return step;
};
const counts = () => `${asked.get(LIGHT)} light model, ${asked.get(CLOUDS)} cloudscape asks`;
const lit = () => `${globalThis.__cotGrounded ?? 0} light model, ${globalThis.__cotCloudscape ?? 0} cloudscape installs`;
const problems = [];

try {
  const { createBattleAtmosphereAccess } = await import('./battleAtmosphereAccess.ts');
  const prepared = [];
  const access = createBattleAtmosphereAccess(() => ({}), async () => ({
    createBattleAtmosphereRuntime: () => ({ prepare(seed) { prepared.push({ seed, lit: lit() }); }, reset() {} }),
  }));
  /** One Studio light apply, as main.ts prepareStudioAtmosphere makes it; whether it settled. */
  const studioApply = () => {
    const apply = { settled: false };
    access.prepare(0, 'fjord', ['day']).then(() => { apply.settled = true; }, () => { apply.settled = true; });
    return apply;
  };

  // ---- 0. (round 4 F2 review) a cold Studio waits on a part's first ask, so its first light is lit as a battle's is: the
  // parts' first transfers hang, and the Studio's first apply waits for them (it prepares nothing until they settle)
  holdGate();
  network.set(LIGHT, 'stall');
  network.set(CLOUDS, 'stall');
  const cold = studioApply();
  await turns();
  assert.equal(counts(), '1 light model, 1 cloudscape asks', 'the cold Studio\'s apply asks both parts');
  if (cold.settled) problems.push('a cold Studio apply did not wait for the parts\' first ask (its first light is the authored rig with deck-only clouds until they land)');
  // they fail (an outage): the apply lights with the fallbacks
  network.set(LIGHT, 'down');
  network.set(CLOUDS, 'down');
  failStall(new TypeError('Failed to fetch dynamically imported module: (the cold transfer)'));
  await turns();
  assert.ok(cold.settled, 'the cold apply settles once its first asks fail');

  // the first battle, in the outage: its entry asks both parts again at once; they fail and the sky keeps its fallbacks
  const coldPrepared = prepared.length;
  await access.prepare(1, 'fjord', undefined, ENTRY);
  assert.equal(counts(), '2 light model, 2 cloudscape asks');
  assert.equal(prepared.length, coldPrepared + 1, 'the battle is prepared without them');

  // ---- 1. a Studio apply never awaits a stalled re-ask. The network is back but both transfers hang: the first move
  // past the backoff asks again (the policy), and that move, and every move while the re-ask is in flight, lights the
  // Studio now with the fallbacks
  holdGate();
  network.set(LIGHT, 'stall');
  network.set(CLOUDS, 'stall');
  clock += 2000; // two failures in a row: the policy's first backoff (2 s)
  const first = studioApply();
  await turns();
  assert.equal(counts(), '3 light model, 3 cloudscape asks', 'the first Studio move past the backoff asks again');
  if (!first.settled) problems.push('a Studio light apply awaited the stalled light model and cloudscape re-asks (its light and the Studio\'s busy hold wait until the browser fails the transfer)');
  const moves = Array.from({ length: 10 }, studioApply);
  await turns();
  const waiting = moves.filter((apply) => !apply.settled).length;
  if (waiting) problems.push(`${waiting} of 10 Studio moves made while the re-ask was in flight awaited it`);
  assert.equal(counts(), '3 light model, 3 cloudscape asks', 'one request at a time: moves in flight ask nothing more');
  // the hung transfers fail (the browser gives up), and the network drops again
  network.set(LIGHT, 'down');
  network.set(CLOUDS, 'down');
  failStall(new TypeError('Failed to fetch dynamically imported module: (the stalled transfer)'));
  await turns();
  assert.ok(first.settled && moves.every((apply) => apply.settled), 'every Studio move settles once the hung transfer fails');
  assert.equal(globalThis.__cotGrounded ?? 0, 0);

  // ---- 2. the Studio's drag keeps the backoff: three minutes of moves (one per 100 ms) through the outage ask each part
  // only at the policy's backoff points (2, 4, 8 ... s, capped at a minute), never once per move
  const dragFrom = asked.get(LIGHT);
  for (let i = 0; i < 1800; i++) { clock += 100; await access.prepare(0, 'fjord', ['day']); }
  const dragAsks = asked.get(LIGHT) - dragFrom;
  assert.ok(dragAsks >= 4 && dragAsks <= 8, `a 1800-move drag asks at the backoff points (${dragAsks} light model asks)`);
  assert.equal(asked.get(CLOUDS), asked.get(LIGHT));
  // offline, an entry asks nothing (the policy's offline rule holds for an entry too)
  onLine = false;
  const offline = counts();
  await access.prepare(2, 'fjord', undefined, ENTRY);
  assert.equal(counts(), offline, 'an entry while the browser is offline asks nothing');
  onLine = true;

  // ---- 3. the network is back, one second after the drag's last failure (inside the minute's backoff that drag
  // raised): the next battle's entry asks both parts at once and lights its sky with them
  network.set(LIGHT, 'up');
  network.set(CLOUDS, 'up');
  clock += 1000;
  const before = counts();
  const battle = prepared.length;
  await access.prepare(3, 'delta', undefined, ENTRY);
  if (counts() === before) {
    problems.push(`a battle entered inside the lazy-chunk backoff asked nothing (${counts()}) and played on the authored rig with deck-only clouds (${prepared[battle]?.lit})`);
  } else {
    assert.equal(prepared[battle]?.lit, '1 light model, 1 cloudscape installs', 'the entry\'s sky is lit by the parts it asked');
    // loaded: later battles and Studio moves ask nothing
    const loaded = counts();
    await access.prepare(4, 'fjord', undefined, ENTRY);
    for (let i = 0; i < 10; i++) await access.prepare(0, 'fjord', ['day']);
    assert.equal(counts(), loaded, 'a loaded part is never asked again');
  }

  // ---- 4. the atmosphere runtime too: a Studio drag through a failed runtime chunk keeps the backoff, and the next
  // battle's entry inside it asks the runtime at once (base: the entry got the kept failure and its atmosphere failed)
  let runtimeUp = false, runtimeAsks = 0;
  const access2 = createBattleAtmosphereAccess(() => ({}), async () => {
    runtimeAsks += 1;
    if (!runtimeUp) throw new TypeError('Failed to fetch dynamically imported module: ./battleAtmosphereRuntime.ts');
    return { createBattleAtmosphereRuntime: () => ({ prepare() {}, reset() {} }) };
  });
  await assert.rejects(access2.prepare(1, 'fjord', undefined, ENTRY), /dynamically imported module/);
  for (let i = 0; i < 1800; i++) { clock += 100; await access2.prepare(0, 'fjord', ['day']).catch(() => {}); }
  assert.ok(runtimeAsks >= 5 && runtimeAsks <= 9, `the Studio's drag asks the failed runtime at the backoff points (${runtimeAsks} asks)`);
  runtimeUp = true;
  clock += 1000;
  const asksBefore = runtimeAsks;
  try {
    await access2.prepare(2, 'delta', undefined, ENTRY);
    assert.ok(access2.current, 'the entry\'s atmosphere runtime is made');
  } catch (error) {
    problems.push(`a battle entered inside the runtime chunk's backoff failed its atmosphere (${runtimeAsks - asksBefore} asks: ${error?.message})`);
  }

  // ---- 5. (round 4 F2 review) the runtime's re-ask, too: after a failed entry, a Studio apply whose runtime re-ask hangs
  // settles at once and applies nothing (the Studio light runtime's own sky stands; base and the first round-4 head
  // awaited it, holding the Studio's light and its busy 'light' hold until the browser failed the transfer). What it did
  // not wait for is its landing: true once the runtime lands while that prepare is still the latest (the Studio then
  // lights again with `{ relight: true }`, which applies the runtime's light even where it keeps an applied one), false
  // for a prepare a later one replaced
  let runtimeMode = 'down', releaseRuntime = () => {};
  let runtimeGate = null;
  const made = [];
  const access3 = createBattleAtmosphereAccess(() => ({}), async () => {
    if (runtimeMode === 'down') throw new TypeError('Failed to fetch dynamically imported module: ./battleAtmosphereRuntime.ts');
    await runtimeGate;
    return { createBattleAtmosphereRuntime: () => ({
      prepare(seed, _mapId, times) { made.push(['prepare', seed, times]); }, reset() { made.push(['reset']); },
    }) };
  });
  await assert.rejects(access3.prepare(1, 'fjord', undefined, ENTRY), /dynamically imported module/);
  runtimeMode = 'stall';
  runtimeGate = new Promise((resolve) => { releaseRuntime = resolve; });
  const hung = track(access3.prepare(0, 'fjord', ['day']));
  await turns();
  if (!hung.settled) {
    problems.push('a Studio light apply awaited the stalled atmosphere runtime\'s re-ask (its light and the Studio\'s busy hold wait until the browser fails the transfer)');
  } else {
    assert.deepEqual(made, [], 'it applies nothing while the runtime is in flight');
    const landing = hung.value?.landing;
    assert.ok(landing instanceof Promise, 'what it did not wait for is its landing');
    const newer = track(access3.prepare(0, 'fjord', ['day'])); // a later move while the re-ask is in flight
    await turns();
    assert.ok(newer.settled && newer.value?.landing instanceof Promise);
    releaseRuntime();
    assert.equal(await landing, false, 'a later prepare makes an earlier landing false (that apply never lights again)');
    assert.equal(await newer.value.landing, true, 'the latest landing is true once the runtime lands');
    assert.deepEqual(made, [], 'a landing applies nothing by itself');
    const relit = await access3.prepare(0, 'fjord', ['day'], { relight: true });
    assert.deepEqual(made, [['reset'], ['prepare', 0, ['day']]], 'the relight applies the runtime\'s light');
    assert.equal(relit.landing, null, 'nothing is left in flight');
    // a reset (the Garage's return) makes a landing in flight false too
    runtimeMode = 'down';
    let releaseLater = () => {};
    const later = new Promise((resolve) => { releaseLater = resolve; });
    const access4 = createBattleAtmosphereAccess(() => ({}), async () => {
      if (runtimeMode === 'down') throw new TypeError('Failed to fetch dynamically imported module: ./battleAtmosphereRuntime.ts');
      await later;
      return { createBattleAtmosphereRuntime: () => ({ prepare() {}, reset() {} }) };
    });
    await assert.rejects(access4.prepare(1, 'fjord', undefined, ENTRY), /dynamically imported module/);
    runtimeMode = 'up';
    const beforeReset = await access4.prepare(0, 'fjord', ['day']);
    access4.reset();
    releaseLater();
    assert.equal(await beforeReset.landing, false, 'a reset makes a landing in flight false');
  }
} finally {
  hook.deregister();
}
assert.deepEqual(problems, [], `the battle atmosphere's entry and Studio asks:\n  ${problems.join('\n  ')}`);
console.log('battleAtmosphereEntryAsk.selftest: OK (a battle entry asks the light model, the cloudscapes and the runtime at once whatever the backoff; a Studio apply keeps the backoff, waits on a first ask and never on a re-ask, and returns what it did not wait for as its landing)');
