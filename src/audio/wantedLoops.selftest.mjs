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

console.log('wantedLoops.selftest: wanted loops start once decoded (loader, fire alarm, cook-off, heartbeat), never after their battle, and before the graph passed');
