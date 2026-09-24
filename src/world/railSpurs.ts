// src/world/railSpurs.ts — authored rail spurs (round 57, 2026-09-24). A map lays a siding as a centreline path
// in its terrain config (`terrain.railSpurs`); the layout carries it to the set-dressing kit, which lays ballast,
// rails, sleepers and buffer stops that follow the ground along the path (maps/mapKits.ts, the same track the rail
// yards run), and the height field keeps vegetation and scattered props out of the track's berth through the
// `_noVeg` exclusion the hardstand aprons use. Renderer-free: the path resampler and the distance math are shared
// by terrain.ts, the kit and the receipts. Soft dressing by contract — a hull rolls over the 0.2 m bed like a curb
// and no collision record is published.
//
// Round 63 (2026-09-24): a spur may author a CUTTING — terrain work, not dressing. From a portal on the spur's last
// edge the bed is graded at a rail grade along that edge to the path's end and on past the edge of the square; the
// ground above the graded bed is cut away to a level floor between batter faces, the ground below it is filled, and
// the height field applies the same rule inside the square (terrain.ts heightAt, after every road, pad, lake and
// trench constraint) and in the outland (outlandHeightAt, the horizon ring's near rows), so the line leaves the
// plateau through a real notch instead of stopping at the rim foot. Past the path's end the floor widens (the fan),
// so the ring's columns can carry the valley mouth the cutting opens into.

export interface RailSpurConfig {
  /**
   * Centreline in metres, two or more points. The kit lays straight spans of at most RAIL_SPUR_SPAN_M between
   * consecutive points; a corner sharper than a few degrees shows as a kink in the rails, so a curve is authored as
   * intermediate points.
   */
  path: readonly (readonly [number, number])[];
  /** Rail centre spacing; omitted = RAIL_SPUR_GAUGE_M (the yards' ±0.72 m). */
  gauge?: number;
  /** Ballast slab width; omitted = RAIL_SPUR_BALLAST_M. */
  ballast?: number;
  /**
   * Buffer stops: 'end' closes the last point of the path, 'start' the first, 'both' closes both ends; omitted leaves
   * the ends open (round 63: a spur that leaves the square through a cutting closes only its stub).
   */
  bufferStop?: 'start' | 'end' | 'both';
  /** Round 63: the cutting the spur leaves the square through (terrain work: terrain.ts carves it, the kit lays on it). */
  cutting?: RailCuttingConfig;
}

export interface RailCuttingConfig {
  /**
   * The portal: a point on the spur's LAST edge where the graded bed leaves the ground. The cutting runs from here
   * along that edge, through the path's end and on into the outland; the rule fades in over RAIL_CUTTING_PORTAL_M
   * before the portal (the bed there is the grade line extrapolated back) and the ground before that is untouched.
   */
  from: readonly [number, number];
  /** Rise of the bed per metre from the portal; omitted = RAIL_CUTTING_GRADE (under the 2.5 % rail grade). */
  grade?: number;
  /** Half-width of the level floor; omitted = RAIL_CUTTING_HALF_FLOOR_M (the ballast and a cess each side). */
  halfFloor?: number;
  /** Batter of the cut faces as horizontal run per metre of rise; omitted = RAIL_CUTTING_BATTER. */
  batter?: number;
  /** Growth of the floor's half-width per metre past the path's end (the outland fan); omitted = RAIL_CUTTING_FAN. */
  fan?: number;
}

/** A resolved cutting: the portal, the unit axis of the spur's last edge, the run to the path's end, its parameters. */
export interface RailCutting {
  px: number;
  pz: number;
  ux: number;
  uz: number;
  /** Distance from the portal to the path's last point along the axis: the fan opens past it. */
  endAlong: number;
  grade: number;
  halfFloor: number;
  batter: number;
  fan: number;
}

interface RailSpan {
  ax: number;
  az: number;
  bx: number;
  bz: number;
}

