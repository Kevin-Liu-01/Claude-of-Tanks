// src/world/maps/vehicleSetPieces.ts — the map-vehicles lane's vehicle set pieces (P5, 2026-10-06).
//
// Single vehicles a map authors at a spot (`props.vehicleSetPieces`: kind, x, z, heading), laid by the dressing kits
// (mapKits.ts dressVehicleSetPieces) in the painted bucket with a solid record: the Apollo 17 Lunar Roving Vehicle at
// Taurus-Littrow, a Tatra K2 tram of Sarajevo (whole, or burnt out as the siege left them), a Soviet crawler tractor of
// the Kursk kolkhozes, an Antonov An-26 broken on the apron at Hostomel. Built in the vehicle toolkit at their real
// dimensions; each kind declares its footprint, height and whether it stops shells.
//
// Local frame: +Z the vehicle's nose, +Y up from the ground (y = 0 under its wheels, tracks or belly), centred on its
// footprint. Deterministic and renderer-free.

import * as THREE from 'three';
import { VehicleMesh, linearHex, material, vehicleWeathering, type Vec3, type VehicleMaterial } from './vehicleMesh.ts';
import { cabLoft, roundLamp, type CabFace } from './vehicleCoachwork.ts';

type Mat = VehicleMaterial;

export type SetPieceKind = 'lrv' | 'k2tram' | 'stz3' | 'an26';

/** One authored vehicle: where it stands and how it heads (degrees, 0 = +Z), whole or wrecked. */
export interface VehicleSetPiece {
  readonly kind: SetPieceKind;
  readonly x: number;
  readonly z: number;
  readonly yawDeg: number;
  readonly wrecked?: boolean;
}

/** Each kind's plan half extents (the box its solids keep inside, the corners it is seated by), its height, and whether it
 * stops shells. The record itself is the hull of the built solids (mapKits.ts dressVehicleSetPieces). */
export const SET_PIECE_SIZE: Readonly<Record<SetPieceKind, { hw: number; hl: number; h: number; collider: boolean }>> = {
  lrv: { hw: 1.12, hl: 1.55, h: 1.2, collider: false },
  k2tram: { hw: 1.25, hl: 10.2, h: 3.15, collider: true },
  stz3: { hw: 0.93, hl: 1.85, h: 2.0, collider: true },
  an26: { hw: 2.65, hl: 13.2, h: 5.2, collider: true },
};

// ---------------------------------------------------------------------------------------------------- materials

const ALU = material('chrome', [0.5, 0.51, 0.52], 0.32, 0.9, 0, 0.3);
const ALU_DULL = material('steel', [0.36, 0.37, 0.38], 0.5, 0.7, 0, 0.4);
const WIRE_MESH = material('steel', [0.28, 0.285, 0.29], 0.55, 0.75, 0, 0.5);
const FENDER = material('paint', linearHex(0xd8d4c8), 0.55, 0, 0, 0.6);
const SEAT_WEB = material('canvas', linearHex(0xb8b8b2), 0.85, 0, 0, 0.5);
const GOLD = material('chrome', [0.55, 0.36, 0.08], 0.28, 0.9, 0, 0.2);
const WHITE_PAINT = material('paint', linearHex(0xe2e0da), 0.5, 0, 0, 0.6);
const DARK = material('trim', [0.03, 0.03, 0.032], 0.55, 0, 0, 0.6);
const GLASS = material('glass', [0.02, 0.024, 0.028], 0.06, 0, 0, 0.2);
const BLACK_STEEL = material('steel', [0.035, 0.033, 0.031], 0.6, 0.4, 0, 1);
const RUSTY = material('steel', [0.09, 0.06, 0.04], 0.75, 0.25, 0, 1);
// round 4 (wave 260: the LRV "a crude assembly of boxes and plates with a dark flat dish, plate seats and solid dark
// wheel discs, with no wire-mesh wheels, gold foil, hand controller or dust coating"; the painted bucket reads colours
// alone, so the materials tell it in shades): the zinc-coated piano wire bright, the weave's gaps dark; the titanium
// chevrons brighter still; the Kapton foil in two golds as it crinkles; the umbrella dish's silvered mesh pale
// (round 5, wave 278: "chunky checkerboard drums for wheels") the weave's check finer and close in shade: a mesh's grain,
// not a chessboard
const WIRE_BRIGHT = material('steel', [0.5, 0.505, 0.51], 0.5, 0.8, 0, 0.5);
const WIRE_GAP = material('trim', [0.38, 0.38, 0.385], 0.8, 0, 0, 0.6);
const TITANIUM_BRIGHT = material('chrome', [0.62, 0.62, 0.6], 0.3, 0.9, 0, 0.4);
const GOLD_DIM = material('chrome', [0.36, 0.22, 0.045], 0.35, 0.9, 0, 0.2);
const DISH_MESH = material('paint', linearHex(0xd8d8d2), 0.5, 0.2, 0, 0.5);
const SEAT_WEB_DARK = material('canvas', linearHex(0x8c8c86), 0.85, 0, 0, 0.5);

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const crossV = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dotV = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const unit = (a: Vec3): Vec3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

function face4(mesh: VehicleMesh, p: Vec3[], n: Vec3, m: Mat): void {
  if (dotV(crossV(sub(p[1], p[0]), sub(p[2], p[0])), n) < 0) p = [p[0], p[3], p[2], p[1]];
  const v = p.map((q) => mesh.vert(q[0], q[1], q[2], n[0], n[1], n[2], m));
  mesh.tri(v[0], v[1], v[2]);
  mesh.tri(v[0], v[2], v[3]);
}

