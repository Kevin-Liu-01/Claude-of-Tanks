// src/world/maps/regional/savoyard.ts — the Savoyard kit (Glacier Pass: the Col du Mont-Cenis, April 1945; map-revival
// lane 2, 2026-10-05). The high Maurienne and the pass: houses of grey gneiss rubble bedded in lime, the window and
// door openings framed in a band of whitewash, under broad low roofs of lauzes (thick split stone slabs) on heavy
// larch frames that reach far out over the gable; the hayloft's gable boarded in larch with gaps for the air; a larch
// gallery across the gable front at the upper floor; small deep windows with plank shutters; the stone stacks capped
// with a slab. The mazots — log granaries on stone mushrooms — and the open woodsheds; the long barns with their earth
// ramp up to the hayloft door; the chapels with their stone bell turrets and porches; the parish church with its
// tin-clad bulb; the old hospice of the pass, three storeys under a hipped roof; the Italian frontier guard's barracks
// (the plateau was Italian until 1947: rendered in ochre, regular windows, grey shutters); and the works of the 1930s
// Alpine line (the Vallo Alpino) — concrete blockhouses with their slit embrasures and observation cupolas. Some
// houses stand roofless after the April 1945 fighting.
import { logWork } from './goral.ts';
import {
  LocalFrame, PartSink, faceBox, facePanel, facePoint, pick, rgb, shade,
  type EmitOptions, type Face, type RegionalBucket, type Rgb, type Vec3,
} from './geometry.ts';
import { bulb } from './domes.ts';
import {
  buildHouse, emitRoof, holedBox, holedPolygon, recordBody, recordShaft, roofCrown, roofGeometry, storeyFaces, wallPolygon, windowRhythm,
  type FaceName, type HouseDialect, type HouseFrame, type Opening, type RoofSpec,
} from './house.ts';
import { doorUnit, gateUnit, windowUnit, type WindowStyle } from './openings.ts';
import { mound, woodpile } from './dressing.ts';
import { orientedPrism } from './millWorks.ts';
import { archGlazing, archHead } from './sarajevoParts.ts';
import { openShed } from './outbuildings.ts';
import type { ArchitectureStyle, RegionalBuildContext, RegionalBuilder } from './types.ts';
import { valloBlockhaus } from '../fortKit.ts'; // the tower plot's blockhouse (props census #5, lane B)

/** Larch weathered silver-brown, a darker larch, the old red and green paints, the barracks' grey-green. */
const JOINERY: readonly Rgb[] = [0x6b5a44, 0x56483a, 0x4f5f4a, 0x6e3428, 0x5f6a66].map(rgb);
const LARCH = rgb(0x5e4b38), LARCH_DARK = rgb(0x3f3328), IRON = rgb(0x26282a), TIN = rgb(0x8a9090), BELL = rgb(0x6a5a3a);
const SHINGLE = rgb(0x3e3a36);

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

interface SavoyardState {
  rng: () => number;
  window: WindowStyle;
  joinery: Rgb;
  door: Rgb;
  litShare: number;
  mobile: boolean;
}

function stateFor(ctx: RegionalBuildContext): SavoyardState {
  const rng = ctx.rng;
  const joinery = pick(rng, JOINERY);
  return {
    rng, joinery, door: shade(pick(rng, [LARCH, LARCH_DARK, joinery]), 0.9 + rng() * 0.15),
    window: {
      frame: shade(LARCH, 0.9), frameWidth: 0.06, frameOut: 0.04, bars: rng() < 0.7 ? 'six' : 'cross',
      // the whitewashed band round the openings of the grey stone houses (Bessans, Bonneval)
      surround: { bucket: 'plaster', width: 0.16, out: 0.012, lintel: 0.2 },
      sill: { bucket: 'stone', out: 0.08 },
      shutters: { colour: joinery, kind: 'plank', closed: 0.3 },
    },
    litShare: 0.3,
    mobile: ctx.tier === 'mobile',
  };
}

/**
 * The patron saint's fresco over a door (props census #5, lane B 2026-10-15): its ochre frame and the painting in faded
 * earth pigments, never the dark (a dark panel on the render read as an opening painted on the wall).
 */
const FRESCO: Rgb = rgb(0xd6c6a2);
function fresco(sink: PartSink, f: Face, y: number, w: number, h: number): void {
  faceBox(sink, 'plaster2', f, 0, y, 0.012, w + 0.3, h + 0.28, 0.02, { decor: true });
  faceBox(sink, 'structureMetal', f, 0, y, 0.024, w, h, 0.01, { decor: true, colour: FRESCO });
  faceBox(sink, 'structureMetal', f, 0, y + h * 0.08, 0.03, w * 0.34, h * 0.62, 0.004, { decor: true, colour: shade(FRESCO, 0.82) });
  // (props census r2 sweep, Lane C 2026-10-16: the fresco read as a plate painted flat on the render) its moulded frame,
  // an aedicule's jambs, sill and head standing 14 cm proud round it, the head a little deeper (its drip)
  const fo = { decor: true, shade: 0.94 };
  faceBox(sink, 'plaster2', f, 0, y - h / 2 - 0.06, 0.07, w + 0.24, 0.12, 0.14, fo);
  faceBox(sink, 'plaster2', f, 0, y + h / 2 + 0.07, 0.08, w + 0.32, 0.14, 0.16, fo);
  for (const s of [-1, 1]) faceBox(sink, 'plaster2', f, s * (w / 2 + 0.06), y, 0.07, 0.12, h, 0.14, fo);
}

function dialect(st: SavoyardState): HouseDialect {
  return {
    window: (sink, face, o, y0) => windowUnit(sink, face, o.u, y0 + o.y0, o.w, o.h,
      o.kind === 'loft' ? { ...st.window, shutters: null, bars: 'none', surround: null } : st.window, st.rng, o.kind === 'loft' ? 0 : st.litShare),
    door: (sink, face, o, y0, frame) => {
      if (o.kind === 'gate') {
        gateUnit(sink, face, o.u, y0 + o.y0, o.w, o.h, shade(st.door, 0.9), { bucket: 'stone', width: 0.24, out: 0.06 });
        return;
      }
      // an upper door opens onto its gallery or its ramp: no steps up to it from the ground
      doorUnit(sink, face, o.u, y0 + o.y0, o.w, o.h, {
        leaf: st.door, frame: { bucket: 'plaster', width: 0.2, out: 0.012, arch: o.w > 1.25 },
        steps: o.storey === 0 ? { bucket: 'stone' } : null, leafKind: 'plank', transom: false,
      }, frame.floors[o.storey] + o.y0);
    },
  };
}

/** A lauze roof: thick split slabs on a heavy frame, low, reaching far out over the gables. */
const lauze = (pitch: number, eave: number, verge: number, kind: RoofSpec['kind'] = 'gable'): RoofSpec =>
  ({ kind, pitchDeg: pitch, eave, verge: kind === 'hip' ? eave : verge, thickness: 0.34, bucket: 'roof', ridge: 'saddle' });

/** The purlin ends and the ridge beam showing under a deep verge (the frame that carries the lauzes). */
function purlins(sink: PartSink, frame: HouseFrame, colour: Rgb): void {
  const rg = frame.roof, spec = frame.spec;
  if (rg.kind !== 'gable') return;
  const verge = spec.roof.verge;
  if (verge < 0.4) return;
  const z1 = rg.halfD + verge - 0.06;
  for (const t of [0, 0.5, 0.92]) {
    const x = rg.s * t;
    const y = rg.ridgeY - x * rg.tanP - 0.18;
    for (const side of t === 0 ? [0] : [-1, 1]) {
      sink.span('structureWood', side * x - 0.11, y - 0.2, -z1, side * x + 0.11, y, z1, { colour, decor: true, shadow: true });
    }
  }
}

/**
 * April's snow against a house (round 2, gauntlet wave 109b: "walls meeting the snow on a hard line with no drift or
 * path"): a bank along each wall of the ground storey, deeper where the wind piled it, run past the corners so the
 * banks meet there, and cut away before every ground-floor door and gate (the trodden way out); the props' snow cap
 * whitens its slope. Its foot runs 0.35 m under the floor, so on a gentle slope it meets the ground. Dressing, built
 * only on a snowbound map.
 */
function drifts(sink: PartSink, frame: HouseFrame, openings: readonly Opening[], look: () => number): void {
  const foot = -0.35;
  for (const name of ['front', 'back', 'left', 'right'] as const) {
    const face = frame.faces[name], half = face.width / 2;
    const out = 0.7 + look() * 0.3;
    const cuts = openings.filter((o) => o.face === name && o.storey === 0 && (o.kind === 'door' || o.kind === 'gate'))
      .map((o) => [o.u - o.w / 2 - 0.45, o.u + o.w / 2 + 0.45] as const).sort((a, b) => a[0] - b[0]);
    let u = -half - out * 0.8;
    const runs: Array<[number, number]> = [];
    for (const [c0, c1] of cuts) { if (c0 > u) runs.push([u, c0]); u = Math.max(u, c1); }
    if (half + out * 0.8 > u) runs.push([u, half + out * 0.8]);
    for (const [u0, u1] of runs) {
      if (u1 - u0 < 0.6) continue;
      const h0 = 0.3 + look() * 0.35, h1 = 0.3 + look() * 0.35;
      const a = facePoint(face, u0, h0, 0.01), b = facePoint(face, u1, h1, 0.01);
      const c = facePoint(face, u1, foot, out), d = facePoint(face, u0, foot, out);
      const opts = { decor: true } as const;
      sink.polygon('plaster', [a, d, c, b], opts);
      sink.polygon('plaster', [a, facePoint(face, u0, foot, 0.01), d], opts);
      sink.polygon('plaster', [b, c, facePoint(face, u1, foot, 0.01)], opts);
      // (the buildings stream, 2026-10-13, the integrity check: a drift runs on past the wall's ends, where no wall stands
      // behind it, so from beside the corner its open back showed) its back closed beyond each end of the wall, facing in
      const hAt = (uu: number): number => h0 + (h1 - h0) * (uu - u0) / (u1 - u0);
      for (const [ua, ub] of [[u0, Math.min(u1, -half)], [Math.max(u0, half), u1]]) {
        if (ub - ua < 0.02) continue;
        sink.polygon('plaster', [facePoint(face, ub, foot, 0.01), facePoint(face, ua, foot, 0.01), facePoint(face, ua, hAt(ua), 0.01),
          facePoint(face, ub, hAt(ub), 0.01)], opts);
      }
    }
  }
}

/**
 * The larch gallery across a gable at the upper floor: the deck on beam ends, a railing of sawn boards, the corner
 * posts carrying it to the verge.
 */
function gallery(sink: PartSink, face: Face, floorY: number, w: number, depth: number, roofY: number, colour: Rgb, fine: boolean): void {
  const c = { colour, decor: true } as const;
  faceBox(sink, 'structureWood', face, 0, floorY - 0.06, depth / 2, w, 0.12, depth, { ...c, shadow: true });
  for (const u of [-w / 2 + 0.15, 0, w / 2 - 0.15]) faceBox(sink, 'structureWood', face, u, floorY - 0.24, depth / 2, 0.16, 0.22, depth, c);
  faceBox(sink, 'structureWood', face, 0, floorY + 0.95, depth - 0.05, w, 0.09, 0.09, c);
  for (const s of [-1, 1]) {
    faceBox(sink, 'structureWood', face, s * (w / 2 - 0.05), floorY + 0.95, depth / 2, 0.09, 0.09, depth, c);
    faceBox(sink, 'structureWood', face, s * (w / 2 - 0.06), (floorY + roofY) / 2, depth - 0.06, 0.12, roofY - floorY, 0.12, c);
  }
  // the boards of the railing, each 12 cm, a gap between
  const n = Math.max(6, Math.round(w / 0.2));
  for (let k = 0; k < n; k++) {
    faceBox(sink, 'structureWood', face, -w / 2 + (k + 0.5) * w / n, floorY + 0.5, depth - 0.05, 0.12, 0.84, 0.025,
      { ...c, ...(fine ? { fine: true } : {}) }, 'caps');
  }
}

// ------------------------------------------------------------------------------------------------ the barns' and chapels' craft

const FACES: readonly FaceName[] = ['front', 'right', 'back', 'left'];

/** A planar polygon (convex, or star-shaped from its first point) wound so its normal looks toward `toward` (dome-detail-275). */
function facing(sink: PartSink, bucket: RegionalBucket, pts: Vec3[], toward: Vec3, opts: EmitOptions): void {
  const [a, b, c] = pts;
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  sink.polygon(bucket, n[0] * toward[0] + n[1] * toward[1] + n[2] * toward[2] >= 0 ? pts : [...pts].reverse(), opts);
}

/**
 * A roof slope in its own terms (dome-detail-275): a point `v` up the slope from its eave, `t` along it, `h` off it;
 * `along` the unit `t` runs on; `lim(v)` how far either way along it the slope reaches at `v` (a hip's line closing it).
 */
interface Slope { P: (v: number, t: number, h: number) => Vec3; n: Vec3; down: Vec3; along: Vec3; lim: (v: number) => number }

/**
 * One lauze on a slope (dome-detail-275): its butt a hand of split gneiss facing down the slope, its face thinning up to
 * the course over it, its ends (cut along a hip's line where the slope closes on one); `under` its underside too (a
 * slab out past the eave or the ridge). Dressing.
 */
function lauzeSlab(sink: PartSink, look: () => number, sl: Slope, v0: number, v1: number, t0: number, t1: number, under: boolean): void {
  const la = sl.lim(v0), lc = sl.lim(v1);
  const a0 = Math.max(t0, -la), a1 = Math.min(t1, la), c0 = Math.max(t0, -lc), c1 = Math.min(t1, lc);
  if (a1 - a0 < 0.12 || c1 - c0 < 0.04 || v1 - v0 < 0.1) return;
  const b = 0.055 + look() * 0.045, o: EmitOptions = { decor: true, shade: 0.82 + look() * 0.22 }, P = sl.P, n = sl.n, e = sl.along;
  const A0 = P(v0, a0, 0), A1 = P(v0, a1, 0), B0 = P(v0, a0, b), B1 = P(v0, a1, b), C0 = P(v1, c0, 0), C1 = P(v1, c1, 0);
  facing(sink, 'roof', [A0, A1, B1, B0], sl.down, o);
  facing(sink, 'roof', [B0, B1, C1, C0], n, o);
  facing(sink, 'roof', [A0, B0, C0], [-e[0], -e[1], -e[2]], o);
  facing(sink, 'roof', [A1, B1, C1], e, o);
  if (under) facing(sink, 'roof', [A0, A1, C1, C0], [-n[0], -n[1], -n[2]], o);
}

const LAUZE_COURSE = 0.42;

/**
 * A course of lauzes along a slope from t0 to t1 (dome-detail-275), each slab `w0` to `w0 + wv` wide, its butt jogging
 * up and down a little, showing up to `v1` (at most a course and its lap).
 */
function lauzeRun(sink: PartSink, look: () => number, sl: Slope, v0: number, v1: number, t0: number, t1: number, under: boolean, w0 = 0.6, wv = 0.7): void {
  for (let t = t0; t < t1 - 0.05;) {
    const w = Math.min(t1 - t, w0 + look() * wv), jog = (look() - 0.5) * 0.07;
    lauzeSlab(sink, look, sl, v0 + jog, Math.min(v1, v0 + jog + LAUZE_COURSE * 1.3), t, t + w - 0.01, under);
    t += w;
  }
}

/**
 * The slope of a gable or hip roof's +x (side 1) or -x side, or of a shed roof's low side (+x), in its roof frame
 * (house.ts roofGeometry: the ridge along z): its eave's edge at x = s + eave on the covering's top; `end` a hip roof's
 * end slope at +z (1) or -z (-1) instead (dome-detail-275).
 */
function roofSlope(rg: HouseFrame['roof'], roof: RoofSpec, side: 1 | -1, end = false): Slope & { reach: number } {
  const cosP = 1 / Math.hypot(1, rg.tanP), sinP = rg.tanP * cosP, xe = rg.s + roof.eave;
  const D = rg.halfD + (rg.hipVerge ?? roof.verge), hip = rg.kind === 'hip';
  if (end) {
    const ye = rg.topAt(0, side * D) ?? rg.eaveY;
    return {
      P: (v, t, h) => [t, ye + sinP * v + cosP * h, side * (D - cosP * v + sinP * h)], n: [0, cosP, side * sinP], down: [0, -sinP, side * cosP], along: [1, 0, 0],
      lim: (v) => xe - cosP * v, reach: (D - rg.ridgeHalf) / cosP,
    };
  }
  const ye = rg.topAt(side * xe, 0) ?? rg.eaveY;
  const up: Vec3 = [-side * cosP, sinP, 0], n: Vec3 = [side * sinP, cosP, 0];
  return {
    P: (v, t, h) => [side * xe + up[0] * v + n[0] * h, ye + up[1] * v + n[1] * h, t], n, down: [side * cosP, -sinP, 0], along: [0, 0, 1],
    lim: (v) => (hip ? rg.ridgeHalf + xe - cosP * v : D), reach: (rg.kind === 'shed' ? 2 * rg.s + roof.eave : xe) / cosP,
  };
}

