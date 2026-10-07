// src/world/landmarks/harbour.ts — harbour works (the landmarks lane, 2026-10-06): the harbour light and the mole it
// stands on.
//
// The harbour light is a Breton feu de port (Roscoff's, Le Conquet's, the Aber Wrac'h's): a whitewashed masonry tower on
// its granite base course, tapering, with its top painted, a corbelled granite gallery with an iron railing, the lantern
// whose panes burn at night, and a domed iron cupola with its ventilator and finial. A harbour mouth carries a pair: red
// on the port hand coming in and green on the starboard hand (IALA region A, France). Standing alone, it is footed on a
// granite plinth or on a rock in the water.
//
// The mole (a jetée) is a battered granite pier: the paved deck, a parapet wall on its sea side, iron bollards along its
// basin side, stone steps at its root, and the round head where its light stands. Its body is one solid from the bed to
// the deck: a hull meets its faces and never climbs onto it (its deck stands well over a step), and the light on its head
// is part of the same piece, so no gap opens between the mole and its light for a hull to wedge into.
import { PartSink, rgb, shade, type EmitOptions, type RegionalBucket, type Rgb, type Vec3 } from '../maps/regional/geometry.ts';
import type { SimpleCollisionShape } from '../collision.ts';
import { bar, extrude, revolve, ringY, smoothRender, LIMEWASH_UV } from './kit.ts';
import { ENTRY_CLIMB_M, ENTRY_M, ENTRY_SINK_M } from './bridges.ts';
import { harbourLayout } from './plan.ts';
import type { LandmarkBuilder } from './types.ts';

/** The light's painted top, its gallery railing, lantern and cupola: the harbour mouth's colours. */
const PAINT: Readonly<Record<string, Rgb>> = Object.freeze({
  red: rgb(0xb2271f), green: rgb(0x2d7a3a), white: rgb(0xe6e4dc), black: rgb(0x202325),
});
const IRON = rgb(0x2b2d2e), DOOR = rgb(0x4a3328), WINDOW = rgb(0x1d2124);
/** The tower's whitewash: the plaster bucket's tint (bright, as a light's daymark must be). */
const WHITEWASH: [number, number, number] = [1.06, 1.06, 1.04];

const uvOffset = (rng: () => number): [number, number] => [rng() * 7.31, rng() * 5.17];

/** The facets of the tower's 16-sided shaft: their centres at multiples of 22.5 degrees from +z (kit.ts ringY). */
const N = 16;

/**
 * One light tower: its foot at (x, y0, z), the shaft `H` to its gallery and `r0` across its foot, its top painted
 * `paint`, its door facing `doorA` (radians from +z toward +x, snapped to a facet). Returns the height of its finial.
 */
function lightTower(sink: PartSink, x: number, y0: number, z: number, H: number, r0: number, paint: Rgb, doorA: number): number {
  const phase = Math.PI / N, facet = Math.cos(Math.PI / N);
  const r1 = r0 * 0.78, yb = y0 + 0.8, yg = y0 + H;
  const rAt = (y: number) => r0 + (r1 - r0) * Math.max(0, Math.min(1, (y - yb) / (yg - yb)));
  const ironDecor = { colour: paint, decor: true };
  // the granite base course and the whitewashed shaft
  revolve(sink, 'stone', x, z, [[r0 + 0.22, y0 - 0.3], [r0 + 0.22, yb - 0.12], [r0 + 0.04, yb], [r0, yb]], N, {}, phase);
  revolve(sink, 'plaster', x, z, [[r0, yb], [r1, yg]], N, {}, phase);
  // the painted top: a band of the light's colour under the gallery
  const yt = yg - 1.05;
  revolve(sink, 'structureMetal', x, z, [[rAt(yt) + 0.015, yt], [r1 + 0.015, yg - 0.3]], N, { colour: paint }, phase);
  // the door and the windows, each flat on its facet and leaning with the shaft's taper
  const step = Math.PI * 2 / N, snap = (a: number) => Math.round(a / step) * step;
  const opening = (a: number, ya: number, h: number, w: number, colour: Rgb) => {
    const ux = Math.cos(a), uz = -Math.sin(a), ox = Math.sin(a), oz = Math.cos(a);
    const at = (u: number, y: number): Vec3 => {
      const r = rAt(y) * facet + 0.025;
      return [x + ox * r + ux * u, y, z + oz * r + uz * u];
    };
    sink.quad('structureWood', at(-w / 2, ya), at(w / 2, ya), at(w / 2, ya + h), at(-w / 2, ya + h), { colour, decor: true });
  };
  const door = snap(doorA);
  opening(door, yb, 2.0, 0.95, DOOR);
  // the stoop before the door
  {
    const ox = Math.sin(door), oz = Math.cos(door), ux = Math.cos(door), uz = -Math.sin(door);
    const c = r0 + 0.22 + 0.45;
    const p = (u: number, v: number, y: number): Vec3 => [x + ox * (c + v) + ux * u, y, z + oz * (c + v) + uz * u];
    extrude(sink, 'stone', [p(-0.8, -0.5, y0 - 0.3), p(0.8, -0.5, y0 - 0.3), p(0.8, 0.45, y0 - 0.3), p(-0.8, 0.45, y0 - 0.3)], [0, 1, 0],
      yb - 0.1 - (y0 - 0.3), { decor: true });
  }
  opening(door, y0 + H * 0.5, 0.75, 0.38, WINDOW);
  opening(door + Math.PI, y0 + H * 0.3, 0.75, 0.38, WINDOW);
  opening(door + Math.PI / 2, y0 + H * 0.7, 0.75, 0.38, WINDOW);
  opening(door - Math.PI / 2, y0 + H * 0.4, 0.75, 0.38, WINDOW);
  // the corbelled gallery and its floor
  const rg = r1 + 0.72, yf = yg + 0.24;
  revolve(sink, 'stone', x, z, [[r1, yg - 0.5], [rg, yg - 0.02], [rg, yf], [0, yf]], N, {}, phase);
  // its iron railing
  const posts = ringY(x, yf, z, rg - 0.09, N, phase);
  for (let i = 0; i < N; i++) {
    const p = posts[i], q = posts[(i + 1) % N];
    sink.span('structureMetal', p[0] - 0.035, yf, p[2] - 0.035, p[0] + 0.035, yf + 1.02, p[2] + 0.035, ironDecor);
    bar(sink, 'structureMetal', [p[0], yf + 1.0, p[2]], [q[0], yf + 1.0, q[2]], 0.055, ironDecor);
    bar(sink, 'structureMetal', [p[0], yf + 0.5, p[2]], [q[0], yf + 0.5, q[2]], 0.035, { ...ironDecor, fine: true });
  }
  // the lantern: its iron dwarf wall, the panes that burn at night (the curtain bucket's night windows), the astragals
  const NL = 10, rl = Math.max(0.85, r1 * 0.6), yl0 = yf + 0.6, yl1 = yl0 + 1.5;
  revolve(sink, 'structureMetal', x, z, [[rl + 0.05, yf], [rl + 0.05, yl0]], NL, { colour: paint });
  const low = ringY(x, yl0, z, rl, NL), high = ringY(x, yl1, z, rl, NL);
  for (let i = 0; i < NL; i++) {
    const j = (i + 1) % NL;
    const mx = (low[i][0] + low[j][0]) / 2 - x, mz = (low[i][2] + low[j][2]) / 2 - z, ml = Math.hypot(mx, mz);
    sink.quad('curtain', low[i], low[j], high[j], high[i], { decor: true, window: [mx / ml, 0, mz / ml] });
    bar(sink, 'structureMetal', low[i], high[i], 0.07, ironDecor);
  }
  // the domed cupola, the ventilator ball and the finial
  revolve(sink, 'structureMetal', x, z, [[rl + 0.16, yl1], [rl + 0.16, yl1 + 0.12], [rl * 0.92, yl1 + 0.42], [rl * 0.64, yl1 + 0.8],
    [rl * 0.3, yl1 + 1.04], [0.12, yl1 + 1.12], [0, yl1 + 1.13]], NL, { colour: paint });
  const yv = yl1 + 1.1;
  revolve(sink, 'structureMetal', x, z, [[0.05, yv], [0.2, yv + 0.12], [0.22, yv + 0.3], [0.12, yv + 0.45], [0, yv + 0.5]], 8,
    { colour: paint, decor: true });
  bar(sink, 'structureMetal', [x, yv + 0.45, z], [x, yv + 1.35, z], 0.045, { colour: IRON, decor: true });
  return yv + 1.35;
}