function beam(mesh: VehicleMesh, a: Vec3, b: Vec3, w: number, d: number, m: Mat, open = false, up: Vec3 = [0, 1, 0]): void {
  const t = unit(sub(b, a));
  let u = up;
  if (Math.abs(dotV(t, u)) > 0.97) u = Math.abs(t[1]) > 0.9 ? [0, 0, 1] : [0, 1, 0];
  const s = unit(crossV(u, t)), v = crossV(t, s);
  const at = (p: Vec3, cs: number, cv: number): Vec3 => [
    p[0] + s[0] * cs * w / 2 + v[0] * cv * d / 2, p[1] + s[1] * cs * w / 2 + v[1] * cv * d / 2, p[2] + s[2] * cs * w / 2 + v[2] * cv * d / 2,
  ];
  const ring: [number, number][] = [[1, -1], [1, 1], [-1, 1], [-1, -1]];
  for (let k = 0; k < 4; k++) {
    const [s0, v0] = ring[k], [s1, v1] = ring[(k + 1) % 4];
    const n = unit([s[0] * (s0 + s1) + v[0] * (v0 + v1), s[1] * (s0 + s1) + v[1] * (v0 + v1), s[2] * (s0 + s1) + v[2] * (v0 + v1)]);
    face4(mesh, [at(a, s0, v0), at(a, s1, v1), at(b, s1, v1), at(b, s0, v0)], n, m);
  }
  if (!open) {
    face4(mesh, ring.map(([cs, cv]) => at(a, cs, cv)), [-t[0], -t[1], -t[2]], m);
    face4(mesh, ring.map(([cs, cv]) => at(b, cs, cv)), t, m);
  }
}

function tubeRod(mesh: VehicleMesh, a: Vec3, b: Vec3, r: number, m: Mat, segs = 6): void {
  mesh.tube([a, b], r, segs, m, { caps: true });
}

function hashSP(a: number, b: number): number {
  let h = Math.imul(a | 0, 0x9e3779b1) ^ Math.imul(b | 0, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 13), 0x297a2d39);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * A box wrapped in Kapton foil (round 4, wave 260: "no… gold foil"): its five open faces (the sixth lies on what it
 * stands on) each a 3 x 3 grid of facets, every vertex pushed in or out along the face a few millimetres, the facets
 * flat-shaded in two golds as the crinkled foil catches the sun.
 */
function foilBox(mesh: VehicleMesh, x: number, y: number, z: number, w: number, h: number, d: number, seed: number): void {
  const half: Vec3 = [w / 2, h / 2, d / 2], N = 3;
  const faces: [number, number][] = [[0, 1], [0, -1], [1, 1], [2, 1], [2, -1]];
  for (const [axis, sign] of faces) {
    const ua = (axis + 1) % 3, va = (axis + 2) % 3;
    const at = (i: number, j: number): Vec3 => {
      const p: Vec3 = [x, y, z];
      p[axis] += sign * half[axis];
      p[ua] += (-1 + (2 * i) / N) * half[ua];
      p[va] += (-1 + (2 * j) / N) * half[va];
      const edge = i === 0 || j === 0 || i === N || j === N;
      if (!edge) p[axis] += sign * (hashSP(i * 7 + j, seed + axis * 13 + sign) - 0.45) * 0.014;
      return p;
    };
    const n: Vec3 = [0, 0, 0];
    n[axis] = sign;
    for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const q = [at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)];
      const fn = unit(crossV(sub(q[1], q[0]), sub(q[3], q[0])));
      const out: Vec3 = dotV(fn, n) < 0 ? [-fn[0], -fn[1], -fn[2]] : fn;
      face4(mesh, q, out, hashSP(i * 5 + j, seed + axis * 31 + sign * 3) < 0.55 ? GOLD : GOLD_DIM);
    }
  }
}

/**
 * Nylon webbing slung on a seat's tube frame (round 4, wave 260: "plate seats"): `straps` straps across the panel
 * o + u du + v dv (u, v in 0..1), each sagging by `sag` at its middle, in two shades, both faces drawn.
 */
function webbing(mesh: VehicleMesh, o: Vec3, du: Vec3, dv: Vec3, sag: Vec3, straps: number): void {
  for (let k = 0; k < straps; k++) {
    const v0 = (k + 0.08) / straps, v1 = (k + 0.92) / straps, m = k % 2 ? SEAT_WEB : SEAT_WEB_DARK;
    const P = (u: number, v: number): Vec3 => {
      const s = Math.sin(Math.PI * u);
      return [o[0] + du[0] * u + dv[0] * v + sag[0] * s, o[1] + du[1] * u + dv[1] * v + sag[1] * s, o[2] + du[2] * u + dv[2] * v + sag[2] * s];
    };
    for (const [ua, ub] of [[0, 0.5], [0.5, 1]] as const) {
      const q = [P(ua, v0), P(ub, v0), P(ub, v1), P(ua, v1)];
      const n = unit(crossV(sub(q[1], q[0]), sub(q[3], q[0])));
      face4(mesh, q, n, m);
      face4(mesh, [q[0], q[3], q[2], q[1]], [-n[0], -n[1], -n[2]], m);
    }
  }
}

// ---------------------------------------------------------------------------------------------------- the LRV

