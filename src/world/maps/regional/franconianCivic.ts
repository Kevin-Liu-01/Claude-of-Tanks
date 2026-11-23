// src/world/maps/regional/franconianCivic.ts — the Franconian kit's civic and working buildings (the looks lane,
// 2026-10-13): the four of Steinburg's building types the kit never covered, which the generic builders drew as brick
// boxes from another game beside the town (LOOKS-BRIEF item 3; the Verdant standard: the kit builds every planned type).
//
// Region (FRANCONIAN_STYLE.region): Upper Franconia and Saxony (Kronach, Meissen, Pappenheim), in the kit's surfaces —
// its dressed sandstone, its lime render, its beavertail tiles, its oxblood framing:
//   - mauerturm  the wall tower (Kronach's and Rothenburg's Mauertürme): a square shaft of coursed sandstone on a battered
//                plinth, dressed quoins, putlog holes, keyhole gun loops (Schlüsselscharten), a door at the wall walk's
//                height, a jettied framed hoarding storey (or the stone carried up) under a steep hipped tile roof with
//                its finial;
//   - kapelle    the sandstone chapel (a Burgkapelle, a Wegkapelle): an ashlar nave on its plinth, stepped buttresses,
//                tall round-headed windows in dressed surrounds, an arched west door, a steep tiled roof with a hipped
//                choir end, a slated ridge turret (Dachreiter) with its bell openings and spire;
//   - feuerwache the town's fire station (a Feuerwehrhaus of about 1900): a sandstone ground storey with two arched engine
//                doors, a rendered upper storey with sandstone string course, quoins and window hoods, a half-hipped roof
//                with dormers, and the hose-drying tower (Schlauchturm) with its louvred top stage, its clock and a
//                pyramid roof;
//   - stadtkirche the town church (the maps lane, 2026-10-15): a sandstone hall nave between buttresses under its steep
//                tiled roof, and the west tower of five stages with its clock, bell chamber, corner turrets and spire;
//   - bergfried  the castle keep (the maps lane, 2026-10-15): a five-stage sandstone shaft, the high door on its landing,
//                the corbel course under a steep hipped cap of tiles;
//   - palas      the castle's palace range: a sandstone ground storey under two rendered ones, a half-hipped roof, the
//                octagonal stair tower in its court front;
//   - fabrik     the works (a Spinnerei or a Ziegelei by the valley road): a long two-storey sandstone hall, pilaster
//                strips between tall segment-headed windows, a gable front with its round window, a roof lantern along
//                the ridge, a lower engine house with its tall arched window and the round chimney on its square base.
//
// Every body is a buildHouse body, so the kit's damage plan describes it (damage.ts describeHouse: holes cut its own
// courses, the collapse falls into its own rubble); dressing is decor. Each builder keeps to its plot (the base
// builder's footprint) and draws only from its own streams.
import { PartSink, faceBox, facePoint, rgb, shade, type EmitOptions, type Face, type RegionalBucket, type RegionalParts, type Rgb, type Vec3 } from './geometry.ts';
import {
  buildHouse, emitRoof, roofGeometry, storeyFaces, type FaceName, type HouseDialect, type HouseSpec, type Opening, type RoofGeometry, type RoofPatch,
  type RoofSpec,
} from './house.ts';
import { dressedQuoin, facadeOn, roofDormers, trimRun, windowHead } from './facade.ts';
import { doorUnit, windowUnit, type WindowStyle } from './openings.ts';
import { archGlazing, archHead } from './sarajevoParts.ts';
import { hessianDialect, houseUvOffset, stateFor } from './hessian.ts';
import type { RegionalBuildContext, RegionalBuilder } from './types.ts';

const SW: RegionalBucket = 'structureWood';
const DECOR = { decor: true } as const;
const IRON = rgb(0x2a2b2c), SLATE = rgb(0x4a4f55), ENGINE = rgb(0x6a2a24), ZINC = rgb(0x8c9193), CLOCK = rgb(0xd8d2c2), GILT = rgb(0xc8a04a);

/**
 * Quoins up every corner of a body from y0 to y1: long and short dressed stones by turns (34 cm courses; a civic front's
 * `course` taller, its stones larger: dome-detail-275).
 */
function quoins(sink: PartSink, x0: number, x1: number, z0: number, z1: number, y0: number, y1: number, course = 0.35,
  keep: (sx: number, sz: number) => boolean = () => true): void {
  const big = course / 0.35;
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]] as const) {
    if (!keep(sx, sz)) continue;
    const x = sx > 0 ? x1 : x0, z = sz > 0 ? z1 : z0;
    for (let y = y0, k = 0; y + course - 0.02 <= y1 + 0.01; y += course, k++) {
      const lx = (k % 2 ? 0.3 : 0.52) * big, lz = (k % 2 ? 0.52 : 0.3) * big;
      dressedQuoin(sink, 'stone', sx > 0 ? x - lx : x - 0.035, y, sz > 0 ? z - lz : z - 0.035, sx > 0 ? x + 0.035 : x + lx, y + course - 0.02,
        sz > 0 ? z + 0.035 : z + lz, sx, sz, DECOR);
    }
  }
}

/**
 * A keyhole gun loop (Schlüsselscharte) on a face from y up h: the dressed block standing a hand proud of the wall with
 * the keyhole cut into it, the slit and its round sighting hole at the foot, their dark at the back of the cut (the r2
 * sweep, 2026-10-16: the slit and the hole were dark plates on the block's face; a loop is a hand's breadth, never a
 * hole through the shaft, so the block carries its depth).
 */
function gunLoop(sink: PartSink, face: Face, u: number, y: number, h: number): void {
  const B = 0.17, sl = 0.035, ft = 0.1, fh = 0.2, blk = { ...DECOR, tint: [1.04, 1.02, 0.98] as Rgb };
  const piece = (a: number, b: number, y0: number, y1: number) => { if (b - a > 0.005 && y1 - y0 > 0.005) faceBox(sink, 'stone', face, u + (a + b) / 2, (y0 + y1) / 2, B / 2, b - a, y1 - y0, B, blk); };
  piece(-0.23, 0.23, y - 0.12, y);
  piece(-0.23, 0.23, y + h, y + h + 0.12);
  piece(-0.23, -ft, y, y + fh); piece(ft, 0.23, y, y + fh);
  piece(-0.23, -sl, y + fh, y + h); piece(sl, 0.23, y + fh, y + h);
  faceBox(sink, 'dark', face, u, y + fh + (h - fh) / 2, 0.025, 2 * sl, h - fh, 0.01, DECOR);
  faceBox(sink, 'dark', face, u, y + fh / 2, 0.025, 2 * ft, fh, 0.01, DECOR);
}

/**
 * The putlog holes the scaffold left: small dark squares in rows up a face, each row on the face of the storey it
 * stands in (a storey set back from the one under it: the 225 integrity ledger found a row floating off the shaft).
 */
function putlogs(sink: PartSink, faceAt: (y: number) => Face, y0: number, y1: number, rows: number, rng: () => number,
  open: (u: number, y: number) => boolean = () => false): void {
  for (let r = 0; r < rows; r++) {
    const y = y0 + (r + 0.5) * (y1 - y0) / rows, face = faceAt(y), half = face.width / 2 - 0.45;
    for (let u = -half; u <= half + 1e-6; u += Math.max(0.9, (2 * half) / 3)) {
      if (rng() < 0.25) continue;
      const uu = u + (rng() - 0.5) * 0.12;
      // (the 225 integrity ledger: a hole fell in the wall walk's doorway, 16 cm off any wall; none in an opening)
      if (open(uu, y)) continue;
      // (the r2 sweep, 2026-10-16: a dark square on the ashlar) the stub of the scaffold's putlog sawn off in its hole
      faceBox(sink, SW, face, uu, y, 0.06, 0.12, 0.12, 0.12, { colour: rgb(0x3e3328), decor: true });
    }
  }
}

/** A finial over a roof's apex: an iron spike and a vane. */
function finial(sink: PartSink, x: number, y: number, z: number, h = 1.2): void {
  sink.cylinder('dark', [x, y - 0.1, z], 'y', h, 0.035, 5, DECOR);
  sink.cylinder('dark', [x, y + h * 0.35, z], 'y', 0.16, 0.07, 6, DECOR);
  sink.span('dark', x - 0.015, y + h * 0.62, z, x + 0.015, y + h * 0.84, z + 0.34, DECOR);
}

// ---- (dome-detail-275) the beavertails in relief, the pointed lights, the yard's stone and iron ----

/** A planar polygon wound to face `toward` (dome-detail-275). */
function facing(sink: PartSink, bucket: RegionalBucket, pts: Vec3[], toward: Vec3, opts: EmitOptions): void {
  const u = [pts[1][0] - pts[0][0], pts[1][1] - pts[0][1], pts[1][2] - pts[0][2]], v = [pts[2][0] - pts[0][0], pts[2][1] - pts[0][1], pts[2][2] - pts[0][2]];
  const n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  sink.polygon(bucket, n[0] * toward[0] + n[1] * toward[1] + n[2] * toward[2] >= 0 ? pts : [...pts].reverse(), opts);
}

/** The beavertails' gauge up the slope as the eye reads it (m; dome-detail-275). */
const BIBER_GAUGE = 0.44;

/**
 * The beavertail tiles in relief (dome-detail-275; the work list: "plain walls under a smooth roof"; the roof bar: roofs
 * in courses, in relief), laid on a gable, half-hip or hip roof's covering in its roof frame (house.ts roofGeometry: the
 * ridge along z): on each slope every course's butt a finger proud, its tiles' face thinning back up to the course over
 * it, the course laid in runs a few metres long, each its own tone of the fired clay (the eave's courses darker with the
 * wet), the runs cut along the hips; on a hip's end slope the courses across it. Over the war's stripped patch
 * (house.ts HouseFrame.roofPatch) the runs stop short of it, ragged course to course, so the hole reads open. Dressing:
 * the slab keeps the collision. `clear` is how far either side of the ridge the courses stop (a ridge lantern's sills); a
 * big roof's courses `G` apart, the eye's gauge on a roof seen whole.
 */
function biberCourses(sink: PartSink, rg: RoofGeometry, roof: RoofSpec, look: () => number, patch: RoofPatch | null = null,
  run: readonly [number, number] = [3.5, 4], clear = 0.25, G = BIBER_GAUGE): void {
  if (rg.kind !== 'gable' && rg.kind !== 'halfhip' && rg.kind !== 'hip') return;
  const tanP = rg.tanP, cosP = 1 / Math.hypot(1, tanP), sinP = tanP * cosP;
  const xe = rg.s + roof.eave, top = rg.topAt(0, 0) ?? rg.ridgeTopY, hip = rg.kind !== 'gable';
  const D = rg.halfD + (rg.hipVerge ?? roof.verge);
  let hipTan = 0;
  if (hip) {
    const dz = Math.max(0.05, Math.min(0.5, (D - rg.ridgeHalf) / 2));
    hipTan = ((rg.topAt(0, rg.ridgeHalf) ?? top) - (rg.topAt(0, rg.ridgeHalf + dz) ?? top)) / dz;
  }
  const hipped = hip && hipTan > 1e-3;
  const lim = (ax: number): number => (hipped ? Math.min(D, rg.ridgeHalf + ax * tanP / hipTan) : D);
  // one run of a course: its butt from A0-A1 on the covering up `b` along the slope's normal, its face back down to the
  // covering at C0-C1, its two ends closed
  const lay = (A0: Vec3, A1: Vec3, C0: Vec3, C1: Vec3, n: Vec3, down: Vec3, along: Vec3, b: number, o: EmitOptions): void => {
    const B0: Vec3 = [A0[0] + n[0] * b, A0[1] + n[1] * b, A0[2] + n[2] * b], B1: Vec3 = [A1[0] + n[0] * b, A1[1] + n[1] * b, A1[2] + n[2] * b];
    facing(sink, 'roof', [A0, A1, B1, B0], down, o);
    facing(sink, 'roof', [B0, B1, C1, C0], n, o);
    facing(sink, 'roof', [A0, B0, C0], [-along[0], -along[1], -along[2]], o);
    facing(sink, 'roof', [A1, B1, C1], along, o);
  };
  // a course's runs from -L to L, less the stripped patch's reach (`hole`)
  const runs = (L: number, hole: readonly [number, number] | null): Array<[number, number]> => {
    const out: Array<[number, number]> = [];
    for (let t = -L; t < L - 0.15;) {
      const t1 = Math.min(L, t + run[0] + look() * run[1]);
      if (hole && hole[1] > t && hole[0] < t1) {
        if (hole[0] - t > 0.15) out.push([t, hole[0]]);
        if (t1 - hole[1] > 0.15) out.push([hole[1], t1]);
      } else out.push([t, t1]);
      t = t1;
    }
    return out;
  };
  for (const side of [1, -1] as const) {
    const n: Vec3 = [side * sinP, cosP, 0], down: Vec3 = [side * cosP, -sinP, 0];
    const at = (ax: number, z: number): Vec3 => [side * ax, top - ax * tanP, z];
    for (let k = 1; ; k++) {
      const ax = xe - k * G * cosP;
      if (ax < clear) break;
      const ax2 = Math.max(clear * 0.5, ax - 0.8 * G * cosP), L0 = lim(ax), L2 = lim(ax2);
      const hole = patch && patch.side === side && ax2 < patch.x1 + 0.05 && ax > patch.x0 - 0.05
        ? [patch.z0 - 0.04 - look() * 0.12, patch.z1 + 0.04 + look() * 0.12] as const : null;
      for (const [a0, a1] of runs(L0, hole)) {
        const c0 = Math.max(a0, -L2), c1 = Math.min(a1, L2);
        if (c1 - c0 < 0.04) continue;
        const o: EmitOptions = { decor: true, shade: (k <= 2 ? 0.72 : 0.84) + look() * 0.2 };
        lay(at(ax, a0), at(ax, a1), at(ax2, c0), at(ax2, c1), n, down, [0, 0, 1], 0.03 + look() * 0.015, o);
      }
    }
  }
  if (!hipped) return;
  // the hip ends' courses, across each end slope from its foot to the hips' meeting
  const cosH = 1 / Math.hypot(1, hipTan), sinH = hipTan * cosH, foot = D - rg.ridgeHalf;
  const xl = (dz: number): number => Math.min(xe, dz * hipTan / tanP);
  for (const end of [1, -1] as const) {
    const n: Vec3 = [0, cosH, end * sinH], down: Vec3 = [0, -sinH, end * cosH];
    const at = (dz: number, x: number): Vec3 => [x, top - dz * hipTan, end * (rg.ridgeHalf + dz)];
    for (let k = 1; ; k++) {
      const dz = foot - k * G * cosH;
      if (dz < clear) break;
      const dz2 = Math.max(clear * 0.5, dz - 0.8 * G * cosH), L0 = xl(dz), L2 = xl(dz2);
      for (const [a0, a1] of runs(L0, null)) {
        const c0 = Math.max(a0, -L2), c1 = Math.min(a1, L2);
        if (c1 - c0 < 0.04) continue;
        const o: EmitOptions = { decor: true, shade: (k <= 2 ? 0.72 : 0.84) + look() * 0.2 };
        lay(at(dz, a0), at(dz, a1), at(dz2, c0), at(dz2, c1), n, down, [1, 0, 0], 0.03 + look() * 0.015, o);
      }
    }
  }
}

/**
 * A pointed light of the hall church (dome-detail-275; the work list: "the nave walls are plain"): the unit with its
 * mullion in the rectangle the house cut, the pointed head made in the rectangle's top by the two dressed spandrels set
 * flush in the opening, the stone mullion and the Y of its tracery over it, the chamfered jambs and the ring of the
 * arch standing on the wall round the head, its sill. An equilateral arch: the head rises 0.87 of the light's width.
 */
