// src/world/landmarks/carpathian.ts — the Carpathian wooden church (the buildings lane, 2026-10-11, round 4: a landmark
// per map, Frosthollow). The Boyko tserkva of the northern Carpathians (Matkiv, Turzansk, Kwiaton among the UNESCO
// tserkvas) as the type: three log frames in a row on the east–west axis — the narthex (babynets) to the west, the
// nave (nava), the largest and the tallest, and the sanctuary (vivtar) to the east — each crowned by its own tiered
// roof of stacked pyramids, short drums between the tiers, a small onion cupola and a cross on the top; round all
// three at the height of a man's reach the skirt roof (opasannia) on its brackets; the logs' courses below it, the
// shingles on everything above; a low footing of field stones; the door in the narthex's west wall under the skirt.
//
// The piece's front (+z) is the west front with the door; the sanctuary lies toward -z. Every member meets another
// (kitConnectivity): the courses and the shingle lines are dressing on their walls and planes, the brackets meet the
// wall and the skirt, the cupolas stand on their tiers.
import { PartSink, rgb, shade, type EmitOptions, type Rgb, type Vec3 } from '../maps/regional/geometry.ts';
import { cross, dome, revolve } from './kit.ts';
import { pentRing } from './stave.ts';
import type { LandmarkBuilder } from './types.ts';

const LOG = rgb(0x4d3e30), LOG_LIGHT = rgb(0x5e4c3b), SHINGLE = rgb(0x5a5046), SHINGLE_DARK = rgb(0x4a4139), TIN = rgb(0x8e9294), IRON = rgb(0x262626);
const uvOffset = (rng: () => number): [number, number] => [rng() * 7.31, rng() * 5.17];
const SQ = Math.SQRT2;

/**
 * A tiered crown over a square frame of half-side `s` whose walls stand to `y` at (0, cz): `tiers` frustums of
 * shingle, each narrowing to a short drum the next sits on, the last a pyramid to a little drum, an onion cupola of
 * shingle or tin and the cross; the shingle courses round each frustum (fine). Returns the cross's foot.
 */
function crown(sink: PartSink, cz: number, s: number, y: number, tiers: number, cupola: Rgb): number {
  let half = s, top = y;
  const fine: EmitOptions = { colour: SHINGLE_DARK, decor: true, fine: true };
  for (let t = 0; t < tiers; t++) {
    const last = t === tiers - 1;
    const eave = half + (t === 0 ? 0.35 : 0.22), next = last ? half * 0.3 : half * 0.58, rise = last ? half * 1.5 : half * 0.75;
    // the frustum (a square ring in four planes: revolve's four-sided ring, turned to the axes)
    revolve(sink, 'structureWood', 0, cz, [[half * SQ, top - 0.05], [eave * SQ, top - 0.05], [next * SQ, top + rise]], 4, { colour: SHINGLE }, Math.PI / 4);
    // its courses: thin rings every 0.36 m up the slope
    for (let f = 0.18; f < 0.95; f += 0.36 / Math.hypot(rise, eave - next)) {
      const r = eave + (next - eave) * f, yy = top - 0.05 + rise * f;
      revolve(sink, 'structureWood', 0, cz, [[r * SQ + 0.015, yy - 0.025], [r * SQ + 0.015, yy + 0.025]], 4, fine, Math.PI / 4);
    }
    top += rise;
    if (last) break;
    // the drum the next tier stands on: a short square shaft of shingle
    const drumH = 0.75 + 0.15 * (tiers - t);
    sink.span('structureWood', -next, top - 0.1, cz - next, next, top + drumH, cz + next, { colour: SHINGLE_DARK });
    top += drumH;
    half = next;
  }
  // the little drum, the onion and the cross
  const dr = Math.max(0.28, half * 0.32);
  revolve(sink, 'structureWood', 0, cz, [[dr, top - 0.08], [dr, top + 0.5]], 8, { colour: SHINGLE_DARK });
  const domeTop = dome(sink, 'structureMetal', 0, top + 0.5, cz, dr * 1.25, 'onion', 10, { colour: cupola });
  return domeTop;
}

