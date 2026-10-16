// src/world/hinterland/surface.ts — the land's surface atlas, baked in the worker (HZ.09, the horizons stream,
// 2026-10-13; B-architecture §4.1, §4.3).
//
// One RGBA8 sample per surface texel at half each height level's resolution: the land's albedo (sRGB, the same crop
// albedos the battlefield's land use draws — LAND_CROP_ALBEDO — so a field reads the same either side of the red line;
// the region's rock, its snow, its water, its woods' floor and canopy, its settlement ground and roads) and a flags byte
// the land material reads for its roughness, its water and its canopy. Classes come from the field's cover with the
// slope taken from the baked heights themselves (no further height queries).
import { LAND_CROP_ALBEDO, createLandFieldSample, landUseAt, type LandCropId } from '../landUse.ts';
import { HL_COVER, createHinterlandCover, createHinterlandGeology, createHinterlandWater, type HinterlandField } from './field.ts';
import { hash12, noise2 } from './noise.ts';
import type { HinterlandLevel } from './pyramid.ts';
import { HINTERLAND_SEASON_LEAF } from './spec.ts';
import { hinterlandSnowCovered } from './regions.ts';
import { HL_EDGE_OFFSET_M, HL_EDGE_SCALE } from './wire.ts';

/** The flags byte: what the material treats apart. */
export const HL_SURFACE_FLAG = Object.freeze({ water: 1, woods: 2, rock: 4, snow: 8, road: 16, settlement: 32, sea: 64 });

/** One level's surface: its own grid (n × n samples at texelM, centred like the heights). `edges`: per texel a field's
 * signed offsets to its nearer edges along the land-use grid's u and v (two 16-bit values, EDGE_* encoding; all ones
 * where no field) — the material rebuilds the parcels' straight edges between texels. */
export interface HinterlandSurfaceLevel { texelM: number; halfM: number; n: number; rgba: Uint8Array; edges: Uint8Array | null }

const encodeEdge = (s: number): number => (Math.abs(s) >= HL_EDGE_OFFSET_M - 1 ? 65535 : Math.max(0, Math.min(65534, Math.round((s + HL_EDGE_OFFSET_M) * HL_EDGE_SCALE))));

const srgbExact = (c: number): number => Math.round(255 * Math.max(0, Math.min(1, c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055)));
// (a 4096-entry table over the linear range: the bake converts three channels per texel)
const SRGB_LUT = Uint8Array.from({ length: 4096 }, (_, i) => srgbExact(i / 4095));
const linearToSrgb = (c: number): number => SRGB_LUT[Math.max(0, Math.min(4095, Math.round(c * 4095)))];
const hexToLinear = (hex: number): [number, number, number] => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map((v) => {
  const c = v / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}) as [number, number, number];

/** Linear albedos of the classes the crop table does not hold. */
const CLASS_ALBEDO: Readonly<Record<number, readonly [number, number, number]>> = Object.freeze({
  [HL_COVER.pasture]: [0.085, 0.145, 0.045],
  [HL_COVER.woods]: [0.035, 0.055, 0.026],
  [HL_COVER.scree]: [0.22, 0.21, 0.19],
  // (a cool snow, as the battlefield's reads under the sky — the Glacier bird view's warm outland against a blue square)
  [HL_COVER.snow]: [0.72, 0.79, 0.88],
  [HL_COVER.sand]: [0.42, 0.33, 0.21],
  [HL_COVER.water]: [0.03, 0.045, 0.05],
  [HL_COVER.settlement]: [0.13, 0.115, 0.095],
  [HL_COVER.road]: [0.2, 0.19, 0.17],
  [HL_COVER.rail]: [0.09, 0.085, 0.08],
  [HL_COVER.marsh]: [0.07, 0.09, 0.05],
  [HL_COVER.heath]: [0.12, 0.11, 0.07],
});

const CONIFERS = new Set(['pine', 'spruce', 'fir', 'cedar', 'cypress', 'larch']);
const smooth01 = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
/** A wood's crowns with their leaves gone (linear): grey-brown twigs over the litter. */
const BARE_WOODS: readonly [number, number, number] = [0.07, 0.056, 0.046];

