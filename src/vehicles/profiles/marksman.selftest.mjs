// The two Marksmen (release 269, builder M): one Marconi Marksman turret (profiles/marksmanTurret.ts, its frame
// profiles/marksmanFrame.ts) on the T-55A's hull (marksman_t55, Finland's ItPsv 90) and the Leopard 2A4's (itpsv_leopard2),
// the native fixture of profiles/marksman.ts at both qualities.
//  - the frame's body faces are planar convex polygons (the vertices solve their planes), and the specs' turret plates are
//    those faces wound outward;
//  - each turret stands on its hull's ring (the frame's, which the spec reads; the T-55A's own spec pivot is its donor's
//    until its anatomy is finalized), the guns on the drums' axis, and both hulls carry the same turret and guns;
//  - every fire axis (spec.gun.muzzles) ends on drawn stock at the muzzle plane, on its own recoil group, the right gun
//    first; the guns' muzzles with the guns forward give the spec's length, the radar's top its height (whips left out)
//    and the build its width (3 %);
//  - from -10 to +85 degrees the guns keep 2 cm from the turret's stock (the hubs, which turn in the drums about the pitch
//    axis, excepted), and 2.5 cm from the hull at every 5 degrees of yaw and pitch from the published stop at that yaw
//    (sim/gunPitchLimits.ts) to full elevation (gunHullClearance.test-support.mjs);
//  - the crew: the driver in the hull, the gunner (+x, the left) and the commander side by side in the turret.
// First-party tooling: Kevin B. Liu (NOTICE.md).
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';
import { GUN_HULL_KEEP_M, SurfaceGrid, densePoints, gunHullProbe, meshTriangles, meshesUnder } from '../gunHullClearance.test-support.mjs';
import { BODY_EXCLUDED_SEAT_ROLES, bodyGeometryWithout } from '../../../tools/body-height-parts.mjs';
import { minimumMechanicalGunPitch } from '../../sim/gunPitchLimits.ts';
import {
  MARKSMAN_BODY, MARKSMAN_BODY_FACES, MARKSMAN_BORE, MARKSMAN_DRUM, MARKSMAN_MUZZLE_Z, MARKSMAN_RADAR, MARKSMAN_RINGS,
  MARKSMAN_TRUNNION, marksmanBodyPoint,
} from './marksmanFrame.ts';

const DEG = Math.PI / 180;
const near = (a, b, tol, message) => assert.ok(Math.abs(a - b) <= tol, `${message}: ${a} vs ${b}`);
const ROWS = [{ id: 'marksman_t55', ring: 't55' }, { id: 'itpsv_leopard2', ring: 'leopard2' }];

// ---- the frame: every body face planar and convex, the solid closed (each edge shared by exactly two faces)
const edges = new Map();
for (const [name, corners] of Object.entries(MARKSMAN_BODY_FACES)) {
  const pts = corners.map(marksmanBodyPoint).map((p) => new THREE.Vector3(...p));
  // Newell's normal (robust over the faces' thin corner triangles)
  const n = new THREE.Vector3();
  pts.forEach((p, i) => {
    const q = pts[(i + 1) % pts.length];
    n.x += (p.y - q.y) * (p.z + q.z); n.y += (p.z - q.z) * (p.x + q.x); n.z += (p.x - q.x) * (p.y + q.y);
  });
  n.normalize();
  for (const p of pts) near(n.dot(p.clone().sub(pts[0])), 0, 1e-4, `body face ${name} is planar`);
  pts.forEach((p, i) => {
    const a = pts[(i + 1) % pts.length], b = pts[(i + 2) % pts.length];
    assert.ok(new THREE.Vector3().subVectors(a, p).cross(new THREE.Vector3().subVectors(b, a)).dot(n) > 1e-6, `body face ${name} is convex`);
  });
  corners.forEach((c, i) => {
    const d = corners[(i + 1) % corners.length];
    const key = [c, d].map(([v, s]) => `${v}${/^K/.test(v) ? '' : s}`).sort().join('|');
    edges.set(key, (edges.get(key) ?? 0) + 1);
  });
}
for (const [key, count] of edges) assert.equal(count, 2, `body edge ${key} closes two faces`);

/** The highest point of the visible body (whips left out, as the geometry gate's body: tools/body-height-parts.mjs). */
function bodyBounds(root) {
  const box = new THREE.Box3(), v = new THREE.Vector3();
  root.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || /procShadow/.test(o.name) || o.userData.shadowOnly) return;
    for (let p = o; p; p = p.parent) if (!p.visible) return;
    const ranges = (o.userData?.seatRoleRanges ?? []).filter((r) => BODY_EXCLUDED_SEAT_ROLES.includes(r.role));
    const geometry = ranges.length ? bodyGeometryWithout(o.geometry, ranges) : o.geometry;
    const pos = geometry.getAttribute('position'), index = geometry.index;
    const n = index ? index.count : pos.count;
    for (let i = 0; i < n; i++) box.expandByPoint(v.fromBufferAttribute(pos, index ? index.getX(i) : i).applyMatrix4(o.matrixWorld));
  });
  return box;
}

