import assert from 'node:assert/strict';
import { PerspectiveCamera, Vector3 } from 'three';
import { selectStandView, stageHorizonScopeCapture, restoreHorizonArcadeCapture } from './environment-shot-camera.mjs';

const scene = { clusters: [{ x: 0, z: 0, r: 28 }], concealers: [], buildings: [] };
const first = selectStandView(scene);
assert.deepEqual(selectStandView(scene), first, 'evidence viewpoints are deterministic');
scene.concealers.push({ x: first.x, z: first.z, r: 7 });
const second = selectStandView(scene);
assert.ok(Math.hypot(second.x - first.x, second.z - first.z) >= 7 / 0.8 + 5,
  'a lone tree outside the stand cannot enclose the evidence camera');
scene.buildings.push({ x: second.x, z: second.z, w: 24, d: 18 });
const third = selectStandView(scene);
assert.ok(Math.hypot(third.x - second.x, third.z - second.z) >= 20,
  'nearby buildings also exclude the camera');
assert.ok(third.clearance >= 5);
assert.throws(() => selectStandView({ ...scene, halfExtent: 1 }), /unobstructed/);

const camera = new PerspectiveCamera(60, 1440 / 900, 0.1, 3000);
camera.position.set(300, 50, 300);
camera.lookAt(0, 24, 0);
camera.updateMatrixWorld(true);
const calls = [];
const D = {
  shotMode: true, camera,
  world: { mapId: 'fjord', setSniperFade: (...args) => calls.push(['fade', ...args]), update: () => {} },
  lighting: { updateFrustums: () => {}, update: () => {} },
  rig: {
    mode: 'ARCADE', zoom: 1, aimDist: 1300,
    snapSniper(zoom, yaw, pitch) {
      this.mode = 'SNIPER'; this.zoom = zoom;
      camera.position.set(2, 3, 4); // actual rig moves to the tank trunnion
      camera.rotation.set(pitch, yaw + Math.PI, 0, 'YXZ');
      camera.fov = 60 / zoom;
      camera.userData.scoped = true;
    },
    snapArcade() {
      this.mode = 'ARCADE';
      camera.position.set(5, 6, 7);
      camera.userData.scoped = false;
    },
  },
};
const expectedRay = new Vector3(-1 / 9, 19 / 90, 0.5).unproject(camera).sub(camera.position).normalize();
const scope = stageHorizonScopeCapture({ mapId: 'fjord' }, D);
assert.deepEqual(camera.position.toArray(), [300, 50, 300], 'scope retains the authored comparison location');
assert.ok(camera.getWorldDirection(new Vector3()).distanceTo(expectedRay) < 1e-12,
  'scope magnifies the selected original horizon pixel, not a restaged enemy or another map');
assert.deepEqual([scope.mapId, scope.mode, scope.zoom, scope.fov, scope.scoped], ['fjord', 'SNIPER', 8, 7.5, true]);
assert.deepEqual(calls[0], ['fade', 1, true, 7.5, 1300], 'real sniper fade uses real zoom and aim distance');
restoreHorizonArcadeCapture(scope.arcade, D);
assert.deepEqual(camera.position.toArray(), scope.arcade.position);
assert.deepEqual(camera.quaternion.toArray(), scope.arcade.quaternion);
assert.equal(camera.fov, 60);
assert.equal(camera.userData.scoped, false);
assert.equal(D.rig.mode, 'ARCADE', 'scope cannot leak into later maps or evidence shots');
assert.deepEqual(calls[1], ['fade', 0, true, 60, 1300]);
assert.throws(() => stageHorizonScopeCapture({ mapId: 'winter' }, D), /requested map/);
D.shotMode = false;
assert.throws(() => stageHorizonScopeCapture({ mapId: 'fjord' }, D), /frozen shot mode/);
console.log('environment-shot-camera.selftest: deterministic clear views and authored real-scope capture/restore passed');
