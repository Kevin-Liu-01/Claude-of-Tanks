// src/world/maps/regional/breton.ts — the Breton granite kit (Saltmere Bay: a granite fishing village and its farms
// on the Finistère coast). Low longères and two-storey bourg houses of grey granite rubble, some limewashed, with
// dressed granite quoins and surrounds; steep slate roofs that stop flush at the wall head; gables carried up above
// the roof as coped parapets on granite kneelers, each with a massive gable-end stack; stone dormers (lucarnes) rising
// through the eaves on the long front; small casements with painted plank shutters (blue, green, red); granite barns;
// a chapel with a pierced bell gable.
import {
  PartSink, faceBox, facePoint, pick, rgb, shade,
  type Face, type RegionalBucket, type RegionalParts, type Rgb, type Vec3,
} from './geometry.ts';
import {
  buildHouse, emitRoof, roofGeometry, wallPolygon, windowRhythm,
  type HouseDialect, type HouseFrame, type HouseSpec, type Opening, type RoofSpec,
} from './house.ts';
import { doorUnit, gateUnit, windowUnit, type WindowStyle } from './openings.ts';
import { bench, floweringShrub, wallLantern } from './dressing.ts';
import type { ArchitectureStyle, RegionalBuildContext, RegionalBuilder } from './types.ts';

const PAINTS: readonly Rgb[] = [0x3f78a6, 0x4f88aa, 0x3f7a60, 0x9a3a32, 0x7a8890, 0x3e6688].map(rgb);
const FRAME_WHITE = rgb(0xd2cec4);

interface BretonState {
  rng: () => number;
  paint: Rgb;
  window: WindowStyle;
  litShare: number;
  wall: RegionalBucket;
}

function stateFor(ctx: RegionalBuildContext): BretonState {
  const rng = ctx.rng;
  const paint = pick(rng, PAINTS);
  const shutters = rng() < 0.6;
  return {
    rng, paint,
    wall: ctx.wallBucket === 'stone' ? 'stone' : (ctx.wallBucket as RegionalBucket),
    window: {
      frame: FRAME_WHITE, frameWidth: 0.06, frameOut: 0.05, bars: rng() < 0.6 ? 'six' : 'cross',
      surround: { bucket: 'stone', width: 0.22, out: 0.06, lintel: 0.3 }, sill: { bucket: 'stone', out: 0.1 },
      shutters: shutters ? { colour: paint, kind: 'plank', closed: 0.15 } : null,
    },
    litShare: 0.4,
  };
}

function dialect(st: BretonState): HouseDialect {
  return {
    window: (sink, face, o, y0) => windowUnit(sink, face, o.u, y0 + o.y0, o.w, o.h,
      o.kind === 'loft' ? { ...st.window, shutters: null, bars: 'none' } : st.window, st.rng, o.kind === 'loft' ? 0 : st.litShare),
    door: (sink, face, o, y0, frame) => {
      if (o.kind === 'gate') {
        gateUnit(sink, face, o.u, y0 + o.y0, o.w, o.h, shade(st.paint, 0.8), { bucket: 'stone', width: 0.3, out: 0.07 });
        return;
      }
      doorUnit(sink, face, o.u, y0 + o.y0, o.w, o.h, {
        leaf: st.paint, frame: { bucket: 'stone', width: 0.26, out: 0.06 }, steps: { bucket: 'stone' },
        leafKind: st.rng() < 0.5 ? 'plank' : 'glazed', transom: false,
      }, frame.floors[o.storey] + o.y0);
    },
  };
}

function uvOffset(ctx: RegionalBuildContext): [number, number] {
  return [ctx.rng() * 7.31, ctx.rng() * 5.17];
}

const slate = (pitch: number): RoofSpec => ({ kind: 'gable', pitchDeg: pitch, eave: 0.1, verge: 0.02, thickness: 0.12, bucket: 'roof', ridge: 'saddle' });

