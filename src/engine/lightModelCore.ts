/**
 * lightModelCore.ts — the boot half of the light model (2026-10-02, the boot-weight pass): its types, the authored
 * (legacy) rig that the Garage's enclosed bay, the Preetham tier and a galaxy sky keep, the QA tuning hook, and the
 * hand-off to the grounded model (lightModel.ts). The grounded model (the atmosphere integral, the derived sun, the
 * exposure law) lights only an open sky, so it loads behind the battle entry (loadGroundedLightModel: the battle
 * atmosphere's covered acquisition and the capture staging await it), and the core hands it the atmosphere it integrates,
 * so its chunk imports nothing at runtime. Until it is loaded every resolve is the authored rig, which is exactly the
 * light of every presentation that never loads it. No DOM, no WebGL.
 */
import { CLOUDSCAPE_REGIMES, type CloudscapeConfig } from './cloudscapes.ts';
import { ATMO_GROUND_KM, ATMO_MEDIUM, ATMO_STEPS, ATMO_TOP_KM, type AtmosphereParams } from './atmosphere.ts';

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
  /** The share of the sky's hue the environment's diffuse share keeps about its luminance (groundBounce.ts uCotSkyChroma). */
  envDiffuseChroma: number;
  hemiIntensity: number;
  hemiSky: Rgb;
  hemiGround: Rgb;
  fillIntensity: number;
  /** Linear albedo of the ground. */
  groundAlbedo: Rgb;
  /** The environment's radiance below the horizon, in the dome's units (sky.ts's env bake). */
  groundRadiance: Rgb;
  overcast: number;
  /**
   * 2026-10-05 (the skies lane): how closed the deck is (resolveDeckClosure) — the share of the overcast's direct cut the
   * sun takes uniformly; a deck with gaps casts the rest as the cloud shade map's pattern (the sun out in its gaps).
   */
  deckClosure: number;
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


/** Temperate ground (dry grass and soil), linear. */
export const DEFAULT_GROUND_ALBEDO: Rgb = Object.freeze([0.21, 0.18, 0.11]) as Rgb;
/** The exposure law's reference illuminance (lightModel.ts; the legacy rig meters it too). */
export const EXPOSURE_REFERENCE_ILLUMINANCE = 3.0;
/** The legacy rig's exposure in the new curve's terms (mobile tier, a failed summary). */
export const LEGACY_EXPOSURE = 1.5;
/** The engine defaults the legacy rig falls back to (lighting.ts). */
const LEGACY_SUN = 4.5;
const LEGACY_SUN_HEX = 0xfff1dc;

