import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Group, ShaderLib, Texture } from 'three';
import { createHeightField } from './terrain.ts';
import { getMapConfig } from './maps/index.ts';
import { createShallowWaterSurface, SEA_SHELF_WIDTH_M, seaShelfWidthM, shallowWaterGeometrySteps, shoreDistanceTexture, WAKE_FULL_SPEED_MPS } from './shallowWater.ts';
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

for (const [mapId, kind] of [['coastal', 'coast'], ['reservoir', 'lake'], ['delta', 'river'], ['mangrove', 'marsh'], ['polders', 'marsh']]) {
  const profile = waterContactProfile(mapId);
  assert.equal(profile.kind, kind);
  assert.ok(profile.depthM >= 0.4 && profile.depthM <= 0.8, 'bounded wheel-depth wading, no hidden drowning rule');
  assert.ok(profile.opacity >= 0.68 && profile.opacity <= 0.78);
  assert.ok(profile.waveScale > 0 && profile.waveStrength > 0);
  assert.equal(shallowWaterDepth(0, profile.depthM), 0);
  assert.equal(shallowWaterDepth(1, profile.depthM), profile.depthM);
  let previous = 0;
  for (let i = 0; i <= 100; i++) {
    const depth = shallowWaterDepth(i / 100, profile.depthM);
    assert.ok(depth >= previous && depth <= profile.depthM);
    previous = depth;
  }
}
assert.equal(new Set(['coastal', 'fjord', 'saltwind', 'reservoir', 'oasis', 'delta',
  'monsoon', 'autumn', 'mangrove', 'polders'].map(id => waterContactProfile(id).color)).size, 10,
  'each authored water climate has its own restrained body color');

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
// water pass 3 (2026-09-12): with the engine hook the material is handed over
// (cascaded-shadow setup) together with the water shader patch; without it the
// patch installs directly, as below.
{
  const handed = [];
  const routed = createShallowWaterSurface(surface.geometry, mask, waves, field.size, 'coastal', [0.4, 0.78],
    (material, hook) => handed.push({ material, hook }));
  assert.equal(handed.length, 1, 'one material joins the cascade setup');
  assert.equal(handed[0].material, routed.mesh.material);
  assert.equal(routed.mesh.material.onBeforeCompile.toString().includes('uWaterMask'), false,
    'the module leaves onBeforeCompile to the engine when a setup hook is given');
  const probe = { uniforms: {}, vertexShader: ShaderLib.standard.vertexShader, fragmentShader: ShaderLib.standard.fragmentShader };
  handed[0].hook(probe);
  assert.equal(probe.uniforms.uWaterMask.value, mask, 'the handed hook is the water shader patch');
  routed.mesh.material.dispose();
  const terrain = readFileSync(new URL('./terrain.ts', import.meta.url), 'utf8');
  // round 66 (2026-09-24): the call gained the FFT ocean as its last argument (was `: null);`)
  assert.match(terrain, /\(material, hook\) => engineCtx\.setupShadowMaterial\(material, hook\), ripples,\s*\/\/[^\n]*\n\s*seaOpenings\.length \? \{ \.\.\.materialStep\.value\.outlandWater, sectorBlend: seaOpeningsSectorBlend, openings: seaOpenings \} : null,\s*ocean\);/,
    'the terrain builder routes the sheet through the engine hook and hands it the reactive field and the ocean');
  assert.match(terrain, /const ripples = createWaterRippleField\(engineCtx\.renderer, \{/,
    'water pass 8: the field is built from the engine renderer inside the sea/lake block (null in receipts)');
  // water pass 8: without a field the sheet declares the sampler and an inactive window, and keeps its wake
  assert.equal(probe.uniforms.uWaterRipple.value, null, 'no field: an empty sampler');
  assert.equal(probe.uniforms.uWaterRippleParams.value.w, 0, 'no field: the window is inactive');
  assert.match(probe.fragmentShader, /if \(uWaterRippleParams\.w < 0\.5\) return 0\.0;/, 'an inactive window costs one compare');
  assert.match(probe.fragmentShader, /vec2 ruv = fract\(vWaterWorld\.xz \/ uWaterRippleParams\.x\);/,
    'the field is a torus over world space — the mapping never depends on the anchor');
  assert.match(probe.fragmentShader, /float proc = 1\.0 - waterRippleWindow\(wa\.xy\);/,
    'the hull-frame pattern is switched off for every slot the field covers');
  assert.match(probe.fragmentShader, /wakeFoam \+= bow \* smoothstep\(0\.35, 1\.0, spd\) \* 0\.8 \* str \* proc;/,
    'the procedural bow foam bar is off inside the window too (it was the last thing that followed the hull)');
  assert.match(probe.fragmentShader, /wave\.x \* uWaterWaveStrength - rippleGrad\.x \* 1\.6/, 'the field slope tilts the normal');
  assert.match(probe.fragmentShader, /rippleGrad \*= \(min\(gl, 0\.45\) \/ max\(gl, 1e-4\)\) \* rippleW;/, 'the slope is capped at a breaking face');
  assert.equal(routed.mesh.material.customProgramCacheKey(), 'shallow-water-v23-land', 'the program key moved with the fragment (v13: round 66, the FFT ocean; v22: 2026-10-04, the sea\'s shelf and swell; v23: 2026-10-05, the sea\'s second round)');
  // round 47: without a baked bay contour the apron keeps the round-40 ramp; with one, the coast fades past the edge
  assert.equal(probe.uniforms.uOutlandWaterSize.value, 0, 'no contour: size 0 keeps the round-40 ramp');
  assert.match(probe.fragmentShader, /float coast = texture2D\(uOutlandWater, vWaterWorld\.xz \/ uOutlandWaterSize \+ 0\.5\)\.r;/,
    'the apron reads the same raw bay coverage as the ground');
  assert.match(probe.fragmentShader, /wet = smoothstep\(uWaterRamp\.x, uWaterRamp\.y, coast \+ sector - coast \* sector\);/,
    'bay and offshore coverage join smoothly before the shared shore ramp');
}
assert.equal(water.mesh.material.transparent, true);
assert.equal(water.mesh.material.depthWrite, false);
assert.equal(water.mesh.material.envMapIntensity, 1, 'the sheet takes the sky\'s full image-based light (2026-10-08: the 0.55 and 0.9 it authored never applied, three overwrote them; the reflection\'s weight is uWaterQa\'s grazing law below, engine/materialEnvIntensity.ts)');
assert.equal(water.mesh.material.forceSinglePass, true, 'one draw, not the two-pass transparent default');
const shader = { uniforms: {}, vertexShader: ShaderLib.standard.vertexShader, fragmentShader: ShaderLib.standard.fragmentShader };
water.mesh.material.onBeforeCompile(shader);
assert.equal(shader.uniforms.uWaterMask.value, mask);
assert.equal(shader.uniforms.uWaterWave.value, waves, 'shares already-owned terrain textures');
assert.match(shader.fragmentShader, /if \(wet < 0\.015\) discard/);
// (2026-10-04: seaOpacity is the material's opacity wherever the coast's shelf law is off — every lake, river and marsh —
// so those shallows still reach full body quickly; an FFT coast's shelf is clear, the sea's turquoise over its sand)
assert.match(shader.fragmentShader, /smoothstep\(0\.0, 0\.55, wet\) \* mix\(mix\(seaOpacity, 0\.86, grazing\), 1\.0, smoothstep\(900\.0, 1600\.0, pastEdgeM\)\)/,
  'shallows reach full body quickly instead of showing bright sand through a pale cyan film');
// Water pass 4 (2026-09-13): the glint keeps most of its energy (F90 0.9, clamp
// 1.15) and the sky reflection is weighted by the water's own grazing term —
// a mirror toward the horizon, a window into the shallows underfoot.
assert.match(shader.fragmentShader, /material\.specularF90 = 0\.9/,
  'sun glitter keeps its energy; bloom carries it as sparkle');
// (2026-10-04: the reflection's weights, the specular cap and the body's grazing darkening are read per frame through the
// light model's QA hook — uWaterQa: x / y the sky's reflection at normal / grazing incidence, z the cap, w the darkening)
assert.match(shader.fragmentShader, /radiance \*= mix\(uWaterQa\.x, uWaterQa\.y, pow\(waterGrazing, uSeaLook\.x\)\)/,
  'sky reflection follows the grazing term instead of one flat envMapIntensity (2026-10-05: its exponent a QA knob)');
assert.match(shader.fragmentShader, /totalSpecular - vec3\(uWaterQa\.z\)/,
  'the specular clamp no longer deletes the glints');
// (2026-10-05, the sea's second round; the gauntlet's wave 78: the glitter "tops out at a dull grey-white that never clips"):
// on the open sea the sun's glints keep their energy over white while the sky's mirror keeps the cap; other water the joint cap
assert.match(shader.fragmentShader, /if \(uSeaLook\.w > 0\.0\) outgoingLight -= max\(vec3\(0\.0\), reflectedLight\.indirectSpecular - vec3\(uWaterQa\.z\)\)\s*\+ max\(vec3\(0\.0\), reflectedLight\.directSpecular - vec3\(uSeaLook\.w\)\);\s*else outgoingLight -= max\(vec3\(0\.0\), totalSpecular - vec3\(uWaterQa\.z\)\);/,
  'the open sea: the glints capped apart from the mirror');
// (2026-10-05) the sun's lobe sharp on the open sea, the sky's mirror at the profile's own roughness: one sharp roughness for
// both turned the far chop into white facets over dark troughs under the horizon (the environment's lookup follows the
// direct lights, so the roughness is restored between them)
assert.match(shader.fragmentShader, /#include <lights_physical_fragment>\nmaterial\.specularColor \*= 0\.85;\nmaterial\.specularF90 = 0\.9;\nfloat waterSkyRough = material\.roughness;\nmaterial\.roughness = max\(material\.roughness \* uSeaRough\.x, 0\.0525\);/,
  'the direct lights take the sharp share');
assert.match(shader.fragmentShader, /material\.roughness = waterSkyRough;\n#include <lights_fragment_maps>\nradiance \*= mix/, 'the sky\'s mirror the profile\'s roughness');
assert.ok(shader.fragmentShader.indexOf('#include <lights_fragment_begin>') < shader.fragmentShader.indexOf('material.roughness = waterSkyRough;'),
  'restored after the direct lights, before the environment');
assert.deepEqual(shader.uniforms.uSeaRough.value.toArray(), [1, 0, 0], 'a land water: the profile\'s roughness for both');
{
  const src = readFileSync(new URL('./shallowWater.ts', import.meta.url), 'utf8');
  assert.match(src, /seaLook\.value\.set\(lightTune\('WATER_GRAZE_POW', ocean \? 2 : 1\), shoreDist \? lightTune\('SEA_SHELF_BY_COAST', 1\) : 0,\s*lightTune\('SEA_SHELF_WIDTH_SCALE', 1\), ocean \? lightTune\('WATER_GLINT_CAP', 3\) : 0\);/,
    'the open sea: the mirror later toward the horizon, the shelf by the coast, the glints over white; lakes and rivers as before');
  assert.match(src, /seaRough\.value\.set\(ocean \? lightTune\('WATER_ROUGH', 0\.4\) : 1, 0, 0\);/,
    'the open sea\'s sun lobe sharp: the direct lights take 0.4 of the roughness');
}
assert.match(shader.fragmentShader, /diffuseColor\.rgb \*= 1\.0 - uWaterQa\.w \* grazing;/, 'the body darkens toward grazing');
assert.deepEqual(shader.uniforms.uWaterQa.value.toArray(), [0.45, 3.5, 1.15, 0.35], 'the reflection, cap and darkening as tuned (2026-10-04: the grazing reflection 1.75 → 3.5, the far band of the sea)');
// Water pass 4 (2026-09-13): the deep body darkens harder (0.70 -> 0.58) and the
// whole sheet loses 35 % of its body colour at grazing angles, where the sky
// reflection takes over.
// (2026-10-04: the coast's shelf law darkens its deep blue less, SEA_TINT.z; every other body keeps 0.58)
assert.match(shader.fragmentShader, /mix\(0\.90, mix\(0\.58, uSeaTint\.z, uSeaShelf\.x\), waterDeep\)/,
  'deep water remains darker than its bank, and the bank no longer brightens above the base tint');
assert.match(shader.fragmentShader, /1\.0 - uWaterQa\.w \* grazing/,
  'body colour yields to the sky toward the horizon');
// Water pass 2026-09-12: the bank-side hue rises out of the authored shallow
// tint (colour only — the alpha ramp above is unchanged, so no pale film over
// sand) and broken crests whiten the bank band at the authored foam strength.
// Water pass 5 (2026-09-13): the bank colour rises further into the body (0.02..0.90).
assert.match(shader.fragmentShader, /vec3 seaShallowCol = mix\(uWaterShallow, vec3\(0\.028, 0\.45, 0\.42\), uSeaTint\.x \* uSeaShelf\.x\);\s*vec3 seaDeepCol = mix\(diffuseColor\.rgb, vec3\(0\.006, 0\.065, 0\.195\), uSeaTint\.y \* uSeaShelf\.x\);\s*diffuseColor\.rgb = mix\(seaShallowCol, seaDeepCol, smoothstep\(0\.02, 0\.90, waterDeep\)\)/,
  'the shallow tint is a depth-mixed hue, never an opacity change');
assert.match(shader.fragmentShader, /foamBank \* 0\.55 \+ foamCrest \* 0\.45\) \* uWaterFoam/, 'shoreline and crest foam scale with the authored profile');
assert.equal(shader.uniforms.uWaterFoam.value, 0.85, 'coastal foam strength');
assert.ok(shader.uniforms.uWaterShallow.value.isColor, 'shallow tint uniform is a colour');
// Water pass 4 (2026-09-13): a third, finer ripple fetch feeds the normal only
// (sun sparkle); the colour breakup still reuses the two original fetches.
// Water pass 5 (2026-09-13): one more, very large-scale fetch of the same texture
// carries the turbidity/sediment colour variation of the body.
assert.equal((shader.fragmentShader.match(/texture2D\(uWaterWave/g) ?? []).length, 3,
  'two-scale waves plus one fine ripple layer; the pass-5 turbidity field is procedural noise, not a fetch');
assert.match(shader.fragmentShader, /float turbidity = waterTurbidityField\(vWaterWorld\.xz \+ drift \* 6\.0\);/,
  'the turbidity field is world-position value noise (a normal-map fetch hugs 0.5 and read as one flat sheet)');
assert.match(shader.fragmentShader, /float waterTurbidityField\(vec2 world\)/, 'two-octave value-noise helper');
// Water pass 6 (2026-09-14, owner: "more interactive") gave every vehicle in the water a slot of
// concentric rings. Water pass 7 (2026-09-20, owner: "right now it's just a bunch of radiating
// circles that follow you"): each slot is a hull footprint with a heading and a speed, and the
// shader builds a bow wave, two diverging arms, transverse waves and a wash lane in the hull frame.
assert.match(shader.fragmentShader, /uniform vec4 uWaterWakeA\[8\];\n\s*uniform vec4 uWaterWakeB\[8\];\n\s*uniform int uWaterWakeCount;/,
  'eight wake slots of two vec4 each (position + heading, speed + strength + footprint)');
assert.match(shader.fragmentShader, /if \(i >= uWaterWakeCount\) break;/, 'only the published slots are evaluated');
assert.match(shader.fragmentShader, /if \(dot\(rel, rel\) > reach \* reach\) continue;/, 'a fragment beyond a slot\'s reach skips that slot');
assert.doesNotMatch(shader.fragmentShader, /uWaterRipples|sin\(d \* 4\.2 - uWaterTime \* 6\.5/, 'the pass-6 concentric rings are gone');
assert.match(shader.fragmentShader, /float along = dot\(rel, fwd\);\n\s*float across = dot\(rel, side\);/, 'the wake is built in the hull frame');
assert.match(shader.fragmentShader, /wave \+= radial \* lap \* 0\.45 \* calm \* str \* proc \* smoothstep/, 'a standing hull only laps the water at its skirt');
assert.match(shader.fragmentShader, /float bowCentre = hl \+ 0\.6 \+ 1\.3 \* spd;/, 'the bow mound runs ahead of the bow with speed');
assert.match(shader.fragmentShader, /float armLine = hw \+ behindBow \* 0\.42;/, 'two arms diverge from the bow corners at about 23 degrees');
assert.match(shader.fragmentShader, /sin\(behindStern \* \(1\.25 \/ \(0\.4 \+ spd\)\) \+ uWaterTime \* 0\.8\)/, 'transverse waves lengthen with speed');
assert.match(shader.fragmentShader, /float trailLen = hl \+ 4\.0 \+ spd \* 22\.0;/, 'the wash lane fades over a speed-scaled trail');
assert.match(shader.fragmentShader, /wave \+= \(waveFine\.xy \* 2\.0 - 1\.0\) \* wash \* 1\.2;/, 'the wash lane churns the existing fine layer instead of a new fetch');
assert.match(shader.fragmentShader, /contactBand \* contactBreak \* \(0\.015 \+ 0\.10 \* mov0\)/, 'broken speed-dependent contact foam replaces the constant rectangular outline');
assert.match(shader.fragmentShader, /clamp\(wakeWash, 0\.0, 1\.0\) \* 0\.35 \* waterDeep/, 'the wash lane stirs bed sediment into the body colour');
assert.match(shader.fragmentShader, /clamp\(wakeFoam, 0\.0, 0\.85\) \* 0\.85/, 'churn whitens the surface');
assert.equal(shader.uniforms.uWaterWakeCount.value, 0, 'no vehicles published: no slots evaluated');
water.setDisturbances([
  { x: 12, z: -3, strength: 2, dirX: 0, dirZ: -3, speed: 20, halfLength: 3.9, halfWidth: 1.7 },
  { x: 1, z: 1, strength: 0.4 },
]);
assert.equal(shader.uniforms.uWaterWakeCount.value, 2);
assert.deepEqual(shader.uniforms.uWaterWakeA.value[0].toArray(), [12, -3, 0, -1], 'the heading is normalised');
assert.deepEqual(shader.uniforms.uWaterWakeB.value[0].toArray(), [1, 1, 3.9, 1.7],
  'speed (m/s over WAKE_FULL_SPEED_MPS) and strength clamp to 1; the footprint passes through');
assert.deepEqual(shader.uniforms.uWaterWakeA.value[1].toArray().slice(2), [0, 1], 'a slot without a heading faces +Z');
assert.deepEqual(shader.uniforms.uWaterWakeB.value[1].toArray(), [0, 0.4, 3.4, 1.8],
  'a slot without speed or footprint stands still on the default hull');
water.setDisturbances([{ x: 0, z: 0, strength: 1, speed: -WAKE_FULL_SPEED_MPS / 2, dirX: 0, dirZ: 0 }]);
assert.equal(shader.uniforms.uWaterWakeB.value[0].x, 0.5, 'half the full speed, sign ignored (the caller flips the heading when reversing)');
assert.deepEqual(shader.uniforms.uWaterWakeA.value[0].toArray().slice(2), [0, 1], 'a zero heading falls back to +Z');
water.setDisturbances(Array.from({ length: 12 }, (_, i) => ({ x: i, z: 0, strength: 1 })));
assert.equal(shader.uniforms.uWaterWakeCount.value, 8, 'the cap holds at eight slots');
water.setDisturbances([]);
assert.equal(shader.uniforms.uWaterWakeCount.value, 0);
// The battle loop publishes footprint, heading (flipped when reversing) and speed with every hull in the water.
const mainSource = readFileSync(new URL('../main.ts', import.meta.url), 'utf8');
assert.match(mainSource, /const rect = ent\.spec \? tankContactRect\(ent\.spec\) : null;\n\s*const travel = speed < -0\.05 \? -1 : 1;/,
  'the wake feed reads the hull footprint and the direction of travel');
assert.match(mainSource, /dirX: fx \* travel, dirZ: fz \* travel, speed: Math\.abs\(speed\),\n\s*halfLength: rect\?\.halfLength, halfWidth: rect\?\.halfWidth,/,
  'heading, speed and footprint ride with every published disturbance');
assert.match(shader.fragmentShader, /radiance \*= 1\.15 - 0\.55 \* smoothstep\(0\.35, 0\.85, waterTurbidity\);/, 'turbid patches mirror less sky');
assert.match(shader.fragmentShader, /waveFine\.xy \* 2\.0 - 1\.0\) \* 0\.35/, 'the fine layer is a weak normal perturbation');
assert.match(shader.fragmentShader, /broadWave.*fineWave/s,
  'two moving scales break up the body color instead of sliding one flat normal');
assert.match(shader.fragmentShader, /mix\(diffuseColor\.rgb, uWaterShore, waterBank \* \(0\.24 \+ broadWave \* 0\.12\)\)/,
  'shoreline receives a body-specific sediment tint');
assert.match(shader.fragmentShader, /uWaterWaveStrength/,
  'body-specific wave energy reaches the actual normal path');
assert.match(shader.fragmentShader, /material\.specularColor \*= 0\.85/, 'sun glints keep most of their energy (water pass 3: 0.16 -> 0.6; water pass 4: 0.85, the sheet joined the cascade setup)');
assert.match(shader.fragmentShader, /totalSpecular - vec3\(uWaterQa\.z\)/, 'liquid highlight energy stays bounded (water pass 3: 0.18 -> 0.55; water pass 4: 1.15 so bloom carries the glints as sparkle)');
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
assert.match(fx, /float ring = 0\.28 \+ \(1\.0 - vFade\) \* 0\.66/);
assert.match(fx, /printCenters\.fill\(1e9\)/, 'rematch reset clears wake admission');
// 2026-10-04 (the gauntlet's wave 59 on the sea: a navy bay "right up to a hard sand edge, with no shallow-water shelf",
// "one fine, uniform ripple pattern with no swell or wave-group structure"): the coast's shelf and swell.
{
  // the shore distance: a half-plane mask (dry west of x = 0.25 of the square, wet east of it) on 64² over 256 m —
  // the field is 0 on the land and grows a metre a metre across the water (chamfered: exact along the axis)
  const W = 64, data = new Uint8Array(W * W * 4);
  for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) data[(j * W + i) * 4 + 2] = i >= 16 ? 255 : 0;
  const tex = shoreDistanceTexture({ image: { data, width: W, height: W } }, 256, 0.3);
  assert.ok(tex && tex.image.width === 64, 'a field on the mask\'s grid (at most 512²)');
  const at = (i, j = 20) => tex.image.data[(j * 64 + i) * 2];
  assert.equal(tex.image.data[(20 * 64 + 40) * 2 + 1], 0, 'no rise read: no per-coast width');
  // (2026-10-05) the shelf's width follows the coast: a beach rising 1.5 m over 30 m holds a 50 m shelf, a cliff rising
  // 24 m a narrow one (the floor), carried from the nearest shore cell to every water cell
  const beach = shoreDistanceTexture({ image: { data, width: W, height: W } }, 256, 0.3, () => 0.05);
  assert.equal(beach.image.data[(20 * 64 + 40) * 2 + 1], Math.round(seaShelfWidthM(0.05)), 'a beach: 25 m');
  // (2026-10-05: K 2.5 → 1.25 and the cap 120 → 60 m — the sweep's half: a graded bay, not a turquoise one)
  assert.equal(seaShelfWidthM(0.05), 25);
  assert.equal(seaShelfWidthM(0.005), SEA_SHELF_WIDTH_M[1], 'a flat shore: the cap');
  assert.equal(SEA_SHELF_WIDTH_M[1], 60);
  const cliff = shoreDistanceTexture({ image: { data, width: W, height: W } }, 256, 0.3, () => 0.8);
  assert.equal(cliff.image.data[(20 * 64 + 40) * 2 + 1], SEA_SHELF_WIDTH_M[0], 'a cliff: the floor');
  assert.equal(at(10), 0, 'dry land: 0');
  assert.equal(at(16), 4, 'the first wet cell: one cell (4 m) from the last dry one');
  assert.equal(at(40), 100, '24 cells (96 m) further: 100 m');
  assert.equal(at(63), 192, 'and on to the far edge');
  assert.equal(shoreDistanceTexture({ image: { width: 8, height: 8 } }, 256, 0.3), null, 'no CPU data, no field (the law stays off)');
}
assert.match(shader.fragmentShader, /seaShoreM = seaShore\.x \+ \(uSeaShelf\.x > 0\.0 \? max\(pastEdgeM, 0\.0\) : 0\.0\);[\s\S]{0,200}seaShelfM = mix\(uSeaShelf\.y, max\(seaShore\.y \* uSeaLook\.z, 4\.0\), uSeaLook\.y \* step\(0\.5, seaShore\.y\)\);\s*waterDeep = mix\(waterDeep, 1\.0 - exp\(-seaShoreM \/ seaShelfM\), uSeaShelf\.x\);/,
  'the body\'s share rises over the shelf, metres from the shore (past the edge, plus the metres out — never minus inside the square)');
assert.match(shader.fragmentShader, /float seaOpacity = mix\(opacity, mix\(uSeaShelf\.w, opacity, 1\.0 - exp\(-seaShoreM \/ \(uSeaShelf\.z \* seaShelfM \/ uSeaShelf\.y\)\)\), uSeaShelf\.x\);/, 'clear over the shelf (its clarity scaled with the width)');
assert.match(shader.fragmentShader, /wave \*= uOceanGrid\.w > 0\.5 \? uSwell\.w : 1\.0;/, 'the tiled ripple steps back on an FFT sea');
assert.match(shader.fragmentShader, /- oceanN\.x - swellN\.x, 1\.0,/, 'the swell joins the normal');
assert.match(shader.fragmentShader, /float swellFoot = length\(fwidth\(vWaterWorld\.xz\)\);[\s\S]{0,200}if \(uSwell\.x > 0\.0 && swellFoot < uSwell\.y \* 0\.41\) \{/,
  'the trains only where a pixel can hold the longest (1.17 x 0.35 of the length; the derivative outside the branch)');
assert.equal(shader.uniforms.uSeaShelf.value.x, 0, 'a land map (no FFT ocean): no shelf law');
{
  const src = readFileSync(new URL('./shallowWater.ts', import.meta.url), 'utf8');
  assert.match(src, /const SEA_SHELF = Object\.freeze\(\{ colourM: 25, alphaM: 15, shallowAlpha: 0\.35 \}\);/, 'a 25 m colour shelf (45 turned a whole bay turquoise)');
  assert.match(src, /const SEA_TINT = Object\.freeze\(\{ turquoise: 0\.6, deepBlue: 0\.8, deepDarken: 0\.5 \}\);/, 'the deep blue, not teal or navy (2026-10-05: its body darker, 0.7 → 0.5)');
  assert.match(src, /const SEA_SWELL = Object\.freeze\(\{ slope: 0\.08, lengthM: 55, classicNormal: 0\.6 \}\);/, 'a swell that reads under the chop');
}
assert.equal(shader.uniforms.uSwell.value.x, 0, 'and no swell');
assert.equal(shader.uniforms.uSwell.value.w, 1, 'and its tiled ripple whole');

console.log('shallowWater: bounded surface, four profiles, animated shared textures, frozen/dry isolation, cleanup and contact pass');
