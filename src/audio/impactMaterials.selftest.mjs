// Every impact sounds of what it struck (impact-materials-269; owner 2026-11-03: "ricochets off ground shouldnt sound
// like metal"). The resolver (impactMaterials.ts): every material has a sound for every result and calibre, every one
// ships, only steel rings or whines, and every strike carries as its role's did (soundCues.ts). The engine on the shipped manifests: a graze skips off the ground's own
// surface, a ricochet off a rubber skirt slaps, the running gear clanks, a wreck knocks, a round through a track is
// heard, the plate behind a screen is heard through it, bullets strike the ground they hit, near misses go by their
// calibre and speed, a penetration's spall bursts into the compartment it struck, and a close burst rains back the
// ground it dug.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { SFX_ASSETS } from './sfxManifest.generated.ts';
import {
  GRAZE_INCIDENCE_DEG, GROUND_DEBRIS, MATERIAL_SOUNDS, SPALL, STRUCK_MATERIALS, calibreBand, compartmentOf, distantBank, hitMaterial,
  impactAssetIds, impactLayers, landingResult, nearMissAsset, propMaterial,
} from './impactMaterials.ts';
import { PLATE_MATERIALS } from '../sim/plateMaterial.ts';
import { cueProfile } from './soundCues.ts';

// ---- the resolver: complete, shipped, and only steel rings
/** What rings or whines: a steel strike, a ricochet, an armour hit's banks. Only a steel material's layers may name one. */
const STEEL_SOUNDS = new Set(['pen_heavy', 'pen_light', 'nonpen_heavy', 'ricochet_heavy', 'ricochet_light', 'ricochet_whine', 'bullet_armor',
  'bullet_metal', 'ground_metal', 'strike_track', 'strike_wheel', 'strike_cage', 'strike_wreck', 'impact_far_pen', 'impact_far_nonpen',
  'impact_far_ricochet', 'era_det']);
const RESULTS = ['through', 'stop', 'glance'];
const BANDS = ['bullet', 'autocannon', 'cannon'];
for (const material of STRUCK_MATERIALS) {
  const sound = MATERIAL_SOUNDS[material];
  assert.ok(sound, `${material} has its sounds`);
  for (const result of RESULTS) for (const band of BANDS) {
    const layers = impactLayers(material, result, band);
    if (material !== 'era' || result === 'glance') assert.ok(layers.length > 0, `${material} ${result} ${band} plays something`);
    const bank = distantBank(material, result, band);
    for (const id of [...layers.map((l) => l.id), ...(bank ? [bank.id] : [])]) {
      assert.ok(SFX_ASSETS[id], `${material} ${result} ${band}: ${id} ships`);
      if (!sound.steel) assert.ok(!STEEL_SOUNDS.has(id), `${material} is not steel: ${result} ${band} never plays ${id}`);
    }
    if (band === 'bullet') assert.equal(bank, null, `${material}: a bullet strike carries no distant bank`);
  }
  if (!sound.steel) assert.equal(sound.interiorDb, null, `${material}: struck on our hull, nothing rings inside`);
}
for (const id of impactAssetIds()) assert.ok(SFX_ASSETS[id], `${id} ships`);
// the ricochet's whine plays under a steel strike, never on the ground
for (const ground of ['earth', 'sand', 'mud', 'snow', 'paved', 'water']) {
  for (const band of BANDS) assert.ok(!impactLayers(ground, 'glance', band).some((l) => STEEL_SOUNDS.has(l.id)), `a graze on ${ground} never rings`);
}
assert.ok(impactLayers('trackLinks', 'glance', 'cannon').some((l) => l.id === 'ricochet_whine'), 'a round glancing off the track whines away');
assert.equal(impactLayers('armour', 'glance', 'cannon')[0].id, 'ricochet_heavy', 'a ricochet off armour plate is 2026-10\'s');
assert.equal(hitMaterial('rubberSkirt'), 'rubberSkirt');
assert.equal(hitMaterial(undefined), 'armour', 'an older peer\'s hit names no material: armour, as it always played');
assert.equal(hitMaterial('plutonium'), 'armour', 'an unknown name from the wire is no material');
assert.deepEqual(PLATE_MATERIALS.filter((m) => !MATERIAL_SOUNDS[m]), [], 'every plate material has its sounds');
assert.equal(calibreBand(7.62), 'bullet');
assert.equal(calibreBand(30), 'autocannon');
assert.equal(calibreBand(125), 'cannon');
assert.equal(landingResult(GRAZE_INCIDENCE_DEG + 1, false), 'glance', 'a flat landing skips');
assert.equal(landingResult(40, false), 'stop', 'a plunging round digs in');
assert.equal(landingResult(88, true), 'stop', 'a burst never skips');
assert.equal(landingResult(undefined, false), 'stop', 'an older host names no incidence: a landing');
assert.equal(propMaterial('containerRow'), 'thinSteel');
assert.equal(propMaterial('tree'), 'timber');
assert.equal(propMaterial('sandbag'), 'earthwork');
assert.equal(propMaterial('boulder'), 'rock');
assert.equal(propMaterial('warehouse'), 'concrete');
assert.equal(nearMissAsset(7.62, 850, false), 'bullet_crack');
assert.equal(nearMissAsset(30, 1100, false), 'flyby_autocannon');
assert.equal(nearMissAsset(125, 1750, false), 'shell_flyby_sabot');
assert.equal(nearMissAsset(125, 850, false), 'flyby_shell_crack', 'a supersonic full-bore round cracks past');
assert.equal(nearMissAsset(152, 300, false), 'shell_flyby_he', 'a subsonic shell whooshes past');
assert.equal(nearMissAsset(152, 280, true), 'missile_flyby');
assert.equal(compartmentOf('turret', 2), 'fighting');
assert.equal(compartmentOf('hull', 2.4), 'driver');
assert.equal(compartmentOf('hull', -2.5), 'engine');
assert.equal(compartmentOf('hull', 0), 'fighting');
assert.equal(compartmentOf('hull', null), 'fighting');
assert.equal(GROUND_DEBRIS.water.ground, null, 'no dirt rains on water');

