// src/world/maps/regional/dalmatian.ts — the Dalmatian stone kit (Saltwind Narrows: a limestone harbour village on
// the Dalmatian coast, Brač and Šibenik hinterland). Two-storey houses of bare coursed limestone, some rendered in
// ochre or cream, under low canal-tile roofs that barely overhang, a stone eave course under the tiles, square stacks
// with little tile hoods; small windows in dressed limestone surrounds with louvred shutters (grilje) in green, brown
// or grey-blue; the konoba (cellar) door arched at street level and an outside stone stair (balatura) up to the living
// floor with a parapet; dry-stone shepherd huts (kažun) in the fields; stone boathouses on the quay; abandoned houses
// stand roofless with their gables.
import {
  PartSink, alongPlot, faceBox, facePoint, pick, plotAxes, rgb, shade, UV_MEMBER,
  type Face, type RegionalBucket, type RegionalParts, type Rgb,
} from './geometry.ts';
import { buildHouse, emitRoof, roofGeometry, wallPolygon, windowRhythm, type HouseDialect, type HouseFrame, type HouseSpec, type Opening, type RoofSpec } from './house.ts';
import { doorUnit, gateUnit, windowUnit, type WindowStyle } from './openings.ts';
import { pottedPlant, tvAerial, wallLantern, washingLine } from './dressing.ts';
import { balconette, dressedQuoin, facadeOn, facadeRng, trimRun } from './facade.ts';
import type { ArchitectureStyle, RegionalBuildContext, RegionalBuilder } from './types.ts';

const SHUTTERS: readonly Rgb[] = [0x557a4c, 0x416650, 0x7a5a42, 0x7890a0, 0x8e7a52].map(rgb);
const DOORS: readonly Rgb[] = [0x6e5440, 0x4f6a4e, 0x7a6048, 0x5e6c76].map(rgb);
const FRAME: readonly Rgb[] = [0xcac4b6, 0x7a634c].map(rgb);
/** Share of the map's bare-stone dwellings shown rendered (2026-10-03 w2 review against Pucisca, Brac). */
const RENDER_SHARE = 0.4;

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

/**
 * A Dalmatian house's dressed stone (facade craft, desktop): a rendered house shows its corners in dressed limestone
 * quoins; a house of three storeys carries a string course over its living floor round the street gable.
 */
