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
import { applyRockShaderHook, rockDressingFor } from './rockDressing.ts'; // round 75 item 6: the rock hook's owners
import { applyPoleTimberHook } from './poleTimber.ts'; // the scenery lane: the telegraph poles' hook
// the scenery lane (b14): the dry-stone and mud walls' world-space hooks and their shapes' constants
import { STONE_SETTLE_M, applyStoneWallHook } from './stoneWallShader.ts';
import { MUD_SLUMP_M, applyMudWallHook } from './mudWallShader.ts';
import { applyRailBallastHook } from './railBallast.ts'; // the ground lane (wave 234): the rail kit's ballast hook
import { STRUCTURE_OCCLUSION_EXCLUDED_KINDS } from '../engine/structureOcclusion.ts'; // (2026-10-10, the shadows lane r4: the structures' pixel tag)

// Execute the actual material/ownership/shader stage without generating atlas
// pixels or the whole battlefield. Empty buckets are the important case: CSM
// registers these materials even when no child mesh will ever reference them.
const source = await readFile(new URL('./props.ts', import.meta.url), 'utf8');
const roofStart = source.indexOf('function makeRoofMaterial(');
const roofEnd = source.indexOf('\nfunction buildStoneCourseEdges(', roofStart);
assert.ok(roofStart > 0 && roofEnd > roofStart, 'execute the actual roof material dependency');
const makeRoofMaterial = new Function('THREE',
  `${stripTypeScriptTypes(source.slice(roofStart, roofEnd))}\nreturn makeRoofMaterial;`)(THREE);
const start = source.indexOf('  const windowStyle = resolveStructureWindowStyle(mapId);');
const end = source.indexOf('  const buckets: CompletePropsBuckets =', start);
assert.ok(start > 0 && end > start, 'the production props material stage is covered');
assert.match(source, /import \{ registerRetainedObject3DResources \} from '\.\.\/engine\/resourceLifetime\.ts'/,
  'production props imports the same ownership implementation exercised here');
// Round 75 (2026-09-26): the 'steel' atlas family (propsSteelAtlas.ts) joins the library — 17 materials, 37 textures.
// Round 75 item 6: the boulders' triplanar detail tile ('rockDetail', rockDressing.ts) — 17 materials, 40 textures.
// The scenery lane (2026-10-03): the dry-stone field walls' rubble print ('fieldStone', fieldStoneSurface.ts) — 18
// materials, 43 textures (a map whose walls are mud or brick shares the stone print's three); and the mud walls' worn
// render ('fieldMud', fieldMudSurface.ts) — 19 materials, 46 textures (a map without mud walls shares the plaster's);
// and the boulders' lichen colony tile (rockDetail.lichen, a shader-only texture the world declares) — 47 textures; and
// the sandbags' hessian ('burlap', its weave on the canvas program: the scenery lane, wave 52) — 20 materials, 50 textures;
// and the telegraph poles' timber ('pole', poleTimber.ts: the scenery lane, after wave 57; it samples the grime) — 21;
// and the straw destructibles' hay print ('hay', hayPrint.ts: the scenery lane, b15; the straw's program, the straw
// print kept for the thatched roofs and the reeds) — 22 materials, 53 textures; and the rail kit's crushed-stone bed
// ('ballast', railBallast.ts: the ground lane, wave 234; it samples the grime; the phones keep the bed on the baked
// material, but the material is declared on every tier) — 23 materials, 53 textures.
const families = ['plaster', 'plaster2', 'plaster3', 'roofT', 'stone', 'fieldStone', 'fieldMud', 'wood',
  'straw', 'hay', 'structureWood', 'structureCanvas', 'burlap', 'structureMetal', 'vehiclePaint', 'steel', 'rockDetail'];
const buildSurfaces = new Function('THREE', 'resolveStructureWindowStyle', 'makeRoofMaterial',
  'registerRetainedObject3DResources', 'makeGrimeTexture', '_mustReplace', 'rockDressingFor', 'applyRockShaderHook',
  'applyPoleTimberHook', 'rockStoneMean', 'STONE_SETTLE_M', 'applyStoneWallHook', 'MUD_SLUMP_M', 'applyMudWallHook',
  'applyRailBallastHook', 'STRUCTURE_OCCLUSION_EXCLUDED_KINDS',
  `return ${stripTypeScriptTypes(`function* testSurfaceSteps(group, engineCtx, mapId, P, atlases) {
    const { ${families.join(', ')} } = atlases;
    const noi = null, aniso = 4;
    // a map without a regional architecture kit (maps/regional): the kit's weathered materials stay absent
    const regionalArchitecture = null;
    const grimeTex = makeGrimeTexture(); // Completed before the material stage.
    ${source.slice(start, end)}
    return { mats, grimeTex, retainedSurfaceMaterials };
  }`)};`)(THREE, resolveStructureWindowStyle, makeRoofMaterial, registerRetainedObject3DResources,
  makeTexture, (text, anchor, replacement) => {
    assert.ok(text.includes(anchor), `production shader anchor ${anchor} remains present`);
    return text.replace(anchor, replacement);
  }, rockDressingFor, applyRockShaderHook, applyPoleTimberHook, new THREE.Vector3(0.214, 0.214, 0.214),
  STONE_SETTLE_M, applyStoneWallHook, MUD_SLUMP_M, applyMudWallHook, applyRailBallastHook, STRUCTURE_OCCLUSION_EXCLUDED_KINDS);

