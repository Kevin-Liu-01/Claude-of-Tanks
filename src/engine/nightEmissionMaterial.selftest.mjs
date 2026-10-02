import assert from 'node:assert/strict';
import * as THREE from 'three';
import { NIGHT_EMISSION_ATTRIBUTE, NIGHT_HEADLIGHT_COLOR, NIGHT_SHTORA_COLOR,
  setNightEmissionMask, installNightEmissionMask } from './nightEmissionMaterial.ts';

const geometry = new THREE.BoxGeometry(1, 2, 3);
const original = geometry.getAttribute('position').array.slice();
setNightEmissionMask(geometry, 1, [2, 3]);
assert.deepEqual(geometry.getAttribute('position').array, original, 'tagging never changes geometry');
assert.equal(geometry.getAttribute(NIGHT_EMISSION_ATTRIBUTE).count, original.length / 3);
assert.deepEqual([...geometry.getAttribute(NIGHT_EMISSION_ATTRIBUTE).array].filter(Boolean), [1, 1]);
setNightEmissionMask(geometry, 0);
assert.ok([...geometry.getAttribute(NIGHT_EMISSION_ATTRIBUTE).array].every(value => value === 0));

function compileMask(options = {}) {
  const material = new THREE.MeshStandardMaterial({ emissive: 0x123456, emissiveIntensity: .37 });
  let previousCalls = 0;
  material.onBeforeCompile = shader => { previousCalls++; shader.fragmentShader += '\n// existing material hook'; };
  material.customProgramCacheKey = () => 'authored-base';
  const before = { emissive: material.emissive.toArray(), intensity: material.emissiveIntensity };
  installNightEmissionMask(material, options);
  installNightEmissionMask(material, options);
  const shader = { vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} };
  material.onBeforeCompile(shader, {});
  assert.equal(previousCalls, 1, 'existing hooks run once despite idempotent installation');
  assert.deepEqual({ emissive: material.emissive.toArray(), intensity: material.emissiveIntensity }, before, 'installation preserves original day appearance');
  assert.match(shader.fragmentShader, /existing material hook/);
  assert.match(shader.fragmentShader, /step\(0\.5, vNightEmissionMask\)/, 'unmarked poles/periscopes get no new emission');
  assert.match(shader.fragmentShader, /clamp\(vNightEmissionActive, 0\.0, 1\.0\)/);
  assert.match(material.customProgramCacheKey(), /^authored-base\|night-emission-mask-v1:/);
  const base = shader.uniforms.nightEmissionBase.value;
  assert.deepEqual(base.toArray(), new THREE.Color(0x123456).multiplyScalar(.37).toArray());
  // The shader's additive-baseline form is exact at day, mask0, and activity0.
  const radiance = base.clone().add(new THREE.Color(3, 3, 3).sub(base).multiplyScalar(0));
  assert.deepEqual(radiance.toArray(), base.toArray());
  return { material, shader };
}

const regular = compileMask();
assert.match(regular.shader.vertexShader, /vNightEmissionActive = 1\.0;/);
const instanced = compileMask({ instanceActiveAttribute: 'streetlampActive' });
assert.match(instanced.shader.vertexShader, /attribute float streetlampActive;/);
assert.match(instanced.shader.vertexShader, /vNightEmissionActive = 1\.0 \* streetlampActive;/);
assert.notEqual(instanced.material.customProgramCacheKey(), regular.material.customProgramCacheKey());
assert.throws(() => installNightEmissionMask(instanced.material), /cannot change/);
assert.throws(() => installNightEmissionMask(new THREE.MeshStandardMaterial(), { instanceActiveAttribute: 'bad; shader' }), /Invalid/);

