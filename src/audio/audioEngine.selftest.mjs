import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createFakeContext, fakeBuffer } from './fakeAudioContext.test-support.mjs';
import { createBus } from '../game/stateCore.ts';
import { CREW_VOICE_NATIONS } from './crewVoice.ts';

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
let gameMode = 'standard';
const audio = createAudio({ context: ctx, getMapId: () => 'urban', getGameMode: () => gameMode, getTerrain: () => terrain, tier: 'desktop' });
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
// The battle warm is bounded for the loader (3.5 s); here await every load it and the first frames started, to its real
// completion (a fixed count of event-loop turns raced the reads on a loaded machine).
await probe.libraryIdle();
assert.equal(probe.library().pending, 0, 'every battle load has landed');

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

// HDR baseline: a rifle round into the dirt ten metres away, before any gun has fired.
let since = probe.sfxLog.length ? probe.sfxLog.at(-1).seq : 0;
bus.emit('shell:expired', { shellId: 90, pos: [6, 0, 8], hitTerrain: true, caliberMm: 7.62 });
const quietAlone = probe.sfxLog.filter((e) => e.seq > since).find((e) => e.n === 'bullet_dirt');
assert.ok(quietAlone, 'the rifle round lands');

// Weapons: close report + urban tail near; distant report far; supersonic flyby on a near miss.
// Marks are sequence numbers: the pool's debug log is capped (256), so an array index stops meaning anything
// once a long session fills it.
const mark = () => probe.sfxLog.at(-1)?.seq ?? 0;
const logSince = (seq) => probe.sfxLog.filter((e) => e.seq > seq);
since = mark();
const oscillatorsBefore = ctx.nodes.filter((n) => n.kind === 'oscillator').length;
bus.emit('shell:fired', { shellId: 1, shooterId: 'foe', muzzlePos: [-40, 2, 120], dir: [0.316, 0, -0.949], caliberMm: 120, shellType: 'APFSDS', velocityMps: 1650 });
const oscillatorsAfter = ctx.nodes.filter((n) => n.kind === 'oscillator').length;
let names = logSince(since).map((e) => e.n);
assert.ok(names.includes('gun_120_close'), `near 120 mm report (${names})`);
assert.ok(names.includes('tail_urban'), 'the shot rings into the urban tail');
assert.ok(names.includes('shell_flyby_sabot'), 'the sabot cracks past the listener');
const close = logSince(since).find((e) => e.n === 'gun_120_close');
assert.ok(close.t > ctx.currentTime + 0.3, 'the report arrives at the speed of sound (126 m ≈ 0.37 s)');
// The punch: the recorded air slam under the report, arriving with it, under it; no sub sweep.
const muzzle = logSince(since).find((e) => e.n === 'blast_punch_heavy');
assert.ok(muzzle && Math.abs(muzzle.t - close.t) < 0.005, `the punch arrives with the report (${muzzle?.t} vs ${close.t})`);
assert.ok(muzzle.g < close.g && muzzle.g > close.g * 0.3, `and sits just under it (${muzzle.g} vs ${close.g})`);
assert.equal(oscillatorsAfter, oscillatorsBefore, 'no synthesized sub sweep under the cannon');
const quietSince = probe.sfxLog.at(-1).seq;
ctx.advance(0.05);
bus.emit('shell:expired', { shellId: 91, pos: [6, 0, 8], hitTerrain: true, caliberMm: 7.62 });
const quietAfter = probe.sfxLog.filter((e) => e.seq > quietSince).find((e) => e.n === 'bullet_dirt');
assert.ok(quietAfter && quietAfter.g < quietAlone.g * 0.5, `small sounds give way to the cannon (${quietAlone.g} → ${quietAfter?.g})`);
since = mark();
bus.emit('shell:fired', { shellId: 2, shooterId: 'far', muzzlePos: [0, 2, 700], dir: [1, 0, 0], caliberMm: 30, shellType: 'APFSDS', weaponSound: '2a42' });
names = logSince(since).map((e) => e.n);
assert.ok(names.includes('ac_far_light'), `700 m autocannon is a distant report (${names})`);
assert.ok(!names.includes('ac_30_close'), 'no close report at 700 m');

// A volley that overflows the voice budget steals one-shots, never the ambience bed.
// Every bore at 60 m, so distinct report assets (not per-asset instance caps) fill the pool.
let volleyId = 100;
for (const caliberMm of [7.62, 12.7, 20, 25, 30, 40, 57, 90, 105, 120, 125, 130, 152]) {
  for (let k = 0; k < 4; k++) {
    bus.emit('shell:fired', { shellId: volleyId++, shooterId: 'foe', muzzlePos: [-30 + k * 20, 2, 60], dir: [0, 0, 1], caliberMm, shellType: 'HE' });
  }
}
assert.ok(probe.sfxLog.length >= 48, 'the volley fills the voice budget');
const loops = probe.ambientState().loops;
assert.ok(loops.length > 0 && loops.every((l) => l.playing), `the bed survives the volley (${JSON.stringify(loops)})`);
ctx.advance(4);
audio.update(1 / 60, listener, tanks);

