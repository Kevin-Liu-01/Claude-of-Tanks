import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createShell, guideShellToward, stepShell } from '../../sim/ballistics.ts';
import { createCombatState, selectShell } from '../../sim/damage.ts';
import { specialActionGuidesShell } from '../../sim/specialActions.ts';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';
import { tankTier } from '../tier.ts';
import { garageStatGroup } from '../../ui/garageDossier.ts';
import { VEHICLE_ROLE_PROFILES } from '../roleProfiles.ts';
import { tacticalRoleHandling } from '../tacticalRoleBalance.ts';

const spec = getSpec('m551_sheridan');
const ttsSpec = getSpec('m551a1_tts');
assert.ok(spec, 'M551 Sheridan is registered');
assert.ok(ttsSpec, 'M551A1 TTS is registered');
assert.equal(tankTier(spec.id), 9, 'Sheridan is a Tier IX vehicle');
assert.equal(spec.role, 'light');
assert.equal(spec.gun.caliberMm, 152);
assert.equal(spec.gun.primaryGuided, true);
assert.equal(spec.gun.shells.length, 1, 'Sheridan is a dedicated missile-only tank');
assert.equal(spec.gun.shells[0].guided, true);
assert.match(spec.gun.shells[0].name, /MGM-51C Shillelagh/i);
// 2026-10-01: the role balance (0e5fc79e2, tacticalRoleBalance.ts) layers the Sheridan's scout doctrine onto its
// authored traverse rates and gun handling after the envelope below is published; the authored values are unchanged
// and the doctrine's own factors are the tactical-role regression's.
assert.equal(VEHICLE_ROLE_PROFILES.m551_sheridan.doctrine, 'scout', 'Sheridan keeps its scout doctrine');
const authoredHandling = tacticalRoleHandling({
  hullTraverseDegS: 54,
  turretTraverseDegS: 46,
  gun: { ...spec.gun, baseAccuracy: 0.28, aimTimeS: 1.45,
    bloom: { move: 0.06, hullRot: 0.07, turret: 0.05, afterShot: 1.8 } },
}, 'scout');
assert.deepEqual({
  hp: spec.hp,
  enginePowerHp: spec.enginePowerHp,
  reverseSpeedKmh: spec.reverseSpeedKmh,
  hullTraverseDegS: spec.hullTraverseDegS,
  turretTraverseDegS: spec.turretTraverseDegS,
  gunPitchDegS: spec.gunPitchDegS,
  terrainResistance: spec.terrainResistance,
  reloadS: spec.gun.reloadS,
  baseAccuracy: spec.gun.baseAccuracy,
  aimTimeS: spec.gun.aimTimeS,
  bloom: spec.gun.bloom,
}, {
  hp: 2050,
  enginePowerHp: 400,
  reverseSpeedKmh: 24,
  hullTraverseDegS: authoredHandling.hullTraverseDegS,
  turretTraverseDegS: authoredHandling.turretTraverseDegS,
  gunPitchDegS: 36,
  terrainResistance: { hard: 0.58, medium: 0.72, soft: 1.12 },
  reloadS: 8.6,
  baseAccuracy: authoredHandling.gun.baseAccuracy,
  aimTimeS: authoredHandling.gun.aimTimeS,
  bloom: authoredHandling.gun.bloom,
}, 'Sheridan owns its complete Tier IX light-missile handling envelope');
assert.deepEqual({
  pen100Mm: spec.gun.shells[0].pen100Mm,
  pen1000Mm: spec.gun.shells[0].pen1000Mm,
  dmg: spec.gun.shells[0].dmg,
  velocityMps: spec.gun.shells[0].velocityMps,
  guidanceTurnRateRadS: spec.gun.shells[0].guidanceTurnRateRadS,
  reloadS: spec.gun.shells[0].reloadS,
  count: spec.gun.shells[0].count,
}, {
  pen100Mm: 900,
  pen1000Mm: 900,
  dmg: 800,
  velocityMps: 208,
  guidanceTurnRateRadS: 0.84,
  reloadS: 8.6,
  count: 14,
}, 'dedicated Shillelagh channel is competitive at Tier IX');
assert.equal(garageStatGroup(spec), '9/cold-war',
  'garage compares Sheridan against its actual Tier IX peers');
