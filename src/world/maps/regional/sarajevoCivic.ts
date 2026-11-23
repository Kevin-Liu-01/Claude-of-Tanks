// src/world/maps/regional/sarajevoCivic.ts — the Sarajevo kit's public buildings and places of worship (sarajevo.ts), each
// in the footprint of the landmark it replaces:
//   - civichall on the boulevard → the National Museum's neo-Renaissance pavilion (Zemaljski muzej): a rusticated
//     ground storey, the piano nobile under its cornice, corner pavilions, the entrance pavilion's pediment and its
//     copper dome holed by a shell; up the slope → the City Hall and National Library (Vijećnica), the pseudo-Moorish
//     block of ochre and red bands with horseshoe arches, crenellated parapet and corner turrets, burnt out on 25-26
//     August 1992 — its central hall's dome down to its bare ribs;
//   - firestation → a mahala mosque: the prayer hall of stone or whitewash under a lead dome or a hipped tile roof, its
//     portico of arches on slender columns, the pencil minaret with its balcony and lead cone, the harem's white nišani
//     inside a low wall;
//   - factory → a Serbian Orthodox church: the nave under copper, a drum and dome over its centre, the apse, the bell
//     tower over the west door, bands of red across the render;
//   - foundryoffice → a Catholic church: a neo-Gothic nave of stone with lancets between buttresses under a steep tile
//     roof, the tower and its spire over the door;
//   - warehouse → the Austro-Hungarian market hall: an ochre hall with tall arched windows in two tiers, the great
//     arched entrance in the gable under a clock, a clerestory lantern along the ridge;
//   - depot → a čaršija row: single-storey timber shops under one deep-eaved tile roof, their ćepenci (shutters)
//     closed for the siege, a whitewashed han storey over one end.
import { PartSink, faceBox, facePanel, facePoint, normalize3, rgb, shade, type EmitOptions, type Face, type RegionalBucket, type RegionalParts, type Rgb, type Vec3 } from './geometry.ts';
import { domeSegments, polygonalDome, smoothDome } from './domes.ts';
import {
  buildHouse, emitRoof, holedBox, holedPolygon, layRoofRelief, recordShaft, reliefFlat, reliefSlope, roofGeometry, windowRhythm, type HouseDialect, type HouseFrame,
  type Opening, type RoofSpec,
} from './house.ts';
import { doorUnit, gateUnit, windowUnit, type DoorStyle, type WindowStyle } from './openings.ts';
import type { RegionalBuildContext, RegionalBuilder } from './types.ts';
import {
  AH_FRAME, CHAR, COPPER, DARK_FRAME, DOOR_LEAVES, HESSIAN, IRON, LEAD, PLAIN_TILES, SEAMED, TIMBER, ZINC,
  archGlazing, archHead, choose, clampTo, feltDeck, fillOf, nisan, openBelfry, pediment, shellPocks,
} from './sarajevoParts.ts';

function uvOffset(ctx: RegionalBuildContext): [number, number] {
  return [ctx.rng() * 7.31, ctx.rng() * 5.17];
}

const RED_BAND = rgb(0x9a4632), GILT = rgb(0xb8933e);

const STONE_WINDOW: WindowStyle = {
  frame: AH_FRAME, frameWidth: 0.07, frameOut: 0.05, bars: 'cross',
  surround: { bucket: 'stone', width: 0.18, out: 0.07, lintel: 0.26 }, sill: { bucket: 'stone', out: 0.12 }, shutters: null,
};

/**
 * A dome of sheet metal over (x, y0, z): a hemisphere of radius r, a little stilted, its foot dressed by a drip ring and
 * — on a dome of two metres or more — the standing seams down it, turned smooth (domes.ts; dome-detail-275: it was four
 * stacked rings of twelve flat facets, the largest dome in the game the coarsest). `segments` is a floor (the shell takes
 * at least domes.ts's). Returns the crown's height.
 */
function dome(sink: PartSink, x: number, y0: number, z: number, r: number, colour: Rgb, segments = 12, decor = false, octagonal = false): number {
  const emit = { colour, ...(decor ? { decor: true } : {}) };
  // an octagonal turret's cupola: the polygonal cloister vault over its eight faces (domes.ts polygonalDome)
  if (octagonal) return polygonalDome(sink, 'structureMetal', x, y0, z, r, 8, emit, Math.PI / 8);
  const shell = smoothDome(sink, 'structureMetal', x, y0, z, r, { stilt: 0.08, segments, emit });
  sink.revolve('structureMetal', [x, y0, z], 'y', [[-0.03, r + 0.08], [0.09, r + 0.08], [0.09, r]], domeSegments(r), { colour: shade(colour, 0.85), decor: true });
  if (r >= 2) {
    // the standing seams: a rib from the drip ring to the crown's ring on every second gore
    const ribs = Math.round(r * 2) * 2, rows = 4;
    for (let k = 0; k < ribs; k++) {
      const phi = (k + 0.5) * Math.PI * 2 / ribs;
      for (let i = 0; i < rows; i++) {
        const e0 = (Math.PI / 2) * 0.92 * i / rows, e1 = (Math.PI / 2) * 0.92 * (i + 1) / rows;
        sink.member('structureMetal', shell.surface(e0, phi, 0.015), shell.surface(e1, phi, 0.015), 0.05, 0.05, shell.normal((e0 + e1) / 2, phi),
          { colour: shade(colour, 1.12), decor: true, fine: true }, 0.02);
      }
    }
  }
  return shell.top;
}

/** A finial: a slim mast with a cross (church) or the alem's balls and crescent (mosque). */
function finial(sink: PartSink, x: number, y: number, z: number, kind: 'cross' | 'alem', scale = 1): void {
  const c = { colour: GILT, decor: true } as const;
  sink.cylinder('structureMetal', [x, y - 0.1, z], 'y', 1.6 * scale, 0.04 * scale, 5, c);
  if (kind === 'cross') {
    sink.span('structureMetal', x - 0.04 * scale, y + 0.9 * scale, z - 0.35 * scale, x + 0.04 * scale, y + 1.0 * scale, z + 0.35 * scale, c);
    return;
  }
  for (const [h, r] of [[0.45, 0.14], [0.85, 0.11]] as const) sink.cylinder('structureMetal', [x, y + h * scale - r * scale, z], 'y', r * 2 * scale, r * scale, 6, c, r * scale);
  sink.span('structureMetal', x - 0.03, y + 1.25 * scale, z - 0.18 * scale, x + 0.03, y + 1.55 * scale, z + 0.18 * scale, c);
}

// ------------------------------------------------------------------------------------------------ (dome-detail-275) shared craft

const lerp3 = (a: Vec3, ka: number, b: Vec3, kb: number): Vec3 => [a[0] * ka + b[0] * kb, a[1] * ka + b[1] * kb, a[2] * ka + b[2] * kb];
const cross3 = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/**
 * (dome-detail-275) A polygon wound to face `toward`, fanned from its first point (kept first when it turns: a spandrel's
 * fan from its corner).
 */
function facing(sink: PartSink, bucket: RegionalBucket, pts: Vec3[], toward: Vec3, opts: EmitOptions): void {
  const n = cross3(lerp3(pts[1], 1, pts[0], -1), lerp3(pts[2], 1, pts[0], -1));
  sink.polygon(bucket, n[0] * toward[0] + n[1] * toward[1] + n[2] * toward[2] >= 0 ? pts : [pts[0], ...pts.slice(1).reverse()], opts);
}

/**
 * (dome-detail-275) A two-centred (equilateral) pointed arch of span 2R springing at (u, spring), its curve at `rho` from
 * the centres (2R: the intrados; more: a ring outside it), `o` out of the face: the right springing, up to the apex, down
 * to the left springing (2n + 1 points). Its apex stands sqrt(rho² - R²) over the springing line.
 */
function pointedArc(face: Face, u: number, spring: number, R: number, rho: number, o: number, n: number): Vec3[] {
  const tA = Math.acos(Math.min(1, R / rho)), pts: Vec3[] = [];
  for (let j = 0; j <= n; j++) { const t = tA * j / n; pts.push(facePoint(face, u - R + rho * Math.cos(t), spring + rho * Math.sin(t), o)); }
  for (let j = n - 1; j >= 0; j--) { const t = tA * j / n; pts.push(facePoint(face, u + R - rho * Math.cos(t), spring + rho * Math.sin(t), o)); }
  return pts;
}
const pointedRise = (R: number, rho = 2 * R) => Math.sqrt(rho * rho - R * R);

/**
 * (dome-detail-275) The stone filling a rectangular cut's head to a pointed arch (pointedArc's intrados): each spandrel
 * at `o`, with `depth` its face that far forward and the arch's soffit between (a lancet cut true to its point).
 */
function pointedSpandrels(sink: PartSink, bucket: RegionalBucket, face: Face, u: number, spring: number, R: number, o: number, depth: number,
  opts: EmitOptions, n = 4): void {
  const arc = pointedArc(face, u, spring, R, 2 * R, o, n), top = spring + pointedRise(R);
  const fwd = (p: Vec3): Vec3 => [p[0] + face.out[0] * depth, p[1], p[2] + face.out[2] * depth];
  for (const e of [-1, 1]) {
    const half = e > 0 ? arc.slice(0, n + 1) : arc.slice(n), corner = facePoint(face, u + e * R, top, o);
    facing(sink, bucket, [corner, ...half].map(fwd), face.out, opts);
    if (depth <= 0) continue;
    for (let j = 0; j < n; j++) {
      const a = half[j], b = half[j + 1], mid = lerp3(a, 0.5, b, 0.5), c = facePoint(face, u, spring, o);
      facing(sink, bucket, [a, b, fwd(b), fwd(a)], [c[0] - mid[0], c[1] - mid[1], c[2] - mid[2]], opts);
    }
  }
}

/** (dome-detail-275) A pointed arch's ring of faces `o` out of a face: inner curve `rho`, `w` wide (a hood mould, an archivolt). */
function pointedRing(sink: PartSink, bucket: RegionalBucket, face: Face, u: number, spring: number, R: number, rho: number, w: number, o: number,
  opts: EmitOptions, n = 4): void {
  const a = pointedArc(face, u, spring, R, rho, o, n), b = pointedArc(face, u, spring, R, rho + w, o, n);
  for (let j = 0; j + 1 < a.length; j++) facing(sink, bucket, [a[j], b[j], b[j + 1], a[j + 1]], face.out, { ...opts, shade: (opts.shade ?? 1) * (j % 2 ? 0.9 : 1) });
}

/** (dome-detail-275) A pointed head's glass (or stone): the arch's field over its springing line. */
function pointedField(sink: PartSink, bucket: RegionalBucket, face: Face, u: number, spring: number, R: number, o: number, opts: EmitOptions, n = 3): void {
  facing(sink, bucket, [facePoint(face, u, spring, o), ...pointedArc(face, u, spring, R, 2 * R, o, n)], face.out, opts);
}

/**
 * (dome-detail-275) A buttress's weathering: the sloped stone from `d0` out of the face at y back to `d1` at y + rise, `w`
 * wide at u (its foot on the stage under it, its back on the stage over it or the wall).
 */
function weathering(sink: PartSink, bucket: RegionalBucket, face: Face, u: number, w: number, y: number, d0: number, d1: number, rise: number, opts: EmitOptions): void {
  const P = (uu: number, o: number, yy: number) => facePoint(face, uu, yy, o), a = u - w / 2, b = u + w / 2;
  facing(sink, bucket, [P(a, d0, y), P(b, d0, y), P(b, d1, y + rise), P(a, d1, y + rise)], [face.out[0] * rise, d0 - d1, face.out[2] * rise], opts);
  for (const [s, e] of [[a, -1], [b, 1]] as const) facing(sink, bucket, [P(s, d1, y), P(s, d0, y), P(s, d1, y + rise)], [face.u[0] * e, 0, face.u[2] * e], opts);
}

/**
 * (dome-detail-275) A stepped buttress on a face: `stages` of [top, depth, width], each stage's weathering sloping back to
 * the next (the last back to the wall). The first stage is solid; the rest dressing.
 */
function buttress(sink: PartSink, bucket: RegionalBucket, face: Face, u: number, foot: number, stages: ReadonlyArray<readonly [number, number, number]>,
  decor = false): void {
  let y = foot;
  stages.forEach(([top, d, w], i) => {
    const next = stages[i + 1], rise = Math.min(0.5, d * 0.7);
    faceBox(sink, bucket, face, u, (y + top) / 2, (d - 0.1) / 2, w, top - y, d + 0.1, decor || i > 0 ? { decor: true } : {}, { back: true });
    weathering(sink, bucket, face, u, w, top, d, next ? next[1] : 0, rise, { decor: true, shade: 0.9 });
    y = top + rise;
  });
}

type RoofG = HouseFrame['roof'];

/** (dome-detail-275) A roof slope in its own terms: `v` up it from the eave's edge, `t` along it, `h` off the covering. */
interface Slope { at: (v: number, t: number, h: number) => Vec3; n: Vec3; up: Vec3; along: Vec3; lim: (v: number) => number; reach: number; side: 1 | -1; end: boolean; closes: boolean }

function slopeOf(rg: RoofG, roof: RoofSpec, side: 1 | -1, end: boolean): Slope {
  const cosP = 1 / Math.hypot(1, rg.tanP), sinP = rg.tanP * cosP, xe = rg.s + roof.eave;
  const D = rg.halfD + (rg.hipVerge ?? roof.verge), hip = rg.kind === 'hip', run = Math.max(0.01, D - rg.ridgeHalf);
  if (end) {
    // a hip end at its own pitch (a steeper hip where the body is wider across its ridge than along it)
    const tH = rg.hipTan ?? rg.tanP, cosH = 1 / Math.hypot(1, tH), sinH = tH * cosH, ye = rg.topAt(0, side * D) ?? rg.eaveY;
    return {
      at: (v, t, h) => [t, ye + sinH * v + cosH * h, side * (D - cosH * v + sinH * h)], n: [0, cosH, side * sinH], up: [0, sinH, -side * cosH],
      along: [1, 0, 0], lim: (v) => xe * (1 - cosH * v / run), reach: run / cosH, side, end, closes: true,
    };
  }
  const ye = rg.topAt(side * xe, 0) ?? rg.eaveY;
  const up: Vec3 = [-side * cosP, sinP, 0], n: Vec3 = [side * sinP, cosP, 0];
  return {
    at: (v, t, h) => [side * xe + up[0] * v + n[0] * h, ye + up[1] * v + n[1] * h, t], n, up, along: [0, 0, 1],
    lim: (v) => (hip ? D - run * cosP * v / xe : D), reach: (rg.kind === 'shed' ? 2 * rg.s + roof.eave : xe) / cosP, side, end, closes: hip,
  };
}

function slopesOf(rg: RoofG, roof: RoofSpec): Slope[] {
  if (rg.kind !== 'gable' && rg.kind !== 'hip' && rg.kind !== 'shed') return [];
  const out = rg.kind === 'shed' ? [slopeOf(rg, roof, 1, false)] : [slopeOf(rg, roof, 1, false), slopeOf(rg, roof, -1, false)];
  if (rg.kind === 'hip' && rg.ridgeHalf < rg.halfD + (rg.hipVerge ?? roof.verge) - 0.05) out.push(slopeOf(rg, roof, 1, true), slopeOf(rg, roof, -1, true));
  return out;
}

/** (dome-detail-275) Where war wear stripped a roof (HouseFrame.roofPatch) on a slope, in its v/t terms, or null. */
function patchOn(sl: Slope, rg: RoofG, roof: RoofSpec, hole: HouseFrame['roofPatch']): { v0: number; v1: number; t0: number; t1: number } | null {
  if (!hole || sl.end || hole.side !== sl.side) return null;
  const cosP = 1 / Math.hypot(1, rg.tanP), xe = rg.s + roof.eave, pad = 0.06;
  return { v0: (xe - hole.x1 - pad) / cosP, v1: (xe - hole.x0 + pad) / cosP, t0: hole.z0 - pad, t1: hole.z1 + pad };
}

/**
 * (dome-detail-275) The plain tiles' (or slates') courses in relief: each course's butt a step `b` high across the slope
 * thinning up to the next, in lengths of a few metres a shade apart; left open over the patch the war stripped.
 */
function roofCourses(sink: PartSink, rg: RoofG, roof: RoofSpec, hole: HouseFrame['roofPatch'], look: () => number, course = 0.32, b = 0.035): void {
  const cosP = 1 / Math.hypot(1, rg.tanP);
  for (const sl of slopesOf(rg, roof)) {
    const top = rg.kind === 'shed' ? sl.reach - 0.04 : sl.reach - 0.1 / cosP, gap = patchOn(sl, rg, roof, hole);
    for (let v = course + 0.04; v < top - 0.25; v += course) {
      const lv = sl.lim(v), len = course * 1.05;
      const runs: Array<[number, number]> = gap && v + len > gap.v0 && v < gap.v1 ? [[-lv, gap.t0], [gap.t1, lv]] : [[-lv, lv]];
      for (const [c0, c1] of runs) for (let t = c0; t < c1 - 0.2;) {
        // (dome-detail-275, the roof sweep) each run's tone within the covering's ±12 % (it ran to 16 % under)
        const w = Math.min(c1 - t, 3.5 + look() * 3.5), tone = 0.88 + look() * 0.16, vv = v + (look() - 0.5) * 0.03;
        const l0 = sl.lim(vv), l1 = sl.lim(vv + len), a0 = Math.max(t, -l0), a1 = Math.min(t + w, l0), e0 = Math.max(t, -l1), e1 = Math.min(t + w, l1);
        if (a1 - a0 > 0.2 && e1 - e0 > 0.05) {
          const o: EmitOptions = { decor: true, fine: true, shade: tone };
          const A0 = sl.at(vv, a0, -0.01), A1 = sl.at(vv, a1, -0.01), B0 = sl.at(vv, a0, b), B1 = sl.at(vv, a1, b), C0 = sl.at(vv + len, e0, -0.01), C1 = sl.at(vv + len, e1, -0.01);
          facing(sink, 'roof', [A0, A1, B1, B0], lerp3(sl.up, -1, sl.n, 0), o);
          facing(sink, 'roof', [B0, B1, C1, C0], sl.n, o);
          if (t === c0 || a0 > t || e0 > t) facing(sink, 'roof', [A0, B0, C0], lerp3(sl.along, -1, sl.n, 0), o);
          if (t + w >= c1 || a1 < t + w || e1 < t + w) facing(sink, 'roof', [A1, B1, C1], sl.along, o);
        }
        t += w;
      }
    }
  }
}

/** The canal tiles' cover rows apart, their radius. */
const ROLL_PITCH = 0.3, ROLL_R = 0.085;
/** A cover row's section (along, off the covering) × ROLL_R: a half-round in three facets, its feet bedded in the pans. */
const ROLL: ReadonlyArray<readonly [number, number]> = [[1, -0.15], [0.5, 0.72], [-0.5, 0.72], [-1, -0.15]];

/**
 * (dome-detail-275) The canal tiles (ćeramida) in relief: the cover rows down each slope a hand apart, each its own
 * tone, their mouths dark along the eave, run under the ridge or cut at the hip; a block of rows relaid in newer tiles;
 * left open over the patch the war stripped.
 */
function canalTiles(sink: PartSink, rg: RoofG, roof: RoofSpec, hole: HouseFrame['roofPatch'], look: () => number): void {
  const cosP = 1 / Math.hypot(1, rg.tanP);
  for (const sl of slopesOf(rg, roof)) {
    const top = rg.kind === 'shed' ? sl.reach - 0.04 : sl.reach - 0.1 / cosP, gap = patchOn(sl, rg, roof, hole);
    const L = sl.lim(0), span = 2 * L - 0.16;
    const rw = 0.8 + look() * 1.5, rv = look() * top * 0.55, rt = (look() - 0.5) * Math.max(0, span - rw);
    const relaid = look() < 0.75 ? { t0: rt - rw / 2, t1: rt + rw / 2, v0: rv, v1: rv + 0.9 + look() * 1.3 } : null;
    const n = Math.max(2, Math.round(span / ROLL_PITCH));
    for (let k = 0; k < n; k++) {
      // (dome-detail-275, the roof sweep) each row's tone within the covering's ±12 % (it ran to 20 % under)
      const t = -L + 0.08 + (k + 0.5) * span / n + (look() - 0.5) * 0.024, tone = 0.88 + look() * 0.2;
      const vEnd = sl.closes ? Math.min(top, (L - Math.abs(t) - ROLL_R) / Math.max(1e-3, L - sl.lim(1))) : top;
      if (vEnd < 0.3) continue;
      const spans: Array<[number, number]> = gap && t + ROLL_R > gap.t0 && t - ROLL_R < gap.t1 ? [[-0.05, Math.min(vEnd, gap.v0)], [gap.v1, vEnd]] : [[-0.05, vEnd]];
      for (const [a, c] of spans) {
        if (c - a < 0.2) continue;
        const cuts = relaid && t > relaid.t0 && t < relaid.t1 ? [a, Math.min(c, Math.max(a, relaid.v0)), Math.min(c, Math.max(a, relaid.v1)), c] : [a, c];
        const pieces: Array<[number, number, number]> = [];
        for (let i = 0; i + 1 < cuts.length; i++) if (cuts[i + 1] - cuts[i] > 0.05) pieces.push([cuts[i], cuts[i + 1], cuts.length > 2 && i === 1 ? 1.1 : tone]);
        pieces.forEach(([p0, p1, tn], i) => {
          const ring = (v: number): Vec3[] => ROLL.map(([x, y]) => sl.at(v, t + x * ROLL_R, y * ROLL_R));
          const lo = ring(p0), hi = ring(p1), o: EmitOptions = { decor: true, shade: tn };
          for (let j = 0; j + 1 < ROLL.length; j++) {
            const ax = (ROLL[j][0] + ROLL[j + 1][0]) / 2, ay = (ROLL[j][1] + ROLL[j + 1][1]) / 2;
            facing(sink, 'roof', [lo[j], lo[j + 1], hi[j + 1], hi[j]], lerp3(sl.along, ax, sl.n, ay + 0.3), o);
          }
          const mouth = i ? 0 : a < 0 ? 0.42 : 0.7;
          if (mouth > 0) facing(sink, 'roof', lo, lerp3(sl.up, -1, sl.n, 0), { decor: true, shade: tn * mouth });
          if (i === pieces.length - 1 && p1 < top - 0.01) facing(sink, 'roof', hi, sl.up, o);
        });
      }
    }
  }
}

