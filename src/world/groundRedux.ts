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
  /** Terrain v2 (2026-10-01, grounded realism): slope exposure — how strongly a slope turned to the map's sun dries
   * and pales and a slope turned away holds moisture (0 = off, 1.3 max), and which ecology answers it: `vegetated`
   * (straw on the sun side, moss on the shade side), `arid` (bleach vs varnish), `snow` (crust vs powder). */
  exposure: number;
  climate: 'vegetated' | 'arid' | 'snow';
  /** Terrain v2: how far the cliff beds leave the world-height sine for the non-periodic bed signal (0..1). */
  bedIrregularity: number;
  /** Terrain v2: the cover's own 2–8 m patchwork (paler and darker swards, lag and blown sand, crust and powder), 0..1. */
  patchwork: number;
  /** Terrain v2: the wind's share of the map's authored sand ripples (splat.rippleAmp): 1 where wind shapes the sand,
   * 0 where nothing blows (an airless regolith keeps its impact texture, no ripples). */
  windRipple: number;
  /** Ground lane (2026-10-03): a volcanic basin's zoning (0 = off, 1 = full): pumice and ash on the level ground,
   * black and red cinder streaked down the fall line on the cones' flanks, talus aprons at their feet — keyed to the
   * slopes and folds of the landforms, not to a wind (the material's uReduxFold.w). */
  volcanic?: number;
  /** Ground lane (2026-10-08, the gauntlet's wave 260 on Cinder Junction): the map's village is a rail yard floored in
   * cinder — the material draws ash, clinker, coal dust, rust and oil there (uYardCinder) and the tiers that grow on
   * the ground come up in weed clumps (cinderYardWeedsAt, the height field's `_yardWeedsAt`) instead of a scatter.
   * 0 = off (every other map), 1 = the yard. */
  cinderYard?: number;
  /** Ground lane (2026-10-08, the gauntlet's wave 274 on Monsoon Ridge: "one uniform carpet of identical-height grass with
   * no thinning on the steeper upper slope … no dry stems"): the sward follows its ground — thinner and shorter up a
   * steep slope, drier and paler on a slope turned to the sun (the hollows' lusher sward is the fold law's already). The
   * height field publishes it with the map's sun (`_swardSlope`); the tall grass and the tufts read it. 0 = off. */
  swardSlope?: number;
  /** Ground lane (2026-10-08, wave 274's Monsoon foot: "a smooth, flat, saturated lawn-green surface with no soil, litter
   * or dry thatch" under the sward): the ground under a thick sward near the camera is last season's thatch and the soil
   * between the tussocks, not lawn (the material's uThatch). 0 = off. */
  thatch?: number;
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

// Ground lane (2026-10-03, albedo calibration with the light lane — under its calibrated camera the old blade tips
// (luminance 0.36, a pale lime) rendered Amberford at L* 70+): every sward's linear albedo is set to measured values —
// fresh green blades 0.10–0.20 (luminance), cured and dry grass 0.20–0.30. The light model, not the albedo, makes a
// sunlit meadow bright.
// (wave 71, every grass view: "thin black stems poking up everywhere", "evenly spaced dark sticks") a root a third of
// its tip — the sward's own shade baked into the albedo — drew every blade's lower half near-black wherever it stood
// apart from the tufts, against cards whose bases are lit: a blade's sheath is paler and yellower than its tip, not
// darker. Every root is now half its tip's luminance, a little warmer; the shade inside a dense sward is the light's.
const MEADOW_BASE = [0.052, 0.078, 0.030] as const;  // luminance 0.069
// (wave 71, Verdant: "flat, oversaturated neon" — the frames' sward at HSV saturation 0.81 under the grade's boost, the
// blue channel clipped to nothing in its shade) a summer meadow's blade tip is a less saturated green (was
// 0.085 / 0.170 / 0.035: green four times its blue)
const MEADOW_TIP = [0.092, 0.160, 0.045] as const;   // 0.137
const MEADOW_DRY = [0.27, 0.22, 0.095] as const;     // 0.22

