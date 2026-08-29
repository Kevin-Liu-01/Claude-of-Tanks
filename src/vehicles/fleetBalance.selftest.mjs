import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import './tankFactory.ts';
import {
  PRODUCTION_TANK_IDS, SAVED_TANK_IDS, TANK_SPECS,
} from './specs.js';
import { tankTier } from './tier.ts';
import { createCombatState, startReload } from '../sim/damage.ts';
import { penAtDistanceMm } from '../sim/ballistics.ts';
import { traceTank } from '../sim/armor.ts';
import { createAuthoritativeMatch } from '../sim/authoritativeMatch.ts';
import { garageStatGroup } from '../ui/garageDossier.ts';

const REQUIRED_NUMBERS = [
  'hp', 'enginePowerHp', 'weightTons', 'topSpeedKmh', 'reverseSpeedKmh',
  'hullTraverseDegS', 'turretTraverseDegS', 'gunPitchDegS',
  'gunElevationDeg', 'gunDepressionDeg',
];
const REQUIRED_GUN_NUMBERS = ['caliberMm', 'reloadS', 'baseAccuracy', 'aimTimeS'];
const REQUIRED_SHELL_NUMBERS = [
  'caliberMm', 'pen100Mm', 'pen1000Mm', 'dmg', 'velocityMps', 'moduleDmg',
];
const finite = (value) => Number.isFinite(value);

assert.equal(new Set(SAVED_TANK_IDS).size, SAVED_TANK_IDS.length,
  'saved fleet IDs are unique');
assert.equal(new Set(PRODUCTION_TANK_IDS).size, PRODUCTION_TANK_IDS.length,
  'production fleet IDs are unique');
assert.ok(SAVED_TANK_IDS.length >= 150, 'the complete saved fleet is audited');

for (const id of SAVED_TANK_IDS) {
  const spec = TANK_SPECS[id];
  assert.ok(spec, `${id}: canonical spec exists`);
  assert.equal(spec.id, id, `${id}: registry key and spec ID agree`);
  assert.ok(Number.isInteger(tankTier(id)) && tankTier(id) >= 1 && tankTier(id) <= 10,
    `${id}: tier is canonical and bounded`);
  assert.ok(['light', 'medium', 'heavy', 'td', 'mbt', 'ifv'].includes(spec.role),
    `${id}: supported mechanical role`);
  for (const key of REQUIRED_NUMBERS) {
    assert.ok(finite(spec[key]) && spec[key] >= 0, `${id}.${key}: finite non-negative stat`);
  }
  assert.ok(spec.hp > 0 && spec.enginePowerHp > 0 && spec.weightTons > 0,
    `${id}: survivability and mobility inputs are positive`);
  assert.ok(spec.topSpeedKmh > 0 && spec.reverseSpeedKmh > 0,
    `${id}: both drive limits are authored`);
  assert.ok(spec.terrainResistance?.hard > 0 && spec.terrainResistance?.medium > 0 &&
    spec.terrainResistance?.soft > 0, `${id}: all terrain resistance inputs are positive`);

  for (const key of REQUIRED_GUN_NUMBERS) {
    assert.ok(finite(spec.gun?.[key]) && spec.gun[key] > 0, `${id}.gun.${key}: positive stat`);
  }
  assert.ok(Array.isArray(spec.gun.shells) && spec.gun.shells.length > 0,
    `${id}: carries ammunition`);
  for (const round of spec.gun.shells) {
    for (const key of REQUIRED_SHELL_NUMBERS) {
      assert.ok(finite(round[key]) && round[key] > 0,
        `${id}/${round.name}.${key}: positive shell stat`);
    }
    assert.ok(round.pen1000Mm <= round.pen100Mm + 1e-9,
      `${id}/${round.name}: penetration cannot rise between 100 m and 1 km`);
    if (round.pen2000Mm != null) {
      assert.ok(finite(round.pen2000Mm) && round.pen2000Mm > 0,
        `${id}/${round.name}: valid 2 km penetration anchor`);
      assert.ok(round.pen2000Mm <= round.pen1000Mm + 1e-9,
        `${id}/${round.name}: penetration cannot rise between 1 km and 2 km`);
    }
    if (round.reloadS != null) {
      assert.ok(finite(round.reloadS) && round.reloadS > 0,
        `${id}/${round.name}: per-round reload is positive`);
    }
  }

  const armor = spec.armor;
  assert.ok(armor && Array.isArray(armor.hullPlates) && armor.hullPlates.length > 0,
    `${id}: hull armor surfaces exist`);
  assert.ok(Array.isArray(armor.turretPlates) && Array.isArray(armor.modules) &&
    Array.isArray(armor.crew), `${id}: complete combat-anatomy collections exist`);
  for (const plate of [...armor.hullPlates, ...armor.turretPlates]) {
    assert.equal(plate.verts?.length, 4, `${id}/${plate.name}: quad has four vertices`);
    for (const vertex of plate.verts) {
      assert.equal(vertex.length, 3, `${id}/${plate.name}: vertex is 3D`);
      assert.ok(vertex.every(finite), `${id}/${plate.name}: vertex is finite`);
    }
    assert.ok(finite(plate.physicalMm) && plate.physicalMm > 0,
      `${id}/${plate.name}: physical thickness is positive`);
    assert.ok(finite(plate.keMm) && plate.keMm > 0 && finite(plate.ceMm) && plate.ceMm > 0,
      `${id}/${plate.name}: KE/CE ratings are positive`);
  }
  for (const box of [...armor.modules, ...armor.crew]) {
    assert.ok(box.min?.length === 3 && box.max?.length === 3,
      `${id}: anatomy box is 3D`);
    for (let axis = 0; axis < 3; axis++) {
      assert.ok(finite(box.min[axis]) && finite(box.max[axis]) && box.min[axis] < box.max[axis],
        `${id}/${box.module || box.crew}: ordered finite AABB on axis ${axis}`);
    }
  }

  const combat = createCombatState(spec);
  assert.equal(combat.hp, spec.hp, `${id}: local combat reads canonical HP`);
  assert.equal(combat.maxHp, spec.hp, `${id}: local max HP reads canonical HP`);
}

