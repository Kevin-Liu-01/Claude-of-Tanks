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

// Independent oracle: interpolate actual emitted, packed vertex positions with
// barycentric weights; do not reconstruct the sampler's regular-grid formula.
function assertTriangleInteriors(surface, heightAt = surface.heightAt) {
  const positions = surface.geometry.attributes.position, indices = surface.geometry.index.array;
  for (let i = 0; i < indices.length; i += 3) {
    for (const weights of [[0.17, 0.29, 0.54], [0.63, 0.24, 0.13], [1 / 3, 1 / 3, 1 / 3]]) {
      let x = 0, y = 0, z = 0;
      for (let corner = 0; corner < 3; corner++) {
        const vertex = indices[i + corner], weight = weights[corner];
        x += positions.getX(vertex) * weight;
        y += positions.getY(vertex) * weight;
        z += positions.getZ(vertex) * weight;
      }
      assert.ok(Math.abs(heightAt(x, z) - y) < 1e-8, `emitted triangle ${i / 3} interior`);
    }
  }
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
const surface = geometry.value;
const position = surface.geometry.attributes.position;
assert.ok(position.count <= 81, 'one bounded fixed grid');
for (let i = 0; i < position.count; i++) {
  const x = position.getX(i), z = position.getZ(i);
  assert.ok(Math.abs(position.getY(i) - field.getHeightAt(x, z) - field.getWaterDepthAt(x, z)) < 1e-6);
}
const index = surface.geometry.index.array;
for (let i = 0; i < index.length; i += 3) {
  const [a, b, c] = index.slice(i, i + 3);
  const upward = (position.getZ(b) - position.getZ(a)) * (position.getX(c) - position.getX(a))
    - (position.getX(b) - position.getX(a)) * (position.getZ(c) - position.getZ(a));
  assert.ok(upward > 0, 'every water triangle faces up');
}
assertTriangleInteriors(surface);
assert.throws(() => assertTriangleInteriors(surface,
  (x, z) => field.getHeightAt(x, z) + field.getWaterDepthAt(x, z)), /emitted triangle/,
'old continuous bed-plus-depth contact fails actual shoreline triangles');
assert.ok(Math.abs(surface.heightAt(18, 0) - field.getHeightAt(18, 0) - 0.435) < 1e-6,
  'shoreline counterexample uses the drawn 0.435 m depth, not the continuous 0.58 m');
for (const [x, z] of [[-33, 0], [33, 0], [0, -33], [0, 33], [28, 28]]) {
  assert.equal(surface.heightAt(x, z), field.getHeightAt(x, z), 'outside/unemitted cell falls back to bed');
}
assert.equal(drain(shallowWaterGeometrySteps({ ...field, getWaterMaskAt: () => 0 })).value, null);

// Four emitted center-only neighbors populate every corner of the omitted
// middle cell. Finite heights alone must not be mistaken for cell admission.
let queriesClosed = false;
const islands = {
  size: 64,
  getHeightAt: (x, z) => 2 + 0.013 * x * x + 0.021 * z * z + 0.007 * x * z,
  getWaterMaskAt(x, z) {
    assert.equal(queriesClosed, false, 'sampler cannot query the mask');
    return [[-4, 4], [12, 4], [4, -4], [4, 12]].some(([cx, cz]) => Math.hypot(x - cx, z - cz) < 1) ? 1 : 0;
  },
  getWaterDepthAt(x, z) { return this.getWaterMaskAt(x, z) * 0.58; },
};
const islandSurface = drain(shallowWaterGeometrySteps(islands)).value;
queriesClosed = true;
assert.equal(islandSurface.geometry.index.count, 24, 'only four center-admitted cells');
assertTriangleInteriors(islandSurface);
assert.equal(islandSurface.heightAt(4, 4), islands.getHeightAt(4, 4), 'unemitted hole is not interpolated');
assert.equal(islandSurface.heightAt(4, 0), islands.getHeightAt(4, 0), 'internal boundary selects its half-open cell');
assert.equal(islandSurface.heightAt(40, 4), islands.getHeightAt(40, 4), 'outside fallback does not query masks');
islandSurface.geometry.dispose();

// Non-integral X/Z spacing and a large ordinate make Float32 packing observable.
// Curved/saddle heights also distinguish the actual diagonal from bilinear sampling.
const curved = {
  size: 66, getHeightAt: (x, z) => 200000 + 0.013 * x * x + 0.021 * z * z + 0.007 * x * z,
  getWaterMaskAt: () => 1, getWaterDepthAt: () => 0.58,
};
const curvedSurface = drain(shallowWaterGeometrySteps(curved)).value;
assertTriangleInteriors(curvedSurface);
const cp = curvedSurface.geometry.attributes.position, ci = curvedSurface.geometry.index.array;
for (let vertex = 0; vertex < cp.count; vertex++) {
  assert.equal(curvedSurface.heightAt(cp.getX(vertex), cp.getZ(vertex)), cp.getY(vertex),
    'packed vertices, internal boundaries and inclusive outer edges are exact');
}
const a = ci[0], c = ci[1], b = ci[2], d = ci[5];
const probeX = cp.getX(a) * 0.75 + cp.getX(b) * 0.25;
const probeZ = cp.getZ(a) * 0.75 + cp.getZ(c) * 0.25;
const bilinear = cp.getY(a) * 0.5625 + (cp.getY(b) + cp.getY(c)) * 0.1875 + cp.getY(d) * 0.0625;
assert.ok(Math.abs(curvedSurface.heightAt(probeX, probeZ) - bilinear) > 0.001, 'reject bilinear diagonal substitution');
curvedSurface.geometry.dispose();

const mask = new Texture(), waves = new Texture();
const water = createShallowWaterSurface(surface.geometry, mask, waves, field.size, 'coastal', [0.4, 0.78]);
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
    const coverage = hf.getWaterMaskAt(x, z), depth = hf.getWaterDepthAt(x, z);
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
assert.equal(proxy.getWaterSurfaceHeightAt(18, 0), field.getHeightAt(18, 0) + 0.58, 'field without a mesh keeps the compatibility fallback');
world = { heightField: { ...field, getWaterSurfaceHeightAt: surface.heightAt } };
assert.equal(proxy.getWaterSurfaceHeightAt(18, 0), surface.heightAt(18, 0), 'live proxy uses actual rendered surface');
world = null;
assert.equal(proxy.getWaterDepthAt(0, 0), 0, 'null field has no previous water depth; this is not a Garage lifecycle fixture');
assert.equal(proxy.getWaterSurfaceHeightAt(18, 0), 0, 'null field has no previous surface sampler');
const fx = readFileSync(new URL('../fx/effects.ts', import.meta.url), 'utf8');
const terrain = readFileSync(new URL('./terrain.ts', import.meta.url), 'utf8');
assert.match(terrain, /gSplatRough = mix\(gSplatRough, 0\.95, fMs \* uSea\)/, 'bed cannot reflect a second white water sheet');
assert.match(terrain, /gSplatAlbedo \*= 1\.0 - fMs \* uSea \* 0\.42/, 'only submerged liquid bed is darkened');
const kits = readFileSync(new URL('./maps/mapKits.ts', import.meta.url), 'utf8');
assert.match(kits, /const waterline = heightField\.getWaterSurfaceHeightAt\?\.\(x, z\)/);
assert.match(kits, /buoy\.translate\(x, waterline \+ 0\.16, z\)/);
assert.match(fx, /const surfaceY = water\s*\? heightField\?\.getWaterSurfaceHeightAt\?\.\(x, z\)/);
assert.match(fx, /surfaceY \+ \(water \? 0\.065 : 0\.035\)/);
assert.match(fx, /float ring = 0\.35 \+ \(1\.0 - vFade\) \* 0\.58/);
assert.match(fx, /printCenters\.fill\(1e9\)/, 'rematch reset clears wake admission');
console.log('shallowWater: bounded surface, four profiles, animated shared textures, frozen/dry isolation, cleanup and contact pass');
