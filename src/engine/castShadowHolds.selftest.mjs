import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { castShadowHeldByOthers, holdCastShadowOff, releaseCastShadowHold } from './castShadowHolds.ts';
import { installArticulatedShadowBatch } from './articulatedShadowBatch.ts';
import { markShadowOnly } from './renderLayers.ts';

// 2026-11-02 audit R4 (temporary overrides across awaits): the covered deployment shadow warm switched every caster's
// castShadow off across its awaits and forced it back to true on every caster it had snapshotted; an articulated shadow
// batch switched its sources off for its life and back on in its dispose whoever else held them off. A value compare
// cannot tell the two apart (both write false). castShadowHolds.ts gives each owner a named hold.

{
  const caster = { castShadow: true };
  const warm = {}, batch = {};
  holdCastShadowOff(caster, warm);
  holdCastShadowOff(caster, batch);
  assert.equal(caster.castShadow, false);
  assert.equal(castShadowHeldByOthers(caster, warm), true, 'the warm sees the batch\'s hold and leaves the caster off');
  releaseCastShadowHold(caster, warm);
  assert.equal(caster.castShadow, false, 'the warm\'s release keeps the batch\'s hold');
  releaseCastShadowHold(caster, warm);
  releaseCastShadowHold(caster, batch);
  assert.equal(caster.castShadow, true, 'the last release restores the pre-hold value');
  // a write by someone else between hold and release stands
  holdCastShadowOff(caster, warm);
  caster.castShadow = true;
  releaseCastShadowHold(caster, warm);
  assert.equal(caster.castShadow, true);
  const never = { castShadow: false };
  holdCastShadowOff(never, warm);
  releaseCastShadowHold(never, warm);
  assert.equal(never.castShadow, false, 'a caster that was off before stays off');
}

{
  // the articulated batch's dispose gives back only its own hold: a caster the deployment warm still holds stays off
  const scene = new THREE.Scene();
  const root = new THREE.Group();
  scene.add(root);
  const material = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false });
  const depthMaterial = new THREE.MeshDepthMaterial();
  const sources = [0, 1].map((i) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0, 0.5, 0], 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
    const owner = new THREE.Group();
    owner.position.set(i * 4, 0, -10);
    const mesh = markShadowOnly(new THREE.Mesh(geometry, material));
    mesh.userData.authoredShadowProxy = true;
    mesh.customDepthMaterial = depthMaterial;
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    mesh.raycast = () => {};
    owner.add(mesh);
    root.add(owner);
    return mesh;
  });
  scene.updateMatrixWorld(true);
  const batch = installArticulatedShadowBatch(root, sources);
  assert.ok(batch, 'the sources batch');
  assert.deepEqual(sources.map((s) => s.castShadow), [false, false], 'the batch casts for its sources');
  const warm = {};
  holdCastShadowOff(sources[0], warm); // the covered warm's own isolation, across its awaits
  batch.dispose();
  assert.equal(sources[0].castShadow, false, 'the batch\'s dispose leaves a caster the warm still holds off');
  assert.equal(sources[1].castShadow, true, 'and gives back the rest');
  releaseCastShadowHold(sources[0], warm);
  assert.equal(sources[0].castShadow, true, 'the warm\'s release then restores it');
  for (const source of sources) source.geometry.dispose();
  material.dispose(); depthMaterial.dispose();
}

{
  // the production wiring: the deployment warm holds and releases its casters by name; restores compare what they wrote
  // (the warm driven through a real articulated batch installed mid-warm: deploymentShadowWarm.selftest)
  const warm = readFileSync(new URL('./deploymentShadowWarm.ts', import.meta.url), 'utf8');
  assert.match(warm, /for \(const \{ object \} of state\.casters\) holdCastShadowOff\(object, state\);/);
  assert.match(warm, /for \(const object of batch\) if \(!castShadowHeldByOthers\(object, state\)\) object\.castShadow = true;/);
  assert.doesNotMatch(warm, /for \(const \{ object \} of state\.casters\) object\.castShadow = true;/, 'no forced true over every caster');
  assert.match(warm, /if \(state\.shadow\.autoUpdate === false\) state\.shadow\.autoUpdate = state\.autoUpdate;/);
  assert.match(warm, /if \(object\.autoUpdate === false\) object\.autoUpdate = autoUpdate;/);
}

console.log('castShadowHolds selftest: named castShadow holds; the warm and an articulated batch give back only their own');
