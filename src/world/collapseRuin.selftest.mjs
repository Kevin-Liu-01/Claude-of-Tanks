// A collapse leaves a ruin, never a raft (destruction lane 2026-10-16; the owner ruled flat rafts out; the LOOKS r2
// sweep's anti-raft floors: the destroyed state's area-weighted 90th percentile height at least 25 % of the intact's,
// its plan at least 60 % of the intact's): world/collapseRuin.ts keepRuinStanding measures whatever a kit's collapse
// writes and adds only what the ruin lacks — the interior heaped, the corners standing, wall stubs and leaning roof
// slabs — in the building's own buckets; a kit that already stands leaves it untouched; the same seed writes the same
// ruin; the kit writes with a reserve kept free. The world seam runs every kit's collapse through it and hands every
// anatomy its intact form as drawn.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BoxGeometry } from 'three';
import { RUIN_HEIGHT_SHARE, RUIN_PLAN_SHARE, keepRuinStanding, lastRuinMeasure, measureIntactParts } from './collapseRuin.ts';

const slot = (bucket, share = 1) => ({ material: 'brick', bucket, tint: [0.6, 0.5, 0.4], thicknessM: 0.3, share });
const face = (name, ox, oz, ux, uz, outx, outz, width) => ({ name, origin: [ox, 0, oz], u: [ux, 0, uz], out: [outx, 0, outz],
  width, height: 3.2, section: 0, bucket: 'regionalStone', layers: [slot('regionalPlaster'), slot('regionalStone')], openings: [], members: [], masonry: null });
function house(w = 10, d = 8, h = 9) {
  const faces = [face('front', 0, d / 2, 1, 0, 0, 1, w), face('back', 0, -d / 2, -1, 0, 0, -1, w),
    face('right', w / 2, 0, 0, -1, 1, 0, d), face('left', -w / 2, 0, 0, 1, -1, 0, d)];
  return {
    structureIdx: 1, kit: 'test', seed: 99, massClass: 'house', placement: { x: 0, y: 0, z: 0, yaw: 0 }, w, d, h, plinth: null,
    storeys: [{ index: 0, y0: 0, y1: 3.2, jetty: [0, 0, 0, 0], framed: false, faces, floor: null },
      { index: 1, y0: 3.2, y1: 6.4, jetty: [0, 0, 0, 0], framed: false, faces, floor: null }],
    roof: { kind: 'gable', section: 9, pitchDeg: 40, eaveY: 6.4, ridgeY: h, thicknessM: 0.1, covering: slot('roof'), structure: slot('wood'),
      battenPitchM: 0.3, rafterPitchM: 0.6, slabs: [] },
    chimneys: [], interior: { color: [0.02, 0.02, 0.02], open: false },
    rubble: [slot('regionalStone', 0.7), slot('roof', 0.3)], remnant: { stubHeightM: 1, corners: true, chimneys: false },
  };
}
/** A writer that keeps every triangle (body frame), as the stage runner would draw it. */
function recorder(capacity = 24000) {
  const tris = [], runs = [];
  let cur = null, verts = 0;
  return {
    tris, runs,
    get vertices() { return verts; }, capacity,
    begin(bucket, role) { cur = { bucket, role, pos: [] }; runs.push(cur); return verts < capacity; },
    vertex(px, py, pz) { cur.pos.push(px, py, pz); verts++; return cur.pos.length / 3 - 1; },
    triangle(a, b, c) { for (const k of [a, b, c]) tris.push(cur.pos[k * 3], cur.pos[k * 3 + 1], cur.pos[k * 3 + 2]); },
    end() { cur = null; },
  };
}
const pieces = { capacity: 1024, count: 0, push() { return true; } };
/** The sweep's measure on a triangle soup: the area-weighted p90 of centroid heights, and plan cells. */
function measure(P, cell, halfW, halfD) {
  const heights = []; const cells = new Set();
  for (let o = 0; o + 8 < P.length; o += 9) {
    const ux = P[o + 3] - P[o], uy = P[o + 4] - P[o + 1], uz = P[o + 5] - P[o + 2], vx = P[o + 6] - P[o], vy = P[o + 7] - P[o + 1], vz = P[o + 8] - P[o + 2];
    heights.push([(P[o + 1] + P[o + 4] + P[o + 7]) / 3, 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx)]);
    for (let s = 0; s <= 8; s++) for (let t = 0; t <= 8 - s; t++) {
      const a = s / 8, b = t / 8, x = P[o] + ux * a + vx * b, z = P[o + 2] + uz * a + vz * b;
      if (Math.abs(x) <= halfW && Math.abs(z) <= halfD) cells.add(`${Math.floor(x / cell)},${Math.floor(z / cell)}`);
    }
  }
  heights.sort((p, q) => p[0] - q[0]);
  const total = heights.reduce((n, h) => n + h[1], 0);
  let acc = 0, p90 = 0;
  for (const [y, a] of heights) { acc += a; p90 = y; if (acc >= 0.9 * total) break; }
  return { p90, plan: cells.size / (Math.ceil((2 * halfW) / cell) * Math.ceil((2 * halfD) / cell)) };
}
/** A raft: a few thin slabs at the floor over a third of the plan (what the sweep failed). */
function raftKit(anatomy, out) {
  const m = out.mesh;
  m.begin('regionalStone', 'rubble');
  for (let k = 0; k < 6; k++) {
    const x = -anatomy.w / 4 + (k % 3) * 1.5, z = -anatomy.d / 4 + Math.floor(k / 3) * 1.5;
    const a = m.vertex(x, 0.15, z, 0, 1, 0, 0, 0, 1, 1, 1), b = m.vertex(x + 1.4, 0.15, z, 0, 1, 0, 0, 0, 1, 1, 1);
    const c = m.vertex(x + 1.4, 0.15, z + 1.4, 0, 1, 0, 0, 0, 1, 1, 1), d = m.vertex(x, 0.15, z + 1.4, 0, 1, 0, 0, 0, 1, 1, 1);
    m.triangle(a, c, b); m.triangle(a, d, c);
  }
  m.end();
  return { cuts: [], hides: [{ section: null, partClass: null }] };
}

