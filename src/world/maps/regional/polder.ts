// src/world/maps/regional/polder.ts — the Zeeland polder kit (Tidegate Polders: the Scheldt polders of Zeeland and
// Zeeuws-Vlaanderen). Farmhouses and labourers' cottages of red-brown Waal brick under steep orange pantiles, white
// sash frames with many lights, shutters painted green with white margins, a stack at each gable; the great
// Zeeuwse schuur, a barn of black-tarred weatherboard under a towering hipped thatch with a band of pantiles at the
// eaves and white-framed doors; a thatched smock mill with its stage; brick warehouses and a café on the dike road.
import {
  PartSink, faceBox, pick, rgb, shade, UV_MEMBER,
  type Face, type RegionalParts, type Rgb, type Vec3,
} from './geometry.ts';
import { buildHouse, emitRoof, roofGeometry, windowRhythm, type HouseDialect, type HouseSpec, type Opening, type RoofSpec } from './house.ts';
import { doorUnit, gateUnit, windowUnit, type WindowStyle } from './openings.ts';
import type { ArchitectureStyle, RegionalBuildContext, RegionalBuilder } from './types.ts';

const GREENS: readonly Rgb[] = [0x2f6a46, 0x3c7a52, 0x2a5a40].map(rgb);
const WHITE = rgb(0xd6d2c8);
const TAR = rgb(0x3a3733);
const DOORS: readonly Rgb[] = [0x2f6a46, 0x6a2a24, 0x2e4a66].map(rgb);

interface PolderState {
  rng: () => number;
  green: Rgb;
  door: Rgb;
  window: WindowStyle;
  litShare: number;
}

function stateFor(ctx: RegionalBuildContext): PolderState {
  const rng = ctx.rng;
  const green = pick(rng, GREENS);
  return {
    rng, green, door: pick(rng, DOORS),
    window: {
      frame: WHITE, frameWidth: 0.08, frameOut: 0.06, bars: 'six',
      surround: null, sill: { bucket: 'stone', out: 0.1 },
      shutters: rng() < 0.75 ? { colour: green, kind: 'panel', closed: 0.12 } : null,
    },
    litShare: 0.45,
  };
}

function dialect(st: PolderState): HouseDialect {
  return {
    window: (sink, face, o, y0) => {
      windowUnit(sink, face, o.u, y0 + o.y0, o.w, o.h, o.kind === 'loft' ? { ...st.window, shutters: null, bars: 'cross' } : st.window,
        st.rng, o.kind === 'loft' ? 0.05 : st.litShare);
      // the segmental brick arch over the opening (a soldier course read)
      if (o.kind !== 'loft') faceBox(sink, 'stone', face, o.u, y0 + o.y0 + o.h + 0.11, 0.025, o.w + 0.24, 0.22, 0.05, { decor: true });
    },
    door: (sink, face, o, y0, frame) => {
      if (o.kind === 'gate') {
        gateUnit(sink, face, o.u, y0 + o.y0, o.w, o.h, st.green, { bucket: 'structureWood', width: 0.16, out: 0.06, colour: WHITE });
        return;
      }
      doorUnit(sink, face, o.u, y0 + o.y0, o.w, o.h, {
        leaf: st.door, frame: { bucket: 'structureWood', width: 0.1, out: 0.06, colour: WHITE }, transom: o.h > 2.2,
        steps: { bucket: 'stone' }, leafKind: 'panel',
      }, frame.floors[o.storey] + o.y0);
    },
  };
}

function uvOffset(ctx: RegionalBuildContext): [number, number] {
  return [ctx.rng() * 7.31, ctx.rng() * 5.17];
}

const pantiles = (pitch: number, kind: RoofSpec['kind'] = 'gable'): RoofSpec => ({
  kind, pitchDeg: pitch, eave: 0.3, verge: kind === 'hip' ? 0.3 : 0.12, thickness: 0.13, bucket: 'roof', ridge: 'round', hipFrac: 0.4,
});

/** Gable stacks: brick chimneys in the gable walls rising past the ridge (one or both ends). */
function gableStacks(sink: PartSink, rg: { ridgeTopY: number; halfD: number }, both: boolean): void {
  for (const end of both ? [1, -1] : [1]) {
    const z = end * (rg.halfD - 0.35);
    sink.span('stone', -0.4, rg.ridgeTopY - 1.4, z - 0.3, 0.4, rg.ridgeTopY + 0.85, z + 0.3);
    sink.span('stone', -0.48, rg.ridgeTopY + 0.85, z - 0.38, 0.48, rg.ridgeTopY + 1.0, z + 0.38);
  }
}

