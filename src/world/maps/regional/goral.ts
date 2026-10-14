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
  PartSink, faceBox, facePoint, hashSeed, pick, rgb, shade, streamFrom,
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

/**
 * The snow load on a roof emitted on its own (round 4, wave 190: the woodsheds' and the sawmill's roofs read from the
 * air as "dark untextured rectangles" beside the houses' white ones): the same cornice of snow as roofSnow's, on the
 * roof's own geometry.
 */
function roofSnowOn(sink: PartSink, w: number, d: number, eaveY: number, roof: RoofSpec): void {
  const snow: RoofSpec = { ...roof, bucket: 'plaster', thickness: 0.26, eave: roof.eave + 0.12, verge: roof.verge + 0.08, decor: true, ridge: null };
  const lift = roof.thickness / Math.cos(roof.pitchDeg * Math.PI / 180) + 0.012;
  emitRoof(sink, roofGeometry(w, d, eaveY + lift, snow), snow);
}

const gont = (pitch: number, eave: number, verge: number, kind: RoofSpec['kind'] = 'halfhip'): RoofSpec =>
  ({ kind, pitchDeg: pitch, eave, verge: kind === 'hip' ? eave : verge, thickness: 0.14, bucket: 'roof', ridge: 'saddle', hipFrac: 0.3, hipPitchDeg: 60 });

/**
 * The hewn logs (the props census, 2026-10-14; the judges: "real log courses — each course its own hewn or round log,
 * with saddle-notched ends and openings cut through the courses"; the seams painted on a flat wall read as boards).
 * Each course is its own spruce log, hewn flat on its face and standing LOG_PROUD out of the wall plane, its arrises
 * chamfered off top and bottom so the groove between two logs reads as the logs' own; the gable walls' logs lie half a
 * log above or below the eave walls' (the saddle notch: each log sits in the one crossing under it), so at every corner
 * the logs of both walls run on past the corner, LOG_END and a little, a comb of log ends with their pale end grain.
 * The openings are cut through the courses: a log runs to the unit's surround or frame (unitOutline) and stops there
 * on its sawn end. Every log is a decor part (the storey body under it keeps the collision); the ends cast.
 */
const LOG_PROUD = 0.045, LOG_ARRIS = 0.04, LOG_DEPTH = 0.2, LOG_END = 0.3;
/** the logs' face, spruce silvered and smoked by the winters (the kit's wood tone, l x 0.64, s x 0.6), and its end grain */
const LOG_AGED = rgb(0x544538), END_GRAIN = rgb(0x8a7556);

/** What a unit covers of its wall round the opening (its surround or frame and its sill): the logs stop there. */
interface UnitOutline { side: number; below: number; above: number }
function unitOutline(o: Opening, win: WindowStyle): UnitOutline {
  if (o.state) return { side: 0, below: 0, above: 0 };
  if (o.kind === 'door') return { side: 0.14, below: 0, above: 0.14 };
  if (o.kind === 'gate') return { side: 0.16, below: 0, above: 0.16 };
  const s = o.kind === 'loft' ? null : win.surround;
  return { side: s ? s.width : 0, below: win.sill ? 0.09 : 0, above: s ? s.lintel ?? s.width : 0 };
}

/**
 * One length of hewn log on a face: from u0 to u1 along it, yb to yt up it, `depth` back from the wall plane to LOG_PROUD
 * out of it. A chamfered edge (`chamB`, `chamT`) is the log's own arris; a flat one is sawn (a half log, a cut over an
 * opening). Its ends are capped where `capL` / `capR`; `inner` draws the back face (a log end past the corner).
 */