function dressedStone(sink: PartSink, frame: HouseFrame, rendered: boolean): void {
  const f = facadeRng();
  const b = frame.bodies[0];
  if (rendered) {
    for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]] as const) {
      const x = sx > 0 ? b.x1 : b.x0, z = sz > 0 ? b.z1 : b.z0;
      for (let y = 0.2, k = 0; y < frame.eaveY - 0.35; y += 0.36, k++) {
        const long = (k + (f() < 0.5 ? 0 : 1)) % 2 === 0, lx = long ? 0.5 : 0.28, lz = long ? 0.28 : 0.5;
        dressedQuoin(sink, 'stone', sx > 0 ? x - lx : x - 0.03, y, sz > 0 ? z - lz : z - 0.03, sx > 0 ? x + 0.03 : x + lx, y + 0.34, sz > 0 ? z + 0.03 : z + lz, sx, sz, { decor: true });
      }
    }
  }
  if (frame.floors.length >= 3) {
    const face = frame.faces.front, half = face.width / 2;
    trimRun(sink, 'stone', face, -half, half, frame.floors[2] - 0.14, [{ h: 0.08, out: 0.05 }, { h: 0.08, out: 0.09 }], { ret: 0.3 });
  }
  // a balconette on the living floor's street windows of half the houses: a stone slab on corbels, an iron railing
  if (frame.floors.length >= 2 && f() < 0.5) {
    const iron: Rgb = [0.06, 0.07, 0.07];
    const upper = frame.spec.openings.filter((o) => o.face === 'front' && o.storey >= 1 && o.kind === 'window' && !o.state);
    const pick = upper.length ? upper[Math.floor(f() * upper.length)] : null;
    if (pick) balconette(sink, frame.faces.front, pick.u, frame.floors[pick.storey] + pick.y0, pick.w, 'stone', iron);
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
  // Brac and the Sibenik villages: besides the houses the map renders, a share of the bare-stone ones carry a pale lime
  // render over the rubble core, the dressed surrounds left bare (the look-only stream: geometry and build stream as before)
  const shareRendered = opts.render === undefined && ctx.wallBucket === 'stone' && ctx.variant() < RENDER_SHARE;
  const rendered = opts.render ?? (ctx.wallBucket !== 'stone' || shareRendered);
  const upper: RegionalBucket = rendered ? (ctx.wallBucket === 'stone' ? 'plaster' : ctx.wallBucket as RegionalBucket) : 'stone';
  const sts: HouseSpec['storeys'] = [];
  for (let i = 0; i < count; i++) {
    const h = i === 0 ? 2.75 + rng() * 0.2 : 2.65 + rng() * 0.2;
    // a rendered house often keeps its konoba storey in bare stone
    sts.push({ h, wall: i === 0 && rendered && (shareRendered ? ctx.variant() : rng()) < 0.5 ? 'stone' : upper });
  }
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
    gutters: null, verge: null, reveal: 0.3,
  };
  // the lived-in dressing, drawn before the phones leave it out: an aerial, a washing line, pots up the stair
  const aerial = rng() < 0.5, aerialZ = (rng() - 0.5) * D * 0.4, wash = rng() < 0.45 && count > 1, pots = rng() < 0.7, lantern = rng() < 0.4;
  sink.placed(0, shiftX, 0, 0, () => {
    const frame = buildHouse(sink, spec, dialect(st));
    eaveCourse(sink, frame);
    if (stairSide) balatura(sink, frame.faces.right, D * 0.26, frame.floors[1], 1);
    if (facadeOn()) dressedStone(sink, frame, rendered);
    // (the dressing draws the build stream: a phone draws it as the desktop does, PartSink.dressing)
    sink.dressing(st.mobile, () => {
      if (aerial) tvAerial(sink, frame, aerialZ, rng);
      if (lantern) {
        const door = openings[0], f = frame.faces.front, u = door.u + (door.u > 0 ? -1 : 1) * (door.w / 2 + 0.45);
        if (Math.abs(u) + 0.3 < f.width / 2) wallLantern(sink, f, u, 2.45);
      }
      if (wash) {
        const f = frame.faces.left, y = frame.floors[1] + 2.0;
        washingLine(sink, f, -f.width / 2 + 0.6, Math.min(f.width / 2 - 0.6, -f.width / 2 + 3.6), y, rng);
      }
      if (pots && stairSide) {
        // terracotta pots on every other tread of the balatura and two on the landing
        const f = frame.faces.right, floorY = frame.floors[1], uDoor = D * 0.26;
        for (let k = 1; k < 6; k += 2) {
          const t = k / 6, p = floorY * t;
          const u = uDoor - 0.6 - (1 - t) * Math.max(1.8, Math.min(floorY / 0.18 * 0.28, D * 0.26 + D / 2 - 0.75));
          pottedPlant(sink, f.origin[0] + f.out[0] * 0.75 + f.u[0] * u, p, f.origin[2] + f.out[2] * 0.75 + f.u[2] * u, 0.32, rng);
        }
      }
    });
    if (opts.tavern) {
      // a vine trained on a trellis across the street gable over the door (an odrina on posts would stand in the
      // street: the house fills its plot)
      const f = frame.faces.front, timber = rgb(0x6a5440), leaf = rgb(0x4f6a34), look = ctx.variant;
      faceBox(sink, 'structureWood', f, 0, 2.62, 0.2, W - 0.4, 0.08, 0.08, { colour: timber, decor: true, uv: UV_MEMBER });
      for (const u of [-W / 2 + 0.4, W / 2 - 0.4]) faceBox(sink, 'structureWood', f, u, 2.62, 0.12, 0.08, 0.08, 0.24, { colour: timber, decor: true });
      // the foliage in loose clumps along the trellis, trailing down the wall either side of the door (never over a
      // window), never one even band
      const door = openings[0];
      for (let u = -W / 2 + 0.45; u <= W / 2 - 0.45; u += 0.35 + look() * 0.25) {
        const off = Math.abs(u - door.u) - door.w / 2;
        const trail = off > 0.05 && off < 0.6 && look() < 0.7, w = 0.35 + look() * 0.4, h = trail ? 0.7 + look() * 0.5 : 0.3 + look() * 0.3;
        const y = trail ? 2.55 - h / 2 : 2.66 + (look() - 0.5) * 0.24;
        faceBox(sink, 'structureWood', f, u + (look() - 0.5) * 0.15, y, 0.22 + look() * 0.12, w, h, 0.18 + look() * 0.16, { colour: shade(leaf, 0.75 + look() * 0.45), decor: true });
      }
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
    gutters: null, verge: null, reveal: 0.32,
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

/**
 * An abandoned house (the war of 1991–95 and the emigration before it): the stone shell standing to its gables, the
 * wall heads broken in slopes, not steps, a breach or two down toward the sill, window holes through the walls that
 * still stand high enough to hold them, the roof fallen in as a heap of tiles and rubble.
 */
const ruin: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const W = Math.max(5.4, ctx.info.w - 0.3), D = Math.max(7.4, ctx.info.d - 0.3);
  const t = 0.5, H1 = 5.2;
  const faces: Array<{ face: Face; gable: boolean }> = [
    { face: { origin: [0, 0, D / 2], u: [1, 0, 0], out: [0, 0, 1], width: W }, gable: true },
    { face: { origin: [0, 0, -D / 2], u: [-1, 0, 0], out: [0, 0, -1], width: W }, gable: true },
    { face: { origin: [W / 2, 0, 0], u: [0, 0, -1], out: [1, 0, 0], width: D - 2 * t }, gable: false },
    { face: { origin: [-W / 2, 0, 0], u: [0, 0, 1], out: [-1, 0, 0], width: D - 2 * t }, gable: false },
  ];
  for (const { face, gable } of faces) {
    const L = face.width, n = 8;
    // the broken head: a height at every station, the gable's slope kept on most of a gable wall
    const tops: number[] = [];
    for (let k = 0; k <= n; k++) {
      const u = -L / 2 + L * k / n, mid = Math.abs(u) / (L / 2);
      let h = H1 * (0.58 + rng() * 0.38);
      if (gable && rng() < 0.75) h = Math.max(h, H1 + (1 - mid) * W * 0.18 * (0.6 + rng() * 0.4));
      tops.push(h);
    }
    // a breach: two or three neighbouring stations down near the sill
    if (rng() < 0.6) { const k = 1 + Math.floor(rng() * (n - 2)); tops[k] = 0.8 + rng() * 0.7; tops[k + 1] = Math.min(tops[k + 1], 1.6 + rng()); }
    for (let k = 0; k < n; k++) {
      const a = -L / 2 + L * k / n, b = -L / 2 + L * (k + 1) / n;
      wallPolygon(sink, 'stone', face, [[a, -0.3], [b, -0.3], [b, tops[k + 1]], [a, tops[k]]], t);
    }
    // window holes where the wall still stands to the lintel
    if (!gable) {
      for (const u of [-L * 0.25, L * 0.25]) {
        const k = Math.min(n - 1, Math.max(0, Math.floor((u + L / 2) / (L / n))));
        if (Math.min(tops[k], tops[k + 1]) < 4.4) continue;
        faceBox(sink, 'dark', face, u, 3.6, -t / 2, 0.7, 1.0, t + 0.02, { decor: true });
      }
    }
  }
  // the fallen roof: a heap of rubble and tiles inside the shell
  sink.span('stone', -W * 0.3, -0.2, -D * 0.25, W * 0.3, 0.9, D * 0.2, { decor: true });
  sink.span('roof', -W * 0.25, 0.85, -D * 0.1, W * 0.2, 1.1, D * 0.15, { decor: true });
  return sink.finish();
};

const canalHip = (pitch: number, eave: number): RoofSpec => ({ kind: 'hip', pitchDeg: pitch, eave, verge: eave, thickness: 0.15, bucket: 'roof', ridge: 'round' });

/**
 * The fish store on the riva (magazin): two storeys of limestone under a hipped canal-tile roof, a row of arched
 * cellar doors to the quay, small square loft windows above, a hoist beam over a loading door, and the quay apron
 * with its bollards (the base fishery's dock side, +z).
 */
const fishStore: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx);
  const W = Math.max(7, Math.min(10.5, ctx.info.w - 6)), D = Math.max(10, Math.min(15, ctx.info.d - 4.6));
  const openings: Opening[] = [];
  const n = Math.max(2, Math.floor(W / 2.7));
  for (let k = 0; k < n; k++) openings.push({ face: 'front', storey: 0, kind: 'door', u: -W / 2 + (k + 0.5) * W / n, w: 1.45, y0: 0, h: 2.4 });
  openings.push({ face: 'front', storey: 1, kind: 'loft', u: 0, w: 1.1, y0: 0.15, h: 1.7 });
  for (const face of ['right', 'left', 'back'] as const) {
    const width = face === 'back' ? W : D;
    for (const o of windowRhythm(face, 0, width, { w: 0.5, h: 0.55, sill: 1.75, spacing: 2.6, margin: 1.1 })) openings.push(o);
  }
  for (const face of ['front', 'right', 'back', 'left'] as const) {
    const width = face === 'front' || face === 'back' ? W : D;
    const avoid: Array<[number, number]> = face === 'front' ? [[-0.8, 0.8]] : [];
    for (const o of windowRhythm(face, 1, width, { w: 0.62, h: 0.72, sill: 0.95, spacing: 2.3, margin: 1.0, avoid })) openings.push(o);
  }
  const frame = buildHouse(sink, {
    w: W, d: D, plinth: { h: 0.22, out: 0.05, bucket: 'stone' }, storeys: [{ h: 3.1, wall: 'stone' }, { h: 2.5, wall: 'stone' }],
    roof: canalHip(21, 0.24), openings, chimneys: [], gutters: null, verge: null, reveal: 0.32,
  }, dialect({ ...st, litShare: 0.12 }));
  eaveCourse(sink, frame);
  // the hoist beam over the loading door, its pulley block hanging from the end
  const f = frame.faces.front, top = frame.eaveY - 0.25;
  faceBox(sink, 'structureWood', f, 0, top, 0.55, 0.18, 0.2, 1.1, { colour: rgb(0x5a4632), decor: true, uv: UV_MEMBER });
  faceBox(sink, 'dark', f, 0, top - 0.32, 0.98, 0.12, 0.28, 0.1, { decor: true });
  // the quay apron to the water with three bollards
  const qz0 = D / 2, qz1 = Math.max(qz0 + 1.6, Math.min(ctx.info.d / 2 - 0.2, D / 2 + 3.2));
  sink.span('stone', -W / 2 - 1.2, -0.5, qz0, W / 2 + 1.2, 0.24, qz1);
  for (const x of [-W / 2 - 0.5, 0, W / 2 + 0.5]) sink.cylinder('stone', [x, 0.24, qz1 - 0.45], 'y', 0.55, 0.2, 8, { decor: true }, 0.15);
  return sink.finish();
};

