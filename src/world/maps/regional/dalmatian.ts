// src/world/maps/regional/dalmatian.ts — the Dalmatian stone kit (Saltwind Narrows: a limestone harbour village on
// the Dalmatian coast, Brač and Šibenik hinterland). Two-storey houses of bare coursed limestone, some rendered in
// ochre or cream, under low canal-tile roofs that barely overhang, a stone eave course under the tiles, square stacks
// with little tile hoods; small windows in dressed limestone surrounds with louvred shutters (grilje) in green, brown
// or grey-blue; the konoba (cellar) door arched at street level and an outside stone stair (balatura) up to the living
// floor with a parapet; dry-stone shepherd huts (kažun) in the fields; stone boathouses on the quay; abandoned houses
// stand roofless with their gables.
import {
  LocalFrame, PartSink, faceBox, facePoint, pick, rgb, shade, UV_MEMBER,
  type EmitOptions, type Face, type RegionalBucket, type RegionalParts, type Rgb, type Vec3,
} from './geometry.ts';
import { orientedPrism } from './millWorks.ts';
import { buildHouse, windowRhythm, type HouseDialect, type HouseFrame, type HouseSpec, type Opening, type RoofSpec } from './house.ts';
import { doorUnit, gateUnit, windowUnit, type WindowStyle } from './openings.ts';
import { mound, pottedPlant, tvAerial, wallLantern, washingLine } from './dressing.ts';
import { balconette, dressedQuoin, facadeOn, facadeRng, trimRun } from './facade.ts';
import { ruinHouse, type RuinHead } from './ruinGrammar.ts';
import { coursedRound, recordMasonry } from './outbuildings.ts';
import type { ArchitectureStyle, RegionalBuildContext, RegionalBuilder } from './types.ts';
import { dalmatianBoathouse } from './harbourSheds.ts'; // props #25: the boathouse
import { dalmatianLoggia, dalmatianRibarnica } from './loggias.ts'; // props #23: the loggia and the fish market

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

// ---- (dome-detail-275) the canal tiles in relief, the dressed corners, the yard's stone and green ----

const lerp3 = (a: Vec3, ka: number, b: Vec3, kb: number): Vec3 => [a[0] * ka + b[0] * kb, a[1] * ka + b[1] * kb, a[2] * ka + b[2] * kb];
const cross3 = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** A convex polygon wound to face `toward` (dome-detail-275). */
function facing(sink: PartSink, bucket: RegionalBucket, pts: Vec3[], toward: Vec3, opts: EmitOptions): void {
  const n = cross3(lerp3(pts[1], 1, pts[0], -1), lerp3(pts[2], 1, pts[0], -1));
  sink.polygon(bucket, n[0] * toward[0] + n[1] * toward[1] + n[2] * toward[2] >= 0 ? pts : [...pts].reverse(), opts);
}

/**
 * A roof slope in its own terms (dome-detail-275): a point `v` up the slope from the eave's edge, `t` along it, `h` off
 * the covering; `lim(v)` how far either way the slope reaches at `v` (a hip closing it: `closes`); `reach` its run to
 * the ridge (a shed's: to its high wall).
 */
interface TileSlope {
  at: (v: number, t: number, h: number) => Vec3; n: Vec3; up: Vec3; along: Vec3; lim: (v: number) => number;
  reach: number; side: 1 | -1; end: boolean; closes: boolean;
}

function tileSlope(rg: HouseFrame['roof'], roof: RoofSpec, side: 1 | -1, end: boolean): TileSlope {
  const cosP = 1 / Math.hypot(1, rg.tanP), sinP = rg.tanP * cosP, xe = rg.s + roof.eave;
  const D = rg.halfD + (rg.hipVerge ?? roof.verge), hip = rg.kind === 'hip';
  if (end) {
    const ye = rg.topAt(0, side * D) ?? rg.eaveY;
    return {
      at: (v, t, h) => [t, ye + sinP * v + cosP * h, side * (D - cosP * v + sinP * h)], n: [0, cosP, side * sinP], up: [0, sinP, -side * cosP],
      along: [1, 0, 0], lim: (v) => xe - cosP * v, reach: (D - rg.ridgeHalf) / cosP, side, end, closes: true,
    };
  }
  const ye = rg.topAt(side * xe, 0) ?? rg.eaveY;
  const up: Vec3 = [-side * cosP, sinP, 0], n: Vec3 = [side * sinP, cosP, 0];
  return {
    at: (v, t, h) => [side * xe + up[0] * v + n[0] * h, ye + up[1] * v + n[1] * h, t], n, up, along: [0, 0, 1],
    lim: (v) => (hip ? rg.ridgeHalf + xe - cosP * v : D), reach: (rg.kind === 'shed' ? 2 * rg.s + roof.eave : xe) / cosP, side, end, closes: hip,
  };
}

/** The canal tiles' cover rows a hand apart, their radius, and the courses' lap up the slope. */
const TILE_PITCH = 0.25, TILE_R = 0.075, TILE_COURSE = 0.38;
/** A cover row's section (along, off the covering) × TILE_R: a half-round in three facets, its feet bedded in the pans. */
const ROLL: ReadonlyArray<readonly [number, number]> = [[1, -0.15], [0.5, 0.72], [-0.5, 0.72], [-1, -0.15]];

/**
 * One length of a cover row (dome-detail-275): the convex canal tiles laid butt over tail from `v0` to `v1` at `t`;
 * `mouth` its lower end open (dark at the eave, where the tiles' hollows show), `cap` its upper end closed.
 */
function coverRoll(sink: PartSink, sl: TileSlope, t: number, v0: number, v1: number, tone: number, mouth: number, cap: boolean): void {
  const ring = (v: number): Vec3[] => ROLL.map(([a, b]) => sl.at(v, t + a * TILE_R, b * TILE_R));
  const lo = ring(v0), hi = ring(v1), o: EmitOptions = { decor: true, shade: tone };
  for (let i = 0; i + 1 < ROLL.length; i++) {
    const a = (ROLL[i][0] + ROLL[i + 1][0]) / 2, b = (ROLL[i][1] + ROLL[i + 1][1]) / 2;
    facing(sink, 'roof', [lo[i], lo[i + 1], hi[i + 1], hi[i]], lerp3(sl.along, a, sl.n, b + 0.3), o);
  }
  if (mouth > 0) facing(sink, 'roof', lo, lerp3(sl.up, -1, sl.n, 0), { decor: true, shade: tone * mouth });
  if (cap) facing(sink, 'roof', hi, sl.up, o);
}

/**
 * A course's butt across the pans (dome-detail-275): a step a finger high at `v`, thinning up the slope to the next;
 * `ends` closes its ends (a run's first and last length: the lengths between abut).
 */