/** Gable parapets: coped granite on the gable walls above the slates, kneelers at the feet, a gable-end stack. */
function gableParapets(sink: PartSink, frame: HouseFrame, stacks: number, rng: () => number): void {
  const rg = frame.roof;
  const top = frame.bodies[frame.bodies.length - 1];
  const zF = top.z1, zB = top.z0, s = rg.s;
  const ends: Array<[number, 1 | -1]> = [[zF, 1], [zB, -1]];
  ends.forEach(([z, sgn], k) => {
    const face: Face = { origin: [0, 0, z], u: [sgn, 0, 0], out: [0, 0, sgn], width: 2 * s };
    for (const side of [-1, 1]) {
      // coping along the rake, riding 0.16 above the roof surface across the full wall thickness
      const a = facePoint(face, side * (s + 0.06), rg.eaveY + 0.2, 0), b = facePoint(face, 0, rg.ridgeTopY + 0.12, 0);
      sink.member('stone', a, b, 0.34, 0.5, face.out, { exposed: true, decor: true }, 0.5);
      // the kneeler at the foot of the rake
      faceBox(sink, 'stone', face, side * (s - 0.05), rg.eaveY - 0.05, -0.18, 0.62, 0.42, 0.6, { decor: true });
    }
    if (k < stacks) {
      // the gable-end stack rises from the apex through the coping
      const w = 0.95 + rng() * 0.25, dz = 0.62;
      const zc = z - sgn * dz / 2;
      sink.span('stone', -w / 2, rg.ridgeY - 1.6, zc - dz / 2, w / 2, rg.ridgeTopY + 1.05, zc + dz / 2);
      sink.span('stone', -w / 2 - 0.08, rg.ridgeTopY + 1.05, zc - dz / 2 - 0.08, w / 2 + 0.08, rg.ridgeTopY + 1.2, zc + dz / 2 + 0.08);
      for (const px of [-w * 0.22, w * 0.22]) sink.cylinder('roof', [px, rg.ridgeTopY + 1.2, zc], 'y', 0.3, 0.09, 6, { decor: true });
    }
  });
}

/** A stone dormer (lucarne à fronton) rising through the eaves of the +x or -x long face at z = zc. */
function dormer(sink: PartSink, frame: HouseFrame, side: 1 | -1, zc: number, st: BretonState): void {
  const rg = frame.roof, s = rg.s, eave = rg.eaveY;
  const a = 0.78, hD = 1.55, pitch = 50 * Math.PI / 180;
  const apex = hD + a * Math.tan(pitch);
  const face: Face = side > 0
    ? { origin: [s, 0, 0], u: [0, 0, -1], out: [1, 0, 0], width: 2 * a }
    : { origin: [-s, 0, 0], u: [0, 0, 1], out: [-1, 0, 0], width: 2 * a };
  const uc = side > 0 ? -zc : zc;
  // the front wall continues the facade up into a little gable
  wallPolygon(sink, st.wall, face, [[uc - a, eave - 0.6], [uc + a, eave - 0.6], [uc + a, eave + hD], [uc, eave + apex], [uc - a, eave + hD]], 0.36);
  // its cheeks run back until the main roof swallows them
  const depth = (apex + 0.2) / rg.tanP + 0.3;
  for (const dz of [-a + 0.1, a - 0.1]) {
    const x0 = side > 0 ? s - depth : -s, x1 = side > 0 ? s : -s + depth;
    sink.span(st.wall, x0, eave - 0.3, zc + dz - 0.1, x1, eave + hD, zc + dz + 0.1);
  }
  // its slate roof, a small gable with the ridge running back into the main roof
  const len = depth + 0.1;
  const dr: RoofSpec = { kind: 'gable', pitchDeg: 50, eave: 0.08, verge: 0.04, thickness: 0.1, bucket: 'roof', ridge: 'saddle' };
  const dg = roofGeometry(2 * a, len, eave + hD, dr);
  sink.placed(Math.PI / 2, side * (s - len / 2 + 0.05), 0, zc, () => emitRoof(sink, dg, dr));
  windowUnit(sink, face, uc, eave + 0.32, 0.66, 0.95, { ...st.window, shutters: null }, st.rng, st.litShare);
}

