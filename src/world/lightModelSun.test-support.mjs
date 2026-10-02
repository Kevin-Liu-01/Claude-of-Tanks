// 2026-10-01 (the lighting lane, the grounded light model): every battlefield's sky block writes the sun its own
// atmosphere gives it (src/engine/lightModel.ts deriveSunForPreset: the transmittance toward the sun at the map's
// elevation and the overcast of its cloudscape), where the presets carried hand-tuned keys. Sky authoring never feeds
// relief, so the byte receipts that project map sources and configs back to their historical form (badlandsRelief,
// playableRelief) authenticate each exact current sky edit here — the live values must be the model's derivation — and
// project it back: the source line to the text the historical digest saw, the config's two sun leaves to their
// previous values (the round-47 / round-70 / round-76 pattern). A later edit to one of these lines must regenerate its
// pair (the receipt fails loudly on a line it no longer finds exactly once).
import assert from 'node:assert/strict';
import { deriveSunForPreset } from '../engine/lightModel.ts';
import { DEFAULT_SKY_PRESET } from '../engine/sky.ts';

export const LIGHT_MODEL_SKY_EDITS = {
  "airfield.ts": [
    ["  sky: { sunElevationDeg: 30, sunAzimuthDeg: 142, turbidity: 3.8, rayleigh: 1.5, mieCoefficient: 0.005, mieDirectionalG: 0.81, fogDensity: 0.00048, fogTintHex: 0x92a9b7, fogMix: 0.46, envIntensity: 0.24, cloudOpacity: 0.85, cloudOpacity2: 0.45, cloudTintHex: 0xf1f2ed, sunIntensity: 4.41, sunColorHex: 0xffedd2, hemiIntensity: 0.40 },\n", "  sky: { sunElevationDeg: 30, sunAzimuthDeg: 142, turbidity: 3.8, rayleigh: 1.5, mieCoefficient: 0.005, mieDirectionalG: 0.81, fogDensity: 0.00048, fogTintHex: 0x92a9b7, fogMix: 0.46, envIntensity: 0.24, cloudOpacity: 0.85, cloudOpacity2: 0.45, cloudTintHex: 0xf1f2ed, sunIntensity: 4.0, sunColorHex: 0xffedda, hemiIntensity: 0.40 },\n"],
  ],
  "alpine.ts": [
    ["    sunIntensity: 3.78, sunColorHex: 0xffd89f, hemiIntensity: 0.34, postExposure: 0.95, // lighting 2026-09-13: key/fill back toward the 1049e4e ratio (was 2.85 / 0xffddbe / 0.54); the dimmer, warmer key with a high hemisphere fill read flat next to the reference at identical poses\n", "    sunIntensity: 4.2, sunColorHex: 0xf8eedb, hemiIntensity: 0.34, postExposure: 0.95, // lighting 2026-09-13: key/fill back toward the 1049e4e ratio (was 2.85 / 0xffddbe / 0.54); the dimmer, warmer key with a high hemisphere fill read flat next to the reference at identical poses\n"],
  ],
  "autumn.ts": [
    ["    sunIntensity: 4.33, sunColorHex: 0xffebce, hemiIntensity: 0.30,\n", "    sunIntensity: 4.3, sunColorHex: 0xffe6bd, hemiIntensity: 0.30,\n"],
  ],
  "badlands.ts": [
    ["    sunIntensity: 4.45, sunColorHex: 0xfff1df, hemiIntensity: 0.25, postExposure: 0.92,\n", "    sunIntensity: 4.25, sunColorHex: 0xffd4ad, hemiIntensity: 0.25, postExposure: 0.92,\n"],
  ],
  "blackglass.ts": [
    ["    sunIntensity: 3.91, sunColorHex: 0xffe6c3, hemiIntensity: 0.32, postExposure: 0.91, // lighting 2026-09-13: key/fill back toward the 1049e4e ratio (was 3.5 / 0xffb77e / 0.38); the dimmer, warmer key with a high hemisphere fill read flat next to the reference at identical poses\n", "    sunIntensity: 3.9, sunColorHex: 0xffc697, hemiIntensity: 0.32, postExposure: 0.91, // lighting 2026-09-13: key/fill back toward the 1049e4e ratio (was 3.5 / 0xffb77e / 0.38); the dimmer, warmer key with a high hemisphere fill read flat next to the reference at identical poses\n"],
  ],
  "caldera.ts": [
    ["    sunIntensity: 4.11, sunColorHex: 0xffecd2, hemiIntensity: 0.42, postExposure: 0.95, // lighting 2026-09-13: key/fill back toward the 1049e4e ratio (was 3.5 / 0xffb985 / 0.64); the dimmer, warmer key with a high hemisphere fill read flat next to the reference at identical poses\n", "    sunIntensity: 4.0, sunColorHex: 0xffc9a0, hemiIntensity: 0.42, postExposure: 0.95, // lighting 2026-09-13: key/fill back toward the 1049e4e ratio (was 3.5 / 0xffb985 / 0.64); the dimmer, warmer key with a high hemisphere fill read flat next to the reference at identical poses\n"],
  ],
  "catalog.ts": [
    ["  sunColorHex: 0xfff1dd,\n", "  sunColorHex: 0xfff1dc,\n"],
  ],
  "cliffbridge.ts": [
    ["    fogDensity:.00028,fogTintHex:0xb3c4b6,sunColorHex:0xfff1df,sunIntensity:4.55,postExposure:.98},\n", "    fogDensity:.00028,fogTintHex:0xb3c4b6,sunColorHex:0xfff0d9,sunIntensity:3.5,postExposure:.98},\n"],
  ],
  "coastal.ts": [
    ["    sunIntensity: 4.46, sunColorHex: 0xffeed3, hemiIntensity: 0.36,\n", "    sunIntensity: 4.5, sunColorHex: 0xfff3e0, hemiIntensity: 0.36,\n"],
  ],
  "copperMesa.ts": [
    ["  sky: { sunElevationDeg: 31, sunAzimuthDeg: 98, turbidity: 5.6, rayleigh: 1.1, mieCoefficient: 0.007, mieDirectionalG: 0.84, fogDensity: 0.00050, fogTintHex: 0xa8a49c, fogMix: 0.48, envIntensity: 0.2, cloudOpacity: 0.80, cloudOpacity2: 0.50, cloudTintHex: 0xf2e6d6, cloudAltM: 880, cloudHazeK: 0.00012, cloudUvM: 2700, cloudShadowAmp: 0.30, sunIntensity: 4.5, sunColorHex: 0xfff1df, hemiIntensity: 0.36 },\n", "  sky: { sunElevationDeg: 31, sunAzimuthDeg: 98, turbidity: 5.6, rayleigh: 1.1, mieCoefficient: 0.007, mieDirectionalG: 0.84, fogDensity: 0.00050, fogTintHex: 0xa8a49c, fogMix: 0.48, envIntensity: 0.2, cloudOpacity: 0.80, cloudOpacity2: 0.50, cloudTintHex: 0xf2e6d6, cloudAltM: 880, cloudHazeK: 0.00012, cloudUvM: 2700, cloudShadowAmp: 0.30, sunIntensity: 4.1, sunColorHex: 0xffe0b6, hemiIntensity: 0.36 },\n"],
  ],
  "delta.ts": [
    ["    sunIntensity: 4.39, sunColorHex: 0xffefd4, hemiIntensity: 0.34, postExposure: 0.95, // lighting 2026-09-13: key/fill back toward the 1049e4e ratio (was 3.55 / 0xffe7c5 / 0.42); the dimmer, warmer key with a high hemisphere fill read flat next to the reference at identical poses\n", "    sunIntensity: 4.1, sunColorHex: 0xfbeed6, hemiIntensity: 0.34, postExposure: 0.95, // lighting 2026-09-13: key/fill back toward the 1049e4e ratio (was 3.55 / 0xffe7c5 / 0.42); the dimmer, warmer key with a high hemisphere fill read flat next to the reference at identical poses\n"],
  ],
  "desert.ts": [
    ["    sunIntensity: 4.65, sunColorHex: 0xfff6ec, hemiIntensity: 0.28, // lighting_post r4: sun 3.30 -> 4.15, hemi 0.30 -> 0.20 (lee faces ~30% darker)\n", "    sunIntensity: 4.15, sunColorHex: 0xffe9c2, hemiIntensity: 0.28, // lighting_post r4: sun 3.30 -> 4.15, hemi 0.30 -> 0.20 (lee faces ~30% darker)\n"],
  ],
  "fjord.ts": [
    ["    sunIntensity: 4.09, sunColorHex: 0xffe5bf, hemiIntensity: 0.36, // lighting 2026-09-13: key/fill back toward the 1049e4e ratio (was 3.35 / 0xffdfbe / 0.52); the dimmer, warmer key with a high hemisphere fill read flat next to the reference at identical poses\n", "    sunIntensity: 4.2, sunColorHex: 0xf7ecd9, hemiIntensity: 0.36, // lighting 2026-09-13: key/fill back toward the 1049e4e ratio (was 3.35 / 0xffdfbe / 0.52); the dimmer, warmer key with a high hemisphere fill read flat next to the reference at identical poses\n"],
  ],
  "foundry.ts": [
    ["    sunIntensity: 0.86, sunColorHex: 0xfeffff, hemiIntensity: 0.36, postExposure: 0.96, // lighting 2026-09-13: key/fill back toward the 1049e4e ratio (was 3.8 / 0xffd6ad / 0.48); the dimmer, warmer key with a high hemisphere fill read flat next to the reference at identical poses\n", "    sunIntensity: 4.2, sunColorHex: 0xfde3c4, hemiIntensity: 0.36, postExposure: 0.96, // lighting 2026-09-13: key/fill back toward the 1049e4e ratio (was 3.8 / 0xffd6ad / 0.48); the dimmer, warmer key with a high hemisphere fill read flat next to the reference at identical poses\n"],
  ],
  "frontier.ts": [
    ["    sunIntensity: 4.42, sunColorHex: 0xffeed6, hemiIntensity: 0.38,\n", "    sunIntensity: 4.25, sunColorHex: 0xffebcf, hemiIntensity: 0.38,\n"],
  ],
  "longleaf.ts": [
    ["  sky: { ...frontier.sky, sunElevationDeg: 24, sunAzimuthDeg: 108, fogDensity: 0.00062, fogTintHex: 0x8f9f9c, fogMix: 0.52, cloudOpacity: 1.05, cloudOpacity2: 0.72, sunIntensity: 4.36, sunColorHex: 0xffecd2 },\n", "  sky: { ...frontier.sky, sunElevationDeg: 24, sunAzimuthDeg: 108, fogDensity: 0.00062, fogTintHex: 0x8f9f9c, fogMix: 0.52, cloudOpacity: 1.05, cloudOpacity2: 0.72, sunIntensity: 3.7 },\n"],
  ],
  "mangrove.ts": [
    ["  sky: { ...delta.sky, sunElevationDeg: 32, sunAzimuthDeg: 94, turbidity: 5.7, fogDensity: 0.00064, fogTintHex: 0x95b0b0, fogMix: 0.52, sunIntensity: 4.32, /* lighting 2026-09-13: was 3.7 */ cloudOpacity: 1.05, cloudOpacity2: 0.72, sunColorHex: 0xffecce },\n", "  sky: { ...delta.sky, sunElevationDeg: 32, sunAzimuthDeg: 94, turbidity: 5.7, fogDensity: 0.00064, fogTintHex: 0x95b0b0, fogMix: 0.52, sunIntensity: 4.0, /* lighting 2026-09-13: was 3.7 */ cloudOpacity: 1.05, cloudOpacity2: 0.72 },\n"],
  ],
  "monsoon.ts": [
    ["    sunIntensity: 3.96, sunColorHex: 0xffe3b8, hemiIntensity: 0.46, postExposure: 0.96, // lighting 2026-09-13: key/fill back toward the 1049e4e ratio (was 2.9 / 0xffdfc0 / 0.54); the dimmer, warmer key with a high hemisphere fill read flat next to the reference at identical poses\n", "    sunIntensity: 3.6, sunColorHex: 0xfae8d0, hemiIntensity: 0.46, postExposure: 0.96, // lighting 2026-09-13: key/fill back toward the 1049e4e ratio (was 2.9 / 0xffdfc0 / 0.54); the dimmer, warmer key with a high hemisphere fill read flat next to the reference at identical poses\n"],
  ],
  "oasis.ts": [
    ["  sky: { ...desert.sky, sunElevationDeg: 22, sunAzimuthDeg: 104, turbidity: 5.2, fogDensity: 0.00052, fogTintHex: 0xb3ada3, fogMix: 0.46, cloudOpacity: 0.78, cloudOpacity2: 0.48, cloudAltM: 820, cloudHazeK: 0.00012, cloudUvM: 2900, cloudShadowAmp: 0.24, sunIntensity: 4.41, hemiIntensity: 0.40, sunColorHex: 0xffefde },\n", "  sky: { ...desert.sky, sunElevationDeg: 22, sunAzimuthDeg: 104, turbidity: 5.2, fogDensity: 0.00052, fogTintHex: 0xb3ada3, fogMix: 0.46, cloudOpacity: 0.78, cloudOpacity2: 0.48, cloudAltM: 820, cloudHazeK: 0.00012, cloudUvM: 2900, cloudShadowAmp: 0.24, sunIntensity: 4.0, hemiIntensity: 0.40 },\n"],
  ],
  "orchard.ts": [
    ["  sky: { ...verdant.sky, sunElevationDeg: 28, sunAzimuthDeg: 132, turbidity: 4.5, fogDensity: 0.00058, fogTintHex: 0x99aaac, fogMix: 0.5, cloudOpacity: 0.95, cloudOpacity2: 0.62, sunIntensity: 4.45, hemiIntensity: 0.42, sunColorHex: 0xffefd9 },\n", "  sky: { ...verdant.sky, sunElevationDeg: 28, sunAzimuthDeg: 132, turbidity: 4.5, fogDensity: 0.00058, fogTintHex: 0x99aaac, fogMix: 0.5, cloudOpacity: 0.95, cloudOpacity2: 0.62, sunIntensity: 3.9, hemiIntensity: 0.42 },\n"],
  ],
  "polders.ts": [
    ["  sky: { sunElevationDeg: 23, sunAzimuthDeg: 148, turbidity: 4.8, rayleigh: 1.5, mieCoefficient: 0.006, mieDirectionalG: 0.82, fogDensity: 0.00062, fogTintHex: 0x96a8ad, fogMix: 0.54, envIntensity: 0.24, cloudOpacity: 1.1, cloudOpacity2: 0.72, cloudTintHex: 0xe7eded, cloudAltM: 420, cloudHazeK: 0.00016, cloudUvM: 2600, cloudShadowAmp: 0.18, sunIntensity: 4.25, sunColorHex: 0xffe8c7, hemiIntensity: 0.43 },\n", "  sky: { sunElevationDeg: 23, sunAzimuthDeg: 148, turbidity: 4.8, rayleigh: 1.5, mieCoefficient: 0.006, mieDirectionalG: 0.82, fogDensity: 0.00062, fogTintHex: 0x96a8ad, fogMix: 0.54, envIntensity: 0.24, cloudOpacity: 1.1, cloudOpacity2: 0.72, cloudTintHex: 0xe7eded, cloudAltM: 420, cloudHazeK: 0.00016, cloudUvM: 2600, cloudShadowAmp: 0.18, sunIntensity: 3.7, sunColorHex: 0xffe9ca, hemiIntensity: 0.43 },\n"],
  ],
  "railyard.ts": [
    ["    sunIntensity: 0.55, sunColorHex: 0xf9fcff, hemiIntensity: 0.85,\n", "    sunIntensity: 1.35, sunColorHex: 0xd9dad6, hemiIntensity: 0.85,\n"],
  ],
  "reservoir.ts": [
    ["  sky: { ...frontier.sky, sunElevationDeg: 26, sunAzimuthDeg: 142, turbidity: 4.2, fogDensity: 0.00058, fogTintHex: 0x91a8b5, fogMix: 0.5, cloudOpacity: 1.0, cloudOpacity2: 0.66, sunIntensity: 4.41, hemiIntensity: 0.43, sunColorHex: 0xffedd5 },\n", "  sky: { ...frontier.sky, sunElevationDeg: 26, sunAzimuthDeg: 142, turbidity: 4.2, fogDensity: 0.00058, fogTintHex: 0x91a8b5, fogMix: 0.5, cloudOpacity: 1.0, cloudOpacity2: 0.66, sunIntensity: 3.8, hemiIntensity: 0.43 },\n"],
  ],
  "ruinspires.ts": [
    ["    sunIntensity: 4.29, sunColorHex: 0xffedd5, hemiIntensity: 0.34, postExposure: 0.94,\n", "    sunIntensity: 3.8, sunColorHex: 0xffd0aa, hemiIntensity: 0.34, postExposure: 0.94,\n"],
  ],
  "saltwind.ts": [
    ["  sky: { ...coastal.sky, sunElevationDeg: 30, sunAzimuthDeg: 112, turbidity: 3.9, fogDensity: 0.00052, fogTintHex: 0x9cb8c5, fogMix: 0.48, cloudOpacity: 0.86, cloudOpacity2: 0.5, sunIntensity: 4.35, hemiIntensity: 0.42, sunColorHex: 0xffeaca },\n", "  sky: { ...coastal.sky, sunElevationDeg: 30, sunAzimuthDeg: 112, turbidity: 3.9, fogDensity: 0.00052, fogTintHex: 0x9cb8c5, fogMix: 0.48, cloudOpacity: 0.86, cloudOpacity2: 0.5, sunIntensity: 3.95, hemiIntensity: 0.42 },\n"],
  ],
  "skybridge.ts": [
    ["    sunIntensity: 4.28, sunColorHex: 0xffedd4, hemiIntensity: 0.31, postExposure: 0.93,\n", "    sunIntensity: 3.85, sunColorHex: 0xffc19a, hemiIntensity: 0.31, postExposure: 0.93,\n"],
  ],
  "steppe.ts": [
    ["    sunIntensity: 4.61, sunColorHex: 0xfff3e4, hemiIntensity: 0.30,\n", "    sunIntensity: 4.25, sunColorHex: 0xfff0d6, hemiIntensity: 0.30,\n"],
  ],
  "titanGorge.ts": [
    ["    sunIntensity: 0.43, sunColorHex: 0xf6fbff, hemiIntensity: 0.28, postExposure: 0.93,\n", "    sunIntensity: 4.15, sunColorHex: 0xffc89b, hemiIntensity: 0.28, postExposure: 0.93,\n"],
  ],
  "urban.ts": [
    ["    sunIntensity: 4.53, sunColorHex: 0xfff0db, hemiIntensity: 0.36,\n", "    sunIntensity: 4.2, sunColorHex: 0xffedd6, hemiIntensity: 0.36,\n"],
  ],
  "whiteout.ts": [
    ["  sky: { ...winter.sky, sunElevationDeg: 13, sunAzimuthDeg: 164, fogDensity: 0.00072, fogTintHex: 0xb3bfc9, fogMix: 0.56, cloudOpacity: 1.15, cloudOpacity2: 0.86, cloudAltM: 300, cloudHazeK: 0.00012, cloudUvM: 2000, cloudShadowAmp: 0.08, sunIntensity: 0.24, hemiIntensity: 0.58,\n    postExposure: 0.83 /* round 70: 0.86 (winter's) \u2192 0.83, the snow re-grade's exposure half */, sunColorHex: 0xf6fbff },\n", "  sky: { ...winter.sky, sunElevationDeg: 13, sunAzimuthDeg: 164, fogDensity: 0.00072, fogTintHex: 0xb3bfc9, fogMix: 0.56, cloudOpacity: 1.15, cloudOpacity2: 0.86, cloudAltM: 300, cloudHazeK: 0.00012, cloudUvM: 2000, cloudShadowAmp: 0.08, sunIntensity: 2.75, hemiIntensity: 0.58,\n    postExposure: 0.83 /* round 70: 0.86 (winter's) \u2192 0.83, the snow re-grade's exposure half */ },\n"],
  ],
  "winter.ts": [
    ["    sunIntensity: 1.06, sunColorHex: 0xfffdf9, hemiIntensity: 0.74, postExposure: 0.86,\n", "    sunIntensity: 1.35, sunColorHex: 0xdfe7f2, hemiIntensity: 0.74, postExposure: 0.86,\n"],
  ],
};

