// src/world/maps/regional/nordland.ts — the nordland kit (Nordhavn Fjord: the arms of the Ofotfjord and Bjerkvik at the
// head of the Herjangsfjord, 1940; map-revival lane 2, 2026-10-05). The harbour towns of Nordland in timber: houses of
// sawn boards over a log or stud frame on a granite footing, painted white lead, falu red or ochre, the boards standing
// with battens over their joints or lapped, white corner boards and white window casings with a little crown over each
// head, six-light windows, slate roofs; the two-storey Nordland house with its glassed veranda on the gable, the landhandel
// with its shop window on the road. On the quays: the red sjøhus warehouses on their granite quay walls with the loading
// doors stacked up the gable under the hoist beam, the fish plant with its salting shed and its deck on piles, the
// storehouses with their loading platforms, the boathouses (naust) of dry stone and boards at the water, the stockfish
// drying racks (hjell). The white chapel with its tower and spire; the houses burnt in the fighting of May 1940, their
// stacks standing on the granite footings.
import {
  PartSink, faceBox, facePoint, facePanel, pick, rgb, shade,
  type Face, type Rgb,
} from './geometry.ts';
import {
  buildHouse, emitRoof, roofGeometry, wallPolygon, windowRhythm,
  type HouseDialect, type HouseFrame, type Opening, type RoofSpec, type StoreySpec, type WallRect,
} from './house.ts';
import { doorUnit, gateUnit, windowUnit, type WindowStyle } from './openings.ts';
import { woodpile } from './dressing.ts';
import type { ArchitectureStyle, RegionalBuildContext, RegionalBuilder } from './types.ts';
import type { RegionalParts } from './geometry.ts';

const WHITE = rgb(0xece9e1), RED = rgb(0x8c3326), OCHRE = rgb(0xc89a42), TAR = rgb(0x2a2622);
const DARK_GREEN = rgb(0x2e4639), BOARD = rgb(0x7d6a55), CHAR = rgb(0x231f1c), IRON = rgb(0x2b2d2e), FISH = rgb(0xb7a78a);
/** The paints of the three renders (the kit's tones): white lead, falu red, ochre. */
type Paint = 'plaster' | 'plaster2' | 'plaster3';
const PAINT_RGB: Readonly<Record<Paint, Rgb>> = { plaster: WHITE, plaster2: RED, plaster3: OCHRE };

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
/**
 * Where the walls stand: the base geometry's measured box (ctx.bounds) less the kit's own overhang on its x and z sides
 * (the coordinator's rule, 2026-10-05: a kit building fills the base's bounds).
 */
function wallsIn(ctx: RegionalBuildContext, ex: number, ez: number): { cx: number; cz: number; w: number; d: number } {
  const b = ctx.bounds;
  return { cx: (b.minX + b.maxX) / 2, cz: (b.minZ + b.maxZ) / 2, w: b.maxX - b.minX - 2 * ex, d: b.maxZ - b.minZ - 2 * ez };
}
const uvOffset = (ctx: RegionalBuildContext): [number, number] => [ctx.rng() * 7.31, ctx.rng() * 5.17];

interface NordState {
  rng: () => number;
  look: () => number;
  paint: Paint;
  trim: Rgb;
  door: Rgb;
  window: WindowStyle;
  /** board cladding: standing boards with battens over the joints, or lapped weatherboards */
  boards: 'standing' | 'lapped';
  litShare: number;
  mobile: boolean;
}

/** One building's paint and joinery, from its look stream: `weights` are the shares of white, red and ochre. */
function stateFor(ctx: RegionalBuildContext, weights: readonly [number, number, number] = [0.45, 0.33, 0.22]): NordState {
  const look = ctx.variant;
  const r = look() * (weights[0] + weights[1] + weights[2]);
  const paint: Paint = r < weights[0] ? 'plaster' : r < weights[0] + weights[1] ? 'plaster2' : 'plaster3';
  // white houses keep white joinery or take a dark green; the red and the ochre ones white
  const trim = paint === 'plaster' && look() < 0.3 ? DARK_GREEN : WHITE;
  const door = pick(look, [shade(TAR, 1.5), rgb(0x3e5c6b), rgb(0x6b3b2b), rgb(0x55684e)]);
  return {
    rng: ctx.rng, look, paint, trim, door, litShare: 0.4, mobile: ctx.tier === 'mobile',
    boards: look() < 0.55 ? 'lapped' : 'standing',
    window: {
      frame: trim, frameWidth: 0.07, frameOut: 0.04, bars: 'six',
      // the board casing round each window, its head board deeper: the little crown (kroning) over it
      surround: { bucket: 'structureWood', width: 0.1, out: 0.03, lintel: 0.17, colour: trim },
      sill: { bucket: 'structureWood', out: 0.07, colour: trim },
      shutters: null,
    },
  };
}

/** The holes a face's openings cut, widened by their casings: [u0, u1, y0, y1] on the face. */
function casings(openings: readonly Opening[], y0: number): Array<readonly [number, number, number, number]> {
  return openings.map((o) => [o.u - o.w / 2 - 0.14, o.u + o.w / 2 + 0.14, y0 + o.y0 - 0.1, y0 + o.y0 + o.h + 0.24] as const);
}

/**
 * The board cladding of a timber wall: the white corner boards on every house (they read from across the harbour), and
 * the boards' own lines, broken at the openings — battens over the joints of standing boards every 32 cm, or the
 * shadow line of each lapped board every 18 cm.
 */
function cladding(sink: PartSink, face: Face, rect: WallRect, openings: readonly Opening[], st: NordState): void {
  const { u0, u1, y0, y1 } = rect;
  for (const u of [u0 + 0.08, u1 - 0.08]) {
    faceBox(sink, 'structureWood', face, u, (y0 + y1) / 2, 0.025, 0.17, y1 - y0, 0.05, { colour: st.trim, decor: true }, 'caps');
  }
  if (st.mobile) return;
  const holes = casings(openings, y0);
  const tone = shade(PAINT_RGB[st.paint], st.paint === 'plaster' ? 0.88 : 0.78);
  const line = { colour: tone, decor: true, fine: true } as const;
  if (st.boards === 'standing') {
    for (let u = u0 + 0.4; u < u1 - 0.34; u += 0.32) {
      const cuts = holes.filter(([a, b]) => u > a && u < b).map(([, , a, b]) => [a, b] as const).sort((p, q) => p[0] - q[0]);
      let cur = y0 + 0.04;
      for (const [a, b] of [...cuts, [y1, y1] as const]) {
        if (a - cur > 0.2) faceBox(sink, 'structureWood', face, u, (cur + a) / 2, 0.012, 0.05, a - cur, 0.024, line, 'caps');
        cur = Math.max(cur, b);
      }
    }
  } else {
    for (let y = y0 + 0.2; y < y1 - 0.06; y += 0.18) {
      const cuts = holes.filter(([, , a, b]) => y > a && y < b).map(([a, b]) => [a, b] as const).sort((p, q) => p[0] - q[0]);
      let cur = u0 + 0.18;
      for (const [a, b] of [...cuts, [u1 - 0.18, u1 - 0.18] as const]) {
        if (a - cur > 0.15) faceBox(sink, 'structureWood', face, (cur + a) / 2, y, 0.01, a - cur, 0.024, 0.02, line, 'ends');
        cur = Math.max(cur, b);
      }
    }
  }
}

