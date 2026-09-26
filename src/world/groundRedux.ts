// src/world/groundRedux.ts — Round 73 (2026-09-25, the ground redux; owner, after rating the volumetric clouds
// "amazing": "improve ground, ground transitions, shorelines... add tall grass that interacts with tanks... make sure
// performance is still really good"). The per-map ground profile the terrain material and the tall-grass tier read:
// the transition, fold, snow, glint, shoreline and grass knobs of every battlefield in one THREE-free table keyed by
// map id (the map configs stay byte-identical — their history receipts project every byte of `maps/*.ts`).
//
// Every knob is inert at 0 and every map has a row, so a new map that names no profile renders exactly as it did.

export interface TallGrassBiome {
  /** The sward's character: meadow (temperate), steppe (feather grass), savanna (pale tussocks), reed (water margins),
   * tundra (sparse dead sedge through snow), verge (mown, trodden), dune (marram on the backshore). */
  kind: 'meadow' | 'steppe' | 'savanna' | 'reed' | 'tundra' | 'verge' | 'dune';
  /** Relative density, 0..1.3 of the tier's blades per square metre. */
  density: number;
  /** Mean blade height (m) and its ± fraction. */
  heightM: number;
  heightVar: number;
  /** Blade width at the root (m). */
  widthM: number;
  /** Linear rgb at the root and the tip. */
  base: readonly [number, number, number];
  tip: readonly [number, number, number];
  /** Linear rgb the tip pulls toward on the dry-straw patches the terrain paints (meadowA). */
  dry: readonly [number, number, number];
  /** Reeds: the density multiplier inside the wet band (water mask 0.04–0.6); 0 keeps the sward off the water. */
  waterBand: number;
  /** Prevailing wind in world xz (the blades' gust field runs along it). */
  windDir: readonly [number, number];
}

export interface GroundReduxProfile {
  /** Height-and-noise blend strength at the dirt / rock / scree borders (0 = the smooth mixes of round 55). */
  heightBlend: number;
  /** The 26–150 m detail-normal octave's strength. */
  midDetail: number;
  /** Scree band below the rock take-over (the D layer on 12°–30° slopes), 0..1. */
  scree: number;
  /** Snow sparkle under a grazing sun (roughness dips on sparse near texels), 0..1. */
  glint: number;
  /** Snow drift / sastrugi normal waves (0 on every non-snow map) and the scour-vs-powder macro. */
  snowRipple: number;
  snowMacro: number;
  /** Fold terms from the baked curvature attribute: hollow moisture, indirect occlusion, crest dryness. */
  foldMoist: number;
  foldAO: number;
  foldCrest: number;
  /** Shoreline: the swash period (s; 0 = a steady damp band, lakes and rivers), the band's width as a multiple of the
   * map's apron ramp (splat.seaRamp[0]; the Saltwind probe sized 1.9 — the film and damp zones reach the apron's
   * landward fade) and its strength (0 = no wet sand; 1.5 darkens the film 60 %, the damp band 33 % — the probe's
   * read of wet sand; 1.3 was faint in the strand view). */
  swashPeriodS: number;
  swashWidth: number;
  swashStrength: number;
  /** The tall-grass biome, or null for a map with no sward (arid, Mars). */
  grass: TallGrassBiome | null;
}

/** Performance budgets the round holds (docs/MAP-BEAUTIFICATION.md round 73); the perf bench compares against them. */
export const GROUND_REDUX_BUDGET = Object.freeze({
  terrainGpuMs: 0.8,
  tallGrassGpuMs: 1.0,
  shorelineGpuMs: 0.2,
  cpuMs: 0.2,
  drawCalls: 6,
  /** Fragment texture image units the terrain material may use in total (the GPU floor the material sits at). */
  terrainSamplers: 16,
  /** Samplers the terrain shader declares itself; the engine's cascades, environment and fog own the rest. */
  terrainDeclaredSamplers: 10,
});

const MEADOW_BASE = [0.075, 0.105, 0.032] as const;
const MEADOW_TIP = [0.30, 0.40, 0.12] as const;
const MEADOW_DRY = [0.50, 0.42, 0.18] as const;

