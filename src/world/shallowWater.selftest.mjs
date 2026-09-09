import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Group, ShaderLib, Texture } from 'three';
import { createHeightField } from './terrain.ts';
import { getMapConfig } from './maps/index.ts';
import { createShallowWaterSurface, shallowWaterGeometrySteps } from './shallowWater.ts';
import { shallowWaterDepth, waterContactProfile } from './waterContact.ts';
import { createLiveHeightFieldProxy } from './liveHeightFieldProxy.ts';
import { disposeObject3DResources, registerRetainedObject3DResources } from '../engine/resourceLifetime.ts';

function drain(generator) {
  let step = generator.next(), slices = 0;
  while (!step.done) { slices++; step = generator.next(); }
  return { value: step.value, slices };
}

for (const [mapId, kind] of [['coastal', 'coast'], ['reservoir', 'lake'], ['delta', 'river'], ['mangrove', 'marsh']]) {
  const profile = waterContactProfile(mapId);
  assert.equal(profile.kind, kind);
  assert.ok(profile.depthM >= 0.4 && profile.depthM <= 0.8, 'bounded wheel-depth wading, no hidden drowning rule');
  assert.ok(profile.opacity >= 0.3 && profile.opacity < 0.65);
  assert.equal(shallowWaterDepth(0, profile.depthM), 0);
  assert.equal(shallowWaterDepth(1, profile.depthM), profile.depthM);
  let previous = 0;
  for (let i = 0; i <= 100; i++) {
    const depth = shallowWaterDepth(i / 100, profile.depthM);
    assert.ok(depth >= previous && depth <= profile.depthM);
    previous = depth;
  }
}

const field = {
  size: 64,
  getHeightAt: (x, z) => 2 + x * 0.002 + z * 0.001,
  getWaterMaskAt: (x, z) => Math.abs(x) < 20 && Math.abs(z) < 24 ? 1 : 0,
  getWaterDepthAt(x, z) { return this.getWaterMaskAt(x, z) * 0.58; },
};
const geometry = drain(shallowWaterGeometrySteps(field));
assert.ok(geometry.slices >= 16, 'construction yields per row, no first-use frame build');
const position = geometry.value.attributes.position;
assert.ok(position.count <= 81, 'one bounded fixed grid');
for (let i = 0; i < position.count; i++) {
  const x = position.getX(i), z = position.getZ(i);
  assert.ok(Math.abs(position.getY(i) - field.getHeightAt(x, z) - field.getWaterDepthAt(x, z)) < 1e-6);
}
const index = geometry.value.index.array;
for (let i = 0; i < index.length; i += 3) {
  const [a, b, c] = index.slice(i, i + 3);
  const upward = (position.getZ(b) - position.getZ(a)) * (position.getX(c) - position.getX(a))
    - (position.getX(b) - position.getX(a)) * (position.getZ(c) - position.getZ(a));
  assert.ok(upward > 0, 'every water triangle faces up');
}
assert.equal(drain(shallowWaterGeometrySteps({ ...field, getWaterMaskAt: () => 0 })).value, null);