/**
 * The surface resolution for each height level: the finest at its own samples (4 m on the desktop: the field parcels'
 * edges stay straight from the air near the battlefield — the coordinator on the pilot's overview, "stair-stepped,
 * pixelated edges"), every coarser one at half its samples (twice its texel). `step`: height samples per surface texel.
 */
export function surfaceLevelsFor(levels: readonly HinterlandLevel[]): { texelM: number; halfM: number; n: number; step: number }[] {
  return levels.map((l, i) => {
    const step = i === 0 ? 1 : 2;
    return { texelM: l.texelM * step, halfM: l.halfM, n: Math.round((2 * l.halfM) / (l.texelM * step)) + 1, step };
  });
}

/** A snow-dusted spruce wood's crowns (linear), before its dusting. */
const SNOW_SPRUCE: readonly [number, number, number] = [0.022, 0.036, 0.034];

/** The fields' mean albedo far out (linear): a far field system's contrast closes toward it (aerial texture loss). */
const FAR_FIELD_MEAN: readonly [number, number, number] = [0.1, 0.12, 0.055];

/**
 * Bake the surface over the levels: each level's texels outside the finer level's interior (the rest is never read)
 * and outside the square.
 */
/**
 * A field's albedo with distance: its contrast against the field system's mean closes from 600 m to 2.4 km (to 45 %),
 * so a pale stubble or ripe crop far out reads as a field among fields, not a strip of sand (the coordinator on the
 * pilot's edge-n frame: "that tan band reads as sand").
 */
function farFields(c: readonly [number, number, number], x: number, z: number): [number, number, number] {
  const k = 1 - 0.55 * smooth01((Math.hypot(x, z) - 600) / 1800);
  return [FAR_FIELD_MEAN[0] + (c[0] - FAR_FIELD_MEAN[0]) * k, FAR_FIELD_MEAN[1] + (c[1] - FAR_FIELD_MEAN[1]) * k, FAR_FIELD_MEAN[2] + (c[2] - FAR_FIELD_MEAN[2]) * k];
}

