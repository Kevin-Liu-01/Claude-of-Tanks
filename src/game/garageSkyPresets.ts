import type { MapSkyConfig } from '../world/maps/horizon.ts';
import { DEFAULT_GARAGE_SKY } from '../world/maps/catalog.ts';

/**
 * Lightweight copies of the atmosphere presets used by the ten Garage source
 * battlefields. Keeping this presentation-only registry outside the map
 * modules lets the Garage use the real engine sky without importing terrain,
 * vegetation, props, or battlefield construction code.
 *
 * garageSkyPresets.selftest.mjs guards these values against the authoritative
 * map configurations, so visual tuning cannot silently drift.
 */
export const GARAGE_SKY_PRESETS = Object.freeze<Readonly<Record<string, Readonly<MapSkyConfig>>>>({
  verdant: Object.freeze({ ...DEFAULT_GARAGE_SKY }),
  desert: Object.freeze({
    sunElevationDeg: 44, sunAzimuthDeg: 115,
    turbidity: 5, /* round 37 (2026-09-22): desert rayleigh 0.55 → 0.85; 2026-10-03: the clear desert air (turbidity 5, Mie 0.006, fog 0.0003), follows src/world/maps/desert.ts */ rayleigh: 0.85, mieCoefficient: 0.006, mieDirectionalG: 0.8,
    fogDensity: 0.00025, fogTintHex: 0xbdb5a8 /* round 47: mirrors desert.ts (2026-10-03: the arid air, 0.00025) */, fogMix: 0.60, envIntensity: 0.16,
    cloudOpacity: 0.78, cloudOpacity2: 0.48, cloudTintHex: 0xfff2df, /* round 47 (2026-09-23): follows src/world/maps/desert.ts */
    cloudAltM: 900, cloudHazeK: 0.00012, cloudUvM: 2600, cloudShadowAmp: 0.26,
    sunIntensity: 4.15, sunColorHex: 0xffe9c2, hemiIntensity: 0.28, /* round 47 (2026-09-23): the shaded side lifted, follows desert.ts */
    postExposure: 0.90,
    lighting: { groundAlbedoHex: 0xad9b7c }, // 2026-10-01: mirrors desert.sky (the grounded light model's levers)
  }),
  winter: Object.freeze({
    sunElevationDeg: 33, sunAzimuthDeg: 115,
    turbidity: 7.2, rayleigh: 2.2, mieCoefficient: 0.002, mieDirectionalG: 0.7,
    fogDensity: 0.00058, fogTintHex: 0xaebdce, fogMix: 0.82, envIntensity: 0.30,
    cloudOpacity: 1.0, cloudOpacity2: 0.95, cloudTintHex: 0x9aa3ae,
    cloudAltM: 320, cloudHazeK: 0.00013, cloudUvM: 2200,
    sunIntensity: 1.35, sunColorHex: 0xdfe7f2, hemiIntensity: 0.74,
    postExposure: 0.86, // round 48: mirrors winter.ts (owner-approved round-44 snow re-grade)
    lighting: { groundAlbedoHex: 0xe5e7ec, warmth: 0.25, exposureEV: -0.25 }, // 2026-10-01: mirrors winter.sky (the grounded light model's levers)
  }),
  urban: Object.freeze({
    sunElevationDeg: 36, sunAzimuthDeg: 115,
    turbidity: 4.0, rayleigh: 1.4, mieCoefficient: 0.005, mieDirectionalG: 0.8,
    fogDensity: 0.00062, fogTintHex: 0x8d99a8, fogMix: 0.62, envIntensity: 0.2,
    cloudOpacity: 0.85, cloudOpacity2: 0.5, cloudTintHex: 0xe8e4dc,
    sunIntensity: 4.2, sunColorHex: 0xffedd6, hemiIntensity: 0.36,
    lighting: { groundAlbedoHex: 0x736f69 }, // 2026-10-01: mirrors urban.sky (the grounded light model's levers)
  }),
  coastal: Object.freeze({
    sunElevationDeg: 38, sunAzimuthDeg: 115,
    turbidity: 2.8, rayleigh: 1.8, mieCoefficient: 0.004, mieDirectionalG: 0.80,
    fogDensity: 0.00046, fogTintHex: 0x93a7bd, fogMix: 0.6, envIntensity: 0.24,
    cloudOpacity: 0.85, cloudOpacity2: 0.55, cloudTintHex: 0xffffff,
    sunIntensity: 4.5, sunColorHex: 0xfff3e0, hemiIntensity: 0.36,
  }),
  railyard: Object.freeze({
    sunElevationDeg: 42, sunAzimuthDeg: 115,
    turbidity: 9, rayleigh: 2.4, mieCoefficient: 0.0025, mieDirectionalG: 0.72,
    fogDensity: 0.00060, fogTintHex: 0x9aa0a6, fogMix: 0.72, envIntensity: 0.30, // round 76 (2026-09-26): mirrors railyard.sky
    cloudOpacity: 1.0, cloudOpacity2: 0.95, cloudTintHex: 0xa39f98,
    cloudAltM: 300, cloudHazeK: 0.00013, cloudUvM: 2200,
    sunIntensity: 1.35, sunColorHex: 0xd9dad6, hemiIntensity: 0.85,
    lighting: { groundAlbedoHex: 0x736f69 }, // 2026-10-01: mirrors railyard.sky (the grounded light model's levers)
  }),
  monsoon: Object.freeze({
    sunElevationDeg: 24, sunAzimuthDeg: 124,
    turbidity: 7.8, rayleigh: 2.05, mieCoefficient: 0.012, mieDirectionalG: 0.88,
    fogDensity: 0.00088, fogTintHex: 0x708c86, fogMix: 0.66, envIntensity: 0.27,
    cloudOpacity: 1.35, cloudOpacity2: 1.18, cloudTintHex: 0xbecac8,
    sunIntensity: 3.6, sunColorHex: 0xfae8d0, hemiIntensity: 0.46, // lighting 2026-09-13: mirrors monsoon.sky
    postExposure: 0.96,
    lighting: { groundAlbedoHex: 0x61694b }, // 2026-10-01: mirrors monsoon.sky (the grounded light model's levers)
  }),
  alpine: Object.freeze({
    sunElevationDeg: 16, sunAzimuthDeg: 132,
    turbidity: 4.2, rayleigh: 2.0, mieCoefficient: 0.0052, mieDirectionalG: 0.78,
    fogDensity: 0.00076, fogTintHex: 0x9eb1c3, fogMix: 0.64, envIntensity: 0.31,
    cloudOpacity: 1.12, cloudOpacity2: 0.82, cloudTintHex: 0xe8eef3,
    sunIntensity: 4.2, sunColorHex: 0xf8eedb, hemiIntensity: 0.34, // lighting 2026-09-13: mirrors alpine.sky
    postExposure: 0.95,
    lighting: { groundAlbedoHex: 0x9ea0a2, exposureEV: -0.25 }, // 2026-10-01: mirrors alpine.sky (the grounded light model's levers)
  }),
  badlands: Object.freeze({
    sunElevationDeg: 30, sunAzimuthDeg: 116,
    turbidity: 7.2, rayleigh: 1.05, mieCoefficient: 0.0095, mieDirectionalG: 0.86,
    fogDensity: 0.00036 /* follows badlands.ts (Redrock round 9, wave 261: the far massifs' layered haze; was the arid 0.00025) */, fogTintHex: 0xb18b77, fogMix: 0.56, envIntensity: 0.17,
    cloudOpacity: 0.62, cloudOpacity2: 0.26, cloudTintHex: 0xffe4cb,
    sunIntensity: 4.25, sunColorHex: 0xffd4ad, hemiIntensity: 0.25,
    postExposure: 0.92,
    lighting: { groundAlbedoHex: 0xaa8161 }, // 2026-10-01: mirrors badlands.sky (the grounded light model's levers)
  }),
  foundry: Object.freeze({
    sunElevationDeg: 25, sunAzimuthDeg: 128,
    turbidity: 7.8, rayleigh: 1.35, mieCoefficient: 0.006, mieDirectionalG: 0.88, // round 76 (2026-09-26): mirrors foundry.sky (the deck pass re-grade)
    fogDensity: 0.00052, fogTintHex: 0x858384, fogMix: 0.45, envIntensity: 0.22,
    atmosphere: { mieTintHex: 0xd2b28c },
    cloudOpacity: 1.24, cloudOpacity2: 1.05, cloudTintHex: 0xc8ccca,
    sunIntensity: 4.2, sunColorHex: 0xfde3c4, hemiIntensity: 0.36, // lighting 2026-09-13: mirrors foundry.sky
    postExposure: 0.96,
    lighting: { groundAlbedoHex: 0x736f69 }, // 2026-10-01: mirrors foundry.sky (the grounded light model's levers)
  }),
});

export function getGarageSkyPreset(mapId: string): Readonly<MapSkyConfig> {
  return GARAGE_SKY_PRESETS[mapId] || GARAGE_SKY_PRESETS.verdant;
}