/**
 * The lauzes on a hip roof (the barracks; dome-detail-275): round all four eaves the courses whole, the first ragged
 * past the overhang, to a hand inside the walls (where house.ts's stripped patch never lies); over the field each
 * course's butt, a step a hand high, cut at the hips.
 */
function lauzeHip(sink: PartSink, frame: HouseFrame, look: () => number): void {
  const rg = frame.roof, roof = frame.spec.roof;
  if (rg.kind !== 'hip' || rg.hipTan !== undefined) return;
  const cosP = 1 / Math.hypot(1, rg.tanP), eaveBand = (roof.eave + rg.s * 0.02 + 0.1) / cosP;
  for (const [side, end] of [[1, false], [-1, false], [1, true], [-1, true]] as const) {
    const sl = roofSlope(rg, roof, side, end), L = sl.lim(0);
    for (let k = 0, v = 0; v < sl.reach - 0.3; k++, v = k * LAUZE_COURSE) {
      if (v < eaveBand - 0.15) lauzeRun(sink, look, sl, k ? v : -0.04 - look() * 0.08, eaveBand, -L, L, k === 0);
      else lauzeRun(sink, look, sl, v, v + 0.2, -L, L, false, 2.8, 2.6);
    }
  }
}

/**
 * The lauzes' courses on a gable roof (dome-detail-275; the work list: "the roof is a smooth slab"): the thick split
 * slabs of gneiss, each its own slab a hand thick at its butt, of its own width and tone; along each eave the courses
 * whole, the first ragged past the overhang; a column of the big edge slabs up each rake; over the field each course's
 * butt, a step a hand high; and the ridge's slabs (the lignolet) on the windward slope standing past the ridge over the
 * other. Whole slabs lie only where house.ts's stripped patch (the war wear) never does — the eave band to a hand inside
 * the wall, the rakes' fifth of the run, the ridge's quarter metre — and over a stripped patch the field's butts read as
 * the slabs left on its battens.
 */
function lauzeEdges(sink: PartSink, frame: HouseFrame, look: () => number): void {
  const rg = frame.roof, roof = frame.spec.roof;
  if (rg.kind !== 'gable') return;
  const cosP = 1 / Math.hypot(1, rg.tanP), D = rg.halfD + roof.verge;
  const eaveBand = (roof.eave + rg.s * 0.02 + 0.1) / cosP, vergeW = Math.min(1.15, 0.2 * D - 0.05);
  const windward = look() < 0.5 ? 1 : -1;
  for (const side of [-1, 1] as const) {
    const sl = roofSlope(rg, roof, side), ridgeBand = sl.reach - 0.24 / cosP;
    for (let k = 0, v = 0; v < ridgeBand - 0.1; k++, v = k * LAUZE_COURSE) {
      if (v < eaveBand - 0.15) {
        // the eave band: the first course ragged past the eave's edge (its underside seen), the next up to the wall's line
        lauzeRun(sink, look, sl, k ? v : -0.04 - look() * 0.08, eaveBand, -D, D, k === 0);
        continue;
      }
      // the rakes' edge slabs, one wide slab a course, up to the ridge's band
      const ws: number[] = [];
      for (const end of [-1, 1]) {
        const w = vergeW * (0.78 + look() * 0.22), jog = (look() - 0.5) * 0.06;
        ws.push(w);
        lauzeSlab(sink, look, sl, v + jog, Math.min(ridgeBand, v + jog + LAUZE_COURSE * 1.3), end < 0 ? -D : D - w, end < 0 ? -D + w : D, false);
      }
      // the field between: each course's butt alone (over a stripped patch, the slabs left on its battens)
      lauzeRun(sink, look, sl, v, v + 0.2, -D + ws[0], D - ws[1], false, 1.5, 1.9);
    }
    // the lignolet: the windward slope's ridge course run on past the ridge
    if (side === windward) lauzeRun(sink, look, sl, ridgeBand, sl.reach + 0.14, -D, D, true);
  }
}

/** The lauzes of a shed roof laid in its own roof frame (a porch's lean-to; dome-detail-275): whole courses up its slope. */
function lauzeShed(sink: PartSink, rg: HouseFrame['roof'], roof: RoofSpec, look: () => number): void {
  const sl = roofSlope(rg, roof, 1), D = rg.halfD + roof.verge;
  for (let k = 0, v = 0; v < sl.reach - 0.2; k++, v = k * LAUZE_COURSE) {
    lauzeRun(sink, look, sl, k ? v : -0.03 - look() * 0.06, sl.reach - 0.02, -D, D, k === 0, 0.45, 0.5);
  }
}

/**
 * The air gaps of a larch-boarded wall (claire-voie; dome-detail-275): the hayloft's boards set a finger apart, the
 * gaps dark lines a board apart from `y0` up to `top(u)`, left out where `clear(u)` says a member or an opening stands.
 */
function boardGaps(sink: PartSink, face: Face, u0: number, u1: number, y0: number, top: (u: number) => number, clear: (u: number) => boolean,
  look: () => number): void {
  for (let u = u0 + 0.12 + look() * 0.1; u < u1 - 0.1; u += 0.24 + look() * 0.12) {
    const y1 = top(u);
    if (y1 - y0 < 0.25 || !clear(u)) continue;
    facePanel(sink, 'dark', face, u, (y0 + y1) / 2, 0.006, 0.045, y1 - y0, { decor: true });
  }
}

/** A gable's rise over its eave at u (the gable's triangle; dome-detail-275). */
const gableTop = (frame: HouseFrame, u: number): number => frame.eaveY + Math.max(0, frame.roof.s - Math.abs(u)) * frame.roof.tanP;

/**
 * The hayloft's larch frame on the byre's stone (dome-detail-275): the sill beam on the wall head, the corner and bay
 * posts, the wall plate under the eaves and each post's knee braces to it; the boards' air gaps between, in the frame's
 * upper half and up the gables. The openings of the storey keep their members clear.
 */
function hayloftFrame(sink: PartSink, frame: HouseFrame, storey: number, openings: readonly Opening[], look: () => number): void {
  const sf = storeyFaces(frame, storey), y0 = frame.floors[storey], y1 = frame.eaveY;
  const c = { colour: LARCH_DARK, decor: true, fineSides: true } as const;
  for (const name of FACES) {
    const f = sf[name], half = f.width / 2, gable = name === 'front' || name === 'back';
    const holes = openings.filter((o) => o.face === name && o.storey === storey).map((o) => [o.u - o.w / 2 - 0.14, o.u + o.w / 2 + 0.14] as const);
    const clear = (u: number, r: number) => holes.every(([a, b]) => u + r < a || u - r > b);
    faceBox(sink, 'structureWood', f, 0, y0 + 0.11, 0.05, f.width + 0.1, 0.22, 0.1, c);
    if (!gable) faceBox(sink, 'structureWood', f, 0, y1 - 0.11, 0.05, f.width + 0.1, 0.22, 0.1, c);
    const n = Math.max(2, Math.round(f.width / 3.3)), posts: number[] = [];
    for (let k = 0; k <= n; k++) {
      const u = -half + 0.1 + (f.width - 0.2) * k / n;
      if (!clear(u, 0.1)) continue;
      posts.push(u);
      faceBox(sink, 'structureWood', f, u, (y0 + y1) / 2, 0.05, 0.2, y1 - y0 - 0.2, 0.1, c);
      if (gable) continue;
      for (const s of [-1, 1]) {
        if ((k === 0 && s < 0) || (k === n && s > 0) || !clear(u + s * 0.7, 0.1)) continue;
        sink.member('structureWood', facePoint(f, u + s * 0.08, y1 - 1.05, 0), facePoint(f, u + s * 0.85, y1 - 0.2, 0), 0.13, 0.08, f.out, { colour: LARCH_DARK, decor: true });
      }
    }
    // the gaps: in the boards' upper half between the posts, and up the gable's triangle
    const off = (u: number) => clear(u, 0.03) && posts.every((p) => Math.abs(u - p) > 0.16);
    boardGaps(sink, f, -half, half, gable ? y1 - 0.9 : (y0 + y1) / 2 + 0.2, (u) => (gable ? gableTop(frame, u) - 0.3 : y1 - 0.26), off, look);
  }
}

/** The rubble's rough corner stones up a storey (dome-detail-275): long and short blocks alternating, each its own length. */
function roughQuoins(sink: PartSink, b: { x0: number; x1: number; z0: number; z1: number }, y0: number, y1: number, look: () => number): void {
  for (const [cx, cz] of [[b.x0, b.z0], [b.x1, b.z0], [b.x0, b.z1], [b.x1, b.z1]] as const) {
    const sx = cx > 0 ? 1 : -1, sz = cz > 0 ? 1 : -1;
    for (let y = y0, k = 0; y < y1 - 0.3; k++) {
      const h = Math.min(y1 - y, 0.4 + look() * 0.16), lx = (k % 2 ? 0.58 : 0.32) + look() * 0.08, lz = (k % 2 ? 0.32 : 0.58) + look() * 0.08;
      sink.quoin('stone', cx - sx * lx, y, cz - sz * lz, cx + sx * 0.035, y + h - 0.025, cz + sz * 0.035, sx, sz, { decor: true, shade: 0.9 + look() * 0.14 });
      y += h;
    }
  }
}

/**
 * The bachal (dome-detail-275): the village trough hewn from a larch trunk against a wall, its water dark in it, the
 * spout's post at one end and its iron pipe. On a face at u, `len` long.
 */
function bachal(sink: PartSink, f: Face, u: number, len: number, look: () => number): void {
  const wood = shade(LARCH, 0.82 + look() * 0.15), o = { colour: wood, decor: true } as const;
  faceBox(sink, 'structureWood', f, u, 0.24, 0.3, len, 0.48, 0.48, o);
  facing(sink, 'glass', [facePoint(f, u - len / 2 + 0.08, 0.485, 0.14), facePoint(f, u + len / 2 - 0.08, 0.485, 0.14),
    facePoint(f, u + len / 2 - 0.08, 0.485, 0.47), facePoint(f, u - len / 2 + 0.08, 0.485, 0.47)], [0, 1, 0], { decor: true });
  // a stone under each end (the trough bedded level on the slope)
  for (const s of [-1, 1]) faceBox(sink, 'stone', f, u + s * (len / 2 - 0.2), -0.05, 0.3, 0.3, 0.2, 0.52, { decor: true });
  const pu = u - len / 2 - 0.12;
  faceBox(sink, 'structureWood', f, pu, 0.6, 0.12, 0.2, 1.2, 0.2, { colour: shade(wood, 0.9), decor: true });
  sink.member('structureMetal', facePoint(f, pu, 0.98, 0.2), facePoint(f, pu + 0.32, 0.9, 0.3), 0.04, 0.04, [0, 1, 0], { colour: IRON, decor: true, exposed: true }, 0);
}

// ------------------------------------------------------------------------------------------------ the houses

/**
 * The Maurienne house (the base alpine house's plot): two storeys of rubble, the openings framed in whitewash, the
 * hayloft's gable boarded in larch, the lauze roof deep over the gables, a larch gallery across the front gable,
 * a slab-capped stack, firewood under the eaves.
 */
const maison: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx);
  const rng = st.rng, look = ctx.variant;
  const fit = wallsIn(ctx, 0.62, 0.8);
  const W = clamp(fit.w, 6.0, 9.4), D = clamp(fit.d, 7.6, 12);
  sink.placed(0, fit.cx, 0, fit.cz, () => {
    const openings: Opening[] = [
      { face: 'front', storey: 0, kind: 'door', u: (rng() - 0.5) * W * 0.3, w: 1.1, y0: 0, h: 2.05 },
      { face: 'front', storey: 1, kind: 'door', u: (rng() - 0.5) * W * 0.25, w: 0.9, y0: 0, h: 1.95 },
    ];
    for (const face of ['right', 'left'] as const) {
      for (const o of windowRhythm(face, 0, D, { w: 0.6, h: 0.75, sill: 1.0, spacing: 2.6, margin: 1.3, max: 3 })) if (rng() < 0.8) openings.push(o);
      for (const o of windowRhythm(face, 1, D, { w: 0.65, h: 0.8, sill: 0.8, spacing: 2.6, margin: 1.3, max: 3 })) if (rng() < 0.75) openings.push(o);
    }
    for (const o of windowRhythm('front', 0, W, { w: 0.6, h: 0.75, sill: 1.0, spacing: 2.2, margin: 1.0, max: 2,
      avoid: [[openings[0].u - 0.6, openings[0].u + 0.6]] })) openings.push(o);
    for (const o of windowRhythm('front', 1, W, { w: 0.65, h: 0.8, sill: 0.8, spacing: 2.2, margin: 1.0, max: 2,
      avoid: [[openings[1].u - 0.5, openings[1].u + 0.5]] })) openings.push(o);
    // the hayloft's ventilation slits in the boarded gables
    openings.push({ face: 'back', storey: 1, kind: 'loft', u: 0, w: 1.0, y0: 1.2, h: 0.6 });
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: 0.2, out: 0.06, bucket: 'stone' }, storeys: [{ h: 2.55, wall: 'stone' }, { h: 2.35, wall: 'stone' }],
      roof: lauze(23 + rng() * 4, 0.7, 0.95), gableBucket: 'wood', openings,
      chimneys: [{ x: (rng() - 0.5) * W * 0.3, z: (rng() < 0.5 ? -1 : 1) * D * 0.18, sx: 0.7, sz: 0.7, above: 0.9, bucket: 'stone', cap: 'slab' }],
      gutters: null, verge: null, reveal: 0.42, spall: null,
    }, dialect(st));
    purlins(sink, frame, LARCH_DARK);
    if (ctx.snowCap) drifts(sink, frame, openings, look);
    const f = frame.faces.front;
    gallery(sink, f, frame.floors[1], W - 0.4, 0.95, frame.eaveY + 0.2, shade(LARCH, 0.95), true);
    sink.dressing(st.mobile, () => {
      const side = rng() < 0.5 ? frame.faces.right : frame.faces.left;
      woodpile(sink, side, -side.width / 2 + 0.6, side.width / 2 - 0.6, 1.3 + look() * 0.4, look);
    });
  });
  return sink.finish();
};

/**
 * The grange (the base log cabin's plot): a byre and hayloft of rubble under a lauze roof, the gable boarded in larch,
 * the stable door under a heavy lintel; on some, the log hayloft set on the stone byre (the mazot-built upper floor).
 * (dome-detail-275: "a plain plaster box under a smooth roof, with a single window") The lauzes' slabs on their rafters;
 * the rubble's rough quoins; the larch lintel over the stable door, its stone threshold and the drain from it; the byre's
 * lights barred in iron under their slab lintels; the gables' boards set apart for the hay's air and the hoist beam
 * under the front verge with its pulley; the dung heap by the door and the bachal along the side.
 */