export function bakeHinterlandSurface(
  field: HinterlandField, levels: readonly HinterlandLevel[],
  { woodsOut = null as Uint8Array[] | null, bases = null as readonly Float32Array[] | null } = {},
): HinterlandSurfaceLevel[] {
  const cover = createHinterlandCover(), geo = createHinterlandGeology(), water = createHinterlandWater();
  const out: HinterlandSurfaceLevel[] = [];
  const specs = surfaceLevelsFor(levels);
  const rockLinear = hexToLinear(field.spec.geology.rockHex);
  // (a snow-covered place: its roads packed snow and its yards trodden snow, not a lowland's tarmac and earth)
  const snowy = hinterlandSnowCovered(field.spec.geology);
  const SNOW_ROAD: readonly [number, number, number] = [0.5, 0.54, 0.6], SNOW_YARD: readonly [number, number, number] = [0.56, 0.6, 0.66];
  // the woods' colour in the season: a broadleaf wood's crowns go grey-brown as its leaves fall, a conifer's keep
  let conifer = 0, total = 0;
  for (const [sp, w] of field.spec.region.vegetation.species) { total += w; if (CONIFERS.has(sp)) conifer += w; }
  const leaf = HINTERLAND_SEASON_LEAF[field.spec.season] ?? 1;
  const keep = total > 0 ? conifer / total + (1 - conifer / total) * leaf : leaf;
  const leafy = CLASS_ALBEDO[HL_COVER.woods];
  const woodsAlbedo: [number, number, number] = [0, 1, 2].map((c) => BARE_WOODS[c] + (leafy[c] - BARE_WOODS[c]) * keep) as [number, number, number];
  for (let li = 0; li < levels.length; li++) {
    const H = levels[li], S = specs[li];
    const rgba = new Uint8Array(S.n * S.n * 4);
    // (no field: both offsets all ones)
    const edges = new Uint8Array(S.n * S.n * 4).fill(255);
    const woodsShare = woodsOut ? (woodsOut[li] = new Uint8Array(S.n * S.n)) : null;
    const inner = li > 0 ? levels[li - 1].halfM - 3 * S.texelM : -1;
    const hAt = (x: number, z: number): number => {
      const fx = Math.max(0, Math.min(H.n - 1.001, (x + H.halfM) / H.texelM)), fz = Math.max(0, Math.min(H.n - 1.001, (z + H.halfM) / H.texelM));
      const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j, k = j * H.n + i, h = H.heights;
      return (h[k] * (1 - tx) + h[k + 1] * tx) * (1 - tz) + (h[k + H.n] * (1 - tx) + h[k + H.n + 1] * tx) * tz;
    };
    for (let j = 0; j < S.n; j++) {
      const z = -S.halfM + j * S.texelM;
      for (let i = 0; i < S.n; i++) {
        const x = -S.halfM + i * S.texelM;
        const k = (j * S.n + i) * 4;
        if (li > 0 && Math.abs(x) < inner && Math.abs(z) < inner) continue;
        if (Math.max(Math.abs(x), Math.abs(z)) < 500) continue;
        const e = S.texelM;
        const h = hAt(x, z);
        const slope = Math.atan(Math.hypot(hAt(x + e, z) - hAt(x - e, z), hAt(x, z + e) - hAt(x, z - e)) / (2 * e)) * 180 / Math.PI;
        // (the pyramid's base under this texel — surface texel i is height sample step·i — spares the relief's evaluation)
        const b = bases?.[li]?.[(S.step * j) * H.n + S.step * i];
        field.coverAt(x, z, cover, slope, h, b);
        let flags = 0;
        let albedo: readonly [number, number, number];
        if (cover.cls === HL_COVER.water) {
          field.waterAt(x, z, water);
          flags |= HL_SURFACE_FLAG.water | (water.kind === 1 ? HL_SURFACE_FLAG.sea : 0);
          albedo = CLASS_ALBEDO[HL_COVER.water];
        } else if (cover.cls === HL_COVER.snow) { flags |= HL_SURFACE_FLAG.snow; albedo = CLASS_ALBEDO[HL_COVER.snow]; }
        else if (cover.cls === HL_COVER.rock) {
          field.geologyAt(x, z, geo, slope, h);
          const band = 0.86 + 0.18 * Math.sin(geo.strata * 6.2831853) * Math.min(1, field.spec.geology.strata.contrast * 6);
          const rock = geo.rockHex !== field.spec.geology.rockHex ? hexToLinear(geo.rockHex) : rockLinear;
          albedo = [rock[0] * band, rock[1] * band, rock[2] * band];
          flags |= HL_SURFACE_FLAG.rock;
        } else if (cover.cls === HL_COVER.field && cover.crop !== 31) {
          const crop = LAND_CROP_ALBEDO[cover.crop as LandCropId] ?? CLASS_ALBEDO[HL_COVER.pasture];
          const tone = 0.9 + 0.2 * (((cover.fieldId * 2654435761) >>> 0) % 1000) / 1000;
          albedo = farFields([crop[0] * tone, crop[1] * tone, crop[2] * tone], x, z);
        } else {
          albedo = CLASS_ALBEDO[cover.cls] ?? CLASS_ALBEDO[HL_COVER.pasture];
          if (snowy && (cover.cls === HL_COVER.road || cover.cls === HL_COVER.rail)) albedo = SNOW_ROAD;
          else if (snowy && cover.cls === HL_COVER.settlement) albedo = SNOW_YARD;
          if (cover.cls === HL_COVER.pasture && cover.fieldId) {
            const tone = 0.85 + 0.3 * (((cover.fieldId * 2246822519) >>> 0) % 1000) / 1000;
            albedo = farFields([albedo[0] * tone, albedo[1] * tone, albedo[2] * tone], x, z);
          }
        }
        if (cover.woods > 0.5) flags |= HL_SURFACE_FLAG.woods;
        if (cover.road > 0.5) flags |= HL_SURFACE_FLAG.road;
        if (cover.settle > 0.5) flags |= HL_SURFACE_FLAG.settlement;
        // the woods' share is carried in the albedo too: a wood's floor under its canopy, darker for a closed one
        if (cover.woods > 0.05 && !(flags & HL_SURFACE_FLAG.water)) {
          // (a snow-covered place's woods from above: spruce crowns dark blue-green under a dusting of snow, a little
          // lighter or darker crown to crown — the round-4c bird view read them as flat olive slabs)
          let c: readonly [number, number, number] = woodsAlbedo;
          if (snowy) {
            const dust = 0.16 + 0.2 * hash12(x * 0.011 + 3.3, z * 0.013 - 1.7);
            c = [SNOW_SPRUCE[0] + (0.72 - SNOW_SPRUCE[0]) * dust, SNOW_SPRUCE[1] + (0.79 - SNOW_SPRUCE[1]) * dust, SNOW_SPRUCE[2] + (0.88 - SNOW_SPRUCE[2]) * dust];
          }
          const w = Math.min(1, cover.woods);
          albedo = [albedo[0] + (c[0] - albedo[0]) * w, albedo[1] + (c[1] - albedo[1]) * w, albedo[2] + (c[2] - albedo[2]) * w];
          if (woodsShare) woodsShare[j * S.n + i] = Math.round(255 * w);
        }
        rgba[k] = linearToSrgb(albedo[0]); rgba[k + 1] = linearToSrgb(albedo[1]); rgba[k + 2] = linearToSrgb(albedo[2]); rgba[k + 3] = flags;
        if ((cover.cls === HL_COVER.field || cover.cls === HL_COVER.pasture) && cover.edgeU < 1e8) {
          const eu = encodeEdge(cover.edgeU), ev = encodeEdge(cover.edgeV);
          edges[k] = eu >> 8; edges[k + 1] = eu & 255; edges[k + 2] = ev >> 8; edges[k + 3] = ev & 255;
        }
      }
    }
    out.push({ texelM: S.texelM, halfM: S.halfM, n: S.n, rgba, edges });
  }
  return out;
}

