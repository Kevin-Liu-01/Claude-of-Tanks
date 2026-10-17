// src/world/maps/regional/marketStalls.ts — the member-built market stall kit (props census #23, the looks lane
// 2026-10-15; WORKLIST.md "Markets & stalls": "one member-built stall kit replacing the four-post sheds ... dressed per
// region"). Three forms, dressed by the kit that calls them:
//   - openStall: a single stall on its plinth or deck — posts (lashed bamboo, sawn timber or chamfered concrete) under
//     plates and rafters, a sheet roof with its laps, a nipa thatch or a sagging canvas, a woven or boarded back, a
//     counter (a machan of bamboo or a plank counter on legs), a plank shutter propped up as an awning, the goods;
//   - boothRow: a row of open booths under one roof, each a frame of posts with boarded back and partitions, its counter,
//     its shelves of goods, its shutter propped over it, its signboard; a fascia and a gutter along the front;
//   - marketShed: a long open hall of posts, tie beams, king-post trusses and purlins under a sheet gable, its floor a
//     plinth with a kerb, the booths down both its sides.
// Each records its frame as an open frame (lattice.ts recordLattice) with its covering's heap as the crown, so a shot
// stall comes down as its posts and its roof (damage.ts describeLattice), not as the default kit's box spalls.
import { LocalFrame, PartSink, faceBox, shade, type EmitOptions, type Face, type RegionalBucket, type Rgb, type Vec3 } from './geometry.ts';
import { emitRoof, roofGeometry, type RoofGeometry, type RoofSpec } from './house.ts';
import { recordLattice } from './lattice.ts';
import { bevelMember, bevelSpan } from './millWorks.ts';

export type StallPost = 'bamboo' | 'timber' | 'concrete';
export type StallCover = 'sheet' | 'nipa' | 'canvas';

/** The goods a region's stalls carry. */
export interface StallGoods {
  /** heaps of produce (fruit, vegetables, spice): their colours */
  produce: readonly Rgb[];
  /** basket colours (willow, bamboo, plastic) */
  baskets: readonly Rgb[];
  /** sacks */
  sacks?: Rgb | null;
  /** Naga cone baskets (khang) leant on the counter */
  cones?: boolean;
  /** conical leaf hats (nón lá) hung on the posts */
  hats?: boolean;
  /** a bunch of bananas hung from the plate */
  bananas?: boolean;
  /** a beam scale on the counter */
  scale?: boolean;
}

export interface StallDress {
  post: StallPost;
  timber: Rgb;
  cover: StallCover;
  /** the covering's paint (a sheet's livery, a canvas's dye) */
  coverColour?: Rgb;
  /** the back screen: woven bamboo (darma, nipa), boards with their gaps, or sheet */
  back: 'woven' | 'boards' | 'sheet' | null;
  backColour: Rgb;
  /** the floor: an earthen plinth with its eroded lip and step, a plank deck on bearers and stilts, or concrete */
  floor: 'earth' | 'deck' | 'concrete';
  floorColour?: Rgb;
  counter: 'machan' | 'plank' | 'tiled';
  /** a plank shutter hinged at the head of the front and propped up as an awning */
  shutter?: Rgb | null;
  goods: StallGoods;
  mobile: boolean;
  look: () => number;
  /** the sawn timbers and boards with their arrises eased and the deck's planks laid with their joints sunk between them
   *  (the looks lane, 227; the r2 sweep: Kohima's booth row 94 % plain boxes) — the dress's choice, on every tier */
  eased?: boolean;
}

const LASH: Rgb = [0.42, 0.33, 0.2];
const ex = { decor: true, exposed: true } as const;

/** A box standing free (both faces drawn: a stall is seen from every side). */
function freeBox(sink: PartSink, bucket: RegionalBucket, c: Vec3, size: Vec3, opts: EmitOptions, ax: Vec3 = [1, 0, 0]): void {
  const az: Vec3 = [-ax[2], 0, ax[0]];
  sink.box(bucket, c, [size[0] / 2, size[1] / 2, size[2] / 2], { ...opts, uv: opts.uv ?? { kind: 'world' } }, new LocalFrame(ax, [0, 1, 0], az, [0, 0, 0]));
}

/** A board or a timber standing free, as freeBox lays it: under an eased dress its long arrises eased (a sawn board). */
function board(sink: PartSink, d: StallDress, bucket: RegionalBucket, c: Vec3, size: Vec3, opts: EmitOptions, ax: Vec3 = [1, 0, 0]): void {
  if (!d.eased) { freeBox(sink, bucket, c, size, opts, ax); return; }
  const az: Vec3 = [-ax[2], 0, ax[0]];
  bevelMember(sink, bucket, [c[0], c[1] - size[1] / 2, c[2]], [c[0], c[1] + size[1] / 2, c[2]], size[0], size[2], az, { ...opts, uv: opts.uv ?? { kind: 'world' } }, size[2] / 2);
}

/** An axis-aligned timber, plank or block (PartSink.span): under an eased dress its long arrises eased by `c`. */
function timber(sink: PartSink, d: StallDress, bucket: RegionalBucket, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, opts: EmitOptions, c = 0.012): void {
  if (d.eased) bevelSpan(sink, bucket, x0, y0, z0, x1, y1, z1, c, opts);
  else sink.span(bucket, x0, y0, z0, x1, y1, z1, opts);
}

