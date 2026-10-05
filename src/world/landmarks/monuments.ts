// src/world/landmarks/monuments.ts — monuments (the landmarks lane, 2026-10-05): the obelisk with its star, cross or
// ball, the column carrying a figure, the memorial wall, the standing figure and the equestrian statue on their
// plinths. The sculpture is stylised but proportioned from life (a figure ~7.5 heads tall, a horse's barrel about its
// height at the withers); the architecture — the steps, the dies, the cornices, the railings — carries the read.
import { PartSink, facePoint, rgb, shade, type Face, type Rgb } from '../maps/regional/geometry.ts';
import { railing, revolve, smoothRender, star, steppedBase, cross, moulding } from './kit.ts';
import type { Vec3 } from '../maps/regional/geometry.ts';
import type { LandmarkBuilder } from './types.ts';

const STAR_RED = rgb(0xb3221c), IRON = rgb(0x26282a), GILT = rgb(0xb8933e);
const BRONZE = rgb(0x4f5a45), BRONZE_DARK = rgb(0x3a4134), SILVER = rgb(0xb9bcba), PLAQUE = rgb(0x2a2c2b);

const uvOffset = (rng: () => number): [number, number] => [rng() * 7.31, rng() * 5.17];

/**
 * The obelisk (the 1920s-30s memorials to the Civil War's fallen in every Soviet village, a city's victory column in
 * stone): three steps, a die with a dark plaque under a cornice, a tapering four-sided shaft and its pyramidion, and a
 * finial — a red sheet-iron star on a short mast, an Orthodox or Latin cross, a gilt ball — inside a low iron railing.
 */
export const obelisk: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const H = Math.max(4, Number(ctx.params.height));
  const finial = String(ctx.params.finial);
  // the masonry: render over brick in a village (plaster), dressed stone in a town (the map's stone)
  const body = ctx.brick ? 'plaster' : 'stone';
  const steps = steppedBase(sink, 'stone', 1.5 + H * 0.12, 1.5 + H * 0.12, 3, 0.2, 0.32, 0.6 + ctx.groundFall);
  const dieW = 1.0 + H * 0.08, dieH = 1.1 + H * 0.06;
  sink.span(body, -dieW / 2, steps, -dieW / 2, dieW / 2, steps + dieH, dieW / 2);
  moulding(sink, body, dieW, dieW, steps + dieH, 0.16, 0.1);
  moulding(sink, body, dieW, dieW, steps, 0.12, 0.06);
  // the plaque on the front and back faces
  for (const side of [1, -1]) {
    const face: Face = { origin: [0, 0, side * dieW / 2], u: [side, 0, 0], out: [0, 0, side], width: dieW };
    const pw = dieW * 0.62, ph = dieH * 0.5, py = steps + dieH * 0.5;
    sink.quad('structureMetal', facePoint(face, -pw / 2, py - ph / 2, 0.012), facePoint(face, pw / 2, py - ph / 2, 0.012),
      facePoint(face, pw / 2, py + ph / 2, 0.012), facePoint(face, -pw / 2, py + ph / 2, 0.012), { colour: PLAQUE, decor: true });
  }
  // the shaft: four sides tapering by a sixth, then the pyramidion
  const shaftY = steps + dieH + 0.16, shaftH = H - shaftY - 0.9, b0 = dieW * 0.7, b1 = b0 * 0.66;
  revolve(sink, body, 0, 0, [[b0 * Math.SQRT1_2, shaftY], [b1 * Math.SQRT1_2, shaftY + shaftH], [0, shaftY + shaftH + b1 * 1.1]], 4, {}, Math.PI / 4);
  const top = shaftY + shaftH + b1 * 1.1;
  if (finial === 'star') {
    sink.span('structureMetal', -0.03, top - 0.05, -0.03, 0.03, top + 0.35, 0.03, { colour: IRON, decor: true });
    star(sink, 'structureMetal', 0, top + 0.35 + 0.42, 0, 0.42, 0.08, { colour: STAR_RED, decor: true });
  } else if (finial === 'cross' || finial === 'latin') {
    cross(sink, 'structureMetal', 0, top - 0.05, 0, 1.0, finial === 'cross' ? 'orthodox' : 'latin', GILT);
  } else if (finial === 'ball') {
    revolve(sink, 'structureMetal', 0, 0, [[0.06, top - 0.04], [0.16, top + 0.06], [0.2, top + 0.2], [0.16, top + 0.34], [0, top + 0.4]], 10, { colour: GILT, decor: true });
  }
  if (ctx.params.railing) {
    const r = 1.5 + H * 0.12 + 1.1;
    const corners: Array<[number, number]> = [[-r, -r], [r, -r], [r, r], [-r, r]];
    for (let i = 0; i < 4; i++) {
      const a = corners[i], b = corners[(i + 1) % 4];
      // the gate: the front run leaves a gap at its middle
      if (i === 2) {
        railing(sink, a, [0.6, r], 0.85, IRON);
        railing(sink, [-0.6, r], b, 0.85, IRON);
      } else railing(sink, a, b, 0.85, IRON);
    }
  }
  return { parts: smoothRender(sink.finish(), 0.25) };
};

