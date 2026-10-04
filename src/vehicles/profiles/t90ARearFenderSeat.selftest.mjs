import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { VEHICLE_SIZE_FACTORS } from '../vehicleSizePolicy.ts';
import { T90A_REAR_SEAT_FRONT_Z_M } from './t90.ts';
import { near } from '../../../tools/receipt-kit.test-support.mjs';

// The T-90A legacy fender lip notches its rear seat over the sprocket for shoe clearance (t90.ts, fender lip i = 0).
// Until 2026-10-03 the notch began at z -2.82, 11 cm behind anything the shoes reach. That left open air between the
// seat and the track that the standard check's top-down scan read as an enclosed pocket (T-90A 2 cells, BMPT T-90 8 at
// its 1.05 size). The seat now runs to T90A_REAR_SEAT_FRONT_Z_M. This receipt checks that edge against the real shoes
// on every hull that authors the lip. The Burlak re-seats the plate outboard (its own section correction), so only the
// sweep clearance applies to it.
const SEAT = Object.freeze({ innerX: 1.62, outerX: 1.78, bottomY: 1.145, topY: 1.195, rearZ: -3.00 });
const CLEARANCE_M = 0.02;

/** Sprocket centre, the wrap shoes' largest vertex distance from its axis, and their lateral extent (installed frame). */
function sprocketSweep(tank, f) {
  let gear;
  tank.root.traverse((o) => { if (!gear && o.userData?.runningGearReceipts) [gear] = o.userData.runningGearReceipts; });
  assert.ok(gear?.sprocket, 'running-gear receipt carries the sprocket');
  const cz = gear.sprocket.z * f, cy = gear.sprocket.y * f;
  const m = new THREE.Matrix4(), w = new THREE.Matrix4(), v = new THREE.Vector3();
  const shoes = [];
  tank.root.traverse((o) => {
    if (!o.isInstancedMesh || o.name !== 'gearTrackPads') return;
    for (let k = 0; k < o.count; k++) {
      o.getMatrixAt(k, m);
      if (Math.abs(m.determinant()) < 1e-12) continue;
      w.multiplyMatrices(o.matrixWorld, m);
      v.setFromMatrixPosition(w);
      if (v.x < 0) continue;
      const d = Math.hypot(v.y - cy, v.z - cz);
      if (d < gear.sprocket.r * f + 0.15 && Math.abs(Math.atan2(v.y - cy, v.z - cz)) > Math.PI / 2) shoes.push({ o, w: w.clone(), d });
    }
  });
  const arcD = Math.min(...shoes.map((s) => s.d));
  const arc = shoes.filter((s) => s.d - arcD < 0.01);
  assert.ok(arc.length >= 3, `shoes ride the sprocket wrap (${arc.length})`);
  // Every vertex of a wrap shoe passes the rearmost angle as the track runs, so its distance from the axis bounds the sweep.
  let reach = 0, minX = Infinity, maxX = -Infinity;
  for (const s of arc) {
    const pos = s.o.geometry.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(s.w);
      reach = Math.max(reach, Math.hypot(v.y - cy, v.z - cz));
      minX = Math.min(minX, v.x); maxX = Math.max(maxX, v.x);
    }
  }
  return { cz, cy, reach, minX, maxX };
}

/** Least radial clearance between the swept wrap and any hull stock behind it: double-sided rays run aft from the
 * sprocket's plane across the track's width and the upper half of the wrap. */
function hullClearanceAft(probes, sweep) {
  let least = Infinity;
  for (const side of [-1, 1]) for (let x = sweep.minX + .01; x <= sweep.maxX - .005; x += .02) {
    for (let y = sweep.cy + .3 * sweep.reach; y <= sweep.cy + sweep.reach + .06; y += .01) {
      const [hit] = new THREE.Raycaster(new THREE.Vector3(side * x, y, sweep.cz), new THREE.Vector3(0, 0, -1), 0, 1)
        .intersectObjects(probes, false);
      if (hit) least = Math.min(least, Math.hypot(hit.point.y - sweep.cy, hit.point.z - sweep.cz) - sweep.reach);
    }
  }
  return least;
}

