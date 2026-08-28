import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';

function verifyThirdGenerationMark(id, expectedPanels) {
  const visual = createTank(id, null, {
    proceduralOnly: true,
    geometryReceipt: true,
  });
  const hull = visual.root.getObjectByName('rig_hull');
  const turret = visual.root.getObjectByName('rig_turret');

  const fit = turret.userData[`${id}SourceFitReceipt`];
  assert.equal(fit.revision, 'outer-carrier-era-ring-r2', `${id} uses the visible ERA carrier-ring fit`);
  assert.equal(fit.roofDatumSource, 'source-oracle', `${id} uses its measured roof course`);
  assert.equal(fit.sidePanelSeats.length, expectedPanels, `${id} seats every side panel`);
  assert.equal(fit.eraSeats.length, 36, `${id} seats all turret ERA cells`);
  assert.equal(fit.eraMountSeats.length, 36, `${id} gives every turret ERA cell a structural cradle`);
  assert.equal(fit.eraSupportRule, 'outermost-armor-carrier',
    `${id} cannot bury ERA below its modular armor shell`);
  assert.equal(fit.secondaryArmorCarriesEra, true, `${id} records its modular shell as the ERA carrier`);
  assert.equal(fit.connectionPointsPerCassette, 3,
    `${id} gives every cassette one cradle and two edge cleats`);
  assert.equal(fit.maximumSurfaceGapM, 0, `${id} has no authored side-panel stand-off`);

  for (const seat of fit.sidePanelSeats) {
    const center = new THREE.Vector3(...seat.centerLocal);
    const surface = new THREE.Vector3(...seat.surfaceLocal);
    const normal = new THREE.Vector3(...seat.normalLocal);
    const proud = center.clone().sub(surface).dot(normal);
    assert.ok(normal.x * seat.side > 0.25, `${id} side-panel normal points outward`);
    assert.ok(normal.y > 0.10, `${id} side panel follows the turret flank rake`);
    assert.ok(Math.abs(proud - (0.075 / 2 - seat.contactEmbedM)) < 1e-6,
      `${id} side panel inner face overlaps the source shell`);
  }

  for (const seat of fit.eraSeats) {
    const center = new THREE.Vector3(...seat.centerLocal);
    const surface = new THREE.Vector3(...seat.surfaceLocal);
    const normal = new THREE.Vector3(...seat.normalLocal);
    const proud = center.clone().sub(surface).dot(normal);
    assert.ok(normal.x * seat.side > 0.02, `${id} ERA normal points outward`);
    assert.ok(Math.abs(proud - (seat.cassetteDepthM / 2 - seat.contactEmbedM)) < 1e-6,
      `${id} ERA inner face overlaps its outermost carrier`);
  }
  const secondarySeats = fit.eraSeats.filter((seat) => seat.supportLayer === 'secondary-armor');
  assert.ok(secondarySeats.length >= Math.floor(fit.eraSeats.length * 0.80),
    `${id} puts the visible ERA ring on top of its modular shell`);
  assert.ok(secondarySeats.every((seat) => seat.carrierProudOfSourceM > 0.001),
    `${id} modular-shell ERA stays measurably outside the cast turret`);
  assert.ok(fit.eraMountSeats.every((seat) => seat.structuralOverlapM > 0 && seat.cleats === 2),
    `${id} ERA cradles positively overlap their carrier and retain both edge cleats`);

  const rear = turret.userData[`${id}RearClosureReceipt`];
  assert.equal(rear.closedCrownAndFloor, true, `${id} closes the turret/bustle cavity`);
  assert.ok(rear.rearOverlapM >= 0.12, `${id} bulkhead overlaps the bustle root`);
  assert.equal(rear.basketTieCount, 2, `${id} bustle has two structural tie shoes`);

  const seat = turret.userData[`${id}TurretSeatReceipt`];
  assert.equal(seat.continuousStructuralSeat, true, `${id} turret race is structurally closed`);
  assert.ok(seat.deckEmbedM > 0, `${id} lower race embeds into the hull deck`);
  assert.ok(seat.shellOverlapM > 0, `${id} upper race overlaps the turret shell`);
  assert.ok(seat.restWorldBottomYM < seat.hullDeckWorldYM,
    `${id} turret ring reaches below the deck datum`);

  const glacis = hull.userData[`${id}GlacisClosureReceipt`];
  assert.equal(glacis.buriedEdgeOverlap, true, `${id} glacis web is buried at both ends`);
  assert.ok(glacis.upperRangeM[0] > glacis.lowerRangeM[0],
    `${id} web spans the upper/lower glacis gap`);
  assert.ok(glacis.upperRangeM[1] > glacis.lowerRangeM[1],
    `${id} web remains closed at the forward station`);

  visual.dispose();
}

verifyThirdGenerationMark('merkava3c', 16);
verifyThirdGenerationMark('merkava3d', 18);

console.log('merkava3Fit.selftest: Mk 3C/3D bustle, turret seat, side armor, and glacis closures passed');
