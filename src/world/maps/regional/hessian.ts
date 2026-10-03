// src/world/maps/regional/hessian.ts — the Hessian Fachwerk kit (Frontier Basin: the Fulda Gap's Hünfeld basin,
// eastern Hesse). Two-storey half-timbered houses on red Buntsandstein plinths: oak frames in dark brown, oxblood or
// grey over limewashed infill, the upper storey jettied over the street gable, steep plain-tile (Biberschwanz) roofs,
// often half-hipped (Krüppelwalm), white casements with a cross of glazing bars, sandstone sills and steps. Farmsteads
// pair the house with a stone-and-timber stable wing; barns stand on a sandstone ground storey with a planked gate;
// the village church has a rendered nave and a west tower with a slate-hung belfry and a needle spire; the mills on
// the river are timber-framed water mills with an overshot wheel.
import {
  PartSink, faceBox, hashSeed, pick, rgb, shade, UV_MEMBER,
  type Face, type RegionalBucket, type RegionalParts, type Rgb, type Vec3,
} from './geometry.ts';
import {
  buildHouse, emitRoof, roofGeometry, storeyFaces, windowRhythm, H,
  type HouseDialect, type HouseFrame, type HouseSpec, type Opening, type WallRect,
} from './house.ts';
import { bench, flowerBox, roofLadder, tvAerial, wallLantern, woodpile } from './dressing.ts';
import { doorUnit, gateUnit, windowUnit, type WindowStyle } from './openings.ts';
import type { ArchitectureStyle, RegionalBuildContext, RegionalBuilder } from './types.ts';

// oak framing: dark brown, oxblood (Ochsenblut), weathered grey, black-brown, ochre-red; sRGB, kept above ~6 % linear
// reflectance so the frame still reads in shade
/**
 * The colours and habits of one Fachwerk region. The Hessian kit and the Eifel kit (eifel.ts) share every builder
 * below and differ here: the framing colours, how often a gable is slate-hung and a ground storey is stone.
 */
export interface FachwerkPalette {
  timbers: readonly Rgb[];
  frame: Rgb;
  doors: readonly Rgb[];
  shutters: readonly Rgb[];
  /** share of houses with shutters */
  shutterShare: number;
  /** share of gables hung with roof slate / tile instead of framed */
  hungGable: number;
  /** share of dwellings on a stone ground storey (besides the stone wall draw) */
  stoneGround: number;
  /** share of half-hipped roofs */
  halfHip: number;
}

export const HESSIAN_PALETTE: FachwerkPalette = Object.freeze({
  // v1 captures: the pale grey-brown (0x6c625a) read as concrete in sun; oak darkens to brown-black or is painted oxblood
  timbers: [0x5c4434, 0x6e3024, 0x4a3a2f, 0x7a3a28, 0x45362c, 0x56483e].map(rgb),
  frame: rgb(0xcfcabd),
  doors: [0x426b49, 0x7a3024, 0x6a4b33, 0x55687a, 0x8a6338].map(rgb),
  shutters: [0x4a7451, 0x6a4b33, 0x667a86].map(rgb),
  shutterShare: 0.32, hungGable: 0.12, stoneGround: 0, halfHip: 0.45,
});

let palette: FachwerkPalette = HESSIAN_PALETTE;
/** Run a builder under a palette (builders are synchronous: the module-level palette cannot leak). */
export function withPalette(p: FachwerkPalette, builder: RegionalBuilder): RegionalBuilder {
  return (ctx) => {
    const prior = palette;
    palette = p;
    try { return builder(ctx); } finally { palette = prior; }
  };
}
const ZINC = rgb(0x8c9193);
const GATE = rgb(0x7a5d44);

export interface HessianState {
  rng: () => number;
  timber: Rgb;
  infill: RegionalBucket;
  door: Rgb;
  window: WindowStyle;
  crosses: boolean;
  litShare: number;
  mobile: boolean;
}

const OUT = 0.035, POST = 0.17;
const SW: RegionalBucket = 'structureWood';

export function stateFor(ctx: RegionalBuildContext, rng: () => number): HessianState {
  // the infill is limewash on daub: the primary render (the map's plaster photo set) under each house's own tint
  // (weather.ts); the v1 captures showed the procedural plaster2/plaster3 canvases reading as grey cobbles in the panels
  const infill: RegionalBucket = 'plaster';
  if (ctx.wallBucket === 'stone') rng(); // the stream keeps the draw the old variant pick took
  const shutters = rng() < palette.shutterShare ? pick(rng, palette.shutters) : null;
  return {
    rng,
    timber: shade(pick(rng, palette.timbers), 0.9 + rng() * 0.2),
    infill,
    door: pick(rng, palette.doors),
    window: {
      frame: palette.frame, frameWidth: 0.065, frameOut: 0.06, bars: rng() < 0.75 ? 'cross' : 'six',
      surround: null, sill: { bucket: 'stone', out: 0.13 },
      shutters: shutters ? { colour: shutters, kind: 'panel' } : null,
    },
    crosses: rng() < 0.55,
    litShare: 0.38,
    mobile: ctx.tier === 'mobile',
  };
}