// ------------------------------------------------------------------------------------------------ the museum

/** The museum's neo-Renaissance pavilion (turned: its long front faces the boulevard, +z). */
function museum(ctx: RegionalBuildContext): RegionalParts {
  const sink = new PartSink(uvOffset(ctx));
  const f = fillOf(ctx.bounds, 0.15);
  sink.placed(0, f.cx, 0, f.cz, () => {
    const rng = ctx.rng, look = ctx.variant, mobile = ctx.tier === 'mobile';
    const W = clampTo(f.w, 6, 60), D = clampTo(f.d, 6, 60);
    // (the corner pavilions stand 0.7 m proud of the front under 0.4 m eaves: the entrance pavilion at least as far)
    const rw = clampTo(W * 0.14, 1.4, 4.6), proj = clampTo(D * 0.09, 1.1, 2.0), pw = clampTo(W * 0.16, 1.5, 5.4), dr = clampTo(rw * 0.72, 1.0, 3.3);
    // the hipped roof's eave at the lot's back and side edges, the entrance pavilion's pediment at its street edge
    const bd = clampTo(D - 0.6 - proj, 4, 24), bz = -D / 2 + 0.6 + bd / 2;
    const g0 = 5.0, g1 = 5.4;
    const door = choose(rng(), DOOR_LEAVES);
    const openings: Opening[] = [];
    // (props census #9: the corner pavilions stand over the house's ends, its end walls and the long walls' last bays
    // inside them: no windows there, they were cut into the pavilions' cores)
    const inner = (W - 1.2) / 2 - pw, ends: Array<[number, number]> = [[-W, -inner], [inner, W]];
    for (const o of windowRhythm('left', 0, W, { w: 1.5, h: 2.5, sill: 1.1, spacing: 3.6, margin: 2.2, avoid: [[-3.4, 3.4], ...ends] })) openings.push(o);
    for (const o of windowRhythm('left', 1, W, { w: 1.55, h: 3.0, sill: 0.8, spacing: 3.6, margin: 2.2, avoid: [[-3.4, 3.4], ...ends] })) openings.push(o);
    for (const i of [0, 1]) for (const o of windowRhythm('right', i, W, { w: 1.4, h: 2.4, sill: 1.1, spacing: 3.6, margin: 1.6, avoid: ends })) openings.push(o);
    const dialect: HouseDialect = {
      window: (s, face, o, y0) => {
        windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, STONE_WINDOW, look, 0.06);
        if (o.storey === 0 && face.out[0] < -0.5) archHead(s, face, o.u, y0 + o.y0 + o.h + 0.26, o.w / 2 + 0.18, 'stone', 0.2, 6);
      },
      door: (s, face, o, y0, frame) => doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { leaf: door, frame: { bucket: 'stone', width: 0.3, out: 0.1, arch: true }, transom: true,
        steps: { bucket: 'stone' }, leafKind: 'panel' }, frame.floors[o.storey] + o.y0),
    };
    sink.placed(Math.PI / 2, 0, 0, 0, () => sink.placed(0, -bz, 0, 0, () => {
      const frame = buildHouse(sink, {
        w: bd, d: W - 1.2, plinth: { h: 0.6, out: 0.08, bucket: 'stone' }, storeys: [{ h: g0, wall: 'stone' }, { h: g1, wall: 'plaster' }],
        roof: { kind: 'hip', pitchDeg: 27, eave: 0.6, verge: 0.6, thickness: 0.18, bucket: 'roof', ridge: 'saddle' }, gableBucket: 'plaster', openings,
        chimneys: [], gutters: { colour: ZINC }, verge: null, reveal: 0.3, rafters: null, spall: 'stone',
      }, dialect);
      const b = frame.bodies[0], eave = frame.eaveY;
      sink.band('stone', b.x0 - 0.1, frame.floors[1] - 0.3, b.z0 - 0.1, b.x1 + 0.1, frame.floors[1], b.z1 + 0.1, { decor: true });
      sink.band('stone', b.x0 - 0.3, eave - 0.7, b.z0 - 0.3, b.x1 + 0.3, eave - 0.1, b.z1 + 0.3, { decor: true });
      // (dome-detail-275) the plain tiles in courses; the ground storey's rusticated courses broken by its windows; the
      // piano nobile's pilasters between its windows on the street, their capitals under the cornice
      roofCourses(sink, frame.roof, frame.spec.roof, frame.roofPatch, look, 0.5);
      const runsOf = (half: number, cuts: Array<[number, number]>): Array<[number, number]> => {
        const out: Array<[number, number]> = [];
        let u = -half;
        for (const [a, c] of [...cuts].sort((p, q) => p[0] - q[0])) { if (a - u > 0.25) out.push([u, a]); u = Math.max(u, c); }
        if (half - u > 0.25) out.push([u, half]);
        return out;
      };
      for (const name of ['left'] as const) {
        const face = frame.faces[name], own = openings.filter((o) => o.face === name && o.storey === 0);
        for (let y = frame.floors[0] + 0.62; y < frame.floors[1] - 0.3; y += 0.62) {
          const cuts = own.filter((o) => y > frame.floors[0] + o.y0 - 0.2 && y < frame.floors[0] + o.y0 + o.h + o.w / 2 + 0.7).map((o): [number, number] => [o.u - o.w / 2 - 0.24, o.u + o.w / 2 + 0.24]);
          for (const [a, c] of runsOf(face.width / 2 + 0.02, cuts)) faceBox(sink, 'stone', face, (a + c) / 2, y, 0.02, c - a, 0.07, 0.04, { decor: true, shade: 0.86, fineSides: true }, { ends: true });
        }
      }
      const nus = openings.filter((o) => o.face === 'left' && o.storey === 1).map((o) => o.u).sort((p, q) => p - q);
      for (let i = 0; i + 1 < nus.length; i++) {
        if (nus[i + 1] - nus[i] > 4.5) continue;
        const u = (nus[i] + nus[i + 1]) / 2;
        faceBox(sink, 'plaster', frame.faces.left, u, (frame.floors[1] + 0.3 + eave - 0.95) / 2, 0.05, 0.5, eave - 1.25 - frame.floors[1], 0.1, { decor: true, shade: 1.06, fineSides: true });
        faceBox(sink, 'stone', frame.faces.left, u, eave - 0.85, 0.08, 0.66, 0.2, 0.16, { decor: true, fineSides: true });
      }
      // the piano nobile's pediments
      const street = frame.faces.left;
      for (const o of openings) if (o.face === 'left' && o.storey === 1 && !o.state) pediment(sink, street, o.u, frame.floors[1] + o.y0 + o.h + 0.28, o.w + 0.7, 0.42);
      // the corner pavilions: a storey taller, under their own hipped roofs; (props census #9) their windows cut through
      // their walls, the units in the reveals (they were laid on a solid span), the walls 3 cm proud of the house's back
      // and end walls (they ran in the house's planes: one face over another)
      const prev = 0.26;
      for (const s of [-1, 1]) {
        const pz0 = s > 0 ? b.z1 - pw : b.z0, pz1 = pz0 + pw, ph = eave + 1.6;
        const ys = [1.4, g0 + 0.9, eave - 0.2], hs = ys.map((y) => (y > eave - 1 ? 1.2 : 2.4));
        // (flush with the back wall: their roofs' eaves stay inside the main roof's)
        const pv = holedBox(sink, 'plaster', b.x0 - 0.7, s < 0 ? pz0 - 0.03 : pz0, b.x1 + 0.03, s > 0 ? pz1 + 0.03 : pz1, 0, ph,
          { left: ys.map((y, k) => ({ u0: -0.7, u1: 0.7, y0: y, y1: y + hs[k] })) }, 0.3, prev);
        sink.band('stone', b.x0 - 0.9, ph - 0.6, pz0 - 0.15, b.x1 + 0.2, ph, pz1 + 0.15, { decor: true });
        const cap: RoofSpec = { kind: 'hip', pitchDeg: 34, eave: 0.4, verge: 0.4, thickness: 0.16, bucket: 'roof', ridge: 'saddle' };
        sink.placed(0, (b.x0 - 0.7 + b.x1) / 2, 0, (pz0 + pz1) / 2, () => {
          const prg = roofGeometry(b.x1 - b.x0 + 0.7, pw, ph, cap);
          emitRoof(sink, prg, cap);
          roofCourses(sink, prg, cap, null, look, 0.5);
        });
        // (dome-detail-275) the quoins up the pavilion's outer street corner, long and short in turn
        const qx = b.x0 - 0.7, qz = s < 0 ? pz0 - 0.03 : pz1 + 0.03;
        for (let y = 0.05, k = 0; y + 0.5 < ph - 0.6; y += 0.62, k++) {
          const a = k % 2 ? 0.32 : 0.6, c = k % 2 ? 0.6 : 0.32;
          sink.quoin('stone', qx - 0.04, y, s < 0 ? qz - 0.04 : qz - c, qx + a, y + 0.55, s < 0 ? qz + c : qz + 0.04, -1, s, { decor: true, shade: 0.95 });
        }
        sink.recess = prev;
        try { ys.forEach((y, k) => windowUnit(sink, pv.left, 0, y, 1.4, hs[k], STONE_WINDOW, look, 0.05)); } finally { sink.recess = 0; }
      }
      // the entrance pavilion: taller, its pediment, the portal, the drum and the dome behind
      // (props census #9) its portal and windows cut through its walls, the leaf and the units in the reveals (they were
      // laid on a solid span); a pilaster that would stand over the portal is left out (a narrow pavilion's portal is
      // all its front)
      const ex0 = b.x0 - (proj - 0.35), rh = eave + 3.4, dh = Math.min(1.1, rw - 0.35), erev = 0.3;
      const eHoles = [{ u0: -dh, u1: dh, y0: 0, y1: 3.8 }];
      if (rw > 3.2) for (const du of [-0.63, 0.63]) for (const y of [1.6, g0 + 1.0]) eHoles.push({ u0: du * rw - 0.6, u1: du * rw + 0.6, y0: y, y1: y + 2.5 });
      const ef = holedBox(sink, 'plaster', ex0, -rw, b.x0 + dr, rw, 0, rh, { left: eHoles }, 0.36, erev).left;
      for (const du of [-0.9, -0.35, 0.35, 0.9]) {
        if (Math.abs(du * rw) - 0.31 < dh + 0.04) continue;
        faceBox(sink, 'stone', ef, du * rw, rh / 2, 0.12, 0.62, rh - 0.6, 0.24, { decor: true, fineSides: true });
      }
      faceBox(sink, 'stone', ef, 0, rh - 0.35, 0.2, 2 * rw + 0.4, 0.7, 0.4, { decor: true });
      const ped = [[-rw - 0.2, rh], [rw + 0.2, rh], [0, rh + rw * 0.48]] as const;
      sink.prism('stone', ped.map(([u, y]) => facePoint(ef, u, y, 0)), ef.out, 0.35);
      // (dome-detail-275) the pediment's raking cornice and the roundel in its tympanum
      for (const e of [-1, 1]) sink.member('stone', facePoint(ef, e * (rw + 0.3), rh - 0.03, 0.35), facePoint(ef, 0, rh + rw * 0.48 + 0.1, 0.35), 0.24, 0.12, ef.out, { decor: true }, 0.02);
      disc(sink, 'stone', ef, 0, rh + rw * 0.17, Math.min(0.6, rw * 0.15), 0.36, 10, { decor: true, shade: 0.82 });
      faceBox(sink, 'structureWood', ef, 0, 1.9, -erev + 0.034, 2 * dh, 3.8, 0.06, { colour: door, decor: true });
      archHead(sink, ef, 0, 3.8, dh, 'stone', 0.28);
      sink.recess = erev;
      try {
        if (rw > 3.2) for (const du of [-0.63, 0.63]) for (const y of [1.6, g0 + 1.0]) windowUnit(sink, ef, du * rw, y, 1.2, 2.5, STONE_WINDOW, look, 0.05);
      } finally { sink.recess = 0; }
      for (let k = 1; k <= 3; k++) sink.span('stone', ex0 - 0.45 * k, -0.3, -rw * 0.56 - 0.3 * k, ex0 - 0.45 * (k - 1), 0.6 - k * 0.15, rw * 0.56 + 0.3 * k, { decor: true });
      const dx = b.x0 + dr * 0.73, top = rh + 0.4;
      sink.cylinder('plaster', [dx, rh - 0.5, 0], 'y', 3.1, dr, 8, {}, dr, true, Math.PI / 8);
      // (dome-detail-275) the drum's arched lights between pilasters, the cornice under the dome (it was a blank octagon)
      const dap = dr * Math.cos(Math.PI / 8), dside = 2 * dr * Math.sin(Math.PI / 8), dlw = Math.min(0.32, dside * 0.18);
      for (let k = 0; k < 8; k++) {
        const t = k * Math.PI / 4, df: Face = { origin: [dx + Math.cos(t) * dap, 0, Math.sin(t) * dap], u: [Math.sin(t), 0, -Math.cos(t)], out: [Math.cos(t), 0, Math.sin(t)], width: dside };
        facePanel(sink, 'dark', df, 0, rh + 0.85, 0.01, 2 * dlw, 1.3, { decor: true });
        lunette(sink, 'dark', df, 0, rh + 1.5, dlw, 0.01, 5, { decor: true });
        arcRing(sink, df, 0, rh + 1.5, dlw, 0.1, 5);
        for (const e of [-1, 1]) faceBox(sink, 'plaster', df, e * (dside / 2 - 0.1), rh + 1.0, 0.03, 0.2, 2.9, 0.06, { decor: true, shade: 1.06, fineSides: true });
      }
      sink.cylinder('stone', [dx, rh + 2.32, 0], 'y', 0.28, dr + 0.12, 8, { decor: true }, dr + 0.12, true, Math.PI / 8);
      const dtop = dome(sink, dx, top + 2.2, 0, dr, COPPER, 12);
      sink.cylinder('structureMetal', [dx, dtop - 0.05, 0], 'y', 1.3, 0.5, 6, { colour: COPPER, decor: true }, 0.35);
      finial(sink, dx, dtop + 1.25, 0, 'cross', 0.8);
      // the shell's hole in the dome: the dark ragged breach, the copper's ribs across it
      const hole: Vec3[] = [];
      for (let j = 0; j < 7; j++) {
        const t = (j / 7) * Math.PI * 2, r = 0.8 + look() * 0.5;
        hole.push([dx - dr * 0.91 + Math.cos(t) * 0.12, top + 2.2 + dr * 0.36 + Math.sin(t) * r * dr / 3.3, Math.cos(t) * r * dr / 3.3]);
      }
      sink.polygon('dark', hole, { decor: true });
      sink.dressing(mobile, () => {
        shellPocks(sink, street, { u0: -W / 2 + 1, u1: W / 2 - 1, y0: 0.8, y1: eave - 1 }, 40 + Math.floor(look() * 30),
          openings.filter((o) => o.face === 'left').map((o) => ({ u0: o.u - o.w / 2 - 0.3, u1: o.u + o.w / 2 + 0.3, y0: frame.floors[o.storey] + o.y0 - 0.2, y1: frame.floors[o.storey] + o.y0 + o.h + 0.9 })), look, 'stone');
      });
    }));
  });
  return sink.finish();
}

// ------------------------------------------------------------------------------------------------ the Vijećnica