/** A granite boulder on the bed about (cx, cz): an irregular heptagonal block, `r` across and `h` high. */
function boulder(sink: PartSink, cx: number, cz: number, base: number, r: number, h: number, rng: () => number): void {
  const n = 7, phase = rng() * Math.PI * 2;
  const k = Array.from({ length: n }, () => 0.78 + rng() * 0.36);
  const ring = (y: number, s: number): Vec3[] => ringY(0, 0, 0, 1, n, phase).map((p, i) => [cx + p[0] * r * s * k[i], y, cz + p[2] * r * s * k[i]]);
  const rings = [ring(base, 1.0), ring(base + (h - base) * 0.62, 0.86), ring(h, 0.5)];
  for (let level = 0; level + 1 < rings.length; level++) {
    const a = rings[level], b = rings[level + 1];
    for (let i = 0; i < n; i++) { const j = (i + 1) % n; sink.quad('stone', a[i], a[j], b[j], b[i]); }
  }
  sink.polygon('stone', [...rings[rings.length - 1]]);
}

/**
 * The harbour light standing on its own (the frame: the tower's axis at the origin, its door to +z). `base` 'plinth' is
 * a battered granite drum `rise` over the ground; 'rock' the same drum on a skerry of granite boulders round it in the
 * water. The piece may stand in the water (plan.ts inWater).
 */
export const lighthouse: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const H = Math.max(6, Number(ctx.params.height)), r0 = Math.max(1.2, Number(ctx.params.radius));
  const rise = Math.max(0.4, Number(ctx.params.rise)), paint = PAINT[String(ctx.params.paint)] ?? PAINT.red;
  const base = -1.0 - ctx.groundFall, rp = r0 + 0.75;
  revolve(sink, 'stone', 0, 0, [[rp + 0.35, base], [rp + 0.35, Math.min(0.1, rise - 0.3)], [rp, rise], [0, rise]], N, {}, Math.PI / N);
  if (String(ctx.params.base) === 'rock') {
    const rng = ctx.variant;
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2 + rng() * 0.5, d = rp + 0.1 + rng() * 0.4;
      boulder(sink, Math.sin(a) * d, Math.cos(a) * d, base, 0.6 + rng() * 0.5, rise * (0.45 + rng() * 0.5), rng);
    }
  }
  lightTower(sink, 0, rise, 0, H, r0, paint, 0);
  return { parts: smoothRender(sink.finish(), LIMEWASH_UV), tints: { plaster: WHITEWASH } };
};

/**
 * The mole with its light on the head (the frame: the mole along z, its root end at -(length + head) / 2, the light's
 * axis `length` from the root, the round head's end at +(length + head) / 2; x across it, the sea on the `sea` side —
 * 'left' or 'right' walking out from the root, +x is the right). y = 0 the lowest ground under it (the bed). `light`
 * 'red', 'green' or 'none'.
 */
export const mole: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const L = Math.max(10, Number(ctx.params.length)), W = Math.max(3, Number(ctx.params.width)), D = Math.max(1.2, Number(ctx.params.deck));
  const sea = String(ctx.params.sea) === 'right' ? 1 : -1, Rh = W / 2 + 1.6, bat = 0.45;
  const base = -1.0 - ctx.groundFall;
  const zr = -(L + Rh) / 2, zl = zr + L;
  // the battered granite body from the bed to the deck, and the round head (its deck a kerb's height proud)
  extrude(sink, 'stone', [[-W / 2 - bat, base, zr], [W / 2 + bat, base, zr], [W / 2, D, zr], [-W / 2, D, zr]], [0, 0, 1], zl - zr);
  revolve(sink, 'stone', 0, zl, [[Rh + bat, base], [Rh, D + 0.06], [0, D + 0.06]], 20, {}, Math.PI / 20);
  // the coping courses along both edges of the deck
  for (const sx of [-1, 1]) {
    sink.span('stone', sx * W / 2 - (sx > 0 ? 0.42 : 0), D, zr, sx * W / 2 + (sx > 0 ? 0 : 0.42), D + 0.05, zl, { decor: true });
  }
  // the parapet on the sea side, from the root to where the head widens
  const px = sea * (W / 2 - 0.36), headStart = zl - Math.sqrt(Math.max(0, Rh * Rh - (W / 2) ** 2));
  sink.span('stone', px - 0.36, D, zr + 0.4, px + 0.36, D + 1.05, headStart);
  sink.span('stone', px - 0.42, D + 1.05, zr + 0.35, px + 0.42, D + 1.15, headStart + 0.05, { decor: true });
  // the iron bollards along the basin side
  const bx = -sea * (W / 2 - 0.55);
  for (let z = zr + 3; z < headStart - 1.5; z += 7) {
    revolve(sink, 'structureMetal', bx, z, [[0.2, D], [0.2, D + 0.45], [0.28, D + 0.55], [0.28, D + 0.62], [0, D + 0.64]], 8,
      { colour: IRON, decor: true });
  }
  // the stone steps down the basin side by the root, against its face (dressing: a hull meets the face, not a stair)
  {
    const steps = Math.max(3, Math.round(D / 0.22)), side = -sea, inner = W / 2, outer = W / 2 + 1.25;
    for (let k = 0; k < steps; k++) {
      const y1 = D * (k + 1) / steps, z0 = zr + 0.6 + k * 0.3;
      const xa = side * inner, xb = side * outer;
      sink.span('stone', Math.min(xa, xb), base + 0.6, z0, Math.max(xa, xb), y1, z0 + 0.3, { decor: true });
    }
  }
  const light = String(ctx.params.light);
  if (light !== 'none') {
    const paint = PAINT[light] ?? PAINT.red;
    lightTower(sink, 0, D + 0.06, zl, Math.max(6, Number(ctx.params.height)), Math.max(1.2, Number(ctx.params.radius)), paint,
      -sea * Math.PI / 2);
  }
  return { parts: smoothRender(sink.finish(), LIMEWASH_UV), tints: { plaster: WHITEWASH } };
};

// ---------------------------------------------------------------------------------------------------------- quay

const TIMBER_DARK = rgb(0x3e3228);

/**
 * The quay (mr4's harbour step 2 for Saltmere, 2026-10-06; one harbour with the mole): a granite quay wall `length` along
 * the sea (the piece's local x), its paved top `top` metres over the lowest ground under it (the strand and the bed) and
 * `depth` back to the land, where the shore rising above its level buries its back. The face: dressed granite courses,
 * the coping's big blocks along the edge, the weed-dark band the tide leaves, timber fenders, two iron ladders down into
 * the water and iron bollards on the coping; the ends revetted like the face. Its top is one standable floor a hull drives
 * onto from the land (the movement record's panels); its face and ends are a wall a hull meets from the strand or the
 * water, which the strand to either side and the slipway leave open, so the harbour has no pocket.
 */
