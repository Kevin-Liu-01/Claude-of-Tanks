// src/world/treeGrowth.ts — the grown trees (p2 trees lane, 2026-10-01): one procedural growth law for every
// battlefield species, replacing the card clouds of the round-3…77 builders.
//
// A tree is GROWN, not scattered: a trunk (or a leader), its scaffold limbs or whorls, their side branches and
// twigs, each a tapered tube that bends under its own weight and turns toward the light, clipped by the species'
// crown envelope; the foliage is a set of branch-spray cards (a leafy twig painted on a tile of the species' atlas)
// seated ON the outer branches and twig tips and oriented the way leaves are — sprays facing the sky on a broadleaf,
// flat horizontal sprays along a spruce limb, pendulous curtains on a willow or a birch, tufts at a pine's tips.
// Silhouette, gaps and structure therefore come from the branching, and the trunk-to-crown connection is real wood
// seen through real gaps.
//
// Two halves: the skeleton (THREE-free data — branches as node polylines with radius and wind flex, leaf sites as
// seated spray frames) and the emitters that turn it into the geometry the vegetation materials draw (tubes with
// bark UVs, vertex shade and aFlex; cards with tile UVs, volume normals, aFlex and the per-cluster cascade sample
// aCard; a coarse position-only shadow hull of the crown masses and the scaffold wood). Deterministic from the RNG
// the caller hands in; no per-frame work, no module state.
import * as THREE from 'three';

export type GrowthSpecies = 'oak' | 'poplar' | 'willow' | 'acacia' | 'eucalyptus'
  | 'pine' | 'spruce' | 'fir' | 'cedar' | 'cypress' | 'birch' | 'aspen' | 'palm' | 'snag' | 'mangrove'
  // trees round 2 (2026-10-03): the regional forms a battlefield's species slots grow as (treeBiomes.ts)
  | 'beech' | 'chestnut' | 'holmOak' | 'olive' | 'canaryPine' | 'aleppoPine' | 'larch'
  // the Arizona uplands' juniper and pinyon (Copper Mesa: the Sonoran/Chihuahuan upland cover, gauntlet wave 28)
  | 'juniper' | 'pinyon'
  // trees round 5 (2026-10-05, the map-revival lanes): the longleaf pine of the Gulf coastal plain (Longleaf Crossing),
  // the cedar of Lebanon (the Chouf, Orchard Valley), the Aso caldera's sugi and Japanese red pine (Obsidian Caldera)
  | 'longleafPine' | 'lebanonCedar' | 'sugi' | 'redPine'
  // the trees lane (2026-10-05): the Streuobst meadow orchard's fruit tree (Frontier Basin; its variants apple, pear, plum)
  | 'apple'
  // the trees lane (2026-10-06, the gauntlet's wave 157 on Monsoon Ridge): the Naga Hills' Khasi pine and bamboo
  | 'khasiPine' | 'bamboo'
  // the trees lane (2026-10-07): the Naga Hills' chestnut-oak (Castanopsis), the chestnut's crown on a lighter frame
  | 'castanopsis'
  // the trees lane (2026-10-07, round 8): the Kursk forest-steppe's common ash, a slot's wood form (treeBiomes.ts woodForms)
  | 'ash'
  // shrub-only forms (treeBiomes.ts `shrub`): the broom scrub of a volcanic upland; trees round 5: the longleaf's
  // grass-stage seedlings on a cutover — never a tree slot
  | 'broom' | 'longleafSeedling' | 'buddleia';
type Rng = () => number;

export const GROWTH_SPECIES: readonly GrowthSpecies[] = Object.freeze([
  'oak', 'poplar', 'willow', 'acacia', 'eucalyptus', 'pine', 'spruce', 'fir', 'cedar', 'cypress', 'birch', 'aspen', 'palm', 'snag',
  'mangrove', 'beech', 'chestnut', 'holmOak', 'olive', 'canaryPine', 'aleppoPine', 'larch', 'juniper', 'pinyon',
  'longleafPine', 'lebanonCedar', 'sugi', 'redPine', 'apple', 'khasiPine', 'bamboo', 'castanopsis', 'ash',
]);

/** How a crown envelope narrows from its base (t = 0) to its top (t = 1): the radius fraction at t. */
type EnvelopeShape = 'cone' | 'ellipsoid' | 'dome' | 'column' | 'umbrella' | 'flame' | 'tiered' | 'tuft' | 'shelf';

/** The card a leaf site takes: a spray seated on a branch, a hanging curtain, a flat tier spray, an upright frond. */
type SprayHabit = 'spray' | 'hanging' | 'flat' | 'upright' | 'tuft';

interface GrowthProfile {
  family: 'broadleaf' | 'conifer' | 'birch' | 'palm' | 'dead';
  /** Nominal height (m) at variant 1 and instance scale 1; the variants span ±heightSpread. */
  height: number;
  heightSpread: number;
  /** Stem radius (m) at breast height, above the root flare. */
  trunkR: number;
  /** 'excurrent' = one leader to the top (conifers, poplar, birch); 'decurrent' = the stem divides into scaffolds. */
  form: 'excurrent' | 'decurrent';
  /** Decurrent: the fork height (fraction of the height) and scaffold count. */
  forkAt: readonly [number, number];
  scaffolds: readonly [number, number];
  /** Scaffold angle from vertical (radians) and reach (fraction of the crown radius). */
  scaffoldAngle: readonly [number, number];
  /** Excurrent: where the live crown begins (fraction of the height). */
  crownBase: number;
  /** The crown radius (m) at variant 1. */
  crownR: number;
  envelope: EnvelopeShape;
  /** Primaries along the leader: whorled (count per whorl) or spiral; spacing in metres. */
  whorled: boolean;
  perWhorl: readonly [number, number];
  spacing: number;
  /** Primary angle from vertical at the crown base and at the top (radians). */
  angleLow: number;
  angleHigh: number;
  /** Gravity bend (radians over the branch) and tip upturn (radians over the last third). */
  droop: number;
  upturn: number;
  /** Side branches per metre of primary, their angle from the parent and length ratio. */
  sidePerM: number;
  sideAngle: number;
  sideRatio: number;
  sideDroop: number;
  /** Third order: twigs per metre on the side branches (0 = none). */
  twigPerM: number;
  /** Foliage: the lowest branch order that carries sprays, the sprays per metre on it, where along it they start. */
  leafOrder: number;
  leafPerM: number;
  leafFrom: number;
  /** Spray card length (m) range and width/length aspect. */
  spray: readonly [number, number];
  aspect: number;
  habit: SprayHabit;
  /** Extra sprays at a branch tip (a tuft). */
  tipSprays: number;
  /** Bend of a card along its length (droop as a fraction of its length). */
  cardBend: number;
  /** Flat sprays: the roll about the spray's axis (radians, ±) — a spruce's bottle-brush sprays tilt every way, a
   * fir's and a cedar's lie flat. Also the droop of the spray axis below its limb (radians). */
  flatRoll: number;
  flatDroop: number;
  /**
   * Trees round 4: the foliage's band under the crown's top (m at the profile's height; scales with the tree): a
   * parasol crown's sprays sit only this far below its top (the acacia's flat layer over bare limbs). 0 or unset: the
   * whole crown.
   */
  foliageBand?: number;
  /**
   * Trees round 4: how gnarled the wood grows, 0..1 (unset 0): its limbs meander in a wandering plane with more
   * segments and its bole crooks further (the olive's twisting limbs, where straight cylinders fanned from one fork).
   */
  gnarl?: number;
  /**
   * Bark style column of the bark atlas (vegetation.ts): 0 furrowed (the legacy sheet), 1 plated, 2 smooth/banded,
   * 3 papery, 4 the grown trees' furrowed bark (trees round 4: meandering ridges and furrows, where style 0's parallel
   * zigzag fissures read as a tyre tread).
   */
  bark: number;
  /** Bark tint (linear-ish multiplier around the neutral sheet) and its upper-stem shift (pine's orange top). */
  barkTint: readonly [number, number, number];
  barkTopTint: readonly [number, number, number] | null;
  /**
   * The crown's value in light: a multiplier on the card tint, set per species so a grown crown keeps the look in light
   * the legacy crown of its species had. First the effective albedo (card tint × atlas reflectance, .qa-dev
   * card-albedo, grown / legacy before: spruce 0.87, fir 0.90, pine 0.96, cedar 0.79, cypress 0.65, oak 0.76, acacia
   * 0.54–0.65, eucalyptus 0.61–0.77, palm 1.74, mangrove 0.67), then each species' crown in light (2026-10-02,
   * .qa-dev species-luma: one lone tree per species front- and side-lit, grown vs `?legacyTrees=1` in the same build;
   * the geometric means oak 0.79, acacia 0.51, eucalyptus 0.78, spruce 0.89, palm 1.32, mangrove 1.33 after the albedo
   * step, the rest within ±10 % or too few samples), applied part way. 1 when unset.
   */
  foliageValue?: number;
  /**
   * Trees round 5: a grass-stage seedling (shrub-only): its sprays fan from one seat at the ground, a fountain of long
   * needles, a few seedlings to a clump (growShrubSkeleton), where a shrub's mound of sprays stands on a shell.
   */
  fountain?: boolean;
  /**
   * Trees round 5 (the gauntlet's wave 98: Frontier's spruce "a smooth, uniform green cone with no needle-cluster
   * silhouette or branching"): how ragged a whorled crown's tiers grow, 0..1 (unset 0) — each whorl reaching its own
   * share of the cone and each limb in it its own share again, so the outline is serrated by limbs standing out and
   * falling short, not every tier ending on one cone.
   */
  ragged?: number;
  /**
   * Trees round 5 (the arid and volcanic lane's Monument Valley juniper: "often partly dead with silver deadwood"): the
   * share of a decurrent crown's scaffolds that stand dead, 0..1 (unset 0) — a dead limb and everything it carries bear no
   * sprays, its wood weathered silver-grey (GROWTH_DEADWOOD_TINT), the limb snapped short at its tip.
   */
  deadwood?: number;
  /**
   * Trees lane (2026-10-05): an orchard tree — open-grown wherever it stands (no forest-grown form in a wood: its slot
   * is never a forest species, forestGrownProfile keeps it), its variants their own shapes (variantShape) and tiles.
   */
  orchard?: boolean;
  /**
   * Trees lane (2026-10-06): a clump of stems from one rootstock, not a tree (the bamboo's culms): its scaffolds rise
   * from a stub at the ground and never fork, and it grows the same in a wood and in the open (no forest-grown form).
   */
  clump?: boolean;
  /**
   * Trees lane (2026-10-06, the gauntlet's wave 179: "the bamboo culms fan out from one point ... a single fountain"): the
   * radius (m) of a clump's rhizome base — each culm rises from its own seat on that disc, leaning out from it.
   */
  clumpR?: number;
  /**
   * Trees lane: each near variant's own shape over the profile (the Streuobst form's plum, apple and pear), grown at the
   * variant's age as every profile is; unset, the variants are the profile at three ages.
   */
  variantShape?: readonly [Partial<GrowthProfile>, Partial<GrowthProfile>, Partial<GrowthProfile>];
  /** Trees lane: the atlas tiles each near variant's sprays take (the Streuobst atlas paints a species a tile). */
  variantTiles?: readonly [readonly number[], readonly number[], readonly number[]];
}

const P = (p: GrowthProfile): Readonly<GrowthProfile> => Object.freeze(p);
const variantProfiles = new Map<Readonly<GrowthProfile>, Readonly<GrowthProfile>[]>();
/** A profile's variant shape (variantShape) over it, or the profile itself. */
function variantProfile(p: Readonly<GrowthProfile>, variant: number): Readonly<GrowthProfile> {
  if (!p.variantShape) return p;
  let list = variantProfiles.get(p);
  if (!list) { list = p.variantShape.map((shape) => P({ ...p, ...shape })); variantProfiles.set(p, list); }
  return list[variant];
}

/**
 * The species profiles at the battlefield's scale (the archetypes' heights and crown radii, treeSpecies.ts): a stand
 * reads as the right species from its silhouette alone — the oak's broad irregular dome on a short bole, the Lombardy
 * poplar's column, the weeping willow's curtains, the acacia's flat umbrella, the eucalyptus' tall open crown, the
 * Scots pine's high flat-topped tufts on a long orange bole, the spruce's dense spire to the ground, the fir's tiered
 * cone, the cedar's broad layered tiers, the Italian cypress' flame, the birch's slender weeping lattice, the aspen's
 * narrow oval, and the shell-killed snag.
 */
