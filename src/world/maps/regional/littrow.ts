// src/world/maps/regional/littrow.ts — Taurus-Littrow Station's kit (the Earthrise 228 rebuild, 2026-10-18; the owner,
// 2026-10-17: Earthrise rebuilt "the way Verdant was" — one regional kit that builds every planned building of the place in
// one style). The station is an oxygen-mining outpost of the 2040s on the floor of the Apollo 17 valley: pressurised
// modules laid on cradles under the regolith that shields them, the shielding coursed in geotextile bags at the ends and
// sintered blocks on the flanks; white multi-layer insulation dusted grey from the knees down, gold foil at the joints,
// safety orange at the hatches, dark solar cells, steel the colour of the dust. Every builder is keyed by a base plan id
// (as the kolkhoz and olympus kits are), so the placement harness, the plots and the base footprints work unchanged:
//   - barn          the habitat: a hab cylinder on cradles under a regolith berm, its airlock porch with two suitports and
//                   a dust-brush rack, radiators on struts over it, a light mast and a cable tray;
//   - cottage       the node: a short vertical drum with four docking collars, a cupola and a bagged regolith collar;
//   - schoolhouse   the rover garage: an arched hangar half sunk in its berm, a segmented door, charging pedestals, a wheel
//                   rack and (on some) a workshop jib arm;
//   - farmhouse     the cryogenic tank farm: two horizontal tanks on saddles behind a low berm, a radiator wing, the
//                   transfer lines and a filling station (the contents' band from where the farm stands);
//   - mill          the relay mast, the station's landmark: a 40 m banded lattice mast, its solar wing, its head's pod,
//                   beacons and dishes, the high-gain dish turned to the Earth;
//   - chapel        the sample lab: a small hab with a glovebox port, sample racks and an instrument mast;
//   - gantry        the offloading crane (after NASA's LSMS): a boom on a turret over a cargo pad, pallets under it;
//   - containerRow  the logistics modules on cradles, banked in regolith bags to their shoulders, soft cargo bags between;
//   - granary       the EVA tool locker of the yards.
// The kit borrows nothing from olympus.ts (Mars stays byte-identical); only the generic geometry helpers are shared.
// Solids are few and convex (the bodies, berms, pads and porches); the bags, ribs, rails, ports, cables and dishes are
// dressing, every member meeting its neighbours at both ends (kitConnectivity), every roof a hull may land on in the
// Moon's low gravity flat or convex.
import { PartSink, faceBox, normalize3, rgb, shade, type EmitOptions, type Face, type RegionalBucket, type Rgb, type Vec3 } from './geometry.ts';
import type { ArchitectureStyle, RegionalBuildContext, RegionalBuilder } from './types.ts';
import { EARTH_SKY } from '../earthriseStation.ts';

// the station palette: MLI white and its dusted foot, the bright panels, gold foil, safety orange, cells, steel
const MLI = rgb(0xdedcd6), DUSTED = rgb(0xb9b4aa), PANEL = rgb(0xeceae4), GOLD = rgb(0xc49a46), ORANGE = rgb(0xd46f2a);
const DARK = rgb(0x3e4349), STEEL = rgb(0x8d8a84), BLACK = rgb(0x24262a), O2_BLUE = rgb(0x4a7fb4);
const H2_RED = rgb(0xb4453a), RADIATOR = rgb(0xe4e6e6);
const M = 'structureMetal' as const;

const uvOffset = (ctx: RegionalBuildContext): [number, number] => [ctx.rng() * 7.31, ctx.rng() * 5.17];
const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);

/** The plot the base geometry reached (its centre and extents). */
function plot(ctx: RegionalBuildContext): { cx: number; cz: number; w: number; d: number; x0: number; x1: number; z0: number; z1: number } {
  const b = ctx.bounds;
  return { cx: (b.minX + b.maxX) / 2, cz: (b.minZ + b.maxZ) / 2, w: b.maxX - b.minX, d: b.maxZ - b.minZ, x0: b.minX, x1: b.maxX, z0: b.minZ, z1: b.maxZ };
}

/** A straight member from a to b, `t` square (a strut, a leg, a cable), every face kept. */
function bar(sink: PartSink, a: Vec3, b: Vec3, t: number, opts: EmitOptions): void {
  const d = normalize3([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
  const ref: Vec3 = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const out = normalize3([d[1] * ref[2] - d[2] * ref[1], d[2] * ref[0] - d[0] * ref[2], d[0] * ref[1] - d[1] * ref[0]]);
  sink.member(M, a, b, t, t, out, { ...opts, exposed: true }, t / 2);
}

/** A quad turned to face `want` (its winding swapped when it faces away). */
function quadFacing(sink: PartSink, bucket: RegionalBucket, a: Vec3, b: Vec3, c: Vec3, d: Vec3, want: Vec3, opts: EmitOptions): void {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  if (n[0] * want[0] + n[1] * want[1] + n[2] * want[2] >= 0) sink.quad(bucket, a, b, c, d, opts);
  else sink.quad(bucket, d, c, b, a, opts);
}

/**
 * A berm of sintered regolith blocks along z from z0 to z1 on one flank (side +1 or -1): its outer toe at `toeX`, its
 * crest `crestX` from the axis at `h` over the ground and its inner foot at `footX`, in `segs` convex segments whose crests
 * rise and fall a little (a bulldozed bank, not a ruled one). Solid.
 */
function berm(sink: PartSink, side: 1 | -1, cx: number, z0: number, z1: number, toeX: number, crestX: number, footX: number, h: number,
  segs: number, rng: () => number): void {
  const n = Math.max(1, segs), step = (z1 - z0) / n;
  // (round 3, 2026-10-18; the blind judge: "dark box blocks behind the half-cylinder habitats look unshaded") the outer
  // face in three facets, steep at the toe and rounding over to the crest as a dozed bank of regolith does, so the low
  // sun grades it from facet to facet instead of laying one flat shade over a ruled slab (convex: each facet flatter
  // than the one under it)
  const run = toeX - crestX;
  for (let k = 0; k < n; k++) {
    const hk = h * (0.93 + rng() * 0.12), za = z0 + k * step, zb = k === n - 1 ? z1 : za + step + 0.05;
    const s1 = toeX - run * 0.2, s2 = toeX - run * 0.52, s3 = crestX + Math.min(0.35, run * 0.12);
    const pts: Vec3[] = side > 0
      ? [[cx + footX, 0, za], [cx + toeX, 0, za], [cx + s1, hk * 0.5, za], [cx + s2, hk * 0.84, za], [cx + s3, hk, za], [cx + crestX, hk, za]]
      : [[cx - crestX, hk, za], [cx - s3, hk, za], [cx - s2, hk * 0.84, za], [cx - s1, hk * 0.5, za], [cx - toeX, 0, za], [cx - footX, 0, za]];
    // (the profile counter-clockwise seen from +z, extruded along +z)
    sink.prism('stone', pts.map(([x, y, z]): Vec3 => [x, y - 0.15, z]), [0, 0, 1], zb - za);
  }
}

/**
 * A course of regolith bags from a to b (the bags' ends on the line), `h` high and `depth` deep, its bottom at y0: white
 * geotextile filled with regolith, a little irregular, each bag its own box. Dressing over a solid core.
 */
function bagCourse(sink: PartSink, a: readonly [number, number], b: readonly [number, number], y0: number, h: number, depth: number,
  rng: () => number, mobile: boolean, pitch = 0.62): void {
  const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
  if (len < 0.3) return;
  const n = Math.max(1, Math.round(len / pitch)), ux = dx / len, uz = dz / len;
  const yaw = Math.atan2(ux, uz) - Math.PI / 2;
  // (a phone draws every bag's stream as the desktop does and keeps none of them: PartSink.dressing)
  sink.dressing(mobile, () => {
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n, x = a[0] + dx * t, z = a[1] + dz * t;
      const l = len / n - 0.05, hh = h * (0.9 + rng() * 0.16), dd = depth * (0.92 + rng() * 0.12), j = (rng() - 0.5) * 0.06;
      sink.placed(yaw + (rng() - 0.5) * 0.08, x - uz * j, y0, z + ux * j, () => {
        sink.span('plaster', -l / 2, 0, -dd / 2, l / 2, hh, dd / 2, { decor: true });
      });
    }
  });
}

/** A bagged wall's solid core and its bag courses: from a to b, `courses` courses each `h` high, battered inward. */
function bagWall(sink: PartSink, a: readonly [number, number], b: readonly [number, number], courses: number, depth: number,
  rng: () => number, mobile: boolean, h = 0.42): void {
  const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz), ux = dx / len, uz = dz / len;
  const yaw = Math.atan2(ux, uz) - Math.PI / 2, mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
  // the solid: the courses' envelope, stepped in twice up its height
  const top = courses * h, thirds = [0, Math.ceil(courses / 3), Math.ceil((2 * courses) / 3), courses];
  for (let s = 0; s < 3; s++) {
    const y0 = thirds[s] * h, y1 = thirds[s + 1] * h, inset = s * 0.1;
    if (y1 <= y0) continue;
    sink.placed(yaw, mx, 0, mz, () => sink.span('plaster', -len / 2 + inset, y0 - (s === 0 ? 0.12 : 0), -depth / 2 + inset, len / 2 - inset, y1, depth / 2 - inset * 0.5));
  }
  for (let c = 0; c < courses; c++) {
    const inset = (c / courses) * 0.2, off = (c % 2) * 0.31;
    const ca: [number, number] = [a[0] + ux * (inset + off * 0.5), a[1] + uz * (inset + off * 0.5)];
    const cb: [number, number] = [b[0] - ux * inset, b[1] - uz * inset];
    bagCourse(sink, ca, cb, c * h, h + 0.02, depth + 0.06 - inset * 0.5, rng, mobile);
  }
  void top;
}