/** The sun leaves every map resolved to before the derivation (sunIntensity, sunColorHex). */
export const LIGHT_MODEL_SUN_PREVIOUS = {
  verdant: [4.5, 0xfff1dc],
  desert: [4.15, 0xffe9c2],
  winter: [1.35, 0xdfe7f2],
  urban: [4.2, 0xffedd6],
  coastal: [4.5, 0xfff3e0],
  autumn: [4.3, 0xffe6bd],
  steppe: [4.25, 0xfff0d6],
  railyard: [1.35, 0xd9dad6],
  frontier: [4.25, 0xffebcf],
  fjord: [4.2, 0xf7ecd9],
  delta: [4.1, 0xfbeed6],
  badlands: [4.25, 0xffd4ad],
  monsoon: [3.6, 0xfae8d0],
  alpine: [4.2, 0xf8eedb],
  caldera: [4, 0xffc9a0],
  foundry: [4.2, 0xfde3c4],
  ruinspires: [3.8, 0xffd0aa],
  blackglass: [3.9, 0xffc697],
  titan_gorge: [4.15, 0xffc89b],
  skybridge: [3.85, 0xffc19a],
  polders: [3.7, 0xffe9ca],
  copper_mesa: [4.1, 0xffe0b6],
  airfield: [4, 0xffedda],
  oasis: [4, 0xffe9c2],
  whiteout: [2.75, 0xdfe7f2],
  orchard: [3.9, 0xfff1dc],
  longleaf: [3.7, 0xffebcf],
  mangrove: [4, 0xfbeed6],
  saltwind: [3.95, 0xfff3e0],
  reservoir: [3.8, 0xffebcf],
  mars: [3.2, 0xe4ebff],
  moon: [3.5, 0xf1f4ff],
  cliffbridge: [3.5, 0xfff0d9],
};