/** A post from y0 to y1 at (x, z) in the dress's kind; its lashings or its chamfer. Structure. Returns its radius. */
function post(sink: PartSink, d: StallDress, x: number, z: number, y0: number, y1: number): number {
  if (d.post === 'bamboo') {
    sink.cylinder('structureWood', [x, y0, z], 'y', y1 - y0, 0.06, 7, { colour: shade(d.timber, 0.95 + d.look() * 0.15) }, 0.055);
    // the nodes' rings up the culm
    sink.dressing(d.mobile, () => {
      for (let y = y0 + 0.45; y < y1 - 0.2; y += 0.42) sink.cylinder('structureWood', [x, y, z], 'y', 0.03, 0.064, 7, { colour: shade(d.timber, 0.8), decor: true, fine: true }, 0.064);
    });
    return 0.06;
  }
  if (d.post === 'concrete') {
    sink.span('stone', x - 0.26, -0.4, z - 0.26, x + 0.26, y0 + 0.04, z + 0.26, { tint: [0.85, 0.84, 0.82] });
    sink.cylinder('plaster', [x, y0, z], 'y', y1 - y0, 0.16, 8, { tint: [0.86, 0.86, 0.84] }, 0.15, true, Math.PI / 8);
    return 0.16;
  }
  sink.cylinder('structureWood', [x, y0, z], 'y', y1 - y0, 0.075, 8, { colour: shade(d.timber, 0.92 + d.look() * 0.15) }, 0.07, true, Math.PI / 8);
  return 0.075;
}

/** A lashing round a joint at p (bamboo frames: a dark binding of rattan). Dressing. */
function lash(sink: PartSink, d: StallDress, p: Vec3): void {
  if (d.post !== 'bamboo' || d.mobile) return;
  sink.cylinder('structureWood', [p[0], p[1] - 0.05, p[2]], 'y', 0.1, 0.075, 6, { colour: LASH, decor: true, fine: true }, 0.075);
}

/**
 * A covering over a frame of span `w` (x) by `len` (z), its eaves at `eaveY`: a sheet (with its laps down the slopes), a
 * nipa thatch, or a canvas sagging between its ridge pole and its eaves. `shed` falls toward +z from `hi` to `eaveY`.
 * Returns the roof's geometry (the frame's rafters seat under it).
 */
function cover(sink: PartSink, d: StallDress, w: number, len: number, eaveY: number, opts: { shed?: { hi: number } } = {}): RoofGeometry {
  const pitch = d.cover === 'nipa' ? 30 : d.cover === 'canvas' ? 20 : 16;
  if (opts.shed) {
    const rise = opts.shed.hi - eaveY, deg = Math.atan2(rise, len) * 180 / Math.PI;
    const roof: RoofSpec = { kind: 'shed', pitchDeg: Math.max(4, deg), eave: 0.35, verge: 0.25, thickness: d.cover === 'nipa' ? 0.22 : 0.05,
      bucket: d.cover === 'nipa' ? 'straw' : 'structureMetal', ridge: null, ...(d.cover === 'nipa' ? { thatch: 'nipa' as const } : {}) };
    // (the shed rises toward its own -x: turned so it rises toward -z, the back)
    const rg = roofGeometry(len, w, eaveY, roof);
    sink.placed(-Math.PI / 2, 0, 0, 0, () => emitRoof(sink, rg, roof, d.cover === 'sheet' ? d.coverColour : undefined));
    if (d.cover === 'sheet') sink.dressing(d.mobile, () => {
      const t = Math.tan(roof.pitchDeg * Math.PI / 180);
      for (let x = -w / 2 - roof.verge + 0.45; x < w / 2 + roof.verge - 0.2; x += 0.9) {
        const za = len / 2 + roof.eave, zb = -len / 2 - 0.05, ya = eaveY + roof.thickness - roof.eave * t + 0.02, yb = eaveY + roof.thickness + (len / 2 - zb) * t + 0.02;
        const lap = { colour: shade(d.coverColour ?? [0.55, 0.55, 0.55], 0.82), decor: true };
        // (an eased lap's rounded edges are fine joinery: the long view reads the plain sheet)
        if (d.eased) bevelMember(sink, 'structureMetal', [x, ya, za], [x, yb, zb], 0.05, 0.025, [0, 1, 0], { ...lap, fine: true }, 0);
        else sink.member('structureMetal', [x, ya, za], [x, yb, zb], 0.05, 0.025, [0, 1, 0], lap, 0);
      }
    });
    return rg;
  }
  const roof: RoofSpec = d.cover === 'nipa'
    ? { kind: 'gable', pitchDeg: pitch, eave: 0.55, verge: 0.4, thickness: 0.24, bucket: 'straw', ridge: 'round', thatch: 'nipa' }
    : d.cover === 'canvas'
      ? { kind: 'gable', pitchDeg: pitch, eave: 0.25, verge: 0.2, thickness: 0.03, bucket: 'structureWood', ridge: null }
      : { kind: 'gable', pitchDeg: pitch, eave: 0.45, verge: 0.35, thickness: 0.05, bucket: 'structureMetal', ridge: 'saddle' };
  const rg = roofGeometry(w, len, eaveY, roof);
  if (d.cover === 'canvas') {
    // the canvas sagging between the ridge pole and the eaves, both its faces
    const c = d.coverColour ?? [0.78, 0.72, 0.6];
    for (const s of [-1, 1]) {
      const n = 4;
      for (let k = 0; k < n; k++) {
        const z0 = -len / 2 - roof.verge + (len + 2 * roof.verge) * k / n, z1 = -len / 2 - roof.verge + (len + 2 * roof.verge) * (k + 1) / n, zm = (z0 + z1) / 2;
        const top = (z: number): Vec3 => [0, rg.ridgeY, z], eave = (z: number): Vec3 => [s * (rg.s + roof.eave), eaveY - roof.eave * rg.tanP, z];
        const mid: Vec3 = [s * (rg.s + roof.eave) / 2, (rg.ridgeY + eaveY) / 2 - 0.12, zm];
        const tone = shade(c, 0.88 + d.look() * 0.18);
        const tris: Vec3[][] = [[top(z0), top(z1), mid], [top(z1), eave(z1), mid], [eave(z1), eave(z0), mid], [eave(z0), top(z0), mid]];
        for (const t of tris) {
          sink.polygon('structureWood', s > 0 ? t : [t[0], t[2], t[1]], { colour: tone, decor: true });
          sink.polygon('structureWood', s > 0 ? [t[0], t[2], t[1]] : t, { colour: shade(tone, 0.75), decor: true });
        }
      }
      // the scalloped valance along the eave
      for (let z = -len / 2 - roof.verge; z < len / 2 + roof.verge - 0.1; z += 0.4) {
        const e0: Vec3 = [s * (rg.s + roof.eave), eaveY - roof.eave * rg.tanP, z], e1: Vec3 = [e0[0], e0[1], z + 0.4], m: Vec3 = [e0[0], e0[1] - 0.22, z + 0.2];
        sink.polygon('structureWood', s > 0 ? [e0, m, e1] : [e0, e1, m], { colour: shade(c, 0.85), decor: true });
        sink.polygon('structureWood', s > 0 ? [e0, e1, m] : [e0, m, e1], { colour: shade(c, 0.7), decor: true });
      }
    }
    // (structure: the canvas carries no collision; the ridge pole and the frame are the stall's)
    sink.cylinder('structureWood', [0, rg.ridgeY - 0.05, -len / 2 - roof.verge], 'z', len + 2 * roof.verge, 0.045, 6, { colour: d.timber, decor: true });
    return rg;
  }
  emitRoof(sink, rg, roof, d.cover === 'sheet' ? d.coverColour : undefined);
  if (d.cover === 'sheet') sink.dressing(d.mobile, () => {
    // the sheets' laps down both slopes, a sheet's width apart
    for (const s of [-1, 1]) for (let z = -len / 2 - roof.verge + 0.45; z < len / 2 + roof.verge - 0.2; z += 0.9) {
      const a: Vec3 = [s * (rg.s + roof.eave), eaveY - roof.eave * rg.tanP + roof.thickness / Math.cos(Math.atan(rg.tanP)) + 0.015, z];
      const b: Vec3 = [s * 0.12, rg.ridgeY - 0.12 * rg.tanP + roof.thickness / Math.cos(Math.atan(rg.tanP)) + 0.015, z];
      sink.member('structureMetal', a, b, 0.05, 0.025, [-s * Math.sin(Math.atan(rg.tanP)), Math.cos(Math.atan(rg.tanP)), 0], { colour: shade(d.coverColour ?? [0.55, 0.55, 0.55], 0.82), decor: true }, 0);
    }
  });
  return rg;
}

