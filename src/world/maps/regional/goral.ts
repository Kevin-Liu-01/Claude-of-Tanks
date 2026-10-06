// src/world/maps/regional/goral.ts — the goral kit (Frosthollow: the Podhale under the Tatra, the Biały Dunajec valley
// between Nowy Targ and Zakopane, January 1945; map-revival lane 2, 2026-10-05). The highlanders' timber: houses of
// hewn spruce logs laid on a high foundation of Tatra granite, the log ends crossing out at the corners, under steep
// roofs of spruce shingle (gont) with a small hip at the top of each gable (the naczółek) and wide eaves; the gable
// boarded in vertical planks round a carved sunburst (the słoneczko of the Zakopane style); small windows in white
// frames and carved surrounds, whitewashed stacks. The wooden church with its shingled nave, its tower clad in shingle
// and boarded belfry chamber under a bulb, the turret on the ridge; the hay barns (stodoły) with their wide doors;
// the sawmill's open shed and its board store; the shepherds' huts (bacówki) on the meadows; the houses burnt in the
// January fighting, their stacks standing in the snow.
import {
  PartSink, faceBox, facePoint, pick, rgb, shade,
  type Face, type Rgb, type Vec3,
} from './geometry.ts';
import {
  buildHouse, emitRoof, roofGeometry, storeyFaces, wallPolygon, windowRhythm,
  type HouseDialect, type HouseFrame, type Opening, type RoofSpec, type StoreySpec,
} from './house.ts';
import { doorUnit, gateUnit, windowUnit, type WindowStyle } from './openings.ts';
import { woodpile } from './dressing.ts';
import type { ArchitectureStyle, RegionalBuildContext, RegionalBuilder } from './types.ts';

const LOG = rgb(0x5a4330), LOG_DARK = rgb(0x3b2c20), PALE = rgb(0xc9ad7f), WHITE = rgb(0xe4e2dc), IRON = rgb(0x26282a);
const CHAR = rgb(0x2a2420), BELL = rgb(0x6a5a3a);
/** Window frames: white, the odd blue or green painted ones. */
const FRAMES: readonly Rgb[] = [WHITE, WHITE, rgb(0x4a6a8a), rgb(0x55704a)];

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
/**
 * Where the walls stand: the base geometry's measured box (ctx.bounds) less the kit's own overhang on its x and z sides
 * (the coordinator's rule, 2026-10-05: a kit building fills the base's bounds, so no gap opens between two buildings).
 */
function wallsIn(ctx: RegionalBuildContext, ex: number, ez: number): { cx: number; cz: number; w: number; d: number } {
  const b = ctx.bounds;
  return { cx: (b.minX + b.maxX) / 2, cz: (b.minZ + b.maxZ) / 2, w: b.maxX - b.minX - 2 * ex, d: b.maxZ - b.minZ - 2 * ez };
}
const uvOffset = (ctx: RegionalBuildContext): [number, number] => [ctx.rng() * 7.31, ctx.rng() * 5.17];

interface GoralState {
  rng: () => number;
  window: WindowStyle;
  door: Rgb;
  litShare: number;
  mobile: boolean;
}

function stateFor(ctx: RegionalBuildContext): GoralState {
  const rng = ctx.rng;
  const frame = pick(rng, FRAMES);
  return {
    rng, door: shade(LOG, 0.8 + rng() * 0.3),
    window: {
      frame, frameWidth: 0.06, frameOut: 0.04, bars: rng() < 0.75 ? 'six' : 'cross',
      // the carved surround in pale spruce against the dark logs
      surround: { bucket: 'structureWood', width: 0.11, out: 0.035, lintel: 0.2, colour: PALE },
      sill: { bucket: 'structureWood', out: 0.08, colour: PALE },
      shutters: null,
    },
    litShare: 0.45,
    mobile: ctx.tier === 'mobile',
  };
}

function dialect(st: GoralState): HouseDialect {
  return {
    window: (sink, face, o, y0) => windowUnit(sink, face, o.u, y0 + o.y0, o.w, o.h,
      o.kind === 'loft' ? { ...st.window, bars: 'none', surround: null } : st.window, st.rng, o.kind === 'loft' ? 0 : st.litShare),
    door: (sink, face, o, y0, frame) => {
      if (o.kind === 'gate') {
        gateUnit(sink, face, o.u, y0 + o.y0, o.w, o.h, shade(LOG, 0.85), { bucket: 'structureWood', width: 0.16, out: 0.05, colour: LOG_DARK });
        return;
      }
      doorUnit(sink, face, o.u, y0 + o.y0, o.w, o.h, {
        leaf: st.door, frame: { bucket: 'structureWood', width: 0.14, out: 0.05, colour: PALE, arch: false },
        steps: o.storey === 0 ? { bucket: 'stone' } : null, leafKind: 'plank', transom: false,
      }, frame.floors[o.storey] + o.y0);
    },
  };
}

/** The shingle roof: steep, a small hip at the top of each gable, wide eaves. */
/**
 * January's snow lying on a roof (round 2, gauntlet wave 110b: "the log houses are clean mid-brown with almost no snow
 * on the roofs"): a second covering over the shingles, the roof's own shape lifted onto their top, its edge showing at
 * the eaves and verges; at 45–55° the props' snow cap (slope-masked) left these roofs bare. Dressing, on a snowbound map.
 */
