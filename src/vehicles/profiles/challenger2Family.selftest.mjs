import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';

function make(id) {
  return createTank(id, null, {
    proceduralOnly: true,
    quality: 'high',
    camoSeed: 4242,
    geometryReceipt: true,
  });
}

function close(actual, expected, label) {
  assert.ok(Math.abs(actual - expected) < 1e-9,
    `${label}: expected ${expected}, got ${actual}`);
}

for (const id of ['fv4034', 'challenger2', 'challenger2e', 'ua_challenger2']) {
  const tank = make(id);
  const spec = getSpec(id);
  await Promise.resolve();
  const hull = tank.root.getObjectByName('rig_hull');
  const turret = tank.root.getObjectByName('rig_turret');
  const gun = tank.root.getObjectByName('rig_gun');
  const receipt = hull?.userData.challenger2FamilyScaleReceipt;
  assert.ok(hull && turret && gun, `${id} must retain all articulated rig owners`);
  assert.equal(receipt?.uniformScale, 1.10, `${id} must carry the family scale receipt`);
  assert.equal(receipt, turret.userData.challenger2FamilyScaleReceipt,
    `${id} hull and turret must share one scale receipt`);
  close(hull.scale.x, 1.10, `${id} hull width scale`);
  close(hull.scale.y, 1.10, `${id} hull height scale`);
  close(hull.scale.z, 1.10, `${id} hull length scale`);
  close(turret.scale.x, 1.10, `${id} turret width scale`);
  close(turret.scale.y, 1.54, `${id} enlarged turret height with authored shaping`);
  close(turret.scale.z, 1.10, `${id} turret length scale`);
  close(turret.position.x, spec.armor.turretPivot[0] * 1.10,
    `${id} turret pivot x`);
  close(turret.position.y, spec.armor.turretPivot[1] * 1.10,
    `${id} turret pivot y`);
  close(turret.position.z, spec.armor.turretPivot[2] * 1.10,
    `${id} turret pivot z`);
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
    assert.equal(receipt.roofAttachmentCount, 8,
      'FV4034 cupolas, periscopes, and machine guns must all publish roof seats');
    assert.equal(receipt.bridgedMachineGunBarrels, 1,
      'FV4034 MAG barrel must bridge directly into its receiver');
  } else {
    assert.equal(receipt.mannedMachineGuns, 4,
      `${id} carries its three variant weapons plus the Challenger 2 tower`);
    const towerReceipt = turret.userData.challenger2WeaponTowerReceipt;
    assert.equal(towerReceipt?.exactChallenger2Assembly, true,
      `${id} must inherit the exact Challenger 2 remote weapon tower`);
    assert.equal(towerReceipt.centeredOnRoof, true,
      `${id} weapon tower must be centered on the roof`);
    assert.deepEqual(towerReceipt.localSeat, [0, 0.500, 0.20],
      `${id} weapon tower must use the centered roof seat`);
    close(towerReceipt.roofCarrierY, 0.4731,
      `${id} centered weapon-tower roof carrier`);
    assert.ok(towerReceipt.roofContactEmbedM >= 0.008,
      `${id} weapon tower pedestal must overlap the roof instead of floating`);
    assert.equal(receipt.enhancedSkirtPanels, 16,
      `${id} enhanced skirts remain segmented on both sides`);
    assert.equal(receipt.fuelBarrels, 2,
      `${id} carries exactly two rear auxiliary fuel barrels`);
    assert.equal(receipt.glacisEraCassettes, 30,
      `${id} glacis ERA field remains symmetric and complete`);
    assert.equal(receipt.turretEraCassettes, 20,
      `${id} cheek ERA field remains symmetric and complete`);
    assert.equal(receipt.cheekEraColumnsPerSide, 5,
      `${id} cheek ERA must use five separated columns per side`);
    assert.equal(receipt.cheekEraRowsPerSide, 2,
      `${id} cheek ERA must use two separated rows per side`);
    assert.equal(receipt.cheekEraIndividualSquares, true,
      `${id} cheek ERA must read as individual square cassettes`);
    assert.ok(Math.abs(receipt.cheekEraCassetteWidthM - receipt.cheekEraCassetteHeightM) < 0.002,
      `${id} cheek ERA faces must remain square`);
    assert.ok(receipt.cheekEraHorizontalGapM >= 0.04,
      `${id} cheek ERA needs a visible horizontal gap between cassettes`);
    assert.ok(receipt.cheekEraVerticalGapM >= 0.025,
      `${id} cheek ERA needs a visible vertical gap between cassettes`);
    close(receipt.cheekEraSurfaceLoweringM, 0.075,
      `${id} cheek ERA must follow the cheek surface slightly downward`);
    assert.deepEqual(receipt.cheekEraVerticalBoundsBySide.left,
      receipt.cheekEraVerticalBoundsBySide.right,
      `${id} left and right cheek ERA courses must share the same vertical bounds`);
    assert.equal(receipt.cheekEraHorizontallyMirrored, true,
      `${id} cheek ERA courses must mirror horizontally across the turret`);
    close(receipt.cheekEraNormalAlignmentDot, 1,
      `${id} cheek ERA face-normal alignment`);
    close(receipt.glacisEraNormalAlignmentDot, 1,
      `${id} glacis ERA face-normal alignment`);
    assert.equal(receipt.roofAttachmentCount, 9,
      `${id} cupolas, machine guns, tower, and roof equipment must all publish seats`);
    assert.equal(turret.userData.challenger2RoofSeatingReceipt.roofSeats.length, 9,
      `${id} roof-seat receipt must include the centered weapon tower`);
    assert.equal(receipt.bridgedMachineGunBarrels, 2,
      `${id} MAG barrels must bridge directly into their receivers`);
    assert.equal(receipt.smokeBanks, 2,
      `${id} must carry one reseated smoke bank on each turret cheek`);
    assert.equal(receipt.smokeCanisters, 8,
      `${id} reseated smoke banks must retain eight launchers`);
    assert.equal(receipt.smokeCarrierMaximumGapM, 0,
      `${id} smoke-bank carriers must remain flush with the cheeks`);
    assert.ok(receipt.smokeCanisterMinimumEmbedM >= 0.01,
      `${id} smoke launchers must overlap their carrier instead of floating`);
    assert.equal(receipt.smokeCanistersSurfaceDerived, true,
      `${id} smoke banks must derive their seats from the cheek surfaces`);
    for (const sector of [
      'cr2e_glacis_era_L', 'cr2e_glacis_era_R',
      'cr2e_skirt_era_L', 'cr2e_skirt_era_R',
      'cr2e_turret_era_L', 'cr2e_turret_era_R',
    ]) {
      assert.ok(tank.root.userData.eraClusterNames.includes(sector),
        `${id} must expose gameplay ERA sector ${sector}`);
    }
  }

  assert.equal(receipt.maximumRoofGapM, 0,
    `${id} variant roof package must not retain visible attachment gaps`);
  const bridgedMagCount = fittingMgs.filter((mg) => mg.userData.barrelBridge).length;
  assert.equal(bridgedMagCount, receipt.bridgedMachineGunBarrels,
    `${id} barrel-bridge receipt must match exact machine-gun fittings`);

  if (id === 'ua_challenger2') {
    assert.ok(receipt.cageRails >= 19,
      'Ukrainian Challenger 2 needs a complete hull/turret/canopy cage system');
    assert.ok(receipt.cagePosts >= 30,
      'Ukrainian Challenger 2 cage needs visible structural posts and ties');
    assert.equal(receipt.cageDeckTiePlates, 2,
      'Ukrainian Challenger 2 rear cage must tie into both rear-deck shoulders');
    assert.equal(receipt.canopyMaximumLegGapM, 0,
      'Ukrainian Challenger 2 canopy legs must terminate on the turret roof');
    close(receipt.canopyLoweringM, 0.37,
      'Ukrainian Challenger 2 canopy lowering');
  } else {
    assert.equal(receipt.cageRails, 0, `${id} must not inherit the Ukrainian cage kit`);
  }
}

console.log('challenger2Family.selftest: cleaned base, FV4034, 2E, and Ukrainian protection packages pass');