const missileVelocityByVehicle = new Map([
  ['m2a2_bradley', 195], ['bmp2', 162.5], ['spz_puma', 117], ['type89', 130],
  ['mbt70', 208], ['fv510_milan', 130], ['m60a2', 208], ['bmp3_rok', 240.5],
  ['ua_m2a3_bradley', 195], ['bmpt_terminator2', 357.5], ['bwp1', 117],
  ['marder1a3', 130], ['m3a3_bradley', 195], ['bmp3', 240.5], ['upior', 117],
  ['bmpt_t90', 357.5], ['m551_sheridan', 208], ['m551a1_tts', 240.5],
  ['m1a3', 2050],
]);
const guided = [];
for (const id of SAVED_TANK_IDS) {
  for (const round of TANK_SPECS[id].gun.shells) {
    if (round.guided === true) guided.push({ id, round });
  }
}
assert.equal(guided.length, missileVelocityByVehicle.size,
  'every saved guided weapon has one explicit vehicle-owned speed');
for (const { id, round } of guided) {
  assert.equal(round.velocityMps, missileVelocityByVehicle.get(id),
    `${id}: missile speed is authored individually`);
  assert.equal(Object.hasOwn(round, 'authoredVelocityMps'), false,
    `${id}: no hidden global multiplier metadata`);
}

const siegeLine = [
  ['udes03', 8, 1400, 430, 315, 90],
  ['strv103a', 9, 1850, 480, 345, 180],
  ['strv103', 10, 2400, 520, 380, 220],
];
let previousDpm = 0;
for (const [id, tier, hp, alpha, penetration, frontalKe] of siegeLine) {
  const spec = TANK_SPECS[id];
  const primary = spec.gun.shells[0];
  assert.equal(tankTier(id), tier, `${id}: intended progression tier`);
  assert.equal(spec.hp, hp, `${id}: hardened HP`);
  assert.equal(primary.dmg, alpha, `${id}: hardened alpha`);
  assert.equal(primary.pen100Mm, penetration, `${id}: hardened penetration`);
  assert.equal(spec.armor.hullPlates.find((plate) => plate.name === 'upper_glacis').keMm,
    frontalKe, `${id}: dedicated wedge protection`);
  assert.equal(spec.armor.turretless, true, `${id}: fixed-gun hit model`);
  assert.equal(spec.armor.turretPlates.length, 0, `${id}: no phantom turret surface`);
  assert.ok(spec.armor.modules.every((box) => box.turretLocal === false),
    `${id}: modules live in the hull frame`);
  assert.ok(spec.armor.crew.every((box) => box.turretLocal === false),
    `${id}: crew lives in the hull frame`);
  assert.equal(spec.armor.modules.some((box) => box.module === 'turretRing'), false,
    `${id}: no fictional turret-ring hitbox`);
  const dpm = primary.dmg * 60 / spec.gun.reloadS;
  assert.ok(dpm > previousDpm, `${id}: damage output progresses by tier`);
  previousDpm = dpm;

  const pose = {
    pos: new Vector3(), yaw: 0, pitch: 0, roll: 0, turretYaw: 0, gunPitch: 0,
  };
  const headOn = traceTank(new Vector3(0, 0.9, 10), new Vector3(0, 0.9, -10),
    pose, spec.armor);
  assert.ok(headOn.some((hit) => hit.kind === 'plate' && hit.plate.name === 'upper_glacis'),
    `${id}: center-mass shot meets the visible wedge`);
  const side = traceTank(new Vector3(6, 0.95, 0), new Vector3(-6, 0.95, 0),
    pose, spec.armor);
  const sideArmor = side.find((hit) => hit.kind === 'plate'
    && /^hull_side_(?:upper|lower)_[RL]$/.test(hit.plate.name));
  assert.ok(sideArmor?.collisionFace,
    `${id}: side shot meets an exact low-hull collision face instead of a donor box`);
}