function roofSnow(sink: PartSink, frame: HouseFrame): void {
  const roof = frame.spec.roof;
  if (roof.kind === 'flat') return;
  // (round 3, gauntlet wave 128: "only a thin beige dusting ... a Podhale January would put a thick, overhanging snow
  // load on these steep roofs"): a third of a metre of snow, run out past the shingles' eaves and verges as a cornice;
  // its colour is the snow's own (the kit's plaster tone, below), not the slope mask's whitening, which a 45–55° roof
  // only half takes
  const snow: RoofSpec = { ...roof, bucket: 'plaster', thickness: 0.32, eave: roof.eave + 0.16, verge: roof.verge + 0.1, decor: true, ridge: null };
  const lift = roof.thickness / Math.cos(roof.pitchDeg * Math.PI / 180) + 0.012;
  emitRoof(sink, roofGeometry(frame.spec.w, frame.spec.d, frame.eaveY + lift, snow), snow);
}

const gont = (pitch: number, eave: number, verge: number, kind: RoofSpec['kind'] = 'halfhip'): RoofSpec =>
  ({ kind, pitchDeg: pitch, eave, verge: kind === 'hip' ? eave : verge, thickness: 0.14, bucket: 'roof', ridge: 'saddle', hipFrac: 0.3, hipPitchDeg: 60 });

/**
 * The log courses of the timber storeys: the joints between the logs as dark seams on every face (broken at the
 * openings), and the log ends crossing out at the four corners, the long and the short walls' logs alternating.
 */
function logWork(sink: PartSink, frame: HouseFrame, storeys: readonly number[], look: () => number, course = 0.27): void {
  for (const i of storeys) {
    const b = frame.bodies[i], faces = storeyFaces(frame, i);
    for (const name of ['front', 'right', 'back', 'left'] as const) {
      const face = faces[name];
      const holes = frame.spec.openings.filter((o) => o.face === name && o.storey === i)
        .map((o) => [o.u - o.w / 2 - 0.16, o.u + o.w / 2 + 0.16, b.y0 + o.y0 - 0.12, b.y0 + o.y0 + o.h + 0.22] as const);
      for (let y = b.y0 + course; y < b.y1 - 0.08; y += course) {
        let cur = -face.width / 2;
        const cuts = holes.filter(([, , y0, y1]) => y > y0 && y < y1).map(([a, c]) => [a, c] as const).sort((p, q) => p[0] - q[0]);
        for (const [a, c] of [...cuts, [face.width / 2, face.width / 2] as const]) {
          if (a - cur > 0.15) faceBox(sink, 'structureWood', face, (cur + a) / 2, y, 0.008, a - cur, 0.03, 0.016, { colour: LOG_DARK, decor: true, fine: true }, 'ends');
          cur = Math.max(cur, c);
        }
      }
    }
    // the crossing log ends: on each corner, a stub out of one wall then the other, course by course
    let k = 0;
    for (let y = b.y0 + course / 2; y < b.y1 - 0.05; y += course, k++) {
      const tone = shade(LOG_DARK, 0.9 + look() * 0.25);
      for (const [x, z] of [[b.x0, b.z0], [b.x1, b.z0], [b.x0, b.z1], [b.x1, b.z1]] as const) {
        const sx = Math.sign(x), sz = Math.sign(z), along = k % 2 === 0;
        const ox = along ? 0.32 : 0.14, oz = along ? 0.14 : 0.32;
        sink.span('structureWood', x - (sx < 0 ? ox : 0.02), y - course * 0.42, z - (sz < 0 ? oz : 0.02),
          x + (sx > 0 ? ox : 0.02), y + course * 0.42, z + (sz > 0 ? oz : 0.02), { colour: tone, decor: true, shadow: true });
      }
    }
  }
}

/**
 * The carved sunburst on a boarded gable (the Zakopane słoneczko): a half disc at the gable's foot and its rays fanning
 * up through the boards, pale against the weathered planks.
 */
function sunburst(sink: PartSink, face: Face, y: number, r: number, fine: boolean): void {
  const o = 0.03;
  sink.cylinder('structureWood', facePoint(face, 0, y, 0), face.out[0] !== 0 ? 'x' : 'z', 0.05, r * 0.32, 10,
    { colour: PALE, decor: true }, r * 0.32, true, 0, Math.PI);
  const n = 9;
  for (let k = 0; k < n; k++) {
    const a = Math.PI * (k + 0.5) / n;
    const tip = facePoint(face, Math.cos(a) * r, y + Math.sin(a) * r, o);
    const base = facePoint(face, Math.cos(a) * r * 0.36, y + Math.sin(a) * r * 0.36, o);
    sink.member('structureWood', base, tip, 0.08, 0.03, face.out, { colour: PALE, decor: true, ...(fine ? { fine: true } : {}) }, 0.005);
  }
}

/** The vertical boards of a gable: battens over the planks' joints, every 25 cm. */
function gableBoards(sink: PartSink, face: Face, frame: HouseFrame): void {
  const g = frame.roof.gable;
  if (!g) return;
  const eave = frame.eaveY, s = frame.roof.s, top = Math.max(...g.map(([, y]) => y));
  for (let u = -s + 0.2; u < s - 0.15; u += 0.25) {
    // the batten runs from the eave line to the gable's edge above it
    const h = g.length === 3 ? eave + (s - Math.abs(u)) * frame.roof.tanP : Math.min(top, eave + (s - Math.abs(u)) * frame.roof.tanP);
    if (h - eave < 0.25) continue;
    faceBox(sink, 'structureWood', face, u, (eave + h) / 2, 0.012, 0.05, h - eave - 0.08, 0.024, { colour: LOG_DARK, decor: true, fine: true }, 'caps');
  }
}

