import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PerspectiveCamera, Vector3 } from 'three';
import {
  selectStandView, selectHorizonScopeTarget, resolveEnvironmentShotModes,
  stageHorizonScopeCapture, restoreHorizonArcadeCapture,
} from './environment-shot-camera.mjs';

const legacyFlags = ['--shots', '--horizon-only', '--horizon-scopes', '--horizon-quadrants'];
for (let mask = 0; mask < 16; mask++) {
  const args = legacyFlags.filter((_, i) => mask & (1 << i));
  const captureShots = args.includes('--shots');
  const horizonOnly = args.includes('--horizon-only');
  const horizonScopes = args.includes('--horizon-scopes');
  if ((horizonOnly || horizonScopes) && !captureShots) {
    assert.throws(() => resolveEnvironmentShotModes(args), /Horizon capture options require --shots/);
  } else {
    assert.deepEqual(resolveEnvironmentShotModes(args), {
      captureShots, establishingOnly: false, horizonOnly, horizonScopes,
      horizonQuadrants: args.includes('--horizon-quadrants') || horizonOnly || horizonScopes,
    }, 'existing deep-capture combinations retain their exact mode policy');
  }
}
assert.deepEqual(resolveEnvironmentShotModes(['--shots', '--establishing-only']), {
  captureShots: true, establishingOnly: true, horizonOnly: false, horizonScopes: false, horizonQuadrants: false,
});
assert.throws(() => resolveEnvironmentShotModes(['--establishing-only']), /requires --shots/);
for (const conflicting of legacyFlags.slice(1)) {
  assert.throws(() => resolveEnvironmentShotModes(['--shots', '--establishing-only', conflicting]),
    /cannot be combined with horizon capture modes/, `${conflicting}: reject instead of changing framing`);
}
const auditSource = readFileSync(new URL('./map-environment-audit.mjs', import.meta.url), 'utf8');
assert.match(auditSource, /await captureEvidenceShot\(mapId, 'establishing'\);\s*if \(establishingOnly\) return;\s*if \(horizonQuadrants\)/,
  'establishing-only exits after the unchanged canonical shot, before every extra view');

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

const cameraPose = () => ({
  position: camera.position.toArray(), quaternion: camera.quaternion.toArray(),
  fov: camera.fov, scoped: camera.userData.scoped, mode: D.rig.mode, zoom: D.rig.zoom,
});
for (const [x, z] of [[300, 300], [-300, 300], [-300, -300], [300, -300]]) {
  camera.position.set(x, 50, z);
  camera.fov = 60;
  camera.lookAt(0, 24, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
  for (const mapId of ['verdant', 'titan_gorge', 'winter', 'coastal', 'fjord']) {
    D.world.mapId = mapId;
    assert.deepEqual(selectHorizonScopeTarget(mapId), { mapId },
      `${mapId}: lowland policy must not supply different NDC defaults`);
    const legacy = stageHorizonScopeCapture({ mapId }, D);
    const legacyPose = cameraPose();
    restoreHorizonArcadeCapture(legacy.arcade, D);
    const selected = stageHorizonScopeCapture(selectHorizonScopeTarget(mapId), D);
    assert.deepEqual(selected, legacy, `${mapId}: preserve the full default scope contract`);
    assert.deepEqual(cameraPose(), legacyPose, `${mapId}: preserve exact default camera/rig pose`);
    assert.deepEqual(selected.ndc, [-1 / 9, 19 / 90]);
    restoreHorizonArcadeCapture(selected.arcade, D);
  }
  D.world.mapId = 'polders';
  const target = selectHorizonScopeTarget('polders');
  assert.deepEqual(target, { mapId: 'polders', ndcY: 1 / 15 });
  const lowlandRay = new Vector3(-1 / 9, 1 / 15, 0.5).unproject(camera).sub(camera.position).normalize();
  assert.ok(lowlandRay.y < 0, 'Polders targets the low distant land, not sky above the camera');
  const lowland = stageHorizonScopeCapture(target, D);
  assert.deepEqual(lowland.ndc, [-1 / 9, 1 / 15]);
  assert.deepEqual(camera.position.toArray(), [x, 50, z], 'lowland correction must not relocate the camera');
  assert.ok(camera.getWorldDirection(new Vector3()).distanceTo(lowlandRay) < 1e-12);
  assert.deepEqual([lowland.mode, lowland.zoom, lowland.fov, lowland.scoped], ['SNIPER', 8, 7.5, true]);
  restoreHorizonArcadeCapture(lowland.arcade, D);
  assert.deepEqual(camera.position.toArray(), lowland.arcade.position);
  assert.deepEqual(camera.quaternion.toArray(), lowland.arcade.quaternion);
  assert.equal(camera.fov, 60);
  assert.equal(camera.userData.scoped, false);
  assert.equal(D.rig.mode, 'ARCADE');
}
D.world.mapId = 'fjord';
assert.throws(() => stageHorizonScopeCapture({ mapId: 'winter' }, D), /requested map/);
D.shotMode = false;
assert.throws(() => stageHorizonScopeCapture({ mapId: 'fjord' }, D), /frozen shot mode/);
console.log('environment-shot-camera.selftest: deterministic clear views and authored real-scope capture/restore passed');
