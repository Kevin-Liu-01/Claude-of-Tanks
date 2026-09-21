import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { traceTank, tankPoseFromState } from '../sim/armor.ts';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import './fleetFactory.ts';
import { ALL_TANK_IDS, PRODUCTION_TANK_IDS, TANK_SPECS, MODEL_SOURCE } from './specs.ts';
import { SECOND_WAVE_X_IDS, synchronizeSecondWaveXCombatMetadata } from './sourceXSecondWaveSpecs.ts';
import { ARIETE_C1_X_DATUMS as C1, ARIETE_C2_X_DATUMS as C2, ARIETE_X_FAMILY_SCALE } from './profiles/arieteXFamilyFrame.ts';
import { arieteC2ArmorFaces, ARIETE_C2_ARMOR_STOCKS } from './profiles/arieteC2XArmor.ts';
import { assertConvexArmorOutline } from '../sim/armorOutline.test-support.mjs';
import { FLEET_GROUP_BY_ID, FLEET_GROUP_IDS } from './fleetManifest.ts';
import { tankTier } from './tier.ts';
import { internalLayoutFor } from './internalLayoutRegistry.ts';
import { defaultCamoPatternId } from './camoPolicy.ts';
import { getCamoSelection, setCamoSelection, resolveCamoVisual } from './materials.ts';
import { compareCountryThenTierThenName } from '../ui/garageOrder.ts';
import { auditFleetBalance, sustainedPrimaryDpm } from './balanceAudit.ts';

// Authenticated before-registration browser metadata. Only the two requested
// public names/label records may change; legacy combat/appearance/rig is exact.
const prior = {
  ariete: '8a5e687dce100031420347a5b3040a96921b27f5e176c9bf64140acee7530cba',
  ariete_c1: 'f1af9b6b091cecfc475fc308dc3eb8751b698fa9ee034f79aaa943fdfb4d0ab6',
  ariete_c2: '8df926ae1073dfd29013eb8deebc13064f970f7c9a05a46c3b393e1879fde486',
  carro45t: 'dce6f1af271554a63326ef85966d8de6e907cb1958f018cc31d2966b319856fb',
};
for (const [id, hash] of Object.entries(prior)) {
  const preserved = structuredClone(TANK_SPECS[id]);
  delete preserved.name; delete preserved.label;
  assert.equal(createHash('sha256').update(JSON.stringify(preserved)).digest('hex'), hash,
    `${id}: all non-label saved metadata remains exact`);
}
assert.equal(TANK_SPECS.ariete_c1.name, 'C1 Ariete Prototype (Serie 1)');
assert.equal(TANK_SPECS.ariete_c2.name, 'C2 Ariete Prototype');
assert.equal(tankTier('ariete_c1'), 9);
assert.equal(tankTier('ariete_c2'), 10);
assert.equal(SECOND_WAVE_X_IDS.length, 23);
assert.ok(!SECOND_WAVE_X_IDS.includes('ariete_c2_x'), 'new C2 is not inserted into the historical source wave');
assert.deepEqual(FLEET_GROUP_IDS.arieteX, ['ariete_c1_x', 'ariete_c2_x']);