/** A stylised standing figure (feet at y, facing +z): a greatcoat or a robe, the head 1/7.5 of its height. */
function figure(sink: PartSink, y: number, h: number, metal: Rgb, dark: Rgb, pose: string): void {
  const head = h / 7.5;
  const col = { colour: metal }, colD = { colour: dark };
  // the coat or robe: a skirt flaring to the ankles, the torso, the shoulders
  const hem = pose === 'robe' ? h * 0.02 : h * 0.16;
  revolve(sink, 'structureMetal', 0, 0, [[h * 0.13, y + hem], [h * 0.11, y + h * 0.45], [h * 0.095, y + h * 0.62], [h * 0.12, y + h * 0.78],
    [h * 0.07, y + h * 0.82], [0, y + h * 0.83]], 10, col);
  if (pose !== 'robe') {
    // the legs and the boots below the coat's hem, the left foot a half step forward
    for (const side of [-1, 1]) {
      const fz = side < 0 ? h * 0.05 : -h * 0.02;
      revolve(sink, 'structureMetal', side * h * 0.05, fz, [[h * 0.035, y], [h * 0.04, y + h * 0.04], [h * 0.042, y + hem + 0.02]], 6, colD);
      sink.span('structureMetal', side * h * 0.05 - h * 0.03, y, fz - h * 0.02, side * h * 0.05 + h * 0.03, y + h * 0.035, fz + h * 0.07, colD);
    }
  }
  // the arms: the right hanging with a cap or a wreath in the hand, the left raised forward (the orator's gesture)
  const shoulderY = y + h * 0.78;
  sink.member('structureMetal', [h * 0.13, shoulderY, 0], [h * 0.15, y + h * 0.5, h * 0.03], h * 0.06, h * 0.06, [0, 0, 1], { ...col, exposed: true }, h * 0.03);
  sink.member('structureMetal', [-h * 0.13, shoulderY, 0], [-h * 0.2, y + h * 0.86, h * 0.22], h * 0.06, h * 0.06, [1, 0, 0], { ...col, exposed: true }, h * 0.03);
  // the neck and the head, a cap's peak
  revolve(sink, 'structureMetal', 0, 0, [[head * 0.24, y + h * 0.82], [head * 0.26, y + h - head * 0.98], [head * 0.42, y + h - head * 0.8],
    [head * 0.46, y + h - head * 0.45], [head * 0.4, y + h - head * 0.15], [0, y + h]], 9, col);
  if (pose === 'greatcoat') revolve(sink, 'structureMetal', 0, head * 0.05, [[head * 0.5, y + h - head * 0.32], [head * 0.52, y + h - head * 0.22], [0, y + h - head * 0.1]], 10, colD);
}

/**
 * A statue on its plinth: a standing figure in bronze (verdigris), stone or the silver-painted cast concrete of the
 * Soviet villages' monuments, on a dressed pedestal with a cornice over two steps.
 */
