// src/world/hinterland/spec.ts — the Hinterland's authored block and its resolution (HL-0, the horizons stream,
// 2026-10-13; B-architecture §4.0).
//
// A map moves to the Hinterland when its file carries a `hinterland` block (§7.1); until then it keeps the old ring
// byte for byte. The block is compact because the region (regions.ts) supplies the rest: the place line, the region,
// and only what the map's own place needs — the outland's settlements and woods, the landforms of the near ranges in
// world terms, its water, its far sectors and its named landmarks, with any envelope exception recorded by its place.
// resolveHinterlandSpec fills every default so the field, the planner, the tools and the receipts read one complete
// spec. Pure: no THREE, no DOM.
//
// Compass: +x east, +z north; a bearing (azDeg) is clockwise from north (0 north, 90 east), as SeaOpening.azimuthDeg;
// a point at bearing a and distance d from the map's centre is (d sin a, d cos a).
import {
  HINTERLAND_MAP_REGIONS, HINTERLAND_REGIONS,
  type HinterlandFarForm, type HinterlandGeology, type HinterlandRegion, type HinterlandRegionId, type HinterlandVerticalKind,
} from './regions.ts';

export type { HinterlandFarForm, HinterlandRegionId, HinterlandVerticalKind } from './regions.ts';

/** A place past the edge by bearing and distance from the centre. */
export interface HinterlandAt { azDeg: number; distM: number }

/** The envelope criteria a map may sit outside of, for a reason recorded from its reference place (PLAN §1.1). */
export type HinterlandCriterion = 'P1' | 'C1' | 'C2' | 'C3' | 'C4' | 'C5' | 'C6' | 'C7' | 'C8' | 'C9' | 'C10';

/** The near ranges' landform primitives (§4.5), in world terms. */
export type HinterlandLandformKind =
  | 'ridge' | 'massif' | 'escarpment' | 'mesa' | 'butte' | 'inselberg' | 'canyon' | 'cone' | 'jebel' | 'caldera'
  | 'valley' | 'notch' | 'dam' | 'dike' | 'frozenRing';

export interface HinterlandLandformConfig {
  kind: HinterlandLandformKind;
  /** Its centre (a dike's or a ridge's midpoint). */
  at: HinterlandAt;
  /** Its height (m above the map's ground; negative for valleys and notches). */
  heightM: number;
  /** Along its strike (ridges, escarpments, dikes, valleys) or its radius's diameter (cones, massifs). */
  lengthM?: number;
  /** Across it (the base width of a ridge or a dike; a massif's or a cone's diameter when lengthM is unset). */
  widthM?: number;
  /** The strike's bearing (deg). */
  strikeDeg?: number;
  /** The landform's own geology over the region's (strata, snow and gullies where the place differs). */
  geology?: Partial<Pick<HinterlandGeology, 'rock' | 'rockHex' | 'scree' | 'gullies' | 'erosion' | 'rockSlopeDeg'>> & {
    strata?: Partial<HinterlandGeology['strata']>; snow?: Partial<HinterlandGeology['snow']>;
  };
  /** Its cover: forest between these heights (m above its foot), bare above. */
  cover?: { forest?: readonly [number, number]; bare?: boolean };
  /** A dike's crown: a road on it, a row of trees on it (species), and the crown's width (m). */
  crown?: { road?: boolean; trees?: string; widthM?: number };
  /** A caldera's floor as a share of its rim's height (default 0.08); 0 where the battlefield stands on the floor, so
   * the floor carries on level from the edge to the inner wall's foot (Obsidian Caldera, HZ.20). */
  floor?: number;
  /** A caldera's inner wall: the share of its radius the wall rises over below the rim (default 0.12); narrower, steeper. */
  wall?: number;
  /** A massif's main summit, authored: its place along the strike (-1..1 of the half-length) and its share of the
   * height (default 0.5), a shoulder either side of it; the crest falls from it to both ends — a mountain with its
   * summit and shoulders, not a table (round 4, Mont Froid from edge-w). */
  peak?: { along: number; share?: number;
    /** One side of the summit steeper than the other by this factor (1 symmetric): an offset summit block, not a cone. */
    asym?: number;
    /** A gendarme: a rock tower on the summit's ridge a little way along the crest. */
    gendarme?: boolean;
    /** false: the mass keeps its level crest (a wall with its summit on it); default, the crest falls from the summit
     * to both ends (a mountain with its shoulders). */
    tent?: boolean };
  /** A massif's headwall: on its side facing the map, a cliff band this tall rising from just above its talus apron
   * (round 5, the critics: "a dark headwall over 60° in the lower 250–400 m behind Les Tavernettes"). */
  headwall?: { heightM: number };
  /** A massif's couloirs: this many snow-filled gullies down its face toward the map, each over a debris fan. */
  couloirs?: number;
  /** A ridge's crest notched into minor peaks and cols (round 5, edge-s: "the crest is flat at one height"). */
  notched?: boolean;
  name?: string;
}