/**
 * The Lunar Roving Vehicle (Apollo 15-17): an aluminium tube chassis in three hinged sections, four wire-mesh wheels
 * with titanium chevron treads on their double wishbones, the fibreglass fenders, two seats of nylon webbing on tube
 * frames, the control console and the T-handle controller between them, the battery covers forward, the umbrella
 * high-gain antenna, the helical low-gain antenna and the TV camera on the front, and the tool pallet astern.
 */
function lrv(mesh: VehicleMesh, coarse: boolean): void {
  const R = 0.41, wheelZ = 1.145, wheelX = 0.915, frameY = 0.62;
  // the wheels: the mesh tyre, its chevrons, the hub drive inside
  for (const sx of [1, -1]) for (const sz of [1, -1]) {
    mesh.push().translate(sx * wheelX, R, sz * wheelZ).scale(sx, 1, 1);
    // (round 4, wave 260: "solid dark wheel discs… no wire-mesh wheels") the woven tyre: bright wire and the dark of
    // its weave's gaps in a fine check round the tread, the shoulders and the side walls down to the hub (one grey on
    // mobile); the hub a small spun disc inside it
    const prof: readonly (readonly [number, number])[] = [[R * 0.42, -0.115], [R * 0.6, -0.115], [R * 0.78, -0.115], [R - 0.03, -0.115],
      [R, -0.08], [R, -0.027], [R, 0.027], [R, 0.08], [R - 0.03, 0.115], [R * 0.78, 0.115], [R * 0.6, 0.115], [R * 0.42, 0.115]];
    const tyreSegs = coarse ? 14 : 64;
    mesh.grid(prof.length - 1, tyreSegs, (i, j, out) => {
      const a = (j / tyreSegs) * Math.PI * 2;
      out[0] = prof[i][1]; out[1] = Math.cos(a) * prof[i][0]; out[2] = Math.sin(a) * prof[i][0];
    }, (i, j) => (coarse ? WIRE_MESH : (i + j) % 2 ? WIRE_BRIGHT : WIRE_GAP), { closeV: true, creaseI: [3, 4, 7, 8], flip: true });
    if (!coarse) {
      for (let k = 0; k < 18; k++) {
        mesh.push().rotateX((k / 18) * Math.PI * 2);
        mesh.dressing(() => {
          mesh.box(0.04, R + 0.005, 0, 0.11, 0.01, 0.04, TITANIUM_BRIGHT, 0);
          mesh.box(-0.04, R + 0.005, 0.02, 0.11, 0.01, 0.04, TITANIUM_BRIGHT, 0);
        });
        mesh.pop();
      }
    }
    // the spoke ring and the hub drive
    mesh.lathe([[0.0001, 0.07], [R * 0.43, 0.05], [R * 0.43, 0.0], [0.0001, -0.02]], coarse ? 10 : 14, () => ALU, { flip: true });
    mesh.lathe([[0.0001, -0.2], [0.09, -0.2], [0.11, -0.05], [0.0001, -0.05]], 10, () => ALU_DULL);
    mesh.pop();
    // the double wishbone up to the chassis
    for (const dy of [0.08, -0.06]) beam(mesh, [sx * (wheelX - 0.2), R + dy, sz * wheelZ], [sx * 0.55, frameY - 0.05 + dy * 0.5, sz * (wheelZ - 0.35)], 0.03, 0.03, ALU_DULL);
    // the fender over the wheel, its forward extension
    const arc: Vec3[] = [];
    for (let k = 0; k <= 8; k++) {
      const a = -1.05 + (k / 8) * 2.1;
      arc.push([sx * wheelX, R + Math.cos(a) * (R + 0.07), sz * wheelZ + Math.sin(a) * (R + 0.07)]);
    }
    mesh.sweep(arc, [[-0.13, 0], [0.13, 0], [0.13, 0.008], [-0.13, 0.008]], () => FENDER, { closedSection: true, creases: [0, 1, 2, 3] });
  }
  // the chassis: the outer frame, the cross members, the floor panels
  for (const sx of [1, -1]) tubeRod(mesh, [sx * 0.55, frameY, -1.5], [sx * 0.55, frameY, 1.5], 0.025, ALU);
  for (const z of [-1.5, -0.75, 0, 0.75, 1.5]) tubeRod(mesh, [-0.55, frameY, z], [0.55, frameY, z], 0.022, ALU);
  mesh.box(0, frameY - 0.03, 0, 1.08, 0.015, 2.9, ALU_DULL, 0);
  // the battery covers forward (dust covers with their radiator mirrors on top)
  for (const sx of [1, -1]) {
    mesh.box(sx * 0.27, frameY + 0.12, 1.15, 0.48, 0.22, 0.6, WHITE_PAINT, coarse ? 0 : 0.02);
    mesh.box(sx * 0.27, frameY + 0.235, 1.15, 0.42, 0.01, 0.5, ALU, 0);
  }
  // the seats: tube frames, webbing pans and backs, a little reclined (round 4, wave 260: "plate seats": the straps
  // slung between the frame's rails, sagging; the frames' rails round them)
  for (const sx of [1, -1]) {
    const x = sx * 0.33;
    webbing(mesh, [x - 0.23, frameY + 0.2, 0.33], [0.46, 0, 0], [0, 0, -0.46], [0, -0.035, 0], coarse ? 2 : 5);
    webbing(mesh, [x - 0.23, frameY + 0.21, -0.13], [0.46, 0, 0], [0, 0.42, -0.13], [0, 0.01, -0.03], coarse ? 2 : 5);
    for (const dx of [-0.23, 0.23]) {
      tubeRod(mesh, [x + dx, frameY, 0.32], [x + dx, frameY + 0.2, 0.32], 0.012, ALU);
      tubeRod(mesh, [x + dx, frameY + 0.2, 0.33], [x + dx, frameY + 0.2, -0.13], 0.012, ALU);
      tubeRod(mesh, [x + dx, frameY + 0.2, -0.13], [x + dx, frameY + 0.64, -0.26], 0.012, ALU);
    }
    tubeRod(mesh, [x - 0.23, frameY + 0.64, -0.26], [x + 0.23, frameY + 0.64, -0.26], 0.012, ALU);
  }
  // the console on its post between the seats' fronts, the T-handle controller
  tubeRod(mesh, [0, frameY, 0.6], [0, frameY + 0.42, 0.6], 0.02, ALU);
  mesh.box(0, frameY + 0.52, 0.58, 0.36, 0.26, 0.1, DARK, coarse ? 0 : 0.01);
  mesh.box(0, frameY + 0.52, 0.525, 0.3, 0.18, 0.01, GOLD, 0);
  // (round 4, wave 260: "no… hand controller") the T-handle hand controller on its pedestal between the seats: the
  // armrest pedestal, the boot at its root, the grip and its crossbar
  mesh.box(0, frameY + 0.15, 0.32, 0.1, 0.3, 0.16, ALU_DULL, coarse ? 0 : 0.01);
  mesh.box(0, frameY + 0.32, 0.32, 0.08, 0.05, 0.08, DARK, coarse ? 0 : 0.01);
  tubeRod(mesh, [0, frameY + 0.34, 0.32], [0, frameY + 0.52, 0.34], 0.022, DARK);
  tubeRod(mesh, [-0.08, frameY + 0.53, 0.345], [0.08, frameY + 0.53, 0.345], 0.018, DARK);
  // the communications relay unit forward of the console, under the camera's mast, in its gold foil blanket
  foilBox(mesh, 0, frameY + 0.17, 1.27, 0.4, 0.3, 0.3, 17);
  // the TV camera on its mast at the front, the high-gain dish and the low-gain helix either side
  tubeRod(mesh, [0, frameY, 1.45], [0, frameY + 0.72, 1.45], 0.02, ALU);
  mesh.box(0, frameY + 0.8, 1.45, 0.16, 0.14, 0.26, WHITE_PAINT, coarse ? 0 : 0.015);
  tubeRod(mesh, [-0.35, frameY, 1.38], [-0.35, frameY + 0.95, 1.38], 0.018, ALU);
  mesh.push().translate(-0.35, frameY + 1.0, 1.4).rotateX(-0.6);
  const dish: [number, number][] = [];
  // (round 4, wave 260: "a dark flat dish") the umbrella's silvered mesh pale and deeper, its eight ribs and the rim
  for (let k = 0; k <= 5; k++) { const r = 0.45 * (k / 5); dish.push([Math.max(0.0001, r), 0.21 * (r / 0.45) ** 2]); }
  mesh.push().rotateZ(Math.PI / 2);
  mesh.lathe(dish.map(([r, x]) => [r, x] as [number, number]), coarse ? 10 : 16, () => DISH_MESH);
  // (round 5, wave 278: "an opaque brown disc for its dish") the umbrella's back as pale as its face: it is the same
  // silvered mesh, and the shadowed underside read brown
  mesh.lathe(dish.map(([r, x]) => [r, x - 0.006] as [number, number]), coarse ? 10 : 16, () => DISH_MESH, { flip: true });
  if (!coarse) mesh.dressing(() => {
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2, rib: Vec3[] = [];
      for (const r of [0.04, 0.24, 0.45]) rib.push([0.21 * (r / 0.45) ** 2 + 0.006, Math.cos(a) * r, Math.sin(a) * r]);
      mesh.tube(rib, 0.006, 3, ALU_DULL, { caps: false });
    }
  });
  mesh.pop();
  mesh.pop();
  tubeRod(mesh, [0.35, frameY, 1.38], [0.35, frameY + 0.85, 1.38], 0.03, ALU_DULL, 8);
  // the tool pallet astern: the hand tool carrier's frame, the sample bags and the gnomon's case
  mesh.box(0, frameY + 0.12, -1.3, 0.9, 0.22, 0.4, ALU_DULL, coarse ? 0 : 0.01);
  for (const [x, z, w] of [[-0.25, -1.25, 0.22], [0.05, -1.3, 0.18], [0.3, -1.22, 0.2]] as const) {
    mesh.box(x, frameY + 0.36, z, w, 0.26, 0.2, x > 0.2 ? GOLD : WHITE_PAINT, coarse ? 0 : 0.02);
  }
  tubeRod(mesh, [-0.4, frameY, -1.5], [-0.42, frameY + 0.85, -1.52], 0.012, ALU);
}