// ---- every strike carries as its role's did: a new surface's asset never falls to its group's default (a bullet into
// sand had shipped carried like a shell's strike: 10 dB hot, uncapped, and loud enough in the HDR window to duck the battle)
const policy = (id) => cueProfile(id, SFX_ASSETS[id].g);
for (const material of STRUCK_MATERIALS) for (const result of RESULTS) for (const { id } of impactLayers(material, result, 'bullet')) {
  const p = policy(id);
  assert.ok(p.refM <= 6 && p.maxM <= 220 && p.loudDb <= 116, `a bullet's strike on ${material} is local (${id}: refM ${p.refM}, maxM ${p.maxM}, loudDb ${p.loudDb})`);
}
const carriesAs = (id, parent) => {
  for (const key of ['bus', 'space', 'priority', 'maxInstances', 'cooldownS', 'refM', 'rolloff', 'maxM', 'loudDb', 'gainDb']) {
    assert.equal(policy(id)[key], policy(parent)[key], `${id} carries as ${parent} does (${key})`);
  }
};
for (const { ground, hull } of Object.values(GROUND_DEBRIS)) {
  if (ground) carriesAs(ground, 'debris_dirt');
  carriesAs(hull, 'hull_debris_patter');
}
for (const id of Object.values(SPALL)) carriesAs(id, 'pen_interior');

