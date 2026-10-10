import type { RuntimeValue } from '../runtimeTypes.ts';
// Shared, allocation-free world collision primitives.
//
// World props keep min/max AABBs for cheap broad-phase consumers, but may
// carry a tighter `shape2` footprint for the movement and shell narrow phases:
//   { kind:'obb', cx,cz, hw,hl,yaw }
//   { kind:'circle', cx,cz,r }
//   { kind:'convex', cx,cz, points:[x0,z0,...] }  // world points, either winding (convexWinding)

const EPS = 1e-9;

/**
 * The winding of a convex footprint's points: 1 counter-clockwise (inside on the left of every edge), -1 clockwise.
 * Captured footprints carry either (2026-10-03: 935 clockwise parts in 503 records over the 33 maps' shards, structure
 * roof strips, cable spools, stooks and wire among them). The route probe, the shell ray's edge clip and the clearance
 * test read every footprint as counter-clockwise, so a clockwise part's inside was its outside: shells and sight lines
 * passed through it, it held no point, and the bots' route probe hit it from far off (a 4 m hut on Railyard pulled a
 * searching T-90A 90 m off its route to the hut's corners until battlePacing's 900 s cap). The SAT push is winding-free.
 */
function convexWinding(points: readonly number[]): number {
  let area2 = 0;
  for (let index = 0; index < points.length; index += 2) {
    const next = index + 2 < points.length ? index + 2 : 0;
    area2 += points[index] * points[next + 1] - points[next] * points[index + 1];
  }
  return area2 < 0 ? -1 : 1;
}

type Bounds3 = [number, number, number];

/**
 * `y0` / `y1` (2026-09-19, owner: "building hitboxes extend into empty air"): the optional world-space vertical
 * extent of one part of a compound record — a structure's solids each keep their own height and every 0.5 m shell
 * band carries the roof strip that actually lies in it. Absent, the part spans the record's own [min[1], max[1]].
 */
export type SimpleCollisionShape =
  | { kind: 'obb'; cx: number; cz: number; hw: number; hl: number; yaw: number; y0?: number; y1?: number }
  | { kind: 'circle'; cx: number; cz: number; r: number; y0?: number; y1?: number }
  | { kind: 'convex'; cx: number; cz: number; points: number[]; y0?: number; y1?: number };

/** A hull whose track bottom clears a part's top by this much passes over it (the record-level rule uses 0.5 too). */
const OVERPASS_CLEARANCE_M = 0.5;
/** A hull whose body top stays this far under a part's bottom passes beneath it (an overhang, a bridge deck). */
const UNDERPASS_CLEARANCE_M = 0.15;
/**
 * Round 30 (owner 2026-09-20, hulls "on or in" buildings): a hull whose belly line is at most this far below a
 * standable top is on that top, not beside it — the top is its floor (sim/structureSupport.ts lifts the ride onto
 * it) and the part's walls do not push it. Real hulls climb a 0.8–1 m step; the step-up equals the support field's.
 */
export const HULL_STEP_UP_M = 0.55;
/** Tops of parts shorter than this (kerbs, sandbags, wreck plates) are never floors: the ride drives over them. */
export const HULL_STANDABLE_HEIGHT_M = 0.9;
/**
 * Does the hull span pass above this obstacle top — clearing it in the air, or standing on it? `spanBottom` is the
 * underside the standing rule reads (hullUndersideOver), `clearBottom` the track plane that clears a top or not (the
 * footprint's `clearBottom`: the same for track rows; under a nose or tail row alone, the tracks that meet it next).
 */
export function hullPassesObstacleTop(
  spanBottom: number, top: number, bottom: number, standable = true, clearBottom = spanBottom,
): boolean {
  if (clearBottom > top + OVERPASS_CLEARANCE_M) return true;
  // crushable cover (sandbags, fences, light walls) is pushed and crushed as before, never mounted
  return standable && top - bottom >= HULL_STANDABLE_HEIGHT_M && spanBottom > top - HULL_STEP_UP_M;
}

/**
 * The standing rule's span bottom for a tilted hull (physics lane, 2026-10-03): the lowest point of the hull's
 * underside (its track-bottom plane at its pitch and roll, sampled on a 5 x 3 grid over its rect; the nose and tail
 * rows rise by the shell's lift there, the glacis and tail plates the tracks run under) that lies over the record's
 * footprint, or the root when none does. Only the tracks step up onto a top: when no track row lies over the part, a
 * nose or tail row counts the step-up against itself, so it stands on the part only by clearing it (a level hull
 * nosing into a 1.2 m boulder read its 0.7 m glacis lift as standing height and was lifted onto the rock 0.9 m in a
 * tick). Over a deck the hull stands on, its track rows decide (an end row clearing nothing dropped a bridge deck from
 * under a hull sunk 2 cm into it, and the bot fell 6515 hp into the gorge). The root alone said a hull pivoting off a roof edge (its belly on
 * the edge, its root dropped below the roof behind it) was inside the building, and the solver shoved it out sideways
 * at a metre a tick. The highest corner over the footprint (this rule's first form) let a hull tipped nose-up over the
 * edge sink beside the wall with its belly inside the building, its raised nose still "on the roof", until a 2.9 m
 * overlap was pushed out three metres in three ticks. A hull driving into a wall at ground level has its underside
 * over the footprint at ground level: still a push.
 */
export function hullUndersideOver(record: CollisionRecord, foot: HullFootprint, rootY: number): number {
  const { centerX, centerZ, forwardX, forwardZ, rightX, rightZ, halfLength, halfWidth } = foot;
  // a record the rect's box does not reach has no sample over it (the root, exactly as the grid would find)
  const reachX = Math.abs(forwardX) * halfLength + Math.abs(rightX) * halfWidth;
  const reachZ = Math.abs(forwardZ) * halfLength + Math.abs(rightZ) * halfWidth;
  if (centerX + reachX < record.min[0] || centerX - reachX > record.max[0]
    || centerZ + reachZ < record.min[2] || centerZ - reachZ > record.max[2]) {
    foot.clearBottom = rootY;
    return rootY;
  }
  // the track rows decide when any lies over the record (the tracks are what stand on it); only a nose or tail row
  // alone over it decides by clearing its top
  const centerY = rootY + foot.centerRise;
  let tracks = Infinity, ends = Infinity, endsTrack = Infinity;
  for (let i = 0; i < 5; i++) {
    const along = (i * 0.5 - 1) * halfLength;
    const end = i === 0 || i === 4;
    const lift = i === 4 ? foot.frontLift - HULL_STEP_UP_M : i === 0 ? foot.rearLift - HULL_STEP_UP_M : 0;
    for (let j = 0; j < 3; j++) {
      const across = (j - 1) * halfWidth;
      const x = centerX + forwardX * along + rightX * across;
      const z = centerZ + forwardZ * along + rightZ * across;
      if (x < record.min[0] || x > record.max[0] || z < record.min[2] || z > record.max[2]) continue;
      if (!footprintHolds(record, x, z)) continue;
      const plane = centerY + along * foot.riseAlong + across * foot.riseAcross;
      if (end) {
        if (plane + lift < ends) ends = plane + lift;
        if (plane < endsTrack) endsTrack = plane;
      } else if (plane < tracks) tracks = plane;
    }
  }
  // What clears a part is the track plane, the tracks that meet it next (physics lane round 3, Aegis Crossing): a nose or
  // tail row alone over a record clears a part only as the tracks under it would, while the standing rule still counts
  // the step-up against the row's own height. Read through the step-up, a nose over a viaduct span's sub-deck slab, a
  // metre under the deck the hull drove on, cleared it by 0.45 m, under the 0.5 m overpass, and the slab stopped a hull
  // without nose lift dead on the deck at every span joint (18.6 m/s, 248 hp a joint); read at its lifted height, a high
  // glacis passed over a low wall its tracks then met a metre and a half deep.
  foot.clearBottom = tracks < Infinity ? tracks : endsTrack < Infinity ? endsTrack : rootY;
  return tracks < Infinity ? tracks : ends < Infinity ? ends : rootY;
}

/**
 * The hull's footprint over the ground at its attitude (physics lane, 2026-10-03): the contact rect's track plane
 * projected onto the ground — foreshortened by the pitch and the roll, never longer or wider than the rect — and how
 * that underside rises across it. The obstacle solver pushes this footprint and the standing rule samples it
 * (hullUndersideOver). The flat rect at the root kept a hull standing on its tail beside a wall 3.8 m "long", so the
 * building pushed it a metre a tick while its real footprint was clear of the wall, and its underside samples sat
 * metres from where the hull's belly was, so the roof it hung on stopped counting as its floor.
 */
export interface HullFootprint {
  /** World centre of the projected rect and its frame. */
  centerX: number;
  centerZ: number;
  forwardX: number;
  forwardZ: number;
  rightX: number;
  rightZ: number;
  /** Projected half extents. */
  halfLength: number;
  halfWidth: number;
  /** Underside height at the centre above the root, and its rise per horizontal metre forward and to the right. */
  centerRise: number;
  riseAlong: number;
  riseAcross: number;
  /** Nose and tail lift of the underside above the track plane (the rect's frontLiftM / rearLiftM, upright). */
  frontLift: number;
  rearLift: number;
  /** The track plane over the last record hullUndersideOver read (what clears a top; hullPassesObstacleTop). */
  clearBottom: number;
}

