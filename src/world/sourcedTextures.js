// src/world/sourcedTextures.js — sourced CC0 PBR texture hookup (ambientCG /
// Poly Haven sets committed under public/textures/, see docs/ATTRIBUTION.md).
//
// Deep-hunt integration 2026-07: the terrain splat layers and the village
// building materials can be fed from downloaded PBR sets instead of the
// procedural canvas painters. Any image that fails to load simply leaves the
// procedural texture in place (the swap mutates the
// existing THREE.CanvasTexture image in-place, so materials/uniform bindings
// never change and the __GAME_READY screenshot contract is unaffected).
//
// Contract notes:
// - terrain splat albedo packs ROUGHNESS IN ALPHA (terrain.js splat shader);
//   composeAlbedo honors that via opts.roughInAlpha.
// - AO is multiplied into the albedo RGB (the splat shader and the prop
//   materials have no dedicated AO channel).

import * as THREE from 'three';
// MOBILE r1: central tier texture scale — the sourced photo-set composites
// below were the largest world textures left on the mobile tier (7-10 live
// 1024² albedo+normal canvases ≈ 40-70 MB). Desktop sizes are unchanged.
import { texSize } from '../engine/quality.js';

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
// Entries may be a set key or { set, tint, roughMul }: tint multiplies the
// albedo (Ground071 ships saturated orange — desaturated toward earth brown
// so dirt roads stop glowing against the graded grass), roughMul raises the
// packed roughness floor so sourced sets never reintroduce specular sheen.
const TERRAIN_PLAN = {
  verdant: {
    G: { set: 'grass', roughMul: 1.25 },
    D: { set: 'dirt', tint: [0.82, 0.80, 0.76], roughMul: 1.3 },
    R: 'rock', M: null,
  },
  desert: {
    // G was 'dryGrass' (withered_grass photo set): its dense dark straw
    // mottle covered ~80% of the map and read as baked film-grain speckle
    // across every establishing shot. Sand-on-sand instead — the light base
    // is the open desert floor, the darker/warmer D variant shows through on
    // worn patches, and the ripple normals carry the surface character.
    // r7: sand albedo -7% — pairs with the desert.js sun drop (4.9 -> 4.15,
    // lighting r4) to pull the blown-out center valley off the tonemap
    // shoulder without going muddy
    // terrain_environment r3: another -8% — NOTE the desert.js grassTone cap
    // only reaches the procedural fallback; THIS tint is the real albedo of
    // the sourced Ground093C sand that renders. Pairs with the desert.js sun
    // 3.55 -> 3.30 + fog cut so the establishing midfield keeps texture.
    G: { set: 'sand', tint: [0.88, 0.845, 0.78], roughMul: 1.2 },
    D: { set: 'sand', tint: [0.74, 0.675, 0.58], roughMul: 1.25 },
    // r7: R stays PROCEDURAL (terrain.js makeSandstoneLayer). Rock063's wavy
    // metamorphic veining — magnified by the warm tint — was the swirly
    // "wet-sand" smear on every mesa/canyon wall; the procedural layer is
    // authored as true horizontal sedimentary strata instead.
    R: null, M: null,
  },
  winter: {
    G: { set: 'snow', roughMul: 1.15 },
    D: { set: 'dirt', tint: [0.74, 0.73, 0.72], roughMul: 1.3 },
    // snow-dusted rock: raw Rock058 is near-black here and punched dark
    // holes into the snowfield wherever a lake bank / cut slope got steep
    R: { set: 'rock', tint: [1.52, 1.55, 1.62], roughMul: 1.1 }, M: null,
  },
  urban: {
    G: { set: 'grass', tint: [0.92, 0.92, 0.88], roughMul: 1.25 },
    D: { set: 'dirt', tint: [0.78, 0.77, 0.75], roughMul: 1.3 },
    // r6: warm the raw PavingStones046 sett (it ships cool grey and read as
    // canal water under the blue sky fill) and raise the roughness floor so
    // no residual sheen survives on the carriageway
    R: { set: 'cobble', tint: [1.0, 0.94, 0.84], roughMul: 1.45 }, M: null,
  },
  // maps r1 (ADDITIVE — new battlefields only; M stays procedural everywhere,
  // it carries the authored water/ice gloss response):
  coastal: {
    // maritime meadow: grass pulled toward wind-cured dune sward
    G: { set: 'grass', tint: [1.04, 0.99, 0.84], roughMul: 1.25 },
    // D doubles as the BEACH layer (the uSea shore apron + shoals sample it):
    // pale dry strand sand
    D: { set: 'sand', tint: [0.92, 0.87, 0.76], roughMul: 1.25 },
    R: { set: 'rock', tint: [1.06, 1.05, 1.02], roughMul: 1.15 }, M: null,
  },
  autumn: {
    // fall meadow: green grass multiplied toward olive-gold hay
    G: { set: 'grass', tint: [1.22, 1.04, 0.68], roughMul: 1.25 },
    D: { set: 'dirt', tint: [0.84, 0.78, 0.70], roughMul: 1.3 },
    R: { set: 'rock', tint: [1.02, 1.0, 0.94], roughMul: 1.15 }, M: null,
  },
  steppe: {
    // the golden grassland IS the withered-grass set (its straw mottle reads
    // as cured feather-grass here; on desert sand it read as film grain).
    // r2: tint pulled DOWN toward olive-gold — at 1.06/0.98/0.80 the pale
    // straw set + warm sun rendered as orange desert sand, not grassland
    G: { set: 'dryGrass', tint: [0.80, 0.82, 0.58], roughMul: 1.25 },
    D: { set: 'dirt', tint: [0.84, 0.78, 0.62], roughMul: 1.3 },
    // r3: Rock058 ships cool grey — sun-warm it so fold-crest rock reads as
    // dry earth/stone, not blue slag
    R: { set: 'rock', tint: [1.26, 1.12, 0.90], roughMul: 1.15 }, M: null,
  },
  railyard: {
    // brownfield: trodden grey-green verge grass, ash/cinder dirt, and the
    // R layer doubles as CONCRETE hardstand + road paving (uRoadTex)
    G: { set: 'grass', tint: [0.80, 0.78, 0.66], roughMul: 1.3 }, // r3: duller — read as mowed lawn
    D: { set: 'dirt', tint: [0.66, 0.64, 0.60], roughMul: 1.35 },
    R: { set: 'cobble', tint: [0.88, 0.88, 0.86], roughMul: 1.5 }, M: null,
  },
  // Map-quality expansion. Unknown ids intentionally fall back to Verdant,
  // so every new biome must route its sourced layers explicitly; otherwise
  // the async photo-set swap erases the authored procedural palette.
  frontier: {
    G: { set: 'grass', tint: [0.96, 0.94, 0.76], roughMul: 1.28 },
    D: { set: 'dirt', tint: [0.80, 0.75, 0.64], roughMul: 1.3 },
    R: { set: 'rock', tint: [1.02, 1.0, 0.92], roughMul: 1.15 }, M: null,
  },
  fjord: {
    G: { set: 'grass', tint: [0.76, 0.86, 0.80], roughMul: 1.28 },
    D: { set: 'dirt', tint: [0.68, 0.70, 0.68], roughMul: 1.35 },
    R: { set: 'rock', tint: [1.12, 1.17, 1.22], roughMul: 1.15 }, M: null,
  },
  delta: {
    G: { set: 'grass', tint: [0.68, 0.94, 0.60], roughMul: 1.22 },
    D: { set: 'dirt', tint: [0.67, 0.59, 0.43], roughMul: 1.28 },
    R: { set: 'rock', tint: [0.88, 0.94, 0.78], roughMul: 1.18 }, M: null,
  },
  badlands: {
    G: { set: 'sand', tint: [0.90, 0.68, 0.52], roughMul: 1.24 },
    D: { set: 'sand', tint: [0.70, 0.46, 0.36], roughMul: 1.28 },
    R: null, M: null,
  },
  monsoon: {
    G: { set: 'grass', tint: [0.57, 0.82, 0.58], roughMul: 1.22 },
    D: { set: 'dirt', tint: [0.59, 0.55, 0.44], roughMul: 1.3 },
    R: { set: 'rock', tint: [0.76, 0.84, 0.76], roughMul: 1.15 }, M: null,
  },
  alpine: {
    G: { set: 'snow', roughMul: 1.15 },
    D: { set: 'dirt', tint: [0.70, 0.70, 0.71], roughMul: 1.32 },
    R: { set: 'rock', tint: [1.48, 1.53, 1.62], roughMul: 1.1 }, M: null,
  },
  caldera: {
    G: { set: 'dirt', tint: [0.43, 0.40, 0.34], roughMul: 1.34 },
    D: { set: 'dirt', tint: [0.30, 0.28, 0.27], roughMul: 1.4 },
    R: { set: 'rock', tint: [0.42, 0.40, 0.39], roughMul: 1.2 }, M: null,
  },
  foundry: {
    G: { set: 'grass', tint: [0.66, 0.65, 0.56], roughMul: 1.32 },
    D: { set: 'dirt', tint: [0.52, 0.51, 0.48], roughMul: 1.38 },
    R: { set: 'cobble', tint: [0.76, 0.77, 0.76], roughMul: 1.52 }, M: null,
  },
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

// Readback-heavy AO and roughness decoding shares one opted-in scratch
// surface. Creating two fresh default contexts for every layer triggered the
// browser's Canvas2D readback slow-path and repeated allocations during map
// switches.
let _readbackCanvas = null;
let _readbackCtx = null;
let _readbackSize = 0;
function readScaledPixels(image, size) {
  if (!image) return null;
  if (!_readbackCanvas) {
    _readbackCanvas = document.createElement('canvas');
    _readbackCtx = _readbackCanvas.getContext('2d', { willReadFrequently: true });
  }
  if (_readbackSize !== size) {
    _readbackCanvas.width = size;
    _readbackCanvas.height = size;
    _readbackSize = size;
  }
  _readbackCtx.drawImage(image, 0, 0, size, size);
  return _readbackCtx.getImageData(0, 0, size, size).data;
}

function touchLru(cache, key, value, limit) {
  cache.delete(key);
  cache.set(key, value);
  while (cache.size > limit) cache.delete(cache.keys().next().value);
  return value;
}

// A recent battlefield's expensive color/AO/roughness composites survive a
// rematch without retaining the fork's 16 full-size canvases. Normals are
// cheaper but still reused for the four most recent source sets.
const _compositeCache = new Map();
const _normalCache = new Map();
const COMPOSITE_CACHE_MAX = 8;
const NORMAL_CACHE_MAX = 4;

function compositeKey(setKey, opts = {}) {
  const {
    roughInAlpha = false,
    roughMul = 1,
    tint = null,
    desat = 0,
    lift = 0,
  } = opts;
  return `${setKey}|${roughInAlpha ? 1 : 0}|${roughMul}|${tint ? tint.join(',') : '-'}|${desat}|${lift}`;
}

/**
 * Compose color * AO with roughness packed into alpha (terrain contract) or
 * alpha=255 (props). Returns a canvas sized to the color map (max 1024).
 */
export function composeAlbedo(color, ao, rough, { roughInAlpha = false, roughMul = 1, tint = null, desat = 0, lift = 0 } = {}) {
  const s = Math.min(color.width, texSize(1024)); // MOBILE r1: tier-scaled compose
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  ctx.drawImage(color, 0, 0, s, s);
  const px = ctx.getImageData(0, 0, s, s);
  const d = px.data;
  const aod = readScaledPixels(ao, s);
  const rgd = readScaledPixels(rough, s);
  const tr = tint ? tint[0] : 1, tg = tint ? tint[1] : 1, tb = tint ? tint[2] : 1;
  for (let i = 0; i < d.length; i += 4) {
    const a = aod ? aod[i] / 255 : 1;
    let r = d[i] * a * tr, g = d[i + 1] * a * tg, b = d[i + 2] * a * tb;
    // r5 terrain_environment: desat/lift — a multiply-only tint cannot turn
    // saturated terracotta into frosted tile (winter roofs stayed ORANGE in
    // a deep-snow scene, critique); mixing toward luminance then lifting can
    if (desat > 0) {
      const lum = r * 0.299 + g * 0.587 + b * 0.114;
      r += (lum - r) * desat; g += (lum - g) * desat; b += (lum - b) * desat;
    }
    if (lift > 0) { r += lift * 255; g += lift * 255; b += lift * 255; }
    d[i] = Math.min(255, r);
    d[i + 1] = Math.min(255, g);
    d[i + 2] = Math.min(255, b);
    d[i + 3] = roughInAlpha
      ? Math.max(8, Math.min(255, (rgd ? rgd[i] : 230) * roughMul))
      : 255;
  }
  ctx.putImageData(px, 0, 0);
  return c;
}

function normalCanvas(img) {
  const s = Math.min(img.width, texSize(1024)); // MOBILE r1: tier-scaled compose
  const c = document.createElement('canvas');
  c.width = c.height = s;
  c.getContext('2d').drawImage(img, 0, 0, s, s);
  return c;
}

/** Swap a CanvasTexture's backing image in place (bindings stay valid). */
function swapTexture(tex, canvas) {
  // dispose FIRST (r3): once the texture has rendered a frame, the GL side
  // holds immutable storage at the procedural canvas size (512) — assigning
  // the 1024 sourced compose without disposing makes the sub-image upload
  // overflow (GL_INVALID_VALUE: glCopySubTextureCHROMIUM) and the swap
  // silently no-ops. This is why every map entered AFTER first render kept
  // procedural layers (desert's maroon rockTone walls) while the startup map
  // won the race and showed the sourced sets. dispose() re-allocates at the
  // new size on next use; material uniform bindings keep the same object.
  tex.dispose();
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
  const size = Math.min(color.width, texSize(1024));
  const key = compositeKey(setKey, opts);
  let composite = _compositeCache.get(key);
  if (!composite || composite.size !== size) {
    composite = { size, canvas: composeAlbedo(color, ao, rough, opts) };
  }
  touchLru(_compositeCache, key, composite, COMPOSITE_CACHE_MAX);
  swapTexture(layer.albedo, composite.canvas);

  let normalEntry = _normalCache.get(setKey);
  if (!normalEntry || normalEntry.size !== size) {
    normalEntry = { size, canvas: normalCanvas(normal) };
  }
  touchLru(_normalCache, setKey, normalEntry, NORMAL_CACHE_MAX);
  swapTexture(layer.normal, normalEntry.canvas);
}

/**
 * Terrain hookup — called by createSplatMaterial after the procedural layers
 * exist. Swaps each layer's textures in place when loaded and exposes one
 * settlement promise so presentation snapshots cannot race the async swap.
 * @param {string} mapId map id ('verdant'|'desert'|'winter'|'urban')
 * @param {object} layers { G, D, R, M } of { albedo, normal } CanvasTextures
 * @param {object} S splat cfg (uses mudRough for the M roughness multiplier)
 * @returns {Promise<void[]>} resolves after every requested layer settled
 */
export function applySourcedTerrain(mapId, layers, S = {}) {
  const plan = TERRAIN_PLAN[mapId] || TERRAIN_PLAN.verdant;
  const jobs = [];
  for (const key of ['G', 'D', 'R', 'M']) {
    if (!plan[key] || !layers[key]) continue;
    const entry = typeof plan[key] === 'string' ? { set: plan[key] } : plan[key];
    const roughMul = (key === 'M' ? (S.mudRough ?? 1) : 1) * (entry.roughMul ?? 1);
    jobs.push(applySet(entry.set, layers[key], {
      roughInAlpha: true, roughMul, tint: entry.tint || null,
    }).catch((e) => console.warn(`[sourcedTextures] terrain ${mapId}/${key}:`, e.message)));
  }
  return Promise.all(jobs);
}

/**
 * Village building hookup — called by props.js after the procedural building
 * textures exist. Same in-place swap contract as the terrain path.
 * @param {object} sets { plaster?, roof?, wood?, stone? } of { albedo, normal }
 * @param {string} mapId map id (urban swaps the stone bucket to brick)
 */
// Per-map albedo tints for the sourced building sets (multiplies RGB after
// AO) — the raw CC0 sets ignore cfg.props.tones, so urban kept terracotta
// roofs and desert adobe stayed white without these.
const BUILDING_TINTS = {
  urban:  { roof: [0.52, 0.55, 0.62], plaster: [0.88, 0.86, 0.82] }, // slate / sooty render
  desert: { plaster: [1.08, 0.92, 0.70], wood: [1.05, 0.95, 0.80] }, // sand-plaster adobe
  // r5 terrain_environment: winter roofs were still SATURATED ORANGE under a
  // deep-snow sky (critique) — the multiply tint cannot desaturate terracotta.
  // Cooled + 62% desaturated + lifted frost; the props.js up-face snow-cap
  // shader lays the actual white load on the slopes.
  winter: { roof: { tint: [0.96, 1.02, 1.14], desat: 0.62, lift: 0.10 } },
  // maps r1 (ADDITIVE):
  coastal: { plaster: [1.04, 1.02, 0.96], wood: { tint: [0.82, 0.83, 0.84], desat: 0.30 } }, // whitewash + salt-silvered timber
  autumn:  { plaster: [1.02, 0.97, 0.88], wood: [0.94, 0.86, 0.74] },   // warm farm render + aged oak
  steppe:  { plaster: [1.06, 1.0, 0.86], wood: [1.0, 0.92, 0.78] },     // sun-baked khutor lime wash
  railyard: {
    plaster: { tint: [0.84, 0.83, 0.80], desat: 0.25 },                 // soot-dulled render
    // r3: both lifted — under the overcast fill the first-cut tints rendered
    // the halls as near-black chocolate slabs
    roof: { tint: [0.88, 0.90, 0.94], desat: 0.60, lift: 0.05 },        // weathered sheet grey
    wood: { tint: [0.78, 0.76, 0.72], desat: 0.20 },
    stone: { tint: [1.10, 0.98, 0.88], desat: 0.10 },                   // smoke-stained brick
  },
  frontier: { plaster: [1.0, 0.96, 0.86], wood: [0.92, 0.84, 0.70] },
  fjord: {
    plaster: [1.03, 1.04, 1.02],
    roof: { tint: [0.77, 0.84, 0.91], desat: 0.48, lift: 0.02 },
    wood: { tint: [0.72, 0.76, 0.78], desat: 0.38 },
  },
  delta: { plaster: [1.04, 0.96, 0.78], wood: [0.80, 0.70, 0.53] },
  badlands: { plaster: [1.08, 0.79, 0.58], wood: [0.83, 0.69, 0.52] },
  monsoon: { plaster: [0.78, 0.81, 0.72], wood: [0.67, 0.66, 0.54] },
  alpine: { roof: { tint: [0.94, 1.01, 1.14], desat: 0.68, lift: 0.11 } },
  caldera: {
    plaster: { tint: [0.62, 0.59, 0.55], desat: 0.45 },
    roof: { tint: [0.57, 0.57, 0.58], desat: 0.78 },
    wood: [0.58, 0.54, 0.48], stone: [0.67, 0.61, 0.55],
  },
  foundry: {
    plaster: { tint: [0.75, 0.74, 0.71], desat: 0.32 },
    roof: { tint: [0.67, 0.70, 0.74], desat: 0.75, lift: 0.025 },
    wood: { tint: [0.65, 0.63, 0.59], desat: 0.28 },
    stone: { tint: [0.94, 0.76, 0.62], desat: 0.18 },
  },
};

export function applySourcedBuildings(sets, mapId) {
  const plan = { plaster: 'plaster', roof: 'roof', wood: 'wood' };
  // maps r1: the rail yard's industrial halls are brick like the town's
  if ((mapId === 'urban' || mapId === 'railyard' || mapId === 'foundry' || mapId === 'caldera')
      && sets.stone) plan.stone = 'brick';
  // urban keeps the PROCEDURAL roof sheet: its tone hook bakes a slate/clay
  // patchwork (cfg.props.tones.roof) that the single-tint sourced set cannot
  // reproduce — the uniform maroon roofscape was a top critic complaint
  if (mapId === 'urban') delete plan.roof;
  const jobs = [];
  for (const [bucket, setKey] of Object.entries(plan)) {
    if (!sets[bucket]) continue;
    const tw = (BUILDING_TINTS[mapId] || {})[bucket] || null;
    const opts = tw && !Array.isArray(tw) ? tw : { tint: tw };
    jobs.push(applySet(setKey, sets[bucket], { roughInAlpha: false, ...opts })
      .catch((e) => console.warn(`[sourcedTextures] building ${bucket}:`, e.message)));
  }
  return Promise.all(jobs);
}
