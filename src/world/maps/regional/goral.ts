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
  buildHouse, closeGables, emitRoof, holedBox, roofGeometry, storeyFaces, wallPolygon, windowRhythm,
  type HoleRect, type HouseDialect, type HouseFrame, type Opening, type RoofGeometry, type RoofSpec, type StoreySpec,
} from './house.ts';
import { doorUnit, gateUnit, windowUnit, type WindowStyle } from './openings.ts';
import { mound, roofLadder, woodpile } from './dressing.ts';
import { openShed } from './outbuildings.ts';
import { dressOf, type ArchitectureStyle, type RegionalBuildContext, type RegionalBuilder } from './types.ts';

const LOG = rgb(0x5a4330), LOG_DARK = rgb(0x3b2c20), PALE = rgb(0xc9ad7f), WHITE = rgb(0xe4e2dc), IRON = rgb(0x26282a);
const CHAR = rgb(0x2a2420), BELL = rgb(0x6a5a3a);
/** The hay in a barn's loft (dome-detail-275). */
const HAY = rgb(0x9c8550);
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
      // (dome-detail-275) the stacks under their little shingled hoods on corner piers, as the Podhale stacks stand; the
      // rafters' feet under the deep eaves
      chimneys: [{ x: -W * 0.2, z: -D * 0.2, sx: 0.65, sz: 0.65, above: 0.8, bucket: 'plaster', cap: 'tile' },
        { x: W * 0.2, z: D * 0.18, sx: 0.65, sz: 0.65, above: 0.8, bucket: 'plaster', cap: 'tile' }],
      rafters: LOG_DARK,
    }, {
      ...dialect(st),
      // (props census #15, Lane C 2026-10-16: the attic's gable windows were a white frame and a dark plate on the
      // boards) cut through the gables with their reveals, the units set back in them
      gableOpenings: (_face, poly) => (Math.max(...poly.map(([, y]) => y)) - poly[0][1] > 1.6
        ? [-0.9, 0.9].map((u) => ({ u0: u - 0.26, u1: u + 0.26, y0: poly[0][1] + 0.62, y1: poly[0][1] + 1.28 })) : []),
    });
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
    // (dome-detail-275, wave 2: "the large roof is a smooth slab with no shingle courses") the gables' pale bargeboards and
    // the carved teeth under the half hips, the pazdur finial turned at each hip's peak with its iron spike
    const rg = frame.roof;
    for (const g of [f, frame.faces.back]) rakes(sink, g, frame, PALE, 0, true);
    for (const end of [1, -1]) {
      const pz = end * rg.ridgeHalf, py = rg.ridgeTopY - 0.08;
      sink.cylinder('structureWood', [0, py, pz], 'y', 0.55, 0.08, 8, { colour: PALE, decor: true }, 0.05);
      sink.cylinder('structureWood', [0, py + 0.55, pz], 'y', 0.16, 0.1, 8, { colour: PALE, decor: true }, 0.03);
      sink.span('structureMetal', -0.015, py + 0.7, pz - 0.015, 0.015, py + 1.05, pz + 0.015, { colour: IRON, decor: true, fine: true });
    }
    // the sweep's ladder up the slope to the stack (bare roofs: January's snow buries it), the snow drifted against the
    // walls
    if (!ctx.snowCap) sink.dressing(st.mobile, () => roofLadder(sink, frame, 1, D * 0.18, 1 - (W * 0.2 + 0.5) / rg.s, LOG_DARK));
    else {
      for (const name of ['right', 'back', 'left'] as const) {
        const fc = frame.faces[name];
        drift(sink, fc, -fc.width / 2 - 0.3, fc.width / 2 + (name === 'left' ? -0.2 : 0.3), 0.6, 0.3 + look() * 0.3, 0.45 + look() * 0.2);
      }
    }
    roofCover(sink, rg, frame.spec.roof, look, { snow: ctx.snowCap, mobile: st.mobile, course: 0.36 });
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
function prismAuto(sink: PartSink, bucket: 'roof' | 'plaster' | 'wood' | 'stone', pts: readonly Vec3[], dir: Vec3, depth: number, opts: Parameters<PartSink['prism']>[4] = {}): void {
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
    // (kitConnectivity, dome-detail-275 wave 2: the bell's beam hung 4 cm under the cap on nothing) the beam run up into the cap
    sink.span('structureWood', -0.05, ry + 1.1, tzz - 0.44, 0.05, ry + 1.36, tzz + 0.44, { colour: LOG_DARK, decor: true });
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

// ------------------------------------------------------------------------------------------------ roofs and gables
// (dome-detail-275, wave 2: the barn, the board store and the villa read as "a smooth roof slab and blank boarded
// gables") what the outbuildings' and the big house's roofs and gables carry: the gont in its courses, January's snow
// lying on it in slabs, its cornice over the eaves and slid off here and there, the bargeboards, the purlins' ends.

/** A point (h, z) of a roof slope: h across from the ridge (horizontal), z along it. */
type P2 = readonly [number, number];

/** A convex polygon (h, z) clipped to a·p <= c (Sutherland–Hodgman; dome-detail-275). */
function clipHalf(poly: readonly P2[], a: P2, c: number): P2[] {
  const out: P2[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const dp = a[0] * p[0] + a[1] * p[1] - c, dq = a[0] * q[0] + a[1] * q[1] - c;
    if (dp <= 0) out.push(p);
    if ((dp < 0 && dq > 0) || (dp > 0 && dq < 0)) { const t = dp / (dp - dq); out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
  }
  return out.filter((p, i) => { const q = out[(i + 1) % out.length]; return Math.hypot(p[0] - q[0], p[1] - q[1]) > 1e-4; });
}

/** A planar quad wound to face `toward` (dome-detail-275). */
function quadToward(sink: PartSink, bucket: 'roof' | 'plaster', p: readonly Vec3[], toward: Vec3, opts: Parameters<PartSink['polygon']>[2]): void {
  const n = [(p[1][1] - p[0][1]) * (p[2][2] - p[0][2]) - (p[1][2] - p[0][2]) * (p[2][1] - p[0][1]),
    (p[1][2] - p[0][2]) * (p[2][0] - p[0][0]) - (p[1][0] - p[0][0]) * (p[2][2] - p[0][2]),
    (p[1][0] - p[0][0]) * (p[2][1] - p[0][1]) - (p[1][1] - p[0][1]) * (p[2][0] - p[0][0])];
  sink.polygon(bucket, n[0] * toward[0] + n[1] * toward[1] + n[2] * toward[2] < 0 ? [...p].reverse() : p, opts);
}

/**
 * The covering of a gable or half-hip roof's two slopes (dome-detail-275): bare, the gont laid in its courses — each a
 * lapped row whose butt stands proud, split in lengths of their own tone and a little out of line, the lowest rows
 * darker with the eaves' moss; under January's snow, the snow lying in slabs down the slope, each its own depth, most
 * run out past the eave in a cornice with its icicles, a few slid off and the courses showing under their edge; the
 * little hips' snow. The courses are dressing (a phone keeps the roof's own print); the snow is drawn on every tier.
 */
function roofCover(sink: PartSink, rg: RoofGeometry, roof: RoofSpec, look: () => number, o: { snow: boolean; mobile: boolean; course: number }): void {
  if (rg.kind !== 'gable' && rg.kind !== 'halfhip') return;
  const { s, tanP, ridgeY } = rg, e = roof.eave, P = Math.atan(tanP), cosP = Math.cos(P), sinP = Math.sin(P);
  const D = rg.halfD + (rg.hipVerge ?? roof.verge), rH = rg.kind === 'gable' ? D : rg.ridgeHalf;
  let xC = 0, yC = ridgeY;
  if (rg.kind !== 'gable' && rH < D - 1e-6) {
    yC = ridgeY - (D - rH) * (rg.hipTan ?? Math.tan((roof.hipPitchDeg ?? 62) * Math.PI / 180));
    xC = Math.min(s + e, (ridgeY - yC) / tanP);
  }
  const top = ridgeY + roof.thickness / cosP, hE = s + e, lo = rg.eaveY - e * tanP;
  const zlim = (h: number): number => (xC <= 1e-6 || h >= xC ? D : rH + (D - rH) * h / xC);
  // a point on a slope's top, `off` out along its normal
  const Q = (side: number, h: number, z: number, off: number): Vec3 => [side * (h + sinP * off), top - h * tanP + cosP * off, z];
  const normal = (side: number): Vec3 => [side * sinP, cosP, 0];
  const uvOf = (side: number) => ({ kind: 'plane' as const, origin: [0, top, 0] as Vec3, u: [0, 0, side] as Vec3, v: [side * cosP, -sinP, 0] as Vec3 });
  // the courses of one slope from the eave up to hTo, between z0 and z1
  const courses = (side: number, z0: number, z1: number, hTo: number): void => sink.dressing(o.mobile, () => {
    const dh = o.course * cosP, B = 0.032, n = normal(side), down: Vec3 = [side * cosP, -sinP, 0], uv = uvOf(side);
    for (let k = 0; ; k++) {
      const hb = hE - k * dh, ht = hb - dh * 1.2;
      if (ht < Math.max(0.12, hTo)) break;
      const zl = zlim(ht), a = Math.max(z0, -zl), b = Math.min(z1, zl);
      if (b - a < 0.3) break;
      const tone = k < 2 ? 0.74 : k < 4 ? 0.84 : 0.88;
      for (let za = a; za < b - 0.05;) {
        let zb = Math.min(b, za + 1.6 + look() * 1.9);
        if (b - zb < 0.4) zb = b;
        const bh = hb + (look() - 0.5) * 0.05, opts = { decor: true, shade: tone + look() * 0.2, uv };
        quadToward(sink, 'roof', [Q(side, bh, za, B), Q(side, bh, zb, B), Q(side, ht, zb, 0.004), Q(side, ht, za, 0.004)], n, opts);
        quadToward(sink, 'roof', [Q(side, bh, za, 0), Q(side, bh, zb, 0), Q(side, bh, zb, B), Q(side, bh, za, B)], down, opts);
        za = zb;
      }
    }
  });
  if (!o.snow) { for (const side of [1, -1]) courses(side, -D, D, 0); return; }
  const Zs = D + (xC > 1e-6 ? 0 : 0.05);
  for (const side of [1, -1]) {
    for (let z0 = -Zs; z0 < Zs - 0.05;) {
      let z1 = Math.min(Zs, z0 + 1.7 + look() * 1.7);
      if (Zs - z1 < 0.9) z1 = Zs;
      const slid = look() < 0.28, over = slid ? -(0.5 + look() * 1.1) : 0.08 + look() * 0.2, t = 0.27 + look() * 0.05;
      const hS = hE + over, hOut = Math.max(hE, hS);
      let poly: P2[] = xC > 1e-6 ? [[hOut, -D], [hOut, D], [xC, D], [0, rH], [0, -rH], [xC, -D]] : [[hOut, -Zs], [hOut, Zs], [0, Zs], [0, -Zs]];
      poly = clipHalf(clipHalf(clipHalf(poly, [0, -1], -z0), [0, 1], z1), [1, 0], hS);
      if (poly.length >= 3) prismAuto(sink, 'plaster', poly.map(([h, z]) => Q(side, h, z, 0.012)), normal(side), t, { decor: true });
      if (slid) courses(side, z0, z1, hS - 0.15);
      else {
        // the icicles along the cornice, hung from the shingles' edge
        const n = Math.floor(look() * 4);
        for (let i = 0; i < n; i++) {
          const z = clamp(z0 + (z1 - z0) * (i + 0.5 + (look() - 0.5) * 0.6) / n, -D + 0.1, D - 0.1), len = 0.18 + look() * 0.42;
          sink.cylinder('plaster', [side * (hE - 0.06), lo - len, z], 'y', len + 0.02, 0.006, 5, { decor: true, fine: 'near' }, 0.045, false);
        }
      }
      z0 = z1;
    }
  }
  // the little hips' snow
  if (xC > 1e-6) {
    for (const end of [1, -1]) {
      const rise = ridgeY - yC, run = D - rH, len = Math.hypot(rise, run), nE: Vec3 = [0, run / len, end * rise / len], off = roof.thickness + 0.012;
      const pts: Vec3[] = [[-xC, yC, end * D], [xC, yC, end * D], [0, ridgeY, end * rH]];
      prismAuto(sink, 'plaster', pts.map((p): Vec3 => [p[0] + nE[0] * off, p[1] + nE[1] * off, p[2] + nE[2] * off]), nE, 0.24, { decor: true });
    }
  }
}

/**
 * The bargeboards (wiatrownice) along a gable's rakes at the verge's edge (dome-detail-275), run down past the wall to
 * the eave's; at a gable's apex crossed and run on past it (`cross`, the barns' crossed ends), at a half hip its teeth
 * under the hip's eave (`teethToo`).
 */
function rakes(sink: PartSink, face: Face, frame: HouseFrame, colour: Rgb, cross: number, teethToo: boolean): void {
  const g = frame.roof.gable;
  if (!g) return;
  const rv = frame.spec.roof.verge, re = frame.spec.roof.eave, tp = frame.roof.tanP;
  let k = 0;
  for (let i = 0; i < g.length; i++) {
    let [ua, ya] = g[i], [ub, yb] = g[(i + 1) % g.length];
    if (Math.abs(yb - ya) < 0.05) continue;
    if (ya < yb) [ua, ya, ub, yb] = [ub, yb, ua, ya];
    const ue = ub + Math.sign(ub) * re, ye = yb - re * tp, L = Math.hypot(ua - ue, ya - ye), run = Math.abs(ua) < 0.01 ? cross : 0;
    const o = rv + (k++ % 2) * 0.045 * (run > 0 ? 1 : 0);
    sink.member('structureWood', facePoint(face, ue, ye - 0.06, o), facePoint(face, ua + (ua - ue) / L * run, ya - 0.06 + (ya - ye) / L * run, o),
      0.26, 0.045, face.out, { colour, decor: true }, 0.02);
  }
  if (teethToo && g.length === 4) {
    const gTop = Math.max(...g.map(([, yy]) => yy)), half = Math.max(...g.filter(([, yy]) => yy > gTop - 1e-3).map(([uu]) => Math.abs(uu)));
    teeth(sink, face, -half - 0.1, half + 0.1, gTop - 0.12, 0.045, 0.2);
  }
}

/** The purlins' ends under a gable's verge (dome-detail-275): the ridge purlin and one each side, out to the bargeboards. */
function purlinEnds(sink: PartSink, face: Face, frame: HouseFrame, colour: Rgb): void {
  const rg = frame.roof, rv = frame.spec.roof.verge;
  if (rg.kind !== 'gable') return;
  for (const u of [-rg.s * 0.52, 0, rg.s * 0.52]) {
    const yTop = rg.ridgeY - (Math.abs(u) + 0.08) * rg.tanP;
    faceBox(sink, 'structureWood', face, u, yTop - 0.11, (rv - 0.08) / 2, 0.16, 0.22, rv - 0.08, { colour, decor: true, shadow: true });
  }
}

/** Snow drifted against a wall's foot (dome-detail-275): a wedge `h` high, `out` from the wall, from u0 to u1. */
function drift(sink: PartSink, face: Face, u0: number, u1: number, y: number, h: number, out: number): void {
  if (u1 - u0 < 0.3) return;
  prismAuto(sink, 'plaster', [facePoint(face, u0, y - 0.25, -0.02), facePoint(face, u0, y - 0.25, out), facePoint(face, u0, y + h, -0.02)], face.u, u1 - u0, { decor: true });
}

/** A plank ramp up to a gate's threshold (dome-detail-275): an earth wedge decked in boards, its edge beams. */
function gateRamp(sink: PartSink, face: Face, u: number, w: number, y: number, len: number): void {
  prismAuto(sink, 'wood', [facePoint(face, u - w / 2, -0.15, -0.05), facePoint(face, u - w / 2, -0.15, len), facePoint(face, u - w / 2, 0.02, len),
    facePoint(face, u - w / 2, y, -0.05)], face.u, w, { decor: true });
  for (const s of [-1, 1]) {
    sink.member('structureWood', facePoint(face, u + s * (w / 2 - 0.06), y + 0.03, 0), facePoint(face, u + s * (w / 2 - 0.06), 0.05, len - 0.05), 0.12, 0.1,
      [0, 1, 0], { colour: LOG_DARK, decor: true, exposed: true }, 0.06);
  }
}

/**
 * The hay barn (stodoła): hewn log walls on a stone footing, a steep shingle roof, the wide double doors in the long side.
 * (dome-detail-275, wave 2: "a smooth roof slab and blank boarded gables") The Podhale stodoła as it stands: the gont in
 * its courses (or January's snow on it in slabs, its cornice and icicles), the rafters' feet under the eaves, both
 * gables boarded upright under dark bargeboards crossed at the apex and the purlins' ends; the hay door cut through the
 * front gable, one leaf swung open on the hay, a vent through the back one; plank ramps up to both gates; the snow
 * drifted against the walls.
 */
const stodola: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx);
  const look = ctx.variant;
  const fit = wallsIn(ctx, 0.42, 0.4);
  const W = clamp(fit.w, 6.5, 9.4), D = clamp(fit.d, 9, 14);
  sink.placed(0, fit.cx, 0, fit.cz, () => {
    const openings: Opening[] = [
      { face: 'front', storey: 0, kind: 'gate', u: 0, w: 2.8, y0: 0, h: 3.0 },
      { face: 'right', storey: 0, kind: 'gate', u: 0, w: 3.0, y0: 0, h: 3.0 },
    ];
    const roof = gont(48, 0.5, 0.45, 'gable'), plinth = 0.35, eave = plinth + 3.6;
    // (dome-detail-275) the hay door and the vent cut through the gables
    const hay: HoleRect = { u0: -0.6, u1: 0.6, y0: eave + 0.35, y1: eave + 1.65 }, vent: HoleRect = { u0: -0.28, u1: 0.28, y0: eave + 2.1, y1: eave + 2.55 };
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: plinth, out: 0.05, bucket: 'stone' }, storeys: [{ h: 3.6, wall: 'wood' }],
      // (the props census #17, 2026-10-15, the judges: "deepen stodola's gate reveals from 0.12 m") the gates hung at the
      // back of a reveal as deep as the logs
      roof, gableBucket: 'wood', openings, chimneys: [], gutters: null, verge: null, reveal: 0.26, spall: null,
      // (dome-detail-275) the rafters' feet under the eaves
      rafters: LOG_DARK,
    }, { ...dialect({ ...st, litShare: 0 }), gableOpenings: (face) => (face.out[2] > 0 ? [hay] : [vent]) });
    // (the props census, 2026-10-14; the judges: the village's, the barn's and the school's walls wait on real log
    // courses) the stodoła's walls in hewn logs as the Podhale barns stand, a heavier course than the houses', the wide
    // gates cut through them; the gable over them boarded
    logWork(sink, frame, [0], look, st.window, st.mobile, 0.32);
    const F = frame.faces;
    // (dome-detail-275) both gables boarded, their bargeboards crossed at the apex, the purlins' ends under the verge
    gableBoards(sink, F.front, frame, [[hay.u0 - 0.06, hay.u1 + 0.06]]);
    gableBoards(sink, F.back, frame, [[vent.u0 - 0.06, vent.u1 + 0.06]]);
    for (const g of [F.front, F.back]) { rakes(sink, g, frame, LOG_DARK, 0.6, false); purlinEnds(sink, g, frame, LOG_DARK); }
    // the hay door (dome-detail-275): its frame, one leaf shut in the reveal, the other swung out on its hinges, the hay
    // behind; the vent's frame
    {
      const f = F.front, c = { colour: shade(LOG, 1.1), decor: true } as const, hw = (hay.u1 - hay.u0) / 2;
      for (const s of [-1, 1]) faceBox(sink, 'structureWood', f, s * (hw + 0.06), (hay.y0 + hay.y1) / 2, 0.03, 0.12, hay.y1 - hay.y0 + 0.24, 0.06, c);
      for (const y of [hay.y0 - 0.06, hay.y1 + 0.06]) faceBox(sink, 'structureWood', f, 0, y, 0.03, 2 * hw, 0.12, 0.06, c);
      const r = frame.gableReveal, leaf = { colour: shade(LOG, 0.95), decor: true } as const;
      faceBox(sink, 'structureWood', f, -hw / 2, (hay.y0 + hay.y1) / 2, -r + 0.05, hw, hay.y1 - hay.y0 - 0.04, 0.04, leaf);
      faceBox(sink, 'structureWood', f, hw + 0.14, (hay.y0 + hay.y1) / 2, hw / 2 + 0.02, 0.04, hay.y1 - hay.y0 - 0.06, hw, { ...leaf, shadow: true });
      mound(sink, facePoint(f, hw * 0.35, hay.y0, -r * 0.5), f.u, f.out, hw * 0.55, r * 0.5 + 0.12, 0.45, HAY, { decor: true }, look() * 2, 5);
      const v = F.back;
      for (const s of [-1, 1]) faceBox(sink, 'structureWood', v, s * (vent.u1 + 0.05), (vent.y0 + vent.y1) / 2, 0.025, 0.1, vent.y1 - vent.y0 + 0.2, 0.05, c);
      for (let y = vent.y0 + 0.1; y < vent.y1 - 0.05; y += 0.14) faceBox(sink, 'structureWood', v, 0, y, -0.05, vent.u1 - vent.u0, 0.05, 0.1, { ...c, fine: true });
    }
    // the plank ramps up to the gates' thresholds (dome-detail-275)
    gateRamp(sink, F.front, 0, 3.0, plinth, 0.85);
    gateRamp(sink, F.right, 0, 3.2, plinth, 0.75);
    if (ctx.snowCap) {
      // the snow drifted against the walls, the gates dug clear (dome-detail-275)
      for (const [name, gu] of [['front', 1.7], ['right', 1.8], ['back', 0], ['left', 0]] as const) {
        const f = F[name], half = f.width / 2, h = 0.35 + look() * 0.3, out = 0.5 + look() * 0.25;
        if (gu) { drift(sink, f, -half - 0.3, -gu, plinth, h, out); drift(sink, f, gu, half + 0.3, plinth, h * 0.8, out); }
        else drift(sink, f, -half - 0.3, half + 0.3, plinth, h, out);
      }
    }
    roofCover(sink, frame.roof, roof, look, { snow: ctx.snowCap, mobile: st.mobile, course: 0.36 });
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
    // (kitConnectivity, dome-detail-275 wave 2: the log's facets stood 7 cm over the rails) the log down onto its rails
    sink.cylinder('structureWood', [0, 0.8, -D * 0.35 + 0.2], 'z', D * 0.33, 0.32, 10, { colour: shade(LOG, 1.15), decor: true, shadow: true });
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
 * gables and the long side, the battens down its boards. (dome-detail-275, wave 2: "a big plank barn: a smooth sheet
 * roof and a blank gable") The Podhale board store as a drying shed: its frame standing out of the boards (the posts at
 * every bay on the sill and under the plate), the long walls' upper band left open in louvre boards for the air; the
 * gont in its courses (or January's snow on it in slabs) under a ridge ventilator over the middle bays, the rafters'
 * feet; both gables boarded under crossed bargeboards and the purlins' ends, each with its pitching door under the hoist
 * beam and its pulley, the louvred vent near the apex; shingled hoods on struts over the gable gates; plank ramps up to
 * the gates; boards stacked on stickers under the eave; the snow drifted against the walls.
 */
const sklad: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx);
  const look = ctx.variant;
  const bb = ctx.bounds;
  const W = clamp(bb.maxX - bb.minX - 1.2, 11, 17), D = clamp(bb.maxZ - bb.minZ - 1.0, 18, 29);
  // (dome-detail-275) the loft windows along the long walls gave way to the louvred band
  const openings: Opening[] = [
    { face: 'front', storey: 0, kind: 'gate', u: 0, w: 3.6, y0: 0, h: 3.6 },
    { face: 'back', storey: 0, kind: 'gate', u: 0, w: 3.6, y0: 0, h: 3.6 },
    { face: 'right', storey: 0, kind: 'gate', u: -D * 0.2, w: 3.2, y0: 0, h: 3.2 },
  ];
  const plinth = 0.3, H = 4.6, eave = plinth + H, roof = gont(40, 0.6, 0.5, 'gable');
  const ridge = eave + W / 2 * Math.tan(40 * Math.PI / 180);
  // (dome-detail-275) the pitching door and the vent cut through each gable
  const pitch: HoleRect = { u0: -0.75, u1: 0.75, y0: eave + 0.7, y1: eave + 2.4 }, louvre: HoleRect = { u0: -0.55, u1: 0.55, y0: ridge - 2.3, y1: ridge - 1.4 };
  sink.placed(0, (bb.minX + bb.maxX) / 2, 0, (bb.minZ + bb.maxZ) / 2, () => {
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: plinth, out: 0.05, bucket: 'stone' }, storeys: [{ h: H, wall: 'wood' }],
      roof, gableBucket: 'wood', openings, chimneys: [], gutters: null, verge: null, reveal: 0.12, spall: null, rafters: LOG_DARK,
    }, { ...dialect({ ...st, litShare: 0 }), gableOpenings: () => [pitch, louvre] });
    const faces = storeyFaces(frame, 0), F = frame.faces;
    const timber = { colour: LOG_DARK, decor: true, fineSides: true } as const, band0 = 3.75;
    for (const name of ['front', 'right', 'back', 'left'] as const) {
      const face = faces[name], half = face.width / 2, long = name === 'right' || name === 'left';
      const gates = openings.filter((o) => o.face === name).map((o) => [o.u - o.w / 2 - 0.18, o.u + o.w / 2 + 0.18] as const);
      const clear = (u: number, r: number): boolean => !gates.some(([a, b]) => u > a - r && u < b + r);
      // the frame (dome-detail-275): the posts at the corners and every bay, the sill on the plinth between the gates, the
      // plate under the eave
      const bays = Math.max(2, Math.round((face.width - 0.26) / 3.0));
      const posts: number[] = [];
      for (let k = 0; k <= bays; k++) { const u = -half + 0.13 + (face.width - 0.26) * k / bays; if (clear(u, 0.12)) posts.push(u); }
      for (const u of posts) faceBox(sink, 'structureWood', face, u, (plinth + eave) / 2, 0.035, 0.22, H, 0.07, timber, 'caps');
      const runs: Array<[number, number]> = [];
      let from = -half;
      for (const [a, b] of [...gates].sort((p, q) => p[0] - q[0])) { if (a > from + 0.2) runs.push([from, a]); from = b; }
      if (half > from + 0.2) runs.push([from, half]);
      for (const [a, b] of runs) faceBox(sink, 'structureWood', face, (a + b) / 2, plinth + 0.11, 0.04, b - a, 0.22, 0.08, timber);
      faceBox(sink, 'structureWood', face, 0, eave - 0.12, 0.04, face.width, 0.24, 0.08, timber);
      // the long walls' louvred band for the air (dome-detail-275): the dark behind, three boards across each bay
      const yTop = long ? band0 : eave - 0.24;
      if (long) {
        for (let k = 0; k + 1 < posts.length; k++) {
          const a = posts[k] + 0.11, b = posts[k + 1] - 0.11, um = (a + b) / 2;
          faceBox(sink, 'structureWood', face, um, (band0 + eave - 0.24) / 2, 0.006, b - a, eave - 0.24 - band0, 0.012, { colour: rgb(0x17120e), decor: true }, 'caps');
          for (let j = 0; j < 3; j++) {
            faceBox(sink, 'structureWood', face, um, band0 + 0.16 + j * 0.27, 0.04, b - a, 0.14, 0.06, { colour: shade(LOG_AGED, 0.92 + look() * 0.18), decor: true, fineSides: true });
          }
        }
      }
      // the battens down the boards' joints below the band (fine joinery), clear of the posts and the gates
      for (let u = -half + 0.36; u < half - 0.2; u += 0.45) {
        if (!clear(u, 0.05) || posts.some((p) => Math.abs(p - u) < 0.2)) continue;
        faceBox(sink, 'structureWood', face, u, (plinth + 0.22 + yTop) / 2, 0.012, 0.06, yTop - plinth - 0.22, 0.024, { colour: LOG_DARK, decor: true, fine: true }, 'caps');
      }
    }
    // the gables (dome-detail-275): boarded upright, the bargeboards crossed at the apex, the purlins' ends; the pitching
    // door's frame and its two leaves shut in the reveal, the hoist beam over it with its pulley and rope; the vent's
    // frame and louvres; the shingled hood over the gate on its two struts
    for (const g of [F.front, F.back]) {
      gableBoards(sink, g, frame, [[pitch.u0 - 0.08, pitch.u1 + 0.08]]);
      rakes(sink, g, frame, LOG_DARK, 0.65, false);
      purlinEnds(sink, g, frame, LOG_DARK);
      const c = { colour: shade(LOG, 1.1), decor: true } as const, r = frame.gableReveal;
      for (const h of [pitch, louvre]) {
        const hw = (h.u1 - h.u0) / 2;
        for (const s of [-1, 1]) faceBox(sink, 'structureWood', g, s * (hw + 0.06), (h.y0 + h.y1) / 2, 0.03, 0.12, h.y1 - h.y0 + 0.24, 0.06, c);
        for (const y of [h.y0 - 0.06, h.y1 + 0.06]) faceBox(sink, 'structureWood', g, 0, y, 0.03, 2 * hw, 0.12, 0.06, c);
      }
      const hw = (pitch.u1 - pitch.u0) / 2, my = (pitch.y0 + pitch.y1) / 2, ph = pitch.y1 - pitch.y0 - 0.04;
      for (const s of [-1, 1]) {
        faceBox(sink, 'structureWood', g, s * hw / 2, my, -r + 0.05, hw - 0.02, ph, 0.04, { colour: shade(LOG, 0.95), decor: true });
        for (const y of [pitch.y0 + 0.3, pitch.y1 - 0.3]) faceBox(sink, 'structureWood', g, s * hw / 2, y, -r + 0.09, hw - 0.12, 0.12, 0.04, { colour: LOG_DARK, decor: true, fine: true });
      }
      for (let y = louvre.y0 + 0.12; y < louvre.y1 - 0.06; y += 0.19) faceBox(sink, 'structureWood', g, 0, y, -0.05, louvre.u1 - louvre.u0, 0.06, 0.1, { colour: LOG_DARK, decor: true });
      const by = pitch.y1 + 0.45;
      faceBox(sink, 'structureWood', g, 0, by, 0.6, 0.2, 0.24, 1.2, { colour: LOG_DARK, decor: true, shadow: true });
      const pc = facePoint(g, 0, by - 0.3, 1.0);
      sink.cylinder('structureWood', [pc[0] - 0.06, pc[1], pc[2]], 'x', 0.12, 0.14, 10, { colour: shade(LOG_DARK, 1.2), decor: true });
      sink.member('structureWood', facePoint(g, 0, by - 0.1, 1.0), facePoint(g, 0, by - 0.2, 1.0), 0.04, 0.04, g.u, { colour: IRON, decor: true, exposed: true }, 0);
      sink.member('structureWood', facePoint(g, 0, by - 0.42, 1.0), facePoint(g, 0, pitch.y0 + 0.4, 1.0), 0.025, 0.025, g.u, { colour: PALE, decor: true, exposed: true, fine: true }, 0);
      const hy = 4.55, ho = 0.95, hy1 = hy - ho * Math.tan(26 * Math.PI / 180), hu = 2.5;
      slab(sink, 'roof', [facePoint(g, -hu, hy, 0), facePoint(g, hu, hy, 0), facePoint(g, hu, hy1, ho), facePoint(g, -hu, hy1, ho)], 0.08, true);
      if (ctx.snowCap) slab(sink, 'plaster', [facePoint(g, -hu - 0.04, hy + 0.1, 0), facePoint(g, hu + 0.04, hy + 0.1, 0), facePoint(g, hu + 0.04, hy1 + 0.07, ho + 0.06), facePoint(g, -hu - 0.04, hy1 + 0.07, ho + 0.06)], 0.16, true);
      for (const s of [-1, 1]) {
        sink.member('structureWood', facePoint(g, s * 2.2, 3.5, 0), facePoint(g, s * 2.2, hy1 + 0.02, ho - 0.12), 0.12, 0.12, g.u, { colour: LOG_DARK, decor: true, exposed: true }, 0.04);
      }
    }
    // the ridge ventilator over the middle bays (dome-detail-275): its boarded body astride the ridge, the dark of its
    // louvres along both sides behind their boards, its own little roof
    {
      const rt = frame.roof.ridgeTopY, Lv = D * 0.42, vy = rt + 0.55;
      sink.span('wood', -0.5, ridge - 0.45, -Lv / 2, 0.5, vy, Lv / 2, { decor: true });
      for (const sx of [-1, 1]) {
        const vf: Face = { origin: [sx * 0.5, 0, 0], u: [0, 0, -sx], out: [sx, 0, 0], width: Lv };
        faceBox(sink, 'structureWood', vf, 0, rt + 0.3, 0.006, Lv - 0.3, 0.4, 0.012, { colour: rgb(0x17120e), decor: true }, 'caps');
        for (const y of [rt + 0.18, rt + 0.36]) faceBox(sink, 'structureWood', vf, 0, y, 0.035, Lv - 0.3, 0.08, 0.05, { colour: LOG_AGED, decor: true, fineSides: true });
      }
      const vr: RoofSpec = { kind: 'gable', pitchDeg: 40, eave: 0.32, verge: 0.25, thickness: 0.08, bucket: 'roof', ridge: 'saddle', decor: true };
      const vg = roofGeometry(1.0, Lv, vy, vr);
      emitRoof(sink, vg, vr);
      closeGables(sink, vg, 'wood');
      if (ctx.snowCap) roofSnowOn(sink, 1.0, Lv, vy, vr);
    }
    // the plank ramps up to the gates (dome-detail-275)
    gateRamp(sink, F.front, 0, 3.8, plinth, 0.9);
    gateRamp(sink, F.back, 0, 3.8, plinth, 0.9);
    gateRamp(sink, F.right, -D * 0.2, 3.4, plinth, 0.85);
    // the boards stacked on their stickers under the left eave (dome-detail-275; tartak's piles), a phone draws their tones
    // and leaves them
    sink.dressing(st.mobile, () => {
      const x0 = -W / 2 - 1.05, x1 = -W / 2 - 0.22, zc = (look() - 0.5) * D * 0.3, len = 2.2 + look() * 0.8, layers = 5 + Math.floor(look() * 3);
      for (let k = 0; k < layers; k++) {
        const y = 0.15 + k * 0.16;
        sink.span('structureWood', x0, y, zc - len, x1, y + 0.1, zc + len, { colour: shade(PALE, 0.82 + look() * 0.16), decor: true, shadow: true });
        for (const dz of [-len + 0.25, 0, len - 0.25]) {
          sink.span('structureWood', x0 - 0.02, k === 0 ? 0 : y - 0.06, zc + dz - 0.04, x1 + 0.02, y, zc + dz + 0.04, { colour: LOG_DARK, decor: true });
        }
      }
      if (ctx.snowCap) sink.span('plaster', x0 - 0.03, 0.15 + layers * 0.16 - 0.06, zc - len - 0.03, x1, 0.15 + layers * 0.16 + 0.1, zc + len + 0.03, { decor: true });
    });
    if (ctx.snowCap) {
      // the snow drifted against the walls, the gates dug clear (dome-detail-275)
      for (const name of ['front', 'right', 'back', 'left'] as const) {
        const f = F[name], half = f.width / 2, gates = openings.filter((o) => o.face === name).map((o) => [o.u - o.w / 2 - 0.3, o.u + o.w / 2 + 0.3] as const);
        let from = -half - 0.3;
        for (const [a, b] of [...gates, [half + 0.3, half + 0.3] as const].sort((p, q) => p[0] - q[0])) {
          drift(sink, f, from, a, plinth, 0.35 + look() * 0.3, 0.5 + look() * 0.2);
          from = b;
        }
      }
    }
    roofCover(sink, frame.roof, roof, look, { snow: ctx.snowCap, mobile: st.mobile, course: 0.46 });
  });
  return sink.finish();
};

