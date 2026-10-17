// src/world/maps/clutterForms.ts — the clutter kinds' geometry, form by form (props lane A, family #2, 2026-10-14;
// WORKLIST.md #2: "lathe profiles (bilged casks from staves with chimes, recessed headboards, bungs and hoops with
// thickness; drums with rolled chimes, two swaged rolling hoops, bung caps, side seam); crates framed with corner posts
// and boards a face with gaps showing a dark interior, lid boards on cleats ...").
//
// Each builder returns one non-indexed geometry in the baked material's frame (base on y = 0, centred in plan): position,
// normal, uv (flat) and a linear vertex colour (the baked material's albedo). The near forms stay within 300 triangles
// and their far forms within 60 (clutterKit.ts folds one or the other by distance); every member is its own island and
// carries its own tone. Builders read only their arguments (a form's palette and a stream of their own).
import * as THREE from 'three';
import { Mesh, member, hexLin, mul, mix, type Rgb, type V3 } from './craftMesh.ts';

type Rng = () => number;
const FLAT: { kind: 'flat' } = { kind: 'flat' };
const SURFACE = { kind: 'render' as const, texel: [1, 1, 1] as Rgb };

export function newMesh(): Mesh { return new Mesh(SURFACE); }

/** A colour a shade off (per member: each board, stave or hoop its own). */
export function tone(c: Rgb, rng: Rng, k = 0.14): Rgb {
  const v = 1 + (rng() - 0.5) * k, w = 1 + (rng() - 0.5) * k * 0.35;
  return [c[0] * v * w, c[1] * v, c[2] * v / w];
}

/**
 * A surface of revolution about the y axis through (x, z): `profile` [r, y] from the bottom up, `seg` sides (`phase`
 * turns the first), each band's colour by `colour(side, band)`; `faceted` shades each side flat (a stave), else smooth.
 * A cap closes the profile's first ring (facing down) and its last (facing up) where asked and its radius is > 0.
 */
export function lathe(m: Mesh, profile: ReadonlyArray<readonly [number, number]>, seg: number, colour: (side: number, band: number) => Rgb,
  opts: { x?: number; z?: number; phase?: number; faceted?: boolean; capBottom?: boolean; capTop?: boolean; capColour?: Rgb } = {}): void {
  const x0 = opts.x ?? 0, z0 = opts.z ?? 0, phase = opts.phase ?? 0;
  const at = (k: number, r: number, y: number): V3 => {
    const a = phase + (k / seg) * Math.PI * 2;
    return [x0 + Math.cos(a) * r, y, z0 + Math.sin(a) * r];
  };
  const radial = (a: number, dr: number, dy: number): V3 => {
    // the profile's outward normal (dy, -dr) turned to angle a
    const l = Math.hypot(dr, dy) || 1, nr = dy / l, ny = -dr / l;
    return [Math.cos(a) * nr, ny, Math.sin(a) * nr];
  };
  const uv: readonly [number, number] = [0.5, 0.5];
  for (let j = 0; j + 1 < profile.length; j++) {
    const [r0, y0] = profile[j], [r1, y1] = profile[j + 1];
    if (r0 <= 0 && r1 <= 0) continue;
    const dr = r1 - r0, dy = y1 - y0;
    for (let k = 0; k < seg; k++) {
      const c = colour(k, j);
      const a0 = phase + (k / seg) * Math.PI * 2, a1 = phase + ((k + 1) / seg) * Math.PI * 2, am = (a0 + a1) / 2;
      const n0 = opts.faceted ? radial(am, dr, dy) : radial(a0, dr, dy), n1 = opts.faceted ? radial(am, dr, dy) : radial(a1, dr, dy);
      const p00 = at(k, r0, y0), p10 = at(k + 1, r0, y0), p01 = at(k, r1, y1), p11 = at(k + 1, r1, y1);
      if (r0 > 0) m.tri(p00, p11, p10, n0, n1, n1, uv, uv, uv, c);
      if (r1 > 0) m.tri(p00, p01, p11, n0, n0, n1, uv, uv, uv, c);
    }
  }
  const cap = (j: number, up: boolean) => {
    const [r, y] = profile[j];
    if (!(r > 0)) return;
    const c = opts.capColour ?? colour(0, j), n: V3 = [0, up ? 1 : -1, 0], centre: V3 = [x0, y, z0];
    for (let k = 0; k < seg; k++) {
      const a = at(k, r, y), b = at(k + 1, r, y);
      if (up) m.tri(centre, b, a, n, n, n, uv, uv, uv, c); else m.tri(centre, a, b, n, n, n, uv, uv, uv, c);
    }
  };
  if (opts.capBottom) cap(0, false);
  if (opts.capTop) cap(profile.length - 1, true);
}

/** A box member with eased long edges from a to b (craftMesh member on the flat print). */
export function bar(m: Mesh, a: V3, b: V3, w: number, h: number, side: V3, col: Rgb, chamfer = 0, skipEnds = false): void {
  member(m, a, b, w, h, side, col, FLAT, { chamfer, skipEnds });
}

/** The writer's triangles turned about the vertical through the origin by `yaw` and moved (from vertex `from`). */
export function place(m: Mesh, from: number, yaw: number, x: number, y: number, z: number): void {
  m.turn(from, 0, 0, yaw);
  for (let i = from; i < m.p.length; i += 3) { m.p[i] += x; m.p[i + 1] += y; m.p[i + 2] += z; }
}

/** The writer's triangles laid over: turned about the horizontal axis through `pivot` (from vertex `from`). */
export function tip(m: Mesh, from: number, pivot: V3, axis: V3, angle: number): void {
  m.tilt(from, pivot, axis, angle);
}