// Our own gun, then the reload choreography of a carousel autoloader.
since = mark();
bus.emit('shell:fired', { shellId: 3, shooterId: 'me', isPlayer: true, muzzlePos: [0, 2, 3], dir: [0, 0, 1], caliberMm: 125, shellType: 'APFSDS' });
names = logSince(since).map((e) => e.n);
assert.equal(logSince(since).find((e) => e.n === 'gun_own_large')?.b, 'ownCombat', `our own gun has its own report, on the gunfire channel (${names})`);
assert.ok(!names.includes('gun_125_close'), 'our report replaces the close bank everyone else hears');
assert.ok(names.includes('gun_recoil_mech'), 'the breech recoils and runs back into battery');
assert.equal(probe.busGains().concussion, 0, 'our own gun never concusses its crew');
since = mark();
for (const progress of [0, 0.1, 0.5, 0.7, 0.8, 0.95]) bus.emit('player:reload', { total: 7, kind: 'shell', caliberMm: 125, t: 7 * (1 - progress), progress });
bus.emit('player:reload', { total: 7, kind: 'shell', caliberMm: 125, t: 0, progress: 1, done: true });
names = logSince(since).map((e) => e.n);
for (const id of ['case_eject_stub', 'autoloader_carousel', 'autoloader_lift', 'autoloader_chain_ram', 'breech_close', 'latch_ready']) {
  assert.ok(names.includes(id), `carousel reload plays ${id} (${names})`);
}
since = mark();
for (const progress of [0, 0.1, 0.2, 0.35, 0.5, 0.65, 0.8, 0.95]) { ctx.advance(0.6); bus.emit('player:reload', { total: 6, kind: 'magazine', caliberMm: 120, t: 6 * (1 - progress), progress }); }
bus.emit('player:reload', { total: 6, kind: 'magazine', caliberMm: 120, t: 0, progress: 1, done: true });
names = logSince(since).map((e) => e.n);
assert.equal(names.filter((n) => n === 'drum_load_round').length, 4, `a drum refill feeds its rounds in one by one (${names})`);
assert.ok(names.includes('drum_rotate') && names.at(-1) === 'latch_ready', 'the drum indexes and the gun locks ready');

// Being hit: exterior impact + interior response + a crew call in Russian.
await probe.libraryIdle();
assert.ok(probe.voicesLoaded, 'the Russian pack decoded');
since = mark();
ctx.advance(3);
bus.emit('shell:hit', { shellId: 4, pos: [0, 1.5, 2], kind: 'pen', targetId: 'me', attackerId: 'foe', damage: 300, caliberMm: 120, targetMaxHp: 1000, targetHpAfter: 700 });
names = logSince(since).map((e) => e.n);
assert.ok(names.includes('pen_heavy') && names.includes('pen_interior'), `penetration on our hull (${names})`);
const interiorHitGain = logSince(since).find((e) => e.n === 'pen_interior').g;
ctx.advance(0.25);
audio.update(1 / 60, listener, tanks);
assert.equal(probe.voiceLog.at(-1)?.id, 'were_hit');
assert.equal(probe.voiceLog.at(-1)?.lang, 'ru');
assert.ok(names.includes('hull_thud_sub'), `the hit thuds through our hull, a recording and not a sine (${names})`);

// Edge cases: dry fire on an empty rack, ammo switch call, smoke, friendly ram.
since = mark();
ctx.advance(10);
bus.emit('ammo:empty', { id: 'me', slot: 0 });
bus.emit('ui:shellSelectionChanged', { slot: 1 });
names = logSince(since).map((e) => e.n);
assert.ok(names.includes('dry_fire'), 'firing on empty clicks');
assert.ok(names.includes('autoloader_carousel'), 'an autoloader turns to the new round');
since = mark();
bus.emit('auxiliary:smokeScreens', { screens: [{ born: 12, x: 4, y: 2, z: 12, source: ['t72b3m', 0, 0, 0] }] });
names = logSince(since).map((e) => e.n);
assert.ok(names.includes('smoke_launcher') && names.includes('smoke_burst'), `smoke volley (${names})`);
since = mark();
bus.emit('tank:ram', { aId: 'me', bId: 'ally', pos: [10, 1, 20], closingMps: 7, dmgA: 50, dmgB: 50 });
assert.ok(logSince(since).some((e) => e.n === 'ram_heavy'));

