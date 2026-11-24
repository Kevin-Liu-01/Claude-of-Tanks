// The track prisms (TRACK-HITBOX schema, 2026-08-06; its own leaf in 276 so finalizeCombatAnatomy can attach them on every
// driver from the calibration, tools/combat-rig-measure.mjs). Pure data: no Three.js.
import type { ArmorEnvelope, ArmorPlate } from './specHelpers.ts';

type TrackModule = 'trackL' | 'trackR';
type MutableVec2Tuple = [number, number];

export interface TrackHull {
  readonly module?: TrackModule;
  readonly x0: number;
  readonly x1: number;
  readonly poly: readonly (readonly [number, number])[];
}

type TrackShapePlate = Omit<ArmorPlate, 'verts'>;

export interface TrackShape {
  readonly module: TrackModule;
  x0: number;
  x1: number;
  poly: MutableVec2Tuple[];
  readonly plate: TrackShapePlate;
}

export interface TrackArmorEnvelope extends ArmorEnvelope {
  trackShapesOverride?: TrackHull[];
  trackShapes?: TrackShape[];
}

type TrackSide = -1 | 1;

/** What attaching the prisms reads and writes of an armor model: its override, its prisms, and its legacy track plates. */
interface TrackShapeTarget {
  trackShapesOverride?: TrackHull[];
  trackShapes?: TrackShape[];
  readonly hullPlates?: readonly ArmorPlate[];
}

/**
 * TRACK-HITBOX SCHEMA (combat round 2026-08-06, owner order: "make track
 * hitboxes represented and look much more accurate ... theyre just a bunch
 * of rectangles"). Attach real track-shape volumes to an ArmorModel:
 *
 *   armor.trackShapes = [{
 *     module: 'trackL'|'trackR',       // combat module the prism damages
 *     x0, x1,                          // hull-local lateral slab (x0 < x1)
 *     poly: [[z,y], ...],              // convex CCW side-view silhouette
 *     plate: {name, physicalMm, keMm, ceMm, kind:'external',
 *             era:null, moduleLink, gunFollow:false},  // screen stats
 *   }, ...]
 *
 * Each entry is a convex prism (the polygon extruded across [x0,x1]) that
 * REPLACES, for ray tests only, the legacy hand-authored track pair — the
 * full-length rectangle plate (sR/sL 'track_R'/'track_L') and the trackL/R
 * module AABB. sim/armor.traceTank consumes it (prism entry face = the
 * external track screen with a TRUE surface normal — vertical band side,
 * angled approach/departure ramps, raised end-wheel wraps); the killcam
 * x-ray draws it. The legacy plates/boxes STAY in the model as authored:
 * plates keep feeding the HE nearest-face AABB, boxes keep feeding HE blast
 * targets, killcam shader bands and ghost anatomy — traceTank simply skips
 * them when trackShapes is present, and every armor model WITHOUT
 * trackShapes (headless probes, hand-built selftest models, gearless
 * generic placeholders) keeps the legacy path bit-identical.
 *
 * `hulls` comes from the running gear actually built for this spec
 * (buildRunningGear publishes {x0,x1,poly} per unit — wheel positions/radii
 * and band profile truth; since 276 the anatomy generator measures it into the
 * calibration and finalizeCombatAnatomy attaches it, so every driver traces the
 * same prisms), so the hitbox follows the real \____/ trapezoid
 * run per tank with zero hand-authoring. Idempotent: recomputes and
 * overwrites on every call. HAND-OVERRIDE HOOK for odd rigs: author
 * `armor.trackShapesOverride = [...]` (same entry shape, minus `plate`
 * which is still auto-wired) on a spec and it wins over the derived hulls.
 *
 * @param {object} armor ArmorModel (mutated in place)
 * @param {Array<{x0:number,x1:number,poly:Array}>} hulls derived per-unit
 *   track hulls, RIGHT-side coordinates (x0>0); mirrored here for the left
 * @returns {object} the same armor object
 */
export function attachTrackShapes<T extends TrackShapeTarget>(
  armor: T,
  hulls: readonly TrackHull[],
): T {
  if (!armor) return armor;
  const src = Array.isArray(armor.trackShapesOverride) && armor.trackShapesOverride.length
    ? armor.trackShapesOverride
    : hulls;
  if (!Array.isArray(src) || !src.length) return armor;
  const shapes: TrackShape[] = [];
  for (const hull of src) {
    if (!isUsableTrackHull(hull)) continue;
    for (const side of trackHullSides(hull)) {
      shapes.push(trackShapeForSide(armor, hull, side));
    }
  }
  if (shapes.length) armor.trackShapes = shapes;
  return armor;
}

function isUsableTrackHull(hull: TrackHull | null | undefined): hull is TrackHull {
  return !!hull && Array.isArray(hull.poly) && hull.poly.length >= 3;
}

function trackHullSides(hull: TrackHull): readonly TrackSide[] {
  if (hull.module === 'trackL') return [-1];
  if (hull.module === 'trackR') return [1];
  return [-1, 1];
}

function trackShapeForSide(
  armor: TrackShapeTarget,
  hull: TrackHull,
  side: TrackSide,
): TrackShape {
  const module: TrackModule = side < 0 ? 'trackL' : 'trackR';
  const legacy = armor.hullPlates?.find(
    (plate) => plate.moduleLink === module && plate.kind === 'external');
  const lowX = Math.min(Math.abs(hull.x0), Math.abs(hull.x1));
  const highX = Math.max(Math.abs(hull.x0), Math.abs(hull.x1));
  return {
    module,
    x0: side < 0 ? -highX : lowX,
    x1: side < 0 ? -lowX : highX,
    poly: hull.poly.map((point) => [point[0], point[1]]),
    plate: {
      name: legacy?.name ?? (side < 0 ? 'track_L' : 'track_R'),
      physicalMm: legacy?.physicalMm ?? 20,
      keMm: legacy?.keMm ?? 20,
      ceMm: legacy?.ceMm ?? 20,
      kind: 'external',
      era: null,
      moduleLink: module,
      gunFollow: false,
    },
  };
}
