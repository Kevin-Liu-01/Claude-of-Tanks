// Round 73 (2026-09-25, the ground redux; owner: "add tall grass that interacts with tanks"): the tall-grass tier.
// Deterministic cells, the admission rules (roads and shoulders, water, soft ground, steep faces, worked ground,
// sealed footprints, village ground, hollows), the two rings and their fades, the blade geometry, the quality knob,
// the reeds, the shader (the press, the root-anchored shadow, the scope corridor), the engine hooks and the world
// wiring — with no renderer (the press field is null and the sward stands).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import {
  TALL_GRASS, buildTallGrassClumpGeometry, buildTallGrassFarGeometry, createTallGrass, tallGrassShaderSource,
} from './tallGrass.ts';
import { resolveGroundReduxProfile } from './groundRedux.ts';
import { MAP_IDS } from './maps/catalog.ts';
import { PRESETS } from '../engine/quality.ts';

const height = (x, z) => 0.4 * Math.sin(x * 0.1) + 0.2 * Math.cos(z * 0.13);
const field = {
  getHeightAt: height,
  getHeightAtFast: height,
  _roadDist: (x) => Math.abs(x - 5),                                        // a road along z at x = 5
  getGroundType: (x, z) => (Math.hypot(x + 20, z - 15) < 6 ? 'soft' : 'medium'),
  getNormalAt: (x, z) => (z > 30 ? { x: 0.6, y: 0.7, z: 0.39 } : { x: 0, y: 1, z: 0 }),
  _noVeg: (x) => x < -30,                                                   // worked yards west
  getWaterMaskAt: (x, z) => (z < -20 ? 1 : 0),
  _villageMask: (x, z) => (x > 30 && z > 5 ? 1 : 0),                        // the trodden village NE
  _foldAt: (x, z) => (Math.hypot(x + 8, z - 8) < 7 ? 0.9 : 0),               // a hollow
};
const blocked = (x, y, z) => Math.hypot(x - 20, z + 10) < 5;                // a sealed building footprint
const meadow = resolveGroundReduxProfile('verdant').grass;
const settle = (grass, camera, n = 600) => {
  // at least one update (a knob or camera change is only noticed there), then until both rings are published and idle
  for (let i = 0; i < n; i++) {
    grass.update(1 / 60, camera, null, null);
    const s = grass.getState();
    if (s.near.publishes && s.far.publishes && !s.near.pending && !s.far.pending) break;
  }
};
const roots = (mesh) => {
  const a = mesh.instanceMatrix.array, out = [];
  for (let i = 0; i < mesh.count; i++) out.push([a[i * 16 + 12], a[i * 16 + 13], a[i * 16 + 14]]);
  return out;
};
const blades = (mesh) => {
  const a = mesh.geometry.getAttribute('aBlade').array, out = [];
  for (let i = 0; i < mesh.count; i++) out.push([a[i * 4], a[i * 4 + 1], a[i * 4 + 2], a[i * 4 + 3]]);
  return out;
};
const cam = new THREE.Vector3(0, 2, 0);

// 1. The blade geometry: a clump of three strips, three segments each; the far ring's single triangle blade.
{
  const clump = buildTallGrassClumpGeometry();
  assert.equal(clump.getAttribute('position').count, 3 * 7, 'three blades of seven vertices');
  assert.equal(clump.index.count, 3 * 5 * 3, 'fifteen triangles');
  const far = buildTallGrassFarGeometry();
  assert.equal(far.getAttribute('position').count, 3); assert.equal(far.index.count, 3, 'one triangle blade');
  const p = clump.getAttribute('position');
  for (let v = 0; v < p.count; v++) {
    assert.ok(p.getX(v) >= -0.5 && p.getX(v) <= 0.5, 'x is the across coordinate');
    assert.ok(p.getY(v) >= 0 && p.getY(v) <= 1, 'y is the height fraction');
  }
  assert.deepEqual(Object.keys(clump.attributes).sort(), ['normal', 'position']);
  assert.deepEqual([...buildTallGrassClumpGeometry().getAttribute('position').array], [...p.array], 'deterministic');
  for (const i of clump.index.array) assert.ok(i >= 0 && i < p.count);
  clump.dispose(); far.dispose();
}

