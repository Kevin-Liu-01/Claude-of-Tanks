// src/world/landmarks/aghurmi.ts — the Temple of the Oracle of Amun on the rock of Aghurmi (the buildings lane,
// 2026-10-11, round 4: a landmark per map, Sunscar Oasis). Siwa's oracle, which Alexander rode across the desert to
// consult in 331 BC: a small temple of the 26th dynasty in dressed limestone on the summit of a limestone outcrop, the
// ruins of the mud-built village of Aghurmi heaped round it on the rock, a way up its flank to the gate.
//
// The rock: three stacked shelves of limestone, each a little smaller and turned, their edges broken back, talus
// blocks fallen at the foot; the way up a ramp along the south flank with its low wall. On the summit: the temple's
// forecourt, hall and sanctuary in one walled block of ashlar, its walls broken down in steps toward the front, the
// gate's jambs and lintel, the sanctuary still roofed with its slabs; round it the kershef walls of the village, melted
// to rounded stubs (the map's own mud render: the Siwa kit tones its plaster as kershef). The piece's front (+z) is the
// temple's gate, the ramp's foot toward -x at the south: a stepped footpath 2.2 m wide pitched near 28°, too narrow and too
// steep for a hull (the map-revival lane's condition: the summit stays scenery, not a perch over the west lane).
import { PartSink, LocalFrame, type EmitOptions, type Vec3 } from '../maps/regional/geometry.ts';
import { extrude } from './kit.ts';
import type { LandmarkBuilder } from './types.ts';

const uvOffset = (rng: () => number): [number, number] => [rng() * 7.31, rng() * 5.17];

/** A shelf's outline: `n` corners round (cx, cz) on an ellipse rx × rz, each pushed in by up to `jag` (fraction), turned
 *  `turn`; counter-clockwise seen from above (the corners' angles fall, as ringY's do). */
function outline(cx: number, cz: number, rx: number, rz: number, n: number, jag: number, turn: number, rand: () => number): Array<[number, number]> {
  const pts: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    const a = -(turn + (i / n) * Math.PI * 2), f = 1 - jag * rand();
    const x = Math.cos(a) * rx * f, z = Math.sin(a) * rz * f;
    pts.push([cx + x * Math.cos(turn) - z * Math.sin(turn), cz + x * Math.sin(turn) + z * Math.cos(turn)]);
  }
  return pts;
}

/**
 * One shelf of the rock between two outlines (the foot's at y0, the brow's at y1, the brow drawn in and shifted: the face
 * battered back): the side faces between them and the shelf's top. Its rock reads as a broken limestone face, not as
 * the stone bucket's courses: the tile stretched over tens of metres (density 0.028): its courses read as the rock's bedding, not as joints.
 */
function rockShelf(sink: PartSink, foot: Array<[number, number]>, brow: Array<[number, number]>, y0: number, y1: number, opts: EmitOptions): void {
  const n = foot.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    sink.quad('stone', [foot[i][0], y0, foot[i][1]], [foot[j][0], y0, foot[j][1]], [brow[j][0], y1, brow[j][1]], [brow[i][0], y1, brow[i][1]], opts);
  }
  sink.polygon('stone', brow.map(([x, z]): Vec3 => [x, y1, z]), opts);
  sink.polygon('stone', [...foot].reverse().map(([x, z]): Vec3 => [x, y0, z]), opts);
}

