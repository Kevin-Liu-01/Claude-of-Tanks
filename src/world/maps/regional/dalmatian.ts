// src/world/maps/regional/dalmatian.ts — the Dalmatian stone kit (Saltwind Narrows: a limestone harbour village on
// the Dalmatian coast, Brač and Šibenik hinterland). Two-storey houses of bare coursed limestone, some rendered in
// ochre or cream, under low canal-tile roofs that barely overhang, a stone eave course under the tiles, square stacks
// with little tile hoods; small windows in dressed limestone surrounds with louvred shutters (grilje) in green, brown
// or grey-blue; the konoba (cellar) door arched at street level and an outside stone stair (balatura) up to the living
// floor with a parapet; dry-stone shepherd huts (kažun) in the fields; stone boathouses on the quay; abandoned houses
// stand roofless with their gables.
import {
  PartSink, faceBox, facePoint, pick, rgb, shade, UV_MEMBER,
  type Face, type RegionalBucket, type RegionalParts, type Rgb,
} from './geometry.ts';
import { buildHouse, windowRhythm, type HouseDialect, type HouseFrame, type HouseSpec, type Opening } from './house.ts';
import { doorUnit, gateUnit, windowUnit, type WindowStyle } from './openings.ts';
import type { ArchitectureStyle, RegionalBuildContext, RegionalBuilder } from './types.ts';

const SHUTTERS: readonly Rgb[] = [0x557a4c, 0x416650, 0x7a5a42, 0x7890a0, 0x8e7a52].map(rgb);
const DOORS: readonly Rgb[] = [0x6e5440, 0x4f6a4e, 0x7a6048, 0x5e6c76].map(rgb);
const FRAME: readonly Rgb[] = [0xcac4b6, 0x7a634c].map(rgb);

interface DalmatianState {
  rng: () => number;
  window: WindowStyle;
  door: Rgb;
  litShare: number;
  mobile: boolean;
}

function stateFor(ctx: RegionalBuildContext): DalmatianState {
  const rng = ctx.rng;
  const shutter = pick(rng, SHUTTERS);
  return {
    rng,
    door: pick(rng, DOORS),
    window: {
      frame: pick(rng, FRAME), frameWidth: 0.06, frameOut: 0.05, bars: rng() < 0.7 ? 'two' : 'six',
      surround: { bucket: 'stone', width: 0.17, out: 0.07, lintel: 0.22 }, sill: { bucket: 'stone', out: 0.12 },
      shutters: { colour: shade(shutter, 0.85 + rng() * 0.3), kind: 'louvred', closed: 0.3 },
    },
    litShare: 0.35,
    mobile: ctx.tier === 'mobile',
  };
}

function dialect(st: DalmatianState): HouseDialect {
  return {
    window: (sink, face, o, y0) => windowUnit(sink, face, o.u, y0 + o.y0, o.w, o.h,
      o.kind === 'loft' ? { ...st.window, shutters: null, bars: 'none' } : st.window, st.rng, o.kind === 'loft' ? 0 : st.litShare),
    door: (sink, face, o, y0, frame) => {
      if (o.kind === 'gate') {
        gateUnit(sink, face, o.u, y0 + o.y0, o.w, o.h, shade(st.door, 0.9), { bucket: 'stone', width: 0.24, out: 0.08 });
        return;
      }
      const ground = o.storey === 0;
      doorUnit(sink, face, o.u, y0 + o.y0, o.w, o.h, {
        leaf: st.door, frame: { bucket: 'stone', width: 0.2, out: 0.08, arch: ground && o.w > 1.1 },
        steps: ground ? { bucket: 'stone' } : null, leafKind: ground ? 'plank' : 'panel', transom: false,
      }, frame.floors[o.storey] + o.y0);
    },
  };
}

function uvOffset(ctx: RegionalBuildContext): [number, number] {
  return [ctx.rng() * 7.31, ctx.rng() * 5.17];
}

/** The stone eave course under both eaves: a band of slabs carrying the tile edge. */
function eaveCourse(sink: PartSink, frame: HouseFrame): void {
  const b = frame.bodies[frame.bodies.length - 1];
  const y = frame.eaveY;
  for (const side of [-1, 1]) {
    const x = side > 0 ? b.x1 : b.x0;
    sink.span('stone', Math.min(x, x + side * 0.2), y - 0.16, b.z0 - 0.06, Math.max(x, x + side * 0.2), y, b.z1 + 0.06);
  }
}