/** The rafters and purlins under a gable covering (rg), every `step` along z. Dressing. */
function rafters(sink: PartSink, d: StallDress, rg: RoofGeometry, eave: number, len: number, step = 0.9): void {
  sink.dressing(d.mobile, () => {
    const under = (x: number) => rg.ridgeY - Math.abs(x) * rg.tanP - 0.04, c = { colour: shade(d.timber, 0.85), ...ex };
    for (let z = -len / 2; z <= len / 2 + 1e-6; z += len / Math.max(1, Math.round(len / step))) {
      for (const s of [-1, 1]) sink.member('structureWood', [s * (rg.s + eave * 0.85), under(rg.s + eave * 0.85) - 0.04, z], [0, under(0) - 0.04, z], 0.09, 0.07, [0, 0, 1], c, 0.035);
    }
    for (const s of [-1, 1]) {
      const x = s * rg.s * 0.5;
      sink.span('structureWood', x - 0.04, under(x) - 0.17, -len / 2 - 0.2, x + 0.04, under(x) - 0.09, len / 2 + 0.2, { colour: shade(d.timber, 0.8), decor: true });
    }
  });
}

/** A woven or boarded or sheet screen between (x0, z0) and (x1, z1) from y0 to y1, both faces. Structure. */
function screen(sink: PartSink, d: StallDress, x0: number, z0: number, x1: number, z1: number, y0: number, y1: number): void {
  const len = Math.hypot(x1 - x0, z1 - z0), ax: Vec3 = [(x1 - x0) / len, 0, (z1 - z0) / len];
  if (d.back === 'boards') {
    for (let t = 0.13; t < len - 0.1; t += 0.25) {
      board(sink, d, 'structureWood', [x0 + ax[0] * t, (y0 + y1) / 2, z0 + ax[2] * t], [0.225, y1 - y0, 0.025], { colour: shade(d.backColour, 0.84 + d.look() * 0.26) }, ax);
    }
    return;
  }
  const bucket: RegionalBucket = d.back === 'sheet' ? 'structureMetal' : 'structureWood';
  freeBox(sink, bucket, [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2], [len, y1 - y0, 0.03], { colour: shade(d.backColour, 0.9 + d.look() * 0.15) }, ax);
  // the weave's battens (woven) or the sheet's ribs: rails across it
  sink.dressing(d.mobile, () => {
    const n = d.back === 'woven' ? 3 : 2;
    for (let k = 0; k < n; k++) {
      const y = y0 + 0.12 + (y1 - y0 - 0.24) * k / Math.max(1, n - 1);
      freeBox(sink, 'structureWood', [(x0 + x1) / 2, y, (z0 + z1) / 2], [len, 0.05, 0.07], { colour: shade(d.timber, 0.8), decor: true }, ax);
    }
  });
}

