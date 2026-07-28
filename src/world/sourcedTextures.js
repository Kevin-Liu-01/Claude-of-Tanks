// src/world/sourcedTextures.js — sourced CC0 PBR texture hookup (ambientCG /
// Poly Haven sets committed under public/textures/, see docs/ATTRIBUTION.md).
//
// Deep-hunt integration 2026-07: the terrain splat layers and the village
// building materials can be fed from downloaded PBR sets instead of the
// procedural canvas painters. The procedural path stays the fallback of
// record: USE_SOURCED_* flags below gate the swap, and any image that fails
// to load simply leaves the procedural texture in place (the swap mutates the
// existing THREE.CanvasTexture image in-place, so materials/uniform bindings
// never change and the __GAME_READY screenshot contract is unaffected).
//
// Contract notes:
// - terrain splat albedo packs ROUGHNESS IN ALPHA (terrain.js splat shader);
//   composeAlbedo honors that via opts.roughInAlpha.
// - AO is multiplied into the albedo RGB (the splat shader and the prop
//   materials have no dedicated AO channel).

import * as THREE from 'three';

/** Master switches — flip to false to ship pure procedural again. */
export const USE_SOURCED_TERRAIN = true;
export const USE_SOURCED_BUILDINGS = true;

const TT = '/textures/terrain';
const TB = '/textures/buildings';

// ambientCG 1K JPG naming
const acg = (dir, base) => ({
  color: `${dir}/${base}_1K-JPG_Color.jpg`,
  normal: `${dir}/${base}_1K-JPG_NormalGL.jpg`,
  rough: `${dir}/${base}_1K-JPG_Roughness.jpg`,
  ao: `${dir}/${base}_1K-JPG_AmbientOcclusion.jpg`,
});
// Poly Haven 1K JPG naming
const ph = (dir, base) => ({
  color: `${dir}/${base}_diff_1k.jpg`,
  normal: `${dir}/${base}_nor_gl_1k.jpg`,
  rough: `${dir}/${base}_rough_1k.jpg`,
  ao: `${dir}/${base}_ao_1k.jpg`,
});

const SETS = {
  grass: acg(TT, 'Grass004'),
  dryGrass: ph(TT, 'withered_grass'),
  dirt: acg(TT, 'Ground071'),
  sand: acg(TT, 'Ground093C'),
  snow: acg(TT, 'Snow010A'),
  rock: acg(TT, 'Rock058'),
  rockWarm: acg(TT, 'Rock063'),
  cobble: acg(TT, 'PavingStones046'),
  plaster: acg(TB, 'Plaster007'),
  roof: acg(TB, 'RoofingTiles012A'),
  wood: acg(TB, 'Planks023A'),
  brick: acg(TB, 'Bricks097'),
};

// Per-map terrain layer plan (null = keep procedural layer). M (mud/marsh)
// stays procedural everywhere: its puddle/ice gloss response is authored into
// the procedural roughness field and drives uMarshGloss.
const TERRAIN_PLAN = {
  verdant: { G: 'grass', D: 'dirt', R: 'rock', M: null },
  desert: { G: 'dryGrass', D: 'sand', R: 'rockWarm', M: null },
  winter: { G: 'snow', D: 'dirt', R: 'rock', M: null },
  urban: { G: 'grass', D: 'dirt', R: 'cobble', M: null },
};

const _imgCache = new Map();
function loadImage(url) {
  if (!_imgCache.has(url)) {
    _imgCache.set(url, new Promise((res, rej) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => rej(new Error(`sourced texture missing: ${url}`));
      im.src = url;
    }));
  }
  return _imgCache.get(url);
}

/**
 * Compose color * AO with roughness packed into alpha (terrain contract) or
 * alpha=255 (props). Returns a canvas sized to the color map (max 1024).
 */