/** The contact rect fields hullFootprint reads (sim/tankContactShape.ts tankContactRect). */
export interface HullFootprintRect {
  centerX: number;
  centerZ: number;
  halfLength: number;
  halfWidth: number;
  frontLiftM: number;
  rearLiftM: number;
}

/** Below this the projection is a hull on its end or side: its footprint stops shrinking (and its slope stays finite). */
const FOOTPRINT_MIN_COS = 0.05;

/** A footprint object for one caller's reuse (allocation-free stepping). */
export function createHullFootprint(): HullFootprint {
  return { centerX: 0, centerZ: 0, forwardX: 0, forwardZ: 1, rightX: 1, rightZ: 0, halfLength: 0, halfWidth: 0,
    centerRise: 0, riseAlong: 0, riseAcross: 0, frontLift: 0, rearLift: 0, clearBottom: 0 };
}

/** Fill `out` with the footprint of a hull whose root stands at (x, z) with this yaw, pitch and roll. */
export function hullFootprint(
  rect: HullFootprintRect, x: number, z: number, yaw: number, pitch: number, roll: number, out: HullFootprint,
): HullFootprint {
  const forwardX = Math.sin(yaw), forwardZ = Math.cos(yaw);
  const sinPitch = Math.sin(pitch), cosPitch = Math.cos(pitch);
  const sinRoll = Math.sin(roll), cosRoll = Math.cos(roll);
  const along = cosPitch >= 0 ? Math.max(cosPitch, FOOTPRINT_MIN_COS) : Math.min(cosPitch, -FOOTPRINT_MIN_COS);
  const across = cosRoll >= 0 ? Math.max(cosRoll, FOOTPRINT_MIN_COS) : Math.min(cosRoll, -FOOTPRINT_MIN_COS);
  const centerAlong = rect.centerZ * along, centerAcross = rect.centerX * across;
  out.forwardX = forwardX;
  out.forwardZ = forwardZ;
  out.rightX = forwardZ;
  out.rightZ = -forwardX;
  out.centerX = x + forwardX * centerAlong + forwardZ * centerAcross;
  out.centerZ = z + forwardZ * centerAlong - forwardX * centerAcross;
  out.halfLength = rect.halfLength * Math.abs(along);
  out.halfWidth = rect.halfWidth * Math.abs(across);
  out.centerRise = rect.centerZ * sinPitch + rect.centerX * sinRoll;
  out.riseAlong = sinPitch / along;
  out.riseAcross = sinRoll / across;
  out.frontLift = rect.frontLiftM * Math.abs(along);
  out.rearLift = rect.rearLiftM * Math.abs(along);
  return out;
}

/** Allocation-free footprint containment (the compound loop of collisionFootprintContainsPoint, margin 0). */
function footprintHolds(record: CollisionRecord, x: number, z: number): boolean {
  const shape = record.shape2;
  if (!shape) return true; // the caller has tested the AABB
  if (shape.kind !== 'compound') return simpleFootprintContainsPoint(shape, x, z, 0);
  for (const part of shape.parts) if (simpleFootprintContainsPoint(part, x, z, 0)) return true;
  return false;
}

export type CollisionShape = SimpleCollisionShape | {
  kind: 'compound';
  cx: number;
  cz: number;
  parts: SimpleCollisionShape[];
};

export interface CollisionRecord {
  min: Bounds3;
  max: Bounds3;
  shape2?: CollisionShape;
  crushable?: boolean;
  crushMin?: number;
  crushKeep?: number;
  kind?: string;
  treeIdx?: number;
  propIdx?: number;
  crushed?: boolean;
  dead?: boolean;
  /**
   * The structure group (destruction, docs/DESTRUCTION.md §3.1): every record of one building placement — its contact
   * record in the obstacles, its shell bands in the colliders, a set piece's movement records — carries the placement's
   * id, in build order. Packed in the collision shards as `g`.
   */
  structureIdx?: number;
  /** The group's role: absent for a building; 'setpiece' a landmark (breach-only); 'fixed' never damaged (a set piece
   * with a deck or a bridge). Packed as `gr` (1 setpiece, 2 fixed). */
  structureRole?: 'setpiece' | 'fixed';
  /**
   * What has opened in the structure this shell band belongs to (destruction P2, docs/DESTRUCTION.md §3.4, §6): set on
   * every shell band of a structure once a hole opens or a section falls, cleared for the next battle. The raycasts
   * then answer for the structure as a whole (`rayStructureOpenings`). Runtime only: never packed.
   */
  openings?: StructureOpenings | null;
}

function isDenseCrushableCover(kind: string | undefined): boolean {
  return kind === 'wallstone' || kind === 'walladobe' ||
    kind === 'sandbagsmall' || kind === 'sandbagbig' || kind === 'sandbagwall' || kind === 'small-rock';
}

/**
 * Lightweight world cover reacts to a shell but never consumes it. Dense
 * masonry/adobe walls and sandbag fortifications remain real ballistic cover
 * even though a sufficiently forceful hull can eventually crush them.
 * (the hitbox lane, 2026-10-07: and a stone a hull crushes is still stone to a shell — the crushable small rocks rise
 * 0.45-1.5 m, a shell flew through them while the bots' gun lane and every sight line stopped on them)
 */
export function shellPassesThroughCollisionRecord(
  record: CollisionRecord | null | undefined,
): record is CollisionRecord {
  return record?.crushable === true && !isDenseCrushableCover(record.kind);
}

interface Position2 {
  x: number;
  z: number;
}

interface Vector3Like extends Position2 {
  y: number;
}

interface MutableVector3Like extends Vector3Like {
  set(x: number, y: number, z: number): RuntimeValue;
}

interface Push2 extends Position2 {
  x: number;
  z: number;
}

interface AxisOverlap {
  overlap: number;
  nx: number;
  nz: number;
}

interface CirclePush extends Position2 {
  depth: number;
}

interface RayInterval {
  t0: number;
  t1: number;
  nx: number;
  ny: number;
  nz: number;
  axis: number;
  sign: number;
}

export type ObstacleQuery = (
  minX: number,
  minZ: number,
  maxX: number,
  maxZ: number,
  out: CollisionRecord[],
) => CollisionRecord[];

/** Attach a tight oriented-box footprint while retaining a world AABB. */
export function setObbShape(
  rec: CollisionRecord,
  cx: number,
  cz: number,
  halfWidth: number,
  halfLength: number,
  yaw = 0,
) {
  const hw = Math.max(0, halfWidth);
  const hl = Math.max(0, halfLength);
  const cs = Math.abs(Math.cos(yaw));
  const sn = Math.abs(Math.sin(yaw));
  const ex = hw * cs + hl * sn;
  const ez = hw * sn + hl * cs;
  rec.min[0] = cx - ex; rec.max[0] = cx + ex;
  rec.min[2] = cz - ez; rec.max[2] = cz + ez;
  rec.shape2 = { kind: 'obb', cx, cz, hw, hl, yaw };
  return rec;
}

/** Attach a circular footprint (finite vertical cylinder in ray tests). */
export function setCircleShape(rec: CollisionRecord, cx: number, cz: number, radius: number) {
  const r = Math.max(0, radius);
  rec.min[0] = cx - r; rec.max[0] = cx + r;
  rec.min[2] = cz - r; rec.max[2] = cz + r;
  rec.shape2 = { kind: 'circle', cx, cz, r };
  return rec;
}

/** Monotone-chain convex hull of [x,z] pairs. Returns CCW flat coordinates. */
export function convexHull2(points: ReadonlyArray<readonly [number, number]>) {
  if (!points || points.length < 3) return [];
  const p = points.map((v) => [v[0], v[1]])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: readonly number[], a: readonly number[], b: readonly number[]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: number[][] = [];
  for (const v of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], v) <= 0) lower.pop();
    lower.push(v);
  }
  const upper: number[][] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const v = p[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], v) <= 0) upper.pop();
    upper.push(v);
  }
  lower.pop(); upper.pop();
  const out: number[] = [];
  for (const v of lower.concat(upper)) out.push(v[0], v[1]);
  return out;
}

/** A corner standing less than this off the chord between its neighbours is dropped (m): flatter than any part reads,
 * and far enough that the shards' 0.1 mm quantisation cannot turn a kept corner against its winding. */
const CONVEX_CORNER_M = 1e-3;

/**
 * A convex outline made convex in fact (the hitbox lane, 2026-10-08). The shell clip, the point test and the movement
 * SAT read every edge of a convex part as a half-plane, so a corner that turns against the outline's winding (a short
 * edge rounded or quantised the wrong way, a zigzag along a collinear run) cut away all of the part behind its line: in
 * the shards 887 barbed-wire parts, 54 of the stone walls', 50 of the structures' and 2 of the desert tents' lost more
 * than a tenth of their outline in the game's own tests. Repeated corners, those that turn against the outline's
 * winding and those within CONVEX_CORNER_M of the chord between their neighbours are dropped in place (an array keeps
 * its identity; a typed one is copied); an outline that spans no area is left as it is.
 */
