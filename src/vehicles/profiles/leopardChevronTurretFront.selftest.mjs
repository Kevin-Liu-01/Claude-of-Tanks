import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';
import { combatAnatomyCalibration } from '../combatAnatomyCalibrationRegistry.ts';

// (264: the 2A4, 2A4 V, 2A4M, 2A4 OTCO, Improved and Strv 121 left the A5/A6 arrowhead for the 2A4 turret's square block
// or 2A6-look wedge, profiles/leopard2A4Family.ts; their front is checked at the end: only that it is no arrowhead)
const modernProfiles = new Map([
  ['leo2a6_ua', 'leopard-2a6m'],
]);
const verticalTerminalIds = new Set([
  'leo2a6_ua',
]);
const compoundTerminalIds = new Set([
  'leo2a6_ua',
]);
const compoundTerminalExpectations = new Map([
  ['leo2a6_ua', { upper: [1.02, 0.66], ridge: [1.435, 0.22], lower: [1.30, 0.02] }],
]);

for (const id of ['leo2a4_v', 'leo2a4m']) {
  const turretPlates = getSpec(id).armor.turretPlates;
  assert.equal(turretPlates.some((plate) => /^turret_wedge_[LR]$/.test(plate.name)), false,
    `${id} retires the obsolete one-piece sloping spaced-armor hitbox`);
  const chevrons = turretPlates.filter((plate) => plate.name.startsWith('turret_chevron_'));
  assert.equal(chevrons.length, 8,
    `${id} traces two upper/lower chevron courses on both cheeks`);
  const expectedProtection = id === 'leo2a4m' ? [275, 936] : [220, 750];
  assert.ok(chevrons.every((plate) => plate.kind === 'spaced'
      && plate.physicalMm === 90
      && plate.keMm === expectedProtection[0] && plate.ceMm === expectedProtection[1]),
  `${id} preserves its variant-adjusted spaced-armor protection on the corrected geometry`);
  for (const plate of chevrons) {
    const [v0, v1, , v3] = plate.verts;
    const e1 = v1.map((value, axis) => value - v0[axis]);
    const e2 = v3.map((value, axis) => value - v0[axis]);
    const normalZ = e1[0] * e2[1] - e1[1] * e2[0];
    assert.ok(normalZ > 0, `${id}/${plate.name} faces incoming frontal fire`);
  }
  // (264: the courses' plates keep their names and protection on the 2A4 turret, leopard2A4FamilyArmor.ts: the spaced
  // layer inside the 2A4 V's square block, the 2A4M's wedge faces; the A5 arrowhead's terminals they shared are gone)
}

const findMergedMesh = (root, name) => {
  let result = null;
  root.traverse((object) => {
    if (!result && object.isMesh && object.name === name) result = object;
  });
  assert.ok(result, `${name} merged mesh exists`);
  return result;
};

const hasVertex = (position, expected, epsilon = 1e-6) => {
  for (let index = 0; index < position.count; index++) {
    if (Math.abs(position.getX(index) - expected[0]) <= epsilon
        && Math.abs(position.getY(index) - expected[1]) <= epsilon
        && Math.abs(position.getZ(index) - expected[2]) <= epsilon) return true;
  }
  return false;
};

// Release 240: a tank with a published ring receipt has its turret seated (turretSeatRace.ts): every underside corner
// outside the rim that stands under the seat's plane comes up onto it, the armor's lower roots with them. Such a root
// is authored at its plan point, at its own height or lifted onto the plane (no more than the seam and the swept rise).
const SEAT_LIFT_MAX_M = 0.10;
const hasRootVertex = (position, expected, seated, epsilon = 1e-6) => {
  if (hasVertex(position, expected, epsilon)) return true;
  if (!seated) return false;
  for (let index = 0; index < position.count; index++) {
    const lift = position.getY(index) - expected[1];
    if (Math.abs(position.getX(index) - expected[0]) <= epsilon && Math.abs(position.getZ(index) - expected[2]) <= epsilon
        && lift > 0 && lift <= SEAT_LIFT_MAX_M) return true;
  }
  return false;
};

