/**
 * Structure support — round 30 (owner 2026-09-20: tanks "glitch out and go crazy when they hit buildings or are on
 * or in them ... it should literally just be in our engine as all just primitives").
 *
 * The ride used to sample only the terrain height field, so a hull that landed on a roof (a jump, a knock, a
 * ramp) had no floor under it: it fell through the building until the ground OBB solver found it inside the
 * footprint and shoved it out sideways in one frame — the "goes crazy" pop. This module wraps the height field
 * per hull so every support sample also sees the tops of the collision primitives under the point: a hull whose
 * belly is above a part's top stands on that top exactly like on terrain, drives across it and falls off the
 * edge. Parts the hull is already below (it is beside or inside them) are ignored — the OBB solver keeps owning
 * those contacts. Pure and allocation-free per tick; solo and authoritative sims share it.
 */
import type { CollisionRecord, SimpleCollisionShape } from '../world/collision.ts';
import { CLIFF_GRADE, driveGroundTypeAt } from './terrainMobility.ts';
import { tankContactRect } from './tankContactShape.ts';
import {
  HULL_STANDABLE_HEIGHT_M, HULL_STEP_UP_M, collisionPartClimbAt, collisionPartIsDeck, collisionPartTopAt, collisionRecordHasDrawnTop,
  createHullFootprint, hullFootprint, hullUndersideOver, pointInsideCollisionRecord, type HullFootprint,
} from '../world/collision.ts';

/** A hull stands on a part whose top is at most this far above the hull's current belly line (the same step the
 * ground OBB solver treats as "on top of", collision.ts hullPassesObstacleTop). */
export const SUPPORT_STEP_UP_M = HULL_STEP_UP_M;
/** Parts lower than this (kerbs, sandbags, wreck plates) are driven over by the ride spring, not stood on. */
export const SUPPORT_MIN_HEIGHT_M = HULL_STANDABLE_HEIGHT_M;
/** Query margin around the hull for candidate primitives. */
const SUPPORT_QUERY_MARGIN_M = 6;
/** The steepest underside (rise per metre, 60 degrees) the pose's floor rule reads; past it the root's belly decides. */
const POSED_RISE_MAX = Math.tan(Math.PI / 3);

interface SupportHeightField {
  getHeightAt(x: number, z: number): number;
  getHeightAtFast?(x: number, z: number): number;
  getContactHeightAt?(x: number, z: number): number;
  /** The terrain's contact surface alone (movement.ts reads its walls from it; structures are floors or walls by the
   * standing rule). */
  getTerrainContactHeightAt?(x: number, z: number): number;
  getGroundType(x: number, z: number): string;
  getDriveGroundType?(x: number, z: number): string;
}

interface SupportObstacleSource {
  queryObstacles?(minX: number, minZ: number, maxX: number, maxZ: number, out: CollisionRecord[]): CollisionRecord[];
  getObstacles?(): CollisionRecord[];
}

/**
 * The hull's contact rect and attitude for the floor rule (physics lane, 2026-10-03): with it, a part is a floor when
 * its top is within the step-up of the hull's lowest underside point over that part's footprint — the ground OBB
 * solver's standing rule (world/collision.ts hullUndersideOver) — instead of the belly line at the hull's origin. The
 * origin alone dropped the roof from under a hull pivoting off its edge (belly on the edge, origin already behind and
 * below it): the hull fell into the building, which the solver then judged it to be standing on.
 */
export type HullSupportPose = HullFootprint;

export interface StructureSupportField extends SupportHeightField {
  /** Select the hull about to be stepped: gathers the primitives within reach and its belly line (and, with a pose,
   * its underside over each primitive). */
  beginHull(x: number, z: number, bellyY: number, pose?: HullSupportPose | null): void;
  /** Number of primitives considered for the current hull (probes / receipts). */
  readonly candidateCount: number;
  /** Whether the current hull's root stands on a roof's deck (StandingDecks). */
  readonly standingDeck: boolean;
  /**
   * Reads so far that a primitive's top answered over the ground (destruction stream, 2026-10-13): the movement takes a
   * step whose support solve raised it for a step on a record (a rock's tier, a roof), where an edge is climbed at the
   * hull's pace (movement.ts EDGE_CLIMB_*), rather than a terrain face (a trench's wall), which lifts as before.
   */
  readonly recordReads: number;
  /**
   * The places a top's outline crosses under a hull's box (physics stream F8, 2026-10-14; topEdgeStations): world (x, z)
   * pairs into `out`, at most `max` of them, the count returned.
   */
  topEdgeStations(quad: ArrayLike<number>, out: Float64Array, max: number): number;
}