export type HinterlandWaterKind = 'river' | 'sea' | 'lake' | 'flood' | 'canal';

export type HinterlandSeason = 'spring' | 'summer' | 'autumn' | 'lateAutumn' | 'winter';
/** The broadleaves' foliage left in a season (0 bare … 1 full). */
export const HINTERLAND_SEASON_LEAF: Readonly<Record<HinterlandSeason, number>> = Object.freeze({
  spring: 0.7, summer: 1, autumn: 0.75, lateAutumn: 0.3, winter: 0.04,
});

export interface HinterlandWaterConfig {
  kind: HinterlandWaterKind;
  /** A river or canal leaving the square by an exit ('exit:n' … or 'edge'), running toward a bearing. */
  from?: string;
  toAzDeg?: number;
  /** Explicit centreline points (bearing, distance) for a river or a canal. */
  path?: readonly HinterlandAt[];
  /** A river's or a canal's width; a sea's channel width (its far shore that far beyond the coast; unset: open sea). */
  widthM?: number;
  /** The bearings a sea or a flood lies toward (clockwise from the first to the second): its middle is the coast's
   * normal. The water is a coast in the world — a line square to that normal, wandering along its length — never a
   * radial sector (a sector's ends drew right-angle shores, D9). */
  arc?: { azDeg: readonly [number, number] };
  /** The coast's (a flood's edge's) distance from the centre along the normal (m), and how far it wanders. */
  coastM?: number;
  coastWanderM?: number;
  /** A lake's centre and radius. */
  at?: HinterlandAt;
  radiusM?: number;
  /** The water level (m, the map's datum). A flood fills every hollow under it inside its arc. */
  level?: number;
  /** 0..1: a sea's ice cover — a polar sea's pack: snow-covered floes, grey new ice and dark leads between (HOR-05,
   * Whiteout's Davis Strait); 0 open water. */
  ice?: number;
  name?: string;
}

export interface HinterlandFarSectorConfig {
  azDeg: readonly [number, number];
  distKm: readonly [number, number];
  reliefM: number;
  form: HinterlandFarForm;
  layers?: number;
  name?: string;
}

export interface HinterlandLandmarkConfig {
  kind: HinterlandVerticalKind;
  at?: HinterlandAt;
  /** A line feature (a pylon line) leaving by an exit ('exit:e') or the edge, along this bearing. */
  from?: string;
  azDeg?: number;
  heightM?: number;
  name?: string;
}

export interface HinterlandTownConfig { azDeg: number; distM: number; size: 'small' | 'medium' | 'large'; name?: string }
/** A village on a sightline; `towerM` its church tower's height (a landmark must clear the dyke rows before it). */
export interface HinterlandVillageAt {
  azDeg: number; distM: number; name?: string; towerM?: number;
  /** Its buildings (default: the kit's village size). */
  buildings?: number;
  /** A near village's tower, read at a few hundred metres: slim (a ninth to an eleventh of its height wide each side),
   * pale-rendered, its spire a third of it — not the far landmark's stout stage (a seventh). */
  slim?: boolean;
}

