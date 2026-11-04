// Receipt (world-sfx-269, 2026-11-03; the owner: "make a lot better sounds for everything ... all the special moodes"):
// the vehicles, the world and the modes sound of what they are. Each table that chooses a sound is exhaustive and every
// recording it names ships: the modes' openers over the mode ids and every event the mode controller emits (scanned
// from matchModes.ts), the running gear by ground, gearbox, turret drive and hull class, water under any hull, roofs
// by their building, the night's ambience, the fleet's powertrains. Then the engine itself: a dirt road is earth under
// the tracks, a hull splashes into a ford and drains coming out, the ball is heard where anyone strikes it, a flag by
// whose it is, the special waves, the counter-attack, an APS intercept, a light vehicle's end and a crash into a barn.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { SFX_ASSETS } from './sfxManifest.generated.ts';
import { FLAG_CUE, MODE_EVENT_SOUND, MODE_EVENT_TYPES, MODE_OPENER, hordeWaveSiren, modeOpener, modeSoundAssets } from './modeSounds.ts';
import { GAME_MODE_IDS } from '../sim/gameModeCatalog.ts';
import { RUNNING_SURFACE, SHIFT_SOUND, SUSPENSION_SOUND, TURRET_DRIVE_SOUND, WATER_SOUND } from './vehicleRig.ts';
import { ENGINE_FAMILIES, ENGINE_FAMILY_IDS, resolveEngineFamily } from './vehicleAudioProfiles.ts';
import { MAP_SCENES, SPOT_HOURS, spotHeardAt } from './environmentScenes.ts';
import { MAP_IDS } from '../world/maps/mapIds.ts';
import { STRUCTURE_SOUND_MATERIALS, sectionFallSounds } from './destructionSounds.ts';
import { propSoundRecipe } from './propSounds.ts';
import '../vehicles/fleetRegistration.ts';
import { TANK_SPECS } from '../vehicles/specs.ts';
import { createFakeContext, fakeBuffer } from './fakeAudioContext.test-support.mjs';
import { createBus } from '../game/stateCore.ts';

const ships = (id, why) => assert.ok(SFX_ASSETS[id], `${why}: ${id} ships`);

