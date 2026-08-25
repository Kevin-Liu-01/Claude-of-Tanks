import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.js';

function build(id) {
  const visual = createTank(id, null, {
    proceduralOnly: true,
    geometryReceipt: true,
  });
  return {
    visual,
    hull: visual.root.getObjectByName('rig_hull'),
    turret: visual.root.getObjectByName('rig_turret'),
  };
}

function assertConformalTurret(id, expectedPanels, expectedEra, expectsSecondaryCarrier) {
  const { visual, hull, turret } = build(id);
  const fit = turret.userData[`${id}SourceFitReceipt`];
  assert.equal(fit.revision, 'outer-carrier-era-ring-r2', `${id} uses the visible ERA carrier-ring fit`);
  assert.equal(fit.roofDatumSource, 'source-oracle', `${id} equipment uses the rendered roof`);
  assert.equal(fit.sidePanelSeats.length, expectedPanels, `${id} seats every side panel`);
  assert.equal(fit.eraSeats.length, expectedEra, `${id} seats every turret ERA cassette`);
  assert.equal(fit.eraMountSeats.length, expectedEra, `${id} gives every ERA cassette a structural cradle`);
  assert.equal(fit.eraSupportRule, 'outermost-armor-carrier', `${id} cannot seat ERA below an outer armor layer`);
  assert.equal(fit.secondaryArmorCarriesEra, expectsSecondaryCarrier,
    `${id} records whether an applique shell carries its ERA`);
  assert.equal(fit.connectionPointsPerCassette, 3,
    `${id} gives every cassette one cradle and two edge cleats`);
  assert.equal(fit.maximumSurfaceGapM, 0, `${id} conformal armor has no authored gap`);

  for (const seat of fit.sidePanelSeats) {
    const center = new THREE.Vector3(...seat.centerLocal);
    const surface = new THREE.Vector3(...seat.surfaceLocal);
    const normal = new THREE.Vector3(...seat.normalLocal);
    assert.ok(normal.x * seat.side > 0.35, `${id} side-panel normal points outward`);
    assert.ok(normal.y > 0.55, `${id} side panel follows the sloped turret flank`);
    assert.ok(center.clone().sub(surface).dot(normal) > 0,
      `${id} side panel is proud while its inner face remains embedded`);
    assert.equal(seat.contactEmbedM, 0.014, `${id} side panel positively overlaps the shell`);
  }

  for (const seat of fit.eraSeats) {
    const center = new THREE.Vector3(...seat.centerLocal);
    const surface = new THREE.Vector3(...seat.surfaceLocal);
    const normal = new THREE.Vector3(...seat.normalLocal);
    const proud = center.clone().sub(surface).dot(normal);
    assert.ok(normal.x * seat.side > 0.08, `${id} turret ERA normal points outward`);
    assert.ok(normal.y > (seat.supportLayer === 'secondary-armor' ? -0.05 : 0.60),
      `${id} turret ERA follows the actual outer cheek/crown surface`);
    assert.ok(Math.abs(proud - (seat.cassetteDepthM / 2 - seat.contactEmbedM)) < 1e-6,
      `${id} ERA inner face overlaps its outermost carrier by the authored embed`);
  }
  if (expectsSecondaryCarrier) {
    assert.ok(fit.eraSeats.filter((seat) => seat.supportLayer === 'secondary-armor').length
      >= Math.floor(expectedEra * 0.80), `${id} puts the visible ring on top of the applique shell`);
    assert.ok(fit.eraSeats.filter((seat) => seat.supportLayer === 'secondary-armor')
      .every((seat) => seat.carrierProudOfSourceM > 0.02),
    `${id} applique-supported ERA is measurably outside the cast shell`);
  } else {
    assert.ok(fit.eraSeats.every((seat) => seat.supportLayer === 'source-shell'),
      `${id} without applique seats its ERA directly on the cast shell`);
  }
  assert.ok(fit.eraMountSeats.every((seat) => seat.structuralOverlapM > 0 && seat.cleats === 2),
    `${id} ERA cradles positively overlap their carrier and retain both edge cleats`);

  const rear = turret.userData[`${id}RearClosureReceipt`];
  assert.equal(rear.closedCrownAndFloor, true, `${id} closes the turret-to-bustle seam`);
  assert.ok(rear.rearOverlapM >= 0.12, `${id} closure overlaps the bustle root`);
  assert.equal(rear.basketTieCount, 2, `${id} has two structural basket tie shoes`);

  return { visual, hull, turret };
}

