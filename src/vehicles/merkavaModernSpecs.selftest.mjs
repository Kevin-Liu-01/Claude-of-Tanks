import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createTank, ensureTankBuilders, isTankBuilderReady } from './fleetFactory.ts';
import { ALL_TANK_IDS, MODEL_SOURCE, TANK_SPECS } from './specs.ts';
import { MERKAVA_MODERN_IDS } from './merkavaModernSpecs.ts';
import { FLEET_GROUP_BY_ID, FLEET_GROUP_IDS } from './fleetManifest.ts';
import { applyNativeFamilyOrder, NATIVE_FAMILY_ORDER } from './fleetOrder.ts';
import { internalLayoutFor } from './internalLayoutRegistry.ts';
import { tankTier } from './tier.ts';
import { vehicleEraForId } from './taxonomy.ts';

const expectedIds = ['merkava4_trophy', 'merkava4_barak', 'namer_ifv'];
assert.deepEqual(MERKAVA_MODERN_IDS, expectedIds);
assert.deepEqual(FLEET_GROUP_IDS.merkavaX.slice(-3), expectedIds);

for (const id of expectedIds) {
  assert.equal(ALL_TANK_IDS.filter((candidate) => candidate === id).length, 1,
    `${id}: exactly one selectable registration`);
  assert.equal(FLEET_GROUP_BY_ID[id], 'merkavaX', `${id}: exact lazy family`);
  assert.equal(MODEL_SOURCE[id].source, 'procedural', `${id}: first-party runtime source`);
  assert.equal(vehicleEraForId(id), 'modern', `${id}: canonical era`);
  assert.equal(TANK_SPECS[id].visual.scheme, 'solid', `${id}: solid Sinai finish`);
  assert.equal(TANK_SPECS[id].visual.base, '#6f7566', `${id}: Sinai gray base`);
  assert.deepEqual(TANK_SPECS[id].visual.patches, [], `${id}: no camouflage patches`);
  assert.equal(isTankBuilderReady(id), false, `${id}: metadata import stays boot-light`);
}

const trophy = TANK_SPECS.merkava4_trophy;
const barak = TANK_SPECS.merkava4_barak;
for (const spec of [trophy, barak]) {
  assert.deepEqual(
    [spec.enginePowerHp, spec.weightTons, spec.topSpeedKmh],
    [1500, 65, 64],
    `${spec.id}: Mk 4 powertrain`,
  );
  assert.deepEqual(spec.gun.shells.map((round) => round.name),
    ['M338 APFSDS-T', 'M325 HEAT-MP-T', 'M339 HE-MP-T']);
  assert.deepEqual(
    spec.gun.shells.map((round) => [round.pen100Mm, round.pen1000Mm, round.pen2000Mm, round.dmg]),
    [[900, 820, 740, 550], [680, 680, 680, 510], [45, 45, 45, 620]],
    `${spec.id}: canonical M338/M325/M339 balance`,
  );
  assert.equal(tankTier(spec.id), 10, `${spec.id}: tier X`);
  assert.equal(internalLayoutFor(spec.id).layoutKey, 'merkava');
}
assert.equal(barak.gun.shells[0].dmg, trophy.gun.shells[0].dmg,
  'Barak handling does not buy higher alpha');
assert.equal(barak.gun.reloadS, trophy.gun.reloadS,
  'Barak handling does not buy a faster damage cycle');
assert.ok(barak.gun.baseAccuracy < trophy.gun.baseAccuracy, 'Barak aims more accurately');
assert.ok(barak.gun.aimTimeS < trophy.gun.aimTimeS, 'Barak aims faster');
assert.ok(barak.gun.bloom.move < trophy.gun.bloom.move, 'Barak has better moving dispersion');
assert.ok(barak.hullTraverseDegS > trophy.hullTraverseDegS, 'Barak turns more responsively');

const namer = TANK_SPECS.namer_ifv;
assert.equal(tankTier('namer_ifv'), 9);
assert.equal(namer.role, 'ifv');
assert.equal(namer.balanceCohort, 'heavy-survivability',
  'Namer does not redefine scout-IFV mobility medians');
assert.deepEqual(
  [namer.enginePowerHp, namer.weightTons, namer.topSpeedKmh, namer.hp, namer.turretTraverseDegS],
  [1200, 63.5, 54, 2650, 60],
  'Namer keeps its heavy protected-carrier mobility tradeoff',
);
assert.equal(namer.gun.caliberMm, 30);
assert.equal(namer.gun.reloadS, 0.35);
assert.equal(namer.gun.shells.length, 2, 'Namer exposes only its 30 mm belts');
assert.ok(namer.gun.shells.every((round) => round.caliberMm === 30 && round.count === 200));
assert.deepEqual(
  namer.gun.shells.map((round) => [round.pen100Mm, round.pen1000Mm, round.pen2000Mm, round.dmg]),
  [[180, 164, 148, 70], [12, 12, 12, 80]],
);
assert.equal(namer.gun.shells.some((round) => round.guided), false, 'Namer has no invented missile');
const namerLayout = internalLayoutFor('namer_ifv');
assert.equal(namerLayout.layoutKey, 'namerIfv');
assert.deepEqual(namerLayout.crew.map(({ role, frame }) => [role, frame]),
  [['driver', 'hull'], ['gunner', 'hull'], ['commander', 'hull']],
  'Namer keeps all three crew below its unmanned weapon station');
