// 2026-11-02 audit F11 (machine 5): a loop the engine wants sounding starts once its recording has decoded. The
// loader's bed, the fire alarm, a wreck's cook-off and the critical-damage heartbeat used to latch their "on" flag
// while the asset was still decoding (a cold first battle, a deep link, a network join) and never ask again; a loader
// asked for before the graph existed was dropped outright. A loop still decoding when its battle ends never starts in
// the garage, and the debug surface's loadingActive agrees with the engine's own flag.
import assert from 'node:assert/strict';
import { createBus } from '../game/stateCore.ts';
import { installFetch, namedContext, terrain, tank, listener, sounding, probeOf, settle } from './engineHarness.test-support.mjs';

globalThis.window = {};
const HELD = ['loading_bed_loop', 'alarm_fire_loop', 'cookoff_loop', 'heartbeat_loop'];
const fetches = installFetch({ hold: (url) => HELD.some((id) => url.includes(`/${id}_`)) });
const release = async (id) => {
  await settle(12); // every load not held lands, and the held asset's own files have been asked for
  const files = fetches.held.filter((h) => h.url.includes(`/${id}_`));
  assert.ok(files.length > 0, `${id} was asked for and is held`);
  for (const file of files) { fetches.held.splice(fetches.held.indexOf(file), 1); file.release(); }
  await settle(12);
};
const { createAudio } = await import('./audioEngine.ts');

const ctx = namedContext();
const audio = createAudio({ context: ctx, getMapId: () => 'verdant', getGameMode: () => 'standard', getTerrain: () => terrain, tier: 'desktop' });
const bus = createBus();
audio.bindBus(bus);
audio.resume();
const probe = probeOf();
const me = tank('me', { isPlayer: true });
const foe = tank('foe', { specId: 'leo2a4', nation: 'Germany', x: 20, z: 40, team: 'enemy' });
const frames = (n, list = [me, foe]) => { for (let i = 0; i < n; i++) { ctx.advance(1 / 30); audio.update(1 / 30, listener, list); } };
await settle();

// 1. a cold first battle: the loader asked for while its bed decodes
audio.loadingOn(true);
assert.equal(probe.loadingActive, true, 'the loader is wanted (the debug surface reads the engine\'s flag)');
assert.equal(probe.loadingSounding, false, 'its bed is still decoding');
await release('loading_bed_loop');
assert.ok(sounding(ctx).includes('loading_bed_loop'), 'the bed starts once it has decoded');
assert.equal(probe.loadingSounding, true);
audio.loadingOn(false);

// 2. in battle: the fire alarm, a wreck's cook-off and the heartbeat, each asked for while decoding
bus.emit('phase:change', { phase: 'battle' });
audio.ambientOn(true);
frames(10);
bus.emit('battle:rollout', {});
bus.emit('tank:fire', { id: 'me', burning: true });
bus.emit('tank:destroyed', { id: 'foe', killerId: 'me', pos: [20, 0, 40], cause: 'ammorack' });
me.combat.hp = 200; // a quarter of the hull left
frames(15);
await settle(12);
frames(3);
assert.deepEqual(sounding(ctx).filter((n) => HELD.includes(n)), [], 'nothing of the four has decoded yet');
await release('alarm_fire_loop');
await release('cookoff_loop');
await release('heartbeat_loop');
frames(30);
let loops = sounding(ctx);
assert.ok(loops.includes('alarm_fire_loop'), `the fire alarm sounds once decoded (${loops})`);
assert.ok(loops.includes('cookoff_loop'), 'the wreck\'s cook-off too');
// the heartbeat is a loop with a length: its stop is scheduled as it starts
const heartbeat = ctx.started.find((n) => n.buffer?.name === 'heartbeat_loop');
assert.ok(heartbeat && heartbeat.stopped > ctx.currentTime, 'and the heartbeat, within its moment');
assert.ok(heartbeat.stopped - heartbeat.started.at < 6, `a late heartbeat keeps its end (${heartbeat.stopped - heartbeat.started.at} s)`);
bus.emit('tank:fire', { id: 'me', burning: false });
frames(10);
assert.ok(!sounding(ctx).includes('alarm_fire_loop'), 'the alarm stops when the fire is out');

// 3. a loop still decoding when the battle ends never starts in the garage
fetches.held.length = 0;
const lateCtx = namedContext();
const lateFetch = installFetch({ hold: (url) => url.includes('/alarm_fire_loop_') });
const late = createAudio({ context: lateCtx, getMapId: () => 'verdant', getGameMode: () => 'standard', getTerrain: () => terrain, tier: 'desktop' });
const lateBus = createBus();
late.bindBus(lateBus);
late.resume();
lateBus.emit('phase:change', { phase: 'battle' });
for (let i = 0; i < 5; i++) { lateCtx.advance(1 / 30); late.update(1 / 30, listener, [tank('me', { isPlayer: true })]); }
lateBus.emit('tank:fire', { id: 'me', burning: true });
lateBus.emit('phase:change', { phase: 'garage' });
for (const held of lateFetch.held.splice(0)) held.release();
await settle(12);
assert.ok(!sounding(lateCtx).includes('alarm_fire_loop'), 'a battle\'s alarm decoded after it ended stays silent');