export function convexOutlineInPlace(points: number[]): number[] {
  const out = Array.isArray(points) ? points : Array.from(points as ArrayLike<number>);
  const n = out.length >> 1;
  if (n < 3) return out;
  let area2 = 0;
  for (let i = 0; i < n; i++) {
    const j = i + 1 < n ? i + 1 : 0;
    area2 += out[2 * i] * out[2 * j + 1] - out[2 * j] * out[2 * i + 1];
  }
  if (!(Math.abs(area2) > 1e-9)) return out;
  const winding = area2 < 0 ? -1 : 1;
  let m = 0;
  for (let i = 0; i < n; i++) {
    const x = out[2 * i], z = out[2 * i + 1];
    if (m && out[2 * (m - 1)] === x && out[2 * (m - 1) + 1] === z) continue;
    out[2 * m] = x; out[2 * m + 1] = z; m++;
  }
  while (m > 1 && out[0] === out[2 * (m - 1)] && out[1] === out[2 * (m - 1) + 1]) m--;
  for (let dropped = true; dropped && m > 3;) {
    dropped = false;
    for (let i = 0; i < m && m > 3; i++) {
      const a = i > 0 ? i - 1 : m - 1, b = i + 1 < m ? i + 1 : 0;
      const turn = (out[2 * i] - out[2 * a]) * (out[2 * b + 1] - out[2 * i + 1])
        - (out[2 * i + 1] - out[2 * a + 1]) * (out[2 * b] - out[2 * i]);
      // (turn is the corner's distance off its chord times the chord's length)
      if (turn * winding > CONVEX_CORNER_M * Math.hypot(out[2 * b] - out[2 * a], out[2 * b + 1] - out[2 * a + 1])) continue;
      for (let k = i; k < m - 1; k++) { out[2 * k] = out[2 * k + 2]; out[2 * k + 1] = out[2 * k + 3]; }
      m--; i--; dropped = true;
    }
  }
  out.length = 2 * m;
  return out;
}

/** Attach a convex projected footprint while retaining its enclosing AABB. */
export function setConvexShape(rec: CollisionRecord, points: number[]) {
  if (!points || points.length < 6) return rec;
  points = convexOutlineInPlace(points);
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  let sx = 0, sz = 0;
  for (let i = 0; i < points.length; i += 2) {
    const x = points[i], z = points[i + 1];
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (z < minZ) minZ = z; if (z > maxZ) maxZ = z;
    sx += x; sz += z;
  }
  rec.min[0] = minX; rec.max[0] = maxX;
  rec.min[2] = minZ; rec.max[2] = maxZ;
  const n = points.length / 2;
  rec.shape2 = { kind: 'convex', cx: sx / n, cz: sz / n, points };
  return rec;
}

function simpleShapeBounds(shape: SimpleCollisionShape) {
  if (shape.kind === 'circle') {
    return [shape.cx - shape.r, shape.cz - shape.r, shape.cx + shape.r, shape.cz + shape.r];
  }
  if (shape.kind === 'obb') {
    const cs = Math.abs(Math.cos(shape.yaw));
    const sn = Math.abs(Math.sin(shape.yaw));
    const ex = shape.hw * cs + shape.hl * sn;
    const ez = shape.hw * sn + shape.hl * cs;
    return [shape.cx - ex, shape.cz - ez, shape.cx + ex, shape.cz + ez];
  }
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (let index = 0; index < shape.points.length; index += 2) {
    minX = Math.min(minX, shape.points[index]);
    minZ = Math.min(minZ, shape.points[index + 1]);
    maxX = Math.max(maxX, shape.points[index]);
    maxZ = Math.max(maxZ, shape.points[index + 1]);
  }
  return [minX, minZ, maxX, maxZ];
}

/** Attach a union of tight convex primitives while retaining one broad-phase record. */
export function setCompoundShape(rec: CollisionRecord, parts: SimpleCollisionShape[]) {
  if (!parts.length) return rec;
  if (parts.length === 1) {
    const part = parts[0];
    if (part.kind === 'circle') return setCircleShape(rec, part.cx, part.cz, part.r);
    if (part.kind === 'obb') return setObbShape(rec, part.cx, part.cz, part.hw, part.hl, part.yaw);
    return setConvexShape(rec, part.points);
  }
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const part of parts) {
    if (part.kind === 'convex') {
      // (the hitbox lane, 2026-10-08) every convex part convex in fact, its centre its corners' mean as before
      part.points = convexOutlineInPlace(part.points);
      let cx = 0, cz = 0;
      for (let index = 0; index < part.points.length; index += 2) { cx += part.points[index]; cz += part.points[index + 1]; }
      const count = Math.max(1, part.points.length / 2);
      part.cx = cx / count; part.cz = cz / count;
    }
    const bounds = simpleShapeBounds(part);
    minX = Math.min(minX, bounds[0]); minZ = Math.min(minZ, bounds[1]);
    maxX = Math.max(maxX, bounds[2]); maxZ = Math.max(maxZ, bounds[3]);
  }
  rec.min[0] = minX; rec.min[2] = minZ;
  rec.max[0] = maxX; rec.max[2] = maxZ;
  rec.shape2 = {
    kind: 'compound',
    cx: (minX + maxX) * 0.5,
    cz: (minZ + maxZ) * 0.5,
    parts,
  };
  return rec;
}

function simpleFootprintContainsPoint(
  shape: SimpleCollisionShape,
  x: number,
  z: number,
  margin: number,
) {
  if (shape.kind === 'circle') {
    const dx = x - shape.cx, dz = z - shape.cz;
    const radius = shape.r + margin;
    return dx * dx + dz * dz <= radius * radius;
  }
  if (shape.kind === 'obb') {
    const dx = x - shape.cx, dz = z - shape.cz;
    const forwardX = Math.sin(shape.yaw), forwardZ = Math.cos(shape.yaw);
    const rightX = forwardZ, rightZ = -forwardX;
    return Math.abs(dx * rightX + dz * rightZ) <= shape.hw + margin
      && Math.abs(dx * forwardX + dz * forwardZ) <= shape.hl + margin;
  }
  const winding = convexWinding(shape.points);
  for (let index = 0; index < shape.points.length; index += 2) {
    const next = (index + 2) % shape.points.length;
    const edgeX = shape.points[next] - shape.points[index];
    const edgeZ = shape.points[next + 1] - shape.points[index + 1];
    const cross = winding * (edgeX * (z - shape.points[index + 1])
      - edgeZ * (x - shape.points[index]));
    if (cross < -margin * Math.hypot(edgeX, edgeZ)) return false;
  }
  return true;
}

/** Exact point/clearance query shared by navigation and runtime collision. */
export function collisionFootprintContainsPoint(
  record: CollisionRecord,
  x: number,
  z: number,
  margin = 0,
) {
  const shape = record.shape2;
  if (!shape) {
    return x >= record.min[0] - margin && x <= record.max[0] + margin
      && z >= record.min[2] - margin && z <= record.max[2] + margin;
  }
  if (shape.kind !== 'compound') return simpleFootprintContainsPoint(shape, x, z, margin);
  return shape.parts.some((part) => simpleFootprintContainsPoint(part, x, z, margin));
}

function rayCircleEntry2(
  shape: Extract<SimpleCollisionShape, { kind: 'circle' }>,
  sourceX: number,
  sourceZ: number,
  directionX: number,
  directionZ: number,
  maxDistance: number,
  margin: number,
) {
  const ox = sourceX - shape.cx, oz = sourceZ - shape.cz;
  const radius = shape.r + margin;
  const along = -(ox * directionX + oz * directionZ);
  const closestSq = ox * ox + oz * oz - along * along;
  const radiusSq = radius * radius;
  if (closestSq > radiusSq) return null;
  const halfChord = Math.sqrt(Math.max(0, radiusSq - closestSq));
  const entry = Math.max(0, along - halfChord);
  const exit = along + halfChord;
  return exit >= 0 && entry < maxDistance ? entry : null;
}

function raySlabNear(origin: number, direction: number, min: number, max: number) {
  if (Math.abs(direction) < EPS) return origin >= min && origin <= max ? -Infinity : Infinity;
  return Math.min((min - origin) / direction, (max - origin) / direction);
}

function raySlabFar(origin: number, direction: number, min: number, max: number) {
  if (Math.abs(direction) < EPS) return origin >= min && origin <= max ? Infinity : -Infinity;
  return Math.max((min - origin) / direction, (max - origin) / direction);
}

