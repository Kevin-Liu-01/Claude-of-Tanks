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
  PartSink, faceBox, facePoint, facePanel, pick, rgb, shade, UV_MEMBER,
  type Face, type RegionalBucket, type Rgb, type Vec3,
} from './geometry.ts';
import {
  buildHouse, emitRoof, holedPolygon, roofGeometry, wallPolygon, windowRhythm,
  type HouseDialect, type HouseFrame, type Opening, type RoofSpec, type StoreySpec, type WallRect,
} from './house.ts';
import { doorUnit, windowUnit, type WindowStyle } from './openings.ts';
import { openShed } from './outbuildings.ts';
import { woodpile } from './dressing.ts';
import { boatHull, dryStoneFace, leantPole, roundPole, slipway } from './waterfront.ts';
import { recordLattice } from './lattice.ts';
import type { ArchitectureStyle, RegionalBuildContext, RegionalBuilder } from './types.ts';
import type { RegionalParts } from './geometry.ts';
import { fyr } from './fyr.ts'; // the light on its keeper's house (props census #5, lane B)

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
      // (round 5, gauntlet wave 243, the chase: "plain boxes with tiny blank window squares"): the joinery as broad as the
      // houses carry it, so it reads from the street — the casing 15 cm (was 10), its crown 25 cm deep (was 17), the sill
      // out 10 cm
      frame: trim, frameWidth: 0.08, frameOut: 0.04, bars: 'six',
      // the board casing round each window, its head board deeper: the little crown (kroning) over it
      surround: { bucket: 'structureWood', width: 0.15, out: 0.04, lintel: 0.25, colour: trim },
      sill: { bucket: 'structureWood', out: 0.1, colour: trim },
      shutters: null,
    },
  };
}

/** The holes a face's openings cut, widened by their casings: [u0, u1, y0, y1] on the face. */
function casings(openings: readonly Opening[], y0: number): Array<readonly [number, number, number, number]> {
  return openings.map((o) => [o.u - o.w / 2 - 0.19, o.u + o.w / 2 + 0.19, y0 + o.y0 - 0.12, y0 + o.y0 + o.h + 0.32] as const);
}

/**
 * The board cladding of a timber wall: the white corner boards on every house (they read from across the harbour), and
 * the boards' own lines, broken at the openings — battens over the joints of standing boards every 32 cm, or the
 * shadow line of each lapped board every 18 cm.
 */
