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
// plateau through a real notch instead of stopping at the rim foot. Past the path's end the notch opens as a valley
// along the RADIAL through the end point — the direction the horizon ring's columns run, so the ring carries the
// valley without the oblique ramps a straight off-centre fan drew across the mouth — widening at the fan rate.

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
  /** Growth of the floor's half-width per metre past the path's end (the outland valley); omitted = RAIL_CUTTING_FAN. */
  fan?: number;
}

/** A resolved cutting: the portal, the unit axis of the spur's last edge, the run to the path's end, its parameters. */
export interface RailCutting {
  px: number;
  pz: number;
  ux: number;
  uz: number;
  /** Distance from the portal to the path's last point along the axis: the valley opens past it. */
  endAlong: number;
  /** The path's last point and the unit radial through it (from the map centre): the outland valley's axis. */
  ex: number;
  ez: number;
  fx: number;
  fz: number;
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
 * 0.4 m at the mouth — so the bed is fully graded from the portal on, and the valley past the path's end widening
 * 0.35 m per metre along the radial: at Tarkhan's 19.5° between the line and the radial, the floor keeps the
 * straight-ahead sightline from the mouth inside it to the ring's first ridge (174 m out: 58 m off the valley's
 * axis against a 65 m half-floor).
 */
export const RAIL_CUTTING_GRADE = 0.024;
export const RAIL_CUTTING_HALF_FLOOR_M = 4;
export const RAIL_CUTTING_BATTER = 0.7;
export const RAIL_CUTTING_FAN = 0.35;
export const RAIL_CUTTING_FEATHER_M = 2;
export const RAIL_CUTTING_PORTAL_M = 12;
/**
 * Round 67 (2026-09-24): the tunnel portal that ends the valley. The horizon ring's first authored ridge stands
 * RAIL_TUNNEL_RIDGE_RUN_M past the rim on every style (maps/horizon.ts HORIZON_FIRST_RIDGE_MARGIN_M — the receipt
 * holds the two equal), meandering ±3 %, with the seated foothill rows a quarter of that span apart; so the portal's
 * headwall stands RAIL_TUNNEL_RUN_M past the path's end, before the ridge's foot can wander, and a masonry gallery
 * runs from it to the ridge line, its roof meeting the face wherever the face has climbed to it. The approach bends
 * from the line's heading onto the valley's axis (the radial) on a RAIL_TUNNEL_CURVE_RADIUS_M curve, and the bore is
 * the cutting's floor: RAIL_TUNNEL_BORE_HALF_M each side of the line, a segmental arch springing at
 * RAIL_TUNNEL_SPRING_M with RAIL_TUNNEL_RISE_M of rise, RAIL_TUNNEL_BORE_DEPTH_M of dark bore behind the headwall.
 */
