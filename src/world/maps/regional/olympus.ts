// src/world/maps/regional/olympus.ts — the Olympus Basin station kit (the looks lane, 2026-10-13; LOOKS-BRIEF section 6:
// "Mars and the Moon need a station kit ... Today they have only gantries and container rows (Mars)"). Olympus Basin is
// the future (periodClutterKit: 2100); the station's habitats, greenhouses, depots, masts and lander are its authored
// set pieces (marsSettlement.ts, structureKit's orbital families). Its plan's two generic types were the rail yard's —
// a gantry crane over sleepers and a row of ISO boxes, a goods yard on Mars. This kit builds them as the station would:
//   - gantry        the regolith works (ISRU): two piers of coursed sintered regolith blocks, a steel truss bridge across
//                   them with its walkway, its trolley and clamshell grab, the receiving hopper, the rotary kiln with its
//                   condenser and water tank, the hooded feed conveyor rising from the regolith heap (dome-detail-275);
//   - containerRow  the pressurised cargo modules: white cylinders on cradles, their hatches orange, laid side by side
//                   and banked in sandbagged regolith to their shoulders against radiation, a catwalk along their tops.
// Coherent with the set pieces: their white panelling, their safety orange and their dark cells (structureKit PAL.orbital,
// MARS_ACCENT), the basin's own regolith for the masonry (the kit's stone: sintered blocks, red ochre).
import { PartSink, faceBox, normalize3, rgb, shade, type EmitOptions, type Face, type RegionalParts, type Rgb, type Vec3 } from './geometry.ts';
import { DOME_MIN_SEGMENTS, smoothProfile } from './domes.ts';
import type { ArchitectureStyle, RegionalBuildContext, RegionalBuilder } from './types.ts';

const WHITE = rgb(0xd4d9de), PANEL = rgb(0xeef1f3), DARK = rgb(0x4c545b), ORANGE = rgb(0xd8712a), CELL = rgb(0x1f2f4a);
const STEEL = rgb(0x6a6f74), RUST_DUST = rgb(0xa86a4a);
const M = 'structureMetal' as const;

const uvOffset = (ctx: RegionalBuildContext): [number, number] => [ctx.rng() * 7.31, ctx.rng() * 5.17];
const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);

