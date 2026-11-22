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
import { bulb } from './domes.ts';
import {
  buildHouse, emitRoof, holedBox, roofGeometry, storeyFaces, wallPolygon, windowRhythm,
  type HoleRect, type HouseDialect, type HouseFrame, type Opening, type RoofSpec, type StoreySpec,
} from './house.ts';
import { doorUnit, gateUnit, windowUnit, type WindowStyle } from './openings.ts';
import { woodpile } from './dressing.ts';
import { openShed } from './outbuildings.ts';
import { dressOf, type ArchitectureStyle, type RegionalBuildContext, type RegionalBuilder } from './types.ts';

const LOG = rgb(0x5a4330), LOG_DARK = rgb(0x3b2c20), PALE = rgb(0xc9ad7f), WHITE = rgb(0xe4e2dc), IRON = rgb(0x26282a);
const CHAR = rgb(0x2a2420), BELL = rgb(0x6a5a3a);
/** The carved window surrounds, as the Podhale photos show them (buildings-270): pale pine or the brown of the logs' carving. */
const SURROUNDS: Readonly<Record<string, Rgb>> = { pale: PALE, brown: rgb(0x633c24) };
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
      // (buildings-270) the surround's paint, as the map names it (the `surround` axis): pale spruce, white or blue-grey
      surround: { bucket: 'structureWood', width: 0.11, out: 0.035, lintel: 0.2, colour: SURROUNDS[dressOf(ctx, 'surround', 'pale')] ?? PALE },
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
export function logWork(sink: PartSink, frame: HouseFrame, storeys: readonly number[], look: () => number, win: WindowStyle,
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
  // (259, the far-view census: laid 3 cm off the gable, the rays stood off it on their sides alone, fine joinery hidden
  // at range) the rays on the gable's face, their backs in it
  const o = 0;
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
function gableBoards(sink: PartSink, face: Face, frame: HouseFrame, skip: ReadonlyArray<readonly [number, number]> = []): void {
  const g = frame.roof.gable;
  if (!g) return;
  const eave = frame.eaveY, s = frame.roof.s, top = Math.max(...g.map(([, y]) => y));
  for (let u = -s + 0.2; u < s - 0.15; u += 0.25) {
    // (a batten never runs across a light cut through the gable)
    if (skip.some(([a, b]) => u > a && u < b)) continue;
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
    // (phoneIdentity: a phone draws every stream the desktop does; the woodpile is dressing it leaves out)
    sink.dressing(st.mobile, () => {
      const side = rng() < 0.5 ? frame.faces.right : frame.faces.left;
      woodpile(sink, side, -side.width / 2 + 0.5, side.width / 2 - 0.5, 1.2 + look() * 0.5, look);
    });
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
    }, {
      ...dialect(st),
      // (props census #15, Lane C 2026-10-16: the attic's gable windows were a white frame and a dark plate on the
      // boards) cut through the gables with their reveals, the units set back in them
      gableOpenings: (_face, poly) => (Math.max(...poly.map(([, y]) => y)) - poly[0][1] > 1.6
        ? [-0.9, 0.9].map((u) => ({ u0: u - 0.26, u1: u + 0.26, y0: poly[0][1] + 0.62, y1: poly[0][1] + 1.28 })) : []),
    });
    if (ctx.snowCap) roofSnow(sink, frame);
    logWork(sink, frame, [0], look, st.window, st.mobile);
    const f = frame.faces.front;
    const attic: Array<[number, number]> = [[-1.25, -0.55], [0.55, 1.25]];
    if (!st.mobile) { gableBoards(sink, f, frame, attic); gableBoards(sink, frame.faces.back, frame, attic); }
    for (const g of [f, frame.faces.back]) sunburst(sink, g, frame.eaveY + 2.2, 1.6, st.mobile);
    // the attic's small gable windows in their cut openings, white-framed
    if (Math.max(...(frame.roof.gable ?? [[0, 0]]).map(([, y]) => y)) - frame.eaveY > 1.6) {
      sink.recess = frame.gableReveal;
      try {
        for (const face of [f, frame.faces.back]) for (const u of [-0.9, 0.9]) {
          windowUnit(sink, face, u, frame.eaveY + 0.62, 0.52, 0.66, { ...st.window, shutters: null, frame: PALE }, st.rng, 0.2);
        }
      } finally { sink.recess = 0; }
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

/** A prism of `pts` (one plane) extruded `depth` along `dir`, wound whichever way the points run (dome-detail-275). */
function prismAuto(sink: PartSink, bucket: 'roof' | 'plaster' | 'wood' | 'stone', pts: readonly Vec3[], dir: Vec3, depth: number, opts: { decor?: boolean } = {}): void {
  const [a, b, c] = pts;
  const n = [(b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]),
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])];
  sink.prism(bucket, n[0] * dir[0] + n[1] * dir[1] + n[2] * dir[2] < 0 ? [...pts].reverse() : pts, dir, depth, opts);
}

