// Trees lane (2026-10-08, the gauntlet's wave 278 on Glacier Pass: "the pines are a saturated summer green with not a
// flake of snow on their branches", over the col's deep April snow): every map whose ground lies under snow (the maps
// whose props wear snow caps — Frosthollow, Whiteout, Glacier Pass: props.ts snowCap) draws its trees under that snow.
// The snow law is the palette's `snow` (vegetation.ts); Frosthollow's palettes carry it and Whiteout borrows them, and a
// map without palettes of its own now takes its place's snow (treeBiomes.ts TreeBiome.snow, treeBiomeSnowPalette).
// On the real seeded producers: no near crown of a planted slot draws summer green (its cards' tint past 0.26 HSV
// saturation in the green band), every conifer crown carries a load (its laden sprays, lifted far over the crown's own
// cards, on a share of its card vertices), and Glacier Pass's larches stand bare in April. A construction receipt: no
// GPU, no art claim.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createHeightField } from './terrain.ts';
import { createVegetation } from './vegetation.ts';
import { getMapConfig, MAP_IDS } from './maps/index.ts';
import { TREE_ARCHETYPES } from './treeSpecies.ts';
import { treeBiomeBare, treeBiomeSlot, treeBiomeSnow, treeBiomeSnowPalette } from './treeBiomes.ts';
import { disposeObject3DResources } from '../engine/resourceLifetime.ts';

function canvasFixture() {
  const saved = new Map(['document', 'ImageData', 'location'].map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  class ImageData { constructor(data, width, height) {
    this.data = typeof data === 'number' ? new Uint8ClampedArray(data * width * 4) : data;
    this.width = typeof data === 'number' ? data : width;
    this.height = typeof data === 'number' ? width : height;
  } }
  globalThis.ImageData = ImageData;
  globalThis.document = { createElement() {
    const canvas = { width: 0, height: 0 };
    const context = new Proxy({
      createImageData: (w, h) => new ImageData(new Uint8ClampedArray(w * h * 4), w, h),
      getImageData: (_x, _y, w, h) => new ImageData(new Uint8ClampedArray(w * h * 4).fill(128), w, h),
      createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }),
    }, { get: (target, key) => target[key] ?? (() => {}) });
    canvas.getContext = () => context; return canvas;
  } };
  globalThis.location = { search: '' };
  return () => { for (const [k, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, k, descriptor); else delete globalThis[k];
  } };
}

// 1. the law, pure: a palette with its own snow is the map's winter, kept whole; a conifer slot without one takes the
// place's load and its needles' winter colour; a broadleaf the lighter load and its own colour; a palm none
const alpineSnow = treeBiomeSnow('alpine');
assert.ok(alpineSnow && alpineSnow.conifer >= 0.6, 'Glacier Pass lies under snow (its biome names the load)');
assert.ok(treeBiomeBare('alpine'), 'an Alpine April: the larches bare');
const own = { snow: 0.9, cardHue: 0.4 };
assert.equal(treeBiomeSnowPalette(own, 'conifer', alpineSnow), own, 'a palette that names its snow stays whole');
const spruce = treeBiomeSnowPalette({}, 'conifer', alpineSnow);
assert.equal(spruce.snow, alpineSnow.conifer);
assert.equal(spruce.cardSat, alpineSnow.needle.cardSat, 'the needles take their winter saturation');
assert.ok(spruce.cardSat < 0.12, 'under the load the needles are no summer green (the summer card saturation is 0.18)');
const named = treeBiomeSnowPalette({ cardHue: 0.33 }, 'conifer', alpineSnow);
assert.equal(named.cardHue, 0.33, 'a colour the map names wins');
const oak = treeBiomeSnowPalette({}, 'broadleaf', alpineSnow);
assert.equal(oak.snow, alpineSnow.broadleaf);
assert.equal(oak.cardSat, undefined, 'a broadleaf keeps its own colour');
assert.deepEqual(treeBiomeSnowPalette({}, 'palm', alpineSnow), {}, 'a palm carries no snow');
assert.deepEqual(treeBiomeSnowPalette({}, 'conifer', null), {}, 'a place without snow changes nothing');

// 2. the maps under snow (props.ts: Frosthollow, and every map whose props wear snow caps)
const snowMaps = MAP_IDS.filter((id) => id === 'winter' || getMapConfig(id).props?.snowCap === true).sort();
assert.deepEqual(snowMaps, ['alpine', 'whiteout', 'winter'], 'the maps whose ground lies under snow');