// 2. Gates: the mobile tier, a map without a sward, a zero quality knob.
{
  const mobile = createTallGrass(field, { tier: 'mobile', biome: meadow, qualityScale: () => 1 });
  assert.equal(mobile.group.visible, false); assert.equal(mobile.pressure, null);
  mobile.update(1 / 60, cam); assert.equal(mobile.getState().enabled, false); assert.equal(mobile.near.count, 0);
  mobile.dispose();
  const desert = createTallGrass(field, { tier: 'desktop', mapId: 'desert', qualityScale: () => 1 });
  assert.equal(desert.group.visible, false, 'the desert grows no sward');
  desert.update(1 / 60, cam); assert.equal(desert.getState().near.builds, 0);
  desert.dispose();
  const off = createTallGrass(field, { tier: 'desktop', biome: meadow, qualityScale: () => 0 });
  settle(off, cam, 20);
  assert.equal(off.near.count, 0); assert.equal(off.getState().near.builds, 0, 'a zero knob builds nothing');
  off.dispose();
}

// 3. A settled ring under the camera: counts, exclusions, ground fit, the hollow, the blade attribute.
const grass = createTallGrass(field, { seed: 11, tier: 'desktop', biome: meadow, blocked, qualityScale: () => 1 });
assert.equal(grass.group.name, 'tall-grass');
assert.deepEqual(grass.group.children.map((m) => m.name), ['tall-grass-near', 'tall-grass-far']);
for (const mesh of [grass.near, grass.far]) {
  assert.equal(mesh.castShadow, false, 'blades cast no shadow');
  assert.equal(mesh.receiveShadow, true, 'blades receive shadow (at the root)');
  assert.equal(mesh.frustumCulled, false);
  assert.ok(mesh.material.isMeshLambertMaterial && mesh.material.side === THREE.DoubleSide, 'an opaque, textureless, double-sided Lambert strip');
  assert.equal(mesh.material.map, null); assert.equal(mesh.material.alphaTest, 0);
}
assert.equal(grass.near.material.customProgramCacheKey(), TALL_GRASS.near.programKey);
assert.equal(grass.far.material.customProgramCacheKey(), TALL_GRASS.far.programKey);
grass.update(1 / 60, cam);
assert.ok(grass.getState().near.pending > 0, 'a fresh ring builds over several updates');
settle(grass, cam);
const state = grass.getState();
assert.equal(state.near.pending, 0); assert.equal(state.far.pending, 0);
assert.equal(state.near.cells, (TALL_GRASS.near.ring * 2 + 1) ** 2); assert.equal(state.far.cells, (TALL_GRASS.far.ring * 2 + 1) ** 2);
assert.equal(state.near.builds, state.near.cells); assert.equal(state.far.builds, state.far.cells);
assert.ok(state.near.publishes >= 1 && state.far.publishes >= 1);
assert.ok(state.near.count > 2000, `the near ring carries thousands of clumps (${state.near.count})`);
assert.ok(state.far.count > 300, `the far ring carries hundreds of blades (${state.far.count})`);
assert.equal(state.near.truncated, 0); assert.equal(state.far.truncated, 0);
assert.equal(grass.near.count, state.near.count); assert.equal(grass.far.count, state.far.count);
const nearRoots = roots(grass.near), farRoots = roots(grass.far);
const nearHalf = (TALL_GRASS.near.ring + 1) * TALL_GRASS.near.cellM, farHalf = (TALL_GRASS.far.ring + 1) * TALL_GRASS.far.cellM;
for (const [list, half] of [[nearRoots, nearHalf], [farRoots, farHalf]]) {
  for (const [x, y, z] of list) {
    assert.ok(Math.abs(x - 5) >= TALL_GRASS.roadKeepOutM, `off the carriageway (${x.toFixed(2)})`);
    assert.ok(z >= -20, 'off water');
    assert.ok(z <= 30, 'off steep faces');
    assert.ok(x >= -30, 'off worked ground');
    assert.ok(Math.hypot(x - 20, z + 10) >= 5 - 0.2, 'out of sealed footprints');
    assert.ok(Math.abs(y - height(x, z)) < 1e-4, 'rooted on the ground');
    assert.ok(Math.abs(x) <= half && Math.abs(z) <= half, 'inside its ring');
  }
}
const perM2 = (list, cx, cz, r) => list.filter(([x, , z]) => Math.hypot(x - cx, z - cz) < r).length / (Math.PI * r * r);
const soft = perM2(nearRoots, -20, 15, 5), open = perM2(nearRoots, 15, 20, 8), hollow = perM2(nearRoots, -8, 8, 5), village = perM2(nearRoots, 40, 20, 8);
assert.ok(soft < open * 0.6, `soft ground thins the sward (${soft.toFixed(2)} vs ${open.toFixed(2)} per m²)`);
assert.ok(hollow > open * 1.15, `the hollow thickens it (${hollow.toFixed(2)} vs ${open.toFixed(2)} per m²)`);
assert.ok(village < open * 0.3, `the village ground is trodden (${village.toFixed(2)} vs ${open.toFixed(2)} per m²)`);
const shoulder = nearRoots.filter(([x]) => Math.abs(x - 5) >= TALL_GRASS.roadKeepOutM && Math.abs(x - 5) < 6).length;
const verge = nearRoots.filter(([x]) => Math.abs(x - 5) >= 12 && Math.abs(x - 5) < 13.4).length;
assert.ok(shoulder < verge * 0.7, `the shoulder thins toward the road (${shoulder} vs ${verge})`);
const nearBlades = blades(grass.near);
let hollowHeight = 0, hollowN = 0, openHeight = 0, openN = 0;
nearBlades.forEach(([yaw, h, w, r], i) => {
  assert.ok(yaw >= 0 && yaw < Math.PI * 2 + 1e-6 && h > 0.3 && h <= 1.9 && w > 0.02 && w < 0.12 && r >= 0 && r < 1, 'blade yaw / height / width / random inside their bands');
  const [x, , z] = nearRoots[i];
  if (Math.hypot(x + 8, z - 8) < 5) { hollowHeight += h; hollowN++; } else if (Math.hypot(x - 15, z - 20) < 8) { openHeight += h; openN++; }
});
assert.ok(hollowHeight / hollowN > openHeight / openN * 1.1, 'blades stand taller in the hollow');
const colors = grass.near.instanceColor.array;
for (let i = 0; i < grass.near.count * 3; i++) assert.ok(colors[i] > 0.4 && colors[i] <= 1.6, 'tints jitter inside their band');
assert.ok(blades(grass.far).every(([, , w]) => w > meadow.widthM * TALL_GRASS.farWidth * 0.8 - 1e-9), 'far blades are wider (one strip carries the read)');

