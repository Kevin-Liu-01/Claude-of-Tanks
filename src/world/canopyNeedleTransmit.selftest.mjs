// canopyNeedleTransmit.selftest (GND, 2026-10-15; the Kestrel chase-s blind pair: "the backlit pines glow a saturated
// lime green that does not match the backlight or Scots-pine colour"): a needle crown transmits its needles' own darker,
// duller green (canopyLighting.ts cotCanopyTransmit, NEEDLE_TRANSMIT_SATURATION / NEEDLE_TRANSMIT_LUMINANCE).
// 1. The law: over a grid of linear albedos the transmitted colour's saturation is at most the front-lit albedo's and
//    its luminance NEEDLE_TRANSMIT_LUMINANCE of it; a broadleaf share (0) returns the albedo exactly.
// 2. The shader text: both transmitted terms (the back-lit translucency, the leaf transmission) take cotCanopyTransmit,
//    the front-lit term keeps the albedo, the GLSL helper carries the JS twin's constants; without a needle source the
//    expression is the one it was (the horizon ring, the Hinterland, the phones).
// 3. The materials, expanded through the installed Three program cache with the real cascades: on Kestrel, Saltmere Bay
//    and Longleaf every needle form's cards (the grown form's family: Saltmere's cedar slot grows holm oak, leaves) set
//    uCotNeedle 1 and every leafy crown 0 over the one foliage program; the far tier's impostor quads carry the same
//    share per species; and with the grown crown's gain and the grounded light's leaf transmission at full strength an
//    unshadowed back-lit needle crown never outshines its own front-lit side (it read 2.1x brighter before). No GPU, no
//    art claim.
import assert from 'node:assert/strict';
import { createCanvas, ImageData } from '@napi-rs/canvas';
import * as THREE from 'three';
import { WebGLPrograms } from 'three/src/renderers/webgl/WebGLPrograms.js';
import { createLighting, releaseCsmShaderMaterial } from '../engine/lighting.ts';
import { disposeObject3DResources } from '../engine/resourceLifetime.ts';
import { createHeightField } from './terrain.ts';
import { createVegetation } from './vegetation.ts';
import {
  NEEDLE_TRANSMIT_LUMINANCE, NEEDLE_TRANSMIT_SATURATION, applyCanopyDiffuseWrap, canopyTransmitColour,
} from './canopyLighting.ts';

const luma = c => c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;
const hsvSat = c => { const mx = Math.max(...c), mn = Math.min(...c); return mx > 0 ? (mx - mn) / mx : 0; };
const chroma = c => Math.max(...c) - Math.min(...c);
function hsv(h, s, v) {
  const i = Math.floor(h * 6), f = h * 6 - i, p = v * (1 - s), q = v * (1 - f * s), t = v * (1 - (1 - f) * s);
  return [[v, t, p], [q, v, p], [p, v, t], [p, q, v], [t, p, v], [v, p, q]][i % 6];
}

// ---- 1. the law ----
assert.ok(NEEDLE_TRANSMIT_SATURATION > 0 && NEEDLE_TRANSMIT_SATURATION < 1, 'the needles keep part of their chroma');
assert.ok(NEEDLE_TRANSMIT_LUMINANCE > 0 && NEEDLE_TRANSMIT_LUMINANCE < 1, 'and pass less light than they reflect');
let samples = 0;
for (let h = 0.10; h <= 0.50; h += 0.025) {
  for (let s = 0.05; s <= 0.95; s += 0.1) {
    for (let v = 0.02; v <= 0.62; v += 0.06) {
      const a = hsv(h, s, v), t = canopyTransmitColour(a, 1);
      assert.ok(t.every(c => c >= 0), 'no negative channel');
      assert.ok(hsvSat(t) <= hsvSat(a) + 1e-9, `the transmitted saturation never exceeds the front-lit albedo's (${hsvSat(t).toFixed(3)} > ${hsvSat(a).toFixed(3)})`);
      assert.ok(Math.abs(luma(t) - NEEDLE_TRANSMIT_LUMINANCE * luma(a)) < 1e-9, 'its luminance a fixed share of the albedo\'s');
      assert.ok(luma(t) <= luma(a), 'darker than the front-lit albedo');
      assert.ok(Math.abs(chroma(t) - NEEDLE_TRANSMIT_SATURATION * NEEDLE_TRANSMIT_LUMINANCE * chroma(a)) < 1e-9, 'its chroma pulled toward grey');
      assert.deepEqual(canopyTransmitColour(a, 0), a, 'a broadleaf crown transmits its albedo exactly');
      samples++;
    }
  }
}