// Hull clunks: one per real stop, never one per frame a lay flickers or a servo hunts.
since = mark();
for (let i = 0; i < 180; i++) {
  me.state.atGunLimit = i % 2 === 0;
  me.state.turretYawRate = i % 2 === 0 ? 0.15 : 0.01;
  ctx.advance(1 / 60);
  audio.update(1 / 60, listener, tanks);
}
names = logSince(since).map((e) => e.n);
assert.ok(names.filter((n) => n === 'gun_limit').length <= 2, `a flickering gun stop clunks at most twice in 3 s (${names.filter((n) => n === 'gun_limit').length})`);
assert.equal(names.filter((n) => n === 'turret_stop').length, 0, 'a hunting servo never clunks');
assert.equal(names.filter((n) => n === 'turret_start').length, 0, 'nor starts the drive');
since = mark();
for (let i = 0; i < 30; i++) { me.state.turretYawRate = 0.4; ctx.advance(1 / 60); audio.update(1 / 60, listener, tanks); }
me.state.turretYawRate = 0;
ctx.advance(1 / 60);
audio.update(1 / 60, listener, tanks);
assert.equal(logSince(since).filter((e) => e.n === 'turret_stop').length, 1, 'a half-second slew ends in one stop clunk');
assert.equal(logSince(since).filter((e) => e.n === 'turret_start').length, 1, 'and began with one drive start');
me.state.atGunLimit = false;

// Destruction: an ammo-rack kill by us → blast, turret, cook-off, kill confirm.
since = mark();
ctx.advance(10);
bus.emit('tank:destroyed', { id: 'foe', killerId: 'me', pos: [-40, 0, 120], cause: 'ammorack' });
names = logSince(since).map((e) => e.n);
for (const id of ['tank_explode_ammo', 'debris_metal', 'turret_land', 'cookoff_loop', 'blast_sub']) assert.ok(names.includes(id), `${id} on an ammo-rack kill (${names})`);
assert.ok(!logSince(since).some((e) => e.b === 'ui'), 'the target going up confirms the kill, not an interface sound');
// The crew calls it once they have seen it go up, about half a second later.
for (let i = 0; i < 4; i++) { ctx.advance(0.25); audio.update(1 / 60, listener, tanks.filter((t) => t.id !== 'foe')); }
assert.ok(['target_destroyed', 'double_kill'].includes(probe.voiceLog.at(-1)?.id), `kill confirm (${probe.voiceLog.at(-1)?.id})`);
assert.ok(!probe.engineState().some((e) => e.id === 'foe'), 'the dead tank stops idling');

// Concussion: a close HE burst muffles the mix and rings the ears; the settings toggle turns it off.
const settle = (seconds) => { for (let t = 0; t < seconds; t += 0.25) { ctx.advance(0.25); audio.update(0.25, listener, tanks); } };
settle(8);
since = mark();
bus.emit('shell:hit', { shellId: 5, pos: [3, 0, 3], kind: 'he_splash', targetId: 'ally', attackerId: 'foe', damage: 0, caliberMm: 152, targetHpAfter: 1000 });
assert.ok(probe.busGains().concussion > 0.3, `a 152 mm burst 5 m away concusses the crew (${probe.busGains().concussion})`);
assert.ok(logSince(since).some((e) => e.n === 'tinnitus'), 'and rings the ears');
settle(8);
assert.equal(probe.busGains().concussion, 0, 'the crew recovers');
bus.emit('ui:volumes', { concussion: false });
bus.emit('shell:hit', { shellId: 6, pos: [3, 0, 3], kind: 'he_splash', targetId: 'ally', attackerId: 'foe', damage: 0, caliberMm: 152, targetHpAfter: 1000 });
assert.equal(probe.busGains().concussion, 0, 'the concussion setting turns it off');
bus.emit('ui:volumes', { concussion: true });

// Our hits are confirmed by the world, not an interface marker: the impact at the target from
// its bearing and distance (the distant bank beyond a few hundred metres, carried further than
// anyone else's hit), then the gunner's call once the crew has seen it land.
settle(4);
since = mark();
bus.emit('shell:hit', { shellId: 7, pos: [0, 1.5, 700], kind: 'pen', targetId: 'far', attackerId: 'me', damage: 300, caliberMm: 125, targetMaxHp: 1000, targetHpAfter: 700 });
const hit = logSince(since);
const ourFar = hit.find((e) => e.n === 'impact_far_pen');
assert.ok(ourFar, `a 700 m penetration is the distant crack (${hit.map((e) => e.n)})`);
assert.ok(!hit.some((e) => e.n === 'pen_heavy'), 'no close-up tearing metal from 700 m');
assert.ok(ourFar.t > ctx.currentTime + 1.8, 'heard when its sound arrives (700 m is about 2 s)');
assert.ok(!hit.some((e) => e.b === 'ui'), 'no interface hit marker');
since = mark();
bus.emit('shell:hit', { shellId: 8, pos: [0, 1.5, 700], kind: 'pen', targetId: 'far', attackerId: 'ally', damage: 300, caliberMm: 125, targetMaxHp: 1000, targetHpAfter: 400 });
const theirFar = logSince(since).find((e) => e.n === 'impact_far_pen');
assert.ok(theirFar && theirFar.g < ourFar.g * 0.5, `our own hit carries further than an ally's (${ourFar.g} vs ${theirFar?.g})`);
for (let i = 0; i < 4; i++) { ctx.advance(0.25); audio.update(0.25, listener, tanks); }
assert.equal(probe.voiceLog.at(-1)?.id, 'penetration', 'the gunner calls the penetration');