/** The burnt house's ash, its scorched timber and its rusted iron (dome-detail-275). */
const ASH = rgb(0x6a655d), SCORCH = rgb(0x4b3628), RUST = rgb(0x4a3328), SNOW = rgb(0xe9edf0);

/**
 * A house burnt in January 1945: the granite foundation, charred log stubs, the whitewashed stack standing.
 * (dome-detail-275, wave 2: "one plain chimney box and a few black stumps on a bare slab") The Podhale house after the
 * fire, as the burnt villages stood that winter: the granite footing's ring, its face stones proud and a few tumbled off
 * it, the cellar inside full of ash; the sill logs charred black on the footing and the walls' lowest courses burnt to
 * jagged heads, one corner still standing chest high on its notched log ends; the charred door posts over the threshold
 * stone; in the middle of it the whitewashed stove, its hearth mouth, iron plate and pot and the bench ledge at its side,
 * the chimney breast and the stack over it, scorched where the roof burnt round it and sooted at its mouth; the roof
 * fallen in — a sheet of its shingle lying from the breast down into the ash on its rafters, the ridge purlin down from
 * the standing corner, two rafters leant on the stack, the main beam across the stove; heaps of ash and charred shingle,
 * an iron bedstead left in them; January's snow on every ledge, on the heaps, drifted against the footing.
 */