/**
 * The woods' canopy raised over the drawn heights (HL-2b: "a flat canopy at 18–25 m with an irregular edge"): each
 * height sample past the battlefield's own border gains the region's canopy height × the woods' share there (the
 * surface bake's, bilinear on its grid), the canopy's top broken by a stand-scale noise. The battlefield's trees hold
 * the first metres past the line, so the canopy rises from 40 m to 150 m out. In place on the levels' heights.
 */
export function raiseHinterlandCanopy(
  levels: readonly HinterlandLevel[], woods: readonly Uint8Array[], canopyM: number, seed: number,
  { treesWithinM = 0 } = {},
): void {
  if (!(canopyM > 0)) return;
  const specs = surfaceLevelsFor(levels);
  const ox = hash12(seed * 0.013 + 0.7, 3.1) * 400, oz = hash12(seed * 0.029 + 1.9, 5.3) * 400;
  for (let li = 0; li < levels.length; li++) {
    const L = levels[li], S = specs[li], W = woods[li];
    if (!W) continue;
    for (let j = 0; j < L.n; j++) {
      const z = -L.halfM + j * L.texelM;
      const fz = (z + S.halfM) / S.texelM, sj = Math.min(S.n - 2, Math.max(0, Math.floor(fz))), tz = fz - sj;
      for (let i = 0; i < L.n; i++) {
        const x = -L.halfM + i * L.texelM;
        const edgeOut = Math.max(Math.abs(x), Math.abs(z)) - 512;
        if (edgeOut < 40) continue;
        const fx = (x + S.halfM) / S.texelM, si = Math.min(S.n - 2, Math.max(0, Math.floor(fx))), tx = fx - si;
        const k = sj * S.n + si;
        const w = ((W[k] * (1 - tx) + W[k + 1] * tx) * (1 - tz) + (W[k + S.n] * (1 - tx) + W[k + S.n + 1] * tx) * tz) / 255;
        if (w <= 0.3) continue;
        const ramp = edgeOut >= 150 ? 1 : (edgeOut - 40) / 110;
        // (a stand's own height: ±15 % over a few hundred metres, and the crowns' roughness in its top, at the finest
        // scale the level holds)
        const crown = Math.max(28, 2.5 * L.texelM);
        const stand = 1 + 0.15 * noise2(x / 260 + ox, z / 260 - oz) + 0.12 * noise2(x / crown - oz, z / crown + ox);
        // the share sharpened about its half (a coarse level's bilinear would spread a wood over its neighbours as a
        // hill); where the woods' own trees stand (trees.ts) the canopy is only their shrub layer under them
        const share = smooth01((w - 0.3) / 0.4);
        const r = Math.hypot(x, z);
        // (0.15 there: a shrub layer — at 0.62 the pilot's frames showed the trees standing on a smooth grassy hill)
        const under = r < treesWithinM ? 0.15 : r < treesWithinM + 400 ? 0.15 + 0.85 * (r - treesWithinM) / 400 : 1;
        L.heights[j * L.n + i] += canopyM * stand * ramp * share * under;
      }
    }
  }
}