// ---- the engine on the shipped manifests (as audioEngine.selftest.mjs runs it)
const publicRoot = new URL('../../public/', import.meta.url);
const fetched = new Set();
globalThis.fetch = async (url) => {
  fetched.add(String(url).replace(/^\//, ''));
  try {
    const bytes = await readFile(new URL(String(url).replace(/^\//, ''), publicRoot));
    return { ok: true, status: 200, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) };
  } catch {
    return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) };
  }
};
globalThis.window = {};
const { createFakeContext, fakeBuffer } = await import('./fakeAudioContext.test-support.mjs');
const { createBus } = await import('../game/stateCore.ts');
const { createAudio } = await import('./audioEngine.ts');
const ctx = createFakeContext({ decode: () => fakeBuffer(1.5) });
// the ground by x: water under -200, mud -200..-100, earth -100..0, sand 0..100, snow 100..200, a road past 200
const terrain = {
  getHeightAt: () => 0,
  getGroundType: (x) => (x > 200 ? 'hard' : x > -200 && x < -100 ? 'soft' : 'medium'),
  getTrackSurfaceAt: (x) => (x >= 0 && x < 100 ? 2 : x >= 100 && x < 200 ? 3 : 0),
  getWaterDepthAt: (x) => (x < -200 ? 2 : 0),
};
const audio = createAudio({ context: ctx, getMapId: () => 'verdant', getGameMode: () => 'standard', getTerrain: () => terrain, tier: 'desktop' });
const bus = createBus();
audio.bindBus(bus);
audio.resume();
const probe = globalThis.window.__COT_AUDIO;
const tank = (id, x, z, team, isPlayer = false) => ({
  id, team, isPlayer, specId: 't72b3',
  spec: { id: 't72b3', nation: 'Russia', role: 'mbt', weightTons: 46, enginePowerHp: 1130, topSpeedKmh: 60, reverseSpeedKmh: 10, gun: { caliberMm: 125, shells: [{ type: 'APFSDS' }] } },
  state: { pos: { x, y: 0, z }, speed: 0, yaw: 0, yawRate: 0, verticalSpeed: 0, grounded: true, turretYawRate: 0, gunPitch: 0 },
  input: { throttle: 0 },
  combat: { destroyed: false, hp: 1000, maxHp: 1000, modules: {}, ammo: [20], ammoCapacity: [20], shellSlot: 0 },
});
const listener = { pos: { x: -50, y: 2, z: 0 }, forward: { x: 0, y: 0, z: 1 }, kind: 'player-tank', ownerId: 'me', scoped: false };
const tanks = [tank('me', -50, 0, 'player', true), tank('foe', -50, 40, 'enemy')];
bus.emit('phase:change', { phase: 'battle' });
await audio.warmBattleEvents(['t72b3']);
for (let i = 0; i < 10; i++) { ctx.advance(1 / 60); audio.update(1 / 60, listener, tanks); }
await probe.libraryIdle();
// the battle warm decodes every impact the resolver names before the first shot
for (const id of impactAssetIds()) assert.ok(fetched.has(`audio/sfx/${SFX_ASSETS[id].g}/${id}_0.webm`), `${id} is in the battle set`);
let shellId = 5000;
/** The impact sounds an event starts, with the listener standing on the ground at x (sounds 2 s apart: no cooldowns). */
function heard(x, emit) {
  ctx.advance(2);
  listener.pos.x = x;
  for (const t of tanks) t.state.pos.x = x;
  audio.update(1 / 60, listener, tanks);
  const since = probe.sfxLog.at(-1)?.seq ?? 0;
  emit();
  return probe.sfxLog.filter((e) => e.seq > since).map((e) => e.n).filter((n) => !/^(gun_|tail_|blast_punch|mg_|ac_\d|engine_|amb_)/.test(n));
}
const hit = (fields) => () => bus.emit('shell:hit', { shellId: ++shellId, pos: [listener.pos.x, 0.5, 40], normal: [1, 0, 0], targetId: 'foe', attackerId: 'x',
  damage: 0, caliberMm: 125, shellType: 'APFSDS', targetHpAfter: 1000, ...fields });
const land = (x, fields) => () => bus.emit('shell:expired', { shellId: ++shellId, shooterId: 'foe', pos: [x, 0, 30], hitTerrain: true, hitKind: 'terrain',
  surfaceKind: x < -200 ? 'water' : 'terrain', normal: [0, 1, 0], shellType: 'APFSDS', caliberMm: 125, ...fields });
const rings = (names) => names.filter((n) => STEEL_SOUNDS.has(n));

// the owner's case: a round grazing the ground rings no steel, on every surface; a plunge digs in
for (const [ground, x, skip, plunge] of [['earth', -50, 'graze_earth', 'ground_dirt'], ['sand', 50, 'graze_sand', 'ground_sand'], ['mud', -150, 'graze_mud', 'ground_mud'],
  ['snow', 150, 'graze_snow', 'ground_snow'], ['paved', 250, 'graze_paved', 'ground_concrete'], ['water', -250, 'graze_water', 'water_big']]) {
  const grazed = heard(x, land(x, { impactAngleDeg: 85 }));
  assert.ok(grazed.includes(skip), `a 125 mm rod grazing ${ground} skips off it (${grazed})`);
  assert.deepEqual(rings(grazed), [], `and nothing rings (${grazed})`);
  const dug = heard(x, land(x, { impactAngleDeg: 30 }));
  assert.ok(dug.includes(plunge) && !dug.includes(skip), `a plunging round digs into ${ground} (${dug})`);
}
assert.ok(!heard(-50, land(-50, { impactAngleDeg: 10 })).includes('ground_rock'), 'open earth never rolls a rock at random');
// bullets strike the ground they hit
for (const [ground, x, id] of [['sand', 50, 'bullet_sand'], ['snow', 150, 'bullet_snow'], ['mud', -150, 'bullet_mud'], ['a road', 250, 'bullet_paved']]) {
  const names = heard(x, () => bus.emit('shell:expired', { shellId: ++shellId, shooterId: 'foe', pos: [x, 0, 12], hitTerrain: true, hitKind: 'terrain', normal: [0, 1, 0], caliberMm: 7.62 }));
  assert.deepEqual(names, [id], `a bullet into ${ground} (${names})`);
}
// rounds on a tank, by the part they struck
const cases = [
  ['a ricochet off a rubber skirt slaps it', { kind: 'ricochet', material: 'rubberSkirt' }, ['strike_rubber'], true],
  ['a 30 mm round stopped by a rubber skirt', { kind: 'spaced_absorb', material: 'rubberSkirt', caliberMm: 30 }, ['strike_rubber'], true],
  ['a ricochet off the track clanks its links and whines away', { kind: 'ricochet', material: 'trackLinks' }, ['strike_track', 'ricochet_whine'], false],
  ['a round through the road wheels', { kind: 'screen_pierce', material: 'roadWheel' }, ['strike_wheel'], false],
  ['a round through the track is heard', { kind: 'screen_pierce', material: 'trackLinks' }, ['strike_track'], false],
  ['a round through a bustle rack', { kind: 'screen_pierce', material: 'stowage' }, ['strike_stowage'], true],
  ['a round into a slat cage', { kind: 'spaced_absorb', material: 'cage' }, ['strike_cage'], false],
  ['a round on a burnt-out wreck knocks hollow', { kind: 'nonpen', material: 'wreck', targetId: null }, ['strike_wreck'], false],
  ['a ricochet off sloped armour is 2026-10\'s', { kind: 'ricochet', material: 'armour' }, ['ricochet_heavy'], false],
  ['through the running gear and off the hull behind it', { kind: 'ricochet', material: 'armour', screenMaterial: 'trackLinks' }, ['strike_track', 'ricochet_heavy'], false],
  ['an older peer\'s ricochet names no material: armour', { kind: 'ricochet' }, ['ricochet_heavy'], false],
];
for (const [label, fields, want, soft] of cases) {
  const names = heard(-50, hit(fields));
  for (const id of want) assert.ok(names.includes(id), `${label} (${names})`);
  if (soft) assert.deepEqual(rings(names), [], `${label}: nothing rings (${names})`);
}
{
  // the same ricochet off the same plate, bare and behind the running gear (the last three: bare, screened, older peer's)
  const [bare, screened] = probe.sfxLog.filter((e) => e.n === 'ricochet_heavy').slice(-3);
  assert.ok(screened.g < bare.g * 0.75, `the plate behind the running gear is heard through it (${bare.g} -> ${screened.g})`);
}
// near misses by calibre and speed
for (const [label, caliberMm, velocityMps, want] of [['a 30 mm round', 30, 1100, 'flyby_autocannon'], ['a 125 mm HE-FRAG round', 125, 850, 'flyby_shell_crack'],
  ['a 125 mm rod', 125, 1750, 'shell_flyby_sabot'], ['a 7.62 mm bullet', 7.62, 830, 'bullet_crack']]) {
  const names = heard(-50, () => bus.emit('shell:fired', { shellId: ++shellId, shooterId: 'foe', muzzlePos: [-46, 2, 400], dir: [0, 0, -1], caliberMm, shellType: 'HE', velocityMps }));
  assert.ok(names.includes(want), `${label} passing 4 m away: ${want} (${names})`);
}
// a penetration's spall bursts into the compartment it struck
for (const [where, frame, localPos, want] of [['the turret', 'turret', [0.6, 1.9, 0.5], 'pen_interior'], ['the driver\'s station', 'hull', [0.3, 0.9, 2.6], 'spall_driver'],
  ['the engine bay', 'hull', [-1.2, 1, -2.7], 'spall_engine']]) {
  const names = heard(-50, () => bus.emit('shell:hit', { shellId: ++shellId, pos: [-50, 1, 0], normal: [0, 0, 1], kind: 'pen', targetId: 'me', attackerId: 'foe',
    damage: 200, caliberMm: 125, shellType: 'APFSDS', targetHpAfter: 800, material: 'armour', impactFrame: frame, impactLocalPos: localPos }));
  assert.ok(names.includes(want), `a penetration into ${where}: ${want} (${names})`);
}
// a ricochet off our own rubber skirt rings nothing inside; off our armour it bongs
assert.ok(!heard(-50, () => bus.emit('shell:hit', { shellId: ++shellId, pos: [-48, 0.8, 0], normal: [1, 0, 0], kind: 'ricochet', targetId: 'me', attackerId: 'foe',
  caliberMm: 125, shellType: 'APFSDS', targetHpAfter: 800, material: 'rubberSkirt' })).includes('nonpen_interior'), 'a glance off our rubber skirt: no bong inside');
assert.ok(heard(-50, () => bus.emit('shell:hit', { shellId: ++shellId, pos: [-50, 1.5, 2], normal: [0, 0, 1], kind: 'ricochet', targetId: 'me', attackerId: 'foe',
  caliberMm: 125, shellType: 'APFSDS', targetHpAfter: 800, material: 'armour' })).includes('nonpen_interior'), 'a glance off our armour bongs inside');
// a close burst rains back the ground it dug, onto the ground and our hull; on water, its spray
for (const [ground, x, debris, patter] of [['earth', -50, 'debris_dirt', 'hull_debris_patter'], ['sand', 50, 'debris_sand', 'hull_patter_sand'],
  ['snow', 150, 'debris_snow', 'hull_patter_snow'], ['mud', -150, 'debris_mud', 'hull_patter_mud'], ['a road', 250, 'debris_grit', 'hull_patter_grit'], ['water', -250, null, 'hull_patter_water']]) {
  const names = heard(x, () => bus.emit('shell:expired', { shellId: ++shellId, shooterId: 'foe', pos: [x + 6, 0, 6], hitTerrain: true, hitKind: 'terrain',
    surfaceKind: x < -200 ? 'water' : 'terrain', normal: [0, 1, 0], shellType: 'HE', caliberMm: 152 }));
  if (debris) assert.ok(names.includes(debris), `a burst in ${ground} rains ${debris} (${names})`);
  else assert.ok(!names.some((n) => n.startsWith('debris_')), `a burst in ${ground} rains no dirt (${names})`);
  assert.ok(names.includes(patter), `and patters ${patter} on our hull (${names})`);
}
console.log(`impactMaterials.selftest: ${STRUCK_MATERIALS.length} materials x 3 results x 3 calibres, ${impactAssetIds().length} assets, only steel rings; `
  + `grazes, tank parts, bullets, near misses, spall and debris on the engine passed`);
process.exit(0);