export function finish(m: Mesh): THREE.BufferGeometry {
  const g = m.geometry();
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

const vsub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const vcross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const vdot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const vunit = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
/** A flat triangle facing `n` (wound to it). */
export function faceTri(m: Mesh, a: V3, b: V3, c: V3, n: V3, col: Rgb): void {
  const uv: [number, number] = [0.5, 0.5];
  if (vdot(vcross(vsub(b, a), vsub(c, a)), n) < 0) m.tri(a, c, b, n, n, n, uv, uv, uv, col);
  else m.tri(a, b, c, n, n, n, uv, uv, uv, col);
}

/**
 * A member of section `sec` from a to b: `sec` [s, u] counter-clockwise and convex, `s` the across axis and `u` the up
 * axis (both normal to b - a); its sides in `side` (by edge), its end caps in `ends` (null: open), the edge `open`
 * left out (a deck board's underside).
 */
export function extrude(m: Mesh, a: V3, b: V3, sec: ReadonlyArray<readonly [number, number]>, s: V3, u: V3,
  side: Rgb | ((edge: number) => Rgb), ends: Rgb | null, open = -1): void {
  const uv: [number, number] = [0.5, 0.5], n = sec.length;
  const at = (o: V3, p: readonly [number, number]): V3 => [o[0] + s[0] * p[0] + u[0] * p[1], o[1] + s[1] * p[0] + u[1] * p[1], o[2] + s[2] * p[0] + u[2] * p[1]];
  for (let i = 0; i < n; i++) {
    if (i === open) continue;
    const p0 = sec[i], p1 = sec[(i + 1) % n], ds = p1[0] - p0[0], du = p1[1] - p0[1];
    const out: V3 = [s[0] * du - u[0] * ds, s[1] * du - u[1] * ds, s[2] * du - u[2] * ds];
    const col = typeof side === 'function' ? side(i) : side;
    m.quad(at(a, p0), at(b, p0), at(b, p1), at(a, p1), out, () => uv, () => col, false);
  }
  if (!ends) return;
  const e = vunit(vsub(b, a));
  for (const [o, sign] of [[a, -1], [b, 1]] as const) {
    const nn: V3 = [e[0] * sign, e[1] * sign, e[2] * sign];
    for (let i = 1; i + 1 < n; i++) faceTri(m, at(o, sec[0]), at(o, sec[i]), at(o, sec[i + 1]), nn, ends);
  }
}
/** A board's section `w` wide and `t` thick with its upper long edges eased by `e` (its underside edge 0). */
export function easedBoard(w: number, t: number, e: number): Array<[number, number]> {
  return [[-w / 2, 0], [w / 2, 0], [w / 2, t - e], [w / 2 - e, t], [-w / 2 + e, t], [-w / 2, t - e]];
}
/** A waney plank's section: the bark left on its edges. */
export function waneyBoard(w: number, t: number, rng: Rng): Array<[number, number]> {
  const a = 0.008 + rng() * 0.012, b = 0.008 + rng() * 0.012;
  return [[-w / 2 + a, 0], [w / 2 - b, 0], [w / 2, t * 0.5], [w / 2 - b * 1.4, t], [-w / 2 + a * 1.4, t], [-w / 2, t * 0.5]];
}
/** A round pole from a to b (`seg` sides, its far end capped). */
export function pole(m: Mesh, a: V3, b: V3, r: number, seg: number, col: Rgb, capA = false): void {
  const e = vunit(vsub(b, a)), ref: V3 = Math.abs(e[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const s = vunit(vcross(ref, e)), u = vcross(e, s);
  const sec = Array.from({ length: seg }, (_, k) => [Math.cos((k / seg) * Math.PI * 2) * r, Math.sin((k / seg) * Math.PI * 2) * r] as [number, number]);
  const uv: [number, number] = [0.5, 0.5];
  const at = (o: V3, p: readonly [number, number]): V3 => [o[0] + s[0] * p[0] + u[0] * p[1], o[1] + s[1] * p[0] + u[1] * p[1], o[2] + s[2] * p[0] + u[2] * p[1]];
  for (let i = 0; i < seg; i++) {
    const p0 = sec[i], p1 = sec[(i + 1) % seg], pm: [number, number] = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2];
    m.quad(at(a, p0), at(b, p0), at(b, p1), at(a, p1), [s[0] * pm[0] + u[0] * pm[1], s[1] * pm[0] + u[1] * pm[1], s[2] * pm[0] + u[2] * pm[1]], () => uv, () => col, false);
  }
  for (const [o, sign, on] of [[a, -1, capA], [b, 1, true]] as const) {
    if (!on) continue;
    const nn: V3 = [e[0] * sign, e[1] * sign, e[2] * sign];
    for (let i = 1; i + 1 < seg; i++) faceTri(m, at(o, sec[0]), at(o, sec[i]), at(o, sec[i + 1]), nn, mul(col, 1.25));
  }
}

// ------------------------------------------------------------------------------------------------------- the drum

/** A steel drum's paint: the shell's, its hoops and chimes, its head's; the stencil band where it has one. */
export interface DrumPaint { shell: Rgb; hoop: Rgb; head: Rgb; band?: Rgb; rust: number }

/**
 * The 200-litre steel drum (the Wehrmacht's Kraftstoff, the US 55-gallon, the oil companies' liveries, the modern
 * chemical and scrap drums): its rolled chimes, two swaged rolling hoops, the head recessed inside the top chime with
 * its bung cap, the side seam. 0.585 m across, 0.88 m tall. Near ≤ 200 triangles, far ≤ 20; `lean` (a cache's rows,
 * where the sides stand hidden by their neighbours: clutterKit.ts CLUTTER_LEAN) keeps the chimes and the recessed head
 * and drops the rolling hoops, the bung and the seam (≤ 120, no far form).
 */
export function drumNear(p: DrumPaint, rng: Rng, lean = false): THREE.BufferGeometry {
  const m = newMesh();
  const R = 0.293, H = 0.88, seg = 8;
  const prof: Array<[number, number]> = lean
    ? [[0.286, 0], [0.298, 0.014], [R, 0.03], [R, H - 0.03], [0.298, H - 0.014], [0.286, H], [0.272, H - 0.014]]
    : [[0.286, 0], [0.298, 0.014], [R, 0.282], [0.304, 0.296], [R, 0.31], [R, 0.57], [0.304, 0.584], [R, 0.598],
      [0.298, H - 0.014], [0.286, H], [0.272, H - 0.014]];
  // the shell's tone down its height: the chimes and hoops in their own, the rust over them and at the wet foot, the
  // stencil band at the middle
  const rustC = hexLin(0x6a3a22);
  const shellAt = (band: number): Rgb => {
    const [r0, y0] = prof[band], [r1, y1] = prof[band + 1], y = (y0 + y1) / 2;
    if (y < 0.012 || y > H - 0.02) return mix(p.hoop, rustC, p.rust * 0.6);
    if (Math.max(r0, r1) > 0.3 && y > 0.1) return mix(p.hoop, rustC, p.rust * 0.3);
    let c = p.shell;
    if (p.band && !lean && y > 0.36 && y < 0.54) c = p.band;
    return mix(c, rustC, p.rust * (y < 0.2 ? 0.45 : 0.18));
  };
  const tones = Array.from({ length: seg }, () => 0.92 + rng() * 0.12);
  lathe(m, prof, seg, (k, band) => mul(shellAt(band), tones[k]), { phase: rng() * 0.5, capBottom: true });
  // the head, recessed 14 mm inside the top chime
  const hy = H - 0.014;
  lathe(m, [[0.272, hy], [0, hy]], seg, () => p.head, {});
  if (lean) return finish(m);
  // the 2-inch bung's cap (the 3/4-inch vent is a dimple in the head's paint)
  lathe(m, [[0.045, hy], [0.045, hy + 0.016], [0, hy + 0.022]], 5, () => mul(p.hoop, 0.9), { x: 0.17, z: 0.05 });
  // the side seam: a welded lap standing proud the shell's height between the chimes
  const sa = rng() * Math.PI * 2;
  const s: V3 = [Math.cos(sa), 0, Math.sin(sa)], o = (r: number, y: number): V3 => [s[0] * r, y, s[2] * r];
  bar(m, o(R + 0.004, 0.035), o(R + 0.004, H - 0.035), 0.022, 0.008, [0, 0, 1], mul(p.shell, 0.82), 0, true);
  return finish(m);
}

export function drumFar(p: DrumPaint): THREE.BufferGeometry {
  const m = newMesh();
  lathe(m, [[0.298, 0], [0.298, 0.88]], 6, () => (p.band ? mix(p.shell, p.band, 0.1) : p.shell), { capTop: true, capColour: p.head });
  return finish(m);
}

// ------------------------------------------------------------------------------------------------------- the barrel

/** A cask's wood, its hoops and its head; `staves` its count; `bilge` its belly over its ends. */
export interface CaskForm { wood: Rgb; hoop: Rgb; head: Rgb; staves: number; hoops: number; bilge: number; height: number; radius: number; tar?: boolean }

/**
 * The coopered cask (a wine or cider cask of oak, a herring or tar barrel, a sake taru with its bamboo hoops): its staves
 * each a tone of their own, bilged to the middle, the head hoops standing proud at its ends with the head recessed in
 * the chime, the bilge hoops proud with their thickness, the bung in the bilge stave. Near ≤ 220 triangles, far ≤ 30.
 */
function caskProfile(f: CaskForm): { prof: Array<[number, number]>; hoopBands: Set<number> } {
  const H = f.height, r0 = f.radius, rb = f.radius + f.bilge;
  const rAt = (y: number) => r0 + (rb - r0) * Math.sin(Math.PI * y / H);
  const hw = 0.024, proud = 0.009, hoopBands = new Set<number>();
  // the head hoop at the foot: its face from the ground, its top edge stepping back to the staves
  const prof: Array<[number, number]> = [[r0 + proud, 0], [rAt(2 * hw) + proud, 2 * hw], [rAt(2 * hw), 2 * hw]];
  hoopBands.add(0).add(1);
  // the bilge hoops (two on a four-hoop cask, one on a three): the staves flare into each one's foot
  for (const fy of f.hoops >= 4 ? [0.27, 0.73] : [0.5]) {
    const y = fy * H;
    hoopBands.add(prof.length).add(prof.length + 1);
    prof.push([rAt(y - hw) + proud, y - hw], [rAt(y + hw) + proud, y + hw], [rAt(y + hw), y + hw]);
  }
  // the head hoop at the top: the staves flare into it, its face to the chime, the chime's lip in to the head
  hoopBands.add(prof.length).add(prof.length + 1);
  prof.push([rAt(H - 2 * hw) + proud, H - 2 * hw], [r0 + proud, H], [r0 - 0.035, H - 0.03]);
  return { prof, hoopBands };
}
export function caskNear(f: CaskForm, rng: Rng): THREE.BufferGeometry {
  const m = newMesh();
  const { prof, hoopBands } = caskProfile(f), seg = f.staves;
  const staves = Array.from({ length: seg }, () => tone(f.wood, rng, 0.22));
  const tarred = f.tar ? 0.55 : 1, lip = prof.length - 2;
  lathe(m, prof, seg, (k, band) => (band === lip ? mul(staves[k], 0.8 * tarred) : hoopBands.has(band) ? f.hoop : mul(staves[k], tarred)),
    { faceted: true, phase: rng() * 0.3 });
  // the head, set down in the chime (the foot's stands on the ground)
  lathe(m, [[f.radius - 0.035, f.height - 0.03], [0, f.height - 0.03]], seg, () => tone(f.head, rng, 0.1), {});
  // the bung in the bilge stave: a wooden plug standing proud
  const ba = rng() * Math.PI * 2, by = f.height / 2 + (f.hoops >= 4 ? 0 : 0.09), br = f.radius + f.bilge;
  const d: V3 = [Math.cos(ba), 0, Math.sin(ba)];
  bar(m, [d[0] * (br - 0.01), by, d[2] * (br - 0.01)], [d[0] * (br + 0.02), by, d[2] * (br + 0.02)], 0.05, 0.05, [0, 1, 0], mul(f.wood, 0.7));
  return finish(m);
}

export function caskFar(f: CaskForm): THREE.BufferGeometry {
  const m = newMesh();
  const H = f.height, r0 = f.radius, rb = f.radius + f.bilge;
  lathe(m, [[r0, 0], [rb, H * 0.5], [r0, H]], 6, (_k, band) => (f.tar ? mul(f.wood, 0.55) : band ? f.wood : mul(f.wood, 0.92)),
    { capTop: true, capColour: f.head, faceted: true });
  return finish(m);
}

/**
 * The cask burst (a round through it, a hull over it): its foot still standing in the bottom hoop with the stub ends of
 * the staves round it, the other staves fallen out of it every way, the hoops loose among them and a head on its back.
 */
export function caskBroken(f: CaskForm, rng: Rng): THREE.BufferGeometry {
  const m = newMesh();
  const seg = f.staves, H = f.height, r0 = f.radius, rb = f.radius + f.bilge;
  // the foot: the stub of each stave in the bottom hoop, broken at its own height
  for (let k = 0; k < seg; k++) {
    const a = (k + 0.5) / seg * Math.PI * 2, top = H * (0.34 + rng() * 0.3);
    const w = 2 * Math.sin(Math.PI / seg) * r0 * 0.96;
    const c: V3 = [Math.cos(a) * (r0 + 0.01), 0, Math.sin(a) * (r0 + 0.01)], t: V3 = [Math.cos(a) * (r0 + 0.02 + (rb - r0) * 0.6), top, Math.sin(a) * (r0 + 0.02 + (rb - r0) * 0.6)];
    if (k % 3 !== 1) bar(m, c, t, w, 0.022, [-Math.sin(a), 0, Math.cos(a)], tone(f.wood, rng, 0.22));
  }
  lathe(m, [[r0 + 0.009, 0.03], [r0 + 0.009, 0.08]], seg, () => f.hoop, {});
  // the staves that fell out, lying round it, and two loose hoops
  for (let k = 0; k < Math.ceil(seg / 3); k++) {
    const a = rng() * Math.PI * 2, d = r0 + 0.25 + rng() * 0.4, len = H * (0.6 + rng() * 0.35);
    const ca = Math.cos(a), sa = Math.sin(a), turn = (rng() - 0.5) * 1.2;
    const dir: V3 = [Math.cos(a + turn), 0, Math.sin(a + turn)];
    const mid: V3 = [ca * d, 0.012, sa * d];
    bar(m, [mid[0] - dir[0] * len / 2, 0.012, mid[2] - dir[2] * len / 2], [mid[0] + dir[0] * len / 2, 0.012 + rng() * 0.05, mid[2] + dir[2] * len / 2],
      0.09, 0.022, [0, 1, 0], tone(f.wood, rng, 0.22));
  }
  for (let k = 0; k < 2; k++) {
    const from = m.mark;
    lathe(m, [[rb, 0], [rb, 0.04]], Math.max(8, seg - 2), () => f.hoop, {});
    tip(m, from, [0, 0, 0], [Math.cos(k * 2.1), 0, Math.sin(k * 2.1)], 1.35 + rng() * 0.2);
    place(m, from, rng(), (rng() - 0.5) * 0.5, rb * 0.25 + 0.02, (rng() - 0.5) * 0.5);
  }
  const from = m.mark;
  lathe(m, [[0, 0.02], [r0 - 0.035, 0.02], [r0 - 0.035, 0.045], [0, 0.045]], seg, () => f.head, {});
  place(m, from, rng(), r0 + 0.35, 0, -r0 - 0.2);
  return finish(m);
}

// ------------------------------------------------------------------------------------------------------- the crate

/** A crate's board tone, its frame's (corner posts or battens), its inside, its rope or tin straps, and its stencil. */
export interface CrateForm {
  w: number; h: number; d: number;
  boards: number; gap: number;
  wood: Rgb; frame: Rgb; inside: Rgb; strap?: Rgb; stencil?: Rgb;
  /** 'posts': four corner posts inside the boards (a supply crate); 'battens': battened ends (an ammunition box);
   *  'slats': an open slat crate (fruit); 'chest': a plywood tea chest on its battens with tin edging. */
  kind: 'posts' | 'battens' | 'slats' | 'chest';
  handles?: boolean;
}

/**
 * A board on a face: its front (its long edges eased by two chamfer strips where `eased`: a lid's) and its two edges to
 * the gap (no back: the crate's dark inside is behind it), along the face, `t` thick, `wide` across.
 */
function board(m: Mesh, centre: V3, along: V3, across: V3, out: V3, len: number, wide: number, t: number, col: Rgb, stencil?: Rgb, eased = false): void {
  const e = eased ? Math.min(0.01, wide * 0.2) : 0;
  const P = (u: number, v: number, o: number): V3 => [centre[0] + along[0] * u + across[0] * v + out[0] * o,
    centre[1] + along[1] * u + across[1] * v + out[1] * o, centre[2] + along[2] * u + across[2] * v + out[2] * o];
  const L = len / 2, W = wide / 2, uv: [number, number] = [0.5, 0.5];
  const q = (a: V3, b: V3, c: V3, d: V3, n: V3, k: number) => m.quad(a, b, c, d, n, () => uv, () => mul(col, k), false);
  if (stencil) {
    // the stencil: the middle third of the board's front in its paint (the board itself, not a plate on it)
    const s = L / 3;
    q(P(-L, -W + e, t), P(-s, -W + e, t), P(-s, W - e, t), P(-L, W - e, t), out, 1);
    m.quad(P(-s, -W + e, t), P(s, -W + e, t), P(s, W - e, t), P(-s, W - e, t), out, () => uv, () => stencil, false);
    q(P(s, -W + e, t), P(L, -W + e, t), P(L, W - e, t), P(s, W - e, t), out, 1);
  } else q(P(-L, -W + e, t), P(L, -W + e, t), P(L, W - e, t), P(-L, W - e, t), out, 1);
  if (eased) {
    const ea: V3 = [out[0] - across[0], out[1] - across[1], out[2] - across[2]], eb: V3 = [out[0] + across[0], out[1] + across[1], out[2] + across[2]];
    q(P(-L, -W, t - e), P(L, -W, t - e), P(L, -W + e, t), P(-L, -W + e, t), ea, 0.86);
    q(P(-L, W - e, t), P(L, W - e, t), P(L, W, t - e), P(-L, W, t - e), eb, 0.86);
  }
  q(P(-L, -W, 0), P(L, -W, 0), P(L, -W, t - e), P(-L, -W, t - e), [-across[0], -across[1], -across[2]], 0.62);
  q(P(-L, W, t - e), P(L, W, t - e), P(L, W, 0), P(-L, W, 0), across, 0.62);
}

/**
 * The crate: its boards a face with gaps showing its dark inside, its frame (corner posts, battened ends, slats or a
 * tea chest's battens and tin edges), its lid boards on cleats, rope handles on an ammunition box, its stencil a block
 * of darker paint pressed into the boards it lies across. Near ≤ 220 triangles, far ≤ 10.
 */
export function crateNear(f: CrateForm, rng: Rng): THREE.BufferGeometry {
  const m = newMesh();
  const { w, h, d } = f, t = 0.02;
  // the dark inside (no floor: it sits on the ground)
  const hx = w / 2 - t, hz = d / 2 - t, top = h - t;
  const uv: [number, number] = [0.5, 0.5];
  const inQ = (a: V3, b: V3, c: V3, dd: V3, n: V3) => m.quad(a, b, c, dd, n, () => uv, () => f.inside, false);
  inQ([hx, 0, -hz], [-hx, 0, -hz], [-hx, top, -hz], [hx, top, -hz], [0, 0, 1]);
  inQ([-hx, 0, hz], [hx, 0, hz], [hx, top, hz], [-hx, top, hz], [0, 0, -1]);
  inQ([-hx, 0, -hz], [-hx, 0, hz], [-hx, top, hz], [-hx, top, -hz], [1, 0, 0]);
  inQ([hx, 0, hz], [hx, 0, -hz], [hx, top, -hz], [hx, top, hz], [-1, 0, 0]);
  inQ([-hx, top, -hz], [-hx, top, hz], [hx, top, hz], [hx, top, -hz], [0, -1, 0]);
  const nb = f.boards, open = f.kind === 'slats';
  const pitch = h / nb, wide = pitch - f.gap * (open ? 3 : 1);
  const faces: Array<{ c: V3; along: V3; out: V3; len: number }> = [
    { c: [0, 0, d / 2 - t], along: [1, 0, 0], out: [0, 0, 1], len: w },
    { c: [0, 0, -d / 2 + t], along: [-1, 0, 0], out: [0, 0, -1], len: w },
    { c: [w / 2 - t, 0, 0], along: [0, 0, -1], out: [1, 0, 0], len: d - 2 * t },
    { c: [-w / 2 + t, 0, 0], along: [0, 0, 1], out: [-1, 0, 0], len: d - 2 * t },
  ];
  for (const [fi, face] of faces.entries()) {
    for (let k = 0; k < nb; k++) {
      const y = pitch * (k + 0.5);
      const col = tone(f.wood, rng, 0.2);
      // the stencil across the front's upper board
      const st = f.stencil && fi === 0 && k === nb - 1 ? mix(col, f.stencil, 0.6) : undefined;
      board(m, [face.c[0], y, face.c[2]], face.along, [0, 1, 0], face.out, face.len, wide, t, col, st);
    }
  }
  // the lid: boards across the top on two cleats
  const lb = Math.min(3, Math.max(2, Math.round(d / 0.2))), lp = d / lb;
  for (let k = 0; k < lb; k++) {
    const z = -d / 2 + lp * (k + 0.5);
    board(m, [0, h - t, z], [1, 0, 0], [0, 0, 1], [0, 1, 0], w, lp - f.gap, t, tone(f.wood, rng, 0.2), undefined, true);
  }
  // the frame
  const fc = tone(f.frame, rng, 0.1);
  if (f.kind === 'posts') {
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      bar(m, [sx * (w / 2 - 0.035), 0, sz * (d / 2 - 0.035)], [sx * (w / 2 - 0.035), h - 0.02, sz * (d / 2 - 0.035)], 0.06, 0.06, [1, 0, 0], tone(fc, rng, 0.1), 0, true);
    }
  } else if (f.kind === 'battens' || f.kind === 'chest') {
    // the ends' battens (top and bottom rails round each end) standing proud of the boards
    for (const sx of [-1, 1]) for (const y of [0.04, h - 0.04]) {
      bar(m, [sx * (w / 2 + 0.012), y, -d / 2 - 0.012], [sx * (w / 2 + 0.012), y, d / 2 + 0.012], 0.05, 0.045, [1, 0, 0], tone(fc, rng, 0.1));
    }
    if (f.kind === 'chest' && f.strap) {
      // the tin edging along the chest's top edges
      for (const sz of [-1, 1]) bar(m, [-w / 2 - 0.004, h - 0.012, sz * (d / 2 + 0.003)], [w / 2 + 0.004, h - 0.012, sz * (d / 2 + 0.003)], 0.03, 0.03, [0, 1, 0], f.strap);
    }
  } else {
    // a slat crate's corner posts are triangular battens
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      bar(m, [sx * (w / 2 - 0.03), 0, sz * (d / 2 - 0.03)], [sx * (w / 2 - 0.03), h, sz * (d / 2 - 0.03)], 0.05, 0.05, [1, 0, 0], tone(fc, rng, 0.1), 0.012, true);
    }
  }
  if (f.handles) {
    // rope beckets on the ends: a loop of rope through two cleats
    for (const sx of [-1, 1]) {
      bar(m, [sx * (w / 2 + 0.03), h * 0.62, -0.09], [sx * (w / 2 + 0.03), h * 0.62, 0.09], 0.03, 0.03, [1, 0, 0], hexLin(0x8c7a55));
    }
  }
  return finish(m);
}

