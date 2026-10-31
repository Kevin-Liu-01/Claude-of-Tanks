import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import './tankFactory.ts';
import {
  PRODUCTION_TANK_IDS, SAVED_TANK_IDS, TANK_SPECS,
} from './specs.ts';
import { tankTier } from './tier.ts';
import { createCombatState, startReload } from '../sim/damage.ts';
import { penAtDistanceMm } from '../sim/ballistics.ts';
import { traceTank } from '../sim/armor.ts';
import { assertArmorTraceBounds, assertConvexArmorOutline } from '../sim/armorOutline.test-support.mjs';
import { createAuthoritativeMatch } from '../sim/authoritativeMatch.ts';
import { garageStatGroup } from '../ui/garageDossier.ts';
import { displayTier } from '../techTree/tiers.ts';
import {
  auditFleetBalance, FLEET_BALANCE_REVISION, sustainedPrimaryDpm,
} from './balanceAudit.ts';

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
// 252: the Garage groups a vehicle's stat bars by its shown tier (src/techTree/tiers.ts) and era; matchmaking keeps
// tankTier, which the tier assertions below still pin.
const shownGroup = (spec) => `${displayTier(spec.id)}/${spec.era}`;
assert.equal(new Set(PRODUCTION_TANK_IDS).size, PRODUCTION_TANK_IDS.length,
  'production fleet IDs are unique');
assert.ok(SAVED_TANK_IDS.length >= 150, 'the complete saved fleet is audited');