assert.equal(ARIETE_X_FAMILY_SCALE, 1.12 * 1.10, 'fixed owner-directed enlargement');
const c1 = TANK_SPECS.ariete_c1_x, c2 = TANK_SPECS.ariete_c2_x;
for (const [spec, datums, tier] of [[c1, C1, 10], [c2, C2, 10]]) {
  assert.equal(ALL_TANK_IDS.filter(id => id === spec.id).length, 1);
  assert.ok(PRODUCTION_TANK_IDS.includes(spec.id));
  assert.equal(tankTier(spec.id), tier);
  assert.equal(FLEET_GROUP_BY_ID[spec.id], 'arieteX');
  assert.equal(spec.era, 'modern'); assert.equal(spec.role, 'mbt');
  assert.equal(MODEL_SOURCE[spec.id].source, 'procedural');
  assert.equal(spec.community, undefined); assert.equal(spec.publicVisualFallback, undefined);
  assert.deepEqual(spec.dims, datums.dims);
  assert.deepEqual(spec.armor.turretPivot, datums.turretPivot);
  assert.deepEqual(spec.armor.gunPivot, datums.trunnion.map((v, i) => v - datums.turretPivot[i]));
  assert.ok(Math.abs(spec.armor.gunBarrel.lengthM - (datums.muzzleZ - datums.trunnion[2])) < 1e-12);
  assert.equal(spec.armor.gunBarrel.radiusM, datums.barrelRadiusM);
  assert.equal(spec.visual.trackWidthM, datums.trackWidthM);
  assert.equal(spec.gun.caliberMm, 120);
  assert.equal(spec.gun.autoloader, undefined);
  assert.ok(!spec.gun.shells.some(s => s.guided || s.launcherTubes));
  assert.equal(spec.armor.hullPlates.concat(spec.armor.turretPlates).filter(p => p.era).length, spec.id === 'ariete_c2_x' ? 20 : 0);
  assert.equal(spec.gunDepressionDeg, 9); assert.equal(spec.gunElevationDeg, 20);
  assert.equal(internalLayoutFor(spec.id).layoutKey, 'arieteManual');
  assert.equal(internalLayoutFor(spec.id).crew.length, 4);
}
assert.equal(c2.variantOf, 'ariete_c1_x');
assert.equal(c2.balancePeerOf, undefined);
assert.equal(c2.enginePowerHp, 1500);
assert.ok(c2.enginePowerHp / c2.weightTons > c1.enginePowerHp / c1.weightTons);
for (const key of ['hp', 'topSpeedKmh', 'reverseSpeedKmh', 'turretTraverseDegS']) assert.ok(c2[key] > c1[key]);
for (const key of ['reloadS', 'baseAccuracy', 'aimTimeS']) assert.ok(c2.gun[key] < c1.gun[key]);
for (const key of ['move', 'hullRot', 'turret']) assert.ok(c2.gun.bloom[key] < c1.gun.bloom[key]);
assert.deepEqual(c2.gun.shells, c1.gun.shells, 'all three main-gun rounds retained; decorative roof weapon adds no ammunition');
assert.ok(sustainedPrimaryDpm(c2) / sustainedPrimaryDpm(c1) > 1.09);
assert.ok(sustainedPrimaryDpm(c2) / sustainedPrimaryDpm(c1) < 1.10);
assert.deepEqual(auditFleetBalance(PRODUCTION_TANK_IDS, TANK_SPECS, tankTier)
  .filter(row => row.id === 'ariete_c2_x'), [], 'new upgrade remains within the unmodified peer gates');

function assertUpgradeFaces(spec) {
  const expected = arieteC2ArmorFaces();
  const actual = spec.armor.hullPlates.concat(spec.armor.turretPlates)
    .filter(p => p.surfaceGroup?.startsWith('ariete_c2_x:'));
  assert.equal(actual.length, expected.length);
  for (const face of expected) {
    const plates = face.owner === 'hull' ? spec.armor.hullPlates : spec.armor.turretPlates;
    const plate = plates.find(p => p.name === face.name);
    assert.ok(plate); assert.deepEqual(plate.verts, face.verts);
    assertConvexArmorOutline(plate.verts, plate.name);
    assert.equal(plate.kind, 'spaced'); assert.equal(plate.era, null);
  }
  assert.equal(new Set(actual.map(p => p.surfaceGroup)).size, ARIETE_C2_ARMOR_STOCKS.length);
}
assertUpgradeFaces(c2);
const missing = structuredClone(c2);
missing.armor.turretPlates = missing.armor.turretPlates.filter((p,i,a)=>i!==a.findIndex(p=>p.surfaceGroup?.startsWith('ariete_c2_x:')));
assert.throws(() => assertUpgradeFaces(missing), 'missing actual pack face must fail');
const shifted = structuredClone(c2);
shifted.armor.hullPlates.find(p => p.surfaceGroup?.startsWith('ariete_c2_x:')).verts[0][0] += .1;
assert.throws(() => assertUpgradeFaces(shifted), 'floating damage cover must fail');
// Acquire the same generated calibration registration/finalization used by
// native release consumers only after the boot-light metadata checks above.
await import('./tankFactory.ts');

