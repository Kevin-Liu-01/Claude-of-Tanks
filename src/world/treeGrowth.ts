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
  | 'pine' | 'spruce' | 'fir' | 'cedar' | 'cypress' | 'birch' | 'aspen' | 'snag';
type Rng = () => number;

export const GROWTH_SPECIES: readonly GrowthSpecies[] = Object.freeze([
  'oak', 'poplar', 'willow', 'acacia', 'eucalyptus', 'pine', 'spruce', 'fir', 'cedar', 'cypress', 'birch', 'aspen', 'snag',
]);

/** How a crown envelope narrows from its base (t = 0) to its top (t = 1): the radius fraction at t. */
type EnvelopeShape = 'cone' | 'ellipsoid' | 'dome' | 'column' | 'umbrella' | 'flame' | 'tiered' | 'tuft';

/** The card a leaf site takes: a spray seated on a branch, a hanging curtain, a flat tier spray, an upright frond. */
type SprayHabit = 'spray' | 'hanging' | 'flat' | 'upright' | 'tuft';

export interface GrowthProfile {
  family: 'broadleaf' | 'conifer' | 'birch' | 'dead';
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
  /** Bark style column of the bark atlas (vegetation.ts): 0 furrowed, 1 plated, 2 smooth/banded, 3 papery. */
  bark: number;
  /** Bark tint (linear-ish multiplier around the neutral sheet) and its upper-stem shift (pine's orange top). */
  barkTint: readonly [number, number, number];
  barkTopTint: readonly [number, number, number] | null;
}

