/**
 * lightModel.ts — the grounded light model (2026-10-01, the visual redesign's lighting lane).
 *
 * One pure function turns a map's sky preset (sun, atmosphere, cloud cover, the optional `lighting` block) and the
 * physically based sky the atmosphere rendered (atmosphere.ts, its summary readback) into the light the renderer
 * applies: the direct sun, the image-based sky light, the overcast dome, the ground the sky sees below the horizon,
 * the exposure and the subtle per-map grade. No DOM, no WebGL: the receipt and the offline tools run it in Node.
 *
 * The model, in the engine's light units (a directional light of intensity 1 gives irradiance 1):
 *
 *   sun        E0 · T(sun) · (1 − 0.9 · overcast)    T = the atmosphere's transmittance toward the sun (the same medium
 *                                                    and march as the transmittance LUT, integrated here on the CPU), E0
 *                                                    LIGHT_SOLAR_IRRADIANCE: the solar constant in light units, fixed so
 *                                                    Verdant's 32° sun keeps the key every material was authored under;
 *                                                    the colour is T, through an overcast deck greyed toward cloud light.
 *                                                    Derived on every preset, never read from it: a map's sun follows its
 *                                                    own elevation, atmosphere and cloudscape whoever edits them, and the
 *                                                    authored sunIntensity / sunColorHex light only the night (the moon)
 *                                                    and the legacy rig
 *   sky        the PMREM of the sky dome itself, baked without the sun disc and without the display knee (sky.ts), at
 *              environment intensity 1 so a mirror reflects the sky the dome shows; its diffuse share takes
 *              SKY_DIFFUSE_GAIN on top (the aerosol and fair-weather cloud light the round-65 visual calibration
 *              left out of the clean sky: the shade under a clear sky is lit about a quarter as strongly as the sun
 *              lights open ground, not a ninth), and the clear sky's share fades under an overcast deck
 *   overcast   the deck's own diffuse light, the hemisphere light's new role: the sunlight and skylight the cloud
 *              transmits, neutral grey from above, the ground's reflection from below
 *   ground     below the horizon the environment shows the shaded ground (its albedo under the sky light); the sunlit
 *              excess reaches the faces turned to the ground through groundBounce.ts
 *   exposure   a camera that adapts part of the way: EXPOSURE_KEY · (E_ref / E)^ADAPTATION, E the horizontal
 *              illuminance (sun + sky + deck); a darker scene reads darker, never black, a brighter one never blows
 *
 * The retired terms: the anti-sun "rescue" fill (a second, unshadowed sun on every backlit face), the legacy disc
 * folded into the environment's diffuse mip (a shadowless sun-direction fill), the constant-hue hemisphere floor and
 * the environment floor. The mobile tier, whose dome is the Preetham fallback with no summary readback, keeps its
 * authored rig (`mode: 'legacy'`), and so do a galaxy sky (the space maps: a dome dimmed to the stars over an authored
 * daylight key, not a sky that lights the ground) and the Garage's enclosed bay (lighting.ts).
 */
import { ATMO_GROUND_KM, ATMO_MEDIUM, ATMO_STEPS, ATMO_TOP_KM, type AtmosphereParams } from './atmosphere.ts';
import { CLOUDSCAPE_REGIMES, type CloudscapeConfig } from './cloudscapes.ts';

export type Rgb = readonly [number, number, number];

/** The per-map lighting block (a map's sky preset may carry it; every field is optional). */
export interface LightingConfig {
  /** 0..1 overcast fraction (a closed deck that casts no cloud shadows); default from the cloudscape. */
  overcast?: number;
  /** EV offset on the exposure law (+1 = one stop brighter): high-key snow and sand keep their white. */
  exposureEV?: number;
  /** Multiplier on the sky's diffuse light (1 = the global SKY_DIFFUSE_GAIN). */
  skyLight?: number;
  /** The ground's albedo (sRGB hex): the environment below the horizon and the bounce onto faces turned to it. */
  groundAlbedoHex?: number;
  /** Grade white balance −1 (cool) .. +1 (warm); ±0.1 is a subtle climate shift. */
  warmth?: number;
  /** Grade saturation multiplier (1 = the look's own). */
  saturation?: number;
  /** Grade contrast multiplier on the look's power (1 = the look's own). */
  contrast?: number;
}

