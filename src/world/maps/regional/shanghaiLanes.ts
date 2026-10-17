// src/world/maps/regional/shanghaiLanes.ts — the Shanghai kit's dwelling rows (shanghai.ts rowhouse): the shikumen terraces
// of the lilong lanes and the Chinese shophouse rows, rebuilt through the house grammar (the looks lane, release 227,
// "lift the Shanghai kit"; WORKPLAN-227 §5 step 4). The 10-16 census scored the kit 5 of Verdant's 20 elements: its rows
// were walls and boxes beside the grammar, so nothing the grammar gives a Verdant house (a plinth and its water table,
// the eave's rain shadow, the sill runs, the foot's grime, ridge caps, chimneys, gutters, rafter feet, door steps, the
// war's burnt and boarded openings) reached them. Built the way Verdant's houses are, region-true for the lanes of 1937:
//   - each house body is one buildHouse turned a quarter round, its ridge along the row: the shikumen's house behind its
//     court and its back wing (the kitchen, the pavilion room over it, the drying terrace on its roof), the shophouse's
//     dwelling over its shops (its upper storeys oversail the shop rooms as a jetty, the rooms under them as before);
//   - a granite plinth under every body with its water table and a tarred wash over it; the openings cut in their
//     reveals: the shikumen's casements in a surround under a red-brick arch (a stucco lintel on the whitewashed lanes),
//     their louvred shutters (the Settlement's later lanes most of all); the back doors up their granite steps;
//   - the saddle ridge capped under the raised Jiangnan ridge; the kitchen stacks (the shikumen's on the back wing's
//     terrace, the shophouse's through its back slope); iron gutters and downpipes on the shikumen (a shophouse's tiled
//     eave drips to the street over its rafter feet); the shophouse's pent roof over its shops;
//   - the lived-in dressing (facade craft, desktop, from the facade stream): the washing on its iron racks off the back
//     windows, pots in the tianjing and on the drying terrace.
// What the region never had is not built: no verge boards (the gables are brick fire walls), no window boxes. The
// horse-head walls, the gate pediments and the tiger windows stay the kit's own (the shared dormer, 1.3 m by 1.25 m, would
// stand over a lane house's ridge).
import { LocalFrame, PartSink, faceBox, facePanel, facePoint, rgb, shade, type Face, type RegionalBucket, type RegionalParts, type Rgb } from './geometry.ts';
import {
  DAMP_EDGE_BREAKS, buildHouse, holedPolygon, leanTo, recordBody, type HoleRect, type HouseDialect, type HouseFrame, type HouseSpec, type Opening,
  type RoofSpec, type StoreySpec,
} from './house.ts';
import { doorUnit, openShop, windowUnit, type DoorStyle, type WindowStyle } from './openings.ts';
import { facadeOn, facadeRng, paintBand, plinthPaint, type HeadStyle } from './facade.ts';
import { pottedPlant, washingLine } from './dressing.ts';
import type { RegionalBuildContext } from './types.ts';
import {
  AWNINGS, CASEMENT, CHAR, GILT, LACQUER, RED_BRICK, SIGN_BOARDS, TEAK, TILE_COPING, archOutline, brickBands, breach, choose, clampTo,
  horseHeadWall, lantern, nameBoard, pocks, raisedRidge, roofHole, rowFill, sandbags, signboard, soot, uvOffset, type Bank,
} from './shanghaiParts.ts';

const DEC = { decor: true } as const;
const SHADOWED = { decor: true, shadow: true } as const;
/** A Zhabei shop's goods on its shelves: bolts of cloth, tea and rice sacks, lacquer boxes, crocks. */
const SHOP_GOODS: readonly Rgb[] = [0x8a3a2e, 0x2f4f6a, 0xb08a4a, 0xd8cfb8, 0x4a5a3a, 0x6a4a6a, 0x9a7a3a, 0x3a3634].map(rgb);
/** The granite of the plinths, the gate frames, the sills and the steps: the kit's pale grey render family (plaster3). */
const GRANITE: RegionalBucket = 'plaster3';
/** The plinth every row's house stands on: a granite course a hand over a foot high. */
const PLINTH = 0.3;
/** The tar and soot-black limewash over a plinth's granite (the lanes' wet feet): a multiplier on its render. */
const TARRED: Rgb = [0.58, 0.56, 0.54];
/** The grey wash of a whitewashed lane's dado over its granite foot (a multiplier on the render). */
const DADO: Rgb = [0.74, 0.74, 0.72];
/** The iron of the gutters, downpipes and washing racks. */
const GUTTER = rgb(0x34383a);
/** The louvred shutters' paints in the lanes: a dark green, a brown, an oxblood, a grey. */
const SHUTTER_PAINTS: readonly Rgb[] = [0x3b5646, 0x4f3626, 0x5e2b24, 0x45494b].map(rgb);

/**
 * Build `body` in a house frame turned a quarter round, so the house grammar's ridge (its local z) runs along the row's
 * x: the house's 'left' face is the row's front (+z, its u along +x), 'right' the row's back (its u along -x), 'front' and
 * 'back' the row's two ends (+x, -x).
 */