/** The framed wall: sill beam, plate, corner and opening posts, rails, braces and the parapet crosses. */
function fachwerkWall(sink: PartSink, face: Face, rect: WallRect, openings: Opening[], st: HessianState): void {
  const { u0, u1, y0, y1 } = rect;
  const tc = { colour: st.timber, decor: true };
  // the sill beam and plate run past the corner posts: their ends show at the corners
  H.rail(sink, SW, face, u0, u1, y0 + 0.09, 0.18, OUT + 0.01, { ...tc, ends: true });
  H.rail(sink, SW, face, u0, u1, y1 - 0.08, 0.16, OUT + 0.01, { ...tc, ends: true });
  if (st.mobile) {
    H.post(sink, SW, face, u0 + 0.1, y0 + 0.18, y1 - 0.16, 0.2, OUT, tc);
    H.post(sink, SW, face, u1 - 0.1, y0 + 0.18, y1 - 0.16, 0.2, OUT, tc);
    return;
  }
  const yA = y0 + 0.18, yB = y1 - 0.16;
  const posts: number[] = [u0 + 0.1, u1 - 0.1];
  for (const o of openings) {
    posts.push(o.u - o.w / 2 - POST / 2, o.u + o.w / 2 + POST / 2);
  }
  posts.sort((a, b) => a - b);
  const merged: number[] = [];
  for (const p of posts) {
    if (merged.length && p - merged[merged.length - 1] < 0.32) { merged[merged.length - 1] = (merged[merged.length - 1] + p) / 2; continue; }
    merged.push(p);
  }
  const inOpening = (a: number, b: number) => openings.find((o) => o.u > a && o.u < b);
  const all: number[] = [];
  for (let i = 0; i < merged.length; i++) {
    all.push(merged[i]);
    const next = merged[i + 1];
    if (next === undefined) break;
    const gap = next - merged[i];
    if (!inOpening(merged[i], next) && gap > 1.45) {
      const n = Math.floor(gap / 1.1);
      for (let k = 1; k < n; k++) all.push(merged[i] + gap * k / n);
    }
  }
  for (let i = 0; i < all.length; i++) {
    const corner = i === 0 || i === all.length - 1;
    H.post(sink, SW, face, all[i], yA, yB, corner ? 0.21 : POST, OUT, tc);
  }
  const brust = y0 + Math.min(0.92, (y1 - y0) * 0.36), sturz = y0 + Math.min(2.05, (y1 - y0) * 0.8);
  for (let i = 0; i + 1 < all.length; i++) {
    const a = all[i] + POST / 2, b = all[i + 1] - POST / 2;
    if (b - a < 0.12) continue;
    const op = inOpening(all[i], all[i + 1]);
    if (op && (op.kind === 'window' || op.kind === 'loft')) {
      const sill = y0 + op.y0, head = sill + op.h;
      H.rail(sink, SW, face, a, b, sill - 0.16, 0.14, OUT, tc);
      if (head + 0.15 < yB) H.rail(sink, SW, face, a, b, head + 0.08, 0.14, OUT, tc);
      if (st.crosses && sill - 0.23 - yA > 0.42) {
        // the Andreaskreuz in the parapet panel under the window
        H.brace(sink, SW, face, a + 0.04, yA + 0.04, b - 0.04, sill - 0.27, 0.13, OUT + 0.004, tc);
        H.brace(sink, SW, face, a + 0.04, sill - 0.27, b - 0.04, yA + 0.04, 0.13, OUT + 0.008, tc);
      }
      continue;
    }
    if (op) {
      const head = y0 + op.y0 + op.h;
      if (head + 0.15 < yB) H.rail(sink, SW, face, a, b, head + 0.08, 0.14, OUT, tc);
      continue;
    }
    const cornerBay = i === 0 || i === all.length - 2;
    if (cornerBay && b - a > 0.55) {
      // the corner brace (Strebe) runs from the sill at the corner post to the plate at the next post
      if (i === 0) H.brace(sink, SW, face, a + 0.02, yA + 0.02, b - 0.02, yB - 0.02, 0.16, OUT + 0.006, tc);
      else H.brace(sink, SW, face, b - 0.02, yA + 0.02, a + 0.02, yB - 0.02, 0.16, OUT + 0.006, tc);
      continue;
    }
    H.rail(sink, SW, face, a, b, brust, 0.14, OUT, tc);
    if (sturz + 0.15 < yB) H.rail(sink, SW, face, a, b, sturz, 0.14, OUT, tc);
  }
}

/** The framed gable: king post, collar, side posts and two braces, cut under the roof line. */
function fachwerkGable(sink: PartSink, face: Face, poly: Array<[number, number]>, st: HessianState): void {
  const tc = { colour: st.timber, decor: true };
  const base = poly[0][1], s = Math.abs(poly[1][0]);
  const top = Math.max(...poly.map(([, y]) => y));
  const h = top - base;
  if (h < 0.8) return;
  // the half-width of the gable at height y (triangle or trapezoid under the same slopes)
  const apexY = poly.length === 3 ? poly[2][1] : base + (top - base) * s / Math.max(0.01, s - Math.abs(poly[2][0]));
  const halfAt = (y: number) => s * Math.max(0, 1 - (y - base) / Math.max(0.01, apexY - base));
  H.post(sink, SW, face, 0, base + 0.06, top - 0.12, POST, OUT, tc);
  const collar = base + h * 0.5;
  H.rail(sink, SW, face, -halfAt(collar) + 0.16, halfAt(collar) - 0.16, collar, 0.14, OUT, tc);
  if (st.mobile) return;
  for (const side of [-1, 1]) {
    const u = side * s * 0.5;
    const yTop = base + (apexY - base) * (1 - Math.abs(u) / s) - 0.22;
    if (yTop > base + 0.5) H.post(sink, SW, face, u, base + 0.06, yTop, POST, OUT, tc);
    H.brace(sink, SW, face, side * s * 0.82, base + 0.08, side * 0.12, collar - 0.08, 0.14, OUT + 0.006, tc);
  }
  if (h > 2.4) {
    for (const side of [-1, 1]) {
      const u = side * s * 0.25, wy = base + 0.55;
      windowUnit(sink, face, u, wy, 0.5, 0.62, { ...st.window, shutters: null, bars: 'cross' }, st.rng, st.litShare * 0.6);
    }
  }
}

export function hessianDialect(st: HessianState): HouseDialect {
  return {
    window: (sink, face, o, y0) => windowUnit(sink, face, o.u, y0 + o.y0, o.w, o.h,
      o.kind === 'loft' ? { ...st.window, shutters: null, bars: 'none' } : st.window, st.rng, o.kind === 'loft' ? 0 : st.litShare),
    door: (sink, face, o, y0, frame) => {
      if (o.kind === 'gate') {
        gateUnit(sink, face, o.u, y0 + o.y0, o.w, o.h, GATE, { bucket: 'stone', width: 0.28, out: 0.12 });
        return;
      }
      if (o.kind === 'shopfront') {
        windowUnit(sink, face, o.u, y0 + o.y0 + 0.55, o.w, o.h - 0.55, { ...st.window, bars: 'two', shutters: null,
          surround: { bucket: 'stone', width: 0.2, out: 0.12 } }, st.rng, 0.7);
        return;
      }
      doorUnit(sink, face, o.u, y0 + o.y0, o.w, o.h, {
        leaf: st.door, frame: { bucket: 'stone', width: 0.2, out: 0.1 }, transom: o.h > 2.25,
        steps: { bucket: 'stone' }, leafKind: st.rng() < 0.6 ? 'panel' : 'plank',
      }, frame.floors[o.storey] + o.y0);
    },
    dressWall: (sink, face, rect, openings) => fachwerkWall(sink, face, rect, openings, st),
    dressGable: (sink, face, poly) => fachwerkGable(sink, face, poly, st),
    dressJetty: (sink, face, u0, u1, y, depth) => {
      if (st.mobile) return;
      for (let u = u0 + 0.35; u < u1 - 0.2; u += 0.62) {
        faceBox(sink, SW, face, u, y - 0.08, (0.06 - depth) / 2, 0.14, 0.16, depth + 0.06, { colour: st.timber, decor: true, uv: UV_MEMBER });
      }
    },
  };
}

