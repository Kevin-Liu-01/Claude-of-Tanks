// src/world/maps/regional/ruinGrammar.ts — one ruin grammar for every kit (props census #7, lane B 2026-10-14; the
// census: "the ruins are span boxes — a wall a box to a level top, a dark plate for a window, a box for the heap").
//
// A ruin is a kit's own house broken: the same footprint, wall, storeys and openings its builder would lay, standing to
// ragged heads that fall from the corners (where the quoins hold longest) toward the breach the shell made. Each wall is
// laid in strips between the head's samples and the openings' jambs, so that:
// - its front and its back (the room's side, open to the sky now) are both drawn, and the broken head between them is
//   the core, a shade darker;
// - an opening that survived is cut through the wall with its jambs, sill and head the wall's own depth — never a dark
//   plate — under its lintel, over its sill; one whose head fell is open to the top of the break;
// - the corners' ends close the wall.
// Inside and round it: the floor's joists broken off at each storey line where the wall still stands over it, the
// heaps of its own masonry (inside, and outside under the breaches) with its chunks on them, the roof fallen in as its
// covering's pieces and its charred rafters, a chimney stack left standing with its firebox cut into it.
// Every wall is recorded for the damage reading (shell.ts ruinWall: damage.ts describeRuin takes the walls as built).
// The walls and heaps are structure and identical on every tier; the chunks, timbers and covering pieces are dressing.
import * as THREE from 'three';
import { box, jitterUV } from '../../propGeometry.ts';
import type { GeometryBuckets, StructureDimensions } from '../exteriorDetailKit.ts';
import { PartSink, faceBox, facePoint, shade, type EmitOptions, type Face, type RegionalBucket, type Rgb, type Vec3 } from './geometry.ts';
import { holedPolygon, type FaceName, type Opening } from './house.ts';
import { ruinWall } from './shell.ts';

/** A face's broken head: its height over the foot at the face's start (u = -L/2) and end, a breach dipping it at `at`
 * (0..1 along) by `dip` of its height, and how ragged it is (metres of jitter). */
export interface RuinHead { a: number; b: number; at?: number; dip?: number; ragged?: number }

export interface RuinSpec {
  /** the body's outer faces (x across, z along, front +z), its walls' thickness */
  w: number;
  d: number;
  t: number;
  wall: RegionalBucket;
  colour?: Rgb;
  /** the plinth course round the foot (proud of the wall), or none */
  plinth: { h: number; out: number; bucket: RegionalBucket; colour?: Rgb } | null;
  /** the floor's height when no plinth sets it (a base the kit lays itself) */
  floor?: number;
  /** the storeys' heights over the floor (the floor on the plinth's top) */
  storeys: readonly number[];
  /** the house's openings as its builder lays them (face, storey, centre, width, sill over the storey floor, height) */
  openings: readonly Opening[];
  /** each face's head; a face missing or null is down to its stub */
  heads: Partial<Record<FaceName, RuinHead | null>>;
  stub: number;
  /** the lintels and sills of the surviving openings: timber or stone, their colour */
  lintel: { bucket: RegionalBucket; colour?: Rgb };
  /** the covering fallen in: its pieces' bucket, paint and size (across, along, thick); null for a flat or burnt roof */
  roof: { bucket: RegionalBucket; colour?: Rgb; piece: readonly [number, number, number] } | null;
  /** the charred frame's colour (joists, rafters) */
  timber: Rgb;
  chimney?: { x: number; z: number; w: number; h: number; bucket: RegionalBucket; colour?: Rgb } | null;
  /** the hearth against a wall's inside (its centre along the face, its width): its firebox cut into it */
  hearth?: { face: FaceName; u: number; w: number } | null;
  /** a concrete or block shell's reinforcement: bars curling out of its broken heads in this rust */
  rebar?: Rgb;
  mobile: boolean;
}

export interface RuinFrame {
  faces: Record<FaceName, Face>;
  /** each face's head over the ground, sampled evenly along it (index 0 at u = -L/2) */
  tops: Record<FaceName, number[]>;
  floor: number;
  /** the height of the heaps (or the floor) at a point: what a fallen piece rests on */
  restOn: (x: number, z: number) => number;
}

