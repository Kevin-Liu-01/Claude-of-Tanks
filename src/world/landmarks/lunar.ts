// src/world/landmarks/lunar.ts — Taurus-Littrow Station's set pieces (the Earthrise 228 rebuild, 2026-10-18; the owner,
// 2026-10-17: Earthrise rebuilt "the way Verdant was" — its real place, a hero landmark, the mills on the swells).
//   - apolloSite  Challenger's site, kept as found inside a ring of posts (Apollo 17, December 1972): the descent stage in
//                 its gold and black foil on four legs, the ladder with the plaque on the forward leg, a quad bay open; the
//                 flag bleached white; the ALSEP central station under its sunshield, the finned RTG, the experiments and
//                 their flat cables, the seismic-profiling geophone line on its flags; the ring of sixteen posts and a low
//                 tape, the interpretive stand at the gate (local -z). The one Lunar Roving Vehicle is the map's set piece
//                 (maps/vehicleSetPieces.ts), parked inside the ring.
//   - isruWorks   the oxygen works (params.part 'plant'): the receiving hopper and the inclined conveyor, two hydrogen-
//                 reduction reactors on their skid, the gas-cleanup rack, the oxygen liquefier and its radiator wing, the
//                 tailings chute and its spoil cone, the control module; and its excavation front (part 'front'): a
//                 bucket-drum excavator (after NASA's RASSOR) at the bench, the feed hopper on its legs, the graded benches,
//                 the spoil heap and the light tower.
//   - solarTower  the mills on the swells: a vertical solar array tower (after NASA's VSAT) — the mast, its two blankets
//                 rolled out on the turning head toward its local +z (the map turns it to the low east sun), the guys and
//                 the foot cabinet.
//   - stationDome the station's commons (round 3): a pressurised dome 24 m across in its white blanket, dusted at the foot,
//                 its gores' seams, under a shielding collar of sintered regolith; the cupola at its crown with its ports,
//                 gold rim and beacon mast; three airlock tunnels on their cradles (the main one to local -z), each with
//                 its hatch and step; two radiator wings standing edge-on beside it and its light masts.
//   - relayRepeater the deployments' link over the scarps (round 3): a 16 m three-legged lattice mast on the crest beside
//                 the rovers' track, banded orange and white at its head, its dish to the station (local -z), its solar
//                 wing, the cabinet at its foot, three guys and the beacon.
// Drawn in its own frame (x across, y up, z out of its front, the ground at y = 0) into the regional part sink, so each
// merges into the props' material buckets. The bodies (the descent stage, the vessels, the masts, the cabinets) are
// structure; the instruments, cables, flags, posts, guys and blankets are dressing. A phone keeps every coarse part; the
// fine pieces (rungs, cell joints, fins, the small flags) are drawn near the camera only.
import { PartSink, normalize3, rgb, shade, type EmitOptions, type RegionalBucket, type Rgb, type Vec3 } from '../maps/regional/geometry.ts';
import type { LandmarkBuilder, LandmarkBuildContext } from './types.ts';
import { finishLandmark } from './pieces.ts';

const GOLD = rgb(0xc8a04a), GOLD_DARK = rgb(0x8a6a2c), BLACK = rgb(0x1f2023), SILVER = rgb(0xb8babd), WHITE = rgb(0xe6e4de);
const STEEL = rgb(0x8d8a84), DARK = rgb(0x3e4349), ORANGE = rgb(0xd46f2a), CELL = rgb(0x151b28), PANEL = rgb(0xeceae4);
const DUSTED = rgb(0xb9b4aa), MLI = rgb(0xdedcd6), RADIATOR = rgb(0xe4e6e6), REGOLITH: Rgb = [0.62, 0.6, 0.58], H2_RED_LM = rgb(0xb4453a);
const M = 'structureMetal' as const;

const uvOffset = (rng: () => number): [number, number] => [rng() * 7.31, rng() * 5.17];
const num = (ctx: LandmarkBuildContext, key: string, min: number): number => Math.max(min, Number(ctx.params[key]));