/** A straight member from a to b, `t` square, every face kept (a leg, a brace, a rope). (dome-detail-275) */
function bar(sink: PartSink, a: Vec3, b: Vec3, t: number, colour: Rgb, extra: EmitOptions = {}): void {
  const d = normalize3([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
  const ref: Vec3 = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const out = normalize3([d[1] * ref[2] - d[2] * ref[1], d[2] * ref[0] - d[0] * ref[2], d[0] * ref[1] - d[1] * ref[0]]);
  sink.member(M, a, b, t, t, out, { colour, ...extra, exposed: true }, t / 2);
}

/** A straight steel member between two points (a truss chord, a brace, a rail). */
function strut(sink: PartSink, a: Vec3, b: Vec3, t: number, colour = STEEL, decor = false): void {
  // (dome-detail-275: was a member framed on +y, which drew every upright flat: the truss's verticals were sheets)
  bar(sink, a, b, t, colour, decor ? { decor: true } : {});
}

/** A convex polygon's corners in the order that faces `want`. (dome-detail-275) */
function toward(pts: readonly Vec3[], want: Vec3): Vec3[] {
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[(i + 1) % pts.length];
    nx += (p[1] - q[1]) * (p[2] + q[2]); ny += (p[2] - q[2]) * (p[0] + q[0]); nz += (p[0] - q[0]) * (p[1] + q[1]);
  }
  return nx * want[0] + ny * want[1] + nz * want[2] >= 0 ? [...pts] : [...pts].reverse();
}

/**
 * A regolith heap (dome-detail-275): a smooth mound at the angle of repose, its crest slumped, the dust's own red; the
 * dome law's smooth profile and segments. Dressing.
 */
function heap(sink: PartSink, x: number, z: number, r: number, h: number): void {
  // (a heap under the dome law's reach, 0.8 m, takes a lighter turning)
  const big = r >= 0.8;
  sink.revolve(M, [x, -0.12, z], 'y', smoothProfile([[0, r], [h * 0.25, r * 0.82], [h * 0.55, r * 0.58], [h * 0.8, r * 0.32], [h, 0]], big ? 2 : 1), big ? DOME_MIN_SEGMENTS : 16,
    { colourAt: (p) => shade(RUST_DUST, p[1] < 0.25 ? 0.82 : 0.95), uvPin: [0.5, 0.5], decor: true });
}

/**
 * The regolith works under its gantry (dome-detail-275; the work list: "stacked block piers and a truss. Plain."). The
 * works read as a process line under the bridge, the basin's own regolith in at one end and spent at the other:
 *   - the piers coursed in sintered blocks, each block a hand shy of its neighbours and its own burn, battered up to a cast
 *     cap on a stepped footing; a floodlight on each cap, the caged ladder up the +x pier;
 *   - the Warren truss in true box members, its top laterals braced, the inspection walkway along its -z face with its
 *     rails, the trolley riding the bottom chords on its wheels, its hoist drum and the clamshell grab on its ropes;
 *   - the feed heap at the -x pier, the hooded belt conveyor rising out of it on its trestles to the receiving hopper
 *     (a square bin on braced legs), the screw feeder down to the rotary kiln on its tyres and rollers with its girth gear
 *     and drive, the hoods at its ends, the vapour line over to the condenser and its radiator fins, the water tank, and
 *     the spent regolith tipped from the discharge chute at the +x pier; the switchgear cabinet; the sintered apron.
 */
const isruGantry: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant, bb = ctx.bounds;
  // (item/maps-olympus-227: the piers' outer faces stand on the base's reach, as every new kit's body does — the
  // regionalArchitecture coverage rule, COVER_M — so no lane opens beside the works; was clamp(w - 1.6, 11, 17))
  const span = clamp(bb.maxX - bb.minX - 2.0, 11, 19), depth = clamp(bb.maxZ - bb.minZ - 0.6, 3.2, 5.2);
  const legH = clamp((bb.maxY ?? 11) - 1.6, 8.5, 10.5);
  const Z = depth / 2, xi = span / 2 - 1.0, k19 = span / 19;
  const dusted = (c: Rgb, foot: number) => (p: Vec3): Rgb => (p[1] < foot ? shade(RUST_DUST, 1.1) : c);
  // the sintered apron between the piers, its edges chamfered down into the basin floor (dome-detail-275)
  sink.span('stone', -xi, -0.3, -Z + 0.12, xi, 0.1, Z - 0.12, { shade: 0.92 });
  for (const s of [-1, 1]) {
    sink.prism('stone', toward([[-xi, -0.3, s * (Z - 0.12)], [-xi, 0.1, s * (Z - 0.12)], [-xi, -0.02, s * (Z + 0.16)], [-xi, -0.3, s * (Z + 0.16)]], [1, 0, 0]),
      [1, 0, 0], 2 * xi, { decor: true, shade: 0.85 });
  }
  // the piers (dome-detail-275): sintered regolith blocks in eight battered courses, two blocks a course with the joint
  // struck alternately either side of the middle, each block a hand shy of the face and its own burn; the stepped footing
  // under them (its outer face on the plot's edge) and the cast cap over them with the steel bearing plate on it
  const courses = 8, ch = (legH - 0.4) / courses, capIn = 0.02 + courses * 0.045 - 0.16;
  for (const s of [-1, 1]) {
    const xc = s * span / 2;
    sink.span('stone', s > 0 ? xc - 1.35 : xc - 1.0, -0.3, -Z - 0.18, s > 0 ? xc + 1.0 : xc + 1.35, 0.45, Z + 0.18, { shade: 0.84 });
    for (let k = 0; k < courses; k++) {
      const y0 = k === 0 ? 0.35 : k * ch, y1 = (k + 1) * ch, inset = 0.02 + k * 0.045, zj = (k % 2 ? 0.3 : -0.3) * Z;
      for (const [za, zb] of [[-Z, zj], [zj, Z]] as const) {
        const j = look() * 0.035;
        sink.span('stone', xc - 1.0 + inset + j, y0, za + (za < -Z + 0.01 ? inset + j : 0), xc + 1.0 - inset - j, y1, zb - (zb > Z - 0.01 ? inset + j : 0),
          { shade: (k < 2 ? 0.8 : 0.88) + look() * 0.16 });
      }
    }
    sink.span('stone', xc - 1.0 + capIn, legH - 0.4, -Z + capIn, xc + 1.0 - capIn, legH, Z - capIn, { shade: 0.78 });
    sink.span(M, xc - 0.75, legH, -Z + 0.4, xc + 0.75, legH + 0.18, Z - 0.4, { colour: DARK });
    // the floodlight on the cap's outer half, its head turned in over the works
    const lx = xc + s * 0.55, lz = Z - 0.3;
    bar(sink, [lx, legH - 0.02, lz], [lx, legH + 1.9, lz], 0.08, STEEL, { decor: true });
    sink.span(M, lx - 0.18, legH + 1.75, lz - 0.28, lx + 0.18, legH + 2.05, lz + 0.12, { colour: DARK, decor: true });
    sink.span(M, lx - s * 0.18 - s * 0.02, legH + 1.78, lz - 0.25, lx - s * 0.18, legH + 2.02, lz + 0.09, { colour: PANEL, decor: true, fine: true });
  }
  // the caged ladder up the +x pier's inner face, braced back to the courses, its cage hoops from head height to the cap
  {
    const lx = xi - 0.22, lz = -0.6, top = legH + 0.9;
    for (const dz of [-0.22, 0.22]) {
      bar(sink, [lx, 0.4, lz + dz], [lx, top, lz + dz], 0.06, STEEL, { decor: true });
      for (let k = 1; k < courses; k += 2) bar(sink, [lx, k * ch + ch / 2, lz + dz], [xi + 0.02 + k * 0.045, k * ch + ch / 2, lz + dz], 0.05, STEEL, { decor: true, fine: true });
    }
    for (let y = 0.8; y < top - 0.2; y += 0.45) bar(sink, [lx, y, lz - 0.22], [lx, y, lz + 0.22], 0.035, STEEL, { decor: true, fine: true });
    for (let y = 2.6; y < top; y += 1.3) {
      const hoop: Vec3[] = [[lx, y, lz - 0.24], [lx - 0.62, y, lz - 0.3], [lx - 0.62, y, lz + 0.3], [lx, y, lz + 0.24]];
      for (let i = 0; i < 3; i++) bar(sink, hoop[i], hoop[i + 1], 0.04, ORANGE, { decor: true, fine: true });
    }
    for (const dz of [-0.3, 0, 0.3]) bar(sink, [lx - 0.62, 2.6, lz + dz], [lx - 0.62, 2.6 + 1.3 * Math.floor((top - 2.6) / 1.3), lz + dz], 0.03, ORANGE, { decor: true, fine: true });
  }
  // the truss bridge: top and bottom chords on both faces, verticals and diagonals, the cross members at every panel
  // point, the top laterals braced across every other bay (dome-detail-275: box members, the verticals no longer flat)
  const y0 = legH + 0.18, y1 = legH + 1.55, hz = Z - 0.55;
  const bays = Math.round(span / 1.8), px = (k: number): number => -span / 2 + k * span / bays;
  for (const z of [-hz, hz]) {
    strut(sink, [-span / 2 - 0.4, y0, z], [span / 2 + 0.4, y0, z], 0.22, WHITE);
    strut(sink, [-span / 2 - 0.4, y1, z], [span / 2 + 0.4, y1, z], 0.22, WHITE);
    for (let k = 0; k <= bays; k++) {
      strut(sink, [px(k), y0, z], [px(k), y1, z], 0.12, WHITE, true);
      if (k < bays) strut(sink, [px(k), (k % 2 ? y0 : y1), z], [px(k + 1), (k % 2 ? y1 : y0), z], 0.1, WHITE, true);
    }
  }
  for (let k = 0; k <= bays; k++) {
    strut(sink, [px(k), y1, -hz], [px(k), y1, hz], 0.12, WHITE, true);
    if (k % 2 === 0) strut(sink, [px(k), y0, -hz], [px(k), y0, hz], 0.1, WHITE, true);
    if (k < bays && k % 2 === 0) strut(sink, [px(k), y1 + 0.02, -hz], [px(k + 1), y1 + 0.02, hz], 0.07, WHITE, true);
  }
  // the inspection walkway along the -z face at the bottom chord: its deck and toe board, knee braces back to the
  // verticals, the posts and the two rails in safety orange (dome-detail-275)
  {
    const wz0 = -hz - 0.1, wz1 = -hz - 0.78, wx = span / 2 + 0.35;
    sink.span(M, -wx, y0 - 0.06, wz1, wx, y0 + 0.01, wz0, { colour: STEEL, decor: true });
    sink.span(M, -wx, y0 + 0.01, wz1, wx, y0 + 0.13, wz1 + 0.025, { colour: ORANGE, decor: true, fine: true });
    for (let k = 0; k <= bays; k++) {
      const x = Math.max(-wx + 0.05, Math.min(wx - 0.05, px(k)));
      bar(sink, [x, y0 + 0.01, wz1 + 0.04], [x, y0 + 1.1, wz1 + 0.04], 0.05, ORANGE, { decor: true });
      if (k % 2 === 1) bar(sink, [x, y0 + 0.75, -hz - 0.06], [x, y0 - 0.05, wz1 + 0.12], 0.06, WHITE, { decor: true });
    }
    for (const y of [y0 + 0.6, y0 + 1.1]) bar(sink, [-wx, y, wz1 + 0.04], [wx, y, wz1 + 0.04], 0.05, ORANGE, { decor: true });
  }
  // the trolley riding the bottom chords: its frame under them, the side plates up past the chords to its four wheels on
  // them, the hoist drum slung under the frame with its motor, the ropes down to the clamshell grab
  const tx = -span * 0.12 + (rng() - 0.5) * span * 0.2;
  sink.span(M, tx - 0.9, y0 - 0.5, -hz - 0.05, tx + 0.9, y0 - 0.1, hz + 0.05, { colour: ORANGE });
  for (const s of [-1, 1]) {
    sink.span(M, tx - 0.8, y0 - 0.5, s * (hz + 0.12), tx + 0.8, y0 + 0.42, s * (hz + 0.18), { colour: ORANGE, decor: true });
    for (const dx of [-0.55, 0.55]) sink.cylinder(M, [tx + dx, y0 + 0.29, s > 0 ? hz - 0.06 : -hz - 0.12], 'z', 0.18, 0.18, 10, { colour: DARK, decor: true });
  }
  sink.cylinder(M, [tx - 0.6, y0 - 0.78, 0], 'x', 1.2, 0.28, 12, { colour: DARK, decor: true });
  for (const dx of [-0.66, 0.66]) sink.span(M, tx + dx - 0.04, y0 - 1.1, -0.34, tx + dx + 0.04, y0 - 0.5, 0.34, { colour: ORANGE, decor: true });
  sink.span(M, tx + 0.7, y0 - 1.0, -0.25, tx + 1.15, y0 - 0.5, 0.25, { colour: DARK, decor: true });
  const gy = 6.3, gh = gy + 0.35;
  for (const [dx, dz] of [[-0.3, -0.18], [0.3, 0.18]] as const) bar(sink, [tx + dx, y0 - 1.0, dz], [tx + dx * 0.6, gh + 0.38, dz], 0.03, DARK, { decor: true });
  sink.span(M, tx - 0.32, gh, -0.28, tx + 0.32, gh + 0.42, 0.28, { colour: DARK, decor: true });
  // (the jaws: the lower half of a drum shut on its seam, the regolith's dust on their lips)
  sink.cylinder(M, [tx, gy, -0.55], 'z', 1.1, 0.75, 12, { colour: STEEL, colourAt: (p) => (p[1] < gy - 0.55 ? RUST_DUST : shade(STEEL, 1.1)), decor: true }, 0.75, true, Math.PI / 2, Math.PI);
  sink.span(M, tx - 0.03, gy - 0.74, -0.57, tx + 0.03, gy + 0.02, 0.57, { colour: DARK, decor: true });
  for (const s of [-1, 1]) for (const dz of [-0.45, 0.45]) bar(sink, [tx + s * 0.25, gh + 0.05, dz * 0.55], [tx + s * 0.7, gy - 0.02, dz], 0.06, DARK, { decor: true });
  // the receiving hopper (dome-detail-275: was a frustum on a disc): a square bin narrowing to its outlet, on four legs
  // braced on three faces and girt at two metres, its rim, the regolith in it, the slide gate under it
  const hT = 4.75, hB = 3.15;
  for (const [x, z] of [[-1.05, -1.05], [1.05, -1.05], [1.05, 1.05], [-1.05, 1.05]] as const) {
    sink.span(M, x - 0.09, 0, z - 0.09, x + 0.09, 4.4, z + 0.09, { colour: STEEL });
  }
  for (const [a, b] of [[[-1.05, -1.05], [1.05, -1.05]], [[1.05, 1.05], [-1.05, 1.05]], [[-1.05, 1.05], [-1.05, -1.05]], [[1.05, -1.05], [1.05, 1.05]]] as const) {
    bar(sink, [a[0], 2.0, a[1]], [b[0], 2.0, b[1]], 0.08, STEEL, { decor: true });
    if (a[0] !== 1.05 || b[0] !== 1.05) {
      bar(sink, [a[0], 0.3, a[1]], [b[0], 1.95, b[1]], 0.06, STEEL, { decor: true });
      bar(sink, [b[0], 0.3, b[1]], [a[0], 1.95, a[1]], 0.06, STEEL, { decor: true });
    }
  }
  sink.cylinder(M, [0, hB, 0], 'y', hT - hB, 0.3 * Math.SQRT2, 4, { colour: WHITE, colourAt: dusted(WHITE, hB + 0.35) }, 1.3 * Math.SQRT2, false, Math.PI / 4);
  for (const [x0, z0, x1, z1] of [[-1.36, -1.36, 1.36, -1.22], [-1.36, 1.22, 1.36, 1.36], [-1.36, -1.22, -1.22, 1.22], [1.22, -1.22, 1.36, 1.22]] as const) {
    sink.span(M, x0, hT - 0.05, z0, x1, hT + 0.12, z1, { colour: ORANGE, decor: true });
  }
  sink.polygon(M, toward([[-1.24, hT - 0.03, -1.24], [1.24, hT - 0.03, -1.24], [1.24, hT - 0.03, 1.24], [-1.24, hT - 0.03, 1.24]], [0, 1, 0]), { colour: RUST_DUST, decor: true });
  sink.revolve(M, [0.15, hT - 0.04, 0.1], 'y', [[0, 1.0], [0.16, 0.62], [0.26, 0]], 12, { colour: shade(RUST_DUST, 1.06), uvPin: [0.5, 0.5], decor: true });
  sink.span(M, -0.32, hB - 0.3, -0.32, 0.32, hB + 0.05, 0.32, { colour: DARK });
  sink.span(M, -0.4, hB - 0.22, -0.36, -0.32, hB - 0.04, 0.36, { colour: ORANGE, decor: true });
  // the screw feeder from the outlet down to the kiln's feed hood, its drive at its head
  const kx0 = span * 0.13, kx1 = span * 0.315, ay = 1.45, kr = 0.95, km = (kx0 + kx1) / 2;
  sink.pipe(M, [0.25, hB - 0.15, 0], [kx0 - 0.4, 2.45, 0], 0.17, 10, { colour: PANEL, decor: true });
  sink.span(M, -0.62, hB - 0.3, -0.18, -0.32, hB - 0.02, 0.18, { colour: DARK, decor: true });
  // the rotary kiln (dome-detail-275: was a plain drum on two saddles): its shell tapering into its hoods, the two riding
  // tyres on their roller pairs and pedestals, the girth gear and the drive box under it
  sink.revolve(M, [kx0, ay, 0], 'x', [[0, kr * 0.72], [0.3, kr], [kx1 - kx0 - 0.3, kr], [kx1 - kx0, kr * 0.72]], 24,
    { colourAt: dusted(WHITE, ay - kr * 0.55) });
  for (const tx2 of [kx0 + 0.75, kx1 - 0.75]) {
    sink.cylinder(M, [tx2 - 0.12, ay, 0], 'x', 0.24, kr + 0.13, 20, { colour: DARK });
    sink.span('stone', tx2 - 0.4, -0.15, -0.95, tx2 + 0.4, 0.12, 0.95, { shade: 0.8 });
    for (const s of [-1, 1]) {
      // (each roller under the tyre at thirty degrees off its foot, touching it)
      const ry = ay - (kr + 0.35) * Math.cos(Math.PI / 6), rz = s * (kr + 0.35) * Math.sin(Math.PI / 6);
      sink.cylinder(M, [tx2 - 0.16, ry, rz], 'x', 0.32, 0.22, 10, { colour: STEEL, decor: true });
      sink.span(M, tx2 - 0.22, 0.1, rz - 0.14, tx2 + 0.22, ry, rz + 0.14, { colour: DARK, decor: true });
    }
  }
  sink.cylinder(M, [km - 0.08, ay, 0], 'x', 0.16, kr + 0.17, 20, { colour: STEEL, decor: true });
  sink.span(M, km - 0.45, 0, -Z + 0.2, km + 0.45, 1.3, -kr - 0.1, { colour: DARK });
  // the hoods at its ends: the feed hood with its inspection door, the discharge hood and its chute tipping the spent
  // regolith on the tailings heap at the +x pier
  sink.span(M, kx0 - 0.7, 0, -0.85, kx0 + 0.12, 2.6, 0.85, { colour: PANEL, colourAt: dusted(PANEL, 0.5) });
  sink.span(M, kx1 - 0.12, 0, -0.85, kx1 + 0.65, 2.3, 0.85, { colour: PANEL, colourAt: dusted(PANEL, 0.5) });
  for (const x of [kx0 - 0.3, kx1 + 0.28]) sink.span(M, x - 0.28, 0.5, 0.85, x + 0.28, 1.6, 0.9, { colour: ORANGE, decor: true });
  const tlx = Math.min(xi - 1.05, kx1 + 1.4);
  bar(sink, [kx1 + 0.55, 1.35, 0.4], [tlx, 0.85, 0.5], 0.4, DARK, { decor: true });
  heap(sink, tlx, 0.55, 0.76, 0.7);
  // the vapour line from the feed hood up and over to the condenser, on a bracket from the hopper's leg and a post
  const vx = kx0 - 0.3, cxn = -3.6 * k19, vz = -1.3, vy = 3.4;
  sink.pipe(M, [vx, 2.55, -0.6], [vx, vy + 0.09, -0.6], 0.09, 8, { colour: STEEL, decor: true });
  sink.pipe(M, [vx, vy, -0.51], [vx, vy, vz - 0.09], 0.09, 8, { colour: STEEL, decor: true });
  sink.pipe(M, [vx + 0.09, vy, vz], [cxn - 0.09, vy, vz], 0.09, 8, { colour: STEEL, decor: true });
  sink.pipe(M, [cxn, vy + 0.09, vz], [cxn, 2.95, vz], 0.09, 8, { colour: STEEL, decor: true });
  bar(sink, [-1.05, vy, -1.05], [-1.05, vy, vz + 0.02], 0.06, DARK, { decor: true });
  bar(sink, [-2.4 * k19, 0, vz], [-2.4 * k19, vy - 0.08, vz], 0.08, DARK, { decor: true });
  // the condenser column and its two radiator fins, the product water tank across the line, the pipe between them on its
  // sleepers
  sink.cylinder(M, [cxn, 0, vz], 'y', 3.0, 0.42, 16, { colour: WHITE, colourAt: dusted(WHITE, 0.45) });
  sink.revolve(M, [cxn, 3.0, vz], 'y', [[0, 0.42], [0.1, 0.36], [0.16, 0.2], [0.18, 0]], 12, { colour: WHITE });
  for (const [a, b] of [[cxn - 1.5, cxn - 0.36], [cxn + 0.36, cxn + 1.1]] as const) {
    sink.span(M, a, 0.6, vz - 0.025, b, 2.75, vz + 0.025, { colour: PANEL, decor: true });
    for (let x = a + 0.25; x < b - 0.1; x += 0.35) sink.span(M, x - 0.02, 0.62, vz - 0.05, x + 0.02, 2.73, vz + 0.05, { colour: shade(PANEL, 0.82), decor: true, fine: true });
  }
  sink.cylinder(M, [cxn, -0.1, 1.25], 'y', 1.8, 0.42, 16, { colour: PANEL, colourAt: dusted(PANEL, 0.4) });
  sink.cylinder(M, [cxn, 1.2, 1.25], 'y', 0.22, 0.44, 16, { colour: ORANGE, decor: true });
  sink.pipe(M, [cxn, 0.32, vz + 0.38], [cxn, 0.32, 1.25 - 0.38], 0.07, 8, { colour: STEEL, decor: true });
  for (const z of [-0.5, 0.5]) sink.span(M, cxn - 0.25, 0, z - 0.08, cxn + 0.25, 0.25, z + 0.08, { colour: DARK, decor: true });
  // the feed heap at the -x pier and the hooded belt conveyor rising out of it to the hopper's mouth: its box frame
  // (solid: a phone's collision is the desktop's), the dust hood over the belt, the tail box in the heap's toe, the
  // discharge chute into the bin, the trestles under it (item/maps-olympus-227; dome-detail-275: hooded, framed, trestled)
  const fa: Vec3 = [-xi + 1.25, 0.5, 0], fb: Vec3 = [-1.05, 5.05, 0];
  heap(sink, -xi + 1.6, 0.05, 1.6 * k19, 1.3);
  {
    const L = Math.hypot(fb[0] - fa[0], fb[1] - fa[1]), d: Vec3 = [(fb[0] - fa[0]) / L, (fb[1] - fa[1]) / L, 0], u: Vec3 = [-d[1], d[0], 0];
    const at = (t: number, z: number, h: number): Vec3 => [fa[0] + d[0] * t + u[0] * h, fa[1] + d[1] * t + u[1] * h, z];
    sink.prism(M, toward([at(0, -0.45, -0.38), at(0, 0.45, -0.38), at(0, 0.45, 0), at(0, -0.45, 0)], d), d, L, { colour: DARK });
    const hood: Vec3[] = [];
    for (let i = 0; i <= 6; i++) { const a = (i / 6) * Math.PI; hood.push(at(0, 0.5 * Math.cos(a), 0.5 * Math.sin(a))); }
    sink.prism(M, toward(hood, d), d, L - 0.3, { colour: PANEL, colourAt: dusted(PANEL, 1.6), decor: true });
    for (const t of [0.3, 0.55, 0.8]) {
      const top = at(L * t, 0, -0.36)[1], x = at(L * t, 0, -0.38)[0];
      for (const z of [-0.4, 0.4]) bar(sink, [x, 0, z], [x, top, z], 0.1, STEEL, { decor: true });
      bar(sink, [x, top * 0.55, -0.4], [x, top * 0.55, 0.4], 0.07, STEEL, { decor: true });
      bar(sink, [x, 0.15, -0.4], [x, top * 0.55, 0.4], 0.05, STEEL, { decor: true });
    }
  }
  sink.span(M, fa[0] - 0.45, 0, -0.5, fa[0] + 0.55, 0.75, 0.5, { colour: DARK });
  sink.span(M, -1.28, hT - 0.15, -0.3, -0.8, fb[1] + 0.25, 0.3, { colour: DARK, decor: true });
  // the switchgear cabinet at the +x pier's foot, its doors and stripe, the cable along the floor to the kiln's drive
  {
    const z0 = -Z + 0.06, z1 = Math.min(z0 + 0.6, -kr - 0.15);
    sink.span(M, xi - 0.55, 0, z0, xi - 0.02, 1.9, z1, { colour: PANEL, colourAt: dusted(PANEL, 0.4) });
    const face: Face = { origin: [xi - 0.55, 0, (z0 + z1) / 2], u: [0, 0, 1], out: [-1, 0, 0], width: z1 - z0 };
    faceBox(sink, M, face, 0, 1.0, 0.01, 0.02, 1.6, 0.02, { colour: DARK, decor: true, fine: true });
    faceBox(sink, M, face, 0, 1.65, 0.015, z1 - z0 - 0.06, 0.08, 0.03, { colour: ORANGE, decor: true });
    faceBox(sink, M, face, -0.12, 1.3, 0.012, 0.16, 0.12, 0.02, { colour: CELL, decor: true, fine: true });
    bar(sink, [xi - 0.55, 0.06, (z0 + z1) / 2], [km + 0.45, 0.06, (z0 + z1) / 2], 0.08, shade(DARK, 0.6), { decor: true });
  }
  return sink.finish();
};