function cladding(sink: PartSink, face: Face, rect: WallRect, openings: readonly Opening[], st: NordState): void {
  const { u0, u1, y0, y1 } = rect;
  for (const u of [u0 + 0.08, u1 - 0.08]) {
    faceBox(sink, 'structureWood', face, u, (y0 + y1) / 2, 0.025, 0.2, y1 - y0, 0.05, { colour: st.trim, decor: true }, 'caps');
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

/**
 * A boathouse's or a store's double doors (the props census, 2026-10-14: the fiskebruk's and the naust's painted wickets,
 * gateUnit's dark panel): two plank leaves at the back of the reveal (or a little proud of a face with none), each with
 * its ledges and its brace rising from the hinge side, the iron strap hinges, the white frame; and in a leaf wide and tall
 * enough, the wicket as joinery — its frame standing out of the leaf, its own boards set back in it, its hinges and ring.
 */
function boatDoor(sink: PartSink, face: Face, u: number, y: number, w: number, h: number, leaf: Rgb,
  frame: { bucket: RegionalBucket; width: number; out: number; colour?: Rgb } | null, opts: { leaves?: 1 | 2; hinge?: -1 | 1 } = {}): void {
  // (props census #25: one leaf alone, `w` wide and hung on its `hinge` side — a leaf swung back against the boards)
  const single = opts.leaves === 1, hingeSide = opts.hinge ?? -1;
  const r = sink.recess, go = r > 0 ? -r + 0.03 : 0.015, half = single ? w - 0.04 : w / 2 - 0.02;
  const lc = { colour: leaf, decor: true, uv: UV_MEMBER } as const, fine = { decor: true, fine: true } as const;
  const ledge = shade(leaf, 0.84);
  const wicket = half >= 1.05 && h >= 2.2;
  const ww = Math.min(0.78, half - 0.3), wh = Math.min(1.85, h - 0.45), wu = (single ? u : u - w / 4) + 0.05, wy = y + 0.2, ft = 0.06;
  for (const side of single ? [hingeSide] : [-1, 1]) {
    const cu = single ? u : u + side * w / 4;
    faceBox(sink, 'structureWood', face, cu, y + h / 2, go, half, h, 0.05, lc);
    const holed = wicket && side < 0;
    for (const t of [0.12, 0.5, 0.88]) {
      const by = y + h * t;
      const runs: Array<[number, number]> = holed && by > wy - 0.06 && by < wy + wh + 0.06
        ? [[cu - half / 2 + 0.05, wu - ww / 2 - ft], [wu + ww / 2 + ft, cu + half / 2 - 0.05]] : [[cu - half / 2 + 0.05, cu + half / 2 - 0.05]];
      for (const [a, b] of runs) if (b - a > 0.08) faceBox(sink, 'structureWood', face, (a + b) / 2, by, go + 0.035, b - a, 0.11, 0.025, { colour: ledge, ...fine });
      const edge = cu + side * half / 2;
      faceBox(sink, 'structureMetal', face, edge - side * 0.32, by + 0.08, go + 0.03, 0.62, 0.045, 0.01, { colour: IRON, ...fine });
    }
    // the brace between the ledges, rising from the hinge side toward the meeting stile (not across the wicket)
    if (!holed) {
      const a = facePoint(face, cu + side * (half / 2 - 0.12), y + h * 0.12 + 0.06, go + 0.035);
      const b = facePoint(face, cu - side * (half / 2 - 0.12), y + h * 0.5 - 0.06, go + 0.035);
      sink.member('structureWood', a, b, 0.1, 0.025, face.out, { colour: ledge, ...fine }, 0);
    }
  }
  if (wicket) {
    const wc = { colour: shade(leaf, 0.9), decor: true, fineSides: true, uv: UV_MEMBER } as const;
    for (const side of [-1, 1]) faceBox(sink, 'structureWood', face, wu + side * (ww / 2 + ft / 2), wy + wh / 2, go + 0.03, ft, wh + 2 * ft, 0.03, wc);
    faceBox(sink, 'structureWood', face, wu, wy + wh + ft / 2, go + 0.03, ww, ft, 0.03, wc);
    faceBox(sink, 'structureWood', face, wu, wy - ft / 2, go + 0.035, ww, ft, 0.04, wc);
    faceBox(sink, 'structureWood', face, wu, wy + wh / 2, go + 0.028, ww - 0.01, wh - 0.01, 0.012, { colour: shade(leaf, 1.07), decor: true, uv: UV_MEMBER });
    for (const t of [0.2, 0.8]) faceBox(sink, 'structureMetal', face, wu - ww / 2 + 0.17, wy + wh * t, go + 0.04, 0.3, 0.04, 0.01, { colour: IRON, ...fine });
    faceBox(sink, 'structureMetal', face, wu + ww / 2 - 0.12, wy + wh * 0.5, go + 0.045, 0.1, 0.1, 0.012, { colour: IRON, ...fine });
  }
  if (!frame) return;
  const fo = { decor: true, ...(frame.colour ? { colour: frame.colour } : {}) };
  faceBox(sink, frame.bucket, face, u - w / 2 - frame.width / 2, y + h / 2, frame.out / 2, frame.width, h, frame.out, fo);
  faceBox(sink, frame.bucket, face, u + w / 2 + frame.width / 2, y + h / 2, frame.out / 2, frame.width, h, frame.out, fo);
  faceBox(sink, frame.bucket, face, u, y + h + frame.width / 2, frame.out / 2, w + 2 * frame.width, frame.width, frame.out, fo);
}

/**
 * A belfry's louvred opening in its reveal (cut by the house): sloped white boards across it, seated in the jambs, the
 * dark of the belfry between them.
 */
function belfryLouvres(sink: PartSink, face: Face, u: number, y: number, w: number, h: number): void {
  const r = sink.recess, back = r > 0 ? -r * 0.5 : 0.02, n = Math.max(4, Math.round(h / 0.26));
  for (let k = 0; k < n; k++) {
    const yy = y + (k + 0.6) * h / (n + 0.2);
    const a = facePoint(face, u - w / 2 - 0.02, yy + 0.06, back - 0.06), b = facePoint(face, u + w / 2 + 0.02, yy + 0.06, back - 0.06);
    const c = facePoint(face, u + w / 2 + 0.02, yy - 0.06, back + 0.06), d = facePoint(face, u - w / 2 - 0.02, yy - 0.06, back + 0.06);
    sink.quad('structureWood', d, c, b, a, { colour: WHITE, decor: true });
  }
}

function dialect(st: NordState): HouseDialect {
  return {
    window: (sink, face, o, y0) => windowUnit(sink, face, o.u, y0 + o.y0, o.w, o.h,
      o.kind === 'loft' ? { ...st.window, bars: 'cross', surround: { ...st.window.surround!, lintel: 0.1 } } : st.window,
      st.rng, o.kind === 'loft' ? 0.1 : st.litShare),
    door: (sink, face, o, y0, frame) => {
      if (o.kind === 'gate') {
        boatDoor(sink, face, o.u, y0 + o.y0, o.w, o.h, shade(PAINT_RGB[st.paint], 0.82), { bucket: 'structureWood', width: 0.14, out: 0.05, colour: st.trim });
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

/** The roofs: slate on battens, the eaves and verges out over the boards, a saddle ridge. (Round 5, wave 243: "no ... eaves":
 * the eaves half a metre out, was 0.38; the verges 0.38, was 0.28.) */
const skifer = (pitch: number, eave = 0.5, verge = 0.38, kind: RoofSpec['kind'] = 'gable'): RoofSpec =>
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
    // (round 5) the windows a size up (were 0.85 x 1.2), the loft's too
    for (const o of windowRhythm('front', 0, W, { w: 0.95, h: 1.35, sill: 0.8, spacing: 1.9, margin: 0.75, max: 2,
      avoid: [[doorU - (porch ? 1.2 : 0.75), doorU + (porch ? 1.2 : 0.75)]] })) openings.push(o);
    for (const face of ['right', 'left'] as const) {
      for (const o of windowRhythm(face, 0, Db, { w: 0.95, h: 1.35, sill: 0.8, spacing: 2.0, margin: 0.9, max: 4 })) openings.push(o);
      if (two) for (const o of windowRhythm(face, 1, Db, { w: 0.95, h: 1.3, sill: 0.75, spacing: 2.0, margin: 0.9, max: 4 })) openings.push(o);
    }
    for (const o of windowRhythm('back', 0, W, { w: 0.95, h: 1.35, sill: 0.8, spacing: 2.0, margin: 0.9, max: 2 })) openings.push(o);
    if (two) {
      openings.push({ face: 'front', storey: 1, kind: 'door', u: 0, w: 0.9, y0: 0, h: 2.0 });
      for (const o of windowRhythm('back', 1, W, { w: 0.95, h: 1.3, sill: 0.75, spacing: 2.0, margin: 0.9, max: 2 })) openings.push(o);
    } else {
      // the loft's gable windows
      for (const face of ['front', 'back'] as const) {
        for (const o of windowRhythm(face, 1, W, { w: 0.8, h: 0.95, sill: 0.3, spacing: 1.4, margin: W * 0.28, max: 2, kind: 'loft' })) openings.push(o);
      }
    }
    const frame = buildHouse(sink, {
      w: W, d: Db, plinth: footing(two ? 0.7 : 0.55), storeys: sts,
      roof: skifer(two ? 33 + rng() * 5 : 37 + rng() * 6), gableBucket: st.paint, gableFramed: true, openings,
      // (round 5, wave 243: "no ... chimneys" from the chase) the stack broader and a third of a metre taller
      chimneys: [{ x: 0, z: (rng() - 0.5) * Db * 0.3, sx: 0.72, sz: 0.72, above: 1.1, bucket: 'stone', cap: 'slab' }],
      gutters: null, verge: { colour: st.trim, bucket: 'structureWood' }, reveal: 0.12, spall: null,
    }, dialect(st));
    const f = frame.faces.front;
    if (two) veranda(sink, f, frame, porch, st);
    else if (porch) bislag(sink, f, 0, porch, st);
    // (phoneIdentity: dressing a phone leaves out but draws, sink.dressing)
    sink.dressing(st.mobile, () => {
      if (look() >= 0.7) return;
      const side = look() < 0.5 ? frame.faces.right : frame.faces.left;
      woodpile(sink, side, -side.width / 2 + 0.6, -side.width / 2 + 0.6 + Math.min(2.4, side.width * 0.35), 1.1 + look() * 0.4, look);
    });
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
  // (the r2 sweep, 2026-10-16: the door's leaf lay on the dado and the glazing behind it, a painted plate) the boarded
  // base and the lower glazing stop at the door's frame either side: the door hangs in its own opening
  const dh = 0.85 / 2 + 0.12;
  for (const sg of [-1, 1]) faceBox(sink, st.paint, face, sg * (dh + w / 2) / 2, y0 + 0.425, depth / 2, w / 2 - dh, 0.85, depth, {});
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
      if (f === front && ya < y0 + 1) {
        for (const sg of [-1, 1]) facePanel(sink, 'glass', f, sg * (dh + span / 2 - 0.15) / 2, (ya + yb) / 2, -0.04, span / 2 - 0.15 - dh, yb - ya, {});
        // the light over the door, from its frame's head to the band's top (the cut glazing left the veranda open there)
        const th = y0 + 2.0;
        if (yb > th + 0.05) facePanel(sink, 'glass', f, 0, (th + yb) / 2, -0.04, 2 * dh, yb - th, { decor: true });
        if (st.mobile) continue;
        for (const sg of [-1, 1]) faceBox(sink, 'structureWood', f, sg * (dh + 0.025), (ya + yb) / 2, -0.02, 0.05, yb - ya, 0.04, { colour: WHITE, decor: true, fine: true }, 'caps');
        continue;
      }
      facePanel(sink, 'glass', f, 0, (ya + yb) / 2, -0.04, span - 0.3, yb - ya, {});
      if (st.mobile) continue;
      const n = Math.max(2, Math.round(span / 0.55));
      for (let k = 1; k < n; k++) faceBox(sink, 'structureWood', f, -span / 2 + 0.15 + (span - 0.3) * k / n, (ya + yb) / 2, -0.02, 0.05, yb - ya, 0.04, { colour: WHITE, decor: true, fine: true }, 'caps');
      faceBox(sink, 'structureWood', f, 0, ya + (yb - ya) * 0.66, -0.02, span - 0.3, 0.05, 0.04, { colour: WHITE, decor: true, fine: true }, 'ends');
    }
  }
  doorUnit(sink, front, 0, y0, 0.85, 2.0, {
    leaf: st.door, frame: { bucket: 'structureWood', width: 0.1, out: 0.04, colour: WHITE },
    // (props census #15, Lane C co-hold 2026-10-16: a glazed leaf on the veranda's solid front laid its glass on the wood)
    steps: { bucket: 'stone' }, leafKind: 'panel', transom: false,
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
      chimneys: [{ x: (rng() - 0.5) * W * 0.3, z: -D * 0.15, sx: 0.75, sz: 0.75, above: 1.15, bucket: 'stone', cap: 'slab' }],
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
    sink.dressing(st.mobile, () => {
      if (look() >= 0.7) return;
      for (let k = 0; k < 3; k++) sink.cylinder('structureWood', [W * 0.15 + k * 0.62, 0.8, fz + 0.7 + (k % 2) * 0.3], 'y', 0.85, 0.28, 10, { colour: shade(BOARD, 0.9 + k * 0.08), decor: true, shadow: true });
    });
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
    // (round 5, wave 243: "tiny blank window squares") the store's high windows a size up (were 0.7 x 0.6)
    for (const o of windowRhythm('left', 0, D, { w: 0.85, h: 0.8, sill: 1.5, spacing: 3.0, margin: 1.5, max: 6 })) openings.push(o);
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
    sink.dressing(st.mobile, () => {
      // the hoist beam's block and its fall down past the loft door, the hook over the deck
      faceBox(sink, 'structureMetal', f, 0, yb - 0.24, 1.25, 0.14, 0.26, 0.14, { colour: IRON, decor: true });
      const y0 = frame.floors[1] + 0.25;
      faceBox(sink, 'structureMetal', f, 0, (yb - 0.37 + y0) / 2, 1.25, 0.022, yb - 0.37 - y0, 0.022, { colour: rgb(0x6a5e4c), decor: true, fine: true });
      faceBox(sink, 'structureMetal', f, 0, y0 - 0.06, 1.25, 0.07, 0.12, 0.05, { colour: IRON, decor: true, fine: true });
    });
    // the salting shed against the -x side (props census #25: "one extruded polygon with a gate laid on its solid side"):
    // its own boarded body on a granite sill, its gate cut through its outer wall, under a slate pent falling outward; built
    // in a frame turned half round, so the pent (rising toward its own -x) rises toward the hall
    const sd = Math.min(D - 0.6, 9), sz0 = -D / 2 + 0.2, h1 = 3.0, h0 = 2.35, sill = 0.35;
    const pitchS = Math.atan2(h1 - h0, annex) * 180 / Math.PI;
    sink.placed(Math.PI, -W / 2 - annex / 2, 0, sz0 + sd / 2, () => {
      const shed = buildHouse(sink, {
        w: annex, d: sd, plinth: { h: sill, out: 0.05, bucket: 'stone' }, storeys: [{ h: h0 - sill, wall: 'plaster2', framed: true }],
        roof: { kind: 'shed', pitchDeg: pitchS, eave: 0.3, verge: 0.2, thickness: 0.1, bucket: 'roof' }, gableBucket: 'plaster2',
        openings: [{ face: 'right', storey: 0, kind: 'gate', u: -sd * 0.3, w: 1.8, y0: 0, h: Math.min(1.9, h0 - sill - 0.08) },
          { face: 'right', storey: 0, kind: 'loft', u: sd * 0.15, w: 0.55, y0: 1.0, h: 0.45 },
          { face: 'right', storey: 0, kind: 'loft', u: sd * 0.36, w: 0.55, y0: 1.0, h: 0.45 }],
        chimneys: [], gutters: null, verge: null, reveal: 0.1, spall: null,
      }, dialect({ ...st, paint: 'plaster2' }));
      const rise = annex * Math.tan(pitchS * Math.PI / 180), s2 = annex / 2;
      wallPolygon(sink, 'plaster2', shed.faces.front, [[s2, h0], [-s2, h0 + rise], [-s2, h0]], 0.06);
      wallPolygon(sink, 'plaster2', shed.faces.back, [[-s2, h0], [s2, h0], [s2, h0 + rise]], 0.06);
    });
    // the deck on piles before the gable, the length of the plot: its decking slab (structure: the quay a hull drives onto)
    // and, as joinery, its planks across the joists, the joists on their bearers, the pile bents at both edges braced
    // across, the edge beam
    const fz = D / 2, x0 = -W / 2 - annex, x1 = W / 2 + 0.2, dy = 0.52;
    sink.span('wood', x0, dy - 0.2, fz, x1, dy, fz + deck);
    const bents = Math.max(2, Math.round((x1 - x0) / 2.6));
    for (let k = 0; k <= bents; k++) {
      const x = x0 + 0.3 + (x1 - x0 - 0.6) * k / bents;
      sink.span('wood', x - 0.14, -1.2, fz + deck - 0.4, x + 0.14, dy - 0.2, fz + deck - 0.12);
    }
    sink.dressing(st.mobile, () => {
      const wet = shade(BOARD, 0.72), plank = shade(BOARD, 0.95), bearer = { colour: shade(BOARD, 0.62), decor: true } as const;
      for (let k = 0; k <= bents; k++) {
        const x = x0 + 0.3 + (x1 - x0 - 0.6) * k / bents;
        // the inner pile of the bent, its bearer across the two, the X braces between them (tarred, wet at the foot)
        sink.span('structureWood', x - 0.12, -0.9, fz + 0.15, x + 0.12, dy - 0.2, fz + 0.39, { colour: wet, decor: true });
        sink.span('structureWood', x - 0.11, dy - 0.42, fz + 0.05, x + 0.11, dy - 0.2, fz + deck - 0.02, bearer);
        sink.member('structureWood', [x, -0.7, fz + 0.39], [x, dy - 0.45, fz + deck - 0.4], 0.1, 0.06, [1, 0, 0], { colour: wet, decor: true, exposed: true }, 0);
        sink.member('structureWood', [x, dy - 0.45, fz + 0.39], [x, -0.7, fz + deck - 0.4], 0.1, 0.06, [1, 0, 0], { colour: wet, decor: true, exposed: true }, 0);
      }
      // the planks over the slab, laid across the deck board by board, their joints the slab's dark between them and their
      // weathering each its own (a plank's top only: its edges stand a centimetre over the slab)
      const pw = 0.24, n = Math.floor((x1 - x0) / pw);
      for (let k = 0; k < n; k++) {
        const xa = x0 + k * pw + 0.008, xb = xa + pw - 0.016, y = dy + 0.008 + look() * 0.006;
        sink.quad('structureWood', [xa, y, fz + deck], [xb, y, fz + deck], [xb, y, fz + 0.02], [xa, y, fz + 0.02], { colour: shade(plank, 0.86 + look() * 0.24), decor: true });
      }
      // the edge beam along the water side
      sink.span('structureWood', x0, dy - 0.32, fz + deck - 0.02, x1, dy + 0.06, fz + deck + 0.1, { colour: shade(BOARD, 0.7), decor: true });
    });
    sink.dressing(st.mobile, () => {
      // the fish boxes stacked by the doors, a row of barrels, the derrick at the deck's edge
      const top = dy + 0.035;
      for (let k = 0; k < 5; k++) {
        const bx = -W * 0.4 + (k % 3) * 0.75, by = top + Math.floor(k / 3) * 0.32;
        sink.span('structureWood', bx, by, fz + 0.5, bx + 0.68, by + 0.3, fz + 1.0, { colour: shade(BOARD, 0.9 + look() * 0.2), decor: true, shadow: true });
      }
      for (let k = 0; k < 4; k++) sink.cylinder('structureWood', [W * 0.05 + k * 0.62, top, fz + 1.4], 'y', 0.85, 0.29, 10, { colour: shade(BOARD, 0.85 + k * 0.05), decor: true, shadow: true });
      const mx = x0 + 1.2, mz = fz + deck - 0.6, mast = shade(BOARD, 0.75);
      sink.member('structureWood', [mx, top - 0.02, mz], [mx, 5.4, mz], 0.2, 0.2, [0, 0, 1], { colour: mast, decor: true, shadow: true, exposed: true });
      sink.member('structureWood', [mx, 1.2, mz], [mx + 3.2, 4.6, mz - 0.2], 0.16, 0.16, [0, 0, 1], { colour: mast, decor: true, shadow: true, exposed: true });
      // the derrick's topping lift from the mast head to the boom's end (kitConnectivity: the boom's end hung on nothing)
      sink.member('structureMetal', [mx + 0.06, 5.32, mz + 0.04], [mx + 3.16, 4.66, mz - 0.14], 0.03, 0.03, [0, 0, 1], { colour: IRON, decor: true, exposed: true, fine: true }, 0.04);
      // the boom's block, its fall and hook over the deck's edge; the guy from the mast head back to a cleat on the deck
      sink.span('structureMetal', mx + 3.08, 4.32, mz - 0.27, mx + 3.24, 4.56, mz - 0.13, { colour: IRON, decor: true });
      sink.member('structureMetal', [mx + 3.16, 4.33, mz - 0.2], [mx + 3.16, 2.0, mz - 0.2], 0.025, 0.025, [0, 0, 1], { colour: rgb(0x6a5e4c), decor: true, exposed: true, fine: true }, 0);
      sink.span('structureMetal', mx + 3.12, 1.86, mz - 0.24, mx + 3.2, 2.0, mz - 0.16, { colour: IRON, decor: true, fine: true });
      sink.member('structureMetal', [mx - 0.04, 5.3, mz], [mx - 1.0, top + 0.02, mz - 0.9], 0.025, 0.025, [0, 0, 1], { colour: IRON, decor: true, exposed: true, fine: true }, 0);
    });
  });
  return sink.finish();
};

/**
 * The boathouse (naust, the boatshed's plot; props census #25, the looks lane 2026-10-15: "dry-stone walls as single
 * spans, blank on every face; the net store a blank polygon; the slip one prism"): its side and back walls of fjord
 * granite laid dry in courses, battered out at the foot, on a footing sunk into the shore; the water gable boarded and
 * painted between the walls' stone cheeks, the doors to the slip on their strap hinges, one leaf swung back against the
 * boards and the færing drawn half out through it onto the slip; the boarded gables, the white barge boards, the slate
 * roof on its rafters; the net store a boarded lean-to on its own sill against the +x wall with its own door; the slip
 * of setts between its kerbs, the runners on it; oars against the boards.
 */
const naust: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx, [0.1, 0.75, 0.15]);
  const rng = st.rng, look = st.look;
  const bb = ctx.bounds;
  const slip = clamp((bb.maxZ - bb.minZ) * 0.14, 1.5, 2.6), store = clamp((bb.maxX - bb.minX) * 0.24, 2.2, 3.0);
  const W = clamp(bb.maxX - bb.minX - store - 0.8, 5.5, 9), D = clamp(bb.maxZ - bb.minZ - slip - 0.6, 7, 12);
  const cx = bb.minX + 0.4 + W / 2, cz = bb.minZ + 0.3 + D / 2;
  const paint = PAINT_RGB[st.paint], lichen: Rgb = [1.06, 1.03, 0.78];
  sink.placed(0, cx, 0, cz, () => {
    const foot = 0.15, wallH = 2.5, pitch = 40 + rng() * 5, cheek = 0.6, top = foot + wallH;
    // the doors as wide as the boats (to 3.2 m) and nearly the wall's height; one leaf swung back flat against the boards
    // where the front has the room for it beside the opening (the boat then drawn half out through it)
    const a = W / 2 - cheek, dw = Math.min(3.2, 2 * a - 0.5), dh = 2.2, open = dw + 0.24 <= a;
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: foot, out: 0.08, bucket: 'stone', course: false }, storeys: [{ h: wallH, wall: 'stone' }],
      roof: skifer(pitch, 0.42, 0.3), gableBucket: st.paint, gableFramed: true, openings: [],
      // the water gable between the stone cheeks is boards (below), not the walls' granite
      abutted: [{ face: 'front', u0: -a, u1: a }],
      chimneys: [], gutters: null, verge: { colour: WHITE, bucket: 'structureWood' }, reveal: 0.1, spall: null, rafters: shade(BOARD, 0.66),
    }, dialect(st));
    const f = frame.faces.front;
    // the boarded front: the boards round the door opening, the opening cut through them
    holedPolygon(sink, st.paint, f, [[-a, foot], [a, foot], [a, top], [-a, top]], [{ u0: -dw / 2, u1: dw / 2, y0: foot, y1: foot + dh }], 0.1, 0);
    // the boat store behind the doors: its dark round the boat (a room seen through the open leaf)
    const rd = 2.4, dark = { decor: true } as const;
    sink.quad('dark', [-dw / 2, foot, D / 2 - rd], [dw / 2, foot, D / 2 - rd], [dw / 2, foot + dh, D / 2 - rd], [-dw / 2, foot + dh, D / 2 - rd], dark);
    sink.quad('dark', [dw / 2, foot, D / 2 - rd], [dw / 2, foot, D / 2 - 0.1], [dw / 2, foot + dh, D / 2 - 0.1], [dw / 2, foot + dh, D / 2 - rd], dark);
    sink.quad('dark', [-dw / 2, foot, D / 2 - 0.1], [-dw / 2, foot, D / 2 - rd], [-dw / 2, foot + dh, D / 2 - rd], [-dw / 2, foot + dh, D / 2 - 0.1], dark);
    sink.quad('dark', [-dw / 2, foot + dh, D / 2 - 0.1], [-dw / 2, foot + dh, D / 2 - rd], [dw / 2, foot + dh, D / 2 - rd], [dw / 2, foot + dh, D / 2 - 0.1], dark);
    sink.quad('dark', [-dw / 2, foot + 0.01, D / 2 - rd], [-dw / 2, foot + 0.01, D / 2 - 0.1], [dw / 2, foot + 0.01, D / 2 - 0.1], [dw / 2, foot + 0.01, D / 2 - rd], dark);
    // the doors: the left leaf shut in the opening, the right swung back flat against the boards (or both shut)
    sink.recess = 0.08;
    try {
      if (open) boatDoor(sink, f, -dw / 4, foot, dw / 2, dh, shade(paint, 0.8), null, { leaves: 1, hinge: -1 });
      else boatDoor(sink, f, 0, foot, dw, dh, shade(paint, 0.8), null);
    } finally { sink.recess = 0; }
    // (the r2 sweep, 2026-10-16: the leaf laid flat on the boards read as a painted plate) the right leaf stands swung out
    // on its hinge at the jamb, a little past square, its face turned to the slip
    if (open) {
      const sw = 0.62 * Math.PI, du: Vec3 = [-f.u[0] * Math.cos(sw) + f.out[0] * Math.sin(sw), 0, -f.u[2] * Math.cos(sw) + f.out[2] * Math.sin(sw)];
      const leafFace: Face = { origin: facePoint(f, dw / 2 + 0.04, 0, 0.02), u: du, out: [-du[2], 0, du[0]], width: dw / 2 };
      boatDoor(sink, leafFace, dw / 4 + 0.03, foot + 0.02, dw / 2, dh - 0.04, shade(paint, 0.78), null, { leaves: 1, hinge: -1 });
    }
    // the opening's white frame
    const fo = { colour: WHITE, decor: true };
    for (const sgn of [-1, 1]) faceBox(sink, 'structureWood', f, sgn * (dw / 2 + 0.07), foot + dh / 2, 0.025, 0.14, dh, 0.05, fo);
    faceBox(sink, 'structureWood', f, 0, foot + dh + 0.07, 0.025, dw + 0.28, 0.14, 0.05, fo);
    cladding(sink, f, { u0: -a, u1: a, y0: foot, y1: top }, [{ face: 'front', storey: 0, kind: 'gate', u: 0, w: dw + 0.9, y0: 0, h: dh }], st);
    // the dry-stone courses on the walls' outer faces and the front's cheeks (the net store's wall left bare behind it)
    const sd = Math.min(D - 1.0, 6.5), sz0 = -D / 2 + 0.4;
    sink.dressing(st.mobile, () => {
      const dry = (face: Face, u0: number, u1: number) => dryStoneFace(sink, face, u0, u1, -0.2, top, look, { batter: 0.14, lichen });
      dry(frame.faces.left, -D / 2, D / 2);
      dry(frame.faces.back, -W / 2, W / 2);
      dry(frame.faces.right, -D / 2, -(sz0 + sd) - 0.05);
      dry(frame.faces.right, -sz0 + 0.05, D / 2);
      dry(f, -W / 2, -a);
      dry(f, a, W / 2);
    });
    // the net store: a boarded lean-to on its own sill against the +x wall, its pent falling outward, its door in its end
    const h0 = 1.66, h1 = 2.0, pitchS = Math.atan2(h1 - h0, store) * 180 / Math.PI;
    sink.placed(0, W / 2 + store / 2, 0, sz0 + sd / 2, () => {
      const shed = buildHouse(sink, {
        w: store, d: sd, plinth: { h: 0.14, out: 0.04, bucket: 'stone', course: false }, storeys: [{ h: h0 - 0.14, wall: st.paint, framed: true }],
        roof: { kind: 'shed', pitchDeg: pitchS, eave: 0.22, verge: 0.14, thickness: 0.1, bucket: 'roof' }, gableBucket: st.paint,
        openings: [{ face: 'front', storey: 0, kind: 'door', u: store * 0.1, w: 0.85, y0: 0, h: h0 - 0.22 },
          { face: 'right', storey: 0, kind: 'loft', u: 0, w: 0.5, y0: 0.75, h: 0.42 }],
        chimneys: [], gutters: null, verge: null, reveal: 0.06, spall: null,
      }, dialect(st));
      const rise = store * Math.tan(pitchS * Math.PI / 180), s2 = store / 2;
      wallPolygon(sink, st.paint, shed.faces.front, [[s2, h0], [-s2, h0 + rise], [-s2, h0]], 0.06);
      wallPolygon(sink, st.paint, shed.faces.back, [[-s2, h0], [s2, h0], [s2, h0 + rise]], 0.06);
    });
    // the slip before the doors, down to the plot's water edge; the færing drawn half out of the store onto it
    const z0 = D / 2 + 0.04, z1 = Math.max(z0 + 0.8, bb.maxZ - cz - 0.08);
    slipway(sink, 0, dw + 0.3, z0, z1, foot, -0.35, BOARD, { mobile: st.mobile });
    sink.dressing(st.mobile, () => {
      // the færing on the runners, its bow on the slip and its stern in the dark of the store (the keel follows the slip's fall)
      const len = 5.2, bz = z1 - len / 2 - 0.2, fall = (-0.35 - foot) / Math.max(0.1, z1 - z0);
      const yBow = foot + fall * clamp(bz + len / 2 - z0, 0, z1 - z0) + 0.15;
      if (open) boatHull(sink, [dw / 4, Math.max(foot + 0.15, yBow + 0.1), bz], -Math.PI / 2, { length: len, beam: Math.min(1.42, dw / 2 - 0.2), depth: 0.55, sheer: 0.3,
        stern: 'double', flat: 0.12, colour: pick(look, [rgb(0x2a2622), rgb(0x8a8a82), rgb(0xd8d4c8)]), inside: rgb(0x9a7a56), gunwale: shade(BOARD, 0.6), thwarts: 3 });
      for (const k of [0, 1]) leantPole(sink, f, -dw / 2 - 0.5 - k * 0.2, 0.5 + k * 0.08, 3.1, -0.3, shade(BOARD, 1.05 + k * 0.1), true);
    });
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
  const h = 3.2, pole = shade(BOARD, 0.72), legR = 0.07;
  const n = Math.max(3, Math.round((x1 - x0) / 1.7));
  const legs: Array<{ foot: Vec3; head: Vec3 }> = [];
  // (the r2 sweep, 2026-10-16: "box share 1.00": every leg, rail and fish a plain box) the trestles of round poles, the
  // rails round poles laid in the legs' crotches and on their slopes, the fish flat and tapered, the bundles round
  for (let k = 0; k <= n; k++) {
    const x = x0 + (x1 - x0) * k / n;
    // the trestle: two legs from the plot's edges crossing just under the rail
    for (const s of [-1, 1]) {
      const foot: Vec3 = [x, -0.2, s > 0 ? z1 : z0], head: Vec3 = [x, h + 0.15, zc - s * 0.25];
      roundPole(sink, 'wood', foot, head, legR, {}, 6);
      legs.push({ foot, head });
    }
  }
  // (props census #25, the looks lane 2026-10-15: "the probe finds no anatomy, so it falls to the default kit") the racks
  // recorded as an open frame: shot, they fold over as their poles and rails (damage.ts describeLattice, latticeFall.ts)
  recordLattice(sink, legs, [1.9, h], 0.14, 'wood', pole, null);
  // the top rail in the legs' crotches; a rail lashed on each side's legs low down, resting on their slope
  const legY = (z: number, side: -1 | 1): number => {
    const zf = side > 0 ? z1 : z0, zh = zc - side * 0.25;
    return -0.2 + ((z - zf) / (zh - zf)) * (h + 0.35);
  };
  sink.cylinder('wood', [x0, h - 0.05, zc], 'x', x1 - x0, 0.075, 8, {});
  const lows: Array<[number, number]> = [];
  for (const side of [-1, 1] as const) {
    const zr = side < 0 ? z0 + (z1 - z0) * 0.22 : z1 - (z1 - z0) * 0.22, yr = legY(zr, side) + legR + 0.04;
    sink.cylinder('structureWood', [x0, yr, zr], 'x', x1 - x0, 0.05, 6, { colour: pole, decor: true });
    lows.push([zr, yr]);
  }
  sink.dressing(mobile, () => {
    // the fish: pairs hung over the rails by their tails, every 22 cm, a few gaps where a bundle was taken down
    for (const [zr, yr, half] of [[zc, h - 0.05, 0.075], [lows[0][0], lows[0][1], 0.05], [lows[1][0], lows[1][1], 0.05]] as const) {
      for (let x = x0 + 0.3; x < x1 - 0.25; x += 0.22) {
        if (look() < 0.12) continue;
        const len = Math.min(0.75 + look() * 0.25, yr - 0.15), tone = shade(FISH, 0.82 + look() * 0.3);
        for (const s of [-1, 1]) {
          const z = zr + s * (half + 0.015) - 0.015, top = yr;
          sink.prism('structureWood', [[x - 0.02, top, z], [x - 0.065, top - len * 0.55, z], [x - 0.035, top - len, z], [x + 0.035, top - len, z], [x + 0.065, top - len * 0.55, z], [x + 0.02, top, z]],
            [0, 0, 1], 0.03, { colour: tone, decor: true, fine: true });
        }
      }
    }
    // the stockfish bundled for the boat, stacked by the last trestle
    for (let k = 0; k < 4; k++) sink.cylinder('structureWood', [x1 - 0.9, 0.15 + k * 0.29, z1 - 0.83 + (k % 2) * 0.05], 'x', 0.7, 0.15, 6, { colour: shade(BOARD, 0.95 + look() * 0.15), decor: true, shadow: true });
  });
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
    // the tower on the front gable (the props census, 2026-10-14: "the kapell tower boarded and given a fracture"): a
    // house body of its own (its own plan, for the damage to read apart from the nave) in two boarded storeys on the
    // granite footing — the shaft with the door in its foot, the belfry with its openings cut through three faces and
    // white louvres in them — under the slender slate spire (the body's own hip roof) and its cross
    const z0 = Dn / 2 - 0.1, z1 = z0 + td, H = frame.eaveY + 2.4, belfryH = 2.2;
    const towerOpenings: Opening[] = [{ face: 'front', storey: 0, kind: 'door', u: 0, w: 1.0, y0: 0, h: 2.2 }];
    for (const face of ['front', 'right', 'left'] as const) towerOpenings.push({ face, storey: 1, kind: 'loft', u: 0, w: Math.min(0.9, (face === 'front' ? tw : td) - 0.6), y0: 0.45, h: 1.1 });
    const spire: RoofSpec = { kind: 'hip', pitchDeg: 76, eave: 0.12, verge: 0.12, thickness: 0.1, bucket: 'roof', ridge: null };
    const tst = { ...st, boards: 'standing' as const };
    sink.placed(0, 0, 0, (z0 + z1) / 2, () => {
      const tower = buildHouse(sink, {
        w: tw, d: td, plinth: footing(0.45), storeys: [{ h: H - 0.45 - belfryH, wall: 'plaster', framed: true }, { h: belfryH, wall: 'plaster', framed: true }],
        roof: spire, openings: towerOpenings, chimneys: [], gutters: null, verge: null, reveal: 0.16, spall: null, skirt: null,
      }, {
        ...dialect(tst),
        window: (s2, face, o, y0) => belfryLouvres(s2, face, o.u, y0 + o.y0, o.w, o.h),
        door: (s2, face, o, y0) => doorUnit(s2, face, o.u, y0 + o.y0, o.w, o.h, {
          leaf: shade(TAR, 1.4), frame: { bucket: 'structureWood', width: 0.12, out: 0.05, colour: WHITE },
          steps: { bucket: 'stone' }, leafKind: 'panel', transom: false,
        }, y0),
      });
      // the belfry's floor band, a white board where the shaft meets it
      const b = tower.bodies[1];
      sink.band('structureWood', b.x0 - 0.04, b.y0 - 0.08, b.z0 - 0.04, b.x1 + 0.04, b.y0 + 0.08, b.z1 + 0.04, { colour: WHITE, decor: true });
      const tip = tower.roof.ridgeTopY;
      sink.span('structureMetal', -0.035, tip - 0.1, -0.035, 0.035, tip + 1.0, 0.035, { colour: IRON, decor: true });
      sink.span('structureMetal', -0.28, tip + 0.62, -0.03, 0.28, tip + 0.68, 0.03, { colour: IRON, decor: true });
    });
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
 * The woodshed (vedskjul; the props census #17, 2026-10-15, the judges: "a red board-and-batten vedskjul with white
 * corner boards and trims, a sill on stone pads, rafters and a slate lean-to with barge boards"): built member by member
 * (outbuildings.ts openShed) on granite pads, its boards standing with battens over the joints (or lapped, as the
 * house's), painted in the yard's paint with the white corner boards and barge boards, open on its +x side with the cut
 * wood stacked to the plate; the yards' outbuilding on its own small plot.
 */
/** Birch rounds stacked against a back wall's inner face (at x = `xb`, their ends to +x), along z within ±`lim`, to
 *  `height`: honeycomb courses of round logs, each its own girth, length and tone. Dressing. */
function birchStack(sink: PartSink, xb: number, lim: number, height: number, look: () => number): void {
  const r = 0.1, rise = r * Math.sqrt(3);
  for (let k = 0, y = r; y + r <= height + 0.02; k++, y += rise) {
    for (let z = -lim + r + (k % 2 ? r : 0); z <= lim - r; z += 2 * r) {
      const rr = r * (0.88 + look() * 0.12), len = 0.38 + look() * 0.08, t = 0.85 + look() * 0.3;
      sink.cylinder('structureWood', [xb, y, z], 'x', len, rr, 5, { colour: [0.66 * t, 0.56 * t, 0.42 * t], decor: true }, rr, true, look() * 1.2);
    }
  }
}

const vedskjul: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const look = ctx.variant;
  const st = stateFor(ctx, [0.1, 0.8, 0.1]);
  const fit = wallsIn(ctx, 0.25, 0.18);
  const W = Math.max(2.4, fit.w), D = Math.max(2.4, fit.d);
  const paint = PAINT_RGB[st.paint];
  sink.placed(0, fit.cx, 0, fit.cz, () => {
    const pile = 1.4 + look() * 0.4;
    // (the r2 sweep, 2026-10-16: "box share 0.69": the stacked wood was courses of boxes) the birch rounds stacked in
    // their own honeycomb against the back, each log round, its end out to the open front
    openShed(sink, { W, D, hLo: 2.1, pitchDeg: 18, back: true, ends: true, pile: 0, block: false, mobile: st.mobile }, {
      timber: BOARD, post: 0.14, postColour: st.trim, pad: { bucket: 'stone', size: 0.3, top: 0.2 },
      cladding: st.boards === 'standing' ? 'batten' : 'lapped', boards: [paint, shade(paint, 0.94), shade(paint, 1.05)],
      boardW: st.boards === 'standing' ? 0.24 : 0.18, trim: st.trim,
      covering: 'slate', roofBucket: 'roof', eave: 0.25, verge: 0.18,
    }, look);
    // (after the shed: the phone builds no dressing, and the shed's own look draws come first on both)
    sink.dressing(st.mobile, () => birchStack(sink, -W / 2 + 0.16, D / 2 - 0.26, pile, look));
  });
  return sink.finish();
};

/**
 * The barn (låve; the r2 sweep, 2026-10-16: the plot fell to the generic barn, "five painted dark plates on wood"): the
 * byre (fjøs) of granite under the hay barn's board walls in the yard's paint, its corner boards and barge boards white,
 * under a slate gable; the byre's stable doors and small windows cut in its stone; the barn bridge (låvebru) up to the
 * threshing floor's double doors in the front gable, an earth ramp between dry-stone cheeks and its last span a timber
 * deck on two beams over the byre door; the hay hatch in the back gable. Its house plan breaks it.
 */
const laave: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx, [0.05, 0.85, 0.1]);
  const rng = st.rng, look = st.look;
  const fit = wallsIn(ctx, 0.35, 0.3), L = clamp(fit.d * 0.32, 3.2, 4.2);
  const W = clamp(fit.w, 6, 9), D = clamp(fit.d - L, 6.5, 11);
  const bz = ctx.bounds.minZ + 0.3 + D / 2;
  sink.placed(0, fit.cx, 0, bz, () => {
    const openings: Opening[] = [
      { face: 'front', storey: 0, kind: 'door', u: 0, w: 1.1, y0: 0, h: 1.9 },
      { face: 'back', storey: 0, kind: 'door', u: -W * 0.18, w: 1.0, y0: 0, h: 1.9 },
      { face: 'front', storey: 1, kind: 'gate', u: 0, w: 2.6, y0: 0, h: 2.3 },
      { face: 'back', storey: 1, kind: 'loft', u: 0, w: 1.0, y0: 0.7, h: 1.0 },
    ];
    for (const face of ['left', 'right'] as const) for (const o of windowRhythm(face, 0, D, { w: 0.6, h: 0.45, sill: 1.35, spacing: 2.4, margin: 1.2, max: 3 })) openings.push(o);
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: footing(0.25), storeys: [{ h: 2.3, wall: 'stone' }, { h: 2.7, wall: st.paint, framed: true }],
      roof: skifer(34 + rng() * 4, 0.5, 0.38), gableBucket: st.paint, gableFramed: true, openings,
      chimneys: [], gutters: null, verge: { colour: WHITE, bucket: 'structureWood' }, reveal: 0.12, spall: null,
    }, dialect(st));
    // the barn bridge: the earth ramp between its dry-stone cheeks, its head a hand under the threshing floor, the last
    // span a deck of planks on two beams from the ramp's head to the doors' sill
    const f1 = frame.floors[1], bw = 3.2, z0 = D / 2, zh = z0 + 1.15, zt = z0 + L - 0.1, top = f1 - 0.16;
    const profile: Vec3[] = [[-bw / 2, 0.02, zt], [-bw / 2, -0.3, zt + 0.2], [-bw / 2, -0.3, zh], [-bw / 2, top, zh]];
    sink.prism('stone', profile, [1, 0, 0], bw, { tint: [0.74, 0.7, 0.58] });
    for (const sx of [-1, 1]) {
      const x = sx * (bw / 2 + 0.22);
      sink.prism('stone', [[x - 0.22, 0.25, zt + 0.05], [x - 0.22, -0.3, zt + 0.3], [x - 0.22, -0.3, zh - 0.02], [x - 0.22, top + 0.18, zh - 0.02]], [1, 0, 0], 0.44, { tint: [0.92, 0.9, 0.86] });
    }
    for (const sx of [-1, 1]) sink.span('wood', sx * 1.0 - 0.11, top - 0.24, z0 - 0.08, sx * 1.0 + 0.11, top - 0.02, zh + 0.3);
    sink.span('wood', -bw / 2 + 0.1, top - 0.02, z0 + 0.02, bw / 2 - 0.1, top + 0.06, zh + 0.25, { tint: [0.92, 0.9, 0.86] });
    sink.dressing(st.mobile, () => {
      for (let x = -bw / 2 + 0.12; x < bw / 2 - 0.2; x += 0.22) {
        sink.span('structureWood', x, top + 0.06, z0 + 0.02, x + 0.2, top + 0.085, zh + 0.25, { colour: shade(BOARD, 0.85 + look() * 0.25), decor: true });
      }
    });
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
  barn: laave,
  lighthouse: (ctx) => fyr(ctx, stateFor, dialect),
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
    // (round 5, wave 243: "toy-clean block rubble") a shade darker again, the soot and the wet in it (was 0.45)
    stone: { kind: 'granite', tint: [0.37, 0.38, 0.39] },
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
  // round 4 (no white pickets off the American maps): the yards fenced in split rails, the skigard's nearest
  yard: { kinds: ['cottage', 'logcabin', 'alpine'], fence: 'fencerail', gate: 'gate', shed: 'woodshed', shedSize: [3.2, 2.8], garden: true },
});