export function crateFar(f: CrateForm): THREE.BufferGeometry {
  const m = newMesh();
  const uv: [number, number] = [0.5, 0.5];
  const { w, h, d } = f;
  const q = (a: V3, b: V3, c: V3, dd: V3, n: V3, col: Rgb) => m.quad(a, b, c, dd, n, () => uv, () => col, false);
  const side = mul(f.wood, 0.92), topc = f.wood;
  q([w / 2, 0, d / 2], [w / 2, 0, -d / 2], [w / 2, h, -d / 2], [w / 2, h, d / 2], [1, 0, 0], side);
  q([-w / 2, 0, -d / 2], [-w / 2, 0, d / 2], [-w / 2, h, d / 2], [-w / 2, h, -d / 2], [-1, 0, 0], side);
  q([-w / 2, 0, d / 2], [w / 2, 0, d / 2], [w / 2, h, d / 2], [-w / 2, h, d / 2], [0, 0, 1], side);
  q([w / 2, 0, -d / 2], [-w / 2, 0, -d / 2], [-w / 2, h, -d / 2], [w / 2, h, -d / 2], [0, 0, -1], side);
  q([-w / 2, h, -d / 2], [-w / 2, h, d / 2], [w / 2, h, d / 2], [w / 2, h, -d / 2], [0, 1, 0], topc);
  return finish(m);
}