export const TREE_GROWTH_PROFILES: Readonly<Record<GrowthSpecies, Readonly<GrowthProfile>>> = Object.freeze({
  oak: P({
    family: 'broadleaf', height: 7.0, heightSpread: 0.12, trunkR: 0.30, form: 'decurrent',
    forkAt: [0.26, 0.33], scaffolds: [4, 6], scaffoldAngle: [0.28, 1.02], crownBase: 0.34, crownR: 2.75,
    envelope: 'dome', whorled: false, perWhorl: [1, 1], spacing: 0.55, angleLow: 1.15, angleHigh: 0.6,
    droop: 0.42, upturn: 0.38, sidePerM: 2.3, sideAngle: 0.75, sideRatio: 0.62, sideDroop: 0.35, twigPerM: 1.8,
    leafOrder: 1, leafPerM: 3.6, leafFrom: 0.15, spray: [0.62, 0.92], aspect: 0.86, habit: 'spray', tipSprays: 2,
    cardBend: 0.16, flatRoll: 0.6, flatDroop: 0.0, bark: 4, barkTint: [0.34, 0.31, 0.28], barkTopTint: null,
    foliageValue: 1.25,
  }),
  poplar: P({
    family: 'broadleaf', height: 8.2, heightSpread: 0.10, trunkR: 0.24, form: 'excurrent',
    forkAt: [0, 0], scaffolds: [0, 0], scaffoldAngle: [0, 0], crownBase: 0.16, crownR: 1.55,
    envelope: 'column', whorled: false, perWhorl: [1, 1], spacing: 0.42, angleLow: 0.42, angleHigh: 0.22,
    droop: 0.05, upturn: 0.30, sidePerM: 2.2, sideAngle: 0.45, sideRatio: 0.55, sideDroop: 0.05, twigPerM: 0,
    leafOrder: 1, leafPerM: 3.8, leafFrom: 0.15, spray: [0.55, 0.82], aspect: 0.78, habit: 'upright', tipSprays: 2,
    cardBend: 0.08, flatRoll: 0.6, flatDroop: 0.0, bark: 4, barkTint: [0.56, 0.54, 0.50], barkTopTint: [0.66, 0.64, 0.60],
  }),
  willow: P({
    family: 'broadleaf', height: 6.4, heightSpread: 0.10, trunkR: 0.38, form: 'decurrent',
    forkAt: [0.30, 0.40], scaffolds: [4, 6], scaffoldAngle: [0.42, 0.72], crownBase: 0.3, crownR: 3.25,
    envelope: 'dome', whorled: false, perWhorl: [1, 1], spacing: 0.5, angleLow: 1.2, angleHigh: 0.7,
    droop: 0.22, upturn: 0.0, sidePerM: 2.8, sideAngle: 1.15, sideRatio: 0.95, sideDroop: 2.4, twigPerM: 0,
    leafOrder: 2, leafPerM: 4.6, leafFrom: 0.25, spray: [1.05, 1.6], aspect: 0.46, habit: 'hanging', tipSprays: 1,
    cardBend: 0.05, flatRoll: 0.6, flatDroop: 0.0, bark: 4, barkTint: [0.44, 0.40, 0.34], barkTopTint: null,
  }),
  acacia: P({
    family: 'broadleaf', height: 6.2, heightSpread: 0.10, trunkR: 0.28, form: 'decurrent',
    forkAt: [0.26, 0.36], scaffolds: [3, 5], scaffoldAngle: [0.45, 0.75], crownBase: 0.6, crownR: 3.2,
    envelope: 'umbrella', whorled: false, perWhorl: [1, 1], spacing: 0.6, angleLow: 1.3, angleHigh: 1.1,
    droop: 0.12, upturn: 0.2, sidePerM: 1.8, sideAngle: 1.0, sideRatio: 0.6, sideDroop: 0.0, twigPerM: 2.2,
    leafOrder: 2, leafPerM: 4.4, leafFrom: 0.3, spray: [0.7, 1.05], aspect: 0.95, habit: 'flat', tipSprays: 2,
    cardBend: 0.04, flatRoll: 0.45, flatDroop: 0.0, foliageBand: 1.2, bark: 4, barkTint: [0.42, 0.36, 0.30], barkTopTint: null,
    foliageValue: 1.55,
  }),
  eucalyptus: P({
    family: 'broadleaf', height: 9.0, heightSpread: 0.12, trunkR: 0.25, form: 'excurrent',
    forkAt: [0, 0], scaffolds: [0, 0], scaffoldAngle: [0, 0], crownBase: 0.36, crownR: 2.9,
    envelope: 'ellipsoid', whorled: false, perWhorl: [1, 1], spacing: 0.55, angleLow: 0.85, angleHigh: 0.45,
    droop: 0.35, upturn: 0.2, sidePerM: 1.9, sideAngle: 0.7, sideRatio: 0.55, sideDroop: 0.45, twigPerM: 0,
    leafOrder: 1, leafPerM: 3.6, leafFrom: 0.25, spray: [0.74, 1.08], aspect: 0.7, habit: 'spray', tipSprays: 3,
    cardBend: 0.30, flatRoll: 0.6, flatDroop: 0.0, bark: 2, barkTint: [0.64, 0.60, 0.54], barkTopTint: [0.74, 0.72, 0.66],
    foliageValue: 1.3,
  }),
  pine: P({
    family: 'conifer', height: 7.2, heightSpread: 0.12, trunkR: 0.25, form: 'excurrent',
    forkAt: [0, 0], scaffolds: [0, 0], scaffoldAngle: [0, 0], crownBase: 0.50, crownR: 2.4,
    envelope: 'flame', whorled: true, perWhorl: [3, 5], spacing: 0.62, angleLow: 1.45, angleHigh: 0.85,
    droop: 0.25, upturn: 0.45, sidePerM: 1.2, sideAngle: 0.7, sideRatio: 0.45, sideDroop: 0.1, twigPerM: 0,
    leafOrder: 1, leafPerM: 2.0, leafFrom: 0.55, spray: [0.72, 1.02], aspect: 0.9, habit: 'tuft', tipSprays: 3,
    cardBend: 0.06, flatRoll: 0.6, flatDroop: 0.0, bark: 1, barkTint: [0.44, 0.33, 0.27], barkTopTint: [0.80, 0.52, 0.34], foliageValue: 1.04,
  }),
  spruce: P({
    family: 'conifer', height: 8.2, heightSpread: 0.10, trunkR: 0.19, form: 'excurrent',
    forkAt: [0, 0], scaffolds: [0, 0], scaffoldAngle: [0, 0], crownBase: 0.07, crownR: 1.3,
    envelope: 'cone', whorled: true, perWhorl: [3, 5], spacing: 0.55, angleLow: 1.95, angleHigh: 1.05,
    droop: 0.30, upturn: 0.50, sidePerM: 2.4, sideAngle: 0.95, sideRatio: 0.42, sideDroop: 0.55, twigPerM: 0,
    // trees round 3: the sprays a little longer, so the open herringbone tiles still close the spire round the leader
    leafOrder: 1, leafPerM: 4.2, leafFrom: 0.0, spray: [0.74, 1.06], aspect: 0.72, habit: 'flat', tipSprays: 1,
    cardBend: 0.18, flatRoll: 1.15, flatDroop: 0.35, bark: 1, barkTint: [0.36, 0.30, 0.27], barkTopTint: null, foliageValue: 1.24,
    // trees round 5 (the gauntlet's wave 98: Frontier's spruce "a smooth, uniform green cone"): its tiers ragged
    ragged: 1,
  }),
  fir: P({
    family: 'conifer', height: 7.3, heightSpread: 0.10, trunkR: 0.27, form: 'excurrent',
    forkAt: [0, 0], scaffolds: [0, 0], scaffoldAngle: [0, 0], crownBase: 0.10, crownR: 1.45,
    envelope: 'tiered', whorled: true, perWhorl: [3, 5], spacing: 0.6, angleLow: 1.75, angleHigh: 1.05,
    droop: 0.12, upturn: 0.30, sidePerM: 2.4, sideAngle: 1.05, sideRatio: 0.45, sideDroop: 0.05, twigPerM: 0,
    leafOrder: 1, leafPerM: 4.2, leafFrom: 0.0, spray: [0.76, 1.08], aspect: 0.76, habit: 'flat', tipSprays: 1,
    cardBend: 0.06, flatRoll: 0.55, flatDroop: 0.12, bark: 2, barkTint: [0.42, 0.40, 0.38], barkTopTint: null, foliageValue: 1.11,
  }),
  cedar: P({
    family: 'conifer', height: 6.6, heightSpread: 0.10, trunkR: 0.32, form: 'excurrent',
    forkAt: [0, 0], scaffolds: [0, 0], scaffoldAngle: [0, 0], crownBase: 0.22, crownR: 2.2,
    envelope: 'tiered', whorled: true, perWhorl: [4, 5], spacing: 0.8, angleLow: 1.62, angleHigh: 1.15,
    droop: 0.0, upturn: 0.08, sidePerM: 2.8, sideAngle: 1.1, sideRatio: 0.5, sideDroop: 0.0, twigPerM: 0,
    leafOrder: 1, leafPerM: 4.4, leafFrom: 0.1, spray: [0.7, 1.05], aspect: 0.9, habit: 'flat', tipSprays: 1,
    cardBend: 0.03, flatRoll: 0.38, flatDroop: 0.04, bark: 4, barkTint: [0.40, 0.34, 0.30], barkTopTint: null, foliageValue: 1.27,
  }),
  cypress: P({
    family: 'conifer', height: 7.8, heightSpread: 0.10, trunkR: 0.14, form: 'excurrent',
    forkAt: [0, 0], scaffolds: [0, 0], scaffoldAngle: [0, 0], crownBase: 0.07, crownR: 0.75,
    envelope: 'flame', whorled: false, perWhorl: [1, 1], spacing: 0.22, angleLow: 0.38, angleHigh: 0.2,
    droop: 0.0, upturn: 0.2, sidePerM: 0, sideAngle: 0.4, sideRatio: 0.5, sideDroop: 0, twigPerM: 0,
    leafOrder: 1, leafPerM: 5.4, leafFrom: 0.0, spray: [0.8, 1.15], aspect: 0.6, habit: 'upright', tipSprays: 1,
    cardBend: 0.04, flatRoll: 0.6, flatDroop: 0.0, bark: 4, barkTint: [0.40, 0.34, 0.30], barkTopTint: null, foliageValue: 1.5,
  }),
  // (the trees lane, 2026-10-06, the gauntlet's wave 178 on Verdant: "tall, spindly, birch-like trees with narrow,
  // see-through lime-green crowns": a little broader, its sprays from lower on each limb and a fifth larger, so a crown in
  // leaf holds its mass at the establishing range — its budget of sprays unchanged)
  birch: P({
    family: 'birch', height: 7.0, heightSpread: 0.14, trunkR: 0.16, form: 'excurrent',
    forkAt: [0, 0], scaffolds: [0, 0], scaffoldAngle: [0, 0], crownBase: 0.30, crownR: 2.65,
    envelope: 'dome', whorled: false, perWhorl: [1, 1], spacing: 0.36, angleLow: 1.35, angleHigh: 0.5,
    droop: 0.40, upturn: 0.0, sidePerM: 2.4, sideAngle: 0.65, sideRatio: 0.7, sideDroop: 1.5, twigPerM: 0,
    leafOrder: 1, leafPerM: 3.6, leafFrom: 0.12, spray: [0.74, 1.12], aspect: 0.7, habit: 'spray', tipSprays: 3,
    cardBend: 0.34, flatRoll: 0.6, flatDroop: 0.0, bark: 3, barkTint: [0.92, 0.91, 0.88], barkTopTint: null,
  }),
  aspen: P({
    family: 'birch', height: 7.6, heightSpread: 0.12, trunkR: 0.13, form: 'excurrent',
    forkAt: [0, 0], scaffolds: [0, 0], scaffoldAngle: [0, 0], crownBase: 0.42, crownR: 1.7,
    envelope: 'ellipsoid', whorled: false, perWhorl: [1, 1], spacing: 0.38, angleLow: 0.75, angleHigh: 0.40,
    droop: 0.15, upturn: 0.15, sidePerM: 2.2, sideAngle: 0.6, sideRatio: 0.55, sideDroop: 0.25, twigPerM: 0,
    leafOrder: 1, leafPerM: 3.8, leafFrom: 0.2, spray: [0.55, 0.82], aspect: 0.8, habit: 'spray', tipSprays: 2,
    cardBend: 0.10, flatRoll: 0.6, flatDroop: 0.0, bark: 3, barkTint: [0.84, 0.84, 0.80], barkTopTint: null,
  }),
  // the palm: one leaning, arching stem swollen at its foot and a fan of pinnate fronds from its top (growPalm; the
  // branch fields are unused) — spray is the frond's length, aspect its width, cardBend its arch
  palm: P({
    family: 'palm', height: 6.3, heightSpread: 0.14, trunkR: 0.25, form: 'excurrent',
    forkAt: [0, 0], scaffolds: [0, 0], scaffoldAngle: [0, 0], crownBase: 0.85, crownR: 3.1,
    envelope: 'dome', whorled: false, perWhorl: [1, 1], spacing: 1, angleLow: 1, angleHigh: 1,
    droop: 0, upturn: 0, sidePerM: 0, sideAngle: 0, sideRatio: 0, sideDroop: 0, twigPerM: 0,
    leafOrder: 0, leafPerM: 0, leafFrom: 0, spray: [3.0, 3.9], aspect: 0.36, habit: 'upright', tipSprays: 0,
    cardBend: 0.5, flatRoll: 0, flatDroop: 0, bark: 2, barkTint: [0.46, 0.41, 0.35], barkTopTint: [0.40, 0.35, 0.29],
    foliageValue: 0.45,
  }),
  snag: P({
    family: 'dead', height: 5.6, heightSpread: 0.22, trunkR: 0.27, form: 'excurrent',
    forkAt: [0, 0], scaffolds: [0, 0], scaffoldAngle: [0, 0], crownBase: 0.38, crownR: 2.0,
    envelope: 'ellipsoid', whorled: false, perWhorl: [1, 1], spacing: 0.9, angleLow: 1.1, angleHigh: 0.65,
    droop: 0.15, upturn: 0.15, sidePerM: 0.6, sideAngle: 0.7, sideRatio: 0.45, sideDroop: 0.1, twigPerM: 0,
    leafOrder: 1, leafPerM: 0, leafFrom: 0.55, spray: [0.7, 1.05], aspect: 0.9, habit: 'spray', tipSprays: 0,
    cardBend: 0.05, flatRoll: 0.0, flatDroop: 0.0, bark: 4, barkTint: [0.36, 0.33, 0.30], barkTopTint: [0.20, 0.18, 0.17],
  }),
  // the tidal mangrove (the Mangrove map's willow form, vegetation.ts): a short bole forking low into spreading
  // scaffolds under a broad, dense, rounded crown of leathery sprays; smooth grey-brown bark; the stilt roots are
  // the builder's (vegetation.ts buildGrownTree, the reviewed bent-cone arches)
  mangrove: P({
    family: 'broadleaf', height: 6.2, heightSpread: 0.12, trunkR: 0.26, form: 'decurrent',
    forkAt: [0.30, 0.38], scaffolds: [4, 6], scaffoldAngle: [0.75, 1.1], crownBase: 0.34, crownR: 3.35,
    envelope: 'dome', whorled: false, perWhorl: [1, 1], spacing: 0.55, angleLow: 1.2, angleHigh: 0.7,
    droop: 0.32, upturn: 0.3, sidePerM: 2.4, sideAngle: 0.8, sideRatio: 0.66, sideDroop: 0.3, twigPerM: 1.6,
    leafOrder: 1, leafPerM: 3.6, leafFrom: 0.3, spray: [0.62, 0.92], aspect: 0.82, habit: 'spray', tipSprays: 2,
    cardBend: 0.12, flatRoll: 0.6, flatDroop: 0.0, bark: 2, barkTint: [0.42, 0.39, 0.34], barkTopTint: null,
    foliageValue: 1.35,
  }),
  // ---- trees round 2 (2026-10-03): the regional forms (treeBiomes.ts routes a map's species slots to them) ----
  // the European beech (Fulda, the Eifel): a tall smooth silver-grey bole forking high into steep limbs, a dense oval
  // dome of level, layered sprays of glossy oval leaves
  beech: P({
    family: 'broadleaf', height: 8.4, heightSpread: 0.10, trunkR: 0.30, form: 'decurrent',
    forkAt: [0.28, 0.36], scaffolds: [3, 5], scaffoldAngle: [0.42, 0.8], crownBase: 0.4, crownR: 2.9,
    envelope: 'ellipsoid', whorled: false, perWhorl: [1, 1], spacing: 0.5, angleLow: 1.1, angleHigh: 0.55,
    droop: 0.3, upturn: 0.3, sidePerM: 2.4, sideAngle: 0.8, sideRatio: 0.62, sideDroop: 0.2, twigPerM: 1.6,
    leafOrder: 1, leafPerM: 3.8, leafFrom: 0.25, spray: [0.62, 0.92], aspect: 0.9, habit: 'flat', tipSprays: 2,
    cardBend: 0.1, flatRoll: 0.5, flatDroop: 0.1, bark: 2, barkTint: [0.50, 0.50, 0.48], barkTopTint: [0.55, 0.55, 0.53],
    foliageValue: 1.12,
  }),
  // the sweet chestnut (the Breton bocage): a stout spirally fissured bole under a broad, high, rounded crown of long
  // serrated leaves
  chestnut: P({
    family: 'broadleaf', height: 7.8, heightSpread: 0.12, trunkR: 0.36, form: 'decurrent',
    forkAt: [0.30, 0.38], scaffolds: [4, 6], scaffoldAngle: [0.55, 1.0], crownBase: 0.34, crownR: 3.1,
    envelope: 'dome', whorled: false, perWhorl: [1, 1], spacing: 0.55, angleLow: 1.15, angleHigh: 0.6,
    droop: 0.38, upturn: 0.35, sidePerM: 2.1, sideAngle: 0.75, sideRatio: 0.62, sideDroop: 0.3, twigPerM: 0.9,
    leafOrder: 1, leafPerM: 3.6, leafFrom: 0.3, spray: [0.68, 1.0], aspect: 0.86, habit: 'spray', tipSprays: 2,
    cardBend: 0.18, flatRoll: 0.6, flatDroop: 0.0, bark: 4, barkTint: [0.44, 0.38, 0.32], barkTopTint: null,
    foliageValue: 1.2,
  }),
  // the montane chestnut-oak of the Naga Hills (Castanopsis; the trees lane, 2026-10-07): the sweet chestnut's crown —
  // the same dome, sprays and bark — on a lighter frame of side limbs and twigs. Monsoon Ridge's woods are a third of
  // them: on the chestnut's frame the map's Naga Hills forms drew about 4 % over its round-5 trees' triangles (cost rule
  // v3's census allows 3); the frame inside a closed evergreen dome barely shows
  castanopsis: P({
    family: 'broadleaf', height: 7.8, heightSpread: 0.12, trunkR: 0.36, form: 'decurrent',
    forkAt: [0.30, 0.38], scaffolds: [4, 6], scaffoldAngle: [0.55, 1.0], crownBase: 0.34, crownR: 3.1,
    envelope: 'dome', whorled: false, perWhorl: [1, 1], spacing: 0.55, angleLow: 1.15, angleHigh: 0.6,
    droop: 0.38, upturn: 0.35, sidePerM: 1.5, sideAngle: 0.75, sideRatio: 0.62, sideDroop: 0.3, twigPerM: 0.4,
    leafOrder: 1, leafPerM: 3.6, leafFrom: 0.3, spray: [0.68, 1.0], aspect: 0.86, habit: 'spray', tipSprays: 2,
    cardBend: 0.18, flatRoll: 0.6, flatDroop: 0.0, bark: 4, barkTint: [0.32, 0.28, 0.24], barkTopTint: null,
    foliageValue: 1.2,
  }),
  // trees round 8 (2026-10-07, the gauntlet's wave 236 on Verdant: the woods' Lombardy poplars, a third of them, read as
  // "a eucalyptus or poplar plantation rather than" the Kursk forest-steppe's oak and ash): the common ash (Fraxinus
  // excelsior) of the oak-ash woods — a straight grey stem forking low into a few ascending limbs under a broad, open,
  // domed crown, its shoots upturned at the tips; grey bark, darker and ridged below. A slot's wood form only (treeBiomes.ts
  // woodForms): the slot's field and shelterbelt trees keep their own form, and its sprays are the slot's
  ash: P({
    family: 'broadleaf', height: 8.0, heightSpread: 0.12, trunkR: 0.27, form: 'decurrent',
    forkAt: [0.24, 0.32], scaffolds: [3, 5], scaffoldAngle: [0.32, 0.9], crownBase: 0.32, crownR: 2.95,
    envelope: 'dome', whorled: false, perWhorl: [1, 1], spacing: 0.5, angleLow: 1.05, angleHigh: 0.5,
    droop: 0.22, upturn: 0.5, sidePerM: 2.0, sideAngle: 0.7, sideRatio: 0.6, sideDroop: 0.25, twigPerM: 1.2,
    leafOrder: 1, leafPerM: 3.6, leafFrom: 0.18, spray: [0.66, 0.96], aspect: 0.8, habit: 'spray', tipSprays: 2,
    cardBend: 0.2, flatRoll: 0.6, flatDroop: 0.05, bark: 4, barkTint: [0.36, 0.35, 0.33], barkTopTint: [0.45, 0.44, 0.42],
    foliageValue: 1.2,
  }),
  // the holm oak (Dalmatia): a short dark bole and a dense, rounded, evergreen dome of small dark leathery leaves
  holmOak: P({
    family: 'broadleaf', height: 6.2, heightSpread: 0.12, trunkR: 0.30, form: 'decurrent',
    forkAt: [0.24, 0.32], scaffolds: [4, 6], scaffoldAngle: [0.6, 1.05], crownBase: 0.28, crownR: 2.6,
    envelope: 'ellipsoid', whorled: false, perWhorl: [1, 1], spacing: 0.5, angleLow: 1.15, angleHigh: 0.6,
    droop: 0.32, upturn: 0.3, sidePerM: 2.4, sideAngle: 0.8, sideRatio: 0.6, sideDroop: 0.25, twigPerM: 1.1,
    leafOrder: 1, leafPerM: 5.0, leafFrom: 0.15, spray: [0.66, 0.96], aspect: 0.92, habit: 'spray', tipSprays: 2,
    cardBend: 0.12, flatRoll: 0.6, flatDroop: 0.0, bark: 4, barkTint: [0.32, 0.30, 0.28], barkTopTint: null,
    foliageValue: 1.12,
  }),
  // the olive (Dalmatia): a short, gnarled, leaning bole forking low into a few twisting limbs under a wide, open,
  // irregular crown of narrow silver-grey leaves
  olive: P({
    family: 'broadleaf', height: 5.0, heightSpread: 0.14, trunkR: 0.32, form: 'decurrent',
    forkAt: [0.24, 0.34], scaffolds: [3, 5], scaffoldAngle: [0.7, 1.15], crownBase: 0.36, crownR: 2.7,
    envelope: 'dome', whorled: false, perWhorl: [1, 1], spacing: 0.55, angleLow: 1.2, angleHigh: 0.7,
    droop: 0.4, upturn: 0.25, sidePerM: 2.6, sideAngle: 0.85, sideRatio: 0.6, sideDroop: 0.35, twigPerM: 2.0,
    leafOrder: 1, leafPerM: 4.0, leafFrom: 0.2, spray: [0.66, 0.98], aspect: 0.8, habit: 'spray', tipSprays: 2,
    cardBend: 0.2, flatRoll: 0.6, flatDroop: 0.0, gnarl: 0.85, bark: 4, barkTint: [0.50, 0.48, 0.44], barkTopTint: null,
    foliageValue: 1.25,
  }),
  // the Canary Island pine (Las Cañadas): a straight, thick, plated, red-brown bole and an open, irregular, layered
  // crown of drooping limbs that end in long pendulous needle tufts. Trees round 4 (the gauntlet's wave 39: Caldera's
  // midground pines "still round broadleaf crowns"): the crown a spire from lower down — narrower, its lower limbs
  // nearer level — where the ellipsoid stood as a broadleaf's dome on a bole
  canaryPine: P({
    family: 'conifer', height: 8.6, heightSpread: 0.12, trunkR: 0.30, form: 'excurrent',
    forkAt: [0, 0], scaffolds: [0, 0], scaffoldAngle: [0, 0], crownBase: 0.3, crownR: 2.0,
    envelope: 'flame', whorled: true, perWhorl: [3, 4], spacing: 0.78, angleLow: 1.75, angleHigh: 1.05,
    droop: 0.42, upturn: 0.3, sidePerM: 1.5, sideAngle: 0.75, sideRatio: 0.5, sideDroop: 0.35, twigPerM: 0,
    leafOrder: 1, leafPerM: 2.6, leafFrom: 0.45, spray: [0.8, 1.15], aspect: 0.95, habit: 'tuft', tipSprays: 3,
    cardBend: 0.22, flatRoll: 0.6, flatDroop: 0.0, bark: 1, barkTint: [0.50, 0.32, 0.24], barkTopTint: [0.60, 0.40, 0.28],
    foliageValue: 1.12,
  }),
  // the Aleppo pine (Dalmatia): a leaning grey-brown bole and a light, open, rounded crown of fine pale needles
  aleppoPine: P({
    family: 'conifer', height: 7.2, heightSpread: 0.14, trunkR: 0.26, form: 'excurrent',
    forkAt: [0, 0], scaffolds: [0, 0], scaffoldAngle: [0, 0], crownBase: 0.44, crownR: 2.7,
    envelope: 'dome', whorled: true, perWhorl: [2, 4], spacing: 0.7, angleLow: 1.35, angleHigh: 0.8,
    droop: 0.22, upturn: 0.5, sidePerM: 1.4, sideAngle: 0.75, sideRatio: 0.5, sideDroop: 0.1, twigPerM: 0,
    leafOrder: 1, leafPerM: 2.2, leafFrom: 0.5, spray: [0.72, 1.0], aspect: 0.92, habit: 'tuft', tipSprays: 3,
    cardBend: 0.08, flatRoll: 0.6, flatDroop: 0.0, bark: 4, barkTint: [0.46, 0.40, 0.36], barkTopTint: [0.58, 0.46, 0.38],
    foliageValue: 1.18,
  }),
  // trees round 5 (the cities lane's Ironworks, the Saar works): the buddleia of waste ground, slag heaps and rail sidings
  // — a ruderal shrub of arching canes, long narrow grey-green leaves and nodding purple flower spikes, only ever grown as
  // a shrub (growShrubSkeleton reads the aspect, the bend and the family: long, narrow, arching sprays)
  buddleia: P({
    family: 'broadleaf', height: 3.0, heightSpread: 0.16, trunkR: 0.06, form: 'excurrent',
    forkAt: [0, 0], scaffolds: [0, 0], scaffoldAngle: [0, 0], crownBase: 0.1, crownR: 1.4,
    envelope: 'dome', whorled: false, perWhorl: [1, 1], spacing: 0.3, angleLow: 0.7, angleHigh: 0.35,
    droop: 0.3, upturn: 0.1, sidePerM: 1.2, sideAngle: 0.6, sideRatio: 0.5, sideDroop: 0.4, twigPerM: 0,
    leafOrder: 1, leafPerM: 4, leafFrom: 0, spray: [0.75, 1.1], aspect: 0.62, habit: 'spray', tipSprays: 1,
    cardBend: 0.42, flatRoll: 0.6, flatDroop: 0, bark: 2, barkTint: [0.44, 0.40, 0.34], barkTopTint: null,
  }),
  // the broom scrub of Las Cañadas (retama del Teide, codeso): a shrub of leafless-looking green-grey switches, only ever
  // grown as a shrub (growShrubSkeleton reads the aspect, the bend and the family); the tree fields mirror the birch's
  broom: P({
    family: 'broadleaf', height: 2.4, heightSpread: 0.14, trunkR: 0.08, form: 'excurrent',
    forkAt: [0, 0], scaffolds: [0, 0], scaffoldAngle: [0, 0], crownBase: 0.1, crownR: 1.1,
    envelope: 'dome', whorled: false, perWhorl: [1, 1], spacing: 0.3, angleLow: 0.6, angleHigh: 0.3,
    droop: 0.05, upturn: 0.3, sidePerM: 1.0, sideAngle: 0.4, sideRatio: 0.5, sideDroop: 0, twigPerM: 0,
    leafOrder: 1, leafPerM: 4, leafFrom: 0, spray: [0.6, 0.9], aspect: 0.56, habit: 'upright', tipSprays: 1,
    cardBend: 0.04, flatRoll: 0.6, flatDroop: 0, bark: 2, barkTint: [0.36, 0.38, 0.30], barkTopTint: null,
  }),
  // the European larch (the Alps): a narrow open cone of level whorls whose side shoots hang, soft light-green needles
  // in rosettes along them
  larch: P({
    family: 'conifer', height: 8.6, heightSpread: 0.10, trunkR: 0.24, form: 'excurrent',
    forkAt: [0, 0], scaffolds: [0, 0], scaffoldAngle: [0, 0], crownBase: 0.14, crownR: 1.7,
    envelope: 'cone', whorled: true, perWhorl: [3, 5], spacing: 0.66, angleLow: 1.7, angleHigh: 1.15,
    droop: 0.2, upturn: 0.3, sidePerM: 1.9, sideAngle: 0.9, sideRatio: 0.5, sideDroop: 1.1, twigPerM: 0,
    leafOrder: 1, leafPerM: 4.4, leafFrom: 0.05, spray: [0.72, 1.02], aspect: 0.74, habit: 'spray', tipSprays: 2,
    cardBend: 0.32, flatRoll: 0.6, flatDroop: 0.0, bark: 1, barkTint: [0.46, 0.34, 0.28], barkTopTint: null,
    foliageValue: 1.3,
  }),
  // the one-seed and Utah junipers of the Arizona uplands: a short shaggy grey bole forking near the ground into a few
  // leaning stems under a low, irregular, rounded crown of grey-green scale-leaf sprays, as wide as it is tall. Trees
  // round 5 (the arid and volcanic lane's Monument Valley, where the olive stand-in read as "lush broadleaf groves"): its
  // stems gnarled and twisting, a quarter of its scaffolds dead silver wood, its crown open (the sprays two thirds as
  // close), the twisted wood showing through it
  juniper: P({
    family: 'conifer', height: 4.4, heightSpread: 0.16, trunkR: 0.24, form: 'decurrent',
    forkAt: [0.1, 0.2], scaffolds: [3, 5], scaffoldAngle: [0.5, 1.0], crownBase: 0.12, crownR: 2.1,
    envelope: 'dome', whorled: false, perWhorl: [1, 1], spacing: 0.4, angleLow: 1.2, angleHigh: 0.65,
    droop: 0.22, upturn: 0.35, sidePerM: 2.6, sideAngle: 0.8, sideRatio: 0.55, sideDroop: 0.2, twigPerM: 1.4,
    leafOrder: 1, leafPerM: 3.4, leafFrom: 0.05, spray: [0.6, 0.86], aspect: 0.82, habit: 'spray', tipSprays: 2,
    cardBend: 0.1, flatRoll: 0.6, flatDroop: 0.0, bark: 4, barkTint: [0.46, 0.42, 0.38], barkTopTint: null,
    foliageValue: 1.2, gnarl: 0.7, deadwood: 0.25,
  }),
  // the pinyon (Pinus edulis): a short pine, its crown low, round and dense, its needles short and stiff in tufts at
  // the shoot ends; a grey, furrowed bole
  pinyon: P({
    family: 'conifer', height: 5.6, heightSpread: 0.14, trunkR: 0.24, form: 'excurrent',
    forkAt: [0, 0], scaffolds: [0, 0], scaffoldAngle: [0, 0], crownBase: 0.22, crownR: 2.2,
    envelope: 'dome', whorled: true, perWhorl: [3, 4], spacing: 0.55, angleLow: 1.4, angleHigh: 0.85,
    droop: 0.18, upturn: 0.45, sidePerM: 1.8, sideAngle: 0.75, sideRatio: 0.5, sideDroop: 0.1, twigPerM: 0,
    leafOrder: 1, leafPerM: 3.0, leafFrom: 0.35, spray: [0.62, 0.88], aspect: 0.92, habit: 'tuft', tipSprays: 3,
    cardBend: 0.06, flatRoll: 0.6, flatDroop: 0.0, bark: 4, barkTint: [0.42, 0.38, 0.34], barkTopTint: null,
    foliageValue: 1.15,
  }),
  // ---- trees round 5 (2026-10-05): the map-revival lanes' species ----
  // the longleaf pine (Pinus palustris, Longleaf Crossing's whole forest): a tall, straight, clear bole of orange-brown
  // plates, self-pruned to three fifths of its height, under a small, open, irregular crown of a few stout upturned
  // limbs, each ending in great tufts of very long bright-green needles — the fox-tails the species is named for, bare
  // wood between them
  // (trees lane, 2026-10-05, the gauntlet's wave 124 on Longleaf Crossing: "broccoli-crowned blobs rather than tall,
  // sparse-crowned longleaf"; the coordinator: a 17-19 m clear bole, the crown from about 70 %, a small ragged tufted
  // crown): the tallest tree of the fleet, about 18 m at the placed trees' mean scale, its crown a few ragged whorls of
  // upturned limbs high on the bole, each limb's needles in tufts at its end
  longleafPine: P({
    family: 'conifer', height: 13.6, heightSpread: 0.12, trunkR: 0.24, form: 'excurrent',
    forkAt: [0, 0], scaffolds: [0, 0], scaffoldAngle: [0, 0], crownBase: 0.7, crownR: 2.0,
    envelope: 'dome', whorled: true, perWhorl: [2, 3], spacing: 1.05, angleLow: 1.32, angleHigh: 0.8,
    droop: 0.28, upturn: 0.7, sidePerM: 0.7, sideAngle: 0.75, sideRatio: 0.42, sideDroop: 0.12, twigPerM: 0,
    leafOrder: 1, leafPerM: 1.3, leafFrom: 0.65, spray: [1.05, 1.45], aspect: 0.95, habit: 'tuft', tipSprays: 5,
    cardBend: 0.24, flatRoll: 0.6, flatDroop: 0.0, ragged: 0.4, gnarl: 0.2, bark: 1, barkTint: [0.50, 0.33, 0.25],
    barkTopTint: [0.60, 0.42, 0.30], foliageValue: 1.18,
  }),
  // the cedar of Lebanon (Cedrus libani, the Chouf): a massive bole under a broad, flat-topped crown of great horizontal
  // shelves — level limbs a tier apart carrying dense flat plates of needle rosettes, open sky between the tiers; dark
  // grey furrowed bark
  lebanonCedar: P({
    family: 'conifer', height: 7.6, heightSpread: 0.12, trunkR: 0.42, form: 'excurrent',
    forkAt: [0, 0], scaffolds: [0, 0], scaffoldAngle: [0, 0], crownBase: 0.22, crownR: 3.8,
    envelope: 'shelf', whorled: true, perWhorl: [3, 5], spacing: 1.3, angleLow: 1.6, angleHigh: 1.48,
    droop: 0.02, upturn: 0.0, sidePerM: 2.2, sideAngle: 1.15, sideRatio: 0.55, sideDroop: 0.0, twigPerM: 0,
    // a shelf's sprays long and narrow along its limbs, so each faces the viewer as a level strip and a tier reads as
    // one plate from the side (the card turn shows every spray's face)
    leafOrder: 1, leafPerM: 6.0, leafFrom: 0.2, spray: [0.8, 1.15], aspect: 0.66, habit: 'flat', tipSprays: 3,
    cardBend: 0.02, flatRoll: 0.16, flatDroop: 0.0, bark: 4, barkTint: [0.36, 0.33, 0.31], barkTopTint: null,
    foliageValue: 1.22,
  }),
  // sugi (Cryptomeria japonica, the Aso caldera's plantations): a tall, straight, red-brown bole of long fibrous strips
  // under a narrow, dense, conical crown; its branches spiral up the stem, droop and turn up at their ends, clothed in
  // rope-like shoots of short awl-shaped needles
  sugi: P({
    family: 'conifer', height: 10.0, heightSpread: 0.10, trunkR: 0.25, form: 'excurrent',
    forkAt: [0, 0], scaffolds: [0, 0], scaffoldAngle: [0, 0], crownBase: 0.28, crownR: 1.5,
    envelope: 'cone', whorled: false, perWhorl: [1, 1], spacing: 0.3, angleLow: 1.45, angleHigh: 0.85,
    droop: 0.32, upturn: 0.42, sidePerM: 2.4, sideAngle: 0.75, sideRatio: 0.45, sideDroop: 0.35, twigPerM: 0,
    leafOrder: 1, leafPerM: 4.6, leafFrom: 0.0, spray: [0.8, 1.15], aspect: 0.72, habit: 'flat', tipSprays: 2,
    cardBend: 0.24, flatRoll: 1.1, flatDroop: 0.25, bark: 4, barkTint: [0.52, 0.33, 0.25], barkTopTint: [0.56, 0.36, 0.27],
    foliageValue: 1.15,
  }),
  // the Japanese red pine (Pinus densiflora, the Aso caldera's grassland edges): a leaning bole, grey and plated below
  // and orange-red and flaking up into the crown, under an irregular, flat-topped crown of a few long limbs ending in
  // tufts of slender bright-green needles
  redPine: P({
    family: 'conifer', height: 7.6, heightSpread: 0.14, trunkR: 0.24, form: 'excurrent',
    forkAt: [0, 0], scaffolds: [0, 0], scaffoldAngle: [0, 0], crownBase: 0.55, crownR: 2.9,
    envelope: 'dome', whorled: true, perWhorl: [2, 4], spacing: 0.72, angleLow: 1.42, angleHigh: 0.9,
    droop: 0.3, upturn: 0.5, sidePerM: 1.3, sideAngle: 0.75, sideRatio: 0.48, sideDroop: 0.12, twigPerM: 0,
    leafOrder: 1, leafPerM: 2.2, leafFrom: 0.5, spray: [0.75, 1.05], aspect: 0.92, habit: 'tuft', tipSprays: 3,
    // (the merge with shape2: its gnarl crooks the red pine's bole and limbs)
    cardBend: 0.1, flatRoll: 0.6, flatDroop: 0.0, gnarl: 0.55, bark: 1, barkTint: [0.48, 0.34, 0.28],
    barkTopTint: [0.88, 0.48, 0.30], foliageValue: 1.1,
  }),
  // the trees lane (2026-10-06, the gauntlet's wave 157: Monsoon Ridge "built from one repeating tropical fan-palm" — the
  // wrong flora for Kohima at 1,450 m): the Khasi pine (Pinus kesiya) of the Naga and Khasi hills' ridges — a tall,
  // straight bole, dark and plated below and red-brown up into the crown, under a high, open, irregularly rounded crown
  // of long limbs ending in tufts of long slender needles in threes (the red pine's needle sprays, a straighter, taller
  // tree than the red pine's leaning one)
  // (round 2, the gauntlet's wave 179: "red plated trunks but broadleaf-looking crowns" — open tiers of limbs with their
  // needles in tufts at the ends, airy: the whorls a metre apart, two or three limbs each, the needles on their outer
  // two fifths)
  khasiPine: P({
    family: 'conifer', height: 8.6, heightSpread: 0.14, trunkR: 0.25, form: 'excurrent',
    forkAt: [0, 0], scaffolds: [0, 0], scaffoldAngle: [0, 0], crownBase: 0.52, crownR: 2.7,
    envelope: 'ellipsoid', whorled: true, perWhorl: [2, 3], spacing: 1.0, angleLow: 1.36, angleHigh: 0.85,
    droop: 0.28, upturn: 0.55, sidePerM: 0.9, sideAngle: 0.75, sideRatio: 0.45, sideDroop: 0.12, twigPerM: 0,
    leafOrder: 1, leafPerM: 2.2, leafFrom: 0.55, spray: [0.78, 1.04], aspect: 0.9, habit: 'tuft', tipSprays: 3,
    cardBend: 0.12, flatRoll: 0.6, flatDroop: 0.0, gnarl: 0.18, ragged: 0.45, bark: 1, barkTint: [0.40, 0.31, 0.27],
    barkTopTint: [0.78, 0.44, 0.30], foliageValue: 1.1,
  }),
  // the bamboo thickets of the Naga Hills' gullies and fallows (Dendrocalamus hamiltonii, Bambusa tulda): a clump of a
  // dozen and more culms from one rootstock, upright at the foot and arching out over the top, bare below and feathered
  // above with narrow drooping leaves (the sprays seat on the culms themselves: a branchlet a spray would each need a
  // supporting twig past the side-tube budget) — a fountain of foliage wider at the top than at the ground
  // (the umbrella envelope's vase); smooth green-yellow culms banded at their nodes (bark style 2). (growPolyline's droop
  // turns a limb toward the vertical and its upturn its last third toward the ground — every profile is tuned to that —
  // so a culm's arch is an upturn alone). Round 2 (the gauntlet's wave 179: "a single fountain" from one point — a clump
  // is many culms rising from a broad rhizome base, close-packed, arching outward only near their tops): eighteen to
  // twenty-six culms, each from its own seat on a disc 1.2 m across (clumpR), nearly upright, arching in their top
  // third
  bamboo: P({
    family: 'broadleaf', height: 9.8, heightSpread: 0.12, trunkR: 0.085, form: 'decurrent',
    forkAt: [0.036, 0.05], scaffolds: [18, 26], scaffoldAngle: [0.03, 0.2], crownBase: 0.04, crownR: 3.6,
    envelope: 'umbrella', whorled: false, perWhorl: [1, 1], spacing: 0.5, angleLow: 1.0, angleHigh: 0.6,
    droop: 0, upturn: 1.0, sidePerM: 0, sideAngle: 1.0, sideRatio: 0.12, sideDroop: -0.3, twigPerM: 0,
    leafOrder: 1, leafPerM: 4.2, leafFrom: 0.42, spray: [0.7, 1.0], aspect: 0.55, habit: 'spray', tipSprays: 2,
    cardBend: 0.32, flatRoll: 0.6, flatDroop: 0.0, bark: 2, barkTint: [0.50, 0.56, 0.32], barkTopTint: [0.46, 0.54, 0.30],
    foliageValue: 1.12, clump: true, clumpR: 0.62,
  }),
  // the trees lane (2026-10-05, the farmland lane's Streuobst behind Frontier Basin's farm courtyards): the old meadow
  // orchard's fruit tree, open-grown in rows over the grass — a short trunk of 1.2-1.8 m (at the placed trees' mean scale)
  // to three to five spreading scaffolds, a broad, open, rounded crown about as wide as it is tall, crooked with age, the
  // sky showing through. Its variants are the three trees of a Hessian Streuobstwiese: the plum, smaller and finer; the
  // apple, round and spreading; the pear, taller and upright — each on its own atlas tiles (treeSprayAtlas.ts
  // paintOrchardTile: its leaves and its summer fruit)
  apple: P({
    family: 'broadleaf', height: 4.6, heightSpread: 0.14, trunkR: 0.13, form: 'decurrent',
    forkAt: [0.22, 0.29], scaffolds: [3, 5], scaffoldAngle: [0.5, 1.1], crownBase: 0.26, crownR: 2.35,
    envelope: 'dome', whorled: false, perWhorl: [1, 1], spacing: 0.45, angleLow: 1.2, angleHigh: 0.7,
    droop: 0.5, upturn: 0.3, sidePerM: 2.0, sideAngle: 0.85, sideRatio: 0.55, sideDroop: 0.45, twigPerM: 1.2,
    leafOrder: 1, leafPerM: 1.6, leafFrom: 0.2, spray: [0.45, 0.68], aspect: 0.82, habit: 'spray', tipSprays: 1,
    cardBend: 0.18, flatRoll: 0.6, flatDroop: 0.0, gnarl: 0.45, bark: 1, barkTint: [0.42, 0.39, 0.35], barkTopTint: null,
    foliageValue: 1.2, orchard: true,
    variantShape: [
      // the plum
      { height: 4.4, crownR: 2.1, scaffoldAngle: [0.45, 1.0], spray: [0.4, 0.6] },
      // the apple
      {},
      // the pear
      { height: 4.8, crownR: 1.85, scaffoldAngle: [0.3, 0.75], forkAt: [0.19, 0.25] },
    ],
    variantTiles: [[3], [0, 1], [2]],
  }),
  // the longleaf's grass stage (shrub-only, Longleaf Crossing's cutover): a seedling of its first years is no stem at
  // all, a dense fountain of long needles from the ground like a bunchgrass, a few to a clump; the tree fields mirror the
  // longleaf's (growShrubSkeleton reads the fountain, the aspect and the bend)
  longleafSeedling: P({
    family: 'conifer', height: 1.0, heightSpread: 0.16, trunkR: 0.05, form: 'excurrent',
    forkAt: [0, 0], scaffolds: [0, 0], scaffoldAngle: [0, 0], crownBase: 0.0, crownR: 0.7,
    envelope: 'dome', whorled: false, perWhorl: [1, 1], spacing: 0.3, angleLow: 0.6, angleHigh: 0.3,
    droop: 0.05, upturn: 0.3, sidePerM: 0, sideAngle: 0.4, sideRatio: 0.5, sideDroop: 0, twigPerM: 0,
    leafOrder: 1, leafPerM: 4, leafFrom: 0, spray: [0.6, 0.9], aspect: 0.95, habit: 'tuft', tipSprays: 1,
    cardBend: 0.32, flatRoll: 0.6, flatDroop: 0, bark: 1, barkTint: [0.50, 0.33, 0.25], barkTopTint: null,
    fountain: true, foliageValue: 1.1,
  }),
});