/** The Breton dwelling: a longère (one storey and dormers) or a two-storey bourg house. */
function dwelling(ctx: RegionalBuildContext, opts: { longere?: boolean; storeys?: number } = {}): RegionalParts {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx);
  const rng = st.rng;
  const W = Math.max(5.2, ctx.info.w - 0.3), D = Math.max(6.8, ctx.info.d - 0.3);
  const longere = opts.longere ?? rng() < 0.5;
  const count = longere ? 1 : (opts.storeys ?? 2);
  const sts: HouseSpec['storeys'] = [];
  for (let i = 0; i < count; i++) sts.push({ h: i === 0 ? 2.75 : 2.55, wall: st.wall });
  // the street gable (+z) carries the door in a longère's short front; the bourg house fronts its eaves side (+x)
  const openings: Opening[] = [];
  const doorFace = longere ? 'right' : 'front';
  const doorU = doorFace === 'right' ? 0 : (rng() - 0.5) * W * 0.3;
  openings.push({ face: doorFace, storey: 0, kind: 'door', u: doorU, w: 0.95, y0: 0, h: 2.05 });
  sts.forEach((_, i) => {
    for (const face of ['front', 'right', 'back', 'left'] as const) {
      const width = face === 'front' || face === 'back' ? W : D;
      const avoid: Array<[number, number]> = openings.filter((o) => o.face === face && o.storey === i).map((o) => [o.u - o.w / 2, o.u + o.w / 2]);
      const gable = face === 'front' || face === 'back';
      if (gable && longere) continue;
      for (const o of windowRhythm(face, i, width, { w: 0.82, h: 1.15, sill: 0.95, spacing: gable ? 2.0 : 2.3, margin: 1.0, avoid, max: gable ? 2 : 4 })) {
        if (face === 'back' && rng() < 0.4) continue;
        openings.push(o);
      }
    }
  });
  const frame = buildHouse(sink, {
    w: W, d: D, plinth: { h: 0.12, out: 0.03, bucket: 'stone' }, storeys: sts,
    roof: slate(46 + rng() * 6), gableBucket: st.wall, openings, chimneys: [], gutters: rng() < 0.3 ? { colour: rgb(0x5a5e60) } : null, verge: null,
    reveal: 0.34,
  }, dialect(st));
  gableParapets(sink, frame, rng() < 0.55 ? 2 : 1, rng);
  if (longere) {
    const n = D > 8.5 ? 2 : 1;
    for (let k = 0; k < n; k++) dormer(sink, frame, 1, n === 1 ? -D * 0.15 : (k === 0 ? -D * 0.25 : D * 0.22), st);
  }
  quoins(sink, frame);
  // the lived-in dressing: a hydrangea by the door (blue on the acid granite soil, sometimes pink), a bench
  const shrub = rng() < 0.6, bloom: Rgb = rng() < 0.7 ? [0.36, 0.46, 0.78] : [0.82, 0.48, 0.62], seat = rng() < 0.3, lantern = rng() < 0.4;
  if (ctx.tier !== 'mobile') {
    const door = openings[0], face = frame.faces[door.face];
    const side = door.u > 0 ? -1 : 1;
    if (shrub && Math.abs(door.u + side * (door.w / 2 + 0.75)) + 0.6 < face.width / 2) floweringShrub(sink, face, door.u + side * (door.w / 2 + 0.75), 0.9, bloom, rng);
    if (seat && Math.abs(door.u - side * (door.w / 2 + 1.1)) + 0.8 < face.width / 2) bench(sink, face, door.u - side * (door.w / 2 + 1.1), 1.3, [0.42, 0.36, 0.28]);
    if (lantern && Math.abs(door.u - side * (door.w / 2 + 0.45)) + 0.3 < face.width / 2) wallLantern(sink, face, door.u - side * (door.w / 2 + 0.45), 2.1);
  }
  return sink.finish();
}

