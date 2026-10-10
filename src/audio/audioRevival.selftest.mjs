// Receipt (the 2.0 revival, 2026-10-06): the engine plays the revival's sounds at their moments, on the shipped
// manifests. A toppled telegraph pole cracks, whips its wires and lands with the hinge; a haycart, a knocked drum and
// the red fuel drum sound of what they are; the rebuilt maps play their own beds and layers; the front's flyovers
// sound of their era; and the bells toll from the nearest tower, rarely, only in a quiet stretch, never on a map
// without them.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFakeContext, fakeBuffer } from './fakeAudioContext.test-support.mjs';
import { createBus } from '../game/stateCore.ts';
import { BELL_POLICY, BELL_TOWERS } from './environmentScenes.ts';
import { TOPPLE_LAND_S } from './propSounds.ts';

const publicRoot = new URL('../../public/', import.meta.url);
globalThis.fetch = async (url) => {
  const path = String(url).replace(/^\//, '');
  try {
    const bytes = await readFile(new URL(path, publicRoot));
    return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
  } catch {
    return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) };
  }
};
globalThis.window = {};

const { createAudio } = await import('./audioEngine.ts');
const ctx = createFakeContext({ decode: () => fakeBuffer(1.5) });
const GROUND_Y = 12;
const terrain = { getHeightAt: () => GROUND_Y, getGroundType: () => 'medium', getTrackSurfaceAt: () => 0, getWaterDepthAt: () => 0 };
let mapId = 'frontier';
let landmarks = null;
let landmarkReads = 0;
const audio = createAudio({
  context: ctx, getMapId: () => mapId, getGameMode: () => 'standard', getTerrain: () => terrain,
  getLandmarks: () => { landmarkReads++; return landmarks; }, tier: 'desktop',
});
const bus = createBus();
audio.bindBus(bus);
audio.resume();
const probe = globalThis.window.__COT_AUDIO;

const listener = { pos: { x: 0, y: 2, z: 0 }, forward: { x: 0, y: 0, z: 1 }, kind: 'player-tank', ownerId: 'me', scoped: false };
const me = {
  id: 'me', team: 'player', isPlayer: true, specId: 't72b3m',
  spec: { id: 't72b3m', nation: 'Russia', role: 'mbt', weightTons: 46.5, enginePowerHp: 1130, topSpeedKmh: 70, reverseSpeedKmh: 15, gun: { caliberMm: 125, shells: [{ type: 'APFSDS' }] } },
  state: { pos: { x: 0, y: 0, z: 0 }, speed: 0, yaw: 0, yawRate: 0, verticalSpeed: 0, grounded: true, turretYawRate: 0, gunPitch: 0 },
  input: { throttle: 0 },
  combat: { destroyed: false, hp: 1000, maxHp: 1000, modules: {}, ammo: [20], ammoCapacity: [20], shellSlot: 0 },
};
const mark = () => probe.sfxLog.at(-1)?.seq ?? 0;
const since = (seq) => probe.sfxLog.filter((e) => e.seq > seq);
async function settle() {
  for (let i = 0; i < 6; i++) await new Promise((resolve) => setTimeout(resolve, 0));
  for (let i = 0; i < 1000 && probe.library().pending > 0; i++) await new Promise((resolve) => setTimeout(resolve, 5));
}
/** Advance the clock in frames; `each(now)` runs after every frame. */
function run(seconds, each = null, dt = 0.25) {
  for (let t = 0; t < seconds - 1e-9; t += dt) {
    ctx.advance(dt);
    audio.update(dt, listener, [me]);
    each?.(ctx.currentTime);
  }
}
async function battle(map, features = null, { rollout = true } = {}) {
  mapId = map;
  landmarks = features;
  bus.emit('phase:change', { phase: 'garage' });
  bus.emit('phase:change', { phase: 'battle' });
  await audio.warmBattleEvents(['t72b3m']);
  audio.ambientOn(true);
  run(0.5);
  await settle();
  if (rollout) bus.emit('battle:rollout', {});
  run(0.5);
}

