// src/world/landmarks/shrine.ts — the great shrine of the caldera (the buildings lane, 2026-10-11, round 4: a landmark per
// map, Obsidian Caldera). Aso Shrine below the caldera's rim as the type: the two-storey gate (rōmon) in vermilion at the
// precinct's front, its passage between the posts, the white walls of its side bays, the balcony round its upper storey
// and its great hip-and-gable roof; the worship hall (haiden) on its raised floor behind it under its own irimoya roof;
// the sanctuary (honden) at the back on its stone platform under a flowing (nagare) roof with its crossed finials and
// ridge logs; the stone lanterns along the paved approach; the precinct's vermilion fence on its stone kerb. Built round
// the village's own small shrine and its torii, not in place of them: the map's kit shrine stays the village's.
//
// The piece's front (+z) is the gate; the sanctuary lies toward -z. Every member meets another (kitConnectivity).
import { PartSink, rgb, shade, type EmitOptions } from '../maps/regional/geometry.ts';
import { emitRoof, roofGeometry, type RoofSpec } from '../maps/regional/house.ts';
import { irimoyaGables } from '../maps/regional/kyushu.ts';
import { bar } from './kit.ts';
import type { LandmarkBuilder } from './types.ts';

const VERMILION = rgb(0xc4452c), BLACK = rgb(0x1e1c1b), CYPRESS = rgb(0x4a3a2e), GILT = rgb(0xb8933e);
const uvOffset = (rng: () => number): [number, number] => [rng() * 7.31, rng() * 5.17];

/** A round post (x, z) from y0 to y1 in vermilion. */
function post(sink: PartSink, x: number, z: number, y0: number, y1: number, r: number, opts: EmitOptions = { colour: VERMILION }): void {
  sink.cylinder('structureMetal', [x, y0, z], 'y', y1 - y0, r, 10, opts);
}

/** A stone lantern (tōrō) at (x, z) on the ground: its base, shaft, the light's box with its dark window, its cap. */
function lantern(sink: PartSink, x: number, z: number, h: number): void {
  const o: EmitOptions = { decor: true };
  sink.span('stone', x - 0.42, -0.2, z - 0.42, x + 0.42, 0.18, z + 0.42, o);
  sink.cylinder('stone', [x, 0.18, z], 'y', h * 0.45, 0.16, 8, o);
  sink.span('stone', x - 0.36, 0.18 + h * 0.45, z - 0.36, x + 0.36, 0.3 + h * 0.45, z + 0.36, o);
  sink.span('stone', x - 0.26, 0.3 + h * 0.45, z - 0.26, x + 0.26, 0.75 + h * 0.45, z + 0.26, o);
  sink.span('dark', x - 0.14, 0.4 + h * 0.45, z + 0.26, x + 0.14, 0.65 + h * 0.45, z + 0.27, o);
  sink.cylinder('stone', [x, 0.75 + h * 0.45, z], 'y', 0.32, 0.55, 6, o, 0.08, true, Math.PI / 6);
  sink.cylinder('stone', [x, 1.07 + h * 0.45, z], 'y', 0.18, 0.08, 6, o, 0.02);
}

/** A hall: posts in vermilion on a raised floor, its walls white between them, an irimoya roof over it; returns the roof's
 *  ridge top. In the frame of its centre (cx, cz), w across x, d along z, the floor at `floor`, walls to `eave`. */
