import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFakeContext, fakeBuffer } from './fakeAudioContext.test-support.mjs';
import { createBus } from '../game/stateCore.ts';

// Serve the shipped assets from disk; "decode" them as 1.5 s fake buffers.
const publicRoot = new URL('../../public/', import.meta.url);
const fetched = [];
globalThis.fetch = async (url) => {
  const path = String(url).replace(/^\//, '');
  fetched.push(path);
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
const terrain = {
  getHeightAt: () => 0,
  getGroundType: (x) => (x > 200 ? 'hard' : 'medium'),
  getTrackSurfaceAt: () => 0,
  getWaterDepthAt: (x) => (x < -300 ? 2 : 0),
};
const audio = createAudio({ context: ctx, getMapId: () => 'urban', getTerrain: () => terrain, tier: 'desktop' });
const bus = createBus();
audio.bindBus(bus);
assert.equal(ctx.nodes.length, 0, 'nothing is built before resume()');
audio.resume();
const probe = globalThis.window.__COT_AUDIO;
assert.ok(probe, 'debug surface installed');

function tank(id, { x = 0, z = 0, team = 'player', isPlayer = false, specId = 't72b3m', nation = 'Russia', speed = 0, throttle = 0 } = {}) {
  return {
    id, team, isPlayer, specId,
    spec: { id: specId, nation, role: 'mbt', weightTons: 46.5, enginePowerHp: 1130, topSpeedKmh: 70, reverseSpeedKmh: 15, gun: { caliberMm: 125, shells: [{ type: 'APFSDS' }, { type: 'HEAT' }, { type: 'HE' }] } },
    state: { pos: { x, y: 0, z }, speed, yaw: 0, yawRate: 0, verticalSpeed: 0, grounded: true, turretYawRate: 0, gunPitch: 0 },
    input: { throttle },
    combat: { destroyed: false, hp: 1000, maxHp: 1000, modules: {}, ammo: [20, 10, 10], ammoCapacity: [20, 10, 10], shellSlot: 0 },
  };
}

const listener = { pos: { x: 0, y: 2, z: 0 }, forward: { x: 0, y: 0, z: 1 }, kind: 'player-tank', ownerId: 'me', scoped: false };
const me = tank('me', { isPlayer: true });
const ally = tank('ally', { x: 30, z: 60, specId: 'leo2a6', nation: 'Germany' });
const foe = tank('foe', { x: -40, z: 120, team: 'enemy', specId: 'm1a2', nation: 'USA' });
const farFoe = tank('far', { x: 0, z: 700, team: 'enemy', specId: 'bmp2', nation: 'USSR' });
const tanks = [me, ally, foe, farFoe];

bus.emit('phase:change', { phase: 'battle' });
await audio.warmBattleEvents(['t72b3m', 'leo2a6', 'm1a2', 'bmp2']);
audio.ambientOn(true);
for (let i = 0; i < 10; i++) { ctx.advance(1 / 60); audio.update(1 / 60, listener, tanks); }
for (let i = 0; i < 6; i++) await new Promise((resolve) => setTimeout(resolve, 0));

// Vehicle rigs: the occupied hull, near tanks and a far tank with their real powertrains.
const engines = probe.engineState();
const byId = Object.fromEntries(engines.map((e) => [e.id, e]));
assert.equal(byId.me?.lod, 'own');
assert.equal(byId.me.family, 'diesel_v12_soviet');
assert.equal(byId.foe?.family, 'turbine_agt', 'the Abrams whines');
assert.equal(byId.ally?.family, 'diesel_v12_modern');
assert.equal(byId.far?.lod, 'far', 'a 700 m tank keeps one engine band');
assert.equal(probe.crewLanguage, 'ru', 'a Russian hull carries a Russian crew');
assert.ok(fetched.some((p) => p.startsWith('audio/voice/ru/')), 'the national pack loads');
assert.equal(probe.ambientState().bed, 'amb_urban', 'Steinburg plays its ruined-town scene');

// Weapons: close report + urban tail near; distant report far; supersonic flyby on a near miss.
const mark = () => probe.sfxLog.length;
let since = mark();
bus.emit('shell:fired', { shellId: 1, shooterId: 'foe', muzzlePos: [-40, 2, 120], dir: [0.316, 0, -0.949], caliberMm: 120, shellType: 'APFSDS', velocityMps: 1650 });
let names = probe.sfxLog.slice(since).map((e) => e.n);
assert.ok(names.includes('gun_120_close'), `near 120 mm report (${names})`);
assert.ok(names.includes('tail_urban'), 'the shot rings into the urban tail');
assert.ok(names.includes('shell_flyby_sabot'), 'the sabot cracks past the listener');
const close = probe.sfxLog.slice(since).find((e) => e.n === 'gun_120_close');
assert.ok(close.t > ctx.currentTime + 0.3, 'the report arrives at the speed of sound (126 m ≈ 0.37 s)');
since = mark();
bus.emit('shell:fired', { shellId: 2, shooterId: 'far', muzzlePos: [0, 2, 700], dir: [1, 0, 0], caliberMm: 30, shellType: 'APFSDS', weaponSound: '2a42' });
names = probe.sfxLog.slice(since).map((e) => e.n);
assert.ok(names.includes('ac_far_light'), `700 m autocannon is a distant report (${names})`);
assert.ok(!names.includes('ac_30_close'), 'no close report at 700 m');

// Our own gun, then the reload choreography of a carousel autoloader.
since = mark();
bus.emit('shell:fired', { shellId: 3, shooterId: 'me', isPlayer: true, muzzlePos: [0, 2, 3], dir: [0, 0, 1], caliberMm: 125, shellType: 'APFSDS' });
assert.ok(probe.sfxLog.slice(since).some((e) => e.n === 'gun_125_close'));
since = mark();
for (const progress of [0, 0.1, 0.5, 0.7, 0.8, 0.95]) bus.emit('player:reload', { total: 7, kind: 'shell', caliberMm: 125, t: 7 * (1 - progress), progress });
bus.emit('player:reload', { total: 7, kind: 'shell', caliberMm: 125, t: 0, progress: 1, done: true });
names = probe.sfxLog.slice(since).map((e) => e.n);
for (const id of ['case_eject_stub', 'autoloader_carousel', 'autoloader_lift', 'autoloader_chain_ram', 'breech_close', 'latch_ready']) {
  assert.ok(names.includes(id), `carousel reload plays ${id} (${names})`);
}

// Being hit: exterior impact + interior response + a crew call in Russian.
for (let i = 0; i < 200 && !probe.voicesLoaded; i++) await new Promise((resolve) => setTimeout(resolve, 5));
assert.ok(probe.voicesLoaded, 'the Russian pack decoded');
since = mark();
ctx.advance(3);
bus.emit('shell:hit', { shellId: 4, pos: [0, 1.5, 2], kind: 'pen', targetId: 'me', attackerId: 'foe', damage: 300, caliberMm: 120, targetMaxHp: 1000, targetHpAfter: 700 });
names = probe.sfxLog.slice(since).map((e) => e.n);
assert.ok(names.includes('pen_heavy') && names.includes('pen_interior'), `penetration on our hull (${names})`);
ctx.advance(0.25);
audio.update(1 / 60, listener, tanks);
assert.equal(probe.voiceLog.at(-1)?.id, 'were_hit');
assert.equal(probe.voiceLog.at(-1)?.lang, 'ru');

// Edge cases: dry fire on an empty rack, ammo switch call, smoke, friendly ram.
since = mark();
ctx.advance(10);
bus.emit('ammo:empty', { id: 'me', slot: 0 });
bus.emit('ui:shellSelectionChanged', { slot: 1 });
names = probe.sfxLog.slice(since).map((e) => e.n);
assert.ok(names.includes('dry_fire'), 'firing on empty clicks');
assert.ok(names.includes('autoloader_carousel'), 'an autoloader turns to the new round');
since = mark();
bus.emit('auxiliary:smokeScreens', { screens: [{ born: 12, x: 4, y: 2, z: 12, source: ['t72b3m', 0, 0, 0] }] });
names = probe.sfxLog.slice(since).map((e) => e.n);
assert.ok(names.includes('smoke_launcher') && names.includes('smoke_burst'), `smoke volley (${names})`);
since = mark();
bus.emit('tank:ram', { aId: 'me', bId: 'ally', pos: [10, 1, 20], closingMps: 7, dmgA: 50, dmgB: 50 });
assert.ok(probe.sfxLog.slice(since).some((e) => e.n === 'ram_heavy'));

// Destruction: an ammo-rack kill by us → blast, turret, cook-off, kill confirm.
since = mark();
ctx.advance(10);
bus.emit('tank:destroyed', { id: 'foe', killerId: 'me', pos: [-40, 0, 120], cause: 'ammorack' });
names = probe.sfxLog.slice(since).map((e) => e.n);
for (const id of ['tank_explode_ammo', 'debris_metal', 'turret_land', 'cookoff_loop', 'ui_kill']) assert.ok(names.includes(id), `${id} on an ammo-rack kill (${names})`);
ctx.advance(0.4);
audio.update(1 / 60, listener, tanks.filter((t) => t.id !== 'foe'));
assert.ok(['target_destroyed', 'double_kill'].includes(probe.voiceLog.at(-1)?.id), `kill confirm (${probe.voiceLog.at(-1)?.id})`);
assert.ok(!probe.engineState().some((e) => e.id === 'foe'), 'the dead tank stops idling');

// Kill-cam replay: a crisp blast, then debris stretched to the 0.55x replay, all on the cinematic bus.
since = mark();
ctx.advance(6);
bus.emit('killcam:begin', { kind: 'projectile' });
bus.emit('killcam:impact', { cause: 'ammorack', pos: [-40, 0, 120], timeScale: 0.55 });
const replay = probe.sfxLog.slice(since);
const blast = replay.find((e) => e.n === 'tank_explode_ammo');
const debris = replay.find((e) => e.n === 'debris_metal');
assert.equal(blast?.b, 'cinematic', `replayed blast on the cinematic bus (${replay.map((e) => e.n)})`);
assert.ok(blast.r > 0.85, 'the blast transient stays crisp');
assert.ok(debris?.b === 'cinematic' && debris.r > 0.5 && debris.r < 0.6, `debris stretched to the replay rate (${debris?.r})`);
assert.equal(probe.killcamSfxLog.at(-1).slowRate, 0.55);
assert.equal(probe.snapshot, 'killcam');
bus.emit('killcam:done', {});

// Panning follows the camera: world −X is screen-right when looking along +Z.
assert.ok(probe.spatialAt(-20, 2, 0).pan > 0, 'screen-right pans right');

// Scope: the interior snapshot and the sight sounds.
since = mark();
listener.scoped = true;
ctx.advance(0.1);
audio.update(1 / 60, listener, tanks);
assert.equal(probe.snapshot, 'scoped');
assert.ok(probe.sfxLog.slice(since).some((e) => e.n === 'scope_in'));
listener.scoped = false;

// Leaving battle tears every world loop down.
bus.emit('phase:change', { phase: 'garage' });
audio.update(1 / 60, listener, tanks);
assert.equal(probe.engineState().length, 0, 'no rig survives the garage edge');
assert.equal(probe.snapshot, 'garage');
assert.equal(probe.ambientState().bed, 'amb_garage');

console.log(`audioEngine.selftest: rigs by powertrain, national crew, scenes, weapon layering + delay + flyby, reload choreography, hits, edge cases, destruction, panning, scope and teardown passed (${probe.sfxLog.length} voices logged)`);