/** A round hatch on a face pointing along +z at (x, y, z): its orange frame ring, the door, the handwheel. */
function hatchZ(sink: PartSink, x: number, y: number, z: number, r: number, out: 1 | -1): void {
  sink.cylinder(M, [x, y, z - (out < 0 ? 0.12 : 0)], 'z', 0.12, r + 0.12, 16, { colour: ORANGE, decor: true });
  sink.cylinder(M, [x, y, z + (out > 0 ? 0.12 : -0.18)], 'z', 0.06, r * 0.88, 16, { colour: PANEL, decor: true });
  sink.cylinder(M, [x, y, z + (out > 0 ? 0.18 : -0.24)], 'z', 0.04, r * 0.32, 8, { colour: DARK, decor: true, fine: true });
}

/** A dish of radius `r` and depth `depth`, its vertex at `c`, its bowl open toward `dir`: the bowl and its back. Dressing. */
function dish(sink: PartSink, c: Vec3, dir: Vec3, r: number, depth: number, colour: Rgb, mobile: boolean): void {
  const w = normalize3(dir), ref: Vec3 = Math.abs(w[1]) < 0.95 ? [0, 1, 0] : [1, 0, 0];
  const u = normalize3([ref[1] * w[2] - ref[2] * w[1], ref[2] * w[0] - ref[0] * w[2], ref[0] * w[1] - ref[1] * w[0]]);
  const v: Vec3 = [w[1] * u[2] - w[2] * u[1], w[2] * u[0] - w[0] * u[2], w[0] * u[1] - w[1] * u[0]];
  const segs = mobile ? 10 : 18, rings = mobile ? 2 : 4;
  const at = (k: number, i: number, back: number): Vec3 => {
    const rr = (r * k) / rings, a = (i / segs) * Math.PI * 2, zz = depth * (rr / r) * (rr / r) - back;
    return [c[0] + (u[0] * Math.cos(a) + v[0] * Math.sin(a)) * rr + w[0] * zz, c[1] + (u[1] * Math.cos(a) + v[1] * Math.sin(a)) * rr + w[1] * zz,
      c[2] + (u[2] * Math.cos(a) + v[2] * Math.sin(a)) * rr + w[2] * zz];
  };
  const back: Vec3 = [-w[0], -w[1], -w[2]];
  for (let k = 0; k < rings; k++) for (let i = 0; i < segs; i++) {
    const j = (i + 1) % segs;
    // the bowl faces out of its mouth (toward the axis and forward), the back faces away
    const mid = at(k + 0.5, i + 0.5, 0), toAxis: Vec3 = [c[0] + w[0] * depth * 2 - mid[0], c[1] + w[1] * depth * 2 - mid[1], c[2] + w[2] * depth * 2 - mid[2]];
    quadFacing(sink, M, at(k, i, 0), at(k, j, 0), at(k + 1, j, 0), at(k + 1, i, 0), toAxis, { colour, decor: true });
    quadFacing(sink, M, at(k, i, 0.04), at(k, j, 0.04), at(k + 1, j, 0.04), at(k + 1, i, 0.04), back, { colour: shade(colour, 0.82), decor: true });
  }
  // the rim's edge between the bowl and its back
  for (let i = 0; i < segs; i++) {
    const j = (i + 1) % segs, a0 = at(rings, i, 0), mid = at(rings, i + 0.5, 0);
    const outward: Vec3 = [mid[0] - c[0] - w[0] * depth, mid[1] - c[1] - w[1] * depth, mid[2] - c[2] - w[2] * depth];
    quadFacing(sink, M, a0, at(rings, j, 0), at(rings, j, 0.04), at(rings, i, 0.04), outward, { colour: shade(colour, 0.9), decor: true });
  }
  // the feed on its three struts at the focus, and the hub behind the vertex
  const focus: Vec3 = [c[0] + w[0] * depth * 1.6, c[1] + w[1] * depth * 1.6, c[2] + w[2] * depth * 1.6];
  for (let i = 0; i < 3; i++) bar(sink, at(rings, (i * segs) / 3, 0.02), focus, 0.025, { colour: STEEL, decor: true, fine: true });
  sink.span(M, focus[0] - 0.07, focus[1] - 0.07, focus[2] - 0.07, focus[0] + 0.07, focus[1] + 0.07, focus[2] + 0.07, { colour: DARK, decor: true });
}

/** The Earth's direction in a building's frame (the map's Earth, earthriseStation.ts EARTH_SKY), for its high-gain dishes. */
function earthLocal(ctx: RegionalBuildContext): Vec3 {
  const az = (EARTH_SKY.azimuthDeg * Math.PI) / 180, el = (EARTH_SKY.elevationDeg * Math.PI) / 180, yaw = ctx.yaw ?? 0;
  const wx = Math.sin(az) * Math.cos(el), wz = Math.cos(az) * Math.cos(el), c = Math.cos(yaw), s = Math.sin(yaw);
  // (props.ts turns a building's frame by +yaw about +Y into the world: the world direction turned back)
  return normalize3([wx * c - wz * s, Math.sin(el), wx * s + wz * c]);
}

// ------------------------------------------------------------------------------------------------------------ habitat

