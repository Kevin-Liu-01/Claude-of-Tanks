// The trees lane (2026-10-06, the gauntlet's wave 157 on Monsoon Ridge: "built almost entirely from one repeating tropical
// fan-palm prop ... the wrong flora for a 1,500 m Naga Hills jungle saddle"): Kohima's trees on the real seeded producer.
// The map plants no palm — the pine slot took its share and every draw kept its seat — and every slot it plants grows as
// a Naga Hills form on the desktop tiers (treeBiomes.ts: the Khasi pine, the montane chestnut-oak and the evergreen oak,
// the bamboo clump), its shrubs the evergreen oak's; the census of its trees by form. A construction receipt: no GPU, no
// art claim (the look lives in the lane's captures).
import assert from 'node:assert/strict';
import { createHeightField } from './terrain.ts';
import { createVegetation } from './vegetation.ts';
import { getMapConfig } from './maps/index.ts';
import { treeBiomeShrub, treeBiomeSlot } from './treeBiomes.ts';
import { TREE_GROWTH_PROFILES } from './treeGrowth.ts';
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

const NAGA_HILLS_FORMS = new Set(['khasiPine', 'castanopsis', 'holmOak', 'bamboo']);
const cfg = getMapConfig('monsoon'), veg = cfg.vegetation;
const planted = new Set([...veg.species, ...veg.clusterMix.map(([sp]) => sp), ...veg.loneMix.map(([sp]) => sp), ...veg.rimMix.map(([sp]) => sp)]);
assert.ok(!planted.has('palm') && !planted.has('acacia'), `Kohima plants no palm (${[...planted].join(', ')})`);
for (const slot of planted) {
  const form = treeBiomeSlot('monsoon', slot)?.form;
  assert.ok(NAGA_HILLS_FORMS.has(form), `the ${slot} slot grows as a Naga Hills form (${form})`);
}
assert.equal(TREE_GROWTH_PROFILES[treeBiomeSlot('monsoon', 'pine').form].family, 'conifer', 'the pine slot is the Khasi pine');
assert.equal(treeBiomeShrub('monsoon'), 'holmOak', 'the understorey the evergreen oak\'s shrubs');

const restore = canvasFixture();
try {
  const world = createVegetation(createHeightField(1337, cfg), { setupShadowMaterial() {} }, 2001, cfg);
  try {
    const census = {};
    for (const t of world._trees) {
      const form = t.species === 'snag' ? 'snag' : treeBiomeSlot('monsoon', t.species)?.form ?? t.species;
      census[form] = (census[form] ?? 0) + 1;
    }
    assert.ok(!census.palm && !census.eucalyptus, `no palm and no eucalyptus grows (${JSON.stringify(census)})`);
    const total = world._trees.length;
    // the forest's make-up (the slots' shares of the mixes): pine on the ridges, the montane broadleaves, bamboo
    assert.ok(census.castanopsis > 0.3 * total && census.holmOak > 0.2 * total && census.khasiPine > 0.18 * total
      && census.bamboo > 0.1 * total, `the forms' shares (${JSON.stringify(census)} of ${total})`);
    // the two Khasi pines authored by the DC's bungalow (the landmarks lane's garden, clear of its footprints): both seated,
    // both living pines at their stations (no new tree: records moved from the pine stands)
    const authored = world.group.userData.authoredTrees?.find((r) => r.id === 'bungalow-khasi-pines');
    assert.ok(authored && authored.accepted === 2 && authored.attempted === 2, `the bungalow's Khasi pines seated (${JSON.stringify(authored)})`);
    for (const [x, z] of veg.authoredTrees.find((f) => f.id === 'bungalow-khasi-pines').path) {
      const at = world._trees.find((t) => Math.hypot(t.mat.elements[12] - x, t.mat.elements[14] - z) < 0.01);
      assert.ok(at && at.species === 'pine', `a living Khasi pine at (${x}, ${z}) (${at?.species})`);
    }
    // (2026-10-07, the coordinator's ruling on waves 178 and 179: the spurs wooded) the woods on the spur ridges and their
    // slopes, closed (vegetation.ts landscapeWoods): its budget's share holds the field law's count (8,560 with the
    // compound's discs) with fewer stands than the target, each seated full; the DC's compound stays their clearing
    const lw = world.group.userData.landscapeWoods;
    assert.ok(lw && lw.standTrees >= lw.standBudget && lw.stands < lw.target, `the spurs' woods hold their budget (${JSON.stringify(lw)})`);
    assert.ok(Math.abs(total - 8560) <= 0.03 * 8560, `the woods keep the field law's count (8560 -> ${total})`);
    for (const av of veg.avoid) {
      const inside = world._trees.filter((t) => Math.hypot(t.mat.elements[12] - av.x, t.mat.elements[14] - av.z) < av.r).length;
      assert.equal(inside, 0, `no tree in the compound's disc at (${av.x}, ${av.z})`);
    }
    // (round 2, wave 179's "pale eucalyptus poles"): the battle zone's snags charred near-black, their count kept
    const snags = world._trees.filter((t) => t.species === 'snag');
    assert.ok(snags.length > 50 && snags.every((t) => t.tint.r <= 0.3), `the snags charred (${snags.length}, the palest ${Math.max(...snags.map((t) => t.tint.r)).toFixed(2)})`);
    console.log(JSON.stringify({ map: 'monsoon', trees: total, census, authored, snags: snags.length, landscapeWoods: lw }));
  } finally {
    world.dispose(); disposeObject3DResources(world.group);
  }
} finally { restore(); }
console.log('monsoonTrees.selftest: Kohima plants no palm and grows every slot as a Naga Hills form — the Khasi pine, the montane chestnut-oak and evergreen oak, the bamboo clump — no palm, no eucalyptus; the bungalow\'s two Khasi pines seated; its snags charred; the spurs\' woods closed on their budget, the compound clear PASS');
