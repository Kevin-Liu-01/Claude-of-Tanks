import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { getSpec, MODEL_SOURCE } from '../specs.ts';
import { tankTier } from '../tier.ts';
import { wheelPatternFor } from '../wheelPatterns.ts';
import { resolveCamoVisual } from '../materials.ts';
import { vehicleMarkingAnchor } from '../vehicleMarkings.ts';
import { createTankState, SIM_DT } from '../../sim/movement.ts';
import { createShell, stepShell } from '../../sim/ballistics.ts';
import { createCombatState, selectShell } from '../../sim/damage.ts';
import { specialActionGuidesShell } from '../../sim/specialActions.ts';

const spec = getSpec('mbt70');
assert(spec, 'MBT-70 is registered');
assert.equal(tankTier('mbt70'), 10, 'MBT-70 occupies the German Tier X missile lane');
assert.equal(MODEL_SOURCE.mbt70?.source, 'procedural', 'playable never loads the comparison GLB');
assert.equal(spec.authorship?.runtimeExternalGeometry, false, 'runtime external geometry is prohibited');
assert.equal(spec.nation, 'Germany', 'garage nation is Germany');
// Round 32 (owner 2026-09-21: "i want the default camos of our tanks to be what they were before"): Factory is the
// Bundeswehr service pattern again — the Leopard 2A6M bands (`service_leo2a6m`) — while the nation's plain colour
// stays its own selectable entry (`national_de`, Bundeswehr bronze green) and the modernized flecktarn is the Signature.
const factoryVisual = resolveCamoVisual(spec, 'factory');
assert.equal(factoryVisual.scheme, 'stripes', 'Factory paint is the Bundeswehr service band scheme');
assert.equal(factoryVisual.base, '#48503f', 'Factory paint carries the Leopard 2A6M service base coat');
const nationalVisual = resolveCamoVisual(spec, 'national_de');
assert.equal(nationalVisual.scheme, 'solid', 'the national colour scheme is a plain coat');
assert.equal(nationalVisual.base, '#3f4a37', 'Bundeswehr bronze green is the German national colour');
assert.equal(nationalVisual.patches.length, 0, 'a national colour carries no camouflage patches');
const donorVisual = resolveCamoVisual(spec, 'service_leo2a6m');
assert.equal(donorVisual.scheme, 'stripes', 'the Leopard 2A6M donor band language stays selectable as a Service paint');
const signatureVisual = resolveCamoVisual(spec, 'signature');
assert.equal(signatureVisual.scheme, 'fleck',
  'MBT-70 retains its authored modernized Bundeswehr flecktarn as Signature paint');
assert.equal(signatureVisual.base, '#4b5142',
  'MBT-70 Signature cannot regress to the old bright olive-green coat');
assert.ok(signatureVisual.patches.length >= 3 && signatureVisual.camoScale <= 0.45,
  'Signature flecktarn carries enough tonal layers and a tight enough repeat to read at gallery range');
assert.equal(spec.gun.caliberMm, 152);
assert.equal(spec.gun.primaryGuided, true, 'launcher ATGM is the normal primary weapon');
assert.deepEqual(spec.gun.shells.map((round) => ({
  name: round.name,
  type: round.type,
  guided: round.guided === true,
  count: round.count,
})), [
  { name: 'XMGM-51C Shillelagh ATGM', type: 'HEAT', guided: true, count: 13 },
  { name: 'XM578 APFSDS-T', type: 'APFSDS', guided: false, count: 20 },
  { name: 'M409A1 HEAT-MP', type: 'HEAT', guided: false, count: 15 },
], 'XM150 exposes its missile and conventional combustible-case ammunition');
assert.equal(spec.gun.reloadS, 9.8, 'primary gun-launched ATGM uses the normal 152 mm feed cycle');
const combat = createCombatState(spec);
assert.equal(combat.reloadChannels[0], combat.gunReload,
  'gun-launched ATGM shares the XM150 breech reload with conventional rounds');
for (const slot of [1, 2]) {
  assert.equal(selectShell(combat, slot, spec), true,
    `MBT-70 conventional slot ${slot + 1} is selectable`);
  const round = spec.gun.shells[slot];
  const projectile = createShell(
    round, spec.id, true, new THREE.Vector3(0, 10, 0), new THREE.Vector3(0, 0, 1), 700 + slot,
  );
  assert.equal(specialActionGuidesShell({ spec, combat }, projectile), false,
    `${round.name} remains an ordinary ballistic shell`);
  stepShell(projectile, SIM_DT);
  assert.ok(projectile.vel.y < 0, `${round.name} receives shell gravity instead of missile guidance`);
}
assert.equal(typeof spec.hydropneumaticAim, 'object',
  'MBT-70 suspension aim owns an explicit physical travel envelope');
