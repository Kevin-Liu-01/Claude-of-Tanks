// Clouds 2.0 (2026-10-06): the layer stack every map's cloud preset resolves to (cloudLayers.ts), pinned without a GPU —
// every lane within the medium's bounds, the coverage law monotone and closing to a solid deck, the packing into the
// medium's vec4 lanes and its column-major channel matrix exactly what the GLSL (cloudShaders.ts) reads, and every
// shipped map's stack sane (a cumulus sky domed over a flat base, a deck flat on both faces, the lane aloft above the
// main one).
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { CLOUD_COLUMN_SHARE, CLOUD_LANES_MAX, cloudBsmSlices, cloudDeckTau, cloudGroundLight, cloudShellCover, cloudStackOf, packCloudStack } from './cloudLayers.ts';
import { deriveCloudLayerPreset, loadCloudscapeLayers } from './cloudPresets.ts';
import { DEFAULT_SKY_PRESET } from './sky.ts';
import { MAP_IDS } from '../world/maps/catalog.ts';
import { getMapConfig } from '../world/maps/index.ts';
import { MARS_SKY_PRESET } from './marsAtmosphere.ts';

await loadCloudscapeLayers();

// ---- the coverage law: monotone, zero at no coverage, a solid deck (cover 1) at full coverage
{
  let last = -1;
  for (let c = 0; c <= 1.0001; c += 0.02) {
    const v = cloudShellCover(c, false);
    assert.ok(v >= last - 1e-9, `the cover rises with the coverage (${c.toFixed(2)})`);
    assert.ok(v >= 0 && v <= 1);
    last = v;
  }
  assert.equal(cloudShellCover(0, false), 0);
  assert.ok(cloudShellCover(1, true) > 1, 'a closed deck admits every column, the thinnest too');
  assert.ok(cloudShellCover(0.86, true) < 0.9, 'a deck under the closing coverage keeps its breaks');
}

// ---- every shipped map's stack
const stacks = {};
for (const id of MAP_IDS) {
  const config = getMapConfig(id);
  if (!config) continue;
  const sky = id === 'mars' ? MARS_SKY_PRESET : { ...DEFAULT_SKY_PRESET, ...config.sky, cloudscape: config.clouds ?? null };
  if ((sky.cloudOpacity ?? 0) <= 0.01) continue;
  const preset = deriveCloudLayerPreset(sky);
  const stack = cloudStackOf(preset);
  stacks[id] = stack;
  assert.ok(stack.lanes.length >= 1 && stack.lanes.length <= CLOUD_LANES_MAX, `${id}: one to four lanes`);
  for (const [i, lane] of stack.lanes.entries()) {
    assert.ok(lane.topM > lane.baseM && lane.baseM > 0, `${id} lane ${i}: a slab over the ground`);
    assert.ok(lane.cover >= 0 && lane.cover <= 1.25 && lane.density > 0 && lane.density < 1, `${id} lane ${i}: cover and density`);
    assert.ok(lane.core > 0.3 && lane.core <= 1, `${id} lane ${i}: the shell's core density`);
    assert.ok(lane.bias > 0 && lane.filter > 0 && lane.filter <= 2, `${id} lane ${i}: shell law (a ramp up to twice the admitted share)`);
    const w = lane.channels.reduce((a, b) => a + b, 0) + lane.streets;
    assert.ok(w > 0.5 && w <= 2.01, `${id} lane ${i}: the weather channels carry the lane (${w.toFixed(2)})`);
  }
  for (let i = 1; i < stack.lanes.length; i++) assert.ok(stack.lanes[i].baseM >= stack.lanes[0].topM, `${id}: the lane aloft stands over the main one`);
  assert.equal(stack.lowM, Math.min(...stack.lanes.map((l) => l.baseM - (l.topM - l.baseM) * l.hang)), `${id}: the floor under the hanging cores`);
  const slices = cloudBsmSlices(stack);
  assert.ok(Number.isInteger(slices) && slices >= 24 && slices <= 64, `${id}: the shadow map's slices (${slices})`);
  assert.equal(stack.highM, Math.max(...stack.lanes.map((l) => l.topM)));
  // a cumulus sky's dome sits low (flat base, domed top); a deck is flat on both faces
  if (preset.stratiform < 0.3 && preset.cells < 0.3) assert.ok(stack.lanes[0].bias < 0.5, `${id}: a cumulus dome over a flat base`);
  if (preset.stratiform >= 0.7) assert.ok(stack.lanes[0].bias > 0.6, `${id}: a sheet flat on both faces`);
  // a deck's optical depth through its core: a stratocumulus' ten and more, never the fifty that drew black cores beside
  // white lines; a convective lane reads the cumuliform field, its large-scale field only an envelope
  const main = stack.lanes[0];
  if (main.flat > 0.5) {
    const tau = main.density * main.core * (main.topM - main.baseM);
    assert.ok(tau >= 9.9 && tau <= 40, `${id}: a deck's optical depth ${tau.toFixed(1)}`);
    assert.ok(main.cells >= 0.4 && main.hang > 0.1, `${id}: a deck's cells and lumpy underside`);
  } else if (main.channels[2] === 0) {
    assert.equal(main.channels[0], 1, `${id}: the cumuliform field`);
    assert.ok(main.envelope >= 0 && main.envelope < 1);
  }
}
assert.ok(stacks.monsoon.lanes[0].channels[0] === 1 && stacks.monsoon.lanes[0].envelope > 0.5, 'a front\'s towers gathered by the envelope, never the envelope\'s blobs');
assert.ok(stacks.monsoon.lanes[0].cover < 0.6, 'a front\'s towers stand apart');
assert.ok(cloudBsmSlices(stacks.monsoon) === 64 && cloudBsmSlices(stacks.winter) === 24, 'a front\'s towers take the most slices, a thin deck the least');
assert.ok(Object.keys(stacks).length >= 30, `every shipped battlefield resolves a stack (${Object.keys(stacks).length})`);
assert.ok(stacks.verdant.lanes.length === 1, 'a fair-weather sky: one cumulus lane at its condensation level (no confetti aloft)');
assert.ok(stacks.monsoon.lanes.length === 2, 'a front carries its debris aloft');
assert.ok(stacks.winter.lanes[0].cells > 0, 'a stratocumulus deck carries its cells');
// the closed decks closed (the skies lane, 2026-10-06): Titan Gorge's dense overcast and Whiteout's stratus admit every
// column at their own resolved coverage — a retune of either that reopens a hole fails here
for (const id of ['titan_gorge', 'whiteout']) assert.ok(stacks[id].lanes[0].cover >= 1, `${id}: a closed deck admits every column (${stacks[id].lanes[0].cover.toFixed(3)})`);