/** The block a map file carries (B-architecture §4.0). */
export interface HinterlandConfig {
  /** P1: the real place and period, shown in the envelope table. */
  place: string;
  region: HinterlandRegionId;
  /** Lab only: the block draws only under `?hinterland=1` (the parity lab and drafts); production keeps the old ring. */
  lab?: boolean;
  /** The season the place is shown in (the trees' foliage: a November polder's crowns mostly bare). Default summer. */
  season?: HinterlandSeason;
  outland?: {
    /** The outland's relief; `arcs` scale it on bearings (a quiet arc, scale < 1: Whiteout's plateau running smooth
     * to its fall over Davis Strait, so the eye reaches the pack ice; HOR-05). */
    relief?: { riseM?: readonly [number, number]; wavelengthM?: number; arcs?: readonly { azDeg: readonly [number, number]; scale: number }[] };
    settle?: {
      villages?: number; hamlets?: number; farms?: number; works?: number; town?: HinterlandTownConfig | null;
      /** Villages placed on the sightlines (each with its church: a landmark at middle distance for every eye view —
       * the coordinator on the pilot, "place villages with spires at 1–3 km on the main sightlines"); they count
       * toward `villages`, the planner places the rest. */
      villagesAt?: readonly HinterlandVillageAt[];
    };
    woods?: number;
    hedges?: number;
    fields?: number;
    /** Cross-roads between the settlements beyond the exits. */
    links?: number;
  };
  landforms?: readonly HinterlandLandformConfig[];
  water?: readonly HinterlandWaterConfig[];
  far?: readonly HinterlandFarSectorConfig[];
  landmarks?: readonly HinterlandLandmarkConfig[];
  exceptions?: Partial<Record<HinterlandCriterion, string>>;
}

/** What resolveHinterlandSpec reads from a map config (a structural subset of the map's config). */
export interface HinterlandMapConfig {
  id?: string;
  /** The map's block, or `true`: the block authored with the Hinterland (its draft, hinterland/drafts — the map file
   * holds only the switch, so the host Worker never imports a draft); select.ts resolves it. */
  hinterland?: HinterlandConfig | true;
  /** (read loosely: a map config's blocks carry far more than the spec reads) */
  terrain?: unknown;
  sky?: unknown;
  props?: unknown;
}
const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

export interface HinterlandSettleSpec {
  villages: number; hamlets: number; farms: number; works: number; perVillage: readonly [number, number];
  town: HinterlandTownConfig | null;
  villagesAt: readonly HinterlandVillageAt[];
}

/** The resolved spec: the region's defaults under the map's overrides, every value present. */
export interface HinterlandSpec {
  mapId: string;
  place: string;
  region: HinterlandRegion;
  lab: boolean;
  season: HinterlandSeason;
  /** The building kit the settlements use (the map's own `props.architecture` first, then the region's). */
  kit: string | null;
  outland: {
    riseM: readonly [number, number]; wavelengthM: number; flat: boolean;
    reliefArcs: readonly { azDeg: readonly [number, number]; scale: number }[];
    woods: number; hedges: number; fields: number; links: number;
    settle: HinterlandSettleSpec;
  };
  geology: HinterlandGeology;
  landforms: readonly HinterlandLandformConfig[];
  water: readonly HinterlandWaterConfig[];
  far: readonly HinterlandFarSectorConfig[];
  landmarks: readonly HinterlandLandmarkConfig[];
  exceptions: Partial<Record<HinterlandCriterion, string>>;
  /** The map's rim (C9) and fog (C7), as the envelope reads them. */
  rimH: number;
  fogDensity: number;
  /** The far land's extent (m): the true limb at 80 km on desktop (§4.2), 48 km on phones (§4.8). */
  extentM: number;
}

const mid = (range: readonly [number, number]): number => Math.round((range[0] + range[1]) / 2);

/** True when a map config migrates to the Hinterland on this page: its block, unless lab-only or overridden off. */
export function hinterlandActive(cfg: HinterlandMapConfig | null | undefined, search?: string | null): boolean {
  const override = hinterlandOverride(search);
  if (!cfg?.hinterland) return false;
  if (override === false) return false;
  if (cfg.hinterland !== true && cfg.hinterland.lab) return override === true;
  return true;
}

/** The lab override `?hinterland=1|0` (QA only; production follows the map file). null when absent. */
export function hinterlandOverride(search?: string | null): boolean | null {
  const s = search ?? (typeof location !== 'undefined' ? location.search ?? '' : '');
  const m = /[?&]hinterland=([01])(?:&|$)/.exec(s);
  return m ? m[1] === '1' : null;
}

/**
 * Resolve a map's hinterland block against its region (null when the map has no block). `tier` 'mobile' takes the
 * phones' extent (§4.8); everything else is the same spec.
 */
