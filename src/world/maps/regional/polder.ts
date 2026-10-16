// src/world/maps/regional/polder.ts — the Zeeland polder kit (Tidegate Polders: the Scheldt polders of Zeeland and
// Zeeuws-Vlaanderen). Farmhouses and labourers' cottages of red-brown Waal brick under steep orange pantiles, white
// sash frames with many lights, shutters painted green with white margins, a stack at each gable; the great
// Zeeuwse schuur, a barn of black-tarred weatherboard under a towering hipped thatch with a band of pantiles at the
// eaves and white-framed doors; a thatched smock mill with its stage; brick warehouses and a café on the dike road.
import {
  PartSink, faceBox, pick, rgb, shade, UV_MEMBER,
  type Face, type RegionalParts, type Rgb, type Vec3,
} from './geometry.ts';
import { buildHouse, emitRoof, roofGeometry, windowRhythm, type HoleRect, type HouseDialect, type HouseFrame, type HouseSpec, type Opening, type RoofSpec } from './house.ts';
import { doorUnit, gateUnit, windowUnit, type WindowStyle } from './openings.ts';
import { facadeOn, thatchCourses, trimRun, windowHead } from './facade.ts';
import { ruinHouse, type RuinHead } from './ruinGrammar.ts';
import type { ArchitectureStyle, RegionalBuildContext, RegionalBuilder } from './types.ts';
import { polderPakhuis } from './harbourSheds.ts'; // props #25: the fish trade's pakhuis

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
      // the segmental brick arch over the opening (a soldier course read; on a desktop build the arch itself, facade.ts)
      if (o.kind !== 'loft') {
        if (facadeOn()) windowHead(sink, face, o.u, y0 + o.y0 + o.h, o.w, { kind: 'segment', bucket: 'stone', h: 0.16, out: 0.05, ext: 0.12, rise: 0.1 });
        else faceBox(sink, 'stone', face, o.u, y0 + o.y0 + o.h + 0.11, 0.025, o.w + 0.24, 0.22, 0.05, { decor: true });
      }
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
function gableStacks(sink: PartSink, rg: { ridgeTopY: number; halfD: number }, both: boolean, foot: number): void {
  for (const end of both ? [1, -1] : [1]) {
    const z = end * (rg.halfD - 0.35);
    sink.span('stone', -0.4, rg.ridgeTopY - 1.4, z - 0.3, 0.4, rg.ridgeTopY + 0.85, z + 0.3);
    sink.span('stone', -0.48, rg.ridgeTopY + 0.85, z - 0.38, 0.48, rg.ridgeTopY + 1.0, z + 0.38);
    // the breast down through the roof to the gable wall's head (the connectivity sweep: under a half-hip the stack
    // stood 0.2 m over the hip's slope)
    if (foot < rg.ridgeTopY - 1.4) sink.span('stone', -0.4, foot, z - 0.3, 0.4, rg.ridgeTopY - 1.4, z + 0.3, { decor: true });
  }
}

/**
 * A Zeeland house's eaves and gables (facade craft, desktop): the white-painted board gutter cornice (bakgoot) along
 * both eaves, and the wrought-iron wall anchors (muurankers) tying the gables back to the floor beams, a pair at the
 * attic floor of each gable.
 */
function zeelandEaves(sink: PartSink, frame: HouseFrame): void {
  for (const name of ['left', 'right'] as const) {
    const face = frame.faces[name], half = face.width / 2;
    trimRun(sink, 'structureWood', face, -half, half, frame.eaveY - 0.26, [{ h: 0.2, out: 0.06 }, { h: 0.06, out: 0.13 }], { colour: WHITE });
  }
  const iron: Rgb = [0.08, 0.08, 0.085];
  for (const name of ['front', 'back'] as const) {
    const face = frame.faces[name], half = face.width / 2;
    for (const u of [-half * 0.55, half * 0.55]) {
      const y = frame.eaveY + 0.15;
      faceBox(sink, 'structureMetal', face, u, y, 0.02, 0.05, 0.62, 0.04, { colour: iron, decor: true });
      faceBox(sink, 'structureMetal', face, u, y + 0.22, 0.03, 0.22, 0.05, 0.03, { colour: iron, decor: true, fine: true });
      faceBox(sink, 'structureMetal', face, u, y - 0.22, 0.03, 0.22, 0.05, 0.03, { colour: iron, decor: true, fine: true });
    }
  }
}

