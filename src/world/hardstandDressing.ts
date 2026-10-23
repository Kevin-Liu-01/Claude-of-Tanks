// src/world/hardstandDressing.ts — what stands on a paved hardstand (props lane A, family #19, 2026-10-15; WORKLIST.md
// #19 ground:hardstand-and-paved-surfaces: "no slab edge or lip where concrete meets turf, no slab geometry or broken
// corners, no runway markings, edge lights, drains or kerb"). The coordinator's ruling (2026-10-15): render-only props
// geometry, NO step in the drive surface — the lip flush or a shallow chamfer at most 2.5 cm proud, the markings and
// grates a skin over the graded plane; terrain grading and shading stay the ground lane's (hardstandSurface.ts,
// terrain.ts).
//
// A pad the terrain paves (the map's roads paved, or its town rect's: terrain.ts gRoadTex >= 0.5) gets its concrete
// edge (a chamfered band where the slab meets the ground, left open where a road runs in), gully grates along two of its
// sides and a few patched and cracked panels; a pad the map leaves as packed earth keeps the ground lane's paint and
// ruts. An airfield's runway (a strip five times longer than wide on a map paved as aerodrome concrete) is marked as one
// is: the edge stripes, the centreline's dashes, the threshold's piano keys at both ends, and its edge lights every
// 60 m on concrete bases a step outside the edge (none where an apron meets it), a few of them knocked over. One geometry on the baked material's
// vertex colour: no draw of its own, no record.
import * as THREE from 'three';
import { hash, hexLin, mix, type Rgb } from './maps/craftMesh.ts';
import type { HardstandConfig } from './hardstandSurface.ts';

/** The terrain's paving settings a pad reads (a map's `splat`). */
interface PavingSplat {
  pavedRoads?: boolean;
  roadTexMix?: number;
  townPaving?: boolean;
  pavement?: { slabM: number };
}
interface DressingGround { getHeightAt(x: number, z: number): number }
interface TownRect { x0: number; x1: number; z0: number; z1: number }

/** How far the markings and grates stand over the graded plane (m): a skin, never a step. */
const SKIN_M = 0.012;
/** The edge's lip over the plane (m): the ruling's ceiling is 2-3 cm. */
export const HARDSTAND_LIP_M = 0.022;

const CONCRETE = hexLin(0xa8a49a), CONCRETE_DARK = hexLin(0x7e7a72), PAINT = hexLin(0xd8d8d0), WORN = hexLin(0xb4b2aa);
const IRON = hexLin(0x2c2a28), IRON_RIM = hexLin(0x4a4642), PATCH = hexLin(0x55534e), CRACK = hexLin(0x3a3834);
const LIGHT_GLASS = hexLin(0xe8c060), LIGHT_BASE = hexLin(0x8e8a82);

/** Whether the terrain paves the pad at (x, z) (terrain.ts gRoadTex >= 0.5: a paved map, or its paved town rect). */
export function hardstandIsPaved(splat: PavingSplat | null | undefined, x: number, z: number, town?: TownRect | null): boolean {
  if (!splat) return false;
  if (splat.pavedRoads || (splat.roadTexMix ?? 0) >= 0.5) return true;
  return !!(splat.townPaving && town && x > town.x0 && x < town.x1 && z > town.z0 && z < town.z1);
}