// ---------------------------------------------------------------------------------------------------- the K2 tram

const TRAM_RED = material('paint', linearHex(0x9e2a22), 0.48, 0.05, 0, 1);
const TRAM_CREAM = material('paint', linearHex(0xe4d9be), 0.5, 0.05, 0, 1);
const TRAM_ROOF = material('paint', linearHex(0x67645e), 0.72, 0.1, 0, 1);
const RUBBER_DARK = material('rubber', [0.03, 0.029, 0.028], 0.9, 0, 0, 0.8);
const LAMP_LENS = material('lamp', [0.72, 0.72, 0.68], 0.07, 0.65, 0, 0.1);

/**
 * A Tatra K2 (the Sarajevo K2YU): two bodies on three bogies, the joint between them under a bellows, the ends round in
 * plan with a wrap-round windscreen, a band of passenger windows between narrow pillars, folding doors on the right,
 * the pantograph on the front body's roof, in the city's red and cream.
 */
function k2tram(mesh: VehicleMesh, coarse: boolean): void {
  const y0 = 0.82, sill = 1.55, head = 2.6, eave = 2.95, roofR = 0.16;
  const body = (zF: number, zB: number, nose: 'front' | 'back' | 'none') => {
    const r = 0.85, hw = 1.25, tumble = 0.07;
    const flat = zF - zB - 2 * r, windows = 7;
    const pillars: number[] = [];
    for (let k = 1; k < windows; k++) { const u = k / windows; pillars.push(u - 0.008, u + 0.008); }
    const plan = (y: number) => ({ zF, zB, hw: hw - tumble * Math.max(0, Math.min(1, (y - sill) / (eave - sill))), r });
    const matAt = (y: number, f: CabFace, u: number) => {
      if (y < sill) return TRAM_RED;
      if (y > head) return TRAM_CREAM;
      if (f === 'side') return pillars.some((p, i) => i % 2 === 0 && u > p && u < pillars[i + 1]) ? TRAM_CREAM : GLASS;
      if (f === 'front') return nose === 'front' ? (u < 0.9 ? GLASS : TRAM_CREAM) : TRAM_CREAM;
      if (f === 'back') return nose === 'back' ? (u < 0.7 ? GLASS : TRAM_CREAM) : TRAM_CREAM;
      return nose !== 'none' && ((f === 'corner') && ((nose === 'front' && u === 0) || (nose === 'back' && u === 1))) ? GLASS : TRAM_CREAM;
    };
    cabLoft(mesh, [y0, sill, head, eave - roofR], plan, matAt, {
      roofR, frontBreaks: [0.9], sideBreaks: pillars, backBreaks: [0.7], coarse, roofMat: TRAM_ROOF, floorMat: BLACK_STEEL,
    });
    void flat;
  };
  body(10.2, 0.38, 'front');
  body(-0.38, -10.2, 'back');
  // the joint: a bellows between the bodies, its turntable under them
  mesh.box(0, (y0 + eave) / 2 + 0.05, 0, 2.3, eave - y0 - 0.2, 0.8, RUBBER_DARK, coarse ? 0 : 0.05);
  // the bogies: frames, wheels on their axles, the motors between
  for (const bz of [7.0, 0, -7.0]) {
    mesh.box(0, 0.52, bz, 1.9, 0.32, 2.3, BLACK_STEEL, coarse ? 0 : 0.03);
    for (const az of [-0.95, 0.95]) for (const side of [1, -1]) {
      mesh.push().translate(side * 0.72, 0.35, bz + az).scale(side, 1, 1);
      mesh.lathe([[0.0001, -0.07], [0.3, -0.07], [0.35, -0.04], [0.35, 0.05], [0.37, 0.07], [0.0001, 0.07]], coarse ? 10 : 14, () => BLACK_STEEL);
      mesh.pop();
    }
    mesh.box(0, 0.62, bz, 1.1, 0.34, 0.5, BLACK_STEEL, 0);
  }
  // the ends: the destination box over the windscreen, the headlamps and the tail lamps, the fenders
  for (const end of [1, -1]) {
    const z = end * 10.2;
    mesh.box(0, 2.78, z - end * 0.12, 1.2, 0.24, 0.12, DARK, 0.02);
    if (!coarse) mesh.box(0, 2.78, z - end * 0.05, 1.0, 0.16, 0.01, TRAM_CREAM, 0);
    mesh.box(0, 0.86, z - end * 0.25, 2.2, 0.16, 0.5, BLACK_STEEL, 0.03);
    for (const sx of [1, -1]) roundLamp(mesh, sx * 0.72, 1.12, z - end * 0.02, 0.09, end > 0 ? LAMP_LENS : material('lampRed', [0.4, 0.02, 0.014], 0.14, 0, 0, 0.1), DARK, end > 0 ? 1 : -1, 0.04, coarse ? 8 : 12);
  }
  // the doors on the right: folding leaves in their frames (dark glass over a dark lower panel)
  for (const [zc, w] of [[8.9, 1.2], [1.8, 1.2], [-5.0, 1.2]] as const) {
    mesh.box(1.255, (y0 + head) / 2 + 0.05, zc, 0.03, head - y0 - 0.05, w, DARK, 0);
    if (!coarse) mesh.dressing(() => {
      mesh.box(1.275, (y0 + head) / 2 + 0.05, zc, 0.01, head - y0 - 0.15, 0.03, TRAM_CREAM, 0);
      for (const dz of [-w / 4, w / 4]) mesh.box(1.27, 2.0, zc + dz, 0.01, 0.9, w / 2 - 0.08, GLASS, 0);
    });
  }
  // the pantograph folded down on the front body, its base and the roof's resistor boxes
  mesh.box(0, eave + 0.12, 5.0, 1.0, 0.1, 1.2, BLACK_STEEL, 0.02);
  for (const sx of [1, -1]) {
    beam(mesh, [sx * 0.4, eave + 0.18, 4.6], [sx * 0.35, eave + 0.45, 5.6], 0.04, 0.04, BLACK_STEEL);
    beam(mesh, [sx * 0.35, eave + 0.45, 5.6], [sx * 0.35, eave + 0.3, 4.2], 0.035, 0.035, BLACK_STEEL);
  }
  beam(mesh, [-0.7, eave + 0.32, 4.2], [0.7, eave + 0.32, 4.2], 0.05, 0.05, ALU_DULL);
  mesh.box(0, eave + 0.18, -3.0, 1.3, 0.22, 2.6, TRAM_ROOF, coarse ? 0 : 0.03);
}