/** The labourer's cottage / farmhouse: brick, one storey and attic, gable to the road, pantiles. */
function brickHouse(ctx: RegionalBuildContext, opts: { farm?: boolean; storeys?: number } = {}): RegionalParts {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx);
  const rng = st.rng;
  const W = Math.max(5.2, ctx.info.w - 0.3), D = Math.max(7.0, ctx.info.d - 0.3);
  const count = opts.storeys ?? 1;
  const sts: HouseSpec['storeys'] = [];
  for (let i = 0; i < count; i++) sts.push({ h: i === 0 ? 2.9 : 2.6, wall: 'stone' });
  const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'door', u: opts.farm ? 0 : W * 0.22, w: 1.0, y0: 0, h: 2.15 }];
  sts.forEach((_, i) => {
    for (const face of ['front', 'right', 'left', 'back'] as const) {
      const width = face === 'front' || face === 'back' ? W : D;
      const avoid: Array<[number, number]> = openings.filter((o) => o.face === face && o.storey === i).map((o) => [o.u - o.w / 2, o.u + o.w / 2]);
      for (const o of windowRhythm(face, i, width, { w: 0.95, h: 1.35, sill: 0.8, spacing: face === 'front' ? 1.9 : 2.5, margin: 0.9, avoid, max: face === 'back' ? 2 : 4 })) openings.push(o);
    }
  });
  // the attic's two gable lights
  const roof = opts.farm ? pantiles(50 + rng() * 4, rng() < 0.6 ? 'halfhip' : 'gable') : pantiles(48 + rng() * 6);
  const frame = buildHouse(sink, {
    w: W, d: D, plinth: { h: 0.35, out: 0.04, bucket: 'stone' }, storeys: sts, roof, gableBucket: 'stone', openings,
    chimneys: [], gutters: { colour: rgb(0x7d8183) }, verge: roof.kind === 'gable' ? { colour: WHITE, bucket: 'structureWood' } : null,
  }, dialect(st));
  gableStacks(sink, frame.roof, opts.farm === true || rng() < 0.4);
  if (frame.roof.gable) {
    const g = frame.roof.gable, top = Math.max(...g.map(([, y]) => y));
    if (top - frame.eaveY > 2.0) {
      for (const name of ['front', 'back'] as const) {
        windowUnit(sink, frame.faces[name], 0, frame.eaveY + 0.55, 0.62, 0.8, { ...st.window, shutters: null }, st.rng, 0.25);
      }
    }
  }
  return sink.finish();
}

/** The Zeeuwse schuur: black-tarred weatherboard under a high hipped thatch with a pantile foot, white-framed doors. */
const schuur: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx);
  const W = Math.max(7.0, ctx.info.w - 0.3), D = Math.max(10.5, ctx.info.d - 0.3);
  const wallH = 3.2;
  sink.span('stone', -W / 2 - 0.05, -0.3, -D / 2 - 0.05, W / 2 + 0.05, 0.35, D / 2 + 0.05);
  // the boarded walls: a structural box in tar, vertical boards dressed proud of it
  sink.span('structureWood', -W / 2, 0.35, -D / 2, W / 2, 0.35 + wallH, D / 2, { colour: TAR, uv: UV_MEMBER });
  const faces: Face[] = [
    { origin: [0, 0, D / 2], u: [1, 0, 0], out: [0, 0, 1], width: W }, { origin: [W / 2, 0, 0], u: [0, 0, -1], out: [1, 0, 0], width: D },
    { origin: [0, 0, -D / 2], u: [-1, 0, 0], out: [0, 0, -1], width: W }, { origin: [-W / 2, 0, 0], u: [0, 0, 1], out: [-1, 0, 0], width: D },
  ];
  if (ctx.tier !== 'mobile') {
    for (const f of faces) for (let u = -f.width / 2 + 0.15; u < f.width / 2 - 0.1; u += 0.32) {
      faceBox(sink, 'structureWood', f, u, 0.35 + wallH / 2, 0.012, 0.09, wallH - 0.06, 0.024, { colour: shade(TAR, 1.15), decor: true, uv: UV_MEMBER });
    }
  }
  // doors: the high cart doors in the street end and a stable door on the side, framed white
  gateUnit(sink, faces[0], 0, 0.35, 3.0, 2.85, TAR, { bucket: 'structureWood', width: 0.14, out: 0.07, colour: WHITE });
  doorUnit(sink, faces[1], -D * 0.25, 0.35, 1.0, 1.9, { leaf: TAR, frame: { bucket: 'structureWood', width: 0.1, out: 0.06, colour: WHITE }, steps: null, leafKind: 'plank' });
  for (const u of [D * 0.05, D * 0.3]) windowUnit(sink, faces[1], u, 1.7, 0.7, 0.6, { ...st.window, shutters: null, bars: 'cross' }, st.rng, 0);
  // the roof: a steep hipped thatch above a pantile foot at the eaves
  const eaveY = 0.35 + wallH;
  const foot: RoofSpec = { kind: 'hip', pitchDeg: 48, eave: 0.45, verge: 0.45, thickness: 0.12, bucket: 'roof', ridge: null };
  const footG = roofGeometry(W, D, eaveY, foot);
  // pantiles cover the lowest metre: emit the hipped slab, then the thatch from a raised wall-plate line inboard
  emitRoof(sink, footG, foot);
  const inset = 1.0, thatchEave = eaveY + inset * Math.tan(48 * Math.PI / 180);
  // the thatch rides over the full tiled slab: dressing only, the tiles carry the collision
  const straw: RoofSpec = { kind: 'hip', pitchDeg: 52, eave: 0.25, verge: 0.25, thickness: 0.4, bucket: 'straw', ridge: 'round', decor: true };
  emitRoof(sink, roofGeometry(W - 2 * inset, D - 2 * inset, thatchEave, straw), straw);
  return sink.finish();
};

