import assert from 'node:assert/strict';
import * as THREE from 'three';
// rendered builds paint canvases: the shared node canvas shim the sealed and watertight tools use
import '../../tools/tank-surface-collect.mjs';
import { createTank } from './tankFactory.ts';
import { ensureInteriorFills } from './interiorFills.ts';
import { getSpec } from './specs.ts';
import { createTankState } from '../sim/movement.ts';

// Sealed lane 2026-10-10 (owner: "some vehicles are see through ... gaps in the middle of their bodies"). Every
// battle bot builds the LOW geometry, whose detail buckets cull at 64 m; wherever a profile closed the body with a
// detail part the dark interior fill showed as a hole past that horizon (the M1A2 TUSK's whole stern grille, 2.5 m).
// Rendered builds now give each fill a painted far level on the same horizon, and the carved muzzle's wall and
// backstop never hide with distance. Receipt builds keep the plain fills their generators and audits measure.
const ID = 'm1a2_tusk';
await ensureInteriorFills([ID]);
const state = createTankState(getSpec(ID), new THREE.Vector3(), 0);

function fills(root) {
  const out = [];
  root.traverse((object) => { if (object.isMesh && /InteriorFill$/.test(object.name)) out.push(object); });
  return out;
}
function detailHorizon(root) {
  let horizon = null;
  root.traverse((object) => {
    if (horizon !== null || !object.isLOD) return;
    if (object.levels[0]?.object?.name === 'hullDetail') horizon = object.levels[object.levels.length - 1].distance;
  });
  return horizon;
}
function shownAt(root, distanceM) {
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 5000);
  camera.position.set(0, 2, distanceM); camera.updateMatrixWorld(true); root.updateMatrixWorld(true);
  for (let pass = 0; pass < 2; pass++) root.traverse((object) => { if (object.isLOD) object.update(camera); });
  const shown = new Set();
  root.traverseVisible((object) => { if (object.isMesh) shown.add(object.name); });
  return shown;
}

for (const [label, options, horizon] of [
  ['battle bot (LOW)', { camoSeed: 4000, quality: 'ai', geometryQuality: 'low', batchStatic: true, battleDetailLod: true, eraVisualBindingReceipt: false }, 64],
  ['garage (HIGH)', { camoSeed: 4200, quality: 'ai', staticPreview: true, batchStatic: true, eraVisualBindingReceipt: false }, 150],
]) {
  const visual = createTank(ID, null, options);
  try {
    const dark = fills(visual.root);
    assert.ok(dark.length >= 2, `${label}: the tank's hull and turret fills are installed (${dark.length})`);
    assert.equal(detailHorizon(visual.root), horizon, `${label}: the detail buckets cull at ${horizon} m`);
    for (const mesh of dark) {
      const lod = mesh.parent;
      assert.ok(lod?.isLOD && lod.levels.length === 2 && lod.levels[0].object === mesh, `${label}: ${mesh.name} is the near level of its LOD`);
      const far = lod.levels[1].object;
      assert.equal(far.name, `${mesh.name}Far`, `${label}: ${mesh.name}'s far level`);
      assert.equal(lod.levels[1].distance, horizon, `${label}: ${mesh.name} switches on the detail horizon`);
      assert.equal(lod.levels[1].hysteresis, 0.1, `${label}: ${mesh.name} switches with the detail hysteresis`);
      assert.ok(far.userData.interiorFill && far.userData.interiorFillFar, `${label}: the far level is a fill (fingerprints skip it)`);
      assert.notEqual(far.material, mesh.material, `${label}: the far level is painted, not the dark backstop`);
      assert.equal(far.material.name, 'cot:armor-paint', `${label}: the far level wears the hull's camouflage paint`);
      assert.ok(far.geometry.getAttribute('uv') && far.geometry.getAttribute('color'), `${label}: the painted copy carries camouflage UVs and baked dust`);
      assert.deepEqual([...far.geometry.getAttribute('position').array], [...mesh.geometry.getAttribute('position').array],
        `${label}: the painted level is the same boxes`);
    }
    visual.syncFromState(state, 1 / 60, 20);
    const near = shownAt(visual.root, 20);
    assert.ok(near.has('hullInteriorFill') && !near.has('hullInteriorFillFar'), `${label}: inside the horizon the dark fill reads as the interior`);
    visual.syncFromState(state, 1 / 60, horizon + 40);
    const farShown = shownAt(visual.root, horizon + 40);
    assert.ok(farShown.has('hullInteriorFillFar') && !farShown.has('hullInteriorFill'), `${label}: past the horizon the fill wears the hull's paint`);
    assert.ok(!farShown.has('hullDetail'), `${label}: the detail bucket is culled there (the case the painted level exists for)`);
    if (near.has('muzzleBoreInnerWallAndBackstop')) {
      assert.ok(farShown.has('muzzleBoreInnerWallAndBackstop'), `${label}: the carved muzzle's wall and backstop stay with the barrel past the detail horizon`);
    }
  } finally { visual.dispose(); }
}

{
  const receipt = createTank(ID, null, { proceduralOnly: true, geometryReceipt: true });
  try {
    const dark = fills(receipt.root);
    assert.ok(dark.length >= 2 && dark.every((mesh) => !mesh.parent?.isLOD), 'receipt builds keep the plain fills');
    let painted = 0; receipt.root.traverse((object) => { if (object.userData?.interiorFillFar) painted++; });
    assert.equal(painted, 0, 'receipt builds carry no painted level');
  } finally { receipt.dispose(); }
}
console.log('interiorFillFarLevel.selftest: painted far fills on the detail horizon (LOW 64 m, HIGH 150 m), carved muzzle kept, receipt builds plain');