/**
 * The loggia (loža) of the harbour square: an open arcade of limestone piers carrying a stone architrave and a hipped
 * canal-tile roof, a solid back wall with a stone bench, two steps up from the square.
 */
const loggia: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  // on a market row's plot (wider than deep) the loggia lies along it, its arcade down one long side (plotAxes)
  const plot = plotAxes(ctx.info);
  const W = Math.max(plot.turned ? 4.0 : 5.4, Math.min(8, plot.w - 0.8)), D = Math.max(8, Math.min(15, plot.d - 0.8));
  alongPlot(sink, plot.turned, () => {
    const H = 3.7, beam = 0.42, p = 0.26;
    sink.span('stone', -W / 2, -0.45, -D / 2, W / 2, 0.32, D / 2);
    faceBox(sink, 'stone', { origin: [W / 2, 0, 0], u: [0, 0, -1], out: [1, 0, 0], width: D }, 0, 0.08, 0.2, D, 0.16, 0.4, { decor: true });
    // the back wall (-x) and its bench
    sink.span('stone', -W / 2, 0.32, -D / 2, -W / 2 + 0.45, H, D / 2);
    sink.span('stone', -W / 2 + 0.45, 0.32, -D / 2 + 0.6, -W / 2 + 0.95, 0.78, D / 2 - 0.6, { decor: true });
    // the piers: along the open long side and the two ends
    const nz = Math.max(3, Math.round(D / 3));
    const piers: Array<[number, number]> = [];
    for (let k = 0; k <= nz; k++) piers.push([W / 2 - p, -D / 2 + p + (D - 2 * p) * k / nz]);
    for (const z of [-D / 2 + p, D / 2 - p]) piers.push([0.15, z]);
    for (const [x, z] of piers) {
      sink.span('stone', x - p, 0.32, z - p, x + p, H - beam, z + p);
      sink.span('stone', x - p - 0.06, H - beam - 0.16, z - p - 0.06, x + p + 0.06, H - beam, z + p + 0.06, { decor: true });
    }
    // the architrave round the open sides
    sink.span('stone', W / 2 - 2 * p - 0.04, H - beam, -D / 2, W / 2, H, D / 2);
    for (const z of [-D / 2, D / 2 - 2 * p - 0.04]) sink.span('stone', -W / 2 + 0.45, H - beam, z, W / 2 - 2 * p, H, z + 2 * p + 0.04);
    // round arches between the piers of the long side: a ring of voussoirs under the architrave
    const open: Face = { origin: [W / 2, 0, 0], u: [0, 0, -1], out: [1, 0, 0], width: D };
    for (let k = 0; k < nz; k++) {
      const za = -D / 2 + p + (D - 2 * p) * k / nz, zb = -D / 2 + p + (D - 2 * p) * (k + 1) / nz;
      const uc = -(za + zb) / 2, half = (zb - za) / 2 - p, spring = H - beam - 0.2 - half * 0.75;
      for (let a = 0; a <= 6; a++) {
        const t = Math.PI * a / 6;
        faceBox(sink, 'stone', open, uc + Math.cos(t) * half, spring + Math.sin(t) * half * 0.75, 0.04, 0.26, 0.22, 0.12, { decor: true });
      }
    }
    const roof = canalHip(22, 0.36);
    emitRoof(sink, roofGeometry(W, D, H, roof), roof);
  }, 1);
  return sink.finish();
};