function hewnLog(sink: PartSink, face: Face, u0: number, u1: number, yb: number, yt: number,
  shape: { chamB: boolean; chamT: boolean; capL: boolean; capR: boolean; depth: number; inner: boolean; under?: boolean;
    hideB?: boolean; hideT?: boolean },
  tone: Rgb, opts: { shadow?: boolean; mobile: boolean }): void {
  if (u1 - u0 < 0.02 || yt - yb < 0.02) return;
  const P = LOG_PROUD, d = -shape.depth;
  const a = Math.min(LOG_ARRIS, (yt - yb) * 0.3);
  const cb = shape.chamB && !opts.mobile ? a : 0, ct = shape.chamT && !opts.mobile ? a : 0;
  const base = { decor: true, ...(opts.shadow ? { shadow: true } : {}) } as const;
  const at = (u: number, y: number, o: number): Vec3 => facePoint(face, u, y, o);
  // the grain runs along the log (the timber tile's grain runs along v)
  const uv = { kind: 'plane' as const, origin: facePoint(face, 0, 0, 0), u: [0, 1, 0] as Vec3, v: face.u };
  const q = (p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3, colour: Rgb): void => sink.quad('structureWood', p0, p1, p2, p3, { ...base, colour, uv });
  // the hewn face, its arrises (the lower one in the groove's shade) or a sawn edge; a phone draws the face alone where
  // the next log lies against it, and nothing draws an edge that sits on the plinth or under the eaves (hideB / hideT)
  q(at(u0, yb + cb, P), at(u1, yb + cb, P), at(u1, yt - ct, P), at(u0, yt - ct, P), tone);
  if (cb) q(at(u0, yb, 0), at(u1, yb, 0), at(u1, yb + cb, P), at(u0, yb + cb, P), shade(tone, 0.62));
  else if (!shape.chamB && !shape.hideB) q(at(u0, yb, d), at(u1, yb, d), at(u1, yb, P), at(u0, yb, P), shade(tone, 0.7));
  if (ct) q(at(u0, yt - ct, P), at(u1, yt - ct, P), at(u1, yt, 0), at(u0, yt, 0), shade(tone, 1.08));
  else if (!shape.chamT && !shape.hideT) q(at(u0, yt, P), at(u1, yt, P), at(u1, yt, d), at(u0, yt, d), shade(tone, 1.05));
  // a log end past the corner: its back face, and its underside where nothing lies under it
  if (shape.inner) {
    q(at(u1, yb, d), at(u0, yb, d), at(u0, yt, d), at(u1, yt, d), shade(tone, 0.8));
    if (shape.under && shape.chamB) q(at(u0, yb, d), at(u1, yb, d), at(u1, yb, cb ? 0 : P), at(u0, yb, cb ? 0 : P), shade(tone, 0.55));
  }
  // the sawn ends: the log's section, its end grain paler than its weathered face
  const section = (u: number): Vec3[] => {
    const pts: Vec3[] = [at(u, yb, d)];
    if (cb && d < 0) pts.push(at(u, yb, 0));
    pts.push(at(u, yb + cb, P), at(u, yt - ct, P));
    if (ct && d < 0) pts.push(at(u, yt, 0));
    pts.push(at(u, yt, d));
    return pts;
  };
  const grain = { ...base, colour: shade(END_GRAIN, 0.8 + 0.4 * (tone[0] / LOG_AGED[0] - 0.8)) };
  if (shape.capL) sink.polygon('structureWood', section(u0), grain);
  if (shape.capR) sink.polygon('structureWood', section(u1).reverse(), grain);
}

/** Subtract `cuts` (y ranges) from [y0, y1]: the free ranges left, each at least `min` tall. */
function freeRanges(y0: number, y1: number, cuts: ReadonlyArray<readonly [number, number]>, min = 0.04): Array<[number, number]> {
  let out: Array<[number, number]> = [[y0, y1]];
  for (const [c0, c1] of cuts) {
    const next: Array<[number, number]> = [];
    for (const [a, b] of out) {
      if (c1 <= a || c0 >= b) { next.push([a, b]); continue; }
      if (c0 > a) next.push([a, c0]);
      if (c1 < b) next.push([c1, b]);
    }
    out = next;
  }
  return out.filter(([a, b]) => b - a >= min);
}

/**
 * The log walls of the timber storeys (the props census, 2026-10-14): every face of the listed storeys laid in hewn
 * logs, course by course (hewnLog), cut at the openings' units, the logs of both walls running out past every corner.
 * `look` keeps the old seams' draws (one a course a storey): those draws are the courses' tones, so what the builder
 * draws after the walls keeps its look.
 */
