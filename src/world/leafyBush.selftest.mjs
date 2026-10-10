// Trees lane (2026-10-08, the gauntlet's wave 260 on Hostomel's handcart: the near field bush "flat olive-brown leaf
// cards with dark outlines, a heap of paper cut-outs"): a shrub grown as its bush slot's own leafy form takes that form's
// leaves, as the slot's trees do. Hostomel's and the reservoir's birch slot grows the leafy birch (treeBiomes.ts
// `leaves: true`); its bushes drew their leaf sprays in the bare winter birch's twig brown (grownTintLaw's birch without
// leaves, hue 0.08). On the real seeded producers: every map whose bush grows as its slot's leafy form draws its bush
// leaves in the leafy birch's green-yellow (the cards' mean hue past 0.15, the stems' cards apart), as its birch trees'
// crowns do; a map with its own shrub form keeps it. A construction receipt: no GPU, no art claim.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createHeightField } from './terrain.ts';
import { createVegetation } from './vegetation.ts';
import { getMapConfig, MAP_IDS } from './maps/index.ts';
import { treeBiomeShrub, treeBiomeSlot } from './treeBiomes.ts';
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

/** The maps whose bush grows as its slot's own leafy form (no shrub form of their own). */
const leafyBushMaps = MAP_IDS.filter((id) => {
  const veg = getMapConfig(id).vegetation ?? {};
  const bush = veg.bushSpecies ?? 'oak';
  const explicit = veg.palettes?.[bush]?.form;
  const leaves = explicit ? veg.palettes?.[bush]?.birchLeaves === true : treeBiomeSlot(id, bush)?.leaves === true;
  return !(veg.shrubForm ?? treeBiomeShrub(id)) && leaves;
});
assert.deepEqual(leafyBushMaps.sort(), ['airfield', 'reservoir'], 'the maps whose bushes grow as their slot\'s leafy birch');

/** A geometry's leaf cards' mean HSL hue from its vertex colours (the stems' warm-grey cards, low saturation, apart). */
function leafHue(geometry, need = 50) {
  const color = geometry.getAttribute('color');
  assert.ok(color, 'the grown shrub carries its tint in vertex colours');
  const c = new THREE.Color(), hsl = {};
  let x = 0, y = 0, n = 0;
  for (let i = 0; i < color.count; i++) {
    c.setRGB(color.getX(i), color.getY(i), color.getZ(i)).getHSL(hsl);
    if (hsl.s < 0.12) continue; // a stem card's neutral bark, or a grey cast
    x += Math.cos(hsl.h * 2 * Math.PI); y += Math.sin(hsl.h * 2 * Math.PI); n++;
  }
  if (n < need) return null;
  const h = Math.atan2(y, x) / (2 * Math.PI);
  return h < 0 ? h + 1 : h;
}

const restore = canvasFixture();
try {
  for (const mapId of leafyBushMaps) {
    const cfg = getMapConfig(mapId), field = createHeightField(1337, cfg);
    const veg = createVegetation(field, { setupShadowMaterial() {} }, 2001, cfg);
    try {
      const bushes = veg.group.children.filter((m) => m.isInstancedMesh && m.userData.bush && m.count > 0);
      assert.ok(bushes.length > 0, `${mapId}: field bushes`);
      const hues = bushes.map((m) => leafHue(m.geometry));
      assert.ok(hues.every((h) => h !== null), `${mapId}: the bushes' leaf cards to read`);
      // the leafy birch's leaves (grownTintLaw: 0.228) against the bare winter birch's twig brown (0.08)
      for (const h of hues) assert.ok(h > 0.15 && h < 0.33, `${mapId}: the bush's leaves green-yellow, not the bare birch's brown (hue ${h.toFixed(3)})`);
      // (the map's near crowns, for the record: the birch's leafy law is theirs; an unused species' pool has no cards)
      const crownHues = veg.group.children.filter((m) => m.isInstancedMesh && m.userData.treeFoliage && m.userData.treeLod === 'near'
        && m.geometry.getAttribute('color')).map((m) => leafHue(m.geometry)).filter((h) => h !== null).map((h) => +h.toFixed(3));
      console.log(JSON.stringify({ map: mapId, bushHues: hues.map((h) => +h.toFixed(3)), crownHues }));
    } finally { veg.dispose(); disposeObject3DResources(veg.group); }
  }
} finally { restore(); }
console.log('leafyBush.selftest: a bush grown as its slot\'s leafy birch draws its leaves green as the slot\'s trees do (Hostomel, the reservoir) PASS');