export const statue: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const h = Math.max(1.6, Number(ctx.params.height)), plinth = Math.max(1, Number(ctx.params.plinth));
  const metal = String(ctx.params.metal);
  const [c, d] = metal === 'silver' ? [SILVER, shade(SILVER, 0.82)] : metal === 'stone' ? [rgb(0xc9c2b2), rgb(0xa79f8f)] : [BRONZE, BRONZE_DARK];
  const pw = 1.1 + plinth * 0.32;
  const steps = steppedBase(sink, 'stone', pw + 0.6, pw + 0.6, 2, 0.22, 0.34, 0.6 + ctx.groundFall);
  sink.span('stone', -pw / 2, steps, -pw / 2, pw / 2, steps + plinth, pw / 2);
  moulding(sink, 'stone', pw, pw, steps + plinth - 0.05, 0.22, 0.12);
  moulding(sink, 'stone', pw, pw, steps, 0.16, 0.08);
  const face: Face = { origin: [0, 0, pw / 2], u: [1, 0, 0], out: [0, 0, 1], width: pw };
  sink.quad('structureMetal', facePoint(face, -pw * 0.3, steps + plinth * 0.35, 0.012), facePoint(face, pw * 0.3, steps + plinth * 0.35, 0.012),
    facePoint(face, pw * 0.3, steps + plinth * 0.7, 0.012), facePoint(face, -pw * 0.3, steps + plinth * 0.7, 0.012), { colour: PLAQUE, decor: true });
  figure(sink, steps + plinth + 0.17, h, c, d, String(ctx.params.pose));
  return { parts: sink.finish() };
};

/**
 * The column monument (a victory column, a Marian or plague column on a Catholic town's square): a stepped base, a
 * pedestal with its panels, a shaft with its entasis on a moulded base, a capital and abacus, and a figure on top.
 */
export const columnMonument: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const H = Math.max(8, Number(ctx.params.height));
  const steps = steppedBase(sink, 'stone', 3.4 + H * 0.1, 3.4 + H * 0.1, 3, 0.24, 0.4, 0.6 + ctx.groundFall);
  const pw = 2.0 + H * 0.06, ph = 2.2 + H * 0.05;
  sink.span('stone', -pw / 2, steps, -pw / 2, pw / 2, steps + ph, pw / 2);
  moulding(sink, 'stone', pw, pw, steps, 0.2, 0.12);
  moulding(sink, 'stone', pw, pw, steps + ph - 0.24, 0.24, 0.16);
  for (const [ox, oz, ux, uz] of [[0, 1, 1, 0], [1, 0, 0, -1], [0, -1, -1, 0], [-1, 0, 0, 1]] as const) {
    const face: Face = { origin: [ox * pw / 2, 0, oz * pw / 2], u: [ux, 0, uz], out: [ox, 0, oz], width: pw };
    sink.quad('structureMetal', facePoint(face, -pw * 0.32, steps + ph * 0.25, 0.012), facePoint(face, pw * 0.32, steps + ph * 0.25, 0.012),
      facePoint(face, pw * 0.32, steps + ph * 0.75, 0.012), facePoint(face, -pw * 0.32, steps + ph * 0.75, 0.012), { colour: BRONZE_DARK, decor: true });
  }
  const y0 = steps + ph, r = 0.35 + H * 0.025, figureH = Math.max(2.2, H * 0.14), shaftH = H - y0 - figureH - 0.8;
  revolve(sink, 'stone', 0, 0, [[r * 1.45, y0], [r * 1.45, y0 + 0.22], [r * 1.2, y0 + 0.34], [r * 1.05, y0 + 0.46], [r, y0 + 0.6],
    [r * 0.97, y0 + shaftH * 0.35], [r * 0.84, y0 + shaftH - 0.1], [r * 0.98, y0 + shaftH + 0.1], [r * 1.25, y0 + shaftH + 0.45]], 14);
  const capY = y0 + shaftH + 0.45;
  sink.span('stone', -r * 1.4, capY, -r * 1.4, r * 1.4, capY + 0.32, r * 1.4);
  revolve(sink, 'structureMetal', 0, 0, [[r * 0.7, capY + 0.32], [r * 0.6, capY + 0.62], [r * 0.5, capY + 0.66]], 10, { colour: GILT });
  figure(sink, capY + 0.66, figureH, GILT, shade(GILT, 0.75), 'robe');
  return { parts: sink.finish() };
};

/**
 * The memorial wall (the Great Patriotic War memorials of every Soviet town, a regiment's memorial elsewhere): a long
 * low granite wall of name plaques on its terrace, a taller pylon at its middle carrying the star (or a cross), steps
 * down to the forecourt and the eternal flame in its star-shaped bowl before it.
 */