/** The sky preset fields the model reads (a subset of sky.ts's SkyPreset plus the battle path's cloudscape). */
export interface LightModelPreset {
  sunElevationDeg?: number;
  skyIntensity?: number;
  cloudOpacity?: number;
  cloudOpacity2?: number;
  turbidity?: number;
  /** A forced night sky (sky.ts): with a daylight key it is a galaxy dome — the space maps — not the night. */
  nightSky?: number | null;
  /** The legacy rig's authored values (the mobile tier, a galaxy sky, the night's moon). */
  sunIntensity?: number;
  sunColorHex?: number;
  hemiIntensity?: number;
  fillIntensity?: number;
  envIntensity?: number;
  postExposure?: number;
  lighting?: LightingConfig | null;
  cloudscape?: CloudscapeConfig | null;
}

/** The sky the atmosphere rendered: its raw (un-kneed) cosine-weighted irradiance / π, already × skyIntensity. */
export interface LightModelSky {
  irradianceRaw: Rgb;
}

export interface LightModel {
  /** 'physical' when the atmosphere's summary drives it; 'legacy' keeps the authored rig. */
  mode: 'physical' | 'legacy';
  sunIntensity: number;
  /** Linear RGB of the sun in the authored convention (brightest channel 1): irradiance = intensity × colour. */
  sunColor: Rgb;
  /** scene.environmentIntensity: the sky's specular (and base diffuse) scale. */
  envIntensity: number;
  /** Extra factor on the environment's diffuse share (the CSM lit materials, lighting.ts). */
  envDiffuseGain: number;
  hemiIntensity: number;
  hemiSky: Rgb;
  hemiGround: Rgb;
  fillIntensity: number;
  /** Linear albedo of the ground. */
  groundAlbedo: Rgb;
  /** The environment's radiance below the horizon, in the dome's units (sky.ts's env bake). */
  groundRadiance: Rgb;
  overcast: number;
  /** Horizontal illuminance (luminance, light units) the exposure law meters. */
  illuminance: number;
  /** Linear exposure multiplier applied before the tone curve (post.ts). */
  exposure: number;
  /** Linear white-balance gains (luminance-preserving) for the grade. */
  whiteBalance: Rgb;
  saturation: number;
  contrast: number;
  /** 0..1 night (the dome dimmed to a moonlit sky): the grade's scotopic shift (low light loses colour toward blue). */
  night: number;
  /**
   * 0..1 share of the vehicles' shade readability lift (materials.ts vehicleAmbientFloorHook: a view fill and an
   * absolute luminance floor for faces the sun leaves dark) this light still needs: the floor is scene-linear, so as
   * the camera opens up it would land brighter on screen, and under an overcast deck no face is in the deep shade the
   * lift was built for — it flattened every hull to pastel clay there. 1 on the legacy rig (its calibration).
   */
  vehicleReadability: number;
}

/**
 * The solar constant in light units: Verdant's 32° sun through its atmosphere lands on the authored key every
 * material was tuned under (4.5 × 0xfff1dc = irradiance luminance 4.02 over a transmittance of 0.806).
 */
export const LIGHT_SOLAR_IRRADIANCE = 4.99;
/** Diffuse sky light over the dome's own radiance (aerosol + fair-weather cloud light the clean sky lacks). */
export const SKY_DIFFUSE_GAIN = 1.45;
/** Share of the direct sun an overcast deck removes at overcast 1. */
export const OVERCAST_DIRECT_CUT = 0.9;
/** Share of the clear sky's light an overcast deck replaces at overcast 1. */
export const OVERCAST_SKY_CUT = 0.85;
/** Diffuse transmission of the deck: the share of the clear-sky horizontal light it passes on as its own glow. */
export const OVERCAST_TRANSMISSION = 0.42;
/** The deck's light: a neutral grey, a touch cool (linear, luminance ≈ 1; overcast daylight ≈ 6500–7000 K). */
export const OVERCAST_LIGHT_COLOR: Rgb = Object.freeze([0.96, 1.0, 1.04]) as Rgb;
/**
 * The night's own sky light (horizontal irradiance at full night, light units): the moonlit sky, airglow and the
 * scattered light of a populated horizon that keep a moonlit field readable — the dome's 8 % moonlit sky alone
 * lights the shade about a tenth as strongly as the moon lights open ground, which reads as a black void on a screen.
 */