/**
 * The crate split: two of its sides still standing at the corner with their boards, the others knocked out and lying
 * by it, the lid off and leaning, what it held spilled from its dark inside (a few smaller boxes or shells' cases).
 */
export function crateBroken(f: CrateForm, rng: Rng): THREE.BufferGeometry {
  const m = newMesh();
  const { w, h, d } = f, t = 0.02, nb = f.boards, pitch = h / nb, wide = pitch - f.gap;
  // the corner that stands: the back and the left side, their upper boards gone at their own heights
  for (const [fi, face] of [{ c: [0, 0, -d / 2 + t] as V3, along: [-1, 0, 0] as V3, out: [0, 0, -1] as V3, len: w },
    { c: [-w / 2 + t, 0, 0] as V3, along: [0, 0, 1] as V3, out: [-1, 0, 0] as V3, len: d - 2 * t }].entries()) {
    const keep = Math.max(1, nb - 1 - Math.floor(rng() * 2));
    for (let k = 0; k < keep; k++) board(m, [face.c[0], pitch * (k + 0.5), face.c[2]], face.along, [0, 1, 0], face.out, face.len * (1 - rng() * 0.15), wide, t, tone(f.wood, rng, 0.2));
    void fi;
  }
  bar(m, [-w / 2 + 0.035, 0, -d / 2 + 0.035], [-w / 2 + 0.035, h * (0.7 + rng() * 0.3), -d / 2 + 0.035], 0.06, 0.06, [1, 0, 0], f.frame, 0.012);
  // the boards knocked out, lying round the front and the right
  for (let k = 0; k < nb + 2; k++) {
    const a = -Math.PI / 4 + (rng() - 0.5) * 2.2, dist = 0.25 + rng() * 0.5, yaw = rng() * Math.PI;
    const from = m.mark;
    board(m, [0, 0, 0], [1, 0, 0], [0, 0, 1], [0, 1, 0], w * (0.5 + rng() * 0.5), wide, t, tone(f.wood, rng, 0.2));
    place(m, from, yaw, Math.cos(a) * dist + w * 0.2, 0.004 + k * 0.006, Math.sin(a) * dist + d * 0.2);
  }
  // the lid leaning on the standing corner
  const from = m.mark;
  for (let k = 0; k < 3; k++) board(m, [0, 0, -d / 2 + (k + 0.5) * d / 3], [1, 0, 0], [0, 0, 1], [0, 1, 0], w, d / 3 - f.gap, t, tone(f.wood, rng, 0.2));
  tip(m, from, [0, 0, 0], [1, 0, 0], -1.0);
  place(m, from, 0.3, 0.15, 0.02, d * 0.35);
  // what it held: two small dark boxes spilled from it
  for (let k = 0; k < 2; k++) {
    const s = 0.16 + rng() * 0.1, x = (rng() - 0.3) * w * 0.6, z = (rng() - 0.3) * d * 0.6;
    bar(m, [x - s / 2, s * 0.3, z], [x + s / 2, s * 0.3, z], s * 0.6, s * 0.6, [0, 1, 0], mul(f.frame, 0.7), 0.01);
  }
  return finish(m);
}

// ------------------------------------------------------------------------------------------------------- vessels

/** A turned vessel's colours: its body, its rim and foot, its glaze or label band. */
export interface VesselForm { body: Rgb; trim: Rgb; band?: Rgb; kind: 'hdpe' | 'jar' | 'khabia' | 'canister'; height: number; radius: number }

/** The vessel's profile ([r, y] from the foot up): a blow-moulded drum with its two rolling rings, a glazed jar's
 *  shoulder and neck, a terracotta khabia's belly, a store canister's ribbed can. */
