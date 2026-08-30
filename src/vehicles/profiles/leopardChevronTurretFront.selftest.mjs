import assert from 'node:assert/strict';
import { createTank } from '../tankFactory.ts';

const modernProfiles = new Map([
  ['leo2a5', 'leopard-2a5'],
  ['leo2a6', 'leopard-2a6'],
  ['leo2a6m', 'leopard-2a6m'],
  ['leo2a6_ua', 'leopard-2a6m'],
  ['leo2a7v', 'leopard-2a7v'],
  ['strv122', 'leopard-2a5'],
]);

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
  assert.equal(receipt.surfacePanelLayerCount, 1,
    `${id} uses one shallow cassette layer instead of stacked cheek courses`);
  assert.equal(receipt.surfacePanelCount, 8, `${id} carries four broad surface panels on each cheek`);
  assert.equal(receipt.surfacePanelsStructuralReplacement, false,
    `${id} keeps its continuous armor cheek underneath the surface cassettes`);
  assert.equal(receipt.exposedPanelSeams, true, `${id} leaves intentional seams between cheek panels`);
  assert.equal(receipt.roofSightlineClosed, true,
    `${id} closes the daylight channel between the cheek roots and core turret roof`);
  assert.equal(receipt.roofBridgeVolumes, 2, `${id} uses one continuous roof bridge per cheek`);
  assert.equal(receipt.roofBridgeStructural, true,
    `${id} owns its roof closures in the rotating armor bucket`);
  assert.equal(receipt.legacyInteriorShadowWalls, false,
    `${id} retires the buried pre-chevron shadow walls`);
  assert.equal(receipt.structuralMantletSupportsRetained, true,
    `${id} keeps only the visible structural mantlet supports`);
  assert.equal(receipt.upperFaceSolids, receipt.cheekCourseCount,
    `${id} spans every plan course with its continuous upper face`);
  assert.equal(receipt.lowerReturnSolids, receipt.cheekCourseCount,
    `${id} spans every plan course with its continuous lower return`);
  assert.equal(receipt.sides.length, 2, `${id} publishes both cheek sides`);
  if (['leo2a5', 'leo2a6', 'leo2a6m', 'leo2a6_ua', 'leo2a7v', 'strv122'].includes(id)) {
    assert.equal(receipt.lowerArmorPanArchitecture, 'cheek-return-owned',
      `${id} removes the separate underride blocker beneath its extended lower cheeks`);
    assert.equal(receipt.separateUnderrideFront, false,
      `${id} does not retain a flat front behind the structural lower return`);
  }
  if (id === 'leo2a5' || id === 'strv122') {
    const covered = receipt.sides[0].stations.filter((station) => station.x <= 1.011 + 1e-6);
    assert.ok(covered.length >= 2, `${id} samples the complete owner-marked inner cheek span`);
    assert.ok(covered.every((station) => station.lowerY <= -0.066 + 1e-6),
      `${id} lower cheek covers the old z=1.91 underride face down to y=-0.066`);
    assert.ok(covered.every((station) => station.lowerZ <= 1.91 + 1e-6),
      `${id} lower cheek returns behind the old z=1.91 underride face`);
  }
  if (id === 'leo2a6' || id === 'leo2a6m' || id === 'leo2a6_ua') {
    const covered = receipt.sides[0].stations.filter((station) => station.x <= 1.011 + 1e-6);
    assert.ok(covered.length >= 3, `${id} samples the complete owner-marked A6 inner cheek span`);
    assert.ok(covered.every((station) => station.lowerY <= -0.066 + 1e-6),
      `${id} lower cheek covers the old z=1.90 underride face down to y=-0.066`);
    assert.ok(covered.every((station) => station.lowerZ <= 1.90 + 1e-6),
      `${id} lower cheek returns behind the old z=1.90 underride face`);
  }
  if (id === 'leo2a6m' || id === 'leo2a6_ua') {
    assert.equal(receipt.tipPads.filter((pad) => pad.s < 0).length, 0,
      `${id} removes both owner-marked left-side tip plates`);
    assert.ok(receipt.tipPads.every((pad) => Math.abs(pad.x - 1.44) > 1e-6
        && Math.abs(pad.x - 1.53) > 1e-6),
    `${id} has no residual plate at either marked blocker plane`);
  }
  if (id === 'leo2a7v') {
    assert.ok(receipt.maximumCheekHalfWidthM <= receipt.bodyFrontHalfWidthM + 1e-9,
      'leo2a7v cheeks stay within the turret body instead of overhanging it');
    assert.ok(receipt.ridgeControlLine.length >= 6,
      'leo2a7v distributes its arrowhead sweep across the complete turret front');
    for (let index = 1; index < receipt.ridgeControlLine.length; index++) {
      const previous = receipt.ridgeControlLine[index - 1];
      const current = receipt.ridgeControlLine[index];
      assert.ok(current[0] > previous[0], `leo2a7v ridge station ${index} advances outboard`);
      assert.ok(current[1] < previous[1] - 0.075,
        `leo2a7v ridge station ${index} sweeps rearward instead of forming a square brow`);
    }
    assert.ok(receipt.ridgeControlLine[0][1] - receipt.ridgeControlLine.at(-1)[1] >= 0.95,
      'leo2a7v carries a deep gun-root-to-outboard plan chevron');
    for (const sideReceipt of receipt.sides) {
      for (const station of sideReceipt.stations) {
        assert.ok(Math.abs(station.upperRiseM - station.lowerDropM) <= 1e-9,
          'leo2a7v lower cheek matches the upper cheek height at every station');
      }
    }
  }

  const turret = findMergedMesh(turretRig, 'turret');
  const position = turret.geometry.getAttribute('position');
  for (const sideReceipt of receipt.sides) {
    const side = sideReceipt.side === 'left' ? -1 : 1;
    assert.equal(sideReceipt.courseCount, sideReceipt.stations.length - 1,
      `${id} ${sideReceipt.side} spans every adjacent plan station`);
    assert.equal(sideReceipt.triangleCount, sideReceipt.courseCount * 6 + 2,
      `${id} ${sideReceipt.side} has only two end caps around one continuous cheek volume`);
    assert.equal(sideReceipt.roofBridge.triangleCount, sideReceipt.courseCount * 8 + 4,
      `${id} ${sideReceipt.side} roof bridge has only two end caps around one continuous volume`);
    assert.equal(sideReceipt.roofBridge.stations.length, sideReceipt.stations.length,
      `${id} ${sideReceipt.side} roof bridge follows every cheek plan station`);
    assert.ok(sideReceipt.roofBridge.thicknessM >= 0.08,
      `${id} ${sideReceipt.side} roof bridge is structural rather than a zero-thickness cover`);
    assert.equal(sideReceipt.surfacePanels.length, 4,
      `${id} ${sideReceipt.side} divides the broad cheek into four readable cassettes`);
    let previousPanelEnd = 0;
    for (const [panelIndex, panel] of sideReceipt.surfacePanels.entries()) {
      assert.ok(panel.from > previousPanelEnd,
        `${id} ${sideReceipt.side} panel ${panelIndex} leaves a real exposed seam`);
      assert.ok(panel.to > panel.from && panel.to < 1,
        `${id} ${sideReceipt.side} panel ${panelIndex} stays within the parent cheek`);
      assert.ok(panel.thicknessM >= 0.015 && panel.thicknessM <= 0.03,
        `${id} ${sideReceipt.side} panel ${panelIndex} remains a shallow armor cassette`);
      assert.equal(panel.triangleCount, 12,
        `${id} ${sideReceipt.side} panel ${panelIndex} is a closed shallow solid`);
      assert.ok(panel.normal[1] > 0.65 && panel.normal[2] > 0,
        `${id} ${sideReceipt.side} panel ${panelIndex} follows the upper forward slope`);
      previousPanelEnd = panel.to;
    }
    for (const [index, station] of sideReceipt.stations.entries()) {
      const bridgeStation = sideReceipt.roofBridge.stations[index];
      assert.deepEqual(bridgeStation.frontTop,
        [side * station.x, station.upperY, station.upperZ],
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
      const minimumLowerSweep = id === 'leo2a7v' ? 35 : 15;
      const maximumLowerSweep = id === 'leo2a7v' ? 52 : 30;
      assert.ok(station.lowerSweepDeg >= minimumLowerSweep && station.lowerSweepDeg <= maximumLowerSweep,
        `${id} ${sideReceipt.side} station ${index} lower return has a plausible arrowhead angle (${station.lowerSweepDeg} deg)`);
      const minimumDominance = id === 'leo2a7v' ? 1 : 1.2;
      assert.ok(station.upperDominanceRatio >= minimumDominance - 1e-9,
        `${id} ${sideReceipt.side} station ${index} preserves its profile's upper/lower balance (${station.upperDominanceRatio})`);
      const ridge = [side * station.x, station.ridgeY, station.ridgeZ];
      assert.ok(hasVertex(position, ridge),
        `${id} ${sideReceipt.side} station ${index} ridge is authored in the merged armor`);
      assert.ok(vertexOccurrences(position, ridge) >= 4,
        `${id} ${sideReceipt.side} station ${index} ridge is shared by upper, lower and closure triangles`);
      assert.ok(hasVertex(position, [side * station.x, station.upperY, station.upperZ]),
        `${id} ${sideReceipt.side} station ${index} upper root is authored in the merged armor`);
      assert.ok(hasVertex(position, [side * station.x, station.lowerY, station.lowerZ]),
        `${id} ${sideReceipt.side} station ${index} lower root is authored in the merged armor`);
    }
  }

  if (id === 'leo2a5') {
    assert.deepEqual(turretRig.userData.leopardA6MantletRoofBridge, {
      frontZ: 2.20,
      rearZ: 0.50,
      frontHalfWidth: 0.30,
      rearHalfWidth: 0.28,
      ribZ: [],
    }, 'leo2a5 seals its central cheek-root channel with one clean ribless bridge');
    for (const point of [
      [-0.94, 0.772475, 0.9699167],
      [-0.21, 0.816275, 1.0185833],
      [0.21, 0.816275, 1.0185833],
      [0.94, 0.772475, 0.9699167],
    ]) {
      assert.equal(rootVertexOccurrences(turretRig, point), 0,
        `leo2a5 removes the owner-marked duplicate crown face at ${point.join(',')}`);
    }
  }
  if (id === 'leo2a6') {
    for (const point of [
      [0.9894, 0.29, 1.7533333],
      [1.2804, 0.29, 1.40],
      [-1.335, 0.29, 1.04],
      [-1.261, 0.51, -0.46],
    ]) {
      assert.equal(rootVertexOccurrences(turretRig, point), 0,
        `leo2a6 removes the owner-marked buried shadow wall at ${point.join(',')}`);
    }
  }

  tank.dispose();
}

const otco = createTank('leo2a4_otco', null, {
  proceduralOnly: true,
  geometryReceipt: true,
  quality: 'high',
});
const otcoTurret = otco.root.getObjectByName('rig_turret');
assert.ok(otcoTurret, 'Leopard 2A4 OTCO retains the canonical rotating turret rig');
assert.equal(otcoTurret.userData.leopardChevronFrontReceipt, undefined,
  'the earlier Leopard 2A4 is not falsely converted to A5-family arrowhead armor');
const otcoReceipt = otcoTurret.userData.leopard2A4FrontReceipt;
assert.ok(otcoReceipt, 'Leopard 2A4 OTCO publishes its distinct front-architecture receipt');
assert.equal(otcoReceipt.architecture, 'welded-box-with-clipped-front-corners');
assert.equal(otcoReceipt.arrowheadApplique, false);
assert.equal(otcoReceipt.runtimeGeometry, 'first-party-procedural');
otco.dispose();

console.log('Leopard turret-front chevron geometry selftest passed');