/** A preset's authored key (the legacy rig's sun, the night's moon), with the engine's defaults; null when it carries none. */
export function authoredSunOf(preset: LightModelPreset): { intensity: number; colorHex: number } | null {
  return preset.sunIntensity != null || preset.sunColorHex != null
    ? { intensity: preset.sunIntensity ?? LEGACY_SUN, colorHex: preset.sunColorHex ?? LEGACY_SUN_HEX } : null;
}
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
 * 2026-10-05 (the skies lane; the gauntlet's wave 93: Frosthollow and Railyard facing the sun show it in a clear gap, "yet
 * the snow, trees and yard have no shadows, rims or glare"): the coverage over which a deck closes — under the first it
 * has gaps, over the second none.
 */
export const DECK_CLOSED_COVERAGE: readonly [number, number] = Object.freeze([0.95, 0.97]) as readonly [number, number];
/**
 * The share of the overcast's direct cut a deck takes uniformly: a closed deck (no gap) all of it; a deck with gaps none —
 * where the cloud shade map can carry its cells (`patterned`: the volumetric layer draws on this tier) the cells shade
 * the sun and the gaps let it through; without the map, or for an authored overcast or a legacy deck, the cut stays
 * uniform (1).
 */
export function resolveDeckClosure(preset: LightModelPreset, patterned: boolean): number {
  // (QA: DECK_PATTERN 0 restores the uniform cut on every deck)
  if (!patterned || !(lightTune('DECK_PATTERN', 1) > 0)) return 1;
  const authored = preset.lighting?.overcast;
  if (typeof authored === 'number' && Number.isFinite(authored)) return 1;
  const scape = preset.cloudscape;
  if (!scape) return 1;
  const row = scape.regime ? CLOUDSCAPE_REGIMES[scape.regime] : null;
  if (scape.shadow ?? row?.shadow ?? true) return 1;
  return smoothstep(DECK_CLOSED_COVERAGE[0], DECK_CLOSED_COVERAGE[1], scape.coverage ?? row?.coverage ?? 0);
}
/**
 * The direct cut of a closed deck at overcast 1 — lightModel.ts OVERCAST_DIRECT_CUT, here for the modules that build
 * before the grounded model loads (the far ranges, maps/horizon.ts); lightModel.selftest pins the two equal.
 */
export const OVERCAST_DIRECT_CUT_SHARED = 0.98;
/**
 * The deck's thickness on its glow — lightModel.ts OVERCAST_THICK_CUT / OVERCAST_THICK_FROM, here for the modules that build
 * before the grounded model loads (lightModel.selftest pins the copies equal): 1 − cut × smoothstep(from, 1, overcast), the
 * QA knobs of the same names. 2026-10-06 (the skies lane): the haze law's in-scatter target under a deck takes it too
 * (hazeLaw.ts hazeTargetTerms) — the air under a thick deck is lit by the same reduced glow as the ground.
 */
export const OVERCAST_THICK_CUT_SHARED = 0.55;
export const OVERCAST_THICK_FROM_SHARED = 0.5;
export function overcastThickness(overcast: number): number {
  const o = Number.isFinite(overcast) ? overcast : 0;
  return 1 - lightTune('OVERCAST_THICK_CUT', OVERCAST_THICK_CUT_SHARED) * smoothstep(lightTune('OVERCAST_THICK_FROM', OVERCAST_THICK_FROM_SHARED), 1, o);
}

/** How much of the night a dome intensity means: full at the night preset's .08, none from .30 (sky.ts nightAmount). */
function nightFor(skyIntensity: number): number {
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
    envDiffuseChroma: 1,
    hemiIntensity: hemiPreset + hemiFloor,
    hemiSky: hexToLinear(0xaac8f5),
    hemiGround: hexToLinear(0x94815f),
    fillIntensity: preset.fillIntensity ?? LEGACY_FILL,
    groundAlbedo: ground,
    groundRadiance: [0, 0, 0],
    overcast: resolveOvercast(preset),
    deckClosure: 1,
    illuminance: EXPOSURE_REFERENCE_ILLUMINANCE,
    exposure: lightTune('LEGACY_EXPOSURE', LEGACY_EXPOSURE) * (preset.postExposure ?? 1),
    whiteBalance: [1, 1, 1],
    saturation: 1,
    contrast: 1,
    night: nightOf(preset),
    vehicleReadability: 1,
  };
}


/** The grounded model's resolver (lightModel.ts): an open sky's light from its atmosphere and summary. */
export type GroundedLightResolver = (
  preset: LightModelPreset, params: AtmosphereParams, sky: LightModelSky, sun: { intensity: number; colorHex: number } | null,
  overcast: number, night: number, closure?: number,
) => LightModel;
/** What the core hands the grounded model on install, so its chunk imports nothing at runtime: atmosphere.ts's medium
 * and transmittance march, the default ground and the exposure meter's reference. */
export interface GroundedLightEnv {
  readonly groundKm: number;
  readonly topKm: number;
  readonly medium: typeof ATMO_MEDIUM;
  readonly transmittanceSteps: number;
  readonly groundAlbedo: Rgb;
  readonly referenceIlluminance: number;
}
const GROUNDED_ENV: GroundedLightEnv = Object.freeze({
  groundKm: ATMO_GROUND_KM, topKm: ATMO_TOP_KM, medium: ATMO_MEDIUM, transmittanceSteps: ATMO_STEPS.transmittance,
  groundAlbedo: DEFAULT_GROUND_ALBEDO, referenceIlluminance: EXPOSURE_REFERENCE_ILLUMINANCE,
});
let grounded: GroundedLightResolver | null = null;
let groundedLoad: Promise<void> | null = null;
/**
 * The grounded model, loaded once behind the battle entry (the battle atmosphere's acquisition, the capture staging).
 * It never rejects: a failed chunk keeps the authored rig and the next call retries.
 */
export function loadGroundedLightModel(): Promise<void> {
  return groundedLoad ??= import('./lightModel.ts').then(
    (module) => { grounded = module.groundedLightModel(GROUNDED_ENV); },
    () => { groundedLoad = null; },
  );
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
  patterned = false,
): LightModel {
  return params && sky && grounded && !isGalaxySky(preset)
    ? grounded(preset, params, sky, sun, resolveOvercast(preset), nightOf(preset), resolveDeckClosure(preset, patterned))
    : legacyModel(preset);
}