const vertexOccurrences = (position, expected, epsilon = 1e-5) => {
  let count = 0;
  for (let index = 0; index < position.count; index++) {
    if (Math.abs(position.getX(index) - expected[0]) <= epsilon
        && Math.abs(position.getY(index) - expected[1]) <= epsilon
        && Math.abs(position.getZ(index) - expected[2]) <= epsilon) count++;
  }
  return count;
};

const rootVertexOccurrences = (root, expected, epsilon = 1e-5) => {
  let count = 0;
  root.traverse((object) => {
    const position = object.isMesh && object.geometry?.getAttribute('position');
    if (position) count += vertexOccurrences(position, expected, epsilon);
  });
  return count;
};

for (const [id, expectedProfile] of modernProfiles) {
  const tank = createTank(id, null, {
    proceduralOnly: true,
    geometryReceipt: true,
    quality: 'high',
  });
  tank.root.updateMatrixWorld(true);

  const turretRig = tank.root.getObjectByName('rig_turret');
  assert.ok(turretRig, `${id} retains the canonical rotating turret rig`);
  const receipt = turretRig.userData.leopardChevronFrontReceipt;
  assert.ok(receipt, `${id} publishes a turret-front geometry receipt`);
  assert.equal(receipt.profile, expectedProfile, `${id} uses its measured family profile`);
  assert.equal(receipt.architecture, 'single-watertight-upper-and-lower-arrowhead',
    `${id} uses one closed volume for both faces of each chevron course`);
  assert.equal(receipt.runtimeGeometry, 'first-party-procedural',
    `${id} does not load the comparison model at runtime`);
  assert.equal(receipt.sourceComparisonOnly, true,
    `${id} records the owner model as measurement input only`);
  assert.equal(receipt.sharedRidge, true, `${id} declares one physical ridge for both armor faces`);
  assert.equal(receipt.closedCheekVolumes, true, `${id} closes each complete cheek at both ends and the rear`);
  assert.equal(receipt.cheekVolumes, 2, `${id} uses exactly one continuous armor volume per cheek`);
  assert.equal(receipt.internalCourseCaps, false,
    `${id} has no coincident internal caps that can render as stacked layers`);
  assert.equal(receipt.faceLayersPerSide, 1, `${id} exposes one upper/lower assembly per side`);
  // r4b: the field-ERA 2A6M carries its ERA field as the cheek's outer layer instead of the cassettes
  // (cassettes that bend with the cheek stood through the flat tiles' edges)
  const eraFieldCheek = id === 'leo2a4_otco';
  assert.equal(receipt.surfacePanelLayerCount, eraFieldCheek ? 0 : 1,
    `${id} uses one shallow cassette layer instead of stacked cheek courses`);
  assert.equal(receipt.surfacePanelCount, eraFieldCheek ? 0 : 8, `${id} carries four broad surface panels on each cheek`);
  assert.equal(receipt.surfacePanelsStructuralReplacement, false,
    `${id} keeps its continuous armor cheek underneath the surface cassettes`);
  assert.equal(receipt.exposedPanelSeams, !eraFieldCheek, `${id} leaves intentional seams between cheek panels`);
  assert.equal(receipt.roofSightlineClosed, true,
    `${id} closes the daylight channel between the cheek roots and core turret roof`);
  assert.equal(receipt.roofBridgeVolumes, 2, `${id} uses one continuous roof bridge per cheek`);
  assert.equal(receipt.roofBridgeStructural, true,
    `${id} owns its roof closures in the rotating armor bucket`);
  const closesCenterRoofGap = id === 'leo2_improved';
  assert.equal(receipt.roofCenterGapClosed, closesCenterRoofGap,
    `${id} records whether its two cheek-root bridges join across the centerline`);
  assert.equal(receipt.roofCenterClosureVolumes, closesCenterRoofGap ? 1 : 0,
    `${id} publishes exactly the required center roof closure count`);
  assert.equal(receipt.roofCenterClosure == null, !closesCenterRoofGap,
    `${id} publishes center roof geometry only when its profile requests it`);
  assert.equal(receipt.verticalTerminalSideClosure, verticalTerminalIds.has(id),
    `${id} records whether its outboard cheek ends in a vertical side wall`);
  assert.equal(receipt.terminalSideSlopeAligned, compoundTerminalIds.has(id),
    `${id} records whether its cheek terminal follows the compound turret side`);
  assert.equal(receipt.terminalSideClosureVolumes, verticalTerminalIds.has(id) ? 2 : 0,
    `${id} publishes one terminal cheek closure per applicable side`);
  assert.equal(receipt.legacyInteriorShadowWalls, false,
    `${id} retires the buried pre-chevron shadow walls`);
  assert.equal(receipt.structuralMantletSupportsRetained, true,
    `${id} keeps only the visible structural mantlet supports`);
  assert.equal(receipt.upperFaceSolids, receipt.cheekCourseCount,
    `${id} spans every plan course with its continuous upper face`);
  assert.equal(receipt.lowerReturnSolids, receipt.cheekCourseCount,
    `${id} spans every plan course with its continuous lower return`);
  assert.equal(receipt.sides.length, 2, `${id} publishes both cheek sides`);
  if (verticalTerminalIds.has(id)) {
    const smokeReceipt = turretRig.userData.leopardSideSmokeReceipt;
    assert.ok(smokeReceipt, `${id} publishes its turret-side smoke-bank seating`);
    assert.equal(smokeReceipt.architecture, 'mirrored-two-row-turret-side-banks');
    assert.equal(smokeReceipt.turretOwned, true, `${id} smoke banks follow turret traverse`);
    assert.equal(smokeReceipt.banksPerSide, 2, `${id} retains two smoke rows per side`);
    assert.equal(smokeReceipt.launchersPerSide, 8, `${id} retains eight launchers per side`);
    assert.deepEqual(smokeReceipt.sides.map(({ side }) => side), ['left', 'right'],
      `${id} seats smoke canisters on both turret sides`);
    assert.ok(smokeReceipt.sides.every(({ mountX }) => Math.abs(mountX) >= 1.25),
      `${id} smoke banks sit externally on the turret side/chamfer`);
  }
  if (id === 'leo2a6_ua') {
    assert.equal(receipt.lowerArmorPanArchitecture, 'cheek-return-owned',
      `${id} removes the separate underride blocker beneath its extended lower cheeks`);
    assert.equal(receipt.separateUnderrideFront, false,
      `${id} does not retain a flat front behind the structural lower return`);
  }
  if (id === 'leo2a6_ua') {
    const covered = receipt.sides[0].stations.filter((station) => station.x <= 1.011 + 1e-6);
    assert.ok(covered.length >= 3, `${id} samples the complete owner-marked A6 inner cheek span`);
    assert.ok(covered.every((station) => station.lowerY <= -0.066 + 1e-6),
      `${id} lower cheek covers the old z=1.90 underride face down to y=-0.066`);
    assert.ok(covered.every((station) => station.lowerZ <= 1.90 + 1e-6),
      `${id} lower cheek returns behind the old z=1.90 underride face`);
  }
  if (id === 'leo2a6_ua') {
    assert.equal(receipt.tipPads.filter((pad) => pad.s < 0).length, 0,
      `${id} removes both owner-marked left-side tip plates`);
    assert.ok(receipt.tipPads.every((pad) => Math.abs(pad.x - 1.44) > 1e-6
        && Math.abs(pad.x - 1.53) > 1e-6),
    `${id} has no residual plate at either marked blocker plane`);
  }

  const turret = findMergedMesh(turretRig, 'turret');
  const position = turret.geometry.getAttribute('position');
  const seated = !!combatAnatomyCalibration(id)?.turretRing;
  for (const sideReceipt of receipt.sides) {
    const side = sideReceipt.side === 'left' ? -1 : 1;
    assert.equal(sideReceipt.courseCount, sideReceipt.stations.length - 1,
      `${id} ${sideReceipt.side} spans every adjacent plan station`);
    assert.equal(sideReceipt.triangleCount, sideReceipt.courseCount * 6 + 2,
      `${id} ${sideReceipt.side} has only two end caps around one continuous cheek volume`);
    assert.equal(sideReceipt.roofBridge.triangleCount,
      sideReceipt.courseCount * 8 + (closesCenterRoofGap ? 2 : 4),
      `${id} ${sideReceipt.side} roof bridge keeps only the caps not owned by a center closure`);
    assert.equal(sideReceipt.roofBridge.innerEndCapped, !closesCenterRoofGap,
      `${id} ${sideReceipt.side} avoids a coincident inward cap when the center span is present`);
    assert.equal(sideReceipt.roofBridge.stations.length, sideReceipt.stations.length,
      `${id} ${sideReceipt.side} roof bridge follows every cheek plan station`);
    assert.ok(sideReceipt.roofBridge.thicknessM >= 0.08,
      `${id} ${sideReceipt.side} roof bridge is structural rather than a zero-thickness cover`);
    assert.equal(sideReceipt.surfacePanels.length, id === 'leo2a4_otco' ? 0 : 4,
      `${id} ${sideReceipt.side} divides the broad cheek into four readable cassettes`);
    if (verticalTerminalIds.has(id)) {
      const closure = sideReceipt.terminalSideClosure;
      assert.ok(closure, `${id} ${sideReceipt.side} closes the outboard cheek side`);
      assert.equal(closure.architecture, compoundTerminalIds.has(id)
        ? 'compound-sloped-terminal-return'
        : 'vertical-boxed-terminal-return');
      assert.equal(closure.triangleCount, 12,
        `${id} ${sideReceipt.side} terminal fill is a closed solid`);
      assert.ok(closure.verticalRearHeightM >= 0.35,
        `${id} ${sideReceipt.side} terminal wall covers the complete cheek height`);
      assert.ok(closure.bodyWidthOverlapM >= 0.024,
        `${id} ${sideReceipt.side} terminal wall interlocks with the turret width`);
      assert.ok(closure.bodyFrontOverlapM >= 0.024,
        `${id} ${sideReceipt.side} terminal wall interlocks with the turret front course`);
      if (compoundTerminalIds.has(id)) {
        const expected = compoundTerminalExpectations.get(id);
        const terminal = sideReceipt.stations.at(-1);
        assert.ok(expected, `${id} publishes its family terminal target`);
        assert.deepEqual(
          [terminal.upperX, terminal.upperY], expected.upper,
          `${id} ${sideReceipt.side} upper root meets the narrow roof-side corner`,
        );
        assert.deepEqual(
          [terminal.ridgeX, terminal.ridgeY], expected.ridge,
          `${id} ${sideReceipt.side} ridge preserves the arrowhead shoulder`,
        );
        assert.deepEqual(
          [terminal.lowerX, terminal.lowerY], expected.lower,
          `${id} ${sideReceipt.side} lower root meets the wider vertical wall`,
        );
        assert.equal(closure.upperX, expected.upper[0]);
        assert.equal(closure.ridgeX, expected.ridge[0]);
        assert.equal(closure.lowerX, expected.lower[0]);
        const transition = sideReceipt.stations.slice(-3);
        assert.ok(transition.length >= 3,
          `${id} ${sideReceipt.side} distributes the side alignment across multiple stations`);
        assert.ok(transition.slice(1).some((station, index) => (
          Math.abs(station.upperX - transition[index].upperX) > 1e-4
          && Math.abs(station.lowerX - transition[index].lowerX) > 1e-4
        )), `${id} ${sideReceipt.side} transitions both roots instead of snapping one end cap`);
        for (let index = 1; index < sideReceipt.stations.length; index++) {
          const previous = sideReceipt.stations[index - 1];
          const current = sideReceipt.stations[index];
          assert.ok(current.upperX > previous.upperX,
            `${id} ${sideReceipt.side} upper root advances monotonically without a folded course`);
          assert.ok(current.lowerX > previous.lowerX,
            `${id} ${sideReceipt.side} lower root advances monotonically without a folded course`);
          assert.ok(current.upperX <= current.ridgeX + 1e-9,
            `${id} ${sideReceipt.side} upper root stays behind its outboard ridge`);
          assert.ok(current.lowerX <= current.ridgeX + 1e-9,
            `${id} ${sideReceipt.side} lower root stays behind its outboard ridge`);
        }
      }
      const [upper, lower, rearLower, rearUpper] = closure.outerProfile;
      assert.equal(rearUpper[2], rearLower[2],
        `${id} ${sideReceipt.side} rear terminal edge is vertical in side profile`);
      assert.equal(rearUpper[1], upper[1],
        `${id} ${sideReceipt.side} rear terminal reaches the upper cheek edge`);
      assert.equal(rearLower[1], lower[1],
        `${id} ${sideReceipt.side} rear terminal reaches the lower cheek edge`);
      assert.ok(rearUpper[2] < Math.min(upper[2], lower[2]),
        `${id} ${sideReceipt.side} adds material behind the former sloping cut-off`);
      for (const point of closure.outerProfile) {
        assert.ok(hasVertex(position, point),
          `${id} ${sideReceipt.side} terminal profile point is authored in merged armor`);
      }
    } else {
      assert.equal(sideReceipt.terminalSideClosure, null,
        `${id} does not inherit an unrelated A5/A6 terminal wall`);
    }
    let previousPanelEnd = 0;
    for (const [panelIndex, panel] of sideReceipt.surfacePanels.entries()) {
      assert.ok(panel.from > previousPanelEnd,
        `${id} ${sideReceipt.side} panel ${panelIndex} leaves a real exposed seam`);
      assert.ok(panel.to > panel.from && panel.to < 1,
        `${id} ${sideReceipt.side} panel ${panelIndex} stays within the parent cheek`);
      assert.ok(panel.thicknessM >= 0.015 && panel.thicknessM <= 0.03,
        `${id} ${sideReceipt.side} panel ${panelIndex} remains a shallow armor cassette`);
      // a flat cassette is one 12-triangle slab; a band that spans a cheek station
      // bends with the parent: one closed loft, eight triangles per course plus two caps
      assert.ok(panel.triangleCount >= 12 && (panel.triangleCount - 4) % 8 === 0,
        `${id} ${sideReceipt.side} panel ${panelIndex} is a closed shallow solid`);
      assert.ok(panel.normal[1] > 0.65 && panel.normal[2] > 0,
        `${id} ${sideReceipt.side} panel ${panelIndex} follows the upper forward slope`);
      previousPanelEnd = panel.to;
    }
    for (const [index, station] of sideReceipt.stations.entries()) {
      const bridgeStation = sideReceipt.roofBridge.stations[index];
      assert.deepEqual(bridgeStation.frontTop,
        [side * (station.upperX ?? station.x), station.upperY, station.upperZ],
        `${id} ${sideReceipt.side} bridge station ${index} shares the exact visible cheek-root edge`);
      assert.ok(bridgeStation.rearTop[2] <= sideReceipt.roofBridge.bodyFrontZ
          - sideReceipt.roofBridge.rearOverlapM + 1e-9,
      `${id} ${sideReceipt.side} bridge station ${index} is buried into the core roof`);
      assert.ok(hasVertex(position, bridgeStation.rearTop),
        `${id} ${sideReceipt.side} bridge station ${index} is authored in the merged armor`);
      assert.ok(station.ridgeZ > station.upperZ,
        `${id} ${sideReceipt.side} station ${index} upper face returns behind the ridge`);
      assert.ok(station.ridgeZ > station.lowerZ,
        `${id} ${sideReceipt.side} station ${index} lower face returns behind the ridge`);
      assert.ok(station.upperY > station.ridgeY,
        `${id} ${sideReceipt.side} station ${index} keeps the upper armor above the ridge`);
      assert.ok(station.ridgeY > station.lowerY,
        `${id} ${sideReceipt.side} station ${index} lower root drops from the ridge`);
      assert.ok(Math.abs(station.upperSweepDeg - receipt.upperSlopeDeg) <= 1e-6,
        `${id} ${sideReceipt.side} station ${index} stays on the one continuous upper slope`);
      const minimumLowerSweep = 15;
      const maximumLowerSweep = compoundTerminalIds.has(id) ? 40 : 30;
      assert.ok(station.lowerSweepDeg >= minimumLowerSweep && station.lowerSweepDeg <= maximumLowerSweep,
        `${id} ${sideReceipt.side} station ${index} lower return has a plausible arrowhead angle (${station.lowerSweepDeg} deg)`);
      const minimumDominance = 1.2;
      assert.ok(station.upperDominanceRatio >= minimumDominance - 1e-9,
        `${id} ${sideReceipt.side} station ${index} preserves its profile's upper/lower balance (${station.upperDominanceRatio})`);
      const ridge = [side * (station.ridgeX ?? station.x), station.ridgeY, station.ridgeZ];
      assert.ok(hasVertex(position, ridge),
        `${id} ${sideReceipt.side} station ${index} ridge is authored in the merged armor`);
      assert.ok(vertexOccurrences(position, ridge) >= 4,
        `${id} ${sideReceipt.side} station ${index} ridge is shared by upper, lower and closure triangles`);
      assert.ok(hasVertex(position, [side * (station.upperX ?? station.x), station.upperY, station.upperZ]),
        `${id} ${sideReceipt.side} station ${index} upper root is authored in the merged armor`);
      assert.ok(hasRootVertex(position, [side * (station.lowerX ?? station.x), station.lowerY, station.lowerZ], seated),
        `${id} ${sideReceipt.side} station ${index} lower root is authored in the merged armor`);
    }
  }

  tank.dispose();
}

