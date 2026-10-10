// Receipt for the props build's near-mesh vertex memo (props.ts nearMeshVertexHeight, the time-to-battle lane,
// 2026-10-08): the rock beds, the ground contact patches and the wall turf conform to the near terrain mesh
// (terrain.ts terrainNearMeshHeightAt), whose vertices they asked of the field 182 k times on Verdant, 174 k of them
// again. The memo answers a vertex the field already gave, by its exact coordinates: the same value (Object.is), each
// vertex asked once, zero coordinates passed straight through (-0 and +0 are one key), and nothing kept after the build.
// The production memo is evaluated from props.ts's own source.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { terrainNearMeshHeightAt } from './terrain.ts';

const source = readFileSync(new URL('./props.ts', import.meta.url), 'utf8');
const start = source.indexOf('  let nearMeshVertexHeights');
const end = source.indexOf('\n  };\n', start);
assert.ok(start > 0 && end > start, 'the memo lives in the props build');
const memoSource = stripTypeScriptTypes(source.slice(start, end + 5));
const makeMemo = new Function('heightField', `${memoSource}\nreturn { at: nearMeshVertexHeight, release() { nearMeshVertexHeights = null; } };`);

// a field whose heights tell the sign of zero (as an atan2 on an axis would): the memo must not merge -0 and +0
const asked = new Map();
const field = {
  calls: 0,
  getHeightAt(x, z) {
    this.calls++;
    const key = `${Object.is(x, -0) ? '-0' : x},${Object.is(z, -0) ? '-0' : z}`;
    asked.set(key, (asked.get(key) ?? 0) + 1);
    return Math.sin(x * 0.37) * 3 + Math.cos(z * 0.21) * 2 + (Object.is(x, -0) ? 0.5 : 0) + (Object.is(z, -0) ? 0.25 : 0);
  },
};
const memo = makeMemo(field);
let s = 7;
const rand = () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
const points = [];
for (let i = 0; i < 4000; i++) points.push([rand() * 60 - 30, rand() * 60 - 30]);
for (const p of points.slice(0, 500)) points.push(p);
for (const [x, z] of points) {
  const direct = terrainNearMeshHeightAt((px, pz) => field.getHeightAt(px, pz), x, z);
  const kept = terrainNearMeshHeightAt(memo.at, x, z);
  assert.ok(Object.is(direct, kept), `(${x}, ${z}): ${kept} is the field's ${direct}`);
}
// each vertex reached through the memo was asked of the field once (the direct path asks again every time); only a
// vertex on a zero coordinate (the grid line through the origin) is asked again
{
  const original = field.getHeightAt, further = [];
  field.getHeightAt = function (x, z) { further.push([x, z]); return original.call(this, x, z); };
  for (const [x, z] of points) terrainNearMeshHeightAt(memo.at, x, z);
  field.getHeightAt = original;
  assert.ok(further.length > 0, 'the grid line through the origin is crossed');
  assert.ok(further.every(([x, z]) => x === 0 || z === 0), 'every vertex off the zero lines already kept: no further field query');
}
// zero coordinates pass straight through, keeping the sign of zero
assert.ok(Object.is(memo.at(-0, 5), field.getHeightAt(-0, 5)) && Object.is(memo.at(0, 5), field.getHeightAt(0, 5)));
assert.notEqual(memo.at(-0, 5), memo.at(0, 5), 'a field that tells -0 from +0 is told both');
// released after the build: a later query asks the field
memo.release();
const before = field.calls;
memo.at(3, 4); memo.at(3, 4);
assert.equal(field.calls - before, 2, 'after the build every query asks the field');
// the build uses it at every near-mesh conform and releases it before it returns
assert.ok((source.match(/terrainNearMeshHeightAt\(nearMeshVertexHeight,/g) ?? []).length >= 3,
  'the rock beds, the contact patches and the wall turf conform through the memo');
const release = source.indexOf('  nearMeshVertexHeights = null;');
const finalReturn = source.indexOf('  return { group, obstacles, colliders, crushables');
assert.ok(release > 0 && release < finalReturn, 'released just before the build returns');
console.log(`nearMeshVertexMemo: ${points.length} conforms equal to the field's own (Object.is), each vertex asked once, -0/+0 kept apart, released after the build PASS`);
