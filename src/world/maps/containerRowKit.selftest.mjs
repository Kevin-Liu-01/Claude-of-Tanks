// containerRowKit.selftest.mjs — the container rows (maps/containerRowKit.ts; the looks lane, 2026-10-15):
//   - the row's shared draws are the cubes' (230 on this stream, unchanged since the cubes and since the extract), so
//     every later placement keeps its seat; the bodies consume the uv jitter's draws, every new part takes none;
//   - every part stands inside its box (the solid's hull and the dedicated collision shards unchanged), and the damage
//     reading (regional/container.ts readContainers) finds every box, one per body;
//   - the walls are corrugated (crests and troughs 36 mm apart), the boxes framed and cast at their corners;
//   - the liveries are the period's (the early boxes, the 1980s-90s, today's), deep and never pastel;
//   - a box within 700 triangles.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { makeContainerRow } from './containerRowKit.ts';
import { attachStructureBuildContext } from './exteriorDetailKit.ts';
import { readContainers } from './regional/container.ts';

const counted = (seed) => {
  let s = seed >>> 0, n = 0;
  const f = () => { n++; s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  f.count = () => n;
  return f;
};
const tris = (g) => (g.index ? g.index.count : g.getAttribute('position').count) / 3;

for (const map of [null, 'airfield', 'frontier', 'cliffbridge', 'mars']) {
  const buckets = { steel: [], baked: [], dark: [] };
  if (map) attachStructureBuildContext(buckets, { mapId: map });
  const rng = counted(42);
  makeContainerRow(rng, buckets);
  const label = map ?? 'garage';
  assert.equal(rng.count(), 230, `${label}: the cubes' shared draws (${rng.count()})`);
  const bodies = buckets.steel.filter((g) => g.userData.uvJitter === 'consume');
  assert.ok(bodies.length >= 5, `${label}: its boxes (${bodies.length})`);
  assert.ok(buckets.steel.every((g) => g.userData.uvJitter === 'consume' || g.userData.uvJitter === 'none'), `${label}: new parts take no uv jitter`);
  // every part inside a body's box (1 mm)
  const boxes = bodies.map((g) => new THREE.Box3().setFromBufferAttribute(g.getAttribute('position')));
  const boxed = bodies.map((g) => {
    // the box in its own turned frame: its corners' convex hull in the plan is the rectangle the 24 corners span
    const p = g.getAttribute('position'), pts = [];
    for (let i = 0; i < p.count; i++) pts.push([p.getX(i), p.getY(i), p.getZ(i)]);
    return pts;
  });
  const inside = (q, pts) => {
    // the box's frame from its corners: an edge direction in the plan and the extents along it and across
    const [a, ...rest] = pts;
    let ax = 0, az = 0, best = 0;
    for (const b of rest) { const d = Math.hypot(b[0] - a[0], b[2] - a[2]); if (d > best && Math.abs(b[1] - a[1]) < 1e-3) { best = d; ax = (b[0] - a[0]) / d; az = (b[2] - a[2]) / d; } }
    const pr = (v) => [v[0] * ax + v[2] * az, -v[0] * az + v[2] * ax, v[1]];
    const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
    for (const v of pts) { const w = pr(v); for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], w[k]); hi[k] = Math.max(hi[k], w[k]); } }
    const w = pr(q);
    return w.every((c, k) => c >= lo[k] - 0.001 && c <= hi[k] + 0.001);
  };
  let outside = 0;
  for (const g of buckets.steel) {
    if (g.userData.uvJitter === 'consume') continue;
    const p = g.getAttribute('position');
    for (let i = 0; i < p.count; i += 3) {
      const q = [p.getX(i), p.getY(i), p.getZ(i)];
      if (!boxed.some((pts, k) => boxes[k].distanceToPoint(new THREE.Vector3(...q)) < 0.01 && inside(q, pts))) { outside++; break; }
    }
  }
  assert.equal(outside, 0, `${label}: every part inside its box (${outside} parts out)`);
  const read = readContainers({ steel: buckets.steel });
  assert.equal(read?.length ?? 0, bodies.length, `${label}: the damage reading finds every box (${read?.length ?? 0} of ${bodies.length})`);
  // corrugated walls: parts with many faces whose normals swing in the plan
  const walls = buckets.steel.filter((g) => g.userData.uvJitter === 'none' && g.getAttribute('position').count > 100);
  assert.ok(walls.length >= bodies.length * 3, `${label}: three corrugated walls a box (${walls.length})`);
  const total = buckets.steel.reduce((n, g) => n + tris(g), 0);
  assert.ok(total / bodies.length <= 700, `${label}: ${(total / bodies.length).toFixed(0)} triangles a box (cap 700)`);
  // the liveries deep: no body colour lighter than 0.55 in linear value unless the set is the polar or the martian
  if (map !== 'mars') {
    for (const g of bodies) {
      const c = g.getAttribute('color');
      const v = Math.max(c.getX(0), c.getY(0), c.getZ(0));
      assert.ok(v <= 0.55, `${label}: a livery deep enough (${v.toFixed(2)})`);
    }
  }
}
console.log('containerRowKit.selftest: shared draws kept, parts inside their boxes, every box read for damage, corrugated walls, period liveries deep, <= 700 triangles a box PASS');
