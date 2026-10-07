// The trees lane (2026-10-06, the coordinator's ruling on the gauntlet's wave 178 — Verdant's light version: "a loose
// grove of tall, spindly, birch-like trees ... standing apart in the black-earth plough"; its woods stay where they
// stand): a place's closed stands (treeBiomes.ts denseStands) on Verdant's seeded producer. Its stands' holes are filled
// from a stream of their own after every other placement — each fill tree standing clear of every trunk by FILL_GAP_M,
// a stand's species, a wood tree — and no sapling stands out in a field's interior. A construction receipt: no GPU, no
// art claim.
import assert from 'node:assert/strict';
import { createHeightField } from './terrain.ts';
import { createVegetation } from './vegetation.ts';
import { getMapConfig, MAP_IDS } from './maps/index.ts';
import { treeBiomeDenseStands } from './treeBiomes.ts';
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


assert.ok(treeBiomeDenseStands('verdant'), 'Verdant closes its stands');
assert.deepEqual(MAP_IDS.filter((id) => treeBiomeDenseStands(id)), ['verdant'], 'only Verdant, in this commit');

const restore = canvasFixture();
try {
  const cfg = getMapConfig('verdant'), field = createHeightField(1337, cfg);
  const sample = { active: 0, crop: 0, edgeM: 0, endM: 0, sU: 0, sV: 0, split: 1, alongU: 1, marginM: 0, track: 0, hedge: 0, rowX: 1, rowZ: 0, jitter: 0,
    id: 0, boundary: 0, tintR: 0, tintG: 0, tintB: 0, sward: 1, cropHeight: 1, cropKeep: -1, weed: 0 };
  const interior = (x, z) => { field._landUseAt(x, z, sample); return sample.active > 0 && sample.edgeM > sample.marginM + 2; };
  const world = createVegetation(field, { setupShadowMaterial() {} }, 2001, cfg);
  try {
    const trees = world._trees, census = world.group.userData.denseStands;
    const wood = trees.filter((t) => t.wood);
    assert.ok(census && census.filled > 0 && census.filled <= 0.25 * wood.length, `the stands filled (${JSON.stringify(census)} of ${wood.length} wood trees)`);
    // no sapling (a young tree under three quarters of a stand tree's scale) stands out in a field's interior
    const scale = (t) => Math.hypot(t.mat.elements[4], t.mat.elements[5], t.mat.elements[6]);
    const strays = trees.filter((t) => t.wood && scale(t) < 0.75 && interior(t.mat.elements[12], t.mat.elements[14]));
    assert.equal(strays.length, 0, `no sapling out in a field's interior (${strays.length})`);
    // the fill: the last trees the stands took, each clear of every trunk before it by 4.5 m
    const fill = [];
    for (let i = trees.length - 1; i >= 0 && fill.length < census.filled; i--) if (trees[i].wood) fill.push(i);
    let crowded = 0;
    for (const i of fill) {
      const t = trees[i];
      for (let j = 0; j < i; j++) {
        if (Math.hypot(trees[j].x - t.x, trees[j].z - t.z) < 4.5 - 1e-6) { crowded++; break; }
      }
    }
    assert.equal(crowded, 0, `each fill tree in a hole (${crowded} crowded)`);
    console.log(JSON.stringify({ map: 'verdant', trees: trees.length, woodTrees: wood.length, census }));
  } finally {
    world.dispose(); disposeObject3DResources(world.group);
  }
} finally { restore(); }
console.log("denseStands.selftest: Verdant's stands filled in their holes from a stream of their own, no sapling out in a field's interior PASS");
