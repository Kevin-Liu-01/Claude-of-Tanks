// treeImpostorShadowRegistration.selftest (battle-retention-279): a tree-impostor binder registers a material with the
// shadow rig (setupMaterial: lighting.ts's CSM registry) only for a pool that draws it. The world's release unregisters
// what its group draws (worldBuildCoordinator releaseRoot -> releaseShadowMaterial); a material registered with every
// tree adopted by the battlefield drew nothing, so no release reached it, and its program key's closure held the bind
// options, the battlefield's forest-form law and through it the released world (live 278 on desktop: every earlier
// battle's world group alive at the Garage; the retainer path ran lighting.csm.shaders -> the Hinterland trees'
// material -> customProgramCacheKey -> formVariant -> the world group). Both binders (hinterland/trees.ts,
// horizonForestImpostors.ts), every tree adopted: no registration, no impostor pool, nothing kept on the group.
// Synthetic placements and a stub library (no atlas, no GPU).
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { applyHinterlandTreeImpostors } from './hinterland/trees.ts';
import { HINTERLAND_FORMS, HINTERLAND_TREE_STRIDE } from './hinterland/wire.ts';
import { bindHorizonForestImpostors } from './horizonForestImpostors.ts';
import { HORIZON_FOREST_PLACEMENT_STRIDE } from './horizonVista.ts';

const SPECIES = 'pine';
const library = {
  rows: [{ species: SPECIES, heightM: 12, radiusM: 2.5 }],
  variants: 1,
  rowBase: () => 0,
  albedo: { texture: null },
  applyProgram() {},
  poolGeometry() { throw new Error('no impostor pool is built when every tree is adopted'); },
};
const recorder = () => {
  const registered = [];
  return { registered, setupMaterial: (material) => { registered.push(material); } };
};
const adoptAll = { adoptWithin: () => true, adopt: (trees) => trees.length };

// the Hinterland's near trees (hinterland/wire.ts stride): x, z, height, -, tone, leaf, species index, form index, y
{
  const n = 6;
  const trees = new Float32Array(n * HINTERLAND_TREE_STRIDE);
  for (let i = 0; i < n; i++) {
    trees.set([700 + i * 9, -40 + i * 7, 14, 4, 0.5, 0.8, 0, HINTERLAND_FORMS.indexOf('conifer'), 3], i * HINTERLAND_TREE_STRIDE);
  }
  const object = new THREE.Group(), outland = new THREE.Group();
  outland.name = 'hinterland-outland';
  outland.userData.hinterlandNearTrees = { trees, species: [SPECIES], pyramid: null };
  const procedural = new THREE.Group();
  procedural.name = 'hinterland-trees-near';
  outland.add(procedural);
  object.add(outland);
  const rig = recorder();
  const receipt = applyHinterlandTreeImpostors(object, { library, rimMix: [[SPECIES, 1]], setupMaterial: rig.setupMaterial, ...adoptAll });
  assert.equal(receipt?.adopted, n, 'hinterland: every near tree adopted');
  assert.equal(receipt?.draws, 0, 'hinterland: no impostor pool drawn');
  assert.equal(rig.registered.length, 0, 'hinterland: nothing registered with the shadow rig when no pool draws it');
  let meshes = 0;
  outland.traverse((child) => { if (child.isMesh) meshes++; });
  assert.equal(meshes, 0, 'hinterland: no impostor mesh under the outland');
  assert.equal(procedural.visible, false, 'hinterland: the procedural near trees still give way to the adopted ones');
}

// the horizon ring's forest (horizonVista.ts stride): x, y, z, scale, yaw, conifer, variant, tone, -, detail
{
  const n = 5;
  const placements = new Float32Array(n * HORIZON_FOREST_PLACEMENT_STRIDE);
  for (let i = 0; i < n; i++) {
    const o = i * HORIZON_FOREST_PLACEMENT_STRIDE;
    placements[o] = 650 + i * 11; placements[o + 1] = 2; placements[o + 2] = 30 - i * 13; placements[o + 3] = 1;
    placements[o + 4] = i * 0.7; placements[o + 5] = 1; placements[o + 6] = 0; placements[o + 7] = 0.6; placements[o + 9] = 1;
  }
  const forest = new THREE.Group();
  forest.userData.horizonForest = { instances: n, placements, tone: { fog: [1, 1, 1], haze: 0, maxHeight: 20 } };
  const rig = recorder();
  const released = [];
  const receipt = bindHorizonForestImpostors(forest, {
    library, rimMix: [[SPECIES, 1]], rimTreeHeightM: 12, setupMaterial: rig.setupMaterial,
    releaseMaterial: (material) => { released.push(material); }, ...adoptAll,
  });
  assert.equal(receipt?.adopted, n, 'horizon: every ring tree adopted');
  assert.equal(receipt?.draws, 0, 'horizon: no impostor pool drawn');
  assert.equal(rig.registered.length, 0, 'horizon: nothing registered with the shadow rig when no pool draws it');
  assert.equal(forest.userData.horizonForestImpostorMaterial, null, 'horizon: no undrawn material kept on the forest');
  let meshes = 0;
  forest.traverse((child) => { if (child.isMesh) meshes++; });
  assert.equal(meshes, 0, 'horizon: no impostor mesh under the forest');
}

console.log('treeImpostorShadowRegistration.selftest: with every tree adopted neither binder registers a material with the shadow rig (Hinterland trees, horizon forest)');