function rayObbEntry2(
  shape: Extract<SimpleCollisionShape, { kind: 'obb' }>,
  sourceX: number,
  sourceZ: number,
  directionX: number,
  directionZ: number,
  maxDistance: number,
  margin: number,
) {
  const forwardX = Math.sin(shape.yaw), forwardZ = Math.cos(shape.yaw);
  const rightX = forwardZ, rightZ = -forwardX;
  const dx = sourceX - shape.cx, dz = sourceZ - shape.cz;
  const localX = dx * rightX + dz * rightZ;
  const localZ = dx * forwardX + dz * forwardZ;
  const localDirectionX = directionX * rightX + directionZ * rightZ;
  const localDirectionZ = directionX * forwardX + directionZ * forwardZ;
  const entry = Math.max(
    0,
    raySlabNear(localX, localDirectionX, -shape.hw - margin, shape.hw + margin),
    raySlabNear(localZ, localDirectionZ, -shape.hl - margin, shape.hl + margin),
  );
  const exit = Math.min(
    maxDistance,
    raySlabFar(localX, localDirectionX, -shape.hw - margin, shape.hw + margin),
    raySlabFar(localZ, localDirectionZ, -shape.hl - margin, shape.hl + margin),
  );
  return entry <= exit && exit >= 0 && entry < maxDistance ? entry : null;
}

function rayConvexEntry2(
  shape: Extract<SimpleCollisionShape, { kind: 'convex' }>,
  sourceX: number,
  sourceZ: number,
  directionX: number,
  directionZ: number,
  maxDistance: number,
  margin: number,
) {
  const winding = convexWinding(shape.points);
  let entry = 0, exit = maxDistance;
  for (let index = 0; index < shape.points.length; index += 2) {
    const next = (index + 2) % shape.points.length;
    const edgeX = shape.points[next] - shape.points[index];
    const edgeZ = shape.points[next + 1] - shape.points[index + 1];
    const offset = winding * (edgeX * (sourceZ - shape.points[index + 1])
      - edgeZ * (sourceX - shape.points[index]))
      + margin * Math.hypot(edgeX, edgeZ);
    const velocity = winding * (edgeX * directionZ - edgeZ * directionX);
    if (Math.abs(velocity) < EPS) {
      if (offset < 0) return null;
      continue;
    }
    const crossing = -offset / velocity;
    if (velocity > 0) entry = Math.max(entry, crossing);
    else exit = Math.min(exit, crossing);
    if (entry > exit) return null;
  }
  return exit >= 0 && entry < maxDistance ? Math.max(0, entry) : null;
}

function raySimpleFootprintEntry2(
  shape: SimpleCollisionShape,
  sourceX: number,
  sourceZ: number,
  directionX: number,
  directionZ: number,
  maxDistance: number,
  margin: number,
) {
  if (shape.kind === 'circle') {
    return rayCircleEntry2(
      shape, sourceX, sourceZ, directionX, directionZ, maxDistance, margin,
    );
  }
  if (shape.kind === 'obb') {
    return rayObbEntry2(
      shape, sourceX, sourceZ, directionX, directionZ, maxDistance, margin,
    );
  }
  return rayConvexEntry2(
    shape, sourceX, sourceZ, directionX, directionZ, maxDistance, margin,
  );
}

/** First 2D ray entry into the exact footprint, optionally inflated for clearance. */
export function rayCollisionFootprintEntry2(
  record: CollisionRecord,
  sourceX: number,
  sourceZ: number,
  directionX: number,
  directionZ: number,
  maxDistance: number,
  margin = 0,
) {
  const length = Math.hypot(directionX, directionZ);
  if (length < EPS || maxDistance <= 0) return null;
  directionX /= length; directionZ /= length;
  const shape = record.shape2;
  if (!shape) {
    const entry = Math.max(
      0,
      raySlabNear(sourceX, directionX, record.min[0] - margin, record.max[0] + margin),
      raySlabNear(sourceZ, directionZ, record.min[2] - margin, record.max[2] + margin),
    );
    const exit = Math.min(
      maxDistance,
      raySlabFar(sourceX, directionX, record.min[0] - margin, record.max[0] + margin),
      raySlabFar(sourceZ, directionZ, record.min[2] - margin, record.max[2] + margin),
    );
    return entry <= exit && exit >= 0 && entry < maxDistance ? entry : null;
  }
  if (shape.kind !== 'compound') {
    return raySimpleFootprintEntry2(
      shape, sourceX, sourceZ, directionX, directionZ, maxDistance, margin,
    );
  }
  let best: number | null = null;
  for (const part of shape.parts) {
    const entry = raySimpleFootprintEntry2(
      part, sourceX, sourceZ, directionX, directionZ, maxDistance, margin,
    );
    if (entry != null && (best == null || entry < best)) best = entry;
  }
  return best;
}

/** Copy a shape record without sharing mutable min/max arrays. */
export function cloneCollisionRecord(rec: CollisionRecord): CollisionRecord {
  const out: CollisionRecord = { ...rec, min: [...rec.min], max: [...rec.max] };
  if (rec.shape2) {
    out.shape2 = { ...rec.shape2 } as CollisionShape;
    if (rec.shape2.kind === 'convex' && out.shape2.kind === 'convex') {
      out.shape2.points = rec.shape2.points.slice();
    } else if (rec.shape2.kind === 'compound' && out.shape2.kind === 'compound') {
      out.shape2.parts = rec.shape2.parts.map((part) => part.kind === 'convex'
        ? { ...part, points: part.points.slice() }
        : { ...part });
    }
  }
  return out;
}

function testAxis(
  nx: number, nz: number, pos: Position2,
  fx: number, fz: number, rx: number, rz: number,
  halfL: number, halfW: number, minB: number, maxB: number,
  centerBX: number, centerBZ: number, best: AxisOverlap,
) {
  const ll = Math.hypot(nx, nz);
  if (ll < EPS) return true;
  nx /= ll; nz /= ll;
  const centerA = pos.x * nx + pos.z * nz;
  const radiusA = halfL * Math.abs(fx * nx + fz * nz) +
    halfW * Math.abs(rx * nx + rz * nz);
  // the distance that separates along +n and along -n (physics lane, 2026-10-03): the overlap of the two projections is
  // that distance only while neither holds the other — a hull inside a wide footprint read its own width, a long hull
  // across a thin wall the wall's thickness, and the push walked it sideways through the building
  const outPlus = maxB - (centerA - radiusA);
  const outMinus = centerA + radiusA - minB;
  if (outPlus <= 0 || outMinus <= 0) return false;
  const ov = Math.min(outPlus, outMinus);
  if (ov < best.overlap) {
    const sign = outPlus < outMinus ? 1 : outMinus < outPlus ? -1
      : (pos.x - centerBX) * nx + (pos.z - centerBZ) * nz >= 0 ? 1 : -1;
    best.overlap = ov; best.nx = nx * sign; best.nz = nz * sign;
  }
  return true;
}

function testConvexAxis(
  ax: number, az: number, pts: number[], shape: Extract<CollisionShape, { kind: 'convex' }>,
  pos: Position2, fx: number, fz: number, rx: number, rz: number,
  halfL: number, halfW: number, best: AxisOverlap,
) {
  const ll = Math.hypot(ax, az);
  if (ll < EPS) return true;
  const nx = ax / ll, nz = az / ll;
  let minB = Infinity, maxB = -Infinity;
  for (let i = 0; i < pts.length; i += 2) {
    const p = pts[i] * nx + pts[i + 1] * nz;
    if (p < minB) minB = p; if (p > maxB) maxB = p;
  }
  return testAxis(nx, nz, pos, fx, fz, rx, rz, halfL, halfW,
    minB, maxB, shape.cx, shape.cz, best);
}

function testObbAxis(
  nx: number, nz: number, box: Extract<CollisionShape, { kind: 'obb' }>,
  ofx: number, ofz: number, orx: number, orz: number,
  pos: Position2, fx: number, fz: number, rx: number, rz: number,
  halfL: number, halfW: number, best: AxisOverlap,
) {
  const c = box.cx * nx + box.cz * nz;
  const r = box.hl * Math.abs(ofx * nx + ofz * nz) +
    box.hw * Math.abs(orx * nx + orz * nz);
  return testAxis(nx, nz, pos, fx, fz, rx, rz, halfL, halfW,
    c - r, c + r, box.cx, box.cz, best);
}

/**
 * Tight hull-OBB vs environment-footprint push-out. Adds the minimum
 * translation to `outPush`; returns false when separated.
 */
export function pushHullFromObstacle(
  pos: Position2,
  fx: number, fz: number, rx: number, rz: number,
  halfL: number, halfW: number,
  ob: CollisionRecord,
  outPush: Push2,
  spanBottom = -Infinity,
  spanTop = Infinity,
  clearBottom = spanBottom,
) {
  const sh = ob.shape2;
  if (sh && sh.kind === 'compound') {
    const startX = outPush.x;
    const startZ = outPush.z;
    let hit = false;
    for (const part of sh.parts) {
      // per-part vertical extent: the hull passes over a part it clears (a low wing, a porch, a garage beside
      // the tower) and under a part it stays below (an overhang); parts without their own extent use the record's
      if (part.y1 !== undefined
        && hullPassesObstacleTop(spanBottom, part.y1, part.y0 ?? ob.min[1], !ob.crushable, clearBottom)) continue;
      if (part.y0 !== undefined && spanTop < part.y0 - UNDERPASS_CLEARANCE_M) continue;
      _compoundRec.min[1] = part.y0 ?? ob.min[1]; _compoundRec.max[1] = part.y1 ?? ob.max[1];
      _compoundRec.shape2 = part;
      _compoundPos.x = pos.x + outPush.x - startX;
      _compoundPos.z = pos.z + outPush.z - startZ;
      if (pushHullFromObstacle(
        _compoundPos, fx, fz, rx, rz, halfL, halfW, _compoundRec, outPush, spanBottom, spanTop, clearBottom,
      )) hit = true;
    }
    return hit;
  }
  if (sh?.kind === 'circle') {
    return pushHullFromCircle(pos, fx, fz, rx, rz, halfL, halfW, sh, outPush);
  }

  const best = _pushBest;
  best.overlap = Infinity; best.nx = 0; best.nz = 0;
  const overlaps = sh?.kind === 'convex'
    ? overlapsConvexObstacle(sh, pos, fx, fz, rx, rz, halfL, halfW, best)
    : overlapsBoxObstacle(ob, sh?.kind === 'obb' ? sh : null,
      pos, fx, fz, rx, rz, halfL, halfW, best);
  if (!overlaps) return false;
  outPush.x += best.nx * best.overlap;
  outPush.z += best.nz * best.overlap;
  return true;
}

