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
type SceneryDestructibleKind = 'bildstock' | 'waysidecross' | 'orthodoxcross' | 'windpump' | 'tomb' | 'strawstack' | 'lumberstack' | 'logdeck';
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
  /** Stone landmarks: sRGB HSL base tone (a map's own rock); omitted, the geology's. */
  tone?: readonly [number, number, number];
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
  /** The steepest ground a formation rests on, degrees (landformGeology.ts restsOnTalus; the mountains lane, 2026-10-04,
   *  gauntlet wave 48 on Redrock: outcrops hanging on the jebels' walls). Default TALUS_DEG (35); null: no limit. */
  talusDeg?: number | null;
  /** Discs [x, z, r] the field leaves bare (a dune is steep but it is sand). */
  avoid?: ReadonlyArray<readonly [number, number, number]>;
  /** Formations under this radius (m) take the phones' facet count on every tier (the Redrock lane, round 11e: a field
   *  of many small talus stones costs the frame what a few big blocks do; the stones' outlines and collision are the
   *  same, their facets fewer). Absent: the tier's own count. */
  leanUnder?: number;
  tone?: readonly [number, number, number];
  name?: string;
}

/**
 * Bedrock on a hill's steep flanks (sceneryRocks.ts buildBedrock): the hill's own beds, level, ringing it from the
 * highest ground a hull climbs to up to its crown, split into blocks by the vertical joints, rounded knobs on the
 * summit. A skin on ground no hull reaches: it carries no collision, and the hill under it stays the terrain.
 */
interface SceneryBedrock {
  geology: RockGeology;
  /** The hill's summit. */
  x: number;
  z: number;
  /** How far out from the summit the flanks are searched (the hill's foot). */
  radius: number;
  /** Ground steeper than this (rise over run) shows its rock: default 0.9, the steepest a hull climbs. */
  minGrade?: number;
  /** The beds' thickness range (m). */
  beds?: readonly [number, number];
  /** A bare-rock sheet over the summit (default true). */
  crown?: boolean;
  tone?: readonly [number, number, number];
  name?: string;
}

/**
 * The field boundaries' built works on the ground lane's land use (fieldWorks.ts): the dry stone walls of a karst's
 * wall boundaries, the earth banks under a bocage's hedge lines, on the very lines the terrain draws. Decor: no
 * collision. A world without the land-use hook (or a map without a field system) builds none.
 */
interface SceneryFieldWorks {
  walls?: boolean;
  banks?: boolean;
  /**
   * sRGB HSL base tones of the wall stone and the bank's earth. The wall's tone multiplies its face print (near white
   * stones, dark joints: fieldWallFace.ts), so a limestone at sRGB lightness 0.6 asks about 0.8 here.
   */
  wallTone?: readonly [number, number, number];
  bankTone?: readonly [number, number, number];
}

export interface SceneryConfig {
  rocks?: readonly SceneryRock[];
  rockFields?: readonly SceneryRockField[];
  bedrock?: readonly SceneryBedrock[];
  landmarks?: readonly SceneryLandmark[];
  powerLines?: readonly SceneryPowerLine[];
  fieldWorks?: SceneryFieldWorks;
  /**
   * A linear multiplier on the field walls' rubble print (the props `fieldStone` material): the dry-stone walls and
   * their posts in the map's own rock (Saltwind's karst limestone). Never the house masonry, which a regional kit
   * paints. Omitted, the print is the map's stone tone.
   */
  masonryTint?: readonly [number, number, number];
}

/** The share of a bedrock hill's search radius the trees keep off (its flanks and crown; its foot keeps them). */
export const BEDROCK_TREE_CLEAR = 0.72;

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
  bildstock: 0.5, waysidecross: 0.75, orthodoxcross: 0.65, windpump: 2.4, tomb: 1.9, strawstack: 1.6, lumberstack: 2.7, logdeck: 4.1,
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
 * formation's standing ground, every landmark's footprint, with a working margin, and a bedrock hill's flanks and
 * crown. A map without scenery gets none, and its vegetation is exact.
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
  for (const hill of scenery.bedrock ?? []) disc(hill.x, hill.z, hill.radius * BEDROCK_TREE_CLEAR);
  return out;
}