// ---------------------------------------------------------------------------------------------------- the STZ-3

const STZ_GREY = material('paint', linearHex(0x4c5044), 0.62, 0.15, 0, 1);

/**
 * The STZ-3 (STZ-NATI) crawler tractor of the kolkhozes, 1937-41: the engine under a narrow bonnet behind its radiator,
 * the starting crank, the exhaust stack, the driver's pan seat over the fuel tank with the steering levers before it,
 * the mudguards over the tracks, each track on four road wheels between the idler ahead and the sprocket astern.
 */
function stz3(mesh: VehicleMesh, coarse: boolean): void {
  const gauge = 0.715, tw = 0.39;
  for (const sx of [1, -1]) {
    const x = sx * gauge;
    // the track: a belt round the sprocket (astern, high), the idler ahead and the ground run
    const path: Vec3[] = [];
    const sprocket = { z: -1.18, y: 0.47, r: 0.33 }, idler = { z: 1.15, y: 0.37, r: 0.3 };
    const n = coarse ? 6 : 10;
    for (let k = 0; k <= n; k++) { const a = Math.PI / 2 + (k / n) * Math.PI; path.push([x, sprocket.y + Math.sin(a) * sprocket.r, sprocket.z + Math.cos(a) * sprocket.r]); }
    path.push([x, 0.04, -0.6], [x, 0.04, 0.6]);
    for (let k = 0; k <= n; k++) { const a = -Math.PI / 2 + (k / n) * Math.PI; path.push([x, idler.y + Math.sin(a) * idler.r, idler.z + Math.cos(a) * idler.r]); }
    mesh.sweep(path, [[-tw / 2, -0.035], [tw / 2, -0.035], [tw / 2, 0.035], [-tw / 2, 0.035]], () => BLACK_STEEL,
      { closedPath: true, closedSection: true, creases: [0, 1, 2, 3], up: [1, 0, 0] });
    if (!coarse) mesh.dressing(() => {
      for (let k = 0; k < 13; k++) mesh.box(x, 0.0, -0.95 + k * 0.17, tw, 0.03, 0.05, RUSTY, 0);
    });
    for (const w of [sprocket, idler]) {
      mesh.push().translate(x, w.y, w.z).scale(sx, 1, 1);
      mesh.lathe([[0.0001, -0.12], [w.r - 0.05, -0.12], [w.r - 0.05, 0.12], [0.0001, 0.12]], coarse ? 10 : 14, () => RUSTY);
      mesh.pop();
    }
    for (const z of [-0.6, -0.2, 0.2, 0.6]) {
      mesh.push().translate(x, 0.2, z).scale(sx, 1, 1);
      mesh.lathe([[0.0001, -0.1], [0.16, -0.1], [0.16, 0.1], [0.0001, 0.1]], coarse ? 8 : 10, () => RUSTY);
      mesh.pop();
    }
    // the track frame and the mudguard over the track
    mesh.box(x, 0.32, 0, 0.12, 0.16, 2.0, BLACK_STEEL, 0.01);
    mesh.box(x, 0.86, -0.05, tw + 0.1, 0.03, 2.45, STZ_GREY, 0.01);
  }
  // the hull: the engine and gearbox casing, the bonnet over the engine, the radiator ahead with its crank
  mesh.box(0, 0.62, 0.1, 1.0, 0.42, 2.3, BLACK_STEEL, 0.02);
  mesh.box(0, 1.08, 0.55, 0.78, 0.52, 1.3, STZ_GREY, coarse ? 0 : 0.05);
  mesh.box(0, 1.08, 1.27, 0.86, 0.92, 0.16, STZ_GREY, coarse ? 0 : 0.03);
  if (!coarse) mesh.dressing(() => {
    for (let k = 0; k < 8; k++) mesh.box(-0.3 + k * 0.086, 1.1, 1.355, 0.02, 0.62, 0.01, DARK, 0);
  });
  beam(mesh, [0, 0.72, 1.36], [0, 0.72, 1.55], 0.03, 0.03, BLACK_STEEL);
  beam(mesh, [0, 0.72, 1.55], [0.12, 0.6, 1.55], 0.03, 0.03, BLACK_STEEL);
  // the exhaust stack and the air intake
  tubeRod(mesh, [0.22, 1.32, 0.9], [0.22, 2.15, 0.9], 0.045, BLACK_STEEL, 8);
  tubeRod(mesh, [-0.22, 1.32, 0.95], [-0.22, 1.85, 0.95], 0.06, STZ_GREY, 8);
  // the fuel tank, the driver's pan seat on its spring, the steering levers, the drawbar
  mesh.box(0, 1.0, -0.75, 1.0, 0.36, 0.55, STZ_GREY, coarse ? 0 : 0.04);
  tubeRod(mesh, [0, 1.18, -0.85], [0, 1.36, -0.88], 0.03, BLACK_STEEL, 6);
  mesh.box(0, 1.38, -0.9, 0.42, 0.06, 0.38, BLACK_STEEL, 0.02);
  for (const sx of [1, -1]) tubeRod(mesh, [sx * 0.18, 0.9, -0.3], [sx * 0.2, 1.6, -0.5], 0.018, BLACK_STEEL, 6);
  beam(mesh, [0, 0.55, -1.2], [0, 0.55, -1.75], 0.12, 0.06, BLACK_STEEL);
}