function lancet(sink: PartSink, face: Face, o: Opening, y0: number, frame: Rgb, rng: () => number): void {
  const y = y0 + o.y0, w = o.w, apex = y + o.h, spring = apex - w * 0.866, ring = 0.2;
  windowUnit(sink, face, o.u, y, w, o.h, {
    frame, frameWidth: 0.05, frameOut: 0.03, bars: 'two', surround: null, sill: { bucket: 'stone', out: 0.14 }, shutters: null, head: null,
  }, rng, 0.1);
  // the left arc's points from its springing (a = 0) to the apex, centred on the right springing; mirrored for the right
  const arc = (side: -1 | 1, a: number, r: number, o2: number): Vec3 => facePoint(face, o.u + side * (r * Math.cos(a) - w / 2), spring + r * Math.sin(a), o2);
  const top = Math.PI / 3, outer = Math.acos(w / (2 * (w + ring)));
  for (const side of [-1, 1] as const) {
    // the spandrel: the opening's top corner closed down to the arc, flush in the wall
    facing(sink, 'stone', [facePoint(face, o.u + side * w / 2, apex, 0.004), arc(side, 0, w, 0.004), arc(side, top / 3, w, 0.004),
      arc(side, 2 * top / 3, w, 0.004), arc(side, top, w, 0.004)], face.out, { decor: true, shade: 0.92 });
    // the arch's ring on the wall, three voussoirs a side
    for (let j = 0; j < 3; j++) {
      facing(sink, 'stone', [arc(side, top * j / 3, w, 0.02), arc(side, top * (j + 1) / 3, w, 0.02), arc(side, outer * (j + 1) / 3, w + ring, 0.02),
        arc(side, outer * j / 3, w + ring, 0.02)], face.out, { decor: true, shade: j % 2 ? 0.9 : 0.98 });
    }
    // the jamb up to the springing
    faceBox(sink, 'stone', face, o.u + side * (w / 2 + ring / 2), (y + spring) / 2, 0.01, ring, spring - y, 0.02, { decor: true, fineSides: true });
  }
  // the mullion in the reveal and the Y of tracery it carries into the head
  const back = sink.recess > 0 ? -sink.recess + 0.12 : 0.04;
  faceBox(sink, 'stone', face, o.u, (y + spring) / 2, back, 0.11, spring - y, 0.1, DECOR);
  for (const side of [-1, 1] as const) {
    sink.member('stone', facePoint(face, o.u, spring - 0.02, back - 0.05), arc(side, Math.PI / 6, w - 0.02, back - 0.05), 0.08, 0.1, face.out, { decor: true, ends: true });
  }
}

/** A cast-iron wall anchor (Maueranker) on a face (dome-detail-275): the tie rod's plate, its S-bar across the joint. */
function anchor(sink: PartSink, face: Face, u: number, y: number, o = 0): void {
  faceBox(sink, 'structureMetal', face, u, y, o + 0.02, 0.07, 0.62, 0.04, { colour: IRON, decor: true });
  faceBox(sink, 'structureMetal', face, u, y, o + 0.05, 0.14, 0.14, 0.03, { colour: IRON, decor: true, fine: 'near' });
}


/**
 * The wall tower: plinth, three stages of coursed sandstone with loops and putlog holes, the wall-walk door, a
 * jettied framed hoarding (or the stone carried up), a steep hip of beavertail tiles with its finial.
 */
const mauerturm: RegionalBuilder = (ctx) => {
  const sink = new PartSink(houseUvOffset(ctx));
  const st = stateFor(ctx, ctx.rng);
  const rng = st.rng;
  // (the hip over a square or deep body: a body wider than deep is built turned, the roof's ends closed — bld-integrity)
  // (the body and its eaves inside the plot: the hoarding's jetty and the eaves 0.3 m round a 3.2 m shaft)
  const W = Math.max(2.8, Math.min(3.3, ctx.info.w - 0.7)), D = Math.max(W, Math.min(3.6, ctx.info.d - 0.7));
  const hoarding = ctx.variant() < 0.6;
  const sts: HouseSpec['storeys'] = [{ h: 3.0, wall: 'stone' }, { h: 2.9, wall: 'stone' }];
  if (hoarding) sts.push({ h: 2.2, wall: st.infill, framed: true, jetty: [0.28, 0.28, 0.28, 0.28] });
  else sts.push({ h: 2.4, wall: 'stone' });
  const openings: Opening[] = [];
  /** the loops (face, storey, u, y over the storey floor), drawn on the shaft after it is built */
  const loops: Array<[FaceName, number, number, number]> = [];
  for (const face of ['front', 'right', 'back', 'left'] as const) {
    const width = face === 'front' || face === 'back' ? W : D;
    loops.push([face, 0, (rng() - 0.5) * width * 0.3, 1.0]);
    if (face !== 'back') loops.push([face, 1, (rng() - 0.5) * width * 0.3, 0.9]);
    if (hoarding) openings.push({ face, storey: 2, kind: 'window', u: 0, w: 0.62, y0: 0.8, h: 0.75 });
    else loops.push([face, 2, 0, 0.7]);
  }
  // the wall walk's door on the back, at the first stage
  openings.push({ face: 'back', storey: 1, kind: 'door', u: 0, w: 0.95, y0: 0, h: 1.95 });
  const roof: RoofSpec = { kind: 'hip', pitchDeg: 62, eave: hoarding ? 0.12 : 0.3, verge: hoarding ? 0.12 : 0.3, thickness: 0.15, bucket: 'roof', ridge: 'round' };
  const frame = buildHouse(sink, {
    w: W, d: D, plinth: { h: 0.75, out: 0.14, bucket: 'stone' }, storeys: sts, roof,
    gableFramed: false, openings, chimneys: [], gutters: null, verge: null, reveal: 0.32,
    skirt: null,
  }, {
    ...hessianDialect({ ...st, window: { ...st.window, shutters: null }, litShare: 0.05 }),
    // the wall walk's door: a plank leaf in a dressed surround, no steps (the walk meets its sill)
    door: (s2, face, o, y0) => doorUnit(s2, face, o.u, y0 + o.y0, o.w, o.h, {
      leaf: st.door, frame: { bucket: 'stone', width: 0.24, out: 0.1, arch: true }, steps: null, leafKind: 'plank',
    }, y0),
  });
  for (const [face, i, u, y] of loops) gunLoop(sink, storeyFaces(frame, i)[face], u, frame.floors[i] + y, 0.95);
  const b0 = frame.bodies[0], stoneTop = frame.floors[hoarding ? 2 : 3] ?? frame.eaveY;
  quoins(sink, b0.x0, b0.x1, b0.z0, b0.z1, 0.75, stoneTop - 0.05);
  const storeyAt = (y: number): number => { let i = 0; while (i + 1 < frame.floors.length && frame.floors[i + 1] <= y) i++; return i; };
  const inOpening = (face: string) => (u: number, y: number): boolean => openings.some((o) => o.face === face
    && Math.abs(u - o.u) < o.w / 2 + 0.45 && y > frame.floors[o.storey] + o.y0 - 0.3 && y < frame.floors[o.storey] + o.y0 + o.h + 0.5);
  for (const face of ['front', 'right', 'back', 'left'] as const) putlogs(sink, (y) => storeyFaces(frame, storeyAt(y))[face], 1.6, stoneTop - 0.3, 3, rng, inOpening(face));
  // the string course where the hoarding sails out
  if (hoarding) {
    for (const face of ['front', 'right', 'back', 'left'] as const) {
      const f = storeyFaces(frame, 1)[face];
      trimRun(sink, 'stone', f, -f.width / 2, f.width / 2, stoneTop - 0.22, [{ h: 0.1, out: 0.06 }, { h: 0.12, out: 0.14 }], { ret: 0.2 });
    }
  }
  // the wall walk's landing at the door: a stone step of the walk's parapet height (dressing)
  const back = frame.faces.back;
  faceBox(sink, 'stone', back, 0, frame.floors[1] - 0.13, 0.35, 1.5, 0.26, 0.7, DECOR);
  finial(sink, 0, frame.roof.ridgeTopY + 0.05, 0, 1.3);
  return sink.finish();
};

/** Buttresses along a nave's flank: two offsets with weathered tops, `us` along the face. */
function buttresses(sink: PartSink, face: Face, us: readonly number[], h: number): void {
  for (const u of us) {
    // (faceBox's y is the box's centre) the lower offset from below ground, the upper, and the weathered top stone
    faceBox(sink, 'stone', face, u, h * 0.275 - 0.2, 0.25, 0.5, h * 0.55 + 0.4, 0.5, {});
    faceBox(sink, 'stone', face, u, h * 0.725, 0.17, 0.46, h * 0.35, 0.34, {});
    faceBox(sink, 'stone', face, u, h * 0.9 + 0.09, 0.09, 0.42, 0.18, 0.18, DECOR);
  }
}

/**
 * The sandstone chapel: the nave's ashlar on a plinth, buttresses, round-headed windows, the arched west door under a
 * dressed surround and a niche, the steep roof hipped over the choir end, the slated ridge turret.
 */
const kapelle: RegionalBuilder = (ctx) => {
  const sink = new PartSink(houseUvOffset(ctx));
  const st = stateFor(ctx, ctx.rng);
  // (the nave, its buttresses and eaves inside the plot)
  const W = Math.max(4.2, Math.min(4.8, ctx.info.w - 1.6)), D = Math.max(6.6, Math.min(7.6, ctx.info.d - 1.5));
  const wallH = 4.4;
  const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'door', u: 0, w: 1.25, y0: 0, h: 2.5 }];
  for (const face of ['right', 'left'] as const) for (const u of [-D * 0.22, D * 0.18]) openings.push({ face, storey: 0, kind: 'window', u, w: 0.78, y0: 1.75, h: 1.95 });
  openings.push({ face: 'back', storey: 0, kind: 'window', u: 0, w: 0.7, y0: 1.9, h: 1.7 });
  const roof: RoofSpec = { kind: 'halfhip', pitchDeg: 56, eave: 0.38, verge: 0.22, thickness: 0.17, bucket: 'roof', ridge: 'round', hipFrac: 0.45 };
  const frame = buildHouse(sink, {
    w: W, d: D, plinth: { h: 0.55, out: 0.1, bucket: 'stone' }, storeys: [{ h: wallH, wall: 'stone' }], roof,
    gableBucket: 'stone', openings, chimneys: [], gutters: { colour: ZINC }, verge: null, reveal: 0.38,
  }, {
    ...hessianDialect(st),
    window: (s, face, o, y0) => {
      windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, {
        frame: rgb(0x3b3a36), frameWidth: 0.05, frameOut: 0.03, bars: 'six',
        surround: { bucket: 'stone', width: 0.2, out: 0.08 }, sill: { bucket: 'stone', out: 0.14 }, shutters: null,
        head: { kind: 'segment', bucket: 'stone', h: 0.26, out: 0.09, ext: 0.08, rise: o.w * 0.5 },
      }, st.rng, 0.15);
    },
    door: (s, face, o, y0) => doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, {
      leaf: rgb(0x4a3020), frame: { bucket: 'stone', width: 0.3, out: 0.16, arch: true }, steps: { bucket: 'stone' }, leafKind: 'plank',
    }, y0),
  });
  const b0 = frame.bodies[0];
  quoins(sink, b0.x0, b0.x1, b0.z0, b0.z1, 0.55, wallH - 0.05);
  // the buttresses at the flanks' ends and between the windows; the eaves' cornice
  for (const face of ['right', 'left'] as const) {
    const f = frame.faces[face];
    buttresses(sink, f, [-D / 2 + 0.45, -D * 0.02, D / 2 - 0.45], wallH);
    trimRun(sink, 'stone', f, -D / 2, D / 2, wallH - 0.24, [{ h: 0.1, out: 0.06 }, { h: 0.14, out: 0.14 }], { ret: 0.3 });
  }
  // a niche with its figure over the west door, a cross on the west gable
  const front = frame.faces.front;
  faceBox(sink, 'stone', front, 0, 3.0, 0.0, 0.72, 1.1, 0.14, DECOR);
  faceBox(sink, 'dark', front, 0, 3.12, 0.1, 0.44, 0.82, 0.02, DECOR);
  faceBox(sink, 'stone', front, 0, 3.14, 0.18, 0.16, 0.66, 0.12, DECOR);
  if (frame.roof.gable) {
    // (stood on the half-hip's toe over the gable wall: the hip clips the gable below the ridge)
    const cz = D / 2 - 0.06, top = frame.roof.topAt(0, cz) ?? frame.roof.ridgeTopY;
    sink.span('stone', -0.06, top - 0.2, cz - 0.06, 0.06, top + 0.75, cz + 0.06, DECOR);
    sink.span('stone', -0.26, top + 0.38, cz - 0.06, 0.26, top + 0.5, cz + 0.06, DECOR);
  }
  // the ridge turret: a slated square stage with its bell openings, its spire and finial, a third of the way back
  const rg = frame.roof, z = rg.halfD * 0.42;
  const ridge = rg.topAt(0, z) ?? rg.ridgeTopY, s = 0.55;
  const low = (rg.topAt(s, z) ?? ridge) - 0.1;
  // (the r2 sweep, 2026-10-16: the bell openings dark plates on a solid stage) the stage under the bell open between its
  // corner posts, the louvre boards across each side, the bell's dark chamber behind them; the slated head over it
  const q0 = ridge + 0.12, q1 = ridge + 0.8, post = 0.13;
  sink.span(st.infill, -s, low, z - s, s, q0, z + s);
  sink.span(st.infill, -s, q1, z - s, s, ridge + 1.3, z + s);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) sink.span(st.infill, sx > 0 ? s - post : -s, q0, sz > 0 ? z + s - post : z - s, sx > 0 ? s : -s + post, q1, sz > 0 ? z + s : z - s + post);
  sink.span('dark', -s + 0.2, q0, z - s + 0.2, s - 0.2, q1, z + s - 0.2, DECOR);
  for (const [face, sgn] of [[0, 1], [0, -1], [1, 1], [1, -1]] as const) {
    const f: Face = face === 0
      ? { origin: [0, 0, z + sgn * s], u: [sgn, 0, 0], out: [0, 0, sgn], width: 2 * s }
      : { origin: [sgn * s, 0, z], u: [0, 0, -sgn], out: [sgn, 0, 0], width: 2 * s };
    for (let k = 0; k < 4; k++) faceBox(sink, SW, f, 0, q0 + 0.12 + k * 0.16, -0.06, 2 * s - 2 * post + 0.04, 0.05, 0.05, { colour: st.timber, decor: true });
    faceBox(sink, SW, f, 0, q0 + 0.02, -0.03, 2 * s, 0.05, 0.07, { colour: st.timber, decor: true });
  }
  sink.cylinder('roof', [0, ridge + 1.3, z], 'y', 2.6, s * 1.25, 8, {}, 0.04);
  finial(sink, 0, ridge + 3.85, z, 0.9);
  return sink.finish();
};

/**
 * The fire station: the engine house (a sandstone ground storey with two arched engine doors, its rendered upper storey
 * under a half-hipped roof with dormers) and its hose tower at one corner, louvred at the top, its clock, a pyramid roof.
 */
