// The trees lane (2026-10-06, the coordinator's ruling on the gauntlet's wave 178: "the meadows are peppered with isolated
// trees and small clumps like a park or savanna ... trees should be confined to the hedged terrace banks, the lanes and
// the closed woods, and the ridges should be wooded"): the landscape-woods hook (VegetationConfig `landscapeWoods`) on the
// real seeded producer of Frontier Basin with the hook set — the woods stand on the wood-zone ground (its height and
// slope), their stands close into contiguous woods with no thin patches, and the woods keep their tree budget — and
// unset, the map as before. A construction receipt: no GPU, no art claim, no pacing claim (the map
// that opts in carries its own pacing and corridor cover).
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createHeightField } from './terrain.ts';
import { createVegetation } from './vegetation.ts';
import { getMapConfig, MAP_IDS } from './maps/index.ts';
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


// a map that opts in (Monsoon Ridge's spurs) carries its own receipt (monsoonTrees.selftest); its settings in range
for (const id of MAP_IDS) {
  const lw = getMapConfig(id).vegetation?.landscapeWoods;
  if (lw) assert.ok(lw.zone > 0 && lw.zone <= 1 && (lw.budget ?? 1) > 0 && (lw.budget ?? 1) <= 1, `${id}: the hook's settings (${JSON.stringify(lw)})`);
}
const digest = (world) => createHash('sha256').update(JSON.stringify(world._trees.map((t) => [t.species, t.variant, ...t.mat.elements.map((v) => +v.toFixed(5))]))).digest('hex').slice(0, 16);
const LW = { zone: 0.45, slopeDeg: 12, merge: 30 };

const restore = canvasFixture();
try {
  const cfg = getMapConfig('frontier'), field = createHeightField(1337, cfg);
  // the wood-zone score (vegetation.ts woodZoneScore): the height's quantile over the square, half a point more at the
  // zone's slope; the share `zone` of the square's ground scores over the threshold
  const heights = [];
  for (let z = -430; z <= 430; z += 24) for (let x = -430; x <= 430; x += 24) heights.push(field.getHeightAt(x, z));
  heights.sort((a, b) => a - b);
  const grade0 = Math.tan(LW.slopeDeg * Math.PI / 180);
  const score = (x, z) => {
    const h = field.getHeightAt(x, z);
    let lo = 0, hi = heights.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (heights[mid] < h) lo = mid + 1; else hi = mid; }
    const ny = Math.max(0.05, field.getNormalAt(x, z).y), grade = Math.sqrt(Math.max(0, 1 - ny * ny)) / ny;
    return lo / heights.length + 0.5 * Math.min(1, grade / grade0);
  };
  const build = (vegetation) => createVegetation(field, { setupShadowMaterial() {} }, 2001, { ...cfg, vegetation: { ...cfg.vegetation, ...vegetation } });
  // (Frontier round 4 sets the hook on the map itself: the field law's woods are the map with the hook taken off)
  const plain = build({ landscapeWoods: undefined }), wooded = build({ landscapeWoods: LW }), replay = build({ landscapeWoods: LW });
  try {
    assert.equal(plain.group.userData.landscapeWoods, undefined, 'unset: no landscape census');
    const census = wooded.group.userData.landscapeWoods;
    // (Frontier's stands seat fewer trees than the law's mean: they hold the budget past the target, a quarter more at most)
    assert.ok(census && census.stands >= census.target && census.stands <= Math.ceil(census.target * 1.25) && census.standTrees >= census.standBudget, `the woods hold their budget (${JSON.stringify(census)})`);
    assert.equal(digest(wooded), digest(replay), 'deterministic');
    const woods = (w) => w._trees.filter((t) => t.wood && Math.max(Math.abs(t.mat.elements[12]), Math.abs(t.mat.elements[14])) <= 430);
    const a = woods(plain), b = woods(wooded);
    // the tree budget: the woods hold within 3 % of the map's own
    assert.ok(Math.abs(b.length - a.length) <= 0.03 * a.length, `the woods' tree budget kept (${a.length} -> ${b.length})`);
    // on the wood-zone ground: the ridges and slopes carry the woods
    const onZone = (list) => list.filter((t) => score(t.mat.elements[12], t.mat.elements[14]) >= census.threshold - 0.1).length / list.length;
    const za = onZone(a), zb = onZone(b);
    assert.ok(zb >= 0.7 && zb >= za + 0.15, `the woods on the wood-zone ground (${za.toFixed(2)} -> ${zb.toFixed(2)})`);
    // closed woods: fewer loose trees (five neighbours or fewer within 12 m)
    const loose = (list) => {
      const grid = new Map();
      for (const t of list) { const k = `${Math.floor(t.mat.elements[12] / 12)},${Math.floor(t.mat.elements[14] / 12)}`; (grid.get(k) ?? grid.set(k, []).get(k)).push(t); }
      let n = 0;
      for (const t of list) {
        const x = t.mat.elements[12], z = t.mat.elements[14], cx = Math.floor(x / 12), cz = Math.floor(z / 12);
        let m = 0;
        for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const o of grid.get(`${cx + i},${cz + j}`) ?? []) if (Math.hypot(o.mat.elements[12] - x, o.mat.elements[14] - z) < 12) m++;
        if (m - 1 <= 5) n++;
      }
      return n;
    };
    const la = loose(a), lb = loose(b);
    assert.ok(lb <= 0.9 * la, `closed woods, fewer loose trees (${la} -> ${lb})`);
    console.log(JSON.stringify({ map: 'frontier', hook: LW, census, woods: [a.length, b.length], onZone: [+za.toFixed(2), +zb.toFixed(2)], loose: [la, lb] }));
  } finally {
    for (const w of [plain, wooded, replay]) { w.dispose(); disposeObject3DResources(w.group); }
  }
} finally { restore(); }
console.log("landscapeWoods.selftest: the hook's woods on the wood-zone ground, closed, their tree budget kept, deterministic; unset none; the maps that set it in range PASS");