/** The habitat: a hab cylinder on cradles under its regolith berm, its airlock porch to the front (+z). */
const habitat: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, mobile = ctx.tier === 'mobile', P = plot(ctx), look = ctx.variant;
  const R = clamp(P.w * 0.245, 1.6, 2.1), ay = R + 0.55, cx = P.cx;
  const porchD = clamp(P.d * 0.17, 1.8, 2.4), zBack = P.z0 + 0.95, zFront = P.z1 - porchD + 0.25;
  const bermH = clamp(ay - 0.5, 1.5, 2.1);
  // the cradles under the hab (in the berm's shadow, seen at the porch)
  for (const t of [0.12, 0.5, 0.88]) {
    const z = zBack + (zFront - zBack) * t;
    sink.span(M, cx - R * 0.8, 0, z - 0.2, cx + R * 0.8, ay - R * 0.62, z + 0.2, { colour: DARK });
  }
  // the hab: its shell and its two shallow end domes, the MLI dusted from the knees down
  const hullColour = (p: Vec3): Rgb => (p[1] < ay - R * 0.15 ? DUSTED : MLI);
  sink.cylinder(M, [cx, ay, zBack], 'z', zFront - zBack, R, 20, { colourAt: hullColour, colour: MLI }, R, false);
  sink.revolve(M, [cx, ay, zBack - 0.55], 'z', [[0, 0.05], [0.14, R * 0.58], [0.34, R * 0.87], [0.55, R]], 20, { colourAt: hullColour, colour: MLI });
  sink.revolve(M, [cx, ay, zFront], 'z', [[0, R], [0.2, R * 0.9], [0.4, R * 0.62], [0.5, 0.05]], 20, { colourAt: hullColour, colour: MLI });
  // the berm on both flanks to the hab's shoulders: sintered blocks, its toe on the plot's side
  for (const s of [1, -1] as const) berm(sink, s, cx, P.z0 + 0.15, zFront + 0.1, P.w / 2 - 0.08, Math.sqrt(Math.max(0.2, R * R - (bermH - ay) ** 2)) - 0.05, R * 0.25, bermH, 3, rng);
  // the back: bagged courses across the end, to the dome's shoulder
  bagWall(sink, [cx - P.w / 2 + 0.25, P.z0 + 0.5], [cx + P.w / 2 - 0.25, P.z0 + 0.5], Math.round(clamp(ay / 0.42, 4, 6)), 0.8, rng, mobile);
  // (round 3, 2026-10-18; the blind judge: "dark box blocks behind the half-cylinder habitats look unshaded") the berm's
  // front ends bagged either side of the porch (clear of its suitports) as the back is, so the sintered bank's cut end is a coursed face of bags
  {
    const pwF = clamp(R * 1.5, 2.4, 3.0), zE = zFront + 0.42, courses = Math.max(3, Math.round(bermH / 0.42));
    for (const s of [1, -1]) if (P.w / 2 - pwF / 2 > 1.6) bagWall(sink, [cx + s * (pwF / 2 + 0.85), zE], [cx + s * (P.w / 2 - 0.12), zE], courses, 0.55, rng, mobile);
  }
  // the bag coping along each berm crest (dressing)
  for (const s of [1, -1]) {
    const x = cx + s * (Math.sqrt(Math.max(0.2, R * R - (bermH - ay) ** 2)) + 0.2);
    bagCourse(sink, [x, P.z0 + 1.1], [x, zFront - 0.2], bermH - 0.08, 0.34, 0.5, rng, mobile);
  }
  // the MLI's seams and the gold foil at the joints (dressing)
  sink.dressing(mobile, () => {
    for (let z = zBack + 1.6; z < zFront - 0.6; z += 1.8) sink.cylinder(M, [cx, ay, z - 0.04], 'z', 0.08, R + 0.025, 20, { colour: shade(MLI, 0.86), decor: true, fine: true });
    sink.cylinder(M, [cx, ay, zFront - 0.12], 'z', 0.24, R + 0.03, 20, { colour: GOLD, decor: true });
  });
  // the airlock porch: a panelled module on the hab's front, its hatch to the front and a suitport on each side
  const pw = clamp(R * 1.5, 2.4, 3.0), ph = clamp(ay + 0.4, 2.3, 2.8), pz0 = zFront - 0.15, pz1 = P.z1 - 0.2;
  sink.span(M, cx - pw / 2, 0, pz0, cx + pw / 2, ph, pz1, { colourAt: (p) => (p[1] < 0.8 ? DUSTED : PANEL), colour: PANEL });
  sink.span(M, cx - pw / 2 - 0.08, ph, pz0 - 0.05, cx + pw / 2 + 0.08, ph + 0.14, pz1 + 0.05, { colour: shade(PANEL, 0.9) });
  const front: Face = { origin: [cx, 0, pz1], u: [1, 0, 0], out: [0, 0, 1], width: pw };
  faceBox(sink, M, front, 0, 1.15, 0.03, 1.1, 1.9, 0.06, { colour: ORANGE, decor: true });
  faceBox(sink, M, front, 0, 1.12, 0.07, 0.86, 1.66, 0.04, { colour: PANEL, decor: true });
  faceBox(sink, M, front, 0.28, 1.15, 0.1, 0.06, 0.32, 0.04, { colour: DARK, decor: true, fine: true });
  faceBox(sink, M, front, 0, 1.6, 0.1, 0.36, 0.28, 0.02, { colour: BLACK, decor: true, fine: true });
  // the step at the hatch
  sink.span(M, cx - 0.7, 0, pz1 - 0.02, cx + 0.7, 0.22, pz1 + 0.16, { colour: STEEL, decor: true });
  for (const s of [1, -1]) {
    const side: Face = { origin: [cx + s * pw / 2, 0, (pz0 + pz1) / 2], u: [0, 0, -s], out: [s, 0, 0], width: pz1 - pz0 };
    // the suitport: its ring and the suit docked on it, back to the port (the backpack shell and the helmet's dome)
    faceBox(sink, M, side, 0, 1.35, 0.04, 0.95, 0.95, 0.08, { colour: ORANGE, decor: true });
    sink.dressing(mobile, () => {
      faceBox(sink, M, side, 0, 1.35, 0.3, 0.62, 0.78, 0.44, { colour: PANEL, decor: true });
      faceBox(sink, M, side, 0, 0.62, 0.34, 0.4, 0.66, 0.26, { colour: MLI, decor: true });
      const hx = cx + s * (pw / 2 + 0.36), hz = (pz0 + pz1) / 2;
      sink.revolve(M, [hx, 1.82, hz], 'y', [[0, 0.17], [0.1, 0.16], [0.2, 0.11], [0.26, 0.02]], 10, { colour: GOLD, decor: true });
      sink.cylinder(M, [hx, 1.74, hz], 'y', 0.09, 0.17, 10, { colour: PANEL, decor: true });
    });
  }
  // the dust-brush rack by the hatch (dressing)
  sink.dressing(mobile, () => {
    const bx = cx - pw / 2 + 0.25, bz = pz1 + 0.12;
    bar(sink, [bx, 0, bz], [bx, 1.4, bz], 0.05, { colour: STEEL, decor: true, fine: true });
    bar(sink, [bx - 0.02, 1.2, bz], [bx + 0.5, 1.2, bz], 0.04, { colour: STEEL, decor: true, fine: true });
    for (const x of [bx + 0.18, bx + 0.38]) sink.span(M, x - 0.05, 0.75, bz - 0.04, x + 0.05, 1.22, bz + 0.04, { colour: ORANGE, decor: true, fine: true });
  });
  // the radiators on struts over the hab (flat, so a hull landing in the low gravity finds no spike), the cable tray
  const top = ay + R, rz0 = zBack + 0.8, rz1 = zFront - 0.8;
  for (const s of [1, -1]) {
    const x = cx + s * R * 0.45;
    for (const z of [rz0 + 0.3, rz1 - 0.3]) bar(sink, [x, top - 0.25, z], [x + s * 0.5, top + 0.75, z], 0.07, { colour: STEEL, decor: true });
    sink.span(M, x + s * 0.5 - 0.6, top + 0.72, rz0, x + s * 0.5 + 0.6, top + 0.78, rz1, { colour: RADIATOR, decor: true });
    sink.dressing(mobile, () => {
      for (let z = rz0 + 0.45; z < rz1 - 0.2; z += 0.45) sink.span(M, x + s * 0.5 - 0.58, top + 0.78, z - 0.015, x + s * 0.5 + 0.58, top + 0.8, z + 0.015, { colour: shade(RADIATOR, 0.85), decor: true, fine: true });
    });
  }
  // the light mast at the back corner, its lamp head toward the porch, and the cable tray down the berm to it
  const mx = cx + (look() < 0.5 ? 1 : -1) * (P.w / 2 - 0.6), mz = P.z0 + 1.2;
  bar(sink, [mx, 0, mz], [mx, 5.6, mz], 0.12, { colour: STEEL, decor: true });
  sink.span(M, mx - 0.3, 5.45, mz - 0.1, mx + 0.3, 5.75, mz + 0.35, { colour: DARK, decor: true });
  sink.span(M, mx - 0.26, 5.48, mz + 0.35, mx + 0.26, 5.72, mz + 0.38, { colour: RADIATOR, decor: true, fine: true });
  sink.span(M, mx - 0.12, 0.45, mz + 0.06, mx + 0.12, 0.66, zFront, { colour: DARK, decor: true });
  // ports in the shell's crown, and on a few habitats a slumped bag course or a holed blanket (wear 0.15)
  sink.dressing(mobile, () => {
    for (const z of [zBack + (zFront - zBack) * 0.3, zBack + (zFront - zBack) * 0.7]) {
      for (const s of [1, -1]) {
        const a = s * 0.75, px = cx + Math.sin(a) * (R - 0.04), py = ay + Math.cos(a) * (R - 0.04);
        bar(sink, [px, py, z - 0.16], [px + Math.sin(a) * 0.09, py + Math.cos(a) * 0.09, z - 0.16], 0.3, { colour: BLACK, decor: true, fine: true });
      }
    }
  });
  // the blanket's longitudinal seams on the shell's vertices (18, 36 and 54 degrees off its crown), a handrail along each
  // shoulder on its standoffs, sintered blocks spilled at the berm's toes, the porch's lamp, window and Earth antenna
  sink.dressing(mobile, () => {
    for (const k of [-3, -2, -1, 1, 2, 3]) {
      const a = (k * Math.PI) / 10, ux = Math.sin(a), uy = Math.cos(a), r = R + 0.012;
      bar(sink, [cx + ux * r, ay + uy * r, zBack + 0.15], [cx + ux * r, ay + uy * r, zFront - 0.2], 0.026, { colour: shade(MLI, 0.82), decor: true, fine: true });
    }
    for (const s of [1, -1]) {
      const a = s * (2 * Math.PI) / 10, ux = Math.sin(a), uy = Math.cos(a), z0 = zBack + 0.6, z1 = zFront - 0.6, rr = R + 0.16;
      bar(sink, [cx + ux * rr, ay + uy * rr, z0], [cx + ux * rr, ay + uy * rr, z1], 0.035, { colour: ORANGE, decor: true, fine: true });
      for (let k = 0; k <= 3; k++) {
        const z = z0 + ((z1 - z0) * k) / 3;
        bar(sink, [cx + ux * (R - 0.02), ay + uy * (R - 0.02), z], [cx + ux * rr, ay + uy * rr, z], 0.03, { colour: STEEL, decor: true, fine: true });
      }
    }
    for (const s of [1, -1]) {
      for (let k = 0; k < 4; k++) {
        const z = P.z0 + 1.2 + k * (P.d - 2.6) / 3 + (rng() - 0.5) * 0.8, x = cx + s * (P.w / 2 - 0.35 - rng() * 0.3), sz = 0.25 + rng() * 0.2;
        sink.span('stone', x - sz, -0.1, z - sz * 0.8, x + sz, sz * 0.9, z + sz * 0.8, { decor: true });
      }
    }
    sink.span(M, cx - 0.28, ph - 0.32, pz1, cx + 0.28, ph - 0.14, pz1 + 0.14, { colour: DARK, decor: true });
    sink.span(M, cx - 0.24, ph - 0.3, pz1 + 0.14, cx + 0.24, ph - 0.16, pz1 + 0.15, { colour: RADIATOR, decor: true, fine: true });
    const wy = (2.1 + ph - 0.4) / 2;
    if (ph - 0.4 - 2.15 > 0.12) sink.span('glass', cx - 0.9, wy - 0.06, pz1 - 0.01, cx - 0.45, wy + 0.06, pz1 + 0.02, { decor: true });
    const e = earthLocal(ctx), ax0 = cx + pw / 2 - 0.35, az0 = pz0 + 0.45;
    bar(sink, [ax0, ph + 0.1, az0], [ax0, ph + 1.25, az0], 0.06, { colour: STEEL, decor: true });
    dish(sink, [ax0, ph + 1.25, az0], e, 0.38, 0.1, PANEL, mobile);
  });
  if (look() < 0.15) {
    const z = zBack + (zFront - zBack) * (0.3 + look() * 0.4);
    sink.span(M, cx - 0.5, top - 0.06, z - 0.6, cx + 0.5, top + 0.005, z + 0.6, { colour: GOLD, decor: true });
  }
  return sink.finish();
};

// --------------------------------------------------------------------------------------------------------------- node