export const memorialWall: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const L = Math.max(8, Number(ctx.params.length)), H = Math.max(2, Number(ctx.params.height));
  const base = -0.6 - ctx.groundFall, terrace = 0.45, wallZ = -1.6, t = 0.6;
  // the terrace and its steps down to the forecourt
  sink.span('stone', -L / 2 - 1.2, base, -3.2, L / 2 + 1.2, terrace, 1.2);
  for (let k = 0; k < 3; k++) sink.span('stone', -L / 4, base, 1.2 + k * 0.4, L / 4, terrace - (k + 1) * 0.15, 1.6 + k * 0.4);
  // the wall in two wings either side of the pylon, the plaques on its face
  const pw = Math.max(2.2, L * 0.16), ph = H * 2.1;
  for (const sx of [-1, 1]) {
    const x0 = sx * pw / 2, x1 = sx * L / 2;
    sink.span('stone', Math.min(x0, x1), terrace, wallZ - t / 2, Math.max(x0, x1), terrace + H, wallZ + t / 2);
    sink.band('stone', Math.min(x0, x1) - 0.05, terrace + H, wallZ - t / 2 - 0.08, Math.max(x0, x1) + 0.05, terrace + H + 0.18, wallZ + t / 2 + 0.08);
    const n = Math.max(2, Math.round((L / 2 - pw / 2) / 1.6));
    for (let k = 0; k < n; k++) {
      const cx = sx * (pw / 2 + (L / 2 - pw / 2) * (k + 0.5) / n), w = (L / 2 - pw / 2) / n * 0.8;
      sink.quad('structureMetal', [cx - w / 2, terrace + 0.4, wallZ + t / 2 + 0.012], [cx + w / 2, terrace + 0.4, wallZ + t / 2 + 0.012],
        [cx + w / 2, terrace + H - 0.35, wallZ + t / 2 + 0.012], [cx - w / 2, terrace + H - 0.35, wallZ + t / 2 + 0.012], { colour: rgb(0x2b2c2e), decor: true });
      for (let row = 0; row < 5; row++) {
        const y = terrace + 0.6 + row * (H - 1.1) / 5;
        sink.quad('structureMetal', [cx - w * 0.4, y, wallZ + t / 2 + 0.018], [cx + w * 0.4, y, wallZ + t / 2 + 0.018], [cx + w * 0.4, y + 0.05, wallZ + t / 2 + 0.018],
          [cx - w * 0.4, y + 0.05, wallZ + t / 2 + 0.018], { colour: GILT, decor: true, fine: true });
      }
    }
  }
  // the pylon with its star
  sink.span('stone', -pw / 2, terrace, wallZ - t, pw / 2, terrace + ph, wallZ + t);
  moulding(sink, 'stone', pw, t * 2, terrace + ph - 0.25, 0.25, 0.1);
  star(sink, 'structureMetal', 0, terrace + ph * 0.72, wallZ + t + 0.05, pw * 0.3, 0.08, { colour: GILT, decor: true });
  // the eternal flame: a five-pointed bowl before the steps, the flame in it (it glows at night)
  if (ctx.params.flame !== false) {
    sink.placed(0, 0, 0, 3.6, () => {
      // the bowl lies flat: a star turned face up (its depth along y)
      for (let i = 0; i < 5; i++) {
        const a = i * Math.PI * 2 / 5, b = a + Math.PI / 5, c = a - Math.PI / 5;
        sink.prism('stone', [[0, 0.12, 0], [Math.sin(c) * 0.38, 0.12, Math.cos(c) * 0.38], [Math.sin(a) * 0.95, 0.12, Math.cos(a) * 0.95], [Math.sin(b) * 0.38, 0.12, Math.cos(b) * 0.38]],
          [0, 1, 0], 0.24);
      }
    });
    revolve(sink, 'curtain', 0, 3.6, [[0.22, 0.36], [0.14, 0.7], [0.0, 1.0]], 6, { decor: true, window: [0, 1, 0] });
  }
  return { parts: sink.finish() };
};

/**
 * The equestrian statue (a commander on his horse on a capital's square): a tall dressed plinth, the horse in mid-stride
 * — the barrel, the chest and haunches, the arched neck and head, a foreleg raised, the tail — and the rider upright in
 * the saddle, in bronze gone green.
 */