/** The attic light in a brick gable over 2 m tall (brickHouse lays its unit; the house cuts it, gableOpenings). */
function atticLight(poly: Array<[number, number]>): HoleRect[] {
  const base = poly[0][1], top = Math.max(...poly.map(([, y]) => y));
  return top - base > 2.0 ? [{ u0: -0.31, u1: 0.31, y0: base + 0.55, y1: base + 1.35 }] : [];
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
    // (props census E2, lane B 2026-10-14: the attic lights were glass laid on the gable's brick) cut through the gable
  }, { ...dialect(st), gableOpenings: (_face, poly) => atticLight(poly) });
  gableStacks(sink, frame.roof, opts.farm === true || rng() < 0.4, frame.eaveY);
  if (facadeOn()) zeelandEaves(sink, frame);
  if (frame.roof.gable) {
    const g = frame.roof.gable, top = Math.max(...g.map(([, y]) => y));
    if (top - frame.eaveY > 2.0) {
      for (const name of ['front', 'back'] as const) {
        sink.recess = frame.gableReveal;
        try {
          windowUnit(sink, frame.faces[name], 0, frame.eaveY + 0.55, 0.62, 0.8, { ...st.window, shutters: null }, st.rng, 0.25);
        } finally { sink.recess = 0; }
      }
    }
  }
  return sink.finish();
}

/**
 * The tarred boards of a timber body (potdekselwerk; the props census #17, 2026-10-15): each lapped board's lower edge a
 * shadow line every 19 cm, broken round the openings and their white frames, raked under a gable's verges, and a tarred
 * corner board at every corner (dressing: the body's wall carries the collision).
 */
function tarBoards(sink: PartSink, frame: HouseFrame, mobile: boolean): void {
  const y0 = frame.floors[0], y1 = frame.eaveY;
  const line = { colour: shade(TAR, 0.62), decor: true, fine: true } as const;
  for (const name of ['front', 'right', 'back', 'left'] as const) {
    const face = frame.faces[name], half = face.width / 2;
    faceBox(sink, 'structureWood', face, -half + 0.08, (y0 + y1) / 2, 0.025, 0.16, y1 - y0, 0.04, { colour: shade(TAR, 0.85), decor: true }, 'caps');
    faceBox(sink, 'structureWood', face, half - 0.08, (y0 + y1) / 2, 0.025, 0.16, y1 - y0, 0.04, { colour: shade(TAR, 0.85), decor: true }, 'caps');
    if (mobile) continue;
    const holes = frame.spec.openings.filter((o) => o.face === name)
      .map((o) => [o.u - o.w / 2 - 0.16, o.u + o.w / 2 + 0.16, frame.floors[o.storey] + o.y0 - 0.12, frame.floors[o.storey] + o.y0 + o.h + 0.16] as const);
    for (let y = y0 + 0.19; y < y1 - 0.06; y += 0.19) {
      const cuts = holes.filter(([, , a, b]) => y > a && y < b).map(([a, b]) => [a, b] as const).sort((p, q) => p[0] - q[0]);
      let cur = -half + 0.17;
      for (const [a, b] of [...cuts, [half - 0.17, half - 0.17] as const]) {
        if (a - cur > 0.15) faceBox(sink, 'structureWood', face, (cur + a) / 2, y, 0.01, a - cur, 0.024, 0.02, line, 'ends');
        cur = Math.max(cur, b);
      }
    }
  }
  const g = frame.roof.gable;
  if (!g || mobile) return;
  const top = Math.max(...g.map(([, y]) => y)), s = frame.roof.s, tanP = frame.roof.tanP;
  for (const name of ['front', 'back'] as const) {
    const face = frame.faces[name];
    for (let y = y1 + 0.19; y < top - 0.25; y += 0.19) {
      const half = Math.min(s, s - (y - y1) / tanP) - 0.12;
      if (half > 0.2) faceBox(sink, 'structureWood', face, 0, y, 0.01, 2 * half, 0.024, 0.02, line, 'ends');
    }
  }
}

