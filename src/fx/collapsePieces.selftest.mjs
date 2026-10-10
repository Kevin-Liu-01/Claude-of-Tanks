// A building's collapse as bodies (dcore 2026-10-10; fx/collapsePieces.ts, fx/collapseBodies.ts over the physics lane's
// debris pool): for a sample of regional houses and a default-kit block, struck from each side,
//   - the plan stays within its cap, every number finite, every piece's mass and boxes positive, the struck face first;
//   - no two proxies start inside each other (each stands clear of its neighbours, the stubs and the floor slabs);
//   - the partition loses no triangle area: the building's own triangles all land in a piece or in the remnant, each
//     piece's within reach of its proxy;
//   - the plan is the same twice (seeded by the building and the blow);
//   - in the pool (flat ground, the stubs as records) the collapse comes down and lies still within 12 s, never faster
//     than a fall from the roof, nothing under the ground or flung away, and a second run lies the same to the bit.
import assert from 'node:assert/strict';
import { ARCHITECTURE_STYLES, buildRegionalParts, regionalKitPlanOf } from '../world/maps/regional/index.ts';
import { streamFrom } from '../world/maps/regional/geometry.ts';
import { structureDamageKitChain } from '../world/destructionKit.ts';
import { describeDefault } from '../world/destructionDefaultKit.ts';
import {
  STATIC_PIECE, capPiece, capStubs, partitionTriangles, pieceKick, pieceShape, pieceSpawn, planCollapsePieces, stubRecords,
} from './collapsePieces.ts';
import { createDebrisPhysics } from './debrisPhysics.ts';

function build(style, id, seed, wall) {
  const [w, d, h] = [7 + (seed % 5), 9 + (seed % 7), 6.5];
  const parts = buildRegionalParts(style, { structureId: id, info: { w, d, h }, bounds: { minX: -w / 2, maxX: w / 2, minZ: -d / 2, maxZ: d / 2, maxY: h },
    wallBucket: wall, rng: streamFrom(seed), variant: streamFrom(seed * 7 + 3), mapId: 'damage', snowCap: false, tier: 'desktop' }, streamFrom(seed * 3 + 5));
  return { parts, w, d, h };
}
const finite = (v, label) => assert.ok(Number.isFinite(v), `${label}: finite (${v})`);

/** The parts' triangles as a position + normal soup (stride 6). */
function soupOf(parts) {
  const out = [];
  for (const geos of Object.values(parts)) {
    if (!Array.isArray(geos)) continue;
    for (const g0 of geos) {
      if (!g0?.attributes?.position) continue;
      const g = g0.index ? g0.toNonIndexed() : g0;
      const p = g.attributes.position, n = g.attributes.normal;
      for (let i = 0; i < p.count; i++) out.push(p.getX(i), p.getY(i), p.getZ(i), n ? n.getX(i) : 0, n ? n.getY(i) : 1, n ? n.getZ(i) : 0);
    }
  }
  return new Float64Array(out);
}
function area(list, stride) {
  let a = 0;
  for (let i = 0; i < list.length; i += 3 * stride) {
    const ax = list[i], ay = list[i + 1], az = list[i + 2];
    const bx = list[i + stride] - ax, by = list[i + stride + 1] - ay, bz = list[i + stride + 2] - az;
    const cx = list[i + 2 * stride] - ax, cy = list[i + 2 * stride + 1] - ay, cz = list[i + 2 * stride + 2] - az;
    a += Math.hypot(by * cz - bz * cy, bz * cx - bx * cz, bx * cy - by * cx) / 2;
  }
  return a;
}

// boxes in the body frame: a piece's boxes through its rotation, a stub's along its face
function rot(q, v) {
  const [qx, qy, qz, qw] = q, [x, y, z] = v;
  const cx = qy * z - qz * y + qw * x, cy = qz * x - qx * z + qw * y, cz = qx * y - qy * x + qw * z;
  return [x + 2 * (qy * cz - qz * cy), y + 2 * (qz * cx - qx * cz), z + 2 * (qx * cy - qy * cx)];
}
function pieceBoxes(piece) {
  return piece.boxes.map((b) => {
    const c = rot(piece.rotation, b.center);
    const axis = (v) => rot(piece.rotation, b.rotation ? rot(b.rotation, v) : v);
    return { c: [piece.center[0] + c[0], piece.center[1] + c[1], piece.center[2] + c[2]],
      a: [axis([1, 0, 0]), axis([0, 1, 0]), axis([0, 0, 1])], h: b.half, piece: piece.index };
  });
}
/** How far two oriented boxes overlap along their least-separating axis (≤ 0: apart). */
function overlap(A, B) {
  const axes = [...A.a, ...B.a];
  for (const a of A.a) for (const b of B.a) {
    const c = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const l = Math.hypot(...c);
    if (l > 1e-6) axes.push(c.map((v) => v / l));
  }
  let least = Infinity;
  const d = [B.c[0] - A.c[0], B.c[1] - A.c[1], B.c[2] - A.c[2]];
  for (const ax of axes) {
    const proj = (box) => box.a.reduce((s, e, i) => s + Math.abs(e[0] * ax[0] + e[1] * ax[1] + e[2] * ax[2]) * box.h[i], 0);
    const sep = Math.abs(d[0] * ax[0] + d[1] * ax[1] + d[2] * ax[2]);
    least = Math.min(least, proj(A) + proj(B) - sep);
    if (least <= 0) return least;
  }
  return least;
}