// ------------------------------------------------------------------------------------------------ the houses

/**
 * The chałupa: one log storey on a granite foundation, the gable to the street with its boards and sunburst, the
 * shingle roof with its little hips, the door and the small windows in carved surrounds, a whitewashed stack, a
 * woodpile; on the bigger plots, the attic under the roof lit by a gable window and a gallery across the gable.
 */
function chalupa(ctx: RegionalBuildContext, opts: { big?: boolean } = {}): ReturnType<RegionalBuilder> {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx);
  const rng = st.rng, look = ctx.variant;
  const fit = wallsIn(ctx, 0.5, 0.45);
  const W = clamp(fit.w, 4.6, opts.big ? 9.0 : 7.4), D = clamp(fit.d, 5.8, opts.big ? 11 : 10);
  sink.placed(0, fit.cx, 0, fit.cz, () => {
    const big = !!opts.big;
    const sts: StoreySpec[] = [{ h: 2.55, wall: 'wood' }];
    if (big) sts.push({ h: 2.3, wall: 'wood' });
    const openings: Opening[] = [
      { face: 'front', storey: 0, kind: 'door', u: (rng() < 0.5 ? -1 : 1) * W * 0.18, w: 0.95, y0: 0, h: 1.95 },
    ];
    for (const o of windowRhythm('front', 0, W, { w: 0.65, h: 0.8, sill: 0.95, spacing: 1.7, margin: 0.8, max: 2,
      avoid: [[openings[0].u - 0.6, openings[0].u + 0.6]] })) openings.push(o);
    for (const face of ['right', 'left'] as const) {
      for (const o of windowRhythm(face, 0, D, { w: 0.65, h: 0.8, sill: 0.95, spacing: 2.0, margin: 1.0, max: 3 })) if (rng() < 0.85) openings.push(o);
    }
    if (big) {
      openings.push({ face: 'front', storey: 1, kind: 'door', u: 0, w: 0.9, y0: 0, h: 1.95 });
      for (const face of ['right', 'left'] as const) for (const o of windowRhythm(face, 1, D, { w: 0.6, h: 0.75, sill: 0.8, spacing: 2.4, margin: 1.2, max: 3 })) openings.push(o);
    }
    const plinth = big ? 0.9 : 0.5;
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: plinth, out: 0.08, bucket: 'stone' }, storeys: sts,
      roof: gont(47 + rng() * 6, 0.5, 0.45), gableBucket: 'wood', openings,
      chimneys: [{ x: (rng() - 0.5) * W * 0.3, z: (rng() - 0.5) * D * 0.3, sx: 0.55, sz: 0.55, above: 0.7, bucket: 'plaster', cap: 'slab' }],
      gutters: null, verge: null, reveal: 0.22, spall: null,
    }, dialect(st));
    if (ctx.snowCap) roofSnow(sink, frame);
    logWork(sink, frame, big ? [0, 1] : [0], look);
    const f = frame.faces.front;
    if (!st.mobile) gableBoards(sink, f, frame);
    sunburst(sink, f, frame.eaveY + 0.12, Math.min(1.5, W * 0.22), st.mobile);
    if (big) {
      // the gallery across the gable at the attic floor
      const y = frame.floors[1], w = W - 0.6, depth = 0.8, c = { colour: shade(LOG, 1.1), decor: true } as const;
      faceBox(sink, 'structureWood', f, 0, y - 0.06, depth / 2, w, 0.12, depth, { ...c, shadow: true });
      faceBox(sink, 'structureWood', f, 0, y + 0.95, depth - 0.05, w, 0.08, 0.08, c);
      for (const s of [-1, 1]) faceBox(sink, 'structureWood', f, s * (w / 2 - 0.04), y + 0.5, depth - 0.05, 0.1, 1.0, 0.1, c);
      for (let k = 1; k < Math.round(w / 0.16); k++) faceBox(sink, 'structureWood', f, -w / 2 + k * 0.16, y + 0.5, depth - 0.05, 0.05, 0.86, 0.03, { ...c, fine: true }, 'caps');
    }
    if (!st.mobile) {
      const side = rng() < 0.5 ? frame.faces.right : frame.faces.left;
      woodpile(sink, side, -side.width / 2 + 0.5, side.width / 2 - 0.5, 1.2 + look() * 0.5, look);
    }
  });
  return sink.finish();
}

/**
 * The highlanders' villa (the Zakopane style: the lodge's plot): a high granite storey, two log storeys over it, a deep
 * shingle roof with little hips and a cross gable over the entrance, a veranda on carved posts along the front, the
 * gables boarded round their sunbursts.
 */