// ---- the rebuilt maps' scenes: their own beds and layers, playing.
const sceneOf = async (map) => { await battle(map); return probe.ambientState(); };
let st = await sceneOf('fjord');
assert.equal(st.bed, 'amb_fjord', 'Nordhavn: calm fjord water, not breaking surf');
assert.equal(st.layer, 'layer_waterfall');
assert.ok(st.loops.every((loop) => loop.playing), `the fjord's loops play (${JSON.stringify(st.loops)})`);
st = await sceneOf('saltwind');
assert.equal(st.bed, 'amb_adriatic', 'Saltwind: a sheltered Adriatic bay');
assert.equal(st.layer, null, 'no open-coast surf in a sheltered bay');
assert.equal(st.bells, 'western');
st = await sceneOf('titan_gorge');
assert.deepEqual([st.bed, st.layer], ['amb_desert', null], 'Monument Valley: desert wind, no river');
st = await sceneOf('badlands');
assert.equal(st.bed, 'amb_desert', 'Wadi Rum: dry wind in the sand valleys');
st = await sceneOf('blackglass');
assert.equal(st.layer, 'layer_creek', 'Suzhou Creek: the creek against its embankments');
st = await sceneOf('whiteout');
assert.deepEqual([st.bed, st.layer], ['amb_polar', 'layer_station'], 'DYE-M: the plateau wind and the station drone');
assert.ok(st.loops.every((loop) => loop.playing), 'the station layer plays');

// ---- props: a toppled pole, a haycart, a knocked drum, the fuel drum, a cone.
await battle('frontier');
let seq = mark();
bus.emit('prop:destroyed', { kind: 'utility_pole', pos: [12, 0, 16], cause: 'ram' });
let got = since(seq);
const snap = got.find((e) => e.n === 'pole_snap');
const wires = got.find((e) => e.n === 'pole_wires');
const fall = got.find((e) => e.n === 'pole_fall');
assert.ok(snap && wires && fall, `a toppled pole: snap, wires, landing (${got.map((e) => e.n)})`);
assert.ok(wires.t - snap.t >= 0.29 && wires.t - snap.t <= 0.41, `the wires whip as it goes over (${(wires.t - snap.t).toFixed(3)} s)`);
assert.ok(fall.t - snap.t >= TOPPLE_LAND_S - 0.01 && fall.t - snap.t <= TOPPLE_LAND_S + 0.07, `it lands with the hinge (${(fall.t - snap.t).toFixed(3)} s)`);
assert.ok(probe.soundLog.some((e) => e.type === 'prop:destroyed' && e.kind === 'utility_pole'), 'the pole is logged');

run(0.2);
seq = mark();
bus.emit('prop:crushed', { kind: 'haycart', pos: [10, 0, -8], h: 2.1, dir: [0, 0, 1] });
got = since(seq).map((e) => e.n);
assert.ok(got.includes('cart_break') && got.includes('straw_crush'), `a haycart splinters and its hay goes down (${got})`);
assert.ok(!got.includes('car_crush'), 'a haycart is no car');

run(0.2);
seq = mark();
bus.emit('prop:destroyed', { kind: 'drum', pos: [6, 0, 6], cause: 'ram', loose: true });
assert.deepEqual(since(seq).map((e) => e.n), ['can_knock'], 'a knocked drum clangs');
assert.ok(probe.soundLog.some((e) => e.type === 'prop:knocked' && e.kind === 'drum'), 'a knock logs as a knock, not a destruction');
run(0.1);
seq = mark();
bus.emit('prop:destroyed', { kind: 'drum', pos: [6.5, 0, 6.5], cause: 'ram', loose: true });
assert.equal(since(seq).length, 0, 'a drum shoved along does not clang on every contact');
run(0.3);
seq = mark();
bus.emit('prop:destroyed', { kind: 'bucket', pos: [7, 0, 6], cause: 'ram', loose: true });
assert.deepEqual(since(seq).map((e) => e.n), ['can_knock'], 'the next shove clangs again');

run(0.2);
seq = mark();
bus.emit('prop:destroyed', { kind: 'drumred', pos: [20, 0, 0], cause: 'ram' });
assert.ok(since(seq).some((e) => e.n === 'fuel_drum_blast'), 'the red fuel drum explodes');
run(0.2);
seq = mark();
bus.emit('prop:destroyed', { kind: 'cone', pos: [3, 0, 3], cause: 'ram', loose: true });
assert.equal(since(seq).length, 0, 'a plastic cone is silent by name');

