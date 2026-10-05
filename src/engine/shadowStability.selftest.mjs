import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';
import {
  SHADOW_ACNE_FREE_INCIDENCE_DEG,
  SHADOW_DEPTH_BIAS_MAX_M,
  SHADOW_DEPTH_BIAS_MIN_M,
  SHADOW_NORMAL_BIAS_MAX_M,
  SHADOW_NORMAL_BIAS_MIN_M,
  SHADOW_OPACITY,
  shadowDepthBiasForTexel,
  shadowNormalBiasForTexel,
  snapShadowCoordinate,
} from './shadowStability.ts';

assert.ok(SHADOW_OPACITY >= 0.9 && SHADOW_OPACITY <= 1.0,
  'daylight cast shadows keep the full-strength 1049e4e body; receiver detail comes from the hemisphere/fill lights and the ambient shadow dim, not from leaking key light');

// The cascades as the game builds them (2026-10-04, visual/shadow-bias: the receipt's old representative spans, 82.5 m for
// cascade 0, were stale; the live box is 210 m across): the lighting rig in node for each preset, with main.ts's camera
// (its field of view, near and far read from the source), and the telemetry's texels, radii and biases. A window holds
// the presets' storage and the tier's query.
const store = new Map();
globalThis.window = {
  localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) },
  location: { search: '' },
};
const quality = await import('./quality.ts');
const { createLighting } = await import('./lighting.ts');
const mainSource = await readFile(new URL('../main.ts', import.meta.url), 'utf8');
const cameraMatch = /const camera = new THREE\.PerspectiveCamera\(\s*([\d.]+),[^,]+,\s*([\d.]+),\s*([\d.]+),?\s*\)/.exec(mainSource);
assert.ok(cameraMatch, 'main.ts builds the game camera as a PerspectiveCamera(fov, aspect, near, far)');
const [cameraFov, cameraNear, cameraFar] = cameraMatch.slice(1, 4).map(Number);

function liveRig() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(cameraFov, 16 / 9, cameraNear, cameraFar);
  camera.position.set(0, 3, 0);
  camera.lookAt(0, 2, 10);
  camera.updateMatrixWorld();
  const rig = createLighting(scene, camera, new THREE.Vector3(1, 0.7, 0.4).normalize());
  rig.updateFrustums();
  const lights = [];
  scene.traverse((object) => { if (object.isDirectionalLight && object.castShadow) lights.push(object); });
  return { rig, lights };
}

const theta = SHADOW_ACNE_FREE_INCIDENCE_DEG * Math.PI / 180;
// the old single normalised bias (lighting.ts SHADOW_BIAS), read from the source
const LEGACY_BIAS = Number(/const SHADOW_BIAS = (-[\d.]+);/.exec(await readFile(new URL('./lighting.ts', import.meta.url), 'utf8'))[1]);
assert.equal(LEGACY_BIAS, -0.0002, 'the old bias: -0.0002 of the lights\' depth range');
let worstTexels = 0;
function checkPreset(name, expectedCascades) {
  const { rig, lights } = liveRig();
  const cascades = rig.getShadowTelemetry().cascades;
  assert.equal(cascades.length, expectedCascades, `${name}: the rig builds ${expectedCascades} cascades`);
  assert.equal(lights.length, cascades.length, `${name}: one shadow light per cascade`);
  let previousNormalBias = 0;
  const row = [];
  cascades.forEach((cascade, index) => {
    const shadow = lights[index].shadow;
    const texel = (shadow.camera.right - shadow.camera.left) / shadow.mapSize.x;
    assert.ok(Math.abs(cascade.worldUnitsPerTexel - texel) < 1e-6, `${name} cascade ${index}: the telemetry's texel is the light's`);
    assert.ok(texel > 0, `${name} cascade ${index} has a texel footprint`);
    const normalBias = shadowNormalBiasForTexel(texel);
    assert.ok(Math.abs(cascade.normalBias - normalBias) < 1e-6, `${name} cascade ${index} normal bias is the texel law's`);
    assert.ok(normalBias >= SHADOW_NORMAL_BIAS_MIN_M, `${name} cascade ${index} normal bias keeps the near-field floor`);
    assert.ok(normalBias <= SHADOW_NORMAL_BIAS_MAX_M, `${name} cascade ${index} normal bias stays below the detachment ceiling`);
    assert.ok(normalBias >= previousNormalBias, `${name} cascade ${index} does not lose receiver separation with distance`);
    previousNormalBias = normalBias;
    // the depth bias: the PCF reach's acne bound for a face 70 degrees from the sun, in [2 cm, 0.40 m], written in the
    // light's normalised depth
    const range = shadow.camera.far - shadow.camera.near;
    const bound = shadowDepthBiasForTexel(texel, cascade.radius, cascade.normalBias);
    const expected = Math.max(LEGACY_BIAS, -bound / range);
    assert.ok(Math.abs(cascade.bias - expected) <= 1e-15, `${name} cascade ${index} carries the acne-bound depth bias, never past the old one`);
    const depthBias = -cascade.bias * range;
    assert.ok(Math.abs(cascade.depthBiasM - depthBias) < 1e-4, `${name} cascade ${index} reports it in metres`);
    assert.ok(depthBias >= SHADOW_DEPTH_BIAS_MIN_M - 1e-12 && cascade.bias >= LEGACY_BIAS,
      `${name} cascade ${index} depth bias stays within [2 cm, the old 0.40 m]: no shadow stands further from its caster than before`);
    const reach = (0.95 * cascade.radius + 1) * texel;
    if (cascade.bias > LEGACY_BIAS) {
      assert.ok(cascade.normalBias + depthBias * Math.cos(theta) >= reach * Math.sin(theta) - 1e-9,
        `${name} cascade ${index}: no PCF tap self-shadows a caster face ${SHADOW_ACNE_FREE_INCIDENCE_DEG} degrees from the sun`);
    }
    assert.ok(depthBias / texel <= 6, `${name} cascade ${index} depth bias stays within six of its texels (${(depthBias / texel).toFixed(2)})`);
    worstTexels = Math.max(worstTexels, depthBias / texel);
    // texel snapping on the live grid
    const cell = 137 + index * 11;
    const insideCell = (cell + 0.2) * texel;
    const snapped = snapShadowCoordinate(insideCell, texel);
    assert.ok(Math.abs(snapped / texel - cell) < 1e-9, `${name} cascade ${index} must align to its ${cascade.size}px texel grid`);
    assert.equal(snapShadowCoordinate(insideCell + texel * 0.5, texel), snapped, `${name} cascade ${index} must not move within one texel`);
    assert.ok(Math.abs(snapShadowCoordinate(insideCell + texel, texel) - snapped - texel) < 1e-9,
      `${name} cascade ${index} must advance by exactly one texel`);
    row.push(`c${index} ${(texel * 100).toFixed(1)} cm/${(depthBias * 100).toFixed(1)} cm`);
  });
  // the A/B switch: every cascade back on the old single bias (0.40 m along the sun ray), then restored
  window.__SHADOW_DEBUG = { legacyBias: true };
  rig.updateFrustums();
  for (const light of lights) assert.equal(light.shadow.bias, LEGACY_BIAS, `${name}: legacyBias restores the old normalised bias exactly`);
  delete window.__SHADOW_DEBUG;
  rig.updateFrustums();
  rig.getShadowTelemetry().cascades.forEach((cascade, index) => assert.ok(
    Math.abs(cascade.bias - cascades[index].bias) < 1e-15, `${name} cascade ${index}: the per-cascade bias returns after the A/B`));
  return row.join(', ');
}