function vesselProfile(f: VesselForm): Array<[number, number]> {
  const H = f.height, R = f.radius;
  switch (f.kind) {
    case 'hdpe': return [[R * 0.9, 0], [R, 0.04], [R, H * 0.3], [R * 1.035, H * 0.33], [R, H * 0.36], [R, H * 0.64], [R * 1.035, H * 0.67], [R, H * 0.7],
      [R, H - 0.04], [R * 0.9, H], [R * 0.86, H - 0.012]];
    case 'jar': return [[R * 0.55, 0], [R * 0.85, H * 0.18], [R, H * 0.45], [R * 0.9, H * 0.68], [R * 0.6, H * 0.84], [R * 0.42, H * 0.9], [R * 0.46, H * 0.97],
      [R * 0.4, H], [R * 0.34, H - 0.05]];
    case 'khabia': return [[R * 0.4, 0], [R * 0.75, H * 0.12], [R, H * 0.42], [R * 0.92, H * 0.7], [R * 0.6, H * 0.88], [R * 0.48, H * 0.93], [R * 0.52, H],
      [R * 0.44, H - 0.04]];
    case 'canister': return [[R * 0.96, 0], [R, 0.03], [R, H * 0.2], [R * 1.03, H * 0.22], [R, H * 0.24], [R, H * 0.76], [R * 1.03, H * 0.78], [R, H * 0.8],
      [R, H - 0.06], [R * 0.7, H], [R * 0.66, H - 0.02]];
  }
}
/** A turned vessel (the barrel kind's form where it is no cask). Near ≤ 220 triangles, far ≤ 30. */
export function vesselNear(f: VesselForm, rng: Rng): THREE.BufferGeometry {
  const m = newMesh();
  const prof = vesselProfile(f), seg = f.kind === 'canister' || f.kind === 'hdpe' ? 9 : 10, H = f.height;
  const tones = Array.from({ length: seg }, () => 0.93 + rng() * 0.1);
  lathe(m, prof, seg, (k, band) => {
    const y = (prof[band][1] + prof[band + 1][1]) / 2;
    let c = f.body;
    if (f.band && y > H * 0.4 && y < H * 0.6) c = f.band;
    if (band === 0 || band >= prof.length - 3) c = f.trim;
    if (f.kind === 'khabia' || f.kind === 'jar') c = mix(c, mul(c, 0.7), Math.max(0, 1 - y / (H * 0.35)) * 0.5);
    return mul(c, tones[k]);
  }, { capBottom: true, faceted: f.kind === 'khabia' });
  // its mouth or its cap: the opening's dark inside (a jar's, a khabia's), the screw caps on a drum or a can
  const top = prof[prof.length - 1];
  if (f.kind === 'jar' || f.kind === 'khabia') lathe(m, [[top[0], top[1]], [0, top[1] - 0.06]], seg, () => mul(f.body, 0.18), {});
  else {
    lathe(m, [[top[0], top[1]], [0, top[1]]], seg, () => f.trim, {});
    lathe(m, [[0.04, top[1]], [0.04, top[1] + 0.02], [0, top[1] + 0.024]], 5, () => mul(f.trim, 0.85), { x: f.radius * 0.5, z: 0 });
  }
  return finish(m);
}
export function vesselFar(f: VesselForm): THREE.BufferGeometry {
  const m = newMesh();
  const prof = vesselProfile(f);
  const pick = [prof[0], prof[Math.floor(prof.length / 2)], prof[prof.length - 2]];
  lathe(m, pick, 6, (_k, band) => (band ? mul(f.body, 0.95) : f.body), { capTop: true, capColour: mul(f.body, 0.5), faceted: true });
  return finish(m);
}
/** A vessel broken: a clay jar or a khabia in shards round its standing foot, a drum or a can split down its side and
 *  slumped, its top ring off. */
export function vesselBroken(f: VesselForm, rng: Rng): THREE.BufferGeometry {
  const m = newMesh();
  const prof = vesselProfile(f), H = f.height, R = f.radius;
  if (f.kind === 'jar' || f.kind === 'khabia') {
    // the foot to its belly, jagged, and the sherds round it
    const cut = H * (0.32 + rng() * 0.12);
    const foot = prof.filter(([, y]) => y < cut);
    foot.push([R * 0.95, cut]);
    lathe(m, foot, 11, (k) => mul(f.body, 0.9 + (k % 3) * 0.05), { capBottom: true, faceted: true });
    for (let k = 0; k < 7; k++) {
      const a = rng() * Math.PI * 2, d = R + 0.1 + rng() * 0.45, s = 0.08 + rng() * 0.12;
      const from = m.mark;
      lathe(m, [[s, 0], [s * 1.1, 0.03], [s * 0.9, 0.06]], 3, () => mul(f.body, 0.85 + rng() * 0.2), { faceted: true });
      tip(m, from, [0, 0, 0], [Math.cos(a), 0, Math.sin(a)], 0.6 + rng());
      place(m, from, rng() * 3, Math.cos(a) * d, 0.04, Math.sin(a) * d);
    }
  } else {
    // split down its side and slumped: the profile pressed to two thirds, leaning, its top ring beside it
    const from = m.mark;
    lathe(m, prof.map(([r, y]) => [r * (1 + 0.15 * Math.sin(y * 7)), y * 0.62] as [number, number]), 10, (k) => mul(f.body, 0.85 + (k % 2) * 0.1), { capBottom: true });
    tip(m, from, [R, 0, 0], [0, 0, 1], 0.25);
    const ring = m.mark;
    lathe(m, [[R, 0], [R, 0.05]], 10, () => f.trim, {});
    tip(m, ring, [0, 0, 0], [1, 0, 0], 1.45);
    place(m, ring, 0, -R * 1.8, R * 0.05 + 0.01, R * 0.6);
  }
  return finish(m);
}

// ------------------------------------------------------------------------------------------------------- woodpiles

/** A woodpile's make and its woods: bark, the split face, the pale end grain. */
export interface WoodpileForm {
  kind: 'rick' | 'polennitsa' | 'holzhausen' | 'leanto' | 'cord' | 'bundles' | 'dung';
  bark: Rgb; split: Rgb; end: Rgb; length: number; height: number; depth: number;
}

/** A prism of `section` ([z, y] counter-clockwise seen from +x, convex) extruded along x from x0 to x1, its ends capped. */
function prismX(m: Mesh, section: ReadonlyArray<readonly [number, number]>, x0: number, x1: number, side: Rgb, ends: Rgb): void {
  const uv: [number, number] = [0.5, 0.5], n = section.length;
  for (let i = 0; i < n; i++) {
    const [z0, y0] = section[i], [z1, y1] = section[(i + 1) % n];
    const out: V3 = [0, -(z1 - z0), y1 - y0];
    m.quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z1], [x0, y1, z1], out, () => uv, () => side, false);
  }
  for (const [x, sx] of [[x0, -1], [x1, 1]] as const) {
    const at = (i: number): V3 => [x, section[i][1], section[i][0]];
    for (let i = 1; i + 1 < n; i++) faceTri(m, at(0), at(i), at(i + 1), [sx, 0, 0], ends);
  }
}
/** A split billet lying level along `dir`, its middle over (c.x, c.z) and its lowest edge on c.y: a wedge (bark on its
 *  back, the split faces) with its two end-grain caps, rolled by `roll`; `r` its radius. 8 triangles. */
function billet(m: Mesh, c: V3, dir: V3, len: number, r: number, roll: number, f: WoodpileForm, rng: Rng): void {
  const from = m.mark;
  const sec: Array<[number, number]> = [[-r, 0], [r * 0.9, -r * 0.1], [r * 0.15, r * 0.95]];
  prismX(m, sec, -len / 2, len / 2, tone(rng() < 0.5 ? f.bark : f.split, rng, 0.2), tone(f.end, rng, 0.16));
  m.tilt(from, [0, 0, 0], [1, 0, 0], roll);
  let low = Infinity;
  for (let i = from + 1; i < m.p.length; i += 3) low = Math.min(low, m.p[i]);
  place(m, from, Math.atan2(-dir[2], dir[0]), c[0], c[1] - low, c[2]);
}
/** An end-grain cap on a pile's face: a split billet's end (a triangle), a hand's breadth across, 1 cm proud. */
function endCap(m: Mesh, c: V3, out: V3, r: number, spin: number, col: Rgb): void {
  const u: V3 = [-out[2], 0, out[0]], uv: [number, number] = [0.5, 0.5];
  const p = (a: number, k: number): V3 => [c[0] + out[0] * 0.01 + u[0] * Math.cos(a) * r * k, c[1] + Math.sin(a) * r * k, c[2] + out[2] * 0.01 + u[2] * Math.cos(a) * r * k];
  const a = p(spin, 1), b = p(spin + 2.1, 0.9), d = p(spin + 4.2, 1.05);
  const g = [a, b, d];
  // wound to face out
  const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], e2 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
  const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  if (n[0] * out[0] + n[2] * out[2] < 0) [g[1], g[2]] = [g[2], g[1]];
  m.tri(g[0], g[1], g[2], out, out, out, uv, uv, uv, col);
}

/** The colour between a pile's billets (their bark and their shadow). */
const between = (f: WoodpileForm): Rgb => mix(hexLin(0x2a2119), f.bark, 0.16);
/** A long pile's body: the gaps between its billet ends (the bark of the billets behind, in their shadow). */
const faceBody = (f: WoodpileForm): Rgb => mix(between(f), f.bark, 0.45);
/** The long piles whose faces are split ends (billetFace): the ricks and cordwood and the lean-to stacks, each between its
 *  stakes. The polennitsa keeps its round ends between its cribs, its birch bark as light as its end grain. */
const splitFace = (f: WoodpileForm): boolean => f.kind === 'rick' || f.kind === 'cord' || f.kind === 'leanto';
/** A long pile's billet-end cell by make (row height, width; m); its face spends 4 triangles a cell over its two faces:
 *  rick 140, lean-to 112. */