/** The gable's boards: standing battens up to the roof line, or lapped lines across it, and the white barge boards. */
function gableCladding(sink: PartSink, face: Face, polygon: Array<[number, number]>, frame: HouseFrame, st: NordState): void {
  if (st.mobile) return;
  const eave = Math.min(...polygon.map(([, y]) => y)), top = Math.max(...polygon.map(([, y]) => y));
  const s = frame.roof.s, tanP = frame.roof.tanP;
  const roofAt = (u: number) => Math.min(top, eave + (s - Math.abs(u)) * tanP);
  const tone = shade(PAINT_RGB[st.paint], st.paint === 'plaster' ? 0.88 : 0.78);
  const line = { colour: tone, decor: true, fine: true } as const;
  if (st.boards === 'standing') {
    for (let u = -s + 0.3; u < s - 0.25; u += 0.32) {
      const h = roofAt(u) - 0.1;
      if (h - eave > 0.25) faceBox(sink, 'structureWood', face, u, (eave + h) / 2, 0.012, 0.05, h - eave, 0.024, line, 'caps');
    }
  } else {
    for (let y = eave + 0.18; y < top - 0.3; y += 0.18) {
      const half = s - (y - eave) / tanP - 0.15;
      if (half > 0.2) faceBox(sink, 'structureWood', face, 0, y, 0.01, 2 * half, 0.024, 0.02, line, 'ends');
    }
  }
}

function dialect(st: NordState): HouseDialect {
  return {
    window: (sink, face, o, y0) => windowUnit(sink, face, o.u, y0 + o.y0, o.w, o.h,
      o.kind === 'loft' ? { ...st.window, bars: 'cross', surround: { ...st.window.surround!, lintel: 0.1 } } : st.window,
      st.rng, o.kind === 'loft' ? 0.1 : st.litShare),
    door: (sink, face, o, y0, frame) => {
      if (o.kind === 'gate') {
        gateUnit(sink, face, o.u, y0 + o.y0, o.w, o.h, shade(PAINT_RGB[st.paint], 0.82), { bucket: 'structureWood', width: 0.14, out: 0.05, colour: st.trim });
        return;
      }
      if (o.kind === 'shopfront') {
        // the shop window over its boarded riser, in a white casing
        windowUnit(sink, face, o.u, y0 + o.y0 + 0.55, o.w, o.h - 0.55, { ...st.window, bars: 'two',
          surround: { bucket: 'structureWood', width: 0.14, out: 0.05, lintel: 0.2, colour: st.trim } }, st.rng, 0.7);
        return;
      }
      doorUnit(sink, face, o.u, y0 + o.y0, o.w, o.h, {
        leaf: st.door, frame: { bucket: 'structureWood', width: 0.12, out: 0.05, colour: st.trim },
        steps: o.storey === 0 ? { bucket: 'stone' } : null, leafKind: 'panel', transom: o.h > 2.15,
      }, frame.floors[o.storey] + o.y0);
    },
    dressWall: (sink, face, rect, openings) => cladding(sink, face, rect, openings, st),
    dressGable: (sink, face, polygon, frame) => gableCladding(sink, face, polygon, frame, st),
  };
}

/** The roofs: slate on battens, the eaves and verges out over the boards, a saddle ridge. */
const skifer = (pitch: number, eave = 0.38, verge = 0.28, kind: RoofSpec['kind'] = 'gable'): RoofSpec =>
  ({ kind, pitchDeg: pitch, eave, verge: kind === 'hip' ? eave : verge, thickness: 0.12, bucket: 'roof', ridge: 'saddle' });

/** The granite footing every house stands on. */
const footing = (h: number) => ({ h, out: 0.06, bucket: 'stone' as const });

/**
 * The entrance porch (bislag) before a gable's door: a little board house with its own gable roof, its door to the
 * road, the white corner boards; `u` along the face, `depth` out of it.
 */
function bislag(sink: PartSink, face: Face, u: number, depth: number, st: NordState): void {
  const w = 1.9, h = 2.45, pl = 0.45;
  const c = facePoint(face, u, 0, depth / 2);
  const along = face.u, out = face.out;
  const x0 = c[0] - along[0] * w / 2 - out[0] * depth / 2, x1 = c[0] + along[0] * w / 2 + out[0] * depth / 2;
  const z0 = c[2] - along[2] * w / 2 - out[2] * depth / 2, z1 = c[2] + along[2] * w / 2 + out[2] * depth / 2;
  sink.span('stone', Math.min(x0, x1), -0.3, Math.min(z0, z1), Math.max(x0, x1), pl, Math.max(z0, z1));
  sink.span(st.paint, Math.min(x0, x1), pl, Math.min(z0, z1), Math.max(x0, x1), pl + h, Math.max(z0, z1));
  const front: Face = { origin: facePoint(face, u, 0, depth), u: face.u, out: face.out, width: w };
  doorUnit(sink, front, 0, pl, 0.9, 2.05, {
    leaf: st.door, frame: { bucket: 'structureWood', width: 0.11, out: 0.05, colour: st.trim },
    steps: { bucket: 'stone' }, leafKind: 'panel', transom: false,
  }, pl);
  for (const s of [-1, 1]) faceBox(sink, 'structureWood', front, s * (w / 2 - 0.07), pl + h / 2, 0.025, 0.14, h, 0.05, { colour: st.trim, decor: true }, 'caps');
  // its gable roof, the ridge running out from the wall
  const roof: RoofSpec = { kind: 'gable', pitchDeg: 40, eave: 0.18, verge: 0.12, thickness: 0.1, bucket: 'roof', ridge: 'saddle' };
  const yaw = Math.atan2(out[0], out[2]);
  sink.placed(yaw, c[0], 0, c[2], () => emitRoof(sink, roofGeometry(w, depth, pl + h, roof), roof));
  const gable: Face = { origin: [front.origin[0], 0, front.origin[2]], u: face.u, out: face.out, width: w };
  wallPolygon(sink, st.paint, { ...gable, origin: facePoint(face, u, 0, depth - 0.06) },
    [[-w / 2, pl + h], [w / 2, pl + h], [0, pl + h + (w / 2) * Math.tan(40 * Math.PI / 180)]], 0.06);
}

// ------------------------------------------------------------------------------------------------ the houses

/**
 * The house (hus): a storey and a half of boards on a granite footing, the gable to the road with its door in the
 * bislag, the loft lit by the gable windows, a slate roof and a stack at the ridge; on the bigger plots, the two-storey
 * Nordland house with its glassed veranda up the gable.
 */
function hus(ctx: RegionalBuildContext, opts: { two?: boolean } = {}): RegionalParts {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx);
  const rng = st.rng, look = st.look, two = !!opts.two;
  const fit = wallsIn(ctx, 0.42, 0.3);
  const W = clamp(fit.w, 4.4, two ? 10.5 : 9), D = clamp(fit.d, 5.6, two ? 13 : 11.5);
  // the porch (a bislag, or the two-storey house's glassed veranda) stands inside the plot before the front gable
  const porch = two ? clamp(D * 0.17, 1.5, 2.0) : D >= 6.8 ? 1.25 : 0;
  const Db = D - porch;
  sink.placed(0, fit.cx, 0, fit.cz - porch / 2, () => {
    const sts: StoreySpec[] = two
      ? [{ h: 2.6, wall: st.paint, framed: true }, { h: 2.5, wall: st.paint, framed: true }, { h: 0.7, wall: st.paint, framed: true }]
      : [{ h: 2.5, wall: st.paint, framed: true }, { h: 1.45, wall: st.paint, framed: true }];
    const doorU = porch ? 0 : (rng() < 0.5 ? -1 : 1) * W * 0.2;
    const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'door', u: doorU, w: 0.95, y0: 0, h: 2.05 }];
    for (const o of windowRhythm('front', 0, W, { w: 0.85, h: 1.2, sill: 0.85, spacing: 1.8, margin: 0.75, max: 2,
      avoid: [[doorU - (porch ? 1.2 : 0.75), doorU + (porch ? 1.2 : 0.75)]] })) openings.push(o);
    for (const face of ['right', 'left'] as const) {
      for (const o of windowRhythm(face, 0, Db, { w: 0.85, h: 1.2, sill: 0.85, spacing: 1.9, margin: 0.9, max: 4 })) openings.push(o);
      if (two) for (const o of windowRhythm(face, 1, Db, { w: 0.85, h: 1.15, sill: 0.8, spacing: 1.9, margin: 0.9, max: 4 })) openings.push(o);
    }
    for (const o of windowRhythm('back', 0, W, { w: 0.85, h: 1.2, sill: 0.85, spacing: 2.0, margin: 0.9, max: 2 })) openings.push(o);
    if (two) {
      openings.push({ face: 'front', storey: 1, kind: 'door', u: 0, w: 0.9, y0: 0, h: 2.0 });
      for (const o of windowRhythm('back', 1, W, { w: 0.85, h: 1.15, sill: 0.8, spacing: 2.0, margin: 0.9, max: 2 })) openings.push(o);
    } else {
      // the loft's gable windows
      for (const face of ['front', 'back'] as const) {
        for (const o of windowRhythm(face, 1, W, { w: 0.7, h: 0.85, sill: 0.35, spacing: 1.3, margin: W * 0.28, max: 2, kind: 'loft' })) openings.push(o);
      }
    }
    const frame = buildHouse(sink, {
      w: W, d: Db, plinth: footing(two ? 0.7 : 0.55), storeys: sts,
      roof: skifer(two ? 33 + rng() * 5 : 37 + rng() * 6), gableBucket: st.paint, gableFramed: true, openings,
      chimneys: [{ x: 0, z: (rng() - 0.5) * Db * 0.3, sx: 0.6, sz: 0.6, above: 0.75, bucket: 'stone', cap: 'slab' }],
      gutters: null, verge: { colour: st.trim, bucket: 'structureWood' }, reveal: 0.12, spall: null,
    }, dialect(st));
    const f = frame.faces.front;
    if (two) veranda(sink, f, frame, porch, st);
    else if (porch) bislag(sink, f, 0, porch, st);
    if (!st.mobile && look() < 0.7) {
      const side = look() < 0.5 ? frame.faces.right : frame.faces.left;
      woodpile(sink, side, -side.width / 2 + 0.6, -side.width / 2 + 0.6 + Math.min(2.4, side.width * 0.35), 1.1 + look() * 0.4, look);
    }
  });
  return sink.finish();
}