/** The City Hall and National Library: pseudo-Moorish bands and arches, crenellations, turrets, the burnt hall. */
function vijecnica(ctx: RegionalBuildContext): RegionalParts {
  const sink = new PartSink(uvOffset(ctx));
  const f = fillOf(ctx.bounds, 0.2);
  sink.placed(0, f.cx, 0, f.cz, () => {
    const rng = ctx.rng, look = ctx.variant, mobile = ctx.tier === 'mobile';
    // the corner turrets stand out of the walls by 0.46 of their radius: the walls stand in by that, the turrets on the fill
    const tr = clampTo(Math.min(f.w, f.d) * 0.07, 0.6, 1.3);
    const W = clampTo(f.w - 0.92 * tr, 6, 60), D = clampTo(f.d - 0.92 * tr, 6, 60);
    const sts = [5.0, 4.4, 4.4];
    const door = choose(rng(), DOOR_LEAVES);
    const openings: Opening[] = [{ face: 'left', storey: 0, kind: 'gate', u: 0, w: 3.0, y0: 0, h: 3.6, arch: {} }];
    for (let i = 0; i < 3; i++) {
      const w = i === 0 ? 1.4 : 1.3, h = i === 0 ? 2.3 : 2.0, sill = i === 0 ? 1.2 : 0.8;
      // (E10) round-headed windows: the house cuts their heads
      for (const face of ['left', 'right'] as const) for (const o of windowRhythm(face, i, W, { w, h, sill, spacing: 3.3, margin: 2.0, avoid: face === 'left' && i === 0 ? [[-2.2, 2.2]] : [] })) openings.push({ ...o, arch: {} });
      for (const face of ['front', 'back'] as const) for (const o of windowRhythm(face, i, D, { w, h, sill, spacing: 3.3, margin: 2.0 })) openings.push({ ...o, arch: {} });
    }
    // the fire: most of the upper storeys' windows gutted
    for (const o of openings) if (o.storey > 0 && o.kind === 'window' && look() < 0.55) o.state = 'burnt';
    const dialect: HouseDialect = {
      window: (s, face, o, y0) => {
        windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { ...STONE_WINDOW, surround: null, bars: 'two' }, look, 0.04);
        if (!o.state) archGlazing(s, face, o.u, y0 + o.y0 + o.h, o.w / 2, STONE_WINDOW.frame);
        archHead(s, face, o.u, y0 + o.y0 + o.h, o.w / 2, 'stone', 0.18, 5);
      },
      door: (s, face, o, y0) => {
        gateUnit(s, face, o.u, y0 + o.y0, o.w, o.h, door, { bucket: 'stone', width: 0.35, out: 0.12 });
        archGlazing(s, face, o.u, y0 + o.y0 + o.h, o.w / 2, shade(door, 0.8));
        archHead(s, face, o.u, y0 + o.y0 + o.h, o.w / 2, 'stone', 0.4, 9);
      },
    };
    sink.placed(Math.PI / 2, 0, 0, 0, () => {
      const frame = buildHouse(sink, {
        w: D, d: W, plinth: { h: 0.5, out: 0.08, bucket: 'stone' }, storeys: sts.map((h) => ({ h, wall: 'plaster2' as RegionalBucket })),
        roof: { kind: 'flat', pitchDeg: 0, eave: 0.1, verge: 0.1, thickness: 0.35, bucket: 'stone', parapet: 1.0 }, gableBucket: 'plaster2', openings,
        chimneys: [], gutters: null, verge: null, reveal: 0.3, rafters: null, spall: 'stone',
      }, dialect);
      const b = frame.bodies[0], eave = frame.eaveY;
      // the red bands in the solid zones between the storeys' arches
      for (let i = 0; i < 3; i++) {
        const zone0 = frame.floors[i] + (i === 0 ? 1.2 + 2.3 + 0.9 : 0.8 + 2.0 + 0.85), zone1 = (i < 2 ? frame.floors[i + 1] : eave) + 0.6;
        for (let y = zone0; y + 0.24 < zone1; y += 0.62) sink.band('structureMetal', b.x0 - 0.03, y, b.z0 - 0.03, b.x1 + 0.03, y + 0.24, b.z1 + 0.03, { decor: true, colour: RED_BAND });
      }
      for (let y = 0.7; y < 1.1; y += 0.62) sink.band('structureMetal', b.x0 - 0.03, y, b.z0 - 0.03, b.x1 + 0.03, y + 0.24, b.z1 + 0.03, { decor: true, colour: RED_BAND });
      // the crenellation along the parapet head
      const ph = eave + 0.35 + 1.0;
      if (!mobile) {
        // (dome-detail-275, the roof sweep: the felt's triangles) each merlon without its underside, on the parapet's head;
        // none inside a corner turret (the first and last of each run stood wholly in its shaft)
        const towers = [-1, 1].flatMap((sx) => [-1, 1].map((sz) => [sx > 0 ? b.x1 - tr * 0.54 : b.x0 + tr * 0.54, sz > 0 ? b.z1 - tr * 0.54 : b.z0 + tr * 0.54]));
        const inTower = (x0: number, z0: number, x1: number, z1: number) => towers.some(([tx, tz]) =>
          [[x0, z0], [x1, z0], [x0, z1], [x1, z1]].every(([x, z]) => Math.hypot(x - tx, z - tz) < tr * Math.cos(Math.PI / 8) - 0.02));
        const merlon = (x0: number, z0: number, x1: number, z1: number) => {
          if (!inTower(x0, z0, x1, z1)) sink.box('plaster2', [(x0 + x1) / 2, ph + 0.31, (z0 + z1) / 2], [(x1 - x0) / 2, 0.31, (z1 - z0) / 2], { decor: true }, undefined, { ny: true });
        };
        for (let z = b.z0 + 0.6; z < b.z1 - 0.4; z += 1.1) { merlon(b.x0 - 0.1, z, b.x0 + 0.12, z + 0.5); merlon(b.x1 - 0.12, z, b.x1 + 0.1, z + 0.5); }
        for (let x = b.x0 + 0.6; x < b.x1 - 0.4; x += 1.1) { merlon(x, b.z0 - 0.1, x + 0.5, b.z0 + 0.12); merlon(x, b.z1 - 0.12, x + 0.5, b.z1 + 0.1); }
      }
      // the corner turrets and their little domes
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const x = sx > 0 ? b.x1 - tr * 0.54 : b.x0 + tr * 0.54, z = sz > 0 ? b.z1 - tr * 0.54 : b.z0 + tr * 0.54;
        sink.cylinder('plaster2', [x, -0.3, z], 'y', ph + 2.4, tr, 8, {}, tr, true, Math.PI / 8);
        // (259, the phone census: a square band round the octagon stood off its faces, on them only by its fine top and
        // underside) an octagonal collar on the turret
        sink.cylinder('structureMetal', [x, ph - 0.3, z], 'y', 0.3, tr + 0.06, 8, { decor: true, colour: RED_BAND }, tr + 0.06, true, Math.PI / 8);
        const t = dome(sink, x, ph + 2.1, z, tr, LEAD, 8, true, true);
        finial(sink, x, t, z, 'alem', 0.5);
      }
      // the central hall: its octagonal drum over the roof, the burnt dome's bare ribs, a few panes left
      const hr = clampTo(Math.min(b.x1 - b.x0, b.z1 - b.z0) * 0.26, 2.5, 5.2), hy = eave + 0.35;
      sink.cylinder('plaster2', [0, hy - 0.2, 0], 'y', 3.6, hr, 8, {}, hr, true, Math.PI / 8);
      // (259, the phone census: a square band 0.5-2.2 m off the octagon's faces, at range a square ring in the air) an
      // octagonal collar on the drum
      sink.cylinder('structureMetal', [0, hy + 2.2, 0], 'y', 0.3, hr + 0.06, 8, { decor: true, colour: RED_BAND }, hr + 0.06, true, Math.PI / 8);
      const ribTop: Vec3 = [0, hy + 3.4 + hr * 0.8, 0];
      for (let k = 0; k < 8; k++) {
        const t = (k / 8) * Math.PI * 2 + Math.PI / 8;
        const a: Vec3 = [Math.cos(t) * hr * 0.92, hy + 3.4, Math.sin(t) * hr * 0.92];
        const m: Vec3 = [Math.cos(t) * hr * 0.66, hy + 3.4 + hr * 0.62, Math.sin(t) * hr * 0.66];
        sink.member('structureMetal', a, m, 0.14, 0.14, [Math.cos(t), 0.3, Math.sin(t)], { colour: CHAR, decor: true, exposed: true }, 0);
        sink.member('structureMetal', m, ribTop, 0.12, 0.12, [Math.cos(t), 1, Math.sin(t)], { colour: CHAR, decor: true, exposed: true }, 0);
      }
      sink.cylinder('structureMetal', [0, hy + 3.4, 0], 'y', 0.2, hr * 0.95, 8, { colour: CHAR, decor: true }, hr * 0.95, true, Math.PI / 8);
      // (dome-detail-275, the roof sweep) the roof inside the parapet under felt in relief (sarajevoParts feltDeck), left
      // out under the hall's drum and the turrets (well inside them: a roll the hole cuts leaves its whole course bare)
      const rg = frame.roof, fx = rg.s + 0.1 - 0.22, fz = rg.halfD + 0.1 - 0.22, tq = tr * 0.45, hq = hr * 0.5;
      const turrets = [-1, 1].flatMap((sx) => [-1, 1].map((sz) => {
        const x = sx > 0 ? b.x1 - tr * 0.54 : b.x0 + tr * 0.54, z = sz > 0 ? b.z1 - tr * 0.54 : b.z0 + tr * 0.54;
        return { x0: x - tq, x1: x + tq, z0: z - tq, z1: z + tq };
      }));
      // (the hall stands at the triangle cap: the felt in rolls a little wider)
      feltDeck(sink, 'stone', [reliefFlat(-fx, -fz, fx, fz, hy, fx < fz)], [{ x0: -hq, x1: hq, z0: -hq, z1: hq }, ...turrets], false, 1.3);
      const street = frame.faces.left;
      // (dome-detail-275, the roof sweep: the felt's triangles) three in five of the front's pocks drawn (all drawn from the
      // look stream, as a phone's fewer)
      sink.dressing(mobile, () => {
        const pocks = 30 + Math.floor(look() * 20);
        shellPocks(sink, street, { u0: -W / 2 + 1, u1: W / 2 - 1, y0: 0.6, y1: eave - 0.5 }, pocks,
          openings.filter((o) => o.face === 'left').map((o) => ({ u0: o.u - o.w / 2 - 0.3, u1: o.u + o.w / 2 + 0.3, y0: frame.floors[o.storey] + o.y0 - 0.2, y1: frame.floors[o.storey] + o.y0 + o.h + o.w / 2 + 0.4 })), look, 'stone',
          Math.round(pocks * 0.6));
      });
    });
  });
  return sink.finish();
}

const civicHall: RegionalBuilder = (ctx) => {
  const valley = ctx.z !== undefined ? Math.abs(ctx.z) < 60 : ctx.rng() < 0.5;
  return valley ? museum(ctx) : vijecnica(ctx);
};

// ------------------------------------------------------------------------------------------------ the mosque

/**
 * A mahala mosque: the prayer hall (stone under a lead dome, or whitewashed under a hipped tile roof) at the back of
 * the plot, the portico of arches on slender columns before its door, the pencil minaret at its corner, the harem's
 * nišani inside a low wall along the street.
 */
const mosque: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const f = fillOf(ctx.bounds, 0.1);
  sink.placed(0, f.cx, 0, f.cz, () => {
    const rng = ctx.rng, look = ctx.variant, mobile = ctx.tier === 'mobile';
    const W = clampTo(f.w, 6, 40), D = clampTo(f.d, 7, 40);
    const domed = rng() < 0.55;
    const hs = clampTo(Math.min(W - 3.2, D * 0.6), 5, 10), hh = clampTo(hs * 0.82, 4.5, 8);
    // the hall's eave on the lot's back edge
    const hz0 = -D / 2 + (domed ? 0.25 : 0.7), hz1 = hz0 + hs, hzc = (hz0 + hz1) / 2;
    const wall: RegionalBucket = domed || rng() < 0.4 ? 'stone' : 'plaster';
    const door = choose(rng(), DOOR_LEAVES);
    const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'door', u: 0, w: 1.3, y0: 0, h: 2.5 }];
    for (const face of ['left', 'right', 'back'] as const) {
      for (const o of windowRhythm(face, 0, hs, { w: 0.9, h: 1.5, sill: 0.9, spacing: 2.4, margin: 1.2, max: 3 })) openings.push(o);
      for (const o of windowRhythm(face, 0, hs, { w: 0.55, h: 0.8, sill: hh - 1.7, spacing: 2.4, margin: 1.2, max: 3 })) openings.push(o);
    }
    for (const o of windowRhythm('front', 0, hs, { w: 0.9, h: 1.5, sill: 0.9, spacing: 2.6, margin: 1.0, avoid: [[-1.2, 1.2]], max: 2 })) openings.push(o);
    const dialect: HouseDialect = {
      window: (s, face, o, y0) => {
        const y = y0 + o.y0;
        windowUnit(s, face, o.u, y, o.w, o.h, { frame: DARK_FRAME, frameWidth: 0.05, frameOut: 0.04, bars: 'none', surround: { bucket: 'stone', width: 0.14, out: 0.05, lintel: 0.14 }, sill: { bucket: 'stone', out: 0.1 }, shutters: null }, look, 0.05);
        if (o.h > 1) for (let k = 1; k < 4; k++) faceBox(s, 'structureWood', face, o.u - o.w / 2 + o.w * k / 4, y + o.h / 2, 0.03, 0.025, o.h, 0.025, { colour: IRON, decor: true, fine: true });
        archHead(s, face, o.u, y + o.h + 0.14, o.w / 2 + 0.06, 'stone', 0.12, o.h > 1 ? 2 : 6);
      },
      door: (s, face, o, y0, frame) => {
        doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { leaf: door, frame: { bucket: 'stone', width: 0.22, out: 0.08 }, steps: { bucket: 'stone' }, leafKind: 'plank' }, frame.floors[o.storey] + o.y0);
        archHead(s, face, o.u, y0 + o.y0 + o.h + 0.22, o.w / 2 + 0.22, 'stone', 0.2, 2);
      },
    };
    sink.placed(0, 0, 0, hzc, () => {
      const frame = buildHouse(sink, {
        w: hs, d: hs, plinth: { h: 0.35, out: 0.06, bucket: 'stone' }, storeys: [{ h: hh, wall }],
        roof: domed ? { kind: 'flat', pitchDeg: 0, eave: 0.25, verge: 0.25, thickness: 0.3, bucket: 'stone' }
          : { kind: 'hip', pitchDeg: 26, eave: 0.7, verge: 0.7, thickness: 0.16, bucket: 'roof', ridge: 'round', relief: PLAIN_TILES },
        gableBucket: wall, openings, chimneys: [], gutters: null, verge: null, reveal: 0.36, rafters: null, spall: 'stone',
      }, dialect);
      // (dome-detail-275) the hall's stone cornice under its roof
      const hb = frame.bodies[0];
      sink.band('stone', hb.x0 - 0.12, frame.eaveY - 0.34, hb.z0 - 0.12, hb.x1 + 0.12, frame.eaveY - 0.06, hb.z1 + 0.12, { decor: true });
      if (domed) {
        const top = frame.eaveY + 0.3;
        // (dome-detail-275) the octagonal drum (it was a plain eight-sided band): its sides slabs round a core, a light cut
        // through each under a round head (the cut's corners filled to the arch) on its sill, a pilaster up each corner,
        // the base course and a stepped cornice, its upper course round under the dome's foot
        const rc = hs * 0.44, p8 = Math.PI / 8, ap = rc * Math.cos(p8), side = 2 * rc * Math.sin(p8), cut = 0.2, dh = 1.5;
        const wr = 0.22, wy = top + 0.35, ws = top + 0.95;
        sink.cylinder(wall, [0, top - 0.05, 0], 'y', dh + 0.05, rc - cut / Math.cos(p8), 8, {}, rc - cut / Math.cos(p8), true, p8);
        for (let k = 0; k < 8; k++) {
          const t = (k / 8) * Math.PI * 2;
          const f: Face = { origin: [Math.cos(t) * ap, 0, Math.sin(t) * ap], u: [Math.sin(t), 0, -Math.cos(t)], out: [Math.cos(t), 0, Math.sin(t)], width: side };
          holedPolygon(sink, wall, f, [[-side / 2, top - 0.05], [side / 2, top - 0.05], [side / 2, top + dh], [-side / 2, top + dh]],
            [{ u0: -wr, u1: wr, y0: wy, y1: ws + wr }], cut, 0.16);
          facePanel(sink, 'glass', f, 0, (wy + ws) / 2, -0.148, 2 * wr, ws - wy, { decor: true, window: f.out });
          lunette(sink, 'glass', f, 0, ws, wr, -0.148, 4, { decor: true });
          spandrels(sink, wall, f, 0, ws, wr, 0.002, { decor: true }, 0, 4);
          archHead(sink, f, 0, ws, wr, 'stone', 0.1, 5);
          faceBox(sink, 'stone', f, 0, wy - 0.05, 0.05, 2 * wr + 0.3, 0.1, 0.1, { decor: true });
          for (const e of [-1, 1]) faceBox(sink, 'stone', f, e * (side / 2 - 0.11), top + dh / 2, 0.035, 0.22, dh - 0.1, 0.07, { decor: true, shade: 1.04 }, { back: true });
        }
        sink.cylinder('stone', [0, top - 0.05, 0], 'y', 0.22, rc + 0.06, 8, { decor: true }, rc + 0.06, true, p8);
        sink.cylinder('stone', [0, top + dh - 0.12, 0], 'y', 0.16, rc + 0.08, 8, { decor: true }, rc + 0.08, true, p8);
        sink.revolve('stone', [0, top + dh + 0.04, 0], 'y', [[0, 0], [0, rc + 0.08], [0.05, rc + 0.2], [0.16, rc + 0.2], [0.16, 0]], domeSegments(rc), { decor: true, shade: 0.95 });
        const t = dome(sink, 0, top + dh + 0.2, 0, hs * 0.42, LEAD, 12);
        finial(sink, 0, t, 0, 'alem', 0.9);
      } else finial(sink, 0, frame.roof.ridgeTopY + 0.05, 0, 'alem', 0.7);
    });
    // the portico before the door: a stone platform, slender columns, arches, a lead-sheeted lean-to roof
    // (dome-detail-275: plain shafts to the roof under a flat ring of quads) the stone sofa with its steps; the columns on
    // square bases under their capitals and abaci; pointed arches of voussoirs, every second stone the red (the ablaq),
    // their spandrels filled to the entablature and its cornice; the iron tie rods between the capitals and back to the hall
    const pz0 = hz1, pz1 = Math.min(D / 2 - 2.2, hz1 + 3.2);
    if (pz1 - pz0 > 1.6) {
      const px = hs / 2 - 0.1, ph = Math.min(hh - 0.4, 4.0), cz = pz1 - 0.3;
      sink.span('stone', -px, -0.3, pz0, px, 0.35, pz1);
      for (let k = 1; k <= 2; k++) sink.span('stone', -1.2, -0.3, pz1 + 0.32 * (k - 1), 1.2, 0.35 - 0.12 * k, pz1 + 0.32 * k, { decor: true, shade: 0.92 });
      const cols = Math.max(3, Math.round(hs / 2.4) + 1), bay = (2 * px - 0.5) / (cols - 1), colX = (k: number) => -px + 0.25 + bay * k;
      const r = bay / 2 - 0.2, c = r * 0.22, rw = 0.2, eb = ph - 0.3;
      const spring = eb - 0.08 - Math.sqrt((r + c + rw) ** 2 - c * c);
      for (let k = 0; k < cols; k++) {
        const x = colX(k);
        sink.span('stone', x - 0.24, 0.35, cz - 0.24, x + 0.24, 0.62, cz + 0.24, { decor: true, shade: 0.94 });
        sink.cylinder('stone', [x, 0.35, cz], 'y', spring - 0.73, 0.17, 10, {}, 0.15);
        sink.cylinder('stone', [x, spring - 0.38, cz], 'y', 0.26, 0.16, 8, { decor: true }, 0.27, true, Math.PI / 8);
        sink.span('stone', x - 0.28, spring - 0.12, cz - 0.28, x + 0.28, spring, cz + 0.28, { decor: true });
      }
      const pf: Face = { origin: [0, 0, cz], u: [1, 0, 0], out: [0, 0, 1], width: 2 * px };
      // a pointed arch's line at radius `rr` from its centres: half `e` (-1 the left), `t` 0 at the springing to 1 at the crown
      const arcAt = (cu: number, e: number, rr: number, t: number): [number, number] => {
        const th = Math.PI - t * (Math.PI - Math.acos(-c / rr));
        return [cu - e * (c + rr * Math.cos(th)), spring + rr * Math.sin(th)];
      };
      const n = 4;
      for (let k = 0; k + 1 < cols; k++) {
        const cu = colX(k) + bay / 2;
        for (const e of [-1, 1]) {
          for (let j = 0; j < n; j++) {
            const [u0, y0] = arcAt(cu, e, r + c + rw / 2, Math.max(0, j / n - 0.04)), [u1, y1] = arcAt(cu, e, r + c + rw / 2, Math.min(1, (j + 1) / n + 0.04));
            sink.member('stone', facePoint(pf, u0, y0, 0), facePoint(pf, u1, y1, 0), rw, 0.46 + (j % 2) * 0.02, pf.out,
              { decor: true, exposed: true, ...((j + (e > 0 ? 1 : 0)) % 2 ? { tint: [1.0, 0.7, 0.6] as Rgb, shade: 0.82 } : { shade: 1.06 }) }, 0.23 + (j % 2) * 0.01);
          }
          // the spandrel over this half, front and back, from the column's axis to the crown
          const ext = Array.from({ length: n + 1 }, (_, j) => arcAt(cu, e, r + c + rw, j / n));
          const corner: [number, number] = [cu + e * bay / 2, eb];
          const ring: Array<[number, number]> = e < 0 ? [corner, ...ext, [cu, eb]] : [corner, [cu, eb], ...[...ext].reverse()];
          sink.polygon(wall, ring.map(([u, y]) => facePoint(pf, u, y, 0.2)), { decor: true, shade: 0.93 });
          sink.polygon(wall, [...ring].reverse().map(([u, y]) => facePoint(pf, u, y, -0.2)), { decor: true, shade: 0.8 });
        }
        sink.member('structureMetal', [colX(k) + 0.28, spring - 0.06, cz], [colX(k + 1) - 0.28, spring - 0.06, cz], 0.035, 0.035, [0, 0, 1], { colour: IRON, decor: true, exposed: true }, 0.0175);
      }
      for (const e of [-1, 1]) {
        sink.span(wall, e * colX(cols - 1), spring, cz - 0.2, e * (px + 0.02), eb, cz + 0.2, { decor: true });
        sink.member('structureMetal', [e * colX(cols - 1), spring - 0.06, cz - 0.28], [e * colX(cols - 1), spring - 0.06, pz0], 0.035, 0.035, [1, 0, 0], { colour: IRON, decor: true, exposed: true }, 0.0175);
      }
      sink.span(wall, -px - 0.02, eb, cz - 0.22, px + 0.02, ph, cz + 0.22, { decor: true });
      sink.span('stone', -px - 0.08, ph - 0.12, cz - 0.24, px + 0.08, ph + 0.02, cz + 0.34, { decor: true, shade: 0.95 });
      // (dome-detail-275, the roof sweep) the lead in its seamed bays (sarajevoParts SEAMED)
      const lean: RoofSpec = { kind: 'shed', pitchDeg: 12, eave: 0.35, verge: 0.3, thickness: 0.1, bucket: 'structureMetal', relief: SEAMED };
      const rd = pz1 - pz0;
      sink.placed(-Math.PI / 2, 0, 0, (pz0 + pz1) / 2, () => emitRoof(sink, roofGeometry(rd, 2 * px, ph + 0.15, lean), { ...lean, decor: true }, LEAD));
    }
    // the pencil minaret at the hall's front corner
    const mx = hs / 2 + 0.15, mz = hz1 - 0.9;
    const shaftTop = clampTo(hh * 2.6, 12, 21.5);
    sink.span('stone', mx - 1.05, -0.4, mz - 1.05, mx + 1.05, hh * 0.7, mz + 1.05);
    sink.cylinder('stone', [mx, hh * 0.7, mz], 'y', 0.9, 1.05, 8, {}, 0.9, true, Math.PI / 8);
    sink.cylinder('stone', [mx, hh * 0.7 + 0.9, mz], 'y', shaftTop - hh * 0.7 - 0.9, 0.86, 12, {}, 0.78, true);
    // (dome-detail-275) the base's cornice, the moulded ring at the shaft's foot
    sink.span('stone', mx - 1.15, hh * 0.7 - 0.2, mz - 1.15, mx + 1.15, hh * 0.7, mz + 1.15, { decor: true, shade: 0.95 });
    sink.cylinder('stone', [mx, hh * 0.7 + 0.9, mz], 'y', 0.18, 0.94, 12, { decor: true }, 0.9, true);
    // the šerefe: the corbelled balcony and its parapet, the upper shaft, the lead cone and its alem
    // (dome-detail-275: a solid drum on a plain cone) the corbelling stepped out in two courses, a ring of stalactite
    // corbels under the balcony's slab, the parapet of carved stone panels between posts under its rail; the upper
    // shaft's cornice under the lead cone
    const sy = shaftTop - 3.4, shaftR = (y: number) => 0.86 - 0.08 * (y - hh * 0.7 - 0.9) / (shaftTop - hh * 0.7 - 0.9);
    sink.cylinder('stone', [mx, sy - 1.05, mz], 'y', 0.3, shaftR(sy - 1.05) + 0.02, 12, { decor: true }, 0.92);
    sink.cylinder('stone', [mx, sy - 0.75, mz], 'y', 0.3, 0.95, 12, { decor: true, shade: 0.93 }, 1.04);
    sink.cylinder('stone', [mx, sy - 0.45, mz], 'y', 0.3, 1.0, 16, { decor: true, shade: 0.7 }, 1.0, false);
    for (let k = 0; k < 16; k++) {
      const a = (k + 0.5) * Math.PI / 8, f: Face = { origin: [mx + Math.cos(a) * 1.0, 0, mz + Math.sin(a) * 1.0], u: [Math.sin(a), 0, -Math.cos(a)], out: [Math.cos(a), 0, Math.sin(a)], width: 0.4 };
      faceBox(sink, 'stone', f, 0, sy - 0.3, 0.1, 0.2, 0.3, 0.2, { decor: true, shade: 0.92 }, { back: true });
    }
    sink.cylinder('stone', [mx, sy - 0.15, mz], 'y', 0.17, 1.32, 16, { decor: true }, 1.32, true);
    const pr = 1.22, pn = 12, pw = 2 * pr * Math.sin(Math.PI / pn);
    for (let k = 0; k < pn; k++) {
      // (the face on the panels' inner line: they stand free, their backs seen from over the gallery)
      const ri = pr * Math.cos(Math.PI / pn) - 0.08;
      const a = (k + 0.5) * Math.PI * 2 / pn, f: Face = { origin: [mx + Math.cos(a) * ri, 0, mz + Math.sin(a) * ri], u: [Math.sin(a), 0, -Math.cos(a)], out: [Math.cos(a), 0, Math.sin(a)], width: pw };
      faceBox(sink, 'stone', f, 0, sy + 0.42, 0.04, pw - 0.1, 0.8, 0.07, { decor: true });
      facePanel(sink, 'stone', f, 0, sy + 0.44, 0.078, pw * 0.5, 0.46, { decor: true, fine: true, shade: 0.6 });
      faceBox(sink, 'stone', f, pw / 2, sy + 0.45, 0.07, 0.11, 0.9, 0.12, { decor: true, shade: 1.04 });
      faceBox(sink, 'stone', f, 0, sy + 0.88, 0.075, pw + 0.02, 0.07, 0.14, { decor: true });
    }
    sink.cylinder('stone', [mx, shaftTop - 0.28, mz], 'y', 0.3, shaftR(shaftTop) + 0.03, 12, { decor: true }, 0.96, true);
    sink.cylinder('structureMetal', [mx, shaftTop, mz], 'y', clampTo(shaftTop * 0.22, 2.5, 4.6), 0.9, 12, { colour: LEAD, decor: true }, 0.03);
    finial(sink, mx, shaftTop + clampTo(shaftTop * 0.22, 2.5, 4.6) - 0.1, mz, 'alem', 0.7);
    // (props census #13, lane B 2026-10-15) the minaret recorded as a tower body of its base's girth: it topples in its
    // courses beside the hall (it went down with the hall)
    recordShaft(sink, mx, mz, 2.1, shaftTop, 'stone');
    // the harem: a low whitewashed wall round the lot, its gateway on the street; the nišani in rows before the hall
    const t = 0.3, wy = 1.25, zs = D / 2 - t;
    // (props census #13, lane B 2026-10-15; the judges: "the harem wall has no coping, the gateway no head") each run
    // of wall under its stone coping, the gateway's piers capped and spanned by a stone lintel under a little lead roof
    const runs: Array<[number, number, number, number]> = [[-W / 2, zs, -1.2, D / 2], [1.2, zs, W / 2, D / 2]];
    for (const s of [-1, 1]) {
      runs.push([s > 0 ? W / 2 - t : -W / 2, -D / 2, s > 0 ? W / 2 : -W / 2 + t, zs]);
      runs.push([s > 0 ? hs / 2 : -W / 2 + t, -D / 2, s > 0 ? W / 2 - t : -hs / 2, -D / 2 + t]);
    }
    for (const [x0, z0, x1, z1] of runs) {
      if (x1 - x0 < 0.05) continue;
      sink.span('plaster', x0, -0.3, z0, x1, wy, z1);
      sink.span('stone', x0 - 0.05, wy, z0 - 0.05, x1 + 0.05, wy + 0.1, z1 + 0.05, { decor: true });
    }
    for (const s of [-1, 1]) {
      sink.span('plaster', s * 1.2 - 0.25, -0.3, zs - 0.05, s * 1.2 + 0.25, 2.2, D / 2 + 0.05);
      sink.span('stone', s * 1.2 - 0.32, 2.2, zs - 0.12, s * 1.2 + 0.32, 2.32, D / 2 + 0.12, { decor: true });
    }
    sink.span('stone', -0.95, 2.32, zs - 0.05, 0.95, 2.56, D / 2 + 0.05);
    const gateRoof: RoofSpec = { kind: 'gable', pitchDeg: 30, eave: 0.25, verge: 0.2, thickness: 0.06, bucket: 'structureMetal', ridge: null, decor: true };
    sink.placed(Math.PI / 2, 0, 0, zs + t / 2, () => emitRoof(sink, roofGeometry(t + 0.24, 3.04, 2.56, gateRoof), gateRoof, LEAD));
    const yz0 = Math.max(pz1 + 0.4, hz1 + 0.4), yz1 = zs;
    if (yz1 - yz0 > 1.2) {
      // (a phone keeps four of the stones, every stone drawn)
      const count = 10 + Math.floor(look() * 8);
      for (let k = 0; k < count; k++) {
        const side = look() < 0.5 ? -1 : 1, x = side * (1.8 + look() * Math.max(0.2, W / 2 - 2.6)), z = yz0 + 0.3 + look() * Math.max(0.1, yz1 - yz0 - 0.9);
        const hh = 0.8 + look() * 0.8, turban = look() < 0.6, lean = (look() - 0.5) * 0.4;
        if (!mobile || k < 4) nisan(sink, x, z, hh, turban, lean);
      }
    }
  });
  return sink.finish();
};