const willa: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx);
  const look = ctx.variant;
  const bb = ctx.bounds;
  const W = clamp(bb.maxX - bb.minX - 1.2, 9, 12.5), D = clamp(bb.maxZ - bb.minZ - 2.9, 11, 15);
  const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'door', u: 0, w: 1.4, y0: 0, h: 2.3 }];
  for (const i of [0, 1]) {
    for (const o of windowRhythm('front', i, W, { w: 0.85, h: 1.1, sill: 0.9, spacing: 1.9, margin: 1.0, avoid: i ? [] : [[-1.0, 1.0]] })) openings.push(o);
    for (const face of ['right', 'left'] as const) for (const o of windowRhythm(face, i, D, { w: 0.85, h: 1.1, sill: 0.9, spacing: 2.2, margin: 1.1 })) openings.push(o);
    for (const o of windowRhythm('back', i, W, { w: 0.8, h: 1.0, sill: 1.0, spacing: 2.4, margin: 1.2 })) openings.push(o);
  }
  const zc = bb.minZ + 0.8 + D / 2;
  sink.placed(0, (bb.minX + bb.maxX) / 2, 0, zc, () => {
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: 1.2, out: 0.1, bucket: 'stone' }, storeys: [{ h: 2.8, wall: 'wood' }, { h: 2.6, wall: 'wood' }],
      roof: gont(50, 0.6, 0.7), gableBucket: 'wood', openings, gutters: null, verge: null, reveal: 0.24, spall: null,
      chimneys: [{ x: -W * 0.2, z: -D * 0.2, sx: 0.65, sz: 0.65, above: 0.8, bucket: 'plaster', cap: 'slab' },
        { x: W * 0.2, z: D * 0.18, sx: 0.65, sz: 0.65, above: 0.8, bucket: 'plaster', cap: 'slab' }],
    }, dialect(st));
    if (ctx.snowCap) roofSnow(sink, frame);
    logWork(sink, frame, [0, 1], look);
    const f = frame.faces.front;
    if (!st.mobile) { gableBoards(sink, f, frame); gableBoards(sink, frame.faces.back, frame); }
    sunburst(sink, f, frame.eaveY + 0.15, 2.0, st.mobile);
    sunburst(sink, frame.faces.back, frame.eaveY + 0.15, 2.0, st.mobile);
    // the veranda along the front: a deck on the granite, carved posts, a rail, its lean-to of shingle
    const vd = 1.9, vy = 1.2, c = { colour: shade(LOG, 1.05) } as const;
    sink.span('stone', -W / 2 + 0.3, -0.3, D / 2, W / 2 - 0.3, vy, D / 2 + vd);
    for (let k = 0; k <= 4; k++) {
      const u = -W / 2 + 0.5 + k * (W - 1.0) / 4;
      if (Math.abs(u) < 0.9) continue;
      sink.span('structureWood', u - 0.12, vy, D / 2 + vd - 0.3, u + 0.12, vy + 2.6, D / 2 + vd - 0.06, c);
    }
    faceBox(sink, 'structureWood', f, 0, vy + 0.95, vd - 0.18, W - 0.8, 0.08, 0.08, { ...c, decor: true });
    for (let u = -W / 2 + 0.6; u < W / 2 - 0.5; u += 0.18) {
      if (Math.abs(u) < 0.8) continue;
      faceBox(sink, 'structureWood', f, u, vy + 0.5, vd - 0.18, 0.05, 0.85, 0.03, { ...c, decor: true, fine: true }, 'caps');
    }
    const lean: RoofSpec = { kind: 'shed', pitchDeg: 22, eave: 0.3, verge: 0.2, thickness: 0.12, bucket: 'roof' };
    sink.placed(-Math.PI / 2, 0, 0, D / 2 + vd / 2, () => emitRoof(sink, roofGeometry(vd, W - 0.4, vy + 2.6, lean), lean));
  });
  return sink.finish();
};

/**
 * The school (the szkoła ludowa of the 1930s): two log storeys on a granite base under a hipped shingle roof with its
 * little gables, rows of white-framed windows down the classroom sides, the entrance under a gabled porch.
 */
const szkola: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx);
  const look = ctx.variant;
  const bb = ctx.bounds;
  const W = clamp(bb.maxX - bb.minX - 1.4, 8, 10.5), D = clamp(bb.maxZ - bb.minZ - 2.1, 12, 16);
  const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'door', u: 0, w: 1.3, y0: 0, h: 2.3 }];
  for (const i of [0, 1]) {
    for (const face of ['right', 'left'] as const) for (const o of windowRhythm(face, i, D, { w: 1.0, h: 1.3, sill: 0.85, spacing: 1.9, margin: 1.1 })) openings.push(o);
    for (const o of windowRhythm('front', i, W, { w: 0.9, h: 1.2, sill: 0.9, spacing: 2.0, margin: 1.1, avoid: i ? [] : [[-1.0, 1.0]] })) openings.push(o);
    for (const o of windowRhythm('back', i, W, { w: 0.9, h: 1.2, sill: 0.9, spacing: 2.2, margin: 1.2 })) openings.push(o);
  }
  sink.placed(0, (bb.minX + bb.maxX) / 2, 0, bb.minZ + 0.6 + D / 2, () => {
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: 0.8, out: 0.08, bucket: 'stone' }, storeys: [{ h: 3.0, wall: 'wood' }, { h: 2.9, wall: 'wood' }],
      roof: gont(45, 0.7, 0.6, 'halfhip'), gableBucket: 'wood', openings, gutters: null, verge: null, reveal: 0.24, spall: null,
      chimneys: [{ x: 0, z: -D * 0.25, sx: 0.6, sz: 0.6, above: 0.8, bucket: 'plaster', cap: 'slab' }],
    }, dialect(st));
    if (ctx.snowCap) roofSnow(sink, frame);
    logWork(sink, frame, [0, 1], look);
    const f = frame.faces.front;
    if (!st.mobile) gableBoards(sink, f, frame);
    sunburst(sink, f, frame.eaveY + 0.15, 1.8, st.mobile);
    // the porch: two posts, a little gable of shingle over the door
    const pz = D / 2 + 1.3;
    for (const s of [-1, 1]) sink.span('structureWood', s * 1.0 - 0.1, 0.8, pz - 0.2, s * 1.0 + 0.1, 3.0, pz, { colour: LOG });
    sink.span('stone', -1.3, -0.3, D / 2, 1.3, 0.8, pz + 0.1);
    const porch: RoofSpec = { kind: 'gable', pitchDeg: 45, eave: 0.25, verge: 0.2, thickness: 0.1, bucket: 'roof', ridge: 'saddle' };
    sink.placed(0, 0, 0, D / 2 + 0.75, () => emitRoof(sink, roofGeometry(2.4, 1.5, 3.0, porch), porch));
  });
  return sink.finish();
};

