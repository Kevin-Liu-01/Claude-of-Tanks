// src/world/horizonVista.ts — the vista pass of the horizon ring (owner 2026-09-19: "the stuff around the map
// like mountains needs to be so much better … consider this a triple AAA pass").
//
// Three things live here, all desktop-tier only (mobile keeps the ring's older per-vertex bake):
//  1. VISTA TILES — five small tileable colour tiles (meadow, canopy, rock, scree, snow) authored once per page and
//     shared by every map; the ring samples them triplanar in world space, so no face ever stretches a texture.
//  2. HORIZON_VISTA_FRAGMENT — the ring's map_fragment replacement: a layered material (meadow → forest stands →
//     scree → rock with strata → snow) chosen per fragment from slope, altitude and three world-anchored noise
//     fields, shaded with a screen-derivative bump normal against the map sun and a hemispherical sky term, then
//     hazed per fragment toward the fog tint by ring radius. Tints are ratios to the map's base tone, so each map
//     keeps its authored palette.
//  3. buildHorizonForest — real conifers and broadleaves scattered on the near ring faces where the painted stands
//     are dense (one InstancedMesh per species and distance class, lit by the scene sun, the same far-LOD palettes
//     and silhouettes as vegetation.ts), so the battlefield's rim forest continues over the edge and into the first
//     ranges instead of stopping at a flat green wall.
import * as THREE from 'three';
import { applyCanopyDiffuseWrap } from './canopyLighting.ts'; // round 55: a leaf import — vegetation.ts must not join the horizon chain (tidalMangrove hook)
import { HORIZON_CLOUD_SHADE_FRAGMENT, HORIZON_CLOUD_SHADE_UNIFORM_DECLARATIONS } from './horizonCloudShade.ts'; // round 72: the layer's cloud shadows on the ranges

// ---------------------------------------------------------------------------
// tiles
// ---------------------------------------------------------------------------
const VISTA_TILE_SIZE = 512;

interface VistaTiles {
  /** Round 55: twice the canopy tile's mean colour — the divisor that centres its mottle at 1 (the ring forest's
   * crown hook used the raw tile, whose mean is 0.35 / 0.39 / 0.30, so every crown was darkened 12-17 % and pushed
   * toward yellow; the other tiles are authored at mean 0.5). */
  canopyMean: THREE.Vector3;
  meadow: THREE.CanvasTexture;
  /** Round 29 (2026-09-20): dune sand / alluvium for the arid maps — bound as the ground tile instead of the meadow. */
  sand: THREE.CanvasTexture;
  canopy: THREE.CanvasTexture;
  rock: THREE.CanvasTexture;
  scree: THREE.CanvasTexture;
  snow: THREE.CanvasTexture;
}

/** Which tile the vista's ground layer samples; every other layer is chosen per fragment. */
export type VistaGround = 'meadow' | 'sand';

type TileRng = () => number;

function tileRng(seed: number): TileRng {
  let a = seed | 0;
  return () => {
    a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (t: number): number => t * t * (3 - 2 * t);

/** Wrapped-lattice value noise in tile units (0..1 wraps), several octaves; returns roughly -0.5..0.5. */
function makeLatticeNoise(rng: TileRng, octaves: ReadonlyArray<readonly [number, number]>): (u: number, v: number) => number {
  const lattices = octaves.map(([cells]) => {
    const g = new Float32Array(cells * cells);
    for (let i = 0; i < g.length; i++) g[i] = rng();
    return g;
  });
  return (u, v) => {
    let value = 0;
    for (let o = 0; o < octaves.length; o++) {
      const cells = octaves[o][0], amp = octaves[o][1], g = lattices[o];
      const fx = ((u % 1) + 1) % 1 * cells, fy = ((v % 1) + 1) % 1 * cells;
      const x0 = Math.floor(fx) % cells, y0 = Math.floor(fy) % cells;
      const x1 = (x0 + 1) % cells, y1 = (y0 + 1) % cells;
      const tx = smooth(fx - Math.floor(fx)), ty = smooth(fy - Math.floor(fy));
      const a = g[y0 * cells + x0], b = g[y0 * cells + x1];
      const e = g[y1 * cells + x0], f = g[y1 * cells + x1];
      const top = a + (b - a) * tx, bottom = e + (f - e) * tx;
      value += (top + (bottom - top) * ty - 0.5) * amp;
    }
    return value;
  };
}

interface TilePixels { data: Float32Array; size: number }

function newTile(size: number, fill: number): TilePixels {
  const data = new Float32Array(size * size * 3);
  data.fill(fill);
  return { data, size };
}

/** Stamp a shaded disc with wrap-around (crowns, stones). `light` shifts the centre toward the sun side. */
function stampDisc(
  tile: TilePixels, cx: number, cy: number, radius: number,
  rgb: readonly [number, number, number], rim: number, light: number, softness = 0.35,
): void {
  const { data, size } = tile;
  const r = radius * size;
  const x0 = Math.floor(cx * size - r - 1), x1 = Math.ceil(cx * size + r + 1);
  const y0 = Math.floor(cy * size - r - 1), y1 = Math.ceil(cy * size + r + 1);
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = (x + 0.5) - cx * size, dy = (y + 0.5) - cy * size;
      const d = Math.hypot(dx, dy) / r;
      if (d > 1) continue;
      const cover = smooth(clamp01((1 - d) / softness));
      // lit from the upper left of the tile: darker rim toward the lower right
      const shade = 1 - rim * smooth(clamp01((d - 0.35) / 0.65)) + light * (-dx * 0.7 - dy * 0.7) / r * 0.5;
      const px = ((y % size + size) % size) * size + ((x % size + size) % size);
      for (let c = 0; c < 3; c++) {
        const value = rgb[c] * shade;
        data[px * 3 + c] += (value - data[px * 3 + c]) * cover;
      }
    }
  }
}

function tileToTexture(tile: TilePixels): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = tile.size; canvas.height = tile.size;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('vista tile canvas requires a 2D context');
  const image = ctx.createImageData(tile.size, tile.size);
  for (let i = 0, n = tile.size * tile.size; i < n; i++) {
    image.data[i * 4] = clamp01(tile.data[i * 3]) * 255;
    image.data[i * 4 + 1] = clamp01(tile.data[i * 3 + 1]) * 255;
    image.data[i * 4 + 2] = clamp01(tile.data[i * 3 + 2]) * 255;
    image.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 4;
  texture.generateMipmaps = true;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  return texture;
}

/** Meadow / scrub: broad warm-cool patches, fine tuft speckle, a few bald spots. Mean 0.5. */
function makeMeadowTile(size: number): TilePixels {
  const rng = tileRng(0x51ea);
  const tile = newTile(size, 0.5);
  const patches = makeLatticeNoise(rng, [[3, 0.9], [7, 0.5], [17, 0.3]]);
  const tufts = makeLatticeNoise(rng, [[41, 0.6], [97, 0.5]]);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const patch = patches(u, v), tuft = tufts(u, v);
      const l = 0.5 + patch * 0.10 + tuft * 0.09;
      const warm = smooth(clamp01(patch * 2.2 + 0.5));      // warm patches read as dried grass
      const i = (y * size + x) * 3;
      tile.data[i] = l * (1 + warm * 0.10);
      tile.data[i + 1] = l * (1 + warm * 0.04);
      tile.data[i + 2] = l * (1 - warm * 0.12);
    }
  }
  for (let k = 0; k < 90; k++) {
    // bald ground between the tufts
    stampDisc(tile, rng(), rng(), 0.012 + rng() * 0.02, [0.44, 0.41, 0.36], 0.1, 0.0, 0.6);
  }
  return tile;
}

/**
 * Round 29 (2026-09-20, owner: "see where the texture just stops on maps like Redrock Divide"): sand / alluvium for
 * the arid rings. Broad dune undulation, wind ripples running one way, sparse pebbles and a warm-cool drift, so a
 * desert plain past the rim reads as sand instead of the meadow tile's dried-grass patches. Mean about 0.5.
 */
function makeSandTile(size: number): TilePixels {
  const rng = tileRng(0x5a4d);
  const tile = newTile(size, 0.5);
  const dunes = makeLatticeNoise(rng, [[2, 0.9], [5, 0.6], [13, 0.35]]);
  const warp = makeLatticeNoise(rng, [[4, 1.0], [9, 0.5]]);
  const grain = makeLatticeNoise(rng, [[61, 0.6], [140, 0.5]]);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const dune = dunes(u, v);
      const w = warp(u, v) * 0.18;
      // wind ripples: one direction, warped so no two crests stay parallel for long
      const ripple = Math.sin((v + w + u * 0.35) * Math.PI * 2 * 22) * 0.5;
      const rippleShade = smooth(clamp01(ripple + 0.5));
      const l = 0.5 + dune * 0.11 + (rippleShade - 0.5) * 0.05 + grain(u, v) * 0.05;
      const warm = smooth(clamp01(dune * 1.8 + 0.5));           // dune backs read warmer than the troughs
      const i = (y * size + x) * 3;
      tile.data[i] = l * (1 + warm * 0.09);
      tile.data[i + 1] = l * (1 + warm * 0.02);
      tile.data[i + 2] = l * (1 - warm * 0.13);
    }
  }
  for (let k = 0; k < 420; k++) {
    // pebbles and dark desert-varnished stones, sparse
    const dark = rng() < 0.6; const l = dark ? 0.30 + rng() * 0.12 : 0.58 + rng() * 0.16;
    stampDisc(tile, rng(), rng(), 0.003 + rng() * 0.007, [l * 1.02, l, l * 0.94], 0.5, 0.5, 0.5);
  }
  return tile;
}