const feuerwache: RegionalBuilder = (ctx) => {
  const sink = new PartSink(houseUvOffset(ctx));
  const st = stateFor(ctx, ctx.rng);
  const rng = st.rng;
  const plotW = ctx.bounds.maxX - ctx.bounds.minX, plotD = ctx.bounds.maxZ - ctx.bounds.minZ;
  // (the engine house and the tower side by side inside the plot, their eaves included)
  const T = 3.2, W = Math.max(6.8, Math.min(9.6, plotW - T - 1.6)), D = Math.max(9.5, Math.min(12.5, plotD - 2.6));
  const cx = ctx.bounds.minX + 0.5 + W / 2, render: RegionalBucket = ctx.wallBucket === 'stone' || ctx.wallBucket === 'plaster' ? 'plaster2' : ctx.wallBucket as RegionalBucket;
  const sts: HouseSpec['storeys'] = [{ h: 4.3, wall: 'stone' }, { h: 3.0, wall: render }];
  const openings: Opening[] = [
    { face: 'front', storey: 0, kind: 'gate', u: -W * 0.22, w: 2.9, y0: 0, h: 3.6 },
    { face: 'front', storey: 0, kind: 'gate', u: W * 0.22, w: 2.9, y0: 0, h: 3.6 },
  ];
  for (const u of [-W * 0.32, -W * 0.11, W * 0.11, W * 0.32]) openings.push({ face: 'front', storey: 1, kind: 'window', u, w: 0.95, y0: 0.85, h: 1.45 });
  for (const face of ['right', 'left', 'back'] as const) {
    const width = face === 'back' ? W : D;
    for (let k = 0, n = Math.max(2, Math.round(width / 3.2)); k < n; k++) {
      const u = -width / 2 + (k + 0.5) * width / n;
      openings.push({ face, storey: 1, kind: 'window', u, w: 0.9, y0: 0.85, h: 1.4 });
      if (face !== 'left') openings.push({ face, storey: 0, kind: 'window', u, w: 0.9, y0: 1.6, h: 1.5 });
    }
  }
  const roof: RoofSpec = { kind: 'halfhip', pitchDeg: 50, eave: 0.42, verge: 0.3, thickness: 0.16, bucket: 'roof', ridge: 'round', hipFrac: 0.35 };
  const dialect: HouseDialect = {
    ...hessianDialect({ ...st, window: { ...st.window, shutters: null } }),
    door: (s, face, o, y0) => {
      // the engine doors: plank leaves in the station's red under a dressed round arch
      doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { leaf: ENGINE, frame: { bucket: 'stone', width: 0.34, out: 0.14, arch: true },
        steps: null, leafKind: 'plank', transom: true }, y0);
    },
  };
  sink.placed(0, cx, 0, 0, () => {
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: 0.4, out: 0.06, bucket: 'stone' }, storeys: sts, roof,
      openings, chimneys: [{ x: W * 0.25, z: -D * 0.2, sx: 0.55, sz: 0.6, above: 0.8, bucket: 'stone', cap: 'slab' }],
      gutters: { colour: ZINC }, verge: null, reveal: 0.3,
    }, dialect);
    const b1 = frame.bodies[1];
    quoins(sink, b1.x0, b1.x1, b1.z0, b1.z1, 4.4, frame.eaveY - 0.1);
    const front = frame.faces.front;
    // the string course at the upper floor, the window hoods, the eaves cornice
    trimRun(sink, 'stone', front, -W / 2, W / 2, sts[0].h + 0.4 - 0.16, [{ h: 0.1, out: 0.06 }, { h: 0.16, out: 0.15 }], { ret: 0.4 });
    for (const o of frame.spec.openings) {
      if (o.face === 'front' && o.storey === 1 && facadeOn()) {
        windowHead(sink, storeyFaces(frame, 1).front, o.u, frame.floors[1] + o.y0 + o.h + 0.12, o.w + 0.24,
          { kind: 'hood', bucket: 'stone', h: 0.2, out: 0.12, ext: 0.04 });
      }
    }
    // the sign board over the doors between them
    faceBox(sink, SW, front, 0, 3.75, 0.06, 2.0, 0.42, 0.05, { colour: rgb(0x2f3b33), decor: true });
    faceBox(sink, SW, front, 0, 3.85, 0.09, 1.6, 0.18, 0.02, { colour: rgb(0xc9b48a), decor: true });
    const look = ctx.variant;
    // (dome-detail-275) the string course and the eaves cornice carried round the flanks and the back, the cornice across
    // the front gable's foot
    for (const face of ['right', 'back', 'left'] as const) {
      const f = frame.faces[face], half = f.width / 2;
      trimRun(sink, 'stone', f, -half, half, sts[0].h + 0.4 - 0.16, [{ h: 0.1, out: 0.06 }, { h: 0.16, out: 0.15 }], { ret: 0.4 });
    }
    for (const face of ['front', 'right', 'back', 'left'] as const) {
      const f = frame.faces[face], half = f.width / 2;
      trimRun(sink, 'stone', f, -half, half, frame.eaveY - 0.28, [{ h: 0.1, out: 0.06 }, { h: 0.08, out: 0.12 }, { h: 0.1, out: 0.2 }], { ret: 0.4 });
    }
    // (dome-detail-275) the hook ladders hung along the blind left flank on their iron hooks, rails and rungs
    const fl = frame.faces.left, lw = Math.min(6.2, D - 2.4);
    for (const [ly, lo] of [[1.15, 0.08], [1.75, 0.2]] as const) {
      for (const k of [-1, 1]) faceBox(sink, 'structureMetal', fl, k * lw * 0.32, ly - 0.055, lo / 2 + 0.03, 0.05, 0.06, lo + 0.06, { colour: IRON, decor: true });
      for (const ry of [ly, ly + 0.36]) faceBox(sink, SW, fl, 0, ry, lo + 0.04, lw, 0.07, 0.05, { colour: rgb(0x8a6a44), decor: true });
      for (let u = -lw / 2 + 0.2; u < lw / 2 - 0.1; u += 0.42) faceBox(sink, SW, fl, u, ly + 0.18, lo + 0.04, 0.035, 0.3, 0.035, { colour: rgb(0x7a5c3a), decor: true, fine: 'near' });
    }
    // (dome-detail-275) the apron of setts before the engine doors, its gutter along the threshold, the wheel stones at
    // the jambs; the bracket lamp over the pier between the doors
    const fd = Math.min(1.25, plotD / 2 - D / 2 - 0.05);
    if (fd > 0.4) {
      sink.span('stone', -W / 2 + 0.1, -0.04, D / 2 + 0.02, W / 2 - 0.1, 0.05, D / 2 + fd, { decor: true, ground: true, shade: 0.86 });
      sink.span('dark', -W / 2 + 0.1, 0.05, D / 2 + 0.08, W / 2 - 0.1, 0.06, D / 2 + 0.22, { decor: true, ground: true });
    }
    for (const u of [-W * 0.22 - 1.62, -W * 0.22 + 1.62, W * 0.22 - 1.62, W * 0.22 + 1.62]) {
      if (Math.abs(u) > W / 2 - 0.1 || Math.abs(u) < 0.12) continue;
      sink.cylinder('stone', [u, 0, D / 2 + 0.13], 'y', 0.62, 0.15, 6, { decor: true, shade: 0.92 }, 0.09);
    }
    sink.member('structureMetal', facePoint(front, 0, 3.32, 0), facePoint(front, 0, 3.32, 0.5), 0.04, 0.04, front.u, { colour: IRON, decor: true, exposed: true });
    sink.span('structureMetal', -0.12, 2.98, D / 2 + 0.38, 0.12, 3.31, D / 2 + 0.62, { colour: rgb(0x2c3a32), decor: true });
    sink.cylinder('structureMetal', [0, 3.31, D / 2 + 0.5], 'y', 0.1, 0.16, 6, { colour: rgb(0x2c3a32), decor: true }, 0.02);
    // (dome-detail-275) the beavertails in relief
    biberCourses(sink, frame.roof, roof, look, frame.roofPatch);
  });
  // the hose tower at the plot's +x front corner
  const tx = ctx.bounds.maxX - 0.55 - T / 2, tz = Math.min(ctx.bounds.maxZ - 1.4 - T / 2, D / 2 - T / 2 + 0.4);
  sink.placed(0, tx, 0, tz, () => {
    const tSts: HouseSpec['storeys'] = [{ h: 4.3, wall: 'stone' }, { h: 3.1, wall: render }, { h: 3.1, wall: render }, { h: 2.0, wall: st.infill, framed: true }];
    const tOpen: Opening[] = [
      { face: 'front', storey: 0, kind: 'door', u: 0, w: 1.1, y0: 0, h: 2.3 },
      { face: 'right', storey: 1, kind: 'window', u: 0, w: 0.6, y0: 1.0, h: 1.1 },
      { face: 'front', storey: 2, kind: 'window', u: 0, w: 0.6, y0: 0.6, h: 1.0 },
      { face: 'right', storey: 2, kind: 'window', u: 0, w: 0.6, y0: 0.6, h: 1.0 },
    ];
    // (the r2 sweep, 2026-10-16: the drying stage's openings dark plates behind the slats) cut through its four faces,
    // the louvre boards in the openings
    const louvred = new Set<Opening>();
    for (const face of ['front', 'right', 'back', 'left'] as const) {
      const o: Opening = { face, storey: 3, kind: 'window', u: 0, w: T - 0.9, y0: 0.15, h: 1.5 };
      louvred.add(o); tOpen.push(o);
    }
    const tDialect: HouseDialect = {
      ...dialect,
      window: (s2, face, o, y0, fr) => {
        if (!louvred.has(o)) { dialect.window(s2, face, o, y0, fr); return; }
        for (let k = 0; k < 6; k++) faceBox(s2, SW, face, o.u, y0 + o.y0 + 0.12 + k * 0.25, -0.1, o.w + 0.04, 0.06, 0.07, { colour: st.timber, decor: true });
      },
    };
    const tRoof: RoofSpec = { kind: 'hip', pitchDeg: 58, eave: 0.45, verge: 0.45, thickness: 0.14, bucket: 'roof', ridge: 'round' };
    const tf = buildHouse(sink, {
      w: T, d: T, plinth: { h: 0.4, out: 0.06, bucket: 'stone' }, storeys: tSts,
      roof: tRoof, openings: tOpen, chimneys: [], gutters: null, verge: null, reveal: 0.25,
    }, tDialect);
    const tb = tf.bodies[1];
    quoins(sink, tb.x0, tb.x1, tb.z0, tb.z1, 4.4, tf.floors[3] - 0.1);
    // the clock under the drying stage on the street face, its hands gilded
    const fc = storeyFaces(tf, 2).front;
    faceBox(sink, SW, fc, 0, tf.floors[3] - 0.95, 0.03, 0.85, 0.85, 0.04, { colour: CLOCK, decor: true });
    faceBox(sink, SW, fc, 0, tf.floors[3] - 0.95 + 0.2, 0.06, 0.05, 0.36, 0.01, { colour: GILT, decor: true });
    finial(sink, 0, tf.roof.ridgeTopY + 0.05, 0, 1.1);
    // (dome-detail-275) the shaft's string courses at its stages, the drying stage's sill course over the stone, its
    // corbelled eaves course; the bell for the alarm hung in the drying stage's street opening on its iron yoke
    for (const face of ['front', 'right', 'back', 'left'] as const) {
      for (const i of [1, 2, 3]) {
        const f = storeyFaces(tf, i)[face];
        trimRun(sink, 'stone', f, -f.width / 2, f.width / 2, tf.floors[i] - 0.14, i === 3 ? [{ h: 0.1, out: 0.06 }, { h: 0.12, out: 0.16 }] : [{ h: 0.1, out: 0.05 }, { h: 0.1, out: 0.1 }], { ret: 0.2 });
      }
      const f = storeyFaces(tf, 3)[face];
      trimRun(sink, 'stone', f, -f.width / 2, f.width / 2, tf.eaveY - 0.2, [{ h: 0.1, out: 0.05 }, { h: 0.1, out: 0.12 }], { ret: 0.2 });
    }
    const by = tf.floors[3] + 1.7, bronze = { colour: rgb(0x6a5a32), decor: true };
    sink.span('structureMetal', -T / 2 + 0.01, by, -0.05, T / 2 - 0.01, by + 0.1, 0.05, { colour: IRON, decor: true });
    sink.revolve('structureMetal', [0, by - 0.44, 0], 'y', [[0, 0.24], [0.12, 0.22], [0.3, 0.17], [0.42, 0.1], [0.45, 0]], 10, bronze);
    sink.cylinder('structureMetal', [0, by - 0.46, 0], 'y', 0.03, 0.245, 10, bronze);
    biberCourses(sink, tf.roof, tRoof, ctx.variant, tf.roofPatch, [2.5, 2]);
  });
  void rng;
  return sink.finish();
};

/**
 * The works: a long two-storey sandstone hall with pilaster strips between tall segment-headed windows, its gable to the
 * street with a round window, a ridge lantern, the engine house against its back with a tall arched window, and the
 * round chimney on its square base.
 */