const SAMPLE = [['hessian', 'cottage', 'stone'], ['hessian', 'tavern', 'plaster'], ['franconian', 'rowhouse', 'plaster'],
  ['kolkhoz', 'cottage', 'plaster'], ['breton', 'cottage', 'stone'], ['savoyard', 'cottage', 'plaster'], ['polder', 'cottage', 'stone']];
const BLOWS = [[0, -1], [1, 0], [0, 1], [-1, 0]];
let planned = 0, pieceCount = 0, worstOverlap = 0, cutTris = 0;
const anatomies = [];
for (const [styleId, id, wall] of SAMPLE) {
  const style = ARCHITECTURE_STYLES.find((s) => s.id === styleId);
  if (!style?.builders[id]) continue;
  const { parts, w, d, h } = build(style, id, 7, wall);
  const describe = structureDamageKitChain(id, styleId).find((k) => k.describe)?.describe;
  const a = describe?.({ structureIdx: 4, mapId: 'damage', builder: id, style: styleId, parts, w, d, h, placement: { x: 0, y: 0, z: 0, yaw: 0 },
    massClass: 'house', seed: 5, kitPlan: regionalKitPlanOf(parts) });
  if (!a) continue;
  anatomies.push({ label: `${styleId}/${id}`, a, parts });
}
// a default-kit block (a hall's box read by the core's own describe)
{
  const w = 14, d = 20, h = 7;
  const box = { attributes: {} };
  const a = describeDefault({ structureIdx: 9, mapId: 'damage', builder: 'warehouse', style: null, parts: {}, w, d, h,
    placement: { x: 0, y: 0, z: 0, yaw: 0 }, massClass: 'large', seed: 77 });
  if (a?.storeys?.length) anatomies.push({ label: 'default/warehouse', a, parts: null });
  void box;
}
assert.ok(anatomies.length >= 5, `a sample of houses described (${anatomies.length})`);