// Actual runtime traces use the whole registered armor model. These sparse
// stations are independent scalar witnesses, not polygons copied from the
// face exporter: every closed pack, both approach directions, real gaps and
// yaw frames must resolve correctly.
const yawAxis = new Vector3(0, 1, 0);
let runtimeTraceCount = 0;
function posedPoint(raw, owner, yaw) {
  const point = new Vector3(...raw).multiplyScalar(ARIETE_X_FAMILY_SCALE);
  if (owner === 'turret') point.sub(new Vector3(...C2.turretPivot))
    .applyAxisAngle(yawAxis, yaw).add(new Vector3(...C2.turretPivot));
  return point;
}
function packTrace(armor, from, to, owner, yaw) {
  runtimeTraceCount++;
  const pose = tankPoseFromState({ pos: new Vector3(), yaw: 0, visualPitch: 0,
    visualRoll: 0, turretYaw: yaw, gunPitch: 0 });
  return traceTank(posedPoint(from, owner, yaw), posedPoint(to, owner, yaw), pose, armor)
    .filter(hit => hit.kind === 'plate' && hit.plate.surfaceGroup?.startsWith('ariete_c2_x:'));
}
function assertPack(armor, group, from, to, entry, owner, yaw) {
  const hits = packTrace(armor, from, to, owner, yaw).filter(hit => hit.plate.surfaceGroup === group);
  assert.equal(hits.length, 1, `${group}/${yaw}: closed stock is charged once, not entry plus exit`);
  assert.ok(hits[0].point.distanceTo(posedPoint(entry, owner, yaw)) < 4e-6,
    `${group}/${yaw}: actual tracer reaches the independently specified physical face`);
  assert.equal(hits[0].impactFrame, owner);
}
for (const yaw of [0, .63, -1.17, Math.PI]) {
  for (const side of [-1, 1]) {
    for (const [index, [rear, front]] of [[-2.60, -1.89], [-1.87, -1.16], [-1.14, -.43]].entries()) {
      const z = (rear + front) / 2, group = `ariete_c2_x:pso_skirt_${side}_${index}`;
      assertPack(c2.armor, group, [side * 2, .85, z], [side * 1.4, .85, z],
        [side * 1.805, .85, z], 'hull', yaw);
      // Inner wall is sloped: x=1.514 + (1.08-.85)*.04/.50.
      assertPack(c2.armor, group, [side * 1.4, .85, z], [side * 2, .85, z],
        [side * 1.5324, .85, z], 'hull', yaw);
      for (const end of [rear - .002, front + .002]) assert.equal(
        packTrace(c2.armor, [side * 2, .85, end], [side * 1.4, .85, end], 'hull', yaw).length, 0,
        'PSO damage must end at each finite panel edge');
      for (const y of [.578, 1.362]) assert.equal(
        packTrace(c2.armor, [side * 2, y, z], [side * 1.4, y, z], 'hull', yaw).length, 0,
        'PSO damage must leave air above and below the actual panel');
    }
    for (const [index, [rear, front]] of [[.15, .55], [.57, .97]].entries()) {
      const z = (rear + front) / 2, group = `ariete_c2_x:war_cheek_${side}_${index}`;
      assertPack(c2.armor, group, [side * 1.8, 1.7, z], [side * 1.3, 1.7, z],
        [side * 1.6, 1.7, z], 'turret', yaw);
      assertPack(c2.armor, group, [side * 1.3, 1.7, z], [side * 1.8, 1.7, z],
        [side * 1.429, 1.7, z], 'turret', yaw);
      for (const end of [rear - .002, front + .002]) assert.equal(
        packTrace(c2.armor, [side * 1.8, 1.7, end], [side * 1.3, 1.7, end], 'turret', yaw).length, 0,
        'WAR damage must end at each finite cheek edge');
      for (const y of [1.488, 2.037]) assert.equal(
        packTrace(c2.armor, [side * 1.8, y, z], [side * 1.3, y, z], 'turret', yaw).length, 0,
        'WAR damage must leave air above and below the actual cheek');
    }
    for (const z of [-1.88, -1.15]) assert.equal(
      packTrace(c2.armor, [side * 2, .85, z], [side * 1.4, .85, z], 'hull', yaw).length, 0,
      'actual 22.4 mm installed PSO inter-panel gaps remain unarmored');
    assert.equal(packTrace(c2.armor, [side * 1.8, 1.7, .56], [side * 1.3, 1.7, .56], 'turret', yaw).length, 0,
      'actual 22.4 mm installed WAR gap remains unarmored while yawing');
  }
  assertPack(c2.armor, 'ariete_c2_x:mine_belly', [0, .25, 0], [0, .5, 0], [0, .366, 0], 'hull', yaw);
  assertPack(c2.armor, 'ariete_c2_x:mine_belly', [0, .5, 0], [0, .25, 0], [0, .407, 0], 'hull', yaw);
  for (const z of [-2.602, 2.502]) assert.equal(
    packTrace(c2.armor, [0, .25, z], [0, .5, z], 'hull', yaw).length, 0, 'belly plate finite ends');
  for (const x of [-.832, .832]) assert.equal(
    packTrace(c2.armor, [x, .25, 0], [x, .5, 0], 'hull', yaw).length, 0, 'belly plate finite sides');
}
// At the real lower bevel/side junction both outward faces are front-facing
// and intersect at one point. Removing the actual group must double the hit;
// simply counting closed-box entry faces would not exercise this contract.
const edge = [1.805, .61, -2.25];
const edgeFrom = edge.map((v, i) => v + [ .05, -.015, 0 ][i]);
const edgeTo = edge.map((v, i) => v - [ .05, -.015, 0 ][i]);
assertPack(c2.armor, 'ariete_c2_x:pso_skirt_1_0', edgeFrom, edgeTo, edge, 'hull', 0);
const noGroup = structuredClone(c2.armor);
for (const plate of noGroup.hullPlates) if (plate.surfaceGroup === 'ariete_c2_x:pso_skirt_1_0')
  plate.surfaceGroup = `${plate.surfaceGroup}:${plate.name}`;
