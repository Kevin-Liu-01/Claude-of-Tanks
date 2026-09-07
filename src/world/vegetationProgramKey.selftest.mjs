import assert from 'node:assert/strict';
import * as THREE from 'three';
import { WebGLPrograms } from 'three/src/renderers/webgl/WebGLPrograms.js';
import { createLighting, releaseCsmShaderMaterial } from '../engine/lighting.ts';
import { disposeObject3DResources } from '../engine/resourceLifetime.ts';
import { createHeightField } from './terrain.ts';
import { createVegetation } from './vegetation.ts';
import { MAP_IDS, getMapConfig } from './maps/index.ts';

// Exercise ordinary production imports, including the actual material stages,
// shader helpers, CSM setup and resource declarations. Only 2D texture pixels
// are fixtures: this is a shader/key/lifetime test, not a raster image test.
function installCanvasFixture() {
  const saved = new Map(['document', 'ImageData'].map(key =>
    [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  class FixtureImageData {
    constructor(data, width, height) {
      this.data = typeof data === 'number' ? new Uint8ClampedArray(data * width * 4) : data;
      this.width = typeof data === 'number' ? data : width;
      this.height = typeof data === 'number' ? width : height;
    }
  }
  const document = { createElement(tag) {
    assert.equal(tag, 'canvas');
    const canvas = { width: 0, height: 0 };
    const context = new Proxy({
      createImageData: (w, h) => new FixtureImageData(w, h),
      getImageData: (_x, _y, w, h) => new FixtureImageData(new Uint8ClampedArray(w * h * 4).fill(128), w, h),
      createLinearGradient: () => ({ addColorStop() {} }),
      createRadialGradient: () => ({ addColorStop() {} }),
    }, { get: (target, key) => target[key] ?? (() => {}) });
    canvas.getContext = () => context;
    return canvas;
  } };
  for (const [key, value] of Object.entries({ document, ImageData: FixtureImageData })) {
    Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  }
  return () => {
    for (const [key, descriptor] of saved) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  };
}

function library(species, fade, environment) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1.6, .5, 4000);
  const lighting = createLighting(scene, camera, new THREE.Vector3(1, 1, 1).normalize());
  const { csm } = lighting;
  csm.fade = fade;
  csm.updateFrustums();
  const registered = [];
  const engine = { setupShadowMaterial(material, hook) {
    registered.push(material);
    return lighting.setupShadowMaterial(material, hook);
  } };
  const cfg = { vegetation: { species, clusterCount: 0, loneCount: 0, rimCount: 0,
    grassDensity: 0, bushCount: 0, belts: [], authoredTrees: [] } };
  const vegetation = createVegetation(createHeightField(1337), engine, 1337, cfg);
  const { group } = vegetation;
  const foliage = registered.filter(material => material.customProgramCacheKey().startsWith('world-tree-foliage-v14'));
  assert.equal(foliage.length, species.length, 'the complete production species material library exists');
  const foliageMats = Object.fromEntries(species.map((sp, index) => [sp, foliage[index]]));
  const foliageTex = Object.fromEntries(species.map(sp => [sp, foliageMats[sp].map]));
  const depthByMaterial = new Map();
  group.traverse(mesh => {
    if (mesh.userData.treeFoliage) depthByMaterial.set(mesh.material, mesh.customDepthMaterial);
  });
  const foliageDepthMats = Object.fromEntries(species.map(sp => {
    const depth = depthByMaterial.get(foliageMats[sp]);
    assert.ok(depth?.isMeshDepthMaterial, `${sp}: actual mesh exposes its shadow material`);
    return [sp, depth];
  }));
  const first = environment.expand(foliage[0]).parameters.uniforms;
  return { group, csm, foliageMats, foliageTex, foliageDepthMats,
    detail: first.uCanopyDet.value, uWindTime: first.uWindTime, uScopeHard: first.uScopeHard };
}

function programEnvironment() {
  const renderer = {
    getRenderTarget: () => null,
    state: { buffers: { depth: { getReversed: () => false } } },
    shadowMap: { enabled: true, type: THREE.PCFShadowMap },
    toneMapping: THREE.ACESFilmicToneMapping, outputColorSpace: THREE.SRGBColorSpace,
  };
  const programs = WebGLPrograms(renderer, { get: value => value }, { has: () => false },
    { precision: 'highp', logarithmicDepthBuffer: false }, {}, { numPlanes: 0, numIntersection: 0 });
  const lights = Object.fromEntries(['directional', 'point', 'spot', 'spotLightMap',
    'rectArea', 'hemi', 'directionalShadowMap', 'pointShadowMap', 'spotShadowMap'].map(key => [key, []]));
  lights.directional = [{}, {}, {}, {}]; lights.directionalShadowMap = [{}, {}, {}, {}];
  lights.hemi = [{}]; lights.numSpotLightShadowsWithMaps = 0; lights.numLightProbes = 0;
  const scene = new THREE.Scene(); scene.fog = new THREE.FogExp2(0xcccccc, .001);
  const geometry = new THREE.PlaneGeometry(1, 1);
  const mesh = new THREE.InstancedMesh(geometry, new THREE.MeshStandardMaterial(), 1);
  mesh.setColorAt(0, new THREE.Color(1, 1, 1));
  function expand(material) {
    const parameters = programs.getParameters(material, lights, [{}], scene, mesh, []);
    const key = programs.getProgramCacheKey(parameters);
    parameters.uniforms = programs.getUniforms(material);
    material.onBeforeCompile(parameters, renderer);
    return { key, parameters };
  }
  function dispose() { programs.dispose(); geometry.dispose(); mesh.material.dispose(); mesh.dispose(); }
  return { expand, dispose };
}

function assertSameShader(left, right) {
  assert.equal(left.vertexShader, right.vertexShader);
  assert.equal(left.fragmentShader, right.fragmentShader);
  assert.deepEqual(left.defines, right.defines);
}

function checkSpeciesShaderKeys(world, species, environment) {
  const rows = species.map(sp => environment.expand(world.foliageMats[sp]));
  for (let index = 0; index < species.length; index++) {
    const sp = species[index], row = rows[index], material = world.foliageMats[sp];
    assertSameShader(rows[0].parameters, row.parameters);
    assert.equal(row.key, rows[0].key, `${sp}: installed Three generates equal complete key`);
    assert.strictEqual(row.parameters.uniforms.uCanopyDet.value, world.detail);
    assert.strictEqual(row.parameters.uniforms.uWindTime, world.uWindTime);
    assert.strictEqual(material.map, world.foliageTex[sp]);
    assert.strictEqual(world.foliageDepthMats[sp].map, material.map);
    assert.equal(world.foliageDepthMats[sp].alphaTest, sp === 'palm' ? .62 : .38);
    assert.strictEqual(world.csm.shaders.get(material), row.parameters);
  }
  assert.equal(new Set(Object.values(world.foliageMats)).size, species.length);
  assert.equal(new Set(Object.values(world.foliageTex)).size, species.length);
  assert.equal(new Set(rows.map(row => row.parameters.uniforms)).size, species.length);
  assert.equal(new Set(rows.map(row => row.parameters.uniforms.CSM_cascades)).size, species.length);
  return rows;
}

function checkNegativeControls(world, rows, environment, species) {
  const material = world.foliageMats[species[1]], key = material.customProgramCacheKey;
  material.customProgramCacheKey = () => `${key()}-${species[1]}`;
  assert.notEqual(environment.expand(material).key, rows[0].key, 'old species suffix really splits Three programs');
  material.customProgramCacheKey = key;
  material.alphaToCoverage = false;
  assert.notEqual(environment.expand(material).key, rows[0].key, 'real feature differences still separate programs');
  material.alphaToCoverage = true;
  material.defines.EXTRA_FOLIAGE_VARIANT = 1;
  assert.notEqual(environment.expand(material).key, rows[0].key, 'future defines cannot alias');
  delete material.defines.EXTRA_FOLIAGE_VARIANT;
  assert.throws(() => assertSameShader(rows[0].parameters, {
    ...rows[1].parameters, fragmentShader: `${rows[1].parameters.fragmentShader}\n// mutation`,
  }), /Expected values to be strictly equal/);
}

function checkIndependentEviction(world, other, species) {
  const disposed = new Map();
  for (const library of [world, other]) for (const resource of [library.detail,
    ...Object.values(library.foliageMats), ...Object.values(library.foliageDepthMats),
    ...Object.values(library.foliageTex)]) {
    disposed.set(resource, 0);
    resource.addEventListener('dispose', () => disposed.set(resource, disposed.get(resource) + 1));
  }
  const release = library => disposeObject3DResources(library.group, {
    preserveRoots: library === world ? [other.group] : [],
    onDispose(kind, resource) { if (kind === 'material') releaseCsmShaderMaterial(library.csm, resource); },
  });
  const result = release(world);
  // Full production construction adds four grass materials and their two
  // textures plus the bark albedo/normal pair to the former foliage-only seam.
  assert.equal(result.materials, 6 + species.length * 2);
  assert.equal(result.textures, 5 + species.length);
  assert.equal(world.csm.shaders.size, 0);
  assert.equal(other.csm.shaders.size, 6 + species.length);
  for (const resource of [...Object.values(other.foliageMats), ...Object.values(other.foliageTex), other.detail]) {
    assert.equal(disposed.get(resource), 0, 'evicting one world does not dispose the other');
  }
  release(other);
  for (const count of disposed.values()) assert.equal(count, 1);
  assert.equal(other.csm.shaders.size, 0);
  world.csm.remove(); world.csm.dispose();
  other.csm.remove(); other.csm.dispose();
}

const species = [...new Set(MAP_IDS.flatMap(id => getMapConfig(id).vegetation.species))];
assert.equal(species.length, 13, 'all 13 authored foliage species remain covered');
assert.ok(species.includes('palm') && species.includes('birch') && species.includes('pine'));
const restoreCanvas = installCanvasFixture();
const environment = programEnvironment();
try {
  for (const fade of [false, true]) {
    const world = library(species, fade, environment), other = library(species, fade, environment);
    const rows = checkSpeciesShaderKeys(world, species, environment);
    const otherRows = checkSpeciesShaderKeys(other, species, environment);
    assert.equal(otherRows[0].key, rows[0].key, 'successive worlds use the same shader program key');
    assertSameShader(otherRows[0].parameters, rows[0].parameters);
    assert.notStrictEqual(otherRows[0].parameters.uniforms.uWindTime, rows[0].parameters.uniforms.uWindTime);
    world.uWindTime.value = 123; world.uScopeHard.value = 1;
    rows[0].parameters.uniforms.CSM_cascades.value[0].x = .17;
    assert.equal(other.uWindTime.value, 0); assert.equal(other.uScopeHard.value, 0);
    assert.equal(rows[1].parameters.uniforms.CSM_cascades.value[0].x, 0);
    checkNegativeControls(world, rows, environment, species);
    checkIndependentEviction(world, other, species);
  }
} finally {
  environment.dispose();
  restoreCanvas();
}
console.log(`vegetationProgramKey self-test passed: ${species.length} authored species, actual hook-expanded GLSL/CSM defines, installed Three complete keys, feature negatives and independent eviction`);