function hall(sink: PartSink, cx: number, cz: number, w: number, d: number, floor: number, eave: number, pitch: number, overhang: number): number {
  // the floor's stone footing and the plank floor on it
  sink.span('stone', cx - w / 2 - 0.4, -0.6, cz - d / 2 - 0.4, cx + w / 2 + 0.4, 0.3, cz + d / 2 + 0.4);
  sink.span('structureWood', cx - w / 2 - 0.25, floor - 0.25, cz - d / 2 - 0.25, cx + w / 2 + 0.25, floor, cz + d / 2 + 0.25, { colour: CYPRESS });
  for (const [x0, z0] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) post(sink, cx + x0 * (w / 2 - 0.2), cz + z0 * (d / 2 - 0.2), 0.3, floor - 0.25, 0.22, { colour: shade(VERMILION, 0.8) });
  // the walls: the body in white, the posts and the head beam in vermilion over them
  sink.span('plaster', cx - w / 2 + 0.1, floor, cz - d / 2 + 0.1, cx + w / 2 - 0.1, eave, cz + d / 2 - 0.1);
  const nx = Math.max(2, Math.round(w / 2.4)), nz = Math.max(2, Math.round(d / 2.4));
  for (let i = 0; i <= nx; i++) for (const sz of [-1, 1]) post(sink, cx - w / 2 + 0.1 + (w - 0.2) * i / nx, cz + sz * (d / 2 - 0.1), floor, eave, 0.17);
  for (let j = 1; j < nz; j++) for (const sx of [-1, 1]) post(sink, cx + sx * (w / 2 - 0.1), cz - d / 2 + 0.1 + (d - 0.2) * j / nz, floor, eave, 0.17);
  sink.span('structureMetal', cx - w / 2 - 0.05, eave - 0.32, cz - d / 2 - 0.05, cx + w / 2 + 0.05, eave, cz + d / 2 + 0.05, { colour: VERMILION });
  // the brackets under the eaves (a block on every post's head) and the roof: a hip with its gables (irimoya)
  const roof: RoofSpec = { kind: 'hip', pitchDeg: pitch, eave: overhang, verge: overhang, thickness: 0.2, bucket: 'roof', ridge: 'saddle' };
  let ridgeTop = eave;
  sink.placed(0, cx, 0, cz, () => {
    const rg = roofGeometry(w, d, eave, roof);
    emitRoof(sink, rg, roof);
    irimoyaGables(sink, rg, roof, 'structureWood', undefined, CYPRESS);
    ridgeTop = rg.ridgeTopY;
  });
  return ridgeTop;
}