/** The storey stack of a Hessian house. */
export function storeys(st: HessianState, ctx: RegionalBuildContext, count: number, opts: { stoneGround?: boolean; jettyFront?: number; jettySides?: number } = {}) {
  const rng = st.rng;
  const out: HouseSpec['storeys'] = [];
  for (let i = 0; i < count; i++) {
    const ground = i === 0;
    const stone = ground && (opts.stoneGround ?? ctx.wallBucket === 'stone');
    const jf = !ground ? (opts.jettyFront ?? 0.24) : 0, js = !ground ? (opts.jettySides ?? (rng() < 0.5 ? 0.16 : 0)) : 0;
    out.push({
      h: ground ? 2.6 + rng() * 0.25 : 2.42 + rng() * 0.2,
      wall: stone ? 'stone' : st.infill,
      framed: !stone,
      jetty: ground ? undefined : [jf, js, 0, js],
    });
  }
  return out;
}

export function roofFor(rng: () => number, opts: { halfHip?: number; pitch?: [number, number] } = {}): HouseSpec['roof'] {
  const [lo, hi] = opts.pitch ?? [47, 55];
  return {
    kind: rng() < (opts.halfHip ?? 0.45) ? 'halfhip' : 'gable', pitchDeg: lo + rng() * (hi - lo),
    eave: 0.36, verge: 0.24, thickness: 0.17, bucket: 'roof', hipFrac: 0.32 + rng() * 0.12, ridge: 'round',
  };
}

/** Openings of a house body: the street gable (front), the eaves sides and the back. */
export function houseOpenings(w: number, d: number, sts: HouseSpec['storeys'], door: { face: Opening['face']; u: number } | null,
  st: HessianState, extra: Opening[] = []): Opening[] {
  const out: Opening[] = [...extra];
  const doorW = 1.0, doorH = 2.12;
  if (door) out.push({ face: door.face, storey: 0, kind: 'door', u: door.u, w: doorW, y0: 0, h: doorH });
  sts.forEach((storey, i) => {
    const ww = i === 0 ? 0.78 : 0.74, wh = i === 0 ? 1.08 : 1.0, sill = i === 0 ? 0.92 : 0.78;
    for (const face of ['front', 'right', 'back', 'left'] as const) {
      const width = face === 'front' || face === 'back' ? w : d;
      const avoid: Array<[number, number]> = out.filter((o) => o.face === face && o.storey === i && o.kind !== 'window')
        .map((o) => [o.u - o.w / 2, o.u + o.w / 2]);
      const spacing = face === 'back' ? 2.3 : 1.75;
      for (const o of windowRhythm(face, i, width, { w: ww, h: Math.min(wh, storey.h - sill - 0.3), sill, spacing, margin: 0.85, avoid })) {
        if (face === 'back' && st.rng() < 0.3) continue;
        out.push(o);
      }
    }
  });
  return out;
}

export function chimneyFor(rng: () => number, d: number, bucket: RegionalBucket): HouseSpec['chimneys'] {
  return [{ x: (rng() < 0.5 ? -1 : 1) * 0.42, z: (rng() - 0.5) * d * 0.5, sx: 0.52, sz: 0.62, above: 0.75 + rng() * 0.3, bucket, cap: 'slab' }];
}

export function houseUvOffset(ctx: RegionalBuildContext): [number, number] {
  return [ctx.rng() * 7.31, ctx.rng() * 5.17];
}

/** The Hessian dwelling: cottage, tavern, schoolhouse and shop variants. */
function hessianDwelling(ctx: RegionalBuildContext, opts: { storeys?: number; shop?: boolean; tavern?: boolean; school?: boolean } = {}): RegionalParts {
  const sink = new PartSink(houseUvOffset(ctx));
  const st = stateFor(ctx, ctx.rng);
  const W = Math.max(5.0, ctx.info.w - 0.3), D = Math.max(6.6, ctx.info.d - 0.3);
  const count = opts.storeys ?? 2;
  const stoneGround = opts.tavern || opts.school || st.rng() < palette.stoneGround ? true : undefined;
  const sts = storeys(st, ctx, count, { stoneGround });
  const hung = st.rng() < palette.hungGable;
  const extra: Opening[] = [];
  if (opts.shop) extra.push({ face: 'front', storey: 0, kind: 'shopfront', u: W * 0.16, w: 2.2, y0: 0, h: 2.3 });
  const doorU = opts.shop ? -W * 0.28 : opts.tavern || opts.school ? 0 : (st.rng() < 0.5 ? -1 : 1) * W * 0.22;
  const spec: HouseSpec = {
    w: W, d: D,
    plinth: { h: opts.tavern || opts.school ? 0.75 : 0.5 + st.rng() * 0.25, out: 0.06, bucket: 'stone' },
    storeys: sts,
    roof: roofFor(st.rng, { halfHip: opts.tavern ? 0.8 : palette.halfHip }),
    // a weather gable hung with the roof's own slate or tile, or framed like the walls below
    gableFramed: !hung,
    gableBucket: hung ? 'roof' : st.infill,
    openings: houseOpenings(W, D, sts, { face: 'front', u: doorU }, st, extra),
    chimneys: chimneyFor(st.rng, D, st.rng() < 0.5 ? 'stone' : 'plaster'),
    gutters: st.rng() < 0.7 ? { colour: ZINC } : null,
    verge: { colour: st.timber, bucket: SW },
    rafters: st.mobile ? null : shade(st.timber, 0.92),
  };
  const frame = buildHouse(sink, spec, hessianDialect(st));
  if (opts.tavern) innSign(sink, frame, st);
  if (opts.school) roofTurret(sink, frame, st, 0.3);
  dressHessianHouse(sink, frame, st, { aerial: opts.school ? 0.2 : 0.45, boxes: opts.school ? 0.2 : 0.6 });
  return sink.finish();
}

const BLOOMS: readonly Rgb[] = [0xc0242a, 0xd23a5a, 0xc8462e, 0xe0e0d8, 0xb0306a].map(rgb);
const BOX_COLOURS: readonly Rgb[] = [0x4a3a2c, 0x3e5a3a, 0x6a4a30].map(rgb);

/**
 * The lived-in dressing of a Hessian house (dressing.ts): geraniums in window boxes on the street faces, the bench by
 * the front door, a woodpile under the eaves at the back, the chimney sweep's roof ladder, a television aerial on the
 * ridge (1980s). Every choice is drawn before the phones leave the parts out, so both tiers draw alike.
 */
