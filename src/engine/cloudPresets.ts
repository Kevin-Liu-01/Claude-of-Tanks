/**
 * cloudPresets.ts — a map's volumetric cloud layer from its authored sky preset (round 68, 2026-09-24).
 *
 * Every map keeps its identity without a new field in its sky block (the Garage copies deep-equal those
 * blocks, `garageSkyPresets.selftest`): the layer reads the same cloud fields the baked decks read —
 * `cloudOpacity` (how much sky the deck covered), `cloudOpacity2`, `turbidity`, `cloudAltM` (an authored
 * low deck), `cloudTintHex`, `cloudShadowAmp`, `fogDensity`, `rayleigh`, `skyIntensity` — and derives a
 * coverage, a regime and the slab. The legacy overcast rule of sky.ts (both decks near-opaque under a
 * turbid sky, or an authored deck at or below 400 m with an opaque low deck) selects the stratus regime,
 * which is what restores the white sky of the overcast presets (the round-65 open note). A map may author
 * the whole layer through `sky.cloudLayer` (a partial `CloudLayerPreset`, null = derived).
 */
import type { AtmosphereSkyPresetInput } from './atmosphere.ts';

export type CloudLayerRegime = 'scattered' | 'broken' | 'overcast' | 'storm';

export interface CloudLayerPreset {
  /** The regime (documentation and the shadow / shape policy; the numbers below carry the look). */
  regime: CloudLayerRegime;
  /** Fraction of the equalised weather field admitted as cloud: the sky fraction before the shape erodes it. */
  coverage: number;
  /** Cloud base altitude (m). */
  baseM: number;
  /** Slab thickness (m) at full column height. */
  thicknessM: number;
  /** 0..1: how far cumulus columns may rise above the slab as towers (storm turrets at 1). */
  towers: number;
  /** 0..1: stratiform (flat, featureless, ambient-lit) against cumuliform (domed, sun-modelled). */
  stratiform: number;
  /** Extinction coefficient (1/m) of the densest cloud. */
  density: number;
  /** Linear albedo tint (the authored cloudTintHex, perceptually halved). */
  tint: readonly [number, number, number];
  /** Wind: drift direction (rad, world XZ) and speed (m/s). */
  windDirRad: number;
  windSpeed: number;
  /** Per-map weather decorrelation offset in tiles. */
  offset: readonly [number, number];
  /** Whether the layer casts real cloud shadows through the CSM (cumulus regimes under a strong sun only). */
  shadow: boolean;
  /** Alpha test on the equalised coverage field for the shadow footprint (the cloud's dense core). */
  shadowThreshold: number;
}

/** The sky preset fields the derivation reads (a subset of sky.ts's SkyPreset). */
export interface CloudLayerSkyInput extends AtmosphereSkyPresetInput {
  skyIntensity: number;
  cloudOpacity: number;
  cloudOpacity2: number;
  cloudTintHex: number;
  cloudAltM: number | null;
  cloudShadowAmp: number | null;
  fogDensity: number;
  cloudLayer?: Partial<CloudLayerPreset> | null;
}

/** sky.ts's fair-weather deck altitude and the legacy overcast stratus altitude (the decks' AUTO values). */
export const CLOUD_LAYER_DEFAULT_BASE_M = 620;
export const CLOUD_LAYER_OVERCAST_BASE_M = 340;
/** Regime thresholds on the derived coverage and the legacy overcast rule's inputs. */
export const CLOUD_LAYER_RULES = Object.freeze({
  /**
   * coverage = clamp(0.42 · cloudOpacity^1.3, 0.05, 0.97): the legacy deck at cloudOpacity 1 (the 1049
   * fair-weather cumulus, its bake ~40 % covered) maps onto 0.42 of the equalised field; fainter authored
   * decks thin toward wisps (Olympus Basin 0.3 → 0.09), heavier ones (delta 1.16 → 0.51) break the sky
   */
  coverageGain: 0.42,
  coveragePower: 1.3,
  coverageBias: 0,
  coverageMin: 0.05,
  coverageMax: 0.97,
  /** sky.ts's overcast rule: cloudOpacity ≥ 0.95, cloudOpacity2 ≥ 0.9, turbidity ≥ 7 */
  overcastOpacity: 0.95,
  overcastOpacity2: 0.9,
  overcastTurbidity: 7,
  /** an authored deck this low with an opaque low deck is a stratus ceiling too */
  overcastAuthoredAltM: 400,
  overcastCoverageFloor: 0.94,
  /** a storm is an overcast preset with the thickest fog (Monsoon: 0.00088) */
  stormFogDensity: 0.00086,
  /** scattered below, broken from here */
  brokenCoverage: 0.48,
  /** the shadow caster needs a fair-weather cloud-shadow amplitude (the legacy AUTO is 0.22) and a day sky */
  shadowMinAmp: 0.15,
  shadowMinSkyIntensity: 0.3,
  shadowCoreBand: 0.12,
});