/** Dressed granite quoins at the corners of a limewashed or rubble body. */
function quoins(sink: PartSink, frame: HouseFrame): void {
  const b = frame.bodies[0], top = frame.eaveY;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const x = sx > 0 ? b.x1 : b.x0, z = sz > 0 ? b.z1 : b.z0;
    for (let y = 0.15, k = 0; y < top - 0.3; y += 0.38, k++) {
      const long = (k & 1) === 0;
      const lx = long ? 0.62 : 0.34, lz = long ? 0.34 : 0.62;
      sink.span('stone', sx > 0 ? x - lx : x - 0.035, y, sz > 0 ? z - lz : z - 0.035,
        sx > 0 ? x + 0.035 : x + lx, y + 0.36, sz > 0 ? z + 0.035 : z + lz, { decor: true });
    }
  }
}

/** The granite barn: a long body, a cart door in the street gable, a loft door above, slate roof. */
const barn: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = { ...stateFor(ctx), wall: 'stone' as RegionalBucket };
  const W = Math.max(6.8, ctx.info.w - 0.3), D = Math.max(10, ctx.info.d - 0.3);
  const frame = buildHouse(sink, {
    w: W, d: D, plinth: null, storeys: [{ h: 3.3, wall: 'stone' }],
    roof: slate(44 + st.rng() * 4), gableBucket: 'stone',
    openings: [
      { face: 'front', storey: 0, kind: 'gate', u: 0, w: 2.6, y0: 0, h: 2.7 },
      { face: 'right', storey: 0, kind: 'door', u: -D * 0.25, w: 1.0, y0: 0, h: 1.95 },
      { face: 'right', storey: 0, kind: 'loft', u: D * 0.18, w: 0.55, y0: 1.9, h: 0.6 },
      { face: 'left', storey: 0, kind: 'loft', u: 0, w: 0.55, y0: 1.9, h: 0.6 },
    ],
    chimneys: [], gutters: null, verge: null, reveal: 0.36,
  }, dialect({ ...st, litShare: 0 }));
  gableParapets(sink, frame, 0, st.rng);
  // the loft door high in the street gable and its granite lintel
  const f = frame.faces.front;
  faceBox(sink, 'structureWood', f, 0, 3.75, 0.02, 1.0, 1.1, 0.05, { colour: shade(st.paint, 0.7), decor: true });
  faceBox(sink, 'stone', f, 0, 4.45, 0.05, 1.5, 0.28, 0.12, { decor: true });
  quoins(sink, frame);
  return sink.finish();
};

/** A small granite outbuilding (the base granary's footprint). */
const granary: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = { ...stateFor(ctx), wall: 'stone' as RegionalBucket };
  const W = Math.max(3.4, ctx.info.w - 0.6), D = Math.max(4.2, ctx.info.d - 1.6);
  const frame = buildHouse(sink, {
    w: W, d: D, plinth: null, storeys: [{ h: 2.5, wall: 'stone' }], roof: slate(48), gableBucket: 'stone',
    openings: [{ face: 'front', storey: 0, kind: 'door', u: 0, w: 0.9, y0: 0, h: 1.9 }], chimneys: [], gutters: null, verge: null,
  }, dialect({ ...st, litShare: 0 }));
  gableParapets(sink, frame, 0, st.rng);
  return sink.finish();
};