const hits = (meshes, p, d) => new THREE.Raycaster(new THREE.Vector3(...p), new THREE.Vector3(...d), 0, 10).intersectObjects(meshes, false);
const hullBucket = (o) => /^hull/.test(o.name) && !/shadow|proxy/i.test(o.name);

for (const id of ['t90a', 't90a_burlak', 'bmpt_t90']) {
  const f = VEHICLE_SIZE_FACTORS[id] ?? 1;
  const tank = createTank(id, null, { proceduralOnly: true, quality: 'high', camoSeed: 4242, geometryReceipt: true });
  const disposables = [];
  try {
    tank.root.updateMatrixWorld(true);
    const meshes = [], probes = [];
    tank.root.traverseVisible((o) => {
      if (!o.isMesh || o.isInstancedMesh || o.userData.shadowOnly || /Proxy|procShadow|shadow/i.test(o.name)) return;
      meshes.push(o);
      if (!hullBucket(o)) return;
      const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }), probe = new THREE.Mesh(o.geometry, material);
      probe.matrixWorld.copy(o.matrixWorld); probe.matrixAutoUpdate = false;
      probes.push(probe); disposables.push(material);
    });
    const sweep = sprocketSweep(tank, f);
    const clearance = hullClearanceAft(probes, sweep);
    assert.ok(clearance >= CLEARANCE_M, `${id}: hull stock aft of the sprocket clears the swept wrap by ${clearance.toFixed(4)} m`);
    // Control: an un-notched seat (the full-width plate run on to z -2.50) enters the sweep and is caught.
    const unNotched = new THREE.Mesh(new THREE.BoxGeometry(SEAT.outerX - SEAT.innerX, SEAT.topY - SEAT.bottomY, -2.50 - SEAT.rearZ)
      .scale(f, f, f), new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    unNotched.position.set((SEAT.innerX + SEAT.outerX) / 2 * f, (SEAT.bottomY + SEAT.topY) / 2 * f, (SEAT.rearZ - 2.50) / 2 * f);
    unNotched.updateMatrixWorld(true);
    disposables.push(unNotched.geometry, unNotched.material);
    assert.ok(hullClearanceAft([...probes, unNotched], sweep) < 0, `${id}: an un-notched seat would enter the shoe sweep`);
    if (id === 't90a_burlak') continue;

    const front = T90A_REAR_SEAT_FRONT_Z_M * f, limit = sweep.cz - sweep.reach;
    assert.ok(limit - front >= CLEARANCE_M,
      `${id}: the rear seat (front ${front.toFixed(4)}) stays ${CLEARANCE_M} m behind the shoes' rear limit ${limit.toFixed(4)}`);
    for (const side of [-1, 1]) {
      // The built seat's front face sits where the profile puts it.
      const [face] = hits(meshes, [side * 1.66 * f, 1.17 * f, limit], [0, 0, -1]);
      near(face?.point.z, front, .001, `${id} side ${side}: rear seat front face`);
      // The former pocket (z -2.82 to the seat front) is closed by the seat alone: every vertical ray there lands on
      // the seat slab and nothing else, so the seat ending at -2.82 left open air.
      for (const z of [-2.81, -2.78, -2.75]) for (const x of [1.64, 1.68, 1.72]) {
        const found = hits(meshes, [side * x * f, 4, z * f], [0, -1, 0]);
        near(found[0]?.point.y, SEAT.topY * f, .002, `${id} side ${side}: seat top over the former pocket at x ${x} z ${z}`);
        assert.ok(found.every((h) => h.point.y >= SEAT.bottomY * f - .002 && h.point.y <= SEAT.topY * f + .002),
          `${id} side ${side}: only the seat covers the former pocket at x ${x} z ${z} (${found.map((h) => h.point.y.toFixed(4)).join(', ')})`);
      }
    }
  } finally {
    for (const d of disposables) d.dispose();
    tank.dispose();
  }
}
console.log('t90ARearFenderSeat: T-90A and BMPT T-90 rear seats close the former sprocket pocket; every T-90A-lip hull (Burlak too) keeps 2 cm between hull stock and the swept sprocket wrap, and an un-notched seat is caught PASS');