// ------------------------------------------------------------------------------------------------ the churches

/**
 * (dome-detail-275) The stone filling a rectangular cut's head to a round arch: the two spandrels between the rectangle's
 * top corners and the semicircle of radius r springing at (u, spring), `o` out of the face, so the cut reads round-headed;
 * with `depth` each stands that far out of `o` (a portal's head, a belfry light's): its face, the arch's soffit and its
 * outer jamb (its top and back abut the work over and behind it), else a face.
 */
function spandrels(sink: PartSink, bucket: RegionalBucket, face: Face, u: number, spring: number, r: number, o: number, opts: EmitOptions,
  depth = 0, n = 5): void {
  for (const e of [-1, 1]) {
    const arc: Vec3[] = [];
    for (let j = 0; j <= n; j++) { const t = (Math.PI / 2) * j / n; arc.push(facePoint(face, u + e * Math.cos(t) * r, spring + Math.sin(t) * r, o)); }
    if (e > 0) arc.reverse();
    const corner = facePoint(face, u + e * r, spring + r, o);
    if (depth <= 0) { sink.polygon(bucket, [corner, ...arc], opts); continue; }
    const fwd = (p: Vec3): Vec3 => [p[0] + face.out[0] * depth, p[1], p[2] + face.out[2] * depth];
    sink.polygon(bucket, [corner, ...arc].map(fwd), opts);
    for (let j = 0; j < n; j++) sink.quad(bucket, arc[j], arc[j + 1], fwd(arc[j + 1]), fwd(arc[j]), opts);
    const jamb = e < 0 ? [arc[0], corner] : [corner, arc[n]];
    sink.quad(bucket, jamb[0], fwd(jamb[0]), fwd(jamb[1]), jamb[1], opts);
  }
}

/** (dome-detail-275) An archivolt of voussoirs standing `depth` proud of a face, the stones' faces a shade apart. */
function voussoirs(sink: PartSink, face: Face, u: number, spring: number, r: number, ringW: number, depth: number, n: number): void {
  const rm = r + ringW / 2, lap = (Math.PI / n) * 0.1;
  const at = (t: number) => facePoint(face, u + Math.cos(t) * rm, spring + Math.sin(t) * rm, 0);
  for (let j = 0; j < n; j++) {
    const a = Math.max(0, Math.PI * j / n - lap), b = Math.min(Math.PI, Math.PI * (j + 1) / n + lap);
    // (every second stone 2 cm prouder: the laps never share a plane)
    sink.member('stone', at(a), at(b), ringW, depth + (j % 2) * 0.02, face.out, { decor: true, exposed: true, shade: j % 2 ? 0.9 : 1 }, 0);
  }
}

/**
 * (dome-detail-275) An arch's ring of `n` voussoir faces 3 cm proud of a face (archHead's faces without its end caps: a
 * frieze's run of small arches, a window's head), springing at (u, y), inner radius r.
 */
function arcRing(sink: PartSink, face: Face, u: number, y: number, r: number, w: number, n: number): void {
  const at = (t: number, rr: number) => facePoint(face, u + Math.cos(t) * rr, y + Math.sin(t) * rr, 0.03);
  for (let j = 0; j < n; j++) {
    const a = Math.PI * j / n, b = Math.PI * (j + 1) / n;
    sink.quad('stone', at(a, r), at(a, r + w), at(b, r + w), at(b, r), { decor: true, shade: j % 2 ? 0.88 : 0.97 });
  }
}

/** (dome-detail-275) A half disc on a face: (u, y) its springing line's centre, `n` segments round. */
function lunette(sink: PartSink, bucket: RegionalBucket, face: Face, u: number, y: number, r: number, o: number, n: number, opts: EmitOptions): void {
  const pts: Vec3[] = [facePoint(face, u, y, o)];
  for (let j = 0; j <= n; j++) { const t = Math.PI * j / n; pts.push(facePoint(face, u + Math.cos(t) * r, y + Math.sin(t) * r, o)); }
  sink.polygon(bucket, pts, opts);
}

/** (dome-detail-275) A disc on a face, `n` sides. */
function disc(sink: PartSink, bucket: RegionalBucket, face: Face, u: number, y: number, r: number, o: number, n: number, opts: EmitOptions): void {
  sink.polygon(bucket, Array.from({ length: n }, (_, j) => facePoint(face, u + Math.cos(j * Math.PI * 2 / n) * r, y + Math.sin(j * Math.PI * 2 / n) * r, o)), opts);
}

/** The icon's paints: the saint's lapis ground, the robe's cinnabar, the face's ochre. */
const ICON_BLUE = rgb(0x2a3f6e), ICON_RED = rgb(0x7a2a22), ICON_FLESH = rgb(0xb88a64);

/**
 * A church's bell tower shaft up to its belfry's sills (`top`), a body of its own (it topples in its courses when the
 * church falls: damage.ts towerBody) on its plinth, its west door cut through its front with the leaf hung at the back
 * of the cut; the belfry stands on its flat top. (Props census #13, lane B 2026-10-15: the shaft was a solid span, the
 * door laid on it, and it fell with the nave.) (dome-detail-275) `lights`: its stages' windows, cut too, `light` their
 * unit.
 */
function towerShaft(sink: PartSink, wall: RegionalBucket, cz: number, tw: number, top: number, door: DoorStyle, dw: number, dh: number, reveal: number,
  lights: readonly Opening[] = [], light: HouseDialect['window'] = () => undefined): void {
  const dialect: HouseDialect = {
    window: light,
    door: (s, face, o, y0) => doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, door, y0 + o.y0),
  };
  sink.placed(0, 0, 0, cz, () => buildHouse(sink, {
    w: tw, d: tw, plinth: { h: 0.3, out: 0.05, bucket: 'stone' }, storeys: [{ h: top - 0.4, wall }],
    roof: { kind: 'flat', pitchDeg: 0, eave: 0, verge: 0, thickness: 0.1, bucket: 'stone' },
    openings: [{ face: 'front', storey: 0, kind: 'door', u: 0, w: dw, y0: 0, h: dh }, ...lights], chimneys: [], gutters: null, verge: null,
    reveal, rafters: null, spall: null,
  }, dialect));
}

/**
 * The Serbian Orthodox church, in the Serbo-Byzantine manner of Sarajevo's Old and New churches (dome-detail-275: it read
 * plain): the nave's walls banded in pairs of red brick courses between the stone, lesenes parting its bays under an
 * arcaded corbel frieze and the eaves' stepped cornice, round-headed bifora on colonnettes; the drum on its square
 * pedestal through the roof, its arched lights between pilasters under a cornice, the copper dome; the apse with its own
 * lights, lesenes, frieze and cornice; the bell tower over the west portal (its archivolt on piers, the icon in the
 * tympanum, a gabled hood), its string courses, lights and bifora belfry under a cupola; the church on its stepped socle,
 * the paved forecourt behind the churchyard's broken wall, graves by the apse; the shells' pocks and a burnt strike on
 * the copper.
 */