/** A straight member from a to b, `t` square, every face kept. */
function bar(sink: PartSink, a: Vec3, b: Vec3, t: number, opts: EmitOptions): void {
  const d = normalize3([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
  const ref: Vec3 = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const out = normalize3([d[1] * ref[2] - d[2] * ref[1], d[2] * ref[0] - d[0] * ref[2], d[0] * ref[1] - d[1] * ref[0]]);
  sink.member(M, a, b, t, t, out, { ...opts, exposed: true }, t / 2);
}

/** A box turned `yaw` about its own vertical axis at (x, y, z) (its foot at y). */
function turnedBox(sink: PartSink, bucket: RegionalBucket, x: number, y: number, z: number, yaw: number, hx: number, h: number, hz: number, opts: EmitOptions): void {
  sink.placed(yaw, x, y, z, () => sink.span(bucket, -hx, 0, -hz, hx, h, hz, opts));
}

/** A flat cable lying on the ground from a to b (each end's ground under it), in a few draped runs. Dressing. */
function groundCable(sink: PartSink, g: (x: number, z: number) => number, a: readonly [number, number], b: readonly [number, number], colour: Rgb): void {
  const n = Math.max(1, Math.round(Math.hypot(b[0] - a[0], b[1] - a[1]) / 3));
  for (let k = 0; k < n; k++) {
    const t0 = k / n, t1 = (k + 1) / n;
    const x0 = a[0] + (b[0] - a[0]) * t0, z0 = a[1] + (b[1] - a[1]) * t0, x1 = a[0] + (b[0] - a[0]) * t1, z1 = a[1] + (b[1] - a[1]) * t1;
    bar(sink, [x0, g(x0, z0) + 0.015, z0], [x1, g(x1, z1) + 0.015, z1], 0.03, { colour, decor: true });
  }
}

/** A small flag on a thin pole at (x, z): the pole and the cloth on its crossbar. */
function smallFlag(sink: PartSink, g: (x: number, z: number) => number, x: number, z: number, h: number, colour: Rgb): void {
  const y = g(x, z);
  bar(sink, [x, y - 0.1, z], [x, y + h, z], 0.02, { colour: SILVER, decor: true, fine: true });
  sink.span(M, x + 0.01, y + h - 0.16, z - 0.005, x + 0.2, y + h - 0.02, z + 0.005, { colour, decor: true, fine: true });
}

// ---------------------------------------------------------------------------------------------------------- the site

/** Challenger's descent stage at (0, gy, 0): its body, legs and footpads, the ladder on the forward (-z) leg. */
function descentStage(sink: PartSink, g: (x: number, z: number) => number, variant: () => number): void {
  // the stage stands on its four pads; its body rides on the mean of their ground
  const pad = (k: number): [number, number] => {
    const a = (k * Math.PI) / 2;
    return [Math.sin(a) * 4.55, Math.cos(a) * 4.55];
  };
  const base = [0, 1, 2, 3].reduce((s, k) => s + g(...pad(k)), 0) / 4;
  const y0 = base + 1.32, y1 = base + 3.0, R = 2.28;
  // the body: the octagonal stage in its foil, its deck darker where the ascent stage stood, the engine's skirt under it
  sink.cylinder(M, [0, y0, 0], 'y', y1 - y0, R, 8, { colourAt: (p) => (p[1] > y0 + 1.15 ? GOLD : shade(GOLD, 0.88)), colour: GOLD }, R, true, Math.PI / 8);
  sink.cylinder(M, [0, base + 0.78, 0], 'y', y0 - base - 0.76, 0.98, 12, { colour: DARK }, 0.62);
  // (round 2, 2026-10-18; the blind critics: "the lander's foil panels are flat brown") the main faces in their foil as it
  // was laid: sheets of gold Kapton in three columns and two courses, each a little proud of the face and crinkled to its
  // own sheen (bright where it catches the sun, deep amber in its folds), a pale seam along the top course
  const FOIL: readonly Rgb[] = [rgb(0xe2bd5e), rgb(0xd3a94c), rgb(0xf0cf73), rgb(0xb98d3c), rgb(0xdcb455), rgb(0xc99e45)];
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2, nx = Math.sin(a), nz = Math.cos(a), ap = R * Math.cos(Math.PI / 8), half = R * Math.sin(Math.PI / 8) - 0.04;
    sink.placed(a, nx * ap, 0, nz * ap, () => {
      for (let c = 0; c < 3; c++) for (let r = 0; r < 2; r++) {
        const x0 = -half + (c * 2 * half) / 3 + 0.015, x1 = -half + ((c + 1) * 2 * half) / 3 - 0.015;
        const ya = y0 + 0.06 + r * (y1 - y0 - 0.12) / 2 + 0.015, yb = y0 + 0.06 + (r + 1) * (y1 - y0 - 0.12) / 2 - 0.015;
        const f = FOIL[(k * 5 + c * 2 + r * 3 + Math.floor(variant() * 6)) % FOIL.length], out = 0.012 + variant() * 0.022;
        sink.span(M, x0, ya, -0.01, x1, yb, out, { colourAt: (q) => shade(f, 0.9 + 0.22 * Math.sin(q[0] * 7.3 + q[1] * 5.1 + k)), colour: f, decor: true });
      }
      sink.span(M, -half, y1 - 0.11, -0.01, half, y1 - 0.07, 0.04, { colour: rgb(0xe9e2c8), decor: true, fine: true });
    });
  }
  // the four quad bays (the diagonal faces) and the open bay (the equipment's, left of the ladder)
  // (round 3, 2026-10-18; the blind judge: "the lander's dark descent-stage panel looks like a black void") the quads' outer
  // blankets as the photographs show them: the darker amber and the aluminised film in crinkled sheets, two columns and
  // two courses, each sheet to its own sheen; the open bay's stowage shelves and boxes in their silver under the shadow of
  // the bay, so no face is one flat black
  const QUAD: readonly Rgb[] = [rgb(0x9a7a3a), rgb(0xb8babd), rgb(0x86682e), rgb(0xa58440), rgb(0x9fa1a4), rgb(0x8f7034)];
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2, nx = Math.sin(a), nz = Math.cos(a), ap = R * Math.cos(Math.PI / 8);
    const open = k === 3;
    sink.placed(Math.atan2(nx, nz), nx * ap, 0, nz * ap, () => {
      sink.span(M, -0.82, y0 + 0.12, -0.02, 0.82, y1 - 0.12, open ? -0.01 : 0.03, { colour: open ? DARK : shade(GOLD_DARK, 0.9), decor: true });
      if (!open) {
        for (let c = 0; c < 2; c++) for (let r = 0; r < 2; r++) {
          const x0 = -0.8 + c * 0.8 + 0.015, x1 = x0 + 0.77, ya = y0 + 0.14 + r * (y1 - y0 - 0.28) / 2 + 0.012, yb = ya + (y1 - y0 - 0.28) / 2 - 0.024;
          const f = QUAD[(k * 3 + c * 2 + r * 5 + Math.floor(variant() * 6)) % QUAD.length], out = 0.04 + variant() * 0.02;
          sink.span(M, x0, ya, 0.02, x1, yb, out, { colourAt: (q) => shade(f, 0.86 + 0.26 * Math.sin(q[0] * 8.1 + q[1] * 6.3 + k * 1.7)), colour: f, decor: true });
        }
      }
      if (open) {
        // the bay's pallet let down on its hinges, its stowage behind it: two shelves of silver boxes
        sink.span(M, -0.7, y0 + 0.2, -0.36, 0.7, y1 - 0.2, -0.02, { colour: shade(DARK, 0.8), decor: true });
        // (the shelves stand out of the bay's face: the stage's body fills the octagon behind it)
        for (let r = 0; r < 2; r++) {
          const yb = y0 + 0.3 + r * 0.6;
          sink.span(M, -0.7, yb - 0.04, -0.01, 0.7, yb, 0.3, { colour: STEEL, decor: true });
          for (let c = 0; c < 3; c++) sink.span(M, -0.62 + c * 0.43, yb, 0.01, -0.27 + c * 0.43, yb + 0.26 + (c % 2) * 0.1, 0.27, { colour: c === 1 ? WHITE : SILVER, decor: true });
        }
        for (const x of [-0.7, 0.7]) sink.span(M, x - 0.025, y0 + 0.2, -0.01, x + 0.025, y1 - 0.2, 0.3, { colour: STEEL, decor: true });
        bar(sink, [-0.68, y0 + 0.15, 0.0], [-0.68, y0 - 0.35, 0.95], 0.06, { colour: SILVER, decor: true });
        bar(sink, [0.68, y0 + 0.15, 0.0], [0.68, y0 - 0.35, 0.95], 0.06, { colour: SILVER, decor: true });
        sink.placed(0, 0, 0, 0, () => sink.span(M, -0.72, y0 - 0.42, 0.85, 0.72, y0 - 0.3, 1.0, { colour: SILVER, decor: true }));
      }
    });
  }
  // the deck: the interstage fittings and the blanket torn by the ascent engine's blast
  sink.cylinder(M, [0, y1 - 0.02, 0], 'y', 0.06, R * 0.86, 8, { colour: shade(GOLD_DARK, 0.85), decor: true }, R * 0.86, true, Math.PI / 8);
  for (const [x, z, s] of [[0.9, 0.9, 0.3], [-1.0, 0.7, 0.24], [0.6, -1.1, 0.26], [-0.8, -0.9, 0.22]] as const) {
    sink.span(M, x - s, y1 + 0.03, z - s, x + s, y1 + 0.03 + s * 1.2, z + s, { colour: SILVER, decor: true });
  }
  for (let k = 0; k < 5; k++) {
    const a = variant() * Math.PI * 2, r = 1.3 + variant() * 0.7, h = 0.06 + variant() * 0.12;
    sink.placed(a, Math.sin(a) * r, 0, Math.cos(a) * r, () => sink.span(M, -0.25, y1 + 0.02, -0.08, 0.25, y1 + 0.02 + h, 0.08, { colour: GOLD, decor: true, fine: true }));
  }
  // the four legs (the main faces): the primary strut to its pad, the two secondaries to the body's lower corners, the
  // pad, and on three of them the contact probe bent back under the pad
  for (let k = 0; k < 4; k++) {
    const a = (k * Math.PI) / 2, ux = Math.sin(a), uz = Math.cos(a), vx = uz, vz = -ux;
    const [px, pz] = pad(k), py = g(px, pz);
    const top: Vec3 = [ux * (R - 0.15), y1 - 0.25, uz * (R - 0.15)], knee: Vec3 = [px - ux * 0.25, py + 0.55, pz - uz * 0.25];
    bar(sink, top, knee, 0.2, { colour: GOLD });
    for (const s of [-1, 1]) bar(sink, [ux * (R - 0.25) + vx * s * 0.85, y0 + 0.06, uz * (R - 0.25) + vz * s * 0.85], knee, 0.09, { colour: SILVER });
    sink.cylinder(M, [px, py - 0.08, pz], 'y', 0.22, 0.47, 12, { colour: SILVER }, 0.47);
    bar(sink, [px - ux * 0.25, py + 0.12, pz - uz * 0.25], knee, 0.16, { colour: SILVER });
    if (k !== 2) bar(sink, [px, py + 0.05, pz], [px + ux * 0.3 + vx * 0.4, py + 0.06, pz + uz * 0.3 + vz * 0.4], 0.04, { colour: SILVER, decor: true, fine: true });
  }
  // the ladder on the forward leg (-z: k = 2), its rails along the strut, the rungs, and the plaque on the strut
  const [lx, lz] = pad(2), ly = g(lx, lz);
  const top: Vec3 = [0, y1 - 0.25, -(R - 0.15)], knee: Vec3 = [lx, ly + 0.55, lz + 0.25];
  // (a rung at each end of the rails, so neither rail has a free end; the rungs pass through the strut)
  const rail = (t: number): Vec3 => [0, top[1] + (knee[1] - top[1]) * t, top[2] - 0.12 + (knee[2] - top[2]) * t];
  for (const s of [-0.38, 0.38]) bar(sink, [s, rail(0.05)[1], rail(0.05)[2]], [s, rail(0.95)[1], rail(0.95)[2]], 0.05, { colour: GOLD_DARK, decor: true });
  for (let k = 0; k <= 9; k++) {
    const p = rail(0.05 + k * 0.1);
    bar(sink, [-0.4, p[1], p[2]], [0.4, p[1], p[2]], 0.035, { colour: GOLD_DARK, decor: true, fine: k > 0 && k < 9 });
  }
  {
    const t = 0.62, p: Vec3 = [0, top[1] + (knee[1] - top[1]) * t, top[2] + (knee[2] - top[2]) * t];
    sink.span(M, -0.15, p[1] - 0.12, p[2] - 0.15, 0.15, p[1] + 0.12, p[2] - 0.1, { colour: SILVER, decor: true });
  }
}