/** Canopy from above: layered crown discs lit from the upper left over dark bluish gaps. Mean about 0.5. */
function makeCanopyTile(size: number): TilePixels {
  const rng = tileRng(0xca0e);
  const tile = newTile(size, 0.30);
  const gaps = makeLatticeNoise(rng, [[6, 0.6], [23, 0.4]]);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 3;
      const g = 0.28 + gaps(x / size, y / size) * 0.10;
      tile.data[i] = g * 0.86; tile.data[i + 1] = g; tile.data[i + 2] = g * 0.92;
    }
  }
  // big crowns, then medium, then small: later stamps sit "above" earlier ones
  for (const [count, r0, r1, l0] of [[70, 0.045, 0.075, 0.50], [160, 0.026, 0.046, 0.56], [260, 0.014, 0.026, 0.62]] as const) {
    for (let k = 0; k < count; k++) {
      const l = l0 + (rng() - 0.5) * 0.16;
      const hue = (rng() - 0.5) * 0.10;
      stampDisc(tile, rng(), rng(), r0 + rng() * (r1 - r0),
        [l * (0.90 + hue), l * 1.02, l * (0.72 - hue * 0.5)], 0.62, 0.55, 0.42);
    }
  }
  return tile;
}

/** Rock: sub-horizontal beds warped by noise, joint cracks, granular speckle. Mean about 0.5. */
function makeRockTile(size: number): TilePixels {
  const rng = tileRng(0x70c4);
  const tile = newTile(size, 0.5);
  const warp = makeLatticeNoise(rng, [[4, 0.9], [11, 0.5]]);
  const grain = makeLatticeNoise(rng, [[53, 0.7], [131, 0.6]]);
  const joints = makeLatticeNoise(rng, [[9, 1.0], [27, 0.5]]);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const w = warp(u, v) * 0.35;
      const bed = Math.sin((v + w) * Math.PI * 2 * 9) * 0.5 + Math.sin((v + w * 0.6) * Math.PI * 2 * 23 + 1.7) * 0.5;
      const bedLight = 1 + bed * 0.09;
      const joint = 1 - Math.abs(joints(u, v) * 2);
      const crack = smooth(clamp01((joint - 0.86) / 0.14));
      const l = 0.52 * bedLight * (1 + grain(u, v) * 0.16) * (1 - crack * 0.42);
      const warm = smooth(clamp01(bed * 0.8 + 0.5));
      const i = (y * size + x) * 3;
      tile.data[i] = l * (1 + warm * 0.06);
      tile.data[i + 1] = l * (1 + warm * 0.01);
      tile.data[i + 2] = l * (1 - warm * 0.07);
    }
  }
  return tile;
}

/** Scree / talus: dense small stones with shadowed lower edges over a darker fines bed. Mean about 0.5. */
function makeScreeTile(size: number): TilePixels {
  const rng = tileRng(0x5c3e);
  const tile = newTile(size, 0.42);
  const fines = makeLatticeNoise(rng, [[9, 0.5], [37, 0.4]]);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 3;
      const l = 0.42 + fines(x / size, y / size) * 0.08;
      tile.data[i] = l * 1.02; tile.data[i + 1] = l; tile.data[i + 2] = l * 0.96;
    }
  }
  for (let k = 0; k < 2200; k++) {
    const l = 0.40 + rng() * 0.34;
    stampDisc(tile, rng(), rng(), 0.006 + rng() * 0.016, [l * 1.02, l, l * 0.95], 0.55, 0.6, 0.5);
  }
  return tile;
}

/** Snow: very low contrast drifts, faint sastrugi, cool shadows. Mean about 0.5. */
function makeSnowTile(size: number): TilePixels {
  const rng = tileRng(0x5e01);
  const tile = newTile(size, 0.5);
  const drifts = makeLatticeNoise(rng, [[3, 0.8], [8, 0.5], [21, 0.35]]);
  const warp = makeLatticeNoise(rng, [[5, 1.0]]);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size, v = y / size;
      const drift = drifts(u, v);
      const sastrugi = Math.sin((u + warp(u, v) * 0.12) * Math.PI * 2 * 14 + v * 4.0) * 0.5;
      const l = 0.5 + drift * 0.07 + sastrugi * 0.03;
      const shade = smooth(clamp01(-drift * 3 + 0.5));
      const i = (y * size + x) * 3;
      tile.data[i] = l * (1 - shade * 0.03);
      tile.data[i + 1] = l * (1 - shade * 0.015);
      tile.data[i + 2] = l * (1 + shade * 0.03);
    }
  }
  return tile;
}

let sharedTiles: { meadow: TilePixels; sand: TilePixels; canopy: TilePixels; rock: TilePixels; scree: TilePixels; snow: TilePixels } | null = null;
/** Round 55: twice the mean of a tile's channels (the `tile * 2.0` modulation's centre). */
function tileMean2(tile: TilePixels): THREE.Vector3 {
  const sum = [0, 0, 0];
  const n = tile.size * tile.size;
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) sum[c] += clamp01(tile.data[i * 3 + c]);
  return new THREE.Vector3(2 * sum[0] / n, 2 * sum[1] / n, 2 * sum[2] / n);
}

/** Tile pixels are authored once per page (about 60 ms); each ring owns its own GPU textures over them. */
export function createVistaTiles(size = VISTA_TILE_SIZE): VistaTiles {
  if (!sharedTiles || sharedTiles.meadow.size !== size) {
    sharedTiles = {
      meadow: makeMeadowTile(size), sand: makeSandTile(size), canopy: makeCanopyTile(size), rock: makeRockTile(size),
      scree: makeScreeTile(size), snow: makeSnowTile(size),
    };
  }
  return {
    canopyMean: tileMean2(sharedTiles.canopy),
    meadow: tileToTexture(sharedTiles.meadow), sand: tileToTexture(sharedTiles.sand), canopy: tileToTexture(sharedTiles.canopy),
    rock: tileToTexture(sharedTiles.rock), scree: tileToTexture(sharedTiles.scree), snow: tileToTexture(sharedTiles.snow),
  };
}

// ---------------------------------------------------------------------------
// fragment program
// ---------------------------------------------------------------------------
export const HORIZON_VISTA_UNIFORM_DECLARATIONS = /* glsl */`
uniform sampler2D uVMeadow; uniform sampler2D uVCanopy; uniform sampler2D uVRock; uniform sampler2D uVScree; uniform sampler2D uVSnow;
uniform vec3 uVMeadowTint; uniform vec3 uVRockTint; uniform vec3 uVScreeTint;
uniform vec3 uVForestColor; uniform vec3 uVSnowColor;
uniform float uVRockAmp; uniform float uVPeakRock; uniform float uVScreeAmp; uniform float uVForestAmp; uniform float uVBump;
uniform float uVHaze; uniform vec3 uVFogTint; uniform float uVBanding; uniform float uVAmbient; uniform float uVSunGain;
uniform float uVDayDiffuse;
uniform vec2 uVRockSlope;
uniform float uVBareRock; // round 49: bare upper slopes above the treeline (heath, outcrop ribs, scree)
uniform float uVOutcrop;  // round 55: gneiss knobs and scree through the turf on the steeper faces below the treeline
// round 72: the baked surface atlas (angle x radius: fine gradient, occlusion, sun visibility), its radius window
// (r0, 1 / span) and gradient scale, the sky's chroma for the shaded faces and the snow glint amplitude
uniform sampler2D uVRelief; uniform vec2 uVReliefR; uniform float uVReliefGrad; uniform float uVReliefAmp;
uniform float uVAoStrength; uniform float uVShadow; uniform vec3 uVSkyTint; uniform float uVSparkle;
uniform float uVDebug; // QA: 1 the relief gradient, 2 the occlusion, 3 the sun visibility, 4 the relieved normal's y, 5 the cloud shade, 6 the material weights
${HORIZON_CLOUD_SHADE_UNIFORM_DECLARATIONS}`;

/**
 * Replaces `#include <map_fragment>` on the vista ring. Requires the ring's varyings (vHNrm, vHPos, vHDist), the
 * uniforms above plus uDetail2 / uTreeline / uSnowline / uMaxH / uSunDirW / uForestTint / uSnowTint from the
 * existing material, and leaves `horizonMarine`, `horizonWaterVariation` and `vistaHaze` for the colour stage.
 */