/**
 * A stall hatch shut in its white frame at the back of the opening's reveal (the schuur's and the tar shed's windows):
 * two tarred ledged leaves, their strap hinges, the bar across them.
 */
function stallHatch(sink: PartSink, face: Face, o: Opening, y0: number): void {
  const r = sink.recess, go = r > 0 ? -r + 0.03 : 0.02, y = y0 + o.y0, w = o.w, h = o.h, u = o.u;
  const fo = { colour: WHITE, decor: true, fineSides: true as const };
  for (const side of [-1, 1]) {
    faceBox(sink, 'structureWood', face, u + side * (w / 2 - 0.04), y + h / 2, go + 0.03, 0.08, h, 0.06, fo);
    faceBox(sink, 'structureWood', face, u + side * w / 4, y + h / 2, go, w / 2 - 0.09, h - 0.12, 0.035, { colour: shade(TAR, 0.95 + side * 0.04), decor: true, uv: UV_MEMBER });
    for (const t of [0.22, 0.78]) faceBox(sink, 'structureMetal', face, u + side * (w / 2 - 0.2), y + h * t, go + 0.022, 0.24, 0.035, 0.01, { colour: [0.15, 0.14, 0.13], decor: true, fine: true });
  }
  for (const dy of [0.04, h - 0.04]) faceBox(sink, 'structureWood', face, u, y + dy, go + 0.03, w, 0.08, 0.06, fo);
  faceBox(sink, 'structureWood', face, u, y + h * 0.5, go + 0.035, w - 0.1, 0.07, 0.03, { colour: shade(TAR, 0.85), decor: true, uv: UV_MEMBER });
}

/** A tarred timber body's dialect: the green cart doors and the plank doors in white frames, the hatches shut. */
function tarDialect(st: PolderState): HouseDialect {
  return {
    window: (s, face, o, y0) => stallHatch(s, face, o, y0),
    door: (s, face, o, y0, frame) => {
      if (o.kind === 'gate') { dialect(st).door(s, face, o, y0, frame); return; }
      doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { leaf: shade(TAR, 1.2), frame: { bucket: 'structureWood', width: 0.1, out: 0.06, colour: WHITE }, steps: null, leafKind: 'plank' },
        frame.floors[o.storey] + o.y0);
    },
  };
}

/**
 * The Zeeuwse schuur (the props census #17, 2026-10-15, the judges: "build it on the house grammar ... keep the tar
 * weatherboard as separate boards and cut the openings: the cart gates hung at the back of a reveal with real leaves
 * and a wicket made of boards, and the stable door and windows recessed; give the thatch a ridge, a cut eave fringe and
 * a defined pantile foot course; a house plan then breaks it"): a tarred timber body on a brick plinth sunk to the
 * frost, the boards lapped, the cart doors in the street end, the stable door and the stall hatches in the long side
 * cut through it, under the towering hipped thatch that rides over its foot of pantiles at the eaves, its eave courses
 * beaten in steps and its ridge rolled.
 */
