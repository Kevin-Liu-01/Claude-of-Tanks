// Every crew line has a game moment that asks for it, and the moments a player cares about are heard (owner
// 2026-10-04: voice lines for smoke, drones and the rest of the tank's systems, every line playing when it should,
// on top of penetrations). The matrix drives the real engine through bus events and frames and reads the engine's
// request log (sayLog: what was asked, and whether the net took it) and the radio's played log (voiceLog).
// Also guarded: no sound or voice stands in for another (no fallbacks).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readFileSync, readdirSync } from 'node:fs';
import { createFakeContext, fakeBuffer } from './fakeAudioContext.test-support.mjs';
import { createBus } from '../game/stateCore.ts';
import { VOICE_LINES } from './voiceLines.ts';

// Shipped files from disk, "decoded" at their real lengths where timing matters: a crew take is about a second and a
// half, the net's key-up and release clicks a tenth of a second (a 1.5 s click would hold every call a second late).
const publicRoot = new URL('../../public/', import.meta.url);
// (by byte length: the library decodes a copy of what it fetched)
const keyClickBytes = new Set();
globalThis.fetch = async (url) => {
  try {
    const path = String(url).replace(/^\//, '');
    const bytes = await readFile(new URL(path, publicRoot));
    const data = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    if (/radio_key_(in|out)/.test(path)) keyClickBytes.add(data.byteLength);
    return { ok: true, status: 200, arrayBuffer: async () => data };
  } catch {
    return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) };
  }
};
globalThis.window = {};

const { createAudio } = await import('./audioEngine.ts');
const ctx = createFakeContext({ decode: (data) => fakeBuffer(keyClickBytes.has(data.byteLength) ? 0.12 : 1.5) });
const terrain = { getHeightAt: () => 0, getGroundType: () => 'medium', getTrackSurfaceAt: () => 0, getWaterDepthAt: (x) => (x < -300 ? 2 : 0) };
let gameMode = 'standard';
const audio = createAudio({ context: ctx, getMapId: () => 'verdant', getGameMode: () => gameMode, getTerrain: () => terrain, tier: 'desktop' });
const bus = createBus();
audio.bindBus(bus);
audio.resume();
const probe = globalThis.window.__COT_AUDIO;

const SHELLS = [{ type: 'APFSDS', caliberMm: 125 }, { type: 'HEAT', caliberMm: 125 }, { type: 'HE', caliberMm: 125 }, { type: 'HEAT', caliberMm: 125, guided: true }];
const GUNSHIP = [
  { type: 'AP', caliberMm: 30, soundProfile: 'gunship-autocannon' },
  { type: 'HE', caliberMm: 152, soundProfile: 'gunship-howitzer' },
  { type: 'HE', caliberMm: 180, guided: true, soundProfile: 'gunship-missile' },
];
function tank(id, { x = 0, z = 0, team = 'player', isPlayer = false, specId = 't72b3m', nation = 'Russia' } = {}) {
  return {
    id, team, isPlayer, specId,
    spec: { id: specId, nation, role: 'mbt', weightTons: 46.5, enginePowerHp: 1130, topSpeedKmh: 70, reverseSpeedKmh: 15, gun: { caliberMm: 125, shells: SHELLS } },
    state: { pos: { x, y: 0, z }, speed: 0, yaw: 0, yawRate: 0, verticalSpeed: 0, grounded: true, turretYawRate: 0, gunPitch: 0 },
    input: { throttle: 0 },
    combat: { destroyed: false, hp: 1000, maxHp: 1000, modules: {}, ammo: [20, 10, 10, 4], ammoCapacity: [20, 10, 10, 4], shellSlot: 0, auxiliary: { gunOn: false, lights: -1 } },
  };
}
const listener = { pos: { x: 0, y: 2, z: 0 }, forward: { x: 0, y: 0, z: 1 }, kind: 'player-tank', ownerId: 'me', scoped: false };
let me, allies, foes, tanks, shells = [];
function roster() {
  me = tank('me', { isPlayer: true });
  allies = [tank('a1', { x: 20, z: 40 }), tank('a2', { x: -20, z: 40 })];
  foes = [tank('f1', { x: 0, z: 200, team: 'enemy' }), tank('f2', { x: 120, z: 120, team: 'enemy' }), tank('f3', { x: -120, z: 120, team: 'enemy' }),
    tank('f4', { x: 0, z: -150, team: 'enemy' }), tank('f5', { x: 60, z: 260, team: 'enemy' })];
  tanks = [me, ...allies, ...foes];
}
const frame = (dt = 0.25) => { ctx.advance(dt); audio.update(dt, listener, tanks, shells); };
const settle = (seconds = 6) => { for (let t = 0; t < seconds; t += 0.25) frame(0.25); };
const flush = async () => { for (let i = 0; i < 6; i++) await new Promise((resolve) => setTimeout(resolve, 0)); };

