// src/world/landmarks/bridges.ts — bridges (the landmarks lane, 2026-10-05): the multi-span stone arch (Sarajevo's
// Latin Bridge, a Dalmatian packhorse bridge), the steel camelback through truss on stone piers (Shanghai's Garden
// Bridge), the timber trestle, the wartime Bailey panel bridge, the arched viaduct and the Dutch double-leaf lift bridge
// (a polder canal's ophaalbrug).
//
// A bridge's frame: the span runs along z from -span/2 to +span/2 (its abutment faces), x across it, y up from the
// lowest ground under it. Where the composer gives the ground (types.ts ground) the piers stand on the bed and the deck
// meets each bank (its ends 5 cm over them, graded between), so a hull drives on from the approach; on flat ground it
// stands at the authored `deck` height. A drivable bridge authors its movement record (types.ts movement): the deck in
// segments a metre deep under its surface — a standable floor (collision.ts HULL_STANDABLE_HEIGHT_M) a hull mounts and
// drives along — the parapets or the trusses that keep a hull on it, and the piers and abutments from the bed to the
// deck's underside, so a hull low enough passes under an arch. The shells' bands stay derived from the geometry: a shell
// passes through an arch or a truss panel and meets the masonry and the steel.
import { PartSink, rgb, shade, type RegionalBucket } from '../maps/regional/geometry.ts';
import type { SimpleCollisionShape } from '../collision.ts';
import { archedSlab, bar, extrude, moulding, revolve, type ArchHole } from './kit.ts';
import type { LandmarkBuildContext, LandmarkBuilder } from './types.ts';

const STEEL_GREY = rgb(0x6f777b), STEEL_GREEN = rgb(0x4d5a4e), BAILEY_GREEN = rgb(0x4e5638), TIMBER = rgb(0x6a5440), TIMBER_DARK = rgb(0x4a3b2e);
const DECK_BOARD = rgb(0x7a6a55), IRON = rgb(0x2b2d2e), PAINT_WHITE = rgb(0xe6e3da), PAINT_BLACK = rgb(0x262624);

const uvOffset = (rng: () => number): [number, number] => [rng() * 7.31, rng() * 5.17];
/** A deck part's depth under its surface: a standable floor with margin (collision.ts HULL_STANDABLE_HEIGHT_M is 0.9). */
const DECK_PART_M = 1.0;

/** The deck's surface height along the span: graded from bank to bank, with an optional hump at the middle. */
function deckProfile(ctx: LandmarkBuildContext, span: number, deck: number, hump: number): (z: number) => number {
  const endA = ctx.ground ? ctx.ground(0, -span / 2 - 1.2) + 0.05 : deck, endB = ctx.ground ? ctx.ground(0, span / 2 + 1.2) + 0.05 : deck;
  return (z: number) => {
    const t = Math.max(-1, Math.min(1, z / (span / 2)));
    return endA + (endB - endA) * (t + 1) / 2 + hump * (1 - t * t);
  };
}

/** The ground under a point (0 on flat ground: the base). */
const groundAt = (ctx: LandmarkBuildContext, x: number, z: number) => (ctx.ground ? ctx.ground(x, z) : 0);

/** The deck's movement parts: segments along the span, each a standable slab under the surface, and its edge walls. */
function deckMovement(span: number, width: number, top: (z: number) => number, edge: number, edgeT: number, segment = 3): SimpleCollisionShape[] {
  const parts: SimpleCollisionShape[] = [];
  const n = Math.max(1, Math.ceil(span / segment));
  for (let i = 0; i < n; i++) {
    const z0 = -span / 2 + span * i / n, z1 = -span / 2 + span * (i + 1) / n, zc = (z0 + z1) / 2, y = Math.max(top(z0), top(zc), top(z1));
    parts.push({ kind: 'obb', cx: 0, cz: zc, hw: width / 2, hl: (z1 - z0) / 2, yaw: 0, y0: y - DECK_PART_M, y1: y });
    if (edge > 0) for (const sx of [-1, 1]) {
      parts.push({ kind: 'obb', cx: sx * (width / 2 - edgeT / 2), cz: zc, hw: edgeT / 2, hl: (z1 - z0) / 2, yaw: 0, y0: y, y1: y + edge });
    }
  }
  return parts;
}

// ---------------------------------------------------------------------------------------------------------- stone arch

/**
 * The stone arch bridge: the spandrel walls and the vaults as one masonry body pierced by its arches (round, a slight
 * hump to the roadway), cutwaters turned into the stream on both faces of every pier, a parapet each side on a string
 * course, the end posts, and the wing walls splayed into the banks.
 */