export function dressHessianHouse(sink: PartSink, frame: HouseFrame, st: HessianState, opts: { aerial?: number; boxes?: number } = {}): void {
  const rng = st.rng;
  const boxes = rng() < (opts.boxes ?? 0.55), bloom = pick(rng, BLOOMS), boxColour = pick(rng, BOX_COLOURS);
  const aerial = rng() < (opts.aerial ?? 0.45), aerialZ = (rng() - 0.5) * frame.roof.halfD;
  const ladder = rng() < 0.4, pile = rng() < 0.45, seat = rng() < 0.6, lantern = rng() < 0.5;
  const picks = frame.spec.openings.map(() => rng());
  if (st.mobile) return;
  const spec = frame.spec;
  if (boxes) {
    let placed = 0;
    spec.openings.forEach((o, k) => {
      if (placed >= 8 || o.kind !== 'window' || o.state || o.storey > 1 || (o.face !== 'front' && o.face !== 'right') || picks[k] > 0.7) return;
      const face = storeyFaces(frame, o.storey)[o.face];
      flowerBox(sink, face, o.u, frame.bodies[o.storey].y0 + o.y0, o.w, boxColour, bloom, rng);
      placed++;
    });
  }
  const door = spec.openings.find((o) => o.kind === 'door' && o.storey === 0);
  if (seat && door) {
    const face = frame.faces[door.face];
    const side = door.u > 0 ? -1 : 1, u = door.u + side * (door.w / 2 + 1.05);
    if (Math.abs(u) + 0.8 < face.width / 2) bench(sink, face, u, 1.4, shade(st.timber, 1.25));
  }
  if (lantern && door) {
    const face = frame.faces[door.face], u = door.u + (door.u > 0 ? 1 : -1) * (door.w / 2 + 0.38);
    if (Math.abs(u) + 0.3 < face.width / 2) wallLantern(sink, face, u, frame.floors[0] + 2.05);
  }
  if (pile) {
    const face = frame.faces.back;
    const blocked = spec.openings.some((o) => o.face === 'back' && o.storey === 0 && o.kind !== 'window' && o.u < -face.width / 2 + 3.4);
    if (!blocked) woodpile(sink, face, -face.width / 2 + 0.4, Math.min(face.width / 2 - 0.4, -face.width / 2 + 2.9), 1.15, rng);
  }
  const stack = spec.chimneys[0];
  if (ladder && stack) roofLadder(sink, frame, stack.x >= 0 ? 1 : -1, stack.z - 0.7, 0.85, [0.36, 0.3, 0.24]);
  if (aerial) tvAerial(sink, frame, aerialZ, rng);
}

/** A wrought-iron bracket with a hanging inn sign at the street gable. */
export function innSign(sink: PartSink, frame: HouseFrame, st: HessianState): void {
  const face = frame.faces.front, y = frame.floors[1] - 0.25 || 2.9;
  const u = face.width / 2 - 0.6;
  faceBox(sink, 'dark', face, u, y, 0.45, 0.06, 0.06, 0.9, { decor: true });
  faceBox(sink, 'dark', face, u, y - 0.25, 0.65, 0.04, 0.5, 0.04, { decor: true });
  faceBox(sink, SW, face, u, y - 0.62, 0.8, 0.06, 0.55, 0.62, { colour: shade(st.door, 1.2), decor: true });
}

/** A small slate-capped roof turret (Dachreiter) on the ridge: the school and chapel bell. */
export function roofTurret(sink: PartSink, frame: HouseFrame, st: HessianState, zFrac: number): void {
  const rg = frame.roof, z = rg.halfD * zFrac;
  const top = rg.topAt(0, z) ?? rg.ridgeTopY;
  const s = 0.62;
  const low = (rg.topAt(s, z) ?? top) - 0.12;
  sink.span(st.infill, -s, low, z - s, s, top + 1.4, z + s);
  for (const side of [-1, 1]) {
    faceBox(sink, 'dark', { origin: [0, 0, z + side * s], u: [side, 0, 0], out: [0, 0, side], width: 2 * s }, 0, top + 0.75, 0.01, 0.44, 0.7, 0.02, { decor: true });
  }
  sink.cylinder('roof', [0, top + 1.4, z], 'y', 2.2, s * 1.3, 8, {}, 0.04);
  sink.cylinder('dark', [0, top + 3.55, z], 'y', 0.5, 0.025, 4, { decor: true });
}

/** The Hessian farmhouse: the dwelling (door on the -x eaves side) with a stone-and-timber stable wing on +x. */
const farmhouse: RegionalBuilder = (ctx) => {
  const sink = new PartSink(houseUvOffset(ctx));
  const st = stateFor(ctx, ctx.rng);
  const D = Math.max(8.2, ctx.info.d - 0.3);
  const W = Math.min(7.6, Math.max(6.2, D * 0.74));
  const wingL = Math.max(4.2, Math.min(5.8, (ctx.info.w - W) / 1.6));
  const sts = storeys(st, ctx, 2, { jettyFront: 0.2, jettySides: 0 });
  const spec: HouseSpec = {
    w: W, d: D, plinth: { h: 0.62, out: 0.06, bucket: 'stone' }, storeys: sts,
    roof: roofFor(st.rng, { halfHip: 0.55 }), gableFramed: true, gableBucket: st.infill,
    openings: houseOpenings(W, D, sts, { face: 'left', u: D * 0.12 }, st),
    chimneys: chimneyFor(st.rng, D, 'stone'), gutters: { colour: ZINC }, verge: { colour: st.timber, bucket: SW },
    rafters: st.mobile ? null : shade(st.timber, 0.92),
  };
  // the wing's footprint is kept off the dwelling's right face openings
  spec.openings = spec.openings.filter((o) => !(o.face === 'right' && o.storey === 0 && Math.abs(o.u + D * 0.16) < W * 0.4));
  const house = buildHouse(sink, spec, hessianDialect(st));
  dressHessianHouse(sink, house, st);
  // the stable wing (ridge along x): stone ground, framed half storey, its gable toward +x
  const ww = Math.min(W * 0.66, 5.2);
  sink.placed(Math.PI / 2, W / 2 + wingL / 2 - 0.2, 0, -D * 0.16, () => {
    const wst: HessianState = { ...st, crosses: false };
    const wing: HouseSpec = {
      w: ww, d: wingL, plinth: { h: 0.3, out: 0.05, bucket: 'stone' },
      storeys: [{ h: 2.5, wall: 'stone' }, { h: 1.1, wall: st.infill, framed: true }],
      roof: { kind: 'gable', pitchDeg: 46, eave: 0.3, verge: 0.2, thickness: 0.16, bucket: 'roof', ridge: 'round' },
      gableFramed: true, gableBucket: st.infill,
      openings: [
        { face: 'front', storey: 0, kind: 'gate', u: 0, w: 2.2, y0: 0, h: 2.25 },
        { face: 'right', storey: 0, kind: 'window', u: 0.6, w: 0.55, y0: 1.5, h: 0.5 },
        { face: 'left', storey: 0, kind: 'window', u: -0.6, w: 0.55, y0: 1.5, h: 0.5 },
      ],
      chimneys: [], gutters: null, verge: { colour: st.timber, bucket: SW },
    };
    buildHouse(sink, wing, hessianDialect(wst));
  });
  return sink.finish();
};