// (264: the 2A4 family's turret, profiles/leopard2A4Family.ts, fronts the 2A4's square block or the 2A6-look wedge; here
// only that none of them takes the A5 family's arrowhead)
for (const id of ['leo2a4', 'leo2a4_v', 'leo2a4m', 'leo2a4_otco', 'leo2_improved', 'strv121']) {
  const rebuilt = createTank(id, null, {
    proceduralOnly: true,
    geometryReceipt: true,
    quality: 'high',
  });
  const rebuiltTurret = rebuilt.root.getObjectByName('rig_turret');
  assert.ok(rebuiltTurret, `${id} retains the canonical rotating turret rig`);
  assert.equal(rebuiltTurret.userData.leopardChevronFrontReceipt, undefined,
    `${id} is not falsely converted to A5-family arrowhead armor`);
  rebuilt.dispose();
}

const otco = createTank('leo2a3', null, {
  proceduralOnly: true,
  geometryReceipt: true,
  quality: 'high',
});
// (262: the OTCO is a fourth-batch 2A3 on the new Leopard construction, profiles/leopard2a3B4.ts, whose own receipt
// holds its vertical-faced turret; here only that it never takes the A5 family's arrowhead)
const otcoTurret = otco.root.getObjectByName('rig_turret');
assert.ok(otcoTurret, 'Leopard 2A3 OTCO retains the canonical rotating turret rig');
assert.equal(otcoTurret.userData.leopardChevronFrontReceipt, undefined,
  'the earlier Leopard 2A3 OTCO is not falsely converted to A5-family arrowhead armor');
otco.dispose();

console.log('Leopard turret-front chevron geometry selftest passed');