function makeTexture() {
  return new THREE.DataTexture(new Uint8Array(4 * 4 * 4).fill(128), 4, 4);
}

function makeFixture(mapId = 'verdant') {
  const atlases = Object.fromEntries(families.map(name => [name, {
    albedo: makeTexture(), normal: makeTexture(), surface: makeTexture(),
    ...(name === 'rockDetail' ? { lichen: makeTexture() } : {}),
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
  assert.equal(mats.roof.map, atlases.roofT.albedo);
  assert.equal(mats.roof.normalMap, atlases.roofT.normal);
  assert.equal(mats.roof.roughnessMap, atlases.roofT.surface);
  assert.equal(mats.roof.aoMap, atlases.roofT.surface);
  assert.equal(mats.roof.roughness, mapId === 'foundry' ? 1.3 : 1,
    'map-specific roof preparation retains the same owned texture identities');
  const materials = Object.values(mats);
  const textures = [...Object.values(atlases).flatMap(Object.values), grimeTex];
  const disposals = new Map();
  for (const resource of [...materials, ...textures]) {
    disposals.set(resource, 0);
    resource.addEventListener('dispose', () => disposals.set(resource, disposals.get(resource) + 1));
  }
  assert.equal(materials.length, 23, 'ownership adds no new surface materials');
  assert.equal(textures.length, 53, 'ownership adds no new atlas or grime textures');
  assert.equal(csm.shaders.size, 23, 'every bucket has a real CSM registration, including unused ones');
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

for (const mapId of ['verdant', 'winter', 'foundry']) {
  const fixture = makeFixture(mapId);
  const images = fixture.textures.map(texture => texture.image);
  const hooks = fixture.materials.map(material => material.onBeforeCompile);
  const geometry = new THREE.BufferGeometry();
  fixture.group.add(new THREE.Mesh(geometry, fixture.mats.plaster));
  compileSurfaces(fixture);
  for (let cycle = 0; cycle < 3; cycle++) {
    const suspended = releaseObject3DGpuResources(fixture.group);
    assert.deepEqual(suspended, { objects: 2, geometries: 1, materials: 23, textures: 53 },
      'attached and declared references are deduplicated during GPU suspension');
    assert.equal(fixture.group.parent, fixture.parent, 'GPU suspension preserves the scene graph');
    assert.equal(fixture.csm.shaders.size, 23, 'suspension preserves shadow registration for resume');
    fixture.textures.forEach((texture, index) => assert.equal(texture.image, images[index],
      'texture backing and sourced in-place replacement identity survive suspension'));
    fixture.materials.forEach((material, index) => assert.equal(material.onBeforeCompile, hooks[index]));
    compileSurfaces(fixture);
  }
  assert.deepEqual(evict(fixture), { objects: 2, geometries: 1, materials: 23, textures: 53 });
  assert.equal(fixture.group.parent, null);
  assert.equal(fixture.csm.shaders.size, 0, 'final eviction clears used AND unused CSM material roots');
  for (const count of fixture.disposals.values()) assert.equal(count, 4,
    'each distinct resource is released exactly once per suspension or final eviction');
}

const empty = makeFixture();
assert.deepEqual(evict(empty), { objects: 1, geometries: 0, materials: 23, textures: 53 },
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
assert.deepEqual(evict(withLamp), { objects: 1, geometries: 0, materials: 24, textures: 53 });
assert.equal(withLamp.csm.shaders.size, 0, 'late lamp keeps all earlier CSM owners and grime cleanup');
assert.equal(lampDisposals, 1);

const shared = makeFixture();
const survivor = new THREE.Group();
registerRetainedObject3DResources(survivor, {
  materials: [shared.mats.plaster], textures: [shared.grimeTex],
});
assert.deepEqual(evict(shared, [survivor]),
  { objects: 1, geometries: 0, materials: 22, textures: 49 },
  'resources declared by a live owner remain resident when another world is evicted');
assert.equal(shared.csm.shaders.size, 1);
assert.equal(shared.disposals.get(shared.grimeTex), 0);
assert.equal(shared.disposals.get(shared.mats.plaster), 0);
assert.deepEqual(disposeObject3DResources(survivor, {
  onDispose(kind, resource) { if (kind === 'material') releaseCsmShaderMaterial(shared.csm, resource); },
}), { objects: 1, geometries: 0, materials: 1, textures: 4 });
assert.equal(shared.csm.shaders.size, 0);
for (const count of shared.disposals.values()) assert.equal(count, 1);

console.log('propsResources self-test passed: fixed 23-material/53-texture ownership, empty buckets, CSM eviction, suspend/resume and shared roots');
