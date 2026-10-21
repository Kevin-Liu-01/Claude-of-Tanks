// Release 227 (2026-10-20): the fleet Type 96B's two moving-part defects, measured directly at both qualities.
//  1. The box sight over the mantlet (type96bX.ts TYPE96_BOX_SIGHT: source centre 0, 2.278, 1.540; .25 x .236 x .396).
//     Turret-fixed, it stood inside the pitching mantlet boot under it at every pitch. The fleet build passes
//     buildType96Turret boxSightOnGun, the CN lane's construction for the Kunlun and the Yun, with boxSightSourceTop: no
//     turret mesh is left in the authored box; the box, its saddle, bezel and glass ride the gun with the authored width,
//     place and top (raised whole onto the boot's crown, its top stood 46 mm over the source's); the saddle sits on the
//     boot (no gap under its footprint, at most 5 mm into the boot at high quality, 8 mm at low: the saddle samples the
//     boot's top at nine points across, and the low build's 12-sided boot rings put facet corners between them; the boot,
//     saddle and sight are one rigid mesh, so the overlap is internal); and from the spec's lowest legal pitch to full
//     elevation every 1 cm sample of the sight keeps 10 mm from every turret mesh.
//     Negative control: the authored box, turret-fixed, against the built boot lies more than 10 mm inside it at rest
//     and inside it (over 1 mm) at every half-degree of the same pitch range.
//  2. The mantlet boot over the hull. Object_6's measured underside (y 1.582-1.704) swung below the hull's roof behind
//     the trunnion at full elevation; the fleet build clips it (TYPE96B_BOOT_FLOOR) and the spec stops depression over
//     the rear arc (gunPitchByYawDeg). Measured against the hull's top surface (a 1 cm height map of every hull mesh but
//     the field net, garnish and interior fills), at every 1-degree turret yaw and every half-degree pitch from the
//     yaw's mechanical minimum to full elevation, every 1 cm sample of the mantlet's underside (the gun's meshes behind
//     the barrel collar and under the trunnion, gun-frame z < .40 and y < 0: the boot's lower half; the saddle and sight
//     ride 30 cm higher) stands over that surface by at least 3 mm (measured
//     2026-10-20: 15 mm at full elevation, over the driver's hatch handle at yaw 1; 5.7 mm least anywhere, over the rear
//     deck's fittings at the rear arc's -1 degree stop).
//     Negative control: Object_6's measured rings without the floors (its six source stations, the same ellipses the
//     builder lofts), posed at full elevation, reach more than 80 mm under the hull's top surface.
// (The barrel and the rest of the gun against every hull triangle, at 2-degree yaw steps: type96MantletClearance.)
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';
import { minimumMechanicalGunPitch } from '../../sim/gunPitchLimits.ts';
import { SurfaceGrid, meshTriangles, densePoints, censusPart, insideClosed } from '../cnTurretGeometry.test-support.mjs';

const D = Math.PI / 180;
// type96bX.ts buildType96Turret: Object_6's stations (source z, half width, underside, top) about the trunnion at
// source y 1.8602, z 1.60, and the authored box sight (source frame).
const OBJECT_6 = [[1.20, .250, 1.595, 2.171], [1.32, .260, 1.582, 2.212], [1.60, .246, 1.616, 2.173],
  [1.75, .216, 1.641, 2.082], [1.85, .190, 1.704, 2.044], [1.951, .157, 1.696, 2.017]];
const TRUNNION = { y: 1.8602, z: 1.60 };
const BOX_SIGHT = { x: 0, y: 2.278, z: 1.540, w: .25, h: .236, d: .396 };