/** The Hessian barn: a sandstone ground storey with the planked gate in the street gable, a framed loft. */
const barn: RegionalBuilder = (ctx) => {
  const sink = new PartSink(houseUvOffset(ctx));
  const st = stateFor(ctx, ctx.rng);
  const W = Math.max(7.0, ctx.info.w - 0.3), D = Math.max(10.4, ctx.info.d - 0.3);
  const spec: HouseSpec = {
    w: W, d: D, plinth: { h: 0.25, out: 0.05, bucket: 'stone' },
    storeys: [{ h: 3.5, wall: 'stone' }, { h: 1.9, wall: st.infill, framed: true, jetty: [0.18, 0, 0, 0] }],
    roof: roofFor(st.rng, { halfHip: 0.3, pitch: [48, 53] }), gableFramed: true, gableBucket: st.infill,
    openings: [
      { face: 'front', storey: 0, kind: 'gate', u: 0, w: 3.1, y0: 0, h: 3.05 },
      { face: 'right', storey: 0, kind: 'door', u: -D * 0.22, w: 1.0, y0: 0, h: 1.95 },
      { face: 'right', storey: 0, kind: 'window', u: D * 0.12, w: 0.6, y0: 2.05, h: 0.6 },
      { face: 'left', storey: 0, kind: 'window', u: -D * 0.18, w: 0.6, y0: 2.05, h: 0.6 },
      { face: 'left', storey: 0, kind: 'window', u: D * 0.2, w: 0.6, y0: 2.05, h: 0.6 },
      { face: 'front', storey: 1, kind: 'loft', u: 0, w: 1.1, y0: 0.35, h: 1.15 },
    ],
    chimneys: [], gutters: st.rng() < 0.5 ? { colour: ZINC } : null, verge: { colour: st.timber, bucket: SW },
  };
  buildHouse(sink, spec, hessianDialect({ ...st, crosses: false, litShare: 0.05 }));
  return sink.finish();
};

/** A small timber-framed granary (Speicher) on a high sandstone plinth, door up a flight of steps. */
const granary: RegionalBuilder = (ctx) => {
  const sink = new PartSink(houseUvOffset(ctx));
  const st = stateFor(ctx, ctx.rng);
  const W = Math.max(3.4, ctx.info.w - 0.6), D = Math.max(4.3, ctx.info.d - 1.6);
  const spec: HouseSpec = {
    w: W, d: D, plinth: { h: 0.95, out: 0.08, bucket: 'stone' },
    storeys: [{ h: 2.35, wall: st.infill, framed: true }],
    roof: roofFor(st.rng, { halfHip: 0.35, pitch: [50, 56] }), gableFramed: true, gableBucket: st.infill,
    openings: [
      { face: 'front', storey: 0, kind: 'door', u: 0, w: 0.9, y0: 0, h: 1.85 },
      { face: 'right', storey: 0, kind: 'loft', u: 0, w: 0.5, y0: 1.2, h: 0.5 },
      { face: 'left', storey: 0, kind: 'loft', u: 0, w: 0.5, y0: 1.2, h: 0.5 },
    ],
    chimneys: [], gutters: null, verge: { colour: st.timber, bucket: SW },
  };
  buildHouse(sink, spec, hessianDialect({ ...st, litShare: 0 }));
  return sink.finish();
};

/** An open woodshed: posts, a mono-pitch tile roof, a boarded back and stacked billets. */
const woodshed: RegionalBuilder = (ctx) => {
  const sink = new PartSink(houseUvOffset(ctx));
  const st = stateFor(ctx, ctx.rng);
  const W = Math.max(3.4, ctx.info.w - 0.3), D = Math.max(4.4, ctx.info.d - 0.3);
  const tc = { colour: st.timber, decor: true };
  sink.span('stone', -W / 2 - 0.1, -0.4, -D / 2 - 0.1, W / 2 + 0.1, 0.22, D / 2 + 0.1);
  const hLo = 2.25, hHi = 2.95;
  // structural posts (they carry the roof: collision keeps them)
  for (const [sx, sz] of [[-1, -1], [-1, 1], [1, -1], [1, 1], [1, 0], [-1, 0]] as const) {
    const h = sx > 0 ? hHi : hLo;
    sink.span(SW, sx * (W / 2 - 0.08) - 0.08, 0.2, sz * (D / 2 - 0.08) - 0.08, sx * (W / 2 - 0.08) + 0.08, 0.2 + h, sz * (D / 2 - 0.08) + 0.08, { colour: st.timber });
  }
  // the boarded back (-x) and side walls; open to +x
  sink.span('wood', -W / 2 - 0.02, 0.22, -D / 2, -W / 2 + 0.06, 0.22 + hLo, D / 2);
  for (const sz of [-1, 1]) sink.span('wood', -W / 2, 0.22, sz * D / 2 - 0.04, W / 2 - 0.16, 0.22 + hLo * 0.92, sz * D / 2 + 0.04);
  const rg = roofGeometry(W, D, 0.2 + hLo, { kind: 'shed', pitchDeg: Math.atan2(hHi - hLo, W) * 180 / Math.PI, eave: 0.35, verge: 0.3, thickness: 0.12, bucket: 'roof' });
  // shed roof rising toward +x: mirror the shed (which rises toward -x) by building it turned
  sink.placed(Math.PI, 0, 0, 0, () => emitRoof(sink, rg, { kind: 'shed', pitchDeg: Math.atan2(hHi - hLo, W) * 180 / Math.PI, eave: 0.35, verge: 0.3, thickness: 0.12, bucket: 'roof' }));
  // billets: rows of logs stacked against the back wall
  const rows = st.mobile ? 2 : 4;
  for (let r = 0; r < rows; r++) {
    for (let z = -D / 2 + 0.35; z < D / 2 - 0.3; z += 0.26) {
      sink.cylinder('wood', [-W / 2 + 0.1, 0.36 + r * 0.24, z], 'x', W * 0.55, 0.12, 6, { decor: true });
    }
  }
  void tc;
  return sink.finish();
};