const P = (p: GrowthProfile): Readonly<GrowthProfile> => Object.freeze(p);

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
    forkAt: [0.30, 0.38], scaffolds: [4, 6], scaffoldAngle: [0.55, 1.08], crownBase: 0.34, crownR: 2.75,
    envelope: 'dome', whorled: false, perWhorl: [1, 1], spacing: 0.55, angleLow: 1.15, angleHigh: 0.6,
    droop: 0.42, upturn: 0.38, sidePerM: 2.3, sideAngle: 0.75, sideRatio: 0.62, sideDroop: 0.35, twigPerM: 1.8,
    leafOrder: 1, leafPerM: 2.4, leafFrom: 0.3, spray: [0.95, 1.45], aspect: 0.82, habit: 'spray', tipSprays: 1,
    cardBend: 0.16, flatRoll: 0.6, flatDroop: 0.0, bark: 0, barkTint: [0.46, 0.41, 0.36], barkTopTint: null,
  }),
  poplar: P({
    family: 'broadleaf', height: 8.2, heightSpread: 0.10, trunkR: 0.24, form: 'excurrent',
    forkAt: [0, 0], scaffolds: [0, 0], scaffoldAngle: [0, 0], crownBase: 0.16, crownR: 1.55,
    envelope: 'column', whorled: false, perWhorl: [1, 1], spacing: 0.42, angleLow: 0.42, angleHigh: 0.22,
    droop: 0.05, upturn: 0.30, sidePerM: 2.2, sideAngle: 0.45, sideRatio: 0.55, sideDroop: 0.05, twigPerM: 0,
    leafOrder: 1, leafPerM: 2.6, leafFrom: 0.15, spray: [0.85, 1.25], aspect: 0.74, habit: 'upright', tipSprays: 1,
    cardBend: 0.08, flatRoll: 0.6, flatDroop: 0.0, bark: 0, barkTint: [0.56, 0.54, 0.50], barkTopTint: [0.66, 0.64, 0.60],
  }),
  willow: P({
    family: 'broadleaf', height: 6.4, heightSpread: 0.10, trunkR: 0.38, form: 'decurrent',
    forkAt: [0.30, 0.40], scaffolds: [4, 6], scaffoldAngle: [0.42, 0.72], crownBase: 0.3, crownR: 3.25,
    envelope: 'dome', whorled: false, perWhorl: [1, 1], spacing: 0.5, angleLow: 1.2, angleHigh: 0.7,
    droop: 0.22, upturn: 0.0, sidePerM: 2.8, sideAngle: 1.15, sideRatio: 0.95, sideDroop: 2.4, twigPerM: 0,
    leafOrder: 2, leafPerM: 3.8, leafFrom: 0.25, spray: [1.6, 2.4], aspect: 0.40, habit: 'hanging', tipSprays: 1,
    cardBend: 0.05, flatRoll: 0.6, flatDroop: 0.0, bark: 0, barkTint: [0.44, 0.40, 0.34], barkTopTint: null,
  }),
  acacia: P({
    family: 'broadleaf', height: 6.2, heightSpread: 0.10, trunkR: 0.28, form: 'decurrent',
    forkAt: [0.26, 0.36], scaffolds: [3, 5], scaffoldAngle: [0.70, 1.05], crownBase: 0.6, crownR: 3.2,
    envelope: 'umbrella', whorled: false, perWhorl: [1, 1], spacing: 0.6, angleLow: 1.3, angleHigh: 1.1,
    droop: 0.12, upturn: 0.55, sidePerM: 1.8, sideAngle: 1.0, sideRatio: 0.6, sideDroop: 0.0, twigPerM: 2.2,
    leafOrder: 2, leafPerM: 3.2, leafFrom: 0.3, spray: [1.1, 1.6], aspect: 0.95, habit: 'flat', tipSprays: 1,
    cardBend: 0.04, flatRoll: 0.45, flatDroop: 0.0, bark: 0, barkTint: [0.42, 0.36, 0.30], barkTopTint: null,
  }),
  eucalyptus: P({
    family: 'broadleaf', height: 9.0, heightSpread: 0.12, trunkR: 0.25, form: 'excurrent',
    forkAt: [0, 0], scaffolds: [0, 0], scaffoldAngle: [0, 0], crownBase: 0.36, crownR: 2.9,
    envelope: 'ellipsoid', whorled: false, perWhorl: [1, 1], spacing: 0.55, angleLow: 0.85, angleHigh: 0.45,
    droop: 0.35, upturn: 0.2, sidePerM: 1.9, sideAngle: 0.7, sideRatio: 0.55, sideDroop: 0.45, twigPerM: 0,
    leafOrder: 1, leafPerM: 2.8, leafFrom: 0.3, spray: [1.0, 1.5], aspect: 0.55, habit: 'hanging', tipSprays: 2,
    cardBend: 0.10, flatRoll: 0.6, flatDroop: 0.0, bark: 2, barkTint: [0.64, 0.60, 0.54], barkTopTint: [0.74, 0.72, 0.66],
  }),
  pine: P({
    family: 'conifer', height: 7.2, heightSpread: 0.12, trunkR: 0.25, form: 'excurrent',
    forkAt: [0, 0], scaffolds: [0, 0], scaffoldAngle: [0, 0], crownBase: 0.50, crownR: 2.4,
    envelope: 'flame', whorled: true, perWhorl: [3, 5], spacing: 0.62, angleLow: 1.45, angleHigh: 0.85,
    droop: 0.25, upturn: 0.45, sidePerM: 1.2, sideAngle: 0.7, sideRatio: 0.45, sideDroop: 0.1, twigPerM: 0,
    leafOrder: 1, leafPerM: 1.5, leafFrom: 0.55, spray: [0.95, 1.35], aspect: 0.9, habit: 'tuft', tipSprays: 3,
    cardBend: 0.06, flatRoll: 0.6, flatDroop: 0.0, bark: 1, barkTint: [0.44, 0.33, 0.27], barkTopTint: [0.80, 0.52, 0.34],
  }),
  spruce: P({
    family: 'conifer', height: 8.2, heightSpread: 0.10, trunkR: 0.19, form: 'excurrent',
    forkAt: [0, 0], scaffolds: [0, 0], scaffoldAngle: [0, 0], crownBase: 0.07, crownR: 1.6,
    envelope: 'cone', whorled: true, perWhorl: [3, 5], spacing: 0.55, angleLow: 1.95, angleHigh: 1.05,
    droop: 0.30, upturn: 0.50, sidePerM: 2.4, sideAngle: 0.95, sideRatio: 0.42, sideDroop: 0.55, twigPerM: 0,
    leafOrder: 1, leafPerM: 3.2, leafFrom: 0.0, spray: [1.05, 1.55], aspect: 0.66, habit: 'flat', tipSprays: 1,
    cardBend: 0.18, flatRoll: 1.15, flatDroop: 0.35, bark: 1, barkTint: [0.36, 0.30, 0.27], barkTopTint: null,
  }),
  fir: P({
    family: 'conifer', height: 7.3, heightSpread: 0.10, trunkR: 0.27, form: 'excurrent',
    forkAt: [0, 0], scaffolds: [0, 0], scaffoldAngle: [0, 0], crownBase: 0.10, crownR: 2.0,
    envelope: 'tiered', whorled: true, perWhorl: [3, 5], spacing: 0.6, angleLow: 1.75, angleHigh: 1.05,
    droop: 0.12, upturn: 0.30, sidePerM: 2.4, sideAngle: 1.05, sideRatio: 0.45, sideDroop: 0.05, twigPerM: 0,
    leafOrder: 1, leafPerM: 3.2, leafFrom: 0.0, spray: [1.1, 1.6], aspect: 0.72, habit: 'flat', tipSprays: 1,
    cardBend: 0.06, flatRoll: 0.55, flatDroop: 0.12, bark: 2, barkTint: [0.42, 0.40, 0.38], barkTopTint: null,
  }),
  cedar: P({
    family: 'conifer', height: 6.6, heightSpread: 0.10, trunkR: 0.32, form: 'excurrent',
    forkAt: [0, 0], scaffolds: [0, 0], scaffoldAngle: [0, 0], crownBase: 0.22, crownR: 3.05,
    envelope: 'tiered', whorled: true, perWhorl: [4, 5], spacing: 0.8, angleLow: 1.62, angleHigh: 1.15,
    droop: 0.0, upturn: 0.08, sidePerM: 2.8, sideAngle: 1.1, sideRatio: 0.5, sideDroop: 0.0, twigPerM: 0,
    leafOrder: 1, leafPerM: 3.4, leafFrom: 0.1, spray: [1.2, 1.8], aspect: 0.9, habit: 'flat', tipSprays: 1,
    cardBend: 0.03, flatRoll: 0.38, flatDroop: 0.04, bark: 0, barkTint: [0.40, 0.34, 0.30], barkTopTint: null,
  }),
  cypress: P({
    family: 'conifer', height: 7.8, heightSpread: 0.10, trunkR: 0.14, form: 'excurrent',
    forkAt: [0, 0], scaffolds: [0, 0], scaffoldAngle: [0, 0], crownBase: 0.07, crownR: 0.95,
    envelope: 'flame', whorled: false, perWhorl: [1, 1], spacing: 0.22, angleLow: 0.38, angleHigh: 0.2,
    droop: 0.0, upturn: 0.2, sidePerM: 0, sideAngle: 0.4, sideRatio: 0.5, sideDroop: 0, twigPerM: 0,
    leafOrder: 1, leafPerM: 4.2, leafFrom: 0.0, spray: [1.15, 1.6], aspect: 0.55, habit: 'upright', tipSprays: 1,
    cardBend: 0.04, flatRoll: 0.6, flatDroop: 0.0, bark: 0, barkTint: [0.40, 0.34, 0.30], barkTopTint: null,
  }),
  birch: P({
    family: 'birch', height: 7.0, heightSpread: 0.14, trunkR: 0.16, form: 'excurrent',
    forkAt: [0, 0], scaffolds: [0, 0], scaffoldAngle: [0, 0], crownBase: 0.30, crownR: 2.2,
    envelope: 'ellipsoid', whorled: false, perWhorl: [1, 1], spacing: 0.36, angleLow: 0.95, angleHigh: 0.48,
    droop: 0.40, upturn: 0.0, sidePerM: 2.4, sideAngle: 0.65, sideRatio: 0.7, sideDroop: 1.5, twigPerM: 0,
    leafOrder: 2, leafPerM: 3.0, leafFrom: 0.15, spray: [0.95, 1.40], aspect: 0.55, habit: 'hanging', tipSprays: 1,
    cardBend: 0.10, flatRoll: 0.6, flatDroop: 0.0, bark: 3, barkTint: [0.92, 0.91, 0.88], barkTopTint: null,
  }),
  aspen: P({
    family: 'birch', height: 7.6, heightSpread: 0.12, trunkR: 0.13, form: 'excurrent',
    forkAt: [0, 0], scaffolds: [0, 0], scaffoldAngle: [0, 0], crownBase: 0.42, crownR: 1.7,
    envelope: 'ellipsoid', whorled: false, perWhorl: [1, 1], spacing: 0.38, angleLow: 0.75, angleHigh: 0.40,
    droop: 0.15, upturn: 0.15, sidePerM: 2.2, sideAngle: 0.6, sideRatio: 0.55, sideDroop: 0.25, twigPerM: 0,
    leafOrder: 1, leafPerM: 2.8, leafFrom: 0.2, spray: [0.85, 1.25], aspect: 0.78, habit: 'spray', tipSprays: 1,
    cardBend: 0.10, flatRoll: 0.6, flatDroop: 0.0, bark: 3, barkTint: [0.84, 0.84, 0.80], barkTopTint: null,
  }),
  snag: P({
    family: 'dead', height: 5.6, heightSpread: 0.22, trunkR: 0.27, form: 'excurrent',
    forkAt: [0, 0], scaffolds: [0, 0], scaffoldAngle: [0, 0], crownBase: 0.38, crownR: 2.0,
    envelope: 'ellipsoid', whorled: false, perWhorl: [1, 1], spacing: 0.9, angleLow: 1.1, angleHigh: 0.65,
    droop: 0.15, upturn: 0.15, sidePerM: 0.6, sideAngle: 0.7, sideRatio: 0.45, sideDroop: 0.1, twigPerM: 0,
    leafOrder: 1, leafPerM: 0.9, leafFrom: 0.55, spray: [0.7, 1.05], aspect: 0.9, habit: 'spray', tipSprays: 1,
    cardBend: 0.05, flatRoll: 0.0, flatDroop: 0.0, bark: 0, barkTint: [0.36, 0.33, 0.30], barkTopTint: [0.22, 0.20, 0.19],
  }),
});

