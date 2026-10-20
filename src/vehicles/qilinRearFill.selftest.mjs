// Release 227, round 8 (owner 2026-10-19): "the rear of qilinns turret is exposed and nnot filled tho which is why it
// needs a bunch of extra work there and decoraitons and stuff". The Qilin's cut ZTZ-99A2 bustle, closed and loaded
// (profiles/chinaDonorTurretKit.ts qilinBustleFloor, qilinRearRack, qilinRackLoad, qilinRearCamera):
//  1. Nothing of the ring collar's rear half shows from behind: its top, sampled over the 120 degrees astern, is hidden by
//     the turret's own parts from every rear view (elevations 10-45 degrees, up to 60 degrees off dead astern) save at
//     most 1 % of the sight lines. Round 9 (critic CN9-06: a floor covering none of the collar failed that by only 0.9
//     points, the load and the bustle's overhang doing most of the hiding): the bustle floor itself stands over the
//     collar's whole top across the 90 degrees astern (a ray up from every sample meets the floor first), and without
//     the rack's load the floor and the turret still hide it from behind. Negative controls: without the bustle floor
//     and the load (the round-7 rear) a fifth or more of the sight lines see the bare collar; without the floor no ray
//     up meets it.
//  2. The rack carries its load: the net roll, two ammunition cases, the kit bag, the folded tarpaulin and the
//     spare-parts case, each body resting on the rack's floor bars (its lowest point within 2 mm of their tops, over at
//     least two of them), together covering 70 % of the rack's floor; of the sight lines from behind and above (25-50
//     degrees, up to 30 degrees off dead astern) to points over the rack's floor, at least 85 % end on something before
//     reaching the deck. Negative control: the empty rack lets most of them through.
//  3. Round 9 (critic CN9-01, CN9-02): no load item goes into the rack or into another item. Each item (its body and the
//     straps, bands, latches and handle on it) meets the rack only by resting at most 1.5 mm into the floor bars' flat
//     tops (exact crossings and depth), keeps 2 mm from every other rack member and from every other item. Negative
//     controls: the spare-parts case moved 31 mm aft (the rear rails 22 mm inside it) and the tarpaulin moved 12 mm
//     forward into the net roll fail; so does a case lifted 10 mm off the bars (check 2).
//  4. Round 9 (critic CN9-03): the bustle floor's top stays 20 mm or more inside the bustle's underside everywhere over its
//     footprint (10 mm grid; the builder fits it to 25 mm on a 20 x 50 mm grid), not only at its loft stations.
//  5. The bustle floor's flat underside stands 60 mm or more over every hull surface as the turret turns, the rack and its
//     load 80 mm or more (round 9, visual critic CN-R7-1: the basket's path crosses the fender stowage's line at 35-60
//     degrees off the rear), measured against every hull mesh at every degree of yaw; the floor stands 40 mm over the
//     collar's top. Negative control: the rack and load lowered 60 mm fail. The rear camera's glass looks aft.
// The seating of every part is cnAddOns.selftest.mjs's census; the moving-part clearances are cnClearance.selftest.mjs.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from './tankFactory.ts';
import { censusPart, densePoints, meshTriangles, partGap, penetrationDepth, SurfaceGrid } from './cnTurretGeometry.test-support.mjs';

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
/** A copy of a census part moved by (dx, dy, dz). */
function moved(p, dx, dy, dz) {
  const tri = Float64Array.from(p.tri); for (let i = 0; i < tri.length; i += 3) { tri[i] += dx; tri[i + 1] += dy; tri[i + 2] += dz; }
  return { ...p, tri, box: p.box.clone().translate(new THREE.Vector3(dx, dy, dz)), dense: undefined, samples: undefined };
}
const label = (p) => `${p.role}[${p.box.min.toArray().map((v) => v.toFixed(3))}..${p.box.max.toArray().map((v) => v.toFixed(3))}]`;

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

  // ---- 1. the collar's rear half hidden from behind, and the floor over it
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
  const unloaded = collarSight(blockers.filter((p) => !LOAD.includes(p.role)));
  assert.ok(unloaded <= .01, `${ID}: without the rack's load the collar's rear half shows on ${(100 * unloaded).toFixed(1)} % of the rear sight lines (the floor must hide it)`);
  const bare = collarSight(blockers.filter((p) => p.role !== 'bustle-floor' && !LOAD.includes(p.role)));
  assert.ok(bare >= .20, `negative control: without the bustle floor and the load the collar shows (${(100 * bare).toFixed(1)} %)`);
  // the floor over the collar's top across the 90 degrees astern: a ray up from each sample meets the floor first
  const roofed = (scene) => {
    let under = 0, n = 0; const up = new THREE.Vector3(0, 1, 0);
    for (const r of [collarR - .12, collarR - .08, collarR - .04, collarR - .005]) for (let a = -45; a <= 45; a += 5) {
      n++; if (firstHit(scene, new THREE.Vector3(r * Math.sin(a * DEG), collarTop + 1e-4, -r * Math.cos(a * DEG)), up, 2).part?.role === 'bustle-floor') under++;
    }
    return under / n;
  };
  const overCollar = roofed(blockers);
  assert.equal(overCollar, 1, `${ID}: the bustle floor stands over the collar's top across the 90 degrees astern (${(100 * overCollar).toFixed(0)} % of the samples)`);
  assert.equal(roofed(blockers.filter((p) => p.role !== 'bustle-floor')), 0, 'negative control: without the floor nothing of it stands over the collar');

  // ---- 2. the rack's load
  const bars = parts.filter((p) => p.role === 'cage-floor');
  assert.ok(bars.length >= 6, `${ID}: the rack's floor bars (${bars.length})`);
  const barTop = Math.max(...bars.map((p) => p.box.max.y));
  const vol = (p) => { const s = p.box.getSize(new THREE.Vector3()); return s.x * s.y * s.z; };
  // each item: one role's parts in contact with each other (the two ammunition cases are two items of one role)
  const items = LOAD.flatMap((role) => {
    const list = parts.filter((p) => p.role === role);
    assert.ok(list.length, `${ID}: the rack's ${role}`);
    const groups = [];
    for (const p of list) {
      const near = groups.filter((g) => g.some((q) => q.box.clone().expandByScalar(.001).intersectsBox(p.box)));
      const merged = [p, ...near.flat()]; for (const g of near) groups.splice(groups.indexOf(g), 1); groups.push(merged);
    }
    return groups.map((g) => ({ role, parts: g, body: g.reduce((a, b) => (vol(b) > vol(a) ? b : a)) }));
  });
  assert.equal(items.length, 6, `${ID}: six load items on the rack (${items.length})`);
  const bodies = items.map((it) => it.body);
  for (const it of items) {
    // its body's lowest point on the bars' tops (a strap round the net roll passes between two bars, below them), over
    // at least two bars
    const b = it.body.box;
    assert.ok(Math.abs(b.min.y - barTop) <= .002, `${ID}: the ${it.role} rests on the floor bars (its base ${(1000 * (b.min.y - barTop)).toFixed(1)} mm off their tops)`);
    const under = bars.filter((q) => q.box.min.x < b.max.x && q.box.max.x > b.min.x && q.box.min.z < b.max.z && q.box.max.z > b.min.z);
    assert.ok(under.length >= 2, `${ID}: the ${it.role} stands on two floor bars or more (${under.length})`);
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

  // ---- 3. no item in the rack or in another item (exact crossings, then depth)
  const loadClash = (all) => {
    const problems = [];
    const rackParts = rails;
    for (const it of all) for (const A of it.parts) {
      const others = [...rackParts, ...all.filter((o) => o !== it).flatMap((o) => o.parts)];
      for (const B of others) {
        if (!A.box.clone().expandByScalar(.003).intersectsBox(B.box)) continue;
        const g = partGap(A, B, .003);
        if (g >= .002) continue;
        const rest = B.role === 'cage-floor';
        const d = g === 0 ? Math.max(penetrationDepth(A, B, .004), penetrationDepth(B, A, .004)) : 0;
        if (rest && d <= .0015 + 1e-6) continue;
        problems.push(`${g === 0 ? `CROSS ${(1000 * d).toFixed(1)} mm` : `TOUCH ${(1000 * g).toFixed(1)} mm`} ${label(A)} x ${label(B)}`);
      }
    }
    return problems;
  };
  assert.deepEqual(loadClash(items), [], `${ID}: the rack's load clear of the rack and of itself`);
  // negative controls (critic CN9-01 seeds S5, S6)
  const shiftItem = (role, which, dz) => items.map((it) => (it.role === role && which(it) ? { ...it, parts: it.parts.map((p) => moved(p, 0, 0, dz)) } : it));
  assert.ok(loadClash(shiftItem('spare-case', () => true, -.031)).some((s) => s.startsWith('CROSS') && s.includes('spare-case') && s.includes('cage-rear-rail')), 'negative control: the spare-parts case moved 31 mm aft crosses the rear rails');
  assert.ok(loadClash(shiftItem('tarp-bundle', () => true, .012)).some((s) => s.startsWith('CROSS') && s.includes('tarp-bundle') && s.includes('net-roll')), 'negative control: the tarpaulin moved 12 mm forward crosses the net roll');

  // ---- 4. the floor's top inside the bustle's underside everywhere over its footprint
  const fb = floor[0].box, stock = turretOwned.filter((p) => (p.bucket === 'turret' || p.bucket === 'turretExternalArmor') && !p.era && p !== floor[0] && p !== collar[0]);
  let shallow = { d: Infinity };
  const down = new THREE.Vector3(0, -1, 0), up = new THREE.Vector3(0, 1, 0);
  for (let x = fb.min.x + .015; x <= fb.max.x - .015 + 1e-9; x += .01) for (let z = fb.min.z + .015; z <= fb.max.z - .015 + 1e-9; z += .01) {
    const t = firstHit(floor, new THREE.Vector3(x, 1.5, z), down, 2);
    const u = firstHit(stock, new THREE.Vector3(x, .03, z), up, 1.5);
    if (!t.part || !u.part) continue;
    const d = (1.5 - t.s) - (.03 + u.s);
    if (d < shallow.d) shallow = { d, x, z };
  }
  assert.ok(shallow.d >= .020, `${ID}: the bustle floor's top stays 20 mm inside the bustle's underside (${(1000 * shallow.d).toFixed(1)} mm at x ${shallow.x?.toFixed(3)}, z ${shallow.z?.toFixed(3)})`);

  // ---- 5. the floor, the rack and its load over the hull at every yaw; the camera looks aft
  const turret = tank.root.getObjectByName('rig_turret'), hull = turret.parent;
  const hullMeshes = []; hull.traverse((o) => { if (!o.isMesh || /Shadow/.test(o.name)) return; for (let q = o; q; q = q.parent) if (q === turret) return; hullMeshes.push(o); });
  const hInv = new THREE.Matrix4().copy(hull.matrixWorld).invert(), ring = turret.position;
  // the hull's triangles within reach of the rear fill (2.6 m of the turret's axis, 0.4 m under the ring to 0.7 m over it)
  const allTris = meshTriangles(hullMeshes, hInv), near = [];
  for (let t = 0; t < allTris.length; t += 9) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let k = 0; k < 9; k += 3) { x0 = Math.min(x0, allTris[t + k]); x1 = Math.max(x1, allTris[t + k]); y0 = Math.min(y0, allTris[t + k + 1]); y1 = Math.max(y1, allTris[t + k + 1]); z0 = Math.min(z0, allTris[t + k + 2]); z1 = Math.max(z1, allTris[t + k + 2]); }
    if (y1 < ring.y - .4 || y0 > ring.y + .7 || Math.hypot(Math.max(x0 - ring.x, 0, ring.x - x1), Math.max(z0 - ring.z, 0, ring.z - z1)) > 2.6) continue;
    for (let k = 0; k < 9; k++) near.push(allTris[t + k]);
  }
  const CAP = .10, hullGrid = new SurfaceGrid(Float64Array.from(near), { cell: .05, rq: CAP });
  const sweep = (list) => {
    const pts = list.map((p) => densePoints(p.tri, .02));
    let best = { d: Infinity }; const v = new THREE.Vector3(), q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
    for (let yd = 0; yd < 360; yd++) {
      const M = new THREE.Matrix4().compose(ring, turret.quaternion.clone().multiply(q.setFromAxisAngle(Y, yd * DEG)), one);
      for (let k = 0; k < pts.length; k++) { const P = pts[k]; for (let i = 0; i < P.length; i += 3) {
        v.set(P[i], P[i + 1], P[i + 2]).applyMatrix4(M); const d = hullGrid.distance(v.x, v.y, v.z);
        if (d < best.d) best = { d, yd, part: list[k] };
      } }
    }
    return best;
  };
  const mm = (b) => (b.d >= CAP ? `>${CAP * 1000}` : (1000 * b.d).toFixed(1));
  const floorHull = sweep(floor);
  assert.ok(floorHull.d >= .060, `${ID}: the bustle floor keeps 60 mm from the hull at every yaw (${mm(floorHull)} mm at yaw ${floorHull.yd})`);
  const carried = parts.filter((p) => RACK.test(p.role ?? '') || LOAD.includes(p.role) || p.role === 'rear-camera');
  const rackHull = sweep(carried);
  assert.ok(rackHull.d >= .080, `${ID}: the rack and its load keep 80 mm from the hull at every yaw (${mm(rackHull)} mm at yaw ${rackHull.yd}, ${rackHull.part && label(rackHull.part)})`);
  const lowered = sweep(carried.filter((p) => p.box.min.y < .20).map((p) => moved(p, 0, -.06, 0)));
  assert.ok(lowered.d < .080, `negative control: the rack and load lowered 60 mm come within 80 mm of the hull (${mm(lowered)} mm)`);
  const f = floor[0].box;
  assert.ok(f.min.y - collarTop >= .040 - 1e-4, `${ID}: the bustle floor stands ${(1000 * (f.min.y - collarTop)).toFixed(0)} mm over the collar's top`);
  const glass = parts.filter((p) => p.role === 'rear-camera' && /Glass$/.test(p.bucket));
  assert.equal(glass.length, 1, `${ID}: the rear camera's glass`);
  const lens = glass[0].box.getCenter(new THREE.Vector3());
  assert.equal(firstHit(blockers.filter((p) => p.role !== 'rear-camera'), lens.clone().add(new THREE.Vector3(0, 0, -.02)), new THREE.Vector3(0, 0, -1), 4).part, null, `${ID}: the rear camera looks aft unobstructed`);
  console.log(`${ID}: collar hidden (${(100 * visible).toFixed(1)} % seen; ${(100 * unloaded).toFixed(1)} % without the load; ${(100 * bare).toFixed(0)} % without the floor and load; the floor over all of its top astern), load ${items.length} items on ${(100 * covered / cells).toFixed(0)} % of the floor, ${(100 * held).toFixed(0)} % of the rack's sight lines held (${(100 * empty).toFixed(0)} % empty), no item in the rack or another, floor ${(1000 * shallow.d).toFixed(1)} mm or more inside the underside, over the hull at every yaw: floor ${mm(floorHull)} mm, rack and load ${mm(rackHull)} mm`);
} finally { tank.dispose(); }
console.log('qilinRearFill: the Qilin\'s cut bustle closed underneath and its rear rack loaded PASS');
