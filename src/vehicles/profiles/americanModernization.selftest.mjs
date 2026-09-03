import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.ts';

const make = (id) => createTank(id, null, {
  proceduralOnly: true,
  quality: 'high',
  camoSeed: 4242,
  geometryReceipt: true,
});

const fittings = (root, predicate) => {
  const found = [];
  root.traverse((object) => {
    if (object.userData?.fittingRoot && predicate(object)) found.push(object);
  });
  return found;
};

for (const id of ['m551_sheridan', 'm46_patton', 'm47_patton', 'm60a1', 'm60a3']) {
  const tank = make(id);
  const guns = fittings(tank.root,
    (object) => object.userData.americanWeaponStandard === 'sheridan-m2hb-v2');
  assert.ok(guns.length >= 1, `${id}: uses the Sheridan-derived American M2HB standard`);
  for (const gun of guns) {
    assert.equal(gun.userData.weaponName, 'Browning M2HB');
    assert.equal(gun.userData.caliberMm, 12.7);
    assert.equal(gun.userData.machineGunFinish, 'gunmetal',
      `${id}: Browning publishes the neutral weapon-finish contract`);
    const receiver = gun.getObjectByName('americanM2HBBody');
    assert.equal(receiver?.userData.fittingSlot, 'dark',
      `${id}: receiver, jacket, barrel and mount stay in gunmetal`);
    assert.equal(receiver?.userData.appearanceRole, 'machineGun');
    const ammoBox = gun.getObjectByName('sheridanCommanderM2AmmoBox');
    assert.equal(ammoBox?.userData.fittingSlot, 'gunmetalAmmo',
      `${id}: ammunition chest does not inherit green vehicle paint`);
    assert.equal(gun.children.some((object) => object.userData.fittingSlot === 'detail'), false,
      `${id}: no M2 component is routed through camouflaged fitting paint`);
    gun.traverse((object) => {
      if (object.isMesh) assert.equal(object.userData.combatHitboxRole, 'equipment',
        `${id}: standardized M2 cannot expand primary armor hitboxes`);
    });
  }
  if (id !== 'm551_sheridan') {
    const receipt = tank.root.getObjectByName('rig_turret')?.userData.americanModernizationReceipt;
    assert.equal(receipt?.standardMachineGun, 'sheridan-m2hb-v2',
      `${id}: publishes its American modernization receipt`);
    assert.equal(receipt?.guardedAuxiliaryLights ?? receipt?.guardedLightClusters, 2,
      `${id}: carries a paired guarded light upgrade`);
    assert.equal(receipt?.antennaWhips, 2, `${id}: carries paired modern radio whips`);
    assert.equal(receipt?.equipmentRack, true, `${id}: carries seated service equipment`);
  }
  tank.dispose();
}

for (const id of ['m551_sheridan', 'm551a1_tts', 'm60a1', 'm60a2', 'm60a3']) {
  const tank = make(id);
  const gun = tank.root.getObjectByName('rig_gun');
  const receipt = gun?.userData.americanGunFinishReceipt;
  assert.equal(receipt?.decorativeBlackBands, 0,
    `${id}: gun sleeves use painted relief instead of decorative black bands`);
  assert.equal(receipt?.muzzleBoresDark, true,
    `${id}: true muzzle openings remain dark after the band cleanup`);
  assert.equal(receipt?.exposedWeaponsGunmetal, true,
    `${id}: exposed secondary weapons retain their gunmetal finish`);
  tank.dispose();
}

{
  const tank = make('m60a2');
  const turret = tank.root.getObjectByName('rig_turret');
  const station = fittings(tank.root,
    (object) => object.userData.americanRwsFamily === 'm551a1-tts-derived-v1');
  assert.equal(station.length, 1, 'M60A2 replaces the stowed MG with one visible TTS-derived RWS');
  assert.equal(station[0].userData.stationVariant, 'hunter');
  assert.equal(station[0].userData.finishStandard, 'continuous-fitting-paint');
  assert.equal(station[0].userData.hasVisibleFeedBelt, true);
  assert.equal(station[0].userData.hasWorkLights, true);
  assert.equal(station[0].userData.hasSteelReceiverGuard, true);
  assert.equal(station[0].userData.machineGunFinish, 'gunmetal');
  assert.equal(station[0].getObjectByName('americanRwsMachineGun')?.userData.fittingSlot, 'dark',
    'M60A2 RWS keeps the weapon mechanism gunmetal while its armor stays painted');
  assert.equal(turret.userData.americanModernizationReceipt?.stationVariant, 'hunter');
  assert.equal(turret.userData.americanModernizationReceipt?.guardedAuxiliaryLights, 2);
  assert.equal(turret.userData.americanModernizationReceipt?.properMantletSearchlight, true,
    'M60A2 replaces the old dark block with a complete mantlet searchlight');
  assert.equal(turret.userData.americanModernizationReceipt?.rearBustle, true,
    'M60A2 carries a turret-owned rear bustle');
  assert.equal(turret.userData.americanArmorFinishReceipt?.outlineGeometry, 0,
    'M60A2 applique has no decorative black outline geometry');
  tank.dispose();
}