function along<T>(sink: PartSink, y: number, zc: number, body: () => T): T {
  let out!: T;
  sink.placed(Math.PI / 2, 0, y, zc, () => { out = body(); });
  return out;
}

/** The tarred wash over a body's plinth (facade craft, desktop; facade.ts plinthPaint), in the house's own frame. */
function plinthWash(sink: PartSink, spec: HouseSpec): void {
  if (!facadeOn() || !spec.plinth) return;
  plinthPaint(sink, spec.plinth.bucket, [spec.w / 2, spec.d / 2], spec.plinth.out, -0.6, spec.plinth.h, TARRED);
}

// ------------------------------------------------------------------------------------------------ shikumen

type Pediment = 'triangle' | 'arch' | 'flat';

/** A shikumen's gate: the granite frame, the black lacquer leaves (one ajar now and then), the carved pediment, its step. */
function shikumenGate(sink: PartSink, face: Face, u: number, gw: number, gh: number, ped: Pediment, look: () => number, burnt: boolean, wallT = 0): void {
  // (props census #29, lane B 2026-10-15; the judges: "the shikumen gate a dark panel with leaf boxes laid on it") the gate
  // a doorway cut through the court wall (`wallT` deep), its lacquer leaves hung at the back of it, one ajar now and then
  // swung in to the court; laid on a wall without a cut (wallT 0), the dark of the old panel behind them
  if (wallT <= 0) facePanel(sink, 'dark', face, u, gh / 2, 0.006, gw, gh, DEC);
  const lo = wallT > 0 ? -wallT + 0.04 : 0.03;
  const ajar = look() < 0.22;
  for (const side of [-1, 1]) {
    const lu = u + side * gw / 4;
    if (burnt) { faceBox(sink, 'structureWood', face, lu, gh / 2, lo, gw / 2 - 0.03, gh - 0.05, 0.05, { colour: CHAR, decor: true }); continue; }
    if (ajar && side > 0) {
      if (wallT <= 0) continue;
      // swung in on its hinge at the jamb, three-quarters open
      const lw = gw / 2 - 0.03, a = 1.2, hx = u + gw / 2, ca = Math.cos(a), sa = Math.sin(a);
      const ux = face.u, ox = face.out;
      const axis: [number, number, number] = [-ux[0] * ca - ox[0] * sa, 0, -ux[2] * ca - ox[2] * sa];
      const hinge = facePoint(face, hx, gh / 2, -wallT + 0.02);
      const c: [number, number, number] = [hinge[0] + axis[0] * lw / 2, hinge[1], hinge[2] + axis[2] * lw / 2];
      sink.box('structureWood', c, [lw / 2, (gh - 0.05) / 2, 0.025], { colour: LACQUER, decor: true }, new LocalFrame(axis, [0, 1, 0], [-axis[2], 0, axis[0]], [0, 0, 0]));
      continue;
    }
    faceBox(sink, 'structureWood', face, lu, gh / 2, lo, gw / 2 - 0.03, gh - 0.05, 0.05, { colour: LACQUER, decor: true, fineSides: true });
    faceBox(sink, 'structureMetal', face, u + side * 0.13, 1.3, lo + 0.04, 0.1, 0.1, 0.03, { colour: GILT, decor: true, fine: true });
  }
  const sf = { decor: true, fineSides: true };
  for (const side of [-1, 1]) faceBox(sink, GRANITE, face, u + side * (gw / 2 + 0.13), (gh + 0.1) / 2, 0.06, 0.26, gh + 0.1, 0.12, sf);
  faceBox(sink, GRANITE, face, u, gh + 0.27, 0.07, gw + 0.62, 0.36, 0.14, sf);
  faceBox(sink, 'structureMetal', face, u, gh + 0.27, 0.145, gw * 0.62, 0.18, 0.012, { colour: rgb(0x4a4744), decor: true, fine: true });
  // (the looks lane, 227) the granite threshold step before the gate, the frame's jambs standing on it
  faceBox(sink, GRANITE, face, u, 0.06, 0.18, gw + 0.62, 0.16, 0.36, { decor: true, fineSides: true });
  const py = gh + 0.45, half = gw / 2 + 0.42;
  if (ped === 'triangle') {
    sink.prism('plaster', [facePoint(face, u - half, py), facePoint(face, u + half, py), facePoint(face, u, py + 0.8)], face.out, 0.16, SHADOWED);
  } else if (ped === 'arch') {
    sink.prism('plaster', archOutline(face, u, py, half, 0.62), face.out, 0.16, SHADOWED);
  } else {
    faceBox(sink, 'plaster', face, u, py + 0.32, 0.08, 2 * half, 0.64, 0.16, SHADOWED);
    for (const side of [-1, 1]) faceBox(sink, 'plaster', face, u + side * (half + 0.1), py + 0.5, 0.1, 0.22, 1.0, 0.2, SHADOWED);
  }
  faceBox(sink, 'structureMetal', face, u, py + 0.26, 0.17, gw * 0.55, 0.26, 0.015, { colour: rgb(0x6b5f52), decor: true, fine: true });
}

