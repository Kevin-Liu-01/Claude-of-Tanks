// src/world/groundRedux.ts — Round 73 (2026-09-25, the ground redux; owner, after rating the volumetric clouds
// "amazing": "improve ground, ground transitions, shorelines... add tall grass that interacts with tanks... make sure
// performance is still really good"). The per-map ground profile the terrain material and the tall-grass tier read:
// the transition, fold, snow, glint, shoreline and grass knobs of every battlefield in one THREE-free table keyed by
// map id (the map configs stay byte-identical — their history receipts project every byte of `maps/*.ts`).
//
// Round 73b (2026-09-26, the second pass — the integrator's eye-check: the terrain terms were invisible at the
// ground-mid view, the strand at the strand view, Whiteout's sedge read as sticks): the border lip, the road verge,
// the outcrop rim with its climate tint, the mid albedo octave, the drifts' lee edge, the strand's reach in METRES
// with its foam and wrack lines, the reed margin and the tundra's hollow / lee law.
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
  /** Reeds: the density multiplier at the waterline (water mask 0.04, thinning to nothing by 0.5 — a margin, not a
   * carpet); 0 keeps the sward off the water. */
  waterBand: number;
  /** Round 73b: a reed biome's relative density off the water (the bank's meadow; 1 for every other kind). */
  bank: number;
  /** Round 73b: reeds along the water margin of a biome that is not itself reeds (a meadow beside a lake), as a
   * density multiplier of the biome's own inside the margin; 0 = none. */
  reedMargin: number;
  /** Prevailing wind in world xz (the blades' gust field runs along it). */
  windDir: readonly [number, number];
}

export interface GroundReduxProfile {
  /** Height-and-noise blend strength at the dirt / rock / scree borders (0 = the smooth mixes of round 55). */
  heightBlend: number;
  /** The 26–150 m detail-normal octave's strength. */
  midDetail: number;
  /** Scree band below the rock take-over (the D layer on the 26°–47° slopes), 0..1. */
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
  /** Shoreline: the swash period (s; 0 = a steady muddy margin, lakes and rivers), the swash's mean reach up the
   * beach in METRES (round 73b: read off the baked shore distance — the mask's apron is two metres on a real beach,
   * so round 73's width in ramp multiples could never size it), its strength (0 = no wet sand; 1.5 darkens the film
   * 63 %, the damp band 35 %) and the foam / wrack lines' strength. */
  swashPeriodS: number;
  swashReachM: number;
  swashStrength: number;
  swashLines: number;
  /** Round 73b: the border terms — the worn patch's torn lip, the trodden road verge, the outcrop rim (tinted by
   * climate: lichen, moss, dust, hoar) and the 26–150 m albedo octave; each 0..1.3, inert at 0. */
  lip: number;
  verge: number;
  rim: number;
  rimTint: readonly [number, number, number];
  midAlbedo: number;
  /** Round 73b: the snow drifts' shaded lee edge (0 off the snow maps). */
  driftEdge: number;
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
  waterBand: 0, bank: 1, reedMargin: 0, windDir: [0.8, 0.6], ...over,
});
const steppe = (density: number, heightM = 1.05): TallGrassBiome => ({
  kind: 'steppe', density, heightM, heightVar: 0.40, widthM: 0.045, base: [0.14, 0.115, 0.045], tip: [0.58, 0.50, 0.22],
  dry: [0.64, 0.52, 0.24], waterBand: 0, bank: 1, reedMargin: 0, windDir: [0.92, 0.38],
});
const savanna = (density: number, heightM = 0.95): TallGrassBiome => ({
  kind: 'savanna', density, heightM, heightVar: 0.45, widthM: 0.05, base: [0.13, 0.12, 0.05], tip: [0.52, 0.47, 0.24],
  dry: [0.58, 0.48, 0.22], waterBand: 0, bank: 1, reedMargin: 0, windDir: [0.6, 0.8],
});
// round 73b: reeds are a margin — dense only at the waterline (waterBand 0.85 at mask 0.04–0.10, gone by 0.40), taller at the
// waterline (the tier lifts the fringe 30 % over the bank's 1.6 m, to the 1.9 m cap) —
// not the carpet of round 73 (1.0 across the whole 0.04–0.6 band); `bank` is the banks' own meadow relative to the
// reed density (round 73 overrode the density itself, which made the margin no denser than the bank)
const reed = (density: number, heightM = 1.6, waterBand = 0.85, bank = 0): TallGrassBiome => ({
  kind: 'reed', density, heightM, heightVar: 0.30, widthM: 0.06, base: [0.09, 0.12, 0.04], tip: [0.40, 0.44, 0.17],
  dry: [0.50, 0.44, 0.20], waterBand, bank, reedMargin: 0, windDir: [0.3, 0.95],
});
// dead sedge through the snow: dark straw, thin and short — the first sheet's pale 0.46 tips lit white under the
// snow maps' fill and read as frost spikes; round 73b keeps it to the hollows and the lee sides in clumps (the
// tier's admission law), so the density here is the clump's, not a carpet's
const tundra = (density: number, heightM = 0.36): TallGrassBiome => ({
  kind: 'tundra', density, heightM, heightVar: 0.45, widthM: 0.024, base: [0.06, 0.05, 0.03], tip: [0.17, 0.14, 0.075],
  dry: [0.20, 0.16, 0.09], waterBand: 0, bank: 1, reedMargin: 0, windDir: [0.95, 0.3],
});
const verge = (density: number, heightM = 0.55): TallGrassBiome => ({
  kind: 'verge', density, heightM, heightVar: 0.35, widthM: 0.045, base: [0.08, 0.10, 0.04], tip: [0.28, 0.34, 0.13],
  dry: [0.42, 0.38, 0.18], waterBand: 0, bank: 1, reedMargin: 0, windDir: [0.7, 0.7],
});
const dune = (density: number, heightM = 0.8): TallGrassBiome => ({
  kind: 'dune', density, heightM, heightVar: 0.40, widthM: 0.04, base: [0.10, 0.12, 0.045], tip: [0.36, 0.42, 0.18],
  dry: [0.52, 0.48, 0.24], waterBand: 0, bank: 1, reedMargin: 0, windDir: [-0.9, 0.44],
});