const starship = getSpec('m60a2');
const starshipMissile = starship.gun.shells.find((round) => round.guided === true);
assert.ok(spec.hp < starship.hp, 'Sheridan remains less durable than the M60A2 Starship');
assert.ok(spec.enginePowerHp / spec.weightTons > starship.enginePowerHp / starship.weightTons,
  'Sheridan retains its light-tank mobility advantage over the Starship');
assert.ok(spec.gun.reloadS > starshipMissile.reloadS,
  'a missile fired through the Sheridan main gun uses a normal gun reload, not an IFV launcher cycle');
assert.ok(spec.armor.modules.some((module) => module.module === 'missileRack'),
  'damageable combat anatomy includes the missile stowage');
assert.equal(tankTier(ttsSpec.id), 10, 'M551A1 TTS is the Tier X Sheridan variant');
assert.equal(ttsSpec.variantOf, spec.id);
assert.equal(ttsSpec.era, 'next-generation');
// 2026-10-01: the same scout doctrine layer (0e5fc79e2) applies to the TTS's authored 0.24 accuracy / 1.25 s aim.
assert.equal(VEHICLE_ROLE_PROFILES.m551a1_tts.doctrine, 'scout', 'TTS keeps its scout doctrine');
const ttsHandling = tacticalRoleHandling({ hullTraverseDegS: ttsSpec.hullTraverseDegS,
  turretTraverseDegS: ttsSpec.turretTraverseDegS, gun: { ...ttsSpec.gun, baseAccuracy: 0.24, aimTimeS: 1.25 } }, 'scout');
assert.deepEqual({
  hp: ttsSpec.hp,
  enginePowerHp: ttsSpec.enginePowerHp,
  weightTons: ttsSpec.weightTons,
  reverseSpeedKmh: ttsSpec.reverseSpeedKmh,
  reloadS: ttsSpec.gun.reloadS,
  accuracy: ttsSpec.gun.baseAccuracy,
  aimTimeS: ttsSpec.gun.aimTimeS,
}, {
  hp: 2450,
  enginePowerHp: 520,
  weightTons: 24.8,
  reverseSpeedKmh: 28,
  reloadS: 7.4,
  accuracy: ttsHandling.gun.baseAccuracy,
  aimTimeS: ttsHandling.gun.aimTimeS,
}, 'TTS owns an explicit Tier X light-missile balance envelope');
assert.deepEqual(ttsSpec.gun.shells.map((round) => ({
  name: round.name,
  type: round.type,
  guided: round.guided === true,
  pen100Mm: round.pen100Mm,
  pen1000Mm: round.pen1000Mm,
  dmg: round.dmg,
  velocityMps: round.velocityMps,
  reloadS: round.reloadS,
  count: round.count,
})), [
  {
    name: 'MGM-51E TTS Shillelagh ATGM', type: 'HEAT', guided: true,
    pen100Mm: 1050, pen1000Mm: 1050, dmg: 880, velocityMps: 240.5,
    reloadS: 7.4, count: 18,
  },
  {
    name: 'M409A1 TTS HEAT-MP', type: 'HEAT', guided: false,
    pen100Mm: 680, pen1000Mm: 680, dmg: 680, velocityMps: 730,
    reloadS: 7.4, count: 28,
  },
  {
    name: 'M657A2 TTS HE-T', type: 'HE', guided: false,
    pen100Mm: 55, pen1000Mm: 55, dmg: 820, velocityMps: 683,
    reloadS: 7.4, count: 12,
  },
], 'TTS exposes guided, conventional, and high-explosive 152 mm ammunition');

const ttsCombat = createCombatState(ttsSpec);
assert.equal(ttsCombat.reloadChannels[0], ttsCombat.gunReload,
  'TTS gun-launched missile and conventional rounds share the M81 breech cycle');