const schuur: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx);
  const W = Math.max(7.0, ctx.info.w - 0.3), D = Math.max(10.5, ctx.info.d - 0.3);
  const wallH = 3.2, mobile = ctx.tier === 'mobile';
  const openings: Opening[] = [
    { face: 'front', storey: 0, kind: 'gate', u: 0, w: 3.0, y0: 0, h: 2.85 },
    { face: 'right', storey: 0, kind: 'door', u: -D * 0.25, w: 1.0, y0: 0, h: 1.9 },
  ];
  for (const u of [D * 0.05, D * 0.3]) {
    st.rng(); // (the glazed unit's pane draw, kept: the build stream after it is unchanged)
    openings.push({ face: 'right', storey: 0, kind: 'window', u, w: 0.7, y0: 1.35, h: 0.6 });
  }
  // the roof's foot: pantiles on the hip's lowest metre, the house's own covering (its collision and its plan's roof)
  const foot: RoofSpec = { kind: 'hip', pitchDeg: 48, eave: 0.45, verge: 0.45, thickness: 0.12, bucket: 'roof', ridge: null };
  sink.paint = TAR;
  let frame: HouseFrame;
  try {
    frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: 0.35, out: 0.05, bucket: 'stone' }, storeys: [{ h: wallH, wall: 'structureWood' }], roof: foot,
      gableBucket: 'structureWood', openings, chimneys: [], gutters: null, verge: null, reveal: 0.14, spall: null,
    }, tarDialect(st));
  } finally { sink.paint = null; }
  tarBoards(sink, frame, mobile);
  // the thatch rides over the tiled slab from a line a metre in (dressing: the tiles carry the collision), its eave courses
  // beaten in steps along both long slopes, its ridge rolled
  const inset = 1.0, thatchEave = frame.eaveY + inset * Math.tan(48 * Math.PI / 180);
  const straw: RoofSpec = { kind: 'hip', pitchDeg: 52, eave: 0.25, verge: 0.25, thickness: 0.4, bucket: 'straw', ridge: 'round', decor: true };
  const rg = roofGeometry(W - 2 * inset, D - 2 * inset, thatchEave, straw);
  emitRoof(sink, rg, straw);
  if (!mobile) {
    const sinP = Math.sin(52 * Math.PI / 180), cosP = Math.cos(52 * Math.PI / 180), t = straw.thickness;
    const lo = thatchEave - straw.eave * rg.tanP, Dz = rg.halfD + straw.verge;
    for (const side of [1, -1]) {
      const n: Vec3 = [side * sinP, cosP, 0], up = (p: Vec3): Vec3 => [p[0] + n[0] * t, p[1] + n[1] * t, p[2] + n[2] * t];
      thatchCourses(sink, 'straw', up([side * (rg.s + straw.eave), lo, side * Dz * 0.82]), up([side * (rg.s + straw.eave), lo, -side * Dz * 0.82]),
        up([0, rg.ridgeY, side * rg.ridgeHalf]), up([0, rg.ridgeY, -side * rg.ridgeHalf]), n, { stepped: true });
    }
  }
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
  const capRg = roofGeometry(R1 * 2.1, R1 * 2.4, capY, cap);
  emitRoof(sink, capRg, cap);
  // (the buildings stream, 2026-10-12, the integrity check: the hood's ends stood open, sky through the cap and the
  // windshaft hanging in it on nothing) the cap's boarded body under the thatch, its front gable carrying the shaft
  if (capRg.gable) sink.prism('structureWood', capRg.gable.map(([u, yy]): Vec3 => [u, yy, -capRg.halfD]), [0, 0, 1], 2 * capRg.halfD, { colour: TAR, decor: true });
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
    gableStacks(sink, frame.roof, false, frame.eaveY);
  });
  return sink.finish();
};

/**
 * The tarred shed (schuurtje: the woodshed, the granary's store, the yards' shed; the props census #17, 2026-10-15, the
 * judges: "tarred weatherboard as separate boards on a frame, a plinth sunk to -0.6 m, the doors hung in a cut opening
 * with board leaves (no painted wicket) in white frames, a pantile roof with eave and verge courses, and raked (not
 * stepped) gable boarding"): the schuur's craft at shed scale on the house grammar — a tarred timber body on its brick
 * plinth, the boards lapped and raked up the gables, the green doors hung in a cut opening in a white frame on the +x
 * side, a stall hatch in the back, pantiles with white verge boards. Its house plan breaks it.
 */
