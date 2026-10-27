// 262 (owner 2026-10-27: "update/redesign ... turrets and hullls as well based on proper historical referrences so they
// will no longer look so chungus"): the KV-2 is laid out from published dimensions, the D 50/5 sheet, a five-view drawing
// and museum photographs (docs/references/tanks/kv2.md, its gap table). This receipt measures the build against those
// datums by casting rays at the hull's and the turret's own stock, so a later edit that drifts back toward the
// print-era slab (a deck-level fender, a full-width deck, a fat mantlet) fails here with the number it moved.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';

const tank = createTank('kv2', null, { proceduralOnly: true, quality: 'high', camoSeed: 4242, geometryReceipt: true });
try {
  tank.root.updateMatrixWorld(true);
  const turret = tank.root.getObjectByName('rig_turret'), gun = tank.root.getObjectByName('rig_gun');
  const hull = turret.parent;
  const under = (root, test) => { const out = []; root.traverse((o) => { if (o.isMesh && test(o)) out.push(o); }); return out; };
  const inTurret = (o) => { for (let p = o; p; p = p.parent) if (p === turret) return true; return false; };
  const hullStock = under(hull, (o) => o.name === 'hull' && !inTurret(o));
  const turretStock = under(turret, (o) => o.name === 'turret');
  assert.ok(hullStock.length && turretStock.length, 'the hull and turret stock buckets are built');
  const ray = new THREE.Raycaster();
  const hit = (meshes, origin, dir) => {
    ray.set(new THREE.Vector3(...origin), new THREE.Vector3(...dir).normalize());
    const h = ray.intersectObjects(meshes, false)[0];
    assert.ok(h, `a ray from ${origin} along ${dir} meets the stock`);
    return h.point;
  };
  const near = (value, want, tol, what) => {
    console.log(`kv2 ${what}: ${value.toFixed(3)} m (source ${want}, ±${tol})`);
    assert.ok(Math.abs(value - want) <= tol, `${what}: ${value.toFixed(3)} m, the source gives ${want} ±${tol}`);
  };
  // the welded KV-1 hull: roof, belly, sides, nose and tail (S1 6.675 m, S3)
  near(hit(hullStock, [0.3, 5, -0.30], [0, -1, 0]).y, 1.65, 0.01, 'hull roof');
  near(hit(hullStock, [0.3, -5, -0.30], [0, 1, 0]).y, 0.43, 0.01, 'belly (clearance 430 mm)');
  near(hit(hullStock, [5, 1.0, -0.30], [-1, 0, 0]).x, 0.925, 0.01, 'hull side (1.85 m box)');
  near(hit(hullStock, [0.3, 0.91, 9], [0, 0, -1]).z, 3.30, 0.01, 'nose');
  near(hit(hullStock, [0.3, 1.15, -9], [0, 0, 1]).z, -3.375, 0.01, 'tail');
  // the fender shelves 0.28 m under the roof, out to the track's outer edge
  near(hit(hullStock, [1.30, 5, 0.10], [0, -1, 0]).y, 1.37, 0.01, 'fender shelf');
  near(hit(hullStock, [5, 1.36, 0.10], [-1, 0, 0]).x, 1.66, 0.01, 'fender edge');
  // the 1941 production turret: 1.94 m wide, roof at 3.24 m, 2.75 m from front plate to rear plate, rear soffit 1.91 m
  near(hit(turretStock, [-0.60, 9, -0.80], [0, -1, 0]).y, 3.24, 0.01, 'turret roof');
  near(hit(turretStock, [5, 2.4, -0.30], [-1, 0, 0]).x, 0.97, 0.03, 'turret side');
  near(hit(turretStock, [0.78, 2.0, 9], [0, 0, -1]).z, 1.37, 0.01, 'turret front plate');
  near(hit(turretStock, [0.80, 2.2, -9], [0, 0, 1]).z, -1.38, 0.01, 'turret rear plate');
  near(hit(turretStock, [0.50, -5, -1.25], [0, 1, 0]).y, 1.91, 0.01, 'rear overhang soffit');
  near(hit(turretStock, [0.50, -5, -0.40], [0, 1, 0]).y, 1.69, 0.01, 'turret floor ahead of the square step');
  // a 0.70 m track (S1) and the six road wheels and three return rollers a side
  const band = new THREE.Box3();
  for (const m of under(hull, (o) => o.name === 'gearTrackBandL')) band.expandByObject(m);
  near(band.max.x - band.min.x, 0.70, 0.01, 'track width');
  const instances = (name) => under(hull, (o) => o.name === name).reduce((n, m) => n + (m.isInstancedMesh ? m.count : 1), 0);
  assert.equal(instances('gearRoadWheelTires'), 12, 'six road wheels a side');
  assert.equal(instances('gearReturnRollerTires'), 6, 'three return rollers a side');
  // the M-10T: trunnion 0.10 m behind the front plate, the mouth 0.17 m past the nose (6.85 m overall)
  const trunnion = gun.getWorldPosition(new THREE.Vector3());
  near(trunnion.y, 2.67, 0.01, 'trunnion height');
  near(trunnion.z, 1.27, 0.01, 'trunnion station');
  let mouth = null;
  gun.traverse((o) => { if (o.userData?.physicalMouth && !mouth) mouth = o.getWorldPosition(new THREE.Vector3()); });
  assert.ok(mouth, 'the howitzer publishes its mouth');
  near(mouth.z, 3.47, 0.02, 'muzzle station');
  near(mouth.z + 3.38, getSpec('kv2').dims.overallLengthM, 0.03, 'overall length with the howitzer forward');
  console.log('kv2Dimensions.selftest: the KV-2 hull, fenders, turret, tracks and howitzer stand at their published and measured datums');
} finally {
  tank.dispose();
}