const mask = new Texture(), waves = new Texture();
const water = createShallowWaterSurface(geometry.value, mask, waves, field.size, 'coastal', [0.4, 0.78]);
assert.equal(water.mesh.material.transparent, true);
assert.equal(water.mesh.material.depthWrite, false);
assert.equal(water.mesh.material.envMapIntensity, 0.25, 'surface keeps a bounded sky reflection');
assert.equal(water.mesh.material.forceSinglePass, true, 'one draw, not the two-pass transparent default');
const shader = { uniforms: {}, vertexShader: ShaderLib.standard.vertexShader, fragmentShader: ShaderLib.standard.fragmentShader };
water.mesh.material.onBeforeCompile(shader);
assert.equal(shader.uniforms.uWaterMask.value, mask);
assert.equal(shader.uniforms.uWaterWave.value, waves, 'shares already-owned terrain textures');
assert.match(shader.fragmentShader, /if \(wet < 0\.015\) discard/);
assert.match(shader.fragmentShader, /mix\(opacity, 0\.78, grazing\)/);
assert.match(shader.fragmentShader, /material\.specularColor \*= 0\.10/, 'sun glints cannot wash the full sheet white');
assert.match(shader.fragmentShader, /totalSpecular - vec3\(0\.16\)/, 'liquid highlight energy stays below bloom-white');
water.update(0.016); assert.equal(shader.uniforms.uWaterTime.value, 0.016);
water.update(0); water.update(-1); water.update(NaN);
assert.equal(shader.uniforms.uWaterTime.value, 0.016);
water.setTime(4); assert.equal(shader.uniforms.uWaterTime.value, 4);
water.update(20); assert.equal(shader.uniforms.uWaterTime.value, 4.1, 'resume cannot jump fluid phase by wall time');

const root = new Group(); root.add(water.mesh);
registerRetainedObject3DResources(root, { textures: [mask, waves] });
const released = { geometry: 0, material: 0, texture: 0 };
disposeObject3DResources(root, { onDispose: kind => { released[kind]++; } });
assert.deepEqual(released, { geometry: 1, material: 1, texture: 2 });

for (const mapId of ['coastal', 'mangrove', 'reservoir', 'winter', 'verdant']) {
  const hf = createHeightField(1337, getMapConfig(mapId));
  let wet = 0;
  for (let z = -480; z <= 480; z += 48) for (let x = -480; x <= 480; x += 48) {
    const bed = hf.getHeightAt(x, z), coverage = hf.getWaterMaskAt(x, z), depth = hf.getWaterDepthAt(x, z);
    assert.equal(hf.getHeightAt(x, z), bed, 'presentation cannot move the authoritative bed');
    assert.ok(depth >= 0 && depth <= 0.8);
    if (coverage === 0) assert.equal(depth, 0);
    else { assert.ok(depth > 0); wet++; }
  }
  if (mapId === 'winter' || mapId === 'verdant') assert.equal(wet, 0, 'dry and frozen maps unchanged');
  else assert.ok(wet > 0, `${mapId} actually exercises liquid`);
}

let world = { heightField: field };
const proxy = createLiveHeightFieldProxy({ getWorld: () => world, useExactHeight: () => true, upNormal: null });
assert.equal(proxy.getWaterDepthAt(0, 0), 0.58);
world = null;
assert.equal(proxy.getWaterDepthAt(0, 0), 0, 'garage/map replacement cannot retain previous water contact');
const fx = readFileSync(new URL('../fx/effects.ts', import.meta.url), 'utf8');
const terrain = readFileSync(new URL('./terrain.ts', import.meta.url), 'utf8');
assert.match(terrain, /gSplatRough = mix\(gSplatRough, 0\.95, fMs \* uSea\)/, 'bed cannot reflect a second white water sheet');
assert.match(terrain, /gSplatAlbedo \*= 1\.0 - fMs \* uSea \* 0\.42/, 'only submerged liquid bed is darkened');
const kits = readFileSync(new URL('./maps/mapKits.ts', import.meta.url), 'utf8');
assert.match(kits, /buoy\.translate\(x, heightField\.getHeightAt\(x, z\) \+ \(heightField\.getWaterDepthAt\?\.\(x, z\) \?\? 0\) \+ 0\.16, z\)/);
assert.match(fx, /groundY\(x, z\) \+ depth \+ \(water \? 0\.065 : 0\.035\)/);
assert.match(fx, /float ring = 0\.35 \+ \(1\.0 - vFade\) \* 0\.58/);
assert.match(fx, /printCenters\.fill\(1e9\)/, 'rematch reset clears wake admission');
console.log('shallowWater: bounded surface, four profiles, animated shared textures, frozen/dry isolation, cleanup and contact pass');