export const RAIL_TUNNEL_RIDGE_RUN_M = 200;
export const RAIL_TUNNEL_RUN_M = 125;
export const RAIL_TUNNEL_GALLERY_M = RAIL_TUNNEL_RIDGE_RUN_M - RAIL_TUNNEL_RUN_M;
export const RAIL_TUNNEL_CURVE_RADIUS_M = 90;
export const RAIL_TUNNEL_BORE_HALF_M = RAIL_CUTTING_HALF_FLOOR_M;
export const RAIL_TUNNEL_BORE_DEPTH_M = 7;
export const RAIL_TUNNEL_SPRING_M = 4.5;
export const RAIL_TUNNEL_RISE_M = 2.5;
export const RAIL_TUNNEL_HEADWALL_HALF_M = 9;
export const RAIL_TUNNEL_HEADWALL_HEIGHT_M = 10.5;
export const RAIL_TUNNEL_WALL_M = 1.5;
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
    const ex = px + ux * endAlong, ez = pz + uz * endAlong, radius = Math.hypot(ex, ez);
    out.push({
      px, pz, ux, uz, endAlong, ex, ez,
      fx: radius > 1e-6 ? ex / radius : ux, fz: radius > 1e-6 ? ez / radius : uz,
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

/** A point in a cutting's frame: the run from the portal (the bed's argument), the lateral distance and the floor's half-width there. */
export interface RailCuttingTerms {
  along: number;
  lateral: number;
  halfFloor: number;
}
const _cuttingTerms: RailCuttingTerms = { along: 0, lateral: 0, halfFloor: 0 };

/**
 * The cutting's frame at (x, z), allocation-free (the shared scratch is returned): inside the square the straight
 * axis from the portal; past the path's end, where the point lies in front of the end plane of the RADIAL through
 * that point, the valley along the radial — the run continues from the path's end, the floor widens by the fan.
 * Null before the fade's start (RAIL_CUTTING_PORTAL_M before the portal) — nothing to do there.
 */
export function railCuttingTermsAt(cut: RailCutting, x: number, z: number): RailCuttingTerms | null {
  const dx = x - cut.px, dz = z - cut.pz;
  const along = dx * cut.ux + dz * cut.uz;
  if (along <= -RAIL_CUTTING_PORTAL_M) return null;
  const out = _cuttingTerms;
  if (along > cut.endAlong) {
    const ox = x - cut.ex, oz = z - cut.ez;
    const run = ox * cut.fx + oz * cut.fz;
    if (run > 0) {
      out.along = cut.endAlong + run;
      out.lateral = Math.abs(ox * -cut.fz + oz * cut.fx);
      out.halfFloor = cut.halfFloor + run * cut.fan;
      return out;
    }
  }
  out.along = along;
  out.lateral = Math.abs(dx * -cut.uz + dz * cut.ux);
  out.halfFloor = cut.halfFloor;
  return out;
}

/**
 * The cutting applied to the ground height `h` at (x, z): ground standing above the bed is cut to the floor and to
 * the batter face that rises from the floor's edge (the face governs from that edge — a feather there climbed to the
 * ground faster than the batter); ground lying under the bed is filled to it, feathered RAIL_CUTTING_FEATHER_M into
 * the ground beyond the floor's edge; the whole change fades in over the RAIL_CUTTING_PORTAL_M before the portal, is
 * full from the portal on and nothing before the fade. Past the path's end the floor widens by the fan. Pure and
 * allocation-free:
 * heightAt and outlandHeightAt (terrain.ts) call it with the same portal height, so the notch continues across the
 * red line unchanged. `portalY` is the ground the portal stood at before the cutting was applied.
 */
export function railCuttingHeight(
  cuttings: readonly RailCutting[], portalYs: ArrayLike<number>, x: number, z: number, h: number,
): number {
  for (let i = 0; i < cuttings.length; i++) {
    const cut = cuttings[i];
    const terms = railCuttingTermsAt(cut, x, z);
    if (terms === null) continue;
    const { along, lateral, halfFloor } = terms;
    const fadeIn = smoothstep01(-RAIL_CUTTING_PORTAL_M, 0, along);
    const bedY = portalYs[i] + cut.grade * along;
    let target: number;
    if (h < bedY) {
      target = h + (bedY - h) * (1 - smoothstep01(halfFloor, halfFloor + RAIL_CUTTING_FEATHER_M, lateral)); // fill
    } else {
      const face = bedY + (lateral > halfFloor ? (lateral - halfFloor) / cut.batter : 0); // the floor, then the batter
      target = h > face ? face : h;
    }
    h += (target - h) * fadeIn;
  }
  return h;
}

/** The horizon ring's near rows seat on the outland exactly inside the notch and hand back over this far past the daylight line. */
export const RAIL_CUTTING_SEAT_FADE_M = 30;

/**
 * Round 63: how far the horizon ring's near rows must seat on the outland itself at (x, z) — 1 inside the cutting's
 * outland corridor (the fan floor and its faces up to the daylight line, read on the uncut outland `groundAt`), fading
 * to 0 over RAIL_CUTTING_SEAT_FADE_M beyond it, 0 everywhere else. The ring continues the square's edge by the rim's
 * interior gradient, sampled 36 m inward along the RADIAL; at a notch narrower than that skew the sample lands on a
 * face or on the floor 12 m off the axis and the ring carried the south face across the mouth as a 10 m hill
 * (maps/horizon.ts seatHorizonSkirtOnGround reads this weight; a map without cuttings publishes none).
 */
export function railCuttingSeatWeight(
  cuttings: readonly RailCutting[], portalYs: ArrayLike<number>, x: number, z: number,
  groundAt: (x: number, z: number) => number,
): number {
  let weight = 0;
  for (let i = 0; i < cuttings.length; i++) {
    const cut = cuttings[i];
    const terms = railCuttingTermsAt(cut, x, z);
    if (terms === null || terms.along <= 0) continue;
    const { along, lateral, halfFloor } = terms;
    const depth = groundAt(x, z) - (portalYs[i] + cut.grade * along);
    const daylight = halfFloor + (depth > 0 ? depth * cut.batter : 0);
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
  groundAt: (x: number, z: number) => number, maxDepth: number,
): boolean {
  for (let i = 0; i < cuttings.length; i++) {
    const cut = cuttings[i];
    const terms = railCuttingTermsAt(cut, x, z);
    if (terms === null) continue;
    const { along, lateral, halfFloor } = terms;
    if (along > 0 && lateral <= halfFloor + RAIL_CUTTING_SHOULDER_M) return true;
    if (lateral > halfFloor + RAIL_CUTTING_FEATHER_M + maxDepth * cut.batter) continue;
    const ground = groundAt(x, z);
    if (ground - railCuttingHeight(cuttings, portalYs, x, z, ground) > 0.05) return true;
  }
  return false;
}


// ---------------------------------------------------------------------------------------------- the tunnel (round 67)

/** The resolved portal of a cutting: the headwall's centre on the bed, the bore's axis (the valley's radial), the
 * approach path from the spur's last point into the bore, and the run of the headwall in the cutting's frame. */
export interface RailTunnel {
  x: number;
  z: number;
  ux: number;
  uz: number;
  /** The headwall's run past the path's end along the valley's axis (RAIL_TUNNEL_RUN_M) and its bed argument. */
  run: number;
  along: number;
  /** How far the approach line lies off the valley's axis (the curve's offset), to screen-left of the axis. */
  offset: number;
  /** The track from the path's end: the curve onto the axis, the straight to the headwall and RAIL_TUNNEL_WALL_M + 2 m into the bore. */
  approach: [number, number][];
}

/**
 * Round 67: the tunnel a cutting's valley ends in — derived, never authored: the headwall RAIL_TUNNEL_RUN_M past the
 * path's end along the radial the valley follows, the approach a circular curve from the line's heading onto that
 * radial (a straight when they agree within a milliradian) sampled every ~4 m, then straight to the headwall and a
 * little into the bore. The curve leaves the line RAIL_TUNNEL_CURVE_RADIUS_M·(1 − cos θ) off the axis; the portal
 * stands on that line, on the floor (the fan is wider than the offset from a few metres out).
 */
export function railCuttingTunnel(cut: RailCutting): RailTunnel {
  const { ex, ez, ux, uz, fx, fz } = cut;
  const dot = ux * fx + uz * fz, cross = ux * fz - uz * fx;
  const theta = Math.atan2(cross, dot); // the turn from the line's heading to the radial (signed)
  const approach: [number, number][] = [[ex, ez]];
  let ax = ex, az = ez;
  if (Math.abs(theta) > 1e-3) {
    // the curve's centre lies to the side of the turn; the heading sweeps from (ux, uz) to (fx, fz)
    const side = theta > 0 ? 1 : -1; // +1: the radial lies counter-clockwise of the heading (x east, z north)
    const R = RAIL_TUNNEL_CURVE_RADIUS_M;
    const nx = -uz * side, nz = ux * side; // the perpendicular toward the curve's centre
    const cx = ex + nx * R, cz = ez + nz * R;
    const steps = Math.max(2, Math.ceil(Math.abs(theta) * R / RAIL_SPUR_LAY_M));
    const rx = ex - cx, rz = ez - cz; // the radius vector from the centre to the path's end
    for (let k = 1; k <= steps; k++) {
      const a = theta * k / steps; // signed: the radius vector turns with the heading
      const c = Math.cos(a), s = Math.sin(a);
      const px = cx + rx * c - rz * s, pz = cz + rx * s + rz * c;
      approach.push([px, pz]);
      ax = px; az = pz;
    }
  }
  const offset = (ax - ex) * -fz + (az - ez) * fx;
  const along = (ax - ex) * fx + (az - ez) * fz;
  const run = RAIL_TUNNEL_RUN_M;
  const x = ax + fx * (run - along), z = az + fz * (run - along);
  if (run - along > 1e-6) approach.push([x, z]);
  approach.push([x + fx * (RAIL_TUNNEL_WALL_M + 2), z + fz * (RAIL_TUNNEL_WALL_M + 2)]);
  return { x, z, ux: fx, uz: fz, run, along: cut.endAlong + run, offset, approach };
}