ttsCombat.shellSlot = 0;
ttsCombat.ammo[0] = 0;
assert.equal(selectShell(ttsCombat, 1, ttsSpec), true,
  'slot 2 remains selectable after the TTS missile channel is exhausted');
assert.equal(ttsCombat.shellSlot, 1);
assert.equal(selectShell(ttsCombat, 2, ttsSpec), true,
  'slot 3 exposes the TTS high-explosive channel');
assert.equal(ttsCombat.shellSlot, 2);
for (const slot of [1, 2]) {
  const round = ttsSpec.gun.shells[slot];
  const projectile = createShell(
    round, ttsSpec.id, true,
    new THREE.Vector3(0, 10, 0), new THREE.Vector3(0, 0, 1), 5510 + slot,
  );
  assert.equal(specialActionGuidesShell({ spec: ttsSpec, combat: ttsCombat }, projectile), false,
    `${round.name} does not inherit ATGM steering from the tank`);
  stepShell(projectile, 1 / 60);
  assert.ok(projectile.vel.y < 0, `${round.name} follows normal ballistic gravity`);
}
assert.equal(garageStatGroup(ttsSpec), '10/next-generation');
for (const sector of [
  'm551a1_tts_glacis_era', 'm551a1_tts_hull_era_R', 'm551a1_tts_hull_era_L',
  'm551a1_tts_turret_era_R', 'm551a1_tts_turret_era_L', 'm551a1_tts_turret_roof_era',
]) {
  assert.ok([...ttsSpec.armor.hullPlates, ...ttsSpec.armor.turretPlates]
    .some((plate) => plate.name === sector && plate.kind === 'era'),
  `${sector} is backed by damageable gameplay ERA`);
}

const missile = createShell(
  spec.gun.shells[0], spec.id, true,
  new THREE.Vector3(), new THREE.Vector3(0, 0, 1), 60,
);
const initialSpeed = missile.vel.length();
assert.equal(specialActionGuidesShell({ spec, combat: createCombatState(spec) }, missile), true,
  'the selected primary Shillelagh remains guided without a secondary-weapon mode');
assert.equal(guideShellToward(missile, new THREE.Vector3(18, 2, 80), 1 / 60), true);
assert.ok(missile.vel.x > 0, 'Shillelagh steers toward the sight-owned target');
assert.ok(Math.abs(missile.vel.length() - initialSpeed) < 1e-9,
  'guided steering preserves authored missile speed');