/**
 * The wooden church (Dębno, Zakopane's old church): a log nave on a stone footing under a steep shingle roof, the walls
 * clad in shingle below the eaves, a turret on the ridge, the tower at the front with its battered shingled walls, the
 * boarded belfry chamber oversailing it and the bulb, the cross.
 */
const kosciol: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx);
  const bb = ctx.bounds;
  const W = clamp(bb.maxX - bb.minX - 1.1, 5.6, 7.6), tower = 3.2;
  const zFront = bb.maxZ - 0.1, tz = zFront - tower / 2;
  const nz1 = zFront - tower + 0.4, D = clamp(nz1 - (bb.minZ + 0.4), 6.0, 9.0);
  const openings: Opening[] = [];
  for (const face of ['right', 'left'] as const) for (const o of windowRhythm(face, 0, D, { w: 0.7, h: 1.4, sill: 1.6, spacing: 2.4, margin: 1.2, max: 3 })) openings.push(o);
  sink.placed(0, 0, 0, nz1 - D / 2, () => {
    const frame = buildHouse(sink, {
      // (round 2, wave 110b: the shingle-clad walls read as "a brick-textured church") the nave's hewn logs
      w: W, d: D, plinth: { h: 0.45, out: 0.08, bucket: 'stone' }, storeys: [{ h: 3.6, wall: 'wood' }],
      // (round 3, wave 128: the church's half-hip gable in shingle read as brick from the street) the gable boarded, as the
      // houses' are
      roof: gont(55, 0.55, 0.4, 'halfhip'), gableBucket: 'wood', openings, chimneys: [], gutters: null, verge: null, reveal: 0.3, spall: null,
    }, { ...dialect(st), window: (s, face, o, y0) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, {
      frame: WHITE, frameWidth: 0.05, frameOut: 0.03, bars: 'six', surround: { bucket: 'structureWood', width: 0.1, out: 0.04, colour: PALE },
      sill: { bucket: 'structureWood', out: 0.08, colour: PALE }, shutters: null,
    }, st.rng, 0.3) });
    if (ctx.snowCap) roofSnow(sink, frame);
    // the turret on the ridge: a little boarded lantern and its bulb
    const ry = frame.roof.ridgeY, tzz = -D * 0.15;
    sink.span('wood', -0.4, ry - 0.4, tzz - 0.4, 0.4, ry + 1.0, tzz + 0.4);
    sink.cylinder('roof', [0, ry + 1.0, tzz], 'y', 0.5, 0.55, 8, {}, 0.3);
    sink.cylinder('roof', [0, ry + 1.5, tzz], 'y', 0.5, 0.3, 8, {}, 0.05);
    sink.span('structureMetal', -0.025, ry + 1.95, tzz - 0.025, 0.025, ry + 2.6, tzz + 0.025, { colour: IRON, decor: true });
  });
  // the tower: battered shingled walls (a square frustum, closed), the boarded chamber, the bulb, the cross
  const h0 = 1.75, h1 = 1.35, shaft = 8.5;
  sink.span('stone', -h0 - 0.1, -0.4, tz - h0 - 0.1, h0 + 0.1, 0.45, tz + h0 + 0.1);
  sink.cylinder('wood', [0, 0.45, tz], 'y', shaft - 0.45, h0 * Math.SQRT2, 4, {}, h1 * Math.SQRT2, true, Math.PI / 4);
  // the door into the tower and the boarded chamber oversailing the shaft
  const tf: Face = { origin: [0, 0, tz + h0 - 0.06], u: [1, 0, 0], out: [0, 0, 1], width: 2 * h0 };
  doorUnit(sink, tf, 0, 0.45, 1.2, 2.3, { leaf: LOG_DARK, frame: { bucket: 'structureWood', width: 0.14, out: 0.06, colour: PALE }, steps: null, leafKind: 'plank' });
  const cw = h1 + 0.35, cy0 = shaft, cy1 = shaft + 2.4;
  sink.span('wood', -cw, cy0, tz - cw, cw, cy1, tz + cw);
  for (const [o, u] of [[[0, 0, tz + cw], [1, 0, 0]], [[0, 0, tz - cw], [-1, 0, 0]], [[cw, 0, tz], [0, 0, -1]], [[-cw, 0, tz], [0, 0, 1]]] as const) {
    const fc: Face = { origin: o as Vec3, u: u as Vec3, out: [Math.sign(o[0]), 0, o[0] === 0 ? Math.sign(o[2] - tz) : 0], width: 2 * cw };
    for (const s of [-0.55, 0.55]) faceBox(sink, 'dark', fc, s, cy0 + 1.35, 0.006, 0.45, 1.1, 0.01, { decor: true });
  }
  // the chamber's eaves and the bulb (frustum rings of shingle), its spike and cross
  const cap: RoofSpec = { kind: 'hip', pitchDeg: 30, eave: 0.4, verge: 0.4, thickness: 0.1, bucket: 'roof', ridge: null };
  sink.placed(0, 0, 0, tz, () => emitRoof(sink, roofGeometry(2 * cw, 2 * cw, cy1, cap), cap));
  let y = cy1 + cw * Math.tan(30 * Math.PI / 180) * 0.6;
  for (const [h, r0, r1] of [[0.4, 0.55, 0.85], [0.45, 0.85, 0.95], [0.45, 0.95, 0.7], [0.4, 0.7, 0.3], [0.5, 0.3, 0.08]] as const) {
    sink.cylinder('roof', [0, y, tz], 'y', h, r0, 10, {}, r1);
    y += h;
  }
  sink.span('structureMetal', -0.03, y - 0.05, tz - 0.03, 0.03, y + 1.0, tz + 0.03, { colour: IRON, decor: true });
  sink.span('structureMetal', -0.24, y + 0.65, tz - 0.03, 0.24, y + 0.71, tz + 0.03, { colour: IRON, decor: true });
  sink.cylinder('structureMetal', [0, cy0 + 0.6, tz], 'y', 0.7, 0.38, 8, { colour: BELL, decor: true }, 0.2);
  return sink.finish();
};