// ---------------------------------------------------------------------------------------------------- the An-26

const AN26_GREY = material('paint', linearHex(0x8c949a), 0.55, 0.15, 0, 1);
const AN26_BELLY = material('paint', linearHex(0x6e767c), 0.6, 0.15, 0, 1);
const ROUNDEL_BLUE = material('paint', linearHex(0x2a5aa8), 0.5, 0, 0, 1);
const ROUNDEL_YELLOW = material('paint', linearHex(0xe0b820), 0.5, 0, 0, 1);

/** The fuselage's section at z: its centre height and radius (nose ahead at +11.9, the upswept tail astern). */
function an26Section(z: number): { yc: number; r: number } {
  const R = 1.45;
  if (z > 7.5) { const t = (z - 7.5) / 4.4; return { yc: R - 0.25 * t * t, r: Math.max(0.12, R * Math.sqrt(Math.max(0, 1 - t ** 2.2))) }; }
  if (z < -2.5) { const t = (-2.5 - z) / 9.4; return { yc: R + 1.15 * Math.pow(t, 1.3), r: Math.max(0.28, R * (1 - 0.8 * Math.pow(t, 1.15))) }; }
  return { yc: R, r: R };
}

/** A lofted wing panel from (x0, chord0) to (x1, chord1) at heights y0..y1 (a lens section, its thickness a share of the chord). */
function wingPanel(mesh: VehicleMesh, x0: number, x1: number, zLead0: number, chord0: number, zLead1: number, chord1: number,
  y0: number, y1: number, thick: number, m: Mat, coarse: boolean): void {
  const nu = coarse ? 2 : 4, nv = coarse ? 6 : 10;
  for (const top of [1, -1]) {
    mesh.grid(nu, nv, (i, j, out) => {
      const u = i / nu, v = j / nv;
      const x = x0 + (x1 - x0) * u, lead = zLead0 + (zLead1 - zLead0) * u, chord = chord0 + (chord1 - chord0) * u;
      const y = y0 + (y1 - y0) * u;
      const t = Math.sin(Math.PI * Math.pow(v, 0.8)) * thick * chord * (top > 0 ? 0.62 : 0.38);
      out[0] = x; out[1] = y + top * t; out[2] = lead - chord * v;
    }, () => m, { flip: (top < 0) !== (x1 < x0) });
  }
}