// A main-gun miss is called too: "short" when the round came down before the enemy it was laid
// on (the line's second take), a plain "miss" when it went over.
const miss = (shellId, landedZ) => {
  settle(9);
  bus.emit('shell:fired', { shellId, shooterId: 'me', muzzlePos: [0, 2, 3], dir: [0, 0, 1], caliberMm: 125, shellType: 'APFSDS' });
  ctx.advance(0.3);
  bus.emit('shell:expired', { shellId, shooterId: 'me', pos: [0, 0, landedZ], hitTerrain: true, caliberMm: 125 });
  for (let i = 0; i < 4; i++) { ctx.advance(0.25); audio.update(0.25, listener, tanks); }
  return [probe.voiceLog.at(-1)?.id, probe.voiceLog.at(-1)?.take];
};
assert.deepEqual(miss(9, 400), ['miss', 1], 'a round short of the target is called short');
assert.deepEqual(miss(10, 900), ['miss', 0], 'a round over the target is a plain miss');

// Kill-cam replay: a crisp blast, then debris stretched to the 0.55x replay, all on the cinematic bus.
since = mark();
ctx.advance(6);
bus.emit('killcam:begin', { kind: 'projectile' });
bus.emit('killcam:impact', { cause: 'ammorack', pos: [-40, 0, 120], timeScale: 0.55 });
const replay = logSince(since);
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
assert.ok(logSince(since).some((e) => e.n === 'scope_in'));
listener.scoped = false;

// AC-130: the gunship circling overhead is four turboprops, never a tank on the ground.
const gunship = tank('gunship', { x: 0, z: 200, team: 'enemy', specId: 'm1a2', nation: 'USA' });
gunship.state.pos.y = 240;
gunship.aerial = { kind: 'gunship', active: true, x: 0, y: 240, z: 200 };
const withGunship = [...tanks, gunship];
for (let i = 0; i < 6; i++) { ctx.advance(1 / 60); audio.update(1 / 60, listener, withGunship); }
// The aircraft set decodes on first sight of one (in a Drone or AC-130 battle, at its start). Await the loads it started
// to their real completion: on a loaded machine the reads outlast any fixed number of event-loop turns.
await probe.libraryIdle();
assert.equal(probe.library().pending, 0, 'the aircraft set has landed');
let air = probe.aerialState();
assert.equal(air.gunships.length, 1, 'the gunship drones overhead');
assert.ok(air.gunships[0].gain > 0.05, `and carries to the ground (${air.gunships[0].gain})`);
assert.ok(!probe.engineState().some((e) => e.id === 'gunship'), 'no tank engine or tracks in the sky');
for (let i = 0; i < 3; i++) { ctx.advance(1 / 60); audio.update(1 / 60, listener, tanks); }
assert.equal(probe.aerialState().gunships.length, 0, 'and fades when it is gone');

