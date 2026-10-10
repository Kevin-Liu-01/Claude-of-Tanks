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
// plateau through a real notch instead of stopping at the rim foot. 2026-10-03 (the map-borders lane): past the path's
// end the line runs on in the open along its own heading (RAIL_OPEN_*), in a shallow cutting or on an embankment over
// the land past the edge; the round-63 valley along the radial and the round-67 tunnel at its head are retired.

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
  /**
   * 2026-10-01 (Cinder Junction): a coal stage beside the spur — stockpiles every RAIL_COAL_STAGE_PITCH_M along the
   * path between `fromM` and `toM` (metres from its first point), `offsetM` to one side of the centreline (`side` 1
   * is the left of the path's direction). The kit lays them after the track; each one is admitted by the same
   * clear-site law as the yards' heaps (roads, water, flat ground, no existing solid) and carries its convex record.
   */
  coalStage?: RailCoalStageConfig;
  /**
   * 2026-10-06 (the map-vehicles lane, P5): cuts of rolling stock standing on the spur (maps/rollingStock.ts), each
   * vehicle buffer to buffer with the next. The kit lays them after the track and its stops; each carries a solid
   * convex record (a hull does not drive through a wagon) and blocks shells.
   */
  stock?: readonly RailStockCut[];
}

/** A cut of coupled vehicles on a spur. */
export interface RailStockCut {
  /** Distance along the path from its first point to the cut's first buffer (m). */
  atM: number;
  /** The vehicles in order along the path (rollingStock.ts kinds). */
  kinds: readonly string[];
  /** The vehicles face back along the path (their +Z toward its start): a cut's 180-degree twin. */
  facingBack?: boolean;
}

/**
 * A spur's standing vehicles: each one's kind, the centre of its length on the centreline and the unit direction its
 * +Z faces, from the cuts' distances along the path and the vehicles' lengths over buffers.
 */
export function railStockPlacements(spur: RailSpurConfig, lengths: Readonly<Record<string, number>>):
{ kind: string; x: number; z: number; ux: number; uz: number }[] {
  const out: { kind: string; x: number; z: number; ux: number; uz: number }[] = [];
  if (!spur.stock?.length) return out;
  // the path's edges with their cumulative distances
  const edges: { ax: number; az: number; ux: number; uz: number; from: number; run: number }[] = [];
  let walked = 0;
  for (let i = 1; i < spur.path.length; i++) {
    const [ax, az] = spur.path[i - 1], [bx, bz] = spur.path[i];
    const run = railRunLength(bx - ax, bz - az);
    if (!(run > 0)) continue;
    edges.push({ ax, az, ux: (bx - ax) / run, uz: (bz - az) / run, from: walked, run });
    walked += run;
  }
  const at = (s: number) => {
    const e = edges.find((edge) => s <= edge.from + edge.run) ?? edges[edges.length - 1];
    const t = s - e.from;
    return { x: e.ax + e.ux * t, z: e.az + e.uz * t, ux: e.ux, uz: e.uz };
  };
  for (const cut of spur.stock) {
    let s = cut.atM;
    for (const kind of cut.kinds) {
      const length = lengths[kind];
      if (!(length > 0)) throw new Error(`railStockPlacements: unknown rolling stock ${kind}`);
      const centre = at(s + length / 2);
      out.push({ kind, x: centre.x, z: centre.z, ux: cut.facingBack ? -centre.ux : centre.ux, uz: cut.facingBack ? -centre.uz : centre.uz });
      s += length;
    }
  }
  return out;
}

export interface RailCoalStageConfig {
  side: 1 | -1;
  fromM: number;
  toM: number;
  /** Lateral distance of the stockpiles' centres from the centreline; omitted = RAIL_COAL_STAGE_OFFSET_M. */
  offsetM?: number;
}