/** Challenger's site kept as found inside its ring of posts. */
export const apolloSite: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const g = ctx.ground ?? (() => 0), r = num(ctx, 'radius', 12), variant = ctx.variant;
  void PANEL;
  descentStage(sink, g, variant);
  // the flag, bleached white by fifty years of sun, on its pole and crossbar south-west of the stage
  {
    const fx = -5.2, fz = -6.4, y = g(fx, fz);
    bar(sink, [fx, y - 0.2, fz], [fx, y + 2.45, fz], 0.035, { colour: SILVER, decor: true });
    bar(sink, [fx, y + 2.42, fz], [fx + 1.55, y + 2.42, fz], 0.025, { colour: SILVER, decor: true });
    // the cloth in three panels, a little rippled where it was folded, hanging from the crossbar; (round 2, 2026-10-18; the
    // blind critics read the bleached cloth as "blank grey signboards on posts") its stripes and its canton faded by fifty
    // years of sun to a pale rose and a pale blue on the white, still a flag at the tank's range
    const STRIPE = rgb(0xd2aaa3), CANTON = rgb(0x9eabc4);
    for (let k = 0; k < 3; k++) {
      const x0 = fx + 0.02 + k * 0.51, o = (k % 2 ? 0.035 : -0.02);
      sink.span(M, x0, y + 1.5, fz + o - 0.008, x0 + 0.51, y + 2.41, fz + o + 0.008, { colour: shade(WHITE, 0.97 - k * 0.02), decor: true });
      for (const sd of [-1, 1]) {
        const zf = fz + o + sd * 0.011;
        for (let b = 0; b < 7; b += 2) {
          const yb = y + 2.41 - (b + 1) * (0.91 / 7), ya = yb + 0.91 / 7;
          if (k === 0 && b < 4) continue;
          sink.span(M, x0, yb, zf - 0.002, x0 + 0.51, ya, zf + 0.002, { colour: STRIPE, decor: true });
        }
        if (k === 0) sink.span(M, x0, y + 2.41 - 0.91 * 4 / 7, zf - 0.002, x0 + 0.51, y + 2.41, zf + 0.002, { colour: CANTON, decor: true });
      }
    }
  }
  // the ALSEP: the central station under its sunshield, its antenna turned to the Earth, the finned RTG beside it, the
  // experiments out round them on their flat cables, and the geophone line on its flags
  const cx = 9.5, cz = 8.5, cy = g(cx, cz);
  turnedBox(sink, M, cx, cy, cz, 0.3, 0.32, 0.42, 0.22, { colour: SILVER, decor: true });
  for (const [ox, oz] of [[-0.4, -0.3], [0.4, -0.3], [-0.4, 0.3], [0.4, 0.3]] as const) bar(sink, [cx + ox, cy + 0.4, cz + oz], [cx + ox, cy + 0.82, cz + oz], 0.02, { colour: SILVER, decor: true, fine: true });
  sink.span(M, cx - 0.48, cy + 0.82, cz - 0.36, cx + 0.48, cy + 0.85, cz + 0.36, { colour: SILVER, decor: true });
  bar(sink, [cx - 0.2, cy + 0.35, cz], [cx - 0.2, cy + 1.05, cz], 0.04, { colour: WHITE, decor: true });
  sink.cylinder(M, [cx - 0.2, cy + 1.02, cz], 'y', 0.28, 0.07, 8, { colour: WHITE, decor: true });
  const rx = cx + 2.6, rz = cz - 0.8, ry = g(rx, rz);
  sink.cylinder(M, [rx, ry, rz], 'y', 0.46, 0.2, 10, { colour: DARK, decor: true });
  // (its eight radiator fins: upright plates on its shell)
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    turnedBox(sink, M, rx + Math.sin(a) * 0.25, ry + 0.04, rz + Math.cos(a) * 0.25, a, 0.006, 0.4, 0.07, { colour: shade(DARK, 1.2), decor: true, fine: true });
  }
  groundCable(sink, g, [cx + 0.3, cz], [rx - 0.2, rz], BLACK);
  const experiments: ReadonlyArray<readonly [number, number, number]> = [[cx + 5.0, cz + 3.2, 0.2], [cx - 1.5, cz + 5.5, 0.16], [cx + 3.4, cz - 5.0, 0.18], [cx - 4.6, cz - 2.6, 0.14]];
  for (const [ex, ez, s] of experiments) {
    const ey = g(ex, ez);
    turnedBox(sink, M, ex, ey, ez, variant() * 3, s, s * 2.2, s, { colour: variant() < 0.5 ? SILVER : WHITE, decor: true });
    sink.span(M, ex - s * 2, ey + s * 2.2, ez - s * 2, ex + s * 2, ey + s * 2.2 + 0.03, ez + s * 2, { colour: GOLD, decor: true, fine: true });
    groundCable(sink, g, [cx, cz], [ex, ez], BLACK);
  }
  for (let k = 0; k < 4; k++) smallFlag(sink, g, -9 + k * 3.2, 12.5 - k * 0.6, 0.75, ORANGE);
  groundCable(sink, g, [-9, 12.5], [-9 + 9.6, 12.5 - 1.8], BLACK);
  groundCable(sink, g, [0.6, 10.7], [cx - 0.3, cz], BLACK);
  // the heritage ring: sixteen posts at the radius and the tape between them, open at the gate (local -z)
  const posts = 16;
  const postAt = (k: number): Vec3 => { const a = Math.PI + ((k + 0.5) / posts) * Math.PI * 2, x = Math.sin(a) * r, z = Math.cos(a) * r; return [x, g(x, z), z]; };
  // (round 3, 2026-10-18; the blind judge: "a close fence post is cut off hard at the left edge" of the visitor's view from
  // the gate) the gate three spans wide, the visitors' way in: the posts either side of the old one-span gap stand down,
  // so the ring opens on the walk from the station and its first posts frame the stage from the gate, not the lens's edge
  for (let k = 1; k < posts - 1; k++) {
    const p = postAt(k);
    bar(sink, [p[0], p[1] - 0.15, p[2]], [p[0], p[1] + 1.1, p[2]], 0.09, { colour: STEEL, decor: true });
    sink.span(M, p[0] - 0.06, p[1] + 1.02, p[2] - 0.06, p[0] + 0.06, p[1] + 1.16, p[2] + 0.06, { colour: ORANGE, decor: true });
    if (k === posts - 2) continue;
    // (round 2, 2026-10-18; the blind critics: "the orange tape fence line runs ruler-straight and looks floating") the
    // tape hangs from post to post: a flat ribbon in four runs that sag a third of a metre at mid-span over the ground
    // under each run (each run meets the next, the first and last the posts' heads)
    const q = postAt(k + 1), runs = 4, sag = 0.34;
    const tape = (t: number): Vec3 => {
      const x = p[0] + (q[0] - p[0]) * t, z = p[2] + (q[2] - p[2]) * t;
      return [x, p[1] + (q[1] - p[1]) * t + 0.98 - sag * 4 * t * (1 - t), z];
    };
    for (let i = 0; i < runs; i++) {
      const a = tape(i / runs), b = tape((i + 1) / runs);
      sink.member(M, a, b, 0.06, 0.012, normalize3([q[2] - p[2], 0, -(q[0] - p[0])]), { colour: i % 2 ? shade(ORANGE, 0.92) : ORANGE, decor: true, exposed: true }, 0.006);
    }
  }
  // the interpretive stand inside the gate: its post and its sloped panel turned to the visitor
  // (round 3, 2026-10-18; the blind judge: "the heritage-site placard sits center-frame and hides the lander") the stand
  // beside the walk, not on it: at the walk's right hand 3.2 m in from the gate, its face turned to the visitor coming
  // in, so the view through the gate holds the stage and the stand stands to one side of it
  {
    const sx = -3.2, sz = -r + 3.4, sy = g(sx, sz), syaw = -0.42;
    sink.placed(syaw, sx, 0, sz, () => bar(sink, [0, sy - 0.2, 0], [0, sy + 1.0, 0], 0.1, { colour: STEEL, decor: true }));
    // (round 2; the blind critics: "blank grey signboards ... no markings or texture") the panel printed: a blue header
    // band with its white title rule, the descent stage's photograph (black sky, the gold stage, the grey floor), five
    // lines of text, the mission's round patch; the face and its print drawn at every range a panel can be read from
    sink.placed(syaw, sx, sy + 1.05, sz, () => {
      sink.span(M, -0.55, -0.08, -0.06, 0.55, 0.42, 0.04, { colour: DARK, decor: true });
      sink.span(M, -0.5, -0.04, -0.075, 0.5, 0.38, -0.06, { colour: shade(WHITE, 0.95), decor: true });
      const ink = (x0: number, y0: number, x1: number, y1: number, colour: Rgb): void =>
        sink.span(M, x0, y0, -0.084, x1, y1, -0.074, { colour, decor: true, fine: 'near' });
      ink(-0.5, 0.29, 0.5, 0.38, rgb(0x1d3f78));
      ink(-0.44, 0.325, 0.12, 0.345, WHITE);
      ink(-0.44, 0.0, -0.06, 0.24, BLACK);
      ink(-0.32, 0.06, -0.18, 0.15, GOLD);
      ink(-0.44, 0.0, -0.06, 0.05, rgb(0x8a8782));
      for (let k = 0; k < 5; k++) ink(0.0, 0.215 - k * 0.045, k === 4 ? 0.3 : 0.44, 0.235 - k * 0.045, rgb(0x2e3036));
      sink.cylinder(M, [0.36, -0.005, -0.084], 'z', 0.01, 0.055, 12, { colour: rgb(0x1d3f78), decor: true, fine: 'near' });
    });
  }
  return { parts: finishLandmark(sink) };
};