/** A thatched smock mill: a brick base, the octagonal thatched body, a stage on struts, the cap and four sails. */
const smockMill: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx);
  const R0 = 3.0, baseH = 2.6, bodyH = 8.2, R1 = 1.7;
  sink.cylinder('stone', [0, -0.4, 0], 'y', baseH + 0.4, R0 + 0.15, 8, {}, R0, true, Math.PI / 8);
  sink.cylinder('straw', [0, baseH, 0], 'y', bodyH, R0 - 0.05, 8, {}, R1, true, Math.PI / 8);
  // the stage at the base's top: a timber deck ring on struts and a rail
  const stageY = baseH + 0.1, sr = R0 + 1.5;
  for (let k = 0; k < 8; k++) {
    const a0 = (k + 0.5) / 8 * Math.PI * 2, a1 = (k + 1.5) / 8 * Math.PI * 2;
    const p0: Vec3 = [Math.cos(a0) * sr, stageY, Math.sin(a0) * sr], p1: Vec3 = [Math.cos(a1) * sr, stageY, Math.sin(a1) * sr];
    sink.member('structureWood', p0, p1, 0.16, 0.16, [0, 1, 0], { colour: TAR, decor: true, exposed: true });
    sink.member('structureWood', [p0[0], stageY + 1.0, p0[2]], [p1[0], stageY + 1.0, p1[2]], 0.08, 0.08, [0, 1, 0], { colour: WHITE, decor: true, exposed: true });
    sink.member('structureWood', [Math.cos(a0) * (R0 - 0.1), stageY - 1.6, Math.sin(a0) * (R0 - 0.1)], p0, 0.14, 0.14, [-Math.sin(a0), 0, Math.cos(a0)], { colour: TAR, decor: true, exposed: true });
    sink.member('structureWood', p0, [p0[0], stageY + 1.0, p0[2]], 0.08, 0.08, [Math.cos(a0), 0, Math.sin(a0)], { colour: WHITE, decor: true, exposed: true });
  }
  // the deck: a thin ring of planks as a flat octagon annulus (eight trapezoids)
  for (let k = 0; k < 8; k++) {
    const a0 = (k + 0.5) / 8 * Math.PI * 2, a1 = (k + 1.5) / 8 * Math.PI * 2;
    const V = (x: number, y: number, z: number): Vec3 => [x, y, z];
    const pts: Vec3[] = [V(Math.cos(a0) * sr, stageY + 0.08, Math.sin(a0) * sr), V(Math.cos(a1) * sr, stageY + 0.08, Math.sin(a1) * sr),
      V(Math.cos(a1) * (R0 + 0.05), stageY + 0.08, Math.sin(a1) * (R0 + 0.05)), V(Math.cos(a0) * (R0 + 0.05), stageY + 0.08, Math.sin(a0) * (R0 + 0.05))];
    sink.prism('structureWood', pts, [0, -1, 0], 0.08, { colour: TAR, decor: true });
  }
  // the cap: a boat-shaped thatched hood
  const capY = baseH + bodyH;
  const cap: RoofSpec = { kind: 'gable', pitchDeg: 55, eave: 0.3, verge: 0.4, thickness: 0.25, bucket: 'straw', ridge: 'round' };
  emitRoof(sink, roofGeometry(R1 * 2.1, R1 * 2.4, capY, cap), cap);
  sink.cylinder('structureWood', [0, capY - 0.2, 0], 'y', 0.4, R1 + 0.05, 8, { colour: TAR }, R1 + 0.05, true, Math.PI / 8);
  // the stock and sails on +z
  const hubY = capY + 0.9, hubZ = R1 + 0.9, sailL = 11.5;
  sink.cylinder('structureWood', [0, hubY, R1 - 0.2], 'z', 1.2, 0.24, 8, { colour: TAR, decor: true });
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + k * Math.PI / 2 + 0.12, ca = Math.cos(a), sa = Math.sin(a);
    sink.member('structureWood', [0, hubY, hubZ], [ca * sailL, hubY + sa * sailL, hubZ], 0.24, 0.2, [0, 0, 1], { colour: TAR, decor: true, exposed: true });
    const px = -sa, py = ca;
    sink.member('structureWood', [ca * 2.4 + px * 1.1, hubY + sa * 2.4 + py * 1.1, hubZ], [ca * sailL + px * 1.1, hubY + sa * sailL + py * 1.1, hubZ], 0.1, 0.08, [0, 0, 1], { colour: WHITE, decor: true, exposed: true });
    for (let r = 2.6; r < sailL; r += 0.7) {
      sink.member('structureWood', [ca * r, hubY + sa * r, hubZ], [ca * r + px * 1.1, hubY + sa * r + py * 1.1, hubZ], 0.07, 0.06, [0, 0, 1], { colour: WHITE, decor: true, exposed: true });
    }
  }
  const f: Face = { origin: [0, 0, R0 * Math.cos(Math.PI / 8)], u: [1, 0, 0], out: [0, 0, 1], width: 2 };
  doorUnit(sink, f, 0, 0, 1.1, 2.1, { leaf: st.green, frame: { bucket: 'structureWood', width: 0.1, out: 0.05, colour: WHITE }, steps: null, leafKind: 'plank' });
  return sink.finish();
};

