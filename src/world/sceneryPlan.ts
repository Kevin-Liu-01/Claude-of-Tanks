// src/world/sceneryPlan.ts — the scenery lane's authoring contract and footprints (2026-10-03), renderer-free.
//
// A map names its landscape features and landmarks in a top-level `scenery` block (world/scenery.ts builds them;
// docs/MAP-LAYOUT-BRIEF.md "Scenery" is the guide). This module holds what the vegetation needs before the props
// exist — every feature's footprint from the config alone — so the trees keep off a tor or a calvary without
// importing a renderer. The landmark radii below are the kit's (maps/sceneryKit.ts SCENERY_DESTRUCTIBLE_TYPES r);
// world/scenery.selftest.mjs holds them equal.
import type { StructureClearance } from './vegetationClearance.ts';

export type RockGeology = 'granite' | 'sandstone' | 'limestone' | 'slate';
/**
 * The rock forms: what made the rock decides its shape. The last three are rock that people shaped — a standing stone,
 * a clearance cairn, a granite calvary — built through the same pipeline so they weather with the map's rock.
 */
export type RockForm = 'tor' | 'outcrop' | 'crag' | 'pavement' | 'scree' | 'hoodoo' | 'menhir' | 'cairn' | 'calvary';

/** A rock formation as a map authors it. */
interface SceneryRock {
  form: RockForm;
  geology: RockGeology;
  x: number;
  z: number;
  /** Footprint radius of the standing mass (pavement and scree: of the field / fan). */
  radius: number;
  /** Height of the standing mass above its lowest ground. */
  height: number;
  /** Strike of the joints / beds / plates, degrees from +X toward +Z. */
  yawDeg?: number;
  /** Loose stone shed round the foot (0 none, 1 the form's default). */
  shed?: number;
  /** sRGB HSL base tone; omitted, the geology's own. */
  tone?: readonly [number, number, number];
  name?: string;
}

/** The destructible landmark kinds (maps/sceneryKit.ts). */
type SceneryDestructibleKind = 'bildstock' | 'waysidecross' | 'orthodoxcross' | 'windpump' | 'tomb' | 'strawstack';
/** The landmark kinds: stone ones are rock forms, the rest the kit's destructibles. */
type SceneryLandmarkKind = 'calvary' | 'menhir' | 'cairn' | SceneryDestructibleKind;

interface SceneryLandmark {
  kind: SceneryLandmarkKind;
  x: number;
  z: number;
  yawDeg?: number;
  /** Destructibles: uniform scale. Stone landmarks: size (calvary base half-width, menhir width, cairn radius). */
  scale?: number;
  /** Stone landmarks: height override. */
  height?: number;
  geology?: RockGeology;
  name?: string;
}

interface SceneryPowerLine {
  /** Tower stations, in order; consecutive towers carry one span. */
  towers: ReadonlyArray<readonly [number, number]>;
  heightM?: number;
  name?: string;
}

/**
 * A rock field: the exposed bedrock of a hillside, scattered by the generator — small pavements, low bedded ledges,
 * crags or tors, each where the ground admits it, on the slopes first. It takes no trees (it keeps off them) and its
 * pieces stay clear of each other, the roads, the water, the pads and every solid.
 */
interface SceneryRockField {
  geology: RockGeology;
  /** The field: a disc. */
  x: number;
  z: number;
  radius: number;
  /** Formations to place. */
  count: number;
  /** The forms drawn, with weights (default: the geology's own mix). */
  forms?: ReadonlyArray<readonly [RockForm, number]>;
  /** Formation radius range, metres. */
  size?: readonly [number, number];
  /** 0: anywhere in the disc; 1: the steeper ground only. */
  slopeBias?: number;
  /** Discs [x, z, r] the field leaves bare (a dune is steep but it is sand). */
  avoid?: ReadonlyArray<readonly [number, number, number]>;
  tone?: readonly [number, number, number];
  name?: string;
}

/**
 * A hedgerow: the shrubs of a field boundary or a bocage bank, planted along a line (the bank's crest). The vegetation
 * grows it from the map's bush species, two staggered rows of overlapping shrubs with gateways; it conceals like any
 * bush (a hedge is cover) and blocks nothing.
 */