// 4. a loader asked for before the graph exists starts with it
installFetch();
const coldCtx = namedContext();
const previousAC = globalThis.AudioContext;
globalThis.AudioContext = function FakeAudioContext() { return coldCtx; };
try {
  const cold = createAudio({ context: null, getMapId: () => 'verdant', getGameMode: () => 'standard', getTerrain: () => terrain, tier: 'desktop' });
  cold.bindBus(createBus());
  cold.loadingOn(true);
  cold.resume();
  await settle(12);
  assert.ok(sounding(coldCtx).includes('loading_bed_loop'), 'the loader wanted before the graph existed plays once it does');
} finally {
  if (previousAC === undefined) delete globalThis.AudioContext;
  else globalThis.AudioContext = previousAC;
}

// 5. (U34, round 2) a wanted loop whose decode fails, or that is asked for inside the library's retry backoff, starts
// once the backoff has run out (the engine's update sweeps its waiting loops about once a second; the library times its
// backoff on performance.now, stepped here). A timed loop (the heartbeat) whose moment passes while it decodes leaves the
// waiting list.
{
  let skewMs = 0;
  const realNow = performance.now.bind(performance);
  Object.defineProperty(performance, 'now', { configurable: true, writable: true, value: () => realNow() + skewMs });
  try {
    let alarmFetches = 0;
    const failFetch = installFetch({
      fail: (url) => url.includes('/alarm_fire_loop_') && ++alarmFetches <= 1,
      hold: (url) => url.includes('/heartbeat_loop_'),
    });
    const fctx = namedContext();
    const failing = createAudio({ context: fctx, getMapId: () => 'verdant', getGameMode: () => 'standard', getTerrain: () => terrain, tier: 'desktop' });
    const fbus = createBus();
    failing.bindBus(fbus);
    failing.resume();
    const fprobe = probeOf();
    const self = tank('me', { isPlayer: true });
    const run = (n) => { for (let i = 0; i < n; i++) { fctx.advance(1 / 30); failing.update(1 / 30, listener, [self]); } };
    fbus.emit('phase:change', { phase: 'battle' });
    run(5);
    fbus.emit('battle:rollout', {});
    // (a) the in-flight decode fails (a transient 404): the alarm waits, then sounds once the backoff has run out
    fbus.emit('tank:fire', { id: 'me', burning: true });
    run(3);
    await settle(12);
    run(3);
    assert.ok(alarmFetches >= 1 && !sounding(fctx).includes('alarm_fire_loop'), 'the alarm\'s first fetch failed: silent for now');
    skewMs += 2500; // past the 2 s first backoff
    run(45); // one and a half seconds of frames: the sweep asks again
    await settle(12);
    run(3);
    assert.ok(sounding(fctx).includes('alarm_fire_loop'), 'a wanted loop whose decode failed sounds once its retry lands');
    fbus.emit('tank:fire', { id: 'me', burning: false });
    run(5);
    // (b) asked for inside the backoff: the fire again, the asset failed a moment ago (a second failure on its next ask)
    // a fresh mixer whose first fetch fails, then the want is dropped and asked for again inside the backoff
    const bctx = namedContext();
    let bFetches = 0;
    installFetch({ fail: (url) => url.includes('/alarm_fire_loop_') && ++bFetches <= 1 });
    const backoff = createAudio({ context: bctx, getMapId: () => 'verdant', getGameMode: () => 'standard', getTerrain: () => terrain, tier: 'desktop' });
    const bbus = createBus();
    backoff.bindBus(bbus);
    backoff.resume();
    const brun = (n) => { for (let i = 0; i < n; i++) { bctx.advance(1 / 30); backoff.update(1 / 30, listener, [self]); } };
    bbus.emit('phase:change', { phase: 'battle' });
    brun(5);
    bbus.emit('battle:rollout', {});
    bbus.emit('tank:fire', { id: 'me', burning: true });
    brun(3);
    await settle(12);
    bbus.emit('tank:fire', { id: 'me', burning: false }); // the fire out before the retry
    brun(3);
    bbus.emit('tank:fire', { id: 'me', burning: true }); // and alight again, inside the backoff
    brun(3);
    await settle(12);
    assert.ok(!sounding(bctx).includes('alarm_fire_loop'), 'inside the backoff the alarm waits');
    skewMs += 2500;
    brun(45);
    await settle(12);
    brun(3);
    assert.ok(sounding(bctx).includes('alarm_fire_loop'), 'a loop asked for inside the backoff sounds once it runs out');
    bbus.emit('phase:change', { phase: 'garage' });
    brun(3);
    // (c) the heartbeat decodes after its 6 s moment: it never starts, and it leaves the waiting list
    void failFetch;
    self.combat.hp = Math.round(self.combat.maxHp * 0.2);
    run(5);
    await settle(12);
    const waitingBefore = fprobe.battleState().loopsWaiting;
    assert.ok(waitingBefore >= 1, `the heartbeat waits for its recording (${waitingBefore})`);
    run(30 * 7); // seven seconds: past its moment
    for (const held of failFetch.held.splice(0)) held.release();
    await settle(12);
    run(3);
    assert.ok(!sounding(fctx).includes('heartbeat_loop'), 'a heartbeat past its moment is not started');
    assert.equal(fprobe.battleState().loopsWaiting, waitingBefore - 1, 'and its want leaves the waiting list');
    fbus.emit('phase:change', { phase: 'garage' });
    run(3);
  } finally {
    delete performance.now;
  }
}

console.log('wantedLoops.selftest: wanted loops start once decoded (loader, fire alarm, cook-off, heartbeat), never after their battle, and before the graph passed');