export const stoneArchBridge: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const span = Math.max(8, Number(ctx.params.span)), W = Math.max(3, Number(ctx.params.width)), n = Math.max(1, Math.round(Number(ctx.params.arches)));
  const deck = Math.max(2, Number(ctx.params.deck)), hump = Math.min(0.6, span * 0.012);
  const top = deckProfile(ctx, span, deck, hump);
  const wall: RegionalBucket = 'stone', parapet = 1.05, pt = 0.45;
  const crownSlack = 0.75; // masonry over the arch crowns under the roadway
  const pier = Math.max(1.6, span / n * 0.18), chord = (span - (n - 1) * pier) / n;
  const minTop = Math.min(top(-span / 2), top(0), top(span / 2));
  const bed = Math.min(0, ...Array.from({ length: 9 }, (_, i) => groundAt(ctx, 0, -span / 2 + span * i / 8)));
  const footing = bed - 1.2;
  const springY = Math.max(bed + 0.3, minTop - crownSlack - chord / 2);
  const holes: ArchHole[] = Array.from({ length: n }, (_, i) => ({ u: -span / 2 + chord / 2 + i * (chord + pier), w: chord, y0: footing,
    spring: springY, form: 'round' as const }));
  // the body: an arched slab along the span (its x along the bridge's z), the full width thick, topped by the roadway
  const bodyTop = minTop - 0.35;
  sink.placed(-Math.PI / 2, 0, 0, 0, () => archedSlab(sink, wall, -span / 2 - 2, span / 2 + 2, footing, bodyTop, W, holes, { ends: true, top: false }));
  // the roadway: segments following the hump, the parapets on them with a string course under
  const segs = Math.max(4, Math.ceil(span / 3));
  for (let i = 0; i < segs; i++) {
    const z0 = -span / 2 - 2 + (span + 4) * i / segs, z1 = -span / 2 - 2 + (span + 4) * (i + 1) / segs;
    const y0 = top(z0), y1 = top(z1);
    extrude(sink, wall, [[-W / 2, bodyTop, z0], [-W / 2, y0, z0], [-W / 2, y1, z1], [-W / 2, bodyTop, z1]], [1, 0, 0], W);
    for (const sx of [-1, 1]) {
      const x0 = sx > 0 ? W / 2 - pt : -W / 2;
      extrude(sink, wall, [[x0, y0 - 0.02, z0], [x0, y0 + parapet, z0], [x0, y1 + parapet, z1], [x0, y1 - 0.02, z1]], [1, 0, 0], pt);
      // the coping and the string course (dressing)
      extrude(sink, wall, [[x0 - 0.05, y0 + parapet, z0], [x0 - 0.05, y0 + parapet + 0.12, z0], [x0 - 0.05, y1 + parapet + 0.12, z1], [x0 - 0.05, y1 + parapet, z1]],
        [1, 0, 0], pt + 0.1, { decor: true });
      const sxo = sx > 0 ? W / 2 : -W / 2 - 0.1;
      extrude(sink, wall, [[sxo, y0 - 0.55, z0], [sxo, y0 - 0.38, z0], [sxo, y1 - 0.38, z1], [sxo, y1 - 0.55, z1]], [1, 0, 0], 0.1, { decor: true });
    }
  }
  // the cutwaters on the piers, both faces, their noses up to the spring line
  for (let i = 0; i < n - 1; i++) {
    const pz = -span / 2 + (i + 1) * chord + i * pier + pier / 2;
    for (const sx of [-1, 1]) {
      const x = sx * W / 2;
      extrude(sink, wall, [[x, footing, pz - pier / 2], [x + sx * pier * 0.75, footing, pz], [x, footing, pz + pier / 2]], [0, 1, 0], springY + 0.6 - footing);
      revolve(sink, wall, x + sx * pier * 0.25, pz, [[pier * 0.45, springY + 0.6], [0.05, springY + 1.4]], 4, { decor: true }, Math.PI / 4);
    }
  }
  // the end posts and the wing walls into the banks
  for (const zs of [-1, 1]) {
    const z = zs * (span / 2 + 2), y = top(zs * span / 2);
    for (const sx of [-1, 1]) {
      sink.span(wall, sx * W / 2 - 0.35, y - 0.6, z - 0.35, sx * W / 2 + 0.35, y + parapet + 0.45, z + 0.35);
      const g = groundAt(ctx, sx * (W / 2 + 2.6), z + zs * 2.4);
      sink.member(wall, [sx * (W / 2 + 0.3), Math.min(y - 0.2, g + 1.2) - 1.4, z], [sx * (W / 2 + 2.9), g - 0.6, z + zs * 2.8], 0.8, 2.4, [0, 1, 0], { exposed: true }, 1.2);
    }
  }
  const movement = ctx.params.drivable === false ? undefined : (() => {
    const parts = deckMovement(span + 4, W, (z) => top(Math.max(-span / 2, Math.min(span / 2, z))), parapet, pt);
    // the piers and the abutments, from the footing to the crown line under the roadway
    const crown = springY + chord / 2;
    for (let i = 0; i < n - 1; i++) {
      const pz = -span / 2 + (i + 1) * chord + i * pier + pier / 2;
      parts.push({ kind: 'obb', cx: 0, cz: pz, hw: W / 2 + pier * 0.5, hl: pier / 2, yaw: 0, y0: footing, y1: Math.min(crown, minTop - DECK_PART_M) });
    }
    for (const zs of [-1, 1]) parts.push({ kind: 'obb', cx: 0, cz: zs * (span / 2 + 1), hw: W / 2, hl: 1, yaw: 0, y0: footing, y1: top(zs * span / 2) - DECK_PART_M });
    return parts;
  })();
  return { parts: sink.finish(), movement };
};