const faceCell = (f: WoodpileForm): readonly [number, number] => (f.kind === 'leanto' ? [0.2, 0.21] : [0.185, 0.21]);
/** A form's own stream for its faces (a hash of its make: no draw from the pile's stream). */
function faceStream(f: WoodpileForm): Rng {
  let a = Math.floor((f.bark[0] * 7919 + f.end[1] * 104729 + f.length * 1009 + f.height * 9173) * 1000) | 0;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
/**
 * A long pile's face of billet ends (the Polders village blind, 2026-10-17: "the foreground woodpile is a crude box with
 * a low-res triangle texture" — each end had been one small triangle on the near-black body, a polka of triangles): the
 * courses from the ground to under the crown, each course's billets of uneven width so the courses never line up, each
 * end an irregular split end (a quad, two triangles) nearly filling its cell with a finger's gap of the body showing
 * between — some quartered to a wedge, a few showing their bark edge — 6 to 16 mm proud of the body.
 */
function billetFace(m: Mesh, xEnd: number, H: number, z: number, sz: number, f: WoodpileForm, rng: Rng): void {
  const [rowH, colW] = faceCell(f), top = H * 0.92, x0 = -xEnd + 0.03, span = 2 * xEnd - 0.06;
  const rows = Math.max(3, Math.round(top / rowH)), cols = Math.max(3, Math.round(span / colW)), h = top / rows;
  const out: V3 = [0, 0, sz];
  for (let i = 0; i < rows; i++) {
    const widths = Array.from({ length: cols }, () => 0.72 + rng() * 0.56), sum = widths.reduce((a, b) => a + b, 0);
    let xa = x0;
    for (let j = 0; j < cols; j++) {
      const w = (widths[j] / sum) * span, cx = xa + w / 2, cy = i * h + h / 2;
      xa += w;
      const gap = 0.006 + rng() * 0.006, hx = w / 2 - gap, hy = h / 2 - gap;
      // a split end: its bark side broad, its heart side narrow (a quartered billet's wedge, k small) or broad (a halved
      // or a round billet's), the heart turned any way the billet was laid (a quarter turn and a little off it), drawn
      // in to fill its cell
      const k = rng() < 0.5 ? 0.14 + rng() * 0.3 : 0.6 + rng() * 0.35, turn = ((rng() * 4) | 0) * Math.PI / 2 + (rng() - 0.5) * 0.4;
      const local = [[-1, -1], [1, -1], [k, 1], [-k, 1]].map(([u, v]) => [u + (rng() - 0.5) * 0.24 * (v > 0 ? k : 1), v + (rng() - 0.5) * 0.2]);
      const ct = Math.cos(turn), st = Math.sin(turn), rot = local.map(([u, v]) => [u * ct - v * st, u * st + v * ct]);
      const ex = Math.max(...rot.map(([u]) => Math.abs(u))), ey = Math.max(...rot.map(([, v]) => Math.abs(v)));
      const zz = z + sz * (0.006 + rng() * 0.01);
      const q: V3[] = rot.map(([u, v]) => [cx + (u / ex) * hx, cy + (v / ey) * hy, zz]);
      const r = rng();
      const col = r < 0.62 ? tone(f.end, rng, 0.28) : r < 0.88 ? tone(mix(f.end, f.split, 0.55), rng, 0.2) : tone(mix(f.end, f.bark, 0.4), rng, 0.2);
      // (convex: the narrow side's corners keep their order) split on its shorter diagonal
      const d02 = Math.hypot(q[0][0] - q[2][0], q[0][1] - q[2][1]), d13 = Math.hypot(q[1][0] - q[3][0], q[1][1] - q[3][1]);
      const a = d02 <= d13 ? 0 : 1;
      const [A, B, C, D] = [q[a], q[(a + 1) % 4], q[(a + 2) % 4], q[(a + 3) % 4]];
      faceTri(m, A, B, C, out, col);
      faceTri(m, A, C, D, out, col);
    }
  }
}
/** A round pile's profile: a holzhausen's wall and its bark crown, a dung stack's dome of cakes. */
function roundProfile(f: WoodpileForm, R: number, H: number): Array<[number, number]> {
  return f.kind === 'dung'
    ? [[R, 0], [R * 0.96, H * 0.22], [R * 0.9, H * 0.44], [R * 0.78, H * 0.64], [R * 0.56, H * 0.82], [R * 0.3, H * 0.95], [0.04, H]]
    : [[R, 0], [R * 1.02, H * 0.4], [R, H * 0.72], [R * 0.78, H * 0.84], [R * 0.4, H * 0.96], [0.04, H]];
}

/**
 * The woodpile: a rick of split billets between its stakes (US cordwood), a polennitsa between crossed end cribs, a
 * lean-to stack under its boarded roof, the Norwegian round holzhausen with its bark crown, the brushwood and tamarisk
 * bundles of the Saharan villages, the dung-cake stacks of the Bengal chars. A long pile is two billet lengths deep:
 * its body one shape (its top uneven, the colour between the billets), each face the billets' end grain, a course of
 * billets across its top. Near ≤ 300 triangles (a polennitsa 284, a lean-to 288, a rick 244), far ≤ 30.
 */
export function woodpileNear(f: WoodpileForm, rng: Rng): THREE.BufferGeometry {
  const m = newMesh();
  const L = f.length, H = f.height, D = f.depth;
  if (f.kind === 'holzhausen' || f.kind === 'dung') {
    const R = D / 2, seg = 10, prof = roundProfile(f, R, H);
    lathe(m, prof, seg, (k, band) => (f.kind === 'dung' ? mul(f.split, (band % 2 ? 0.84 : 1.02) * (0.95 + (k % 3) * 0.04))
      : band < 2 ? mix(between(f), f.end, 0.22) : tone(f.bark, () => ((k * 7 + band) % 5) / 5, 0.3)), { faceted: true, capTop: true });
    if (f.kind === 'holzhausen') {
      // the wall's courses: each billet's end grain, the courses offset, between the ground and the crown
      for (let ring = 0; ring < 5; ring++) for (let k = 0; k < 2 * seg; k++) {
        const a = (k + (ring % 2) * 0.5) / (2 * seg) * Math.PI * 2, y = 0.08 + ring * H * 0.14;
        // on the faceted wall: its radius at this height, out to the facet the billet's end lies on
        const facet = Math.PI * 2 / seg, off = a - (Math.floor(a / facet) + 0.5) * facet;
        const rw = R * (y < H * 0.4 ? 1 + 0.02 * y / (H * 0.4) : 1.02 - 0.02 * (y - H * 0.4) / (H * 0.32)) * Math.cos(facet / 2) / Math.cos(off) + 0.002;
        endCap(m, [Math.cos(a) * rw, y, Math.sin(a) * rw], [Math.cos(a), 0, Math.sin(a)], 0.08, rng() * 6, tone(f.end, rng, 0.22));
      }
    } else {
      // the cakes drying on the ground round the stack
      for (let k = 0; k < 5; k++) {
        const a = rng() * Math.PI * 2, d = R + 0.18 + rng() * 0.3;
        lathe(m, [[0.11, 0], [0.12, 0.025], [0, 0.04]], 6, () => tone(f.split, rng, 0.2), { x: Math.cos(a) * d, z: Math.sin(a) * d });
      }
    }
    return finish(m);
  }
  if (f.kind === 'bundles') {
    // brushwood bundles: three lying side by side, one across their top, each tied twice
    const bundle = (c: V3, yaw: number, len: number, r: number) => {
      const from = m.mark;
      lathe(m, [[r * 0.55, -len / 2], [r, -len * 0.3], [r * 0.95, len * 0.3], [r * 0.45, len / 2]], 5, (k) => tone(f.bark, () => ((k * 3) % 5) / 5, 0.3),
        { faceted: true, capBottom: true, capTop: true, phase: rng() });
      for (const t of [-0.22, 0.22]) lathe(m, [[r * 1.03, t * len - 0.02], [r * 1.03, t * len + 0.02]], 5, () => f.end, {});
      m.tilt(from, [0, 0, 0], [0, 0, 1], Math.PI / 2);
      place(m, from, yaw, c[0], c[1], c[2]);
    };
    const r = 0.17;
    for (let k = 0; k < 3; k++) bundle([0, r, (k - 1) * r * 1.95], (rng() - 0.5) * 0.08, L * (0.85 + rng() * 0.15), r);
    bundle([0.05, r * 2.75, 0], Math.PI / 2 + (rng() - 0.5) * 0.3, D * 1.1, r * 0.9);
    return finish(m);
  }
  // the long piles
  const xEnd = L / 2 - (f.kind === 'polennitsa' ? 0.15 : 0.02);
  const sec: Array<[number, number]> = [[-D / 2, 0], [D / 2, 0], [D / 2, H * 0.95], [D * 0.18, H], [-D * 0.22, H * 0.97], [-D / 2, H * 0.93]];
  const split = splitFace(f);
  prismX(m, sec, -xEnd, xEnd, split ? faceBody(f) : between(f), mul(f.bark, 0.8));
  const rows = Math.max(3, Math.round(H / 0.16)), cols = Math.max(4, Math.round((2 * xEnd) / 0.21));
  if (split) {
    // the split ends from the form's own stream, inside its stakes; the round ends' draws (four an end) spent, so the
    // crown's billets and the stakes — and the collision the pool derives from the form — stand as they stood
    const faces = faceStream(f);
    for (const sz of [-1, 1]) billetFace(m, xEnd, H, sz * D / 2, sz, f, faces);
    for (let k = 0; k < 2 * rows * cols * 4; k++) rng();
  } else {
    for (const sz of [-1, 1]) for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
      const x = -xEnd + (j + 0.5 + ((i % 2) - 0.5) * 0.35) * (2 * xEnd) / cols, y = (i + 0.5) * H * 0.92 / rows;
      endCap(m, [Math.max(-xEnd + 0.07, Math.min(xEnd - 0.07, x)), y, sz * D / 2], [0, 0, sz], 0.085 + rng() * 0.02, rng() * 6, tone(f.end, rng, 0.25));
    }
  }
  for (let k = 0; k < (f.kind === 'leanto' ? 0 : 4); k++) {
    const x = -xEnd * 0.75 + k * xEnd * 0.5 + (rng() - 0.5) * 0.08;
    billet(m, [x, H * 0.96, (rng() - 0.5) * 0.1], [0, 0, 1], D * (0.55 + rng() * 0.15), 0.07, rng() * 2, f, rng);
  }
  if (f.kind === 'polennitsa') {
    // the crossed cribs at each end: billets laid in pairs, each pair across the last, to the pile's height
    const layers = 5, step = H / layers;
    for (const sx of [-1, 1]) for (let layer = 0; layer < layers; layer++) {
      const y = step * layer, along = layer % 2 === 0;
      for (const s2 of [-1, 1]) {
        const c: V3 = along ? [sx * (L / 2 - 0.08), y, s2 * (D / 2 - 0.1)] : [sx * (L / 2 - 0.08) + s2 * 0.07, y, 0];
        billet(m, c, along ? [1, 0, 0] : [0, 0, 1], along ? 0.3 : D * 1.02, step * 0.52, along ? 0 : Math.PI, f, rng);
      }
    }
  } else {
    // its stakes at each end, round poles driven in (a lean-to's carry its roof: the front pair the taller)
    const tall = f.kind === 'leanto' ? H + 0.4 : H + 0.1;
    const top = (sz: number) => (f.kind === 'leanto' && sz < 0 ? tall - 0.22 : tall);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      pole(m, [sx * L / 2, -0.1, sz * (D / 2 + 0.04)], [sx * L / 2, top(sz), sz * (D / 2 + 0.04)], 0.04, 5, tone(f.bark, rng, 0.2));
    }
    if (f.kind === 'leanto') {
      // the plates on the stakes and the waney roof boards on them, falling to the back
      for (const sz of [-1, 1]) pole(m, [-L / 2 - 0.1, top(sz) + 0.04, sz * (D / 2 + 0.04)], [L / 2 + 0.1, top(sz) + 0.04, sz * (D / 2 + 0.04)], 0.04, 5, tone(f.bark, rng, 0.2), true);
      const boards = 4, bw = (L + 0.3) / boards;
      const run = vunit([0, top(-1) - top(1), -(D + 0.08)]), up = vcross(run, [1, 0, 0]);
      const upn: V3 = up[1] < 0 ? [-up[0], -up[1], -up[2]] : up;
      for (let k = 0; k < boards; k++) {
        const x = -L / 2 - 0.15 + bw * (k + 0.5), col = tone(f.split, rng, 0.25);
        extrude(m, [x, top(1) + 0.08 + run[1] * -0.22, D / 2 + 0.04 - run[2] * 0.22], [x, top(-1) + 0.08 + run[1] * 0.22, -D / 2 - 0.04 + run[2] * 0.22],
          waneyBoard(bw - 0.02, 0.025, rng), [1, 0, 0], upn, col, mul(col, 1.1), 0);
      }
    }
  }
  return finish(m);
}

