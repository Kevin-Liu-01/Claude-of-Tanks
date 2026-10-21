import assert from 'node:assert/strict';
import * as THREE from 'three';
// rendered vehicle builds paint canvases: the shared node canvas shim the sealed and watertight tools use
import '../../tools/tank-surface-collect.mjs';
import { LOD_REFERENCE_FOV_DEG, installZoomAwareLods, lodDistanceScale, zoomAwareLodUpdate } from './lodDistanceScale.ts';
import { createTank } from '../vehicles/tankFactory.ts';
import { ensureInteriorFills } from '../vehicles/interiorFills.ts';
import { getSpec } from '../vehicles/specs.ts';
import { createTankState } from '../sim/movement.ts';

// Sealed lane round 2 (2026-10-10): vehicles pick their LOD and detail state by screen size, so the sniper sight
// (cameraRig: fov = 60 / zoom) shows a magnified enemy's near detail, never its distance-culled state, while every
// view at or wider than the reference field of view keeps the authored horizons.
const camera = (fov, distance = 0, zoom = 1) => {
  const c = new THREE.PerspectiveCamera(fov, 16 / 9, 0.1, 5000);
  c.zoom = zoom; c.position.set(0, 2, distance); c.updateMatrixWorld(true);
  return c;
};
const close = (a, b, eps = 1e-12) => Math.abs(a - b) <= eps;

assert.equal(LOD_REFERENCE_FOV_DEG, 60, 'the reference is the gameplay camera base FOV (cameraRig BASE_FOV_DEG)');
assert.equal(lodDistanceScale(camera(60)), 1, 'the chase view keeps the authored distance');
assert.equal(lodDistanceScale(camera(72)), 1, 'a wider view never culls earlier than authored');
for (const zoom of [2, 4, 8, 16, 25]) {
  const expected = Math.tan((60 / zoom) * Math.PI / 360) / Math.tan(Math.PI / 6);
  assert.ok(close(lodDistanceScale(camera(60 / zoom)), expected), `x${zoom} sight: screen-equivalent distance`);
}
assert.ok(close(lodDistanceScale(camera(60, 0, 2)), 0.5), "three's own camera.zoom still divides");
assert.equal(lodDistanceScale(new THREE.OrthographicCamera()), 1, 'an orthographic camera keeps the distance (zoom 1)');

{
  const lod = new THREE.LOD();
  const near = new THREE.Object3D(), far = new THREE.Object3D();
  lod.addLevel(near, 0); lod.addLevel(far, 64, 0.1); lod.update = zoomAwareLodUpdate; lod.updateMatrixWorld(true);
  lod.update(camera(60, 100));
  assert.ok(!near.visible && far.visible, 'unscoped at 100 m: the far level, as THREE.LOD');
  const reference = new THREE.LOD(); const rn = new THREE.Object3D(), rf = new THREE.Object3D();
  reference.addLevel(rn, 0); reference.addLevel(rf, 64, 0.1); reference.updateMatrixWorld(true);
  for (const d of [10, 57, 58, 64, 70, 120, 63, 57.5, 30]) {
    lod.update(camera(60, d)); reference.update(camera(60, d));
    assert.equal(near.visible, rn.visible, `unscoped at ${d} m: identical to THREE.LOD (hysteresis included)`);
    assert.equal(lod.getCurrentLevel(), reference.getCurrentLevel(), `unscoped at ${d} m: same current level`);
  }
  lod.update(camera(60 / 8, 100));
  assert.ok(near.visible && !far.visible, 'through the x8 sight at 100 m: the near level (reads as ~11 m)');
}

{
  const ID = 'm1a2_abrams_tusk';
  await ensureInteriorFills([ID]);
  const visual = createTank(ID, null, { camoSeed: 4000, quality: 'ai', geometryQuality: 'low', batchStatic: true, battleDetailLod: true, eraVisualBindingReceipt: false });
  try {
    let lods = 0, installed = 0;
    visual.root.traverse((object) => { if (object.isLOD) { lods++; if (object.update === zoomAwareLodUpdate) installed++; } });
    assert.ok(lods > 10 && installed === lods, `every vehicle LOD picks its level by screen size (${installed}/${lods})`);
    assert.equal(installZoomAwareLods(visual.root), lods, 'installing again is idempotent');
    const state = createTankState(getSpec(ID), new THREE.Vector3(), 0);
    const shown = (cam) => {
      visual.syncFromState(state, 1 / 60, cam.position.length() * lodDistanceScale(cam));
      visual.root.updateMatrixWorld(true);
      for (let pass = 0; pass < 2; pass++) visual.root.traverse((object) => { if (object.isLOD) object.update(cam); });
      const names = new Set(); visual.root.traverseVisible((object) => { if (object.isMesh) names.add(object.name); });
      return names;
    };
    // 2026-10-17 (VEHICLES 227 C2, the salvage onto main): the painted far fill left with 371b's grille note, so the
    // far state is the detail-culled set and the scoped state is exactly the near set
    const near = shown(camera(60, 20));
    const chase = shown(camera(60, 200));
    assert.ok(near.has('hullDetail') && !chase.has('hullDetail') && !chase.has('gearTrackPads'), 'unscoped at 200 m: detail culled');
    const scoped = shown(camera(60 / 8, 200));
    assert.ok(scoped.has('hullDetail') && scoped.has('gearTrackPads'), 'through the x8 sight at 200 m: the near detail');
    assert.ok(scoped.size === near.size && [...near].every((name) => scoped.has(name)),
      'through the x8 sight at 200 m: exactly the close-range set (it reads as ~23 m)');
    const back = shown(camera(60, 200));
    assert.ok(!back.has('hullDetail'), 'leaving the sight returns to the authored far state');
  } finally { visual.dispose(); }
}
console.log('lodDistanceScale.selftest: screen-size vehicle LODs (unscoped identical to THREE.LOD, the x8 sight draws near detail)');