export const NIGHT_SKY_GLOW = 0.16;
/** The camera's night offset (EV at full night): a moonlit scene sits a little over two stops under the day. */
export const NIGHT_EV = -0.5;
/** Its colour: the blue of a moonlit sky (linear, luminance ≈ 1). */
export const NIGHT_GLOW_COLOR: Rgb = Object.freeze([0.72, 0.95, 1.38]) as Rgb;
/** Temperate ground (dry grass and soil), linear. */
export const DEFAULT_GROUND_ALBEDO: Rgb = Object.freeze([0.21, 0.18, 0.11]) as Rgb;
/** Exposure law: the key that lands Verdant's lit midtones, its reference illuminance and the adaptation share. */
export const EXPOSURE_KEY = 1.5;
export const EXPOSURE_REFERENCE_ILLUMINANCE = 3.0;
export const EXPOSURE_ADAPTATION = 0.6;
/** The camera's adaptation bounds around its key (a night scene stays a night scene, a snowfield never goes grey). */
export const EXPOSURE_MIN = 0.45;
export const EXPOSURE_MAX = 2.6;
/** How much of the vehicle readability lift an overcast deck of 1 removes (the deck lights every face). */
export const READABILITY_OVERCAST_FADE = 0.7;
/** The legacy rig's exposure in the new curve's terms (mobile tier, a failed summary). */
export const LEGACY_EXPOSURE = 1.5;
/** The engine defaults the legacy rig falls back to (lighting.ts). */
const LEGACY_SUN = 4.5;
const LEGACY_SUN_HEX = 0xfff1dc;
const LEGACY_HEMI = 0.36;
const LEGACY_FILL = 0.66;
const LEGACY_ENV = 0.2;
const LEGACY_ENV_FLOOR = 0.21;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** QA hook: a page may set window.__LIGHT_TUNE (numbers keyed by the constant names below) to try other constants live;
 * the A/B probes re-apply the preset afterwards. Absent in production: every read falls back to the constant. */
export function lightTune(name: string, fallback: number): number {
  try {
    const tune = (globalThis as { __LIGHT_TUNE?: Record<string, number> }).__LIGHT_TUNE;
    const value = tune?.[name];
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  } catch {
    return fallback;
  }
}
const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const luminance = (c: Rgb): number => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

/** sRGB hex → linear RGB (the THREE.Color conversion, without THREE). */
export function hexToLinear(hex: number): Rgb {
  const ch = (v: number): number => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return [ch((hex >> 16) & 255), ch((hex >> 8) & 255), ch(hex & 255)];
}

/** Linear RGB → sRGB hex (rounded). */
export function linearToHex(c: Rgb): number {
  const ch = (v: number): number => {
    const x = clamp(v, 0, 1);
    const s = x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
    return Math.round(clamp(s, 0, 1) * 255);
  };
  return (ch(c[0]) << 16) | (ch(c[1]) << 8) | ch(c[2]);
}

/**
 * Transmittance from the viewer toward a direction of elevation sine `mu` — the atmosphere's medium (atmosphere.ts
 * ATMO_MEDIUM, scaled by the preset's parameters) marched to the top of the atmosphere, the transmittance LUT's own
 * integral (it agrees with the LUT texel to its bilinear error).
 */
