import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createBattlePrecipitation, MAX_BATTLE_PRECIPITATION_PARTICLES } from './battlePrecipitation.ts';
import { selectBattleWeather } from './battleWeatherPolicy.ts';

const hash = array => createHash('sha256')
  .update(new Uint8Array(array.buffer, array.byteOffset, array.byteLength)).digest('hex');
const rain = selectBattleWeather(1337, 'tropical');
const snow = selectBattleWeather(3, 'cold');
const clear = selectBattleWeather(0, 'temperate');
const fog = selectBattleWeather(16, 'cold');
assert.equal(rain.condition, 'rain'); assert.equal(snow.condition, 'snow');
assert.equal(clear.condition, 'clear'); assert.equal(fog.condition, 'fog');
assert.equal(MAX_BATTLE_PRECIPITATION_PARTICLES, 768);

function inspectResources(runtime, capacity) {
  const { mesh } = runtime, geometry = mesh.geometry, material = mesh.material;
  assert.equal(mesh.isMesh, true); assert.equal(mesh.children.length, 0);
  assert.equal(geometry.isInstancedBufferGeometry, true);
  assert.equal(material.isShaderMaterial, true);
  assert.equal(geometry.index.count, 6, 'one quad/two triangles per particle');
  assert.equal(geometry.attributes.position.count, 4);
  assert.equal(geometry.attributes.aSeed.count, capacity);
  assert.equal(geometry.attributes.aSeed.isInstancedBufferAttribute, true);
  const attributes = Object.values(geometry.attributes);
  const bytes = geometry.index.array.byteLength + attributes.reduce((sum, attr) => sum + attr.array.byteLength, 0);
  assert.equal(bytes, 92 + capacity * 16);
  assert.ok(bytes <= 64 * 1024);
  for (const attr of attributes) {
    assert.equal(attr.usage, THREE.StaticDrawUsage);
    for (const value of attr.array) assert.equal(Number.isFinite(value), true);
  }
  assert.equal(material.transparent, true);
  assert.equal(material.depthTest, true); assert.equal(material.depthWrite, false);
  assert.equal(material.blending, THREE.NormalBlending); assert.equal(material.side, THREE.FrontSide);
  assert.equal(material.lights, false); assert.equal(mesh.castShadow, false); assert.equal(mesh.receiveShadow, false);
  assert.equal(mesh.frustumCulled, false); assert.equal(mesh.matrixAutoUpdate, false);
  assert.equal(mesh.userData.aoExclude, true);
  for (const uniform of Object.values(material.uniforms)) assert.notEqual(uniform.value?.isTexture, true);
  assert.doesNotMatch(material.vertexShader + material.fragmentShader, /sampler|texture2D|gl_PointSize/);
  assert.match(material.vertexShader, /mod\(aSeed\.xyz \* extent \+ uSeedOffset \+ motion - uCamera/);
  assert.match(material.vertexShader, /viewMatrix \* vec4\(uCamera \+ local, 1\.0\)/);
  assert.match(material.vertexShader, /smoothstep\(0\.0, 4\.0/);
  assert.match(material.fragmentShader, /gl_FragColor = vec4\(color, alpha\)/);
  return bytes;
}

const runtime = createBattlePrecipitation();
const other = createBattlePrecipitation();
const { mesh } = runtime, geometry = mesh.geometry, material = mesh.material;
const initialArrays = Object.entries(geometry.attributes).map(([name, attr]) =>
  [name, attr, attr.array, attr.version, hash(attr.array)]);
let geometryDisposals = 0, materialDisposals = 0;
geometry.addEventListener('dispose', () => geometryDisposals++);
material.addEventListener('dispose', () => materialDisposals++);
const scene = new THREE.Scene(); scene.add(mesh);
try {
  assert.equal(inspectResources(runtime, 768), 12380);
  assert.equal(mesh.visible, false); assert.equal(geometry.instanceCount, 0);
  assert.equal(hash(geometry.attributes.aSeed.array), hash(other.mesh.geometry.attributes.aSeed.array),
    'fixed construction table independent of other Three UUID/random draws');
  runtime.reset(rain);
  assert.equal(geometry.instanceCount, Math.ceil(768 * .627));
  assert.equal(mesh.visible, true); assert.equal(material.uniforms.uSnow.value, 0);
  other.reset(rain);
  assert.deepEqual(material.uniforms.uSeedOffset.value, other.mesh.material.uniforms.uSeedOffset.value);
  const rainOffset = material.uniforms.uSeedOffset.value.clone();
  runtime.reset(snow, 96);
  assert.equal(geometry.instanceCount, Math.ceil(96 * .457));
  assert.equal(material.uniforms.uSnow.value, 1);
  assert.notDeepEqual(material.uniforms.uSeedOffset.value, rainOffset);
  const uniforms = Object.entries(material.uniforms).map(([name, uniform]) => [name, uniform]);
  const cameraUniform = material.uniforms.uCamera.value;
  const random = Math.random;
  Math.random = () => { throw new Error('No update-time random'); };
  try {
    for (let i = 0; i < 600; i++) runtime.update(i / 60, i - 300, 4, -100 + i * .4);
    runtime.update(7.5, 25, 6, -12);
    assert.equal(material.uniforms.uTime.value, 7.5, 'absolute input permits replay rewind/freeze');
    assert.deepEqual(cameraUniform.toArray(), [25, 6, -12]);
    runtime.update(7.5, 25, 6, -12);
    assert.equal(material.uniforms.uTime.value, 7.5);
    runtime.update(NaN, 0, 0, 0); runtime.update(9, Infinity, 0, 0);
    assert.equal(material.uniforms.uTime.value, 7.5, 'invalid frame cannot poison uniforms');
  } finally { Math.random = random; }
  for (const [name, uniform] of uniforms) assert.strictEqual(material.uniforms[name], uniform);
  assert.strictEqual(material.uniforms.uCamera.value, cameraUniform);
  runtime.setBudget(0);
  assert.equal(mesh.visible, false); assert.equal(geometry.instanceCount, 0);
  runtime.setBudget(9000);
  assert.equal(geometry.instanceCount, Math.ceil(768 * .457), 'local count cannot exceed capacity');
  runtime.hide(); runtime.update(10, 0, 2, 0); runtime.setBudget(768);
  assert.equal(mesh.visible, false, 'Garage hide survives clocks and quality changes');
  assert.equal(geometry.instanceCount, 0);
  for (const weather of [clear, fog]) {
    runtime.reset(weather); runtime.update(10, 0, 2, 0);
    assert.equal(mesh.visible, false); assert.equal(geometry.instanceCount, 0);
  }
  runtime.reset(rain);
  assert.deepEqual(material.uniforms.uSeedOffset.value, rainOffset, 'rematch restores exact seed domain');
  assert.equal(material.uniforms.uTime.value, 0);
  assert.deepEqual(cameraUniform.toArray(), [0, 0, 0]);
  const activeCount = geometry.instanceCount;
  for (const bad of [-1, .5, NaN, Infinity]) {
    assert.throws(() => runtime.reset(snow, bad), /budget/);
    assert.equal(geometry.instanceCount, activeCount, 'invalid reset is atomic');
  }
  assert.throws(() => runtime.reset({ ...rain, version: 999 }), /descriptor/);
  assert.throws(() => runtime.reset({ ...rain, precipitationIntensity: 1.1 }), /intensity/);
  assert.throws(() => runtime.reset({ ...rain, timeOfDay: 'broken' }), /time of day/);
  for (const [name, attribute, array, version, before] of initialArrays) {
    assert.strictEqual(geometry.attributes[name], attribute);
    assert.strictEqual(attribute.array, array);
    assert.equal(attribute.version, version, 'no reset/frame/preset GPU upload');
    assert.equal(hash(array), before);
  }
} finally { runtime.dispose(); other.dispose(); }
runtime.dispose(); runtime.hide(); runtime.update(22, 0, 0, 0); runtime.setBudget(700);
assert.equal(geometryDisposals, 1); assert.equal(materialDisposals, 1);
assert.equal(mesh.parent, null); assert.equal(scene.children.length, 0);
assert.equal(mesh.visible, false); assert.equal(geometry.instanceCount, 0);
assert.throws(() => runtime.reset(rain), /disposed/);
for (const capacity of [0, 96, 192]) {
  const small = createBattlePrecipitation(capacity);
  try {
    inspectResources(small, capacity); small.reset(rain);
    assert.equal(small.mesh.geometry.instanceCount, Math.ceil(capacity * .627));
  } finally { small.dispose(); }
}
for (const capacity of [-1, 769, 1.5, NaN, Infinity]) assert.throws(() => createBattlePrecipitation(capacity), /capacity/);
const source = readFileSync(new URL('./battlePrecipitation.ts', import.meta.url), 'utf8');
assert.doesNotMatch(source, /document\.|Math\.random\(|Date\.|performance\.|requestAnimationFrame\(|setTimeout\(|\.needsUpdate\s*=/);
console.log('battlePrecipitation self-test: one fixed instanced draw, 12,380B maximum, zero textures, deterministic reset/updates and lifecycle PASS (native shader/render validation pending)');
