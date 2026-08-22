import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import './tankFactory.js';
import {
  PRODUCTION_TANK_IDS, SAVED_TANK_IDS, TANK_SPECS,
} from './specs.js';
import { tankTier } from './tier.js';
import { createCombatState, startReload } from '../sim/damage.js';
import { penAtDistanceMm } from '../sim/ballistics.js';
import { traceTank } from '../sim/armor.js';
import { createAuthoritativeMatch } from '../sim/authoritativeMatch.js';
import { garageStatGroup } from '../ui/garageDossier.js';

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
  ['bmpt_t90', 357.5],
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
  assert.ok(side.some((hit) => hit.kind === 'plate' && /hull_side_upper/.test(hit.plate.name)),
    `${id}: side shot meets the low hull instead of a donor box`);
}

const proryv = TANK_SPECS.t90m;
assert.deepEqual({
  hp: proryv.hp,
  reverse: proryv.reverseSpeedKmh,
  reload: proryv.gun.reloadS,
  alpha: proryv.gun.shells[0].dmg,
  pen100: proryv.gun.shells[0].pen100Mm,
  pen2000: proryv.gun.shells[0].pen2000Mm,
}, { hp: 2700, reverse: 12, reload: 6.4, alpha: 560, pen100: 855, pen2000: 720 },
'Proryv owns its complete tier-X assault profile');
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
assert.equal(garageStatGroup(TANK_SPECS.strv103a), '9/cold-war',
  'garage normalizes the 103A against its Cold War tier peers');

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

const authority = createAuthoritativeMatch({
  mapId: 'verdant', countdownS: 0,
  players: [
    { id: 'proryv-player', specId: 't90m', team: 'alpha' },
    { id: 'strv-player', specId: 'strv103', team: 'bravo' },
  ],
});
assert.equal(authority.entityById.get('proryv-player').combat.maxHp, proryv.hp,
  'dedicated authority consumes canonical Proryv HP');
assert.equal(authority.entityById.get('strv-player').spec.gun.shells[0].dmg, 520,
  'dedicated authority consumes canonical STRV firepower');

console.log(`fleetBalance.selftest: ${SAVED_TANK_IDS.length} saved vehicles, ` +
  `${guided.length} missiles and authoritative stat consumption passed`);