export const asoShrine: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const W = Math.max(16, Number(ctx.params.width)), D = Math.max(24, Number(ctx.params.depth));
  const base = -0.6 - ctx.groundFall;
  // ---- the precinct's fence: a stone kerb round it (the gate's opening at the front), the vermilion rail on posts
  const kh = 0.45, gateW = 9.2;
  const kerb = (x0: number, z0: number, x1: number, z1: number) => sink.span('stone', x0, base, z0, x1, kh, z1);
  kerb(-W / 2, -D / 2, W / 2, -D / 2 + 0.35);
  kerb(-W / 2, -D / 2 + 0.35, -W / 2 + 0.35, D / 2);
  kerb(W / 2 - 0.35, -D / 2 + 0.35, W / 2, D / 2);
  kerb(-W / 2 + 0.35, D / 2 - 0.35, -gateW / 2, D / 2);
  kerb(gateW / 2, D / 2 - 0.35, W / 2 - 0.35, D / 2);
  const railOpts: EmitOptions = { colour: VERMILION, decor: true };
  const fence = (ax: number, az: number, bx: number, bz: number) => {
    const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / 1.8));
    for (let k = 0; k <= n; k++) {
      const x = ax + (bx - ax) * k / n, z = az + (bz - az) * k / n;
      sink.span('structureMetal', x - 0.07, kh - 0.02, z - 0.07, x + 0.07, kh + 1.0, z + 0.07, railOpts);
    }
    for (const y of [kh + 0.45, kh + 0.92]) bar(sink, 'structureMetal', [ax, y, az], [bx, y, bz], 0.08, railOpts);
  };
  const fz0 = -D / 2 + 0.17, fz1 = D / 2 - 0.17, fx = W / 2 - 0.17;
  fence(-fx, fz0, fx, fz0); fence(-fx, fz0, -fx, fz1); fence(fx, fz0, fx, fz1); fence(-fx, fz1, -gateW / 2, fz1); fence(gateW / 2, fz1, fx, fz1);
  // ---- the paved approach from the gate to the hall, its lanterns either side
  const gz = D / 2 - 2.8, hz = -1.0, hd = 7.6;
  sink.span('stone', -1.4, -0.3, hz + hd / 2, 1.4, 0.06, gz, { decor: true, shade: 0.9 });
  for (const t of [0.25, 0.7]) for (const sx of [-1, 1]) lantern(sink, sx * 2.6, hz + hd / 2 + (gz - 2.8 - hz - hd / 2) * t + 1.0, 1.9);
  // ---- the two-storey gate: the lower storey's posts, its side bays walled in white, the balcony round the upper
  // storey, the upper storey's walls and posts, the great hip-and-gable roof
  const gw = 9.0, gd = 5.2, lowTop = 4.6, upTop = 8.0;
  sink.span('stone', -gw / 2 - 0.4, base, gz - gd / 2 - 0.4, gw / 2 + 0.4, 0.3, gz + gd / 2 + 0.4);
  const xs = [-gw / 2 + 0.3, -1.4, 1.4, gw / 2 - 0.3];
  for (const x of xs) for (const z of [gz - gd / 2 + 0.3, gz + gd / 2 - 0.3]) post(sink, x, z, 0.3, upTop, 0.3);
  for (const sx of [-1, 1]) {
    // the side bays: white walls between the outer and inner posts, front and back, and the bay's end wall
    const xa = sx > 0 ? 1.4 + 0.3 : -gw / 2 + 0.3 + 0.3, xb = sx > 0 ? gw / 2 - 0.3 - 0.3 : -1.4 - 0.3;
    for (const z of [gz - gd / 2 + 0.3, gz + gd / 2 - 0.3]) sink.span('plaster', xa, 0.3, z - 0.12, xb, lowTop - 0.3, z + 0.12);
    sink.span('plaster', sx > 0 ? gw / 2 - 0.42 : -gw / 2 + 0.3, 0.3, gz - gd / 2 + 0.6, sx > 0 ? gw / 2 - 0.3 : -gw / 2 + 0.42, lowTop - 0.3, gz + gd / 2 - 0.6);
  }
  // the head beams of the lower storey, the balcony's floor on them, its railing on posts
  sink.span('structureMetal', -gw / 2, lowTop - 0.3, gz - gd / 2, gw / 2, lowTop, gz + gd / 2, { colour: VERMILION });
  sink.span('structureWood', -gw / 2 - 0.9, lowTop, gz - gd / 2 - 0.9, gw / 2 + 0.9, lowTop + 0.18, gz + gd / 2 + 0.9, { colour: CYPRESS });
  const bx = gw / 2 + 0.8, bz0 = gz - gd / 2 - 0.8, bz1 = gz + gd / 2 + 0.8;
  for (const [ax, az, cx2, cz2] of [[-bx, bz1, bx, bz1], [bx, bz1, bx, bz0], [bx, bz0, -bx, bz0], [-bx, bz0, -bx, bz1]] as const) {
    const len = Math.hypot(cx2 - ax, cz2 - az), n = Math.max(2, Math.round(len / 1.5));
    for (let k = 0; k <= n; k++) sink.span('structureMetal', ax + (cx2 - ax) * k / n - 0.06, lowTop + 0.16, az + (cz2 - az) * k / n - 0.06, ax + (cx2 - ax) * k / n + 0.06, lowTop + 1.0, az + (cz2 - az) * k / n + 0.06, railOpts);
    bar(sink, 'structureMetal', [ax, lowTop + 0.98, az], [cx2, lowTop + 0.98, cz2], 0.08, railOpts);
  }
  // the upper storey's walls between its posts (white), its head beam
  sink.span('plaster', -gw / 2 + 0.3, lowTop + 0.18, gz - gd / 2 + 0.2, gw / 2 - 0.3, upTop - 0.3, gz + gd / 2 - 0.2);
  sink.span('structureMetal', -gw / 2 - 0.05, upTop - 0.32, gz - gd / 2 - 0.05, gw / 2 + 0.05, upTop, gz + gd / 2 + 0.05, { colour: VERMILION });
  const groof: RoofSpec = { kind: 'hip', pitchDeg: 30, eave: 1.7, verge: 1.7, thickness: 0.24, bucket: 'roof', ridge: 'saddle' };
  sink.placed(0, 0, 0, gz, () => {
    // (the roof's ridge along the gate's width: its frame turned a quarter)
    sink.placed(Math.PI / 2, 0, 0, 0, () => {
      const rg = roofGeometry(gd, gw, upTop, groof);
      emitRoof(sink, rg, groof);
      irimoyaGables(sink, rg, groof, 'structureWood', undefined, CYPRESS);
    });
  });
  // the plaque over the passage
  sink.span('structureMetal', -0.7, lowTop - 1.15, gz + gd / 2 - 0.3, 0.7, lowTop - 0.29, gz + gd / 2 - 0.12, { colour: BLACK, decor: true });
  sink.span('structureMetal', -0.55, lowTop - 1.03, gz + gd / 2 - 0.12, 0.55, lowTop - 0.42, gz + gd / 2 - 0.08, { colour: GILT, decor: true });
  // ---- the worship hall and its steps up to its raised floor
  hall(sink, 0, hz, 12.0, hd, 1.2, 4.4, 28, 1.3);
  for (let k = 0; k < 3; k++) sink.span('stone', -1.6, -0.2, hz + hd / 2 + 0.25 + k * 0.32, 1.6, 1.2 - (k + 1) * 0.3, hz + hd / 2 + 0.57 + k * 0.32, { decor: true });
  // ---- the sanctuary at the back on its platform under a flowing roof (a gable with its front slope carried out), the
  // crossed finials (chigi) at the ridge's ends and the logs (katsuogi) along it
  const sz = -D / 2 + 4.6, sw = 5.4, sd = 4.8, sfl = 1.6, se = 4.4;
  sink.span('stone', -sw / 2 - 0.8, base, sz - sd / 2 - 0.8, sw / 2 + 0.8, sfl - 0.3, sz + sd / 2 + 2.4);
  sink.span('plaster', -sw / 2, sfl - 0.3, sz - sd / 2, sw / 2, se, sz + sd / 2);
  for (const sx of [-1, 1]) for (const zz of [-1, 1]) post(sink, sx * (sw / 2 - 0.05), sz + zz * (sd / 2 - 0.05), sfl - 0.3, se, 0.17);
  const nr: RoofSpec = { kind: 'gable', pitchDeg: 26, eave: 0.6, verge: 0.6, thickness: 0.18, bucket: 'roof', ridge: 'saddle' };
  let ridge = se;
  sink.placed(Math.PI / 2, 0, 0, sz, () => { const rg = roofGeometry(sd, sw, se, nr); emitRoof(sink, rg, nr); ridge = rg.ridgeTopY; });
  // the front slope carried out over the steps (the nagare's long front)
  const tan = Math.tan(26 * Math.PI / 180), frontEave = se - 0.6 * tan;
  sink.prism('roof', [[-sw / 2 - 0.6, frontEave - 0.02, sz + sd / 2 + 0.6], [sw / 2 + 0.6, frontEave - 0.02, sz + sd / 2 + 0.6], [sw / 2 + 0.6, frontEave - 1.5 * tan * 0.6, sz + sd / 2 + 2.1],
    [-sw / 2 - 0.6, frontEave - 1.5 * tan * 0.6, sz + sd / 2 + 2.1]], [0, 1, 0], 0.16);
  for (const sx of [-1, 1]) post(sink, sx * (sw / 2 + 0.3), sz + sd / 2 + 1.9, sfl - 0.3, frontEave - 0.9, 0.12);
  // (the ridge runs along x: the chigi at its ends, two boards crossing in the gable's plane; the katsuogi logs laid
  // across the ridge, spaced along it)
  for (const sx of [-1, 1]) {
    const x = sx * (sw / 2 + 0.45);
    // (each board a finial standing up from the ridge's end, leaning about 20 degrees off upright: a post's top is free)
    for (const lean of [-1, 1]) bar(sink, 'structureWood', [x, ridge - 0.12, sz], [x + sx * 0.1, ridge + 1.35, sz + lean * 0.52], 0.12, { colour: CYPRESS, decor: true });
  }
  for (let k = 0; k < 5; k++) {
    const x = -sw / 2 + 0.7 + k * (sw - 1.4) / 4;
    sink.cylinder('structureWood', [x, ridge - 0.05, sz - 0.55], 'z', 1.1, 0.13, 8, { colour: shade(CYPRESS, 1.1), decor: true });
  }
  return { parts: sink.finish() };
};