const grange: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx);
  const rng = st.rng, look = ctx.variant;
  const fit = wallsIn(ctx, 0.42, 0.55);
  const W = clamp(fit.w, 4.6, 6.6), D = clamp(fit.d, 5.4, 7.6);
  sink.placed(0, fit.cx, 0, fit.cz, () => {
    const logs = rng() < 0.45;
    const openings: Opening[] = [
      { face: 'front', storey: 0, kind: 'door', u: (rng() - 0.5) * W * 0.25, w: 1.05, y0: 0, h: 1.85 },
      { face: 'right', storey: 0, kind: 'window', u: (rng() - 0.5) * D * 0.3, w: 0.45, h: 0.5, y0: 1.2 },
    ];
    // (dome-detail-275: the loft light a hand higher, clear of the door's lintel)
    if (!logs) openings.push({ face: 'front', storey: 0, kind: 'loft', u: 0, w: 0.8, h: 0.68, y0: 2.12 });
    // (dome-detail-275) a second byre light in the back wall
    openings.push({ face: 'back', storey: 0, kind: 'window', u: (look() - 0.5) * W * 0.3, w: 0.4, h: 0.45, y0: 1.25 });
    // (the building census's world pass, 227: on a slope a corner stood 5 cm over the ground) the walls' rubble footing
    // under them, down into the slope, its course showing a hand over the ground (a ground-contact solid stands to 6 cm:
    // the grange's collision down with it)
    sink.span('stone', -W / 2 - 0.04, -0.5, -D / 2 - 0.04, W / 2 + 0.04, 0.08, D / 2 + 0.04);
    // (dome-detail-275) the byre's lights barred in iron, a plank shutter beside
    const byreLight: WindowStyle = { ...st.window, bars: 'grille', frame: IRON, frameWidth: 0.04, shutters: { colour: st.joinery, kind: 'plank', closed: 0 } };
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: null, storeys: logs ? [{ h: 2.1, wall: 'stone' }, { h: 1.7, wall: 'wood' }] : [{ h: 2.9, wall: 'stone' }],
      roof: lauze(25 + rng() * 4, 0.5, 0.7), gableBucket: 'wood', openings,
      chimneys: [], gutters: null, verge: null, reveal: 0.38, spall: null, rafters: LARCH_DARK,
    }, { ...dialect({ ...st, litShare: 0.1 }), window: (s, face, o, y0) => (o.kind === 'loft'
      ? windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { ...st.window, shutters: null, bars: 'none', surround: null }, st.rng, 0)
      : windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, byreLight, st.rng, 0.1)) });
    purlins(sink, frame, LARCH_DARK);
    lauzeEdges(sink, frame, look);
    if (ctx.snowCap) drifts(sink, frame, openings, look);
    // (props census #15, Lane C 2026-10-16: "the log hayloft is a flat wood-print face with 0.44 m square boxes stacked
    // at the corners") the hayloft laid in hewn larch courses, saddle-notched, their ends running past the corners
    if (logs) logWork(sink, frame, [1], look, MAZOT_LIGHT, ctx.tier === 'mobile', 0.26);
    const F = frame.faces, stoneTop = logs ? frame.floors[1] : frame.eaveY;
    // ---- (dome-detail-275) the rubble's corners, the lintels, the threshold and its drain
    roughQuoins(sink, frame.bodies[0], 0.1, stoneTop - 0.05, look);
    for (const o of openings.filter((q) => q.kind !== 'loft')) {
      const f = F[o.face];
      if (o.kind === 'door') faceBox(sink, 'structureWood', f, o.u, o.y0 + o.h + 0.12, 0.07, o.w + 0.9, 0.24, 0.14, { colour: shade(LARCH_DARK, 0.9), decor: true });
      else faceBox(sink, 'stone', f, o.u, o.y0 + o.h + 0.27, 0.05, o.w + 0.55, 0.15, 0.1, { decor: true, shade: 0.86 });
    }
    const door = openings[0];
    faceBox(sink, 'stone', F.front, door.u + 0.15, -0.12, 0.45, 0.42, 0.22, 0.9, { decor: true, shade: 0.78 });
    // the gables' boards set apart for the air (above a stone gable's eave; the log hayloft's gables over its plate)
    for (const g of [F.front, F.back]) boardGaps(sink, g, -W / 2 + 0.2, W / 2 - 0.2, frame.eaveY + 0.15, (u) => gableTop(frame, u) - 0.28, () => true, look);
    // the hoist beam under the front verge, its iron pulley and the rope down
    const ry = frame.roof.ridgeY - 0.42, tipO = frame.spec.roof.verge + 0.2;
    faceBox(sink, 'structureWood', F.front, 0, ry, (tipO - 0.3) / 2, 0.16, 0.18, tipO + 0.3, { colour: LARCH_DARK, decor: true });
    sink.cylinder('structureMetal', facePoint(F.front, -0.06, ry - 0.2, tipO - 0.12), 'x', 0.12, 0.09, 8, { colour: IRON, decor: true });
    faceBox(sink, 'structureMetal', F.front, 0, ry - 0.12, tipO - 0.12, 0.03, 0.16, 0.03, { colour: IRON, decor: true });
    faceBox(sink, 'structureWood', F.front, 0.07, ry - 0.95, tipO - 0.21, 0.025, 1.3, 0.025, { colour: rgb(0x8a7a5a), decor: true, fine: true });
    // the dung heap beside the door, the bachal along the left wall
    const side = door.u > 0 ? -1 : 1, dp = facePoint(F.front, door.u + side * 1.3, 0, 0.5);
    mound(sink, [dp[0], -0.12, dp[2]], [1, 0, 0], [0, 0, 1], 0.72, 0.5, 0.62 + look() * 0.18, [0.27, 0.21, 0.15], { decor: true }, look() * 3, 8);
    bachal(sink, F.left, (look() - 0.5) * 0.8, 1.5, look);
  });
  return sink.finish();
};

/** What the mazot's log courses stop at round its door (goral.ts logWork reads only a door's frame). */
const MAZOT_LIGHT: WindowStyle = { frame: LARCH_DARK, frameWidth: 0.05, frameOut: 0.03, bars: 'none', surround: null, sill: null, shutters: null };

/**
 * The mazot (granary): a box of larch logs raised on stone mushrooms (a post and a flat cap slab against the rats),
 * a heavy plank door with iron strap hinges, a lauze roof with deep verges.
 */
const mazot: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const look = ctx.variant;
  const fit0 = wallsIn(ctx, 0.36, 0.5), fit = { ...fit0, cz: fit0.cz - 0.35 };
  const W = clamp(fit.w, 3.0, 4.4), D = clamp(fit0.d - 0.7, 3.6, 5.4);
  sink.placed(0, fit.cx, 0, fit.cz, () => {
    const lift = 0.85;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const x = sx * (W / 2 - 0.3), z = sz * (D / 2 - 0.3);
      sink.cylinder('stone', [x, -0.3, z], 'y', lift + 0.15, 0.2, 7, {}, 0.17);
      sink.cylinder('stone', [x, lift - 0.15, z], 'y', 0.15, 0.42, 9, {}, 0.38);
    }
    sink.placed(0, 0, lift, 0, () => {
      const frame = buildHouse(sink, {
        w: W, d: D, plinth: null, storeys: [{ h: 2.0, wall: 'wood' }],
        roof: lauze(26, 0.4, 0.7), gableBucket: 'wood', openings: [{ face: 'front', storey: 0, kind: 'door', u: 0, w: 0.85, y0: 0, h: 1.55 }],
        chimneys: [], gutters: null, verge: null, reveal: 0.12,
      }, {
        window: () => {},
        door: (s, face, o, y0) => {
          doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { leaf: shade(LARCH_DARK, 0.9), frame: { bucket: 'structureWood', width: 0.12, out: 0.05, colour: LARCH_DARK }, steps: null, leafKind: 'plank' });
          for (const t of [0.25, 0.75]) faceBox(s, 'structureMetal', face, o.u - 0.12, y0 + o.y0 + o.h * t, 0.03, 0.55, 0.05, 0.015, { colour: IRON, decor: true, fine: true });
        },
      });
      purlins(sink, frame, LARCH_DARK);
      // (props census #22, Lane C 2026-10-16: "between the corner stubs every wall is a flat larch print") the walls laid
      // in hewn larch courses, saddle-notched, their ends running past the corners, cut at the door (goral.ts logWork)
      logWork(sink, frame, [0], look, MAZOT_LIGHT, ctx.tier === 'mobile', 0.24);
    });
    // the step up to the door: a stone block
    sink.span('stone', -0.5, -0.3, D / 2 + 0.05, 0.5, lift - 0.25, D / 2 + 0.7);
  });
  return sink.finish();
};

/**
 * The open woodshed (bûcher; the props census #17, 2026-10-15, the judges: "larch posts on stone pads with knee braces,
 * a sill and wall plate, vertical larch boards with gaps as separate members on three sides, rafters, and a lauze roof
 * of thick stone slabs in courses with a ridge; keep the woodpile"): built member by member (outbuildings.ts openShed)
 * on stone pads, the larch boards standing with an air gap, the lauzes laid in thick irregular courses; open to +x.
 */
function bucher(ctx: RegionalBuildContext, yard = false): ReturnType<RegionalBuilder> {
  const sink = new PartSink(uvOffset(ctx));
  const look = ctx.variant;
  // a yard's shed opens to its +z (the yard): built in a frame turned a quarter, its plot's sides swapped
  if (yard) sink.placed(-Math.PI / 2, 0, 0, 0, () => bucherBody(sink, ctx, look, ctx.info.d, ctx.info.w));
  else bucherBody(sink, ctx, look, ctx.info.w, ctx.info.d);
  return sink.finish();
}

function bucherBody(sink: PartSink, ctx: RegionalBuildContext, look: () => number, pw: number, pd: number): void {
  const W = clamp(pw - 0.6, 2.2, 4.4), D = clamp(pd - 0.6, 2.4, 5.4);
  const pile = 1.4 + look() * 0.4;
  openShed(sink, { W, D, hLo: 2.05, pitchDeg: 20, back: true, ends: true, pile, block: look() < 0.5, mobile: ctx.tier === 'mobile' }, {
    timber: LARCH, post: 0.18, pad: { bucket: 'stone', size: 0.38, top: 0.24 },
    cladding: 'gapped', boards: [shade(LARCH, 0.9), shade(LARCH, 1.08), shade(LARCH_DARK, 1.2)], boardW: 0.22, gap: 0.03, trim: LARCH_DARK,
    covering: 'lauze', roofBucket: 'roof', eave: 0.4, verge: 0.3,
  }, look);
}

// ------------------------------------------------------------------------------------------------ the pass's buildings

/**
 * The chapel: rubble under white render, a lauze roof, the stone bell turret over the front gable (four piers and a
 * pyramid of lauzes, its bell), a porch on two larch posts before the door, a painted panel over it.
 * (dome-detail-275: "a plain box under a smooth roof with an open belfry; no quoins, cornice or surrounds") The Haute-
 * Maurienne's wayside chapel as Bessans and Bonneval paint theirs: the render's painted corner chains, its cornice and
 * the frieze of framed panels under it, the rakes painted under the verges, the round-headed lights in their painted
 * frames; the two little grilled lights beside the door the passer-by looks in at the altar through; the back's
 * stepped buttresses and its painted oculus; the lauzes' thick slabs on rafters, the snow boards; the porch's low rubble
 * walls and their slab benches, the posts' bolsters, knee braces and rafters, a step down from its flags; the turret's
 * round-headed openings, its cornice under the cap.
 */