const fabrik: RegionalBuilder = (ctx) => {
  const sink = new PartSink(houseUvOffset(ctx));
  const st = stateFor(ctx, ctx.rng);
  const plotW = ctx.bounds.maxX - ctx.bounds.minX, plotD = ctx.bounds.maxZ - ctx.bounds.minZ;
  const W = Math.max(8.5, Math.min(10.8, plotW - 0.8)), D = Math.max(12, Math.min(14.5, plotD - 5.2));
  const zHall = ctx.bounds.maxZ - 0.3 - D / 2;
  const sts: HouseSpec['storeys'] = [{ h: 4.0, wall: 'stone' }, { h: 3.6, wall: 'stone' }];
  const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'gate', u: 0, w: 2.8, y0: 0, h: 3.3 }];
  for (const u of [-W * 0.32, W * 0.32]) openings.push({ face: 'front', storey: 0, kind: 'window', u, w: 1.2, y0: 1.1, h: 2.3 });
  for (const u of [-W * 0.28, 0, W * 0.28]) openings.push({ face: 'front', storey: 1, kind: 'window', u, w: 1.2, y0: 0.7, h: 2.2 });
  const bays = Math.max(3, Math.round(D / 3.2));
  for (const face of ['right', 'left'] as const) {
    for (let k = 0; k < bays; k++) {
      const u = -D / 2 + (k + 0.5) * D / bays;
      // (dome-detail-275) the right flank's middle bay a loading door at the platform's height
      if (face === 'right' && k === Math.floor(bays / 2)) openings.push({ face, storey: 0, kind: 'door', u, w: 1.8, y0: 0.6, h: 2.6 });
      else openings.push({ face, storey: 0, kind: 'window', u, w: 1.3, y0: 1.0, h: 2.4 });
      openings.push({ face, storey: 1, kind: 'window', u, w: 1.3, y0: 0.7, h: 2.3 });
    }
  }
  const segment = (w: number) => ({ kind: 'segment' as const, bucket: 'stone' as RegionalBucket, h: 0.28, out: 0.08, ext: 0.1, rise: w * 0.22 });
  const dialect: HouseDialect = {
    ...hessianDialect(st),
    window: (s, face, o, y0) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, {
      frame: rgb(0x2f3436), frameWidth: 0.06, frameOut: 0.03, bars: 'six',
      surround: { bucket: 'stone', width: 0.18, out: 0.07 }, sill: { bucket: 'stone', out: 0.12 }, shutters: null, head: segment(o.w),
    }, st.rng, 0.35),
    door: (s, face, o, y0) => doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, {
      leaf: rgb(0x3e4a44), frame: { bucket: 'stone', width: 0.32, out: 0.14, arch: true }, steps: null, leafKind: 'plank', transom: true,
    }, y0),
    // (the r2 sweep, 2026-10-16: the gable's round window a dark plate on its stone) cut through the front gable, its ring
    // over the cut's corners and its glazing set back in it (below)
    gableOpenings: (face, poly, fr) => {
      if (face.out[0] * fr.faces.front.out[0] + face.out[2] * fr.faces.front.out[2] < 0.9) return [];
      const ys = poly.map(([, y]) => y), lo = Math.min(...ys), cy = lo + (Math.max(...ys) - lo) * 0.42 - 0.4;
      return [{ u0: -0.45, u1: 0.45, y0: cy - 0.45, y1: cy + 0.45 }];
    },
  };
  sink.placed(0, 0, 0, zHall, () => {
    const roof: RoofSpec = { kind: 'gable', pitchDeg: 38, eave: 0.4, verge: 0.3, thickness: 0.17, bucket: 'roof', ridge: 'round' };
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: 0.5, out: 0.08, bucket: 'stone' }, storeys: sts, roof,
      gableBucket: 'stone', openings, chimneys: [], gutters: { colour: ZINC }, verge: null, reveal: 0.34,
    }, dialect);
    // pilaster strips between the bays, the string course at the floor, the eaves cornice
    for (const face of ['right', 'left'] as const) {
      const f = frame.faces[face];
      for (let k = 0; k <= bays; k++) {
        const u = -D / 2 + k * D / bays;
        faceBox(sink, 'stone', f, u, 0.5 + (frame.eaveY - 0.7) / 2, 0.05, 0.42, frame.eaveY - 0.7, 0.1, DECOR);
      }
      trimRun(sink, 'stone', f, -D / 2, D / 2, sts[0].h + 0.5 - 0.12, [{ h: 0.12, out: 0.12 }], { ret: 0.3 });
      trimRun(sink, 'stone', f, -D / 2, D / 2, frame.eaveY - 0.26, [{ h: 0.1, out: 0.06 }, { h: 0.16, out: 0.16 }], { ret: 0.3 });
    }
    // the gable's round window and the coping along its rakes
    if (frame.roof.gable) {
      const front = frame.faces.front, gy = frame.eaveY + (frame.roof.ridgeY - frame.eaveY) * 0.42, cy = gy - 0.4;
      // the oculus: its dressed ring of twelve stones over the cut, the round sash set back in it
      const P = (r: number, t: number, o: number): Vec3 => [front.origin[0] + front.u[0] * Math.cos(t) * r + front.out[0] * o, cy + Math.sin(t) * r, front.origin[2] + front.u[2] * Math.cos(t) * r + front.out[2] * o];
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2, b = ((k + 1) / 12) * Math.PI * 2;
        sink.quad('stone', P(0.42, a, 0.06), P(0.68, a, 0.06), P(0.68, b, 0.06), P(0.42, b, 0.06), { ...DECOR, shade: k % 2 ? 0.9 : 1 });
        sink.quad('stone', P(0.68, a, 0), P(0.68, b, 0), P(0.68, b, 0.06), P(0.68, a, 0.06), { ...DECOR, shade: 0.85 });
        sink.quad('stone', P(0.42, b, 0), P(0.42, a, 0), P(0.42, a, 0.06), P(0.42, b, 0.06), { ...DECOR, shade: 0.75 });
      }
      const disc: Vec3[] = Array.from({ length: 12 }, (_, k) => P(0.46, (k / 12) * Math.PI * 2, -0.16));
      sink.polygon('glass', disc, DECOR);
      sink.quad(SW, P(0.46, Math.PI, -0.15), P(0.46, 0, -0.15), P(0.46, 0, -0.13), P(0.46, Math.PI, -0.13), { colour: rgb(0x2f3436), decor: true, fine: true });
    }
    // the ridge lantern: a raised louvred stage along the ridge under its own little roof
    // ((dome-detail-275) its sills run down to the slopes: the stage stood 0.3 m clear of them at its edges)
    const rg = frame.roof, ly = rg.ridgeTopY - 0.05, len = D * 0.6;
    sink.span('stone', -0.75, ly - 0.25 - 0.75 * rg.tanP, -len / 2, 0.75, ly + 0.55, len / 2);
    for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) {
      sink.span(SW, sx * 0.76 - 0.02, ly + k * 0.16, -len / 2 + 0.2, sx * 0.76 + 0.02, ly + k * 0.16 + 0.06, len / 2 - 0.2, { colour: rgb(0x40403c), decor: true });
    }
    const cap: RoofSpec = { kind: 'gable', pitchDeg: 30, eave: 0.25, verge: 0.2, thickness: 0.1, bucket: 'roof', ridge: 'round' };
    sink.placed(0, 0, 0, 0, () => emitRoof(sink, roofGeometry(1.5, len, ly + 0.55, cap), cap));
    const look = ctx.variant, front = frame.faces.front;
    // (dome-detail-275) the string course across the front at the floor, either side of the gate's arch; the cornice at
    // the gable's foot; the iron anchors of the floor's tie rods on the gable front and down the flanks at each pilaster
    for (const sd of [-1, 1]) trimRun(sink, 'stone', front, sd > 0 ? 2.1 : -W / 2, sd > 0 ? W / 2 : -2.1, sts[0].h + 0.5 - 0.12, [{ h: 0.12, out: 0.12 }], { ret: 0.3 });
    trimRun(sink, 'stone', front, -W / 2, W / 2, frame.eaveY - 0.26, [{ h: 0.1, out: 0.06 }, { h: 0.16, out: 0.16 }], { ret: 0.3 });
    for (const u of [-W / 2 + 0.75, W / 2 - 0.75]) for (const y of [sts[0].h + 0.75, frame.eaveY - 0.55]) anchor(sink, front, u, y);
    for (const face of ['right', 'left'] as const) {
      for (let k = 1; k < bays; k++) anchor(sink, frame.faces[face], -D / 2 + k * D / bays, sts[0].h + 0.78, 0.1);
    }
    // (dome-detail-275) the hoist beam out of the gable's head over the oculus, its pulley and the loft door under it
    if (frame.roof.gable) {
      const hy = frame.eaveY + (frame.roof.ridgeY - frame.eaveY) * 0.78;
      faceBox(sink, SW, front, 0, hy - 0.6, 0.02, 0.8, 0.9, 0.04, { colour: rgb(0x3e4a44), decor: true });
      for (const u of [-0.2, 0.2]) faceBox(sink, SW, front, u, hy - 0.6, 0.045, 0.05, 0.86, 0.02, { colour: rgb(0x2f3436), decor: true, fine: 'near' });
      faceBox(sink, 'stone', front, 0, hy - 1.1, 0.06, 1.0, 0.1, 0.12, DECOR);
      faceBox(sink, SW, front, 0, hy + 0.08, 0.4, 0.2, 0.22, 0.88, { colour: rgb(0x4a3a2c), decor: true });
      sink.cylinder('structureMetal', facePoint(front, -0.13, hy - 0.16, 0.7), 'x', 0.26, 0.15, 8, { colour: IRON, decor: true });
      faceBox(sink, 'structureMetal', front, 0, hy - 0.06, 0.7, 0.04, 0.1, 0.04, { colour: IRON, decor: true });
    }
    // (dome-detail-275) the loading platform along the right flank to its door: a sandstone dock, its steps up from the
    // yard at the front end, its timber canopy on iron struts out of the wall
    const pl = Math.min(4.6, D / 2 - 1.2), dx = W / 2;
    sink.span('stone', dx - 0.05, -0.3, -pl, dx + 1.5, 1.1, pl);
    sink.span('stone', dx + 1.5, 1.0, -pl - 0.04, dx + 1.6, 1.12, pl + 0.04, { decor: true, shade: 0.82 });
    for (let k = 0; k < 4; k++) sink.span('stone', dx + 0.15, -0.2, pl, dx + 1.35, 0.28 * (4 - k) - 0.05, pl + 0.3 * (k + 1), { decor: true, shade: 0.9 + k * 0.02 });
    const cy0 = sts[0].h + 0.5 - 0.3, cOut = 1.95;
    facing(sink, 'roof', [[dx, cy0, -pl - 0.3], [dx, cy0, pl + 0.3], [dx + cOut, cy0 - 0.45, pl + 0.3], [dx + cOut, cy0 - 0.45, -pl - 0.3]], [0.25, 1, 0], DECOR);
    facing(sink, 'roof', [[dx, cy0 - 0.1, -pl - 0.3], [dx, cy0 - 0.1, pl + 0.3], [dx + cOut, cy0 - 0.55, pl + 0.3], [dx + cOut, cy0 - 0.55, -pl - 0.3]], [-0.25, -1, 0], { decor: true, shade: 0.6 });
    facing(sink, SW, [[dx + cOut, cy0 - 0.55, -pl - 0.3], [dx + cOut, cy0 - 0.55, pl + 0.3], [dx + cOut, cy0 - 0.45, pl + 0.3], [dx + cOut, cy0 - 0.45, -pl - 0.3]], [1, 0, 0], { colour: rgb(0x4a3a2c), decor: true });
    for (const ez2 of [-1, 1]) {
      const z = ez2 * (pl + 0.3);
      facing(sink, SW, [[dx, cy0 - 0.1, z], [dx, cy0, z], [dx + cOut, cy0 - 0.45, z], [dx + cOut, cy0 - 0.55, z]], [0, 0, ez2], { colour: rgb(0x4a3a2c), decor: true });
    }
    for (const z of [-pl + 0.3, 0.3 * look() - 0.15, pl - 0.3]) {
      sink.member('structureMetal', [dx, cy0 - 1.3, z], [dx + cOut - 0.25, cy0 - 0.5, z], 0.06, 0.06, [0, 0, 1], { colour: IRON, decor: true, exposed: true });
    }
    // (dome-detail-275) the beavertails in relief, run up under the lantern
    biberCourses(sink, frame.roof, roof, look, frame.roofPatch, [4, 4]);
  });
  // the engine house against the hall's back, lower, its tall arched window
  const EW = Math.min(5.2, W * 0.5), ED = Math.max(3.2, Math.min(4.4, (zHall - D / 2) - ctx.bounds.minZ - 0.6));
  const ex = -W / 2 + EW / 2 + 0.4, ez = zHall - D / 2 - ED / 2 + 0.02;
  sink.placed(0, ex, 0, ez, () => {
    buildHouse(sink, {
      w: EW, d: ED, plinth: { h: 0.5, out: 0.06, bucket: 'stone' }, storeys: [{ h: 5.2, wall: 'stone' }],
      roof: { kind: 'shed', pitchDeg: 14, eave: 0.3, verge: 0.25, thickness: 0.14, bucket: 'roof' },
      openings: [{ face: 'left', storey: 0, kind: 'window', u: 0, w: 1.3, y0: 1.2, h: 3.2 }, { face: 'back', storey: 0, kind: 'door', u: 0, w: 1.2, y0: 0, h: 2.4 }],
      chimneys: [], gutters: { colour: ZINC }, verge: null, reveal: 0.34,
    }, dialect);
  });
  // the chimney: a square sandstone base and the round stack, its banded crown (the soot darker toward the top)
  const sx = W / 2 - 1.3, sz = Math.max(ctx.bounds.minZ + 1.4, zHall - D / 2 - 1.5), stackH = 16;
  sink.span('stone', sx - 0.95, -0.4, sz - 0.95, sx + 0.95, 3.2, sz + 0.95);
  sink.span('stone', sx - 1.05, 3.2, sz - 1.05, sx + 1.05, 3.45, sz + 1.05, DECOR);
  // (cylinder's radiusEnd: the stack tapers from 0.85 m at its base to 0.58 m under its crown)
  sink.cylinder('stone', [sx, 3.4, sz], 'y', stackH - 3.4, 0.85, 12, { tint: [0.86, 0.8, 0.78] }, 0.58);
  for (const [y, r] of [[stackH - 0.55, 0.7], [stackH - 1.2, 0.66], [stackH * 0.55, 0.76]] as const) {
    sink.cylinder('stone', [sx, y, sz], 'y', 0.24, r, 12, { ...DECOR, tint: [0.62, 0.58, 0.56] }, r);
  }
  // (dome-detail-275) the crown corbelled out a course more under its coping; the iron hoops round the stack where it
  // cracked; the base's foot course and its iron soot door
  sink.cylinder('stone', [sx, stackH - 0.31, sz], 'y', 0.3, 0.76, 12, { ...DECOR, tint: [0.5, 0.47, 0.46] }, 0.74);
  const rAt = (y: number) => 0.85 + (0.58 - 0.85) * (y - 3.4) / (stackH - 3.4);
  for (const y of [5.2, 7.4, 9.6, 11.8]) sink.cylinder('structureMetal', [sx, y, sz], 'y', 0.08, rAt(y) + 0.015, 12, { colour: IRON, decor: true }, rAt(y + 0.08) + 0.015, false);
  sink.span('stone', sx - 1.08, -0.3, sz - 1.08, sx + 1.08, 0.42, sz + 1.08, { decor: true, shade: 0.88 });
  sink.span('structureMetal', sx - 0.98, 0.6, sz - 0.32, sx - 0.94, 1.45, sz + 0.32, { colour: IRON, decor: true });
  // (dome-detail-275) the boiler's coal tipped by the engine house, a heap and its spill; brick stacks in the back yard
  const coal = { decor: true, shade: 0.7 };
  const hx = (ex + EW / 2 + sx - 1.05) / 2, hz = ez - 0.4;
  sink.cylinder('dark', [hx, -0.15, hz], 'y', 1.15, Math.min(1.3, (sx - 1.05 - ex - EW / 2) / 2 - 0.05), 12, coal, 0.14);
  sink.cylinder('dark', [hx + 0.5, -0.1, hz - 0.9], 'y', 0.6, 0.75, 10, coal, 0.1);
  const yard = ctx.bounds.minZ + 0.5, yardEnd = ez - ED / 2 - 0.5, look2 = ctx.variant;
  for (let x = -W / 2 + 0.4, k = 0; x < W / 2 - 1.2 && yardEnd - yard > 1.4; x += 1.6 + look2() * 0.5, k++) {
    const h = 0.9 + look2() * 0.5, d = 1.0 + look2() * 0.3, z0 = yard + look2() * Math.max(0, yardEnd - yard - d);
    sink.span(SW, x - 0.05, 0, z0 - 0.05, x + 1.15, 0.12, z0 + d + 0.05, { colour: rgb(0x6a563e), decor: true });
    sink.span('stone', x, 0.12, z0, x + 1.1, 0.12 + h, z0 + d, { decor: true, tint: [1.28, 0.66, 0.5], shade: 0.85 + look2() * 0.15 });
  }
  return sink.finish();
};

/** A parapet round a flat top (hx, hz its half-widths), `h` high and `t` thick, its four runs closed boxes (dressing). */
function parapetRing(sink: PartSink, hx: number, hz: number, y: number, h: number, t: number): void {
  sink.span('stone', -hx, y - 0.02, hz - t, hx, y + h, hz + 0.01, DECOR);
  sink.span('stone', -hx, y - 0.02, -hz - 0.01, hx, y + h, -hz + t, DECOR);
  sink.span('stone', -hx - 0.01, y - 0.02, -hz + t, -hx + t, y + h, hz - t, DECOR);
  sink.span('stone', hx - t, y - 0.02, -hz + t, hx + 0.01, y + h, hz - t, DECOR);
}

/**
 * The town church (Stadtkirche; Kronach's St. Johannes, the hall churches of the Franconian towns): the nave's ashlar on
 * its plinth between stepped buttresses, tall windows in dressed surrounds, its steep tiled roof hipped over the choir,
 * and the west tower over the square — a stone shaft of five stages with its arched door, slit lights, the clock stage
 * and the louvred bell chamber, a parapet with its four corner turrets and the octagonal slated spire. (The maps lane,
 * 2026-10-15; the critics on Steinburg: "no hill, castle or church mass": the framed village church the kit drew stood
 * no higher than the houses round the square.) The nave and the tower are buildHouse bodies, so the kit's damage plan
 * describes them; the dressing is decor. Both keep to the plot (the base church's footprint).
 */