interface GrowthNode { x: number; y: number; z: number; r: number; flex: number }
interface GrowthBranch {
  order: number;
  parent: number;
  nodes: GrowthNode[];
  /** Emitted as a tube (the finest twigs live only in the spray tiles). */
  mesh: boolean;
  /** A broken stub (snags): its tip ends blunt, not tapered to a twig. */
  broken: boolean;
  /** Emitted as a straight supporting twig whatever its order (supportSprays: it carries sprays the tube budget left). */
  support?: boolean;
  /** Trees round 5: dead wood in a living crown (the profile's `deadwood`): no sprays, silver-grey, its limb snapped. */
  dead?: boolean;
}
interface LeafSite {
  /** Seat of the spray on its branch (tree space). */
  x: number; y: number; z: number;
  /** The spray's long axis (unit) and its face normal (unit, perpendicular to the axis). */
  ax: number; ay: number; az: number;
  nx: number; ny: number; nz: number;
  length: number;
  width: number;
  /** 0 = deep inside the crown, 1 = the lit outer shell. */
  shade: number;
  flex: number;
  tile: number;
  bend: number;
  /** The branch (index into the skeleton's branches) the spray is seated on. */
  branch: number;
  /** Trees round 5: a shrub's stem card (shrubStemSites), not a spray: its tile is the stems', its tint the bark's. */
  stem?: boolean;
}
/**
 * Trees round 2 (2026-10-03): one mass of a crown — an axis-aligned ellipsoid fitted to a cluster of spray centres
 * (crownLobes). The lobes' smooth union is the crown hull the cards' normals bend toward and the depth their tint
 * darkens by, and the shadow hull's masses.
 */
export interface CrownLobe { x: number; y: number; z: number; rx: number; ry: number; rz: number }
interface TreeSkeleton {
  species: GrowthSpecies;
  height: number;
  branches: GrowthBranch[];
  leaves: LeafSite[];
  /** The crown's centre and radius (tree space) — the cards' volume normals and cascade sample reach. */
  crown: { x: number; y: number; z: number; r: number };
  /** Trees round 2: the crown's masses (growTreeSkeleton; absent on a shrub or a crown without sprays). */
  lobes?: CrownLobe[];
  /**
   * Trees round 4: a tufted pine's needle tufts, each its own small mass (tuftLobes) — the cards' normals and depth
   * shade read them instead of the crown's few masses, so every tuft lights as itself (absent on other crowns).
   */
  tufts?: CrownLobe[];
  /**
   * Trees round 5: a shrub's clumps (growShrubSkeleton), the heart first — each its centre on the ground, its radius,
   * the height its envelope's wall gives way to its dome and its top; the stems grow from them (shrubStemSites).
   */
  stools?: ShrubStool[];
}
/** Trees round 5: one clump of a grown shrub (TreeSkeleton.stools). */
interface ShrubStool { x: number; z: number; r: number; c0: number; top: number }

interface GrowthOptions {
  /** 0, 1, 2: the near variants (smaller/younger, typical, larger/older); shapes the height and crown. */
  variant?: number;
  /** Detail tier: 'desktop' or 'mobile' (fewer sprays and side shoots, same silhouette). */
  tier?: 'desktop' | 'mobile';
  /** Trees round 5: grown inside a closed wood (forestGrownProfile), not in the open. */
  forest?: boolean;
}

/**
 * Trees round 5 (2026-10-05, the coordinator's ruling on the gauntlet's wave 98: Frontier's woods "a single wall of
 * near-identical forked grey trunks", the woods' savanna read): how a tree grown inside a closed wood differs from one
 * grown in the open. Drawn up toward the light among its neighbours it self-prunes its lower limbs into a tall clear bole
 * under a high crown, a little narrower, its stem slimmer for its height and its scaffolds more upright: a decurrent
 * broadleaf forks at about one and a half times its open height (never past 56 % of its height), an excurrent
 * broadleaf carries its crown from near half its height and a conifer from over a third, and a gnarled form grows
 * straighter. The field trees keep the open-grown form.
 */
/** Trees round 5: dead wood's weathered silver-grey (emitBranchGeometry, the profile's deadwood). */
export const GROWTH_DEADWOOD_TINT: readonly [number, number, number] = Object.freeze([0.82, 0.8, 0.76]) as unknown as readonly [number, number, number];
/**
 * Trees round 8 (2026-10-07, canopy and form — the gauntlet's waves 236-238: Verdant's woods "a regimented stand of tall,
 * pale, pole-straight trunks with small sparse tufts at the top", Monsoon's spurs "a see-through stand of tall straight
 * trunks carrying only a few flat broadleaf card clusters", Frontier's edge "uniform pale cylinder poles"): round 5's form
 * stood its woods' crowns on clear boles of 45-55 % of their height (Verdant's poplars 6.0 m of 12.5, Frontier's beech
 * 7.0 m of 12.9), narrower than in the open while the stands' trees stand 3 m apart. A closed wood's trees here carry
 * their crowns from under a third of their height, as wide as in the open so neighbours' crowns meet, hardly taller,
 * their scaffolds a little more upright, their sprays a sixth larger so the canopy closes on the same card budget.
 */
export const GROWTH_FOREST_FORM = Object.freeze({
  height: 1.04, crownR: 1.0, trunkR: 0.95, fork: 1.15, forkMax: 0.42, crownBase: 0.30, coniferCrownBase: 0.28,
  scaffoldAngle: 0.85, gnarl: 0.5, spray: 1.15,
});
/** The trees lane (2026-10-06, wave 178): a birch's forest-grown form; since round 8 the general form's own heights. */
export const GROWTH_FOREST_BIRCH = Object.freeze({ height: 1.04, crownR: 1.0, crownBase: 0.30 });
const forestProfiles = new Map<Readonly<GrowthProfile>, Readonly<GrowthProfile>>();
/** A profile's forest-grown form (GROWTH_FOREST_FORM); a palm, a snag, a grass-stage seedling or a clump keeps its own. */
export function forestGrownProfile(p: Readonly<GrowthProfile>): Readonly<GrowthProfile> {
  if (p.family === 'palm' || p.family === 'dead' || p.fountain || p.orchard || p.clump) return p;
  const cached = forestProfiles.get(p);
  if (cached) return cached;
  const f = GROWTH_FOREST_FORM;
  // (the trees lane, 2026-10-06, the gauntlet's wave 178 on Verdant's birch kolki: "tall, spindly ... narrow,
  // see-through crowns" — a birch grown in a wood keeps more of its crown: a little taller, hardly narrower, its crown
  // from two fifths of its height: GROWTH_FOREST_BIRCH)
  const birch = p.family === 'birch', fb = GROWTH_FOREST_BIRCH;
  const forest = P({
    ...p,
    height: p.height * (birch ? fb.height : f.height),
    crownR: p.crownR * (birch ? fb.crownR : f.crownR),
    trunkR: p.trunkR * f.trunkR,
    forkAt: p.form === 'decurrent' ? [Math.min(f.forkMax, p.forkAt[0] * f.fork), Math.min(f.forkMax, p.forkAt[1] * f.fork)] : p.forkAt,
    scaffoldAngle: [p.scaffoldAngle[0] * f.scaffoldAngle, p.scaffoldAngle[1] * f.scaffoldAngle],
    crownBase: p.form === 'excurrent'
      ? Math.max(p.crownBase, birch ? fb.crownBase : p.family === 'conifer' ? f.coniferCrownBase : f.crownBase) : p.crownBase,
    ...(p.gnarl !== undefined ? { gnarl: p.gnarl * f.gnarl } : {}),
    // (round 8: the sprays a sixth larger, the canopy closing on the same card budget)
    spray: [p.spray[0] * f.spray, p.spray[1] * f.spray],
  });
  forestProfiles.set(p, forest);
  return forest;
}

// ------------------------------------------------------------------------------------------------ vector helpers

interface V3 { x: number; y: number; z: number }
const v3 = (x: number, y: number, z: number): V3 => ({ x, y, z });
function norm(v: V3): V3 {
  const l = Math.hypot(v.x, v.y, v.z) || 1;
  return v3(v.x / l, v.y / l, v.z / l);
}
function cross(a: V3, b: V3): V3 { return v3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x); }
function dot(a: V3, b: V3): number { return a.x * b.x + a.y * b.y + a.z * b.z; }
/** Rotate v about the unit axis k by angle (Rodrigues). */
function rotate(v: V3, k: V3, angle: number): V3 {
  const c = Math.cos(angle), s = Math.sin(angle), d = dot(k, v) * (1 - c);
  const kv = cross(k, v);
  return v3(v.x * c + kv.x * s + k.x * d, v.y * c + kv.y * s + k.y * d, v.z * c + kv.z * s + k.z * d);
}
/** Any unit vector perpendicular to the unit v. */
function perpendicular(v: V3): V3 {
  const a = Math.abs(v.y) < 0.9 ? v3(0, 1, 0) : v3(1, 0, 0);
  return norm(cross(v, a));
}
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);
const range = (rng: Rng, r: readonly [number, number]): number => r[0] + rng() * (r[1] - r[0]);

/** The crown envelope's radius fraction at crown height t (0 = crown base, 1 = top). */
export function envelopeFraction(shape: EnvelopeShape, t: number): number {
  const u = clamp01(t);
  switch (shape) {
    case 'cone': return Math.max(0, 1 - u) ** 0.92 * (u < 0.05 ? 0.8 + u * 4 : 1);
    case 'tiered': return Math.max(0, 1 - u) ** 0.85;
    case 'ellipsoid': return Math.sqrt(Math.max(0, 1 - (2 * u - 1) ** 2));
    case 'dome': return Math.sqrt(Math.max(0, 1 - ((u - 0.38) / 0.62) ** 2));
    case 'column': return Math.sin(Math.PI * Math.min(1, 0.12 + u * 0.88)) ** 0.45;
    // trees round 4: the acacia's parasol — widest over its top third, the top flat to a quick rounded shoulder
    case 'umbrella': return u < 0.7 ? 0.3 + u : 1 - ((u - 0.7) / 0.3) ** 4 * 0.95;
    case 'flame': return Math.sin(Math.PI * Math.min(1, 0.08 + u * 0.92)) ** 0.7 * (1 - u * 0.35);
    case 'tuft': return Math.sqrt(Math.max(0, 1 - (2 * u - 1) ** 2));
    // trees round 5: the cedar of Lebanon's shelves — broad from its lowest tier, widest through its middle, the top
    // tier flat to a quick shoulder (an old tree is wider than it is tall)
    case 'shelf': return u < 0.82 ? 0.8 + 0.2 * Math.sin(Math.PI * Math.min(1, u / 0.5) * 0.5) : 1 - ((u - 0.82) / 0.18) ** 3 * 0.85;
    default: return 1;
  }
}

// ------------------------------------------------------------------------------------------------ skeleton growth

interface GrowContext {
  profile: Readonly<GrowthProfile>;
  rng: Rng;
  height: number;
  crownBaseY: number;
  crownTopY: number;
  crownR: number;
  branches: GrowthBranch[];
  mobile: boolean;
  /** Trees round 4: a parasol crown's top — its limbs' highest reach (growScaffolds); the foliage band hangs from it. */
  bandTop?: number;
}

/** The envelope radius at a world height y (0 outside the crown band below the base). */
function envelopeAt(ctx: GrowContext, y: number): number {
  const t = (y - ctx.crownBaseY) / Math.max(0.2, ctx.crownTopY - ctx.crownBaseY);
  if (t < -0.25 || t > 1.02) return 0;
  return ctx.crownR * envelopeFraction(ctx.profile.envelope, t);
}