const orthodoxChurch: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const f = fillOf(ctx.bounds, 0.1);
  sink.placed(0, f.cx, 0, f.cz, () => {
    const rng = ctx.rng, look = ctx.variant, mobile = ctx.tier === 'mobile';
    const W = clampTo(f.w, 6, 40), D = clampTo(f.d, 9, 40);
    // the nave's eaves on the lot's side edges, the apse on its back edge, the bell tower's front on its street edge
    const nw = clampTo(W - 0.9, 4.6, 40), ar = Math.min(nw * 0.36, 3.4), tw = clampTo(nw * 0.42, 3.0, 4.6);
    const az = -D / 2 + ar, tz1 = D / 2, tz0 = tz1 - tw, nz0 = az, nz1 = tz0 + 0.2;
    const nh = clampTo(nw * 0.95, 6, 8.6);
    const wall: RegionalBucket = rng() < 0.6 ? 'plaster' : 'stone';
    const door = choose(rng(), DOOR_LEAVES);
    const nl = nz1 - nz0;
    const BAND = { decor: true, colour: RED_BAND } as const;
    // (dome-detail-275) the walls' zones: the courses of red brick under the sills, between the lights
    // and over their heads, the sill and head string courses, the frieze and cornice under the eaves
    // (heights from the ground: the walls stand on the 0.45 m plinth, the openings' sills over its top)
    const fl = 0.45, eave = fl + nh, sill = 2.0, wh = 2.2, ww = 1.2, sillA = fl + sill, headA = sillA + wh + ww / 2 + 0.3;
    const lowBands = [0.9, 1.6], winBands = [sillA + 0.75, sillA + 1.45, sillA + 2.15], upBands: number[] = [];
    for (let y = headA + 0.4; y + 0.23 < eave - 0.95; y += 0.62) upBands.push(y);
    const openings: Opening[] = [];
    for (const face of ['left', 'right'] as const) for (const o of windowRhythm(face, 0, nl, { w: ww, h: wh, sill, spacing: 2.6, margin: 1.4 })) openings.push({ ...o, arch: {} });
    // (dome-detail-275) a bifora in the west wall either side of the tower, over the forecourt
    if (nw / 2 - tw / 2 > 2.4) for (const s of [-1, 1]) openings.push({ face: 'front', storey: 0, kind: 'window', u: s * (tw + nw) / 4, w: ww, y0: sill, h: wh, arch: {} });
    // (dome-detail-275) the bifora: two lights parted by a colonnette, the tympanum over them, the archivolt over that
    // (it was one light under a ring); a burnt window keeps its stone
    const ci = -0.14;
    const frameOf = (s: PartSink, face: Face, o: Opening, y: number) => {
      arcRing(s, face, o.u, y + o.h, o.w / 2, 0.16, 5);
    };
    const dialect: HouseDialect = {
      window: (s, face, o, y0) => {
        const y = y0 + o.y0, R = o.w / 2, spring = y + o.h, rl = (R - 0.07) / 2;
        windowUnit(s, face, o.u, y, o.w, o.h, { ...STONE_WINDOW, surround: null, bars: 'none' }, look, 0.08);
        s.cylinder('stone', facePoint(face, o.u, y, ci), 'y', o.h, 0.065, 6, { decor: true, fine: true }, 0.065, false);
        lunette(s, 'stone', face, o.u, spring, R - 0.01, ci, 5, { decor: true, shade: 0.9 });
        for (const e of [-1, 1]) lunette(s, 'glass', face, o.u + e * (0.07 + rl), spring, rl, ci + 0.006, 3, { decor: true });
        frameOf(s, face, o, y);
      },
      damaged: (s, face, o, y0) => frameOf(s, face, o, y0 + o.y0),
      door: () => {},
    };
    let ridgeTop = nh;
    sink.placed(0, 0, 0, (nz0 + nz1) / 2, () => {
      const frame = buildHouse(sink, {
        w: nw, d: nl, plinth: { h: 0.45, out: 0.06, bucket: 'stone' }, storeys: [{ h: nh, wall }],
        roof: { kind: 'gable', pitchDeg: 32, eave: 0.4, verge: 0.3, thickness: 0.12, bucket: 'structureMetal', ridge: 'saddle' }, roofColour: COPPER,
        gableBucket: wall, openings, chimneys: [], gutters: null, verge: null, reveal: 0.4, rafters: null, spall: 'stone',
      }, dialect);
      const b = frame.bodies[0], fc = frame.faces, rg = frame.roof;
      ridgeTop = rg.ridgeTopY;
      // (dome-detail-275) the banded walls: the brick courses round the body under the sills and over the heads; between
      // the lights they run on in lengths, broken by the windows (on the end walls by the tower and the apse)
      const course = (y: number) => sink.band('structureMetal', b.x0 - 0.03, y + 0.05, b.z0 - 0.03, b.x1 + 0.03, y + 0.18, b.z1 + 0.03, BAND);
      [...lowBands, ...upBands].forEach(course);
      for (const name of ['left', 'right', 'front', 'back'] as const) {
        const face = fc[name], half = face.width / 2;
        const cuts: Array<[number, number]> = openings.filter((o) => o.face === name).map((o): [number, number] => [o.u - o.w / 2 - 0.26, o.u + o.w / 2 + 0.26]);
        if (name === 'front') cuts.push([-tw / 2 - 0.02, tw / 2 + 0.02]);
        if (name === 'back') cuts.push([-ar - 0.02, ar + 0.02]);
        cuts.sort((p, q) => p[0] - q[0]);
        const runs: Array<[number, number]> = [];
        let u = -half - 0.03;
        for (const [a, c] of cuts) { if (a - u > 0.2) runs.push([u, a]); u = Math.max(u, c); }
        if (half + 0.03 - u > 0.2) runs.push([u, half + 0.03]);
        for (const [a, c] of runs) for (const y of winBands) facePanel(sink, 'structureMetal', face, (a + c) / 2, y + 0.115, 0.02, c - a, 0.13, BAND);
      }
      // the sill and head string courses
      sink.band('stone', b.x0 - 0.08, sillA - 0.08, b.z0 - 0.08, b.x1 + 0.08, sillA + 0.02, b.z1 + 0.08, { decor: true });
      if (headA + 0.14 < eave - 0.9) sink.band('stone', b.x0 - 0.06, headA, b.z0 - 0.06, b.x1 + 0.06, headA + 0.12, b.z1 + 0.06, { decor: true });
      // the lesenes parting the bays (and doubled at the corners) up to the frieze, the arcaded corbel frieze between them
      // (each arch on the wall, the joints its feet) and the eaves' cornice of two stepped courses over it
      const fTop = eave - 0.36, lH = fTop - fl;
      const lesene = (face: Face, u: number, w: number) => faceBox(sink, wall, face, u, fl + lH / 2, 0.035, w, lH, 0.07, { decor: true, shade: 1.05, fineSides: true }, { back: true, top: true, bottom: true });
      for (const name of ['left', 'right', 'front', 'back'] as const) {
        const face = fc[name], half = face.width / 2;
        for (const e of [-1, 1]) lesene(face, e * (half - 0.25), 0.5);
        if (name !== 'left' && name !== 'right') continue;
        const us = openings.filter((o) => o.face === name).map((o) => o.u).sort((p, q) => p - q);
        const mids = us.slice(1).map((v, i) => (v + us[i]) / 2);
        for (const m of mids) lesene(face, m, 0.42);
        const edges: Array<[number, number]> = [];
        const stops = [-half + 0.5, ...mids.flatMap((m) => [m - 0.21, m + 0.21]), half - 0.5];
        for (let i = 0; i + 1 < stops.length; i += 2) edges.push([stops[i], stops[i + 1]]);
        for (const [a, c] of edges) {
          const n = Math.max(1, Math.round((c - a) / 1.0)), pitch = (c - a) / n, r = pitch / 2 - 0.05, spring = fTop - r - 0.08;
          for (let i = 0; i < n; i++) arcRing(sink, face, a + pitch * (i + 0.5), spring, r, 0.08, 3);
        }
      }
      sink.band('stone', b.x0 - 0.1, eave - 0.36, b.z0 - 0.1, b.x1 + 0.1, eave - 0.2, b.z1 + 0.1, { decor: true });
      sink.band('stone', b.x0 - 0.2, eave - 0.2, b.z0 - 0.2, b.x1 + 0.2, eave - 0.02, b.z1 + 0.2, { decor: true, shade: 0.94 });
      // the raking cornice up each gable under the verge; the oculus in the east gable over the apse, its glass in a ring
      if (rg.gable) for (const name of ['front', 'back'] as const) for (const e of [-1, 1]) {
        const face = fc[name], yAt = (x: number) => rg.ridgeY - x * rg.tanP - 0.13;
        sink.member('stone', facePoint(face, e * (rg.s + 0.05), yAt(rg.s + 0.05), 0), facePoint(face, 0, yAt(0), 0), 0.24, 0.14, face.out, { decor: true }, 0.02);
      }
      const gy = eave + (rg.ridgeY - eave) * 0.5, orr = Math.min(0.5, (rg.ridgeY - eave) * 0.12);
      if (rg.gable && gy - orr - 0.3 > nh * 0.82 + ar * 0.75) {
        const back = fc.back, at = (r: number, j: number) => facePoint(back, Math.cos(j * Math.PI / 6) * r, gy + Math.sin(j * Math.PI / 6) * r, 0.04);
        disc(sink, 'glass', back, 0, gy, orr, 0.01, 12, { decor: true, window: back.out });
        for (let j = 0; j < 12; j++) sink.quad('stone', at(orr, j), at(orr + 0.18, j), at(orr + 0.18, j + 1), at(orr, j + 1), { decor: true, shade: j % 2 ? 0.9 : 1 });
      }
      // the drum and the dome over the nave's middle
      // the drum: its eight lights cut through its sides into the dark under the dome, the glass at the back of each
      // reveal (were dark plates laid on a solid drum); the sides holed slabs round a core
      const dr = nw * 0.3, dy = rg.ridgeTopY - 0.6, ap = dr * Math.cos(Math.PI / 8), side = 2 * dr * Math.sin(Math.PI / 8), cut = 0.22;
      // (dome-detail-275) the drum's square pedestal standing through the roof's slopes (the drum's sides hung in the air
      // over them), the copper flashed up its sides from the roof to the drum's foot
      const pb = ap + 0.12, py = dy - 1.2;
      sink.span(wall, -pb, eave - 0.4, -pb, pb, py - 0.4, pb);
      sink.cylinder('structureMetal', [0, py - 0.4, 0], 'y', 0.42, pb * Math.SQRT2, 4, { colour: shade(COPPER, 0.92), decor: true }, (ap + 0.02) * Math.SQRT2, true, Math.PI / 4);
      sink.cylinder(wall, [0, py, 0], 'y', 3.6, dr - cut / Math.cos(Math.PI / 8), 8, {}, dr - cut / Math.cos(Math.PI / 8), true, Math.PI / 8);
      // (dome-detail-275) each light round-headed (its cut's corners filled to the arch) under its archivolt, on a sill; a
      // pilaster up each corner; the base course, a brick course, the cornice
      const wr = clampTo(side * 0.1, 0.22, 0.34), wy = dy + 0.2, ws = dy + 1.35;
      for (let k = 0; k < 8; k++) {
        const t = (k / 8) * Math.PI * 2;
        const f: Face = { origin: [Math.cos(t) * ap, 0, Math.sin(t) * ap], u: [Math.sin(t), 0, -Math.cos(t)], out: [Math.cos(t), 0, Math.sin(t)], width: side };
        holedPolygon(sink, wall, f, [[-side / 2, py], [side / 2, py], [side / 2, dy + 2.4], [-side / 2, dy + 2.4]],
          [{ u0: -wr, u1: wr, y0: wy, y1: ws + wr }], cut, 0.18);
        facePanel(sink, 'glass', f, 0, (wy + ws) / 2, -0.168, 2 * wr, ws - wy, { decor: true, window: f.out });
        lunette(sink, 'glass', f, 0, ws, wr, -0.168, 5, { decor: true });
        spandrels(sink, wall, f, 0, ws, wr, 0.002, { decor: true });
        arcRing(sink, f, 0, ws, wr, 0.12, 5);
        faceBox(sink, 'stone', f, 0, wy - 0.05, 0.06, 2 * wr + 0.36, 0.1, 0.12, { decor: true });
        for (const e of [-1, 1]) {
          facePanel(sink, 'stone', f, e * (side / 2 - 0.1), (py + 0.25 + dy + 2.0) / 2, 0.03, 0.2, dy + 2.0 - py - 0.25, { decor: true, shade: 1.04 });
        }
      }
      sink.cylinder('stone', [0, py, 0], 'y', 0.25, dr + 0.06, 8, { decor: true }, dr + 0.06, true, Math.PI / 8);
      sink.cylinder('structureMetal', [0, dy - 0.55, 0], 'y', 0.2, dr + 0.03, 8, BAND, dr + 0.03, false, Math.PI / 8);
      sink.cylinder('stone', [0, dy + 2.0, 0], 'y', 0.2, dr + 0.1, 8, { decor: true }, dr + 0.1, true, Math.PI / 8);
      sink.revolve('stone', [0, dy + 2.2, 0], 'y', [[0, 0], [0, dr + 0.24], [0.2, dr + 0.24], [0.2, 0]], 24, { decor: true, shade: 0.96 });
      const t = dome(sink, 0, dy + 2.4, 0, dr * 1.02, COPPER, 12);
      finial(sink, 0, t, 0, 'cross', 0.9);
      // (dome-detail-275) a shell's strike on the copper: the sheets burnt black round the torn hole, four peeled back
      if (rg.s > 3.4) {
        const sx = look() < 0.5 ? -1 : 1, sz = look() < 0.5 ? -1 : 1;
        const hx = sx * Math.min(rg.s - 1.6, 2.4 + look() * 1.6), hz = sz * (pb + 1.3 + look() * Math.max(0.1, nl / 2 - pb - 2.8));
        const rough = Array.from({ length: 9 }, () => 0.7 + look() * 0.3);
        const onRoof = (x: number, z: number, lift: number): Vec3 => [x, (rg.topAt(x, z) ?? rg.eaveY) + lift, z];
        const blot = (r: number, lift: number, bucket: RegionalBucket, opts: EmitOptions) => sink.polygon(bucket, [onRoof(hx, hz, lift),
          ...Array.from({ length: 10 }, (_, j) => { const a = -(j % 9) / 9 * Math.PI * 2, rr = r * rough[j % 9]; return onRoof(hx + Math.cos(a) * rr, hz + Math.sin(a) * rr, lift); })], opts);
        blot(1.25, 0.03, 'structureMetal', { colour: rgb(0x2b2622), decor: true });
        blot(0.5, 0.05, 'dark', { decor: true });
        const nrm = normalize3([sx * rg.tanP, 1, 0]);
        for (let j = 0; j < 4; j++) {
          const a = (j / 4) * Math.PI * 2 + look() * 0.8, p = onRoof(hx + Math.cos(a) * 0.5, hz + Math.sin(a) * 0.5, 0.05), lift = 0.25 + look() * 0.3;
          const q: Vec3 = [p[0] + Math.cos(a) * 0.55 + nrm[0] * lift, p[1] + nrm[1] * lift, p[2] + Math.sin(a) * 0.55];
          sink.member('structureMetal', p, q, 0.42, 0.02, nrm, { colour: shade(COPPER, 0.62), decor: true, exposed: true }, 0);
        }
      }
      // (dome-detail-275, the roof sweep) the copper in its long bays from the eave to the ridge, a standing seam every
      // 0.7 m, each bay its own tone (the pedestal stands over them; the strike's burn lies on them)
      const ce = 0.4, ct = 0.12, cv = nl / 2 + 0.3, cosP = 1 / Math.hypot(1, rg.tanP), sinP = rg.tanP * cosP, clo = rg.eaveY - ce * rg.tanP;
      layRoofRelief(sink, { ...SEAMED, gauge: (rg.s + ce) / cosP + 0.2, pitch: 0.7 }, [-1, 1].map((side) => {
        const lift = (p: [number, number, number]): [number, number, number] => [p[0] + side * sinP * ct, p[1] + cosP * ct, p[2]];
        return reliefSlope(lift([side * (rg.s + ce), clo, -cv]), lift([side * (rg.s + ce), clo, cv]), [-side * (rg.s + ce), (rg.s + ce) * rg.tanP, 0]);
      }), { bucket: 'structureMetal', base: { colour: COPPER } });
      // (dome-detail-275) the splinters' pocks down both flanks, clear of the windows
      sink.dressing(mobile, () => {
        // (dome-detail-275, the roof sweep: the copper's triangles) three in five of the pocks drawn (all drawn from the look
        // stream, as a phone's fewer)
        for (const name of ['left', 'right'] as const) {
          const pocks = 5 + Math.floor(look() * 6);
          shellPocks(sink, fc[name], { u0: -nl / 2 + 0.6, u1: nl / 2 - 0.6, y0: 0.6, y1: eave - 1.0 }, pocks,
            openings.filter((o) => o.face === name).map((o) => ({ u0: o.u - o.w / 2 - 0.3, u1: o.u + o.w / 2 + 0.3, y0: fl + o.y0 - 0.1, y1: fl + o.y0 + o.h + o.w / 2 + 0.25 })), look, 'stone',
            Math.round(pocks * 0.6));
        }
      });
    });
    // the apse: a half drum at the east end under its half cone
    // (dome-detail-275: eight flat panels, then sixteen) seventeen sides, slabs round a core, three lights cut through
    // them under round heads, lesenes, the brick courses, an arch of the frieze on each side and the cornice
    const AS = 17, ah = nh * 0.82, acut = 0.2, aside = 2 * ar * Math.sin(Math.PI / (2 * AS)), aap = ar * Math.cos(Math.PI / (2 * AS));
    sink.cylinder(wall, [0, -0.3, az], 'y', ah + 0.3, ar - acut / Math.cos(Math.PI / (2 * AS)), AS, {}, ar - acut / Math.cos(Math.PI / (2 * AS)), true, 0, Math.PI);
    const aFace = (i: number): Face => {
      const a = -(i + 0.5) * Math.PI / AS, out: Vec3 = [Math.cos(a), 0, Math.sin(a)];
      return { origin: [out[0] * aap, 0, az + out[2] * aap], u: [out[2], 0, -out[0]], out, width: aside };
    };
    const aRing = (bucket: RegionalBucket, y: number, h: number, r: number, opts: EmitOptions, caps: boolean, i0 = 0, n = AS) =>
      sink.cylinder(bucket, [0, y, az], 'y', h, r, n, opts, r, caps, i0 * Math.PI / AS, n * Math.PI / AS);
    const lights = new Set([4, 8, 12]), strips = new Set([2, 6, 10, 14]);
    const awr = Math.min(0.22, aside / 2 - 0.09), aws = sillA + 1.85, fr = aside / 2 - 0.06, fs = ah - 0.4 - fr - 0.06;
    for (let i = 0; i < AS; i++) {
      const af = aFace(i), lit = lights.has(i);
      holedPolygon(sink, wall, af, [[-aside / 2, -0.3], [aside / 2, -0.3], [aside / 2, ah], [-aside / 2, ah]], lit ? [{ u0: -awr, u1: awr, y0: sillA + 0.05, y1: aws + awr }] : [], acut, 0.16);
      if (lit) {
        facePanel(sink, 'glass', af, 0, (sillA + 0.05 + aws) / 2, -0.148, 2 * awr, aws - sillA - 0.05, { decor: true, window: af.out });
        lunette(sink, 'glass', af, 0, aws, awr, -0.148, 4, { decor: true });
        spandrels(sink, wall, af, 0, aws, awr, 0.002, { decor: true }, 0, 4);
        arcRing(sink, af, 0, aws, awr, 0.1, 4);
      }
      if (strips.has(i)) faceBox(sink, wall, af, 0, (fl + fs) / 2, 0.03, 0.3, fs - fl, 0.06, { decor: true, shade: 1.05, fineSides: true }, { back: true });
      arcRing(sink, af, 0, fs, fr, 0.06, 3);
    }
    aRing('stone', -0.3, 0.75, ar + 0.07, { decor: true }, true);
    aRing('stone', sillA - 0.08, 0.1, ar + 0.08, { decor: true }, false);
    for (const y of [...lowBands, ...upBands]) if (y + 0.23 < fs - 0.1) aRing('structureMetal', y + 0.05, 0.13, ar + 0.03, BAND, false);
    aRing('stone', ah - 0.3, 0.3, ar + 0.16, { decor: true, shade: 0.94 }, true);
    sink.cylinder('structureMetal', [0, ah, az], 'y', ar * 0.75, ar + 0.3, 16, { colour: COPPER, decor: true }, 0.05, true, 0, Math.PI);
    // the bell tower over the west door
    const th = clampTo(nh * 2.5, 12, 22), tzc = (tz0 + tz1) / 2, bsill = th - 3.3, tmid = (eave + bsill) / 2;
    // (dome-detail-275) its stages' round-headed lights (it was blind to the belfry)
    const tLights: Opening[] = [];
    for (const face of ['left', 'right'] as const) {
      tLights.push({ face, storey: 0, kind: 'window', u: 0, w: 0.5, y0: eave + 0.05, h: 1.2, arch: {} });
      tLights.push({ face, storey: 0, kind: 'window', u: 0, w: 0.55, y0: tmid + 0.05, h: 1.4, arch: {} });
    }
    const lightUnit: HouseDialect['window'] = (s, face, o, y0) => {
      windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { ...STONE_WINDOW, surround: null, bars: 'none' }, look, 0.05);
      archGlazing(s, face, o.u, y0 + o.y0 + o.h, o.w / 2, STONE_WINDOW.frame);
      archHead(s, face, o.u, y0 + o.y0 + o.h, o.w / 2, 'stone', 0.12, 5);
    };
    // (props census #13, lane B 2026-10-14) the shaft to the belfry's sills (towerShaft), the belfry open through its
    // arches over it
    const tf: Face = { origin: [0, 0, tz1], u: [1, 0, 0], out: [0, 0, 1], width: tw };
    towerShaft(sink, wall, tzc, tw, bsill, { leaf: door, frame: { bucket: 'stone', width: 0.24, out: 0.08 }, steps: { bucket: 'stone' }, leafKind: 'panel' }, 1.3, 2.6, 0.4, tLights, lightUnit);
    const bow = tw * 0.36;
    openBelfry(sink, wall, 0, tzc, tw, bsill, th - 1.5, th, bow, COPPER, rgb(0x3a2e24));
    archHead(sink, tf, 0, 2.94, 0.9, 'stone', 0.22, 6);
    for (const [ox, oz, ux, uz] of [[0, 1, 1, 0], [1, 0, 0, -1], [0, -1, -1, 0], [-1, 0, 0, 1]] as const) {
      const f: Face = { origin: [ox * tw / 2, 0, tzc + oz * tw / 2], u: [ux, 0, uz], out: [ox, 0, oz], width: tw };
      // the red band round the shaft, broken at the west door's frame (it ran across the cut)
      const band = { decor: true, colour: RED_BAND } as const, reach = tw / 2 + 0.03, gap = 0.65 + 0.24;
      if (oz === 1) for (const sd of [-1, 1]) faceBox(sink, 'structureMetal', f, sd * (reach + gap) / 2, 1.39, 0, reach - gap, 0.28, 0.06, band);
      else faceBox(sink, 'structureMetal', f, 0, 1.39, 0, 2 * reach, 0.28, 0.06, band);
      archHead(sink, f, 0, th - 1.5, tw * 0.18, 'stone', 0.14, 6);
      faceBox(sink, 'stone', f, 0, th - 0.2, 0.08, tw + 0.2, 0.4, 0.16, { decor: true });
      // (dome-detail-275) the corner lesenes up the shaft (on its east face over the nave's ridge), the string courses at
      // the nave's eaves and between the stages, the belfry's sill cornice; in each belfry opening a colonnette parting
      // two round-headed lights, their heads solid under the relieving arch
      const l0 = oz === -1 ? ridgeTop : 0.3;
      for (const e of [-1, 1]) faceBox(sink, wall, f, e * (tw / 2 - 0.2), (l0 + bsill - 0.24) / 2, 0.03, 0.4, bsill - 0.24 - l0, 0.06, { decor: true, shade: 1.05, fineSides: true }, { back: true });
      for (const y of oz === -1 ? [tmid] : [eave, tmid]) faceBox(sink, 'stone', f, 0, y - 0.1, 0.05, tw + 0.12, 0.2, 0.1, { decor: true });
      faceBox(sink, 'stone', f, 0, bsill - 0.12, 0.09, tw + 0.24, 0.24, 0.18, { decor: true, shade: 0.95 });
      const hb = th - 1.5, lr = (bow - 0.14) / 4, ls = hb - lr;
      sink.cylinder('stone', facePoint(f, 0, bsill + 0.12, -0.06), 'y', ls - bsill - 0.24, 0.07, 6, { decor: true }, 0.07, false);
      faceBox(sink, 'stone', f, 0, bsill + 0.06, -0.06, 0.22, 0.12, 0.2, { decor: true });
      faceBox(sink, 'stone', f, 0, ls - 0.06, -0.06, 0.26, 0.12, 0.22, { decor: true });
      faceBox(sink, wall, f, 0, (ls + hb) / 2, -0.06, 0.14, hb - ls, 0.12, { decor: true });
      for (const e of [-1, 1]) spandrels(sink, wall, f, e * (0.07 + lr), ls, lr, -0.12, { decor: true }, 0.12, 3);
    }
    // (dome-detail-275) the cupola on a low round drum and its cornice (it sat straight on the belfry's head)
    const cr = tw * 0.4;
    sink.revolve(wall, [0, th, tzc], 'y', [[0, cr], [0.8, cr], [0.96, cr + 0.14], [0.96, 0]], 24, {});
    const top = dome(sink, 0, th + 0.96, tzc, cr, COPPER, 8);
    finial(sink, 0, top, tzc, 'cross', 0.8);
    // (dome-detail-275) the west portal: piers standing proud either side of the door on their bases under imposts, the
    // archivolt of voussoirs on them, the solid spandrels to a cornice under a gabled hood; the lintel, and in the
    // tympanum the icon of the patron saint on its lapis ground in a gilt frame
    const po = 0.3, pr = 1.45, pwid = 0.5, ps = 2.94, pTop = ps + pr + pwid / 2;
    for (const e of [-1, 1]) {
      faceBox(sink, 'stone', tf, e * pr, (ps - 0.16) / 2, po / 2, pwid, ps - 0.16, po, { decor: true }, { back: true });
      faceBox(sink, 'stone', tf, e * pr, 0.12, (po + 0.08) / 2, pwid + 0.12, 0.24, po + 0.08, { decor: true, shade: 0.92 }, { back: true });
      faceBox(sink, 'stone', tf, e * pr, ps - 0.08, (po + 0.08) / 2, pwid + 0.14, 0.16, po + 0.08, { decor: true, shade: 0.95 }, { back: true });
    }
    voussoirs(sink, tf, 0, ps, pr - pwid / 2, pwid, po, 7);
    spandrels(sink, 'stone', tf, 0, ps, pr + pwid / 2, 0, { decor: true, shade: 0.97 }, po, 5);
    faceBox(sink, 'stone', tf, 0, pTop + 0.1, (po + 0.12) / 2, 2 * (pr + pwid / 2) + 0.3, 0.2, po + 0.12, { decor: true }, { back: true });
    const gb = pr + pwid / 2 + 0.1;
    sink.prism('stone', ([[-gb, pTop + 0.2], [gb, pTop + 0.2], [0, pTop + 0.2 + gb * 0.42]] as const).map(([u, y]) => facePoint(tf, u, y, 0)), tf.out, po + 0.06, { decor: true });
    faceBox(sink, 'stone', tf, 0, 2.77, 0.04, 1.9, 0.34, 0.08, { decor: true });
    lunette(sink, 'stone', tf, 0, ps, 0.9, 0.012, 10, { decor: true, shade: 0.9 });
    lunette(sink, 'structureMetal', tf, 0, ps, 0.8, 0.018, 10, { decor: true, colour: GILT });
    lunette(sink, 'structureWood', tf, 0, ps, 0.7, 0.024, 10, { decor: true, colour: ICON_BLUE });
    sink.polygon('structureWood', ([[-0.32, 0.03], [0.32, 0.03], [0.2, 0.4], [-0.2, 0.4]] as const).map(([u, y]) => facePoint(tf, u, ps + y, 0.03)), { decor: true, fine: true, colour: ICON_RED });
    disc(sink, 'structureMetal', tf, 0, ps + 0.52, 0.14, 0.03, 10, { decor: true, fine: true, colour: GILT });
    disc(sink, 'structureWood', tf, 0, ps + 0.5, 0.075, 0.036, 8, { decor: true, fine: true, colour: ICON_FLESH });
    // (dome-detail-275) the church set into its ground: a stone step round its socle; the forecourt either side of the
    // tower paved, behind the churchyard's low wall on the street, broken by a shell at its inner end
    // and its stones fallen; a grave under its cross either side of the apse
    const step = { decor: true, shade: 0.9 } as const;
    for (const s of [-1, 1]) {
      sink.span('stone', s * nw / 2, -0.3, nz0, s * (nw / 2 + 0.34), 0.16, nz1 + 0.3, step);
      sink.span('stone', s * (tw / 2 - 0.02), -0.3, nz1 + 0.3, s * nw / 2, 0.16, nz1, step);
      sink.span('stone', s * ar, -0.3, nz0 - 0.3, s * (nw / 2 + 0.34), 0.16, nz0, step);
      sink.span('stone', s * tw / 2, -0.3, tz0, s * (tw / 2 + 0.28), 0.16, tz1, step);
    }
    aRing('stone', -0.3, 0.46, ar + 0.34, step, true);
    const yard0 = tw / 2 + 0.28, yard1 = W / 2 - 0.02, wz0 = D / 2 - 0.42;
    for (const s of [-1, 1]) {
      sink.span('stone', s * yard0, -0.2, nz1 + 0.3, s * yard1, 0.03, wz0, { decor: true, shade: 0.8 });
      const xe = Math.max(yard0 + 0.6, W / 2 - (2.0 + look() * 1.4));
      if (W / 2 - xe > 1.4) {
        const xw = s * (xe + 0.85);
        sink.span('stone', xw, -0.3, wz0, s * W / 2, 1.0, D / 2 - 0.02);
        sink.span('stone', xw - s * 0.05, 1.0, wz0 - 0.05, s * (W / 2 + 0.03), 1.1, D / 2 + 0.03, { decor: true, shade: 0.92 });
        sink.span('stone', s * (xe + 0.35), -0.3, wz0, xw, 0.65, D / 2 - 0.02);
        sink.span('stone', s * xe, -0.3, wz0 + 0.04, s * (xe + 0.35), 0.3, D / 2 - 0.06);
        for (let k = 0; k < 2; k++) {
          const x = s * (xe - 0.2 - look() * 0.9), z = wz0 - 0.2 - look() * 0.6, a = look() * 0.4, hb = 0.12 + look() * 0.1;
          sink.placed(look() * Math.PI, x, 0, z, () => sink.span('stone', -0.22 - a * 0.3, -0.05, -0.14, 0.22 + a * 0.3, hb, 0.14, { decor: true, shade: 0.85 }));
        }
      }
      const gx0 = ar + 0.7, gx1 = W / 2 - 0.5, gz0 = -D / 2 + 0.5, gz1 = az - 0.6;
      if (gx1 - gx0 > 1.2 && gz1 - gz0 > 1.4) for (let k = 0; k < 1; k++) {
        const x = s * (gx0 + (gx1 - gx0) * (k + 0.3 + look() * 0.4) / 2), z = gz0 + 0.9 + look() * (gz1 - gz0 - 1.4), yaw = (look() - 0.5) * 0.08;
        sink.span('stone', x - 0.35, -0.2, z - 0.9, x + 0.35, 0.18, z + 0.4, { decor: true, shade: 0.88 });
        sink.placed(yaw, x, 0, z + 0.4, () => {
          sink.span('stone', -0.07, 0.1, -0.06, 0.07, 1.25, 0.06, { decor: true });
          sink.span('stone', -0.32, 0.85, -0.055, 0.32, 0.98, 0.055, { decor: true });
        });
      }
    }
    sink.dressing(mobile, () => {
      const pocks = 7 + Math.floor(look() * 8);
      shellPocks(sink, tf, { u0: -tw / 2 + 0.2, u1: tw / 2 - 0.2, y0: 3.6, y1: th - 3 }, pocks,
        [{ u0: -gb - 0.1, u1: gb + 0.1, y0: 0, y1: pTop + 0.3 + gb * 0.42 }, ...tLights.filter((o) => o.face === 'front').map((o) => ({ u0: o.u - o.w / 2 - 0.25, u1: o.u + o.w / 2 + 0.25, y0: o.y0, y1: o.y0 + 0.3 + o.h + o.w / 2 + 0.2 }))], look, 'stone',
        Math.round(pocks * 0.6));
    });
  });
  return sink.finish();
};