export const HORIZON_VISTA_FRAGMENT = /* glsl */`#include <map_fragment>
float horizonMarine = clamp(-vMapUv.y, 0.0, 1.0);
float horizonWaterVariation = 0.0;
float vistaHaze = 0.0;
float horizonDim = 1.0; // live material colour / authored day colour (night runtime dims to 0.20)
{
  vec3 n0 = normalize(vHNrm);
  vec3 P = vHPos;
  float radius = length(P.xz);
  float hT = clamp(P.y / max(uMaxH, 1.0), 0.0, 1.0);
  float detailW = 1.0 - smoothstep(500.0, 1500.0, vHDist);
  float fineW = 1.0 - smoothstep(120.0, 700.0, vHDist);
  // Round 35: the broad relief (ledges, gullies) keeps shading the ranges to the far cascades; only the metre-scale
  // grain fades with fineW
  float macroFade = 1.0 - smoothstep(300.0, 1600.0, vHDist);
  // Round 32 (owner 2026-09-21, "quality loss beyond the map borders"): a flat floor seen at grazing range (Redrock's
  // outland, the sand pans) resolves the 12 m fields, the 12 m ground tile and the screen-derivative bump into a
  // regular moiré carpet the battlefield never shows. A flat far floor keeps only the broad fields and its tone.
  float floorW = smoothstep(0.90, 0.98, n0.y) * smoothstep(120.0, 420.0, vHDist);
  // Round 72 (owner 2026-09-25, "the mountains look so flat and untextured"): the surface atlas baked over the
  // finished ring (horizonRelief.ts) — read by the ring's own u (the angle, ten repeats across the seam column)
  // and the fragment's radius. Its gradient is the fine relief the mesh cannot carry, added to the geometric slope
  // in the height-field frame (both are world-xz gradients, so the sum is exact); its occlusion darkens the
  // valleys and the foot of the crests; its sun visibility lays the ridges' shadows over the ranges behind them.
  vec4 relief = vec4(0.5, 0.5, 1.0, 1.0);
  if (uVReliefAmp > 0.001) relief = texture2D(uVRelief, vec2(vMapUv.x * 0.1, (radius - uVReliefR.x) * uVReliefR.y));
  float reliefLand = (1.0 - floorW) * (1.0 - horizonMarine) * uVReliefAmp;
  vec2 gd = (relief.xy * 2.0 - 1.0) * uVReliefGrad * reliefLand;
  vec2 g0 = -n0.xz / max(n0.y, 0.05);
  vec3 nR = normalize(vec3(-(g0.x + gd.x), 1.0, -(g0.z + gd.z)));
  float ao = 1.0 - (1.0 - relief.z) * uVAoStrength * reliefLand;
  float sunVis = 1.0 - (1.0 - relief.w) * uVShadow * reliefLand;
  // round 72: the volumetric layer's cloud shadow on the sun term (horizonCloudShade.ts; 1 when the layer is off)
${HORIZON_CLOUD_SHADE_FRAGMENT}
  sunVis *= cloudLit;
  vec3 aw = abs(n0);
  aw /= (aw.x + aw.y + aw.z);
  #define VTRI(tex, s, o) (texture2D(tex, P.xz * (s) + (o)) * aw.y \
    + texture2D(tex, P.zy * (s) + (o) + vec2(0.37, 0.11)) * aw.x \
    + texture2D(tex, P.xy * (s) + (o) + vec2(0.71, 0.53)) * aw.z)
  // world-anchored noise fields: stands (600 m), patches (140 m), knobs (45 m), grain (12 m)
  float nB = VTRI(uDetail2, 0.0016, vec2(0.0)).r - 0.5;
  float nC = VTRI(uDetail2, 0.0071, vec2(0.29, 0.53)).r - 0.5;
  float nD = (VTRI(uDetail2, 0.0230, vec2(0.71, 0.19)).r - 0.5) * (1.0 - floorW);
  float nE = (VTRI(uDetail2, 0.0850, vec2(0.11, 0.83)).r - 0.5) * (1.0 - floorW);
  // round 72: the material reads the slope of the relieved surface, so rock breaks through on the fine faces too
  float slope = 1.0 - clamp(mix(n0.y, nR.y, 0.75), 0.0, 1.0);
  // Round 29: a wall is a genuinely steep face — iron staining, desert varnish and gullies belong to walls.
  float wall = smoothstep(0.30, 0.62, slope + nD * 0.06);
  // Round 35 (owner 2026-09-21, "the sides of mountains … look so so bare"): a moderate rock slope is a ledge slope —
  // beds and their relief run across it too (at half weight), never across gentle sand or grass (round 29's lesson).
  float ledgeSlope = smoothstep(0.16, 0.40, slope + nD * 0.05);
  // --- material weights ------------------------------------------------------
  float rockW = smoothstep(uVRockSlope.x, uVRockSlope.y, slope + nC * 0.26 + nD * 0.18 + nE * 0.08) * uVRockAmp;
  // Round 49 (owner audit 2026-09-23, Fjord "smooth green cone hill on the rim with a darker cap", Whiteout's white
  // ring): the alpine massifs are softened domes under 15 degrees, so nothing slope-keyed above ever fires on them -
  // meadow tint below the treeline and one darker altitude-banded cap above 60 % height. A ring that authors bareRock
  // exposes its upper slopes the way a fjord or polar range does: above the treeline the turf greys to heath, outcrop
  // ribs stand on the steeper local faces with scree fans below them, and the summit rock breaks into ribs instead of
  // one cap. The palette is untouched - only where its own rock, scree and snow appear changes.
  float bareUp = uVBareRock * smoothstep(uTreeline * 0.80, uTreeline * 1.12 + 0.04, hT + nD * 0.06 + nC * 0.04);
  float rib = smoothstep(0.38, 0.62, 0.5 + nC * 0.55 + nD * 1.0 + nE * 0.45);
  float ribSlope = smoothstep(0.05, 0.24, slope + nD * 0.08);
  // wind-scoured crests: the upper third of the tallest ranges is mostly bare rock with snow only between the ribs
  float crestRock = bareUp * smoothstep(0.55, 0.85, hT + nC * 0.10) * (0.55 + 0.45 * rib);
  float bareRockW = max(bareUp * rib * (0.55 + 0.45 * ribSlope), crestRock);
  rockW = max(rockW, bareRockW);
  rockW = max(rockW, smoothstep(0.60, 0.92, hT + nC * 0.12 + nD * 0.06) * uVPeakRock * mix(1.0, 0.25 + 0.75 * rib, uVBareRock));
  // Round 55 (2026-09-24, round 49's open item: Fjord's "smooth green cone hill" sits at hT 0.3-0.5, below the
  // treeline that gates the ribs above). A ring that authors outcrops carries gneiss knobs and slabs THROUGH the turf
  // on its steeper faces below the treeline - the 25-45 degree ridge fronts of the softened domes (the ring dump's
  // row p90 slopes), where the vista's own rock law only starts past 45 degrees - inside a halo of scree. The same
  // fields as the ribs (no new fetch); a ring that authors none is byte-identical.
  float outcropSlope = uVOutcrop * smoothstep(0.015, 0.13, slope + nD * 0.10 + nE * 0.05) * (1.0 - bareUp);
  float knobField = 0.5 + nC * 0.85 + nD * 0.75 + nE * 0.35; // slab fields of 60-140 m, broken by the knobs
  float knobW = outcropSlope * smoothstep(0.42, 0.64, knobField) * (0.6 + 0.4 * smoothstep(0.06, 0.30, slope));
  rockW = max(rockW, knobW);
  float snowW = 0.0;
  if (uSnowline < 1.5) {
    snowW = smoothstep(uSnowline - 0.03, uSnowline + 0.15, hT + nD * 0.07 + nC * 0.05)
      * (1.0 - smoothstep(0.42, 0.82, slope + nE * 0.10));
    snowW = max(snowW, smoothstep(0.80, 0.97, hT) * (1.0 - smoothstep(0.55, 0.90, slope)) * step(uSnowline, 1.5));
    snowW *= 1.0 - bareRockW * 0.9; // round 49: the scoured ribs and crests stay bare
  }
  float screeW = smoothstep(0.16, 0.40, slope + nD * 0.22 + nE * 0.10) * (1.0 - rockW) * uVScreeAmp
    * (0.55 + 0.45 * smoothstep(0.15, 0.55, hT));
  screeW = max(screeW, bareUp * (1.0 - rockW) * smoothstep(0.03, 0.16, slope + nD * 0.06) * 0.7); // round 49: fans below the ribs
  screeW = max(screeW, outcropSlope * (1.0 - rockW) * smoothstep(0.26, 0.50, knobField) * 0.7); // round 55: the scree halo around the knobs
  // Round 35: talus — the debris apron at the foot of a wall: moderate slope, low on the face, thinning upward
  float talusW = smoothstep(0.10, 0.30, slope + nD * 0.08) * (1.0 - wall) * smoothstep(0.50, 0.12, hT + nC * 0.15)
    * uVScreeAmp * (1.0 - floorW);
  float treeF = 1.0 - smoothstep(uTreeline * 0.82, uTreeline * 1.04, hT + nD * 0.05);
  float standF = smoothstep(0.08 + hT * 0.40, 0.30 + hT * 0.40, 0.5 + nB * 1.1 + nC * 0.7 + nD * 0.25);
  float forestW = standF * treeF * (1.0 - smoothstep(0.50, 0.82, slope + nE * 0.06)) * uVForestAmp;
  forestW *= 1.0 - snowW;
  forestW *= 1.0 - knobW * 0.85; // round 55: trees do not grow on the slabs — the stands open around the knobs
  // --- rock structure: faulted beds, shelves and seams, gullies ------------------
  // beds follow world height with a broad fault offset (600 m field) and a lateral warp (140 m field) so no two
  // stretches of wall carry the same parallel bands; a second thin-bed term breaks each bed into laminae
  float bedPhase = P.y * 0.42 + nB * 9.0 + nC * 2.4;
  float bed = sin(bedPhase) * 0.6 + sin(P.y * 0.13 + nC * 5.0) * 0.4;
  float lamina = sin(P.y * 1.9 + nD * 3.0 + nE * 1.2);
  float bedW = uVBanding * max(wall, 0.5 * ledgeSlope * rockW);
  float shelf = smoothstep(0.30, 0.80, bed);                       // the lit top of a bed
  float seam = smoothstep(0.45, 0.85, -bed) * bedW * 1.6;          // the recessed seam under it
  float gully = smoothstep(0.55, 0.90, 0.5 - nC * 1.2 - nD * 0.6) * wall;
  float varnish = smoothstep(0.55, 0.85, nC + 0.5) * wall;         // dark desert varnish streaks
  // --- material colours: tint (ratio to the map base) x tile modulation ---------
  vec3 meadowMod = mix(vec3(1.0), VTRI(uVMeadow, 0.083, vec2(0.0)).rgb * 2.0, (0.35 + 0.65 * detailW) * (1.0 - floorW * 0.85));
  vec3 col = uVMeadowTint * meadowMod;
  col = mix(col, mix(col, uVScreeTint * 0.72, 0.5), bareUp * 0.6); // round 49: heath above the treeline
  if (uVForestAmp > 0.001) {
    vec3 canopyMod = VTRI(uVCanopy, 0.042, vec2(0.13, 0.57)).rgb * 2.0;
    canopyMod = mix(vec3(1.0), canopyMod, 0.45 + 0.55 * detailW);
    vec3 forestCol = uVForestColor * canopyMod * (0.92 + nD * 0.24);
    col = mix(col, forestCol, forestW);
  }
  if (uVScreeAmp > 0.001) {
    vec3 screeMod = mix(vec3(1.0), VTRI(uVScree, 0.10, vec2(0.41, 0.09)).rgb * 2.0, 0.4 + 0.6 * detailW);
    col = mix(col, uVScreeTint * screeMod, screeW * (1.0 - forestW * 0.7));
    // talus apron: scree colour with boulder speckle — dark varnished blocks and pale fresh faces
    float speckDark = smoothstep(0.60, 0.72, nE + 0.5) * fineW;
    float speckPale = smoothstep(0.62, 0.74, 0.5 - nE) * fineW;
    vec3 talusCol = uVScreeTint * screeMod * (1.0 - speckDark * 0.30 + speckPale * 0.14) * (0.94 + nD * 0.18);
    col = mix(col, talusCol, talusW * (1.0 - forestW * 0.8) * (1.0 - rockW * 0.6));
  }
  if (uVRockAmp > 0.001 || uVPeakRock > 0.001) {
    // beds read along world height on the walls; the horizontal plane of the same fetch keeps caps granular
    vec3 rockMod = mix(vec3(1.0), VTRI(uVRock, 0.055, vec2(0.23, 0.77)).rgb * 2.0, 0.45 + 0.55 * detailW);
    vec3 rockCol = uVRockTint * rockMod * (1.0 + bed * bedW) * (1.0 - seam * 0.55);
    // laminae: fine light/dark banding within each bed on the walls
    rockCol *= 1.0 + lamina * 0.06 * bedW * fineW;
    // round 29: iron-stained beds alternate with the pale ones; round 35: the shelf tops bleach pale and the varnish
    // streaks darken and cool, so a face carries three tones instead of one
    rockCol = mix(rockCol, rockCol * vec3(1.10, 0.95, 0.84), smoothstep(0.15, 0.85, bed * 0.5 + 0.5) * wall * 0.55);
    rockCol = mix(rockCol, rockCol * vec3(1.14, 1.10, 1.02), shelf * bedW * 0.35);
    rockCol = mix(rockCol, rockCol * vec3(0.66, 0.68, 0.72), varnish * 0.45);
    rockCol *= 1.0 - gully * 0.30;
    // rolling and alpine rims: moss and turf creep onto the gentler ledges below the treeline
    float moss = smoothstep(0.10, 0.50, nD + 0.5) * (1.0 - wall) * smoothstep(0.62, 0.22, slope) * treeF * uVForestAmp;
    moss *= 1.0 - knobW * 0.8; // round 55: the knobs stay bare
    rockCol = mix(rockCol, uVMeadowTint * 0.85 * meadowMod, moss * 0.40);
    // round 55: lichen-pale slab crowns on the knobs (the 12 m grain picks the crowns), so a knob reads against turf
    rockCol *= 1.0 + knobW * (0.15 + 0.45 * smoothstep(0.45, 0.75, nE + 0.5));
    col = mix(col, rockCol, rockW);
  }
  if (snowW > 0.001) {
    vec3 snowMod = mix(vec3(1.0), VTRI(uVSnow, 0.031, vec2(0.61, 0.29)).rgb * 2.0, 0.5 + 0.5 * detailW);
    col = mix(col, uVSnowColor * snowMod, snowW * (1.0 - rockW * mix(0.45, 0.85, uVBareRock))); // round 49: scoured ribs stay bare
  }
  // Round 29: the near skirt used to blur into a 12 m-per-feature wall beside a battlefield textured at
  // centimetres (the vista replaced the round-22 near overlay). Two finer world fields and the ground tile at a
  // 2.4 m repeat fade in inside 380 m and are gone by the first ridge, so the texture no longer "just stops".
  float nearW = (1.0 - smoothstep(60.0, 380.0, vHDist)) * (1.0 - horizonMarine);
  float nF = 0.0, nG = 0.0;
  if (nearW > 0.002) {
    nF = VTRI(uDetail2, 0.27, vec2(0.57, 0.23)).r - 0.5;
    nG = VTRI(uDetail2, 0.85, vec2(0.19, 0.67)).r - 0.5;
    vec3 nearMod = VTRI(uVMeadow, 0.42, vec2(0.33, 0.81)).rgb * 2.0;
    col *= 1.0 + (nF * 0.22 + nG * 0.14) * nearW * (0.5 + 0.5 * rockW);
    col = mix(col, col * nearMod, nearW * 0.45 * (1.0 - rockW * 0.7) * (1.0 - snowW));
  }
  #undef VTRI
  // --- relief shading: screen-derivative bump from a layered height field, sun and sky ----
  // Round 35: the height field is the wall's own structure — bed shelves step out, seams and gullies cut in, knobs
  // and grain sit on top — and the broad terms keep shading the ranges past the fine-grain fade
  float hLedge = smoothstep(-0.25, 0.55, bed) * bedW;
  float hb = (hLedge * 0.9 - gully * 0.9 - seam * 0.5) * rockW * macroFade
    + ((nD * 0.55 + nE * 0.45) * (0.35 + 0.65 * rockW + 0.4 * forestW)
       + (nE * 0.6 + nD * 0.3) * talusW
       + (nF * 0.35 + nG * 0.25) * nearW * (0.4 + 0.6 * rockW)) * fineW;
  vec3 dpx = dFdx(P), dpy = dFdy(P);
  float dhx = dFdx(hb), dhy = dFdy(hb);
  vec3 r1 = cross(dpy, n0), r2 = cross(n0, dpx);
  float det = dot(dpx, r1);
  vec3 surfGrad = sign(det) * (dhx * r1 + dhy * r2);
  // round 72: the metre-scale bump rides on the relieved normal (the baked fine relief over the geometric slope)
  vec3 n = normalize(abs(det) * nR - surfGrad * uVBump * 22.0 * (1.0 - floorW));
  float ndl = dot(n, uSunDirW);
  float sunL = max(ndl, 0.0);
  float sky = 0.55 + 0.45 * clamp(n.y, 0.0, 1.0);
  // cavity: seams, gullies and the shaded side of talus blocks read darker than the open face
  float cavity = 1.0 - (gully * 0.35 + seam * 0.22) * rockW * macroFade - talusW * 0.10 * clamp(0.5 - nD, 0.0, 1.0) * fineW;
  // Round 72: a face turned from the sun takes the sky's own colour (uVSkyTint, the fog tint's chroma) instead of
  // a grey — blue-grey under a clear sky, warm grey under an overcast — the occlusion darkens the valleys and the
  // foot of the crests, and the baked sun visibility lays the ridges' shadows across the ranges behind them
  float turned = smoothstep(0.05, -0.35, ndl);
  vec3 skyLight = mix(vec3(1.0), uVSkyTint, 0.55 * turned + 0.25 * (1.0 - sky));
  vec3 lit = col * (uVAmbient * sky * ao * skyLight + uVSunGain * sunL * sunVis * (0.6 + 0.4 * ao)) * cavity;
  lit = mix(lit, lit * vec3(0.92, 0.95, 1.06), max(-ndl, 0.0) * 0.2);
  // canopy self-shadow: stands darken on their shaded side a little more than open ground
  lit *= 1.0 - forestW * 0.10 * (1.0 - sunL);
  // round 72: sun glitter on the snowfields at a grazing sun — a sparse world-anchored hash picks the facets (a
  // 3 m cell, one in sixty), the sun's mirror direction against the eye lights them, only where the detail fields
  // still resolve (detailW, gone by 1.5 km) and the sun reaches; a shimmer of pale points, never a speckle field
  if (uVSparkle > 0.001 && snowW > 0.05 && detailW > 0.01) {
    vec3 viewDir = normalize(cameraPosition - P);
    float glintH = fract(sin(dot(floor(P.xz * 0.33) + floor(P.y * 0.33), vec2(12.9898, 78.233))) * 43758.5453);
    float glint = step(0.984, glintH) * pow(max(dot(reflect(-uSunDirW, n), viewDir), 0.0), 32.0);
    lit += uVSnowColor * glint * snowW * uVSparkle * detailW * sunVis * 1.6;
  }
  // Round 29 (2026-09-20): the tints above are ABSOLUTE linear colours (the map's own ground albedo mean, rock,
  // forest and snow colours), so the baked biome tone and the vertex colour — both base-hued — are divided back
  // out here (color_fragment multiplies vColor again) and only the vertex bake's altitude shade is kept. Until
  // now the base hue entered three times (tone texture × vertex colour × base-relative tint), which turned the
  // sand plains past a red-brown mesa rim into a dark red sheet beside the yellow battlefield.
  float vistaAltShade = 0.82 + hT * 0.34;
  // Round 32 (owner 2026-09-21, "on nighttime mode the horizons glow"): the atmosphere runtime dims a night
  // battle's horizon by scaling this material's colour (battleAtmosphereRuntime dimHorizon, ×0.20). The absolute
  // colours above must carry that scale — read it as the ratio of the live diffuse to the authored day value.
  horizonDim = diffuse.r / max(uVDayDiffuse, 0.01);
  diffuseColor.rgb = lit * vistaAltShade * horizonDim / max(vColor.rgb, vec3(0.02));
  horizonWaterVariation = nC * 0.008 + nB * 0.015;
  // Round 40 (2026-09-22, AAA program check 13 "water at the edge: same level and shader beyond"): a sea aperture is
  // water, not ground. The absolute ground/rock/forest tints above replaced the vertex bake for every face, so the
  // apron showed the meadow tile's fields and stands under a grey tone one metre past the square's blue sea. Marine
  // faces keep their baked water colour (edgeWater.ts: the map's own deep water at the seam, the low sky with
  // distance) with only the broad water variation; color_fragment multiplies vColor back in.
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3((1.0 + horizonWaterVariation) * horizonDim), horizonMarine);
  // QA (round 72): the baked channels and the material weights as colour, for the capture probes
  if (uVDebug > 0.5) {
    vec3 dbg = uVDebug < 1.5 ? vec3(relief.xy, 0.5) : uVDebug < 2.5 ? vec3(relief.z) : uVDebug < 3.5 ? vec3(relief.w)
      : uVDebug < 4.5 ? vec3(nR.y) : uVDebug < 5.5 ? vec3(cloudLit) : vec3(snowW, rockW, forestW);
    diffuseColor.rgb = dbg * 0.8 / max(vColor.rgb, vec3(0.02));
    vistaHaze = 0.0;
  }
  // --- aerial perspective, per fragment (the vertex bake keeps the tone only) ----
  float hazeR = smoothstep(430.0, 1330.0, radius);
  // Round 39 (owner 2026-09-22, "it still seems too disappear-y"): the ranges took up to 94 % of the fog tint on top of
  // the scene fog and the post aerial pass, so the far skyline dissolved into one flat veil. The material-level haze
  // is now the smallest of the three layers — 0.52 at the far cascade and never more than 0.62 — and the post pass
  // (extinction ceiling 0.60, scatter ceiling 0.55) owns the rest, so a range keeps at least a third of its own
  // colour and shading at any distance.
  // Round 72: the ranges behind the first ridge now stand above it (the character's boost), and at the round-39
  // curve their outer rows — half fog tint here, then the post pass's ceiling — vanished into the sky while their
  // skyline ribbons and range trees stayed, floating over nothing. The material's share drops to 0.34 at the far
  // cascade (ceiling 0.45): a range keeps well over half its own colour, the post pass still owns the far grading.
  vistaHaze = clamp((0.05 + hazeR * hazeR * 0.34) * uVHaze + (1.0 - hT) * 0.05 * hazeR, 0.0, 0.45) * (1.0 - horizonMarine);
}`;