/** A long timber-framed storehouse with a loading platform and canopy on +x (the base depot's footprint). */
const depot: RegionalBuilder = (ctx) => {
  const sink = new PartSink(houseUvOffset(ctx));
  const st = stateFor(ctx, ctx.rng);
  const pw = 2.8;
  const W = Math.max(5.8, Math.min(7.0, ctx.bounds.maxX - ctx.bounds.minX - pw - 1.4));
  const D = Math.max(14, ctx.info.d - 2.6);
  const cx = ctx.bounds.minX + 0.15 + W / 2;
  const sts: HouseSpec['storeys'] = [{ h: 3.4, wall: 'stone' }, { h: 1.6, wall: st.infill, framed: true }];
  const openings: Opening[] = [];
  for (let k = 0, n = Math.max(2, Math.round(D / 4.2)); k < n; k++) {
    const u = -D / 2 + (k + 0.5) * (D / n);
    openings.push(k % 2 === 0
      ? { face: 'right', storey: 0, kind: 'gate', u, w: 2.0, y0: 0.2, h: 2.4 }
      : { face: 'right', storey: 0, kind: 'window', u, w: 0.9, y0: 1.6, h: 0.9 });
  }
  openings.push({ face: 'front', storey: 0, kind: 'gate', u: 0, w: 2.6, y0: 0, h: 2.9 });
  sink.placed(0, cx, 0, 0, () => {
    buildHouse(sink, {
      w: W, d: D, plinth: { h: 0.75, out: 0.05, bucket: 'stone' }, storeys: sts,
      roof: { kind: 'gable', pitchDeg: 42, eave: 0.45, verge: 0.3, thickness: 0.16, bucket: 'roof', ridge: 'round' },
      gableFramed: true, gableBucket: st.infill, openings, chimneys: [], gutters: { colour: ZINC },
      verge: { colour: st.timber, bucket: SW },
    }, hessianDialect({ ...st, crosses: false, litShare: 0.1 }));
  });
  // the loading platform along +x, its canopy posts and the canopy
  const px0 = cx + W / 2;
  sink.span('stone', px0, -0.4, -D / 2 - 0.6, px0 + pw, 0.95, D / 2 + 0.6);
  for (let k = 0, n = Math.max(3, Math.round(D / 4.5)); k <= n; k++) {
    const z = -D / 2 + k * (D / n);
    sink.span(SW, px0 + pw - 0.32, 0.95, z - 0.08, px0 + pw - 0.16, 4.0, z + 0.08, { colour: st.timber });
  }
  const canopy = { kind: 'shed' as const, pitchDeg: 9, eave: 0.25, verge: 0.3, thickness: 0.1, bucket: 'roof' as const };
  // a shed roof rises toward -x: its high side meets the storehouse wall
  sink.placed(0, px0 + pw / 2 + 0.05, 0, 0, () => emitRoof(sink, roofGeometry(pw + 0.3, D + 1.2, 4.0, canopy), canopy));
  return sink.finish();
};

/** A burnt-out Fachwerk house: the sandstone ground storey and a charred frame, the roof gone. */
const ruin: RegionalBuilder = (ctx) => {
  const sink = new PartSink(houseUvOffset(ctx));
  const rng = ctx.rng;
  const W = Math.max(5.6, ctx.info.w - 0.3), D = Math.max(7.6, ctx.info.d - 0.3);
  const charred = rgb(0x2b2521), burnt = rgb(0x3d3127);
  sink.span('stone', -W / 2 - 0.06, -0.5, -D / 2 - 0.06, W / 2 + 0.06, 0.55, D / 2 + 0.06);
  // ragged ground-storey walls: stone stubs of uneven height with gaps
  const t = 0.42;
  const walls: Array<[number, number, number, number, 'x' | 'z']> = [
    [-W / 2, -D / 2, W / 2, -D / 2 + t, 'x'], [-W / 2, D / 2 - t, W / 2, D / 2, 'x'],
    [-W / 2, -D / 2 + t, -W / 2 + t, D / 2 - t, 'z'], [W / 2 - t, -D / 2 + t, W / 2, D / 2 - t, 'z'],
  ];
  for (const [x0, z0, x1, z1, axis] of walls) {
    const len = axis === 'x' ? x1 - x0 : z1 - z0;
    const n = 3 + Math.floor(rng() * 3);
    for (let k = 0; k < n; k++) {
      if (rng() < 0.28) continue;
      const a = k / n, b = (k + 1) / n - 0.02;
      const h = 0.9 + rng() * 1.9;
      if (axis === 'x') sink.span('stone', x0 + len * a, 0.5, z0, x0 + len * b, 0.5 + h, z1);
      else sink.span('stone', x0, 0.5, z0 + len * a, x1, 0.5 + h, z0 + len * b);
    }
  }
  // the charred frame: corner posts and a few studs of the upper storey, a broken plate, fallen rafters
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const h = 2.6 + rng() * 2.2;
    sink.span(SW, sx * (W / 2 - 0.12) - 0.1, 0.55, sz * (D / 2 - 0.12) - 0.1, sx * (W / 2 - 0.12) + 0.1, 0.55 + h, sz * (D / 2 - 0.12) + 0.1, { colour: charred });
  }
  const plateY = 3.3 + rng() * 0.6;
  sink.span(SW, -W / 2 + 0.02, plateY, D / 2 - 0.24, W * 0.1, plateY + 0.18, D / 2 - 0.04, { colour: charred, decor: true });
  for (let k = 0; k < 5; k++) {
    const x = (rng() - 0.5) * W * 0.8, z = (rng() - 0.5) * D * 0.7;
    const a: Vec3 = [x - 1.6, 0.62, z], b: Vec3 = [x + 1.4, 1.4 + rng() * 1.5, z + (rng() - 0.5) * 1.2];
    sink.member(SW, a, b, 0.14, 0.16, [0, 0, 1], { colour: k % 2 ? charred : burnt, decor: true, exposed: true });
  }
  // a fallen gable of tiles in a heap inside
  sink.span('roof', -W * 0.3, 0.5, -D * 0.2, W * 0.25, 1.05, D * 0.25, { decor: true });
  return sink.finish();
};