/** Round 73b: the outcrop rim's tint by climate (linear rgb multipliers on the rock at its turf border). */
const LICHEN = [0.88, 0.94, 0.72] as const;   // temperate: grey-green and yellow lichen crusts
const MOSS = [0.70, 0.90, 0.58] as const;     // wet and tropical: moss and algae
const DUST = [1.05, 0.98, 0.86] as const;     // arid: a dust bloom, paler and warmer
const HOAR = [0.90, 0.93, 0.96] as const;     // snow: hoar and rime, cooler

const TEMPERATE: Omit<GroundReduxProfile, 'grass'> = {
  heightBlend: 0.6, midDetail: 1.0, scree: 0, glint: 0, snowRipple: 0, snowMacro: 0,
  foldMoist: 0.7, foldAO: 0.5, foldCrest: 0.5, swashPeriodS: 0, swashReachM: 2.5, swashStrength: 0, swashLines: 0,
  lip: 0.8, verge: 0.8, rim: 0.7, rimTint: LICHEN, midAlbedo: 1.0, driftEdge: 0,
};
// the arid maps' worn-sand patches take a gentler transition (the owner's history with black contours on sand): the
// hard-edge share on Sirocco's chase view went 8 → 22 % at 0.45 with no grass in the frame; the lip stays low there
const ARID: Omit<GroundReduxProfile, 'grass'> = {
  ...TEMPERATE, heightBlend: 0.3, foldMoist: 0.35, foldAO: 0.55, foldCrest: 0.35,
  lip: 0.25, verge: 0.5, rim: 0.5, rimTint: DUST, midAlbedo: 0.7,
};
const SNOW: Omit<GroundReduxProfile, 'grass'> = {
  ...TEMPERATE, heightBlend: 0.5, glint: 0.9, snowRipple: 0.16, snowMacro: 0.6, foldMoist: 0.22, foldAO: 0.6, foldCrest: 0.3,
  lip: 0.4, verge: 0.3, rim: 0.5, rimTint: HOAR, midAlbedo: 0.6, driftEdge: 1.0,
};
const COAST: Omit<GroundReduxProfile, 'grass'> = {
  ...TEMPERATE, swashPeriodS: 8.5, swashReachM: 6, swashStrength: 1.5, swashLines: 1.0,
};
const STILL_WATER: Omit<GroundReduxProfile, 'grass'> = {
  ...TEMPERATE, swashPeriodS: 0, swashReachM: 2.5, swashStrength: 0.6, swashLines: 0.4,
};