// ---------------------------------------------------------------------------------------------------------- truss

/**
 * The steel through truss (a camelback Pratt like Shanghai's Garden Bridge): two trusses — the chords, the verticals at
 * every panel point, the diagonals sloping to the middle — the portal bracing over each end, the top laterals, the deck
 * between with its kerbs and the footways cantilevered outside, on dressed stone abutments (and piers for more spans).
 */
export const trussBridge: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const span = Math.max(12, Number(ctx.params.span)), W = Math.max(4, Number(ctx.params.width)), panels = Math.max(4, Math.round(Number(ctx.params.panels)));
  const deck = Math.max(2, Number(ctx.params.deck)), T = Math.max(3, Number(ctx.params.truss)), spans = Math.max(1, Math.round(Number(ctx.params.spans ?? 1)));
  const top = deckProfile(ctx, span, deck, 0);
  const steel = { colour: ctx.mapId === 'blackglass' || ctx.mapId === 'urban' ? STEEL_GREY : STEEL_GREEN };
  const bed = Math.min(0, ...Array.from({ length: 9 }, (_, i) => groundAt(ctx, 0, -span / 2 + span * i / 8)));
  const L = span / spans;
  for (let s = 0; s < spans; s++) {
    const z0 = -span / 2 + L * s, z1 = z0 + L, pl = L / panels;
    const camel = (t: number) => T * (0.82 + 0.18 * Math.sin(Math.PI * t));
    for (const sx of [-1, 1]) {
      const x = sx * W / 2;
      for (let p = 0; p <= panels; p++) {
        const z = z0 + pl * p, y = top(z), h = camel(p / panels);
        // the bottom chord, the vertical and the top chord to the next panel point
        if (p < panels) {
          const zn = z + pl, yn = top(zn), hn = camel((p + 1) / panels);
          bar(sink, 'structureMetal', [x, y + 0.2, z], [x, yn + 0.2, zn], 0.45, steel);
          if (p > 0 && p < panels - 1) bar(sink, 'structureMetal', [x, y + h, z], [x, yn + hn, zn], 0.5, steel);
          // the diagonal slopes down toward the middle (Pratt): from the top of the outer post to the foot of the inner
          const outward = p < panels / 2;
          bar(sink, 'structureMetal', outward ? [x, y + h, z] : [x, y + 0.3, z], outward ? [x, yn + 0.3, zn] : [x, yn + hn, zn], 0.24, steel);
        }
        // the end posts lean in (the inclined end posts of a through truss), the rest stand
        if (p === 0 || p === panels) {
          const zi = p === 0 ? z + pl : z - pl;
          bar(sink, 'structureMetal', [x, y + 0.2, z], [x, top(zi) + camel(p === 0 ? 1 / panels : (panels - 1) / panels), zi], 0.5, steel);
        } else bar(sink, 'structureMetal', [x, y + 0.2, z], [x, y + h, z], 0.3, steel);
      }
    }
    // the top laterals and the portal bracing, the deck, the kerbs, the footways
    for (let p = 1; p < panels; p++) {
      const z = z0 + pl * p, y = top(z) + camel(p / panels);
      bar(sink, 'structureMetal', [-W / 2, y, z], [W / 2, y, z], 0.22, { ...steel, decor: true });
      if (p < panels - 1) {
        const zn = z + pl, yn = top(zn) + camel((p + 1) / panels);
        bar(sink, 'structureMetal', [-W / 2, y, z], [W / 2, yn, zn], 0.12, { ...steel, decor: true, fine: true });
        bar(sink, 'structureMetal', [W / 2, y, z], [-W / 2, yn, zn], 0.12, { ...steel, decor: true, fine: true });
      }
    }
    for (const zz of [z0 + pl, z1 - pl]) {
      const y = top(zz) + camel(zz === z0 + pl ? 1 / panels : (panels - 1) / panels);
      sink.span('structureMetal', -W / 2, y - 1.0, zz - 0.2, W / 2, y, zz + 0.2, { ...steel, decor: true });
    }
    for (let p = 0; p < panels; p++) {
      const za = z0 + pl * p, zb = za + pl;
      extrude(sink, 'structureMetal', [[-W / 2 + 0.25, top(za) - 0.25, za], [-W / 2 + 0.25, top(za) + 0.1, za], [-W / 2 + 0.25, top(zb) + 0.1, zb], [-W / 2 + 0.25, top(zb) - 0.25, zb]],
        [1, 0, 0], W - 0.5, { colour: rgb(0x55585a) });
      for (const sx of [-1, 1]) {
        extrude(sink, 'structureWood', [[sx * (W / 2 + 0.2), top(za) - 0.05, za], [sx * (W / 2 + 0.2), top(za) + 0.05, za], [sx * (W / 2 + 0.2), top(zb) + 0.05, zb],
          [sx * (W / 2 + 0.2), top(zb) - 0.05, zb]], [sx, 0, 0], 1.8, { colour: DECK_BOARD, decor: true });
      }
    }
    // a pier at a shared end
    if (s > 0) {
      sink.span('stone', -W / 2 - 1.2, bed - 1.5, z0 - 1.6, W / 2 + 1.2, top(z0) - 0.3, z0 + 1.6);
    }
  }
  // the abutments: dressed stone under each end, their wing walls
  for (const zs of [-1, 1]) {
    const z = zs * (span / 2 + 1.5), y = top(zs * span / 2);
    sink.span('stone', -W / 2 - 1.5, Math.min(bed, groundAt(ctx, 0, z)) - 1.5, z - 1.8, W / 2 + 1.5, y - 0.25, z + 1.8);
    sink.placed(0, 0, 0, z, () => moulding(sink, 'stone', W + 3, 3.6, y - 0.55, 0.3, 0.1));
  }
  const movement = ctx.params.drivable === false ? undefined : (() => {
    const parts = deckMovement(span, W, top, 2.6, 0.5);
    for (const zs of [-1, 1]) parts.push({ kind: 'obb', cx: 0, cz: zs * (span / 2 + 1.5), hw: W / 2 + 1.5, hl: 1.8, yaw: 0, y0: bed - 1.5, y1: top(zs * span / 2) - DECK_PART_M });
    for (let s = 1; s < spans; s++) parts.push({ kind: 'obb', cx: 0, cz: -span / 2 + span * s / spans, hw: W / 2 + 1.2, hl: 1.6, yaw: 0, y0: bed - 1.5,
      y1: top(-span / 2 + span * s / spans) - DECK_PART_M });
    return parts;
  })();
  return { parts: sink.finish(), movement };
};