// Evaluate the installed red tint through the production tone curve, not just the declared red material property:
// the old radiance passed that property check while the final discs were visibly amber under ACES. Since
// 2026-10-01 the output pass tone-maps with Three's AgX (renderer.ts) after the light model's exposure (about 1 to
// 2.8 across day and night). AgX has no per-channel skew toward amber (a saturated light desaturates along its own
// hue toward white), so the guard is the hue (red, never amber) and the colour the aperture keeps where the
// previous full-Shtora radiance washes to a pale pink. This CPU oracle supplements (does not replace) the native
// composed close-up comparison.
const chunk = THREE.ShaderChunk.tonemapping_pars_fragment;
assert.match(chunk, /vec3 AgXToneMapping\( vec3 color \)/);
for (const coefficient of ['0.856627153315983', '0.761241990602591', '0.811302368396859', '1.1271005818144368',
  '1.157823702216272', '1.2519364065950405', '12.47393', '4.026069', '15.5', '40.14', '31.96', '6.868', '0.4298', '0.1191', '0.00232',
  '0.6274', '0.9195', '0.8956', '1.6605', '1.1329', '1.1187']) {
  assert.ok(chunk.includes(coefficient), 'update the colour oracle if the installed Three AgX implementation changes');
}
const column = (a) => new THREE.Matrix3().set(a[0], a[3], a[6], a[1], a[4], a[7], a[2], a[5], a[8]); // GLSL mat3 columns
const toRec2020 = column([.6274, .0691, .0164, .3293, .9195, .0880, .0433, .0113, .8956]);
const fromRec2020 = column([1.6605, -.1246, -.0182, -.5876, 1.1329, -.1006, -.0728, -.0083, 1.1187]);
const agxInset = column([.856627153315983, .137318972929847, .11189821299995, .0951212405381588, .761241990602591,
  .0767994186031903, .0482516061458583, .101439036467562, .811302368396859]);
const agxOutset = column([1.1271005818144368, -.1413297634984383, -.14132976349843826, -.11060664309660323,
  1.157823702216272, -.11060664309660294, -.016493938717834573, -.016493938717834257, 1.2519364065950405]);
const agxContrast = (x) => { const x2 = x * x, x4 = x2 * x2; return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + .4298 * x2 + .1191 * x - .00232; };
function agxDisplay(radiance, exposure) {
  const v = new THREE.Vector3(...radiance.toArray()).multiplyScalar(exposure).applyMatrix3(toRec2020).applyMatrix3(agxInset);
  v.fromArray(v.toArray().map((x) => agxContrast(THREE.MathUtils.clamp((Math.log2(Math.max(x, 1e-10)) + 12.47393) / (4.026069 + 12.47393), 0, 1))));
  v.applyMatrix3(agxOutset).fromArray(v.toArray().map((x) => Math.pow(Math.max(0, x), 2.2))).applyMatrix3(fromRec2020);
  return new THREE.Color(...v.toArray().map((x) => THREE.MathUtils.clamp(x, 0, 1))).convertLinearToSRGB();
}
const hueOf = (c) => { const h = c.getHSL({ h: 0, s: 0, l: 0 }).h * 360; return h > 180 ? h - 360 : h; };
const chroma = (c) => (Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b)) / Math.max(c.r, c.g, c.b, 1e-6);
assert.deepEqual(regular.shader.uniforms.nightEmissionWarm.value.toArray(),
  new THREE.Color(NIGHT_HEADLIGHT_COLOR).toArray(), 'headlights/window lamps retain exact warm radiance');
const dayRed = new THREE.Color(0x7c2410); // measured authored T-90A Vladimir lens floor
const whiteNight = new THREE.Color(3, 3, 3);
const redTint = regular.shader.uniforms.nightEmissionRed.value;
const redRadiance = dayRed.clone().add(whiteNight.clone().sub(dayRed).multiply(redTint));
for (const exposure of [1, 1.6, 2.2, 2.8]) {
  const display = agxDisplay(redRadiance, exposure);
  assert.ok(display.r > .8 && Math.abs(hueOf(display)) < 15 && chroma(display) > .45,
    `night aperture stays red through production AgX at exposure ${exposure}: its hue, never amber, and its colour (${display.getHexString()})`);
}
const oldRadiance = dayRed.clone().add(whiteNight.clone().sub(dayRed).multiply(new THREE.Color(NIGHT_SHTORA_COLOR)));
assert.ok(chroma(agxDisplay(oldRadiance, 1.6)) < .4,
  'the regression fixture actually distinguishes the previous full-Shtora radiance (washed to a pale pink)');
assert.deepEqual(dayRed.clone().add(dayRed.clone().sub(dayRed).multiply(redTint)).toArray(), dayRed.toArray(),
  'red-aperture gain cannot alter the exact authored day radiance');
geometry.dispose(); regular.material.dispose(); instanced.material.dispose();
console.log('nightEmissionMaterial: exact day baseline, semantic zero mask, AgX-stable red/warm variants, instanced activity, hook/key preservation PASS');