/** A part's top under (x, z): its drawn top where it carries one (a stone's surface: world/collision.ts
 * collisionPartTopAt), else its flat top. */
function partTop(record: CollisionRecord, part: SimpleCollisionShape | null, x: number, z: number): number {
  return collisionPartTopAt(record, part, x, z);
}

/**
 * The roof's deck the hull stands on (beginHull): the highest top under its root no more than a step over its belly,
 * when that top is a deck, and its top there (physics stream F4, 2026-10-13; the coordinator: "a roof the hull could
 * climb as terrain must hold it"). A deck is one plane, so the rest of it is the ground the hull stands on, read by the
 * terrain's reach (movement.ts groundReachable): a floor up to the step plus CLIFF_GRADE times its distance from the
 * root, and past that the reach itself (a face steeper than CLIFF_GRADE is read at the last of it the hull reaches).
 * Judged against the hull's own track plane alone, a level hull set on a 45-degree roof read the deck's uphill half as a
 * wall and the street under it, fitted an 88-degree attitude and was thrown 2-16 m off it (a T-90M pivoting on a
 * 54-degree mansard, 9 m); terrain of the same grade it holds, or slides down past its tracks' grip.
 */
interface StandingDecks {
  x: number;
  z: number;
  parts: Array<SimpleCollisionShape | null>;
  tops: Float64Array;
}

/** Highest standable top under (x, z) among the candidates, or -Infinity. `floors` (beginHull's pose rule) holds each
 * candidate's own belly line; without it every candidate uses `bellyY`. `stand` (beginHull) holds the deck piece the
 * hull stands on, a floor within the terrain's reach of the root. */
export function structureTopAt(
  candidates: readonly CollisionRecord[], count: number, x: number, z: number, bellyY: number,
  floors: Float64Array | null = null, plane: SupportPlane | null = null, stand: StandingDecks | null = null,
): number {
  let best = -Infinity;
  // (physics stream, 2026-10-13) a drawn top (a stone's surface) is a floor wherever it is not a wall: where its climb
  // surface (collisionPartClimbAt: a face the tracks ride up, lowered by their climb past the step) lies within the step
  // of the hull's track plane at that very point — the push's own rule, so a stone is wall or floor everywhere and never
  // neither — not of the underside's lowest point over the whole record, which read the stone under a raised nose as a wall
  const planeCeiling = plane ? plane.y + plane.slopeX * (x - plane.cx) + plane.slopeZ * (z - plane.cz) + SUPPORT_STEP_UP_M : NaN;
  for (let i = 0; i < count; i++) {
    const ceiling = (floors ? floors[i] : bellyY) + SUPPORT_STEP_UP_M;
    const record = candidates[i];
    if (record.crushed || record.dead || record.crushable) continue; // crushable cover is crushed, not stood on
    // (a drawn top is the stone's own surface, a floor however low: the push holds a hull off only its section a step up)
    if (record.max[1] - record.min[1] < SUPPORT_MIN_HEIGHT_M && !collisionRecordHasDrawnTop(record)) continue;
    if (x < record.min[0] || x > record.max[0] || z < record.min[2] || z > record.max[2]) continue;
    const shape = record.shape2;
    if (shape && shape.kind === 'compound') {
      const standing = stand ? stand.parts[i] : null;
      for (const part of shape.parts) {
        let top = partTop(record, part, x, z);
        if (top <= best) continue;
        if (top > ceiling && !(part.kind === 'convex' && part.tp && plane && collisionPartClimbAt(record, part, x, z) < planeCeiling)) {
          if (!standing) continue;
          // (the roof the hull stands on reads as terrain does, within the reach of the root's deck: its own deck, and the
          // decks of the same roof no more than a step over its plane carried on — a gable's far pitch over the ridge — though
          // not a chimney, a dormer or a cupola standing out of it (floor-only, they are passed through as before); past the
          // reach, its own deck is the last of it the hull reaches, as the terrain's wall rule reads a face, never the street
          // or the attic floor under the roof)
          const own = part === standing;
          if (!own && !(collisionPartIsDeck(record, part)
            && top <= collisionPartTopAt(record, standing, x, z) + SUPPORT_STEP_UP_M)) continue;
          const reach = stand!.tops[i] + SUPPORT_STEP_UP_M + CLIFF_GRADE * Math.hypot(x - stand!.x, z - stand!.z);
          if (top > reach) {
            if (!own) continue;
            top = reach;
          }
          if (top <= best) continue;
        }
        if (pointInsideCollisionRecord(record, part, x, z)) best = top;
      }
    } else {
      // (a simple shape's top is its record's, as before; a drawn top where it carries one)
      const drawn = !!shape && shape.kind === 'convex' && !!shape.tp;
      const top = drawn ? partTop(record, shape, x, z) : record.max[1];
      if (top <= best) continue;
      if (top > ceiling && !(drawn && plane && collisionPartClimbAt(record, shape, x, z) < planeCeiling)) continue;
      if (pointInsideCollisionRecord(record, shape ?? null, x, z)) best = top;
    }
  }
  return best;
}