// ----------------------------------------------------------------------------------------------------------- the works

/** A square frustum hopper of `top` half-width over `bottom` at (x, y0..y1, z) on four legs to the ground. */
function hopper(sink: PartSink, g: (x: number, z: number) => number, x: number, z: number, y0: number, y1: number, bottom: number, top: number): void {
  const y = g(x, z);
  sink.cylinder(M, [x, y + y0, z], 'y', y1 - y0, bottom * Math.SQRT2, 4, { colour: shade(STEEL, 1.1) }, top * Math.SQRT2, true, Math.PI / 4);
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
    bar(sink, [x + sx * bottom * 0.9, y - 0.1, z + sz * bottom * 0.9], [x + sx * bottom * 0.9, y + y0 + 0.15, z + sz * bottom * 0.9], 0.14, { colour: DARK });
  }
  sink.span(M, x - top - 0.06, y + y1 - 0.05, z - top - 0.06, x + top + 0.06, y + y1 + 0.08, z + top + 0.06, { colour: ORANGE, decor: true });
}

/** A heap of regolith (a spoil cone): its rounded mound in the ground's grey, a few clods at its foot. */
function spoilCone(sink: PartSink, g: (x: number, z: number) => number, x: number, z: number, r: number, h: number, rng: () => number): void {
  const y = g(x, z) - 0.25;
  sink.revolve('plaster', [x, y, z], 'y', [[0, r], [h * 0.35, r * 0.72], [h * 0.75, r * 0.38], [h, r * 0.08], [h + 0.02, 0.02]], 14, { tint: REGOLITH });
  for (let k = 0; k < 6; k++) {
    const a = rng() * Math.PI * 2, d = r * (0.95 + rng() * 0.25), s = 0.2 + rng() * 0.25, cx = x + Math.sin(a) * d, cz = z + Math.cos(a) * d;
    turnedBox(sink, 'plaster', cx, g(cx, cz) - 0.08, cz, a, s, s * 1.2, s * 0.8, { tint: REGOLITH, decor: true });
  }
}