interface SceneryHedgerow {
  /** The line, as [x, z] stations. */
  path: ReadonlyArray<readonly [number, number]>;
  /** Gateways: fractions along the line where a 5 m gap stands. */
  gates?: readonly number[];
  /** Height class: 1 a trimmed field hedge (about 2.5 m), 1.4 an overgrown bocage hedge (about 3.5 m). */
  height?: number;
  name?: string;
}

export interface SceneryConfig {
  rocks?: readonly SceneryRock[];
  rockFields?: readonly SceneryRockField[];
  hedgerows?: readonly SceneryHedgerow[];
  landmarks?: readonly SceneryLandmark[];
  powerLines?: readonly SceneryPowerLine[];
}

/** The geologies' default field mixes: what a hillside of that rock shows. */
export const FIELD_FORMS: Readonly<Record<RockGeology, ReadonlyArray<readonly [RockForm, number]>>> = Object.freeze({
  granite: [['tor', 0.35], ['outcrop', 0.15], ['scree', 0.2], ['cairn', 0], ['pavement', 0.3]],
  sandstone: [['outcrop', 0.65], ['scree', 0.2], ['pavement', 0.15]],
  limestone: [['pavement', 0.55], ['outcrop', 0.35], ['scree', 0.1]],
  slate: [['crag', 0.55], ['scree', 0.45]],
});

/** The map-level contract: a top-level `scenery` block beside terrain / vegetation / props. */
export interface SceneryMapConfig {
  scenery?: SceneryConfig;
}

/** The stone landmarks' default forms and sizes. */
export const STONE_LANDMARKS: Readonly<Record<'calvary' | 'menhir' | 'cairn', { form: RockForm; geology: RockGeology; radius: number; height: number }>> = Object.freeze({
  calvary: { form: 'calvary', geology: 'granite', radius: 1.6, height: 5.6 },
  menhir: { form: 'menhir', geology: 'granite', radius: 1.2, height: 4.2 },
  cairn: { form: 'cairn', geology: 'limestone', radius: 3.6, height: 2.4 },
});

/** The destructible landmarks' record radii at scale 1 (the kit's `r`). */
export const LANDMARK_RADIUS: Readonly<Record<SceneryDestructibleKind, number>> = Object.freeze({
  bildstock: 0.5, waysidecross: 0.75, orthodoxcross: 0.65, windpump: 2.4, tomb: 1.9, strawstack: 1.6,
});

/** A pylon's leg half-spread at its height (maps/sceneryKit.ts buildPylon: 4.2 m at 34 m). */
export function pylonLegHalf(heightM = 34): number {
  return 4.2 * (heightM / 34);
}

export function isStoneLandmark(kind: string): kind is keyof typeof STONE_LANDMARKS {
  return Object.prototype.hasOwnProperty.call(STONE_LANDMARKS, kind);
}

export function isDestructibleLandmark(kind: string): kind is SceneryDestructibleKind {
  return Object.prototype.hasOwnProperty.call(LANDMARK_RADIUS, kind);
}

/** How far a formation's standing ground reaches from its centre (a tor's clitter-free shoulders included). */
export function rockReach(rock: Pick<SceneryRock, 'form' | 'radius'>): number {
  return rock.radius * (rock.form === 'tor' ? 1.2 : 1);
}

/**
 * The vegetation keep-out of a map's scenery, from its config alone (vegetation builds before props): every rock
 * formation's standing ground and every landmark's footprint, with a working margin. A map without scenery gets none,
 * and its vegetation is exact.
 */
