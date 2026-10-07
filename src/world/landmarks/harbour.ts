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
import { PartSink, rgb, type Rgb, type Vec3 } from '../maps/regional/geometry.ts';
import type { SimpleCollisionShape } from '../collision.ts';
import { bar, extrude, revolve, ringY, smoothRender, LIMEWASH_UV } from './kit.ts';
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

const TIMBER_DARK = rgb(0x3e3228), WEED: Rgb = [0.55, 0.6, 0.5];

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
