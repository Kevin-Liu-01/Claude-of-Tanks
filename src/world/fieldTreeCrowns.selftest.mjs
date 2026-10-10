// The trees lane (2026-10-07, the gauntlet's wave 223 on Ironworks: "cloned roadside tree rows"): on a map whose woods
// close, a wood species' field trees draw among three open-grown crowns — the open variant and the open-grown
// alternates of the two forest-grown ones (vegetation.ts assignTreeForms, FIELD_OPEN_ALTERNATES) — so a shelterbelt's
// or a boundary row's neighbours differ, where since round 5 every field tree of such a species drew the one open
// variant. Only the pool a tree draws in moves: on the real seeded producer, every seat, matrix, collider and
// concealment disc is the one the map has with the forest forms off (`?forestForm=0`). A construction receipt: no GPU,
// no art claim. (The treescn lane, 2026-10-09: round 8 by place — the field crowns grow on a place with round 8's canopy
// form, treeBiomes.ts canopyForm: Monsoon Ridge and Obsidian Caldera here; Frontier, on the owner's light-touch list,
// keeps every field tree on the one open variant, as before.)
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createHeightField } from './terrain.ts';
import { createVegetation } from './vegetation.ts';
import { getMapConfig } from './maps/index.ts';
import { treeBiomeCanopyForm } from './treeBiomes.ts';
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

const round = (v) => (typeof v === 'number' ? +v.toFixed(4) : v);
const digest = (rows) => createHash('sha256').update(JSON.stringify(rows, (_k, v) => round(v))).digest('hex').slice(0, 16);
const seats = (world) => digest(world._trees.map((t) => [t.species, t.mat.elements]));
const records = (world) => digest([
  world.treeObstacles.map((o) => Object.fromEntries(Object.entries(o).filter(([, v]) => typeof v !== 'object' || Array.isArray(v)))),
  world.concealers.map((c) => [c.x, c.z, c.r]),
]);

const restore = canvasFixture();
try {
  for (const mapId of ['monsoon', 'caldera', 'frontier', 'desert']) {
    const cfg = getMapConfig(mapId), field = createHeightField(1337, cfg);
    globalThis.location = { search: '?forestForm=0' };
    const plain = createVegetation(field, { setupShadowMaterial() {} }, 2001, cfg);
    globalThis.location = { search: '' };
    const world = createVegetation(field, { setupShadowMaterial() {} }, 2001, cfg);
    try {
      const forms = world.group.userData.treeForms;
      // every seat and record the map has without the forms: the crowns choose a pool, never a place
      assert.equal(seats(world), seats(plain), `${mapId}: every tree on its seat, its matrix`);
      assert.equal(records(world), records(plain), `${mapId}: every collider and concealment disc unchanged`);
      if (!forms) {
        assert.ok(world._trees.every((t, i) => t.variant === plain._trees[i].variant), `${mapId}: no wood closes, no form moves`);
        console.log(JSON.stringify({ map: mapId, forms: null }));
        continue;
      }
      const forest = new Set(forms.species);
      const field = world._trees.filter((t) => forest.has(t.species) && !t.wood);
      if (!treeBiomeCanopyForm(mapId)) {
        // a place without round 8's canopy form: every field tree on the open variant, no field crown's pool
        for (const t of field) assert.equal(t.variant, 2, `${mapId}: a field tree on the open variant`);
        assert.deepEqual(forms.fieldCrowns, [forms.open, 0, 0], `${mapId}: the census's one open crown`);
        world.group.traverse((o) => assert.ok(!/^treeCanopyShadow_[a-z]+_[34]$/.test(o.name || ''), `${mapId}: no field crown's pool (${o.name})`));
        console.log(JSON.stringify({ map: mapId, forms }));
        continue;
      }
      for (const t of world._trees) {
        if (!forest.has(t.species)) continue;
        if (t.wood) assert.ok(t.variant === 0 || t.variant === 1, `${mapId}: a wood tree on a forest-grown variant (${t.variant})`);
        else assert.ok(t.variant >= 2 && t.variant <= 4, `${mapId}: a field tree on an open crown (${t.variant})`);
      }
      // the three open crowns, about a third each
      const crowns = forms.fieldCrowns;
      assert.equal(crowns.reduce((a, b) => a + b, 0), forms.open, `${mapId}: the census counts every field tree (${JSON.stringify(forms)})`);
      assert.equal(field.length, forms.open, `${mapId}: the census's field trees`);
      if (forms.open >= 30) for (const c of crowns) assert.ok(c >= 0.18 * forms.open, `${mapId}: each open crown in use (${crowns})`);
      // a row's neighbours differ: same-species field trees within 9 m share a crown about a third of the time (every
      // pair shared one before)
      let pairs = 0, same = 0;
      for (let i = 0; i < field.length; i++) for (let j = i + 1; j < field.length; j++) {
        const a = field[i], b = field[j];
        if (a.species !== b.species || Math.hypot(a.x - b.x, a.z - b.z) > 9) continue;
        pairs++; if (a.variant === b.variant) same++;
      }
      if (pairs >= 12) assert.ok(same <= 0.6 * pairs, `${mapId}: a row's neighbours differ (${same} of ${pairs} pairs share a crown)`);
      // each open crown is a near pool of its own (its shadow proxy where the tier draws them)
      const proxies = new Set();
      world.group.traverse((o) => { const m = /^treeCanopyShadow_([a-z]+)_(\d)$/.exec(o.name || ''); if (m) proxies.add(`${m[1]}_${m[2]}`); });
      if (proxies.size) for (const sp of forest) for (const v of [3, 4]) assert.ok(proxies.has(`${sp}_${v}`), `${mapId}: ${sp}'s open crown ${v} has its pool`);
      console.log(JSON.stringify({ map: mapId, forms, rows: { pairs, same } }));
    } finally {
      for (const w of [plain, world]) { w.dispose(); disposeObject3DResources(w.group); }
    }
  }
} finally { restore(); }
console.log('fieldTreeCrowns.selftest: a wood species\' field trees among three open crowns, a row\'s neighbours differing; every seat and record as without the forms PASS');
