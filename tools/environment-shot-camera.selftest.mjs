import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PerspectiveCamera, Vector3 } from 'three';
import {
  selectStandView, selectHorizonScopeTarget, selectHorizonViews, resolveEnvironmentShotModes,
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
const legacyViews = [[300, 300], [-300, 300], [-300, -300], [300, -300]];
assert.deepEqual(selectHorizonViews(), legacyViews, 'default quadrant positions and order are exact');
for (const [view, position] of Object.entries({ en: [300, 300], es: [300, -300], wn: [-300, 300], ws: [-300, -300] })) {
  assert.deepEqual(selectHorizonViews(view), [position]);
  assert.deepEqual(resolveEnvironmentShotModes(['--shots', `--horizon-view=${view}`]), {
    captureShots: true, establishingOnly: false, horizonOnly: false, horizonScopes: false,
    horizonQuadrants: true, horizonView: view,
  });
}
const focusedArgs = ['--shots', '--horizon-only', '--horizon-scopes', '--horizon-view=es', '--horizon-scope-ndc=0.4,-0.2'];
const focusedModes = resolveEnvironmentShotModes(focusedArgs);
assert.deepEqual(focusedModes.horizonScopeNdc, [0.4, -0.2]);
assert.equal(focusedModes.horizonView, 'es');
for (const ndc of ['-1,1', '1,-1', '0,0', '1e-1, -2e-1']) {
  assert.deepEqual(resolveEnvironmentShotModes(['--shots', '--horizon-scopes', `--horizon-scope-ndc=${ndc}`]).horizonScopeNdc,
    ndc.split(',').map(Number));
}
for (const arg of ['--horizon-view=n', '--horizon-view=ES', '--horizon-view=', '--horizon-view',
  '--horizon-scope-ndc', '--horizon-scope-ndc=', '--horizon-scope-ndc=0,', '--horizon-scope-ndc=,0',
  '--horizon-scope-ndc=0,0,0', '--horizon-scope-ndc=NaN,0', '--horizon-scope-ndc=0,Infinity',
  '--horizon-scope-ndc=-1.001,0', '--horizon-scope-ndc=0,1.001']) {
  assert.throws(() => resolveEnvironmentShotModes(['--shots', '--horizon-scopes', arg]), /horizon-/, arg);
}
assert.throws(() => resolveEnvironmentShotModes(['--horizon-view=es']), /require --shots/);
assert.throws(() => resolveEnvironmentShotModes(['--shots', '--horizon-only', '--horizon-scope-ndc=0,0']), /requires --horizon-scopes/);
assert.throws(() => resolveEnvironmentShotModes(['--shots', '--establishing-only', '--horizon-view=es']), /cannot be combined/);
assert.throws(() => resolveEnvironmentShotModes([...focusedArgs, '--horizon-view=en']), /Duplicate/);
assert.throws(() => resolveEnvironmentShotModes([...focusedArgs, '--horizon-scope-ndc=0,0']), /Duplicate/);
const hashBlock = auditSource.slice(auditSource.indexOf('const harnessHash ='), auditSource.indexOf('const acquisition ='));
assert.match(hashBlock, /'environment-shot-camera\.mjs'/, 'camera helpers belong to the acquisition fingerprint');
assert.match(hashBlock, /harnessHash\.update\(file\)\.update\(fs\.readFileSync\(new URL\(file, import\.meta\.url\)\)\)/);
assert.match(auditSource.slice(auditSource.indexOf('const acquisition ='), auditSource.indexOf('if (baseline) requireComparableRun')),
  /\.\.\.horizonFocus/, 'custom view and ray are explicit in acquisition receipts');
assert.match(auditSource.slice(auditSource.indexOf('const report ='), auditSource.indexOf('requireTimingBuildProvenance(report)')),
  /\.\.\.horizonFocus/, 'custom focus remains explicit in the top-level report');

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
for (const ndc of [null, [NaN, 0], [0, Infinity], [-1.1, 0], [0, 1.1], [0], [0, 0, 0], ['0', 0]]) {
  assert.throws(() => selectHorizonScopeTarget('coastal', ndc), /finite coordinates/);
}
for (const mapId of ['coastal', 'polders']) {
  assert.deepEqual(selectHorizonScopeTarget(mapId, [0.4, -0.2]), { mapId, ndcX: 0.4, ndcY: -0.2 },
    'an explicit ray overrides only the target, including the default lowland adjustment');
}
const poseBeforeInvalid = cameraPose();
for (const ndc of [[NaN, 0], [0, Infinity], [-1.001, 0], [0, 1.001]]) {
  assert.throws(() => stageHorizonScopeCapture({ mapId: D.world.mapId, ndcX: ndc[0], ndcY: ndc[1] }, D), /finite NDC/);
  assert.deepEqual(cameraPose(), poseBeforeInvalid, 'invalid inputs cannot partially alter the rig');
}

// Execute the actual audit horizon loop with mock browser/file ports. Real
// Three projections and the existing snapSniper(8) fixture remain in use.
const shotBodyStart = auditSource.indexOf('{', auditSource.indexOf('async function captureMapShots(mapId)')) + 1;
const shotBodyEnd = auditSource.indexOf('\n  const poleDetail =', shotBodyStart);
assert.ok(shotBodyStart > 0 && shotBodyEnd > shotBodyStart);
const captureHorizon = new (Object.getPrototypeOf(async function () {}).constructor)('ports', `
  const { mapId, page, fs, path, outDir, captureEvidenceShot, establishingOnly,
    horizonQuadrants, horizonView, horizonScopes, horizonScopeNdc, horizonOnly,
    selectHorizonViews, selectHorizonScopeTarget, stageHorizonScopeCapture,
    restoreHorizonArcadeCapture, setTimeout } = ports;
  ${auditSource.slice(shotBodyStart, shotBodyEnd)}
`);

async function runHorizonLoop(modes, views = selectHorizonViews) {
  camera.position.set(300, 50, 300); camera.fov = 60; camera.lookAt(0, 24, 0);
  camera.userData.scoped = false; camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
  D.rig.mode = 'ARCADE'; D.rig.zoom = 1; D.world.mapId = 'coastal';
  D.world.heightField = { getHeightAt: () => 0 };
  const shots = [], contracts = [];
  const priorWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  globalThis.window = { __DEBUG: D };
  try {
    await captureHorizon({ ...modes, mapId: 'coastal', outDir: '/fixture',
      page: { evaluate: async (fn, arg) => fn(arg, D) },
      fs: { mkdirSync() {}, writeFileSync(file, json) { contracts.push({ file, value: JSON.parse(json) }); } },
      path: { join: (...parts) => parts.join('/') },
      captureEvidenceShot: async (mapId, name, match = true) => { shots.push({ mapId, name, match, ...cameraPose() }); },
      selectHorizonViews: views, selectHorizonScopeTarget, stageHorizonScopeCapture, restoreHorizonArcadeCapture,
      setTimeout: callback => callback(),
    });
    return { shots, contracts, restored: cameraPose() };
  } finally {
    if (priorWindow) Object.defineProperty(globalThis, 'window', priorWindow); else delete globalThis.window;
  }
}
const defaultModes = resolveEnvironmentShotModes(['--shots', '--horizon-only', '--horizon-scopes']);
const defaultCapture = await runHorizonLoop(defaultModes);
assert.equal(defaultCapture.shots.length, 9); assert.equal(defaultCapture.contracts.length, 4);
assert.deepEqual(defaultCapture, await runHorizonLoop(defaultModes, () => legacyViews),
  'actual default callsite emits the identical nine poses and four contracts');
const focusedCapture = await runHorizonLoop(focusedModes);
assert.deepEqual(focusedCapture.shots.map(shot => shot.name), ['establishing', 'horizon-es', 'horizon-es-scope'],
  'single quadrant changes collection only; retain the establishing context and full scope frame');
assert.deepEqual(focusedCapture.shots.slice(1).map(shot => shot.match), [false, false], 'no old pose replay overrides the chosen scope ray');
assert.deepEqual(focusedCapture.shots[1].position, [300, 50, -300]);
assert.equal(focusedCapture.contracts.length, 1);
const focusedContract = focusedCapture.contracts[0].value;
assert.deepEqual(focusedContract.ndc, [0.4, -0.2]);
assert.deepEqual([focusedContract.mapId, focusedContract.mode, focusedContract.zoom, focusedContract.fov, focusedContract.scoped],
  ['coastal', 'SNIPER', 8, 7.5, true]);
assert.deepEqual(focusedCapture.shots[2].position, focusedContract.arcade.position);
const projection = new PerspectiveCamera(focusedContract.arcade.fov, 1440 / 900, 0.1, 3000);
projection.position.fromArray(focusedContract.arcade.position);
projection.quaternion.fromArray(focusedContract.arcade.quaternion); projection.updateMatrixWorld(true);
const requestedRay = new Vector3(0.4, -0.2, 0.5).unproject(projection).sub(projection.position).normalize();
projection.quaternion.fromArray(focusedCapture.shots[2].quaternion);
assert.ok(projection.getWorldDirection(new Vector3()).distanceTo(requestedRay) < 1e-12,
  'actual focused scope quaternion centers the explicit low/right wide-frame ray');
assert.deepEqual(focusedCapture.restored.position, focusedContract.arcade.position);
assert.deepEqual(focusedCapture.restored.quaternion, focusedContract.arcade.quaternion);
assert.equal(focusedCapture.restored.scoped, false);
assert.equal(focusedCapture.restored.mode, 'ARCADE');
D.world.mapId = 'fjord';
assert.throws(() => stageHorizonScopeCapture({ mapId: 'winter' }, D), /requested map/);
D.shotMode = false;
assert.throws(() => stageHorizonScopeCapture({ mapId: 'fjord' }, D), /frozen shot mode/);
console.log('environment-shot-camera.selftest: deterministic clear views and authored real-scope capture/restore passed');