/**
 * The fish market (ribarnica) on the base market plot: four limestone piers with moulded bases and caps on a stepped
 * platform, an eave course of dressed stone, a low hipped roof of canal tiles; two stone tables for the morning catch
 * under it, crates of fish on the slabs (Trogir, Hvar, Supetar).
 */
const fishMarket: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const look = ctx.variant;
  const W = Math.max(4.8, Math.min(6.4, ctx.info.w - 0.3)), D = Math.max(3.8, Math.min(5.0, ctx.info.d - 0.3));
  const floor = 0.32, top = 2.75, course = 0.3, p = 0.19;
  // the platform of dressed slabs on a step all round
  sink.span('stone', -W / 2 - 0.3, -0.3, -D / 2 - 0.3, W / 2 + 0.3, floor - 0.16, D / 2 + 0.3);
  sink.span('stone', -W / 2 - 0.02, floor - 0.16, -D / 2 - 0.02, W / 2 + 0.02, floor, D / 2 + 0.02);
  const px = W / 2 - 0.32, pz = D / 2 - 0.32;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const x = sx * px, z = sz * pz;
    sink.span('stone', x - p - 0.08, floor, z - p - 0.08, x + p + 0.08, floor + 0.24, z + p + 0.08);
    sink.span('stone', x - p, floor + 0.24, z - p, x + p, top - 0.18, z + p);
    sink.span('stone', x - p - 0.08, top - 0.18, z - p - 0.08, x + p + 0.08, top, z + p + 0.08);
  }
  // the eave course on the pier caps all round
  const e = p + 0.06;
  for (const sz of [-1, 1]) sink.span('stone', -px - e, top, sz * pz - e, px + e, top + course, sz * pz + e);
  for (const sx of [-1, 1]) sink.span('stone', sx * px - e, top, -pz + e, sx * px + e, top + course, pz - e);
  // the roof: canal tiles on four low slopes, laid along the long side
  const roof: RoofSpec = canalHip(21, 0.32);
  const along = W >= D, across = 2 * (along ? pz : px) + 2 * e, length = 2 * (along ? px : pz) + 2 * e;
  sink.placed(along ? Math.PI / 2 : 0, 0, 0, 0, () => emitRoof(sink, roofGeometry(across, length, top + course, roof), roof));
  // the tables: a limestone slab on two stone legs either side of the middle, crates of the catch on them
  const L = Math.max(2.4, 2 * px - 1.0), crate = rgb(0x8a7458), catches: readonly Rgb[] = [0x9aa4a8, 0xa8aeb0, 0x7e8a90].map(rgb);
  for (const sz of [-1, 1]) {
    const z = sz * Math.min(0.85, pz - 0.6);
    for (const sx of [-1, 1]) sink.span('stone', sx * (L / 2 - 0.35) - 0.13, floor, z - 0.26, sx * (L / 2 - 0.35) + 0.13, floor + 0.76, z + 0.26);
    sink.span('stone', -L / 2, floor + 0.76, z - 0.38, L / 2, floor + 0.88, z + 0.38);
    for (let k = 0, n = 2 + Math.floor(look() * 2); k < n; k++) {
      const x = -L / 2 + 0.45 + (L - 0.9) * k / (n - 1) + (look() - 0.5) * 0.12;
      sink.span('structureWood', x - 0.28, floor + 0.88, z - 0.19, x + 0.28, floor + 1.04, z + 0.19, { colour: shade(crate, 0.85 + look() * 0.3), decor: true });
      sink.span('structureWood', x - 0.24, floor + 1.04, z - 0.15, x + 0.24, floor + 1.08, z + 0.15, { colour: pick(look, catches), decor: true });
    }
  }
  return sink.finish();
};