/** The hay barn (stodoła): plank walls on a stone footing, a steep shingle roof, the wide double doors in the long side. */
const stodola: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx);
  const fit = wallsIn(ctx, 0.42, 0.4);
  const W = clamp(fit.w, 6.5, 9.4), D = clamp(fit.d, 9, 14);
  sink.placed(0, fit.cx, 0, fit.cz, () => {
    const openings: Opening[] = [
      { face: 'front', storey: 0, kind: 'gate', u: 0, w: 2.8, y0: 0, h: 3.0 },
      { face: 'right', storey: 0, kind: 'gate', u: 0, w: 3.0, y0: 0, h: 3.0 },
    ];
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: 0.35, out: 0.05, bucket: 'stone' }, storeys: [{ h: 3.6, wall: 'wood' }],
      roof: gont(48, 0.5, 0.45, 'gable'), gableBucket: 'wood', openings, chimneys: [], gutters: null, verge: null, reveal: 0.12, spall: null,
    }, dialect({ ...st, litShare: 0 }));
    if (ctx.snowCap) roofSnow(sink, frame);
    // the boards' battens down every face, broken at the doors
    if (!st.mobile) {
      const faces = storeyFaces(frame, 0);
      for (const name of ['front', 'right', 'back', 'left'] as const) {
        const face = faces[name], gates = openings.filter((o) => o.face === name).map((o) => [o.u - o.w / 2 - 0.1, o.u + o.w / 2 + 0.1] as const);
        for (let u = -face.width / 2 + 0.25; u < face.width / 2 - 0.1; u += 0.3) {
          if (gates.some(([a, b]) => u > a && u < b)) continue;
          faceBox(sink, 'structureWood', face, u, frame.floors[0] + 1.8, 0.012, 0.06, 3.5, 0.024, { colour: LOG_DARK, decor: true, fine: true }, 'caps');
        }
      }
      gableBoards(sink, frame.faces.front, frame);
    }
  });
  return sink.finish();
};

/** The woodshed: posts under a shingle lean-to, boarded on three sides, the wood stacked in it (open to +x). */
const drewutnia: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const look = ctx.variant;
  // the walls fill the plot less the roof's own overhang: its eaves over the open side and the back, its verges
  // over the two ends (a yard shed keeps to its plot: props.ts builds it there only if it does)
  const fit = wallsIn(ctx, 0.25, 0.18);
  const W = Math.max(2.4, fit.w), D = Math.max(2.4, fit.d);
  const hLo = 2.2, pitch = 24, hHi = hLo + W * Math.tan(pitch * Math.PI / 180);
  sink.placed(0, fit.cx, 0, fit.cz, () => {
    sink.span('wood', -W / 2, -0.2, -D / 2, -W / 2 + 0.1, hHi, D / 2);
    for (const sz of [-1, 1]) {
      const end: Face = { origin: [0, 0, sz * D / 2], u: [sz, 0, 0], out: [0, 0, sz], width: W };
      wallPolygon(sink, 'wood', end, sz > 0 ? [[-W / 2, -0.2], [W / 2, -0.2], [W / 2, hLo], [-W / 2, hHi]] : [[-W / 2, -0.2], [W / 2, -0.2], [W / 2, hHi], [-W / 2, hLo]], 0.08);
    }
    for (const sz of [-1, 0, 1]) sink.span('structureWood', W / 2 - 0.15, -0.2, sz * (D / 2 - 0.1) - 0.08, W / 2, hLo, sz * (D / 2 - 0.1) + 0.08, { colour: LOG });
    const lean: RoofSpec = { kind: 'shed', pitchDeg: pitch, eave: 0.25, verge: 0.18, thickness: 0.12, bucket: 'roof' };
    emitRoof(sink, roofGeometry(W, D, hLo, lean), lean);
    if (ctx.tier !== 'mobile') {
      const back: Face = { origin: [-W / 2 + 0.1, 0, 0], u: [0, 0, -1], out: [1, 0, 0], width: D };
      woodpile(sink, back, -D / 2 + 0.2, D / 2 - 0.2, 1.5 + look() * 0.4, look);
    }
  });
  return sink.finish();
};

