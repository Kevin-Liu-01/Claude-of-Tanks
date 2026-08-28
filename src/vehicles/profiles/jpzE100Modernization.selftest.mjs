import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.js';

const tank = createTank('jpz_e100', null, {
  proceduralOnly: true,
  quality: 'high',
  camoSeed: 4242,
  geometryReceipt: true,
});

try {
  const hull = tank.root.getObjectByName('rig_hull');
  const turret = tank.root.getObjectByName('rig_turret');
  assert.ok(hull && turret, 'JPz E 100 retains the canonical fixed-casemate rig');

  const receipt = hull.userData.jpzE100ModernizationReceipt;
  assert.ok(receipt?.sourceComparisonOnly,
    'the supplied GLB remains a comparison input, never a playable load path');
  assert.equal(receipt.mantletFrame, 'bolted-trapezoid',
    'reference-defining broad mantlet frame replaces the token round ring');
  assert.ok(receipt.mantletOuterWidthM >= 1.8, 'mantlet frame dominates the front plate');
  assert.equal(receipt.segmentedSkirtPanelsPerSide, 8,
    'each camouflaged skirt face is divided into eight supported panels');
  assert.ok(receipt.slatCageAttached, 'side and rear slat cage has explicit attachment receipts');
  assert.deepEqual(receipt.cageOwners, ['hull-left', 'hull-right', 'hull-rear'],
    'cage wraps both flanks and the rear wall');

  const gear = hull.userData.runningGearReceipts?.at(-1);
  assert.equal(hull.userData.nativeRoadWheelStations, 8,
    'E 100 running gear keeps eight road-wheel stations per side');
  assert.equal(gear?.wheelR, 0.43, 'road wheels use the source-measured large diameter');
  assert.ok(gear.wheelZs.at(0) - gear.wheelZs.at(-1) >= 5.15,
    'road wheels fill the complete linked track course');
  assert.ok(gear.sprocket.r >= 0.40 && gear.idler.r >= 0.38,
    'terminal wheels match the enlarged road-wheel geometry');

  const equipment = tank.root.getObjectByName('hullEquipment');
  assert.ok(equipment, 'cage and roof supports are segregated from armor geometry');
  assert.ok(tank.root.getObjectByName('jpzE100RemoteWeapon'),
    'named shielded remote weapon station is installed');
  assert.ok(tank.root.getObjectByName('jpzE100SmokeBankL')
    && tank.root.getObjectByName('jpzE100SmokeBankR'),
  'paired six-tube smoke banks are installed on supported shoulders');
  assert.equal(receipt.remoteControlled, true, 'roof machine gun is remotely controlled');
  assert.equal(receipt.smokeBanks, 2, 'both smoke banks are recorded');
  assert.equal(receipt.smokeCanistersPerBank, 6, 'each bank carries six launchers');

  for (const layer of ['net', 'light', 'dark']) {
    const ghillie = tank.root.getObjectByName(`jpz_e100_ghillie_hull_${layer}`);
    assert.ok(ghillie?.isMesh, `physical ghillie ${layer} layer is present`);
    assert.equal(ghillie.parent, hull, `ghillie ${layer} layer remains hull-owned`);
  }
  tank.root.updateMatrixWorld(true);
  const netBounds = new THREE.Box3().setFromObject(
    tank.root.getObjectByName('jpz_e100_ghillie_hull_net'),
  );
  assert.ok(netBounds.min.y > 0.52, 'ghillie hem stays above the smart-track corridor');
  assert.ok(netBounds.max.z - netBounds.min.z > 5.5, 'ghillie spans the full fighting vehicle');

  const spec = getSpec('jpz_e100');
  assert.equal(spec.hp, 2300, 'Tier X assault TD receives a viable hit-point pool');
  assert.equal(spec.topSpeedKmh, 30, 'modern powerpack supports meaningful repositioning');
  assert.equal(spec.reverseSpeedKmh, 12, 'vehicle can retreat after firing');
  assert.equal(spec.dims.heightM, 3.48,
    'published travel height includes the low modern remote weapon station');
  assert.equal(spec.gun.reloadS, 22.5, 'high alpha pays a deliberate reload cost');
  assert.equal(spec.gun.shells[0].dmg, 1150, '17 cm APCBC retains headline alpha identity');
  assert.equal(spec.gun.shells[0].pen100Mm, 305, 'standard penetration is Tier X viable');
  assert.ok((spec.gun.shells[0].dmg * 60) / spec.gun.reloadS < 3100,
    'alpha upgrade stays below the intended 3,100 DPM ceiling');
  assert.equal(spec.visual.scheme, 'nato', 'factory finish uses a modern German NATO palette');
  assert.equal(spec.armor.turretPlates.find((plate) => plate.name === 'mantlet')?.physicalMm, 420,
    'massive gun mount receives the rebalanced mantlet value');
} finally {
  tank.dispose();
}

console.log('jpzE100Modernization.selftest: source silhouette, running gear, cage, ghillie, RWS, and balance verified');