export const equestrianStatue: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const S = Math.max(1, Number(ctx.params.scale)), plinth = Math.max(2, Number(ctx.params.plinth));
  const base = -0.6 - ctx.groundFall;
  const pw = 1.5 * S + 0.6, pl = 3.0 * S + 0.8;
  sink.span('stone', -pw / 2 - 0.5, base, -pl / 2 - 0.5, pw / 2 + 0.5, 0.35, pl / 2 + 0.5);
  sink.span('stone', -pw / 2, 0.35, -pl / 2, pw / 2, 0.35 + plinth, pl / 2);
  moulding(sink, 'stone', pw, pl, 0.35, 0.2, 0.1);
  moulding(sink, 'stone', pw, pl, 0.35 + plinth - 0.22, 0.22, 0.14);
  const y = 0.35 + plinth, col = { colour: BRONZE }, dark = { colour: BRONZE_DARK };
  const wither = 1.6 * S, belly = y + wither * 0.6, barrelR = wither * 0.22;
  // the barrel along z: haunches at -z, the chest at +z (the horse faces the piece's front)
  const barrel: Array<[number, number]> = [[-1.05, 0.55], [-0.95, 0.85], [-0.6, 1.0], [-0.1, 0.92], [0.4, 0.95], [0.85, 0.9], [1.05, 0.6]];
  for (let i = 0; i + 1 < barrel.length; i++) {
    const [z0, r0] = barrel[i], [z1, r1] = barrel[i + 1];
    sink.cylinder('structureMetal', [0, belly + barrelR * 0.3, z0 * 1.25 * S], 'z', (z1 - z0) * 1.25 * S, r0 * barrelR, 10, col, r1 * barrelR, i === 0 || i === barrel.length - 2);
  }
  // the legs: the near foreleg raised, the others planted
  const leg = (x: number, z: number, raised: boolean) => {
    const top: Vec3 = [x, belly, z], knee: Vec3 = raised ? [x, belly - wither * 0.25, z + 0.35 * S] : [x, belly - wither * 0.32, z + 0.02];
    const hoof: Vec3 = raised ? [x, belly - wither * 0.42, z + 0.2 * S] : [x, y + 0.05, z - 0.05];
    sink.member('structureMetal', top, knee, 0.2 * S, 0.22 * S, [1, 0, 0], { ...col, exposed: true }, 0.11 * S);
    sink.member('structureMetal', knee, hoof, 0.13 * S, 0.14 * S, [1, 0, 0], { ...dark, exposed: true }, 0.07 * S);
  };
  leg(-0.18 * S, 1.0 * S, true); leg(0.18 * S, 1.0 * S, false); leg(-0.2 * S, -1.0 * S, false); leg(0.2 * S, -1.0 * S, false);
  // the neck arched up from the chest, the head bowed, the tail
  sink.member('structureMetal', [0, belly + barrelR * 0.8, 1.15 * S], [0, belly + wither * 0.62, 1.55 * S], 0.3 * S, 0.42 * S, [1, 0, 0], { ...col, exposed: true }, 0.21 * S);
  sink.member('structureMetal', [0, belly + wither * 0.6, 1.5 * S], [0, belly + wither * 0.3, 2.05 * S], 0.24 * S, 0.3 * S, [1, 0, 0], { ...col, exposed: true }, 0.15 * S);
  sink.member('structureMetal', [0, belly + barrelR, -1.3 * S], [0, belly - wither * 0.3, -1.6 * S], 0.12 * S, 0.12 * S, [1, 0, 0], { ...dark, exposed: true }, 0.06 * S);
  // the rider: the torso upright over the saddle, the legs down the horse's flanks, the arm raised
  const seat = belly + barrelR * 1.25;
  figure(sink, seat - 0.85 * S, 1.75 * S, BRONZE, BRONZE_DARK, 'greatcoat');
  for (const sx of [-1, 1]) sink.member('structureMetal', [sx * 0.2 * S, seat, 0.05], [sx * 0.34 * S, seat - 0.75 * S, 0.25 * S], 0.15 * S, 0.15 * S, [0, 0, 1], { ...dark, exposed: true }, 0.075 * S);
  return { parts: sink.finish() };
};
