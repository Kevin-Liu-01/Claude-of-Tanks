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
import { CLOUDSCAPE_REGIMES, CLOUD_MID_KINDS, type CloudMidKind, type CloudscapeConfig, type CloudscapeRegime } from './cloudscapes.ts';
import { CLOUD_CONTRAIL_MAX, CLOUD_STORM_MAX } from './cloudWeatherLayers.ts';

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
  /** Round 76 (the deck pass): the cellular structure of a deck (0..1) and its cell diameter (m). */
  cells: number;
  cellM: number;
  /** Round 76: 0..1 the underside lit by the column's transmitted light (the diffusion law) instead of the sky-mean floor. */
  deckLight: number;
  /** Round 76: 0..1 undulatus bands across a deck's thickness from the wind-frame rolls. */
  undulatus: number;
  /** Round 76: 0..1 the interior density octave inside cumuliform masses (a detailed first light tap). */
  interior: number;
  /** 2026-10-01: the time of day the layer was resolved for (cloudTimeOfDay: the diurnal law's input). */
  timeOfDay: CloudTimeOfDay;
  /**
   * 2026-10-01: the mid-level layer (cloudWeatherLayers.ts) — its kind (0 none, 1 altocumulus, 2 altostratus,
   * 3 cirrocumulus, 4 lenticular), the share of the sky's broad patches it fills, its altitude and thickness (m), its element size
   * (m), its rows across the wind (0..1) and its extinction (1/m).
   */
  midKind: number;
  midCoverage: number;
  midAltM: number;
  midThicknessM: number;
  midCellM: number;
  midBands: number;
  midDensity: number;
  /** 2026-10-01: contrails — how many (0..6) and their mean spread (0 fresh, 1 old contrail cirrus). */
  contrails: number;
  contrailAge: number;
  /** 2026-10-01: distant cumulonimbus cells — how many (0..3), their sector (rad, world XZ like windDirRad), distance and tops (m). */
  storms: number;
  stormAzRad: number;
  stormDistM: number;
  stormTopM: number;
  /** 2026-10-01: 0..1 rain shafts under the precipitating cores, and the share of their fall that evaporates (virga). */
  rain: number;
  virga: number;
  /** 2026-10-01: 0..1 a fog bank on the sea at the horizon and its top (m over the camera's ground). */
  fogBank: number;
  fogBankTopM: number;
  /** 2026-10-01: the ground's light on the cloud bases (linear rgb, already scaled by the night amount: 0 by day). */
  groundGlow: readonly [number, number, number];
  /** 2026-10-01: the key light's colour on the clouds (luminance 1): white by day (the atmosphere colours the sun), the moonlight's at night. */
  keyTint: readonly [number, number, number];
}

/** 2026-10-01: the three skies a battle can open under (battleWeatherPolicy.ts BATTLE_TIMES). */
type CloudTimeOfDay = 'day' | 'sunset' | 'night';

/** The sky preset fields the derivation reads (a subset of sky.ts's SkyPreset). */
export interface CloudLayerSkyInput extends AtmosphereSkyPresetInput {
  skyIntensity: number;
  cloudOpacity: number;
  cloudOpacity2: number;
  cloudTintHex: number;
  cloudAltM: number | null;
  cloudShadowAmp: number | null;
  fogDensity: number;
  /** The key light's colour (the moon's at night: battleAtmosphereRuntime's night preset). */
  sunColorHex?: number;
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
  cirrusDensity: 0.35,
  farBandMaxAltM: 2200,
  /** round 71: the cirrus streak direction sits a third of a quarter turn off the wind (the upper wind veers) */
  cirrusVeerRad: Math.PI / 6,
});

/**
 * 2026-10-01: the time of day from the sky preset the battle applies — the night preset dims the dome to .08 (the
 * night amount of sky.ts: full at .08, none from .30), the sunset preset lowers the sun to 7°.
 */
const CLOUD_TIME_RULES = Object.freeze({ nightTop: 0.30, nightFull: 0.08, sunsetMaxElevationDeg: 10 });

export function cloudNightAmount(skyIntensity: number): number {
  const R = CLOUD_TIME_RULES;
  return clamp((R.nightTop - skyIntensity) / (R.nightTop - R.nightFull), 0, 1);
}

export function cloudTimeOfDay(sky: { skyIntensity: number; sunElevationDeg: number }): CloudTimeOfDay {
  if (cloudNightAmount(sky.skyIntensity) >= 0.5) return 'night';
  return sky.sunElevationDeg <= CLOUD_TIME_RULES.sunsetMaxElevationDeg ? 'sunset' : 'day';
}

