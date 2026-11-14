import assert from 'node:assert/strict';
import { Vector3, BoxGeometry, Mesh, Matrix4, Group } from 'three';
import { recipeMatrix, bakeSourceGeometry, verifyDuplicateOptions } from './source-x-oracle.mjs';

const recipe = { id: 'probe_x', sourceSha256: '0'.repeat(64), scale: .1,
  axes: ['-z', 'y', 'x'], translation: [0, 1, -2] };
assert.deepEqual(new Vector3(30, 20, 10).applyMatrix4(recipeMatrix(recipe)).toArray(), [-1, 3, 1]);
assert.throws(() => recipeMatrix({ ...recipe, scale: [1, 2, 1] }), /uniform/);
assert.throws(() => recipeMatrix({ ...recipe, axes: ['x', 'y', '-z'] }), /handedness/);
assert.throws(() => recipeMatrix({ ...recipe, axes: ['x', 'x', 'z'] }), /permutation/);
assert.throws(() => recipeMatrix({ ...recipe, sourceSha256: '' }), /SHA/);
assert.throws(() => recipeMatrix({ ...recipe, translation: [0, Infinity, 0] }), /finite/);
assert.throws(() => recipeMatrix({ ...recipe, includeRoots: ['Body'] }), /selection reason/);
assert.throws(() => recipeMatrix({ ...recipe, exactDuplicateMeshes: ['Body'] }), /selection reason/);
assert.throws(() => recipeMatrix({ ...recipe, includeRoots: ['Body'], exactDuplicateMeshes: ['Copy'], selectionReason: 'two sources' }), /Cannot combine/);
assert.throws(() => recipeMatrix({ ...recipe, id: '../escape_x' }), /stable/);
for (const indexed of [true, false]) {
  const original = new BoxGeometry(2, 2, 2);
  const input = indexed ? original : original.toNonIndexed();
  const object = new Mesh(input);
  object.scale.x = -1;
  object.updateMatrixWorld(true);
  const baked = bakeSourceGeometry(object, new Matrix4());
  const p = baked.attributes.position, n = baked.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    assert.ok(new Vector3().fromBufferAttribute(p, i).dot(new Vector3().fromBufferAttribute(n, i)) > 0,
      'Reflected source box must keep outward normals after identity export');
  }
  baked.dispose(); input.dispose(); original.dispose(); object.material.dispose();
}
const scene=new Group(),a=new Mesh(new BoxGeometry()),b=a.clone();a.name='retained';b.name='option';scene.add(a,b);
verifyDuplicateOptions(scene,['option']);
assert.throws(()=>verifyDuplicateOptions(scene,['missing']),/names/);
assert.throws(()=>verifyDuplicateOptions(scene,['option','option']),/names/);
b.position.x=.01;
assert.throws(()=>verifyDuplicateOptions(scene,['option']),/Unmatched source triangle/);
a.geometry.dispose();a.material.dispose();
console.log('source-x-oracle: hash-pinned, proper-rotation/uniform-only registration and world-space duplicate proof passed');