/** The highest hull surface over each 1 cm cell of the plan (vertical faces count along their top edges). */
function topSurface(tris, cell = .01) {
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity;
  for (let i = 0; i < tris.length; i += 3) { x0 = Math.min(x0, tris[i]); x1 = Math.max(x1, tris[i]); z0 = Math.min(z0, tris[i + 2]); z1 = Math.max(z1, tris[i + 2]); }
  const nx = Math.ceil((x1 - x0) / cell) + 1, nz = Math.ceil((z1 - z0) / cell) + 1, top = new Float32Array(nx * nz).fill(-Infinity);
  const raise = (x, z, y) => { const i = Math.round((x - x0) / cell), j = Math.round((z - z0) / cell); if (i >= 0 && j >= 0 && i < nx && j < nz && y > top[j * nx + i]) top[j * nx + i] = y; };
  for (let t = 0; t < tris.length; t += 9) {
    const ax = tris[t], ay = tris[t + 1], az = tris[t + 2], bx = tris[t + 3], by = tris[t + 4], bz = tris[t + 5], cx = tris[t + 6], cy = tris[t + 7], cz = tris[t + 8];
    for (const [px, py, pz, qx, qy, qz] of [[ax, ay, az, bx, by, bz], [bx, by, bz, cx, cy, cz], [cx, cy, cz, ax, ay, az]]) {
      const n = Math.max(1, Math.ceil(Math.hypot(qx - px, qz - pz) / (cell / 2)));
      for (let k = 0; k <= n; k++) { const f = k / n; raise(px + f * (qx - px), pz + f * (qz - pz), py + f * (qy - py)); }
    }
    const det = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (Math.abs(det) < 1e-12) continue;
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - x0) / cell)), i1 = Math.min(nx - 1, Math.ceil((Math.max(ax, bx, cx) - x0) / cell));
    const j0 = Math.max(0, Math.floor((Math.min(az, bz, cz) - z0) / cell)), j1 = Math.min(nz - 1, Math.ceil((Math.max(az, bz, cz) - z0) / cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = x0 + i * cell, z = z0 + j * cell;
      const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / det, l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / det, l3 = 1 - l1 - l2;
      if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) continue;
      const y = l1 * ay + l2 * by + l3 * cy; if (y > top[j * nx + i]) top[j * nx + i] = y;
    }
  }
  return (x, z) => { const i = Math.round((x - x0) / cell), j = Math.round((z - z0) / cell); return i < 0 || j < 0 || i >= nx || j >= nz ? -Infinity : top[j * nx + i]; };
}

/** The deepest of the gun-frame points `pts` under the hull's top surface (m; negative: the least clearance over it). */
function depthUnder(pts, e, top) {
  let deepest = -Infinity;
  for (let i = 0; i < pts.length; i += 3) {
    const x = pts[i], y = pts[i + 1], z = pts[i + 2];
    const s = top(e[0] * x + e[4] * y + e[8] * z + e[12], e[2] * x + e[6] * y + e[10] * z + e[14]);
    if (s === -Infinity) continue;
    const d = s - (e[1] * x + e[5] * y + e[9] * z + e[13]); if (d > deepest) deepest = d;
  }
  return deepest;
}

