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
const IRON = rgb(0x2a2b2c), SLATE = rgb(0x4a4f55), ENGINE = rgb(0x6a2a24), ZINC = rgb(0x8c9193), CLOCK = rgb(0xd8d2c2);

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

/** A keyhole gun loop (Schlüsselscharte) on a face from y up h: the slit, its round sighting hole at the foot, the
 *  dressed block it is cut in (drawn on the solid wall: a loop is a hand's breadth, never a hole through the shaft). */
function gunLoop(sink: PartSink, face: Face, u: number, y: number, h: number): void {
  faceBox(sink, 'stone', face, u, y + h / 2, 0.015, 0.46, h + 0.24, 0.05, DECOR);
  faceBox(sink, 'dark', face, u, y + h / 2 + 0.1, 0.045, 0.07, h - 0.2, 0.01, DECOR);
  faceBox(sink, 'dark', face, u, y + 0.1, 0.045, 0.2, 0.2, 0.01, DECOR);
}

/** The putlog holes the scaffold left: small dark squares in rows up a face. */
function putlogs(sink: PartSink, face: Face, y0: number, y1: number, rows: number, rng: () => number): void {
  const half = face.width / 2 - 0.45;
  for (let r = 0; r < rows; r++) {
    const y = y0 + (r + 0.5) * (y1 - y0) / rows;
    for (let u = -half; u <= half + 1e-6; u += Math.max(0.9, (2 * half) / 3)) {
      if (rng() < 0.25) continue;
      faceBox(sink, 'dark', face, u + (rng() - 0.5) * 0.12, y, 0.004, 0.13, 0.13, 0.01, DECOR);
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
  for (const face of ['front', 'right', 'back', 'left'] as const) putlogs(sink, storeyFaces(frame, 0)[face], 1.6, stoneTop - 0.3, 3, rng);
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
    const top = frame.roof.ridgeTopY;
    sink.span('stone', -0.06, top - 0.1, D / 2 + 0.05, 0.06, top + 0.75, D / 2 + 0.17, DECOR);
    sink.span('stone', -0.26, top + 0.38, D / 2 + 0.05, 0.26, top + 0.5, D / 2 + 0.17, DECOR);
  }
  // the ridge turret: a slated square stage with its bell openings, its spire and finial, a third of the way back
  const rg = frame.roof, z = rg.halfD * 0.42;
  const ridge = rg.topAt(0, z) ?? rg.ridgeTopY, s = 0.55;
  const low = (rg.topAt(s, z) ?? ridge) - 0.1;
  sink.span(st.infill, -s, low, z - s, s, ridge + 1.3, z + s);
  for (const [face, sgn] of [[0, 1], [0, -1], [1, 1], [1, -1]] as const) {
    const f: Face = face === 0
      ? { origin: [0, 0, z + sgn * s], u: [sgn, 0, 0], out: [0, 0, sgn], width: 2 * s }
      : { origin: [sgn * s, 0, z], u: [0, 0, -sgn], out: [sgn, 0, 0], width: 2 * s };
    faceBox(sink, 'dark', f, 0, ridge + 0.45, 0.005, 0.34, 0.62, 0.01, DECOR);
    faceBox(sink, SW, f, 0, ridge + 0.4, 0.03, 0.42, 0.06, 0.04, { colour: st.timber, decor: true });
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
    const tf = buildHouse(sink, {
      w: T, d: T, plinth: { h: 0.4, out: 0.06, bucket: 'stone' }, storeys: tSts,
      roof: { kind: 'hip', pitchDeg: 58, eave: 0.45, verge: 0.45, thickness: 0.14, bucket: 'roof', ridge: 'round' },
      openings: tOpen, chimneys: [], gutters: null, verge: null, reveal: 0.25,
    }, dialect);
    const tb = tf.bodies[1];
    quoins(sink, tb.x0, tb.x1, tb.z0, tb.z1, 4.4, tf.floors[3] - 0.1);
    // the louvred drying stage: slats across each face of the framed top, the clock under it on the street face
    for (const face of ['front', 'right', 'back', 'left'] as const) {
      const f = storeyFaces(tf, 3)[face];
      for (let k = 0; k < 6; k++) faceBox(sink, SW, f, 0, tf.floors[3] + 0.3 + k * 0.26, 0.04, T - 0.9, 0.06, 0.07, { colour: st.timber, decor: true });
      faceBox(sink, 'dark', f, 0, tf.floors[3] + 0.25, 0.005, T - 0.9, 1.55, 0.01, DECOR);
    }
    const fc = storeyFaces(tf, 2).front;
    faceBox(sink, SW, fc, 0, tf.floors[3] - 0.95, 0.03, 0.85, 0.85, 0.04, { colour: CLOCK, decor: true });
    faceBox(sink, 'dark', fc, 0, tf.floors[3] - 0.95 + 0.2, 0.06, 0.05, 0.36, 0.01, DECOR);
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
      const front = frame.faces.front, gy = frame.eaveY + (frame.roof.ridgeY - frame.eaveY) * 0.42;
      faceBox(sink, 'stone', front, 0, gy - 0.55, 0.02, 1.3, 1.3, 0.08, DECOR);
      faceBox(sink, 'dark', front, 0, gy - 0.4, 0.07, 1.0, 1.0, 0.01, DECOR);
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

/** The kit's civic builders, by plan structure id (franconian.ts binds them to its palette). */
export const FRANCONIAN_CIVIC: Readonly<Record<string, RegionalBuilder>> = Object.freeze({
  tower: mauerturm, chapel: kapelle, firestation: feuerwache, factory: fabrik,
});
export type { RegionalParts, RegionalBuildContext, Vec3, Rgb };
void shade; void IRON; void SLATE;
