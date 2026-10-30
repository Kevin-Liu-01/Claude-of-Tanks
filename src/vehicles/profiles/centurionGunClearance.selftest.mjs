// Release 263 (the rebuilt Centurion family, profiles/centurionFamily.ts; the lane brief: "the gun stays inside its
// mantlet over the source elevation range ... the barrel never passes through the hull or stowage"): the Centurion Mk 3
// and Strv 81B guns over their own hulls, from -10 to +20 degrees (the handbook's limits, W).
//   - in its mantlet: the cast mantlet, its boss and its canvas pitch with the gun round its root, and ahead of the
//     mantlet's face (the foremost of its cast block, boss and canvas cover or bellows) the tube keeps 25 mm from every
//     drawn turret part that does not pitch with it (the casting, bins, cupola,
//     sight, roof gun, dischargers) at every 5 degrees from -10 to +20; negative control: a rod across its path fails;
//   - over its hull (gunHullClearance.test-support.mjs, the national lanes' measure): the barrel keeps 25 mm from every
//     hull mesh at every degree of turret yaw at its published stop (CENTURION_GUN_PITCH_BY_YAW, measured with
//     tools/gun-depression-sweep.mjs --no-suit), at level and at full elevation; the mount (mantlet, cover, coaxial gun)
//     keeps 20 mm;
//   - negative control: at its bare 10 degrees, with no curve, each barrel comes within 25 mm of its hull (over the
//     driver's periscopes and the raised engine deck), so the curve is doing work.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';
import { gunHullProbe, gunHullSweep } from '../gunHullClearance.test-support.mjs';

const T0 = Date.now(), MOUNT_KEEP = 0.020, BARREL_KEEP = 0.025, DEG = Math.PI / 180;
const IDS = process.env.CENTURION_GUN_IDS?.split(',') ?? ['centurion3', 'strv81'];

/** Closest distance from p to triangle (a, b, c) (Ericson). */
function triDistance(p, a, b, c, ab, ac, ap, q) {
  ab.subVectors(b, a); ac.subVectors(c, a); ap.subVectors(p, a);
  const d1 = ab.dot(ap), d2 = ac.dot(ap);
  if (d1 <= 0 && d2 <= 0) return p.distanceTo(a);
  const bp = q.subVectors(p, b), d3 = ab.dot(bp), d4 = ac.dot(bp);
  if (d3 >= 0 && d4 <= d3) return p.distanceTo(b);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return p.distanceTo(q.copy(a).addScaledVector(ab, d1 / (d1 - d3)));
  const cp = q.subVectors(p, c), d5 = ab.dot(cp), d6 = ac.dot(cp);
  if (d6 >= 0 && d5 <= d6) return p.distanceTo(c);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return p.distanceTo(q.copy(a).addScaledVector(ac, d2 / (d2 - d6)));
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) return p.distanceTo(q.copy(b).addScaledVector(q.subVectors(c, b).clone(), (d4 - d3) / ((d4 - d3) + (d5 - d6))));
  const den = 1 / (va + vb + vc);
  return p.distanceTo(q.copy(a).addScaledVector(ab, vb * den).addScaledVector(ac, vc * den));
}

/** The tube ahead of its canvas cover's face against every drawn turret part that does not pitch with it (the casting,
 * bins, cupola, sight, roof gun, dischargers), at every 5 degrees from -10 to +20: the nearest approach. `extra` adds a
 * mesh to the turret (the negative control). */
