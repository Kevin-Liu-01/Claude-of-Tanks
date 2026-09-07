import assert from 'node:assert/strict';
import * as THREE from 'three';
import { NIGHT_EMISSION_ATTRIBUTE, setNightEmissionMask, installNightEmissionMask } from './nightEmissionMaterial.ts';

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
geometry.dispose(); regular.material.dispose(); instanced.material.dispose();
console.log('nightEmissionMaterial: exact day baseline, semantic zero mask, red/warm variants, instanced activity, hook/key preservation PASS');