type V = Vec3;
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V, b: V): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** A quad facing `want` (its corners in order round it; reversed when they wind the other way). */
function quadFacing(sink: PartSink, bucket: RegionalBucket, pts: V[], want: V, opts: EmitOptions): void {
  const n = cross(sub(pts[1], pts[0]), sub(pts[2], pts[0]));
  const p = dot(n, want) < 0 ? [...pts].reverse() : pts;
  sink.quad(bucket, p[0], p[1], p[2], p[3], opts);
}

interface Hole { u0: number; u1: number; y0: number; y1: number }

/**
 * One broken wall on `face` from u = -L/2 to L/2, `t` thick inward, its foot at `foot`, its head the sampled `tops`
 * (over the ground), the holes cut through it. Returns nothing; draws the strips' fronts and backs, the core along the
 * head, the jambs, sills and heads of the holes and the wall's two ends.
 */
function brokenWall(sink: PartSink, bucket: RegionalBucket, face: Face, L: number, t: number, foot: number, tops: readonly number[], holes: readonly Hole[], opts: EmitOptions): void {
  const n = tops.length - 1, h0 = -L / 2;
  const topAt = (u: number): number => {
    const s = Math.max(0, Math.min(n, ((u - h0) / L) * n)), i = Math.min(n - 1, Math.floor(s)), f = s - i;
    return tops[i] * (1 - f) + tops[i + 1] * f;
  };
  const P = (u: number, y: number, o: number): V => facePoint(face, u, y, o);
  const outN = face.out, inN: V = [-outN[0], -outN[1], -outN[2]], uN: V = face.u, uNeg: V = [-uN[0], -uN[1], -uN[2]];
  const core = { ...opts, shade: (opts.shade ?? 1) * 0.78 };
  const cuts = [...new Set([...Array.from({ length: n + 1 }, (_, k) => h0 + (L * k) / n),
    ...holes.flatMap((h) => [h.u0, h.u1]).filter((u) => u > h0 + 0.01 && u < -h0 - 0.01)].map((u) => Math.round(u * 1000) / 1000))].sort((a, b) => a - b);
  for (let i = 0; i + 1 < cuts.length; i++) {
    const ua = cuts[i], ub = cuts[i + 1];
    if (ub - ua < 0.01) continue;
    const ta = topAt(ua), tb = topAt(ub), tlo = Math.min(ta, tb);
    const through = holes.filter((h) => h.u0 <= ua + 1e-3 && h.u1 >= ub - 1e-3).sort((a, b) => a.y0 - b.y0);
    let y = foot;
    const solid: Array<[number, number | null]> = [];
    for (const h of through) {
      if (h.y0 >= tlo - 0.05) break;
      if (h.y0 > y + 0.01) solid.push([y, h.y0]);
      y = Math.max(y, h.y1);
    }
    if (y < tlo - 0.05) solid.push([y, null]);
    for (const [ya, yb] of solid) {
      const fa = yb ?? ta, fb = yb ?? tb;
      quadFacing(sink, bucket, [P(ua, ya, 0), P(ub, ya, 0), P(ub, fb, 0), P(ua, fa, 0)], outN, opts);
      quadFacing(sink, bucket, [P(ua, ya, -t), P(ub, ya, -t), P(ub, fb, -t), P(ua, fa, -t)], inN, opts);
      if (yb === null) {
        // the broken head: the core between the two faces
        const up = cross(sub(P(ub, tb, 0), P(ua, ta, 0)), outN);
        quadFacing(sink, bucket, [P(ua, ta, 0), P(ub, tb, 0), P(ub, tb, -t), P(ua, ta, -t)], dot(up, [0, 1, 0]) >= 0 ? up : [-up[0], -up[1], -up[2]], core);
      }
    }
    // the sills (facing up) and heads (facing down) of the holes this strip passes over
    for (const h of through) {
      if (h.y0 >= tlo - 0.05) continue;
      if (h.y0 > foot + 0.01) quadFacing(sink, bucket, [P(ua, h.y0, 0), P(ub, h.y0, 0), P(ub, h.y0, -t), P(ua, h.y0, -t)], [0, 1, 0], { ...opts, shade: (opts.shade ?? 1) * 0.9 });
      if (h.y1 < tlo - 0.05) quadFacing(sink, bucket, [P(ua, h.y1, 0), P(ub, h.y1, 0), P(ub, h.y1, -t), P(ua, h.y1, -t)], [0, -1, 0], { ...opts, shade: (opts.shade ?? 1) * 0.66 });
    }
  }
  // the holes' jambs, through the wall's depth, up to the head where the head fell lower
  for (const h of holes) {
    for (const [u, want] of [[h.u0, uN], [h.u1, uNeg]] as const) {
      if (u <= h0 + 0.01 || u >= -h0 - 0.01) continue;
      const top = Math.min(h.y1, topAt(u));
      if (top <= h.y0 + 0.02) continue;
      quadFacing(sink, bucket, [P(u, h.y0, 0), P(u, top, 0), P(u, top, -t), P(u, h.y0, -t)], want, { ...opts, shade: (opts.shade ?? 1) * 0.74 });
    }
  }
  // the wall's ends
  quadFacing(sink, bucket, [P(h0, foot, 0), P(h0, tops[0], 0), P(h0, tops[0], -t), P(h0, foot, -t)], uNeg, opts);
  quadFacing(sink, bucket, [P(-h0, foot, 0), P(-h0, tops[n], 0), P(-h0, tops[n], -t), P(-h0, foot, -t)], uN, opts);
}