/** The village church: rendered nave with sandstone dressings, a west tower, slate-hung belfry and needle spire. */
const church: RegionalBuilder = (ctx) => {
  const sink = new PartSink(houseUvOffset(ctx));
  const st = stateFor(ctx, ctx.rng);
  const naveW = 8.6, naveD = 16, wallH = 6.2;
  const towerS = 4.4, towerH = 15.5;
  const towerZ = naveD / 2 + towerS / 2 - 0.4;
  const naveZ = -1.2;
  sink.placed(0, 0, 0, naveZ, () => {
    const openings: Opening[] = [];
    for (const face of ['right', 'left'] as const) {
      for (const u of [-5.2, -1.7, 1.8, 5.3]) openings.push({ face, storey: 0, kind: 'window', u, w: 1.1, y0: 2.2, h: 2.9 });
    }
    buildHouse(sink, {
      w: naveW, d: naveD, plinth: { h: 0.55, out: 0.1, bucket: 'stone' },
      storeys: [{ h: wallH, wall: 'plaster' }],
      roof: { kind: 'gable', pitchDeg: 52, eave: 0.4, verge: 0.2, thickness: 0.18, bucket: 'roof', ridge: 'round' },
      gableBucket: 'plaster', openings, chimneys: [], gutters: { colour: ZINC }, verge: null,
    }, {
      window: (s, face, o, y0) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, {
        frame: rgb(0x3b3a36), frameWidth: 0.07, frameOut: 0.04, bars: 'six',
        surround: { bucket: 'stone', width: 0.24, out: 0.1, lintel: 0.3 }, sill: { bucket: 'stone', out: 0.16 }, shutters: null,
      }, st.rng, 0.25),
      door: () => {},
    });
    // sandstone quoins at the nave corners
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      for (let y = 0.6, k = 0; y < wallH + 0.4; y += 0.42, k++) {
        const long = (k + (sx * sz > 0 ? 0 : 1)) % 2 === 0;
        const xIn = long ? 0.62 : 0.32, zIn = long ? 0.32 : 0.62;
        const xa = sx > 0 ? naveW / 2 - xIn : -naveW / 2 - 0.04, xb = sx > 0 ? naveW / 2 + 0.04 : -naveW / 2 + xIn;
        const za = sz > 0 ? naveD / 2 - zIn : -naveD / 2 - 0.04, zb = sz > 0 ? naveD / 2 + 0.04 : -naveD / 2 + zIn;
        sink.span('stone', xa, y, za, xb, y + 0.4, zb, { decor: true });
      }
    }
  });
  // the west tower (toward +z, the street front), stone lower stage, slate-hung belfry, octagonal needle spire
  const tz = naveZ + towerZ;
  sink.span('stone', -towerS / 2 - 0.12, -0.5, tz - towerS / 2 - 0.12, towerS / 2 + 0.12, 0.6, tz + towerS / 2 + 0.12);
  sink.span('stone', -towerS / 2, 0.5, tz - towerS / 2, towerS / 2, towerH - 3.6, tz + towerS / 2);
  // the belfry stage hung with roof tiles, coursed downward like a roof
  sink.box('roof', [0, towerH - 1.8, tz], [towerS / 2 + 0.08, 1.8, towerS / 2 + 0.08], { uv: { kind: 'plane', origin: [0, towerH, tz], u: [1, 0, 1], v: [0, -1, 0] } });
  const front: Face = { origin: [0, 0, tz + towerS / 2], u: [1, 0, 0], out: [0, 0, 1], width: towerS };
  doorUnit(sink, front, 0, 0.6, 1.5, 2.9, { leaf: rgb(0x4a3020), frame: { bucket: 'stone', width: 0.3, out: 0.16, arch: true },
    steps: { bucket: 'stone' }, leafKind: 'plank' }, 0.6);
  for (const [face, sgn] of [[0, 1], [0, -1], [1, 1], [1, -1]] as const) {
    const f: Face = face === 0
      ? { origin: [0, 0, tz + sgn * (towerS / 2 + 0.08)], u: [sgn, 0, 0], out: [0, 0, sgn], width: towerS }
      : { origin: [sgn * (towerS / 2 + 0.08), 0, tz], u: [0, 0, -sgn], out: [sgn, 0, 0], width: towerS };
    // belfry louvres and a clock face
    for (const u of [-0.75, 0.75]) {
      faceBox(sink, 'dark', f, u, towerH - 1.9, 0.01, 0.62, 1.6, 0.03, { decor: true });
      for (let k = 0; k < 5; k++) faceBox(sink, SW, f, u, towerH - 2.55 + k * 0.32, 0.04, 0.62, 0.06, 0.06, { colour: rgb(0x403a33), decor: true });
    }
    faceBox(sink, SW, f, 0, towerH - 4.6, 0.04, 1.15, 1.15, 0.05, { colour: rgb(0xd8d2c2), decor: true });
    faceBox(sink, 'dark', f, 0, towerH - 4.6, 0.075, 0.07, 0.5, 0.02, { decor: true });
    faceBox(sink, 'stone', f, 0, towerH - 6.0, 0.02, 0.3, 0.9, 0.04, { decor: true });
  }
  sink.span('stone', -towerS / 2 - 0.2, towerH - 3.75, tz - towerS / 2 - 0.2, towerS / 2 + 0.2, towerH - 3.55, tz + towerS / 2 + 0.2, { decor: true });
  // spire: eight-sided needle from a square base
  sink.cylinder('roof', [0, towerH, tz], 'y', 9.5, towerS * 0.66, 8, {}, 0.05);
  sink.cylinder('dark', [0, towerH + 9.4, tz], 'y', 1.1, 0.045, 4, { decor: true });
  sink.span('dark', -0.32, towerH + 10.05, tz - 0.035, 0.32, towerH + 10.12, tz + 0.035, { decor: true });
  return sink.finish();
};

/** The chapel: a small rendered nave with a framed gable and a slate roof turret. */
const chapel: RegionalBuilder = (ctx) => {
  const sink = new PartSink(houseUvOffset(ctx));
  const st = stateFor(ctx, ctx.rng);
  const W = Math.max(5.0, ctx.info.w - 0.4), D = Math.max(7.4, ctx.info.d - 0.4);
  const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'door', u: 0, w: 1.15, y0: 0, h: 2.35 }];
  for (const face of ['right', 'left'] as const) for (const u of [-D * 0.22, D * 0.22]) openings.push({ face, storey: 0, kind: 'window', u, w: 0.8, y0: 1.6, h: 1.7 });
  const frame = buildHouse(sink, {
    w: W, d: D, plinth: { h: 0.45, out: 0.08, bucket: 'stone' }, storeys: [{ h: 3.9, wall: 'plaster' }],
    roof: { kind: 'gable', pitchDeg: 54, eave: 0.35, verge: 0.2, thickness: 0.17, bucket: 'roof', ridge: 'round' },
    gableFramed: true, gableBucket: st.infill, openings, chimneys: [], gutters: null, verge: { colour: st.timber, bucket: SW },
  }, {
    ...hessianDialect(st),
    window: (s, face, o, y0) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, {
      frame: rgb(0x3b3a36), frameWidth: 0.06, frameOut: 0.04, bars: 'six',
      surround: { bucket: 'stone', width: 0.2, out: 0.09, lintel: 0.26 }, sill: { bucket: 'stone', out: 0.14 }, shutters: null,
    }, st.rng, 0.2),
  });
  roofTurret(sink, frame, st, 0.55);
  return sink.finish();
};