function courseStep(sink: PartSink, sl: TileSlope, v: number, t0: number, t1: number, tone: number, ends: readonly [boolean, boolean]): void {
  const len = TILE_COURSE * 1.1, b = 0.028;
  const l0 = sl.lim(v), l1 = sl.lim(v + len);
  const a0 = Math.max(t0, -l0), a1 = Math.min(t1, l0), c0 = Math.max(t0, -l1), c1 = Math.min(t1, l1);
  if (a1 - a0 < 0.2 || c1 - c0 < 0.05) return;
  const o: EmitOptions = { decor: true, fine: true, shade: tone };
  const A0 = sl.at(v, a0, -0.01), A1 = sl.at(v, a1, -0.01), B0 = sl.at(v, a0, b), B1 = sl.at(v, a1, b), C0 = sl.at(v + len, c0, -0.01), C1 = sl.at(v + len, c1, -0.01);
  facing(sink, 'roof', [A0, A1, B1, B0], lerp3(sl.up, -1, sl.n, 0), o);
  facing(sink, 'roof', [B0, B1, C1, C0], sl.n, o);
  if (ends[0] || a0 > t0 || c0 > t0) facing(sink, 'roof', [A0, B0, C0], lerp3(sl.along, -1, sl.n, 0), o);
  if (ends[1] || a1 < t1 || c1 < t1) facing(sink, 'roof', [A1, B1, C1], sl.along, o);
}

/** A stone the bura makes the islanders lay on the tiles (dome-detail-275), bedded across the cover rows. */
function buraStone(sink: PartSink, sl: TileSlope, v: number, t: number, look: () => number): void {
  const a = (look() - 0.5) * 1.4, ax = lerp3(sl.along, Math.cos(a), sl.up, Math.sin(a)), az = cross3(ax, sl.n);
  const hy = 0.07 + look() * 0.04;
  sink.box('stone', sl.at(v, t, hy - 0.012), [0.12 + look() * 0.09, hy, 0.1 + look() * 0.07], { decor: true, shade: 0.82 + look() * 0.26 },
    new LocalFrame(ax, sl.n, az, [0, 0, 0]), { ny: true });
}

/**
 * The canal tiles (kupe kanalice) in relief on a gable, hip or shed roof (dome-detail-275; the work list: "a smooth
 * roof"): the cover rows down each slope a hand apart, each row its own tone, their mouths dark along the eave, run
 * under the ridge or cut at the hip; a block of rows relaid in newer tiles; each course's butt a step across the pans;
 * and the stones laid on the tiles against the bura. Left open (a hand clear all round) over the stripped patch the
 * war wear opened (HouseFrame.roofPatch).
 */
function canalTiles(sink: PartSink, frame: HouseFrame, look: () => number, stones = 0.04): void {
  const rg = frame.roof, roof = frame.spec.roof, hole = frame.roofPatch, pad = 0.06;
  if (rg.kind !== 'gable' && rg.kind !== 'hip' && rg.kind !== 'shed') return;
  const cosP = 1 / Math.hypot(1, rg.tanP), xe = rg.s + roof.eave;
  const slopes = rg.kind === 'shed' ? [tileSlope(rg, roof, 1, false)] : [tileSlope(rg, roof, 1, false), tileSlope(rg, roof, -1, false)];
  if (rg.kind === 'hip' && rg.hipTan === undefined && rg.ridgeHalf < rg.halfD + roof.verge - 0.05) slopes.push(tileSlope(rg, roof, 1, true), tileSlope(rg, roof, -1, true));
  for (const sl of slopes) {
    const top = rg.kind === 'shed' ? sl.reach - 0.04 : sl.reach - 0.1 / cosP;
    const gap = hole && !sl.end && hole.side === sl.side ? { v0: (xe - hole.x1 - pad) / cosP, v1: (xe - hole.x0 + pad) / cosP, t0: hole.z0 - pad, t1: hole.z1 + pad } : null;
    const L = sl.lim(0), span = 2 * L - 0.16;
    const rw = 0.8 + look() * 1.5, rv = look() * top * 0.55, rt = (look() - 0.5) * Math.max(0, span - rw);
    const relaid = look() < 0.75 ? { t0: rt - rw / 2, t1: rt + rw / 2, v0: rv, v1: rv + 0.9 + look() * 1.3 } : null;
    const n = Math.max(2, Math.round(span / TILE_PITCH));
    for (let k = 0; k < n; k++) {
      const t = -L + 0.08 + (k + 0.5) * span / n + (look() - 0.5) * 0.024, tone = 0.8 + look() * 0.24;
      const vEnd = sl.closes ? Math.min(top, (L - Math.abs(t) - TILE_R) / cosP) : top;
      if (vEnd < 0.3) continue;
      const spans: Array<[number, number]> = gap && t + TILE_R > gap.t0 && t - TILE_R < gap.t1 ? [[-0.05, Math.min(vEnd, gap.v0)], [gap.v1, vEnd]] : [[-0.05, vEnd]];
      for (const [a, b] of spans) {
        if (b - a < 0.2) continue;
        // the row's lengths: its own tone, a relaid block's brighter tiles across it
        const cuts = relaid && t > relaid.t0 && t < relaid.t1 ? [a, Math.min(b, Math.max(a, relaid.v0)), Math.min(b, Math.max(a, relaid.v1)), b] : [a, b];
        const pieces: Array<[number, number, number]> = [];
        for (let i = 0; i + 1 < cuts.length; i++) if (cuts[i + 1] - cuts[i] > 0.05) pieces.push([cuts[i], cuts[i + 1], cuts.length > 2 && i === 1 ? 1.1 : tone]);
        pieces.forEach(([p0, p1, tn], i) => coverRoll(sink, sl, t, p0, p1, tn, i ? 0 : a < 0 ? 0.42 : 0.7, i === pieces.length - 1 && p1 < top - 0.01));
      }
    }
    // the courses' butts across the pans, a few metres a length, left out over the patch
    for (let v = TILE_COURSE + 0.04; v < top - 0.3; v += TILE_COURSE) {
      const lv = sl.lim(v), len = TILE_COURSE * 1.1;
      const runs: Array<[number, number]> = gap && v + len > gap.v0 && v < gap.v1 ? [[-lv, gap.t0], [gap.t1, lv]] : [[-lv, lv]];
      for (const [c0, c1] of runs) {
        for (let t = c0; t < c1 - 0.2;) {
          const w = Math.min(c1 - t, 2.2 + look() * 2.4);
          courseStep(sink, sl, v + (look() - 0.5) * 0.03, t, t + w, 0.84 + look() * 0.18, [t === c0, t + w >= c1]);
          t += w;
        }
      }
    }
    // the bura's stones, more toward the eaves and the verges
    const count = Math.round(2 * L * top * stones * (0.6 + look() * 0.8));
    for (let i = 0; i < count; i++) {
      const v = 0.3 + look() * look() * top * 0.8, lv = sl.lim(v) - 0.3, t = (look() * 2 - 1) * lv;
      if (lv < 0.25 || (gap && v > gap.v0 - 0.3 && v < gap.v1 + 0.3 && t > gap.t0 - 0.3 && t < gap.t1 + 0.3)) continue;
      buraStone(sink, sl, v, t, look);
    }
  }
}