/** A hull's track plane for the drawn-top rule (structureTopAt): its height at (cx, cz) and its rise per metre in x, z. */
export interface SupportPlane { y: number; cx: number; cz: number; slopeX: number; slopeZ: number }

type PoseSpec = Parameters<typeof tankContactRect>[0];
interface PoseState { pos: { x: number; z: number }; yaw: number; visualPitch?: number; visualRoll?: number }

/** Fill `out` with the hull's footprint at its rendered attitude (the ground OBB solver's frame,
 * world/collision.ts hullFootprint). */
export function hullSupportPose(spec: PoseSpec, state: PoseState, out: HullSupportPose): HullSupportPose {
  return hullFootprint(tankContactRect(spec), state.pos.x, state.pos.z, state.yaw, state.visualPitch || 0,
    state.visualRoll || 0, out);
}

/** A pose object for one caller's reuse (allocation-free stepping). */
export function createHullSupportPose(): HullSupportPose {
  return createHullFootprint();
}

/** How far into a top a station on its outline is read (topEdgeStations): inside it, clear of its edge's rounding. */
const EDGE_STATION_INSET_M = 0.03;
const _outline = new Float64Array(64);

/** The part's outline in world (x, z) pairs into _outline (a convex part's corners, a box's four), or 0 (a circle). */
function partOutline(record: CollisionRecord, part: SimpleCollisionShape | null): number {
  if (!part) {
    _outline[0] = record.min[0]; _outline[1] = record.min[2]; _outline[2] = record.max[0]; _outline[3] = record.min[2];
    _outline[4] = record.max[0]; _outline[5] = record.max[2]; _outline[6] = record.min[0]; _outline[7] = record.max[2];
    return 4;
  }
  if (part.kind === 'obb') {
    const s = Math.sin(part.yaw), c = Math.cos(part.yaw);
    // forward (sin yaw, cos yaw) by hl, right (cos yaw, -sin yaw) by hw
    for (let k = 0; k < 4; k++) {
      const a = k === 0 || k === 3 ? -part.hl : part.hl, b = k < 2 ? -part.hw : part.hw;
      _outline[2 * k] = part.cx + s * a + c * b;
      _outline[2 * k + 1] = part.cz + c * a - s * b;
    }
    return 4;
  }
  if (part.kind !== 'convex') return 0;
  const n = Math.min(part.points.length >> 1, _outline.length >> 1);
  for (let k = 0; k < 2 * n; k++) _outline[k] = part.points[k];
  return n;
}

/**
 * The places a standable top's outline crosses under a hull's box (physics stream F8, 2026-10-14; the coordinator: "the
 * edge-fall pop model ... body-edge-on-roof-edge strike/pivot"): where the box's sides cross the outline's edges, and the
 * outline's corners inside the box, each read EDGE_STATION_INSET_M inside the top. Over a planar underside and a planar
 * top the deepest point of one in the other is a corner of their overlap, and these are its corners the box's own four
 * are not. A hull driving off a roof's edge at an angle rested on its box corners and its track stations, a metre and
 * more behind the edge; it turned nose-down about them, its underside between them and the edge sank half a metre into
 * the roof, and the standing rule then found it inside the building and pushed it out sideways a metre a step.
 * `quad` holds the box's four bottom corners in world (x, z), in order round it.
 */
