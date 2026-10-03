/**
 * cloudscapeLayer.ts — a map's cloudscape over the layer's deck derivation (round 71's regimes and knobs, 2026-10-01's
 * time of day and weather beyond the slab; moved here from cloudPresets.ts on 2026-10-02, the boot weight).
 *
 * Only a battlefield authors a cloudscape: the Garage's open destinations read the deck derivation alone. So this
 * resolves behind the battle entry: cloudPresets.ts loadCloudscapeLayers (the battle atmosphere's acquisition and the
 * capture staging await it) hands it the derivation's rules and helpers, and it imports nothing at runtime, so its
 * chunk shares no module with the boot closure.
 */
import type { CloudscapeConfig, CloudscapeRegime } from './cloudscapes.ts';
import type { CloudLayerPreset, CloudLayerSkyInput, CloudTimeOfDay, CloudscapeEnv } from './cloudPresets.ts';

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

// the derivation's rules and helpers, handed over by cloudPresets.ts on load (cloudscapeLayer below)
let CLOUD_LAYER_RULES: CloudscapeEnv['rules'];
let CLOUD_WEATHER_RULES: CloudscapeEnv['weather'];
let CLOUDSCAPE_REGIMES: CloudscapeEnv['regimes'];
let CLOUD_CONTRAIL_MAX: number;
let clamp: CloudscapeEnv['clamp'];
let tintOf: CloudscapeEnv['tintOf'];
let hexToLinear: CloudscapeEnv['hexToLinear'];
let neutralWeather: CloudscapeEnv['neutralWeather'];
let cloudNightAmount: CloudscapeEnv['cloudNightAmount'];
let cloudTimeOfDay: CloudscapeEnv['cloudTimeOfDay'];

/** The time a cloudscape is resolved for: an authored constant sky (`diurnal: false`, Mars' dimmed galaxy dome) is always day. */
function scapeTime(sky: CloudLayerSkyInput, scape: CloudscapeConfig): CloudTimeOfDay {
  return scape.diurnal === false ? 'day' : cloudTimeOfDay(sky);
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
    lumps: row?.lumps ?? legacy.lumps ?? 0,
    cluster: row?.cluster ?? legacy.cluster ?? 0,
    baseFlat: row?.baseFlat ?? legacy.baseFlat ?? 0,
    deckDetail: row?.deckDetail ?? legacy.deckDetail ?? 0,
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
    lumps: clamp(pick('lumps'), 0, 1),
    cluster: clamp(pick('cluster'), 0, 1),
    baseFlat: clamp(pick('baseFlat'), 0, 1),
    deckDetail: clamp(pick('deckDetail'), 0, 1),
    ...resolveWeather(sky, scape, row),
  };
}

/** 2026-10-01: the weather beyond the slab and the time's light from the regime's row and the map's block. */
function resolveWeather(sky: CloudLayerSkyInput, scape: CloudscapeConfig, row: (typeof CLOUDSCAPE_REGIMES)[CloudscapeRegime] | null): ReturnType<typeof neutralWeather> {
  const W = CLOUD_WEATHER_RULES;
  const timeOfDay = scapeTime(sky, scape);
  const out = neutralWeather(timeOfDay);
  out.contrails = Math.round(clamp(scape.contrails ?? 0, 0, 1) * CLOUD_CONTRAIL_MAX);
  out.contrailAge = clamp(scape.contrailAge ?? 0.5, 0, 1);
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

/** cloudPresets.ts, on load: the cloudscape resolver over the derivation it hands over. */
export function cloudscapeLayer(env: CloudscapeEnv): (legacy: CloudLayerPreset, sky: CloudLayerSkyInput, scape: CloudscapeConfig) => CloudLayerPreset {
  ({
    rules: CLOUD_LAYER_RULES, weather: CLOUD_WEATHER_RULES, regimes: CLOUDSCAPE_REGIMES, contrailMax: CLOUD_CONTRAIL_MAX,
    clamp, tintOf, hexToLinear, neutralWeather, cloudNightAmount, cloudTimeOfDay,
  } = env);
  return (legacy, sky, scape) => applyCloudscape(legacy, sky, timeScape(legacy, sky, scape));
}
