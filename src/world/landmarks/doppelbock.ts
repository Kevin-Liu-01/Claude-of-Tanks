// src/world/landmarks/doppelbock.ts — the Ruhr colliery's double-strut headframe over its shaft hall (the buildings lane,
// 2026-10-11, round 4: a landmark per map, Cinder Junction). Zollverein Shaft XII (Schupp and Kremmer, 1932) as the type:
// the steel headframe in the colliery's red, its two upright legs over the shaft and its two raking struts back to their
// footings behind the hall, the cross ties between them, the sheave deck on top with its railing and the two great
// sheaves side by side, the hoisting ropes running back down to the winding house; under it the shaft hall, a cubic
// block of the same red steel frame filled with dark brick and steel-framed glazing; the winding house a lower block
// behind the struts. The piece's front (+z) is the hall's face toward the yard; the struts rake back toward -z.
//
// Every member meets another (kitConnectivity): the legs stand on the hall's roof plate over their columns, the struts
// on their footings, each tie from leg to leg or strut to leg, the sheaves on their bearers, the ropes from the sheaves'
// rims to the winding house's roof.
import { PartSink, rgb, shade, type EmitOptions, type Vec3 } from '../maps/regional/geometry.ts';
import { bar } from './kit.ts';
import { doppelbockReach } from './plan.ts';
import type { LandmarkBuilder } from './types.ts';

const RED = rgb(0x8a2a1f), RED_DARK = rgb(0x6a1f17), BRICK = rgb(0x4a2a22), GLAZING = rgb(0x2a3034), IRON = rgb(0x2a2a2a);
const uvOffset = (rng: () => number): [number, number] => [rng() * 7.31, rng() * 5.17];

/** A sheave in the yz plane at c (its axle along x): the rim in lengths, the spokes, the hub. */
function sheave(sink: PartSink, c: Vec3, r: number, opts: EmitOptions): void {
  const seg = 18, rim: Vec3[] = [];
  for (let k = 0; k < seg; k++) { const a = (k / seg) * Math.PI * 2; rim.push([c[0], c[1] + Math.sin(a) * r, c[2] + Math.cos(a) * r]); }
  for (let k = 0; k < seg; k++) bar(sink, 'structureMetal', rim[k], rim[(k + 1) % seg], 0.22, opts);
  for (let k = 0; k < 6; k++) bar(sink, 'structureMetal', c, rim[k * 3], 0.12, opts);
  sink.cylinder('structureMetal', [c[0] - 0.45, c[1], c[2]], 'x', 0.9, 0.35, 10, opts);
}

export const doppelbock: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const H = Math.max(30, Number(ctx.params.height)), hw = Math.max(9, Number(ctx.params.hallWidth)) / 2, hd = Math.max(10, Number(ctx.params.hallDepth)) / 2;
  // (the works drawn about the middle of their reach, so the piece's footprint is centred on it)
  const reach = doppelbockReach(H, 2 * hd), shift = -(reach.front + reach.back) / 2;
  sink.placed(0, 0, 0, shift, () => works(sink, ctx, H, hw, hd));
  return { parts: sink.finish() };
};