const meadow = (density: number, heightM = 0.85, over: Partial<TallGrassBiome> = {}): TallGrassBiome => ({
  kind: 'meadow', density, heightM, heightVar: 0.35, widthM: 0.05, base: MEADOW_BASE, tip: MEADOW_TIP, dry: MEADOW_DRY,
  waterBand: 0, windDir: [0.8, 0.6], ...over,
});
const steppe = (density: number, heightM = 1.05): TallGrassBiome => ({
  kind: 'steppe', density, heightM, heightVar: 0.40, widthM: 0.045, base: [0.14, 0.115, 0.045], tip: [0.58, 0.50, 0.22],
  dry: [0.64, 0.52, 0.24], waterBand: 0, windDir: [0.92, 0.38],
});
const savanna = (density: number, heightM = 0.95): TallGrassBiome => ({
  kind: 'savanna', density, heightM, heightVar: 0.45, widthM: 0.05, base: [0.13, 0.12, 0.05], tip: [0.52, 0.47, 0.24],
  dry: [0.58, 0.48, 0.22], waterBand: 0, windDir: [0.6, 0.8],
});
const reed = (density: number, heightM = 1.7, waterBand = 1.0, everywhere = 0): TallGrassBiome => ({
  kind: 'reed', density, heightM, heightVar: 0.30, widthM: 0.06, base: [0.09, 0.12, 0.04], tip: [0.40, 0.44, 0.17],
  dry: [0.50, 0.44, 0.20], waterBand, windDir: [0.3, 0.95],
  // a river map keeps a thin meadow on its banks through `everywhere` (the reed density off the water)
  ...(everywhere ? { density: everywhere } : {}),
});
// dead sedge through the snow: dark straw, thin and short — the first sheet's pale 0.46 tips lit white under the
// snow maps' fill and read as frost spikes
const tundra = (density: number, heightM = 0.36): TallGrassBiome => ({
  kind: 'tundra', density, heightM, heightVar: 0.40, widthM: 0.024, base: [0.09, 0.075, 0.045], tip: [0.27, 0.22, 0.12],
  dry: [0.30, 0.24, 0.13], waterBand: 0, windDir: [0.95, 0.3],
});
const verge = (density: number, heightM = 0.55): TallGrassBiome => ({
  kind: 'verge', density, heightM, heightVar: 0.35, widthM: 0.045, base: [0.08, 0.10, 0.04], tip: [0.28, 0.34, 0.13],
  dry: [0.42, 0.38, 0.18], waterBand: 0, windDir: [0.7, 0.7],
});
const dune = (density: number, heightM = 0.8): TallGrassBiome => ({
  kind: 'dune', density, heightM, heightVar: 0.40, widthM: 0.04, base: [0.10, 0.12, 0.045], tip: [0.36, 0.42, 0.18],
  dry: [0.52, 0.48, 0.24], waterBand: 0, windDir: [-0.9, 0.44],
});

const TEMPERATE: Omit<GroundReduxProfile, 'grass'> = {
  heightBlend: 0.6, midDetail: 1.0, scree: 0, glint: 0, snowRipple: 0, snowMacro: 0,
  foldMoist: 0.7, foldAO: 0.5, foldCrest: 0.5, swashPeriodS: 0, swashWidth: 1.9, swashStrength: 0,
};
// the arid maps' worn-sand patches take a gentler transition (the owner's history with black contours on sand): the
// hard-edge share on Sirocco's chase view went 8 → 22 % at 0.45 with no grass in the frame
const ARID: Omit<GroundReduxProfile, 'grass'> = {
  ...TEMPERATE, heightBlend: 0.3, foldMoist: 0.35, foldAO: 0.55, foldCrest: 0.35,
};
const SNOW: Omit<GroundReduxProfile, 'grass'> = {
  ...TEMPERATE, heightBlend: 0.5, glint: 0.9, snowRipple: 0.16, snowMacro: 0.6, foldMoist: 0.22, foldAO: 0.6, foldCrest: 0.3,
};
const COAST: Omit<GroundReduxProfile, 'grass'> = {
  ...TEMPERATE, swashPeriodS: 8.5, swashWidth: 1.9, swashStrength: 1.5,
};
const STILL_WATER: Omit<GroundReduxProfile, 'grass'> = {
  ...TEMPERATE, swashPeriodS: 0, swashWidth: 1.6, swashStrength: 0.6,
};