const chapelle: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx);
  const look = ctx.variant;
  const fit = wallsIn(ctx, 0.48, 0.1);
  const W = clamp(fit.w, 4.4, 6.4), porch = 1.6, D = clamp(fit.d - porch, 5.6, 9.0);
  const zc = -porch / 2;
  sink.placed(0, fit.cx, 0, fit.cz, () => {
    const H = 4.3;
    sink.placed(0, 0, 0, zc, () => {
      const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'door', u: 0, w: 1.25, y0: 0, h: 2.4 }];
      // (dome-detail-275) the grilled lights beside the door; the side lights round-headed, two where the nave has room
      for (const s of [-1, 1]) openings.push({ face: 'front', storey: 0, kind: 'window', u: s * Math.min(1.35, W / 2 - 0.6), w: 0.32, h: 0.46, y0: 1.05 });
      for (const face of ['right', 'left'] as const) {
        for (const o of windowRhythm(face, 0, D, { w: 0.6, h: 1.0, sill: 2.0, spacing: 2.9, margin: 1.35, max: 2 })) openings.push({ ...o, arch: {} });
      }
      const frame = buildHouse(sink, {
        w: W, d: D, plinth: { h: 0.3, out: 0.06, bucket: 'stone' }, storeys: [{ h: H, wall: 'plaster' }],
        roof: lauze(30, 0.45, 0.5), gableBucket: 'plaster', openings, chimneys: [], gutters: null, verge: null, reveal: 0.4, rafters: LARCH_DARK,
      }, {
        ...dialect(st),
        // (a chapel's small lights unshuttered: open shutters laid on the render read as plates)
        window: (s, face, o, y0) => {
          if (o.face === 'front') {
            windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { frame: IRON, frameWidth: 0.035, frameOut: 0.02, bars: 'grille',
              surround: { bucket: 'stone', width: 0.12, out: 0.04 }, sill: { bucket: 'stone', out: 0.07 }, shutters: null }, st.rng, 0.1);
            return;
          }
          windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { frame: LARCH_DARK, frameWidth: 0.05, frameOut: 0.03, bars: 'cross', surround: null,
            sill: { bucket: 'stone', out: 0.08 }, shutters: null }, st.rng, 0.2);
          archGlazing(s, face, o.u, y0 + o.y0 + o.h, o.w / 2, LARCH_DARK);
        },
        door: (s, face, o, y0) => doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, {
          leaf: LARCH_DARK, frame: { bucket: 'stone', width: 0.24, out: 0.06, arch: true }, steps: { bucket: 'stone' }, leafKind: 'plank',
        }, y0 + o.y0),
      });
      purlins(sink, frame, LARCH_DARK);
      lauzeEdges(sink, frame, look);
      snowBoards(sink, frame);
      if (ctx.snowCap) drifts(sink, frame, frame.spec.openings, look);
      const F = frame.faces, f = F.front, y0 = frame.floors[0], eave = frame.eaveY;
      // the painted panel over the door (the patron saint), its ochre frame
      fresco(sink, f, 3.55, 1.2, 0.72);
      // ---- the paint (dome-detail-275): the cornice under the eave and its rose fillet, the corner chains, the lights'
      // frames, the frieze of framed panels between the lights' heads and the cornice, the rakes and the back's oculus
      sink.band('plaster', -W / 2 - 0.05, eave - 0.34, -D / 2 - 0.05, W / 2 + 0.05, eave - 0.14, D / 2 + 0.05, { decor: true, tint: OCHRE, shadow: true });
      for (const [g, phase] of [[F.front, 0], [F.back, 0], [F.right, 1], [F.left, 1]] as const) {
        for (const edge of [-1, 1] as const) paintChain(sink, g, edge, y0 + 0.05, eave - 0.4, phase);
      }
      for (const name of ['right', 'left'] as const) {
        const g = F[name], half = g.width / 2 - 0.75;
        paint(sink, g, 0, eave - 0.43, g.width, 0.08, ROSE);
        for (const o of openings.filter((q) => q.face === name)) paintedFrame(sink, g, o.u, y0 + o.y0, y0 + o.y0 + o.h, o.w, true);
        // the frieze: rose panels in ochre frames along the wall under the cornice
        const fy = eave - 0.72, n = Math.max(2, Math.round((2 * half) / 0.95));
        paint(sink, g, 0, fy, 2 * half + 0.1, 0.4, OCHRE);
        for (let k = 0; k < n; k++) paint(sink, g, -half + (k + 0.5) * (2 * half) / n, fy, (2 * half) / n - 0.12, 0.28, k % 2 ? ROSE : shade(ROSE, 0.92));
      }
      const rg = frame.roof;
      for (const g of [F.front, F.back]) for (const s of [-1, 1]) {
        sink.member('plaster', facePoint(g, s * (W / 2 - 0.05), eave - 0.2, 0), facePoint(g, 0, rg.ridgeY - 0.3, 0), 0.24, 0.03, g.out, { decor: true, tint: OCHRE });
      }
      paintArch(sink, F.back, 0, eave + 0.75, 0.3, 0.13, OCHRE, Math.PI * 2);
      paint(sink, F.back, 0, eave + 0.75, 0.44, 0.44, ROSE);
      // ---- the stepped buttresses at the back's corners (dome-detail-275), each its two offsets weathered back
      for (const s of [-1, 1]) {
        const x0 = s * W / 2, z0 = -D / 2 - 0.02, z1 = -D / 2 + 0.6;
        const step = (o0: number, o1: number, ya: number, yb: number, slope: number) => {
          sink.span('stone', Math.min(x0, x0 + s * o1), ya, z0, Math.max(x0, x0 + s * o1), yb, z1);
          // the offset's weathering: a sloped cap from the face's top back to the wall's line (or the next offset)
          orientedPrism(sink, 'stone', [[x0 + s * o0, yb, z0], [x0 + s * o1, yb, z0], [x0 + s * o0, yb + slope, z0]], [0, 0, 1], z1 - z0, { decor: true, shade: 0.9 });
        };
        step(0, 0.44, -0.3, 1.5, 0);
        step(0.26, 0.44, 1.5, 1.5, 0.3);
        step(0, 0.26, 1.5, 2.9, 0);
        step(0, 0.26, 2.9, 2.9, 0.42);
      }
      // the bell turret on the front gable's apex: four stone piers, its bell, a lauze pyramid
      const ridge = frame.roof.ridgeY, tz = D / 2 - 0.65, b = 0.48;
      // (props census #5: the turret a crown of the roof in the house's plan: it falls with its roof section)
      const capTop = ridge + 1.62 + (b + 0.16) * Math.tan(40 * Math.PI / 180) + 0.12 + 0.8;
      roofCrown(sink, frame, { kind: 'belfry', x0: -b - 0.16, x1: b + 0.16, z0: tz - b - 0.16, z1: tz + b + 0.16, y0: ridge - 0.6, y1: capTop, bucket: 'stone' }, () => {
        sink.span('stone', -b - 0.1, ridge - 0.6, tz - b - 0.1, b + 0.1, ridge + 0.25, tz + b + 0.1);
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
          sink.span('stone', sx * b - 0.14, ridge + 0.25, tz + sz * b - 0.14, sx * b + 0.14, ridge + 1.45, tz + sz * b + 0.14);
        }
        sink.span('stone', -b - 0.16, ridge + 1.45, tz - b - 0.16, b + 0.16, ridge + 1.62, tz + b + 0.16);
        // (dome-detail-275) the turret's openings round-headed: each face's spandrels filled through the piers' depth
        // under the slab, the stone ring round the head; the base's string course and the cornice in two steps
        const r = b - 0.14, spring = ridge + 1.45 - r, o2 = b + 0.14;
        const tf: Face[] = [{ origin: [0, 0, tz + o2], u: [1, 0, 0], out: [0, 0, 1], width: 2 * o2 }, { origin: [0, 0, tz - o2], u: [-1, 0, 0], out: [0, 0, -1], width: 2 * o2 },
          { origin: [o2, 0, tz], u: [0, 0, -1], out: [1, 0, 0], width: 2 * o2 }, { origin: [-o2, 0, tz], u: [0, 0, 1], out: [-1, 0, 0], width: 2 * o2 }];
        for (const fc of tf) {
          for (const s of [-1, 1]) {
            const fan: Vec3[] = [facePoint(fc, s * r, ridge + 1.45, 0)];
            for (let j = 0; j <= 4; j++) { const t = Math.PI / 2 * j / 4; fan.push(facePoint(fc, s * Math.cos(t) * r, spring + Math.sin(t) * r, 0)); }
            orientedPrism(sink, 'stone', fan, [-fc.out[0], -fc.out[1], -fc.out[2]], 0.28, { decor: true });
          }
          archHead(sink, fc, 0, spring, r, 'stone', 0.09, 6);
        }
        sink.band('stone', -b - 0.16, ridge + 0.22, tz - b - 0.16, b + 0.16, ridge + 0.34, tz + b + 0.16, { decor: true });
        sink.band('stone', -b - 0.24, ridge + 1.56, tz - b - 0.24, b + 0.24, ridge + 1.66, tz + b + 0.24, { decor: true, shadow: true });
        sink.cylinder('structureMetal', [0, ridge + 0.55, tz], 'y', 0.5, 0.26, 8, { colour: BELL, decor: true }, 0.13);
        // (the bell hung 5 cm under nothing, props census #5: its headstock beam across two bearers, each from pier to pier)
        for (const sx of [-1, 1]) sink.span('structureWood', sx * b - 0.06, ridge + 1.15, tz - b - 0.1, sx * b + 0.06, ridge + 1.25, tz + b + 0.1, { colour: LARCH_DARK, decor: true });
        sink.span('structureWood', -b, ridge + 1.05, tz - 0.05, b, ridge + 1.15, tz + 0.05, { colour: LARCH_DARK, decor: true });
        const cap: RoofSpec = { kind: 'hip', pitchDeg: 40, eave: 0.12, verge: 0.12, thickness: 0.12, bucket: 'roof', ridge: null };
        sink.placed(0, 0, 0, tz, () => emitRoof(sink, roofGeometry(2 * b + 0.32, 2 * b + 0.32, ridge + 1.62, cap), cap));
        const tip = ridge + 1.62 + (b + 0.16) * Math.tan(40 * Math.PI / 180) + 0.12;
        sink.span('structureMetal', -0.03, tip - 0.05, tz - 0.03, 0.03, tip + 0.8, tz + 0.03, { colour: IRON, decor: true });
        sink.span('structureMetal', -0.22, tip + 0.5, tz - 0.03, 0.22, tip + 0.56, tz + 0.03, { colour: IRON, decor: true });
      });
    });
    // the porch: two larch posts and a lauze lean-to from the front wall
    const fz = zc + D / 2, pz = fz + porch;
    for (const s of [-1, 1]) {
      sink.span('stone', s * 1.2 - 0.22, -0.3, pz - 0.42, s * 1.2 + 0.22, 0.35, pz + 0.02);
      sink.span('structureWood', s * 1.2 - 0.1, 0.35, pz - 0.3, s * 1.2 + 0.1, 2.75, pz - 0.1, { colour: LARCH });
      // (dome-detail-275) the porch's low rubble wall from the front wall to the post's pad, its slab coping the bench;
      // the post's bolster under the beam and its knee brace to it
      sink.span('stone', s * 1.2 - 0.19, -0.3, fz, s * 1.2 + 0.19, 0.72, pz - 0.42);
      sink.span('stone', s * 1.2 - 0.25, 0.72, fz, s * 1.2 + 0.25, 0.8, pz - 0.4, { decor: true, shade: 0.88 });
      sink.span('structureWood', s * 1.2 - 0.34, 2.48, pz - 0.3, s * 1.2 + 0.34, 2.6, pz - 0.1, { colour: LARCH_DARK, decor: true });
      sink.member('structureWood', [s * 1.2 - s * 0.08, 1.95, pz - 0.2], [s * 0.62, 2.55, pz - 0.2], 0.09, 0.09, [0, 0, 1], { colour: LARCH_DARK, decor: true, exposed: true }, 0);
    }
    sink.span('structureWood', -1.4, 2.6, pz - 0.32, 1.4, 2.8, pz - 0.08, { colour: LARCH_DARK, decor: true });
    const lean: RoofSpec = { kind: 'shed', pitchDeg: 18, eave: 0.25, verge: 0.3, thickness: 0.18, bucket: 'roof' };
    sink.placed(-Math.PI / 2, 0, 0, fz + porch / 2, () => {
      const lg = roofGeometry(porch, 2.8, 2.8, lean);
      emitRoof(sink, lg, lean);
      // (dome-detail-275) its lauzes in courses
      lauzeShed(sink, lg, lean, look);
    });
    // (dome-detail-275) the lean-to's rafters from the beam up to the front wall under its lauzes
    const rise = porch * Math.tan(18 * Math.PI / 180);
    for (const x of [-0.95, -0.32, 0.32, 0.95]) {
      sink.member('structureWood', [x, 2.8, pz - 0.2], [x, 2.8 + rise * (porch - 0.2) / porch - 0.01, fz + 0.02], 0.09, 0.11, [0, -1, 0], { colour: LARCH_DARK, decor: true, exposed: true }, 0);
    }
    sink.span('stone', -1.5, -0.3, fz, 1.5, 0.12, pz + 0.1, { decor: true });
    // the step down from the flags, worn in its middle
    sink.span('stone', -1.25, -0.3, pz + 0.1, 1.25, -0.02, pz + 0.38, { decor: true, shade: 0.9 });
  });
  return sink.finish();
};

/**
 * The parish church's paint (dome-detail-275): the Savoyard Baroque church's trompe-l'oeil on its render, as Lanslevillard's
 * and Bessans' fronts are painted — ochre pilasters and window frames, rose panels, grey corner chains, a cream sundial.
 * Tints on the render (the weathering takes them with the wall); a band is one quad, a pilaster stands 4 cm proud.
 */
const OCHRE: Rgb = [1.0, 0.82, 0.56], ROSE: Rgb = [0.97, 0.76, 0.68], CHAIN: Rgb = [0.8, 0.8, 0.79], CREAM: Rgb = [1.0, 0.96, 0.85];
const LINE: Rgb = [0.55, 0.36, 0.3];

/** A band of paint on the render: one quad on the face (dome-detail-275). */
function paint(sink: PartSink, f: Face, u: number, y: number, w: number, h: number, tint: Rgb, fine = false): void {
  facePanel(sink, 'plaster', f, u, y, 0.008, w, h, { decor: true, tint, ...(fine ? { fine: true } : {}) });
}

/** A painted ring over a round head (or the whole ring, an oculus): its segments of paint (dome-detail-275). */
function paintArch(sink: PartSink, f: Face, u: number, y: number, r: number, w: number, tint: Rgb, arc = Math.PI): void {
  const n = arc > 4 ? 14 : 8, at = (t: number, rr: number): Vec3 => facePoint(f, u + Math.cos(t) * rr, y + Math.sin(t) * rr, 0.008);
  for (let j = 0; j < n; j++) {
    const a = arc * j / n, b = arc * (j + 1) / n;
    sink.quad('plaster', at(a, r), at(a, r + w), at(b, r + w), at(b, r), { decor: true, tint });
  }
}

/**
 * The painted corner chain (chaîne d'angle; dome-detail-275): long and short blocks alternating up a corner, from the
 * face's `edge` end (+1 its +u end); `phase` 1 on the face round the corner, so each long block meets a short one.
 */
function paintChain(sink: PartSink, f: Face, edge: 1 | -1, y0: number, y1: number, phase: number): void {
  for (let y = y0, k = phase; y + 0.36 < y1; y += 0.47, k++) {
    const len = k % 2 ? 0.32 : 0.6;
    paint(sink, f, edge * (f.width / 2 - len / 2), y + 0.2, len, 0.4, k % 2 ? CHAIN : shade(CHAIN, 0.94));
  }
}

/** A painted pilaster in low relief (dome-detail-275): its shaft 4 cm proud, the capital and base a little wider. */
function pilaster(sink: PartSink, f: Face, u: number, y0: number, y1: number, w: number): void {
  faceBox(sink, 'plaster', f, u, (y0 + y1) / 2, 0.02, w, y1 - y0, 0.04, { decor: true, tint: OCHRE, fineSides: true });
  faceBox(sink, 'plaster', f, u, y1 - 0.1, 0.035, w + 0.16, 0.2, 0.07, { decor: true, tint: shade(OCHRE, 0.93) });
  faceBox(sink, 'plaster', f, u, y0 + 0.13, 0.03, w + 0.1, 0.26, 0.06, { decor: true, tint: shade(OCHRE, 0.9) });
}

/** The painted frame round a round-headed window (dome-detail-275): its jambs, the ring over the head, the keystone, the apron. */
function paintedFrame(sink: PartSink, f: Face, u: number, sill: number, spring: number, w: number, apron: boolean): void {
  const b = 0.17;
  for (const s of [-1, 1]) paint(sink, f, u + s * (w / 2 + b / 2), (sill + spring) / 2, b, spring - sill, OCHRE);
  paintArch(sink, f, u, spring, w / 2, b, OCHRE);
  faceBox(sink, 'plaster', f, u, spring + w / 2 + 0.11, 0.025, 0.2, 0.26, 0.05, { decor: true, tint: shade(OCHRE, 0.88) });
  if (apron) paint(sink, f, u, sill - 0.24, w + 0.3, 0.3, ROSE);
}

/** A prism stood up from y0 to y0 + h on a plan (x, z) polygon, wound either way (dome-detail-275). */
function upPrism(sink: PartSink, bucket: 'stone' | 'plaster', plan: ReadonlyArray<readonly [number, number]>, y0: number, h: number): void {
  let area = 0;
  for (let i = 0; i < plan.length; i++) { const [x0, z0] = plan[i], [x1, z1] = plan[(i + 1) % plan.length]; area += x0 * z1 - x1 * z0; }
  // ccw seen from +y: the plan's signed area in (x, z) is negative (z runs toward the viewer looking down)
  const pts = plan.map(([x, z]): Vec3 => [x, y0, z]);
  sink.prism(bucket, area > 0 ? pts.reverse() : pts, [0, 1, 0], h);
}

/**
 * The snow boards (barres à neige; dome-detail-275): a larch pole along each slope a little up from the eave, held on
 * iron stakes, the April snow's guard over the door and the graves.
 */
function snowBoards(sink: PartSink, frame: HouseFrame): void {
  const rg = frame.roof, spec = frame.spec;
  if (rg.kind !== 'gable') return;
  const x = rg.s + spec.roof.eave - 0.45, z1 = rg.halfD + spec.roof.verge - 0.12;
  for (const side of [-1, 1]) {
    const top = rg.topAt(side * x, 0), low = rg.topAt(side * (x + 0.1), 0);
    if (top === null || low === null) continue;
    sink.cylinder('structureWood', [side * x, top + 0.08, -z1], 'z', 2 * z1, 0.075, 6, { colour: LARCH_DARK, decor: true, shadow: true });
    for (let z = -z1 + 0.35; z < z1 - 0.2; z += 1.15) {
      sink.span('structureMetal', side * (x + 0.08) - 0.018, low - 0.04, z - 0.018, side * (x + 0.08) + 0.018, top + 0.2, z + 0.018, { colour: IRON, decor: true, fine: true });
    }
  }
}

/**
 * The parish church (the base onion church's plot): a rendered nave under lauzes, a stone tower over the entrance
 * with dressed quoins and the bell stage's openings, the baroque bulb clad in tin over it, its lantern, a smaller bulb
 * and the cross (the Savoyard clocher à bulbe). (dome-detail-275: "its details and presentation") The Maurienne's
 * Baroque parish church: the nave's render painted in trompe-l'oeil (pilasters, corner chains, the cornice, the
 * windows' frames), its round-headed windows, a deep lauze eave on rafters with its snow boards; the apse at the back
 * under its half pyramid; the tower in stages under string courses, its belfry's round heads, the sundial on its side;
 * the auvent on two larch posts over the door, the parvis and its steps down into the slope; the stone footing under
 * all of it, and a stub of the graveyard's wall at the back corner.
 */
