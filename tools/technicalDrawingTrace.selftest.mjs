// technicalDrawingTrace.selftest.mjs — the technical drawings' ID-buffer tracer (258): regions become closed loops with
// their holes, diagonal-only contacts stay apart, the simplified outline keeps its shape, the label point lies inside,
// and the path text round-trips. Copyright © 2026 Kevin B. Liu.
import assert from 'node:assert/strict';
import {
  cleanLoops, cutCorners, insideLoops, labelPoint, loopArea, loopsToPath, simplifyLoop, traceIdBuffer,
} from './technicalDrawingTrace.ts';

const grid = (rows) => {
  const height = rows.length, width = rows[0].length, ids = new Uint32Array(width * height);
  rows.forEach((row, y) => [...row].forEach((c, x) => { ids[y * width + x] = c === '.' ? 0 : c.charCodeAt(0) - 48; }));
  return { ids, width, height };
};

// a square with a hole, and a second region beside it
{
  const { ids, width, height } = grid([
    '..........',
    '.11111.22.',
    '.1...1.22.',
    '.1...1....',
    '.11111....',
    '..........',
  ]);
  const traced = traceIdBuffer(ids, width, height);
  const one = traced.get(1), two = traced.get(2);
  assert.equal(one.length, 2, 'the ring is an outer loop and a hole');
  const outer = one.find((l) => l.area > 0), hole = one.find((l) => l.area < 0);
  assert.equal(outer.area, 20, 'outer loop area (5x4 cells)');
  assert.equal(hole.area, -6, 'the hole (3x2 cells), counter-clockwise');
  assert.equal(outer.area + hole.area, 14, 'the region\'s pixel count');
  assert.equal(two.length, 1);
  assert.equal(two[0].area, 4);
  assert.deepEqual(two[0].points, [7, 1, 9, 1, 9, 3, 7, 3], 'corners only, clockwise from the top-left');
  assert.ok(insideLoops(one.map((l) => l.points), 1.5, 1.5) && !insideLoops(one.map((l) => l.points), 3, 2.5), 'even-odd: ring in, hole out');
}

// two pixels of one ID touching only at a corner are two regions
{
  const { ids, width, height } = grid(['1.', '.1']);
  const loops = traceIdBuffer(ids, width, height).get(1);
  assert.equal(loops.length, 2, 'diagonal contact keeps 4-connected regions apart');
  assert.ok(loops.every((l) => l.area === 1));
}

// a staircase becomes its diagonal; simplification keeps the shape within tolerance
{
  const rows = [];
  for (let y = 0; y < 40; y++) rows.push('.'.repeat(1) + '1'.repeat(Math.max(1, 40 - y)) + '.'.repeat(Math.min(40, y) + 1));
  const { ids, width, height } = grid(rows);
  const [loop] = traceIdBuffer(ids, width, height).get(1);
  const cut = cutCorners(loop.points);
  const simple = simplifyLoop(cut, 0.75);
  assert.ok(simple.length / 2 <= 6, `a triangle's staircase simplifies to a few points (${simple.length / 2})`);
  assert.ok(Math.abs(loopArea(simple) - loop.area) / loop.area < 0.05, 'the area survives within 5 %');
  const [cleaned] = cleanLoops([loop], 0.75, 4);
  assert.deepEqual(cleaned, simple);
  const point = labelPoint([simple]);
  assert.ok(point && insideLoops([simple], point[0], point[1]), 'the label point lies inside');
}

// a C shape: its centroid falls in the gap, so the label point moves into the widest span
{
  const { ids, width, height } = grid([
    '1111111111',
    '1111111111',
    '11........',
    '11........',
    '1111111111',
    '1111111111',
  ]);
  const loops = traceIdBuffer(ids, width, height).get(1).map((l) => l.points);
  const point = labelPoint(loops);
  assert.ok(point && insideLoops(loops, point[0], point[1]), `the C's label point lies inside (${point})`);
}

// specks drop; path text
{
  const { ids, width, height } = grid(['1....', '.....', '..22.', '..22.']);
  const traced = traceIdBuffer(ids, width, height);
  assert.deepEqual(cleanLoops(traced.get(1), 0.5, 2), [], 'a one-pixel speck drops under minArea 2');
  assert.equal(loopsToPath([[0, 0, 2, 0, 2, 2]], 0.5), 'M0 0L1 0L1 1Z');
  assert.equal(loopsToPath([[0.25, 1, 3.125, 1, 3, 2]], 1, 1), 'M0.3 1L3.1 1L3 2Z');
}

console.log('technicalDrawingTrace.selftest: loops with holes, 4-connected regions, corner cuts and simplification, inside label points, path text PASS');
