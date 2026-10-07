/** Shallow presentation water; the authored drivable bed remains authoritative. */
interface WaterContactProfile {
  kind: 'coast' | 'lake' | 'river' | 'marsh';
  depthM: number;
  color: number;
  opacity: number;
  roughness: number;
  flowX: number;
  flowZ: number;
  shoreColor: number;
  waveScale: number;
  waveStrength: number;
  /** Water 2026-09-12: bank-side tint the deep colour rises out of (sunlit bed). */
  shallowColor: number;
  /** Water 2026-09-12: shoreline foam and crest strength (0 disables). */
  foam: number;
  /** the skies lane (2026-10-06): a coast's shelf turquoise share (shallowWater.ts SEA_TINT.turquoise when absent) */
  seaTurquoise?: number;
  /** the skies lane (2026-10-06): a coast's deep-body darkening (shallowWater.ts SEA_TINT.deepDarken when absent) */
  seaDeepDarken?: number;
  /** the skies lane (2026-10-07): a coast's share of the shader's deep blue over its own deep colour (SEA_TINT.deepBlue when
   *  absent) — a northern sea keeps its own slate */
  seaDeepBlue?: number;
  /** the skies lane (2026-10-07): a coast's clarity over the shelf (SEA_SHELF.shallowAlpha when absent) — a northern sea's
   *  shallows are opaque green-grey, not a window onto a sand bed */
  seaShallowAlpha?: number;
}

const COAST: Readonly<WaterContactProfile> = Object.freeze({
  // water pass 3 (2026-09-12): lit once (cascade setup) the sea takes a lighter
  // teal and stronger wave relief; the 1049e4e bay's lively texture is the target.
  kind: 'coast', depthM: 0.72, color: 0x1d5266, opacity: 0.72, roughness: 0.24,
  shallowColor: 0x3d8a86, foam: 0.85,
  flowX: 0.012, flowZ: 0.008, shoreColor: 0x607770, waveScale: 0.064, waveStrength: 1.6,
});
// water pass 3 (2026-09-12): every profile's wave relief rose ~45 % — the sheet is lit
// once now (cascade setup) and the old values read as one flat sheet.
const LAKE: Readonly<WaterContactProfile> = Object.freeze({
  kind: 'lake', depthM: 0.58, color: 0x1f4443, opacity: 0.70, roughness: 0.28,
  shallowColor: 0x4f8a72, foam: 0.35,
  flowX: 0.004, flowZ: 0.003, shoreColor: 0x60705c, waveScale: 0.052, waveStrength: 0.8,
});
const RIVER: Readonly<WaterContactProfile> = Object.freeze({
  kind: 'river', depthM: 0.64, color: 0x2a4a40, opacity: 0.72, roughness: 0.34,
  shallowColor: 0x6b8a58, foam: 0.45,
  flowX: 0.016, flowZ: 0.005, shoreColor: 0x6c6950, waveScale: 0.072, waveStrength: 0.9,
});
const MARSH: Readonly<WaterContactProfile> = Object.freeze({
  kind: 'marsh', depthM: 0.43, color: 0x373a25, opacity: 0.74, roughness: 0.46,
  shallowColor: 0x6a6f3e, foam: 0.15,
  flowX: 0.002, flowZ: 0.003, shoreColor: 0x696344, waveScale: 0.043, waveStrength: 0.5,
});
const POLDER: Readonly<WaterContactProfile> = Object.freeze({
  ...MARSH, color: 0x1f3835, opacity: 0.73, roughness: 0.40,
  shoreColor: 0x66715d, waveScale: 0.048, waveStrength: 0.6,
});
// The northern seas (the skies lane, 2026-10-07; the gauntlet's wave 189 on Nordhavn's bird: "rounded turquoise ponds
// rather than dark, steep-walled water", wave 243: "the fjord arms read as shallow turquoise lagoons with blotchy pale
// patches", wave 247 on Saltmere: "swimming-pool turquoise water"): North Atlantic, Channel and Norwegian water is dark
// green-grey to slate, deep and opaque, the sky's reflection carrying its light — never a sand bed's turquoise. Their own
// palette: no shelf turquoise, little of the shader's deep blue over their own slate, the shallows opaque green-grey.
const FJORD: Readonly<WaterContactProfile> = Object.freeze({
  ...COAST, color: 0x16292e, opacity: 0.80, roughness: 0.22, shallowColor: 0x34484a, foam: 0.7,
  shoreColor: 0x4f6264, flowX: 0.009, flowZ: 0.006, waveScale: 0.057, waveStrength: 1.0,
  // a fjord's water is deep to its walls: no shelf turquoise, the body darker, the bank the cold grey of a rock shore
  seaTurquoise: 0, seaDeepDarken: 0.45, seaDeepBlue: 0.15, seaShallowAlpha: 0.8,
});
const SALTWIND: Readonly<WaterContactProfile> = Object.freeze({
  ...COAST, color: 0x22484f, opacity: 0.74, roughness: 0.34, shallowColor: 0x5a8f88, foam: 1.0,
  shoreColor: 0x737561, waveScale: 0.070, waveStrength: 1.2,
});
const RESERVOIR: Readonly<WaterContactProfile> = Object.freeze({
  ...LAKE, color: 0x173a4d, opacity: 0.75, roughness: 0.22, shallowColor: 0x3f8082, foam: 0.3,
  shoreColor: 0x596e6d, waveScale: 0.046, waveStrength: 0.7,
});
const OASIS: Readonly<WaterContactProfile> = Object.freeze({
  ...LAKE, color: 0x185a4e, opacity: 0.70, roughness: 0.26, shallowColor: 0x5faf98, foam: 0.25,
  shoreColor: 0x827758, waveScale: 0.058, waveStrength: 0.75,
});
const MONSOON: Readonly<WaterContactProfile> = Object.freeze({
  ...RIVER, color: 0x414132, opacity: 0.75, roughness: 0.43,
  shoreColor: 0x73664d, flowX: 0.013, flowZ: 0.007, waveScale: 0.063, waveStrength: 0.52,
});
// maps lane B (2026-10-03, gauntlet wave 28: Amberford's waterline had "a pale cyan rim"): the river's thin edge film
// took the sage RIVER shallows (0x6b8a58) and the sky's sheen at a low aerial view; a lowland river's shallows are
// silt over a muddy bed
const AUTUMN: Readonly<WaterContactProfile> = Object.freeze({
  ...RIVER, color: 0x383520, opacity: 0.73, roughness: 0.42, shallowColor: 0x5b5236,
  shoreColor: 0x6a593d, flowX: 0.010, flowZ: 0.004, waveScale: 0.052, waveStrength: 0.44,
});