export function atmosphereTransmittance(p: AtmosphereParams, mu: number, steps = ATMO_STEPS.transmittance): [number, number, number] {
  const r = ATMO_GROUND_KM + p.viewHeightKm;
  const m = clamp(mu, -1, 1);
  const dx = Math.sqrt(Math.max(1 - m * m, 0)), dy = m;
  // ray from (0, r) along (dx, dy) to the sphere of radius ATMO_TOP_KM
  const b = r * dy;
  const c = r * r - ATMO_TOP_KM * ATMO_TOP_KM;
  const tMax = -b + Math.sqrt(Math.max(b * b - c, 0));
  // a ray into the ground (below the horizon past the tangent) sees no sun
  const cg = r * r - ATMO_GROUND_KM * ATMO_GROUND_KM;
  if (dy < 0 && b * b - cg >= 0 && -b - Math.sqrt(b * b - cg) > 0) return [0, 0, 0];
  const dt = tMax / steps;
  const M = ATMO_MEDIUM;
  const od = [0, 0, 0];
  for (let i = 0; i < steps; i++) {
    const t = (i + 0.5) * dt;
    const h = Math.hypot(dx * t, r + dy * t) - ATMO_GROUND_KM;
    const rayD = Math.exp(-h / M.rayleighScaleHeightKm);
    const mieD = Math.exp(-h / M.mieScaleHeightKm);
    const ozD = Math.max(0, 1 - Math.abs(h - M.ozoneCentreKm) / M.ozoneHalfWidthKm);
    for (let k = 0; k < 3; k++) {
      od[k] += (M.rayleighScattering[k] * rayD * p.rayleighScale
        + M.mieExtinction * mieD * p.mieScale
        + M.ozoneAbsorption[k] * ozD * p.ozoneScale) * dt;
    }
  }
  return [Math.exp(-od[0]), Math.exp(-od[1]), Math.exp(-od[2])];
}

/**
 * The deck's overcast fraction: an authored `lighting.overcast`, else the cloudscape (a regime that casts no cloud
 * shadows — a stratiform deck — by its coverage), else the legacy deck rule (both baked decks near-opaque under a
 * turbid sky: winter's preset).
 */
export function resolveOvercast(preset: LightModelPreset): number {
  const authored = preset.lighting?.overcast;
  if (typeof authored === 'number' && Number.isFinite(authored)) return clamp(authored, 0, 1);
  const scape = preset.cloudscape;
  if (scape) {
    const row = scape.regime ? CLOUDSCAPE_REGIMES[scape.regime] : null;
    const shadow = scape.shadow ?? row?.shadow ?? true;
    const coverage = scape.coverage ?? row?.coverage ?? 0;
    return shadow ? 0 : smoothstep(0.6, 0.97, coverage);
  }
  const legacy = (preset.cloudOpacity ?? 1) >= 0.95 && (preset.cloudOpacity2 ?? 0.42) >= 0.9 && (preset.turbidity ?? 4) >= 7;
  return legacy ? 0.8 : 0;
}

/**
 * The physical sun of a preset through its atmosphere and deck, in the authored convention: a colour whose
 * brightest channel is 1 (an sRGB hex with a 0xff channel) and an intensity such that intensity × luminance(colour)
 * is the irradiance luminance — exactly how the map presets write `sunIntensity` / `sunColorHex`.
 */
export function deriveSun(
  p: AtmosphereParams, overcast: number, solar = LIGHT_SOLAR_IRRADIANCE,
): { intensity: number; color: Rgb; colorHex: number } {
  const T = atmosphereTransmittance(p, p.sunDir[1]);
  const lumT = luminance(T);
  if (!(lumT > 1e-6)) return { intensity: 0, color: [1, 1, 1], colorHex: 0xffffff };
  const o = clamp(overcast, 0, 1);
  const tint: Rgb = [T[0] / lumT, T[1] / lumT, T[2] / lumT];
  const grey = OVERCAST_LIGHT_COLOR;
  const mixed = [tint[0] + (grey[0] - tint[0]) * o, tint[1] + (grey[1] - tint[1]) * o, tint[2] + (grey[2] - tint[2]) * o];
  const peak = Math.max(mixed[0], mixed[1], mixed[2]);
  const color: Rgb = [mixed[0] / peak, mixed[1] / peak, mixed[2] / peak];
  const colorHex = linearToHex(color);
  const quantized = hexToLinear(colorHex);
  const irradiance = lightTune('LIGHT_SOLAR_IRRADIANCE', solar) * lumT * (1 - lightTune('OVERCAST_DIRECT_CUT', OVERCAST_DIRECT_CUT) * o);
  return { intensity: irradiance / luminance(quantized), color: quantized, colorHex };
}

