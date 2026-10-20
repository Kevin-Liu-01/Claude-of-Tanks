// src/world/civic/pathwayKit.ts — a town's pathway architecture from its plan (the maps lane, 228; the owner, 2026-10-18:
// "fix / improve the pathways in steinburg", 2026-10-19: "finalize all 'pathway' architecture"). It replaces the legacy
// kerb pass (props.ts placeStreetCurbs: a kerb at 5.05 m and a 2.25 m slab at 6.35 m down both sides of every street in
// the town rect, under the houses, across the square, through the gates and past the wall) for a map that adopts it:
//   - inside the wall a main street and a lane (gasse) are kerbed down both sides, their kerb face `kerbM` off the
//     centreline, the pavement from the kerb's back out to the facade line where a house fronts it (at most `maxWalkM`,
//     the lane's `lane.maxWalkM`) and `openWalkM` (`lane.openWalkM`) where none does (a garden wall, a verge): one run
//     from corner to corner, broken only by a junction's mouth, a house stepping out to the kerb, a square (`exclude`:
//     the room's own frontage walks take it there) or the wall line; past the wall a main street keeps its pavement only
//     where houses front it (`frontage`: a suburb outside a gate); a lane's kerb is lower (`lane.face`);
//     (228 r2: the blind pairs lost every lane and the gate road to the legacy strips — "the pavement dissolves into a
//     dark, ragged, weedy strip", "pill-ended pavement stubs" — so the runs stopped needing a house to stand)
//   - each run is one ribbon, kerb units of a metre or so and flags in courses, every vertex seated on the ground under
//     it (no level step at a joint), a dressed end only where the run ends;
//   - where a lane or an alley meets a street and the street's pavement runs on to its mouth, the kerb returns round
//     the corner on its radius into the lane's mouth (on to the lane's own run), the corner paved;
//   - a pavement that meets a square's flush walk ramps its kerb down to flush over 2 m;
// The legacy pass's draws are burnt first (8 of the props' main stream a legacy piece, as it drew them), so every later
// placement keeps its seat. One geometry on the baked material, no draw and no record of its own; the runs' footprints
// for the props' vehicle and cart seats (streetKerbFootprints).
import type * as THREE from 'three';
import { CivicMesh, hexRgb, scaleRgb, toned, type Rgb } from './civicMesh.ts';
import type { CivicPlot } from './civicAreaKit.ts';
import type { RegionalCivicStyle } from './styles.ts';
import type { CivicPoint, CivicRect, PathwayPlan } from './types.ts';

type Road = ReadonlyArray<readonly [number, number]>;

export interface PathwayContext {
  roads: readonly Road[];
  ground(x: number, z: number): number;
  plots: readonly CivicPlot[];
  /** the props' main stream: the legacy pass's draws are spent from it */
  rng: () => number;
  /** the legacy pass's town rect and its other-road distance (props.ts distToOtherRoads) */
  town: CivicRect;
  distToOtherRoads(x: number, z: number, skip: number): number;
  /** a phone lays the lean runs: square-arrised kerbs, a flag a sample across the pavement's width (absent: desktop) */
  tier?: 'desktop' | 'mobile';
  /** (228 r2) whether a structure's or a wall's own collision footprint (its ground contact, `m` metres grown) stands at
   *  (x, z): a jettied front or a shop's step stands out past its plot; absent, the plots alone */
  solidAt?(x: number, z: number, m: number): boolean;
  /** (229) whether (x, z) is on a bridge deck's span (its parapets own its edges: no kerb there) */
  onDeck?(x: number, z: number): boolean;
  /** (229) whether the map ran the legacy kerb pass (props.curbs): its draws are spent first; false on a map that never
   *  laid kerbs (nothing to spend: every later seat keeps its place) */
  legacy?: boolean;
}

export interface PathwayFootprint { pts: Array<[number, number]>; foot: number }

export interface PathwayBuild {
  geometry: THREE.BufferGeometry | null;
  footprints: PathwayFootprint[];
  census: Record<string, number>;
  debug: Array<{ pts: number[]; col: [number, number, number]; fill?: [number, number, number] }>;
}

const STEP = 1.0;
const SKIN = 0.012;

/** The legacy kerb pass's draws (props.ts placeStreetCurbs: two jitterUV a piece, four draws each), spent. */
export function burnLegacyKerbDraws(ctx: PathwayContext): number {
  if (ctx.legacy === false) return 0;
  let pieces = 0;
  const { town } = ctx;
  for (let ri = 0; ri < ctx.roads.length; ri++) {
    const nodes = ctx.roads[ri];
    for (let i = 0; i < nodes.length - 1; i++) {
      const [ax, az] = nodes[i], [bx, bz] = nodes[i + 1];
      const mx = (ax + bx) / 2, mz = (az + bz) / 2;
      if (mx < town.x0 - 6 || mx > town.x1 + 6 || mz < town.z0 - 6 || mz > town.z1 + 6) continue;
      const dx = bx - ax, dz = bz - az, len = Math.hypot(dx, dz), tx = dx / len, tz = dz / len;
      const nSub = Math.max(1, Math.ceil(len / 5.2));
      for (let k = 0; k < nSub; k++) {
        const tt = (k + 0.5) / nSub, cx = ax + dx * tt, cz = az + dz * tt;
        for (const side of [-1, 1]) {
          const px = cx - tz * side * 5.05, pz = cz + tx * side * 5.05;
          if (ctx.distToOtherRoads(px, pz, ri) < 6.8) continue;
          for (let d = 0; d < 8; d++) ctx.rng();
          pieces++;
        }
      }
    }
  }
  return pieces;
}