/** The rail yards' span: their graded ground is flat enough for 10 m slabs (their lines are pinned byte-identical). */
export const RAIL_SPUR_SPAN_M = 10;
/**
 * An authored spur's span across a plain: a rigid slab misses the ground's folds by their sagitta over the span
 * (Tarkhan's loading face, worst slab corner against the ground: 0.23 m with 10 m spans and the yards' two-sample
 * lay, 0.16 m with 5 m under the kit's least-squares lay, 0.13 m with 4 m — and no better with 3 m, where the
 * cross-track curvature no plane can follow is what remains; the deep slab of the 'full' lay hides that).
 */
export const RAIL_SPUR_LAY_M = 4;
export const RAIL_SPUR_GAUGE_M = 1.44;
export const RAIL_SPUR_BALLAST_M = 3.0;
/** Vegetation and scattered props keep this far from the centreline: the slab's half-width plus 2.1 m of shoulder. */
export const RAIL_SPUR_BERTH_M = 3.6;
/**
 * Round 63: the cutting's defaults. A 2.4 % bed (a branch line's ruling grade, under the 2.5 % the round asked for)
 * on an 8 m floor — the 3 m ballast and a 2.5 m cess each side — between faces battered 0.7 horizontal per metre
 * of rise (≈ 55°, a soft-rock cutting: the terrain material's slope rock takes the faces), the floor feathered
 * 2 m into the ground beyond its edge, the whole rule fading in over the 12 m BEFORE the portal — the plain there
 * lies within a few decimetres of the bed, and a fade past the portal let the rim's first rise hump the bed by
 * 0.4 m at the mouth — so the bed is fully graded from the portal on, and the floor widening 0.25 m per metre past
 * the path's end.
 */
export const RAIL_CUTTING_GRADE = 0.024;
export const RAIL_CUTTING_HALF_FLOOR_M = 4;
export const RAIL_CUTTING_BATTER = 0.7;
export const RAIL_CUTTING_FAN = 0.25;
export const RAIL_CUTTING_FEATHER_M = 2;
export const RAIL_CUTTING_PORTAL_M = 12;
/** The exclusion keeps this much more than the floor clear: the cess shoulder the spur berth keeps past its slab. */
const RAIL_CUTTING_SHOULDER_M = RAIL_SPUR_BERTH_M - RAIL_SPUR_BALLAST_M / 2;

/** Horizontal run of a span. Exact for an axis-aligned span (the rail yards' fixed lines stay byte-identical). */
export function railRunLength(dx: number, dz: number): number {
  return dx === 0 ? Math.abs(dz) : dz === 0 ? Math.abs(dx) : Math.hypot(dx, dz);
}

/**
 * Straight spans along a path: every edge is split into round(run / spanM) spans, at least one. By default the
 * spans are spanM long with the remainder in the last one — the rail yards' own segmentation rule, so a two-point
 * path lays exactly the spans the fixed yard lines always did; `even` shares the run equally instead (an authored
 * spur whose run is not a multiple of the span gets no stub slab at its end).
 */
export function resampleRailPath(
  path: RailSpurConfig['path'], spanM = RAIL_SPUR_SPAN_M, even = false,
): RailSpan[] {
  const spans: RailSpan[] = [];
  for (let i = 1; i < path.length; i++) {
    const [ax, az] = path[i - 1], [bx, bz] = path[i];
    const dx = bx - ax, dz = bz - az;
    const run = railRunLength(dx, dz);
    if (!(run > 0)) continue;
    const ux = dx / run, uz = dz / run;
    const count = Math.max(1, Math.round(run / spanM));
    const step = even ? run / count : spanM;
    for (let k = 0; k < count; k++) {
      const tA = k * step, tB = even && k === count - 1 ? run : Math.min(run, tA + step);
      spans.push({ ax: ax + ux * tA, az: az + uz * tA, bx: ax + ux * tB, bz: az + uz * tB });
    }
  }
  return spans;
}