/** The head's samples over the ground for a face `L` long (n strips about 0.75 m each), from the spec's head. */
function headTops(head: RuinHead | null | undefined, L: number, floor: number, stub: number, rng: () => number): number[] {
  const n = Math.max(3, Math.round(L / 0.75));
  if (!head) return Array.from({ length: n + 1 }, () => floor + stub * (0.7 + rng() * 0.6));
  // (a head breaks course by course, not in a saw: a slow wander along it, a broken course stepping it here and there,
  // and only a little jitter on that — the corners' quoins holding longest)
  const at = head.at ?? 0.5, dip = head.dip ?? 0, rag = head.ragged ?? 0.25;
  const p1 = rng() * 6.28, p2 = rng() * 6.28, steps = Array.from({ length: n + 1 }, () => (rng() < 0.22 ? (rng() - 0.5) * 0.6 : 0));
  let carry = 0;
  return Array.from({ length: n + 1 }, (_, k) => {
    const s = k / n, line = head.a + (head.b - head.a) * s;
    const d = Math.min(1, Math.abs(s - at) / Math.max(at, 1 - at, 1e-3));
    carry += steps[k];
    const wander = Math.sin(s * 5.1 + p1) * 0.22 + Math.sin(s * 11.3 + p2) * 0.1;
    const h = line * (1 - dip * (1 - Math.pow(d, 0.85))) + (wander + carry * 0.5) * rag * 2 + (rng() - 0.5) * rag * 0.4;
    return floor + Math.max(stub, k === 0 || k === n ? Math.max(h, line * 0.9) : h);
  });
}

/**
 * Lay a ruin at the emitting frame's origin. `rng` draws the heads' shape (the build stream), `look` the dressing (the
 * variant stream).
 */