/** The pressurised cargo modules banked in regolith. */
const cargoModules: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, bb = ctx.bounds, mobile = ctx.tier === 'mobile';
  const W = bb.maxX - bb.minX - 0.4, D = bb.maxZ - bb.minZ - 0.6;
  // (item/maps-olympus-227: the modules run the base's depth to within the coverage rule's COVER_M, their banks with
  // them, so no lane opens at their ends; was clamp(D - 1.6, 4.5, 6.5))
  const r = clamp(D * 0.17, 1.05, 1.35), len = clamp(D - 0.2, 4.5, 6.6);
  const n = Math.max(2, Math.floor(W / (2 * r + 0.55)));
  const pitch = W / n, x0 = bb.minX + 0.2 + pitch / 2, zc = (bb.minZ + bb.maxZ) / 2;
  for (let k = 0; k < n; k++) {
    const x = x0 + k * pitch;
    // the cradle and the module, its hatch end orange
    for (const z of [zc - len * 0.32, zc + len * 0.32]) sink.span(M, x - r * 0.9, -0.2, z - 0.18, x + r * 0.9, 0.55, z + 0.18, { colour: DARK });
    sink.cylinder(M, [x, r + 0.35, zc - len / 2], 'z', len, r, 16, { colour: k % 3 === 1 ? PANEL : WHITE });
    sink.cylinder(M, [x, r + 0.35, zc + len / 2], 'z', 0.12, r * 0.92, 16, { colour: ORANGE });
    const hatch: Face = { origin: [x, 0, zc + len / 2 + 0.12], u: [1, 0, 0], out: [0, 0, 1], width: 2 * r };
    faceBox(sink, M, hatch, 0, r + 0.35, 0.02, r * 0.9, r * 0.9, 0.05, { colour: shade(ORANGE, 0.75), decor: true });
    faceBox(sink, M, hatch, 0, r + 0.35, 0.05, r * 0.3, r * 0.08, 0.04, { colour: DARK, decor: true });
    // the bands round its hull
    if (!mobile) for (const z of [zc - len / 3, zc, zc + len / 3]) sink.cylinder(M, [x, r + 0.35, z - 0.06], 'z', 0.12, r + 0.03, 16, { colour: DARK, decor: true });
    // the regolith banked against it between the modules to the shoulder: sintered block bags in courses
    if (k < n - 1) {
      const gx = x + pitch / 2;
      for (let c = 0; c < 3; c++) {
        const hw = (pitch - 2 * r) / 2 + r * (0.85 - c * 0.28), y0 = c * 0.55 - (c === 0 ? 0.3 : 0), y1 = (c + 1) * 0.55;
        sink.span('stone', gx - hw, y0, zc - len / 2 + 0.2, gx + hw, y1 + rng() * 0.08, zc + len / 2 - 0.3);
      }
    }
  }
  // the bank's ends at the row's two sides, and the catwalk along the module tops on its posts
  for (const s of [-1, 1]) {
    const ex = s < 0 ? bb.minX + 0.2 : bb.maxX - 0.2;
    for (let c = 0; c < 3; c++) sink.span('stone', s < 0 ? ex : ex - (1.0 - c * 0.3), c * 0.55 - (c === 0 ? 0.3 : 0), zc - len / 2 + 0.2,
      s < 0 ? ex + (1.0 - c * 0.3) : ex, (c + 1) * 0.55, zc + len / 2 - 0.3);
  }
  const cy = 2 * r + 0.32; // (the catwalk's deck on the hulls' crowns)
  sink.span(M, bb.minX + 0.4, cy, zc - 0.35, bb.maxX - 0.4, cy + 0.06, zc + 0.35, { colour: STEEL, decor: true });
  if (!mobile) {
    // the catwalk's handrails on their posts
    for (const z of [zc - 0.35, zc + 0.35]) {
      sink.span(M, bb.minX + 0.4, cy + 0.95, z - 0.025, bb.maxX - 0.4, cy + 1.0, z + 0.025, { colour: ORANGE, decor: true });
      const posts = Math.max(2, Math.round((W - 0.4) / 2.2));
      for (let k = 0; k <= posts; k++) {
        const x = bb.minX + 0.45 + k * (W - 0.5) / posts;
        sink.span(M, x - 0.025, cy + 0.06, z - 0.025, x + 0.025, cy + 0.96, z + 0.025, { colour: STEEL, decor: true });
      }
    }
  }
  return sink.finish();
};