// Drone: an enemy quadcopter is heard where it flies; ours spins up as it lifts off, and while it
// flies we listen through it (no world loop for it, our tank heard from outside) until the link cuts.
const drone = { id: 500, shooterId: 'foe', dead: false, spec: { tracer: 'DRONE', type: 'HE' }, pos: { x: 20, y: 25, z: 60 }, vel: { x: 0, y: 0, z: -40 } };
for (let i = 0; i < 3; i++) { ctx.advance(1 / 60); audio.update(1 / 60, listener, tanks, [drone]); }
air = probe.aerialState();
assert.equal(air.drones.length, 1, 'an enemy drone buzzes');
assert.ok(air.drones[0].gain > 0.05 && air.drones[0].rate > 1, `close and closing in (${JSON.stringify(air.drones[0])})`);
for (let i = 0; i < 30; i++) { ctx.advance(1 / 60); audio.update(1 / 60, listener, tanks, [drone]); }
assert.ok(probe.voiceLog.some((e) => e.id === 'drone_incoming'), `the commander calls the drone, not a missile (${probe.voiceLog.slice(-4).map((e) => e.id)})`);
drone.dead = true;
ctx.advance(1 / 60);
audio.update(1 / 60, listener, tanks, [drone]);
assert.equal(probe.aerialState().drones.length, 0, 'its buzz ends with it');
since = mark();
me.aerial = { kind: 'drone', active: true, x: 0, y: 14, z: 6, batteryS: 40 };
const ours = { id: 501, shooterId: 'me', dead: false, spec: { tracer: 'DRONE', type: 'HE' }, pos: { x: 0, y: 14, z: 6 }, vel: { x: 0, y: 5, z: 30 } };
// The pose runtime moves the listener into the drone while it flies.
Object.assign(listener, { kind: 'player-drone', pos: { x: 0, y: 14, z: 6 } });
for (let i = 0; i < 3; i++) { ctx.advance(1 / 60); audio.update(1 / 60, listener, tanks, [ours]); }
air = probe.aerialState();
assert.ok(logSince(since).some((e) => e.n === 'drone_spinup'), 'our drone spins up as it lifts off');
assert.equal(air.own?.kind, 'drone', 'and we fly with its motors');
assert.equal(air.drones.length, 0, 'not as a drone in the world');
assert.equal(probe.engineState().find((e) => e.id === 'me')?.own, false, 'our tank is heard from the drone, not from inside it');
const spinning = air.own.gain;
for (let i = 0; i < 160; i++) { ctx.advance(1 / 60); audio.update(1 / 60, listener, tanks, [ours]); }
const flown = probe.aerialState().own.gain;
assert.ok(flown > 3 * spinning && flown > 0.6, `the motors spool up to lead the mix (${spinning} → ${flown})`);
// From the drone the hull's machinery is not heard; a hit on it is felt, muffled.
since = mark();
for (const progress of [0, 0.1, 0.5, 0.7, 0.8, 0.95]) { ctx.advance(0.4); bus.emit('player:reload', { total: 7, kind: 'shell', caliberMm: 125, t: 7 * (1 - progress), progress }); }
audio.update(1 / 60, listener, tanks, [ours]);
assert.ok(!logSince(since).some((e) => e.b === 'interior'), `no loading machinery in the feed (${logSince(since).map((e) => e.n)})`);
bus.emit('shell:hit', { shellId: 7, pos: [0, 1.5, 2], kind: 'pen', targetId: 'me', attackerId: 'foe', damage: 100, caliberMm: 120, targetMaxHp: 1000, targetHpAfter: 600 });
const felt = logSince(since).find((e) => e.n === 'pen_interior');
assert.ok(felt && felt.g < interiorHitGain * 0.4, `the hit on our hull is felt under the feed (${felt?.g} vs ${interiorHitGain})`);
since = mark();
me.aerial = { kind: 'drone', active: false, x: 0, y: 2, z: 0, batteryS: 0 };
Object.assign(listener, { kind: 'player-tank', pos: { x: 0, y: 2, z: 0 } });
ctx.advance(1 / 60);
audio.update(1 / 60, listener, tanks, []);
assert.ok(logSince(since).some((e) => e.n === 'drone_link_lost'), 'the feed dies in a burst of static');
assert.equal(probe.aerialState().own, null);
assert.equal(probe.engineState().find((e) => e.id === 'me')?.own, true, 'and we are back inside the tank');
since = mark();
for (const progress of [0, 0.1, 0.5, 0.7, 0.8, 0.95]) { ctx.advance(0.4); bus.emit('player:reload', { total: 7, kind: 'shell', caliberMm: 125, t: 7 * (1 - progress), progress }); }
assert.ok(logSince(since).some((e) => e.b === 'interior'), 'where the loading machinery is heard again');
delete me.aerial;