/** Dressed limestone quoins up a body's corners (dome-detail-275), long and short in turn, a few cm proud of the rubble. */
function quoinRun(sink: PartSink, b: { x0: number; x1: number; z0: number; z1: number }, y0: number, y1: (sx: number, sz: number) => number,
  look: () => number, corners: ReadonlyArray<readonly [1 | -1, 1 | -1]> = [[-1, -1], [1, -1], [1, 1], [-1, 1]]): void {
  for (const [sx, sz] of corners) {
    const x = sx > 0 ? b.x1 : b.x0, z = sz > 0 ? b.z1 : b.z0, top = y1(sx, sz);
    for (let y = y0, k = look() < 0.5 ? 0 : 1; y < top - 0.2; y += 0.36, k++) {
      const lx = k % 2 ? 0.26 : 0.5, lz = k % 2 ? 0.5 : 0.26;
      sink.quoin('stone', x - sx * lx, y, z - sz * lz, x + sx * 0.035, Math.min(top, y + 0.34), z + sz * 0.035, sx, sz, { decor: true, shade: 1.02 + look() * 0.08 });
    }
  }
}

/** A loose stone lying on the ground (dome-detail-275): fallen from a wall head, cleared from a field. */
function looseStone(sink: PartSink, x: number, z: number, size: number, look: () => number): void {
  const a = look() * Math.PI, ax: Vec3 = [Math.cos(a), 0, Math.sin(a)], az: Vec3 = [-Math.sin(a), 0, Math.cos(a)];
  const hy = size * (0.35 + look() * 0.2);
  sink.box('stone', [x, hy - 0.04, z], [size * (0.7 + look() * 0.5), hy, size * (0.5 + look() * 0.4)], { decor: true, shade: 0.78 + look() * 0.24 },
    new LocalFrame(ax, [0, 1, 0], az, [0, 0, 0]), { ny: true });
}

/** A clump of growth (dome-detail-275): a bush of macchia, a bramble, a vine's leaves; closed under it when `under`. */
function growth(sink: PartSink, c: Vec3, rx: number, rz: number, h: number, colour: Rgb, look: () => number, under = 0, a = look() * Math.PI): void {
  const ax: Vec3 = [Math.cos(a), 0, Math.sin(a)], az: Vec3 = [-Math.sin(a), 0, Math.cos(a)];
  const tint = shade(colour, 0.85 + look() * 0.3);
  mound(sink, c, ax, az, rx, rz, h, tint, { decor: true }, 0, 5);
  if (under > 0) mound(sink, c, ax, az, rx, rz, -under, shade(tint, 0.7), { decor: true }, 0, 5);
}

const LEAF: Rgb = rgb(0x52683a), MACCHIA: Rgb = rgb(0x5b6a44), IRON: Rgb = [0.08, 0.08, 0.09];

/** A barred vent high in a store's wall (dome-detail-275): iron bars across its reveal, a dressed frame round it. */
function barredVent(sink: PartSink, face: Face, u: number, y: number, w: number, h: number): void {
  const back = sink.recess > 0 ? -sink.recess * 0.45 : 0.02;
  for (const k of [-1, 0, 1]) faceBox(sink, 'structureMetal', face, u + k * w * 0.28, y + h / 2, back, 0.03, h + 0.04, 0.03, { colour: IRON, decor: true });
  faceBox(sink, 'stone', face, u, y + h + 0.09, 0.035, w + 0.4, 0.18, 0.07, { decor: true, shade: 1.07 });
  faceBox(sink, 'stone', face, u, y - 0.06, 0.045, w + 0.3, 0.12, 0.09, { decor: true, shade: 1.07 });
  for (const s of [-1, 1]) faceBox(sink, 'stone', face, u + s * (w / 2 + 0.08), y + h / 2, 0.03, 0.16, h, 0.06, { decor: true, shade: 1.07 });
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
        // (props census r2 sweep, Lane C 2026-10-16: a trailing clump hung 3 cm under the trellis and stood off the wall,
        // floating) a trail hangs from the trellis and lies on the wall; the draws as before
        const y = trail ? 2.6 - h / 2 : 2.66 + (look() - 0.5) * 0.24;
        const du = (look() - 0.5) * 0.15, out = 0.22 + look() * 0.12, depth = 0.18 + look() * 0.16;
        faceBox(sink, 'structureWood', f, u + du, y, trail ? depth / 2 + 0.005 : out, w, h, depth, { colour: shade(leaf, 0.75 + look() * 0.45), decor: true });
      }
    }
    // (dome-detail-275, the roof sweep) the canal tiles in relief with the bura's stones, as the farmhouse lays them
    // (the look stream, after every other draw of it)
    canalTiles(sink, frame, ctx.variant);
  });
  return sink.finish();
}

/**
 * The farmhouse: a stone house with a lower stone stable wing under a lean-to, and a walled yard gate. (dome-detail-275;
 * the work list: "the annex is plain and the roof smooth") Both roofs' canal tiles in relief with the bura's stones on
 * them, dressed quoins up the house's and the wing's corners, the wing's eave course; before the yard door the odrina, a
 * vine on a timber frame on two stone pillars, a stone bench under it; the cistern's head (gustirna) in the yard with
 * its iron hoop and pulley, a trough beside it.
 */