class Writer {
  readonly p: number[] = []; readonly n: number[] = []; readonly c: number[] = []; readonly t: number[] = [];
  private readonly ground: DressingGround;
  constructor(ground: DressingGround) { this.ground = ground; }
  y(x: number, z: number): number { return this.ground.getHeightAt(x, z); }
  /** A flat quad over the plane, `lift` above it at each corner (a, b, c, d round it), wound to face up (the film: quads
   *  wound the other way drew dark, their normals turned under the double-sided material). */
  skin(q: readonly (readonly [number, number])[], lift: number, col: Rgb): void {
    const pts = q.map(([x, z]) => [x, this.y(x, z) + lift, z] as const);
    this.tri(pts[0], pts[1], pts[2], [0, 1, 0], col); this.tri(pts[0], pts[2], pts[3], [0, 1, 0], col);
  }
  v(q: readonly [number, number, number], nrm: readonly [number, number, number], col: Rgb): void {
    this.p.push(q[0], q[1], q[2]); this.n.push(nrm[0], nrm[1], nrm[2]); this.c.push(col[0], col[1], col[2]); this.t.push(q[0] * 0.3, q[2] * 0.3);
  }
  /** A triangle with its own face normal, wound to face `out`. */
  tri(a: readonly [number, number, number], b: readonly [number, number, number], c: readonly [number, number, number],
    out: readonly [number, number, number], col: Rgb): void {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], wx = c[0] - a[0], wy = c[1] - a[1], wz = c[2] - a[2];
    let nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    if (nx * out[0] + ny * out[1] + nz * out[2] < 0) { [b, c] = [c, b]; nx = -nx; ny = -ny; nz = -nz; }
    const l = Math.hypot(nx, ny, nz) || 1;
    for (const q of [a, b, c]) this.v(q, [nx / l, ny / l, nz / l], col);
  }
  geometry(): THREE.BufferGeometry | null {
    if (!this.p.length) return null;
    const g = new THREE.BufferGeometry();
    g.name = 'hardstand-dressing';
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.t, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    return g;
  }
}

/** A strip's frame: `at(u, v)` the world point `u` across (local x) and `v` along (local z) from its centre. */
function frame(s: HardstandConfig) {
  const yaw = (s.yawDeg ?? 0) * Math.PI / 180, c = Math.cos(yaw), si = Math.sin(yaw);
  return {
    hw: s.width / 2, hl: s.length / 2,
    at: (u: number, v: number): [number, number] => [s.x + c * u + si * v, s.z - si * u + c * v],
    across: [c, 0, -si] as const, along: [si, 0, c] as const,
  };
}

/** Whether (x, z) lies on a strip other than `self` (a lip or a gully there would stand in the middle of its paving). */
type OnOther = (x: number, z: number) => boolean;
function onOtherStrip(strips: readonly HardstandConfig[], self: number): OnOther {
  const frames = strips.map(frame);
  return (x, z) => frames.some((f, i) => {
    if (i === self) return false;
    const s = strips[i], yaw = (s.yawDeg ?? 0) * Math.PI / 180, dx = x - s.x, dz = z - s.z;
    return Math.abs(dx * Math.cos(yaw) - dz * Math.sin(yaw)) < f.hw - 0.3 && Math.abs(dx * Math.sin(yaw) + dz * Math.cos(yaw)) < f.hl - 0.3;
  });
}

/** The distance from (x, z) to the nearest road centreline (the layout's paths). */
function roadDistance(roads: readonly (readonly (readonly [number, number])[])[], x: number, z: number): number {
  let best = Infinity;
  for (const path of roads) for (let i = 0; i + 1 < path.length; i++) {
    const [ax, az] = path[i], [bx, bz] = path[i + 1], dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / l2));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best;
}

/**
 * The slab's edge round a pad: a band 0.34 m wide along each side, its top `HARDSTAND_LIP_M` over the plane between two
 * chamfers that run down to the plane (inside) and to the ground (outside), in 3 m lengths (each its own tone, a few
 * spalled lower); open where a road runs in.
 */
