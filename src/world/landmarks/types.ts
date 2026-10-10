// src/world/landmarks/types.ts — the contract of the set-piece library (the landmarks lane, 2026-10-05).
//
// A map names its set pieces in `props.landmarks` (one entry per piece: a kind, a place, a heading and the kind's own
// parameters); src/world/landmarks/compose.ts places them after the settlement stands and before every scatter pass, so
// the clutter, the rocks and the field dressing keep off them and nothing already placed moves. A builder draws the
// piece in its own frame (x across, y up, z out of its front, the ground at y = 0) into the regional kits' part sink
// (maps/regional/geometry.ts), so a set piece is the region's masonry, render and roofing under the same weathering and
// merges into the same material buckets as the houses: no draw call of its own.
import type { SimpleCollisionShape } from '../collision.ts';
import type { RegionalParts } from '../maps/regional/geometry.ts';
import type { WeatherTints } from '../maps/regional/weather.ts';

/** Every kind the library builds, by family. */
export type LandmarkKind =
  // bridges
  | 'stoneArchBridge' | 'trussBridge' | 'trestleBridge' | 'baileyBridge' | 'viaduct' | 'liftBridge'
  // monuments
  | 'obelisk' | 'columnMonument' | 'memorialWall' | 'statue' | 'equestrianStatue'
  // parks and squares
  | 'fountain' | 'bandstand' | 'parkGate' | 'parkSquare' | 'churchyard' | 'path' | 'garden' | 'stairway'
  // gates and arches
  | 'townGate' | 'triumphalArch' | 'kolkhozArch' | 'torii'
  // towers
  | 'belfry' | 'campanile' | 'waterTower' | 'fireLookout' | 'windmill' | 'valveTower'
  // civic buildings
  | 'church' | 'townHall' | 'stationHall' | 'marketHall' | 'grainElevator' | 'granary'
  // a hill station's colonial pieces
  | 'colonialBungalow' | 'tennisCourt'
  // temples
  | 'bengalTemple'
  // village works
  | 'lavoir' | 'khan'
  // harbour works
  | 'lighthouse' | 'mole' | 'quay' | 'slipway'
  // wrecks
  | 'aircraftWreck';

/** A kind's parameters: numbers (metres, counts), choices (strings) and switches. */
export type LandmarkParams = Readonly<Record<string, number | string | boolean>>;

/** One set piece as a map authors it (`props.landmarks`). */
export interface LandmarkPlacement {
  kind: LandmarkKind;
  x: number;
  z: number;
  /** The heading of the piece's front (its local +z), degrees: 0 faces +z, 90 faces +x. */
  yawDeg?: number;
  /** The kind's own parameters over its defaults (plan.ts LANDMARK_KINDS); an absent or undefined key keeps the default. */
  params?: Readonly<Record<string, number | string | boolean | undefined>>;
  /** What the receipt and the docs call it ("the station at the east level crossing"). */
  name?: string;
  /**
   * The road core's margin for this placement (m), over its kind's (plan.ts roadMargin, else 3.5): a building fronting a
   * square's paved apron stands at its edge, as the plot it takes did (the composer keeps it out of the core itself).
   */
  roadMargin?: number;
  /** A variant seed: another draw of the same kind at the same place. */
  seed?: number;
  /**
   * How the passes after the composer meet the piece's ground. 'reserve' (the default): discs in the props' placement
   * list that they keep off, drawing again round them — a piece composed with its map shapes what grows up round it.
   * 'veto': a piece set into a finished map (round 2, 2026-10-06: Frontier's square and churchyard among the
   * map-revival lane's courts): they draw as on the map without it, and what they would stand on its ground is left out
   * (props.ts), so no record of theirs moves for it.
   */
  ground?: 'reserve' | 'veto';
}

/** What a builder may read. It never draws from the props placement streams. */
export interface LandmarkBuildContext {
  kind: LandmarkKind;
  /** The authored parameters over the kind's defaults (plan.ts). */
  params: LandmarkParams;
  /** The piece's own build stream, forked from its identity (map seed, kind, place). */
  rng: () => number;
  /** A second stream for look-only choices: a new choice never reshuffles the geometry drawn after it. */
  variant: () => number;
  /**
   * A third stream for the piece's age (age.ts: spalled render, rain streaks, soot), so a piece's weathering never
   * moves its geometry or its look choices. Absent in receipts that build without the composer.
   */
  age?: () => number;
  /** 'mobile' builds leave out the finest dressing (never a structural part: the collision is tier-independent). */
  tier: 'desktop' | 'mobile';
  /** The ground's fall under the footprint (m): the plinths reach this far below the base on a slope. */
  groundFall: number;
  /**
   * The ground's height at a point of the piece's frame over its base (0 at the lowest ground under the footprint):
   * a bridge foots its piers on the bed and lays its deck to the banks. Absent in receipts that build on flat ground.
   */
  ground?: (lx: number, lz: number) => number;
  /** The map paints its masonry as brick (a kit's stone surface): a builder picks courses and dressings to suit. */
  brick: boolean;
  snowCap: boolean;
  mapId: string;
}

/** A finished piece in its own frame. */
interface LandmarkBuild {
  parts: RegionalParts;
  /**
   * The movement record's parts, in the piece's frame, when the derived ground-contact band would be wrong for it: a
   * bridge's standable deck (its top the floor a hull mounts), its piers and parapets. The shell bands (shells and sight)
   * stay derived from the geometry.
   */
  movement?: SimpleCollisionShape[];
  /** The tints of its walls and roofs (weather.ts); absent, the map kit's palette picks them as for a house. */
  tints?: Partial<WeatherTints>;
  /**
   * Street furniture that belongs to the props' destructible kinds (a platform's benches, a square's benches and lamps),
   * in the piece's frame: they join the props pools, so a hull crushes them as it crushes any other.
   */
  destructibles?: ReadonlyArray<{ kind: string; x: number; z: number; yawDeg: number; scale?: number }>;
  /** Pieces it carries (a square's centre piece), in its frame: placed after it, from streams of their own. */
  children?: readonly LandmarkPlacement[];
}

export type LandmarkBuilder = (ctx: LandmarkBuildContext) => LandmarkBuild;