const meadow = (density: number, heightM = 0.85, over: Partial<TallGrassBiome> = {}): TallGrassBiome => ({
  kind: 'meadow', density, heightM, heightVar: 0.35, widthM: 0.05, base: MEADOW_BASE, tip: MEADOW_TIP, dry: MEADOW_DRY,
  waterBand: 0, bank: 1, reedMargin: 0, windDir: [0.8, 0.6], ...over,
});
const steppe = (density: number, heightM = 1.05): TallGrassBiome => ({
  kind: 'steppe', density, heightM, heightVar: 0.40, widthM: 0.045, base: [0.170, 0.135, 0.060], tip: [0.33, 0.27, 0.12],
  dry: [0.36, 0.29, 0.13], waterBand: 0, bank: 1, reedMargin: 0, windDir: [0.92, 0.38], // feather grass: cured, 0.27
});
const savanna = (density: number, heightM = 0.95): TallGrassBiome => ({
  kind: 'savanna', density, heightM, heightVar: 0.45, widthM: 0.05, base: [0.155, 0.130, 0.060], tip: [0.30, 0.26, 0.13],
  dry: [0.33, 0.27, 0.12], waterBand: 0, bank: 1, reedMargin: 0, windDir: [0.6, 0.8], // pale tussock: 0.25
});
// round 73b: reeds are a margin — dense only at the waterline (waterBand 0.85 at mask 0.04–0.10, gone by 0.40), taller at the
// waterline (the tier lifts the fringe 30 % over the bank's 1.6 m, to the 1.9 m cap) —
// not the carpet of round 73 (1.0 across the whole 0.04–0.6 band); `bank` is the banks' own meadow relative to the
// reed density (round 73 overrode the density itself, which made the margin no denser than the bank)
const reed = (density: number, heightM = 1.6, waterBand = 0.85, bank = 0): TallGrassBiome => ({
  kind: 'reed', density, heightM, heightVar: 0.30, widthM: 0.06, base: [0.080, 0.095, 0.035], tip: [0.16, 0.19, 0.07],
  dry: [0.28, 0.24, 0.11], waterBand, bank, reedMargin: 0, windDir: [0.3, 0.95], // reed: 0.18
});
// dead sedge through the snow: dark straw, thin and short — the first sheet's pale 0.46 tips lit white under the
// snow maps' fill and read as frost spikes; round 73b keeps it to the hollows and the lee sides in clumps (the
// tier's admission law), so the density here is the clump's, not a carpet's
// ground lane (2026-10-03, the gauntlet: "single toothpick grass stalks" on the winter snow): the sedge reads as dead
// winter grass — a dull tan between the round-73 frost spikes (0.46) and the near-black sticks (0.17) — and every
// blade of a clump differs (tallGrass.ts: its own height, lean and tone)
const tundra = (density: number, heightM = 0.36): TallGrassBiome => ({
  kind: 'tundra', density, heightM, heightVar: 0.45, widthM: 0.028, base: [0.130, 0.105, 0.055], tip: [0.25, 0.20, 0.105],
  dry: [0.27, 0.21, 0.11], waterBand: 0, bank: 1, reedMargin: 0, windDir: [0.95, 0.3],
});
// ground lane (2026-10-03, the gauntlet's wave 4 on Cinder Junction: "sparse isolated straight grass blades like
// toothpicks"): a trodden verge is a short, broad-bladed sward in clumps, not a scatter of tall thin stalks
const verge = (density: number, heightM = 0.38): TallGrassBiome => ({
  kind: 'verge', density, heightM, heightVar: 0.45, widthM: 0.06, base: [0.055, 0.082, 0.025], tip: [0.10, 0.16, 0.045],
  dry: [0.25, 0.21, 0.10], waterBand: 0, bank: 1, reedMargin: 0, windDir: [0.7, 0.7], // trodden verge: 0.14
});
const dune = (density: number, heightM = 0.8): TallGrassBiome => ({
  kind: 'dune', density, heightM, heightVar: 0.40, widthM: 0.04, base: [0.100, 0.115, 0.050], tip: [0.19, 0.22, 0.10],
  dry: [0.30, 0.27, 0.14], waterBand: 0, bank: 1, reedMargin: 0, windDir: [-0.9, 0.44], // marram, grey-green: 0.21
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
  exposure: 0.9, climate: 'vegetated', bedIrregularity: 1, patchwork: 1, windRipple: 1,
};
// the arid maps' worn-sand patches take a gentler transition (the owner's history with black contours on sand): the
// hard-edge share on Sirocco's chase view went 8 → 22 % at 0.45 with no grass in the frame; the lip stays low there
const ARID: Omit<GroundReduxProfile, 'grass'> = {
  ...TEMPERATE, heightBlend: 0.3, foldMoist: 0.35, foldAO: 0.55, foldCrest: 0.35,
  lip: 0.25, verge: 0.5, rim: 0.5, rimTint: DUST, midAlbedo: 0.7, exposure: 0.8, climate: 'arid', patchwork: 0.7,
};
// ground lane (2026-10-03, the gauntlet: "a featureless grey-white plane... no drifts, crust, tracks or depth"): the
// wind-carved sastrugi and drift waves read under the camera (snowRipple 0.16 → 0.26)
const SNOW: Omit<GroundReduxProfile, 'grass'> = {
  ...TEMPERATE, heightBlend: 0.5, glint: 0.9, snowRipple: 0.26, snowMacro: 0.6, foldMoist: 0.22, foldAO: 0.6, foldCrest: 0.3,
  lip: 0.4, verge: 0.3, rim: 0.5, rimTint: HOAR, midAlbedo: 0.6, driftEdge: 1.0, exposure: 0.7, climate: 'snow', patchwork: 0.6,
};
// ground lane (2026-10-03, Caldera's gauntlet: "dunes on a volcanic basin — one monotone tan-brown in uniform wind-ripple
// corrugation"): a volcanic basin's rock greyed by lichen. The VOLCANIC profile it was made for (Las Cañadas: no wind's
// patchwork or ripples, the ground zoned by its landforms) went with Caldera's Aso identity (the map-revival lane, merged
// in batch 4, 2026-10-06); the zoning stays a profile field (`volcanic`) for the next volcanic place.
const BASALT_LICHEN = [0.90, 0.94, 0.86] as const;
const COAST: Omit<GroundReduxProfile, 'grass'> = {
  ...TEMPERATE, swashPeriodS: 8.5, swashReachM: 4.5, swashStrength: 1.5, swashLines: 1.0,
};
const STILL_WATER: Omit<GroundReduxProfile, 'grass'> = {
  ...TEMPERATE, swashPeriodS: 0, swashReachM: 2.5, swashStrength: 0.6, swashLines: 0.4,
};

/** Every battlefield's row (an unknown id runs TEMPERATE with no sward). */
const PROFILES: Readonly<Record<string, GroundReduxProfile>> = Object.freeze({
  verdant: { ...TEMPERATE, scree: 0.25, grass: meadow(1.0) },
  desert: { ...ARID, grass: null },
  winter: { ...SNOW, scree: 0.35, grass: tundra(0.35) },
  urban: { ...TEMPERATE, scree: 0.15, grass: verge(0.5) },
  coastal: { ...COAST, swashReachM: 6, scree: 0.2, grass: dune(0.55) },
  // maps lane B (2026-10-03, gauntlet wave 28): the river's margin is a steady damp bank with a wrack line and reeds
  autumn: { ...STILL_WATER, scree: 0.3, grass: meadow(1.0, 0.9, { base: [0.135, 0.108, 0.042], tip: [0.26, 0.21, 0.08], dry: [0.30, 0.23, 0.08], reedMargin: 0.5 }) },
  steppe: { ...TEMPERATE, foldMoist: 0.5, scree: 0.2, grass: steppe(1.2) },
  railyard: { ...TEMPERATE, scree: 0.15, grass: verge(0.55), cinderYard: 1 },
  frontier: { ...TEMPERATE, foldMoist: 0.55, scree: 0.3, grass: savanna(0.85) },
  fjord: { ...COAST, swashPeriodS: 9.5, swashReachM: 4, swashStrength: 1.0, scree: 0.4, grass: dune(0.5) },
  delta: { ...STILL_WATER, rimTint: MOSS, grass: reed(0.75, 1.6, 0.85, 0.5) },
  // (the Redrock lane, round 9, the gauntlet's wave 261: the walls meet the sand "with no talus, sand ramps or contact
  // shadow" — the folds at the walls' feet and in the ravines take more of the sky's occlusion, as Copper Mesa's do)
  badlands: { ...ARID, grass: null, foldAO: 0.68 },
  // (2026-10-08, wave 274: the sward follows its slopes and stands on thatch and soil)
  monsoon: { ...STILL_WATER, swashStrength: 0.5, swashReachM: 3, scree: 0.3, rimTint: MOSS, swardSlope: 1, thatch: 1,
    grass: meadow(0.9, 1.0, { base: [0.042, 0.090, 0.022], tip: [0.080, 0.180, 0.040], dry: [0.22, 0.22, 0.09], reedMargin: 0.55 }) },
  alpine: { ...SNOW, scree: 0.6, grass: tundra(0.3) },
  // (the map-revival lane, Caldera round 2: Aso's floor is farmed and its slopes grazed grassland on black volcanic soil —
  // a humid caldera's sward, not Las Cañadas's pumice and ash zoning; the rock keeps the basalt's lichen)
  caldera: { ...TEMPERATE, rimTint: BASALT_LICHEN, scree: 0.3, windRipple: 0,
    grass: meadow(0.9, 0.85, { base: [0.030, 0.040, 0.014], tip: [0.13, 0.17, 0.045], dry: [0.26, 0.22, 0.09] }) },
  foundry: { ...TEMPERATE, scree: 0.15, grass: verge(0.5) },
  ruinspires: { ...TEMPERATE, scree: 0.2, grass: verge(0.5) },
  blackglass: { ...TEMPERATE, scree: 0.2, grass: verge(0.4) },
  titan_gorge: { ...ARID, grass: null },
  skybridge: { ...ARID, swashPeriodS: 0, swashReachM: 2.5, swashStrength: 0.4, swashLines: 0.3, grass: null },
  polders: { ...STILL_WATER, grass: reed(0.7, 1.5, 0.85, 0.7) },
  // (the map-revival lane, Copper Mesa round 2: Queenstown's bare conglomerate — no wind's patchwork or ripples, the
  // rills' hollows darker and damper, scree at the slopes' feet)
  copper_mesa: { ...ARID, patchwork: 0, windRipple: 0, foldMoist: 0.5, foldAO: 0.65, scree: 0.45, grass: null },
  airfield: { ...TEMPERATE, grass: verge(0.6, 0.45) },
  // (round 2, the gauntlet's wave 125: "corduroy ripples" and "lawn-green tufts" — the wind's ripples at four tenths, the
  // reeds at the spring's waterline, a trace of their meadow on the dry banks: 0.05, was 0.2)
  oasis: { ...ARID, windRipple: 0.4, swashPeriodS: 0, swashReachM: 2.5, swashStrength: 0.5, swashLines: 0.3, grass: reed(0.5, 1.4, 0.85, 0.05) },
  // trees round 2b (2026-10-03, gauntlet wave 28): Whiteout Station stands on an ice sheet — no sward through the ice
  whiteout: { ...SNOW, scree: 0.3, grass: null },
  orchard: { ...TEMPERATE, scree: 0.2, grass: meadow(0.9, 0.8) },
  longleaf: { ...TEMPERATE, scree: 0.2, grass: savanna(0.7, 0.75) },
  mangrove: { ...COAST, swashPeriodS: 6.5, swashReachM: 3, swashStrength: 0.9, rimTint: MOSS, grass: reed(0.7, 1.5, 0.85, 0.45) },
  // (wave 177 and 2026-10-08's wave 287, Saltwind: "thick, evenly spaced and plastic-looking" blades over a "lush
  // lawn-green carpet") the karst's sward is a garrigue's — the marram's backshore law (dense by the water, thin inland),
  // its blades thinner and shorter, cured yellow-grey rather than grey-green
  saltwind: { ...COAST, swashPeriodS: 7.5, swashReachM: 4.5, swashStrength: 1.6, scree: 0.2,
    grass: { ...dune(0.5, 0.62), widthM: 0.032, base: [0.125, 0.115, 0.062], tip: [0.24, 0.22, 0.13], dry: [0.30, 0.26, 0.15] } },
  reservoir: { ...STILL_WATER, scree: 0.3, grass: meadow(0.8, 0.85, { reedMargin: 0.5 }) },
  mars: { ...ARID, foldMoist: 0, exposure: 0.5, grass: null },
  moon: { ...ARID, foldMoist: 0, exposure: 0, windRipple: 0, grass: null }, // airless regolith: no weathering follows the sun, no wind ripples
  cliffbridge: { ...TEMPERATE, scree: .3, grass: meadow(1.0) },
});

const DEFAULT_PROFILE: GroundReduxProfile = Object.freeze({ ...TEMPERATE, grass: null });

export function groundReduxProfileIds(): string[] {
  return Object.keys(PROFILES);
}

/**
 * Ground lane (2026-10-08, the gauntlet's wave 260 on Cinder Junction's yard: "evenly spaced, saturated green
 * single-blade sprites that look like seedlings in a ploughed field, not weeds in a cinder yard"): a cinder yard's
 * weeds come up in clumps — a metre or two across, a few to every ten metres, ragged at their edges — and nothing grows
 * on the trodden cinder between them. The clump's weight at (x, z), 0..1: three value noises, 2.6 m, 1.7 m and 0.9 m,
 * each on its own turned grid (no clump squared to the axes), summed and cut at 0.60–0.72 — about a seventh of the floor
 * (an integer position hash: the client, the host and the receipts read the same field). The tall grass and the tufts
 * keep to it inside the yard (the height field's `_yardWeedsAt` on a map whose profile has a cinder yard).
 */
export function cinderYardWeedsAt(x: number, z: number): number {
  const v = yardValueNoise((0.799 * x - 0.602 * z) / 2.6, (0.602 * x + 0.799 * z) / 2.6, 0x5c1d) * 0.55
    + yardValueNoise((0.934 * x + 0.358 * z) / 1.7, (-0.358 * x + 0.934 * z) / 1.7, 0x2b7e) * 0.30
    + yardValueNoise((0.326 * x - 0.946 * z) / 0.9, (0.946 * x + 0.326 * z) / 0.9, 0x7d31) * 0.15;
  const t = Math.min(1, Math.max(0, (v - 0.60) / 0.12));
  return t * t * (3 - 2 * t);
}
function yardValueNoise(fx: number, fz: number, salt: number): number {
  const ix = Math.floor(fx), iz = Math.floor(fz);
  const tx = fx - ix, tz = fz - iz;
  const sx = tx * tx * (3 - 2 * tx), sz = tz * tz * (3 - 2 * tz);
  const h = (a: number, b: number): number => {
    let k = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ salt;
    k = Math.imul(k ^ (k >>> 15), 0x85ebca6b);
    k = Math.imul(k ^ (k >>> 13), 0xc2b2ae35);
    return ((k ^ (k >>> 16)) >>> 0) / 4294967295;
  };
  const a = h(ix, iz) + (h(ix + 1, iz) - h(ix, iz)) * sx;
  const b = h(ix, iz + 1) + (h(ix + 1, iz + 1) - h(ix, iz + 1)) * sx;
  return a + (b - a) * sz;
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
  reduxD: [number, number, number, number];
} {
  const clamp01 = (v: number): number => (Number.isFinite(v) ? Math.min(1.3, Math.max(0, v)) : 0);
  const tint = (v: number): number => (Number.isFinite(v) ? Math.min(1.5, Math.max(0.3, v)) : 1);
  return {
    reduxA: [clamp01(profile.heightBlend), clamp01(profile.midDetail), clamp01(profile.scree), clamp01(profile.glint)],
    // (the fourth: the ground lane's volcanic zoning, 0 on every other map)
    reduxFold: [clamp01(profile.foldMoist), clamp01(profile.foldAO), clamp01(profile.foldCrest), Math.min(1, clamp01(profile.volcanic ?? 0))],
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
    // terrain v2: exposure strength, the climate class (0 vegetated, 1 arid, 2 snow), the bed irregularity, the patchwork
    reduxD: [clamp01(profile.exposure ?? 0), profile.climate === 'snow' ? 2 : profile.climate === 'arid' ? 1 : 0,
      Math.min(1, clamp01(profile.bedIrregularity ?? 0)), Math.min(1, clamp01(profile.patchwork ?? 0))],
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