async function startBattle(mode = 'standard') {
  gameMode = mode;
  roster();
  bus.emit('phase:change', { phase: 'garage' });
  bus.emit('phase:change', { phase: 'battle' });
  await audio.warmBattleEvents(['t72b3m']);
  for (let i = 0; i < 8; i++) frame(1 / 60);
  await flush();
  for (let i = 0; i < 2000 && (probe.library().pending > 0 || !probe.voicesLoaded); i++) await new Promise((resolve) => setTimeout(resolve, 5));
  assert.ok(probe.voicesLoaded, 'the crew pack decoded');
  bus.emit('battle:rollout', {});
  settle(6);
}

const covered = new Set();
const asked = (id, since) => probe.sayLog.some((e) => e.t >= since && e.id === id);
const spoken = (id, since) => probe.voiceLog.some((e) => e.t >= since && e.id === id);
/**
 * One game moment: settle the net, run it, let the radio work, and check the line was asked for — and, for the
 * moments a player acts on (`heard`), that the crew actually said it.
 */
function moment(id, run, { heard = true, wait = 4, quiet = 6 } = {}) {
  settle(quiet);
  const since = +ctx.currentTime.toFixed(3);
  run();
  settle(wait);
  assert.ok(asked(id, since) || spoken(id, since), `${id}: no game moment asked for it (${probe.sayLog.filter((e) => e.t >= since).map((e) => e.id)})`);
  if (heard) assert.ok(spoken(id, since), `${id}: asked for but never heard (${JSON.stringify(probe.sayLog.filter((e) => e.t >= since))}; heard ${probe.voiceLog.filter((e) => e.t >= since).map((e) => e.id)})`);
  covered.add(id);
}
const hitOn = (targetId, attackerId, extra = {}) => bus.emit('shell:hit', {
  shellId: Math.floor(Math.random() * 1e6), pos: [0, 1.5, 200], kind: 'pen', targetId, attackerId, damage: 120, caliberMm: 125,
  targetMaxHp: 1000, targetHpAfter: 800, modulesHit: [], crewHit: [], ...extra,
});
const ourHit = (extra) => hitOn('f1', 'me', extra);
const theirHit = (extra) => hitOn('me', 'f1', { pos: [0, 1.5, 2], ...extra });

// ------------------------------------------------------------------ battle one: the standard battle's lines
await startBattle();
assert.ok(asked('battle_start', 0) || spoken('battle_start', 0), 'the rollout calls the battle start');
covered.add('battle_start');
moment('on_the_move', () => { me.state.speed = 6; frame(); me.state.speed = 0; });

