import assert from 'node:assert/strict';
import { CUSTOM_CAMO_BRUSHES, paintCustomCamoStrokes } from './customCamoCanvas.ts';

function createRecordingContext() {
  const operations = [];
  const context = { operations };
  for (const method of [
    'save', 'restore', 'translate', 'rotate', 'scale', 'beginPath', 'moveTo',
    'lineTo', 'bezierCurveTo', 'rect', 'closePath', 'fill', 'fillRect', 'arc',
    'stroke',
  ]) {
    context[method] = (...args) => operations.push([method, ...args]);
  }
  for (const property of [
    'strokeStyle', 'fillStyle', 'lineWidth', 'lineJoin', 'lineCap',
  ]) {
    Object.defineProperty(context, property, {
      set(value) { operations.push([property, value]); },
    });
  }
  return context;
}

// 2026-10-01 (owner: retire frozen pins): the two pinned sha256 digests of the recorded operation streams
// are gone (texture canvases sit outside the fleet geometry ledger). Live contracts: determinism, brush and
// fallback routing, and the size clamps.
function paintOne(stroke) {
  const context = createRecordingContext();
  paintCustomCamoStrokes(context, [stroke], options);
  return context.operations;
}

const options = {
  width: 200,
  height: 100,
  colorA: '#102030',
  colorB: '#405060',
  eraseColor: '#708090',
};

const strokes = [
  { brush: 'round', color: 1, size: 10, points: [[10, 20], [30, 40]] },
  { brush: 'flat', points: [[50, 50]] },
  { brush: 'eraser', points: [[60, 60]] },
  { brush: 'pixel', size: 12, points: [[20, 30], [40, 50]] },
  { brush: 'spray', size: 4, points: [[25, 35], [45, 55]] },
  ...['chevron', 'leaf', 'hex', 'cross', 'star'].map((asset, index) => ({
    brush: 'stamp', asset, rotation: index * 15, points: [[70, 20 + index * 5]],
  })),
  { brush: 'stamp', asset: 'invalid', points: [[80, 80]] },
  { brush: 'invalid', points: [[5, 5], [6, 6]] },
  { brush: 'round', points: [] },
  { brush: 'round' },
];

const first = createRecordingContext();
paintCustomCamoStrokes(first, strokes, options);
const second = createRecordingContext();
paintCustomCamoStrokes(second, strokes, options);

assert.deepEqual(second.operations, first.operations, 'all custom camouflage brushes are deterministic');
assert(first.operations.some(([operation]) => operation === 'stroke'), 'path brushes stroke connected points');
assert(first.operations.some(([operation]) => operation === 'fillRect'), 'flat and pixel brushes fill rectangles');
assert(first.operations.some(([operation]) => operation === 'arc'), 'round and spray brushes emit circles');
assert(first.operations.some(([operation]) => operation === 'bezierCurveTo'), 'leaf stamp emits its curved outline');
assert(first.operations.some(([operation, value]) => operation === 'fillStyle' && value === options.eraseColor),
  'eraser brush uses the configured erase color');
assert.deepEqual(paintOne({ brush: 'stamp', asset: 'invalid', points: [[80, 80]] }),
  paintOne({ brush: 'stamp', asset: 'star', points: [[80, 80]] }), 'unknown stamp assets fall back to the star');
assert.deepEqual(paintOne({ brush: 'invalid', points: [[5, 5], [6, 6]] }),
  paintOne({ brush: CUSTOM_CAMO_BRUSHES[0], points: [[5, 5], [6, 6]] }), 'unknown brushes fall back to the first brush');

const limits = createRecordingContext();
paintCustomCamoStrokes(limits, [
  { brush: 'spray', size: 100, points: [[33, 67]] },
  { brush: 'spray', size: 15, points: [[20, 40]] },
  { brush: 'round', size: 0.1, points: [[1, 99]] },
], options);
const perStroke = [];
for (const operation of limits.operations) {
  if (operation[0] === 'save') perStroke.push([]);
  perStroke.at(-1).push(operation);
}
assert.equal(perStroke.length, 3, 'one painter state per stroke');
const arcs = operations => operations.filter(([operation]) => operation === 'arc');
assert.equal(arcs(perStroke[0]).length, 24, 'a full-size spray caps its dot count');
assert.ok(arcs(perStroke[1]).length >= 7, 'a small spray keeps at least its minimum dot count');
for (const operations of perStroke.slice(0, 2)) {
  for (const [, , , radius] of arcs(operations)) assert.ok(radius >= .65, 'spray dots keep their minimum radius');
}
assert.deepEqual(perStroke[2].find(([operation]) => operation === 'lineWidth'), ['lineWidth', 1],
  'a sub-pixel brush clamps to one pixel');

const empty = createRecordingContext();
paintCustomCamoStrokes(empty, null, options);
assert.deepEqual(empty.operations, [], 'null stroke collections are accepted as empty input');

console.log('customCamoCanvas.selftest: deterministic brush strategies, fallbacks, size clamps and empty input pass');