// ---- the modes: an opener for every mode id, every controller event named, every recording shipped.
for (const mode of GAME_MODE_IDS) {
  assert.ok(Object.hasOwn(MODE_OPENER, mode), `${mode} names its opener`);
  if (MODE_OPENER[mode]) ships(MODE_OPENER[mode], `${mode}'s opener`);
}
assert.equal(MODE_OPENER.realistic, null, 'Realistic opens on silence');
const generic = GAME_MODE_IDS.filter((mode) => mode !== 'standard' && MODE_OPENER[mode] === 'sting_battle');
assert.deepEqual(generic, [], 'no special mode opens on the standard battle horn');
assert.equal(modeOpener('not_a_mode'), 'sting_battle', 'an unknown mode opens on the battle horn');
const modesSource = readFileSync(new URL('../sim/matchModes.ts', import.meta.url), 'utf8');
const emitted = [...new Set([...modesSource.matchAll(/emit\(\s*'mode_([a-z_]+)'/g)].map((m) => m[1]))].sort();
assert.ok(emitted.length >= 20, `the controller's mode events found (${emitted.length})`);
const unnamed = emitted.filter((type) => !MODE_EVENT_TYPES.includes(type));
assert.deepEqual(unnamed, [], `every mode event is named in src/audio/modeSounds.ts MODE_EVENT_SOUND: ${unnamed.join(', ')}`);
const stale = MODE_EVENT_TYPES.filter((type) => !emitted.includes(type));
assert.deepEqual(stale, [], `every named mode event is still emitted: ${stale.join(', ')}`);
for (const type of MODE_EVENT_TYPES) {
  const entry = MODE_EVENT_SOUND[type];
  assert.ok(entry.ids.length > 0 || (entry.why && entry.why.length > 10), `${type}: a sound, or why it is heard as nothing`);
}
for (const id of modeSoundAssets()) ships(id, 'a mode sound');
for (const [event, sides] of Object.entries(FLAG_CUE)) assert.notEqual(sides.ours, sides.theirs, `${event}: ours and theirs differ`);
assert.equal(hordeWaveSiren('swarm'), 'mode_horde_swarm');
assert.equal(hordeWaveSiren('runner'), 'mode_horde_swarm');
assert.equal(hordeWaveSiren(null), 'mode_horde_siren');
assert.match(modesSource, /emit\('mode_ball_hit', \{[^}]*x: ball\.x, y: ball\.y, z: ball\.z/, 'a ram on the ball says where the ball is');
assert.equal([...modesSource.matchAll(/emit\('mode_ball_hit', \{[^}]*x: ball\.x/g)].length, 2, 'a ram and a shot both say where');
const engineSource = readFileSync(new URL('./audioEngine.ts', import.meta.url), 'utf8');
assert.match(engineSource, /for \(const type of MODE_EVENT_TYPES\) on</, 'the engine listens to every mode event');

// ---- the running gear: by ground, gearbox, turret drive and hull class; water under any hull.
for (const surface of ['earth', 'hard', 'sand', 'snow', 'mud', 'water']) {
  const ground = RUNNING_SURFACE[surface];
  assert.ok(ground, `${surface} names its running gear`);
  for (const cls of ['light', 'heavy']) for (const speed of ['slow', 'fast']) ships(`tracks_${cls}_${ground.tracks}_${speed}`, `${surface}'s tracks`);
  if (surface !== 'hard') assert.ok(ground.squeal < 0.5 && ground.scrub > ground.squeal, `${surface}: a pivot ploughs more than it screeches`);
}
assert.equal(RUNNING_SURFACE.hard.scrub, 0, 'steel squeals on hard ground, nothing churns');
ships('track_scrub_soft_loop', 'the soft-ground pivot');
assert.notEqual(TURRET_DRIVE_SOUND.electric.start, TURRET_DRIVE_SOUND.hydraulic.start, 'the drives start as themselves');
for (const drive of Object.values(TURRET_DRIVE_SOUND)) for (const id of Object.values(drive)) ships(id, 'a turret drive');
assert.equal(SHIFT_SOUND.none, null, 'a turbine does not shift');
assert.notEqual(SHIFT_SOUND.manual, SHIFT_SOUND.automatic, 'a crash box and an automatic shift differently');
for (const id of [SHIFT_SOUND.manual, SHIFT_SOUND.automatic]) ships(id, 'a gear change');
assert.notEqual(SUSPENSION_SOUND.light.bump, SUSPENSION_SOUND.heavy.bump, 'a light hull bumps as itself');
for (const cls of Object.values(SUSPENSION_SOUND)) for (const id of Object.values(cls)) ships(id, 'a suspension');
for (const id of [WATER_SOUND.splash, WATER_SOUND.plunge, WATER_SOUND.exit]) ships(id, 'water under a hull');
assert.ok(WATER_SOUND.inM > WATER_SOUND.outM, 'the waterline has hysteresis');

// ---- the powertrains: the resolver's slips fixed, no family a catch-all.
const familyOf = (id) => resolveEngineFamily({ ...TANK_SPECS[id], id });
const expect = {
  type100: 'diesel_ifv', strv81: 'gasoline_v12', jpz_e100: 'gasoline_v12', centurion3: 'gasoline_v12',
  leo1a5: 'diesel_v12_coldwar', amx30b2: 'diesel_v12_coldwar', challenger1_mk2: 'diesel_v12_coldwar',
  magach6b: 'diesel_aircooled', shot_kal: 'diesel_aircooled', leo2a2: 'diesel_v12_modern', leopard2_proto: 'diesel_v12_modern',
  leo2a4: 'diesel_v12_modern', challenger2: 'diesel_v12_modern', m1a1: 'turbine_agt', t80u: 'turbine_gtd',
};
for (const [id, family] of Object.entries(expect)) {
  assert.ok(TANK_SPECS[id], `${id} is in the fleet`);
  assert.equal(familyOf(id), family, `${id} runs ${family}`);
}
const ids = Object.keys(TANK_SPECS);
const counts = {};
for (const id of ids) counts[familyOf(id)] = (counts[familyOf(id)] ?? 0) + 1;
for (const [family, n] of Object.entries(counts)) assert.ok(n / ids.length < 0.35, `${family} holds ${n} of ${ids.length} hulls, not a catch-all`);
for (const family of ENGINE_FAMILY_IDS) assert.ok(ENGINE_FAMILIES[family], `${family} has a profile`);

// ---- the night: every scene's spot has its hours, the night plays none of the day's.
assert.deepEqual(Object.keys(MAP_SCENES).sort(), [...MAP_IDS].sort(), 'every battlefield has its scene');
let nightLife = 0;
for (const [map, scene] of Object.entries(MAP_SCENES)) {
  for (const [id] of [...scene.spots, ...scene.night]) assert.ok(Object.hasOwn(SPOT_HOURS, id.replace(/^spot_/, '')), `${map}: ${id} names its hours`);
  for (const [id] of scene.night) {
    assert.equal(SPOT_HOURS[id.replace(/^spot_/, '')], 'night', `${map}: ${id} is the night's`);
    ships(id, `${map}'s night`);
  }
  const atNight = [...scene.spots.filter(([id]) => spotHeardAt(id, true)), ...scene.night].map(([id]) => id);
  for (const id of atNight) assert.notEqual(SPOT_HOURS[id.replace(/^spot_/, '')], 'day', `${map}: no ${id} after dark`);
  if (scene.night.length) nightLife++;
}
assert.ok(nightLife >= 20, `${nightLife} battlefields have night life`);
assert.ok(!spotHeardAt('spot_songbird', true) && spotHeardAt('spot_songbird', false), 'songbirds sing by day only');
assert.ok(spotHeardAt('spot_owl', true) && !spotHeardAt('spot_owl', false), 'owls call after dark only');

// ---- roofs by their building, props by their material.
const roofs = Object.fromEntries(STRUCTURE_SOUND_MATERIALS.map((material) => [material, sectionFallSounds('roof', false, { material, glassy: false })[0].id]));
for (const material of ['concrete', 'plaster', 'timber']) assert.notEqual(roofs[material], 'roof_fall', `a ${material} roof is not clay tiles`);
for (const id of Object.values(roofs)) ships(id, 'a roof');
assert.equal(propSoundRecipe('bunker')[0].id, 'wall_break_concrete', 'a pillbox breaks as concrete');
assert.equal(propSoundRecipe('walladobe')[0].id, 'wall_break_plaster', 'a mud-brick wall crumbles');
assert.equal(propSoundRecipe('barrier')[0].id, 'wall_break_concrete', 'a concrete barrier cracks');

// ---- the engine: what is heard.
const publicRoot = new URL('../../public/', import.meta.url);
globalThis.fetch = async (url) => {
  try {
    const bytes = await readFile(new URL(String(url).replace(/^\//, ''), publicRoot));
    return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
  } catch {
    return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) };
  }
};
globalThis.window = {};
const { createAudio } = await import('./audioEngine.ts');
const ctx = createFakeContext({ decode: () => fakeBuffer(1.5) });
// x < 0: a road (hard ground; dirt where z < 0, paved where z > 0); 100 < x < 200: a river (deep 0.9 m); far x: frozen lake
const terrain = {
  getHeightAt: () => 0,
  getGroundType: (x) => (x < 0 || x > 400 ? 'hard' : 'medium'),
  getTrackSurfaceAt: (x) => (x > 400 ? 3 : 0),
  getRoadPaveAt: (x, z) => (x < 0 ? (z < 0 ? 0 : 1) : 0),
  getWaterDepthAt: (x) => (x > 100 && x < 200 ? 0.9 : 0),
};
let gameMode = 'standard';
const makeup = { rubble: [{ material: 'timber', share: 0.9 }], massClass: 'shed' };
const audio = createAudio({ context: ctx, getMapId: () => 'verdant', getGameMode: () => gameMode, getTerrain: () => terrain,
  getObjectiveTeam: () => 'alpha', getStructureMakeup: (id) => (id === 7 ? makeup : null), tier: 'desktop' });
const bus = createBus();
audio.bindBus(bus);
audio.resume();
const probe = globalThis.window.__COT_AUDIO;
const spec = (id) => TANK_SPECS[id];
function hull(id, specId, { x = 0, z = 0, team = 'player', isPlayer = false, speed = 0 } = {}) {
  return {
    id, team, isPlayer, specId, spec: spec(specId),
    state: { pos: { x, y: 0, z }, speed, yaw: Math.PI / 2, yawRate: 0, verticalSpeed: 0, grounded: true, turretYawRate: 0, gunPitch: 0 },
    input: { throttle: speed ? 1 : 0 },
    combat: { destroyed: false, hp: 1000, maxHp: 1000, modules: {}, ammo: [20], ammoCapacity: [20], shellSlot: 0 },
  };
}
const listener = { pos: { x: 0, y: 2, z: 0 }, forward: { x: 0, y: 0, z: 1 }, kind: 'player-tank', ownerId: 'me', scoped: false };
const me = hull('me', 'leo2a4', { isPlayer: true });
const dirt = hull('dirt', 'leo1a5', { x: -20, z: -30 });
const paved = hull('paved', 'leo1a5', { x: -20, z: 30 });
const ice = hull('ice', 't80u', { x: 410, z: 0, team: 'enemy' });
const ford = hull('ford', 'bmp2', { x: 95, z: 20, team: 'enemy', speed: 4 });
const field = [me, dirt, paved, ice, ford];
bus.emit('phase:change', { phase: 'battle' });
await audio.warmBattleEvents(['leo2a4', 'leo1a5', 't80u', 'bmp2']);
const step = (n = 1) => { for (let i = 0; i < n; i++) { ctx.advance(1 / 30); audio.update(1 / 30, listener, field); } };
step(6);
await probe.libraryIdle();
step(2);
const rig = (id) => probe.engineState().find((r) => r.id === id);
assert.equal(rig('dirt').surface, 'earth', 'a dirt road is earth under the tracks');
assert.equal(rig('paved').surface, 'hard', 'a paved street is hard');
assert.equal(rig('ice').surface, 'hard', 'a frozen lake under a snow map stays hard');
assert.equal(rig('dirt').family, 'diesel_v12_coldwar', 'a Leopard 1 runs the cold-war diesel');
const mark = () => probe.sfxLog.at(-1)?.seq ?? 0;
const since = (seq) => probe.sfxLog.filter((e) => e.seq > seq).map((e) => e.n);

// water: the ford's splash going in, the water off it coming out (a remote hull's ground is read every 0.35 s)
let seq = mark();
ford.state.pos.x = 110;
step(15);
assert.ok(since(seq).includes('water_splash_in'), `a hull splashes into a ford (${since(seq)})`);
for (let i = 0; i < 60; i++) step(1);
seq = mark();
ford.state.pos.x = 210;
step(15);
assert.ok(since(seq).includes('water_exit'), `the water pours off a hull leaving the river (${since(seq)})`);

// a light vehicle's end; a crash into a timber barn and a sandbag wall
seq = mark();
bus.emit('tank:destroyed', { id: 'ford', killerId: 'me', pos: [210, 0, 20] });
assert.ok(since(seq).includes('vehicle_explode_light') && !since(seq).includes('tank_explode'), `a BMP goes up as a light vehicle (${since(seq)})`);
seq = mark();
bus.emit('tank:destroyed', { id: 'ice', killerId: 'me', pos: [410, 0, 0] });
assert.ok(since(seq).includes('tank_explode'), 'a T-80 goes up as a tank');
seq = mark();
bus.emit('tank:impact', { id: 'dirt', pos: [-20, 0, -30], speedMps: 9, cause: 'impact', struck: 'structure', struckStructureId: 7 });
bus.emit('tank:impact', { id: 'paved', pos: [-20, 0, 30], speedMps: 9, cause: 'impact', struck: 'sandbagwall' });
assert.ok(since(seq).includes('hit_timber') && since(seq).includes('hit_earth'), `a barn and a berm sound of themselves (${since(seq)})`);

// an active protection system's intercept
seq = mark();
bus.emit('aps:intercept', { id: 'me', x: 3, y: 2, z: 4 });
assert.ok(since(seq).includes('aps_intercept'), 'an APS intercept is heard');

// the modes
seq = mark();
bus.emit('mode:flag_taken', { team: 'bravo', by: 'me' });
bus.emit('mode:flag_taken', { team: 'alpha', by: 'ice' });
assert.deepEqual(since(seq).filter((n) => n.startsWith('ui_flag')), ['ui_flag_seized', 'ui_flag_taken'], 'their flag seized, our flag taken');
seq = mark();
bus.emit('mode:ball_hit', { by: 'dirt', kind: 'ram', x: -20, y: 2, z: -25 });
const strike = probe.sfxLog.filter((e) => e.seq > seq).find((e) => e.n === 'ball_strike');
assert.ok(strike && strike.d > 20, `another tank's strike on the ball is heard where the ball is (${strike?.d})`);
seq = mark();
gameMode = 'endless_horde';
bus.emit('mode:wave_started', { wave: 4, special: 'swarm' });
gameMode = 'frontline_assault';
bus.emit('mode:counter_attack', { line: 1, squad: 3, x: 50, z: 300 });
assert.ok(since(seq).includes('mode_horde_swarm'), 'a special wave comes on the attack warning');
assert.ok(since(seq).includes('mode_counter_attack'), 'the counter-attack\'s flare goes up');
// a battle entered in capture the flag warms its opener with the battle (presenceAssets); here the mode changed after it
gameMode = 'capture_the_flag';
await probe.preload(['mode_ctf_opener']);
await probe.libraryIdle();
seq = mark();
bus.emit('battle:rollout', {});
assert.ok(since(seq).includes('mode_ctf_opener'), `capture the flag opens on its own sound (${since(seq)})`);

// every mode's opener and the count's one-shots decode before any loop but the idles (an AC-130 battle decoded its opener 56th and its
// tick 79th of 85 files, behind every loop and the aircraft set: silent when due on a loaded machine)
for (const mode of GAME_MODE_IDS) {
  gameMode = mode;
  const presence = probe.presence(['leo2a4', 'leo1a5', 't80u', 'bmp2']);
  // the roster's idles come first (heard from the first frame); then the cues, before the bed and any other loop
  const firstLoop = presence.findIndex((id) => SFX_ASSETS[id]?.l && !/^engine_.+_idle$/.test(id));
  const due = ['ui_countdown_tick', 'hatch', 'ui_countdown_go', ...(MODE_OPENER[mode] ? [MODE_OPENER[mode]] : [])];
  for (const id of due) {
    const at = presence.indexOf(id);
    assert.ok(at >= 0 && at < firstLoop, `${mode}: ${id} decodes before any loop (${at} vs the first loop ${firstLoop}, ${presence[firstLoop]})`);
  }
}

bus.emit('phase:change', { phase: 'garage' });
console.log(`worldSounds.selftest: ${GAME_MODE_IDS.length} mode openers, ${MODE_EVENT_TYPES.length} mode events, running gear by ground/gearbox/drive/class, water edges, ${ids.length} hulls' powertrains (${Object.keys(counts).length} families), night life on ${nightLife} maps, roofs and props by material, dirt roads, crashes, kills, APS and the modes in the engine passed`);
