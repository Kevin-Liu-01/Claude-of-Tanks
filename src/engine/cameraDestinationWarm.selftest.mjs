// cameraDestinationWarm.selftest — a camera hop's destination warm (2026-10-24, perf-245): what the destination's
// frustum holds is drawn offscreen a batch a frame, nearest first and bounded, each batch alone (every other renderable
// masked) and whatever any frustum holds (its culling off for that draw), the state restored after; an object detached
// since the destination was chosen is not drawn; a hop shorter than the minimum warms nothing; the terrain stream is
// aimed at the destination and released once the batches are drawn and the hop's time has passed. No GPU: the warmer
// seam records what each draw would draw.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CAMERA_DESTINATION_WARM, createCameraDestinationWarmer } from './cameraDestinationWarm.ts';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 16 / 9, 0.3, 4000);
camera.position.set(0, 10, 0);
camera.lookAt(0, 10, 100);
camera.updateMatrixWorld(true);
const geometry = new THREE.BoxGeometry(2, 2, 2);
const material = new THREE.MeshBasicMaterial();
const mesh = (x, z, name) => { const m = new THREE.Mesh(geometry, material); m.position.set(x, 1, z); m.name = name; scene.add(m); m.updateMatrixWorld(true); return m; };
// the destination: 400 m east, looking further east; a field of boxes there, some behind it, one near the camera
const ahead = Array.from({ length: 70 }, (_, i) => mesh(420 + (i % 10) * 6, -30 + Math.floor(i / 10) * 9, `ahead-${i}`));
const behind = Array.from({ length: 5 }, (_, i) => mesh(330 - i * 4, 0, `behind-${i}`));
const atCamera = mesh(0, 40, 'at-camera');
const always = mesh(-300, -300, 'uncull-anywhere');
always.frustumCulled = false;

let now = 0;
const focusLog = [];
const draws = [];
const warmer = createCameraDestinationWarmer({
  renderer: null, scene, camera, now: () => now,
  setTerrainStreamFocus: (p) => focusLog.push(p ? p.clone() : null),
  createWarmer: (destination) => Object.assign(() => {
    const drawn = [];
    scene.traverseVisible((o) => { if (o.isMesh && o.layers.test(destination.layers)) drawn.push(o); });
    draws.push({ drawn, uncull: drawn.every((o) => o.frustumCulled === false) });
  }, { dispose() {} }),
});

// a hop that stays near the camera warms nothing
warmer.prepare(new THREE.Vector3(10, 10, 10), new THREE.Vector3(10, 0, 60), 1);
assert.equal(warmer.pendingBatches, 0, 'a short hop is already in view');
assert.deepEqual(focusLog, []);

const dest = new THREE.Vector3(400, 12, 0), look = new THREE.Vector3(460, 2, 0);
warmer.prepare(dest, look, 1.5);
assert.equal(focusLog.length, 1);
assert.ok(focusLog[0].equals(dest), 'the terrain stream is aimed at the destination');
const expectedBatches = Math.ceil((ahead.length + 1) / CAMERA_DESTINATION_WARM.batchObjects);
assert.equal(warmer.pendingBatches, expectedBatches, 'the destination frustum\'s objects (and the uncull one), in batches');

// detach one chosen object before its batch: it is skipped
const detached = ahead[69];
scene.remove(detached);
const masks = [...scene.children].map((o) => [o, o.layers.mask, o.frustumCulled]);
for (let frame = 0; frame < expectedBatches; frame++) warmer.update();
assert.equal(draws.length, expectedBatches, 'one batch a frame');
const drawnAll = draws.flatMap((d) => d.drawn);
assert.ok(draws.every((d) => d.drawn.length <= CAMERA_DESTINATION_WARM.batchObjects), 'each batch is bounded');
assert.ok(draws.every((d) => d.uncull), 'a batch draws whatever any frustum holds');
assert.ok(!drawnAll.includes(atCamera), 'the camera\'s own surroundings are not the destination\'s');
assert.ok(!behind.some((o) => drawnAll.includes(o)), 'what lies behind the destination camera is not drawn');
assert.ok(!drawnAll.includes(detached), 'an object detached since is not drawn');
assert.ok(drawnAll.includes(always), 'an uncull object draws whatever any frustum holds');
assert.equal(new Set(drawnAll).size, drawnAll.length, 'each object once');
// nearest first: the first batch's objects are no farther than the last's
const dist = (o) => o.position.distanceTo(dest);
assert.ok(Math.max(...draws[0].drawn.filter((o) => o !== always).map(dist)) <= Math.min(...draws.at(-1).drawn.filter((o) => o !== always).map(dist)) + 1e-6,
  'nearest first');
for (const [o, mask, culled] of masks) {
  assert.equal(o.layers.mask, mask, 'every layer mask restored');
  assert.equal(o.frustumCulled, culled, 'every culling flag restored');
}

// the focus is released once the batches are drawn and the hop's time (+ the tail) has passed
warmer.update();
assert.equal(focusLog.length, 1, 'still focused within the hop');
now = (1.5 + CAMERA_DESTINATION_WARM.focusTailS) * 1000 + 1;
warmer.update();
assert.deepEqual(focusLog.at(-1), null, 'released after the hop');

// cancel drops pending batches and the focus
warmer.prepare(dest, look, 5);
assert.ok(warmer.pendingBatches > 0);
warmer.cancel();
assert.equal(warmer.pendingBatches, 0);
assert.equal(focusLog.at(-1), null);
warmer.dispose();
console.log(`cameraDestinationWarm.selftest: ${expectedBatches} batches of the destination's view, alone and uncull'd, nearest first, the terrain focus held and released PASS`);