for (const { label, a, parts } of anatomies) {
  for (const [bx, bz] of BLOWS) {
    const blow = { cause: 'blast', dirX: bx, dirZ: bz, point: [-bx * a.w / 2, 2, -bz * a.d / 2] };
    const plan = planCollapsePieces(a, blow);
    const again = planCollapsePieces(a, blow);
    assert.equal(JSON.stringify(again.pieces), JSON.stringify(plan.pieces), `${label}: the same plan twice`);
    const cap = a.massClass === 'shed' ? 12 : 24;
    assert.ok(plan.pieces.length >= 4 && plan.pieces.length <= cap, `${label}: ${plan.pieces.length} pieces within its cap ${cap}`);
    planned++;
    pieceCount += plan.pieces.length;
    for (const p of plan.pieces) {
      for (const v of [...p.center, ...p.rotation, p.massKg, p.releaseS, ...p.kick, ...p.kickAt]) finite(v, `${label} piece ${p.index}`);
      assert.ok(p.massKg > 0 && p.boxes.every((b) => b.half.every((v) => v > 0.01)), `${label}: piece ${p.index} has mass and size`);
      assert.ok(Math.abs(Math.hypot(...p.rotation) - 1) < 1e-6, `${label}: piece ${p.index}'s rotation is a unit quaternion`);
      // inside the building's envelope (a metre's margin for the eaves and a jetty)
      assert.ok(Math.abs(p.center[0] - plan.cx) < a.w / 2 + 1.2 && Math.abs(p.center[2] - plan.cz) < a.d / 2 + 1.2 && p.center[1] > 0 && p.center[1] < a.h + 1,
        `${label}: piece ${p.index} (${p.kind}) inside the building (${p.center.map((v) => v.toFixed(2))})`);
    }
    // the struck face goes first
    const walls = plan.pieces.filter((p) => p.kind === 'wall');
    const struck = walls.filter((p) => {
      const f = a.storeys[p.face.storey].faces[p.face.face];
      return f.out[0] * bx + f.out[2] * bz < -0.5;
    });
    if (struck.length && walls.length > struck.length) {
      assert.ok(Math.min(...struck.map((p) => p.releaseS)) <= Math.min(...walls.filter((p) => !struck.includes(p)).map((p) => p.releaseS)),
        `${label}: the struck face goes first`);
    }
    // no proxy starts inside another, nor inside a stub
    const boxes = plan.pieces.flatMap(pieceBoxes);
    const stubs = stubRecords(plan, a.placement).map((r) => {
      const s = r.shape2, fx = Math.sin(s.yaw), fz = Math.cos(s.yaw);
      return { c: [s.cx, (s.y0 + s.y1) / 2, s.cz], a: [[fz, 0, -fx], [0, 1, 0], [fx, 0, fz]], h: [s.hw, (s.y1 - s.y0) / 2, s.hl], piece: -1 };
    });
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        if (boxes[i].piece === boxes[j].piece) continue;
        const o = overlap(boxes[i], boxes[j]);
        worstOverlap = Math.max(worstOverlap, o);
        assert.ok(o < 0.03, `${label}: pieces ${boxes[i].piece} (${plan.pieces[boxes[i].piece].kind}) and ${boxes[j].piece} (${plan.pieces[boxes[j].piece].kind}) start ${o.toFixed(3)} m inside each other`);
      }
      for (const s of stubs) {
        const o = overlap(boxes[i], s);
        worstOverlap = Math.max(worstOverlap, o);
        assert.ok(o < 0.03, `${label}: piece ${boxes[i].piece} (${plan.pieces[boxes[i].piece].kind}) starts ${o.toFixed(3)} m inside a stub`);
      }
    }
    // the caps: finite quads in their slots
    for (const p of plan.pieces) for (const q of capPiece(plan, p)) for (const c of q.corners) for (const v of c) finite(v, `${label} cap`);
    for (const q of capStubs(plan)) for (const c of q.corners) for (const v of c) finite(v, `${label} stub cap`);
    // the partition: every triangle's area lands somewhere, each piece's near its proxy
    if (parts && bx === 0 && bz === -1) {
      const soup = soupOf(parts);
      const tris = soup.length / 18;
      const out = partitionTriangles(plan, soup, tris, 6);
      cutTris += tris;
      const before = area(soup, 6);
      let after = 0;
      for (const [piece, list] of out) {
        after += area(list, 6);
        assert.ok(list.every(Number.isFinite), `${label}: piece ${piece}'s triangles finite`);
        if (piece < 0) continue; // the remnant (STATIC_PIECE) and what the collapse drops
        const p = plan.pieces[piece];
        // (a gable's proxy keeps inside its triangle, a roof part's inside its slab: their reach is the outline's)
        const slab = p.kind === 'roof' ? plan.roof.find((sl) => sl.pieces.includes(piece)) : null;
        const reach = slab ? Math.max(...slab.outline.map(([oe, of]) => Math.hypot(slab.p[0] + slab.e[0] * oe + slab.f[0] * of - p.center[0],
          slab.p[1] + slab.e[1] * oe + slab.f[1] * of - p.center[1], slab.p[2] + slab.e[2] * oe + slab.f[2] * of - p.center[2]))) + 0.8
          : (p.kind === 'gable' ? Math.hypot(p.boxes[0].half[0] / 0.62, 2 * Math.max(...p.boxes.map((b) => b.half[1] + Math.abs(b.center[1]))))
            : Math.max(...p.boxes.map((b) => Math.hypot(...b.center) + Math.hypot(...b.half)))) + 1.4;
        for (let i = 0; i < list.length; i += 18) {
          const cx = (list[i] + list[i + 6] + list[i + 12]) / 3, cy = (list[i + 1] + list[i + 7] + list[i + 13]) / 3, cz = (list[i + 2] + list[i + 8] + list[i + 14]) / 3;
          const dd = Math.hypot(cx - p.center[0], cy - p.center[1], cz - p.center[2]);
          assert.ok(dd < reach, `${label}: a triangle of piece ${piece} (${p.kind}) lies ${dd.toFixed(2)} m from its centre (reach ${reach.toFixed(2)})`);
        }
      }
      assert.ok(Math.abs(after - before) <= 1e-6 * Math.max(1, before) + 1e-6, `${label}: the partition keeps the area (${before.toFixed(4)} → ${after.toFixed(4)} m²)`);
      assert.ok(out.size >= Math.min(plan.pieces.length, 6), `${label}: the triangles reach the pieces (${out.size} lists)`);
    }
  }
}