/** A sloping slab: the quad `pts` extruded `thick` along its upward normal (dome-detail-275). */
function slab(sink: PartSink, bucket: 'roof' | 'plaster', pts: readonly Vec3[], thick: number, decor: boolean): void {
  const [a, b, c] = pts;
  let n: Vec3 = [(b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]),
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])];
  if (n[1] < 0) n = [-n[0], -n[1], -n[2]];
  const l = Math.hypot(n[0], n[1], n[2]);
  prismAuto(sink, bucket, pts, [n[0] / l, n[1] / l, n[2] / l], thick, decor ? { decor: true } : {});
}

/**
 * A pent roof run round a rectangle (dome-detail-275): the soboty round the church's foot, the skirt round the belfry
 * chamber's; four slabs of shingle from the wall's line out to the eave, each a trapezoid, meeting on the hips. The
 * eave's height comes back.
 */
function pentRing(sink: PartSink, cx: number, cz: number, hw: number, hd: number, yTop: number, out: number, pitchDeg: number,
  bucket: 'roof' | 'plaster', thick: number, decor: boolean): number {
  const yE = yTop - out * Math.tan(pitchDeg * Math.PI / 180), p = (x: number, y: number, z: number): Vec3 => [cx + x, y, cz + z];
  const W = hw + out, D = hd + out;
  slab(sink, bucket, [p(hw, yTop, -hd), p(hw, yTop, hd), p(W, yE, D), p(W, yE, -D)], thick, decor);
  slab(sink, bucket, [p(-hw, yTop, hd), p(-hw, yTop, -hd), p(-W, yE, -D), p(-W, yE, D)], thick, decor);
  slab(sink, bucket, [p(hw, yTop, hd), p(-hw, yTop, hd), p(-W, yE, D), p(W, yE, D)], thick, decor);
  slab(sink, bucket, [p(-hw, yTop, -hd), p(hw, yTop, -hd), p(W, yE, -D), p(-W, yE, -D)], thick, decor);
  return yE;
}

/** A row of carved teeth hanging under a board (the Zakopane ząbki; dome-detail-275): pale triangles on the face. */
function teeth(sink: PartSink, face: Face, u0: number, u1: number, y: number, o: number, size: number): void {
  const n = Math.max(2, Math.round((u1 - u0) / size)), w = (u1 - u0) / n;
  for (let k = 0; k < n; k++) {
    const a = u0 + k * w;
    sink.prism('structureWood', [facePoint(face, a, y, o), facePoint(face, a + w / 2, y - size * 0.85, o), facePoint(face, a + w, y, o)], face.out, 0.03,
      { colour: PALE, decor: true, fine: true });
  }
}

/**
 * The wooden church (Dębno, Zakopane's old church): a log nave on a stone footing under a steep shingle roof, the walls
 * clad in shingle below the eaves, a turret on the ridge, the tower at the front with its battered shingled walls, the
 * boarded belfry chamber oversailing it and the bulb, the cross. (dome-detail-275: "its details and presentation") The
 * Podhale timber church: the soboty — the low shingled skirt roof run round the nave's foot on its brackets and eave
 * plate — the nave's back gable boarded, carved and sunburst in the Zakopane manner under its bargeboards, the ridge
 * turret an open lantern under its little bulb; the belfry chamber in openwork, its carved frieze, the shingled skirt at
 * its foot; the porch on two carved posts before the tower's door, its gable boarded round a sunburst; the granite
 * footing down into the ground and the snow banked under the soboty's drip.
 */