/**
 * The glassed veranda (glassveranda) up the Nordland house's gable: two storeys of small-paned glazing in white frames
 * on a boarded base, the door at its foot and the balcony door above, under a low hipped roof.
 */
function veranda(sink: PartSink, face: Face, frame: HouseFrame, depth: number, st: NordState): void {
  const w = Math.min(3.8, face.width - 1.4), y0 = frame.floors[0], top = frame.floors[2] ?? frame.eaveY;
  const c = { colour: WHITE } as const;
  // the solid of the veranda: its granite footing, the boarded dado of each storey
  faceBox(sink, 'stone', face, 0, (y0 - 0.3) / 2, depth / 2, w + 0.1, y0 + 0.3, depth + 0.05, {});
  faceBox(sink, st.paint, face, 0, y0 + 0.425, depth / 2, w, 0.85, depth, {});
  faceBox(sink, st.paint, face, 0, frame.floors[1] + 0.225, depth / 2, w, 0.45, depth, {});
  // the posts at the corners and the frames of the glazing, the glass between
  for (const s of [-1, 1]) {
    faceBox(sink, 'structureWood', face, s * (w / 2 - 0.07), (y0 + top) / 2, depth - 0.07, 0.14, top - y0, 0.14, c);
    faceBox(sink, 'structureWood', face, s * (w / 2 - 0.07), (y0 + top) / 2, 0.1, 0.14, top - y0, 0.14, c);
  }
  for (const yb of [frame.floors[1] - 0.06, top - 0.08]) faceBox(sink, 'structureWood', face, 0, yb, depth / 2, w, 0.16, depth, c);
  // a side of the veranda: out along the face, its u turned from its out (u = (out.z, 0, -out.x), as every face's)
  const side = (s: number): Face => ({ origin: facePoint(face, s * w / 2, 0, depth / 2), u: [s * face.u[2], 0, -s * face.u[0]], out: [s * face.u[0], 0, s * face.u[2]], width: depth });
  const front: Face = { origin: facePoint(face, 0, 0, depth), u: face.u, out: face.out, width: w };
  for (const [f, span] of [[front, w], [side(-1), depth], [side(1), depth]] as const) {
    for (const [ya, yb] of [[y0 + 0.85, frame.floors[1] - 0.14], [frame.floors[1] + 0.45, top - 0.16]] as const) {
      facePanel(sink, 'glass', f, 0, (ya + yb) / 2, -0.04, span - 0.3, yb - ya, {});
      if (st.mobile) continue;
      const n = Math.max(2, Math.round(span / 0.55));
      for (let k = 1; k < n; k++) faceBox(sink, 'structureWood', f, -span / 2 + 0.15 + (span - 0.3) * k / n, (ya + yb) / 2, -0.02, 0.05, yb - ya, 0.04, { colour: WHITE, decor: true, fine: true }, 'caps');
      faceBox(sink, 'structureWood', f, 0, ya + (yb - ya) * 0.66, -0.02, span - 0.3, 0.05, 0.04, { colour: WHITE, decor: true, fine: true }, 'ends');
    }
  }
  doorUnit(sink, front, 0, y0, 0.85, 2.0, {
    leaf: st.door, frame: { bucket: 'structureWood', width: 0.1, out: 0.04, colour: WHITE },
    steps: { bucket: 'stone' }, leafKind: 'glazed', transom: false,
  }, y0);
  const roof: RoofSpec = { kind: 'hip', pitchDeg: 22, eave: 0.22, verge: 0.22, thickness: 0.1, bucket: 'roof', ridge: null };
  const cc = facePoint(face, 0, 0, depth / 2);
  sink.placed(Math.atan2(face.out[0], face.out[2]) + Math.PI / 2, cc[0], 0, cc[2], () => emitRoof(sink, roofGeometry(depth, w, top, roof), roof));
}

/**
 * The landhandel (the general store, the cornershop's plot): two white storeys under a hipped slate roof, the shop
 * window and the shop door on the road with the sign board over them, the living floor above.
 */
const landhandel: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx, [0.7, 0.1, 0.2]);
  const rng = st.rng;
  const fit = wallsIn(ctx, 0.42, 0.42);
  const W = clamp(fit.w, 6.5, 11), D = clamp(fit.d, 6.5, 11);
  sink.placed(0, fit.cx, 0, fit.cz, () => {
    const openings: Opening[] = [
      { face: 'front', storey: 0, kind: 'shopfront', u: -W * 0.12, w: Math.min(3.2, W * 0.4), y0: 0.5, h: 1.7 },
      { face: 'front', storey: 0, kind: 'door', u: W * 0.25, w: 1.1, y0: 0, h: 2.3 },
    ];
    for (const o of windowRhythm('front', 1, W, { w: 0.85, h: 1.15, sill: 0.8, spacing: 1.8, margin: 0.8, max: 4 })) openings.push(o);
    for (const face of ['right', 'left', 'back'] as const) {
      const span = face === 'back' ? W : D;
      for (const st2 of [0, 1]) for (const o of windowRhythm(face, st2, span, { w: 0.85, h: 1.15, sill: 0.85, spacing: 2.0, margin: 0.9, max: 3 })) openings.push(o);
    }
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: footing(0.6), storeys: [{ h: 3.0, wall: st.paint, framed: true }, { h: 2.6, wall: st.paint, framed: true }],
      roof: skifer(26 + rng() * 4, 0.45, 0.45, 'hip'), openings,
      chimneys: [{ x: (rng() - 0.5) * W * 0.3, z: -D * 0.15, sx: 0.65, sz: 0.65, above: 0.8, bucket: 'stone', cap: 'slab' }],
      gutters: null, verge: null, reveal: 0.12, spall: null,
    }, dialect(st));
    const f = frame.faces.front;
    // the sign board over the shop window and the door, on its two brackets
    faceBox(sink, 'structureWood', f, 0, frame.floors[1] - 0.25, 0.06, W * 0.7, 0.42, 0.06, { colour: shade(DARK_GREEN, 1.1), decor: true });
    faceBox(sink, 'structureWood', f, 0, frame.floors[1] - 0.25, 0.1, W * 0.6, 0.18, 0.02, { colour: WHITE, decor: true, fine: true });
    if (!st.mobile) for (const u of [-W * 0.3, W * 0.25 + 0.9]) faceBox(sink, 'structureWood', f, u, 0.45, 0.4, 0.5, 0.9, 0.5, { colour: BOARD, decor: true, shadow: true });
  });
  return sink.finish();
};

