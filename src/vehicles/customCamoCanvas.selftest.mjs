import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { paintCustomCamoStrokes } from './customCamoCanvas.ts';

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

function operationDigest(context) {
  return createHash('sha256').update(JSON.stringify(context.operations)).digest('hex');
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
assert.equal(operationDigest(first), '6ed4f52ebfda843c0ead8afdcdce7e9f2fea4f14b56e440546d372a5eb3185cb',
  'brush output remains pixel-contract stable');

const limits = createRecordingContext();
paintCustomCamoStrokes(limits, [
  { brush: 'spray', size: 100, points: [[33, 67]] },
  { brush: 'spray', size: 15, points: [[20, 40]] },
  { brush: 'round', size: 0.1, points: [[1, 99]] },
], options);
assert.equal(operationDigest(limits), '6e1a86e5199fb60be663cf16396a3d14fc098d68e7d1b28b1e9db49d60b1711c',
  'brush sizing clamps remain stable at both limits');

const empty = createRecordingContext();
paintCustomCamoStrokes(empty, null, options);
assert.deepEqual(empty.operations, [], 'null stroke collections are accepted as empty input');

console.log('customCamoCanvas.selftest: deterministic brush strategies and empty input pass');