// ---- the front's flyovers by era (src/world/flyoverAircraft.ts flies the period's types).
const flyover = (aircraft) => {
  run(1);
  const before = mark();
  bus.emit('atmosphere:flyover', { p0: [-400, 300, 0], v: [100, 0, 0], durationS: 8, ...(aircraft ? { aircraft } : {}) });
  return since(before).map((e) => e.n).find((n) => /flyover/.test(n)) ?? null;
};
assert.equal(flyover(), 'jet_flyover', 'Frontier (the Fulda Gap) flies jets');
assert.equal(flyover('il2'), 'flyover_piston', 'an event naming an Il-2 plays a piston engine');
assert.equal(flyover('g3m'), 'flyover_bomber', 'a G3M is a twin-engine bomber');
await battle('blackglass');
assert.equal(flyover(), 'flyover_bomber', 'Shanghai, 1937: the G3Ms');
await battle('verdant');
assert.equal(flyover(), 'flyover_piston', 'Prokhorovka, 1943: piston fighters, not jets');
assert.equal(flyover('f16'), 'jet_flyover', 'a named jet stays a jet');
await battle('foundry');
const mixed = new Set();
for (let i = 0; i < 16; i++) mixed.add(flyover());
assert.deepEqual([...mixed].sort(), ['flyover_bomber', 'flyover_piston'], 'the Saar flies Thunderbolts and Marauders');

// ---- bells: the nearest tower in earshot, in a quiet stretch.
const church = { x: 300, z: 40, kind: 'church' };
const campanile = { x: 0, z: 1500, landmark: 'campanile' };
const tolls = (entries, asset = 'bell_toll') => entries.filter((e) => e.n === asset);
landmarkReads = 0;
await battle('frontier', [church, campanile, { x: 30, z: 30, kind: 'farmhouse' }]);
assert.equal(landmarkReads, 0, 'the towers are read when a toll falls due, not at the phase edge');
seq = mark();
const start = ctx.currentTime;
run(BELL_POLICY.firstS[1] + 6);
let rung = tolls(since(seq));
assert.ok(rung.length >= 1 && rung.length <= BELL_POLICY.strokes[1], `one toll of one to three strokes (${rung.length})`);
const firstAt = rung[0].t - start;
assert.ok(firstAt >= BELL_POLICY.firstS[0] && firstAt <= BELL_POLICY.firstS[1] + 2, `the first toll after ${BELL_POLICY.firstS.join('–')} s (${firstAt.toFixed(1)})`);
for (let i = 1; i < rung.length; i++) {
  const gap = rung[i].t - rung[i - 1].t;
  assert.ok(gap >= BELL_POLICY.strokeGapS[0] - 0.01 && gap <= BELL_POLICY.strokeGapS[1] + 0.01, `strokes ${gap.toFixed(2)} s apart`);
}
const towerDistance = Math.hypot(church.x, GROUND_Y + BELL_TOWERS.church.heightM - listener.pos.y, church.z);
assert.ok(Math.abs(rung[0].d - towerDistance) < 1.5, `rung from the nearest tower, the church (${rung[0].d} m)`);
assert.ok(rung[0].r >= BELL_TOWERS.church.rate * 0.99 - 1e-3 && rung[0].r <= BELL_TOWERS.church.rate * 1.01 + 1e-3, `the church's bell pitch (${rung[0].r})`);
assert.equal(rung[0].b, 'ambience', 'bells ride the ambience bus');
assert.equal(landmarkReads, 1, 'the towers are read once');
const state = probe.ambientState();
assert.equal(state.tolls, 1);
assert.equal(state.lastToll.kind, 'church');
// the next toll falls everyS after the last one, wherever in the first window that rang (the read comes firstS[1] + 6 s
// after the start, so up to 56 s after an early toll; batch 4: the merged tree's draws rang it at the window's start)
const sinceToll = ctx.currentTime - rung[0].t;
assert.ok(state.nextTollInS + sinceToll >= BELL_POLICY.everyS[0] - 0.5 && state.nextTollInS + sinceToll <= BELL_POLICY.everyS[1] + 0.5,
  `the next toll ${BELL_POLICY.everyS.join('–')} s after the last (${(state.nextTollInS + sinceToll).toFixed(1)} s; ${state.nextTollInS} s away)`);
