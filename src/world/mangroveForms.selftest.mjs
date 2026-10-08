// Trees lane (2026-10-08, the gauntlet's wave 278 on Mangrove Reach, the Ca Mau coast: "the far bank is a treeline of
// generic temperate broadleaf trees ... with no mangrove, nipa palm or shrimp-pond dykes"): the place's forms. The bank's
// tidal mangrove grows as Rhizophora (its crown down close over its stilts, wider and denser so a bank's crowns close
// into one wall, its glossy leaves darker, in the place's dark green); the map's eucalyptus slot grows as the grey
// mangrove Avicennia (low, forked near the mud, grey-green, no stilts); its palm slot as the stemless nipa (its fronds
// rising from the mud). On the real seeded producers: Mangrove Reach's palms stand without stems and its eucalyptus slot
// draws grey-green, while another map's palms keep their stems. A construction receipt: no GPU, no art claim.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { growTreeSkeleton, GROWTH_SPECIES, TREE_GROWTH_PROFILES } from './treeGrowth.ts';
import { createHeightField } from './terrain.ts';
import { createVegetation, grownFormSprayKind } from './vegetation.ts';
import { getMapConfig } from './maps/index.ts';
import { treeBiomeColour, treeBiomeSlot } from './treeBiomes.ts';
import { disposeObject3DResources } from '../engine/resourceLifetime.ts';

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// 1. the table and the profiles
assert.equal(treeBiomeSlot('mangrove', 'eucalyptus')?.form, 'avicennia', 'the eucalyptus slot grows as the grey mangrove');
assert.equal(treeBiomeSlot('mangrove', 'palm')?.form, 'nipa', 'the palm slot grows as the nipa');
assert.ok(treeBiomeColour('mangrove')?.cardSat <= 0.16, 'the place colour: Rhizophora\'s dark glossy green');
assert.ok(treeBiomeSlot('mangrove', 'eucalyptus').colour.cardSat < 0.1, 'Avicennia grey-green');
for (const form of ['avicennia', 'nipa']) assert.ok(GROWTH_SPECIES.includes(form), `${form}: a tree slot's form`);
assert.equal(grownFormSprayKind('avicennia'), 'mangrove', 'Avicennia paints the tidal mangrove\'s leathery leaves');
const rh = TREE_GROWTH_PROFILES.mangrove;
assert.ok(rh.forkAt[1] <= 0.3 && rh.crownR >= 3.8 && rh.leafPerM >= 4.2 && (rh.foliageValue ?? 1) <= 1.05,
  'Rhizophora: the crown down over its stilts, wide, dense and dark');

// 2. the nipa's skeletons: no stem above the mud, its fronds rising steeply from a stub; the palm keeps its stem
for (let variant = 0; variant < 3; variant++) {
  const nipa = growTreeSkeleton('nipa', mulberry32(2001 + variant * 7), { variant, tier: 'desktop' });
  const palm = growTreeSkeleton('palm', mulberry32(2001 + variant * 7), { variant, tier: 'desktop' });
  assert.ok(nipa.height < 0.6, `nipa/${variant}: a stub, no stem (${nipa.height.toFixed(2)} m)`);
  assert.ok(nipa.leaves.every((l) => l.y < 0.6), `nipa/${variant}: every frond rises from the mud`);
  const live = nipa.leaves.filter((l) => Math.asin(l.ay) > 0.3);
  assert.ok(live.length >= 12, `nipa/${variant}: ${live.length} fronds standing`);
  assert.ok(Math.max(...nipa.leaves.map((l) => l.y + l.ay * l.length)) > 4.5, `nipa/${variant}: its fronds reach over four and a half metres`);
  assert.ok(Math.min(...palm.leaves.map((l) => l.y)) > 4, `palm/${variant}: the palm keeps its stem`);
}

// 3. the real seeded producers
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
const c = new THREE.Color();
/** A crown's lowest card vertex and its median HSV saturation in sRGB. */
function crownOf(geometry) {
  const pos = geometry.getAttribute('position'), color = geometry.getAttribute('color');
  let low = Infinity, high = -Infinity;
  for (let i = 0; i < pos.count; i++) { low = Math.min(low, pos.getY(i)); high = Math.max(high, pos.getY(i)); }
  const sats = [];
  if (color) for (let i = 0; i < color.count; i++) {
    c.setRGB(color.getX(i), color.getY(i), color.getZ(i)).convertLinearToSRGB();
    const max = Math.max(c.r, c.g, c.b), min = Math.min(c.r, c.g, c.b);
    sats.push(max > 0 ? (max - min) / max : 0);
  }
  sats.sort((a, b) => a - b);
  return { low, high, sat: sats.length ? sats[sats.length >> 1] : null };
}
const restore = canvasFixture();
const report = {};
try {
  for (const mapId of ['mangrove', 'oasis']) {
    const cfg = getMapConfig(mapId), field = createHeightField(1337, cfg);
    const veg = createVegetation(field, { setupShadowMaterial() {} }, 2001, cfg);
    try {
      const planted = new Set(veg._trees.map((t) => t.species));
      const pools = veg.group.children.filter((m) => m.isInstancedMesh && m.userData.treeFoliage && m.userData.treeLod === 'near'
        && m.userData.treeSpecies);
      const rows = {};
      for (const m of pools) {
        const sp = m.userData.treeSpecies;
        if (!planted.has(sp)) continue;
        (rows[sp] ??= []).push(crownOf(m.geometry));
      }
      report[mapId] = Object.fromEntries(Object.entries(rows).map(([sp, rs]) => [sp, {
        low: +Math.min(...rs.map((r) => r.low)).toFixed(2), high: +Math.max(...rs.map((r) => r.high)).toFixed(2),
        sat: rs[0].sat === null ? null : +Math.max(...rs.map((r) => r.sat)).toFixed(3) }]));
      if (mapId === 'mangrove') {
        assert.ok(rows.palm?.length, 'Mangrove Reach plants its palm slot');
        for (const r of rows.palm) assert.ok(r.low < 1.0 && r.high > 4, `the nipa's fronds from the mud to ${r.high.toFixed(1)} m (lowest ${r.low.toFixed(2)})`);
        assert.ok(rows.eucalyptus?.length, 'Mangrove Reach plants its eucalyptus slot');
        for (const r of rows.eucalyptus) assert.ok(r.sat < 0.22, `the grey mangrove's leaves grey-green (median saturation ${r.sat.toFixed(3)})`);
      } else if (rows.palm) {
        for (const r of rows.palm) assert.ok(r.low > 1.5, `${mapId}: its palms keep their stems (lowest frond ${r.low.toFixed(2)} m, the old fronds hanging)`);
      }
    } finally { veg.dispose(); disposeObject3DResources(veg.group); }
  }
} finally { restore(); }
console.log(JSON.stringify(report));
console.log('mangroveForms.selftest: the Ca Mau coast — Rhizophora walls, the grey mangrove, the stemless nipa; other palms keep their stems PASS');
