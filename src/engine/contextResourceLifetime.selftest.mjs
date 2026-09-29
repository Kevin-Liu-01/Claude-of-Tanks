import assert from 'node:assert/strict';
import { installContextResourceLifetime } from './contextResourceLifetime.ts';

const families = ['Buffer', 'Texture', 'Framebuffer', 'Renderbuffer', 'Program',
  'Shader', 'VertexArray', 'Query', 'Sampler', 'TransformFeedback', 'Sync'];
const canvas = new EventTarget();
const gl = {};
const errors = [], deleted = [];
let nativeGeneration = 0, failAllocation = false;
for (const family of families) {
  gl[family === 'Sync' ? 'fenceSync' : 'create' + family] = function (...args) {
    assert.equal(this, gl);
    if (failAllocation) return null;
    return { family, generation: nativeGeneration, args };
  };
  gl['delete' + family] = function (handle) {
    assert.equal(this, gl);
    if (!handle) return;
    if (handle.family !== family || handle.generation !== nativeGeneration) errors.push(1282);
    else deleted.push(handle);
  };
}
const originalCreate = gl.createTexture, originalDelete = gl.deleteTexture;
const guard = installContextResourceLifetime(gl, canvas);
const allocate = () => families.map(f => gl[f === 'Sync' ? 'fenceSync' : 'create' + f](42, 9));
const dispose = handles => handles.forEach((h, i) => gl['delete' + families[i]](h));
const old = allocate();
assert.deepEqual(old[0].args, [42, 9], 'creation forwards arguments');
const live = allocate();
dispose(live);
assert.equal(deleted.length, families.length, 'same-context disposal stays native');
// Model browser invalidation and Three retaining old disposal listeners.
nativeGeneration++;
canvas.dispatchEvent(new Event('webglcontextlost'));
dispose(old);
assert.deepEqual(errors, [], 'stale geometry, targets, programs and queries never reach native deletes');
assert.equal(deleted.length, families.length);
const restored = allocate();
dispose(restored);
assert.equal(deleted.length, families.length * 2, 'restored resources still release normally');
nativeGeneration++;
canvas.dispatchEvent(new Event('webglcontextlost'));
dispose(old); dispose(restored);
assert.deepEqual(errors, [], 'multiple restore generations retire correctly');
const current = gl.createBuffer();
gl.deleteTexture(current);
assert.deepEqual(errors, [1282], 'wrong-type current resource errors are not swallowed');
gl.deleteTexture({ family: 'Texture', generation: -1 });
assert.deepEqual(errors, [1282, 1282], 'unknown resources retain native error reporting');
gl.deleteTexture(null);
failAllocation = true;
assert.equal(gl.createBuffer(), null, 'context-lost/null allocations are not tracked');
guard.dispose();
assert.equal(gl.createTexture, originalCreate);
assert.equal(gl.deleteTexture, originalDelete);
console.log('contextResourceLifetime: live cleanup, two restored generations, all 11 GL resource families, and native error negative controls passed');
