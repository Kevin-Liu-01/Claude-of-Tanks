// src/world/maps/regional/dressing.ts — the lived-in dressing of the regional kits' houses (regional-buildings lane,
// 2026-10-03; gauntlet wave 0: "box buildings ... no yards, wires, wear"). Small attached parts a house carries in
// the real place: flower boxes under the windows, the bench by the door, a woodpile under the eaves, the roof ladder
// to the stack, a television aerial on the ridge, a potted plant on a stair. All dressing (no collision); a kit draws
// their choices from its build stream and leaves them out on phones.
import { faceBox, normalize3, shade, type EmitOptions, type Face, type PartSink, type Rgb, type Vec3 } from './geometry.ts';
import type { HouseFrame } from './house.ts';
import { hash01 } from './facade.ts';

const DECOR = { decor: true } as const;

const sub3 = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross3 = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot3 = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/**
 * A cushion of foliage (a box's planting, a cabbage, a clump's foot, a ridge of potatoes; wave 199 read the boxes they
 * replace as "cabbages as flat green cubes", "flat-green cube blobs"): a hexagonal mound, a ring at its foot under a wider
 * ring at 0.42 of its height turned half a step and a crown, darker toward its foot (18 triangles, no underside).
 * `c` the centre of its foot, `ax` and `az` the unit axes in the ground plane its half-widths `rx` and `rz` run along.
 */
export function mound(sink: PartSink, c: Vec3, ax: Vec3, az: Vec3, rx: number, rz: number, h: number, colour: Rgb,
  opts: EmitOptions = DECOR, twist = 0, sides = 6): void {
  // (`sides` 4: a small head, 12 triangles)
  const at = (k: number, r: number, y: number): Vec3 => {
    const t = twist + k * 2 * Math.PI / sides, cu = Math.cos(t) * rx * r, cz = Math.sin(t) * rz * r;
    return [c[0] + ax[0] * cu + az[0] * cz, c[1] + y, c[2] + ax[2] * cu + az[2] * cz];
  };
  const crown: Vec3 = [c[0], c[1] + h, c[2]], axis: Vec3 = [c[0], c[1] + h * 0.3, c[2]];
  const o: EmitOptions = { ...DECOR, ...opts, colourAt: (p: Vec3) => shade(colour, 0.6 + 0.4 * Math.min(1, Math.max(0, (p[1] - c[1]) / h))) };
  const tri = (a: Vec3, b: Vec3, d: Vec3) => {
    const n = cross3(sub3(b, a), sub3(d, a)), m = sub3([(a[0] + b[0] + d[0]) / 3, (a[1] + b[1] + d[1]) / 3, (a[2] + b[2] + d[2]) / 3], axis);
    sink.polygon('structureWood', dot3(n, m) >= 0 ? [a, b, d] : [a, d, b], o);
  };
  for (let k = 0; k < sides; k++) {
    const b0 = at(k, 0.82, 0), b1 = at(k + 1, 0.82, 0), m0 = at(k + 0.5, 1, h * 0.42), m1 = at(k + 1.5, 1, h * 0.42);
    tri(b0, b1, m0); tri(b1, m1, m0); tri(m0, m1, crown);
  }
}

/**
 * A long leafy ridge on the ground from `a` to `b` (a row of potatoes earthed up, a bean row up its canes): a rounded
 * section `w` wide and `h` high (a crown and two shoulders) drawn along the row, its ends sloping in, darker toward its
 * foot (16 triangles; the mound's crown is a point, so a long row of mounds would read as a row of pyramids).
 */