// ---------------------------------------------------------------------------------------------------------- trestle

/**
 * The timber trestle: bents every few metres — two raked posts and two plumb ones on sills on the bed, cross-braced,
 * capped — the stringers over them, the plank deck with its guard timbers and a hand rail each side.
 */
export const trestleBridge: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const span = Math.max(8, Number(ctx.params.span)), W = Math.max(3, Number(ctx.params.width)), deck = Math.max(1.5, Number(ctx.params.deck));
  const top = deckProfile(ctx, span, deck, 0);
  const bents = Math.max(2, Math.round(span / 4.2));
  const wood = { colour: TIMBER }, dark = { colour: TIMBER_DARK };
  for (let b = 0; b <= bents; b++) {
    const z = -span / 2 + span * b / bents, y = top(z) - 0.55, g = Math.min(y - 0.5, groundAt(ctx, 0, z));
    sink.span('structureWood', -W / 2 - 1.0, g - 0.4, z - 0.25, W / 2 + 1.0, g + 0.1, z + 0.25, dark);
    for (const x of [-W / 2 - 0.6, -W * 0.18, W * 0.18, W / 2 + 0.6]) {
      const lean = Math.abs(x) > W / 2 ? Math.sign(x) * -0.5 : 0;
      bar(sink, 'structureWood', [x, g + 0.1, z], [x + lean, y, z], 0.26, wood);
    }
    sink.span('structureWood', -W / 2 - 0.4, y, z - 0.2, W / 2 + 0.4, y + 0.3, z + 0.2, dark);
    if (y - g > 1.6) {
      bar(sink, 'structureWood', [-W / 2 - 0.5, g + 0.4, z + 0.15], [W / 2 - 0.1, y - 0.2, z + 0.15], 0.12, { ...dark, decor: true });
      bar(sink, 'structureWood', [W / 2 + 0.5, g + 0.4, z - 0.15], [-W / 2 + 0.1, y - 0.2, z - 0.15], 0.12, { ...dark, decor: true });
    }
  }
  for (const x of [-W * 0.35, 0, W * 0.35]) bar(sink, 'structureWood', [x, top(-span / 2) - 0.4, -span / 2], [x, top(span / 2) - 0.4, span / 2], 0.3, dark);
  const planks = Math.round(span / 0.32);
  for (let k = 0; k < planks; k++) {
    const z0 = -span / 2 + span * k / planks, z1 = z0 + span / planks * 0.92;
    extrude(sink, 'structureWood', [[-W / 2, top(z0) - 0.1, z0], [-W / 2, top(z0), z0], [-W / 2, top(z1), z1], [-W / 2, top(z1) - 0.1, z1]], [1, 0, 0], W,
      { colour: shade(DECK_BOARD, 0.88 + (k % 3) * 0.06), ...(k % 2 ? { fine: true, decor: true } : {}) });
  }
  for (const sx of [-1, 1]) {
    bar(sink, 'structureWood', [sx * (W / 2 - 0.15), top(-span / 2) + 0.15, -span / 2], [sx * (W / 2 - 0.15), top(span / 2) + 0.15, span / 2], 0.25, dark);
    for (let k = 0; k <= bents; k++) {
      const z = -span / 2 + span * k / bents;
      sink.span('structureWood', sx * (W / 2 - 0.08) - 0.08, top(z), z - 0.08, sx * (W / 2 - 0.08) + 0.08, top(z) + 1.1, z + 0.08, { ...dark, decor: true });
    }
    bar(sink, 'structureWood', [sx * (W / 2 - 0.08), top(-span / 2) + 1.05, -span / 2], [sx * (W / 2 - 0.08), top(span / 2) + 1.05, span / 2], 0.1, { ...wood, decor: true });
  }
  const movement = ctx.params.drivable === false ? undefined : deckMovement(span, W, top, 0.4, 0.25);
  return { parts: sink.finish(), movement };
};