// Per-map water bodies (triple-A pass 2026-09-14, owner: "more varied colors that are more like
// real life", beyond the turbidity field): each body takes the hue real water of its kind shows —
// glacial melt is milky turquoise, a canal is green-grey, a monsoon river is silt ochre, a mangrove
// creek is tannin-dark, an oasis pool is clear turquoise over pale sand, industrial basins are
// grey-green, a caldera lake mineral grey. Wave and flow behaviour stays with the body kind.
const GLACIAL_LAKE: Readonly<WaterContactProfile> = Object.freeze({
  ...LAKE, color: 0x2a7f8e, opacity: 0.68, roughness: 0.20, shallowColor: 0x8fd2d0, foam: 0.30,
  shoreColor: 0x8a9a93, waveScale: 0.046, waveStrength: 0.6,
});
const WINTER_LAKE: Readonly<WaterContactProfile> = Object.freeze({
  ...LAKE, color: 0x2b4657, opacity: 0.74, roughness: 0.18, shallowColor: 0x7d9db0, foam: 0.2,
  shoreColor: 0x7f8b90, waveScale: 0.040, waveStrength: 0.45,
});
const TEMPERATE_POND: Readonly<WaterContactProfile> = Object.freeze({
  ...LAKE, color: 0x23483f, shallowColor: 0x5f9470, shoreColor: 0x5f6f58,
});
const SILT_RIVER: Readonly<WaterContactProfile> = Object.freeze({
  ...RIVER, color: 0x3f4a33, opacity: 0.74, roughness: 0.36, shallowColor: 0x5a5a36, foam: 0.15,
  shoreColor: 0x776f4c, flowX: 0.018, flowZ: 0.006, waveScale: 0.068, waveStrength: 0.8,
});
const TANNIN_CREEK: Readonly<WaterContactProfile> = Object.freeze({
  ...MARSH, color: 0x2b2a1a, opacity: 0.78, roughness: 0.40, shallowColor: 0x5a5731, foam: 0.12,
  shoreColor: 0x5e5a3e, waveScale: 0.040, waveStrength: 0.45,
});
// Tidegate Polders' oxbow and canals (the skies lane, 2026-10-07; the gauntlet's wave 248: "a flat, opaque teal decal",
// "a hard white outline at the waterline", "a glowing pale-green halo at the waterline"): still, silty Scheldt water is
// grey-brown-green and dull. The halo was the bank band — the sunlit-bed tint at the waterline, a pale green (0x5f8a6e)
// against the dark body, under a pale bank tint and the foam: a lake's shore read on still water. The bank now rises out
// of the body's own silt (a step lighter, no green), the bank tint is wet mud, no foam, and the surface is duller.
const CANAL: Readonly<WaterContactProfile> = Object.freeze({
  ...POLDER, color: 0x353a2e, shallowColor: 0x434634, shoreColor: 0x3f3d31, foam: 0, roughness: 0.42,
  waveScale: 0.044, waveStrength: 0.4,
});
const INDUSTRIAL_BASIN: Readonly<WaterContactProfile> = Object.freeze({
  ...LAKE, color: 0x2c3a3c, opacity: 0.78, roughness: 0.30, shallowColor: 0x56706c, foam: 0.15,
  shoreColor: 0x646a66, waveScale: 0.050, waveStrength: 0.5,
});
const CALDERA_LAKE: Readonly<WaterContactProfile> = Object.freeze({
  ...LAKE, color: 0x3a3d39, opacity: 0.80, roughness: 0.28, shallowColor: 0x6f7168, foam: 0.1,
  shoreColor: 0x5d5b54, waveScale: 0.044, waveStrength: 0.4,
});
// Suzhou Creek (blackglass; the map-revival lane, 2026-10-05): the city creek's dark silt-laden water, a slow drift
// east toward the Huangpu, little foam; the lake's wading depth (the bridges' decks were set over it)
const SUZHOU_CREEK: Readonly<WaterContactProfile> = Object.freeze({
  ...LAKE, color: 0x343528, opacity: 0.80, roughness: 0.34, shallowColor: 0x605c42, foam: 0.08,
  shoreColor: 0x5e5a4c, flowX: 0.010, flowZ: 0.002, waveScale: 0.050, waveStrength: 0.45,
});
const MOUNTAIN_LAKE: Readonly<WaterContactProfile> = Object.freeze({
  ...LAKE, color: 0x1e4a5f, opacity: 0.72, roughness: 0.20, shallowColor: 0x5f9db0, foam: 0.3,
  shoreColor: 0x6d7d80, waveScale: 0.048, waveStrength: 0.65,
});
const MUD_POOL: Readonly<WaterContactProfile> = Object.freeze({
  ...MARSH, color: 0x4a4635, opacity: 0.80, roughness: 0.48, shallowColor: 0x7d7450, foam: 0.1,
  shoreColor: 0x7a6c4d, waveScale: 0.040, waveStrength: 0.35,
});
const CLEAR_OASIS: Readonly<WaterContactProfile> = Object.freeze({
  ...OASIS, color: 0x1e6f64, shallowColor: 0x7fd0bd, opacity: 0.66, roughness: 0.22,
});
const MONSOON_FLOOD: Readonly<WaterContactProfile> = Object.freeze({
  ...MONSOON, color: 0x4d4a2e, shallowColor: 0x5a5233, opacity: 0.78, foam: 0.12,
});
// Saltmere (Brittany's granite coast): the bay over sand a cold grey-green, the body slate, opaque (the northern seas, above)
const COLD_SEA: Readonly<WaterContactProfile> = Object.freeze({
  ...COAST, color: 0x1c3036, shallowColor: 0x4a5f58, shoreColor: 0x5a6660,
  seaTurquoise: 0, seaDeepDarken: 0.55, seaDeepBlue: 0.15, seaShallowAlpha: 0.7,
});