const eglise: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx);
  const look = ctx.variant;
  const bb = ctx.bounds;
  // (dome-detail-275) the nave a little narrower, its deep eave inside the plot; the tower set back for the auvent
  // before its door; the nave shortened for the apse behind it
  const W = clamp(bb.maxX - bb.minX - 1.5, 5.4, 7.0), tower = 3.0, porch = 0.85;
  const zFront = bb.maxZ - porch - 0.1;
  const tz = zFront - tower / 2;
  const ad = 1.1, ra = Math.min(1.9, W / 2 - 0.9);
  const nz1 = zFront - tower + 0.3;
  const D = clamp(nz1 - (bb.minZ + 0.15 + ad), 4.6, 9.5);
  const nz0 = nz1 - D, nzc = nz1 - D / 2;
  const openings: Opening[] = [];
  // (dome-detail-275) the nave's windows round-headed, cut to their crowns
  for (const face of ['right', 'left'] as const) {
    for (const o of windowRhythm(face, 0, D, { w: 0.8, h: 1.5, sill: 2.0, spacing: 2.3, margin: 1.1, max: 3 })) openings.push({ ...o, arch: {} });
  }
  // the stone footing under the nave, the apse and the tower, down into the slope (dome-detail-275)
  sink.span('stone', -W / 2 - 0.1, -0.6, nz0 - 0.1, W / 2 + 0.1, 0.06, nz1);
  sink.placed(0, 0, 0, nzc, () => {
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: 0.45, out: 0.08, bucket: 'stone' }, storeys: [{ h: 5.0, wall: 'plaster' }],
      // (dome-detail-275) the deep eave on its rafters
      roof: lauze(32, 0.6, 0.45), gableBucket: 'plaster', openings, chimneys: [], gutters: null, verge: null, reveal: 0.45, rafters: LARCH_DARK,
    }, { ...dialect(st), window: (s, face, o, y0) => {
      windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, {
        frame: LARCH_DARK, frameWidth: 0.05, frameOut: 0.03, bars: 'six', surround: null, sill: { bucket: 'stone', out: 0.1 }, shutters: null,
      }, st.rng, 0.2);
      archGlazing(s, face, o.u, y0 + o.y0 + o.h, o.w / 2, LARCH_DARK);
    } });
    purlins(sink, frame, LARCH_DARK);
    snowBoards(sink, frame);
    if (ctx.snowCap) drifts(sink, frame, openings, look);
    const y0 = frame.floors[0], eave = frame.eaveY, F = frame.faces;
    // the painted cornice under the eave (a moulding in ochre, its fillet in rose under it) round the nave
    sink.band('plaster', -W / 2 - 0.06, eave - 0.4, -D / 2 - 0.06, W / 2 + 0.06, eave - 0.16, D / 2 + 0.06, { decor: true, tint: OCHRE, shadow: true });
    for (const f of [F.right, F.left, F.back]) paint(sink, f, 0, eave - 0.5, f.width, 0.1, ROSE);
    // the corner chains, each corner's blocks alternating round it
    for (const [f, phase] of [[F.front, 0], [F.back, 0], [F.right, 1], [F.left, 1]] as const) {
      for (const edge of [-1, 1] as const) paintChain(sink, f, edge, y0 + 0.05, eave - 0.45, phase);
    }
    // the windows' painted frames, and a pilaster between each two windows
    for (const name of ['right', 'left'] as const) {
      const f = F[name], us = openings.filter((o) => o.face === name).map((o) => o.u).sort((a, b) => a - b);
      for (const o of openings.filter((q) => q.face === name)) paintedFrame(sink, f, o.u, y0 + o.y0, y0 + o.y0 + o.h, o.w, true);
      // (between the corner chains and the windows too, where the wall has room for one)
      const stops = [-(D / 2 - 0.6), ...us, D / 2 - 0.6];
      for (let k = 0; k + 1 < stops.length; k++) if (stops[k + 1] - stops[k] > 1.8) pilaster(sink, f, (stops[k] + stops[k + 1]) / 2, y0, eave - 0.4, 0.36);
    }
    // the gables' rakes painted under the verges, the back gable's painted oculus over the apse
    const rg = frame.roof;
    for (const f of [F.front, F.back]) for (const s of [-1, 1]) {
      sink.member('plaster', facePoint(f, s * (W / 2 - 0.05), eave - 0.2, 0), facePoint(f, 0, rg.ridgeY - 0.32, 0), 0.26, 0.03, f.out, { decor: true, tint: OCHRE });
    }
    paintArch(sink, F.back, 0, eave + 0.95, 0.34, 0.14, OCHRE, Math.PI * 2);
    paint(sink, F.back, 0, eave + 0.95, 0.5, 0.5, ROSE);
  });

  // ---- the apse (dome-detail-275): the three-sided chevet behind the nave, lower, its walls rendered and painted, a
  // window in each canted side, under its half pyramid of lauzes leaning on the nave's back gable
  const He = 4.2, foot = 0.45;
  const V: Array<[number, number]> = [[ra, nz0], [ra * 0.5, nz0 - ad], [-ra * 0.5, nz0 - ad], [-ra, nz0]];
  upPrism(sink, 'stone', [[ra + 0.08, nz0], [ra * 0.5 + 0.05, nz0 - ad - 0.08], [-ra * 0.5 - 0.05, nz0 - ad - 0.08], [-ra - 0.08, nz0]], -0.6, 0.6 + foot);
  recordBody(sink, 0, nz0 - ad / 2, 2 * ra, ad, He, 'plaster');
  const apseWin: WindowStyle = { frame: LARCH_DARK, frameWidth: 0.05, frameOut: 0.03, bars: 'cross', surround: null, sill: { bucket: 'stone', out: 0.08 }, shutters: null };
  for (let i = 0; i < 3; i++) {
    const [xa, za] = V[i], [xb, zb] = V[i + 1], L = Math.hypot(xb - xa, zb - za), ux = (xb - xa) / L, uz = (zb - za) / L;
    const f: Face = { origin: [(xa + xb) / 2, 0, (za + zb) / 2], u: [ux, 0, uz], out: [-uz, 0, ux], width: L };
    const win = i !== 1 ? [{ u0: -0.27, u1: 0.27, y0: 1.95, y1: 3.1 }] : [];
    holedPolygon(sink, 'plaster', f, [[-L / 2, foot], [L / 2, foot], [L / 2, He], [-L / 2, He]], win, 0.4, 0.22);
    // the cornice band, the corner strips wrapping each canted corner, the frames painted round the lights
    paint(sink, f, 0, He - 0.25, L, 0.3, OCHRE);
    paint(sink, f, 0, He - 0.45, L, 0.08, ROSE);
    for (const s of [-1, 1]) if (!(i === 0 && s < 0) && !(i === 2 && s > 0)) paint(sink, f, s * (L / 2 - 0.13), (foot + He - 0.4) / 2, 0.26, He - 0.4 - foot, OCHRE);
    if (win.length) {
      sink.recess = 0.22;
      try { windowUnit(sink, f, 0, 1.95, 0.54, 1.15, apseWin, look, 0.15); } finally { sink.recess = 0; }
      paintedFrame(sink, f, 0, 1.95, 3.1, 0.54, false);
    } else {
      // the back's trompe-l'oeil: a blind window painted in its frame
      paint(sink, f, 0, 2.5, 0.6, 1.3, shade(ROSE, 0.9));
      paintedFrame(sink, f, 0, 1.85, 3.15, 0.6, false);
    }
  }
  // the half pyramid: each slope the plane through the apex on the nave's gable and a wall's top edge, run out past the
  // walls (scaled about the apex, so the eaves stay level and the hips close), a slab of lauzes; the hips capped
  {
    const A: Vec3 = [0, He + 1.0, nz0], k = 1.28;
    const E = V.map(([x, z]): Vec3 => [A[0] + (x - A[0]) * k, A[1] + (He - A[1]) * k, A[2] + (z - A[2]) * k]);
    for (let i = 0; i < 3; i++) {
      let b = E[i], c = E[i + 1];
      const e1 = [b[0] - A[0], b[1] - A[1], b[2] - A[2]], e2 = [c[0] - A[0], c[1] - A[1], c[2] - A[2]];
      let n: Vec3 = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      if (n[1] < 0) { [b, c] = [c, b]; n = [-n[0], -n[1], -n[2]]; }
      const nl = Math.hypot(n[0], n[1], n[2]);
      sink.prism('roof', [A, b, c], [n[0] / nl, n[1] / nl, n[2] / nl], 0.22, { decor: true });
    }
    for (const i of [1, 2]) {
      const t: Vec3 = [E[i][0], E[i][1] + 0.2, E[i][2]], a: Vec3 = [A[0], A[1] + 0.22, A[2] - 0.05];
      const dx = t[0] - a[0], dy = t[1] - a[1], dz = t[2] - a[2], dl = Math.hypot(dx, dy, dz), up = dy / dl;
      const ox = -up * dx / dl, oy = 1 - up * dy / dl, oz = -up * dz / dl, ol = Math.hypot(ox, oy, oz);
      sink.member('roof', a, t, 0.24, 0.1, [ox / ol, oy / ol, oz / ol], { decor: true, exposed: true }, 0);
    }
  }

  // ---- the tower: shaft, quoins, the stages, the bell stage, the bulb
  const half = tower / 2, shaft = 9.2;
  sink.span('stone', -half - 0.1, -0.6, tz - half - 0.1, half + 0.1, 0.5, tz + half + 0.1);
  // (props census #5) the shaft's door and its bell stage's openings cut through it (the leaf and the openings were laid
  // on a solid span), the leaf at the back of the door's reveal, a bell in each opening's dark; the tower recorded as a
  // shaft body (it topples in its courses, the bulb its crown)
  // (dome-detail-275) the belfry's openings taller, round-headed: cut to their crowns' height, the spandrels filled
  const tRev = 0.34, bo = 0.42, spring = shaft - 1.02, bellHole = { u0: -bo, u1: bo, y0: shaft - 2.15, y1: spring + bo };
  holedBox(sink, 'plaster', -half, tz - half, half, tz + half, 0.5, shaft,
    { front: [{ u0: -0.65, u1: 0.65, y0: 0.5, y1: 3.1 }, bellHole], right: [bellHole], back: [bellHole], left: [bellHole] }, 0.4, tRev);
  recordShaft(sink, 0, tz, tower, shaft + 6.2, 'plaster');
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    for (let y = 0.6, k = 0; y < shaft - 0.4; y += 0.52, k++) {
      const lx = k % 2 ? 0.5 : 0.28, lz = k % 2 ? 0.28 : 0.5;
      sink.quoin('stone', sx * half - sx * lx, y, tz + sz * half - sz * lz, sx * half + sx * 0.03, y + 0.46, tz + sz * half + sz * 0.03, sx, sz, { decor: true });
    }
  }
  // the stages: string courses at the door's head and at the belfry's sill (dome-detail-275)
  for (const y of [3.85, shaft - 2.3]) sink.band('stone', -half - 0.07, y, tz - half - 0.07, half + 0.07, y + 0.15, tz + half + 0.07, { decor: true, shadow: true });
  const tf: Face = { origin: [0, 0, tz + half], u: [1, 0, 0], out: [0, 0, 1], width: tower };
  sink.recess = tRev;
  try {
    // (dome-detail-275) the door's steps are the parvis's now
    doorUnit(sink, tf, 0, 0.5, 1.3, 2.6, { leaf: LARCH_DARK, frame: { bucket: 'stone', width: 0.28, out: 0.1, arch: true }, steps: null, leafKind: 'plank' }, 0.5);
  } finally { sink.recess = 0; }
  fresco(sink, tf, 5.15, 0.8, 1.0);
  // the bell stage: an opening on each face with its bell; its round head's spandrels and stone ring, the keystone
  const faces: Face[] = [
    { origin: [0, 0, tz + half], u: [1, 0, 0], out: [0, 0, 1], width: tower }, { origin: [0, 0, tz - half], u: [-1, 0, 0], out: [0, 0, -1], width: tower },
    { origin: [half, 0, tz], u: [0, 0, -1], out: [1, 0, 0], width: tower }, { origin: [-half, 0, tz], u: [0, 0, 1], out: [-1, 0, 0], width: tower },
  ];
  for (const fc of faces) {
    sink.cylinder('structureMetal', facePoint(fc, 0, shaft - 1.75, -0.34 + 0.2), 'y', 0.5, 0.24, 8, { colour: rgb(0x7a6340), decor: true }, 0.12);
    for (const s of [-1, 1]) {
      const fan: Vec3[] = [facePoint(fc, s * bo, spring + bo, 0)];
      for (let j = 0; j <= 5; j++) {
        const t = Math.PI / 2 * j / 5;
        fan.push(facePoint(fc, s * Math.cos(t) * bo, spring + Math.sin(t) * bo, 0));
      }
      sink.polygon('plaster', s > 0 ? [fan[0], ...fan.slice(1).reverse()] : fan, { decor: true });
    }
    archHead(sink, fc, 0, spring, bo, 'stone', 0.15, 7);
    faceBox(sink, 'stone', fc, 0, spring + bo + 0.1, 0.03, 0.2, 0.28, 0.06, { decor: true });
    for (const s of [-1, 1]) faceBox(sink, 'stone', fc, s * (bo + 0.07), spring - 0.04, 0.03, 0.26, 0.1, 0.06, { decor: true });
  }
  // the crowning cornice in two steps (dome-detail-275)
  sink.band('stone', -half - 0.1, shaft - 0.14, tz - half - 0.1, half + 0.1, shaft + 0.04, tz + half + 0.1, { decor: true });
  sink.band('stone', -half - 0.18, shaft + 0.04, tz - half - 0.18, half + 0.18, shaft + 0.3, tz + half + 0.18, { decor: true, shadow: true });
  // the sundial on the tower's side (dome-detail-275): its cream panel in a rose frame, the hours ruled in fine lines
  // from the gnomon's foot, the motto's band under it, the iron gnomon
  {
    const sf = faces[2], du = -0.25, dy = 5.45, dw = 1.15, dh = 1.35;
    paint(sink, sf, du, dy, dw + 0.2, dh + 0.2, ROSE);
    paint(sink, sf, du, dy, dw, dh, CREAM);
    paint(sink, sf, du, dy - dh / 2 - 0.22, dw + 0.2, 0.16, LINE);
    const root = dy + dh / 2 - 0.16;
    for (let j = 0; j < 9; j++) {
      const a = -Math.PI / 2 + (j - 4) * 0.3, r0 = 0.12, r1 = Math.min((dh - 0.3) / Math.abs(Math.sin(a)), (dw / 2 - 0.08) / Math.max(1e-3, Math.abs(Math.cos(a))));
      sink.member('plaster', facePoint(sf, du + Math.cos(a) * r0, root + Math.sin(a) * r0, 0.012), facePoint(sf, du + Math.cos(a) * r1, root + Math.sin(a) * r1, 0.012),
        0.025, 0.006, sf.out, { decor: true, tint: LINE, fine: true }, 0);
    }
    sink.member('structureMetal', facePoint(sf, du, root, 0), facePoint(sf, du, root - 0.35, 0.4), 0.025, 0.025, [0, 0, 1], { colour: IRON, decor: true, exposed: true }, 0);
    // (dome-detail-275, kitConnectivity: the gnomon's tip stood free in the air) its iron stay from the wall up to the tip
    sink.member('structureMetal', facePoint(sf, du, root - 0.75, 0), facePoint(sf, du, root - 0.36, 0.39), 0.02, 0.02, [0, 0, 1], { colour: IRON, decor: true, exposed: true }, 0);
  }

  // ---- the auvent over the door (dome-detail-275): the parvis's stone platform, two larch posts on their pads, the beam
  // and its knee braces, the lean-to of lauzes from the tower's face; the steps down from the parvis into the slope
  {
    const pz = zFront + porch - 0.15, top = 3.15;
    sink.span('stone', -1.45, -0.6, zFront, 1.45, 0.5, zFront + porch + 0.05);
    for (let k = 0; k < 2; k++) {
      const z0 = zFront + porch + 0.05 + k * 0.25, inset = k * 0.12 + look() * 0.05;
      sink.span('stone', -1.32 + inset, -0.5, z0, 1.32 - inset, 0.5 - (k + 1) * 0.17, z0 + 0.25, { decor: true });
    }
    for (const s of [-1, 1]) {
      sink.span('stone', s * 1.15 - 0.16, 0.5, pz - 0.16, s * 1.15 + 0.16, 0.62, pz + 0.16);
      sink.span('structureWood', s * 1.15 - 0.1, 0.62, pz - 0.1, s * 1.15 + 0.1, top - 0.2, pz + 0.1, { colour: LARCH });
      sink.member('structureWood', [s * 1.15, top - 0.75, pz], [s * 0.6, top - 0.2, pz], 0.09, 0.09, [0, 0, 1], { colour: LARCH_DARK, decor: true, exposed: true }, 0);
    }
    const bt = top + 0.15 * Math.tan(28 * Math.PI / 180);
    sink.span('structureWood', -1.4, bt - 0.2, pz - 0.12, 1.4, bt, pz + 0.12, { colour: LARCH_DARK });
    const lean: RoofSpec = { kind: 'shed', pitchDeg: 28, eave: 0.22, verge: 0.28, thickness: 0.16, bucket: 'roof', decor: true };
    sink.placed(-Math.PI / 2, 0, 0, zFront + porch / 2, () => emitRoof(sink, roofGeometry(porch, 2.8, top, lean), lean));
  }

  // ---- the graveyard's wall (dome-detail-275): a stub of rubble at the plot's back corner under its lauze coping, its
  // broken end stepping down; two wooden crosses under their little hoods by the apse
  {
    const gx = bb.minX + 0.2, gz = bb.minZ + 0.2, h = 1.0 + look() * 0.15, end = -ra - 0.35, e1 = end - 0.45;
    sink.span('stone', gx, -0.5, gz, gx + 0.42, h, gz + 1.0);
    sink.span('stone', gx + 0.42, -0.5, gz, e1, h, gz + 0.42);
    sink.span('stone', e1, -0.5, gz, end, h - 0.3 - look() * 0.12, gz + 0.42);
    sink.span('roof', gx - 0.05, h, gz - 0.05, gx + 0.47, h + 0.08, gz + 1.0, { decor: true });
    sink.span('roof', gx + 0.47, h, gz - 0.05, e1, h + 0.08, gz + 0.47, { decor: true });
    for (const [k, x] of [[0, gx + 0.85], [1, gx + 1.45]] as const) {
      const z = gz + 0.72, ch = 0.95 + k * 0.12;
      sink.span('stone', x - 0.2, -0.2, z - 0.12, x + 0.2, 0.08, z + 0.12, { decor: true });
      sink.span('structureWood', x - 0.04, 0.08, z - 0.04, x + 0.04, ch, z + 0.04, { colour: LARCH_DARK, decor: true });
      sink.span('structureWood', x - 0.24, ch - 0.32, z - 0.035, x + 0.24, ch - 0.25, z + 0.035, { colour: LARCH_DARK, decor: true });
      for (const s of [-1, 1]) sink.member('structureWood', [x, ch + 0.08, z], [x + s * 0.17, ch - 0.06, z], 0.12, 0.02, [0, 0, 1], { colour: LARCH, decor: true, exposed: true, fine: true }, 0);
    }
  }

  // the bulb: a neck, the swelling bulb, the lantern, the small bulb, the spike and the cross (tin, frustum rings)
  // (round 2, wave 109b: the tin read as "a salmon-pink onion dome" under the low April sun) clad in larch shingles
  // (tavaillons), dark with age, as many of the Maurienne's bulbs are
  let y = shaft + 0.3;
  const profile: Array<[number, number, number]> = [[0.4, 1.45, 1.2], [0.45, 1.2, 1.55], [0.5, 1.55, 1.62], [0.5, 1.62, 1.42], [0.45, 1.42, 0.95],
    [0.4, 0.95, 0.42], [0.5, 0.42, 0.42]];
  // (dome-detail-275: seven frustums of twelve flat facets) the same bulb turned smooth (domes.ts)
  y = bulb(sink, 'structureWood', 0, y, tz, profile, { colour: SHINGLE });
  // the lantern: four little openings round a drum (props census #5: they were dark plates on it): its sill and head
  // rings, the dark drum set back between them, four posts between the openings
  sink.cylinder('structureWood', [0, y, tz], 'y', 0.12, 0.5, 8, { colour: shade(SHINGLE, 0.9) }, 0.5);
  sink.cylinder('structureWood', [0, y + 0.6, tz], 'y', 0.15, 0.5, 8, { colour: shade(SHINGLE, 0.9) }, 0.5);
  sink.cylinder('dark', [0, y + 0.12, tz], 'y', 0.48, 0.36, 8, { decor: true }, 0.36, false);
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + k * Math.PI / 2, px = Math.cos(a) * 0.4, pz = tz + Math.sin(a) * 0.4;
    sink.span('structureWood', px - 0.09, y + 0.12, pz - 0.09, px + 0.09, y + 0.6, pz + 0.09, { colour: shade(SHINGLE, 0.86) });
  }
  y += 0.75;
  y = bulb(sink, 'structureWood', 0, y, tz, [[0.3, 0.62, 0.72], [0.35, 0.72, 0.52], [0.35, 0.52, 0.12]], { colour: SHINGLE });
  sink.span('structureMetal', -0.03, y - 0.05, tz - 0.03, 0.03, y + 0.95, tz + 0.03, { colour: IRON, decor: true });
  sink.span('structureMetal', -0.24, y + 0.62, tz - 0.03, 0.24, y + 0.68, tz + 0.03, { colour: IRON, decor: true });
  sink.cylinder('structureMetal', [0, y + 0.2, tz], 'y', 0.16, 0.09, 8, { colour: rgb(0xb8933e), decor: true }, 0.09);
  return sink.finish();
};

