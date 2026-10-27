import assert from 'node:assert/strict';
import { programKeyDiff, programLabel, programReceipt } from './programReceipt.ts';

// labels: the material's type and name, either alone, '?' with neither
assert.equal(programLabel({ type: 'MeshDepthMaterial', name: '' }), 'MeshDepthMaterial');
assert.equal(programLabel({ type: 'MeshStandardMaterial', name: 'props-field-walls' }), 'MeshStandardMaterial:props-field-walls');
assert.equal(programLabel({}), '?');

// key diffs: against the nearest warmed program of the same type and key length; a long field (an onBeforeCompile
// source) from its first differing character
const warmed = [
  { type: 'MeshDepthMaterial', cacheKey: 'depth,highp,uv,7,false' },
  { type: 'MeshDepthMaterial', cacheKey: 'depth,highp,false,6,true' },
  { type: 'MeshStandardMaterial', cacheKey: `physical,${'x'.repeat(40)}#undef A\nmain`},
];
assert.equal(programKeyDiff({ type: 'MeshDepthMaterial', cacheKey: 'depth,highp,uv,8,false' }, warmed), '3:8/7');
assert.equal(programKeyDiff({ type: 'MeshStandardMaterial', cacheKey: `physical,${'x'.repeat(40)}#undef B\nmain` }, warmed),
  '1@47:B\nmain/A\nmain');
assert.equal(programKeyDiff({ type: 'ShaderMaterial', cacheKey: 'a,b' }, warmed), 'new');
assert.equal(programKeyDiff({ type: 'MeshDepthMaterial', cacheKey: 'depth,highp' }, warmed), 'new', 'another key length is not a twin');

// the receipt: the live programs the baseline does not hold, the first eight named, keyed and traced
const baseline = new Set(warmed);
const made = { type: 'MeshDepthMaterial', name: '', cacheKey: 'depth,highp,uv,8,false' };
const live = [...warmed, made];
assert.deepEqual(programReceipt(live, baseline, 3, { origins: ['MeshDepthMaterial<wheels<hull'] }),
  { made: 1, frames: 3, names: ['MeshDepthMaterial'], diffs: ['3:8/7'], origins: ['MeshDepthMaterial<wheels<hull'] });
assert.deepEqual(programReceipt(warmed.slice(1), baseline, 0, null), { made: 0, frames: 0, names: [], diffs: [] },
  'a released program is not counted, and no watch leaves no origins');
const many = Array.from({ length: 10 }, (_, i) => ({ type: 'ShaderMaterial', name: `m${i}` }));
const receipt = programReceipt(many, baseline, 1, null);
assert.equal(receipt.made, 10);
assert.equal(receipt.names.length, 8, 'eight named at most');

console.log('programReceipt.selftest: programs linked past the warm are counted, named, keyed against the nearest warmed twin (long fields from their first difference) and traced');