const retainedT90M = TANK_SPECS.t90m;
const proryv = TANK_SPECS.t90m_proryv;
assert.deepEqual({
  hp: proryv.hp,
  reverse: proryv.reverseSpeedKmh,
  reload: proryv.gun.reloadS,
  alpha: proryv.gun.shells[0].dmg,
  pen100: proryv.gun.shells[0].pen100Mm,
  pen2000: proryv.gun.shells[0].pen2000Mm,
}, { hp: 2850, reverse: 12, reload: 6.4, alpha: 560, pen100: 855, pen2000: 720 },
'Proryv owns its complete tier-X assault profile');
assert.equal(retainedT90M.hp, 2700, 'the retained tier-IX T-90M keeps its established combat profile');
assert.equal(proryv.armor.hullPlates.find((plate) => plate.name === 'upper_glacis').keMm, 560,
  'Proryv composite glacis is hardened');
assert.equal(proryv.armor.turretPlates.find((plate) => plate.name === 'turret_cheek_R').keMm,
  700, 'Proryv turret cheek is hardened');
assert.equal(proryv.armor.turretPlates.find((plate) => plate.name === 'turret_era_R')
  .era.ceFlatMm, 600, 'Proryv Relikt package is hardened');

const localProryv = createCombatState(proryv);
startReload(localProryv, proryv);
assert.equal(localProryv.reload.totalS, 6.4,
  'local reload consumes the exact Proryv gun cycle');
assert.equal(penAtDistanceMm(proryv.gun.shells[0], 2000), 720,
  'ballistics consumes the exact authored long-range penetration');
assert.equal(garageStatGroup(proryv), '10/modern',
  'garage normalizes Proryv against its actual matchmaking peers');
assert.equal(garageStatGroup(retainedT90M), '9/modern',
  'garage normalizes the retained T-90M against its new tier-IX peers');
assert.equal(garageStatGroup(TANK_SPECS.strv103a), '9/cold-war',
  'garage normalizes the 103A against its Cold War tier peers');