// ------------------------------------------------------------------------------------------------ the quays

/**
 * The sjøhus (the warehouse's plot): a red quay warehouse of three floors on its granite quay wall, the loading doors
 * stacked up the gable on the water under the hoist beam and its tackle, small windows in white casings, a slate roof;
 * the timber deck of the quay before the gable with its bollards.
 */
const sjohus: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx, [0.12, 0.72, 0.16]);
  const rng = st.rng, look = st.look;
  const bb = ctx.bounds;
  const deck = clamp((bb.maxZ - bb.minZ) * 0.1, 2.2, 3.0);
  const W = clamp(bb.maxX - bb.minX - 0.9, 9, 18), D = clamp(bb.maxZ - bb.minZ - deck - 0.65, 12, 26);
  const cz = bb.minZ + 0.3 + D / 2, cx = (bb.minX + bb.maxX) / 2;
  sink.placed(0, cx, 0, cz, () => {
    const openings: Opening[] = [
      { face: 'front', storey: 0, kind: 'gate', u: 0, w: 2.6, y0: 0, h: 2.7 },
      { face: 'front', storey: 1, kind: 'gate', u: 0, w: 1.6, y0: 0.1, h: 2.1 },
      { face: 'front', storey: 2, kind: 'gate', u: 0, w: 1.3, y0: 0.1, h: 1.6 },
      { face: 'back', storey: 0, kind: 'door', u: W * 0.25, w: 1.0, y0: 0, h: 2.1 },
    ];
    for (const s of [0, 1]) for (const o of windowRhythm('front', s, W, { w: 0.75, h: 0.9, sill: 1.0, spacing: 2.4, margin: 1.2, max: 2, avoid: [[-1.8, 1.8]] })) openings.push(o);
    for (const face of ['right', 'left'] as const) {
      for (const s of [0, 1, 2]) for (const o of windowRhythm(face, s, D, { w: 0.7, h: 0.85, sill: s === 2 ? 0.4 : 1.0, spacing: 3.2, margin: 1.6, max: 6 })) openings.push(o);
    }
    openings.push({ face: 'right', storey: 0, kind: 'gate', u: D * 0.18, w: 2.2, y0: 0, h: 2.5 });
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: footing(0.85), storeys: [
        { h: 3.0, wall: st.paint, framed: true }, { h: 2.8, wall: st.paint, framed: true }, { h: 2.0, wall: st.paint, framed: true }],
      roof: skifer(36 + rng() * 4, 0.4, 0.32), gableBucket: st.paint, gableFramed: true,
      openings: openings.filter((o) => !(o.face === 'right' && o.kind === 'window' && o.storey === 0 && Math.abs(o.u - D * 0.18) < 1.9)),
      chimneys: [], gutters: null, verge: { colour: WHITE, bucket: 'structureWood' }, reveal: 0.1, spall: null,
    }, dialect(st));
    const f = frame.faces.front;
    // the hoist beam out of the gable over the doors, its block and the hanging line
    const yb = frame.eaveY + 0.9;
    faceBox(sink, 'structureWood', f, 0, yb, 0.75, 0.22, 0.24, 1.5, { colour: shade(BOARD, 0.8), decor: true, shadow: true });
    if (!st.mobile) {
      faceBox(sink, 'structureMetal', f, 0, yb - 0.25, 1.35, 0.16, 0.3, 0.16, { colour: IRON, decor: true });
      faceBox(sink, 'structureMetal', f, 0, yb - 2.2, 1.35, 0.025, 3.6, 0.025, { colour: IRON, decor: true, fine: true });
    }
    // the quay deck before the gable, its edge beam and two bollards
    const fz = D / 2;
    sink.span('wood', -W / 2 - 0.1, 0.55, fz, W / 2 + 0.1, 0.8, fz + deck);
    sink.span('stone', -W / 2 - 0.1, -0.6, fz, W / 2 + 0.1, 0.55, fz + deck);
    for (const s of [-1, 1]) sink.cylinder('structureMetal', [s * W * 0.3, 0.8, fz + deck - 0.45], 'y', 0.55, 0.16, 8, { colour: IRON, decor: true, shadow: true });
    if (!st.mobile && look() < 0.7) {
      for (let k = 0; k < 3; k++) sink.cylinder('structureWood', [W * 0.15 + k * 0.62, 0.8, fz + 0.7 + (k % 2) * 0.3], 'y', 0.85, 0.28, 10, { colour: shade(BOARD, 0.9 + k * 0.08), decor: true, shadow: true });
    }
  });
  return sink.finish();
};

/**
 * The storehouse (the depot's plot, its loading side to +x): one long red storey raised on a granite footing to the
 * height of a cart bed, the sliding doors on the loading platform along the +x side, a loft door in the gable.
 */
const lager: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx, [0.15, 0.65, 0.2]);
  const rng = st.rng;
  const bb = ctx.bounds;
  const plat = clamp((bb.maxX - bb.minX) * 0.22, 2.0, 2.8);
  const W = clamp(bb.maxX - bb.minX - plat - 0.7, 6, 10), D = clamp(bb.maxZ - bb.minZ - 0.6, 12, 24);
  const cx = bb.minX + 0.35 + W / 2, cz = (bb.minZ + bb.maxZ) / 2;
  sink.placed(0, cx, 0, cz, () => {
    const floor = 0.95;
    const n = Math.max(2, Math.round(D / 7));
    const openings: Opening[] = [];
    for (let k = 0; k < n; k++) openings.push({ face: 'right', storey: 0, kind: 'gate', u: -D / 2 + D * (k + 0.5) / n, w: 2.4, y0: 0, h: 2.4 });
    for (const o of windowRhythm('left', 0, D, { w: 0.7, h: 0.6, sill: 1.6, spacing: 3.0, margin: 1.5, max: 6 })) openings.push(o);
    openings.push({ face: 'front', storey: 1, kind: 'gate', u: 0, w: 1.3, y0: 0.05, h: 1.4 });
    openings.push({ face: 'back', storey: 0, kind: 'door', u: 0, w: 1.0, y0: 0, h: 2.0 });
    buildHouse(sink, {
      w: W, d: D, plinth: footing(floor), storeys: [{ h: 3.0, wall: st.paint, framed: true }, { h: 1.6, wall: st.paint, framed: true }],
      roof: skifer(30 + rng() * 5, 0.4, 0.3), gableBucket: st.paint, gableFramed: true, openings,
      chimneys: [], gutters: null, verge: { colour: WHITE, bucket: 'structureWood' }, reveal: 0.1, spall: null,
    }, dialect(st));
    // the loading platform along the +x side at the floor's height, on posts, a ramp down from its far end
    const x0 = W / 2, x1 = W / 2 + plat, ramp = 1.8;
    sink.span('wood', x0, floor - 0.18, -D / 2, x1, floor, D / 2 - ramp);
    for (let z = -D / 2 + 0.3; z <= D / 2 - ramp; z += Math.max(1.8, (D - ramp - 0.3) / Math.max(1, Math.round((D - ramp - 0.3) / 2.4)))) {
      sink.span('wood', x1 - 0.3, -0.4, z - 0.12, x1 - 0.06, floor - 0.18, z + 0.12);
    }
    sink.prism('wood', [[x0, floor, D / 2 - ramp], [x0, -0.05, D / 2], [x0, -0.3, D / 2], [x0, -0.3, D / 2 - ramp]], [1, 0, 0], plat);
    if (!st.mobile) {
      for (let k = 0; k < 4; k++) sink.span('structureWood', x0 + 0.4 + (k % 2) * 0.7, floor, -D / 4 + k * 0.75, x0 + 1.0 + (k % 2) * 0.7, floor + 0.55, -D / 4 + k * 0.75 + 0.55, { colour: shade(BOARD, 0.85 + k * 0.05), decor: true, shadow: true });
    }
  });
  return sink.finish();
};