/** How far outside the envelope a point lies (> 1 = outside), measured against the radius at its height. */
function envelopeExcess(ctx: GrowContext, p: V3): number {
  if (ctx.profile.habit === 'hanging' && p.y < ctx.crownBaseY) {
    if (p.y < 1.3) return 2;
    return Math.hypot(p.x, p.z) / Math.max(0.5, ctx.crownR * 1.05);
  }
  const r = envelopeAt(ctx, p.y);
  const h = Math.hypot(p.x, p.z);
  if (p.y > ctx.crownTopY + 0.15) return 2;
  if (r <= 1e-3) return h > 0.25 ? 2 : 0.9;
  return h / r;
}

/**
 * Grow one branch from `start` along `dir` for `length` metres in `segments` steps: gravity bends it by `droop`
 * radians over its length (weighted by how horizontal it runs), its last third turns up by `upturn`, a hashed wobble
 * keeps it from reading as a straight rod, and an envelope check stops it at the crown's surface.
 */
function growPolyline(
  ctx: GrowContext, start: V3, dir: V3, length: number, segments: number,
  r0: number, r1: number, droop: number, upturn: number, wobble: number,
  flex0: number, flex1: number, clipToEnvelope: boolean,
): GrowthNode[] {
  const nodes: GrowthNode[] = [{ x: start.x, y: start.y, z: start.z, r: r0, flex: flex0 }];
  let d = norm(dir);
  let p = v3(start.x, start.y, start.z);
  const step = length / segments;
  // trees round 4: a gnarled profile's limb meanders — each step bends it in a plane that wanders about it, and
  // leans it back toward its heading (it twists on its way out, never wanders off it)
  const gnarl = ctx.profile.gnarl ?? 0, heading = d;
  let plane = gnarl > 0 ? ctx.rng() * Math.PI * 2 : 0;
  for (let i = 1; i <= segments; i++) {
    const t = i / segments;
    if (gnarl > 0) {
      plane += (ctx.rng() - 0.5) * 1.8;
      d = norm(rotate(d, norm(rotate(perpendicular(d), d, plane)), gnarl * 0.3 * (0.55 + 0.9 * ctx.rng())));
      d = norm(v3(d.x + (heading.x - d.x) * 0.35, d.y + (heading.y - d.y) * 0.35, d.z + (heading.z - d.z) * 0.35));
    }
    // gravity: rotate toward -Y about the horizontal axis perpendicular to d, by the share of the run that is level
    const horiz = Math.hypot(d.x, d.z);
    if (horiz > 1e-3 && droop !== 0) {
      const axis = norm(v3(d.z, 0, -d.x));
      d = norm(rotate(d, axis, -droop / segments * (0.35 + horiz)));
    }
    if (upturn !== 0 && t > 0.6 && horiz > 1e-3) {
      const axis = norm(v3(d.z, 0, -d.x));
      d = norm(rotate(d, axis, upturn / segments * 2.4 * (t - 0.6) / 0.4));
    }
    if (wobble > 0) {
      const w = perpendicular(d);
      d = norm(rotate(d, w, (ctx.rng() - 0.5) * wobble));
      d = norm(rotate(d, d.y > 0.99 ? v3(1, 0, 0) : v3(0, 1, 0), (ctx.rng() - 0.5) * wobble * 0.6));
    }
    const next = v3(p.x + d.x * step, p.y + d.y * step, p.z + d.z * step);
    if (clipToEnvelope && i > 1 && envelopeExcess(ctx, next) > 1.04) {
      // the envelope stops the branch; keep the last node as its tip
      break;
    }
    if (next.y < 0.35 && i > 0) { next.y = Math.max(next.y, 0.35); }
    p = next;
    const tr = Math.pow(t, 0.85);
    nodes.push({ x: p.x, y: p.y, z: p.z, r: lerp(r0, r1, tr), flex: lerp(flex0, flex1, t * t) });
  }
  if (nodes.length < 2) {
    nodes.push({ x: start.x + d.x * step, y: start.y + d.y * step, z: start.z + d.z * step, r: r1, flex: flex1 });
  }
  // the tip's radius is the tip radius whatever the envelope cut off
  nodes[nodes.length - 1].r = Math.min(nodes[nodes.length - 1].r, Math.max(r1, nodes[0].r * 0.25));
  return nodes;
}

/** A point and the unit tangent at arc fraction t along a polyline. */
function sampleAlong(nodes: GrowthNode[], t: number): { p: V3; d: V3; r: number; flex: number } {
  let total = 0;
  const seg: number[] = [];
  for (let i = 1; i < nodes.length; i++) {
    const l = Math.hypot(nodes[i].x - nodes[i - 1].x, nodes[i].y - nodes[i - 1].y, nodes[i].z - nodes[i - 1].z);
    seg.push(l); total += l;
  }
  let want = clamp01(t) * total;
  for (let i = 1; i < nodes.length; i++) {
    const l = seg[i - 1];
    if (want <= l || i === nodes.length - 1) {
      const f = l > 1e-6 ? clamp01(want / l) : 0;
      const a = nodes[i - 1], b = nodes[i];
      return {
        p: v3(lerp(a.x, b.x, f), lerp(a.y, b.y, f), lerp(a.z, b.z, f)),
        d: norm(v3(b.x - a.x, b.y - a.y, b.z - a.z)),
        r: lerp(a.r, b.r, f), flex: lerp(a.flex, b.flex, f),
      };
    }
    want -= l;
  }
  const last = nodes[nodes.length - 1];
  return { p: v3(last.x, last.y, last.z), d: v3(0, 1, 0), r: last.r, flex: last.flex };
}

function polylineLength(nodes: GrowthNode[]): number {
  let total = 0;
  for (let i = 1; i < nodes.length; i++) {
    total += Math.hypot(nodes[i].x - nodes[i - 1].x, nodes[i].y - nodes[i - 1].y, nodes[i].z - nodes[i - 1].z);
  }
  return total;
}

/** The leader / bole: from the ground to its top (or the fork), gently crooked. */
function growStem(ctx: GrowContext, topY: number, r0: number, r1: number, segments: number): number {
  const { rng } = ctx;
  // trees round 4: a gnarled bole crooks further
  const crookA = rng() * Math.PI * 2, crook = (0.04 + rng() * 0.05) * (1 + 2.5 * (ctx.profile.gnarl ?? 0));
  const nodes: GrowthNode[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const y = -0.04 + (topY + 0.04) * t;
    // a soft S-crook (two phases) that leaves the base on the axis
    const sway = Math.sin(t * Math.PI * 1.3) * crook * t + Math.sin(t * Math.PI * 2.7 + 1.1) * crook * 0.35 * t;
    const x = Math.cos(crookA) * sway, z = Math.sin(crookA) * sway;
    // the stem tapers slowly through the bole and quickly through the crown (excurrent leaders go to a whip)
    const r = lerp(r0, r1, Math.pow(t, 1.15));
    const flex = t < 0.45 ? 0 : (t - 0.45) / 0.55 * 0.12;
    nodes.push({ x, y, z, r, flex });
  }
  ctx.branches.push({ order: 0, parent: -1, nodes, mesh: true, broken: false });
  return ctx.branches.length - 1;
}

/** Side shoots along a parent branch, alternating sides around it, bent and clipped like their parent. */
function growSides(
  ctx: GrowContext, parentIndex: number, order: number, perM: number, angle: number, ratio: number, droop: number,
  from: number, mesh: boolean,
): void {
  const { rng, profile } = ctx;
  const parent = ctx.branches[parentIndex];
  const length = polylineLength(parent.nodes);
  if (perM <= 0 || length < 0.3) return;
  const count = Math.max(1, Math.round(length * perM * (ctx.mobile ? 0.7 : 1)));
  let roll = rng() * Math.PI * 2;
  for (let k = 0; k < count; k++) {
    const t = from + (1 - from) * ((k + 0.35 + rng() * 0.4) / count);
    if (t > 0.96) continue;
    const at = sampleAlong(parent.nodes, t);
    // alternate sides with a phyllotactic roll; side shoots on a spruce limb stay near the limb's plane
    roll += profile.whorled && order === 2 ? Math.PI + (rng() - 0.5) * 0.5 : 2.399 + (rng() - 0.5) * 0.6;
    const side = rotate(perpendicular(at.d), at.d, roll);
    let dir = norm(rotate(at.d, norm(cross(at.d, side)), angle * (0.8 + rng() * 0.4)));
    // flat-habit conifers keep their side shoots near the horizontal plane of the limb
    // (trees round 5: a shelved crown's level — its plates are flat)
    if (profile.habit === 'flat' && order === 2) {
      dir = norm(v3(dir.x, profile.envelope === 'shelf' ? (rng() - 0.5) * 0.12 : dir.y * 0.3, dir.z));
    }
    const parentRemain = length * (1 - t);
    const len = Math.max(0.22, Math.min(parentRemain * 1.05 + 0.2, length * ratio * (0.65 + rng() * 0.5) * (1.15 - t * 0.5)));
    const segments = mesh ? Math.max(2, Math.min(4, Math.round(len / 0.45))) : 2;
    const r0 = Math.max(0.006, at.r * (0.55 + rng() * 0.15));
    const nodes = growPolyline(ctx, at.p, dir, len, segments, r0, Math.max(0.004, r0 * 0.22),
      droop, profile.upturn * 0.4, 0.18, at.flex + 0.05, at.flex + 0.18 + order * 0.04, true);
    ctx.branches.push({ order, parent: parentIndex, nodes, mesh, broken: false });
    if (order === 2 && profile.twigPerM > 0) {
      growSides(ctx, ctx.branches.length - 1, 3, profile.twigPerM, profile.sideAngle * 0.9, 0.55, profile.sideDroop * 0.6, 0.2, false);
    }
  }
}

/** Scaffold limbs of a decurrent crown: the stem divides at the fork into limbs that rise and spread to the envelope. */
function growScaffolds(ctx: GrowContext, stemIndex: number, variant: number): void {
  const { rng, profile } = ctx;
  const stem = ctx.branches[stemIndex];
  const fork = stem.nodes[stem.nodes.length - 1];
  const n = Math.round(range(rng, profile.scaffolds));
  const phase = rng() * Math.PI * 2;
  /** Trees round 4: a parasol crown's limbs and where their side shoots may start, grown once every limb has its reach. */
  const parasol: Array<[number, number]> = [];
  // trees round 5: a crown with deadwood loses its share of the scaffolds (one at the least), from its own draws (none
  // for a crown without)
  const deadShare = profile.deadwood ?? 0;
  const deadCount = deadShare > 0 ? Math.max(1, Math.round(n * deadShare)) : 0, deadFrom = deadShare > 0 ? (rng() * n) | 0 : 0;
  for (let s = 0; s < n; s++) {
    const firstBranch = ctx.branches.length;
    const dead = deadCount > 0 && ((s - deadFrom + n) % n) < deadCount;
    const az = phase + (s / n) * Math.PI * 2 + (rng() - 0.5) * 0.7;
    const a = range(rng, profile.scaffoldAngle) * (variant === 1 ? 0.92 : variant === 2 ? 1.08 : 1);
    const dir = v3(Math.sin(a) * Math.cos(az), Math.cos(a), Math.sin(a) * Math.sin(az));
    // reach: to the envelope (with some limbs falling short so the crown is lobed, not a ball)
    const reach = ctx.crownR * (0.85 + rng() * 0.35);
    const rise = ctx.crownTopY - fork.y;
    const len = Math.min(Math.hypot(reach, rise * 0.85), reach / Math.max(0.35, Math.sin(a)) * 1.05);
    const r0 = fork.r * (0.62 + rng() * 0.12) * (n > 3 ? 0.9 : 1);
    // (a clump's culm grows its whole length, arching under its own weight: no envelope stops it; trees lane, round 2:
    // each rises from its own seat on the clump's rhizome base, out along its azimuth)
    const seat = profile.clump && profile.clumpR ? Math.sqrt(rng()) * profile.clumpR : 0;
    const grown = growPolyline(ctx, v3(fork.x + Math.cos(az) * seat, fork.y - 0.12, fork.z + Math.sin(az) * seat), dir, len,
      4 + Math.round(3 * (profile.gnarl ?? 0)), r0, 0.025, profile.droop * 0.7, profile.upturn, 0.22, 0.05, 0.28, !profile.clump);
    // (trees round 5: a dead limb snapped a third short, before anything grows on it — its tip a splintered stub)
    const nodes = dead ? grown.slice(0, Math.max(2, Math.ceil(grown.length * 0.7))) : grown;
    ctx.branches.push({ order: 1, parent: stemIndex, nodes, mesh: true, broken: dead });
    const limb = ctx.branches.length - 1;
    // a continuing leader on some scaffolds: a second split two thirds up gives the dome its lobes (never a clump's culm)
    if (!profile.clump && rng() < 0.45) {
      const at = sampleAlong(nodes, 0.55 + rng() * 0.15);
      const side = rotate(perpendicular(at.d), at.d, rng() * Math.PI * 2);
      const d2 = norm(rotate(at.d, norm(cross(at.d, side)), 0.45 + rng() * 0.25));
      const n2 = growPolyline(ctx, at.p, d2, len * (0.45 + rng() * 0.2), 3 + Math.round(2 * (profile.gnarl ?? 0)), at.r * 0.7, 0.018,
        profile.droop * 0.6, profile.upturn, 0.2, at.flex, at.flex + 0.2, true);
      ctx.branches.push({ order: 1, parent: limb, nodes: n2, mesh: true, broken: false });
      if (profile.foliageBand) parasol.push([ctx.branches.length - 1, 0.15]);
      else growSides(ctx, ctx.branches.length - 1, 2, profile.sidePerM, profile.sideAngle, profile.sideRatio, profile.sideDroop, 0.15, true);
    }
    if (profile.foliageBand) parasol.push([limb, 0.18]);
    else growSides(ctx, limb, 2, profile.sidePerM, profile.sideAngle, profile.sideRatio, profile.sideDroop, 0.18, true);
    // the dead limb and all it carries: bare and silver
    if (dead) for (let b = firstBranch; b < ctx.branches.length; b++) ctx.branches[b].dead = true;
  }
  // trees round 4: a parasol crown's layer lies over its limbs' highest reach (a young tree's limbs may fall short of
  // the profile's height), and the limbs' side shoots crowd into it
  if (parasol.length) {
    let top = -Infinity;
    for (const [b] of parasol) for (const node of ctx.branches[b].nodes) top = Math.max(top, node.y);
    ctx.bandTop = Math.min(ctx.crownTopY, top);
    for (const [b, from0] of parasol) {
      const [perM, from] = parasolSides(ctx, ctx.branches[b].nodes, from0);
      growSides(ctx, b, 2, perM, profile.sideAngle, profile.sideRatio, profile.sideDroop, from, true);
    }
    // the layer's top is the shoots' own (a shoot may climb a little over its limb's tip): the band hangs from it
    let shootTop = top;
    for (const branch of ctx.branches) for (const node of branch.nodes) shootTop = Math.max(shootTop, node.y);
    ctx.bandTop = Math.min(ctx.crownTopY + 0.15, shootTop);
  }
}

/**
 * Trees round 4: where a scaffold of a parasol crown (the profile's foliageBand) carries its side shoots — only where
 * it has climbed into the band, crowded there (the acacia's flat layer of twigs over bare limbs); elsewhere `from` at
 * the profile's own density.
 */
function parasolSides(ctx: GrowContext, nodes: GrowthNode[], from: number): [number, number] {
  const { profile } = ctx;
  if (!profile.foliageBand) return [profile.sidePerM, from];
  const floor = (ctx.bandTop ?? ctx.crownTopY) - profile.foliageBand * ctx.height / profile.height * 1.15;
  const total = polylineLength(nodes);
  let along = 0;
  for (let i = 1; i < nodes.length; i++) {
    const l = Math.hypot(nodes[i].x - nodes[i - 1].x, nodes[i].y - nodes[i - 1].y, nodes[i].z - nodes[i - 1].z);
    if (nodes[i].y >= floor) {
      const f = nodes[i].y > nodes[i - 1].y ? clamp01((floor - nodes[i - 1].y) / (nodes[i].y - nodes[i - 1].y)) : 0;
      along += l * f;
      break;
    }
    along += l;
  }
  const t = Math.max(from, Math.min(0.9, along / Math.max(1e-3, total)));
  // the shoots the whole limb would carry, crowded onto its part in the band
  return [profile.sidePerM / Math.max(0.25, 1 - t) * (1 - from), t];
}

/** Primaries along an excurrent leader: whorls (conifers) or a spiral (poplar, birch, eucalyptus, cypress). */
function growPrimaries(ctx: GrowContext, stemIndex: number, variant: number): void {
  const { rng, profile } = ctx;
  const stem = ctx.branches[stemIndex];
  // (trees round 5: a shelved crown's top tier is its top — no leader stands over it)
  const y0 = ctx.crownBaseY, y1 = ctx.crownTopY - (profile.envelope === 'shelf' ? 0.08 : profile.whorled ? 0.32 : 0.45);
  let y = y0 + rng() * profile.spacing * 0.5;
  let az = rng() * Math.PI * 2;
  const spacing = profile.spacing * (ctx.mobile ? 1.18 : 1);
  const ragged = profile.ragged ?? 0;
  while (y < y1) {
    const t = (y - y0) / Math.max(0.3, ctx.crownTopY - y0);
    const count = profile.whorled ? Math.round(range(rng, profile.perWhorl)) : 1;
    // trees round 5: a ragged crown's whorl reaches its own share of the cone (no draw for any other crown)
    const whorlReach = ragged > 0 ? 1 + (rng() - 0.45) * 0.36 * ragged : 1;
    const at = sampleAlong(stem.nodes, y / ctx.height);
    for (let k = 0; k < count; k++) {
      const a = lerp(profile.angleLow, profile.angleHigh, t) + (rng() - 0.5) * 0.18;
      const azK = az + (k / count) * Math.PI * 2 + (rng() - 0.5) * (profile.whorled ? 0.45 : 0.3);
      const dir = v3(Math.sin(a) * Math.cos(azK), Math.cos(a), Math.sin(a) * Math.sin(azK));
      const env = envelopeAt(ctx, y);
      // the branch reaches the envelope at its height (a hanging limb a little beyond: its droop pulls it back in)
      const reach = Math.max(profile.family === 'conifer' ? 0.36 : 0.25,
        env * (0.82 - 0.22 * ragged + rng() * (0.3 + 0.5 * ragged)) * whorlReach);
      const len = Math.min(reach / Math.max(0.25, Math.sin(Math.min(a, Math.PI - 0.25))) * 1.05, ctx.crownR * 1.9);
      if (len < 0.25) continue;
      const r0 = Math.max(0.012, at.r * (profile.family === 'conifer' ? 0.30 : 0.5) * (0.85 + rng() * 0.3) * (1 - t * 0.5));
      const segments = profile.family === 'conifer' ? (len > 1.4 ? 3 : 2) : Math.max(2, Math.min(5, Math.round(len / 0.5)));
      const nodes = growPolyline(ctx, at.p, dir, len, segments, r0, 0.008,
        profile.droop, profile.upturn, profile.family === 'conifer' ? 0.10 : 0.2, at.flex + 0.04, at.flex + 0.24, true);
      // a conifer's upper limbs are buried in its sprays: only the lower crown's limbs (and every broadleaf
      // primary) are wood the eye can find
      // below 1.7 m a limb is spray-hidden (and the stem's collision band, treeTrunkQuality.selftest, stays the stem's)
      let lowest = Infinity;
      for (const node of nodes) lowest = Math.min(lowest, node.y);
      const meshed = (profile.family !== 'conifer' || t < 0.55 || r0 > 0.05) && lowest >= GROWTH_LOWEST_WOOD_M;
      ctx.branches.push({ order: 1, parent: stemIndex, nodes, mesh: meshed, broken: false });
      growSides(ctx, ctx.branches.length - 1, 2, profile.sidePerM, profile.sideAngle, profile.sideRatio, profile.sideDroop, 0.12,
        profile.family !== 'conifer');
    }
    az += profile.whorled ? 0.62 + rng() * 0.5 : 2.399 + (rng() - 0.5) * 0.4;
    y += spacing * (0.8 + rng() * 0.4) * (profile.whorled ? 1 - t * 0.25 : 1);
  }
  void variant;
}