/**
 * The sawmill's shed (the depot's plot, its loading side to +x): the saw frame under a long shingle roof on posts,
 * the boarded back wall, the log deck and the sawn boards stacked along the open side.
 */
const tartak: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const look = ctx.variant;
  const bb = ctx.bounds;
  const W = clamp(bb.maxX - bb.minX - 1.2, 7, 10), D = clamp(bb.maxZ - bb.minZ - 1.0, 13, 21);
  const cx = bb.minX + 0.6 + W / 2;
  const H = 3.4;
  sink.placed(0, cx, 0, 0, () => {
    // the boarded back wall (-x) and two gable ends half boarded
    sink.span('wood', -W / 2, -0.2, -D / 2, -W / 2 + 0.12, H, D / 2);
    for (const sz of [-1, 1]) sink.span('wood', -W / 2, -0.2, sz * D / 2 - (sz > 0 ? 0.12 : 0), -W / 2 + W * 0.45, H, sz * D / 2 + (sz < 0 ? 0.12 : 0));
    // the posts along the open side and the middle
    for (let k = 0, n = Math.max(3, Math.round(D / 3.2)); k <= n; k++) {
      const z = -D / 2 + 0.15 + (D - 0.3) * k / n;
      sink.span('structureWood', W / 2 - 0.22, -0.2, z - 0.11, W / 2, H, z + 0.11, { colour: LOG });
    }
    const roof = gont(32, 0.6, 0.5, 'gable');
    emitRoof(sink, roofGeometry(W, D, H, roof), roof);
    // the saw frame (a heavy timber gate frame) on its bed, a log on the carriage
    sink.span('structureWood', -0.9, -0.2, -0.3, 0.9, 0.6, 0.3, { colour: LOG_DARK });
    for (const s of [-1, 1]) sink.span('structureWood', s * 0.75 - 0.12, 0.6, -0.15, s * 0.75 + 0.12, 2.8, 0.15, { colour: LOG_DARK, decor: true });
    sink.span('structureWood', -0.9, 2.7, -0.18, 0.9, 2.95, 0.18, { colour: LOG_DARK, decor: true });
    sink.cylinder('structureWood', [0, 0.95, -D * 0.35], 'z', D * 0.6, 0.32, 8, { colour: shade(LOG, 1.15), decor: true, shadow: true });
    if (ctx.tier !== 'mobile') {
      // the boards stacked in stickered piles along the open side
      for (const z of [-D * 0.3, D * 0.05, D * 0.32]) {
        for (let k = 0; k < 6; k++) {
          const y = 0.15 + k * 0.16;
          sink.span('structureWood', W / 2 + 0.4, y, z - 1.6, W / 2 + 1.5, y + 0.1, z + 1.6, { colour: shade(PALE, 0.85 + look() * 0.15), decor: true, shadow: true });
        }
      }
    }
  });
  return sink.finish();
};

/**
 * The sawmill's board store (the warehouse's plot): a long plank building under a shingle roof, wide doors in both
 * gables and the long side, the battens down its boards.
 */
const sklad: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx);
  const bb = ctx.bounds;
  const W = clamp(bb.maxX - bb.minX - 1.2, 11, 17), D = clamp(bb.maxZ - bb.minZ - 1.0, 18, 29);
  const openings: Opening[] = [
    { face: 'front', storey: 0, kind: 'gate', u: 0, w: 3.6, y0: 0, h: 3.6 },
    { face: 'back', storey: 0, kind: 'gate', u: 0, w: 3.6, y0: 0, h: 3.6 },
    { face: 'right', storey: 0, kind: 'gate', u: -D * 0.2, w: 3.2, y0: 0, h: 3.2 },
  ];
  for (const face of ['right', 'left'] as const) for (const o of windowRhythm(face, 0, D, { w: 0.8, h: 0.6, sill: 3.2, spacing: 3.0, margin: 1.5, kind: 'loft' })) {
    if (face === 'right' && Math.abs(o.u + D * 0.2) < 2.4) continue;
    openings.push(o);
  }
  sink.placed(0, (bb.minX + bb.maxX) / 2, 0, (bb.minZ + bb.maxZ) / 2, () => {
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: 0.3, out: 0.05, bucket: 'stone' }, storeys: [{ h: 4.6, wall: 'wood' }],
      roof: gont(40, 0.6, 0.5, 'gable'), gableBucket: 'wood', openings, chimneys: [], gutters: null, verge: null, reveal: 0.12, spall: null,
    }, dialect({ ...st, litShare: 0 }));
    if (ctx.snowCap) roofSnow(sink, frame);
    if (!st.mobile) {
      const faces = storeyFaces(frame, 0);
      for (const name of ['front', 'right', 'back', 'left'] as const) {
        const face = faces[name], gates = openings.filter((o) => o.face === name && o.kind === 'gate').map((o) => [o.u - o.w / 2 - 0.1, o.u + o.w / 2 + 0.1] as const);
        for (let u = -face.width / 2 + 0.3; u < face.width / 2 - 0.1; u += 0.4) {
          if (gates.some(([a, b]) => u > a && u < b)) continue;
          faceBox(sink, 'structureWood', face, u, frame.floors[0] + 2.3, 0.012, 0.06, 4.5, 0.024, { colour: LOG_DARK, decor: true, fine: true }, 'caps');
        }
      }
    }
  });
  return sink.finish();
};