/** Goods on a counter top at (x, y, z), `w` along x. Dressing. */
function goods(sink: PartSink, d: StallDress, x: number, y: number, z: number, w: number, deep: number): void {
  const g = d.goods, look = d.look;
  for (let k = 0, n = Math.max(2, Math.round(w / 0.42)); k < n; k++) {
    const gx = x - w / 2 + 0.2 + (w - 0.4) * k / Math.max(1, n - 1), gz = z + (look() - 0.5) * deep * 0.4;
    const r = look();
    if (r < 0.55 && g.produce.length) {
      const c = g.produce[Math.floor(look() * g.produce.length)];
      sink.cylinder('structureWood', [gx, y, gz], 'y', 0.11, 0.16, 7, { colour: shade(c, 0.85 + look() * 0.25), decor: true }, 0.06);
    } else if (r < 0.85 && g.baskets.length) {
      const c = g.baskets[Math.floor(look() * g.baskets.length)];
      sink.cylinder('structureWood', [gx, y, gz], 'y', 0.18, 0.17, 8, { colour: shade(c, 0.9 + look() * 0.15), decor: true }, 0.13, false);
      sink.cylinder('structureWood', [gx, y + 0.01, gz], 'y', 0.1, 0.14, 7, { colour: shade(g.produce[0] ?? c, 0.9), decor: true }, 0.08);
    } else if (g.sacks) {
      sink.cylinder('structureWood', [gx, y, gz], 'y', 0.36, 0.17, 7, { colour: shade(g.sacks, 0.9 + look() * 0.15), decor: true }, 0.12);
    }
  }
  if (g.scale) {
    const sx = x + w / 2 - 0.25;
    sink.span('structureMetal', sx - 0.02, y, z - 0.02, sx + 0.02, y + 0.42, z + 0.02, { colour: [0.2, 0.2, 0.2], decor: true });
    sink.span('structureMetal', sx - 0.22, y + 0.42, z - 0.015, sx + 0.22, y + 0.45, z + 0.015, { colour: [0.22, 0.21, 0.2], decor: true });
    for (const s of [-1, 1]) {
      // each pan hung by its cord from the beam's end
      sink.member('structureMetal', [sx + s * 0.2, y + 0.43, z], [sx + s * 0.2, y + 0.2, z], 0.008, 0.008, [1, 0, 0], { colour: [0.2, 0.2, 0.2], decor: true, exposed: true, fine: true }, 0);
      sink.cylinder('structureMetal', [sx + s * 0.2, y + 0.18, z], 'y', 0.03, 0.09, 8, { colour: [0.5, 0.4, 0.25], decor: true }, 0.07);
    }
  }
}

/** A counter across the front from x0 to x1 at z (its front), `deep` deep: its top, its legs; and the goods on it. */
function counter(sink: PartSink, d: StallDress, x0: number, x1: number, z: number, deep: number, floorY: number): void {
  const top = floorY + (d.counter === 'machan' ? 0.62 : 0.82), w = x1 - x0, cx = (x0 + x1) / 2, cz = z - deep / 2;
  if (d.counter === 'tiled') {
    // a block counter under white tiles, its top tiled (the plaster's render under a pale paint)
    sink.span('plaster', x0, floorY, z - deep, x1, top - 0.04, z, { tint: [0.92, 0.92, 0.9] });
    sink.span('plaster', x0 - 0.03, top - 0.04, z - deep - 0.03, x1 + 0.03, top, z + 0.03, { tint: [1.12, 1.12, 1.1] });
  } else {
    // the top: slats (machan) or a plank, on its legs and rails (structure: it is cover to a crouching man)
    timber(sink, d, 'structureWood', x0, top - 0.05, z - deep, x1, top, z, { colour: shade(d.timber, 1.15) });
    for (const lx of [x0 + 0.06, x1 - 0.06]) for (const lz of [z - deep + 0.06, z - 0.06]) {
      if (d.post === 'bamboo') sink.cylinder('structureWood', [lx, floorY, lz], 'y', top - 0.05 - floorY, 0.035, 6, { colour: d.timber });
      else timber(sink, d, 'structureWood', lx - 0.035, floorY, lz - 0.035, lx + 0.035, top - 0.05, lz + 0.035, { colour: shade(d.timber, 0.85) }, 0.01);
    }
    sink.dressing(d.mobile, () => {
      if (d.counter === 'machan') for (let x = x0 + 0.08; x < x1 - 0.05; x += 0.16) sink.span('structureWood', x - 0.04, top, z - deep, x + 0.04, top + 0.012, z, { colour: shade(d.timber, 1.05 + d.look() * 0.15), decor: true, fine: true });
      timber(sink, d, 'structureWood', x0, floorY + 0.15, z - 0.04, x1, floorY + 0.21, z, { colour: shade(d.timber, 0.8), decor: true }, 0.01);
    });
  }
  sink.dressing(d.mobile, () => goods(sink, d, cx, top, cz, w, deep));
}

/**
 * An eased dress's deck planks across (x0..x1) over z0..z1 on a deck whose top is at y: every plank's top a little
 * proud of the deck, the joint between two sunk in a V, the run's ends turned down to the deck — one welded run (the
 * plain deck's loose plank quads, a stream draw a plank as they drew). Dressing.
 */
function plankRun(sink: PartSink, d: StallDress, x0: number, x1: number, z0: number, z1: number, y: number): void {
  const planks: Array<[number, number, number]> = [];
  for (let x = x0 + 0.01; x < x1 - 0.1; x += 0.22) planks.push([x, Math.min(x + 0.2, x1 - 0.01), 0.95 + d.look() * 0.2]);
  if (!planks.length) return;
  const top = y + 0.012, bed = y + 0.003, foot = y + 0.002, base = d.floorColour ?? d.timber;
  // (fine joinery: the joints a long view cannot resolve, as the plain deck's plank lines were dressing)
  const tone = (k: number, dk = 1) => ({ colour: shade(base, k * dk), decor: true, fine: true });
  sink.quad('structureWood', [planks[0][0], foot, z0], [planks[0][0], foot, z1], [planks[0][0], top, z1], [planks[0][0], top, z0], tone(planks[0][2], 0.8));
  for (let i = 0; i < planks.length; i++) {
    const [a, b, k] = planks[i], next = planks[i + 1];
    sink.quad('structureWood', [a, top, z1], [b, top, z1], [b, top, z0], [a, top, z0], tone(k));
    if (next) {
      const m = (b + next[0]) / 2;
      sink.quad('structureWood', [b, top, z1], [m, bed, z1], [m, bed, z0], [b, top, z0], tone(k, 0.62));
      sink.quad('structureWood', [m, bed, z1], [next[0], top, z1], [next[0], top, z0], [m, bed, z0], tone(next[2], 0.62));
    } else sink.quad('structureWood', [b, foot, z1], [b, foot, z0], [b, top, z0], [b, top, z1], tone(k, 0.8));
  }
}

/** The floor of a stall or a row from (x0, z0) to (x1, z1), its top at y: an earthen plinth, a plank deck on stilts, or
 * a concrete slab with its kerb. Returns its top. Structure. */