/** Spray seats on the foliage-bearing branches: along their outer part and at their tips. */
function seatLeaves(ctx: GrowContext, leaves: LeafSite[]): void {
  const { rng, profile } = ctx;
  if (profile.leafPerM <= 0) return;
  const crownMid = (ctx.crownBaseY + ctx.crownTopY) * 0.5;
  const crownSpan = Math.max(0.5, ctx.crownTopY - ctx.crownBaseY);
  const perM = profile.leafPerM * (ctx.mobile ? 0.62 : 1);
  // trees round 4: a parasol crown's foliage band (the acacia's flat layer), scaled with the tree
  const band = (profile.foliageBand ?? 0) * ctx.height / profile.height;
  if (profile.family === 'conifer' && profile.form === 'excurrent' && ctx.branches.length) {
    const stem = ctx.branches[0];
    const tip = stem.nodes[stem.nodes.length - 1];
    // Trees round 2 (2026-10-03): the apex is a spire of shoots round the leader, the youngest upright at the top and the
    // older ones leaning out below it, so no bare whip stands over the crown (the gauntlet's "pole with a tuft" read).
    // Each shoot's tip stays within a hand's breadth of the leader's top.
    const leaders = ctx.mobile ? 1 : 6, shelf = profile.envelope === 'shelf';
    const spin0 = rng() * Math.PI * 2;
    for (let k = 0; k < leaders; k++) {
      const t = 0.985 - k * 0.032;
      const at = sampleAlong(stem.nodes, t);
      const spin = spin0 + k * 2.399 + (rng() - 0.5) * 0.4;
      const lean = k === 0 ? 0.04 : 0.16 + 0.07 * k;
      // trees round 5: a shelved crown (the cedar of Lebanon) is flat-topped — its apex sprays lie level round the
      // leader's top, a last plate, no spire
      const axis = shelf ? norm(v3(Math.cos(spin), -0.03, Math.sin(spin))) : norm(v3(Math.cos(spin) * lean, 1, Math.sin(spin) * lean));
      let face = norm(rotate(perpendicular(axis), axis, spin));
      if (shelf) {
        face = norm(cross(norm(cross(axis, v3(0, 1, 0))), axis));
        if (face.y < 0) face = v3(-face.x, -face.y, -face.z);
      }
      const size = range(rng, profile.spray) * (0.95 - k * 0.05);
      leaves.push({ x: at.p.x, y: at.p.y - 0.05, z: at.p.z, ax: axis.x, ay: axis.y, az: axis.z, nx: face.x, ny: face.y, nz: face.z,
        length: shelf ? size : Math.min(size, Math.max(0.3, (tip.y + 0.12 - at.p.y) / Math.max(0.5, axis.y))), width: size * profile.aspect * 0.8, shade: 1,
        flex: Math.min(1, at.flex + 0.3), tile: (rng() * 4) | 0, bend: 0, branch: 0 });
    }
  }
  for (let branchIndex = 0; branchIndex < ctx.branches.length; branchIndex++) {
    const branch = ctx.branches[branchIndex];
    if (branch.broken || branch.dead) continue;
    // a weeping crown's scaffold tips carry curtains too (the limb would otherwise end bare above them); trees round 4:
    // and a parasol's limb tips their sprays (a bare limb end stood over the acacia's flat layer)
    const tipOnly = branch.order < profile.leafOrder;
    if (tipOnly && !((profile.habit === 'hanging' || profile.foliageBand) && branch.order === 1)) continue;
    const length = polylineLength(branch.nodes);
    if (length < 0.15) continue;
    const count = tipOnly ? 0 : Math.max(1, Math.round(length * (1 - profile.leafFrom) * perM));
    const seats: number[] = [];
    for (let k = 0; k < count; k++) seats.push(profile.leafFrom + (1 - profile.leafFrom) * ((k + 0.3 + rng() * 0.5) / count));
    if (tipOnly) seats.push(0.9 + rng() * 0.05, 0.98);
    const tips = Math.max(0, Math.round(profile.tipSprays * (ctx.mobile ? 0.6 : 1)));
    for (let k = 0; k < tips; k++) seats.push(0.97 + rng() * 0.03);
    for (const t of seats) {
      const at = sampleAlong(branch.nodes, Math.min(1, t));
      if (band > 0 && at.p.y < (ctx.bandTop ?? ctx.crownTopY) - band) continue;
      const outward = norm(v3(at.p.x + 1e-4, 0, at.p.z));
      const tipSeat = t >= 0.97;
      let axis: V3, face: V3;
      const roll = (rng() - 0.5);
      // a weeping crown's scaffolds carry the dome's sprays along them and curtains at their tips
      const habit = profile.habit === 'hanging' && branch.order < 2 && profile.form === 'decurrent' && !tipOnly ? 'spray' : profile.habit;
      switch (habit) {
        case 'hanging': {
          // curtains: the spray hangs from its seat, swung outward a little
          axis = norm(v3(outward.x * 0.35 + at.d.x * 0.15 + roll * 0.2, -1, outward.z * 0.35 + at.d.z * 0.15 + roll * 0.2));
          face = norm(cross(axis, norm(v3(-outward.z, 0, outward.x))));
          if (dot(face, outward) < 0) face = v3(-face.x, -face.y, -face.z);
          break;
        }
        case 'flat': {
          // tier sprays: along the branch, drooping a little below it, faces to the sky, rolled about the axis by the
          // species' roll (a spruce's sprays every way, a fir's and a cedar's flat)
          axis = norm(v3(at.d.x + roll * 0.5, at.d.y * 0.35 - 0.08 - profile.flatDroop * (0.5 + rng()), at.d.z - roll * 0.5));
          // trees round 5: a shelf's sprays lie level along its plate, so the card turned to the viewer is a level strip
          if (profile.envelope === 'shelf') axis = norm(v3(axis.x, -0.03, axis.z));
          const right = norm(cross(axis, v3(0, 1, 0)));
          face = norm(rotate(norm(cross(right, axis)), axis, (rng() - 0.5) * 2 * profile.flatRoll));
          if (face.y < 0) face = v3(-face.x, -face.y, -face.z);
          break;
        }
        case 'upright': {
          axis = norm(v3(at.d.x * 0.5 + outward.x * 0.25 + roll * 0.2, 1.2, at.d.z * 0.5 + outward.z * 0.25 - roll * 0.2));
          face = norm(cross(axis, norm(v3(-outward.z, 0, outward.x))));
          if (dot(face, outward) < 0) face = v3(-face.x, -face.y, -face.z);
          break;
        }
        case 'tuft': {
          // pine tufts: a burst of sprays round the tip, up and out
          const spin = rng() * Math.PI * 2;
          const base = norm(v3(at.d.x + outward.x * 0.4, Math.max(0.15, at.d.y) + 0.45, at.d.z + outward.z * 0.4));
          axis = norm(rotate(base, perpendicular(base), (rng() - 0.3) * 0.9));
          face = norm(rotate(perpendicular(axis), axis, spin));
          if (face.y < 0) face = v3(-face.x, -face.y, -face.z);
          break;
        }
        default: {
          // broadleaf sprays: along the twig, swung outward and up toward the light, faces turned to the sky
          axis = norm(v3(at.d.x * 0.6 + outward.x * 0.5 + roll * 0.35, at.d.y * 0.5 + 0.28, at.d.z * 0.6 + outward.z * 0.5 - roll * 0.35));
          const right = norm(cross(axis, v3(0, 1, 0)));
          face = norm(rotate(norm(cross(right, axis)), axis, roll * 1.2));
          if (face.y < -0.2) face = v3(-face.x, -face.y, -face.z);
        }
      }
      // inner sprays are shaded and smaller; the outer shell and the top catch the light
      const radial = Math.hypot(at.p.x, at.p.z) / Math.max(0.3, envelopeAt(ctx, at.p.y) || ctx.crownR);
      const vertical = clamp01((at.p.y - ctx.crownBaseY) / crownSpan);
      const shade = clamp01(0.35 * clamp01(radial) + 0.45 * vertical + (tipSeat ? 0.2 : 0) + (rng() - 0.5) * 0.12);
      let size = range(rng, profile.spray) * (0.78 + 0.32 * clamp01(radial)) * (tipSeat ? 1.05 : 1);
      // Trees round 2: a conifer's sprays shorten toward its apex with the envelope, so the spire stays a spire
      if (profile.family === 'conifer') size = Math.min(size, 0.34 + 0.9 * envelopeAt(ctx, at.p.y));
      // no spray reaches into the ground: a drooping or hanging card is shortened to end a hand's breadth over it
      // (the leaf budget's growth below is capped by the same rule)
      const bendNow = profile.cardBend;
      const fall = Math.max(0, -axis.y) + bendNow;
      if (fall > 1e-3) size = Math.max(0.3, Math.min(size, (at.p.y - GROWTH_SPRAY_CLEARANCE_M) / fall));
      leaves.push({
        x: at.p.x, y: at.p.y, z: at.p.z, ax: axis.x, ay: axis.y, az: axis.z, nx: face.x, ny: face.y, nz: face.z,
        length: size, width: size * profile.aspect * (0.9 + rng() * 0.2), shade, flex: Math.min(1, at.flex + 0.25 + rng() * 0.15),
        tile: (rng() * 4) | 0, bend: profile.cardBend * (0.6 + rng() * 0.8), branch: branchIndex,
      });
      void crownMid;
    }
  }
}

/**
 * A shell-killed snag: a shattered trunk — a stem snapped off, its top a crown of splintered shards, a few dead limb
 * stubs and no foliage. Trees round 3 (2026-10-03, the gauntlet's wave 31: "a dark, drooping, spiky tree ... reads as
 * dead or diseased foliage" on Kursk, Fulda and Dalmatia): the snag kept a few long dead limbs with side twigs and a
 * handful of drooping twig sprays, which read as a living species gone sick; it is wood only now, and fewer of them
 * stand (vegetation.ts battleSnagShare).
 */
function growSnag(ctx: GrowContext): void {
  const { rng } = ctx;
  const top = ctx.height;
  const rTop = ctx.profile.trunkR * (0.42 + rng() * 0.16);
  const stem = growStem(ctx, top, ctx.profile.trunkR * 1.02, rTop, 6);
  ctx.branches[stem].broken = true;
  // the break: three to five shards of the stem's wood standing up out of the snapped top, pointed and leaning out
  const head = ctx.branches[stem].nodes[ctx.branches[stem].nodes.length - 1];
  const shards = 3 + ((rng() * 3) | 0), az0 = rng() * Math.PI * 2;
  for (let k = 0; k < shards; k++) {
    const az = az0 + (k / shards) * Math.PI * 2 + (rng() - 0.5) * 0.6, a = 0.08 + rng() * 0.32;
    const dir = v3(Math.sin(a) * Math.cos(az), Math.cos(a), Math.sin(a) * Math.sin(az));
    const at = v3(head.x + Math.cos(az) * head.r * 0.55, head.y - 0.05, head.z + Math.sin(az) * head.r * 0.55);
    const nodes = growPolyline(ctx, at, dir, 0.25 + rng() * 0.3, 2, head.r * (0.28 + rng() * 0.12), 0.006,
      0, 0, 0.05, 0, 0, false);
    ctx.branches.push({ order: 1, parent: stem, nodes, mesh: true, broken: true });
  }
  // the limbs: one to three, most of them snapped to stubs
  const limbs = 1 + ((rng() * 3) | 0);
  for (let k = 0; k < limbs; k++) {
    const t = 0.38 + rng() * 0.5;
    const at = sampleAlong(ctx.branches[stem].nodes, t);
    const az = rng() * Math.PI * 2, a = 0.8 + rng() * 0.7;
    const dir = v3(Math.sin(a) * Math.cos(az), Math.cos(a), Math.sin(a) * Math.sin(az));
    const snapped = rng() < 0.8;
    const len = (snapped ? 0.3 + rng() * 0.5 : 0.9 + rng() * 1.0) * (1 - t * 0.35);
    const r0 = Math.max(0.03, at.r * (0.35 + rng() * 0.15));
    const nodes = growPolyline(ctx, at.p, dir, len, snapped ? 2 : 3, r0, snapped ? r0 * 0.7 : 0.012,
      0.2, 0.2, 0.3, 0.02, 0.12, false);
    ctx.branches.push({ order: 1, parent: stem, nodes, mesh: true, broken: snapped });
  }
}

/**
 * A palm: one leaning stem that arches back toward the vertical near its top, swollen at its foot, and a crown of
 * fronds fanning from its head on the golden angle — the youngest upright at the heart, the mature ones arching
 * out, the oldest hanging, the last two dead (shade 0: vegetation.ts tints them brown). Every frond is seated inside
 * the stem's head (its crown support).
 */
function growPalm(ctx: GrowContext, leaves: LeafSite[], variant: number): void {
  const { rng, profile } = ctx;
  const leanA = rng() * Math.PI * 2, lean = 0.35 + rng() * 0.5 + variant * 0.15;
  const segments = 9;
  const nodes: GrowthNode[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const off = lean * (t * t - 0.45 * Math.max(0, t - 0.66) ** 2);
    const swell = 1 + 0.3 * Math.max(0, 1 - t * 5);
    const r = lerp(profile.trunkR, profile.trunkR * 0.62, Math.pow(t, 0.9)) * swell;
    nodes.push({ x: Math.cos(leanA) * off, y: -0.04 + (ctx.height + 0.04) * t, z: Math.sin(leanA) * off, r,
      flex: t < 0.4 ? 0 : (t - 0.4) / 0.6 * 0.22 });
  }
  ctx.branches.push({ order: 0, parent: -1, nodes, mesh: true, broken: false });
  const count = ctx.mobile ? 10 : 16;
  const golden = Math.PI * (3 - Math.sqrt(5)), az0 = rng() * Math.PI * 2;
  for (let k = 0; k < count; k++) {
    const age = k / (count - 1), dead = k >= count - 2;
    const elev = age < 0.2 ? 1.0 - age * 1.6 : age < 0.75 ? 0.45 - (age - 0.2) * 0.8 : -0.05 - (age - 0.75) * 2.6;
    const az = az0 + k * golden + (rng() - 0.5) * 0.25;
    const ce = Math.cos(elev), se = Math.sin(elev);
    const axis = norm(v3(Math.cos(az) * ce, se, Math.sin(az) * ce));
    const across = norm(cross(axis, v3(0, 1, 0)));
    let face = norm(cross(across, axis));
    if (face.y < 0) face = v3(-face.x, -face.y, -face.z);
    const length = range(rng, profile.spray) * (age < 0.2 ? 0.62 + age * 1.9 : 1) * (dead ? 0.85 : 1);
    // the frond's base sits on the stem's axis just under the head (older fronds lower down the crownshaft)
    const at = sampleAlong(nodes, 1 - (0.06 + age * 0.3) / Math.max(1, ctx.height));
    leaves.push({
      x: at.p.x + axis.x * 0.03, y: at.p.y, z: at.p.z + axis.z * 0.03,
      ax: axis.x, ay: axis.y, az: axis.z, nx: face.x, ny: face.y, nz: face.z,
      length, width: length * profile.aspect * (0.9 + rng() * 0.2), shade: dead ? 0 : clamp01(0.55 + 0.45 * (1 - age)),
      flex: clamp01(0.55 + 0.35 * rng()), tile: 0, bend: dead ? 0.2 : profile.cardBend * (0.7 + 0.6 * age), branch: 0,
    });
  }
}

/** Closest point to p on the segment a→b (the parameter and the point). */
function onSegment(p: V3, a: V3, b: V3): { t: number; q: V3 } {
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z, l2 = abx * abx + aby * aby + abz * abz;
  const t = l2 > 1e-12 ? clamp01(((p.x - a.x) * abx + (p.y - a.y) * aby + (p.z - a.z) * abz) / l2) : 0;
  return { t, q: v3(a.x + abx * t, a.y + aby * t, a.z + abz * t) };
}

/**
 * The crown supports (treeAttachments.ts's contract: no foliage without wood under it). A branch the emitter skips —
 * a side shoot past the tube budget, a twig past the wood's order — that carries sprays, or carries a branch that
 * does, becomes one straight three-sided twig from its base to its farthest need (a seat or a carried branch's base),
 * and what it carries moves onto that chord: a spray's seat by its projection, a carried branch with its base (a
 * short twig's chord lies within centimetres of its curve; a straightened branch carries its whole load with it).
 * Parents come before their children in the skeleton, so a parent has moved before its children attach to it. A
 * limb reaching into the stem's collision band (below GROWTH_LOWEST_WOOD_M) stays hidden in its own sprays, as it
 * always was (the band keeps no wood), and so does what it carries.
 */
function supportSprays(ctx: GrowContext, leaves: LeafSite[]): boolean[] {
  const branches = ctx.branches;
  const emitted = (b: GrowthBranch): boolean => b.mesh && b.order <= 2;
  const need = new Array<boolean>(branches.length).fill(false);
  const seatsOf = new Map<number, LeafSite[]>();
  for (const l of leaves) {
    let list = seatsOf.get(l.branch);
    if (!list) { list = []; seatsOf.set(l.branch, list); }
    list.push(l);
    for (let b = l.branch; b >= 0 && !emitted(branches[b]); b = branches[b].parent) need[b] = true;
  }
  const childrenOf = new Map<number, number[]>();
  for (let i = 1; i < branches.length; i++) {
    const parent = branches[i].parent;
    let list = childrenOf.get(parent);
    if (!list) { list = []; childrenOf.set(parent, list); }
    list.push(i);
  }
  // a rigid move of a branch, everything it carries and every spray seated on them
  const translate = (root: number, dx: number, dy: number, dz: number): void => {
    const stack = [root];
    while (stack.length) {
      const b = stack.pop()!;
      for (const n of branches[b].nodes) { n.x += dx; n.y += dy; n.z += dz; }
      for (const l of seatsOf.get(b) ?? []) { l.x += dx; l.y += dy; l.z += dz; }
      stack.push(...(childrenOf.get(b) ?? []));
    }
  };
  const hidden = new Array<boolean>(branches.length).fill(false);
  for (let i = 0; i < branches.length; i++) {
    if (!need[i]) continue;
    const branch = branches[i], base = branch.nodes[0];
    // a limb reaching into the stem's collision band stays hidden in its sprays, and so does all it carries
    const parent = branch.parent;
    if (Math.min(...branch.nodes.map((n) => n.y)) < GROWTH_LOWEST_WOOD_M || (parent >= 0 && hidden[parent])) { hidden[i] = true; continue; }
    const seats = seatsOf.get(i) ?? [], kids = (childrenOf.get(i) ?? []).filter((k) => need[k]);
    // the farthest need from the base: a seat, or a carried branch's base
    let far: V3 | null = null, farD = -1;
    for (const l of seats) { const d = Math.hypot(l.x - base.x, l.y - base.y, l.z - base.z); if (d > farD) { farD = d; far = v3(l.x, l.y, l.z); } }
    for (const k of kids) { const n = branches[k].nodes[0], d = Math.hypot(n.x - base.x, n.y - base.y, n.z - base.z); if (d > farD) { farD = d; far = v3(n.x, n.y, n.z); } }
    if (!far || farD < 0.05) continue;
    const a = v3(base.x, base.y, base.z), tipR = Math.max(0.006, branch.nodes[branch.nodes.length - 1].r);
    const flexEnd = branch.nodes[branch.nodes.length - 1].flex;
    // what it carries moves onto the chord first (each child with its own load), then the branch becomes the chord
    for (const k of childrenOf.get(i) ?? []) {
      const n0 = branches[k].nodes[0], { q } = onSegment(v3(n0.x, n0.y, n0.z), a, far);
      translate(k, q.x - n0.x, q.y - n0.y, q.z - n0.z);
    }
    for (const l of seats) { const { q } = onSegment(v3(l.x, l.y, l.z), a, far); l.x = q.x; l.y = q.y; l.z = q.z; }
    branch.nodes = [base, { x: far.x, y: far.y, z: far.z, r: tipR, flex: flexEnd }];
    branch.mesh = true;
    branch.support = true;
  }
  return hidden;
}

/**
 * The grown shrubs (bushes and understorey): sprays per shrub, each a two-triangle card (emitLeafCards rows 2). Round
 * 2 kept the round-8 cards' triangle budget (32 and 20 sprays: the bush's 64 triangles, the understorey's 40); trees
 * round 4 (the gauntlet's wave 46: the shrubs read as "lettuce heads", "topiary", "a sphere with a leaf texture") grows
 * them from more sprays at 0.72 of the length (GROWTH_SHRUB_SPRAY_SCALE): a shrub's leaves at a shrub's size, a finer,
 * lumpier mound — a bush's 48 (the merge's cost trim from 60), the understorey's 36. A species of narrow sprays (aspect
 * under 0.8: birch, willow) carries up to a third more.
 */
export const GROWTH_SHRUB_SPRAYS: Readonly<Record<'bush' | 'understorey', number>> = Object.freeze({ bush: 48, understorey: 36 });
/** Trees round 4: a shrub's spray length against round 2's (the shrub's leaves at a shrub's size, not a crown's). */
const GROWTH_SHRUB_SPRAY_SCALE = 0.72;

/**
 * The grown shrub's value in light per bush species, on top of the crown's foliageValue: the round-8 bush cards carried
 * their own tint law (hue 0.24, a 1.7 gain, a radial shade) over the legacy sheets, so a shrub keeps the effective
 * albedo (card tint × atlas reflectance) the round-8 bush of its map had — .qa-dev shrub-stats, grown / legacy before
 * this: oak 0.86, poplar 0.92, willow 0.85, acacia 0.78, birch 0.78, spruce 1.02, pine 0.94, cedar 1.05, mangrove 1.10
 * (with the crown's foliageValue in, which the shrub value divides back out where the crowns' value in light moved
 * it: the shrubs' own views read at parity). 1 when unset.
 */
export const GROWTH_SHRUB_VALUE: Readonly<Partial<Record<GrowthSpecies, number>>> = Object.freeze({
  oak: 0.93, poplar: 1.09, willow: 1.17, acacia: 0.83, birch: 1.27, spruce: 0.91, pine: 1.07, cedar: 0.95, mangrove: 1.0,
});

/**
 * A shrub grown from its species' sprays (the desktop field bush and the stands' understorey): no drawn wood — a
 * shrub's stems stand inside its foliage — but a mound of shingled sprays. Each spray's centre sits on the mound's
 * envelope, the spray climbing the envelope along its up-slope tangent (swung either way about its normal) and lifting
 * out of it a little, its face turned outward: the faces make the lit shell from any side and the tips its ragged
 * edge (a spray reaching straight out from the heart shows a viewer on its side only its edge). A broadleaf shrub is
 * a dome widest a third of the way up, lobed around its azimuth, its skirt standing on the ground; a conifer's is a
 * low cone, its sprays near level and drooping. Equal-area steps up the envelope (the sides carry more sprays than
 * the top). The understorey is the smaller stand-edge growth. Unit scale (the pools scale it; the bush stays inside
 * its cover disc's reach), grounded at y = 0, deterministic in `rng`.
 */