const japaneseMbtProgression = [
  ['type90', 9, 2250, 1500, 25, 44, 40, 30, 18.5, 3, 2.2, 500, 806, 660, 120, 600],
  ['type90a', 9, 2400, 1500, 30, 46, 42, 34, 17.0, 3, 2.0, 510, 855, 700, 134, 672],
  ['type10', 10, 2550, 1200, 35, 48, 46, 36, 5.2, 0, 0, 540, 891, 730, 134, 672],
  ['type10b', 10, 2700, 1200, 45, 50, 48, 40, 4.7, 0, 0, 550, 916, 750, 145, 726],
];
for (const [
  id, tier, hp, engine, reverse, hullTraverse, turretTraverse, gunPitch,
  reload, magazine, intraClip, alpha, pen100, pen2000, glacisKe, turretKe,
] of japaneseMbtProgression) {
  const spec = TANK_SPECS[id];
  const primary = spec.gun.shells[0];
  assert.equal(tankTier(id), tier, `${id}: intended Japanese MBT tier`);
  assert.equal(spec.hp, hp, `${id}: tier-appropriate HP`);
  assert.equal(spec.enginePowerHp, engine, `${id}: generation-specific power pack`);
  assert.equal(spec.reverseSpeedKmh, reverse, `${id}: generation-specific reverse`);
  assert.equal(spec.hullTraverseDegS, hullTraverse, `${id}: hull handling progression`);
  assert.equal(spec.turretTraverseDegS, turretTraverse, `${id}: turret handling progression`);
  assert.equal(spec.gunPitchDegS, gunPitch, `${id}: gun handling progression`);
  assert.equal(spec.gun.reloadS, reload, `${id}: canonical reload cycle`);
  assert.equal(spec.gun.autoloader?.magazineSize || 0, magazine,
    `${id}: intended magazine configuration`);
  assert.equal(spec.gun.autoloader?.intraClipS || 0, intraClip,
    `${id}: intended intra-clip cycle`);
  assert.equal(spec.gun.autoloader?.fullReloadS || reload, reload,
    `${id}: headline and full-magazine reload agree`);
  assert.equal(primary.dmg, alpha, `${id}: generation-specific kinetic damage`);
  assert.equal(primary.pen100Mm, pen100, `${id}: generation-specific close penetration`);
  assert.equal(primary.pen2000Mm, pen2000, `${id}: generation-specific long penetration`);
  assert.equal(spec.armor.hullPlates.find((plate) => plate.name === 'upper_glacis').keMm,
    glacisKe, `${id}: generation-specific glacis protection`);
  assert.equal(spec.armor.turretPlates.find((plate) => plate.name === 'turret_cheek_R').keMm,
    turretKe, `${id}: generation-specific turret protection`);
  assert.equal(garageStatGroup(spec), `${tier}/${spec.era}`,
    `${id}: garage compares the tank against its actual tier`);
}

const merkavaProgression = [
  ['merkava2b', 8, 2200, 1000, 18, 32, 6.9, 525, 794, 650, 500, 650],
  ['merkava3c', 9, 2450, 1200, 20, 36, 6.2, 540, 830, 680, 540, 700],
  ['merkava3d', 10, 2700, 1200, 20, 38, 5.9, 560, 891, 730, 600, 780],
  ['merkava4b', 10, 2800, 1500, 25, 40, 5.6, 550, 916, 750, 650, 850],
];
let previousMerkavaDpm = 0;
for (const [
  id, tier, hp, engine, reverse, traverse, reload, alpha, pen100, pen2000,
  glacisKe, turretKe,
] of merkavaProgression) {
  const spec = TANK_SPECS[id];
  const primary = spec.gun.shells[0];
  assert.equal(tankTier(id), tier, `${id}: intended progression tier`);
  assert.equal(spec.hp, hp, `${id}: tier-appropriate HP`);
  assert.equal(spec.enginePowerHp, engine, `${id}: generation-specific power pack`);
  assert.equal(spec.reverseSpeedKmh, reverse, `${id}: generation-specific reverse`);
  assert.equal(spec.hullTraverseDegS, traverse, `${id}: generation-specific handling`);
  assert.equal(spec.gun.reloadS, reload, `${id}: dedicated reload cycle`);
  assert.equal(primary.dmg, alpha, `${id}: dedicated kinetic damage`);
  assert.equal(primary.pen100Mm, pen100, `${id}: dedicated close penetration`);
  assert.equal(primary.pen2000Mm, pen2000, `${id}: dedicated long penetration`);
  assert.equal(spec.armor.hullPlates.find((plate) => plate.name === 'upper_glacis').keMm,
    glacisKe, `${id}: generation-specific glacis protection`);
  assert.equal(spec.armor.turretPlates.find((plate) => plate.name === 'turret_wedge_R').keMm,
    turretKe, `${id}: generation-specific turret protection`);
  const dpm = primary.dmg * 60 / reload;
  assert.ok(dpm > previousMerkavaDpm, `${id}: firepower progresses by generation`);
  previousMerkavaDpm = dpm;

  const local = createCombatState(spec);
  startReload(local, spec);
  assert.equal(local.maxHp, hp, `${id}: local combat consumes canonical HP`);
  assert.equal(local.reload.totalS, reload, `${id}: local combat consumes canonical reload`);
  assert.equal(penAtDistanceMm(primary, 2000), pen2000,
    `${id}: ballistics consumes canonical long-range penetration`);
  assert.equal(garageStatGroup(spec), `${tier}/${spec.era}`,
    `${id}: garage compares the tank against its actual tier`);
}