export function woodpileFar(f: WoodpileForm): THREE.BufferGeometry {
  const m = newMesh();
  const L = f.length, H = f.height, D = f.depth;
  if (f.kind === 'holzhausen' || f.kind === 'dung') {
    lathe(m, [[D / 2, 0], [D / 2, H * 0.6], [0.04, H]], 6, (_k, b) => (f.kind === 'dung' ? mul(f.split, 0.92) : b ? f.bark : mix(f.end, between(f), 0.62)),
      { faceted: true, capTop: true });
  } else {
    // (a split-faced pile's faces seen from afar: its billet ends over half of each face, the body in the gaps between)
    const c = f.kind === 'bundles' ? f.bark : splitFace(f) ? mix(f.end, faceBody(f), 0.5) : mix(f.end, between(f), 0.74);
    prismX(m, [[-D / 2, 0], [D / 2, 0], [D / 2, H * 0.95], [0, H], [-D / 2, H * 0.95]], -L / 2, L / 2, c, mul(f.bark, 0.8));
  }
  return finish(m);
}

/** The woodpile spilled: its body slumped to a low heap, the billets fallen off every side, its stakes or cribs down. */
export function woodpileBroken(f: WoodpileForm, rng: Rng): THREE.BufferGeometry {
  const m = newMesh();
  const L = f.length, H = f.height, D = f.depth;
  const heap = f.kind === 'dung' ? mul(f.split, 0.8) : mix(f.bark, between(f), 0.55);
  if (f.kind === 'bundles') {
    // the bundles knocked apart and strewn, one burst into its sticks
    for (let k = 0; k < 3; k++) {
      const from = m.mark, r = 0.16, len = L * (0.8 + rng() * 0.15);
      lathe(m, [[r * 0.55, -len / 2], [r, -len * 0.3], [r * 0.95, len * 0.3], [r * 0.45, len / 2]], 5, (s2) => tone(f.bark, () => ((s2 * 3) % 5) / 5, 0.3),
        { faceted: true, capBottom: true, capTop: true });
      m.tilt(from, [0, 0, 0], [0, 0, 1], Math.PI / 2);
      place(m, from, rng() * Math.PI, (k - 1) * 0.55 + (rng() - 0.5) * 0.3, r * 0.9, (rng() - 0.5) * 0.9);
    }
    for (let k = 0; k < 9; k++) {
      const a = rng() * Math.PI * 2, d = 0.3 + rng() * 0.6, yaw = rng() * Math.PI, len = 0.6 + rng() * 0.5;
      pole(m, [Math.cos(a) * d - Math.cos(yaw) * len / 2, 0.02, Math.sin(a) * d - Math.sin(yaw) * len / 2],
        [Math.cos(a) * d + Math.cos(yaw) * len / 2, 0.02 + rng() * 0.03, Math.sin(a) * d + Math.sin(yaw) * len / 2], 0.02, 3, tone(f.bark, rng, 0.3));
    }
    return finish(m);
  }
  if (f.kind === 'holzhausen' || f.kind === 'dung') {
    lathe(m, [[D * 0.62, 0], [D * 0.5, H * 0.22], [D * 0.25, H * 0.36], [0.04, H * 0.4]], 9, (k) => mul(heap, 0.9 + (k % 3) * 0.06), { faceted: true, capTop: true });
  } else {
    const k = f.kind === 'leanto' ? 1.45 : 1;
    prismX(m, [[-D * 0.75, 0], [D * 0.75, 0], [D * 0.4, H * 0.32 * k], [-D * 0.15, H * 0.38 * k], [-D * 0.5, H * 0.26 * k]], -L * 0.42, L * 0.42, heap, mul(heap, 0.85));
  }
  if (f.kind !== 'dung' && f.kind !== 'holzhausen') {
    // billets left lying over the slumped heap, every way
    for (let k = 0; k < 7; k++) {
      const x = (rng() - 0.5) * L * 0.7, z = (rng() - 0.5) * D * 0.7, yaw = rng() * Math.PI, xk2_black_panther = f.kind === 'leanto' ? 1.45 : 1;
      billet(m, [x, H * 0.3 * xk2_black_panther * (1 - Math.abs(z) / D), z], [Math.cos(yaw), 0, Math.sin(yaw)], 0.4 + rng() * 0.15, 0.07, rng() * 2, f, rng);
    }
  }
  const n = f.kind === 'dung' ? 0 : 10;
  for (let k = 0; k < n; k++) {
    const a = rng() * Math.PI * 2, d = 0.25 + rng() * 0.55, yaw = rng() * Math.PI;
    const r = Math.max(L, D) * 0.5;
    billet(m, [Math.cos(a) * (r * 0.6 + d * 0.5), 0, Math.sin(a) * (D * 0.45 + d * 0.5)], [Math.cos(yaw), 0, Math.sin(yaw)], 0.42 + rng() * 0.2, 0.075, rng() * 2, f, rng);
  }
  for (let k = 0; f.kind === 'dung' && k < 9; k++) {
    const a = rng() * Math.PI * 2, d = D * 0.5 + 0.1 + rng() * 0.5;
    lathe(m, [[0.11, 0], [0.12, 0.025], [0, 0.04]], 6, () => tone(f.split, rng, 0.2), { x: Math.cos(a) * d, z: Math.sin(a) * d });
  }
  if (f.kind === 'rick' || f.kind === 'cord' || f.kind === 'leanto') {
    // two stakes knocked flat
    for (const sx of [-1, 1]) bar(m, [sx * L * 0.5, 0.04, -D * 0.3], [sx * L * 0.62, 0.04 + 0.02 * sx, D * 0.5], 0.08, 0.08, [0, 1, 0], tone(f.bark, rng, 0.2));
  }
  return finish(m);
}

