// Trees round 8 (2026-10-07, canopy and form — the gauntlet's waves 236-238 on Verdant, Monsoon and Frontier: woods of
// "tall, pale, pole-straight trunks with small sparse tufts at the top", "a see-through stand of tall straight trunks",
// "uniform pale cylinder poles"): a closed wood's trees carry their crowns from under a third of their height, as wide as
// in the open, hardly taller, on stems of three girths, under darker bark; Verdant's woods grow their poplar slot as the
// forest-steppe's ash while its rows keep their poplars. On the real seeded producers the woods' crowns now meet over
// their ground, and every seat and record is the map's with the forest forms off (only form moves). A construction
// receipt: no GPU, no art claim.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createHeightField } from './terrain.ts';
import { createVegetation } from './vegetation.ts';
import { getMapConfig } from './maps/index.ts';
import {
  GROWTH_AGE_GIRTH, GROWTH_FOREST_FORM, GROWTH_SPECIES, TREE_GROWTH_PROFILES, forestGrownProfile, growTreeSkeleton,
} from './treeGrowth.ts';
import { treeBiomeSlot, treeBiomeWoodForm } from './treeBiomes.ts';
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
  return () => { for (const [k, descriptor] of saved) {
    if (descriptor) Object.defineProperty(globalThis, k, descriptor); else delete globalThis[k];
  } };
}

// the form: crowns from under a third of the height, as wide as in the open, sprays a sixth larger
const f = GROWTH_FOREST_FORM;
assert.ok(f.crownBase <= 0.32 && f.coniferCrownBase <= 0.3 && f.forkMax <= 0.42 && f.crownR >= 1 && f.height <= 1.06 && f.spray > 1,
  `the forest-grown form (${JSON.stringify(f)})`);
for (const sp of ['oak', 'beech', 'castanopsis', 'ash']) {
  const p = TREE_GROWTH_PROFILES[sp], fp = forestGrownProfile(p);
  const bole = p.form === 'decurrent' ? fp.forkAt[1] : fp.crownBase;
  assert.ok(bole <= 0.42, `${sp}: the wood's crown from under ${bole}`);
  assert.ok(fp.crownR >= p.crownR && fp.spray[1] > p.spray[1], `${sp}: as wide as in the open, larger sprays`);
  // darker bark (the waves' "pale trunks"): the broadleaves' stems under 0.4 (the beech's smooth grey under 0.52)
  assert.ok(Math.max(...p.barkTint) <= (sp === 'beech' ? 0.52 : 0.4), `${sp}: darker bark (${p.barkTint})`);
}
assert.ok(TREE_GROWTH_PROFILES.birch.barkTint[0] > 0.85, 'the birch stays white');
assert.ok(GROWTH_SPECIES.includes('ash'), 'the ash is a tree form');
// the stems' three girths: the variants' grown trunks at the age's girth
const mulberry = (seed) => () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
for (const sp of ['oak', 'ash', 'birch']) {
  const r = [0, 1, 2].map((v) => growTreeSkeleton(sp, mulberry(77), { variant: v, tier: 'desktop' }).branches[0].nodes[0].r);
  assert.ok(Math.abs(r[0] / r[1] - GROWTH_AGE_GIRTH[0]) < 0.02 && Math.abs(r[2] / r[1] - GROWTH_AGE_GIRTH[2]) < 0.02, `${sp}: three girths (${r.map((x) => x.toFixed(3))})`);
}
// the wood form: Verdant's woods grow their poplar slot as ash, no other place names one
assert.equal(treeBiomeWoodForm('verdant', 'poplar'), 'ash');
assert.equal(treeBiomeSlot('verdant', 'poplar'), null, "Verdant's rows keep the slot's own poplar");
assert.equal(treeBiomeWoodForm('frontier', 'poplar'), null);

const round = (v) => (typeof v === 'number' ? +v.toFixed(4) : v);
const digest = (rows) => createHash('sha256').update(JSON.stringify(rows, (_k, v) => round(v))).digest('hex').slice(0, 16);
const restore = canvasFixture();
try {
  for (const mapId of ['verdant', 'monsoon']) {
    const cfg = getMapConfig(mapId), field = createHeightField(1337, cfg);
    globalThis.location = { search: '?forestForm=0' };
    const plain = createVegetation(field, { setupShadowMaterial() {} }, 2001, cfg);
    globalThis.location = { search: '' };
    const world = createVegetation(field, { setupShadowMaterial() {} }, 2001, cfg);
    try {
      // only form moves: every seat, collider and concealment disc the map has without the forest forms
      assert.equal(digest(world._trees.map((t) => [t.species, t.mat.elements])), digest(plain._trees.map((t) => [t.species, t.mat.elements])), `${mapId}: every seat`);
      const records = (w) => digest([w.treeObstacles.map((o) => [o.min, o.max, o.treeIdx, o.kind]), w.concealers.map((c) => [c.x, c.z, c.r, c.add])]);
      assert.ok(world.treeObstacles.length > 1000 && world.treeObstacles.every((o) => Array.isArray(o.min) && Array.isArray(o.max)), `${mapId}: the colliders read`);
      assert.equal(records(world), records(plain), `${mapId}: every record`);
      // the wood's crowns meet: each wood tree's crown radius with its nearest wood neighbour's over their distance
      const forest = new Set(world.group.userData.treeForms?.species ?? []);
      const wood = world._trees.filter((t) => t.wood && forest.has(t.species)).map((t) => {
        const e = t.mat.elements, form = treeBiomeWoodForm(mapId, t.species) ?? treeBiomeSlot(mapId, t.species)?.form ?? t.species;
        return { x: t.x, z: t.z, R: forestGrownProfile(TREE_GROWTH_PROFILES[form]).crownR * Math.hypot(e[0], e[1], e[2]) };
      });
      const grid = new Map(), key = (x, z) => `${Math.floor(x / 10)},${Math.floor(z / 10)}`;
      for (const w of wood) (grid.get(key(w.x, w.z)) ?? grid.set(key(w.x, w.z), []).get(key(w.x, w.z))).push(w);
      let meet = 0, n = 0;
      for (const w of wood) {
        let best = null, bd = Infinity;
        for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const o of grid.get(`${Math.floor(w.x / 10) + i},${Math.floor(w.z / 10) + j}`) ?? []) {
          if (o === w) continue;
          const d = Math.hypot(o.x - w.x, o.z - w.z);
          if (d < bd) { bd = d; best = o; }
        }
        if (!best) continue;
        n++; if ((w.R + best.R) / bd >= 1) meet++;
      }
      assert.ok(n > 1000 && meet / n > 0.9, `${mapId}: the wood's crowns meet (${meet} of ${n})`);
      // Verdant: the poplar slot's wood trees grow as ash, its field trees as poplar (their pools' shadow hulls differ)
      console.log(JSON.stringify({ map: mapId, wood: n, meet: +(meet / n).toFixed(3), forms: world.group.userData.treeForms }));
    } finally {
      for (const w of [plain, world]) { w.dispose(); disposeObject3DResources(w.group); }
    }
  }
} finally { restore(); }
console.log('canopyForm.selftest: the woods\' crowns from under a third of their height, as wide as in the open, three girths, darker bark, Verdant\'s woods of ash; only form moves PASS');