/** The outside stair (balatura) on a side face up to the living floor, its landing and parapet. */
function balatura(sink: PartSink, face: Face, uDoor: number, floorY: number, dir: 1 | -1): void {
  const width = 0.95, land = 1.2;
  const room = dir > 0 ? uDoor - land / 2 + face.width / 2 - 0.15 : face.width / 2 - uDoor - land / 2 - 0.15;
  const run = Math.max(1.8, Math.min(floorY / 0.18 * 0.28, room));
  const u0 = uDoor - dir * (land / 2 + run);
  // landing in front of the door
  faceBox(sink, 'stone', face, uDoor, floorY / 2 - 0.2, width / 2, land, floorY + 0.4, width);
  // the stair: one solid wedge under the flight (its collision is a ramp), the treads dressed on top of it
  const uEnd = uDoor - dir * land / 2;
  const wedge: Array<[number, number]> = dir > 0
    ? [[u0, -0.3], [uEnd, -0.3], [uEnd, floorY - 0.12], [u0, 0.05]]
    : [[uEnd, -0.3], [u0, -0.3], [u0, 0.05], [uEnd, floorY - 0.12]];
  // the profile is counter-clockwise seen from outside; prism() wants it counter-clockwise seen from the wall side
  const pts = wedge.map(([u, y]) => facePoint(face, u, y, width)).reverse();
  // prism(): points ccw seen from +dir; extrude from the outer edge back to the wall
  sink.prism('stone', pts, [-face.out[0], -face.out[1], -face.out[2]], width);
  const steps = Math.max(5, Math.round(floorY / 0.19));
  for (let k = 0; k < steps; k++) {
    const top = floorY * (k + 1) / steps;
    const a = u0 + dir * run * k / steps, b = u0 + dir * run * (k + 1) / steps;
    faceBox(sink, 'stone', face, (a + b) / 2, top - 0.09, width / 2, Math.abs(b - a) + 0.004, 0.18, width, { decor: true });
  }
  // the parapet: a sloped coping along the stair's open side and a low wall round the landing
  const edge = width - 0.2;
  const a = facePoint(face, u0 + dir * 0.2, 0.55, edge), b = facePoint(face, uDoor - dir * land / 2, floorY + 0.5, edge);
  sink.member('stone', a, b, 0.8, 0.2, face.out, { decor: true, exposed: true }, 0);
  faceBox(sink, 'stone', face, uDoor, floorY + 0.45, width - 0.1, land, 0.9, 0.2, { decor: true });
}