function lip(w: Writer, s: HardstandConfig, roads: readonly (readonly (readonly [number, number])[])[], other: OnOther, seed: number): void {
  const f = frame(s);
  const sides: Array<[number, number, number, number, readonly [number, number, number]]> = [
    // [u0, v0, u1, v1] along the side, and its outward normal
    [-f.hw, -f.hl, -f.hw, f.hl, [-f.across[0], 0, -f.across[2]]], [f.hw, -f.hl, f.hw, f.hl, f.across],
    [-f.hw, -f.hl, f.hw, -f.hl, [-f.along[0], 0, -f.along[2]]], [-f.hw, f.hl, f.hw, f.hl, f.along],
  ];
  for (const [si, [u0, v0, u1, v1, out]] of sides.entries()) {
    const len = Math.hypot(u1 - u0, v1 - v0), n = Math.max(1, Math.round(len / 3));
    const ou = out[0] * f.across[0] + out[2] * f.across[2], ov = out[0] * f.along[0] + out[2] * f.along[2];
    for (let k = 0; k < n; k++) {
      const t0 = k / n, t1 = (k + 1) / n;
      const mu = u0 + (u1 - u0) * (t0 + t1) / 2, mv = v0 + (v1 - v0) * (t0 + t1) / 2, [mx, mz] = f.at(mu, mv);
      if (roadDistance(roads, mx, mz) < 4.5 || other(mx, mz)) continue;
      const h = hash(si * 997 + k, 3, seed), top = HARDSTAND_LIP_M * (h < 0.12 ? 0.35 : 0.85 + 0.15 * h);
      const col = mix(CONCRETE, CONCRETE_DARK, hash(k, si, seed) * 0.6);
      // the section across the band: inside on the plane, the top's two arrises, outside on the ground
      const section: Array<[number, number]> = [[-0.24, 0], [-0.17, top], [0.06, top], [0.1, 0]];
      const ring = (t: number) => section.map(([o, y]) => {
        const u = u0 + (u1 - u0) * t + ou * o, v = v0 + (v1 - v0) * t + ov * o, [x, z] = f.at(u, v);
        return [x, w.y(x, z) + y - (o > 0.09 ? 0.02 : 0), z] as const;
      });
      const a = ring(t0), b = ring(t1);
      for (let j = 0; j + 1 < section.length; j++) {
        const up: readonly [number, number, number] = j === 1 ? [0, 1, 0] : j === 0 ? [-out[0], 1, -out[2]] : [out[0], 1, out[2]];
        w.tri(a[j], b[j], b[j + 1], up, col); w.tri(a[j], b[j + 1], a[j + 1], up, col);
      }
    }
  }
}

/** A gully grate set into the slab: its iron frame and its bars, a skin over the plane. */
function grate(w: Writer, f: ReturnType<typeof frame>, u: number, v: number, alongSide: boolean): void {
  const hu = alongSide ? 0.25 : 0.35, hv = alongSide ? 0.35 : 0.25;
  const q = (du: number, dv: number) => f.at(u + du, v + dv);
  w.skin([q(-hu, -hv), q(hu, -hv), q(hu, hv), q(-hu, hv)], SKIN_M, IRON_RIM);
  const bars = 5;
  for (let b = 0; b < bars; b++) {
    const t = -0.8 + (1.6 * (b + 0.5)) / bars;
    if (alongSide) w.skin([q(-hu * 0.8, t * hv - 0.02), q(hu * 0.8, t * hv - 0.02), q(hu * 0.8, t * hv + 0.02), q(-hu * 0.8, t * hv + 0.02)], SKIN_M + 0.003, IRON);
    else w.skin([q(t * hu - 0.02, -hv * 0.8), q(t * hu + 0.02, -hv * 0.8), q(t * hu + 0.02, hv * 0.8), q(t * hu - 0.02, hv * 0.8)], SKIN_M + 0.003, IRON);
  }
}

/** The worn yard: gullies along two sides, a few patched and cracked panels. */
function yard(w: Writer, s: HardstandConfig, other: OnOther, seed: number): void {
  const f = frame(s);
  for (const side of [-1, 1]) {
    const n = Math.max(2, Math.floor(s.length / 15));
    for (let k = 0; k < n; k++) {
      const u = side * (f.hw - 1.2), v = -f.hl + (k + 0.5) * (s.length / n);
      if (!other(...f.at(u, v))) grate(w, f, u, v, false);
    }
  }
  const patches = 2 + Math.floor(hash(1, 1, seed) * 4);
  for (let i = 0; i < patches; i++) {
    const u = (hash(i, 2, seed) - 0.5) * (s.width - 8), v = (hash(i, 3, seed) - 0.5) * (s.length - 8);
    const pu = 1.2 + hash(i, 4, seed) * 2.6, pv = 1 + hash(i, 5, seed) * 2.2;
    w.skin([f.at(u - pu, v - pv), f.at(u + pu, v - pv), f.at(u + pu, v + pv), f.at(u - pu, v + pv)], SKIN_M * 0.5, mix(PATCH, CONCRETE_DARK, hash(i, 6, seed) * 0.5));
    // a crack off the patch's corner: a thin dark line wandering out across the slab
    let cu = u + pu, cv = v + pv;
    for (let k = 0; k < 4; k++) {
      const du = 0.6 + hash(i * 7 + k, 7, seed) * 1.2, dv = (hash(i * 7 + k, 8, seed) - 0.3) * 1.4, l = Math.hypot(du, dv);
      const nu = -dv / l * 0.03, nv = du / l * 0.03;
      w.skin([f.at(cu - nu, cv - nv), f.at(cu + du - nu, cv + dv - nv), f.at(cu + du + nu, cv + dv + nv), f.at(cu + nu, cv + nv)], SKIN_M * 0.75, CRACK);
      cu += du; cv += dv;
    }
  }
}