/** The white-balance gains of a warmth value (luminance-preserving; +1 ≈ a 1500 K warmer grade). */
export function whiteBalanceGains(warmth: number): Rgb {
  const w = clamp(warmth, -1, 1);
  const g: Rgb = [1 + 0.16 * w, 1 + 0.01 * w, 1 - 0.2 * w];
  const l = luminance(g);
  return [g[0] / l, g[1] / l, g[2] / l];
}

/** How much of the night a dome intensity means: full at the night preset's .08, none from .30 (sky.ts nightAmount). */
export function nightFor(skyIntensity: number): number {
  return clamp((0.30 - skyIntensity) / 0.22, 0, 1);
}

/** A galaxy sky: the dome forced to the stars under an authored daylight key (Olympus Basin, Earthrise Basin). */
export function isGalaxySky(preset: LightModelPreset): boolean {
  return (preset.nightSky ?? 0) > 0.5;
}

/** The night amount of a preset: the dome's, never a galaxy sky's (its key is daylight). */
function nightOf(preset: LightModelPreset): number {
  return isGalaxySky(preset) ? 0 : nightFor(preset.skyIntensity ?? 1);
}

/** The exposure the law gives a horizontal illuminance (and an authored EV offset). */
export function exposureFor(illuminance: number, exposureEV = 0): number {
  const e = Math.max(illuminance, 1e-4);
  const ratio = Math.pow(lightTune('EXPOSURE_REFERENCE_ILLUMINANCE', EXPOSURE_REFERENCE_ILLUMINANCE) / e, lightTune('EXPOSURE_ADAPTATION', EXPOSURE_ADAPTATION));
  return lightTune('EXPOSURE_KEY', EXPOSURE_KEY) * clamp(ratio, lightTune('EXPOSURE_MIN', EXPOSURE_MIN), lightTune('EXPOSURE_MAX', EXPOSURE_MAX))
    * Math.pow(2, clamp(exposureEV, -3, 3));
}

function legacyModel(preset: LightModelPreset): LightModel {
  const hemiPreset = preset.hemiIntensity ?? LEGACY_HEMI;
  const hemiFloor = 0.15 * Math.min(1, Math.max(0.5, hemiPreset / LEGACY_HEMI));
  const ground = DEFAULT_GROUND_ALBEDO;
  return {
    mode: 'legacy',
    sunIntensity: preset.sunIntensity ?? LEGACY_SUN,
    sunColor: hexToLinear(preset.sunColorHex ?? LEGACY_SUN_HEX),
    envIntensity: Math.max(preset.envIntensity ?? LEGACY_ENV, LEGACY_ENV_FLOOR),
    envDiffuseGain: 1,
    hemiIntensity: hemiPreset + hemiFloor,
    hemiSky: hexToLinear(0xaac8f5),
    hemiGround: hexToLinear(0x94815f),
    fillIntensity: preset.fillIntensity ?? LEGACY_FILL,
    groundAlbedo: ground,
    groundRadiance: [0, 0, 0],
    overcast: resolveOvercast(preset),
    illuminance: EXPOSURE_REFERENCE_ILLUMINANCE,
    exposure: lightTune('LEGACY_EXPOSURE', LEGACY_EXPOSURE) * (preset.postExposure ?? 1),
    whiteBalance: [1, 1, 1],
    saturation: 1,
    contrast: 1,
    night: nightOf(preset),
    vehicleReadability: 1,
  };
}

/**
 * Resolve the light. `sky` is the atmosphere's summary; without it (the Preetham tier, a failed readback), and for a
 * galaxy sky, the authored legacy rig is returned unchanged. `sun` is the preset's authored key (a map's values, a
 * weather preset's): the legacy rig's sun and, under the physical model, the night's moon — by day and at the low sun
 * the model's own derivation lights the scene.
 */