export function ruinHouse(sink: PartSink, spec: RuinSpec, rng: () => number, look: () => number): RuinFrame {
  const { w, d, t } = spec;
  const floor = spec.plinth?.h ?? spec.floor ?? 0.15, foot = -0.3;
  const wallOpts: EmitOptions = spec.colour ? { colour: spec.colour } : {};
  // the front and back the body's width, the sides between them
  const faces: Record<FaceName, Face> = {
    front: { origin: [0, 0, d / 2], u: [1, 0, 0], out: [0, 0, 1], width: w },
    back: { origin: [0, 0, -d / 2], u: [-1, 0, 0], out: [0, 0, -1], width: w },
    right: { origin: [w / 2, 0, 0], u: [0, 0, -1], out: [1, 0, 0], width: d - 2 * t },
    left: { origin: [-w / 2, 0, 0], u: [0, 0, 1], out: [-1, 0, 0], width: d - 2 * t },
  };
  const storeyY = (s: number): number => floor + spec.storeys.slice(0, s).reduce((a, b) => a + b, 0);
  const tops = {} as Record<FaceName, number[]>;
  for (const name of ['front', 'right', 'back', 'left'] as const) {
    const f = faces[name], L = f.width;
    const tp = headTops(spec.heads[name], L, floor, spec.stub, rng);
    tops[name] = tp;
    // the side walls' openings were laid on the full depth: their u stays (the sides are only shorter at their ends)
    const holes: Hole[] = spec.openings.filter((o) => o.face === name).map((o) => {
      const y0 = storeyY(o.storey) + o.y0;
      return { u0: Math.max(-L / 2 + 0.25, o.u - o.w / 2), u1: Math.min(L / 2 - 0.25, o.u + o.w / 2), y0: Math.max(foot + 0.05, y0), y1: y0 + o.h };
    }).filter((h) => h.u1 - h.u0 > 0.2);
    brokenWall(sink, spec.wall, f, L, t, foot, tp, holes, wallOpts);
    ruinWall((p) => sink.framePoint(p), facePoint(f, -L / 2, 0, -t / 2), facePoint(f, L / 2, 0, -t / 2), foot, t, tp.map((y) => y - foot), spec.wall,
      spec.colour ? [spec.colour[0], spec.colour[1], spec.colour[2]] : [1, 1, 1]);
    // the surviving openings' lintels and sills (a head that fell takes its lintel with it)
    const n = tp.length - 1, topAt = (u: number): number => {
      const s = Math.max(0, Math.min(n, ((u + L / 2) / L) * n)), i = Math.min(n - 1, Math.floor(s));
      return tp[i] + (tp[i + 1] - tp[i]) * (s - i);
    };
    for (const h of holes) {
      const lc = { ...(spec.lintel.colour ? { colour: spec.lintel.colour } : {}), decor: true };
      if (Math.min(topAt(h.u0), topAt(h.u1)) > h.y1 + 0.3) faceBox(sink, spec.lintel.bucket, f, (h.u0 + h.u1) / 2, h.y1 + 0.09, 0.015, h.u1 - h.u0 + 0.3, 0.18, 0.03, lc, { back: true });
      // (the sill is the masonry's: a stone, a shade lighter than the wall)
      if (h.y0 > floor + 0.3 && Math.min(topAt(h.u0), topAt(h.u1)) > h.y0 + 0.2) {
        faceBox(sink, 'stone', f, (h.u0 + h.u1) / 2, h.y0 - 0.04, 0.04, h.u1 - h.u0 + 0.16, 0.08, 0.08, { ...(spec.colour ? { colour: shade(spec.colour, 1.08) } : {}), decor: true }, { back: true });
      }
    }
  }
  // the plinth course round the foot
  if (spec.plinth) {
    const p = spec.plinth, o = p.out, pc = p.colour ? { colour: p.colour } : {};
    sink.span(p.bucket, -w / 2 - o, foot, -d / 2 - o, w / 2 + o, p.h, -d / 2 + t, pc);
    sink.span(p.bucket, -w / 2 - o, foot, d / 2 - t, w / 2 + o, p.h, d / 2 + o, pc);
    sink.span(p.bucket, -w / 2 - o, foot, -d / 2 + t, -w / 2 + t, p.h, d / 2 - t, pc);
    sink.span(p.bucket, w / 2 - t, foot, -d / 2 + t, w / 2 + o, p.h, d / 2 - t, pc);
  }
  // the heaps: the fallen storeys inside, and outside under the lowest heads
  const heaps: Array<[number, number, number, number]> = [];
  const heap = (x: number, z: number, r: number, hgt: number, outside = false): void => {
    heaps.push([x, z, r, hgt]);
    sink.cylinder('stone', [x, foot, z], 'y', hgt - foot, r, 9, { ...(spec.colour ? { colour: shade(spec.colour, 0.8) } : {}), shadow: true, ...(outside ? { decor: true } : {}) },
      r * 0.45, true, look() * 3);
  };
  const height = spec.storeys.reduce((a, b) => a + b, 0);
  const inner = Math.min(w, d) - 2 * t;
  heap(-w * 0.08, d * 0.06, inner * 0.42, floor + Math.min(1.6, 0.5 + height * 0.12));
  heap(w * 0.16, -d * 0.18, inner * 0.26, floor + Math.min(1.0, 0.35 + height * 0.07));
  // (outside only along the front, under its breach, low against the wall and no wall a tank stops at: the plot's
  // edges are the street's and the neighbours')
  {
    const tp = tops.front, f = faces.front;
    let k = 0;
    for (let j = 1; j < tp.length; j++) if (tp[j] < tp[k]) k = j;
    if (tp[k] < floor + height * 0.6) {
      const u = -f.width / 2 + (f.width * k) / (tp.length - 1);
      const c = facePoint(f, Math.max(-f.width / 2 + 0.7, Math.min(f.width / 2 - 0.7, u)), 0, 0.2);
      heap(c[0], c[2], 0.6 + look() * 0.2, floor + 0.15 + look() * 0.2, true);
    }
  }
  const restOn = (x: number, z: number): number => {
    let y = floor;
    for (const [hx, hz, r, hgt] of heaps) {
      const rho = Math.hypot(x - hx, z - hz), top = r * 0.45;
      if (rho < r) y = Math.max(y, rho <= top ? hgt : foot + (hgt - foot) * (r - rho) / (r - top));
    }
    return y;
  };
  // the chimney stack standing, its firebox cut into its foot
  if (spec.chimney) {
    const c = spec.chimney, cc = c.colour ? { colour: c.colour } : {};
    const cf: Face = { origin: [c.x, 0, c.z + c.w / 2], u: [1, 0, 0], out: [0, 0, 1], width: c.w };
    sink.span(c.bucket, c.x - c.w / 2, foot, c.z - c.w / 2, c.x + c.w / 2, c.h, c.z + c.w / 2 - 0.4, cc);
    holedPolygon(sink, c.bucket, cf, [[-c.w / 2, foot], [c.w / 2, foot], [c.w / 2, c.h], [-c.w / 2, c.h]],
      [{ u0: -Math.min(0.45, c.w / 2 - 0.15), u1: Math.min(0.45, c.w / 2 - 0.15), y0: floor + 0.05, y1: floor + 0.8 }], 0.4, 0.36, cc);
    sink.span(c.bucket, c.x - c.w / 2 - 0.06, c.h, c.z - c.w / 2 - 0.06, c.x + c.w / 2 + 0.06, c.h + 0.12, c.z + c.w / 2 + 0.06, { ...cc, shade: 0.55 });
  }
  // the hearth against a wall's inside, its firebox cut into its front, the soot-dark back of the box behind
  if (spec.hearth) {
    const hf = faces[spec.hearth.face], hw = spec.hearth.w, deep = 0.55, mantel = floor + 1.9;
    const front: Face = { origin: facePoint(hf, spec.hearth.u, 0, -t - deep), u: [-hf.u[0], -hf.u[1], -hf.u[2]], out: [-hf.out[0], -hf.out[1], -hf.out[2]], width: hw };
    holedPolygon(sink, spec.wall, front, [[-hw / 2, foot], [hw / 2, foot], [hw / 2, mantel], [-hw / 2, mantel]],
      [{ u0: -hw / 2 + 0.25, u1: hw / 2 - 0.25, y0: floor + 0.1, y1: floor + 1.15 }], deep, deep - 0.06, wallOpts);
    faceBox(sink, 'stone', front, 0, mantel + 0.06, 0.08, hw + 0.2, 0.12, 0.16, { ...(spec.colour ? { colour: shade(spec.colour, 1.1) } : {}), decor: true });
  }
  sink.dressing(spec.mobile, () => {
    const charred = { colour: spec.timber, decor: true, exposed: true } as const;
    // the joists broken off at each storey line, out of the side walls where the wall stands over the line
    for (let s = 1; s < spec.storeys.length; s++) {
      const y = storeyY(s);
      for (const name of ['right', 'left'] as const) {
        const f = faces[name], tp = tops[name], n = tp.length - 1;
        for (let u = -f.width / 2 + 0.35; u < f.width / 2 - 0.3; u += 0.6) {
          const k = Math.round(((u + f.width / 2) / f.width) * n);
          if (tp[k] < y + 0.35 || look() < 0.35) continue;
          const len = 0.25 + look() * 0.7;
          sink.member('structureWood', facePoint(f, u, y - 0.1, -t + 0.12), facePoint(f, u, y - 0.1 - look() * 0.15, -t - len), 0.14, 0.2, [0, 1, 0], charred, 0);
        }
      }
    }
    // the bars out of a concrete shell's broken heads
    if (spec.rebar) {
      for (const name of ['front', 'right', 'back', 'left'] as const) {
        const f = faces[name], tp = tops[name], n = tp.length - 1;
        for (let k = 1; k < n; k += 2) {
          if (tp[k] < floor + 1.2 || look() < 0.4) continue;
          const u = -f.width / 2 + (f.width * k) / n, p = facePoint(f, u, tp[k] - 0.05, -t / 2);
          sink.member('structureWood', p, [p[0] + (look() - 0.5) * 0.5, p[1] + 0.4 + look() * 0.6, p[2] + (look() - 0.5) * 0.5], 0.025, 0.025, [0, 0, 1],
            { colour: spec.rebar, decor: true, exposed: true, fine: true }, 0);
        }
      }
    }
    // the masonry's chunks on the heaps, the roof's covering slid in over them, its rafters charred across them
    const chunk = spec.colour ? { colour: shade(spec.colour, 0.9), decor: true } : { decor: true };
    for (let k = 0; k < 10; k++) {
      const x = (look() - 0.5) * (w - 1.0), z = (look() - 0.5) * (d - 1.0), s = 0.25 + look() * 0.35;
      sink.box(spec.wall, [x, restOn(x, z) + s * 0.3, z], [s * 0.6, s * 0.35, s * 0.45], chunk);
    }
    if (spec.roof) {
      const [pw, pd, pt] = spec.roof.piece, rc = { ...(spec.roof.colour ? { colour: spec.roof.colour } : {}), decor: true };
      for (let k = 0; k < 6; k++) {
        const x = (look() - 0.5) * (w - 1.6), z = (look() - 0.5) * (d - 1.6), tilt = 0.2 + look() * 0.5, yaw = look() * Math.PI * 2;
        const y = restOn(x, z) + (pd / 2) * Math.sin(tilt) + pt;
        const ca = Math.cos(yaw), sa = Math.sin(yaw);
        const ax: V = [ca, 0, -sa], dz: V = [sa * Math.cos(tilt), Math.sin(tilt), ca * Math.cos(tilt)];
        const corner = (i: number, j: number): V => [x + ax[0] * i * pw / 2 + dz[0] * j * pd / 2, y + dz[1] * j * pd / 2, z + ax[2] * i * pw / 2 + dz[2] * j * pd / 2];
        const n = cross(sub(corner(1, -1), corner(-1, -1)), sub(corner(1, 1), corner(-1, -1)));
        quadFacing(sink, spec.roof.bucket, [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)], n[1] >= 0 ? n : [-n[0], -n[1], -n[2]], rc);
        quadFacing(sink, spec.roof.bucket, [corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1)].map((p): V => [p[0], p[1] - pt, p[2]]), n[1] >= 0 ? [-n[0], -n[1], -n[2]] : n, rc);
      }
      // the rafters: from a standing head down into the heap
      for (let k = 0; k < 3; k++) {
        const name = (['front', 'back', 'left', 'right'] as const)[Math.floor(look() * 4)], f = faces[name], tp = tops[name];
        const j = Math.floor(look() * tp.length), u = -f.width / 2 + (f.width * j) / (tp.length - 1);
        const head = facePoint(f, Math.max(-f.width / 2 + 0.3, Math.min(f.width / 2 - 0.3, u)), tp[j] - 0.15, -t / 2);
        const fx = (look() - 0.5) * (w - 2 * t - 1.0), fz = (look() - 0.5) * (d - 2 * t - 1.0);
        sink.member('structureWood', [fx, restOn(fx, fz) - 0.05, fz], head, 0.14, 0.18, [0, 1, 0], charred, 0);
      }
    }
  });
  return { faces, tops, floor, restOn };
}