/** The node: a short vertical drum with four docking collars, a cupola and a bagged regolith collar. */
const node: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, mobile = ctx.tier === 'mobile', P = plot(ctx);
  const r = clamp(Math.min(P.w, P.d) * 0.36, 1.7, 2.3), y0 = 0.35, h = clamp(P.d * 0.4, 3.0, 3.6), cx = P.cx, cz = P.cz;
  // the sintered ring footing and the drum, its dome and its cupola
  sink.cylinder('stone', [cx, -0.15, cz], 'y', y0 + 0.15, r + 0.45, 16);
  sink.cylinder(M, [cx, y0, cz], 'y', h, r, 20, { colourAt: (p) => (p[1] < y0 + 0.9 ? DUSTED : MLI), colour: MLI }, r, false);
  sink.revolve(M, [cx, y0 + h, cz], 'y', [[0, r], [0.42, r * 0.86], [0.78, r * 0.55], [0.95, 0.72]], 20, { colour: MLI });
  sink.cylinder(M, [cx, y0 + h + 0.9, cz], 'y', 0.42, 0.72, 12, { colour: PANEL });
  sink.cylinder('glass', [cx, y0 + h + 1.0, cz], 'y', 0.2, 0.735, 12, { decor: true });
  sink.cylinder(M, [cx, y0 + h + 0.9, cz], 'y', 0.05, 0.78, 12, { colour: GOLD, decor: true, fine: true });
  // the four docking collars out to the plot's sides, each with its hatch, the ±z ones tunnels to the neighbours' paths
  const ay = y0 + 1.25, rc = 0.82;
  sink.cylinder(M, [cx + r - 0.3, ay, cz], 'x', P.w / 2 - 0.12 - (r - 0.3), rc, 14, { colour: PANEL });
  sink.cylinder(M, [cx - P.w / 2 + 0.12, ay, cz], 'x', P.w / 2 - 0.12 - (r - 0.3), rc, 14, { colour: PANEL });
  sink.cylinder(M, [cx, ay, cz + r - 0.3], 'z', P.d / 2 - 0.12 - (r - 0.3), rc, 14, { colour: PANEL });
  sink.cylinder(M, [cx, ay, cz - P.d / 2 + 0.12], 'z', P.d / 2 - 0.12 - (r - 0.3), rc, 14, { colour: PANEL });
  // (the tunnels' saddles, and their hatch rings at the ends)
  for (const s of [1, -1]) {
    sink.span(M, cx - rc * 0.7, 0, cz + s * (P.d / 2 - 0.9) - 0.18, cx + rc * 0.7, ay - rc * 0.6, cz + s * (P.d / 2 - 0.9) + 0.18, { colour: DARK });
    // (each ring 4 cm proud of the collar's end, its hatch door 4 cm proud of the ring: no coplanar caps)
    sink.cylinder(M, [cx, ay, s > 0 ? cz + P.d / 2 - 0.28 : cz - P.d / 2 + 0.08], 'z', 0.2, rc + 0.1, 14, { colour: ORANGE, decor: true });
    sink.cylinder(M, [s > 0 ? cx + P.w / 2 - 0.28 : cx - P.w / 2 + 0.08, ay, cz], 'x', 0.2, rc + 0.1, 14, { colour: ORANGE, decor: true });
    sink.cylinder(M, [cx, ay, s > 0 ? cz + P.d / 2 - 0.1 : cz - P.d / 2 + 0.06], 'z', 0.04, rc * 0.72, 14, { colour: PANEL, decor: true, fine: true });
    sink.cylinder(M, [s > 0 ? cx + P.w / 2 - 0.1 : cx - P.w / 2 + 0.06, ay, cz], 'x', 0.04, rc * 0.72, 14, { colour: PANEL, decor: true, fine: true });
  }
  // the bagged regolith collar round the drum's foot: its solid ring and two courses of bags (dressing) between the collars
  sink.cylinder('plaster', [cx, -0.1, cz], 'y', 1.05, r + 0.42, 16, { decor: false }, r + 0.22);
  for (let c = 0; c < 2; c++) {
    const rr = r + 0.48 - c * 0.18, n = 16;
    for (let k = 0; k < n; k++) {
      const a0 = ((k + 0.5 * (c % 2)) / n) * Math.PI * 2, a1 = a0 + (Math.PI * 2) / n * 0.92;
      const mid = (a0 + a1) / 2;
      // (none under the collars)
      if (Math.min(...[0, Math.PI / 2, Math.PI, Math.PI * 1.5, Math.PI * 2].map((q) => Math.abs(mid - q))) < 0.45) { rng(); rng(); continue; }
      bagCourse(sink, [cx + Math.sin(a0) * rr, cz + Math.cos(a0) * rr], [cx + Math.sin(a1) * rr, cz + Math.cos(a1) * rr], c * 0.46, 0.46, 0.5, rng, mobile, 2);
    }
  }
  // the gold foil band at the drum's waist, the handrails up its side (dressing)
  sink.dressing(mobile, () => {
    sink.cylinder(M, [cx, y0 + h - 0.35, cz], 'y', 0.16, r + 0.02, 20, { colour: GOLD, decor: true });
    for (const a of [Math.PI / 4, (5 * Math.PI) / 4]) {
      const x = cx + Math.sin(a) * (r + 0.1), z = cz + Math.cos(a) * (r + 0.1);
      bar(sink, [x, y0 + 0.9, z], [x, y0 + h - 0.1, z], 0.04, { colour: ORANGE, decor: true, fine: true });
      for (const y of [y0 + 1.0, y0 + h - 0.2]) bar(sink, [x, y, z], [cx + Math.sin(a) * (r - 0.02), y, cz + Math.cos(a) * (r - 0.02)], 0.035, { colour: ORANGE, decor: true, fine: true });
    }
  });
  return sink.finish();
};

// ------------------------------------------------------------------------------------------------------------- garage

/** The rover garage: an arched hangar half sunk in its berm, its segmented door to the front (+z). */
const garage: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, mobile = ctx.tier === 'mobile', P = plot(ctx), look = ctx.variant;
  const cx = P.cx, Rv = clamp(P.w / 2 - 1.35, 2.6, 3.6), base = 0.3, z0 = P.z0 + 1.15, z1 = P.z1 - 0.3;
  // the sintered floor slab and the vault on it (the arch's upper half, ribbed), closed at its back and its door
  sink.span('stone', cx - P.w / 2 + 0.1, -0.15, P.z0 + 0.2, cx + P.w / 2 - 0.1, base, P.z1 - 0.15);
  sink.cylinder(M, [cx, base, z0], 'z', z1 - z0, Rv, 18, { colourAt: (p) => (p[1] < base + 1.2 ? DUSTED : MLI), colour: MLI }, Rv, false, -Math.PI / 2, Math.PI);
  const arch = (z: number, r: number): Vec3[] => Array.from({ length: 19 }, (_, i) => {
    const a = -Math.PI / 2 + (i / 18) * Math.PI;
    return [cx + Math.sin(a) * r, base + Math.cos(a) * r, z];
  });
  // (the door's half-disc facing +z; the back's facing -z)
  sink.polygon(M, arch(z1, Rv).reverse(), { colour: shade(PANEL, 0.95) });
  sink.polygon(M, arch(z0, Rv), { colour: shade(MLI, 0.9) });
  // the ribs over the vault, every 2 m (dressing)
  for (let z = z0 + 0.4; z < z1; z += 2.0) {
    sink.cylinder(M, [cx, base, Math.min(z, z1 - 0.3)], 'z', 0.22, Rv + 0.08, 18, { colour: STEEL, decor: true }, Rv + 0.08, false, -Math.PI / 2, Math.PI);
  }
  // the segmented door: its panels' joints across the half-disc and the frame round it (dressing)
  // (the frame's members closed boxes round the arch, so none shows its inside past the vault's end)
  const frame = arch(z1 + 0.1, Rv + 0.07);
  for (let i = 0; i + 1 < frame.length; i++) bar(sink, frame[i], frame[i + 1], 0.2, { colour: ORANGE, decor: true });
  sink.dressing(mobile, () => {
    for (let y = base + 0.55; y < base + Rv - 0.3; y += 0.55) {
      const half = Math.sqrt(Math.max(0, Rv * Rv - (y - base) ** 2)) - 0.12;
      sink.span(M, cx - half, y - 0.025, z1, cx + half, y + 0.025, z1 + 0.04, { colour: DARK, decor: true, fine: true });
    }
  });
  // the personnel door let into the big door's foot and the panels' vertical joints (dressing)
  sink.dressing(mobile, () => {
    sink.span(M, cx + Rv * 0.45 - 0.45, base + 0.02, z1 + 0.01, cx + Rv * 0.45 + 0.45, base + 2.0, z1 + 0.06, { colour: ORANGE, decor: true });
    sink.span(M, cx + Rv * 0.45 - 0.36, base + 0.1, z1 + 0.06, cx + Rv * 0.45 + 0.36, base + 1.9, z1 + 0.08, { colour: PANEL, decor: true, fine: true });
    for (const x of [-0.5, 0, 0.5]) {
      const xx = cx + x * Rv, h = Math.sqrt(Math.max(0, Rv * Rv - (x * Rv) ** 2)) - 0.15;
      sink.span(M, xx - 0.02, base + 0.05, z1, xx + 0.02, base + h, z1 + 0.04, { colour: DARK, decor: true, fine: true });
    }
  });
  // the berm on both flanks to the vault's haunches (half sunk), the bag wall over its back
  const bermH = clamp(Rv * 0.55, 1.4, 2.0), crest = Math.sqrt(Math.max(0.3, Rv * Rv - (bermH - base) ** 2)) - 0.06;
  for (const s of [1, -1] as const) berm(sink, s, cx, P.z0 + 0.25, z1 - 0.4, P.w / 2 - 0.08, crest, Rv * 0.4, bermH, 4, rng);
  bagWall(sink, [cx - Rv - 0.6, P.z0 + 0.62], [cx + Rv + 0.6, P.z0 + 0.62], Math.round(clamp((Rv + base) / 0.42, 5, 8)), 0.85, rng, mobile);
  for (const s of [1, -1]) bagCourse(sink, [cx + s * (crest + 0.25), P.z0 + 1.2], [cx + s * (crest + 0.25), z1 - 0.6], bermH - 0.08, 0.34, 0.5, rng, mobile);
  // the charging pedestals at the door's sides, their cables looped on them; the wheel rack on the berm's foot
  for (const s of [1, -1]) {
    const x = cx + s * (Rv + 0.55), z = z1 - 0.3;
    sink.span(M, x - 0.22, base, z - 0.22, x + 0.22, base + 1.3, z + 0.22, { colour: PANEL });
    sink.span(M, x - 0.18, base + 0.9, z + 0.22, x + 0.18, base + 1.2, z + 0.26, { colour: ORANGE, decor: true, fine: true });
    sink.cylinder(M, [x, base + 0.5, z + 0.22], 'z', 0.08, 0.16, 8, { colour: BLACK, decor: true });
  }
  sink.dressing(mobile, () => {
    // a spare wire-mesh wheel standing in its rack against the berm
    const wx = cx + (look() < 0.5 ? -1 : 1) * (P.w / 2 - 1.2), wz = P.z1 - 1.6;
    bar(sink, [wx - 0.5, base, wz], [wx - 0.5, base + 1.0, wz], 0.05, { colour: STEEL, decor: true, fine: true });
    bar(sink, [wx + 0.5, base, wz], [wx + 0.5, base + 1.0, wz], 0.05, { colour: STEEL, decor: true, fine: true });
    bar(sink, [wx - 0.52, base + 0.95, wz], [wx + 0.52, base + 0.95, wz], 0.05, { colour: STEEL, decor: true, fine: true });
    sink.cylinder(M, [wx - 0.2, base + 0.42, wz], 'x', 0.32, 0.42, 14, { colour: shade(STEEL, 1.15), decor: true });
  });
  // the workshop's jib arm on one garage in two: a post at the door's corner, its arm over the apron, the hoist hanging
  if (look() < 0.5) {
    const jx = cx - Rv - 0.55, jz = z1 - 1.0;
    bar(sink, [jx, base, jz], [jx, base + 3.6, jz], 0.16, { colour: ORANGE, decor: true });
    bar(sink, [jx, base + 3.5, jz], [jx + 2.2, base + 3.5, jz + 0.6], 0.12, { colour: ORANGE, decor: true });
    bar(sink, [jx, base + 2.6, jz], [jx + 1.2, base + 3.46, jz + 0.33], 0.06, { colour: ORANGE, decor: true });
    bar(sink, [jx + 1.9, base + 3.46, jz + 0.52], [jx + 1.9, base + 2.2, jz + 0.52], 0.02, { colour: DARK, decor: true, fine: true });
    sink.span(M, jx + 1.78, base + 1.96, jz + 0.4, jx + 2.02, base + 2.22, jz + 0.64, { colour: DARK, decor: true });
  }
  // the garage's light on its gable
  sink.span(M, cx - 0.35, base + Rv - 0.1, z1 - 0.1, cx + 0.35, base + Rv + 0.2, z1 + 0.25, { colour: DARK, decor: true });
  return sink.finish();
};

