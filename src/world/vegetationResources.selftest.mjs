import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import * as THREE from 'three';
import { CSM } from 'three/examples/jsm/csm/CSM.js';
import { releaseCsmShaderMaterial } from '../engine/lighting.ts';
import {
  disposeObject3DResources, registerRetainedObject3DResources, releaseObject3DGpuResources,
} from '../engine/resourceLifetime.ts';
import { getMapConfig, MAP_IDS } from './maps/index.ts';

const source = await readFile(new URL('./vegetation.ts', import.meta.url), 'utf8');
const start = source.indexOf('  const foliageTex = {} as Record<Species, THREE.CanvasTexture>;');
const end = source.indexOf('  // r7: 3 near variants + 2 far variants per species', start);
assert.ok(start > 0 && end > start, 'the actual foliage material/ownership stage is exercised');
assert.match(source, /import \{ registerRetainedObject3DResources \} from '\.\.\/engine\/resourceLifetime\.ts'/);
assert.equal((source.match(/shader\.uniforms\.uCanopyDet = \{ value: canopyDetailTex \}/g) || []).length, 2,
  'near and far shaders use the same owned detail texture');
assert.match(source, /m\.customDepthMaterial = foliageDepthMats\[sp\]/,
  'production custom shadow materials are the explicitly owned species materials');
const build = new Function('THREE', 'registerRetainedObject3DResources',
  `return ${stripTypeScriptTypes(`function* testFoliageSurfaces(group, speciesList, engineCtx,
    canopyDetailTex, barkMat, canopyFarMat, SPECIES, grassVariants) {
    const seed = 2001, mulberry32 = () => () => 0.5, palOf = () => ({});
    const foliageWindHook = shader => { shader.uniforms.uCanopyDet = { value: canopyDetailTex }; };
    ${source.slice(start, end)}
    return { foliageTex, foliageMats, foliageDepthMats };
  }`)};`)(THREE, registerRetainedObject3DResources);
const texture = () => new THREE.DataTexture(new Uint8Array(16), 2, 2);

for (const mapId of MAP_IDS) {
  const species = getMapConfig(mapId).vegetation.species;
  const group = new THREE.Group(), parent = new THREE.Scene();
  parent.add(group);
  const detail = texture();
  const bark = new THREE.MeshStandardMaterial({ map: texture(), normalMap: texture() });
  const far = new THREE.MeshStandardMaterial();
  const csm = { shaders: new Map(), cascades: 4, fade: false };
  const engine = {
    setupShadowMaterial(material) { CSM.prototype.setupMaterial.call(csm, material); },
  };
  engine.setupShadowMaterial(bark); engine.setupShadowMaterial(far);
  const grassTextures = [texture(), texture()];
  const grassVariants = grassTextures.map(map => ({
    geo: new THREE.BufferGeometry(), geoFar: new THREE.BufferGeometry(),
    matMid: new THREE.MeshLambertMaterial({ map }), matNear: new THREE.MeshLambertMaterial({ map }),
  }));
  for (const variant of grassVariants) {
    engine.setupShadowMaterial(variant.matMid); engine.setupShadowMaterial(variant.matNear);
  }
  const definitions = Object.fromEntries(species.map(sp => [sp, { tex: texture, texSeed: 1 }]));
  const generator = build(group, species, engine, detail, bark, far, definitions, grassVariants);
  let step;
  do { step = generator.next(); } while (!step.done);
  const { foliageTex, foliageMats, foliageDepthMats } = step.value;
  const mats = [bark, far, ...Object.values(foliageMats), ...Object.values(foliageDepthMats),
    ...grassVariants.flatMap(variant => [variant.matMid, variant.matNear])];
  const textures = [detail, bark.map, bark.normalMap, ...Object.values(foliageTex), ...grassTextures];
  const geometry = new THREE.BufferGeometry();
  const geometries = [geometry, ...grassVariants.flatMap(variant => [variant.geo, variant.geoFar])];
  const counts = new Map();
  for (const resource of [...mats, ...textures, ...geometries]) {
    counts.set(resource, 0);
    resource.addEventListener('dispose', () => counts.set(resource, counts.get(resource) + 1));
  }
  assert.equal(mats.length, 6 + species.length * 2, `${mapId}: unchanged material count`);
  assert.equal(textures.length, 5 + species.length, `${mapId}: unchanged texture count`);
  const mesh = new THREE.Mesh(geometry, foliageMats[species[0]]);
  mesh.customDepthMaterial = foliageDepthMats[species[0]];
  group.add(mesh); // The other species remain completely off-tree.
  const grassMesh = new THREE.Mesh(grassVariants[0].geo, grassVariants[0].matMid);
  group.add(grassMesh); // Variant1 and the near carpet materials stay off-tree.
  const hooks = mats.map(material => material.onBeforeCompile);
  const images = textures.map(value => value.image);
  const expected = { objects: 3, geometries: 5, materials: mats.length, textures: textures.length };
  for (let cycle = 0; cycle < 2; cycle++) {
    grassMesh.geometry = cycle === 0 ? grassVariants[0].geo : grassVariants[0].geoFar;
    assert.deepEqual(releaseObject3DGpuResources(group), expected,
      `${mapId}: GPU release includes active, previously selected and unused LOD resources once`);
    assert.equal(group.parent, parent);
    assert.equal(mesh.customDepthMaterial, foliageDepthMats[species[0]]);
    mats.forEach((material, index) => assert.equal(material.onBeforeCompile, hooks[index]));
    textures.forEach((value, index) => assert.equal(value.image, images[index]));
    assert.equal(csm.shaders.size, 6 + species.length, 'suspension preserves registration for lazy resume');
  }
  assert.deepEqual(disposeObject3DResources(group, {
    onDispose(kind, resource) { if (kind === 'material') releaseCsmShaderMaterial(csm, resource); },
  }), expected, `${mapId}: final eviction releases hidden and visible resources together`);
  assert.equal(csm.shaders.size, 0);
  assert.equal(group.parent, null);
  for (const count of counts.values()) assert.equal(count, 3, 'shared atlas references are deduplicated');
}
console.log(`vegetationResources self-test passed: all ${MAP_IDS.length} biome species libraries, custom depth/detail, selected/unselected grass LODs and exact suspend/eviction budgets`);