export function sceneryClearances(scenery: SceneryConfig | null | undefined): StructureClearance[] {
  if (!scenery) return [];
  const out: StructureClearance[] = [];
  const disc = (x: number, z: number, r: number) => out.push({ x, z, halfWidth: r, halfLength: r, cos: 1, sin: 0 });
  for (const rock of scenery.rocks ?? []) {
    // a pavement or a scree fan is ground a tree may stand at the edge of; a standing mass is not
    const margin = rock.form === 'pavement' || rock.form === 'scree' ? 0 : 1.5;
    disc(rock.x, rock.z, rockReach(rock) + margin);
  }
  for (const mark of scenery.landmarks ?? []) {
    const r = isDestructibleLandmark(mark.kind) ? LANDMARK_RADIUS[mark.kind] * (mark.scale ?? 1)
      : (mark.scale ?? STONE_LANDMARKS[mark.kind].radius) * (mark.kind === 'calvary' ? 1.15 : 1);
    disc(mark.x, mark.z, r + 1.2);
  }
  for (const line of scenery.powerLines ?? []) {
    for (const [x, z] of line.towers) disc(x, z, pylonLegHalf(line.heightM) * 1.1 + 1.5);
  }
  return out;
}

/** One hedge shrub: where it stands, its uniform scale, its height factor, its yaw and its tint draws. */
interface HedgeShrub {
  x: number;
  z: number;
  scale: number;
  hy: number;
  yaw: number;
  tint: readonly [number, number, number, number];
}

function hedgeRng(a: number): () => number {
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/**
 * Lay a map's hedgerows: shrubs every 1.9 m (3 m on the phones) in two rows staggered 0.55 m either side of the line,
 * gateways cut where authored and a rare natural gap, each hedge from its own stream so editing one never moves
 * another. Pure geometry: the vegetation applies the ground's admission (roads, water, pads, keep-outs).
 */
export function planHedgerows(hedgerows: readonly SceneryHedgerow[] | null | undefined, seed: number, mobile = false): HedgeShrub[] {
  const out: HedgeShrub[] = [];
  (hedgerows ?? []).forEach((hedge, index) => {
    const rng = hedgeRng(seed + 17401 + 131 * index);
    const step = mobile ? 3.0 : 1.9;
    const height = hedge.height ?? 1.2;
    let total = 0;
    const legs: Array<[number, number, number, number, number]> = [];
    for (let i = 1; i < hedge.path.length; i++) {
      const [ax, az] = hedge.path[i - 1], [bx, bz] = hedge.path[i];
      const len = Math.hypot(bx - ax, bz - az);
      legs.push([ax, az, bx, bz, len]);
      total += len;
    }
    const gates = (hedge.gates ?? []).map((f) => f * total);
    let along = 0, row = 0;
    for (const [ax, az, bx, bz, len] of legs) {
      const ux = (bx - ax) / (len || 1), uz = (bz - az) / (len || 1);
      for (let d = (along === 0 ? 0.6 : 0); d < len; d += step * (0.85 + rng() * 0.3)) {
        const at = along + d;
        const gapRoll = rng(), jitter = (rng() - 0.5) * 0.8, side = (row++ % 2 ? 1 : -1) * (0.45 + rng() * 0.2);
        const scale = (1.15 + rng() * 0.55) * height, hy = 0.9 + rng() * 0.35, yaw = rng() * Math.PI * 2;
        const tint = [rng(), rng(), rng(), rng()] as const;
        if (gates.some((g) => Math.abs(g - at) < 2.6)) continue;
        if (gapRoll < 0.035) continue;
        out.push({ x: ax + ux * (d + jitter) - uz * side, z: az + uz * (d + jitter) + ux * side, scale, hy, yaw, tint });
      }
      along += len;
    }
  });
  return out;
}

/** A disc of ground the grass, the litter and the tall grass keep off (a pavement's clints, a scree fan's stones). */
export interface GroundCoverHole {
  x: number;
  z: number;
  r: number;
}

/**
 * Wrap a ground-cover admission (world/groundCoverClearance.ts) with the scenery's holes: no blade grows up through a
 * clint or a scree stone. A world without holes keeps the admission it had.
 */
export function withGroundCoverHoles<T extends (x: number, y: number, z: number, height: number, radius: number) => boolean>(
  blocked: T, holes: readonly GroundCoverHole[] | null | undefined,
): T {
  if (!holes?.length) return blocked;
  return ((x: number, y: number, z: number, height: number, radius: number) => {
    if (blocked(x, y, z, height, radius)) return true;
    for (const hole of holes) {
      const dx = x - hole.x, dz = z - hole.z, rr = hole.r + radius;
      if (dx * dx + dz * dz < rr * rr) return true;
    }
    return false;
  }) as T;
}