// 4. Determinism and seeds; the quality knob halves the sward.
{
  const twin = createTallGrass(field, { seed: 11, tier: 'desktop', biome: meadow, blocked, qualityScale: () => 1 });
  settle(twin, cam);
  assert.equal(twin.near.count, grass.near.count);
  assert.deepEqual([...twin.near.instanceMatrix.array.slice(0, grass.near.count * 16)], [...grass.near.instanceMatrix.array.slice(0, grass.near.count * 16)], 'same seed, same sward');
  const other = createTallGrass(field, { seed: 12, tier: 'desktop', biome: meadow, blocked, qualityScale: () => 1 });
  settle(other, cam);
  assert.notDeepEqual([...other.near.instanceMatrix.array.slice(0, 64)], [...grass.near.instanceMatrix.array.slice(0, 64)], 'another seed grows differently');
  const half = createTallGrass(field, { seed: 11, tier: 'desktop', biome: meadow, blocked, qualityScale: () => 0.5 });
  settle(half, cam);
  assert.ok(half.near.count > grass.near.count * 0.4 && half.near.count < grass.near.count * 0.62, `Medium halves the sward (${half.near.count} vs ${grass.near.count})`);
  twin.dispose(); other.dispose(); half.dispose();
}

// 5. A live knob change re-seeds the rings.
{
  let q = 1;
  const live = createTallGrass(field, { seed: 11, tier: 'desktop', biome: meadow, blocked, qualityScale: () => q });
  settle(live, cam);
  const full = live.near.count;
  q = 0.25; settle(live, cam);
  assert.ok(live.near.count < full * 0.4, `Low keeps a quarter (${live.near.count} vs ${full})`);
  assert.equal(live.getState().quality, 0.25);
  q = 0; live.update(1 / 60, cam); assert.equal(live.near.count, 0, 'a zero knob clears the sward');
  live.dispose();
}

// 6. Streaming: one cell east builds one column; the return trip is served from the cache; the cache is bounded.
{
  const before = grass.getState().near.builds;
  const east = new THREE.Vector3(TALL_GRASS.near.cellM + 1, 2, 0);
  settle(grass, east);
  assert.equal(grass.getState().near.builds, before + TALL_GRASS.near.ring * 2 + 1, 'one new column of near cells');
  settle(grass, cam);
  assert.equal(grass.getState().near.builds, before + TALL_GRASS.near.ring * 2 + 1, 'the return trip built nothing');
  assert.equal(grass.near.count, state.near.count, 'the cached ring republishes identically');
  for (let i = 0; i < 60; i++) settle(grass, new THREE.Vector3(i * TALL_GRASS.near.cellM, 2, 400));
  assert.ok(grass.getState().near.cached <= TALL_GRASS.cacheCells, 'the cell cache is bounded');
}