function floorOf(sink: PartSink, d: StallDress, x0: number, z0: number, x1: number, z1: number, y: number): number {
  if (d.floor === 'deck') {
    // the deck on bearers and stilts over the mud, a step down at its front
    for (const x of [x0 + 0.12, (x0 + x1) / 2, x1 - 0.12]) for (const z of [z0 + 0.12, z1 - 0.12]) sink.cylinder('structureWood', [x, -0.4, z], 'y', y - 0.06 + 0.4, 0.06, 6, { colour: shade(d.timber, 0.8) });
    timber(sink, d, 'structureWood', x0, y - 0.1, z0, x1, y, z1, { colour: shade(d.floorColour ?? d.timber, 1.1) }, 0.02);
    sink.dressing(d.mobile, () => {
      if (d.eased) plankRun(sink, d, x0, x1, z0, z1, y);
      else for (let x = x0 + 0.01; x < x1 - 0.1; x += 0.22) sink.quad('structureWood', [x, y + 0.004, z1], [x + 0.2, y + 0.004, z1], [x + 0.2, y + 0.004, z0], [x, y + 0.004, z0], { colour: shade(d.floorColour ?? d.timber, 0.95 + d.look() * 0.2), decor: true });
      timber(sink, d, 'structureWood', (x0 + x1) / 2 - 0.5, y / 2 - 0.04, z1, (x0 + x1) / 2 + 0.5, y / 2, z1 + 0.32, { colour: shade(d.timber, 0.9), decor: true }, 0.01);
      for (const sx of [-1, 1]) timber(sink, d, 'structureWood', (x0 + x1) / 2 + sx * 0.48 - 0.03, -0.1, z1 + 0.25, (x0 + x1) / 2 + sx * 0.48 + 0.03, y / 2, z1 + 0.31, { colour: shade(d.timber, 0.8), decor: true }, 0.01);
    });
    return y;
  }
  if (d.floor === 'concrete') {
    sink.span('stone', x0 + 0.15, -0.3, z0 + 0.15, x1 - 0.15, y, z1 - 0.15, { tint: [0.82, 0.82, 0.8] });
    // the kerb round it, the drain channel along its front
    for (const [a, b, c, e] of [[x0, z0, x1, z0 + 0.15], [x0, z1 - 0.15, x1, z1], [x0, z0 + 0.15, x0 + 0.15, z1 - 0.15], [x1 - 0.15, z0 + 0.15, x1, z1 - 0.15]] as const) {
      sink.span('stone', a, -0.3, b, c, y + 0.06, e, { tint: [0.9, 0.9, 0.88] });
    }
    sink.dressing(d.mobile, () => sink.quad('dark', [x0 + 0.3, y + 0.004, z1 - 0.32], [x1 - 0.3, y + 0.004, z1 - 0.32], [x1 - 0.3, y + 0.004, z1 - 0.42], [x0 + 0.3, y + 0.004, z1 - 0.42], { decor: true }));
    return y;
  }
  // an earthen plinth, its lip worn round (a chamfered top course) and a step of packed earth to the front
  const ec = d.floorColour ?? [0.62, 0.5, 0.36];
  sink.span('plaster', x0 + 0.12, -0.3, z0 + 0.12, x1 - 0.12, y, z1 - 0.12, { tint: ec });
  sink.dressing(d.mobile, () => {
    const lip = (a: Vec3, b: Vec3, out: Vec3) => {
      const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
      const ax: Vec3 = [(b[0] - a[0]) / len, 0, (b[2] - a[2]) / len];
      for (let t = 0; t < len - 0.1; t += 0.7) {
        const l = Math.min(0.7, len - t), k = 0.9 + d.look() * 0.2, drop = 0.02 + d.look() * 0.06;
        const p: Vec3 = [a[0] + ax[0] * (t + l / 2) + out[0] * 0.06, y - 0.12 - drop / 2, a[2] + ax[2] * (t + l / 2) + out[2] * 0.06];
        freeBox(sink, 'plaster', p, [l + 0.02, 0.24 - drop, 0.14], { decor: true, tint: [ec[0] * k, ec[1] * k, ec[2] * k] }, ax);
      }
    };
    lip([x0 + 0.12, 0, z1 - 0.12], [x1 - 0.12, 0, z1 - 0.12], [0, 0, 1]);
    lip([x1 - 0.12, 0, z0 + 0.12], [x0 + 0.12, 0, z0 + 0.12], [0, 0, -1]);
    sink.span('plaster', (x0 + x1) / 2 - 0.6, -0.3, z1 - 0.12, (x0 + x1) / 2 + 0.6, y * 0.5, z1 + 0.3, { tint: [ec[0] * 0.92, ec[1] * 0.92, ec[2] * 0.92], decor: true });
  });
  return y;
}

/** A plank shutter hinged at the head of a front from x0 to x1 at z, propped up as an awning on two sticks. Dressing. */
function shutterAwning(sink: PartSink, d: StallDress, x0: number, x1: number, z: number, y: number, footY: number): void {
  if (!d.shutter) return;
  const c = d.shutter, len = 0.95, swing = 1.45;
  sink.dressing(d.mobile, () => {
    const a: Vec3 = [x0, y, z], b: Vec3 = [x1, y, z], tip: Vec3 = [0, y + Math.sin(swing - Math.PI / 2) * len, z + Math.cos(swing - Math.PI / 2) * len];
    // the leaf: its boards across, two faces
    const n = Math.max(3, Math.round((x1 - x0) / 0.22));
    for (let k = 0; k < n; k++) {
      const xa = x0 + (x1 - x0) * k / n + 0.006, xb = x0 + (x1 - x0) * (k + 1) / n - 0.006, tone = shade(c, 0.86 + d.look() * 0.24);
      const p = [[xa, a[1], a[2]], [xb, b[1], b[2]], [xb, tip[1], tip[2]], [xa, tip[1], tip[2]]] as Vec3[];
      sink.quad('structureWood', p[3], p[2], p[1], p[0], { colour: tone, decor: true });
      const dn = (v: Vec3): Vec3 => [v[0], v[1] - 0.012, v[2]];
      sink.quad('structureWood', dn(p[0]), dn(p[1]), dn(p[2]), dn(p[3]), { colour: shade(tone, 0.75), decor: true });
    }
    // the props from the counter's front edge up under the leaf's lip
    for (const sx of [x0 + 0.15, x1 - 0.15]) sink.member('structureWood', [sx, footY, z - 0.15], [sx, tip[1] - 0.012, tip[2] - 0.04], 0.035, 0.035, [1, 0, 0], { colour: shade(c, 0.7), ...ex, fine: true }, 0);
  });
}

