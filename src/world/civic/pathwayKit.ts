// src/world/civic/pathwayKit.ts — a town's pathway architecture from its plan (the maps lane, 228; the owner, 2026-10-18:
// "fix / improve the pathways in steinburg", 2026-10-19: "finalize all 'pathway' architecture"). It replaces the legacy
// kerb pass (props.ts placeStreetCurbs: a kerb at 5.05 m and a 2.25 m slab at 6.35 m down both sides of every street in
// the town rect, under the houses, across the square, through the gates and past the wall) for a map that adopts it:
//   - a main street is kerbed only where houses front it: a run stands where a placed structure lies `frontage` behind
//     the kerb (1.2–3.5 m), its kerb face `kerbM` off the centreline, its pavement from the kerb's back out to the facade
//     line (at most `maxWalkM`), never on a square (`exclude`), never past the wall line (`inside`), stopping clear of a
//     gate's piers; short gaps between fronted stretches carry the pavement on;
//   - each run is one ribbon, kerb units of a metre or so and flags in courses, every vertex seated on the ground under
//     it (no level step at a joint), a dressed end only where the run ends;
//   - where a lane or an alley meets a main street and the street's pavement runs on to its mouth, the kerb returns round
//     the corner on its radius into the lane's mouth, the corner paved;
//   - a pavement that meets a square's flush walk ramps its kerb down to flush over 2 m;
//   - a lane (gasse) lays nothing: setts wall to wall (the terrain's).
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

