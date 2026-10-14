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
import { bakeCloudLocalWeather, CLOUD_LOCAL_SIZE } from './cloudNoise.ts';

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
  // (round 8, 2026-10-07: calibrated on the dome's cover — cloudDeckCover.selftest — a broken deck admits a little over its
  // coverage, since its shape and cells carve what it admits, and stays under 1 below the closing coverage)
  assert.ok(cloudShellCover(0.86, true) < 1 && cloudShellCover(0.86, true) > 0.86, 'a deck under the closing coverage keeps its breaks');
  assert.ok(Math.abs(cloudShellCover(0.62, true) - 0.68) < 0.01, 'a broken deck at 0.62 admits 0.68');
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
// (round 9, 2026-10-07: a front sheds its debris aloft — wave 235's "hazy translucent smear over the sun and confetti-like
// popcorn fragments" — and its towers are solid, their core over the cumulus' 0.46)
assert.ok(stacks.monsoon.lanes.length === 1, 'a front\'s towers alone, no debris aloft');
assert.ok(Math.abs(stacks.monsoon.lanes[0].core - 0.74) < 1e-9 && stacks.verdant.lanes[0].core === 0.46, 'a front\'s towers solid, a fair-weather cumulus carved');
assert.ok(stacks.fjord.lanes.length === 2, 'a broken deck keeps its thin veil aloft');
assert.ok(stacks.winter.lanes[0].cells > 0, 'a stratocumulus deck carries its cells');
// the closed decks closed (the skies lane, 2026-10-06): Whiteout's stratus — and every deck its map closes (coverage 0.95
// and over) — admits every column at its own resolved coverage; a retune that reopens a hole fails here. (Titan Gorge's
// dense overcast was one until the map-revival lane gave Monument Valley its fair-weather cumulus, 2026-10-05.)
{
  const closed = Object.keys(stacks).filter((id) => {
    const config = getMapConfig(id);
    const p = deriveCloudLayerPreset(id === 'mars' ? MARS_SKY_PRESET : { ...DEFAULT_SKY_PRESET, ...config.sky, cloudscape: config.clouds ?? null });
    return p.coverage >= 0.95 && p.stratiform >= 0.7;
  });
  assert.ok(closed.includes('whiteout'), `Whiteout's stratus is a closed deck (${closed.join(', ')})`);
  for (const id of closed) assert.ok(stacks[id].lanes[0].cover >= 1, `${id}: a closed deck admits every column (${stacks[id].lanes[0].cover.toFixed(3)})`);
}

// ---- a broken deck covers the sky everywhere, broken by its cells (round 6, 2026-10-07: on the stratiform field's
// sixteen-kilometre features alone the fjord's sky-w view was clear to the horizon — 7.5 % of 10 km windows over the
// weather tile nearly clear). Over the real local weather bake at the lane's core: the shell's admission, its ramp and
// the cells' gaps (cloudShaders.ts cl2Shell, the cells unstretched), the share of 10 km windows under a tenth covered —
// at most a tenth of the deck's open share.
{
  const N = CLOUD_LOCAL_SIZE, tex = bakeCloudLocalWeather(N), px = 48000 / N;
  const at = (i, c) => tex[i * 4 + c] / 255;
  const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  for (const [id, st] of Object.entries(stacks)) {
    const lane = st.lanes[0];
    if (!(lane.flat > 0.3 && lane.cover < 1)) continue;
    const on = new Uint8Array(N * N);
    const gapOn = lane.cells * Math.min(1, Math.max(0, (1 - lane.cover) * 8));
    for (let i = 0; i < N * N; i++) {
      const w = lane.channels[0] * at(i, 0) + lane.channels[1] * at(i, 1) + lane.channels[2] * at(i, 2) + lane.channels[3] * at(i, 3);
      let d = Math.min(1, Math.max(0, (w - (1 - lane.cover)) / Math.max(lane.cover * lane.filter, 0.02)));
      const k = 1 + (sm(0.15, 0.85, at(i, 3)) - 1) * lane.cells;
      d *= 1 + (sm(0.03, 0.32, k) - 1) * gapOn;
      on[i] = d > 0.05 ? 1 : 0;
    }
    const win = Math.round(10000 / px), step = Math.round(win / 4);
    let clear = 0, n = 0;
    for (let y = 0; y < N; y += step) for (let x = 0; x < N; x += step) {
      let c = 0, t = 0;
      for (let j = 0; j < win; j += 2) for (let i = 0; i < win; i += 2) { c += on[((y + j) % N) * N + ((x + i) % N)]; t++; }
      if (c / t < 0.1) clear++;
      n++;
    }
    // (a tenth of the open share at most: the fjord at its 0.57 cover had 7.5 % against a bound of 4.3)
    assert.ok(clear / n <= 0.1 * (1 - lane.cover), `${id}: a broken deck leaves ${(100 * clear / n).toFixed(1)} % of 10 km windows nearly clear`);
  }
}

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
  assert.ok(cloudDeckTau(stacks.whiteout) > 10 && cloudDeckTau(stacks.railyard) > 10, 'a closing deck is optically thick');
  // the law is the closing deck's (a broken deck keeps the old law and its grey bases over snow; a convective sky too)
  assert.ok(stacks.whiteout.closing === 1 && stacks.railyard.closing > 0.5, 'an overcast takes the light under the cover');
  assert.ok(stacks.fjord.closing === 0 && stacks.verdant.closing === 0 && stacks.monsoon.closing === 0 && stacks.winter.closing < 0.2, 'a broken deck and a convective sky keep the old law');
}

// ---- the packing: vec4 lanes, an absent lane without density, the channel matrix column-major as GLSL reads M * v
{
  const u = {};
  for (const k of ['uLayerBase', 'uLayerTop', 'uLayerCover', 'uLayerDensity', 'uLayerShape', 'uLayerDetail', 'uLayerBias', 'uLayerFilter',
    'uLayerExp', 'uLayerStreets', 'uLayerEnvelope', 'uLayerCells', 'uLayerWisp', 'uLayerFlat', 'uLayerHang', 'uLayerAnvil', 'uLayerCore', 'uLayerLumps', 'uProfA', 'uProfB', 'uProfC', 'uProfD', 'uLayerDiffuse']) u[k] = { value: new THREE.Vector4() };
  u.uLayerChannels = { value: new THREE.Matrix4() };
  u.uHeightRange = { value: new THREE.Vector2() };
  // (the packing over a stack of two lanes: the fjord's broken deck and its veil aloft)
  const stack = stacks.fjord;
  packCloudStack(stack, u);
  assert.equal(u.uLayerBase.value.x, stack.lanes[0].baseM);
  assert.equal(u.uLayerTop.value.y, stack.lanes[1].topM);
  assert.equal(u.uLayerDensity.value.z, 0, 'an absent lane has no density');
  assert.equal(u.uLayerDensity.value.w, 0);
  assert.equal(u.uLayerCells.value.x, stack.lanes[0].cells);
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