export interface GrowthNode { x: number; y: number; z: number; r: number; flex: number }
export interface GrowthBranch {
  order: number;
  parent: number;
  nodes: GrowthNode[];
  /** Emitted as a tube (the finest twigs live only in the spray tiles). */
  mesh: boolean;
  /** A broken stub (snags): its tip ends blunt, not tapered to a twig. */
  broken: boolean;
}
export interface LeafSite {
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
}
export interface TreeSkeleton {
  species: GrowthSpecies;
  height: number;
  branches: GrowthBranch[];
  leaves: LeafSite[];
  /** The crown's centre and radius (tree space) — the cards' volume normals and cascade sample reach. */
  crown: { x: number; y: number; z: number; r: number };
}

export interface GrowthOptions {
  /** 0, 1, 2: the near variants (smaller/younger, typical, larger/older); shapes the height and crown. */
  variant?: number;
  /** Detail tier: 'desktop' or 'mobile' (fewer sprays and side shoots, same silhouette). */
  tier?: 'desktop' | 'mobile';
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
    case 'umbrella': return u < 0.55 ? 0.35 + u * 1.1 : Math.sqrt(Math.max(0, 1 - ((u - 0.55) / 0.45) ** 2)) * 0.95 + 0.05;
    case 'flame': return Math.sin(Math.PI * Math.min(1, 0.08 + u * 0.92)) ** 0.7 * (1 - u * 0.35);
    case 'tuft': return Math.sqrt(Math.max(0, 1 - (2 * u - 1) ** 2));
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
  for (let i = 1; i <= segments; i++) {
    const t = i / segments;
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
  const crookA = rng() * Math.PI * 2, crook = 0.04 + rng() * 0.05;
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
    if (profile.habit === 'flat' && order === 2) dir = norm(v3(dir.x, dir.y * 0.3, dir.z));
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
  for (let s = 0; s < n; s++) {
    const az = phase + (s / n) * Math.PI * 2 + (rng() - 0.5) * 0.7;
    const a = range(rng, profile.scaffoldAngle) * (variant === 1 ? 0.92 : variant === 2 ? 1.08 : 1);
    const dir = v3(Math.sin(a) * Math.cos(az), Math.cos(a), Math.sin(a) * Math.sin(az));
    // reach: to the envelope (with some limbs falling short so the crown is lobed, not a ball)
    const reach = ctx.crownR * (0.85 + rng() * 0.35);
    const rise = ctx.crownTopY - fork.y;
    const len = Math.min(Math.hypot(reach, rise * 0.85), reach / Math.max(0.35, Math.sin(a)) * 1.05);
    const r0 = fork.r * (0.62 + rng() * 0.12) * (n > 3 ? 0.9 : 1);
    const nodes = growPolyline(ctx, v3(fork.x, fork.y - 0.12, fork.z), dir, len, 4, r0, 0.025,
      profile.droop * 0.7, profile.upturn, 0.22, 0.05, 0.28, true);
    ctx.branches.push({ order: 1, parent: stemIndex, nodes, mesh: true, broken: false });
    const limb = ctx.branches.length - 1;
    // a continuing leader on some scaffolds: a second split two thirds up gives the dome its lobes
    if (rng() < 0.45) {
      const at = sampleAlong(nodes, 0.55 + rng() * 0.15);
      const side = rotate(perpendicular(at.d), at.d, rng() * Math.PI * 2);
      const d2 = norm(rotate(at.d, norm(cross(at.d, side)), 0.45 + rng() * 0.25));
      const n2 = growPolyline(ctx, at.p, d2, len * (0.45 + rng() * 0.2), 3, at.r * 0.7, 0.018,
        profile.droop * 0.6, profile.upturn, 0.2, at.flex, at.flex + 0.2, true);
      ctx.branches.push({ order: 1, parent: limb, nodes: n2, mesh: true, broken: false });
      growSides(ctx, ctx.branches.length - 1, 2, profile.sidePerM, profile.sideAngle, profile.sideRatio, profile.sideDroop, 0.15, true);
    }
    growSides(ctx, limb, 2, profile.sidePerM, profile.sideAngle, profile.sideRatio, profile.sideDroop, 0.18, true);
  }
}

/** Primaries along an excurrent leader: whorls (conifers) or a spiral (poplar, birch, eucalyptus, cypress). */
function growPrimaries(ctx: GrowContext, stemIndex: number, variant: number): void {
  const { rng, profile } = ctx;
  const stem = ctx.branches[stemIndex];
  const y0 = ctx.crownBaseY, y1 = ctx.crownTopY - (profile.whorled ? 0.32 : 0.45);
  let y = y0 + rng() * profile.spacing * 0.5;
  let az = rng() * Math.PI * 2;
  const spacing = profile.spacing * (ctx.mobile ? 1.18 : 1);
  while (y < y1) {
    const t = (y - y0) / Math.max(0.3, ctx.crownTopY - y0);
    const count = profile.whorled ? Math.round(range(rng, profile.perWhorl)) : 1;
    const at = sampleAlong(stem.nodes, y / ctx.height);
    for (let k = 0; k < count; k++) {
      const a = lerp(profile.angleLow, profile.angleHigh, t) + (rng() - 0.5) * 0.18;
      const azK = az + (k / count) * Math.PI * 2 + (rng() - 0.5) * (profile.whorled ? 0.45 : 0.3);
      const dir = v3(Math.sin(a) * Math.cos(azK), Math.cos(a), Math.sin(a) * Math.sin(azK));
      const env = envelopeAt(ctx, y);
      // the branch reaches the envelope at its height (a hanging limb a little beyond: its droop pulls it back in)
      const reach = Math.max(0.25, env * (0.82 + rng() * 0.3));
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
  if (profile.family === 'conifer' && profile.form === 'excurrent' && ctx.branches.length) {
    const stem = ctx.branches[0];
    const tip = stem.nodes[stem.nodes.length - 1];
    const leaders = ctx.mobile ? 1 : 3;
    for (let k = 0; k < leaders; k++) {
      const t = 0.975 - k * 0.04;
      const at = sampleAlong(stem.nodes, t);
      const spin = rng() * Math.PI * 2;
      const axis = norm(v3(Math.cos(spin) * 0.18 * k, 1, Math.sin(spin) * 0.18 * k));
      const face = norm(rotate(perpendicular(axis), axis, spin));
      const size = range(rng, profile.spray) * (0.72 - k * 0.08);
      leaves.push({ x: at.p.x, y: at.p.y - 0.05, z: at.p.z, ax: axis.x, ay: axis.y, az: axis.z, nx: face.x, ny: face.y, nz: face.z,
        length: Math.min(size, Math.max(0.35, (tip.y + 0.25 - at.p.y))), width: size * profile.aspect, shade: 1, flex: Math.min(1, at.flex + 0.3),
        tile: (rng() * 4) | 0, bend: 0 });
    }
  }
  for (const branch of ctx.branches) {
    if (branch.broken) continue;
    // a weeping crown's scaffold tips carry curtains too (the limb would otherwise end bare above them)
    const tipOnly = branch.order < profile.leafOrder;
    if (tipOnly && !(profile.habit === 'hanging' && branch.order === 1)) continue;
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
      // no spray reaches into the ground: a drooping or hanging card is shortened to end a hand's breadth over it
      // (the leaf budget's growth below is capped by the same rule)
      const bendNow = profile.cardBend;
      const fall = Math.max(0, -axis.y) + bendNow;
      if (fall > 1e-3) size = Math.max(0.3, Math.min(size, (at.p.y - GROWTH_SPRAY_CLEARANCE_M) / fall));
      leaves.push({
        x: at.p.x, y: at.p.y, z: at.p.z, ax: axis.x, ay: axis.y, az: axis.z, nx: face.x, ny: face.y, nz: face.z,
        length: size, width: size * profile.aspect * (0.9 + rng() * 0.2), shade, flex: Math.min(1, at.flex + 0.25 + rng() * 0.15),
        tile: (rng() * 4) | 0, bend: profile.cardBend * (0.6 + rng() * 0.8),
      });
      void crownMid;
    }
  }
}

/** A shell-killed snag: a broken stem, a few dead limbs (some snapped), no foliage. */
function growSnag(ctx: GrowContext): void {
  const { rng } = ctx;
  const top = ctx.height;
  const stem = growStem(ctx, top, ctx.profile.trunkR * 1.02, ctx.profile.trunkR * (0.32 + rng() * 0.18), 6);
  ctx.branches[stem].broken = true;
  const limbs = 3 + ((rng() * 4) | 0);
  for (let k = 0; k < limbs; k++) {
    const t = 0.38 + rng() * 0.55;
    const at = sampleAlong(ctx.branches[stem].nodes, t);
    const az = rng() * Math.PI * 2, a = 0.7 + rng() * 0.8;
    const dir = v3(Math.sin(a) * Math.cos(az), Math.cos(a), Math.sin(a) * Math.sin(az));
    const snapped = rng() < 0.55;
    const len = (snapped ? 0.35 + rng() * 0.6 : 1.1 + rng() * 1.6) * (1 - t * 0.35);
    const r0 = Math.max(0.03, at.r * (0.35 + rng() * 0.15));
    const nodes = growPolyline(ctx, at.p, dir, len, snapped ? 2 : 3, r0, snapped ? r0 * 0.7 : 0.012,
      0.2, 0.2, 0.3, 0.02, 0.12, false);
    ctx.branches.push({ order: 1, parent: stem, nodes, mesh: true, broken: snapped });
    if (!snapped && rng() < 0.6) {
      growSides(ctx, ctx.branches.length - 1, 2, 1.2, 0.8, 0.5, 0.1, 0.3, true);
    }
  }
}

/**
 * Grow one tree of a species: the skeleton every emitter below reads. `rng` drives every choice; the variant (0,
 * 1, 2) sets the age class — a younger, narrower tree, the typical one, an older broader one.
 */
export function growTreeSkeleton(species: GrowthSpecies, rng: Rng, options: GrowthOptions = {}): TreeSkeleton {
  const profile = TREE_GROWTH_PROFILES[species];
  const variant = ((options.variant ?? 1) % 3 + 3) % 3;
  const mobile = options.tier === 'mobile';
  const ageH = variant === 0 ? 0.88 : variant === 2 ? 1.1 : 1;
  const ageW = variant === 0 ? 0.84 : variant === 2 ? 1.12 : 1;
  const height = profile.height * ageH * (1 + (rng() - 0.5) * 2 * profile.heightSpread * 0.5);
  const ctx: GrowContext = {
    profile, rng, height, branches: [], mobile,
    crownBaseY: height * (profile.form === 'decurrent' ? range(rng, profile.forkAt) : profile.crownBase),
    crownTopY: height,
    crownR: profile.crownR * ageW * (0.94 + rng() * 0.12),
  };
  const leaves: LeafSite[] = [];
  if (profile.family === 'dead') {
    growSnag(ctx);
    seatLeaves(ctx, leaves);
  } else if (profile.form === 'decurrent') {
    const forkY = ctx.crownBaseY;
    const stem = growStem(ctx, forkY, profile.trunkR, profile.trunkR * 0.78, 4);
    growScaffolds(ctx, stem, variant);
    seatLeaves(ctx, leaves);
  } else {
    const stem = growStem(ctx, height, profile.trunkR, profile.family === 'conifer' ? 0.018 : 0.03,
      Math.max(5, Math.round(height / 0.85)));
    growPrimaries(ctx, stem, variant);
    seatLeaves(ctx, leaves);
  }
  // the budgets: a grown crown keeps its silhouette at a bounded card and tube count — surplus sprays are thinned
  // evenly along the seat order (each survivor grows by the area it inherits) and the thinnest side shoots stop being
  // tubes (their sprays still seat on them)
  const leafBudget = Math.round(GROWTH_LEAF_BUDGET[mobile ? 'mobile' : 'desktop'] * (profile.family === 'conifer' ? 1.3 : 1));
  if (leaves.length > leafBudget) {
    const kept: LeafSite[] = [];
    const grow = Math.min(1.32, Math.sqrt(leaves.length / leafBudget));
    for (let i = 0; i < leaves.length; i++) {
      if (Math.floor((i + 1) * leafBudget / leaves.length) > Math.floor(i * leafBudget / leaves.length)) {
        const l = leaves[i];
        const fall = Math.max(0, -l.ay) + l.bend;
        const g = fall > 1e-3 ? Math.min(grow, Math.max(1, (l.y - GROWTH_SPRAY_CLEARANCE_M) / (fall * l.length))) : grow;
        l.length *= g; l.width *= g;
        kept.push(l);
      }
    }
    leaves.length = 0;
    leaves.push(...kept);
  }
  const woodBudget = GROWTH_SIDE_TUBE_BUDGET[mobile ? 'mobile' : 'desktop'];
  const sides = ctx.branches.filter((b) => b.mesh && b.order >= 2).sort((a, b) => b.nodes[0].r - a.nodes[0].r);
  for (let i = woodBudget; i < sides.length; i++) sides[i].mesh = false;
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
  return { species, height, branches: ctx.branches, leaves, crown: { x: cx, y: cy, z: cz, r: Math.max(0.8, r) } };
}

// ------------------------------------------------------------------------------------------------ emitters

/** The lowest a spray card's tip may reach over the ground (m). */
export const GROWTH_SPRAY_CLEARANCE_M = 0.15;
/** Below this height a primary limb carries its sprays but is not emitted as wood (it is hidden in them, and the
 * lower stem's girth stays the stem's for the collision fit). */
export const GROWTH_LOWEST_WOOD_M = 1.7;
/** Spray cards per near tree (the conifers take a tenth more): ~600 card triangles on the desktop tiers. */
export const GROWTH_LEAF_BUDGET: Readonly<Record<'desktop' | 'mobile', number>> = Object.freeze({ desktop: 150, mobile: 88 });
/** Side shoots (order >= 2) emitted as tubes, thickest first. */
export const GROWTH_SIDE_TUBE_BUDGET: Readonly<Record<'desktop' | 'mobile', number>> = Object.freeze({ desktop: 14, mobile: 6 });

/** The tube sides per branch order: the stem round enough for the trunk-quality receipt, twigs triangular. */
export const GROWTH_TUBE_SIDES: Readonly<Record<'desktop' | 'mobile', readonly number[]>> = Object.freeze({
  desktop: Object.freeze([10, 6, 4, 3]),
  mobile: Object.freeze([9, 5, 3, 3]),
});

export interface BranchEmitOptions {
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
  for (const branch of skeleton.branches) {
    if (!branch.mesh || branch.order > maxOrder) continue;
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
      const tr = lerp(options.tint[0], top[0], topMix), tg = lerp(options.tint[1], top[1], topMix), tb = lerp(options.tint[2], top[2], topMix);
      // the wood inside the crown stands in the leaves' shade (the near trunks receive no cascade shadow — their
      // stability rule — so the canopy's occlusion is baked: the deeper in the crown, the darker the limb)
      const cdx = node.x - skeleton.crown.x, cdy = (node.y - skeleton.crown.y) * 1.2, cdz = node.z - skeleton.crown.z;
      const inner = skeleton.leaves.length ? clamp01(1 - Math.hypot(cdx, cdy, cdz) / skeleton.crown.r) : 0;
      const shade = ground * branchTint * (branch.order >= 2 ? 0.92 : 1) * (1 - 0.5 * inner * inner * (3 - 2 * inner));
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
      for (let j = 0; j <= s; j++) void j;
      (row as unknown as { meta: number[] }).meta = [along, tr * shade, tg * shade, tb * shade, node.flex];
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
          col.push(m[1], m[2], m[3]);
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
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nrm), 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uv), 2));
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(col), 3));
  geometry.setAttribute('aFlex', new THREE.BufferAttribute(new Float32Array(flex), 1));
  return geometry;
}