// the pool: flat ground, the stubs as records; it comes down and lies still, the same twice
function settle(a, blow) {
  const plan = planCollapsePieces(a, blow);
  const pool = createDebrisPhysics({ capacity: 64 });
  const stubs = stubRecords(plan, a.placement);
  pool.bind({
    groundAt: () => 0,
    queryStatic: (minX, minZ, maxX, maxZ, out) => {
      out.length = 0;
      for (const r of stubs) if (!(r.max[0] < minX || r.min[0] > maxX || r.max[2] < minZ || r.min[2] > maxZ)) out.push(r);
      return out;
    },
    isSolid: () => true,
  });
  const handles = plan.pieces.map((p) => (p.shatterS === 0 ? -1 : pool.spawn(pieceShape(p), { ...pieceSpawn(p, a.placement), asleep: true }, p.releaseS)));
  assert.ok(handles.every((h, i) => h >= 0 || plan.pieces[i].shatterS === 0), 'every piece takes a handle (the burst wall none)');
  const pose = new Float64Array(7), vel = new Float64Array(6), imp = new Float64Array(6);
  const kicked = plan.pieces.map(() => false);
  let maxSpeed = 0, stillAt = -1;
  for (let step = 0; step < 60 * 12; step++) {
    pool.advance(1 / 60);
    // each piece's shove at its release, from where it stands (collapseBodies does the same)
    for (const p of plan.pieces) {
      if (p.shatterS > 0 && handles[p.index] >= 0 && (step + 1) / 60 >= p.shatterS) { pool.framePoseAt(handles[p.index], pose); pool.release(handles[p.index]); handles[p.index] = -1; const r = Math.hypot(...p.boxes[0].half) + 1; pool.world.wakeInBox(pose[0] - r, pose[1] - r, pose[2] - r, pose[0] + r, pose[1] + r, pose[2] + r); continue; }
      if (handles[p.index] < 0 || kicked[p.index] || (step + 1) / 60 < p.releaseS) continue;
      kicked[p.index] = true;
      pool.framePoseAt(handles[p.index], pose);
      if (pieceKick(p, a.placement, pose, imp)) pool.impulse(handles[p.index], imp[0], imp[1], imp[2], imp[3], imp[4], imp[5]);
    }
    // still: every body asleep, or (after 7 s, as collapseBodies bakes it) only creeping
    let all = true, slow = true;
    for (const h of handles) {
      if (h < 0) continue;
      pool.velocity(h, vel);
      const v = Math.hypot(vel[0], vel[1], vel[2]), w = Math.hypot(vel[3], vel[4], vel[5]);
      maxSpeed = Math.max(maxSpeed, v);
      if (!pool.asleep(h) || step / 60 < 1.5) all = false;
      if (v > 0.3 || w > 0.5) slow = false;
    }
    if (all || (slow && step / 60 > 7)) { stillAt = step / 60; break; }
  }
  const poses = handles.map((h) => { if (h < 0) return null; pool.framePoseAt(h, pose); return Array.from(pose); });
  return { plan, poses, maxSpeed, stillAt };
}
for (const { label, a } of anatomies.slice(0, 4)) {
  const blow = { cause: 'blast', dirX: 0, dirZ: -1, point: [0, 2, a.d / 2] };
  const one = settle(a, blow), two = settle(a, blow);
  assert.deepEqual(two.poses, one.poses, `${label}: the collapse lies the same twice`);
  assert.ok(one.stillAt > 0, `${label}: the collapse lies still within 12 s`);
  const top = a.roof?.ridgeY ?? a.h;
  assert.ok(one.maxSpeed < Math.sqrt(2 * 9.81 * top) + 4, `${label}: nothing flies faster than a fall from the roof (${one.maxSpeed.toFixed(1)} m/s)`);
  for (let i = 0; i < one.poses.length; i++) {
    if (one.plan.pieces[i].shatterS >= 0) continue; // a wall the failure reached burst (no body)
    const [x, y, z] = one.poses[i];
    assert.ok(y > -0.1, `${label}: piece ${i} lies on the ground, not under it (y ${y.toFixed(2)})`);
    assert.ok(Math.hypot(x - one.plan.cx, z - one.plan.cz) < Math.max(a.w, a.d) / 2 + 9, `${label}: piece ${i} lies by the building`);
  }
  // it came down: the roof and the upper walls lie low
  const high = one.plan.pieces.filter((p) => p.center[1] > 3 && p.shatterS < 0);
  const lowered = high.filter((p) => one.poses[p.index] && one.poses[p.index][1] < p.center[1] - 1.5);
  assert.ok(lowered.length >= Math.ceil(high.length * 0.7), `${label}: the upper pieces came down (${lowered.length}/${high.length})`);
  console.log(`  ${label}: ${one.plan.pieces.length} pieces lie still at ${one.stillAt.toFixed(2)} s, fastest ${one.maxSpeed.toFixed(1)} m/s, ${lowered.length}/${high.length} upper pieces down`);
}

console.log(`collapsePieces: ${planned} plans (${anatomies.length} buildings × 4 blows, ${pieceCount} pieces), worst start overlap ${worstOverlap.toFixed(3)} m, `
  + `${cutTris} triangles cut with their area kept; the pool brings each down and lays it the same twice PASS`);