/** The chapel: granite nave, slate roof, a pierced bell gable on the west front, a porch door. */
const chapel: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = { ...stateFor(ctx), wall: 'stone' as RegionalBucket };
  const W = Math.max(5.2, ctx.info.w - 0.4), D = Math.max(7.6, ctx.info.d - 0.4);
  const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'door', u: 0, w: 1.2, y0: 0, h: 2.4 }];
  for (const face of ['right', 'left'] as const) for (const u of [-D * 0.22, D * 0.22]) openings.push({ face, storey: 0, kind: 'window', u, w: 0.7, y0: 1.5, h: 1.7 });
  const frame = buildHouse(sink, {
    w: W, d: D, plinth: { h: 0.25, out: 0.05, bucket: 'stone' }, storeys: [{ h: 3.8, wall: 'stone' }], roof: slate(52),
    gableBucket: 'stone', openings, chimneys: [], gutters: null, verge: null, reveal: 0.4,
  }, {
    ...dialect(st),
    window: (s, face, o, y0) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, {
      frame: rgb(0x3a3936), frameWidth: 0.05, frameOut: 0.04, bars: 'six',
      surround: { bucket: 'stone', width: 0.22, out: 0.08, lintel: 0.3 }, sill: { bucket: 'stone', out: 0.12 }, shutters: null,
    }, st.rng, 0.2),
  });
  gableParapets(sink, frame, 0, st.rng);
  // the pierced bell gable: a wall slab over the west gable with an arched opening and a bell, a cross on top
  const rg = frame.roof, z = frame.bodies[0].z1 - 0.25;
  const top = rg.ridgeTopY;
  sink.span('stone', -0.95, top - 0.6, z - 0.22, -0.3, top + 1.9, z + 0.22);
  sink.span('stone', 0.3, top - 0.6, z - 0.22, 0.95, top + 1.9, z + 0.22);
  sink.span('stone', -0.95, top + 1.9, z - 0.25, 0.95, top + 2.25, z + 0.25);
  sink.cylinder('dark', [0, top + 0.95, z], 'y', 0.5, 0.26, 8, { decor: true }, 0.12);
  sink.span('dark', -0.05, top + 2.25, z - 0.05, 0.05, top + 3.0, z + 0.05, { decor: true });
  sink.span('dark', -0.28, top + 2.6, z - 0.05, 0.28, top + 2.7, z + 0.05, { decor: true });
  quoins(sink, frame);
  return sink.finish();
};

/** A granite roofless ruin with one gable standing to its stack. */
const ruin: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const W = Math.max(5.4, ctx.info.w - 0.3), D = Math.max(7.4, ctx.info.d - 0.3);
  const t = 0.55;
  // the long walls and the back gable broken down to their lower courses, their heads in slopes, a gap or two
  const lows: Face[] = [
    { origin: [W / 2, 0, 0], u: [0, 0, -1], out: [1, 0, 0], width: D - t },
    { origin: [-W / 2, 0, 0], u: [0, 0, 1], out: [-1, 0, 0], width: D - t },
    { origin: [0, 0, -D / 2], u: [-1, 0, 0], out: [0, 0, -1], width: W - 2 * t },
  ];
  for (const face of lows) {
    const L = face.width, n = 6;
    const tops = Array.from({ length: n + 1 }, () => 0.9 + rng() * 2.0);
    if (rng() < 0.5) tops[1 + Math.floor(rng() * (n - 2))] = 0.3;
    for (let k = 0; k < n; k++) {
      const a = -L / 2 + L * k / n, b = -L / 2 + L * (k + 1) / n;
      wallPolygon(sink, 'stone', face, [[a, -0.3], [b, -0.3], [b, tops[k + 1]], [a, tops[k]]], t);
    }
  }
  // the standing gable with its stack
  const face: Face = { origin: [0, 0, D / 2], u: [1, 0, 0], out: [0, 0, 1], width: W };
  wallPolygon(sink, 'stone', face, [[-W / 2, -0.3], [W / 2, -0.3], [W / 2, 2.8], [0.6, 2.8 + (W / 2 - 0.6) * 1.1], [-0.6, 2.8 + (W / 2 - 0.6) * 1.1], [-W / 2, 2.8]], t);
  const ridge = 2.8 + (W / 2 - 0.6) * 1.1;
  sink.span('stone', -0.5, 2.5, D / 2 - t, 0.5, ridge + 1.2, D / 2);
  sink.span('dark', -0.45, 1.0, D / 2 - t - 0.02, 0.45, 2.1, D / 2 + 0.02, { decor: true });
  sink.span('stone', -W * 0.3, -0.2, -D * 0.2, W * 0.25, 0.8, D * 0.25, { decor: true });
  sink.span('roof', -W * 0.2, 0.75, -D * 0.1, W * 0.15, 0.95, D * 0.12, { decor: true });
  return sink.finish();
};

