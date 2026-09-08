import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import * as THREE from 'three';
import { CSM } from 'three/examples/jsm/csm/CSM.js';
import { releaseCsmShaderMaterial } from '../engine/lighting.ts';
import {
  disposeObject3DResources,
  registerRetainedObject3DResources,
  releaseObject3DGpuResources,
} from '../engine/resourceLifetime.ts';
import { resolveStructureWindowStyle } from './structureInstanceAppearance.ts';

// Execute the actual material/ownership/shader stage without generating atlas
// pixels or the whole battlefield. Empty buckets are the important case: CSM
// registers these materials even when no child mesh will ever reference them.
const source = await readFile(new URL('./props.ts', import.meta.url), 'utf8');
const start = source.indexOf('  const windowStyle = resolveStructureWindowStyle(mapId);');
const end = source.indexOf('  const buckets: CompletePropsBuckets =', start);
assert.ok(start > 0 && end > start, 'the production props material stage is covered');
assert.match(source, /import \{ registerRetainedObject3DResources \} from '\.\.\/engine\/resourceLifetime\.ts'/,
  'production props imports the same ownership implementation exercised here');
const families = ['plaster', 'plaster2', 'plaster3', 'roofT', 'stone', 'wood',
  'straw', 'structureWood', 'structureCanvas', 'structureMetal', 'vehiclePaint'];
const buildSurfaces = new Function('THREE', 'resolveStructureWindowStyle',
  'registerRetainedObject3DResources', 'makeGrimeTexture', '_mustReplace',
  `return ${stripTypeScriptTypes(`function* testSurfaceSteps(group, engineCtx, mapId, P, atlases) {
    const { ${families.join(', ')} } = atlases;
    const noi = null, aniso = 4;
    const grimeTex = makeGrimeTexture(); // Completed before the material stage.
    ${source.slice(start, end)}
    return { mats, grimeTex, retainedSurfaceMaterials };
  }`)};`)(THREE, resolveStructureWindowStyle, registerRetainedObject3DResources,
  makeTexture, (text, anchor, replacement) => {
    assert.ok(text.includes(anchor), `production shader anchor ${anchor} remains present`);
    return text.replace(anchor, replacement);
  });

function makeTexture() {
  return new THREE.DataTexture(new Uint8Array(4 * 4 * 4).fill(128), 4, 4);
}

function makeFixture(mapId = 'verdant') {
  const atlases = Object.fromEntries(families.map(name => [name, {
    albedo: makeTexture(), normal: makeTexture(), surface: makeTexture(),
  }]));
  const group = new THREE.Group();
  const parent = new THREE.Scene();
  parent.add(group);
  const csm = {
    shaders: new Map(), cascades: 4, fade: true,
    camera: new THREE.PerspectiveCamera(), maxFar: 520, breaks: [0.1, 0.3, 0.6, 1],
    _getExtendedBreaks: CSM.prototype._getExtendedBreaks,
  };
  const engineCtx = {
    setupShadowMaterial(material, extraHook) {
      CSM.prototype.setupMaterial.call(csm, material);
      if (!extraHook) return;
      const csmHook = material.onBeforeCompile;
      material.onBeforeCompile = (shader, renderer) => {
        csmHook(shader, renderer);
        extraHook(shader, renderer);
      };
    },
  };
  const steps = buildSurfaces(group, engineCtx, mapId, {}, atlases);
  let result;
  do { result = steps.next(); } while (!result.done);
  const { mats, grimeTex, retainedSurfaceMaterials } = result.value;
  const materials = Object.values(mats);
  const textures = [...Object.values(atlases).flatMap(Object.values), grimeTex];
  const disposals = new Map();
  for (const resource of [...materials, ...textures]) {
    disposals.set(resource, 0);
    resource.addEventListener('dispose', () => disposals.set(resource, disposals.get(resource) + 1));
  }
  assert.equal(materials.length, 16, 'ownership adds no new surface materials');
  assert.equal(textures.length, 34, 'ownership adds no new atlas or grime textures');
  assert.equal(csm.shaders.size, 16, 'every bucket has a real CSM registration, including unused ones');
  assert.equal(group.children.length, 0, 'empty buckets cannot rely on attached mesh discovery');
  return { group, parent, csm, mats, materials, textures, grimeTex, disposals, retainedSurfaceMaterials };
}