/** The shikumen's joinery: the casements, the hall's lattice doors (geshan) over its granite step, the back doors. */
function shikumenDialect(look: () => number, win: WindowStyle, hall: WindowStyle, back: DoorStyle): HouseDialect {
  return {
    window: (s, face, o, y0) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, win, look, 0.3),
    door: (s, face, o, y0, frame) => {
      if (o.face === 'left') {
        // the hall open to the tianjing: its lattice screen across the opening, the step down to the court
        windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, hall, look, 0.2);
        faceBox(s, GRANITE, face, o.u, 0.07, 0.24, o.w + 0.3, 0.18, 0.4, { decor: true, fineSides: true });
        return;
      }
      doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, back, frame.floors[o.storey] + o.y0);
    },
  };
}

/**
 * A shikumen terrace (the lilong lanes of the Settlement and Zhabei): a gate house per 4.9 m of frontage behind the
 * courtyard wall, the two- or three-storey house behind the court, the kitchen wing and terrace behind it.
 */
export function shikumenRow(ctx: RegionalBuildContext, bank: Bank | null): RegionalParts {
  const sink = new PartSink(uvOffset(ctx));
  const f = rowFill(ctx);
  sink.placed(0, f.cx, 0, f.cz, () => {
    const rng = ctx.rng, look = ctx.variant, mobile = ctx.tier === 'mobile';
    const W = clampTo(f.w, 4, 40), D = clampTo(f.d, 5, 40);
    const n = Math.max(1, Math.round(W / 4.9)), uw = W / n;
    const three = ctx.info.h > 10.4 && rng() < 0.6;
    const s1 = 3.5, s2 = 3.1, s3 = three ? 2.9 : 0, eaveY = s1 + s2 + s3;
    const T = 0.28, court = clampTo(D * 0.2, 1.4, 2.5), backD = clampTo(D * 0.27, 1.8, 3.4);
    const zf = D / 2 - T - court, zb = -D / 2 + backD, zc = (zb + zf) / 2, s = (zf - zb) / 2;
    const brick = look() < 0.74;
    const wall: RegionalBucket = brick ? 'stone' : 'plaster';
    const burnt = look() < (bank === 'zhabei' ? 0.3 : 0.05);
    const stepped = look() < 0.55;
    const ped = choose(look(), ['triangle', 'arch', 'flat'] as const);
    // (looks 227) the joinery's paint and the louvred shutters: most of the Settlement's later lanes, fewer of Zhabei's older
    const shutterPaint = choose(look(), SHUTTER_PAINTS);
    const shuttered = look() < (bank === 'zhabei' ? 0.35 : 0.75);
    const backTop = s1 + s2 * 0.8 + s3, courtH = s1 + 1.3, terraceY = backTop + 0.12;
    const gw = clampTo(uw * 0.3, 1.2, 1.5), gh = 2.75, hallW = uw - 1.2, P = PLINTH;
    const storeys = (hs: number[]): StoreySpec[] => hs.map((h) => ({ h, wall }));
    // the casements in a surround: on a brick lane red brick round the grey under a red-brick arch (a lintel on a phone),
    // on a whitewashed lane a stucco surround and lintel; granite sills; the shutters folded back on the wall or shut in
    // the reveal (the head in the surround's own bucket: the craft lays it in place of the lintel and only adds)
    const head: HeadStyle = brick ? { kind: 'segment', bucket: 'structureMetal', colour: RED_BRICK, h: 0.12, out: 0.045, ext: 0.05, rise: 0.09 }
      : { kind: 'lintel', bucket: GRANITE, h: 0.16, out: 0.05, ext: 0.07 };
    const win: WindowStyle = {
      // (a phone keeps the plain opening: the surround draws nothing from the streams)
      ...CASEMENT, surround: mobile ? null : brick ? { bucket: 'structureMetal', colour: RED_BRICK, width: 0.1, out: 0.035, lintel: 0.15 } : { bucket: GRANITE, width: 0.1, out: 0.035, lintel: 0.15 },
      sill: { bucket: GRANITE, out: 0.09 },
      shutters: shuttered ? { colour: shutterPaint, kind: 'louvred', closed: 0.18 } : null, head,
    };
    const hall: WindowStyle = { ...CASEMENT, frame: shade(TEAK, 0.6), bars: 'six', sill: null, surround: null, shutters: null };
    const backDoor: DoorStyle = { leaf: LACQUER, frame: { bucket: GRANITE, width: 0.12, out: 0.05 }, transom: false, steps: { bucket: GRANITE }, leafKind: 'plank' };
    // the openings: the hall's lattice front and the casements over it to the court, the end houses' side windows (the
    // maps lane, 2026-10-15, Suzhou's blind critics: a terrace's end wall seen down a lane read as "a blank plaster wall"),
    // the back wing's door, kitchen window and the pavilion room's windows to the back lane
    const houseOpen: Opening[] = [], wingOpen: Opening[] = [];
    for (let k = 0; k < n; k++) {
      const u = -W / 2 + uw * (k + 0.5);
      houseOpen.push({ face: 'left', storey: 0, kind: 'door', u, w: hallW, y0: 0, h: 2.55, ...(burnt ? { state: 'burnt' as const } : {}) });
      for (let st = 1; st < (three ? 3 : 2); st++) {
        for (const du of [-uw * 0.22, uw * 0.22]) {
          const charred = burnt && look() < 0.65;
          houseOpen.push({ face: 'left', storey: st, kind: 'window', u: u + du, w: 1.0, y0: 0.8, h: 1.5, ...(charred ? { state: 'burnt' as const } : {}) });
        }
      }
      const ub = W / 2 - uw * (k + 0.5);
      wingOpen.push({ face: 'right', storey: 0, kind: 'door', u: ub - uw * 0.2, w: 0.9, y0: 0, h: 2.1 },
        { face: 'right', storey: 0, kind: 'window', u: ub + uw * 0.18, w: 0.8, y0: 1.1 - P, h: 1.0 });
      for (let st = 1; st < (three ? 3 : 2); st++) wingOpen.push({ face: 'right', storey: st, kind: 'window', u: ub, w: 0.9, y0: 0.7, h: 1.2 });
    }
    const span = zf - zb, us = span > 6.5 ? [-span * 0.22, span * 0.22] : [0];
    for (const face of ['front', 'back'] as const) {
      for (const u of us) {
        houseOpen.push({ face, storey: 0, kind: 'window', u, w: 0.8, y0: 1.35 - P, h: 0.9 });
        for (let st = 1; st < (three ? 3 : 2); st++) houseOpen.push({ face, storey: st, kind: 'window', u, w: 0.9, y0: 0.8, h: 1.4 });
      }
    }
    // the house: its granite plinth, the storeys cut by their openings, the canal-tiled gable roof with its saddle ridge,
    // the iron gutters and downpipes (props census #29 had it a holed box beside the grammar)
    const roof: RoofSpec = { kind: 'gable', pitchDeg: 28, eave: 0.42, verge: 0, thickness: 0.16, bucket: 'roof', ridge: 'saddle' };
    const houseSpec: HouseSpec = {
      w: span, d: W, plinth: { h: P, out: 0.05, bucket: GRANITE }, storeys: storeys([s1 - P, s2, ...(three ? [s3] : [])]), roof, gableBucket: wall,
      openings: houseOpen, chimneys: [], gutters: { colour: GUTTER }, verge: null, rafters: null, reveal: 0.22, spall: brick ? null : 'stone',
      // (the rows stand wall to wall: a drip strip round each would lie over its neighbour's)
      skirt: null,
    };
    const dialect = shikumenDialect(look, win, hall, backDoor);
    const frame: HouseFrame = along(sink, 0, zc, () => { const fr = buildHouse(sink, houseSpec, dialect); plinthWash(sink, houseSpec); return fr; });
    // the back wing: the kitchen (its stove's stack up through the drying terrace by the party wall), the pavilion room
    // over it, the terrace's cement roof
    const stacks = Array.from({ length: n }, (_, k) => ({ x: backD / 2 - 0.55, z: -W / 2 + uw * k + 0.45, sx: 0.42, sz: 0.5, above: 1.1, bucket: wall, cap: 'slab' as const }));
    const wingSpec: HouseSpec = {
      w: backD, d: W, plinth: { h: P, out: 0.05, bucket: GRANITE }, storeys: storeys([s1 - P, s2 * 0.8, ...(three ? [s3] : [])]),
      roof: { kind: 'flat', pitchDeg: 0, eave: 0, verge: 0, thickness: 0.12, bucket: GRANITE }, openings: wingOpen, chimneys: stacks,
      gutters: null, verge: null, rafters: null, reveal: 0.2, spall: brick ? null : 'stone', skirt: null,
    };
    along(sink, 0, (-D / 2 + zb) / 2, () => { buildHouse(sink, wingSpec, dialect); plinthWash(sink, wingSpec); });
    const rg = frame.roof;
    // the court wall, its gates cut through it into the courts, its granite foot; the party walls between the courts
    const front: Face = { origin: [0, 0, D / 2], u: [1, 0, 0], out: [0, 0, 1], width: W };
    const gateHoles: HoleRect[] = [];
    for (let k = 0; k < n; k++) { const u = -W / 2 + uw * (k + 0.5); gateHoles.push({ u0: u - gw / 2, u1: u + gw / 2, y0: -0.05, y1: gh }); }
    holedPolygon(sink, wall, front, [[-W / 2, -0.4], [W / 2, -0.4], [W / 2, courtH], [-W / 2, courtH]], gateHoles, T, 0, {}, [], DAMP_EDGE_BREAKS);
    for (let k = 0; k <= n; k++) {
      const x0 = clampTo(-W / 2 + k * uw - 0.12, -W / 2, W / 2 - 0.24);
      sink.span(wall, x0, -0.4, zf, x0 + 0.24, courtH - 0.45, D / 2 - T);
    }
    // the raised ridge over the saddle cap, the stepped fire walls (or the house's own gables)
    const top = (a: number) => rg.topAt(Math.min(a, s + roof.eave), 0) ?? eaveY;
    raisedRidge(sink, -W / 2 + 0.25, W / 2 - 0.25, rg.ridgeTopY, zc, stepped ? 0.32 : 0);
    if (stepped) {
      // (the end walls stand 3 cm proud of the house's own gables, which they cover: no two faces in one plane)
      for (let k = 0; k <= n; k++) {
        const px = k === 0 ? -W / 2 - 0.03 : k === n ? W / 2 + 0.03 : -W / 2 + k * uw + 0.12;
        horseHeadWall(sink, wall, px, k === 0 ? -1 : 1, zc, s + roof.eave, eaveY, top);
      }
    }
    // the courtyard wall's coping and its gates
    sink.span('structureMetal', -W / 2 - 0.04, courtH, D / 2 - T - 0.07, W / 2 + 0.04, courtH + 0.12, D / 2 + 0.07, { ...SHADOWED, colour: TILE_COPING });
    const keep: Array<{ u0: number; u1: number; y0: number; y1: number }> = [];
    const plinthRuns: Array<[number, number]> = [];
    let from = -W / 2;
    for (let k = 0; k < n; k++) {
      const u = -W / 2 + uw * (k + 0.5);
      shikumenGate(sink, front, u, gw, gh, ped, look, burnt, T);
      keep.push({ u0: u - gw / 2 - 0.5, u1: u + gw / 2 + 0.5, y0: 0, y1: gh + 1.4 });
      plinthRuns.push([from, u - gw / 2 - 0.26]);
      from = u + gw / 2 + 0.26;
      // a tiger window (the lanes' dormer) on the front slope
      if (look() < 0.5) {
        const zd = zc + s * 0.42, yb = top(zd + 0.35 - zc) - 0.3, yt = yb + 1.45;
        sink.span(wall, u - 0.62, yb, zd - 0.9, u + 0.62, yt, zd + 0.35, SHADOWED);
        sink.prism('roof', [[u - 0.8, yt, zd - 1.0], [u + 0.8, yt, zd - 1.0], [u, yt + 0.55, zd - 1.0]], [0, 0, 1], 1.5, SHADOWED);
        const dorm: Face = { origin: [0, 0, zd + 0.35], u: [1, 0, 0], out: [0, 0, 1], width: 1.24 };
        windowUnit(sink, dorm, u, yb + 0.55, 0.8, 0.75, { ...CASEMENT, bars: 'cross', sill: null }, look, 0.3);
      }
    }
    plinthRuns.push([from, W / 2]);
    const plinthGaps = plinthRuns.slice(0, -1).map(([, b], k): [number, number] => [b, plinthRuns[k + 1][0]]);
    // (looks 227) the court wall's granite foot, darkest where the lane's wet reaches it
    for (const [a, b] of plinthRuns) {
      if (b - a < 0.2) continue;
      faceBox(sink, GRANITE, front, (a + b) / 2, 0.04, 0.025, b - a, 0.68, 0.05, { decor: true, fineSides: true, shadeAt: (q) => (q[1] < 0 ? 0.6 : 0.88) });
    }
    if (brick) {
      brickBands(sink, front, -W / 2, W / 2, [0.9, 2.1, 3.3, courtH - 0.35], RED_BRICK);
      const houseFront: Face = { origin: [0, 0, zf], u: [1, 0, 0], out: [0, 0, 1], width: W };
      // (the bands clear of the casements cut through the house front, at their heads' line and the eave's)
      brickBands(sink, houseFront, -W / 2, W / 2, [eaveY - 0.25], RED_BRICK);
    } else if (facadeOn()) {
      // (looks 227: the whitewashed lanes' grey dado ran across the gates as a panel) a wash over the granite foot, broken
      // at the gates' frames (facade craft)
      paintBand(sink, 'plaster', front, -W / 2, W / 2, 0.38, 1.05, DADO, plinthGaps);
    }
    // the terrace's parapet and the washing on its bamboo poles
    sink.span(wall, -W / 2, terraceY, -D / 2, W / 2, terraceY + 0.83, -D / 2 + 0.22, SHADOWED);
    if (look() < 0.6) sink.dressing(mobile, () => {
      for (const dz of [0.9, 1.6]) {
        if (-D / 2 + dz > zb - 0.3) continue;
        sink.cylinder('structureWood', [-W / 2 + 0.4, terraceY + 1.6, -D / 2 + dz], 'x', W - 0.8, 0.025, 4, { colour: rgb(0x8a7a52), decor: true, fine: true });
        // (the buildings stream, 2026-10-12, the integrity check: the poles and their washing hung in the air) each pole
        // on a bamboo post at either end, stood on the terrace
        for (const px of [-W / 2 + 0.42, W / 2 - 0.42]) sink.cylinder('structureWood', [px, terraceY - 0.02, -D / 2 + dz], 'y', 1.65, 0.03, 4, { colour: rgb(0x8a7a52), decor: true, fine: true });
        for (let c = 0; c < 3; c++) {
          const cx = -W / 2 + 0.8 + look() * (W - 1.6);
          faceBox(sink, 'structureWood', { origin: [0, 0, -D / 2 + dz], u: [1, 0, 0], out: [0, 0, 1], width: W }, cx, terraceY + 1.2, 0.02, 0.6, 0.8, 0.02,
            { colour: choose(look(), AWNINGS), decor: true, fine: true });
        }
      }
    });
    // (looks 227, the facade craft) the lived-in lane: pots in the tianjing before the hall and on the terrace, the washing
    // on its iron rack off a pavilion room's window
    if (facadeOn()) {
      const fr = facadeRng();
      const backFace: Face = { origin: [0, 0, -D / 2], u: [-1, 0, 0], out: [0, 0, -1], width: W };
      for (let k = 0; k < n; k++) {
        const u = -W / 2 + uw * (k + 0.5), ub = W / 2 - uw * (k + 0.5);
        if (fr() < 0.7) for (const side of [-1, 1]) pottedPlant(sink, u + side * (uw / 2 - 0.36), 0, Math.min(zf + 0.7, D / 2 - T - 0.3), 0.3 + fr() * 0.12, fr);
        if (fr() < 0.5) pottedPlant(sink, -W / 2 + uw * (k + 0.5) + (fr() - 0.5) * uw * 0.5, terraceY, -D / 2 + 0.5, 0.32 + fr() * 0.12, fr);
        if (!burnt && fr() < 0.55) washingLine(sink, backFace, ub - 0.75, ub + 0.75, s1 + 0.5, fr);
      }
    }
    // the war: shell pocks over the court wall, a gate sandbagged, a breach; Zhabei's burnt lanes, a roof fallen in
    sink.dressing(mobile, () => pocks(sink, front, -W / 2 + 0.3, W / 2 - 0.3, 0.4, courtH - 0.3, (bank === 'zhabei' ? 14 : 6) + Math.floor(look() * 10), look, keep));
    if (!burnt && look() < (bank === 'settlement' ? 0.22 : 0.08)) sandbags(sink, front, -W / 2 + uw / 2, 0, gw + 0.8, 1.05, look);
    if (look() < 0.12) sink.dressing(mobile, () => breach(sink, front, (look() - 0.5) * (W - 3), 1.6, 0.6, look));
    if (burnt) {
      for (let k = 0; k < n; k++) soot(sink, front, -W / 2 + uw * (k + 0.5) - 0.9, -W / 2 + uw * (k + 0.5) + 0.9, gh, courtH);
      if (look() < 0.6) roofHole(sink, rg.ridgeTopY, zc, s, roof, (look() - 0.5) * (W - 2.4), look);
    }
  });
  return sink.finish();
}