/** A granite tower with a slate pyramid cap (the base tower's footprint). */
const tower: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const S = Math.max(3.2, Math.min(ctx.info.w, ctx.info.d) - 0.4), H = Math.max(6.8, ctx.info.h - 2.4);
  sink.span('stone', -S / 2 - 0.15, -0.4, -S / 2 - 0.15, S / 2 + 0.15, 0.5, S / 2 + 0.15);
  sink.span('stone', -S / 2, 0.5, -S / 2, S / 2, H, S / 2);
  sink.span('stone', -S / 2 - 0.12, H - 0.1, -S / 2 - 0.12, S / 2 + 0.12, H + 0.15, S / 2 + 0.12);
  sink.cylinder('roof', [0, H + 0.15, 0], 'y', S * 0.95, S * 0.74, 4, {}, 0.04, true, Math.PI / 4);
  const st = stateFor(ctx);
  for (const [face, k] of [[{ origin: [0, 0, S / 2], u: [1, 0, 0], out: [0, 0, 1], width: S } as Face, 0], [{ origin: [S / 2, 0, 0], u: [0, 0, -1], out: [1, 0, 0], width: S } as Face, 1]] as const) {
    windowUnit(sink, face, 0, H - 2.2, 0.5, 1.0, { ...st.window, shutters: null }, st.rng, 0.3);
    if (k === 0) doorUnit(sink, face, 0, 0.5, 0.95, 2.0, { leaf: st.paint, frame: { bucket: 'stone', width: 0.24, out: 0.06 }, steps: { bucket: 'stone' }, leafKind: 'plank' }, 0.5);
  }
  return sink.finish();
};

/** A granite boathouse with a slate roof and a wide timber door to the slip. */
const boathouse: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = { ...stateFor(ctx), wall: 'stone' as RegionalBucket };
  const W = Math.max(5.5, Math.min(8.5, ctx.info.w - 0.6)), D = Math.max(8, Math.min(13, ctx.info.d - 0.6));
  const frame = buildHouse(sink, {
    w: W, d: D, plinth: null, storeys: [{ h: 3.2, wall: 'stone' }], roof: slate(45), gableBucket: 'stone',
    openings: [{ face: 'front', storey: 0, kind: 'gate', u: 0, w: Math.min(3.2, W - 1.8), y0: 0, h: 2.8 },
      { face: 'right', storey: 0, kind: 'loft', u: 0, w: 0.5, y0: 1.8, h: 0.55 }],
    chimneys: [], gutters: null, verge: null,
  }, dialect({ ...st, litShare: 0 }));
  gableParapets(sink, frame, 0, st.rng);
  return sink.finish();
};

/** The farmstead: the longère along z (door and dormers on its -x yard side, like the base porch) and a granite byre
 * wing on +x under its own slate roof. */