// ----------------------------------------------------------------------------------------------------------- tank farm

/** The cryogenic tank farm: two horizontal tanks on saddles behind a low berm, the radiator wing, lines and fill station. */
const tankFarm: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, mobile = ctx.tier === 'mobile', P = plot(ctx);
  const cx = P.cx, cz = P.cz, Rt = clamp(P.d * 0.165, 1.3, 1.75), ay = Rt + 0.55, L = clamp(P.w - 4.6, 6, 11);
  // the farm's store from where it stands (look only): oxygen on the south-east of the station, water and hydrogen beyond
  const band = (ctx.x ?? 1) - (ctx.z ?? 0) >= 0 ? O2_BLUE : H2_RED;
  const tx0 = cx - L / 2 + 0.6;
  for (const s of [1, -1]) {
    const z = cz + s * (Rt + 0.55);
    for (const t of [0.15, 0.5, 0.85]) sink.span(M, tx0 + L * t - 0.25, 0, z - Rt * 0.75, tx0 + L * t + 0.25, ay - Rt * 0.6, z + Rt * 0.75, { colour: DARK });
    sink.cylinder(M, [tx0, ay, z], 'x', L - 1.2, Rt, 18, { colour: MLI }, Rt, false);
    sink.revolve(M, [tx0 - 0.6, ay, z], 'x', [[0, 0.05], [0.16, Rt * 0.6], [0.4, Rt * 0.9], [0.6, Rt]], 18, { colour: MLI });
    sink.revolve(M, [tx0 + L - 1.2, ay, z], 'x', [[0, Rt], [0.2, Rt * 0.9], [0.44, Rt * 0.6], [0.6, 0.05]], 18, { colour: MLI });
    sink.dressing(mobile, () => {
      sink.cylinder(M, [tx0 + L * 0.42, ay, z], 'x', 0.5, Rt + 0.02, 18, { colour: band, decor: true });
      for (const t of [0.1, 0.9]) sink.cylinder(M, [tx0 + (L - 1.2) * t, ay, z], 'x', 0.12, Rt + 0.025, 18, { colour: GOLD, decor: true, fine: true });
    });
    // the transfer line along the tank's crown to the filling station
    bar(sink, [tx0 - 0.1, ay + Rt + 0.06, z], [tx0 + L - 1.6, ay + Rt + 0.06, z], 0.1, { colour: STEEL, decor: true });
    bar(sink, [tx0 - 0.1, ay + Rt + 0.06, z], [tx0 - 1.0, ay + Rt + 0.06, z], 0.1, { colour: STEEL, decor: true });
    bar(sink, [tx0 - 1.0, ay + Rt + 0.11, z], [tx0 - 1.0, 1.0, cz + s * 0.3], 0.1, { colour: STEEL, decor: true });
  }
  // the walkway between the tanks' crowns over their west halves, the ladder up to it at the filling station's end, the
  // valves on the transfer lines
  sink.dressing(mobile, () => {
    // (the deck spans the gap to both hulls at its height, so it rests on them)
    const wy = ay + Rt * 0.55, wx0 = tx0 + 0.2, wx1 = tx0 + (L - 1.2) * 0.55, hw = 0.57 + 0.17 * Rt;
    sink.span(M, wx0, wy - 0.05, cz - hw, wx1, wy + 0.04, cz + hw, { colour: STEEL, decor: true });
    for (const z of [cz - hw + 0.04, cz + hw - 0.04]) {
      bar(sink, [wx0, wy + 1.0, z], [wx1, wy + 1.0, z], 0.035, { colour: ORANGE, decor: true, fine: true });
      for (let k = 0; k <= 3; k++) { const x = wx0 + ((wx1 - wx0) * k) / 3; bar(sink, [x, wy, z], [x, wy + 1.0, z], 0.035, { colour: ORANGE, decor: true, fine: true }); }
    }
    for (const z of [cz - 0.3, cz + 0.3]) bar(sink, [wx0 + 0.03, 0, z], [wx0 + 0.03, wy, z], 0.05, { colour: STEEL, decor: true });
    for (let y = 0.35; y < wy - 0.1; y += 0.32) bar(sink, [wx0 + 0.03, y, cz - 0.32], [wx0 + 0.03, y, cz + 0.32], 0.035, { colour: STEEL, decor: true, fine: true });
    for (const s of [1, -1]) {
      const z = cz + s * (Rt + 0.55);
      for (const x of [tx0 + L * 0.2, tx0 + L * 0.6]) {
        sink.cylinder(M, [x, ay + Rt + 0.06, z - 0.13], 'z', 0.26, 0.13, 8, { colour: ORANGE, decor: true });
        bar(sink, [x, ay + Rt + 0.06, z], [x, ay + Rt + 0.36, z], 0.04, { colour: DARK, decor: true, fine: true });
      }
    }
  });
  // the filling station at the -x end between the tanks: its cabinet, the coupling arm
  sink.span(M, tx0 - 1.6, 0, cz - 0.6, tx0 - 0.4, 1.7, cz + 0.6, { colour: PANEL });
  sink.span(M, tx0 - 1.62, 1.0, cz - 0.62, tx0 - 1.0, 1.4, cz + 0.62, { colour: ORANGE, decor: true });
  // the low berm round the farm (its toe on the plot's sides), gapped at the filling station's end
  const h = clamp(Rt + 0.2, 1.4, 1.9);
  for (const s of [1, -1] as const) {
    sink.placed(s > 0 ? 0 : Math.PI, cx, 0, cz, () => {
      sink.prism('stone', [[-P.w / 2 + 2.2, -0.15, P.d / 2 - 0.08], [-P.w / 2 + 2.2, -0.15, P.d / 2 - 1.5], [-P.w / 2 + 2.2, h, P.d / 2 - 1.1], [-P.w / 2 + 2.2, h, P.d / 2 - 0.62]], [1, 0, 0], P.w - 4.4);
    });
  }
  // the berm's ends (+x and -x) across the plot's depth, the -x end low where the station's pipework passes over it
  for (const e of [1, -1]) {
    const xe = cx + e * (P.w / 2 - 0.08), xi = cx + e * (P.w / 2 - 1.5), hh = e > 0 ? h : h * 0.6;
    const [xa, xb] = e > 0 ? [xi, xe] : [xe, xi];
    sink.prism('stone', [[xa, -0.15, cz - P.d / 2 + 0.6], [xb, -0.15, cz - P.d / 2 + 0.6], [xb - 0.45, hh, cz - P.d / 2 + 0.6], [xa + 0.45, hh, cz - P.d / 2 + 0.6]],
      [0, 0, 1], P.d - 1.2);
  }
  for (const s of [1, -1]) bagCourse(sink, [cx - P.w / 2 + 2.4, cz + s * (P.d / 2 - 0.85)], [cx + P.w / 2 - 2.4, cz + s * (P.d / 2 - 0.85)], h - 0.1, 0.3, 0.45, rng, mobile);
  // the radiator wing on its frame over the +x berm (edge-on to the low sun, so it reads as a white blade)
  const wx = cx + L / 2 + 0.2;
  for (const z of [cz - 1.6, cz + 1.6]) bar(sink, [wx, 0, z], [wx, 4.6, z], 0.1, { colour: STEEL, decor: true });
  sink.span(M, wx - 0.04, 2.0, cz - 2.4, wx + 0.04, 4.5, cz + 2.4, { colour: RADIATOR, decor: true });
  sink.dressing(mobile, () => {
    for (let z = cz - 2.2; z <= cz + 2.25; z += 0.55) sink.span(M, wx - 0.06, 2.05, z - 0.02, wx + 0.06, 4.45, z + 0.02, { colour: shade(RADIATOR, 0.82), decor: true, fine: true });
    bar(sink, [wx, 4.5, cz - 1.6], [wx, 4.5, cz + 1.6], 0.08, { colour: STEEL, decor: true, fine: true });
  });
  return sink.finish();
};

// --------------------------------------------------------------------------------------------------------- comms tower