// ---------------------------------------------------------------------------------------------------------- bailey

/**
 * The Bailey bridge (the Allied engineers' panel bridge of 1942-45): a girder of 10 ft (3.05 m) panels each side — the
 * chords, the end posts and the diagonals of every panel — the transoms under the deck, the chequered steel deck
 * between its timber ribbands, the sloping ramp units at each end on their base plates.
 */
export const baileyBridge: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const bays = Math.max(3, Math.round(Number(ctx.params.bays))), W = Math.max(3.6, Number(ctx.params.width)), deck = Math.max(1, Number(ctx.params.deck));
  const P = 3.048, span = bays * P, H = 1.45;
  const top = deckProfile(ctx, span, deck, 0);
  const steel = { colour: BAILEY_GREEN };
  for (const sx of [-1, 1]) {
    const x = sx * (W / 2 + 0.35);
    for (let b = 0; b < bays; b++) {
      const z0 = -span / 2 + P * b, z1 = z0 + P, y0 = top(z0) - 0.35, y1 = top(z1) - 0.35;
      bar(sink, 'structureMetal', [x, y0, z0], [x, y1, z1], 0.16, steel);
      bar(sink, 'structureMetal', [x, y0 + H, z0], [x, y1 + H, z1], 0.16, steel);
      bar(sink, 'structureMetal', [x, y0, z0 + 0.06], [x, y0 + H, z0 + 0.06], 0.14, steel);
      // the panel's lattice: a vertical at its middle and the diagonals out of it (the Bailey's N-and-V web)
      const zm = (z0 + z1) / 2, ym = (y0 + y1) / 2;
      bar(sink, 'structureMetal', [x, ym, zm], [x, ym + H, zm], 0.1, { ...steel, decor: true });
      bar(sink, 'structureMetal', [x, y0 + 0.08, z0 + 0.1], [x, ym + H - 0.08, zm], 0.08, { ...steel, decor: true });
      bar(sink, 'structureMetal', [x, ym + H - 0.08, zm], [x, y1 + 0.08, z1 - 0.1], 0.08, { ...steel, decor: true });
    }
    bar(sink, 'structureMetal', [x, top(span / 2) - 0.35, span / 2 - 0.06], [x, top(span / 2) - 0.35 + H, span / 2 - 0.06], 0.14, steel);
  }
  for (let b = 0; b <= bays * 2; b++) {
    const z = -span / 2 + P / 2 * b;
    sink.span('structureMetal', -W / 2 - 0.45, top(z) - 0.55, z - 0.1, W / 2 + 0.45, top(z) - 0.3, z + 0.1, { ...steel, decor: true });
  }
  for (let b = 0; b < bays; b++) {
    const z0 = -span / 2 + P * b, z1 = z0 + P;
    extrude(sink, 'structureMetal', [[-W / 2, top(z0) - 0.3, z0], [-W / 2, top(z0), z0], [-W / 2, top(z1), z1], [-W / 2, top(z1) - 0.3, z1]], [1, 0, 0], W,
      { colour: rgb(0x4a4c46) });
    for (const sx of [-1, 1]) {
      extrude(sink, 'structureWood', [[sx * (W / 2 - 0.25), top(z0), z0], [sx * (W / 2 - 0.25), top(z0) + 0.22, z0], [sx * (W / 2 - 0.25), top(z1) + 0.22, z1],
        [sx * (W / 2 - 0.25), top(z1), z1]], [sx, 0, 0], 0.25, { colour: TIMBER });
    }
  }
  // the ramps down to the banks
  for (const zs of [-1, 1]) {
    const z = zs * span / 2, y = top(z), g = groundAt(ctx, 0, zs * (span / 2 + 4.2));
    extrude(sink, 'structureMetal', [[-W / 2, y - 0.3, z], [-W / 2, y, z], [-W / 2, g + 0.06, z + zs * 4.2], [-W / 2, g - 0.2, z + zs * 4.2]], [1, 0, 0], W,
      { colour: rgb(0x4a4c46) });
    for (const sx of [-1, 1]) sink.span('structureMetal', sx * W / 2 - 0.4, g - 0.3, z - 0.3, sx * W / 2 + 0.8, Math.min(y - 0.3, g + 0.4), z + 0.3, { colour: IRON });
  }
  const movement = ctx.params.drivable === false ? undefined : deckMovement(span, W + 1.4, top, H, 0.5);
  return { parts: sink.finish(), movement };
};