// Spotting: our own spots of enemies, by bearing (a share of the calls are the plain "enemy spotted").
{
  const want = new Set(['enemy_spotted', 'spotted_front', 'spotted_left', 'spotted_right', 'spotted_rear']);
  const bearing = { front: 'f1', left: 'f2', right: 'f3', rear: 'f4' };
  const since = +ctx.currentTime.toFixed(3);
  for (let round = 0; round < 40 && [...want].some((id) => !asked(id, since)); round++) {
    for (const foe of Object.values(bearing)) {
      settle(11);
      bus.emit('tank:spotted', { id: foe, team: 'player', spotterId: 'me', timeS: 0 });
    }
  }
  for (const id of want) { assert.ok(asked(id, since), `${id}: a spot by bearing asks for it`); covered.add(id); }
  // An ally's spot or a spot of an ally is not ours to call.
  settle(12);
  const quiet = +ctx.currentTime.toFixed(3);
  bus.emit('tank:spotted', { id: 'f1', team: 'player', spotterId: 'a1', timeS: 0 });
  bus.emit('tank:spotted', { id: 'a1', team: 'enemy', spotterId: 'f1', timeS: 0 });
  assert.ok(!probe.sayLog.some((e) => e.t >= quiet), 'only our own spots of enemies are called');
}
moment('spotted_multiple', () => { for (const id of ['f1', 'f2', 'f3']) bus.emit('tank:spotted', { id, team: 'player', spotterId: 'me', timeS: 0 }); }, { quiet: 12 });
moment('sixth_sense', () => bus.emit('player:spotted', { timeS: 0 }), { wait: 6 });

// Our gunnery: every main-gun result is called.
moment('enemy_fire', () => ourHit({ fireStarted: true }));
moment('enemy_ammo_rack', () => ourHit({ modulesHit: [{ module: 'ammoRack', newState: 'yellow' }] }));
moment('enemy_immobilized', () => ourHit({ modulesHit: [{ module: 'trackL', newState: 'red' }] }));
moment('enemy_gun_damaged', () => ourHit({ modulesHit: [{ module: 'gun', newState: 'yellow' }] }));
moment('enemy_engine_hit', () => ourHit({ modulesHit: [{ module: 'engine', newState: 'yellow' }] }));
moment('enemy_crew_hit', () => ourHit({ crewHit: ['gunner'] }));
moment('enemy_crit', () => ourHit({ modulesHit: [{ module: 'optics', newState: 'yellow' }] }));
moment('penetration', () => ourHit({}));
moment('ricochet', () => ourHit({ kind: 'ricochet', damage: 0 }));
moment('nonpen', () => ourHit({ kind: 'nonpen', damage: 0 }));
moment('friendly_fire', () => hitOn('a1', 'me', {}));
// Back to back: a shot result is not lost behind the loader's chatter or the last result.
{
  settle(14);
  const since = +ctx.currentTime.toFixed(3);
  bus.emit('shell:fired', { shellId: 7001, shooterId: 'me', isPlayer: true, muzzlePos: [0, 2, 3], dir: [0, 0, 1], caliberMm: 125, shellType: 'APFSDS' });
  probe.sayVoice('firing');
  frame(0.3);
  ourHit({ shellId: 7001 });
  settle(4);
  assert.ok(spoken('penetration', since), `a penetration cuts the loader's chatter (${probe.voiceLog.filter((e) => e.t >= since).map((e) => e.id)})`);
  for (let shot = 0; shot < 3; shot++) {
    const at = +ctx.currentTime.toFixed(3);
    ourHit({ kind: shot % 2 ? 'nonpen' : 'pen', damage: shot % 2 ? 0 : 150 });
    settle(3.5);
    assert.ok(spoken(shot % 2 ? 'nonpen' : 'penetration', at), `every shot of a 3.5 s reload is called (shot ${shot + 1}: asked ${JSON.stringify(probe.sayLog.filter((e) => e.t >= at - 4))}, heard ${JSON.stringify(probe.voiceLog.filter((e) => e.t >= at - 4))}, now ${ctx.currentTime.toFixed(2)})`);
  }
}
moment('miss', () => {
  bus.emit('shell:fired', { shellId: 7101, shooterId: 'me', isPlayer: true, muzzlePos: [0, 2, 3], dir: [0, 0, 1], caliberMm: 125, shellType: 'APFSDS' });
  frame(0.3);
  bus.emit('shell:expired', { shellId: 7101, shooterId: 'me', pos: [0, 0, 120], hitTerrain: true, caliberMm: 125 });
}, { quiet: 14 });
moment('firing', () => bus.emit('shell:fired', { shellId: 7201, shooterId: 'me', isPlayer: true, muzzlePos: [0, 2, 3], dir: [0, 0, 1], caliberMm: 125, shellType: 'APFSDS' }), { heard: false, quiet: 14 });
moment('missile_away', () => bus.emit('shell:fired', { shellId: 7301, shooterId: 'me', isPlayer: true, muzzlePos: [0, 2, 3], dir: [0, 0, 1], caliberMm: 125, shellType: 'HEAT', weaponSound: 'atgm_launch' }));