/**
 * A single open stall `W` across (x) by `D` deep (z), its front to +z, centred on the frame's origin: its floor, its four
 * posts (and a back pair taller for a shed roof), the plates, the covering on its rafters, the back screen, the counter
 * with its goods across the front, the propped shutter, the hats and the bananas.
 */
export function openStall(sink: PartSink, d: StallDress, W: number, D: number, opts: { shedRoof?: boolean; floorY?: number } = {}): void {
  const fy = opts.floorY ?? (d.floor === 'deck' ? 0.45 : d.floor === 'concrete' ? 0.12 : 0.3);
  const y = floorOf(sink, d, -W / 2, -D / 2, W / 2, D / 2, fy);
  const px = W / 2 - 0.2, pz = D / 2 - 0.2, front = y + 2.3, backH = opts.shedRoof ? y + 2.8 : front;
  const legs: Array<{ foot: Vec3; head: Vec3 }> = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const h = sz > 0 ? front : backH;
    post(sink, d, sx * px, sz * pz, y, h + 0.12);
    legs.push({ foot: [sx * px, y, sz * pz], head: [sx * px, h, sz * pz] });
  }
  // the plates round the head, lashed at the posts
  for (const sz of [-1, 1]) {
    const h = sz > 0 ? front : backH;
    timber(sink, d, 'structureWood', -px - 0.1, h, sz * pz - 0.05, px + 0.1, h + 0.1, sz * pz + 0.05, { colour: shade(d.timber, 0.9) });
    for (const sx of [-1, 1]) lash(sink, d, [sx * px, h + 0.05, sz * pz]);
  }
  for (const sx of [-1, 1]) sink.member('structureWood', [sx * px, front + 0.05, pz], [sx * px, backH + 0.05, -pz], 0.08, 0.08, [1, 0, 0], { colour: shade(d.timber, 0.85), ...ex }, 0.04);
  let crownTop = front + 1;
  if (opts.shedRoof) {
    cover(sink, d, 2 * px + 0.2, 2 * pz, front + 0.1, { shed: { hi: backH + 0.1 } });
    crownTop = backH + 0.4;
  } else {
    sink.placed(Math.PI / 2, 0, 0, 0, () => {
      const rg = cover(sink, d, 2 * pz + 0.1, 2 * px + 0.2, front + 0.1);
      rafters(sink, d, rg, 0.4, 2 * px + 0.2);
      crownTop = rg.ridgeTopY;
      // (Lane C 2026-10-16, building-integrity: the sky showed through both open gables, 2 m2 from the side) the gable
      // triangles closed over the end plates, a woven screen under a thatch or canvas, a sheet under a sheet roof
      if (rg.gable) {
        const sheet = d.cover === 'sheet';
        const opts = { colour: sheet ? shade(d.coverColour ?? [0.55, 0.55, 0.55], 0.9) : shade(d.backColour ?? d.timber, 0.92) };
        for (const end of [1, -1]) {
          sink.prism(sheet ? 'structureMetal' : 'structureWood', rg.gable.map(([u, yy]): Vec3 => [u, yy, end > 0 ? rg.halfD - 0.03 : -rg.halfD]), [0, 0, 1], 0.03, opts);
        }
      }
    });
  }
  if (d.back) screen(sink, d, -px + 0.05, -pz, px - 0.05, -pz, y - 0.005, backH + 0.005);
  counter(sink, d, -px + 0.1, px - 0.1, pz - 0.05, 0.6, y);
  shutterAwning(sink, d, -px, px, pz + 0.07, front, y + (d.counter === 'machan' ? 0.62 : 0.82));
  sink.dressing(d.mobile, () => {
    if (d.goods.hats) for (const [sx, k] of [[-1, 0], [-1, 1], [1, 0]] as const) {
      const hy = front - 0.35 - k * 0.42;
      // (Lane C 2026-10-16, building-integrity: a negative length turned the left-hand hats inside out) each run from its
      // inboard end outward along +x, the crown's radii swapped on the left
      if (sx > 0) {
        sink.cylinder('straw', [px + 0.07, hy, pz], 'x', 0.02, 0.2, 9, { decor: true }, 0.2);
        sink.cylinder('straw', [px + 0.09, hy, pz], 'x', 0.12, 0.2, 9, { decor: true }, 0.01);
      } else {
        sink.cylinder('straw', [-(px + 0.09), hy, pz], 'x', 0.02, 0.2, 9, { decor: true }, 0.2);
        sink.cylinder('straw', [-(px + 0.21), hy, pz], 'x', 0.12, 0.01, 9, { decor: true }, 0.2);
      }
    }
    if (d.goods.bananas) {
      for (const x of [-px * 0.5, px * 0.4]) {
        sink.member('structureWood', [x, front, pz - 0.05], [x, front - 0.35, pz - 0.05], 0.015, 0.015, [1, 0, 0], { colour: LASH, ...ex, fine: true }, 0);
        sink.cylinder('structureWood', [x, front - 0.75, pz - 0.05], 'y', 0.42, 0.11, 7, { colour: [0.72, 0.68, 0.22], decor: true }, 0.16);
      }
    }
    if (d.goods.cones) for (const sx of [-1, 1]) {
      // the Naga cone basket (khang) stood on its point against the counter's end
      const cx = sx * (px - 0.05), cz = pz + 0.25;
      sink.cylinder('structureWood', [cx, y, cz], 'y', 0.7, 0.04, 8, { colour: [0.6, 0.48, 0.3], decor: true }, 0.26);
    }
  });
  // (Lane C 2026-10-16, building-integrity: the sky showed through the open ends over the counter, 2.53 m2 seen from the
  // quarter) a Kohima stall's ends boarded as its back is: a rail between each end's posts at the counter's height, the
  // boards nailed to it from there up under the shed's rafter (each board's head on the rafter's line), the end open
  // below the rail as the counter's legs are
  if (opts.shedRoof) {
    const yr = y + (d.counter === 'machan' ? 0.62 : 0.82), z0 = -pz + 0.075, z1 = pz - 0.075;
    const under = (z: number) => front + 0.05 + (backH - front) * (pz - z) / (2 * pz);
    const n = Math.max(2, Math.round((z1 - z0) / 0.25)), pitch = (z1 - z0) / n;
    for (const sx of [-1, 1]) {
      const x = sx * px, xi = x - sx * 0.0125;
      timber(sink, d, 'structureWood', Math.min(xi, xi - sx * 0.06), yr - 0.08, -pz, Math.max(xi, xi - sx * 0.06), yr, pz, { colour: shade(d.timber, 0.85) }, 0.01);
      for (let k = 0; k < n; k++) {
        const zc = z0 + pitch * (k + 0.5), top = under(zc), bot = yr - 0.08;
        board(sink, d, 'structureWood', [x, (bot + top) / 2, zc], [pitch - 0.02, top - bot, 0.025], { colour: shade(d.backColour ?? d.timber, 0.84 + d.look() * 0.26) }, [0, 0, 1]);
      }
    }
  }
  recordLattice(sink, legs, [front], 0.12, 'structureWood', d.timber, {
    x0: -0.9, x1: 0.9, y0: front, y1: Math.min(crownTop, front + 1.6), z0: -0.9, z1: 0.9, bucket: d.cover === 'nipa' ? 'straw' : 'structureMetal', tint: d.coverColour ?? [0.6, 0.52, 0.36],
  });
}