/** A runway's markings and edge lights (its length along local z). */
function runway(w: Writer, s: HardstandConfig, other: OnOther, seed: number): void {
  const f = frame(s);
  const band = (u0: number, u1: number, v0: number, v1: number, col: Rgb, steps = 1) => {
    for (let k = 0; k < steps; k++) {
      const a = v0 + (v1 - v0) * k / steps, b = v0 + (v1 - v0) * (k + 1) / steps;
      // the paint worn through in places
      if (hash(Math.round(u0 * 10) + k, Math.round(a), seed) < 0.06) continue;
      w.skin([f.at(u0, a), f.at(u1, a), f.at(u1, b), f.at(u0, b)], SKIN_M, mix(col, WORN, hash(k, Math.round(u0), seed) * 0.5));
    }
  };
  // the side stripes 1 m inside each edge, 0.9 m wide, laid in 10 m lengths over the plane
  for (const side of [-1, 1]) band(side * (f.hw - 1.9), side * (f.hw - 1), -f.hl + 6, f.hl - 6, PAINT, Math.round((s.length - 12) / 10));
  // the centreline: 30 m dashes, 20 m gaps, between the thresholds' marks
  for (let v = -f.hl + 70; v + 30 < f.hl - 70; v += 50) band(-0.45, 0.45, v, v + 30, PAINT, 3);
  // the threshold's piano keys at both ends: eight bars a side of the centreline
  for (const end of [-1, 1]) {
    const v0 = end * (f.hl - 6), v1 = end * (f.hl - 36);
    for (let b = 0; b < 8; b++) for (const side of [-1, 1]) {
      const u = side * (3 + b * 2.4);
      band(Math.min(u, u + side * 1.8), Math.max(u, u + side * 1.8), Math.min(v0, v1), Math.max(v0, v1), PAINT, 3);
    }
  }
  // the edge lights: every 60 m a step outside each edge, a concrete base, a stub and its lens; a few knocked over
  for (const side of [-1, 1]) {
    for (let v = -f.hl + 10, k = 0; v <= f.hl - 10; v += 60, k++) {
      const [x, z] = f.at(side * (f.hw + 1.5), v), y = w.y(x, z), fallen = hash(k, side + 5, seed) < 0.18;
      // (none where an apron meets the runway: an inset light there, flush with the paving, is the apron's)
      if (other(x, z)) continue;
      // the base: a squat block 0.4 m square, half sunk
      const bh = 0.06, r = 0.2;
      const corners = [[-r, -r], [r, -r], [r, r], [-r, r]].map(([du, dv]) => f.at(side * (f.hw + 1.5) + du, v + dv));
      const top = corners.map(([cx, cz]) => [cx, y + bh, cz] as const), foot = corners.map(([cx, cz]) => [cx, y - 0.05, cz] as const);
      w.tri(top[0], top[1], top[2], [0, 1, 0], LIGHT_BASE); w.tri(top[0], top[2], top[3], [0, 1, 0], LIGHT_BASE);
      for (let i = 0; i < 4; i++) {
        const j = (i + 1) % 4, mx = (corners[i][0] + corners[j][0]) / 2 - x, mz = (corners[i][1] + corners[j][1]) / 2 - z;
        w.tri(foot[i], top[i], top[j], [mx, 0, mz], LIGHT_BASE); w.tri(foot[i], top[j], foot[j], [mx, 0, mz], LIGHT_BASE);
      }
      // the stub and its lens: upright, or lying on the ground beside its base
      const dir: readonly [number, number, number] = fallen ? [f.along[0], 0.05, f.along[2]] : [0, 1, 0];
      const foot0: readonly [number, number, number] = fallen ? [x + f.along[0] * 0.25, y + 0.04, z + f.along[2] * 0.25] : [x, y + bh, z];
      const sa = fallen ? [0, 1, 0] as const : f.across, sb = fallen ? [f.across[0], 0, f.across[2]] as const : f.along;
      const ring = (o: readonly [number, number, number], rr: number) => [0, 1, 2, 3, 4, 5].map((k6) => {
        const a = (k6 / 6) * Math.PI * 2;
        return [o[0] + (sa[0] * Math.cos(a) + sb[0] * Math.sin(a)) * rr, o[1] + (sa[1] * Math.cos(a) + sb[1] * Math.sin(a)) * rr,
          o[2] + (sa[2] * Math.cos(a) + sb[2] * Math.sin(a)) * rr] as const;
      });
      const at = (t: number) => [foot0[0] + dir[0] * t, foot0[1] + dir[1] * t, foot0[2] + dir[2] * t] as const;
      const r0 = ring(at(0), 0.035), r1 = ring(at(0.24), 0.035), r2 = ring(at(0.24), 0.06), r3 = ring(at(0.34), 0.05);
      for (let i = 0; i < 6; i++) {
        const j = (i + 1) % 6, out = [r0[i][0] - at(0)[0], r0[i][1] - at(0)[1], r0[i][2] - at(0)[2]] as const;
        w.tri(r0[i], r1[i], r1[j], out, IRON_RIM); w.tri(r0[i], r1[j], r0[j], out, IRON_RIM);
        w.tri(r2[i], r3[i], r3[j], out, LIGHT_GLASS); w.tri(r2[i], r3[j], r2[j], out, LIGHT_GLASS);
        w.tri(r1[i], r2[i], r2[j], [-dir[0], -dir[1], -dir[2]], IRON_RIM); w.tri(r1[i], r2[j], r1[j], [-dir[0], -dir[1], -dir[2]], IRON_RIM);
        w.tri(r3[i], r3[j], at(0.37), dir, LIGHT_GLASS);
      }
    }
  }
}