/**
 * Round 30: is the vertical line through (x, z) inside one primitive's footprint? Used by the structure support
 * (sim/structureSupport.ts) so a hull can stand on the top of a part it is above. `part` null tests the record's
 * own AABB footprint; a compound record is tested part by part by the caller.
 */
export function pointInsideCollisionRecord(
  record: CollisionRecord, part: SimpleCollisionShape | null, x: number, z: number,
): boolean {
  if (!part) return x >= record.min[0] && x <= record.max[0] && z >= record.min[2] && z <= record.max[2];
  if (part.kind === 'circle') {
    const dx = x - part.cx, dz = z - part.cz;
    return dx * dx + dz * dz <= part.r * part.r;
  }
  if (part.kind === 'obb') {
    const dx = x - part.cx, dz = z - part.cz;
    const c = Math.cos(part.yaw), s = Math.sin(part.yaw);
    // the box's forward axis is (sin yaw, cos yaw) like a hull's; right is (cos yaw, -sin yaw)
    const along = dx * s + dz * c;
    const across = dx * c - dz * s;
    return Math.abs(along) <= part.hl && Math.abs(across) <= part.hw;
  }
  const points = part.points;
  if (points.length < 6) return false;
  let sign = 0;
  for (let i = 0; i < points.length; i += 2) {
    const next = (i + 2) % points.length;
    const ex = points[next] - points[i], ez = points[next + 1] - points[i + 1];
    const cross = ex * (z - points[i + 1]) - ez * (x - points[i]);
    if (Math.abs(cross) < 1e-9) continue;
    const side = cross > 0 ? 1 : -1;
    if (sign === 0) sign = side;
    else if (side !== sign) return false;
  }
  return true;
}

function pushHullFromCircle(
  pos: Position2,
  fx: number, fz: number, rx: number, rz: number,
  halfL: number, halfW: number,
  circle: Extract<CollisionShape, { kind: 'circle' }>,
  outPush: Push2,
): boolean {
  const dx = circle.cx - pos.x;
  const dz = circle.cz - pos.z;
  const centerX = dx * rx + dz * rz;
  const centerZ = dx * fx + dz * fz;
  const closestX = Math.max(-halfW, Math.min(centerX, halfW));
  const closestZ = Math.max(-halfL, Math.min(centerZ, halfL));
  const deltaX = closestX - centerX;
  const deltaZ = closestZ - centerZ;
  const distanceSq = deltaX * deltaX + deltaZ * deltaZ;
  if (distanceSq >= circle.r * circle.r) return false;
  circlePushLocal(centerX, centerZ, deltaX, deltaZ, distanceSq,
    halfL, halfW, circle.r, _circlePush);
  outPush.x += (rx * _circlePush.x + fx * _circlePush.z) * _circlePush.depth;
  outPush.z += (rz * _circlePush.x + fz * _circlePush.z) * _circlePush.depth;
  return true;
}

function circlePushLocal(
  centerX: number, centerZ: number,
  deltaX: number, deltaZ: number,
  distanceSq: number, halfL: number, halfW: number, radius: number,
  out: CirclePush,
): void {
  if (distanceSq > EPS) {
    const distance = Math.sqrt(distanceSq);
    out.x = deltaX / distance;
    out.z = deltaZ / distance;
    out.depth = radius - distance;
    return;
  }
  const overlapX = halfW + radius - Math.abs(centerX);
  const overlapZ = halfL + radius - Math.abs(centerZ);
  if (overlapX < overlapZ) {
    out.x = centerX >= 0 ? -1 : 1;
    out.z = 0;
    out.depth = overlapX;
    return;
  }
  out.x = 0;
  out.z = centerZ >= 0 ? -1 : 1;
  out.depth = overlapZ;
}

function overlapsConvexObstacle(
  shape: Extract<CollisionShape, { kind: 'convex' }>,
  pos: Position2,
  fx: number, fz: number, rx: number, rz: number,
  halfL: number, halfW: number, best: AxisOverlap,
): boolean {
  const points = shape.points;
  if (!testConvexAxis(fx, fz, points, shape, pos,
    fx, fz, rx, rz, halfL, halfW, best)) return false;
  if (!testConvexAxis(rx, rz, points, shape, pos,
    fx, fz, rx, rz, halfL, halfW, best)) return false;
  for (let index = 0; index < points.length; index += 2) {
    const next = (index + 2) % points.length;
    const axisX = -(points[next + 1] - points[index + 1]);
    const axisZ = points[next] - points[index];
    if (!testConvexAxis(axisX, axisZ, points, shape, pos,
      fx, fz, rx, rz, halfL, halfW, best)) return false;
  }
  return true;
}

function obstacleBox(
  obstacle: CollisionRecord,
  shape: Extract<CollisionShape, { kind: 'obb' }> | null,
): Extract<CollisionShape, { kind: 'obb' }> {
  if (shape) return shape;
  _fallbackBox.cx = (obstacle.min[0] + obstacle.max[0]) * 0.5;
  _fallbackBox.cz = (obstacle.min[2] + obstacle.max[2]) * 0.5;
  _fallbackBox.hw = (obstacle.max[0] - obstacle.min[0]) * 0.5;
  _fallbackBox.hl = (obstacle.max[2] - obstacle.min[2]) * 0.5;
  _fallbackBox.yaw = 0;
  return _fallbackBox;
}

function overlapsBoxObstacle(
  obstacle: CollisionRecord,
  shape: Extract<CollisionShape, { kind: 'obb' }> | null,
  pos: Position2,
  fx: number, fz: number, rx: number, rz: number,
  halfL: number, halfW: number, best: AxisOverlap,
): boolean {
  const box = obstacleBox(obstacle, shape);
  const obstacleForwardX = Math.sin(box.yaw);
  const obstacleForwardZ = Math.cos(box.yaw);
  const obstacleRightX = obstacleForwardZ;
  const obstacleRightZ = -obstacleForwardX;
  return testObbAxis(fx, fz, box, obstacleForwardX, obstacleForwardZ,
    obstacleRightX, obstacleRightZ, pos, fx, fz, rx, rz, halfL, halfW, best)
    && testObbAxis(rx, rz, box, obstacleForwardX, obstacleForwardZ,
      obstacleRightX, obstacleRightZ, pos, fx, fz, rx, rz, halfL, halfW, best)
    && testObbAxis(obstacleForwardX, obstacleForwardZ, box,
      obstacleForwardX, obstacleForwardZ, obstacleRightX, obstacleRightZ,
      pos, fx, fz, rx, rz, halfL, halfW, best)
    && testObbAxis(obstacleRightX, obstacleRightZ, box,
      obstacleForwardX, obstacleForwardZ, obstacleRightX, obstacleRightZ,
      pos, fx, fz, rx, rz, halfL, halfW, best);
}

/**
 * Tight OBB-vs-OBB hull contact. Unlike the historical capsule approximation,
 * this does not round away solid shoulder/track corners. All arguments are
 * scalars so the fixed-step pair loop can reuse existing state without
 * allocating temporary obstacle records.
 */
export function pushHullFromHull(
  ax: number, az: number, afx: number, afz: number,
  arx: number, arz: number, aHalfL: number, aHalfW: number,
  bx: number, bz: number, bfx: number, bfz: number,
  brx: number, brz: number, bHalfL: number, bHalfW: number,
  outPush: Push2,
) {
  const best = _pushBest;
  best.overlap = Infinity; best.nx = 0; best.nz = 0;
  if (!testHullAxis(afx, afz, ax, az, afx, afz, arx, arz, aHalfL, aHalfW,
    bx, bz, bfx, bfz, brx, brz, bHalfL, bHalfW, best) ||
      !testHullAxis(arx, arz, ax, az, afx, afz, arx, arz, aHalfL, aHalfW,
        bx, bz, bfx, bfz, brx, brz, bHalfL, bHalfW, best) ||
      !testHullAxis(bfx, bfz, ax, az, afx, afz, arx, arz, aHalfL, aHalfW,
        bx, bz, bfx, bfz, brx, brz, bHalfL, bHalfW, best) ||
      !testHullAxis(brx, brz, ax, az, afx, afz, arx, arz, aHalfL, aHalfW,
        bx, bz, bfx, bfz, brx, brz, bHalfL, bHalfW, best)) return false;
  outPush.x += best.nx * best.overlap;
  outPush.z += best.nz * best.overlap;
  return true;
}