// Loading and ammunition.
moment('reloading', () => bus.emit('ui:magazineReloadStarted', {}), { quiet: 12 });
// A refused feature is refused: the reload key alone, a denied reload, special action or empty rack never sounds like
// it worked, and an empty round says so.
{
  settle(12);
  const since = +ctx.currentTime.toFixed(3);
  const sfxSince = probe.sfxLog.at(-1)?.seq ?? 0;
  bus.emit('ui:magazineReload', {});
  bus.emit('ui:magazineReloadDenied', { reason: 'MAGAZINE_FULL' });
  bus.emit('ui:specialActionDenied', { kind: 'guided_missile', reason: 'NO_MISSILE' });
  settle(3);
  const names = probe.sfxLog.filter((e) => e.seq > sfxSince).map((e) => e.n);
  assert.ok(!names.includes('magazine_swap') && !asked('reloading', since), `a refused reload is not a reload (${names})`);
  assert.ok(names.includes('ui_error'), 'the refusal is heard');
  moment('ammo_empty', () => bus.emit('ui:ammoSelectionDenied', { slot: 2, reason: 'AMMO_EMPTY', guided: false }));
}
moment('reloaded', () => {
  for (const progress of [0, 0.5]) bus.emit('player:reload', { total: 7, kind: 'shell', caliberMm: 125, t: 7 * (1 - progress), progress });
  bus.emit('player:reload', { total: 7, kind: 'shell', caliberMm: 125, t: 0, progress: 1, done: true });
}, { heard: false });
moment('load_kinetic', () => bus.emit('ui:shellSelectionChanged', { slot: 0 }));
moment('load_heat', () => bus.emit('ui:shellSelectionChanged', { slot: 1 }));
moment('load_he', () => bus.emit('ui:shellSelectionChanged', { slot: 2 }));
moment('load_missile', () => bus.emit('ui:shellSelectionChanged', { slot: 3 }));
moment('ammo_empty', () => bus.emit('ammo:empty', { id: 'me', slot: 0 }));
moment('ammo_low', () => { me.combat.ammo = [3, 2, 1, 0]; frame(); });
moment('ammo_out_all', () => { me.combat.ammo = [0, 0, 0, 0]; frame(); bus.emit('ammo:depleted', { id: 'me' }); }, { quiet: 12 });
me.combat.ammo = [20, 10, 10, 4];
moment('target_locked', () => bus.emit('ui:autoAimState', { on: true }), { heard: false });
moment('target_lost', () => bus.emit('ui:autoAimState', { on: false, reason: 'lost' }), { heard: false });