// ------------------------------------------------------------------------------------------------ the plan ruin, the
// street rubble pile (props census #7, lane B 2026-10-14: extracted from props.ts as they were — the same draws from the
// same streams in the same order, byte for byte — for this lane to rebuild on the grammar)

/** The base catalog's ruin (the plan's 'ruin' plot): four broken walls of piers over a slab. */
export function makeRuin(rng: () => number, buckets: GeometryBuckets): StructureDimensions {
  const w = 6.0 + rng(), d = 8.0 + rng() * 1.5;
  const stone = buckets.stone;
  stone.push(box(w + 0.3, 1.0, d + 0.3).translate(0, -0.1, 0));
  // four broken walls: sequences of piers with varying heights
  const t = 0.5;
  const walls = [
    { len: d, rot: 0, ox: -w / 2 + t / 2, oz: 0 },
    { len: d, rot: 0, ox: w / 2 - t / 2, oz: 0 },
    { len: w - 2 * t, rot: Math.PI / 2, ox: 0, oz: -d / 2 + t / 2 },
    { len: w - 2 * t, rot: Math.PI / 2, ox: 0, oz: d / 2 - t / 2 },
  ];
  for (const wl of walls) {
    const segs = 3 + ((rng() * 3) | 0);
    const segLen = wl.len / segs;
    for (let k = 0; k < segs; k++) {
      if (rng() < 0.3) continue; // collapsed gap
      const hh = 0.9 + rng() * 2.1;
      const b = box(t, hh, segLen * 0.94, 0.7);
      b.translate(0, hh / 2, -wl.len / 2 + (k + 0.5) * segLen);
      if (wl.rot) b.rotateY(wl.rot);
      b.translate(wl.ox, 0, wl.oz);
      stone.push(b);
    }
  }
  return { w: w + 0.3, d: d + 0.3, h: 3.0 };
}