const farmhouse: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx);
  const rng = st.rng, look = ctx.variant;
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
  // (dome-detail-275) the canal tiles in relief, the dressed quoins
  canalTiles(sink, frame, look);
  quoinRun(sink, frame.bodies[0], frame.floors[0], () => frame.eaveY - 0.16, look);
  // (dome-detail-275) the odrina before the yard door: two stone pillars, a beam from each back into the wall, poles across
  // them, the vine's stock up one pillar and its leaves in loose clumps over the poles
  const lf = frame.faces.left, du = D * 0.12, reach = 2.1, timber = rgb(0x6a5440);
  for (const s of [-1, 1]) {
    const u = du + s * 1.25;
    faceBox(sink, 'stone', lf, u, 1.2, reach, 0.34, 2.4, 0.34);
    faceBox(sink, 'stone', lf, u, 2.43, reach, 0.42, 0.06, 0.42, { decor: true, shade: 1.06 });
    faceBox(sink, 'structureWood', lf, u, 2.53, (reach + 0.13) / 2, 0.12, 0.14, reach + 0.21, { colour: timber, decor: true, uv: UV_MEMBER });
  }
  for (const o of [0.45, 0.95, 1.45, 1.95]) faceBox(sink, 'structureWood', lf, du, 2.635, o, 2.9, 0.07, 0.07, { colour: shade(timber, 0.9), decor: true, uv: UV_MEMBER });
  const stock = (u: number, y: number, o: number): Vec3 => facePoint(lf, u, y, o);
  sink.pipe('structureWood', stock(du - 1.25 + 0.24, -0.05, reach - 0.05), stock(du - 1.2, 1.3, reach - 0.12), 0.06, 5, { colour: rgb(0x5a5046), decor: true }, 0.05);
  sink.pipe('structureWood', stock(du - 1.2, 1.3, reach - 0.12), stock(du - 1.25, 2.5, reach - 0.5), 0.05, 5, { colour: rgb(0x5a5046), decor: true }, 0.04);
  for (let i = 0, n = 6 + Math.floor(look() * 3); i < n; i++) {
    growth(sink, stock(du + (look() - 0.5) * 2.5, 2.66, 0.35 + look() * 1.75), 0.45 + look() * 0.35, 0.35 + look() * 0.3, 0.22 + look() * 0.2, LEAF, look, 0.12);
  }
  // the stone bench along the wall beside the door, under the vine
  faceBox(sink, 'stone', lf, du + 1.4, 0.43, 0.22, 1.0, 0.08, 0.42, { decor: true, shade: 1.04 });
  for (const s of [-1, 1]) faceBox(sink, 'stone', lf, du + 1.4 + s * 0.38, 0.2, 0.2, 0.14, 0.4, 0.36, { decor: true, shade: 0.92 });
  // (dome-detail-275) the cistern's head in the yard: a dressed kerb over the rain cistern, its cap slab and dark mouth,
  // the iron hoop and its pulley over it; the stone trough beside it
  const qx = -W / 2 - 1.5, qz = -D / 2 + 1.4;
  sink.span('stone', qx - 0.5, -0.1, qz - 0.5, qx + 0.5, 0.78, qz + 0.5);
  sink.span('stone', qx - 0.57, 0.78, qz - 0.57, qx + 0.57, 0.88, qz + 0.57, { decor: true, shade: 1.06 });
  sink.quad('dark', [qx - 0.27, 0.884, qz + 0.27], [qx + 0.27, 0.884, qz + 0.27], [qx + 0.27, 0.884, qz - 0.27], [qx - 0.27, 0.884, qz - 0.27], { decor: true });
  for (const s of [-1, 1]) sink.span('structureMetal', qx + s * 0.45 - 0.02, 0.86, qz - 0.02, qx + s * 0.45 + 0.02, 1.72, qz + 0.02, { colour: IRON, decor: true });
  sink.span('structureMetal', qx - 0.47, 1.68, qz - 0.025, qx + 0.47, 1.73, qz + 0.025, { colour: IRON, decor: true });
  sink.cylinder('structureMetal', [qx - 0.02, 1.58, qz], 'x', 0.04, 0.1, 8, { colour: shade(IRON, 1.6), decor: true });
  sink.span('structureMetal', qx - 0.01, 1.66, qz - 0.01, qx + 0.01, 1.69, qz + 0.01, { colour: IRON, decor: true });
  sink.span('stone', qx - 0.32, -0.05, qz + 0.75, qx + 0.32, 0.48, qz + 1.95, { decor: true, shade: 0.95 });
  sink.quad('dark', [qx - 0.22, 0.485, qz + 1.85], [qx + 0.22, 0.485, qz + 1.85], [qx + 0.22, 0.485, qz + 0.85], [qx - 0.22, 0.485, qz + 0.85], { decor: true, shade: 1.6 });
  // the stable wing on +x: one storey of rubble under a lean-to of canal tiles falling away from the house. (Props
  // census #15, Lane C 2026-10-16: "two solid stone span boxes, a plank doorUnit laid on its end face (nothing cut),
  // and a lean-to that is one slab") a house body of its own: its stable door cut through its low end, a light cut
  // through each side, the lean-to's courses, its gutterless eave over the door; the damage reads it as its own body.
  const ww = Math.min(W * 0.7, 5.0);
  const wz = -D * 0.16;
  // (its reach no further than the old wing's: its plinth and eave inside the old slab's)
  const lean: RoofSpec = { kind: 'shed', pitchDeg: 16, eave: 0.22, verge: 0.12, thickness: 0.14, bucket: 'roof' };
  const wl = wingL - 0.04;
  sink.placed(0, W / 2 + wl / 2, 0, wz, () => {
    const wf = buildHouse(sink, {
      w: wl, d: ww, plinth: { h: 0.15, out: 0.04, bucket: 'stone' }, storeys: [{ h: 2.15, wall: 'stone' }], roof: lean, gableBucket: 'stone',
      openings: [
        { face: 'right', storey: 0, kind: 'door', u: 0, w: 1.3, y0: 0, h: 1.85 },
        { face: 'front', storey: 0, kind: 'window', u: 0, w: 0.5, y0: 1.2, h: 0.45 },
        { face: 'back', storey: 0, kind: 'window', u: 0, w: 0.5, y0: 1.2, h: 0.45 },
      ],
      chimneys: [], gutters: null, verge: null, reveal: 0.32, core: 'rubble',
    }, {
      ...dialect(st),
      door: (s, face, o, y0) => doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, {
        leaf: shade(st.door, 0.9), frame: { bucket: 'stone', width: 0.2, out: 0.06 }, transom: false, steps: { bucket: 'stone' }, leafKind: 'plank',
      }, 0.15),
    });
    // (dome-detail-275) the lean-to's canal tiles, the wing's quoins at its outer corners, its eave course over the stable door
    canalTiles(sink, wf, look, 0.06);
    const wb = wf.bodies[0];
    quoinRun(sink, wb, wf.floors[0], () => wf.eaveY - 0.12, look, [[1, -1], [1, 1]]);
    sink.span('stone', wb.x1, wf.eaveY - 0.14, wb.z0 - 0.06, wb.x1 + 0.18, wf.eaveY, wb.z1 + 0.06);
    // (Lane C 2026-10-16, building-integrity: the sky showed through the wing under its lean-to, 2.35 m2 from the front)
    // the end walls' raking tops built up to the lean-to's underside (a shed roof leaves its ends open: roofGeometry
    // gives a shed no gable)
    const rg = wf.roof;
    for (const end of [1, -1]) {
      const z0 = end > 0 ? rg.halfD - 0.25 : -rg.halfD;
      orientedPrism(sink, 'stone', [[rg.s, rg.eaveY - 0.02, z0], [-rg.s, rg.eaveY + 2 * rg.s * rg.tanP - 0.02, z0], [-rg.s, rg.eaveY - 0.02, z0]], [0, 0, 1], 0.25, {});
    }
  });
  return sink.finish();
};

/**
 * A stone storehouse with a loading quay on +x (the base depot's footprint). (dome-detail-275; the work list: "a long
 * hall with a blank back and gables and a smooth roof") The magazin of the riva: its canal tiles in relief with the
 * bura's stones on them, dressed quoins up its corners, a raking course of stone slabs under each verge; the front gate
 * under a monolith lintel carrying its date panel, the loading hatch over it and the hoist beam out of the gable; the
 * long back wall's barred vents high under the eaves and a vent in the back gable; the quay's coping, its steps,
 * bollards and barrels; worn paving before the gate, loose stones and macchia at the back wall's foot.
 */