// Our own systems: every switch the sim accepts is heard, and the crew confirms it.
moment('smoke_out', () => bus.emit('auxiliary:smokeScreens', { screens: [{ born: 30, x: 4, y: 2, z: 12, source: ['t72b3m', 0.5, 2, 0.5] }] }));
moment('roof_gun_on', () => { me.combat.auxiliary = { ...me.combat.auxiliary, gunOn: true }; frame(); });
{
  const since = probe.sfxLog.at(-1)?.seq ?? 0;
  me.combat.auxiliary = { ...me.combat.auxiliary, lights: 1 };
  frame();
  me.combat.auxiliary = { ...me.combat.auxiliary, lights: 0, gunOn: false };
  frame();
  const names = probe.sfxLog.filter((e) => e.seq > since).map((e) => e.n);
  assert.ok(names.includes('lights_on') && names.includes('switch_toggle'), `the lights clunk on and click off, the gun station switches off (${names})`);
}
moment('suspension_set', () => bus.emit('ui:specialActionResult', { kind: 'hydropneumatic', active: true }));
moment('repairs', () => bus.emit('ui:consumableUsed', { slot: 0 }));
moment('crew_recovered', () => bus.emit('ui:consumableUsed', { slot: 1 }));
moment('extinguishing', () => bus.emit('ui:consumableUsed', { slot: 2 }));
for (const [module, id] of [['trackL', 'track_repaired'], ['gun', 'gun_repaired'], ['engine', 'engine_repaired']]) {
  bus.emit('module:state', { id: 'me', module, state: 'red', source: 'hit' });
  moment(id, () => bus.emit('module:state', { id: 'me', module, state: 'yellow', repaired: true }));
  bus.emit('module:state', { id: 'me', module, state: 'ok', repaired: true });
}

// Our drone: launched by the commander, lost to its battery or its link; a recall or a hit is not "lost".
{
  const ours = { id: 8801, shooterId: 'me', dead: false, spec: { tracer: 'DRONE', type: 'HE' }, pos: { x: 0, y: 14, z: 6 }, vel: { x: 0, y: 5, z: 30 } };
  moment('drone_launch', () => { me.aerial = { kind: 'drone', active: true, launching: true, x: 0, y: 14, z: 6, batteryS: 40, cooldownS: 0 }; shells = [ours]; frame(); });
  moment('drone_lost', () => {
    me.aerial.batteryS = 0.3;
    frame();
    me.aerial = { kind: 'drone', active: false, batteryS: 0, cooldownS: 25 };
    shells = [];
    frame();
  });
  settle(10);
  const since = +ctx.currentTime.toFixed(3);
  const sfxSince = probe.sfxLog.at(-1)?.seq ?? 0;
  bus.emit('ui:drone', {});
  assert.ok(probe.sfxLog.filter((e) => e.seq > sfxSince).some((e) => e.n === 'ui_error'), 'a press while the drone recharges is refused');
  me.aerial = { kind: 'drone', active: true, x: 0, y: 14, z: 6, batteryS: 40, cooldownS: 0 };
  shells = [{ ...ours, id: 8802 }];
  settle(4);
  me.aerial = { kind: 'drone', active: false, batteryS: 0, cooldownS: 25 };
  shells = [];
  settle(4);
  assert.ok(!asked('drone_lost', since), 'a recalled drone (battery to spare, inside its range) is not called lost');
  assert.ok(!probe.sfxLog.filter((e) => e.seq > sfxSince).some((e) => e.n === 'switch_toggle'), 'no stand-in switch click for the drone');
  delete me.aerial;
}