function hexToLinear(hex: number): [number, number, number] {
  const srgb = [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255].map((c) => c / 255);
  return srgb.map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)) as [number, number, number];
}

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** The decks' per-map decorrelation hash (sky.ts updateCloudDecks), reused so the layer keys the same way. */
function mapOffset(sunAzimuthDeg: number, sunElevationDeg: number): [number, number] {
  const h1 = Math.sin(sunAzimuthDeg * 12.9898 + sunElevationDeg * 78.233) * 43758.5453;
  const h2 = Math.sin(sunAzimuthDeg * 39.4185 + sunElevationDeg * 11.135) * 24634.6345;
  return [h1 - Math.floor(h1), h2 - Math.floor(h2)];
}

/** Derive the layer from a sky preset; an authored `cloudLayer` override wins field by field. */
export function deriveCloudLayerPreset(sky: CloudLayerSkyInput): CloudLayerPreset {
  const R = CLOUD_LAYER_RULES;
  const co = Math.max(0, sky.cloudOpacity);
  const co2 = Math.max(0, sky.cloudOpacity2);
  const turbidity = Math.max(0, sky.turbidity);
  const legacyOvercast = co >= R.overcastOpacity && co2 >= R.overcastOpacity2 && turbidity >= R.overcastTurbidity;
  const authoredLowDeck = sky.cloudAltM != null && sky.cloudAltM <= R.overcastAuthoredAltM && co >= R.overcastOpacity;
  const overcast = legacyOvercast || authoredLowDeck;
  let coverage = clamp(R.coverageGain * co ** R.coveragePower + R.coverageBias, R.coverageMin, R.coverageMax);
  if (overcast) coverage = Math.max(coverage, R.overcastCoverageFloor);
  const storm = overcast && sky.fogDensity >= R.stormFogDensity;
  const regime: CloudLayerRegime = storm ? 'storm' : overcast ? 'overcast' : coverage >= R.brokenCoverage ? 'broken' : 'scattered';
  const towers = storm ? 1 : overcast ? 0 : clamp((co - 0.95) * 2, 0, 1) * (turbidity >= 5.5 ? 1 : 0.4);
  const stratiform = storm ? 0.55 : overcast ? 0.85 : regime === 'broken' ? 0.35 : 0.12;
  const baseM = sky.cloudAltM ?? (overcast ? CLOUD_LAYER_OVERCAST_BASE_M : CLOUD_LAYER_DEFAULT_BASE_M);
  const thicknessM = storm ? 1400 : overcast ? 320 : regime === 'broken' ? 480 + towers * 500 : 360 + towers * 400;
  const density = storm ? 0.08 : overcast ? 0.035 : regime === 'broken' ? 0.09 : 0.11;
  // the authored deck tint was composited over a white sky: as an albedo it is perceptually halved, and a
  // stratus ceiling (which IS the sky) takes only a quarter of it so an overcast stays white
  const tintPower = overcast ? 0.25 : 0.5;
  const tint = hexToLinear(sky.cloudTintHex).map((c) => clamp(c, 0, 1) ** tintPower) as [number, number, number];
  const shadowAmp = sky.cloudShadowAmp ?? (overcast ? 0.10 : 0.22);
  const shadow = !overcast && shadowAmp >= R.shadowMinAmp && sky.skyIntensity >= R.shadowMinSkyIntensity;
  // the wind runs across the sun (the cirrus deck's quarter turn): shadows drift sideways through the frame
  const windDirRad = (sky.sunAzimuthDeg + 90) * Math.PI / 180;
  const windSpeed = storm ? 11 : overcast ? 4 : regime === 'broken' ? 8 : 6;
  const derived: CloudLayerPreset = {
    regime, coverage, baseM, thicknessM, towers, stratiform, density, tint, windDirRad, windSpeed,
    offset: mapOffset(sky.sunAzimuthDeg, sky.sunElevationDeg),
    shadow, shadowThreshold: clamp(1 - coverage + R.shadowCoreBand, 0, 1),
  };
  const authored = sky.cloudLayer;
  if (!authored) return derived;
  const merged = { ...derived };
  for (const key of Object.keys(authored) as (keyof CloudLayerPreset)[]) {
    const value = authored[key];
    if (value !== undefined && value !== null) (merged as Record<string, unknown>)[key] = value;
  }
  return merged;
}

/** A stable key of everything the layer's uniforms and shadow caster read (a preset change re-keys the history). */
export function cloudLayerKey(p: CloudLayerPreset): string {
  return [p.regime, p.coverage, p.baseM, p.thicknessM, p.towers, p.stratiform, p.density, ...p.tint,
    p.windDirRad, p.windSpeed, ...p.offset, p.shadow ? 1 : 0, p.shadowThreshold].map((v) => (typeof v === 'number' ? v.toFixed(5) : v)).join(',');
}