/**
 * The fish plant (fiskebruk, the fishery's plot): the two-storey processing hall on the quay, its wide doors and the loft
 * door with the hoist to the deck on piles before it, many windows for the work inside; the low salting shed against its
 * side; on the deck the fish boxes, the barrels and the derrick.
 */
const fiskebruk: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx, [0.5, 0.4, 0.1]);
  const rng = st.rng, look = st.look;
  const bb = ctx.bounds;
  const deck = clamp((bb.maxZ - bb.minZ) * 0.2, 3.2, 4.4);
  const annex = clamp((bb.maxX - bb.minX) * 0.22, 3.0, 4.4);
  const W = clamp(bb.maxX - bb.minX - annex - 0.9, 8, 15), D = clamp(bb.maxZ - bb.minZ - deck - 0.6, 10, 18);
  const cx = bb.maxX - 0.4 - W / 2, cz = bb.minZ + 0.3 + D / 2;
  sink.placed(0, cx, 0, cz, () => {
    const openings: Opening[] = [
      { face: 'front', storey: 0, kind: 'gate', u: -W * 0.22, w: 2.6, y0: 0, h: 2.6 },
      { face: 'front', storey: 0, kind: 'door', u: W * 0.3, w: 1.0, y0: 0, h: 2.1 },
      { face: 'front', storey: 1, kind: 'gate', u: 0, w: 1.5, y0: 0.1, h: 1.9 },
    ];
    for (const face of ['right', 'back'] as const) {
      const span = face === 'back' ? W : D;
      for (const s of [0, 1]) for (const o of windowRhythm(face, s, span, { w: 0.9, h: 1.1, sill: 1.0, spacing: 1.7, margin: 1.0, max: 8 })) openings.push(o);
    }
    for (const o of windowRhythm('left', 1, D, { w: 0.9, h: 1.1, sill: 1.0, spacing: 1.7, margin: 1.0, max: 8 })) openings.push(o);
    for (const o of windowRhythm('front', 1, W, { w: 0.9, h: 1.1, sill: 1.0, spacing: 1.9, margin: 1.0, max: 4, avoid: [[-1.4, 1.4]] })) openings.push(o);
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: footing(0.5), storeys: [{ h: 3.2, wall: st.paint, framed: true }, { h: 2.6, wall: st.paint, framed: true }],
      roof: skifer(28 + rng() * 4, 0.4, 0.3), gableBucket: st.paint, gableFramed: true, openings,
      chimneys: [{ x: W * 0.2, z: -D * 0.25, sx: 0.6, sz: 0.6, above: 0.9, bucket: 'stone', cap: 'slab' }],
      gutters: null, verge: { colour: WHITE, bucket: 'structureWood' }, reveal: 0.1, spall: null,
    }, dialect(st));
    const f = frame.faces.front;
    const yb = frame.eaveY + 0.6;
    faceBox(sink, 'structureWood', f, 0, yb, 0.7, 0.2, 0.22, 1.4, { colour: shade(BOARD, 0.8), decor: true, shadow: true });
    // the salting shed against the -x side: a low red shed under a slate lean-to falling outward
    const ax0 = -W / 2 - annex, sd = Math.min(D - 0.6, 9), sz0 = -D / 2 + 0.2, h1 = 3.0, h0 = 2.3;
    const side: Face = { origin: [ax0, 0, sz0 + sd / 2], u: [0, 0, 1], out: [-1, 0, 0], width: sd };
    sink.span('stone', ax0 - 0.04, -0.3, sz0, -W / 2, 0.35, sz0 + sd);
    // the shed's body: its end profile run through its depth (low on the outer side, high against the hall)
    const end: Face = { origin: [ax0 + annex / 2, 0, sz0 + sd], u: [1, 0, 0], out: [0, 0, 1], width: annex };
    wallPolygon(sink, 'plaster2', end, [[-annex / 2, 0.35], [annex / 2, 0.35], [annex / 2, h1], [-annex / 2, h0]], sd);
    gateUnit(sink, side, sd * 0.2, 0.35, 1.8, 1.9, shade(RED, 0.8), { bucket: 'structureWood', width: 0.12, out: 0.04, colour: WHITE });
    const lean: RoofSpec = { kind: 'shed', pitchDeg: Math.atan2(h1 - h0, annex) * 180 / Math.PI, eave: 0.3, verge: 0.2, thickness: 0.1, bucket: 'roof' };
    sink.placed(Math.PI, ax0 + annex / 2, 0, sz0 + sd / 2, () => emitRoof(sink, roofGeometry(annex, sd, h0, lean), lean));
    // the deck on piles before the gable, the length of the plot, its edge beam
    const fz = D / 2, x0 = -W / 2 - annex, x1 = W / 2 + 0.2;
    sink.span('wood', x0, 0.32, fz, x1, 0.52, fz + deck);
    for (let x = x0 + 0.3; x <= x1 - 0.2; x += (x1 - x0 - 0.5) / Math.max(2, Math.round((x1 - x0) / 2.6))) {
      sink.span('wood', x - 0.14, -1.2, fz + deck - 0.4, x + 0.14, 0.32, fz + deck - 0.12);
    }
    if (!st.mobile) {
      // the fish boxes stacked by the doors, a row of barrels, the derrick at the deck's edge
      for (let k = 0; k < 5; k++) {
        const bx = -W * 0.4 + (k % 3) * 0.75, by = 0.52 + Math.floor(k / 3) * 0.32;
        sink.span('structureWood', bx, by, fz + 0.5, bx + 0.68, by + 0.3, fz + 1.0, { colour: shade(BOARD, 0.9 + look() * 0.2), decor: true, shadow: true });
      }
      for (let k = 0; k < 4; k++) sink.cylinder('structureWood', [W * 0.05 + k * 0.62, 0.52, fz + 1.4], 'y', 0.85, 0.29, 10, { colour: shade(BOARD, 0.85 + k * 0.05), decor: true, shadow: true });
      const mx = x0 + 1.2, mz = fz + deck - 0.6;
      sink.member('structureWood', [mx, 0.5, mz], [mx, 5.4, mz], 0.2, 0.2, [0, 0, 1], { colour: shade(BOARD, 0.75), decor: true, shadow: true, exposed: true });
      sink.member('structureWood', [mx, 1.2, mz], [mx + 3.2, 4.6, mz - 0.2], 0.16, 0.16, [0, 0, 1], { colour: shade(BOARD, 0.75), decor: true, shadow: true, exposed: true });
    }
  });
  return sink.finish();
};

/**
 * The boathouse (naust, the boatshed's plot): dry-stone side walls of fjord granite, the gables boarded and painted, the
 * wide doors to the slip on the water side (+z), a slate roof; the net store lean-to on the +x side; the slip down to
 * the shore before the doors.
 */