/** The Dalmatian dwelling: konoba below, living floor above reached by the outside stair. */
function dwelling(ctx: RegionalBuildContext, opts: { storeys?: number; shop?: boolean; tavern?: boolean; render?: boolean } = {}): RegionalParts {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx);
  const rng = st.rng;
  const stairSide = !opts.shop && !opts.tavern && rng() < 0.7;
  const W0 = Math.max(5.2, ctx.info.w - 0.3), D = Math.max(6.6, ctx.info.d - 0.3);
  const W = stairSide ? Math.max(4.6, W0 - 1.05) : W0;
  const shiftX = stairSide ? -(W0 - W) / 2 : 0;
  const count = opts.storeys ?? (rng() < 0.25 ? 3 : 2);
  const rendered = opts.render ?? (ctx.wallBucket !== 'stone');
  const upper: RegionalBucket = rendered ? (ctx.wallBucket === 'stone' ? 'plaster' : ctx.wallBucket as RegionalBucket) : 'stone';
  const sts: HouseSpec['storeys'] = [];
  for (let i = 0; i < count; i++) sts.push({ h: i === 0 ? 2.75 + rng() * 0.2 : 2.65 + rng() * 0.2, wall: i === 0 && rendered && rng() < 0.5 ? 'stone' : upper });
  const openings: Opening[] = [];
  // the konoba door in the street gable, the living floor's windows above it
  openings.push({ face: 'front', storey: 0, kind: 'door', u: (rng() - 0.5) * W * 0.25, w: opts.shop ? 1.6 : 1.25, y0: 0, h: opts.shop ? 2.5 : 2.3 });
  if (opts.shop) openings.push({ face: 'front', storey: 0, kind: 'window', u: W * 0.3, w: 1.2, y0: 0.7, h: 1.5 });
  if (stairSide) openings.push({ face: 'right', storey: 1, kind: 'door', u: D * 0.26, w: 0.95, y0: 0, h: 2.1 });
  else if (count > 1) openings.push({ face: 'back', storey: 0, kind: 'door', u: 0, w: 0.95, y0: 0, h: 2.1 });
  sts.forEach((_storey, i) => {
    for (const face of ['front', 'right', 'back', 'left'] as const) {
      const width = face === 'front' || face === 'back' ? W : D;
      const avoid: Array<[number, number]> = openings.filter((o) => o.face === face && o.storey === i).map((o) => [o.u - o.w / 2, o.u + o.w / 2]);
      // small windows, wide piers: the thick-walled rhythm of a stone house
      const ground = i === 0;
      const spacing = face === 'front' ? 2.1 : 2.7;
      for (const o of windowRhythm(face, i, width, { w: ground ? 0.6 : 0.78, h: ground ? 0.75 : 1.2, sill: ground ? 1.45 : 0.85, spacing, margin: 1.0, avoid, max: face === 'front' ? 3 : 4 })) {
        if (face === 'left' && rng() < 0.35) continue;
        openings.push(o);
      }
    }
  });
  const spec: HouseSpec = {
    w: W, d: D, plinth: { h: 0.18, out: 0.04, bucket: 'stone' }, storeys: sts,
    roof: { kind: 'gable', pitchDeg: 19 + rng() * 6, eave: 0.22, verge: 0.08, thickness: 0.15, bucket: 'roof', ridge: 'round' },
    gableBucket: upper, openings,
    chimneys: [{ x: (rng() < 0.5 ? -1 : 1) * W * 0.18, z: (rng() < 0.5 ? -1 : 1) * (D / 2 - 0.55), sx: 0.62, sz: 0.62, above: 0.85, bucket: 'stone', cap: 'tile' }],
    gutters: null, verge: null,
  };
  sink.placed(0, shiftX, 0, 0, () => {
    const frame = buildHouse(sink, spec, dialect(st));
    eaveCourse(sink, frame);
    if (stairSide) balatura(sink, frame.faces.right, D * 0.26, frame.floors[1], 1);
    if (opts.tavern) {
      // a vine pergola (odrina) on posts before the street gable
      const f = frame.faces.front, timber = rgb(0x6a5440);
      for (const u of [-W / 2 + 0.4, 0, W / 2 - 0.4]) faceBox(sink, 'structureWood', f, u, 1.25, 2.6, 0.14, 2.5, 0.14, { colour: timber });
      for (let u = -W / 2 + 0.2; u <= W / 2 - 0.2; u += 0.55) faceBox(sink, 'structureWood', f, u, 2.56, 1.45, 0.09, 0.09, 2.9, { colour: timber, decor: true, uv: UV_MEMBER });
      faceBox(sink, 'structureWood', f, 0, 2.48, 2.6, W, 0.1, 0.12, { colour: timber, decor: true, uv: UV_MEMBER });
    }
  });
  return sink.finish();
}