/**
 * The hospice of the pass (the inn's plot on the north shore): three storeys of rubble under white render on a stone
 * plinth, dressed quoins, a hipped lauze roof with two stacks, rows of shuttered windows, the door in a stone frame
 * under an inscribed panel, a small bell turret on the ridge (the hospice's bell for travellers in the fog).
 */
const hospice: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx);
  const fit = wallsIn(ctx, 0.6, 0.6);
  const W = clamp(fit.w, 8.0, 11), D = clamp(fit.d, 11, 16);
  sink.placed(0, fit.cx, 0, fit.cz, () => {
    const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'door', u: 0, w: 1.6, y0: 0, h: 2.7 }];
    for (let i = 0; i < 3; i++) {
      for (const o of windowRhythm('front', i, W, { w: 0.85, h: i ? 1.3 : 1.2, sill: i ? 0.8 : 1.1, spacing: 2.2, margin: 1.1, avoid: i ? [] : [[-1.1, 1.1]] })) openings.push(o);
      for (const face of ['right', 'left'] as const) for (const o of windowRhythm(face, i, D, { w: 0.85, h: i ? 1.3 : 1.15, sill: i ? 0.8 : 1.15, spacing: 2.4, margin: 1.2 })) openings.push(o);
      for (const o of windowRhythm('back', i, W, { w: 0.8, h: 1.2, sill: 0.9, spacing: 2.6, margin: 1.2 })) openings.push(o);
    }
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: 0.6, out: 0.08, bucket: 'stone' },
      // (round 2, wave 109b: "an isolated three-storey box with tan speckle ... no whitewashed reveals") the pass's grey
      // rubble, every opening banded in whitewash, as the village's houses
      storeys: [{ h: 3.2, wall: 'stone' }, { h: 2.9, wall: 'stone' }, { h: 2.7, wall: 'stone' }],
      roof: lauze(26, 0.55, 0.55, 'hip'), openings, gutters: null, verge: null, reveal: 0.45, spall: null,
      chimneys: [{ x: -W * 0.22, z: -D * 0.25, sx: 0.8, sz: 0.8, above: 1.0, bucket: 'stone', cap: 'slab' },
        { x: W * 0.22, z: D * 0.22, sx: 0.8, sz: 0.8, above: 1.0, bucket: 'stone', cap: 'slab' }],
    }, { ...dialect(st), window: (s, face, o, y0) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, {
      ...st.window, surround: { bucket: 'plaster', width: 0.18, out: 0.02, lintel: 0.24 }, shutters: { colour: rgb(0x6a7270), kind: 'louvred', closed: 0.35 },
    }, st.rng, 0.35) });
    if (ctx.snowCap) drifts(sink, frame, openings, ctx.variant);
    // the way to the door: a flagged apron swept clear before it, out to the road
    const fa = frame.faces.front;
    faceBox(sink, 'stone', fa, 0, -0.12, 1.9, 3.4, 0.3, 3.4, { decor: true });
    const b0 = frame.bodies[0];
    for (const [cx, cz] of [[b0.x0, b0.z0], [b0.x1, b0.z0], [b0.x0, b0.z1], [b0.x1, b0.z1]] as const) {
      const sx = cx > 0 ? 1 : -1, sz = cz > 0 ? 1 : -1;
      for (let y = 0.7, k = 0; y < frame.eaveY - 0.5; y += 0.6, k++) {
        const lx = k % 2 ? 0.62 : 0.34, lz = k % 2 ? 0.34 : 0.62;
        sink.quoin('stone', cx - sx * lx, y, cz - sz * lz, cx + sx * 0.03, y + 0.52, cz + sz * 0.03, sx, sz, { decor: true });
      }
    }
    const f = frame.faces.front;
    faceBox(sink, 'stone', f, 0, frame.floors[0] + 3.0, 0.05, 2.0, 0.42, 0.1, { decor: true, shadow: true });
    faceBox(sink, 'dark', f, 0, frame.floors[0] + 3.0, 0.105, 1.7, 0.16, 0.01, { decor: true });
    // the bell turret astride the ridge
    const ry = frame.roof.ridgeY;
    sink.span('stone', -0.45, ry - 0.5, -0.45, 0.45, ry + 0.4, 0.45);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) sink.span('stone', sx * 0.36 - 0.1, ry + 0.4, sz * 0.36 - 0.1, sx * 0.36 + 0.1, ry + 1.3, sz * 0.36 + 0.1);
    sink.cylinder('structureMetal', [0, ry + 0.55, 0], 'y', 0.45, 0.24, 8, { colour: BELL, decor: true }, 0.12);
    const cap: RoofSpec = { kind: 'hip', pitchDeg: 38, eave: 0.1, verge: 0.1, thickness: 0.1, bucket: 'roof', ridge: null };
    emitRoof(sink, roofGeometry(1.0, 1.0, ry + 1.3, cap), cap);
  });
  return sink.finish();
};

/**
 * The hospice of the Mont-Cenis on its own plot (round 4; gauntlet wave 182: "a small hut where the stone hospice
 * should read"; the coordinator approved a planned site with a hospice-sized plot): the pass's long hospice block — four
 * storeys of rubble under white render on a stone plinth, dressed quoins, rows of shuttered windows, the door to the
 * road under its inscribed panel, a hipped lauze roof with three stacks — and its chapel at the far end, lower, gabled,
 * a bell turret on its front gable over the arched door. On the warehouse's plot (16 x 24 m): the block 15 m across and
 * some 16 m along the road, the chapel closing the plot's +z end; the block's long front and door on the plot's -x (the road).
 */
const hospiceGrand: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx);
  const fit = wallsIn(ctx, 0.42, 0.42);
  // the whole measured box (the base's reach, regionalArchitecture's footprint coverage): 16.8 x 28.2 m on Glacier Pass
  const W = clamp(fit.w, 9, 17), all = clamp(fit.d, 16, 29);
  const chapelD = clamp(all * 0.3, 5.5, 7.2), D = all - chapelD;
  const zb = fit.cz - all / 2 + D / 2, zc = fit.cz + all / 2 - chapelD / 2;
  const win = (s: PartSink, face: Face, o: Opening, y0: number) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, {
    ...st.window, surround: { bucket: 'plaster', width: 0.18, out: 0.02, lintel: 0.24 }, shutters: { colour: rgb(0x6a7270), kind: 'louvred', closed: 0.35 },
  }, st.rng, 0.35);
  // the block: its ridge along the plot (a hip roof's ridge runs along its house frame's z), the door and the long front
  // on its left face, the plot's -x, to the road; its +z end against the chapel
  sink.placed(0, fit.cx, 0, zb, () => {
    const w = W, d = D;
    const openings: Opening[] = [{ face: 'left', storey: 0, kind: 'door', u: 0, w: 1.8, y0: 0, h: 2.9 }];
    for (let i = 0; i < 4; i++) {
      // (the hospice's rows wide-set on the lake side and the far end: the kit's 12 000-triangle building budget; the lake
      // side's rows 4.3 m apart and the far end's 4.0 since the PR head's facade craft added its surrounds' triangles,
      // 2026-10-07: three windows a storey on each)
      for (const o of windowRhythm('left', i, d, { w: 0.9, h: i ? 1.35 : 1.2, sill: i ? 0.8 : 1.1, spacing: 2.5, margin: 1.2, avoid: i ? [] : [[-1.4, 1.4]] })) openings.push(o);
      for (const o of windowRhythm('right', i, d, { w: 0.85, h: 1.25, sill: 0.9, spacing: 4.3, margin: 1.4 })) openings.push(o);
      for (const o of windowRhythm('back', i, w, { w: 0.85, h: 1.25, sill: 0.9, spacing: 4.0, margin: 1.6 })) openings.push(o);
      // the chapel's end: windows only above the chapel's roof
      if (i === 3) for (const o of windowRhythm('front', i, w, { w: 0.85, h: 1.2, sill: 0.9, spacing: 3.4, margin: 2.4 })) openings.push(o);
    }
    const frame = buildHouse(sink, {
      w, d, plinth: { h: 0.7, out: 0.08, bucket: 'stone' },
      storeys: [{ h: 3.3, wall: 'stone' }, { h: 2.9, wall: 'stone' }, { h: 2.8, wall: 'stone' }, { h: 2.6, wall: 'stone' }],
      roof: lauze(27, 0.6, 0.6, 'hip'), openings, gutters: null, verge: null, reveal: 0.45, spall: null,
      chimneys: [{ x: -w * 0.2, z: -d * 0.3, sx: 0.8, sz: 0.8, above: 1.1, bucket: 'stone', cap: 'slab' },
        { x: w * 0.18, z: 0, sx: 0.8, sz: 0.8, above: 1.1, bucket: 'stone', cap: 'slab' },
        { x: -w * 0.2, z: d * 0.3, sx: 0.8, sz: 0.8, above: 1.1, bucket: 'stone', cap: 'slab' }],
    }, { ...dialect(st), window: win });
    if (ctx.snowCap) drifts(sink, frame, openings, ctx.variant);
    const fa = frame.faces.left;
    // the swept flags before the door, the inscribed panel over it
    faceBox(sink, 'stone', fa, 0, -0.12, 1.9, 3.8, 0.3, 3.4, { decor: true });
    faceBox(sink, 'stone', fa, 0, frame.floors[0] + 3.2, 0.05, 2.4, 0.46, 0.1, { decor: true, shadow: true });
    // (the r2 sweep: a black strip painted on the tablet) the inscription cut into it, its letters' shadowed grooves
    faceBox(sink, 'stone', fa, 0, frame.floors[0] + 3.2, 0.103, 2.1, 0.18, 0.008, { decor: true, shade: 0.74 });
    const b0 = frame.bodies[0];
    for (const [cx, cz] of [[b0.x0, b0.z0], [b0.x1, b0.z0], [b0.x0, b0.z1], [b0.x1, b0.z1]] as const) {
      const sx = cx > 0 ? 1 : -1, sz = cz > 0 ? 1 : -1;
      for (let y = 0.8, k = 0; y < frame.eaveY - 0.5; y += 0.6, k++) {
        const lx = k % 2 ? 0.64 : 0.36, lz = k % 2 ? 0.36 : 0.64;
        sink.quoin('stone', cx - sx * lx, y, cz - sz * lz, cx + sx * 0.03, y + 0.52, cz + sz * 0.03, sx, sz, { decor: true });
      }
    }
  });
  // the chapel: its back against the block's end, its front and door to the plot's +z
  sink.placed(0, fit.cx, 0, zc, () => {
    const cw = clamp(W * 0.58, 6.5, 9.0), H = 5.6;
    const frame = buildHouse(sink, {
      w: cw, d: chapelD + 0.3, plinth: { h: 0.4, out: 0.06, bucket: 'stone' }, storeys: [{ h: H, wall: 'plaster' }],
      roof: lauze(36, 0.45, 0.5), gableBucket: 'plaster',
      openings: [{ face: 'front', storey: 0, kind: 'door', u: 0, w: 1.4, y0: 0, h: 2.7 },
        { face: 'right', storey: 0, kind: 'window', u: 0, w: 0.7, h: 1.4, y0: 2.4 }, { face: 'left', storey: 0, kind: 'window', u: 0, w: 0.7, h: 1.4, y0: 2.4 }],
      chimneys: [], gutters: null, verge: null, reveal: 0.4,
    }, { ...dialect(st), door: (s, face, o, y0) => doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, {
      leaf: LARCH_DARK, frame: { bucket: 'stone', width: 0.26, out: 0.06, arch: true }, steps: { bucket: 'stone' }, leafKind: 'plank',
    }, y0 + o.y0) });
    if (ctx.snowCap) drifts(sink, frame, frame.spec.openings, ctx.variant);
    const f = frame.faces.front;
    // (the r2 sweep: the panel over the door was a dark plate on the render) the saint's fresco in its frame
    fresco(sink, f, 3.6, 1.1, 0.64);
    // the bell turret on the front gable's apex
    const ridge = frame.roof.ridgeY, tz = (chapelD + 0.3) / 2 - 0.7, b = 0.55;
    sink.span('stone', -b - 0.1, ridge - 0.6, tz - b - 0.1, b + 0.1, ridge + 0.25, tz + b + 0.1);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
      sink.span('stone', sx * b - 0.15, ridge + 0.25, tz + sz * b - 0.15, sx * b + 0.15, ridge + 1.55, tz + sz * b + 0.15);
    }
    sink.span('stone', -b - 0.17, ridge + 1.55, tz - b - 0.17, b + 0.17, ridge + 1.72, tz + b + 0.17);
    sink.cylinder('structureMetal', [0, ridge + 0.6, tz], 'y', 0.55, 0.28, 8, { colour: BELL, decor: true }, 0.14);
    // (the connectivity sweep, 217: the bell hung in air between the piers) its crown's iron stem up to the turret's slab
    sink.span('structureMetal', -0.04, ridge + 1.1, tz - 0.04, 0.04, ridge + 1.57, tz + 0.04, { colour: shade(BELL, 0.6), decor: true });
    const cap: RoofSpec = { kind: 'hip', pitchDeg: 40, eave: 0.12, verge: 0.12, thickness: 0.12, bucket: 'roof', ridge: null };
    sink.placed(0, 0, 0, tz, () => emitRoof(sink, roofGeometry(2 * b + 0.34, 2 * b + 0.34, ridge + 1.72, cap), cap));
  });
  return sink.finish();
};