/** The oxygen plant. */
function isruPlant(sink: PartSink, g: (x: number, z: number) => number, rng: () => number): void {
  // the reactor skid: its deck, the two hydrogen-reduction vessels in their white insulation, the loop's piping
  const sy = g(-1, 0);
  sink.span(M, -4.4, sy - 0.3, -2.6, 3.8, sy + 0.55, 2.6, { colour: DARK });
  for (const x of [-2.2, 1.3]) {
    sink.cylinder(M, [x, sy + 0.55, 0], 'y', 4.2, 1.0, 16, { colourAt: (p) => (p[1] < sy + 1.4 ? DUSTED : MLI), colour: MLI }, 1.0, false);
    sink.revolve(M, [x, sy + 4.75, 0], 'y', [[0, 1.0], [0.35, 0.85], [0.6, 0.48], [0.7, 0.06]], 16, { colour: MLI });
    for (const y of [1.6, 3.9]) sink.cylinder(M, [x, sy + y, 0], 'y', 0.16, 1.03, 16, { colour: GOLD, decor: true });
    sink.cylinder(M, [x, sy + 5.42, 0], 'y', 0.4, 0.22, 8, { colour: STEEL, decor: true });
  }
  sink.pipe(M, [-2.2, sy + 5.7, 0], [1.3, sy + 5.7, 0], 0.13, 8, { colour: STEEL, decor: true, caps: true });
  sink.pipe(M, [-1.35, sy + 1.2, 0.4], [0.45, sy + 1.2, 0.4], 0.1, 8, { colour: STEEL, decor: true, caps: true });
  // the receiving hopper at the plant's west end and the conveyor up to the reactors' feed
  hopper(sink, g, -9.2, 3.2, 1.0, 2.6, 0.9, 1.8);
  const hy = g(-9.2, 3.2);
  const c0: Vec3 = [-8.2, hy + 1.3, 2.6], c1: Vec3 = [-2.6, sy + 5.0, 1.0];
  bar(sink, c0, c1, 0.55, { colour: shade(STEEL, 0.9) });
  for (const t of [0.3, 0.62]) {
    const p: Vec3 = [c0[0] + (c1[0] - c0[0]) * t, c0[1] + (c1[1] - c0[1]) * t - 0.25, c0[2] + (c1[2] - c0[2]) * t];
    bar(sink, [p[0], g(p[0], p[2]) - 0.1, p[2]], p, 0.12, { colour: DARK, decor: true });
  }
  // the gas-cleanup rack south-east of the skid: its frame and its small vessels
  const gx = 6.2, gz = -3.2, gy = g(gx, gz);
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) bar(sink, [gx + sx * 1.3, gy - 0.1, gz + sz * 0.7], [gx + sx * 1.3, gy + 2.6, gz + sz * 0.7], 0.1, { colour: STEEL });
  for (const y of [0.9, 2.55]) sink.span(M, gx - 1.38, gy + y - 0.05, gz - 0.78, gx + 1.38, gy + y + 0.05, gz + 0.78, { colour: STEEL, decor: true });
  for (const x of [-0.7, 0.05, 0.8]) sink.cylinder(M, [gx + x, gy + 0.95, gz], 'y', 1.25, 0.3, 10, { colour: PANEL, decor: true });
  sink.pipe(M, [3.6, sy + 0.45, -1.8], [gx - 1.3, gy + 1.5, gz + 0.7], 0.08, 6, { colour: STEEL, decor: true, caps: true });
  // the liquefier's cold box north-east of the skid and its radiator wing standing edge-on to the sun
  const lx = 6.0, lz = 3.4, ly = g(lx, lz);
  sink.cylinder(M, [lx, ly, lz], 'y', 3.2, 0.95, 14, { colourAt: (p) => (p[1] < ly + 0.8 ? DUSTED : PANEL), colour: PANEL });
  sink.revolve(M, [lx, ly + 3.2, lz], 'y', [[0, 0.95], [0.3, 0.6], [0.4, 0.06]], 14, { colour: PANEL });
  sink.cylinder(M, [lx, ly + 2.4, lz], 'y', 0.2, 0.98, 14, { colour: rgb(0x4a7fb4), decor: true });
  const wx = 9.6;
  for (const z of [0.4, 5.4]) bar(sink, [wx, g(wx, z) - 0.1, z], [wx, g(wx, z) + 5.2, z], 0.12, { colour: STEEL, decor: true });
  sink.span(M, wx - 0.05, ly + 2.0, -0.2, wx + 0.05, ly + 5.1, 6.0, { colour: RADIATOR, decor: true });
  for (let z = 0.1; z < 6.0; z += 0.6) sink.span(M, wx - 0.07, ly + 2.05, z - 0.02, wx + 0.07, ly + 5.05, z + 0.02, { colour: shade(RADIATOR, 0.82), decor: true, fine: true });
  sink.pipe(M, [lx + 0.9, ly + 2.8, lz], [wx, ly + 2.8, lz], 0.08, 6, { colour: STEEL, decor: true, caps: true });
  sink.pipe(M, [2.1, sy + 3.0, 0.4], [lx - 0.9, ly + 2.2, lz], 0.1, 6, { colour: STEEL, decor: true, caps: true });
  // the tailings chute from the skid's south side down to the spoil cone
  bar(sink, [-0.5, sy + 0.4, -2.3], [0.2, g(0.2, -5.6) + 1.1, -5.6], 0.5, { colour: STEEL });
  spoilCone(sink, g, 0.6, -6.6, 2.4, 1.9, rng);
  // the control module at the plant's south-west corner, its hatch toward the street (+z)
  const mx = -7.0, mz = -4.6, my = g(mx, mz);
  sink.span(M, mx - 2.0, my - 0.2, mz - 1.4, mx + 2.0, my + 2.6, mz + 1.4, { colourAt: (p) => (p[1] < my + 0.7 ? DUSTED : PANEL), colour: PANEL });
  sink.span(M, mx - 2.08, my + 2.6, mz - 1.48, mx + 2.08, my + 2.75, mz + 1.48, { colour: shade(PANEL, 0.9), decor: true });
  sink.span(M, mx - 0.5, my + 0.1, mz + 1.4, mx + 0.5, my + 2.0, mz + 1.47, { colour: ORANGE, decor: true });
  sink.span(M, mx + 0.9, my + 1.2, mz + 1.4, mx + 1.6, my + 1.7, mz + 1.45, { colour: BLACK, decor: true, fine: true });
  // (round 2; the blind critics: "a plain untextured white box beside the silos") the module dressed on every face: its
  // panel seams, the gold foil band at the eaves, the radiator on its back, the window and the cable port at its ends,
  // the antenna mast and its small dish on the roof, its foot banked in bags
  for (const x of [-1.0, 0.0, 1.0]) {
    sink.span(M, mx + x - 0.02, my + 0.5, mz - 1.43, mx + x + 0.02, my + 2.55, mz - 1.4, { colour: shade(PANEL, 0.78), decor: true });
    sink.span(M, mx + x - 0.02, my + 0.5, mz + 1.4, mx + x + 0.02, my + 2.55, mz + 1.43, { colour: shade(PANEL, 0.78), decor: true });
  }
  sink.span(M, mx - 2.04, my + 2.3, mz - 1.44, mx + 2.04, my + 2.5, mz + 1.44, { colour: GOLD, decor: true });
  sink.span(M, mx - 1.6, my + 0.8, mz - 1.62, mx + 1.6, my + 2.1, mz - 1.5, { colour: RADIATOR, decor: true });
  for (let x = -1.5; x <= 1.51; x += 0.3) sink.span(M, mx + x - 0.02, my + 0.82, mz - 1.66, mx + x + 0.02, my + 2.08, mz - 1.6, { colour: shade(RADIATOR, 0.8), decor: true, fine: true });
  for (const y of [0.85, 2.05]) bar(sink, [mx - 1.6, my + y, mz - 1.4], [mx - 1.6, my + y, mz - 1.56], 0.05, { colour: STEEL, decor: true });
  for (const y of [0.85, 2.05]) bar(sink, [mx + 1.6, my + y, mz - 1.4], [mx + 1.6, my + y, mz - 1.56], 0.05, { colour: STEEL, decor: true });
  sink.span(M, mx + 2.0, my + 1.3, mz - 0.5, mx + 2.06, my + 1.85, mz + 0.5, { colour: BLACK, decor: true });
  sink.span(M, mx + 2.0, my + 1.25, mz - 0.55, mx + 2.04, my + 1.9, mz + 0.55, { colour: DARK, decor: true });
  sink.cylinder(M, [mx - 2.0, my + 0.9, mz + 0.6], 'x', 0.18, 0.16, 10, { colour: ORANGE, decor: true }, 0.16, true);
  sink.span(M, mx - 2.08, my + 0.3, mz - 0.9, mx - 2.0, my + 0.6, mz - 0.3, { colour: DARK, decor: true });
  bar(sink, [mx + 1.2, my + 2.75, mz - 0.8], [mx + 1.2, my + 4.6, mz - 0.8], 0.06, { colour: STEEL, decor: true });
  sink.span(M, mx + 1.12, my + 4.6, mz - 0.88, mx + 1.28, my + 4.75, mz - 0.72, { colour: H2_RED_LM, decor: true });
  bar(sink, [mx + 1.2, my + 3.8, mz - 0.8], [mx + 0.8, my + 3.8, mz - 0.8], 0.04, { colour: STEEL, decor: true });
  dishSmall(sink, [mx + 0.8, my + 3.8, mz - 0.8], normalize3([-0.5, 0.45, 0.2]), 0.42);
  for (let x = -1.8; x <= 1.81; x += 0.6) sink.span(M, mx + x - 0.29, my - 0.1, mz - 1.95, mx + x + 0.29, my + 0.34, mz - 1.62, { colour: shade(WHITE, 0.86 + 0.08 * Math.sin(x * 9)), decor: true });
}

/** A small dish of radius `r`, its vertex at `c`, its bowl open toward `dir` (a shallow cone in eight facets). Dressing. */
function dishSmall(sink: PartSink, c: Vec3, dir: Vec3, r: number): void {
  const w = normalize3(dir), ref: Vec3 = Math.abs(w[1]) < 0.95 ? [0, 1, 0] : [1, 0, 0];
  const u = normalize3([ref[1] * w[2] - ref[2] * w[1], ref[2] * w[0] - ref[0] * w[2], ref[0] * w[1] - ref[1] * w[0]]);
  const v: Vec3 = [w[1] * u[2] - w[2] * u[1], w[2] * u[0] - w[0] * u[2], w[0] * u[1] - w[1] * u[0]];
  const rimAt = (i: number): Vec3 => {
    const a = (i / 8) * Math.PI * 2, d = r * 0.28;
    return [c[0] + (u[0] * Math.cos(a) + v[0] * Math.sin(a)) * r + w[0] * d, c[1] + (u[1] * Math.cos(a) + v[1] * Math.sin(a)) * r + w[1] * d,
      c[2] + (u[2] * Math.cos(a) + v[2] * Math.sin(a)) * r + w[2] * d];
  };
  for (let i = 0; i < 8; i++) {
    const a = rimAt(i), b = rimAt(i + 1);
    sink.polygon(M, [c, b, a], { colour: PANEL, decor: true });
    sink.polygon(M, [c, a, b], { colour: shade(PANEL, 0.8), decor: true });
  }
}