const depot: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx);
  const look = ctx.variant;
  const pw = 2.6;
  const W = Math.max(5.8, Math.min(7.0, ctx.bounds.maxX - ctx.bounds.minX - pw - 1.4));
  const D = Math.max(14, ctx.info.d - 2.6);
  const cx = ctx.bounds.minX + 0.15 + W / 2;
  const openings: Opening[] = [];
  const bays = Math.max(2, Math.round(D / 4.6));
  for (let k = 0; k < bays; k++) {
    const u = -D / 2 + (k + 0.5) * (D / bays);
    openings.push(k % 2 === 0 ? { face: 'right', storey: 0, kind: 'gate', u, w: 1.9, y0: 0, h: 2.5 }
      : { face: 'right', storey: 0, kind: 'window', u, w: 0.7, y0: 1.8, h: 0.8 });
  }
  openings.push({ face: 'front', storey: 0, kind: 'gate', u: 0, w: 2.4, y0: 0, h: 2.8 });
  // (dome-detail-275) the loading hatch over the gate; the back wall's barred vents high under the eaves
  openings.push({ face: 'front', storey: 0, kind: 'door', u: 0, w: 1.05, y0: 3.35, h: 0.8 });
  for (let k = 0, n = Math.max(3, Math.round(D / 4.2)); k < n; k++) openings.push({ face: 'left', storey: 0, kind: 'loft', u: -D / 2 + (k + 0.5) * D / n, w: 0.42, y0: 3.0, h: 0.5 });
  const base = dialect({ ...st, litShare: 0.05 });
  const dl: HouseDialect = {
    ...base,
    window: (s, face, o, y0, fr) => (o.kind === 'loft' ? barredVent(s, face, o.u, y0 + o.y0, o.w, o.h) : base.window(s, face, o, y0, fr)),
    door: (s, face, o, y0, fr) => (o.y0 < 1 ? base.door(s, face, o, y0, fr) : doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, {
      leaf: shade(st.door, 0.85), frame: { bucket: 'stone', width: 0.18, out: 0.06 }, steps: null, leafKind: 'plank', transom: false,
    }, y0 + o.y0)),
    // (dome-detail-275) the back gable's vent under the ridge
    gableOpenings: (face, _poly, fr) => (face.out[2] < 0 ? [{ u0: -0.19, u1: 0.19, y0: fr.roof.ridgeY - 0.95, y1: fr.roof.ridgeY - 0.6 }] : []),
  };
  sink.placed(0, cx, 0, 0, () => {
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: 0.2, out: 0.04, bucket: 'stone' }, storeys: [{ h: 4.2, wall: 'stone' }],
      roof: { kind: 'gable', pitchDeg: 21, eave: 0.25, verge: 0.1, thickness: 0.15, bucket: 'roof', ridge: 'round' },
      gableBucket: 'stone', openings, chimneys: [], gutters: null, verge: null,
    }, dl);
    eaveCourse(sink, frame);
    // (dome-detail-275) the canal tiles in relief, the quoins, the raking course of slabs under each verge
    canalTiles(sink, frame, look);
    const b = frame.bodies[0], f = frame.faces.front, y0 = frame.floors[0], rg = frame.roof;
    quoinRun(sink, b, y0, () => frame.eaveY - 0.16, look);
    for (const end of [1, -1]) for (const side of [1, -1]) {
      const z = end * D / 2;
      sink.member('stone', [side * (rg.s + 0.06), frame.eaveY - 0.12, z], [0, rg.ridgeY - 0.12, z], 0.2, 0.09, [0, 0, end], { decor: true, shade: 1.06 });
    }
    // (dome-detail-275) the gate's monolith lintel a hand proud, the store's date panel raised on it
    const gy = y0 + 2.8;
    faceBox(sink, 'stone', f, 0, gy + 0.19, 0.05, 3.3, 0.34, 0.1, { decor: true, shade: 1.07 });
    faceBox(sink, 'stone', f, 0, gy + 0.19, 0.115, 0.95, 0.2, 0.035, { decor: true, fine: 'near', shade: 1.14 });
    // (dome-detail-275) the hoist beam out of the gable over the hatch, its block hung from its end on a strap
    const by = frame.eaveY + 0.34;
    faceBox(sink, 'structureWood', f, 0, by, 0.45, 0.18, 0.2, 1.1, { colour: rgb(0x5a4632), decor: true, uv: UV_MEMBER });
    faceBox(sink, 'dark', f, 0, by - 0.3, 0.88, 0.12, 0.26, 0.1, { decor: true });
    faceBox(sink, 'dark', f, 0, by - 0.13, 0.88, 0.03, 0.1, 0.03, { decor: true });
    // (dome-detail-275) the back gable's vent: its bars in the reveal, its dressed frame
    sink.recess = frame.gableReveal;
    try { barredVent(sink, frame.faces.back, 0, rg.ridgeY - 0.95, 0.38, 0.35); } finally { sink.recess = 0; }
    // (dome-detail-275) worn paving before the gate, each slab its own size and wear
    for (let r = 0; r < 2; r++) {
      for (let x = -1.6 + look() * 0.2; x < 1.5;) {
        const w = Math.min(1.65 - x, 0.6 + look() * 0.5);
        sink.box('stone', [x + w / 2, -0.03, D / 2 + 0.34 + r * 0.52], [w / 2 - 0.015, 0.06, 0.25], { decor: true, shade: 0.8 + look() * 0.18 }, undefined, { ny: true });
        x += w;
      }
    }
    // (dome-detail-275) loose stones and macchia at the long back wall's foot
    for (let i = 0, n = 4 + Math.floor(look() * 3); i < n; i++) looseStone(sink, -W / 2 - 0.12 - look() * 0.25, (look() - 0.5) * (D - 1), 0.13 + look() * 0.1, look);
    for (let i = 0; i < 3; i++) growth(sink, [-W / 2 - 0.05, -0.02, (look() - 0.5) * (D - 2)], 0.4, 0.5 + look() * 0.6, 0.35 + look() * 0.35, MACCHIA, look, 0, 0);
  });
  // the quay: a stone platform along +x with bollards
  const px0 = cx + W / 2, px1 = px0 + pw, qz = D / 2 + 0.4;
  sink.span('stone', px0, -0.4, -qz, px1, 0.7, qz);
  // (dome-detail-275) its coping: dressed blocks along the outer edge, each its own length and tone, a few cm over the face
  for (let z = -qz; z < qz - 0.1;) {
    const l = Math.min(qz - z, 0.9 + look() * 0.8);
    sink.box('stone', [px1 - 0.17, 0.745, z + l / 2], [0.21, 0.045 + look() * 0.015, l / 2 - 0.01], { decor: true, shade: 0.94 + look() * 0.14 }, undefined, { ny: true });
    z += l;
  }
  // (dome-detail-275) its steps up at the -z end
  for (const [k, top] of [[2, 0.24], [1, 0.47]] as const) sink.span('stone', px0 + 0.45, -0.1, -qz - 0.32 * k, px1 - 0.3, top, -qz - 0.32 * (k - 1), { decor: true, shade: 0.9 + 0.05 * k });
  // (dome-detail-275) the bollards turned, waisted under their heads
  for (let z = -D / 2 + 1; z < D / 2; z += 4) sink.revolve('stone', [px1 - 0.62, 0.7, z], 'y', [[0, 0.2], [0.36, 0.15], [0.46, 0.21], [0.56, 0.19], [0.6, 0]], 8, { decor: true, shade: 0.92 });
  // (dome-detail-275) wine barrels stood on the quay by the second gate
  const zg = D / 2 - 2.5 * D / bays, oak = rgb(0x5e4630);
  for (let i = 0, n = 1 + Math.floor(look() * 3); i < n; i++) {
    sink.revolve('structureWood', [px0 + 0.45 + (i === 2 ? 0.62 : 0), 0.7, zg + 1.35 + (i % 2) * 0.64], 'y', [[0, 0.26], [0.12, 0.3], [0.42, 0.32], [0.72, 0.3], [0.84, 0.26], [0.84, 0]], 8,
      { decor: true, colour: oak, bandColour: (band) => (band === 0 || band === 3 ? shade(IRON, 2.4) : shade(oak, 0.9 + 0.1 * band)) });
  }
  return sink.finish();
};