export interface CardEmitOptions {
  /** The card tint: hue/sat around the species palette (HSL, sRGB), and the lightness the shade law starts from. */
  tint(shade: number, site: LeafSite, rng: Rng): readonly [number, number, number];
  /** Atlas tiles per side (2 = a 2×2 atlas). */
  tiles: number;
  rng: Rng;
  /** Volume normal share (0 = the card's own face, 1 = the crown sphere) and the up bias. */
  volume?: number;
  upBias?: number;
}

/**
 * The foliage as one flat geometry: per leaf site a spray card seated with its stem end ON the branch (a few
 * centimetres inside it), reaching along the site's axis, bent along its length; 2 × 2 triangles. Attributes:
 * position, normal (a blend of the card's face, turned outward, and the crown sphere's normal at the vertex, with an
 * up bias — the crown lights as a volume and still shows the sprays' facets), uv (the site's tile of the atlas, stem
 * at v = 0), color (the tint), aFlex, aCard (the site's centre and the crown radius — the cascade sample).
 */
export function emitLeafCards(skeleton: TreeSkeleton, options: CardEmitOptions): THREE.BufferGeometry {
  const tiles = Math.max(1, options.tiles | 0);
  const volume = options.volume ?? 0.62, upBias = options.upBias ?? 0.32;
  const { crown } = skeleton;
  const count = skeleton.leaves.length;
  const pos = new Float32Array(count * 12 * 3), nrm = new Float32Array(count * 12 * 3), uv = new Float32Array(count * 12 * 2);
  const col = new Float32Array(count * 12 * 3), flex = new Float32Array(count * 12), card = new Float32Array(count * 12 * 4);
  let o = 0;
  for (const site of skeleton.leaves) {
    const axis = v3(site.ax, site.ay, site.az), face = v3(site.nx, site.ny, site.nz);
    const right = norm(cross(axis, face));
    const tileX = site.tile % tiles, tileY = Math.floor(site.tile / tiles) % tiles;
    const u0 = tileX / tiles, v0 = 1 - (tileY + 1) / tiles;
    const du = 1 / tiles, dv = 1 / tiles;
    const [cr, cg, cb] = options.tint(site.shade, site, options.rng);
    // three rows along the card (stem, middle, tip); the bend droops the outer rows under gravity
    const rows: V3[][] = [];
    for (let r = 0; r < 3; r++) {
      const t = r / 2;
      const along = -0.06 * site.length + t * site.length;
      const sag = site.bend * site.length * t * t;
      const cx = site.x + axis.x * along, cy = site.y + axis.y * along - sag, cz = site.z + axis.z * along;
      const half = site.width * 0.5 * (r === 0 ? 0.55 : r === 1 ? 1 : 0.9);
      rows.push([v3(cx - right.x * half, cy - right.y * half, cz - right.z * half), v3(cx + right.x * half, cy + right.y * half, cz + right.z * half)]);
    }
    const centre = v3(site.x + axis.x * site.length * 0.45, site.y + axis.y * site.length * 0.45, site.z + axis.z * site.length * 0.45);
    const faceOut = dot(face, norm(v3(centre.x - crown.x, centre.y - crown.y, centre.z - crown.z))) < 0 ? v3(-face.x, -face.y, -face.z) : face;
    const writeVertex = (p: V3, u: number, v: number): void => {
      const sx = p.x - crown.x, sy = (p.y - crown.y) * 0.75, sz = p.z - crown.z;
      const sl = Math.hypot(sx, sy, sz) || 1;
      let nx = (sx / sl) * volume + faceOut.x * (1 - volume);
      let ny = (sy / sl) * volume + faceOut.y * (1 - volume) + upBias;
      let nz = (sz / sl) * volume + faceOut.z * (1 - volume);
      const nl = Math.hypot(nx, ny, nz) || 1;
      nx /= nl; ny /= nl; nz /= nl;
      pos[o * 3] = p.x; pos[o * 3 + 1] = p.y; pos[o * 3 + 2] = p.z;
      nrm[o * 3] = nx; nrm[o * 3 + 1] = ny; nrm[o * 3 + 2] = nz;
      uv[o * 2] = u0 + u * du; uv[o * 2 + 1] = v0 + v * dv;
      col[o * 3] = cr; col[o * 3 + 1] = cg; col[o * 3 + 2] = cb;
      flex[o] = site.flex * (0.75 + 0.25 * v);
      card[o * 4] = centre.x; card[o * 4 + 1] = centre.y; card[o * 4 + 2] = centre.z; card[o * 4 + 3] = crown.r;
      o++;
    };
    for (let r = 0; r < 2; r++) {
      const a = rows[r], b = rows[r + 1];
      const va = r / 2, vb = (r + 1) / 2;
      writeVertex(a[0], 0, va); writeVertex(a[1], 1, va); writeVertex(b[1], 1, vb);
      writeVertex(a[0], 0, va); writeVertex(b[1], 1, vb); writeVertex(b[0], 0, vb);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geometry.setAttribute('aFlex', new THREE.BufferAttribute(flex, 1));
  geometry.setAttribute('aCard', new THREE.BufferAttribute(card, 4));
  return geometry;
}

/**
 * The crown's shadow caster: position-only, the stem and scaffold wood as five-sided tubes and the foliage as a
 * handful of low ellipsoids fitted to clusters of spray seats (the masses a sun shadow resolves at the cascades'
 * texel sizes — the near crown's own shape, not a generic lobe). Flat triangles.
 */
export function emitCrownShadowHull(skeleton: TreeSkeleton, clusters = 8): Float32Array {
  const out: number[] = [];
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
      for (let v = 0; v < ip.count; v++) {
        out.push(centres[i].x + ip.getX(v) * ex * 0.92, centres[i].y + ip.getY(v) * ey * 0.85, centres[i].z + ip.getZ(v) * ez * 0.92);
      }
    }
    ico.dispose();
  }
  return new Float32Array(out);
}

/** Triangle counts of a grown tree's two geometries (receipts and the lane's budget table). */
export function growthBudget(wood: THREE.BufferGeometry, cards: THREE.BufferGeometry): { woodTris: number; cardTris: number } {
  const tris = (g: THREE.BufferGeometry): number => (g.index ? g.index.count : g.getAttribute('position').count) / 3;
  return { woodTris: tris(wood), cardTris: tris(cards) };
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