const stadtkirche: RegionalBuilder = (ctx) => {
  const sink = new PartSink(houseUvOffset(ctx));
  const st = stateFor(ctx, ctx.rng);
  const plotW = ctx.bounds.maxX - ctx.bounds.minX, plotD = ctx.bounds.maxZ - ctx.bounds.minZ;
  const cx = (ctx.bounds.maxX + ctx.bounds.minX) / 2, cz = (ctx.bounds.maxZ + ctx.bounds.minZ) / 2;
  // (the nave's buttresses stand 0.5 m out of its flanks, its eaves 0.4 m: all inside the plot)
  const W = Math.max(7.0, Math.min(8.6, plotW - 1.4)), T = Math.max(5.2, Math.min(6.6, W - 1.6));
  const tz = cz + plotD / 2 - 0.35 - T / 2;
  const naveZ0 = cz - plotD / 2 + 0.6, naveZ1 = tz - T / 2 + 0.5, D = Math.max(10, naveZ1 - naveZ0), nz = (naveZ0 + naveZ1) / 2;
  const wallH = 8.6;
  const sandstone: HouseDialect = {
    ...hessianDialect(st),
    window: (s, face, o, y0) => {
      windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, {
        frame: rgb(0x3b3a36), frameWidth: 0.05, frameOut: 0.03, bars: 'six',
        surround: { bucket: 'stone', width: 0.22, out: 0.08 }, sill: { bucket: 'stone', out: 0.14 }, shutters: null,
        head: { kind: 'segment', bucket: 'stone', h: 0.28, out: 0.09, ext: 0.08, rise: o.w * 0.5 },
      }, st.rng, 0.1);
    },
    door: (s, face, o, y0) => doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, {
      leaf: rgb(0x4a3020), frame: { bucket: 'stone', width: 0.34, out: 0.18, arch: true }, steps: { bucket: 'stone' }, leafKind: 'plank',
    }, y0),
  };
  // the nave
  sink.placed(0, cx, 0, nz, () => {
    const openings: Opening[] = [];
    for (const face of ['right', 'left'] as const) {
      for (const u of [-D * 0.36, -D * 0.12, D * 0.12, D * 0.36]) {
        // (dome-detail-275) the south door in the right flank's second bay, a shorter light over it
        if (face === 'right' && u === -D * 0.12) {
          openings.push({ face, storey: 0, kind: 'door', u, w: 1.4, y0: 0, h: 2.7 });
          openings.push({ face, storey: 0, kind: 'window', u, w: 1.1, y0: 4.6, h: 2.4 });
        } else openings.push({ face, storey: 0, kind: 'window', u, w: 1.3, y0: 2.5, h: 4.5 });
      }
    }
    openings.push({ face: 'back', storey: 0, kind: 'window', u: 0, w: 1.6, y0: 2.7, h: 4.4 });
    const roof: RoofSpec = { kind: 'halfhip', pitchDeg: 56, eave: 0.4, verge: 0.25, thickness: 0.18, bucket: 'roof', ridge: 'round', hipFrac: 0.5 };
    // (dome-detail-275) the nave's lights pointed, their tracery in them
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: 0.6, out: 0.12, bucket: 'stone' }, storeys: [{ h: wallH, wall: 'stone' }], roof,
      gableBucket: 'stone', openings, chimneys: [], gutters: { colour: ZINC }, verge: null, reveal: 0.42,
    }, {
      ...sandstone, window: (s, face, o, y0) => lancet(s, face, o, y0, rgb(0x3b3a36), st.rng),
      // (dome-detail-275) the south door's two steps kept within the churchyard path
      door: (s, face, o, y0) => doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, {
        leaf: rgb(0x4a3020), frame: { bucket: 'stone', width: 0.3, out: 0.16, arch: true }, steps: { bucket: 'stone', rise: 0.3, tread: 0.26 }, leafKind: 'plank',
      }, y0),
    });
    const look = ctx.variant;
    for (const face of ['right', 'left'] as const) {
      const f = frame.faces[face];
      buttresses(sink, f, [-D / 2 + 0.45, -D * 0.24, 0, D * 0.24, D / 2 - 0.45], wallH);
      trimRun(sink, 'stone', f, -D / 2, D / 2, wallH + 0.6 - 0.26, [{ h: 0.1, out: 0.06 }, { h: 0.16, out: 0.16 }], { ret: 0.3 });
      // (dome-detail-275) the sill course (Kaffgesims) under the lights, its drip a hand proud, broken round the door
      const yc = 0.6 + 2.5 - 0.24, door = face === 'right' ? -D * 0.12 : null;
      const spans: Array<[number, number]> = door === null ? [[-D / 2, D / 2]] : [[-D / 2, door - 1.05], [door + 1.05, D / 2]];
      for (const [u0, u1] of spans) trimRun(sink, 'stone', f, u0, u1, yc, [{ h: 0.08, out: 0.05 }, { h: 0.1, out: 0.11 }], { ret: u0 === -D / 2 || u1 === D / 2 ? 0.3 : 0 });
    }
    // (dome-detail-275) the south door's gabled hood (a Wimperg) over its arch, its cross on the apex
    const fr = frame.faces.right, du = -D * 0.12, dy = 0.6 + 2.7 + 0.55;
    facing(sink, 'stone', [facePoint(fr, du - 1.05, dy, 0.24), facePoint(fr, du + 1.05, dy, 0.24), facePoint(fr, du, dy + 1.25, 0.24)], fr.out, DECOR);
    for (const sd of [-1, 1] as const) {
      const a = facePoint(fr, du + sd * 1.05, dy, 0), b = facePoint(fr, du, dy + 1.25, 0), c = facePoint(fr, du, dy + 1.25, 0.24), d = facePoint(fr, du + sd * 1.05, dy, 0.24);
      facing(sink, 'stone', [a, b, c, d], [fr.out[0] * 0.3 + fr.u[0] * sd, 0.9, fr.out[2] * 0.3 + fr.u[2] * sd], { decor: true, shade: 0.9 });
    }
    facing(sink, 'stone', [facePoint(fr, du - 1.05, dy, 0), facePoint(fr, du + 1.05, dy, 0), facePoint(fr, du + 1.05, dy, 0.24), facePoint(fr, du - 1.05, dy, 0.24)], [0, -1, 0], { decor: true, shade: 0.7 });
    faceBox(sink, 'stone', fr, du, dy + 1.45, 0.1, 0.08, 0.5, 0.08, DECOR);
    faceBox(sink, 'stone', fr, du, dy + 1.55, 0.1, 0.3, 0.08, 0.08, DECOR);
    // (dome-detail-275) the sundial on the left flank's sunny bay: its painted board and its iron gnomon
    const fl = frame.faces.left, su = D * 0.24 - (look() < 0.5 ? 0 : D * 0.48);
    faceBox(sink, 'plaster', fl, su, wallH - 1.2, 0.02, 1.1, 1.3, 0.04, { decor: true, tint: [1.2, 1.15, 1.02] });
    sink.member('structureMetal', facePoint(fl, su, wallH - 0.85, 0.04), facePoint(fl, su, wallH - 1.5, 0.45), 0.03, 0.03, fl.u, { colour: IRON, decor: true, exposed: true });
    const b = frame.faces.back;
    buttresses(sink, b, [-W / 2 + 0.45, W / 2 - 0.45], wallH);
    // (dome-detail-275) the beavertails in relief
    biberCourses(sink, frame.roof, roof, look, frame.roofPatch, [4, 5]);
  });
  // the west tower over the square
  sink.placed(0, cx, 0, tz, () => {
    const sts: HouseSpec['storeys'] = [{ h: 5.4, wall: 'stone' }, { h: 4.6, wall: 'stone' }, { h: 4.6, wall: 'stone' }, { h: 4.2, wall: 'stone' }, { h: 4.6, wall: 'stone' }];
    const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'door', u: 0, w: 1.8, y0: 0, h: 3.4 }];
    for (const face of ['front', 'right', 'left'] as const) {
      for (const i of [1, 2]) openings.push({ face, storey: i, kind: 'window', u: 0, w: 0.6, y0: 1.5, h: 1.6 });
    }
    // (the r2 sweep, 2026-10-16: the bell chamber's openings dark plates behind their louvres) the two tall openings on
    // each face of the bell stage cut through the shaft, their dressed surrounds round them, the louvres in the reveals
    const bells = new Set<Opening>();
    for (const face of ['front', 'right', 'back', 'left'] as const) for (const u of [-T * 0.2, T * 0.2]) {
      const o: Opening = { face, storey: 4, kind: 'window', u, w: 0.85, y0: 0.85, h: 2.7 };
      bells.add(o); openings.push(o);
    }
    const roof: RoofSpec = { kind: 'flat', pitchDeg: 0, eave: 0.12, verge: 0.12, thickness: 0.22, bucket: 'stone', parapet: 0 };
    const frame = buildHouse(sink, {
      w: T, d: T, plinth: { h: 0.6, out: 0.14, bucket: 'stone' }, storeys: sts, roof,
      gableBucket: 'stone', openings, chimneys: [], gutters: null, verge: null, reveal: 0.5,
    }, {
      ...sandstone,
      window: (s2, face, o, y0, fr) => {
        if (!bells.has(o)) { sandstone.window(s2, face, o, y0, fr); return; }
        const yb = y0 + o.y0, sw = 0.2;
        // the surround: its jambs and its head, a hand proud; the louvres set back in the reveal
        for (const sg of [-1, 1]) faceBox(s2, 'stone', face, o.u + sg * (o.w / 2 + sw / 2), yb + o.h / 2, 0.03, sw, o.h + 0.2, 0.06, DECOR);
        faceBox(s2, 'stone', face, o.u, yb + o.h + 0.1, 0.03, o.w + 2 * sw, 0.2, 0.06, DECOR);
        for (let k = 0; k < 7; k++) faceBox(s2, SW, face, o.u, yb + 0.25 + k * 0.36, -0.18, o.w + 0.04, 0.06, 0.06, { colour: st.timber, decor: true });
      },
    });
    const b0 = frame.bodies[0];
    quoins(sink, b0.x0, b0.x1, b0.z0, b0.z1, 0.6, frame.eaveY - 0.1);
    for (const face of ['front', 'right', 'back', 'left'] as const) {
      // the string courses between the stages
      for (const i of [1, 3, 4]) {
        const f = storeyFaces(frame, i)[face];
        trimRun(sink, 'stone', f, -f.width / 2, f.width / 2, frame.floors[i] - 0.14, [{ h: 0.1, out: 0.06 }, { h: 0.14, out: 0.14 }], { ret: 0.2 });
      }
      // the clock on the fourth stage
      const fc = storeyFaces(frame, 3)[face], cy = frame.floors[3] + 2.1;
      faceBox(sink, SW, fc, 0, cy, 0.04, 1.7, 1.7, 0.05, { colour: CLOCK, decor: true });
      faceBox(sink, SW, fc, 0, cy + 0.32, 0.08, 0.07, 0.64, 0.01, { colour: GILT, decor: true });
      faceBox(sink, SW, fc, 0.2, cy, 0.08, 0.46, 0.06, 0.01, { colour: GILT, decor: true });
      // the bell chamber's two louvred openings on each face, in their dressed surrounds
      // (the bell chamber's openings cut through the shaft above: the dialect's bell units)
    }
    // the parapet round the top, closed stone (a flat roof's own parapet is a single skin, its inner face open to view),
    // the corner turrets on it and the octagonal spire, slated
    const top = frame.eaveY + 0.22, k = T / 2 - 0.42;
    parapetRing(sink, T / 2, T / 2, top, 0.9, 0.42);
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      sink.cylinder('stone', [sx * k, top - 0.1, sz * k], 'y', 1.9, 0.42, 8, DECOR);
      sink.cylinder('roof', [sx * k, top + 1.8, sz * k], 'y', 2.2, 0.5, 8, { colour: SLATE, decor: true }, 0.03);
    }
    // (dome-detail-275) the spire's faces square to the shaft's, so its lucarnes face the four ways
    const R0 = T * 0.43, SH = 14.5;
    sink.cylinder('roof', [0, top - 0.05, 0], 'y', SH, R0, 8, { colour: SLATE }, 0.05, true, Math.PI / 8);
    // (dome-detail-275) the spire's four lucarnes a third of the way up, each a slated gablet over its dark light, and a
    // band of lead at the spire's foot over the parapet walk
    const lt = 3.6, ap = (R0 - (R0 - 0.05) * lt / SH) * Math.cos(Math.PI / 8);
    for (const [ux, uz] of [[1, 0], [0, 1], [-1, 0], [0, -1]] as const) {
      const f: Face = { origin: [ux * (ap + 0.12), 0, uz * (ap + 0.12)], u: [uz, 0, -ux], out: [ux, 0, uz], width: 1 };
      const y0 = top + lt - 0.25, pent = [facePoint(f, -0.42, y0), facePoint(f, 0.42, y0), facePoint(f, 0.42, y0 + 0.95), facePoint(f, 0, y0 + 1.4), facePoint(f, -0.42, y0 + 0.95)];
      sink.prism('roof', [...pent].reverse(), [-ux, 0, -uz], 1.3, { colour: SLATE, decor: true });
      faceBox(sink, 'dark', f, 0, y0 + 0.55, 0.01, 0.42, 0.7, 0.02, DECOR);
      faceBox(sink, SW, f, 0, y0 + 0.55, 0.03, 0.05, 0.7, 0.03, { colour: st.timber, decor: true, fine: 'near' });
    }
    sink.cylinder('roof', [0, top - 0.06, 0], 'y', 0.35, R0 + 0.06, 8, { ...DECOR, shade: 0.7 }, R0 - 0.02, true, Math.PI / 8);
    finial(sink, 0, top + 14.4, 0, 1.6);
  });
  return sink.finish();
};

/**
 * The keep (Bergfried) on the castle rock: a square shaft of sandstone on its plinth, five stages, the high door a
 * storey up on its timber landing, slit lights and putlog holes, the corbel course and the steep hipped cap of
 * tiles over it, its finial. (The maps lane, 2026-10-15: Steinburg's castle, built as a set piece — a houseRow of
 * one, `structure: 'bergfried'` — so the rock carries a keep's mass, not the wall towers' 9 m.)
 */
const bergfried: RegionalBuilder = (ctx) => {
  const sink = new PartSink(houseUvOffset(ctx));
  const st = stateFor(ctx, ctx.rng);
  const rng = st.rng;
  const plotW = ctx.bounds.maxX - ctx.bounds.minX, plotD = ctx.bounds.maxZ - ctx.bounds.minZ;
  const S = Math.max(6, Math.min(9, Math.min(plotW, plotD) - 1.2));
  const sts: HouseSpec['storeys'] = [5.6, 5.0, 5.0, 4.8, 4.2].map((h) => ({ h, wall: 'stone' as RegionalBucket }));
  const openings: Opening[] = [{ face: 'front', storey: 1, kind: 'door', u: S * 0.18, w: 1.1, y0: 0.4, h: 2.2 }];
  for (const face of ['front', 'right', 'back', 'left'] as const) {
    for (const i of [2, 3]) openings.push({ face, storey: i, kind: 'window', u: (rng() - 0.5) * S * 0.3, w: 0.42, y0: 1.4, h: 1.3 });
    openings.push({ face, storey: 4, kind: 'window', u: 0, w: 0.8, y0: 1.2, h: 1.4 });
  }
  // (the steep hipped cap straight over the corbel course, as the wall tower's: a cap stood inside a parapet walk read
  // open from above — bld-integrity)
  const roof: RoofSpec = { kind: 'hip', pitchDeg: 62, eave: 0.4, verge: 0.4, thickness: 0.16, bucket: 'roof', ridge: 'round' };
  const frame = buildHouse(sink, {
    w: S, d: S, plinth: { h: 0.9, out: 0.22, bucket: 'stone' }, storeys: sts, roof,
    gableBucket: 'stone', openings, chimneys: [], gutters: null, verge: null, reveal: 0.6,
  }, {
    ...hessianDialect({ ...st, window: { ...st.window, shutters: null }, litShare: 0.03 }),
    door: (s2, face, o, y0) => doorUnit(s2, face, o.u, y0 + o.y0, o.w, o.h, {
      leaf: st.door, frame: { bucket: 'stone', width: 0.26, out: 0.12, arch: true }, steps: null, leafKind: 'plank',
    }, y0),
  });
  const b0 = frame.bodies[0];
  quoins(sink, b0.x0, b0.x1, b0.z0, b0.z1, 0.9, frame.eaveY - 0.2);
  for (const face of ['front', 'right', 'back', 'left'] as const) {
    // (the shaft is one plane to its eaves; no hole in an opening)
    const inOpen = (u: number, y: number) => frame.spec.openings.some((o) => o.face === face && Math.abs(u - o.u) < o.w / 2 + 0.15
      && y > frame.floors[o.storey] + o.y0 - 0.15 && y < frame.floors[o.storey] + o.y0 + o.h + 0.15);
    putlogs(sink, () => storeyFaces(frame, 0)[face], 1.8, frame.floors[4] - 0.4, 6, rng, inOpen);
    gunLoop(sink, storeyFaces(frame, 0)[face], (rng() - 0.5) * S * 0.3, 1.6, 1.0);
    // the corbel band under the eaves
    const f = storeyFaces(frame, 4)[face];
    trimRun(sink, 'stone', f, -f.width / 2, f.width / 2, frame.eaveY - 0.5, [{ h: 0.16, out: 0.08 }, { h: 0.18, out: 0.2 }, { h: 0.2, out: 0.32 }], { ret: 0.35 });
  }
  // the high door's timber landing on its two posts (dressing; the ladder up to it long drawn in)
  const front = frame.faces.front, du = S * 0.18, landY = frame.floors[1] + 0.4;
  const timber = { colour: st.timber, decor: true };
  faceBox(sink, SW, front, du, landY - 0.08, 0.55, 1.7, 0.16, 1.1, timber);
  for (const pu of [du - 0.7, du + 0.7]) faceBox(sink, SW, front, pu, (landY - 0.16) / 2, 0.95, 0.16, landY - 0.16, 0.16, timber);
  finial(sink, 0, frame.roof.ridgeTopY + 0.05, 0, 1.4);
  return sink.finish();
};