// ---- the intact form, measured from its parts
const anatomy = house();
const box = new BoxGeometry(10, 9, 8).translate(0, 4.5, 0);
const intact = measureIntactParts({ regionalStone: [box] });
assert.ok(intact && Math.abs(intact.topM - 9) < 1e-6 && Math.abs(intact.maxX - 5) < 1e-6 && Math.abs(intact.minZ + 4) < 1e-6, 'its top and plan');
assert.ok(intact.p90M > 7 && intact.p90M <= 9, `its area-weighted p90 height (${intact.p90M.toFixed(2)} m)`);
anatomy.intact = intact;

// ---- a raft becomes a ruin
{
  const writer = recorder();
  const result = keepRuinStanding(anatomy, 1234, { mesh: writer, pieces }, (w) => raftKit(anatomy, w));
  assert.deepEqual(result.hides, [{ section: null, partClass: null }], 'the kit\'s own result comes back');
  const { p90, plan } = measure(writer.tris, 0.25, 5, 4);
  assert.ok(p90 >= 0.25 * intact.p90M, `the ruin stands at ${(p90 / intact.p90M).toFixed(2)} of the intact's p90 (floor 0.25)`);
  assert.ok(plan >= 0.6, `the ruin covers ${plan.toFixed(2)} of the plan (floor 0.60)`);
  const self = lastRuinMeasure();
  assert.ok(self.heightP90 >= RUIN_HEIGHT_SHARE * intact.p90M * 0.95 && self.planShare >= RUIN_PLAN_SHARE * 0.95, 'its own measure agrees');
  assert.ok(writer.runs.some((r) => r.role === 'remnant' && r.bucket === 'regionalStone'), 'standing remains in the wall\'s structural layer');
  assert.ok(writer.runs.some((r) => r.role === 'rubble' && r.bucket === 'regionalStone'), 'the interior heaped in the pile\'s bucket');
  assert.ok(writer.tris.every((v, i) => i % 3 !== 1 || (v >= -0.61 && v <= intact.topM + 0.01)), 'nothing deeper than a foot under the floor, nothing past the top');
  // the same seed writes the same ruin; another writes another
  const again = recorder();
  keepRuinStanding(anatomy, 1234, { mesh: again, pieces }, (w) => raftKit(anatomy, w));
  assert.deepEqual(again.tris, writer.tris, 'deterministic in its seed');
  const other = recorder();
  keepRuinStanding(anatomy, 4321, { mesh: other, pieces }, (w) => raftKit(anatomy, w));
  assert.notDeepEqual(other.tris, writer.tris, 'another seed, another ruin');
}

