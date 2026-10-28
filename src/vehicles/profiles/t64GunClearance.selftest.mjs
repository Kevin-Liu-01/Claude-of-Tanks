// 262: the T-64s' 2A46M-1 clears its own turret. The tube leaves the cast mask (gunMount, which pitches with it) and runs
// past the reactive horseshoe, the L-2G searchlight and the crown's kit; a mask that pitches with the gun makes "the gun
// stays inside its mantlet" true by construction, so this receipt measures the tube AHEAD of the mask against every
// fixed turret part (the casting, the Nizh or Kontakt-1 blocks, the searchlight, the cupola and its remote NSVT, the
// sights, the rack): at the gun's full depression, at level and at full elevation, the recoiling tube, sampled every 3 cm
// along every triangle edge 0.62 m or more ahead of the trunnion keeps T64_TUBE_KEEP_M from them. Negative control: a 3 cm rod laid
// across the tube 0.9 m ahead of the trunnion fails the same measure. (tools/gun-depression-sweep.mjs and
// nationalGunClearance.selftest.mjs hold the gun over the hull.)
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';

const T64_TUBE_KEEP_M = .02, MASK_FRONT_M = .62, DEG = Math.PI / 180;
const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), q = new THREE.Vector3();
const ab = new THREE.Vector3(), ac = new THREE.Vector3(), ap = new THREE.Vector3();

/** Squared distance from p to triangle abc (Ericson, Real-Time Collision Detection 5.1.5). */
function triDistSq(p, a, b, c) {
  ab.subVectors(b, a); ac.subVectors(c, a); ap.subVectors(p, a);
  const d1 = ab.dot(ap), d2 = ac.dot(ap);
  if (d1 <= 0 && d2 <= 0) return p.distanceToSquared(a);
  const bp = p.clone().sub(b), d3 = ab.dot(bp), d4 = ac.dot(bp);
  if (d3 >= 0 && d4 <= d3) return p.distanceToSquared(b);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return p.distanceToSquared(q.copy(a).addScaledVector(ab, d1 / (d1 - d3)));
  const cp = p.clone().sub(c), d5 = ab.dot(cp), d6 = ac.dot(cp);
  if (d6 >= 0 && d5 <= d6) return p.distanceToSquared(c);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return p.distanceToSquared(q.copy(a).addScaledVector(ac, d2 / (d2 - d6)));
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0)
    return p.distanceToSquared(q.copy(b).addScaledVector(c.clone().sub(b), (d4 - d3) / ((d4 - d3) + (d5 - d6))));
  const denom = 1 / (va + vb + vc);
  return p.distanceToSquared(q.copy(a).addScaledVector(ab, vb * denom).addScaledVector(ac, vc * denom));
}

function visible(o) { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; }
function eachTriangle(mesh, fn) {
  const g = mesh.geometry, pos = g.getAttribute('position'), idx = g.index;
  const n = idx ? idx.count : pos.count, m = new THREE.Matrix4();
  const instances = mesh.isInstancedMesh ? mesh.count : 1;
  for (let k = 0; k < instances; k++) {
    if (mesh.isInstancedMesh) { mesh.getMatrixAt(k, m); m.premultiply(mesh.matrixWorld); } else m.copy(mesh.matrixWorld);
    for (let i = 0; i + 2 < n; i += 3) {
      a.fromBufferAttribute(pos, idx ? idx.getX(i) : i).applyMatrix4(m);
      b.fromBufferAttribute(pos, idx ? idx.getX(i + 1) : i + 1).applyMatrix4(m);
      c.fromBufferAttribute(pos, idx ? idx.getX(i + 2) : i + 2).applyMatrix4(m);
      fn(a, b, c, mesh);
    }
  }
}

/** The tube's smallest distance to the fixed turret at gun pitch `pitch` (radians, up positive). */
function tubeClearance(tank, pitch) {
  const turret = tank.root.getObjectByName('rig_turret'), gun = tank.root.getObjectByName('rig_gun');
  gun.rotation.x = -pitch; tank.root.updateMatrixWorld(true);
  const gunInv = gun.matrixWorld.clone().invert(), local = new THREE.Vector3();
  const samples = [];
  gun.traverse((o) => {
    if (!o.isMesh || !visible(o) || /gunMount/i.test(o.name)) return;
    // every 3 cm along each triangle edge: a turned tube's vertices stand only at its stations' ends
    eachTriangle(o, (p0, p1, p2) => {
      for (const [u, v] of [[p0, p1], [p1, p2], [p2, p0]]) {
        const n = Math.max(1, Math.ceil(u.distanceTo(v) / .03));
        for (let k = 0; k < n; k++) {
          const p = u.clone().lerp(v, k / n);
          if (local.copy(p).applyMatrix4(gunInv).z >= MASK_FRONT_M) samples.push(p);
        }
      }
    });
  });
  const box = new THREE.Box3().setFromPoints(samples).expandByScalar(.25);
  const tris = [];
  turret.traverse((o) => {
    if (!o.isMesh || !visible(o)) return;
    for (let p = o; p && p !== turret; p = p.parent) if (p === gun) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    if (mats.every((m) => !m || m.visible === false || m.colorWrite === false) || o.userData?.shadowOnly) return;
    eachTriangle(o, (p0, p1, p2, mesh) => {
      const t = new THREE.Box3().setFromPoints([p0, p1, p2]);
      if (t.intersectsBox(box)) tris.push([p0.clone(), p1.clone(), p2.clone(), mesh.name]);
    });
  });
  let best = Infinity, part = null;
  for (const s of samples) for (const [p0, p1, p2, name] of tris) {
    const d = triDistSq(s, p0, p1, p2);
    if (d < best) { best = d; part = name; }
  }
  return { d: Math.sqrt(best), part, samples: samples.length };
}

for (const id of ['t64bm1m', 't64bv', 't64b1v_2022', 'pt64_tur']) {
  const spec = getSpec(id);
  const tank = createTank(id, null, { proceduralOnly: true, quality: 'high', camoSeed: 4242, geometryReceipt: true });
  try {
    for (const pitchDeg of [-spec.gunDepressionDeg, 0, spec.gunElevationDeg]) {
      const m = tubeClearance(tank, pitchDeg * DEG);
      console.log(`${id} pitch ${pitchDeg}: tube ${(m.d * 100).toFixed(1)} cm from ${m.part} (${m.samples} samples)`);
      assert.ok(m.samples > 2000, `${id}: the tube ahead of its mask is sampled`);
      assert.ok(m.d >= T64_TUBE_KEEP_M, `${id} at ${pitchDeg} deg: ${m.part} stands ${(m.d * 100).toFixed(1)} cm from the tube`);
    }
    // negative control: a rod across the tube's path 0.9 m ahead of the trunnion, on the fixed turret
    const turret = tank.root.getObjectByName('rig_turret'), gun = tank.root.getObjectByName('rig_gun');
    const rod = new THREE.Mesh(new THREE.BoxGeometry(.60, .03, .03), new THREE.MeshBasicMaterial());
    rod.name = 'negativeControlRod';
    rod.position.set(gun.position.x, gun.position.y, gun.position.z + .9);
    turret.add(rod);
    const crossed = tubeClearance(tank, 0);
    assert.ok(crossed.d < T64_TUBE_KEEP_M && crossed.part === 'negativeControlRod', `${id}: a rod across the tube fails`);
    turret.remove(rod); rod.geometry.dispose(); rod.material.dispose();
  } finally {
    tank.dispose();
  }
}
console.log('t64GunClearance.selftest: each T-64 tube clears its fixed turret at full depression, level and full elevation');