/** A brick warehouse (pakhuis) with loading doors above each other and a hoist beam (the base depot footprint). */
const pakhuis: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx);
  const W = Math.max(5.8, Math.min(8, ctx.info.w - 4.0)), D = Math.max(12, ctx.info.d - 2.6);
  const cx = ctx.bounds.minX + 0.15 + W / 2;
  const openings: Opening[] = [];
  for (let k = 0, n = Math.max(2, Math.round(D / 4.5)); k < n; k++) {
    const u = -D / 2 + (k + 0.5) * (D / n);
    openings.push({ face: 'right', storey: 0, kind: k % 2 === 0 ? 'gate' : 'window', u, w: k % 2 === 0 ? 2.0 : 0.9, y0: k % 2 === 0 ? 0 : 1.0, h: k % 2 === 0 ? 2.6 : 1.2 });
    openings.push({ face: 'right', storey: 1, kind: 'loft', u, w: 0.9, y0: 0.6, h: 1.1 });
  }
  sink.placed(0, cx, 0, 0, () => {
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: 0.3, out: 0.04, bucket: 'stone' }, storeys: [{ h: 3.4, wall: 'stone' }, { h: 2.6, wall: 'stone' }],
      roof: pantiles(46), gableBucket: 'stone', openings, chimneys: [], gutters: { colour: rgb(0x7d8183) }, verge: null,
    }, dialect({ ...st, litShare: 0.1 }));
    gableStacks(sink, frame.roof, false);
  });
  return sink.finish();
};