function testHullAxis(
  nx: number, nz: number,
  ax: number, az: number, afx: number, afz: number,
  arx: number, arz: number, aHalfL: number, aHalfW: number,
  bx: number, bz: number, bfx: number, bfz: number,
  brx: number, brz: number, bHalfL: number, bHalfW: number,
  best: AxisOverlap,
) {
  const length = Math.hypot(nx, nz);
  if (length < EPS) return true;
  nx /= length; nz /= length;
  const radiusA = aHalfL * Math.abs(afx * nx + afz * nz) +
    aHalfW * Math.abs(arx * nx + arz * nz);
  const radiusB = bHalfL * Math.abs(bfx * nx + bfz * nz) +
    bHalfW * Math.abs(brx * nx + brz * nz);
  const separation = (ax - bx) * nx + (az - bz) * nz;
  const overlap = radiusA + radiusB - Math.abs(separation);
  if (overlap <= 0) return false;
  if (overlap < best.overlap) {
    const sign = separation >= 0 ? 1 : -1;
    best.overlap = overlap;
    best.nx = nx * sign;
    best.nz = nz * sign;
  }
  return true;
}

const _pushBest = { overlap: Infinity, nx: 0, nz: 0 };
const _circlePush: CirclePush = { x: 0, z: 0, depth: 0 };
const _fallbackBox: Extract<CollisionShape, { kind: 'obb' }> = {
  kind: 'obb', cx: 0, cz: 0, hw: 0, hl: 0, yaw: 0,
};
const _localO = { x: 0, y: 0, z: 0 };
const _localD = { x: 0, y: 0, z: 0 };
const _localRec: CollisionRecord = { min: [0, 0, 0], max: [0, 0, 0] };
const _compoundRec: CollisionRecord = { min: [0, 0, 0], max: [0, 0, 0] };
const _compoundPos = { x: 0, z: 0 };
const _localN: MutableVector3Like = {
  x: 0, y: 0, z: 0,
  set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z; },
};
const _rayInterval: RayInterval = {
  t0: 0, t1: 0, nx: 0, ny: 0, nz: 0, axis: -1, sign: 1,
};

function clipAabbAxis(
  origin: number,
  direction: number,
  lower: number,
  upper: number,
  axis: number,
  interval: RayInterval,
): boolean {
  if (Math.abs(direction) < EPS) return origin >= lower && origin <= upper;
  const inverse = 1 / direction;
  let entry = (lower - origin) * inverse;
  let exit = (upper - origin) * inverse;
  let sign = -1;
  if (entry > exit) {
    const swap = entry;
    entry = exit;
    exit = swap;
    sign = 1;
  }
  if (entry > interval.t0) {
    interval.t0 = entry;
    interval.axis = axis;
    interval.sign = sign;
  }
  if (exit < interval.t1) interval.t1 = exit;
  return interval.t0 <= interval.t1;
}

function rayAabb(
  origin: Vector3Like,
  dir: Vector3Like,
  rec: CollisionRecord,
  maxDist: number,
  outNormal: MutableVector3Like,
) {
  const interval = _rayInterval;
  interval.t0 = 0;
  interval.t1 = maxDist;
  interval.axis = -1;
  interval.sign = 1;
  if (!clipAabbAxis(origin.x, dir.x, rec.min[0], rec.max[0], 0, interval)
      || !clipAabbAxis(origin.y, dir.y, rec.min[1], rec.max[1], 1, interval)
      || !clipAabbAxis(origin.z, dir.z, rec.min[2], rec.max[2], 2, interval)) return -1;
  if (interval.axis >= 0) {
    outNormal.set(0, 0, 0);
    if (interval.axis === 0) outNormal.x = interval.sign;
    else if (interval.axis === 1) outNormal.y = interval.sign;
    else outNormal.z = interval.sign;
  } else outNormal.set(-dir.x, -dir.y, -dir.z);
  return interval.t0;
}

function initializeExtrudedInterval(
  origin: Vector3Like,
  dir: Vector3Like,
  rec: CollisionRecord,
  maxDist: number,
  againstRay: boolean,
): RayInterval | null {
  const interval = _rayInterval;
  interval.t0 = 0;
  interval.t1 = maxDist;
  interval.nx = againstRay ? -dir.x : 0;
  interval.ny = againstRay ? -dir.y : 0;
  interval.nz = againstRay ? -dir.z : 0;
  if (Math.abs(dir.y) < EPS) {
    return origin.y >= rec.min[1] && origin.y <= rec.max[1] ? interval : null;
  }
  let entry = (rec.min[1] - origin.y) / dir.y;
  let exit = (rec.max[1] - origin.y) / dir.y;
  let signY = -1;
  if (entry > exit) {
    const swap = entry;
    entry = exit;
    exit = swap;
    signY = 1;
  }
  if (entry > interval.t0) {
    interval.t0 = entry;
    interval.nx = 0;
    interval.ny = signY;
    interval.nz = 0;
  }
  if (exit < interval.t1) interval.t1 = exit;
  return interval;
}

function rayObb(
  origin: Vector3Like,
  dir: Vector3Like,
  rec: CollisionRecord,
  shape: Extract<CollisionShape, { kind: 'obb' }>,
  maxDist: number,
  outNormal: MutableVector3Like,
): number {
  const sine = Math.sin(shape.yaw);
  const cosine = Math.cos(shape.yaw);
  const deltaX = origin.x - shape.cx;
  const deltaZ = origin.z - shape.cz;
  _localO.x = deltaX * cosine - deltaZ * sine;
  _localO.y = origin.y;
  _localO.z = deltaX * sine + deltaZ * cosine;
  _localD.x = dir.x * cosine - dir.z * sine;
  _localD.y = dir.y;
  _localD.z = dir.x * sine + dir.z * cosine;
  _localRec.min[0] = -shape.hw;
  _localRec.min[1] = rec.min[1];
  _localRec.min[2] = -shape.hl;
  _localRec.max[0] = shape.hw;
  _localRec.max[1] = rec.max[1];
  _localRec.max[2] = shape.hl;
  const distance = rayAabb(_localO, _localD, _localRec, maxDist, _localN);
  if (distance < 0) return -1;
  outNormal.set(
    _localN.x * cosine + _localN.z * sine,
    _localN.y,
    -_localN.x * sine + _localN.z * cosine,
  );
  return distance;
}

function clipCircleSides(
  origin: Vector3Like,
  dir: Vector3Like,
  shape: Extract<CollisionShape, { kind: 'circle' }>,
  interval: RayInterval,
): boolean {
  const originX = origin.x - shape.cx;
  const originZ = origin.z - shape.cz;
  const directionSq = dir.x * dir.x + dir.z * dir.z;
  if (directionSq < EPS) return originX * originX + originZ * originZ <= shape.r * shape.r;
  const linear = 2 * (originX * dir.x + originZ * dir.z);
  const constant = originX * originX + originZ * originZ - shape.r * shape.r;
  const discriminant = linear * linear - 4 * directionSq * constant;
  if (discriminant < 0) return false;
  const root = Math.sqrt(discriminant);
  const entry = (-linear - root) / (2 * directionSq);
  const exit = (-linear + root) / (2 * directionSq);
  if (entry > interval.t0) {
    interval.t0 = entry;
    const hitX = originX + dir.x * entry;
    const hitZ = originZ + dir.z * entry;
    const inverseLength = 1 / Math.max(Math.hypot(hitX, hitZ), EPS);
    interval.nx = hitX * inverseLength;
    interval.ny = 0;
    interval.nz = hitZ * inverseLength;
  }
  if (exit < interval.t1) interval.t1 = exit;
  return true;
}

function rayCircle(
  origin: Vector3Like,
  dir: Vector3Like,
  rec: CollisionRecord,
  shape: Extract<CollisionShape, { kind: 'circle' }>,
  maxDist: number,
  outNormal: MutableVector3Like,
): number {
  const interval = initializeExtrudedInterval(origin, dir, rec, maxDist, false);
  if (!interval || !clipCircleSides(origin, dir, shape, interval)) return -1;
  if (interval.t0 > interval.t1 || interval.t1 < 0 || interval.t0 > maxDist) return -1;
  outNormal.set(interval.nx, interval.ny, interval.nz);
  return Math.max(0, interval.t0);
}

function clipConvexEdge(
  origin: Vector3Like,
  dir: Vector3Like,
  points: number[],
  index: number,
  interval: RayInterval,
  winding: number,
): boolean {
  const next = (index + 2) % points.length;
  const edgeX = points[next] - points[index];
  const edgeZ = points[next + 1] - points[index + 1];
  // the inward normal is the edge's left for a counter-clockwise footprint, its right for a clockwise one
  const inverseLength = winding / (Math.hypot(edgeX, edgeZ) || 1);
  const inwardX = -edgeZ * inverseLength;
  const inwardZ = edgeX * inverseLength;
  const originSide = (origin.x - points[index]) * inwardX
    + (origin.z - points[index + 1]) * inwardZ;
  const directionSide = dir.x * inwardX + dir.z * inwardZ;
  if (Math.abs(directionSide) < EPS) return originSide >= 0;
  const distance = -originSide / directionSide;
  if (directionSide > 0 && distance > interval.t0) {
    interval.t0 = distance;
    interval.nx = -inwardX;
    interval.ny = 0;
    interval.nz = -inwardZ;
  } else if (directionSide < 0 && distance < interval.t1) {
    interval.t1 = distance;
  }
  return interval.t0 <= interval.t1;
}