// Being hit: what broke, in priority order, and the last quarter of the hull.
moment('were_hit', () => theirHit({}));
moment('bounced_us', () => theirHit({ kind: 'ricochet', damage: 0 }));
for (const [module, state, id] of [
  ['ammoRack', 'yellow', 'ammo_rack'], ['fuelTank', 'yellow', 'fuel_tank'], ['engine', 'yellow', 'engine_damaged'], ['engine', 'red', 'engine_destroyed'],
  ['transmission', 'yellow', 'transmission_damaged'], ['trackR', 'red', 'track_gone'], ['gun', 'yellow', 'gun_damaged'], ['turretRing', 'yellow', 'turret_jammed'],
  ['gunMount', 'yellow', 'gun_mount_damaged'], ['autoloader', 'yellow', 'autoloader_damaged'], ['feedSystem', 'yellow', 'feed_damaged'],
  ['roofGun', 'yellow', 'roof_gun_damaged'], ['missileRack', 'yellow', 'missile_rack_damaged'], ['optics', 'yellow', 'optics_damaged'], ['radio', 'yellow', 'radio_damaged'],
]) moment(id, () => theirHit({ modulesHit: [{ module, newState: state }] }), { quiet: 12 });
bus.emit('module:state', { id: 'me', module: 'radio', state: 'ok', repaired: true });
for (const role of ['commander', 'gunner', 'driver', 'loader']) moment(`${role}_down`, () => theirHit({ crewHit: [role] }), { quiet: 13 });
moment('low_hp', () => theirHit({ damage: 400, targetHpAfter: 200 }), { quiet: 12 });
moment('hit_by_friendly', () => hitOn('me', 'a1', { pos: [0, 1.5, 2] }), { quiet: 12 });
moment('rammed', () => bus.emit('tank:ram', { aId: 'f1', bId: 'me', pos: [0, 1, 4], closingMps: 6, dmgA: 40, dmgB: 40 }), { quiet: 10 });
moment('friendly_ram', () => bus.emit('tank:ram', { aId: 'me', bId: 'a1', pos: [0, 1, 4], closingMps: 4, dmgA: 10, dmgB: 10 }), { heard: false, quiet: 14 });
moment('missile_incoming', () => bus.emit('shell:fired', { shellId: 7401, shooterId: 'f1', muzzlePos: [0, 2, 200], dir: [0, 0, -1], caliberMm: 130, shellType: 'HEAT', weaponSound: 'atgm_launch', velocityMps: 300 }));
{
  const since = +ctx.currentTime.toFixed(3);
  for (let i = 0; i < 30 && !asked('near_miss', since); i++) {
    settle(13);
    // From 170 m off, laid 4 m beside us.
    const d = [4 - 120, 0, 0 - 120];
    const n = Math.hypot(...d);
    bus.emit('shell:fired', { shellId: 7500 + i, shooterId: 'f2', muzzlePos: [120, 2, 120], dir: d.map((v) => v / n), caliberMm: 125, shellType: 'APFSDS', velocityMps: 1650 });
    settle(1);
  }
  assert.ok(asked('near_miss', since), 'a round cracking past us asks for the near miss');
  covered.add('near_miss');
}
moment('drone_incoming', () => {
  shells = [{ id: 8901, shooterId: 'f1', dead: false, spec: { tracer: 'DRONE', type: 'HE' }, pos: { x: 20, y: 25, z: 60 }, vel: { x: 0, y: 0, z: -40 } }];
  for (let i = 0; i < 20; i++) frame(1 / 30);
  shells = [];
}, { wait: 3 });
moment('fire', () => bus.emit('tank:fire', { id: 'me', burning: true }));
moment('fire_out', () => bus.emit('tank:fire', { id: 'me', burning: false }));
moment('flipped', () => { me.state.overturned = true; frame(); });
moment('back_on_tracks', () => { me.state.overturned = false; frame(); bus.emit('tank:selfRight', { id: 'me' }); });
moment('taking_water', () => { me.state.pos.x = -400; for (let i = 0; i < 8; i++) frame(); });
me.state.pos.x = 0;
settle(2);
moment('stuck', () => { me.input.throttle = 1; me.state.speed = 0; settle(3.5); me.input.throttle = 0; });