/** Spacing of a coal stage's stockpiles along the spur. */
export const RAIL_COAL_STAGE_PITCH_M = 7;
/** A coal stage's default lateral offset: the berth plus a stockpile's half-length and a metre of standing. */
export const RAIL_COAL_STAGE_OFFSET_M = 6.4;

/** The coal stage's stockpile stations: centre points `offsetM` to the stage's side, every pitch from `fromM` to `toM`. */
export function railCoalStageStations(spur: RailSpurConfig): { x: number; z: number; ux: number; uz: number }[] {
  const stage = spur.coalStage;
  if (!stage) return [];
  const offset = stage.offsetM ?? RAIL_COAL_STAGE_OFFSET_M, out: { x: number; z: number; ux: number; uz: number }[] = [];
  let walked = 0;
  for (let i = 1; i < spur.path.length; i++) {
    const [ax, az] = spur.path[i - 1], [bx, bz] = spur.path[i];
    const run = railRunLength(bx - ax, bz - az);
    if (!(run > 0)) continue;
    const ux = (bx - ax) / run, uz = (bz - az) / run;
    for (let at = Math.ceil(Math.max(0, stage.fromM - walked) / RAIL_COAL_STAGE_PITCH_M) * RAIL_COAL_STAGE_PITCH_M;
      at <= run && walked + at <= stage.toM; at += RAIL_COAL_STAGE_PITCH_M) {
      if (walked + at < stage.fromM) continue;
      // the left of the direction (ux, uz) in the x–z plane is (-uz, ux)
      out.push({ x: ax + ux * at - uz * offset * stage.side, z: az + uz * at + ux * offset * stage.side, ux, uz });
    }
    walked += run;
  }
  return out;
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
}

/** A resolved cutting: the portal, the unit axis of the spur's last edge, the run to the path's end, its parameters. */
export interface RailCutting {
  px: number;
  pz: number;
  ux: number;
  uz: number;
  /** Distance from the portal to the path's last point along the axis: the open line runs on past it. */
  endAlong: number;
  /** The path's last point (on the square's edge): the open line's station 0. */
  ex: number;
  ez: number;
  grade: number;
  halfFloor: number;
  batter: number;
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
 * 0.4 m at the mouth — so the bed is fully graded from the portal on, and the valley past the path's end widening
 * 0.35 m per metre along the radial: at Tarkhan's 19.5° between the line and the radial, the floor keeps the
 * straight-ahead sightline from the mouth inside it to the ring's first ridge (174 m out: 58 m off the valley's
 * axis against a 65 m half-floor).
 */
export const RAIL_CUTTING_GRADE = 0.024;
export const RAIL_CUTTING_HALF_FLOOR_M = 4;
export const RAIL_CUTTING_BATTER = 0.7;
export const RAIL_CUTTING_FEATHER_M = 2;
export const RAIL_CUTTING_PORTAL_M = 12;
/**
 * 2026-10-03 (the map-borders lane; supersedes round 67's tunnel): past the square's edge a railway that leaves through
 * a cutting runs on in the open. The land there is no longer the classic rim's plateau (borderLandform.ts), so there is
 * no hill to bore and the tunnel's hill was the last wall round the square. The line keeps its own heading for
 * RAIL_OPEN_RUN_M; its bed continues the cutting's at the path's end and then follows the outland's own ground, smoothed
 * over ±40 m and graded to at most RAIL_OPEN_GRADE, in a shallow cutting or on an embankment. The formation widens over
 * the first RAIL_OPEN_WIDEN_M past the edge to RAIL_OPEN_HALF_FLOOR_M each side of the line — the right of way, wide
 * enough that the horizon ring (whose faces are 8-16 m across there) draws the level floor the laid track lies on —
 * and its cut faces and fill banks ease from the cutting's batter to RAIL_OPEN_BANK run per metre (fill banks eased in
 * over the first RAIL_OPEN_BANK_EASE_M); the corridor hands back to the ground over its last third. The kit lays the
 * first RAIL_OPEN_KIT_M of track past the edge; the horizon ring draws the ballast beyond (terrain.ts railExitAt).
 */