export function historicalLightModelSkySource(source, file) {
  const pairs = LIGHT_MODEL_SKY_EDITS[file];
  if (!pairs) return source;
  for (const [current, historical] of pairs) {
    assert.equal(source.split(current).length, 2, `${file}: one exact 2026-10-01 light-model sky edit`);
    source = source.replace(current, () => historical);
  }
  return source;
}

/** A config's sky with the derived sun authenticated and its two leaves projected to their previous values. */
export function previousSunSky(config, id) {
  const previous = LIGHT_MODEL_SUN_PREVIOUS[id];
  if (!previous || id === 'mars' || id === 'moon') return config.sky;
  const derived = deriveSunForPreset({ ...DEFAULT_SKY_PRESET, ...config.sky, cloudscape: config.clouds ?? null });
  assert.equal(config.sky.sunIntensity, +derived.intensity.toFixed(2), `${id}: the sky block carries its derived sun`);
  assert.equal(config.sky.sunColorHex, derived.colorHex, `${id}: the derived sun colour`);
  return { ...config.sky, sunIntensity: previous[0], sunColorHex: previous[1] };
}

/** The whole config with its sky projected (previousSunSky), for the receipts that hash every map's inputs. */
export function previousSunConfig(config) {
  return config?.sky && config.id ? { ...config, sky: previousSunSky(config, config.id) } : config;
}