/**
 * A small stone storehouse (no staddles on the coast): one storey, a low tiled roof. (Props census #22, Lane C
 * 2026-10-16: "no stone door surround or lintel, no quoins and no step".) It stands on a plinth course sunk into the
 * ground, its door framed in dressed jambs under a monolith lintel and a stone step, its corners in long-and-short
 * quoins, its vent cut through the side wall. (dome-detail-275) Its canal tiles in relief with a stone or two on them
 * against the bura; the field stones cleared and heaped against its back wall (gromača), macchia at its corners.
 */
const granary: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx);
  const look = ctx.variant;
  const W = Math.max(3.4, ctx.info.w - 0.6), D = Math.max(4.2, ctx.info.d - 1.6), plinth = 0.3, dw = 0.95, dh = 1.95;
  const base = dialect({ ...st, litShare: 0 });
  const frame = buildHouse(sink, {
    w: W, d: D, plinth: { h: plinth, out: 0.06, bucket: 'stone' }, storeys: [{ h: 2.4, wall: 'stone' }],
    roof: { kind: 'gable', pitchDeg: 22, eave: 0.18, verge: 0.06, thickness: 0.14, bucket: 'roof', ridge: 'round' },
    gableBucket: 'stone', openings: [{ face: 'front', storey: 0, kind: 'door', u: 0, w: dw, y0: 0, h: dh },
      { face: 'right', storey: 0, kind: 'loft', u: 0, w: 0.4, y0: 1.4, h: 0.4 }],
    chimneys: [], gutters: null, verge: null, reveal: 0.3, core: 'rubble',
  }, {
    ...base,
    // the vent is left empty, its reveal and the store's dark; the door's leaf in the reveal, its dressed stone round it
    window: (s, face, o, y0, fr) => { if (o.kind !== 'loft') base.window(s, face, o, y0, fr); },
    door: (s, face, o, y0) => doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, {
      leaf: st.door, frame: { bucket: 'stone', width: 0.2, out: 0.05 }, transom: false, steps: { bucket: 'stone' }, leafKind: 'plank',
    }, plinth),
  });
  eaveCourse(sink, frame);
  canalTiles(sink, frame, look, 0.07);
  const f = frame.faces.front, y0 = frame.floors[0];
  // the monolith lintel over the jambs, a hand wider than them each side
  faceBox(sink, 'stone', f, 0, y0 + dh + 0.2 + 0.14, 0.04, dw + 0.4 + 0.3, 0.28, 0.09, { decor: true, fineSides: true, shade: 1.06 });
  // the quoins up the four corners from the plinth to the eaves, long and short in turn
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
    const x = sx * W / 2, z = sz * D / 2;
    for (let y = y0, k = 0; y < frame.eaveY - 0.2; y += 0.36, k++) {
      const lx = k % 2 ? 0.24 : 0.46, lz = k % 2 ? 0.46 : 0.24;
      sink.quoin('stone', x - sx * lx, y, z - sz * lz, x + sx * 0.035, Math.min(frame.eaveY, y + 0.34), z + sz * 0.035, sx, sz, { decor: true, shade: 1.05 });
    }
  }
  // (dome-detail-275) the field stones heaped against the back wall: a bank of rubble, the bigger stones round its foot
  const hz = -D / 2 - 0.05;
  mound(sink, [(look() - 0.5) * 0.8, -0.05, hz], [1, 0, 0], [0, 0, 1], 1.15 + look() * 0.3, 0.55, 0.5 + look() * 0.2, rgb(0xb4ae9f), { decor: true }, 0, 6);
  for (let i = 0, n = 5 + Math.floor(look() * 3); i < n; i++) looseStone(sink, (look() - 0.5) * 2.6, hz - 0.35 - look() * 0.3, 0.13 + look() * 0.09, look);
  // (dome-detail-275) macchia at two corners
  for (const [sx, sz] of [[1, 1], [-1, -1]] as const) growth(sink, [sx * (W / 2 + 0.05), -0.02, sz * (D / 2 - 0.3)], 0.35, 0.45 + look() * 0.3, 0.3 + look() * 0.3, MACCHIA, look, 0, 0);
  return sink.finish();
};

/**
 * The kažun (the props census #17, 2026-10-15, the judges: "dry-stone construction: the wall and cone as courses of
 * rough stones (stepped corbel rings with uneven stone faces) and a capstone; cut the doorway through the 0.6 m wall with
 * a monolith lintel and jambs and a dark interior; destroyed: it slumps into a heap of its own stones with the lintel
 * fallen"): the round field hut of the karst laid course by course without mortar (outbuildings.ts coursedRound), its
 * corbelled cone stepping in ring by ring to the capstone, its low door to +x; it falls as a heap of its stones.
 */
const kazun: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const R = Math.max(1.7, Math.min(2.3, Math.min(ctx.info.w, ctx.info.d) / 2 - 0.2));
  const wallH = 1.9 + rng() * 0.3;
  const round = coursedRound(sink, { cx: 0, cz: 0, R, wallH, T: 0.6, course: 0.3, stone: 0.72, cone: { rings: 6, rise: 2.4, cap: 0.36 }, bucket: 'stone',
    door: { angle: 0, w: 0.62, h: 1.5 }, mobile: ctx.tier === 'mobile' }, ctx.variant);
  recordMasonry(sink, { x: 0, z: 0, r: R, h: round.top, bucket: 'stone' }, round.lintel);
  return sink.finish();
};

/**
 * An abandoned house (the war of 1991–95 and the emigration before it): the stone shell standing to its gables, the
 * wall heads broken in slopes, not steps, a breach or two down toward the sill, window holes through the walls that
 * still stand high enough to hold them, the roof fallen in as a heap of tiles and rubble. (dome-detail-275) The dressed
 * quoins on the corners still standing; the fig that seeds itself in every abandoned Dalmatian house grown up out of
 * the heaps over the wall heads; stones fallen from the heads lying round the foot, macchia and bramble at it.
 */