const tarShed: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx);
  const W = Math.max(3.4, ctx.info.w - 0.4), D = Math.max(4.4, ctx.info.d - 0.4);
  const openings: Opening[] = [
    { face: 'right', storey: 0, kind: 'gate', u: 0, w: 2.0, y0: 0, h: 2.05 },
    { face: 'left', storey: 0, kind: 'window', u: D * 0.2, w: 0.6, y0: 1.2, h: 0.55 },
  ];
  sink.paint = TAR;
  let frame: HouseFrame;
  try {
    frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: 0.25, out: 0.04, bucket: 'stone' }, storeys: [{ h: 2.35, wall: 'structureWood' }], roof: { ...pantiles(40), verge: 0.2 },
      gableBucket: 'structureWood', openings, chimneys: [], gutters: null, verge: { colour: WHITE, bucket: 'structureWood' }, reveal: 0.12, spall: null,
    }, tarDialect(st));
  } finally { sink.paint = null; }
  tarBoards(sink, frame, ctx.tier === 'mobile');
  return sink.finish();
};

/** A shelled brick farmhouse: the gable standing with its stack, the roof gone, rubble inside. */
const ruin: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant;
  const W = Math.max(5.4, ctx.info.w - 0.3), D = Math.max(7.4, ctx.info.d - 0.3), t = 0.35;
  const apex = 2.9 + (W / 2) * Math.tan(50 * Math.PI / 180);
  // (props census #7, lane B 2026-10-14; the judges: "slices of span boxes, the gable's window a dark plate") the ruin
  // grammar: the farmhouse's own brick walls broken low with a gap or two, the steep gable standing to its stack with
  // its window and the door under it cut through, the hearth against its inside, the pantiles slid in over the heaps
  const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'window', u: -0.9, w: 0.9, y0: 0.95, h: 1.3 },
    { face: 'front', storey: 0, kind: 'door', u: W * 0.25, w: 0.95, y0: 0, h: 2.1 }];
  for (const face of ['right', 'left'] as const) openings.push({ face, storey: 0, kind: 'window', u: (rng() - 0.5) * 2, w: 0.9, y0: 0.9, h: 1.2 });
  const low = (): RuinHead => ({ a: 0.8 + rng() * 2.0, b: 0.8 + rng() * 2.0, at: 0.15 + rng() * 0.7, dip: rng() < 0.5 ? 0.8 : 0.3, ragged: 0.3 });
  ruinHouse(sink, {
    w: W, d: D, t, wall: 'stone', plinth: null, storeys: [2.7], openings,
    heads: { front: { a: 2.9, b: 2.9, at: 0.42, dip: -(apex - 2.9) / 2.9, ragged: 0.15 }, right: low(), left: low(), back: low() }, stub: 0.4,
    lintel: { bucket: 'stone' }, roof: { bucket: 'roof', piece: [0.4, 0.3, 0.02] }, timber: rgb(0x2b2621), hearth: { face: 'front', u: 0.6, w: 1.3 },
    mobile: ctx.tier === 'mobile',
  }, rng, look);
  // the stack on the gable
  sink.span('stone', -0.45, 2.4, D / 2 - t, 0.35, apex + 0.7, D / 2);
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
  // the fish auction and mussel sheds of the Scheldt harbours: a brick pakhuis
  fishery: (ctx) => polderPakhuis(ctx, { st: stateFor(ctx), dialect }),
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
  // the yards: a plank fence round the kitchen garden and the shed, a gate (yards.ts)
  yard: { kinds: ['cottage', 'farmhouse'], fence: 'fenceplank', gate: 'gate', shed: 'woodshed', shedSize: [4.1, 4.9], garden: true },
});