/**
 * The dressing of a map's paved pads (null: none paved). `roads` the layout's paths (a lip stays open where one runs in),
 * `town` the village rect (a town-paved map paves only there), `seed` the map's.
 */
export function buildHardstandDressing(strips: readonly HardstandConfig[] | undefined, splat: PavingSplat | null | undefined,
  ground: DressingGround, roads: readonly (readonly (readonly [number, number])[])[], town: TownRect | null, seed: number,
  undressed: ReadonlySet<number> = new Set()): THREE.BufferGeometry | null {
  if (!strips?.length) return null;
  const w = new Writer(ground);
  for (const [i, s] of strips.entries()) {
    if (!hardstandIsPaved(splat, s.x, s.z, town)) continue;
    // (the maps lane, 228) a pad a civic area dresses as a town square (civic/plans): no airfield lip, gullies or patches
    if (undressed.has(i)) continue;
    // (apron paint 234) a softened pad (hardstandSurface.ts paint.ragged) is worn ground, no slab: no concrete lip round
    // a square that is no longer there (the owner, 2026-10-22: "just get rid of thes square broders"), no gullies or patches
    if ((s.paint?.ragged ?? 0) > 0) continue;
    const own = Math.floor(hash(Math.round(s.x), Math.round(s.z), seed) * 0x7fffffff);
    const other = onOtherStrip(strips, i);
    lip(w, s, roads, other, own);
    // an aerodrome's runway (a strip five times longer than wide on a map paved as airfield concrete); its other pads and
    // every other paved yard take the gullies and the patched, cracked panels
    if (splat?.pavement && s.length >= s.width * 5) runway(w, s, other, own); else yard(w, s, other, own + i);
  }
  return w.geometry();
}