/** The first surface hit along a ray in `frame`'s coordinates, restricted to meshes under `root`. */
function firstHit(root, frame, start, direction, far = 1) {
  root.updateMatrixWorld(true);
  const origin = frame.localToWorld(new THREE.Vector3(...start));
  const dir = new THREE.Vector3(...direction).transformDirection(frame.matrixWorld);
  const hit = new THREE.Raycaster(origin, dir, 0, far).intersectObjects(meshesUnder(root), false)[0];
  return hit ? { point: frame.worldToLocal(hit.point.clone()) } : null;
}

const gunBoxes = {};
for (const { id, ring } of ROWS) {
  const spec = getSpec(id);
  // ---- the combat frame is the drawn frame
  assert.equal(spec.nation, 'UK');
  assert.deepEqual(spec.armor.turretPivot, [...MARKSMAN_RINGS[ring]], `${id}: the spec's ring is the frame's`);
  assert.deepEqual(spec.armor.gunPivot, [...MARKSMAN_TRUNNION], `${id}: the spec's elevation axis is the drums'`);
  near(spec.armor.gunBarrel.lengthM, MARKSMAN_MUZZLE_Z, 1e-9, `${id}: the barrel datum is the muzzle plane`);
  assert.deepEqual(spec.gun.muzzles.map((m) => [m.x, m.y]), [[-MARKSMAN_BORE.x, MARKSMAN_BORE.y], [MARKSMAN_BORE.x, MARKSMAN_BORE.y]],
    `${id}: one bore a pod, the right first`);
  assert.equal(spec.gun.launcherMuzzles, undefined, `${id}: no missiles`);
  assert.equal(spec.gun.caliberMm, 35);
  assert.equal(spec.gunElevationDeg, 85);
  assert.equal(spec.gunDepressionDeg, 10);
  // the plates are the body's faces, wound outward
  assert.equal(spec.armor.turretPlates.length, Object.keys(MARKSMAN_BODY_FACES).length, `${id}: a plate a body face`);
  for (const p of spec.armor.turretPlates) {
    const [a, b, c] = p.verts.map((v) => new THREE.Vector3(...v));
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a));
    const mid = p.verts.reduce((acc, v) => acc.add(new THREE.Vector3(...v)), new THREE.Vector3()).divideScalar(p.verts.length);
    assert.ok(n.dot(mid.clone().sub(new THREE.Vector3(0, (MARKSMAN_BODY.floorY + MARKSMAN_BODY.roofY) / 2, 0))) > 0,
      `${id}: ${p.name} faces out`);
  }
  // three crew: the driver in the hull, the gunner (left, +x) and the commander (right) inside the body's plan
  assert.deepEqual(spec.armor.crew.map((c) => c.crew).sort(), ['commander', 'driver', 'gunner'], `${id}: crew of three`);
  for (const box of spec.armor.crew.filter((c) => c.turretLocal)) {
    assert.ok(Math.abs(box.min[0]) <= MARKSMAN_BODY.sideX && Math.abs(box.max[0]) <= MARKSMAN_BODY.sideX
      && box.max[1] < MARKSMAN_BODY.roofY && box.min[2] >= MARKSMAN_BODY.rearZ && box.max[2] <= MARKSMAN_BODY.prowZ,
    `${id}: the ${box.crew} sits inside the turret`);
  }
  assert.ok(spec.armor.crew.find((c) => c.crew === 'gunner').min[0] > 0, `${id}: the gunner on the left (+x)`);

  for (const quality of ['high', 'low']) {
    const tank = createTank(id, null, { proceduralOnly: true, quality, geometryReceipt: true, camoSeed: 4242 });
    try {
      const root = tank.root;
      root.updateMatrixWorld(true);
      const turret = root.getObjectByName('rig_turret'), gun = root.getObjectByName('rig_gun');
      assert.deepEqual(turret.position.toArray(), [...MARKSMAN_RINGS[ring]], `${id} ${quality}: the turret on its hull's ring`);
      assert.deepEqual(gun.position.toArray(), [...MARKSMAN_TRUNNION], `${id} ${quality}: the guns on the drums' axis`);
      // every bore ends on drawn stock at the muzzle plane (the brake's front ring, beside the bore the factory seats)
      spec.gun.muzzles.forEach((m, index) => {
        const hit = firstHit(gun, gun, [m.x + 0.06, m.y, MARKSMAN_MUZZLE_Z + 0.3], [0, 0, -1], 0.6);
        assert.ok(hit, `${id} ${quality}: bore ${index} is drawn`);
        near(hit.point.z, MARKSMAN_MUZZLE_Z, 0.01, `${id} ${quality}: bore ${index} ends on the muzzle plane`);
        const group = root.getObjectByName(`rig_barrel_${index}`);
        assert.ok(group?.getObjectByName(`gunBarrel${index}`)?.isMesh, `${id} ${quality}: fire axis ${index} owns its recoil group`);
        const groupX = gun.worldToLocal(new THREE.Box3().setFromObject(group).getCenter(new THREE.Vector3())).x;
        assert.ok(Math.sign(groupX) === Math.sign(m.x), `${id} ${quality}: recoil group ${index} carries its own side's barrel`);
      });
      // envelope: the guns forward give the length, the radar's top the height (whips left out), the build the width
      const box = bodyBounds(root), size = box.getSize(new THREE.Vector3());
      near(box.max.z, MARKSMAN_RINGS[ring][2] + MARKSMAN_TRUNNION[2] + MARKSMAN_MUZZLE_Z, 0.005, `${id} ${quality}: the muzzles lead`);
      near(box.max.y, MARKSMAN_RINGS[ring][1] + MARKSMAN_RADAR.topY, 0.005, `${id} ${quality}: the radar's top is the tallest`);
      near(size.x, spec.dims.widthM, spec.dims.widthM * 0.03, `${id} ${quality}: width`);
      near(size.y, spec.dims.heightM, spec.dims.heightM * 0.03, `${id} ${quality}: height`);
      near(size.z, spec.dims.overallLengthM, spec.dims.overallLengthM * 0.03, `${id} ${quality}: length`);
      // the same turret on both hulls: the guns' plant identical
      const gunBox = new THREE.Box3();
      for (const mesh of meshesUnder(gun)) gunBox.union(new THREE.Box3().setFromObject(mesh));
      const local = [gunBox.min, gunBox.max].map((p) => gun.worldToLocal(p.clone()).toArray().map((v) => +v.toFixed(3)));
      gunBoxes[quality] ??= local;
      assert.deepEqual(local, gunBoxes[quality], `${id} ${quality}: the guns are the other Marksman's`);
      // the guns' sweep against the turret's own stock from full depression to full elevation
      const gInv = new THREE.Matrix4().copy(gun.matrixWorld).invert(), tInv = new THREE.Matrix4().copy(turret.matrixWorld).invert();
      const gunPts = densePoints(meshTriangles(meshesUnder(gun), gInv).tri, 0.02);
      const grid = new SurfaceGrid(meshTriangles(meshesUnder(turret, [gun]), tInv).tri, { cell: 0.05, rq: 0.06 });
      const pose = new THREE.Matrix4(), v = new THREE.Vector3();
      let worst = { d: Infinity };
      for (let deg = -spec.gunDepressionDeg; deg <= spec.gunElevationDeg; deg += 2.5) {
        pose.compose(gun.position, new THREE.Quaternion().setFromEuler(new THREE.Euler(-deg * DEG, 0, 0)), new THREE.Vector3(1, 1, 1));
        for (let i = 0; i < gunPts.length; i += 3) {
          // the hubs turn in the drums: rotation-invariant about the pitch axis
          if (Math.hypot(gunPts[i + 1], gunPts[i + 2]) < MARKSMAN_DRUM.hubR + 0.005) continue;
          v.set(gunPts[i], gunPts[i + 1], gunPts[i + 2]).applyMatrix4(pose);
          const d = grid.distance(v.x, v.y, v.z);
          if (d < worst.d) worst = { d, deg, at: [gunPts[i], gunPts[i + 1], gunPts[i + 2]].map((n) => +n.toFixed(3)) };
        }
      }
      assert.ok(worst.d >= 0.02, `${id} ${quality}: the guns keep 2 cm from the turret at every pitch (worst ${worst.d.toFixed(3)} m at ${worst.deg} deg, gun point ${worst.at})`);
      console.log(`${id} ${quality}: envelope ${size.toArray().map((n) => n.toFixed(2)).join(' x ')} m, turret clearance ${worst.d.toFixed(3)} m`);
    } finally { tank.dispose?.(); }
  }

  // ---- the hull at every 5 degrees of yaw, every 5 degrees of pitch from the published stop to full elevation
  const probe = gunHullProbe(id, { suit: false });
  try {
    let worst = { d: Infinity };
    for (let yaw = -180; yaw < 180; yaw += 5) {
      const floor = minimumMechanicalGunPitch(spec, yaw * DEG);
      const pitches = [floor];
      for (let deg = Math.ceil(floor / DEG / 5) * 5; deg < spec.gunElevationDeg; deg += 5) if (deg * DEG > floor) pitches.push(deg * DEG);
      pitches.push(spec.gunElevationDeg * DEG);
      for (const pitch of pitches) {
        const d = probe.distance(yaw * DEG, pitch, GUN_HULL_KEEP_M);
        if (d < worst.d) worst = { d, yaw, pitch: +(pitch / DEG).toFixed(1), part: probe.part };
      }
    }
    assert.ok(worst.d >= GUN_HULL_KEEP_M, `${id}: the guns keep ${GUN_HULL_KEEP_M} m from the hull (worst ${worst.d.toFixed(3)} at yaw ${worst.yaw}, pitch ${worst.pitch}, ${worst.part})`);
    console.log(`${id}: hull clearance ${worst.d.toFixed(3)} m at every bearing from the published stops to +${spec.gunElevationDeg} deg (worst at yaw ${worst.yaw}, pitch ${worst.pitch})`);
  } finally { probe.dispose(); }
}
console.log('marksman.selftest: OK');