export function resolveHinterlandSpec(cfg: HinterlandMapConfig | null | undefined, tier: 'desktop' | 'mobile' = 'desktop'): HinterlandSpec | null {
  const block = cfg?.hinterland;
  // (`true` is the switch: withSelectedHinterland puts the block itself in place before this reads it)
  if (!block || block === true) return null;
  const region = HINTERLAND_REGIONS[block.region];
  if (!region) throw new Error(`hinterland: unknown region '${String(block.region)}' on map '${cfg?.id ?? '?'}'`);
  const o = block.outland ?? {};
  const settle = o.settle ?? {};
  const d = region.density;
  return {
    mapId: cfg?.id ?? 'unknown',
    place: block.place,
    region,
    lab: block.lab === true,
    season: block.season ?? 'summer',
    kit: (typeof (cfg?.props as { architecture?: unknown } | undefined)?.architecture === 'string'
      ? (cfg!.props as { architecture: string }).architecture : null) ?? region.kit,
    outland: {
      riseM: o.relief?.riseM ?? region.outland.riseM,
      wavelengthM: o.relief?.wavelengthM ?? region.outland.wavelengthM,
      flat: region.outland.flat,
      reliefArcs: o.relief?.arcs ?? [],
      woods: o.woods ?? region.vegetation.woods,
      hedges: o.hedges ?? region.vegetation.hedges,
      fields: o.fields ?? region.fields,
      links: o.links ?? 2,
      settle: {
        villages: settle.villages ?? mid(d.villages),
        hamlets: settle.hamlets ?? mid(d.hamlets),
        farms: settle.farms ?? mid(d.farms),
        works: settle.works ?? mid(d.works),
        perVillage: d.perVillage,
        town: settle.town ?? null,
        villagesAt: settle.villagesAt ?? [],
      },
    },
    geology: region.geology,
    landforms: block.landforms ?? [],
    water: block.water ?? [],
    far: block.far ?? [{ azDeg: [0, 360], distKm: region.far.distKm, reliefM: region.far.reliefM, form: region.far.form, layers: region.far.layers }],
    landmarks: block.landmarks ?? [],
    exceptions: { ...(block.exceptions ?? {}) },
    rimH: num((cfg?.terrain as { rimH?: unknown } | undefined)?.rimH) ?? 24,
    fogDensity: num((cfg?.sky as { fogDensity?: unknown } | undefined)?.fogDensity) ?? 0.00062,
    extentM: tier === 'mobile' ? 48_000 : 80_000,
  };
}

/** The region a map would start from (its block's, else B-architecture's first-pass table). */
export function hinterlandRegionFor(cfg: HinterlandMapConfig | null | undefined): HinterlandRegion | null {
  const id = (cfg?.hinterland === true ? undefined : cfg?.hinterland?.region) ?? (cfg?.id ? HINTERLAND_MAP_REGIONS[cfg.id] : undefined);
  return id ? HINTERLAND_REGIONS[id] ?? null : null;
}

/** World XZ of a bearing and distance from the centre. */
export function hinterlandPoint(at: HinterlandAt, out: { x: number; z: number } = { x: 0, z: 0 }): { x: number; z: number } {
  const a = at.azDeg * Math.PI / 180;
  out.x = at.distM * Math.sin(a);
  out.z = at.distM * Math.cos(a);
  return out;
}

/** The compass bearing (deg, 0..360) of a world point from the centre. */
export function hinterlandBearing(x: number, z: number): number {
  return ((Math.atan2(x, z) * 180 / Math.PI) % 360 + 360) % 360;
}

/** True when a bearing lies inside an arc [a, b] taken clockwise from a (a 0–360 arc is everything). */
export function bearingInArc(azDeg: number, arc: readonly [number, number]): boolean {
  const span = ((arc[1] - arc[0]) % 360 + 360) % 360 || (arc[1] !== arc[0] ? 360 : 0);
  if (span >= 360) return true;
  const off = ((azDeg - arc[0]) % 360 + 360) % 360;
  return off <= span;
}

/** 0..1: how deep inside an arc a bearing lies, easing to 0 over `featherDeg` at its ends (1 inside, 0 outside). */
export function arcWeight(azDeg: number, arc: readonly [number, number], featherDeg: number): number {
  const span = ((arc[1] - arc[0]) % 360 + 360) % 360 || (arc[1] !== arc[0] ? 360 : 0);
  if (span >= 360) return 1;
  const off = ((azDeg - arc[0]) % 360 + 360) % 360;
  if (off > span + featherDeg && off < 360 - featherDeg) return 0;
  const inside = off <= span ? Math.min(off, span - off) : -Math.min(off - span, 360 - off);
  const t = Math.max(0, Math.min(1, (inside + featherDeg) / (2 * featherDeg)));
  return t * t * (3 - 2 * t);
}