/**
 * A clock's face on a wall (dome-detail-275: drawn out of the Catholic church's tower, the market hall's gable has one
 * too): the dial `r` across in a stone ring standing 10 cm proud, the twelve hour marks, the hands and the boss.
 */
function clockFace(sink: PartSink, face: Face, u: number, cy: number, r: number): void {
  const at = (rr: number, a: number, o: number): Vec3 => facePoint(face, u + Math.cos(a) * rr, cy + Math.sin(a) * rr, o), R = r + r * 0.27;
  sink.polygon('structureWood', Array.from({ length: 12 }, (_, j) => at(r, j / 12 * Math.PI * 2, 0.03)), { decor: true, colour: rgb(0xd8d2c0) });
  for (let j = 0; j < 12; j++) {
    const a0 = j / 12 * Math.PI * 2, a1 = (j + 1) / 12 * Math.PI * 2;
    sink.quad('stone', at(r, a0, 0.1), at(R, a0, 0.1), at(R, a1, 0.1), at(r, a1, 0.1), { decor: true });
    sink.quad('stone', at(r, a1, 0.1), at(r, a1, 0.0), at(r, a0, 0.0), at(r, a0, 0.1), { decor: true, shade: 0.7 });
    sink.quad('stone', at(R, a0, 0.1), at(R, a0, 0.0), at(R, a1, 0.0), at(R, a1, 0.1), { decor: true, shade: 0.85 });
    faceBox(sink, 'structureMetal', face, u + Math.cos(a0) * r * 0.83, cy + Math.sin(a0) * r * 0.83, 0.045, 0.05, 0.05, 0.03, { colour: IRON, decor: true, fine: true });
  }
  sink.member('structureMetal', facePoint(face, u, cy, 0.05), facePoint(face, u + r * 0.2, cy + r * 0.7, 0.05), 0.05, 0.02, face.out, { colour: IRON, decor: true, exposed: true }, 0);
  sink.member('structureMetal', facePoint(face, u, cy, 0.07), facePoint(face, u - r * 0.5, cy - r * 0.2, 0.07), 0.06, 0.02, face.out, { colour: IRON, decor: true, exposed: true }, 0);
  faceBox(sink, 'structureMetal', face, u, cy, 0.06, 0.1, 0.1, 0.06, { colour: IRON, decor: true });
}

/** The slate of the Catholic church's spire (zinc-grey). */
const SLATE = rgb(0x4d5357);

/**
 * The Catholic church, in the neo-Gothic of Sarajevo's parish churches (dome-detail-275: a plain nave and a plain shaft
 * under a smooth roof): the nave of dressed stone on its socle, its bays parted by buttresses stepped twice under their
 * weatherings, in each bay a lancet of two lights under a roundel (the mullion, the pointed heads, the hood mould on its
 * stops), corbels under the eaves' cornice, the steep roof's plain tiles in courses, the gables' coping, the east gable's
 * rose and cross over the chancel's polygonal apse (its lancets, the buttresses at its angles, its lead hips); the tower
 * over the west portal (the jambs, the archivolt's voussoirs, the tympanum's roundel, the wimperg over them), angle
 * buttresses up its front corners, string courses between its stages and their lancets, the clock, the belfry's twin
 * lights under gablets, pinnacles at its corners, the slate spire with its lucarnes and bands; the churchyard's paving
 * and its broken wall, a grave by the apse.
 */