export function growShrubSkeleton(species: GrowthSpecies, kind: 'bush' | 'understorey', rng: Rng): TreeSkeleton {
  const profile = TREE_GROWTH_PROFILES[species];
  if (profile.fountain) return growFountainShrub(species, kind, rng);
  const under = kind === 'understorey';
  const conifer = profile.family === 'conifer';
  // narrow sprays (birch, willow) come more to a shrub and a little wider, so its shell closes as a broad spray's does
  const narrow = Math.min(1, profile.aspect / 0.8);
  const count = Math.round(GROWTH_SHRUB_SPRAYS[kind] * Math.min(4 / 3, 1 / narrow));
  const widen = Math.sqrt(1 / Math.max(0.75, narrow));
  // the envelope: radius and height, its widest level; a conifer's top runs to a point (the superellipse exponent)
  const R = (under ? 0.64 : 0.9) * (conifer ? 0.9 : 1), H = (under ? 0.98 : 1.36) * (conifer ? 1.1 : 1);
  const c0 = conifer ? H * 0.22 : H * 0.32, Hc = H - c0, pow = conifer ? 1.25 : 2;
  const golden = Math.PI * (3 - Math.sqrt(5));
  const s0 = Math.sin(-0.4), s1 = Math.sin(1.5);
  // Ground lane (2026-10-03, the gauntlet: "bushes are near-identical round green balls"): a field bush is a union of
  // clumps — its heart and two or three stools leaning out of it at their own heights (a hawthorn's, a hazel's, a
  // blackthorn's), each its own (super)ellipse — so the silhouette breaks into lobes and dips instead of one dome; the
  // understorey keeps one clump. The sprays are dealt to the clumps by their shells' size; a seat that would sit inside
  // another clump (hidden) is dealt again a few times. The spray budget, the shell, the cover disc stay what they were.
  interface Clump { x: number; z: number; R: number; c0: number; Hc: number; lobe1: number; lobe2: number; az0: number; n: number }
  const clumps: Clump[] = [{ x: 0, z: 0, R: R * (under ? 1 : 0.86), c0, Hc, lobe1: rng() * Math.PI * 2, lobe2: rng() * Math.PI * 2, az0: rng() * Math.PI * 2, n: 0 }];
  if (!under) {
    // trees round 4 (the gauntlet's wave 46: "lettuce heads", "topiary"): three to five stools of their own sizes and
    // heights, further out — a lumpier, lopsided thicket
    const stools = 3 + ((rng() * 3) | 0), a0 = rng() * Math.PI * 2;
    for (let i = 0; i < stools; i++) {
      const a = a0 + i * (Math.PI * 2 / stools) + (rng() - 0.5) * 1.1;
      const d = R * (0.46 + rng() * 0.36), r = R * (0.36 + rng() * 0.3), h = H * (0.42 + rng() * 0.5);
      const cc0 = conifer ? h * 0.22 : h * 0.32;
      clumps.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, R: r, c0: cc0, Hc: h - cc0, lobe1: rng() * Math.PI * 2,
        lobe2: rng() * Math.PI * 2, az0: rng() * Math.PI * 2, n: 0 });
    }
  }
  // the deal: each clump's share by its shell (radius × height), the remainder to the heart
  {
    const w = clumps.map((c) => c.R * (c.c0 + c.Hc));
    const total = w.reduce((a, b) => a + b, 0);
    let dealt = 0;
    for (let i = 1; i < clumps.length; i++) { clumps[i].n = Math.round(count * w[i] / total); dealt += clumps[i].n; }
    clumps[0].n = count - dealt;
  }
  /** Whether a point sits inside a clump's envelope (a little in from its shell). */
  const inside = (q: Clump, x: number, y: number, z: number): boolean => {
    const rho = Math.hypot(x - q.x, z - q.z) / q.R;
    if (y <= q.c0) return rho < 0.86;
    const hy = (y - q.c0) / q.Hc;
    return hy < 1 && Math.pow(Math.pow(rho, pow) + Math.pow(hy, pow), 1 / pow) < 0.86;
  };
  const leaves: LeafSite[] = [];
  const up = v3(0, 1, 0);
  for (let ci = 0; ci < clumps.length; ci++) {
    const q = clumps[ci];
    for (let j = 0; j < q.n; j++) {
      const t = (j + 0.5) / q.n;                     // 0 the skirt .. 1 the top of this clump
      let P = v3(0, 0, 0), nOut = v3(0, 1, 0), cx = 1, cz = 0, elev = 0;
      for (let attempt = 0; attempt < 6; attempt++) {
        const az = q.az0 + j * golden + (rng() - 0.5) * (attempt ? 1.6 : 0.3);
        const lobe = (1 + 0.11 * Math.sin(3 * az + q.lobe1) + 0.07 * Math.sin(5 * az + q.lobe2)) * (0.92 + rng() * 0.16);
        cx = Math.cos(az); cz = Math.sin(az);
        // the envelope point at the spray's elevation from the clump's heart (c0 up its axis): a (super)ellipse over c0,
        // a wall under it down to the ground; its outward normal (the gradient)
        elev = Math.asin(Math.max(-1, Math.min(1, s0 + t * (s1 - s0) + (rng() - 0.5) * (attempt ? 0.3 : 0.05))));
        const ce = Math.cos(elev), se = Math.sin(elev), Rl = q.R * lobe;
        const reach = elev >= 0
          ? Math.pow(Math.pow(ce / Rl, pow) + Math.pow(se / q.Hc, pow), -1 / pow)
          : Math.min(Rl / Math.max(ce, 1e-3), q.c0 / Math.max(-se, 1e-3));
        P = v3(q.x + cx * ce * reach, q.c0 + se * reach, q.z + cz * ce * reach);
        const rho = Math.hypot(P.x - q.x, P.z - q.z) / Rl, hy = (P.y - q.c0) / q.Hc;
        nOut = elev >= 0
          ? norm(v3(cx * Math.pow(Math.max(rho, 1e-4), pow - 1) / Rl, Math.pow(Math.max(hy, 0), pow - 1) / q.Hc, cz * Math.pow(Math.max(rho, 1e-4), pow - 1) / Rl))
          : norm(v3(cx, 0.12, cz));
        let hidden = false;
        for (let k = 0; k < clumps.length && !hidden; k++) if (k !== ci && inside(clumps[k], P.x, P.y, P.z)) hidden = true;
        if (!hidden) break;
        if (attempt === 5) {
          // still buried after the deals: carry the seat out along its own heading until it clears every clump
          const hx = P.x, hz = P.z, hl = Math.hypot(hx, hz) || 1;
          for (let step = 1; step <= 12; step++) {
            const px = hx + (hx / hl) * R * 0.08 * step, pz = hz + (hz / hl) * R * 0.08 * step;
            let still = false;
            for (let k = 0; k < clumps.length && !still; k++) if (inside(clumps[k], px, P.y, pz)) still = true;
            if (!still || step === 12) { P = v3(px, P.y, pz); nOut = norm(v3(hx / hl, Math.max(0.1, nOut.y), hz / hl)); break; }
          }
        }
      }
      let tUp = v3(up.x - nOut.x * nOut.y, up.y - nOut.y * nOut.y, up.z - nOut.z * nOut.y);
      tUp = Math.hypot(tUp.x, tUp.y, tUp.z) < 0.2 ? v3(-cz, 0, cx) : norm(tUp);
      tUp = norm(rotate(tUp, nOut, (rng() - 0.5) * (conifer ? 2.2 : 1.5)));
      // the lift out of the shell: a broadleaf spray climbs, a conifer's reaches out near level and droops
      const beta = conifer ? 0.62 + rng() * 0.3 : 0.32 + rng() * 0.32;
      let axis = v3(tUp.x * Math.cos(beta) + nOut.x * Math.sin(beta), tUp.y * Math.cos(beta) + nOut.y * Math.sin(beta),
        tUp.z * Math.cos(beta) + nOut.z * Math.sin(beta));
      if (conifer) axis = v3(axis.x, axis.y * 0.45 - 0.12, axis.z);
      axis = norm(axis);
      const length = (under ? 0.55 : 0.72) * GROWTH_SHRUB_SPRAY_SCALE * (0.75 + rng() * 0.5) * (elev > 1.1 ? 0.86 : 1);
      const seat = v3(P.x - axis.x * length * 0.42 - nOut.x * 0.04, Math.max(-0.02, P.y - axis.y * length * 0.42 - nOut.y * 0.04),
        P.z - axis.z * length * 0.42 - nOut.z * 0.04);
      let face = v3(nOut.x - axis.x * dot(nOut, axis), nOut.y - axis.y * dot(nOut, axis), nOut.z - axis.z * dot(nOut, axis));
      face = Math.hypot(face.x, face.y, face.z) < 1e-3 ? norm(cross(cross(axis, up), axis)) : norm(face);
      face = norm(rotate(face, axis, (rng() - 0.5) * 0.7));
      const width = length * profile.aspect * widen * (0.9 + rng() * 0.2);
      const bend = profile.cardBend * (0.5 + rng() * 0.7);
      // the card stands on the ground, not in it: its lowest corner (the two-row card's stem and tip rows, the tip's
      // sag) at most a few centimetres under the base
      const rightY = norm(cross(axis, face)).y * width * 0.5;
      const low = Math.min(seat.y - 0.06 * length * axis.y - Math.abs(rightY) * 0.92,
        seat.y + 0.94 * length * axis.y - bend * length - Math.abs(rightY));
      if (low < -0.06) seat.y += -0.06 - low;
      // the light a spray sees: its height in the whole mound (a stool's top sits lower than the heart's) and its own
      // clump's skirt-to-top
      const shadeT = 0.5 * t + 0.5 * Math.max(0, Math.min(1, P.y / H));
      leaves.push({
        x: seat.x, y: seat.y, z: seat.z, ax: axis.x, ay: axis.y, az: axis.z, nx: face.x, ny: face.y, nz: face.z,
        length, width, shade: clamp01(0.3 + 0.62 * shadeT + (rng() - 0.5) * 0.16),
        flex: clamp01(0.2 + 0.1 * rng()), tile: (rng() * 4) | 0, bend, branch: -1,
      });
    }
  }
  return { species, height: H, branches: [], leaves, crown: { x: 0, y: c0 + Hc * 0.25, z: 0, r: R },
    stools: clumps.map((q) => ({ x: q.x, z: q.z, r: q.R, c0: q.c0, top: q.c0 + q.Hc })) };
}

/**
 * Trees round 5 (2026-10-05, the gauntlet's wave 98 on the near field bush: "a cluster of flat, stemless leaf cards with
 * no visible branch structure connecting them to the ground, so it reads as floating leaf confetti"): a shrub's stems —
 * a card for each stool (two for the heart) on the shrub atlas' stem tile (`tile`), standing on the ground and reaching
 * a third of the way up its clump, where the sprays clothe its forks. A stool's foot stands near the heart's (a stool
 * leans out of the one root plate), the heart's two a little apart. Each card turns about its own stem to face the
 * viewer as the sprays do (vegetation.ts COT_LEAF_BILLBOARD), so it reads as stems from every side; it barely sways.
 * Its seat is a few centimetres under the ground (the tile's foot fades there); deep in the shrub's shade. None for a
 * shrub without stools (the grass stage's fountain). Deterministic in `rng`.
 */
export function shrubStemSites(skeleton: TreeSkeleton, tile: number, rng: Rng): LeafSite[] {
  const out: LeafSite[] = [];
  (skeleton.stools ?? []).forEach((q, i) => {
    const heart = i === 0;
    for (let k = 0; k < (heart ? 2 : 1); k++) {
      const a = rng() * Math.PI * 2, rr = q.r * (heart ? 0.16 : 0.08) * (0.5 + 0.5 * rng());
      const bx = (heart ? q.x : q.x * 0.35) + Math.cos(a) * rr, bz = (heart ? q.z : q.z * 0.35) + Math.sin(a) * rr;
      const top = v3(q.x + (rng() - 0.5) * q.r * 0.3, q.c0 + (q.top - q.c0) * (0.3 + 0.15 * rng()), q.z + (rng() - 0.5) * q.r * 0.3);
      const seat = v3(bx, -0.05, bz);
      const span = v3(top.x - seat.x, top.y - seat.y, top.z - seat.z);
      const reach = Math.hypot(span.x, span.y, span.z), axis = norm(span), face = perpendicular(axis);
      // the card's top row stands at 0.94 of its length over its seat (emitLeafCards)
      const length = reach / 0.94;
      out.push({
        x: seat.x, y: seat.y, z: seat.z, ax: axis.x, ay: axis.y, az: axis.z, nx: face.x, ny: face.y, nz: face.z,
        length, width: length * 0.45, shade: 0.3, flex: 0.04, tile, bend: 0, branch: -1, stem: true,
      });
    }
  });
  return out;
}

/**
 * Trees round 5 (2026-10-05, Longleaf Crossing's cutover): a clump of grass-stage seedlings (a fountain profile) — each
 * seedling a burst of long needle sprays from one seat on the ground, steep at its heart and arching out and over at its
 * rim, as a bunchgrass stands; a field bush's clump three to five seedlings over its ground, the understorey's one or
 * two. The spray budget, the crown sample and the cover disc stay a shrub's.
 */
function growFountainShrub(species: GrowthSpecies, kind: 'bush' | 'understorey', rng: Rng): TreeSkeleton {
  const profile = TREE_GROWTH_PROFILES[species];
  const under = kind === 'understorey';
  const count = GROWTH_SHRUB_SPRAYS[kind];
  const R = under ? 0.6 : 0.85;
  const seedlings = under ? 1 + ((rng() * 2) | 0) : 3 + ((rng() * 3) | 0);
  const seats: Array<{ x: number; z: number; size: number }> = [];
  const a0 = rng() * Math.PI * 2;
  for (let i = 0; i < seedlings; i++) {
    const a = a0 + i * 2.399 + (rng() - 0.5) * 0.6, d = i === 0 ? 0 : R * (0.32 + rng() * 0.4);
    seats.push({ x: Math.cos(a) * d, z: Math.sin(a) * d, size: i === 0 ? 1 : 0.7 + rng() * 0.3 });
  }
  const leaves: LeafSite[] = [];
  let top = 0;
  for (let j = 0; j < count; j++) {
    const q = seats[j % seedlings];
    const az = rng() * Math.PI * 2;
    // the elevation: a fountain's heart stands steep, its rim leans out (26° to 80°)
    const elev = 0.45 + rng() * 0.95, ce = Math.cos(elev), se = Math.sin(elev);
    const axis = norm(v3(Math.cos(az) * ce, se, Math.sin(az) * ce));
    const length = (under ? 0.36 : 0.45) * q.size * (0.75 + rng() * 0.5);
    // the card's face square to its axis, turned out of the fan's plane by a little (the billboard turns it anyway)
    let face = norm(cross(norm(v3(-Math.sin(az), 0, Math.cos(az))), axis));
    face = norm(rotate(face, axis, (rng() - 0.5) * 1.2));
    const width = length * profile.aspect * (0.9 + rng() * 0.2);
    // the leaning needles arch over further than the upright heart's
    const bend = profile.cardBend * (0.6 + rng() * 0.8) * (1.3 - se * 0.6);
    const seat = v3(q.x, 0.03, q.z);
    // the card stands on the ground: its lowest corner (the stem row's half width, the tip's sag) at most a few
    // centimetres under the base
    const rightY = norm(cross(axis, face)).y * width * 0.5;
    const low = Math.min(seat.y - 0.06 * length * axis.y - Math.abs(rightY) * 0.92,
      seat.y + 0.94 * length * axis.y - bend * length - Math.abs(rightY));
    if (low < -0.05) seat.y += -0.05 - low;
    leaves.push({
      x: seat.x, y: seat.y, z: seat.z, ax: axis.x, ay: axis.y, az: axis.z, nx: face.x, ny: face.y, nz: face.z,
      length, width, shade: clamp01(0.4 + 0.5 * se + (rng() - 0.5) * 0.15), flex: clamp01(0.3 + 0.15 * rng()),
      tile: (rng() * 4) | 0, bend, branch: -1,
    });
    top = Math.max(top, seat.y + axis.y * length);
  }
  return { species, height: Math.max(0.3, top), branches: [], leaves, crown: { x: 0, y: top * 0.4, z: 0, r: R } };
}

/** Trees round 8: a stem's girth by its age class (the variant: young, typical, old), at the profile's trunk radius. */
export const GROWTH_AGE_GIRTH: readonly [number, number, number] = Object.freeze([0.86, 1, 1.16]) as unknown as readonly [number, number, number];
/**
 * Grow one tree of a species: the skeleton every emitter below reads. `rng` drives every choice; the variant (0,
 * 1, 2) sets the age class — a younger, narrower tree, the typical one, an older broader one.
 */
export function growTreeSkeleton(species: GrowthSpecies, rng: Rng, options: GrowthOptions = {}): TreeSkeleton {
  const variant = ((options.variant ?? 1) % 3 + 3) % 3;
  // (trees lane: a profile with variant shapes grows each variant's own, at the variant's age as before: the Streuobst
  // form's plum young and small, its apple in its middle years, its pear old and tall)
  const base = TREE_GROWTH_PROFILES[species], shaped = variantProfile(base, variant);
  const profile = options.forest ? forestGrownProfile(shaped) : shaped;
  const mobile = options.tier === 'mobile';
  const ageH = variant === 0 ? 0.88 : variant === 2 ? 1.1 : 1;
  const ageW = variant === 0 ? 0.84 : variant === 2 ? 1.12 : 1;
  // trees round 8 (2026-10-07, the gauntlet's wave 238: "trunks darker, with variety in girth"): the age's girth — a
  // young tree's stem slimmer, an old one's stouter (GROWTH_AGE_GIRTH)
  const ageG = GROWTH_AGE_GIRTH[variant];
  const height = profile.height * ageH * (1 + (rng() - 0.5) * 2 * profile.heightSpread * 0.5);
  // trees round 4 (the gauntlet's waves 49 and 51 on Verdant's treeline: "one tree asset repeated at even spacing, with a
  // hard dark band at the canopy base"): a broadleaf's or a birch's crown base moves with its age — a young leader's
  // crown comes further down its stem, an old tree's stands higher (a fork never drops: the stem's collision band keeps
  // no limb) — so a wood's crown bases stand at three heights instead of one
  const leafy = profile.family === 'broadleaf' || profile.family === 'birch';
  const baseShift = !leafy ? 1 : variant === 2 ? GROWTH_CROWN_BASE_AGE[1] : variant === 0 && profile.form === 'excurrent' ? GROWTH_CROWN_BASE_AGE[0] : 1;
  const ctx: GrowContext = {
    profile, rng, height, branches: [], mobile,
    crownBaseY: height * (profile.form === 'decurrent' ? range(rng, profile.forkAt) : profile.crownBase) * baseShift,
    crownTopY: height,
    crownR: profile.crownR * ageW * (0.94 + rng() * 0.12),
  };
  const leaves: LeafSite[] = [];
  if (profile.family === 'palm') {
    growPalm(ctx, leaves, variant);
  } else if (profile.family === 'dead') {
    growSnag(ctx);
    seatLeaves(ctx, leaves);
  } else if (profile.form === 'decurrent') {
    const forkY = ctx.crownBaseY;
    const stem = growStem(ctx, forkY, profile.trunkR * ageG, profile.trunkR * 0.78 * ageG, 4);
    growScaffolds(ctx, stem, variant);
    seatLeaves(ctx, leaves);
  } else {
    const stem = growStem(ctx, height, profile.trunkR * ageG, profile.family === 'conifer' ? 0.018 : 0.03,
      Math.max(5, Math.round(height / 0.85)));
    growPrimaries(ctx, stem, variant);
    seatLeaves(ctx, leaves);
  }
  // the budgets: a grown crown keeps its silhouette at a bounded card and tube count — surplus sprays are thinned
  // evenly along the seat order (each survivor grows by the area it inherits) and the thinnest side shoots stop being
  // tubes (their sprays still seat on them)
  const leafBudget = Math.round(GROWTH_LEAF_BUDGET[mobile ? 'mobile' : 'desktop'] * (profile.family === 'conifer' ? GROWTH_CONIFER_LEAF_SHARE : 1));
  if (leaves.length > leafBudget) {
    // Trees round 2 (2026-10-03): the survivors cover the crown evenly (thinEvenly) — a dense whorl or a crowded limb
    // gives up sprays, a sparse apex or an outer twig keeps them — and grow only a little by the area they inherit
    const kept = thinEvenly(leaves, leafBudget, leaves.map((l) => 0.4 + 0.6 * clamp01(envelopeAt(ctx, l.y) / Math.max(0.3, ctx.crownR))));
    const grow = Math.min(GROWTH_THIN_GROWTH_MAX, Math.pow(leaves.length / leafBudget, 0.25));
    for (const l of kept) {
      const fall = Math.max(0, -l.ay) + l.bend;
      const g = fall > 1e-3 ? Math.min(grow, Math.max(1, (l.y - GROWTH_SPRAY_CLEARANCE_M) / (fall * l.length))) : grow;
      l.length *= g; l.width *= g;
    }
    leaves.length = 0;
    leaves.push(...kept);
  }
  const woodBudget = GROWTH_SIDE_TUBE_BUDGET[mobile ? 'mobile' : 'desktop'];
  const sides = ctx.branches.filter((b) => b.mesh && b.order >= 2).sort((a, b) => b.nodes[0].r - a.nodes[0].r);
  for (let i = woodBudget; i < sides.length; i++) sides[i].mesh = false;
  // a limb kept out of the stem's collision band is not drawn, so no spray may hang from it: a spray it carried near
  // the stem grows from the stem itself (moved onto it at the same height — the short twigs a conifer's lower stem
  // carries), one farther out is cut, and the sprays of the lowest drawn level hang a little further to keep the skirt
  const hidden = supportSprays(ctx, leaves);
  const stemNodes = ctx.branches[0].nodes;
  const carried: LeafSite[] = [];
  for (const l of leaves) {
    if (!hidden[l.branch]) { carried.push(l); continue; }
    let best: V3 | null = null, bestD = Infinity;
    for (let i = 1; i < stemNodes.length; i++) {
      const a = stemNodes[i - 1], b = stemNodes[i];
      const { q } = onSegment(v3(l.x, l.y, l.z), v3(a.x, a.y, a.z), v3(b.x, b.y, b.z));
      const d = Math.hypot(q.x - l.x, q.y - l.y, q.z - l.z);
      if (d < bestD) { bestD = d; best = q; }
    }
    if (!best || bestD > GROWTH_RESEAT_M) continue;
    l.x = best.x; l.y = best.y; l.z = best.z; l.branch = 0;
    carried.push(l);
  }
  if (carried.length < leaves.length) {
    const lowest = Math.min(...carried.map((l) => l.y));
    for (const l of carried) {
      if (l.y > lowest + GROWTH_SKIRT_BAND_M) continue;
      const fall = Math.max(0, -l.ay) + l.bend;
      const g = fall > 1e-3 ? Math.min(GROWTH_SKIRT_REACH, Math.max(1, (l.y - GROWTH_SPRAY_CLEARANCE_M) / (fall * l.length))) : GROWTH_SKIRT_REACH;
      l.length *= g; l.width *= 1 + (g - 1) * 0.5;
    }
    leaves.length = 0;
    leaves.push(...carried);
  }
  // the crown's centre and radius from the foliage (the wood's for a snag)
  let cx = 0, cy = 0, cz = 0, n = 0;
  if (leaves.length) {
    for (const l of leaves) { cx += l.x; cy += l.y; cz += l.z; n++; }
  } else {
    for (const b of ctx.branches) for (const node of b.nodes) { cx += node.x; cy += node.y; cz += node.z; n++; }
  }
  cx /= n; cy /= n; cz /= n;
  let r = 0;
  if (leaves.length) for (const l of leaves) r = Math.max(r, Math.hypot(l.x - cx, (l.y - cy) * 0.8, l.z - cz) + l.length * 0.5);
  else r = ctx.crownR;
  // (trees lane: a profile's variant tiles — each Streuobst variant's sprays on its own species' tiles, from the tile each
  // spray drew, so no draw moves)
  const variantTiles = base.variantTiles?.[variant];
  if (variantTiles) for (const l of leaves) l.tile = variantTiles[l.tile % variantTiles.length];
  const skeleton: TreeSkeleton = { species, height, branches: ctx.branches, leaves, crown: { x: cx, y: cy, z: cz, r: Math.max(0.8, r) } };
  // the living crowns' masses (a palm's head is fronds round one point, a snag's few dead twigs shade nothing)
  if (leaves.length >= 8 && profile.family !== 'palm' && profile.family !== 'dead') skeleton.lobes = crownLobes(skeleton, crownLobeCount(profile, leaves.length));
  if (skeleton.lobes && profile.habit === 'tuft') skeleton.tufts = tuftLobes(skeleton);
  return skeleton;
}

/** Trees round 4: the sprays a tufted pine's tuft gathers (tuftLobes' k: about this many sprays a tuft). */
const GROWTH_TUFT_SPRAYS = 4;

/**
 * Trees round 4 (2026-10-04, the gauntlet's wave 39: Caldera's midground Canary pines "still round broadleaf crowns";
 * the lab's portraits: the crown's few lobes shade each pine as four to ten lit round masses): a tufted pine's tufts as
 * masses of their own — k-means over its spray centres at about GROWTH_TUFT_SPRAYS sprays a tuft (crownLobes' fit, a
 * tighter margin: a tuft is a fist of needles, not a limb's worth of crown).
 */
export function tuftLobes(skeleton: Pick<TreeSkeleton, 'leaves'>): CrownLobe[] {
  const count = Math.max(2, Math.round(skeleton.leaves.length / GROWTH_TUFT_SPRAYS));
  return crownLobes(skeleton, count, 0.12, 0.2);
}

/** Trees round 2: how many masses a crown is read as — a broadleaf dome's lobes, a conifer's tiers. */
function crownLobeCount(profile: Readonly<GrowthProfile>, sprays: number): number {
  // (trees round 5: a shelved crown's level plates spread wide and thin — the most masses a crown takes; the trees lane,
  // 2026-10-06: and a clump's fountain, its sprays strung along a dozen arching culms)
  if (profile.envelope === 'shelf' || profile.clump) return 10;
  if (profile.family === 'conifer') return Math.max(4, Math.min(10, Math.round(sprays / 20)));
  if (profile.family === 'dead') return Math.max(2, Math.min(4, Math.round(sprays / 8)));
  return Math.max(4, Math.min(9, Math.round(sprays / 26)));
}

/** The centre of a spray's card (its seat, along its axis by a little under half its length). */
function sprayCentre(l: LeafSite): V3 {
  return v3(l.x + l.ax * l.length * 0.45, l.y + l.ay * l.length * 0.45, l.z + l.az * l.length * 0.45);
}

