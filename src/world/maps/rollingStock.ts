// src/world/maps/rollingStock.ts — the map-vehicles lane's rolling stock (P5, 2026-10-06).
//
// Wagons and a shunter standing on a map's sidings, built in the vehicle toolkit (vehicleMesh.ts) at their real
// dimensions: the Deutsche Bundesbahn's goods stock of the 1960s Ruhr (Cinder Junction) — the Omm open coal wagon
// with its stakes and its load, the G 10 covered van in planks on a braced frame under its arched roof, a two-axle
// tank wagon on its cradle, and a V 60 shunting locomotive with its jackshaft and coupling rods. Every vehicle stands on
// two or three wheelsets (flanged wheels on axles, axle boxes hung from leaf springs under the solebars), a riveted
// underframe with headstocks, buffers and screw couplings, the DB's colours weathered by the coalfield.
//
// Local frame: +Z along the vehicle (the shunter's long hood ahead), +Y up from the rail head (y = 0), centred on x = 0
// and on its length over buffers. One indexed geometry in the props' painted bucket's streams (position, normal, uv,
// colour). Deterministic and renderer-free.

import * as THREE from 'three';
import { VehicleMesh, linearHex, material, vehicleWeathering, type Vec3, type VehicleMaterial } from './vehicleMesh.ts';

type Mat = VehicleMaterial;

export type RollingStockKind = 'omm' | 'g10' | 'tank' | 'v60' | 'covered4' | 'gondola4' | 'tank4' | 'tem1';

/** Length over buffers (m): consecutive vehicles in a cut stand buffer to buffer. */
export const ROLLING_STOCK_LENGTH: Readonly<Record<RollingStockKind, number>> = {
  omm: 10.0, g10: 9.1, tank: 9.0, v60: 10.45, covered4: 14.73, gondola4: 13.92, tank4: 12.02, tem1: 16.9,
};
/** Width of the body (m) and its height over the rail head (m): the collision record's box. */
export const ROLLING_STOCK_BODY: Readonly<Record<RollingStockKind, { w: number; h: number }>> = {
  omm: { w: 2.92, h: 2.86 }, g10: { w: 2.82, h: 3.9 }, tank: { w: 2.6, h: 3.6 }, v60: { w: 3.1, h: 4.2 },
  covered4: { w: 3.0, h: 4.6 }, gondola4: { w: 3.13, h: 3.48 }, tank4: { w: 3.0, h: 4.4 }, tem1: { w: 3.2, h: 4.7 },
};

// ---------------------------------------------------------------------------------------------------- materials

const DB_BROWN = material('paint', linearHex(0x5a3a28), 0.72, 0.05, 0, 1);
const DB_BROWN_WOOD = material('wood', linearHex(0x5e3e2a), 0.86, 0, 0, 1);
const FRAME_BLACK = material('steel', [0.03, 0.029, 0.028], 0.62, 0.35, 0, 1);
const WHEEL_STEEL = material('steel', [0.05, 0.047, 0.044], 0.5, 0.55, 0, 1);
const TYRE_BRIGHT = material('chrome', [0.3, 0.3, 0.29], 0.35, 0.85, 0, 0.6);
const ROOF_GREY = material('paint', linearHex(0x5c5a56), 0.82, 0, 0, 1);
const TANK_BLACK = material('paint', [0.03, 0.03, 0.03], 0.5, 0.2, 0, 1);
const V60_RED = material('paint', linearHex(0x7a1c22), 0.5, 0.05, 0, 1);
// (round 3, wave 234: "coupling rods") the rods and crank pins worn bright, so they read against the black frame
// (round 4, wave 260: "no coupling rods, jackshaft…": the stock's baked material reads colours alone, so worn steel is
// a pale grey, the rods bright against the frame and the wheels)
const V60_ROD = material('steel', linearHex(0xa29d93), 0.42, 0.7, 0, 1);
/** Round 4 (wave 260: "no… handrails"): the handrails a light galvanised grey that reads on the red and the black. */
const HANDRAIL = material('steel', linearHex(0xc4c2ba), 0.5, 0.4, 0, 0.8);
/** Round 5 (wave 278: the V60 "a flat red box with blank dark window cut-outs, no louvres… plain black disc wheels"; the
 * stock's baked material reads colours alone, so its detail is told in shades): the cab glass catching the sky, its
 * rubber and aluminium frames, the louvres' black frames and pale slats, the tyres' white-painted rims. */
const V60_GLASS = material('glass', linearHex(0x4a5864), 0.1, 0, 0, 0.3);
const V60_GLASS_HI = material('glass', linearHex(0x8a9aa4), 0.1, 0, 0, 0.3);
const V60_FRAME = material('steel', linearHex(0xb8b6ae), 0.5, 0.4, 0, 0.6);
const LOUVRE_SLAT = material('paint', linearHex(0xa04a44), 0.6, 0, 0, 0.8);
const TYRE_WHITE = material('paint', linearHex(0xd8d6ce), 0.6, 0, 0, 0.6);
/** Round 4: the buffer heads' greased faces, worn bright. */
const BUFFER_FACE = material('steel', linearHex(0x8e8a82), 0.4, 0.6, 0, 0.6);
const GLASS = material('glass', [0.02, 0.024, 0.028], 0.06, 0, 0, 0.2);
const WARN_YELLOW = material('paint', linearHex(0xd0a020), 0.6, 0, 0, 1);
const COAL = material('cargo', [0.016, 0.0155, 0.015], 0.62, 0, 0, 0.3);
// (round 2, wave 152: "smooth black slabs") lump coal catches the light on its facets: a glossier, greyer face
// (round 3, wave 234: "a smooth black cap") the lumps' facets catch the light, the dull ones lie in their shadow; the
// heap faces the whole sky (the stock's baked material reads colours alone, no gloss), so coal-black albedos: at 0.05
// the top read as light grey gravel in hold 11
// (a soft mosaic: the lumps' relief carries the read, the two shades only break up the faces)
const COAL_FACE = material('cargo', [0.02, 0.0195, 0.019], 0.42, 0, 0, 0.3);
const COAL_DULL = material('cargo', [0.013, 0.0125, 0.012], 0.68, 0, 0, 0.3);
// (round 3: running gear, lettering) worn running gear a shade off the black frame so it reads under it; the stencils
const GEAR_STEEL = material('steel', linearHex(0x4a4640), 0.55, 0.4, 0, 0.8);
const STENCIL = material('paint', linearHex(0xd6d2c4), 0.62, 0, 0, 0.6);
const STENCIL_YELLOW = material('paint', linearHex(0xc8a43a), 0.6, 0, 0, 0.6);
const SOOT = material('paint', linearHex(0x151311), 0.92, 0, 0, 0.3);
// (round 2, wave 152: "spotless", "no rust streaks, grime or chipped edges") the coalfield's weathering on the sides
const RUST_BLEED = material('paint', linearHex(0x4a2614), 0.86, 0.05, 0, 0.5);
const WATER_STAIN = material('paint', linearHex(0x2c2119), 0.9, 0, 0, 0.4);
const COAL_GRIME = material('paint', linearHex(0x1e1914), 0.92, 0, 0, 0.3);
const COAL_DUST = material('paint', linearHex(0x34271e), 0.9, 0, 0, 0.4);
// (round 2, wave 152: tank wagons as "bare, spotless matte-black cylinders", "placeholder tubes") the tanks' fittings
// in weathered grey steel, product spilled down the barrel from the dome, road dust on its lower flanks
const RAIL_GREY = material('steel', linearHex(0x6a6862), 0.55, 0.35, 0, 0.8);
const STRAP_GREY = material('steel', linearHex(0x48463f), 0.6, 0.3, 0, 0.8);
const OIL_STAIN = material('paint', linearHex(0x241a12), 0.28, 0, 0, 0.3);
const ROAD_DUST = material('paint', linearHex(0x3c352d), 0.92, 0, 0, 0.4);
// round 4 (wave 260: the tank wagons "smooth black cylinders with a uniform gradient and no ladders, catwalks, riveted
// bands, drips or rust"; the baked material reads colours alone, so a black barrel's detail has to be told in shades):
// the riveted seams a lighter black, the product dried down the barrel a tan residue, the rust under the bands orange
const TANK_BAND = material('paint', [0.075, 0.07, 0.064], 0.6, 0.2, 0, 1);
const PRODUCT_STAIN = material('paint', linearHex(0x6b5a3e), 0.6, 0, 0, 0.4);
const RUST_STREAK = material('paint', linearHex(0x7a4626), 0.85, 0, 0, 0.5);
const GRATING = material('steel', linearHex(0x7c7a72), 0.6, 0.3, 0, 0.8);

// ---------------------------------------------------------------------------------------------------- helpers

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