// ---- 2. the shader text ----
const front = 'reflectedLight.directDiffuse += canopyDiffuseNL * directLight.color * BRDF_Lambert( material.diffuseContribution );';
{
  const shader = { uniforms: {}, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  applyCanopyDiffuseWrap(shader, 0.38, true, 0.45, { value: 0.45 }, 'uCotNeedle');
  const f = shader.fragmentShader;
  const helper = f.match(/vec3 cotCanopyTransmit\( vec3 albedo, float needle \) \{\s*float l = dot\( albedo, vec3\( 0\.2126, 0\.7152, 0\.0722 \) \);\s*return mix\( albedo, mix\( vec3\( l \), albedo, ([\d.]+) \) \* ([\d.]+), needle \);\s*\}/);
  assert.ok(helper, 'the GLSL transmitted colour');
  assert.equal(Number(helper[1]), NEEDLE_TRANSMIT_SATURATION, 'its saturation share is the JS twin\'s');
  assert.equal(Number(helper[2]), NEEDLE_TRANSMIT_LUMINANCE, 'its luminance share is the JS twin\'s');
  assert.ok(f.indexOf('vec3 cotCanopyTransmit(') < f.indexOf('void RE_Direct_Physical('), 'declared before the direct light uses it');
  assert.ok(f.includes(front), 'the front-lit term keeps the albedo');
  assert.ok(f.includes('vec3 canopyTransmit = cotCanopyTransmit( material.diffuseContribution, uCotNeedle );'), 'the transmitted colour from the needle source');
  assert.ok(f.includes('reflectedLight.directDiffuse += canopyBack * 0.45 * directLight.color * BRDF_Lambert( canopyTransmit );'), 'the back-lit translucency transmits it');
  assert.ok(f.includes('reflectedLight.directDiffuse += saturate( -canopyRawNL ) * uCotLeafTransmission * directLight.color * BRDF_Lambert( canopyTransmit );'), 'and so does the leaf transmission');
  const block = f.slice(f.indexOf('float canopyDiffuseNL'), f.indexOf('RE_IndirectDiffuse_Physical'));
  assert.equal(block.split('BRDF_Lambert( material.diffuseContribution )').length - 1, 1, 'only the front-lit term reads the raw albedo');
  assert.equal(block.split('BRDF_Lambert( canopyTransmit )').length - 1, 2, 'both transmitted terms read the dulled green');
}
for (const [thin, transmission] of [[0.18, null], [0.45, { value: 0.45 }], [0, null]]) {
  const shader = { uniforms: {}, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  applyCanopyDiffuseWrap(shader, 0.38, true, thin, transmission);
  assert.ok(!shader.fragmentShader.includes('cotCanopyTransmit') && !shader.fragmentShader.includes('canopyTransmit'), 'no needle source: the expression it was');
  if (thin > 0) assert.ok(shader.fragmentShader.includes(`canopyBack * ${thin.toFixed(2)} * directLight.color * BRDF_Lambert( material.diffuseContribution );`));
}

// ---- 3. the materials ----
const savedDocument = globalThis.document, savedImageData = globalThis.ImageData;
globalThis.ImageData = ImageData;
globalThis.document = { createElement(tag) { assert.equal(tag, 'canvas'); return createCanvas(1, 1); } };
function stubRenderer() {
  const state = { target: null, color: new THREE.Color(), alpha: 1 };
  return {
    getRenderTarget: () => state.target, setRenderTarget(target) { state.target = target; }, render() {}, clear() {},
    getClearColor: target => target.copy(state.color), getClearAlpha: () => state.alpha,
    setClearColor(color, alpha = 1) { state.color.set(color); state.alpha = alpha; },
    autoClear: true, shadowMap: { autoUpdate: true }, xr: { enabled: false },
  };
}
function programEnvironment() {
  const renderer = {
    getRenderTarget: () => null, state: { buffers: { depth: { getReversed: () => false } } },
    shadowMap: { enabled: true, type: THREE.PCFShadowMap }, toneMapping: THREE.ACESFilmicToneMapping, outputColorSpace: THREE.SRGBColorSpace,
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
  return {
    expand(material) {
      const parameters = programs.getParameters(material, lights, [{}], scene, mesh, []);
      const key = programs.getProgramCacheKey(parameters);
      parameters.uniforms = programs.getUniforms(material);
      material.onBeforeCompile(parameters, renderer);
      return { key, parameters };
    },
    dispose() { programs.dispose(); geometry.dispose(); mesh.material.dispose(); mesh.dispose(); },
  };
}
const num = (source, re, what) => { const m = source.match(re); assert.ok(m, what); return Number(m[1]); };

// the place, its slots, and which slots grow needles there (treeBiomes.ts forms)
const PLACES = [
  { id: 'airfield', species: ['pine', 'birch', 'poplar'], needles: ['pine'] },
  { id: 'saltwind', species: ['cedar', 'acacia', 'pine'], needles: ['pine'] }, // the cedar slot grows holm oak: leaves
  { id: 'longleaf', species: ['pine', 'cedar', 'oak'], needles: ['pine', 'cedar'] },
];
const environment = programEnvironment();
const report = [];
try {
  for (const place of PLACES) {
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(55, 1.6, .5, 4000);
    const lighting = createLighting(scene, camera, new THREE.Vector3(1, 1, 1).normalize());
    const registered = [];
    const engine = { renderer: stubRenderer(), scene, setupShadowMaterial(material, hook) { registered.push(material); return lighting.setupShadowMaterial(material, hook); } };
    const cfg = { id: place.id, vegetation: { species: place.species, clusterCount: 0, loneCount: 0, rimCount: 0, grassDensity: 0, bushCount: 0, belts: [], authoredTrees: [] } };
    const world = createVegetation(createHeightField(1337), engine, 1337, cfg);
    try {
      const foliage = registered.filter(m => m.customProgramCacheKey?.() === 'world-tree-foliage-v25').slice(0, place.species.length);
      assert.equal(foliage.length, place.species.length, `${place.id}: one card material per slot`);
      const rows = foliage.map(m => environment.expand(m));
      for (const [i, sp] of place.species.entries()) {
        const want = place.needles.includes(sp) ? 1 : 0;
        assert.equal(rows[i].parameters.uniforms.uCotNeedle?.value, want, `${place.id}: ${sp} ${want ? 'transmits its needles\' dulled green' : 'keeps its leaves\' translucency'}`);
        assert.equal(rows[i].key, rows[0].key, `${place.id}: ${sp}: the one foliage program`);
        assert.equal(rows[i].parameters.fragmentShader, rows[0].parameters.fragmentShader);
      }
      const f = rows[0].parameters.fragmentShader;
      assert.match(f, /uniform float uCotNeedle;/);
      assert.ok(f.includes('vec3 canopyTransmit = cotCanopyTransmit( material.diffuseContribution, uCotNeedle );'), `${place.id}: the cards transmit through the law`);
      // the far tier: the impostor program reads the quad's share, the quads carry it per species
      const impostor = world._treeImpostors;
      assert.ok(impostor, `${place.id}: the far tier's atlas (the recording renderer)`);
      const ip = environment.expand(impostor.material).parameters;
      assert.ok(ip.fragmentShader.includes('vec3 canopyTransmit = cotCanopyTransmit( material.diffuseContribution, vCotNeedle );'), `${place.id}: the impostors transmit through the law`);
      assert.match(ip.vertexShader, /attribute float aImpNeedle;/); assert.match(ip.vertexShader, /vCotNeedle = aImpNeedle;/);
      for (const sp of place.species) {
        const quad = impostor.quadGeometry(sp, false);
        const share = [...quad.getAttribute('aImpNeedle').array];
        assert.deepEqual(share, new Array(4).fill(place.needles.includes(sp) ? 1 : 0), `${place.id}: ${sp}: the quad's needle share`);
        quad.dispose();
      }
      // the light: the grown gain, the near translucency, the grounded light's leaf transmission at full strength
      scene.userData.lightModel = { mode: 'physical' };
      world.update(1 / 60, new THREE.Vector3());
      const leaf = rows[0].parameters.uniforms.uCotLeafTransmission.value;
      assert.ok(leaf > 0.2, `${place.id}: the grounded light transmits (${leaf})`);
      const wrap = num(f, /float canopyDiffuseNL = saturate\( \( canopyRawNL \+ ([\d.]+) \)/, 'the wrap');
      const recip = num(f, /canopyRawNL \+ [\d.]+ \) \* ([\d.]+) \)/, 'its reciprocal');
      const matte = x => x * 0.70 + 0.075;
      assert.ok(f.includes('canopyDiffuseNL = canopyDiffuseNL * 0.70 + 0.075;'), 'the matte lobe');
      const frontLit = matte(Math.min(1, (1 + wrap) * recip) * recip), backFloor = matte(Math.max(0, (-1 + wrap) * recip) * recip);
      const nearThin = num(f, /canopyBack \* ([\d.]+) \* directLight\.color/, 'the near translucency');
      const grown = Number(foliage[place.species.indexOf(place.needles[0])].defines?.COT_GROWN_CROWN ?? 1);
      const farThin = num(ip.fragmentShader, /canopyBack \* ([\d.]+) \* directLight\.color/, 'the far translucency');
      const nearBroad = backFloor + nearThin * grown + leaf, nearNeedle = backFloor + (nearThin * grown + leaf) * NEEDLE_TRANSMIT_LUMINANCE;
      const farNeedle = backFloor + (farThin + leaf) * NEEDLE_TRANSMIT_LUMINANCE;
      assert.ok(nearBroad > frontLit * 1.5, `${place.id}: the defect the law answers — a leafy back-lit crown at ${(nearBroad / frontLit).toFixed(2)}x its front-lit side`);
      assert.ok(nearNeedle <= frontLit, `${place.id}: an unshadowed back-lit needle crown never outshines its front-lit side (${nearNeedle.toFixed(3)} / ${frontLit.toFixed(3)})`);
      assert.ok(farNeedle <= frontLit, `${place.id}: nor does its far impostor (${farNeedle.toFixed(3)} / ${frontLit.toFixed(3)})`);
      report.push({ id: place.id, needles: place.needles, frontLit: +frontLit.toFixed(3), backLitLeafy: +nearBroad.toFixed(3), backLitNeedle: +nearNeedle.toFixed(3), farNeedle: +farNeedle.toFixed(3) });
    } finally {
      world.dispose(); disposeObject3DResources(world.group);
      for (const material of registered) releaseCsmShaderMaterial(lighting.csm, material);
      lighting.csm.remove(); lighting.csm.dispose();
    }
  }
} finally {
  environment.dispose();
  if (savedDocument === undefined) delete globalThis.document; else globalThis.document = savedDocument;
  if (savedImageData === undefined) delete globalThis.ImageData; else globalThis.ImageData = savedImageData;
}
console.log(JSON.stringify({ samples, report }));
console.log(`canopyNeedleTransmit.selftest: ${samples} albedos keep the law (saturation and luminance at most the front-lit albedo's), both transmitted terms take it, the needle forms of ${PLACES.length} places carry it on their cards and impostors over the one program, and a back-lit needle crown stays under its front-lit side PASS`);