function squaredDistanceToEdge(
  x: number, z: number, ax: number, az: number, dx: number, dz: number, l2: number,
): number {
  let t = l2 > 0 ? ((x - ax) * dx + (z - az) * dz) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const ex = ax + dx * t - x, ez = az + dz * t - z;
  return ex * ex + ez * ez;
}

/** Distance from (x, z) to the nearest spur centreline; Infinity without spurs. */
export function railSpurDistance(spurs: readonly RailSpurConfig[], x: number, z: number): number {
  let best = Infinity;
  for (const spur of spurs) {
    const path = spur.path;
    for (let i = 1; i < path.length; i++) {
      const ax = path[i - 1][0], az = path[i - 1][1];
      const dx = path[i][0] - ax, dz = path[i][1] - az;
      const d2 = squaredDistanceToEdge(x, z, ax, az, dx, dz, dx * dx + dz * dz);
      if (d2 < best) best = d2;
    }
  }
  return Math.sqrt(best);
}

/**
 * The track's berth as a height-field exclusion: true within `berth` metres of any spur centreline (the buffer
 * stops sit inside the end discs). Allocation-free per query; null when the map authors no spur, so every other
 * map's `_noVeg` stays the same function it was.
 */
export function createRailSpurExclusion(
  spurs: readonly RailSpurConfig[] | undefined, berth = RAIL_SPUR_BERTH_M,
): ((x: number, z: number) => boolean) | null {
  if (!spurs?.length) return null;
  const edges: number[] = [];
  for (const spur of spurs) {
    const path = spur.path;
    for (let i = 1; i < path.length; i++) {
      const ax = path[i - 1][0], az = path[i - 1][1];
      const dx = path[i][0] - ax, dz = path[i][1] - az;
      edges.push(ax, az, dx, dz, dx * dx + dz * dz);
    }
  }
  if (edges.length === 0) return null;
  const packed = Float64Array.from(edges), berth2 = berth * berth;
  return (x, z) => {
    for (let at = 0; at < packed.length; at += 5) {
      if (squaredDistanceToEdge(x, z, packed[at], packed[at + 1], packed[at + 2], packed[at + 3], packed[at + 4])
        <= berth2) return true;
    }
    return false;
  };
}

// ---------------------------------------------------------------------------------------------- the cutting (round 63)

function smoothstep01(edge0: number, edge1: number, value: number): number {
  const t = (value - edge0) / (edge1 - edge0);
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
}

/**
 * The cuttings the spurs author, resolved on their last edges: null when no spur authors one (every map without a
 * cutting keeps the height field it had). A portal off the last edge's line or past its end is an authoring error.
 */
export function resolveRailCuttings(spurs: readonly RailSpurConfig[] | undefined): readonly RailCutting[] | null {
  if (!spurs?.length) return null;
  const out: RailCutting[] = [];
  for (const spur of spurs) {
    const cutting = spur.cutting;
    if (!cutting) continue;
    const path = spur.path;
    if (path.length < 2) throw new Error('a rail cutting needs a spur path of two or more points');
    const [ax, az] = path[path.length - 2], [bx, bz] = path[path.length - 1];
    const dx = bx - ax, dz = bz - az, run = railRunLength(dx, dz);
    if (!(run > 0)) throw new Error('a rail cutting needs a last edge with length');
    const ux = dx / run, uz = dz / run;
    const [px, pz] = cutting.from;
    const off = Math.abs((px - ax) * -uz + (pz - az) * ux);
    const endAlong = (bx - px) * ux + (bz - pz) * uz;
    if (off > 0.01 || endAlong < 0 || endAlong > run + 0.01) {
      throw new Error(`rail cutting portal ${px},${pz} is not on the spur's last edge`);
    }
    out.push({
      px, pz, ux, uz, endAlong,
      grade: cutting.grade ?? RAIL_CUTTING_GRADE,
      halfFloor: cutting.halfFloor ?? RAIL_CUTTING_HALF_FLOOR_M,
      batter: cutting.batter ?? RAIL_CUTTING_BATTER,
      fan: cutting.fan ?? RAIL_CUTTING_FAN,
    });
  }
  return out.length ? out : null;
}