export const RAIL_OPEN_RUN_M = 900;
/** The ranges stand back from the open line by this much (borderLandform.ts BorderValley.holdM): it runs into a valley. */
export const RAIL_OPEN_RANGES_BACK_M = 320;
export const RAIL_OPEN_HALF_FLOOR_M = 12;
export const RAIL_OPEN_WIDEN_M = 30;
export const RAIL_OPEN_STEP_M = 20;
export const RAIL_OPEN_GRADE = 0.015;
export const RAIL_OPEN_BANK = 1.6;
const RAIL_OPEN_BANK_EASE_M = 20;
export const RAIL_OPEN_KIT_M = 240;
/** The exclusion keeps this much more than the floor clear: the cess shoulder the spur berth keeps past its slab. */
const RAIL_CUTTING_SHOULDER_M = RAIL_SPUR_BERTH_M - RAIL_SPUR_BALLAST_M / 2;
/**
 * Round 67 (2026-09-24): grass and scrub seed the upper part of a cut face. The `_noVeg` exclusion keeps the floor,
 * the cess and the whole face bare for trees, rocks and scattered props as before; the height field's
 * `_batterSeedAt` hook (the frame helper below) gives the tuft and bush seeders a weight on the face that is 0 up
 * to RAIL_CUTTING_SEED_FROM of the face's rise and climbs to RAIL_CUTTING_SEED_MAX at the daylight line, thinned
 * per candidate by a position hash (railCuttingSeedAdmits) so the batter reads as sparse growth in the rock, not a
 * sward. The vegetation seeders relax their slope gates to RAIL_CUTTING_SEED_NORMAL_Y where the weight admits.
 */
export const RAIL_CUTTING_SEED_FROM = 1 / 3;
export const RAIL_CUTTING_SEED_MAX = 0.45;
export const RAIL_CUTTING_SEED_NORMAL_Y = 0.5;

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
    const ex = px + ux * endAlong, ez = pz + uz * endAlong;
    out.push({
      px, pz, ux, uz, endAlong, ex, ez,
      grade: cutting.grade ?? RAIL_CUTTING_GRADE,
      halfFloor: cutting.halfFloor ?? RAIL_CUTTING_HALF_FLOOR_M,
      batter: cutting.batter ?? RAIL_CUTTING_BATTER,
    });
  }
  return out.length ? out : null;
}

/** The graded bed's height `along` metres past the portal whose ground stood at `portalY` (past the path's end the open
 * line's own profile, when it is given). */
export function railCuttingBedY(cutting: RailCutting, portalY: number, along: number, open: RailOpenLine | null = null): number {
  const past = along - cutting.endAlong;
  if (past <= 0 || !open) return portalY + cutting.grade * along;
  const f = Math.min(open.ys.length - 1.0001, past / RAIL_OPEN_STEP_M), i = Math.floor(f), t = f - i;
  return open.ys[i] + (open.ys[i + 1] - open.ys[i]) * t;
}

/** A cutting's open line past the path's end: the bed's height at stations RAIL_OPEN_STEP_M apart (station 0 = the end). */
export interface RailOpenLine { ys: Float64Array }

/**
 * The open line of a cutting from the outland's ground BEFORE the line (terrain.ts outlandHeightAt): station 0 the
 * cutting's bed at the path's end, then the ground along the axis smoothed over ±2 stations and graded to at most
 * RAIL_OPEN_GRADE from the station before.
 */