/** Whether (x, z) is inside any of a town's polygons. */
function insideTown(polys: ReadonlyArray<readonly CivicPoint[]>, x: number, z: number): boolean {
  return polys.some((poly) => insidePolygon(poly, x, z));
}
/** The distance from (x, z) to the nearest of a town's polygons' boundaries. */
function townEdgeDistance(polys: ReadonlyArray<readonly CivicPoint[]>, x: number, z: number): number {
  let best = Infinity;
  for (const poly of polys) best = Math.min(best, polygonEdgeDistance(poly, x, z));
  return best;
}
/** Whether (x, z) is inside a polygon (even-odd). */
function insidePolygon(poly: readonly CivicPoint[], x: number, z: number): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
/** The distance from (x, z) to a polygon's boundary. */
function polygonEdgeDistance(poly: readonly CivicPoint[], x: number, z: number): number {
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, az] = poly[j], [bx, bz] = poly[i], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}
const inRect = (r: CivicRect, x: number, z: number, m = 0): boolean => x >= r.x0 - m && x <= r.x1 + m && z >= r.z0 - m && z <= r.z1 + m;

/** A plot's footprint test with a margin (its oriented rectangle grown by `m`). */
function inPlot(p: CivicPlot, x: number, z: number, m = 0): boolean {
  const dx = x - p.x, dz = z - p.z, c = Math.cos(p.rot), s = Math.sin(p.rot);
  return Math.abs(dx * c - dz * s) <= p.w / 2 + m && Math.abs(dx * s + dz * c) <= p.d / 2 + m;
}

/** A road resampled every `step` metres along its length: points, unit tangents, and the running length. */
function resample(road: Road, step = STEP): { p: Array<[number, number]>; t: Array<[number, number]>; s: number[] } {
  const p: Array<[number, number]> = [], t: Array<[number, number]> = [], s: number[] = [];
  let acc = 0;
  for (let i = 0; i + 1 < road.length; i++) {
    const [ax, az] = road[i], [bx, bz] = road[i + 1], len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(len / step));
    for (let k = i ? 1 : 0; k <= n; k++) {
      const f = k / n;
      p.push([ax + (bx - ax) * f, az + (bz - az) * f]);
      s.push(acc + len * f);
    }
    acc += len;
  }
  for (let i = 0; i < p.length; i++) {
    const a = p[Math.max(0, i - 1)], b = p[Math.min(p.length - 1, i + 1)], l = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    t.push([(b[0] - a[0]) / l, (b[1] - a[1]) / l]);
  }
  return { p, t, s };
}

/** The nearest point of a polyline to (x, z) and its distance. */
function nearestOnRoad(road: Road, x: number, z: number): { d: number; i: number; f: number } {
  let best = { d: Infinity, i: 0, f: 0 };
  for (let i = 0; i + 1 < road.length; i++) {
    const [ax, az] = road[i], [bx, bz] = road[i + 1], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
    const f = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
    const d = Math.hypot(x - ax - dx * f, z - az - dz * f);
    if (d < best.d) best = { d, i, f };
  }
  return best;
}

interface Sample {
  x: number; z: number; nx: number; nz: number; state: 'fronted' | 'open' | 'blocked'; outer: number; why?: string;
  /** past the wall line (a main street's suburb: its runs only where houses front it) */
  past?: boolean;
}