/** Every battlefield's row (an unknown id runs TEMPERATE with no sward). */
const PROFILES: Readonly<Record<string, GroundReduxProfile>> = Object.freeze({
  verdant: { ...TEMPERATE, grass: meadow(1.0) },
  desert: { ...ARID, grass: null },
  winter: { ...SNOW, scree: 0.35, grass: tundra(0.35) },
  urban: { ...TEMPERATE, grass: verge(0.3) },
  coastal: { ...COAST, grass: dune(0.55) },
  autumn: { ...TEMPERATE, grass: meadow(1.0, 0.9, { base: [0.13, 0.11, 0.04], tip: [0.50, 0.42, 0.16], dry: [0.58, 0.44, 0.16] }) },
  steppe: { ...TEMPERATE, foldMoist: 0.5, grass: steppe(1.2) },
  railyard: { ...TEMPERATE, grass: verge(0.35) },
  frontier: { ...TEMPERATE, foldMoist: 0.55, grass: savanna(0.85) },
  fjord: { ...COAST, swashPeriodS: 9.5, swashStrength: 1.0, scree: 0.4, grass: dune(0.5) },
  delta: { ...STILL_WATER, grass: reed(0.75, 1.7, 1.0, 0.45) },
  badlands: { ...ARID, grass: null },
  monsoon: { ...STILL_WATER, swashStrength: 0.5, grass: meadow(0.9, 1.0, { base: [0.055, 0.11, 0.035], tip: [0.27, 0.44, 0.13], dry: [0.38, 0.42, 0.15] }) },
  alpine: { ...SNOW, scree: 0.6, grass: tundra(0.3) },
  caldera: { ...ARID, grass: null },
  foundry: { ...TEMPERATE, grass: verge(0.3) },
  ruinspires: { ...TEMPERATE, grass: verge(0.4) },
  blackglass: { ...TEMPERATE, grass: verge(0.25) },
  titan_gorge: { ...ARID, grass: null },
  skybridge: { ...ARID, swashPeriodS: 0, swashWidth: 1.4, swashStrength: 0.4, grass: null },
  polders: { ...STILL_WATER, grass: reed(0.7, 1.6, 1.0, 0.6) },
  copper_mesa: { ...ARID, grass: null },
  airfield: { ...TEMPERATE, grass: verge(0.6, 0.45) },
  oasis: { ...ARID, swashPeriodS: 0, swashWidth: 1.4, swashStrength: 0.5, grass: reed(0.5, 1.5, 1.0) },
  whiteout: { ...SNOW, scree: 0.3, grass: tundra(0.3, 0.4) },
  orchard: { ...TEMPERATE, grass: meadow(0.9, 0.8) },
  longleaf: { ...TEMPERATE, grass: savanna(0.7, 0.75) },
  mangrove: { ...COAST, swashPeriodS: 6.5, swashStrength: 0.9, grass: reed(0.7, 1.6, 1.0, 0.35) },
  saltwind: { ...COAST, swashPeriodS: 7.5, grass: dune(0.6) },
  reservoir: { ...STILL_WATER, grass: meadow(0.8) },
  mars: { ...ARID, foldMoist: 0, grass: null },
});

const DEFAULT_PROFILE: GroundReduxProfile = Object.freeze({ ...TEMPERATE, grass: null });

export function groundReduxProfileIds(): string[] {
  return Object.keys(PROFILES);
}

/** The map's row, or the temperate defaults with no sward. */
export function resolveGroundReduxProfile(mapId: string | null | undefined): GroundReduxProfile {
  return PROFILES[mapId ?? ''] ?? DEFAULT_PROFILE;
}

/** Terrain-material uniform packing (one vec4 each, no sampler): the receipt and the material share this shape. */
export function groundReduxUniformValues(profile: GroundReduxProfile): {
  reduxA: [number, number, number, number];
  reduxFold: [number, number, number, number];
  reduxSwash: [number, number, number, number];
  reduxSnow: [number, number, number];
} {
  const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.min(1.3, Math.max(0, v)) : 0);
  return {
    reduxA: [clamp01(profile.heightBlend), clamp01(profile.midDetail), clamp01(profile.scree), clamp01(profile.glint)],
    reduxFold: [clamp01(profile.foldMoist), clamp01(profile.foldAO), clamp01(profile.foldCrest), 0],
    reduxSwash: [
      profile.swashPeriodS > 0 ? (2 * Math.PI) / profile.swashPeriodS : 0,
      Math.min(4, Math.max(0.2, Number.isFinite(profile.swashWidth) ? profile.swashWidth : 1.9)),
      // the strength runs to 1.6 (a film darkened 64 %): the Saltwind probe read 1.5 as wet sand, 1.0 as nothing
      Number.isFinite(profile.swashStrength) ? Math.min(1.6, Math.max(0, profile.swashStrength)) : 0, 0,
    ],
    reduxSnow: [clamp01(profile.snowMacro), clamp01(profile.snowRipple), 0],
  };
}

/**
 * The tall-grass density (relative) a quality preset runs: absent (the mobile presets, receipts) = no tier. The
 * settings picker's Low keeps a quarter, Medium half; High / Ultra the full sward.
 */
export function tallGrassQualityScale(preset: { tallGrass?: number } | null | undefined): number {
  const v = preset?.tallGrass;
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(1.5, Math.max(0, v)) : 0;
}
