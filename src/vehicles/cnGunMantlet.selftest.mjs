// Release 262 (cn-type59-longwei lane, owner 2026-10-27): the rebuilt Type 59, the new T-55A and the Longwei keep their guns inside their mantlets over the
// full elevation range the spec allows. At every degree from full depression to full elevation:
//   - every sample of the tube behind the mantlet's front (pulled 4 mm in toward the bore axis) lies inside the mantlet,
//     its canvas cover or the turret's own casting: no stretch of bare tube shows through the slot or the throat;
//   - the mantlet's root section stays inside the casting: the slot never opens a gap behind the mantlet.
// The T-54/T-55 family's mantlet is the pleated canvas cover over the slot (profiles/t54Family.ts addMantletCover); the
// Longwei's is the slim cast mantlet and its boot in the throat between the arrowhead cheeks (profiles/longwei.ts).
// Inside tests count crossings of a near-vertical ray through each closed bucket. A negative control removes the
// Type 59's cover and must expose the tube.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from './tankFactory.ts';
import { getSpec } from './specs.ts';

const DEG = Math.PI / 180;
const RAY = new THREE.Vector3(0.013, 1, 0.007).normalize();

const CASES = [
  // front: the mantlet's front in gun-local z; root: the root section's gun-local z; cover: the mantlet buckets
  { id: 'type59', front: 1.14, root: 0.10, cover: ['gunMountCanvasSkin'], casting: ['turret'] },
  { id: 't55a', front: 1.14, root: 0.10, cover: ['gunMountCanvasSkin'], casting: ['turret'] },
  { id: 'ztz99_longwei', front: 0.70, root: -0.25, cover: ['gunMount', 'gunMountCanvasSkin'], casting: ['turret'] },
];

/** The triangles of `mesh` in `frame`'s coordinates. */
function soup(mesh, frameInv) {
  const pos = mesh.geometry.getAttribute('position'), idx = mesh.geometry.index;
  const m = new THREE.Matrix4().multiplyMatrices(frameInv, mesh.matrixWorld), v = new THREE.Vector3();
  const n = idx ? idx.count : pos.count, out = new Float64Array(n * 3);
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(m);
    out[i * 3] = v.x; out[i * 3 + 1] = v.y; out[i * 3 + 2] = v.z;
  }
  return out;
}

/** Möller-Trumbore crossings of the ray from p along RAY with a triangle soup; a crossing on a shared edge or vertex
 * (equal distance along the ray) counts once. */
function crossings(tris, p) {
  const hits = [];
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3(), h = new THREE.Vector3(), s = new THREE.Vector3(), q = new THREE.Vector3();
  for (let t = 0; t < tris.length; t += 9) {
    e1.set(tris[t + 3] - tris[t], tris[t + 4] - tris[t + 1], tris[t + 5] - tris[t + 2]);
    e2.set(tris[t + 6] - tris[t], tris[t + 7] - tris[t + 1], tris[t + 8] - tris[t + 2]);
    h.crossVectors(RAY, e2);
    const a = e1.dot(h);
    if (Math.abs(a) < 1e-12) continue;
    const f = 1 / a;
    s.set(p.x - tris[t], p.y - tris[t + 1], p.z - tris[t + 2]);
    const u = f * s.dot(h);
    if (u < 0 || u > 1) continue;
    q.crossVectors(s, e1);
    const w = f * RAY.dot(q);
    if (w < 0 || u + w > 1) continue;
    const d = f * e2.dot(q);
    if (d > 1e-6) hits.push(d);
  }
  hits.sort((x, y) => x - y);
  let count = 0;
  for (let i = 0; i < hits.length; i++) if (i === 0 || hits[i] - hits[i - 1] > 1e-7) count++;
  return count;
}

