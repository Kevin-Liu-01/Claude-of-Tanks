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
  // material's near reach (uCotNearReach), v23 — and its gate lift (uCotGateLift), v24 — and its inside fade, v25 —
  // the card's shrink applied after the wind
  const foliage = registered.filter(material => material.customProgramCacheKey().startsWith('world-tree-foliage-v25'));
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
  assert.equal(parameters.uniforms.uCotInsideFade?.value, 0, 'a crown never leaves whole');
  // trees round 4 (the gauntlet's wave 84: the dolly's bush drawn in specks with the camera just inside its rim): a
  // crown's card shrinks to its centre over its own window about its gate; a shrub's card is whole or gone, at its gate,
  // by the camera's distance and by the camera's depth into its rim (checkShrubInside: the camera inside a shrub)
  assert.match(vertex, /float cotThin = step\( length\( cotCam \) \* uCotShrubThin, aCard\.w \);\s*cotShrinkF = uCotInsideFade > 0\.5\s*\? step\( cotGate, cotKeep \) \* \( 1\.0 - step\( 1\.0, cotIn \+ cotGate \) \) \* mix\( step\( 0\.5, fract\( cotHash \* 7\.13 \) \) \* 1\.25, 1\.0, cotThin \)\s*: smoothstep\( cotGate - 0\.1, cotGate \+ 0\.1, cotKeep \);/,
    'a crown\'s card shrinks at its own threshold, a shrub\'s leaves whole (and a small far shrub keeps half its clusters)');
  assert.equal(parameters.uniforms.uCotShrubThin?.value, 0, 'a crown never thins');
  // trees round 4 (the gauntlet's wave 84: a sliver left in the sky by the dolly's vanished bush): the factor is found
  // after the turn and applied after the wind — the wind moves each corner by its own flex, and a card collapsed ahead
  // of it was stretched back out into a sliver; after it, a collapsed card is a point
  const factor = vertex.indexOf('cotShrinkF = uCotInsideFade > 0.5'), shrink = vertex.indexOf('transformed = aCard.xyz + ( transformed - aCard.xyz ) * cotShrinkF;');
  assert.ok(turn < factor && factor < vertex.indexOf('float lean = uWind.x'), 'the factor after the turn, before the wind');
  assert.ok(shrink > vertex.lastIndexOf('transformed.y += fl * 0.3') && shrink < vertex.indexOf('#include <project_vertex>'), 'the shrink after the wind, before the projection');
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
    const foliage = registered.filter(material => material.customProgramCacheKey().startsWith('world-tree-foliage-v25'));
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
    const crown = registered.find(m => m !== bush.material && m.customProgramCacheKey?.() === 'world-tree-foliage-v25'
      && m.map?.name === 'sprayAtlas:oak');
    assert.ok(crown && bush.material !== crown, 'the shrubs draw with their own material, beside their slot\'s crowns\'');
    // trees round 5 (the gauntlet's wave 98: the near bush's "lobed leaf cards two to four times life size"): on their own
    // atlas — the slot's sprays at a shrub's leaf size, their stems on its last tile — at twice the crowns' texels, which
    // their shadow caster reads too
    assert.equal(bush.material.map?.name, 'shrubAtlas:oak', 'the shrubs paint their own atlas');
    assert.equal(bush.material.map.image.width, crown.map.image.width * 2, 'at twice the crowns\' texels');
    assert.equal(bush.customDepthMaterial?.map, bush.material.map, 'their shadow caster reads it');
    assert.equal(bush.material.customProgramCacheKey(), 'world-tree-foliage-v25', 'on the one foliage program');
    assert.deepEqual(bush.material.defines, crown.defines, 'with the crown material\'s defines (the facing clusters, the edge fade)');
    const shrubProgram = environment.expand(bush.material), crownProgram = environment.expand(crown);
    assert.equal(shrubProgram.key, crownProgram.key, 'the same program as the crowns\'');
    assert.equal(shrubProgram.parameters.uniforms.uCotNearReach.value, 0.5, 'the shrub\'s near reach');
    assert.equal(shrubProgram.parameters.uniforms.uCotGateLift.value, 0.75, 'and its clusters leave from the top down');
    assert.equal(shrubProgram.parameters.uniforms.uCotInsideFade.value, 1, 'and it leaves whole with the camera inside it');
    assert.equal(shrubProgram.parameters.uniforms.uCotShrubThin.value, 0.011, 'and a small far shrub thins (FOLIAGE_SHRUB_THIN)');
    assert.equal(bush.material.userData.cotShrubThin, shrubProgram.parameters.uniforms.uCotShrubThin, 'the probe reaches the thinning');
    assert.equal(crownProgram.parameters.uniforms.uCotNearReach.value, 1, 'the crowns keep theirs');
  } finally {
    vegetation.dispose(); disposeObject3DResources(vegetation.group);
    for (const material of registered) releaseCsmShaderMaterial(lighting.csm, material);
    lighting.csm.remove(); lighting.csm.dispose();
  }
}