export const woodenTserkva: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const look = ctx.variant;
  const L = Math.max(14, Number(ctx.params.length)), W = Math.max(7, Number(ctx.params.width));
  const k = Math.min(L / 18, W / 9.4);
  const base = -0.6 - ctx.groundFall, sill = 0.4;
  // the three frames: the nave square and the largest; the narthex and the sanctuary a metre narrower each side
  const ns = 3.4 * k, ss = 2.5 * k, gap = 0.02;
  const n0 = -ns, n1 = ns;                              // the nave, centred on the origin
  const w0 = n1 - gap, w1 = w0 + 2 * ss;                 // the narthex to the west (+z)
  const e1 = n0 + gap, e0 = e1 - 2 * ss;                 // the sanctuary to the east (-z)
  const skirtY = sill + 2.3, wallTop = sill + 4.6 * k + 0.4;
  const frames: Array<[number, number, number, number]> = [[ss, e0, e1, wallTop - 0.4], [ns, n0, n1, wallTop + 0.5], [ss, w0, w1, wallTop - 0.4]];
  // ---- the footing
  sink.span('stone', -ns - 0.15, base, n0 - 0.15, ns + 0.15, sill, n1 + 0.15);
  sink.span('stone', -ss - 0.15, base, e0 - 0.15, ss + 0.15, sill, e1 + 0.15);
  sink.span('stone', -ss - 0.15, base, w0 - 0.15, ss + 0.15, sill, w1 + 0.15);
  // ---- the frames: the log walls, the courses below the skirt, the shingles above it
  for (const [h, z0, z1, top] of frames) {
    sink.span('structureWood', -h, sill, z0, h, top, z1, { colour: LOG });
    const course = { colour: LOG_LIGHT, decor: true, fine: true } as const;
    for (let y = sill + 0.3; y < skirtY - 0.15; y += 0.3) {
      sink.span('structureWood', -h - 0.02, y - 0.03, z0, -h, y + 0.03, z1, course);
      sink.span('structureWood', h, y - 0.03, z0, h + 0.02, y + 0.03, z1, course);
    }
    // the shingle cladding above the skirt: a skin 2 cm proud, its courses
    sink.span('structureWood', -h - 0.02, skirtY, z0 - 0.02, h + 0.02, top, z1 + 0.02, { colour: SHINGLE, decor: true });
    for (let y = skirtY + 0.32; y < top - 0.1; y += 0.32) {
      sink.span('structureWood', -h - 0.035, y - 0.02, z0 - 0.035, h + 0.035, y + 0.02, z1 + 0.035, { colour: SHINGLE_DARK, decor: true, fine: true });
    }
  }
  // the end walls' courses (the west front round the door, the east end)
  for (const [z, sgn] of [[w1, 1], [e0, -1]] as const) {
    for (let y = sill + 0.3; y < skirtY - 0.15; y += 0.3) {
      if (sgn > 0 && y < sill + 2.1) {
        sink.span('structureWood', -ss, y - 0.03, z, -0.62, y + 0.03, z + 0.02, { colour: LOG_LIGHT, decor: true, fine: true });
        sink.span('structureWood', 0.62, y - 0.03, z, ss, y + 0.03, z + 0.02, { colour: LOG_LIGHT, decor: true, fine: true });
      } else sink.span('structureWood', -ss, y - 0.03, sgn > 0 ? z : z - 0.02, ss, y + 0.03, sgn > 0 ? z + 0.02 : z, { colour: LOG_LIGHT, decor: true, fine: true });
    }
  }
  // the door: the plank leaf in its frame, the step, the iron ring
  sink.span('structureWood', -0.55, sill, w1, 0.55, sill + 1.95, w1 + 0.05, { colour: shade(LOG, 0.7), decor: true });
  for (const sx of [-1, 1]) sink.span('structureWood', sx * 0.55 - (sx > 0 ? 0 : 0.12), sill, w1, sx * 0.55 + (sx > 0 ? 0.12 : 0), sill + 2.08, w1 + 0.1, { colour: LOG_LIGHT, decor: true });
  sink.span('structureWood', -0.67, sill + 1.95, w1, 0.67, sill + 2.08, w1 + 0.1, { colour: LOG_LIGHT, decor: true });
  sink.span('stone', -0.8, base, w1, 0.8, sill - 0.05, w1 + 0.45, { decor: true });
  sink.span('structureMetal', -0.04, sill + 0.95, w1 + 0.05, 0.04, sill + 1.1, w1 + 0.08, { colour: IRON, decor: true });
  // ---- the skirt round all three frames on its brackets
  const run = 1.05 * k, drop = 0.55;
  pentRing(sink, -ss, ss, w0, w1, skirtY + 0.15, run, run, skirtY + 0.15 - drop, 0.1, SHINGLE, { px: true, nx: true, pz: true });
  pentRing(sink, -ns, ns, n0, n1, skirtY + 0.15, run, run, skirtY + 0.15 - drop, 0.1, SHINGLE, { px: true, nx: true });
  pentRing(sink, -ss, ss, e0, e1, skirtY + 0.15, run, run, skirtY + 0.15 - drop, 0.1, SHINGLE, { px: true, nx: true, nz: true });
  // the nave's skirt where it stands proud of the narrow frames: its west and east ledges, square
  for (const [z, sgn] of [[n1, 1], [n0, -1]] as const) {
    for (const sx of [-1, 1]) {
      const xa = sx * ss, xb = sx * (ns + run);
      sink.span('structureWood', Math.min(xa, xb), skirtY + 0.15 - drop, sgn > 0 ? z - 0.02 : z - run * 0.6, Math.max(xa, xb), skirtY + 0.12, sgn > 0 ? z + run * 0.6 : z + 0.02,
        { colour: SHINGLE });
    }
  }
  // the brackets under the skirt: a corbel out of the wall every 1.3 m along the long sides
  for (const [h, z0, z1] of frames) {
    for (let z = z0 + 0.5; z < z1 - 0.3; z += 1.3) {
      for (const sx of [-1, 1]) {
        sink.span('structureWood', sx > 0 ? h : -h - run * 0.8, skirtY - 0.22, z - 0.07, sx > 0 ? h + run * 0.8 : -h, skirtY - 0.06, z + 0.07, { colour: LOG_LIGHT, decor: true });
      }
    }
  }
  // ---- the crowns: the nave's three tiers, the side frames' two
  const cupola = look() < 0.5 ? TIN : SHINGLE_DARK;
  for (const [i, [h, z0, z1, top]] of frames.entries()) {
    const cz = (z0 + z1) / 2, tiers = i === 1 ? 3 : 2;
    // the walls' head: a frame plate under the first tier
    sink.span('structureWood', -h - 0.05, top - 0.12, z0 - 0.05, h + 0.05, top, z1 + 0.05, { colour: LOG_LIGHT });
    const foot = crown(sink, cz, h, top, tiers, cupola);
    cross(sink, 'structureMetal', 0, foot - 0.04, cz, i === 1 ? 1.5 : 1.15, 'orthodox', IRON, Math.PI / 2);
  }
  return { parts: sink.finish() };
};