const ruin: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant;
  const W = Math.max(5.4, ctx.info.w - 0.3), D = Math.max(7.4, ctx.info.d - 0.3);
  const t = 0.5, H1 = 5.2;
  // (props census #7, lane B 2026-10-14; the judges: "the windows dark boxes through the wall") the ruin grammar: the
  // two storeys' own walls standing to the gables with a breach toward the sill, the door and the windows of both storeys
  // cut through where the wall still stands over them, the tiles slid in over the heaps
  const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'door', u: (rng() - 0.5) * (W - 2.4), w: 1.0, y0: 0, h: 2.1 }];
  for (const s of [0, 1]) for (const face of ['right', 'left'] as const) for (const u of [-(D - 2 * t) * 0.25, (D - 2 * t) * 0.25]) {
    openings.push({ face, storey: s, kind: 'window', u, w: 0.7, y0: s === 0 ? 0.9 : 0.6, h: 1.0 });
  }
  const side = (): RuinHead => ({ a: H1 * (0.6 + rng() * 0.36), b: H1 * (0.6 + rng() * 0.36), at: 0.15 + rng() * 0.7, dip: rng() < 0.6 ? 0.75 : 0.2, ragged: 0.35 });
  const gable = (): RuinHead => (rng() < 0.75 ? { a: H1, b: H1, at: 0.5, dip: -(W * 0.18) / H1, ragged: 0.3 } : side());
  const rf = ruinHouse(sink, {
    w: W, d: D, t, wall: 'stone', plinth: null, storeys: [2.8, 2.4], openings,
    heads: { front: gable(), back: gable(), right: side(), left: side() }, stub: 0.6,
    lintel: { bucket: 'stone' }, roof: { bucket: 'roof', piece: [0.45, 0.3, 0.02] }, timber: rgb(0x2b2621), mobile: ctx.tier === 'mobile',
  }, rng, look);
  // (dome-detail-275) the quoins up each corner to a course under the lower of its two broken heads
  const head = (name: 'front' | 'back' | 'right' | 'left', first: boolean): number => {
    const tops = rf.tops[name];
    return first ? Math.min(tops[0], tops[1] ?? tops[0]) : Math.min(tops[tops.length - 1], tops[tops.length - 2] ?? tops[tops.length - 1]);
  };
  quoinRun(sink, { x0: -W / 2, x1: W / 2, z0: -D / 2, z1: D / 2 }, rf.floor - 0.1, (sx, sz) => Math.min(
    sz > 0 ? head('front', sx < 0) : head('back', sx > 0), sx > 0 ? head('right', sz > 0) : head('left', sz < 0)) - 0.3, look);
  // (dome-detail-275) the fig: its trunk out of the heaps, three limbs, its leaves in heavy clumps over the wall heads
  const fx = (look() - 0.5) * (W - 2 * t - 1.6), fz = (look() - 0.5) * (D - 2 * t - 2), bark = rgb(0x8a847a), fig = rgb(0x5f8044);
  const root: Vec3 = [fx, rf.restOn(fx, fz) - 0.15, fz], fork: Vec3 = [fx + (look() - 0.5) * 0.5, root[1] + 1.0 + look() * 0.4, fz + (look() - 0.5) * 0.5];
  sink.pipe('structureWood', root, fork, 0.16, 6, { colour: bark, decor: true }, 0.13);
  // (its leaves overhang the heads by no more than half a metre past the plot)
  const hx = ctx.info.w / 2 + 0.45, hz = ctx.info.d / 2 + 0.45;
  for (let k = 0; k < 3; k++) {
    const a = (k + look() * 0.6) * Math.PI * 2 / 3, r = 0.7 + look() * 0.5, rx = 1.0 + look() * 0.35, rz = 0.85 + look() * 0.3;
    const reach = Math.max(rx, rz), clamp = (v: number, h: number) => Math.max(-h + reach, Math.min(h - reach, v));
    const tip: Vec3 = [clamp(fork[0] + Math.cos(a) * r, hx), fork[1] + 0.8 + look() * 0.9, clamp(fork[2] + Math.sin(a) * r, hz)];
    sink.pipe('structureWood', fork, tip, 0.11, 5, { colour: bark, decor: true }, 0.06);
    growth(sink, tip, rx, rz, 0.7 + look() * 0.35, fig, look, 0.55);
  }
  growth(sink, [fork[0], fork[1] + 1.55 + look() * 0.3, fork[2]], 1.15, 1.0, 0.85, fig, look, 0.6);
  // (dome-detail-275) the stones fallen from the heads round the foot, macchia and bramble at it
  for (const [name, x0, z0, ax, az, L] of [['front', 0, D / 2, 1, 0, W], ['back', 0, -D / 2, 1, 0, W], ['right', W / 2, 0, 0, 1, D], ['left', -W / 2, 0, 0, 1, D]] as const) {
    const out = name === 'front' ? [0, 1] : name === 'back' ? [0, -1] : name === 'right' ? [1, 0] : [-1, 0];
    for (let i = 0, n = 2 + Math.floor(look() * 3); i < n; i++) {
      const u = (look() - 0.5) * (L - 0.8), o = 0.12 + look() * 0.22;
      looseStone(sink, x0 + ax * u + out[0] * o, z0 + az * u + out[1] * o, 0.11 + look() * 0.1, look);
    }
    if (look() < 0.75) {
      const u = (look() - 0.5) * (L - 1.6);
      growth(sink, [x0 + ax * u + out[0] * 0.1, -0.02, z0 + az * u + out[1] * 0.1], ax ? 0.7 + look() * 0.5 : 0.35, az ? 0.7 + look() * 0.5 : 0.35, 0.4 + look() * 0.4, MACCHIA, look, 0, 0);
    }
  }
  return sink.finish();
};

const canalHip = (pitch: number, eave: number): RoofSpec => ({ kind: 'hip', pitchDeg: pitch, eave, verge: eave, thickness: 0.15, bucket: 'roof', ridge: 'round' });

/**
 * The fish store on the riva (magazin): two storeys of limestone under a hipped canal-tile roof, a row of arched
 * cellar doors to the quay, small square loft windows above, a hoist beam over a loading door, and the quay apron
 * with its bollards (the base fishery's dock side, +z). (dome-detail-275) Its canal tiles in relief round the four
 * slopes with the bura's stones on them, dressed quoins, a string course at the loft floor; the loading door in plank
 * leaves; the apron's coping along the water, its bollards turned, fish crates stacked and a net hung to dry on a rail.
 */