const OLYMPUS_BUILDERS: Readonly<Record<string, RegionalBuilder>> = Object.freeze({
  gantry: isruGantry,
  containerRow: cargoModules,
});

export const OLYMPUS_STYLE: ArchitectureStyle = Object.freeze<ArchitectureStyle>({
  id: 'olympus',
  region: 'Olympus Basin, Mars, 2100: a research station on the basin floor — its regolith works under a gantry and its pressurised cargo modules banked in sintered regolith, in the habitats\' white panelling and safety orange',
  surfaces: {
    // the station's sheet roofs, pale and dusted
    roof: { kind: 'sheet', tint: [0.78, 0.72, 0.68] },
    // sintered regolith blocks: the basin's red ochre
    stone: { kind: 'block', tint: [0.62, 0.4, 0.3] },
    sourced: { plaster: false, wood: false },
  },
  builders: OLYMPUS_BUILDERS,
  // a dry, dusty world: no damp, no moss; the dust settles at the feet
  weather: {
    plaster: [[1, 1, 1], [0.98, 0.96, 0.94]],
    stone: [[1, 1, 1], [0.95, 0.92, 0.9], [1.03, 0.98, 0.95]],
    roof: [[1, 1, 1], [0.96, 0.92, 0.88]],
  },
});

export type { RegionalParts };