/**
 * The customs house on the riva (the base bathhouse's plot): a rendered two-storey public building on a stone plinth,
 * a hipped roof, a string course and a cornice, dressed quoins, a central arched door under a stone balcony.
 */
const customsHouse: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx);
  const W = Math.max(8, Math.min(11, ctx.info.w - 0.6)), D = Math.max(7.6, Math.min(9.6, ctx.info.d - 2.2));
  const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'door', u: 0, w: 1.45, y0: 0, h: 2.75 },
    { face: 'front', storey: 1, kind: 'door', u: 0, w: 1.1, y0: 0, h: 2.3 }];
  for (const [face, width] of [['front', W], ['back', W], ['right', D], ['left', D]] as const) {
    for (const i of [0, 1]) {
      const avoid: Array<[number, number]> = face === 'front' ? [[-1.0, 1.0]] : [];
      for (const o of windowRhythm(face, i, width, { w: 0.86, h: i ? 1.55 : 1.35, sill: i ? 0.6 : 1.0, spacing: 1.95, margin: 1.05, avoid })) openings.push(o);
    }
  }
  const frame = buildHouse(sink, {
    w: W, d: D, plinth: { h: 0.5, out: 0.06, bucket: 'stone' }, storeys: [{ h: 3.6, wall: 'plaster' }, { h: 3.3, wall: 'plaster' }],
    roof: canalHip(23, 0.42), openings, gutters: null, verge: null, reveal: 0.28,
    chimneys: [{ x: -W * 0.25, z: 0, sx: 0.6, sz: 0.6, above: 0.8, bucket: 'stone', cap: 'tile' }, { x: W * 0.25, z: 0, sx: 0.6, sz: 0.6, above: 0.8, bucket: 'stone', cap: 'tile' }],
  }, dialect({ ...st, litShare: 0.3 }));
  const b0 = frame.bodies[0];
  // the string course at the floor and the cornice under the eaves, run round the four faces
  for (const [y, h, o] of [[frame.floors[1], 0.2, 0.08], [frame.eaveY - 0.26, 0.26, 0.14]] as const) {
    sink.band('stone', b0.x0 - o, y - h / 2, b0.z0 - o, b0.x1 + o, y + h / 2, b0.z1 + o, { decor: true });
  }
  // quoins: long and short dressed blocks up the four corners
  for (const [cx, cz] of [[b0.x0, b0.z0], [b0.x1, b0.z0], [b0.x0, b0.z1], [b0.x1, b0.z1]] as const) {
    // each quoin turns the corner: long on one face, short on the other, 3 cm proud of the render
    const sx = cx > 0 ? 1 : -1, sz = cz > 0 ? 1 : -1;
    for (let y = 0.5, k = 0; y < frame.eaveY - 0.5; y += 0.42, k++) {
      const lx = k % 2 ? 0.55 : 0.3, lz = k % 2 ? 0.3 : 0.55;
      dressedQuoin(sink, 'stone', cx - sx * lx, y, cz - sz * lz, cx + sx * 0.03, y + 0.36, cz + sz * 0.03, sx, sz, { decor: true });
    }
  }
  // the balcony over the door: a stone slab on two consoles, an iron railing
  const f = frame.faces.front, y1 = frame.floors[1];
  faceBox(sink, 'stone', f, 0, y1 - 0.09, 0.45, 2.1, 0.16, 0.9, { decor: true });
  for (const u of [-0.8, 0.8]) faceBox(sink, 'stone', f, u, y1 - 0.38, 0.25, 0.18, 0.42, 0.5, { decor: true });
  const iron = rgb(0x2e3032);
  faceBox(sink, 'structureMetal', f, 0, y1 + 0.93, 0.86, 2.0, 0.05, 0.05, { colour: iron, decor: true });
  for (const u of [-1, 1]) faceBox(sink, 'structureMetal', f, u * 0.98, y1 + 0.93, 0.47, 0.05, 0.05, 0.82, { colour: iron, decor: true });
  for (let u = -0.95; u <= 0.96; u += 0.13) faceBox(sink, 'structureMetal', f, u, y1 + 0.47, 0.86, 0.025, 0.9, 0.025, { colour: iron, decor: true });
  return sink.finish();
};

