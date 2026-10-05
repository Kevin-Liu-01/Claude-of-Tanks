import assert from 'node:assert/strict';
import * as THREE from 'three';
import { WebGLPrograms } from 'three/src/renderers/webgl/WebGLPrograms.js';
import { createLighting, releaseCsmShaderMaterial } from '../engine/lighting.ts';
import { resolveDeviceTier } from '../engine/quality.ts';
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

// Round 77b (2026-09-26): a recording stand-in for the renderer the far-tier impostor atlas bakes with — its presence
// on the engine context is what creates the impostor material (the bake itself is treeImpostors.selftest's subject).
function stubRenderer() {
  const state = { target: null, color: new THREE.Color(), alpha: 1 };
  return {
    getRenderTarget: () => state.target,
    setRenderTarget(target) { state.target = target; },
    render() {},
    clear() {},
    getClearColor: target => target.copy(state.color),
    getClearAlpha: () => state.alpha,
    setClearColor(color, alpha = 1) { state.color.set(color); state.alpha = alpha; },
    autoClear: true, shadowMap: { autoUpdate: true }, xr: { enabled: false },
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
  const engine = { renderer: stubRenderer(), scene, setupShadowMaterial(material, hook) {
    registered.push(material);
    return lighting.setupShadowMaterial(material, hook);
  } };
  const cfg = { vegetation: { species, clusterCount: 0, loneCount: 0, rimCount: 0,
    grassDensity: 0, bushCount: 0, belts: [], authoredTrees: [] } };
  const vegetation = createVegetation(createHeightField(1337), engine, 1337, cfg);
  const { group } = vegetation;
  // round 77b (2026-09-26): v17 — the leaf-scale detail tile as the cards' normal map (round 77: v16 — the wind
  // law, the per-cluster cascade sample and the leaf translucency); and the far tier's one impostor material
  // trees round 2 (2026-10-03): v20 — the facing clusters (COT_LEAF_BILLBOARD) and the near-dissolve's crown scale;
  // trees round 3b (2026-10-04): v21 — the clusters' near dissolve by whole clusters; trees round 4: v22 — each
  // material's near reach (uCotNearReach), v23 — and its gate lift (uCotGateLift), v24 — and its inside fade
  const foliage = registered.filter(material => material.customProgramCacheKey().startsWith('world-tree-foliage-v24'));
  assert.equal(foliage.length, species.length, 'the complete production species material library exists');
  const impostor = registered.filter(material => material.customProgramCacheKey() === 'world-tree-impostor-v3'); // round 77c: the elevated ring; p2 trees lane: the gust lift
  assert.equal(impostor.length, 1, 'one impostor material per world, registered with the cascades');
  assert.strictEqual(vegetation._treeImpostors?.material, impostor[0]);
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
  return { group, csm, foliageMats, foliageTex, foliageDepthMats, impostor: impostor[0], impostors: vegetation._treeImpostors, vegetation, scene,
    leafTiles: [...new Set(Object.values(foliageMats).map(material => material.normalMap))],
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

// Round 77 (2026-09-26): the vegetation round's mechanisms on the expanded near-card program — the wind law (the
// map wind and the lean / flutter uniforms, the height-squared cantilever), the per-cluster cascade sample (aCard,
// the CSM light read in the vertex stage, the sample pushed toward the sun), the leaf-shadow floor on every
// directional shadow site, the sky under a shaded cluster, and the leaf translucency of canopyLighting.ts.
function checkRound77Mechanisms(parameters) {
  const vertex = parameters.vertexShader, fragment = parameters.fragmentShader;
  for (const name of ['uWindDir', 'uWind', 'uWindTime']) {
    assert.ok(parameters.uniforms[name], `${name} rides on the foliage program`);
    assert.match(vertex, new RegExp(`uniform \\S+ ${name};`), `${name} declared in the vertex stage`);
  }
  assert.match(vertex, /transformed\.xz \+= leanDir \* \(lean \* hn \* hn\);/, 'the trunk leans by the square of its height');
  assert.match(vertex, /float fl = aFlex \* uWind\.z \* \(0\.45 \+ 0\.55 \* gust\);/, 'the canopy flutters by its authored flex');
  assert.match(vertex, /attribute vec4 aCard;/, 'the cards carry their centre and the crown radius');
  assert.match(vertex, /uniform DirectionalLight directionalLights\[ NUM_DIR_LIGHTS \];/, 'the CSM light is read in the vertex stage');
  assert.match(vertex, /worldPosition = vec4\( cotCardW\.xyz \+ cotSunW \* \( cotReach \* 0\.9 \), 1\.0 \);/, 'the cascade sample sits at the cluster, pushed toward the sun');
  assert.ok(vertex.indexOf('worldPosition = vec4( cotCardW.xyz') < vertex.indexOf('#include <shadowmap_vertex>'), 'before the shadow coordinates are taken');
  assert.equal((fragment.match(/cotLeafShadow\( getShadow\( directionalShadowMap\[ i \]/g) || []).length, 3, 'every directional shadow site takes the leaf floor');
  assert.match(fragment, /float cotLeafShadow\( float s \) \{ return mix\( 0\.22, 1\.0, s \); \}/, 'a shaded cluster keeps 22 % of the direct term');
  assert.match(fragment, /float cotLeafSky = mix\( 0\.50, 1\.0, saturate\( \( cotSunVis - 0\.22 \) \/ 0\.78 \) \);/, 'the sky under a shaded cluster falls to 50 %');
  assert.match(fragment, /float canopyBack = pow\( saturate\( dot\( -geometryViewDir, directLight\.direction \) \), 3\.0 \);/, 'leaf translucency against the sun');
  assert.match(fragment, /canopyBack \* 0\.45 \* directLight\.color/, 'at 45 % on the near cards');
  assert.doesNotMatch(vertex, /amp \* \(sin\(uWindTime \* 1\.15 \+ ph\)/, 'the pre-round sway is gone');
}

// p2 trees lane (2026-10-01): the gust read as the crown's tone — the wind law hands its gust to the fragment and the
// canopy albedo lifts ±4 % around the still crown, on the near cards and the impostors; the phones' foliage fragment
// keeps no such term (their varying links away).
// p2 trees lane (2026-10-02): the grown crowns' edge-on fade — the desktop cards carry COT_CARD_EDGE_FADE, their
// coverage falls with the card's derivative face against a view looking up, after the mip give-back and before the
// alpha test
function checkEdgeFade(material, parameters) {
  assert.ok('COT_CARD_EDGE_FADE' in (material.defines ?? {}), 'the desktop grown cards fade edge-on');
  assert.equal(material.defines.COT_GROWN_CROWN, '1.60', 'and pass more of the back light');
  assert.match(parameters.fragmentShader, /float canopyBack = pow\( saturate\( dot\( -geometryViewDir, directLight\.direction \) \), 3\.0 \);\s*#ifdef COT_GROWN_CROWN\s*canopyBack \*= COT_GROWN_CROWN;\s*#endif/,
    'the transmission gain sits on the back-light term only');
  // the leaf transmission (2026-10-02): a Lambert lobe on the leaf's far side, its strength a uniform the vegetation
  // drives from the light model
  assert.match(parameters.fragmentShader, /uniform float uCotLeafTransmission;/);
  assert.match(parameters.fragmentShader, /reflectedLight\.directDiffuse \+= saturate\( -canopyRawNL \) \* uCotLeafTransmission \* directLight\.color \* BRDF_Lambert\( material\.diffuseContribution \);/,
    'light through the leaf when the sun is behind it');
  assert.ok(parameters.uniforms.uCotLeafTransmission && typeof parameters.uniforms.uCotLeafTransmission.value === 'number', 'the transmission uniform is bound');
  const fragment = parameters.fragmentShader;
  assert.match(fragment, /vec3 cotDx = dFdx\( vViewPosition \), cotDy = dFdy\( vViewPosition \);/, 'the derivatives in uniform control flow');
  assert.match(fragment, /vec3 cotFace = normalize\( cross\( cotDx, cotDy \) \);/);
  assert.match(fragment, /float cotUp = smoothstep\( 0\.35, 0\.75, dot\( cotRay, viewMatrix\[ 1 \]\.xyz \) \);\s*if \( cotUp > 0\.0 \) \{/, 'only a view looking up into the crown fades its edge-on cards (and pays for the face)');
  const fade = fragment.indexOf('#ifdef COT_CARD_EDGE_FADE');
  assert.ok(fragment.indexOf('aaMip') < fade && fade < fragment.indexOf('#include <alphatest_fragment>'), 'after the mip give-back, before the alpha test');
  // trees round 2 (2026-10-03): the facing clusters — each card turns about its own axis toward the camera in instance
  // space, ahead of the wind (which then moves the turned card), and a small crown's near dissolve keeps to its size
  assert.equal(material.defines.COT_LEAF_BILLBOARD, '1.00', 'the grown clusters turn all the way to the camera');
  const vertex = parameters.vertexShader;
  assert.match(vertex, /attribute vec3 aAxis;\nattribute vec3 aLeaf;/, 'the billboard frame reaches the vertex stage');
  assert.match(vertex, /vec3 cotRight = cross\( aAxis, cotCam - aCard\.xyz \);/, 'the card turns about its own axis toward the camera');
  const turn = vertex.indexOf('transformed = mix( transformed, cotFacing, COT_LEAF_BILLBOARD );');
  assert.ok(turn > 0 && turn < vertex.indexOf('float lean = uWind.x'), 'the turn comes before the wind law');
  // trees round 3b (2026-10-04, the gauntlet's wave 46: the chase camera's foreground bush "a screen-door mesh"): a grown
  // cluster's near dissolve is geometric — each card's centre against the band by the crown's size, the card shrinking
  // to its centre at a threshold hashed from where it sits — and its fragment takes no near dither (the pixel dissolve
  // stays for a card without the frame: the palms' fronds)
  assert.match(vertex, /float cotNear = length\( cotCam - aCard\.xyz \) \* length\( cotIm\[ 0 \] \);/, 'the card centre\'s distance in world metres');
  assert.match(vertex, /float cotKeep = smoothstep\( 2\.50 \* vCotNearScale, 8\.00 \* vCotNearScale, cotNear \);/, 'the near band by the crown\'s size');
  // trees round 4 (the gauntlet's wave 68: a bush's top cluster left hanging in the sky): the gate leans on the cluster's
  // height in its shrub by the material's lift — a shrub thins from the top down, a crown by the hash alone
  assert.match(vertex, /uniform float uCotGateLift;/, 'the gate lift is a uniform of the material');
  assert.match(vertex, /float cotGate = 0\.1 \+ 0\.8 \* mix\( cotHash, clamp\( aCard\.y \/ \( 1\.5 \* aCard\.w \), 0\.0, 1\.0 \), uCotGateLift \);/,
    'the gate by the hash and the cluster\'s height');
  assert.equal(parameters.uniforms.uCotGateLift?.value, 0, 'a crown leaves by the hash alone');
  // and a shrub the camera stands in leaves whole (the wave-68 dolly: its far top clusters over an emptied heart)
  assert.match(vertex, /uniform float uCotInsideFade;/, 'the inside fade is a uniform of the material');
  assert.match(vertex, /float cotIn = uCotInsideFade \* \( 1\.0 - smoothstep\( 0\.94, 1\.04, length\( cotCam\.xz \) \/ max\( aCard\.w, 1e-3 \) \) \)/,
    'by the camera inside the crown radius in the instance frame');
  assert.match(vertex, /smoothstep\( cotGate - 0\.1, cotGate \+ 0\.1, cotKeep \) \* \( 1\.0 - cotIn \);/, 'every cluster at once');
  assert.equal(parameters.uniforms.uCotInsideFade?.value, 0, 'a crown never leaves whole');
  assert.match(vertex, /transformed = aCard\.xyz \+ \( transformed - aCard\.xyz \) \* smoothstep\( cotGate - 0\.1, cotGate \+ 0\.1, cotKeep \)/,
    'the card shrinks to its centre at its own threshold');
  const shrink = vertex.indexOf('transformed = aCard.xyz + ( transformed - aCard.xyz )');
  assert.ok(turn < shrink && shrink < vertex.indexOf('float lean = uWind.x'), 'after the turn, before the wind');
  assert.match(vertex, /vCotGeoNear = 0\.0;[\s\S]*vCotGeoNear = 1\.0;/, 'only a framed card leaves geometrically');
  assert.match(fragment, /fadeKeep \*= mix\(smoothstep\(2\.50 \* vCotNearScale, 8\.00 \* vCotNearScale, length\(vViewPosition\)\), 1\.0, vCotGeoNear\);/,
    'a framed card\'s fragment takes no near dither; the rest keep the near dissolve by the crown\'s size');
  // trees round 4 (the gauntlet's wave 51: 3b's near shrub "a handful of identical, flat, hard-outlined leaf cutouts"):
  // the band's reach is the material's own uniform over the one program — a crown's whole, a shrub's a third
  assert.match(vertex, /uniform float uCotNearReach;/, 'the reach is a uniform of the material');
  assert.match(vertex, /vCotNearScale = mix\( 0\.45, 1\.0, smoothstep\( 1\.6, 3\.6, aCard\.w \* length\( instanceMatrix\[ 0 \]\.xyz \) \) \) \* uCotNearReach;/,
    'and scales the band by the crown\'s size');
  assert.equal(parameters.uniforms.uCotNearReach?.value, 1, 'a crown keeps the whole band');
}
function checkGustLift(cards, impostor) {
  for (const [name, parameters] of [['cards', cards], ['impostor', impostor]]) {
    assert.match(parameters.vertexShader, /vWindLift = gust - 0\.62;/, `${name}: the gust reaches the fragment`);
    assert.match(parameters.fragmentShader, /diffuseColor\.rgb \*= 1\.0 \+ vWindLift \* 0\.110;/, `${name}: the crown's tone lifts with the gust`);
  }
}
function checkMobileFoliage(species, environment) {
  globalThis.window = { location: { search: '?tier=mobile' }, localStorage: { getItem: () => null } };
  try {
    assert.equal(resolveDeviceTier(), 'mobile');
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(55, 1.6, .5, 4000);
    const lighting = createLighting(scene, camera, new THREE.Vector3(1, 1, 1).normalize());
    const registered = [];
    const engine = { setupShadowMaterial(material, hook) { registered.push(material); return lighting.setupShadowMaterial(material, hook); } };
    const cfg = { vegetation: { species, clusterCount: 0, loneCount: 0, rimCount: 0, grassDensity: 0, bushCount: 0, belts: [], authoredTrees: [] } };
    const vegetation = createVegetation(createHeightField(1337), engine, 1337, cfg);
    const foliage = registered.filter(material => material.customProgramCacheKey().startsWith('world-tree-foliage-v24'));
    assert.equal(foliage.length, species.length, 'the mobile species library exists');
    const fragment = environment.expand(foliage[0]).parameters.fragmentShader;
    assert.doesNotMatch(fragment, /vWindLift \*/, 'the phones keep their foliage fragment: no gust lift');
    assert.ok(!('COT_CARD_EDGE_FADE' in (foliage[0].defines ?? {})), 'the phones keep their cards: no edge-on fade');
    assert.ok(!('COT_GROWN_CROWN' in (foliage[0].defines ?? {})), 'and no transmission gain');
    assert.ok(!('COT_LEAF_BILLBOARD' in (foliage[0].defines ?? {})), 'and no facing clusters');
    assert.doesNotMatch(fragment, /uCotLeafTransmission/, 'and no leaf transmission: their fragment is the one they had');
    vegetation.dispose(); disposeObject3DResources(vegetation.group);
    for (const material of registered) releaseCsmShaderMaterial(lighting.csm, material);
    lighting.csm.remove(); lighting.csm.dispose();
  } finally { delete globalThis.window; }
}

// Round 77b (2026-09-26): the second pass's mechanisms — the leaf-scale detail on the near-card program (the class
// tile as the normal map, its sample shared by the mean-neutral alpha break and leaf-gap shade before the alpha
// test, the tangent frame rebuilt on the authored normal after useAttributeNormal, three's double-sided frame
// compiled out) and the far-tier impostor program (the billboard built in instance space before the wind block, the
// mirrored variant, the two-azimuth dissolve, the mip coverage give-back before the alpha test, the baked normal in
// the capture frame, the far translucency and the same uniforms the lobes carried).
function checkRound77bMechanisms(parameters, world, environment) {
  const vertex = parameters.vertexShader, fragment = parameters.fragmentShader;
  assert.equal(parameters.normalMap, true, 'every species material carries a detail tile as its normal map');
  assert.match(fragment, /vec4 cotLeafDet;/, 'one detail sample shared by the alpha break and the normal');
  assert.match(fragment, /cotLeafDet = texture2D\( normalMap, vNormalMapUv \);/);
  assert.match(fragment, /diffuseColor\.a \*= 0\.72 \+ 0\.56 \* cotLeafDet\.a;/, 'the mean-neutral alpha break');
  assert.match(fragment, /diffuseColor\.rgb \*= 0\.90 \+ 0\.20 \* cotLeafDet\.a;/, 'the mean-neutral leaf-gap shade');
  assert.ok(fragment.indexOf('cotLeafDet = texture2D') < fragment.indexOf('#include <alphatest_fragment>'), 'the break precedes the alpha test');
  assert.match(fragment, /mat3 cotLeafTbn = getTangentFrame\( - vViewPosition, normal, vNormalMapUv \);/, 'the frame is rebuilt on the authored normal');
  assert.ok(fragment.indexOf('normal = normalize( vNormal );\nnonPerturbedNormal = normal;') < fragment.indexOf('mat3 cotLeafTbn'), 'after useAttributeNormal');
  assert.doesNotMatch(fragment, /#include <normal_fragment_maps>\n\s*#endif\n\s*#ifdef USE_NORMALMAP/, 'no duplicate chunk');
  assert.match(fragment, /#else\n\s*#include <normal_fragment_maps>\n\s*#endif/, "three's own perturbation only where no tile is bound");
  assert.match(vertex, /attribute vec4 aCard;/, 'the round-77 cluster sample stays');
  for (const [sp, material] of Object.entries(world.foliageMats)) {
    assert.ok(material.normalMap?.isDataTexture && material.normalMap.name.startsWith('leafDetail:'), `${sp}: a leaf-detail tile`);
    assert.equal(material.normalScale.x, 0.75);
    assert.equal(material.normalMap.repeat.x, 3);
  }
  const impostor = environment.expand(world.impostor).parameters;
  const iv = impostor.vertexShader, ifr = impostor.fragmentShader;
  for (const name of ['uImpNormal', 'uImpRows', 'uImpAtlas', 'uWindDir', 'uWind', 'uWindTime', 'uFocusPos', 'uScopeDist']) {
    assert.ok(impostor.uniforms[name], `${name} rides on the impostor program`);
  }
  assert.equal(impostor.uniforms.uImpRows.value.length, 16);
  assert.match(iv, /attribute float aImpRow;/); assert.match(iv, /attribute vec4 aImpCell;/); // round 77c: .w = the species' elevated row
  assert.match(iv, /uniform vec4 uImpRows\[ 16 \];/);
  assert.match(iv, /float impRow = aImpCell\.x \+ mod\( aImpRow, aImpCell\.z \);/, 'the row from the species base and the variant under the baked count');
  // thirteen species share the sixteen rows: one variant each here; every authored map (≤ 5 species) bakes three
  assert.equal(world.impostors.variants, 1); assert.equal(world.impostors.rows.length, 13);
  assert.match(iv, /transformed = \( transpose\( impRot \) \* impOff \) \/ impS;/, 'the quad is built in instance space');
  assert.ok(iv.indexOf('transformed = ( transpose( impRot )') < iv.indexOf('float ph = fract(sin(tiw.x'), 'before the wind block');
  assert.match(iv, /impAz = mix\( impAz, -impAz, impMir \);/, 'the mirrored variant orbits the other way');
  assert.match(iv, /float impWidth = impCell \* sqrt\( impS\.x \* impS\.x \* impObj\.z \* impObj\.z \+ impS\.z \* impS\.z \* impObj\.x \* impObj\.x \) \/ impXZ;/, 'the crown width seen from the azimuth');
  // round 77c: the elevated ring — the view elevation blends the tile toward the 45° row and tilts the card back
  assert.match(iv, /float impElev = atan\( impRel\.y, max\( impHL, 1e-3 \) \);/, 'the view elevation from the tree base');
  assert.match(iv, /float impWE = impElRow < 0\.0 \? 0\.0 : smoothstep\( 0\.349066, 0\.785398, impElev \);/, 'the 20°–45° blend, none without an elevated row');
  assert.match(iv, /vec3 impUp = vec3\( -impFwd\.x \* sin\( impTilt \), cos\( impTilt \), -impFwd\.z \* sin\( impTilt \) \);/, 'the card tilts back to face the elevated view');
  assert.match(ifr, /vec4 impC = mix\( impA, impB, vImpW \);/, 'two azimuths dissolved by the view angle');
  assert.match(ifr, /if \( vImpWE > 0\.001 \) impC = mix\( impC, mix\( texture2D\( map, vImpUvE0 \), texture2D\( map, vImpUvE1 \), vImpW \), vImpWE \);/, 'the elevated tiles only where the view climbs');
  assert.match(ifr, /vec3 impNw = vImpR \* impN\.x \+ vImpU \* impN\.y \+ vImpF \* impN\.z;/, 'the baked normal in the capture frame');
  assert.match(ifr, /impNw = mix\( impNw, vImpR \* impNE\.x \+ vImpUE \* impNE\.y \+ vImpFE \* impNE\.z, vImpWE \);/, 'the elevated normal in its own frame');
  assert.equal(world.impostors.elevated, false, 'the 13-species world takes no elevated ring (the row cap)');
  assert.ok(ifr.indexOf('min( impMip, 3.5 ) * 0.25') < ifr.indexOf('#include <alphatest_fragment>'), 'the mip coverage give-back precedes the alpha test');
  assert.match(ifr, /canopyBack \* 0\.18 \* directLight\.color/, 'the far translucency, as the lobes had');
  assert.match(ifr, /canopyDiffuseNL = canopyDiffuseNL \* 0\.70 \+ 0\.075;/, 'the matte wrap, as the lobes had');
  assert.equal(world.impostor.alphaTest, 0.5); assert.equal(world.impostor.alphaToCoverage, true);
  assert.strictEqual(world.impostor.map, world.impostors.albedo.texture);
  assert.strictEqual(impostor.uniforms.uImpNormal.value, world.impostors.normal.texture);
}

function checkIndependentEviction(world, other, species) {
  const disposed = new Map();
  // round 77b: the impostor material and its two atlases, and the leaf-detail tiles, are owned like the rest
  const owned = library => [library.detail, library.impostor, library.impostors.albedo.texture, library.impostors.normal.texture,
    ...library.leafTiles, ...Object.values(library.foliageMats), ...Object.values(library.foliageDepthMats),
    ...Object.values(library.foliageTex)];
  for (const library of [world, other]) for (const resource of owned(library)) {
    disposed.set(resource, 0);
    resource.addEventListener('dispose', () => disposed.set(resource, disposed.get(resource) + 1));
  }
  const release = library => disposeObject3DResources(library.group, {
    preserveRoots: library === world ? [other.group] : [],
    onDispose(kind, resource) { if (kind === 'material') releaseCsmShaderMaterial(library.csm, resource); },
  });
  const result = release(world);
  // Full production construction adds four grass materials and their two
  // textures plus the bark albedo/normal pair to the former foliage-only seam;
  // the 2026-09-12 shadow redesign adds the one shared crown shadow-proxy
  // material (shadow-only layer, never compiled for color).
  // Round 77b (2026-09-26): + the one impostor material with its albedo and normal atlases, + one leaf-detail
  // tile per foliage class the species use (broadleaf / conifer / palm here: no autumn palette in this config).
  assert.equal(world.leafTiles.length, 3, 'the thirteen species share three detail tiles');
  assert.equal(result.materials, 7 + species.length * 2 + 1);
  assert.equal(result.textures, 5 + species.length + world.leafTiles.length + 2);
  assert.equal(world.csm.shaders.size, 0);
  assert.equal(other.csm.shaders.size, 6 + species.length + 1);
  for (const resource of owned(other)) {
    assert.equal(disposed.get(resource), 0, 'evicting one world does not dispose the other');
  }
  release(other);
  for (const count of disposed.values()) assert.equal(count, 1);
  assert.equal(other.csm.shaders.size, 0);
  world.csm.remove(); world.csm.dispose();
  other.csm.remove(); other.csm.dispose();
}

// trees round 4 (the gauntlet's wave 51: 3b's near shrub thinned to "a handful of leaf cutouts"): a grown shrub on a map
// without a biome shrub form draws with its own clone of its slot's crown material — the crown's defines and program,
// the shrub's near reach (half the crowns' band)
function checkShrubMaterial(environment) {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(55, 1.6, .5, 4000);
  const lighting = createLighting(scene, camera, new THREE.Vector3(1, 1, 1).normalize());
  const registered = [];
  const engine = { renderer: stubRenderer(), scene, setupShadowMaterial(material, hook) { registered.push(material); return lighting.setupShadowMaterial(material, hook); } };
  const cfg = { vegetation: { species: ['oak'], clusterCount: 0, loneCount: 0, rimCount: 0, grassDensity: 0, bushCount: 40, belts: [], authoredTrees: [] } };
  const vegetation = createVegetation(createHeightField(1337), engine, 1337, cfg);
  try {
    const bush = vegetation.group.children.find(m => m.userData.bush === true && m.count > 0);
    assert.ok(bush, 'the shrubs are planted');
    const crown = registered.find(m => m !== bush.material && m.customProgramCacheKey?.() === 'world-tree-foliage-v24' && m.map === bush.material.map);
    assert.ok(crown && bush.material !== crown, 'the shrubs draw with their own material, beside their slot\'s crowns\'');
    assert.equal(bush.material.customProgramCacheKey(), 'world-tree-foliage-v24', 'on the one foliage program');
    assert.deepEqual(bush.material.defines, crown.defines, 'with the crown material\'s defines (the facing clusters, the edge fade)');
    const shrubProgram = environment.expand(bush.material), crownProgram = environment.expand(crown);
    assert.equal(shrubProgram.key, crownProgram.key, 'the same program as the crowns\'');
    assert.equal(shrubProgram.parameters.uniforms.uCotNearReach.value, 0.5, 'the shrub\'s near reach');
    assert.equal(shrubProgram.parameters.uniforms.uCotGateLift.value, 0.75, 'and its clusters leave from the top down');
    assert.equal(shrubProgram.parameters.uniforms.uCotInsideFade.value, 1, 'and it leaves whole with the camera inside it');
    assert.equal(crownProgram.parameters.uniforms.uCotNearReach.value, 1, 'the crowns keep theirs');
  } finally {
    vegetation.dispose(); disposeObject3DResources(vegetation.group);
    for (const material of registered) releaseCsmShaderMaterial(lighting.csm, material);
    lighting.csm.remove(); lighting.csm.dispose();
  }
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
    checkRound77Mechanisms(rows[0].parameters);
    checkRound77bMechanisms(rows[0].parameters, world, environment);
    checkGustLift(rows[0].parameters, environment.expand(world.impostor).parameters);
    checkEdgeFade(world.foliageMats[species[0]], rows[0].parameters);
    // the transmission follows the scene's light model each frame: the grounded light's strength, nothing under the
    // legacy rig or before a model resolves
    {
      const u = rows[0].parameters.uniforms.uCotLeafTransmission;
      const camera = new THREE.Vector3();
      delete world.scene.userData.lightModel; world.vegetation.update(1 / 60, camera); assert.equal(u.value, 0, 'no model, no transmission');
      world.scene.userData.lightModel = { mode: 'physical' }; world.vegetation.update(1 / 60, camera);
      assert.ok(u.value > 0.2 && u.value < 0.8, `the grounded light's transmission (${u.value})`);
      world.scene.userData.lightModel = { mode: 'legacy' }; world.vegetation.update(1 / 60, camera); assert.equal(u.value, 0, 'the legacy rig keeps its fill instead');
      delete world.scene.userData.lightModel;
    }
    checkIndependentEviction(world, other, species);
  }
  checkShrubMaterial(environment);
  // the mobile tier, resolved once and last (the device tier is process state)
  checkMobileFoliage(species, environment);
} finally {
  environment.dispose();
  restoreCanvas();
}
console.log(`vegetationProgramKey self-test passed: ${species.length} authored species, actual hook-expanded GLSL/CSM defines, installed Three complete keys, feature negatives, the round-77b leaf detail and impostor programs, and independent eviction`);