export const oracleTemple: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const rand = ctx.rng, look = ctx.variant;
  const S = Math.max(22, Number(ctx.params.size)), H = Math.max(6, Number(ctx.params.height));
  const k = S / 28;
  const base = -0.8 - ctx.groundFall;
  // ---- the rock: three shelves, each battered back and drawn in, the upper ones shifted off the lower's middle (an
  // outcrop, not a stack of rings); the summit at H
  const rockOpts: EmitOptions = { density: 0.028 };
  const shelves: Array<[number, number, number, number, number, number]> = [
    // [rx, rz, centre shift x, centre shift z, y0, y1]
    [13.4 * k, 12.6 * k, 0, 0, base, H * 0.42],
    [11.6 * k, 10.6 * k, 0.6 * k, 0.4 * k, H * 0.42, H * 0.78],
    [10.0 * k, 9.4 * k, 0.4 * k, 0.9 * k, H * 0.78, H],
  ];
  let summit: Array<[number, number]> = [];
  for (const [i, [rx, rz, sx, sz, y0, y1]] of shelves.entries()) {
    const turn = 0.21 * i + look() * 0.15, n = 12;
    const foot = outline(sx, sz, rx, rz, n, 0.05, turn, rand);
    // the brow: the same corners drawn in by a metre or so (a little more where the shelf faces the sun's weather)
    const brow = foot.map(([x, z], c): [number, number] => {
      const d = Math.hypot(x - sx, z - sz) || 1, pull = (0.6 + 0.5 * ((c * 7) % 5) / 4) * k;
      return [x - (x - sx) / d * pull, z - (z - sz) / d * pull];
    });
    rockShelf(sink, foot, brow, y0, y1, rockOpts);
    summit = brow;
  }
  // a point on the summit, at least `margin` inside every edge of its (convex) brow
  let area = 0;
  for (let i = 0; i < summit.length; i++) { const [ax, az] = summit[i], [bx, bz] = summit[(i + 1) % summit.length]; area += ax * bz - bx * az; }
  const orient = Math.sign(area) || 1;
  const onSummit = (x: number, z: number, margin: number): boolean => summit.every(([ax, az], i) => {
    const [bx, bz] = summit[(i + 1) % summit.length], l = Math.hypot(bx - ax, bz - az) || 1;
    return orient * ((bx - ax) * (z - az) - (bz - az) * (x - ax)) / l >= margin;
  });
  // the talus: blocks fallen from the shelves' edges, lying on the ground round the foot (dressing; each on the ground)
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2 + look() * 0.3, d = 13.2 * k + 0.6 + look() * 1.6, sz = 0.5 + look() * 0.9;
    const c: Vec3 = [Math.cos(a) * d, sz * 0.35 - 0.12, Math.sin(a) * d];
    const yaw = look() * Math.PI;
    sink.box('stone', c, [sz * 0.7, sz * 0.45, sz * 0.55], { decor: true, density: 0.12 }, new LocalFrame([Math.cos(yaw), 0, Math.sin(yaw)], [0, 1, 0], [-Math.sin(yaw), 0, Math.cos(yaw)], c));
  }
  // ---- the way up: a ramp along the south flank from the ground at the west to the summit's edge, its low wall
  const rw = 2.2 * k, rz = -13.2 * k + 0.4, rx0 = -9.5 * k, rx1 = 6.5 * k;
  extrude(sink, 'stone', [[rx0, base, rz - rw], [rx1, base, rz - rw], [rx1, H - 0.05, rz - rw], [rx0, 0.15, rz - rw]], [0, 0, 1], rw, rockOpts);
  const rampWall = (x: number) => 0.15 + (H - 0.2) * (x - rx0) / (rx1 - rx0);
  // (a footpath, not a hull's way up: 2.2 m between its wall and the rock, pitched near 28 degrees, stepped all the way)
  const treads = Math.round((rx1 - rx0) / 0.42);
  for (let i = 0; i < treads; i++) {
    const xa = rx0 + (rx1 - rx0) * i / treads, xb = rx0 + (rx1 - rx0) * (i + 1) / treads, y = rampWall(xb) - 0.15 + 0.02;
    sink.span('stone', xa, rampWall(xa) - 0.15, rz - rw + 0.02, xb, y + 0.06, rz - 0.02, { decor: true, fine: true, density: 0.12 });
  }
  for (let i = 0; i < 8; i++) {
    const xa = rx0 + (rx1 - rx0) * i / 8, xb = rx0 + (rx1 - rx0) * (i + 1) / 8;
    sink.span('stone', xa, rampWall(xa) - 0.1, rz - rw - 0.35, xb, rampWall(xb) + 0.7, rz - rw, { decor: true });
  }
  // ---- the temple on the summit: one walled block of ashlar, its walls broken down in steps toward the front
  const tw = 7.6 * k, tl = 13.0 * k, t = 0.75, ty = H, tz0 = -tl / 2 + 0.6, tz1 = tl / 2 + 0.6;
  const wallH = 5.2 * k;
  // the floor of the court, a course over the summit
  sink.span('stone', -tw / 2 - 0.6, ty - 0.1, tz0 - 0.6, tw / 2 + 0.6, ty + 0.25, tz1 + 1.6);
  const floor = ty + 0.25;
  // each wall in lengths, its top stepped down toward the gate (the front stands lowest, robbed for building stone)
  const lengths = 7;
  for (const sx of [-1, 1]) {
    for (let i = 0; i < lengths; i++) {
      const z0 = tz0 + (tz1 - tz0) * i / lengths, z1 = tz0 + (tz1 - tz0) * (i + 1) / lengths;
      const f = i / (lengths - 1), h = wallH * (1 - 0.45 * f) - (look() < 0.3 ? 0.6 : 0);
      sink.span('stone', sx > 0 ? tw / 2 - t : -tw / 2, floor, z0, sx > 0 ? tw / 2 : -tw / 2 + t, floor + h, z1);
    }
  }
  sink.span('stone', -tw / 2, floor, tz0, tw / 2, floor + wallH, tz0 + t);
  // the front with its gate: the jambs, the lintel over them, the walls either side broken lower
  const gw = 1.7 * k, frontH = wallH * 0.62;
  for (const sx of [-1, 1]) {
    sink.span('stone', sx > 0 ? gw / 2 + 0.6 : -tw / 2 + t, floor, tz1 - t, sx > 0 ? tw / 2 - t : -gw / 2 - 0.6, floor + frontH * (0.7 + look() * 0.25), tz1);
    sink.span('stone', sx > 0 ? gw / 2 : -gw / 2 - 0.6, floor, tz1 - t - 0.1, sx > 0 ? gw / 2 + 0.6 : -gw / 2, floor + 3.6 * k, tz1 + 0.1);
  }
  sink.span('stone', -gw / 2 - 0.75, floor + 3.6 * k, tz1 - t - 0.15, gw / 2 + 0.75, floor + 3.6 * k + 0.7, tz1 + 0.15);
  // the inner wall between the hall and the sanctuary, its door; the sanctuary's roof slabs
  const iz = tz0 + (tz1 - tz0) * 0.32;
  for (const sx of [-1, 1]) sink.span('stone', sx > 0 ? 0.7 : -tw / 2 + t, floor, iz - 0.3, sx > 0 ? tw / 2 - t : -0.7, floor + wallH * 0.9, iz + 0.3);
  sink.span('stone', -0.75, floor + 2.6 * k, iz - 0.32, 0.75, floor + wallH * 0.9, iz + 0.32);
  for (let i = 0; i < 4; i++) {
    const z0 = tz0 + (iz - tz0) * i / 4, z1 = tz0 + (iz - tz0) * (i + 1) / 4 - 0.04;
    sink.span('stone', -tw / 2, floor + wallH, z0, tw / 2, floor + wallH + 0.45, z1, { shade: 0.92 } as EmitOptions);
  }
  // ---- the village of Aghurmi round the temple: kershef walls melted to rounded stubs on the summit, either side of
  // the court and behind it, each wholly on the rock
  const spots: Array<[number, number, number]> = [];
  for (const sx of [-1, 1]) for (const off of [2.0, 3.4]) for (let z = tz0 - 1.0; z < tz1 + 1.5; z += 2.3) spots.push([sx * (tw / 2 + off), z, Math.PI / 2]);
  for (let x = -tw / 2; x <= tw / 2; x += 2.4) spots.push([x, tz0 - 2.2, 0]);
  for (const [x, z, yaw0] of spots) {
    if (look() < 0.3) continue;
    const len = 1.5 + look() * 1.1, h = 0.8 + look() * 2.0, th = 0.45, yaw = yaw0 + (look() - 0.5) * 0.4;
    const ca = Math.cos(yaw) * len / 2, sa = Math.sin(yaw) * len / 2;
    if (![[x + ca, z + sa], [x - ca, z - sa]].every(([px, pz]) => onSummit(px, pz, 0.45))) continue;
    const c: Vec3 = [x, floor + h / 2 - 0.2, z];
    sink.box('plaster', c, [len / 2, h / 2 + 0.2, th / 2], {}, new LocalFrame([Math.cos(yaw), 0, Math.sin(yaw)], [0, 1, 0], [-Math.sin(yaw), 0, Math.cos(yaw)], c));
    // the rain-rounded top
    sink.cylinder('plaster', [x, floor + h - 0.02, z], 'y', 0.3, Math.min(len, 1.2) * 0.42, 7, { decor: true }, 0.1);
  }
  return { parts: sink.finish() };
};