function topEdgeStationsIn(
  candidates: readonly CollisionRecord[], count: number, quad: ArrayLike<number>, out: Float64Array, max: number,
): number {
  let n = 0;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let k = 0; k < 4; k++) {
    const x = quad[2 * k], z = quad[2 * k + 1];
    if (x < minX) minX = x; if (x > maxX) maxX = x; if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
  }
  // the quad's winding, for its inside test
  const qs = (quad[2] - quad[0]) * (quad[5] - quad[1]) - (quad[3] - quad[1]) * (quad[4] - quad[0]) > 0 ? 1 : -1;
  for (let i = 0; i < count && n < max; i++) {
    const record = candidates[i];
    if (record.crushed || record.dead || record.crushable) continue;
    if (record.max[1] - record.min[1] < SUPPORT_MIN_HEIGHT_M && !collisionRecordHasDrawnTop(record)) continue;
    if (record.max[0] < minX || record.min[0] > maxX || record.max[2] < minZ || record.min[2] > maxZ) continue;
    const shape = record.shape2;
    const parts = shape && shape.kind === 'compound' ? shape.parts.length : 1;
    for (let p = 0; p < parts && n < max; p++) {
      const part = shape && shape.kind === 'compound' ? shape.parts[p] : (shape as SimpleCollisionShape | null);
      const m = partOutline(record, part);
      if (m < 3) continue;
      let cx = 0, cz = 0;
      for (let k = 0; k < m; k++) { cx += _outline[2 * k]; cz += _outline[2 * k + 1]; }
      cx /= m; cz /= m;
      for (let k = 0; k < m && n < max; k++) {
        const ax = _outline[2 * k], az = _outline[2 * k + 1];
        const bx = _outline[(2 * k + 2) % (2 * m)], bz = _outline[(2 * k + 3) % (2 * m)];
        // the outline's corner inside the box
        let inside = true;
        for (let q = 0; q < 4 && inside; q++) {
          const px = quad[2 * q], pz = quad[2 * q + 1], ex = quad[(2 * q + 2) % 8] - px, ez = quad[(2 * q + 3) % 8] - pz;
          if (qs * (ex * (az - pz) - ez * (ax - px)) < 0) inside = false;
        }
        if (inside) n = pushStation(out, n, ax, az, cx, cz);
        // the outline's edge across the box's sides
        for (let q = 0; q < 4 && n < max; q++) {
          const px = quad[2 * q], pz = quad[2 * q + 1], ex = quad[(2 * q + 2) % 8] - px, ez = quad[(2 * q + 3) % 8] - pz;
          const fx = bx - ax, fz = bz - az;
          const den = ex * fz - ez * fx;
          if (Math.abs(den) < 1e-12) continue;
          const t = ((ax - px) * fz - (az - pz) * fx) / den;
          const u = ((ax - px) * ez - (az - pz) * ex) / den;
          if (t < 0 || t > 1 || u < 0 || u > 1) continue;
          n = pushStation(out, n, px + t * ex, pz + t * ez, cx, cz);
        }
      }
    }
  }
  return n;
}

function pushStation(out: Float64Array, n: number, x: number, z: number, cx: number, cz: number): number {
  if (2 * n + 1 >= out.length) return n;
  const dx = cx - x, dz = cz - z, d = Math.hypot(dx, dz);
  const k = d > EDGE_STATION_INSET_M ? EDGE_STATION_INSET_M / d : 0;
  out[2 * n] = x + dx * k;
  out[2 * n + 1] = z + dz * k;
  return n + 1;
}

