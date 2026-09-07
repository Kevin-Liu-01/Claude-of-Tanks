import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { createTank, KIT } from '../tankFactory.ts';
import { auditTankWheelQuality } from '../wheelQuality.ts';

// Independent complete-source rays from the original canonical fused mesh.
// Oracle SHA256 dcb16e5bc83c37e380a252c08462948a6ff9098738464ea4bee9e45ccb02df81.
// These targets are not read from the new helper or a candidate-fitted frame.
const cuts = [
  [.37629, -1.96246, 1.549316465203, 1.566919807783],
  [.32629, -1.96246, 1.515760535906, 1.533436716668],
  [.27629, -1.96246, 1.510061532611, 1.527750581151],
  [.22629, -1.96246, 1.510061519720, 1.527750594042],
  [.12629, -1.96246, 1.587607382091, 1.605186319573],
  [.214157965644, -1.750327965644, 1.584506092055, 1.602082196427],
  [.185873694397, -1.722043694397, 1.572168891631, 1.589747976306],
];
const zs = [-1.96246, -1.107005, -.274385, .47443, 1.317665, 2.088745];
const near = (a, b, tolerance, label) => assert.ok(Number.isFinite(a) && Math.abs(a - b) <= tolerance,
  `${label}: ${a} vs ${b}`);

function build(quality, legacy = false) {
  const old = KIT.buildRunningGear;
  let gear;
  KIT.buildRunningGear = (p, input) => {
    const cfg = { ...input };
    if (legacy) {
      cfg.wheelCoreGeometry.disc.dispose();
      for (const layer of cfg.wheelFaceLayers) layer.geometry.dispose();
      delete cfg.wheelCoreGeometry; delete cfg.wheelFaceLayers; delete cfg.wheelTireInnerRadiusM;
    }
    gear = old(p, cfg); return gear;
  };
  try {
    const tank = createTank('t80u_x', null, { quality, proceduralOnly: true,
      geometryReceipt: true, batchStatic: false });
    tank.root.updateMatrixWorld(true);
    return { tank, gear };
  } finally { KIT.buildRunningGear = old; }
}

function unchanged(root) {
  const hash = createHash('sha256');
  root.traverse(m => {
    if (!m.isMesh || m.name.startsWith('procShadow_') || m.userData.vehicleMarking) return;
    if (['gearRoadWheelTires', 'gearRoadWheelDiscs', 'gearRoadWheelInsets',
      'gearSuspensionLinks', 'gearSuspensionJointBosses', 't80uXWheelShellL',
      't80uXWheelShellR', 't80uXWheelRubberShoulders'].includes(m.name)) return;
    hash.update(m.name).update(JSON.stringify(m.matrixWorld.elements));
    for (const key of Object.keys(m.geometry.attributes).sort()) {
      const a = m.geometry.attributes[key].array;
      hash.update(key).update(Buffer.from(a.buffer, a.byteOffset, a.byteLength));
    }
    for (const a of [m.geometry.index?.array, m.instanceMatrix?.array]) {
      if (a) hash.update(Buffer.from(a.buffer, a.byteOffset, a.byteLength));
    }
  });
  return hash.digest('hex');
}

function rubberBoundary(meshes) {
  const points = new Set();
  for (const m of meshes) {
    const a = m.geometry.attributes.position;
    for (let i = 0; i < a.count; i++) {
      if (Math.hypot(a.getY(i), a.getZ(i)) < .33) continue;
      points.add([a.getX(i), a.getY(i), a.getZ(i)].map(v => Math.round(v * 1e6)).join(','));
    }
  }
  return [...points].sort();
}