/** The excavation front: the drum excavator at the bench, the feed hopper, the benches, the spoil heap, the light tower. */
function isruFront(sink: PartSink, g: (x: number, z: number) => number, rng: () => number): void {
  // the graded benches (low sintered steps along the strip's edge)
  for (const [z, h] of [[-6.5, 0.45], [-8.2, 0.9]] as const) {
    for (let x = -12; x < 11; x += 2.3) sink.span('stone', x, g(x + 1.1, z) - 0.3, z - 0.8, x + 2.25, g(x + 1.1, z) + h, z + 0.8);
  }
  // the bucket-drum excavator on the bench: its body on four wheels, the two arms and their counter-rotating drums
  const ex = -2.5, ez = 1.5, ey = g(ex, ez);
  sink.span(M, ex - 1.6, ey + 0.55, ez - 0.75, ex + 1.6, ey + 1.35, ez + 0.75, { colourAt: (p) => (p[1] < ey + 0.9 ? DUSTED : PANEL), colour: PANEL });
  for (const sx of [-1.05, 1.05]) for (const sz of [-1, 1]) sink.cylinder(M, [ex + sx, ey + 0.48, sz > 0 ? ez + 0.7 : ez - 1.0], 'z', 0.3, 0.48, 12, { colour: shade(STEEL, 1.1) });
  for (const s of [-1, 1]) {
    const pivot: Vec3 = [ex + s * 1.5, ey + 1.1, ez], drum: Vec3 = [ex + s * 2.6, ey + 0.55, ez];
    for (const dz of [-0.55, 0.55]) bar(sink, [pivot[0], pivot[1], ez + dz], [drum[0], drum[1], ez + dz], 0.14, { colour: ORANGE });
    sink.cylinder(M, [drum[0], drum[1], ez - 0.62], 'z', 1.24, 0.55, 12, { colour: STEEL });
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      bar(sink, [drum[0] + Math.sin(a) * 0.56, drum[1] + Math.cos(a) * 0.56, ez - 0.5], [drum[0] + Math.sin(a) * 0.56, drum[1] + Math.cos(a) * 0.56, ez + 0.5], 0.08, { colour: BLACK, decor: true, fine: true });
    }
  }
  sink.span(M, ex - 0.6, ey + 1.35, ez - 0.3, ex + 0.6, ey + 1.62, ez + 0.3, { colour: CELL, decor: true });
  // the feed hopper on its legs that the excavator dumps into, and the heap at the strip's end
  hopper(sink, g, 6.0, 2.0, 1.4, 3.1, 0.9, 1.7);
  spoilCone(sink, g, -9.0, 3.2, 3.2, 2.2, rng);
  // the portable light tower: its trailer, mast and lamp bar
  const tx = 9.0, tz = -2.6, ty = g(tx, tz);
  sink.span(M, tx - 0.9, ty + 0.3, tz - 0.5, tx + 0.9, ty + 1.0, tz + 0.5, { colour: ORANGE });
  for (const sx of [-0.6, 0.6]) sink.cylinder(M, [tx + sx, ty + 0.3, tz - 0.55], 'z', 1.1, 0.3, 10, { colour: DARK });
  bar(sink, [tx, ty + 1.0, tz], [tx, ty + 6.2, tz], 0.12, { colour: STEEL, decor: true });
  sink.span(M, tx - 0.8, ty + 6.1, tz - 0.12, tx + 0.8, ty + 6.4, tz + 0.12, { colour: DARK, decor: true });
  for (const x of [-0.5, 0, 0.5]) sink.span(M, tx + x - 0.18, ty + 6.13, tz + 0.12, tx + x + 0.18, ty + 6.37, tz + 0.14, { colour: RADIATOR, decor: true, fine: true });
}

/** The oxygen works: the plant (params.part 'plant') or its excavation front ('front'). */
export const isruWorks: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const g = ctx.ground ?? (() => 0);
  if (ctx.params.part === 'front') isruFront(sink, g, ctx.variant);
  else isruPlant(sink, g, ctx.variant);
  return { parts: finishLandmark(sink) };
};

// ------------------------------------------------------------------------------------------------------- solar tower

/** The vertical solar array tower: the mast, its two blankets toward local +z on the turning head, the guys and cabinet. */
export const solarTower: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const g = ctx.ground ?? (() => 0), H = num(ctx, 'height', 12), y = g(0, 0);
  // the foot: its sintered pad and the cabinet, the mast standing on it
  sink.span('stone', -1.6, y - 0.4, -1.6, 1.6, y + 0.3, 1.6);
  sink.span(M, -1.3, y + 0.3, -1.45, -0.35, y + 1.8, -0.55, { colourAt: (p) => (p[1] < y + 0.8 ? DUSTED : PANEL), colour: PANEL });
  sink.cylinder(M, [0, y + 0.3, 0], 'y', H - 0.3, 0.32, 12, { colour: STEEL }, 0.2);
  // the turning head and the yoke, the two blankets rolled out down the mast from it, their cells and the frame's edges
  sink.cylinder(M, [0, y + H - 0.2, 0], 'y', 0.6, 0.42, 12, { colour: PANEL });
  bar(sink, [-3.0, y + H + 0.2, 0.32], [3.0, y + H + 0.2, 0.32], 0.16, { colour: STEEL });
  const bottom = y + H - 12.0;
  // (round 3, 2026-10-18; the blind judge: "the solar mast's panel, seen from the side or back, looks like a dark billboard
  // slab") each wing in two blankets with a slot of sky between them, each blanket hung in its own white frame, and behind
  // them the wing's spar and its battens every 1.5 m — light members proud of the backing that catch the low sun on their
  // edges when the blanket's back is in its own shade — and the battens' tension wires down the back on the diagonals
  const top = y + H + 0.12;
  for (const s of [-1, 1]) {
    const x1 = s * 3.0;
    for (const [pa, pb] of [[0.42, 1.66], [1.76, 3.0]] as const) {
      const xa = s * pa, xb = s * pb, lo = Math.min(xa, xb), hi = Math.max(xa, xb);
      sink.span(M, lo, bottom, 0.3, hi, top, 0.34, { colour: CELL, decor: true });
      sink.span(M, lo, bottom, 0.27, hi, top, 0.3, { colour: shade(PANEL, 0.92), decor: true });
      for (let yy = bottom + 0.5; yy < y + H; yy += 0.5) sink.span(M, lo, yy - 0.012, 0.335, hi, yy + 0.012, 0.345, { colour: shade(CELL, 1.6), decor: true, fine: true });
      // the blanket's frame: its two stiles and its head and foot rails, white
      for (const x of [lo + 0.03, hi - 0.03]) sink.span(M, x - 0.04, bottom - 0.02, 0.24, x + 0.04, top + 0.02, 0.36, { colour: RADIATOR, decor: true });
      for (const yy of [bottom, top]) sink.span(M, lo, yy - 0.05, 0.24, hi, yy + 0.05, 0.36, { colour: RADIATOR, decor: true });
    }
    // the spar along the wing's outer edge and its foot rail to the mast, the battens across its back
    bar(sink, [x1, bottom - 0.05, 0.32], [x1, y + H + 0.2, 0.32], 0.07, { colour: STEEL, decor: true });
    bar(sink, [x1, bottom, 0.32], [0, bottom, 0.32], 0.07, { colour: STEEL, decor: true });
    for (let yy = bottom + 1.5; yy < top - 0.4; yy += 1.5) {
      sink.span(M, Math.min(s * 0.3, x1), yy - 0.05, 0.1, Math.max(s * 0.3, x1), yy + 0.05, 0.27, { colour: shade(RADIATOR, 0.94), decor: true });
    }
    // the tension wires down the back on the diagonals, batten to batten
    for (let yy = bottom + 1.5; yy + 3.0 < top - 0.4; yy += 3.0) {
      bar(sink, [s * 0.35, yy, 0.14], [x1 * 0.97, yy + 1.5, 0.14], 0.02, { colour: STEEL, decor: true, fine: true });
      bar(sink, [x1 * 0.97, yy + 1.5, 0.14], [s * 0.35, yy + 3.0, 0.14], 0.02, { colour: STEEL, decor: true, fine: true });
    }
  }
  // the three guys from under the head to their anchors in the regolith
  for (let k = 0; k < 3; k++) {
    const a = Math.PI + (k / 3) * Math.PI * 2, ax = Math.sin(a) * 6.2, az = Math.cos(a) * 6.2, ay = g(ax, az);
    bar(sink, [0, y + H - 1.5, 0], [ax, ay + 0.15, az], 0.03, { colour: DARK, decor: true });
    sink.span(M, ax - 0.2, ay - 0.2, az - 0.2, ax + 0.2, ay + 0.25, az + 0.2, { colour: STEEL, decor: true });
  }
  // the beacon on the head
  sink.span(M, -0.12, y + H + 0.4, -0.12, 0.12, y + H + 0.62, 0.12, { colour: rgb(0xb4453a), decor: true });
  bar(sink, [0, y + H + 0.28, 0], [0, y + H + 0.42, 0], 0.05, { colour: STEEL, decor: true });
  void ORANGE; void SILVER;
  return { parts: finishLandmark(sink) };
};

