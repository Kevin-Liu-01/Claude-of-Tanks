import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.ts';

const receipts = new Map();
const turretHeights = new Map();
const shellReceipts = new Map();

function forwardEdgeInBand(mesh, { minY, maxY, minAbsX, maxAbsX }) {
  const position = mesh.geometry.attributes.position;
  let forwardZ = -Infinity;
  for (let index = 0; index < position.count; index++) {
    const x = Math.abs(position.getX(index));
    const y = position.getY(index);
    if (x < minAbsX || x > maxAbsX || y < minY || y > maxY) continue;
    forwardZ = Math.max(forwardZ, position.getZ(index));
  }
  assert(Number.isFinite(forwardZ), `${mesh.name}: slope sample band contains geometry`);
  return forwardZ;
}

for (const id of ['chieftain5', 'chieftain_mk10']) {
  const tank = createTank(id, null, {
    proceduralOnly: true,
    geometryReceipt: true,
  });
  const hullRig = tank.root.getObjectByName('rig_hull');
  assert.equal(hullRig.userData.nativeRoadWheelStations, 6,
    `${id}: all six suspension-driven road-wheel stations remain`);

  const bands = [];
  const idlers = [];
  tank.root.traverse((object) => {
    if (object.name === 'gearTrackBandL' || object.name === 'gearTrackBandR') bands.push(object);
    if (object.name === 'gearEndWheelBody' && object.position.z > 0) idlers.push(object);
  });
  assert.deepEqual(bands.map((band) => band.name).sort(), ['gearTrackBandL', 'gearTrackBandR'],
    `${id}: exactly one native smart course per side`);
  assert.equal(idlers.length, 2, `${id}: one front idler per side`);
  for (const idler of idlers) {
    assert(Math.abs(idler.position.z - 3.02) < 1e-9,
      `${id}: source-spaced idler reaches beneath the bow shoulder`);
    assert(Math.abs(idler.position.y - 0.64) < 1e-9,
      `${id}: idler stays seated on the raised return-run tangent`);
  }
  for (const band of bands) {
    band.geometry.computeBoundingBox();
    assert(band.geometry.boundingBox.max.z > 3.40,
      `${id}: animated tread wraps through the forward mudguard station`);
    const trackWidth = band.geometry.boundingBox.max.x - band.geometry.boundingBox.min.x;
    const expectedWidth = 0.61;
    assert(Math.abs(trackWidth - expectedWidth) < 1e-6,
      `${id}: native course retains its authored ${expectedWidth.toFixed(3)} m width`);
    const innerFace = Math.abs(band.position.x) - trackWidth / 2;
    assert(Math.abs(innerFace - 1.115) < 1e-6,
      `${id}: family course retains the correct inner running clearance`);
  }

  const combatParts = tank.root.userData.combatGeometryParts;
  const skirtPanels = combatParts.filter((part) =>
    part.bucket === 'hull'
    && Math.abs((part.max[1] - part.min[1]) - 0.765) < 1e-4
    && Math.abs((part.max[2] - part.min[2]) - 0.8568333) < 1e-4
    && (part.max[0] - part.min[0]) <= 0.051
    && Math.max(Math.abs(part.min[0]), Math.abs(part.max[0])) >= 1.749);
  assert.equal(skirtPanels.length, 12,
    `${id}: six continuous armored-skirt panels are present on each side`);
  const rightSkirtInner = Math.min(...skirtPanels.filter((part) => part.min[0] > 0)
    .map((part) => part.min[0]));
  const rightTrackOuter = Math.max(...bands.filter((band) => band.position.x > 0)
    .map((band) => band.position.x + (band.geometry.boundingBox.max.x - band.geometry.boundingBox.min.x) / 2));
  assert(rightSkirtInner >= rightTrackOuter - 1e-5,
    `${id}: track course remains fully inside the armored-skirt envelope`);

  const turret = tank.root.getObjectByName('turret');
  const turretRig = tank.root.getObjectByName('rig_turret');
  const gunRig = tank.root.getObjectByName('rig_gun');
  turret.geometry.computeBoundingBox();
  turretHeights.set(id, turret.geometry.boundingBox.max.y - turret.geometry.boundingBox.min.y);
  assert(Math.abs(gunRig.position.y - 0.06684) < 1e-9,
    `${id}: L11 assembly follows the ten-percent-taller armored-throat datum`);
  receipts.set(id, turret.geometry.attributes.position.count);
  const shellReceipt = turretRig.userData.chieftainArmorShellReceipt;
  shellReceipts.set(id, shellReceipt);
  assert.equal(shellReceipt.revision, 'low-angular-layered-shell-r10',
    `${id}: low angular core and fitted armor-shell rebuild remains active`);
  assert(Math.abs(shellReceipt.turretHeightScale - 0.748) < 1e-12,
    `${id}: turret envelope is exactly ten percent taller than the r9 geometry`);
  assert.equal(shellReceipt.turretHeightGain, 1.10,
    `${id}: turret-height change retains its explicit ten-percent contract`);
  assert.equal(shellReceipt.sourceAxes, 'x,z,-y',
    `${id}: comparison source axes stay documented and canonicalized`);
  assert.equal(shellReceipt.primaryEnvelopeCount, 2,
    `${id}: one closed primary envelope remains on each side of the gun`);
  assert.equal(shellReceipt.primaryConstruction, 'low-faceted-core',
    `${id}: a low structural turret sits beneath the fitted plate package`);
  assert.equal(shellReceipt.primaryPlanStations, 10,
    `${id}: the primary body uses a restrained set of deliberate armor planes`);
  assert.equal(shellReceipt.primarySurfaceFinish, 'hard-faceted',
    `${id}: cheek and crown breaks remain visible instead of smoothing into an oval`);
  assert(shellReceipt.frontSetbackM >= 0.70,
    `${id}: the primary face keeps its deep source-measured rearward slope`);
  assert.equal(shellReceipt.upperShellPanelCount, 7,
    `${id}: six side plates and one center brow form the separate armor shell`);
  assert(shellReceipt.upperShellRetainingSeamM >= 0.035,
    `${id}: armor-shell retaining seams remain large enough to read under camouflage`);

  const primaryLobes = combatParts.filter((part) =>
    part.bucket === 'turret'
    && part.min[2] < -1.50 && part.max[2] > 1.52
    && part.max[1] > 0.46 && part.max[1] < 0.50
    && (part.max[0] < -0.15 || part.min[0] > 0.15));
  assert.equal(primaryLobes.length, 2,
    `${id}: paired halves retain one continuous low structural core`);
  const primaryHalfWidth = Math.max(...primaryLobes.map((part) =>
    Math.max(Math.abs(part.min[0]), Math.abs(part.max[0]))));
  assert(Math.abs(primaryHalfWidth - shellReceipt.primaryHalfWidthM) < 1e-5,
    `${id}: the measured primary width matches the authored low core`);
  const lowerTurretFrontZ = forwardEdgeInBand(turret, {
    minY: -0.18, maxY: 0.05, minAbsX: 1.00, maxAbsX: 1.46,
  });
  const upperTurretFrontZ = forwardEdgeInBand(turret, {
    minY: 0.34, maxY: 0.50, minAbsX: 1.00, maxAbsX: 1.46,
  });
  assert(lowerTurretFrontZ - upperTurretFrontZ > 0.27,
    `${id}: actual outer-cheek vertices form a reclined face before the gun throat`);

  const gunJambs = combatParts.filter((part) =>
    part.bucket === 'turret'
    && part.min[2] >= 0.57 && part.max[2] >= 1.47
    && part.max[1] > 0.40 && part.max[1] < 0.43
    && (part.max[0] < -0.12 || part.min[0] > 0.12));
  assert.equal(gunJambs.length, 2,
    `${id}: the reclined cheeks reform as two tighter square gun-aperture jambs`);
  const crownBridge = combatParts.find((part) =>
    part.bucket === 'turret'
    && part.min[0] < -0.30 && part.max[0] > 0.30
    && part.min[2] >= 0.34 && part.max[2] <= 0.96
    && part.max[1] > 0.52);
  assert(crownBridge,
    `${id}: structural brow closes the squared throat below the fitted shell`);

  const externalArmor = tank.root.getObjectByName('turretExternalArmor');
  assert(externalArmor, `${id}: separate upper armor shell retains external-armor semantics`);
  externalArmor.geometry.computeBoundingBox();
  const shellPanels = combatParts.filter((part) => part.bucket === 'turretExternalArmor');
  assert.equal(shellPanels.length, shellReceipt.upperShellPanelCount,
    `${id}: no hidden or duplicate shell plates survive outside the seven authored panels`);
  const primaryCrownY = Math.max(...primaryLobes.map((part) => part.max[1]));
  assert(externalArmor.geometry.boundingBox.max.y - primaryCrownY > 0.015,
    `${id}: shoulder armor still rises above the taller structural crown`);
  const lowerShellFrontZ = forwardEdgeInBand(externalArmor, {
    minY: -0.01, maxY: 0.10, minAbsX: 0.16, maxAbsX: 1.55,
  });
  const upperShellFrontZ = forwardEdgeInBand(externalArmor, {
    minY: 0.20, maxY: 0.31, minAbsX: 0.16, maxAbsX: 1.55,
  });
  assert(lowerShellFrontZ - upperShellFrontZ > 0.24,
    `${id}: fitted cheek plates preserve the Chieftain's reclined front slope`);
  const forwardShellPanels = shellPanels.filter((part) =>
    part.min[2] > 0.30 && part.max[2] > 1.60
    && (part.max[0] < -0.15 || part.min[0] > 0.15));
  assert.equal(forwardShellPanels.length, 2,
    `${id}: one visibly thick forward armor plate caps each cheek`);
  assert(Math.abs(shellReceipt.frontShellDatumSourceY - shellReceipt.mantletDatumSourceY) < 1e-12,
    `${id}: both forward shells are centered on the mantlet datum`);
  assert(Math.abs(shellReceipt.frontShellDropM - (id === 'chieftain_mk10' ? 0.34 : 0.31)) < 1e-12,
    `${id}: variant shell lift is removed before the mantlet alignment drop`);
  const forwardShellMinY = Math.min(...forwardShellPanels.map((part) => part.min[1]));
  const forwardShellMaxY = Math.max(...forwardShellPanels.map((part) => part.max[1]));
  const forwardShellCenterY = (forwardShellMinY + forwardShellMaxY) * 0.5;
  const mantletDatumY = -0.18 + (0.28 + 0.18) * shellReceipt.turretHeightScale;
  assert(Math.abs(forwardShellCenterY - mantletDatumY) < 0.02,
    `${id}: moved cheek-shell envelope remains vertically centered on the gun mask`);

  const sideFairings = combatParts.filter((part) =>
    part.bucket === 'turret'
    && (part.max[0] > 1.47 || part.min[0] < -1.47)
    && part.max[2] < 0.21 && part.min[2] > -0.58);
  assert.equal(sideFairings.length, 2,
    `${id}: tapered armor fairings grow directly from both turret flanks`);

  const sideCabinets = combatParts.filter((part) =>
    part.bucket === 'turret'
    && part.min[2] < -1.12 && part.max[2] > -0.52
    && (part.max[0] > 1.48 || part.min[0] < -1.48));
  assert.equal(sideCabinets.length, 2,
    `${id}: one external service cabinet projects beyond each cast-turret flank`);
  assert.deepEqual(sideCabinets.map((part) => Math.sign(part.min[0] + part.max[0])).sort(), [-1, 1],
    `${id}: service cabinets remain symmetric in attachment while retaining asymmetric depth`);
  const sideBasketPosts = combatParts.filter((part) =>
    part.bucket === 'turretDetail'
    && (part.max[0] < -1.46 || part.min[0] > 1.46)
    && part.min[2] < -1.95 && part.max[2] > -2.01
    && (part.max[1] - part.min[1]) > 0.24);
  assert.equal(sideBasketPosts.length, 2,
    `${id}: the aft upright on each open flank basket remains attached and visible`);

  const equipmentReceipt = turretRig.userData.chieftainEquipmentReceipt;
  assert.equal(equipmentReceipt.revision, 'source-equipment-seat-r3',
    `${id}: source-compared equipment seating contract remains active`);
  assert.equal(equipmentReceipt.commanderCupolas, 1, `${id}: commander cupola retained`);
  assert.equal(equipmentReceipt.loaderHatches, 1, `${id}: loader hatch retained`);
  assert.equal(equipmentReceipt.smokeBanks, 2, `${id}: paired cheek smoke banks retained`);
  assert.equal(equipmentReceipt.smokeTubes, 12, `${id}: six smoke tubes remain in each bank`);
  assert.equal(equipmentReceipt.sideServiceCabinets, 2,
    `${id}: both turret-side service cabinets retained`);
  assert.equal(equipmentReceipt.sideBustleBaskets, 2,
    `${id}: open side bustle baskets retained`);
  assert.equal(equipmentReceipt.rearBustleBaskets, 1,
    `${id}: rear bustle basket retained`);
  assert.equal(equipmentReceipt.radioWhips, 3, `${id}: three source-spaced radio whips retained`);
  assert.equal(equipmentReceipt.pintleGpmgs, 1, `${id}: roof pintle GPMG retained`);
  let pintleGpmg;
  turretRig.traverse((object) => {
    if (!pintleGpmg
      && object.userData?.fittingRoot
      && object.userData?.fitting === 'pintleMG') {
      pintleGpmg = object;
    }
  });
  assert(pintleGpmg && pintleGpmg.position.y > 0.78 && pintleGpmg.position.y < 0.81,
    `${id}: pintle GPMG remains seated on the ten-percent-taller roof shell`);
  const radioWhips = combatParts.filter((part) =>
    part.bucket === 'turretDark'
    && part.max[1] > 0.90
    && (part.max[2] - part.min[2]) < 0.05
    && (part.max[0] - part.min[0]) < 0.05);
  assert.equal(radioWhips.length, 3,
    `${id}: all three long radio whips remain actual visible geometry`);

  if (id === 'chieftain_mk10') {
    assert.equal(shellReceipt.upperShellType, 'thick-stillbrew-plate-shell',
      'Mk.10: the complete upper package is identified as a thick Stillbrew plate shell');
    assert(shellReceipt.upperShellStandOffM > 0.12,
      'Mk.10: Stillbrew shell has a visually legible structural stand-off');
    assert.equal(equipmentReceipt.primaryOptic, 'armored-thermal-head',
      'Mk.10: armored thermal head retained above the right cheek');
    const thermalAperture = combatParts.find((part) =>
      part.bucket === 'turretGlass'
      && part.min[0] > 0.58 && part.max[0] < 0.82
      && part.min[2] > 0.60 && part.max[2] < 0.63);
    assert(thermalAperture,
      'Mk.10: the mantlet-top thermal aperture remains identifiable in its armored head');
    assert(thermalAperture.max[1] < 0.68,
      'Mk.10: the thermal head is lowered into the cheek instead of floating above the mantlet');
  } else {
    assert.equal(shellReceipt.upperShellType, 'segmented-production-plate-shell',
      'Mk.5: thinner production armor shell remains distinct from the low core');
    assert(shellReceipt.upperShellStandOffM > 0.06 && shellReceipt.upperShellStandOffM < 0.08,
      'Mk.5: production shell has a restrained but visible structural stand-off');
    assert.equal(equipmentReceipt.primaryOptic, 'ir-searchlight',
      'Mk.5: large cheek IR/searchlight retained in its armored shoe');
    const searchlightLens = combatParts.find((part) =>
      part.bucket === 'turretGlass'
      && part.max[0] < -0.50 && part.min[0] > -0.90
      && part.max[2] > 1.30);
    assert(searchlightLens, 'Mk.5: IR/searchlight lens remains visible above the left cheek');
  }
  tank.dispose();
}

for (const [id, height] of turretHeights) {
  assert(height > 1.08 && height < 1.12,
    `${id}: structural turret is exactly ten percent taller while retaining its low crown`);
}
assert(Math.abs(turretHeights.get('chieftain5') - turretHeights.get('chieftain_mk10')) < 1e-6,
  'Mk.5 and Mk.10 retain one shared primary turret family datum');
assert(shellReceipts.get('chieftain_mk10').upperShellStandOffM
    - shellReceipts.get('chieftain5').upperShellStandOffM > 0.05,
  'Mk.10 Stillbrew shell remains materially deeper than the Mk.5 production cap');
assert(shellReceipts.get('chieftain_mk10').upperShellForwardZ
    - shellReceipts.get('chieftain5').upperShellForwardZ > 0.05,
  'Mk.10 Stillbrew front projects visibly farther than the Mk.5 shell');

console.log('chieftainFidelity.selftest: tracks, low angular cores, reclined-to-square gun fronts, layered armor shells, and complete seated equipment verified');