// ------------------------------------------------------------------------------------------------------- pallets

/** A pallet's make: the EUR/EPAL's blocks and bearers, the GMA's notched stringers, a rough plank skid, a bamboo one. */
export interface PalletForm { kind: 'eur' | 'gma' | 'rough' | 'bamboo'; wood: Rgb; dark: Rgb; brand?: Rgb }

/** A GMA stringer along x: `len` long, `t` thick, `h` tall, its two fork notches cut `nd` deep from its foot. 34 triangles. */
function notchedStringer(m: Mesh, z: number, len: number, t: number, h: number, nd: number, col: Rgb): void {
  const uv: [number, number] = [0.5, 0.5], L = len / 2;
  const notches: Array<[number, number]> = [[-L * 0.69, -L * 0.3], [L * 0.3, L * 0.69]];
  const feet: Array<[number, number]> = [[-L, notches[0][0]], [notches[0][1], notches[1][0]], [notches[1][1], L]];
  const q = (a: V3, b: V3, c: V3, d: V3, n: V3, k = 1) => m.quad(a, b, c, d, n, () => uv, () => mul(col, k), false);
  const rect = (x0: number, x1: number, y0: number, y1: number) => {
    for (const sz of [-1, 1]) q([x0, y0, z + sz * t / 2], [x1, y0, z + sz * t / 2], [x1, y1, z + sz * t / 2], [x0, y1, z + sz * t / 2], [0, 0, sz]);
  };
  rect(-L, L, nd, h);
  for (const [x0, x1] of feet) rect(x0, x1, 0, nd);
  q([-L, h, z - t / 2], [L, h, z - t / 2], [L, h, z + t / 2], [-L, h, z + t / 2], [0, 1, 0], 1.08);
  for (const sx of [-1, 1]) q([sx * L, 0, z - t / 2], [sx * L, h, z - t / 2], [sx * L, h, z + t / 2], [sx * L, 0, z + t / 2], [sx, 0, 0], 0.85);
  for (const [x0, x1] of notches) {
    q([x0, nd, z - t / 2], [x1, nd, z - t / 2], [x1, nd, z + t / 2], [x0, nd, z + t / 2], [0, -1, 0], 0.6);
    q([x0, 0, z - t / 2], [x0, nd, z - t / 2], [x0, nd, z + t / 2], [x0, 0, z + t / 2], [1, 0, 0], 0.75);
    q([x1, 0, z - t / 2], [x1, nd, z - t / 2], [x1, nd, z + t / 2], [x1, 0, z + t / 2], [-1, 0, 0], 0.75);
  }
}

/** The pallet: its top deck of eased boards on bearers or stringers, its blocks, its bottom boards. Near ≤ 230 triangles. */
export function palletNear(f: PalletForm, rng: Rng): THREE.BufferGeometry {
  const m = newMesh();
  const W = f.kind === 'gma' ? 1.22 : 1.2, D = f.kind === 'gma' ? 1.02 : 0.8, t = 0.022;
  const X: V3 = [1, 0, 0], Y: V3 = [0, 1, 0], Z: V3 = [0, 0, 1];
  if (f.kind === 'eur') {
    // three bottom boards, nine blocks, three stringer boards across, five top boards (wide at the edges and the middle)
    for (const z of [-D / 2 + 0.05, 0, D / 2 - 0.05]) bar(m, [-W / 2, 0.011, z], [W / 2, 0.011, z], 0.1, 0.022, Z, tone(f.wood, rng, 0.2));
    for (const x of [-W / 2 + 0.0725, 0, W / 2 - 0.0725]) for (const z of [-D / 2 + 0.0725, 0, D / 2 - 0.0725]) {
      bar(m, [x, 0.022, z], [x, 0.1, z], 0.145, 0.1, X, tone(f.dark, rng, 0.15), 0, true);
    }
    for (const x of [-W / 2 + 0.0725, 0, W / 2 - 0.0725]) bar(m, [x, 0.111, -D / 2], [x, 0.111, D / 2], 0.145, 0.022, X, tone(f.wood, rng, 0.2), 0, true);
    const widths = [0.145, 0.1, 0.145, 0.1, 0.145], gap = (D - 0.635) / 4;
    let z = -D / 2;
    for (const [k, w] of widths.entries()) {
      const col = f.brand && k === 0 ? mix(tone(f.wood, rng, 0.2), f.brand, 0.25) : tone(f.wood, rng, 0.22);
      extrude(m, [-W / 2, 0.122, z + w / 2], [W / 2, 0.122, z + w / 2], easedBoard(w, t, 0.006), Z, Y, col, mul(col, 1.1), 0);
      z += w + gap;
    }
  } else if (f.kind === 'gma') {
    // three notched stringers along its length, seven deck boards across them
    for (const z of [-D / 2 + 0.02, 0, D / 2 - 0.02]) notchedStringer(m, z, W, 0.04, 0.09, 0.035, tone(f.dark, rng, 0.15));
    for (let k = 0; k < 7; k++) {
      const x = -W / 2 + 0.06 + k * (W - 0.12) / 6, col = tone(f.wood, rng, 0.22);
      extrude(m, [x, 0.09, -D / 2], [x, 0.09, D / 2], easedBoard(0.12, t, 0.006), [-1, 0, 0], Y, col, mul(col, 1.1), 0);
    }
  } else if (f.kind === 'rough') {
    // a skid: three round runners, six waney planks nailed across
    for (const x of [-W / 2 + 0.08, 0, W / 2 - 0.08]) pole(m, [x, 0.055, -D / 2 - 0.04], [x, 0.055, D / 2 + 0.04], 0.055, 6, tone(f.dark, rng, 0.15), true);
    for (let k = 0; k < 6; k++) {
      const z = -D / 2 + 0.07 + k * (D - 0.14) / 5, w = 0.1 + ((k * 37) % 5) * 0.012, col = tone(f.wood, rng, 0.25);
      extrude(m, [-W / 2 - 0.02 + rng() * 0.04, 0.11, z], [W / 2 - 0.02 + rng() * 0.04, 0.11, z], waneyBoard(w, t, rng), Z, Y, col, mul(col, 1.1), 0);
    }
  } else {
    // bamboo: two culm runners along it, eight culms lashed across them
    for (const z of [-D / 2 + 0.1, D / 2 - 0.1]) pole(m, [-W / 2, 0.04, z], [W / 2, 0.04, z], 0.04, 5, tone(f.dark, rng, 0.12), true);
    for (let k = 0; k < 8; k++) {
      const x = -W / 2 + 0.07 + k * (W - 0.14) / 7;
      pole(m, [x, 0.116, -D / 2], [x, 0.116, D / 2], 0.036, 5, tone(f.wood, rng, 0.2), true);
    }
  }
  return finish(m);
}

export function palletFar(f: PalletForm): THREE.BufferGeometry {
  const m = newMesh();
  const W = f.kind === 'gma' ? 1.22 : 1.2, D = f.kind === 'gma' ? 1.02 : 0.8;
  prismX(m, [[-D / 2, 0.02], [D / 2, 0.02], [D / 2, 0.144], [-D / 2, 0.144]], -W / 2, W / 2, mul(f.wood, 0.75), mul(f.dark, 0.6));
  return finish(m);
}

/** The pallet broken: its deck boards snapped and sprung, half of it tipped up on its blocks, the rest lying. */
export function palletBroken(f: PalletForm, rng: Rng): THREE.BufferGeometry {
  const m = newMesh();
  const W = 1.2, D = 0.8;
  const half = m.mark;
  for (let k = 0; k < 3; k++) bar(m, [-W * 0.25, 0.13, -D / 2 + 0.1 + k * 0.3], [W * 0.25, 0.13, -D / 2 + 0.1 + k * 0.3], 0.12, 0.022, [0, 0, 1], tone(f.wood, rng, 0.2));
  for (const x of [-W * 0.2, W * 0.2]) bar(m, [x, 0.02, -D / 2], [x, 0.02, D / 2], 0.1, 0.1, [1, 0, 0], tone(f.dark, rng, 0.15), 0, true);
  tip(m, half, [W * 0.25, 0, 0], [0, 0, 1], 0.35);
  for (let k = 0; k < 5; k++) {
    const a = rng() * Math.PI * 2, d = 0.2 + rng() * 0.5, yaw = rng() * Math.PI, len = 0.4 + rng() * 0.5;
    const from = m.mark;
    bar(m, [-len / 2, 0.012, 0], [len / 2, 0.012, 0], 0.12, 0.022, [0, 0, 1], tone(f.wood, rng, 0.2));
    place(m, from, yaw, Math.cos(a) * d + W * 0.3, k * 0.004, Math.sin(a) * d);
  }
  return finish(m);
}