export function resolveRailOpenLine(cut: RailCutting, portalY: number, groundAt: (x: number, z: number) => number): RailOpenLine {
  const n = Math.ceil(RAIL_OPEN_RUN_M / RAIL_OPEN_STEP_M);
  const raw = new Float64Array(n + 1), ys = new Float64Array(n + 1);
  for (let i = 0; i <= n; i++) raw[i] = groundAt(cut.ex + cut.ux * i * RAIL_OPEN_STEP_M, cut.ez + cut.uz * i * RAIL_OPEN_STEP_M);
  ys[0] = portalY + cut.grade * cut.endAlong;
  const climb = RAIL_OPEN_STEP_M * RAIL_OPEN_GRADE;
  for (let i = 1; i <= n; i++) {
    let sum = 0, count = 0;
    for (let k = Math.max(1, i - 2); k <= Math.min(n, i + 2); k++) { sum += raw[k]; count++; }
    ys[i] = Math.min(ys[i - 1] + climb, Math.max(ys[i - 1] - climb, sum / count));
  }
  return { ys };
}

/** A point in a cutting's frame: the run from the portal (the bed's argument), the lateral distance, the floor's
 * half-width there and the batter of its faces (run per metre of rise). */
export interface RailCuttingTerms {
  along: number;
  lateral: number;
  halfFloor: number;
  batter: number;
}
const _cuttingTerms: RailCuttingTerms = { along: 0, lateral: 0, halfFloor: 0, batter: 1 };

/**
 * The cutting's frame at (x, z), allocation-free (the shared scratch is returned): the straight axis from the portal,
 * through the path's end and on along the open line past it (2026-10-03: the round-63 valley along the radial and its
 * fan went with the tunnel). Null before the fade's start (RAIL_CUTTING_PORTAL_M before the portal) and past the open
 * line's run — nothing to do there.
 */
export function railCuttingTermsAt(cut: RailCutting, x: number, z: number): RailCuttingTerms | null {
  const dx = x - cut.px, dz = z - cut.pz;
  const along = dx * cut.ux + dz * cut.uz;
  if (along <= -RAIL_CUTTING_PORTAL_M || along >= cut.endAlong + RAIL_OPEN_RUN_M) return null;
  const out = _cuttingTerms;
  out.along = along;
  out.lateral = Math.abs(dx * -cut.uz + dz * cut.ux);
  out.halfFloor = cut.halfFloor;
  out.batter = cut.batter;
  if (along > cut.endAlong) {
    // the open line's right of way: the floor widens and the faces ease to the open banks past the edge
    const widen = smoothstep01(0, RAIL_OPEN_WIDEN_M, along - cut.endAlong);
    out.halfFloor += (Math.max(cut.halfFloor, RAIL_OPEN_HALF_FLOOR_M) - cut.halfFloor) * widen;
    out.batter += (Math.max(cut.batter, RAIL_OPEN_BANK) - cut.batter) * widen;
  }
  return out;
}

/**
 * The cutting applied to the ground height `h` at (x, z): ground standing above the bed is cut to the floor and to
 * the batter face that rises from the floor's edge (the face governs from that edge — a feather there climbed to the
 * ground faster than the batter); ground lying under the bed is filled to it, feathered RAIL_CUTTING_FEATHER_M into
 * the ground beyond the floor's edge; the whole change fades in over the RAIL_CUTTING_PORTAL_M before the portal, is
 * full from the portal on and nothing before the fade. Past the path's end the open line's bed (`opens`, terrain.ts)
 * replaces the grade line, its fill is an embankment with real banks, and the corridor hands back to the ground over
 * its last third. Pure and allocation-free:
 * heightAt and outlandHeightAt (terrain.ts) call it with the same portal height, so the notch continues across the
 * red line unchanged. `portalY` is the ground the portal stood at before the cutting was applied.
 */