const pattonProgression = [
  // id, tier, hp, speed, reload, alpha, pen100, pen1000, pen2000
  ['m48', 8, 1950, 48, 7.2, 430, 540, 500, 450],
  ['m60a1', 8, 2050, 50, 6.8, 440, 570, 530, 480],
  ['m60a3', 8, 2200, 50, 6.4, 450, 610, 570, 520],
];
let previousPattonDpm = 0;
for (const [id, tier, hp, speed, reload, alpha, pen100, pen1000, pen2000]
  of pattonProgression) {
  const spec = TANK_SPECS[id];
  const primary = spec.gun.shells[0];
  assert.equal(tankTier(id), tier, `${id}: intended Patton tier`);
  assert.equal(spec.hp, hp, `${id}: tier-appropriate HP`);
  assert.equal(spec.topSpeedKmh, speed, `${id}: authored mobility identity`);
  assert.equal(spec.gun.reloadS, reload, `${id}: dedicated reload cycle`);
  assert.deepEqual(
    [primary.dmg, primary.pen100Mm, primary.pen1000Mm, primary.pen2000Mm],
    [alpha, pen100, pen1000, pen2000],
    `${id}: dedicated Tier VIII kinetic round`,
  );
  const dpm = primary.dmg * 60 / reload;
  assert.ok(dpm > previousPattonDpm, `${id}: family firepower progresses within Tier VIII`);
  previousPattonDpm = dpm;
  assert.equal(garageStatGroup(spec), `${tier}/${spec.era}`,
    `${id}: garage compares the tank against its Tier VIII peers`);
}

const starship = TANK_SPECS.m60a2;
const starshipHeat = starship.gun.shells.find((round) => round.guided !== true
  && round.type === 'HEAT');
const starshipMissile = starship.gun.shells.find((round) => round.guided === true);
assert.equal(tankTier('m60a2'), 9, 'Starship occupies Tier IX');
assert.equal(starship.hp, 2250, 'Starship carries a Tier IX HP pool');
assert.equal(starship.gun.reloadS, 9.6, 'Starship conventional channel keeps its deliberate cycle');
assert.deepEqual([starshipHeat.dmg, starshipHeat.pen100Mm, starshipHeat.reloadS],
  [650, 560, 9.6], 'Starship conventional HEAT-MP is the faster general-purpose channel');
assert.deepEqual(
  [starshipMissile.dmg, starshipMissile.pen100Mm, starshipMissile.reloadS],
  [780, 900, 11.5],
  'Starship Shillelagh is the slower high-penetration Tier IX channel',
);
assert.equal(garageStatGroup(starship), '9/cold-war',
  'garage compares the Starship against its Tier IX peers');

const m3a3 = TANK_SPECS.m3a3_bradley;
const m3a3Primary = m3a3.gun.shells[0];
const m3a3Missile = m3a3.gun.shells.find((round) => round.guided === true);
assert.equal(tankTier('m3a3_bradley'), 10, 'M3A3 occupies Tier X');
assert.deepEqual(
  [m3a3.hp, m3a3.gun.reloadS, m3a3Primary.dmg,
    m3a3Primary.pen100Mm, m3a3Primary.pen2000Mm],
  [2300, 0.33, 70, 185, 155],
  'M3A3 owns a Tier X scout/autocannon envelope',
);
assert.deepEqual([m3a3Missile.dmg, m3a3Missile.pen100Mm, m3a3Missile.reloadS],
  [700, 1050, 12], 'M3A3 TOW-2B is its Tier X anti-armor channel');
assert.ok(m3a3.hp < TANK_SPECS.bmpt_t90.hp,
  'M3A3 remains a lighter glass-cannon scout than the Tier X Terminator');
assert.equal(garageStatGroup(m3a3), '10/modern',
  'garage compares the M3A3 against its Tier X peers');

const authority = createAuthoritativeMatch({
  mapId: 'verdant', countdownS: 0,
  players: [
    { id: 'proryv-player', specId: 't90m_proryv', team: 'alpha' },
    { id: 'strv-player', specId: 'strv103', team: 'bravo' },
  ],
});
assert.equal(authority.entityById.get('proryv-player').combat.maxHp, proryv.hp,
  'dedicated authority consumes canonical Proryv HP');
assert.equal(authority.entityById.get('strv-player').spec.gun.shells[0].dmg, 520,
  'dedicated authority consumes canonical STRV firepower');

console.log(`fleetBalance.selftest: ${SAVED_TANK_IDS.length} saved vehicles, ` +
  `${guided.length} missiles and authoritative stat consumption passed`);
