// The trees lane (2026-10-06, the map-revival lane's Skybridge round 4: Glen Canyon's Fremont cottonwoods by the water,
// its Utah juniper and Colorado pinyon on the benches and rims): a place's riparian slot (treeBiomes.ts riparian,
// vegetation.ts riparianZoneOk) on Skybridge's seeded producer — every tree of the slot stands within its reach of a
// lake's shore and no higher over the shore than its rise, or in the low ground; the other slots stand anywhere, high
// ground and far from the water included; a place without the entry has none. A construction receipt: no GPU, no art
// claim.
import assert from 'node:assert/strict';
import { createHeightField } from './terrain.ts';
import { createVegetation } from './vegetation.ts';
import { getMapConfig } from './maps/index.ts';
import { treeBiomeRiparian } from './treeBiomes.ts';
import { disposeObject3DResources } from '../engine/resourceLifetime.ts';

function canvasFixture() {
  const saved = new Map(['document', 'ImageData'].map(k => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
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
  return () => { for (const [k, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, k, descriptor); else delete globalThis[k];
  } };
}


const rip = treeBiomeRiparian('skybridge');
assert.ok(rip && rip.slot === 'poplar' && rip.reachM > 0, 'Skybridge keeps its cottonwoods to the water');
assert.equal(treeBiomeRiparian('verdant'), null, 'a place without the entry zones nothing');

const restore = canvasFixture();
try {
  const cfg = getMapConfig('skybridge'), field = createHeightField(1337, cfg);
  const heights = [];
  for (let z = -430; z <= 430; z += 24) for (let x = -430; x <= 430; x += 24) heights.push(field.getHeightAt(x, z));
  heights.sort((a, b) => a - b);
  const low = heights[Math.min(heights.length - 1, Math.floor(heights.length * (rip.lowShare ?? 0.2)))];
  const high = heights[Math.floor(heights.length * 0.8)];
  const lakes = field._layout.lakes;
  assert.ok(lakes.length > 0, 'the canyon holds its lakes');
  const shoreOf = (x, z) => {
    let best = null;
    for (const l of lakes) {
      const d = Math.hypot(x - l.x, z - l.z), f = l.r / Math.max(1e-3, d);
      const off = d - l.r, rise = field.getHeightAt(x, z) - field.getHeightAt(l.x + (x - l.x) * f, l.z + (z - l.z) * f);
      if (!best || off < best.off) best = { off, rise };
    }
    return best;
  };
  const world = createVegetation(field, { setupShadowMaterial() {} }, 2001, cfg);
  try {
    const census = {};
    let byWater = 0, inLow = 0, conifersHighFar = 0;
    for (const t of world._trees) {
      census[t.species] = (census[t.species] ?? 0) + 1;
      const x = t.mat.elements[12], z = t.mat.elements[14], h = field.getHeightAt(x, z), s = shoreOf(x, z);
      if (t.species === rip.slot) {
        const water = lakes.some((l) => {
          const d = Math.hypot(x - l.x, z - l.z), f = l.r / Math.max(1e-3, d);
          return d - l.r <= rip.reachM && h - field.getHeightAt(l.x + (x - l.x) * f, l.z + (z - l.z) * f) <= (rip.riseM ?? Infinity);
        });
        assert.ok(water || h <= low, `a cottonwood by the water or in the low ground (${x.toFixed(0)}, ${z.toFixed(0)}: ${s.off.toFixed(0)} m off the shore, ${h.toFixed(1)} m high, the low ground under ${low.toFixed(1)})`);
        if (water) byWater++; else inLow++;
      } else if (t.species !== 'snag' && h >= high && s.off > 100) conifersHighFar++;
    }
    assert.ok(census[rip.slot] > 0, `some cottonwoods still grow (${JSON.stringify(census)})`);
    assert.ok(conifersHighFar > 50, `the juniper and pinyon stand on the high ground far from the water too (${conifersHighFar})`);
    console.log(JSON.stringify({ map: 'skybridge', trees: world._trees.length, census, cottonwoods: { byWater, inLow }, conifersHighFar }));
  } finally {
    world.dispose(); disposeObject3DResources(world.group);
  }
} finally { restore(); }
console.log("riparianTrees.selftest: Skybridge's cottonwoods by its lakes or in its low ground, its juniper and pinyon anywhere; a place without the entry zones nothing PASS");