/** A house burnt in January 1945: the granite foundation, charred log stubs, the whitewashed stack standing. */
const spalona: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const fit = wallsIn(ctx, 0.05, 0.05);
  const W = clamp(fit.w, 5.0, 7.6), D = clamp(fit.d, 6.0, 9.6);
  sink.placed(0, fit.cx, 0, fit.cz, () => {
    sink.span('stone', -W / 2, -0.3, -D / 2, W / 2, 0.55, D / 2);
    sink.span('plaster', -0.9, 0.55, -0.6, 0.5, 1.8, 0.8);
    sink.span('plaster', -0.4, 1.8, -0.15, 0.2, 5.6 + rng() * 0.8, 0.45);
    sink.span('stone', -0.5, 5.6, -0.25, 0.3, 5.75, 0.55);
    for (let k = 0; k < 10; k++) {
      const side = k % 4, t = rng(), h = 0.3 + rng() * 1.4;
      const x = side < 2 ? (side === 0 ? -1 : 1) * (W / 2 - 0.15) : (t - 0.5) * W * 0.8;
      const z = side < 2 ? (t - 0.5) * D * 0.8 : (side === 2 ? -1 : 1) * (D / 2 - 0.15);
      sink.span('structureWood', x - 0.14, 0.55, z - 0.14, x + 0.14, 0.55 + h, z + 0.14, { colour: CHAR });
    }
    for (let k = 0; k < 5; k++) {
      const a: Vec3 = [(rng() - 0.5) * W, 0.65, (rng() - 0.5) * D], b: Vec3 = [a[0] + (rng() - 0.5) * 3.5, 0.65 + rng() * 0.9, a[2] + (rng() - 0.5) * 3.5];
      sink.member('structureWood', a, b, 0.22, 0.22, [0, 1, 0], { colour: CHAR, decor: true, exposed: true });
    }
  });
  return sink.finish();
};

export const GORAL_BUILDERS: Readonly<Record<string, RegionalBuilder>> = Object.freeze({
  cottage: (ctx) => chalupa(ctx),
  logcabin: (ctx) => chalupa(ctx),
  alpine: (ctx) => chalupa(ctx, { big: true }),
  rangerlodge: willa,
  schoolhouse: szkola,
  onionchurch: kosciol,
  // the border's hamlets build their church from a kit's chapel (borderFarmsteads kitRoles): the wooden church, not the
  // generic stone nave and spire
  chapel: kosciol,
  barn: stodola,
  woodshed: drewutnia,
  depot: tartak,
  warehouse: sklad,
  ruin: spalona,
});

export const GORAL_STYLE: ArchitectureStyle = Object.freeze<ArchitectureStyle>({
  id: 'goral',
  region: 'Podhale under the Tatra (the Biały Dunajec valley, Nowy Targ to Zakopane), 1945: spruce log houses on granite under steep shingle',
  surfaces: {
    // spruce shingle (gont), weathered silver-brown
    roof: { kind: 'shingle', tint: [0.46, 0.41, 0.36] },
    // the Tatra granite of the foundations
    stone: { kind: 'granite', tint: [0.64, 0.62, 0.59] },
    sourced: { plaster: false, wood: true },
    tones: {
      // the stacks' whitewash
      // (round 3) and the snow on the roofs (roofSnow): the plaster bucket draws both, so its tone is the snowpack's
      // (the terrain's own: hue 0.575, saturation 0.03), not a cream
      plaster: (_h, _s, l) => [0.575, 0.03, Math.min(1, 0.6 + l * 0.3)],
      // the logs: hewn spruce darkened by the smoke and the weather, honey where it is newer
      // (round 2, wave 110b: "clean mid-brown") silvered and darkened by sixty winters, a few newer
      wood: (h, s, l) => [h, Math.min(1, s * 0.6), Math.min(1, l * 0.64)],
    },
  },
  builders: GORAL_BUILDERS,
  weather: {
    plaster: [[1, 1, 1], [0.98, 0.98, 0.99], [0.96, 0.97, 0.98], [1, 1, 1]],
    stone: [[1, 1, 1], [0.95, 0.94, 0.92], [1.03, 1.01, 0.98], [0.9, 0.9, 0.89]],
    roof: [[1, 1, 1], [0.86, 0.84, 0.82], [1.08, 1.04, 0.98], [0.78, 0.77, 0.76]],
    damp: 0.7, moss: 0.55, mossTint: [0.9, 0.95, 0.8],
  },
  wear: 0.3,
  // the yards: a fence of split spruce round the woodshed (no garden under the January snow)
  yard: { kinds: ['cottage', 'logcabin', 'alpine'], fence: 'fenceplank', gate: 'gate', shed: 'woodshed', shedSize: [3.6, 3.0], garden: false },
});