const T0 = Date.now();
for (const quality of ['high', 'low']) {
  const spec = getSpec('type96b'), census = [], t0 = Date.now(), secs = (t) => ((Date.now() - t) / 1000).toFixed(0);
  const tank = createTank('type96b', null, { proceduralOnly: true, quality, geometryReceipt: true, camoSeed: 4242,
    partCensus(bucket, g) { census.push(censusPart(bucket, g)); } });
  try {
    tank.root.updateMatrixWorld(true);
    const tBuild = secs(t0), t1 = Date.now();
    const hull = tank.root.getObjectByName('rig_hull'), turret = tank.root.getObjectByName('rig_turret'), gun = tank.root.getObjectByName('rig_gun');
    const yaw0 = turret.rotation.y, pitch0 = gun.rotation.x, m = new THREE.Matrix4();
    const lowest = Math.min(...Array.from({ length: 360 }, (_, yaw) => minimumMechanicalGunPitch(spec, yaw * D)));
    const elevation = spec.gunElevationDeg * D, pitches = [];
    for (let p = lowest; p <= elevation + 1e-9; p += .5 * D) pitches.push(p);
    if (pitches.at(-1) < elevation - 1e-9) pitches.push(elevation);
    // the gun's frame in `frame` at a turret yaw and gun pitch, from the local matrices above the gun (only the turret's
    // and the gun's change): for an ancestor (the turret), those below it; otherwise (the hull, a sibling rig that the
    // turret does not move) the gun's world matrix in the frame's world at rest
    const restInverse = new Map([hull, turret].map((f) => [f, f.matrixWorld.clone().invert()]));
    const pose = (yawDeg, pitch, frame) => {
      turret.rotation.y = yaw0 + yawDeg * D; gun.rotation.x = pitch0 - pitch; turret.updateMatrix(); gun.updateMatrix();
      m.identity();
      let o = gun;
      for (; o && o !== frame; o = o.parent) m.premultiply(o.matrix);
      if (!o) m.premultiply(restInverse.get(frame));
      return m.elements.slice();
    };
    const apply = (e, x, y, z) => [e[0] * x + e[4] * y + e[8] * z + e[12], e[1] * x + e[5] * y + e[9] * z + e[13], e[2] * x + e[6] * y + e[10] * z + e[14]];
    // the source frame's trunnion in the gun frame is its origin: check the build agrees (the controls below rely on it)
    const sourceOrigin = turret.position.clone().add(gun.position);
    assert.ok(Math.abs(sourceOrigin.y - TRUNNION.y) < 1e-6 && Math.abs(sourceOrigin.z - TRUNNION.z) < 1e-6 && Math.abs(sourceOrigin.x) < 1e-9,
      `type96b/${quality}: the gun pivots on Object_6's trunnion (${sourceOrigin.toArray()})`);

    // ---- 1. the box sight rides the gun
    const turretFixed = [];
    turret.traverse((o) => { if (!o.isMesh || /Shadow/.test(o.name)) return; for (let p = o; p; p = p.parent) if (p === gun) return; turretFixed.push(o); });
    const turretTris = meshTriangles(turretFixed, turret.matrixWorld.clone().invert());
    const authored = new THREE.Box3(new THREE.Vector3(BOX_SIGHT.x - BOX_SIGHT.w / 2, BOX_SIGHT.y - BOX_SIGHT.h / 2, BOX_SIGHT.z - BOX_SIGHT.d / 2),
      new THREE.Vector3(BOX_SIGHT.x + BOX_SIGHT.w / 2, BOX_SIGHT.y + BOX_SIGHT.h / 2, BOX_SIGHT.z + BOX_SIGHT.d / 2)).translate(turret.position.clone().negate());
    const inBox = authored.clone().expandByScalar(-.005), v = new THREE.Vector3();
    let fixedInBox = 0;
    for (let i = 0; i < turretTris.length; i += 9) {
      v.set((turretTris[i] + turretTris[i + 3] + turretTris[i + 6]) / 3, (turretTris[i + 1] + turretTris[i + 4] + turretTris[i + 7]) / 3, (turretTris[i + 2] + turretTris[i + 5] + turretTris[i + 8]) / 3);
      if (inBox.containsPoint(v)) fixedInBox++;
    }
    assert.equal(fixedInBox, 0, `type96b/${quality}: no turret-fixed part stands in the box sight's authored place`);
    const gunParts = census.filter((p) => p.bucket.startsWith('gunMount'));
    const boot = gunParts.filter((p) => p.bucket === 'gunMount' && Math.abs(p.box.min.z + .40) < .005 && Math.abs(p.box.max.z - .351) < .005);
    assert.equal(boot.length, 1, `type96b/${quality}: the pitching boot rides the gun`);
    const sight = gunParts.filter((p) => p !== boot[0] && p.box.max.x < .13 && p.box.min.x > -.13 && p.box.max.y > .3);
    assert.deepEqual([...new Set(sight.map((p) => p.bucket))].sort(), ['gunMount', 'gunMountDark', 'gunMountGlass'],
      `type96b/${quality}: the box sight (box, saddle, bezel, glass) rides the gun`);
    const sightBox = new THREE.Box3(); for (const p of sight) sightBox.union(p.box);
    const sourceSight = sightBox.clone().translate(sourceOrigin);
    assert.ok(Math.abs(sourceSight.min.x + BOX_SIGHT.w / 2) < 1e-4 && Math.abs(sourceSight.max.x - BOX_SIGHT.w / 2) < 1e-4
      && Math.abs(sourceSight.min.z - (BOX_SIGHT.z - BOX_SIGHT.d / 2)) < 1e-4 && Math.abs(sourceSight.max.z - (BOX_SIGHT.z + BOX_SIGHT.d / 2) - .023) < 1e-4
      && Math.abs(sourceSight.max.y - (BOX_SIGHT.y + BOX_SIGHT.h / 2)) < 1e-5,
      `type96b/${quality}: the riding sight keeps the authored box's width, place and top (source ${sourceSight.min.toArray().map((n) => n.toFixed(4))} .. ${sourceSight.max.toArray().map((n) => n.toFixed(4))})`);
    // seated: down the saddle's footprint (3 mm inside its edges, 1 cm grid) the boot's top and the sight's underside
    const mat = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
    const mesh = (p) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(Float32Array.from(p.tri), 3)); return new THREE.Mesh(g, mat); };
    const saddle = sight.reduce((a, b) => (b.box.min.y < a.box.min.y ? b : a)), foot = saddle.box.clone().expandByScalar(.003);
    const bootMesh = mesh(boot[0]), sightMeshes = sight.map(mesh);
    let bury = 0, gap = 0, n = 0;
    try {
      for (let x = foot.min.x + .006; x <= foot.max.x - .006; x += .01) for (let z = foot.min.z + .006; z <= foot.max.z - .006; z += .01) {
        const b = new THREE.Raycaster(new THREE.Vector3(x, 2, z), new THREE.Vector3(0, -1, 0), 0, 5).intersectObject(bootMesh, false)[0]; if (!b) continue;
        const s = new THREE.Raycaster(new THREE.Vector3(x, b.point.y - .05, z), new THREE.Vector3(0, 1, 0), 0, 1).intersectObjects(sightMeshes, false)[0];
        assert.ok(s, `type96b/${quality}: the box sight covers the boot at ${x.toFixed(3)}, ${z.toFixed(3)}`);
        n++; const d = s.point.y - b.point.y; if (d < 0) bury = Math.max(bury, -d); else gap = Math.max(gap, d);
      }
    } finally { mat.dispose(); for (const o of [bootMesh, ...sightMeshes]) o.geometry.dispose(); }
    assert.ok(n > 500 && gap < 1e-4 && bury <= (quality === 'high' ? .005 : .008) + 1e-4,
      `type96b/${quality}: the box sight is seated on the boot (${n} samples: gap ${(gap * 1000).toFixed(2)} mm, saddle ${(bury * 1000).toFixed(1)} mm in)`);
    // clear of the turret over the whole pitch range
    const turretGrid = new SurfaceGrid(turretTris, { cell: .05, rq: .05 });
    const sightPts = densePoints(Float64Array.from(sight.flatMap((p) => Array.from(p.tri))), .01);
    let sightWorst = { d: Infinity };
    for (const pitch of pitches) {
      const e = pose(0, pitch, turret);
      for (let i = 0; i < sightPts.length; i += 3) {
        const d = turretGrid.distance(...apply(e, sightPts[i], sightPts[i + 1], sightPts[i + 2]));
        if (d < sightWorst.d) sightWorst = { d, pitch };
      }
    }
    assert.ok(sightWorst.d >= .010 - 1e-6,
      `type96b/${quality}: the box sight keeps 10 mm from the turret over the pitch range (${(sightWorst.d * 1000).toFixed(1)} mm at ${(sightWorst.pitch / D).toFixed(1)} deg)`);
    // negative control: the authored box, turret-fixed, inside the pitching boot at every pitch (the box's samples are
    // carried into the gun's frame at each pitch; the boot stays put there)
    const bootTris = Float64Array.from(boot[0].tri), bootBox = new THREE.Box3().setFromArray(bootTris);
    const bootGrid = new SurfaceGrid(bootTris, { cell: .04, rq: .08 }), bootSolid = { tri: bootTris };
    const authoredGeometry = new THREE.BoxGeometry(BOX_SIGHT.w, BOX_SIGHT.h, BOX_SIGHT.d).toNonIndexed()
      .translate(BOX_SIGHT.x - turret.position.x, BOX_SIGHT.y - turret.position.y, BOX_SIGHT.z - turret.position.z);
    const authoredPts = densePoints(Float64Array.from(authoredGeometry.getAttribute('position').array), .01);
    authoredGeometry.dispose();
    const toGun = new THREE.Matrix4();
    const authoredDepth = (pitch) => {
      const e = toGun.fromArray(pose(0, pitch, turret)).invert().elements;
      let deepest = 0;
      for (let i = 0; i < authoredPts.length; i += 3) {
        const [x, y, z] = apply(e, authoredPts[i], authoredPts[i + 1], authoredPts[i + 2]);
        if (bootBox.containsPoint(v.set(x, y, z)) && insideClosed(bootSolid, x, y, z)) deepest = Math.max(deepest, bootGrid.distance(x, y, z));
      }
      return deepest;
    };
    let shallowest = { d: Infinity };
    for (const pitch of pitches) { const d = authoredDepth(pitch); if (d < shallowest.d) shallowest = { d, pitch }; }
    const atRest = authoredDepth(0);
    assert.ok(atRest > .010 && shallowest.d > .001,
      `type96b/${quality}: negative control: the authored box, turret-fixed, lies inside the pitching boot at every pitch (${(atRest * 1000).toFixed(1)} mm deep at rest, least ${(shallowest.d * 1000).toFixed(1)} mm at ${(shallowest.pitch / D).toFixed(1)} deg)`);

    const tSight = secs(t1), t2 = Date.now();
    // ---- 2. the mantlet boot over the hull
    const hullMeshes = [];
    hull.traverse((o) => { if (!o.isMesh || /Shadow|_ghillie_|InteriorFill/.test(o.name)) return; for (let p = o; p; p = p.parent) if (p === turret) return; hullMeshes.push(o); });
    const top = topSurface(meshTriangles(hullMeshes, hull.matrixWorld.clone().invert()));
    const gunMeshes = []; gun.traverse((o) => { if (o.isMesh && !/Shadow/.test(o.name)) gunMeshes.push(o); });
    const all = densePoints(meshTriangles(gunMeshes, gun.matrixWorld.clone().invert()), .01), mantlet = [];
    for (let i = 0; i < all.length; i += 3) if (all[i + 2] < .40 && all[i + 1] < 0) mantlet.push(all[i], all[i + 1], all[i + 2]);
    let worst = { d: -Infinity };
    for (let yaw = 0; yaw < 360; yaw++) {
      const legal = minimumMechanicalGunPitch(spec, yaw * D);
      for (const pitch of pitches) {
        if (pitch < legal - 1e-9) continue;
        const d = depthUnder(mantlet, pose(yaw, pitch, hull), top);
        if (d > worst.d) worst = { d, yaw, pitch };
      }
      const d = depthUnder(mantlet, pose(yaw, Math.max(legal, lowest), hull), top);
      if (d > worst.d) worst = { d, yaw, pitch: legal };
    }
    assert.ok(worst.d <= -.003,
      `type96b/${quality}: the mantlet stands 3 mm over the hull at every yaw and pitch (${(-worst.d * 1000).toFixed(1)} mm at yaw ${worst.yaw}, ${(worst.pitch / D).toFixed(1)} deg)`);
    // negative control: Object_6's unclipped rings at full elevation
    const rings = [];
    for (const [z, half, bottom, ceiling] of OBJECT_6) for (let k = 0; k <= 72; k++) {
      const a = Math.PI + k * Math.PI / 72;
      rings.push(Math.cos(a) * half, (ceiling + bottom) / 2 - TRUNNION.y + Math.sin(a) * (ceiling - bottom) / 2, z - TRUNNION.z);
    }
    const ringPts = Float64Array.from(rings);
    let unclipped = { d: -Infinity };
    for (let yaw = 0; yaw < 360; yaw++) { const d = depthUnder(ringPts, pose(yaw, elevation, hull), top); if (d > unclipped.d) unclipped = { d, yaw }; }
    assert.ok(unclipped.d > .080,
      `type96b/${quality}: negative control: Object_6's unclipped underside at full elevation drops under the hull's top (${(unclipped.d * 1000).toFixed(1)} mm at yaw ${unclipped.yaw})`);
    console.log(`type96b/${quality}: box sight seated (${n} samples, saddle ${(bury * 1000).toFixed(1)} mm in), ${(sightWorst.d * 1000).toFixed(1)} mm from the turret`
      + ` (control: turret-fixed ${(atRest * 1000).toFixed(1)} mm inside the boot at rest, ${(shallowest.d * 1000).toFixed(1)}+ mm at every pitch); mantlet ${(-worst.d * 1000).toFixed(1)} mm over the hull at yaw ${worst.yaw}, ${(worst.pitch / D).toFixed(1)} deg`
      + ` (control: unclipped ${(unclipped.d * 1000).toFixed(1)} mm under it at yaw ${unclipped.yaw}) [build ${tBuild} s, sight ${tSight} s, mantlet ${secs(t2)} s]`);
  } finally { tank.dispose(); }
}
console.log(`type96bSightBoot selftest: OK (${((Date.now() - T0) / 1000).toFixed(0)} s)`);