function works(sink: PartSink, ctx: Parameters<LandmarkBuilder>[0], H: number, hw: number, hd: number): void {
  const hallH = Math.min(16, H * 0.3), base = -0.6 - ctx.groundFall;
  const red: EmitOptions = { colour: RED }, redDark: EmitOptions = { colour: RED_DARK };
  // ---- the shaft hall: the red frame (columns and beams), the brick panels between them, the glazing bands, the roof
  sink.span('stone', -hw - 0.3, base, -hd - 0.3, hw + 0.3, 0.45, hd + 0.3);
  const bays = Math.max(3, Math.round((2 * hw) / 4.5)), bayW = (2 * hw) / bays, dBays = Math.max(3, Math.round((2 * hd) / 4.5)), bayD = (2 * hd) / dBays;
  // the body: brick infill as one block, the frame proud of it
  sink.span('stone', -hw, 0.45, -hd, hw, hallH, hd, { colour: BRICK });
  const col = 0.42;
  for (let i = 0; i <= bays; i++) for (const z of [-hd, hd]) {
    const x = -hw + i * bayW;
    sink.span('structureMetal', x - col / 2, 0.45, z - col / 2, x + col / 2, hallH + 0.3, z + col / 2, red);
  }
  for (let j = 1; j < dBays; j++) for (const x of [-hw, hw]) {
    const z = -hd + j * bayD;
    sink.span('structureMetal', x - col / 2, 0.45, z - col / 2, x + col / 2, hallH + 0.3, z + col / 2, red);
  }
  // the floor beams round the block at three levels, and the glazing bands between them on every face
  const levels = [0.45 + hallH * 0.36, 0.45 + hallH * 0.7, hallH];
  for (const y of levels) {
    sink.span('structureMetal', -hw - 0.22, y - 0.18, hd, hw + 0.22, y + 0.18, hd + 0.22, red);
    sink.span('structureMetal', -hw - 0.22, y - 0.18, -hd - 0.22, hw + 0.22, y + 0.18, -hd, red);
    sink.span('structureMetal', hw, y - 0.18, -hd, hw + 0.22, y + 0.18, hd, red);
    sink.span('structureMetal', -hw - 0.22, y - 0.18, -hd, -hw, y + 0.18, hd, red);
  }
  const glaze: EmitOptions = { colour: GLAZING, decor: true };
  for (const [y0, y1] of [[levels[0] + 0.5, levels[1] - 0.5], [levels[1] + 0.5, levels[2] - 0.5]]) {
    for (let i = 0; i < bays; i++) {
      const x0 = -hw + i * bayW + 0.45, x1 = x0 + bayW - 0.9;
      sink.span('structureMetal', x0, y0, hd, x1, y1, hd + 0.03, glaze);
      sink.span('structureMetal', x0, y0, -hd - 0.03, x1, y1, -hd, glaze);
    }
    for (let j = 0; j < dBays; j++) {
      const z0 = -hd + j * bayD + 0.45, z1 = z0 + bayD - 0.9;
      sink.span('structureMetal', hw, y0, z0, hw + 0.03, y1, z1, glaze);
      sink.span('structureMetal', -hw - 0.03, y0, z0, -hw, y1, z1, glaze);
    }
  }
  // the roof plate and its coping
  sink.span('structureMetal', -hw - 0.3, hallH + 0.3, -hd - 0.3, hw + 0.3, hallH + 0.6, hd + 0.3, redDark);
  // the yard doors on the front: the big steel door in its frame
  sink.span('structureMetal', -2.4, 0.45, hd, 2.4, 5.2, hd + 0.06, { colour: shade(RED_DARK, 0.8), decor: true });
  // ---- the headframe: the legs over the shaft (from the roof plate), the struts back to their footings behind the hall
  const top = H, deck = top - 2.6, lx = 3.6, lz = hd * 0.35, roof = hallH + 0.6;
  const footZ = -hd - Math.max(8, (deck - 0.4) * 0.42), footX = 4.6;
  for (const sx of [-1, 1]) {
    // the leg: a box column from the roof plate over a hall column to the deck
    bar(sink, 'structureMetal', [sx * lx, roof - 0.1, lz], [sx * lx, deck + 0.1, lz], 1.0, red);
    // the strut: from its footing behind the hall up to the deck's back edge
    const fy = 0.45;
    sink.span('stone', sx * footX - 1.4, base, footZ - 1.4, sx * footX + 1.4, fy, footZ + 1.4);
    bar(sink, 'structureMetal', [sx * footX, fy - 0.05, footZ], [sx * lx * 0.95, deck + 0.1, lz - 3.2], 1.1, red);
  }
  // the ties: between the legs every 7 m, between the struts, and from each strut to its leg
  const tie = { ...redDark, decor: false } as EmitOptions;
  for (let y = roof + 6; y < deck - 2; y += 7) bar(sink, 'structureMetal', [-lx, y, lz], [lx, y, lz], 0.45, tie);
  for (let f = 0.25; f < 0.95; f += 0.24) {
    const y = 0.45 + (deck - 0.45) * f, z = footZ + (lz - 3.2 - footZ) * f, x = footX + (lx * 0.95 - footX) * f;
    bar(sink, 'structureMetal', [-x, y, z], [x, y, z], 0.4, tie);
    // the brace from the strut to its leg at this height, where the leg stands (above the hall's roof)
    if (y > roof + 1.5) for (const sx of [-1, 1]) bar(sink, 'structureMetal', [sx * x, y, z], [sx * lx, y, lz], 0.32, tie);
  }
  // ---- the sheave deck, its railing, the sheaves side by side and their bearers, the ropes down to the winding house
  sink.span('structureMetal', -lx - 1.2, deck, lz - 4.6, lx + 1.2, deck + 0.5, lz + 1.4, red);
  const rail: EmitOptions = { colour: IRON, decor: true };
  for (const [ax, az, bx, bz] of [[-lx - 1.2, lz + 1.4, lx + 1.2, lz + 1.4], [lx + 1.2, lz + 1.4, lx + 1.2, lz - 4.6], [lx + 1.2, lz - 4.6, -lx - 1.2, lz - 4.6], [-lx - 1.2, lz - 4.6, -lx - 1.2, lz + 1.4]] as const) {
    bar(sink, 'structureMetal', [ax, deck + 1.5, az], [bx, deck + 1.5, bz], 0.08, rail);
    const n = Math.max(2, Math.round(Math.hypot(bx - ax, bz - az) / 1.6));
    for (let k = 0; k <= n; k++) bar(sink, 'structureMetal', [ax + (bx - ax) * k / n, deck + 0.48, az + (bz - az) * k / n], [ax + (bx - ax) * k / n, deck + 1.52, az + (bz - az) * k / n], 0.07, rail);
  }
  const R = Math.min(3.6, H * 0.065), hub = deck + 0.5 + R + 0.6;
  for (const sx of [-1, 1]) {
    const c: Vec3 = [sx * 1.9, hub, lz - 1.6];
    for (const dz of [-1.3, 1.3]) bar(sink, 'structureMetal', [sx * 1.9, deck + 0.45, lz - 1.6 + dz], [sx * 1.9, hub, lz - 1.6], 0.42, redDark);
    sheave(sink, c, R, { colour: IRON, decor: true });
  }
  // the winding house behind the struts: a lower brick block with its red frame lines and its roof; the ropes
  const wz1 = footZ - 2.5, wz0 = wz1 - 12, wh = 11;
  sink.span('stone', -7.5, base, wz0 - 0.3, 7.5, 0.45, wz1 + 0.3);
  sink.span('stone', -7.2, 0.45, wz0, 7.2, wh, wz1, { colour: BRICK });
  for (const x of [-7.2, -2.4, 2.4, 7.2]) sink.span('structureMetal', x - 0.2, 0.45, wz1, x + 0.2, wh + 0.2, wz1 + 0.2, red);
  sink.span('structureMetal', -7.5, wh, wz0 - 0.3, 7.5, wh + 0.4, wz1 + 0.3, redDark);
  for (const sx of [-1, 1]) {
    bar(sink, 'structureMetal', [sx * 1.9, hub + R - 0.05, lz - 1.6], [sx * 1.9, wh + 0.42, wz1 - 1.0], 0.07, { colour: IRON, decor: true });
  }
}
