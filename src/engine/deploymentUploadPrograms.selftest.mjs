import assert from 'node:assert/strict';
import * as THREE from 'three';
import { WebGLPrograms } from 'three/src/renderers/webgl/WebGLPrograms.js';
import { createOffscreenSceneWarmer } from './offscreenWarm.ts';
import { createDeploymentShadowWarmOwner } from './deploymentShadowWarm.ts';
import { deploymentUploadVariantKey } from './deploymentUploadPrograms.ts';

const uploadMaterial = new THREE.MeshBasicMaterial({ color: 0, colorWrite: false,
  depthWrite: false, depthTest: false, fog: false, toneMapped: false });
uploadMaterial.name = 'DeploymentBufferUpload';
const lights = { directional: [], point: [], spot: [], spotLightMap: [], rectArea: [], hemi: [],
  directionalShadowMap: [], pointShadowMap: [], spotShadowMap: [], numSpotLightShadowsWithMaps: 0, numLightProbes: 0 };

function nativeKeys(renderer) {
  const programs = WebGLPrograms(renderer, { get: () => null }, { has: () => true },
    { precision: 'highp', logarithmicDepthBuffer: false }, {}, { numPlanes: 0, numIntersection: 0 });
  return (object, material, scene) => programs.getProgramCacheKey(
    programs.getParameters(material, lights, [], scene, object, []));
}

{
  const key = nativeKeys({ getRenderTarget: () => null, outputColorSpace: THREE.SRGBColorSpace,
    state: { buffers: { depth: { getReversed: () => false } } }, shadowMap: { enabled: false } });
  const scene = new THREE.Scene();
  const keysByPartition = new Map();
  for (let attributes = 0; attributes < 4; attributes++) {
    for (let morphs = 0; morphs < 8; morphs++) {
      for (const count of [1, 2]) {
        for (const kind of ['mesh', 'skin', 'instances', 'instance-color', 'instance-morph', 'batch', 'batch-color']) {
          const geometry = new THREE.BufferGeometry();
          if (attributes & 1) geometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3));
          if (attributes & 2) geometry.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0], 3));
          for (const [index, name] of ['position', 'normal', 'color'].entries()) {
            if (morphs & (1 << index)) geometry.morphAttributes[name] = Array.from({ length: count }, () =>
              new THREE.Float32BufferAttribute([0, 0, 0], 3));
          }
          const object = new THREE.Mesh(geometry, uploadMaterial);
          object.isSkinnedMesh = kind === 'skin';
          object.isInstancedMesh = kind.startsWith('instance');
          object.instanceColor = kind === 'instance-color' ? {} : null;
          object.morphTexture = kind === 'instance-morph' ? {} : null;
          object.isBatchedMesh = kind.startsWith('batch');
          object._colorsTexture = kind === 'batch-color' ? {} : null;
          const partition = deploymentUploadVariantKey(object);
          const actual = key(object, uploadMaterial, scene);
          if (keysByPartition.has(partition)) assert.equal(actual, keysByPartition.get(partition),
            'a representative partition must never merge distinct pinned native program keys');
          keysByPartition.set(partition, actual);
          geometry.dispose();
        }
      }
    }
  }
  assert.ok(keysByPartition.size > 100, 'cover object and geometry feature combinations, not material names');
}