function composeAlbedo(color, ao, rough, { roughInAlpha = false, roughMul = 1, tint = null } = {}) {
  const s = Math.min(color.width, 1024);
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  ctx.drawImage(color, 0, 0, s, s);
  const px = ctx.getImageData(0, 0, s, s);
  const d = px.data;
  let aod = null, rgd = null;
  if (ao) {
    const c2 = document.createElement('canvas');
    c2.width = c2.height = s;
    const x2 = c2.getContext('2d');
    x2.drawImage(ao, 0, 0, s, s);
    aod = x2.getImageData(0, 0, s, s).data;
  }
  if (rough) {
    const c3 = document.createElement('canvas');
    c3.width = c3.height = s;
    const x3 = c3.getContext('2d');
    x3.drawImage(rough, 0, 0, s, s);
    rgd = x3.getImageData(0, 0, s, s).data;
  }
  const tr = tint ? tint[0] : 1, tg = tint ? tint[1] : 1, tb = tint ? tint[2] : 1;
  for (let i = 0; i < d.length; i += 4) {
    const a = aod ? aod[i] / 255 : 1;
    d[i] = Math.min(255, d[i] * a * tr);
    d[i + 1] = Math.min(255, d[i + 1] * a * tg);
    d[i + 2] = Math.min(255, d[i + 2] * a * tb);
    d[i + 3] = roughInAlpha
      ? Math.max(8, Math.min(255, (rgd ? rgd[i] : 230) * roughMul))
      : 255;
  }
  ctx.putImageData(px, 0, 0);
  return c;
}

function normalCanvas(img) {
  const s = Math.min(img.width, 1024);
  const c = document.createElement('canvas');
  c.width = c.height = s;
  c.getContext('2d').drawImage(img, 0, 0, s, s);
  return c;
}

/** Swap a CanvasTexture's backing image in place (bindings stay valid). */
function swapTexture(tex, canvas) {
  tex.image = canvas;
  tex.needsUpdate = true;
}

async function applySet(setKey, layer, opts) {
  const set = SETS[setKey];
  const [color, normal, rough, ao] = await Promise.all([
    loadImage(set.color), loadImage(set.normal),
    set.rough ? loadImage(set.rough).catch(() => null) : null,
    set.ao ? loadImage(set.ao).catch(() => null) : null,
  ]);
  swapTexture(layer.albedo, composeAlbedo(color, ao, rough, opts));
  swapTexture(layer.normal, normalCanvas(normal));
}

/**
 * Terrain hookup — called by createSplatMaterial after the procedural layers
 * exist. Fire-and-forget: swaps each layer's textures in place when loaded.
 * @param {string} mapId map id ('verdant'|'desert'|'winter'|'urban')
 * @param {object} layers { G, D, R, M } of { albedo, normal } CanvasTextures
 * @param {object} S splat cfg (uses mudRough for the M roughness multiplier)
 */
export function applySourcedTerrain(mapId, layers, S = {}) {
  if (!USE_SOURCED_TERRAIN) return;
  const plan = TERRAIN_PLAN[mapId] || TERRAIN_PLAN.verdant;
  for (const key of ['G', 'D', 'R', 'M']) {
    if (!plan[key] || !layers[key]) continue;
    const roughMul = key === 'M' ? (S.mudRough ?? 1) : 1;
    applySet(plan[key], layers[key], { roughInAlpha: true, roughMul })
      .catch((e) => console.warn(`[sourcedTextures] terrain ${mapId}/${key}:`, e.message));
  }
}

/**
 * Village building hookup — called by props.js after the procedural building
 * textures exist. Same in-place swap contract as the terrain path.
 * @param {object} sets { plaster?, roof?, wood?, stone? } of { albedo, normal }
 * @param {string} mapId map id (urban swaps the stone bucket to brick)
 */
export function applySourcedBuildings(sets, mapId) {
  if (!USE_SOURCED_BUILDINGS) return;
  const plan = { plaster: 'plaster', roof: 'roof', wood: 'wood' };
  if (mapId === 'urban' && sets.stone) plan.stone = 'brick';
  for (const [bucket, setKey] of Object.entries(plan)) {
    if (!sets[bucket]) continue;
    applySet(setKey, sets[bucket], { roughInAlpha: false })
      .catch((e) => console.warn(`[sourcedTextures] building ${bucket}:`, e.message));
  }
}
