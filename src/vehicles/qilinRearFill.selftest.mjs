// Release 227, round 8 (owner 2026-10-19): "the rear of qilinns turret is exposed and nnot filled tho which is why it
// needs a bunch of extra work there and decoraitons and stuff". The Qilin's cut ZTZ-99A2 bustle, closed and loaded
// (profiles/chinaDonorTurretKit.ts qilinBustleFloor, qilinRearRack, qilinRackLoad, qilinRearCamera):
//  1. Nothing of the ring collar's rear half shows from behind: its top, sampled over the 120 degrees astern, is hidden by
//     the turret's own parts from every rear view (elevations 10-45 degrees, up to 60 degrees off dead astern) save at
//     most 1 % of the sight lines. Negative control: without the bustle floor and the rack's load (the round-7 rear) a
//     fifth or more of them see the bare collar.
//  2. The rack carries its load: the net roll, two ammunition cases, the kit bag, the folded tarpaulin and the
//     spare-parts case, each body resting on the rack's floor bars (its lowest point within 2 mm of their tops, over at
//     least one of them), together covering 70 % of the rack's floor; of the sight lines from behind and above (25-50
//     degrees, up to 30 degrees off dead astern) to points over the rack's floor, at least 85 % end on something before
//     reaching the deck. Negative control: the empty rack lets most of them through.
//  3. The bustle floor's flat underside stands 60 mm or more over every hull surface its footprint sweeps as the turret
//     turns (any yaw) and 40 mm over the collar's top; the rear camera's glass looks aft.
// The seating of every part is cnAddOns.selftest.mjs's census; the moving-part clearances are cnClearance.selftest.mjs.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from './tankFactory.ts';
import { censusPart, densePoints, meshTriangles } from './cnTurretGeometry.test-support.mjs';

const ID = 't72b3_qilin', DEG = Math.PI / 180;
const LOAD = ['net-roll', 'ammo-case', 'kit-bag', 'tarp-bundle', 'spare-case'];
const RACK = /^cage-/;

/** The distance along the unit ray (o, d) to the first triangle of the parts, or Infinity (an AABB slab test first). */
function firstHit(parts, o, d, far = 8) {
  let best = far, who = null;
  for (const p of parts) {
    const b = p.box; let t0 = 0, t1 = best;
    for (const k of ['x', 'y', 'z']) {
      if (Math.abs(d[k]) < 1e-12) { if (o[k] < b.min[k] || o[k] > b.max[k]) { t0 = Infinity; break; } continue; }
      let a = (b.min[k] - o[k]) / d[k], c = (b.max[k] - o[k]) / d[k]; if (a > c) [a, c] = [c, a];
      t0 = Math.max(t0, a); t1 = Math.min(t1, c); if (t0 > t1) break;
    }
    if (t0 > t1) continue;
    const T = p.tri;
    for (let t = 0; t < T.length; t += 9) {
      const e1x = T[t + 3] - T[t], e1y = T[t + 4] - T[t + 1], e1z = T[t + 5] - T[t + 2], e2x = T[t + 6] - T[t], e2y = T[t + 7] - T[t + 1], e2z = T[t + 8] - T[t + 2];
      const px = d.y * e2z - d.z * e2y, py = d.z * e2x - d.x * e2z, pz = d.x * e2y - d.y * e2x, det = e1x * px + e1y * py + e1z * pz;
      if (Math.abs(det) < 1e-14) continue;
      const inv = 1 / det, tx = o.x - T[t], ty = o.y - T[t + 1], tz = o.z - T[t + 2], u = (tx * px + ty * py + tz * pz) * inv;
      if (u < 0 || u > 1) continue;
      const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x, v = (d.x * qx + d.y * qy + d.z * qz) * inv;
      if (v < 0 || u + v > 1) continue;
      const s = (e2x * qx + e2y * qy + e2z * qz) * inv;
      if (s > 1e-6 && s < best) { best = s; who = p; }
    }
  }
  return { s: best, part: who };
}

const parts = [];
const tank = createTank(ID, null, { proceduralOnly: true, quality: 'high', geometryReceipt: true, camoSeed: 4242,
  partCensus(bucket, g) { parts.push(censusPart(bucket, g)); } });
