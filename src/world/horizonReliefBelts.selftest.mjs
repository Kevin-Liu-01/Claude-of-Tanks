// The horizons lane (2026-10-09): the ring atlas's per-map cover options (horizonRelief.ts HorizonReliefCover) — the
// forest's belts up a mountain face (the owner's R023: "several irregular forest belts from lower slopes through
// mid-slopes"), the wider binding share (gauntlet wave 288: "a flat dark mountain silhouette, no texture" — a wooded face's
// canopy over its own occlusion and shadows clamped to one tone), and the walls' fade (Glacier Pass's massif, the atlas's
// angle x radius texels drawn down a near-vertical face as streaks). Each is per map, absent by default, and a map
// without them bakes its atlas byte for byte as before.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  HORIZON_RELIEF_AO_DEPTH, HORIZON_RELIEF_AO_POWER, HORIZON_RELIEF_SHADE, HORIZON_RELIEF_SUN_DEPTH,
  bakeHorizonRelief, createHorizonReliefField, encodeCanopyAo, encodeCanopySun, resolveHorizonRelief,
} from './horizonRelief.ts';
import { HORIZON_SEGMENTS, sampleHorizonGeometry } from './maps/horizon.ts';
import { getMapConfig } from './maps/index.ts';

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const programAo = (z, shade) => 1 - (1 - Math.pow(z, HORIZON_RELIEF_AO_POWER)) * HORIZON_RELIEF_AO_DEPTH * shade;
const programSun = (z, shade) => 1 - (1 - z) * HORIZON_RELIEF_SUN_DEPTH * shade;

// --- the encoding at a wider share ------------------------------------------------------------------------------
// the default share is the base law exactly (horizonRelief.selftest pins it against the terrain program)
for (const ao of [0, 0.3, 0.7, 1]) for (const light of [0.4, 0.8, 1]) {
  assert.equal(encodeCanopyAo(ao, light), encodeCanopyAo(ao, light, HORIZON_RELIEF_SHADE), 'the base share is the default');
  assert.equal(encodeCanopySun(ao, light), encodeCanopySun(ao, light, HORIZON_RELIEF_SHADE), 'the base share is the default');
}
// at the full share open ground keeps the factor the base share gave it, and the canopy reaches below the base floor
for (const ao of [0.2, 0.5, 0.8, 1]) {
  assert.ok(Math.abs(programAo(encodeCanopyAo(ao, 1, 1), 1) - programAo(ao, HORIZON_RELIEF_SHADE)) < 1e-9, `open ground's occlusion factor is unchanged at the full share (ao ${ao})`);
  assert.ok(Math.abs(programSun(encodeCanopySun(ao, 1, 1), 1) - programSun(ao, HORIZON_RELIEF_SHADE)) < 1e-9, `open ground's sun factor is unchanged at the full share (sun ${ao})`);
}
const baseFloorAo = 1 - HORIZON_RELIEF_AO_DEPTH * HORIZON_RELIEF_SHADE, baseFloorSun = 1 - HORIZON_RELIEF_SUN_DEPTH * HORIZON_RELIEF_SHADE;
{
  const ao = 0.55, sun = 0.3, light = 0.5;
  const wideAo = programAo(encodeCanopyAo(ao, light, 1), 1), wideSun = programSun(encodeCanopySun(sun, light, 1), 1);
  assert.ok(Math.abs(wideAo - programAo(ao, HORIZON_RELIEF_SHADE) * light) < 1e-9 && wideAo < baseFloorAo,
    `a stand over a shaded fold keeps its own factor under the base floor (${wideAo.toFixed(3)} < ${baseFloorAo.toFixed(3)})`);
  assert.ok(Math.abs(wideSun - programSun(sun, HORIZON_RELIEF_SHADE) * light) < 1e-9 && wideSun < baseFloorSun,
    `a stand in a ridge's shadow keeps its own factor under the base floor (${wideSun.toFixed(3)} < ${baseFloorSun.toFixed(3)})`);
}

// --- the bake -----------------------------------------------------------------------------------------------------
const W = 512, H = 64, SUN = [0.4, 0.6, 0.7];
const cfg = getMapConfig('alpine');
const ring = sampleHorizonGeometry(cfg, 1337);
const input = {
  columns: HORIZON_SEGMENTS, rowCount: ring.rows.length, positions: ring.positions, heights: ring.heights, maxHeight: ring.maxHeight,
  seed: 0x5eed, treelineM: 0.8 * ring.maxHeight, snowlineM: null,
};
const settings = resolveHorizonRelief('alpine');
const bake = (cover) => bakeHorizonRelief({ ...input, cover: cover === undefined ? undefined : { ...settings.cover, ...cover } }, createHorizonReliefField(0x51ab, settings), SUN, { width: W, height: H });
const plain = bake(undefined), noOptions = bake({});
assert.equal(sha(plain.data), sha(noOptions.data), 'a cover without the options bakes the character\'s atlas byte for byte');
assert.equal(plain.shade, HORIZON_RELIEF_SHADE, 'the bake reports the base share by default');