/** The graded bed's height `along` metres past the portal whose ground stood at `portalY`. */
export function railCuttingBedY(cutting: RailCutting, portalY: number, along: number): number {
  return portalY + cutting.grade * along;
}

/**
 * The cutting applied to the ground height `h` at (x, z): inside the floor the ground becomes the graded bed (cut or
 * fill), feathered RAIL_CUTTING_FEATHER_M into the ground beyond the floor's edge; ground standing above the batter
 * face that rises from that edge is cut down to the face; the whole change fades in over the RAIL_CUTTING_PORTAL_M
 * before the portal, is full from the portal on and nothing before the fade. Past the path's end the floor widens by
 * the fan. Pure and allocation-free:
 * heightAt and outlandHeightAt (terrain.ts) call it with the same portal height, so the notch continues across the
 * red line unchanged. `portalY` is the ground the portal stood at before the cutting was applied.
 */
export function railCuttingHeight(
  cuttings: readonly RailCutting[], portalYs: ArrayLike<number>, x: number, z: number, h: number,
): number {
  for (let i = 0; i < cuttings.length; i++) {
    const cut = cuttings[i];
    const dx = x - cut.px, dz = z - cut.pz;
    const along = dx * cut.ux + dz * cut.uz;
    if (along <= -RAIL_CUTTING_PORTAL_M) continue;
    const fadeIn = smoothstep01(-RAIL_CUTTING_PORTAL_M, 0, along);
    const lateral = Math.abs(dx * -cut.uz + dz * cut.ux);
    const halfFloor = cut.halfFloor + (along > cut.endAlong ? (along - cut.endAlong) * cut.fan : 0);
    const bedY = portalYs[i] + cut.grade * along;
    const bed = 1 - smoothstep01(halfFloor, halfFloor + RAIL_CUTTING_FEATHER_M, lateral);
    const face = bedY + (lateral > halfFloor ? (lateral - halfFloor) / cut.batter : 0);
    let target = h + (bedY - h) * bed;
    if (target > face) target = face;
    h += (target - h) * fadeIn;
  }
  return h;
}

/**
 * The cutting's exclusion for vegetation and scattered props: the floor and its cess shoulder from the portal on, and
 * every point the cutting lowered by more than a few centimetres (the cut faces up to the daylight line, the fade
 * before the portal included). `groundAt` is the ground BEFORE the cutting (terrain.ts evaluates it with the rule
 * suspended). Cheap off the corridor: the ground is only sampled inside the widest lateral band a face can reach.
 */
export function railCuttingExcludes(
  cuttings: readonly RailCutting[], portalYs: ArrayLike<number>, x: number, z: number,
  groundAt: (x: number, z: number) => number, maxDepth: number,
): boolean {
  for (let i = 0; i < cuttings.length; i++) {
    const cut = cuttings[i];
    const dx = x - cut.px, dz = z - cut.pz;
    const along = dx * cut.ux + dz * cut.uz;
    if (along <= -RAIL_CUTTING_PORTAL_M) continue;
    const lateral = Math.abs(dx * -cut.uz + dz * cut.ux);
    const halfFloor = cut.halfFloor + (along > cut.endAlong ? (along - cut.endAlong) * cut.fan : 0);
    if (along > 0 && lateral <= halfFloor + RAIL_CUTTING_SHOULDER_M) return true;
    if (lateral > halfFloor + RAIL_CUTTING_FEATHER_M + maxDepth * cut.batter) continue;
    const ground = groundAt(x, z);
    if (ground - railCuttingHeight(cuttings, portalYs, x, z, ground) > 0.05) return true;
  }
  return false;
}