/**
 * The relay mast — the station's landmark (round 2, 2026-10-18; the blind critics: "no hero landmark that reads at this
 * height", "the comm tower is a spindly mast", "the distant base is only a faint smudge"): a 40 m lattice mast banded in
 * safety orange and white for the landers' approach, broad at the foot and tapering to its head, over the apron's
 * north-west corner where it stands over the scarps' crests from both deployments. The legs, girts and braces are drawn
 * at every range (no fine joinery: the lattice is the silhouette); a solar wing at mid-height; at the head the equipment
 * pod, the platform and its rail, the 4.8 m high-gain dish turned to the Earth, the relay dish along the floor and the
 * obstruction beacons. Solids: the pad, the shelter at the foot, the banded legs.
 */
const commsTower: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, mobile = ctx.tier === 'mobile', P = plot(ctx);
  const cx = P.cx, cz = P.cz, H = 40, foot = clamp(Math.min(P.w, P.d) / 2 - 0.65, 1.9, 2.7), head = 0.62, y0 = 0.35;
  // the pad over the plot; the equipment shelter between the legs at the foot, banked in bags on its open sides
  sink.span('stone', P.x0 + 0.1, -0.15, P.z0 + 0.1, P.x1 - 0.1, y0, P.z1 - 0.1);
  const sh = Math.min(1.3, foot - 0.5);
  sink.span(M, cx - sh, y0, cz - sh, cx + sh, y0 + 2.3, cz + sh, { colourAt: (p) => (p[1] < 0.95 ? DUSTED : PANEL), colour: PANEL });
  sink.span(M, cx - 0.45, y0 + 0.2, cz + sh, cx + 0.45, y0 + 2.0, cz + sh + 0.06, { colour: ORANGE, decor: true });
  bagWall(sink, [cx - sh, cz - sh - 0.45], [cx + sh, cz - sh - 0.45], 3, 0.5, rng, mobile);
  const leg = (k: number, y: number): Vec3 => {
    const t = Math.max(0, y) / H, half = foot + (head - foot) * Math.pow(t, 0.8), sxk = k === 0 || k === 3 ? -1 : 1, szk = k < 2 ? -1 : 1;
    return [cx + sxk * half, y0 + y, cz + szk * half];
  };
  // the four legs in eight bands, orange and white by turns (solid: a hull stops against a leg)
  const bands = 8;
  for (let k = 0; k < 4; k++) {
    for (let b = 0; b < bands; b++) {
      const ya = b === 0 ? -0.3 : (b / bands) * H, yb = ((b + 1) / bands) * H;
      bar(sink, leg(k, ya), leg(k, yb), 0.3 - 0.12 * (b / bands), { colour: b % 2 === 0 ? ORANGE : PANEL });
    }
  }
  // the girts and the braces between the legs, every level, zig-zagging (dressing that meets the legs at both ends)
  const levels = 14;
  for (let l = 1; l <= levels; l++) {
    const y = (l / levels) * H, yp = ((l - 1) / levels) * H, t = 0.13 - 0.05 * (l / levels);
    for (let k = 0; k < 4; k++) {
      const j = (k + 1) % 4;
      bar(sink, leg(k, y), leg(j, y), t, { colour: STEEL, decor: true });
      if (l % 2) bar(sink, leg(k, yp), leg(j, y), t * 0.7, { colour: STEEL, decor: true });
      else bar(sink, leg(j, yp), leg(k, y), t * 0.7, { colour: STEEL, decor: true });
    }
  }
  // the solar wing at mid-height: a boom along the seventh girt of the front face, run out past both legs, and a dark
  // panel on each end (the boom meets the girt along its length, the panels the boom)
  const wl0 = leg(0, H * 0.5), wl1 = leg(1, H * 0.5), wz = wl0[2];
  bar(sink, [wl0[0] - 3.6, wl0[1], wz], [wl1[0] + 3.6, wl1[1], wz], 0.12, { colour: STEEL, decor: true });
  for (const [x0, x1] of [[wl1[0] + 0.3, wl1[0] + 3.5], [wl0[0] - 3.5, wl0[0] - 0.3]] as const) {
    sink.span(M, x0, wl0[1] - 1.6, wz - 0.13, x1, wl0[1] + 1.6, wz - 0.03, { colour: rgb(0x1c2740), decor: true });
    sink.span(M, x0 - 0.05, wl0[1] - 1.66, wz - 0.12, x1 + 0.05, wl0[1] - 1.56, wz - 0.04, { colour: PANEL, decor: true });
  }
  // the head: the platform and its rail, the equipment pod, the whip and its beacon
  const top = y0 + H;
  sink.span(M, cx - 1.3, top, cz - 1.3, cx + 1.3, top + 0.14, cz + 1.3, { colour: DARK, decor: true });
  sink.cylinder(M, [cx, top + 0.14, cz], 'y', 2.2, 0.72, 12, { colour: PANEL, decor: true });
  sink.cylinder(M, [cx, top + 2.34, cz], 'y', 0.12, 0.76, 12, { colour: GOLD, decor: true });
  for (const [a, b] of [[[-1.3, -1.3], [1.3, -1.3]], [[1.3, -1.3], [1.3, 1.3]], [[1.3, 1.3], [-1.3, 1.3]], [[-1.3, 1.3], [-1.3, -1.3]]] as const) {
    bar(sink, [cx + a[0], top + 1.1, cz + a[1]], [cx + b[0], top + 1.1, cz + b[1]], 0.05, { colour: ORANGE, decor: true });
    bar(sink, [cx + a[0], top + 0.14, cz + a[1]], [cx + a[0], top + 1.1, cz + a[1]], 0.05, { colour: ORANGE, decor: true });
  }
  bar(sink, [cx, top + 2.46, cz], [cx, top + 6.2, cz], 0.1, { colour: STEEL, decor: true });
  sink.span(M, cx - 0.18, top + 6.2, cz - 0.18, cx + 0.18, top + 6.6, cz + 0.18, { colour: H2_RED, decor: true });
  // the obstruction beacons on two legs at a third and two thirds of the height
  for (const [k, f] of [[1, 1 / 3], [3, 2 / 3], [3, 1 / 3], [1, 2 / 3]] as const) {
    const p = leg(k, H * f);
    sink.span(M, p[0] - 0.2, p[1], p[2] - 0.2, p[0] + 0.2, p[1] + 0.34, p[2] + 0.2, { colour: H2_RED, decor: true });
  }
  // the high-gain dish on its arm off the head, turned to the Earth; the relay dish lower down, turned along the floor
  const e = earthLocal(ctx), hy = top + 2.4;
  const arm: Vec3 = [cx + e[0] * 2.5, hy, cz + e[2] * 2.5];
  bar(sink, [cx, top + 1.2, cz], arm, 0.16, { colour: STEEL, decor: true });
  dish(sink, arm, e, 2.4, 0.62, PANEL, mobile);
  const ry = y0 + H * 0.78, rl = leg(1, H * 0.78);
  bar(sink, rl, [rl[0] + 0.9, ry, rl[2]], 0.1, { colour: STEEL, decor: true });
  dish(sink, [rl[0] + 0.9, ry, rl[2]], normalize3([1, 0.05, 0.2]), 1.3, 0.34, PANEL, mobile);
  const ql = leg(3, H * 0.62);
  bar(sink, ql, [ql[0] - 0.7, ql[1], ql[2]], 0.08, { colour: STEEL, decor: true });
  dish(sink, [ql[0] - 0.7, ql[1], ql[2]], normalize3([-1, 0.12, -0.4]), 0.8, 0.22, PANEL, mobile);
  // the cable tray down a leg to the shelter; the climbing ladder up the opposite leg (its rungs and the panels' cell joints
  // fine joinery, drawn near the camera)
  bar(sink, leg(1, 0.2), leg(1, H * 0.78), 0.07, { colour: DARK, decor: true });
  sink.dressing(mobile, () => {
    // (on the back face beside its corner leg: its rails in one run per girt level, each run from girt to girt on the leg's
    // taper so it meets them both, the first from the pad; the rungs on each run's own line between its rails)
    const rail = (y: number, s: number): Vec3 => { const p = leg(3, y); return [p[0] + (s > 0 ? 0.78 : 0.32), p[1], p[2] + 0.05]; };
    for (let l = 0; l < levels; l++) {
      const ya = (l / levels) * H, yb = ((l + 1) / levels) * H;
      for (const s of [-1, 1]) bar(sink, rail(ya, s), rail(yb, s), 0.04, { colour: STEEL, decor: true, fine: true });
      const a0 = rail(ya, -1), a1 = rail(yb, -1), b0 = rail(ya, 1), b1 = rail(yb, 1), steps = Math.max(1, Math.round((yb - ya) / 0.6));
      for (let k = 1; k < steps; k++) {
        const t = k / steps, lerp3 = (p: Vec3, q: Vec3): Vec3 => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t, p[2] + (q[2] - p[2]) * t];
        bar(sink, lerp3(a0, a1), lerp3(b0, b1), 0.025, { colour: STEEL, decor: true, fine: true });
      }
    }
    for (const [x0, x1] of [[wl1[0] + 0.3, wl1[0] + 3.5], [wl0[0] - 3.5, wl0[0] - 0.3]] as const) {
      for (let yy = wl0[1] - 1.2; yy < wl0[1] + 1.6; yy += 0.4) sink.span(M, x0, yy - 0.012, wz - 0.145, x1, yy + 0.012, wz - 0.13, { colour: shade(rgb(0x1c2740), 1.6), decor: true, fine: true });
    }
  });
  return sink.finish();
};

// ----------------------------------------------------------------------------------------------------------------- lab