assert.ok(spec.hydropneumaticAim.compressionM >= 0.60 && spec.hydropneumaticAim.droopM >= 0.60,
  'MBT-70 carries enough wheel travel to reshape its long seven-wheel course');
assert.equal(spec.armor.turretPivot[2], 0.57,
  'extended bustle is balanced by moving the complete turret rig forward');
assert.equal(spec.armor.turretPivot[1], 1.49,
  'turret ring is lowered onto the donor hull deck');
assert.equal(spec.dims.overallLengthM, 9.37,
  'published envelope follows the additional complete-rig forward seat');
// 2026-09-22 owner ("germany uses the kf51 panther, leopard 2a6, lynx wheels"): the German-registered MBT-70
// draws the Leopard 2A6 nation wheel; the Abrams hull loft and suspension it borrows are unchanged.
assert.equal(wheelPatternFor(spec).id, 'plain-dish-twelve',
  'MBT-70 takes the Germany nation wheel pattern (Leopard 2A6 donor)');
assert.ok(vehicleMarkingAnchor('mbt70').longitudinal <= 0.25,
  'generated MBT-70 insignia is ray-seated on the rear quarter of the turret');
assert(spec.armor.modules.some((module) => module.module === 'missileRack'),
  'authored turret magazine exposes a missile-rack damage volume');
assert(spec.armor.crew.every((crew) => crew.turretLocal),
  'all three MBT-70 crew stations are authored inside the turret');

const tank = createTank('mbt70', null, { proceduralOnly: true, geometryReceipt: true });
await Promise.resolve();
const bounds = new THREE.Box3().setFromObject(tank.root);
const size = bounds.getSize(new THREE.Vector3());
assert.ok(Math.abs(size.z - spec.dims.overallLengthM) < 0.08,
  `complete length follows the M1A1-derived launcher envelope (${size.z.toFixed(3)})`);
assert.ok(Math.abs(size.x - spec.dims.widthM) < 0.08,
  `complete width follows the 3.51 m source datum (${size.x.toFixed(3)})`);
// 2026-09-17 ground datum: the hull sits ~2 cm lower on the 28 mm band (3.232); the station's seat on the turret is unchanged
assert.ok(size.y > 3.21 && size.y < 3.36,
  `commander station remains seated on the low rounded turret (${size.y.toFixed(3)})`);
for (const name of ['rig_hull', 'rig_turret', 'rig_gun', 'rig_muzzle']) {
  assert(tank.root.getObjectByName(name), `${name} articulation exists`);
}
const gunRig = tank.root.getObjectByName('rig_gun');
const mantlet = gunRig.userData.mbt70MantletReceipt;
assert.equal(mantlet?.profile, 'parabolic-arrow',
  'cast shield uses the MBT-70 rounded-arrow/parabolic contour');
assert.equal(mantlet?.circularMainShield, false,
  'main mantlet cannot regress to a circular cylinder or torus');
assert.equal(mantlet?.orientation, 'vertical',
  'compound mantlet stands vertically around the launcher axis');
assert.ok(mantlet.heightM > mantlet.widthM,
  'cast shield keeps its vertical semi-cylindrical read');
assert.equal(mantlet.heightM, mantlet.turretHeightM,
  'cast shield height is capped to the turret shell height');
assert.ok(Math.abs(mantlet.verticalCenterOffsetM - 0.03) < 1e-9,
  'cast shield is re-centred from the launcher axis onto the turret shell');
assert.ok(mantlet.planStations >= 13 && mantlet.ringCount >= 5,
  'mantlet has enough plan and elevation stations to hold the compound curve');
assert.ok(mantlet.rearOverlapM >= 0.30,
  'mantlet root penetrates the turret nose instead of floating ahead of it');
assert.ok(mantlet.depthM < 1.20 && mantlet.foreAftScale < 0.90,
  'mantlet fore-aft projection is shortened without removing its rear overlap');
assert.ok(mantlet.rootRecessWidthM < mantlet.widthM * 0.50,
  'launcher-root recess is substantially narrower than the cast shield');
assert.ok(mantlet.rootRecessHeightM < mantlet.heightM * 0.60,
  'launcher-root recess is substantially shorter than the cast shield');