const abramsStations = new Map();
for (const [id, expectedVariant, expectedLoader, expectedShield] of [
  ['m1a2', 'standard', 'm1a2-split-loader', 'split'],
  ['m1a2_tusk', 'tusk-urban', 'tusk-lags-loader', 'open'],
  ['m1a2_sepv2', 'armored', 'sepv2-armored-loader', 'armored'],
  ['m1a2_sepv3', 'sepv3-armored', 'sepv3-low-loader', 'low'],
]) {
  const tank = make(id);
  const turret = tank.root.getObjectByName('rig_turret');
  assert.equal(turret.userData.americanArmorFinishReceipt?.eraSeparation,
    'physical-panel-gaps', `${id}: Abrams armor uses physical seams rather than ink outlines`);
  assert.equal(turret.userData.americanArmorFinishReceipt?.highContrastOutlineMaterial,
    false, `${id}: Abrams panel detail stays in the subdued vehicle palette`);
  assert.equal(turret.userData.americanArmorFinishReceipt?.decorativeTurretStraps,
    0, `${id}: Abrams turret has no proud line-strip overlays`);
  const gunFinish = tank.root.getObjectByName('rig_gun')?.userData.americanGunFinishReceipt;
  assert.equal(gunFinish?.decorativeBlackBands, 0,
    `${id}: Abrams gun uses painted sleeve relief instead of black rings`);
  assert.equal(gunFinish?.muzzleBoresDark, true,
    `${id}: Abrams keeps only the true muzzle opening dark`);
  const hasFullCommanderTower = id === 'm1a2_tusk' || id === 'm1a2_sepv3';
  const compactStation = fittings(tank.root,
    (object) => object.userData.americanRwsFamily === 'm551a1-tts-derived-v1');
  const fullStation = fittings(tank.root,
    (object) => object.userData.designFamily === 'abramsx-open-yoke-v1');
  const station = hasFullCommanderTower ? fullStation : compactStation;
  assert.equal(station.length, 1, `${id}: has exactly one commander's weapon tower`);
  assert.equal(compactStation.length, hasFullCommanderTower ? 0 : 1,
    `${id}: compact commander gun is removed only where the full tower replaces it`);
  assert.equal(fullStation.length, hasFullCommanderTower ? 1 : 0,
    `${id}: full-size commander tower is installed only on SEPv3 and TUSK`);
  assert.equal(station[0].userData.stationVariant, expectedVariant,
    `${id}: uses its distinct commander-station variation`);
  assert.equal(station[0].userData.hasVisibleFeedBelt, true,
    `${id}: tower exposes a readable protected ammunition feed`);
  assert.equal(station[0].userData.machineGunFinish, 'gunmetal',
    `${id}: tower weapon mechanism stays neutral gunmetal`);
  if (hasFullCommanderTower) {
    assert.equal(station[0].userData.weaponRole, 'commander-primary');
    assert.equal(station[0].userData.headOnSide, 'left');
    assert.equal(station[0].userData.sizeStandard, 'm1a3-full-tower');
    assert.equal(station[0].getObjectByName('openYokeRwsMachineGun')?.userData.fittingSlot, 'dark',
      `${id}: tower weapon stays gunmetal`);
    assert.equal(station[0].children.some((object) => object.userData.fittingSlot === 'hull'), true,
      `${id}: full tower armor inherits the tank's painted material`);
    assert.equal(turret.userData.commanderWeaponStationReceipt?.variant, expectedVariant);
    assert.equal(turret.userData.commanderWeaponStationReceipt?.buriedSeatM, 0.010,
      `${id}: full commander tower is flush-seated into the roof carrier`);
  } else {
    assert.equal(station[0].userData.finishStandard, 'continuous-fitting-paint',
      `${id}: command tower armor uses one coherent finish`);
    assert.equal(station[0].userData.hasWorkLights, true,
      `${id}: command tower carries its paired work-light package`);
    assert.equal(station[0].userData.hasSteelReceiverGuard, true,
      `${id}: taller receiver is tied into a steel support cage`);
    assert.equal(station[0].getObjectByName('americanRwsMachineGun')?.userData.fittingSlot, 'dark',
      `${id}: tower armor paint does not leak onto the machine gun`);
    assert.equal(station[0].children.some((object) => object.userData.fittingSlot === 'hull'), false,
      `${id}: tower does not resample fragmented host camouflage`);
    assert.equal(turret.userData.americanRwsReceipt?.variant, expectedVariant);
    assert.equal(turret.userData.americanRwsReceipt?.buriedSeatM, 0.010,
      `${id}: command station is flush-seated into the existing roof carrier`);
  }
  const loader = fittings(tank.root,
    (object) => object.userData.americanWeaponStandard === 'sheridan-m2hb-v2');
  assert.equal(loader.length, 1, `${id}: has one standardized crew-served Browning`);
  assert.equal(loader[0].userData.installationVariant, expectedLoader);
  assert.equal(loader[0].userData.shieldVariant, expectedShield);
  assert.ok(loader[0].position.x > 0,
    `${id}: Browning stays on the right in a head-on view`);
  const paintedShield = loader[0].children.find(
    (object) => object.userData.fittingSlot === 'hull');
  if (expectedShield === 'open') {
    assert.equal(paintedShield, undefined, `${id}: open Browning does not invent an armor shield`);
  } else {
    assert.equal(paintedShield?.userData.camoProjection, 'continuous-fitting-box-uv',
      `${id}: Browning shield receives one natural-scale camouflage projection`);
    assert.equal(paintedShield?.userData.camoUvScale,
      paintedShield?.material.userData.camoUvScale,
      `${id}: Browning shield matches the host vehicle's camouflage density`);
  }
  loader[0].traverse((object) => {
    if (object.isMesh) assert.equal(object.userData.combatHitboxRole, 'equipment',
      `${id}: Browning and shield remain equipment-owned`);
  });
  const optic = turret.userData.abramsRelocatedCommanderOpticReceipt;
  assert.equal(optic?.retainedLegacyAssembly, true,
    `${id}: retains the established commander optics assembly`);
  assert.equal(optic?.clearsWeaponTower, true,
    `${id}: relocates the optic clear of the new gun tower`);
  assert.equal(optic?.x, -0.84);
  assert.equal(optic?.z, 0.70);
  assert.ok(Math.abs(optic.seatDepthM - 0.008) < 1e-9,
    `${id}: relocated optic is flush-seated on the roof carrier`);
  abramsStations.set(id,
    `${station[0].userData.designFamily || station[0].userData.americanRwsFamily}:${station[0].userData.stationVariant}`);
  tank.dispose();
}