const spalona: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant, snow = ctx.snowCap;
  const fit = wallsIn(ctx, 0.05, 0.05);
  const W = clamp(fit.w, 5.0, 7.6), D = clamp(fit.d, 6.0, 9.6);
  sink.placed(0, fit.cx, 0, fit.cz, () => {
    // FT the footing's thickness, F0 its top, C a log course, LD a log's depth
    const hw = W / 2, hd = D / 2, FT = 0.5, F0 = 0.6, C = 0.26, LD = 0.24, ix = hw - FT, iz = hd - FT;
    const snowOn = { decor: true } as const;
    // the footing's ring of granite and the cellar inside it, filled with ash to the old floor's joists
    sink.span('stone', -ix, -0.3, -iz, ix, 0.24, iz);
    sink.span('structureWood', -ix, 0.24, -iz, ix, 0.28, iz, { colour: ASH, decor: true });
    for (const sz of [-1, 1]) sink.span('stone', -hw, -0.3, sz > 0 ? iz : -hd, hw, F0, sz > 0 ? hd : -iz);
    for (const sx of [-1, 1]) sink.span('stone', sx > 0 ? ix : -hw, -0.3, -iz, sx > 0 ? hw : -ix, F0, iz);
    const faces: Record<'front' | 'right' | 'back' | 'left', Face> = {
      front: { origin: [0, 0, hd], u: [1, 0, 0], out: [0, 0, 1], width: W }, right: { origin: [hw, 0, 0], u: [0, 0, -1], out: [1, 0, 0], width: D },
      back: { origin: [0, 0, -hd], u: [-1, 0, 0], out: [0, 0, -1], width: W }, left: { origin: [-hw, 0, 0], u: [0, 0, 1], out: [-1, 0, 0], width: D },
    };
    // the footing's face stones, each its own length and tone, a few tumbled off it onto the snow
    let tumbled = 0;
    for (const f of Object.values(faces)) {
      for (let u = -f.width / 2 + 0.02; u < f.width / 2 - 0.2;) {
        const len = Math.min(f.width / 2 - 0.02 - u, 0.45 + look() * 0.45), h = 0.22 + look() * 0.1, gone = look() < 0.1 && tumbled < 4;
        if (gone) {
          tumbled++;
          const a = facePoint(f, u + len / 2 - 0.2, 0.1, 0.3 + look() * 0.15), b = facePoint(f, u + len / 2 + 0.25, 0.1, 0.25 + look() * 0.2);
          sink.member('stone', a, b, h, 0.24, [0, 1, 0], { decor: true, exposed: true, shade: 0.8 }, 0.12);
        } else faceBox(sink, 'stone', f, u + len / 2, F0 - 0.02 - h / 2, 0.025, len - 0.04, h, 0.05, { decor: true, fine: 'near', shade: 0.82 + look() * 0.26 });
        u += len;
      }
    }
    // the walls' charred courses (the eave walls' logs half a course off the gable walls', each sitting in the other's
    // notch): the sills on the footing, the courses over them burnt to jagged heads, the standing corner, the door gap
    const corner = Math.floor(rng() * 4), csx = corner & 1 ? 1 : -1, csz = corner & 2 ? 1 : -1;
    const Nc = 5 + Math.floor(rng() * 3), fall = 2.4 + rng() * 1.4, door = (rng() < 0.5 ? -1 : 1) * W * 0.18;
    const cornerU = (name: keyof typeof faces): number | null => {
      if (name === 'front') return csz > 0 ? csx * hw : null;
      if (name === 'back') return csz < 0 ? -csx * hw : null;
      if (name === 'right') return csx > 0 ? -csz * hd : null;
      return csx < 0 ? csz * hd : null;
    };
    const CELL = 0.3;
    // the courses standing at each cell of each wall
    const profile = {} as Record<keyof typeof faces, number[]>;
    for (const name of ['front', 'right', 'back', 'left'] as const) {
      const f = faces[name], cu = cornerU(name), n = Math.round(f.width / CELL);
      // burnt to the sill along most of a wall, a second course left in stretches of a metre or two; the standing corner's
      // courses falling away from it, each head a little short of the one under it
      const stretch: number[] = [];
      for (let i = 0; i < n; i += 4 + Math.floor(look() * 3)) stretch.push(i);
      const second = stretch.map(() => look() < 0.4), notch = Array.from({ length: Math.ceil(n / 3) }, () => Math.floor(look() * 3) - 1);
      profile[name] = Array.from({ length: n }, (_, i) => {
        const u = -f.width / 2 + (i + 0.5) * f.width / n;
        if (name === 'front' && Math.abs(u - door) < 0.6) return 1;
        let s2 = 0;
        for (let k = 0; k < stretch.length; k++) if (stretch[k] <= i) s2 = k;
        const stand = cu === null ? 0 : Math.floor(Nc * (1 - Math.abs(u - cu) / fall) + 0.5);
        return Math.max(1, second[s2] ? 2 : 1, stand + (stand > 1 && Math.abs(u - (cu ?? 0)) > 0.5 ? notch[Math.floor(i / 3)] : 0));
      });
    }
    const topAt = (name: keyof typeof faces, u: number): number => {
      const pr = profile[name], f = faces[name], i = clamp(Math.floor((u + f.width / 2) / f.width * pr.length), 0, pr.length - 1);
      const lift = name === 'front' || name === 'back' ? -C / 2 : 0;
      return F0 + pr[i] * C + lift;
    };
    for (const name of ['front', 'right', 'back', 'left'] as const) {
      const f = faces[name], pr = profile[name], n = pr.length, cell = f.width / n, half = f.width / 2, ends = name === 'front' || name === 'back';
      const touches = cornerU(name) !== null;
      for (let k = 0; k < Math.max(...pr); k++) {
        const y0 = Math.max(F0, F0 + k * C - (ends ? C / 2 : 0)), y1 = F0 + (k + 1) * C - (ends ? C / 2 : 0) - 0.012;
        for (let i = 0; i < n;) {
          if (pr[i] <= k) { i++; continue; }
          let j = i;
          while (j < n && pr[j] > k) j++;
          let u0 = -half + i * cell, u1 = -half + j * cell;
          // a burnt head ends ragged; a log reaching the corner runs on past it, its notched end
          const rag = k ? 0.45 : 0.2;
          u0 = i === 0 ? u0 - (0.2 + look() * 0.08) : u0 + (look() - 0.5) * rag;
          u1 = Math.max(u0 + 0.2, j === n ? u1 + (0.2 + look() * 0.08) : u1 + (look() - 0.5) * rag);
          const a = facePoint(f, u0, y0, -0.03 - LD), b = facePoint(f, u1, y1, -0.03);
          const solid = k === 0 || (touches && k <= 3);
          sink.span('structureWood', Math.min(a[0], b[0]), y0, Math.min(a[2], b[2]), Math.max(a[0], b[0]), y1, Math.max(a[2], b[2]),
            { colour: shade(CHAR, 0.8 + look() * 0.45), ...(solid ? {} : { decor: true }) });
          // the snow on a course where it is the head of the wall
          if (snow && pr[Math.min(n - 1, Math.floor((i + j) / 2))] === k + 1) {
            const p = facePoint(f, u0 + 0.05, y1, -0.03 - LD + 0.02), q = facePoint(f, u1 - 0.05, y1 + 0.06 + look() * 0.04, -0.05);
            sink.span('plaster', Math.min(p[0], q[0]), y1, Math.min(p[2], q[2]), Math.max(p[0], q[0]), q[1], Math.max(p[2], q[2]), snowOn);
          }
          i = j;
        }
      }
    }
    // the door's charred posts on the threshold stone, one burnt short
    {
      const f = faces.front;
      faceBox(sink, 'stone', f, door, 0.12, 0.3, 1.3, 0.24, 0.6, { decor: true, shade: 0.9 });
      for (const s of [-1, 1]) {
        const top = F0 + (s > 0 ? 1.15 + look() * 0.4 : 1.55 + look() * 0.4);
        faceBox(sink, 'structureWood', f, door + s * 0.58, (F0 + top) / 2, -0.15, 0.16, top - F0, 0.2, { colour: shade(CHAR, 1.1), decor: true });
      }
    }
    // the stove (piec) whitewashed in the middle of it, its bench ledge (przypiecek), its hearth mouth framed and sooted,
    // the iron plate on its top with its rings and a pot left on it
    const scx = (rng() - 0.5) * W * 0.15, scz = (rng() - 0.5) * D * 0.12, sTop = 1.45;
    sink.span('plaster', scx - 0.85, 0.24, scz - 0.8, scx + 0.85, sTop, scz + 0.8);
    sink.span('plaster', scx + 0.85, 0.24, scz - 0.8, scx + 1.45, 0.75, scz + 0.8);
    const sf: Face = { origin: [scx, 0, scz + 0.8], u: [1, 0, 0], out: [0, 0, 1], width: 1.7 };
    for (const s of [-1, 1]) faceBox(sink, 'plaster', sf, s * 0.38, 0.78, 0.03, 0.15, 0.56, 0.06, { decor: true });
    faceBox(sink, 'plaster', sf, 0, 1.12, 0.035, 0.92, 0.13, 0.07, { decor: true });
    faceBox(sink, 'structureWood', sf, 0, 0.78, 0.004, 0.6, 0.56, 0.008, { colour: CHAR, decor: true });
    faceBox(sink, 'plaster', sf, 0, 1.31, 0.005, 0.7, 0.24, 0.01, { decor: true, shade: 0.45 });
    sink.span('structureMetal', scx - 0.78, sTop, scz - 0.1, scx + 0.12, sTop + 0.03, scz + 0.72, { colour: RUST, decor: true });
    for (const [dx, r] of [[-0.55, 0.13], [-0.17, 0.11]] as const) sink.cylinder('structureMetal', [scx + dx, sTop + 0.03, scz + 0.32], 'y', 0.012, r, 12, { colour: shade(RUST, 0.8), decor: true, fine: true });
    sink.cylinder('structureMetal', [scx - 0.55, sTop + 0.042, scz + 0.32], 'y', 0.2, 0.16, 10, { colour: IRON, decor: true }, 0.17);
    // the chimney breast over the stove's back half, its shoulder, the stack: scorched where the roof burnt round it,
    // sooted at its mouth, the oversailing course and the granite cap
    const kx = scx + 0.3, kz = scz - 0.35, T = 5.6 + rng() * 0.8, K = 0.31;
    sink.span('plaster', kx - 0.5, sTop, kz - 0.45, kx + 0.5, 2.7, kz + 0.45);
    sink.cylinder('plaster', [kx, 2.7, kz], 'y', 0.4, 0.45 * Math.SQRT2, 4, { decor: true }, K * Math.SQRT2, true, Math.PI / 4);
    const stackBand = (y0: number, y1: number, opts: { shadeAt?: (p: Vec3) => number; shade?: number }) => sink.span('plaster', kx - K, y0, kz - K, kx + K, y1, kz + K, opts);
    stackBand(2.7, 3.4, {});
    stackBand(3.4, 4.5, { shadeAt: (p) => (p[1] < 3.9 ? 0.62 : 0.88) });
    stackBand(4.5, T - 0.7, {});
    stackBand(T - 0.7, T, { shadeAt: (p) => (p[1] > T - 0.05 ? 0.42 : 0.72) });
    sink.span('plaster', kx - K - 0.055, T - 0.38, kz - K - 0.055, kx + K + 0.055, T - 0.24, kz + K + 0.055, { decor: true, shade: 0.6 });
    sink.span('stone', kx - K - 0.09, T, kz - K - 0.09, kx + K + 0.09, T + 0.1, kz + K + 0.09);
    // the roof fallen in (the sheet of shingle from the breast's back down into the ash, its rafters under it)
    {
      const z0 = scz - 0.82, L = Math.min(2.4, z0 + iz - 0.15), y0 = sTop + 0.02, y1 = 0.3;
      const at = (x: number, t: number, off: number): Vec3 => {
        const len = Math.hypot(y0 - y1, L), ny = L / len, nz = -(y0 - y1) / len;
        return [scx + x, y0 - t * (y0 - y1) + ny * off, z0 - t * L + nz * off];
      };
      const outline: Array<[number, number]> = [[-0.7 + look() * 0.2, 0], [0.9 + look() * 0.2, 0], [1.4, 0.45], [1.0 + look() * 0.3, 1], [-0.9 - look() * 0.3, 1], [-1.2, 0.5]];
      const ln = Math.hypot(y0 - y1, L), n: Vec3 = [0, L / ln, -(y0 - y1) / ln];
      prismAuto(sink, 'roof', outline.map(([x, t]) => at(x, t, 0)), n, 0.08, { decor: true, shade: 0.5 });
      for (const x of [-0.6, 0.15, 0.9]) sink.member('structureWood', at(x, 0.02, -0.07), at(x, 0.98, -0.07), 0.12, 0.12, [1, 0, 0], { colour: CHAR, decor: true, exposed: true }, 0.06);
      if (snow) prismAuto(sink, 'plaster', outline.map(([x, t]) => at(x * 0.92, 0.04 + t * 0.92, 0.09)), n, 0.12, snowOn);
    }
    // the ridge purlin down from the standing corner's head into the ash, two rafters leant on the stack, the main beam
    // (the sosrąb) fallen across the stove
    {
      const endName = csz > 0 ? 'front' : 'back', ue = endName === 'front' ? csx * (hw - 0.6) : -csx * (hw - 0.6);
      const a: Vec3 = [csx * (hw - 0.6), topAt(endName, ue) + 0.11, csz * (hd - 0.16)];
      const b: Vec3 = [csx * (ix - 0.5), 0.39, -csz * (iz - 0.5)];
      sink.member('structureWood', a, b, 0.22, 0.22, [1, 0, 0], { colour: shade(CHAR, 1.15), decor: true, exposed: true }, 0.11);
      for (const s of [-1, 1]) {
        const r = clamp(ix - 0.2 - s * kx, 1.2, 2.2);
        sink.member('structureWood', [kx + s * r, 0.3, kz + 0.2 * s], [kx + s * (K + 0.07), 3.3 + look() * 0.6, kz + 0.1 * s], 0.12, 0.14, [0, 0, 1],
          { colour: shade(CHAR, 0.9 + look() * 0.3), decor: true, exposed: true }, 0.07);
      }
      const bz = Math.min(iz - 0.25, scz + 2.3);
      sink.member('structureWood', [scx - 0.35, sTop + 0.17, scz + 0.55], [scx - 1.6, 0.42, bz], 0.28, 0.3, [1, 0, 0], { colour: shade(SCORCH, 0.9), decor: true, exposed: true }, 0.15);
    }
    // the heaps of ash and charred shingle in the cellar's corners and before the stove, the snow on their crowns
    {
      const spots: Array<[number, number]> = [[-csx * (ix - 1.0), csz * (iz - 1.1)], [csx * (ix - 1.1), -csz * (iz - 1.0)], [scx + (look() - 0.5), scz + 1.6]];
      for (const [x, z] of spots) {
        const rx = 0.7 + look() * 0.4, rz = 0.6 + look() * 0.4, h = 0.35 + look() * 0.3;
        const tw = look() * 3;
        mound(sink, [clamp(x, -ix + rx, ix - rx), 0.26, clamp(z, -iz + rz, iz - rz)], [1, 0, 0], [0, 0, 1], rx, rz, h, look() < 0.5 ? ASH : shade(CHAR, 1.4), { decor: true }, tw, 6);
        if (snow) mound(sink, [clamp(x, -ix + rx, ix - rx), 0.26 + h * 0.48, clamp(z, -iz + rz, iz - rz)], [1, 0, 0], [0, 0, 1], rx * 0.95, rz * 0.95, h * 0.55, SNOW, { decor: true }, tw, 6);
      }
    }
    // the iron bedstead left in the ash by the wall across from the standing corner: its head and foot frames, their bars,
    // the side rails
    {
      const bx = -csx * (ix - 0.6), bz = -csz * (iz - 1.5), y = 0.26, c = { colour: RUST, decor: true } as const;
      for (const [ez, hgt] of [[-0.95, 1.1], [0.95, 0.82]] as const) {
        const z = bz + ez * csz;
        for (const s of [-1, 1]) sink.span('structureMetal', bx + s * 0.47 - 0.025, y, z - 0.025, bx + s * 0.47 + 0.025, y + hgt, z + 0.025, c);
        for (const ry of [hgt - 0.05, 0.5]) sink.span('structureMetal', bx - 0.45, y + ry - 0.02, z - 0.015, bx + 0.45, y + ry + 0.02, z + 0.015, c);
        for (let k = 1; k < 5; k++) sink.span('structureMetal', bx - 0.45 + k * 0.18 - 0.01, y + 0.52, z - 0.01, bx - 0.45 + k * 0.18 + 0.01, y + hgt - 0.07, z + 0.01, { ...c, fine: true });
      }
      for (const s of [-1, 1]) sink.span('structureMetal', bx + s * 0.47 - 0.02, y + 0.32, bz - 0.93, bx + s * 0.47 + 0.02, y + 0.38, bz + 0.93, c);
    }
    if (snow) {
      // January's snow on the footing's inner ledge, the stove's top and ledge and the cap, drifted against the footing
      for (const sz of [-1, 1]) sink.span('plaster', -ix + 0.02, F0, sz > 0 ? iz - 0.02 : -iz, ix - 0.02, F0 + 0.07, sz > 0 ? iz : -iz + 0.02, snowOn);
      sink.span('plaster', scx + 0.87, 0.75, scz - 0.78, scx + 1.43, 0.84, scz + 0.78, snowOn);
      sink.span('plaster', scx - 0.83, sTop, scz - 0.78, scx - 0.2, sTop + 0.08, scz - 0.12, snowOn);
      sink.span('plaster', kx - K - 0.07, T + 0.1, kz - K - 0.07, kx + K + 0.07, T + 0.18, kz + K + 0.07, snowOn);
      for (const name of ['back', 'left', 'right'] as const) {
        const f = faces[name];
        drift(sink, f, -f.width / 2 - 0.2, f.width / 2 + 0.2, 0.05, 0.3 + look() * 0.25, 0.45 + look() * 0.1);
      }
      // inside, the snow blown in over the ash: banked in the lee of the footing's back and one side, lying in patches
      const inner: Face[] = [{ origin: [0, 0, -iz], u: [1, 0, 0], out: [0, 0, 1], width: 2 * ix }, { origin: [csx * ix, 0, 0], u: [0, 0, csx], out: [-csx, 0, 0], width: 2 * iz }];
      for (const f of inner) drift(sink, f, -f.width / 2, f.width / 2 - 0.4, 0.28, 0.18 + look() * 0.14, 0.7 + look() * 0.4);
      for (let k = 0; k < 3; k++) {
        const x = (look() - 0.5) * (2 * ix - 2.2), z = (look() - 0.5) * (2 * iz - 2.2), r = 0.6 + look() * 0.5;
        sink.cylinder('plaster', [x, 0.27, z], 'y', 0.05, r, 7, snowOn, r * 0.8, true, look() * 2);
      }
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