export function ridge(sink: PartSink, a: Vec3, b: Vec3, w: number, h: number, colour: Rgb, opts: EmitOptions = DECOR): void {
  const dx = b[0] - a[0], dz = b[2] - a[2], len = Math.hypot(dx, dz) || 1;
  const ax: Vec3 = [dx / len, 0, dz / len], side: Vec3 = [-dz / len, 0, dx / len];
  const at = (t: number, across: number, up: number): Vec3 => [a[0] + dx * t + side[0] * across, a[1] + up, a[2] + dz * t + side[2] * across];
  const end = Math.min(0.45, (w * 0.6) / len);
  // the section from one foot over the crown to the other, the crown held in from each end
  const sect = (t: number, crown: boolean): Vec3[] => [at(t, -w / 2, 0), at(t, -w * 0.36, h * 0.62), crown ? at(t, 0, h) : at(t, 0, h * 0.62),
    at(t, w * 0.36, h * 0.62), at(t, w / 2, 0)];
  const s0 = sect(end, true), s1 = sect(1 - end, true), e0 = at(0, 0, h * 0.25), e1 = at(1, 0, h * 0.25);
  const o: EmitOptions = { ...DECOR, ...opts, colourAt: (p: Vec3) => shade(colour, 0.62 + 0.38 * Math.min(1, Math.max(0, (p[1] - a[1]) / h))) };
  const out = (pts: Vec3[], toward: Vec3) => {
    const n = cross3(sub3(pts[1], pts[0]), sub3(pts[2], pts[0]));
    sink.polygon('structureWood', dot3(n, toward) >= 0 ? pts : [...pts].reverse(), o);
  };
  // the four faces along the row (each a quad between the sections)
  for (let k = 0; k < 4; k++) {
    const mid: Vec3 = [(s0[k][0] + s0[k + 1][0]) / 2 - (a[0] + dx * 0.5), (s0[k][1] + s0[k + 1][1]) / 2 + 0.01, (s0[k][2] + s0[k + 1][2]) / 2 - (a[2] + dz * 0.5)];
    const toward: Vec3 = [side[0] * Math.sign(dot3(mid, side) || 1) * 0.3, 1, side[2] * Math.sign(dot3(mid, side) || 1) * 0.3];
    out([s0[k], s0[k + 1], s1[k + 1], s1[k]], toward);
  }
  // the ends: each section fanned down to a point at the row's end, low on the ground
  for (const [s, e, dir] of [[s0, e0, -1], [s1, e1, 1]] as const) {
    for (let k = 0; k < 4; k++) out([s[k], s[k + 1], e], [ax[0] * dir, 0.5, ax[2] * dir]);
  }
}