/** After `#include <color_fragment>`: haze toward the fog tint (the vertex bake no longer carries it). */
// Round 32 (owner 2026-09-21, "on nighttime mode the horizons seem to glow in the back"): the haze tint is the map's
// DAY fog colour captured at build time, and the far ring is up to 94 % haze — so a night battle's ×0.20 material dim
// (the `horizonDim` ratio above) never reached the skyline and the hills glowed pale under the stars. The tint now
// carries the same live dim as the surface colour.
export const HORIZON_VISTA_HAZE_FRAGMENT = /* glsl */`
diffuseColor.rgb = mix(diffuseColor.rgb, uVFogTint * horizonDim, vistaHaze);`;

// ---------------------------------------------------------------------------
// ring forest
// ---------------------------------------------------------------------------
/** sRGB HSL canopy palette — the same numbers vegetation.ts feeds its far-LOD builders, so the ring's crowns match
 * the battlefield's own trees at the rim instead of reading as a paler second forest. */
export interface HorizonForestSpeciesPalette { hue: number; sat: number; l0: number; l1: number }

interface HorizonForestOptions {
  columns: number;
  rows: readonly { r: number; aer: number; skirt?: boolean; interpolated?: boolean }[];
  positions: Float32Array;
  heights: Float32Array;
  forestCover: Float32Array;
  maxHeight: number;
  treeline: number;
  snowline: number;
  /** Map forest colour (linear) — kept for the skyline ribbon's sake; the crowns take the palettes below. */
  forest: THREE.Color;
  fog: THREE.Color;
  seed: number;
  /** 0..1 share of conifers (the map's rim mix). */
  coniferShare: number;
  maxInstances: number;
  /** Outer radius beyond which the skyline ribbon carries the forest. */
  maxRadius: number;
  /** The ring's detail noise (texture coordinates in, 0..1 out) — the JS twin of the fragment program's fields. */
  detailNoise?: (u: number, v: number) => number;
  /** 1 when the fragment program paints forest stands (treeline inside 0..1.5), else 0. */
  forestAmp?: number;
  /** Round 49: the ring's bare-upper-slope amplitude (horizon.bareRock); the stands keep off the outcrop ribs. */
  bareRock?: number;
  /** Round 55: the ring's below-treeline outcrop amplitude (horizon.outcrops); the stands keep off the knobs. */
  outcrops?: number;
  /** Round 55: twice the canopy tile's mean colour (VistaTiles.canopyMean) — centres the crown mottle at 1. */
  canopyMean?: THREE.Vector3;
  /** The vista canopy tile: world-anchored clump mottle for the ring's own trees. */
  canopyDetail?: THREE.Texture;
  /** First authored ridge row. The rows below it are the terrain-material bands where the battlefield's rim forest
   * continues: gentler slope rules, denser stands. */
  ridgeRow?: number;
  /** The map's far-LOD canopy palettes (vegetation.ts `palettes.<species>.canopy`). */
  palettes?: { conifer?: Partial<HorizonForestSpeciesPalette>; broadleaf?: Partial<HorizonForestSpeciesPalette> };
  /** Radial depth beyond the rim that carries the rich near species and casts shadows (default 300 m). */
  nearDepth?: number;
  /** Strength of the per-fragment aerial haze toward the fog tint (the ring's own uVHaze). */
  haze?: number;
  /** Textures created here join the ring's retained list. */
  retainedTextures?: THREE.Texture[];
  /** Round 63 (2026-09-24): 0..1 where the ring must stay clear of trees — a railway cutting's outland corridor, the
   * line's right-of-way (terrain.ts getOutlandSeatWeightAt); absent on every other map, whose draws are unchanged. */
  clearAt?: (x: number, z: number) => number;
}