/** Every battlefield's row (an unknown id runs TEMPERATE with no sward). */
const PROFILES: Readonly<Record<string, GroundReduxProfile>> = Object.freeze({
  verdant: { ...TEMPERATE, scree: 0.25, grass: meadow(1.0) },
  desert: { ...ARID, grass: null },
  winter: { ...SNOW, scree: 0.35, grass: tundra(0.35) },
  urban: { ...TEMPERATE, scree: 0.15, grass: verge(0.3) },
  coastal: { ...COAST, swashReachM: 7, scree: 0.2, grass: dune(0.55) },
  autumn: { ...TEMPERATE, scree: 0.3, grass: meadow(1.0, 0.9, { base: [0.13, 0.11, 0.04], tip: [0.50, 0.42, 0.16], dry: [0.58, 0.44, 0.16] }) },
  steppe: { ...TEMPERATE, foldMoist: 0.5, scree: 0.2, grass: steppe(1.2) },
  railyard: { ...TEMPERATE, scree: 0.15, grass: verge(0.35) },
  frontier: { ...TEMPERATE, foldMoist: 0.55, scree: 0.3, grass: savanna(0.85) },
  fjord: { ...COAST, swashPeriodS: 9.5, swashReachM: 5, swashStrength: 1.0, scree: 0.4, grass: dune(0.5) },
  delta: { ...STILL_WATER, rimTint: MOSS, grass: reed(0.75, 1.6, 0.85, 0.5) },
  badlands: { ...ARID, grass: null },
  monsoon: { ...STILL_WATER, swashStrength: 0.5, swashReachM: 3, scree: 0.3, rimTint: MOSS,
    grass: meadow(0.9, 1.0, { base: [0.055, 0.11, 0.035], tip: [0.27, 0.44, 0.13], dry: [0.38, 0.42, 0.15], reedMargin: 0.55 }) },
  alpine: { ...SNOW, scree: 0.6, grass: tundra(0.3) },
  caldera: { ...ARID, grass: null },
  foundry: { ...TEMPERATE, scree: 0.15, grass: verge(0.3) },
  ruinspires: { ...TEMPERATE, scree: 0.2, grass: verge(0.4) },
  blackglass: { ...TEMPERATE, scree: 0.2, grass: verge(0.25) },
  titan_gorge: { ...ARID, grass: null },
  skybridge: { ...ARID, swashPeriodS: 0, swashReachM: 2.5, swashStrength: 0.4, swashLines: 0.3, grass: null },
  polders: { ...STILL_WATER, grass: reed(0.7, 1.5, 0.85, 0.7) },
  copper_mesa: { ...ARID, grass: null },
  airfield: { ...TEMPERATE, grass: verge(0.6, 0.45) },
  oasis: { ...ARID, swashPeriodS: 0, swashReachM: 2.5, swashStrength: 0.5, swashLines: 0.3, grass: reed(0.5, 1.4, 0.85, 0.2) },
  whiteout: { ...SNOW, scree: 0.3, grass: tundra(0.3, 0.4) },
  orchard: { ...TEMPERATE, scree: 0.2, grass: meadow(0.9, 0.8) },
  longleaf: { ...TEMPERATE, scree: 0.2, grass: savanna(0.7, 0.75) },
  mangrove: { ...COAST, swashPeriodS: 6.5, swashReachM: 4, swashStrength: 0.9, rimTint: MOSS, grass: reed(0.7, 1.5, 0.85, 0.45) },
  saltwind: { ...COAST, swashPeriodS: 7.5, swashReachM: 6, scree: 0.2, grass: dune(0.6) },
  reservoir: { ...STILL_WATER, scree: 0.3, grass: meadow(0.8, 0.85, { reedMargin: 0.5 }) },
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
  reduxB: [number, number, number, number];
  reduxC: [number, number, number, number];
} {
  const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.min(1.3, Math.max(0, v)) : 0);
  const tint = (v: number): number => (Number.isFinite(v) ? Math.min(1.5, Math.max(0.3, v)) : 1);
  return {
    reduxA: [clamp01(profile.heightBlend), clamp01(profile.midDetail), clamp01(profile.scree), clamp01(profile.glint)],
    reduxFold: [clamp01(profile.foldMoist), clamp01(profile.foldAO), clamp01(profile.foldCrest), 0],
    reduxSwash: [
      profile.swashPeriodS > 0 ? (2 * Math.PI) / profile.swashPeriodS : 0,
      // round 73b: the reach in metres (1..12 — the shore byte spans 32 m and the high-water mark sits at 1.3 × reach + 0.8)
      Math.min(12, Math.max(1, Number.isFinite(profile.swashReachM) ? profile.swashReachM : 2.5)),
      // the strength runs to 1.6 (a film darkened 67 %): the Saltwind probe read 1.5 as wet sand, 1.0 as nothing
      Number.isFinite(profile.swashStrength) ? Math.min(1.6, Math.max(0, profile.swashStrength)) : 0,
      clamp01(profile.swashLines),
    ],
    reduxSnow: [clamp01(profile.snowMacro), clamp01(profile.snowRipple), 0],
    reduxB: [clamp01(profile.lip), clamp01(profile.verge), clamp01(profile.rim), clamp01(profile.midAlbedo)],
    reduxC: [tint(profile.rimTint?.[0] ?? 1), tint(profile.rimTint?.[1] ?? 1), tint(profile.rimTint?.[2] ?? 1), clamp01(profile.driftEdge)],
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
