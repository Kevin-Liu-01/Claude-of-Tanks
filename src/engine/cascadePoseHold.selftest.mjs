// cascadePoseHold.selftest.mjs — held cascade poses (shadowStaticCache.ts createCascadePoseHold, applied by lighting.ts
// prepareStableCascades; 2026-10-13, the perf stream): the live
// rig in node with main.ts's camera drives, turns and looks down; every frame each rendered cascade's light is checked
// against a reference this receipt computes on its own from the camera (its fov, aspect, near and the preset's range):
// the held light sits on the re-centred pose's texel lattice (the map holds the same texels at the same world places),
// at least lightMargin above the slice and no more than the window above that, the slice as the fade samples it stays
// four texels inside the box, and its deepest point stays inside the light's far plane. Driving holds the poses (so the
// static cache can reuse them), a slice that outgrows the box takes today's pose exactly, a sun move or a box regrid
// re-centres, and __SHADOW_DEBUG.noPoseHold restores today's pose on every frame.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';

const store = new Map();
globalThis.window = {
  localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
  location: { search: '' },
};
const quality = await import('./quality.ts');
const { createLighting } = await import('./lighting.ts');
const { snapShadowCoordinate } = await import('./shadowStability.ts');
const mainSource = await readFile(new URL('../main.ts', import.meta.url), 'utf8');
const cameraMatch = /const camera = new THREE\.PerspectiveCamera\(\s*([\d.]+),[^,]+,\s*([\d.]+),\s*([\d.]+),?\s*\)/.exec(mainSource);
assert.ok(cameraMatch, 'main.ts builds the game camera as a PerspectiveCamera(fov, aspect, near, far)');
const [cameraFov, cameraNear, cameraFar] = cameraMatch.slice(1, 4).map(Number);
const source = await readFile(new URL('./shadowStaticCache.ts', import.meta.url), 'utf8');
const MARGIN_TEXELS = Number(/const POSE_HOLD_MARGIN_TEXELS = (\d+);/.exec(source)[1]);
const Z_WINDOW = Number(/const POSE_HOLD_Z_WINDOW_M = (\d+);/.exec(source)[1]);
assert.equal(MARGIN_TEXELS, 4);
assert.equal(Z_WINDOW, 100);

quality.setPresetName('high');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(cameraFov, 16 / 9, cameraNear, cameraFar);
camera.rotation.order = 'YXZ';
camera.position.set(0, 4, 0);
camera.updateMatrixWorld();
const sun = new THREE.Vector3(0.62, 0.57, 0.54).normalize();
const rig = createLighting(scene, camera, sun);
rig.updateFrustums();
const lights = [];
scene.traverse((object) => { if (object.isDirectionalLight && object.castShadow) lights.push(object); });
assert.equal(lights.length, 4);
const csm = rig.csm;

// holds run while the static cache is loaded: a frozen world root asks for it
rig.update(true, 1 / 60);
assert.equal(rig.getShadowTelemetry().staticCache, null, 'no held poses before the static cache (its chunk) loads');
const root = new THREE.Group();
root.userData.matrixTraversalFrozen = true;
scene.add(root);
rig.update(false, 1 / 60);
for (let k = 0; k < 50 && !rig.getShadowTelemetry().staticCache; k++) await new Promise((r) => setTimeout(r, 10));
assert.ok(rig.getShadowTelemetry().staticCache, 'the static cache loads with a frozen world root');