/** The time a cloudscape is resolved for: an authored constant sky (`diurnal: false`, Mars' dimmed galaxy dome) is always day. */
function scapeTime(sky: CloudLayerSkyInput, scape: CloudscapeConfig): CloudTimeOfDay {
  return scape.diurnal === false ? 'day' : cloudTimeOfDay(sky);
}

/**
 * 2026-10-01: the diurnal cycle of convective cloud. Fair-weather cumulus is a daytime cloud — it grows with the
 * morning's heating, flattens and thins as the surface cools toward sunset (cumulus fractus, stratocumulus
 * vesperalis) and has mostly gone by night, when only the decks, the high cloud and the organised storms remain
 * (a front's towers live through the night: nocturnal convection). Multipliers on the resolved numbers of every
 * cumuliform regime (not a deck, a sheet or a front); a map's `sunset` / `night` knobs win over them.
 */
export const CLOUD_DIURNAL = Object.freeze({
  // (2026-10-02, on the first captures: the sunset at 0.8 / 0.45 / 0.78 emptied the evening sky the owner liked — the
  // evening cumulus keeps most of its mass and flattens a little)
  sunset: Object.freeze({ coverage: 0.88, towers: 0.65, thickness: 0.88, wispiness: 0.08, rain: 0.6 }),
  night: Object.freeze({ coverage: 0.58, towers: 0.25, thickness: 0.62, wispiness: 0.18, rain: 0.5 }),
});

/** 2026-10-01: the mid layer's kinds as the meteorology sizes them (altitude, thickness and element in metres, extinction per metre). */
export const CLOUD_MID_DEFAULTS: Readonly<Record<CloudMidKind, { altM: number; thicknessM: number; cellM: number; bands: number; density: number }>> = Object.freeze({
  none: Object.freeze({ altM: 4200, thicknessM: 300, cellM: 260, bands: 0, density: 0 }),
  // altocumulus stratiformis: elements 200–400 m at 3–5 km, often in rows across the wind; τ ≈ 4 at an element's core
  altocumulus: Object.freeze({ altM: 4200, thicknessM: 360, cellM: 280, bands: 0.35, density: 0.011 }),
  // altostratus: a grey fibrous veil 1–2 km thick at 4–6 km, the sun as through ground glass (τ ≈ 1 overhead; 2026-10-02:
  // the first captures at τ 2.3 showed opaque white patches, foreshortened into pancakes toward the horizon)
  altostratus: Object.freeze({ altM: 5200, thicknessM: 900, cellM: 1800, bands: 0, density: 0.0012 }),
  // cirrocumulus: ripples of ice 50–100 m high up (6.5–8 km), thin (τ ≈ 1)
  cirrocumulus: Object.freeze({ altM: 7400, thicknessM: 160, cellM: 75, bands: 0.55, density: 0.007 }),
  // altocumulus lenticularis: smooth stationary lenses a few kilometres long in the lee of the ranges (τ ≈ 3 at the core)
  lenticular: Object.freeze({ altM: 5400, thicknessM: 520, cellM: 1500, bands: 0, density: 0.0065 }),
});

/** 2026-10-01: the weather beyond the slab's defaults (contrails, storm cells, the fog bank, the night glow). */
export const CLOUD_WEATHER_RULES = Object.freeze({
  stormDistM: 38000, stormTopM: 11000, fogBankTopM: 120,
  /** the sodium-orange glow of a lit town on the cloud bases (a map authors its own hue) */
  nightGlowHex: 0xff9a52,
  /** the night albedo: a moonlit cloud is a grey-white diffuser — the night preset's dark blue deck tint is a dome colour */
  nightTintHex: 0xe9edf2,
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
    // round 76 fields at their neutral values: no deck cells, the round-71 floor lighting, no undulatus, no interior octave
    cells: 0, cellM: 1200, deckLight: 0, undulatus: 0, interior: 0,
    // 2026-10-01 fields at their neutral values: no weather beyond the slab, a white key light, no ground glow
    ...neutralWeather(baseM + thicknessM, cloudTimeOfDay(sky)),
  };
}

