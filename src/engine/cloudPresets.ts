/**
 * cloudPresets.ts — a map's volumetric cloud layer from its authored sky preset and cloudscape (round 68,
 * 2026-09-24; round 71, 2026-09-25: the cloudscape regimes).
 *
 * Every map keeps its identity without a new field in its sky block (the Garage copies deep-equal those
 * blocks, `garageSkyPresets.selftest`): the layer reads the same cloud fields the baked decks read —
 * `cloudOpacity` (how much sky the deck covered), `cloudOpacity2`, `turbidity`, `cloudAltM` (an authored
 * low deck), `cloudTintHex`, `cloudShadowAmp`, `fogDensity`, `rayleigh`, `skyIntensity` — and derives a
 * coverage, a regime and the slab. The legacy overcast rule of sky.ts (both decks near-opaque under a
 * turbid sky, or an authored deck at or below 400 m with an opaque low deck) selects the stratus regime,
 * which is what restores the white sky of the overcast presets (the round-65 open note). Round 71: a map's
 * `clouds` block (cloudscapes.ts, carried on the preset as `sky.cloudscape`) names a regime and any knob; the
 * regime's row fills what the map leaves unset, the sky block what the row leaves open (the base of an authored
 * deck, the tint, the wind across the sun). A map may still author the resolved layer raw through
 * `sky.cloudLayer` (a partial `CloudLayerPreset`, null = derived), which wins field by field.
 */
import type { AtmosphereSkyPresetInput } from './atmosphere.ts';
import { CLOUDSCAPE_REGIMES, type CloudscapeConfig, type CloudscapeRegime } from './cloudscapes.ts';

export type CloudLayerRegime = 'scattered' | 'broken' | 'overcast' | 'storm' | CloudscapeRegime;

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
  /** 0..1: the weather field the coverage cuts — the cell-carried cumuliform one (0) or the broad stratiform one (1). */
  fieldMix: number;
  /** Extinction coefficient (1/m) of the densest cloud. */
  density: number;
  /** Linear albedo tint (the authored cloudTintHex, perceptually halved). */
  tint: readonly [number, number, number];
  /** Wind: drift direction (rad, world XZ, the direction the wind blows toward) and speed (m/s). */
  windDirRad: number;
  windSpeed: number;
  /** Per-map weather decorrelation offset in tiles. */
  offset: readonly [number, number];
  /** A storm keeps the sky over the camera open: its towers stand off beyond this horizontal radius (m, 0 = none). */
  clearRadiusM: number;
  /** Whether the layer casts real cloud shadows through the CSM (cumulus regimes under a strong sun only). */
  shadow: boolean;
  /** Alpha test on the equalised coverage field for the shadow footprint (the cloud's dense core). */
  shadowThreshold: number;
  /** Round 71: the cloud type range the weather's vigour channel maps between (0 stratus, 0.5 cumulus, 1 cumulonimbus). */
  typeRange: readonly [number, number];
  /** Round 71: 0..1 anvils on the deepest columns. */
  anvil: number;
  /** Round 71: 0..1 billowy → wispy erosion. */
  wispiness: number;
  /** Round 71: the horizontal lean of a column across the slab's height (m, along the wind). */
  shearM: number;
  /** Round 71: 0..1 share of the street-aligned weather field. */
  streets: number;
  /** Round 71: the high cirrus layer — coverage 0..1, streak direction (rad), altitude (m), optical density. */
  cirrus: number;
  cirrusAngleRad: number;
  cirrusAltM: number;
  cirrusDensity: number;
  /** Round 71: multipliers on the sun's and the ambient's contributions (1 = physical). */
  sunGain: number;
  ambientScale: number;
  /** Round 71: the far horizon stratocumulus band — coverage 0..1 and its altitude (m). */
  farBand: number;
  farBandAltM: number;
  /** Round 71: 0..1 ragged low fragments under the base. */
  scud: number;
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
  /** Round 71: the map's authored cloudscape (its `clouds` block, carried on the preset by main.ts). */
  cloudscape?: CloudscapeConfig | null;
}

/**
 * The fair-weather cumulus base (the owner's twelve good maps keep their sky mostly open: small sparse puffs high
 * over the thin baked veil) and the legacy overcast stratus altitude (the decks' AUTO value).
 */