export const quay: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const L = Math.max(10, Number(ctx.params.length)), D = Math.max(4, Number(ctx.params.depth)), top = Math.max(0.6, Number(ctx.params.top));
  const base = -0.6 - ctx.groundFall, cope = 0.45;
  // the body under the paving, and the paving's slab of setts over it (the regional stone laid flat)
  sink.span('stone', -L / 2, base, -D / 2, L / 2, top - 0.22, D / 2 - cope);
  sink.span('stone', -L / 2, top - 0.22, -D / 2, L / 2, top, D / 2 - cope);
  // the coping along the face and round the two ends: big granite blocks a hand proud of the face, their joints dark
  sink.span('stone', -L / 2 - 0.06, top - 0.34, D / 2 - cope, L / 2 + 0.06, top + 0.07, D / 2 + 0.06);
  for (const sx of [-1, 1]) sink.span('stone', sx > 0 ? L / 2 - cope : -L / 2 - 0.06, top - 0.34, -D / 2, sx > 0 ? L / 2 + 0.06 : -L / 2 + cope, top + 0.07, D / 2 - cope);
  for (let x = -L / 2 + 1.2; x < L / 2 - 0.6; x += 1.2) {
    sink.span('structureWood', x - 0.015, top + 0.071, D / 2 - cope, x + 0.015, top + 0.074, D / 2 + 0.06, { colour: rgb(0x2a2826), decor: true, fine: true });
  }
  // the wall's lower face from the bed to a little over the water: weed-dark and wet (the stone under the occlusion)
  const wet = Math.min(top - 0.5, 1.1);
  sink.quad('stone', [-L / 2 - 0.07, base, D / 2 + 0.07], [L / 2 + 0.07, base, D / 2 + 0.07], [L / 2 + 0.07, wet, D / 2 + 0.07], [-L / 2 - 0.07, wet, D / 2 + 0.07],
    { decor: true, shadeAt: (p) => (p[1] > wet - 0.25 ? 0.7 : 0.5) });
  // the fenders: timber posts on the face every 5 m, from the bed to the coping
  for (let x = -L / 2 + 2.5; x < L / 2 - 1; x += 5) {
    sink.span('structureWood', x - 0.14, base + 0.4, D / 2 + 0.06, x + 0.14, top - 0.1, D / 2 + 0.3, { colour: TIMBER_DARK, decor: true });
  }
  // two iron ladders down the face into the water
  for (const lx of [-L * 0.28, L * 0.22]) {
    for (const sx of [-1, 1]) sink.span('structureMetal', lx + sx * 0.22 - 0.025, base + 0.3, D / 2 + 0.08, lx + sx * 0.22 + 0.025, top + 0.9, D / 2 + 0.13, { colour: IRON, decor: true });
    for (let y = base + 0.6; y < top; y += 0.3) sink.span('structureMetal', lx - 0.22, y - 0.015, D / 2 + 0.09, lx + 0.22, y + 0.015, D / 2 + 0.12, { colour: IRON, decor: true, fine: true });
  }
  // the bollards on the coping, every 8 m
  for (let x = -L / 2 + 4; x < L / 2 - 2; x += 8) {
    revolve(sink, 'structureMetal', x, D / 2 - cope / 2 + 0.02, [[0.2, top + 0.07], [0.2, top + 0.35], [0.14, top + 0.5], [0.22, top + 0.62], [0.2, top + 0.7], [0.0, top + 0.72]], 10,
      { colour: IRON, decor: true });
  }
  // the movement record: the paved top a standable floor, in panels (a hull drives on from the land); the face and ends
  // are its sides
  const movement: SimpleCollisionShape[] = [];
  const nx = Math.max(1, Math.round(L / 10)), nz = Math.max(1, Math.round(D / 7));
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    movement.push({ kind: 'obb', cx: -L / 2 + L * (i + 0.5) / nx, cz: -D / 2 + D * (j + 0.5) / nz, hw: L / nx / 2, hl: D / nz / 2, yaw: 0, y0: base, y1: top });
  }
  return { parts: sink.finish(), movement, tints: { stone: [0.92, 0.9, 0.88] } };
};

/**
 * The slipway beside the quay: a ramp of setts on its granite apron, `width` across, running down along the piece's +z
 * from its head `head` metres over the lowest ground to its toe `toe` under it (into the water), its kerbs along both
 * sides, the weed on its lower third. Dressing: a hull drives up it as up the strand it lies on (the way out of the
 * basin beside the quay).
 */
export const slipway: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const L = Math.max(4, Number(ctx.params.length)), W = Math.max(2, Number(ctx.params.width));
  const head = Number(ctx.params.head), toe = Number(ctx.params.toe);
  const yAt = (z: number) => head + (toe - head) * (z + L / 2) / L;
  const n = Math.max(2, Math.round(L / 1.5));
  for (let k = 0; k < n; k++) {
    const z0 = -L / 2 + L * k / n, z1 = -L / 2 + L * (k + 1) / n, y0 = yAt(z0), y1 = yAt(z1);
    // the setts (counter-clockwise from above), the apron's sides down to the bed under them, the kerbs
    const weed = (z0 + L / 2) / L > 0.66 ? 0.6 : 1;
    sink.quad('stone', [-W / 2, y0, z0], [-W / 2, y1, z1], [W / 2, y1, z1], [W / 2, y0, z0], { decor: true, shade: weed });
    for (const sx of [-1, 1]) {
      const x = sx * W / 2;
      const quad: Vec3[] = [[x, y0, z0], [x, y1, z1], [x, Math.min(y1, 0) - 0.6, z1], [x, Math.min(y0, 0) - 0.6, z0]];
      sink.polygon('stone', sx > 0 ? quad.reverse() : quad, { decor: true });
      sink.span('stone', x - 0.18, Math.min(y0, y1) - 0.05, z0, x + 0.18, Math.max(y0, y1) + 0.16, z1, { decor: true, shade: weed });
    }
  }
  // the head's end down to the strand
  sink.quad('stone', [W / 2, head, -L / 2], [W / 2, Math.min(head, 0) - 0.6, -L / 2], [-W / 2, Math.min(head, 0) - 0.6, -L / 2], [-W / 2, head, -L / 2], { decor: true });
  return { parts: sink.finish(), tints: { stone: [0.92, 0.9, 0.88] } };
};

// ---------------------------------------------------------------------------------------------------------- harbour

/** The boats' Breton paint: the hull, the band under the gunwale, the antifouling under the waterline. */
const HULLS: readonly Rgb[] = [rgb(0xe8e6df), rgb(0x2a4a7a), rgb(0x2f6e5a), rgb(0xa8322a), rgb(0xd9a531), rgb(0x5f8fb8)];
const BANDS: readonly Rgb[] = [rgb(0x2a4a7a), rgb(0xe8e6df), rgb(0xe8e6df), rgb(0xe8e6df), rgb(0x2f6e5a), rgb(0xe8e6df)];
const ANTIFOUL: readonly Rgb[] = [rgb(0x7a2f24), rgb(0x262624), rgb(0x8a3a28)];
const BOAT_INSIDE = rgb(0xb9b2a2), BOAT_TIMBER = rgb(0x8a7458), CABIN_WHITE = rgb(0xe2e0d8), SPAR = rgb(0x6e5a44);
const NETS: readonly Rgb[] = [rgb(0x3f6b4a), rgb(0x2f5d8a), rgb(0xc0622c), rgb(0x5f7a3a)];
const POT_MESH = rgb(0x3a3e36), POT_BASE = rgb(0x5e4e3c), FISH_BOXES: readonly Rgb[] = [rgb(0x2c5fa0), rgb(0xb83a2e)], FLOAT = rgb(0xe0642a);
/** How far a wading hull's track plane sinks into a soft bed (the slipway's foot in the water): its entry plate lies so
 *  much deeper, and its climb starts there. */
const WET_SINK_M = 0.3;
const BOLLARD_PROFILE: ReadonlyArray<readonly [number, number]> = [[0.2, 0], [0.2, 0.28], [0.14, 0.43], [0.22, 0.55], [0.2, 0.63], [0, 0.65]];

/** A polygon emitted facing `out`: wound so its Newell normal points that way. */
function facing(sink: PartSink, bucket: RegionalBucket, pts: readonly Vec3[], out: Vec3, opts: EmitOptions = {}): void {
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], c = pts[(i + 1) % pts.length];
    nx += (a[1] - c[1]) * (a[2] + c[2]); ny += (a[2] - c[2]) * (a[0] + c[0]); nz += (a[0] - c[0]) * (a[1] + c[1]);
  }
  sink.polygon(bucket, nx * out[0] + ny * out[1] + nz * out[2] >= 0 ? pts : [...pts].reverse(), opts);
}