export function resolveLightModel(
  preset: LightModelPreset,
  params: AtmosphereParams | null,
  sky: LightModelSky | null,
  sun: { intensity: number; colorHex: number } | null = null,
): LightModel {
  if (!params || !sky || isGalaxySky(preset)) return legacyModel(preset);
  const L = preset.lighting ?? {};
  const overcast = resolveOvercast(preset);
  const derived = deriveSun(params, overcast);
  // the night: the dome dimmed to a moonlit sky. The direct light is the authored moon there, the derived sun by day,
  // blended by the night amount (the presets sit at its ends: day and sunset 0, the night preset 1)
  const night = nightOf(preset);
  const moon = sun ? { intensity: sun.intensity, color: hexToLinear(sun.colorHex) } : { intensity: derived.intensity, color: derived.color };
  const sunIntensity = derived.intensity + (moon.intensity - derived.intensity) * night;
  const sunColor: Rgb = [0, 1, 2].map((c) => derived.color[c] + (moon.color[c] - derived.color[c]) * night) as unknown as Rgb;
  const sunIrradiance = sunIntensity * luminance(sunColor);
  const sinEl = Math.max(0, params.sunDir[1]);
  // the clear sky (the env bake's dome, in its own units, × skyIntensity already) and its light
  const irr = sky.irradianceRaw;
  const clearShare = 1 - lightTune('OVERCAST_SKY_CUT', OVERCAST_SKY_CUT) * overcast;
  const envIntensity = clearShare;
  const envDiffuseGain = lightTune('SKY_DIFFUSE_GAIN', SKY_DIFFUSE_GAIN) * (L.skyLight ?? 1);
  const skyLightH = Math.PI * luminance(irr) * envIntensity * envDiffuseGain;
  // the deck's glow: the clear-sky horizontal light it transmits (sun + sky as if the deck were absent)
  // (by night the moon the deck would pass: the authored key is the moonlight as seen, never cut)
  const clearSun = derived.intensity * luminance(derived.color) / Math.max(1 - OVERCAST_DIRECT_CUT * overcast, 1e-3);
  const clearSunH = (clearSun + (moon.intensity * luminance(moon.color) - clearSun) * night) * sinEl;
  const clearSkyH = Math.PI * luminance(irr) * envDiffuseGain;
  const deckGlow = overcast * lightTune('OVERCAST_TRANSMISSION', OVERCAST_TRANSMISSION) * (clearSunH + clearSkyH);
  // at night the hemisphere also carries the night sky's own glow (NIGHT_SKY_GLOW), blended into its colour by share
  const nightGlow = night * lightTune('NIGHT_SKY_GLOW', NIGHT_SKY_GLOW);
  const hemiIntensity = deckGlow + nightGlow;
  const glowShare = hemiIntensity > 1e-6 ? nightGlow / hemiIntensity : 0;
  const hemiSky: Rgb = [0, 1, 2].map((c) => OVERCAST_LIGHT_COLOR[c] + (NIGHT_GLOW_COLOR[c] - OVERCAST_LIGHT_COLOR[c]) * glowShare) as unknown as Rgb;
  const ground = L.groundAlbedoHex != null ? hexToLinear(L.groundAlbedoHex) : DEFAULT_GROUND_ALBEDO;
  // the deck's light from below is its reflection off the ground: the hemisphere's ground pole is the albedo itself
  const hemiGround: Rgb = [ground[0], ground[1], ground[2]];
  const illuminance = sunIrradiance * sinEl + skyLightH + hemiIntensity;
  const exposure = exposureFor(illuminance, (L.exposureEV ?? 0) + night * lightTune('NIGHT_EV', NIGHT_EV));
  // the readability lift's floor holds its on-screen level as the camera adapts (Verdant's key keeps it whole), and
  // fades with the deck that lights the shade itself
  const vehicleReadability = clamp(Math.min(1, lightTune('EXPOSURE_KEY', EXPOSURE_KEY) / exposure)
    * (1 - lightTune('READABILITY_OVERCAST_FADE', READABILITY_OVERCAST_FADE) * overcast), 0.1, 1);
  return {
    mode: 'physical',
    sunIntensity,
    sunColor,
    envIntensity,
    envDiffuseGain,
    hemiIntensity,
    hemiSky,
    hemiGround,
    fillIntensity: 0,
    groundAlbedo: ground,
    groundRadiance: [ground[0] * irr[0], ground[1] * irr[1], ground[2] * irr[2]],
    overcast,
    illuminance,
    exposure,
    whiteBalance: whiteBalanceGains(L.warmth ?? 0),
    saturation: L.saturation ?? 1,
    contrast: L.contrast ?? 1,
    night,
    vehicleReadability,
  };
}