/** A road resampled every STEP metres along its length: points, unit tangents, and the running length. */
function resample(road: Road): { p: Array<[number, number]>; t: Array<[number, number]>; s: number[] } {
  const p: Array<[number, number]> = [], t: Array<[number, number]> = [], s: number[] = [];
  let acc = 0;
  for (let i = 0; i + 1 < road.length; i++) {
    const [ax, az] = road[i], [bx, bz] = road[i + 1], len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(len / STEP));
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

interface Sample { x: number; z: number; nx: number; nz: number; state: 'fronted' | 'open' | 'blocked'; outer: number; why?: string }

/** The pathway architecture of a town from its plan. */
export function buildPathwayNetwork(plan: PathwayPlan, style: RegionalCivicStyle, ctx: PathwayContext): PathwayBuild {
  const census: Record<string, number> = { legacyPieces: burnLegacyKerbDraws(ctx) };
  const debug: PathwayBuild['debug'] = [];
  const footprints: PathwayFootprint[] = [];
  const m = new CivicMesh(ctx.ground);
  const K = plan.kerbM, KW = style.kerb.width, FACE = style.kerb.face, W0 = K + KW;
  const [fNear, fFar] = plan.frontage;
  const kerbCol = hexRgb(style.kerb.hex), flagCol = hexRgb(style.pavement.hex), jointCol = hexRgb(style.pavement.joint);
  const mains = Object.entries(plan.classes).filter(([, c]) => c === 'main').map(([i]) => Number(i));
  const classOf = (ri: number) => plan.classes[ri] ?? 'none';
  // the half-width each other road keeps clear at a junction (a main street's kerb, a lane's walls of setts)
  const clearOf = (ri: number) => (classOf(ri) === 'main' ? K + 0.4 : 4.0);
  const plotsNear = (x: number, z: number, r: number) => ctx.plots.filter((p) => Math.hypot(p.x - x, p.z - z) < r + Math.hypot(p.w, p.d) / 2);

  // ---------------------------------------------------------------------------------------- junction corners (returns)
  interface Corner {
    road: number; jx: number; jz: number; dA: [number, number]; dB: [number, number]; other: number;
    /** the main street's normal toward the lane, the lane's toward the street's run, the fillet's centre and tangents */
    nAc: [number, number]; t0: number; O: [number, number]; TA: [number, number]; TB: [number, number];
  }
  const dot2 = (p: readonly number[], q: readonly number[]) => p[0] * q[0] + p[1] * q[1];
  const corners: Corner[] = [];
  for (const ri of mains) {
    const A = ctx.roads[ri];
    for (let rj = 0; rj < ctx.roads.length; rj++) {
      if (rj === ri || classOf(rj) === 'none') continue;
      const B = ctx.roads[rj];
      for (const end of [0, B.length - 1]) {
        const [ex, ez] = B[end], near = nearestOnRoad(A, ex, ez);
        if (near.d > 2.5) continue;
        const nb = B[end === 0 ? 1 : B.length - 2], bl = Math.hypot(nb[0] - ex, nb[1] - ez) || 1;
        const dB: [number, number] = [(nb[0] - ex) / bl, (nb[1] - ez) / bl];
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
            corner = { road: ri, jx: cx, jz: cz, dA, dB, other: rj, nAc, t0, O,
              TA: [O[0] - nAc[0] * R, O[1] - nAc[1] * R], TB: [O[0] - nBc[0] * R, O[1] - nBc[1] * R] };
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
  for (const ri of mains) {
    const road = ctx.roads[ri], rs = resample(road);
    for (const side of [-1, 1]) {
      const samples: Sample[] = rs.p.map(([x, z], i) => {
        const [tx, tz] = rs.t[i], nx = -tz * side, nz = tx * side;
        const kx = x + nx * K, kz = z + nz * K;
        const out: Sample = { x, z, nx, nz, state: 'blocked', outer: W0 + 2.0 };
        const why = (r: string): Sample => { census[`sample:${r}`] = (census[`sample:${r}`] ?? 0) + 1; out.why = r; return out; };
        if (!insidePolygon(plan.inside, kx, kz) || polygonEdgeDistance(plan.inside, kx, kz) < 1.5) return why('outside');
        if (plan.exclude.some((r) => inRect(r, kx, kz) || inRect(r, x + nx * (W0 + 1), z + nz * (W0 + 1)))) return why('square');
        // a junction's mouth: another road's carriageway at the kerb
        let other = Infinity;
        for (let rj = 0; rj < ctx.roads.length; rj++) {
          if (rj === ri || classOf(rj) === 'none') continue;
          other = Math.min(other, nearestOnRoad(ctx.roads[rj], kx, kz).d - clearOf(rj));
        }
        if (other < 0) return why('junction');
        // the corners' returns take the kerb from their tangent point on
        for (const c of corners) {
          if (c.road !== ri || nx * c.nAc[0] + nz * c.nAc[1] < 0.5) continue;
          const along = (kx - c.jx) * c.dA[0] + (kz - c.jz) * c.dA[1];
          if (along > -0.5 && along < c.t0 + 0.15) return why('return');
        }
        const near = plotsNear(kx, kz, fFar + 3);
        // a structure at the kerb or on the pavement's first 0.6 m (a gate's pier, a house stepping out): no run
        for (let o = K - 0.05; o <= W0 + 0.6; o += 0.1) {
          const px = x + nx * o, pz = z + nz * o;
          if (near.some((p) => inPlot(p, px, pz, 0.95 * (o < W0 ? 1 : 0)))) return why('structure');
        }
        out.state = 'open';
        for (let o = W0 + 0.6; o <= K + fFar; o += 0.1) {
          const px = x + nx * o, pz = z + nz * o;
          if (near.some((p) => inPlot(p, px, pz))) {
            if (o >= K + fNear - 0.6) { out.state = 'fronted'; out.outer = Math.min(o - 0.05, W0 + plan.maxWalkM); }
            break;
          }
        }
        census[`sample:${out.state}`] = (census[`sample:${out.state}`] ?? 0) + 1;
        return out;
      });
      // the fronted stretches, joined over open gaps of up to 7 m, each at least 3 m long
      let i = 0;
      while (i < samples.length) {
        if (samples[i].state !== 'fronted') { i++; continue; }
        let j = i;
        for (;;) {
          let k = j + 1;
          while (k < samples.length && samples[k].state === 'open' && k - j <= 7) k++;
          if (k < samples.length && samples[k].state === 'fronted' && k - j <= 8) { j = k; continue; }
          break;
        }
        if (j - i >= 3) {
          // the open samples inside the run take their neighbours' facade line
          for (let k = i; k <= j; k++) if (samples[k].state === 'open') {
            let a = k, b = k;
            while (a > i && samples[a].state !== 'fronted') a--;
            while (b < j && samples[b].state !== 'fronted') b++;
            samples[k].outer = Math.min(samples[a].outer, samples[b].outer);
          }
          runsByRoad.push({ ri, side, samples, from: i, to: j });
        }
        i = j + 1;
      }
    }
  }

  // ------------------------------------------------------------------- a run carried on to the corner it comes up to
  // (228 r1b: a run whose last fronted sample stopped short of a lane's corner left a metre or more of bare setts between
  // its dressed end and the return's kerb) a run's end within 6 m of a corner's tangent point on its side runs on over
  // the open samples to the first sample the return takes, that sample set on the tangent point, so the kerb and the
  // flags meet the return; a house at the kerb, a junction's mouth or the square on the way stops it (no return there)
  const met = new Set<Corner>();
  for (const run of runsByRoad) {
    const S = run.samples;
    for (const dir of [1, -1] as const) {
      const end = dir === 1 ? run.to : run.from, e = S[end];
      for (const c of corners) {
        if (c.road !== run.ri || met.has(c) || e.nx * c.nAc[0] + e.nz * c.nAc[1] < 0.5) continue;
        if (Math.hypot(e.x + e.nx * K - c.TA[0], e.z + e.nz * K - c.TA[1]) >= 6) continue;
        let k = end + dir;
        while (k >= 0 && k < S.length && Math.abs(k - end) <= 7 && (S[k].state === 'open' || S[k].state === 'fronted')) k += dir;
        if (k < 0 || k >= S.length || S[k].why !== 'return' || Math.abs(k - end) > 8) continue;
        const along = (S[k].x - c.jx) * c.dA[0] + (S[k].z - c.jz) * c.dA[1];
        if (Math.abs(along - c.t0) > 0.01) {
          // the first return sample moves onto the corner's tangent point
          S[k] = { ...S[k], x: c.jx + c.dA[0] * c.t0, z: c.jz + c.dA[1] * c.t0, nx: c.nAc[0], nz: c.nAc[1] };
        }
        for (let q = end + dir; q !== k + dir; q += dir) S[q] = { ...S[q], state: 'fronted', outer: e.outer };
        if (dir === 1) run.to = k; else run.from = k;
        census.carried = (census.carried ?? 0) + Math.abs(k - end);
        met.add(c);
        break;
      }
    }
  }

  // ------------------------------------------------------------------------------------------- lay a run
  const kerbTopAt =(x: number, z: number, nx: number, nz: number, face: number): number => ctx.ground(x + nx * K, z + nz * K) + face;
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
    census.kerbM = (census.kerbM ?? 0) + n * STEP;
    const course = style.pavement.course, gap = 0.008;
    for (let k = run.from; k < run.to; k++) {
      const a = S[k], b = S[k + 1];
      const fa = FACE * mouthRamp(a.x + a.nx * K, a.z + a.nz * K), fb = FACE * mouthRamp(b.x + b.nx * K, b.z + b.nz * K);
      const ta = kerbTopAt(a.x, a.z, a.nx, a.nz, fa), tb = kerbTopAt(b.x, b.z, b.nx, b.nz, fb);
      const ga = ta - fa, gb = tb - fb;
      // the kerb: its unit's joint every other sample (units of about 1.0-1.4 m), its arris on the road side rounded
      const ka: [number, number] = [a.x + a.nx * (K + KW / 2), a.z + a.nz * (K + KW / 2)], kb: [number, number] = [b.x + b.nx * (K + KW / 2), b.z + b.nz * (K + KW / 2)];
      const joint = (k - run.from) % 2 === 1;
      const kbj: [number, number] = joint ? [kb[0] - (kb[0] - ka[0]) * 0.006, kb[1] - (kb[1] - ka[1]) * 0.006] : kb;
      const side: [number, number] = [a.nx, a.nz];
      const col = toned(kerbCol, Math.floor((k - run.from) / 2), run.ri * 7 + run.side, 0.06, 51);
      m.run(ka, kbj, side, (end) => {
        const top = end ? tb : ta, g = end ? gb : ga;
        return [[-KW / 2, g - 0.1], [KW / 2, g - 0.1], [KW / 2, top], [-KW / 2 + 0.035, top], [-KW / 2, top - 0.035]];
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
      const width = Math.min(oa, ob) - W0, courses = Math.max(1, Math.round(width / course)), cw = width / courses;
      for (let q = 0; q < courses; q++) {
        const o0 = W0 + q * cw + gap, o1 = W0 + (q + 1) * cw - gap;
        const split = ((k - run.from) + q) % 2 === 0;
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
      census.walkM2 = (census.walkM2 ?? 0) + STEP * width;
      footprints.push({ pts: [P(a, K), P(b, K), P(b, Math.max(ob, W0 + 0.3)), P(a, Math.max(oa, W0 + 0.3))], foot: Math.min(ga, gb) - 0.1 });
    }
    const s0 = S[run.from], s1 = S[run.to];
    debug.push({ pts: [s0.x + s0.nx * K, s0.z + s0.nz * K, s1.x + s1.nx * K, s1.z + s1.nz * K], col: [200, 120, 0] });
  }

  // ------------------------------------------------------------------------------------- the returns at the lanes
  for (const c of corners) {
    const R = plan.returnR, O = c.O, TA = c.TA, TB = c.TB;
    // only where the street's run comes up to the corner (carried on to its tangent point above, on this side)
    if (!met.has(c)) continue;
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
      if (near.some((pl) => inPlot(pl, pa[0], pa[1], 0.3) || inPlot(pl, pb[0], pb[1], 0.3))) continue;
      const out: [number, number] = [-Math.sin(mid), -Math.cos(mid)]; // toward O: the kerb's back
      const ga = ctx.ground(...at(p, R)), gb = ctx.ground(...at(q, R));
      const col = toned(kerbCol, k, c.road + c.other * 3, 0.06, 53);
      m.run(pa, pb, out, (end) => {
        const g = end ? gb : ga, top = g + FACE;
        return [[-KW / 2, g - 0.1], [KW / 2, g - 0.1], [KW / 2, top], [-KW / 2 + 0.035, top], [-KW / 2, top - 0.035]];
      }, col, true);
      // the corner's flags: a fan from the kerb's back in toward the corner, cut at the houses
      for (let ring = 0; ring < 4; ring++) {
        const r0 = R - KW - ring * 0.6 - 0.01, r1 = Math.max(0.05, R - KW - (ring + 1) * 0.6 + 0.01);
        if (r0 <= 0.1) break;
        const c0 = at(p, r0), c1 = at(q, r0), c2 = at(q, r1), c3 = at(p, r1);
        if (near.some((pl) => [c0, c1, c2, c3].some((pt) => inPlot(pl, pt[0], pt[1], 0.05)))) break;
        const y = (pt: [number, number]) => ctx.ground(...pt) + FACE;
        m.quad([c0[0], y(c0), c0[1]], [c1[0], y(c1), c1[1]], [c2[0], y(c2), c2[1]], [c3[0], y(c3), c3[1]], toned(flagCol, k, ring + c.other, style.pavement.tone, 54));
      }
    }
    census.returns = (census.returns ?? 0) + 1;
    debug.push({ pts: [TA[0], TA[1], O[0], O[1], TB[0], TB[1]], col: [220, 60, 0] });
  }
  census.triangles = m.triangles;
  void SKIN;
  return { geometry: m.geometry('civic:pathways'), footprints, census, debug };
}
