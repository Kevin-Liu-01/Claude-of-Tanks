import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from './tankFactory.ts';
import { createTankState } from '../sim/movement.ts';
import { getSpec } from './specs.ts';
import { SHADOW_ONLY_LAYER } from '../engine/renderLayers.ts';

const options = { proceduralOnly: true, geometryReceipt: true, camoSeed: 4242,
  quality: 'high', batchStatic: true, battleDetailLod: true };
const camera = new THREE.PerspectiveCamera();
camera.layers.enable(SHADOW_ONLY_LAYER);
const lightCamera = new THREE.OrthographicCamera(-200, 200, 200, -200, 0.01, 1000);
lightCamera.position.set(0, 80, 80);
lightCamera.lookAt(0, 0, 0);
lightCamera.updateMatrixWorld(true);
const inverse = new THREE.Matrix4(), actual = new THREE.Matrix4(), expected = new THREE.Matrix4();

for (const id of ['m1a2', 'jpz_e100_x']) {
  const visual = createTank(id, null, options);
  try {
    const root = visual.root;
    const batch = root.getObjectByName('articulatedShadowBatch');
    const sources = ['hull', 'turret', 'gun'].map(name => root.getObjectByName(`procShadow_${name}`)).filter(Boolean);
    assert(sources.length >= 2, `${id}: fixture owns articulated source proxies`);
    assert(batch?.isBatchedMesh, `${id}: actual battle factory installs the batch`);
    assert.equal(batch.instanceCount, sources.length);
    assert.equal(batch.parent, root);
    const parents = sources.map(source => source.parent);
    const positions = sources.map(source => Array.from(source.geometry.attributes.position.array));
    const sourceDisposals = sources.map(() => 0);
    sources.forEach((source, i) => source.geometry.addEventListener('dispose', () => sourceDisposals[i]++));
    let packedDisposals = 0;
    batch.geometry.addEventListener('dispose', () => packedDisposals++);

    const checkPose = label => {
      root.updateMatrixWorld(true);
      batch.onBeforeShadow({}, root, camera, lightCamera, batch.geometry, batch.customDepthMaterial, null);
      inverse.copy(batch.matrixWorld).invert();
      sources.forEach((source, i) => {
        assert.equal(source.parent, parents[i], `${label}: retained articulation owner`);
        assert.equal(source.castShadow, false, `${label}: no duplicate caster`);
        assert.deepEqual(Array.from(source.geometry.attributes.position.array), positions[i], `${label}: authored geometry unchanged`);
        expected.multiplyMatrices(inverse, source.matrixWorld);
        batch.getMatrixAt(i, actual);
        actual.elements.forEach((value, j) => assert(Math.abs(value - expected.elements[j]) < 2e-6,
          `${label}: texture matrix ${i}/${j} follows the source within Float32 storage precision`));
        const range = batch.getGeometryRangeAt(batch.getGeometryIdAt(i));
        const packed = batch.geometry.attributes.position.array;
        assert.deepEqual(Array.from(packed.slice(range.vertexStart * 3,
          (range.vertexStart + range.vertexCount) * 3)), positions[i], `${label}: exact copied proxy vertices`);
      });
    };
    checkPose('neutral');
    const state = createTankState(getSpec(id), new THREE.Vector3(12, 0.7, -9), 0.83);
    state.turretYaw = 0.61;
    state.gunPitch = 0.17;
    state.visualPitch = 0.13;
    state.visualRoll = -0.09;
    visual.syncFromState(state, 0.08, 150);
    checkPose('moving/far-detail-detached');
    visual.setDestroyed({ pop: true, ageS: 0.42 });
    visual.syncFromState(state, 0.12, 150);
    checkPose('destroyed');
    visual.resetForGaragePresentation();
    checkPose('garage-reset');
    visual.dispose();
    assert.deepEqual(sourceDisposals, sources.map(() => 1), `${id}: original geometry disposed exactly once`);
    assert.equal(packedDisposals, 1, `${id}: copied batch geometry disposed exactly once`);
  } catch (error) {
    visual.dispose();
    throw error;
  }
}

const authoring = createTank('m1a2', null, { ...options, batchStatic: false, battleDetailLod: false });
try {
  assert.equal(authoring.root.getObjectByName('articulatedShadowBatch'), undefined,
    'unbatched authoring/Gallery construction remains unchanged');
  for (const name of ['hull', 'turret', 'gun']) {
    assert.equal(authoring.root.getObjectByName(`procShadow_${name}`).castShadow, true);
  }
} finally { authoring.dispose(); }
console.log('articulatedShadowBatchIntegration.selftest: real factory geometry, articulation, wreck/reset and disposal passed');