// AC-130: the crew hears its guns inside the cabin (the howitzer throwing its case onto the deck, never a
// tank's recoil machinery), loads the howitzer by hand and arms a gun on the selector; the ground hears the
// gunship's howitzer from the sky.
settle(4);
me.aerial = { kind: 'gunship', active: true, x: 0, y: 240, z: 0 };
ctx.advance(0.2);
audio.update(1 / 60, listener, tanks);
// The aircraft set (the gunship's reports among it) decodes on first sight of one.
await probe.libraryIdle();
for (const [weaponSound, caliberMm, report] of [['gunship-autocannon', 30, 'gunship_30mm_own'], ['gunship-howitzer', 152, 'gunship_howitzer_own'], ['gunship-missile', 180, 'gunship_missile_own']]) {
  since = mark();
  bus.emit('shell:fired', { shellId: volleyId++, shooterId: 'me', isPlayer: true, muzzlePos: [0, 238, 2], dir: [0, -0.7, 0.7], caliberMm, shellType: 'HE', weaponSound });
  names = logSince(since).map((e) => e.n);
  assert.ok(names.includes(report), `the gunship's ${caliberMm} mm plays its cabin report (${names})`);
  if (caliberMm === 152) {
    assert.ok(names.includes('gunship_casing_drop') && !names.includes('gun_recoil_mech'), `and throws its case onto the deck (${names})`);
    assert.ok(names.includes('blast_punch_heavy'), 'with its punch');
  }
  ctx.advance(0.6);
}
since = mark();
for (const progress of [0, 0.1, 0.5, 0.7, 0.8, 0.95]) { ctx.advance(0.4); bus.emit('player:reload', { total: 3.5, kind: 'shell', caliberMm: 152, t: 3.5 * (1 - progress), progress }); }
names = logSince(since).map((e) => e.n);
for (const id of ['breech_open', 'gunship_round_load', 'breech_close']) assert.ok(names.includes(id), `the howitzer is loaded by hand: ${id} (${names})`);
bus.emit('player:reload', { total: 3.5, kind: 'shell', caliberMm: 152, t: 0, progress: 1, done: true });
since = mark();
bus.emit('ui:shellSelectionChanged', { slot: 1 });
assert.ok(logSince(since).some((e) => e.n === 'gunship_weapon_select'), 'the selector arms the next gun');
delete me.aerial;
ctx.advance(0.6);
since = mark();
bus.emit('shell:fired', { shellId: volleyId++, shooterId: 'foe', muzzlePos: [40, 240, 120], dir: [0, -0.8, -0.6], caliberMm: 152, shellType: 'HE', weaponSound: 'gunship-howitzer' });
names = logSince(since).map((e) => e.n);
assert.ok(names.includes('gunship_howitzer_far') && !names.includes('gun_152_close'), `a gunship's howitzer is heard from the sky (${names})`);

// Modes: each opens on its own sound and marks its own events.
settle(2);
gameMode = 'endless_horde';
since = mark();
bus.emit('battle:rollout', {});
names = logSince(since).map((e) => e.n);
assert.ok(names.includes('mode_horde_siren') && !names.includes('sting_battle'), `the Horde opens on the air-raid siren (${names})`);
ctx.advance(1);
since = mark();
bus.emit('mode:wave_cleared', { wave: 1 });
assert.ok(logSince(since).some((e) => e.n === 'mode_horde_all_clear'), 'and sounds the all-clear');
ctx.advance(1);
since = mark();
bus.emit('mode:pickup_spawned', { id: 'loot-1', kind: 'repair', x: 30, y: 3, z: 40 });
const drop = logSince(since).find((e) => e.n === 'cache_drop');
assert.ok(drop && Math.abs(drop.d - 50) < 3, `a cache lands where it is (${drop?.d} m)`);
gameMode = 'frontline_assault';
ctx.advance(1);
since = mark();
bus.emit('mode:line_advanced', { line: 1, total: 3 });
assert.ok(logSince(since).some((e) => e.n === 'mode_frontline_barrage'), 'the Frontline moves up behind a barrage');
// Juggernaut: the boss (eight times anyone's hull) is found once per battle, and its gun carries further.
gameMode = 'juggernaut';
const boss = tank('boss', { x: -30, z: 60, team: 'enemy', specId: 'm1a2', nation: 'USA' });
boss.combat.maxHp = 8000;
boss.combat.hp = 8000;
ctx.advance(1 / 60);
audio.update(1 / 60, listener, [...tanks, boss]);
assert.ok(probe.soundLog.some((e) => e.type === 'mode:juggernaut-boss' && e.id === 'boss'), 'the juggernaut is found by its hull');
ctx.advance(1);
since = mark();
bus.emit('shell:fired', { shellId: volleyId++, shooterId: 'foe', muzzlePos: [-30, 2, 60], dir: [0, 0, -1], caliberMm: 120, shellType: 'APFSDS' });
const hunterShot = logSince(since).find((e) => e.n === 'gun_120_close');
ctx.advance(1);
since = mark();
bus.emit('shell:fired', { shellId: volleyId++, shooterId: 'boss', muzzlePos: [-30, 2, 60], dir: [0, 0, -1], caliberMm: 120, shellType: 'APFSDS' });
const bossShot = logSince(since).find((e) => e.n === 'gun_120_close');
assert.ok(hunterShot && bossShot && bossShot.g > hunterShot.g * 1.2, `the juggernaut's gun carries further (${hunterShot?.g} → ${bossShot?.g})`);
gameMode = 'standard';
// The battle has rolled out. Throttle held while our drone flies steers the drone, so the still tank is not
// "stuck"; the same throttle on a tank that cannot move is.
const voicesBefore = probe.voiceLog.length;
me.aerial = { kind: 'drone', active: true, x: 0, y: 30, z: 40, batteryS: 30 };
me.input.throttle = 1;
for (let i = 0; i < 200; i++) { ctx.advance(1 / 60); audio.update(1 / 60, listener, tanks, []); }
assert.ok(!probe.voiceLog.slice(voicesBefore).some((e) => e.id === 'stuck'), 'flying the drone, the still tank is not stuck');
delete me.aerial;
ctx.advance(1);
audio.update(1 / 60, listener, tanks, []);
const voicesGrounded = probe.voiceLog.length;
for (let i = 0; i < 260; i++) { ctx.advance(1 / 60); audio.update(1 / 60, listener, tanks, []); }
assert.ok(probe.voiceLog.slice(voicesGrounded).some((e) => e.id === 'stuck'), 'a tank at full throttle that cannot move is');
me.input.throttle = 0;