/** The farmhouse: a stone house with a lower stone stable wing under a lean-to, and a walled yard gate. */
const farmhouse: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx);
  const rng = st.rng;
  const D = Math.max(8.0, ctx.info.d - 0.3);
  const W = Math.min(7.2, Math.max(6.0, D * 0.72));
  const wingL = Math.max(4.0, Math.min(5.6, (ctx.info.w - W) / 1.6));
  const sts: HouseSpec['storeys'] = [{ h: 2.8, wall: 'stone' }, { h: 2.7, wall: 'stone' }];
  const openings: Opening[] = [
    { face: 'left', storey: 0, kind: 'door', u: D * 0.12, w: 1.3, y0: 0, h: 2.3 },
    { face: 'left', storey: 1, kind: 'window', u: D * 0.12, w: 0.78, y0: 0.85, h: 1.2 },
  ];
  for (const o of windowRhythm('left', 1, D, { w: 0.78, h: 1.2, sill: 0.85, spacing: 2.6, margin: 1.0, avoid: [[D * 0.12 - 0.6, D * 0.12 + 0.6]] })) openings.push(o);
  for (const face of ['front', 'back'] as const) for (const i of [0, 1]) for (const o of windowRhythm(face, i, W, { w: i ? 0.78 : 0.6, h: i ? 1.2 : 0.75, sill: i ? 0.85 : 1.45, spacing: 2.2, margin: 1.0 })) openings.push(o);
  const frame = buildHouse(sink, {
    w: W, d: D, plinth: { h: 0.18, out: 0.04, bucket: 'stone' }, storeys: sts,
    roof: { kind: 'gable', pitchDeg: 20 + rng() * 5, eave: 0.22, verge: 0.08, thickness: 0.15, bucket: 'roof', ridge: 'round' },
    gableBucket: 'stone', openings,
    chimneys: [{ x: -W * 0.2, z: -(D / 2 - 0.55), sx: 0.62, sz: 0.62, above: 0.85, bucket: 'stone', cap: 'tile' }],
    gutters: null, verge: null,
  }, dialect(st));
  eaveCourse(sink, frame);
  // the stable wing on +x: one storey of rubble under a lean-to of canal tiles falling away from the house
  const ww = Math.min(W * 0.7, 5.0);
  const wx0 = W / 2, wx1 = W / 2 + wingL, wz = -D * 0.16;
  const wallH = 2.5, wallLo = 2.1;
  sink.span('stone', wx0 - 0.02, -0.3, wz - ww / 2, wx1, wallLo, wz + ww / 2);
  sink.span('stone', wx0 - 0.02, wallLo, wz - ww / 2, wx0 + 0.6, wallH, wz + ww / 2);
  const lean = { eave: 0.25, verge: 0.12 };
  const leanFace: Face = { origin: [wx1, 0, wz], u: [0, 0, -1], out: [1, 0, 0], width: ww };
  doorUnit(sink, leanFace, 0, 0, 1.4, 1.9, { leaf: shade(st.door, 0.9), frame: { bucket: 'stone', width: 0.2, out: 0.08 }, steps: null, leafKind: 'plank' });
  const roofLen = wingL + 0.2;
  const tan = (wallH + 0.15 - wallLo) / roofLen;
  // the lean-to slab as a sloped prism from the house wall down to the outer wall
  const t = 0.14, zA = wz - ww / 2 - lean.verge, zB = wz + ww / 2 + lean.verge;
  const yHi = wallH + 0.12, yLo = wallLo - lean.eave * tan;
  const xLo = wx1 + lean.eave;
  sink.prism('roof', [[wx0, yHi, zA], [wx0, yHi, zB], [xLo, yLo, zB], [xLo, yLo, zA]], normalizeUp(tan), t, {},
    { kind: 'plane', origin: [wx0, yHi + t, 0], u: [0, 0, 1], v: normalizeDown(tan) });
  return sink.finish();
};

function normalizeUp(tan: number): [number, number, number] {
  const l = Math.hypot(tan, 1);
  return [tan / l, 1 / l, 0];
}
function normalizeDown(tan: number): [number, number, number] {
  const l = Math.hypot(1, tan);
  return [1 / l, -tan / l, 0];
}

/** A stone storehouse with a loading quay on +x (the base depot's footprint). */
const depot: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx);
  const pw = 2.6;
  const W = Math.max(5.8, Math.min(7.0, ctx.bounds.maxX - ctx.bounds.minX - pw - 1.4));
  const D = Math.max(14, ctx.info.d - 2.6);
  const cx = ctx.bounds.minX + 0.15 + W / 2;
  const openings: Opening[] = [];
  for (let k = 0, n = Math.max(2, Math.round(D / 4.6)); k < n; k++) {
    const u = -D / 2 + (k + 0.5) * (D / n);
    openings.push(k % 2 === 0 ? { face: 'right', storey: 0, kind: 'gate', u, w: 1.9, y0: 0, h: 2.5 }
      : { face: 'right', storey: 0, kind: 'window', u, w: 0.7, y0: 1.8, h: 0.8 });
  }
  openings.push({ face: 'front', storey: 0, kind: 'gate', u: 0, w: 2.4, y0: 0, h: 2.8 });
  sink.placed(0, cx, 0, 0, () => {
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: 0.2, out: 0.04, bucket: 'stone' }, storeys: [{ h: 4.2, wall: 'stone' }],
      roof: { kind: 'gable', pitchDeg: 21, eave: 0.25, verge: 0.1, thickness: 0.15, bucket: 'roof', ridge: 'round' },
      gableBucket: 'stone', openings, chimneys: [], gutters: null, verge: null,
    }, dialect({ ...st, litShare: 0.05 }));
    eaveCourse(sink, frame);
  });
  // the quay: a stone platform along +x with bollards
  const px0 = cx + W / 2;
  sink.span('stone', px0, -0.4, -D / 2 - 0.4, px0 + pw, 0.7, D / 2 + 0.4);
  for (let z = -D / 2 + 1; z < D / 2; z += 4) sink.cylinder('stone', [px0 + pw - 0.45, 0.7, z], 'y', 0.6, 0.22, 8, { decor: true }, 0.18);
  return sink.finish();
};