/** A rigid pose for a boat or a heap: heel about its length (+z), trim, then yaw (the frame's: +z turns to (sin, cos)). */
function rigid(x: number, y: number, z: number, yaw: number, heel = 0, trim = 0): { p: (v: Vec3) => Vec3; d: (v: Vec3) => Vec3 } {
  const ch = Math.cos(heel), sh = Math.sin(heel), ct = Math.cos(trim), st = Math.sin(trim), cy = Math.cos(yaw), sy = Math.sin(yaw);
  const d = (v: Vec3): Vec3 => {
    const x1 = v[0] * ch - v[1] * sh, y1 = v[0] * sh + v[1] * ch, z1 = v[2];
    const y2 = y1 * ct - z1 * st, z2 = y1 * st + z1 * ct;
    return [x1 * cy + z2 * sy, y2, -x1 * sy + z2 * cy];
  };
  return { d, p: (v: Vec3): Vec3 => { const r = d(v); return [r[0] + x, r[1] + y, r[2] + z]; } };
}

type BoatKind = 'canot' | 'caseyeur';
/** A boat's hull stations from the transom (s 0) to the stem (s 1): the half beam's share, the sheer and the bottom (× H). */
const STATIONS: ReadonlyArray<readonly [number, number, number, number]> = [
  [0, 0.8, 1.0, 0.16], [0.1, 0.9, 0.98, 0.04], [0.3, 0.99, 0.96, 0], [0.5, 1, 0.97, 0], [0.68, 0.93, 1.03, 0.02], [0.84, 0.66, 1.14, 0.18], [1, 0, 1.32, 0.62],
];

/**
 * A Breton fishing boat in its own frame (the keel's line along +z to the stem, y up from the keel, x across): a canot
 * (open, its thwarts, floorboards and a stubby mast) or a caseyeur (decked, its wheelhouse aft of amidships, a mast and
 * boom forward) — the hull in its colour, a band under the gunwale, the antifouling under the waterline. `seat` lifts
 * it so its lowest point stands at `floorY` (a hull aground), or it floats at `floatY` (its waterline there). Dressing.
 */
function boat(sink: PartSink, kind: BoatKind, L: number, B: number, H: number, colour: { hull: Rgb; band: Rgb; bottom: Rgb },
  at: { x: number; z: number; yaw: number; heel: number; trim: number; floorY: number; floatY: number | null }, fine: boolean): void {
  const section = (hb: number, sh: number, yb: number): Array<[number, number]> =>
    [[0, yb], [0.55 * hb, yb + 0.06 * (sh - yb)], [0.9 * hb, yb + 0.38 * (sh - yb)], [hb, sh]];
  const rows = STATIONS.map(([s, k, sh, yb]) => ({ z: -L / 2 + s * L, pts: section(k * B / 2, sh * H, yb * H) }));
  // seat: the lowest hull point after the heel and trim (afloat: the waterline at 0.38 of the depth)
  const probe = rigid(0, 0, 0, at.yaw, at.heel, at.trim);
  let low = Infinity;
  for (const row of rows) for (const [px, py] of row.pts) for (const sx of [-1, 1]) low = Math.min(low, probe.p([sx * px, py, row.z])[1]);
  const y = at.floatY !== null ? at.floatY - 0.36 * H : at.floorY - low - 0.04;
  const P = rigid(at.x, y, at.z, at.yaw, at.heel, at.trim);
  const opt = (c: Rgb): EmitOptions => ({ colour: c, decor: true, ...(fine ? { fine: true } : {}) });
  // the hull: three strakes a side between the stations, and the transom — each a thin shell drawn from both sides (an
  // open boat's inside shows; the props draw front faces only)
  const open = kind === 'canot';
  for (let i = 0; i + 1 < rows.length; i++) {
    const a = rows[i], c = rows[i + 1];
    for (let j = 0; j < 3; j++) for (const sx of [-1, 1]) {
      const [ax, ay] = a.pts[j], [bx, by] = a.pts[j + 1], [cx, cy] = c.pts[j + 1], [dx, dy] = c.pts[j];
      const mid = (ay + by + cy + dy) / 4, out: Vec3 = [sx * (by - ay), -(bx - ax), 0];
      const col = j < 2 ? colour.bottom : colour.hull;
      const quad = [P.p([sx * ax, ay, a.z]), P.p([sx * bx, by, a.z]), P.p([sx * cx, cy, c.z]), P.p([sx * dx, dy, c.z])];
      facing(sink, 'structureWood', quad, P.d(out), opt(mid < 0.36 * H ? colour.bottom : col));
      if (open || j === 2) facing(sink, 'structureWood', quad, P.d([-out[0], -out[1], -out[2]]), opt(BOAT_INSIDE));
    }
    // the band under the gunwale (a hand's breadth proud, so it never fights the strake)
    for (const sx of [-1, 1]) {
      const [ax, ay] = a.pts[3], [cx, cy] = c.pts[3];
      const ex = (v: number) => v * 1.02 + 0.006;
      facing(sink, 'structureWood', [P.p([sx * ex(ax), ay - 0.02, a.z]), P.p([sx * ex(ax), ay - 0.17, a.z]), P.p([sx * ex(cx), cy - 0.17, c.z]),
        P.p([sx * ex(cx), cy - 0.02, c.z])], P.d([sx, 0, 0]), opt(colour.band));
    }
  }
  const stern = rows[0];
  const transom = [...stern.pts.map(([px, py]) => P.p([px, py, stern.z])).reverse(), ...stern.pts.slice(1).map(([px, py]) => P.p([-px, py, stern.z]))];
  facing(sink, 'structureWood', transom, P.d([0, 0, -1]), opt(colour.hull));
  facing(sink, 'structureWood', transom, P.d([0, 0, 1]), opt(BOAT_INSIDE));
  const sheer = (sx: number, inset: number, dy: number) => rows.map((row) => P.p([sx * Math.max(0, row.pts[3][0] - inset), row.pts[3][1] + dy, row.z]));
  if (kind === 'caseyeur') {
    // the deck at the sheer, the wheelhouse aft of amidships, the mast and boom forward
    facing(sink, 'structureWood', [...sheer(1, 0.06, -0.08), ...sheer(-1, 0.06, -0.08).reverse()], P.d([0, 1, 0]), opt(BOAT_TIMBER));
    const deckY = H * 0.97 - 0.08, z0 = -L * 0.2, z1 = -L * 0.02, hw = B * 0.3;
    const box = (x0: number, y0: number, za: number, x1: number, y1: number, zb: number, c: Rgb) => {
      const v = (x: number, yy: number, z: number) => P.p([x, yy, z]);
      facing(sink, 'structureWood', [v(x0, y1, za), v(x1, y1, za), v(x1, y1, zb), v(x0, y1, zb)], P.d([0, 1, 0]), opt(c));
      facing(sink, 'structureWood', [v(x0, y0, za), v(x1, y0, za), v(x1, y1, za), v(x0, y1, za)], P.d([0, 0, -1]), opt(c));
      facing(sink, 'structureWood', [v(x0, y0, zb), v(x1, y0, zb), v(x1, y1, zb), v(x0, y1, zb)], P.d([0, 0, 1]), opt(c));
      facing(sink, 'structureWood', [v(x0, y0, za), v(x0, y0, zb), v(x0, y1, zb), v(x0, y1, za)], P.d([-1, 0, 0]), opt(c));
      facing(sink, 'structureWood', [v(x1, y0, za), v(x1, y0, zb), v(x1, y1, zb), v(x1, y1, za)], P.d([1, 0, 0]), opt(c));
    };
    box(-hw, deckY, z0, hw, deckY + 1.55, z1, CABIN_WHITE);
    box(-hw - 0.08, deckY + 1.55, z0 - 0.1, hw + 0.08, deckY + 1.66, z1 + 0.12, colour.hull === HULLS[0] ? HULLS[1] : colour.hull);
    // its windows: the front pair and one a side
    const win = (pts: Vec3[], out: Vec3) => facing(sink, 'structureWood', pts.map((v) => P.p(v)), P.d(out), opt(WINDOW));
    for (const sx of [-1, 1]) {
      win([[sx * 0.08, deckY + 0.95, z1 + 0.01], [sx * (hw - 0.12), deckY + 0.95, z1 + 0.01], [sx * (hw - 0.12), deckY + 1.38, z1 + 0.01], [sx * 0.08, deckY + 1.38, z1 + 0.01]], [0, 0, 1]);
      win([[sx * (hw + 0.01), deckY + 0.95, z0 + 0.25], [sx * (hw + 0.01), deckY + 0.95, z1 - 0.25], [sx * (hw + 0.01), deckY + 1.38, z1 - 0.25], [sx * (hw + 0.01), deckY + 1.38, z0 + 0.25]], [sx, 0, 0]);
    }
    const mz = L * 0.18;
    bar(sink, 'structureWood', P.p([0, deckY, mz]), P.p([0, deckY + 5.2, mz]), 0.12, opt(SPAR));
    bar(sink, 'structureWood', P.p([0, deckY + 1.6, mz]), P.p([0, deckY + 1.9, mz - L * 0.3]), 0.08, opt(SPAR));
  } else {
    // open: the floorboards, two thwarts, the stubby mast with the sail furled on its yard
    const fy = H * 0.3, fw = (s: number) => B * 0.36 * (s < 0.5 ? 1 : 1 - (s - 0.5) * 1.4);
    facing(sink, 'structureWood', [P.p([-fw(0.1), fy, -L * 0.4]), P.p([fw(0.1), fy, -L * 0.4]), P.p([fw(0.75), fy, L * 0.25]), P.p([-fw(0.75), fy, L * 0.25])],
      P.d([0, 1, 0]), opt(BOAT_TIMBER));
    for (const tz of [-L * 0.18, L * 0.12]) {
      const ty = H * 0.72, w = B * 0.47;
      facing(sink, 'structureWood', [P.p([-w, ty, tz - 0.14]), P.p([w, ty, tz - 0.14]), P.p([w, ty, tz + 0.14]), P.p([-w, ty, tz + 0.14])], P.d([0, 1, 0]), opt(BOAT_TIMBER));
    }
    bar(sink, 'structureWood', P.p([0, H * 0.3, L * 0.2]), P.p([0, H + 2.6, L * 0.2]), 0.09, opt(SPAR));
    bar(sink, 'structureWood', P.p([0, H + 2.3, L * 0.2 + 0.1]), P.p([0, H * 0.9, -L * 0.25]), 0.16, opt(rgb(0x9a6a4a)));
  }
}