// Rare: no second toll within the minimum interval.
seq = mark();
run(BELL_POLICY.everyS[0] - 20);
assert.equal(tolls(since(seq)).length, 0, 'never two tolls within the interval');

// A battle held before its rollout (the countdown, a probe's frozen pre-battle) never tolls.
await battle('frontier', [church], { rollout: false });
seq = mark();
run(BELL_POLICY.firstS[1] + 30);
assert.equal(tolls(since(seq)).length, 0, 'no bell before the rollout');
bus.emit('battle:rollout', {});
run(BELL_POLICY.quietS + 2);
assert.equal(tolls(since(seq)).length >= 1, true, 'the overdue toll rings once the battle rolls out');

// The fighting holds them: a battle that stays loud never hears a bell; once it falls quiet, the bell waits out the quiet.
await battle('frontier', [church]);
seq = mark();
let lastBlast = -Infinity;
run(BELL_POLICY.firstS[1] + 60, (now) => {
  if (now - lastBlast >= 9) { probe.play('expl_he_large', { x: 30, y: 0, z: 30 }); lastBlast = now; }
});
assert.equal(tolls(since(seq)).length, 0, 'no bell through the fighting');
const loudUntil = lastBlast;
run(BELL_POLICY.quietS + 12);
rung = tolls(since(seq));
assert.ok(rung.length >= 1, 'the bell tolls once the battle falls quiet');
assert.ok(rung[0].t - loudUntil >= BELL_POLICY.quietS, `only after ${BELL_POLICY.quietS} s of quiet (${(rung[0].t - loudUntil).toFixed(1)} s)`);

// The Orthodox village church rings once, with its own bells; the campanile's great bell is the lowest.
await battle('verdant', [{ x: 200, z: 0, kind: 'chapel' }]);
seq = mark();
run(BELL_POLICY.firstS[1] + 6);
rung = since(seq);
assert.equal(tolls(rung, 'bell_orthodox').length, 1, 'an Orthodox tower rings once (its recording carries the rhythm)');
assert.equal(tolls(rung).length, 0, 'never the Western toll in an Orthodox village');
await battle('saltwind', [{ x: -81, z: 10, landmark: 'campanile' }]);
seq = mark();
run(BELL_POLICY.firstS[1] + 6);
rung = tolls(since(seq));
assert.ok(rung.length >= 1 && rung[0].r <= BELL_TOWERS.campanile.rate * 1.01 + 1e-3, `the campanile's great bell, lower than a church's (${rung[0]?.r})`);
assert.ok(BELL_TOWERS.campanile.rate < BELL_TOWERS.church.rate && BELL_TOWERS.church.rate < BELL_TOWERS.belfry.rate, 'larger bells ring lower');

// No bells where none ring, nor from a tower out of earshot, nor in the garage.
await battle('delta', [{ x: 100, z: 0, kind: 'chapel' }]);
seq = mark();
run(BELL_POLICY.firstS[1] + BELL_POLICY.everyS[1]);
assert.equal(since(seq).filter((e) => /^bell_/.test(e.n)).length, 0, 'the Jamuna rings no bells (its chapel is a mosque)');
await battle('urban', [{ x: BELL_POLICY.maxM + 500, z: 0, kind: 'church' }]);
seq = mark();
run(BELL_POLICY.firstS[1] + 40);
assert.equal(tolls(since(seq)).length, 0, 'a tower out of earshot stays silent');
bus.emit('phase:change', { phase: 'garage' });
seq = mark();
run(BELL_POLICY.firstS[1] + 6);
assert.equal(since(seq).filter((e) => /^bell_/.test(e.n)).length, 0, 'no bell in the garage');

console.log('audioRevival.selftest: poles, carts, knocks, fuel drums, the rebuilt scenes, flyovers by era and quiet-stretch bells passed');