/** A flower head: a five-petalled disc of radius `r` facing `n` (three triangles, seen from its front). */
export function bloomDisc(sink: PartSink, c: Vec3, n: Vec3, r: number, colour: Rgb, opts: EmitOptions = DECOR, twist = 0): void {
  const up: Vec3 = Math.abs(n[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  const a = normalize3(cross3(up, n)), b = cross3(n, a);
  const pts: Vec3[] = [];
  for (let k = 0; k < 5; k++) {
    // petals: the rim's points alternate a little in and out
    const t = twist + k * 2 * Math.PI / 5, rr = r * (k % 2 ? 0.86 : 1);
    pts.push([c[0] + (a[0] * Math.cos(t) + b[0] * Math.sin(t)) * rr, c[1] + (a[1] * Math.cos(t) + b[1] * Math.sin(t)) * rr,
      c[2] + (a[2] * Math.cos(t) + b[2] * Math.sin(t)) * rr]);
  }
  sink.polygon('structureWood', pts, { ...DECOR, ...opts, colour });
}

/**
 * A planted window box on its brackets under a window (u, y: the window's bottom-centre on the face): the box, a cushion
 * of leaves heaped over its rim, stems trailing over its front and the geraniums' heads standing out of the leaves in
 * clusters of three (wave 199: "crude flat-green cube blobs with a couple of pink dots"). Its draws from `rng` are the
 * old box's (the clusters' places hash from the box's own), so a kit's later choices never move.
 */
export function flowerBox(sink: PartSink, face: Face, u: number, y: number, w: number, box: Rgb, bloom: Rgb, rng: () => number,
  fine = false): void {
  // (`fine`: the facade craft's boxes are fine dressing, drawn near the camera only, in no shadow map: EmitOptions.fine
  // 'near')
  const d = fine ? { ...DECOR, fine: 'near' as const } : DECOR;
  const bw = w + 0.12, by = y - 0.24;
  faceBox(sink, 'structureWood', face, u, by, 0.13, bw, 0.18, 0.2, { ...d, colour: box });
  for (const side of [-1, 1]) faceBox(sink, 'structureMetal', face, u + side * (bw / 2 - 0.08), by - 0.12, 0.08, 0.03, 0.12, 0.14, { ...d, colour: [0.12, 0.12, 0.12] });
  const leaf: Rgb = [0.13 + rng() * 0.04, 0.24 + rng() * 0.06, 0.08];
  const out = (uu: number, yy: number, o: number): Vec3 => [face.origin[0] + face.u[0] * uu + face.out[0] * o, yy, face.origin[2] + face.u[2] * uu + face.out[2] * o];
  mound(sink, out(u, by + 0.07, 0.14), face.u, face.out, bw / 2 - 0.01, 0.13, 0.17, leaf, d, hash01(u, y, 3));
  // stems trailing over the box's front: a leafy strand hanging past its lip (one quad each, seen from the street)
  const trail = Math.max(2, Math.round(bw / 0.3));
  for (let k = 0; k < trail; k++) {
    const h = hash01(u, y, k, 7), uu = u - bw / 2 + 0.08 + (bw - 0.16) * (k + 0.5) / trail + (h - 0.5) * 0.08, len = 0.12 + h * 0.16;
    const top = by + 0.08, foot = top - len, hw = 0.03;
    // ((u, y) counter-clockwise seen from outside, as every face part is laid)
    sink.polygon('structureWood', [out(uu - hw * 0.6, foot, 0.245), out(uu + hw * 0.6, foot, 0.245), out(uu + hw, top, 0.236), out(uu - hw, top, 0.236)],
      { ...d, colour: shade(leaf, 0.85 + h * 0.3) });
  }
  // the heads, a cluster of three at each of the old box's flower places, tilted up out of the leaves
  const n = Math.max(3, Math.round(bw / 0.22));
  const facing = normalize3([face.out[0], 0.75, face.out[2]]);
  for (let k = 0; k < n; k++) {
    const t = (k + 0.5) / n, uu = u - bw / 2 + 0.04 + (bw - 0.08) * t;
    const s = 0.07 + rng() * 0.05, lift = rng() * 0.06, o = 0.2 + rng() * 0.06;
    for (let j = 0; j < 3; j++) {
      const h = hash01(uu, lift, j, 11), du = (j - 1) * s * 0.55 + (h - 0.5) * 0.03, dy = (j === 1 ? 0.03 : 0) + h * 0.02;
      const tone = 0.82 + hash01(uu, j, 13) * 0.3;
      bloomDisc(sink, out(uu + du, by + 0.2 + lift + dy, o - 0.02 * j), facing, s * 0.45,
        [Math.min(1, bloom[0] * tone), Math.min(1, bloom[1] * tone), Math.min(1, bloom[2] * tone)], d, h * 6);
    }
  }
}

/** A plank bench against the wall beside a door, its back to the house. */
export function bench(sink: PartSink, face: Face, u: number, length: number, wood: Rgb): void {
  faceBox(sink, 'structureWood', face, u, 0.45, 0.25, length, 0.06, 0.36, { ...DECOR, colour: wood });
  faceBox(sink, 'structureWood', face, u, 0.78, 0.06, length, 0.22, 0.04, { ...DECOR, colour: wood });
  for (const side of [-1, 1]) faceBox(sink, 'structureWood', face, u + side * (length / 2 - 0.12), 0.21, 0.25, 0.06, 0.42, 0.3, { ...DECOR, colour: wood });
}

/**
 * A woodpile stacked against the wall under the eaves: courses of split logs, end grain out, read as rows of short
 * stacks (each a bark-dark body and a pale end-grain face), a board roof over it.
 */
export function woodpile(sink: PartSink, face: Face, u0: number, u1: number, height: number, rng: () => number): void {
  const depth = 0.42, row = 0.17;
  const rows = Math.max(3, Math.round(height / row));
  for (let r = 0; r < rows; r++) {
    const y = r * row + row / 2;
    // each course in two to four stacks of slightly different length and tone
    let u = u0 + (r % 2 ? 0.05 : 0);
    while (u < u1 - 0.2) {
      const len = Math.min(u1 - u, 0.5 + rng() * 0.5), tone = 0.46 + rng() * 0.14, o = depth / 2 + (rng() - 0.5) * 0.04;
      faceBox(sink, 'structureWood', face, u + len / 2, y, o, len - 0.02, row - 0.012, depth, { ...DECOR, colour: [tone * 0.62, tone * 0.5, tone * 0.38] });
      faceBox(sink, 'structureWood', face, u + len / 2, y, o + depth / 2 + 0.003, len - 0.05, row - 0.03, 0.006, { ...DECOR, colour: [tone * 1.18, tone * 0.98, tone * 0.7] });
      u += len;
    }
  }
  // a little roof of boards over the pile
  faceBox(sink, 'structureWood', face, (u0 + u1) / 2, rows * row + 0.08, depth / 2 + 0.05, u1 - u0 + 0.2, 0.04, depth + 0.16, { ...DECOR, colour: [0.32, 0.27, 0.22] });
}

/**
 * The roof ladder (Dachleiter) from the eaves up to the stack on the +x or -x slope at z: two rails and rungs riding
 * on hooks a hand's breadth above the covering.
 */
export function roofLadder(sink: PartSink, frame: HouseFrame, side: 1 | -1, z: number, rise: number, colour: Rgb): void {
  const rg = frame.roof;
  if (rg.kind === 'flat' || rg.kind === 'shed') return;
  const lift = 0.09;
  const point = (x: number, dz: number): Vec3 => {
    const top = rg.topAt(side * x, z + dz) ?? rg.eaveY;
    return [side * x, top + lift, z + dz];
  };
  const x0 = rg.s * 0.92, x1 = Math.max(0.3, rg.s * (1 - rise));
  const n = normalize3([side * rg.tanP, 1, 0]);
  for (const dz of [-0.2, 0.2]) sink.member('structureWood', point(x0, dz), point(x1, dz), 0.05, 0.05, n, { ...DECOR, colour, exposed: true }, 0);
  const steps = Math.max(3, Math.round((x0 - x1) / 0.3 * Math.hypot(1, rg.tanP)));
  for (let k = 0; k <= steps; k++) {
    const x = x0 + (x1 - x0) * k / steps;
    sink.member('structureWood', point(x, -0.2), point(x, 0.2), 0.035, 0.035, n, { ...DECOR, colour, exposed: true }, 0);
  }
}

/** A television aerial on a mast at the ridge: a Yagi of elements on a boom, guyed to the roof (1970s–90s Europe). */
export function tvAerial(sink: PartSink, frame: HouseFrame, z: number, rng: () => number): void {
  const rg = frame.roof;
  const base = rg.topAt(0, z) ?? rg.ridgeTopY;
  const mast = 2.2 + rng() * 1.2;
  const metal: Rgb = [0.5, 0.52, 0.54];
  sink.cylinder('structureMetal', [0, base - 0.1, z], 'y', mast + 0.1, 0.025, 5, { ...DECOR, colour: metal });
  const yaw = (rng() - 0.5) * 1.2;
  const dirX = Math.cos(yaw), dirZ = Math.sin(yaw);
  for (const [h, len, count] of [[mast - 0.05, 1.6, 7], [mast - 0.65, 1.1, 5]] as const) {
    const y = base + h;
    const a: Vec3 = [-dirX * len / 2, y, z - dirZ * len / 2], b: Vec3 = [dirX * len / 2, y, z + dirZ * len / 2];
    sink.member('structureMetal', a, b, 0.025, 0.025, [0, 1, 0], { ...DECOR, colour: metal, exposed: true }, 0);
    for (let k = 0; k < count; k++) {
      const t = (k + 0.5) / count, el = 0.5 - k * 0.04;
      const cx = a[0] + (b[0] - a[0]) * t, cz = a[2] + (b[2] - a[2]) * t;
      sink.member('structureMetal', [cx + dirZ * el / 2, y, cz - dirX * el / 2], [cx - dirZ * el / 2, y, cz + dirX * el / 2], 0.015, 0.015, [0, 1, 0],
        { ...DECOR, colour: metal, exposed: true }, 0);
    }
  }
}

/**
 * A wall lantern on an iron bracket beside a door: its glass is a curtain pane, so it glows with the lit windows at
 * night. (u, y) is the lantern's centre on the face.
 */
export function wallLantern(sink: PartSink, face: Face, u: number, y: number): void {
  const iron: Rgb = [0.12, 0.12, 0.12];
  faceBox(sink, 'structureMetal', face, u, y + 0.3, 0.2, 0.04, 0.04, 0.4, { ...DECOR, colour: iron });
  faceBox(sink, 'structureMetal', face, u, y + 0.2, 0.36, 0.2, 0.04, 0.2, { ...DECOR, colour: iron });
  faceBox(sink, 'curtain', face, u, y, 0.36, 0.16, 0.26, 0.16, { ...DECOR, window: face.out });
  faceBox(sink, 'structureMetal', face, u, y - 0.15, 0.36, 0.2, 0.04, 0.2, { ...DECOR, colour: iron });
}

/** A terracotta pot with a plant (a stair tread, a doorstep, a wall top). (x, y, z) is the pot's base. */
export function pottedPlant(sink: PartSink, x: number, y: number, z: number, size: number, rng: () => number): void {
  const clay: Rgb = [0.56 + rng() * 0.08, 0.26 + rng() * 0.04, 0.15];
  sink.cylinder('structureWood', [x, y, z], 'y', size * 0.8, size * 0.36, 7, { ...DECOR, colour: clay }, size * 0.48);
  const leaf: Rgb = [0.12 + rng() * 0.05, 0.26 + rng() * 0.08, 0.07];
  sink.cylinder('structureWood', [x, y + size * 0.8, z], 'y', size * 0.5, size * 0.5, 7, { ...DECOR, colour: leaf }, size * 0.18);
}

/**
 * A washing line strung across a face between two wall brackets, the washing pegged along it (the Mediterranean
 * street front). (u0, u1, y) on the face; the line sags a hand's breadth in the middle.
 */
export function washingLine(sink: PartSink, face: Face, u0: number, u1: number, y: number, rng: () => number): void {
  const out = 0.55, sag = 0.12;
  const iron: Rgb = [0.18, 0.18, 0.18];
  for (const u of [u0, u1]) faceBox(sink, 'structureMetal', face, u, y, out / 2, 0.03, 0.03, out, { ...DECOR, colour: iron });
  const pegs = Math.max(3, Math.floor((u1 - u0) / 0.42));
  const at = (t: number) => y - sag * 4 * t * (1 - t);
  for (let k = 0; k < 8; k++) {
    const a = k / 8, b = (k + 1) / 8;
    const p = facePointOut(face, u0 + (u1 - u0) * a, at(a), out), q = facePointOut(face, u0 + (u1 - u0) * b, at(b), out);
    sink.member('structureMetal', p, q, 0.012, 0.012, face.out, { ...DECOR, colour: [0.75, 0.75, 0.72], exposed: true }, 0);
  }
  const cloth: readonly Rgb[] = [[0.82, 0.82, 0.8], [0.62, 0.16, 0.14], [0.2, 0.32, 0.58], [0.85, 0.72, 0.32], [0.45, 0.6, 0.42], [0.9, 0.88, 0.84]];
  for (let k = 0; k < pegs; k++) {
    if (rng() < 0.25) continue;
    const t = (k + 0.5) / pegs, w = 0.24 + rng() * 0.3, h = 0.3 + rng() * 0.45;
    const c = cloth[Math.floor(rng() * cloth.length)];
    faceBox(sink, 'structureWood', face, u0 + (u1 - u0) * t, at(t) - h / 2 - 0.01, out, w, h, 0.012, { ...DECOR, colour: c });
  }
}

/**
 * A flowering shrub against a wall (a Breton hydrangea): a leafy mound and its round flower heads (its draws from `rng`
 * are the boxes' it replaces).
 */
export function floweringShrub(sink: PartSink, face: Face, u: number, size: number, bloom: Rgb, rng: () => number): void {
  const leaf: Rgb = [0.1 + rng() * 0.04, 0.22 + rng() * 0.06, 0.08];
  const out = (uu: number, yy: number, o: number): Vec3 => [face.origin[0] + face.u[0] * uu + face.out[0] * o, yy, face.origin[2] + face.u[2] * uu + face.out[2] * o];
  mound(sink, out(u, 0, size * 0.4), face.u, face.out, size * 0.68, size * 0.44, size * 0.95, leaf, DECOR, hash01(u, size, 5));
  for (let k = 0; k < 7; k++) {
    const s = size * (0.22 + rng() * 0.12);
    const uu = u + (rng() - 0.5) * size, yy = size * (0.55 + rng() * 0.32), oo = size * (0.3 + rng() * 0.5);
    const c: Rgb = [bloom[0] * (0.85 + rng() * 0.3), bloom[1] * (0.85 + rng() * 0.3), bloom[2] * (0.85 + rng() * 0.3)];
    // a mophead: a small dome of florets (its foot sunk into the leaves)
    mound(sink, out(uu, yy - s * 0.3, oo), face.u, face.out, s * 0.55, s * 0.55, s * 0.75, c, DECOR, k, 4);
  }
}

/** A point `o` metres out of a face (u along it, y up). */
function facePointOut(face: Face, u: number, y: number, o: number): Vec3 {
  return [face.origin[0] + face.u[0] * u + face.out[0] * o, y, face.origin[2] + face.u[2] * u + face.out[2] * o];
}

/**
 * Hollyhocks (mal'vy) against a house wall (the south Russian and Ukrainian village front): a clump of tall stalks
 * leaning a little apart, leafy at the foot, the flowers set up the top half of each. (facades lane, 2026-10-05)
 */
export function hollyhocks(sink: PartSink, face: Face, u: number, bloom: Rgb, rng: () => number): void {
  const stalks = 3 + Math.floor(rng() * 3);
  const leaf: Rgb = [0.1 + rng() * 0.04, 0.2 + rng() * 0.06, 0.07];
  // the leafy foot of the clump (wave 199: "hollyhocks as sticks in a green box"): broad leaves heaped round the stalks
  const foot0: Vec3 = [face.origin[0] + face.u[0] * u + face.out[0] * 0.34, 0, face.origin[2] + face.u[2] * u + face.out[2] * 0.34];
  mound(sink, foot0, face.u, face.out, 0.5, 0.3, 0.62, leaf, DECOR, hash01(u, 17));
  for (let k = 0; k < stalks; k++) {
    const du = (k - (stalks - 1) / 2) * 0.2 + (rng() - 0.5) * 0.08, o = 0.22 + rng() * 0.22;
    const height = 1.5 + rng() * 0.7, lean = (rng() - 0.5) * 0.25;
    const foot: Vec3 = [face.origin[0] + face.u[0] * (u + du) + face.out[0] * o, 0.3, face.origin[2] + face.u[2] * (u + du) + face.out[2] * o];
    const tip: Vec3 = [foot[0] + face.u[0] * lean, height, foot[2] + face.u[2] * lean];
    sink.member('structureWood', foot, tip, 0.03, 0.03, face.out, { ...DECOR, colour: [leaf[0] * 0.9, leaf[1] * 1.1, leaf[2]], exposed: true }, 0.015);
    const tone = 0.82 + rng() * 0.3;
    const c: Rgb = [Math.min(1, bloom[0] * tone), Math.min(1, bloom[1] * tone), Math.min(1, bloom[2] * tone)];
    const flowers = 4 + Math.floor(rng() * 3);
    const facing = normalize3([face.out[0], 0.2, face.out[2]]);
    for (let f = 0; f < flowers; f++) {
      const t = 0.5 + 0.48 * f / flowers, s = 0.1 - f * 0.008;
      const x = foot[0] + (tip[0] - foot[0]) * t, y = foot[1] + (tip[1] - foot[1]) * t, z = foot[2] + (tip[2] - foot[2]) * t;
      // the open flowers up the spike, alternately to either side of it, facing out of the wall (EmitOptions.fine 'near';
      // past that distance the stalks and the leafy foot remain)
      const side = f % 2 ? 1 : -1, du = side * s * 0.35;
      bloomDisc(sink, [x + face.u[0] * du + face.out[0] * 0.03, y, z + face.u[2] * du + face.out[2] * 0.03], facing, s * 0.62, c,
        { ...DECOR, fine: 'near' }, f * 1.3);
    }
  }
}