const kosciol: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx);
  const look = ctx.variant;
  const bb = ctx.bounds;
  // (dome-detail-275) the nave narrower and the tower set back, so the soboty and the porch stand inside the plot
  const W = clamp(bb.maxX - bb.minX - 2.0, 5.0, 7.0);
  const h0 = 1.75, h1 = 1.35, shaft = 8.5, sob = 0.7;
  const zFront = bb.maxZ - 1.0, tz = zFront - h0;
  const nz1 = tz - h0 + 0.5, D = clamp(nz1 - (bb.minZ + sob + 0.1), 5.0, 9.0), nzc = nz1 - D / 2;
  const openings: Opening[] = [];
  for (const face of ['right', 'left'] as const) for (const o of windowRhythm(face, 0, D, { w: 0.7, h: 1.3, sill: 1.65, spacing: 2.4, margin: 1.2, max: 3 })) openings.push(o);
  const naveWindow: WindowStyle = {
    frame: WHITE, frameWidth: 0.05, frameOut: 0.03, bars: 'six', surround: { bucket: 'structureWood', width: 0.1, out: 0.04, colour: PALE },
    sill: { bucket: 'structureWood', out: 0.08, colour: PALE }, shutters: null,
  };
  // the granite footing under the nave and the tower, down into the ground (dome-detail-275)
  sink.span('stone', -W / 2 - 0.08, -0.6, nzc - D / 2 - 0.08, W / 2 + 0.08, 0.06, nz1);
  sink.placed(0, 0, 0, nzc, () => {
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
    const y0 = frame.floors[0], F = frame.faces;
    // the soboty (dome-detail-275): the skirt roof of shingle round the nave under its windows, on its eave plate and the
    // struts from the logs, the snow lying on it and banked under its drip
    const yS = y0 + 1.42, yE = pentRing(sink, 0, 0, W / 2, D / 2, yS, sob, 30, 'roof', 0.1, false);
    for (const name of ['front', 'right', 'back', 'left'] as const) {
      const f = F[name], half = f.width / 2, reach = half + sob - 0.14;
      faceBox(sink, 'structureWood', f, 0, yE - 0.07, sob - 0.14, 2 * reach, 0.13, 0.13, { colour: LOG_DARK, decor: true, shadow: true });
      const n = Math.max(2, Math.round(f.width / 1.05));
      for (let k = 0; k <= n; k++) {
        const u = -half + 0.25 + (f.width - 0.5) * k / n;
        sink.member('structureWood', facePoint(f, u, yS - 0.8, 0), facePoint(f, u, yE - 0.12, sob - 0.18), 0.1, 0.1, f.u,
          { colour: shade(LOG, 0.9 + look() * 0.2), decor: true, exposed: true }, 0);
      }
      if (ctx.snowCap) {
        // the bank under the drip: a wedge of snow from the footing out past the eave's line
        const bank = 0.45 + look() * 0.25;
        prismAuto(sink, 'plaster', [facePoint(f, -half - 0.6, -0.3, 0.02), facePoint(f, -half - 0.6, -0.3, sob + 0.45), facePoint(f, -half - 0.6, bank, 0.02)],
          f.u, f.width + 1.2, { decor: true });
      }
    }
    if (ctx.snowCap) pentRing(sink, 0, 0, W / 2, D / 2, yS + 0.13, sob + 0.08, 30, 'plaster', 0.12, true);
    // the back gable in the Zakopane manner (dome-detail-275): boarded upright, its sunburst, the pale bargeboards along its
    // rakes and their carved teeth, the pazdur finial and the iron cross at the half hip's peak
    const g = frame.roof.gable, back = F.back;
    const sr = Math.min(1.5, W * 0.26);
    gableBoards(sink, back, frame, [[-sr - 0.05, sr + 0.05]]);
    sunburst(sink, back, frame.eaveY + 0.1, sr, false);
    if (g) {
      // (the bargeboards, wiatrownice, at the verge's edge over the slab's end, run down past the wall to the eave's)
      const rv = frame.spec.roof.verge, re = frame.spec.roof.eave, tp = frame.roof.tanP;
      for (let i = 0; i < g.length; i++) {
        let [ua, ya] = g[i], [ub, yb] = g[(i + 1) % g.length];
        if (Math.abs(yb - ya) < 0.05) continue;
        if (ya < yb) { [ua, ya, ub, yb] = [ub, yb, ua, ya]; }
        const ue = ub + Math.sign(ub) * re, ye = yb - re * tp;
        sink.member('structureWood', facePoint(back, ua, ya - 0.06, rv), facePoint(back, ue, ye - 0.06, rv), 0.26, 0.04, back.out, { colour: PALE, decor: true }, 0.02);
      }
      // the teeth under the half hip's eave, across the gable's top
      const gTop = Math.max(...g.map(([, yy]) => yy)), topHalf = Math.max(...g.filter(([, yy]) => yy > gTop - 1e-3).map(([uu]) => Math.abs(uu)));
      teeth(sink, back, -topHalf - 0.1, topHalf + 0.1, gTop - 0.12, 0.045, 0.2);
    }
    const peakZ = -frame.roof.ridgeHalf;
    sink.cylinder('structureWood', [0, frame.roof.ridgeTopY - 0.05, peakZ], 'y', 0.7, 0.07, 6, { colour: PALE, decor: true }, 0.02);
    sink.span('structureMetal', -0.02, frame.roof.ridgeTopY + 0.3, peakZ - 0.02, 0.02, frame.roof.ridgeTopY + 1.0, peakZ + 0.02, { colour: IRON, decor: true });
    sink.span('structureMetal', -0.16, frame.roof.ridgeTopY + 0.75, peakZ - 0.02, 0.16, frame.roof.ridgeTopY + 0.79, peakZ + 0.02, { colour: IRON, decor: true });
    // the turret on the ridge (the sygnaturka; dome-detail-275: a boarded box under two cones): its boarded foot astride
    // the ridge, the open lantern on four posts with its bell, the little hip of shingle, the bulb and the cross
    const ry = frame.roof.ridgeY, tzz = -D * 0.15;
    sink.span('wood', -0.42, ry - 0.6, tzz - 0.42, 0.42, ry + 0.55, tzz + 0.42);
    sink.span('structureWood', -0.48, ry + 0.55, tzz - 0.48, 0.48, ry + 0.65, tzz + 0.48, { colour: LOG_DARK });
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      sink.span('structureWood', sx * 0.38 - 0.06, ry + 0.65, tzz + sz * 0.38 - 0.06, sx * 0.38 + 0.06, ry + 1.35, tzz + sz * 0.38 + 0.06, { colour: LOG });
    }
    sink.cylinder('structureMetal', [0, ry + 0.75, tzz], 'y', 0.35, 0.17, 8, { colour: BELL, decor: true }, 0.08);
    sink.span('structureWood', -0.05, ry + 1.1, tzz - 0.38, 0.05, ry + 1.18, tzz + 0.38, { colour: LOG_DARK, decor: true });
    const tcap: RoofSpec = { kind: 'hip', pitchDeg: 35, eave: 0.18, verge: 0.18, thickness: 0.08, bucket: 'roof', ridge: null };
    sink.placed(0, 0, 0, tzz, () => emitRoof(sink, roofGeometry(0.9, 0.9, ry + 1.35, tcap), tcap));
    const ty = bulb(sink, 'roof', 0, ry + 1.35 + 0.45 * Math.tan(35 * Math.PI / 180) - 0.05, tzz, [[0.18, 0.16, 0.34], [0.22, 0.34, 0.26], [0.2, 0.26, 0.04]]);
    sink.span('structureMetal', -0.02, ty - 0.05, tzz - 0.02, 0.02, ty + 0.6, tzz + 0.02, { colour: IRON, decor: true });
    sink.span('structureMetal', -0.14, ty + 0.4, tzz - 0.02, 0.14, ty + 0.44, tzz + 0.02, { colour: IRON, decor: true });
  });
  // the tower: battered shingled walls (a square frustum, closed), the boarded chamber, the bulb, the cross
  sink.span('stone', -h0 - 0.1, -0.6, tz - h0 - 0.1, h0 + 0.1, 0.45, tz + h0 + 0.1);
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
  // (the r2 sweep: the leaf lay on the shaft's boards, a dark plate) the door hung deep in a heavy timber case standing
  // out of the shaft
  doorUnit(sink, tf, 0, 0.45, 1.2, 2.3, { leaf: LOG_DARK, frame: { bucket: 'structureWood', width: 0.18, out: 0.17, colour: PALE }, steps: null, leafKind: 'plank' });
  // the porch before it (dome-detail-275; it was a little hood on two brackets): its granite floor and step, two posts
  // with pale capitals and their braces, the tie beam, a steep shingle gable boarded round its sunburst
  {
    const pe = 2.95, pw = 1.9, px = 0.82, pz = zFront + 0.82, c = { colour: LOG } as const;
    sink.span('stone', -1.05, -0.5, zFront, 1.05, 0.45, zFront + 0.97);
    sink.span('stone', -0.9 + look() * 0.06, -0.4, zFront + 0.97, 0.9 - look() * 0.06, 0.22, zFront + 1.27, { decor: true });
    for (const s of [-1, 1]) {
      sink.span('structureWood', s * px - 0.08, 0.45, pz - 0.08, s * px + 0.08, pe - 0.14, pz + 0.08, c);
      sink.span('structureWood', s * px - 0.12, pe - 0.34, pz - 0.12, s * px + 0.12, pe - 0.14, pz + 0.12, { colour: PALE, decor: true });
      sink.span('structureWood', s * px - 0.07, pe - 0.14, zFront - 0.2, s * px + 0.07, pe, pz + 0.1, { colour: LOG_DARK });
      sink.member('structureWood', [s * px, pe - 0.75, pz], [s * 0.35, pe - 0.14, pz], 0.08, 0.08, [0, 0, 1], { colour: LOG_DARK, decor: true, exposed: true }, 0);
    }
    sink.span('structureWood', -pw / 2, pe - 0.14, pz - 0.08, pw / 2, pe, pz + 0.08, { colour: LOG_DARK });
    const porch: RoofSpec = { kind: 'gable', pitchDeg: 48, eave: 0.2, verge: 0.22, thickness: 0.1, bucket: 'roof', ridge: 'saddle', decor: true };
    const pdz = pz + 0.12 - (zFront - 0.25), pcz = (pz + 0.12 + zFront - 0.25) / 2;
    sink.placed(0, 0, 0, pcz, () => {
      emitRoof(sink, roofGeometry(pw, pdz, pe, porch), porch);
      if (ctx.snowCap) roofSnowOn(sink, pw, pdz, pe, porch);
    });
    const pf: Face = { origin: [0, 0, pz + 0.1], u: [1, 0, 0], out: [0, 0, 1], width: pw };
    wallPolygon(sink, 'wood', pf, [[-pw / 2 + 0.05, pe], [pw / 2 - 0.05, pe], [0, pe + (pw / 2 - 0.05) * Math.tan(48 * Math.PI / 180)]], 0.05, { decor: true });
    sunburst(sink, pf, pe + 0.02, 0.5, false);
    teeth(sink, pf, -pw / 2 + 0.1, pw / 2 - 0.1, pe - 0.14, -0.02, 0.16);
  }
  const cw = h1 + 0.35, cy0 = shaft, cy1 = shaft + 2.4;
  // (props census #15, Lane C 2026-10-16: the sound holes were dark plates on the boards) cut through the chamber's
  // boarded walls with their reveals
  // (dome-detail-275) the chamber in openwork: five tall lights a face between the boards' posts, the carved frieze
  // over them with its teeth, a rail across their feet; the shingled skirt flaring out at the chamber's foot
  const lights = (): HoleRect[] => [-2, -1, 0, 1, 2].map((k) => ({ u0: k * 0.6 - 0.17, u1: k * 0.6 + 0.17, y0: cy0 + 0.55, y1: cy1 - 0.5 }));
  const chamber = holedBox(sink, 'wood', -cw, tz - cw, cw, tz + cw, cy0, cy1, { front: lights(), back: lights(), left: lights(), right: lights() }, 0.15, 0.12);
  for (const fc of Object.values(chamber)) {
    faceBox(sink, 'structureWood', fc, 0, cy1 - 0.34, 0.02, 2 * cw, 0.22, 0.04, { colour: PALE, decor: true });
    teeth(sink, fc, -cw + 0.05, cw - 0.05, cy1 - 0.45, 0.03, 0.15);
    faceBox(sink, 'structureWood', fc, 0, cy0 + 0.62, 0.03, 2 * cw - 0.2, 0.07, 0.06, { colour: LOG_DARK, decor: true });
  }
  pentRing(sink, 0, tz, cw, cw, cy0 + 0.2, 0.42, 32, 'roof', 0.08, false);
  if (ctx.snowCap) pentRing(sink, 0, tz, cw, cw, cy0 + 0.31, 0.48, 32, 'plaster', 0.1, true);
  // the chamber's eaves and the bulb (frustum rings of shingle), its spike and cross
  const cap: RoofSpec = { kind: 'hip', pitchDeg: 30, eave: 0.4, verge: 0.4, thickness: 0.1, bucket: 'roof', ridge: null };
  sink.placed(0, 0, 0, tz, () => emitRoof(sink, roofGeometry(2 * cw, 2 * cw, cy1, cap), cap));
  let y = cy1 + cw * Math.tan(30 * Math.PI / 180) * 0.6;
  // (dome-detail-275: five frustums of ten flat facets) the same bulb turned smooth (domes.ts)
  y = bulb(sink, 'roof', 0, y, tz, [[0.4, 0.55, 0.85], [0.45, 0.85, 0.95], [0.45, 0.95, 0.7], [0.4, 0.7, 0.3], [0.5, 0.3, 0.08]]);
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
      // (the props census #17, 2026-10-15, the judges: "deepen stodola's gate reveals from 0.12 m") the gates hung at the
      // back of a reveal as deep as the logs
      roof: gont(48, 0.5, 0.45, 'gable'), gableBucket: 'wood', openings, chimneys: [], gutters: null, verge: null, reveal: 0.26, spall: null,
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

