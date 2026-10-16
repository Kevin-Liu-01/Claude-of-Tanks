// src/world/maps/regional/polder.ts — the Zeeland polder kit (Tidegate Polders: the Scheldt polders of Zeeland and
// Zeeuws-Vlaanderen). Farmhouses and labourers' cottages of red-brown Waal brick under steep orange pantiles, white
// sash frames with many lights, shutters painted green with white margins, a stack at each gable; the great
// Zeeuwse schuur, a barn of black-tarred weatherboard under a towering hipped thatch with a band of pantiles at the
// eaves and white-framed doors; a thatched smock mill with its stage; brick warehouses and a café on the dike road.
import { buildSmockMill } from './windmills.ts';
import {
  PartSink, faceBox, facePoint, pick, rgb, shade, UV_MEMBER,
  type Face, type RegionalParts, type Rgb,
} from './geometry.ts';
import { buildHouse, emitRoof, roofGeometry, windowRhythm, type HoleRect, type HouseDialect, type HouseFrame, type HouseSpec, type Opening, type RoofSpec } from './house.ts';
import { doorUnit, gateUnit, windowUnit, type WindowStyle } from './openings.ts';
import { facadeOn, trimRun, windowHead } from './facade.ts';
import { ruinHouse, type RuinHead } from './ruinGrammar.ts';
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
 * The Zeeland farm (props census #15, Lane C 2026-10-16: "the two 15.5 m gable triangles carry one 0.62 x 0.8 m light
 * and two anchor pairs each: huge blank brick planes"), re-proportioned as the farmstead: the dwelling (voorhuis) gable
 * to the road at one side of the plot and the long, lower barn (schuur) across the back, its free front to the yard with
 * the cart doors, the stable door and lights, small stable lights along its back. Two house bodies (the damage reads
 * both). The dwelling's road gable carries two attic lights and the owl hole under the apex behind its white board and
 * makelaar, the tumbled brick courses (vlechtingen) up its rakes and the anchors; the barn's gables their hay hatches.
 * A plot too narrow for the two stands as the one brick house it was.
 */
function boerderij(ctx: RegionalBuildContext): RegionalParts {
  const W = Math.max(5.2, ctx.info.w - 0.3), D = Math.max(7.0, ctx.info.d - 0.3);
  if (W < 10.5) return brickHouse(ctx, { farm: true });
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx), rng = st.rng;
  const clampTo = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
  const Wv = clampTo(W * 0.56, 6.2, 7.8), Dw = clampTo(D * 0.44, 3.8, 4.8), Dv = D - Dw + 0.3;
  const xv = -W / 2 + Wv / 2, zv = D / 2 - Dv / 2, zw = -D / 2 + Dw / 2;
  const iron: Rgb = [0.08, 0.08, 0.085];
  // the dwelling: its door and lights to the road, lights down its outer side and to the yard, the yard door
  const vo: Opening[] = [{ face: 'front', storey: 0, kind: 'door', u: -Wv * 0.18, w: 1.0, y0: 0, h: 2.15 }];
  vo.push(...windowRhythm('front', 0, Wv, { w: 0.95, h: 1.35, sill: 0.8, spacing: 1.9, margin: 0.9, avoid: [[-Wv * 0.18 - 0.5, -Wv * 0.18 + 0.5]], max: 3 }));
  vo.push(...windowRhythm('left', 0, Dv - 0.3, { w: 0.95, h: 1.35, sill: 0.8, spacing: 2.4, margin: 0.9, max: 2 }).map((o) => ({ ...o, u: o.u - 0.15 })));
  vo.push({ face: 'right', storey: 0, kind: 'door', u: -Dv * 0.12, w: 0.95, y0: 0, h: 2.05 });
  vo.push({ face: 'right', storey: 0, kind: 'window', u: Dv * 0.24, w: 0.95, y0: 0.8, h: 1.35 });
  const holes = new Map<'front' | 'back', HoleRect[]>();
  const gableHoles = (front: boolean, poly: Array<[number, number]>): HoleRect[] => {
    const base = poly[0][1], top = Math.max(...poly.map(([, y]) => y));
    if (top - base < 2.0) return [];
    const out: HoleRect[] = front
      ? [-Wv * 0.2, Wv * 0.2].map((c) => ({ u0: c - 0.31, u1: c + 0.31, y0: base + 0.55, y1: base + 1.35 }))
      : [{ u0: -0.31, u1: 0.31, y0: base + 0.55, y1: base + 1.35 }];
    if (front && top - base > 3.4) out.push({ u0: -0.16, u1: 0.16, y0: top - 1.35, y1: top - 1.0 });
    holes.set(front ? 'front' : 'back', out);
    return out;
  };
  const roof = pantiles(50 + rng() * 4);
  sink.placed(0, xv, 0, zv, () => {
    const frame = buildHouse(sink, {
      w: Wv, d: Dv, plinth: { h: 0.35, out: 0.04, bucket: 'stone' }, storeys: [{ h: 2.9, wall: 'stone' }], roof, gableBucket: 'stone', openings: vo,
      chimneys: [], gutters: { colour: rgb(0x7d8183) }, verge: { colour: WHITE, bucket: 'structureWood' },
    }, { ...dialect(st), gableOpenings: (face, poly) => gableHoles(face.out[2] > 0, poly) });
    gableStacks(sink, frame.roof, true, frame.eaveY);
    if (facadeOn()) zeelandEaves(sink, frame);
    // the gables' lights (the owl hole left open behind its board)
    for (const name of ['front', 'back'] as const) {
      const face = frame.faces[name];
      sink.recess = frame.gableReveal;
      try {
        for (const h of holes.get(name) ?? []) {
          if (h.u1 - h.u0 < 0.5) continue;
          windowUnit(sink, face, (h.u0 + h.u1) / 2, h.y0, h.u1 - h.u0, h.y1 - h.y0, { ...st.window, shutters: null }, st.rng, 0.25);
        }
      } finally { sink.recess = 0; }
    }
    const g = frame.roof.gable;
    if (g) {
      const top = Math.max(...g.map(([, y]) => y)), base = g[0][1], half = Math.max(...g.map(([u]) => Math.abs(u)));
      const f = frame.faces.front;
      // the tumbled courses up both rakes, a hand proud of the gable's brick, and the white makelaar and owl board
      for (const side of [-1, 1]) {
        const a = facePoint(f, side * (half - 0.25), base + 0.05, 0.0), b = facePoint(f, 0, top - 0.25, 0.0);
        sink.member('stone', a, b, 0.32, 0.035, f.out, { decor: true, shade: 1.06 }, 0);
      }
      if (top - base > 3.4) {
        faceBox(sink, 'structureWood', f, 0, top - 0.75, 0.04, 0.16, 1.2, 0.05, { colour: WHITE, decor: true });
        for (const side of [-1, 1]) faceBox(sink, 'structureWood', f, side * 0.29, top - 1.18, 0.03, 0.26, 0.5, 0.03, { colour: WHITE, decor: true });
      }
      // a second pair of anchors lower on the road gable
      for (const u of [-half * 0.3, half * 0.3]) faceBox(sink, 'structureMetal', f, u, base + 1.75, 0.02, 0.05, 0.5, 0.04, { colour: iron, decor: true });
    }
  });
  // the barn across the plot's back, built a quarter turned: its ridge along the plot's x, its long front (its left
  // face) to the yard, its back (right) along the plot's back
  const free0 = -W / 2 + Wv, free = W / 2 - free0, fc = (free0 + W / 2) / 2;
  const wo: Opening[] = [];
  if (free > 4.4) {
    wo.push({ face: 'left', storey: 0, kind: 'gate', u: fc - 0.6, w: 2.8, y0: 0, h: 2.55 });
    wo.push({ face: 'left', storey: 0, kind: 'door', u: Math.min(W / 2 - 0.9, fc + 1.6), w: 0.95, y0: 0, h: 1.95 });
  } else wo.push({ face: 'left', storey: 0, kind: 'door', u: fc, w: 1.0, y0: 0, h: 1.95 });
  wo.push(...windowRhythm('right', 0, W, { w: 0.6, h: 0.45, sill: 1.45, spacing: 2.6, margin: 1.2, max: 4, kind: 'loft' }));
  wo.push({ face: 'front', storey: 0, kind: 'door', u: 0, w: 1.0, y0: 0, h: 1.95 });
  const barnHoles = (poly: Array<[number, number]>): HoleRect[] => {
    const base = poly[0][1], top = Math.max(...poly.map(([, y]) => y));
    return top - base > 1.6 ? [{ u0: -0.42, u1: 0.42, y0: base + 0.3, y1: base + 1.15 }] : [];
  };
  sink.placed(Math.PI / 2, 0, 0, zw, () => {
    const frame = buildHouse(sink, {
      w: Dw, d: W, plinth: { h: 0.3, out: 0.04, bucket: 'stone' }, storeys: [{ h: 2.4, wall: 'stone' }], roof: pantiles(45), gableBucket: 'stone', openings: wo,
      chimneys: [], gutters: { colour: rgb(0x7d8183) }, verge: { colour: WHITE, bucket: 'structureWood' },
    }, { ...dialect(st), gableOpenings: (_face, poly) => barnHoles(poly) });
    for (const name of ['front', 'back'] as const) {
      const face = frame.faces[name], g = frame.roof.gable;
      if (!g) continue;
      for (const h of barnHoles(g)) {
        sink.recess = frame.gableReveal;
        try {
          doorUnit(sink, face, 0, h.y0, h.u1 - h.u0, h.y1 - h.y0, { leaf: TAR, frame: { bucket: 'structureWood', width: 0.08, out: 0.05, colour: WHITE }, steps: null, leafKind: 'plank' });
        } finally { sink.recess = 0; }
      }
    }
  });
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
  // the stall hatches (props census E2, lane B 2026-10-14: glass laid on the boards): a white frame round two tarred
  // ledged leaves shut, their strap hinges and the bar across them (the boarded wall is the barn's structure)
  for (const u of [D * 0.05, D * 0.3]) {
    st.rng(); // (the glazed unit's pane draw, kept: the build stream after it is unchanged)
    const f = faces[1], y = 1.7, w = 0.7, h = 0.6, fo = { colour: WHITE, decor: true, fineSides: true as const };
    for (const side of [-1, 1]) {
      faceBox(sink, 'structureWood', f, u + side * (w / 2 + 0.045), y + h / 2, 0.045, 0.09, h + 0.18, 0.05, fo);
      faceBox(sink, 'structureWood', f, u + side * w / 4, y + h / 2, 0.035, w / 2 - 0.01, h, 0.03, { colour: shade(TAR, 0.95 + side * 0.04), decor: true, uv: UV_MEMBER });
      for (const t of [0.2, 0.8]) faceBox(sink, 'structureMetal', f, u + side * (w / 2 - 0.14), y + h * t, 0.055, 0.26, 0.04, 0.01, { colour: [0.15, 0.14, 0.13], decor: true, fine: true });
    }
    for (const dy of [-0.045, h + 0.045]) faceBox(sink, 'structureWood', f, u, y + dy, 0.045, w + 0.18, 0.09, 0.05, fo);
    faceBox(sink, 'structureWood', f, u, y + h * 0.5, 0.06, w + 0.1, 0.07, 0.03, { colour: shade(TAR, 0.85), decor: true, uv: UV_MEMBER });
  }
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

/** A thatched smock mill on its brick base and stage (props census #22, Lane C 2026-10-16: windmills.ts buildSmockMill). */
const smockMill: RegionalBuilder = (ctx) => buildSmockMill(ctx, { tar: TAR, white: WHITE, door: stateFor(ctx).green });

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
  farmhouse: boerderij,
  tavern: (ctx) => brickHouse(ctx, { storeys: 2 }),
  barn: schuur,
  mill: smockMill,
  depot: pakhuis,
  granary: tarShed,
  woodshed: tarShed,
  ruin,
  // the fish auction and mussel sheds of the Scheldt harbours: a brick pakhuis
  fishery: pakhuis,
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
