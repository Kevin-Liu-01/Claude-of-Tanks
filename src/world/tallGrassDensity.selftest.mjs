// tallGrassDensity.selftest (GND-02, 2026-10-14; the owner, 10-08: "woah also where did grass go"): the tall grass's
// density at fixed battlefield spots, pinned to deploy 205's within a band, so it cannot silently drop again.
// PR #9's tussock law (a64e2cbee, 15902ec48) gathered the wild sward into clumps by throwing away a third of its
// candidates, and every map stood 27-43 % thinner than 205 at the same spots (GPU census, High pinned); the rings now
// draw TALL_GRASS.swardRestore times the candidates on a non-reed biome and the tussocks keep their gaps.
// The counts are the tier's own in Node: the map's height field (seed 1337, as the world builds it), the tier as map.ts
// wires it (seed 2006, the splat noise, the full quality knob), a camera at 2.4 m, both rings built and published.
// The 205 values were measured the same way on 6763d7cc0 (the in-game counts agree within ~5 %: 205's GPU census read
// Steppe 80,352, Amberford 69,574 and 61,772, Orchard 59,985 at these spots).
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createHeightField, sampleSplatNoise } from './terrain.ts';
import { getMapConfig } from './maps/index.ts';
import { TALL_GRASS, createTallGrass } from './tallGrass.ts';

// the spots and deploy 205's near + far instances there
const AT_205 = [
  ['steppe', -40, -120, 82338], ['steppe', -160, -310, 81033],
  ['autumn', 150, -200, 71277], ['autumn', 303, -327, 62532],
  ['orchard', 0, -200, 63413], ['orchard', -68, -392, 55104],
];
// within this band of 205 (the fix reads -2.4 % to +4.3 %; the pre-fix law -27 % to -32 %)
const BAND = [0.92, 1.10];
// Verdant's and Frontier's spots stood in open meadow on 205 (72,706 and 55,071); PR #9's layouts put woods there and
// the woods floor carries little sward (tallGrass.ts `_woodsAt`). That is the layout's, not the density's: they are
// pinned to the restored law's own counts.
const LAYOUT_CHANGED = [['verdant', -60, -140, 37234], ['frontier', -20, -150, 31851]];
const LAYOUT_BAND = [0.95, 1.05];

const fields = new Map();
const field = (mapId) => {
  if (!fields.has(mapId)) fields.set(mapId, createHeightField(1337, getMapConfig(mapId)));
  return fields.get(mapId);
};
function census(mapId, x, z, options = {}) {
  const hf = field(mapId);
  const grass = createTallGrass(hf, { seed: 2006, mapId, tier: 'desktop', qualityScale: () => 1, splatNoise: sampleSplatNoise, renderer: null, ...options });
  const cam = new THREE.Vector3(x, hf.getHeightAt(x, z) + 2.4, z);
  let s = null;
  for (let i = 0; i < 6000; i++) {
    grass.update(1 / 60, cam, null, null);
    s = grass.getState();
    if (s.near.publishes && s.far.publishes && !s.near.pending && !s.far.pending) break;
  }
  assert.ok(s.near.publishes && s.far.publishes && !s.near.pending && !s.far.pending, `${mapId} (${x}, ${z}): both rings built`);
  assert.equal(s.near.truncated ?? 0, 0, `${mapId} (${x}, ${z}): the near ring fits its cap`);
  assert.equal(s.far.truncated ?? 0, 0, `${mapId} (${x}, ${z}): the far ring fits its cap`);
  return s.near.count + s.far.count;
}

assert.ok(TALL_GRASS.swardRestore > 1.3 && TALL_GRASS.swardRestore < 1.6, 'the wild sward draws about a half again the candidates');
assert.equal(TALL_GRASS.candidatesPerUpdate, Math.round(120 * TALL_GRASS.swardRestore), 'the fill budget rises with it (a column still refills in ~40 frames)');
assert.equal(TALL_GRASS.coldCandidatesPerUpdate, Math.round(2400 * TALL_GRASS.swardRestore), 'and the cold ring\'s');

const rows = [];
for (const [mapId, x, z, ref] of AT_205) {
  const n = census(mapId, x, z);
  rows.push(`${mapId} (${x}, ${z}) ${n} = ${(100 * n / ref).toFixed(1)} % of 205`);
  assert.ok(n >= BAND[0] * ref && n <= BAND[1] * ref, `${mapId} (${x}, ${z}): ${n} tall-grass instances, 205 stood ${ref} (band ${BAND.join('-')})`);
}
for (const [mapId, x, z, ref] of LAYOUT_CHANGED) {
  const n = census(mapId, x, z);
  rows.push(`${mapId} (${x}, ${z}) ${n} (woods since PR #9)`);
  assert.ok(n >= LAYOUT_BAND[0] * ref && n <= LAYOUT_BAND[1] * ref, `${mapId} (${x}, ${z}): ${n} tall-grass instances, pinned ${ref}`);
}
// negative control: the pre-fix law (no restored candidates) falls out of the band, so the receipt bites
{
  const [mapId, x, z, ref] = AT_205[0];
  const n = census(mapId, x, z, { swardRestore: 1 });
  assert.ok(n < BAND[0] * ref, `negative control: the pre-fix law's ${n} at ${mapId} (${x}, ${z}) is under the band (205 ${ref})`);
  rows.push(`negative control (pre-fix law) ${mapId} (${x}, ${z}) ${n} = ${(100 * n / ref).toFixed(1)} % of 205`);
}
console.log(`tallGrassDensity.selftest: the tall grass at 205's density within ${BAND.join('-')} at ${AT_205.length} spots, the woods' spots pinned, the pre-fix law refused\n  ${rows.join('\n  ')}`);