/**
 * The near band's hedge trees (Verdant's hedgerows and shelterbelts, a bocage's banks; HZ Verdant): the land use's
 * hedged boundaries out to `withinM`. A coarse lattice (`stepM`) asks the land use once a point and steps each point
 * near a field's edge onto that edge along the grid's axis (its signed offsets sU, sV), keeps it where the edge is
 * hedged (field.hedgeAt) and the cover there is open land (not water, a wood, a road or a yard), one tree a 6 m cell —
 * standards of the region's species, 9–16 m (poplars taller). Hedged regions only; beyond the band the far country's
 * shelterbelts carry them (far.ts). (A 3.5 m lattice asking every point cost the worker 2.7 s on Verdant; a 7 m one
 * still 1.4 s under load: 10 m, a standard every ~10 m along a line.)
 */
export function plantHinterlandHedges(
  field: HinterlandField, groundAt: (x: number, z: number) => number, { withinM = 1750, stepM = 10 } = {},
): import('./wire.ts').HinterlandGroundedTree[] {
  const veg = field.spec.region.vegetation, landUse = field.landUse;
  // (the hedged countries only: a polder's tree rows are its dykes' crowns, planned with them)
  if (!landUse || field.spec.outland.hedges <= 0 || !veg.species.length || (veg.habit !== 'shelterbelt' && veg.habit !== 'hedgerow')) return [];
  let total = 0;
  for (const [, w] of veg.species) total += w;
  const leafBase = HINTERLAND_SEASON_LEAF[field.spec.season] ?? 1;
  const cu = Math.cos(landUse.heading), su = Math.sin(landUse.heading);
  const sample = createLandFieldSample(), cover = createHinterlandCover();
  const seen = new Set<number>();
  const out: import('./wire.ts').HinterlandGroundedTree[] = [];
  const plant = (x: number, z: number): void => {
    if (Math.max(Math.abs(x), Math.abs(z)) < 530 || Math.hypot(x, z) > withinM) return;
    const key = (Math.round(x / 6) + 8192) * 16384 + (Math.round(z / 6) + 8192);
    if (seen.has(key)) return;
    seen.add(key);
    if (field.hedgeAt(x, z) < 0.5) return;
    field.coverAt(x, z, cover);
    if (cover.cls !== HL_COVER.field && cover.cls !== HL_COVER.pasture) return;
    let u = hash12(x * 0.013 + 2.2, z * 0.017 - 4.1) * total, name = veg.species[0][0];
    for (const [sp, wt] of veg.species) { u -= wt; if (u <= 0) { name = sp; break; } }
    const conifer = CONIFERS.has(name), poplar = name === 'poplar';
    const age = hash12(x * 0.021 - 1.7, z * 0.019 + 3.3);
    const leaf = conifer ? 1 : Math.max(0, Math.min(1, leafBase + (hash12(x * 0.07, z * 0.05) - 0.5) * 0.5 * (1 - Math.abs(leafBase - 0.5))));
    out.push({
      x, z, species: name, heightM: (poplar ? 14 : 9) + (poplar ? 8 : 7) * age, crownM: poplar ? 1.6 + 1.2 * age : conifer ? 2.2 + 1.2 * age : 2.8 + 2.4 * age,
      tone: hash12(z * 0.031, x * 0.029), form: conifer ? 'conifer' : poplar ? 'columnar' : 'broad', leaf, y: groundAt(x, z),
    });
  };
  const n = Math.ceil(withinM / stepM);
  for (let j = -n; j <= n; j++) for (let i = -n; i <= n; i++) {
    const x = i * stepM, z = j * stepM;
    if (Math.max(Math.abs(x), Math.abs(z)) < 520 || Math.hypot(x, z) > withinM + stepM) continue;
    landUseAt(landUse, x, z, sample);
    if (!(sample.active > 0)) continue;
    // (onto the nearer edge across u, then across v: the line lies at the grid coordinate less the signed offset)
    if (Math.abs(sample.sU) < stepM) plant(x - sample.sU * cu, z - sample.sU * su);
    if (Math.abs(sample.sV) < stepM) plant(x + sample.sV * su, z - sample.sV * cu);
  }
  return out;
}