const naust: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx, [0.1, 0.75, 0.15]);
  const rng = st.rng;
  const bb = ctx.bounds;
  const slip = clamp((bb.maxZ - bb.minZ) * 0.14, 1.5, 2.6), store = clamp((bb.maxX - bb.minX) * 0.24, 2.2, 3.0);
  const W = clamp(bb.maxX - bb.minX - store - 0.8, 5.5, 9), D = clamp(bb.maxZ - bb.minZ - slip - 0.6, 7, 12);
  const cx = bb.minX + 0.4 + W / 2, cz = bb.minZ + 0.3 + D / 2;
  sink.placed(0, cx, 0, cz, () => {
    const wallH = 2.3, pitch = 40 + rng() * 5, tanP = Math.tan(pitch * Math.PI / 180), rise = (W / 2) * tanP;
    // the dry-stone walls along both sides and the back, laid thick
    for (const s of [-1, 1]) sink.span('stone', s > 0 ? W / 2 - 0.6 : -W / 2, -0.3, -D / 2, s > 0 ? W / 2 : -W / 2 + 0.6, wallH, D / 2);
    sink.span('stone', -W / 2 + 0.6, -0.3, -D / 2, W / 2 - 0.6, 1.6, -D / 2 + 0.6);
    // the gables: boards above the back wall, the whole water gable with its doors
    const back: Face = { origin: [0, 0, -D / 2], u: [-1, 0, 0], out: [0, 0, -1], width: W };
    wallPolygon(sink, st.paint, { ...back, origin: [0, 0, -D / 2 + 0.06] }, [[-W / 2 + 0.6, 1.6], [W / 2 - 0.6, 1.6], [W / 2, wallH], [0, wallH + rise], [-W / 2, wallH]], 0.12);
    const front: Face = { origin: [0, 0, D / 2], u: [1, 0, 0], out: [0, 0, 1], width: W };
    const dw = Math.min(3.4, W - 1.6), dh = 2.5;
    // the water gable's boards: the jambs either side of the doors, the head over them, the gable to the ridge
    for (const s of [-1, 1]) faceBox(sink, st.paint, front, s * (W / 2 - 0.6 + dw / 2) / 2, (wallH - 0.3) / 2, -0.06, W / 2 - 0.6 - dw / 2, wallH + 0.3, 0.12, {});
    faceBox(sink, st.paint, front, 0, (dh + wallH) / 2, -0.06, dw, wallH - dh, 0.12, {});
    wallPolygon(sink, st.paint, front, [[-W / 2, wallH], [W / 2, wallH], [0, wallH + rise]], 0.12);
    gateUnit(sink, front, 0, 0, dw, dh, shade(PAINT_RGB[st.paint], 0.8), { bucket: 'structureWood', width: 0.14, out: 0.05, colour: WHITE });
    if (!st.mobile) {
      for (let u = -W / 2 + 0.85; u < W / 2 - 0.7; u += 0.32) {
        if (Math.abs(u) < dw / 2 + 0.15) continue;
        const h = wallH + (W / 2 - Math.abs(u)) * tanP - 0.15;
        faceBox(sink, 'structureWood', front, u, h / 2 + 0.05, 0.075, 0.05, h - 0.1, 0.03, { colour: shade(PAINT_RGB[st.paint], 0.78), decor: true, fine: true }, 'caps');
      }
    }
    const roof = skifer(pitch, 0.32, 0.28);
    emitRoof(sink, roofGeometry(W, D, wallH, roof), roof);
    // the net store along the +x side: boards under a slate lean-to against the stone wall
    const sx0 = W / 2, sx1 = W / 2 + store, sd = Math.min(D - 1.0, 6.5), h1 = 2.0, h0 = 1.55;
    const sz0 = -D / 2 + 0.4;
    sink.span('stone', sx0, -0.3, sz0, sx1, 0.15, sz0 + sd);
    const e: Face = { origin: [(sx0 + sx1) / 2, 0, sz0 + sd], u: [1, 0, 0], out: [0, 0, 1], width: store };
    wallPolygon(sink, st.paint, e, [[-store / 2, 0.15], [store / 2, 0.15], [store / 2, h0], [-store / 2, h1]], sd);
    const lean: RoofSpec = { kind: 'shed', pitchDeg: Math.atan2(h1 - h0, store) * 180 / Math.PI, eave: 0.25, verge: 0.15, thickness: 0.1, bucket: 'roof' };
    sink.placed(0, (sx0 + sx1) / 2, 0, sz0 + sd / 2, () => emitRoof(sink, roofGeometry(store, sd, h0, lean), lean));
    // the slip before the doors: a ramp of granite setts and the timber runners on it, down to the plot's edge
    const z0 = D / 2, z1 = D / 2 + slip;
    sink.prism('stone', [[-dw / 2, 0.02, z0], [dw / 2, 0.02, z0], [dw / 2, -0.35, z1], [-dw / 2, -0.35, z1]], [0, -1, 0], 0.4);
    if (!st.mobile) for (const u of [-0.7, 0.7]) sink.member('structureWood', [u, 0.08, z0 - 0.4], [u, -0.28, z1], 0.14, 0.1, [0, 1, 0], { colour: shade(BOARD, 0.7), decor: true });
  });
  return sink.finish();
};

/**
 * The stockfish racks (hjell, the net yard's plot): A-frame trestles of rough poles under two long rails, the split fish
 * hanging in pairs over them to dry in the wind; a stack of fish boxes at one end.
 */
const hjell: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const look = ctx.variant, mobile = ctx.tier === 'mobile';
  const bb = ctx.bounds;
  const x0 = bb.minX + 0.15, x1 = bb.maxX - 0.15, z0 = bb.minZ + 0.15, z1 = bb.maxZ - 0.15, zc = (z0 + z1) / 2;
  const h = 3.2, pole = shade(BOARD, 0.72);
  const n = Math.max(3, Math.round((x1 - x0) / 1.7));
  for (let k = 0; k <= n; k++) {
    const x = x0 + (x1 - x0) * k / n;
    // the trestle: two legs from the plot's edges crossing just under the rail
    for (const s of [-1, 1]) sink.member('wood', [x, -0.2, s > 0 ? z1 : z0], [x, h + 0.15, zc - s * 0.25], 0.14, 0.14, [1, 0, 0], { exposed: true });
  }
  sink.member('wood', [x0, h - 0.05, zc], [x1, h - 0.05, zc], 0.14, 0.14, [0, 0, 1], { exposed: true });
  for (const zr of [z0 + (z1 - z0) * 0.22, z1 - (z1 - z0) * 0.22]) {
    sink.member('structureWood', [x0, 1.9, zr], [x1, 1.9, zr], 0.1, 0.1, [0, 0, 1], { colour: pole, decor: true, exposed: true });
  }
  if (!mobile) {
    // the fish: pairs hung over the rails, every 22 cm, a few gaps where a bundle was taken down
    for (const [zr, yr] of [[zc, h - 0.05], [z0 + (z1 - z0) * 0.22, 1.9], [z1 - (z1 - z0) * 0.22, 1.9]] as const) {
      for (let x = x0 + 0.3; x < x1 - 0.25; x += 0.22) {
        if (look() < 0.12) continue;
        const len = 0.75 + look() * 0.25, tone = shade(FISH, 0.82 + look() * 0.3);
        for (const s of [-1, 1]) sink.span('structureWood', x - 0.06, yr - len, zr + s * 0.07 - 0.015, x + 0.06, yr - 0.02, zr + s * 0.07 + 0.015, { colour: tone, decor: true, fine: true });
      }
    }
    for (let k = 0; k < 4; k++) sink.span('structureWood', x1 - 0.9, k * 0.32, z1 - 1.1 + (k % 2) * 0.05, x1 - 0.2, k * 0.32 + 0.3, z1 - 0.55 + (k % 2) * 0.05, { colour: shade(BOARD, 0.95 + look() * 0.15), decor: true, shadow: true });
  }
  return sink.finish();
};

// ------------------------------------------------------------------------------------------------ the church and the ruin

/**
 * The chapel (kapell): a white board nave with tall pointed windows under a steep slate roof, the tower on its front
 * gable with the door in its foot, the belfry's louvres and the slender spire with its cross.
 */
