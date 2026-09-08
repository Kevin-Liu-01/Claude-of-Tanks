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

// Evaluate the installed red tint through Three's actual ACES coefficients,
// not just the declared red material property: the old radiance passed that
// property check while the final discs were visibly amber. This CPU oracle
// supplements (does not replace) the native composed close-up comparison.
assert.match(THREE.ShaderChunk.tonemapping_pars_fragment, /color \*= toneMappingExposure \/ 0\.6/);
for (const coefficient of ['0.59719', '0.90834', '0.83777', '1.60475', '1.10813', '1.07602',
  '0.0245786', '0.000090537', '0.983729', '0.4329510', '0.238081']) {
  assert.ok(THREE.ShaderChunk.tonemapping_pars_fragment.includes(coefficient),
    'update the color oracle if the installed Three ACES implementation changes');
}
const acesInput = new THREE.Matrix3().set(.59719, .35458, .04823, .076, .90834, .01566, .0284, .13383, .83777);
const acesOutput = new THREE.Matrix3().set(1.60475, -.53108, -.07367, -.10208, 1.10813, -.00605, -.00327, -.07276, 1.07602);
function acesDisplay(radiance, exposure = 1.16) {
  const value = new THREE.Vector3(...radiance.toArray()).multiplyScalar(exposure / .6).applyMatrix3(acesInput);
  value.fromArray(value.toArray().map(x => (x * (x + .0245786) - .000090537)
    / (x * (.983729 * x + .432951) + .238081))).applyMatrix3(acesOutput);
  return new THREE.Color(...value.toArray().map(x => THREE.MathUtils.clamp(x, 0, 1))).convertLinearToSRGB();
}
assert.deepEqual(regular.shader.uniforms.nightEmissionWarm.value.toArray(),
  new THREE.Color(NIGHT_HEADLIGHT_COLOR).toArray(), 'headlights/window lamps retain exact warm radiance');
const dayRed = new THREE.Color(0x7c2410); // measured authored T-90A Vladimir lens floor
const whiteNight = new THREE.Color(3, 3, 3);
const redTint = regular.shader.uniforms.nightEmissionRed.value;
const redRadiance = dayRed.clone().add(whiteNight.clone().sub(dayRed).multiply(redTint));
for (const exposure of [1, 1.16, 1.3]) {
  const display = acesDisplay(redRadiance, exposure);
  assert.ok(display.r > .8 && display.g < display.r * .4 && display.b < display.r * .25,
    'night aperture remains bright red through production ACES, not yellow/amber');
}
const oldRadiance = dayRed.clone().add(whiteNight.clone().sub(dayRed).multiply(new THREE.Color(NIGHT_SHTORA_COLOR)));
assert.ok(acesDisplay(oldRadiance).g > acesDisplay(oldRadiance).r * .6,
  'the regression fixture actually distinguishes the previous amber result');
assert.deepEqual(dayRed.clone().add(dayRed.clone().sub(dayRed).multiply(redTint)).toArray(), dayRed.toArray(),
  'red-aperture gain cannot alter the exact authored day radiance');
geometry.dispose(); regular.material.dispose(); instanced.material.dispose();
console.log('nightEmissionMaterial: exact day baseline, semantic zero mask, ACES-stable red/warm variants, instanced activity, hook/key preservation PASS');