try {
  tank.root.updateMatrixWorld(true);
  const turretOwned = parts.filter((p) => p.bucket.startsWith('turret'));
  const collar = turretOwned.filter((p) => p.bucket === 'turret' && p.box.max.y <= .03);
  assert.equal(collar.length, 1, `${ID}: its ring collar (one part under y 0.03)`);
  const collarTop = collar[0].box.max.y, collarR = collar[0].box.max.x;
  const blockers = turretOwned.filter((p) => p !== collar[0]);
  const floor = parts.filter((p) => p.role === 'bustle-floor');
  assert.equal(floor.length, 1, `${ID}: one bustle floor`);

  // ---- 1. the collar's rear half hidden from behind
  const collarSight = (scene) => {
    let seen = 0, n = 0; const o = new THREE.Vector3(), d = new THREE.Vector3();
    for (const r of [collarR - .12, collarR - .04]) for (let a = -60; a <= 60; a += 10) {
      const pt = new THREE.Vector3(r * Math.sin(a * DEG), collarTop + 1e-4, -r * Math.cos(a * DEG));
      for (const e of [10, 20, 30, 45]) for (const az of [-60, -40, -20, 0, 20, 40, 60]) {
        d.set(Math.sin(az * DEG) * Math.cos(e * DEG), Math.sin(e * DEG), -Math.cos(az * DEG) * Math.cos(e * DEG));
        o.copy(pt); n++;
        if (firstHit(scene, o, d).part === null) seen++;
      }
    }
    return seen / n;
  };
  const visible = collarSight(blockers);
  assert.ok(visible <= .01, `${ID}: the ring collar's rear half shows from behind on ${(100 * visible).toFixed(1)} % of the rear sight lines`);
  const bare = collarSight(blockers.filter((p) => p.role !== 'bustle-floor' && !LOAD.includes(p.role)));
  assert.ok(bare >= .20, `negative control: without the bustle floor and the load the collar shows (${(100 * bare).toFixed(1)} %)`);

  // ---- 2. the rack's load
  const bars = parts.filter((p) => p.role === 'cage-floor');
  assert.ok(bars.length >= 6, `${ID}: the rack's floor bars (${bars.length})`);
  const barTop = Math.max(...bars.map((p) => p.box.max.y));
  const vol = (p) => { const s = p.box.getSize(new THREE.Vector3()); return s.x * s.y * s.z; };
  const bodies = LOAD.flatMap((role) => {
    const list = parts.filter((p) => p.role === role);
    assert.ok(list.length, `${ID}: the rack's ${role}`);
    // each item's body (its largest part; the ammunition cases are two items of one role)
    const big = Math.max(...list.map(vol));
    return list.filter((p) => vol(p) > .5 * big);
  });
  assert.ok(bodies.length >= 6, `${ID}: six load items on the rack (${bodies.length})`);
  for (const b of bodies) {
    assert.ok(Math.abs(b.box.min.y - barTop) <= .002, `${ID}: the ${b.role} rests on the floor bars (its base ${(1000 * (b.box.min.y - barTop)).toFixed(1)} mm off their tops)`);
    assert.ok(bars.some((q) => q.box.min.x < b.box.max.x && q.box.max.x > b.box.min.x && q.box.min.z < b.box.max.z && q.box.max.z > b.box.min.z), `${ID}: a floor bar under the ${b.role}`);
  }
  const rails = parts.filter((p) => RACK.test(p.role ?? ''));
  const rack = rails.reduce((b, p) => b.union(p.box), new THREE.Box3());
  const front = Math.max(...bars.map((p) => p.box.max.z)) - .03, rearIn = Math.min(...parts.filter((p) => p.role === 'cage-rear-rail').map((p) => p.box.max.z));
  let covered = 0, cells = 0;
  for (let x = rack.min.x + .04; x <= rack.max.x - .04; x += .01) for (let z = rearIn + .005; z <= front; z += .01) {
    cells++; if (bodies.some((b) => x >= b.box.min.x && x <= b.box.max.x && z >= b.box.min.z && z <= b.box.max.z)) covered++;
  }
  assert.ok(covered / cells >= .70, `${ID}: the load covers ${(100 * covered / cells).toFixed(0)} % of the rack's floor`);
  // sight lines from behind and above (25-50 degrees, up to 30 degrees off dead astern) to points spread over the rack's
  // floor: held when they end on something before passing the floor (a load item, a bar, the rack's frame or the turret
  // itself), through when they reach the deck between the floor bars
  const floorY = barTop;
  const intoRack = (scene) => {
    let held = 0, n = 0; const d = new THREE.Vector3();
    for (const e of [25, 35, 50]) for (const az of [-30, 0, 30]) {
      d.set(-Math.sin(az * DEG) * Math.cos(e * DEG), -Math.sin(e * DEG), Math.cos(az * DEG) * Math.cos(e * DEG));
      for (let x = rack.min.x + .03; x <= rack.max.x - .03; x += .03) for (let z = rearIn + .01; z <= front; z += .03) {
        const target = new THREE.Vector3(x, floorY - .001, z), o = target.clone().addScaledVector(d, -3);
        n++; if (firstHit(scene, o, d, 3.02).part) held++;
      }
    }
    return held / n;
  };
  const held = intoRack(blockers);
  assert.ok(held >= .85, `${ID}: ${(100 * held).toFixed(0)} % of the sight lines into the rack end before the deck`);
  const empty = intoRack(blockers.filter((p) => !LOAD.includes(p.role)));
  assert.ok(empty < .5, `negative control: the empty rack holds only ${(100 * empty).toFixed(0)} % of them`);

  // ---- 3. the bustle floor over the hull and the collar; the rear camera looks aft
  const turret = tank.root.getObjectByName('rig_turret'), hull = turret.parent;
  const hullMeshes = []; hull.traverse((o) => { if (!o.isMesh || /Shadow/.test(o.name)) return; for (let q = o; q; q = q.parent) if (q === turret) return; hullMeshes.push(o); });
  const hullPts = densePoints(meshTriangles(hullMeshes, new THREE.Matrix4().copy(turret.matrixWorld).invert()), .025);
  const f = floor[0].box, rIn = Math.abs(f.max.z), rOut = Math.hypot(Math.max(Math.abs(f.min.x), f.max.x), f.min.z);
  let deck = -Infinity;
  for (let i = 0; i < hullPts.length; i += 3) { const r = Math.hypot(hullPts[i], hullPts[i + 2]); if (r >= rIn - .05 && r <= rOut + .05 && hullPts[i + 1] < f.min.y + .5) deck = Math.max(deck, hullPts[i + 1]); }
  assert.ok(f.min.y - deck >= .060, `${ID}: the bustle floor's underside stands ${(1000 * (f.min.y - deck)).toFixed(0)} mm over the hull it sweeps`);
  assert.ok(f.min.y - collarTop >= .040 - 1e-4, `${ID}: the bustle floor stands ${(1000 * (f.min.y - collarTop)).toFixed(0)} mm over the collar's top`);
  const glass = parts.filter((p) => p.role === 'rear-camera' && /Glass$/.test(p.bucket));
  assert.equal(glass.length, 1, `${ID}: the rear camera's glass`);
  const lens = glass[0].box.getCenter(new THREE.Vector3());
  assert.equal(firstHit(blockers.filter((p) => p.role !== 'rear-camera'), lens.clone().add(new THREE.Vector3(0, 0, -.02)), new THREE.Vector3(0, 0, -1), 4).part, null, `${ID}: the rear camera looks aft unobstructed`);
  console.log(`${ID}: collar hidden (${(100 * visible).toFixed(1)} % seen; ${(100 * bare).toFixed(0)} % without the floor and load), load ${bodies.length} items on ${(100 * covered / cells).toFixed(0)} % of the floor, ${(100 * held).toFixed(0)} % of the rack's sight lines held (${(100 * empty).toFixed(0)} % empty), floor ${(1000 * (f.min.y - deck)).toFixed(0)} mm over the hull`);
} finally { tank.dispose(); }
console.log('qilinRearFill: the Qilin\'s cut bustle closed underneath and its rear rack loaded PASS');
