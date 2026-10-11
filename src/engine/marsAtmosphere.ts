import type { MapSkyConfig } from '../world/maps/horizon.ts';

/** Shared Olympus sky: applied once under the battle loading cover. */
export const MARS_SKY_PRESET = Object.freeze({
  // galaxy sky: the dimmed dome carries the night starfield with a wide band, nebula clouds and a planet (the owner's mode
  // design, 2026-09-18: "make it look like a proper galaxy map")
  // (2026-10-10, the map-revival lane; gauntlet wave 346: "a magenta-purple nebula starfield") the owner's galaxy sky kept,
  // its look nearer a photograph's: the nebula's magenta (0x9a4c88) a dust-rose, and the band (galaxy 1.9 -> 1.1) narrower
  // and sparser, so its stars stop crowding into a candy-bright river (presence along its core 0.91 -> 0.57 of the cells)
  skyIntensity: 0.06, nightSky: 1, galaxy: 1.1, nebulaHex: 0x7a5448, planetDeg: 3.4, planetHex: 0xd2e0ff,
  sunElevationDeg: 24, sunAzimuthDeg: 122,
  turbidity: 2.2, rayleigh: 0.35, mieCoefficient: 0.0045, mieDirectionalG: 0.78,
  // round 47 (owner 2026-09-23, "the skybox and mountains are too bland"): thin dust decks over the galaxy. The decks are not
  // dimmed with the dome, so they carry a dark rust tint and read as dust bands occluding the stars — a low 700 m
  // veil of long 4200 m streaks and a thinner high sheet — and the haze they melt into is a shade more rust
  // (0x3b2a33 -> 0x46302c: the dust band along the horizon); dust casts no shadow (cloudShadowAmp 0.05)
  // (2026-10-11, the map-revival lane; gauntlet wave 380: "pasted dark wisps and sprite smudges" on the galaxy sky, the
  // owner's design kept; "in bird views the ground stops at a flat empty strip under a thin black band") the dust decks a
  // third as dense (.3 / .15 -> .1 / .05), the thin ice cloudscape gone, and a dust glow along the dome's horizon in the
  // haze's own rust (sky.ts horizonGlowHex), so the far country meets dusty air, not a black seam
  fogDensity: 0.00022, fogTintHex: 0x46302c, fogMix: 0.72, envIntensity: 0.34, horizonGlowHex: 0x5a3b2e,
  cloudOpacity: 0.1, cloudOpacity2: 0.05, cloudTintHex: 0x2c1c1e,
  cloudAltM: 700, cloudHazeK: 0.0002, cloudUvM: 4200, cloudShadowAmp: 0.05,
  sunIntensity: 3.2, sunColorHex: 0xe4ebff, hemiIntensity: 0.56, fillIntensity: 0.36,
  postExposure: 1.04,
  // round 65 (2026-09-24): Olympus Basin keeps its thin CO2 atmosphere under the physically based sky —
  // Rayleigh at 3 % of Earth's (0.6 % of the pressure, CO2's 2.5× cross-section, the taller scale height),
  // a dust-laden Mie term (optical depth ~0.3) whose single-scattering albedo absorbs blue (the butterscotch
  // sky), no ozone, a rust ground bounce. The dome stays dimmed to the galaxy; the dust glows near the key light.
  // The shared preset carries it so every map played under the Mars ruleset gets the same sky.
  atmosphere: { rayleighScale: 0.03, mieScale: 60, mieG: 0.76, ozoneScale: 0, mieTintHex: 0xe8895a, groundAlbedoHex: 0x9b6a48 },
  // round 71 (2026-09-25) laid thin high water-ice clouds under the dust veil (the opt-in volumetric cloudscape); they drew
  // as smudges across the galaxy (wave 380) and are gone (2026-10-11)
} satisfies MapSkyConfig);