/**
 * The frontier guard's barracks (the base lodge's plot): the Italian casermetta of the 1930s — two storeys rendered in
 * ochre on a grey stone plinth, a grey band at the floor and under the eaves, regular windows with grey shutters, a
 * concrete canopy on two piers over the door with the inscription band above it, a hipped lauze roof, a flag mast.
 * (dome-detail-275) The Guardia alla Frontiera's barracks as they stand on the passes: the gneiss quoins up its corners,
 * the door's rusticated surround and its keyed flat arch, the cornice's two steps under the rafters' feet, the lauzes'
 * thick slabs round its eaves and their courses up to the hips, and the striped sentry box by the door.
 */
const caserma: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx);
  const look = ctx.variant;
  const bb = ctx.bounds;
  const W = clamp(bb.maxX - bb.minX - 1.0, 9, 12.5), D = clamp(bb.maxZ - bb.minZ - 2.6, 11, 16);
  const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'door', u: 0, w: 1.8, y0: 0, h: 2.6 }];
  for (const i of [0, 1]) {
    for (const o of windowRhythm('front', i, W, { w: 1.0, h: 1.4, sill: 0.95, spacing: 2.0, margin: 1.0, avoid: i ? [] : [[-1.3, 1.3]] })) openings.push(o);
    for (const face of ['right', 'left'] as const) for (const o of windowRhythm(face, i, D, { w: 1.0, h: 1.4, sill: 0.95, spacing: 2.2, margin: 1.1 })) openings.push(o);
    for (const o of windowRhythm('back', i, W, { w: 1.0, h: 1.3, sill: 1.0, spacing: 2.4, margin: 1.2 })) openings.push(o);
  }
  const zc = bb.minZ + 0.5 + D / 2;
  sink.placed(0, (bb.minX + bb.maxX) / 2, 0, zc, () => {
    const frame = buildHouse(sink, {
      // (round 4, wave 188: "no plinth, drift or contact shade"): the gneiss plinth to the sills' foot, proud of the render
      w: W, d: D, plinth: { h: 0.95, out: 0.1, bucket: 'stone' }, storeys: [{ h: 3.4, wall: 'plaster2' }, { h: 3.2, wall: 'plaster2' }],
      // (dome-detail-275) the rafters' feet under the eaves
      roof: lauze(22, 0.5, 0.5, 'hip'), openings, gutters: { colour: rgb(0x55595a) }, verge: null, reveal: 0.3, spall: 'stone', rafters: LARCH_DARK,
      chimneys: [{ x: 0, z: -D * 0.2, sx: 0.7, sz: 0.7, above: 0.9, bucket: 'plaster2', cap: 'slab' }],
    }, { ...dialect(st), window: (s, face, o, y0) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, {
      frame: rgb(0xd8d4c8), frameWidth: 0.06, frameOut: 0.04, bars: 'cross', surround: { bucket: 'plaster3', width: 0.14, out: 0.02, lintel: 0.18 },
      sill: { bucket: 'stone', out: 0.08 }, shutters: { colour: rgb(0x5f6a66), kind: 'louvred', closed: 0.4 },
    }, st.rng, 0.4) });
    lauzeHip(sink, frame, look);
    if (ctx.snowCap) drifts(sink, frame, openings, look);
    const b = frame.bodies[0];
    for (const yb of [frame.floors[1], frame.eaveY - 0.25]) sink.band('plaster3', b.x0 - 0.05, yb - 0.12, b.z0 - 0.05, b.x1 + 0.05, yb + 0.12, b.z1 + 0.05, { decor: true });
    // (dome-detail-275) the cornice's upper step under the rafters
    sink.band('plaster3', b.x0 - 0.13, frame.eaveY - 0.11, b.z0 - 0.13, b.x1 + 0.13, frame.eaveY, b.z1 + 0.13, { decor: true, shadow: true });
    // the gneiss quoins up the corners from the plinth to the cornice, long and short (dome-detail-275)
    for (const [cx, cz] of [[b.x0, b.z0], [b.x1, b.z0], [b.x0, b.z1], [b.x1, b.z1]] as const) {
      const sx = cx > 0 ? 1 : -1, sz = cz > 0 ? 1 : -1;
      for (let y = frame.floors[0] + 0.04, k = 0; y < frame.eaveY - 0.5; y += 0.5, k++) {
        if (Math.abs(y + 0.22 - frame.floors[1]) < 0.3) continue;
        const lx = k % 2 ? 0.62 : 0.36, lz = k % 2 ? 0.36 : 0.62;
        sink.quoin('stone', cx - sx * lx, y, cz - sz * lz, cx + sx * 0.035, y + 0.44, cz + sz * 0.035, sx, sz, { decor: true, shade: 0.94 });
      }
    }
    const f = frame.faces.front, fy = frame.floors[0];
    // the door's rusticated surround: its jambs' blocks long and short, the flat arch's voussoirs fanned about the keystone
    for (const s of [-1, 1]) {
      for (let k = 0; k < 5; k++) {
        const bw = k % 2 ? 0.3 : 0.46;
        faceBox(sink, 'stone', f, s * (0.9 + 0.2 + bw / 2), fy + 0.26 + k * 0.52, 0.04, bw, 0.48, 0.08, { decor: true, shade: k % 2 ? 0.92 : 0.98 });
      }
    }
    for (let k = -3; k <= 3; k++) {
      const tw = k === 0 ? 0.34 : 0.3, u = k * 0.36, rise = k === 0 ? 0.1 : 0;
      sink.member('stone', facePoint(f, u * 0.96, fy + 2.62 + 0.2, 0), facePoint(f, u * 1.12, fy + 2.62 + 0.72 + rise, 0), tw, k === 0 ? 0.12 : 0.08, f.out,
        { decor: true, shade: k === 0 ? 0.88 : 0.96 }, 0);
    }
    // the canopy over the door on two piers, the inscription band over it; the piers stand at the canopy's lip, their
    // outer faces within half a metre of the plot's front (the base's reach, regionalArchitecture's footprint coverage)
    for (const s of [-1, 1]) faceBox(sink, 'plaster3', f, s * 1.45, 1.5, 1.45, 0.35, 3.0, 0.35, {});
    faceBox(sink, 'plaster3', f, 0, 3.05, 0.85, 3.6, 0.22, 1.7, { decor: true, shadow: true });
    faceBox(sink, 'plaster3', f, 0, frame.floors[1] + 0.05 + 0.6, 0.015, 4.2, 0.5, 0.03, { decor: true });
    faceBox(sink, 'dark', f, 0, frame.floors[1] + 0.05 + 0.6, 0.03, 3.6, 0.16, 0.01, { decor: true });
    // the flag mast on its iron bracket over the canopy
    faceBox(sink, 'structureMetal', f, 1.9, frame.floors[1] + 1.4, 0.35, 0.05, 0.05, 0.7, { colour: IRON, decor: true });
    sink.member('structureMetal', facePoint(f, 1.9, frame.floors[1] + 0.9, 0.12), facePoint(f, 1.9, frame.floors[1] + 4.2, 1.5), 0.06, 0.06, f.out,
      { colour: shade(TIN, 0.8), decor: true, exposed: true }, 0);
    // ---- the sentry box (garitta; dome-detail-275) by the door, between two windows: boarded walls on a stone step,
    // open to the front, its walls striped in the army's diagonal bands, under a little pyramid of sheet
    {
      const fw = openings.filter((o) => o.face === 'front' && o.storey === 0 && o.kind === 'window' && o.u < 0).map((o) => o.u).sort((p, q) => q - p);
      const u = fw.length > 1 ? (fw[0] + fw[1]) / 2 : -3.2, o = 1.05, gw = 0.95, gh = 2.2;
      const paint: Rgb = rgb(0x5f6a66), band: Rgb = rgb(0xd8d4c8), c = { colour: paint, decor: true } as const;
      faceBox(sink, 'stone', f, u, 0.04, o, gw + 0.14, 0.2, gw + 0.14, { decor: true, shade: 0.86 });
      faceBox(sink, 'structureWood', f, u, 0.14 + gh / 2, o - gw / 2 + 0.03, gw, gh, 0.06, c);
      for (const s of [-1, 1]) {
        faceBox(sink, 'structureWood', f, u + s * (gw / 2 - 0.03), 0.14 + gh / 2, o, 0.06, gh, gw - 0.06, c);
        faceBox(sink, 'structureWood', f, u + s * (gw / 2 - 0.12), 0.14 + gh / 2, o + gw / 2 - 0.03, 0.24, gh, 0.06, c);
        // the side's diagonal bands, light on the grey-green
        for (let k = 0; k < 3; k++) {
          const y = 0.55 + k * 0.62;
          sink.member('structureWood', facePoint(f, u + s * (gw / 2 + 0.002), y, o - gw / 2 + 0.06), facePoint(f, u + s * (gw / 2 + 0.002), y + 0.5, o + gw / 2 - 0.06), 0.14, 0.006,
            [s, 0, 0], { colour: band, decor: true }, 0);
        }
      }
      faceBox(sink, 'structureWood', f, u, 0.14 + gh - 0.17, o + gw / 2 - 0.03, gw, 0.34, 0.06, c);
      const p = facePoint(f, u, 0, o), cap: RoofSpec = { kind: 'hip', pitchDeg: 30, eave: 0.12, verge: 0.12, thickness: 0.06, bucket: 'structureMetal', ridge: null };
      sink.placed(0, p[0], 0, p[2], () => emitRoof(sink, roofGeometry(gw, gw, 0.14 + gh, { ...cap, decor: true }), { ...cap, decor: true }, shade(paint, 0.8)));
    }
  });
  return sink.finish();
};

/**
 * The long barn (the base depot's plot): the stone byre below with its doors and slit windows, the hayloft above
 * boarded in larch, the earth ramp walled in rubble up to the hayloft's cart door on the long side, a lauze roof.
 * (dome-detail-275: "a plank upper storey on a plaster base with a ramp; the roof a smooth slab, the long walls blank")
 * The Maurienne grange as it stands at Bessans and Bonneval: the lauzes' thick slabs at the eaves, rakes and ridge on
 * their rafters; the hayloft's larch frame on the byre's wall head — sill, posts, plate and knee braces — its boards set
 * apart for the air; the byre's rough quoins, the heavy larch lintels over its doors and slab lintels over its vents;
 * the ramp's rubble parapet, its trodden earth and wheel ruts, the plank bridge on the landing to the cart door; the
 * dung heap by the byre door and the bachal, the hewn trough, by the gable's gate.
 */
const grangeLongue: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx);
  const look = ctx.variant;
  const bb = ctx.bounds;
  const W = clamp(bb.maxX - bb.minX - 3.9, 6.0, 8.0), D = clamp(bb.maxZ - bb.minZ - 1.1, 13, 21);
  const cx = bb.minX + 0.6 + W / 2;
  // the hayloft's cart door near the -z end of the right face (face u runs to -z: the door's u is -zd)
  const zd = -D * 0.25;
  const openings: Opening[] = [
    { face: 'front', storey: 0, kind: 'gate', u: 0, w: 2.2, y0: 0, h: 2.3 },
    { face: 'right', storey: 1, kind: 'gate', u: -zd, w: 2.6, y0: 0, h: 2.4 },
  ];
  for (const o of windowRhythm('left', 0, D, { w: 0.35, h: 0.6, sill: 1.3, spacing: 2.2, margin: 1.4, kind: 'loft' })) openings.push(o);
  for (const o of windowRhythm('right', 0, D, { w: 1.0, h: 1.85, sill: 0, spacing: 4.2, margin: 1.6, kind: 'door' })) {
    if (Math.abs(-o.u - zd) > 2.2 && -o.u < zd + 1.5) openings.push(o);
  }
  openings.push({ face: 'back', storey: 1, kind: 'loft', u: 0, w: 1.2, y0: 1.4, h: 0.6 });
  sink.placed(0, cx, 0, 0, () => {
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: null, storeys: [{ h: 2.7, wall: 'stone' }, { h: 2.6, wall: 'wood' }],
      // (dome-detail-275) the rafters' feet under the deep eaves
      roof: lauze(22, 0.6, 0.55), gableBucket: 'wood', openings, chimneys: [], gutters: null, verge: null, reveal: 0.4, spall: null, rafters: LARCH_DARK,
    }, dialect({ ...st, litShare: 0.05 }));
    purlins(sink, frame, LARCH_DARK);
    lauzeEdges(sink, frame, look);
    if (ctx.snowCap) drifts(sink, frame, openings, look);
    const F = frame.faces, floorY = frame.floors[1];
    // the hayloft's frame and its boards' air gaps; the byre's corners (dome-detail-275)
    hayloftFrame(sink, frame, 1, openings, look);
    roughQuoins(sink, frame.bodies[0], 0.05, floorY - 0.05, look);
    // the byre's lintels: a larch beam over each door and the gate, a split slab over each vent (dome-detail-275)
    for (const o of openings.filter((q) => q.storey === 0)) {
      const f = F[o.face];
      if (o.kind === 'loft') faceBox(sink, 'stone', f, o.u, o.y0 + o.h + 0.1, 0.05, o.w + 0.5, 0.16, 0.1, { decor: true, shade: 0.86 });
      else faceBox(sink, 'structureWood', f, o.u, o.y0 + o.h + (o.kind === 'gate' ? 0.36 : 0.32), 0.06, o.w + 0.8, 0.24, 0.12, { colour: shade(LARCH_DARK, 0.9), decor: true });
    }
    // the landing before the hayloft door and the earth ramp down to the lane, both walled in rubble
    const reach = 3.2, run = clamp(D / 2 - zd - 1.9, 4, 8.5), top = floorY - 0.05, xo = W / 2 + reach;
    sink.span('stone', W / 2 - 0.02, -0.4, zd - 1.5, xo, top, zd + 1.5);
    const zc = zd + 1.5 + run / 2, zEnd = zd + 1.5 + run;
    const ramp: Face = { origin: [xo, 0, zc], u: [0, 0, -1], out: [1, 0, 0], width: run };
    wallPolygon(sink, 'stone', ramp, [[-run / 2, -0.4], [run / 2, -0.4], [run / 2, top], [-run / 2, 0.1]], reach + 0.02);
    // (dome-detail-275) the ramp's rubble parapet along its open side and round the landing, its top following the slope
    const rise = (z: number) => top + (0.1 - top) * (z - (zd + 1.5)) / run;
    wallPolygon(sink, 'stone', ramp, [[-run / 2, 0.1], [run / 2, top], [run / 2, top + 0.48], [-run / 2, 0.52]], 0.36, { decor: true, shade: 0.92 });
    sink.span('stone', xo - 0.36, top, zd - 1.5, xo, top + 0.48, zd + 1.5, { decor: true, shade: 0.92 });
    sink.span('stone', W / 2 + 1.7, top, zd - 1.5, xo - 0.36, top + 0.48, zd - 1.14, { decor: true, shade: 0.92 });
    // the trodden earth up the ramp and its two wheel ruts, a hand proud of its stone
    const earth: Rgb = [0.34, 0.29, 0.22], rut: Rgb = [0.22, 0.19, 0.15];
    const lane = (x0: number, x1: number, lift: number, colour: Rgb) => facing(sink, 'structureWood',
      [[x0, rise(zd + 1.5) + lift, zd + 1.5], [x1, rise(zd + 1.5) + lift, zd + 1.5], [x1, rise(zEnd - 0.1) + lift, zEnd - 0.1], [x0, rise(zEnd - 0.1) + lift, zEnd - 0.1]],
      [0, 1, 0], { colour, decor: true });
    lane(W / 2 + 0.2, xo - 0.4, 0.015, earth);
    for (const s of [-1, 1]) lane(W / 2 + reach / 2 - 0.2 + s * 0.72 - 0.11, W / 2 + reach / 2 - 0.2 + s * 0.72 + 0.11, 0.025, rut);
    // the plank bridge (pont de grange) over the landing to the cart door, its boards laid across the way
    for (let z = zd - 1.32; z < zd + 1.3;) {
      const bw = 0.22 + look() * 0.06;
      sink.span('structureWood', W / 2 - 0.02, top, z, W / 2 + 1.65 + look() * 0.12, top + 0.06, z + bw - 0.015, { colour: shade(LARCH, 0.78 + look() * 0.25), decor: true });
      z += bw;
    }
    // the dung heap by the byre door, the bachal by the gable's gate (dome-detail-275)
    const byre = openings.find((o) => o.face === 'right' && o.storey === 0 && o.kind === 'door');
    if (byre) {
      const p = facePoint(F.right, byre.u + 1.35, 0, 0.95);
      mound(sink, [p[0], -0.15, p[2]], [0, 0, 1], [1, 0, 0], 1.0, 0.75, 0.75 + look() * 0.2, [0.27, 0.21, 0.15], { decor: true }, look() * 3, 8);
    }
    bachal(sink, F.front, W / 2 - 1.15, 1.7, look);
    faceBox(sink, 'stone', F.front, 0, -0.1, 0.42, 3.0, 0.26, 0.84, { decor: true, shade: 0.9 });
  });
  return sink.finish();
};