/** The sample lab: a small hab on cradles, its glovebox port and sample racks, the instrument mast. */
const lab: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, mobile = ctx.tier === 'mobile', P = plot(ctx);
  const cx = P.cx, R = clamp(P.w * 0.27, 1.3, 1.65), ay = R + 0.6, z0 = P.z0 + 0.95, z1 = P.z1 - 1.7;
  sink.span('stone', P.x0 + 0.1, -0.15, P.z0 + 0.1, P.x1 - 0.1, 0.25, P.z1 - 0.1);
  for (const t of [0.15, 0.85]) sink.span(M, cx - R * 0.75, 0.25, z0 + (z1 - z0) * t - 0.18, cx + R * 0.75, ay - R * 0.6, z0 + (z1 - z0) * t + 0.18, { colour: DARK });
  const hull = (p: Vec3): Rgb => (p[1] < ay - R * 0.2 ? DUSTED : MLI);
  sink.cylinder(M, [cx, ay, z0], 'z', z1 - z0, R, 18, { colourAt: hull, colour: MLI }, R, false);
  sink.revolve(M, [cx, ay, z0 - 0.45], 'z', [[0, 0.05], [0.12, R * 0.58], [0.28, R * 0.87], [0.45, R]], 18, { colourAt: hull, colour: MLI });
  sink.revolve(M, [cx, ay, z1], 'z', [[0, R], [0.17, R * 0.87], [0.33, R * 0.58], [0.45, 0.05]], 18, { colourAt: hull, colour: MLI });
  // the porch to the front and its hatch
  sink.span(M, cx - 1.1, 0.25, z1 - 0.2, cx + 1.1, 2.6, P.z1 - 0.2, { colourAt: (p) => (p[1] < 0.9 ? DUSTED : PANEL), colour: PANEL });
  const front: Face = { origin: [cx, 0, P.z1 - 0.2], u: [1, 0, 0], out: [0, 0, 1], width: 2.2 };
  faceBox(sink, M, front, 0, 1.3, 0.03, 0.95, 1.8, 0.06, { colour: ORANGE, decor: true });
  faceBox(sink, M, front, 0, 1.28, 0.07, 0.74, 1.56, 0.04, { colour: PANEL, decor: true });
  // half a berm of bags on the -x flank (the side away from the glovebox)
  bagWall(sink, [cx - P.w / 2 + 0.55, P.z0 + 0.3], [cx - P.w / 2 + 0.55, z1 - 0.3], 3, 0.7, rng, mobile);
  // the glovebox port on the +x flank: its box, the two glove rings and its window
  const gx = cx + R * 0.86, gz = (z0 + z1) / 2;
  sink.span(M, gx - 0.2, ay - 0.9, gz - 0.7, gx + 0.55, ay + 0.35, gz + 0.7, { colour: PANEL });
  const side: Face = { origin: [gx + 0.55, 0, gz], u: [0, 0, -1], out: [1, 0, 0], width: 1.4 };
  for (const u of [-0.35, 0.35]) faceBox(sink, M, side, u, ay - 0.45, 0.02, 0.26, 0.26, 0.04, { colour: BLACK, decor: true, fine: true });
  faceBox(sink, 'glass', side, 0, ay + 0.05, 0.01, 0.9, 0.36, 0.02, { decor: true });
  // the sample racks along the -x side, their bags and boxes (dressing)
  sink.dressing(mobile, () => {
    for (const z of [P.z0 + 1.4, P.z0 + 2.6]) {
      const x = cx - P.w / 2 + 1.35;
      for (const s of [-0.35, 0.35]) bar(sink, [x, 0.25, z + s], [x, 1.4, z + s], 0.04, { colour: STEEL, decor: true, fine: true });
      for (const y of [0.7, 1.15]) {
        sink.span(M, x - 0.2, y, z - 0.38, x + 0.2, y + 0.03, z + 0.38, { colour: STEEL, decor: true, fine: true });
        sink.span(M, x - 0.16, y + 0.03, z - 0.3, x + 0.14, y + 0.2, z + 0.05, { colour: rng() < 0.5 ? PANEL : ORANGE, decor: true, fine: true });
      }
    }
  });
  // the instrument mast at the back: its pole, cross arm and sensors
  const mx = cx + R * 0.6, mz = P.z0 + 0.6;
  bar(sink, [mx, 0.25, mz], [mx, 7.4, mz], 0.08, { colour: STEEL, decor: true });
  bar(sink, [mx - 0.7, 6.6, mz], [mx + 0.7, 6.6, mz], 0.05, { colour: STEEL, decor: true });
  for (const s of [-0.65, 0.65]) sink.span(M, mx + s - 0.08, 6.63, mz - 0.08, mx + s + 0.08, 6.85, mz + 0.08, { colour: PANEL, decor: true });
  sink.revolve(M, [mx, 7.4, mz], 'y', [[0, 0.16], [0.12, 0.12], [0.2, 0.02]], 8, { colour: GOLD, decor: true });
  return sink.finish();
};

// ----------------------------------------------------------------------------------------------------- offloading crane

/** The offloading crane (after NASA's LSMS): a boom on a turret at the pad's -x end over the pallets at its +x end. */
const crane: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, mobile = ctx.tier === 'mobile', P = plot(ctx);
  const cz = P.cz, tx = P.x0 + 1.7, mastH = clamp((ctx.bounds.maxY ?? 11) - 2.5, 7.5, 9.5);
  // the cargo pad and its tie-down grid (dressing strips)
  sink.span('stone', P.x0 + 0.1, -0.15, P.z0 + 0.1, P.x1 - 0.1, 0.18, P.z1 - 0.1);
  sink.dressing(mobile, () => {
    for (let x = P.x0 + 4.5; x < P.x1 - 0.6; x += 2.4) sink.span(M, x - 0.03, 0.18, P.z0 + 0.4, x + 0.03, 0.2, P.z1 - 0.4, { colour: DARK, decor: true, fine: true });
  });
  // the turret: its sintered pedestal, the slewing drum and the mast
  sink.span('stone', P.x0 + 0.15, 0, cz - 1.5, P.x0 + 3.25, 0.9, cz + 1.5);
  sink.cylinder(M, [tx, 0.9, cz], 'y', 0.7, 1.2, 16, { colour: PANEL });
  sink.cylinder(M, [tx, 1.6, cz], 'y', 0.12, 1.26, 16, { colour: ORANGE, decor: true });
  const m0: Vec3 = [tx, 1.6, cz];
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) bar(sink, [tx + sx * 0.28, 1.5, cz + sz * 0.28], [tx + sx * 0.28, 1.6 + mastH, cz + sz * 0.28], 0.12, { colour: STEEL });
  for (let y = 2.4; y < 1.6 + mastH; y += 1.4) {
    for (const [a, b] of [[[-1, -1], [1, -1]], [[1, -1], [1, 1]], [[1, 1], [-1, 1]], [[-1, 1], [-1, -1]]] as const) {
      bar(sink, [tx + a[0] * 0.28, y, cz + a[1] * 0.28], [tx + b[0] * 0.28, y, cz + b[1] * 0.28], 0.05, { colour: STEEL, decor: true, fine: true });
    }
  }
  sink.span(M, tx - 0.4, 1.6 + mastH, cz - 0.4, tx + 0.4, 1.9 + mastH, cz + 0.4, { colour: ORANGE, decor: true });
  // the boom from the mast's elbow out over the pallets, a box truss rising a little; its tension cables from the mast head
  const bx0 = tx + 0.3, bx1 = P.x1 - 2.4, by0 = 1.6 + mastH * 0.62, by1 = by0 + 1.4, hz = 0.22;
  const at = (t: number, dy: number, s: number): Vec3 => [bx0 + (bx1 - bx0) * t, by0 + (by1 - by0) * t + dy, cz + s * hz];
  for (const s of [-1, 1]) for (const dy of [-0.22, 0.22]) bar(sink, at(0, dy, s), at(1, dy, s), 0.09, { colour: PANEL, decor: true });
  const bays = Math.max(4, Math.round((bx1 - bx0) / 1.2));
  for (let k = 0; k <= bays; k++) {
    const t = k / bays;
    for (const s of [-1, 1]) bar(sink, at(t, -0.22, s), at(t, 0.22, s), 0.05, { colour: PANEL, decor: true, fine: !mobile });
    bar(sink, at(t, 0.22, -1), at(t, 0.22, 1), 0.05, { colour: PANEL, decor: true, fine: !mobile });
    if (k < bays) for (const s of [-1, 1]) bar(sink, at(t, -0.22, s), at((k + 1) / bays, 0.22, s), 0.04, { colour: PANEL, decor: true, fine: !mobile });
  }
  bar(sink, [tx + 0.28, by0 - 0.4, cz + 0.28], at(0, 0.22, 0), 0.16, { colour: ORANGE, decor: true });
  for (const t of [Math.round(bays * 0.55) / bays, 1]) bar(sink, [tx, 1.75 + mastH, cz], at(t, 0.22, 0), 0.03, { colour: DARK, decor: true });
  // the hook block hanging from the tip over the pallets
  const hk = at(1, 0.22, 0), hy = 2.6;
  bar(sink, hk, [hk[0], hy + 0.3, hk[2]], 0.025, { colour: DARK, decor: true });
  sink.span(M, hk[0] - 0.2, hy, hk[2] - 0.16, hk[0] + 0.2, hy + 0.35, hk[2] + 0.16, { colour: ORANGE, decor: true });
  // the pallets under the boom: aluminium skids with their cargo (canisters, soft bags), solid, low
  const px0 = P.x1 - 4.6;
  for (const [i, dz] of [[0, -1.2], [1, 1.2]] as const) {
    const z = cz + dz, x = px0 + 1.0 + i * 1.6;
    sink.span(M, x - 1.0, 0.18, z - 0.75, x + 1.0, 0.36, z + 0.75, { colour: STEEL });
    if (i === 0) {
      for (const [ox, oz] of [[-0.48, -0.36], [0.48, -0.36], [-0.48, 0.36], [0.48, 0.36]] as const) sink.cylinder(M, [x + ox, 0.36, z + oz], 'y', 0.95, 0.3, 10, { colour: PANEL });
    } else {
      sink.span('plaster', x - 0.95, 0.36, z - 0.7, x + 0.95, 1.25, z + 0.7);
      sink.dressing(mobile, () => { for (const y of [0.6, 1.0]) sink.span(M, x - 0.97, y, z - 0.72, x + 0.97, y + 0.05, z + 0.72, { colour: ORANGE, decor: true, fine: true }); });
    }
  }
  // the far pallet at the pad's +x end (the boom's reach)
  sink.span(M, P.x1 - 1.9, 0.18, cz - 1.6, P.x1 - 0.2, 0.36, cz + 1.6, { colour: STEEL });
  sink.span('plaster', P.x1 - 1.85, 0.36, cz - 1.5, P.x1 - 0.25, 1.1, cz + 1.5);
  void rng; void m0;
  return sink.finish();
};