const tank = createTank(spec.id, null, {
  proceduralOnly: true,
  quality: 'high',
  camoSeed: 4242,
  geometryReceipt: true,
});
let baseRunningGearContract;
try {
  const hull = tank.root.getObjectByName('rig_hull');
  assert.deepEqual(hull?.userData.sheridanReceipt, {
    roadWheelsPerSide: 5,
    missileOnly: true,
    layeredEraSectors: 5,
    roofMachineGuns: 2,
    rearFuelDrums: 2,
    fuelDrumSupportRails: 3,
    rearFuelCenterZ: -3.12,
    backgroundTrackPanels: 0,
    endWheelScale: 1.25,
    returnRollersPerSide: 3,
    returnRollerProfile: [
      { z: 1.45, y: 0.926, r: 0.095 },
      { z: 0, y: 0.945, r: 0.095 },
      { z: -1.45, y: 0.964, r: 0.095 },
    ],
    roadWheelFaceProfile: 'stepped-noncoplanar-v2',
    commanderAmmoBoxClosed: true,
    turretRoofClosed: true,
    mantletProfile: 'faceted-forward-trapezoid-integrated-m81',
    mantletSideTrapezoid: true,
    mantletForwardFace: true,
    mantletIntegratedReceiver: true,
    mantletFrontWidth: 0.97,
    mantletFrontHeight: 0.22,
    hullCreaseDeg: 16,
    turretCreaseDeg: 13,
  });

  const gear = hull.userData.runningGearReceipts?.at(-1);
  baseRunningGearContract = {
    wheelZs: gear.wheelZs,
    wheelR: gear.wheelR,
    wheelY: gear.wheelY,
    sprocket: gear.sprocket,
    idler: gear.idler,
    xcLeft: gear.xcLeft,
    xcRight: gear.xcRight,
    trackW: gear.trackW,
    trackTh: gear.trackTh,
    botY: gear.botY,
    topY: gear.topY,
    loopPoints: gear.loopPoints,
    loopLengthM: gear.loopLengthM,
    shoeCountPerSide: gear.shoeCountPerSide,
    shoePitchM: gear.shoePitchM,
  };
  assert.equal(gear?.wheelZs.length, 5, 'five road wheels are authored per side');
  assert.equal(gear?.shoeCountPerSide, 87,
    'track links fully close the enlarged, return-roller-supported course');
  assert.equal(gear?.sprocket.r, 0.305, 'rear sprocket is exactly 25% larger');
  assert.equal(gear?.idler.r, 0.2375, 'front idler is exactly 25% larger');
  assert.ok(gear?.shoePadCoverageRatio >= 0.90, 'track shoes retain full-width pad coverage');
  assert.equal(gear?.suspensionDynamic, true, 'road wheels retain dynamic swing arms');
  assert.ok(gear?.loopPoints.length >= 60, 'dense terminal arcs reseat the track around both end wheels');
  const turnDeg = (before, at, after) => {
    const incoming = [at[0] - before[0], at[1] - before[1]];
    const outgoing = [after[0] - at[0], after[1] - at[1]];
    const cosine = (incoming[0] * outgoing[0] + incoming[1] * outgoing[1])
      / (Math.hypot(...incoming) * Math.hypot(...outgoing));
    return Math.acos(Math.max(-1, Math.min(1, cosine))) * 180 / Math.PI;
  };
  assert.ok(turnDeg(gear.loopPoints.at(-1), gear.loopPoints[0], gear.loopPoints[1]) < 10,
    'rear wrap closes through a smooth tangent instead of a pointed vertex');

  const returnRollers = tank.root.getObjectByName('gearReturnRollerTires');
  const returnRollerDiscs = tank.root.getObjectByName('gearReturnRollerDiscs');
  assert.equal(returnRollers?.count, 6, 'three return rollers support each Sheridan track');
  assert.equal(returnRollerDiscs?.count, 6, 'every return roller retains a separate wheel face');
  const rollerMatrix = new THREE.Matrix4();
  const rollerPosition = new THREE.Vector3();
  const rightRollerStations = [];
  for (let index = 0; index < returnRollers.count; index++) {
    returnRollers.getMatrixAt(index, rollerMatrix);
    rollerPosition.setFromMatrixPosition(rollerMatrix);
    if (rollerPosition.x > 0) rightRollerStations.push([
      Number(rollerPosition.z.toFixed(3)), Number(rollerPosition.y.toFixed(3)),
    ]);
  }
  assert.deepEqual(rightRollerStations, [[1.45, 0.926], [0, 0.945], [-1.45, 0.964]],
    'return roller crowns rise smoothly toward the rear sprocket tangent');

  assert.ok(tank.root.getObjectByName('sheridanCommanderM2AmmoBox'),
    'the commander M2 rack contains a closed ammunition box');
  for (const name of [
    'gearRoadWheelPressedRims', 'gearRoadWheelDishWells',
    'gearRoadWheelHubDrums', 'gearRoadWheelHubCaps',
  ]) {
    assert.ok(tank.root.getObjectByName(name), `${name} is suspension-bound wheel geometry`);
  }
  const rim = tank.root.getObjectByName('gearRoadWheelPressedRims');
  rim.geometry.computeBoundingBox();
  const rimSize = new THREE.Vector3();
  rim.geometry.boundingBox.getSize(rimSize);
  assert.ok(rimSize.x < rimSize.y * 0.12 && rimSize.x < rimSize.z * 0.12,
    'road-wheel rings lie in the YZ wheel-face plane, not perpendicular to the discs');

  const gunMount = tank.root.getObjectByName('gunMount');
  const gunPosition = gunMount.geometry.getAttribute('position');
  const hasGunVertex = (x, y, z, tolerance = 1e-5) => {
    for (let index = 0; index < gunPosition.count; index++) {
      if (Math.abs(gunPosition.getX(index) - x) <= tolerance
        && Math.abs(gunPosition.getY(index) - y) <= tolerance
        && Math.abs(gunPosition.getZ(index) - z) <= tolerance) return true;
    }
    return false;
  };
  assert.ok(hasGunVertex(-0.4812, -0.0914, 0.86)
    && hasGunVertex(0.4888, 0.1286, 0.86),
  'M81 mantlet terminates in a finite forward face instead of a point ridge');
  assert.equal(hasGunVertex(0.5188, 0.0186, 0.86), false,
    'M81 side no longer converges into the old triangular ridge vertex');
  assert.ok(hasGunVertex(-0.5112, -0.2464, 0.18)
    && hasGunVertex(0.5188, 0.2836, 0.18),
  'M81 mantlet keeps a broad planar rear attachment face');
  assert.ok(hasGunVertex(-0.49, -0.24, 0.48)
    && hasGunVertex(0.45, 0.24, 0.48),
  'marked turret receiver is transformed into and merged with the gun-owned mantlet');

  const era = tank.root.userData.eraFinishReceipt;
  assert.equal(era?.camoProjection, 'vehicle-scale-box-uv');
  assert.equal(era?.bodyAndCoverUseVehiclePaint, true);
  assert.equal(era?.layeredCassettes, 38);
  assert.deepEqual(new Set(era?.gameplaySectors), new Set([
    'sheridan_glacis_era',
    'sheridan_skirt_era_L', 'sheridan_skirt_era_R',
    'sheridan_turret_era_L', 'sheridan_turret_era_R',
  ]));

  const fittings = [];
  tank.root.traverse((object) => {
    if (object.userData?.fittingRoot) fittings.push(object.userData.fitting);
  });
  assert.equal(fittings.filter((kind) => kind === 'pintleMG').length, 2,
    'both roof stations have a seated machine gun');
} finally {
  tank.dispose();
}

