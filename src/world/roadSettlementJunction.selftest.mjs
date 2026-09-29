import assert from 'node:assert/strict';
import { roadSettlementJunction } from './roadSettlementJunction.ts';
const center = { x: 7, z: 11 };
assert.deepEqual(roadSettlementJunction([[[-100, 20], [100, 20]], [[30, -100], [30, 100]]], center),
  { x: 30, z: 20 }, 'the plaza locates a segment crossing far from every authored vertex');
assert.deepEqual(roadSettlementJunction([[[-100, 20], [100, 20]], [[30, -100], [30, 20]], [[-40, -100], [-40, 100]]], center),
  { x: 30, z: 20 }, 'a T-junction endpoint is eligible and the nearest junction wins');
assert.deepEqual(roadSettlementJunction([[[-100, 20], [0, 20], [100, 20]], [[30, -100], [30, 0], [30, 100]]], center),
  { x: 30, z: 20 }, 'resampling a road cannot move its square');
assert.deepEqual(roadSettlementJunction([[[0, 0], [100, 0]], [[0, 10], [100, 10]]], center), center,
  'nearby parallel roads are not a fake junction');
assert.deepEqual(roadSettlementJunction([[[0, 0], [10, 0]], [[20, -5], [20, 5]]], center), center,
  'line extensions outside the segment do not make a junction');
assert.deepEqual(roadSettlementJunction([[[0, 0], [0, 0]], [[0, -5], [0, 5]]], center), center,
  'zero-length roads do not produce NaN intersections');
console.log('road settlement junction: crossing, T-junction, tessellation and non-crossing cases passed');