// Gun Game: the crew changes over to the next weapon and calls the load; Infected: a grave sting.
settle(4);
since = mark();
bus.emit('mode:weapon_advanced', { id: 'me', stage: 3, name: '152 mm Howitzer' });
names = logSince(since).map((e) => e.n);
for (const id of ['breech_open', 'shell_ram', 'breech_close', 'latch_ready']) assert.ok(names.includes(id), `weapon changeover plays ${id} (${names})`);
for (let i = 0; i < 4; i++) { ctx.advance(0.25); audio.update(0.25, listener, tanks); }
assert.equal(probe.voiceLog.at(-1)?.id, 'load_he', 'and the loader calls the howitzer round');
since = mark();
bus.emit('mode:infected', { id: 'me', team: 'bravo' });
assert.ok(logSince(since).some((e) => e.n === 'sting_infected'), 'turned to the infected side');

const buddy = tank('buddy', { x: 4, z: 8, specId: 'leo2a6', nation: 'Germany' });
for (let i = 0; i < 6; i++) { ctx.advance(1 / 60); audio.update(1 / 60, listener, [...tanks, buddy]); }
assert.equal(probe.engineState().find((e) => e.id === 'buddy')?.lod, 'near', 'a tank 9 m away is near, never our own hull');
assert.equal(probe.engineState().filter((e) => e.lod === 'own').length, 1, 'exactly one own rig');

// Interface sounds: in battle only menus sound, and a control's own 'ui:click' never doubles one.
since = mark();
probe.interfaceSound('click', false);
assert.ok(!logSince(since).some((e) => e.b === 'ui'), 'battle controls never click');
probe.interfaceSound('back', true);
assert.ok(logSince(since).some((e) => e.n === 'ui_back'), 'a menu in battle does');

// Leaving battle tears every world loop down — here from the pause menu.
bus.emit('ui:pause', { on: true });
audio.update(1 / 60, listener, tanks);
assert.equal(probe.snapshot, 'paused');
bus.emit('phase:change', { phase: 'garage' });
audio.update(1 / 60, listener, tanks);
assert.equal(probe.engineState().length, 0, 'no rig survives the garage edge');
assert.equal(probe.snapshot, 'garage');
assert.equal(probe.ambientState().bed, 'amb_garage');
// The hangar is indoors: its workshop sounds come from a few metres away.
const garageFrom = probe.sfxLog.length ? probe.sfxLog.at(-1).seq : 0;
for (let t = 0; t < 14; t += 0.25) { ctx.advance(0.25); audio.update(0.25, listener, []); }
const workshop = probe.sfxLog.filter((e) => e.seq > garageFrom && /^(garage_clank|spot_garage_|spot_crane_chain|spot_radio_far)/.test(e.n));
assert.ok(workshop.length > 0 && workshop.every((e) => e.d < 16), `garage spots nearby (${workshop.map((e) => `${e.n}@${e.d}m`)})`);
// The garage's controls: a tab, then the same press's own 'ui:click' (deduplicated), then a tank card.
ctx.advance(0.5);
since = mark();
probe.interfaceSound('tab', false);
bus.emit('ui:click', {});
names = logSince(since).map((e) => e.n);
assert.deepEqual(names.filter((n) => /^ui_/.test(n)), ['ui_tab'], `one sound per press (${names})`);
ctx.advance(0.2);
probe.interfaceSound('vehicle', false);
assert.ok(logSince(since).some((e) => e.n === 'ui_tank_select'), 'a tank card lifts its tank into place');
// The next battle does not start under the pause it was left from.
bus.emit('phase:change', { phase: 'battle' });
audio.update(1 / 60, listener, tanks);
assert.equal(probe.snapshot, 'battle', 'a battle left from the pause menu leaves no pause behind');
// Realistic opens on no stinger at all.
gameMode = 'realistic';
since = mark();
bus.emit('battle:rollout', {});
assert.ok(!logSince(since).some((e) => e.b === 'music'), `Realistic opens without a stinger (${logSince(since).map((e) => e.n)})`);
gameMode = 'standard';