// ---------------------------------------------------------------------------------------------------------- viaduct

/**
 * The arched viaduct (a railway's across a valley): tall piers with their offsets and imposts, round arches between
 * them, the spandrel walls up to a string course and the parapets. Seen far off: the valley's skyline. Not drivable
 * (its deck carries a line, not a road).
 */
export const viaduct: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const n = Math.max(2, Math.round(Number(ctx.params.arches))), A = Math.max(5, Number(ctx.params.archSpan)), H = Math.max(8, Number(ctx.params.height));
  const W = Math.max(4, Number(ctx.params.width)), pier = Math.max(2.4, A * 0.24), L = n * (A + pier) + pier;
  const footing = -1.2 - ctx.groundFall, spring = H - A / 2 - 1.6;
  const holes: ArchHole[] = Array.from({ length: n }, (_, i) => ({ u: -L / 2 + pier + A / 2 + i * (A + pier), w: A, y0: footing, spring, form: 'round' as const }));
  sink.placed(-Math.PI / 2, 0, 0, 0, () => archedSlab(sink, 'stone', -L / 2, L / 2, footing, H, W, holes, { ends: true, top: true }));
  // the piers' offsets (battered skirts at the foot) and the imposts at the spring line, both faces
  for (let i = 0; i <= n; i++) {
    const z = -L / 2 + pier / 2 + i * (A + pier);
    for (const sx of [-1, 1]) {
      extrude(sink, 'stone', [[sx * W / 2, footing, z - pier / 2], [sx * (W / 2 + 0.6), footing, z - pier / 2 - 0.3], [sx * (W / 2 + 0.6), footing, z + pier / 2 + 0.3],
        [sx * W / 2, footing, z + pier / 2]], [0, 1, 0], Math.min(spring * 0.35, 6) - footing, { decor: true });
      sink.span('stone', sx * W / 2 - (sx > 0 ? 0 : 0.18), spring - 0.3, z - pier / 2 - 0.12, sx * W / 2 + (sx > 0 ? 0.18 : 0), spring, z + pier / 2 + 0.12, { decor: true });
    }
  }
  moulding(sink, 'stone', W, L, H - 0.45, 0.25, 0.14);
  for (const sx of [-1, 1]) sink.span('stone', sx * W / 2 - (sx > 0 ? 0.45 : 0), H, -L / 2, sx * W / 2 + (sx > 0 ? 0 : 0.45), H + 1.1, L / 2);
  return { parts: sink.finish() };
};

