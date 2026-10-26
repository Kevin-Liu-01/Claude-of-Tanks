// (battle-spikes-253) collision.ts createFootprintPointIndex answers as the scan it replaces —
// records.some((q) => !q.dead && collisionFootprintContainsPoint(q, x, z, margin)) — over seeded records of every kind: circles,
// obbs, convex rings either way round (sharp corners whose mitre reaches far past the margin among them), needles, reflex and
// degenerate rings, compounds, box-only records and dead ones; at points near and on their edges, margins up to the bound and
// past it. Suzhou Creek's station forecourt fit (shanghaiStreets.ts dressNorthStation) reads it.
import assert from 'node:assert/strict';
import { collisionFootprintContainsPoint, createFootprintPointIndex } from './collision.ts';

let seed = 0x5eed253;
const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32; };
const between = (a, b) => a + (b - a) * rand();

function ring(cx, cz, kind) {
  const n = kind === 'needle' ? 3 : 3 + Math.floor(rand() * 6);
  const r = between(0.5, 12);
  const points = [];
  for (let i = 0; i < n; i++) {
    let a = (i / n) * Math.PI * 2 + between(-0.2, 0.2);
    if (kind === 'needle' && i === 1) a = 0.002; // two vertices a hair apart in angle: a sliver
    if (kind === 'sharp' && i === 1) a = Math.PI * 0.08;
    const rr = kind === 'reflex' && i % 2 ? r * 0.3 : r;
    points.push(cx + Math.cos(a) * rr, cz + Math.sin(a) * rr);
  }
  if (kind === 'degenerate') for (let i = 0; i < points.length; i += 2) points[i + 1] = cz; // all on one line
  if (rand() < 0.5) { // either way round
    const flipped = [];
    for (let i = points.length - 2; i >= 0; i -= 2) flipped.push(points[i], points[i + 1]);
    return flipped;
  }
  return points;
}

function part(cx, cz) {
  const t = rand();
  if (t < 0.2) return { kind: 'circle', cx, cz, r: between(0.2, 6) };
  if (t < 0.4) return { kind: 'obb', cx, cz, hw: between(0.2, 10), hl: between(0.2, 10), yaw: between(-Math.PI, Math.PI) };
  const kind = ['convex', 'convex', 'sharp', 'needle', 'reflex', 'degenerate'][Math.floor(rand() * 6)];
  return { kind: 'convex', cx, cz, points: ring(cx, cz, kind) };
}

const records = [];
for (let i = 0; i < 600; i++) {
  const cx = between(-120, 120), cz = between(-120, 120);
  const record = { min: [cx - 3, 0, cz - 3], max: [cx + 3, 4, cz + 3], kind: 'structure' };
  const t = rand();
  if (t < 0.15) { /* a box only */ }
  else if (t < 0.35) record.shape2 = { kind: 'compound', cx, cz, parts: Array.from({ length: 1 + Math.floor(rand() * 4) }, () => part(cx + between(-8, 8), cz + between(-8, 8))) };
  else record.shape2 = part(cx, cz);
  if (rand() < 0.05) record.dead = true;
  records.push(record);
}

const MAX = 1.6;
const holds = createFootprintPointIndex(records, MAX);
let checked = 0, inside = 0;
for (let i = 0; i < 60000; i++) {
  // near a record's middle or edge, anywhere, or on an 8 m cell line
  const q = records[Math.floor(rand() * records.length)];
  let x, z;
  const t = rand();
  if (t < 0.6) { x = (q.min[0] + q.max[0]) / 2 + between(-16, 16); z = (q.min[2] + q.max[2]) / 2 + between(-16, 16); }
  else if (t < 0.9) { x = between(-140, 140); z = between(-140, 140); }
  else { x = Math.round(between(-17, 17)) * 8; z = between(-140, 140); }
  const margin = [0, 0.4, 0.6, 1.6, between(0, MAX), 2.5][Math.floor(rand() * 6)];
  const expected = records.some((r) => !r.dead && collisionFootprintContainsPoint(r, x, z, margin));
  assert.equal(holds(x, z, margin), expected, `the index answers as the scan at (${x}, ${z}) margin ${margin}`);
  checked++; if (expected) inside++;
}
assert.ok(inside > 3000 && inside < checked - 3000, `both answers exercised (${inside} of ${checked} inside)`);

// a sharp corner's mitre: its reach at the margin is far past the margin (an index binning by box + margin would miss it)
const spike = { min: [0, 0, 0], max: [1, 1, 1], shape2: { kind: 'convex', cx: 0, cz: 0, points: [0, 0, 40, 0.5, 40, -0.5] } };
const spikeHolds = createFootprintPointIndex([spike], 1.6);
// (its sharp corner at the origin: the mitre's tip lies along -x, 1.6 / sin(half its angle) out — about 128 m)
const tip = [-(1.6 / Math.sin(Math.atan2(0.5, 40))) * 0.98, 0];
assert.equal(collisionFootprintContainsPoint(spike, tip[0], tip[1], 1.6), true, 'the spike\'s mitre reaches its tip at the margin');
assert.equal(spikeHolds(tip[0], tip[1], 1.6), true, 'and the index finds it there');
console.log(`footprintPointIndex.selftest: ${checked} points over ${records.length} records (circles, obbs, convex rings either way round, needles, reflex and degenerate rings, compounds, boxes, dead), margins to the bound and past it: the scan's answers (${inside} inside); a spike's mitre found`);