for (const id of SAVED_TANK_IDS) {
  const spec = TANK_SPECS[id];
  assert.ok(spec, `${id}: canonical spec exists`);
  assert.equal(spec.id, id, `${id}: registry key and spec ID agree`);
  assert.ok(Number.isInteger(tankTier(id)) && tankTier(id) >= 1 && tankTier(id) <= 10,
    `${id}: tier is canonical and bounded`);
  assert.ok(['light', 'medium', 'heavy', 'td', 'mbt', 'ifv', 'spg'].includes(spec.role),
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
    if (plate.convexPolygon) assertConvexArmorOutline(plate.verts, `${id}/${plate.name}`, plate.openEdges);
    else assert.equal(plate.verts?.length, 4, `${id}/${plate.name}: quad has four vertices`);
    if (plate.convexPolygon) assertArmorTraceBounds(plate.verts, plate.traceBounds, `${id}/${plate.name}`);
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
  if (spec.gun.autoloader) {
    assert.equal(spec.gun.reloadS, spec.gun.autoloader.fullReloadS,
      `${id}: headline reload and complete magazine cycle cannot disagree`);
  }
}

// Owner ruling 2026-10-03: the T-62MV-1 X keeps the transplanted 125 mm gun with its balance peer's Tier VII fire
// control (fleetRenewalSpecs), which retired the PR's pending-ruling exemption for its fire-control floor.
// 2026-10-28 (integrator 263): the two new Tier X Oplots (fire control 1.758, item/oplot-262, red on its own head
// 4310a64826) pull the modern/10/mbt median to 1.894, which leaves the Challenger 3's unchanged 2.982 at 1.575x, over
// the 1.55 ceiling (1.53x on main 262). Main ruled the Oplots' Tier X fairness "report, don't tune"; this one outlier is
// held as known until progression re-measures Tier X on the merged tree (TESTS-OWED "Integrator 263"). Nothing else.
const PENDING_TIER_X_RULING = (o) => o.id === 'challenger3' && o.metric === 'fireControl' && o.group === 'modern/10/mbt'
  && o.direction === 'high' && o.ratio < 1.6;
assert.deepEqual(auditFleetBalance(PRODUCTION_TANK_IDS, TANK_SPECS, tankTier).filter((o) => !PENDING_TIER_X_RULING(o)), [],
  'production peers have no severe survivability, firepower, mobility, or fire-control floor/ceiling outliers');
// 2026-09-23: 54 -> 50 when the m26_pershing / m45_patton / is7 / object279 notes retired with their hulls.
// 2026-10-13: 50 -> 51 with the Tier X Warrior TES(H) envelope (coordinator ruling on VEH-11).
// 2026-10-25: 51 -> 57 as the IFVs relabelled modern fold into their modern peers (KF41 Lynx, CV90 Mk IV and its concept,
// Type 89, LRMV Lynx, Borsuk; fleetBalancePass applyModernEraFold).
// 2026-10-26: 57 -> 62 as matchmaking reads the shown tier (258): five vehicles lifted over a shown-tier floor
// (applyShownTierFloors; the Centurion 5/2's entry already existed).
// 62 -> 70 (259): eight vehicles tuned for same-tier fairness at IV and VII (applySameTierFairness; seven more extend
// their entries). 70 -> 71 (262): the T-55A takes the Type 59's package.
// 71 -> 75 (262): the four new true T-64s (t64Armor.ts): the T-64BV takes the Soviet fire-control floor, the T-64B1V
// mod. 2022, the T-64BM1M and the PT-64 Tur the tier-IV same-tier footing beside the mod. 2017 (fleetBalancePass).
// 75 -> 77 (262): the new Challenger 3 TD one step under its prototype, and its field fit (fleetBalancePass).
// 77 -> 79 (263, Main's ruling): the C1 Ariete's gun face and the FV4030/6's gun slot (the Challenger 1 marks ride the
// Mk 3's turret, vickers-cr1-262, and need no slot lever).
// 79 -> 81 (263): the three Challenger 1 marks' turret front on the Mk 3's turret (the Mk 2's entry extended).
// 81 -> 106 (263, FAIRNESS-263 merged by the 264 integrator): same-tier fairness on the merged 263 fleet at I, VI, VIII
// and X (applySameTierFairness; fourteen more extend their entries), commit B's 263-build CR1 entries dropped for C1 + C2.
// 106 -> 107 (264, Main's ruling): the Leopard 2A6 UA on the 2A6's main plates, HP and cadence.
// 107 -> 111 (265 integration, pattons-m48-266): the new M48A3, Magach 3, M48A2GA2 and M48 Super take the M48A5's
// package (fleetBalancePass).
// 111 -> 117 (265 integration, centurion family 262 on 264c): the new Sho't Kal and Mk 13 share the Mk 5/2's package (fleetBalancePass);
// the Strv 105 shares it too, the Olifant Mk 2 and the Mk 5 AVRE carry their own, the Australian Mk 5/1 the Strv 81's.
// 117 -> 118 (265 integration, leopard1-263): the Leopard 1A2A1 takes its 1A5's tier I footing (applyBuildFootings).
// 118 -> 117 (265 integration, leo2a4-family-265 ca927a900a): the fourth batch's Leopard 2A3 carries the 2A3's cycle and
// 2,400 HP (+1); the rebuilt leo2_improved and leo2a4_otco drop 263's VIII mantlet entries, measured on the old builds (-2).
assert.equal(Object.keys(FLEET_BALANCE_REVISION).length, 117,
  'the fleet-wide pass keeps a reviewable per-vehicle revision ledger');
for (const id of Object.keys(FLEET_BALANCE_REVISION)) {
  assert.ok(TANK_SPECS[id], `${id}: balance revision references a saved vehicle`);
  assert.ok(sustainedPrimaryDpm(TANK_SPECS[id]) > 0,
    `${id}: revised sustained output is measurable`);
}

const challenger1_mk2 = TANK_SPECS.challenger1_mk2;
const challenger1Primary = challenger1_mk2.gun.shells[0];
assert.equal(tankTier('challenger1_mk2'), 8, 'Challenger 1 matches at its shown tier (258)');
assert.deepEqual({
  hp: challenger1_mk2.hp,
  speed: challenger1_mk2.topSpeedKmh,
  reverse: challenger1_mk2.reverseSpeedKmh,
  hullTraverse: challenger1_mk2.hullTraverseDegS,
  turretTraverse: challenger1_mk2.turretTraverseDegS,
  reload: challenger1_mk2.gun.reloadS,
  accuracy: challenger1_mk2.gun.baseAccuracy,
  aim: challenger1_mk2.gun.aimTimeS,
  alpha: challenger1Primary.dmg,
  penetration: [
    challenger1Primary.pen100Mm,
    challenger1Primary.pen1000Mm,
    challenger1Primary.pen2000Mm,
  ],
}, {
  hp: 2350,
  speed: 56,
  reverse: 20,
  hullTraverse: 32,
  turretTraverse: 32.3,
  reload: 6.7,
  accuracy: 0.263,
  aim: 1.76,
  alpha: 520,
  // 263: the marks keep the L26A1's 757 mm round (commit B's 790 mm round dropped for C1 + C2, Main 10-29)
  penetration: [757, 689, 620],
}, 'Challenger 1 owns a complete heavy Tier IX profile');
assert.equal(challenger1Primary.name, 'L26A1 CHARM-1',
  'Challenger 1 uses its own late-Cold-War kinetic round instead of the Challenger 2 donor round');
assert.equal(garageStatGroup(challenger1_mk2), shownGroup(challenger1_mk2),
  'garage compares Challenger 1 against the peers of its shown tier');

const kv2 = TANK_SPECS.kv2;
assert.equal(tankTier('kv2'), 1, 'KV-2 matches at its shown tier (258)');
assert.deepEqual({
  hp: kv2.hp,
  reverse: kv2.reverseSpeedKmh,
  hullTraverse: kv2.hullTraverseDegS,
  turretTraverse: kv2.turretTraverseDegS,
  reload: kv2.gun.reloadS,
  accuracy: kv2.gun.baseAccuracy,
  aim: kv2.gun.aimTimeS,
  shells: kv2.gun.shells.map((round) => ({
    name: round.name,
    damage: round.dmg,
    penetration: [round.pen100Mm, round.pen1000Mm],
  })),
}, {
  hp: 1250,
  reverse: 7,
  hullTraverse: 18,
  turretTraverse: 9.2,
  reload: 20.5,
  accuracy: 0.55,
  aim: 3.78,
  shells: [
    { name: 'OF-530 HE', damage: 900, penetration: [92, 92] },
    { name: 'BR-540 APHE', damage: 700, penetration: [155, 135] },
    { name: 'G-530 semi-AP', damage: 760, penetration: [130, 114] },
  ],
}, 'KV-2 owns a more usable but still deliberate 152 mm Tier VII profile');
assert.equal(garageStatGroup(kv2), shownGroup(kv2),
  'garage compares KV-2 against the peers of its shown tier');

const missileVelocityByVehicle = new Map([
  ['m2a2_bradley', 195], ['bmp2', 162.5], ['spz_puma', 117], ['spz_wotan', 240],
  ['hayate_ifv', 130], ['raiju_ifv', 210], ['cv90_mk4_concept', 240],
  ['mbt70', 208], ['fv510_milan', 130], ['m60a2', 208], ['bmp3_rok', 240.5],
  ['ua_m2a3_bradley', 195], ['bmpt_terminator2', 357.5], ['bwp1', 117],
  ['marder1a3', 130], ['m3a3_bradley', 195], ['bmp3', 240.5], ['upior', 117],
  ['bmpt_t90', 357.5], ['m551_sheridan', 208], ['m551a1_tts', 240.5],
  ['m1a3', 2050],
  ['type100', 190], // 2026-09-17: Type 100 IFV HJ-10 guided HEAT
  ['kurganets25', 240], ['warrior_tes_h', 130], ['aft10', 208], ['cv90_mk4', 210], ['k21', 130],
  ['object695', 380], ['griffin_viper', 400], ['ztz100_prototype', 320], // owner-authored missile concepts
  // 2026-09-25 IFV identity batch: MELLS and the Type 79 replica racks keep their originals' speeds; the
  // Borsuk's Spike LR is authored at 180 m/s in europePhotoIfvSpecs.ts.
  ['puma_s1', 240], ['type89', 210], ['borsuk', 180],
  ['m6_linebacker', 750], // 2026-10-04: the compact-pod M6 Linebacker's FIM-92 Stinger
]);
const guided = [];
const additionalMissileVelocityByWeapon = new Map([
  ['kurganets25/Bulat guided missile', 240],
  ['object695/9M-695 Blast', 380], ['ztz100_prototype/HJ-P9 Blast', 320],
]);
for (const id of SAVED_TANK_IDS) {
  for (const round of TANK_SPECS[id].gun.shells) {
    if (round.guided === true) guided.push({ id, round });
  }
}
assert.equal(guided.length, missileVelocityByVehicle.size + additionalMissileVelocityByWeapon.size,
  'every saved guided weapon has an explicit vehicle- or additional-channel-owned speed');
for (const { id, round } of guided) {
  const expected = additionalMissileVelocityByWeapon.get(`${id}/${round.name}`) ?? missileVelocityByVehicle.get(id);
  assert.equal(round.velocityMps, expected,
    `${id}: missile speed is authored individually`);
  assert.equal(Object.hasOwn(round, 'authoredVelocityMps'), false,
    `${id}: no hidden global multiplier metadata`);
}

const siegeLine = [
  ['udes03', 1, 1400, 430, 315, 90],
  ['strv103a', 2, 1850, 480, 345, 180],
  ['strv103b', 2, 2400, 520, 380, 220],
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
  // VH.14 (2026-10-15): the UDES 03's hull MG is a working station; its roofGun module rides the gun (roofGunFollow)
  assert.ok(spec.armor.modules.every((box) => box.roofGunFollow || box.turretLocal === false),
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
  // 259: centre mass is the hull's own, the middle of its closed shell's height (the generic wedge's 0.9 m grazed the
  // 103A's beak underside once its measured loft raised the beak to 1.26-1.50 m), and the wedge is the first plate met.
  // Until 259 the fixed gun was hull shell: the barrel was plated as glacis to the muzzle, the zones were stretched to
  // it, and the 103A's nose took a 1 cm sliver and side-armour faces (it met the wedge only through a gap mid-hull).
  const shell = spec.armor.collisionShells.hull;
  const shellY = shell.flatMap((cell) => [cell.min[1], cell.max[1]]);
  const centreY = (Math.min(...shellY) + Math.max(...shellY)) / 2;
  const headOn = traceTank(new Vector3(0, centreY, 10), new Vector3(0, centreY, -10),
    pose, spec.armor);
  assert.equal(headOn.find((hit) => hit.kind === 'plate')?.plate.name, 'upper_glacis',
    `${id}: center-mass shot meets the visible wedge first`);
  const noseZ = Math.max(...shell.map((cell) => cell.max[2]));
  const gunY = spec.armor.gunPivot[1];
  assert.deepEqual(traceTank(new Vector3(-4, gunY, noseZ + 0.6), new Vector3(4, gunY, noseZ + 0.6), pose, spec.armor)
    .filter((hit) => hit.kind === 'plate').map((hit) => hit.plate.name), [],
  `${id}: the fixed gun ahead of the nose is the gun, not hull armour`);
  const side = traceTank(new Vector3(6, 0.95, 0), new Vector3(-6, 0.95, 0),
    pose, spec.armor);
  const sideArmor = side.find((hit) => hit.kind === 'plate'
    && /^hull_side_(?:upper|lower)_[RL]$/.test(hit.plate.name));
  assert.ok(sideArmor?.collisionFace,
    `${id}: side shot meets an exact low-hull collision face instead of a donor box`);
}

const retainedT90M = TANK_SPECS.t90am;
const proryv = TANK_SPECS.t90m_proryv;
assert.deepEqual({
  hp: proryv.hp,
  reverse: proryv.reverseSpeedKmh,
  reload: proryv.gun.reloadS,
  alpha: proryv.gun.shells[0].dmg,
  pen100: proryv.gun.shells[0].pen100Mm,
  pen2000: proryv.gun.shells[0].pen2000Mm,
}, { hp: 2900, reverse: 14, reload: 6.1, alpha: 560, pen100: 880, pen2000: 740 },
'Proryv owns its complete tier-X assault profile');
assert.equal(retainedT90M.hp, 2700, 'the retained tier-IX T-90M keeps its established combat profile');
assert.equal(proryv.armor.hullPlates.find((plate) => plate.name === 'upper_glacis').keMm, 588,
  'Proryv composite glacis is hardened');
assert.equal(proryv.armor.turretPlates.find((plate) => plate.name === 'turret_cheek_R').keMm,
  735, 'Proryv turret cheek is hardened');
assert.equal(proryv.armor.turretPlates.find((plate) => plate.name === 'turret_era_R')
  .era.ceFlatMm, 600, 'Proryv Relikt package is hardened');

const localProryv = createCombatState(proryv);
startReload(localProryv, proryv);
assert.equal(localProryv.reload.totalS, 6.1,
  'local reload consumes the exact Proryv gun cycle');
assert.equal(penAtDistanceMm(proryv.gun.shells[0], 2000), 740,
  'ballistics consumes the exact authored long-range penetration');
assert.equal(garageStatGroup(proryv), shownGroup(proryv),
  'garage normalizes Proryv against the peers of its shown tier');
assert.equal(garageStatGroup(retainedT90M), shownGroup(retainedT90M),
  'garage normalizes the retained T-90M against the peers of its shown tier');
assert.equal(garageStatGroup(TANK_SPECS.strv103a), shownGroup(TANK_SPECS.strv103a),
  'garage normalizes the 103A against its Cold War peers of its shown tier');

const japaneseMbtProgression = [
  // 263 (FAIRNESS-263): the Type 90 family's clip cycles 9 s (the Kyū-maru, 2,450 HP) and 8.5 s (the 90A) at VIII
  ['type90_kyumaru', 8, 2450, 1550, 34, 52.8, 46.6, 30, 9, 3, 2.2, 500, 806, 660, 120, 600],
  ['type90a', 8, 2400, 1500, 30, 50.6, 44.5, 34, 8.5, 3, 2.0, 510, 855, 700, 134, 672],
  ['type10_tk_x', 9, 2550, 1200, 35, 52.8, 48.8, 36, 5.2, 0, 0, 540, 891, 730, 134, 672],
  ['type10b', 9, 2700, 1200, 45, 55, 50.9, 40, 5.2, 0, 0, 540, 900, 740, 145, 726],
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
  assert.equal(garageStatGroup(spec), shownGroup(spec),
    `${id}: garage compares the tank against the peers of its shown tier`);
}

const merkavaProgression = [
  // 258: the shown tiers; the Mk 2B's engine lifted over its shown-tier mobility floor (applyShownTierFloors)
  ['merkava2b', 3, 2200, 1060, 18, 30.4, 6.9, 525, 794, 650, 500, 650],
  // 235: the Merkava 3C's true (unsquashed) wedge slope stops more of a frontal round, so its wedge plates carry less
  // (fleetBalancePass TURRET_FRONT_COMPENSATION x0.852 keeps its frontal protection where it was)
  ['merkava3c', 8, 2450, 1200, 20, 34.2, 6.2, 540, 830, 680, 540, 596],
  ['merkava3_baz', 8, 2500, 1200, 20, 36.1, 6.2, 560, 830, 680, 600, 780],
  ['merkava4b', 9, 2550, 1500, 25, 38, 6.5, 520, 794, 650, 650, 850],
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
  assert.ok(dpm >= previousMerkavaDpm * .88,
    `${id}: same-tier reorganization keeps firepower inside the family progression band`);
  previousMerkavaDpm = dpm;

  const local = createCombatState(spec);
  startReload(local, spec);
  assert.equal(local.maxHp, hp, `${id}: local combat consumes canonical HP`);
  assert.equal(local.reload.totalS, reload, `${id}: local combat consumes canonical reload`);
  assert.equal(penAtDistanceMm(primary, 2000), pen2000,
    `${id}: ballistics consumes canonical long-range penetration`);
  assert.equal(garageStatGroup(spec), shownGroup(spec),
    `${id}: garage compares the tank against the peers of its shown tier`);
}

const pattonProgression = [
  // id, tier, hp, speed, reload, alpha, pen100, pen1000, pen2000
  ['m48a5_patton', 1, 2050, 50, 7, 450, 580, 535, 490],
  ['m60a1', 1, 2100, 52, 6.8, 440, 570, 530, 480],
  // 263 (FAIRNESS-263): the M60A3 takes the M60A1's 2,100 HP and a 6.8 s cycle at I; its firepower still leads the family
  ['m60a3', 1, 2100, 50, 6.8, 450, 610, 570, 520],
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
  assert.equal(garageStatGroup(spec), shownGroup(spec),
    `${id}: garage compares the tank against the peers of its shown tier`);
}

const starship = TANK_SPECS.m60a2;
const starshipHeat = starship.gun.shells.find((round) => round.guided !== true
  && round.type === 'HEAT');
const starshipMissile = starship.gun.shells.find((round) => round.guided === true);
assert.equal(tankTier('m60a2'), 2, 'Starship matches at its shown tier (258)');
assert.equal(starship.hp, 2250, 'Starship carries a Tier IX HP pool');
assert.equal(starship.gun.reloadS, 9, 'Starship conventional channel keeps its deliberate cycle');
assert.deepEqual([starshipHeat.dmg, starshipHeat.pen100Mm, starshipHeat.reloadS],
  [650, 560, 9], 'Starship conventional HEAT-MP is the faster general-purpose channel');
assert.deepEqual(
  [starshipMissile.dmg, starshipMissile.pen100Mm, starshipMissile.reloadS],
  [720, 875, 3],
  'Starship Shillelagh is the high-penetration independent launcher channel',
);
assert.equal(garageStatGroup(starship), shownGroup(starship),
  'garage compares the Starship against the peers of its shown tier');

const m3a3 = TANK_SPECS.m3a3_bradley;
const m3a3Primary = m3a3.gun.shells[0];
const m3a3Missile = m3a3.gun.shells.find((round) => round.guided === true);
assert.equal(tankTier('m3a3_bradley'), 5, 'M3A3 matches at its shown tier (258)');
assert.deepEqual(
  [m3a3.hp, m3a3.gun.reloadS, m3a3Primary.dmg,
    m3a3Primary.pen100Mm, m3a3Primary.pen2000Mm],
  [2300, 0.33, 70, 185, 155],
  'M3A3 owns a Tier X scout/autocannon envelope',
);
assert.deepEqual([m3a3Missile.dmg, m3a3Missile.pen100Mm, m3a3Missile.reloadS],
  [700, 1050, 2.8], 'M3A3 TOW-2B is its independent Tier X anti-armor channel');
assert.ok(m3a3.hp < TANK_SPECS.bmpt_t90.hp,
  'M3A3 remains a lighter glass-cannon scout than the Tier X Terminator');
assert.equal(garageStatGroup(m3a3), shownGroup(m3a3),
  'garage compares the M3A3 against the peers of its shown tier');

const authority = createAuthoritativeMatch({
  mapId: 'verdant', countdownS: 0,
  players: [
    { id: 'proryv-player', specId: 't90m_proryv', team: 'alpha' },
    { id: 'strv-player', specId: 'strv103b', team: 'bravo' },
  ],
});
assert.equal(authority.entityById.get('proryv-player').combat.maxHp, proryv.hp,
  'dedicated authority consumes canonical Proryv HP');
assert.equal(authority.entityById.get('strv-player').spec.gun.shells[0].dmg, 520,
  'dedicated authority consumes canonical STRV firepower');

console.log(`fleetBalance.selftest: ${SAVED_TANK_IDS.length} saved vehicles, ` +
  `${guided.length} missiles and authoritative stat consumption passed`);