// 7. Reeds grow in the shallows and nowhere on open water; the still bank keeps the meadow off.
{
  const wetField = { ...field, getWaterMaskAt: (x, z) => (z < -20 ? 1 : z < 0 ? 0.3 : 0), getGroundType: () => 'medium' };
  const reeds = createTallGrass(wetField, { seed: 3, tier: 'desktop', biome: resolveGroundReduxProfile('delta').grass, blocked, qualityScale: () => 1 });
  settle(reeds, cam);
  const rr = roots(reeds.near);
  assert.ok(rr.some(([, , z]) => z < 0 && z >= -20), 'reeds stand in the shallows');
  assert.ok(rr.every(([, , z]) => z >= -20), 'and never on open water');
  const shallow = rr.filter(([, , z]) => z < 0).length / 20, bank = rr.filter(([, , z]) => z >= 0 && z < 20).length / 20;
  assert.ok(shallow > bank, `reeds are densest in the water band (${shallow.toFixed(0)} vs ${bank.toFixed(0)} per band row)`);
  reeds.dispose();
  const dry = createTallGrass(wetField, { seed: 3, tier: 'desktop', biome: meadow, blocked, qualityScale: () => 1 });
  settle(dry, cam);
  assert.ok(roots(dry.near).every(([, , z]) => z >= 0), 'a meadow keeps off the water band');
  dry.dispose();
}

// 8. The shader: every dimension from the instance attribute, the press from the field, the shadow at the root,
//    the scope corridor, the lens clear, the root-to-tip gradient and the bruise.
{
  const { vertexShader, fragmentShader } = tallGrassShaderSource();
  for (const term of [
    'attribute vec4 aBlade;', 'vec4 p = texture2D(uPress, fract(root.xz / uPressParams.x));', 'float ang = press * uBend;',
    'vec3 up = vec3(pdir.x * sin(ang), cos(ang), pdir.y * sin(ang));', 'worldPosition = modelMatrix * cotGrassShadowWorld;',
    'fade *= mix(1.0, nearBand * rayBand, uSniperFade);', `smoothstep(${TALL_GRASS.lensClearM[0].toFixed(2)}, ${TALL_GRASS.lensClearM[1].toFixed(2)}, dCam)`,
    'float hgt = aBlade.y * fade;', 'float taper = 1.0 - 0.72 * t;',
  ]) assert.ok(vertexShader.includes(term), `vertex: ${term}`);
  assert.ok(vertexShader.indexOf('float cotYaw = aBlade.x + position.z;') < vertexShader.indexOf('vec3 transformed;'), 'the yaw is set with the normal, before the strip');
  assert.ok(fragmentShader.includes(`diffuseColor.rgb *= mix(uGrassBase, uGrassTip, pow(vBladeT, uBladeGamma)) * uBladeLift * (1.0 - ${TALL_GRASS.crushDarken.toFixed(2)} * vBladeCrush);`), 'dark roots, lit tips (per-ring gradient and lift), bruised where crushed');
  assert.ok(TALL_GRASS.crushDarken >= 0.2 && TALL_GRASS.crushDarken <= 0.4, 'a bruise, not a burn');
  assert.ok(fragmentShader.includes('normal = normalize( vNormal );'), 'both faces of a strip light the same way');
  assert.ok(!vertexShader.includes('uv.'), 'no uv attribute: the height fraction is position.y');
}