function fixture(mode) {
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x123456, 1, 900);
  scene.environment = new THREE.Texture();
  const priorOverride = new THREE.MeshBasicMaterial();
  scene.overrideMaterial = priorOverride;
  const camera = new THREE.PerspectiveCamera(55, 1.7, 0.5, 4000);
  camera.layers.enable(2);
  const cameraState = camera.toJSON();
  const light = new THREE.DirectionalLight();
  light.shadow.autoUpdate = light.shadow.needsUpdate = true;
  const material = new THREE.MeshStandardMaterial();
  const parent = new THREE.Mesh(new THREE.BoxGeometry(), material);
  const child = new THREE.InstancedMesh(new THREE.BoxGeometry(), material, 2);
  child.setColorAt(0, new THREE.Color('red'));
  parent.add(child);
  const mesh = new THREE.Mesh(new THREE.BufferGeometry().setAttribute('position',
    new THREE.Float32BufferAttribute([0, 0, 0], 3)), [material]);
  const hidden = new THREE.Mesh(new THREE.BoxGeometry(), material);
  hidden.visible = false;
  parent.add(hidden);
  const lod = new THREE.LOD(); lod.addLevel(parent, 0);
  scene.add(light, lod, mesh);
  const objects = [parent, child, mesh, hidden];
  const states = objects.map(object => ({ material: object.material, parent: object.parent,
    mask: object.layers.mask, visible: object.visible }));
  const programs = new Map(), properties = new Map();
  let active = { caller: true }, face = 3, mip = 2, lost = false, cancelled = false;
  const priorTarget = active;
  let uploads = 0, compiles = 0, queries = 0, closed = 0;
  const failure = new Error('guarded covered yield cancelled');
  const gl = {
    isContextLost: () => lost,
    getExtension: () => ({ COMPLETION_STATUS_KHR: 123 }),
    getProgramParameter() { queries++; return mode !== 'pending'; },
  };
  const renderer = {
    info: { programs: [] }, shadowMap: { enabled: true, type: THREE.PCFShadowMap },
    outputColorSpace: THREE.SRGBColorSpace,
    state: { buffers: { depth: { getReversed: () => false } } },
    getContext: () => gl,
    getDrawingBufferSize: size => size.set(1024, 768),
    getRenderTarget: () => active, getActiveCubeFace: () => face, getActiveMipmapLevel: () => mip,
    setRenderTarget(target, nextFace = 0, nextMip = 0) { active = target; face = nextFace; mip = nextMip; },
    properties: { get: target => properties.get(target) },
    compile(root, actualCamera, targetScene) {
      compiles++;
      assert.equal(actualCamera, camera); assert.equal(targetScene, scene);
      assert.equal(active.texture.colorSpace, THREE.LinearSRGBColorSpace);
      assert.equal(active.texture.type, THREE.HalfFloatType);
      assert.equal(scene.overrideMaterial, priorOverride);
      assert.equal(targetScene.environment, scene.environment);
      if (mode === 'compile-throws') throw failure;
      const materials = new Set();
      root.traverse(object => {
        assert.notEqual(object, hidden, 'compilation cannot visit an unselected descendant');
        assert.ok(objects.includes(object), 'compile actual selected objects');
        const selectedMaterial = object.material;
        assert.equal(selectedMaterial.name, 'DeploymentBufferUpload');
        const key = programKey(object, selectedMaterial, targetScene);
        let program = programs.get(key);
        if (!program) {
          program = { program: {}, reflected: false,
            getUniforms() { assert.equal(lost, false); program.reflected = true; return {}; },
            getAttributes() { return {}; } };
          programs.set(key, program); renderer.info.programs.push(program);
        }
        if (!properties.has(selectedMaterial)) properties.set(selectedMaterial, { programs: new Map() });
        properties.get(selectedMaterial).programs.set(key, program);
        properties.get(selectedMaterial).currentProgram = program;
        if (mode === 'missing-cache') properties.delete(selectedMaterial);
        materials.add(selectedMaterial);
      });
      return mode === 'missing-return' ? undefined : materials;
    },
    render() {
      uploads++;
      assert.ok([...programs.values()].every(program => program.reflected),
        'every actual cached variant is reflected before the first upload');
    },
  };
  const programKey = nativeKeys(renderer);
  const warmRender = createOffscreenSceneWarmer(renderer, scene, camera, 0.125);
  const prepare = warmRender.prepareProgramsSteps;
  warmRender.prepareProgramsSteps = function* (...args) {
    try { return yield* prepare(...args); } finally { closed++; }
  };
  const owner = createDeploymentShadowWarmOwner({ renderer, scene, camera, warmRender,
    lighting: { csm: { lights: [light] }, updateFov() {}, update() {}, preservePrimedCascadesForNextFrame() {} },
    getWorldGroup: () => scene, noteFovPrimed() {}, simDt: 1 / 60, shadowOnlyWarmRender() {},
  });
  const assertRestored = (checkLod = true) => {
    assert.equal(active, priorTarget); assert.equal(face, 3); assert.equal(mip, 2);
    assert.equal(scene.overrideMaterial, priorOverride);
    if (checkLod) assert.equal(lod.autoUpdate, true);
    assert.deepEqual(camera.toJSON(), cameraState);
    objects.forEach((object, index) => {
      assert.equal(object.material, states[index].material);
      assert.equal(object.parent, states[index].parent);
      assert.equal(object.layers.mask, states[index].mask);
      assert.equal(object.visible, states[index].visible);
    });
  };
  return {
    failure, assertRestored,
    get uploads() { return uploads; }, get compiles() { return compiles; },
    get queries() { return queries; }, get closed() { return closed; },
    prime: () => owner.prime(async () => {
      assertRestored(uploads === 0); // Later caster warming owns its pre-existing LOD freeze.
      await Promise.resolve();
      if (!compiles || cancelled) return;
      cancelled = true;
      if (mode === 'cancel') throw failure;
      if (mode === 'context-loss') lost = true;
      if (mode === 'dispose') owner.dispose();
      if (mode === 'target-dispose') warmRender.dispose();
      if (mode === 'detach') scene.remove(lod);
      if (mode === 'hide') lod.visible = false;
    }),
    dispose() {
      owner.dispose(); warmRender.dispose();
      objects.forEach(object => object.geometry.dispose());
      material.dispose(); priorOverride.dispose(); scene.environment.dispose();
    },
  };
}

for (const mode of ['success', 'cancel', 'context-loss', 'dispose', 'target-dispose', 'pending',
  'compile-throws', 'missing-cache', 'missing-return', 'detach', 'hide']) {
  const f = fixture(mode);
  try {
    if (mode === 'success') {
      const receipt = await f.prime();
      assert.equal(receipt.uploadProgramPreparation.variants, 3);
      assert.equal(receipt.uploadProgramPreparation.timing.uniformCount, 3);
      assert.ok(receipt.uploadProgramPreparation.maxStepMs >= 0);
      assert.ok(receipt.uploadProgramPreparation.totalMs >= receipt.uploadProgramPreparation.syncMs);
      assert.ok(f.uploads > 0);
    } else {
      await assert.rejects(f.prime(), error => ['cancel', 'compile-throws'].includes(mode) ? error === f.failure
        : mode === 'dispose' ? /disposed/.test(error.message)
          : mode === 'missing-cache' ? /program cache unavailable/.test(error.message)
            : mode === 'missing-return' ? error instanceof TypeError
          : error.code === 'program_uniform_warm_incomplete');
      assert.equal(f.uploads, 0, `${mode} cannot enter the upload render`);
      if (mode === 'pending') assert.ok(f.queries > 0 && f.queries <= 3 * 1024, 'pending readiness has a finite shared budget');
    }
    f.assertRestored();
    assert.equal(f.closed, 1, 'success, failure and guarded-yield cancellation close the iterator');
  } finally { f.dispose(); }
}
uploadMaterial.dispose();
console.log('deploymentUploadPrograms.selftest: native variant partition, exact target and bounded lifecycle passed');