export function railCuttingHeight(
  cuttings: readonly RailCutting[], portalYs: ArrayLike<number>, x: number, z: number, h: number,
  opens: readonly (RailOpenLine | null)[] | null = null,
): number {
  for (let i = 0; i < cuttings.length; i++) {
    const cut = cuttings[i];
    const terms = railCuttingTermsAt(cut, x, z);
    if (terms === null) continue;
    const { along, lateral, halfFloor, batter } = terms;
    const past = along - cut.endAlong;
    // the change fades in before the portal and, on the open line, hands back to the ground over its last third
    let weight = smoothstep01(-RAIL_CUTTING_PORTAL_M, 0, along);
    if (past > 0) weight *= 1 - smoothstep01(RAIL_OPEN_RUN_M * 0.62, RAIL_OPEN_RUN_M, past);
    if (weight <= 0) continue;
    const bedY = railCuttingBedY(cut, portalYs[i], along, opens?.[i] ?? null);
    let target: number;
    if (h < bedY) {
      // fill: the square's feathered toe, and past the edge an embankment with real banks
      const feather = h + (bedY - h) * (1 - smoothstep01(halfFloor, halfFloor + RAIL_CUTTING_FEATHER_M, lateral));
      if (past > 0) {
        const bank = Math.max(h, bedY - Math.max(0, lateral - halfFloor) / RAIL_OPEN_BANK);
        target = feather + (bank - feather) * smoothstep01(0, RAIL_OPEN_BANK_EASE_M, past);
      } else target = feather;
    } else {
      const face = bedY + (lateral > halfFloor ? (lateral - halfFloor) / batter : 0); // the floor, then the batter
      target = h > face ? face : h;
    }
    h += (target - h) * weight;
  }
  return h;
}

/** The horizon ring's near rows seat on the outland exactly inside the notch and hand back over this far past the daylight line. */
export const RAIL_CUTTING_SEAT_FADE_M = 30;

/**
 * Round 63: how far the horizon ring's near rows must seat on the outland itself at (x, z) — 1 inside the cutting's
 * outland corridor (the open line's floor and its faces up to the daylight line or its banks to their toe, read on the
 * uncut outland `groundAt`), fading
 * to 0 over RAIL_CUTTING_SEAT_FADE_M beyond it, 0 everywhere else. The ring continues the square's edge by the rim's
 * interior gradient, sampled 36 m inward along the RADIAL; at a notch narrower than that skew the sample lands on a
 * face or on the floor 12 m off the axis and the ring carried the south face across the mouth as a 10 m hill
 * (maps/horizon.ts seatHorizonSkirtOnGround reads this weight; a map without cuttings publishes none).
 */
export function railCuttingSeatWeight(
  cuttings: readonly RailCutting[], portalYs: ArrayLike<number>, x: number, z: number,
  groundAt: (x: number, z: number) => number, opens: readonly (RailOpenLine | null)[] | null = null,
): number {
  let weight = 0;
  for (let i = 0; i < cuttings.length; i++) {
    const cut = cuttings[i];
    const terms = railCuttingTermsAt(cut, x, z);
    if (terms === null || terms.along <= 0) continue;
    const { along, lateral, halfFloor, batter } = terms;
    const depth = groundAt(x, z) - railCuttingBedY(cut, portalYs[i], along, opens?.[i] ?? null);
    // the daylight line of a cut face, or the toe of an embankment's bank past the edge
    const daylight = halfFloor + (depth > 0 ? depth * batter : along > cut.endAlong ? -depth * RAIL_OPEN_BANK : 0);
    if (lateral >= daylight + RAIL_CUTTING_SEAT_FADE_M) continue;
    const w = 1 - smoothstep01(daylight, daylight + RAIL_CUTTING_SEAT_FADE_M, lateral);
    if (w > weight) weight = w;
  }
  return weight;
}

/**
 * The cutting's exclusion for vegetation and scattered props: the floor and its cess shoulder from the portal on, and
 * every point the cutting lowered by more than a few centimetres (the cut faces up to the daylight line, the fade
 * before the portal included). `groundAt` is the ground BEFORE the cutting (terrain.ts evaluates it with the rule
 * suspended). Cheap off the corridor: the ground is only sampled inside the widest lateral band a face can reach.
 */