/**
 * The palace range (Palas) of the castle: a long hall of three storeys — the sandstone ground storey with its small
 * barred lights and arched door, the rendered upper storeys with dressed windows and quoins — under a steep half-hipped
 * tile roof with dormers and two stacks, an octagonal stair tower engaged in its court front. A set piece (a houseRow of
 * one, `structure: 'palas'`).
 */
const palas: RegionalBuilder = (ctx) => {
  const sink = new PartSink(houseUvOffset(ctx));
  const st = stateFor(ctx, ctx.rng);
  const plotW = ctx.bounds.maxX - ctx.bounds.minX, plotD = ctx.bounds.maxZ - ctx.bounds.minZ;
  // the range along the plot's x, its court front to +z: built eaves-fronted (along its own z) and turned a quarter
  const R = 1.6, L = Math.max(8, plotW - 0.9), D = Math.max(7, Math.min(12, plotD - 2 * R - 0.9));
  const render: RegionalBucket = 'plaster2';
  const sts: HouseSpec['storeys'] = [{ h: 4.0, wall: 'stone' }, { h: 3.4, wall: render }, { h: 3.2, wall: render }];
  // (in the build frame the long faces are 'left', the court front once turned, and 'right'; the gable ends 'front', 'back')
  const openings: Opening[] = [{ face: 'left', storey: 0, kind: 'door', u: L * 0.22, w: 1.5, y0: 0, h: 2.8 }];
  const n = Math.max(3, Math.round(L / 3.2));
  for (const face of ['left', 'right'] as const) {
    for (let i = 0; i < 3; i++) {
      for (let k = 0; k < n; k++) {
        const u = -L / 2 + (k + 0.5) * L / n;
        if (face === 'left' && (Math.abs(u) < R + 0.8 || (i === 0 && Math.abs(u - L * 0.22) < 1.4))) continue;
        openings.push({ face, storey: i, kind: 'window', u, w: i === 0 ? 0.7 : 1.0, y0: i === 0 ? 1.7 : 0.85, h: i === 0 ? 1.0 : 1.6 });
      }
    }
  }
  for (const face of ['front', 'back'] as const) for (const i of [1, 2]) for (const u of [-D * 0.22, D * 0.22]) openings.push({ face, storey: i, kind: 'window', u, w: 1.0, y0: 0.85, h: 1.6 });
  const roof: RoofSpec = { kind: 'halfhip', pitchDeg: 54, eave: 0.4, verge: 0.3, thickness: 0.18, bucket: 'roof', ridge: 'round', hipFrac: 0.4 };
  const cz = (ctx.bounds.maxZ + ctx.bounds.minZ) / 2 - R / 2;
  sink.placed(Math.PI / 2, 0, 0, cz, () => {
    const frame = buildHouse(sink, {
      w: D, d: L, plinth: { h: 0.6, out: 0.1, bucket: 'stone' }, storeys: sts, roof,
      openings, chimneys: [{ x: D * 0.15, z: -L * 0.3, sx: 0.7, sz: 0.7, above: 1.0, bucket: 'stone', cap: 'slab' }, { x: D * 0.15, z: L * 0.3, sx: 0.7, sz: 0.7, above: 1.0, bucket: 'stone', cap: 'slab' }],
      gutters: { colour: ZINC }, verge: null, reveal: 0.32,
    }, hessianDialect({ ...st, window: { ...st.window, shutters: null } }));
    const b1 = frame.bodies[1];
    quoins(sink, b1.x0, b1.x1, b1.z0, b1.z1, frame.floors[1], frame.eaveY - 0.1);
    const f = frame.faces.left;
    trimRun(sink, 'stone', f, -L / 2, L / 2, frame.floors[1] - 0.16, [{ h: 0.1, out: 0.06 }, { h: 0.16, out: 0.15 }], { ret: 0.4 });
    // the stair tower engaged in the court front, its slit lights climbing, its slated cap
    const tx = -(D / 2 + R * 0.55), H = frame.eaveY + 2.4;
    sink.cylinder('stone', [tx, -0.3, 0], 'y', H + 0.3, R, 8, {});
    // (the r2 sweep, 2026-10-16: the slit lights dark plates on the shaft) each cut into its dressed block, a hand proud
    for (let k = 0; k < 4; k++) gunLoop(sink, { origin: [tx - R, 0, 0], u: [0, 0, 1], out: [-1, 0, 0], width: 1 }, 0, 2.15 + k * 2.6, 0.9);
    sink.cylinder('roof', [tx, H - 0.05, 0], 'y', 3.6, R * 1.15, 8, { colour: SLATE }, 0.04);
    finial(sink, tx, H + 3.55, 0, 1.1);
  });
  return sink.finish();
};

/**
 * A stepped gable's parapet (Staffelgiebel; dome-detail-275) on a gable wall at local z = `zg` (its face turned `out`,
 * +1 or -1 along z) in a roof frame (ridge along z): `n` steps a side up the rakes from the eave to the ridge, each a block
 * of the wall's ashlar standing over the covering, the apex block over the ridge, an obelisk on each step. Dressing over
 * the gable wall the roof keeps the collision of. (The obelisks' pyramids open at the foot on their steps.)
 */
function steppedGable(sink: PartSink, rg: RoofGeometry, zg: number, out: 1 | -1, n: number, look: () => number): void {
  const s = rg.s, rise = rg.ridgeY - rg.eaveY, z0 = out > 0 ? zg - 0.34 : zg - 0.14, z1 = out > 0 ? zg + 0.14 : zg + 0.34;
  const step = s / (n + 0.5), lift = 0.55;
  for (const side of [-1, 1] as const) {
    for (let k = 0; k < n; k++) {
      const uo = s - k * step, ui = uo - step, yb = rg.eaveY + rise * (1 - uo / s) - 0.35, yt = rg.eaveY + rise * (1 - ui / s) + lift;
      const xa = side * uo, xb = side * ui;
      sink.span('stone', Math.min(xa, xb), yb, z0, Math.max(xa, xb), yt, z1, { decor: true, shade: 0.94 + look() * 0.08 });
      // the step's obelisk
      const xm = side * (uo - 0.22);
      sink.cylinder('stone', [xm, yt, (z0 + z1) / 2], 'y', 0.62, 0.13, 4, DECOR, 0.02, false, Math.PI / 4);
    }
  }
  const ua = step / 2, ya = rg.ridgeY + lift + 0.4;
  sink.span('stone', -ua, rg.ridgeY - 0.4, z0, ua, ya, z1, DECOR);
  sink.cylinder('stone', [0, ya, (z0 + z1) / 2], 'y', 0.9, 0.17, 4, DECOR, 0.02, false, Math.PI / 4);
}

/** A cornice across a gable at height y (its width the gable's there, less `inset`): a Renaissance gable's storeys. */
function gableCornice(sink: PartSink, rg: RoofGeometry, face: Face, y: number, inset = 0.15): void {
  const half = rg.s * (1 - (y - rg.eaveY) / (rg.ridgeY - rg.eaveY)) - inset;
  if (half > 0.4) trimRun(sink, 'stone', face, -half, half, y, [{ h: 0.08, out: 0.05 }, { h: 0.1, out: 0.12 }]);
}

/** A clock dial on a face (dome-detail-275): its stone ring, the painted face, the gilt hands at a time of its own. */
function clockDial(sink: PartSink, face: Face, u: number, y: number, r: number, look: () => number): void {
  faceBox(sink, 'stone', face, u, y, 0.04, 2 * r + 0.24, 2 * r + 0.24, 0.08, DECOR);
  faceBox(sink, SW, face, u, y, 0.09, 2 * r, 2 * r, 0.02, { colour: CLOCK, decor: true });
  const a = look() * Math.PI * 2, b = look() * Math.PI * 2;
  sink.member('structureMetal', facePoint(face, u, y, 0.1), facePoint(face, u + Math.cos(a) * r * 0.85, y + Math.sin(a) * r * 0.85, 0.1), 0.06, 0.015, face.out, { colour: GILT, decor: true, exposed: true });
  sink.member('structureMetal', facePoint(face, u, y, 0.115), facePoint(face, u + Math.cos(b) * r * 0.55, y + Math.sin(b) * r * 0.55, 0.115), 0.08, 0.015, face.out, { colour: GILT, decor: true, exposed: true });
}

/**
 * The town hall (Rathaus; dome-detail-275: Steinburg's civic hall was the base kit's bombed rotunda, 0.12x the town's
 * density, beside the kit's framed houses): a Franconian Renaissance Rathaus after Schweinfurt's and Ochsenfurt's — a long
 * range of three storeys on the market, the ground storey an arcade (the Laube, its arches glazed in) of dressed sandstone,
 * the two rendered upper storeys lit by cross-mullioned windows (Kreuzstockfenster) in sandstone surrounds under hoods,
 * string courses and the eaves cornice, big quoins; a steep roof of beavertails with its dormers, stepped gables at both
 * ends with an obelisk on each step and cornices across their storeys; the central Zwerchhaus rising through the eaves to
 * its own stepped gable, the arched main portal with the town's arms over it, a two-storey oriel (Erker) on its corbel,
 * the clock in its gable; the ridge turret (Dachreiter) with its clocks, its bell stage and spire; the market's setts
 * before it with its fountain, the walled court round its ends and back. The range and the Zwerchhaus are buildHouse
 * bodies (the kit's damage plan describes them); the court's walls, gate piers and the fountain's basin solid; the rest
 * dressing.
 */
