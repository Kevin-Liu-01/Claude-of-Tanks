// Trees lane (2026-10-08, the gauntlet's waves 282/283a on Redrock Divide: the acacias "lime-green, puffy savanna
// canopies, far too lush for Wadi Rum" — they should be "sparse, grey-green, flat-crowned Acacia raddiana / tortilis with
// visible branch structure and small leaves"): every acacia slot of Redrock (its acacia, cedar and oak slots) grows as
// Wadi Rum's acacia — forked low, one flat thin umbrella of half a broadleaf's sprays, small leaflets, a few dead limbs —
// in its own dust-dulled grey-green, while the Saharan maps keep the savanna acacia and their arid colour. On the real
// seeded producer: Redrock's near crowns carry half the budget's sprays and draw no lime green. A construction receipt.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { growTreeSkeleton, GROWTH_LEAF_BUDGET, GROWTH_SPECIES, TREE_GROWTH_PROFILES } from './treeGrowth.ts';
import { createHeightField } from './terrain.ts';
import { createVegetation, grownFormSprayKind } from './vegetation.ts';
import { getMapConfig } from './maps/index.ts';
import { treeBiomeColour, treeBiomeSlot, treeBiomeTransmission } from './treeBiomes.ts';
import { disposeObject3DResources } from '../engine/resourceLifetime.ts';

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// 1. the table: Redrock's three acacia slots grow Wadi Rum's acacia in its own grey-green; the Saharan maps unchanged
for (const slot of ['acacia', 'cedar', 'oak']) {
  const s = treeBiomeSlot('badlands', slot);
  assert.equal(s?.form, 'tortilis', `Redrock's ${slot} slot grows as Wadi Rum's acacia`);
  assert.ok(s.colour && s.colour.cardSat <= 0.06, `Redrock's ${slot} slot: a dust-dulled grey-green`);
}
assert.equal(treeBiomeSlot('desert', 'eucalyptus')?.form, 'acacia', 'the Saharan wadi keeps the savanna acacia');
assert.equal(treeBiomeSlot('desert', 'eucalyptus')?.colour, undefined, 'and the place\'s arid colour');
assert.ok(GROWTH_SPECIES.includes('tortilis'), 'a tree slot\'s form');
// (the Redrock lane on wave 282: the back-lit crowns glowed lime) Wadi Rum's leaflets pass little light; elsewhere the whole gain
assert.ok(treeBiomeTransmission('badlands') <= 0.5, 'Wadi Rum\'s leaves pass little of the low sun');
assert.equal(treeBiomeTransmission('verdant'), 1, 'a place without a transmission keeps the whole gain');
assert.equal(grownFormSprayKind('tortilis'), 'acacia', 'it paints the acacia\'s bipinnate leaflets');
const p = TREE_GROWTH_PROFILES.tortilis, savanna = TREE_GROWTH_PROFILES.acacia;
assert.ok(p.forkAt[1] <= 0.25 && p.leafShare <= 0.5 && (p.foliageValue ?? 1) < (savanna.foliageValue ?? 1) && p.deadwood > 0,
  'forked low, half the sprays, darker than the savanna acacia, a few dead limbs');

// 2. the skeletons: half the budget's sprays on every variant, under a flat thin umbrella
for (let variant = 0; variant < 3; variant++) {
  const sk = growTreeSkeleton('tortilis', mulberry32(2001 + variant * 7), { variant, tier: 'desktop' });
  const sv = growTreeSkeleton('acacia', mulberry32(2001 + variant * 7), { variant, tier: 'desktop' });
  assert.ok(sk.leaves.length <= Math.round(GROWTH_LEAF_BUDGET.desktop * 0.5) && sk.leaves.length < 0.6 * sv.leaves.length,
    `tortilis/${variant}: ${sk.leaves.length} sprays against the savanna acacia's ${sv.leaves.length}`);
  const ys = sk.leaves.map((l) => l.y), top = Math.max(...sk.leaves.map((l) => l.y + l.ay * l.length));
  const reach = Math.max(...sk.leaves.map((l) => Math.hypot(l.x, l.z)));
  assert.ok(top - Math.min(...ys) < 0.5 * reach, `tortilis/${variant}: a flat umbrella (${(top - Math.min(...ys)).toFixed(2)} m deep, ${reach.toFixed(2)} m out)`);
}

// 3. the real seeded producer
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
const c = new THREE.Color(), hsl = {};
const restore = canvasFixture();
const report = {};
try {
  const cfg = getMapConfig('badlands'), field = createHeightField(1337, cfg);
  const veg = createVegetation(field, { setupShadowMaterial() {} }, 2001, cfg);
  try {
    const planted = new Set(veg._trees.map((t) => t.species));
    for (const m of veg.group.children.filter((x) => x.isInstancedMesh && x.userData.treeFoliage && x.userData.treeLod === 'near')) {
      const sp = m.userData.treeSpecies;
      if (!['acacia', 'cedar', 'oak'].includes(sp) || !planted.has(sp)) continue;
      const color = m.geometry.getAttribute('color');
      let lime = 0;
      for (let i = 0; i < color.count; i++) {
        c.setRGB(color.getX(i), color.getY(i), color.getZ(i)).convertLinearToSRGB();
        const max = Math.max(c.r, c.g, c.b), min = Math.min(c.r, c.g, c.b);
        c.getHSL(hsl);
        if (max > 0 && (max - min) / max > 0.24 && hsl.h > 0.17 && hsl.h < 0.36) lime++;
      }
      (report[sp] ??= []).push(+(lime / color.count).toFixed(3));
      assert.ok(lime / color.count < 0.02, `Redrock's ${sp} crown draws no lime green (${(lime / color.count * 100).toFixed(1)} %)`);
    }
    assert.ok(Object.keys(report).length > 0, 'Redrock\'s acacia crowns to read');
  } finally { veg.dispose(); disposeObject3DResources(veg.group); }
} finally { restore(); }
console.log(JSON.stringify(report));
console.log('redrockAcacia.selftest: Wadi Rum\'s acacias flat, sparse and grey-green on Redrock; the Saharan maps\' unchanged PASS');