// ---- the light under the cover (2026-10-07): the open sky whole, a closed deck's share its diffuse transmittance raised
// by the ground's bounce — over snow the whiteout's even light, over dark ground about the transmittance alone
{
  for (const tau of [0, 5, 20, 60]) for (const rho of [0.1, 0.8]) assert.ok(Math.abs(cloudGroundLight(1, tau, rho) - 1) < 1e-12, 'an open sky passes all its light');
  assert.equal(cloudGroundLight(0, 0, 0.8), 1, 'a cover without depth passes all its light');
  let last = Infinity;
  for (let tau = 0; tau <= 80; tau += 4) { const v = cloudGroundLight(0.3, tau, 0.2); assert.ok(v < last + 1e-12, 'a deeper cover passes less'); last = v; }
  const whiteout = cloudGroundLight(0, cloudDeckTau(stacks.whiteout), 0.8), dark = cloudGroundLight(0, cloudDeckTau(stacks.whiteout), 0.1);
  assert.ok(whiteout > 0.55 && whiteout < 0.9, `snow under a closed deck: an even light (${whiteout.toFixed(3)})`);
  assert.ok(dark > 0.3 && dark < 0.45, `dark ground under the same deck: about its transmittance (${dark.toFixed(3)})`);
  assert.ok(cloudGroundLight(0, 1e6, 0.99) <= 2.5 * 1e-4 + 1e-9, 'the bounce never revives a black cover');
  const w = stacks.whiteout.lanes[0];
  assert.equal(cloudDeckTau(stacks.whiteout), w.density * w.core * (w.topM - w.baseM) * CLOUD_COLUMN_SHARE);
  assert.ok(cloudDeckTau(stacks.whiteout) > 10 && cloudDeckTau(stacks.titan_gorge) > 10, 'a closed deck is optically thick');
}

// ---- the packing: vec4 lanes, an absent lane without density, the channel matrix column-major as GLSL reads M * v
{
  const u = {};
  for (const k of ['uLayerBase', 'uLayerTop', 'uLayerCover', 'uLayerDensity', 'uLayerShape', 'uLayerDetail', 'uLayerBias', 'uLayerFilter',
    'uLayerExp', 'uLayerStreets', 'uLayerEnvelope', 'uLayerCells', 'uLayerWisp', 'uLayerFlat', 'uLayerHang', 'uLayerAnvil', 'uLayerCore', 'uLayerLumps', 'uProfA', 'uProfB', 'uProfC', 'uProfD', 'uLayerDiffuse']) u[k] = { value: new THREE.Vector4() };
  u.uLayerChannels = { value: new THREE.Matrix4() };
  u.uHeightRange = { value: new THREE.Vector2() };
  const stack = stacks.monsoon;
  packCloudStack(stack, u);
  assert.equal(u.uLayerBase.value.x, stack.lanes[0].baseM);
  assert.equal(u.uLayerTop.value.y, stack.lanes[1].topM);
  assert.equal(u.uLayerDensity.value.z, 0, 'an absent lane has no density');
  assert.equal(u.uLayerDensity.value.w, 0);
  assert.equal(u.uLayerEnvelope.value.x, stack.lanes[0].envelope);
  assert.deepEqual([u.uHeightRange.value.x, u.uHeightRange.value.y], [stack.lowM, stack.highM]);
  // GLSL: (M * v)[lane] = sum over channels k of M[column k][row lane] * v[k]; three's elements are column-major
  const weather = new THREE.Vector4(0.1, 0.2, 0.3, 0.4);
  const perLane = weather.clone().applyMatrix4(u.uLayerChannels.value);
  for (let i = 0; i < 2; i++) {
    const c = stack.lanes[i].channels;
    const want = c[0] * 0.1 + c[1] * 0.2 + c[2] * 0.3 + c[3] * 0.4;
    assert.ok(Math.abs(perLane.getComponent(i) - want) < 1e-6, `lane ${i}'s weather is its channel mix (${perLane.getComponent(i)} vs ${want})`);
  }
}

console.log(`cloudLayers selftest passed (${Object.keys(stacks).length} maps)`);