const kapell: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = { ...stateFor(ctx, [1, 0, 0]), boards: 'standing' as const, trim: WHITE };
  const rng = st.rng;
  const fit = wallsIn(ctx, 0.32, 0.12);
  const W = clamp(fit.w, 4.6, 8), D = clamp(fit.d, 7, 12);
  const tw = clamp(W * 0.42, 2.0, 2.8), td = clamp(tw, 2.0, 2.6);
  const Dn = D - td + 0.2;
  sink.placed(0, fit.cx, 0, fit.cz - (td - 0.2) / 2, () => {
    const openings: Opening[] = [];
    for (const face of ['right', 'left'] as const) {
      for (const o of windowRhythm(face, 0, Dn, { w: 0.8, h: 2.0, sill: 1.1, spacing: 2.0, margin: 1.0, max: 4 })) openings.push(o);
    }
    openings.push({ face: 'back', storey: 0, kind: 'window', u: 0, w: 0.7, h: 1.4, y0: 1.4 });
    const frame = buildHouse(sink, {
      w: W, d: Dn, plinth: footing(0.45), storeys: [{ h: 3.6, wall: 'plaster', framed: true }],
      roof: skifer(48 + rng() * 4, 0.3, 0.12), gableBucket: 'plaster', gableFramed: true, openings,
      chimneys: [], gutters: null, verge: { colour: WHITE, bucket: 'structureWood' }, reveal: 0.1, spall: null,
    }, dialect(st));
    // the pointed heads of the windows: a white gablet over each casing
    if (!st.mobile) {
      for (const o of openings.filter((p) => p.face === 'right' || p.face === 'left')) {
        const face = frame.faces[o.face];
        const y = frame.floors[0] + o.y0 + o.h + 0.16;
        wallPolygon(sink, 'structureWood', face, [[o.u - o.w / 2 - 0.1, y], [o.u + o.w / 2 + 0.1, y], [o.u, y + 0.45]], 0.04, { colour: WHITE, decor: true });
      }
    }
    // the tower on the front gable: the boarded shaft, the belfry with its louvres, the spire
    const z0 = Dn / 2 - 0.1, z1 = z0 + td, H = frame.eaveY + 2.4;
    sink.span('stone', -tw / 2 - 0.04, -0.3, z0, tw / 2 + 0.04, 0.45, z1 + 0.04);
    sink.span('plaster', -tw / 2, 0.45, z0, tw / 2, H, z1);
    const tf: Face = { origin: [0, 0, z1], u: [1, 0, 0], out: [0, 0, 1], width: tw };
    doorUnit(sink, tf, 0, 0.45, 1.0, 2.2, {
      leaf: shade(TAR, 1.4), frame: { bucket: 'structureWood', width: 0.12, out: 0.05, colour: WHITE },
      steps: { bucket: 'stone' }, leafKind: 'panel', transom: false,
    }, 0.45);
    const belfry: Face[] = [tf, { origin: [tw / 2, 0, (z0 + z1) / 2], u: [0, 0, -1], out: [1, 0, 0], width: td },
      { origin: [-tw / 2, 0, (z0 + z1) / 2], u: [0, 0, 1], out: [-1, 0, 0], width: td }];
    for (const f of belfry) {
      // the belfry's louvred openings
      faceBox(sink, 'dark', f, 0, H - 0.75, 0.01, Math.min(0.9, f.width - 0.6), 0.9, 0.02, { decor: true });
      if (!st.mobile) for (let k = 0; k < 4; k++) faceBox(sink, 'structureWood', f, 0, H - 1.1 + k * 0.22, 0.04, Math.min(0.9, f.width - 0.6), 0.05, 0.06, { colour: WHITE, decor: true, fine: true }, 'ends');
    }
    const spire: RoofSpec = { kind: 'hip', pitchDeg: 76, eave: 0.12, verge: 0.12, thickness: 0.1, bucket: 'roof', ridge: null };
    sink.placed(0, 0, 0, (z0 + z1) / 2, () => emitRoof(sink, roofGeometry(tw, td, H, spire), spire));
    const tip = H + (Math.min(tw, td) / 2) * Math.tan(76 * Math.PI / 180);
    sink.span('structureMetal', -0.035, tip - 0.1, (z0 + z1) / 2 - 0.035, 0.035, tip + 1.0, (z0 + z1) / 2 + 0.035, { colour: IRON, decor: true });
    sink.span('structureMetal', -0.28, tip + 0.62, (z0 + z1) / 2 - 0.03, 0.28, tip + 0.68, (z0 + z1) / 2 + 0.03, { colour: IRON, decor: true });
  });
  return sink.finish();
};

/**
 * The prayer house (bedehus) of the lay movement, in every Nordland village beside or instead of a chapel (round 2, gauntlet
 * wave 111b: "the same white chapel stands twice side by side"): a plain white board hall with no tower, its gable to the
 * road under a slate roof, a small entry porch (vindfang) on the gable with the door, three or four tall plain windows down
 * each long side, a small cross on the gable's apex.
 */
const bedehus: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = { ...stateFor(ctx, [1, 0, 0]), boards: 'lapped' as const, trim: WHITE };
  const rng = st.rng;
  const fit = wallsIn(ctx, 0.32, 0.12);
  const W = clamp(fit.w, 4.8, 8), porch = 1.6, D = clamp(fit.d - porch, 6.5, 11);
  sink.placed(0, fit.cx, 0, fit.cz - porch / 2, () => {
    const openings: Opening[] = [];
    for (const face of ['right', 'left'] as const) {
      for (const o of windowRhythm(face, 0, D, { w: 0.9, h: 1.7, sill: 1.0, spacing: 2.1, margin: 1.0, max: 4 })) openings.push(o);
    }
    openings.push({ face: 'back', storey: 0, kind: 'window', u: 0, w: 0.8, h: 1.2, y0: 1.3 });
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: footing(0.5), storeys: [{ h: 3.3, wall: 'plaster', framed: true }],
      roof: skifer(40 + rng() * 6, 0.3, 0.2), gableBucket: 'plaster', gableFramed: true, openings,
      chimneys: [{ x: 0, z: -D * 0.3, sx: 0.5, sz: 0.5, above: 0.7, bucket: 'plaster', cap: 'slab' }],
      gutters: null, verge: { colour: WHITE, bucket: 'structureWood' }, reveal: 0.1, spall: null,
    }, dialect(st));
    // the porch on the front gable: its own little gable over the door
    const pz0 = D / 2 - 0.02, pw = 2.4, ph = 2.6;
    sink.span('stone', -pw / 2 - 0.05, -0.3, pz0, pw / 2 + 0.05, 0.5, pz0 + porch + 0.05);
    sink.span('plaster', -pw / 2, 0.5, pz0, pw / 2, 0.5 + ph, pz0 + porch);
    const pf: Face = { origin: [0, 0, pz0 + porch], u: [1, 0, 0], out: [0, 0, 1], width: pw };
    doorUnit(sink, pf, 0, 0.5, 1.0, 2.1, {
      leaf: shade(TAR, 1.5), frame: { bucket: 'structureWood', width: 0.12, out: 0.05, colour: WHITE },
      steps: { bucket: 'stone' }, leafKind: 'panel', transom: false,
    }, 0.5);
    const pr: RoofSpec = { kind: 'gable', pitchDeg: 40, eave: 0.2, verge: 0.15, thickness: 0.12, bucket: 'roof' };
    sink.placed(Math.PI / 2, 0, 0, pz0 + porch / 2, () => emitRoof(sink, roofGeometry(porch, pw, 0.5 + ph, pr), pr));
    // the cross on the main gable's apex
    const apexY = frame.roof.ridgeTopY, az = D / 2 + 0.05;
    sink.span('structureMetal', -0.03, apexY - 0.05, az - 0.03, 0.03, apexY + 0.85, az + 0.03, { colour: IRON, decor: true });
    sink.span('structureMetal', -0.22, apexY + 0.52, az - 0.03, 0.22, apexY + 0.58, az + 0.03, { colour: IRON, decor: true });
  });
  return sink.finish();
};

/**
 * A house burnt in the fighting of May 1940 (the ruin's plot): the granite footing standing round the cellar, the
 * stack standing alone, charred studs at a corner, a fallen beam and the burnt floor's ash.
 */
