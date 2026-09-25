import type { MapSkyConfig } from '../world/maps/horizon.ts';

/** Shared Olympus sky: applied once under the battle loading cover. */
export const MARS_SKY_PRESET = Object.freeze({
  // galaxy sky: the dimmed dome carries the night starfield with a wide band, nebula clouds and a planet
  skyIntensity: 0.06, nightSky: 1, galaxy: 1.9, nebulaHex: 0x9a4c88, planetDeg: 3.4, planetHex: 0xd2e0ff,
  sunElevationDeg: 24, sunAzimuthDeg: 122,
  turbidity: 2.2, rayleigh: 0.35, mieCoefficient: 0.0045, mieDirectionalG: 0.78,
  // round 47 (owner 2026-09-23, "the skybox and mountains are too bland"): thin dust decks over the galaxy. The decks are not
  // dimmed with the dome, so they carry a dark rust tint and read as dust bands occluding the stars — a low 700 m
  // veil of long 4200 m streaks and a thinner high sheet — and the haze they melt into is a shade more rust
  // (0x3b2a33 -> 0x46302c: the dust band along the horizon); dust casts no shadow (cloudShadowAmp 0.05)
  fogDensity: 0.00022, fogTintHex: 0x46302c, fogMix: 0.72, envIntensity: 0.34,
  cloudOpacity: 0.3, cloudOpacity2: 0.15, cloudTintHex: 0x2c1c1e,
  cloudAltM: 700, cloudHazeK: 0.0002, cloudUvM: 4200, cloudShadowAmp: 0.05,
  sunIntensity: 3.2, sunColorHex: 0xe4ebff, hemiIntensity: 0.56, fillIntensity: 0.36,
  postExposure: 1.04,
} satisfies MapSkyConfig);
