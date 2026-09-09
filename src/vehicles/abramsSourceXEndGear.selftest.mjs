import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from './tankFactory.ts';
import { getSpec } from './specs.ts';
import { createTankState } from '../sim/movement.ts';
import { KIT } from './tankFactoryCore.ts';
import { ABRAMS_SOURCE_X_DRIVE_CROWN_M } from './profiles/abramsSourceXHull.ts';

const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
const bad = new THREE.PlaneGeometry(.2, .2), solid = KIT.box(.1, .2, .3);
const config = { wheelR: .3, wheelW: .4, wheelZs: [-1, 0, 1], xc: 1.4,
  sprocket: { z: -2, y: .7, r: .4 }, idler: { z: 2, y: .7, r: .3 }, trackW: .55, topY: 1 };
for (const invalid of [null, {}, { body: solid, dark: solid },
  { body: bad, dark: solid }, { body: solid, dark: new THREE.BufferGeometry() }]) {
  assert.throws(() => KIT.buildRunningGear({ spec: {}, disposables: [], mats: {}, hullG: new THREE.Group(), add() {} },
    { ...config, idlerGeometry: invalid }), /Native end-wheel/);
  if (invalid?.dark && invalid.dark !== solid) invalid.dark.dispose();
}
bad.dispose(); solid.dispose();
function hits(meshes, origin, direction, far) {
  return new THREE.Raycaster(new THREE.Vector3(...origin), new THREE.Vector3(...direction), 0, far)
    .intersectObjects(meshes, false);
}
function endMeshes(root) {
  const result = [];
  root.traverse(mesh => {
    if (mesh.isMesh && /gearEndWheel/.test(mesh.name)) result.push(mesh);
  });
  return result;
}
function idlerWitnesses(tank, label) {
  const ends = endMeshes(tank.root);
  assert.equal(ends.length, tank.root.getObjectByName('gearEndWheelBody').isBatchedMesh ? 2 : 8);
  for (const [side, lane] of [[-1, 1.425205], [1, 1.426410]]) {
    for (const radius of [.24, .27]) {
      assert.equal(hits(ends, [side * lane - .020, .834808 + radius, 3.24798], [1, 0, 0], .040).length, 0,
        `${label}: actual source109 paired-idler guide air`);
    }
    for (const dx of [-.15, .15]) {
      const hit = hits(ends, [side * lane + dx, 1.3, 3.24798], [0, -1, 0], .35)[0];
      assert.ok(hit && Math.abs(hit.point.y - (.834808 + .3167445)) < .001,
        `${label}: both actual source-sized idler rims, not an empty replacement: ${JSON.stringify({side,dx,hit:hit?.point.toArray(),ends:ends.map(m=>[m.name,m.position.toArray(),m.scale.toArray()])})}`);
    }
    const hub = hits(ends, [side * (lane + .3), .834808, 3.24798], [-side, 0, 0], .6)[0];
    assert.ok(hub && Math.abs(Math.abs(hub.point.x) - lane - .155025) < .001,
      `${label}: actual local122.1mm hub and axial cap`);
  }
}
function rearWrapWitnesses(tank, label) {
  const result = [];
  for (const [side, name, lane] of [[-1, 'gearTrackBandL', 1.425205], [1, 'gearTrackBandR', 1.426410]]) {
    const band = tank.root.getObjectByName(name), witness = new THREE.Mesh(band.geometry, material);
    witness.matrixAutoUpdate = false; witness.matrix.copy(band.matrixWorld); witness.updateMatrixWorld(true);
    let minimum = Infinity;
    for (let degree = 0; degree < 360; degree++) {
      const a = degree * Math.PI / 180;
      const hit = hits([witness], [side * (lane + .25), .863479, -3.14623],
        [0, Math.cos(a), Math.sin(a)], 8)[0];
      assert.ok(hit, `${label}: complete rear band stock at ${degree} degrees`);
      minimum = Math.min(minimum, hit.distance);
    }
    const clearance = minimum - ABRAMS_SOURCE_X_DRIVE_CROWN_M;
    assert.ok(clearance > .008, `${label}: actual finite band/true crown clearance ${clearance}`);
    const top = hits([witness], [side * (lane + .25), 2, -3.14623], [0, -1, 0], 2)[0];
    result.push({ side, minimumBandRadiusM: minimum, crownM: ABRAMS_SOURCE_X_DRIVE_CROWN_M,
      minimumClearanceM: clearance, authoredBandTopAtAxleM: top.point.y,
      sourceBandTopAtAxleM: 1.178838, sourceToAuthoredTopDeltaM: top.point.y - 1.178838 });
  }
  return result;
}
for (const quality of ['high', 'low']) for (const batchStatic of [false, true]) {
  const tank = createTank('m1a2_sepv2_x', null,
    { proceduralOnly: true, geometryReceipt: true, quality, batchStatic });
  try {
    tank.root.updateMatrixWorld(true);
    const label = `${quality}/${batchStatic ? 'batched' : 'separate'}`;
    idlerWitnesses(tank, label);
    const measurements = rearWrapWitnesses(tank, label);
    const state = createTankState(getSpec('m1a2_sepv2_x'), new THREE.Vector3(), 0);
    state.trackScroll.l = .37; state.trackScroll.r = -.21;
    for (let k = 0; k < 4; k++) tank.syncFromState(state, 1 / 30, 20);
    tank.root.updateMatrixWorld(true);
    // Phase does not turn the real paired gap back into a generic filled disc.
    idlerWitnesses(tank, `${label}/posed`);
    console.log(JSON.stringify({ label, measurements }));
  } finally { tank.dispose(); }
}
material.dispose();
console.log('Abrams end gear: high/low both native spinner paths, source109 pair/hub/air, fixed axes and complete360-degree rear-band crown clearance PASS');