const rows = [];
for (const name of quality.PRESET_ORDER) {
  quality.setPresetName(name);
  assert.equal(quality.resolvePresetName(), name, `the desktop ladder reaches ${name}`);
  rows.push(`${name}: ${checkPreset(name, 4)}`);
}
// the phones: the tier resolved from the query, three cascades
window.location.search = '?tier=mobile';
assert.equal(quality.resolveDeviceTier(), 'mobile', 'the phone tier resolves from ?tier=mobile');
for (const name of quality.MOBILE_PRESET_ORDER) {
  quality.setMobilePresetName(name);
  assert.equal(quality.resolvePresetName(), name, `the phone ladder reaches ${name}`);
  rows.push(`${name}: ${checkPreset(name, 3)}`);
}

assert.equal(shadowNormalBiasForTexel(Number.NaN), SHADOW_NORMAL_BIAS_MIN_M,
  'invalid texel footprints fail to the stable near-field bias');
assert.equal(shadowNormalBiasForTexel(100), SHADOW_NORMAL_BIAS_MAX_M,
  'extreme far footprints remain bounded');
assert.equal(shadowDepthBiasForTexel(Number.NaN, 1.6, 0.045), SHADOW_DEPTH_BIAS_MAX_M,
  'an invalid texel footprint fails to the old, acne-safe depth bias');
assert.equal(shadowDepthBiasForTexel(0.001, 1.6, 0.045), SHADOW_DEPTH_BIAS_MIN_M,
  'a fine texel the normal offset already covers keeps the 2 cm floor');
assert.equal(shadowDepthBiasForTexel(10, 2.8, 0.28), SHADOW_DEPTH_BIAS_MAX_M,
  'a coarse texel never takes more than the old 0.40 m');

const lightingSource = await readFile(new URL('./lighting.ts', import.meta.url), 'utf8');
assert.match(lightingSource,
  /cotSunVis = mix\( cotSunVis, cotCascadeVis, blendRatio \);/,
  'fade-overlap ambient visibility uses the same sequential CSM blend as direct light');
assert.doesNotMatch(lightingSource,
  /frag\.replace\(fadeAnchor,[\s\S]{0,180}cotSunVis = min/,
  'a barely contributing fade cascade cannot own the complete ambient-shadow term');

const blendVisibility = (previous, sample, weight) =>
  previous + (sample - previous) * weight;
assert.equal(blendVisibility(1, 0, 0.05), 0.95,
  'a dark cascade at five-percent overlap may only dim the ambient term by five percent');
assert.equal(blendVisibility(0.95, 1, 0.95), 0.9975,
  'the next cascade resolves the overlap with the same sequential blend as direct light');
assert.equal(blendVisibility(1, 0, 1), 0,
  'a fully owned shadow remains fully dark');

console.log(`shadowStability.selftest: texel snapping, cascade-scaled biases on the live rig (worst ${worstTexels.toFixed(2)} texels), and weighted overlap pass\n  ${rows.join('\n  ')}`);