/**
 * The Antonov An-26 broken on the apron: the fuselage on its belly, broken behind the wing with the tail section slewed
 * and dropped, the high wing with its outer panel's anhedral (the left one snapped and down on the ground), the two
 * nacelles with their propellers bent, the fin and the tailplane, the glazed navigator's nose, in Ukrainian grey.
 */
function an26(mesh: VehicleMesh, coarse: boolean, wrecked: boolean): void {
  const ringN = coarse ? 12 : 22;
  const fuselage = (zFrom: number, zTo: number, stations: number) => {
    mesh.grid(stations, ringN, (i, j, out) => {
      const z = zFrom + (zTo - zFrom) * (i / stations), { yc, r } = an26Section(z);
      const a = (j / ringN) * Math.PI * 2;
      out[0] = Math.sin(a) * r; out[1] = yc - Math.cos(a) * r * (z > 7.5 ? 0.92 : 1); out[2] = z;
    }, (i, j) => {
      const a = (j / ringN) * Math.PI * 2, z = zFrom + (zTo - zFrom) * ((i + 0.5) / stations);
      if (z > 9.6 && Math.cos(a) < -0.3) return GLASS;                  // the cockpit's glazing
      if (z > 10.6 && Math.cos(a) > 0.55) return GLASS;                 // the navigator's nose
      return Math.cos(a) > 0.55 ? AN26_BELLY : AN26_GREY;
      // (round 3) i runs from zFrom to zTo and j round from the keel: i x j points out when zTo < zFrom (it was
      // flipped there, and the fuselage stood inside out under FrontSide)
    }, { closeV: true, flip: zTo > zFrom });
  };
  // forward fuselage: the nose to the break; the aft section slewed and dropped when wrecked
  fuselage(11.9, -3.6, coarse ? 14 : 26);
  mesh.push();
  if (wrecked) mesh.translate(0.3, -0.25, -0.9).rotateY(0.22).rotateX(-0.06);
  fuselage(-3.6, -11.9, coarse ? 8 : 14);
  // the fin and the tailplane on the tail section
  const finBase = an26Section(-9.5);
  wingPanel(mesh, 0, 0, -7.6, 3.9, -10.6, 1.6, finBase.yc + finBase.r * 0.6, finBase.yc + 3.6, 0.1, AN26_GREY, coarse);
  // the tailplane spans past the record: dressing (the fuselage collides, the flying surfaces do not)
  mesh.dressing(() => {
    for (const sx of [1, -1]) {
      wingPanel(mesh, sx * 0.3, sx * 5.0, -9.4, 2.6, -10.7, 1.2, finBase.yc + 0.3, finBase.yc + 0.3 + 4.7 * Math.tan(0.16), 0.1, AN26_GREY, coarse);
    }
  });
  mesh.pop();
  // the wing on the fuselage's back: the centre section flat, the outer panels with their anhedral
  const wingY = 2.95, rootLead = 2.0, rootChord = 3.6;
  // the wing, the nacelles and the propellers stand over a hull's height (or lie thin on the ground, broken): dressing
  mesh.dressing(() => wingPanel(mesh, -4.6, 4.6, rootLead, rootChord, rootLead, rootChord, wingY, wingY, 0.13, AN26_GREY, coarse));
  for (const sx of [1, -1]) mesh.dressing(() => {
    const broken = wrecked && sx < 0;
    mesh.push();
    if (broken) mesh.translate(sx * 8.5, wingY, 0).rotateZ(0.38).translate(-sx * 8.5, -wingY, 0);
    wingPanel(mesh, sx * 4.6, sx * 14.6, rootLead, rootChord, rootLead - 0.9, 1.45, wingY, wingY - 10 * Math.tan(0.035), 0.12, AN26_GREY, coarse);
    mesh.pop();
    // the nacelle under the wing, its spinner and four blades (bent in the wreck)
    const nx = sx * 4.4, ny = wingY - 0.55;
    mesh.push().translate(nx, ny, 0);
    const prof: [number, number][] = [[0.0001, 4.4], [0.32, 4.15], [0.62, 3.6], [0.72, 2.2], [0.66, -0.4], [0.45, -2.6], [0.0001, -3.0]];
    mesh.push().rotateY(-Math.PI / 2);
    // (the profile runs counter-clockwise: flipped, or the nacelle stood inside out under FrontSide)
    mesh.lathe(prof.map(([r, z]) => [r, z] as [number, number]), coarse ? 10 : 16, () => AN26_GREY, { flip: true });
    mesh.pop();
    for (let k = 0; k < 4; k++) {
      mesh.push().translate(0, 0, 4.25).rotateZ((k / 4) * Math.PI * 2 + 0.4);
      const bend = wrecked ? 0.5 + 0.25 * k : 0;
      beam(mesh, [0, 0.2, 0], [0, 1.0, -bend * 0.4], 0.24, 0.05, DARK, false, [0, 0, 1]);
      beam(mesh, [0, 1.0, -bend * 0.4], [0.05, 1.9, -bend * 1.3], 0.2, 0.04, DARK, false, [0, 0, 1]);
      mesh.pop();
    }
    mesh.pop();
    // the roundel under the outer wing (a flat disc: the lathe's axis turned upright)
    if (!coarse && !(wrecked && sx < 0)) {
      mesh.push().translate(sx * 11.5, wingY - 0.42, rootLead - 1.6).rotateZ(Math.PI / 2);
      mesh.lathe([[0.0001, -0.01], [0.55, -0.01], [0.55, 0.01], [0.0001, 0.01]], 12, () => ROUNDEL_YELLOW);
      mesh.lathe([[0.0001, -0.022], [0.32, -0.022], [0.32, 0.0], [0.0001, 0.0]], 12, () => ROUNDEL_BLUE);
      mesh.pop();
    }
  });
  // the cabin's windows along the sides (dressing)
  if (!coarse) mesh.dressing(() => {
    for (const sx of [1, -1]) for (let k = 0; k < 6; k++) {
      mesh.box(sx * 1.452, 1.75, 6.0 - k * 1.25, 0.01, 0.3, 0.3, GLASS, 0);
    }
  });
}

