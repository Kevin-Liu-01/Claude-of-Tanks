// src/world/hinterland/surface.ts — the land's surface atlas, baked in the worker (HZ.09, the horizons stream,
// 2026-10-13; B-architecture §4.1, §4.3).
//
// One RGBA8 sample per surface texel at half each height level's resolution: the land's albedo (sRGB, the same crop
// albedos the battlefield's land use draws — LAND_CROP_ALBEDO — so a field reads the same either side of the red line;
// the region's rock, its snow, its water, its woods' floor and canopy, its settlement ground and roads) and a flags byte
// the land material reads for its roughness, its water and its canopy. Classes come from the field's cover with the
// slope taken from the baked heights themselves (no further height queries).
import { LAND_CROP_ALBEDO, type LandCropId } from '../landUse.ts';
import { HL_COVER, createHinterlandCover, createHinterlandGeology, createHinterlandWater, type HinterlandField } from './field.ts';
import type { HinterlandLevel } from './pyramid.ts';

/** The flags byte: what the material treats apart. */
export const HL_SURFACE_FLAG = Object.freeze({ water: 1, woods: 2, rock: 4, snow: 8, road: 16, settlement: 32, sea: 64 });

/** One level's surface: its own grid (n × n samples at texelM, centred like the heights). */
export interface HinterlandSurfaceLevel { texelM: number; halfM: number; n: number; rgba: Uint8Array }

const linearToSrgb = (c: number): number => Math.round(255 * Math.max(0, Math.min(1, c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055)));
const hexToLinear = (hex: number): [number, number, number] => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map((v) => {
  const c = v / 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}) as [number, number, number];

/** Linear albedos of the classes the crop table does not hold. */
const CLASS_ALBEDO: Readonly<Record<number, readonly [number, number, number]>> = Object.freeze({
  [HL_COVER.pasture]: [0.085, 0.145, 0.045],
  [HL_COVER.woods]: [0.035, 0.055, 0.026],
  [HL_COVER.scree]: [0.22, 0.21, 0.19],
  [HL_COVER.snow]: [0.78, 0.8, 0.83],
  [HL_COVER.sand]: [0.42, 0.33, 0.21],
  [HL_COVER.water]: [0.03, 0.045, 0.05],
  [HL_COVER.settlement]: [0.13, 0.115, 0.095],
  [HL_COVER.road]: [0.2, 0.19, 0.17],
  [HL_COVER.rail]: [0.09, 0.085, 0.08],
  [HL_COVER.marsh]: [0.07, 0.09, 0.05],
  [HL_COVER.heath]: [0.12, 0.11, 0.07],
});

/** The surface resolution for each height level: half its samples (twice its texel). */
export function surfaceLevelsFor(levels: readonly HinterlandLevel[]): { texelM: number; halfM: number; n: number }[] {
  return levels.map((l) => ({ texelM: l.texelM * 2, halfM: l.halfM, n: Math.round((2 * l.halfM) / (l.texelM * 2)) + 1 }));
}

/**
 * Bake the surface over the levels: each level's texels outside the finer level's interior (the rest is never read)
 * and outside the square.
 */
export function bakeHinterlandSurface(field: HinterlandField, levels: readonly HinterlandLevel[]): HinterlandSurfaceLevel[] {
  const cover = createHinterlandCover(), geo = createHinterlandGeology(), water = createHinterlandWater();
  const out: HinterlandSurfaceLevel[] = [];
  const specs = surfaceLevelsFor(levels);
  const rockLinear = hexToLinear(field.spec.geology.rockHex);
  for (let li = 0; li < levels.length; li++) {
    const H = levels[li], S = specs[li];
    const rgba = new Uint8Array(S.n * S.n * 4);
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
        field.coverAt(x, z, cover, slope, h);
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
          albedo = [crop[0] * tone, crop[1] * tone, crop[2] * tone];
        } else {
          albedo = CLASS_ALBEDO[cover.cls] ?? CLASS_ALBEDO[HL_COVER.pasture];
          if (cover.cls === HL_COVER.pasture && cover.fieldId) {
            const tone = 0.85 + 0.3 * (((cover.fieldId * 2246822519) >>> 0) % 1000) / 1000;
            albedo = [albedo[0] * tone, albedo[1] * tone, albedo[2] * tone];
          }
        }
        if (cover.woods > 0.5) flags |= HL_SURFACE_FLAG.woods;
        if (cover.road > 0.5) flags |= HL_SURFACE_FLAG.road;
        if (cover.settle > 0.5) flags |= HL_SURFACE_FLAG.settlement;
        // the woods' share is carried in the albedo too: a wood's floor under its canopy, darker for a closed one
        if (cover.woods > 0.05 && !(flags & HL_SURFACE_FLAG.water)) {
          const w = Math.min(1, cover.woods), c = CLASS_ALBEDO[HL_COVER.woods];
          albedo = [albedo[0] + (c[0] - albedo[0]) * w, albedo[1] + (c[1] - albedo[1]) * w, albedo[2] + (c[2] - albedo[2]) * w];
        }
        rgba[k] = linearToSrgb(albedo[0]); rgba[k + 1] = linearToSrgb(albedo[1]); rgba[k + 2] = linearToSrgb(albedo[2]); rgba[k + 3] = flags;
      }
    }
    out.push({ texelM: S.texelM, halfM: S.halfM, n: S.n, rgba });
  }
  return out;
}