function barrelOverTurret(id, extra = null) {
  const tank = createTank(id, null, { proceduralOnly: true, quality: 'high', geometryReceipt: true, camoSeed: 4242 });
  try {
    const turret = tank.root.getObjectByName('rig_turret'), gun = tank.root.getObjectByName('rig_gun');
    const recoil = tank.root.getObjectByName('rig_recoil');
    if (extra) turret.add(extra);
    const under = (o, g) => { for (let p = o; p; p = p.parent) if (p === g) return true; return false; };
    const drawn = (o) => o.isMesh && !/^procShadow/.test(o.name) && [o.material].flat().some((m) => m && m.colorWrite !== false && m.visible !== false);
    const fixed = [], tube = [];
    turret.traverse((o) => { if (drawn(o)) (under(o, gun) ? (under(o, recoil) ? tube : null) : fixed)?.push(o); });
    tank.root.updateMatrixWorld(true);
    // the mantlet's face: the foremost point of its cast block, boss and canvas (the gunMount and gunMountCloth buckets;
    // the coaxial gun's barrel and fittings in gunMountDark stand ahead of it and are not its face)
    let faceZ = 0;
    const v = new THREE.Vector3();
    gun.traverse((o) => {
      if (o.isMesh && (o.name === 'gunMount' || o.name === 'gunMountCloth')) {
        const p = o.geometry.getAttribute('position');
        for (let i = 0; i < p.count; i++) faceZ = Math.max(faceZ, v.fromBufferAttribute(p, i).z);
      }
    });
    assert.ok(faceZ > 0.5, `${id}: the mantlet's face stands ahead of the trunnion (${faceZ.toFixed(3)} m)`);
    // tube samples in the gun frame, every 3 cm along each triangle's edges ahead of the face (a cylinder's vertices lie
    // only at its ends; its facets are 2 cm wide)
    const inv = new THREE.Matrix4().copy(gun.matrixWorld).invert(), local = [];
    for (const o of tube) {
      const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld), p = o.geometry.getAttribute('position'), idx = o.geometry.index;
      const n = idx ? idx.count : p.count;
      for (let i = 0; i < n; i += 3) {
        const [a, b, c] = [0, 1, 2].map((k) => new THREE.Vector3().fromBufferAttribute(p, idx ? idx.getX(i + k) : i + k).applyMatrix4(m));
        for (const [e0, e1] of [[a, b], [b, c], [c, a]]) {
          const steps = Math.max(1, Math.ceil(e0.distanceTo(e1) / 0.03));
          for (let u = 0; u < steps; u++) {
            v.copy(e0).lerp(e1, u / steps);
            if (v.z > faceZ) local.push(v.clone());
          }
        }
      }
    }
    // the fixed turret's triangles in the turret frame, near the gun's sweep (within 1.5 m of the trunnion's vertical
    // plane and above the casting's foot)
    const tInv = new THREE.Matrix4().copy(turret.matrixWorld).invert(), tris = [];
    for (const o of fixed) {
      const m = new THREE.Matrix4().multiplyMatrices(tInv, o.matrixWorld), p = o.geometry.getAttribute('position'), idx = o.geometry.index;
      const n = idx ? idx.count : p.count;
      for (let i = 0; i < n; i += 3) {
        const t = [0, 1, 2].map((k) => new THREE.Vector3().fromBufferAttribute(p, idx ? idx.getX(i + k) : i + k).applyMatrix4(m));
        // only what the tube's sweep can reach: within 0.45 m of the bore's vertical plane, above the trunnion's foot
        if (t.every((u) => Math.abs(u.x) > 0.45) || t.every((u) => u.z < gun.position.z) || t.every((u) => u.y < gun.position.y - 0.45)) continue;
        tris.push(t);
      }
    }
    const ab = new THREE.Vector3(), ac = new THREE.Vector3(), ap = new THREE.Vector3(), q = new THREE.Vector3(), w = new THREE.Vector3();
    const pose = new THREE.Matrix4(), rot = new THREE.Matrix4();
    let worst = { d: Infinity };
    for (let pitch = -10; pitch <= 20; pitch += 5) {
      pose.makeTranslation(gun.position.x, gun.position.y, gun.position.z).multiply(rot.makeRotationX(-pitch * DEG));
      for (let k = 0; k < local.length; k++) {
        w.copy(local[k]).applyMatrix4(pose);
        for (const [a, b, c] of tris) {
          if (Math.abs(w.x - a.x) > 0.35 && Math.abs(w.x - b.x) > 0.35 && Math.abs(w.z - a.z) > 0.35) continue;
          const d = triDistance(w, a, b, c, ab, ac, ap, q);
          if (d < worst.d) worst = { d, pitch, at: w.toArray().map((x) => +x.toFixed(3)) };
        }
      }
    }
    return { faceZ, samples: local.length, tris: tris.length, worst };
  } finally {
    tank.dispose?.();
  }
}

const report = {};
for (const id of IDS) {
  const spec = getSpec(id);
  assert.equal(spec.gunElevationDeg, 20, `${id}: +20 degrees (W)`);
  assert.equal(spec.gunDepressionDeg, 10, `${id}: -10 degrees (W)`);
  const cover = barrelOverTurret(id);
  assert.ok(cover.worst.d >= BARREL_KEEP, `${id}: the tube keeps 25 mm from its own turret from -10 to +20 deg (${(cover.worst.d * 1000).toFixed(1)} mm at ${cover.worst.pitch} deg, ${cover.worst.at})`);
  if (id === IDS[0]) {
    // negative control: a 3 cm rod across the tube's path 1.2 m ahead of the trunnion, as a roof fitting would stand
    const rod = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.03), new THREE.MeshBasicMaterial());
    rod.name = 'negativeControlRod';
    rod.position.set(0, getSpec(id).armor.gunPivot[1] + 0.33, getSpec(id).armor.gunPivot[2] + 1.2);
    const crossed = barrelOverTurret(id, rod);
    assert.ok(crossed.worst.d < BARREL_KEEP, `${id}: negative control: a rod across the tube's path comes within 25 mm`);
    rod.geometry.dispose(); rod.material.dispose();
  }
  const probe = gunHullProbe(id, { suit: false });
  try {
    assert.ok(spec.gunPitchByYawDeg, `${id}: publishes its gun curve`);
    const barrel = gunHullSweep(probe, spec, { partsAt: () => 'barrel' });
    assert.ok(barrel.d >= BARREL_KEEP - 1e-4, `${id}: the barrel keeps 25 mm from its hull at every yaw (${(barrel.d * 1000).toFixed(1)} mm at yaw ${barrel.yd}, pitch ${(barrel.pitch / DEG).toFixed(2)}, ${barrel.part})`);
    const mount = gunHullSweep(probe, spec, { partsAt: () => 'mount' });
    assert.ok(mount.d >= MOUNT_KEEP - 1e-4, `${id}: the mount keeps 20 mm from its hull at every yaw (${(mount.d * 1000).toFixed(1)} mm at yaw ${mount.yd}, pitch ${(mount.pitch / DEG).toFixed(2)}, ${mount.part})`);
    const bare = gunHullSweep(probe, { gunDepressionDeg: spec.gunDepressionDeg }, { stop: BARREL_KEEP, partsAt: () => 'barrel' });
    assert.ok(bare.d < BARREL_KEEP, `${id}: negative control: at its bare -${spec.gunDepressionDeg} the barrel comes within 25 mm of its hull`);
    report[id] = { coverFaceM: +cover.faceZ.toFixed(3), turretMm: +(cover.worst.d * 1000).toFixed(1), barrelMm: +(barrel.d * 1000).toFixed(1), mountMm: +(mount.d * 1000).toFixed(1), bareAt: [bare.yd, bare.part] };
  } finally { probe.dispose(); }
}
console.log(`centurionGunClearance: ${JSON.stringify(report)}; the guns stay inside their covers and off their hulls PASS (${((Date.now() - T0) / 1000).toFixed(0)} s)`);
