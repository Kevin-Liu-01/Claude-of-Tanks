import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from './tankFactory.ts';
import { FITTINGS } from './profiles/kit.ts';
import { KIT } from './tankFactoryCore.ts';

const BASE_OFFSET_M = 0.041;
const CARRIER_FAMILY = 'cot-spare-track-carrier-v2';

const fittingMaterials = {
  hull: new THREE.MeshBasicMaterial(), detail: new THREE.MeshBasicMaterial(),
  dark: new THREE.MeshBasicMaterial(), spareTrack: new THREE.MeshBasicMaterial(),
};
const fitting = FITTINGS.spareTrackLinks({
  mats: fittingMaterials,
  links: 4,
  width: 0.5,
  pitch: 0.165,
  seed: 1,
});
assert.equal(fitting.userData.designFamily, CARRIER_FAMILY,
  'semantic spare-link fitting publishes the continuous-carrier design family');
assert.equal(fitting.userData.mountAxisLocal.join(','), '0,1,0',
  'semantic spare-link fitting publishes its armor-facing mount axis');
assert.equal(fitting.userData.mountBaseOffsetM, BASE_OFFSET_M,
  'semantic spare-link fitting publishes the carrier base offset');
assert.equal(fitting.userData.hasContinuousCarrier, true,
  'semantic spare-link fitting cannot be a loose stair-step stack');
assert.equal(fitting.userData.carrierRailCount, 2,
  'semantic spare-link fitting has two continuous carrier rails');
assert.equal(fitting.userData.carrierFootCount, 4,
  'semantic spare-link fitting has four welded armor feet');
fitting.traverse((object) => object.geometry?.dispose());
for (const material of Object.values(fittingMaterials)) material.dispose();

// Legacy profile builders merge their strips into material buckets. Exercise
// the shared primitive before merge so a later cleanup cannot silently remove
// the rails/feet and return the old floating-link silhouette.
const legacyParts = [];
KIT.spareTrackStrip({
  add() {},
  addEquipment(bucket, geometry, ...transform) {
    legacyParts.push({ bucket, geometry, transform });
  },
}, 'hull', 0, 1, 2, 3, 0.3, 0);
assert.equal(legacyParts.length, 12,
  'three-link legacy strip contains six link parts plus two rails and four feet');
assert.equal(legacyParts.filter(({ bucket }) => bucket === 'hullDetail').length, 6,
  'legacy strip publishes six carrier/support parts in the detail finish');
assert.equal(legacyParts.filter(({ bucket }) => bucket === 'hullTrack').length, 6,
  'legacy strip retains six worn-track link parts');
for (const part of legacyParts) part.geometry.dispose();

// VEH-13 (2026-10-15): the single centre-ray gap check gave way to the build's own seat receipts (spareTrackSeat.ts):
// every run a tank keeps passed the solver's support, clearance, motion and exposure rules where it stands, and every
// run it dropped is recorded with its reason. The formerly high-risk owners, plus the Strv 103 family and the runs the
// 2026-10-15 audit found hanging, swept or on launchers.
const SEATED_OWNERS = [
  'strv103a', 'udes03', 'strv103', 'fv510', 'kv2', 'chieftain_mk10', 'leo2a4', 'leo2a4_otco', 'amx30', 'upior',
  'pl01_105', 'm3a3_bradley', 'mbt70', 'type10', 'challenger1',
];
let checkedRuns = 0;
for (const id of SEATED_OWNERS) {
  const visual = createTank(id, null, {
    proceduralOnly: true,
    quality: 'high',
    geometryReceipt: true,
    materialMode: 'geometry-only',
  });
  try {
    assert.equal(visual.root.userData.spareTrackError, undefined, `${id}: the seat pass ran`);
    const runs = visual.root.userData.spareTrack;
    const rejected = visual.root.userData.spareTrackRejected;
    assert.ok(Array.isArray(runs) && Array.isArray(rejected), `${id}: the build publishes its spare-track seat receipts`);
    const fittings = [];
    visual.root.traverse((object) => {
      if (object.userData.designFamily === CARRIER_FAMILY) fittings.push(object);
    });
    assert.equal(fittings.length, runs.filter((run) => run.source === 'fitting').length,
      `${id}: every carrier left in the scene has a seat receipt`);
    for (const trackFitting of fittings) {
      assert.equal(trackFitting.userData.hasContinuousCarrier, true,
        `${id}/${trackFitting.name}: fitting retains a continuous carrier`);
    }
    for (const run of runs) {
      assert.ok(run.support >= 80 && run.air <= 10, `${id}/${run.site}: support ${run.support} %, air ${run.air} %`);
      assert.ok(run.gapP90Cm <= 1.2 && run.maxEmbedCm <= 1, `${id}/${run.site}: gap ${run.gapP90Cm} cm, embed ${run.maxEmbedCm} cm`);
      assert.ok(run.clearCm === null || run.clearCm >= 3, `${id}/${run.site}: ${run.clearCm} cm from a forbidden part`);
      assert.ok(run.sweepCm === null || run.sweepCm >= 3, `${id}/${run.site}: ${run.sweepCm} cm from the moving gun or turret`);
      assert.ok(run.exposure >= 30, `${id}/${run.site}: exposure ${run.exposure} %`);
      checkedRuns += 1;
    }
    for (const drop of rejected) assert.ok(drop.reason, `${id}/${drop.site}: a dropped run records its reason`);
  } finally {
    visual.dispose();
  }
}
assert.ok(checkedRuns > 0, `the seated owners keep their runs (${checkedRuns})`);

console.log(`spareTrackAttachment.selftest: ${checkedRuns} seated runs on ${SEATED_OWNERS.length} owners plus both carrier systems passed`);