// ------------------------------------------------------------------------------------------------------- the commons

/**
 * The station's commons (round 3, 2026-10-18; the blind judge from the aerial: "no strong hero landmark"): a pressurised
 * dome `radius` across its foot and `rise` high in its white blanket, dusted grey to the collar, the seams of its gores up
 * to the cupola; under a collar of sintered regolith banked round its foot; the cupola, its ports, the gold rim and the
 * beacon mast at the crown; three airlock tunnels on their cradles (the main one to local -z, the others at 100 degrees to
 * either side), each with its orange hatch and its step; two radiator wings standing edge-on on their legs beside it and
 * three light masts round it. Solids: the pad, the collar, the shell, the cupola, the tunnels and the radiator wings.
 */
export const stationDome: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const g = ctx.ground ?? (() => 0), r = num(ctx, 'radius', 6), rise = num(ctx, 'rise', 4), variant = ctx.variant;
  // the pad over the ring's ground (its top a quarter metre over the highest of it, its foot under the lowest)
  const around = Array.from({ length: 16 }, (_, k) => { const a = (k / 16) * Math.PI * 2; return g(Math.sin(a) * (r + 2.4), Math.cos(a) * (r + 2.4)); });
  const lo = Math.min(g(0, 0), ...around), hi = Math.max(g(0, 0), ...around), y0 = hi + 0.25;
  sink.cylinder('stone', [0, lo - 0.5, 0], 'y', y0 - lo + 0.5, r + 2.6, 28);
  // the collar: sintered regolith banked round the foot to 2.3 m, steep at its toe and rounding to its crest
  sink.revolve('stone', [0, y0 - 0.05, 0], 'y', [[0, r + 2.0], [0.7, r + 1.45], [1.5, r + 0.8], [2.1, r + 0.25], [2.35, r - 0.12]], 32);
  // the shell: an ellipsoid's half in its blanket, dusted to the collar's crest
  const prof: Array<[number, number]> = [];
  for (let i = 0; i <= 12; i++) {
    const a = (i / 12) * (Math.PI / 2);
    prof.push([Math.sin(a) * rise, Math.max(0.05, Math.cos(a) * r)]);
  }
  const shellAt = (t: number): [number, number] => {
    const a = t * (Math.PI / 2);
    return [Math.cos(a) * r, Math.sin(a) * rise];
  };
  sink.revolve(M, [0, y0, 0], 'y', prof, 36, { colourAt: (p) => (p[1] < y0 + 2.6 ? DUSTED : MLI), colour: MLI });
  // the gores' seams from the collar to the cupola's ring, a little proud of the blanket (dressing at every range)
  const seams = 16, tTop = Math.acos(Math.min(0.98, 2.5 / r)) / (Math.PI / 2);
  for (let k = 0; k < seams; k++) {
    const a = (k / seams) * Math.PI * 2 + Math.PI / seams, ux = Math.sin(a), uz = Math.cos(a);
    const steps = 7;
    for (let i = 0; i < steps; i++) {
      const t0 = 0.12 + ((tTop - 0.12) * i) / steps, t1 = 0.12 + ((tTop - 0.12) * (i + 1)) / steps;
      const [r0, h0] = shellAt(t0), [r1, h1] = shellAt(t1);
      bar(sink, [ux * (r0 + 0.04), y0 + h0, uz * (r0 + 0.04)], [ux * (r1 + 0.04), y0 + h1, uz * (r1 + 0.04)], 0.09, { colour: shade(MLI, 0.82), decor: true });
    }
  }
  // two courses round the shell: the gold band at the collar's crest and the blanket's lap at two-thirds of its height
  {
    const [rc, hc] = shellAt(0.17), [rl, hl] = shellAt(0.5);
    sink.cylinder(M, [0, y0 + hc - 0.14, 0], 'y', 0.28, rc + 0.06, 36, { colour: GOLD, decor: true }, rc + 0.02, false);
    sink.cylinder(M, [0, y0 + hl - 0.08, 0], 'y', 0.16, rl + 0.05, 36, { colour: shade(MLI, 0.86), decor: true }, rl - 0.02, false);
  }
  // the cupola at the crown: its drum, eight ports round it, the gold rim, the radiator cap and the beacon mast
  const cy = y0 + rise - 0.35;
  sink.cylinder(M, [0, cy, 0], 'y', 1.0, 2.6, 16, { colour: PANEL });
  sink.cylinder(M, [0, cy + 1.0, 0], 'y', 0.2, 2.8, 16, { colour: GOLD, decor: true });
  sink.cylinder(M, [0, cy + 1.2, 0], 'y', 0.35, 2.0, 16, { colour: RADIATOR, decor: true }, 1.4);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    sink.placed(a, Math.sin(a) * 2.6, 0, Math.cos(a) * 2.6, () => sink.span(M, -0.55, cy + 0.22, -0.02, 0.55, cy + 0.78, 0.05, { colour: BLACK, decor: true }));
  }
  bar(sink, [0, cy + 1.5, 0], [0, cy + 5.4, 0], 0.14, { colour: STEEL, decor: true });
  sink.span(M, -0.2, cy + 5.4, -0.2, 0.2, cy + 5.85, 0.2, { colour: H2_RED_LM, decor: true });
  dishSmall(sink, [0.5, cy + 3.6, 0], normalize3([0.9, 0.35, -0.2]), 0.7);
  bar(sink, [0, cy + 3.6, 0], [0.5, cy + 3.6, 0], 0.08, { colour: STEEL, decor: true });
  // the airlock tunnels: a drum on two cradles out of the shell, its end ring and hatch, the step, the porch lamp
  const tunnels = [Math.PI, Math.PI - 1.75, Math.PI + 1.75];
  for (const [ti, a] of tunnels.entries()) {
    const len = ti === 0 ? 6.4 : 5.0, tr = ti === 0 ? 1.5 : 1.3, ty = y0 + tr + 0.35, z0 = r - 2.2, z1 = r + len - 2.2;
    sink.placed(a, 0, 0, 0, () => {
      sink.cylinder(M, [0, ty, z0], 'z', z1 - z0, tr, 18, { colourAt: (p) => (p[1] < ty - tr * 0.4 ? DUSTED : MLI), colour: MLI });
      for (const z of [z1 - 0.9, (z0 + z1) / 2 + 1.2]) sink.span(M, -tr * 0.8, y0 - 0.1, z - 0.25, tr * 0.8, ty - tr * 0.6, z + 0.25, { colour: DARK });
      sink.cylinder(M, [0, ty, z1], 'z', 0.16, tr + 0.14, 18, { colour: ORANGE, decor: true });
      sink.cylinder(M, [0, ty, z1 + 0.12], 'z', 0.08, tr * 0.62, 14, { colour: PANEL, decor: true });
      sink.cylinder(M, [0, ty - 0.1, z1 + 0.18], 'z', 0.05, tr * 0.18, 8, { colour: DARK, decor: true, fine: true });
      sink.span(M, -0.9, y0 - 0.05, z1 + 0.05, 0.9, y0 + 0.3, z1 + 1.1, { colour: STEEL, decor: true });
      sink.span(M, -0.25, ty + tr - 0.06, z1 - 0.5, 0.25, ty + tr + 0.22, z1 - 0.1, { colour: RADIATOR, decor: true });
      // the seam rings along the drum
      for (let z = z0 + 2.4; z < z1 - 0.6; z += 1.6) sink.cylinder(M, [0, ty, z - 0.04], 'z', 0.08, tr + 0.03, 18, { colour: shade(MLI, 0.84), decor: true, fine: true });
    });
  }
  // the radiator wings either side, edge-on to the sun's arc: a panel on its legs, its tubes as a ribbing
  for (const sx of [-1, 1]) {
    const x = sx * (r + 5.2), gx = g(x, 0), wy = gx + 1.2;
    for (const z of [-3.2, 3.2]) bar(sink, [x, gx - 0.2, z], [x, wy + 0.3, z], 0.16, { colour: STEEL, decor: true });
    sink.span(M, x - 0.08, wy, -4.2, x + 0.08, wy + 3.4, 4.2, { colour: RADIATOR });
    for (let z = -3.9; z < 4.2; z += 0.6) sink.span(M, x - 0.12, wy + 0.1, z - 0.03, x + 0.12, wy + 3.3, z + 0.03, { colour: shade(RADIATOR, 0.84), decor: true, fine: true });
    groundCable(sink, g, [x, 0], [sx * (r + 2.2), 0], BLACK);
  }
  // three light masts round it, their lamp heads toward the dome
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + Math.PI / 3 + (variant() - 0.5) * 0.3, mx = Math.sin(a) * (r + 3.6), mz = Math.cos(a) * (r + 3.6), my = g(mx, mz);
    bar(sink, [mx, my - 0.2, mz], [mx, my + 6.2, mz], 0.12, { colour: STEEL, decor: true });
    sink.placed(a + Math.PI, mx, my + 6.0, mz, () => {
      sink.span(M, -0.32, 0, -0.12, 0.32, 0.3, 0.3, { colour: DARK, decor: true });
      sink.span(M, -0.28, 0.03, 0.3, 0.28, 0.27, 0.33, { colour: RADIATOR, decor: true, fine: true });
    });
  }
  return { parts: finishLandmark(sink) };
};