/** A disc of ground the grass, the litter and the tall grass keep off (a pavement's clints, a scree fan's stones). */
export interface GroundCoverHole {
  x: number;
  z: number;
  r: number;
}

/** Past this many holes the admission finds a point's holes through a grid (a kit town's wall-foot strips: thousands). */
const HOLE_GRID_MIN = 64;
const HOLE_CELL_M = 4;

/**
 * Wrap a ground-cover admission (world/groundCoverClearance.ts) with the scenery's holes: no blade grows up through a
 * clint or a scree stone. A world without holes keeps the admission it had. A long list (the regional kits' wall-foot
 * strips, facades lane 2026-10-07) is bucketed once into a uniform grid (each hole in every cell its disc overlaps), so a
 * blade tests only the holes of the cells its own disc overlaps: the same answers as the scan, at any count.
 */
export function withGroundCoverHoles<T extends (x: number, y: number, z: number, height: number, radius: number) => boolean>(
  blocked: T, holes: readonly GroundCoverHole[] | null | undefined,
): T {
  if (!holes?.length) return blocked;
  const inHole = (hole: GroundCoverHole, x: number, z: number, radius: number): boolean => {
    const dx = x - hole.x, dz = z - hole.z, rr = hole.r + radius;
    return dx * dx + dz * dz < rr * rr;
  };
  if (holes.length < HOLE_GRID_MIN) {
    return ((x: number, y: number, z: number, height: number, radius: number) => {
      if (blocked(x, y, z, height, radius)) return true;
      for (const hole of holes) if (inHole(hole, x, z, radius)) return true;
      return false;
    }) as T;
  }
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const h of holes) {
    minX = Math.min(minX, h.x - h.r); maxX = Math.max(maxX, h.x + h.r);
    minZ = Math.min(minZ, h.z - h.r); maxZ = Math.max(maxZ, h.z + h.r);
  }
  // (cells of 4 m, coarser over a spread wider than a battlefield's: at most 512 x 512 of them)
  const cellM = Math.max(HOLE_CELL_M, (maxX - minX) / 512, (maxZ - minZ) / 512);
  const nx = Math.max(1, Math.ceil((maxX - minX) / cellM)), nz = Math.max(1, Math.ceil((maxZ - minZ) / cellM));
  const cellX = (x: number) => Math.min(nx - 1, Math.max(0, Math.floor((x - minX) / cellM)));
  const cellZ = (z: number) => Math.min(nz - 1, Math.max(0, Math.floor((z - minZ) / cellM)));
  // two passes into one packed list: each cell's holes start at start[cell], in the holes' own order
  const start = new Uint32Array(nx * nz + 1);
  for (const h of holes) {
    for (let iz = cellZ(h.z - h.r); iz <= cellZ(h.z + h.r); iz++) for (let ix = cellX(h.x - h.r); ix <= cellX(h.x + h.r); ix++) start[iz * nx + ix + 1]++;
  }
  for (let i = 0; i < nx * nz; i++) start[i + 1] += start[i];
  const fill = start.slice(0, nx * nz), items = new Uint32Array(start[nx * nz]);
  holes.forEach((h, k) => {
    for (let iz = cellZ(h.z - h.r); iz <= cellZ(h.z + h.r); iz++) for (let ix = cellX(h.x - h.r); ix <= cellX(h.x + h.r); ix++) items[fill[iz * nx + ix]++] = k;
  });
  return ((x: number, y: number, z: number, height: number, radius: number) => {
    if (blocked(x, y, z, height, radius)) return true;
    if (x + radius < minX || x - radius > maxX || z + radius < minZ || z - radius > maxZ) return false;
    const ix1 = cellX(x + radius), iz1 = cellZ(z + radius);
    for (let iz = cellZ(z - radius); iz <= iz1; iz++) {
      for (let ix = cellX(x - radius); ix <= ix1; ix++) {
        const cell = iz * nx + ix;
        for (let i = start[cell]; i < start[cell + 1]; i++) if (inHole(holes[items[i]], x, z, radius)) return true;
      }
    }
    return false;
  }) as T;
}