function logWork(sink: PartSink, frame: HouseFrame, storeys: readonly number[], look: () => number, win: WindowStyle,
  mobile: boolean, course = 0.27): void {
  const tones: number[] = [];
  for (const i of storeys) {
    const b = frame.bodies[i];
    for (let y = b.y0 + course / 2; y < b.y1 - 0.05; y += course) tones.push(look());
  }
  if (!tones.length) return;
  const jitter = streamFrom(hashSeed('goral:logs', ...tones.slice(0, 4).map((t) => Math.floor(t * 1e6))));
  // the storeys a log wall runs through unbroken: contiguous bodies of one footprint
  const groups: number[][] = [];
  for (const i of [...storeys].sort((p, q) => p - q)) {
    const g = groups[groups.length - 1], prev = g ? frame.bodies[g[g.length - 1]] : null, b = frame.bodies[i];
    if (prev && Math.abs(prev.y1 - b.y0) < 1e-4 && Math.abs(prev.x0 - b.x0) < 1e-4 && Math.abs(prev.x1 - b.x1) < 1e-4
      && Math.abs(prev.z0 - b.z0) < 1e-4 && Math.abs(prev.z1 - b.z1) < 1e-4) g.push(i);
    else groups.push([i]);
  }
  let t = 0;
  for (const g of groups) {
    const Y0 = frame.bodies[g[0]].y0, Y1 = frame.bodies[g[g.length - 1]].y1;
    const n = Math.max(2, Math.round((Y1 - Y0) / course)), c = (Y1 - Y0) / n;
    const faces = storeyFaces(frame, g[0]);
    for (const name of ['front', 'right', 'back', 'left'] as const) {
      const face = faces[name], W = face.width;
      // the eave walls' logs lie half a log off the gable walls' (each wall's logs sit in the notches of the other's)
      const lift = name === 'right' || name === 'left' ? c / 2 : 0;
      const rects = frame.spec.openings.filter((o) => o.face === name && g.includes(o.storey)).map((o) => {
        const m = unitOutline(o, win), oy = frame.bodies[o.storey].y0 + o.y0;
        return { u0: o.u - o.w / 2 - m.side, u1: o.u + o.w / 2 + m.side, y0: oy - m.below, y1: oy + o.h + m.above };
      });
      for (let k = 0; k <= n; k++) {
        const raw0 = Y0 - lift + k * c, raw1 = raw0 + c;
        const yb = Math.max(Y0, raw0), yt = Math.min(Y1, raw1);
        if (yt - yb < 0.03) continue;
        const natB = raw0 >= Y0 - 1e-6, natT = raw1 <= Y1 + 1e-6;
        const tone = shade(LOG_AGED, 0.82 + tones[t++ % tones.length] * 0.32);
        // the face cut where the units stand: breakpoints at the cuts' sides, each span's free heights
        const hit = rects.filter((r) => r.y0 < yt - 1e-3 && r.y1 > yb + 1e-3);
        const cutsU = [...new Set([-W / 2, W / 2, ...hit.flatMap((r) => [r.u0, r.u1]).map((u) => clamp(u, -W / 2, W / 2))])].sort((p, q) => p - q);
        const spans: Array<{ u0: number; u1: number; free: Array<[number, number]> }> = [];
        for (let s = 0; s + 1 < cutsU.length; s++) {
          const u0 = cutsU[s], u1 = cutsU[s + 1];
          if (u1 - u0 < 1e-4) continue;
          const um = (u0 + u1) / 2;
          const free = freeRanges(yb, yt, hit.filter((r) => um > r.u0 && um < r.u1).map((r) => [r.y0, r.y1] as const));
          const last = spans[spans.length - 1];
          if (last && JSON.stringify(last.free) === JSON.stringify(free)) last.u1 = u1;
          else spans.push({ u0, u1, free });
        }
        const covers = (span: { free: Array<[number, number]> } | undefined, a: number, b: number): boolean =>
          !!span && span.free.some(([p, q]) => p <= a + 1e-4 && q >= b - 1e-4);
        spans.forEach((span, s) => {
          for (const [a, b] of span.free) {
            const atL = span.u0 <= -W / 2 + 1e-4, atR = span.u1 >= W / 2 - 1e-4;
            hewnLog(sink, face, span.u0, span.u1, a, b, {
              chamB: natB && a <= yb + 1e-4, chamT: natT && b >= yt - 1e-4,
              capL: !atL && !covers(spans[s - 1], a, b), capR: !atR && !covers(spans[s + 1], a, b),
              depth: 0, inner: false, hideB: a <= Y0 + 1e-4, hideT: b >= Y1 - 1e-4,
            }, tone, { mobile });
            // the log runs on past the corner (only a whole course: a log cut short by a unit at the corner stops)
            if (a > yb + 1e-4 || b < yt - 1e-4) continue;
            for (const [end, sign] of [[atL, -1], [atR, 1]] as const) {
              if (!end) continue;
              const reach = LOG_END + (jitter() - 0.5) * 0.07;
              const from = sign * W / 2, to = from + sign * reach;
              hewnLog(sink, face, Math.min(from, to), Math.max(from, to), a, b, {
                chamB: natB, chamT: natT, capL: sign < 0, capR: sign > 0, depth: LOG_DEPTH, inner: true, under: yb <= Y0 + 1e-4,
                hideT: yt >= Y1 - 1e-4,
              }, tone, { shadow: true, mobile });
            }
          }
        });
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
    // (round 4, wave 190: "village houses are 1-1.5 storeys"): the bigger house's upper floor a half storey, its log
    // knee wall under the steep roof (was a full 2.3 m storey)
    if (big) sts.push({ h: 1.3, wall: 'wood' });
    const openings: Opening[] = [
      { face: 'front', storey: 0, kind: 'door', u: (rng() < 0.5 ? -1 : 1) * W * 0.18, w: 0.95, y0: 0, h: 1.95 },
    ];
    for (const o of windowRhythm('front', 0, W, { w: 0.65, h: 0.8, sill: 0.95, spacing: 1.7, margin: 0.8, max: 2,
      avoid: [[openings[0].u - 0.6, openings[0].u + 0.6]] })) openings.push(o);
    for (const face of ['right', 'left'] as const) {
      for (const o of windowRhythm(face, 0, D, { w: 0.65, h: 0.8, sill: 0.95, spacing: 2.0, margin: 1.0, max: 3 })) if (rng() < 0.85) openings.push({ ...o, u: o.u + (look() - 0.5) * 0.4 });
    }
    if (big) {
      openings.push({ face: 'front', storey: 1, kind: 'door', u: 0, w: 0.8, y0: 0, h: 1.2 });
      for (const face of ['right', 'left'] as const) for (const o of windowRhythm(face, 1, D, { w: 0.5, h: 0.55, sill: 0.35, spacing: 3.0, margin: 1.6, max: 2 })) openings.push(o);
    }
    const plinth = big ? 0.6 : 0.5;
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: plinth, out: 0.08, bucket: 'stone' }, storeys: sts,
      roof: gont(47 + rng() * 6, 0.5, 0.45), gableBucket: 'wood', openings,
      chimneys: [{ x: (rng() - 0.5) * W * 0.3, z: (rng() - 0.5) * D * 0.3, sx: 0.55, sz: 0.55, above: 0.7, bucket: 'plaster', cap: 'slab' }],
      gutters: null, verge: null, reveal: 0.22, spall: null,
    }, dialect(st));
    if (ctx.snowCap) roofSnow(sink, frame);
    logWork(sink, frame, big ? [0, 1] : [0], look, st.window, st.mobile);
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
 * The big farmhouse of the lodge's plot (round 4, wave 190: the highlanders' villa — a high granite storey and two log
 * storeys under rows of regular windows — read as "a three-storey log house with a perfectly regular window grid ... an
 * alpine hotel"; the village's houses are one and a half storeys with small, irregular windows): one log storey on a
 * low granite footing under a deep, steep shingle roof with little hips, its attic lit by small gable windows; the
 * windows small and set as the rooms need them (a few left out, each shifted and at its own height); the veranda on
 * carved posts along the front, the gables boarded round their sunbursts.
 */
const willa: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx);
  const look = ctx.variant;
  const bb = ctx.bounds;
  const W = clamp(bb.maxX - bb.minX - 1.2, 9, 12.5), D = clamp(bb.maxZ - bb.minZ - 2.9, 11, 15);
  const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'door', u: 0, w: 1.3, y0: 0, h: 2.1 }];
  // the small windows, irregular: a fifth left out, each shifted along the wall and set at its own height
  const irregular = (list: Opening[]) => {
    for (const o of list) {
      const keep = look(), du = (look() - 0.5) * 0.5, dy = (look() - 0.5) * 0.18;
      if (keep < 0.2) continue;
      openings.push({ ...o, u: o.u + du, y0: o.y0 + dy });
    }
  };
  irregular(windowRhythm('front', 0, W, { w: 0.65, h: 0.8, sill: 0.95, spacing: 1.8, margin: 1.0, avoid: [[-1.3, 1.3]] }));
  for (const face of ['right', 'left'] as const) irregular(windowRhythm(face, 0, D, { w: 0.65, h: 0.8, sill: 0.95, spacing: 2.1, margin: 1.2 }));
  irregular(windowRhythm('back', 0, W, { w: 0.6, h: 0.75, sill: 1.0, spacing: 2.4, margin: 1.3 }));
  const zc = bb.minZ + 0.8 + D / 2;
  sink.placed(0, (bb.minX + bb.maxX) / 2, 0, zc, () => {
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: 0.6, out: 0.1, bucket: 'stone' }, storeys: [{ h: 2.7, wall: 'wood' }],
      roof: gont(54, 0.65, 0.7), gableBucket: 'wood', openings, gutters: null, verge: null, reveal: 0.24, spall: null,
      chimneys: [{ x: -W * 0.2, z: -D * 0.2, sx: 0.65, sz: 0.65, above: 0.8, bucket: 'plaster', cap: 'slab' },
        { x: W * 0.2, z: D * 0.18, sx: 0.65, sz: 0.65, above: 0.8, bucket: 'plaster', cap: 'slab' }],
    }, dialect(st));
    if (ctx.snowCap) roofSnow(sink, frame);
    logWork(sink, frame, [0], look, st.window, st.mobile);
    const f = frame.faces.front;
    if (!st.mobile) { gableBoards(sink, f, frame); gableBoards(sink, frame.faces.back, frame); }
    sunburst(sink, f, frame.eaveY + 2.2, 1.6, st.mobile);
    sunburst(sink, frame.faces.back, frame.eaveY + 2.2, 1.6, st.mobile);
    // the attic's small gable windows, white-framed, proud of the boards
    for (const face of [f, frame.faces.back]) for (const u of [-0.9, 0.9]) {
      faceBox(sink, 'structureWood', face, u, frame.eaveY + 0.95, 0.05, 0.7, 0.85, 0.04, { colour: PALE, decor: true });
      faceBox(sink, 'dark', face, u, frame.eaveY + 0.95, 0.075, 0.52, 0.66, 0.01, { decor: true });
    }
    // the granite terrace before the door (the steep roof's deep eave over it; the villa's veranda and its lean-to went
    // with the second storey), its rail of split posts
    const vd = 1.9, vy = 0.6, c = { colour: shade(LOG, 1.05) } as const;
    sink.span('stone', -W / 2 + 0.3, -0.3, D / 2, W / 2 - 0.3, vy, D / 2 + vd);
    faceBox(sink, 'structureWood', f, 0, vy + 0.75, vd - 0.18, W - 0.8, 0.08, 0.08, { ...c, decor: true });
    for (let u = -W / 2 + 0.6; u < W / 2 - 0.5; u += 0.9) {
      if (Math.abs(u) < 0.8) continue;
      faceBox(sink, 'structureWood', f, u, vy + 0.4, vd - 0.18, 0.1, 0.8, 0.1, { ...c, decor: true });
    }
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
    logWork(sink, frame, [0, 1], look, st.window, st.mobile);
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
  const naveWindow: WindowStyle = {
    frame: WHITE, frameWidth: 0.05, frameOut: 0.03, bars: 'six', surround: { bucket: 'structureWood', width: 0.1, out: 0.04, colour: PALE },
    sill: { bucket: 'structureWood', out: 0.08, colour: PALE }, shutters: null,
  };
  sink.placed(0, 0, 0, nz1 - D / 2, () => {
    const frame = buildHouse(sink, {
      // (round 2, wave 110b: the shingle-clad walls read as "a brick-textured church") the nave's hewn logs
      w: W, d: D, plinth: { h: 0.45, out: 0.08, bucket: 'stone' }, storeys: [{ h: 3.6, wall: 'wood' }],
      // (round 3, wave 128: the church's half-hip gable in shingle read as brick from the street) the gable boarded, as the
      // houses' are
      roof: gont(55, 0.55, 0.4, 'halfhip'), gableBucket: 'wood', openings, chimneys: [], gutters: null, verge: null, reveal: 0.3, spall: null,
    }, { ...dialect(st), window: (s, face, o, y0) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, naveWindow, st.rng, 0.3) });
    if (ctx.snowCap) roofSnow(sink, frame);
    // (round 4, wave 190: the church's walls "a staggered brown block texture that reads as brickwork"): the nave's hewn
    // logs laid as the houses' are, a little heavier, their ends crossing out at the corners
    logWork(sink, frame, [0], ctx.variant, naveWindow, st.mobile, 0.3);
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
  // (round 4, wave 190: the tower's walls read as brick or as "a fish-scale shingle texture that belongs on a roof"): the
  // shaft boarded upright as Debno's is, its battens following the batter up each face
  for (const [ox, oz, ux, uz] of [[0, 1, 1, 0], [0, -1, -1, 0], [1, 0, 0, -1], [-1, 0, 0, 1]] as const) {
    const out: Vec3 = [ox, 0, oz];
    for (let k = -4; k <= 4; k++) {
      const u0 = k * 0.36, u1 = u0 * h1 / h0;
      const a: Vec3 = [ox * (h0 + 0.015) + ux * u0, 0.5, tz + oz * (h0 + 0.015) + uz * u0];
      const b: Vec3 = [ox * (h1 + 0.015) + ux * u1, shaft - 0.05, tz + oz * (h1 + 0.015) + uz * u1];
      sink.member('structureWood', a, b, 0.07, 0.03, out, { colour: LOG_DARK, decor: true }, 0);
    }
  }
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

/** The hay barn (stodoła): hewn log walls on a stone footing, a steep shingle roof, the wide double doors in the long side. */
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
    // (the props census, 2026-10-14; the judges: the village's, the barn's and the school's walls wait on real log
    // courses) the stodoła's walls in hewn logs as the Podhale barns stand, a heavier course than the houses', the wide
    // gates cut through them; the gable over them boarded
    logWork(sink, frame, [0], ctx.variant, st.window, st.mobile, 0.32);
    if (!st.mobile) gableBoards(sink, frame.faces.front, frame);
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
    if (ctx.snowCap) roofSnowOn(sink, W, D, hLo, lean);
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
    if (ctx.snowCap) roofSnowOn(sink, W, D, H, roof);
    // the saw frame (a heavy timber gate frame) on its bed, a log on the carriage
    sink.span('structureWood', -0.9, -0.2, -0.3, 0.9, 0.6, 0.3, { colour: LOG_DARK });
    for (const s of [-1, 1]) sink.span('structureWood', s * 0.75 - 0.12, 0.6, -0.15, s * 0.75 + 0.12, 2.8, 0.15, { colour: LOG_DARK, decor: true });
    sink.span('structureWood', -0.9, 2.7, -0.18, 0.9, 2.95, 0.18, { colour: LOG_DARK, decor: true });
    // (kitConnectivity: the log lay 3 cm over the saw's bed) the carriage's two rails under the log its whole length, the
    // log resting on them
    for (const x of [-0.3, 0.3]) sink.span('structureWood', x - 0.07, -0.1, -D * 0.35, x + 0.07, 0.62, D * 0.25, { colour: LOG_DARK, decor: true });
    sink.cylinder('structureWood', [0, 0.93, -D * 0.35], 'z', D * 0.6, 0.32, 8, { colour: shade(LOG, 1.15), decor: true, shadow: true });
    if (ctx.tier !== 'mobile') {
      // the boards stacked in stickered piles along the open side: the bearers on the ground, then each layer of boards on
      // its stickers (kitConnectivity: the layers floated 6 cm apart on nothing)
      for (const z of [-D * 0.3, D * 0.05, D * 0.32]) {
        for (let k = 0; k < 6; k++) {
          const y = 0.15 + k * 0.16;
          sink.span('structureWood', W / 2 + 0.4, y, z - 1.6, W / 2 + 1.5, y + 0.1, z + 1.6, { colour: shade(PALE, 0.85 + look() * 0.15), decor: true, shadow: true });
          for (const dz of [-1.35, 0, 1.35]) {
            const y0 = k === 0 ? 0 : y - 0.06;
            sink.span('structureWood', W / 2 + 0.38, y0, z + dz - 0.04, W / 2 + 1.52, y, z + dz + 0.04, { colour: LOG_DARK, decor: true });
          }
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
    // the burnt logs fallen across the foundation, lying on it (kitConnectivity: they reared up on nothing)
    for (let k = 0; k < 5; k++) {
      const a: Vec3 = [(rng() - 0.5) * W, 0.5, (rng() - 0.5) * D], b: Vec3 = [a[0] + (rng() - 0.5) * 3.5, 0.5 + rng() * 0.1, a[2] + (rng() - 0.5) * 3.5];
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
    // (round 3, the cost of round 1's chase view: an in-page toggle hold read the log village's wood cavity map at ~2 ms)
    woodAo: 0,
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