function compileSurfaces(fixture) {
  for (const [kind, material] of Object.entries(fixture.mats)) {
    const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader,
      fragmentShader: THREE.ShaderLib.standard.fragmentShader };
    material.onBeforeCompile(shader, null);
    assert.equal(fixture.csm.shaders.get(material), shader);
    if (kind === 'dark' || kind === 'glass') assert.equal(shader.uniforms.uGrime, undefined);
    else assert.equal(shader.uniforms.uGrime.value, fixture.grimeTex,
      'shader recompilation reuses the original world-owned grime texture');
  }
}

function evict(fixture, preserveRoots = []) {
  return disposeObject3DResources(fixture.group, {
    preserveRoots,
    onDispose(kind, resource) {
      if (kind === 'material') assert.equal(releaseCsmShaderMaterial(fixture.csm, resource), true);
    },
  });
}

for (const mapId of ['verdant', 'winter']) {
  const fixture = makeFixture(mapId);
  const images = fixture.textures.map(texture => texture.image);
  const hooks = fixture.materials.map(material => material.onBeforeCompile);
  const geometry = new THREE.BufferGeometry();
  fixture.group.add(new THREE.Mesh(geometry, fixture.mats.plaster));
  compileSurfaces(fixture);
  for (let cycle = 0; cycle < 3; cycle++) {
    const suspended = releaseObject3DGpuResources(fixture.group);
    assert.deepEqual(suspended, { objects: 2, geometries: 1, materials: 16, textures: 34 },
      'attached and declared references are deduplicated during GPU suspension');
    assert.equal(fixture.group.parent, fixture.parent, 'GPU suspension preserves the scene graph');
    assert.equal(fixture.csm.shaders.size, 16, 'suspension preserves shadow registration for resume');
    fixture.textures.forEach((texture, index) => assert.equal(texture.image, images[index],
      'texture backing and sourced in-place replacement identity survive suspension'));
    fixture.materials.forEach((material, index) => assert.equal(material.onBeforeCompile, hooks[index]));
    compileSurfaces(fixture);
  }
  assert.deepEqual(evict(fixture), { objects: 2, geometries: 1, materials: 16, textures: 34 });
  assert.equal(fixture.group.parent, null);
  assert.equal(fixture.csm.shaders.size, 0, 'final eviction clears used AND unused CSM material roots');
  for (const count of fixture.disposals.values()) assert.equal(count, 4,
    'each distinct resource is released exactly once per suspension or final eviction');
}

const empty = makeFixture();
assert.deepEqual(evict(empty), { objects: 1, geometries: 0, materials: 16, textures: 34 },
  'an entirely unused props surface library is still fully released');
assert.equal(empty.csm.shaders.size, 0);

// Streetlamp material is created only when that pool exists, after the initial
// library registration. Append to the live collection: replacing the world's
// declaration here would leak unused CSM surfaces and shader-only grime.
assert.match(source, /retainedSurfaceMaterials\.push\(material\)/);
const withLamp = makeFixture();
const lamp = withLamp.mats.baked.clone();
CSM.prototype.setupMaterial.call(withLamp.csm, lamp);
withLamp.retainedSurfaceMaterials.push(lamp);
let lampDisposals = 0;
lamp.addEventListener('dispose', () => lampDisposals++);
assert.deepEqual(evict(withLamp), { objects: 1, geometries: 0, materials: 17, textures: 34 });
assert.equal(withLamp.csm.shaders.size, 0, 'late lamp keeps all earlier CSM owners and grime cleanup');
assert.equal(lampDisposals, 1);

const shared = makeFixture();
const survivor = new THREE.Group();
registerRetainedObject3DResources(survivor, {
  materials: [shared.mats.plaster], textures: [shared.grimeTex],
});
assert.deepEqual(evict(shared, [survivor]),
  { objects: 1, geometries: 0, materials: 15, textures: 30 },
  'resources declared by a live owner remain resident when another world is evicted');
assert.equal(shared.csm.shaders.size, 1);
assert.equal(shared.disposals.get(shared.grimeTex), 0);
assert.equal(shared.disposals.get(shared.mats.plaster), 0);
assert.deepEqual(disposeObject3DResources(survivor, {
  onDispose(kind, resource) { if (kind === 'material') releaseCsmShaderMaterial(shared.csm, resource); },
}), { objects: 1, geometries: 0, materials: 1, textures: 4 });
assert.equal(shared.csm.shaders.size, 0);
for (const count of shared.disposals.values()) assert.equal(count, 1);

console.log('propsResources self-test passed: fixed 16-material/34-texture ownership, empty buckets, CSM eviction, suspend/resume and shared roots');