const catholicChurch: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const f = fillOf(ctx.bounds, 0.1);
  sink.placed(0, f.cx, 0, f.cz, () => {
    const rng = ctx.rng, look = ctx.variant, mobile = ctx.tier === 'mobile';
    const W = clampTo(f.w, 6, 40), D = clampTo(f.d, 8, 40);
    // (dome-detail-275) the nave narrower than the lot (the churchyard either side), the tower's front on the street
    // edge, the chancel's apse on the back edge
    const nw = clampTo(W * 0.74, 5, 30), tw = clampTo(nw * 0.46, 3, 4.8);
    const tz1 = D / 2 - 0.5, tz0 = tz1 - tw, ar = clampTo(Math.min(nw * 0.3, (D - tw - 5.5) / 1.4), 1.4, 3.2);
    const az = -D / 2 + 0.6 + ar, nz0 = az, nz1 = tz0 + 0.3, nl = nz1 - nz0;
    const nh = clampTo(nw * 0.95, 6, 9), fl = 0.5, eave = fl + nh, REV = 0.42;
    const door = choose(rng(), DOOR_LEAVES);
    // (dome-detail-275) the lancets: two lights under a roundel in each bay, a single light in the west wall beside the
    // tower (the east window gave way to the apse)
    const lsill = 2.2, lh = clampTo(nh - 3.4, 3.2, 5.6);
    const openings: Opening[] = [];
    for (const face of ['left', 'right'] as const) for (const o of windowRhythm(face, 0, nl, { w: 1.3, h: lh, sill: lsill, spacing: 2.8, margin: 1.5 })) openings.push(o);
    if ((nw - tw) / 2 > 2.2) for (const s of [-1, 1]) openings.push({ face: 'front', storey: 0, kind: 'window', u: s * (tw + nw) / 4, w: 0.9, y0: lsill + 0.4, h: lh - 0.6 });
    const head = (s: PartSink, face: Face, o: Opening, y: number) => {
      const R = o.w / 2, spring = y + o.h - pointedRise(R);
      // the cut true to its point (the spandrels and the soffit), the hood mould over it on its stops
      pointedSpandrels(s, 'stone', face, o.u, spring, R, -REV + 0.01, REV - 0.01, { decor: true }, 4);
      pointedRing(s, 'stone', face, o.u, spring, R, 2 * R, 0.14, 0.015, { decor: true }, 4);
      for (const e of [-1, 1]) faceBox(s, 'stone', face, o.u + e * (R + 0.07), spring - 0.07, 0.05, 0.2, 0.14, 0.1, { decor: true, fine: true });
      return spring;
    };
    const dialect: HouseDialect = {
      window: (s, face, o, y0) => {
        const y = y0 + o.y0, R = o.w / 2, spring = head(s, face, o, y), back = -REV;
        windowUnit(s, face, o.u, y, o.w, spring - y, { ...STONE_WINDOW, surround: null, bars: 'none', frame: DARK_FRAME }, look, 0.1);
        if (o.w < 1.1) { pointedField(s, 'glass', face, o.u, spring, R, back + 0.012, { decor: true }); return; }
        // the tracery: the mullion up to the head's stone, the two lights' pointed heads and the roundel over them
        const rl = (R - 0.06) / 2, rr = Math.min(0.22, (pointedRise(R) - pointedRise(rl)) * 0.36);
        s.cylinder('stone', facePoint(face, o.u, y, back + 0.07), 'y', spring - y + pointedRise(rl) * 0.5, 0.06, 6, { decor: true, fine: true }, 0.06, false);
        pointedField(s, 'stone', face, o.u, spring, R, back + 0.006, { decor: true, shade: 0.86 }, 4);
        for (const e of [-1, 1]) pointedField(s, 'glass', face, o.u + e * (0.06 + rl), spring, rl, back + 0.012, { decor: true }, 2);
        disc(s, 'glass', face, o.u, spring + pointedRise(rl) + rr + 0.05, rr, back + 0.012, 8, { decor: true });
      },
      damaged: (s, face, o, y0) => { head(s, face, o, y0 + o.y0); },
      door: () => {},
    };
    // the apse's measures (its roof under the east gable's rose)
    const AS = 5, ah = fl + nh * 0.82, acut = 0.24, cosA = Math.cos(Math.PI / (2 * AS));
    const aside = 2 * ar * Math.sin(Math.PI / (2 * AS)), aap = ar * cosA, aRise = (aap + 0.35) * Math.tan(40 * Math.PI / 180);
    sink.placed(0, 0, 0, (nz0 + nz1) / 2, () => {
      const frame = buildHouse(sink, {
        w: nw, d: nl, plinth: { h: fl, out: 0.06, bucket: 'stone' }, storeys: [{ h: nh, wall: 'stone' }],
        roof: { kind: 'gable', pitchDeg: 52, eave: 0.35, verge: 0.2, thickness: 0.15, bucket: 'roof', ridge: 'saddle' },
        gableBucket: 'stone', openings, chimneys: [], gutters: { colour: ZINC }, verge: null, reveal: REV, rafters: null, spall: null,
      }, dialect);
      const b = frame.bodies[0], fc = frame.faces, rg = frame.roof;
      // (dome-detail-275) the plain tiles in courses
      roofCourses(sink, rg, frame.spec.roof, frame.roofPatch, look);
      // (dome-detail-275) the buttresses between the bays and in pairs at the corners, stepped twice under their weatherings
      const stages = [[fl + nh * 0.4, 0.85, 0.62], [fl + nh * 0.78, 0.53, 0.5]] as const;
      for (const name of ['left', 'right', 'front', 'back'] as const) {
        const face = fc[name], half = face.width / 2;
        const us = openings.filter((o) => o.face === name).map((o) => o.u).sort((p, q) => p - q);
        const at = name === 'left' || name === 'right' ? [-half + 0.31, ...us.slice(1).map((v, i) => (v + us[i]) / 2), half - 0.31] : [-half + 0.31, half - 0.31];
        for (const u of at) buttress(sink, 'stone', face, u, -0.3, stages);
      }
      // (dome-detail-275) the eaves' cornice in two steps under the roof's overhang, the corbels under it
      sink.band('stone', b.x0 - 0.1, eave - 0.62, b.z0 - 0.1, b.x1 + 0.1, eave - 0.47, b.z1 + 0.1, { decor: true });
      sink.band('stone', b.x0 - 0.2, eave - 0.47, b.z0 - 0.2, b.x1 + 0.2, eave - 0.3, b.z1 + 0.2, { decor: true, shade: 0.93 });
      for (const name of ['left', 'right'] as const) {
        const face = fc[name], half = face.width / 2, n = Math.max(2, Math.floor((2 * half - 0.5) / 0.62));
        for (let k = 0; k <= n; k++) faceBox(sink, 'stone', face, -half + 0.25 + (2 * half - 0.5) * k / n, eave - 0.74, 0.06, 0.16, 0.24, 0.12, { decor: true, fineSides: true });
      }
      // the gables' coping up the verges; the east gable's rose over the apse's roof and its cross on the apex
      if (rg.gable) for (const name of ['front', 'back'] as const) for (const e of [-1, 1]) {
        const face = fc[name], yAt = (x: number) => rg.ridgeY - x * rg.tanP - 0.15;
        sink.member('stone', facePoint(face, e * (rg.s + 0.05), yAt(rg.s + 0.05), 0), facePoint(face, 0, yAt(0), 0), 0.26, 0.14, face.out, { decor: true }, 0.02);
      }
      const back = fc.back, ry = eave + (rg.ridgeY - eave) * 0.45, rr = Math.min(0.95, (rg.ridgeY - eave) * 0.16);
      if (rg.gable && ry - rr - 0.3 > ah + aRise) {
        disc(sink, 'glass', back, 0, ry, rr, 0.01, 12, { decor: true, window: back.out });
        const at = (r: number, j: number) => facePoint(back, Math.cos(j * Math.PI / 6) * r, ry + Math.sin(j * Math.PI / 6) * r, 0.018);
        for (let j = 0; j < 12; j++) sink.quad('stone', at(rr, j), at(rr + 0.22, j), at(rr + 0.22, j + 1), at(rr, j + 1), { decor: true, shade: j % 2 ? 0.88 : 1 });
        for (let j = 0; j < 6; j++) {
          const t = j * Math.PI / 3;
          sink.member('stone', facePoint(back, Math.cos(t) * 0.16, ry + Math.sin(t) * 0.16, 0.012), facePoint(back, Math.cos(t) * rr, ry + Math.sin(t) * rr, 0.012), 0.07, 0.05, back.out, { decor: true, fine: true }, 0);
        }
        disc(sink, 'stone', back, 0, ry, 0.2, 0.03, 8, { decor: true });
      }
      if (rg.gable) {
        faceBox(sink, 'stone', back, 0, rg.ridgeTopY + 0.5, -0.12, 0.13, 1.2, 0.13, { decor: true });
        faceBox(sink, 'stone', back, 0, rg.ridgeTopY + 0.78, -0.12, 0.6, 0.13, 0.13, { decor: true });
      }
      // the splinters' pocks down both flanks, clear of the lancets
      sink.dressing(mobile, () => {
        for (const name of ['left', 'right'] as const) shellPocks(sink, fc[name], { u0: -nl / 2 + 0.8, u1: nl / 2 - 0.8, y0: 0.8, y1: eave - 1.2 }, 4 + Math.floor(look() * 6),
          openings.filter((o) => o.face === name).map((o) => ({ u0: o.u - o.w / 2 - 0.3, u1: o.u + o.w / 2 + 0.3, y0: fl + o.y0 - 0.1, y1: fl + o.y0 + o.h + 0.3 })), look, 'stone');
      });
    });
    // (dome-detail-275) the chancel's apse: five sides of a decagon, slabs round a core, three lancets cut through them,
    // a buttress at each angle, the cornice and the socle, the half pyramid of its roof with lead on its hips
    sink.cylinder('stone', [0, -0.3, az], 'y', ah + 0.3, ar - acut / cosA, AS, {}, ar - acut / cosA, true, 0, Math.PI);
    const aFace = (i: number): Face => {
      const a = -(i + 0.5) * Math.PI / AS, out: Vec3 = [Math.cos(a), 0, Math.sin(a)];
      return { origin: [out[0] * aap, 0, az + out[2] * aap], u: [out[2], 0, -out[0]], out, width: aside };
    };
    const awr = Math.min(0.32, aside / 2 - 0.24), ays = fl + 2.0, alh = Math.min(ah - ays - 1.0, 4.2);
    for (let i = 0; i < AS; i++) {
      const af = aFace(i), lit = i > 0 && i < AS - 1 && awr > 0.18 && alh > 2;
      holedPolygon(sink, 'stone', af, [[-aside / 2, -0.3], [aside / 2, -0.3], [aside / 2, ah], [-aside / 2, ah]], lit ? [{ u0: -awr, u1: awr, y0: ays, y1: ays + alh }] : [], acut, 0.16);
      if (!lit) continue;
      const spring = ays + alh - pointedRise(awr);
      facePanel(sink, 'glass', af, 0, (ays + spring) / 2, -0.148, 2 * awr, spring - ays, { decor: true, window: af.out });
      pointedField(sink, 'glass', af, 0, spring, awr, -0.148, { decor: true });
      pointedSpandrels(sink, 'stone', af, 0, spring, awr, -0.155, 0.155, { decor: true }, 3);
      pointedRing(sink, 'stone', af, 0, spring, awr, 2 * awr, 0.1, 0.015, { decor: true }, 3);
      faceBox(sink, 'stone', af, 0, ays - 0.05, 0.05, 2 * awr + 0.3, 0.1, 0.1, { decor: true });
    }
    const aRing = (y: number, h: number, out: number, opts: EmitOptions) => sink.cylinder('stone', [0, y, az], 'y', h, (aap + out) / cosA, AS, opts, (aap + out) / cosA, true, 0, Math.PI);
    aRing(-0.3, fl + 0.3, 0.07, { decor: true, shade: 0.92 });
    aRing(ah - 0.45, 0.17, 0.1, { decor: true });
    aRing(ah - 0.28, 0.28, 0.2, { decor: true, shade: 0.93 });
    for (let i = 1; i < AS; i++) {
      const a = -i * Math.PI / AS, out: Vec3 = [Math.cos(a), 0, Math.sin(a)];
      const bf: Face = { origin: [out[0] * ar, 0, az + out[2] * ar], u: [out[2], 0, -out[0]], out, width: 0.5 };
      buttress(sink, 'stone', bf, 0, -0.3, [[fl + nh * 0.36, 0.68, 0.44], [ah - 1.2, 0.42, 0.38]]);
    }
    const ra = (aap + 0.35) / cosA;
    sink.cylinder('roof', [0, ah, az], 'y', aRise, ra, AS, {}, 0.05, true, 0, Math.PI);
    const sinP = Math.sin(40 * Math.PI / 180), cosP = Math.cos(40 * Math.PI / 180);
    for (let i = 1; i < AS; i++) {
      const a = -i * Math.PI / AS;
      sink.member('structureMetal', [Math.cos(a) * ra, ah + 0.02, az + Math.sin(a) * ra], [0, ah + aRise - 0.02, az], 0.12, 0.05,
        [Math.cos(a) * sinP, cosP, Math.sin(a) * sinP], { colour: LEAD, decor: true }, 0.02);
    }
    // the tower: its shaft to the belfry's sills, its stages' lancets
    const th = clampTo(nh * 2.7, 14, 25), tzc = (tz0 + tz1) / 2, bs = th - 4.4, bh = th - 1.4, tmid = (eave + bs) / 2;
    const tRev = 0.45, tLights: Opening[] = [];
    // (light y0s over the shaft's 0.3 m plinth)
    tLights.push({ face: 'front', storey: 0, kind: 'window', u: 0, w: 0.8, y0: 6.6, h: Math.min(2.5, eave - 7.1) });
    tLights.push({ face: 'front', storey: 0, kind: 'window', u: 0, w: 0.7, y0: eave + 0.9, h: Math.min(2.5, tmid - eave - 1.6) });
    for (const face of ['left', 'right'] as const) {
      tLights.push({ face, storey: 0, kind: 'window', u: 0, w: 0.6, y0: eave + 0.3, h: Math.min(2.2, tmid - eave - 1.0) });
      tLights.push({ face, storey: 0, kind: 'window', u: 0, w: 0.6, y0: tmid + 0.3, h: Math.min(2.2, bs - tmid - 1.2) });
    }
    const lightUnit: HouseDialect['window'] = (s, face, o, y0) => {
      const y = y0 + o.y0, R = o.w / 2, spring = y + o.h - pointedRise(R);
      windowUnit(s, face, o.u, y, o.w, spring - y, { ...STONE_WINDOW, surround: null, bars: 'none', frame: DARK_FRAME }, look, 0.05);
      pointedField(s, 'glass', face, o.u, spring, R, -tRev + 0.012, { decor: true });
      pointedSpandrels(s, 'stone', face, o.u, spring, R, -tRev + 0.01, tRev - 0.01, { decor: true }, 3);
      pointedRing(s, 'stone', face, o.u, spring, R, 2 * R, 0.12, 0.015, { decor: true }, 3);
    };
    // (props census #13, lane B 2026-10-14) the shaft to the belfry's sills (towerShaft), the belfry open through it
    towerShaft(sink, 'stone', tzc, tw, bs, { leaf: door, frame: { bucket: 'stone', width: 0.1, out: 0.04 }, steps: { bucket: 'stone' }, leafKind: 'plank' }, 1.5, 2.9, tRev, tLights, lightUnit);
    const ow = tw * 0.36, oR = ow / 2, oSpring = bh - pointedRise(oR);
    openBelfry(sink, 'stone', 0, tzc, tw, bs, bh, th, ow, COPPER, rgb(0x3a2e24));
    const tFaces = ([[0, 1, 1, 0], [1, 0, 0, -1], [0, -1, -1, 0], [-1, 0, 0, 1]] as const).map(([ox, oz, ux, uz]): Face =>
      ({ origin: [ox * tw / 2, 0, tzc + oz * tw / 2], u: [ux, 0, uz], out: [ox, 0, oz], width: tw }));
    const tf = tFaces[0];
    // (dome-detail-275) angle buttresses up the front corners in three stages
    const tStages = [[eave - 1.2, 0.72, 0.62], [tmid - 0.9, 0.52, 0.55], [bs - 1.4, 0.32, 0.48]] as const;
    tFaces.forEach((face, k) => {
      if (k === 0) for (const e of [-1, 1]) buttress(sink, 'stone', face, e * (tw / 2 - 0.31), 0, tStages);
      else if (k !== 2) buttress(sink, 'stone', face, face.u[2] * (tw / 2 - 0.31), 0, tStages);
      // the string courses at the nave's eaves (over the roof behind), between the stages and under the belfry
      for (const y of k === 2 ? [tmid] : [eave, tmid]) faceBox(sink, 'stone', face, 0, y - 0.1, 0.06, tw + 0.12, 0.2, 0.12, { decor: true });
      faceBox(sink, 'stone', face, 0, bs - 0.12, 0.09, tw + 0.24, 0.24, 0.18, { decor: true, shade: 0.95 });
      faceBox(sink, 'stone', face, 0, th - 0.15, 0.1, tw + 0.25, 0.3, 0.2, { decor: true });
      // (dome-detail-275) the belfry's twin lights: the opening's pointed head, the colonnette, the tympanum with its two
      // lights' heads dark in it, the louvres across them; the gablet over it on the cornice, its finial
      pointedSpandrels(sink, 'stone', face, 0, oSpring, oR, -0.25, 0.25, { decor: true }, 4);
      const rl = (oR - 0.07) / 2;
      sink.cylinder('stone', facePoint(face, 0, bs, -0.14), 'y', oSpring - bs, 0.07, 6, { decor: true }, 0.07, false);
      pointedField(sink, 'stone', face, 0, oSpring, oR, -0.14, { decor: true, shade: 0.88 }, 4);
      for (const e of [-1, 1]) {
        pointedField(sink, 'dark', face, e * (0.07 + rl), oSpring, rl, -0.132, { decor: true }, 2);
        for (let j = 0; j < 4; j++) faceBox(sink, 'structureWood', face, e * (0.07 + rl), bs + 0.35 + j * (oSpring - bs - 0.4) / 4, -0.2, 2 * rl, 0.07, 0.05, { colour: rgb(0x4a3d30), decor: true, fine: true });
      }
      const gw = oR + 0.35;
      sink.prism('stone', ([[-gw, th - 0.3], [gw, th - 0.3], [0, th + 1.5]] as const).map(([u, y]) => facePoint(face, u, y, -0.7)), face.out, 0.9, { decor: true });
      faceBox(sink, 'stone', face, 0, th + 1.75, -0.28, 0.13, 0.6, 0.13, { decor: true });
    });
    // (dome-detail-275) the pinnacles at the corners of the tower's head, their pyramids
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x = sx * (tw / 2 - 0.24), z = tzc + sz * (tw / 2 - 0.24);
      sink.span('stone', x - 0.2, th, z - 0.2, x + 0.2, th + 1.2, z + 0.2, { decor: true });
      sink.cylinder('stone', [x, th + 1.2, z], 'y', 1.1, 0.3, 4, { decor: true, shade: 0.94 }, 0.02, true, Math.PI / 4);
    }
    // the clock on the front between the stage's lancet and the belfry (the judges: "the tower's clock is a painted
    // 10-gon cream plate")
    const cy = (tmid + bs) / 2 + 0.15;
    clockFace(sink, tf, 0, cy, 0.6);
    // (dome-detail-275) the spire: slate on eight faces inside the pinnacles, two zinc bands, a lucarne on each cardinal
    // face under its gable, the gilt cross
    const sp = clampTo(th * 0.5, 6, 12), rs = tw * 0.5, ap0 = rs * Math.cos(Math.PI / 8);
    sink.cylinder('structureMetal', [0, th, tzc], 'y', sp, rs, 8, { colour: SLATE }, 0.04, true, Math.PI / 8);
    const rAt = (h: number) => rs + (0.04 - rs) * h / sp, apAt = (h: number) => ap0 * (1 - h / sp);
    for (const k of [0.34, 0.64]) sink.cylinder('structureMetal', [0, th + sp * k, tzc], 'y', 0.18, rAt(sp * k) + 0.05, 8, { colour: shade(ZINC, 1.1), decor: true }, rAt(sp * k + 0.18) + 0.05, true, Math.PI / 8);
    for (const [dx, dz] of [[0, 1], [1, 0], [0, -1], [-1, 0]] as const) {
      const F: Face = { origin: [0, 0, tzc], u: [dz, 0, -dx], out: [dx, 0, dz], width: 1 };
      const y0 = 2.1, y1 = 2.9, oIn = apAt(y1 + 0.55) - 0.12, oOut = apAt(y0) + 0.06;
      faceBox(sink, 'structureMetal', F, 0, th + (y0 + y1) / 2, (oIn + oOut) / 2, 0.66, y1 - y0, oOut - oIn, { colour: SLATE, decor: true });
      sink.prism('structureMetal', ([[-0.4, th + y1], [0.4, th + y1], [0, th + y1 + 0.5]] as const).map(([u, y]) => facePoint(F, u, y, oIn)), F.out, oOut - oIn + 0.04, { colour: shade(SLATE, 0.9), decor: true });
      facePanel(sink, 'dark', F, 0, th + (y0 + y1) / 2 - 0.04, oOut + 0.004, 0.36, 0.56, { decor: true });
    }
    finial(sink, 0, th + sp - 0.1, tzc, 'cross', 0.8);
    // (dome-detail-275) the west portal: the jambs proud either side of the door under their capitals, the pointed
    // archivolt of voussoirs on them, the tympanum over the door's lintel with its roundel, the wimperg over the arch
    // (its field, its raking copings and its finial)
    const pR = 0.8, pw = 0.44, po = 0.4, ps = 3.2, gb = pR + pw + 0.12, hg = Math.max(2.4, pointedRise(pR, 2 * pR + pw) + 0.7);
    for (const e of [-1, 1]) {
      faceBox(sink, 'stone', tf, e * (pR + pw / 2), ps / 2, po / 2, pw, ps, po, { decor: true }, { back: true });
      faceBox(sink, 'stone', tf, e * (pR + pw / 2), ps - 0.08, (po + 0.06) / 2, pw + 0.12, 0.16, po + 0.06, { decor: true, shade: 0.94 }, { back: true });
      faceBox(sink, 'stone', tf, e * (pR + pw / 2), 0.15, (po + 0.06) / 2, pw + 0.12, 0.3, po + 0.06, { decor: true, shade: 0.9 }, { back: true });
    }
    const mid = pointedArc(tf, 0, ps, pR, 2 * pR + pw / 2, 0, 4);
    for (let j = 0; j + 1 < mid.length; j++) sink.member('stone', mid[j], mid[j + 1], pw, po + (j % 2) * 0.02, tf.out, { decor: true, exposed: true, shade: j % 2 ? 0.9 : 1 }, 0);
    pointedField(sink, 'stone', tf, 0, ps, pR, 0.015, { decor: true, shade: 0.84 }, 4);
    disc(sink, 'structureMetal', tf, 0, ps + 0.58, 0.24, 0.03, 10, { decor: true, colour: GILT });
    disc(sink, 'structureWood', tf, 0, ps + 0.58, 0.17, 0.036, 10, { decor: true, colour: ICON_BLUE });
    const ext = pointedArc(tf, 0, ps, pR, 2 * pR + pw, 0.1, 4), G = facePoint(tf, 0, ps + hg, 0.1);
    facing(sink, 'stone', [G, ...ext.slice(0, 5).reverse(), facePoint(tf, gb, ps, 0.1)], tf.out, { decor: true, shade: 0.96 });
    facing(sink, 'stone', [G, ...ext.slice(4), facePoint(tf, -gb, ps, 0.1)], tf.out, { decor: true, shade: 0.96 });
    for (const e of [-1, 1]) sink.member('stone', facePoint(tf, e * gb, ps, 0.1), G, 0.24, 0.22, tf.out, { decor: true });
    faceBox(sink, 'stone', tf, 0, ps + hg + 0.35, 0.2, 0.14, 0.75, 0.14, { decor: true });
    faceBox(sink, 'stone', tf, 0, ps + hg + 0.5, 0.2, 0.46, 0.13, 0.14, { decor: true });
    // (dome-detail-275) the church set into its ground: the socle step down the flanks, the forecourt paved before the
    // tower and down both sides; the churchyard's wall along the lot's sides, broken by a shell on one, its stones
    // fallen; a grave by the apse under its cross
    const step = { decor: true, shade: 0.9 } as const;
    for (const s of [-1, 1]) sink.span('stone', s * nw / 2, -0.3, nz0, s * (nw / 2 + 0.3), 0.14, nz1, step);
    sink.span('stone', -W / 2 + 0.02, -0.2, tz1, W / 2 - 0.02, 0.03, D / 2 - 0.02, { decor: true, shade: 0.8 });
    const yard0 = nw / 2 + 0.3, yard1 = W / 2 - 0.45, hit = look() < 0.5 ? -1 : 1;
    for (const s of [-1, 1]) {
      if (yard1 - yard0 > 0.6) sink.span('stone', s * yard0, -0.2, tz0, s * yard1, 0.02, tz1, { decor: true, shade: 0.78 });
      if (W / 2 - nw / 2 < 1.0) continue;
      const wx0 = s * (W / 2 - 0.4), wx1 = s * (W / 2 - 0.02), za = -D / 2 + 0.02, zb = tz1 - 0.2;
      const runs: Array<[number, number]> = s === hit ? ((): Array<[number, number]> => { const g = za + (zb - za) * (0.35 + look() * 0.3); return [[za, g - 0.9], [g + 0.9, zb]]; })() : [[za, zb]];
      for (const [z0, z1] of runs) {
        if (z1 - z0 < 0.5) continue;
        sink.span('stone', wx0, -0.3, z0, wx1, 1.0, z1);
        sink.span('stone', wx0 - s * 0.05, 1.0, z0 - 0.05, wx1 + s * 0.03, 1.1, z1 + 0.05, { decor: true, shade: 0.92 });
      }
      if (s === hit) {
        const g = (runs[0][1] + runs[1][0]) / 2;
        sink.span('stone', wx0, -0.3, g - 0.9, wx1, 0.45, g - 0.5);
        for (let k = 0; k < 3; k++) {
          const x = s * (W / 2 - 0.3 - look() * 1.0), z = g + (look() - 0.5) * 1.6, hb = 0.12 + look() * 0.1;
          sink.placed(look() * Math.PI, x, 0, z, () => sink.span('stone', -0.22, -0.05, -0.14, 0.22, hb, 0.14, { decor: true, shade: 0.85 }));
        }
      }
    }
    const gx = (ar + 0.9 + Math.max(ar + 1.5, W / 2 - 0.9)) / 2 * (look() < 0.5 ? -1 : 1), gz = -D / 2 + 1.3;
    if (W / 2 - ar > 2.2) {
      sink.span('stone', gx - 0.35, -0.2, gz - 0.9, gx + 0.35, 0.18, gz + 0.4, { decor: true, shade: 0.88 });
      sink.span('stone', gx - 0.07, 0.1, gz + 0.34, gx + 0.07, 1.25, gz + 0.46, { decor: true });
      sink.span('stone', gx - 0.32, 0.85, gz + 0.345, gx + 0.32, 0.98, gz + 0.455, { decor: true });
    }
    sink.dressing(mobile, () => shellPocks(sink, tf, { u0: -tw / 2 + 0.7, u1: tw / 2 - 0.7, y0: 4, y1: bs - 0.5 }, 8 + Math.floor(look() * 10),
      [{ u0: -gb - 0.1, u1: gb + 0.1, y0: 0, y1: ps + hg + 1 }, { u0: -0.9, u1: 0.9, y0: cy - 0.9, y1: cy + 0.9 },
        ...tLights.filter((o) => o.face === 'front').map((o) => ({ u0: o.u - o.w / 2 - 0.25, u1: o.u + o.w / 2 + 0.25, y0: o.y0, y1: o.y0 + o.h + 0.6 }))], look, 'stone'));
  });
  return sink.finish();
};

// ------------------------------------------------------------------------------------------------ the market hall

/**
 * The Austro-Hungarian market hall (the city market's, 1895; dome-detail-275: a plain ochre box under a smooth roof): the
 * hall on its plinth and a course of dressed stone, pilasters parting its bays on their bases under capitals, two tiers
 * of arched windows, the cornice and the plain tiles in courses; the gable front's pilasters either side of the great
 * arched gate (its keystone), the inscription panel over it, an arched light either side, the raking cornice up the
 * gable, the clock in it and the acroterion on its apex; the back gable's cornice and oculus; the ridge lantern's
 * louvres under its own tiles; the downpipes off the gutters; the siege's sandbags piled either side of the gate.
 */