/** A heap of drying net on the quay: an irregular low mound of mesh, its corks along the top. Dressing. */
function netHeap(sink: PartSink, x: number, y: number, z: number, r: number, h: number, colour: Rgb, rng: () => number): void {
  const n = 7, k = Array.from({ length: n }, () => 0.75 + rng() * 0.45), phase = rng() * Math.PI;
  const ring = (yy: number, s: number): Vec3[] => Array.from({ length: n }, (_, i) => {
    const a = phase + i / n * Math.PI * 2;
    return [x + Math.sin(a) * r * s * k[i], yy, z + Math.cos(a) * r * s * k[i]];
  });
  const rings = [ring(y - 0.02, 1), ring(y + h * 0.5, 0.74), ring(y + h * 0.88, 0.34)];
  for (let level = 0; level + 1 < rings.length; level++) {
    const a = rings[level], b = rings[level + 1];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, mx = (a[i][0] + a[j][0]) / 2 - x, mz = (a[i][2] + a[j][2]) / 2 - z;
      facing(sink, 'structureWood', [a[i], a[j], b[j], b[i]], [mx, 0.4 + level * 0.5, mz], { colour: shade(colour, 0.84 + rng() * 0.26), decor: true });
    }
  }
  facing(sink, 'structureWood', rings[2], [0, 1, 0], { colour: shade(colour, 1.05), decor: true });
  for (let i = 0; i < n; i += 2) {
    const p = rings[1][i];
    sink.span('structureWood', p[0] - 0.07, p[1] - 0.02, p[2] - 0.07, p[0] + 0.07, p[1] + 0.09, p[2] + 0.07, { colour: FLOAT, decor: true, fine: true });
  }
}

/** A stack of lobster pots (casiers): D-shaped cages of dark mesh on their timber bases, `cols` x `rows`, `tiers` high. */
function potStack(sink: PartSink, x: number, y: number, z: number, yaw: number, cols: number, rows: number, tiers: number, rng: () => number): void {
  sink.placed(yaw, x, y, z, () => {
    for (let t = 0; t < tiers; t++) for (let c = 0; c < cols - t; c++) for (let r = 0; r < rows; r++) {
      const px = (c - (cols - t - 1) / 2) * 0.5, pz = (r - (rows - 1) / 2) * 0.66 + (rng() - 0.5) * 0.06, py = t * 0.4;
      sink.span('structureWood', px - 0.23, py, pz - 0.31, px + 0.23, py + 0.05, pz + 0.31, { colour: POT_BASE, decor: true, fine: true });
      extrude(sink, 'structureWood', [[px - 0.22, py + 0.05, pz - 0.3], [px + 0.22, py + 0.05, pz - 0.3], [px + 0.22, py + 0.24, pz - 0.3],
        [px + 0.12, py + 0.38, pz - 0.3], [px - 0.12, py + 0.38, pz - 0.3], [px - 0.22, py + 0.24, pz - 0.3]], [0, 0, 1], 0.6,
      { colour: POT_MESH, decor: true, fine: true });
    }
  });
}

/**
 * A small Breton fishing harbour as one structure (the landmarks lane, round 3 for Saltmere Bay; gauntlet wave 202: "the
 * mole rooted in the shore with its road, the quay with coping and steps round a basin, boats and nets, the light at the
 * mole head"). The mole is the shore road's continuation: rooted on the shore where the road arrives (its deck level
 * with the road there), it runs out over the strand into the water and turns its arm round the basin to its round head
 * and the feu de port; its basin faces are a quay — granite coping, bollards, two iron ladders and two flights of stone
 * steps down to the sand — and its sea side a parapet wall. From a platform at its root the slipway runs down its basin
 * face onto the sand: the boats' way into the water (the basin stays open on its strand side, a hull's way out). In the
 * basin the boats lie on
 * the sand heeled over or ride at their moorings, one lies alongside the arm, and on the deck by the root the nets dry
 * in heaps beside the pots and the fish boxes.
 *
 * The frame (plan.ts harbourLayout): the root at the origin, the first leg along +z to the elbow, the arm turned toward
 * the basin side; y = 0 the lowest ground under the footprint. The body is one solid from below the bed to the deck. Its
 * movement record: the deck a standable floor from the root on — opening with an entry plate under the shore's ground
 * (bridges.ts ENTRY_M's note: the road's hulls drive on) — the parapets its walls, the slipway's floor stepping up from
 * its own plate at the foot. (A hull mounts the slipway's foot and its first metres; its full 1:6 run is steeper than a
 * stair of floor parts in one record lets a hull's rear tracks follow — collision.ts hullUndersideOver reads the lowest
 * track row over the record — so the slipway is the boats' way, and the basin's strand is a hull's.)
 */