const brent: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const look = ctx.variant, mobile = ctx.tier === 'mobile';
  const fit = wallsIn(ctx, 0.05, 0.05);
  const W = fit.w, D = fit.d, t = 0.5;
  sink.placed(0, fit.cx, 0, fit.cz, () => {
    const h = 0.9 + look() * 0.3;
    // the footing: four granite walls, one broken down
    const broken = Math.floor(look() * 4);
    const walls: Array<[number, number, number, number]> = [[-W / 2, -D / 2, W / 2, -D / 2 + t], [-W / 2, D / 2 - t, W / 2, D / 2],
      [-W / 2, -D / 2 + t, -W / 2 + t, D / 2 - t], [W / 2 - t, -D / 2 + t, W / 2, D / 2 - t]];
    walls.forEach(([a, b, c, d], k) => {
      if (k === broken) {
        sink.span('stone', a, -0.3, b, a + (c - a) * 0.35, h * 0.6, b + (d - b) * 0.35);
        sink.span('stone', a + (c - a) * 0.65, -0.3, b + (d - b) * 0.65, c, h * 0.8, d);
      } else sink.span('stone', a, -0.3, b, c, h, d);
    });
    // the stack, standing to the old roof's height
    const sx = (look() - 0.5) * W * 0.3, sz = (look() - 0.5) * D * 0.3;
    sink.span('stone', sx - 0.45, -0.3, sz - 0.45, sx + 0.45, 6.2 + look() * 0.8, sz + 0.45);
    sink.span('stone', sx - 0.55, 6.0 + look() * 0.2, sz - 0.55, sx + 0.55, 6.3, sz + 0.55);
    // the ash and the burnt floor in the cellar, the charred studs at a corner, a fallen beam
    sink.span('dark', -W / 2 + t, -0.1, -D / 2 + t, W / 2 - t, 0.15, D / 2 - t, { colour: CHAR });
    for (let k = 0; k < 3; k++) sink.span('structureWood', -W / 2 + t + 0.1 + k * 0.6, h, D / 2 - t - 0.2, -W / 2 + t + 0.26 + k * 0.6, h + 1.2 + look() * 1.4, D / 2 - t - 0.05, { colour: CHAR });
    if (!mobile) sink.member('structureWood', [-W / 2 + 0.8, 0.2, -D / 2 + 1.0], [W / 2 - 1.2, h + 0.6, D / 2 - 1.6], 0.2, 0.2, [0, 1, 0], { colour: CHAR, decor: true, exposed: true });
  });
  return sink.finish();
};

/**
 * The woodshed (vedskjul): a red board shed under a slate lean-to, open on its +x side with the cut wood stacked to the
 * eaves; the yards' outbuilding on its own small plot.
 */
const vedskjul: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const look = ctx.variant;
  const st = stateFor(ctx, [0.1, 0.8, 0.1]);
  const fit = wallsIn(ctx, 0.25, 0.18);
  const W = Math.max(2.4, fit.w), D = Math.max(2.4, fit.d);
  const hLo = 2.1, pitch = 18, hHi = hLo + W * Math.tan(pitch * Math.PI / 180);
  sink.placed(0, fit.cx, 0, fit.cz, () => {
    sink.span(st.paint, -W / 2, -0.2, -D / 2, -W / 2 + 0.12, hHi, D / 2);
    for (const sz of [-1, 1]) {
      const end: Face = { origin: [0, 0, sz * D / 2], u: [sz, 0, 0], out: [0, 0, sz], width: W };
      wallPolygon(sink, st.paint, end, sz > 0 ? [[-W / 2, -0.2], [W / 2, -0.2], [W / 2, hLo], [-W / 2, hHi]] : [[-W / 2, -0.2], [W / 2, -0.2], [W / 2, hHi], [-W / 2, hLo]], 0.1);
      faceBox(sink, 'structureWood', end, sz * (W / 2 - 0.07), (hLo - 0.2) / 2, 0.02, 0.14, hLo + 0.2, 0.04, { colour: WHITE, decor: true }, 'caps');
    }
    for (const sz of [-1, 0, 1]) sink.span('structureWood', W / 2 - 0.14, -0.2, sz * (D / 2 - 0.1) - 0.07, W / 2, hLo, sz * (D / 2 - 0.1) + 0.07, { colour: WHITE });
    const lean: RoofSpec = { kind: 'shed', pitchDeg: pitch, eave: 0.25, verge: 0.18, thickness: 0.1, bucket: 'roof' };
    emitRoof(sink, roofGeometry(W, D, hLo, lean), lean);
    if (ctx.tier !== 'mobile') {
      const back: Face = { origin: [-W / 2 + 0.12, 0, 0], u: [0, 0, -1], out: [1, 0, 0], width: D };
      woodpile(sink, back, -D / 2 + 0.2, D / 2 - 0.2, 1.4 + look() * 0.4, look);
    }
  });
  return sink.finish();
};

export const NORDLAND_BUILDERS: Readonly<Record<string, RegionalBuilder>> = Object.freeze({
  cottage: (ctx) => hus(ctx),
  logcabin: (ctx) => hus(ctx),
  alpine: (ctx) => hus(ctx, { two: true }),
  cornershop: landhandel,
  warehouse: sjohus,
  depot: lager,
  fishery: fiskebruk,
  boatshed: naust,
  netyard: hjell,
  // the village's two chapel plots: one keeps the towered chapel, the other is the prayer house (bedehus). The plot's own
  // depth splits them (Nordhavn's two plots measure 9.70 and 10.09 m; the split sits between them), so neither stream moves.
  chapel: (ctx) => (ctx.bounds.maxZ - ctx.bounds.minZ < 9.9 ? bedehus(ctx) : kapell(ctx)),
  ruin: brent,
  woodshed: vedskjul,
});

export const NORDLAND_STYLE: ArchitectureStyle = Object.freeze<ArchitectureStyle>({
  id: 'nordland',
  region: 'Ofoten, Nordland (the Ofotfjord, Bjerkvik and the Herjangsfjord), 1940: painted board houses, red quay warehouses, naust and hjell',
  surfaces: {
    // slate (skifer) from the Nordland quarries, blue-grey and lichened
    roof: { kind: 'slate', tint: [0.36, 0.38, 0.4] },
    // the fjord's granite and gneiss in the footings and quay walls
    // (round 3, gauntlet wave 129: the burnt town's rubble read as "a heap of white cube-shaped rubble"; the props' heaps
    // draw this stone) the gneiss weathered to a mid grey with a cool cast, not a pale granite
    stone: { kind: 'granite', tint: [0.45, 0.46, 0.47] },
    sourced: { plaster: false, wood: true },
    tones: {
      // white lead, a little chalky
      plaster: (_h, s, l) => [0.11, Math.min(1, s * 0.08), Math.min(1, l * 0.3 + 0.66)],
      // falu red, the iron-oxide red of the quays and the boathouses
      plaster2: (_h, s, l) => [0.012, Math.min(1, 0.5 + s * 0.2), Math.min(1, l * 0.32 + 0.16)],
      // ochre
      plaster3: (_h, s, l) => [0.105, Math.min(1, 0.45 + s * 0.2), Math.min(1, l * 0.4 + 0.3)],
    },
    // round 2 (the render canvas read as stucco on the painted board houses: the white church "popcorn" from the road):
    // linseed paint on sawn boards is a smooth skin, so the canvas's grain is all but gone and the boards' own lines (the
    // cladding's battens and laps, the corner boards) carry the wall (surfaces.relief)
    relief: { plasterUv: 2.8, normal: 0.1, ao: 0.25 },
  },
  builders: NORDLAND_BUILDERS,
  // paint weathered by salt and the long winters, the slates greyed with lichen, a wet coast
  weather: {
    plaster: [[1, 1, 1], [0.98, 0.97, 0.95], [0.95, 0.95, 0.94], [1.0, 0.98, 0.95]],
    stone: [[1, 1, 1], [0.95, 0.95, 0.94], [1.02, 1.01, 0.99], [0.9, 0.91, 0.91]],
    roof: [[1, 1, 1], [0.9, 0.9, 0.88], [1.06, 1.05, 1.02], [0.84, 0.86, 0.86]],
    damp: 0.7, moss: 0.45, mossTint: [0.92, 0.96, 0.84],
  },
  wear: 0.3,
  // the yards: white picket fences round the potato beds and the woodshed (yards.ts)
  yard: { kinds: ['cottage', 'logcabin', 'alpine'], fence: 'fencepicket', gate: 'gate', shed: 'woodshed', shedSize: [3.2, 2.8], garden: true },
});