assert.equal(namerLayout.systems.ammoRack.placement, 'turret');
assert.equal(namerLayout.systems.missileRack, null);

assert.deepEqual(
  ['merkava3d', 'merkava3d_x', 'merkava4', 'merkava4_x', 'merkava4b'].map(tankTier),
  [9, 9, 9, 9, 9],
  'Mk 3D and baseline Mk 4 identities stay at tier IX',
);
for (const id of ['merkava3d', 'merkava3d_x']) {
  const spec = TANK_SPECS[id];
  assert.deepEqual([spec.hp, spec.gun.reloadS, spec.gun.baseAccuracy, spec.gun.aimTimeS],
    [2500, 6.2, 0.29, 1.7], `${id}: Tier-IX Mk 3D balance envelope`);
  assert.deepEqual(spec.gun.shells.slice(0, 1).map((round) =>
    [round.pen100Mm, round.pen1000Mm, round.pen2000Mm, round.dmg]),
  [[830, 755, 680, 560]], `${id}: Tier-IX M322 gameplay row`);
}
for (const id of ['merkava4', 'merkava4_x', 'merkava4b']) {
  const spec = TANK_SPECS[id];
  assert.deepEqual([spec.hp, spec.gun.reloadS, spec.gun.baseAccuracy, spec.gun.aimTimeS],
    [2550, 6.5, 0.31, 1.9], `${id}: common baseline Mk 4 balance envelope`);
}

const reversed = applyNativeFamilyOrder([...ALL_TANK_IDS].reverse());
const israel = NATIVE_FAMILY_ORDER.israel.filter((id) => reversed.includes(id));
const indexes = israel.map((id) => reversed.indexOf(id));
assert.deepEqual(indexes, indexes.slice().sort((a, b) => a - b), 'Israeli lineage order');
for (let index = 1; index < indexes.length; index += 1) {
  assert.equal(indexes[index], indexes[index - 1] + 1, 'Israeli lineage remains contiguous');
}
assert.deepEqual(israel.map(tankTier), israel.map(tankTier).sort((a, b) => a - b),
  'Israeli garage progression is tier-monotonic; Namer stays before the Tier-X Mk.4 configurations');

const lazy = readFileSync(new URL('./fleetFactory.ts', import.meta.url), 'utf8');
const eager = readFileSync(new URL('./profiledProcedurals.ts', import.meta.url), 'utf8');
const metadata = readFileSync(new URL('./merkavaModernSpecs.ts', import.meta.url), 'utf8');
assert.match(lazy, /merkavaX:.*import\('\.\/profiles\/merkavaX\.ts'\)/,
  'browser path demand-loads the existing exact family');
assert.match(eager, /\.\.\.MERKAVA_X_PROFILES/,
  'eager audits consume the same exact profile table');
assert.doesNotMatch(metadata, /from ['"].*(?:profiles\/|three|\.glb|\.obj)/,
  'combat metadata stays boot-light');

await ensureTankBuilders(expectedIds);
for (const id of expectedIds) assert.equal(isTankBuilderReady(id), true, `${id}: exact family loaded`);
const trophyVisual = createTank('merkava4_trophy', null,
  { proceduralOnly: true, geometryReceipt: true, quality: 'low' });
assert.equal(trophyVisual.root.getObjectByName('rig_turret')?.userData?.trophySuiteReceipt?.configuration,
  'mk4', 'Trophy ID dispatches to its exact Mk 4 suite');
trophyVisual.dispose();
const barakVisual = createTank('merkava4_barak', null,
  { proceduralOnly: true, geometryReceipt: true, quality: 'low' });
assert.equal(barakVisual.root.getObjectByName('rig_turret')?.userData?.trophySuiteReceipt?.configuration,
  'barak', 'Barak keeps Trophy protection');
assert.equal(barakVisual.root.getObjectByName('rig_turret')?.userData?.barakSensorReceipt?.ironVisionCameraClusters,
  4, 'Barak dispatches to its sensor-aware exact build');
barakVisual.dispose();
const namerVisual = createTank('namer_ifv', null,
  { proceduralOnly: true, geometryReceipt: true, quality: 'low' });
assert.deepEqual({ ...namerVisual.root.getObjectByName('rig_hull')?.userData?.namerLayoutReceipt },
  { crew: 3, dismounts: 8, rearRamp: true, unmannedTurret: true, missiles: false },
  'Namer dispatches to its exact heavy-IFV build');
namerVisual.dispose();

console.log('merkavaModernSpecs: exact lazy/eager family parity, tiers, Sinai finish, Mk 4 ammunition/handling, and gun-only heavy Namer IFV PASS');
