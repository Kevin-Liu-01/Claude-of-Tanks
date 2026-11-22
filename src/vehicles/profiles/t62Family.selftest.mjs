// t62-275 (the owner, 2026-11-21: "update the t62mv-1 and t62 obr 1975 to actually look like their historical
// counterparts"): the T-62 family builder (profiles/t62Family.ts) draws both marks from the photos' reads
// (docs/references/tanks/t62.md gap table): the published 3.30 m width, five wheels with the T-62's widening rear gaps
// and no return rollers, the commander's cupola on the left and the loader's DShKM and the Luna on the right, and each
// mark its own kit: the obr. 1975 bare (no ERA, no skirts), the T-62MV with its Kontakt-1 fields on the glacis, both
// skirts and both turret cheeks, every field a registered removable zone, and its T-62 turret (no T-72B transplant).
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { installCanvasFixture } from '../canvasFixture.test-support.mjs';

const restore = installCanvasFixture();
const { createTank } = await import('../tankFactory.ts');
const { TANK_SPECS } = await import('../specs.ts');
const { ensureAuthorityFleet } = await import('../authorityFleet.ts');
await ensureAuthorityFleet();

function worldBox(object) {
  object.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(object);
}

const builds = {};
try {
  for (const id of ['t62_1975', 't62mv1']) {
    const tank = createTank(id, null, { proceduralOnly: true, quality: 'high', geometryReceipt: true, camoSeed: 4242 });
    const hull = tank.root.getObjectByName('rig_hull'), turret = tank.root.getObjectByName('rig_turret');
    const hr = hull.userData.t62FamilyReceipt, tr = turret.userData.t62FamilyReceipt;
    assert.ok(hr && tr, `${id}: built by the T-62 family`);
    assert.equal(hr.variant, id);
    assert.ok(Math.abs(hr.widthM - 3.30) < 1e-9, `${id}: 3.30 m over the fenders (${hr.widthM})`);
    assert.equal(hr.roadWheelStations, 5);
    assert.equal(hr.returnRollers, 0);
    const gaps = hr.roadWheelGapsM;
    assert.ok(gaps[2] > gaps[0] + 0.1 && gaps[3] > gaps[1] + 0.1, `${id}: the rear gaps open wider than the front (${gaps})`);
    assert.equal(tr.commanderCupolaSide, 'left');
    assert.equal(tr.loaderHatchSide, 'right');
    assert.equal(tr.searchlightSide, 'right');
    // sides in the world: the vehicle's left is +X
    const dshk = turret.getObjectByName('t62RoofDShKM');
    assert.ok(dshk, `${id}: the loader's DShKM`);
    assert.ok(worldBox(dshk).getCenter(new THREE.Vector3()).x < 0, `${id}: the DShKM rides the right (loader's) side`);
    assert.ok(Math.abs(TANK_SPECS[id].dims.widthM - 3.30) < 1e-9, `${id}: the spec's published width`);
    const zones = [...new Set((tank.root.userData.eraVisualBindingReceipt?.plates ?? []).filter((p) => p.registered).map((p) => p.name))].sort();
    builds[id] = { hr, tr, zones, box: worldBox(tank.root) };
    tank.dispose?.();
  }
} finally {
  restore();
}

const obr = builds.t62_1975, mv = builds.t62mv1;
assert.deepEqual(obr.zones, [], 'obr. 1975: no add-on armour');
assert.equal(obr.hr.sideSkirts, 'none');
assert.equal(obr.tr.rangefinder, 'KTD-1');
assert.equal(obr.tr.thermalSleeve, false);
assert.deepEqual(mv.zones, ['glacis_era_L', 'glacis_era_R', 'skirt_era_L', 'skirt_era_R', 'turret_era_L', 'turret_era_R'],
  'T-62MV: Kontakt-1 on the glacis, both skirts and both turret cheeks, each a registered zone');
assert.equal(mv.hr.sideSkirts, 'rubber');
assert.equal(mv.tr.rangefinder, 'KTD-2');
assert.equal(mv.tr.thermalSleeve, true);
// one turret casting for both marks: the MV is the T-62's own dome under its Kontakt-1, not another turret
assert.deepEqual(mv.tr.dome, obr.tr.dome);
assert.deepEqual(mv.tr.pivotLocalM, obr.tr.pivotLocalM);
for (const zone of mv.zones) {
  const plates = [...TANK_SPECS.t62mv1.armor.hullPlates, ...TANK_SPECS.t62mv1.armor.turretPlates].filter((p) => p.name === zone);
  assert.ok(plates.length && plates.every((p) => p.kind === 'era'), `t62mv1: the spec carries ${zone} as ERA`);
}
assert.equal(TANK_SPECS.t62mv1.armor.crew.length, TANK_SPECS.t62_1975.armor.crew.length, 't62mv1: the T-62 crew of four');
console.log(`t62Family.selftest: obr. 1975 bare, T-62MV ${mv.zones.length} Kontakt-1 zones on one T-62 casting; 3.30 m, five wheels (gaps ${obr.hr.roadWheelGapsM.join('/')}), sides PASS`);