// ---------------------------------------------------------------------------------------------------- logistics modules

/** The logistics modules: pressurised cylinders on cradles banked in regolith bags to their shoulders. */
const logistics: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, mobile = ctx.tier === 'mobile', P = plot(ctx);
  const W = P.w - 0.4, D = P.d - 0.4, zc = P.cz;
  const r = clamp(D * 0.18, 1.0, 1.3), len = clamp(D - 0.25, 4.4, 6.6);
  const n = Math.max(2, Math.floor(W / (2 * r + 1.1))), pitch = W / n, x0 = P.x0 + 0.2 + pitch / 2;
  for (let k = 0; k < n; k++) {
    const x = x0 + k * pitch, ay = r + 0.45;
    for (const z of [zc - len * 0.3, zc + len * 0.3]) sink.span(M, x - r * 0.85, -0.15, z - 0.2, x + r * 0.85, ay - r * 0.55, z + 0.2, { colour: DARK });
    sink.cylinder(M, [x, ay, zc - len / 2 + 0.35], 'z', len - 0.7, r, 16, { colourAt: (p) => (p[1] < ay - r * 0.3 ? DUSTED : MLI), colour: MLI }, r, false);
    sink.revolve(M, [x, ay, zc - len / 2], 'z', [[0, 0.04], [0.12, r * 0.6], [0.35, r]], 16, { colour: MLI });
    sink.revolve(M, [x, ay, zc + len / 2 - 0.35], 'z', [[0, r], [0.23, r * 0.6], [0.35, 0.04]], 16, { colour: MLI });
    hatchZ(sink, x, ay, zc + len / 2 - 0.1, r * 0.45, 1);
    sink.dressing(mobile, () => {
      for (const z of [zc - len / 4, zc + len / 4]) sink.cylinder(M, [x, ay, z - 0.06], 'z', 0.12, r + 0.025, 16, { colour: GOLD, decor: true, fine: true });
      // the module's stencilled number band
      sink.cylinder(M, [x, ay, zc - 0.3], 'z', 0.6, r + 0.02, 16, { colour: k % 2 ? ORANGE : shade(PANEL, 0.9), decor: true, fine: true }, r + 0.02, false, -0.4, 0.8);
    });
    // the regolith banked between this module and the next to its shoulder: the solid and its bag courses
    if (k < n - 1) {
      const gx = x + pitch / 2, hw = pitch / 2 - r * 0.25;
      sink.span('plaster', gx - hw, -0.15, zc - len / 2 + 0.4, gx + hw, ay - 0.1, zc + len / 2 - 0.6);
      for (let c = 0; c < 3; c++) bagCourse(sink, [gx - hw + 0.2, zc + len / 2 - 0.5 - c * 0.05], [gx + hw - 0.2, zc + len / 2 - 0.5 - c * 0.05], c * 0.42 - 0.05, 0.44, 0.5, rng, mobile);
      // soft cargo bags stacked in the bank's top (dressing)
      sink.dressing(mobile, () => {
        for (let b = 0; b < 3; b++) {
          const bz = zc - len / 2 + 1.0 + b * (len - 2) / 3 + rng() * 0.3, s = 0.35 + rng() * 0.2;
          sink.span('plaster', gx - s, ay - 0.1, bz - s * 0.8, gx + s, ay + 0.35 + rng() * 0.2, bz + s * 0.8, { decor: true });
        }
      });
    }
  }
  // the bank's two outer ends, coursed
  for (const s of [-1, 1]) {
    const ex = s < 0 ? P.x0 + 0.15 : P.x1 - 0.15;
    sink.span('plaster', s < 0 ? ex : ex - 0.8, -0.15, zc - len / 2 + 0.4, s < 0 ? ex + 0.8 : ex, r + 0.25, zc + len / 2 - 0.6);
    bagCourse(sink, [s < 0 ? ex + 0.4 : ex - 0.4, zc - len / 2 + 0.5], [s < 0 ? ex + 0.4 : ex - 0.4, zc + len / 2 - 0.7], r + 0.2, 0.3, 0.75, rng, mobile);
  }
  return sink.finish();
};

// ----------------------------------------------------------------------------------------------------- EVA tool locker

/** The EVA tool locker of a yard: a cabinet on a sintered pad under a flat canopy, its tool rack beside it. */
const toolLocker: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, mobile = ctx.tier === 'mobile', P = plot(ctx);
  const cx = P.cx, cz = P.cz, w = P.w - 0.3, d = P.d - 0.3, h = clamp(P.d * 0.62, 1.9, 2.4);
  sink.span('stone', P.x0 + 0.1, -0.15, P.z0 + 0.1, P.x1 - 0.1, 0.15, P.z1 - 0.1);
  sink.span(M, cx - w / 2 + 0.05, 0.15, cz - d / 2 + 0.05, cx + w / 2 - 0.05, h, cz + d / 2 - 0.6, { colourAt: (p) => (p[1] < 0.7 ? DUSTED : PANEL), colour: PANEL });
  // its canopy over the front on two posts (flat: a landing hull finds no spike)
  for (const s of [-1, 1]) bar(sink, [cx + s * (w / 2 - 0.15), 0.15, cz + d / 2 - 0.15], [cx + s * (w / 2 - 0.15), h + 0.25, cz + d / 2 - 0.15], 0.08, { colour: STEEL, decor: true });
  sink.span(M, cx - w / 2, h + 0.18, cz - d / 2 + 0.05, cx + w / 2, h + 0.3, cz + d / 2, { colour: shade(PANEL, 0.92), decor: true });
  // its doors, their joint and handles; the tool rack (a shovel, a rake, the tongs and a core tube) on its side
  const front: Face = { origin: [cx, 0, cz + d / 2 - 0.6], u: [1, 0, 0], out: [0, 0, 1], width: w - 0.1 };
  faceBox(sink, M, front, 0, h / 2 + 0.1, 0.01, 0.03, h - 0.4, 0.02, { colour: DARK, decor: true, fine: true });
  for (const u of [-0.12, 0.12]) faceBox(sink, M, front, u, h / 2 + 0.1, 0.03, 0.04, 0.3, 0.04, { colour: ORANGE, decor: true, fine: true });
  faceBox(sink, M, front, 0, h - 0.25, 0.01, w * 0.6, 0.12, 0.02, { colour: ORANGE, decor: true, fine: true });
  sink.dressing(mobile, () => {
    const x = cx + w / 2 - 0.03, z0 = cz - d / 2 + 0.3;
    bar(sink, [x, 1.2, z0], [x, 1.2, z0 + d - 1.2], 0.04, { colour: STEEL, decor: true, fine: true });
    for (let k = 0; k < 4; k++) {
      const z = z0 + 0.2 + k * (d - 1.6) / 3;
      bar(sink, [x + 0.035, 0.2, z], [x + 0.035, 1.3, z], 0.035, { colour: k === 2 ? ORANGE : STEEL, decor: true, fine: true });
    }
  });
  void rng;
  return sink.finish();
};

const LITTROW_BUILDERS: Readonly<Record<string, RegionalBuilder>> = Object.freeze({
  barn: habitat,
  cottage: node,
  schoolhouse: garage,
  farmhouse: tankFarm,
  mill: commsTower,
  chapel: lab,
  gantry: crane,
  containerRow: logistics,
  granary: toolLocker,
});

export const LITTROW_STYLE: ArchitectureStyle = Object.freeze<ArchitectureStyle>({
  id: 'littrow',
  region: 'Taurus-Littrow Station, the Moon, 2046: an oxygen-mining outpost on the floor of the Apollo 17 valley — pressurised modules on cradles under the regolith that shields them, bagged at the ends and sintered on the flanks, in white multi-layer insulation dusted grey, gold foil and safety orange',
  surfaces: {
    // the station's few sheet roofs: dusted white panels
    roof: { kind: 'sheet', tint: [0.82, 0.81, 0.79] },
    // sintered regolith blocks: the valley floor's own grey
    stone: { kind: 'block', tint: [0.5, 0.49, 0.47] },
    sourced: { plaster: false, wood: false },
    // the bags' geotextile: white under the grey dust
    // (round 3; the blind judge: white bag stacks "off-palette") the geotextile grey under its dust, a shade over the regolith
    tones: { plaster: (_h: number, _s: number, l: number) => [0.1, 0.025, clamp(0.42 + l * 0.26, 0, 1)] },
    plasterRelief: 0.7,
  },
  builders: LITTROW_BUILDERS,
  // airless and dry: no damp, no moss; the dust settles at the feet
  weather: {
    plaster: [[1, 1, 1], [0.95, 0.95, 0.94], [0.9, 0.9, 0.89]],
    stone: [[1, 1, 1], [0.94, 0.94, 0.93], [1.04, 1.03, 1.02]],
    roof: [[1, 1, 1], [0.95, 0.95, 0.94]],
    damp: 0, moss: 0,
  },
  wear: 0.15,
  // the yards round the habitats, garages and tank farms: a course of regolith bags (the Moon's fenceplank, dressed
  // through its structure variants), an open gap for the gate, the EVA tool locker in the far corner, no garden
  yard: { kinds: ['barn', 'schoolhouse', 'farmhouse'], fence: 'fenceplank', gate: null, shed: 'granary', shedSize: [3.0, 2.4], garden: false, tidy: true },
});