/**
 * The woods' own trees where the battlefield's impostors can draw them (nearer than `withinM` to the centre): a jittered
 * lattice over the woods' share (surface.ts's, at the finest surface level holding the point), dense along a wood's
 * edge (its outline is trees, not a wall) and sparser inside (their crowns break the canopy's top), each its region's
 * species, its height about the region's canopy, its foliage the season's. Their ground is the drawn land's before the
 * canopy rose (`groundAt`).
 */
export function plantHinterlandWoods(
  field: HinterlandField, levels: readonly HinterlandLevel[], woods: readonly Uint8Array[],
  groundAt: (x: number, z: number) => number, { withinM = 1750, spacingM = 9, seed = 1337 } = {},
): import('./wire.ts').HinterlandGroundedTree[] {
  const specs = surfaceLevelsFor(levels);
  const veg = field.spec.region.vegetation;
  const canopy = veg.canopyM || 18;
  let total = 0;
  for (const [, w] of veg.species) total += w;
  const leafBase = HINTERLAND_SEASON_LEAF[field.spec.season] ?? 1;
  const shareAt = (x: number, z: number): number => {
    const a = Math.max(Math.abs(x), Math.abs(z));
    for (let li = 0; li < specs.length; li++) {
      const S = specs[li], W = woods[li];
      if (!W || a >= S.halfM - 2 * S.texelM) continue;
      const fx = (x + S.halfM) / S.texelM, fz = (z + S.halfM) / S.texelM;
      const i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j, k = j * S.n + i;
      return ((W[k] * (1 - tx) + W[k + 1] * tx) * (1 - tz) + (W[k + S.n] * (1 - tx) + W[k + S.n + 1] * tx) * tz) / 255;
    }
    return 0;
  };
  const out: import('./wire.ts').HinterlandGroundedTree[] = [];
  const n = Math.ceil(withinM / spacingM);
  for (let j = -n; j <= n; j++) for (let i = -n; i <= n; i++) {
    const h1 = hash12(i * 0.731 + seed * 0.001, j * 1.173), h2 = hash12(i * 1.917 - 3.1, j * 0.613 + seed * 0.002), h3 = hash12(i * 0.377 + 7.7, j * 2.131 - 1.3);
    const x = (i + (h1 - 0.5) * 0.9) * spacingM, z = (j + (h2 - 0.5) * 0.9) * spacingM;
    if (Math.max(Math.abs(x), Math.abs(z)) < 560 || Math.hypot(x, z) > withinM) continue;
    const w = shareAt(x, z);
    if (w < 0.3) continue;
    // the edge (a share between 0.3 and 0.8 — the wood's last 10–20 m) nearly every cell; inside, one in three
    const keep = w < 0.8 ? 0.85 : 0.34;
    if (h3 > keep) continue;
    let u = hash12(x * 0.013 + 2.2, z * 0.017 - 4.1) * total, name = veg.species[0]?.[0] ?? 'oak';
    for (const [sp, wt] of veg.species) { u -= wt; if (u <= 0) { name = sp; break; } }
    const conifer = CONIFERS.has(name);
    const age = hash12(x * 0.021 - 1.7, z * 0.019 + 3.3);
    const heightM = canopy * (0.82 + 0.36 * age) * (w < 0.8 ? 0.92 : 1);
    const leaf = conifer ? 1 : Math.max(0, Math.min(1, leafBase + (hash12(x * 0.07, z * 0.05) - 0.5) * 0.5 * (1 - Math.abs(leafBase - 0.5))));
    out.push({
      x, z, species: name, heightM, crownM: conifer ? 2.4 + 1.4 * age : 3.2 + 2.6 * age, tone: hash12(z * 0.031, x * 0.029),
      form: conifer ? 'conifer' : 'broad', leaf, y: groundAt(x, z), woods: true,
    });
  }
  return out;
}