/** A tarred timber lean-to shed (woodshed, fish shed). */
const tarShed: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const W = Math.max(3.4, ctx.info.w - 0.4), D = Math.max(4.4, ctx.info.d - 0.4);
  sink.span('stone', -W / 2, -0.3, -D / 2, W / 2, 0.2, D / 2);
  sink.span('structureWood', -W / 2, 0.2, -D / 2, W / 2, 2.6, D / 2, { colour: TAR, uv: UV_MEMBER });
  const roof: RoofSpec = { kind: 'gable', pitchDeg: 40, eave: 0.25, verge: 0.2, thickness: 0.1, bucket: 'roof', ridge: 'round' };
  const rg = roofGeometry(W, D, 2.6, roof);
  emitRoof(sink, rg, roof);
  for (const end of [1, -1]) {
    const f: Face = { origin: [0, 0, end * D / 2], u: [end, 0, 0], out: [0, 0, end], width: W };
    // the boarded gable triangle
    for (let u = -W / 2 + 0.2; u < W / 2 - 0.1; u += 0.3) {
      const top = 2.6 + (W / 2 - Math.abs(u)) * Math.tan(40 * Math.PI / 180) - 0.1;
      faceBox(sink, 'structureWood', f, u, (2.6 + top) / 2, -0.05, 0.28, top - 2.6, 0.1, { colour: TAR, uv: UV_MEMBER });
    }
  }
  const front: Face = { origin: [W / 2, 0, 0], u: [0, 0, -1], out: [1, 0, 0], width: D };
  gateUnit(sink, front, 0, 0.2, 2.0, 2.1, shade(TAR, 1.2), { bucket: 'structureWood', width: 0.1, out: 0.05, colour: WHITE });
  return sink.finish();
};

/** A shelled brick farmhouse: the gable standing with its stack, the roof gone, rubble inside. */
const ruin: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const W = Math.max(5.4, ctx.info.w - 0.3), D = Math.max(7.4, ctx.info.d - 0.3), t = 0.35;
  for (const [x0, z0, x1, z1] of [[-W / 2, -D / 2, -W / 2 + t, D / 2], [W / 2 - t, -D / 2, W / 2, D / 2], [-W / 2 + t, -D / 2, W / 2 - t, -D / 2 + t]] as const) {
    const along = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    for (let k = 0; k < 4; k++) {
      if (rng() < 0.25) continue;
      const a = k / 4, b = (k + 1) / 4, top = 0.8 + rng() * 2.0;
      if (along) sink.span('stone', x0 + (x1 - x0) * a, -0.3, z0, x0 + (x1 - x0) * b, top, z1);
      else sink.span('stone', x0, -0.3, z0 + (z1 - z0) * a, x1, top, z0 + (z1 - z0) * b);
    }
  }
  const apex = 2.9 + (W / 2) * Math.tan(50 * Math.PI / 180);
  const f: Face = { origin: [0, 0, D / 2], u: [1, 0, 0], out: [0, 0, 1], width: W };
  const gable: Vec3[] = [[-W / 2, -0.3, D / 2 - t], [W / 2, -0.3, D / 2 - t], [W * 0.18, apex - W * 0.18 * 1.2, D / 2 - t], [-W * 0.3, 2.9 + W * 0.2, D / 2 - t]];
  sink.prism('stone', gable, [0, 0, 1], t);
  sink.span('stone', -0.45, 2.4, D / 2 - t, 0.35, apex + 0.7, D / 2);
  faceBox(sink, 'dark', f, -0.9, 1.6, 0.005, 0.9, 1.3, 0.02, { decor: true });
  sink.span('stone', -W * 0.3, -0.2, -D * 0.2, W * 0.25, 0.8, D * 0.25, { decor: true });
  sink.span('roof', -W * 0.2, 0.75, -D * 0.1, W * 0.15, 0.95, D * 0.12, { decor: true });
  return sink.finish();
};

export const POLDER_BUILDERS: Readonly<Record<string, RegionalBuilder>> = Object.freeze({
  cottage: (ctx) => brickHouse(ctx),
  farmhouse: (ctx) => brickHouse(ctx, { farm: true }),
  tavern: (ctx) => brickHouse(ctx, { storeys: 2 }),
  barn: schuur,
  mill: smockMill,
  depot: pakhuis,
  granary: tarShed,
  woodshed: tarShed,
  ruin,
});

export const POLDER_STYLE: ArchitectureStyle = Object.freeze<ArchitectureStyle>({
  id: 'polder',
  region: 'Zeeland and Zeeuws-Vlaanderen (Scheldt polders): brick farms under pantiles, tarred barns under thatch',
  surfaces: {
    roof: { kind: 'pantile', tint: [0.64, 0.32, 0.20] },
    stone: { kind: 'brick', tint: [0.56, 0.30, 0.23] },
    sourced: { plaster: true, wood: true },
  },
  builders: POLDER_BUILDERS,
});