/**
 * A row of `n` open booths along x, `L` long by `D` deep, their fronts to +z under one roof: the floor; the posts at
 * every booth's corners; the boarded back and the partitions; each booth's counter, its shelves of goods on the back,
 * its shutter propped over the front, its signboard; the covering on its rafters with a fascia and a gutter.
 */
export function boothRow(sink: PartSink, d: StallDress, L: number, D: number, n: number, signs: readonly Rgb[], opts: { floorY?: number } = {}): void {
  const fy = opts.floorY ?? (d.floor === 'deck' ? 0.45 : d.floor === 'concrete' ? 0.12 : 0.35);
  const y = floorOf(sink, d, -L / 2, -D / 2, L / 2, D / 2, fy);
  const pz = D / 2 - 0.15, front = y + 2.4, backH = y + 2.95, bw = (L - 0.3) / n;
  const xs = Array.from({ length: n + 1 }, (_, k) => -L / 2 + 0.15 + bw * k);
  const legs: Array<{ foot: Vec3; head: Vec3 }> = [];
  for (const x of xs) {
    post(sink, d, x, pz, y, front + 0.1);
    post(sink, d, x, -pz, y, backH + 0.1);
    legs.push({ foot: [x, y, pz], head: [x, front, pz] }, { foot: [x, y, -pz], head: [x, backH, -pz] });
    sink.member('structureWood', [x, front + 0.05, pz], [x, backH + 0.05, -pz], 0.08, 0.1, [1, 0, 0], { colour: shade(d.timber, 0.85), ...ex }, 0.05);
  }
  timber(sink, d, 'structureWood', xs[0] - 0.1, front, pz - 0.06, xs[n] + 0.1, front + 0.12, pz + 0.06, { colour: shade(d.timber, 0.9) });
  timber(sink, d, 'structureWood', xs[0] - 0.1, backH, -pz - 0.06, xs[n] + 0.1, backH + 0.12, -pz + 0.06, { colour: shade(d.timber, 0.9) });
  cover(sink, d, L + 0.1, 2 * pz, front + 0.12, { shed: { hi: backH + 0.12 } });
  // the back, the partitions between the booths, the shelves on the back
  screen(sink, d, xs[0], -pz + 0.04, xs[n], -pz + 0.04, y - 0.005, backH + 0.005);
  for (const x of xs) screen(sink, d, x, -pz + 0.06, x, pz - 0.7, y - 0.005, front + 0.005);
  for (let k = 0; k < n; k++) {
    const x0 = xs[k] + 0.08, x1 = xs[k + 1] - 0.08, cx = (x0 + x1) / 2;
    counter(sink, d, x0 + 0.05, x1 - 0.05, pz - 0.05, 0.55, y);
    shutterAwning(sink, d, x0, x1, pz + 0.07, front, y + (d.counter === 'machan' ? 0.62 : 0.82));
    sink.dressing(d.mobile, () => {
      for (const sy of [y + 0.95, y + 1.55]) {
        timber(sink, d, 'structureWood', x0, sy - 0.03, -pz + 0.07, x1, sy, -pz + 0.42, { colour: shade(d.timber, 1.05), decor: true }, 0.008);
        goods(sink, d, cx, sy, -pz + 0.25, x1 - x0, 0.3);
      }
      // the signboard over the booth's front, its lettering a pale band
      // (the board stands on the plate over the front, its lettering on its face)
      const sc = signs[k % Math.max(1, signs.length)] ?? d.timber;
      const f: Face = { origin: [cx, 0, pz + 0.1], u: [1, 0, 0], out: [0, 0, 1], width: x1 - x0 };
      board(sink, d, 'structureWood', [cx, front + 0.27, pz], [(x1 - x0) * 0.8, 0.3, 0.03], { colour: sc, decor: true });
      faceBox(sink, 'structureWood', f, 0, front + 0.27, -0.08, (x1 - x0) * 0.55, 0.09, 0.01, { colour: [0.86, 0.82, 0.7], decor: true, fine: true });
    });
  }
  // the fascia along the front's eave and the gutter under it
  sink.dressing(d.mobile, () => {
    board(sink, d, 'structureWood', [0, front + 0.05, pz + 0.4], [L + 0.2, 0.16, 0.03], { colour: shade(d.timber, 0.8), decor: true });
    sink.span('structureMetal', -L / 2 - 0.1, front - 0.12, pz + 0.42, L / 2 + 0.1, front - 0.02, pz + 0.52, { colour: [0.4, 0.4, 0.38], decor: true });
  });
  recordLattice(sink, legs, [front], 0.12, 'structureWood', d.timber, {
    x0: -1.1, x1: 1.1, y0: front, y1: front + 1.5, z0: -1.0, z1: 1.0, bucket: d.cover === 'nipa' ? 'straw' : 'structureMetal', tint: d.coverColour ?? [0.6, 0.52, 0.36],
  });
}