// ------------------------------------------------------------------------------------------------ shophouses

/**
 * A row of Chinese shophouses: the shops open to the street under the upper storey's oversailing timber front, their
 * plank shutters, counters and name boards, the lattice casements, vertical signboards and lanterns; the stepped fire
 * walls between the shops. Zhabei's often burnt out.
 */
export function shophouseRow(ctx: RegionalBuildContext, bank: Bank | null): RegionalParts {
  const sink = new PartSink(uvOffset(ctx));
  const f = rowFill(ctx);
  sink.placed(0, f.cx, 0, f.cz, () => {
    const rng = ctx.rng, look = ctx.variant, mobile = ctx.tier === 'mobile';
    const W = clampTo(f.w, 4, 40), D = clampTo(f.d, 5, 40);
    const n = Math.max(1, Math.round(W / 4.2)), uw = W / n;
    const three = ctx.info.h > 10.4 && rng() < 0.5;
    const s1 = 3.7, s2 = 3.0, s3 = three ? 2.7 : 0, eaveY = s1 + s2 + s3;
    const roof: RoofSpec = { kind: 'gable', pitchDeg: 26, eave: 0.6, verge: 0, thickness: 0.15, bucket: 'roof', ridge: 'saddle' };
    const reach = roof.eave + roof.thickness * Math.sin(roof.pitchDeg * Math.PI / 180) + 0.02;
    const zf = D / 2 - reach, zb = -D / 2 + reach, shopIn = 0.6, zc = (zb + zf) / 2, s = (zf - zb) / 2;
    const burnt = look() < (bank === 'zhabei' ? 0.45 : 0.1);
    const wall: RegionalBucket = look() < 0.6 ? 'plaster' : 'stone';
    const stepped = look() < 0.72;
    // (props census #29, lane B 2026-10-15; the judges: "solid span boxes, the shop opening a dark facePanel 8 mm proud of
    // a solid wall") the shops' front wall with each shop's opening cut through it into its room (its floor, shelves,
    // goods, counter and shutter boards: openings.ts openShop), the rooms between their party walls back to the dwelling;
    // (looks 227) the dwelling a house of the grammar: its ground storey the stores and kitchens behind the rooms, its
    // upper storeys oversailing the rooms and the shops' recess as a jetty, the rooms' ceiling its soffit
    const T = 0.3, zs = zf - shopIn, roomD = clampTo(zs - zb - T - 2.2, 1.3, 2.6), zr = zs - T - roomD, P = PLINTH;
    const shop: Face = { origin: [0, 0, zs], u: [1, 0, 0], out: [0, 0, 1], width: W };
    const ow = uw - 0.55, openY = 0.05, openH = 3.0;
    const shopHoles: HoleRect[] = [];
    for (let k = 0; k < n; k++) { const u = -W / 2 + uw * (k + 0.5); shopHoles.push({ u0: u - ow / 2, u1: u + ow / 2, y0: openY, y1: openY + openH }); }
    holedPolygon(sink, wall, shop, [[-W / 2, -0.4], [W / 2, -0.4], [W / 2, s1], [-W / 2, s1]], shopHoles, T, 0, {}, [], DAMP_EDGE_BREAKS);
    for (let k = 0; k <= n; k++) {
      const x0 = clampTo(-W / 2 + k * uw - 0.12, -W / 2, W / 2 - 0.24);
      sink.span(wall, x0, -0.4, zr, x0 + 0.24, s1, zs - T);
    }
    const m = uw > 4.1 ? 3 : 2, ups = three ? [1, 2] : [1];
    const openings: Opening[] = [];
    for (let k = 0; k < n; k++) {
      const ub = W / 2 - uw * (k + 0.5), u = -W / 2 + uw * (k + 0.5);
      openings.push({ face: 'right', storey: 0, kind: 'door', u: ub - uw * 0.22, w: 0.9, y0: 0, h: 2.1 });
      for (const st of ups) {
        openings.push({ face: 'right', storey: st, kind: 'window', u: ub + uw * 0.15, w: 0.8, y0: 0.8, h: 1.1 });
        for (let j = 0; j < m; j++) {
          openings.push({ face: 'left', storey: st, kind: 'window', u: u - uw / 2 + uw * (j + 0.5) / m, w: 0.85, y0: 0.75, h: 1.6, ...(burnt ? { state: 'burnt' as const } : {}) });
        }
      }
    }
    // each shop's kitchen stove at the back of the stores, its stack up through the back slope
    const roofX = -(zf - zr) / 2;
    const stacks = Array.from({ length: n }, (_, k) => ({ x: roofX + s - 0.75, z: -W / 2 + uw * k + 0.55, sx: 0.45, sz: 0.45, above: 0.65, bucket: wall, cap: 'slab' as const }));
    const backWin: WindowStyle = {
      ...CASEMENT, surround: mobile ? null : { bucket: GRANITE, width: 0.09, out: 0.035, lintel: 0.14 }, sill: { bucket: GRANITE, out: 0.09 },
      shutters: { colour: shade(TEAK, 0.8), kind: 'plank', closed: 0.3 },
    };
    const backDoor: DoorStyle = { leaf: TEAK, frame: { bucket: GRANITE, width: 0.1, out: 0.04 }, transom: false, steps: { bucket: GRANITE }, leafKind: 'plank' };
    const dialect: HouseDialect = {
      window: (sk, face, o, y0) => windowUnit(sk, face, o.u, y0 + o.y0, o.w, o.h, o.face === 'left' ? CASEMENT : backWin, look, o.face === 'left' ? 0.3 : 0.25),
      door: (sk, face, o, y0, fr) => doorUnit(sk, face, o.u, y0 + o.y0, o.w, o.h, backDoor, fr.floors[o.storey] + o.y0),
    };
    const spec: HouseSpec = {
      w: zr - zb, d: W, plinth: { h: P, out: 0.04, bucket: GRANITE },
      storeys: [{ h: s1 - P, wall }, { h: s2, wall, jetty: [0, 0, 0, zf - zr] }, ...(three ? [{ h: s3, wall }] : [])], roof, gableBucket: wall,
      // (the rafter feet are a desktop's: a phone leaves them out, as the kits do)
      openings, chimneys: stacks, gutters: null, verge: null, rafters: mobile ? null : burnt ? CHAR : shade(TEAK, 0.72), reveal: 0.16,
      spall: wall === 'plaster' ? 'stone' : null, skirt: null,
    };
    const frame: HouseFrame = along(sink, 0, (zb + zr) / 2, () => { const fr = buildHouse(sink, spec, dialect); plinthWash(sink, spec); return fr; });
    // the shop rooms' front block under the jetty, a body of its own for the damage reading
    recordBody(sink, 0, (zr + zs) / 2, W, zs - zr, s1, wall);
    const rg = frame.roof;
    const top = (a: number) => rg.topAt(Math.min(a, s + roof.eave), 0) ?? eaveY;
    raisedRidge(sink, -W / 2 + 0.25, W / 2 - 0.25, rg.ridgeTopY, zc, 0.45);
    if (stepped) {
      for (let k = 0; k <= n; k++) {
        const px = k === 0 ? -W / 2 - 0.03 : k === n ? W / 2 + 0.03 : -W / 2 + k * uw + 0.12;
        horseHeadWall(sink, wall === 'stone' ? 'stone' : 'plaster', px, k === 0 ? -1 : 1, zc, s + roof.eave, eaveY, top, 0.5);
      }
    }
    const up: Face = { origin: [0, 0, zf], u: [1, 0, 0], out: [0, 0, 1], width: W };
    // the timber front: its boards between the casements (charred on a burnt row), its posts and rails over them
    const boards: RegionalBucket = burnt ? 'dark' : 'wood';
    for (const st of ups) {
      const y = s1 + (st - 1) * s2, yTop = st === ups.length ? eaveY : y + s2, sill = y + 0.75 - 0.1, head = y + 0.75 + 1.6;
      facePanel(sink, boards, up, 0, (y + 0.02 + sill) / 2, 0.02, W, sill - y - 0.02, DEC);
      if (yTop - head > 0.05) facePanel(sink, boards, up, 0, (head + yTop) / 2, 0.02, W, yTop - head, DEC);
      let u0 = -W / 2;
      for (let k = 0; k < n; k++) {
        for (let j = 0; j < m; j++) {
          const wu = -W / 2 + uw * (k + 0.5) - uw / 2 + uw * (j + 0.5) / m;
          if (wu - 0.425 - u0 > 0.02) facePanel(sink, boards, up, (u0 + wu - 0.425) / 2, (sill + head) / 2, 0.02, wu - 0.425 - u0, head - sill, DEC);
          u0 = wu + 0.425;
        }
      }
      if (W / 2 - u0 > 0.02) facePanel(sink, boards, up, (u0 + W / 2) / 2, (sill + head) / 2, 0.02, W / 2 - u0, head - sill, DEC);
    }
    const tf = { colour: burnt ? CHAR : shade(TEAK, 0.78), decor: true, fineSides: true } as const;
    for (const st of ups) {
      const y = s1 + (st - 1) * s2;
      faceBox(sink, 'structureWood', up, 0, y + 0.7, 0.03, W - 0.1, 0.1, 0.06, tf);
      faceBox(sink, 'structureWood', up, 0, y + 2.42, 0.03, W - 0.1, 0.1, 0.06, tf);
    }
    for (let k = 0; k <= n * m; k++) faceBox(sink, 'structureWood', up, clampTo(-W / 2 + k * uw / m, -W / 2 + 0.06, W / 2 - 0.06), (s1 + eaveY) / 2, 0.035, 0.12, eaveY - s1 - 0.1, 0.07, tf);
    // (looks 227) the pent roof over the shops (the yaoyan of a Jiangnan shop front): a canal-tiled lean-to off the timber
    // front under its first casements, carried on the front's brackets (dressing: the house keeps the collision)
    leanTo(sink, { face: up, u0: -W / 2 + 0.05, u1: W / 2 - 0.05, depth: 0.72, highY: s1 + 0.44,
      roof: { pitchDeg: 22, eave: 0.12, verge: 0, thickness: 0.07, bucket: 'roof', decor: true }, posts: null, plate: null });
    for (let k = 0; k < n; k++) {
      const u = -W / 2 + uw * (k + 0.5);
      openShop(sink, shop, u, openY, ow, openH, { wall: T, depth: roomD, width: uw - 0.24, height: s1 - openY }, {
        timber: TEAK, shutters: { colour: TEAK, mode: look() < 0.14 ? 'closed' : 'stacked' }, goods: SHOP_GOODS, burnt,
      }, look);
      if (!burnt && look() < 0.35) for (const side of [-1, 1]) lantern(sink, shop, u + side * ow * 0.32, s1 - 0.05, 0.32);
      nameBoard(sink, shop, u, s1 - 0.42, ow, burnt ? CHAR : choose(look(), SIGN_BOARDS));
      // the vertical signboard hangs from the eave to clear the pent roof
      if (!burnt && look() < 0.75) signboard(sink, up, u - uw / 2 + 0.42, eaveY - 0.25, clampTo(eaveY - 0.25 - s1 - 0.8, 1.2, 3.6), choose(look(), SIGN_BOARDS), 0.8);
    }
    // the piers between the shops on their granite bases
    for (let k = 0; k <= n; k++) {
      const pu = -W / 2 + k * uw + (k === 0 ? 0.2 : k === n ? -0.2 : 0);
      faceBox(sink, wall, shop, pu, s1 / 2, 0.06, 0.4, s1, 0.12, { decor: true, fineSides: true });
      faceBox(sink, GRANITE, shop, pu, 0.04, 0.08, 0.48, 0.68, 0.16, { decor: true, fineSides: true, shadeAt: (q) => (q[1] < 0 ? 0.6 : 0.88) });
    }
    // (looks 227, the facade craft) the washing on its iron rack off a back window
    if (facadeOn() && !burnt) {
      const fr = facadeRng(), back: Face = { origin: [0, 0, zb], u: [-1, 0, 0], out: [0, 0, -1], width: W };
      for (let k = 0; k < n; k++) {
        const ub = W / 2 - uw * (k + 0.5) + uw * 0.15;
        if (fr() < 0.5) washingLine(sink, back, ub - 0.7, ub + 0.7, s1 + 0.55, fr);
      }
    }
    // (the pocks clear of the casements cut through the front: a pock over an opening stood in the air)
    const keepUp = openings.filter((o) => o.face === 'left').map((o) => {
      const y0 = s1 + (o.storey - 1) * s2 + o.y0;
      return { u0: o.u - o.w / 2 - 0.15, u1: o.u + o.w / 2 + 0.15, y0: y0 - 0.15, y1: y0 + o.h + 0.15 };
    });
    // (on the timber front's boards, 2 cm out of the wall)
    const upBoards: Face = { ...up, origin: [0, 0, zf + 0.02] };
    sink.dressing(mobile, () => pocks(sink, upBoards, -W / 2 + 0.3, W / 2 - 0.3, s1 + 0.2, eaveY - 0.2, (bank === 'zhabei' ? 12 : 4) + Math.floor(look() * 8), look, keepUp, 'plaster3'));
    if (burnt && look() < 0.7) roofHole(sink, rg.ridgeTopY, zc, s, roof, (look() - 0.5) * (W - 2.4), look);
  });
  return sink.finish();
}