// Cabin alarms, the sixth-sense lamp and the loading bed are recordings (2026-10-03): the square-wave klaxon and
// beeps, the HUD's two-tone sting and the oscillator loading rumble are gone.
audio.update(1 / 60, listener, tanks);
since = mark();
bus.emit('tank:fire', { id: 'me', burning: true });
bus.emit('module:state', { id: 'me', module: 'ammoRack', state: 'yellow', source: 'hit' });
bus.emit('player:spotted', { timeS: 0 });
names = logSince(since).map((e) => e.n);
for (const id of ['alarm_fire_loop', 'alarm_ammo', 'ui_alert']) assert.ok(names.includes(id), `${id} (${names})`);
bus.emit('tank:fire', { id: 'me', burning: false });
ctx.advance(13);
since = mark();
bus.emit('player:spotted', { timeS: 13 });
assert.ok(logSince(since).some((e) => e.n === 'ui_alert'), 'the lamp sounds each time it lights');
since = mark();
audio.loadingOn(true);
assert.ok(logSince(since).some((e) => e.n === 'loading_bed_loop'), 'the loading screen has its recorded bed');
audio.loadingOn(false);
assert.equal(ctx.nodes.filter((n) => n.kind === 'oscillator').length, 0, 'a whole session synthesizes nothing');

// The real settings event reaches every radio call, across every shipped pack.
for (const language of Object.keys(CREW_VOICE_NATIONS)) {
  bus.emit('ui:volumes', { crewVoice: language });
  assert.equal(probe.crewLanguage, language);
  await probe.libraryIdle();
  assert.equal(probe.voicesLoaded, true, `${language} decodes`);
  assert.equal(probe.sayVoice('were_hit'), true, `${language} plays through the radio`);
  assert.equal(probe.voiceLog.at(-1).lang, language);
}
bus.emit('ui:volumes', { crewVoice: 'not-a-pack' });
assert.equal(probe.crewLanguage, 'he', 'invalid live payload cannot replace the last valid choice');
me.spec.nation = 'Germany';
audio.update(1 / 60, listener, tanks);
assert.equal(probe.crewLanguage, 'he', 'fixed crew survives a vehicle change on the same entity');
bus.emit('ui:volumes', { crewVoice: 'national' });
assert.equal(probe.crewLanguage, 'de', 'restoring National uses the current hull, not its original nation');
me.spec.nation = 'Ukraine';
audio.update(1 / 60, listener, tanks);
assert.equal(probe.crewLanguage, 'uk', 'National follows a same-entity nation change');
bus.emit('ui:volumes', { crewVoice: 'en-GB' });
bus.emit('phase:change', { phase: 'garage' });
bus.emit('phase:change', { phase: 'battle' });
audio.update(1 / 60, listener, [tank('new-player', { isPlayer: true, nation: 'Japan' })]);
assert.equal(probe.crewLanguage, 'en-GB', 'fixed crew survives another battle and player entity');
bus.emit('ui:volumes', { crewVoice: 'national' });
assert.equal(probe.crewLanguage, 'ja', 'National restores the new player crew');

const lateCtx = createFakeContext({ decode: () => fakeBuffer(1.5) });
const late = createAudio({ context: lateCtx, getMapId: () => 'urban', getTerrain: () => terrain, tier: 'desktop', initialPhase: 'battle' });
late.resume();
assert.ok(globalThis.window.__COT_AUDIO.library().pinned > 100, `adopted mid-battle, the battle set is still warmed and pinned (${globalThis.window.__COT_AUDIO.library().pinned})`);

// Audio can be created before the Settings panel. It must read the persisted
// fixed pack itself, or retain a live choice delivered before first resume.
const priorStorage = globalThis.localStorage;
for (const [stored, expected] of [['en-GB', 'en-GB'], ['english', 'en-US']]) {
  globalThis.localStorage = { getItem: key => key === 'cot.settings.v1' ? JSON.stringify({ crewVoice: stored }) : null };
  const fresh = createAudio({ context: createFakeContext(), tier: 'mobile' });
  fresh.resume();
  assert.equal(window.__COT_AUDIO.crewLanguage, expected, 'cold audio restores saved crew before a tank is indexed');
}
globalThis.localStorage = { getItem: () => null };
const early = createAudio({ context: createFakeContext(), tier: 'mobile' });
const earlyBus = createBus();
early.bindBus(earlyBus);
earlyBus.emit('ui:volumes', { crewVoice: 'fr' });
early.resume();
assert.equal(window.__COT_AUDIO.crewLanguage, 'fr', 'pre-resume events retain the chosen pack');
if (priorStorage === undefined) delete globalThis.localStorage;
else globalThis.localStorage = priorStorage;

console.log(`audioEngine.selftest: rigs by powertrain, national crew, scenes, weapon layering + delay + flyby, reload choreography, hits, edge cases, destruction, concussion, our hits and misses, kill-cam, panning, scope, aircraft, mode events, interface sounds, rig ownership, late adoption and teardown passed (${probe.sfxLog.length} voices logged)`);