/** A small stone storehouse (no staddles on the coast): one storey, a low tiled roof. */
const granary: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx);
  const W = Math.max(3.4, ctx.info.w - 0.6), D = Math.max(4.2, ctx.info.d - 1.6);
  const frame = buildHouse(sink, {
    w: W, d: D, plinth: null, storeys: [{ h: 2.6, wall: 'stone' }],
    roof: { kind: 'gable', pitchDeg: 22, eave: 0.18, verge: 0.06, thickness: 0.14, bucket: 'roof', ridge: 'round' },
    gableBucket: 'stone', openings: [{ face: 'front', storey: 0, kind: 'door', u: 0, w: 0.95, y0: 0, h: 1.95 },
      { face: 'right', storey: 0, kind: 'loft', u: 0, w: 0.4, y0: 1.6, h: 0.4 }],
    chimneys: [], gutters: null, verge: null,
  }, dialect({ ...st, litShare: 0 }));
  eaveCourse(sink, frame);
  return sink.finish();
};

/** The kažun: a round dry-stone field hut with a corbelled stone cone and a low door (open to +x). */
const kazun: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const R = Math.max(1.7, Math.min(2.3, Math.min(ctx.info.w, ctx.info.d) / 2 - 0.2));
  const wallH = 1.9 + rng() * 0.3;
  sink.cylinder('stone', [0, -0.3, 0], 'y', wallH + 0.3, R, 14, {}, R * 0.97);
  // the corbelled cone: stepped rings, each a little smaller, capped by a flat slab
  let r = R * 0.98, y = wallH;
  for (let k = 0; k < 6; k++) {
    const h = 0.42, r1 = r * 0.82;
    sink.cylinder('stone', [0, y, 0], 'y', h, r, 14, {}, r1);
    y += h; r = r1 * 0.97;
  }
  sink.cylinder('stone', [0, y, 0], 'y', 0.14, r + 0.08, 10, {});
  // the doorway: lintel slab and two jamb stones, the opening dark
  const face: Face = { origin: [R - 0.02, 0, 0], u: [0, 0, -1], out: [1, 0, 0], width: 1.2 };
  faceBox(sink, 'dark', face, 0, 0.75, 0.01, 0.62, 1.5, 0.02, { decor: true });
  faceBox(sink, 'stone', face, 0, 1.6, 0.12, 1.05, 0.22, 0.32);
  for (const side of [-1, 1]) faceBox(sink, 'stone', face, side * 0.43, 0.78, 0.1, 0.22, 1.6, 0.26, { decor: true });
  return sink.finish();
};

/** A stone boathouse: a big round-arched opening to the water, rubble walls, a low tiled roof. */
const boathouse: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx);
  const W = Math.max(5.5, Math.min(8.5, ctx.info.w - 0.6)), D = Math.max(8, Math.min(13, ctx.info.d - 0.6));
  const frame = buildHouse(sink, {
    w: W, d: D, plinth: null, storeys: [{ h: 3.4, wall: 'stone' }],
    roof: { kind: 'gable', pitchDeg: 22, eave: 0.2, verge: 0.08, thickness: 0.15, bucket: 'roof', ridge: 'round' },
    gableBucket: 'stone', openings: [
      { face: 'front', storey: 0, kind: 'gate', u: 0, w: Math.min(3.4, W - 1.6), y0: 0, h: 2.9 },
      { face: 'right', storey: 0, kind: 'window', u: 0, w: 0.5, y0: 1.9, h: 0.6 },
      { face: 'left', storey: 0, kind: 'window', u: 0, w: 0.5, y0: 1.9, h: 0.6 },
    ],
    chimneys: [], gutters: null, verge: null,
  }, dialect({ ...st, litShare: 0 }));
  eaveCourse(sink, frame);
  // the arch voussoirs over the gate read as a stone ring
  const f = frame.faces.front, gw = Math.min(3.4, W - 1.6);
  for (let k = 0; k <= 8; k++) {
    const a = Math.PI * k / 8;
    faceBox(sink, 'stone', f, Math.cos(a) * (gw / 2 + 0.12), 2.9 + Math.sin(a) * 0.55, 0.06, 0.34, 0.3, 0.14, { decor: true });
  }
  return sink.finish();
};