const marketHall: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const f = fillOf(ctx.bounds, 0.15);
  sink.placed(0, f.cx, 0, f.cz, () => {
    const rng = ctx.rng, look = ctx.variant, mobile = ctx.tier === 'mobile';
    // the eaves (0.6 m) and the verges (0.35 m) on the lot's fill: the walls stand in by them
    const W = clampTo(f.w - 1.2, 7, 40), D = clampTo(f.d - 0.7, 9, 50);
    const hH = clampTo(W * 0.6, 6, 9.5);
    const door = choose(rng(), DOOR_LEAVES);
    // (dome-detail-275) the gate round-headed, its fanlight in the head (it was square under a relieving ring)
    const gate: Opening = { face: 'front', storey: 0, kind: 'gate', u: 0, w: clampTo(W * 0.28, 2.6, 4.2), y0: 0, h: clampTo(hH * 0.42, 2.8, 4.0), arch: {} };
    const openings: Opening[] = [gate];
    for (const face of ['left', 'right'] as const) {
      for (const o of windowRhythm(face, 0, D, { w: 1.5, h: hH * 0.3, sill: 1.0, spacing: 3.4, margin: 1.6 })) openings.push(o);
      for (const o of windowRhythm(face, 0, D, { w: 1.5, h: hH * 0.24, sill: hH * 0.56, spacing: 3.4, margin: 1.6 })) openings.push(o);
    }
    openings.push({ face: 'back', storey: 0, kind: 'door', u: 0, w: 1.4, y0: 0, h: 2.6 });
    // (dome-detail-275) the gables' pilasters either side of the gate, an arched light in each upper tier beyond them
    const gr = gate.w / 2 + 0.4, pu = gr + 0.5, lu = (pu + 0.35 + W / 2 - 0.55) / 2;
    if (W / 2 - 0.55 - (pu + 0.35) > 2.0) for (const face of ['front', 'back'] as const) for (const e of [-1, 1]) {
      openings.push({ face, storey: 0, kind: 'window', u: e * lu, w: 1.3, y0: hH * 0.56, h: hH * 0.24 });
    }
    const dialect: HouseDialect = {
      window: (s, face, o, y0) => {
        windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { ...STONE_WINDOW, bars: 'six', frame: rgb(0x5a5f5c) }, look, 0.05);
        archHead(s, face, o.u, y0 + o.y0 + o.h + 0.26, o.w / 2 + 0.18, 'stone', 0.18, 6);
      },
      door: (s, face, o, y0, frame) => {
        if (o.kind === 'gate') {
          gateUnit(s, face, o.u, y0 + o.y0, o.w, o.h, door, { bucket: 'stone', width: 0.36, out: 0.14 });
          archGlazing(s, face, o.u, y0 + o.y0 + o.h, o.w / 2, shade(door, 0.8));
          archHead(s, face, o.u, y0 + o.y0 + o.h, o.w / 2, 'stone', 0.36, 9);
          return;
        }
        doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { leaf: door, frame: { bucket: 'stone', width: 0.2, out: 0.08 }, steps: { bucket: 'stone' }, leafKind: 'plank' }, frame.floors[o.storey] + o.y0);
      },
    };
    // (props census #7, lane B 2026-10-14: the shell holes in the left side were dark plates on the render) two shells'
    // breaches cut through the side wall clear of its windows, into the hall's dark
    const breaches: Array<{ face: 'left'; storey: number; u: number; y: number; r: number; seed: number; spall: RegionalBucket }> = [];
    for (let k = 0; k < 2; k++) {
      const u = (look() - 0.5) * D * 0.7, y = hH * (0.45 + look() * 0.1) - 0.5, r = 0.4 + look() * 0.3;
      const clear = openings.filter((o) => o.face === 'left').every((o) => Math.abs(o.u - u) > o.w / 2 + r + 0.15 || y + r + 0.15 < o.y0 || y - r - 0.15 > o.y0 + o.h);
      if (clear) breaches.push({ face: 'left', storey: 0, u, y, r, seed: Math.floor(look() * 1e9), spall: 'stone' });
    }
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: 0.5, out: 0.06, bucket: 'stone' }, storeys: [{ h: hH, wall: 'plaster2' }],
      // (dome-detail-275, the roof sweep) the plain tiles in their courses in the shared relief (sarajevoParts PLAIN_TILES;
      // they were roofCourses' fine courses, gone on a phone)
      roof: { kind: 'gable', pitchDeg: 28, eave: 0.6, verge: 0.35, thickness: 0.16, bucket: 'roof', ridge: 'saddle', relief: PLAIN_TILES }, gableBucket: 'plaster2',
      openings, chimneys: [], gutters: { colour: ZINC }, verge: null, reveal: 0.34, rafters: null, spall: 'stone', breaches,
    }, dialect);
    const b = frame.bodies[0], rg = frame.roof, fc = frame.faces;
    sink.band('stone', b.x0 - 0.2, hH - 0.15, b.z0 - 0.2, b.x1 + 0.2, hH + 0.4, b.z1 + 0.2, { decor: true });
    // (dome-detail-275) the cornice's lower step
    sink.band('stone', b.x0 - 0.1, hH - 0.4, b.z0 - 0.1, b.x1 + 0.1, hH - 0.15, b.z1 + 0.1, { decor: true, shade: 0.92 });
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      sink.span('stone', sx > 0 ? b.x1 - 0.5 : b.x0 - 0.12, 0, sz > 0 ? b.z1 - 0.5 : b.z0 - 0.12, sx > 0 ? b.x1 + 0.12 : b.x0 + 0.5, hH - 0.15, sz > 0 ? b.z1 + 0.12 : b.z0 + 0.5, { decor: true });
      // (dome-detail-275) the downpipe off the gutter beside the corner pilaster
      sink.cylinder('structureMetal', [sx * (W / 2 + 0.06), 0.05, sz * (D / 2 - 0.75)], 'y', hH + 0.45, 0.06, 6, { colour: ZINC, decor: true }, 0.06, false);
    }
    // (dome-detail-275) a course of dressed stone over the plinth, broken by the gate and the door; the pilasters between
    // the bays (on their bases, under their capitals) and either side of the gate
    for (const name of ['left', 'right', 'front', 'back'] as const) {
      const face = fc[name], half = face.width / 2 - 0.5;
      const cut = name === 'front' ? gate.w / 2 + 0.4 : name === 'back' ? 0.95 : 0;
      for (const [u0, u1] of (cut ? [[-half, -cut], [cut, half]] : [[-half, half]]) as Array<[number, number]>) faceBox(sink, 'stone', face, (u0 + u1) / 2, 0.75, 0.04, u1 - u0, 0.5, 0.08, { decor: true, shade: 0.88 });
    }
    const pilaster = (face: Face, u: number, w: number) => {
      faceBox(sink, 'plaster2', face, u, (1.0 + hH - 0.55) / 2, 0.05, w, hH - 1.55, 0.1, { decor: true, shade: 1.07, fineSides: true });
      faceBox(sink, 'stone', face, u, 0.9, 0.08, w + 0.14, 0.3, 0.16, { decor: true, fineSides: true });
      faceBox(sink, 'stone', face, u, hH - 0.4, 0.09, w + 0.18, 0.3, 0.18, { decor: true, fineSides: true });
    };
    for (const name of ['left', 'right'] as const) {
      const us = [...new Set(openings.filter((o) => o.face === name).map((o) => Math.round(o.u * 1000) / 1000))].sort((p, q) => p - q);
      for (let i = 0; i + 1 < us.length; i++) pilaster(fc[name], (us[i] + us[i + 1]) / 2, 0.56);
    }
    if (W / 2 - 0.55 > pu + 0.4) for (const name of ['front', 'back'] as const) for (const e of [-1, 1]) pilaster(fc[name], e * pu, 0.7);
    // (dome-detail-275) the gate's keystone, the inscription panel over the arch under the cornice
    const ff = fc.front, ringTop = 0.5 + gate.h + gate.w / 2 + 0.36;
    faceBox(sink, 'stone', ff, 0, ringTop - 0.15, 0.12, 0.5, 0.7, 0.24, { decor: true, shade: 0.95 });
    if (hH - 0.42 - (ringTop + 0.25) > 0.3) {
      const py = (ringTop + 0.25 + hH - 0.42) / 2, ph = hH - 0.42 - ringTop - 0.25;
      faceBox(sink, 'stone', ff, 0, py, 0.04, Math.min(4.2, W * 0.3), ph, 0.08, { decor: true });
      faceBox(sink, 'stone', ff, 0, py, 0.085, Math.min(3.9, W * 0.28), ph * 0.6, 0.01, { decor: true, shade: 0.72, fine: true });
    }
    // the ridge lantern: a louvred clerestory along the ridge under its own roof (props census #4, lane B 2026-10-14:
    // "a dark panel on a plaster box, slats on it"): its sill wall on the ridge and the wall plate its roof sits on,
    // carried on the end walls and piers; between them the louvres, in front of the open dark of the roof space
    const lw = clampTo(W * 0.22, 1.6, 3.4), ll = D - 3.0;
    const ly0 = rg.ridgeY + 0.3, ly1 = rg.ridgeY + 0.95;
    sink.span('plaster2', -lw / 2, rg.ridgeY - 1.0, -ll / 2, lw / 2, ly0, ll / 2);
    sink.span('plaster2', -lw / 2, ly1, -ll / 2, lw / 2, rg.ridgeY + 1.1, ll / 2);
    const piers = Math.max(2, Math.round(ll / 3));
    for (let k = 0; k <= piers; k++) {
      // (the end walls 30 cm thick at the lantern's ends, the piers 30 cm between)
      const z = -ll / 2 + ll * k / piers, z0 = k === 0 ? z : k === piers ? z - 0.3 : z - 0.15, z1 = k === 0 ? z + 0.3 : k === piers ? z : z + 0.15;
      sink.span('plaster2', -lw / 2, ly0, z0, lw / 2, ly1, z1);
    }
    sink.span('dark', -lw / 2 + 0.3, ly0, -ll / 2 + 0.3, lw / 2 - 0.3, ly1, ll / 2 - 0.3, { decor: true });
    for (const s of [-1, 1]) {
      const f: Face = { origin: [s * lw / 2, 0, 0], u: [0, 0, -s], out: [s, 0, 0], width: ll };
      if (!mobile) for (let y = ly0 + 0.05; y < ly1 - 0.04; y += 0.16) faceBox(sink, 'structureWood', f, 0, y, 0.03, ll - 0.6, 0.04, 0.06, { colour: IRON, decor: true, fine: true });
    }
    const cap: RoofSpec = { kind: 'gable', pitchDeg: 26, eave: 0.3, verge: 0.3, thickness: 0.12, bucket: 'roof', ridge: 'saddle', relief: PLAIN_TILES };
    const lrg = roofGeometry(lw, ll, rg.ridgeY + 1.1, cap);
    emitRoof(sink, lrg, cap);
    // (dome-detail-275) the gables: the raking cornice up each verge, the acroterion on the apex; the clock in the front
    // gable (it was a cream 12-gon with one hand), an oculus in the back's
    const clockY = hH + (rg.ridgeY - hH) * 0.42;
    if (rg.gable) for (const name of ['front', 'back'] as const) {
      const face = fc[name], yAt = (x: number) => rg.ridgeY - x * rg.tanP - 0.17;
      for (const e of [-1, 1]) sink.member('stone', facePoint(face, e * (rg.s + 0.1), yAt(rg.s + 0.1), 0), facePoint(face, 0, yAt(0), 0), 0.34, 0.16, face.out, { decor: true }, 0.02);
      faceBox(sink, 'stone', face, 0, rg.ridgeTopY + 0.3, -0.06, 0.5, 0.6, 0.3, { decor: true });
    }
    clockFace(sink, ff, 0, clockY, Math.min(0.62, (rg.ridgeY - hH) * 0.2));
    disc(sink, 'stone', fc.back, 0, clockY, 0.62, 0.02, 12, { decor: true });
    disc(sink, 'dark', fc.back, 0, clockY, 0.44, 0.03, 10, { decor: true });
    // (dome-detail-275) the siege: sandbags piled either side of the gate
    for (const e of [-1, 1]) {
      let k = 0;
      for (const [n, y] of [[3, 0.12], [2, 0.36], [1, 0.6]] as const) for (let j = 0; j < n; j++) {
        const u = e * (gate.w / 2 + 0.95 + (j - (n - 1) / 2) * 0.62 + (look() - 0.5) * 0.08);
        faceBox(sink, 'structureWood', ff, u, y, 0.26 + (k++ % 2) * 0.03, 0.58, 0.25, 0.4, { colour: shade(HESSIAN, 0.85 + look() * 0.25), decor: true });
      }
    }
  });
  return sink.finish();
};

// ------------------------------------------------------------------------------------------------ the čaršija row

/** (dome-detail-275) The wares on a let-down counter: sacks of hessian, crates, copper. */
const WARES: readonly Rgb[] = [HESSIAN, rgb(0x8a6a3e), COPPER, rgb(0x9a4632), rgb(0x6b6a4a)];

/**
 * A čaršija row: single-storey timber shops on a stone sill under one deep-eaved roof of canal tiles, their fronts to
 * both long sides and the +z end, each in its timber frame (posts, the lintel beam), the ćepenci closed and barred or let
 * down: the lower leaf a counter on its brackets with its wares, the upper propped up as an awning; the kaldrma along
 * the fronts and its gutter; over the row's far end a han, its whitewashed upper storey oversailing on beam ends, a
 * doksat on its brackets over the street, its own roof of canal tiles. (dome-detail-275: smooth roofs over blank fronts)
 */
const carsija: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const f = fillOf(ctx.bounds, 0.1);
  sink.placed(0, f.cx, 0, f.cz, () => {
    const rng = ctx.rng, look = ctx.variant, mobile = ctx.tier === 'mobile';
    // the deep eaves (0.85 m over the shopfronts, 0.55 m at the ends) reach the lot's fill: the walls stand in by them
    const W = clampTo(f.w - 1.7, 3.4, 40), D = clampTo(f.d - 1.1, 6, 40);
    // a double row across the whole lot: shops back to back, their fronts to both long sides
    const sd = W, cx = 0;
    const hanL = clampTo(D * 0.36, 3.5, 8), sL = D - hanL;
    const timber = choose(rng(), TIMBER);
    const sH = 3.1;
    // the shops: the shopfronts along the +x side and the +z end, closed or open as counters
    const shopOpenings: Opening[] = [];
    const n = Math.max(2, Math.floor((sL - 0.6) / 3.2));
    for (let k = 0; k < n; k++) for (const face of ['right', 'left'] as const) {
      shopOpenings.push({ face, storey: 0, kind: 'shopfront', u: -sL / 2 + 0.3 + (sL - 0.6) * (k + 0.5) / n, w: 2.5, y0: 0, h: 2.45 });
    }
    shopOpenings.push({ face: 'front', storey: 0, kind: 'shopfront', u: 0, w: Math.min(2.4, sd - 1.0), y0: 0, h: 2.45 });
    const wood = (k: number) => ({ colour: shade(timber, k), decor: true } as const);
    const dialect: HouseDialect = {
      window: (s, face, o, y0) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { frame: DARK_FRAME, frameWidth: 0.05, frameOut: 0.04, bars: 'six', surround: null, sill: { bucket: 'structureWood', out: 0.08, colour: timber }, shutters: { colour: shade(timber, 1.1), kind: 'plank', closed: 0.3 } }, look, 0.06),
      door: (s, face, o, y0) => {
        const y = y0 + o.y0, r = s.recess, back = r > 0 ? -r : 0;
        // (dome-detail-275) the shop's timber frame: its posts at the jambs, the lintel beam over the ćepenci
        for (const e of [-1, 1]) faceBox(s, 'structureWood', face, o.u + e * (o.w / 2 + 0.07), y + (o.h + 0.1) / 2, 0.05, 0.14, o.h + 0.1, 0.1, { ...wood(0.9), fineSides: true });
        faceBox(s, 'structureWood', face, o.u, y + o.h + 0.1, 0.06, o.w + 0.42, 0.2, 0.12, { ...wood(0.82), fineSides: true });
        if (look() >= 0.32) {
          // the closed ćepenci: the two leaves of boards across the opening on their battens, barred for the siege
          for (const t of [0.27, 0.73]) {
            faceBox(s, 'structureWood', face, o.u, y + o.h * t, back + 0.05, o.w, o.h * 0.44, 0.05, wood(0.95 + look() * 0.15));
            for (const e of [-1, 1]) faceBox(s, 'structureWood', face, o.u + e * o.w * 0.3, y + o.h * t, back + 0.09, 0.1, o.h * 0.38, 0.03, { ...wood(0.78), fine: true });
          }
          faceBox(s, 'structureMetal', face, o.u, y + o.h * 0.5, back + 0.11, o.w + 0.1, 0.06, 0.03, { colour: IRON, decor: true, fine: true });
          return;
        }
        // let down: the shop's dark, the lower leaf a counter on its brackets with its wares, the upper propped up
        faceBox(s, 'dark', face, o.u, y + o.h / 2, back + 0.01, o.w, o.h, 0.01, { decor: true });
        faceBox(s, 'structureWood', face, o.u, y + 0.82, 0.3, o.w, 0.06, 0.7, wood(1));
        for (const e of [-1, 1]) s.member('structureWood', facePoint(face, o.u + e * (o.w / 2 - 0.15), y + 0.35, 0), facePoint(face, o.u + e * (o.w / 2 - 0.15), y + 0.8, 0.5), 0.06, 0.06, [face.u[0], 0, face.u[2]], { ...wood(0.8), exposed: true }, 0.03);
        for (let j = 0; j < 3; j++) {
          const wu = o.u + (j - 1) * o.w * 0.3 + (look() - 0.5) * 0.15, hb = 0.18 + look() * 0.16;
          faceBox(s, 'structureWood', face, wu, y + 0.85 + hb / 2, 0.25 + look() * 0.2, 0.4 + look() * 0.2, hb, 0.3, { colour: choose(look(), WARES), decor: true });
        }
        const A = facePoint(face, o.u, y + o.h + 0.02, 0.04), tilt = 0.25 + look() * 0.25;
        const B: Vec3 = [A[0] + face.out[0] * Math.cos(tilt) * 0.95, A[1] - Math.sin(tilt) * 0.95, A[2] + face.out[2] * Math.cos(tilt) * 0.95];
        s.member('structureWood', A, B, o.w, 0.05, normalize3([face.out[0] * Math.sin(tilt), Math.cos(tilt), face.out[2] * Math.sin(tilt)]), { ...wood(1.05), exposed: true }, 0.03);
      },
    };
    sink.placed(0, cx, 0, D / 2 - sL / 2, () => {
      const fr = buildHouse(sink, {
        w: sd, d: sL, plinth: { h: 0.4, out: 0.04, bucket: 'stone' }, storeys: [{ h: sH, wall: 'plaster' }],
        roof: { kind: 'hip', pitchDeg: 22, eave: 0.85, verge: 0.55, thickness: 0.14, bucket: 'roof', ridge: 'round' }, gableBucket: 'plaster', openings: shopOpenings,
        chimneys: [], gutters: null, verge: null, reveal: 0.12, rafters: mobile ? null : timber, spall: 'stone',
      }, dialect);
      // (dome-detail-275) the canal tiles in relief
      canalTiles(sink, fr.roof, fr.spec.roof, fr.roofPatch, look);
      // the posts carrying the deep eaves over the shopfronts
      if (!mobile) for (let k = 0; k <= n; k++) for (const sx of [-1, 1]) {
        const z = -sL / 2 + 0.3 + (sL - 0.6) * k / n;
        sink.member('structureWood', [sx * (sd / 2 + 0.05), sH * 0.55, z], [sx * (sd / 2 + 0.7), sH + 0.2, z], 0.12, 0.12, [0, 0, 1], { colour: timber, decor: true, exposed: true }, 0);
      }
      // (dome-detail-275) the wall plate under the eaves along the fronts; the kaldrma before them, its gutter
      for (const sx of [-1, 1]) {
        sink.span('structureWood', sx * sd / 2, 0.4 + sH - 0.22, -sL / 2, sx * (sd / 2 + 0.1), 0.4 + sH - 0.02, sL / 2, wood(0.85));
        sink.span('stone', sx * (sd / 2 + 0.04), -0.2, -sL / 2, sx * (sd / 2 + 1.1), 0.05, sL / 2, { decor: true, shade: 0.7 });
        sink.span('stone', sx * (sd / 2 + 0.72), -0.2, -sL / 2, sx * (sd / 2 + 0.92), 0.06, sL / 2, { decor: true, shade: 0.5 });
      }
    });
    // the han over the far end: a stone ground storey, the whitewashed storey above oversailing on its beam ends to the
    // sides, (dome-detail-275) a doksat over the +x side on its brackets
    const dw = Math.min(2.4, hanL - 1.4), hanOpenings: Opening[] = [{ face: 'right', storey: 0, kind: 'door', u: 0, w: 1.6, y0: 0, h: 2.4 }];
    for (const face of ['right', 'left', 'back'] as const) {
      const width = face === 'back' ? sd : hanL;
      for (const o of windowRhythm(face, 1, width, { w: 0.7, h: 1.0, sill: 0.7, spacing: 1.5, margin: 0.6, avoid: face === 'right' ? [[-dw / 2 - 0.2, dw / 2 + 0.2]] : [] })) hanOpenings.push(o);
    }
    const jet = 0.45;
    sink.placed(0, cx, 0, -D / 2 + hanL / 2, () => {
      const fr = buildHouse(sink, {
        w: sd, d: hanL, plinth: { h: 0.3, out: 0.04, bucket: 'stone' },
        storeys: [{ h: 3.0, wall: 'stone' }, { h: 2.8, wall: 'plaster', jetty: [0, jet, 0, jet] }],
        roof: { kind: 'hip', pitchDeg: 34, eave: 0.4, verge: 0.5, thickness: 0.15, bucket: 'roof', ridge: 'round' }, gableBucket: 'plaster', openings: hanOpenings,
        chimneys: [{ x: 0, z: -hanL * 0.2, sx: 0.5, sz: 0.5, above: 0.7, bucket: 'plaster', cap: 'tile' }],
        gutters: null, verge: null, reveal: 0.24, rafters: mobile ? null : timber, spall: 'stone',
      }, {
        ...dialect,
        door: (s, face, o, y0, frame) => doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { leaf: timber, frame: { bucket: 'stone', width: 0.24, out: 0.08, arch: true }, steps: { bucket: 'stone' }, leafKind: 'plank' }, frame.floors[o.storey] + o.y0),
        dressJetty: (s, face, u0, u1, y, depth) => {
          for (let u = u0 + 0.3; u < u1 - 0.15; u += 0.55) faceBox(s, 'structureWood', face, u, y - 0.07, (0.06 - depth) / 2, 0.13, 0.14, depth + 0.06, { ...wood(1), fineSides: true });
          faceBox(s, 'structureWood', face, (u0 + u1) / 2, y + 0.05, 0.02, u1 - u0, 0.12, 0.05, { ...wood(0.9), fineSides: true });
        },
      });
      canalTiles(sink, fr.roof, fr.spec.roof, fr.roofPatch, look);
      // the doksat: a timber-framed oriel on two brackets, its casements on three sides, its own lean-to roof
      const rf: Face = { ...fr.faces.right, origin: [fr.bodies[1].x1, 0, fr.faces.right.origin[2]] }, y0 = fr.floors[1] + 0.15, y1 = fr.eaveY - 0.25, dd = 0.6;
      if (dw > 1.2) {
        faceBox(sink, 'plaster', rf, 0, (y0 + y1) / 2, dd / 2 - 0.02, dw, y1 - y0, dd + 0.04, { decor: true });
        faceBox(sink, 'structureWood', rf, 0, y0 - 0.06, dd / 2, dw + 0.1, 0.12, dd + 0.08, wood(0.85));
        for (const e of [-1, 1]) s2bracket(sink, rf, e * (dw / 2 - 0.2), y0 - 0.12, dd, jet, timber);
        const front: Face = { origin: facePoint(rf, 0, 0, dd + 0.02), u: rf.u, out: rf.out, width: dw };
        for (let k = 0; k < 2; k++) windowUnit(sink, front, (k - 0.5) * dw * 0.48, y0 + 0.45, dw * 0.36, y1 - y0 - 0.75, { frame: DARK_FRAME, frameWidth: 0.05, frameOut: 0.04, bars: 'six', surround: null, sill: null, shutters: null }, look, 0.08);
        const cap: RoofSpec = { kind: 'shed', pitchDeg: 24, eave: 0.12, verge: 0.12, thickness: 0.08, bucket: 'roof', decor: true };
        const at = facePoint(rf, 0, 0, dd / 2);
        sink.placed(0, at[0], 0, at[2], () => emitRoof(sink, roofGeometry(dd, dw, y1 - 0.02, cap), cap));
      }
    });
  });
  return sink.finish();
};

/** (dome-detail-275) A timber bracket under an oriel: a strut from the wall up to the floor's outer edge. */
function s2bracket(sink: PartSink, face: Face, u: number, y: number, dd: number, back: number, timber: Rgb): void {
  sink.member('structureWood', facePoint(face, u, y - 0.8, -back), facePoint(face, u, y, dd - 0.06), 0.1, 0.1, [face.u[0], 0, face.u[2]], { colour: shade(timber, 0.85), decor: true, exposed: true }, 0.03);
}

export const SARAJEVO_CIVIC_BUILDERS: Readonly<Record<string, RegionalBuilder>> = Object.freeze({
  civichall: civicHall,
  firestation: mosque,
  factory: orthodoxChurch,
  foundryoffice: catholicChurch,
  warehouse: marketHall,
  depot: carsija,
});

export type { RegionalParts, Vec3 };