// ---------------------------------------------------------------------------------------------------- dispatch

/** Build one set piece, whole or wrecked, in the painted bucket's streams. */
export function buildSetPiece(kind: SetPieceKind, opts: { wrecked?: boolean; coarse?: boolean; seed?: number } = {}): THREE.BufferGeometry {
  const mesh = new VehicleMesh();
  const coarse = !!opts.coarse;
  mesh.coarse = coarse;
  let wheels: { z: number; y: number; r: number }[] = [];
  if (kind === 'lrv') { lrv(mesh, coarse); wheels = [{ z: 1.145, y: 0.41, r: 0.41 }, { z: -1.145, y: 0.41, r: 0.41 }]; }
  else if (kind === 'k2tram') { k2tram(mesh, coarse); wheels = [7.95, 6.05, 0.95, -0.95, -6.05, -7.95].map((z) => ({ z, y: 0.35, r: 0.35 })); }
  else if (kind === 'stz3') { stz3(mesh, coarse); wheels = [{ z: -1.18, y: 0.47, r: 0.33 }, { z: 0, y: 0.2, r: 0.5 }]; }
  else if (kind === 'an26') { an26(mesh, coarse, !!opts.wrecked); }
  else throw new Error(`buildSetPiece: ${kind} is not built yet`);
  const lunar = kind === 'lrv';
  const g = mesh.build(vehicleWeathering({
    // (round 4, wave 260: "no… dust coating") the regolith thrown up by the wheels lies grey over all of it below the
    // seats, thickest low
    dirtRgb: linearHex(lunar ? 0x5c5b58 : 0x3a3228), dirt: lunar ? 0.62 : 0.6, dirtTop: lunar ? 0.95 : 0.9,
    dustRgb: linearHex(lunar ? 0x8a8884 : 0x6a5e50), dust: lunar ? 0.72 : 0.15, rust: lunar ? 0 : 0.5,
    burnt: !!opts.wrecked, wheels, seed: opts.seed ?? 3, voxelAo: !coarse,
  }));
  g.deleteAttribute('surf');
  g.computeBoundingBox();
  const lift = -g.boundingBox!.min.y;
  if (Math.abs(lift) > 1e-6) g.translate(0, lift, 0);
  delete g.userData.bodyBox;
  // the dressing's vertex flags stay (the receipts measure the solids by them; the kit's merge ignores them)
  return g;
}