const mk2b = assertConformalTurret('merkava2b', 12, 20, false);
const mk2bLegacy = mk2b.turret.userData.merkava2bLegacyEquipmentSeatReceipt;
assert.equal(mk2bLegacy.seats.filter((seat) => seat.kind === 'roof-equipment').length, 2,
  'Mk 2B roof fittings are lowered onto the rendered roof');
assert.equal(mk2bLegacy.seats.filter((seat) => seat.kind === 'side-panel').length, 2,
  'Mk 2B shoulder bins use the source turret side frames');
assert.ok(mk2bLegacy.seats.every((seat) => seat.kind !== 'roof-equipment'
  || seat.seatedBaseM <= seat.authoredBaseM + 1e-8),
  'Mk 2B roof equipment only moves downward onto the roof');
const mk2bHullAttachment = mk2b.hull.userData.merkava2bHullAttachmentReceipt;
assert.equal(mk2bHullAttachment.supports.length, 2, 'Mk 2B bow pods have two hull support shoes');
assert.equal(mk2bHullAttachment.allSupportsOverlapHullAndPod, true,
  'Mk 2B bow supports overlap both the hull and equipment pods');
assert.ok(mk2bHullAttachment.supports.every((seat) => seat.buriedOverlapM > 0),
  'Mk 2B bow supports have positive structural overlap');

function assertRaisedFrontTerminal(id, visual, hull) {
  const gear = hull.userData[`${id}RunningGearReceipt`];
  assert.equal(gear.revision, 'terminal-course-reseat-r3',
    `${id}: front-terminal clearance revision is current`);
  assert.ok(Math.abs(gear.previousSprocketZM - 2.05) < 1e-9,
    `${id}: records the original front terminal station`);
  assert.ok(Math.abs(gear.previousSprocketYM - 0.54) < 1e-9,
    `${id}: records the original front terminal height`);
  assert.ok(Math.abs(gear.sprocketForwardM - 0.47) < 1e-9,
    `${id}: front terminal moves 47 cm forward`);
  assert.ok(Math.abs(gear.sprocketRaiseM - 0.28) < 1e-9,
    `${id}: front terminal moves 28 cm upward`);
  assert.ok(gear.frontTerminalRoadWheelClearanceM > 0.15,
    `${id}: front terminal no longer overlaps the first road wheel`);
  assert.equal(gear.trackCourseUsesSprocketEndpoint, true,
    `${id}: tracks use the raised, forward endpoint`);

  const pads = visual.root.getObjectByName('gearTrackPads');
  assert.ok(pads?.isInstancedMesh, `${id}: track pads remain one live instanced course`);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  let maxPadZ = -Infinity;
  for (let instance = 0; instance < pads.count; instance++) {
    pads.getMatrixAt(instance, matrix);
    position.setFromMatrixPosition(matrix);
    maxPadZ = Math.max(maxPadZ, position.z);
  }
  assert.ok(maxPadZ > gear.sprocketZM + 0.28,
    `${id}: track shoes wrap around the reseated front terminal`);
}

assertRaisedFrontTerminal('merkava2b', mk2b.visual, mk2b.hull);

const mk2d = assertConformalTurret('merkava2d', 14, 30, true);
const mk2dLegacy = mk2d.turret.userData.merkava2dLegacyEquipmentSeatReceipt;
assert.equal(mk2dLegacy.seats.filter((seat) => seat.kind === 'roof-equipment').length, 1,
  'Mk 2D roof fitting is lowered onto the rendered roof');
assert.ok(mk2dLegacy.seats.every((seat) => seat.kind !== 'roof-equipment'
  || seat.seatedBaseM <= seat.authoredBaseM + 1e-8),
  'Mk 2D roof equipment only moves downward onto the roof');

const glacis = mk2d.hull.userData.merkava2dGlacisClosureReceipt;
assert.equal(glacis.buriedEdgeOverlap, true, 'Mk 2D bow web closes into both glacis planes');
assert.ok(glacis.upperRangeM[0] > glacis.lowerRangeM[0],
  'Mk 2D closure spans the upper/lower glacis cavity');

assertRaisedFrontTerminal('merkava2d', mk2d.visual, mk2d.hull);

console.log('merkava2Fit.selftest: Mk 2B/Mk 2D closures, conformal armor, and attachments passed');