/**
 * The woodshed (drewutnia; the props census #17, 2026-10-15, the judges: "a drewutnia of spruce posts on stone pads with
 * a sill beam, wall plates, knee braces and rafters, a gont shingle roof in courses on battens, and vertical boards with
 * gaps"): built member by member (outbuildings.ts openShed) on granite pads, its spruce boards standing with a finger's
 * gap for the air on three sides, the wood stacked to the plate, the snow lying on the shingles; open to +x.
 */
const drewutnia: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const look = ctx.variant;
  // the walls fill the plot less the roof's own overhang: its eaves over the open side and the back, its verges
  // over the two ends (a yard shed keeps to its plot: props.ts builds it there only if it does)
  const fit = wallsIn(ctx, 0.25, 0.18);
  const W = Math.max(2.4, fit.w), D = Math.max(2.4, fit.d);
  const mobile = ctx.tier === 'mobile';
  sink.placed(0, fit.cx, 0, fit.cz, () => {
    const pile = 1.5 + look() * 0.4;
    openShed(sink, { W, D, hLo: 2.2, pitchDeg: 24, back: true, ends: true, pile, block: true, mobile, snow: ctx.snowCap ? { t: 0.26, bucket: 'plaster' } : null }, {
      timber: LOG, post: 0.16, pad: { bucket: 'stone', size: 0.34, top: 0.18 },
      cladding: 'gapped', boards: [LOG_AGED, shade(LOG_AGED, 1.12), shade(LOG, 1.05)], boardW: 0.19, gap: 0.03, trim: LOG_DARK,
      covering: 'shingle', roofBucket: 'roof', eave: 0.25, verge: 0.18,
    }, look);
  });
  return sink.finish();
};