// the reference: light space from the sun, the camera's own frustum corners, three's fade overlap
const orientation = new THREE.Matrix4(), inverse = new THREE.Matrix4(), cameraToLight = new THREE.Matrix4();
const v = new THREE.Vector3();
function lightSpace() {
  orientation.lookAt(new THREE.Vector3(), csm.lightDirection, new THREE.Vector3(0, 1, 0));
  inverse.copy(orientation).invert();
  cameraToLight.multiplyMatrices(inverse, camera.matrixWorld);
}
const far = () => Math.min(camera.far, csm.maxFar);
function sliceBox(fromM, toM) {
  const t = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2), box = new THREE.Box3();
  for (const d of [fromM, toM]) for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    box.expandByPoint(v.set(sx * d * t * camera.aspect, sy * d * t, -d).applyMatrix4(cameraToLight));
  }
  return box;
}
function reference(i) {
  const span = far() - camera.near;
  const x = i ? csm.breaks[i - 1] : 0, y = csm.breaks[i];
  const plain = sliceBox(i ? x * far() : camera.near, y * far());
  const sampled = sliceBox(Math.max(camera.near, (x - 0.125 * x * x) * span), (y + 0.125 * y * y) * span);
  const cam = lights[i].shadow.camera, texel = (cam.right - cam.left) / lights[i].shadow.mapSize.x;
  const snap = (c) => snapShadowCoordinate(c, texel);
  return {
    texel, half: (cam.right - cam.left) / 2, lightFar: cam.far, plain, sampled,
    x: snap((plain.min.x + plain.max.x) / 2), y: snap((plain.min.y + plain.max.y) / 2), z: plain.max.z + csm.lightMargin,
  };
}
const eps = 1e-6;
const stats = { checked: 0, held: 0, today: 0 };
function check(label, { expectToday = false } = {}) {
  lightSpace();
  const mask = rig.getShadowTelemetry().scheduledMask;
  for (let i = 0; i < 4; i++) {
    if (!(mask & (1 << i))) continue;
    const r = reference(i);
    const p = lights[i].position.clone().applyMatrix4(inverse);
    const t = lights[i].target.position.clone().sub(lights[i].position);
    assert.ok(t.distanceTo(csm.lightDirection) < 1e-9, `${label} c${i}: the light looks down the sun ray`);
    const room = MARGIN_TEXELS * r.texel;
    const fits = r.sampled.min.x >= r.x - r.half + room && r.sampled.max.x <= r.x + r.half - room
      && r.sampled.min.y >= r.y - r.half + room && r.sampled.max.y <= r.y + r.half - room;
    const dx = (p.x - r.x) / r.texel, dy = (p.y - r.y) / r.texel;
    assert.ok(Math.abs(dx - Math.round(dx)) < 1e-4 && Math.abs(dy - Math.round(dy)) < 1e-4,
      `${label} c${i}: the light sits on the re-centred pose's texel lattice (${dx}, ${dy})`);
    if (expectToday || !fits && Math.abs(p.z - r.z) < eps) {
      // today's pose exactly: the slice outgrows the box even re-centred, or nothing is held
      assert.ok(Math.abs(dx) < 1e-4 && Math.abs(dy) < 1e-4 && Math.abs(p.z - r.z) < eps, `${label} c${i}: today's pose`);
      stats.today++;
    } else {
      assert.ok(r.sampled.min.x >= p.x - r.half + room - eps && r.sampled.max.x <= p.x + r.half - room + eps
        && r.sampled.min.y >= p.y - r.half + room - eps && r.sampled.max.y <= p.y + r.half - room + eps,
      `${label} c${i}: the slice as the fade samples it stays ${MARGIN_TEXELS} texels inside the held box`);
      assert.ok(p.z >= r.z - eps && p.z <= r.z + Z_WINDOW + eps, `${label} c${i}: the light ${(p.z - r.z).toFixed(2)} m above today's`);
      assert.ok(p.z - r.sampled.min.z <= Math.max(r.lightFar - 1, r.z - r.sampled.min.z) + eps,
        `${label} c${i}: the deepest sampled point inside the light's far plane`);
      stats.held++;
    }
    stats.checked++;
  }
}
const recentres = () => { const r = rig.getShadowTelemetry().staticCache.poseHold.recentres; return [0, 1, 2, 3].map((i) => r[i] ?? 0); };
const pose = (x, z, yaw, pitch, y = 4) => { camera.position.set(x, y, z); camera.rotation.set(pitch, yaw, 0); camera.updateMatrixWorld(); };