assert.equal(mantlet.xm150Sleeve, true);
assert.equal(mantlet.nearMuzzleSensor, true);
const turretRig = tank.root.getObjectByName('rig_turret');
const turretShell = turretRig.getObjectByName('turret');
const gunMount = gunRig.getObjectByName('gunMount');
// Owner's Gallery patch: the cone at Z 1.065..1.315 must narrow toward
// the muzzle. Probe the actual side surface, not a builder receipt label.
for (const quality of ['high', 'low']) {
  const visual = createTank('mbt70', null, { proceduralOnly:true, geometryReceipt:true, quality });
  try {
    const pitch=visual.root.getObjectByName('rig_gun'),mount=pitch.getObjectByName('gunMount');
    visual.root.updateMatrixWorld(true);
    const radiusAt=z=>{
      const hit=new THREE.Raycaster(pitch.localToWorld(new THREE.Vector3(0,.4,z)),
        new THREE.Vector3(0,-1,0).transformDirection(pitch.matrixWorld),0,.4).intersectObject(mount,false)[0];
      assert.ok(hit,`${quality}: launcher cone has a physical side surface`);
      return pitch.worldToLocal(hit.point.clone()).y;
    };
    assert.ok(Math.abs(radiusAt(1.10)-.213)<.002,`${quality}: wide rear seats against the throat ring`);
    assert.ok(Math.abs(radiusAt(1.29)-.175)<.002,`${quality}: narrow front points toward the muzzle`);
  } finally {visual.dispose();}
}
const turretShellBounds = new THREE.Box3().setFromObject(turretShell);
const gunMountBounds = new THREE.Box3().setFromObject(gunMount);
assert.ok(gunMountBounds.max.y <= turretShellBounds.max.y + 0.005,
  `mantlet crown stays at the turret roof (${gunMountBounds.max.y.toFixed(3)} <= ${turretShellBounds.max.y.toFixed(3)})`);
assert.ok(gunMountBounds.min.y >= turretShellBounds.min.y - 0.005,
  `mantlet chin stays at the turret base (${gunMountBounds.min.y.toFixed(3)} >= ${turretShellBounds.min.y.toFixed(3)})`);
assert.deepEqual(tank.root.getObjectByName('rig_turret').userData.mbt70TurretReceipt, {
  forwardOffsetM: 0.57,
  structuralWidthM: 3.48,
  hullWidthM: 3.51,
  seatYM: 1.49,
  bustleFloorRiseM: 0.23,
  bustleFloorFrontM: 0,
  bustleFloorRearM: 0.23,
  abramsLikeBustle: true,
  rearQuarterArmorRetained: true,
  rearQuarterClosurePanels: 4,
  turretEraPanels: 6,
  hullEraPanels: 8,
  roofSightBaseYM: 0.8,
  roofSightGapM: 0,
  spareTrackLinkRacks: 2,
  spareTrackLinksPerRack: 4,
  spareTrackMountXM: 1.641,
  spareTrackMountZM: -2.44,
  bustleStowageRacks: 2,
  bustleJerryCanCount: 2,
  bustleTowCable: true,
  insigniaRearLocalZM: -1.72,
  addedEquipmentPieces: 24,
});
const turretEquipment = turretRig.getObjectByName('turretEquipment');
const turretEquipmentPositions = turretEquipment.geometry.getAttribute('position');
let sightVertexCount = 0;
let sightMinLocalY = Infinity;
for (let i = 0; i < turretEquipmentPositions.count; i++) {
  const x = turretEquipmentPositions.getX(i);
  const y = turretEquipmentPositions.getY(i);
  const z = turretEquipmentPositions.getZ(i);
  if (x >= -0.82 && x <= -0.46 && z >= -0.16 && z <= 0.20) {
    sightVertexCount++;
    sightMinLocalY = Math.min(sightMinLocalY, y);
  }
}
assert.ok(sightVertexCount > 0,
  'marked gunner-sight housing remains present in the turret equipment mesh');
assert.ok(Math.abs(sightMinLocalY - 0.80) < 0.005,
  `gunner sight begins on the turret roof with no air gap (${sightMinLocalY.toFixed(3)} m)`);