// Modes: objectives and our gunship crew's drops.
moment('objective_captured', () => bus.emit('mode:zone_captured', { zoneId: 'b', team: 'alpha' }));
moment('objective_lost', () => bus.emit('mode:zone_captured', { zoneId: 'b', team: 'bravo' }));
moment('objective_contested', () => bus.emit('mode:zone_contested', { zoneId: 'a', team: 'alpha' }));
moment('flag_taken_ours', () => bus.emit('mode:flag_taken', { team: 'bravo', by: 'me' }));
moment('flag_taken_theirs', () => bus.emit('mode:flag_taken', { team: 'alpha', by: 'f1' }));
moment('flag_captured', () => bus.emit('mode:flag_captured', { team: 'alpha', by: 'me' }));
moment('flag_returned', () => bus.emit('mode:flag_returned', { team: 'alpha', by: 'a1' }));
moment('wave_incoming', () => bus.emit('mode:wave_started', { wave: 2 }));
moment('wave_cleared', () => bus.emit('mode:wave_cleared', { wave: 2 }));
moment('line_advanced', () => bus.emit('mode:line_advanced', { line: 1, total: 3 }));
moment('goal_scored', () => bus.emit('mode:goal_scored', { team: 'alpha' }));
moment('pickup_collected', () => bus.emit('mode:pickup_collected', { by: 'me', kind: 'ammo' }));
moment('supply_ammo', () => bus.emit('mode:pickup_spawned', { airDrop: true, by: 'me', kind: 'ammo', x: 10, y: 240, z: 30 }));
moment('supply_repair', () => bus.emit('mode:pickup_spawned', { airDrop: true, by: 'me', kind: 'heal', x: 10, y: 240, z: 30 }));
{
  settle(10);
  const since = +ctx.currentTime.toFixed(3);
  bus.emit('mode:pickup_spawned', { airDrop: true, by: 'other-gunship', kind: 'ammo', x: 10, y: 240, z: 30 });
  bus.emit('mode:zone_contested', { zoneId: 'a', team: 'bravo' });
  settle(3);
  assert.ok(!asked('supply_ammo', since) && !asked('objective_contested', since), 'another gunship\'s drop and the enemy\'s contested point are not our calls');
}
moment('respawn', () => {
  me.combat.destroyed = true;
  frame();
  me.combat.destroyed = false;
  bus.emit('mode:respawn', { id: 'me', team: 'alpha' });
});

// The team's fortunes: kills, losses and the count.
moment('target_destroyed', () => { foes[0].combat.destroyed = true; bus.emit('tank:destroyed', { id: 'f1', killerId: 'me', pos: [0, 0, 200], cause: 'shot' }); });
moment('double_kill', () => { foes[1].combat.destroyed = true; bus.emit('tank:destroyed', { id: 'f2', killerId: 'me', pos: [120, 0, 120], cause: 'shot' }); }, { quiet: 4 });
moment('ally_kill', () => { foes[4].combat.destroyed = true; bus.emit('tank:destroyed', { id: 'f5', killerId: 'a1', pos: [60, 0, 260], cause: 'shot' }); }, { heard: false });
moment('ally_destroyed', () => { allies[0].combat.destroyed = true; bus.emit('tank:destroyed', { id: 'a1', killerId: 'f3', pos: [20, 0, 40], cause: 'shot' }); });
// Two enemies to our two: then our last ally falls (the last tank, outnumbered two to one), and then one enemy is left.
moment('last_tank', () => { allies[1].combat.destroyed = true; bus.emit('tank:destroyed', { id: 'a2', killerId: 'f3', pos: [-20, 0, 40], cause: 'shot' }); frame(); });
moment('last_enemy', () => { foes[2].combat.destroyed = true; bus.emit('tank:destroyed', { id: 'f3', killerId: 'me', pos: [-120, 0, 120], cause: 'shot' }); frame(); }, { quiet: 8 });

// Outnumbered: a fresh battle, our side down to one tank against four.
await startBattle();
moment('outnumbered', () => { for (const a of allies) a.combat.destroyed = true; frame(); }, { heard: false });

// The AC-130: the gunner names the weapon, not a tank loader's round.
await startBattle('ac130');
me.aerial = { kind: 'gunship', active: true, x: 0, y: 240, z: 90 };
me.spec = { ...me.spec, gun: { caliberMm: 30, shells: GUNSHIP } };
frame();
moment('gunship_cannon', () => bus.emit('ui:shellSelectionChanged', { slot: 0 }));
moment('gunship_howitzer', () => bus.emit('ui:shellSelectionChanged', { slot: 1 }));
moment('gunship_missile', () => bus.emit('ui:shellSelectionChanged', { slot: 2 }));
{
  settle(6);
  const since = +ctx.currentTime.toFixed(3);
  bus.emit('ui:shellSelectionChanged', { slot: 1 });
  settle(3);
  assert.ok(!['load_kinetic', 'load_he', 'load_heat', 'load_missile'].some((id) => asked(id, since)), 'no tank loader\'s line standing in for the gunship crew');
  // Its missile leaves the pylon on its own recording, never the ground ATGM's launch (the owner's "popping sound").
  for (let shot = 0; shot < 4; shot++) {
    settle(8);
    const sfxSince = probe.sfxLog.at(-1)?.seq ?? 0;
    bus.emit('shell:fired', { shellId: 9300 + shot, shooterId: 'me', isPlayer: true, muzzlePos: [0, 238, 90], dir: [0, -0.8, -0.6], caliberMm: 180, shellType: 'HE', weaponSound: 'gunship-missile', velocityMps: 400 });
    const names = probe.sfxLog.filter((e) => e.seq > sfxSince).map((e) => e.n);
    assert.ok(names.includes('gunship_missile_own') && !names.includes('atgm_launch') && !names.some((n) => n.startsWith('blast_punch')), `the gunship's missile launch, shot ${shot + 1} (${names})`);
  }
}