/** Deterministic hash in [0, 1) of two integers. */
function hash2(a: number, b: number): number {
  let h = (Math.imul(a | 0, 374761393) + Math.imul(b | 0, 668265263)) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/**
 * A side panel weathered (round 2, wave 152): streaks bleeding down from the top rail between the stakes, tapering as
 * they run, and the coalfield's grime in a ragged dark band along the foot. Dressing on the panel's face a few
 * millimetres proud (the grime first, the streaks over it).
 */
function weatherPanel(mesh: VehicleMesh, coarse: boolean, side: number, xFace: number, y0: number, y1: number, z0: number,
  z1: number, seed: number, streak: Mat): void {
  if (coarse) return;
  mesh.dressing(() => {
    const n: Vec3 = [side, 0, 0], xs = side * (xFace + 0.003);
    // two bands, the paler dust higher and the grime under it, each edge a smooth wander (cosine-eased knots)
    const m = Math.max(4, Math.round((z1 - z0) / 0.75)), sub = 2;
    const edge = (t: number, base: number, amp: number, salt: number): number => {
      const k = Math.floor(t), f = t - k, e = (1 - Math.cos(f * Math.PI)) / 2;
      return base + amp * ((1 - e) * hash2(k, seed + salt) + e * hash2(k + 1, seed + salt));
    };
    for (const [layer, x, base, amp, salt, mat] of [
      [0, side * xFace, 0.26, 0.2, 4, COAL_DUST], [1, side * (xFace + 0.0015), 0.1, 0.12, 6, COAL_GRIME],
    ] as const) {
      void layer;
      for (let k = 0; k < m * sub; k++) {
        const ta = k / sub, tb = (k + 1) / sub;
        const za = z0 + (ta / m) * (z1 - z0), zb = z0 + (tb / m) * (z1 - z0);
        const ha = y0 + edge(ta, base, amp, salt), hb = y0 + edge(tb, base, amp, salt);
        face4(mesh, [[x, y0 + 0.02, za], [x, y0 + 0.02, zb], [x, hb, zb], [x, ha, za]], n, mat);
      }
    }
    const count = Math.round((z1 - z0) / 0.5);
    for (let k = 0; k < count; k++) {
      if (hash2(k, seed) < 0.3) continue;
      const z = z0 + (k + 0.15 + 0.7 * hash2(k, seed + 1)) * ((z1 - z0) / count);
      const len = (0.2 + 0.6 * hash2(k, seed + 2)) * (y1 - y0), w = 0.03 + 0.07 * hash2(k, seed + 3);
      const top = y1 - 0.05, bottom = Math.max(y0 + 0.1, top - len);
      face4(mesh, [[xs, top, z - w / 2], [xs, top, z + w / 2], [xs, bottom, z + w * 0.1], [xs, bottom, z - w * 0.1]], n, streak);
    }
  });
}

/**
 * A tank's lettering and dome fittings (round 3, wave 234: "a walkway, a ladder, dome fittings and lettering"): the
 * number in white glyphs along each flank with the owner's line under it, the yellow hazard plate at the other end,
 * the dome's lid with its clamps and hand wheel, the filler stub (dressing).
 */
function tankFittings(mesh: VehicleMesh, coarse: boolean, axisY: number, R: number, half: number, domeR: number, domeTop: number): void {
  if (coarse) return;
  for (const side of [1, -1]) {
    const a = side > 0 ? 0.06 : Math.PI - 0.06, start = side > 0 ? half * 0.72 : -half * 0.72, dir = side > 0 ? -1 : 1;
    const glyph = (u0: number, u1: number, v0: number, v1: number, m: Mat): void => {
      const za = start + dir * u0, zb = start + dir * u1;
      // v runs up the flank: on +x the angle grows upward, on -x it shrinks
      const a0 = side > 0 ? a + v0 / R : a - v1 / R, a1 = side > 0 ? a + v1 / R : a - v0 / R;
      // 9 mm proud: clear of the dust (3 mm) and the spills (5 mm) where they cross
      barrelPatch(mesh, axisY, R, Math.min(za, zb), Math.max(za, zb), a0, a1, 0.009, m, 1);
    };
    let u = 0;
    for (let k = 0; k < 10; k++) { glyph(u, u + 0.06, 0.12, 0.25, STENCIL); u += 0.085 + (k === 1 || k === 4 ? 0.06 : 0); }
    for (let k = 0; k < 12; k++) glyph(k * 0.055, k * 0.055 + 0.036, 0.02, 0.08, STENCIL);
    glyph(half * 1.44 - 0.5, half * 1.44, 0.0, 0.32, STENCIL_YELLOW);
  }
  mesh.dressing(() => {
    // the lid on the dome's crown, six clamps round it, the hand wheel on its spindle
    mesh.push().translate(0, domeTop - 0.01, 0).rotateZ(Math.PI / 2);
    mesh.lathe([[0.0001, 0], [domeR * 0.62, 0], [domeR * 0.62, 0.04], [0.0001, 0.05]], 12, () => GEAR_STEEL);
    mesh.pop();
    for (let k = 0; k < 6; k++) {
      const t = (k / 6) * Math.PI * 2;
      mesh.box(Math.cos(t) * domeR * 0.66, domeTop + 0.01, Math.sin(t) * domeR * 0.66, 0.04, 0.05, 0.04, GEAR_STEEL, 0);
    }
    beam(mesh, [0, domeTop + 0.03, 0], [0, domeTop + 0.09, 0], 0.025, 0.025, FRAME_BLACK);
    mesh.push().translate(0, domeTop + 0.09, 0).rotateZ(Math.PI / 2);
    mesh.lathe([[0.1, -0.01], [0.12, -0.01], [0.12, 0.01], [0.1, 0.01], [0.1, -0.01]], 10, () => FRAME_BLACK);
    mesh.pop();
    // the filler stub on the dome's shoulder
    beam(mesh, [domeR * 0.8, domeTop - 0.2, 0.12], [domeR * 0.8 + 0.1, domeTop - 0.02, 0.12], 0.06, 0.06, GEAR_STEEL);
  });
}

/**
 * The lettering (round 3, wave 234: "blank brown boxes", "no… lettering"): white stencil glyphs a few millimetres
 * proud of a side face, as the DB lettered its wagons: at the left of each side as seen from outside the emblem in its
 * frame and the number in its groups with the owner's line under it, at the right the framed data panel (dressing; one
 * quad a glyph). `side` is the face's outward x sign, `y` the foot of the lettering, z0..z1 the side's run.
 */
function stencils(mesh: VehicleMesh, coarse: boolean, side: number, xFace: number, y: number, z0: number, z1: number, panel: Mat = STENCIL): void {
  if (coarse) return;
  mesh.dressing(() => {
    const x = side * (xFace + 0.004), n: Vec3 = [side, 0, 0];
    // seen from +x the text runs toward -z, from -x toward +z
    const start = side > 0 ? z1 : z0, dir = side > 0 ? -1 : 1, end = side > 0 ? z0 : z1;
    const q = (u0: number, u1: number, v0: number, v1: number, m: Mat, from = start, d = dir): void =>
      face4(mesh, [[x, y + v0, from + d * u0], [x, y + v0, from + d * u1], [x, y + v1, from + d * u1], [x, y + v1, from + d * u0]], n, m);
    const frame = (u0: number, u1: number, v0: number, v1: number, t: number, m: Mat, from = start, d = dir): void => {
      q(u0, u1, v0, v0 + t, m, from, d); q(u0, u1, v1 - t, v1, m, from, d);
      q(u0, u0 + t, v0 + t, v1 - t, m, from, d); q(u1 - t, u1, v0 + t, v1 - t, m, from, d);
    };
    // the emblem: the framed plate and its two letters
    frame(0.1, 0.44, 0.3, 0.54, 0.025, STENCIL);
    q(0.16, 0.26, 0.35, 0.49, STENCIL); q(0.28, 0.38, 0.35, 0.49, STENCIL);
    // the number in its groups, the owner's line under it
    let u = 0.55;
    for (let k = 0; k < 12; k++) { q(u, u + 0.055, 0.15, 0.26, STENCIL); u += 0.075 + (k === 1 || k === 3 || k === 6 || k === 9 ? 0.05 : 0); }
    for (let k = 0; k < 14; k++) q(0.55 + k * 0.05, 0.584 + k * 0.05, 0.04, 0.1, STENCIL);
    // the data panel at the other end: a framed table of three lines
    frame(0.1, 0.62, 0.06, 0.42, 0.02, panel, end, -dir);
    for (let row = 0; row < 3; row++) for (let k = 0; k < 3; k++) {
      q(0.17 + k * 0.15, 0.28 + k * 0.15, 0.12 + row * 0.1, 0.15 + row * 0.1, panel, end, -dir);
    }
  });
}

/**
 * A patch on a barrel lying along z (axis at (0, axisY), radius R): angles a0..a1 (from +x, counter-clockwise seen from
 * +z, so pi/2 is the crown) between z0 and z1, `lift` proud, normals radial. Dressing.
 */
function barrelPatch(mesh: VehicleMesh, axisY: number, R: number, z0: number, z1: number, a0: number, a1: number, lift: number,
  m: Mat, steps = 6): void {
  mesh.dressing(() => {
    const r = R + lift;
    for (let k = 0; k < steps; k++) {
      const aa = a0 + ((a1 - a0) * k) / steps, ab = a0 + ((a1 - a0) * (k + 1)) / steps, am = (aa + ab) / 2;
      const p = (a: number, z: number): Vec3 => [Math.cos(a) * r, axisY + Math.sin(a) * r, z];
      face4(mesh, [p(aa, z0), p(ab, z0), p(ab, z1), p(aa, z1)], [Math.cos(am), Math.sin(am), 0], m);
    }
  });
}

/** A tank's spills and dust: drips from the dome down both flanks, the lower flanks dusty, end to end. */
function tankWeathering(mesh: VehicleMesh, coarse: boolean, axisY: number, R: number, half: number, domeR: number, seed: number): void {
  if (coarse) return;
  for (const side of [1, -1]) {
    // the dust: a band along each lower flank (angles measured on the side's own half)
    const lo = side > 0 ? -0.95 : Math.PI + 0.25, hi = side > 0 ? -0.25 : Math.PI + 0.95;
    barrelPatch(mesh, axisY, R, -half, half, lo, hi, 0.003, ROAD_DUST, 4);
    for (let k = 0; k < 4; k++) {
      const z = (hash2(k, seed + (side > 0 ? 1 : 2)) - 0.5) * domeR * 2.2, w = 0.06 + 0.1 * hash2(k, seed + 3);
      const run = 0.45 + 0.75 * hash2(k, seed + 4);
      const a0 = side > 0 ? Math.PI / 2 - 0.12 : Math.PI / 2 + 0.12, a1 = side > 0 ? a0 - run : a0 + run;
      // round 4: the product dried where it ran, a tan residue on the black (a dark stain never showed on it)
      barrelPatch(mesh, axisY, R, z - w / 2, z + w / 2, a0, a1, 0.005, PRODUCT_STAIN, 4);
    }
    // round 4 (wave 260: "no… rust"): rust bleeding from the seams and the straps down the upper flank
    for (let k = 0; k < 3; k++) {
      const z = (hash2(k, seed + (side > 0 ? 11 : 12)) - 0.5) * half * 1.7, w = 0.04 + 0.06 * hash2(k, seed + 13);
      const a0 = side > 0 ? 0.55 : Math.PI - 0.55, run = 0.5 + 0.5 * hash2(k, seed + 14), a1 = side > 0 ? a0 - run : a0 + run;
      barrelPatch(mesh, axisY, R, z - w / 2, z + w / 2, a0, a1, 0.006, RUST_STREAK, 3);
    }
  }
  // the coal dust settled on the crown, end to end
  barrelPatch(mesh, axisY, R, -half, half, Math.PI / 2 - 0.55, Math.PI / 2 + 0.55, 0.003, ROAD_DUST, 4);
}

/** Handrails along a walkway from z0 to z1 at x (both sides of it), posts every metre or so. Dressing. */
function walkwayRails(mesh: VehicleMesh, coarse: boolean, xs: readonly number[], y: number, z0: number, z1: number, height: number, m: Mat): void {
  if (coarse) return;
  mesh.dressing(() => {
    for (const x of xs) {
      mesh.tube([[x, y + height, z0], [x, y + height, z1]], 0.016, 5, m, { caps: true });
      const posts = Math.max(2, Math.round((z1 - z0) / 1.1) + 1);
      for (let k = 0; k < posts; k++) {
        const z = z0 + ((z1 - z0) * k) / (posts - 1);
        mesh.box(x, y + height / 2, z, 0.025, height, 0.025, m, 0);
      }
    }
  });
}

/**
 * A wagon's coal: heaped over the top rails with a ridge along the middle, its face broken into lumps at two scales (a
 * hand-sized one too), facets catching the light in two shades; on desktop a scatter of loose lumps on top (round 2,
 * wave 152: "smooth black slabs", "a black box insert, not a heap of coal").
 */
/**
 * Round 5 (wave 278: the Omm's coal "a flat dark-grey lid flush with the sides, sprinkled with black cubes"): the heap's
 * finer options. `peaks` dumps along the length (the loading chute's cones), the surface on a finer grid with its lumps'
 * relief at two scales, `lumps` irregular lumps (rough octahedra, never cubes) bedded over it, and coal spilled on the
 * top rails and its dust streaked down the sides (`spill`: the walls' outer face, x).
 */
interface CoalHeapOptions { grid?: readonly [number, number]; peaks?: number; lumps?: number; spill?: number }

/** A rough lump: an octahedron with every vertex pulled in or out, flat-shaded facets (8 triangles). */
function coalLump(mesh: VehicleMesh, x: number, y: number, z: number, r: number, seed: number, m: Mat, m2: Mat): void {
  const axes: Vec3[] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  const v = axes.map((a, k) => {
    const s = r * (0.65 + 0.6 * hash2(k, seed)) * (a[1] !== 0 ? 0.7 : 1);
    return [x + a[0] * s + (hash2(k, seed + 3) - 0.5) * r * 0.3, y + a[1] * s, z + a[2] * s + (hash2(k, seed + 5) - 0.5) * r * 0.3] as Vec3;
  });
  const faces: [number, number, number][] = [[0, 2, 4], [4, 2, 1], [1, 2, 5], [5, 2, 0], [4, 3, 0], [1, 3, 4], [5, 3, 1], [0, 3, 5]];
  for (let f = 0; f < faces.length; f++) {
    const [a, b, c] = faces[f];
    const n = unit(crossV(sub(v[b], v[a]), sub(v[c], v[a])));
    const out: Vec3 = dotV(n, sub(v[a], [x, y, z])) < 0 ? [-n[0], -n[1], -n[2]] : n;
    const mat = hash2(f, seed + 7) < 0.5 ? m : m2;
    const ia = mesh.vert(v[a][0], v[a][1], v[a][2], out[0], out[1], out[2], mat), ib = mesh.vert(v[b][0], v[b][1], v[b][2], out[0], out[1], out[2], mat);
    const ic = mesh.vert(v[c][0], v[c][1], v[c][2], out[0], out[1], out[2], mat);
    if (dotV(crossV(sub(v[b], v[a]), sub(v[c], v[a])), out) < 0) mesh.tri(ia, ic, ib); else mesh.tri(ia, ib, ic);
  }
}

function coalHeap(mesh: VehicleMesh, coarse: boolean, top: number, frameHalf: number, W: number, sink: number, rise: number, seed: number,
  o: CoalHeapOptions = {}): void {
  const [gu, gv] = o.grid ?? [22, 12];
  const nu = coarse ? 6 : gu, nv = coarse ? 6 : gv, peaks = o.peaks ?? 0;
  const lenZ = frameHalf * 2 - 0.25, widX = W - 0.2;
  const heightAt = (x: number, z: number): number => {
    const u = z / lenZ + 0.5, v = x / widX + 0.5;
    const along = Math.pow(Math.sin(Math.min(1, Math.max(0, u)) * Math.PI), 0.4)
      * (peaks ? 0.8 + 0.2 * Math.cos((u * peaks - 0.5) * Math.PI * 2) : 1);
    const ridge = Math.sin(Math.min(1, Math.max(0, v)) * Math.PI) * along;
    const broad = Math.sin(z * 2.2 + x * 3.2 + seed) * 0.04 + Math.sin(z * 5.5 - x * 4.2 + seed * 1.7) * 0.025;
    const fine = coarse ? 0 : Math.sin(z * 11.3 + x * 7.9 + seed * 2.3) * 0.022 + Math.sin(z * 8.1 - x * 13.7 + seed * 0.7) * 0.018
      + (peaks ? (hash2(Math.round(z * 9), Math.round(x * 9) + seed) - 0.5) * 0.05 : 0);
    return top - sink + ridge * rise + (broad + fine) * Math.max(0.35, ridge);
  };
  // (round 3, wave 234: "a smooth black cap") the heap faces up (i runs along z, j along x: i x j is up); it was
  // flipped, so the game culled it from above and the wagon's black floor showed between the lumps
  mesh.grid(nu, nv, (i, j, out) => {
    const z = (i / nu - 0.5) * lenZ, x = (j / nv - 0.5) * widX;
    out[0] = x; out[1] = heightAt(x, z); out[2] = z;
  }, (i, j) => (coarse ? COAL : hash2(i + seed * 31, j) < 0.45 ? COAL_FACE : COAL_DULL));
  if (coarse) return;
  // loose lumps lying on the heap: rough blocks tumbled every way, a few the size of two fists
  mesh.dressing(() => {
    if (o.lumps) {
      // round 5: rough lumps, mostly small, bedded half into the heap all over it (never cubes)
      for (let k = 0; k < o.lumps; k++) {
        const u = (k + 0.5) / o.lumps, v = (k * 0.618034 + seed * 0.13) % 1;
        const z = (u - 0.5) * lenZ * 0.92, x = (v - 0.5) * widX * 0.86;
        const r = 0.035 + 0.075 * Math.pow(hash2(k, seed + 5), 2);
        coalLump(mesh, x, heightAt(x, z) + r * 0.2, z, r, seed * 97 + k * 13, COAL_FACE, COAL_DULL);
      }
      if (o.spill !== undefined) {
        // coal spilled along the top rails, and its dust down the walls' outer face from the rim
        for (const side of [1, -1]) {
          for (let k = 0; k < 9; k++) {
            const z = (hash2(k, seed + side * 17) - 0.5) * lenZ * 0.9, r = 0.03 + 0.03 * hash2(k, seed + side * 19);
            coalLump(mesh, side * (o.spill - 0.02), top + r * 0.4, z, r, seed * 53 + k * 7 + side, COAL_FACE, COAL_DULL);
          }
          const n: Vec3 = [side, 0, 0], xf = side * (o.spill + 0.006);
          for (let k = 0; k < 7; k++) {
            if (hash2(k, seed + 23 + side) < 0.25) continue;
            const z = (hash2(k, seed + 29 + side) - 0.5) * lenZ * 0.9, w = 0.12 + 0.3 * hash2(k, seed + 31), len = 0.25 + 0.6 * hash2(k, seed + 37);
            face4(mesh, [[xf, top - 0.08, z - w / 2], [xf, top - 0.08, z + w / 2], [xf, top - 0.08 - len, z + w * 0.15], [xf, top - 0.08 - len, z - w * 0.15]], n, COAL_GRIME);
          }
        }
      }
      return;
    }
    const n = 34;
    for (let k = 0; k < n; k++) {
      const u = (k + 0.5) / n, v = (k * 0.618034 + seed * 0.13) % 1;
      const z = (u - 0.5) * lenZ * 0.86, x = (v - 0.5) * widX * 0.7;
      // half bedded in the heap (the loading-gauge record: the wagon's height over the rail stands)
      const size = 0.1 + 0.14 * hash2(k, seed + 5);
      mesh.push().translate(x, heightAt(x, z) + size * 0.06, z)
        .rotateY(hash2(k, seed + 7) * Math.PI * 2).rotateX((hash2(k, seed + 9) - 0.5) * 1.4).rotateZ((hash2(k, seed + 11) - 0.5) * 1.4);
      mesh.box(0, 0, 0, size, size * (0.6 + 0.3 * hash2(k, seed + 13)), size * (0.8 + 0.4 * hash2(k, seed + 15)), k % 3 ? COAL_FACE : COAL_DULL, 0);
      mesh.pop();
    }
  });
}

/** A bar from a to b, `w` across and `d` deep (its depth toward `up`), open-ended when its ends are buried. */
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

// ---------------------------------------------------------------------------------------------------- running gear

/** A wheelset at z: two flanged wheels on their axle, the rail head at y = 0 under the treads. */
function wheelset(mesh: VehicleMesh, z: number, r: number, spoked: boolean, gaugeHalf = 0.7175, seg = 14): void {
  const tread = 0.135;
  for (const side of [1, -1]) {
    mesh.push().translate(side * gaugeHalf, r, z).scale(side, 1, 1);
    // the tyre: its tread over the rail, the flange inside
    mesh.lathe([[r - 0.05, tread * 0.62], [r - 0.004, tread * 0.62], [r, tread * 0.2], [r, -tread * 0.3], [r + 0.028, -tread * 0.36],
      [r + 0.028, -tread * 0.42], [r - 0.06, -tread * 0.42]], seg, (k) => (k >= 1 && k <= 3 ? TYRE_BRIGHT : WHEEL_STEEL), { creases: [1, 3, 4, 5], flip: true });
    // the centre: a dished disc or six spokes, and the boss
    if (spoked) {
      for (let k = 0; k < 6; k++) {
        mesh.push().rotateX((k / 6) * Math.PI * 2);
        beam(mesh, [0.02, r * 0.22, 0], [0.04, r - 0.05, 0], 0.05, 0.06, WHEEL_STEEL, true, [1, 0, 0]);
        mesh.pop();
      }
    } else {
      mesh.lathe([[r - 0.05, 0.06], [r * 0.55, 0.03], [r * 0.25, 0.08], [r * 0.25, -0.06], [r * 0.55, -0.02], [r - 0.05, -0.04]], seg - 2,
        () => WHEEL_STEEL, { creases: [2, 3] });
    }
    mesh.lathe([[0.0001, 0.15], [0.1, 0.15], [0.12, 0.05], [0.12, -0.08], [0.0001, -0.08]], seg >= 14 ? 8 : 6, () => WHEEL_STEEL, { flip: true });
    mesh.pop();
  }
  // the axle
  mesh.push().translate(0, r, z);
  mesh.lathe([[0.075, -0.82], [0.075, 0.82]], 8, () => WHEEL_STEEL);
  mesh.pop();
}

/** An axle box outside each wheel under its leaf spring, hung from the solebar. */
function axleBox(mesh: VehicleMesh, z: number, r: number, solebarY: number, springLen: number): void {
  for (const side of [1, -1]) {
    const x = side * 1.0;
    mesh.box(x, r, z, 0.24, 0.36, 0.32, GEAR_STEEL, 0.02);
    // the leaf spring: a stack of leaves, its eyes up to the hangers on the solebar
    for (let k = 0; k < 4; k++) mesh.box(x, r + 0.22 + k * 0.04, z, 0.12, 0.035, springLen - k * 0.18, GEAR_STEEL, 0);
    // (round 3, wave 234: "brake rigging") the brake blocks against the tread fore and aft, each on its hanger up to the
    // frame (one piece), and the pull rod between them inboard of the wheel
    for (const s2 of [-1, 1]) {
      const y0 = r * 0.3, y1 = solebarY - 0.1;
      mesh.box(x * 0.76, (y0 + y1) / 2, z + s2 * (r + 0.05), 0.09, y1 - y0, 0.07, GEAR_STEEL, 0);
    }
    mesh.box(x * 0.5, r * 0.45, z, 0.04, 0.04, 2 * r + 0.1, GEAR_STEEL, 0);
    for (const s of [-1, 1]) beam(mesh, [x, r + 0.34, z + s * springLen / 2], [x, solebarY - 0.12, z + s * (springLen / 2 + 0.06)], 0.06, 0.06, FRAME_BLACK);
    // the horn guides either side of the box
    for (const s of [-1, 1]) mesh.box(x, (r + solebarY) / 2, z + s * 0.22, 0.18, solebarY - r, 0.05, FRAME_BLACK, 0);
  }
}

/** The underframe: two solebars, the headstocks, buffers and screw couplings at both ends, a brake hand wheel. */
function underframe(mesh: VehicleMesh, frameHalf: number, width: number, y: number, depth: number, overBuffers: number): void {
  const sx = width / 2 - 0.08;
  for (const side of [1, -1]) {
    // the solebar: a channel, its web outward
    mesh.box(side * sx, y - depth / 2, 0, 0.03, depth, frameHalf * 2, FRAME_BLACK, 0);
    mesh.box(side * (sx - 0.05), y - 0.015, 0, 0.1, 0.03, frameHalf * 2, FRAME_BLACK, 0);
    mesh.box(side * (sx - 0.05), y - depth + 0.015, 0, 0.1, 0.03, frameHalf * 2, FRAME_BLACK, 0);
  }
  for (const end of [1, -1]) {
    const z = end * frameHalf;
    mesh.box(0, y - depth / 2, z, width - 0.1, depth, 0.12, FRAME_BLACK, 0.01);
    // buffers: the casing, the plunger and the head, 1.75 m apart at 1.06 m over the rail
    const reach = overBuffers / 2 - frameHalf;
    for (const side of [1, -1]) {
      mesh.push().translate(side * 0.875, 1.06, z).rotateY(end > 0 ? -Math.PI / 2 : Math.PI / 2);
      mesh.lathe([[0.12, 0.0], [0.11, reach * 0.55], [0.08, reach * 0.55], [0.08, reach - 0.04]], 8, () => FRAME_BLACK);
      mesh.lathe([[0.0001, reach - 0.05], [0.2, reach - 0.05], [0.21, reach - 0.02], [0.19, reach], [0.0001, reach + 0.005]], 10,
        (k) => (k >= 2 ? BUFFER_FACE : WHEEL_STEEL));
      mesh.pop();
    }
    // the coupling hook and its screw link hanging
    mesh.box(0, 1.06, z + end * (reach * 0.6), 0.1, 0.16, reach * 1.2, FRAME_BLACK, 0.01);
    beam(mesh, [0, 1.0, z + end * reach * 1.05], [0, 0.72, z + end * (reach + 0.12)], 0.05, 0.05, FRAME_BLACK);
  }
  // cross bearers between the solebars
  for (const z of [-frameHalf * 0.55, 0, frameHalf * 0.55]) mesh.box(0, y - depth * 0.6, z, width - 0.3, depth * 0.5, 0.1, FRAME_BLACK, 0);
}

// ---------------------------------------------------------------------------------------------------- the Soviet stock (1950s)

/** The 1520 mm gauge's wheel centres (the spur that carries Soviet stock is laid to it: railSpurs.ts `gauge: 1.52`). */
const RU_GAUGE_HALF = 0.76;
const SU_BROWN = material('paint', linearHex(0x6a3828), 0.72, 0.05, 0, 1);
const SU_GREEN = material('paint', linearHex(0x2f5a3c), 0.55, 0.05, 0, 1);
const SU_YELLOW = material('paint', linearHex(0xc8a43a), 0.55, 0, 0, 1);

/** A two- or three-axle bogie at z: cast side frames over their axle boxes and springs, the bolster, the wheelsets. */
function bogie(mesh: VehicleMesh, z: number, r: number, axles: number, base: number): void {
  const zs = axles === 2 ? [-base / 2, base / 2] : [-base, 0, base];
  // the wheels sit half hidden behind the cast side frames: fewer facets than the two-axle stock's open wheels
  for (const az of zs) wheelset(mesh, z + az, r, false, RU_GAUGE_HALF, 10);
  for (const side of [1, -1]) {
    const x = side * (RU_GAUGE_HALF + 0.3);
    mesh.box(x, r + 0.05, z, 0.16, 0.42, (zs[zs.length - 1] - zs[0]) + 0.9, FRAME_BLACK, 0.02);
    for (const az of zs) mesh.box(x, r, z + az, 0.22, 0.3, 0.32, FRAME_BLACK, 0.02);
    for (let k = 0; k < 3; k++) mesh.box(x, r + 0.32, z - 0.18 + k * 0.18, 0.12, 0.2, 0.1, FRAME_BLACK, 0);
  }
  mesh.box(0, r + 0.3, z, 2.2, 0.26, 0.4, FRAME_BLACK, 0.02);
}

/** The Soviet underframe: a centre sill and side sills, the end beams, the automatic SA-3 couplers (no side buffers). */
function suUnderframe(mesh: VehicleMesh, frameHalf: number, width: number, y: number, overCouplers: number): void {
  for (const side of [1, -1]) mesh.box(side * (width / 2 - 0.08), y - 0.12, 0, 0.06, 0.24, frameHalf * 2, FRAME_BLACK, 0);
  mesh.box(0, y - 0.2, 0, 0.36, 0.36, frameHalf * 2, FRAME_BLACK, 0);
  for (const end of [1, -1]) {
    const z = end * frameHalf, reach = overCouplers / 2 - frameHalf;
    mesh.box(0, y - 0.18, z, width - 0.1, 0.36, 0.14, FRAME_BLACK, 0.01);
    // the coupler: the shank and the knuckle head at the end of the reach
    mesh.box(0, 1.06, z + end * reach * 0.45, 0.16, 0.16, reach * 0.9, FRAME_BLACK, 0);
    mesh.box(0, 1.06, z + end * (reach - 0.12), 0.36, 0.3, 0.26, FRAME_BLACK, 0.03);
    // the uncoupling lever across the end
    beam(mesh, [-0.9, 1.25, z + end * 0.1], [0.3, 1.25, z + end * 0.1], 0.03, 0.03, FRAME_BLACK);
  }
}

function covered4(mesh: VehicleMesh, coarse: boolean): void {
  const L = ROLLING_STOCK_LENGTH.covered4, W = ROLLING_STOCK_BODY.covered4.w, frameHalf = 6.92, floorY = 1.3, eave = 3.95, ridge = 4.6;
  for (const z of [-5.0, 5.0]) bogie(mesh, z, 0.475, 2, 1.85);
  suUnderframe(mesh, frameHalf, W, floorY, L);
  const hw = W / 2, h = eave - floorY, bodyL = frameHalf * 2;
  for (const side of [1, -1]) {
    mesh.box(side * (hw - 0.03), floorY + h / 2, 0, 0.05, h, bodyL, SU_BROWN, 0);
    weatherPanel(mesh, coarse, side, hw - 0.003, floorY, eave, -bodyL / 2 + 0.1, bodyL / 2 - 0.1, side > 0 ? 41 : 43, RUST_BLEED);
    // the steel frame's posts and braces outside the sheathing, the sliding door on its rails
    const posts = coarse ? 6 : 12;
    for (let k = 0; k <= posts; k++) {
      const z = -bodyL / 2 + 0.05 + (k / posts) * (bodyL - 0.1);
      if (Math.abs(z) < 1.05) continue;
      mesh.box(side * (hw + 0.015), floorY + h / 2, z, 0.04, h, 0.08, SU_BROWN, coarse ? 0 : 0.008);
    }
    mesh.box(side * (hw + 0.02), eave - 0.05, 0, 0.06, 0.1, bodyL, SU_BROWN, 0);
    mesh.box(side * (hw + 0.06), floorY + h / 2 - 0.05, 0, 0.05, h - 0.2, 2.0, SU_BROWN, coarse ? 0 : 0.01);
    weatherPanel(mesh, coarse, side, hw + 0.088, floorY + 0.05, eave - 0.15, -0.98, 0.98, side > 0 ? 45 : 47, RUST_BLEED);
    mesh.box(side * (hw + 0.1), eave - 0.15, 0, 0.05, 0.06, 4.2, FRAME_BLACK, 0);
    // the hatch windows high on the side (the wagon's vents)
    if (!coarse) for (const z of [-4.5, 4.5]) mesh.box(side * (hw + 0.02), eave - 0.5, z, 0.02, 0.4, 0.6, FRAME_BLACK, 0);
  }
  for (const end of [1, -1]) mesh.box(0, floorY + h / 2, end * (bodyL / 2 - 0.03), W - 0.06, h, 0.05, SU_BROWN, 0);
  const ar = coarse ? 8 : 14;
  // (round 3) i runs along z and j over the arch from +x: i x j points down, so the outer skin is the flipped one
  for (const [inset, flip] of [[0, true], [0.008, false]] as const) {
    mesh.grid(4, ar, (i, j, out) => {
      const a = Math.PI * (j / ar);
      out[0] = Math.cos(a) * (hw + 0.06 - inset);
      out[1] = eave - 0.02 - inset + (ridge - eave + 0.02) * Math.sin(a);
      out[2] = (i / 4 - 0.5) * (bodyL + 0.12);
    }, () => ROOF_GREY, { flip });
  }
  for (const end of [1, -1]) {
    const pts: Vec3[] = [];
    const n = coarse ? 4 : 8;
    for (let k = 0; k <= n; k++) { const a = Math.PI * (k / n); pts.push([Math.cos(a) * hw, eave + (ridge - eave) * Math.sin(a), end * (bodyL / 2 - 0.03)]); }
    const c = mesh.vert(0, eave, end * (bodyL / 2 - 0.03), 0, 0, end, SU_BROWN);
    const ring = pts.map((q) => mesh.vert(q[0], q[1], q[2], 0, 0, end, SU_BROWN));
    for (let k = 0; k < n; k++) end > 0 ? mesh.tri(c, ring[k], ring[k + 1]) : mesh.tri(c, ring[k + 1], ring[k]);
  }
}

function gondola4(mesh: VehicleMesh, coarse: boolean): void {
  const L = ROLLING_STOCK_LENGTH.gondola4, W = ROLLING_STOCK_BODY.gondola4.w, frameHalf = 6.35, floorY = 1.38, top = 3.48;
  for (const z of [-4.4, 4.4]) bogie(mesh, z, 0.475, 2, 1.85);
  suUnderframe(mesh, frameHalf, W, floorY, L);
  const hw = W / 2, h = top - floorY;
  for (const side of [1, -1]) {
    mesh.box(side * (hw - 0.03), floorY + h / 2, 0, 0.03, h, frameHalf * 2, SU_BROWN, 0);
    mesh.box(side * (hw - 0.08), floorY + h / 2, 0, 0.01, h, frameHalf * 2 - 0.1, SU_BROWN, 0);
    weatherPanel(mesh, coarse, side, hw - 0.013, floorY, top, -frameHalf + 0.1, frameHalf - 0.1, side > 0 ? 21 : 23, RUST_BLEED);
    const n = coarse ? 7 : 13;
    for (let k = 0; k < n; k++) {
      const z = -frameHalf + 0.2 + (k / (n - 1)) * (frameHalf * 2 - 0.4);
      mesh.box(side * (hw + 0.03), floorY + h / 2, z, 0.06, h, 0.1, SU_BROWN, coarse ? 0 : 0.01);
    }
    mesh.box(side * (hw + 0.02), top - 0.04, 0, 0.1, 0.08, frameHalf * 2, SU_BROWN, 0.01);
  }
  for (const end of [1, -1]) {
    mesh.box(0, floorY + h / 2, end * (frameHalf - 0.02), W - 0.04, h, 0.04, SU_BROWN, 0);
    for (const x of [-1.0, 0, 1.0]) mesh.box(x, floorY + h / 2, end * (frameHalf + 0.03), 0.1, h, 0.06, SU_BROWN, coarse ? 0 : 0.01);
  }
  mesh.box(0, floorY + 0.03, 0, W - 0.06, 0.06, frameHalf * 2 - 0.06, FRAME_BLACK, 0);
  // the load: the yard's coal, heaped
  coalHeap(mesh, coarse, top, frameHalf, W, 0.3, 0.6, 3);
}

function tank4(mesh: VehicleMesh, coarse: boolean): void {
  const L = ROLLING_STOCK_LENGTH.tank4, W = 3.0, frameHalf = 5.4, floorY = 1.3, R = 1.4, axisY = floorY + 0.15 + R;
  for (const z of [-3.85, 3.85]) bogie(mesh, z, 0.475, 2, 1.85);
  suUnderframe(mesh, frameHalf, W, floorY, L);
  const half = 4.9;
  // the saddles over the bolsters that carry the barrel, and the barrel's hold-down bands
  for (const z of [-3.85, 3.85]) {
    mesh.box(0, floorY + 0.12, z, 2.2, 0.24, 0.5, FRAME_BLACK, 0.02);
    for (const side of [1, -1]) mesh.box(side * 0.95, floorY + 0.38, z, 0.3, 0.5, 0.4, FRAME_BLACK, 0.02);
  }
  mesh.push().translate(0, axisY, 0).rotateY(Math.PI / 2);
  mesh.lathe([[0.0001, -half - 0.35], [R * 0.55, -half - 0.28], [R * 0.88, -half - 0.13], [R, -half], [R, half], [R * 0.88, half + 0.13],
    [R * 0.55, half + 0.28], [0.0001, half + 0.35]], coarse ? 12 : 18, () => TANK_BLACK);
  mesh.pop();
  for (const z of [-3.6, 0, 3.6]) {
    if (!coarse) mesh.dressing(() => {
      const strap: Vec3[] = [];
      for (let k = 0; k <= 10; k++) { const a = Math.PI * (k / 10); strap.push([Math.cos(a) * (R + 0.012), axisY + Math.sin(a) * (R + 0.012), z]); }
      mesh.tube(strap, 0.012, 4, STRAP_GREY, { caps: true });
    });
  }
  mesh.push().translate(0, axisY + R - 0.05, 0).rotateZ(Math.PI / 2);
  mesh.lathe([[0.45, 0], [0.45, 0.45], [0.38, 0.52], [0.0001, 0.55]], coarse ? 10 : 16, () => TANK_BLACK);
  mesh.pop();
  mesh.box(0, axisY + R + 0.02, 1.6, 0.6, 0.04, 2.2, RAIL_GREY, 0);
  for (const side of [1, -1]) beam(mesh, [side * 0.26, axisY + R + 0.04, 0.6], [side * 0.26, axisY + R + 0.4, 0.6], 0.03, 0.03, RAIL_GREY);
  walkwayRails(mesh, coarse, [-0.32, 0.32], axisY + R + 0.04, 0.5, 2.7, 0.45, RAIL_GREY);
  // the ladder up the barrel's end from the end platform
  for (const side of [1, -1]) beam(mesh, [side * 0.24, floorY + 0.25, half + 0.2], [side * 0.24, axisY + R, half - 0.3], 0.04, 0.03, RAIL_GREY);
  for (let k = 1; k <= 6; k++) {
    const t = k / 7;
    mesh.box(0, floorY + 0.25 + t * (axisY + R - floorY - 0.25), half + 0.2 - t * 0.5, 0.48, 0.025, 0.03, RAIL_GREY, 0);
  }
  tankWeathering(mesh, coarse, axisY, R, half, 0.45, 7);
}

function tem1(mesh: VehicleMesh, coarse: boolean): void {
  const L = ROLLING_STOCK_LENGTH.tem1, W = ROLLING_STOCK_BODY.tem1.w, frameHalf = 7.75, frameTop = 1.55;
  for (const z of [-4.6, 4.6]) bogie(mesh, z, 0.525, 3, 1.85);
  suUnderframe(mesh, frameHalf, W, frameTop, L);
  mesh.box(0, frameTop + 0.03, 0, W, 0.06, frameHalf * 2, FRAME_BLACK, 0.01);
  // the long hood ahead (the engine and generator), the cab astern of it, the short hood behind
  const hood = (z0: number, z1: number, h: number, w: number) => {
    mesh.box(0, frameTop + h / 2, (z0 + z1) / 2, w, h, z1 - z0, SU_GREEN, coarse ? 0 : 0.07);
    if (!coarse) mesh.dressing(() => {
      for (const side of [1, -1]) {
        mesh.box(side * (w / 2 + 0.004), frameTop + 0.35, (z0 + z1) / 2, 0.008, 0.08, z1 - z0 - 0.1, SU_YELLOW, 0);
        for (let k = 0; k < Math.floor((z1 - z0) / 0.9); k++) mesh.box(side * (w / 2 + 0.004), frameTop + h * 0.6, z0 + 0.45 + k * 0.9, 0.008, h * 0.45, 0.6, linearMat(0x24452e), 0);
      }
    });
  };
  hood(-2.6, 7.4, 2.45, 2.3);
  hood(-7.5, -5.4, 2.1, 2.3);
  const cz0 = -5.4, cz1 = -2.6, cabTop = 4.65;
  mesh.box(0, frameTop + (cabTop - frameTop) / 2, (cz0 + cz1) / 2, W - 0.1, cabTop - frameTop, cz1 - cz0, SU_GREEN, coarse ? 0 : 0.05);
  mesh.box(0, cabTop + 0.06, (cz0 + cz1) / 2, W - 0.02, 0.12, cz1 - cz0 + 0.2, FRAME_BLACK, coarse ? 0 : 0.05);
  for (const side of [1, -1]) for (const z of [-4.8, -3.3]) mesh.box(side * ((W - 0.1) / 2 + 0.006), cabTop - 0.7, z, 0.012, 0.75, 0.9, GLASS, 0);
  for (const end of [1, -1]) for (const x of [-0.85, 0.85]) mesh.box(x, cabTop - 0.75, end > 0 ? cz1 + 0.006 : cz0 - 0.006, 0.7, 0.7, 0.012, GLASS, 0);
  // the headlamps and the pilots, the handrails along the walkway
  for (const end of [1, -1]) {
    const z = end > 0 ? 7.4 : -7.5;
    mesh.push().translate(0, frameTop + (end > 0 ? 2.25 : 1.95), z).rotateY(end > 0 ? -Math.PI / 2 : Math.PI / 2);
    mesh.lathe([[0.15, 0], [0.15, 0.1], [0.0001, 0.12]], 10, () => linearMat(0xd8d2b8));
    mesh.pop();
    mesh.box(0, 0.5, end * (frameHalf + 0.1), 2.6, 0.5, 0.12, FRAME_BLACK, 0.02);
  }
  for (const side of [1, -1]) for (const [z0, z1] of [[-7.4, cz0 - 0.05], [cz1 + 0.05, 7.6]]) {
    const x = side * (W / 2 - 0.05);
    beam(mesh, [x, frameTop + 0.9, z0], [x, frameTop + 0.9, z1], 0.03, 0.03, SU_YELLOW);
    for (const z of [z0, z1]) beam(mesh, [x, frameTop + 0.06, z], [x, frameTop + 0.9, z], 0.025, 0.025, SU_YELLOW);
    // (round 2) stanchions every metre and a half between the end posts, the rail no longer spanning bare
    if (!coarse) mesh.dressing(() => {
      const n = Math.round((z1 - z0) / 1.5);
      for (let k = 1; k < n; k++) mesh.box(x, frameTop + 0.48, z0 + ((z1 - z0) * k) / n, 0.022, 0.84, 0.022, SU_YELLOW, 0);
    });
  }
  // the working grime low on the hoods and streaks down from their roofs
  for (const side of [1, -1]) {
    weatherPanel(mesh, coarse, side, 2.3 / 2 + 0.009, frameTop + 0.06, frameTop + 2.45, -2.55, 7.35, side > 0 ? 61 : 63, linearMat(0x1f3a28));
    weatherPanel(mesh, coarse, side, 2.3 / 2 + 0.009, frameTop + 0.06, frameTop + 2.1, -7.45, -5.45, side > 0 ? 65 : 67, linearMat(0x1f3a28));
  }
}

// ---------------------------------------------------------------------------------------------------- the vehicles

function omm(mesh: VehicleMesh, coarse: boolean): void {
  const L = ROLLING_STOCK_LENGTH.omm, W = ROLLING_STOCK_BODY.omm.w, frameHalf = 4.35, floorY = 1.28, top = 2.83;
  const r = 0.5;
  for (const z of [-3.0, 3.0]) { wheelset(mesh, z, r, true); axleBox(mesh, z, r, floorY - 0.02, 1.6); }
  underframe(mesh, frameHalf, W, floorY, 0.32, L);
  // the body: steel side and end walls, the floor, the top rails
  const hw = W / 2, h = top - floorY;
  for (const side of [1, -1]) {
    mesh.box(side * (hw - 0.02), floorY + h / 2, 0, 0.03, h, frameHalf * 2 - 0.04, DB_BROWN, 0);
    mesh.box(side * (hw - 0.07), floorY + h / 2, 0, 0.01, h, frameHalf * 2 - 0.12, DB_BROWN, 0);
    weatherPanel(mesh, coarse, side, hw - 0.003, floorY, top, -frameHalf + 0.1, frameHalf - 0.1, side > 0 ? 11 : 13, RUST_BLEED);
    stencils(mesh, coarse, side, hw - 0.001, floorY + 0.06, -frameHalf + 0.1, frameHalf - 0.1);
    // the stakes: U-profiles outside every metre or so, the side doors' frame between the middle two
    const n = coarse ? 5 : 9;
    for (let k = 0; k < n; k++) {
      const z = -frameHalf + 0.15 + (k / (n - 1)) * (frameHalf * 2 - 0.3);
      // (round 3) sharp: a 1 cm chamfer on a 7 cm stake is under a pixel at any yard distance and cost 32 triangles
      mesh.box(side * (hw + 0.035), floorY + h / 2, z, 0.07, h, 0.09, DB_BROWN, 0);
    }
    mesh.box(side * (hw + 0.02), top - 0.04, 0, 0.1, 0.08, frameHalf * 2, DB_BROWN, 0);
    if (!coarse) {
      mesh.dressing(() => {
        // the side door's hinges and the door seams
        for (const z of [-0.8, 0.8]) mesh.box(side * (hw + 0.005), floorY + h / 2, z, 0.01, h - 0.1, 0.02, FRAME_BLACK, 0);
        mesh.box(side * (hw + 0.005), floorY + h * 0.75, 0, 0.012, 0.05, 1.5, FRAME_BLACK, 0);
      });
    }
  }
  for (const end of [1, -1]) {
    mesh.box(0, floorY + h / 2, end * (frameHalf - 0.02), W - 0.04, h, 0.03, DB_BROWN, 0);
    mesh.box(0, floorY + h / 2, end * (frameHalf - 0.08), W - 0.14, h, 0.01, DB_BROWN, 0);
    for (const x of [-0.9, 0, 0.9]) mesh.box(x, floorY + h / 2, end * (frameHalf + 0.03), 0.09, h, 0.06, DB_BROWN, 0);
  }
  mesh.box(0, floorY + 0.03, 0, W - 0.06, 0.06, frameHalf * 2 - 0.06, FRAME_BLACK, 0);
  // the load: coal heaped over the top rails, a ridge along the middle; round 5 (wave 278: "a flat dark-grey lid flush
  // with the sides… black cubes"): it comes up to the rims and crowns 0.35 m over them in three chute dumps, granular,
  // its lumps rough, some spilled on the rails and its dust down the sides
  coalHeap(mesh, coarse, top, frameHalf, W, 0.05, 0.42, 1, { grid: [34, 16], peaks: 3, lumps: 96, spill: hw + 0.07 });
}

function g10(mesh: VehicleMesh, coarse: boolean): void {
  const L = ROLLING_STOCK_LENGTH.g10, W = ROLLING_STOCK_BODY.g10.w, frameHalf = 3.85, floorY = 1.25, eave = 3.3, ridge = 3.9;
  const r = 0.5;
  for (const z of [-2.0, 2.0]) { wheelset(mesh, z, r, true); axleBox(mesh, z, r, floorY - 0.02, 1.6); }
  underframe(mesh, frameHalf, W, floorY, 0.3, L);
  const hw = W / 2, h = eave - floorY, bodyL = frameHalf * 2 + 0.1;
  // the planked sides and ends: vertical boards on a steel frame, the frame's diagonals outside
  for (const side of [1, -1]) {
    mesh.box(side * (hw - 0.03), floorY + h / 2, 0, 0.05, h, bodyL, DB_BROWN_WOOD, 0);
    weatherPanel(mesh, coarse, side, hw - 0.003, floorY, eave, -bodyL / 2 + 0.1, bodyL / 2 - 0.1, side > 0 ? 31 : 33, WATER_STAIN);
    // (6 mm proud of the planking's weathering: its streaks lie at hw, the grime at hw - 1.5 mm)
    stencils(mesh, coarse, side, hw + 0.002, floorY + 0.14, -bodyL / 2 + 0.15, bodyL / 2 - 0.15);
    // (round 3) the louvred vents high in the side panels, and the door's handle bars and latch
    if (!coarse) mesh.dressing(() => {
      for (const z of [-bodyL / 2 + 0.75, bodyL / 2 - 0.75]) {
        mesh.box(side * (hw + 0.01), eave - 0.42, z, 0.03, 0.42, 0.62, FRAME_BLACK, 0);
        for (let k = 0; k < 4; k++) mesh.box(side * (hw + 0.03), eave - 0.6 + k * 0.11, z, 0.02, 0.03, 0.58, GEAR_STEEL, 0);
      }
      for (const z of [-0.88, 0.88]) mesh.box(side * (hw + 0.1), floorY + h / 2, z, 0.035, 0.7, 0.035, GEAR_STEEL, 0);
      mesh.box(side * (hw + 0.1), floorY + h / 2 + 0.05, 0.6, 0.04, 0.1, 0.26, GEAR_STEEL, 0);
    });
    if (!coarse) {
      mesh.dressing(() => {
        const boards = 24;
        for (let k = 1; k < boards; k++) {
          const z = -bodyL / 2 + (k / boards) * bodyL;
          if (Math.abs(z) < 1.05) continue;
          mesh.box(side * (hw + 0.0), floorY + h / 2, z, 0.008, h - 0.06, 0.012, FRAME_BLACK, 0);
        }
      });
    }
    // the frame: corner and door posts, the eaves rail, the diagonals (a G 10's braced panels)
    for (const z of [-bodyL / 2 + 0.06, -1.05, 1.05, bodyL / 2 - 0.06]) mesh.box(side * (hw + 0.02), floorY + h / 2, z, 0.05, h, 0.1, FRAME_BLACK, 0);
    mesh.box(side * (hw + 0.02), eave - 0.04, 0, 0.06, 0.08, bodyL, FRAME_BLACK, 0);
    mesh.box(side * (hw + 0.02), floorY + 0.06, 0, 0.06, 0.12, bodyL, FRAME_BLACK, 0);
    for (const end of [1, -1]) {
      beam(mesh, [side * (hw + 0.03), floorY + 0.1, end * (bodyL / 2 - 0.1)], [side * (hw + 0.03), eave - 0.1, end * 1.15], 0.04, 0.08, FRAME_BLACK, false, [side, 0, 0]);
      beam(mesh, [side * (hw + 0.03), floorY + 0.1, end * 1.15], [side * (hw + 0.03), eave - 0.1, end * (bodyL / 2 - 0.1)], 0.04, 0.08, FRAME_BLACK, false, [side, 0, 0]);
    }
    // the sliding door and its rails, the door as weathered as the side it hangs on
    mesh.box(side * (hw + 0.06), floorY + h / 2 - 0.05, 0, 0.05, h - 0.2, 2.0, DB_BROWN_WOOD, coarse ? 0 : 0.01);
    weatherPanel(mesh, coarse, side, hw + 0.088, floorY + 0.05, eave - 0.15, -0.98, 0.98, side > 0 ? 35 : 37, WATER_STAIN);
    // (round 3, wave 234: "sliding doors") the door's steel frame round its edge and its diagonal brace
    if (!coarse) mesh.dressing(() => {
      const xd = side * (hw + 0.091), n: Vec3 = [side, 0, 0], yb = floorY + 0.15, yt = eave - 0.25, t = 0.05;
      face4(mesh, [[xd, yb, -1.0], [xd, yb, 1.0], [xd, yb + t, 1.0], [xd, yb + t, -1.0]], n, FRAME_BLACK);
      face4(mesh, [[xd, yt - t, -1.0], [xd, yt - t, 1.0], [xd, yt, 1.0], [xd, yt, -1.0]], n, FRAME_BLACK);
      for (const z of [-1.0, 1.0 - t]) face4(mesh, [[xd, yb, z], [xd, yb, z + t], [xd, yt, z + t], [xd, yt, z]], n, FRAME_BLACK);
      // (inside the door rails' reach, hw + 0.125: the wagon's width record)
      beam(mesh, [side * (hw + 0.1), yb + 0.05, -0.95], [side * (hw + 0.1), yt - 0.05, 0.95], 0.03, 0.04, FRAME_BLACK, false, [side, 0, 0]);
    });
    mesh.box(side * (hw + 0.1), eave - 0.12, 0, 0.05, 0.06, 4.2, FRAME_BLACK, 0);
    mesh.box(side * (hw + 0.1), floorY + 0.12, 0, 0.05, 0.05, 4.2, FRAME_BLACK, 0);
  }
  for (const end of [1, -1]) {
    mesh.box(0, floorY + h / 2, end * (bodyL / 2 - 0.03), W - 0.06, h, 0.05, DB_BROWN_WOOD, 0);
    // the gable under the roof's arch
    const pts: Vec3[] = [];
    const n = coarse ? 4 : 8;
    for (let k = 0; k <= n; k++) {
      const a = Math.PI * (k / n);
      pts.push([Math.cos(a) * hw, eave + (ridge - eave) * Math.sin(a), end * (bodyL / 2 - 0.03)]);
    }
    const c = mesh.vert(0, eave, end * (bodyL / 2 - 0.03), 0, 0, end, DB_BROWN_WOOD);
    const ring = pts.map((q) => mesh.vert(q[0], q[1], q[2], 0, 0, end, DB_BROWN_WOOD));
    for (let k = 0; k < n; k++) end > 0 ? mesh.tri(c, ring[k], ring[k + 1]) : mesh.tri(c, ring[k + 1], ring[k]);
  }
  // the arched roof, overhanging the sides and ends a little
  const ar = coarse ? 8 : 14;
  mesh.grid(4, ar, (i, j, out) => {
    const a = Math.PI * (j / ar);
    out[0] = Math.cos(a) * (hw + 0.07);
    out[1] = eave - 0.02 + (ridge - eave + 0.04) * Math.sin(a);
    out[2] = (i / 4 - 0.5) * (bodyL + 0.16);
    // (round 3) i along z, j over the arch from +x: i x j points down, so the outer skin is the flipped one
  }, () => ROOF_GREY, { flip: true });
  mesh.grid(4, ar, (i, j, out) => {
    const a = Math.PI * (j / ar);
    out[0] = Math.cos(a) * (hw + 0.065);
    out[1] = eave - 0.04 + (ridge - eave + 0.04) * Math.sin(a);
    out[2] = (i / 4 - 0.5) * (bodyL + 0.16);
  }, () => ROOF_GREY, {});
}

function tank(mesh: VehicleMesh, coarse: boolean): void {
  const L = ROLLING_STOCK_LENGTH.tank, W = 2.6, frameHalf = 3.8, floorY = 1.25, R = 1.05, axisY = floorY + 0.2 + R;
  const r = 0.5;
  for (const z of [-2.25, 2.25]) { wheelset(mesh, z, r, false); axleBox(mesh, z, r, floorY - 0.02, 1.5); }
  underframe(mesh, frameHalf, W, floorY, 0.3, L);
  // the barrel with its dished ends, on two cradles, held down by straps
  const half = 3.7;
  mesh.push().translate(0, axisY, 0).rotateY(Math.PI / 2);
  const segs = coarse ? 12 : 18;
  mesh.lathe([[0.0001, -half - 0.3], [R * 0.55, -half - 0.24], [R * 0.88, -half - 0.12], [R, -half], [R, half], [R * 0.88, half + 0.12],
    [R * 0.55, half + 0.24], [0.0001, half + 0.3]], segs, () => TANK_BLACK);
  mesh.pop();
  for (const z of [-2.4, 2.4]) {
    mesh.box(0, floorY + 0.12, z, W - 0.3, 0.24, 0.3, FRAME_BLACK, 0.01);
    if (!coarse) mesh.dressing(() => {
      const strap: Vec3[] = [];
      for (let k = 0; k <= 10; k++) { const a = Math.PI * (k / 10); strap.push([Math.cos(a) * (R + 0.018), axisY + Math.sin(a) * (R + 0.018), z]); }
      mesh.tube(strap, 0.02, 4, RAIL_GREY, { caps: true });
    });
  }
  // (round 4, wave 260: "no… riveted bands") the barrel's riveted seams, raised rings a shade lighter than the black
  if (!coarse) {
    for (const z of [-3.3, -1.5, 1.5, 3.3]) {
      mesh.push().translate(0, axisY, z).rotateY(Math.PI / 2);
      mesh.lathe([[R + 0.002, -0.04], [R + 0.016, -0.022], [R + 0.016, 0.022], [R + 0.002, 0.04]], 12, () => TANK_BAND);
      mesh.pop();
    }
  }
  // the dome and its manhole (round 3: the dome upright and outward; it lay on its side, inside out, the lathe turning
  // about x); (round 4, wave 260: "no ladders, catwalks") the railed platform round the dome, and a ladder up each side
  // from the solebar to it, bent over the barrel's shoulder
  mesh.push().translate(0, axisY + R - 0.05, 0).rotateZ(Math.PI / 2);
  mesh.lathe([[0.36, 0], [0.36, 0.38], [0.3, 0.44], [0.0001, 0.46]], coarse ? 10 : 16, () => TANK_BLACK);
  mesh.pop();
  const deck = axisY + R + 0.03, P = 0.7;
  mesh.box(0, deck, 0, P * 2, 0.04, P * 2, GRATING, 0);
  for (const end of [1, -1]) for (const sx of [1, -1]) beam(mesh, [sx * 0.55, axisY + R * 0.82, end * 0.55], [sx * 0.55, deck - 0.02, end * 0.55], 0.04, 0.04, FRAME_BLACK);
  if (!coarse) mesh.dressing(() => {
    const top = deck + 0.42, rail = (a: Vec3, b: Vec3) => mesh.tube([a, b], 0.018, 4, HANDRAIL, { caps: true });
    for (const end of [1, -1]) rail([-P, top, end * P], [P, top, end * P]);
    // the sides' rails stop short of the ladders' heads (at z 0.15-0.55)
    for (const sx of [1, -1]) rail([sx * P, top, -P], [sx * P, top, 0.1]);
    for (const sx of [1, -1]) for (const end of [1, -1]) mesh.box(sx * P, deck + 0.21, end * P, 0.03, 0.42, 0.03, HANDRAIL, 0);
    for (const sx of [1, -1]) mesh.box(sx * P, deck + 0.21, 0.1, 0.03, 0.42, 0.03, HANDRAIL, 0);
  });
  for (const sx of [1, -1]) {
    const lad = (dz: number): Vec3[] => [[sx * 1.2, floorY + 0.12, 0.35 + dz], [sx * 1.2, axisY + 0.25, 0.35 + dz],
      [sx * 1.02, axisY + 0.78, 0.35 + dz], [sx * (P + 0.06), deck + 0.02, 0.35 + dz]];
    for (const dz of [-0.2, 0.2]) mesh.tube(lad(dz), 0.018, 4, HANDRAIL, { caps: !coarse });
    for (let k = 0; k < 6; k++) {
      const y = floorY + 0.35 + k * 0.33;
      if (y > axisY + 0.25) break;
      mesh.box(sx * 1.2, y, 0.35, 0.03, 0.03, 0.4, HANDRAIL, 0);
    }
  }
  tankWeathering(mesh, coarse, axisY, R, half, 0.36, 5);
  tankFittings(mesh, coarse, axisY, R, half, 0.36, axisY + R - 0.05 + 0.46);
}

/**
 * A hood (or a cab) with its roof's edges rounded (round 4, wave 260: the V60 "a flat-shaded red box"): its section
 * swept along z from z0 to z1 and both ends closed, `rc` the roof edges' radius; it stands on y0, h tall, w wide.
 */
function roundedHood(mesh: VehicleMesh, coarse: boolean, z0: number, z1: number, y0: number, h: number, w: number, rc: number, m: Mat): void {
  const n = coarse ? 2 : 4, section: [number, number][] = [[w / 2, 0]];
  for (let k = 0; k <= n; k++) { const a = (k / n) * (Math.PI / 2); section.push([w / 2 - rc + Math.cos(a) * rc, h - rc + Math.sin(a) * rc]); }
  for (let k = 0; k <= n; k++) { const a = Math.PI / 2 + (k / n) * (Math.PI / 2); section.push([-w / 2 + rc + Math.cos(a) * rc, h - rc + Math.sin(a) * rc]); }
  section.push([-w / 2, 0]);
  mesh.sweep([[0, y0, z0], [0, y0, z1]], section, () => m);
  for (const [z, s] of [[z1, 1], [z0, -1]] as const) {
    const pts = section.map(([x, y]) => [x, y0 + y, z] as Vec3);
    mesh.polygon(s > 0 ? pts : [...pts].reverse(), m);
  }
}

function v60(mesh: VehicleMesh, coarse: boolean): void {
  const L = ROLLING_STOCK_LENGTH.v60, W = ROLLING_STOCK_BODY.v60.w, frameHalf = 4.6, frameTop = 1.42;
  const r = 0.625;
  // three coupled axles on plain disc wheels, the jackshaft behind the last, the coupling rods outside
  // (round 4, wave 260: "three bare wheels… no coupling rods, jackshaft": the solebars hung 0.62 m deep and an outside
  // plate frame over the wheels hid the rods and the upper wheels; the frame now stands over the running gear as the
  // locomotive's does, its plates inside the wheels, so the wheels, the cranks and the rods show whole)
  for (const z of [-2.2, 0, 2.2]) wheelset(mesh, z, r, false);
  // (round 5, wave 278: "plain black disc wheels") each wheel's tyre rim painted white on its outer face and a
  // counterweight on its disc opposite the crank (the crank at the top: the weight below the hub)
  if (!coarse) {
    for (const z of [-2.2, 0, 2.2]) for (const side of [1, -1]) {
      mesh.push().translate(side * 0.79, r, z).scale(side, 1, 1);
      mesh.lathe([[r - 0.012, 0.004], [r - 0.07, 0.004]], 14, () => TYRE_WHITE);
      mesh.pop();
      mesh.box(side * 0.785, r - 0.3, z, 0.03, 0.18, 0.42, GEAR_STEEL, 0);
    }
  }
  underframe(mesh, frameHalf, W, frameTop, 0.25, L);
  const pin = r + 0.22, xCrank = 0.85, xPin = 0.9, xRod = 0.94;
  for (const side of [1, -1]) {
    // the inner frame plates, the jackshaft's gear case between them
    mesh.box(side * 0.55, frameTop - 0.45, 0, 0.05, 0.6, frameHalf * 2 - 0.6, FRAME_BLACK, 0);
    // a crank on each axle end and on the jackshaft, its pin at the top, the rod over the pins with its bosses
    for (const z of [-2.2, 0, 2.2, -3.5]) {
      const jack = z === -3.5;
      if (jack) {
        // the jackshaft's crank disc, its counterweight opposite the pin
        mesh.push().translate(side * (xCrank - 0.02), r, z).scale(side, 1, 1);
        mesh.lathe([[0.36, -0.03], [0.36, 0.03], [0.0001, 0.03]], coarse ? 10 : 14, () => FRAME_BLACK);
        mesh.pop();
        mesh.box(side * (xCrank + 0.02), r - 0.2, z, 0.04, 0.16, 0.42, GEAR_STEEL, 0);
      }
      // the crank's web from the axle's boss up to the pin (the pin itself under the rod's boss); the bosses face out
      // (their backs against the wheel and the rod never show)
      beam(mesh, [side * xCrank, r - 0.06, z], [side * (xPin + 0.02), pin + 0.06, z], 0.05, 0.15, GEAR_STEEL);
      mesh.push().translate(side * xCrank, r, z).scale(side, 1, 1);
      mesh.lathe([[0.11, -0.04], [0.11, 0.04], [0.0001, 0.04]], 8, () => GEAR_STEEL);
      mesh.pop();
      mesh.push().translate(side * (xRod + 0.03), pin, z).scale(side, 1, 1);
      mesh.lathe([[0.1, -0.02], [0.1, 0.02], [0.0001, 0.02]], coarse ? 6 : 10, () => V60_ROD);
      mesh.pop();
    }
    beam(mesh, [side * xRod, pin, -3.5], [side * xRod, pin, 2.2], 0.05, 0.17, V60_ROD);
    // (round 5, wave 278: "no… sand boxes") the sand boxes on the frame over the outer wheels, their filler caps
    for (const z of [-2.2 - 0.62, 2.2 + 0.62]) {
      mesh.box(side * 1.18, frameTop - 0.32, z, 0.28, 0.42, 0.34, FRAME_BLACK, 0);
      if (!coarse) mesh.box(side * 1.18, frameTop - 0.08, z, 0.12, 0.05, 0.12, GEAR_STEEL, 0);
    }
    // the jackshaft's gear case behind the frame, between the plates
    if (side > 0) mesh.box(0, r + 0.15, -3.5, 1.05, 0.7, 0.62, FRAME_BLACK, coarse ? 0 : 0.03);
    // (round 3, wave 234: "steps") the end steps: two treads, worn bright, between their hangers at each corner; (round
    // 4, wave 260: "no handrails") a handrail up beside each, turning in over the walkway
    for (const end of [1, -1]) {
      const xs = side * (W / 2 - 0.15), zs = end * (frameHalf - 0.35);
      for (const y of [0.42, 0.88]) mesh.box(xs, y, zs, 0.3, 0.04, 0.38, GEAR_STEEL, 0);
      for (const s2 of [-1, 1]) mesh.box(xs, (0.38 + frameTop) / 2, zs + s2 * 0.2, 0.3, frameTop - 0.38, 0.025, FRAME_BLACK, 0);
      if (!coarse) mesh.dressing(() => {
        const x = side * (W / 2 - 0.04), z = zs - end * 0.24;
        mesh.tube([[x, 0.62, z], [x, frameTop + 0.95, z], [x - side * 0.3, frameTop + 0.95, z]], 0.02, 5, HANDRAIL, { caps: true });
      });
    }
    // the deeper buffer beams at the ends (the buffers stand on them)
    for (const end of [1, -1]) if (side > 0) mesh.box(0, (0.86 + frameTop) / 2, end * (frameHalf - 0.06), W - 0.1, frameTop - 0.86, 0.12, FRAME_BLACK, 0.01);
  }
  // the walkway plate over the frame, the long hood ahead, the cab, the short hood astern
  mesh.box(0, frameTop + 0.02, 0, W, 0.05, frameHalf * 2, FRAME_BLACK, 0.01);
  const RC = 0.3;
  const hood = (z0: number, z1: number, h: number, w: number) => {
    roundedHood(mesh, coarse, z0, z1, frameTop, h, w, RC, V60_RED);
    // its louvres: (round 5, wave 278: "no louvres") a black panel per door, eight pale slats across it, so the grilles
    // read at a yard's distance
    if (!coarse) mesh.dressing(() => {
      for (const side of [1, -1]) for (let k = 0; k < Math.floor((z1 - z0) / 0.7); k++) {
        const zc = z0 + 0.35 + k * 0.7, yc = frameTop + h * 0.5, hh = h * 0.21, x = side * (w / 2 + 0.004), n: Vec3 = [side, 0, 0];
        face4(mesh, [[x, yc - hh, zc - 0.25], [x, yc - hh, zc + 0.25], [x, yc + hh, zc + 0.25], [x, yc + hh, zc - 0.25]], n, FRAME_BLACK);
        const xs = side * (w / 2 + 0.008);
        for (let s2 = 0; s2 < 8; s2++) {
          const y0 = yc - hh + 0.04 + (s2 / 8) * (2 * hh - 0.04), y1 = y0 + (2 * hh - 0.08) / 16;
          face4(mesh, [[xs, y0, zc - 0.22], [xs, y0, zc + 0.22], [xs, y1, zc + 0.22], [xs, y1, zc - 0.22]], n, LOUVRE_SLAT);
        }
      }
    });
    // (round 2, wave 152: "a toy", "no handrails… or grime") the grab rail along each side on its brackets, the
    // working grime low on the hood and streaks down from its roof's edge
    for (const side of [1, -1]) {
      weatherPanel(mesh, coarse, side, w / 2 + 0.009, frameTop + 0.05, frameTop + h - RC, z0 + 0.05, z1 - 0.05, (side > 0 ? 51 : 53) + Math.round(z0), linearMat(0x4a1c18));
      if (!coarse) mesh.dressing(() => {
        const x = side * (w / 2 + 0.08), y = frameTop + h * 0.32;
        mesh.tube([[x, y, z0 + 0.25], [x, y, z1 - 0.25]], 0.022, 5, HANDRAIL, { caps: true });
        const n = Math.max(2, Math.round((z1 - z0) / 1.2) + 1);
        for (let k = 0; k < n; k++) {
          const z = z0 + 0.25 + ((z1 - z0 - 0.5) * k) / (n - 1);
          mesh.box(side * (w / 2 + 0.04), y, z, 0.08, 0.03, 0.03, HANDRAIL, 0);
        }
      });
    }
  };
  hood(0.55, 4.45, 2.0, 1.85);
  hood(-4.4, -2.0, 1.65, 1.85);
  // the radiator grille at the long hood's nose; (round 4, wave 260: "no… exhaust") the exhaust stack, a flared pipe
  // standing proud of the hood's roof, sooted
  mesh.box(0, frameTop + 1.0, 4.46, 1.5, 1.4, 0.03, FRAME_BLACK, 0);
  mesh.push().translate(0, frameTop + 1.98, 2.4).rotateZ(Math.PI / 2);
  mesh.lathe([[0.16, 0], [0.13, 0.06], [0.12, 0.34], [0.15, 0.42], [0.0001, 0.42]], coarse ? 8 : 12, () => SOOT);
  mesh.pop();
  // the cab: its section rounded as the hoods', windows in its sides and ends, the roof sheet on its crown
  const cz0 = -2.0, cz1 = 0.55, cabTop = 4.0;
  roundedHood(mesh, coarse, cz0, cz1, frameTop, cabTop - frameTop, W - 0.1, 0.32, V60_RED);
  mesh.box(0, cabTop + 0.015, (cz0 + cz1) / 2, W - 0.8, 0.03, cz1 - cz0 + 0.12, FRAME_BLACK, 0);
  for (const side of [1, -1]) {
    for (const z of [-1.35, -0.3]) {
      mesh.box(side * ((W - 0.1) / 2 + 0.006), cabTop - 0.75, z, 0.012, 0.75, 0.75, V60_GLASS, 0);
      // (round 5) its frame and the sky's highlight across it, so it reads as glass and not a hole
      if (!coarse) mesh.dressing(() => {
        const x = side * ((W - 0.1) / 2 + 0.014), n: Vec3 = [side, 0, 0], y0 = cabTop - 1.125, y1 = cabTop - 0.375, za = z - 0.375, zb = z + 0.375, t = 0.04;
        face4(mesh, [[x, y0, za], [x, y0, zb], [x, y0 + t, zb], [x, y0 + t, za]], n, V60_FRAME);
        face4(mesh, [[x, y1 - t, za], [x, y1 - t, zb], [x, y1, zb], [x, y1, za]], n, V60_FRAME);
        face4(mesh, [[x, y0, za], [x, y0, za + t], [x, y1, za + t], [x, y1, za]], n, V60_FRAME);
        face4(mesh, [[x, y0, zb - t], [x, y0, zb], [x, y1, zb], [x, y1, zb - t]], n, V60_FRAME);
        face4(mesh, [[x, y0 + 0.2, za + 0.12], [x, y0 + 0.32, za + 0.12], [x, y1 - 0.12, zb - 0.2], [x, y1 - 0.24, zb - 0.2]], n, V60_GLASS_HI);
      });
    }
    // the cab door's grab handles either side of it
    if (!coarse) mesh.dressing(() => {
      for (const z of [cz0 + 0.12, cz1 - 0.12]) mesh.tube([[side * ((W - 0.1) / 2 + 0.06), frameTop + 0.4, z], [side * ((W - 0.1) / 2 + 0.06), frameTop + 1.7, z]], 0.018, 5, HANDRAIL, { caps: true });
    });
  }
  for (const end of [1, -1]) {
    for (const x of [-0.85, 0.85]) {
      const zf = end > 0 ? cz1 + 0.006 : cz0 - 0.006;
      mesh.box(x, cabTop - 0.7, zf, 0.6, 0.65, 0.012, V60_GLASS, 0);
      if (!coarse) mesh.dressing(() => {
        const z = end > 0 ? cz1 + 0.014 : cz0 - 0.014, n: Vec3 = [0, 0, end], y0 = cabTop - 1.025, y1 = cabTop - 0.375, xa = x - 0.3, xb = x + 0.3, t = 0.04;
        face4(mesh, [[xa, y0, z], [xb, y0, z], [xb, y0 + t, z], [xa, y0 + t, z]], n, V60_FRAME);
        face4(mesh, [[xa, y1 - t, z], [xb, y1 - t, z], [xb, y1, z], [xa, y1, z]], n, V60_FRAME);
        face4(mesh, [[xa, y0, z], [xa + t, y0, z], [xa + t, y1, z], [xa, y1, z]], n, V60_FRAME);
        face4(mesh, [[xb - t, y0, z], [xb, y0, z], [xb, y1, z], [xb - t, y1, z]], n, V60_FRAME);
      });
    }
  }
  // the buffer beams' warning stripes
  if (!coarse) mesh.dressing(() => {
    for (const end of [1, -1]) for (let k = 0; k < 6; k++) {
      mesh.box(-1.25 + k * 0.5, frameTop - 0.28, end * (frameHalf + 0.005), 0.24, 0.5, 0.01, WARN_YELLOW, 0);
    }
  });
  // (round 4, wave 260: "no… lamps") the DB's three: two low at the hood end's corners under the grille, one high in
  // the middle of it, each in its black housing
  for (const end of [1, -1]) {
    const zEnd = end > 0 ? 4.46 : -4.41, hEnd = end > 0 ? 2.0 : 1.65;
    for (const [x, y] of [[-0.72, frameTop + 0.2], [0.72, frameTop + 0.2], [0, frameTop + hEnd - 0.32]] as const) {
      mesh.push().translate(x, y, zEnd).rotateY(end > 0 ? -Math.PI / 2 : Math.PI / 2);
      mesh.lathe([[0.14, -0.04], [0.14, 0.08], [0.0001, 0.1]], 8, (k) => (k >= 1 ? linearMat(0xe6dfc4) : FRAME_BLACK));
      mesh.pop();
    }
  }
  // (round 3, wave 234: "a horn") the two-tone horns on the cab roof, one each way
  for (const end of [1, -1]) {
    const zc = (cz0 + cz1) / 2 + end * 0.32;
    mesh.box(0.55, cabTop + 0.22, zc, 0.07, 0.07, 0.34, RAIL_GREY, 0);
    mesh.box(0.55, cabTop + 0.22, zc + end * 0.19, 0.15, 0.15, 0.04, RAIL_GREY, 0);
  }
  if (!coarse) mesh.dressing(() => {
    // the number plates under the cab windows: black, the figures in silver
    for (const side of [1, -1]) {
      const x = side * ((W - 0.1) / 2 + 0.008), zc = (cz0 + cz1) / 2;
      mesh.box(x, frameTop + 1.25, zc, 0.012, 0.18, 0.66, FRAME_BLACK, 0);
      for (let k = 0; k < 6; k++) {
        const z = zc - 0.25 + k * 0.1 + (k > 1 ? 0.03 : 0), xf = side * ((W - 0.1) / 2 + 0.016), n: Vec3 = [side, 0, 0];
        face4(mesh, [[xf, frameTop + 1.19, z], [xf, frameTop + 1.19, z + 0.06], [xf, frameTop + 1.31, z + 0.06], [xf, frameTop + 1.31, z]], n, RAIL_GREY);
      }
    }
    // the exhaust's soot on the long hood's top, drawn out astern
    const yTop = frameTop + 2.0 + 0.004, up: Vec3 = [0, 1, 0], ring: Vec3[] = [];
    for (let k = 0; k < 7; k++) {
      const t = (k / 7) * Math.PI * 2, rr = 0.34 + 0.16 * hash2(k, 61), back = Math.sin(t) < 0 ? 2.6 : 1.0;
      ring.push([Math.cos(t) * Math.min(rr, 0.6), yTop, 2.4 + Math.sin(t) * rr * back]);
    }
    for (let k = 0; k < 7; k++) {
      const a: Vec3 = [0, yTop, 2.4], b = ring[k], c = ring[(k + 1) % 7];
      const flip = dotV(crossV(sub(b, a), sub(c, a)), up) < 0;
      const va = mesh.vert(a[0], a[1], a[2], 0, 1, 0, SOOT), vb = mesh.vert(b[0], b[1], b[2], 0, 1, 0, SOOT), vc = mesh.vert(c[0], c[1], c[2], 0, 1, 0, SOOT);
      if (flip) mesh.tri(va, vc, vb); else mesh.tri(va, vb, vc);
    }
    // (round 5, wave 278: "no… exhaust staining") the stack's soot carried astern over the hood's roof and down its
    // rounded edges either side
    for (const side of [1, -1]) {
      // on the roof's rounded edge (radius 0.3 about (0.625, h - 0.3)), a centimetre proud, from 15 to 80 degrees off
      // the top, the stain narrowing as it runs down and astern
      const arc = (deg: number): Vec3 => { const a = (deg * Math.PI) / 180; return [side * (0.625 + Math.sin(a) * 0.31), frameTop + 1.7 + Math.cos(a) * 0.31, 0]; };
      const st = [arc(15), arc(48), arc(80)], zs = [[0.95, 2.6], [1.05, 2.45], [1.2, 2.2]] as const;
      for (let q = 0; q < 2; q++) {
        const a = st[q], b = st[q + 1], am = (15 + 32.5 * (q * 2 + 1)) * Math.PI / 180;
        const n: Vec3 = [side * Math.sin(am), Math.cos(am), 0];
        face4(mesh, [[a[0], a[1], zs[q][0]], [a[0], a[1], zs[q][1]], [b[0], b[1], zs[q + 1][1]], [b[0], b[1], zs[q + 1][0]]], n, SOOT);
      }
    }
    // (round 4, wave 260: "no… grime") oil weeping down the hood sides from the louvres, and the fuel filler's spill
    for (const side of [1, -1]) {
      for (let k = 0; k < 5; k++) {
        const z = 0.9 + k * 0.72 + 0.2 * hash2(k, side > 0 ? 81 : 83), w = 0.05 + 0.05 * hash2(k, 85), top = frameTop + 2.0 * 0.29;
        const len = 0.25 + 0.3 * hash2(k, 87), x = side * (1.85 / 2 + 0.013);
        face4(mesh, [[x, top, z - w / 2], [x, top, z + w / 2], [x, top - len, z + w * 0.15], [x, top - len, z - w * 0.15]], [side, 0, 0], OIL_STAIN);
      }
    }
  });
}

const MATS = new Map<number, Mat>();
function linearMat(hex: number): Mat {
  let m = MATS.get(hex);
  if (!m) { m = material('paint', linearHex(hex), 0.6, 0, 0, 1); MATS.set(hex, m); }
  return m;
}

/**
 * One vehicle of rolling stock: its geometry in the painted bucket's streams, the rail head at y = 0, centred on its
 * length over buffers. The colours carry the coalfield's weathering (soot and coal dust low, rust on the steel).
 */
export function buildRollingStock(kind: RollingStockKind, opts: { coarse?: boolean; seed?: number } = {}): THREE.BufferGeometry {
  const mesh = new VehicleMesh();
  const coarse = !!opts.coarse;
  mesh.coarse = coarse;
  if (kind === 'omm') omm(mesh, coarse);
  else if (kind === 'g10') g10(mesh, coarse);
  else if (kind === 'tank') tank(mesh, coarse);
  else if (kind === 'v60') v60(mesh, coarse);
  else if (kind === 'covered4') covered4(mesh, coarse);
  else if (kind === 'gondola4') gondola4(mesh, coarse);
  else if (kind === 'tank4') tank4(mesh, coarse);
  else tem1(mesh, coarse);
  const AXLES: Record<RollingStockKind, number[]> = {
    omm: [-3, 3], g10: [-2, 2], tank: [-2.25, 2.25], v60: [-2.2, 0, 2.2], covered4: [-5.9, -4.1, 4.1, 5.9],
    gondola4: [-5.3, -3.5, 3.5, 5.3], tank4: [-4.8, -2.9, 2.9, 4.8], tem1: [-6.45, -4.6, -2.75, 2.75, 4.6, 6.45],
  };
  const r = kind === 'v60' ? 0.625 : kind === 'tem1' ? 0.525 : kind === 'covered4' || kind === 'gondola4' || kind === 'tank4' ? 0.475 : 0.5;
  const axles = AXLES[kind];
  const g = mesh.build(vehicleWeathering({
    dirtRgb: linearHex(0x2a2622), dirt: 0.75, dirtTop: 1.4, dustRgb: linearHex(0x3a3632), dust: 0.25,
    rust: kind === 'v60' ? 0.25 : 0.6, wheels: axles.map((z) => ({ z, y: r, r })), seed: (opts.seed ?? 7) + kind.length * 31, voxelAo: !coarse,
  }));
  // the painted bucket's streams (no surface stream: the props' baked material reads colours alone)
  g.deleteAttribute('surf');
  delete g.userData.bodyBox;
  delete g.userData.noCollisionVertices;
  return g;
}