export const DALMATIAN_BUILDERS: Readonly<Record<string, RegionalBuilder>> = Object.freeze({
  cottage: (ctx) => dwelling(ctx),
  tavern: (ctx) => dwelling(ctx, { storeys: 3, tavern: true }),
  cornershop: (ctx) => dwelling(ctx, { shop: true, render: true }),
  farmhouse, depot, granary, ruin,
  woodshed: kazun,
  boatshed: boathouse,
  fishery: fishStore,
  marketRow: loggia,
  bathhouse: customsHouse,
  // the base market plot: the generic canvas stall becomes the fish market
  market: fishMarket,
});

export const DALMATIAN_STYLE: ArchitectureStyle = Object.freeze<ArchitectureStyle>({
  id: 'dalmatian',
  region: 'Central Dalmatian coast (Brač, Šibenik hinterland): limestone villages under canal tiles',
  surfaces: {
    roof: { kind: 'canal', tint: [0.70, 0.42, 0.29] },
    // Brac stone: near-white dressed limestone (2026-10-03 w2 review; was [0.8, 0.75, 0.64])
    stone: { kind: 'limestone', tint: [0.83, 0.79, 0.70] },
    sourced: { plaster: true, wood: true },
  },
  builders: DALMATIAN_BUILDERS,
  // sun-bleached limestone and render, canal tiles from fresh to grey-brown, a dry coast (1991–95 war damage)
  weather: {
    plaster: [[1, 1, 1], [1, 0.97, 0.92], [0.98, 0.95, 0.88], [1, 0.96, 0.94]],
    stone: [[1, 1, 1], [0.95, 0.94, 0.9], [1.03, 1.01, 0.96], [0.9, 0.89, 0.86]],
    roof: [[1, 1, 1], [0.9, 0.82, 0.74], [1.05, 0.95, 0.88], [0.84, 0.8, 0.76]],
    damp: 0.45, moss: 0.25, mossTint: [0.9, 0.88, 0.76],
  },
  wear: 0.3,
  // the yards: dry-stone walls round a kitchen garden and the stone hut (kazun), a gate (yards.ts)
  yard: { kinds: ['cottage', 'farmhouse'], fence: 'wallstone', gate: 'gate', shed: 'woodshed', shedSize: [3.8, 3.4], garden: true },
});