/** The pathway architecture of a town from its plan. */
export function buildPathwayNetwork(plan: PathwayPlan, style: RegionalCivicStyle, ctx: PathwayContext): PathwayBuild {
  const census: Record<string, number> = { legacyPieces: burnLegacyKerbDraws(ctx) };
  const debug: PathwayBuild['debug'] = [];
  const footprints: PathwayFootprint[] = [];
  const m = new CivicMesh(ctx.ground), lean = ctx.tier === 'mobile';
  // (229) the style's sample step along a street and its flags' courses at most (a city's big cast slabs: fewer, longer)
  const step = style.pavement.step ?? STEP, maxCourses = style.pavement.maxCourses ?? Infinity;
  const K = plan.kerbM, KW = style.kerb.width, W0 = K + KW;
  const [fNear, fFar] = plan.frontage;
  const kerbCol = hexRgb(style.kerb.hex), flagCol = hexRgb(style.pavement.hex), jointCol = hexRgb(style.pavement.joint);
  const classOf = (ri: number) => plan.classes[ri] ?? 'none';
  // the kerbed streets: the main streets and the lanes, each its own kerb face and pavement widths
  const kerbed = Object.entries(plan.classes).filter(([, c]) => c === 'main' || c === 'gasse').map(([i]) => Number(i));
  const prof = (ri: number) => (classOf(ri) === 'main'
    ? { face: style.kerb.face, maxWalk: plan.maxWalkM, openWalk: plan.openWalkM }
    : { face: plan.lane.face, maxWalk: plan.lane.maxWalkM, openWalk: plan.lane.openWalkM });
  // the half-width each other road keeps clear at a junction (a kerbed street's kerb, a footpath's verge)
  const clearOf = (ri: number) => (classOf(ri) === 'main' || classOf(ri) === 'gasse' ? K + 0.4 : 4.0);
  const plotsNear = (x: number, z: number, r: number) => ctx.plots.filter((p) => Math.hypot(p.x - x, p.z - z) < r + Math.hypot(p.w, p.d) / 2);

  // ---------------------------------------------------------------------------------------- junction corners (returns)
  interface Corner {
    road: number; jx: number; jz: number; dA: [number, number]; dB: [number, number]; other: number;
    /** the main street's normal toward the lane, the lane's toward the street's run, the fillet's centre and tangents */
    nAc: [number, number]; t0: number; O: [number, number]; TA: [number, number]; TB: [number, number];
    /** the lane's normal toward the street's run, and the lane's tangent point's distance along it from the junction */
    nBc: [number, number]; tB: number;
    /** (228 r3) the pavements' outer edges at the corner (from each street's centreline), once a run meets it */
    outerA?: number; outerB?: number;
  }
  const dot2 = (p: readonly number[], q: readonly number[]) => p[0] * q[0] + p[1] * q[1];
  const corners: Corner[] = [];
  for (const ri of kerbed) {
    const A = ctx.roads[ri];
    for (let rj = 0; rj < ctx.roads.length; rj++) {
      if (rj === ri || classOf(rj) === 'none') continue;
      const B = ctx.roads[rj];
      // where B meets A: an end of B on A (a T), or (229 b2: Suzhou Creek's streets cross, none ends on another) B crossing
      // A, its four corners (the pair once: a kerbed B's own pass takes none of them again)
      const specs: Array<{ ex: number; ez: number; dB: [number, number]; near: { d: number; i: number; f: number } }> = [];
      for (const end of [0, B.length - 1]) {
        const [ex, ez] = B[end], near = nearestOnRoad(A, ex, ez);
        if (near.d > 2.5) continue;
        const nb = B[end === 0 ? 1 : B.length - 2], bl = Math.hypot(nb[0] - ex, nb[1] - ez) || 1;
        specs.push({ ex, ez, dB: [(nb[0] - ex) / bl, (nb[1] - ez) / bl], near });
      }
      if (!(kerbed.includes(rj) && rj < ri)) for (let sb = 0; sb + 1 < B.length; sb++) for (let sa = 0; sa + 1 < A.length; sa++) {
        const [p0x, p0z] = A[sa], [p1x, p1z] = A[sa + 1], [q0x, q0z] = B[sb], [q1x, q1z] = B[sb + 1];
        const rx = p1x - p0x, rz = p1z - p0z, qx = q1x - q0x, qz = q1z - q0z, den = rx * qz - rz * qx;
        if (Math.abs(den) < 1e-9) continue;
        const ta = ((q0x - p0x) * qz - (q0z - p0z) * qx) / den, tb = ((q0x - p0x) * rz - (q0z - p0z) * rx) / den;
        if (ta < 0 || ta > 1 || tb < 0 || tb > 1) continue;
        const hx = p0x + rx * ta, hz = p0z + rz * ta;
        if (Math.hypot(hx - B[0][0], hz - B[0][1]) < 2.5 || Math.hypot(hx - B[B.length - 1][0], hz - B[B.length - 1][1]) < 2.5) continue;
        if (Math.hypot(hx - A[0][0], hz - A[0][1]) < 2.5 || Math.hypot(hx - A[A.length - 1][0], hz - A[A.length - 1][1]) < 2.5) continue;
        const ql = Math.hypot(qx, qz) || 1;
        for (const sg of [1, -1]) specs.push({ ex: hx, ez: hz, dB: [(qx / ql) * sg, (qz / ql) * sg], near: { d: 0, i: sa, f: ta } });
      }
      for (const { ex, ez, dB, near } of specs) {
        const [ax, az] = A[near.i], [bx, bz] = A[near.i + 1], al = Math.hypot(bx - ax, bz - az) || 1;
        const tA: [number, number] = [(bx - ax) / al, (bz - az) / al];
        const jx = ax + (bx - ax) * near.f, jz = az + (bz - az) * near.f;
        // the side of A the lane leaves on (+1 left of A's heading: n = (-tz, tx))
        const side = Math.sign(-tA[1] * dB[0] + tA[0] * dB[1]) || 1;
        void side;
        for (const dir of [1, -1]) {
          const R = plan.returnR;
          // the fillet on the street's segment its tangent point lands on (228 r1b: a street bending at the junction's
          // node set the corner off the run's kerb line by up to 0.3 m): solved on the junction's segment, then again on
          // the segment the tangent point fell on, from where that segment's line meets the lane's
          let seg = near.i, cx = jx, cz = jz, t: [number, number] = tA, corner: Corner | null = null;
          for (let pass = 0; pass < 3; pass++) {
            const dA: [number, number] = [t[0] * dir, t[1] * dir];
            const nA: [number, number] = [-dA[1], dA[0]], sA = Math.sign(dot2(nA, dB)) || 1, nAc: [number, number] = [nA[0] * sA, nA[1] * sA];
            const nB0: [number, number] = [-dB[1], dB[0]], sB = Math.sign(dot2(nB0, dA)) || 1, nBc: [number, number] = [nB0[0] * sB, nB0[1] * sB];
            const eA = K, eB = clearOf(rj) - 0.4, denom = dot2(dA, nBc);
            if (Math.abs(denom) < 0.2) { corner = null; break; }
            const t0 = (eB + R - (eA + R) * dot2(nAc, nBc)) / denom;
            if (!(t0 > 0 && t0 < 14)) { corner = null; break; }
            const O: [number, number] = [cx + nAc[0] * (eA + R) + dA[0] * t0, cz + nAc[1] * (eA + R) + dA[1] * t0];
            const TB: [number, number] = [O[0] - nBc[0] * R, O[1] - nBc[1] * R];
            corner = { road: ri, jx: cx, jz: cz, dA, dB, other: rj, nAc, t0, O,
              TA: [O[0] - nAc[0] * R, O[1] - nAc[1] * R], TB, nBc, tB: (TB[0] - cx) * dB[0] + (TB[1] - cz) * dB[1] };
            const on = nearestOnRoad(A, cx + dA[0] * t0, cz + dA[1] * t0);
            if (on.i === seg) break;
            // the tangent point's segment: its line, and where it meets the lane's centreline
            seg = on.i;
            const [px, pz] = A[seg], [qx, qz] = A[seg + 1], ql = Math.hypot(qx - px, qz - pz) || 1;
            t = [(qx - px) / ql, (qz - pz) / ql];
            const cr = t[0] * dB[1] - t[1] * dB[0];
            if (Math.abs(cr) < 0.2) { corner = null; break; }
            const u = ((ex - px) * dB[1] - (ez - pz) * dB[0]) / cr;
            cx = px + t[0] * u; cz = pz + t[1] * u;
          }
          if (corner) corners.push(corner);
        }
      }
    }
  }

  // ---------------------------------------------------------------------------------------------- the runs
  const runsByRoad: Array<{ ri: number; side: number; samples: Sample[]; from: number; to: number }> = [];
  for (const ri of kerbed) {
    const road = ctx.roads[ri], rs = resample(road, step), pr = prof(ri);
    for (const side of [-1, 1]) {
      const samples: Sample[] = rs.p.map(([x, z], i) => {
        const [tx, tz] = rs.t[i];
        let nx = -tz * side, nz = tx * side, kx = x + nx * K, kz = z + nz * K;
        // (228 r2: a lane's bends) on the inside of a bend the normal's kerb point comes nearer the next segment than the
        // kerb's line: the normal mitred out until the kerb stands its distance off the street (at most a quarter more)
        const dk = nearestOnRoad(road, kx, kz).d;
        if (dk < K - 0.005) {
          const f = Math.min(1.25, K / Math.max(0.1, dk));
          nx *= f; nz *= f; kx = x + nx * K; kz = z + nz * K;
        }
        const out: Sample = { x, z, nx, nz, state: 'blocked', outer: W0 + pr.openWalk };
        const why = (r: string): Sample => { census[`sample:${r}`] = (census[`sample:${r}`] ?? 0) + 1; out.why = r; return out; };
        // the wall line itself (its modules, a gate's passage), and a lane past it
        if (townEdgeDistance(plan.inside, kx, kz) < 1.5) return why('wall');
        // a bridge's deck: its parapets own the edge
        if (ctx.onDeck?.(kx, kz) || ctx.onDeck?.(x + nx * (W0 + 1), z + nz * (W0 + 1))) return why('deck');
        out.past = !insideTown(plan.inside, kx, kz);
        if (out.past && classOf(ri) !== 'main') return why('outside');
        // a square: its own frontage walks take the edge (the run comes up to the room and its kerb ramps flush)
        if (plan.exclude.some((r) => inRect(r, kx, kz, 0.3))) return why('square');
        // a junction's mouth: another road's carriageway at the kerb
        let other = Infinity;
        for (let rj = 0; rj < ctx.roads.length; rj++) {
          // (229 b1 r1, the batch-2 critic's D2: an unkerbed road crossing a kerbed one is a junction too — a run stopped
          // across a causeway's roadway)
          if (rj === ri) continue;
          other = Math.min(other, nearestOnRoad(ctx.roads[rj], kx, kz).d - clearOf(rj));
        }
        if (other < 0) return why('junction');
        // the corners' returns take the kerb from their tangent points on (the street's side and the lane's)
        for (const c of corners) {
          if (c.road === ri && nx * c.nAc[0] + nz * c.nAc[1] >= 0.5) {
            const along = (kx - c.jx) * c.dA[0] + (kz - c.jz) * c.dA[1];
            if (along > -0.5 && along < c.t0 + 0.15) return why('return');
          }
          if (c.other === ri && nx * c.nBc[0] + nz * c.nBc[1] >= 0.5) {
            const along = (kx - c.jx) * c.dB[0] + (kz - c.jz) * c.dB[1];
            if (along > -0.5 && along < c.tB + 0.15) return why('return');
          }
        }
        const near = plotsNear(kx, kz, W0 + pr.maxWalk + 3);
        const built = (px: number, pz: number, m: number): boolean => near.some((p) => inPlot(p, px, pz, m)) || ctx.solidAt?.(px, pz, m) === true;
        // a structure within 0.62 m of the kerb's face, or on the kerb or the pavement's first 0.15 m (a gate's pier, a
        // house stepping out to the street): no run. (228 r3: the run stood off 0.65 m from the kerb's back, and the
        // houses at the square's south mouth, 0.9 m behind the kerb, cut the owner's chase street's pavement 13 m short:
        // a narrow pavement runs to their fronts now)
        if (built(kx, kz, 0.62)) return why('structure');
        for (let o = K; o <= W0 + 0.15; o += 0.05) {
          const px = x + nx * o, pz = z + nz * o;
          if (built(px, pz, 0.02)) return why('structure');
        }
        // a house fronting it: the pavement out to its facade (at most the widest); none: the open walk
        out.state = 'open';
        // (229 b1 r1) a town without a wall under the open-gap rule reads its fronts as past the wall does: the frontage band
        const far = out.past || plan.openGapM !== undefined;
        for (let o = W0 + 0.15; o <= Math.max(W0 + pr.maxWalk + 0.05, far ? K + fFar : 0); o += 0.1) {
          const px = x + nx * o, pz = z + nz * o;
          if (built(px, pz, 0.02)) {
            if (!far || o >= K + fNear - 0.6) { out.state = 'fronted'; out.outer = Math.min(o - 0.05, W0 + pr.maxWalk); }
            break;
          }
        }
        census[`sample:${out.state}`] = (census[`sample:${out.state}`] ?? 0) + 1;
        return out;
      });
      let i = 0;
      while (i < samples.length) {
        if (samples[i].state === 'blocked') { i++; continue; }
        let j = i;
        const zone = samples[i].past;
        if (!zone && plan.openGapM === undefined) {
          // inside the wall: every laid stretch, corner to corner
          while (j + 1 < samples.length && samples[j + 1].state !== 'blocked' && !samples[j + 1].past) j++;
        } else {
          // past it: the fronted stretches, joined over open gaps of up to 7 m; (229 b1 r1) inside a town without a wall
          // (plan.openGapM) the same over its own gaps: no pavement along open ground, a vacant lot's short gap bridged
          if (samples[i].state !== 'fronted') { i++; continue; }
          // (229 b1 r1, the critic's D7: the gaps in metres, not samples, now a style's step is not a metre)
          const gap = Math.max(1, Math.round((zone ? 7 : plan.openGapM!) / step));
          for (;;) {
            let k = j + 1;
            while (k < samples.length && samples[k].past === zone && samples[k].state === 'open' && k - j <= gap) k++;
            if (k < samples.length && samples[k].past === zone && samples[k].state === 'fronted' && k - j <= gap + 1) { j = k; continue; }
            break;
          }
          for (let k = i; k <= j; k++) if (samples[k].state === 'open') {
            let a = k, b = k;
            while (a > i && samples[a].state !== 'fronted') a--;
            while (b < j && samples[b].state !== 'fronted') b++;
            samples[k].outer = Math.min(samples[a].outer, samples[b].outer);
          }
        }
        if ((j - i) * step >= 3) {
          // the outer edge eased to its narrower neighbour's (no flag's corner into a house where a front steps)
          const outer = samples.slice(i, j + 1).map((s) => s.outer);
          for (let k = i; k <= j; k++) samples[k].outer = Math.min(outer[k - i], outer[Math.max(0, k - i - 1)], outer[Math.min(j - i, k - i + 1)]);
          runsByRoad.push({ ri, side, samples, from: i, to: j });
        }
        i = j + 1;
      }
    }
  }

  // ------------------------------------------------------------------- a run carried on to the corner it comes up to
  // (228 r1b: a run whose end stopped short of a lane's corner left a metre or more of bare setts between its dressed end
  // and the return's kerb) a run's end within 6 m of a corner's tangent point on its side (the street's or the lane's)
  // runs on over its laid samples to the first sample the return takes, that sample set on the tangent point, so the kerb
  // and the flags meet the return; a house at the kerb, a junction's mouth or the square on the way stops it
  const metA = new Set<Corner>(), metB = new Set<Corner>();
  for (const run of runsByRoad) {
    const S = run.samples;
    for (const dir of [1, -1] as const) {
      const end = dir === 1 ? run.to : run.from, e = S[end];
      for (const c of corners) {
        const isA = c.road === run.ri && e.nx * c.nAc[0] + e.nz * c.nAc[1] >= 0.5;
        const isB = !isA && c.other === run.ri && e.nx * c.nBc[0] + e.nz * c.nBc[1] >= 0.5;
        if (!isA && !isB) continue;
        const met = isA ? metA : metB, T = isA ? c.TA : c.TB, n = isA ? c.nAc : c.nBc;
        if (met.has(c) || Math.hypot(e.x + e.nx * K - T[0], e.z + e.nz * K - T[1]) >= 6) continue;
        let k = end + dir;
        // (the reach to the corner's return: 7 m, in the street's samples)
        const reach = Math.max(1, Math.round(7 / step));
        while (k >= 0 && k < S.length && Math.abs(k - end) <= reach && S[k].state !== 'blocked') k += dir;
        if (k < 0 || k >= S.length || S[k].why !== 'return' || Math.abs(k - end) > reach + 1) continue;
        // the first return sample moves onto the corner's tangent point (its street point the kerb's line back from it)
        S[k] = { ...S[k], x: T[0] - n[0] * K, z: T[1] - n[1] * K, nx: n[0], nz: n[1] };
        for (let q = end + dir; q !== k + dir; q += dir) S[q] = { ...S[q], state: e.state === 'blocked' ? 'open' : e.state, outer: e.outer };
        if (dir === 1) run.to = k; else run.from = k;
        census.carried = (census.carried ?? 0) + Math.abs(k - end);
        if (isA) c.outerA = e.outer; else c.outerB = e.outer;
        met.add(c);
        break;
      }
    }
  }

  // ------------------------------------------------------------------------------------------- lay a run
  const kerbTopAt = (x: number, z: number, nx: number, nz: number, face: number): number => ctx.ground(x + nx * K, z + nz * K) + face;
  const mouthRamp = (x: number, z: number): number => {
    // the face over the last 2 m before a square's walk: down to 2 cm at the walk
    let f = 1;
    for (const [mx, mz] of plan.mouths) {
      const d = Math.hypot(x - mx, z - mz);
      if (d < 10) for (const r of plan.exclude) {
        const e = Math.max(r.x0 - x, x - r.x1, r.z0 - z, z - r.z1);
        if (e > -0.5 && e < 2.5) f = Math.min(f, Math.max(0.15, (e - 0.3) / 2.2));
      }
    }
    return f;
  };
  for (const run of runsByRoad) {
    const S = run.samples;
    // its kerb units and its flags, sample to sample
    const n = run.to - run.from;
    census.runs = (census.runs ?? 0) + 1;
    census.kerbM = (census.kerbM ?? 0) + n * step;
    const course = style.pavement.course, gap = 0.008, face = prof(run.ri).face;
    census[classOf(run.ri) === 'main' ? 'kerbMainM' : 'kerbLaneM'] = (census[classOf(run.ri) === 'main' ? 'kerbMainM' : 'kerbLaneM'] ?? 0) + n * step;
    for (let k = run.from; k < run.to; k++) {
      const a = S[k], b = S[k + 1];
      const fa = face * mouthRamp(a.x + a.nx * K, a.z + a.nz * K), fb = face * mouthRamp(b.x + b.nx * K, b.z + b.nz * K);
      const ta = kerbTopAt(a.x, a.z, a.nx, a.nz, fa), tb = kerbTopAt(b.x, b.z, b.nx, b.nz, fb);
      const ga = ta - fa, gb = tb - fb;
      // the kerb: its unit's joint every other sample (units of about 1.0-1.4 m), its arris on the road side rounded
      const ka: [number, number] = [a.x + a.nx * (K + KW / 2), a.z + a.nz * (K + KW / 2)], kb: [number, number] = [b.x + b.nx * (K + KW / 2), b.z + b.nz * (K + KW / 2)];
      const joint = step >= 1.8 || (k - run.from) % 2 === 1;
      const kbj: [number, number] = joint ? [kb[0] - (kb[0] - ka[0]) * 0.006, kb[1] - (kb[1] - ka[1]) * 0.006] : kb;
      const side: [number, number] = [a.nx, a.nz];
      const col = toned(kerbCol, Math.floor((k - run.from) / 2), run.ri * 7 + run.side, 0.06, 51);
      m.run(ka, kbj, side, (end) => {
        const top = end ? tb : ta, g = end ? gb : ga;
        return lean ? [[-KW / 2, g - 0.1], [KW / 2, g - 0.1], [KW / 2, top], [-KW / 2, top]]
          : [[-KW / 2, g - 0.1], [KW / 2, g - 0.1], [KW / 2, top], [-KW / 2 + 0.035, top], [-KW / 2, top - 0.035]];
      }, (face) => (face === -1 ? scaleRgb(col, 0.9) : col), k === run.from || k === run.to - 1 || joint);
      // the pavement: its surface from the kerb's top, rising to meet the ground at the facade by at most 0.25 m
      const oa = a.outer, ob = b.outer;
      const surf = (s: Sample, o: number, top: number, outer: number): number => {
        const og = ctx.ground(s.x + s.nx * outer, s.z + s.nz * outer);
        const rise = Math.max(0, Math.min(0.25, og + 0.03 - top));
        return top + rise * Math.max(0, Math.min(1, (o - W0) / Math.max(0.1, outer - W0)));
      };
      const P = (s: Sample, o: number): [number, number] => [s.x + s.nx * o, s.z + s.nz * o];
      // the bed (its joints' colour) under the flags, and its outer face down to the ground at the facade
      const bedQ = (o0a: number, o0b: number, o1a: number, o1b: number, lift: number, colour: Rgb) => {
        const A0 = P(a, o0a), B0 = P(b, o0b), B1 = P(b, o1b), A1 = P(a, o1a);
        m.quad([A0[0], surf(a, o0a, ta, oa) + lift, A0[1]], [B0[0], surf(b, o0b, tb, ob) + lift, B0[1]],
          [B1[0], surf(b, o1b, tb, ob) + lift, B1[1]], [A1[0], surf(a, o1a, ta, oa) + lift, A1[1]], colour);
      };
      bedQ(W0, W0, oa, ob, -0.004, jointCol);
      const A1 = P(a, oa), B1 = P(b, ob), footA = Math.min(ga, ctx.ground(A1[0], A1[1])) - 0.06, footB = Math.min(gb, ctx.ground(B1[0], B1[1])) - 0.06;
      m.quad([A1[0], surf(a, oa, ta, oa), A1[1]], [B1[0], surf(b, ob, tb, ob), B1[1]], [B1[0], footB, B1[1]], [A1[0], footA, A1[1]],
        scaleRgb(jointCol, 1.2), [a.nx, 0, a.nz]);
      // the flags in courses along the street, each course's joints broken against the next
      const width = Math.min(oa, ob) - W0, courses = lean ? 1 : Math.min(maxCourses, Math.max(1, Math.round(width / course))), cw = width / courses;
      for (let q = 0; q < courses; q++) {
        const o0 = W0 + q * cw + gap, o1 = W0 + (q + 1) * cw - gap;
        const split = !lean && ((k - run.from) + q) % 2 === 0;
        const cuts = split ? [0, 0.5, 1] : [0, 1];
        for (let c = 0; c + 1 < cuts.length; c++) {
          const u0 = cuts[c] + (c ? gap : 0), u1 = cuts[c + 1] - gap;
          const Pa0 = P(a, o0), Pb0 = P(b, o0), Pa1 = P(a, o1), Pb1 = P(b, o1);
          const lerp = (p: [number, number], r: [number, number], u: number): [number, number] => [p[0] + (r[0] - p[0]) * u, p[1] + (r[1] - p[1]) * u];
          const yA0 = surf(a, o0, ta, oa), yB0 = surf(b, o0, tb, ob), yA1 = surf(a, o1, ta, oa), yB1 = surf(b, o1, tb, ob);
          const q00 = lerp(Pa0, Pb0, u0), q10 = lerp(Pa0, Pb0, u1), q11 = lerp(Pa1, Pb1, u1), q01 = lerp(Pa1, Pb1, u0);
          const fc = toned(flagCol, k * 3 + c, q + run.ri * 11 + run.side, style.pavement.tone, 52);
          m.quad([q00[0], yA0 + (yB0 - yA0) * u0, q00[1]], [q10[0], yA0 + (yB0 - yA0) * u1, q10[1]],
            [q11[0], yA1 + (yB1 - yA1) * u1, q11[1]], [q01[0], yA1 + (yB1 - yA1) * u0, q01[1]], fc);
        }
      }
      census.walkM2 = (census.walkM2 ?? 0) + step * width;
      footprints.push({ pts: [P(a, K), P(b, K), P(b, Math.max(ob, W0 + 0.3)), P(a, Math.max(oa, W0 + 0.3))], foot: Math.min(ga, gb) - 0.1 });
    }
    const s0 = S[run.from], s1 = S[run.to];
    debug.push({ pts: [s0.x + s0.nx * K, s0.z + s0.nz * K, s1.x + s1.nx * K, s1.z + s1.nz * K], col: [200, 120, 0] });
  }

  // ------------------------------------------------------------------------------------- the returns at the lanes
  for (const c of corners) {
    const R = plan.returnR, O = c.O, TA = c.TA, TB = c.TB;
    // only where the street's run comes up to the corner (carried on to its tangent point above, on this side)
    if (!metA.has(c)) continue;
    // the kerb's face eased round the corner from the street's to the lane's
    const faceA = prof(c.road).face, faceB = prof(c.other).face;
    const near = plotsNear(O[0], O[1], R + 4);
    const a0 = Math.atan2(TA[0] - O[0], TA[1] - O[1]), a1 = Math.atan2(TB[0] - O[0], TB[1] - O[1]);
    let da = a1 - a0;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    const segs = Math.max(3, Math.ceil(Math.abs(da) * R / 0.6));
    const at = (a: number, r: number): [number, number] => [O[0] + Math.sin(a) * r, O[1] + Math.cos(a) * r];
    for (let k = 0; k < segs; k++) {
      const p = a0 + (da * k) / segs, q = a0 + (da * (k + 1)) / segs - (k < segs - 1 ? 0.004 : 0);
      const pa = at(p, R - KW / 2), pb = at(q, R - KW / 2), mid = (p + q) / 2;
      if (near.some((pl) => inPlot(pl, pa[0], pa[1], 0.3) || inPlot(pl, pb[0], pb[1], 0.3))
        || ctx.solidAt?.(pa[0], pa[1], 0.3) || ctx.solidAt?.(pb[0], pb[1], 0.3)) continue;
      const out: [number, number] = [-Math.sin(mid), -Math.cos(mid)]; // toward O: the kerb's back
      const ga = ctx.ground(...at(p, R)), gb = ctx.ground(...at(q, R));
      const col = toned(kerbCol, k, c.road + c.other * 3, 0.06, 53);
      m.run(pa, pb, out, (end) => {
        const g = end ? gb : ga, top = g + faceA + (faceB - faceA) * ((k + end) / segs);
        return [[-KW / 2, g - 0.1], [KW / 2, g - 0.1], [KW / 2, top], [-KW / 2 + 0.035, top], [-KW / 2, top - 0.035]];
      }, col, true);
      // the corner's flags: a fan from the kerb's back in toward the corner, cut at the houses
      for (let ring = 0; ring < 4; ring++) {
        const r0 = R - KW - ring * 0.6 - 0.01, r1 = Math.max(0.05, R - KW - (ring + 1) * 0.6 + 0.01);
        if (r0 <= 0.1) break;
        const c0 = at(p, r0), c1 = at(q, r0), c2 = at(q, r1), c3 = at(p, r1);
        if (near.some((pl) => [c0, c1, c2, c3].some((pt) => inPlot(pl, pt[0], pt[1], 0.05)))
          || [c0, c1, c2, c3].some((pt) => ctx.solidAt?.(pt[0], pt[1], 0.05))) break;
        const y = (pt: [number, number]) => ctx.ground(...pt) + faceA + (faceB - faceA) * ((k + 0.5) / segs);
        m.quad([c0[0], y(c0), c0[1]], [c1[0], y(c1), c1[1]], [c2[0], y(c2), c2[1]], [c3[0], y(c3), c3[1]], toned(flagCol, k, ring + c.other, style.pavement.tone, 54));
      }
    }
    // (228 r3, the blind critics: "the rounded corner islands are filled with orange dirt and weed tufts") the corner paved
    // whole: from the kerb's back round the arc out to where the two pavements' outer edges meet, a fan of flags from
    // that corner point (each flag kept off the houses)
    {
      const oA = c.outerA ?? W0 + prof(c.road).openWalk, oB = c.outerB ?? W0 + prof(c.other).openWalk;
      const J: [number, number] = [c.jx, c.jz];
      // Q = J + dA s + nAc oA = J + dB t + nBc oB
      const rx = c.nBc[0] * oB - c.nAc[0] * oA, rz = c.nBc[1] * oB - c.nAc[1] * oA;
      const det = c.dA[0] * -c.dB[1] - c.dA[1] * -c.dB[0];
      if (Math.abs(det) > 0.2) {
        const s = (rx * -c.dB[1] - rz * -c.dB[0]) / det;
        const Q: [number, number] = [J[0] + c.dA[0] * s + c.nAc[0] * oA, J[1] + c.dA[1] * s + c.nAc[1] * oA];
        if (Math.hypot(Q[0] - O[0], Q[1] - O[1]) < 8) {
          const PA: [number, number] = [J[0] + c.dA[0] * c.t0 + c.nAc[0] * oA, J[1] + c.dA[1] * c.t0 + c.nAc[1] * oA];
          const PB: [number, number] = [J[0] + c.dB[0] * c.tB + c.nBc[0] * oB, J[1] + c.dB[1] * c.tB + c.nBc[1] * oB];
          const rim: Array<[number, number]> = [PA];
          for (let k = 0; k <= segs; k++) rim.push(at(a0 + (da * k) / segs, R - KW));
          rim.push(PB);
          const y = (pt: readonly [number, number]) => ctx.ground(pt[0], pt[1]) + faceA - 0.003;
          for (let k = 0; k + 1 < rim.length; k++) {
            const p = rim[k], q = rim[k + 1], cx = (p[0] + q[0] + Q[0]) / 3, cz = (p[1] + q[1] + Q[1]) / 3;
            if (near.some((pl) => inPlot(pl, cx, cz, 0.05)) || ctx.solidAt?.(cx, cz, 0.05)) continue;
            m.tri([Q[0], y(Q), Q[1]], [p[0], y(p), p[1]], [q[0], y(q), q[1]], toned(flagCol, k, c.road + c.other, style.pavement.tone, 55));
          }
          census.cornersPaved = (census.cornersPaved ?? 0) + 1;
        }
      }
    }
    census.returns = (census.returns ?? 0) + 1;
    debug.push({ pts: [TA[0], TA[1], O[0], O[1], TB[0], TB[1]], col: [220, 60, 0] });
  }
  census.triangles = m.triangles;
  void SKIN;
  return { geometry: m.geometry('civic:pathways'), footprints, census, debug };
}