const ttsTank = createTank(ttsSpec.id, null, {
  proceduralOnly: true,
  quality: 'high',
  camoSeed: 4242,
  geometryReceipt: true,
});
try {
  const hull = ttsTank.root.getObjectByName('rig_hull');
  const receipt = hull?.userData.sheridanReceipt;
  assert.equal(receipt?.roadWheelsPerSide, 5);
  assert.equal(receipt?.roofMachineGuns, 1,
    'the TTS carries one roof machine gun (the shielded M2 on the loader\'s ring) beside its remote 30 mm');
  assert.equal(receipt?.rearFuelDrums, 0,
    'the TTS engine-deck extension replaces the donor rear drum cradle');
  assert.deepEqual(receipt?.ttsUpgrade, {
    rearDeckEndZ: -3.62,
    runningGearReused: true,
    remoteAutocannonCaliberMm: 30,
    remoteAutocannonBarrelDiameterM: 0.094,
    largeGunRightSearchlight: true,
    additionalEraCassettes: 80,
    skirtArmorPanelsPerSide: 6,
    skirtEraRows: 2,
    skirtEraCassettesPerSide: 24,
    skirtCageStations: 8,
    turretCheekEraCassettesPerSide: 6,
    turretCheekContactEmbedM: 0.012,
    bustleConstruction: 'armored-core-open-cage',
    bustleCageRearZ: -2.26,
    rearFuelDrums: 0,
  });

  const gear = hull.userData.runningGearReceipts?.at(-1);
  const ttsRunningGearContract = {
    wheelZs: gear.wheelZs,
    wheelR: gear.wheelR,
    wheelY: gear.wheelY,
    sprocket: gear.sprocket,
    idler: gear.idler,
    xcLeft: gear.xcLeft,
    xcRight: gear.xcRight,
    trackW: gear.trackW,
    trackTh: gear.trackTh,
    botY: gear.botY,
    topY: gear.topY,
    loopPoints: gear.loopPoints,
    loopLengthM: gear.loopLengthM,
    shoeCountPerSide: gear.shoeCountPerSide,
    shoePitchM: gear.shoePitchM,
  };
  assert.deepEqual(ttsRunningGearContract, baseRunningGearContract,
    'M551A1 TTS reuses the Sheridan wheels and complete closed track loop exactly');

  // 2026-10-09 (owner order: "give the tts its old machine gun back, except put the new machine gun you added on it
  // somewhere else"; the coordinator's reading): the 2026-09-30 remote 30 mm station is back on the commander's rear ring
  // exactly as before a0b6b3a64 (its pins below are that commit's predecessor's), and the commander's shielded M2 that
  // a0b6b3a64 activated moved, with its ring, to the loader's hatch ring on a pintle arm. Both are working stations.
  // (2026-09-30, 884384729 controls integration, 4c34b3e8b remote roof weapons: the TTS 30 mm station is the shared
  // remote auxiliary station; its stock lives in yaw and pitch meshes under rig_turret/m551a1TtsRemoteAutocannon, and the
  // barrel is measured on the actual pitching geometry.)
  const remoteAutocannon = ttsTank.root.getObjectByName('m551a1TtsRemoteAutocannon');
  assert.ok(remoteAutocannon?.userData.remoteControlled && remoteAutocannon.userData.caliberMm === 30
    && remoteAutocannon.userData.fittingExact && remoteAutocannon.parent?.name === 'rig_turret',
  'TTS 30 mm remote station is one exact turret-mounted fitting');
  const remoteAutocannonMechanism = remoteAutocannon.getObjectByName('m551a1TtsRemoteAutocannon_pitch_turretDark');
  assert.ok(remoteAutocannonMechanism?.isMesh && remoteAutocannonMechanism.parent?.name === 'auxiliaryWeaponPitch',
    'TTS breech, barrel and muzzle pitch with the station');
  ttsTank.root.updateMatrixWorld(true);
  const { auxiliaryPivot, barrelAxisLocalY, muzzleLocalZ } = remoteAutocannon.userData;
  const barrelAxis = remoteAutocannonMechanism.parent.localToWorld(new THREE.Vector3(
    0, barrelAxisLocalY - auxiliaryPivot[1], muzzleLocalZ - auxiliaryPivot[2] - 0.4));
  const barrelFace = (sign) => new THREE.Raycaster(barrelAxis.clone().add(new THREE.Vector3(sign * 0.5, 0, 0)),
    new THREE.Vector3(-sign, 0, 0), 0, 0.5).intersectObject(remoteAutocannonMechanism, false)[0]?.point.x ?? NaN;
  const barrelDiameterM = barrelFace(1) - barrelFace(-1);
  assert.ok(Math.abs(barrelDiameterM - 0.094) < 1e-3,
    `TTS 30 mm barrel keeps a lean remote-weapon silhouette (${barrelDiameterM} m)`);
  assert.equal(remoteAutocannon.getObjectByName('m551a1TtsRemoteAutocannon_pitch_turretEquipment')?.material,
    ttsTank.root.getObjectByName('turretEquipment')?.material,
    'remote-station armor shares the vehicle-scale camouflage material');
  assert.equal(remoteAutocannon.getObjectByName('m551a1TtsRemoteAutocannon_pitch_turretGlass')?.material,
    ttsTank.root.getObjectByName('turretGlass')?.material,
    'remote-station apertures share the canonical optics material');
  const insideAutocannon = (name) => {
    const found = ttsTank.root.getObjectByName(name);
    for (let node = found; node; node = node.parent) if (node === remoteAutocannon) return true;
    return false;
  };
  assert.equal(insideAutocannon('sheridanCommanderM2AmmoBox'), false,
    'the M2 and its ammunition rack do not survive inside the 30 mm station');
  const loaderStation = ttsTank.root.getObjectByName('m551a1TtsLoaderM2');
  assert.ok(loaderStation?.userData.remoteControlled && loaderStation.userData.caliberMm === 12.7
    && loaderStation.userData.fittingExact && loaderStation.parent?.name === 'rig_turret',
  'TTS loader-ring M2 is one exact turret-mounted working station');
  const loaderGun = loaderStation.getObjectByName('americanM2HBBody');
  let pitches = false;
  for (let node = loaderGun; node; node = node.parent) if (node.name === 'auxiliaryWeaponPitch') pitches = true;
  assert.ok(loaderGun?.isMesh && pitches, 'the loader-ring M2 pitches with its station');
  assert.equal(loaderStation.getObjectByName('fitting_americanM2HB')?.userData.shieldVariant, 'standard',
    'the moved M2 keeps its ballistic shield');
  assert.equal(ttsTank.root.getObjectByName('m551a1TtsCommanderM2'), undefined,
    'no gun stays on the commander\'s cupola under the 30 mm barrel');
  // the M2 clears the roof sight's window behind the hatch (it looks forward over the hatch) and stays off the 30 mm
  // station's sight head: every vertex of the gun stands above the window's top or outside its lane
  {
    const turret = ttsTank.root.getObjectByName('rig_turret');
    const toTurret = new THREE.Matrix4().copy(turret.matrixWorld).invert();
    const v = new THREE.Vector3();
    let inWindowLane = 0, inSightHead = 0, vertices = 0;
    loaderStation.traverse((mesh) => {
      if (!mesh.isMesh) return;
      const position = mesh.geometry.getAttribute('position');
      const toLocal = new THREE.Matrix4().multiplyMatrices(toTurret, mesh.matrixWorld);
      for (let i = 0; i < position.count; i++) {
        v.fromBufferAttribute(position, i).applyMatrix4(toLocal); vertices++;
        if (v.x > 0.29 && v.x < 0.60 && v.y > 0.94 && v.y < 1.08 && v.z > -0.27) inWindowLane++;
        if (v.x < 0.07 && v.y > 1.26 && v.y < 1.70 && v.z > -0.29 && v.z < 2.0) inSightHead++;
      }
    });
    assert.ok(vertices > 1000, `the loader-ring M2 was measured (${vertices} vertices)`);
    assert.equal(inWindowLane, 0, 'the loader-ring M2 leaves the roof sight\'s window clear');
    assert.equal(inSightHead, 0, 'the loader-ring M2 stays off the 30 mm station\'s sight head and its view');
  }
  const fittings = [];
  ttsTank.root.traverse((object) => {
    if (object.userData?.fittingRoot) fittings.push(object.userData.fitting);
  });
  assert.equal(fittings.filter((kind) => kind === 'pintleMG').length, 2,
    'TTS has two roof gun fittings: the remote 30 mm station and the loader-ring M2 station');

  const era = ttsTank.root.userData.eraFinishReceipt;
  assert.equal(era?.camoProjection, 'vehicle-scale-box-uv');
  assert.equal(era?.bodyAndCoverUseVehiclePaint, true);
  assert.equal(era?.layeredCassettes, 118,
    'TTS adds two full-length skirt courses without changing the donor running gear');
  assert.equal(era?.partsBySector?.m551a1_tts_hull_era_L, 48);
  assert.equal(era?.partsBySector?.m551a1_tts_hull_era_R, 48);
  assert.equal(era?.partsBySector?.m551a1_tts_turret_era_L, 12);
  assert.equal(era?.partsBySector?.m551a1_tts_turret_era_R, 12);
  assert.deepEqual(new Set(era?.gameplaySectors), new Set([
    'sheridan_glacis_era', 'sheridan_skirt_era_L', 'sheridan_skirt_era_R',
    'sheridan_turret_era_L', 'sheridan_turret_era_R',
    'm551a1_tts_glacis_era', 'm551a1_tts_hull_era_L', 'm551a1_tts_hull_era_R',
    'm551a1_tts_turret_era_L', 'm551a1_tts_turret_era_R', 'm551a1_tts_turret_roof_era',
  ]));
} finally {
  ttsTank.dispose();
}

console.log('sheridan.selftest: Tier IX base and Tier X TTS missile/geometry contracts verified');