// the belts: the stands open into bands and paths (fewer texels under the canopy) but the face stays wooded
const canopied = (b) => {
  let n = 0;
  for (let t = 0; t < W * H; t++) if (b.data[t * 4 + 3] < plain.data[t * 4 + 3] - 30 || b.data[t * 4 + 3] > plain.data[t * 4 + 3] + 30) n++;
  return n;
};
const darkTexels = (b) => { let n = 0; for (let t = 0; t < W * H; t++) if (b.data[t * 4 + 2] < 90) n++; return n; };
const belts = bake({ belts: 1 });
const opened = canopied(belts) / (W * H);
assert.ok(opened > 0.01 && opened < 0.5, `the belts open part of the forest, not all of it (${(opened * 100).toFixed(1)} % of the texels changed)`);
assert.ok(darkTexels(belts) < darkTexels(plain) && darkTexels(belts) > 0.2 * darkTexels(plain),
  `the face keeps most of its canopy (${darkTexels(belts)} dark texels of ${darkTexels(plain)})`);
assert.equal(sha(bake({ belts: 1 }).data), sha(belts.data), 'the belts are deterministic');

// the wider share: reported, and open texels keep their factor to within a byte step
const wide = bake({ shade: 1 });
assert.equal(wide.shade, 1, 'the bake reports the share its texels are encoded for');
{
  let worst = 0;
  for (let t = 0; t < W * H; t++) {
    const a0 = plain.data[t * 4 + 2] / 255, a1 = wide.data[t * 4 + 2] / 255;
    if (a0 > 0.98) continue;
    worst = Math.max(worst, Math.abs(programAo(a1, 1) - programAo(a0, HORIZON_RELIEF_SHADE)));
  }
  assert.ok(worst < 0.012, `every texel keeps its program factor at the wider share within a byte step (${worst.toFixed(4)})`);
}

// the walls: the steep texels' terms take their run along the row (no texel-to-texel stripes down a wall); the gentle
// ground keeps its own texels
{
  const walls = bake({ walls: 1 });
  let moved = 0, stripeBefore = 0, stripeAfter = 0, pairs = 0;
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const t = j * W + i, u = j * W + (i + 1) % W;
      const changed = walls.data[t * 4 + 2] !== plain.data[t * 4 + 2] || walls.data[t * 4 + 3] !== plain.data[t * 4 + 3];
      if (!changed) continue;
      moved++;
      const changedNext = walls.data[u * 4 + 2] !== plain.data[u * 4 + 2] || walls.data[u * 4 + 3] !== plain.data[u * 4 + 3];
      if (!changedNext) continue;
      pairs++;
      stripeBefore += Math.abs(plain.data[t * 4 + 3] - plain.data[u * 4 + 3]) + Math.abs(plain.data[t * 4 + 2] - plain.data[u * 4 + 2]);
      stripeAfter += Math.abs(walls.data[t * 4 + 3] - walls.data[u * 4 + 3]) + Math.abs(walls.data[t * 4 + 2] - walls.data[u * 4 + 2]);
    }
  }
  assert.ok(moved > 0 && moved < 0.5 * W * H, `the walls' terms change on the walls only (${(moved / (W * H) * 100).toFixed(1)} % of the texels)`);
  assert.ok(pairs > 100 && stripeAfter < 0.6 * stripeBefore,
    `along a wall the texel-to-texel steps (the streaks down the face) fall (${(stripeBefore / pairs).toFixed(2)} -> ${(stripeAfter / pairs).toFixed(2)})`);
  assert.equal(sha(bake({ walls: 1 }).data), sha(walls.data), 'the walls\' pass is deterministic');
}

// the maps that take the options: Glacier Pass only (the owner's "hasn't been updated at all"); the light-touch maps
// (Nordhavn Fjord, Saltmere Bay, Saltwind, Highland Reservoir, Frontier: "incredible") keep their atlases
for (const id of ['fjord', 'coastal', 'saltwind', 'reservoir', 'frontier', 'verdant']) {
  const c = getMapConfig(id).horizon?.reliefCover;
  assert.ok(!c || (c.belts === undefined && c.shade === undefined && c.walls === undefined), `${id} keeps its atlas (no belts, share or walls)`);
}

console.log('horizonReliefBelts.selftest: the wider share\'s encoding, the belts, the walls\' fade and the maps that take them PASS');