const _rubbleOff = new Float32Array(24);
/**
 * A box roughened into an irregular broken-masonry hexahedron: each of its eight corners moved by its own offset (shared
 * corners move together, so the faces stay welded). Draws 24 numbers from `rrng`.
 */
export function roughenChunk<T extends THREE.BufferGeometry>(chunk: T, rrng: () => number, amt: number): T {
  for (let c = 0; c < 8; c++) {
    _rubbleOff[c * 3] = (rrng() - 0.5) * amt;
    _rubbleOff[c * 3 + 1] = (rrng() - 0.5) * amt * 0.7;
    _rubbleOff[c * 3 + 2] = (rrng() - 0.5) * amt;
  }
  const cp = chunk.attributes.position;
  for (let i = 0; i < cp.count; i++) {
    const ci = (cp.getX(i) > 0 ? 1 : 0) + (cp.getY(i) > 0 ? 2 : 0) + (cp.getZ(i) > 0 ? 4 : 0);
    cp.setXYZ(i, cp.getX(i) + _rubbleOff[ci * 3], cp.getY(i) + _rubbleOff[ci * 3 + 1],
      cp.getZ(i) + _rubbleOff[ci * 3 + 2]);
  }
  chunk.computeVertexNormals();
  return chunk;
}

/**
 * A street rubble pile's pieces at (x, y, z), `pr` across: heaped masonry chunks of three classes (blocks, wall slabs,
 * brick clumps) over a ring of brick shards feathering it into the ground, and a charred beam jutting out of most.
 * Drawn from `rrng` exactly as props.ts drew them (the pile's draws feed the street's next candidates). `chunks`: how many
 * of the stone pieces (the first) are the heap's chunks, before the shards.
 */