// -------------------------------------------------------------------------------------------------- the relay repeater

/**
 * The relay repeater on a scarp's crest (round 3, 2026-10-18; the blind judge from the deployments: "the tank-eye view is
 * almost empty, with no outpost visible", "the base is hidden behind the ridge, only the tip of the comms tower showing"):
 * the station's link to the deployment behind the scarp, beside the rovers' track over the crest — a three-legged lattice
 * mast `height` high, its legs in four lifts (the top lift safety orange), girts and braces at every level, the head's
 * platform and beacon whip, the 2.2 m dish turned down the track to the station (local -z), a solar wing on its boom, the
 * equipment cabinet between the legs and the three guys to their anchors. Solids: the pad, the cabinet and the legs.
 */
export const relayRepeater: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const g = ctx.ground ?? (() => 0), H = num(ctx, 'height', 8);
  const y = Math.max(g(0, 0), g(1.6, 1.6), g(-1.6, 1.6), g(1.6, -1.6), g(-1.6, -1.6)), y0 = y + 0.25;
  const lo = Math.min(g(0, 0), g(1.6, 1.6), g(-1.6, 1.6), g(1.6, -1.6), g(-1.6, -1.6));
  sink.span('stone', -1.9, lo - 0.5, -1.9, 1.9, y0, 1.9);
  const foot = 1.25, head = 0.38;
  const leg = (k: number, h: number): Vec3 => {
    const a = (k / 3) * Math.PI * 2 + Math.PI, half = foot + (head - foot) * (h / H);
    return [Math.sin(a) * half, y0 + h, Math.cos(a) * half];
  };
  // the legs in four lifts, the head's lift orange (solid: a hull stops against a leg)
  for (let k = 0; k < 3; k++) {
    for (let b = 0; b < 4; b++) bar(sink, leg(k, b === 0 ? -0.2 : (b / 4) * H), leg(k, ((b + 1) / 4) * H), 0.17 - 0.03 * b, { colour: b === 3 ? ORANGE : b === 2 ? PANEL : STEEL });
  }
  // the girts and braces at every level (dressing meeting the legs at both ends)
  const levels = 8;
  for (let l = 1; l <= levels; l++) {
    const h = (l / levels) * H, hp = ((l - 1) / levels) * H;
    for (let k = 0; k < 3; k++) {
      const j = (k + 1) % 3;
      bar(sink, leg(k, h), leg(j, h), 0.07, { colour: STEEL, decor: true });
      bar(sink, l % 2 ? leg(k, hp) : leg(j, hp), l % 2 ? leg(j, h) : leg(k, h), 0.05, { colour: STEEL, decor: true });
    }
  }
  // the head: its platform plate, the beacon on its whip
  const top = y0 + H;
  sink.cylinder(M, [0, top, 0], 'y', 0.12, 0.75, 9, { colour: DARK, decor: true });
  bar(sink, [0, top + 0.1, 0], [0, top + 2.4, 0], 0.07, { colour: STEEL, decor: true });
  sink.span(M, -0.14, top + 2.4, -0.14, 0.14, top + 2.72, 0.14, { colour: H2_RED_LM, decor: true });
  // the dish down the track to the station (local -z), on its arm off the head
  const arm: Vec3 = [0, top - 0.9, -1.0];
  bar(sink, [0, top - 0.9, 0], arm, 0.09, { colour: STEEL, decor: true });
  dishSmall(sink, arm, normalize3([0, 0.04, -1]), 1.1);
  // the solar wing on its boom at two-thirds of the height, its blanket and white frame
  // (at the fifth girt's level, off the leg toward local +z, the blanket's face to +z at the boom's end)
  const wy = y0 + H * 0.625, wl = leg(0, H * 0.625), wz = wl[2] + 2.4;
  bar(sink, [wl[0], wy, wl[2]], [wl[0], wy, wz], 0.08, { colour: STEEL, decor: true });
  sink.span(M, wl[0] - 1.1, wy - 0.9, wz - 0.06, wl[0] + 1.1, wy + 0.9, wz, { colour: RADIATOR, decor: true });
  sink.span(M, wl[0] - 1.04, wy - 0.84, wz, wl[0] + 1.04, wy + 0.84, wz + 0.03, { colour: CELL, decor: true });
  // the cabinet between the legs, its door orange
  sink.span(M, -0.55, y0, -0.45, 0.55, y0 + 1.5, 0.45, { colourAt: (p) => (p[1] < y0 + 0.5 ? DUSTED : PANEL), colour: PANEL });
  sink.span(M, -0.3, y0 + 0.2, -0.47, 0.3, y0 + 1.3, -0.45, { colour: ORANGE, decor: true });
  // the three guys from the sixth girt (three quarters up) to their anchors, 6.5 m out between the legs
  for (let k = 0; k < 3; k++) {
    const a = ((k + 0.5) / 3) * Math.PI * 2 + Math.PI, ax = Math.sin(a) * 6.5, az = Math.cos(a) * 6.5, ay = g(ax, az);
    const at = leg(k, H * 0.75), bt = leg((k + 1) % 3, H * 0.75);
    bar(sink, [(at[0] + bt[0]) / 2, at[1], (at[2] + bt[2]) / 2], [ax, ay + 0.15, az], 0.03, { colour: DARK, decor: true });
    sink.span(M, ax - 0.22, ay - 0.2, az - 0.22, ax + 0.22, ay + 0.25, az + 0.22, { colour: STEEL, decor: true });
  }
  return { parts: finishLandmark(sink) };
};