const farmhouse: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx);
  const rng = st.rng;
  const D = Math.max(8.4, ctx.info.d - 0.3);
  const W = Math.min(6.6, Math.max(5.8, D * 0.62));
  const wingL = Math.max(4.0, Math.min(6.0, (ctx.info.w - W) / 1.5));
  const openings: Opening[] = [{ face: 'left', storey: 0, kind: 'door', u: D * 0.12, w: 0.95, y0: 0, h: 2.05 }];
  for (const face of ['right', 'left'] as const) {
    for (const o of windowRhythm(face, 0, D, { w: 0.82, h: 1.15, sill: 0.95, spacing: 2.4, margin: 1.1, avoid: face === 'left' ? [[D * 0.12 - 0.5, D * 0.12 + 0.5]] : [[-D * 0.16 - 2.8, -D * 0.16 + 2.8]] })) openings.push(o);
  }
  const frame = buildHouse(sink, {
    w: W, d: D, plinth: { h: 0.12, out: 0.03, bucket: 'stone' }, storeys: [{ h: 2.8, wall: st.wall }], roof: slate(47 + rng() * 4),
    gableBucket: st.wall, openings, chimneys: [], gutters: null, verge: null,
  }, dialect(st));
  gableParapets(sink, frame, 2, rng);
  dormer(sink, frame, -1, -D * 0.2, st);
  if (D > 9.5) dormer(sink, frame, -1, D * 0.28, st);
  quoins(sink, frame);
  // the byre wing, ridge along x, its gable (with the cart door) toward +x
  const ww = Math.min(W * 0.78, 5.0);
  sink.placed(Math.PI / 2, W / 2 + wingL / 2 - 0.15, 0, -D * 0.16, () => {
    const wing = buildHouse(sink, {
      w: ww, d: wingL, plinth: null, storeys: [{ h: 2.5, wall: 'stone' }], roof: slate(46), gableBucket: 'stone',
      openings: [{ face: 'front', storey: 0, kind: 'gate', u: 0, w: 1.9, y0: 0, h: 2.2 },
        { face: 'right', storey: 0, kind: 'loft', u: 0.5, w: 0.5, y0: 1.6, h: 0.5 }],
      chimneys: [], gutters: null, verge: null,
    }, dialect({ ...st, wall: 'stone', litShare: 0 }));
    gableParapets(sink, wing, 0, rng);
  });
  return sink.finish();
};

/**
 * The sardine cannery (conserverie, Douarnenez, Concarneau, Audierne): a long granite hall under slate with a
 * ventilating ridge lantern, tall windows down both sides, double doors in the quay gable, and at the back the boiler
 * house under a lean-to with its tall stack (the base fishery's plot; its dock side, +z, is the quay).
 */
const cannery: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = { ...stateFor(ctx), wall: 'stone' as RegionalBucket };
  const rng = st.rng;
  const W = Math.max(7, Math.min(9.4, ctx.info.w - 7)), D = Math.max(12, Math.min(17.5, ctx.info.d - 2.5));
  const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'gate', u: 0, w: 2.6, y0: 0, h: 2.9 }];
  for (const face of ['right', 'left'] as const) {
    for (const o of windowRhythm(face, 0, D, { w: 1.0, h: 1.9, sill: 1.05, spacing: 2.3, margin: 1.2 })) openings.push(o);
  }
  openings.push({ face: 'right', storey: 0, kind: 'door', u: D * 0.38, w: 1.1, y0: 0, h: 2.2 });
  const frame = buildHouse(sink, {
    w: W, d: D, plinth: { h: 0.2, out: 0.05, bucket: 'stone' }, storeys: [{ h: 4.1, wall: 'stone' }],
    roof: slate(36 + rng() * 4), gableBucket: 'stone', openings: openings.filter((o, k, all) =>
      !all.some((q, j) => j < k && q.face === o.face && Math.abs(q.u - o.u) < (q.w + o.w) / 2 + 0.3)),
    chimneys: [], gutters: { colour: rgb(0x55595c) }, verge: null, reveal: 0.36,
  }, dialect({ ...st, window: { ...st.window, shutters: null, bars: 'six' }, litShare: 0.15 }));
  gableParapets(sink, frame, 0, rng);
  quoins(sink, frame);
  // the ridge lantern: a raised slate-roofed strip with louvred sides along the middle of the ridge
  const rg = frame.roof, len = D * 0.55, lw = 0.7, lh = 0.65, y0 = rg.ridgeTopY - 0.25;
  sink.span('dark', -lw / 2 + 0.03, y0, -len / 2, lw / 2 - 0.03, y0 + lh, len / 2, { decor: true });
  for (const side of [-1, 1]) {
    for (let z = -len / 2 + 0.1; z < len / 2; z += 0.22) {
      sink.span('structureWood', side * lw / 2 - 0.04, y0 + 0.08, z, side * lw / 2 + 0.04, y0 + lh - 0.08, z + 0.1, { colour: rgb(0x4e5154), decor: true });
    }
  }
  const lantern: RoofSpec = { kind: 'gable', pitchDeg: 36, eave: 0.12, verge: 0.06, thickness: 0.08, bucket: 'roof', ridge: 'saddle' };
  sink.placed(0, 0, 0, 0, () => emitRoof(sink, roofGeometry(lw, len, y0 + lh, lantern), { ...lantern, decor: true }));
  // the boiler house: a lean-to against the back gable (-z) and its square granite stack
  const bw = Math.min(W - 1.2, 5), bd = 3.2, bz1 = -D / 2, bz0 = bz1 - bd;
  sink.span('stone', -bw / 2, -0.3, bz0, bw / 2, 2.9, bz1 + 0.02);
  const tan = 0.32;
  sink.prism('roof', [[-bw / 2 - 0.15, 3.0, bz1 + 0.02], [bw / 2 + 0.15, 3.0, bz1 + 0.02], [bw / 2 + 0.15, 3.0 - (bd + 0.25) * tan, bz0 - 0.25],
    [-bw / 2 - 0.15, 3.0 - (bd + 0.25) * tan, bz0 - 0.25]], [0, Math.cos(Math.atan(tan)), -Math.sin(Math.atan(tan))], 0.1, {},
  { kind: 'plane', origin: [0, 3.1, bz1], u: [1, 0, 0], v: [0, -Math.sin(Math.atan(tan)), -Math.cos(Math.atan(tan))] });
  const sx = bw / 2 - 0.8, sz = (bz0 + bz1) / 2, h = 12 + rng() * 3;
  sink.span('stone', sx - 0.65, -0.3, sz - 0.65, sx + 0.65, 3.4, sz + 0.65);
  sink.cylinder('stone', [sx, 3.4, sz], 'y', h - 3.4, 0.62, 4, {}, 0.46, true, Math.PI / 4);
  sink.span('stone', sx - 0.52, h, sz - 0.52, sx + 0.52, h + 0.3, sz + 0.52, { decor: true });
  doorUnit(sink, { origin: [0, 0, bz0], u: [-1, 0, 0], out: [0, 0, -1], width: bw }, -bw * 0.2, 0, 0.95, 2.0,
    { leaf: shade(st.paint, 0.7), frame: { bucket: 'stone', width: 0.24, out: 0.06 }, steps: null, leafKind: 'plank' });
  return sink.finish();
};