export function rubblePileParts(x: number, y: number, z: number, pr: number, rrng: () => number): { stone: THREE.BufferGeometry[]; wood: THREE.BufferGeometry[]; chunks: number } {
  const stone: THREE.BufferGeometry[] = [], wood: THREE.BufferGeometry[] = [];
  const n = 6 + ((rrng() * 5) | 0);
  for (let k = 0; k < n; k++) {
    const a = rrng() * Math.PI * 2, rr = Math.sqrt(rrng()) * pr;
    const cs = 0.35 + rrng() * 0.8;
    // mix chunk classes: blocky masonry / flat slab / brick-proportioned
    const cls = rrng();
    const chunk = cls < 0.55
      ? box(cs, cs * (0.5 + rrng() * 0.5), cs * (0.6 + rrng() * 0.6), 0.9)
      : cls < 0.8
        ? box(cs * 1.3, cs * 0.22, cs * (0.8 + rrng() * 0.5), 0.9)   // wall slab
        : box(cs * 0.7, cs * 0.3, cs * 0.35, 0.9);                    // brick clump
    roughenChunk(chunk, rrng, cs * 0.34);
    jitterUV(chunk, rrng);
    chunk.rotateY(rrng() * Math.PI);
    chunk.rotateX((rrng() - 0.5) * 0.5);
    chunk.translate(x + Math.cos(a) * rr, y + 0.12 + (1 - rr / pr) * pr * 0.35, z + Math.sin(a) * rr);
    stone.push(chunk);
  }
  // brick-shard apron: small debris feathering the pile into the ground
  for (let k = 0; k < 7; k++) {
    const a = rrng() * Math.PI * 2, rr = pr * (0.8 + rrng() * 0.6);
    const bs = 0.10 + rrng() * 0.16;
    const shard = roughenChunk(box(bs * 1.7, bs * 0.7, bs, 1.2), rrng, bs * 0.4);
    shard.rotateY(rrng() * Math.PI);
    shard.translate(x + Math.cos(a) * rr, y + 0.05, z + Math.sin(a) * rr);
    stone.push(shard);
  }
  if (rrng() < 0.6) { // charred beam jutting out
    const beam = box(0.14, 0.14, 2.2 + rrng() * 1.4, 1.0);
    beam.rotateX(-0.5 - rrng() * 0.4);
    beam.rotateY(rrng() * Math.PI * 2);
    beam.translate(x, y + pr * 0.4, z);
    wood.push(beam);
  }
  // (props census #7, lane B 2026-10-14; the judges: "loose boxes on the road, no body to the heap") the heap's fill
  // body under its chunks — sunk at its edge, its crown under the chunks' — and the other chunk classes bedded in it:
  // brick courses still bonded, planks, all from the pile's own seat (a hash of it: the street stream is never drawn)
  const h = seatStream(x, z);
  stone.push(fillBody(x, y, z, pr, h));
  for (let k = 0; k < 3; k++) {
    const a = h() * Math.PI * 2, rr = (0.25 + h() * 0.6) * pr, bl = 0.6 + h() * 0.5;
    const course = roughenChunk(box(bl, 0.16, 0.24, 0.9), h, 0.05);
    course.rotateZ((h() - 0.5) * 0.6);
    course.rotateY(h() * Math.PI);
    course.translate(x + Math.cos(a) * rr, y + fillAt(rr / pr, pr) - 0.05, z + Math.sin(a) * rr);
    stone.push(course);
  }
  for (let k = 0; k < 2; k++) {
    const a = h() * Math.PI * 2, rr = (0.2 + h() * 0.5) * pr, len = 1.0 + h() * 0.8;
    const plank = box(len, 0.05, 0.2, 1.0);
    plank.rotateZ(-0.35 - h() * 0.4);
    plank.rotateY(h() * Math.PI * 2);
    plank.translate(x + Math.cos(a) * rr, y + fillAt(rr / pr, pr) + 0.1, z + Math.sin(a) * rr);
    wood.push(plank);
  }
  return { stone, wood, chunks: n };
}