export function createStructureSupportField(
  terrain: SupportHeightField,
  source: SupportObstacleSource,
): StructureSupportField {
  const candidates: CollisionRecord[] = [];
  let count = 0;
  let belly = -Infinity;
  let floors = new Float64Array(16);
  let posed = false;
  const stand: StandingDecks = { x: 0, z: 0, parts: [], tops: new Float64Array(16) };
  let standing = false;
  const plane: SupportPlane = { y: 0, cx: 0, cz: 0, slopeX: 0, slopeZ: 0 };
  const terrainAt = terrain.getHeightAt.bind(terrain);
  const terrainFast = terrain.getHeightAtFast ? terrain.getHeightAtFast.bind(terrain) : terrainAt;
  let recordReads = 0;
  const sample = (base: (x: number, z: number) => number) => (x: number, z: number): number => {
    const ground = base(x, z);
    if (count === 0) return ground;
    const top = structureTopAt(candidates, count, x, z, belly, posed ? floors : null, posed ? plane : null, standing ? stand : null);
    if (top > ground + 0.02) { recordReads++; return top; }
    return top > ground ? top : ground;
  };
  const getHeightAt = sample(terrainAt);
  const getHeightAtFast = sample(terrainFast);
  const terrainContact = terrain.getContactHeightAt?.bind(terrain) ?? terrainFast;
  const getContactHeightAt = sample(terrainContact);
  return {
    getHeightAt,
    getHeightAtFast,
    getContactHeightAt,
    getTerrainContactHeightAt: terrainContact,
    getGroundType: (x, z) => terrain.getGroundType(x, z),
    getDriveGroundType: (x, z) => driveGroundTypeAt(terrain, x, z),
    beginHull(x, z, bellyY, pose) {
      belly = bellyY;
      candidates.length = 0;
      if (source.queryObstacles) {
        source.queryObstacles(x - SUPPORT_QUERY_MARGIN_M, z - SUPPORT_QUERY_MARGIN_M,
          x + SUPPORT_QUERY_MARGIN_M, z + SUPPORT_QUERY_MARGIN_M, candidates);
      } else if (source.getObstacles) {
        for (const record of source.getObstacles()) {
          if (record.max[0] < x - SUPPORT_QUERY_MARGIN_M || record.min[0] > x + SUPPORT_QUERY_MARGIN_M
            || record.max[2] < z - SUPPORT_QUERY_MARGIN_M || record.min[2] > z + SUPPORT_QUERY_MARGIN_M) continue;
          candidates.push(record);
        }
      }
      count = candidates.length;
      // (physics stream F4, 2026-10-13) a hull pitched or rolled past 60 degrees is on its shell, not its tracks: its
      // underside is no floor line (its rise per metre runs away toward the vertical) and the root's belly decides, as
      // it does for every hull without a pose. A tumbling hull falling nose-first past a building's wall read a
      // 34-per-metre underside over the eave as the line a step under it, stood its shell on the eave 4 m over its root
      // and was thrown up at 22 m/s.
      posed = !!pose && Math.abs(pose.riseAlong) <= POSED_RISE_MAX && Math.abs(pose.riseAcross) <= POSED_RISE_MAX;
      // the deck the hull stands on (StandingDecks): the highest top under its root no more than a step over its belly,
      // when that top is a roof's deck (a deck under a building's solid top, hidden in it, is not what the hull stands on)
      standing = false;
      stand.x = x; stand.z = z;
      if (stand.tops.length < count) stand.tops = new Float64Array(Math.max(count, stand.tops.length * 2));
      stand.parts.length = count;
      let best = -Infinity, bestRecord = -1;
      let bestPart: SimpleCollisionShape | null = null;
      for (let i = 0; i < count; i++) {
        const record = candidates[i];
        stand.parts[i] = null;
        const shape = record.shape2;
        if (!shape || shape.kind !== 'compound' || record.crushed || record.dead || record.crushable) continue;
        if (x < record.min[0] || x > record.max[0] || z < record.min[2] || z > record.max[2]) continue;
        for (const part of shape.parts) {
          // (a part tops out at its y1 and starts at its y0: one wholly under the best so far or over the reach is skipped
          // before its planes are read)
          if (!part || (part.y1 !== undefined && part.y1 <= best) || (part.y0 !== undefined && part.y0 > bellyY + SUPPORT_STEP_UP_M)) continue;
          const top = collisionPartTopAt(record, part, x, z);
          if (top <= best || top > bellyY + SUPPORT_STEP_UP_M || !pointInsideCollisionRecord(record, part, x, z)) continue;
          best = top;
          bestRecord = i;
          bestPart = part;
        }
      }
      if (bestPart && collisionPartIsDeck(candidates[bestRecord], bestPart)) {
        stand.parts[bestRecord] = bestPart;
        stand.tops[bestRecord] = best;
        standing = true;
      }
      if (!posed || !pose) return;
      plane.y = bellyY + pose.centerRise; plane.cx = pose.centerX; plane.cz = pose.centerZ;
      plane.slopeX = pose.riseAlong * pose.forwardX + pose.riseAcross * pose.rightX;
      plane.slopeZ = pose.riseAlong * pose.forwardZ + pose.riseAcross * pose.rightZ;
      if (floors.length < count) floors = new Float64Array(Math.max(count, floors.length * 2));
      for (let i = 0; i < count; i++) {
        floors[i] = hullUndersideOver(candidates[i], pose, bellyY);
      }
    },
    get candidateCount() { return count; },
    get standingDeck() { return standing; },
    get recordReads() { return recordReads; },
    topEdgeStations(quad, out, max) { return topEdgeStationsIn(candidates, count, quad, out, max); },
  };
}