// ---------------------------------------------------------------------------------------------------------- lift bridge

/**
 * The Dutch double-leaf lift bridge (a dubbele ophaalbrug — Amsterdam's Magere Brug and a polder canal's): two timber
 * leaves hinged on the brick abutments and meeting over the channel; over each abutment a portal (the hamei) of two posts
 * and a beam, carrying the balance beams (the balans) that lean back over the approach, their tails tied by a crossbar
 * and their heads linked to the leaf's tip by iron rods; the railings, the portals and the balances painted white with
 * black feet, the deck boards bare; the abutments brick (the map's masonry) with stone copings. The leaves lie down: the
 * bridge is closed and a road crosses it.
 */
export const liftBridge: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const span = Math.max(8, Number(ctx.params.span)), W = Math.max(3.5, Number(ctx.params.width)), deck = Math.max(1.2, Number(ctx.params.deck));
  const top = deckProfile(ctx, span, deck, Math.min(0.25, span * 0.012));
  const white = { colour: PAINT_WHITE }, black = { colour: PAINT_BLACK }, iron = { colour: IRON };
  const postX = W / 2 + 0.32, portalH = Math.max(4.6, W * 0.85);
  // ---- the abutments: brick blocks from below the bed to the deck's underside, a stone coping along the channel face
  for (const zs of [-1, 1]) {
    const face = zs * span / 2, back = zs * (span / 2 + 3.2), y = Math.min(top(face), top(zs * span / 2)) - 0.42;
    const bed = Math.min(groundAt(ctx, 0, face), groundAt(ctx, -W / 2, face), groundAt(ctx, W / 2, face)) - 1.0;
    const z0 = Math.min(face, back), z1 = Math.max(face, back);
    sink.span('stone', -W / 2 - 0.9, bed, z0, W / 2 + 0.9, y, z1);
    sink.span('stone', -W / 2 - 1.0, y - 0.04, face - 0.18, W / 2 + 1.0, y + 0.1, face + 0.18, { decor: true });
    // the wing walls along the banks
    for (const sx of [-1, 1]) {
      const g = groundAt(ctx, sx * (W / 2 + 0.9), zs * (span / 2 + 3.2));
      sink.member('stone', [sx * (W / 2 + 0.55), y - 0.1, face], [sx * (W / 2 + 0.55), Math.min(y - 0.1, g + 0.3), zs * (span / 2 + 3.6)], 0.6, 1.6, [0, 1, 0], { exposed: true }, 1.2);
    }
  }
  // ---- the leaves: girders, cross-beams and the deck boards, each leaf from its abutment to the meeting line
  for (const zs of [-1, 1]) {
    const zA = zs * span / 2, zB = 0;
    for (const x of [-W * 0.38, 0, W * 0.38]) bar(sink, 'structureWood', [x, top(zA) - 0.36, zA], [x, top(zB) - 0.36, zB - zs * 0.02], 0.28, { colour: TIMBER_DARK });
    const ribs = Math.max(2, Math.round(span / 2 / 1.6));
    for (let k = 0; k <= ribs; k++) {
      const z = zA + (zB - zA) * k / ribs;
      sink.span('structureWood', -W / 2 - 0.1, top(z) - 0.5, z - 0.09, W / 2 + 0.1, top(z) - 0.2, z + 0.09, { colour: TIMBER_DARK, decor: true });
    }
    const planks = Math.round(span / 2 / 0.3);
    for (let k = 0; k < planks; k++) {
      const z0 = zA + (zB - zA) * k / planks, z1 = z0 + (zB - zA) / planks * 0.93;
      const a = Math.min(z0, z1), b = Math.max(z0, z1);
      extrude(sink, 'structureWood', [[-W / 2, top(a) - 0.1, a], [-W / 2, top(a), a], [-W / 2, top(b), b], [-W / 2, top(b) - 0.1, b]], [1, 0, 0], W,
        { colour: shade(DECK_BOARD, 0.86 + (k % 3) * 0.07), ...(k % 2 ? { fine: true, decor: true } : {}) });
    }
    // the leaf's white edge beams and its railing
    for (const sx of [-1, 1]) {
      const x = sx * (W / 2 - 0.06);
      bar(sink, 'structureWood', [x, top(zA) + 0.02, zA], [x, top(zB) + 0.02, zB], 0.16, white);
      const posts = Math.max(2, Math.round(span / 2 / 1.5));
      for (let k = 0; k <= posts; k++) {
        const z = zA + (zB - zA) * k / posts;
        sink.span('structureWood', x - 0.05, top(z), z - 0.05, x + 0.05, top(z) + 1.05, z + 0.05, { ...white, decor: true });
      }
      bar(sink, 'structureWood', [x, top(zA) + 1.05, zA], [x, top(zB) + 1.05, zB], 0.09, { ...white, decor: true });
      bar(sink, 'structureWood', [x, top(zA) + 0.55, zA], [x, top(zB) + 0.55, zB], 0.06, { ...white, decor: true, fine: true });
    }
  }
  // ---- the portals over the abutments and the balances on them
  for (const zs of [-1, 1]) {
    const z = zs * (span / 2 + 0.55), y0 = top(zs * span / 2), yTop = y0 + portalH;
    for (const sx of [-1, 1]) {
      const x = sx * postX;
      sink.span('structureWood', x - 0.17, y0 - 0.45, z - 0.17, x + 0.17, y0 + 0.5, z + 0.17, black);
      sink.span('structureWood', x - 0.15, y0 + 0.5, z - 0.15, x + 0.15, yTop, z + 0.15, white);
      // the struts from the abutment up to the post
      bar(sink, 'structureWood', [x, y0, z + zs * 1.4], [x, y0 + 2.0, z + zs * 0.12], 0.12, { ...white, decor: true });
    }
    sink.span('structureWood', -postX - 0.4, yTop, z - 0.18, postX + 0.4, yTop + 0.34, z + 0.18, white);
    // the balance: two beams pivoting on the portal's top, their heads over the leaf, their tails over the approach
    const head = zs * span * 0.06, tail = zs * (span / 2 + 0.55 + Math.max(3.6, span * 0.42)), pivotY = yTop + 0.5;
    const headY = pivotY - 0.55, tailY = pivotY + 0.55;
    for (const sx of [-1, 1]) {
      const x = sx * (postX - 0.02);
      bar(sink, 'structureWood', [x, headY, head], [x, tailY, tail], 0.2, white);
      // the iron rods from the balance's head to the leaf's tip
      bar(sink, 'structureMetal', [x, headY - 0.1, head], [x, top(head) + 0.15, head], 0.05, { ...iron, decor: true });
      // the pivot block on the portal beam
      sink.span('structureWood', x - 0.16, yTop + 0.3, z - 0.22, x + 0.16, pivotY + 0.1, z + 0.22, { ...black, decor: true });
    }
    // the cross-ties: at the head, at the tail (the counterweight bar) and a diagonal pair between
    bar(sink, 'structureWood', [-postX, headY, head], [postX, headY, head], 0.16, white);
    sink.span('structureWood', -postX - 0.1, tailY - 0.34, Math.min(tail, tail + zs * 0.5), postX + 0.1, tailY + 0.12, Math.max(tail, tail + zs * 0.5), black);
    const mid = (head + tail) / 2 + zs * 0.6, midY = (headY + tailY) / 2;
    bar(sink, 'structureWood', [-postX, midY, mid - zs * 1.5], [postX, midY, mid + zs * 1.5], 0.1, { ...white, decor: true });
    bar(sink, 'structureWood', [postX, midY, mid - zs * 1.5], [-postX, midY, mid + zs * 1.5], 0.1, { ...white, decor: true });
  }
  const movement = ctx.params.drivable === false ? undefined : (() => {
    const parts = deckMovement(span, W, top, 1.05, 0.2);
    // the abutments from the bed to the deck's underside, and the portal posts
    for (const zs of [-1, 1]) {
      parts.push({ kind: 'obb', cx: 0, cz: zs * (span / 2 + 1.6), hw: W / 2 + 0.9, hl: 1.6, yaw: 0, y0: groundAt(ctx, 0, zs * span / 2) - 1.0, y1: top(zs * span / 2) - DECK_PART_M });
      for (const sx of [-1, 1]) parts.push({ kind: 'obb', cx: sx * postX, cz: zs * (span / 2 + 0.55), hw: 0.17, hl: 0.17, yaw: 0, y0: top(zs * span / 2) - 0.45, y1: top(zs * span / 2) + portalH });
    }
    return parts;
  })();
  return { parts: sink.finish(), movement };
};
