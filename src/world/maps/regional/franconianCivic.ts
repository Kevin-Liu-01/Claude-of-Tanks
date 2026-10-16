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
import { PartSink, faceBox, rgb, shade, type Face, type RegionalBucket, type RegionalParts, type Rgb, type Vec3 } from './geometry.ts';
import { buildHouse, emitRoof, roofGeometry, storeyFaces, type FaceName, type HouseDialect, type HouseSpec, type Opening, type RoofSpec } from './house.ts';
import { dressedQuoin, facadeOn, trimRun, windowHead } from './facade.ts';
import { doorUnit, windowUnit } from './openings.ts';
import { hessianDialect, houseUvOffset, stateFor } from './hessian.ts';
import type { RegionalBuildContext, RegionalBuilder } from './types.ts';

const SW: RegionalBucket = 'structureWood';
const DECOR = { decor: true } as const;
const IRON = rgb(0x2a2b2c), SLATE = rgb(0x4a4f55), ENGINE = rgb(0x6a2a24), ZINC = rgb(0x8c9193), CLOCK = rgb(0xd8d2c2), GILT = rgb(0xc8a04a);

/** Quoins up every corner of a body from y0 to y1: long and short dressed stones by turns (34 cm courses). */
function quoins(sink: PartSink, x0: number, x1: number, z0: number, z1: number, y0: number, y1: number): void {
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]] as const) {
    const x = sx > 0 ? x1 : x0, z = sz > 0 ? z1 : z0;
    for (let y = y0, k = 0; y + 0.33 <= y1 + 0.01; y += 0.35, k++) {
      const lx = k % 2 ? 0.3 : 0.52, lz = k % 2 ? 0.52 : 0.3;
      dressedQuoin(sink, 'stone', sx > 0 ? x - lx : x - 0.035, y, sz > 0 ? z - lz : z - 0.035, sx > 0 ? x + 0.035 : x + lx, y + 0.33,
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
    const tf = buildHouse(sink, {
      w: T, d: T, plinth: { h: 0.4, out: 0.06, bucket: 'stone' }, storeys: tSts,
      roof: { kind: 'hip', pitchDeg: 58, eave: 0.45, verge: 0.45, thickness: 0.14, bucket: 'roof', ridge: 'round' },
      openings: tOpen, chimneys: [], gutters: null, verge: null, reveal: 0.25,
    }, tDialect);
    const tb = tf.bodies[1];
    quoins(sink, tb.x0, tb.x1, tb.z0, tb.z1, 4.4, tf.floors[3] - 0.1);
    // the clock under the drying stage on the street face, its hands gilded
    const fc = storeyFaces(tf, 2).front;
    faceBox(sink, SW, fc, 0, tf.floors[3] - 0.95, 0.03, 0.85, 0.85, 0.04, { colour: CLOCK, decor: true });
    faceBox(sink, SW, fc, 0, tf.floors[3] - 0.95 + 0.2, 0.06, 0.05, 0.36, 0.01, { colour: GILT, decor: true });
    finial(sink, 0, tf.roof.ridgeTopY + 0.05, 0, 1.1);
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
      openings.push({ face, storey: 0, kind: 'window', u, w: 1.3, y0: 1.0, h: 2.4 });
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
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: 0.5, out: 0.08, bucket: 'stone' }, storeys: sts,
      roof: { kind: 'gable', pitchDeg: 38, eave: 0.4, verge: 0.3, thickness: 0.17, bucket: 'roof', ridge: 'round' },
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
    const rg = frame.roof, ly = rg.ridgeTopY - 0.05, len = D * 0.6;
    sink.span('stone', -0.75, ly - 0.25, -len / 2, 0.75, ly + 0.55, len / 2);
    for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) {
      sink.span(SW, sx * 0.76 - 0.02, ly + k * 0.16, -len / 2 + 0.2, sx * 0.76 + 0.02, ly + k * 0.16 + 0.06, len / 2 - 0.2, { colour: rgb(0x40403c), decor: true });
    }
    const cap: RoofSpec = { kind: 'gable', pitchDeg: 30, eave: 0.25, verge: 0.2, thickness: 0.1, bucket: 'roof', ridge: 'round' };
    sink.placed(0, 0, 0, 0, () => emitRoof(sink, roofGeometry(1.5, len, ly + 0.55, cap), cap));
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
      for (const u of [-D * 0.36, -D * 0.12, D * 0.12, D * 0.36]) openings.push({ face, storey: 0, kind: 'window', u, w: 1.3, y0: 2.5, h: 4.5 });
    }
    openings.push({ face: 'back', storey: 0, kind: 'window', u: 0, w: 1.6, y0: 2.7, h: 4.4 });
    const roof: RoofSpec = { kind: 'halfhip', pitchDeg: 56, eave: 0.4, verge: 0.25, thickness: 0.18, bucket: 'roof', ridge: 'round', hipFrac: 0.5 };
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: 0.6, out: 0.12, bucket: 'stone' }, storeys: [{ h: wallH, wall: 'stone' }], roof,
      gableBucket: 'stone', openings, chimneys: [], gutters: { colour: ZINC }, verge: null, reveal: 0.42,
    }, sandstone);
    for (const face of ['right', 'left'] as const) {
      const f = frame.faces[face];
      buttresses(sink, f, [-D / 2 + 0.45, -D * 0.24, 0, D * 0.24, D / 2 - 0.45], wallH);
      trimRun(sink, 'stone', f, -D / 2, D / 2, wallH + 0.6 - 0.26, [{ h: 0.1, out: 0.06 }, { h: 0.16, out: 0.16 }], { ret: 0.3 });
    }
    const b = frame.faces.back;
    buttresses(sink, b, [-W / 2 + 0.45, W / 2 - 0.45], wallH);
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
    sink.cylinder('roof', [0, top - 0.05, 0], 'y', 14.5, T * 0.43, 8, { colour: SLATE }, 0.05);
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

/** The kit's civic builders, by plan structure id (franconian.ts binds them to its palette). */
export const FRANCONIAN_CIVIC: Readonly<Record<string, RegionalBuilder>> = Object.freeze({
  tower: mauerturm, chapel: kapelle, firestation: feuerwache, factory: fabrik,
  // (the maps lane, 2026-10-15) the town church: the sandstone hall church with its west tower, in place of the framed
  // village church the Fachwerk kit drew
  church: stadtkirche,
  // (the maps lane, 2026-10-15) the castle's keep and palace range, set pieces on the castle rock (houseRow `structure`)
  bergfried, palas,
});
export type { RegionalParts, RegionalBuildContext, Vec3, Rgb };
void shade; void IRON; void SLATE;