function probe(id, c) {
  const tank = createTank(id, null, { proceduralOnly: true, quality: 'high', geometryReceipt: true, camoSeed: 4242 });
  const spec = getSpec(id);
  const turret = tank.root.getObjectByName('rig_turret'), gun = tank.root.getObjectByName('rig_gun');
  const byName = (name) => { const found = []; tank.root.traverse((o) => { if (o.isMesh && o.name === name) found.push(o); }); return found; };
  const tube = byName('gun').find((o) => { for (let q = o; q; q = q.parent) if (q === gun) return true; return false; });
  assert.ok(tube, `${id}: the gun tube bucket rides rig_gun`);
  const covers = c.cover.flatMap(byName).filter((o) => { for (let q = o; q; q = q.parent) if (q === gun) return true; return false; });
  const castings = c.casting.flatMap(byName).filter((o) => o.parent === turret);
  assert.ok(covers.length === c.cover.length && castings.length, `${id}: mantlet and casting buckets found`);
  // tube surface samples every ~2.5 cm behind the mantlet's front, 4 mm in toward the bore axis (gun frame)
  const tubeTris = soup(tube, new THREE.Matrix4().copy(gun.matrixWorld).invert()), samples = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), cc = new THREE.Vector3();
  for (let t = 0; t < tubeTris.length; t += 9) {
    a.fromArray(tubeTris, t); b.fromArray(tubeTris, t + 3); cc.fromArray(tubeTris, t + 6);
    if (Math.min(a.z, b.z, cc.z) >= c.front) continue;
    const k = Math.max(1, Math.ceil(Math.max(a.distanceTo(b), b.distanceTo(cc), cc.distanceTo(a)) / 0.025));
    for (let u = 0; u <= k; u++) for (let v = 0; v <= k - u; v++) {
      const w = k - u - v, p = new THREE.Vector3().addScaledVector(a, u / k).addScaledVector(b, v / k).addScaledVector(cc, w / k);
      const r = Math.hypot(p.x, p.y);
      if (p.z >= c.front || p.z < -0.05 || r < 0.03) continue;
      samples.push(p.multiply(new THREE.Vector3((r - 0.004) / r, (r - 0.004) / r, 1)));
    }
  }
  // the mantlet's root section (gun frame)
  const rootPts = [];
  for (const mesh of covers) {
    const p = mesh.geometry.getAttribute('position');
    for (let i = 0; i < p.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(p, i).applyMatrix4(mesh.matrix);
      if (Math.abs(v.z - c.root) < 1e-4) rootPts.push(v.multiplyScalar(0.98).setZ(c.root + 0.01));
    }
  }
  assert.ok(samples.length > 200 && rootPts.length >= 8, `${id}: ${samples.length} tube and ${rootPts.length} root samples`);
  const measure = (pitchDeg, coverOn = true) => {
    gun.rotation.x = -pitchDeg * DEG;
    tank.root.updateMatrixWorld(true);
    const inv = turret.matrixWorld.clone().invert();
    const coverTris = coverOn ? covers.map((m) => soup(m, inv)) : [];
    const castTris = castings.map((m) => soup(m, inv));
    const toTurret = new THREE.Matrix4().multiplyMatrices(inv, gun.matrixWorld);
    const inside = (p, sets) => sets.some((tris) => crossings(tris, p) % 2 === 1);
    let exposed = 0, worst = null;
    for (const s of samples) {
      const p = s.clone().applyMatrix4(toTurret);
      if (!inside(p, coverTris) && !inside(p, castTris)) { exposed++; worst ??= s; }
    }
    let rootOut = 0;
    for (const s of rootPts) {
      const p = s.clone().applyMatrix4(toTurret);
      if (!inside(p, castTris)) { rootOut++; if (process.env.DEBUG) console.log('root out', s.toArray().map((v) => v.toFixed(3)), '->', p.toArray().map((v) => v.toFixed(3)), castTris.map((t) => crossings(t, p))); }
    }
    return { pitchDeg, exposed, worst, rootOut };
  };
  const pitches = [];
  for (let p = -spec.gunDepressionDeg; p <= spec.gunElevationDeg + 1e-9; p += 1) pitches.push(p);
  return { tank, spec, pitches, measure };
}

for (const c of CASES) {
  const { tank, spec, pitches, measure } = probe(c.id, c);
  try {
    assert.ok(pitches[0] <= -5 && pitches.at(-1) >= 14, `${c.id}: the sweep spans the gun's range`);
    for (const pitch of pitches) {
      const m = measure(pitch);
      assert.equal(m.exposed, 0, `${c.id} at ${pitch} deg: ${m.exposed} tube samples show outside the mantlet (first at gun-local ${m.worst?.toArray().map((v) => v.toFixed(3))})`);
      assert.equal(m.rootOut, 0, `${c.id} at ${pitch} deg: ${m.rootOut} root samples of the mantlet stand outside the casting`);
    }
    console.log(`${c.id}: tube covered and mantlet root inside the casting at every degree from ${-spec.gunDepressionDeg} to +${spec.gunElevationDeg}`);
    if (c.id === 'type59') {
      const bare = measure(0, false);
      assert.ok(bare.exposed > 20, `${c.id}: negative control: without its cover the tube shows (${bare.exposed} samples)`);
    }
  } finally {
    tank.dispose();
  }
}
console.log('cnGunMantlet.selftest: the Type 59, T-55A and Longwei guns stay inside their mantlets over their full elevation range');