const fishStore: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx);
  const look = ctx.variant;
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
  const base = dialect({ ...st, litShare: 0.12 });
  const frame = buildHouse(sink, {
    w: W, d: D, plinth: { h: 0.22, out: 0.05, bucket: 'stone' }, storeys: [{ h: 3.1, wall: 'stone' }, { h: 2.5, wall: 'stone' }],
    roof: canalHip(21, 0.24), openings, chimneys: [], gutters: null, verge: null, reveal: 0.32,
  }, {
    ...base,
    // (dome-detail-275) the loading door in plank leaves (it was a glazed light): the light's draws made and its parts
    // left out, so every window after it draws as before
    window: (s, face, o, y0, fr) => {
      if (o.kind !== 'loft') { base.window(s, face, o, y0, fr); return; }
      s.dressing(true, () => base.window(s, face, o, y0, fr));
      doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { leaf: shade(st.door, 0.85), frame: { bucket: 'stone', width: 0.2, out: 0.07 }, steps: null, leafKind: 'plank', transom: false }, y0 + o.y0);
    },
  });
  eaveCourse(sink, frame);
  // (dome-detail-275) the canal tiles in relief, the quoins, the string course at the loft floor
  canalTiles(sink, frame, look);
  const b = frame.bodies[0];
  quoinRun(sink, b, frame.floors[0], () => frame.eaveY - 0.16, look);
  sink.band('stone', b.x0 - 0.06, frame.floors[1] - 0.09, b.z0 - 0.06, b.x1 + 0.06, frame.floors[1] + 0.07, b.z1 + 0.06, { decor: true, shade: 1.05 });
  // the hoist beam over the loading door, its pulley block hanging from the end
  const f = frame.faces.front, top = frame.eaveY - 0.25;
  faceBox(sink, 'structureWood', f, 0, top, 0.55, 0.18, 0.2, 1.1, { colour: rgb(0x5a4632), decor: true, uv: UV_MEMBER });
  faceBox(sink, 'dark', f, 0, top - 0.32, 0.98, 0.12, 0.28, 0.1, { decor: true });
  // the block's strap up to the beam (the connectivity sweep: it hung 8 cm under the beam's end on nothing)
  faceBox(sink, 'dark', f, 0, top - 0.135, 0.98, 0.03, 0.1, 0.03, { decor: true });
  // the quay apron to the water with three bollards
  const qz0 = D / 2, qz1 = Math.max(qz0 + 1.6, Math.min(ctx.info.d / 2 - 0.2, D / 2 + 3.2));
  const ax = W / 2 + 1.2;
  sink.span('stone', -ax, -0.5, qz0, ax, 0.24, qz1);
  // (dome-detail-275) the apron's coping along the water: dressed blocks each its own length and tone, over the face
  for (let x = -ax; x < ax - 0.1;) {
    const l = Math.min(ax - x, 0.9 + look() * 0.8);
    sink.box('stone', [x + l / 2, 0.285, qz1 - 0.19], [l / 2 - 0.01, 0.05 + look() * 0.015, 0.23], { decor: true, shade: 0.94 + look() * 0.14 }, undefined, { ny: true });
    x += l;
  }
  // (dome-detail-275) the bollards turned, waisted under their heads
  for (const x of [-W / 2 - 0.5, 0, W / 2 + 0.5]) sink.revolve('stone', [x, 0.24, qz1 - 0.64], 'y', [[0, 0.2], [0.34, 0.15], [0.44, 0.21], [0.53, 0.19], [0.57, 0]], 8, { decor: true, shade: 0.92 });
  // (dome-detail-275) fish crates stacked at the apron's -x end, each its own wood and wear
  const crate = rgb(0x8a7356);
  for (let k = 0, n = 2 + Math.floor(look() * 2); k < n; k++) {
    const x = -ax + 0.45 + (k % 2) * 0.7, z = qz0 + 0.45 + Math.floor(k / 2) * 0.5;
    for (let h = 0, m = 1 + Math.floor(look() * 3); h < m; h++) {
      sink.box('structureWood', [x + (look() - 0.5) * 0.06, 0.24 + 0.13 + h * 0.26, z], [0.3, 0.13, 0.2], { colour: shade(crate, 0.75 + look() * 0.35), decor: true }, undefined, { ny: true });
    }
  }
  // (dome-detail-275) a net hung to dry over a rail on two posts at the apron's +x end
  const nx = ax - 0.55, nz0 = qz0 + 0.3, nz1 = Math.min(qz1 - 0.7, nz0 + 1.8), pole = rgb(0x6a5644), net = rgb(0x5e5a48);
  for (const z of [nz0, nz1]) sink.span('structureWood', nx - 0.05, 0.2, z - 0.05, nx + 0.05, 1.7, z + 0.05, { colour: pole, decor: true });
  sink.span('structureWood', nx - 0.04, 1.62, nz0 - 0.05, nx + 0.04, 1.7, nz1 + 0.05, { colour: pole, decor: true });
  for (const s of [-1, 1]) {
    const lean = Math.atan2(0.32, 1.1), ay: Vec3 = [-s * Math.sin(lean), Math.cos(lean), 0];
    sink.box('structureWood', [nx + s * 0.17, 1.1, (nz0 + nz1) / 2], [0.012, 0.57, (nz1 - nz0) / 2 - 0.08], { colour: shade(net, 0.85 + look() * 0.25), decor: true },
      new LocalFrame(cross3(ay, [0, 0, 1]), ay, [0, 0, 1], [0, 0, 0]));
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
  // (the connectivity sweep: the railing stood 3 cm over its slab and its side rails stopped 6 cm off the wall) the
  // balusters on the slab, the side rails to the wall with balusters of their own
  faceBox(sink, 'structureMetal', f, 0, y1 + 0.93, 0.86, 2.0, 0.05, 0.05, { colour: iron, decor: true });
  for (const u of [-1, 1]) faceBox(sink, 'structureMetal', f, u * 0.98, y1 + 0.93, 0.45, 0.05, 0.05, 0.9, { colour: iron, decor: true });
  for (let u = -0.95; u <= 0.96; u += 0.13) faceBox(sink, 'structureMetal', f, u, y1 + 0.455, 0.86, 0.025, 0.93, 0.025, { colour: iron, decor: true });
  for (const u of [-1, 1]) for (const o of [0.2, 0.42, 0.64]) faceBox(sink, 'structureMetal', f, u * 0.98, y1 + 0.455, o, 0.025, 0.93, 0.025, { colour: iron, decor: true });
  // (dome-detail-275, the roof sweep) the canal tiles in relief round the four slopes, as the fish store lays them
  canalTiles(sink, frame, ctx.variant);
  return sink.finish();
};

const DALMATIAN_BUILDERS: Readonly<Record<string, RegionalBuilder>> = Object.freeze({
  cottage: (ctx) => dwelling(ctx),
  tavern: (ctx) => dwelling(ctx, { storeys: 3, tavern: true }),
  cornershop: (ctx) => dwelling(ctx, { shop: true, render: true }),
  farmhouse, depot, granary, ruin,
  woodshed: kazun,
  boatshed: (ctx) => dalmatianBoathouse(ctx, { st: stateFor(ctx), dialect }),
  fishery: fishStore,
  marketRow: dalmatianLoggia,
  bathhouse: customsHouse,
  // the base market plot: the generic canvas stall becomes the fish market
  market: dalmatianRibarnica,
});

export const DALMATIAN_STYLE: ArchitectureStyle = Object.freeze<ArchitectureStyle>({
  id: 'dalmatian',
  region: 'Central Dalmatian coast (Brač, Šibenik hinterland): limestone villages under canal tiles',
  surfaces: {
    roof: { kind: 'canal', tint: [0.70, 0.42, 0.29] },
    // Brac stone: near-white dressed limestone (2026-10-03 w2 review; was [0.8, 0.75, 0.64])
    stone: { kind: 'limestone', tint: [0.83, 0.79, 0.70] },
    // (buildings-270: Saltwind reverted to its base look, Main 11-06, the round-4 pairs 1–6)
    sourced: { plaster: true, wood: true },
  },
  builders: DALMATIAN_BUILDERS,
  // sun-bleached limestone and render, canal tiles from fresh to grey-brown, a dry coast (1991–95 war damage)
  weather: {
    plaster: [[1, 1, 1], [1, 0.97, 0.92], [0.98, 0.95, 0.88], [1, 0.96, 0.94]],
    stone: [[1, 1, 1], [0.95, 0.94, 0.9], [1.03, 1.01, 0.96], [0.9, 0.89, 0.86]],
    roof: [[1, 1, 1], [0.9, 0.82, 0.74], [1.05, 0.95, 0.88], [0.84, 0.8, 0.76]],
    mossTint: [0.9, 0.88, 0.76],
  },
  // the yards: dry-stone walls round a kitchen garden and the stone hut (kazun), a gate (yards.ts)
  yard: { kinds: ['cottage', 'farmhouse'], fence: 'wallstone', gate: 'gatestone', shed: 'woodshed', shedSize: [3.8, 3.4], garden: true },
});