// 9. The engine hooks: both materials join the cascaded-shadow setup and are released with the tier; the sniper fade.
{
  const calls = [], released = [];
  const csm = createTallGrass(field, { seed: 5, tier: 'desktop', biome: meadow, qualityScale: () => 1,
    setupMaterial: (material, hook) => { calls.push({ material, hook }); material.onBeforeCompile = hook; }, releaseMaterial: (m) => released.push(m) });
  assert.equal(calls.length, 2, 'the near and the far material are set up once each');
  assert.deepEqual(calls.map((c) => c.material), [csm.near.material, csm.far.material]);
  const freshShader = () => ({ uniforms: {}, vertexShader: '#include <common>\n#include <beginnormal_vertex>\n#include <begin_vertex>\n#include <shadowmap_vertex>', fragmentShader: '#include <common>\n#include <normal_fragment_begin>\n#include <color_fragment>' });
  const shader = freshShader();
  calls[0].hook(shader);
  assert.deepEqual(shader.uniforms.uGrassFade.value.toArray(), [...TALL_GRASS.near.fade], 'the near ring fades out at 38–46 m');
  const farShader = freshShader();
  calls[1].hook(farShader);
  assert.deepEqual(farShader.uniforms.uGrassFade.value.toArray(), [...TALL_GRASS.far.fade], 'the far ring fades in at 34–46 m and out at 104–120 m');
  assert.equal(shader.uniforms.uBladeGamma.value, TALL_GRASS.bladeGamma.near, 'the near clump keeps a dark root');
  assert.equal(farShader.uniforms.uBladeGamma.value, TALL_GRASS.bladeGamma.far, 'the far blade takes its tip colour early (seen from above it is mostly root)');
  assert.ok(TALL_GRASS.bladeGamma.far < TALL_GRASS.bladeGamma.near && TALL_GRASS.farWidth > 1 && TALL_GRASS.farWidth < 2.5);
  assert.equal(shader.uniforms.uBladeLift.value, TALL_GRASS.bladeLift.near);
  assert.equal(farShader.uniforms.uBladeLift.value, TALL_GRASS.bladeLift.far, 'the far ring lifts a third so the mid-distance sward stays as light as the meadow');
  assert.ok(TALL_GRASS.bladeLift.far > 1 && TALL_GRASS.bladeLift.far <= 1.5 && TALL_GRASS.bladeLift.near === 1);
  assert.equal(shader.uniforms.uWindTime, farShader.uniforms.uWindTime, 'one clock, one camera, one press field for both rings');
  csm.setSniperFade(1, true); assert.equal(shader.uniforms.uSniperFade.value, 1);
  csm.setSniperFade(0); csm.update(1, cam); assert.ok(shader.uniforms.uSniperFade.value < 0.01, 'the fade eases out');
  csm.setWindTime(7); assert.equal(shader.uniforms.uWindTime.value, 7);
  csm.dispose();
  assert.deepEqual(released, [csm.near.material, csm.far.material], 'dispose releases both materials from the shadow setup');
  assert.equal(csm.group.parent, null);
}
grass.dispose();

// 10. The biomes and the wiring: every map, the world, the quality presets.
for (const id of MAP_IDS) {
  const g = createTallGrass(field, { tier: 'desktop', mapId: id, qualityScale: () => 1 });
  assert.equal(g.group.visible, !!resolveGroundReduxProfile(id).grass, `${id}: the sward follows its profile`);
  g.dispose();
}
const map = readFileSync(new URL('./map.ts', import.meta.url), 'utf8');
assert.match(map, /createTallGrass\(heightField, \{/, 'the world builds the tier on its height field');
assert.match(map, /blocked: createGroundCoverClearance\(queryObstacles\)/, 'kept out of the sealed footprints');
assert.match(map, /splatNoise: sampleSplatNoise,/, 'thinned by the terrain\'s own dirt fields');
assert.match(map, /tallGrass\.update\(dt, cameraPos, focusPos, cameraFwd\)/, 'the frame update streams the rings and steps the press');
assert.match(map, /tallGrass\.dispose\(\)/, 'released with the world');
assert.match(map, /tallGrass\.setWindTime\(t\)/, 'frozen with the world clock');
assert.match(map, /tallGrass\.setSniperFade\(f, immediate\)/, 'cleared from the scope with the tufts');
assert.ok(map.includes('setupMaterial: (material, hook) => engineCtx.setupShadowMaterial?.(material, hook),')
  && map.includes('releaseMaterial: (material) => engineCtx.releaseShadowMaterial?.(material),'), 'the world folds the materials into the cascaded-shadow setup');
assert.equal(PRESETS.high.tallGrass, 1); assert.equal(PRESETS.ultra.tallGrass, 1); assert.equal(PRESETS.medium.tallGrass, 0.5); assert.equal(PRESETS.low.tallGrass, 0.25);
assert.equal(PRESETS.mobile.tallGrass, undefined, 'the mobile tier keeps today\'s ground');

console.log('tallGrass.selftest: blade geometry, gates, a settled ring (exclusions, hollows, shoulders, tints), determinism, the quality knob, streaming, reeds, the shader, the engine hooks and the world wiring passed');