/**
 * A long open market shed `W` across (x) by `L` long (z), centred on the frame's origin: its floor, its posts down both
 * sides every bay, the tie beams with their king posts and struts, the purlins, the sheet gable over them with its ridge
 * cap and laps, gutters and downpipes on a concrete hall, hanging bulbs; the booths down both long sides under it.
 */
export function marketShed(sink: PartSink, d: StallDress, W: number, L: number, opts: { floorY?: number; booths?: boolean } = {}): void {
  const fy = opts.floorY ?? (d.floor === 'concrete' ? 0.15 : 0.3);
  const y = floorOf(sink, d, -W / 2, -L / 2, W / 2, L / 2, fy);
  const px = W / 2 - 0.35, bays = Math.max(2, Math.round((L - 0.7) / 3.2)), plate = y + 3.0;
  const zs = Array.from({ length: bays + 1 }, (_, k) => -L / 2 + 0.35 + (L - 0.7) * k / bays);
  const legs: Array<{ foot: Vec3; head: Vec3 }> = [];
  for (const sx of [-1, 1]) for (const z of zs) {
    post(sink, d, sx * px, z, y, plate + 0.1);
    legs.push({ foot: [sx * px, y, z], head: [sx * px, plate, z] });
  }
  for (const sx of [-1, 1]) sink.span('structureWood', sx * px - 0.1, plate, zs[0] - 0.2, sx * px + 0.1, plate + 0.16, zs[bays] + 0.2, { colour: shade(d.timber, 0.9) });
  const eaveY = plate + 0.16;
  const rg = cover(sink, d, 2 * px + 0.2, L - 0.3, eaveY);
  const under = (x: number) => rg.ridgeY - Math.abs(x) * rg.tanP - 0.05;
  sink.dressing(d.mobile, () => {
    const t = { colour: shade(d.timber, 0.82), ...ex };
    for (const z of zs) {
      sink.span('structureWood', -px - 0.15, plate + 0.16, z - 0.07, px + 0.15, plate + 0.3, z + 0.07, { colour: shade(d.timber, 0.85), decor: true });
      for (const s of [-1, 1]) {
        sink.member('structureWood', [s * (px + 0.05), plate + 0.3, z], [0, under(0) - 0.08, z], 0.13, 0.1, [0, 0, 1], t, 0.05);
        sink.member('structureWood', [s * 0.06, plate + 0.55, z], [s * px * 0.5, under(px * 0.5) - 0.1, z], 0.08, 0.08, [0, 0, 1], t, 0.04);
        sink.member('structureWood', [s * px, plate - 0.7, z], [s * (px - 0.7), plate + 0.17, z], 0.08, 0.08, [0, 0, 1], t, 0.04);
        lash(sink, d, [s * px, plate + 0.05, z]);
      }
      sink.member('structureWood', [0, plate + 0.3, z], [0, under(0) - 0.05, z], 0.12, 0.1, [0, 0, 1], t, 0.05);
      // a bulb on its flex from the tie beam
      sink.member('structureMetal', [0.4, plate + 0.16, z], [0.4, plate - 0.5, z], 0.01, 0.01, [1, 0, 0], { colour: [0.1, 0.1, 0.1], ...ex, fine: true }, 0);
      sink.cylinder('glass', [0.4, plate - 0.62, z], 'y', 0.12, 0.05, 6, { decor: true }, 0.03);
    }
    for (const s of [-1, 1]) for (const f of [0.3, 0.7]) {
      const x = s * px * (1 - f);
      sink.span('structureWood', x - 0.05, under(x) - 0.15, -L / 2 + 0.05, x + 0.05, under(x) - 0.05, L / 2 - 0.05, { colour: shade(d.timber, 0.8), decor: true });
    }
    if (d.post === 'concrete') for (const s of [-1, 1]) {
      // the gutters along the eaves, the downpipes at the ends
      // (the gutter hung under the eave's edge, its top against the sheet; the downpipes from it to the ground)
      const gx = s * (rg.s + 0.38), gt = eaveY - 0.38 * rg.tanP;
      sink.span('structureMetal', gx - 0.07, gt - 0.1, -L / 2 + 0.1, gx + 0.07, gt, L / 2 - 0.1, { colour: [0.5, 0.52, 0.52], decor: true });
      for (const sz of [-1, 1]) sink.cylinder('structureMetal', [gx, -0.05, sz * (L / 2 - 0.25)], 'y', gt - 0.05, 0.045, 6, { colour: [0.5, 0.52, 0.52], decor: true });
    }
  });
  // the booths down both sides: a counter in every bay with its goods, the shutters propped
  if (opts.booths !== false) {
    for (const sx of [-1, 1]) for (let k = 0; k < bays; k++) {
      const za = zs[k] + 0.25, zb = zs[k + 1] - 0.25, x = sx * (px - 0.7);
      sink.placed(sx > 0 ? -Math.PI / 2 : Math.PI / 2, x, 0, (za + zb) / 2, () => {
        counter(sink, d, -(zb - za) / 2, (zb - za) / 2, 0.3, 0.6, y);
      });
    }
  }
  recordLattice(sink, legs, [plate], 0.18, 'structureWood', d.timber, {
    x0: -1.3, x1: 1.3, y0: eaveY, y1: eaveY + 2.4, z0: -1.3, z1: 1.3, bucket: d.cover === 'nipa' ? 'straw' : 'structureMetal', tint: d.coverColour ?? [0.6, 0.52, 0.36],
  });
}