/** The water mill: a two-storey Fachwerk mill house on a sandstone ground storey, an overshot wheel on its flank. */
const mill: RegionalBuilder = (ctx) => {
  const sink = new PartSink(houseUvOffset(ctx));
  const st = stateFor(ctx, ctx.rng);
  const W = 6.0, D = 7.6;
  const sts: HouseSpec['storeys'] = [{ h: 2.8, wall: 'stone' }, { h: 2.5, wall: st.infill, framed: true, jetty: [0.2, 0, 0, 0] }];
  buildHouse(sink, {
    w: W, d: D, plinth: { h: 0.4, out: 0.06, bucket: 'stone' }, storeys: sts,
    roof: roofFor(st.rng, { halfHip: 0.6 }), gableFramed: true, gableBucket: st.infill,
    openings: houseOpenings(W, D, sts, { face: 'front', u: -1.2 }, st).filter((o) => !(o.face === 'right' && o.storey === 0)),
    chimneys: chimneyFor(st.rng, D, 'stone'), gutters: { colour: ZINC }, verge: { colour: st.timber, bucket: SW },
  }, hessianDialect(st));
  // the overshot wheel on +x: two rim rings, spokes, paddles and the axle into the wall; a flume on trestles feeds it
  const R = 2.3, cxw = W / 2 + 0.78, cy = R + 0.25;
  const wood = rgb(0x6a5440);
  const wc = { colour: wood, decor: true, exposed: true };
  for (const x of [cxw - 0.55, cxw + 0.55]) {
    for (let k = 0; k < 16; k++) {
      const a0 = k / 16 * Math.PI * 2, a1 = (k + 1) / 16 * Math.PI * 2;
      sink.member(SW, [x, cy + Math.cos(a0) * R, Math.sin(a0) * R], [x, cy + Math.cos(a1) * R, Math.sin(a1) * R], 0.14, 0.12, [1, 0, 0], wc, 0);
    }
    for (let k = 0; k < 8; k++) {
      const a = (k + 0.5) / 8 * Math.PI * 2;
      sink.member(SW, [x, cy, 0], [x, cy + Math.cos(a) * (R - 0.05), Math.sin(a) * (R - 0.05)], 0.1, 0.1, [1, 0, 0], wc, 0);
    }
  }
  for (let k = 0; k < 18; k++) {
    const a = k / 18 * Math.PI * 2;
    const y = cy + Math.cos(a) * (R - 0.16), z = Math.sin(a) * (R - 0.16);
    sink.member(SW, [cxw - 0.55, y, z], [cxw + 0.55, y, z], 0.3, 0.05, [0, Math.cos(a), Math.sin(a)], { colour: shade(wood, 0.85), decor: true, exposed: true }, 0.025);
  }
  sink.cylinder('wood', [W / 2 - 0.1, cy, 0], 'x', cxw + 0.75 - (W / 2 - 0.1), 0.16, 8, { decor: true });
  // the flume to the top of the wheel, on two trestles
  const fy = cy + R + 0.4;
  sink.span(SW, cxw - 0.4, fy - 0.32, -0.6, cxw + 0.4, fy, D / 2 + 3.4, wc);
  for (const z of [D / 2 + 0.7, D / 2 + 3.0]) for (const x of [cxw - 0.33, cxw + 0.33]) {
    sink.span(SW, x - 0.07, 0, z - 0.07, x + 0.07, fy - 0.32, z + 0.07, wc);
  }
  return sink.finish();
};

/** The Fachwerk builders, by plan structure id, unbound: a kit binds them to its palette (withPalette). */
export const FACHWERK_BUILDERS: Readonly<Record<string, RegionalBuilder>> = Object.freeze({
  cottage: (ctx) => hessianDwelling(ctx),
  tavern: (ctx) => hessianDwelling(ctx, { storeys: 3, tavern: true }),
  schoolhouse: (ctx) => hessianDwelling(ctx, { school: true }),
  cornershop: (ctx) => hessianDwelling(ctx, { shop: true }),
  rangerlodge: (ctx) => hessianDwelling(ctx, { school: false, tavern: false }),
  farmhouse, barn, granary, woodshed, depot, ruin, church, chapel, mill,
});

export function bindFachwerk(p: FachwerkPalette, ids: readonly string[]): Record<string, RegionalBuilder> {
  return Object.fromEntries(ids.map((id) => [id, withPalette(p, FACHWERK_BUILDERS[id])]));
}

/** The Hessian kit's builders, by plan structure id. */
export const HESSIAN_BUILDERS: Readonly<Record<string, RegionalBuilder>> = Object.freeze(bindFachwerk(HESSIAN_PALETTE,
  ['cottage', 'tavern', 'schoolhouse', 'cornershop', 'farmhouse', 'barn', 'granary', 'woodshed', 'depot', 'ruin', 'church', 'chapel', 'mill']));

export const HESSIAN_STYLE: ArchitectureStyle = Object.freeze<ArchitectureStyle>({
  id: 'hessian',
  region: 'Osthessen (Fulda Gap, Hünfeld basin): Fachwerk villages on Buntsandstein',
  surfaces: {
    roof: { kind: 'beavertail', tint: [0.50, 0.25, 0.17] },
    stone: { kind: 'sandstone', tint: [0.58, 0.36, 0.30] },
    sourced: { plaster: true, wood: true },
  },
  builders: HESSIAN_BUILDERS,
  // limewash from white to pale ochre, plain tiles from new red to old brown, a wet upland climate
  weather: {
    plaster: [[1, 1, 1], [1, 0.97, 0.9], [1, 0.94, 0.84], [0.97, 0.96, 0.93], [1, 0.93, 0.89]],
    stone: [[1, 1, 1], [0.92, 0.9, 0.88], [1.04, 0.98, 0.94]],
    roof: [[1, 1, 1], [0.86, 0.8, 0.74], [0.78, 0.74, 0.7], [1.05, 0.98, 0.95], [0.92, 0.86, 0.82]],
    damp: 0.85, moss: 0.55,
  },
  wear: 0.22,
});

export { hashSeed };