/**
 * A house shelled in April 1945: the rubble shell standing to broken heads, charred beams fallen in, its lauzes heaped.
 * (Round 2, gauntlet wave 109b: "the saw-tooth zigzag ruin reads as a cardboard stage flat ... it needs rubble heaps,
 * fallen lauze, charred larch and an interior".) The walls break course by course — level steps with a ragged breach,
 * not a sloped zigzag — over a slumped heap of their own rubble inside and out; the floor of the room and its hearth
 * on the gable wall show through, the lauzes lie fallen and slid against the walls, and the larch frame lies charred
 * across the heaps, a rafter or two still leaning from a wall head.
 */
const ruine: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant;
  const fit = wallsIn(ctx, 0.05, 0.05);
  const W = clamp(fit.w, 5.0, 7.6), D = clamp(fit.d, 6.0, 9.6);
  const char = rgb(0x2a2420), charred = rgb(0x3b3029);
  sink.placed(0, fit.cx, 0, fit.cz, () => {
    const t = 0.55, H1 = 4.6;
    const faces: Array<{ face: Face; gable: boolean }> = [
      { face: { origin: [0, 0, D / 2], u: [1, 0, 0], out: [0, 0, 1], width: W }, gable: true },
      { face: { origin: [0, 0, -D / 2], u: [-1, 0, 0], out: [0, 0, -1], width: W }, gable: true },
      { face: { origin: [W / 2, 0, 0], u: [0, 0, -1], out: [1, 0, 0], width: D - 2 * t }, gable: false },
      { face: { origin: [-W / 2, 0, 0], u: [0, 0, 1], out: [-1, 0, 0], width: D - 2 * t }, gable: false },
    ];
    const heads: number[] = [];
    const walls: Array<{ face: Face; tops: number[] }> = [];
    for (const { face, gable } of faces) {
      // (round 3, gauntlet wave 127: "crenellated stepped cuts ... a toy brick wall"): the heads fall from the corners,
      // where the quoins stand longest, to the breach the shell made, never up and down again like battlements; a wall
      // the shell missed only sags. The broken head is ragged and sloping — its height taken at the ends of n strips and
      // jittered by half a metre — not cut in level courses (level steps under their snow read as merlons in pair10)
      const L = face.width, n = 9;
      const tops: number[] = [];
      const crown = Math.min(H1 * (0.7 + rng() * 0.3) + (gable ? W * 0.1 : 0), H1 + (gable ? W * 0.12 : 0));
      const dip = 0.22 + rng() * 0.6, at = 1 + rng() * (n - 2);
      for (let k = 0; k <= n; k++) {
        const d = Math.min(1, Math.abs(k - at) / Math.max(at, n - at));
        const h = crown * (dip + (1 - dip) * Math.pow(d, 0.85)) + (rng() - 0.5) * 0.5;
        tops.push(Math.max(0.64, h));
      }
      walls.push({ face, tops });
      for (let k = 0; k < n; k++) {
        const a = -L / 2 + L * k / n, b = -L / 2 + L * (k + 1) / n;
        wallPolygon(sink, 'stone', face, [[a, -0.3], [b, -0.3], [b, tops[k + 1]], [a, tops[k]]], t);
        // the head's broken stones: a few blocks proud of the break
        if (look() < 0.4) faceBox(sink, 'stone', face, a + (b - a) * (0.25 + look() * 0.5), Math.min(tops[k], tops[k + 1]) + 0.05, -t / 2, 0.3 + look() * 0.3, 0.18, t * 0.8, { decor: true });
      }
      heads.push(Math.max(...tops));
    }
    // the room's floor (beaten earth and the charred boards) and the hearth on the back gable
    sink.span('structureWood', -W / 2 + t, -0.05, -D / 2 + t, W / 2 - t, 0.06, D / 2 - t, { colour: char, decor: true });
    // (on the back gable's inner face, looking into the room: placed off the outer face, its room side was the face a
    // wall-mounted box leaves out, open to a breach)
    const hearthWall: Face = { origin: [0, 0, -D / 2 + t], u: [1, 0, 0], out: [0, 0, 1], width: W - 2 * t };
    // (props census #7, lane B 2026-10-14: the firebox was a dark plate on the hearth's face) the hearth's back against
    // the wall, its front cut by the firebox through its depth, the soot-dark back of the box behind
    faceBox(sink, 'stone', hearthWall, -0.6, 0.9, 0.075, 1.5, 1.8, 0.15, { decor: true });
    const hearthFront: Face = { origin: facePoint(hearthWall, -0.6, 0, 0.6), u: hearthWall.u, out: hearthWall.out, width: 1.5 };
    holedPolygon(sink, 'stone', hearthFront, [[-0.75, 0], [0.75, 0], [0.75, 1.8], [-0.75, 1.8]], [{ u0: -0.45, u1: 0.45, y0: 0.1, y1: 1.0 }], 0.45, 0.4, { decor: true });
    // the rubble: a slumped heap inside, heaps along the walls' feet outside where their heads fell
    const heaps: Array<[number, number, number, number]> = [];
    const heap = (x: number, z: number, r: number, hgt: number) => {
      heaps.push([x, z, r, hgt]);
      sink.cylinder('stone', [x, -0.25, z], 'y', hgt + 0.25, r, 7, { decor: true, shadow: true }, r * 0.28, true, look() * 3);
    };
    heap(-W * 0.12, D * 0.08, Math.min(W, D) * 0.3, 1.1 + look() * 0.4);
    heap(W * 0.18, -D * 0.22, Math.min(W, D) * 0.2, 0.7 + look() * 0.3);
    for (const { face } of faces) {
      if (look() < 0.45) continue;
      const p = facePoint(face, (look() - 0.5) * face.width * 0.6, 0, 0.9);
      heap(p[0], p[2], 0.9 + look() * 0.6, 0.45 + look() * 0.35);
    }
    // (the buildings stream, 2026-10-12, the integrity check: the slabs and beams hung at drawn heights over the bare
    // floor) what lies here rests on what is under it: the floor's boards, or a heap's slope
    const restOn = (x: number, z: number): number => {
      let y = 0.06;
      for (const [hx, hz, r, hgt] of heaps) {
        const rho = Math.hypot(x - hx, z - hz), top = r * 0.28;
        if (rho < r) y = Math.max(y, rho <= top ? hgt : -0.25 + (hgt + 0.25) * (r - rho) / (r - top));
      }
      return y;
    };
    // the lauzes fallen: slabs slid against the walls and lying on the heaps
    for (let k = 0; k < 7; k++) {
      const x = (look() - 0.5) * (W - 1.6), z = (look() - 0.5) * (D - 1.6); look();
      const lw = 0.7 + look() * 0.5, ld = 0.5 + look() * 0.4, tilt = 0.25 + look() * 0.6, th = look() * 6.28;
      // its low edge on the floor or the heap there, its high edge raised by its tilt
      const y = restOn(x, z) + (ld / 2) * Math.sin(tilt) + 0.05 * Math.cos(tilt) - 0.03;
      // the slab's frame: along a heading, tipped about it (ax, ay and az orthonormal)
      const c = Math.cos(th), sn = Math.sin(th), ct = Math.cos(tilt), st = Math.sin(tilt);
      const frame = new LocalFrame([c, 0, sn], [-sn * st, ct, c * st], [-sn * ct, -st, c * ct], [x, y, z]);
      sink.box('roof', [x, y, z], [lw / 2, 0.05, ld / 2], { decor: true, shadow: true }, frame);
    }
    // the larch frame burnt: beams across the heaps, a rafter or two leaning from a wall head
    for (let k = 0; k < 6; k++) {
      const ax = (rng() - 0.5) * W * 0.8; rng(); const az = (rng() - 0.5) * D * 0.7;
      const bx = ax + (rng() - 0.5) * 3.2; rng(); const bz = az + (rng() - 0.5) * 3.2;
      // each end on the floor or a heap (the member stands on its line, 2 cm into what bears it)
      const a: Vec3 = [ax, restOn(ax, az) + 0.02, az], b: Vec3 = [bx, restOn(bx, bz) + 0.02, bz];
      sink.member('structureWood', a, b, 0.2, 0.2, [0, 1, 0], { colour: k % 2 ? char : charred, decor: true, exposed: true });
    }
    for (const sx of [-1, 1]) {
      if (look() < 0.35) continue;
      const top: Vec3 = [sx * (W / 2 - t / 2), heads[sx > 0 ? 2 : 3] - 0.2, (look() - 0.5) * D * 0.4];
      const foot: Vec3 = [sx * (W / 2 - 1.9), 0.2, top[2] + (look() - 0.5) * 1.2];
      sink.member('structureWood', foot, top, 0.16, 0.18, [0, 1, 0], { colour: char, decor: true, exposed: true });
    }
    // (round 3, gauntlet wave 127: "no rubble ... no snow on its wall heads"; the heaps alone read as snow mounds) the
    // wall's own stones out on every heap, tipped every way, their faces too steep to hold the snow; and April's snow
    // lying along every broken head, a ridged cap past both faces of the wall
    for (const [hx, hz, r, hgt] of heaps) {
      const count = Math.round(4 + r * 4);
      for (let k = 0; k < count; k++) {
        const a = look() * Math.PI * 2, rho = r * (0.25 + look() * 0.75), s = 0.13 + look() * 0.17;
        const x = hx + Math.cos(a) * rho, z = hz + Math.sin(a) * rho;
        const y = -0.25 + (hgt + 0.25) * (1 - rho / r) * 0.85 + s * 0.3;
        const th = look() * 6.28, tilt = look() * 0.9, c = Math.cos(th), sn = Math.sin(th), ct = Math.cos(tilt), st = Math.sin(tilt);
        const frame = new LocalFrame([c, 0, sn], [-sn * st, ct, c * st], [-sn * ct, -st, c * ct], [x, y, z]);
        sink.box('stone', [x, y, z], [s * (1 + look() * 0.6), s * (0.55 + look() * 0.35), s * (0.7 + look() * 0.5)], { decor: true }, frame);
      }
    }
    if (ctx.snowCap) {
      for (const { face, tops } of walls) {
        const L = face.width, n = tops.length - 1;
        // one ridge the length of the wall following its broken head, its foot a hand past each face, closed at the ends
        // (a hip inset on a steep end strip turned its slope's normal into the wall: regionalArchitecture's inverted faces)
        const depth = tops.map(() => 0.12 + look() * 0.1);
        const opts = { decor: true } as const;
        for (let k = 0; k < n; k++) {
          const a = -L / 2 + L * k / n, b = -L / 2 + L * (k + 1) / n, ya = tops[k], yb = tops[k + 1];
          const fa = facePoint(face, a, ya, 0.05), fb = facePoint(face, b, yb, 0.05);
          const ba = facePoint(face, a, ya, -t - 0.05), bb = facePoint(face, b, yb, -t - 0.05);
          const ra = facePoint(face, a, ya + depth[k], -t / 2), rb = facePoint(face, b, yb + depth[k + 1], -t / 2);
          sink.polygon('plaster', [fa, fb, rb, ra], opts);
          sink.polygon('plaster', [bb, ba, ra, rb], opts);
          if (k === 0) sink.polygon('plaster', [ba, fa, ra], opts);
          if (k === n - 1) sink.polygon('plaster', [fb, bb, rb], opts);
        }
      }
    }
  });
  return sink.finish();
};

const SAVOYARD_BUILDERS: Readonly<Record<string, RegionalBuilder>> = Object.freeze({
  alpine: maison,
  logcabin: grange,
  granary: mazot,
  woodshed: (ctx) => bucher(ctx),
  // the yards' outbuilding: the woodshed opening into the yard
  yardshed: (ctx) => bucher(ctx, true),
  chapel: chapelle,
  onionchurch: eglise,
  tavern: hospice,
  // (round 4) the pass's hospice on its own planned plot (the warehouse's footprint)
  warehouse: hospiceGrand,
  rangerlodge: caserma,
  depot: grangeLongue,
  ruin: ruine,
  // (props census #5, lane B 2026-10-15) the Vallo Alpino blockhouse, rebuilt in fortKit.ts
  tower: (ctx) => valloBlockhaus(ctx),
});

/** the roughcast of the Maurienne: a grey-white lime, not a southern whitewash */
const crepi = (_h: number, s: number, l: number): readonly [number, number, number] => [0.1, Math.min(1, s * 0.08), Math.min(1, l * 1.08 + 0.08)];

export const SAVOYARD_STYLE: ArchitectureStyle = Object.freeze<ArchitectureStyle>({
  id: 'savoyard',
  region: 'Haute-Maurienne and the Col du Mont-Cenis (Savoie), 1945: gneiss rubble under lauze roofs, larch galleries and mazots, the Vallo Alpino blockhouses',
  surfaces: {
    // lauzes: thick split slabs of the valley's schist and gneiss, grey with a brown cast
    // (round 2, wave 109b: "thin beige roofs") the schist's blue-grey
    roof: { kind: 'slate', tint: [0.38, 0.39, 0.41] },
    // the grey gneiss rubble bedded in lime
    // (round 2, wave 109b: "one warm tan texture on every box") grey gneiss rubble in a dark lime mortar
    // (round 3, wave 127: the shelled house still "a clean tan, regularly brick-tiled wall"): the stones laid as rubble,
    // split and pillowed in uneven courses, not as coursed greywacke; a cool blue-grey under the low April sun
    // (round 4, wave 188: the ruin and a house base still "a regular tiling tan ashlar with pale joints" — the rubble
    // recipe's warm lime mortar grid): the gneiss kind, flat foliated slabs in dark raked joints, a mid grey
    stone: { kind: 'gneiss', tint: [0.5, 0.51, 0.54] },
    sourced: { plaster: false, wood: true },
    // (round 4, wave 188: the barracks' "coarse sponge-noise render"): the roughcast and the render finer and shallower
    // than the shared tile
    relief: { plasterUv: 1.6, normal: 0.4, ao: 0.5 },
    tones: {
      plaster: crepi,
      // the frontier guard's ochre
      // (round 2, wave 109b: "saturated mustard reads plastic") a lime ochre, sun-faded
      // (round 4, wave 188: still "a saturated mustard box with coarse sponge-noise render"): a faded lime render, the
      // ochre washed to a pale chalky buff and its light and dark pressed together (the render's noise half as strong)
      plaster2: (_h, s, l) => [0.11, Math.min(1, 0.1 + s * 0.12), Math.min(1, l * 0.62 + 0.3)],
      // the Vallo Alpino's concrete
      plaster3: (_h, s, l) => [0.11, Math.min(1, 0.04 + s * 0.1), Math.min(1, l * 0.72 + 0.1)],
      // larch weathered silver-brown
      wood: (h, s, l) => [h, Math.min(1, s * 0.75), Math.min(1, l * 0.82)],
    },
  },
  builders: SAVOYARD_BUILDERS,
  // the long winters: damp at the wall foot, lichen on the lauzes
  weather: {
    // (round 4, wave 188: "facades showroom-fresh, with no grime"): a third of the renders and the stones smoke- and
    // weather-grimed, a shade or two down (one pick a building, as before: the stream draws the same)
    plaster: [[1, 1, 1], [0.97, 0.96, 0.94], [0.94, 0.94, 0.93], [1.0, 0.98, 0.95], [0.88, 0.86, 0.82], [0.91, 0.9, 0.87]],
    // (round 3) the stone's weathering cool: the gneiss greys and blues, never the warm sandstone's buffs
    stone: [[1, 1, 1], [0.92, 0.94, 0.97], [0.97, 0.98, 1.0], [0.86, 0.88, 0.91], [0.8, 0.82, 0.84], [0.84, 0.85, 0.87]],
    roof: [[1, 1, 1], [0.9, 0.88, 0.84], [1.06, 1.03, 0.98], [0.84, 0.83, 0.82]],
    // (round 4, wave 188: "showroom-fresh, no grime"): the wall foot's splash and rising damp near full
    mossTint: [0.96, 0.94, 0.8],
  },
  // the yards: a fence of split larch round the woodshed (no kitchen garden under the April snow)
  yard: { kinds: ['alpine', 'logcabin'], fence: 'fenceplank', gate: 'gate', shed: 'yardshed', shedSize: [3.6, 3.0], garden: false },
});