// trees round 4 (the gauntlet's wave 84: the Frontier dolly's camera inside its field bush — "a stray foliage-green
// sliver floats in the open sky" at dolly-3, specks at dolly-4): with the camera inside a shrub not a pixel of that shrub
// is drawn, and no shrub draws a fragment — a card shrunken short of whole, or collapsed and stretched back out — so
// none of a neighbour's hangs over the camera. A mirror of the shrub program's vertex path (the turn, the near dissolve,
// the gate, the inside fade, the wind, the shrink), each expression it mirrors pinned to the program's text, run on the
// production shrubs (their grown geometry, their placements' frames, their material's uniforms). The case's control is
// the same mirror under the laws that drew the wave: the shrink ahead of the wind (v24: slivers), and the shrink after
// it with the cards shrinking over their windows (specks at the rim).
function checkShrubInside(environment) {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(55, 1.6, .5, 4000);
  const lighting = createLighting(scene, camera, new THREE.Vector3(1, 1, 1).normalize());
  const registered = [];
  const engine = { renderer: stubRenderer(), scene, setupShadowMaterial(material, hook) { registered.push(material); return lighting.setupShadowMaterial(material, hook); } };
  const cfg = { vegetation: { species: ['oak', 'pine'], clusterCount: 0, loneCount: 0, rimCount: 0, grassDensity: 0, bushCount: 60, belts: [], authoredTrees: [] } };
  const vegetation = createVegetation(createHeightField(1337), engine, 1337, cfg);
  try {
    const bushes = vegetation.group.children.filter(m => m.userData.bush === true && m.count > 0);
    assert.ok(bushes.length > 0, 'the shrubs are planted');
    const { parameters } = environment.expand(bushes[0].material), vertex = parameters.vertexShader, u = parameters.uniforms;
    // the program the mirror follows, expression by expression
    for (const [pattern, what] of [
      [/vCotNearScale = mix\( 0\.45, 1\.0, smoothstep\( 1\.6, 3\.6, aCard\.w \* length\( instanceMatrix\[ 0 \]\.xyz \) \) \) \* uCotNearReach;/, 'the band by the crown\'s size'],
      [/vec3 cotCam = - \( transpose\( mat3\( modelViewMatrix \) \) \* modelViewMatrix\[ 3 \]\.xyz \) - instanceMatrix\[ 3 \]\.xyz;\s*cotCam = vec3\( dot\( cotIm\[ 0 \], cotCam \) \/ dot\( cotIm\[ 0 \], cotIm\[ 0 \] \), dot\( cotIm\[ 1 \], cotCam \) \/ dot\( cotIm\[ 1 \], cotIm\[ 1 \] \),\s*dot\( cotIm\[ 2 \], cotCam \) \/ dot\( cotIm\[ 2 \], cotIm\[ 2 \] \) \);/, 'the camera in the instance frame'],
      [/vec3 cotRight = cross\( aAxis, cotCam - aCard\.xyz \);\s*float cotRightL = length\( cotRight \);\s*if \( cotRightL > 1e-4 \) \{\s*vec3 cotFacing = aCard\.xyz \+ cotRight \* \( aLeaf\.x \/ cotRightL \) \+ aAxis \* aLeaf\.y - vec3\( 0\.0, aLeaf\.z, 0\.0 \);\s*transformed = mix\( transformed, cotFacing, COT_LEAF_BILLBOARD \);/, 'the turn'],
      [/float cotNear = length\( cotCam - aCard\.xyz \) \* length\( cotIm\[ 0 \] \);\s*float cotKeep = smoothstep\( 2\.50 \* vCotNearScale, 8\.00 \* vCotNearScale, cotNear \);/, 'the near dissolve'],
      [/float cotHash = fract\( sin\( dot\( aCard\.xyz \+ instanceMatrix\[ 3 \]\.xyz, vec3\( 12\.9898, 78\.233, 37\.719 \) \) \) \* 43758\.5453 \);\s*float cotGate = 0\.1 \+ 0\.8 \* mix\( cotHash, clamp\( aCard\.y \/ \( 1\.5 \* aCard\.w \), 0\.0, 1\.0 \), uCotGateLift \);/, 'the gate'],
      [/float cotIn = uCotInsideFade \* \( 1\.0 - smoothstep\( 0\.94, 1\.04, length\( cotCam\.xz \) \/ max\( aCard\.w, 1e-3 \) \) \)\s*\* \( 1\.0 - smoothstep\( 1\.4, 1\.8, cotCam\.y \/ max\( aCard\.w, 1e-3 \) \) \);/, 'the inside fade'],
      [/float cotThin = step\( length\( cotCam \) \* uCotShrubThin, aCard\.w \);\s*cotShrinkF = uCotInsideFade > 0\.5\s*\? step\( cotGate, cotKeep \) \* \( 1\.0 - step\( 1\.0, cotIn \+ cotGate \) \) \* mix\( step\( 0\.5, fract\( cotHash \* 7\.13 \) \) \* 1\.25, 1\.0, cotThin \)\s*: smoothstep\( cotGate - 0\.1, cotGate \+ 0\.1, cotKeep \);/, 'the shrink factor'],
      [/vec4 tiw = instanceMatrix \* vec4\(0\.0, 0\.0, 0\.0, 1\.0\);/, 'the wind\'s station'],
      [/float ph = fract\(sin\(tiw\.x \* 12\.9898 \+ tiw\.z \* 78\.233\) \* 43758\.5453\) \* 6\.2831853;/, 'the tree\'s phase'],
      [/float front = 0\.5 \+ 0\.5 \* sin\(uWindTime \* 0\.42 - dot\(tiw\.xz, uWindDir\) \* 0\.018\);\s*float gust = 0\.30 \+ 0\.70 \* front \* \(0\.55 \+ 0\.45 \* sin\(uWindTime \* 1\.31 \+ ph\)\);/, 'the gust'],
      [/float lean = uWind\.x \* gust \* \(0\.70 \+ 0\.30 \* sin\(uWindTime \* 1\.15 \+ ph\) \+ 0\.12 \* sin\(uWindTime \* 2\.63 \+ ph \* 1\.7\)\);\s*float hn = clamp\(transformed\.y \* uWind\.y, 0\.0, 1\.0\);\s*vec2 leanDir = uWindDir \+ vec2\(-uWindDir\.y, uWindDir\.x\) \* \(0\.22 \* sin\(uWindTime \* 0\.97 \+ ph \* 1\.3\)\);/, 'the lean'],
      [/float fph = \(aFlex \* 53\.17 \+ \(position\.x \* 0\.37 \+ position\.z \* 0\.53\) \* 0\.05\) \* 6\.2831853;\s*float fl = aFlex \* uWind\.z \* \(0\.45 \+ 0\.55 \* gust\);\s*transformed\.xz \+= leanDir \* \(lean \* hn \* hn\);\s*transformed\.x \+= fl \* \(sin\(uWindTime \* 3\.1 \+ fph\) \+ 0\.5 \* sin\(uWindTime \* 5\.3 \+ fph \* 1\.9\)\);\s*transformed\.z \+= fl \* 0\.7 \* cos\(uWindTime \* 2\.6 \+ fph \* 1\.3\);\s*transformed\.y \+= fl \* 0\.3 \* sin\(uWindTime \* 4\.3 \+ fph \* 0\.7\);/, 'the flutter'],
      [/#ifdef COT_LEAF_BILLBOARD\s*(?:\/\/[^\n]*\n\s*)*transformed = aCard\.xyz \+ \( transformed - aCard\.xyz \) \* cotShrinkF;\s*#endif/, 'the shrink'],
    ]) assert.match(vertex, pattern, `the mirror follows the program: ${what}`);
    const billboard = Number(bushes[0].material.defines.COT_LEAF_BILLBOARD);
    const reach = u.uCotNearReach.value, lift = u.uCotGateLift.value, inside = u.uCotInsideFade.value, wind = u.uWind.value, dir = u.uWindDir.value;
    const thin = u.uCotShrubThin.value;
    assert.equal(inside, 1, 'the shrub material leaves whole');
    assert.ok(wind.z > 0.05 && wind.x > 0, `the wind moves the cards (${wind.toArray()})`);
    const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
    const fract = x => x - Math.floor(x);
    // one vertex through the program: its world position and its card's factor, under `law` — 'program', 'v24' (the
    // factor of v24 — the cards shrinking over their windows and the whole shrub with the camera inside — applied ahead
    // of the wind) or 'window' (v24's factor applied after the wind)
    const out = [0, 0, 0, 0];
    const arrays = new Map();
    const shrubArrays = geometry => {
      if (!arrays.has(geometry)) {
        const at = name => { const attribute = geometry.attributes[name]; assert.ok(attribute && !attribute.isInterleavedBufferAttribute && !attribute.normalized, name); return attribute.array; };
        arrays.set(geometry, { p: at('position'), c: at('aCard'), x: at('aAxis'), l: at('aLeaf'), f: at('aFlex'), index: geometry.index.array });
      }
      return arrays.get(geometry);
    };
    function vertexPath(g, e, vi, cam, time, law) {
      const v3 = vi * 3, v4 = vi * 4;
      const px = g.p[v3], py = g.p[v3 + 1], pz = g.p[v3 + 2], cx = g.c[v4], cy = g.c[v4 + 1], cz = g.c[v4 + 2], cw = g.c[v4 + 3];
      let tx = px, ty = py, tz = pz, f = 1;
      const len0 = Math.hypot(e[0], e[1], e[2]), scale = (0.45 + 0.55 * ss(1.6, 3.6, cw * len0)) * reach;
      const ax = g.x[v3], ay = g.x[v3 + 1], az = g.x[v3 + 2];
      if (ax * ax + ay * ay + az * az > 0.5) {
        const dx = cam.x - e[12], dy = cam.y - e[13], dz = cam.z - e[14];
        const qx = (e[0] * dx + e[1] * dy + e[2] * dz) / (e[0] * e[0] + e[1] * e[1] + e[2] * e[2]);
        const qy = (e[4] * dx + e[5] * dy + e[6] * dz) / (e[4] * e[4] + e[5] * e[5] + e[6] * e[6]);
        const qz = (e[8] * dx + e[9] * dy + e[10] * dz) / (e[8] * e[8] + e[9] * e[9] + e[10] * e[10]);
        const vx = qx - cx, vy = qy - cy, vz = qz - cz;
        const rx = ay * vz - az * vy, ry = az * vx - ax * vz, rz = ax * vy - ay * vx, rl = Math.hypot(rx, ry, rz);
        if (rl > 1e-4) {
          const lx = g.l[v3], ly = g.l[v3 + 1], lz = g.l[v3 + 2];
          tx += (cx + rx * (lx / rl) + ax * ly - tx) * billboard; ty += (cy + ry * (lx / rl) + ay * ly - lz - ty) * billboard; tz += (cz + rz * (lx / rl) + az * ly - tz) * billboard;
        }
        const keep = ss(2.5 * scale, 8.0 * scale, Math.hypot(vx, vy, vz) * len0);
        const hash = fract(Math.sin((cx + e[12]) * 12.9898 + (cy + e[13]) * 78.233 + (cz + e[14]) * 37.719) * 43758.5453);
        const gate = 0.1 + 0.8 * (hash + (Math.min(1, Math.max(0, cy / (1.5 * cw))) - hash) * lift);
        const cotIn = inside * (1 - ss(0.94, 1.04, Math.hypot(qx, qz) / Math.max(cw, 1e-3))) * (1 - ss(1.4, 1.8, qy / Math.max(cw, 1e-3)));
        f = law === 'program'
          ? (inside > 0.5 ? (keep < gate ? 0 : 1) * (1 - (cotIn + gate < 1 ? 0 : 1))
            * (cw < Math.hypot(qx, qy, qz) * thin ? (fract(hash * 7.13) < 0.5 ? 0 : 1) * 1.25 : 1) : ss(gate - 0.1, gate + 0.1, keep))
          : ss(gate - 0.1, gate + 0.1, keep) * (1 - cotIn);
      }
      if (law === 'v24') { tx = cx + (tx - cx) * f; ty = cy + (ty - cy) * f; tz = cz + (tz - cz) * f; }
      const ph = fract(Math.sin(e[12] * 12.9898 + e[14] * 78.233) * 43758.5453) * 6.2831853;
      const front = 0.5 + 0.5 * Math.sin(time * 0.42 - (e[12] * dir.x + e[14] * dir.y) * 0.018);
      const gust = 0.30 + 0.70 * front * (0.55 + 0.45 * Math.sin(time * 1.31 + ph));
      const lean = wind.x * gust * (0.70 + 0.30 * Math.sin(time * 1.15 + ph) + 0.12 * Math.sin(time * 2.63 + ph * 1.7));
      const hn = Math.min(1, Math.max(0, ty * wind.y)), sway = 0.22 * Math.sin(time * 0.97 + ph * 1.3);
      const flex = g.f[vi], fph = (flex * 53.17 + (px * 0.37 + pz * 0.53) * 0.05) * 6.2831853;
      const fl = flex * wind.z * (0.45 + 0.55 * gust);
      tx += (dir.x - dir.y * sway) * lean * hn * hn + fl * (Math.sin(time * 3.1 + fph) + 0.5 * Math.sin(time * 5.3 + fph * 1.9));
      tz += (dir.y + dir.x * sway) * lean * hn * hn + fl * 0.7 * Math.cos(time * 2.6 + fph * 1.3);
      ty += fl * 0.3 * Math.sin(time * 4.3 + fph * 0.7);
      if (law !== 'v24') { tx = cx + (tx - cx) * f; ty = cy + (ty - cy) * f; tz = cz + (tz - cz) * f; }
      out[0] = e[0] * tx + e[4] * ty + e[8] * tz + e[12]; out[1] = e[1] * tx + e[5] * ty + e[9] * tz + e[13];
      out[2] = e[2] * tx + e[6] * ty + e[10] * tz + e[14]; out[3] = f;
      return out;
    }
    // a shrub's cards under one camera: the drawn area (m², the triangles' world areas), the fragments (cards drawn short
    // of whole: a factor strictly between 0 and 1, or a collapsed card left with area) and those reaching over the eye
    const a = [0, 0, 0], b = [0, 0, 0];
    function shrubCards(geometry, e, cam, time, law) {
      const g = shrubArrays(geometry), index = g.index, r = { area: 0, cards: 0, fragments: 0, overEye: 0 };
      for (let t = 0; t < index.length; t += 6) { // a card: two triangles over four welded corners
        let area = 0, fMin = 1, fMax = 0, top = -Infinity;
        for (let k = t; k < t + 6; k += 3) {
          vertexPath(g, e, index[k], cam, time, law); a[0] = out[0]; a[1] = out[1]; a[2] = out[2]; fMin = Math.min(fMin, out[3]); fMax = Math.max(fMax, out[3]); top = Math.max(top, out[1]);
          vertexPath(g, e, index[k + 1], cam, time, law); b[0] = out[0] - a[0]; b[1] = out[1] - a[1]; b[2] = out[2] - a[2]; top = Math.max(top, out[1]);
          vertexPath(g, e, index[k + 2], cam, time, law); top = Math.max(top, out[1]);
          const c0 = out[0] - a[0], c1 = out[1] - a[1], c2 = out[2] - a[2];
          area += 0.5 * Math.hypot(b[1] * c2 - b[2] * c1, b[2] * c0 - b[0] * c2, b[0] * c1 - b[1] * c0);
        }
        assert.equal(fMin, fMax, 'a card leaves as one');
        r.area += area; if (area > 0) r.cards++;
        const fragment = (fMax > 0 && fMax < 1) || (fMax === 0 && area > 0);
        if (fragment) { r.fragments++; if (top > cam.y) r.overEye++; }
      }
      return r;
    }
    const instances = [];
    for (const mesh of bushes) for (let i = 0; i < mesh.count; i++) { const m = new THREE.Matrix4(); mesh.getMatrixAt(i, m); instances.push({ geometry: mesh.geometry, e: m.elements }); }
    assert.ok(instances.length >= 40, `the planted shrubs (${instances.length})`);
    // twelve hosts and four neighbour kinds, spread over the planting (both variants, every scale)
    const pick = (count, phase) => Array.from({ length: count }, (_, i) => Math.floor((i + phase) * instances.length / count));
    const hosts = pick(12, 0), neighbours = pick(4, 0.5);
    const times = [0, 11.2], cam = new THREE.Vector3();
    // the camera at a point of a shrub's own frame: across its radius and its height (the crown radius aCard.w), inside
    // the rim (to 0.95 of the radius) and under its top (1.4 radii); the dolly's frames among them (dolly-4 at 0.76 of the
    // radius, dolly-3 at 0.947 — the twentieth of the rim the wave's sliver came from — both 1.05 radii up)
    const placeCamera = (e, w, r, angle, y) => {
      const lx = r * w * Math.cos(angle), ly = y * w, lz = r * w * Math.sin(angle);
      return cam.set(e[0] * lx + e[4] * ly + e[8] * lz + e[12], e[1] * lx + e[5] * ly + e[9] * lz + e[13], e[2] * lx + e[6] * ly + e[10] * lz + e[14]);
    };
    const control = { v24: 0, window: 0, windowRim: 0, nbFragments: 0, nbOverEye: 0 };
    let poses = 0, neighbourCards = 0, neighbourDrawn = 0;
    const neighbourMatrix = new Float32Array(16);
    for (const h of hosts) {
      const host = instances[h], w = host.geometry.attributes.aCard.getW(0);
      for (const r of [0, 0.5, 0.763, 0.947]) for (let k = 0; k < 8; k += 2) for (const y of [0.3, 0.7, 1.05, 1.3]) {
        placeCamera(host.e, w, r, k * Math.PI / 4, y);
        for (const time of times) {
          poses++;
          const own = shrubCards(host.geometry, host.e, cam, time, 'program');
          assert.equal(own.area, 0, `the camera inside a shrub draws none of it (shrub ${h}, ${r} of its radius, ${y} radii up, t ${time}: ${own.cards} cards drawn)`);
          if (shrubCards(host.geometry, host.e, cam, time, 'v24').area > 0) control.v24++;
          const windowed = shrubCards(host.geometry, host.e, cam, time, 'window');
          if (windowed.area > 0) { control.window++; if (r === 0.947) control.windowRim++; }
        }
        // the neighbours: every other kind of planted shrub, in its own frame and scale, standing round the camera from
        // half a metre to eight metres off (through the near band of every size) on the host's ground
        if ((r !== 0 && r !== 0.947) || k % 4 || (y !== 0.7 && y !== 1.05)) continue;
        for (const n of neighbours) {
          if (n === h) continue;
          const nb = instances[n];
          for (const d of [0.5, 1.5, 2.5, 3.5, 5, 8]) for (let q = 0; q < 2; q++) {
            neighbourMatrix.set(nb.e);
            const phi = q * Math.PI + 0.4 + 0.7 * k;
            neighbourMatrix[12] = cam.x + d * Math.cos(phi); neighbourMatrix[13] = host.e[13]; neighbourMatrix[14] = cam.z + d * Math.sin(phi);
            const time = times[(n + q) % times.length];
            const near = shrubCards(nb.geometry, neighbourMatrix, cam, time, 'program');
            assert.equal(near.fragments, 0, `no neighbour draws a fragment (shrub ${n} ${d} m off the camera inside shrub ${h}: ${near.fragments}, ${near.overEye} over the eye)`);
            neighbourCards += nb.geometry.index.count / 6; neighbourDrawn += near.cards;
            const old = shrubCards(nb.geometry, neighbourMatrix, cam, time, 'window');
            control.nbFragments += old.fragments; control.nbOverEye += old.overEye;
          }
        }
      }
    }
    // trees round 4 (the cost hold): a shrub small on the screen (its crown radius under uCotShrubThin of its distance)
    // draws half its clusters, each whole at 1.25 times its size; nearer, every cluster whole
    assert.ok(thin > 0.005 && thin < 0.02, `the thinning's angle (${thin})`);
    for (const h of hosts) {
      const host = instances[h], w = host.geometry.attributes.aCard.getW(0);
      for (const [k, thinned] of [[0.5, false], [2, true]]) {
        // along the shrub's own x axis, k × the distance where its radius meets the angle (the instance frame's units)
        placeCamera(host.e, w, k * 1 / thin, 0, 0.5);
        const g = shrubArrays(host.geometry), index = g.index;
        let drawn = 0, cards = 0;
        for (let t = 0; t < index.length; t += 6) {
          vertexPath(g, host.e, index[t], cam, 0, 'program');
          cards++;
          if (out[3] > 0) { drawn++; assert.equal(out[3], thinned ? 1.25 : 1, 'a drawn cluster is whole (1.25 times its size when thinned)'); }
        }
        if (thinned) assert.ok(drawn > cards * 0.25 && drawn < cards * 0.75, `a small far shrub keeps about half its clusters (${drawn} of ${cards})`);
        else assert.equal(drawn, cards, 'a shrub big on the screen keeps every cluster');
      }
    }
    // the control: the laws that drew the wave fail the same case — the shrink ahead of the wind leaves the shrub the camera
    // stands in as slivers, the windows leave it in specks at its rim and neighbours in fragments over the camera
    assert.ok(control.v24 > poses * 0.5, `v24's law draws slivers of the shrub the camera stands in (${control.v24} of ${poses} poses)`);
    assert.ok(control.windowRim > 0 && control.window === control.windowRim, `the windows draw it in specks at the rim alone (${control.windowRim})`);
    assert.ok(control.nbFragments > 0 && control.nbOverEye > 0, `and neighbours in fragments, some over the eye (${control.nbFragments}, ${control.nbOverEye})`);
    assert.ok(neighbourDrawn > neighbourCards * 0.2 && neighbourDrawn < neighbourCards * 0.95, `the neighbours thin, not vanish (${neighbourDrawn} of ${neighbourCards} cards)`);
    return { poses, neighbourCards, neighbourDrawn, control };
  } finally {
    vegetation.dispose(); disposeObject3DResources(vegetation.group);
    for (const material of registered) releaseCsmShaderMaterial(lighting.csm, material);
    lighting.csm.remove(); lighting.csm.dispose();
  }
}

// trees round 4 (the cost hold: Verdant's chase at +1.01 ms over the PR state, the near tier's trunks its largest
// vegetation class): a grown trunk's thin branches (aWoodFine: under GROWTH_WOOD_FINE_R at their base, whole tubes) are
// drawn no farther than the tree's share of GROWTH_WOOD_FINE_FAR from the camera — past it every fine corner sits at
// the instance's origin (its triangles cover nothing), short of it the bark is whole; the stem and the thick limbs at
// every distance. A mirror of the bark program's patch, pinned to its text, on the production trunks.
function checkWoodFine(environment) {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(55, 1.6, .5, 4000);
  const lighting = createLighting(scene, camera, new THREE.Vector3(1, 1, 1).normalize());
  const registered = [];
  const engine = { renderer: stubRenderer(), scene, setupShadowMaterial(material, hook) { registered.push(material); return lighting.setupShadowMaterial(material, hook); } };
  const cfg = { vegetation: { species: ['oak', 'pine', 'birch'], clusterCount: 4, loneCount: 8, rimCount: 0, grassDensity: 0, bushCount: 0, belts: [], authoredTrees: [] } };
  const vegetation = createVegetation(createHeightField(1337), engine, 1337, cfg);
  try {
    const bark = registered.find(m => m.customProgramCacheKey?.() === 'world-tree-bark-v12');
    assert.ok(bark, 'the bark program carries the fine wood and the grazing dissolve (v12)');
    const { parameters } = environment.expand(bark), vertex = parameters.vertexShader;
    // trees lane (2026-10-05, the gauntlet's wave 122: the close trunk "a see-through dotted tube"): the bark dissolves only
    // between the camera's near plane and 1 m — below any distance a pose holds the camera from bark — so a trunk at rest
    // stands solid
    const nearBand = /fadeKeep \*= smoothstep\(([0-9.]+), ([0-9.]+), length\(vViewPosition\)\);/.exec(parameters.fragmentShader);
    assert.ok(nearBand, 'the bark keeps a near dissolve');
    assert.ok(+nearBand[1] >= camera.near && +nearBand[2] <= 1.0, `the bark's near band ${nearBand[1]}-${nearBand[2]} m lies inside 1 m, from the near plane`);
    assert.match(vertex, /attribute float aWoodFine;\nuniform float uCotWoodFineFar;/, 'the tag and the reach reach the vertex stage');
    assert.match(vertex, /if \( aWoodFine > 0\.5 \) \{\s*float cotWoodHash = fract\( sin\( dot\( instanceMatrix\[ 3 \]\.xz, vec2\( 12\.9898, 78\.233 \) \) \) \* 43758\.5453 \);\s*if \( distance\( instanceMatrix\[ 3 \]\.xyz, uCamPos \) > uCotWoodFineFar \* aWoodFine \* \( 0\.85 \+ 0\.3 \* cotWoodHash \) \) transformed = vec3\( 0\.0 \);\s*\}/,
      'fine wood past its tree\'s share of the reach (mid wood past twice it) collapses to the instance origin');
    const collapse = vertex.indexOf('if ( aWoodFine > 0.5 )');
    assert.ok(collapse > vertex.lastIndexOf('transformed.y += fl * 0.3') && collapse < vertex.indexOf('#include <project_vertex>'), 'after the wind, before the projection');
    const far = parameters.uniforms.uCotWoodFineFar?.value;
    assert.equal(far, 80, 'the desktop reach (GROWTH_WOOD_FINE_FAR)');
    assert.equal(bark.userData.cotWoodFineFar?.value, far, 'the probe reaches the reach');
    let trunks = 0;
    const seen = new Set();
    vegetation.group.traverse((mesh) => {
      if (!mesh.isInstancedMesh || !mesh.userData.treeTrunk || mesh.userData.treeLod !== 'near' || seen.has(mesh.geometry)) return;
      seen.add(mesh.geometry);
      const g = mesh.geometry, fine = g.getAttribute('aWoodFine'), index = g.index.array, pos = g.getAttribute('position');
      assert.ok(fine, 'a grown trunk carries the fine-wood tag');
      let fineTris = 0, midTris = 0;
      for (let t = 0; t < index.length; t += 3) {
        const a = fine.getX(index[t]);
        assert.ok(a === fine.getX(index[t + 1]) && a === fine.getX(index[t + 2]) && [0, 1, 2].includes(a), 'the tag takes whole tubes, no triangle half-tagged');
        if (a === 1) fineTris++; else if (a === 2) midTris++;
      }
      const share = fineTris / (index.length / 3), mid = midTris / (index.length / 3);
      assert.ok(share > 0.25 && share < 0.7, `the thin branches a share of the wood (${share.toFixed(2)})`);
      assert.ok(mid < 0.65 && share + mid < 0.9, `the mid limbs a share too, the stem and the scaffolds the rest (${mid.toFixed(2)})`);
      // the mirror: an instance's fine corners at the origin past its share of the reach, every corner kept short of it
      const e = new THREE.Matrix4().makeRotationY(0.7).setPosition(31, 2, -17).elements;
      const hash = ((x) => x - Math.floor(x))(Math.sin(e[12] * 12.9898 + e[14] * 78.233) * 43758.5453), reach = far * (0.85 + 0.3 * hash);
      for (const [d, gone] of [[reach * 0.98, 0], [reach * 1.02, 1], [reach * 2.04, 2]]) {
        const cam = new THREE.Vector3(e[12] + d * 0.6, e[13] + d * 0.8, e[14]);
        let kept = 0, collapsed = 0;
        for (let v = 0; v < pos.count; v++) {
          const tag = fine.getX(v), out = tag > 0.5 && cam.distanceTo(new THREE.Vector3(e[12], e[13], e[14])) > reach * tag;
          if (out) collapsed++; else kept++;
          assert.equal(out, tag > 0.5 && tag <= gone, 'fine wood leaves past the reach, mid wood past twice it, and nothing else');
        }
        assert.ok(gone ? collapsed > 0 && kept > 0 : collapsed === 0, 'the stem and the scaffold limbs stay at every distance');
      }
      trunks++;
    });
    assert.ok(trunks >= 6, `the grown trunks checked (${trunks})`);
    return trunks;
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
      // (round 6, 2026-10-07: the back-lit woods' translucency doubled through this uniform, 0.45 -> 0.9; at most the light itself)
      assert.ok(u.value > 0.2 && u.value <= 1, `the grounded light's transmission (${u.value})`);
      world.scene.userData.lightModel = { mode: 'legacy' }; world.vegetation.update(1 / 60, camera); assert.equal(u.value, 0, 'the legacy rig keeps its fill instead');
      delete world.scene.userData.lightModel;
    }
    checkIndependentEviction(world, other, species);
  }
  checkShrubMaterial(environment);
  const inside = checkShrubInside(environment);
  const woodTrunks = checkWoodFine(environment);
  console.log(`fine wood: ${woodTrunks} grown trunks tagged and their reach pinned`);
  console.log(`shrub inside: ${inside.poses} poses inside ${'the shrubs'}, ${inside.neighbourDrawn} of ${inside.neighbourCards} neighbour cards drawn, control ${JSON.stringify(inside.control)}`);
  // the mobile tier, resolved once and last (the device tier is process state)
  checkMobileFoliage(species, environment);
} finally {
  environment.dispose();
  restoreCanvas();
}
console.log(`vegetationProgramKey self-test passed: ${species.length} authored species, actual hook-expanded GLSL/CSM defines, installed Three complete keys, feature negatives, the round-77b leaf detail and impostor programs, and independent eviction`);
