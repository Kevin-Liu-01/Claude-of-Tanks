import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.js';

function make(id) {
  return createTank(id, null, {
    proceduralOnly: true,
    quality: 'high',
    camoSeed: 4242,
    geometryReceipt: true,
  });
}

for (const id of ['fv4034', 'challenger2e', 'ua_challenger2']) {
  const tank = make(id);
  await Promise.resolve();
  const hull = tank.root.getObjectByName('rig_hull');
  const turret = tank.root.getObjectByName('rig_turret');
  const receipt = turret?.userData.challenger2VariantReceipt;
  assert.ok(hull && turret, `${id} must retain articulated hull/turret rigs`);
  assert.equal(receipt?.variant, id, `${id} must expose its own family receipt`);
  assert.equal(receipt?.baseCheekPanelsRemoved, true,
    `${id} must not inherit the marked CR2 applique cheeks`);
  assert.equal(receipt?.baseSightWellsRemoved, true,
    `${id} must not inherit the marked CR2 forward sight wells`);
  assert.equal(receipt?.legacyHydrogasGapAssembliesRemoved, true,
    `${id} must inherit the cleaned running gear`);
  assert.equal(hull.userData.challenger2FenderReceipt?.maximumRailGapM, 0,
    `${id} must inherit seated fender rails`);

  const fittingMgs = [];
  tank.root.traverse(object => {
    if (object.userData?.fittingRoot && object.userData.fitting === 'pintleMG') fittingMgs.push(object);
  });
  assert.equal(fittingMgs.length, receipt.mannedMachineGuns,
    `${id} machine-gun receipt must match exact fittings`);

  if (id === 'fv4034') {
    assert.equal(receipt.mannedMachineGuns, 2,
      'FV4034 carries two manually operated roof machine guns');
    assert.equal(receipt.enhancedSkirtPanels, 0,
      'FV4034 remains the bare predecessor-style variant');
    assert.deepEqual(tank.root.userData.eraClusterNames, [],
      'FV4034 must not inherit Challenger 2E ERA');
  } else {
    assert.equal(receipt.mannedMachineGuns, 3,
      `${id} carries its two new stations plus the loader weapon`);
    assert.equal(receipt.enhancedSkirtPanels, 16,
      `${id} enhanced skirts remain segmented on both sides`);
    assert.equal(receipt.fuelBarrels, 2,
      `${id} carries exactly two rear auxiliary fuel barrels`);
    assert.equal(receipt.glacisEraCassettes, 30,
      `${id} glacis ERA field remains symmetric and complete`);
    assert.equal(receipt.turretEraCassettes, 24,
      `${id} cheek ERA field remains symmetric and complete`);
    for (const sector of [
      'cr2e_glacis_era_L', 'cr2e_glacis_era_R',
      'cr2e_skirt_era_L', 'cr2e_skirt_era_R',
      'cr2e_turret_era_L', 'cr2e_turret_era_R',
    ]) {
      assert.ok(tank.root.userData.eraClusterNames.includes(sector),
        `${id} must expose gameplay ERA sector ${sector}`);
    }
  }

  if (id === 'ua_challenger2') {
    assert.ok(receipt.cageRails >= 19,
      'Ukrainian Challenger 2 needs a complete hull/turret/canopy cage system');
    assert.ok(receipt.cagePosts >= 30,
      'Ukrainian Challenger 2 cage needs visible structural posts and ties');
  } else {
    assert.equal(receipt.cageRails, 0, `${id} must not inherit the Ukrainian cage kit`);
  }
}

console.log('challenger2Family.selftest: cleaned base, FV4034, 2E, and Ukrainian protection packages pass');