// driving straight at 10 m/s with a bob: the poses hold
let x = 0, z = 0, yaw = 0.3;
const before = recentres();
for (let f = 0; f < 600; f++) {
  x += Math.sin(yaw) * 10 / 60; z += Math.cos(yaw) * 10 / 60;
  pose(x, z, yaw + Math.PI, -0.12 + Math.sin(f * 0.03) * 0.02, 4 + Math.sin(f * 0.05) * 0.3);
  rig.update(false, 1 / 60);
  check(`drive ${f}`);
}
const driving = recentres().map((n, i) => n - before[i]);
assert.ok(rig.getShadowTelemetry().staticCache.poseHold.enabled, 'held poses are on with the static cache');
assert.ok(driving.every((n) => n <= 8), `driving 100 m re-centres each cascade a few times (${driving})`);
// turning in place at 0.6 rad/s: the near cascades hold for many frames
const turnStart = recentres();
for (let f = 0; f < 600; f++) {
  yaw += 0.01;
  pose(x, z, yaw + Math.PI, -0.12);
  rig.update(false, 1 / 60);
  check(`turn ${f}`);
}
const turning = recentres().map((n, i) => n - turnStart[i]);
assert.ok(turning[0] < 60 && turning[1] < 60 && turning[2] < 80, `a full turn re-centres the near cascades rarely (${turning})`);
// looking steeply down: the far slices outgrow their boxes even re-centred and take today's pose
const todayBefore = stats.today;
for (let f = 0; f < 60; f++) {
  pose(x, z, yaw + f * 0.05, -1.3, 60);
  rig.update(false, 1 / 60);
  check(`down ${f}`);
}
assert.ok(stats.today > todayBefore, 'a slice that outgrows its box keeps today\'s pose');
// the sun moves: every cascade re-centres
pose(x, z, yaw, -0.12);
rig.update(false, 1 / 60);
const sunStart = recentres();
rig.setSun(new THREE.Vector3(-0.5, 0.6, 0.62).normalize(), {});
rig.update(false, 1 / 60);
check('sun');
assert.ok(recentres().every((n, i) => n > sunStart[i]), 'a sun move re-centres every cascade');
// a box regrid (a real zoom) re-centres
const zoomStart = recentres();
camera.fov = cameraFov * 0.5;
camera.updateProjectionMatrix();
rig.updateFov();
pose(x + 0.01, z, yaw, -0.12);
rig.update(false, 1 / 60);
check('zoom');
assert.ok(recentres().every((n, i) => n > zoomStart[i]), 'a regridded box re-centres every cascade');
camera.fov = cameraFov;
camera.updateProjectionMatrix();
rig.updateFov();
// the A/B switch: today's pose on every frame
window.__SHADOW_DEBUG = { noPoseHold: true };
for (let f = 0; f < 120; f++) {
  x += 0.2;
  pose(x, z, yaw + f * 0.004, -0.12);
  rig.update(false, 1 / 60);
  check(`plain ${f}`, { expectToday: true });
}
assert.equal(rig.getShadowTelemetry().staticCache.poseHold.enabled, false);
delete window.__SHADOW_DEBUG;

// the hold lives in the cache's chunk, out of the game entry (2026-10-13, the bundle budget): lighting.ts only applies it
const lightingSource = await readFile(new URL('./lighting.ts', import.meta.url), 'utf8');
assert.doesNotMatch(lightingSource, /POSE_HOLD_|_holdBounds/, 'lighting.ts carries no hold of its own');
assert.match(lightingSource, /return prepareStableCascades\(csm, staticShadowCache\?\.poseHold \?\? null\);/);
assert.match(lightingSource, /^import type \{ CascadePoseHold, ShadowStaticCache \} from '\.\/shadowStaticCache\.ts';$/m);

console.log(`cascadePoseHold.selftest: ${stats.checked} cascade poses checked (${stats.held} held, ${stats.today} today's); `
  + `driving 100 m re-centres ${driving}, a full turn ${turning}`);
