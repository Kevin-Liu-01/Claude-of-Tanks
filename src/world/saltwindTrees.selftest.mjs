// The trees lane (2026-10-06, the gauntlet's wave 177 on Saltwind: "the walled fields hold tall, straight red-barked
// trunks and dark oak-like domes in rows ... no olives"; "a dense, uniform dark broadleaf bank fills the skyline"):
// Saltwind's trees on the real seeded producer. Its olive groves stand inside the dry stone walls — a stand tree seated in a
// field's interior on the terraced lowland grows as the olive (treeBiomes.ts grove) — while the holm oak woods on the
// slopes take three in ten Aleppo pines by a hash of the seat (treeBiomes.ts blend), and the maquis is the evergreen
// oak's shrubs. Species only: every draw keeps its seat. The Aleppo pine grows crooked, low-crowned and spreading. A
// construction receipt: no GPU, no art claim.
import assert from 'node:assert/strict';
import { createHeightField } from './terrain.ts';
import { createVegetation } from './vegetation.ts';
import { getMapConfig } from './maps/index.ts';
import { treeBiomeBlend, treeBiomeGrove, treeBiomeShrub, treeBiomeSlot } from './treeBiomes.ts';
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


const grove = treeBiomeGrove('saltwind'), blend = treeBiomeBlend('saltwind');
assert.ok(grove && grove.slot === 'acacia' && treeBiomeSlot('saltwind', 'acacia')?.form === 'olive', "Saltwind's groves are olives");
assert.ok(blend && blend.slot === 'cedar' && blend.into === 'pine' && blend.share > 0 && blend.share < 0.5, 'its holm oak woods take some Aleppo pine');
assert.equal(treeBiomeShrub('saltwind'), 'holmOak', "its maquis the evergreen oak's shrubs");
assert.equal(treeBiomeGrove('verdant'), null, 'a place without the entry plants no grove');
const ap = TREE_GROWTH_PROFILES.aleppoPine;
assert.ok(ap.crownBase <= 0.35 && (ap.gnarl ?? 0) >= 0.3 && (ap.ragged ?? 0) >= 0.3 && ap.crownR >= 2.9,
  'the Aleppo pine low-crowned, crooked, ragged and spreading');

const restore = canvasFixture();
try {
  const cfg = getMapConfig('saltwind'), field = createHeightField(1337, cfg);
  const heights = [];
  for (let z = -430; z <= 430; z += 24) for (let x = -430; x <= 430; x += 24) heights.push(field.getHeightAt(x, z));
  heights.sort((a, b) => a - b);
  const top = heights[Math.min(heights.length - 1, Math.floor(heights.length * grove.maxHeightShare))];
  const minY = Math.cos(grove.maxSlopeDeg * Math.PI / 180);
  const sample = { active: 0, crop: 0, edgeM: 0, endM: 0, sU: 0, sV: 0, split: 1, alongU: 1, marginM: 0, track: 0, hedge: 0, rowX: 1, rowZ: 0, jitter: 0,
    id: 0, boundary: 0, tintR: 0, tintG: 0, tintB: 0, sward: 1, cropHeight: 1, cropKeep: -1, weed: 0 };
  const interior = (x, z) => { field._landUseAt(x, z, sample); return sample.active > 0 && sample.edgeM > sample.marginM + 2; };
  const world = createVegetation(field, { setupShadowMaterial() {} }, 2001, cfg);
  try {
    const census = {};
    let lowInterior = 0, lowInteriorOlive = 0, slopeWood = 0, slopeHolm = 0, slopePine = 0;
    for (const t of world._trees) {
      census[t.species] = (census[t.species] ?? 0) + 1;
      if (!t.wood || t.species === 'snag') continue;
      const x = t.mat.elements[12], z = t.mat.elements[14];
      const low = field.getHeightAt(x, z) <= top && field.getNormalAt(x, z).y >= minY;
      if (low && interior(x, z)) { lowInterior++; if (t.species === 'acacia') lowInteriorOlive++; }
      else if (!low) { slopeWood++; if (t.species === 'cedar') slopeHolm++; if (t.species === 'pine') slopePine++; }
    }
    // the groves: every living wood tree inside the walls on the terraced lowland is an olive (the battle zone's snags
    // apart)
    assert.equal(lowInteriorOlive, lowInterior, `the walled lowland's woods are olive groves (${lowInteriorOlive} of ${lowInterior})`);
    // the slopes keep holm oak and Aleppo pine, the pine at about the blend's share among them or over
    assert.ok(slopeHolm + slopePine > 0.5 * slopeWood && slopePine > 0.2 * (slopeHolm + slopePine),
      `the slopes' woods holm oak and Aleppo pine (${slopeHolm} holm, ${slopePine} pine of ${slopeWood})`);
    assert.ok(census.acacia > census.cedar && census.acacia > census.pine, `the olive leads the place (${JSON.stringify(census)})`);
    console.log(JSON.stringify({ map: 'saltwind', trees: world._trees.length, census, lowland: { wood: lowInterior, olive: lowInteriorOlive }, slopes: { wood: slopeWood, holm: slopeHolm, pine: slopePine } }));
  } finally {
    world.dispose(); disposeObject3DResources(world.group);
  }
} finally { restore(); }
console.log("saltwindTrees.selftest: Saltwind's olive groves inside its walls on the terraced lowland, holm oak and Aleppo pine on its slopes, maquis shrubs; species only, every seat kept PASS");