/** A deterministic stream from a seat (its position to the centimetre): no draw from the street's stream. */
function seatStream(x: number, z: number): () => number {
  let a = (Math.imul(Math.round(x * 100), 73856093) ^ Math.imul(Math.round(z * 100), 19349663)) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The fill's height over the seat at a fraction `s` of the pile's radius out from its middle. */
function fillAt(s: number, pr: number): number {
  return Math.max(0, pr * 0.42 * (1 - s * s));
}

/** The heap's fill body: a low mound of rings out from its crown, its edge sunk 0.6 m (a slope's fall stays covered). */
function fillBody(x: number, y: number, z: number, pr: number, h: () => number): THREE.BufferGeometry {
  const seg = 10, rings: Array<[number, number]> = [[0.3, fillAt(0.3, pr)], [0.6, fillAt(0.6, pr)], [0.9, fillAt(0.9, pr) + 0.04], [1.18, -0.6]];
  const pos: number[] = [], idx: number[] = [];
  pos.push(x, y + fillAt(0, pr) + 0.02, z);
  const jit = Array.from({ length: seg }, () => 0.85 + h() * 0.3);
  for (const [s, hy] of rings) {
    for (let j = 0; j < seg; j++) {
      const a = (j / seg) * Math.PI * 2, r = s * pr * jit[j];
      pos.push(x + Math.cos(a) * r, y + hy * (s < 1.1 ? jit[j] : 1), z + Math.sin(a) * r);
    }
  }
  for (let j = 0; j < seg; j++) idx.push(0, 1 + ((j + 1) % seg), 1 + j);
  for (let r = 0; r + 1 < rings.length; r++) {
    const a0 = 1 + r * seg, b0 = 1 + (r + 1) * seg;
    for (let j = 0; j < seg; j++) {
      const j1 = (j + 1) % seg;
      idx.push(a0 + j, a0 + j1, b0 + j1, a0 + j, b0 + j1, b0 + j);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const uv: number[] = [];
  for (let i = 0; i < pos.length; i += 3) uv.push(pos[i] * 0.5, pos[i + 2] * 0.5);
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