for (const side of ['left', 'right']) {
  const links = turretRig.getObjectByName(`mbt70_bustle_spare_links_${side}`);
  assert(links, `${side} bustle carries a real spare-track fitting`);
  assert.equal(links.parent, turretRig, `${side} spare links rotate with the turret`);
  assert.ok(Math.abs(Math.abs(links.position.x) - 1.641) < 1e-9
    && links.position.z <= -2.40,
    `${side} spare links sit flush against the aft bustle quarter`);
  assert.ok(Math.abs(Math.abs(links.rotation.z) - Math.PI / 2) < 1e-9,
    `${side} spare links hang vertically against the side plate`);

  tank.root.updateMatrixWorld(true);
  const linkBounds = new THREE.Box3().setFromObject(links);
  const linkCenter = linkBounds.getCenter(new THREE.Vector3());
  const isLeft = side === 'left';
  const shellHit = new THREE.Raycaster(
    new THREE.Vector3(isLeft ? -4 : 4, linkCenter.y, linkCenter.z),
    new THREE.Vector3(isLeft ? 1 : -1, 0, 0),
    0,
    8,
  ).intersectObject(turretShell, false)[0];
  assert(shellHit, `${side} spare-link centerline intersects the bustle cheek`);
  const innerFaceX = isLeft ? linkBounds.max.x : linkBounds.min.x;
  assert.ok(Math.abs(innerFaceX - shellHit.point.x) <= 0.006,
    `${side} spare links contact the bustle cheek without a visible air gap`);
}
for (const name of [
  'mbt70_bustle_stowage_rack_left',
  'mbt70_bustle_stowage_rack_right',
  'mbt70_bustle_jerry_cans',
  'mbt70_bustle_tow_cable',
]) {
  const fitting = turretRig.getObjectByName(name);
  assert(fitting, `${name} is present`);
  assert.equal(fitting.parent, turretRig, `${name} remains attached through turret yaw`);
}
assert.ok(turretRig.userData.mbt70TurretReceipt.bustleFloorRearM
  > turretRig.userData.mbt70TurretReceipt.bustleFloorFrontM + 0.20,
  'bustle underside rises aft to clear the donor engine deck');
assert.ok(turretRig.userData.mbt70TurretReceipt.rearQuarterClosurePanels >= 4,
  'rear sprocket cavities receive attached armor closures');
assert.ok(turretRig.userData.mbt70TurretReceipt.turretEraPanels >= 6
  && turretRig.userData.mbt70TurretReceipt.hullEraPanels >= 8,
  'modernized MBT-70 carries substantial turret and glacis ERA coverage');
assert.ok(Math.abs(tank.root.getObjectByName('rig_turret').userData.mbt70TurretReceipt.structuralWidthM
  - spec.dims.widthM) <= 0.04,
  'structural turret shell spans the same visual width as the hull');
const turretBounds = new THREE.Box3().setFromObject(tank.root.getObjectByName('rig_turret'));
const bustleAftLocal = turretBounds.min.z - spec.armor.turretPivot[2];
assert.ok(bustleAftLocal < -3.05,
  `Abrams-like bustle and attached basket retain their local aft reach (${bustleAftLocal.toFixed(3)})`);
assert(tank.root.getObjectByName('gearTrackBandL') && tank.root.getObjectByName('gearTrackBandR'),
  'both continuous track loops exist');
assert.equal(tank.root.getObjectByName('gearRoadWheelDiscs')?.count, 14,
  'M1A1 donor running gear retains seven road wheels per exposed side');
assert.equal(tank.root.getObjectByName('gearReturnRollerTires')?.count, 6,
  'MBT-70 carries three return rollers per exposed side');
assert.equal(tank.root.getObjectByName('gearReturnRollerDiscs')?.count, 6,
  'MBT-70 return rollers retain separate painted hubs and rubber tires');
const mbt70GearReceipt = tank.root.getObjectByName('rig_hull')?.userData.runningGearReceipts?.[0];
assert.ok(mbt70GearReceipt.topY >= 1.06 - 1e-6,
  'MBT-70 upper track runs well above the road-wheel crowns');
// 2026-09-17 track law: the band centreline runs a band below the authored topY (1.029 for 1.06); the rollers
// support the loop's own flat top run, so the witness compares against that run rather than topY.
const mbt70TopRunY = mbt70GearReceipt.loopPoints.find(([z]) => Math.abs(z) <= 1e-6 && true)[1];
assert.ok(mbt70TopRunY >= 1.0 && mbt70TopRunY <= mbt70GearReceipt.topY, `MBT-70 upper track run stays well above the road-wheel crowns and under the authored topY (${mbt70TopRunY.toFixed(3)})`);
for (const rollerZ of [1.46, 0, -1.46]) {
  assert.ok(mbt70GearReceipt.loopPoints.some(([z, y]) => Math.abs(z - rollerZ) <= 1e-6
    && Math.abs(y - mbt70TopRunY) <= 1e-6),
  `MBT-70 upper track is supported by the return roller at z=${rollerZ}`);
}
assert.deepEqual(tank.root.getObjectByName('rig_hull')?.userData.nativeWheelPatterns,
  ['plain-dish-twelve'], 'native running gear records the one Germany nation wheel pattern (2026-09-22)');