function surfaces(root) {
  const physical = [];
  root.traverse(m => { if (m.isMesh && !m.name.startsWith('procShadow_') && !m.userData.vehicleMarking) physical.push(m); });
  const ray = (origin, direction, far = 6) => new THREE.Raycaster(new THREE.Vector3(...origin),
    new THREE.Vector3(...direction), 0, far).intersectObjects(physical, false)[0];
  for (const side of [-1, 1]) {
    const name = `t80uXWheelShell${side < 0 ? 'L' : 'R'}`;
    for (const [y, z, left, right] of cuts) {
      const hit = ray([side * 3, y, z], [-side, 0, 0]);
      assert.equal(hit?.object.name, name, 'complete scene exposes the measured steel, not generic rubber or ribs');
      near(Math.abs(hit?.point.x), side < 0 ? left : right, .00010,
        'held-out source six-sided hub, annular floor and stepped lip');
    }
    const floor = side < 0 ? 1.510061519720 : 1.527750594042;
    assert.equal(ray([side * 1.60, .22629, -1.96246], [-side, 0, 0], 1.60 - floor - .002),
      undefined, 'bowl depth is genuine exterior air, not dark painted fill');
    const back = ray([0, .22629, -1.96246], [side, 0, 0]);
    assert.equal(back?.object.name, name, 'source closed inboard wall remains present');
    near(Math.abs(back?.point.x), side < 0 ? 1.17167236998 : 1.18925127790,
      .000002, 'actual source back plane; no invented through hole');
  }
}

function wheelFrames(root) {
  const result = [];
  for (const suffix of ['L', 'R']) {
    const shell = root.getObjectByName(`t80uXWheelShell${suffix}`);
    assert.equal(shell.count, 6, 'six native moving source wheel bodies per side');
    for (let i = 0; i < shell.count; i++) {
      const m = new THREE.Matrix4(); shell.getMatrixAt(i, m);
      const p = new THREE.Vector3().setFromMatrixPosition(m);
      near(Math.abs(p.x), 1.35185, .000001, 'unchanged native axle lateral datum');
      near(p.y, .42629, .000001, 'unchanged native axle rest datum');
      near(p.z, zs[i], .000001, 'unchanged source longitudinal axle');
      result.push(m.elements);
    }
  }
  assert.deepEqual(auditTankWheelQuality(root).issues, [], 'strict actual arm/wheel clearance passes');
  return result;
}

for (const quality of ['high', 'low']) {
  const before = build(quality, true), after = build(quality);
  try {
    assert.equal(unchanged(after.tank.root), unchanged(before.tank.root), 'every non-wheel physical buffer and transform preserved');
    assert.deepEqual(after.gear.roadWheelLayout, before.gear.roadWheelLayout, 'no source axle/course metadata changed');
    assert.deepEqual(rubberBoundary([before.tank.root.getObjectByName('gearRoadWheelTires')]),
      rubberBoundary([after.tank.root.getObjectByName('gearRoadWheelTires'),
        after.tank.root.getObjectByName('t80uXWheelRubberShoulders')]),
      'every original faceted outer rubber boundary point preserved to float precision');
    surfaces(after.tank.root);
    const original = wheelFrames(after.tank.root);
    for (const [left, right] of [[.15, -.23], [.72, .35]]) {
      before.gear.update(left, right, 0); after.gear.update(left, right, 0);
      before.tank.root.updateMatrixWorld(true); after.tank.root.updateMatrixWorld(true);
      assert.notDeepEqual(wheelFrames(after.tank.root), original, 'source dishes actually spin on existing native axles');
      assert.equal(unchanged(after.tank.root), unchanged(before.tank.root), 'complete moving belts/end drums/return course preserved');
    }
    after.gear.resetPose(); after.tank.root.updateMatrixWorld(true);
    assert.deepEqual(wheelFrames(after.tank.root), original, 'source bodies reset exactly');
    surfaces(after.tank.root);
    const geometries = new Set();
    after.tank.root.traverse(m => {
      if (m.isMesh && (/^t80uXWheel/.test(m.name) || ['gearRoadWheelTires', 'gearRoadWheelDiscs'].includes(m.name))) geometries.add(m.geometry);
    });
    const disposed = new Set();
    for (const g of geometries) g.addEventListener('dispose', () => disposed.add(g));
    after.tank.dispose(); after.tank = null;
    assert.equal(disposed.size, geometries.size, 'all native first-party wheel resources disposed');
  } finally { before.tank.dispose(); after.tank?.dispose(); }
}
console.log('t80uXWheels.selftest: high/low fixed-source hub/bowl/rim rays, real air, preserved tire/axles/course, spin, clearance and disposal passed');