export const BRETON_BUILDERS: Readonly<Record<string, RegionalBuilder>> = Object.freeze({
  cottage: (ctx) => dwelling(ctx),
  tavern: (ctx) => dwelling(ctx, { longere: false, storeys: 2 }),
  cornershop: (ctx) => dwelling(ctx, { longere: false, storeys: 2 }),
  farmhouse, barn, granary, chapel, ruin, tower,
  boatshed: boathouse,
  fishery: cannery,
});

export const BRETON_STYLE: ArchitectureStyle = Object.freeze<ArchitectureStyle>({
  id: 'breton',
  region: 'Finistère (Pays Bigouden, Cap Sizun): granite fishing villages and longère farms under slate',
  surfaces: {
    roof: { kind: 'slate', tint: [0.31, 0.32, 0.34] },
    stone: { kind: 'granite', tint: [0.58, 0.55, 0.5] },
    sourced: { plaster: true, wood: true },
  },
  builders: BRETON_BUILDERS,
  // granite greys, limewash, slates from blue-black to lichen-crusted: the Atlantic's orange-yellow lichen and damp
  weather: {
    plaster: [[1, 1, 1], [0.98, 0.98, 0.96], [1, 0.97, 0.93]],
    stone: [[1, 1, 1], [0.92, 0.92, 0.92], [1.02, 0.99, 0.95], [0.88, 0.88, 0.9]],
    roof: [[1, 1, 1], [0.9, 0.92, 0.95], [0.86, 0.88, 0.84], [1.05, 1.04, 1.02]],
    damp: 0.95, moss: 0.8, mossTint: [1.12, 1.0, 0.62],
  },
  wear: 0.25,
});

export type { Vec3 };