/**
 * Trees round 2 (2026-10-03): thin `leaves` to `budget` survivors spread evenly over the crown — farthest-point sampling
 * from the first seat: each step keeps the spray whose card centre lies farthest from every kept one, distances divided
 * by the spray's `scale` (where the crown's envelope narrows — an apex, a dome's rim — the sprays count as farther apart
 * and stay). The survivors keep their seat order. Deterministic; O(budget × sprays).
 */
function thinEvenly(leaves: LeafSite[], budget: number, scale: readonly number[] | null = null): LeafSite[] {
  const n = leaves.length;
  if (n <= budget) return leaves.slice();
  const cx = new Float64Array(n), cy = new Float64Array(n), cz = new Float64Array(n), w = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const c = sprayCentre(leaves[i]);
    cx[i] = c.x; cy[i] = c.y; cz[i] = c.z;
    const s = scale ? Math.max(0.05, scale[i]) : 1;
    w[i] = 1 / (s * s);
  }
  const nearest = new Float64Array(n).fill(Infinity), kept = new Uint8Array(n);
  let next = 0;
  for (let k = 0; k < budget && next >= 0; k++) {
    kept[next] = 1;
    const x = cx[next], y = cy[next], z = cz[next];
    let best = -1, bestD = -1;
    for (let i = 0; i < n; i++) {
      if (kept[i]) continue;
      const d = ((cx[i] - x) ** 2 + (cy[i] - y) ** 2 + (cz[i] - z) ** 2) * w[i];
      if (d < nearest[i]) nearest[i] = d;
      if (nearest[i] > bestD) { bestD = nearest[i]; best = i; }
    }
    next = best;
  }
  return leaves.filter((_, i) => kept[i] === 1);
}

/**
 * Trees round 2 (2026-10-03): the crown's masses — k-means over the spray card centres (seeded by the farthest-point
 * spread, four refinements), each mass an axis-aligned ellipsoid reaching a little past its members' card centres.
 */
export function crownLobes(skeleton: Pick<TreeSkeleton, 'leaves'> & { species?: GrowthSpecies }, count: number,
  // trees round 5: a shelved crown's masses reach further past their members — its level plates are wide and thin, an
  // ellipsoid through its members' box leaves the plates' corners out (a clump's culm-long strings of sprays likewise)
  margin = skeleton.species && (TREE_GROWTH_PROFILES[skeleton.species]?.envelope === 'shelf' || TREE_GROWTH_PROFILES[skeleton.species]?.clump)
    ? 0.6 : 0.3, least = 0.45): CrownLobe[] {
  const sites = skeleton.leaves.map(sprayCentre);
  if (!sites.length) return [];
  const k = Math.max(1, Math.min(count, sites.length));
  const centres: V3[] = [sites[0]];
  while (centres.length < k) {
    let best = sites[0], bestD = -1;
    for (const s of sites) {
      let d = Infinity;
      for (const c of centres) d = Math.min(d, (s.x - c.x) ** 2 + (s.y - c.y) ** 2 + (s.z - c.z) ** 2);
      if (d > bestD) { bestD = d; best = s; }
    }
    centres.push(best);
  }
  let assign = new Array<number>(sites.length).fill(0);
  for (let iter = 0; iter < 4; iter++) {
    assign = sites.map((s) => {
      let bi = 0, bd = Infinity;
      for (let i = 0; i < centres.length; i++) {
        const c = centres[i], d = (s.x - c.x) ** 2 + (s.y - c.y) ** 2 + (s.z - c.z) ** 2;
        if (d < bd) { bd = d; bi = i; }
      }
      return bi;
    });
    for (let i = 0; i < centres.length; i++) {
      let x = 0, y = 0, z = 0, n = 0;
      for (let j = 0; j < sites.length; j++) if (assign[j] === i) { x += sites[j].x; y += sites[j].y; z += sites[j].z; n++; }
      if (n) centres[i] = v3(x / n, y / n, z / n);
    }
  }
  const lobes: CrownLobe[] = [];
  for (let i = 0; i < centres.length; i++) {
    let ex = 0, ey = 0, ez = 0, n = 0;
    for (let j = 0; j < sites.length; j++) {
      if (assign[j] !== i) continue;
      n++;
      ex = Math.max(ex, Math.abs(sites[j].x - centres[i].x));
      ey = Math.max(ey, Math.abs(sites[j].y - centres[i].y));
      ez = Math.max(ez, Math.abs(sites[j].z - centres[i].z));
    }
    if (!n) continue;
    lobes.push({ x: centres[i].x, y: centres[i].y, z: centres[i].z, rx: Math.max(least, ex + margin),
      ry: Math.max(least - 0.05, ey + margin - 0.05), rz: Math.max(least, ez + margin) });
  }
  return lobes;
}

/**
 * Trees round 2: the crown hull's outward normal at a point (the lobes' union; the crown's own ellipsoid where the
 * skeleton has no lobes or the point sits at a lobe's heart) — the snow load's sky-facing test (vegetation.ts).
 */
export function crownSurfaceNormal(skeleton: Pick<TreeSkeleton, 'lobes' | 'crown'>, x: number, y: number, z: number): [number, number, number] {
  const out = [0, 0, 0, 0];
  if (skeleton.lobes && skeleton.lobes.length) {
    lobeField(skeleton.lobes, x, y, z, out);
    if (Math.hypot(out[0], out[1], out[2]) > 0.5) return [out[0], out[1], out[2]];
  }
  const sx = x - skeleton.crown.x, sy = (y - skeleton.crown.y) * 0.75, sz = z - skeleton.crown.z, l = Math.hypot(sx, sy, sz) || 1;
  return [sx / l, sy / l, sz / l];
}

/**
 * Trees round 2: the lobes' smooth union at a point — the outward normal of the union (the gradient of Σ e^{−|q|²}, q
 * the point in each lobe's own unit frame) and the field itself (about e^{−1} on a lone lobe's surface, toward one at
 * its centre, more where lobes overlap). `out` receives [nx, ny, nz, field]; the normal is (0, 0, 0) at a centre.
 */
function lobeField(lobes: readonly CrownLobe[], x: number, y: number, z: number, out: number[]): number[] {
  let nx = 0, ny = 0, nz = 0, f = 0;
  for (const l of lobes) {
    const qx = (x - l.x) / l.rx, qy = (y - l.y) / l.ry, qz = (z - l.z) / l.rz;
    const w = Math.exp(-(qx * qx + qy * qy + qz * qz));
    f += w;
    nx += w * qx / l.rx; ny += w * qy / l.ry; nz += w * qz / l.rz;
  }
  const nl = Math.hypot(nx, ny, nz);
  out[0] = nl > 1e-9 ? nx / nl : 0; out[1] = nl > 1e-9 ? ny / nl : 0; out[2] = nl > 1e-9 ? nz / nl : 0; out[3] = f;
  return out;
}

// ------------------------------------------------------------------------------------------------ emitters

/** The lowest a spray card's tip may reach over the ground (m). */
export const GROWTH_SPRAY_CLEARANCE_M = 0.15;
/** The lowest drawn level's sprays (within this height of the lowest seat) hang up to GROWTH_SKIRT_REACH × longer, keeping the
 * skirt the cut sprays of the undrawn limbs leave open. */
const GROWTH_SKIRT_BAND_M = 0.7;
const GROWTH_SKIRT_REACH = 1.35;
/** A spray of an undrawn collision-band limb within this distance of the stem moves onto the stem; farther ones are cut. */
const GROWTH_RESEAT_M = 0.6;
/** Below this height a primary limb carries its sprays but is not emitted as wood (it is hidden in them, and the
 * lower stem's girth stays the stem's for the collision fit). */
export const GROWTH_LOWEST_WOOD_M = 1.7;
/**
 * Trees round 4: a broadleaf's or a birch's crown base by its age (growTreeSkeleton): the young variant's (an excurrent
 * leader's only) and the old variant's, over the profile's.
 */
const GROWTH_CROWN_BASE_AGE = Object.freeze([0.84, 1.14] as const);
/**
 * Trees round 4: a birch's dark foot (emitBranchGeometry, bark style 3): the stem's rings darken by up to `depth` at the
 * ground, the black fading out between `fromM` and `toM` (m up the stem), each face round it streaked to its own depth.
 */
export const GROWTH_BIRCH_FOOT = Object.freeze({ depth: 0.72, fromM: 0.2, toM: 2.2 });
/**
 * Spray cards per near tree. Trees round 2 (2026-10-03): 230 smaller leaf clusters on two-row cards (460 card triangles
 * from 920 vertices) where a broadleaf drew 150 sprays on three-row cards (600 from 900) — the same vertex work (each
 * card vertex runs the wind, the billboard, the fade and the four-cascade sample) spread over half again as many,
 * smaller clusters.
 */
export const GROWTH_LEAF_BUDGET: Readonly<Record<'desktop' | 'mobile', number>> = Object.freeze({ desktop: 230, mobile: 88 });
/**
 * A conifer's share of the leaf budget. 1.1 of 150 (165) since 2026-10-02: Frosthollow's chase view cost +4.1 ms GPU on
 * desktop high against the same build's legacy trees, whose conifers draw 100 card triangles from 300 vertices to the
 * grown crowns' 692 from 1038. Trees round 2: 0.72 of the larger budget keeps the conifers at 166 two-row cards.
 */
export const GROWTH_CONIFER_LEAF_SHARE = 0.72;
/** Trees round 2: how much a thinned crown's survivors may grow by the area they inherit (the cards stay clusters). */
const GROWTH_THIN_GROWTH_MAX = 1.15;

/**
 * The card rows a grown crown's sprays take (emitLeafCards): two (a near-square quad, 2 triangles from 4 vertices) for
 * the conifers' and the birches' many small sprays, three (the bent, tapered card, 4 triangles from 6) for the
 * broadleaves' and the palms' larger ones, whose bend reads. Same budget reasoning as GROWTH_CONIFER_LEAF_SHARE.
 */
export function growthCardRows(family: GrowthProfile['family']): 2 | 3 {
  // trees round 2: the broadleaves' smaller clusters take the two-row card too (their bend reads at no range); the palm's
  // long fronds keep the bent three-row card
  return family === 'palm' ? 3 : 2;
}
/** A grown crown's two-row card narrows toward its stem (the tile's spray does): the three-row card's area, not more. */
export const GROWTH_CROWN_STEM_WIDTH = 0.7;
/** Side shoots (order >= 2) emitted as tubes, thickest first. */
export const GROWTH_SIDE_TUBE_BUDGET: Readonly<Record<'desktop' | 'mobile', number>> = Object.freeze({ desktop: 14, mobile: 6 });

/**
 * The share of the sky the crown takes from the wood that its tint keeps out: the near trunks receive no cascade
 * shadow (their stability rule), so a grown trunk under its own crown would read as lit in the open — the canopy's
 * sky occlusion (canopySkyOcclusion) is baked into the wood's tint at this weight.
 */
export const GROWTH_CANOPY_AO = 0.5;

/**
 * The sky the sprays above a point hide from it: each spray's opaque area (a third of its card) over its squared
 * distance, cosine-weighted toward the zenith, summed and saturated (1 − e^−Σ, overlapping sprays shade as a layer).
 * 0 in the open (a snag), toward 1 under a dense crown.
 */
export function canopySkyOcclusion(skeleton: TreeSkeleton, x: number, y: number, z: number): number {
  let sum = 0;
  for (const l of skeleton.leaves) {
    const dy = l.y - y;
    if (dy <= 0.1) continue;
    const dx = l.x - x, dz = l.z - z, d2 = dx * dx + dy * dy + dz * dz;
    sum += (l.length * l.width * 0.35) * (dy / Math.sqrt(d2)) / (Math.PI * d2);
  }
  return 1 - Math.exp(-sum);
}

/** The tube sides per branch order: the stem round enough for the trunk-quality receipt, twigs triangular. */
export const GROWTH_TUBE_SIDES: Readonly<Record<'desktop' | 'mobile', readonly number[]>> = Object.freeze({
  desktop: Object.freeze([10, 6, 4, 3]),
  mobile: Object.freeze([9, 5, 3, 3]),
});

interface BranchEmitOptions {
  tier?: 'desktop' | 'mobile';
  /** Bark tint (linear multipliers) for the lower stem and, when given, the upper stem/limbs. */
  tint: readonly [number, number, number];
  topTint?: readonly [number, number, number] | null;
  /** Bark style column (0..3) the UVs select (vegetation.ts packs it into the bark atlas). */
  barkStyle: number;
  /** The highest order emitted as a tube (finer orders live in the spray tiles). */
  maxOrder?: number;
  rng: Rng;
}

/**
 * The wood as one flat (non-indexed) geometry: every emitted branch a tube whose rings follow the polyline with a
 * parallel-transported frame (no twist), tapered by the nodes' radii, its base sunk into its parent so no joint
 * shows a gap. Attributes: position, normal, uv (u = 2 + 2 × the bark style + the fraction round the stem — the bark
 * atlas maps it, vegetation.ts prepareTreeBarkSurface — v along the length in bark repeats), color (bark tint × a darkening toward the ground and the
 * crown's interior), aFlex.
 */
export function emitBranchGeometry(skeleton: TreeSkeleton, options: BranchEmitOptions): THREE.BufferGeometry {
  const sides = GROWTH_TUBE_SIDES[options.tier === 'mobile' ? 'mobile' : 'desktop'];
  const maxOrder = options.maxOrder ?? 2;
  const pos: number[] = [], nrm: number[] = [], uv: number[] = [], col: number[] = [], flex: number[] = [];
  const top = options.topTint ?? options.tint;
  const { rng } = options;
  const birch = options.barkStyle === 3;
  const branchRanges: Array<readonly [number, number] | undefined> = [];
  for (let branchIndex = 0; branchIndex < skeleton.branches.length; branchIndex++) {
    const branch = skeleton.branches[branchIndex];
    if (!branch.mesh || (branch.order > maxOrder && !branch.support)) continue;
    const firstVertex = pos.length / 3;
    // the stem keeps its round section; limbs take sides by their girth (a thick scaffold six, a twig three)
    const r0 = branch.nodes[0].r;
    const s = branch.order === 0 ? sides[0] : r0 > 0.12 ? sides[1] : r0 > 0.05 ? sides[2] : sides[3];
    const nodes = branch.nodes.slice();
    // sink the base into the parent: back along the first segment by its own radius (never below the ground)
    if (branch.parent >= 0 && nodes.length > 1) {
      const a = nodes[0], b = nodes[1];
      const d = norm(v3(b.x - a.x, b.y - a.y, b.z - a.z));
      const back = a.r * 1.4;
      nodes[0] = { ...a, x: a.x - d.x * back, y: Math.max(0.2, a.y - d.y * back), z: a.z - d.z * back };
    }
    // ring frames by parallel transport
    const frames: Array<{ t: V3; n: V3; b: V3 }> = [];
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[Math.max(0, i - 1)], b = nodes[Math.min(nodes.length - 1, i + 1)];
      const t = norm(v3(b.x - a.x, b.y - a.y, b.z - a.z));
      let n: V3;
      if (i === 0) n = perpendicular(t);
      else {
        const prev = frames[i - 1];
        n = norm(v3(prev.n.x - t.x * dot(prev.n, t), prev.n.y - t.y * dot(prev.n, t), prev.n.z - t.z * dot(prev.n, t)));
      }
      frames.push({ t, n, b: norm(cross(t, n)) });
    }
    const branchTint = 0.9 + rng() * 0.16;
    // trees round 5: dead wood weathers silver-grey, whatever the bark (the profile's deadwood)
    const deadTint = branch.dead ? GROWTH_DEADWOOD_TINT : null;
    const circumference = Math.max(0.22, 2 * Math.PI * nodes[0].r);
    let along = rng() * 3;
    const ring: Array<Array<[number, number, number, number, number, number, number]>> = [];
    for (let i = 0; i < nodes.length; i++) {
      if (i > 0) along += Math.hypot(nodes[i].x - nodes[i - 1].x, nodes[i].y - nodes[i - 1].y, nodes[i].z - nodes[i - 1].z) / circumference;
      const node = nodes[i], f = frames[i];
      // the bark darkens toward the ground (soil, damp) and inside the crown (shade)
      const ground = 0.78 + 0.22 * clamp01(node.y / 1.4);
      const heightT = clamp01(node.y / Math.max(1, skeleton.height));
      const topMix = branch.order > 0 ? 0.65 : clamp01((heightT - 0.45) / 0.4);
      const tr = deadTint ? deadTint[0] : lerp(options.tint[0], top[0], topMix), tg = deadTint ? deadTint[1] : lerp(options.tint[1], top[1], topMix);
      const tb = deadTint ? deadTint[2] : lerp(options.tint[2], top[2], topMix);
      // the wood inside the crown stands in the leaves' shade (the near trunks receive no cascade shadow — their
      // stability rule — so the canopy's occlusion is baked: the deeper in the crown, the darker the limb)
      const cdx = node.x - skeleton.crown.x, cdy = (node.y - skeleton.crown.y) * 1.2, cdz = node.z - skeleton.crown.z;
      const inner = skeleton.leaves.length ? clamp01(1 - Math.hypot(cdx, cdy, cdz) / skeleton.crown.r) : 0;
      // and under it: the sky the sprays above take (the stem below a broad crown, the limbs within it)
      const canopy = 1 - GROWTH_CANOPY_AO * canopySkyOcclusion(skeleton, node.x, node.y, node.z);
      const shade = ground * branchTint * (branch.order >= 2 ? 0.92 : 1)
        * Math.min(1 - 0.5 * inner * inner * (3 - 2 * inner), canopy);
      // trees round 4 (the gauntlet's wave 51: the white birch trunks "cardboard-like"): a birch's stem is rough and dark
      // at its foot — black fissured bark up to a metre or two, breaking into the white (birchFoot, streaked round the
      // stem below); the papery white above
      const foot = birch && branch.order === 0 ? GROWTH_BIRCH_FOOT.depth * (1 - smooth01((node.y - GROWTH_BIRCH_FOOT.fromM) / (GROWTH_BIRCH_FOOT.toM - GROWTH_BIRCH_FOOT.fromM))) : 0;
      const row: Array<[number, number, number, number, number, number, number]> = [];
      for (let j = 0; j <= s; j++) {
        const phi = (j / s) * Math.PI * 2;
        const c = Math.cos(phi), sn = Math.sin(phi);
        const dx = f.n.x * c + f.b.x * sn, dy = f.n.y * c + f.b.y * sn, dz = f.n.z * c + f.b.z * sn;
        // a broken tip ends in a ragged stub: its last ring jitters inward
        const rr = node.r * (branch.broken && i === nodes.length - 1 ? 0.55 + 0.45 * ((j * 7919) % 13) / 13 : 1);
        row.push([node.x + dx * rr, node.y + dy * rr, node.z + dz * rr, dx, dy, dz, j / s]);
      }
      ring.push(row);
      (row as unknown as { meta: number[] }).meta = [along, tr * shade, tg * shade, tb * shade, node.flex, foot];
    }
    for (let i = 0; i < ring.length - 1; i++) {
      const A = ring[i], B = ring[i + 1];
      const ma = (A as unknown as { meta: number[] }).meta, mb = (B as unknown as { meta: number[] }).meta;
      for (let j = 0; j < s; j++) {
        const quad = [[A[j], ma], [A[j + 1], ma], [B[j + 1], mb], [A[j], ma], [B[j + 1], mb], [B[j], mb]] as const;
        for (const [v, m] of quad) {
          pos.push(v[0], v[1], v[2]);
          nrm.push(v[3], v[4], v[5]);
          // u ≥ 2 marks a styled bark face (vegetation.ts prepareTreeBarkSurface: 2 + 2 × style + the fraction round
          // the stem); the legacy builders' [0, 1] and the snow's -1 keep their meaning
          uv.push(2 + options.barkStyle * 2 + v[6] * 0.999, m[0]);
          // the foot's fissures: each face round the stem its own depth of black (a fixed hash of the side, so the streaks
          // run down the stem continuously)
          const dark = m[5] > 0 ? 1 - m[5] * (0.55 + 0.45 * ((((Math.round(v[6] * s) % s) * 2654435761) >>> 0) % 997) / 996) : 1;
          col.push(m[1] * dark, m[2] * dark, m[3] * dark);
          flex.push(m[4]);
        }
      }
    }
    // a broken stub gets a flat jagged cap (the snag's splintered top)
    if (branch.broken) {
      const last = ring[ring.length - 1], m = (last as unknown as { meta: number[] }).meta;
      const node = nodes[nodes.length - 1], f = frames[frames.length - 1];
      for (let j = 0; j < s; j++) {
        const spike = 0.12 + ((j * 104729) % 17) / 17 * 0.35 * node.r * 4;
        const tip = [node.x + f.t.x * spike, node.y + f.t.y * spike, node.z + f.t.z * spike];
        for (const v of [last[j], last[j + 1], tip]) {
          pos.push(v[0], v[1], v[2]);
          nrm.push(f.t.x, f.t.y, f.t.z);
          uv.push(2 + options.barkStyle * 2 + 0.5, m[0]);
          col.push(m[1] * 0.7, m[2] * 0.66, m[3] * 0.6);
          flex.push(m[4]);
        }
      }
    }
    branchRanges[branchIndex] = [firstVertex, pos.length / 3];
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nrm), 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
  geometry.setAttribute('aFlex', new THREE.BufferAttribute(new Float32Array(flex), 1));
  // each emitted branch's flat vertex range (growthCrownAttachments finds a spray's bark among its own branch's faces)
  geometry.userData.branchRanges = branchRanges;
  return geometry;
}

/** One crown support record (treeAttachments.ts's form): the bark point a spray grows from. */
interface GrowthCrownAttachment { root: number[]; tip: number[]; gap: number }

/**
 * The crown supports of a grown tree (treeAttachments.ts's contract — no foliage without wood under it): every spray
 * is seated on its branch, its card starting inside the wood at the seat, so its support is the bark point over the
 * seat — the nearest point on its own branch's faces (or on its nearest emitted ancestor's, where the finest twigs
 * live only in the spray tile). `wood` is the flat wood emitBranchGeometry returned (its branchRanges), or a flat
 * merge that keeps it first. Root and tip are that bark point; the gap is the seat's depth under the bark.
 */
export function growthCrownAttachments(skeleton: TreeSkeleton, wood: THREE.BufferGeometry,
  branchRanges: ReadonlyArray<readonly [number, number] | undefined>): GrowthCrownAttachment[] {
  const p = wood.getAttribute('position');
  const triangle = new THREE.Triangle(), seat = new THREE.Vector3(), candidate = new THREE.Vector3(), best = new THREE.Vector3();
  const out: GrowthCrownAttachment[] = [];
  for (const site of skeleton.leaves) {
    let b = site.branch;
    while (b > 0 && !branchRanges[b]) b = skeleton.branches[b].parent;
    const range = branchRanges[b] ?? branchRanges[0];
    if (!range) continue;
    seat.set(site.x, site.y, site.z);
    let bestD = Infinity;
    for (let i = range[0]; i + 2 < range[1]; i += 3) {
      triangle.a.fromBufferAttribute(p, i); triangle.b.fromBufferAttribute(p, i + 1); triangle.c.fromBufferAttribute(p, i + 2);
      triangle.closestPointToPoint(seat, candidate);
      const d = candidate.distanceToSquared(seat);
      if (d < bestD) { bestD = d; best.copy(candidate); }
    }
    if (!(bestD < Infinity)) continue;
    out.push({ root: best.toArray(), tip: best.toArray(), gap: Math.sqrt(bestD) });
  }
  return out;
}