assert(tank.root.getObjectByName('muzzleBoreShadowDisc'), '152 mm launcher has an open bore');

// The hydropneumatic pose must articulate the complete inherited Abrams gear,
// not leave a rigid belt and wheel train sliding through the floor. This is a
// render-rig contract: read the actual instance matrices and band vertices.
const state = createTankState(spec, new THREE.Vector3(), 0);
state.visualPitch = THREE.MathUtils.degToRad(10);
tank.setGroundSampler(() => 0);
const band = tank.root.getObjectByName('gearTrackBandL');
const restBand = Float32Array.from(band.geometry.getAttribute('position').array);
for (let frame = 0; frame < 48; frame++) tank.syncFromState(state, SIM_DT);

const wheels = tank.root.getObjectByName('gearRoadWheelTires');
const matrix = new THREE.Matrix4();
const position = new THREE.Vector3();
let minWheelY = Infinity;
let maxWheelY = -Infinity;
for (let instance = 0; instance < wheels.count; instance++) {
  wheels.getMatrixAt(instance, matrix);
  position.setFromMatrixPosition(matrix);
  minWheelY = Math.min(minWheelY, position.y);
  maxWheelY = Math.max(maxWheelY, position.y);
}
assert.ok(maxWheelY - minWheelY >= 0.38,
  `MBT-70 hydraulic posture visibly staggers the road wheels (${(maxWheelY - minWheelY).toFixed(3)} m)`);

const deformedBand = band.geometry.getAttribute('position').array;
let maxBandTravel = 0;
for (let i = 1; i < deformedBand.length; i += 3) {
  maxBandTravel = Math.max(maxBandTravel, Math.abs(deformedBand[i] - restBand[i]));
}
assert.ok(maxBandTravel >= 0.34,
  `MBT-70 loaded track run reshapes with the wheels (${maxBandTravel.toFixed(3)} m)`);
tank.dispose();

// The MBT-70 shortens and re-seats its complete donor hull after construction.
// Terrain samples must use those transformed wheel stations, not the M1A1's
// stale pre-transform coordinates.
const contactTank = createTank('mbt70', null, { proceduralOnly: true, geometryReceipt: true });
const contactHull = contactTank.root.getObjectByName('rig_hull');
const frontWheelZ = contactHull.userData.runningGearReceipts[0].wheelZs[0];
const frontWheelWorldZ = frontWheelZ * contactHull.scale.z + contactHull.position.z;
contactTank.setGroundSampler((_x, z) => Math.abs(z - frontWheelWorldZ) < 0.015 ? 0.25 : 0);
const contactState = createTankState(spec, new THREE.Vector3(), 0);
for (let frame = 0; frame < 48; frame++) contactTank.syncFromState(contactState, SIM_DT);
const contactWheels = contactTank.root.getObjectByName('gearRoadWheelTires');
let raisedFrontWheelY = -Infinity;
for (let instance = 0; instance < contactWheels.count; instance++) {
  contactWheels.getMatrixAt(instance, matrix);
  position.setFromMatrixPosition(matrix);
  if (Math.abs(position.z - frontWheelZ) < 1e-3) {
    raisedFrontWheelY = Math.max(raisedFrontWheelY, position.y);
  }
}
// 2026-09-17 ground datum: the front station rests on the gear receipt's wheelY (.381); the 0.25 m step lifts it
const restFrontWheelY = contactHull.userData.runningGearReceipts[0].wheelY;
assert.ok(raisedFrontWheelY >= restFrontWheelY + 0.20,
  `terrain conformance samples the re-seated front station (${raisedFrontWheelY.toFixed(3)} m local Y over rest ${restFrontWheelY.toFixed(3)})`);
contactTank.dispose();

console.log('mbt70Fidelity.selftest: source proportions, procedural ownership, anatomy and ATGM contract pass');

// Keep the donor-family roller and turret-seat regressions on the existing
// MBT-70 pretest route without widening package.json's generated command line.