// A round into a prop sounds of what it struck, not a coin toss between wood and concrete.
{
  const struck = (surfaceKind, shellId) => {
    const since = probe.sfxLog.at(-1)?.seq ?? 0;
    bus.emit('shell:expired', { shellId, shooterId: 'f1', pos: [10, 1, 30], hitTerrain: false, hitKind: 'prop', surfaceKind, caliberMm: 125 });
    return probe.sfxLog.filter((e) => e.seq > since).map((e) => e.n).find((n) => n.startsWith('ground_'));
  };
  settle(2);
  assert.deepEqual(['containerRow', 'truckflatbed', 'tree', 'crate', 'warehouse', 'rock', 'sandbag'].map((kind, i) => { settle(0.5); return struck(kind, 9100 + i); }),
    ['ground_metal', 'ground_metal', 'ground_wood', 'ground_wood', 'ground_concrete', 'ground_rock', 'ground_dirt']);
}

// Smoke in the next battle: the sim clock restarts at 0, so screens born earlier than the last battle's are new.
await startBattle();
{
  const since = probe.sfxLog.at(-1)?.seq ?? 0;
  bus.emit('auxiliary:smokeScreens', { screens: [{ born: 2, x: 4, y: 2, z: 12, source: ['t72b3m', 0.5, 2, 0.5] }] });
  const names = probe.sfxLog.filter((e) => e.seq > since).map((e) => e.n);
  assert.ok(names.includes('smoke_launcher'), `a second battle's smoke is heard (${names})`);
}

// The result, said whatever happened to our tank.
for (const result of ['victory', 'defeat', 'draw']) {
  await startBattle();
  const since = +ctx.currentTime.toFixed(3);
  bus.emit('battle:ended', { result });
  bus.emit('battle:presented', { result });
  settle(4);
  assert.ok(spoken(result, since), `${result} is announced`);
  covered.add(result);
}

// Every crew line in the catalog has its moment.
const untested = Object.keys(VOICE_LINES).filter((id) => !covered.has(id));
assert.deepEqual(untested, [], 'every crew line is driven by a game moment in this matrix');

// No fallbacks: no sound or crew take stands in for another in the audio code. A cue plays its own asset or nothing;
// a crew speaks its own pack or nothing.
for (const file of readdirSync(new URL('.', import.meta.url)).filter((f) => f.endsWith('.ts') && !f.includes('generated'))) {
  const source = readFileSync(new URL(file, import.meta.url), 'utf8');
  const lines = source.split('\n');
  lines.forEach((line, index) => {
    assert.ok(!/if \(!(pool\??\.)?play\(|!\([^)]*&& *(pool\??\.)?play\(|(pool\??\.)?play\([^;]*\) *\|\| *(pool\??\.)?play\(/.test(line),
      `${file}:${index + 1} chains one sound in for another: ${line.trim()}`);
  });
  assert.ok(!/fallbackLanguage/.test(source), `${file} keeps a stand-in crew`);
}

console.log(`voiceTriggers.selftest: ${covered.size} crew lines driven by their game moments (shot results, our systems, drone, gunship, supply drops, objectives) and no stand-in sounds passed`);