assert.equal(packTrace(noGroup, edgeFrom, edgeTo, 'hull', 0).length, 2,
  'negative proves coincident faces would double-charge without one stock group');
const noStock = structuredClone(c2.armor);
noStock.turretPlates = noStock.turretPlates.filter(p => p.surfaceGroup !== 'ariete_c2_x:war_cheek_1_0');
assert.throws(() => assertPack(noStock, 'ariete_c2_x:war_cheek_1_0', [1.8, 1.7, .35], [1.3, 1.7, .35],
  [1.6, 1.7, .35], 'turret', .63), 'missing real pack must fail the positive runtime trace');
const wrongFrame = structuredClone(c2.armor);
wrongFrame.hullPlates.push(...wrongFrame.turretPlates.filter(p => p.surfaceGroup?.startsWith('ariete_c2_x:')));
wrongFrame.turretPlates = wrongFrame.turretPlates.filter(p => !p.surfaceGroup?.startsWith('ariete_c2_x:'));
assert.throws(() => assertPack(wrongFrame, 'ariete_c2_x:war_cheek_1_0', [1.8, 1.7, .35], [1.3, 1.7, .35],
  [1.6, 1.7, .35], 'turret', .63), 'stale hull ownership must fail the yawed trace');

const skirtX = Math.max(...c1.armor.hullPlates.filter(p => p.surfaceGroup?.startsWith('ariete_c1_x:'))
  .flatMap(p => p.verts.map(v => Math.abs(v[0]))));
assert.ok(Math.abs(skirtX - 1.805 * ARIETE_X_FAMILY_SCALE) < 1e-9, 'C1 skirt damage follows the enlarged native panels');
const c2BeforeSync = JSON.stringify(c2);
synchronizeSecondWaveXCombatMetadata();
assert.equal(JSON.stringify(c2), c2BeforeSync, 'historical donor resync cannot overwrite new C2 tuning');
assert.equal(c1.visual.trackWidthM, C1.trackWidthM);

const italian = PRODUCTION_TANK_IDS.map(id => TANK_SPECS[id]).filter(s => s.nation === 'Italy')
  .sort((a, b) => compareCountryThenTierThenName(a, b, new Map([['Italy', 0]]), tankTier));
assert.deepEqual(italian.slice(0, 2).map(s => s.id), ['ariete_c2_x', 'ariete_c1_x']);
assert.ok(italian.findIndex(s => s.id === 'ariete_c2') > 1);
const storage = new Map();
const priorStorage = globalThis.localStorage;
globalThis.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
try {
  for (const spec of [c1, c2]) {
    assert.equal(defaultCamoPatternId(spec.id), 'service_ariete_c1');
    assert.equal(getCamoSelection(spec.id), 'service_ariete_c1');
    setCamoSelection(spec.id, 'winter');
    assert.equal(getCamoSelection(spec.id), 'winter', 'explicit saved paint overrides new default');
    assert.notDeepEqual(resolveCamoVisual(spec, 'winter'), resolveCamoVisual(spec, 'factory'));
  }
} finally {
  if (priorStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = priorStorage;
}
for (const facade of ['tankFactory.ts', 'fleetFactory.ts']) {
  assert.match(readFileSync(new URL(facade, import.meta.url), 'utf8'), /import '\.\/arieteModernSpecs\.ts'/);
}
const browser = readFileSync(new URL('fleetFactory.ts', import.meta.url), 'utf8');
assert.match(browser, /arieteX: \(\) => import\('\.\/profiles\/arieteX\.ts'\)/);
assert.doesNotMatch(readFileSync(new URL('arieteModernSpecs.ts', import.meta.url), 'utf8'), /from ['"](?:three|.*arieteX\.ts|.*tankFactory)/,
  'new eager metadata must not import visual builders or renderer');
console.log(`arieteModernSpecs: PASS — stable legacy metadata, enlarged C1, finite C2 armor, ${runtimeTraceCount} actual runtime traces, balance, order, paint and lazy registration`);
