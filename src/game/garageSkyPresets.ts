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
    turbidity: 7, rayleigh: 0.55, mieCoefficient: 0.009, mieDirectionalG: 0.8,
    fogDensity: 0.00047, fogTintHex: 0xc7ac85, fogMix: 0.60, envIntensity: 0.16,
    cloudOpacity: 0.35, cloudOpacity2: 0.18, cloudTintHex: 0xfff2df,
    sunIntensity: 4.15, sunColorHex: 0xffe9c2, hemiIntensity: 0.20,
    postExposure: 0.90,
  }),
  winter: Object.freeze({
    sunElevationDeg: 33, sunAzimuthDeg: 115,
    turbidity: 7.2, rayleigh: 2.2, mieCoefficient: 0.002, mieDirectionalG: 0.7,
    fogDensity: 0.00058, fogTintHex: 0xaebdce, fogMix: 0.82, envIntensity: 0.30,
    cloudOpacity: 1.0, cloudOpacity2: 0.95, cloudTintHex: 0x9aa3ae,
    cloudAltM: 320, cloudHazeK: 0.00013, cloudUvM: 2200,
    sunIntensity: 1.35, sunColorHex: 0xdfe7f2, hemiIntensity: 0.74,
    postExposure: 0.94,
  }),
  urban: Object.freeze({
    sunElevationDeg: 36, sunAzimuthDeg: 115,
    turbidity: 4.0, rayleigh: 1.4, mieCoefficient: 0.005, mieDirectionalG: 0.8,
    fogDensity: 0.00062, fogTintHex: 0x8d99a8, fogMix: 0.62, envIntensity: 0.2,
    cloudOpacity: 0.85, cloudOpacity2: 0.5, cloudTintHex: 0xe8e4dc,
    sunIntensity: 4.2, sunColorHex: 0xffedd6, hemiIntensity: 0.36,
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
    fogDensity: 0.00080, fogTintHex: 0x9aa0a6, fogMix: 0.9, envIntensity: 0.30,
    cloudOpacity: 1.0, cloudOpacity2: 0.95, cloudTintHex: 0xa39f98,
    cloudAltM: 300, cloudHazeK: 0.00013, cloudUvM: 2200,
    sunIntensity: 1.35, sunColorHex: 0xd9dad6, hemiIntensity: 0.85,
  }),
  monsoon: Object.freeze({
    sunElevationDeg: 24, sunAzimuthDeg: 124,
    turbidity: 7.8, rayleigh: 2.05, mieCoefficient: 0.012, mieDirectionalG: 0.88,
    fogDensity: 0.00088, fogTintHex: 0x708c86, fogMix: 0.66, envIntensity: 0.27,
    cloudOpacity: 1.35, cloudOpacity2: 1.18, cloudTintHex: 0xbecac8,
    sunIntensity: 2.9, sunColorHex: 0xffdfc0, hemiIntensity: 0.54,
    postExposure: 0.96,
  }),
  alpine: Object.freeze({
    sunElevationDeg: 16, sunAzimuthDeg: 132,
    turbidity: 4.2, rayleigh: 2.0, mieCoefficient: 0.0052, mieDirectionalG: 0.78,
    fogDensity: 0.00076, fogTintHex: 0x9eb1c3, fogMix: 0.64, envIntensity: 0.31,
    cloudOpacity: 1.12, cloudOpacity2: 0.82, cloudTintHex: 0xe8eef3,
    sunIntensity: 2.85, sunColorHex: 0xffddbe, hemiIntensity: 0.54,
    postExposure: 0.95,
  }),
  badlands: Object.freeze({
    sunElevationDeg: 30, sunAzimuthDeg: 116,
    turbidity: 7.2, rayleigh: 1.05, mieCoefficient: 0.0095, mieDirectionalG: 0.86,
    fogDensity: 0.00058, fogTintHex: 0xb18b77, fogMix: 0.56, envIntensity: 0.17,
    cloudOpacity: 0.62, cloudOpacity2: 0.26, cloudTintHex: 0xffe4cb,
    sunIntensity: 4.25, sunColorHex: 0xffd4ad, hemiIntensity: 0.25,
    postExposure: 0.92,
  }),
  foundry: Object.freeze({
    sunElevationDeg: 25, sunAzimuthDeg: 128,
    turbidity: 7.8, rayleigh: 1.35, mieCoefficient: 0.012, mieDirectionalG: 0.88,
    fogDensity: 0.00074, fogTintHex: 0x788286, fogMix: 0.64, envIntensity: 0.22,
    cloudOpacity: 1.24, cloudOpacity2: 1.05, cloudTintHex: 0xc8ccca,
    sunIntensity: 3.8, sunColorHex: 0xffd6ad, hemiIntensity: 0.48,
    postExposure: 0.96,
  }),
});

export function getGarageSkyPreset(mapId: string): Readonly<MapSkyConfig> {
  return GARAGE_SKY_PRESETS[mapId] || GARAGE_SKY_PRESETS.verdant;
}