interface CardEmitOptions {
  /** The card tint: hue/sat around the species palette (HSL, sRGB), and the lightness the shade law starts from. */
  tint(shade: number, site: LeafSite, rng: Rng): readonly [number, number, number];
  /** Atlas tiles per side (2 = a 2×2 atlas). */
  tiles: number;
  rng: Rng;
  /** Volume normal share (0 = the card's own face, 1 = the crown sphere) and the up bias. */
  volume?: number;
  upBias?: number;
  /**
   * Rows along the card: 3 (stem, middle, tip — the crowns' bent, tapered card, 4 triangles) or 2 (one near-square
   * quad, 2 triangles — the shrubs' card, where a spray's bend reads at no distance and the triangles are the budget).
   */
  rows?: 2 | 3;
  /** A two-row card's stem-row width (a fraction of the tip row's): 0.92 keeps the tile undistorted (the shrubs). */
  stemWidth?: number;
  /**
   * Trees round 2: the share of the normal the lobes' union takes (the crown hull's masses, skeleton.lobes) and the
   * darkening by depth in the crown (0 = none, 1 = black at the heart). Defaults GROWTH_CROWN_SHADING when the skeleton
   * carries lobes, none otherwise (the shrubs).
   */
  lobeShare?: number;
  depthShade?: number;
  /**
   * Trees round 8 (2026-10-08, the gauntlet's wave 275 on the leafy bushes: "dark, evenly lit masses of repeated leaf
   * cards, with no sunlit mass"): the centre the volume normal turns about and the vertical scale of its offset (the
   * crown's centre and 0.75 by default). A shrub is a mound on the ground: its volume normal turns about the ground
   * under its centre, scaled to a hemisphere, so its top faces the sky, its sides the sun or away from it, and no
   * card of its lower half faces the ground.
   */
  volumeCentre?: { readonly x: number; readonly y: number; readonly z: number };
  volumeYScale?: number;
}

/**
 * Trees round 2 (2026-10-03): how a grown crown shades as a mass — the normal is half the lobes' union (each lobe a lit
 * mass with its own terminator), a quarter the whole crown's ellipsoid and a quarter the card's own face (the clusters
 * still catch the light their own way), lifted toward the sky; and a card vertex darkens by its depth in its lobe
 * (lobeField's field: under a lone lobe's surface value nothing, toward its heart up to `depthShade`) and on the crown's
 * underside, which sees the ground instead of the sky.
 */
export const GROWTH_CROWN_SHADING = Object.freeze({
  lobeShare: 0.5, volume: 0.25, upBias: 0.2, depthShade: 0.4, underside: 0.12,
  /**
   * Trees round 4 (the waves' "hard dark band at the canopy base"): the lowest a crown card's normal turns toward the
   * ground before it is normalised — the underside still faces down, but sees some sky round it, as an open crown's does
   */
  undersideFloor: -0.2,
  /**
   * The grown crowns' tint gain over that shade (vegetation.ts buildGrownTree). The shade alone took a portrait's
   * visible crown albedo at 22 m (.qa-dev trees2-portrait) from oak 0.122 to 0.083, pine 0.089 to 0.072, poplar 0.101 to
   * 0.070. 1.25 gave back all but a sixth, but the lab's pairs (2026-10-03) read its sunlit shell pale beside the meadow,
   * where the summer photographs of the places show woods a good deal darker than the grass round them: 1.1 keeps the
   * lit shell a little over the round-1 cards and the crown as a whole darker than them, the heart in shade.
   */
  crownGain: 1.1,
  /**
   * A grown shrub's depth shade and the gain that gives its shell back. Trees round 8 (2026-10-08, the gauntlet's wave
   * 275: the bushes "dark, evenly lit masses … with no sunlit mass"; their next step the crowns' law — lit tops,
   * translucency on the backlit side, darker interiors): the heart darker (0.3 → 0.45), the lit shell brighter (gain
   * 1.04 → 1.32: the mean as it was, the top and the shell over it), the mound's form leading its normals (shrubVolume
   * about the ground under it, the lobes' share 0.5 → 0.3) and a cluster's sky by its height in the mound (shrubTop:
   * the skirt in the mound's own shade, the top in the open sky).
   */
  shrubDepthShade: 0.45, shrubGain: 1.32, shrubVolume: 0.55, shrubLobeShare: 0.3,
  shrubTop: Object.freeze([0.8, 1.2]) as readonly [number, number],
  /** Trees round 4: a tufted pine's tuft by its stem darkens by up to this share (its depth in the crown's ellipsoid). */
  tuftCrownDepth: 0.35,
  /** Trees round 4: a crown card's value from its stem row to its tip row (the cluster's own shade toward its twig). */
  cardRamp: Object.freeze([0.75, 1.13]) as readonly [number, number],
});

/**
 * The foliage as one flat geometry: per leaf site a spray card seated with its stem end ON the branch (a few
 * centimetres inside it), reaching along the site's axis, bent along its length; 2 × 2 triangles. Attributes:
 * position, normal (a blend of the card's face, turned outward, and the crown sphere's normal at the vertex, with an
 * up bias — the crown lights as a volume and still shows the sprays' facets; trees round 2: and the lobes' union),
 * uv (the site's tile of the atlas, stem at v = 0), color (the tint, trees round 2: darkened by the vertex's depth in
 * the crown), aFlex, aCard (the site's centre and the crown radius — the cascade sample), and trees round 2's
 * billboard frame: aAxis (the card's unit axis) and aLeaf (the vertex across the card, along it from the centre, and
 * the bend's sag), from which the near material turns each card about its own axis to face the camera
 * (vegetation.ts COT_LEAF_BILLBOARD).
 */
export function emitLeafCards(skeleton: TreeSkeleton, options: CardEmitOptions): THREE.BufferGeometry {
  const tiles = Math.max(1, options.tiles | 0);
  // trees round 4: a tufted pine's cards shade by its tufts (each tuft its own lit mass), and by the tuft's depth in
  // the crown besides (a tuft by the stem in the crown's shade, one at a limb's end in the light)
  const tufted = !!(skeleton.tufts && skeleton.tufts.length && skeleton.lobes && skeleton.lobes.length);
  const lobes = tufted ? skeleton.tufts! : skeleton.lobes && skeleton.lobes.length ? skeleton.lobes : null;
  const lobeShare = lobes ? (options.lobeShare ?? GROWTH_CROWN_SHADING.lobeShare) : 0;
  const volume = options.volume ?? (lobes ? GROWTH_CROWN_SHADING.volume : 0.62);
  const upBias = options.upBias ?? (lobes ? GROWTH_CROWN_SHADING.upBias : 0.32);
  const depthShade = lobes ? (options.depthShade ?? GROWTH_CROWN_SHADING.depthShade) : 0;
  const rowCount = options.rows ?? 3, perCard = (rowCount - 1) * 6, stemWidth = options.stemWidth ?? 0.92;
  const { crown } = skeleton;
  const volumeCentre = options.volumeCentre ?? crown, volumeYScale = options.volumeYScale ?? 0.75;
  const count = skeleton.leaves.length;
  const pos = new Float32Array(count * perCard * 3), nrm = new Float32Array(count * perCard * 3), uv = new Float32Array(count * perCard * 2);
  const col = new Float32Array(count * perCard * 3), flex = new Float32Array(count * perCard), card = new Float32Array(count * perCard * 4);
  const axisA = new Float32Array(count * perCard * 3), leaf = new Float32Array(count * perCard * 3);
  const field = [0, 0, 0, 0];
  let o = 0;
  for (const site of skeleton.leaves) {
    const axis = v3(site.ax, site.ay, site.az), face = v3(site.nx, site.ny, site.nz);
    const right = norm(cross(axis, face));
    const tileX = site.tile % tiles, tileY = Math.floor(site.tile / tiles) % tiles;
    const u0 = tileX / tiles, v0 = 1 - (tileY + 1) / tiles;
    const du = 1 / tiles, dv = 1 / tiles;
    const [cr, cg, cb] = options.tint(site.shade, site, options.rng);
    // three rows along the card (stem, middle, tip); the bend droops the outer rows under gravity. A two-row card is
    // the stem and tip rows only, near full width at both (the tile's spray undistorted)
    const rows: V3[][] = [];
    const rowAlong: number[] = [], rowSag: number[] = [], rowHalf: number[] = [];
    for (let r = 0; r < rowCount; r++) {
      const t = r / (rowCount - 1);
      const along = -0.06 * site.length + t * site.length;
      const sag = site.bend * site.length * t * t;
      const cx = site.x + axis.x * along, cy = site.y + axis.y * along - sag, cz = site.z + axis.z * along;
      const half = site.width * 0.5 * (rowCount === 2 ? (r === 0 ? stemWidth : 1) : r === 0 ? 0.55 : r === 1 ? 1 : 0.9);
      rows.push([v3(cx - right.x * half, cy - right.y * half, cz - right.z * half), v3(cx + right.x * half, cy + right.y * half, cz + right.z * half)]);
      rowAlong.push(along - site.length * 0.45); rowSag.push(sag); rowHalf.push(half);
    }
    const centre = v3(site.x + axis.x * site.length * 0.45, site.y + axis.y * site.length * 0.45, site.z + axis.z * site.length * 0.45);
    const faceOut = dot(face, norm(v3(centre.x - crown.x, centre.y - crown.y, centre.z - crown.z))) < 0 ? v3(-face.x, -face.y, -face.z) : face;
    const writeVertex = (p: V3, u: number, v: number, row: number, side: number): void => {
      const sx = p.x - volumeCentre.x, sy = (p.y - volumeCentre.y) * volumeYScale, sz = p.z - volumeCentre.z;
      const sl = Math.hypot(sx, sy, sz) || 1;
      const faceShare = Math.max(0, 1 - volume - lobeShare);
      let nx = (sx / sl) * volume + faceOut.x * faceShare;
      let ny = (sy / sl) * volume + faceOut.y * faceShare + upBias;
      let nz = (sz / sl) * volume + faceOut.z * faceShare;
      let shade = 1;
      if (lobes) {
        lobeField(lobes, p.x, p.y, p.z, field);
        // at a lobe's heart the union has no direction: the crown's own takes its share
        const has = Math.hypot(field[0], field[1], field[2]) > 0.5;
        nx += (has ? field[0] : sx / sl) * lobeShare;
        ny += (has ? field[1] : sy / sl) * lobeShare;
        nz += (has ? field[2] : sz / sl) * lobeShare;
        const depth = smooth01((field[3] - 0.42) / 0.63);
        const under = smooth01((-(has ? field[1] : sy / sl) - 0.1) / 0.8);
        shade = (1 - depthShade * depth) * (1 - GROWTH_CROWN_SHADING.underside * under);
        if (tufted) shade *= 1 - GROWTH_CROWN_SHADING.tuftCrownDepth * smooth01(1 - sl / Math.max(0.5, crown.r * 0.8));
        ny = Math.max(ny, GROWTH_CROWN_SHADING.undersideFloor);
        // trees round 4: a cluster in its own shade toward its seat — the stem end of a card sits in the leaves round
        // its twig, its tip out in the light (the card reads as leaves in depth, not a flat sticker)
        shade *= GROWTH_CROWN_SHADING.cardRamp[0] + (GROWTH_CROWN_SHADING.cardRamp[1] - GROWTH_CROWN_SHADING.cardRamp[0]) * v;
      }
      const nl = Math.hypot(nx, ny, nz) || 1;
      nx /= nl; ny /= nl; nz /= nl;
      pos[o * 3] = p.x; pos[o * 3 + 1] = p.y; pos[o * 3 + 2] = p.z;
      nrm[o * 3] = nx; nrm[o * 3 + 1] = ny; nrm[o * 3 + 2] = nz;
      uv[o * 2] = u0 + u * du; uv[o * 2 + 1] = v0 + v * dv;
      col[o * 3] = cr * shade; col[o * 3 + 1] = cg * shade; col[o * 3 + 2] = cb * shade;
      flex[o] = site.flex * (0.75 + 0.25 * v);
      card[o * 4] = centre.x; card[o * 4 + 1] = centre.y; card[o * 4 + 2] = centre.z; card[o * 4 + 3] = crown.r;
      axisA[o * 3] = axis.x; axisA[o * 3 + 1] = axis.y; axisA[o * 3 + 2] = axis.z;
      leaf[o * 3] = side * rowHalf[row]; leaf[o * 3 + 1] = rowAlong[row]; leaf[o * 3 + 2] = rowSag[row];
      o++;
    };
    for (let r = 0; r < rowCount - 1; r++) {
      const a = rows[r], b = rows[r + 1];
      const va = r / (rowCount - 1), vb = (r + 1) / (rowCount - 1);
      writeVertex(a[0], 0, va, r, -1); writeVertex(a[1], 1, va, r, 1); writeVertex(b[1], 1, vb, r + 1, 1);
      writeVertex(a[0], 0, va, r, -1); writeVertex(b[1], 1, vb, r + 1, 1); writeVertex(b[0], 0, vb, r + 1, -1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geometry.setAttribute('aFlex', new THREE.BufferAttribute(flex, 1));
  geometry.setAttribute('aCard', new THREE.BufferAttribute(card, 4));
  geometry.setAttribute('aAxis', new THREE.BufferAttribute(axisA, 3));
  geometry.setAttribute('aLeaf', new THREE.BufferAttribute(leaf, 3));
  return geometry;
}

/** Smoothstep on [0, 1] of an already-normalised argument. */
function smooth01(x: number): number {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
}

/**
 * Trees round 2 (2026-10-03): the crown masses' porosity — the share of the sun a mass of the hull lets through, by
 * Beer-Lambert over its sprays: exp(-G x coverage x leaf area / projected area), the sprays turned at random (G, the
 * mean projection of a flat card, a half), each card stopping its atlas's opaque share (treeSprayAtlas.ts
 * SPRAY_ATLAS_COVERAGE), the area the mass's ellipsoid shades under a sun at `sunElevation` (its RMS over azimuth);
 * held inside [min, max] so a mass never casts solid and never vanishes. A dense oak mass keeps about a third of the
 * sun, a weeping eucalyptus or an Aleppo pine more than half (the gauntlet's "dense, unexplained dark shadow-shape"
 * under a sparse crown, wave 6).
 */
export const GROWTH_CROWN_POROSITY = Object.freeze({ leafProjection: 0.5, sunElevation: Math.PI / 4, min: 0.08, max: 0.72, coverage: 0.28 });

/** One crown mass of a shadow hull: its vertex range and the share of the sun it lets through. */
export interface CrownShadowMass { start: number; end: number; transmittance: number }

/**
 * The crown's shadow caster: position-only, the stem and scaffold wood as five-sided tubes and the foliage as a
 * handful of low ellipsoids fitted to clusters of spray seats (the masses a sun shadow resolves at the cascades'
 * texel sizes — the near crown's own shape, not a generic lobe). Flat triangles. The wood leads; each crown mass
 * carries its porosity (GROWTH_CROWN_POROSITY, the sprays' `coverage` the tree's atlas share).
 */
export function emitCrownShadowHull(skeleton: TreeSkeleton, clusters = 8, coverage: number = GROWTH_CROWN_POROSITY.coverage):
  Float32Array & { woodVertices: number; masses: CrownShadowMass[] } {
  const out: number[] = [];
  const masses: CrownShadowMass[] = [];
  // wood: the stem and the first-order limbs
  for (const branch of skeleton.branches) {
    if (branch.order > 1 || (branch.order === 1 && branch.nodes[0].r < 0.06)) continue;
    const s = branch.order === 0 ? 6 : 4;
    const nodes = branch.nodes;
    let prevRing: V3[] | null = null;
    let frameN: V3 | null = null;
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[Math.max(0, i - 1)], b = nodes[Math.min(nodes.length - 1, i + 1)];
      const t = norm(v3(b.x - a.x, b.y - a.y, b.z - a.z));
      frameN = frameN ? norm(v3(frameN.x - t.x * dot(frameN, t), frameN.y - t.y * dot(frameN, t), frameN.z - t.z * dot(frameN, t))) : perpendicular(t);
      const bN = norm(cross(t, frameN));
      const ring: V3[] = [];
      for (let j = 0; j < s; j++) {
        const phi = (j / s) * Math.PI * 2;
        ring.push(v3(nodes[i].x + (frameN.x * Math.cos(phi) + bN.x * Math.sin(phi)) * nodes[i].r,
          nodes[i].y + (frameN.y * Math.cos(phi) + bN.y * Math.sin(phi)) * nodes[i].r,
          nodes[i].z + (frameN.z * Math.cos(phi) + bN.z * Math.sin(phi)) * nodes[i].r));
      }
      if (prevRing) {
        for (let j = 0; j < s; j++) {
          const j1 = (j + 1) % s;
          for (const v of [prevRing[j], prevRing[j1], ring[j1], prevRing[j], ring[j1], ring[j]]) out.push(v.x, v.y, v.z);
        }
      }
      prevRing = ring;
    }
  }
  // trees round 2: the wood leads the hull (its vertex count rides on the array, crownShadowDapple.ts opens the crown
  // masses after it and never the wood)
  const woodVertices = out.length / 3;
  // foliage: k-means-lite over the spray centres (seeded from the farthest-point spread, three refinements)
  const sites = skeleton.leaves.map((l) => v3(l.x + l.ax * l.length * 0.45, l.y + l.ay * l.length * 0.45, l.z + l.az * l.length * 0.45));
  if (sites.length) {
    const k = Math.min(clusters, sites.length);
    const centres: V3[] = [sites[0]];
    while (centres.length < k) {
      let best = sites[0], bestD = -1;
      for (const s of sites) {
        let d = Infinity;
        for (const c of centres) d = Math.min(d, (s.x - c.x) ** 2 + (s.y - c.y) ** 2 + (s.z - c.z) ** 2);
        if (d > bestD) { bestD = d; best = s; }
      }
      centres.push(best);
    }
    let assign = new Array(sites.length).fill(0);
    for (let iter = 0; iter < 4; iter++) {
      assign = sites.map((s) => {
        let bi = 0, bd = Infinity;
        centres.forEach((c, i) => { const d = (s.x - c.x) ** 2 + (s.y - c.y) ** 2 + (s.z - c.z) ** 2; if (d < bd) { bd = d; bi = i; } });
        return bi;
      });
      for (let i = 0; i < centres.length; i++) {
        let x = 0, y = 0, z = 0, n = 0;
        sites.forEach((s, j) => { if (assign[j] === i) { x += s.x; y += s.y; z += s.z; n++; } });
        if (n) centres[i] = v3(x / n, y / n, z / n);
      }
    }
    const ico = new THREE.IcosahedronGeometry(1, 0);
    const ip = ico.getAttribute('position');
    for (let i = 0; i < centres.length; i++) {
      let ex = 0.35, ey = 0.3, ez = 0.35, n = 0;
      sites.forEach((s, j) => {
        if (assign[j] !== i) return;
        n++;
        ex = Math.max(ex, Math.abs(s.x - centres[i].x)); ey = Math.max(ey, Math.abs(s.y - centres[i].y)); ez = Math.max(ez, Math.abs(s.z - centres[i].z));
      });
      if (!n) continue;
      // the sprays fill about four fifths of their cluster's box
      const a = ex * 0.92, b = ey * 0.85, c = ez * 0.92, start = out.length / 3;
      for (let v = 0; v < ip.count; v++) {
        out.push(centres[i].x + ip.getX(v) * a, centres[i].y + ip.getY(v) * b, centres[i].z + ip.getZ(v) * c);
      }
      // the mass's porosity: its sprays' card area over the ellipsoid's shade under the law's sun
      let leafArea = 0;
      skeleton.leaves.forEach((leaf, j) => { if (assign[j] === i) leafArea += leaf.length * leaf.width; });
      const ce = Math.cos(GROWTH_CROWN_POROSITY.sunElevation), se = Math.sin(GROWTH_CROWN_POROSITY.sunElevation);
      const shade = Math.PI * Math.sqrt(ce * ce * ((b * c) ** 2 + (a * b) ** 2) * 0.5 + se * se * (a * c) ** 2);
      const depth = GROWTH_CROWN_POROSITY.leafProjection * coverage * leafArea / Math.max(1e-3, shade);
      masses.push({ start, end: out.length / 3,
        transmittance: Math.min(GROWTH_CROWN_POROSITY.max, Math.max(GROWTH_CROWN_POROSITY.min, Math.exp(-depth))) });
    }
    ico.dispose();
  }
  return Object.assign(new Float32Array(out), { woodVertices, masses });
}

/**
 * Weld a flat triangle list: vertices whose every attribute is bit-identical (the emitters write a tube's ring vertex
 * and a card's row vertex once per triangle that uses them) collapse to one, and an index carries the triangles —
 * the same triangle list, drawn through the vertex cache. Exact comparison, hashed on the position's float bits;
 * O(vertices). Indexed input returns unchanged; userData carries over.
 */
export function weldGrownGeometry(source: THREE.BufferGeometry): THREE.BufferGeometry {
  if (source.index) return source;
  const names = Object.keys(source.attributes);
  const attrs = names.map((name) => source.getAttribute(name) as THREE.BufferAttribute);
  const arrays = attrs.map((a) => a.array as Float32Array);
  const sizes = attrs.map((a) => a.itemSize);
  const position = source.getAttribute('position') as THREE.BufferAttribute;
  const count = position.count;
  const pos = position.array as Float32Array;
  const bits = new Uint32Array(pos.buffer, pos.byteOffset, pos.length);
  const head = new Map<number, number>();
  const next = new Int32Array(count).fill(-1);
  const firstOf = new Int32Array(count);
  const remap = new Uint32Array(count);
  let unique = 0;
  const same = (a: number, b: number): boolean => {
    for (let k = 0; k < arrays.length; k++) {
      const arr = arrays[k], s = sizes[k];
      for (let c = 0; c < s; c++) if (arr[a * s + c] !== arr[b * s + c]) return false;
    }
    return true;
  };
  for (let v = 0; v < count; v++) {
    const h = (Math.imul(bits[v * 3] ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(bits[v * 3 + 1], 0xc2b2ae35)
      ^ Math.imul(bits[v * 3 + 2], 0x27d4eb2f)) | 0;
    const first = head.get(h);
    let found = -1;
    for (let u = first ?? -1; u >= 0; u = next[u]) if (same(firstOf[u], v)) { found = u; break; }
    if (found < 0) {
      found = unique++;
      firstOf[found] = v;
      next[found] = first ?? -1;
      head.set(h, found);
    }
    remap[v] = found;
  }
  const out = new THREE.BufferGeometry();
  names.forEach((name, k) => {
    const s = sizes[k], src = arrays[k];
    const dst = new (src.constructor as Float32ArrayConstructor)(unique * s);
    for (let u = 0; u < unique; u++) for (let c = 0; c < s; c++) dst[u * s + c] = src[firstOf[u] * s + c];
    out.setAttribute(name, new THREE.BufferAttribute(dst, s, attrs[k].normalized));
  });
  out.setIndex(new THREE.BufferAttribute(unique < 65536 ? Uint16Array.from(remap) : remap, 1));
  out.userData = source.userData;
  return out;
}