function rayConvex(
  origin: Vector3Like,
  dir: Vector3Like,
  rec: CollisionRecord,
  shape: Extract<CollisionShape, { kind: 'convex' }>,
  maxDist: number,
  outNormal: MutableVector3Like,
): number {
  const interval = initializeExtrudedInterval(origin, dir, rec, maxDist, true);
  if (!interval) return -1;
  const winding = convexWinding(shape.points);
  for (let index = 0; index < shape.points.length; index += 2) {
    if (!clipConvexEdge(origin, dir, shape.points, index, interval, winding)) return -1;
  }
  if (interval.t1 < 0 || interval.t0 > maxDist) return -1;
  outNormal.set(interval.nx, interval.ny, interval.nz);
  return Math.max(0, interval.t0);
}

/** Ray against the tight footprint extruded from minY to maxY. */
export function rayCollisionRecord(
  origin: Vector3Like,
  dir: Vector3Like,
  rec: CollisionRecord,
  maxDist: number,
  outNormal: MutableVector3Like,
) {
  const sh = rec.shape2;
  if (!sh) return rayAabb(origin, dir, rec, maxDist, outNormal);
  if (sh.kind === 'compound') {
    let best = -1;
    for (const part of sh.parts) {
      // a part with its own vertical extent is only as tall as the geometry that produced it
      _compoundRayRec.min[1] = part.y0 ?? rec.min[1]; _compoundRayRec.max[1] = part.y1 ?? rec.max[1];
      _compoundRayRec.shape2 = part;
      const hit = rayCollisionRecord(
        origin, dir, _compoundRayRec, best < 0 ? maxDist : best, _compoundCandidateNormal,
      );
      if (hit < 0 || (best >= 0 && hit >= best)) continue;
      best = hit;
      _compoundBestNormal.set(
        _compoundCandidateNormal.x, _compoundCandidateNormal.y, _compoundCandidateNormal.z,
      );
    }
    if (best >= 0) outNormal.set(
      _compoundBestNormal.x, _compoundBestNormal.y, _compoundBestNormal.z,
    );
    return best;
  }
  if (sh.kind === 'obb') return rayObb(origin, dir, rec, sh, maxDist, outNormal);
  if (sh.kind === 'circle') return rayCircle(origin, dir, rec, sh, maxDist, outNormal);
  if (sh.kind === 'convex') return rayConvex(origin, dir, rec, sh, maxDist, outNormal);
  return rayAabb(origin, dir, rec, maxDist, outNormal);
}

const _compoundRayRec: CollisionRecord = { min: [0, 0, 0], max: [0, 0, 0] };
const _compoundCandidateNormal: MutableVector3Like = {
  x: 0, y: 0, z: 0,
  set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z; },
};
const _compoundBestNormal: MutableVector3Like = {
  x: 0, y: 0, z: 0,
  set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z; },
};

// ---- Structure openings (destruction P2, docs/DESTRUCTION.md §3.4, §6) -----------------------------------------------

/** Hole slots a section holds, and the values a slot keeps. */
export const STRUCTURE_HOLES_PER_SECTION = 4;
export const STRUCTURE_HOLE_STRIDE = 4;
/** A fallen wall section keeps its lowest metre: the stub stays cover. */
export const STRUCTURE_WALL_STUB_M = 1;
/** A wall's hole passes what meets the wall within this of the struck surface's depth (its thickness, both ways). */
const STRUCTURE_HOLE_DEPTH_M = 0.8;

/**
 * What has opened in one structure (destruction P2): a fallen roof (and the storeys that dropped after it: `capY`),
 * fallen wall sections (one face of the footprint rectangle over one storey, open from a metre above the base) and up
 * to four holes a section. Every shell band of the structure points at it (`CollisionRecord.openings`) once something
 * opens, and the world raycasts then read the structure as a hollow box: a ray whose first surface of the structure
 * lies in an opening crosses the room and stops on the inner face it leaves by where that face is closed (the floor
 * always is), else it passes. The sim's section table (sim/structureSections.ts) writes it from quantized values only,
 * so every peer opens the same.
 *
 * Sections: a wall section is `storey · 4 + face` (the footprint's faces: 0 its +forward end, 1 its −forward end, 2 its
 * +across side, 3 its −across side; across = (cos yaw, −sin yaw)), the roof is `storeys · 4`.
 */
export interface StructureOpenings {
  readonly cx: number;
  readonly cz: number;
  /** The footprint's forward (sin yaw, cos yaw): `hd` along it, `hw` across it. */
  readonly fx: number;
  readonly fz: number;
  readonly hw: number;
  readonly hd: number;
  readonly baseY: number;
  /** Where the walls end and the roof begins. */
  readonly eavesY: number;
  readonly topY: number;
  readonly storeys: number;
  readonly storeyH: number;
  /** Nothing stands above this: `topY` while the roof stands, the eaves once it fell, a storey's floor once that dropped. */
  capY: number;
  /** Per section: 1 once it fell. */
  readonly down: Uint8Array;
  /** Per section: the holes opened in it (≤ STRUCTURE_HOLES_PER_SECTION). */
  readonly holeCount: Uint8Array;
  /**
   * Per section, its slots × STRUCTURE_HOLE_STRIDE values: a wall hole's centre along the face (`u`: across for the
   * end faces, along for the sides), its height (world y), the struck surface's offset from the face's plane (outward
   * positive) and its radius; a roof hole's centre (along, across in the footprint frame), 0 and its radius (a vertical
   * cylinder through the roof).
   */
  readonly holes: Float64Array;
  /** The structure's shell bands (its colliders). */
  readonly records: readonly CollisionRecord[];
  /** Raycast scratch (nearestColliderHit): the ray that last visited the structure, and the record its answer names. */
  rayStamp: number;
  rayRecord: CollisionRecord | null;
}

/**
 * Whether a point on or in a structure lies in one of its openings: above what still stands, in a fallen roof or wall
 * section (a wall keeps its lowest metre), or in a hole. `face`: the face the point lies on when known (0–3 a side, 4
 * the top, 5 the floor, which never opens), else −1 for the side nearest it.
 */
export function structureOpeningAt(openings: StructureOpenings, x: number, y: number, z: number, face = -1): boolean {
  const o = openings;
  if (y > o.capY + 1e-3) return true;
  if (face === 5) return false;
  const dx = x - o.cx, dz = z - o.cz;
  const along = dx * o.fx + dz * o.fz, across = dx * o.fz - dz * o.fx;
  const slots = STRUCTURE_HOLES_PER_SECTION * STRUCTURE_HOLE_STRIDE;
  if (face === 4 || y >= o.eavesY - 1e-3) {
    const roof = o.storeys * 4;
    if (o.down[roof]) return true;
    for (let h = 0, base = roof * slots; h < o.holeCount[roof]; h++, base += STRUCTURE_HOLE_STRIDE) {
      const da = along - o.holes[base], dc = across - o.holes[base + 1], r = o.holes[base + 3];
      if (da * da + dc * dc <= r * r) return true;
    }
    return false;
  }
  let side = face;
  if (side < 0) {
    const pa = Math.abs(along) - o.hd, pc = Math.abs(across) - o.hw;
    side = Math.abs(pa) <= Math.abs(pc) ? (along >= 0 ? 0 : 1) : (across >= 0 ? 2 : 3);
  }
  const w = side === 0 ? along - o.hd : side === 1 ? -along - o.hd : side === 2 ? across - o.hw : -across - o.hw;
  const u = side < 2 ? across : along;
  const storey = Math.min(o.storeys - 1, Math.max(0, Math.floor((y - o.baseY) / o.storeyH)));
  if (o.down[storey * 4 + side] && y >= o.baseY + STRUCTURE_WALL_STUB_M) return true;
  // a hole is a disc on its face, whichever storey's section it was opened in
  for (let k = 0; k < o.storeys; k++) {
    const section = k * 4 + side;
    for (let h = 0, base = section * slots; h < o.holeCount[section]; h++, base += STRUCTURE_HOLE_STRIDE) {
      if (Math.abs(w - o.holes[base + 2]) > STRUCTURE_HOLE_DEPTH_M) continue;
      const du = u - o.holes[base], dy = y - o.holes[base + 1], r = o.holes[base + 3];
      if (du * du + dy * dy <= r * r) return true;
    }
  }
  return false;
}

const _structureExit = { t: 0, face: -1 };