{
  const tank = make('m1a3');
  const turret = tank.root.getObjectByName('rig_turret');
  const gunFinish = tank.root.getObjectByName('rig_gun')?.userData.americanGunFinishReceipt;
  assert.equal(turret.userData.americanArmorFinishReceipt?.outlineGeometry, 0,
    'm1a3: modular armor relies on physical gaps instead of black outline strips');
  assert.equal(gunFinish?.decorativeBlackBands, 0,
    'm1a3: 130 mm thermal-jacket joints remain vehicle-painted');
  assert.equal(gunFinish?.muzzleBoresDark, true,
    'm1a3: true muzzle opening remains dark');
  tank.dispose();
}
assert.equal(new Set(abramsStations.values()).size, 4,
  'M1A2, TUSK, SEPv2 and SEPv3 do not repeat one generic remote tower');

for (const [id, expectedLoader, expectedShield] of [
  ['m1a1', 'm1a1-open-loader', 'open'],
  ['m1a1ha', 'm1a1ha-armored-loader', 'armored'],
]) {
  const tank = make(id);
  const loader = fittings(tank.root,
    (object) => object.userData.americanWeaponStandard === 'sheridan-m2hb-v2');
  assert.equal(loader.length, 1, `${id}: has one standardized crew-served Browning`);
  assert.equal(loader[0].userData.installationVariant, expectedLoader);
  assert.equal(loader[0].userData.shieldVariant, expectedShield);
  assert.equal(loader[0].userData.machineGunFinish, 'gunmetal');
  tank.dispose();
}

{
  const tank = make('m1a3');
  const towerGun = tank.root.getObjectByName('m1a3RemoteWeaponTower');
  assert.equal(towerGun?.userData.machineGunFinish, 'gunmetal',
    'M1A3 tower gun uses the neutral gunmetal finish');
  assert.equal(towerGun?.children.some((object) => object.userData.fittingSlot === 'detail'), false,
    'M1A3 tower gun does not inherit the green fitting-paint slot');
  tank.dispose();
}

console.log('americanModernization.selftest: full commander towers and right-side M2HB loaders verified');