export const harbour: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const h = harbourLayout(ctx.params), { L1, L2, t, W, b, m, dx, dz, Rh } = h;
  const ground = (x: number, z: number) => (ctx.ground ? ctx.ground(b * x, z) : 0);
  const water = (x: number, z: number) => (ctx.water ? ctx.water(b * x, z) : 0);
  const bat = 0.45, foot = -1.0;
  // the deck: level with the shore at the root (its highest ground over the entry), or as authored
  let rootY = 0;
  for (const z of [0, 1.25, 2.5]) for (const x of [-W / 4, 0, W / 4]) rootY = Math.max(rootY, ground(x, z));
  const D = Number(ctx.params.deck) >= 0 ? Number(ctx.params.deck) : rootY + 0.05;
  const V = (x: number, y: number, z: number): Vec3 => [b * x, y, z];
  const out = (x: number, y: number, z: number): Vec3 => [b * x, y, z];
  const E: [number, number] = [0, L1], H: [number, number] = [h.head[0], h.head[1]];
  const left2: [number, number] = [-dz, dx], right2: [number, number] = [dz, -dx];
  const at2 = (s: number, o: number): [number, number] => [E[0] + dx * s + right2[0] * o, E[1] + dz * s + right2[1] * o];

  // ---- the body: the legs as battered prisms (their joint mitred), the root platform, the round head
  const body = (outline: Array<[number, number]>, sides: boolean[], top = D) => {
    const n = outline.length;
    const cx = outline.reduce((a, p) => a + p[0], 0) / n, cz = outline.reduce((a, p) => a + p[1], 0) / n;
    const normals = outline.map((p, i) => {
      const q = outline[(i + 1) % n], ex = q[0] - p[0], ez = q[1] - p[1], l = Math.hypot(ex, ez) || 1;
      let nx = ez / l, nz = -ex / l;
      if (nx * ((p[0] + q[0]) / 2 - cx) + nz * ((p[1] + q[1]) / 2 - cz) < 0) { nx = -nx; nz = -nz; }
      return [nx, nz] as const;
    });
    const low = outline.map((p, i) => {
      const a = normals[(i + n - 1) % n], c = normals[i], k = bat / Math.max(0.3, 1 + a[0] * c[0] + a[1] * c[1]);
      return [p[0] + (a[0] + c[0]) * k, p[1] + (a[1] + c[1]) * k] as const;
    });
    facing(sink, 'stone', outline.map(([x, z]) => V(x, top, z)), [0, 1, 0]);
    for (let i = 0; i < n; i++) {
      if (!sides[i]) continue;
      const j = (i + 1) % n;
      facing(sink, 'stone', [V(outline[i][0], top, outline[i][1]), V(outline[j][0], top, outline[j][1]), V(low[j][0], foot, low[j][1]), V(low[i][0], foot, low[i][1])],
        out(normals[i][0], 0, normals[i][1]));
    }
  };
  // the first leg (its root end against the shore, its joint with the arm mitred), the root platform beside it
  body([[-W / 2, 0], [W / 2, 0], [W / 2, L1 - m], [-W / 2, L1 + m]], [true, true, false, true]);
  const slipW = h.slip, zS0 = h.slipTop;
  if (slipW > 0) body([[W / 2, 0], [W / 2 + slipW, 0], [W / 2 + slipW, zS0], [W / 2, zS0]], [true, true, false, false]);
  // the arm, from the mitre to the head's centre
  const armEnd = (o: number) => at2(L2, o);
  body([[-W / 2, L1 + m], [W / 2, L1 - m], armEnd(W / 2), armEnd(-W / 2)], [false, true, false, true]);
  // the round head, a kerb's height proud of the deck
  revolve(sink, 'stone', b * H[0], H[1], [[Rh + bat, foot], [Rh, D + 0.06], [0, D + 0.06]], 20, {}, Math.PI / 20);
  // where the shore falls away under the root (the embankment's flank), a pitched granite revetment from the deck's edge
  // down to the ground behind it, so the root sits in the shore rather than standing on it (dressing on the bank)
  {
    const x0 = -W / 2, x1 = W / 2 + h.slip, n = Math.max(2, Math.ceil((x1 - x0) / 1.5));
    const edge = Array.from({ length: n + 1 }, (_, i) => {
      const x = x0 + (x1 - x0) * i / n, g = Math.min(D, ground(x, -1.2)), run = Math.max(0, D - g) * 1.25;
      return { x, top: V(x, D, 0), low: V(x, g - 0.25, -run - 0.3), run };
    });
    for (let i = 0; i < n; i++) {
      const a = edge[i], c = edge[i + 1];
      if (a.run < 0.2 && c.run < 0.2) continue;
      facing(sink, 'stone', [a.top, c.top, c.low, a.low], out(0, 1, -1), { decor: true });
    }
    const last = edge[n];
    if (last.run >= 0.2) facing(sink, 'stone', [last.top, last.low, V(last.x, last.low[1], 0)], out(1, 0, 0), { decor: true });
  }

  // ---- the coping along the basin faces: big granite blocks a hand proud of the face, their joints dark
  const copeRun = (x0: number, z0: number, x1: number, z1: number, inward: [number, number]) => {
    const len = Math.hypot(x1 - x0, z1 - z0), yaw = Math.atan2(b * (x1 - x0), z1 - z0);
    sink.placed(yaw, b * x0, 0, z0, () => {
      // (in the run's frame: along +z, the face toward -x or +x by the inward side)
      const side = (inward[0] * (z1 - z0) - inward[1] * (x1 - x0)) * b > 0 ? 1 : -1;
      const xi = side * 0.5, xo = -side * 0.06;
      sink.span('stone', Math.min(xi, xo), D - 0.32, 0, Math.max(xi, xo), D + 0.07, len, { decor: true });
      for (let s = 1.3; s < len - 0.4; s += 1.3) {
        sink.span('structureWood', Math.min(xi, xo), D + 0.071, s - 0.015, Math.max(xi, xo), D + 0.074, s + 0.015, { colour: rgb(0x2a2826), decor: true, fine: true });
      }
    });
  };
  copeRun(W / 2, zS0, W / 2, L1 - m, [-1, 0]);
  if (slipW > 0) copeRun(W / 2 + slipW, 0, W / 2 + slipW, zS0, [-1, 0]);
  const headStart = Math.sqrt(Math.max(0, Rh * Rh - (W / 2) ** 2));
  {
    const a = at2(m, W / 2), c = at2(L2 - headStart, W / 2);
    copeRun(a[0], a[1], c[0], c[1], [left2[0], left2[1]]);
  }

  // ---- the parapet on the sea side: along the first leg, the arm, and round the head's seaward half
  const parapetH = 1.15, pt = 0.8;
  const wallRun = (x0: number, z0: number, x1: number, z1: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0), yaw = Math.atan2(b * (x1 - x0), z1 - z0);
    sink.placed(yaw, b * x0, 0, z0, () => {
      sink.span('stone', -pt / 2, D - 0.05, 0, pt / 2, D + parapetH, len);
      sink.span('stone', -pt / 2 - 0.06, D + parapetH, -0.04, pt / 2 + 0.06, D + parapetH + 0.1, len + 0.04, { decor: true });
    });
  };
  wallRun(-W / 2 + pt / 2, 0.6, -W / 2 + pt / 2, L1 + m - pt / 2 * Math.tan(t / 2));
  {
    const a = at2(-m + pt / 2 * Math.tan(t / 2), -W / 2 + pt / 2), c = at2(L2 - headStart, -W / 2 + pt / 2);
    wallRun(a[0], a[1], c[0], c[1]);
  }
  // the head's seaward arc, from where the arm's parapet meets it round past the arm's line
  const aOf = (vx: number, vz: number) => Math.atan2(vx, vz);
  const aStart = aOf(left2[0] * (W / 2 - pt / 2) - dx * headStart, left2[1] * (W / 2 - pt / 2) - dz * headStart);
  const aEnd = aOf(dx, dz) + 0.7, arcN = 7;
  const rIn = Rh - 0.15 - pt, rOut = Rh - 0.15;
  for (let k = 0; k < arcN; k++) {
    const a0 = aStart + (aEnd - aStart) * k / arcN, a1 = aStart + (aEnd - aStart) * (k + 1) / arcN;
    const pt2 = (a: number, r: number, y: number): Vec3 => V(H[0] + Math.sin(a) * r, y, H[1] + Math.cos(a) * r);
    const y0 = D + 0.06, y1 = D + 0.06 + parapetH, am = (a0 + a1) / 2;
    facing(sink, 'stone', [pt2(a0, rOut, y0), pt2(a1, rOut, y0), pt2(a1, rOut, y1), pt2(a0, rOut, y1)], out(Math.sin(am), 0, Math.cos(am)));
    facing(sink, 'stone', [pt2(a0, rIn, y0), pt2(a1, rIn, y0), pt2(a1, rIn, y1), pt2(a0, rIn, y1)], out(-Math.sin(am), 0, -Math.cos(am)));
    facing(sink, 'stone', [pt2(a0, rIn - 0.06, y1), pt2(a1, rIn - 0.06, y1), pt2(a1, rOut + 0.06, y1), pt2(a0, rOut + 0.06, y1)], [0, 1, 0]);
    if (k === arcN - 1) facing(sink, 'stone', [pt2(a1, rIn, y0), pt2(a1, rOut, y0), pt2(a1, rOut, y1), pt2(a1, rIn, y1)], out(Math.cos(a1), 0, -Math.sin(a1)));
  }

  // ---- the slipway down the first leg's basin face, from the root platform onto the sand (its foot in the water's edge)
  const grade = Math.max(0.1, Math.min(0.3, Number(ctx.params.grade)));
  let slipFoot = zS0, yFoot = D;
  if (slipW > 0) {
    const gAt = (z: number) => ground(W / 2 + slipW / 2, z);
    // the foot where the ramp at its grade meets the ground (at most 26 m on: the plan's solid; steeper past that)
    for (let z = zS0; z <= zS0 + 26; z += 0.25) { slipFoot = z; if (D - (z - zS0) * grade <= gAt(z) + 0.05) break; }
    yFoot = Math.min(D, gAt(slipFoot) + 0.05);
    const x0 = W / 2, x1 = W / 2 + slipW;
    extrude(sink, 'stone', [V(x1, foot, zS0), V(x1, D, zS0), V(x1, yFoot, slipFoot), V(x1, foot, slipFoot)], [-b, 0, 0], slipW);
    // the kerb along its open edge, the weed on its lower third
    bar(sink, 'stone', V(x1 - 0.17, D + 0.1, zS0), V(x1 - 0.17, yFoot + 0.1, slipFoot), 0.34, { decor: true });
    const yW = (z: number) => D + (yFoot - D) * (z - zS0) / Math.max(0.1, slipFoot - zS0);
    const zw = zS0 + (slipFoot - zS0) * 0.66;
    facing(sink, 'stone', [V(x0 + 0.02, yW(zw) + 0.02, zw), V(x1 - 0.36, yW(zw) + 0.02, zw), V(x1 - 0.36, yFoot + 0.02, slipFoot), V(x0 + 0.02, yFoot + 0.02, slipFoot)],
      [0, 1, 0], { decor: true, shade: 0.58 });
  }

  // ---- the quay's furniture: bollards on the coping, two iron ladders, two flights of steps down the basin faces
  const bollard = (x: number, z: number) => revolve(sink, 'structureMetal', b * x, z, BOLLARD_PROFILE.map(([r, y]) => [r, D + 0.07 + y] as const), 10,
    { colour: IRON, decor: true });
  if (slipW > 0) { bollard(W / 2 + slipW - 0.45, 1.6); bollard(W / 2 + slipW - 0.45, zS0 - 1.2); }
  for (const z of [slipFoot + 2.5, L1 - m - 3.5]) bollard(W / 2 - 0.4, z);
  for (const s of [m + 3, (m + L2 - headStart) / 2, L2 - headStart - 1.2]) { const p = at2(s, W / 2 - 0.4); bollard(p[0], p[1]); }
  const ladder = (p: [number, number], n: [number, number]) => {
    const g = ground(p[0] + n[0] * 0.6, p[1] + n[1] * 0.6), tx = -n[1], tz = n[0];
    for (const sx of [-1, 1]) {
      const q = (o: number, y: number): Vec3 => V(p[0] + n[0] * o + tx * sx * 0.22, y, p[1] + n[1] * o + tz * sx * 0.22);
      bar(sink, 'structureMetal', q(0.1, g - 0.2), q(0.1, D + 0.9), 0.05, { colour: IRON, decor: true });
    }
    for (let y = g + 0.3; y < D; y += 0.3) {
      bar(sink, 'structureMetal', V(p[0] + n[0] * 0.1 - tx * 0.22, y, p[1] + n[1] * 0.1 - tz * 0.22), V(p[0] + n[0] * 0.1 + tx * 0.22, y, p[1] + n[1] * 0.1 + tz * 0.22),
        0.03, { colour: IRON, decor: true, fine: true });
    }
  };
  ladder([W / 2 + 0.06, L1 - m - 1.6], [1, 0]);
  { const p = at2(L2 * 0.62, W / 2 + 0.06); ladder(p, [right2[0], right2[1]]); }
  // a flight down the face: steps a metre wide, out from the face, each `rise` under the one above, toward -along
  const flight = (p: [number, number], along: [number, number], n: [number, number]) => {
    const rise = 0.25, tread = 0.3;
    for (let k = 0; ; k++) {
      const yTop = D - (k + 1) * rise, s0 = k * tread, s1 = s0 + tread;
      const g = ground(p[0] - along[0] * s1 + n[0] * 0.6, p[1] - along[1] * s1 + n[1] * 0.6);
      if (yTop < g - 0.05 || k > 40) break;
      const c = (s: number, o: number, y: number): Vec3 => V(p[0] - along[0] * s + n[0] * o, y, p[1] - along[1] * s + n[1] * o);
      extrude(sink, 'stone', [c(s0, 0, foot), c(s0, 1.05, foot), c(s0, 1.05, yTop), c(s0, 0, yTop)], out(-along[0], 0, -along[1]), tread, { decor: true });
    }
  };
  flight([W / 2, slipFoot + 1.4], [0, -1], [1, 0]);
  { const p = at2(L2 * 0.32, W / 2); flight(p, [dx, dz], [right2[0], right2[1]]); }

  // ---- the light on the head, its door toward the deck
  const doorA = Math.atan2(-b * dx, -dz);
  lightTower(sink, b * H[0], D + 0.06, H[1], Math.max(6, Number(ctx.params.height)), 1.3, PAINT[String(ctx.params.light)] ?? PAINT.green, doorA);

  // ---- the boats: aground on the basin's sand, heeled, or riding at their moorings, and one alongside the arm
  const boats = Math.max(0, Math.round(Number(ctx.params.boats)));
  const vr = ctx.variant;
  // (in the basin between the slipway and the arm, kept inside the plan's reach: plan.ts harbourLayout `across`)
  const xMax = h.across - 0.8 - 5.5, inBasin = (x: number) => Math.min(x, xMax);
  const berths: Array<{ x: number; z: number; yaw: number; kind: BoatKind }> = [
    { x: inBasin(W / 2 + slipW + 5.5), z: zS0 + 7, yaw: 1.9, kind: 'canot' },
    { x: inBasin(W / 2 + slipW + 10.5), z: zS0 + 13, yaw: 1.2, kind: 'canot' },
    { ...(() => { const p = at2(L2 * 0.6, W / 2 + 3.2); return { x: p[0], z: p[1] }; })(), yaw: Math.atan2(dx, dz) + Math.PI, kind: 'caseyeur' },
    { x: inBasin(W / 2 + slipW + 9), z: L1 - 12, yaw: 0.15, kind: 'caseyeur' },
    { x: inBasin(W / 2 + slipW + 15), z: L1 - 4, yaw: -0.2, kind: 'canot' },
  ];
  for (let i = 0; i < Math.min(boats, berths.length); i++) {
    const berth = berths[i], depth = water(berth.x, berth.z), g = ground(berth.x, berth.z);
    const afloat = depth > 0.25, L = berth.kind === 'caseyeur' ? 8.4 + vr() * 1.2 : 5.2 + vr() * 1.0;
    const B = berth.kind === 'caseyeur' ? 2.9 : 1.9, Hh = berth.kind === 'caseyeur' ? 1.25 : 0.82;
    const hue = Math.floor(vr() * HULLS.length) % HULLS.length;
    boat(sink, berth.kind, L, B, Hh, { hull: HULLS[hue], band: BANDS[hue], bottom: ANTIFOUL[Math.floor(vr() * ANTIFOUL.length) % ANTIFOUL.length] },
      { x: b * berth.x, z: berth.z, yaw: b * berth.yaw, heel: afloat ? 0 : b * (vr() < 0.5 ? -1 : 1) * (0.16 + vr() * 0.1), trim: afloat ? 0 : 0.03,
        floorY: g, floatY: afloat ? g + depth : null }, i >= 3);
  }

  // ---- the nets, pots and fish boxes on the deck by the root, along the parapet's foot (the road stays clear)
  if (ctx.params.nets !== false) {
    netHeap(sink, b * (-W / 2 + pt + 1.3), D, 8.5, 1.3, 0.55, NETS[Math.floor(vr() * NETS.length) % NETS.length], vr);
    netHeap(sink, b * (-W / 2 + pt + 1.1), D, 11.6, 1.0, 0.42, NETS[Math.floor(vr() * NETS.length) % NETS.length], vr);
    potStack(sink, b * (-W / 2 + pt + 0.9), D, 16, 0, 2, 3, 2, vr);
    for (const [bx, bz, n] of [[W / 2 + slipW - 1.2, 2.6, 3], [W / 2 + slipW - 1.9, 3.5, 2]] as const) {
      for (let k = 0; k < n; k++) {
        const c = FISH_BOXES[(k + Math.floor(bz)) % FISH_BOXES.length];
        sink.span('structureWood', b * bx - 0.3, D + k * 0.31, bz - 0.2, b * bx + 0.3, D + k * 0.31 + 0.3, bz + 0.2, { colour: c, decor: true, fine: true });
      }
    }
    for (const [fx, fz] of [[-W / 2 + pt + 2.4, 9.6], [-W / 2 + pt + 0.7, 13.1]] as const) {
      revolve(sink, 'structureMetal', b * fx, fz, [[0, D], [0.22, D + 0.2], [0.24, D + 0.32], [0.18, D + 0.44], [0, D + 0.5]], 8, { colour: FLOAT, decor: true, fine: true });
    }
  }

  // ---- the movement record: the deck's floors from below the bed (the body's faces are their sides), the entry plate
  // at the root, the slipway's floor stepping up from its own plate at the foot, the head, the parapets, the light
  const parts: SimpleCollisionShape[] = [];
  // (every part at least a standable floor's depth under its top: collision.ts HULL_STANDABLE_HEIGHT_M is 0.9 — a plate
  // sunk near the bed would otherwise be a kerb a hull meets, not a floor it mounts)
  const obb = (cx: number, cz: number, hw: number, hl: number, yaw: number, y0: number, y1: number) =>
    parts.push({ kind: 'obb', cx: b * cx, cz, hw, hl, yaw: b * yaw, y0: Math.min(y0, y1 - 1.0), y1 });
  let gEntry = Infinity;
  for (const z of [0, 1.25, 2.5]) for (const x of [-W / 2, 0, W / 2]) gEntry = Math.min(gEntry, ground(x, z));
  const yEntry = Math.min(gEntry, D) - ENTRY_SINK_M;
  obb(0, ENTRY_M / 2, W / 2, ENTRY_M / 2, 0, yEntry - 1.0, yEntry);
  const panels = (z0: number, z1: number) => {
    const n = Math.max(1, Math.ceil((z1 - z0) / 8));
    for (let i = 0; i < n; i++) { const a = z0 + (z1 - z0) * i / n, c = z0 + (z1 - z0) * (i + 1) / n; obb(0, (a + c) / 2, W / 2, (c - a) / 2, 0, foot, D); }
  };
  panels(ENTRY_M, L1 + m);
  if (slipW > 0) obb(W / 2 + slipW / 2, zS0 / 2, slipW / 2, zS0 / 2, 0, foot, D);
  {
    const n = Math.max(1, Math.ceil((L2 + m) / 8));
    for (let i = 0; i < n; i++) {
      const a = -m + (L2 + m) * i / n, c = -m + (L2 + m) * (i + 1) / n, p = at2((a + c) / 2, 0);
      obb(p[0], p[1], W / 2, (c - a) / 2, t, foot, D);
    }
  }
  parts.push({ kind: 'circle', cx: b * H[0], cz: H[1], r: Rh, y0: foot, y1: D + 0.06 });
  // the slipway: its foot's plate under the sand, then 1 m parts up to the root platform, each at most ENTRY_CLIMB_M over
  // the one below it (bridges.ts ENTRY_CLIMB_M)
  if (slipW > 0 && slipFoot - zS0 > ENTRY_M + 1) {
    const xc = W / 2 + slipW / 2, surf = (z: number) => D + (yFoot - D) * (z - zS0) / (slipFoot - zS0);
    const zIn = slipFoot - ENTRY_M;
    let gP = Infinity;
    for (const z of [zIn, (zIn + slipFoot) / 2, slipFoot]) for (const x of [W / 2, xc, W / 2 + slipW]) gP = Math.min(gP, ground(x, z));
    // (a foot in the water: a hull wading there sinks into the soft bed a hand or more, its nose with it — the plate
    // lies deeper, and the climb starts from the hull's sunk track plane)
    const wet = Math.max(water(xc, zIn), water(xc, slipFoot)) > 0.1 ? WET_SINK_M : 0;
    const yP = Math.min(gP, surf(zIn)) - ENTRY_SINK_M - wet;
    obb(xc, (zIn + slipFoot) / 2, slipW / 2, ENTRY_M / 2, 0, foot, yP);
    let prev = Math.max(yP, ground(xc, zIn) - wet);
    const n = Math.max(1, Math.ceil(zIn - zS0 - 1e-6));
    for (let i = 0; i < n; i++) {
      const z1 = zIn - (zIn - zS0) * i / n, z0 = zIn - (zIn - zS0) * (i + 1) / n;
      prev = Math.min(surf(z0), prev + ENTRY_CLIMB_M);
      obb(xc, (z0 + z1) / 2, slipW / 2, (z1 - z0) / 2, 0, foot, prev);
    }
  }
  // the parapets: the first leg's, the arm's, the head's arc in three chords
  obb(-W / 2 + pt / 2, (0.6 + L1 + m) / 2, pt / 2, (L1 + m - 0.6) / 2, 0, D, D + parapetH);
  { const p = at2((L2 - headStart - m) / 2, -W / 2 + pt / 2); obb(p[0], p[1], pt / 2, (L2 - headStart + m) / 2, t, D, D + parapetH); }
  for (let k = 0; k < 3; k++) {
    const a0 = aStart + (aEnd - aStart) * k / 3, a1 = aStart + (aEnd - aStart) * (k + 1) / 3, am = (a0 + a1) / 2, r = Rh - 0.15 - pt / 2;
    const chord = 2 * r * Math.sin((a1 - a0) / 2);
    obb(H[0] + Math.sin(am) * r, H[1] + Math.cos(am) * r, pt / 2, chord / 2, am + Math.PI / 2, D + 0.06, D + 0.06 + parapetH);
  }
  parts.push({ kind: 'circle', cx: b * H[0], cz: H[1], r: 1.55, y0: D + 0.06, y1: D + 0.06 + Math.max(6, Number(ctx.params.height)) });
  return { parts: smoothRender(sink.finish(), LIMEWASH_UV), movement: parts, tints: { plaster: WHITEWASH, stone: [0.92, 0.9, 0.88] } };
};