export function railCuttingExcludes(
  cuttings: readonly RailCutting[], portalYs: ArrayLike<number>, x: number, z: number,
  groundAt: (x: number, z: number) => number, maxDepth: number, opens: readonly (RailOpenLine | null)[] | null = null,
): boolean {
  for (let i = 0; i < cuttings.length; i++) {
    const cut = cuttings[i];
    const terms = railCuttingTermsAt(cut, x, z);
    if (terms === null) continue;
    const { along, lateral, halfFloor, batter } = terms;
    if (along > 0 && lateral <= halfFloor + RAIL_CUTTING_SHOULDER_M) return true;
    if (lateral > halfFloor + RAIL_CUTTING_FEATHER_M + maxDepth * Math.max(batter, along > cut.endAlong ? RAIL_OPEN_BANK : 0)) continue;
    const ground = groundAt(x, z);
    if (Math.abs(ground - railCuttingHeight(cuttings, portalYs, x, z, ground, opens)) > 0.05) return true;
  }
  return false;
}

/**
 * Round 67: the seeding weight of a cut face at (x, z) — 0 off the faces (the floor, the cess, the fill, the ground
 * above the daylight line, the fade before the portal), 0 on the lower RAIL_CUTTING_SEED_FROM of the face's rise,
 * rising linearly to RAIL_CUTTING_SEED_MAX at the daylight line. The rise is read in the cutting's own frame (the
 * face climbs (lateral − halfFloor) / batter from the floor's edge); the face's full rise at this cross-section is
 * the uncut ground `groundAt` over the bed, so the weight is a fraction of THIS face, deep or shallow. Pure and
 * allocation-free like the exclusion; a map without cuttings publishes no hook.
 */
export function railCuttingFaceSeedAt(
  cuttings: readonly RailCutting[], portalYs: ArrayLike<number>, x: number, z: number,
  groundAt: (x: number, z: number) => number, maxDepth: number, opens: readonly (RailOpenLine | null)[] | null = null,
): number {
  let weight = 0;
  for (let i = 0; i < cuttings.length; i++) {
    const cut = cuttings[i];
    const terms = railCuttingTermsAt(cut, x, z);
    if (terms === null || terms.along <= 0) continue;
    const { along, lateral, halfFloor, batter } = terms;
    if (lateral <= halfFloor + RAIL_CUTTING_SHOULDER_M) return 0; // the floor and the cess stay bare
    if (lateral > halfFloor + RAIL_CUTTING_FEATHER_M + maxDepth * batter) continue;
    const ground = groundAt(x, z);
    const bedY = railCuttingBedY(cut, portalYs[i], along, opens?.[i] ?? null);
    const depth = ground - bedY; // the face's rise at this cross-section
    if (depth <= 0.05) continue;
    const rise = (lateral - halfFloor) / batter; // the face's height over the floor at this lateral
    if (rise >= depth - 0.05) continue; // above the daylight line: the ground it was
    const f = rise / depth;
    if (f <= RAIL_CUTTING_SEED_FROM) continue;
    const w = RAIL_CUTTING_SEED_MAX * (f - RAIL_CUTTING_SEED_FROM) / (1 - RAIL_CUTTING_SEED_FROM);
    if (w > weight) weight = w;
  }
  return weight;
}

const _seedBits = new Float64Array(2);
const _seedWords = new Uint32Array(_seedBits.buffer);

/**
 * Round 67: whether a seeding candidate at (x, z) is admitted under a face weight — a deterministic per-position
 * trial (the bits of the coordinates hashed, no spatial cell pattern and no draw from any stream), so the same
 * candidate always gets the same answer and the admitted share over many candidates is the weight.
 */
export function railCuttingSeedAdmits(weight: number, x: number, z: number): boolean {
  if (weight <= 0) return false;
  _seedBits[0] = x;
  _seedBits[1] = z;
  let h = (_seedWords[0] ^ Math.imul(_seedWords[1], 0x9e3779b1) ^ Math.imul(_seedWords[2], 0x85ebca6b) ^ Math.imul(_seedWords[3], 0xc2b2ae35)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296 < weight;
}