/** An abandoned house: the stone shell standing to its gables, window holes, the roof fallen in. */
const ruin: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const W = Math.max(5.4, ctx.info.w - 0.3), D = Math.max(7.4, ctx.info.d - 0.3);
  const t = 0.5, H1 = 5.2;
  const walls: Array<{ x0: number; x1: number; z0: number; z1: number; gable: boolean }> = [
    { x0: -W / 2, x1: W / 2, z0: D / 2 - t, z1: D / 2, gable: true },
    { x0: -W / 2, x1: W / 2, z0: -D / 2, z1: -D / 2 + t, gable: true },
    { x0: -W / 2, x1: -W / 2 + t, z0: -D / 2 + t, z1: D / 2 - t, gable: false },
    { x0: W / 2 - t, x1: W / 2, z0: -D / 2 + t, z1: D / 2 - t, gable: false },
  ];
  for (const wl of walls) {
    const alongX = wl.gable;
    const len = alongX ? wl.x1 - wl.x0 : wl.z1 - wl.z0;
    const n = 4;
    for (let k = 0; k < n; k++) {
      const a = k / n, b = (k + 1) / n;
      const mid = Math.abs((a + b) / 2 - 0.5);
      let top = H1 * (0.55 + rng() * 0.45);
      if (wl.gable) top = Math.max(top, H1 + (0.5 - mid) * W * 0.36 * (rng() < 0.6 ? 1 : 0.4));
      if (rng() < 0.12) top *= 0.4;
      if (alongX) sink.span('stone', wl.x0 + len * a, -0.3, wl.z0, wl.x0 + len * b, top, wl.z1);
      else sink.span('stone', wl.x0, -0.3, wl.z0 + len * a, wl.x1, top, wl.z0 + len * b);
    }
  }
  // dark window holes through the long walls (seen from both sides: the roof is gone), a fallen heap inside
  for (const side of [-1, 1]) {
    for (const z of [-D * 0.25, D * 0.25]) {
      const x0 = side > 0 ? W / 2 - t - 0.01 : -W / 2 - 0.01, x1 = x0 + t + 0.02;
      sink.span('dark', x0, 3.1, z - 0.35, x1, 4.1, z + 0.35, { decor: true });
    }
  }
  sink.span('stone', -W * 0.3, -0.2, -D * 0.25, W * 0.3, 0.9, D * 0.2, { decor: true });
  sink.span('roof', -W * 0.25, 0.85, -D * 0.1, W * 0.2, 1.1, D * 0.15, { decor: true });
  return sink.finish();
};

export const DALMATIAN_BUILDERS: Readonly<Record<string, RegionalBuilder>> = Object.freeze({
  cottage: (ctx) => dwelling(ctx),
  tavern: (ctx) => dwelling(ctx, { storeys: 3, tavern: true }),
  cornershop: (ctx) => dwelling(ctx, { shop: true, render: true }),
  farmhouse, depot, granary, ruin,
  woodshed: kazun,
  boatshed: boathouse,
});

export const DALMATIAN_STYLE: ArchitectureStyle = Object.freeze<ArchitectureStyle>({
  id: 'dalmatian',
  region: 'Central Dalmatian coast (Brač, Šibenik hinterland): limestone villages under canal tiles',
  surfaces: {
    roof: { kind: 'canal', tint: [0.70, 0.42, 0.29] },
    stone: { kind: 'limestone', tint: [0.76, 0.73, 0.66] },
    sourced: { plaster: true, wood: true },
  },
  builders: DALMATIAN_BUILDERS,
});