export const CLOUD_LAYER_DEFAULT_BASE_M = 1400;
export const CLOUD_LAYER_CUMULUS_BASE_MIN_M = 1200;
export const CLOUD_LAYER_OVERCAST_BASE_M = 340;
/** Regime thresholds on the derived coverage and the legacy overcast rule's inputs. */
export const CLOUD_LAYER_RULES = Object.freeze({
  /**
   * coverage = clamp(0.22 · cloudOpacity^1.3, 0.05, 0.97) of the cell-carried field: the legacy deck at
   * cloudOpacity 1 maps onto 0.22 (the strongest cell cores as separate puffs — the sky stays mostly open,
   * the good maps' sky bands within the round's tolerance of the base); fainter authored decks thin toward
   * wisps (Olympus Basin 0.3 → 0.05), heavier ones (delta 1.16 → 0.27, alpine 1.12 → 0.25) carry more puffs
   */
  coverageGain: 0.22,
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
  /**
   * a storm keeps its tropical blue sky (the owner's approved base) with towering cumulus off toward the
   * horizon: this coverage of the cell field, and no tower within this radius of the camera
   */
  stormCoverage: 0.28,
  stormClearRadiusM: 2500,
  /** an authored deck at or below this altitude is a low-deck identity the layer keeps (polders 420 m) */
  lowDeckAuthoredAltM: 600,
  /** scattered below, broken from here (no shipped map reaches it: the regime is for authored decks) */
  brokenCoverage: 0.30,
  /** the shadow caster needs a fair-weather cloud-shadow amplitude (the legacy AUTO is 0.22) and a day sky */
  shadowMinAmp: 0.15,
  shadowMinSkyIntensity: 0.3,
  shadowCoreBand: 0.06,
  /** round 71: a sheet this stratiform takes the overcast tint power (a quarter) and the diffuse lighting */
  sheetStratiform: 0.7,
  /** round 71: the cirrus sheet's optical density at full coverage and the far band's ceiling altitude (m) */
  cirrusDensity: 0.45,
  farBandMaxAltM: 2200,
  /** round 71: the cirrus streak direction sits a third of a quarter turn off the wind (the upper wind veers) */
  cirrusVeerRad: Math.PI / 6,
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

/** The albedo tint: the authored deck tint was composited over a white sky, so as an albedo it is perceptually halved; a sheet takes a quarter. */
function tintOf(hex: number, sheet: boolean): [number, number, number] {
  const power = sheet ? 0.25 : 0.5;
  return hexToLinear(hex).map((c) => clamp(c, 0, 1) ** power) as [number, number, number];
}

/** The round-68 derivation: the layer from the deck fields alone (a map without a cloudscape, the Garage). */
function deriveLegacy(sky: CloudLayerSkyInput): CloudLayerPreset {
  const R = CLOUD_LAYER_RULES;
  const co = Math.max(0, sky.cloudOpacity);
  const co2 = Math.max(0, sky.cloudOpacity2);
  const turbidity = Math.max(0, sky.turbidity);
  const legacyOvercast = co >= R.overcastOpacity && co2 >= R.overcastOpacity2 && turbidity >= R.overcastTurbidity;
  const authoredLowDeck = sky.cloudAltM != null && sky.cloudAltM <= R.overcastAuthoredAltM && co >= R.overcastOpacity;
  const storm = (legacyOvercast || authoredLowDeck) && sky.fogDensity >= R.stormFogDensity;
  const overcast = !storm && (legacyOvercast || authoredLowDeck);
  let coverage = clamp(R.coverageGain * co ** R.coveragePower + R.coverageBias, R.coverageMin, R.coverageMax);
  if (overcast) coverage = Math.max(coverage, R.overcastCoverageFloor);
  if (storm) coverage = R.stormCoverage;
  const regime: CloudLayerRegime = storm ? 'storm' : overcast ? 'overcast' : coverage >= R.brokenCoverage ? 'broken' : 'scattered';
  const towers = storm ? 1 : overcast ? 0 : clamp((co - 0.95) * 1.2, 0, 1) * (turbidity >= 5.5 ? 1 : 0.4);
  const stratiform = storm ? 0.2 : overcast ? 0.85 : regime === 'broken' ? 0.3 : 0.12;
  // a storm's towers rise from wide bases (half the broad field), a broken sky merges a few cells, an
  // overcast is the broad field itself
  const fieldMix = overcast ? 1 : storm ? 0.85 : regime === 'broken' ? 0.15 : 0;
  const authoredAlt = sky.cloudAltM;
  const baseM = overcast ? (authoredAlt ?? CLOUD_LAYER_OVERCAST_BASE_M)
    : authoredAlt != null && authoredAlt <= R.lowDeckAuthoredAltM ? authoredAlt
      : Math.max(authoredAlt ?? CLOUD_LAYER_DEFAULT_BASE_M, CLOUD_LAYER_CUMULUS_BASE_MIN_M);
  const thicknessM = storm ? 1600 : overcast ? 320 : regime === 'broken' ? 420 + towers * 400 : 320 + towers * 300;
  const density = storm ? 0.09 : overcast ? 0.035 : regime === 'broken' ? 0.09 : 0.11;
  const tint = tintOf(sky.cloudTintHex, overcast);
  const shadowAmp = sky.cloudShadowAmp ?? (overcast ? 0.10 : 0.22);
  const shadow = !overcast && shadowAmp >= R.shadowMinAmp && sky.skyIntensity >= R.shadowMinSkyIntensity;
  // the wind runs across the sun (the cirrus deck's quarter turn): shadows drift sideways through the frame
  const windDirRad = (sky.sunAzimuthDeg + 90) * Math.PI / 180;
  const windSpeed = storm ? 11 : overcast ? 4 : regime === 'broken' ? 8 : 6;
  return {
    regime, coverage, baseM, thicknessM, towers, stratiform, fieldMix, density, tint, windDirRad, windSpeed,
    offset: mapOffset(sky.sunAzimuthDeg, sky.sunElevationDeg),
    clearRadiusM: storm ? R.stormClearRadiusM : 0,
    shadow, shadowThreshold: clamp(1 - coverage + R.shadowCoreBand, 0, 1),
    // round 71 fields at their neutral values: a cumulus type range, no anvils, the round-68 erosion, no lean,
    // no streets, no cirrus, physical gains, no far band, no scud
    typeRange: storm ? [0.6, 1] : overcast ? [0, 0.2] : [0.3, 0.6], anvil: storm ? 0.5 : 0, wispiness: 0.3, shearM: 0, streets: 0,
    cirrus: 0, cirrusAngleRad: windDirRad + R.cirrusVeerRad, cirrusAltM: 10000, cirrusDensity: R.cirrusDensity,
    sunGain: 1, ambientScale: 1, farBand: 0, farBandAltM: Math.min(R.farBandMaxAltM, baseM + thicknessM * 0.5), scud: 0,
  };
}

const degToRad = (deg: number): number => deg * Math.PI / 180;

/** The cloudscape over the legacy derivation: the regime's row, then the map's own knobs. */
function applyCloudscape(legacy: CloudLayerPreset, sky: CloudLayerSkyInput, scape: CloudscapeConfig): CloudLayerPreset {
  const R = CLOUD_LAYER_RULES;
  const row = scape.regime ? CLOUDSCAPE_REGIMES[scape.regime] : null;
  const pick = <K extends keyof CloudscapeConfig & keyof typeof rowDefaults>(key: K): number => {
    const authored = scape[key];
    if (typeof authored === 'number') return authored;
    return rowDefaults[key];
  };
  // the row's numbers, or the legacy layer's where a map authors knobs without a regime
  const rowDefaults = {
    coverage: row?.coverage ?? legacy.coverage,
    thicknessM: row?.thicknessM ?? legacy.thicknessM,
    towers: row?.towers ?? legacy.towers,
    anvil: row?.anvil ?? legacy.anvil,
    wispiness: row?.wispiness ?? legacy.wispiness,
    windSpeed: row?.windSpeed ?? legacy.windSpeed,
    shear: row ? row.shear : legacy.shearM / Math.max(1, legacy.thicknessM),
    streets: row?.streets ?? legacy.streets,
    cirrus: row?.cirrus ?? legacy.cirrus,
    cirrusAltM: row?.cirrusAltM ?? legacy.cirrusAltM,
    stratiform: row?.stratiform ?? legacy.stratiform,
    density: row?.density ?? legacy.density,
    farBand: row?.farBand ?? legacy.farBand,
    scud: row?.scud ?? legacy.scud,
    sunGain: row?.sunGain ?? legacy.sunGain,
    ambientScale: row?.ambientScale ?? legacy.ambientScale,
    clearRadiusM: row?.clearRadiusM ?? legacy.clearRadiusM,
  };
  const coverage = clamp(pick('coverage'), 0, R.coverageMax);
  const thicknessM = Math.max(50, pick('thicknessM'));
  const stratiform = clamp(pick('stratiform'), 0, 1);
  const sheet = stratiform >= R.sheetStratiform;
  // the base: the map's, the regime's, or (a regime whose base is open) the sky block's deck-derived one
  const baseM = Math.max(60, scape.baseM ?? row?.baseM ?? legacy.baseM);
  const windDirRad = scape.windDirDeg != null ? degToRad(scape.windDirDeg) : legacy.windDirRad;
  const typeRange = scape.type ?? row?.type ?? legacy.typeRange;
  const shadowDay = sky.skyIntensity >= R.shadowMinSkyIntensity;
  const shadow = scape.shadow ?? ((row ? row.shadow : legacy.shadow) && shadowDay);
  return {
    regime: scape.regime ?? legacy.regime,
    coverage, baseM, thicknessM,
    towers: clamp(pick('towers'), 0, 1),
    stratiform,
    fieldMix: row ? row.fieldMix : legacy.fieldMix,
    density: Math.max(1e-4, pick('density')),
    tint: scape.tintHex != null ? tintOf(scape.tintHex, sheet) : tintOf(sky.cloudTintHex, sheet),
    windDirRad,
    windSpeed: Math.max(0, pick('windSpeed')),
    offset: legacy.offset,
    clearRadiusM: Math.max(0, pick('clearRadiusM')),
    shadow: shadow && shadowDay,
    shadowThreshold: clamp(1 - coverage + R.shadowCoreBand, 0, 1),
    typeRange: [clamp(typeRange[0], 0, 1), clamp(typeRange[1], 0, 1)],
    anvil: clamp(pick('anvil'), 0, 1),
    wispiness: clamp(pick('wispiness'), 0, 1),
    shearM: clamp(pick('shear'), 0, 2) * thicknessM,
    streets: clamp(pick('streets'), 0, 1),
    cirrus: clamp(pick('cirrus'), 0, 1),
    cirrusAngleRad: scape.cirrusAngleDeg != null ? degToRad(scape.cirrusAngleDeg) : windDirRad + R.cirrusVeerRad,
    cirrusAltM: Math.max(baseM + thicknessM + 500, pick('cirrusAltM')),
    cirrusDensity: R.cirrusDensity,
    sunGain: Math.max(0, pick('sunGain')),
    ambientScale: Math.max(0, pick('ambientScale')),
    farBand: clamp(pick('farBand'), 0, 1),
    farBandAltM: Math.min(R.farBandMaxAltM, baseM + thicknessM * 0.5),
    scud: clamp(pick('scud'), 0, 1),
  };
}

/** Derive the layer from a sky preset; the cloudscape refines it, an authored `cloudLayer` override wins field by field. */
export function deriveCloudLayerPreset(sky: CloudLayerSkyInput): CloudLayerPreset {
  const legacy = deriveLegacy(sky);
  const derived = sky.cloudscape ? applyCloudscape(legacy, sky, sky.cloudscape) : legacy;
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
  return [p.regime, p.coverage, p.baseM, p.thicknessM, p.towers, p.stratiform, p.fieldMix, p.density, ...p.tint,
    p.windDirRad, p.windSpeed, ...p.offset, p.clearRadiusM, p.shadow ? 1 : 0, p.shadowThreshold,
    ...p.typeRange, p.anvil, p.wispiness, p.shearM, p.streets, p.cirrus, p.cirrusAngleRad, p.cirrusAltM, p.cirrusDensity,
    p.sunGain, p.ambientScale, p.farBand, p.farBandAltM, p.scud].map((v) => (typeof v === 'number' ? v.toFixed(5) : v)).join(',');
}