/** vegetation.ts buildPineFarGeometry / buildOakFarGeometry defaults (vista pass values). */
const HORIZON_FOREST_CONIFER_PALETTE: HorizonForestSpeciesPalette = { hue: 0.315, sat: 0.36, l0: 0.165, l1: 0.27 };
const HORIZON_FOREST_BROADLEAF_PALETTE: HorizonForestSpeciesPalette = { hue: 0.24, sat: 0.37, l0: 0.205, l1: 0.31 };

interface TreeGeometry { geometry: THREE.BufferGeometry; height: number }

const _forestColor = new THREE.Color();
const _forestNormal = new THREE.Vector3();

function paintFlat(geometry: THREE.BufferGeometry, color: THREE.Color): void {
  const position = geometry.getAttribute('position');
  const colors = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) { colors[i * 3] = color.r; colors[i * 3 + 1] = color.g; colors[i * 3 + 2] = color.b; }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

/** Vertical light gradient + speckle baked into vertex colours, in sRGB HSL like the in-map far crowns. */
function paintCanopy(
  geometry: THREE.BufferGeometry, pal: HorizonForestSpeciesPalette, y0: number, y1: number, rng: TileRng,
): void {
  const position = geometry.getAttribute('position');
  const colors = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i++) {
    const t = clamp01((position.getY(i) - y0) / (y1 - y0));
    _forestColor.setHSL(pal.hue + (rng() - 0.5) * 0.02, pal.sat, (pal.l0 + (pal.l1 - pal.l0) * t) * (0.9 + rng() * 0.2), THREE.SRGBColorSpace);
    colors[i * 3] = _forestColor.r; colors[i * 3 + 1] = _forestColor.g; colors[i * 3 + 2] = _forestColor.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

/** Sphere-project a lobe's normals with an up-bias (before translating it): the crown lights as one smooth sunlit
 * volume instead of a shattered pile of facet normals — the in-map far crowns do the same. */
function sphereNormals(geometry: THREE.BufferGeometry, cx: number, cy: number, cz: number, upBias: number): void {
  const position = geometry.getAttribute('position');
  const normal = geometry.getAttribute('normal');
  for (let i = 0; i < position.count; i++) {
    _forestNormal.set(position.getX(i) - cx, (position.getY(i) - cy) * 0.7, position.getZ(i) - cz);
    if (_forestNormal.lengthSq() < 1e-6) _forestNormal.set(0, 1, 0);
    _forestNormal.normalize();
    _forestNormal.y += upBias;
    _forestNormal.normalize();
    normal.setXYZ(i, _forestNormal.x, _forestNormal.y, _forestNormal.z);
  }
}

/** Radial + vertical jitter keyed by vertex position, so the shared corners of a non-indexed lobe move together
 * (no cracks) while every corner still gets its own displacement. */
function jitterShell(geometry: THREE.BufferGeometry, rng: TileRng, amount: number): void {
  const position = geometry.getAttribute('position');
  const seen = new Map<string, [number, number]>();
  for (let i = 0; i < position.count; i++) {
    const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
    if (Math.hypot(x, z) < 1e-4) continue;
    const key = `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
    let draw = seen.get(key);
    if (!draw) { draw = [rng(), rng()]; seen.set(key, draw); }
    const f = 1 + (draw[0] - 0.5) * 2 * amount;
    position.setXYZ(i, x * f, y + (draw[1] - 0.5) * amount * 0.8, z * f);
  }
}

function mergeGeometries(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const flats = parts.map((part) => (part.index ? part.toNonIndexed() : part));
  let count = 0;
  for (const flat of flats) count += flat.getAttribute('position').count;
  const position = new Float32Array(count * 3), normal = new Float32Array(count * 3), color = new Float32Array(count * 3);
  let offset = 0;
  for (let i = 0; i < flats.length; i++) {
    const flat = flats[i];
    const p = flat.getAttribute('position'), n = flat.getAttribute('normal'), c = flat.getAttribute('color');
    position.set(p.array as Float32Array, offset * 3);
    normal.set(n.array as Float32Array, offset * 3);
    color.set(c.array as Float32Array, offset * 3);
    offset += p.count;
    if (flat !== parts[i]) flat.dispose();
    parts[i].dispose();
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(position, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  merged.setAttribute('color', new THREE.BufferAttribute(color, 3));
  return merged;
}

/** Conifer after the in-map far pine: a flared trunk, unequal jittered open tiers with sphere normals and (detail 2)
 * six branch tufts through the tier line. Detail 2 = the rim's near class (4-5 nine-segment tiers), 1 = the rim band
 * (3-4 seven-segment tiers), 0 = the ranges (two six-segment tiers). 1 m = 1 unit, about 6.5 m tall before scale. */
function buildRingConifer(rng: TileRng, pal: HorizonForestSpeciesPalette, detail: number): TreeGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const trunk = new THREE.CylinderGeometry(0.22, 0.40, 2.2, detail === 2 ? 6 : detail === 1 ? 5 : 4, 1);
  trunk.translate(0, 1.1, 0);
  paintFlat(trunk, _forestColor.setHSL(0.06, 0.28, 0.19, THREE.SRGBColorSpace).clone());
  parts.push(trunk);
  const tiers = detail === 2 ? 4 + Math.floor(rng() * 2) : detail === 1 ? 3 + Math.floor(rng() * 2) : 2;
  const baseY = 1.2 + rng() * 0.5;
  const topY = 5.6 + rng() * 0.9;
  for (let t = 0; t < tiers; t++) {
    const f = t / (tiers - 1);
    const y = baseY + (topY - baseY) * f * (0.9 + rng() * 0.2) - 0.5;
    const radius = ((1 - f) * 1.35 + 0.45) * (0.72 + rng() * 0.62);
    const height = (detail === 0 ? 2.2 : 1.6) + (1 - f) * 1.2 + rng() * 0.5;
    const cone = new THREE.ConeGeometry(radius, height, detail === 2 ? 9 : detail === 1 ? 7 : 6, 1, true);
    jitterShell(cone, rng, detail === 2 ? 0.50 : detail === 1 ? 0.36 : 0.25);
    sphereNormals(cone, 0, height * -0.25, 0, 0.75);
    cone.translate((rng() - 0.5) * 0.55, y + height / 2, (rng() - 0.5) * 0.55);
    paintCanopy(cone, pal, 1.2, 6.6, rng);
    parts.push(cone);
  }
  if (detail === 2) {
    for (let b = 0; b < 6; b++) {
      const a = rng() * Math.PI * 2, ty = 1.8 + rng() * 3.4;
      const rr = (1 - (ty - 1.2) / 5.4) * 1.5 + 0.35;
      const tuft = new THREE.IcosahedronGeometry(0.38 + rng() * 0.3, 0);
      jitterShell(tuft, rng, 0.4);
      tuft.scale(1.3, 0.7, 1.3);
      sphereNormals(tuft, 0, 0, 0, 0.85);
      tuft.translate(Math.cos(a) * rr, ty, Math.sin(a) * rr);
      paintCanopy(tuft, pal, 1.2, 6.6, rng);
      parts.push(tuft);
    }
  }
  return { geometry: mergeGeometries(parts), height: topY + 1.0 };
}

/** Broadleaf after the in-map far oak: a trunk and unequal jittered lobes with sphere normals and a bottom-to-crown
 * shade gradient. Detail 2 = six to eight lobes with satellite tufts (some tall narrow crowns), 1 = four to five,
 * 0 = two. About 6 m tall before the instance scale. */
function buildRingBroadleaf(rng: TileRng, pal: HorizonForestSpeciesPalette, detail: number): TreeGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const tall = detail === 2 && rng() < 0.4 ? 1.22 : 1.0, wide = tall > 1 ? 0.8 : 1.0;
  const trunkH = tall > 1 ? 3.6 : 2.9;
  const trunk = new THREE.CylinderGeometry(0.30, 0.44, trunkH, detail === 2 ? 6 : detail === 1 ? 5 : 4, 1);
  trunk.translate(0, trunkH / 2, 0);
  paintFlat(trunk, _forestColor.setHSL(0.07, 0.26, 0.23, THREE.SRGBColorSpace).clone());
  parts.push(trunk);
  const lobes = detail === 2 ? 6 + Math.floor(rng() * 3) : detail === 1 ? 4 + Math.floor(rng() * 2) : 2;
  const lowPal = { ...pal, l0: pal.l0 * 0.82 };
  for (let l = 0; l < lobes; l++) {
    const big = l === 0 ? 1 : l < 3 ? 0.62 + rng() * 0.32 : 0.30 + rng() * 0.26;
    const lobe = new THREE.IcosahedronGeometry((1.25 + rng() * 0.6) * big, 0);
    jitterShell(lobe, rng, l < 3 ? 0.34 : 0.46);
    lobe.scale((1.1 + rng() * 0.3) * wide, (0.72 + rng() * 0.25) * tall, (1.1 + rng() * 0.3) * wide);
    sphereNormals(lobe, 0, 0, 0, 1);
    const spread = (l < 3 ? 2.2 : 3.4) * wide;
    lobe.translate(
      (rng() - 0.5) * spread,
      (4.15 + (rng() - 0.45) * 1.7 - (1 - big) * 0.7 + (l >= 3 ? rng() * 0.9 : 0)) * (tall > 1 ? 1.18 : 1),
      (rng() - 0.5) * spread,
    );
    paintCanopy(lobe, lowPal, 2.3, 5.9 * tall, rng);
    parts.push(lobe);
  }
  return { geometry: mergeGeometries(parts), height: 6.4 * tall };
}

type ForestCompileHook = (shader: THREE.WebGLProgramParametersWithUniforms) => void; // round 55: three's own hook type (the canopy wrap reads it)

interface ForestPlacement {
  x: number; y: number; z: number; scale: number; yaw: number; conifer: boolean;
  /** true on the rim band rows (below the first ridge). */
  band: boolean;
  /** metres beyond the battlefield edge. */
  beyond: number;
  /** 2 rich near class (casts shadows), 1 rim band, 0 ranges. */
  detail: number;
  variant: number; tone: number;
  /** thinning key. */
  key: number;
}

/**
 * Scatter real trees over the ring faces where the painted stands are dense, one InstancedMesh per species and
 * detail class. The rim band (below the first ridge) keeps up to three quarters of the budget, thinned uniformly so
 * the whole perimeter stays covered, and its trees nearest the edge form the rich shadow-casting near class; the
 * ranges beyond get the cheap class. Returns null when the map has no treeline. Deterministic for a seed; no
 * per-frame work. The material's shader hook is left on `group.userData.horizonForestHook` so the caller can chain
 * it after the cascade's own hook.
 */
export function buildHorizonForest(options: HorizonForestOptions): THREE.Group | null {
  const { columns: n, rows, positions, heights, maxHeight, treeline, snowline, fog, seed } = options;
  if (treeline < 0.14 || options.maxInstances <= 0) return null;
  const rng = tileRng((seed ^ 0xF0E5) >>> 0);
  const coniferPal: HorizonForestSpeciesPalette = { ...HORIZON_FOREST_CONIFER_PALETTE, ...(options.palettes?.conifer ?? {}) };
  const broadleafPal: HorizonForestSpeciesPalette = { ...HORIZON_FOREST_BROADLEAF_PALETTE, ...(options.palettes?.broadleaf ?? {}) };
  const nearDepth = options.nearDepth ?? 300;
  const ridgeRow = options.ridgeRow ?? Math.max(1, rows.findIndex((row) => !row.skirt && !row.interpolated));
  const maxNear = Math.min(1500, Math.floor(options.maxInstances * 0.25));
  const candidates: ForestPlacement[] = [];
  const rowRadius = (row: number, column: number): number => {
    const i = row * n + column;
    return Math.hypot(positions[i * 3], positions[i * 3 + 2]);
  };
  const smoothstep = (a: number, b: number, x: number): number => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  };
  const beyondRim = (x: number, z: number): number => {
    const square = Math.max(Math.abs(x), Math.abs(z));
    return (square - 511.5) * (Math.hypot(x, z) / Math.max(1, square));
  };
  const noise = options.detailNoise;
  const forestAmp = options.forestAmp ?? 1;
  const bareRock = options.bareRock ?? 0; // round 49
  const outcrops = options.outcrops ?? 0; // round 55
  // The fragment program's forest stands, evaluated on the horizontal plane at a candidate tree. On the rim band the
  // terrain material paints grass to steeper slopes than the vista rock weight, so trees stand there up to ~40°,
  // and the map-scale field only thins the band (clearings come from the 140 m field) so no sector goes bare.
  const standWeightAt = (x: number, y: number, z: number, slope: number, band: boolean): number => {
    if (!noise) return 0.6;
    const nB = noise(x * 0.0016, z * 0.0016) - 0.5;
    const nC = noise(x * 0.0071 + 0.29, z * 0.0071 + 0.53) - 0.5;
    const nD = noise(x * 0.0230 + 0.71, z * 0.0230 + 0.19) - 0.5;
    const hT = Math.min(1, Math.max(0, y / Math.max(1, maxHeight)));
    const treeF = 1 - smoothstep(treeline * 0.82, treeline * 1.04, hT + nD * 0.05);
    const standF = band
      ? smoothstep(hT * 0.40, 0.26 + hT * 0.40, 0.58 + nB * 0.5 + nC * 0.7 + nD * 0.25)
      : smoothstep(0.08 + hT * 0.40, 0.30 + hT * 0.40, 0.5 + nB * 1.1 + nC * 0.7 + nD * 0.25);
    let rockW = band
      ? smoothstep(0.62, 0.95, slope + nC * 0.20 + nD * 0.12)
      : smoothstep(0.30, 0.58, slope + nC * 0.26 + nD * 0.18);
    if (!band && (bareRock > 0 || outcrops > 0)) {
      // round 49: the fragment's outcrop ribs above the treeline (same fields, same law)
      const nE = noise(x * 0.0850 + 0.11, z * 0.0850 + 0.83) - 0.5;
      const bareUp = bareRock * smoothstep(treeline * 0.80, treeline * 1.12 + 0.04, hT + nD * 0.06 + nC * 0.04);
      const rib = smoothstep(0.34, 0.66, 0.5 + nC * 0.55 + nD * 1.0 + nE * 0.45);
      const ribSlope = smoothstep(0.05, 0.24, slope + nD * 0.08);
      rockW = Math.max(rockW, bareUp * rib * (0.30 + 0.70 * ribSlope));
      if (outcrops > 0) {
        // round 55: the fragment's knobs below the treeline; its slope is 1 - cos, this face's is rise / run
        const slopeCos = 1 - 1 / Math.hypot(1, slope);
        const outcropSlope = outcrops * smoothstep(0.015, 0.13, slopeCos + nD * 0.10 + nE * 0.05) * (1 - bareUp);
        const knob = smoothstep(0.42, 0.64, 0.5 + nC * 0.85 + nD * 0.75 + nE * 0.35);
        rockW = Math.max(rockW, outcropSlope * knob * (0.6 + 0.4 * smoothstep(0.06, 0.30, slopeCos)));
      }
    }
    const steep = band ? smoothstep(0.85, 1.15, slope) : smoothstep(0.50, 0.82, slope);
    return standF * treeF * (1 - steep) * (1 - rockW) * forestAmp;
  };
  for (let row = 1; row < rows.length - 1; row++) {
    if (rows[row].skirt && rows[row + 1].skirt) continue;
    if (rowRadius(row, 0) > options.maxRadius) break;
    const band = row < ridgeRow;
    for (let column = 0; column < n; column++) {
      const k1 = (column + 1) % n;
      const i00 = row * n + column, i01 = row * n + k1, i10 = (row + 1) * n + column, i11 = (row + 1) * n + k1;
      // only faces that rise away from the battlefield show their trees; back slopes are hidden by the crest
      const rise = (heights[i10] + heights[i11]) * 0.5 - (heights[i00] + heights[i01]) * 0.5;
      if (rise < -0.5) continue;
      const dx = positions[i10 * 3] - positions[i00 * 3], dz = positions[i10 * 3 + 2] - positions[i00 * 3 + 2];
      const radialSpan = Math.hypot(dx, dz), arc = Math.hypot(positions[i01 * 3] - positions[i00 * 3], positions[i01 * 3 + 2] - positions[i00 * 3 + 2]);
      const area = radialSpan * arc;
      const slope = Math.abs(rise) / Math.max(1, radialSpan);
      if (slope > (band ? 1.15 : 1.0)) continue;
      const faceBeyond = beyondRim(positions[i00 * 3], positions[i00 * 3 + 2]);
      // one candidate per ~45 m² of rim band, ~90 m² of near range face, ~160 m² beyond 450 m
      let count = area / (band ? 45 : faceBeyond < 450 ? 90 : 160);
      count = Math.floor(count) + (rng() < count - Math.floor(count) ? 1 : 0);
      for (let t = 0; t < count; t++) {
        const u = rng(), w = rng();
        const x = positions[i00 * 3] + (positions[i01 * 3] - positions[i00 * 3]) * u + dx * w;
        const z = positions[i00 * 3 + 2] + (positions[i01 * 3 + 2] - positions[i00 * 3 + 2]) * u + dz * w;
        const y = heights[i00] + (heights[i01] - heights[i00]) * u + (heights[i10] - heights[i00]) * w;
        if (y < 1.0) continue; // the sea aperture
        // round 72: range-class trees only on the near ranges (inside 880 m) and below half the ring's height — past
        // that the aerial pass washes a boosted range's face toward the sky while a dark crown keeps a third of its
        // green, so the crowns floated over pale slopes as dots in the sky (Glacier Pass, Nordhavn, Verdant)
        if (!band && (y > maxHeight * 0.5 || Math.hypot(x, z) > 880)) continue;
        if (options.clearAt && options.clearAt(x, z) > 0.5) continue; // round 63: the cutting's right-of-way
        const stand = standWeightAt(x, y, z, slope, band);
        if (rng() > (band ? stand * 1.2 : stand * stand * 1.6)) continue;
        const snowFade = snowline <= 1 ? 1 - Math.min(1, Math.max(0, (y / maxHeight - (snowline - 0.06)) / 0.08)) : 1;
        if (rng() > snowFade) continue;
        const placement: ForestPlacement = {
          x, y: y - 0.4, z, scale: 0.9 + rng() * 0.55, yaw: rng() * Math.PI * 2, conifer: rng() < options.coniferShare,
          band, beyond: beyondRim(x, z), detail: 1, variant: rng() < 0.5 ? 0 : 1, tone: 0.86 + rng() * 0.26, key: rng(),
        };
        candidates.push(placement);
      }
    }
  }
  if (candidates.length === 0) return null;
  // Budget: the rim band keeps up to three quarters of the instances, thinned uniformly by key so the whole
  // perimeter stays covered; the ranges take the rest. The band trees nearest the edge become the rich near class.
  const thin = (list: ForestPlacement[], budget: number): ForestPlacement[] =>
    (list.length <= budget ? list : list.slice().sort((a, b) => a.key - b.key).slice(0, budget));
  const bandKept = thin(candidates.filter((c) => c.band), Math.floor(options.maxInstances * 0.75));
  const rangeKept = thin(candidates.filter((c) => !c.band), Math.max(0, options.maxInstances - bandKept.length));
  const byDepth = bandKept.slice().sort((a, b) => a.beyond - b.beyond);
  for (let i = 0; i < byDepth.length; i++) byDepth[i].detail = i < maxNear && byDepth[i].beyond < nearDepth ? 2 : 1;
  for (const placement of rangeKept) placement.detail = 0;
  const placements = bandKept.concat(rangeKept);
  const nearCount = placements.filter((placement) => placement.detail === 2).length;
  const group = new THREE.Group();
  group.name = 'horizon-forest';
  // Round 55 (2026-09-24, round 47's check 13): the ring's trees and the battlefield's far trees share their canopy
  // palettes, but the battlefield's far canopy is a matte volume (vegetation.ts canopyFarMat: roughness 1.0 and the
  // 0.38 diffuse wrap with the GGX lobe dropped) while this material kept the standard response — its GGX grazing
  // lobe read as pale mint crowns beside the square's rich green ones across the red line (Saltmere's west edge:
  // ring crowns HSL L 0.31 / sat 0.24 against the square's 0.20 / 0.31 at the same distance). Same response now.
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1.0, metalness: 0 });
  material.envMapIntensity = 1.08;
  material.side = THREE.DoubleSide;
  let canopyDetail = options.canopyDetail;
  if (!canopyDetail) {
    // a flat mid-grey tile keeps the mottle term a no-op where the ring has no canopy tile
    const flat = new THREE.DataTexture(new Uint8Array([128, 128, 128, 255]), 1, 1);
    flat.needsUpdate = true;
    options.retainedTextures?.push(flat);
    canopyDetail = flat;
  }
  const hazeStrength = options.haze ?? 0.9;
  const canopyMean = options.canopyMean ?? new THREE.Vector3(1, 1, 1);
  const hook: ForestCompileHook = (shader) => {
    shader.uniforms.uVfCanopy = { value: canopyDetail };
    shader.uniforms.uVfCanopyMean = { value: canopyMean };
    shader.uniforms.uVfFog = { value: fog.clone() };
    shader.uniforms.uVfHaze = { value: hazeStrength };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vVfWorld;')
      .replace('#include <project_vertex>', /* glsl */`{
        #ifdef USE_INSTANCING
          vec4 vfw = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
        #else
          vec4 vfw = modelMatrix * vec4(transformed, 1.0);
        #endif
        vVfWorld = vfw.xyz;
      }
      #include <project_vertex>`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uVfCanopy;\nuniform vec3 uVfCanopyMean;\nuniform vec3 uVfFog;\nuniform float uVfHaze;\nvarying vec3 vVfWorld;')
      .replace('#include <map_fragment>', /* glsl */`#include <map_fragment>
      {
        // metre-scale clump mottle from the canopy tile plus rim darkening, so the crowns read as foliage volumes.
        // Round 55: the mottle is centred on the tile's mean (uVfCanopyMean) — the raw tile (mean 0.35 / 0.39 / 0.30)
        // darkened every crown 12-17 % and pushed it toward yellow, so the ring's trees never matched the square's
        // trees of the same palette across the red line.
        vec3 vfA = texture2D(uVfCanopy, vVfWorld.xz * 0.11 + vec2(0.23, 0.61)).rgb * 2.0;
        vec3 vfB = texture2D(uVfCanopy, vec2(vVfWorld.x * 0.09 + 0.47, vVfWorld.y * 0.13 + 0.19)).rgb * 2.0;
        diffuseColor.rgb *= mix(vec3(1.0), (vfA * 0.55 + vfB * 0.45) / uVfCanopyMean, 0.55);
        float vfNdv = abs(dot(normalize(vNormal), normalize(vViewPosition)));
        float vfRim = 1.0 - vfNdv;
        diffuseColor.rgb *= 1.0 - vfRim * vfRim * 0.32;
        // aerial perspective by ring radius, the same curve the ring's own fragments use
        float vfHz = smoothstep(430.0, 1330.0, length(vVfWorld.xz));
        diffuseColor.rgb = mix(diffuseColor.rgb, uVfFog, clamp((0.04 + vfHz * vfHz * 0.72) * uVfHaze, 0.0, 0.9));
      }`);
    applyCanopyDiffuseWrap(shader, 0.38, true); // round 55: the battlefield's matte far-canopy response
  };
  material.onBeforeCompile = hook;
  material.customProgramCacheKey = () => 'horizon-forest-canopy-v3'; // round 55: mean-centred mottle
  group.userData.horizonForestHook = hook;
  const species: Array<{ name: string; tree: TreeGeometry; own: ForestPlacement[]; shadow: boolean }> = [];
  for (const conifer of [true, false]) {
    const kind = conifer ? 'conifer' : 'broadleaf';
    const pal = conifer ? coniferPal : broadleafPal;
    const build = (detail: number): TreeGeometry => (conifer ? buildRingConifer(rng, pal, detail) : buildRingBroadleaf(rng, pal, detail));
    for (const variant of [0, 1]) {
      species.push({
        name: `horizon-forest-${kind}-near-${variant}`, shadow: true, tree: build(2),
        own: placements.filter((p) => p.conifer === conifer && p.detail === 2 && p.variant === variant),
      });
    }
    species.push({ name: `horizon-forest-${kind}-band`, shadow: false, tree: build(1), own: placements.filter((p) => p.conifer === conifer && p.detail === 1) });
    species.push({ name: `horizon-forest-${kind}-range`, shadow: false, tree: build(0), own: placements.filter((p) => p.conifer === conifer && p.detail === 0) });
  }
  const matrix = new THREE.Matrix4(), quaternion = new THREE.Quaternion(), scaleV = new THREE.Vector3(), positionV = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const color = new THREE.Color();
  for (const entry of species) {
    if (entry.own.length === 0) { entry.tree.geometry.dispose(); continue; }
    const mesh = new THREE.InstancedMesh(entry.tree.geometry, material, entry.own.length);
    mesh.name = entry.name;
    // the near band casts real shadows onto the rim slopes like the battlefield's own trees; crowns never receive
    // (cascade self-shadow at range reads as black crowns — the in-map far LOD rule)
    mesh.castShadow = entry.shadow;
    mesh.receiveShadow = false;
    mesh.matrixAutoUpdate = false;
    mesh.frustumCulled = false;
    mesh.userData.aoExclude = true;
    for (let i = 0; i < entry.own.length; i++) {
      const placement = entry.own[i];
      quaternion.setFromAxisAngle(up, placement.yaw);
      scaleV.setScalar(placement.scale);
      positionV.set(placement.x, placement.y, placement.z);
      matrix.compose(positionV, quaternion, scaleV);
      mesh.setMatrixAt(i, matrix);
      color.setScalar(placement.tone);
      mesh.setColorAt(i, color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    group.add(mesh);
  }
  group.userData.horizonForest = {
    instances: placements.length,
    conifers: placements.filter((p) => p.conifer).length,
    near: nearCount,
    band: bandKept.length,
    range: rangeKept.length,
    candidates: candidates.length,
  };
  return group;
}