/**
 * The sawmill's shed (the depot's plot, its loading side to +x): the saw frame under a long shingle roof on posts,
 * the boarded back wall, the log deck and the sawn boards stacked along the open side. (dome-detail-275: "its details
 * and presentation") The Podhale tartak: the shed built member by member (outbuildings.ts openShed) — posts on granite
 * pads, sills, plates and knee braces, the rafters, the shingle laid in its courses, the barge boards — its back boarded
 * with a finger's gap, both gables boarded upright under the ridge and the back half of each end boarded down to the
 * sill (the carriage runs out through the ends); the upright saw frame (trak) on its sleepers — its two posts and head
 * beam, the sash with its blades, the flywheel and its crank rod — the carriage on its rails through it, a log on it
 * half sawn; the log deck at the far end, its skids and the logs waiting on them, chocked; the boards stickered in piles
 * under the open side, the sawdust heaped under the saw.
 */
const tartak: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const look = ctx.variant;
  const bb = ctx.bounds;
  const W = clamp(bb.maxX - bb.minX - 1.2, 7, 10), D = clamp(bb.maxZ - bb.minZ - 1.0, 13, 21);
  const cx = bb.minX + 0.6 + W / 2;
  const H = 3.4, pitch = 32, tanP = Math.tan(pitch * Math.PI / 180);
  const mobile = ctx.tier === 'mobile';
  sink.placed(0, cx, 0, 0, () => {
    // (dome-detail-275: the shed was a slab roof on bare posts over two plank walls) the shed in its members
    openShed(sink, { W, D, hLo: H, pitchDeg: pitch, back: true, ends: false, gable: true, pile: 0, block: false, mobile,
      snow: ctx.snowCap ? { t: 0.26, bucket: 'plaster' } : null }, {
      timber: LOG, post: 0.22, pad: { bucket: 'stone', size: 0.42, top: 0.2 },
      cladding: 'gapped', boards: [LOG_AGED, shade(LOG_AGED, 1.12), shade(LOG, 1.05)], boardW: 0.24, gap: 0.025, trim: LOG_DARK,
      covering: 'shingle', roofBucket: 'roof', eave: 0.55, verge: 0.45,
    }, look);
    // the gables boarded upright above the end frames' plates, their battens; the back half of each end boarded to the sill
    const under = (x: number): number => H + (W / 2 - 0.11 - Math.abs(x)) * tanP;
    for (const sz of [-1, 1]) {
      const ef: Face = { origin: [0, 0, sz * (D / 2 - 0.02)], u: [sz, 0, 0], out: [0, 0, sz], width: W };
      const xw = W / 2 - 0.11;
      wallPolygon(sink, 'wood', ef, [[-xw, H - 0.02], [xw, H - 0.02], [0, under(0) - 0.04]], 0.05);
      for (let u = -xw + 0.25; u < xw - 0.15; u += 0.3) {
        const top = under(u) - 0.08;
        if (top - H < 0.2) continue;
        faceBox(sink, 'structureWood', ef, u, (H + top) / 2, 0.015, 0.05, top - H, 0.03, { colour: LOG_DARK, decor: true, fine: true }, 'caps');
      }
      sink.span('wood', -W / 2, 0.2, sz * D / 2 - (sz > 0 ? 0.08 : 0), -W / 2 + W * 0.42, H - 0.02, sz * D / 2 + (sz < 0 ? 0.08 : 0));
    }
    // the saw frame (trak) on its sleepers: two posts and their head beam, the sash between them with its blades, the
    // flywheel beside it on its axle and the crank rod up to the sash's foot
    const fz = 0;
    for (const dx of [-0.9, 0.9]) sink.span('structureWood', dx - 0.14, -0.2, fz - 0.6, dx + 0.14, 0.18, fz + 0.6, { colour: LOG_DARK });
    sink.span('structureWood', -1.1, 0.18, fz - 0.3, 1.1, 0.5, fz + 0.3, { colour: LOG_DARK });
    for (const s of [-1, 1]) sink.span('structureWood', s * 0.78 - 0.14, 0.5, fz - 0.16, s * 0.78 + 0.14, 3.0, fz + 0.16, { colour: LOG_DARK });
    sink.span('structureWood', -1.0, 2.9, fz - 0.2, 1.0, 3.16, fz + 0.2, { colour: LOG_DARK, decor: true });
    sink.span('structureWood', -0.64, 1.55, fz - 0.11, 0.64, 1.7, fz + 0.11, { colour: shade(LOG, 0.9), decor: true });
    for (const s of [-1, 1]) sink.span('structureWood', s * 0.56 - 0.05, 1.7, fz - 0.07, s * 0.56 + 0.05, 2.78, fz + 0.07, { colour: shade(LOG, 0.9), decor: true });
    sink.span('structureWood', -0.64, 2.78, fz - 0.11, 0.64, 2.9, fz + 0.11, { colour: shade(LOG, 0.9), decor: true });
    for (let k = 0; k < 5; k++) {
      const x = -0.4 + k * 0.2;
      sink.span('structureMetal', x - 0.008, 1.7, fz - 0.05, x + 0.008, 2.78, fz + 0.05, { colour: rgb(0x6c6e70), decor: true, fine: true });
    }
    sink.cylinder('structureWood', [1.25, 0.95, fz], 'x', 0.14, 0.72, 16, { colour: shade(LOG_DARK, 1.1), decor: true, shadow: true });
    sink.cylinder('structureMetal', [0.92, 0.95, fz], 'x', 0.62, 0.05, 8, { colour: IRON, decor: true });
    sink.span('structureWood', 1.47, -0.2, fz - 0.12, 1.6, 1.0, fz + 0.12, { colour: LOG_DARK, decor: true });
    sink.member('structureWood', [1.18, 1.35, fz], [0.66, 1.62, fz], 0.08, 0.08, [1, 0, 0], { colour: LOG_DARK, decor: true, exposed: true }, 0);
    // (kitConnectivity: the log lay 3 cm over the saw's bed) the carriage's two rails under the log its whole length, the
    // log resting on them; past the frame its sawn half, the squared cant on the rails and the boards cut from it on top
    for (const x of [-0.3, 0.3]) sink.span('structureWood', x - 0.07, -0.1, -D * 0.35, x + 0.07, 0.62, D * 0.25, { colour: LOG_DARK, decor: true });
    sink.cylinder('structureWood', [0, 0.93, -D * 0.35 + 0.2], 'z', D * 0.33, 0.32, 10, { colour: shade(LOG, 1.15), decor: true, shadow: true });
    sink.span('structureWood', -0.27, 0.62, 0.35, 0.27, 1.0, D * 0.22, { colour: shade(PALE, 0.82), decor: true });
    for (let k = 0; k < 2; k++) {
      sink.span('structureWood', -0.25 + k * 0.03, 1.0 + k * 0.05, 0.5 + k * 0.2, 0.25 - k * 0.02, 1.05 + k * 0.05, D * 0.2 - k * 0.3,
        { colour: shade(PALE, 0.9 + look() * 0.1), decor: true });
    }
    // the sawdust heaped under the saw (a low cone of it)
    sink.cylinder('structureWood', [-0.2, 0, fz + 0.9], 'y', 0.32, 0.85, 10, { colour: shade(PALE, 1.05), decor: true }, 0.12);
    // the log deck at the far end: three skids across, laid falling to the carriage, the logs lying on them, the
    // outer ones chocked; a cant hook leaning on the pile
    const zd = -D / 2 + 1.35, skidTop = (z: number): number => 0.4 - (z - (zd - 1.0)) * 0.09;
    sink.span('structureWood', -2.7, -0.15, zd - 1.0, 2.7, 0.2, zd - 0.78, { colour: LOG_DARK });
    for (const x of [-2.4, 0, 2.4]) sink.member('structureWood', [x, 0.3, zd - 1.0], [x, 0.12, zd + 1.0], 0.2, 0.2, [1, 0, 0], { colour: LOG_DARK, exposed: true }, 0.1);
    const lower = [-0.6, 0, 0.6].map((dz) => { const r = 0.25 + look() * 0.06; return { z: zd + dz, r, y: skidTop(zd + dz) + r }; });
    const upper = [0, 1].map((k) => ({ z: (lower[k].z + lower[k + 1].z) / 2, r: 0.24 + look() * 0.05, y: Math.max(lower[k].y, lower[k + 1].y) + 0.44 }));
    for (const lg of [...lower, ...upper]) {
      const len = 4.6 + look() * 0.8;
      sink.cylinder('structureWood', [-len / 2, lg.y, lg.z], 'x', len, lg.r, 10, { colour: shade(LOG, 1.0 + look() * 0.2), decor: true, shadow: true });
    }
    // the chocks on the skids before the lowest log
    const low = lower[2], cz = low.z + low.r + 0.07;
    for (const s of [-1, 1]) sink.span('structureWood', s * 2.4 - 0.08, skidTop(cz) - 0.04, cz - 0.07, s * 2.4 + 0.08, skidTop(cz) + 0.16, cz + 0.07, { colour: LOG_DARK, decor: true, fine: true });
    sink.member('structureWood', [2.9, 0.0, zd + 0.4], [2.75, 1.4, zd + 0.1], 0.05, 0.05, [0, 0, 1], { colour: LOG_DARK, decor: true, exposed: true, fine: true }, 0);
    sink.dressing(mobile, () => {
      // the boards stacked in stickered piles under the open side: the bearers on the ground, then each layer of boards on
      // its stickers (kitConnectivity: the layers floated 6 cm apart on nothing); a phone draws their tones and leaves them
      // (dome-detail-275: moved in under the eave, the plot's own; they stood 0.9 m past it)
      const x0 = W / 2 - 1.75, x1 = W / 2 - 0.45;
      for (const z of [D * 0.3, -D * 0.12]) {
        const layers = 5 + Math.floor(look() * 2);
        for (let k = 0; k < layers; k++) {
          const y = 0.15 + k * 0.16;
          sink.span('structureWood', x0, y, z - 1.5, x1, y + 0.1, z + 1.5, { colour: shade(PALE, 0.85 + look() * 0.15), decor: true, shadow: true });
          for (const dz of [-1.25, 0, 1.25]) {
            const y0 = k === 0 ? 0 : y - 0.06;
            sink.span('structureWood', x0 - 0.02, y0, z + dz - 0.04, x1 + 0.02, y, z + dz + 0.04, { colour: LOG_DARK, decor: true });
          }
        }
      }
    });
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

const GORAL_BUILDERS: Readonly<Record<string, RegionalBuilder>> = Object.freeze({
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
    mossTint: [0.9, 0.95, 0.8],
  },
  // the yards: a fence of split spruce round the woodshed (no garden under the January snow)
  yard: { kinds: ['cottage', 'logcabin', 'alpine'], fence: 'fenceplank', gate: 'gate', shed: 'woodshed', shedSize: [3.6, 3.0], garden: false },
});