/** Where a ray leaves a structure's box (footprint rectangle × base..top) and by which face, or null if it never meets it. */
function structureBoxExit(o: StructureOpenings, origin: Vector3Like, dir: Vector3Like): typeof _structureExit | null {
  const dx = origin.x - o.cx, dz = origin.z - o.cz;
  const along = dx * o.fx + dz * o.fz, across = dx * o.fz - dz * o.fx;
  const dAlong = dir.x * o.fx + dir.z * o.fz, dAcross = dir.x * o.fz - dir.z * o.fx;
  let enter = -Infinity, exit = Infinity, face = -1;
  if (Math.abs(dAlong) < EPS) {
    if (Math.abs(along) > o.hd) return null;
  } else {
    const t0 = (-o.hd - along) / dAlong, t1 = (o.hd - along) / dAlong;
    enter = Math.max(enter, Math.min(t0, t1));
    const far = Math.max(t0, t1);
    if (far < exit) { exit = far; face = dAlong > 0 ? 0 : 1; }
  }
  if (Math.abs(dAcross) < EPS) {
    if (Math.abs(across) > o.hw) return null;
  } else {
    const t0 = (-o.hw - across) / dAcross, t1 = (o.hw - across) / dAcross;
    enter = Math.max(enter, Math.min(t0, t1));
    const far = Math.max(t0, t1);
    if (far < exit) { exit = far; face = dAcross > 0 ? 2 : 3; }
  }
  if (Math.abs(dir.y) < EPS) {
    if (origin.y < o.baseY || origin.y > o.topY) return null;
  } else {
    const t0 = (o.baseY - origin.y) / dir.y, t1 = (o.topY - origin.y) / dir.y;
    enter = Math.max(enter, Math.min(t0, t1));
    const far = Math.max(t0, t1);
    if (far < exit) { exit = far; face = dir.y > 0 ? 4 : 5; }
  }
  if (enter > exit || exit < 0) return null;
  _structureExit.t = exit;
  _structureExit.face = face;
  return _structureExit;
}

function insideStructureBox(o: StructureOpenings, point: Vector3Like): boolean {
  const dx = point.x - o.cx, dz = point.z - o.cz;
  const along = dx * o.fx + dz * o.fz, across = dx * o.fz - dz * o.fx;
  return Math.abs(along) < o.hd - 0.05 && Math.abs(across) < o.hw - 0.05
    && point.y > o.baseY + 0.05 && point.y < o.topY - 0.05;
}

const _openingsCandidate: MutableVector3Like = {
  x: 0, y: 0, z: 0,
  set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z; },
};
const _openingsFirst: MutableVector3Like = {
  x: 0, y: 0, z: 0,
  set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z; },
};

/**
 * A structure's answer to a ray once something in it has opened (§6): the ray's first surface of the structure, unless
 * that surface lies in an opening (or the ray starts inside the structure) — then the ray crosses the room and stops on
 * the inner face it leaves by where that face is closed, or passes (also when it ends inside). Returns the distance or
 * −1, writes the normal (an inner face's faces the room) and names the hit's record in `openings.rayRecord`.
 */
export function rayStructureOpenings(
  openings: StructureOpenings,
  origin: Vector3Like,
  dir: Vector3Like,
  maxDist: number,
  outNormal: MutableVector3Like,
): number {
  const o = openings;
  let first = -1;
  o.rayRecord = null;
  for (const record of o.records) {
    if (record.dead) continue;
    const distance = rayCollisionRecord(origin, dir, record, first < 0 ? maxDist : first, _openingsCandidate);
    if (distance >= 0 && (first < 0 || distance < first)) {
      first = distance;
      o.rayRecord = record;
      _openingsFirst.set(_openingsCandidate.x, _openingsCandidate.y, _openingsCandidate.z);
    }
  }
  if (first < 0) return -1;
  if (!insideStructureBox(o, origin) && !structureOpeningAt(o,
    origin.x + dir.x * first, origin.y + dir.y * first, origin.z + dir.z * first)) {
    outNormal.set(_openingsFirst.x, _openingsFirst.y, _openingsFirst.z);
    return first;
  }
  // through the opening: across the room to the face the ray leaves by
  const exit = structureBoxExit(o, origin, dir);
  if (!exit || exit.t <= first + 1e-6 || exit.t > maxDist) return -1;
  const t = exit.t, face = exit.face;
  if (structureOpeningAt(o, origin.x + dir.x * t, origin.y + dir.y * t, origin.z + dir.z * t, face)) return -1;
  if (face === 0) outNormal.set(-o.fx, 0, -o.fz);
  else if (face === 1) outNormal.set(o.fx, 0, o.fz);
  else if (face === 2) outNormal.set(-o.fz, 0, o.fx);
  else if (face === 3) outNormal.set(o.fz, 0, -o.fx);
  else if (face === 4) outNormal.set(0, -1, 0);
  else outNormal.set(0, 1, 0);
  return t;
}

/** The nearest record a ray meets (nearestColliderHit's answer). */
export interface ColliderRayHit {
  /** Infinity when it meets none. */
  distance: number;
  record: CollisionRecord | null;
}

let openingsRayStamp = 0;
const openingsVisited: StructureOpenings[] = [];
const _nearestCandidate: MutableVector3Like = {
  x: 0, y: 0, z: 0,
  set(x: number, y: number, z: number) { this.x = x; this.y = y; this.z = z; },
};

/**
 * The nearest shell or sight record a ray meets among a broad phase's candidates — the world raycasts' narrow phase
 * (world/map.ts, world/headlessCollisionWorld.ts): every live record by its footprint, and every structure with
 * openings once, as a whole (rayStructureOpenings). Destroyed records stay in the broad phase for an O(1) rematch
 * restore and are skipped here. Writes the hit's normal into `outNormal`.
 */
export function nearestColliderHit(
  candidates: readonly CollisionRecord[],
  origin: Vector3Like,
  dir: Vector3Like,
  maxDist: number,
  outNormal: MutableVector3Like,
  out: ColliderRayHit,
): ColliderRayHit {
  let best = Infinity;
  let record: CollisionRecord | null = null;
  let structures = 0;
  openingsRayStamp = openingsRayStamp >= 0x7fffffff ? 1 : openingsRayStamp + 1;
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    if (candidate.dead) continue;
    const openings = candidate.openings;
    if (openings) {
      if (openings.rayStamp !== openingsRayStamp) {
        openings.rayStamp = openingsRayStamp;
        openingsVisited[structures++] = openings;
      }
      continue;
    }
    const distance = rayCollisionRecord(origin, dir, candidate, Math.min(maxDist, best), _nearestCandidate);
    if (distance >= 0 && distance < best) {
      best = distance;
      record = candidate;
      outNormal.set(_nearestCandidate.x, _nearestCandidate.y, _nearestCandidate.z);
    }
  }
  for (let i = 0; i < structures; i++) {
    const openings = openingsVisited[i];
    const distance = rayStructureOpenings(openings, origin, dir, Math.min(maxDist, best), _nearestCandidate);
    if (distance >= 0 && distance < best) {
      best = distance;
      record = openings.rayRecord;
      outNormal.set(_nearestCandidate.x, _nearestCandidate.y, _nearestCandidate.z);
    }
  }
  out.distance = best;
  out.record = record;
  return out;
}

/** Static uniform-grid broad phase. Query writes into the caller-owned array. */
export function createObstacleGrid(records: CollisionRecord[], cellSize = 24): ObstacleQuery {
  // The same tree record can belong to movement and shell grids. Keep query
  // visitation local to this grid instead of writing stamps onto shared records.
  // Canonicalize duplicate references once while retaining first-seen order.
  const indexedRecords = [...new Set(records)];
  const visited = new Uint32Array(indexedRecords.length);
  const cells = new Map<number, number[]>();
  const inv = 1 / cellSize;
  // Numeric signed-16 packing avoids allocating "x,z" strings in every
  // per-tank query. Battlefield cell coordinates are comfortably inside it.
  const key = (x: number, z: number) => (x + 32768) * 65536 + (z + 32768);
  for (let i = 0; i < indexedRecords.length; i++) {
    const r = indexedRecords[i];
    const x0 = Math.floor(r.min[0] * inv), x1 = Math.floor(r.max[0] * inv);
    const z0 = Math.floor(r.min[2] * inv), z1 = Math.floor(r.max[2] * inv);
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const k = key(x, z);
      let a = cells.get(k);
      if (!a) { a = []; cells.set(k, a); }
      a.push(i);
    }
  }
  let stamp = 0;
  return function query(
    minX: number, minZ: number, maxX: number, maxZ: number, out: CollisionRecord[],
  ) {
    out.length = 0;
    stamp++;
    if (stamp >= 0x7fffffff) { stamp = 1; visited.fill(0); }
    const x0 = Math.floor(minX * inv), x1 = Math.floor(maxX * inv);
    const z0 = Math.floor(minZ * inv), z1 = Math.floor(maxZ * inv);
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const a = cells.get(key(x, z));
      if (!a) continue;
      for (let i = 0; i < a.length; i++) {
        const index = a[i];
        if (visited[index] === stamp) continue;
        visited[index] = stamp;
        const r = indexedRecords[index];
        if (r.max[0] < minX || r.min[0] > maxX || r.max[2] < minZ || r.min[2] > maxZ) continue;
        out.push(r);
      }
    }
    return out;
  };
}