// ---- a kit that already stands is left as it wrote it
{
  const writer = recorder();
  keepRuinStanding(anatomy, 7, { mesh: writer, pieces }, (w) => {
    const m = w.mesh;
    m.begin('regionalStone', 'remnant');
    // walls to 5 m round the plan, and a floor
    const quad = (ax, az, bx, bz, y0, y1) => {
      const a = m.vertex(ax, y0, az, 0, 0, 1, 0, 0, 1, 1, 1), b = m.vertex(bx, y0, bz, 0, 0, 1, 0, 0, 1, 1, 1);
      const c = m.vertex(bx, y1, bz, 0, 0, 1, 0, 0, 1, 1, 1), d = m.vertex(ax, y1, az, 0, 0, 1, 0, 0, 1, 1, 1);
      m.triangle(a, b, c); m.triangle(a, c, d);
    };
    for (let k = 0; k < 10; k++) { quad(-5 + k, 4, -4 + k, 4, 0, 5); quad(-5 + k, -4, -4 + k, -4, 0, 5); }
    for (let k = 0; k < 8; k++) { quad(5, -4 + k, 5, -3 + k, 0, 5); quad(-5, -4 + k, -5, -3 + k, 0, 5); }
    for (let i = 0; i < 10; i++) for (let k = 0; k < 8; k++) {
      const a = m.vertex(-5 + i, 0.4, -4 + k, 0, 1, 0, 0, 0, 1, 1, 1), b = m.vertex(-4 + i, 0.4, -4 + k, 0, 1, 0, 0, 0, 1, 1, 1);
      const c = m.vertex(-4 + i, 0.4, -3 + k, 0, 1, 0, 0, 0, 1, 1, 1), d = m.vertex(-5 + i, 0.4, -3 + k, 0, 1, 0, 0, 0, 1, 1, 1);
      m.triangle(a, c, b); m.triangle(a, d, c);
    }
    m.end();
    return { cuts: [], hides: [] };
  });
  assert.equal(writer.runs.length, 1, 'nothing added to a ruin that stands and covers its plan');
}

// ---- the kit writes with the ruin's reserve kept free
{
  const writer = recorder(6000);
  let seen = 0;
  keepRuinStanding(anatomy, 3, { mesh: writer, pieces }, (w) => { seen = w.mesh.capacity; return raftKit(anatomy, w); });
  assert.equal(seen, 6000 - 200 * 24, 'the kit sees the capacity less the reserve');
  assert.ok(writer.vertices <= 6000, 'and the ruin stays inside the real one');
}

// ---- the seam: every kit's collapse through it, every anatomy its intact form
{
  const seam = readFileSync(new URL('./structureDamageSeam.ts', import.meta.url), 'utf8');
  assert.match(seam, /collapse: \(seed, out\) => keepRuinStanding\(anatomy, seed, out,/, 'every kit\'s collapse keeps its ruin');
  assert.match(seam, /const intact = measureIntactParts\(args\.parts\);/, 'the intact form measured at describe');
}

console.log('collapseRuin selftest: PASS — a raft becomes a ruin (height and plan over the floors), a standing ruin is left alone, seeded, the reserve kept');