/** The 2026-10-01 fields at their neutral values (a sky block alone, the Garage). */
function neutralWeather(slabTopM: number, timeOfDay: CloudTimeOfDay): Pick<CloudLayerPreset,
  'timeOfDay' | 'midKind' | 'midCoverage' | 'midAltM' | 'midThicknessM' | 'midCellM' | 'midBands' | 'midDensity' | 'contrails' | 'contrailAge'
  | 'storms' | 'stormAzRad' | 'stormDistM' | 'stormTopM' | 'rain' | 'virga' | 'fogBank' | 'fogBankTopM' | 'groundGlow' | 'keyTint'> {
  const mid = CLOUD_MID_DEFAULTS.none;
  return {
    timeOfDay, midKind: 0, midCoverage: 0, midAltM: Math.max(mid.altM, slabTopM + 300), midThicknessM: mid.thicknessM, midCellM: mid.cellM,
    midBands: 0, midDensity: 0, contrails: 0, contrailAge: 0.5, storms: 0, stormAzRad: 0, stormDistM: CLOUD_WEATHER_RULES.stormDistM,
    stormTopM: CLOUD_WEATHER_RULES.stormTopM, rain: 0, virga: 0, fogBank: 0, fogBankTopM: CLOUD_WEATHER_RULES.fogBankTopM,
    groundGlow: [0, 0, 0], keyTint: [1, 1, 1],
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
    cells: row?.cells ?? legacy.cells,
    cellM: row?.cellM ?? legacy.cellM,
    deckLight: row?.deckLight ?? legacy.deckLight,
    undulatus: row?.undulatus ?? legacy.undulatus,
    interior: row?.interior ?? legacy.interior,
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
  const time = scapeTime(sky, scape);
  return {
    regime: scape.regime ?? legacy.regime,
    coverage, baseM, thicknessM,
    towers: clamp(pick('towers'), 0, 1),
    stratiform,
    fieldMix: clamp(scape.fieldMix ?? (row ? row.fieldMix : legacy.fieldMix), 0, 1),
    density: Math.max(1e-4, pick('density')),
    // (2026-10-01: the battle's night preset repaints cloudTintHex for the baked decks — a dark blue 0x3a4d68, the colour
    // of the light on a painted deck; as an albedo it turned the night's clouds into black occluders, so the layer keeps
    // a grey-white diffuser at night and lets the moonlight bring the hue. 2026-10-02: the sunset keeps the preset's
    // warm deck tint — the captures without it showed the front-lit evening cumulus grey-white, the low sun's
    // back-scattered share being small beside the sky's light. A map's authored tint is kept.)
    tint: scape.tintHex != null ? tintOf(scape.tintHex, sheet)
      : tintOf(time === 'night' ? CLOUD_WEATHER_RULES.nightTintHex : sky.cloudTintHex, sheet),
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
    cells: clamp(pick('cells'), 0, 1),
    cellM: Math.max(100, pick('cellM')),
    deckLight: clamp(pick('deckLight'), 0, 1),
    undulatus: clamp(pick('undulatus'), 0, 1),
    interior: clamp(pick('interior'), 0, 1),
    ...resolveWeather(sky, scape, row, baseM + thicknessM),
  };
}

/** 2026-10-01: the weather beyond the slab and the time's light from the regime's row and the map's block. */
function resolveWeather(sky: CloudLayerSkyInput, scape: CloudscapeConfig, row: (typeof CLOUDSCAPE_REGIMES)[CloudscapeRegime] | null,
  slabTopM: number): ReturnType<typeof neutralWeather> {
  const W = CLOUD_WEATHER_RULES;
  const timeOfDay = scapeTime(sky, scape);
  const out = neutralWeather(slabTopM, timeOfDay);
  const kindName: CloudMidKind = scape.mid ?? row?.mid ?? 'none';
  const kind = Math.max(0, CLOUD_MID_KINDS.indexOf(kindName));
  const mid = CLOUD_MID_DEFAULTS[CLOUD_MID_KINDS[kind]];
  out.midKind = kind;
  out.midCoverage = kind ? clamp(scape.midCoverage ?? row?.midCoverage ?? 0.4, 0, 1) : 0;
  // the layer stands clear over the slab's tops (a front's anvils excepted: they reach the cirrus)
  out.midAltM = Math.max(scape.midAltM ?? mid.altM, slabTopM + 300 + (scape.midThicknessM ?? mid.thicknessM) * 0.5);
  out.midThicknessM = Math.max(40, scape.midThicknessM ?? mid.thicknessM);
  out.midCellM = Math.max(30, scape.midCellM ?? mid.cellM);
  out.midBands = clamp(scape.midBands ?? mid.bands, 0, 1);
  out.midDensity = mid.density;
  out.contrails = Math.round(clamp(scape.contrails ?? 0, 0, 1) * CLOUD_CONTRAIL_MAX);
  out.contrailAge = clamp(scape.contrailAge ?? 0.5, 0, 1);
  out.storms = Math.round(clamp(scape.storms ?? row?.storms ?? 0, 0, CLOUD_STORM_MAX));
  // a storm stands by default in the sector opposite the sun: front-lit towers over a shaded base (the sun's XZ angle
  // in the wind convention is 90° − azimuth: sky.ts places the sun with setFromSphericalCoords)
  out.stormAzRad = degToRad(scape.stormAzDeg ?? (270 - sky.sunAzimuthDeg));
  out.stormDistM = Math.max(9000, scape.stormDistM ?? W.stormDistM);
  out.stormTopM = Math.max(slabTopM + 1500, scape.stormTopM ?? W.stormTopM);
  out.rain = clamp(scape.rain ?? row?.rain ?? 0, 0, 1);
  out.virga = clamp(scape.virga ?? row?.virga ?? 0, 0, 1);
  out.fogBank = clamp(scape.fogBank ?? 0, 0, 1);
  out.fogBankTopM = Math.max(20, scape.fogBankTopM ?? W.fogBankTopM);
  const night = scape.diurnal === false ? 0 : cloudNightAmount(sky.skyIntensity);
  const glow = clamp(scape.nightGlow ?? 0, 0, 1) * night;
  out.groundGlow = glow > 0 ? hexToLinear(scape.nightGlowHex ?? W.nightGlowHex).map((c) => c * glow) as [number, number, number] : [0, 0, 0];
  if (night > 0 && sky.sunColorHex != null) {
    // the moonlight's hue at its own luminance 1, toward white as the night fades
    const k = hexToLinear(sky.sunColorHex);
    const l = Math.max(1e-4, 0.2126 * k[0] + 0.7152 * k[1] + 0.0722 * k[2]);
    out.keyTint = k.map((c) => 1 + (c / l - 1) * night) as [number, number, number];
  }
  return out;
}

/**
 * 2026-10-01: the block as this time of day takes it — the diurnal law (CLOUD_DIURNAL) on a cumuliform regime's resolved
 * numbers, then the map's own knobs for the time (`sunset` / `night`). A day sky is the block itself.
 */
function timeScape(legacy: CloudLayerPreset, sky: CloudLayerSkyInput, scape: CloudscapeConfig): CloudscapeConfig {
  const time = scapeTime(sky, scape);
  if (time === 'day') return scape;
  const override = time === 'sunset' ? scape.sunset : scape.night;
  let out: CloudscapeConfig = scape;
  if (scape.diurnal !== false) {
    const base = applyCloudscape(legacy, sky, scape);
    // a cumuliform sky (not a deck, a sheet or a front's anvils) follows the surface heating
    if (base.stratiform < 0.5 && base.cells < 0.3 && base.anvil < 0.5) {
      const k = CLOUD_DIURNAL[time];
      out = {
        ...scape, coverage: base.coverage * k.coverage, towers: base.towers * k.towers, thicknessM: base.thicknessM * k.thickness,
        wispiness: Math.min(1, base.wispiness + k.wispiness), rain: base.rain * k.rain,
      };
    }
  }
  return override ? { ...out, ...override } : out;
}

/** Derive the layer from a sky preset; the cloudscape refines it, an authored `cloudLayer` override wins field by field. */
export function deriveCloudLayerPreset(sky: CloudLayerSkyInput): CloudLayerPreset {
  const legacy = deriveLegacy(sky);
  const derived = sky.cloudscape ? applyCloudscape(legacy, sky, timeScape(legacy, sky, sky.cloudscape)) : legacy;
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
    p.sunGain, p.ambientScale, p.farBand, p.farBandAltM, p.scud, p.cells, p.cellM, p.deckLight, p.undulatus, p.interior,
    p.timeOfDay, p.midKind, p.midCoverage, p.midAltM, p.midThicknessM, p.midCellM, p.midBands, p.midDensity, p.contrails, p.contrailAge,
    p.storms, p.stormAzRad, p.stormDistM, p.stormTopM, p.rain, p.virga, p.fogBank, p.fogBankTopM, ...p.groundGlow, ...p.keyTint,
  ].map((v) => (typeof v === 'number' ? v.toFixed(5) : v)).join(',');
}