const rathaus: RegionalBuilder = (ctx) => {
  const sink = new PartSink(houseUvOffset(ctx));
  const st = stateFor(ctx, ctx.rng);
  const look = ctx.variant;
  const plotW = ctx.bounds.maxX - ctx.bounds.minX, plotD = ctx.bounds.maxZ - ctx.bounds.minZ;
  const cx = (ctx.bounds.maxX + ctx.bounds.minX) / 2;
  const L = Math.max(16, Math.min(27, plotW - 4.5)), D = Math.max(9.5, Math.min(12.5, plotD - 9.5));
  const zc = ctx.bounds.minZ + 2.8 + D / 2, front = zc + D / 2;
  const render: RegionalBucket = ctx.wallBucket === 'stone' || ctx.wallBucket === 'plaster' ? 'plaster2' : ctx.wallBucket as RegionalBucket;
  const sts: HouseSpec['storeys'] = [{ h: 4.6, wall: 'stone' }, { h: 3.6, wall: render }, { h: 3.4, wall: render }];
  const ZW = Math.min(7, L * 0.28), ZP = 2.4;
  const cross: WindowStyle = {
    frame: rgb(0x3a3430), frameWidth: 0.06, frameOut: 0.03, bars: 'cross', shutters: null,
    surround: { bucket: 'stone', width: 0.2, out: 0.08 }, sill: { bucket: 'stone', out: 0.13 }, head: { kind: 'hood', bucket: 'stone', h: 0.2, out: 0.12, ext: 0.06 },
  };
  const plain: WindowStyle = { ...cross, surround: null, head: null };
  const arcade = (s: PartSink, face: Face, o: Opening, y0: number, leaf: Rgb, glazed: boolean) => {
    doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, {
      leaf, frame: { bucket: 'stone', width: 0.2, out: 0.08 }, steps: { bucket: 'stone', rise: 0.5, tread: 0.4 }, leafKind: glazed ? 'glazed' : 'panel',
    }, y0 + o.y0);
    archGlazing(s, face, o.u, y0 + o.y0 + o.h, o.w / 2, cross.frame);
    archHead(s, face, o.u, y0 + o.y0 + o.h, o.w / 2, 'stone', 0.26, 5);
  };
  const dialect: HouseDialect = {
    ...hessianDialect(st),
    // (the market front's and the Zwerchhaus's lights in their surrounds under hoods; the back's and the ends' plain in the
    // render, their sills dressed: the town hall's triangles go to its front)
    window: (s, face, o, y0) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, o.face === 'right' || o.face === 'front' || o.face === 'back'
      ? plain : cross, st.rng, 0.2),
    door: (s, face, o, y0) => arcade(s, face, o, y0, rgb(0x34403a), true),
  };
  // the range: built along its own z and turned a quarter, so its long front ('left' in its frame) faces the market (+z)
  const openings: Opening[] = [];
  const half = L / 2 - 1.5, bays = [ZW / 2 + 1.7, ZW / 2 + 4.9, ZW / 2 + 8.1, ZW / 2 + 11.3].filter((u) => u < half);
  for (const sd of [-1, 1]) for (const b of bays) {
    openings.push({ face: 'left', storey: 0, kind: 'door', u: sd * b, w: 2.3, y0: 0, h: 2.45, arch: { spring: 2.45 } });
    for (const i of [1, 2]) openings.push({ face: 'left', storey: i, kind: 'window', u: sd * b, w: 1.3, y0: 0.85, h: i === 1 ? 1.95 : 1.8 });
  }
  for (let k = 0, n = Math.max(3, Math.round(L / 6.5)); k < n; k++) {
    const u = -L / 2 + (k + 0.5) * L / n;
    if (k % 2) openings.push({ face: 'right', storey: 0, kind: 'window', u, w: 1.0, y0: 1.5, h: 1.5 });
    for (const i of [1, 2]) openings.push({ face: 'right', storey: i, kind: 'window', u, w: 1.2, y0: 0.85, h: 1.8 });
  }
  for (const face of ['front', 'back'] as const) {
    // (the ends' ground storeys blind behind the court walls)
    for (const u of [-D * 0.22, D * 0.22]) for (const i of [1, 2]) openings.push({ face, storey: i, kind: 'window', u, w: 1.2, y0: 0.85, h: 1.8 });
  }
  const roof: RoofSpec = { kind: 'gable', pitchDeg: 54, eave: 0.45, verge: 0.12, thickness: 0.18, bucket: 'roof', ridge: 'round' };
  sink.placed(Math.PI / 2, cx, 0, zc, () => {
    const frame = buildHouse(sink, {
      w: D, d: L, plinth: { h: 0.5, out: 0.1, bucket: 'stone' }, storeys: sts, roof, gableBucket: render, openings,
      chimneys: [{ x: D * 0.18, z: -L * 0.3, sx: 0.7, sz: 0.7, above: 0.9, bucket: 'stone', cap: 'slab' }, { x: D * 0.18, z: L * 0.3, sx: 0.7, sz: 0.7, above: 0.9, bucket: 'stone', cap: 'slab' }],
      gutters: { colour: ZINC }, verge: null, reveal: 0.36,
    }, dialect);
    const b1 = frame.bodies[0];
    // (the big quoins up the rendered storeys' corners on the market front, over the ashlar of the arcade; the back's plain)
    quoins(sink, b1.x0, b1.x1, b1.z0, b1.z1, frame.floors[1], frame.eaveY - 0.1, 0.7, (sx) => sx < 0);
    // the string courses at the floors and the eaves cornice round the range; the gables' stepped parapets and cornices
    for (const face of ['left', 'right', 'front', 'back'] as const) {
      const f = frame.faces[face], hw = f.width / 2;
      for (const i of [1, 2]) trimRun(sink, 'stone', f, -hw, hw, frame.floors[i] - 0.16, [{ h: 0.1, out: 0.06 }, { h: 0.14, out: 0.14 }], { ret: 0.4 });
      if (face === 'left' || face === 'right') trimRun(sink, 'stone', f, -hw, hw, frame.eaveY - 0.3, [{ h: 0.1, out: 0.06 }, { h: 0.1, out: 0.14 }, { h: 0.12, out: 0.24 }], { ret: 0.4 });
      else {
        trimRun(sink, 'stone', f, -hw, hw, frame.eaveY - 0.2, [{ h: 0.1, out: 0.06 }, { h: 0.12, out: 0.16 }], { ret: 0.4 });
        gableCornice(sink, frame.roof, f, frame.eaveY + (frame.roof.ridgeY - frame.eaveY) * 0.45);
      }
    }
    for (const end of [1, -1] as const) steppedGable(sink, frame.roof, end * L / 2, end, 5, look);
    // the dormers: two a side on the market's slope either side of the Zwerchhaus (the back slope its stacks)
    const dormer = (zs: number[], side: 1 | -1) => roofDormers(sink, frame.roof, [side], zs, {
      kind: 'gable', wall: render, covering: 'roof',
      window: (face, u, y, w, h) => windowUnit(sink, face, u, y, w, h, { ...cross, surround: null, head: null, sill: null }, look, 0.2),
    });
    dormer([-L * 0.36, -L * 0.22, L * 0.22, L * 0.36], -1);
    biberCourses(sink, frame.roof, roof, look, frame.roofPatch, [7, 6], 0.25, 0.64);
    // the ridge turret (Dachreiter): its square foot on the ridge, the octagonal clock stage, the open bell stage on its
    // posts, the spire and its gilt ball and vane
    const rt = frame.roof.ridgeTopY, rz = L * (look() < 0.5 ? 0.17 : -0.17), r = 0.95;
    sink.span(render, -r, rt - 1.3, rz - r, r, rt + 0.55, rz + r);
    sink.cylinder(render, [0, rt + 0.55, rz], 'y', 1.6, r, 8, {}, r, true, Math.PI / 8);
    // (its clocks to the market and to the back street)
    for (const ux of [1, -1] as const) {
      const uz = 0;
      const f: Face = { origin: [ux * r * Math.cos(Math.PI / 8), 0, rz + uz * r * Math.cos(Math.PI / 8)], u: [uz, 0, -ux], out: [ux, 0, uz], width: 0.8 };
      clockDial(sink, f, 0, rt + 1.35, 0.3, look);
    }
    sink.cylinder('stone', [0, rt + 2.15, rz], 'y', 0.18, r + 0.12, 8, DECOR, r + 0.12, true, Math.PI / 8);
    for (let k = 0; k < 8; k++) {
      const a = (k + 0.5) / 8 * Math.PI * 2, px = Math.cos(a) * (r - 0.12), pz = rz + Math.sin(a) * (r - 0.12);
      sink.span(SW, px - 0.08, rt + 2.33, pz - 0.08, px + 0.08, rt + 3.35, pz + 0.08, { colour: st.timber });
    }
    // the bell on its yoke between the posts: two beams across the stage, the bell's headstock between them
    const pz = (r - 0.12) * Math.sin(Math.PI / 8), px = (r - 0.12) * Math.cos(Math.PI / 8), yk = rt + 3.12, bronze = { colour: rgb(0x6a5a32), decor: true };
    for (const sg of [-1, 1]) sink.span(SW, -px, yk, rz + sg * pz - 0.06, px, yk + 0.12, rz + sg * pz + 0.06, { colour: st.timber, decor: true });
    sink.span(SW, -0.08, yk, rz - pz, 0.08, yk + 0.12, rz + pz, { colour: st.timber, decor: true });
    sink.revolve('structureMetal', [0, yk - 0.52, rz], 'y', [[0, 0.34], [0.12, 0.31], [0.32, 0.24], [0.48, 0.12], [0.52, 0]], 10, bronze);
    sink.cylinder('structureMetal', [0, yk - 0.54, rz], 'y', 0.03, 0.345, 10, bronze);
    sink.cylinder('roof', [0, rt + 3.33, rz], 'y', 0.2, r + 0.16, 8, { decor: true, shade: 0.8 }, r + 0.1, true, Math.PI / 8);
    sink.cylinder('roof', [0, rt + 3.5, rz], 'y', 4.2, r + 0.1, 8, { shade: 0.8 }, 0.04, true, Math.PI / 8);
    sink.revolve('structureMetal', [0, rt + 7.55, rz], 'y', [[0, 0.02], [0.06, 0.12], [0.2, 0.17], [0.34, 0.12], [0.42, 0.02]], 10, { colour: GILT, decor: true });
    finial(sink, 0, rt + 7.95, rz, 0.9);
  });
  // the Zwerchhaus: its front ZP out from the range, its body run back until its gable is buried in the range's roof
  // (both roofs at one pitch: the Zwerchhaus's ridge meets the range's slope ZW / 2 in from the range's front)
  const ZD = ZP + ZW / 2 + 0.6, zz = front + ZP - ZD / 2;
  const zOpen: Opening[] = [{ face: 'front', storey: 0, kind: 'door', u: 0, w: 1.9, y0: 0, h: 2.4, arch: { spring: 2.4 } }];
  for (const i of [1, 2]) for (const u of [-ZW * 0.27, ZW * 0.27]) zOpen.push({ face: 'front', storey: i, kind: 'window', u, w: 1.0, y0: 0.85, h: 1.8 });
  const zRoof: RoofSpec = { kind: 'gable', pitchDeg: 54, eave: 0.3, verge: 0.1, thickness: 0.18, bucket: 'roof', ridge: 'round' };
  sink.placed(0, cx, 0, zz, () => {
    const zf = buildHouse(sink, {
      w: ZW, d: ZD, plinth: { h: 0.5, out: 0.1, bucket: 'stone' }, storeys: sts, roof: zRoof, gableBucket: render, openings: zOpen,
      chimneys: [], gutters: null, verge: null, reveal: 0.4,
    }, {
      ...dialect, door: (s, face, o, y0) => arcade(s, face, o, y0, rgb(0x4a3020), false),
      window: (s, face, o, y0) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, cross, st.rng, 0.2),
    });
    const fz = zf.faces.front, b = zf.bodies[0];
    quoins(sink, b.x0, b.x1, b.z1 - ZP, b.z1, zf.floors[1], zf.eaveY - 0.1, 0.6, (_, sz) => sz > 0);
    for (const i of [1, 2]) trimRun(sink, 'stone', fz, -ZW / 2, ZW / 2, zf.floors[i] - 0.16, [{ h: 0.1, out: 0.06 }, { h: 0.14, out: 0.14 }], { ret: 0.4 });
    trimRun(sink, 'stone', fz, -ZW / 2, ZW / 2, zf.eaveY - 0.2, [{ h: 0.1, out: 0.06 }, { h: 0.12, out: 0.16 }], { ret: 0.4 });
    for (const t of [0.4, 0.72]) gableCornice(sink, zf.roof, fz, zf.eaveY + (zf.roof.ridgeY - zf.eaveY) * t);
    steppedGable(sink, zf.roof, ZD / 2, 1, 3, look);
    biberCourses(sink, zf.roof, zRoof, look, zf.roofPatch, [5, 3]);
    clockDial(sink, fz, 0, zf.eaveY + (zf.roof.ridgeY - zf.eaveY) * 0.52, 0.55, look);
    // the oriel (Erker) through the two upper storeys on its corbelled foot, its lights to the market, its lead cap
    const ew = 2.0, ed = 0.85, ey0 = zf.floors[1] - 0.35, ey1 = zf.eaveY - 0.5, oz = b.z1;
    for (let k = 0; k < 3; k++) {
      const w2 = ew * (0.4 + 0.6 * (k + 1) / 3), d2 = ed * (k + 1) / 3;
      sink.span('stone', -w2 / 2, ey0 - 0.66 + k * 0.22, oz - 0.05, w2 / 2, ey0 - 0.44 + k * 0.22, oz + d2, { decor: true, shade: 0.9 + k * 0.03 });
    }
    sink.span(render, -ew / 2, ey0, oz - 0.05, ew / 2, ey1, oz + ed);
    const of: Face = { origin: [0, 0, oz + ed], u: [1, 0, 0], out: [0, 0, 1], width: ew };
    for (const i of [1, 2]) {
      const y = zf.floors[i] + 0.75;
      windowUnit(sink, of, 0, y, 1.2, 1.6, cross, st.rng, 0.2);
      trimRun(sink, 'stone', of, -ew / 2, ew / 2, zf.floors[i] + 0.52, [{ h: 0.1, out: 0.06 }], { ret: 0.06 });
    }
    // the town's arms on the oriel's breast between its storeys: the shield on its cartouche under a little cornice
    const ay = zf.floors[2] - 0.12, ao = ed;
    faceBox(sink, 'stone', fz, 0, ay, ao + 0.05, 1.2, 0.85, 0.1, DECOR);
    faceBox(sink, 'stone', fz, 0, ay + 0.48, ao + 0.07, 1.36, 0.12, 0.14, { decor: true, shade: 0.88 });
    facing(sink, 'plaster', [facePoint(fz, -0.3, ay + 0.3, ao + 0.105), facePoint(fz, -0.3, ay - 0.06, ao + 0.105), facePoint(fz, 0, ay - 0.36, ao + 0.105),
      facePoint(fz, 0.3, ay - 0.06, ao + 0.105), facePoint(fz, 0.3, ay + 0.3, ao + 0.105)], fz.out, { decor: true, tint: [1.3, 0.55, 0.45] });
    faceBox(sink, 'plaster', fz, 0, ay + 0.02, ao + 0.11, 0.14, 0.42, 0.01, { decor: true, tint: [1.4, 1.35, 1.25] });
    sink.span('stone', -ew / 2 - 0.1, ey1, oz - 0.05, ew / 2 + 0.1, ey1 + 0.16, oz + ed + 0.1, DECOR);
    facing(sink, 'roof', [[-ew / 2 - 0.1, ey1 + 0.16, oz + ed + 0.1], [ew / 2 + 0.1, ey1 + 0.16, oz + ed + 0.1], [ew / 2 + 0.1, ey1 + 0.55, oz - 0.02], [-ew / 2 - 0.1, ey1 + 0.55, oz - 0.02]], [0, 1, 0.5], { decor: true, shade: 0.8 });
    for (const sd of [-1, 1]) facing(sink, 'roof', [[sd * (ew / 2 + 0.1), ey1 + 0.16, oz + ed + 0.1], [sd * (ew / 2 + 0.1), ey1 + 0.55, oz - 0.02], [sd * (ew / 2 + 0.1), ey1 + 0.16, oz - 0.02]], [sd, 0, 0], { decor: true, shade: 0.8 });
  });
  // the market's setts before the hall to the plot's edge, a worn kerb along it
  const sz1 = ctx.bounds.maxZ;
  sink.span('stone', cx - L / 2, -0.04, front + 0.05, cx + L / 2, 0.05, sz1, { decor: true, ground: true, shade: 0.84 });
  sink.span('stone', cx - L / 2, -0.04, sz1 - 0.3, cx + L / 2, 0.1, sz1, { decor: true, ground: true, shade: 0.76 });
  // (dome-detail-275, the coordinator's footprint rule: the base hall's colonnade and rotunda filled the plot, so the kit's
  // solid fills it too) the market fountain (Marktbrunnen) at the plot's front edge to one side of the portal: its
  // octagonal basin, the water, the column with its figure
  const fr = 1.5, fx = cx + (look() < 0.5 ? -1 : 1) * Math.min(L / 2 - 3, ZW / 2 + 4.2), fz = ctx.bounds.maxZ - 0.3 - fr;
  sink.cylinder('stone', [fx, -0.2, fz], 'y', 0.95, fr, 8, { shade: 0.92 }, fr, true, Math.PI / 8);
  facing(sink, 'dark', Array.from({ length: 8 }, (_, k): Vec3 => [fx + Math.cos((k + 0.5) * Math.PI / 4) * (fr - 0.16), 0.76, fz + Math.sin((k + 0.5) * Math.PI / 4) * (fr - 0.16)]), [0, 1, 0], DECOR);
  sink.cylinder('stone', [fx, 0.75, fz], 'y', 2.95, 0.24, 6, DECOR, 0.2, false);
  sink.span('stone', fx - 0.34, 3.7, fz - 0.34, fx + 0.34, 3.9, fz + 0.34, DECOR);
  sink.cylinder('stone', [fx, 3.9, fz], 'y', 1.0, 0.2, 6, DECOR, 0.13, false);
  sink.cylinder('stone', [fx, 4.9, fz], 'y', 0.24, 0.12, 6, DECOR, 0.1);
  // (dome-detail-275, the footprint rule) the walled court round the hall's ends and back: its sandstone walls under their
  // copings at the plot's edges, solid, closed toward the market by a gateway at each end, the piers on the range's
  // corners and the side walls, the plank gates between them
  const xL = ctx.bounds.minX + 0.2, xR = ctx.bounds.maxX - 0.2, zB = ctx.bounds.minZ + 0.2, t = 0.45, wh = 2.6, gz = front - 0.6;
  const coping = { decor: true, shade: 0.86 };
  sink.span('stone', xL, -0.3, zB, xR, wh, zB + t, { shade: 0.95 });
  sink.span('stone', xL - 0.06, wh, zB - 0.06, xR + 0.06, wh + 0.14, zB + t + 0.06, coping);
  for (const sd of [-1, 1] as const) {
    const xo = sd < 0 ? xL : xR, xi = cx + sd * L / 2;
    sink.span('stone', Math.min(xo, xo - sd * t), -0.3, zB + t, Math.max(xo, xo - sd * t), wh, gz - 0.3, { shade: 0.95 });
    sink.span('stone', Math.min(xo, xo - sd * t) - 0.06, wh, zB + t, Math.max(xo, xo - sd * t) + 0.06, wh + 0.14, gz - 0.3, coping);
    // the gateway: its two piers and their pyramid caps, the gate's two plank leaves shut between them
    for (const [p0, p1] of [[xo, xo - sd * 0.6], [xi + sd * 0.6, xi]] as const) {
      const a0 = Math.min(p0, p1), a1 = Math.max(p0, p1);
      sink.span('stone', a0, -0.3, gz - 0.3, a1, 3.0, gz + 0.3, { shade: 0.9 });
      sink.cylinder('stone', [(a0 + a1) / 2, 3.0, gz], 'y', 0.55, 0.42, 4, DECOR, 0.03, true, Math.PI / 4);
    }
    const g0 = Math.min(xo - sd * 0.6, xi + sd * 0.6), g1 = Math.max(xo - sd * 0.6, xi + sd * 0.6);
    sink.span(SW, g0, 0.05, gz - 0.05, g1, 2.3, gz + 0.05, { colour: shade(st.door, 0.85) });
    sink.span(SW, (g0 + g1) / 2 - 0.03, 0.05, gz + 0.05, (g0 + g1) / 2 + 0.03, 2.3, gz + 0.08, { colour: shade(st.door, 0.6), decor: true });
  }
  return sink.finish();
};