export function waterContactProfile(mapId: string): Readonly<WaterContactProfile> {
  switch (mapId) {
    case 'fjord': return FJORD;
    case 'saltwind': return SALTWIND;
    case 'coastal': return COLD_SEA;
    case 'reservoir': return RESERVOIR;
    case 'oasis': return CLEAR_OASIS;
    case 'monsoon': return MONSOON_FLOOD;
    case 'autumn': return AUTUMN;
    case 'mangrove': return TANNIN_CREEK;
    case 'polders': return CANAL;
    case 'delta': return SILT_RIVER;
    case 'alpine': return GLACIAL_LAKE;
    case 'winter': case 'whiteout': return WINTER_LAKE;
    case 'verdant': case 'orchard': case 'longleaf': case 'frontier': return TEMPERATE_POND;
    case 'urban': case 'railyard': case 'foundry': case 'ruinspires': case 'airfield': return INDUSTRIAL_BASIN;
    case 'caldera': return CALDERA_LAKE;
    case 'blackglass': return SUZHOU_CREEK;
    case 'skybridge': case 'titan_gorge': return MOUNTAIN_LAKE;
    case 'badlands': case 'copper_mesa': return MUD_POOL;
    default: return LAKE;
  }
}

/** Coverage comes from the existing wet mask, including dry roads/pads and ice. */
export function shallowWaterDepth(coverage: number, depthM: number): number {
  const wet = Math.max(0, Math.min(1, coverage));
  return depthM * wet * wet * (3 - 2 * wet);
}