const c = new THREE.Color(), hsl = {};
/** A crown geometry's card tints, read in sRGB (the attribute is linear: the tint law sets its HSL in sRGB): the share in
 * summer green (HSV saturation past 0.26, hue 0.15-0.47 — the summer needles' 0.18-0.24 HSL saturation is 0.31-0.39,
 * the snowbound needles' 0.08-0.14 is 0.15-0.25) and the share laden (lifted past 1.5 times the crown's median value,
 * its laden sprays' snow tint). */
function crownTints(geometry) {
  const color = geometry.getAttribute('color');
  assert.ok(color, 'the grown crown carries its tint in vertex colours');
  const values = [];
  let green = 0, twig = 0;
  for (let i = 0; i < color.count; i++) {
    c.setRGB(color.getX(i), color.getY(i), color.getZ(i)).convertLinearToSRGB();
    const max = Math.max(c.r, c.g, c.b), min = Math.min(c.r, c.g, c.b);
    values.push(max);
    c.getHSL(hsl);
    if (max > 0 && (max - min) / max > 0.26 && hsl.h > 0.15 && hsl.h < 0.47) green++;
    // the bare twigs' warm grey (grownTintLaw's bare tint, hue 0.08), never a needle's green or blue-green
    if (hsl.h < 0.15) twig++;
  }
  const sorted = [...values].sort((a, b) => a - b), median = sorted[sorted.length >> 1] || 1;
  const laden = values.filter((v) => v > 1.5 * median).length;
  return { n: color.count, green: green / color.count, laden: laden / color.count, twig: twig / color.count };
}

const restore = canvasFixture();
const report = {};
try {
  for (const mapId of snowMaps) {
    const cfg = getMapConfig(mapId), field = createHeightField(1337, cfg);
    const veg = createVegetation(field, { setupShadowMaterial() {} }, 2001, cfg);
    try {
      const pools = veg.group.children.filter((m) => m.isInstancedMesh && m.userData.treeFoliage && m.userData.treeLod === 'near'
        && m.userData.treeSpecies && m.userData.treeSpecies !== 'snag' && m.geometry.getAttribute('color'));
      const planted = new Set(veg._trees.map((t) => t.species));
      // (Whiteout Station stands on an ice sheet: no tree grows there, trees round 2b)
      if (planted.size === 0) { report[mapId] = 'no trees'; continue; }
      const rows = {};
      for (const m of pools) {
        const sp = m.userData.treeSpecies;
        if (!planted.has(sp)) continue;
        const t = crownTints(m.geometry);
        (rows[sp] ??= []).push(t);
        assert.ok(t.green < 0.02, `${mapId}/${sp}: a crown on the snow draws summer green (${(t.green * 100).toFixed(1)} % of its cards)`);
        const form = treeBiomeSlot(mapId, sp)?.form;
        const bare = treeBiomeBare(mapId) && form === 'larch';
        if (TREE_ARCHETYPES[sp]?.family === 'conifer') {
          assert.ok(t.laden >= 0.05, `${mapId}/${sp}: a conifer under snow carries its load (${(t.laden * 100).toFixed(1)} % laden)`);
        }
        // an Alpine April's larch stands bare: its unladen cards the twigs' warm grey
        if (bare) assert.ok(t.twig >= 0.5, `${mapId}/${sp}: the larch bare in its season (${(t.twig * 100).toFixed(1)} % twig grey)`);
      }
      assert.ok(Object.keys(rows).length > 0, `${mapId}: near crowns to read`);
      report[mapId] = Object.fromEntries(Object.entries(rows).map(([sp, ts]) => [sp, {
        green: +Math.max(...ts.map((t) => t.green)).toFixed(3), laden: +Math.min(...ts.map((t) => t.laden)).toFixed(3),
        twig: +Math.min(...ts.map((t) => t.twig)).toFixed(3) }]));
    } finally { veg.dispose(); disposeObject3DResources(veg.group); }
  }
} finally { restore(); }
console.log(JSON.stringify(report));
console.log('snowboundTrees.selftest: every map under snow draws its trees under the snow — no summer-green crown, the conifers laden, an Alpine April\'s larches bare PASS');