/**
 * The works office and its casting hall (dome-detail-275: Steinburg's foundry office was the base kit's sawtooth shed,
 * 0.20x the town's density): a Franconian ironworks' Hüttenkontor of about 1880 by the valley road — the office range of two
 * storeys, the sandstone ground storey with its arched door and the company's board over it, the rendered upper storey
 * with dressed windows, quoins and a cornice, a half-hipped roof of beavertails with dormers and two stacks — and behind
 * it the casting hall (Gießhalle): a tall sandstone shed lit by segment-headed windows between pilasters, its gable to
 * the yard with the big plank gate, the louvred lantern along its ridge and the cupola furnace's iron stack through the
 * roof with its spark cage; the moulding sand heaped by the gate and the iron flasks stacked against the wall.
 */
const huettenkontor: RegionalBuilder = (ctx) => {
  const sink = new PartSink(houseUvOffset(ctx));
  const st = stateFor(ctx, ctx.rng);
  const look = ctx.variant;
  const plotW = ctx.bounds.maxX - ctx.bounds.minX;
  const cx = (ctx.bounds.maxX + ctx.bounds.minX) / 2;
  const render: RegionalBucket = ctx.wallBucket === 'stone' || ctx.wallBucket === 'plaster' ? 'plaster2' : ctx.wallBucket as RegionalBucket;
  const OW = Math.max(9, Math.min(12, plotW - 1.4)), OD = 5.6, oz = ctx.bounds.maxZ - 0.8 - OD / 2;
  const segment = (w: number) => ({ kind: 'segment' as const, bucket: 'stone' as RegionalBucket, h: 0.26, out: 0.08, ext: 0.08, rise: w * 0.22 });
  const dressed: WindowStyle = {
    frame: rgb(0x2f3436), frameWidth: 0.06, frameOut: 0.03, bars: 'six', shutters: null,
    surround: { bucket: 'stone', width: 0.17, out: 0.07 }, sill: { bucket: 'stone', out: 0.12 }, head: { kind: 'hood', bucket: 'stone', h: 0.18, out: 0.1, ext: 0.05 },
  };
  const dialect: HouseDialect = {
    ...hessianDialect(st),
    window: (s, face, o, y0) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, o.h > 2.6 ? { ...dressed, head: segment(o.w), bars: 'six' } : dressed, st.rng, 0.25),
    door: (s, face, o, y0) => doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, {
      leaf: o.w > 2.5 ? rgb(0x3e3328) : rgb(0x3e4a44), frame: { bucket: 'stone', width: 0.3, out: 0.13, arch: true }, steps: o.w > 2.5 ? null : { bucket: 'stone' },
      leafKind: o.w > 2.5 ? 'plank' : 'panel', transom: o.w <= 2.5,
    }, y0),
  };
  // the office range, its front on the road (+z)
  const sts: HouseSpec['storeys'] = [{ h: 3.5, wall: 'stone' }, { h: 3.1, wall: render }];
  const oOpen: Opening[] = [{ face: 'front', storey: 0, kind: 'door', u: 0, w: 1.3, y0: 0, h: 2.5 }];
  for (const u of [-OW * 0.36, -OW * 0.17, OW * 0.17, OW * 0.36]) oOpen.push({ face: 'front', storey: 0, kind: 'window', u, w: 1.0, y0: 1.0, h: 1.65 });
  for (const u of [-OW * 0.36, -OW * 0.18, 0, OW * 0.18, OW * 0.36]) oOpen.push({ face: 'front', storey: 1, kind: 'window', u, w: 1.0, y0: 0.75, h: 1.6 });
  for (const face of ['left', 'right'] as const) for (const i of [0, 1]) oOpen.push({ face, storey: i, kind: 'window', u: 0, w: 0.95, y0: i ? 0.75 : 1.0, h: 1.6 });
  for (const u of [-OW * 0.36, OW * 0.36]) oOpen.push({ face: 'back', storey: 1, kind: 'window', u, w: 0.95, y0: 0.75, h: 1.5 });
  const oRoof: RoofSpec = { kind: 'halfhip', pitchDeg: 50, eave: 0.38, verge: 0.25, thickness: 0.16, bucket: 'roof', ridge: 'round', hipFrac: 0.4 };
  let officeTop = 0;
  sink.placed(Math.PI / 2, cx, 0, oz, () => {
    // (built along its own z and turned a quarter: its long front 'left' in its frame faces the road)
    const turned = oOpen.map((o): Opening => ({ ...o, face: o.face === 'front' ? 'left' : o.face === 'back' ? 'right' : o.face === 'left' ? 'back' : 'front' }));
    const frame = buildHouse(sink, {
      w: OD, d: OW, plinth: { h: 0.45, out: 0.08, bucket: 'stone' }, storeys: sts, roof: oRoof, gableBucket: render, openings: turned,
      chimneys: [{ x: 0.6, z: -OW * 0.27, sx: 0.55, sz: 0.6, above: 0.8, bucket: 'stone', cap: 'slab' }, { x: 0.6, z: OW * 0.27, sx: 0.55, sz: 0.6, above: 0.8, bucket: 'stone', cap: 'slab' }],
      gutters: { colour: ZINC }, verge: null, reveal: 0.3,
    }, dialect);
    officeTop = frame.eaveY;
    const b1 = frame.bodies[1];
    quoins(sink, b1.x0, b1.x1, b1.z0, b1.z1, frame.floors[1] + 0.05, frame.eaveY - 0.1);
    for (const face of ['left', 'right', 'front', 'back'] as const) {
      const f = frame.faces[face], hw = f.width / 2;
      trimRun(sink, 'stone', f, -hw, hw, frame.floors[1] - 0.16, [{ h: 0.1, out: 0.06 }, { h: 0.14, out: 0.14 }], { ret: 0.35 });
      trimRun(sink, 'stone', f, -hw, hw, frame.eaveY - 0.26, [{ h: 0.1, out: 0.06 }, { h: 0.08, out: 0.12 }, { h: 0.1, out: 0.2 }], { ret: 0.35 });
    }
    // the company's board over the door, its gilt letters on black; the door's lamp
    const fr = frame.faces.left;
    faceBox(sink, SW, fr, 0, frame.floors[1] - 0.55, 0.05, 3.2, 0.48, 0.06, { colour: rgb(0x1e2422), decor: true });
    faceBox(sink, SW, fr, 0, frame.floors[1] - 0.55, 0.085, 2.7, 0.16, 0.01, { colour: GILT, decor: true, fine: 'near' });
    sink.member('structureMetal', facePoint(fr, 1.05, 2.9, 0), facePoint(fr, 1.05, 2.9, 0.42), 0.04, 0.04, fr.u, { colour: IRON, decor: true, exposed: true });
    faceBox(sink, 'structureMetal', fr, 1.05, 2.72, 0.42, 0.2, 0.3, 0.2, { colour: rgb(0x2c3a32), decor: true });
    roofDormers(sink, frame.roof, [-1], [-OW * 0.22, OW * 0.22], {
      kind: 'shed', wall: render, covering: 'roof',
      window: (face, u, y, w, h) => windowUnit(sink, face, u, y, w, h, { ...dressed, surround: null, head: null, sill: null, bars: 'cross' }, look, 0.2),
    });
    biberCourses(sink, frame.roof, oRoof, look, frame.roofPatch, [3, 3]);
  });
  // the casting hall behind, its front run in under the office's roof
  // ((dome-detail-275, the footprint rule) the hall run back to within a hand of the plot's back edge)
  const HW = Math.max(8, Math.min(10.5, plotW - 3)), hBack = ctx.bounds.minZ + 0.32, hFront = oz - OD / 2;
  const hRoof: RoofSpec = { kind: 'gable', pitchDeg: 32, eave: 0.4, verge: 0.3, thickness: 0.15, bucket: 'roof', ridge: 'round' };
  const hEave = 0.4 + 5.6, hRidge = hEave + (HW / 2) * Math.tan(32 * Math.PI / 180) + 0.3;
  const bury = Math.max(0.5, Math.min(OD - 1, (hRidge - officeTop) / Math.tan(50 * Math.PI / 180) + 0.4));
  const HD = hFront + bury - hBack, hz = (hFront + bury + hBack) / 2, open = hFront - hBack;
  const hOpen: Opening[] = [{ face: 'back', storey: 0, kind: 'door', u: -HW * 0.12, w: 3.2, y0: 0, h: 3.8 }, { face: 'back', storey: 0, kind: 'door', u: HW * 0.33, w: 1.0, y0: 0, h: 2.2 }];
  const hBays = Math.max(2, Math.round(open / 2.6));
  for (const face of ['left', 'right'] as const) for (let k = 0; k < hBays; k++) {
    // (along the exposed length only: the hall's back end at -HD/2 in its frame)
    const u = -HD / 2 + (k + 0.5) * open / hBays;
    hOpen.push({ face, storey: 0, kind: 'window', u: face === 'right' ? -u : u, w: 1.4, y0: 1.2, h: 3.2 });
  }
  sink.placed(0, cx, 0, hz, () => {
    const frame = buildHouse(sink, {
      w: HW, d: HD, plinth: { h: 0.4, out: 0.06, bucket: 'stone' }, storeys: [{ h: 5.6, wall: 'stone' }], roof: hRoof, gableBucket: 'stone',
      openings: hOpen, chimneys: [], gutters: { colour: ZINC }, verge: null, reveal: 0.34,
    }, dialect);
    for (const face of ['left', 'right'] as const) {
      const f = frame.faces[face], sg = face === 'right' ? -1 : 1;
      for (let k = 0; k <= hBays; k++) {
        const u = sg * (-HD / 2 + k * open / hBays);
        faceBox(sink, 'stone', f, u, 0.4 + (frame.eaveY - 0.6) / 2, 0.05, 0.4, frame.eaveY - 0.6, 0.1, DECOR);
      }
      trimRun(sink, 'stone', f, -HD / 2, HD / 2, frame.eaveY - 0.26, [{ h: 0.1, out: 0.06 }, { h: 0.14, out: 0.16 }], { ret: 0.3 });
      anchor(sink, f, sg * (-HD / 2 + open / 2), 4.4);
    }
    const fb = frame.faces.back;
    trimRun(sink, 'stone', fb, -HW / 2, HW / 2, frame.eaveY - 0.24, [{ h: 0.1, out: 0.06 }, { h: 0.14, out: 0.16 }], { ret: 0.3 });
    for (const u of [-HW / 2 + 0.7, HW / 2 - 0.7]) anchor(sink, fb, u, 4.6);
    // the louvred vent in the yard gable
    const gy = frame.eaveY + (frame.roof.ridgeY - frame.eaveY) * 0.4;
    faceBox(sink, 'dark', fb, 0, gy, 0.01, 1.1, 0.9, 0.02, DECOR);
    for (let k = 0; k < 4; k++) faceBox(sink, SW, fb, 0, gy - 0.33 + k * 0.22, 0.05, 1.1, 0.06, 0.07, { colour: rgb(0x40403c), decor: true });
    faceBox(sink, 'stone', fb, 0, gy, 0.03, 1.4, 1.2, 0.04, { decor: true, shade: 0.9 });
    // the ridge lantern along the exposed run, its louvres and its little roof
    const rg = frame.roof, ly = rg.ridgeTopY - 0.05, l0 = -HD / 2 + 0.8, l1 = -HD / 2 + open - 0.6;
    sink.span('stone', -0.6, ly - 0.25 - 0.6 * rg.tanP, l0, 0.6, ly + 0.5, l1);
    for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) {
      sink.span(SW, sx * 0.61 - 0.02, ly + k * 0.15, l0 + 0.15, sx * 0.61 + 0.02, ly + k * 0.15 + 0.06, l1 - 0.15, { colour: rgb(0x40403c), decor: true });
    }
    const cap: RoofSpec = { kind: 'gable', pitchDeg: 28, eave: 0.22, verge: 0.18, thickness: 0.1, bucket: 'roof', ridge: 'round' };
    sink.placed(0, 0, 0, (l0 + l1) / 2, () => emitRoof(sink, roofGeometry(1.2, l1 - l0, ly + 0.5, cap), cap));
    biberCourses(sink, rg, hRoof, look, frame.roofPatch, [4, 3], 0.7);
    // the cupola furnace's stack through the left slope: its collar on the tiles, the iron shell in its hoops, the spark
    // cage on top
    const fx = -HW * 0.22, fz = -HD / 2 + open * 0.3, fy = rg.topAt(fx, fz) ?? ly, iron = rgb(0x4a3c34);
    sink.cylinder('structureMetal', [fx, fy - 0.4, fz], 'y', 0.75, 0.62, 12, { colour: shade(iron, 0.8) }, 0.5);
    sink.cylinder('structureMetal', [fx, fy - 0.2, fz], 'y', rg.ridgeTopY - fy + 4.2, 0.42, 12, { colour: iron });
    const sTop = rg.ridgeTopY + 4.0;
    for (const y of [fy + 1.3, fy + 2.8, sTop - 1.2]) sink.cylinder('structureMetal', [fx, y, fz], 'y', 0.1, 0.445, 12, { colour: IRON, decor: true }, 0.445, false);
    sink.cylinder('structureMetal', [fx, sTop - 0.05, fz], 'y', 0.9, 0.44, 12, { colour: IRON, decor: true }, 0.72, false);
    sink.cylinder('structureMetal', [fx, sTop + 0.85, fz], 'y', 0.5, 0.72, 12, { colour: shade(IRON, 0.8), decor: true }, 0.08);
  });
  // the yard: the moulding sand by the gate, the flasks stacked against the hall, a pile of pig iron
  const sx = cx - HW / 2 - 0.1, sand = { decor: true, tint: [1.12, 0.98, 0.72] as Rgb, shade: 0.9 };
  if (ctx.bounds.minX < sx - 0.9) sink.cylinder('stone', [sx - 0.55, -0.1, hBack + 1.4], 'y', 0.85, 0.75, 12, sand, 0.08);
  const fx = cx + HW / 2 + 0.05;
  for (let k = 0, z = hBack + 0.6; k < 3 && fx + 0.9 < ctx.bounds.maxX + 0.5; k++, z += 1.35) {
    const n = 1 + Math.floor(look() * 3);
    for (let j = 0; j < n; j++) sink.span('structureMetal', fx, j * 0.42, z, fx + 0.85, j * 0.42 + 0.4, z + 1.1, { colour: shade(rgb(0x5a4a3e), 0.8 + look() * 0.3), decor: true });
  }
  for (let j = 0; j < 3; j++) sink.span('structureMetal', cx - HW / 2 - 1.25 + j * 0.06, j * 0.12, hBack + 2.6 + j * 0.05, cx - HW / 2 - 0.15, j * 0.12 + 0.12, hBack + 3.0 - j * 0.05, { colour: rgb(0x3a3230), decor: true });
  return sink.finish();
};

/** The kit's civic builders, by plan structure id (franconian.ts binds them to its palette). */
export const FRANCONIAN_CIVIC: Readonly<Record<string, RegionalBuilder>> = Object.freeze({
  tower: mauerturm, chapel: kapelle, firestation: feuerwache, factory: fabrik,
  // (the maps lane, 2026-10-15) the town church: the sandstone hall church with its west tower, in place of the framed
  // village church the Fachwerk kit drew
  church: stadtkirche,
  // (the maps lane, 2026-10-15) the castle's keep and palace range, set pieces on the castle rock (houseRow `structure`)
  bergfried, palas,
  // (dome-detail-275) the town hall and the works office, which the base kit drew (its bombed rotunda, its sawtooth shed)
  civichall: rathaus, foundryoffice: huettenkontor,
});
export type { RegionalParts, RegionalBuildContext, Vec3, Rgb };
void shade; void IRON; void SLATE;
