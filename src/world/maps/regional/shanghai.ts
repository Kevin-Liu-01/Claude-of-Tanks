// src/world/maps/regional/shanghai.ts — the Shanghai kit (Suzhou Creek: the battle for the city, August to November
// 1937). The creek divides the district: the International Settlement on one bank, Zhabei, the Chinese district the
// Japanese shelled and burnt, on the other. Its street rows change with the bank they stand on:
//   - shikumen lanes: a terrace of stone-gate houses behind a courtyard wall the height of a storey and a half, each
//     house's gate in a granite frame with black lacquer leaves and a carved pediment over its lintel (triangular,
//     segmental or a flat panel between scrolls), grey brick laid with bands of red, or the older lanes' whitewash; the
//     two- or three-storey house behind the court under a roof of grey canal tiles with a "tiger window" dormer, its
//     gables carried up as stepped fire walls; the kitchen wing and the drying terrace behind;
//   - Chinese shophouses (most of Zhabei): two or three storeys, the shop open to the street behind its plank shutters
//     and counter, the name board over it, the upper storey's timber front oversailing the shop with its lattice
//     casements, vertical signboards and lanterns hung off it, the stepped fire walls between the shops, the raised
//     ridge curled at its ends; in Zhabei many burnt out, the shutters gone to charcoal and the soot up the fronts;
//   - the Settlement's commercial blocks (its main streets): three and four storeys of red brick (or ochre stucco)
//     over a ground storey of grey stone, sash windows in white surrounds, string courses and a cornice, a parapet with
//     its crest panel, shopfronts behind folding iron gates, a balcony, the vertical signs, awnings, sandbags;
//   - the ruins: a shophouse's shell with its piers and empty windows standing, the floors fallen in behind; a house
//     collapsed to broken walls round its rubble with the chimney standing; a burnt shophouse frame between its party
//     walls, the charred posts of its front;
//   - the district's other buildings: a tram depot (the car barn of the trams that ran to the creek's bridges), brick
//     godowns along the creek, a cotton mill with its stair and water tower, a fire station with its watch tower, a
//     guild hall (huiguan) behind its walls with the swept roof of its main hall.
// The landmarks — the Bund's banks and the Art Deco towers of the 1930s, the Joint Trust ("Sihang") warehouse — are
// shanghaiBund.ts.
//
// The kit reads its building's bank of the creek (shanghaiParts.ts bankOf: ctx.x, ctx.z): Zhabei's rows are mostly
// shophouses and often burnt, the Settlement's a mix of lanes, shophouses and blocks. Without a place (the receipts) the
// mix is drawn from the build stream. Every building fills its base's measured reach (ctx.bounds); a street row keeps its
// front to the plot's.
import { PartSink, faceBox, facePanel, facePoint, rgb, shade, type Face, type RegionalBucket, type RegionalParts, type Rgb, type Vec3 } from './geometry.ts';
import { buildHouse, emitRoof, roofGeometry, wallPolygon, windowRhythm, type HouseDialect, type HouseSpec, type Opening, type RoofSpec } from './house.ts';
import { doorUnit, gateUnit, windowUnit, type WindowStyle } from './openings.ts';
import type { ArchitectureStyle, RegionalBuildContext, RegionalBuilder } from './types.ts';
import {
  AWNINGS, CASEMENT, CHAR, CHINA_RED, DEG, GILT, GODOWN_WINDOW, IRON, LACQUER, RED_BRICK, SASH, SIGN_BOARDS, TEAK, TILE_COPING, WHITE_TRIM,
  bankOf, brickBands, breach, choose, clampTo, fillOf, horseHeadWall, lantern, nameBoard, pocks, pyramid, raisedRidge, sandbags,
  signboard, soot, streetRoof, uvOffset, type Bank,
} from './shanghaiParts.ts';
import { SHANGHAI_BUND_BUILDERS } from './shanghaiBund.ts';

const DEC = { decor: true } as const;
const SHADOWED = { decor: true, shadow: true } as const;

/**
 * A street-row building's footprint: the base geometry's bounds (the row's houses meet and the gaps between them stay
 * the base's), its street front no further out than the plot's (the base's steps and porches reach past it).
 */
const rowFill = (ctx: RegionalBuildContext) => fillOf(ctx.bounds, 0.05, ctx.info.d / 2 - 0.1);

/** A segmental arch's outline on a face (convex, counter-clockwise seen from outside): base from u - r to u + r at y. */
function archOutline(face: Face, u: number, y: number, r: number, rise: number, o = 0, n = 8): Vec3[] {
  const pts: Vec3[] = [facePoint(face, u - r, y, o), facePoint(face, u + r, y, o)];
  for (let k = 1; k < n; k++) {
    const a = (k / n) * Math.PI;
    pts.push(facePoint(face, u + Math.cos(a) * r, y + Math.sin(a) * rise, o));
  }
  return pts;
}

/** The gable triangles closing a street roof's ends (where no stepped wall stands): the end walls' tops, dressing. */
function gableEnds(sink: PartSink, bucket: RegionalBucket, W: number, zb: number, zf: number, eaveY: number, ridgeY: number): void {
  const zc = (zb + zf) / 2, s = (zf - zb) / 2;
  const right: Face = { origin: [W / 2, 0, zc], u: [0, 0, -1], out: [1, 0, 0], width: 2 * s };
  const left: Face = { origin: [-W / 2, 0, zc], u: [0, 0, 1], out: [-1, 0, 0], width: 2 * s };
  for (const face of [right, left]) wallPolygon(sink, bucket, face, [[-s, eaveY], [s, eaveY], [0, ridgeY]], 0.24, SHADOWED);
}

// ------------------------------------------------------------------------------------------------ shikumen

type Pediment = 'triangle' | 'arch' | 'flat';

/** A shikumen's gate: the granite frame, the black lacquer leaves (one ajar now and then), the carved pediment. */
function shikumenGate(sink: PartSink, face: Face, u: number, gw: number, gh: number, ped: Pediment, look: () => number, burnt: boolean): void {
  facePanel(sink, 'dark', face, u, gh / 2, 0.006, gw, gh, DEC);
  const ajar = look() < 0.22;
  for (const side of [-1, 1]) {
    const lu = u + side * gw / 4;
    if (burnt) { faceBox(sink, 'structureWood', face, lu, gh / 2, 0.03, gw / 2 - 0.03, gh - 0.05, 0.05, { colour: CHAR, decor: true }); continue; }
    if (ajar && side > 0) continue;
    faceBox(sink, 'structureWood', face, lu, gh / 2, 0.03, gw / 2 - 0.03, gh - 0.05, 0.05, { colour: LACQUER, decor: true, fineSides: true });
    faceBox(sink, 'structureMetal', face, u + side * 0.13, 1.3, 0.07, 0.1, 0.1, 0.03, { colour: GILT, decor: true, fine: true });
  }
  const sf = { decor: true, fineSides: true };
  for (const side of [-1, 1]) faceBox(sink, 'plaster3', face, u + side * (gw / 2 + 0.13), (gh + 0.1) / 2, 0.06, 0.26, gh + 0.1, 0.12, sf);
  faceBox(sink, 'plaster3', face, u, gh + 0.27, 0.07, gw + 0.62, 0.36, 0.14, sf);
  faceBox(sink, 'structureMetal', face, u, gh + 0.27, 0.145, gw * 0.62, 0.18, 0.012, { colour: rgb(0x4a4744), decor: true, fine: true });
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

/**
 * A shikumen terrace (the lilong lanes of the Settlement and Zhabei): a gate house per 4.9 m of frontage behind the
 * courtyard wall, the two- or three-storey house behind the court, the kitchen wing and terrace behind it.
 */
function shikumenRow(ctx: RegionalBuildContext, bank: Bank | null): RegionalParts {
  const sink = new PartSink(uvOffset(ctx));
  const f = rowFill(ctx);
  sink.placed(0, f.cx, 0, f.cz, () => {
    const rng = ctx.rng, look = ctx.variant, mobile = ctx.tier === 'mobile';
    const W = clampTo(f.w, 4, 40), D = clampTo(f.d, 5, 40);
    const n = Math.max(1, Math.round(W / 4.9)), uw = W / n;
    const three = ctx.info.h > 10.4 && rng() < 0.6;
    const s1 = 3.5, s2 = 3.1, s3 = three ? 2.9 : 0, eaveY = s1 + s2 + s3;
    const T = 0.28, court = clampTo(D * 0.2, 1.4, 2.5), backD = clampTo(D * 0.27, 1.8, 3.4);
    const zf = D / 2 - T - court, zb = -D / 2 + backD;
    const brick = look() < 0.74;
    const wall: RegionalBucket = brick ? 'stone' : 'plaster';
    const burnt = look() < (bank === 'zhabei' ? 0.3 : 0.05);
    const stepped = look() < 0.55;
    const ped = choose(look(), ['triangle', 'arch', 'flat'] as const);
    // the house, the back wing (the kitchen, the pavilion room over it, the drying terrace on its roof), the court wall
    sink.span(wall, -W / 2, -0.4, zb, W / 2, eaveY, zf);
    const backTop = s1 + s2 * 0.8 + s3;
    sink.span(wall, -W / 2, -0.4, -D / 2, W / 2, backTop, zb);
    const courtH = s1 + 1.3;
    sink.span(wall, -W / 2, -0.4, D / 2 - T, W / 2, courtH, D / 2);
    for (let k = 0; k <= n; k++) {
      const x0 = clampTo(-W / 2 + k * uw - 0.12, -W / 2, W / 2 - 0.24);
      sink.span(wall, x0, -0.4, zf, x0 + 0.24, courtH - 0.45, D / 2 - T);
    }
    const roof: RoofSpec = { kind: 'gable', pitchDeg: 28, eave: 0.42, verge: 0, thickness: 0.16, bucket: 'roof', ridge: null };
    const rg = streetRoof(sink, -W / 2 + 0.02, W / 2 - 0.02, zb, zf, eaveY, roof);
    const zc = (zb + zf) / 2, s = (zf - zb) / 2;
    const top = (a: number) => rg.topAt(Math.min(a, s + roof.eave), 0) ?? eaveY;
    raisedRidge(sink, -W / 2 + 0.25, W / 2 - 0.25, rg.ridgeTopY, zc, stepped ? 0.32 : 0);
    if (stepped) {
      for (let k = 0; k <= n; k++) {
        const px = k === 0 ? -W / 2 : k === n ? W / 2 : -W / 2 + k * uw + 0.12;
        horseHeadWall(sink, wall, px, k === 0 ? -1 : 1, zc, s + roof.eave, eaveY, top);
      }
    } else gableEnds(sink, wall, W, zb, zf, eaveY, rg.ridgeY);
    // the courtyard wall's coping and its gates
    sink.span('structureMetal', -W / 2 - 0.04, courtH, D / 2 - T - 0.07, W / 2 + 0.04, courtH + 0.12, D / 2 + 0.07, { ...SHADOWED, colour: TILE_COPING });
    const front: Face = { origin: [0, 0, D / 2], u: [1, 0, 0], out: [0, 0, 1], width: W };
    const house: Face = { origin: [0, 0, zf], u: [1, 0, 0], out: [0, 0, 1], width: W };
    const keep: Array<{ u0: number; u1: number; y0: number; y1: number }> = [];
    const gw = clampTo(uw * 0.3, 1.2, 1.5), gh = 2.75;
    for (let k = 0; k < n; k++) {
      const u = -W / 2 + uw * (k + 0.5);
      shikumenGate(sink, front, u, gw, gh, ped, look, burnt);
      keep.push({ u0: u - gw / 2 - 0.5, u1: u + gw / 2 + 0.5, y0: 0, y1: gh + 1.4 });
      // the house front over the court wall: its casements (the lattice doors of the hall below seen only from above)
      facePanel(sink, 'structureWood', house, u, 1.5, 0.01, uw - 1.2, 2.7, { colour: shade(TEAK, 0.7), decor: true });
      for (let st = 1; st < (three ? 3 : 2); st++) {
        const y = s1 + (st - 1) * s2 + 0.8;
        for (const du of [-uw * 0.22, uw * 0.22]) {
          if (burnt && look() < 0.65) {
            facePanel(sink, 'dark', house, u + du, y + 0.75, 0.01, 1.0, 1.5, DEC);
            soot(sink, house, u + du - 0.7, u + du + 0.7, y + 1.5, Math.min(eaveY, y + 3.2));
            continue;
          }
          windowUnit(sink, house, u + du, y, 1.0, 1.5, CASEMENT, look, 0.3);
        }
      }
      // a tiger window (the lanes' dormer) on the front slope
      if (look() < 0.5) {
        const zd = zc + s * 0.42, yb = top(zd + 0.35 - zc) - 0.3, yt = yb + 1.45;
        sink.span(wall, u - 0.62, yb, zd - 0.9, u + 0.62, yt, zd + 0.35, SHADOWED);
        sink.prism('roof', [[u - 0.8, yt, zd - 1.0], [u + 0.8, yt, zd - 1.0], [u, yt + 0.55, zd - 1.0]], [0, 0, 1], 1.5, SHADOWED);
        const dorm: Face = { origin: [0, 0, zd + 0.35], u: [1, 0, 0], out: [0, 0, 1], width: 1.24 };
        windowUnit(sink, dorm, u, yb + 0.55, 0.8, 0.75, { ...CASEMENT, bars: 'cross', sill: null }, look, 0.3);
      }
    }
    if (brick) {
      brickBands(sink, front, -W / 2, W / 2, [0.9, 2.1, 3.3, courtH - 0.35], RED_BRICK);
      brickBands(sink, house, -W / 2, W / 2, [courtH + 0.5, eaveY - 0.4], RED_BRICK);
    } else {
      faceBox(sink, 'plaster3', front, 0, 0.3, 0.015, W, 0.6, 0.03, DEC);
    }
    // the back wing: its windows, the back door, the terrace's parapet and the washing on its bamboo poles
    const back: Face = { origin: [0, 0, -D / 2], u: [-1, 0, 0], out: [0, 0, -1], width: W };
    for (let k = 0; k < n; k++) {
      const u = W / 2 - uw * (k + 0.5);
      doorUnit(sink, back, u - uw * 0.2, 0, 0.9, 2.1, { leaf: LACQUER, frame: { bucket: 'plaster3', width: 0.12, out: 0.05 }, transom: false, steps: null, leafKind: 'plank' });
      windowUnit(sink, back, u + uw * 0.18, 1.1, 0.8, 1.0, CASEMENT, look, 0.25);
      windowUnit(sink, back, u, s1 + 0.7, 0.9, 1.2, CASEMENT, look, 0.25);
    }
    sink.span(wall, -W / 2, backTop, -D / 2, W / 2, backTop + 0.95, -D / 2 + 0.22, SHADOWED);
    if (look() < 0.6) sink.dressing(mobile, () => {
      for (const dz of [0.9, 1.6]) {
        if (-D / 2 + dz > zb - 0.3) continue;
        sink.cylinder('structureWood', [-W / 2 + 0.4, backTop + 1.6, -D / 2 + dz], 'x', W - 0.8, 0.025, 4, { colour: rgb(0x8a7a52), decor: true, fine: true });
        for (let c = 0; c < 3; c++) {
          const cx = -W / 2 + 0.8 + look() * (W - 1.6);
          faceBox(sink, 'structureWood', { origin: [0, 0, -D / 2 + dz], u: [1, 0, 0], out: [0, 0, 1], width: W }, cx, backTop + 1.2, 0.02, 0.6, 0.8, 0.02,
            { colour: choose(look(), AWNINGS), decor: true, fine: true });
        }
      }
    });
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

/**
 * A roof fallen in where the fire took it: the dark hole on the front slope and the charred rafters across it.
 * Dressing over the roof slab (the slab keeps the building's collision).
 */
function roofHole(sink: PartSink, ridgeTopY: number, zc: number, s: number, roof: RoofSpec, u: number, look: () => number): void {
  const tanP = Math.tan(roof.pitchDeg * DEG), w = 1.6 + look() * 1.4;
  const a0 = s * 0.12, a1 = s * 0.82;
  const y0 = ridgeTopY - a0 * tanP + 0.02, y1 = ridgeTopY - a1 * tanP + 0.02;
  sink.quad('dark', [u - w / 2, y1, zc + a1], [u + w / 2, y1, zc + a1], [u + w / 2, y0, zc + a0], [u - w / 2, y0, zc + a0], DEC);
  for (let k = 0; k < 3; k++) {
    const x = u - w / 2 + (k + 0.5) * w / 3;
    sink.member('structureWood', [x, y0 + 0.05, zc + a0], [x + (look() - 0.5) * 0.3, y1 + 0.05, zc + a1], 0.1, 0.1, [0, 1, 0], { colour: CHAR, decor: true, exposed: true }, 0);
  }
}

// ------------------------------------------------------------------------------------------------ shophouses

/**
 * A row of Chinese shophouses: the shops open to the street under the upper storey's oversailing timber front, their
 * plank shutters, counters and name boards, the lattice casements, vertical signboards and lanterns; the stepped fire
 * walls between the shops. Zhabei's often burnt out.
 */
function shophouseRow(ctx: RegionalBuildContext, bank: Bank | null): RegionalParts {
  const sink = new PartSink(uvOffset(ctx));
  const f = rowFill(ctx);
  sink.placed(0, f.cx, 0, f.cz, () => {
    const rng = ctx.rng, look = ctx.variant, mobile = ctx.tier === 'mobile';
    const W = clampTo(f.w, 4, 40), D = clampTo(f.d, 5, 40);
    const n = Math.max(1, Math.round(W / 4.2)), uw = W / n;
    const three = ctx.info.h > 10.4 && rng() < 0.5;
    const s1 = 3.7, s2 = 3.0, s3 = three ? 2.7 : 0, eaveY = s1 + s2 + s3;
    const roof: RoofSpec = { kind: 'gable', pitchDeg: 26, eave: 0.6, verge: 0, thickness: 0.15, bucket: 'roof', ridge: null };
    const reach = roof.eave + roof.thickness * Math.sin(roof.pitchDeg * DEG) + 0.02;
    const zf = D / 2 - reach, zb = -D / 2 + reach, shopIn = 0.6;
    const burnt = look() < (bank === 'zhabei' ? 0.45 : 0.1);
    const wall: RegionalBucket = look() < 0.6 ? 'plaster' : 'stone';
    const stepped = look() < 0.72;
    sink.span(wall, -W / 2, -0.4, zb, W / 2, s1, zf - shopIn);
    sink.span(wall, -W / 2, s1, zb, W / 2, eaveY, zf);
    const rg = streetRoof(sink, -W / 2 + 0.02, W / 2 - 0.02, zb, zf, eaveY, roof);
    const zc = (zb + zf) / 2, s = (zf - zb) / 2;
    const top = (a: number) => rg.topAt(Math.min(a, s + roof.eave), 0) ?? eaveY;
    raisedRidge(sink, -W / 2 + 0.25, W / 2 - 0.25, rg.ridgeTopY, zc, 0.45);
    if (stepped) {
      for (let k = 0; k <= n; k++) {
        const px = k === 0 ? -W / 2 : k === n ? W / 2 : -W / 2 + k * uw + 0.12;
        horseHeadWall(sink, wall === 'stone' ? 'stone' : 'plaster', px, k === 0 ? -1 : 1, zc, s + roof.eave, eaveY, top, 0.5);
      }
    } else gableEnds(sink, wall, W, zb, zf, eaveY, rg.ridgeY);
    const shop: Face = { origin: [0, 0, zf - shopIn], u: [1, 0, 0], out: [0, 0, 1], width: W };
    const up: Face = { origin: [0, 0, zf], u: [1, 0, 0], out: [0, 0, 1], width: W };
    // the upper storeys' timber fronts and the pent eave along the floor line
    facePanel(sink, burnt ? 'dark' : 'wood', up, 0, s1 + (s2 + s3) / 2, 0.012, W - 0.08, s2 + s3 - 0.1, DEC);
    faceBox(sink, 'structureMetal', up, 0, s1 + 0.08, 0.34, W, 0.13, 0.68, { ...SHADOWED, colour: TILE_COPING });
    for (let k = 0; k < n; k++) {
      const u = -W / 2 + uw * (k + 0.5), ow = uw - 0.55;
      facePanel(sink, 'dark', shop, u, 1.55, 0.008, ow, 3.0, DEC);
      if (burnt) {
        facePanel(sink, 'structureMetal', shop, u, 1.0, 0.014, ow, 1.9, { decor: true, colour: CHAR });
        soot(sink, up, u - ow / 2, u + ow / 2, s1 + 0.2, eaveY - 0.2);
      } else {
        // the plank shutters: most taken down by day, stacked boards on one side; the counter across the front
        const boards = Math.floor(ow / 0.34), put = Math.floor(boards * look() * look());
        for (let b = 0; b < put; b++) {
          faceBox(sink, 'structureWood', shop, u - ow / 2 + 0.17 + b * 0.34, 1.52, 0.04, 0.32, 2.98, 0.05,
            { colour: shade(TEAK, 0.85 + look() * 0.3), decor: true, fineSides: true });
        }
        faceBox(sink, 'structureWood', shop, u + (put > 0 ? 0.4 : 0), 0.48, 0.28, Math.max(0.6, ow - 0.6 - put * 0.34), 0.96, 0.5, { colour: TEAK, decor: true });
        if (look() < 0.35) for (const side of [-1, 1]) lantern(sink, shop, u + side * ow * 0.32, s1 - 0.05, 0.32);
      }
      nameBoard(sink, shop, u, s1 - 0.42, ow, burnt ? CHAR : choose(look(), SIGN_BOARDS));
      // the casements of each upper storey: a band of lattice lights
      const m = uw > 4.1 ? 3 : 2;
      for (let st = 1; st < (three ? 3 : 2); st++) {
        const y = s1 + (st - 1) * s2 + 0.75;
        for (let j = 0; j < m; j++) {
          const wu = u - uw / 2 + uw * (j + 0.5) / m;
          if (burnt) { facePanel(sink, 'dark', up, wu, y + 0.8, 0.02, 0.85, 1.6, DEC); continue; }
          windowUnit(sink, up, wu, y, 0.85, 1.6, CASEMENT, look, 0.3);
        }
      }
      if (!burnt && look() < 0.75) signboard(sink, up, u - uw / 2 + 0.42, eaveY - 0.25, clampTo(s2 + s3 - 0.5, 1.8, 3.6), choose(look(), SIGN_BOARDS), 0.8);
    }
    // the piers between the shops
    for (let k = 0; k <= n; k++) faceBox(sink, wall, shop, -W / 2 + k * uw + (k === 0 ? 0.2 : k === n ? -0.2 : 0), s1 / 2, 0.06, 0.4, s1, 0.12, { decor: true, fineSides: true });
    // the back: small casements, a back door
    const back: Face = { origin: [0, 0, zb], u: [-1, 0, 0], out: [0, 0, -1], width: W };
    for (let k = 0; k < n; k++) {
      const u = W / 2 - uw * (k + 0.5);
      doorUnit(sink, back, u - uw * 0.22, 0, 0.9, 2.1, { leaf: TEAK, frame: { bucket: 'plaster3', width: 0.1, out: 0.04 }, transom: false, steps: null, leafKind: 'plank' });
      windowUnit(sink, back, u + uw * 0.15, s1 + 0.8, 0.8, 1.1, CASEMENT, look, 0.25);
    }
    sink.dressing(mobile, () => pocks(sink, up, -W / 2 + 0.3, W / 2 - 0.3, s1 + 0.2, eaveY - 0.2, (bank === 'zhabei' ? 12 : 4) + Math.floor(look() * 8), look, [], 'plaster3'));
    if (burnt && look() < 0.7) roofHole(sink, rg.ridgeTopY, zc, s, roof, (look() - 0.5) * (W - 2.4), look);
  });
  return sink.finish();
}

// ------------------------------------------------------------------------------------------------ the Settlement's blocks

/** A Settlement shopfront: the glazed front behind its folding iron gate, the name board over it. */
function settlementShop(s: PartSink, face: Face, o: Opening, y0: number, look: () => number): void {
  const y = y0 + o.y0, r = s.recess, back = r > 0 ? -r : 0;
  windowUnit(s, face, o.u, y + 0.45, o.w, o.h - 0.45,
    { frame: TEAK, frameWidth: 0.08, frameOut: 0.06, bars: 'two', surround: null, sill: null, shutters: null }, look, 0.35);
  const drawn = look();
  if (drawn > 0.35) {
    const gw = o.w * Math.min(1, (drawn - 0.35) * 1.7), g0 = o.u - o.w / 2;
    faceBox(s, 'structureMetal', face, g0 + gw / 2, y + o.h - 0.05, back + 0.13, gw, 0.08, 0.04, { colour: IRON, decor: true });
    for (let b = 0; b <= Math.floor(gw / 0.15); b++) {
      faceBox(s, 'structureMetal', face, g0 + b * 0.15, y + o.h / 2, back + 0.13, 0.025, o.h - 0.1, 0.025, { colour: IRON, decor: true, fine: true });
    }
  }
}

function blockDialect(look: () => number): HouseDialect {
  return {
    window: (s, face, o, y0) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, SASH, look, 0.3),
    door: (s, face, o, y0, frame) => {
      if (o.kind === 'shopfront') { settlementShop(s, face, o, y0, look); return; }
      doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h,
        { leaf: rgb(0x3d3a36), frame: { bucket: 'plaster3', width: 0.12, out: 0.05 }, transom: false, steps: null, leafKind: 'plank' }, frame.floors[o.storey] + o.y0);
    },
  };
}

/**
 * A Settlement commercial block: three or four storeys of red brick (or ochre stucco) over a grey stone shop storey,
 * the sash windows in white surrounds, the string courses, the cornice and the parapet's crest, the balcony, the
 * vertical signs, the awnings and the sandbags of 1937.
 */
function settlementBlock(ctx: RegionalBuildContext): RegionalParts {
  const sink = new PartSink(uvOffset(ctx));
  const f = rowFill(ctx);
  sink.placed(0, f.cx, 0, f.cz, () => {
    const look = ctx.variant, mobile = ctx.tier === 'mobile';
    const W = clampTo(f.w, 5, 40), D = clampTo(f.d, 5, 40);
    const floors = ctx.info.h > 10.6 ? 4 : 3;
    const s0 = 4.0, sU = 3.25;
    const brick = look() < 0.68;
    const upperWall: RegionalBucket = brick ? 'stone' : 'plaster2';
    const nShops = Math.max(1, Math.round(W / 4.4)), shopW = W / nShops;
    const openings: Opening[] = [];
    for (let k = 0; k < nShops; k++) {
      openings.push({ face: 'front', storey: 0, kind: 'shopfront', u: -W / 2 + shopW * (k + 0.5), w: Math.max(1.2, shopW - 1.1), y0: 0.15, h: 3.1 });
    }
    for (let st = 1; st < floors; st++) {
      openings.push(...windowRhythm('front', st, W, { w: 1.15, h: 1.85, sill: 0.8, spacing: 2.15, margin: 0.75 }));
      openings.push(...windowRhythm('back', st, W, { w: 0.95, h: 1.4, sill: 1.0, spacing: 2.8, margin: 1.0 }));
    }
    openings.push({ face: 'back', storey: 0, kind: 'door', u: W * 0.22, w: 1.0, y0: 0, h: 2.2 });
    const spec: HouseSpec = {
      w: W, d: D, plinth: null,
      storeys: [{ h: s0, wall: 'plaster3' }, ...Array.from({ length: floors - 1 }, () => ({ h: sU, wall: upperWall }))],
      roof: { kind: 'flat', pitchDeg: 0, eave: 0, verge: 0, thickness: 0.3, bucket: 'plaster3', parapet: 0.95 },
      openings, chimneys: [], reveal: 0.17, rafters: null, spall: 'stone',
    };
    const frame = buildHouse(sink, spec, blockDialect(look));
    const front = frame.faces.front, eaveY = frame.eaveY;
    // the string courses, the cornice, the crest panel over the parapet with its date
    for (let st = 1; st < floors; st++) faceBox(sink, 'plaster', front, 0, frame.floors[st] - 0.05, 0.05, W, 0.16, 0.1, { decor: true, fineSides: true });
    faceBox(sink, 'plaster', front, 0, eaveY - 0.12, 0.13, W, 0.34, 0.26, SHADOWED);
    const crest = Math.min(W * 0.36, 4.2), py = eaveY + 0.3 + 0.95;
    if (look() < 0.7) {
      sink.prism('plaster', [facePoint(front, -crest / 2, py - 0.3, -0.2), facePoint(front, crest / 2, py - 0.3, -0.2), facePoint(front, crest / 2, py + 0.5, -0.2),
        facePoint(front, 0, py + 1.1, -0.2), facePoint(front, -crest / 2, py + 0.5, -0.2)], front.out, 0.2, SHADOWED);
      faceBox(sink, 'structureMetal', front, 0, py + 0.35, 0.01, crest * 0.45, 0.3, 0.02, { colour: shade(WHITE_TRIM, 0.8), decor: true, fine: true });
    }
    // a balcony on the first floor with its iron railing
    if (look() < 0.55 && floors > 2) {
      const bw = Math.min(W - 1.6, 3.6), by = frame.floors[1];
      faceBox(sink, 'plaster3', front, 0, by - 0.08, 0.45, bw, 0.18, 0.9, SHADOWED);
      faceBox(sink, 'structureMetal', front, 0, by + 0.95, 0.88, bw, 0.05, 0.05, { colour: IRON, decor: true });
      for (let b = 0; b <= Math.round(bw / 0.16); b++) {
        faceBox(sink, 'structureMetal', front, -bw / 2 + b * bw / Math.round(bw / 0.16), by + 0.5, 0.88, 0.022, 0.9, 0.022, { colour: IRON, decor: true, fine: true });
      }
    }
    // the vertical signs down the front, the awnings over the shops, sandbags
    const signs = Math.min(3, Math.max(1, Math.round(W / 4)));
    for (let k = 0; k < signs; k++) {
      if (look() < 0.25) continue;
      const u = -W / 2 + W * (k + 0.5) / signs + 1.05;
      signboard(sink, front, clampTo(u, -W / 2 + 0.5, W / 2 - 0.5), eaveY - 0.4, (floors - 1) * sU - 0.8, choose(look(), SIGN_BOARDS), 0.9);
    }
    for (let k = 0; k < nShops; k++) {
      const u = -W / 2 + shopW * (k + 0.5), aw = Math.max(1.2, shopW - 1.1);
      nameBoard(sink, front, u, s0 - 0.35, aw + 0.3, choose(look(), SIGN_BOARDS));
      if (look() < 0.45) {
        const yT = s0 - 0.7, z0 = D / 2;
        sink.prism('structureWood', [[u - aw / 2, yT, z0], [u - aw / 2, yT - 0.55, z0 + 1.15], [u - aw / 2, yT - 0.67, z0 + 1.15], [u - aw / 2, yT - 0.12, z0]],
          [1, 0, 0], aw, { colour: choose(look(), AWNINGS), decor: true });
      }
      if (look() < 0.3) sandbags(sink, front, u, 0, aw, 1.25, look);
    }
    sink.dressing(mobile, () => pocks(sink, front, -W / 2 + 0.3, W / 2 - 0.3, s0 + 0.2, eaveY - 0.3, 3 + Math.floor(look() * 8), look, [], 'plaster'));
    if (brick && !mobile) brickBands(sink, front, -W / 2, W / 2, [eaveY - 0.75], WHITE_TRIM);
  });
  return sink.finish();
}

/** The street row: a shikumen terrace, a shophouse row or a Settlement block, by the bank of the creek it stands on. */
const rowhouse: RegionalBuilder = (ctx) => {
  const bank = bankOf(ctx), r = ctx.rng();
  if (bank === 'zhabei') return r < 0.68 ? shophouseRow(ctx, bank) : shikumenRow(ctx, bank);
  if (bank === 'settlement') return r < 0.4 ? shikumenRow(ctx, bank) : r < 0.72 ? settlementBlock(ctx) : shophouseRow(ctx, bank);
  return r < 0.34 ? shikumenRow(ctx, bank) : r < 0.67 ? shophouseRow(ctx, bank) : settlementBlock(ctx);
};

// ------------------------------------------------------------------------------------------------ ruins

/**
 * A ruin of the shelling: a shophouse's shell (its front's piers standing with their empty windows, the side walls
 * stepping down, the floors fallen in), a house collapsed to broken walls round its rubble with the chimney standing,
 * or a burnt shophouse frame between its party walls behind the charred posts of its front. Every ruin keeps a wall up
 * to a tank's height on each side, so no tank drives into one.
 */
const ruin: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const f = fillOf(ctx.bounds, 0.1);
  sink.placed(0, f.cx, 0, f.cz, () => {
    const rng = ctx.rng, look = ctx.variant, mobile = ctx.tier === 'mobile';
    const W = clampTo(f.w, 3, 30), D = clampTo(f.d, 3, 30), t = 0.32;
    const kind = rng();
    const wall: RegionalBucket = look() < 0.72 ? 'stone' : 'plaster';
    // a wall run along one edge: slices with their own broken tops, a few gone, the ends always kept
    const run = (x0: number, z0: number, x1: number, z1: number, lo: number, hi: number, gaps: number, profile?: (a: number) => number) => {
      const along = Math.abs(x1 - x0) >= Math.abs(z1 - z0), len = along ? Math.abs(x1 - x0) : Math.abs(z1 - z0);
      const n = Math.max(2, Math.round(len / 1.3));
      for (let k = 0; k < n; k++) {
        if (k > 0 && k < n - 1 && rng() < gaps) continue;
        const a = k / n, b = (k + 1) / n;
        const top = profile ? Math.max(lo, profile((a + b) / 2) * (0.82 + rng() * 0.3)) : lo + rng() * (hi - lo);
        if (along) sink.span(wall, x0 + (x1 - x0) * a, -0.3, z0, x0 + (x1 - x0) * b, top, z1);
        else sink.span(wall, x0, -0.3, z0 + (z1 - z0) * a, x1, top, z0 + (z1 - z0) * b);
      }
    };
    const front: Face = { origin: [0, 0, D / 2], u: [1, 0, 0], out: [0, 0, 1], width: W };
    const rubble = (h: number) => {
      for (let k = 0; k < 6; k++) {
        const x = (look() - 0.5) * (W - 1.6), z = (look() - 0.5) * (D - 1.6), s = 0.6 + look() * 1.0;
        sink.span(look() < 0.6 ? wall : 'plaster3', x - s, -0.2, z - s * 0.8, x + s, h * (0.4 + look() * 0.6), z + s * 0.8, DEC);
      }
      for (let k = 0; k < 3; k++) {
        const x = (look() - 0.5) * (W - 2), z = (look() - 0.5) * (D - 2);
        sink.member('structureWood', [x, 0.2, z - 1.2], [x + (look() - 0.5) * 1.5, 0.4 + look() * h, z + 1.2], 0.18, 0.16, [0, 1, 0],
          { colour: CHAR, decor: true, exposed: true }, 0);
      }
    };
    if (kind < 0.36) {
      // the shell: the front's piers to the second storey's broken top, low walls across the shop openings, the
      // spandrel over them where both piers still stand, the upper windows' lintels on the tallest
      const nb = Math.max(2, Math.round(W / 2.1)), bw = W / nb, pw = 0.5;
      const tops: number[] = [];
      for (let k = 0; k <= nb; k++) tops.push(k === 0 || k === nb ? 4.4 + rng() * 2.6 : 3.2 + rng() * 3.9);
      for (let k = 0; k <= nb; k++) {
        const x0 = clampTo(-W / 2 + k * bw - pw / 2, -W / 2, W / 2 - pw);
        sink.span(wall, x0, -0.3, D / 2 - t, x0 + pw, tops[k], D / 2);
      }
      for (let k = 0; k < nb; k++) {
        const a = -W / 2 + k * bw + pw / 2, b = -W / 2 + (k + 1) * bw - pw / 2;
        sink.span(wall, a, -0.3, D / 2 - t, b, 0.9 + rng() * 0.5, D / 2);
        const low = Math.min(tops[k], tops[k + 1]);
        if (low > 4.2) {
          // the spandrel over the shop's opening, blackened by the fire that came out of it
          sink.span(wall, a, 3.2, D / 2 - t, b, 4.0, D / 2);
          facePanel(sink, 'structureMetal', front, (a + b) / 2, 3.6, 0.01, b - a, 0.7, { decor: true, colour: CHAR });
        }
        if (low > 6.4) sink.span(wall, a, 5.9, D / 2 - t, b, 6.4, D / 2);
      }
      const fall = (a: number) => 5.6 - a * 3.8;
      run(-W / 2, D / 2 - t, -W / 2 + t, -D / 2 + t, 1.0, 5.6, 0.18, (a) => fall(1 - a));
      run(W / 2 - t, D / 2 - t, W / 2, -D / 2 + t, 1.0, 5.6, 0.18, (a) => fall(1 - a));
      run(-W / 2, -D / 2, W / 2, -D / 2 + t, 1.0, 2.6, 0.25);
      rubble(2.2);
    } else if (kind < 0.72) {
      // collapsed: broken walls round the rubble, the chimney stack standing
      run(-W / 2, D / 2 - t, W / 2, D / 2, 1.1, 2.6, 0.28);
      run(-W / 2, -D / 2, W / 2, -D / 2 + t, 1.1, 2.4, 0.28);
      run(-W / 2, -D / 2 + t, -W / 2 + t, D / 2 - t, 1.1, 2.5, 0.28);
      run(W / 2 - t, -D / 2 + t, W / 2, D / 2 - t, 1.1, 2.5, 0.28);
      const cx = (rng() < 0.5 ? -1 : 1) * (W / 2 - 1.0), cz = (rng() < 0.5 ? -1 : 1) * (D / 2 - 1.0);
      sink.span(wall, cx - 0.36, -0.3, cz - 0.36, cx + 0.36, 3.6 + rng() * 1.6, cz + 0.36);
      rubble(1.8);
    } else {
      // the burnt shophouse: its party walls to the eaves and the gable's ragged line, the charred posts of its front
      // over the rubble across it, the back wall broken low
      const gable = (a: number) => 5.2 + (1 - Math.abs(2 * a - 1)) * 2.0;
      run(-W / 2, D / 2, -W / 2 + t, -D / 2, 2.0, 7.0, 0.12, gable);
      run(W / 2 - t, D / 2, W / 2, -D / 2, 2.0, 7.0, 0.12, gable);
      run(-W / 2 + t, D / 2 - t, W / 2 - t, D / 2, 1.0, 1.5, 0);
      run(-W / 2 + t, -D / 2, W / 2 - t, -D / 2 + t, 1.2, 3.4, 0.2);
      for (let k = 1; k < Math.max(2, Math.round(W / 2.2)); k++) {
        const x = -W / 2 + k * W / Math.max(2, Math.round(W / 2.2)), h = 1.8 + look() * 2.6;
        sink.member('structureWood', [x, 1.0, D / 2 - 0.15], [x + (look() - 0.5) * 0.3, h, D / 2 - 0.15], 0.22, 0.22, [0, 0, 1],
          { colour: CHAR, decor: true, exposed: true }, 0);
      }
      rubble(1.6);
    }
    sink.dressing(mobile, () => pocks(sink, front, -W / 2 + 0.3, W / 2 - 0.3, 0.3, 2.4, 6 + Math.floor(look() * 8), look, [], 'plaster3'));
  });
  return sink.finish();
};

// ------------------------------------------------------------------------------------------------ the tram depot

function depotDialect(look: () => number): HouseDialect {
  return {
    window: (s, face, o, y0) => {
      windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { ...GODOWN_WINDOW, shutters: null, surround: { bucket: 'plaster3', width: 0.16, out: 0.06, lintel: 0.42 } }, look, 0.2);
    },
    door: (s, face, o, y0) => {
      // the car barn's doorway: the dark depth, the folding doors pushed back, the arch over it
      const y = y0 + o.y0;
      facePanel(s, 'dark', face, o.u, y + o.h / 2, s.recess > 0 ? -s.recess + 0.01 : 0.01, o.w, o.h, DEC);
      const shut = look();
      for (const side of [-1, 1]) {
        const lw = o.w / 2 * (shut < 0.3 ? 1 : 0.32);
        faceBox(s, 'structureWood', face, o.u + side * (o.w / 2 - lw / 2), y + o.h / 2, 0.03, lw, o.h, 0.05, { colour: rgb(0x34403a), decor: true, fineSides: true });
      }
      s.prism('plaster3', archOutline(face, o.u, y + o.h, o.w / 2 + 0.25, 0.55, 0, 8), face.out, 0.12, DEC);
    },
  };
}

/** The tram depot: a brick car barn, its doorways on the street gable under a stepped parapet, tall windows down its sides. */
const tramDepot: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const f = fillOf(ctx.bounds, 0.1);
  sink.placed(0, f.cx, 0, f.cz, () => {
    const look = ctx.variant, mobile = ctx.tier === 'mobile';
    const W = clampTo(f.w, 6, 40), D = clampTo(f.d, 6, 60);
    const roof: RoofSpec = { kind: 'gable', pitchDeg: 22, eave: 0.35, verge: 0, thickness: 0.14, bucket: 'roof', ridge: 'round' };
    const reach = roof.eave + roof.thickness * Math.sin(roof.pitchDeg * DEG) + 0.02;
    const bw = W - 2 * reach, wallH = 5.4;
    const bays = Math.max(1, Math.round(bw / 4.2));
    const openings: Opening[] = [];
    for (let k = 0; k < bays; k++) openings.push({ face: 'front', storey: 0, kind: 'gate', u: -bw / 2 + bw * (k + 0.5) / bays, w: Math.min(3.3, bw / bays - 0.9), y0: 0, h: 3.9 });
    for (const face of ['right', 'left'] as const) openings.push(...windowRhythm(face, 0, D, { w: 1.2, h: 2.1, sill: 2.0, spacing: 2.9, margin: 1.2 }));
    openings.push(...windowRhythm('back', 0, bw, { w: 1.0, h: 1.5, sill: 2.4, spacing: 2.6, margin: 1.0, max: 2 }));
    const spec: HouseSpec = {
      w: bw, d: D, plinth: { h: 0.4, out: 0.06, bucket: 'plaster3' }, storeys: [{ h: wallH, wall: 'stone' }], roof, openings, chimneys: [],
      reveal: 0.22, gableBucket: 'stone', rafters: null, spall: null,
    };
    const frame = buildHouse(sink, spec, depotDialect(look));
    const rg = frame.roof, eaveY = frame.eaveY;
    // the street gable's stepped parapet, its name plate, the clerestory along the ridge
    const fz = D / 2 + 0.05;
    const tiers: Array<readonly [number, number]> = [[0, bw * 0.17], [bw * 0.17, bw * 0.34], [bw * 0.34, bw / 2]];
    tiers.forEach(([a0, a1], i) => {
      const y1 = (rg.topAt(a0, D / 2) ?? eaveY) + (i === 0 ? 1.3 : 0.75);
      const spans: Array<readonly [number, number]> = i === 0 ? [[-a1, a1]] : [[-a1, -a0], [a0, a1]];
      for (const [xa, xb] of spans) {
        sink.span('stone', xa, eaveY, fz - 0.3, xb, y1, fz, SHADOWED);
        sink.span('plaster3', xa - 0.06, y1, fz - 0.36, xb + 0.06, y1 + 0.14, fz + 0.06, SHADOWED);
      }
    });
    const gface: Face = { origin: [0, 0, fz], u: [1, 0, 0], out: [0, 0, 1], width: bw };
    faceBox(sink, 'structureMetal', gface, 0, eaveY + 0.9, 0.02, Math.min(bw * 0.5, 4.2), 0.6, 0.04, { colour: rgb(0x2f3a35), decor: true });
    faceBox(sink, 'structureMetal', gface, 0, eaveY + 0.9, 0.05, Math.min(bw * 0.38, 3.2), 0.22, 0.02, { colour: GILT, decor: true, fine: true });
    sink.span('roof', -0.9, rg.ridgeTopY - 0.2, -D / 2 + 1.2, 0.9, rg.ridgeTopY + 0.75, D / 2 - 1.2, SHADOWED);
    for (const side of [-1, 1]) {
      const cl: Face = { origin: [side * 0.9, 0, 0], u: [0, 0, -side], out: [side, 0, 0], width: D - 2.4 };
      facePanel(sink, 'glass', cl, 0, rg.ridgeTopY + 0.28, 0.01, D - 3.0, 0.5, { decor: true, window: cl.out });
    }
    // pilasters down the sides between the windows
    for (const face of [frame.faces.right, frame.faces.left]) {
      for (let k = 0; k <= Math.round(D / 2.9); k++) {
        faceBox(sink, 'stone', face, -D / 2 + 0.3 + k * (D - 0.6) / Math.round(D / 2.9), (wallH + 0.4) / 2, 0.05, 0.42, wallH + 0.4, 0.1, { decor: true, fineSides: true });
      }
    }
    sink.dressing(mobile, () => pocks(sink, frame.faces.front, -bw / 2 + 0.3, bw / 2 - 0.3, 0.5, wallH, 8 + Math.floor(look() * 10), look, [], 'plaster3'));
    if (look() < 0.5) roofHole(sink, rg.ridgeTopY, 0, bw / 2, roof, 0, look);
  });
  return sink.finish();
};

// ------------------------------------------------------------------------------------------------ godowns

function godownDialect(look: () => number): HouseDialect {
  return {
    window: (s, face, o, y0) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, GODOWN_WINDOW, look, 0.12),
    door: (s, face, o, y0) => {
      gateUnit(s, face, o.u, y0 + o.y0, o.w, o.h, rgb(0x3a4a40), { bucket: 'plaster3', width: 0.16, out: 0.06 });
    },
  };
}

/**
 * A brick godown on the creek: three storeys of iron-shuttered windows, the loading doors stacked up the street gable
 * under the hoist beam, the company's name painted under the parapet, sandbags at the street door.
 */
const godown: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const f = fillOf(ctx.bounds, 0.1);
  sink.placed(0, f.cx, 0, f.cz, () => {
    const look = ctx.variant, mobile = ctx.tier === 'mobile';
    const W = clampTo(f.w, 6, 50), D = clampTo(f.d, 6, 60);
    const floors = 3, sh = 3.1;
    const openings: Opening[] = [];
    for (let st = 0; st < floors; st++) {
      openings.push({ face: 'front', storey: st, kind: st === 0 ? 'gate' : 'door', u: 0, w: st === 0 ? 2.8 : 1.8, y0: st === 0 ? 0 : 0.25, h: st === 0 ? 2.8 : 2.3 });
      openings.push(...windowRhythm('front', st, W, { w: 1.0, h: 1.4, sill: 1.0, spacing: 2.8, margin: 1.0, avoid: [[-1.9, 1.9]] }));
      for (const face of ['right', 'left'] as const) openings.push(...windowRhythm(face, st, D, { w: 1.0, h: 1.4, sill: 1.0, spacing: 3.4, margin: 1.2 }));
      openings.push(...windowRhythm('back', st, W, { w: 1.0, h: 1.4, sill: 1.0, spacing: 3.6, margin: 1.2 }));
    }
    const spec: HouseSpec = {
      w: W, d: D, plinth: null, storeys: Array.from({ length: floors }, () => ({ h: sh, wall: 'stone' as RegionalBucket })),
      roof: { kind: 'flat', pitchDeg: 0, eave: 0, verge: 0, thickness: 0.3, bucket: 'plaster3', parapet: 1.1 }, openings, chimneys: [],
      reveal: 0.22, rafters: null, spall: null,
    };
    const frame = buildHouse(sink, spec, godownDialect(look));
    const eaveY = frame.eaveY, front = frame.faces.front;
    // the name band under the parapet, the hoist beam and its tackle over the loading doors
    for (const face of [front, frame.faces.right, frame.faces.left]) {
      facePanel(sink, 'plaster', face, 0, eaveY - 0.45, 0.015, face.width - 1.2, 0.7, DEC);
      faceBox(sink, 'structureMetal', face, 0, eaveY - 0.45, 0.03, (face.width - 1.2) * 0.7, 0.3, 0.012, { colour: rgb(0x2a2724), decor: true, fine: true });
    }
    sink.member('structureWood', [0, eaveY + 0.9, D / 2 - 0.4], [0, eaveY + 0.9, D / 2 + 1.0], 0.22, 0.22, [0, 1, 0], { colour: rgb(0x3b3029), decor: true, exposed: true, shadow: true }, 0);
    sink.cylinder('structureMetal', [0, eaveY - 1.6, D / 2 + 0.85], 'y', 2.4, 0.015, 4, { colour: IRON, decor: true, fine: true });
    // pilasters along the long sides
    for (const face of [frame.faces.right, frame.faces.left]) {
      const n = Math.max(2, Math.round(D / 3.4));
      for (let k = 0; k <= n; k++) faceBox(sink, 'stone', face, -D / 2 + 0.3 + k * (D - 0.6) / n, eaveY / 2, 0.05, 0.45, eaveY, 0.1, { decor: true, fineSides: true });
    }
    if (look() < 0.6) sandbags(sink, front, 0, 0, 3.6, 1.3, look);
    sink.dressing(mobile, () => pocks(sink, front, -W / 2 + 0.3, W / 2 - 0.3, 0.5, eaveY - 0.5, 8 + Math.floor(look() * 12), look, [{ u0: -1.6, u1: 1.6, y0: 0, y1: eaveY }]));
  });
  return sink.finish();
};

// ------------------------------------------------------------------------------------------------ the cotton mill

function millDialect(look: () => number): HouseDialect {
  const style: WindowStyle = { frame: IRON, frameWidth: 0.06, frameOut: 0.04, bars: 'six', surround: null, sill: { bucket: 'plaster3', out: 0.08 }, shutters: null };
  return {
    window: (s, face, o, y0) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, style, look, 0.15),
    door: (s, face, o, y0) => gateUnit(s, face, o.u, y0 + o.y0, o.w, o.h, rgb(0x3a3a34), { bucket: 'plaster3', width: 0.2, out: 0.08 }),
  };
}

/** A cotton mill: four storeys of brick with its rows of mill windows, the stair and water tower on a corner, its name. */
const cottonMill: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const f = fillOf(ctx.bounds, 0.1);
  sink.placed(0, f.cx, 0, f.cz, () => {
    const look = ctx.variant, mobile = ctx.tier === 'mobile';
    const W = clampTo(f.w, 6, 50), D = clampTo(f.d, 6, 60);
    const floors = ctx.info.h > 12 ? 4 : 2, sh = 3.55;
    const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'gate', u: -W * 0.18, w: 3.0, y0: 0, h: 3.0 }];
    for (let st = 0; st < floors; st++) {
      openings.push(...windowRhythm('front', st, W, { w: 1.5, h: 2.0, sill: 0.9, spacing: 3.0, margin: 0.9, avoid: st === 0 ? [[-W * 0.18 - 1.6, -W * 0.18 + 1.6]] : [] }));
      for (const face of ['right', 'left'] as const) openings.push(...windowRhythm(face, st, D, { w: 1.5, h: 2.0, sill: 0.9, spacing: 3.0, margin: 0.9 }));
      openings.push(...windowRhythm('back', st, W, { w: 1.5, h: 2.0, sill: 0.9, spacing: 3.2, margin: 0.9 }));
    }
    const spec: HouseSpec = {
      w: W, d: D, plinth: null, storeys: Array.from({ length: floors }, () => ({ h: sh, wall: 'stone' as RegionalBucket })),
      roof: { kind: 'flat', pitchDeg: 0, eave: 0, verge: 0, thickness: 0.3, bucket: 'plaster3', parapet: 0.9 }, openings, chimneys: [],
      reveal: 0.2, rafters: null, spall: null,
    };
    const frame = buildHouse(sink, spec, millDialect(look));
    const eaveY = frame.eaveY;
    // the stair and water tower on the back corner, standing a hand proud of the mill's walls
    const tw = clampTo(Math.min(W, D) * 0.3, 2.6, 4.6), tTop = eaveY + 5.2;
    const tx0 = W / 2 - tw, tz1 = -D / 2 + tw;
    sink.span('stone', tx0, -0.4, -D / 2 - 0.06, W / 2 + 0.06, tTop, tz1);
    sink.span('plaster3', tx0 - 0.08, tTop, -D / 2 - 0.14, W / 2 + 0.14, tTop + 0.35, tz1 + 0.08, SHADOWED);
    sink.cylinder('structureMetal', [tx0 + tw / 2, tTop + 0.35, -D / 2 + tw / 2], 'y', 2.4, tw * 0.42, 12, { colour: rgb(0x4b4d4a), decor: true, shadow: true });
    pyramid(sink, 'structureMetal', tx0 + tw / 2, -D / 2 + tw / 2, tw * 0.44, tw * 0.44, tTop + 2.75, tTop + 3.6, { colour: rgb(0x3d3f3c), decor: true, shadow: true });
    const tf: Face = { origin: [W / 2 + 0.06, 0, -D / 2 + tw / 2], u: [0, 0, -1], out: [1, 0, 0], width: tw };
    for (let y = 2.2; y < tTop - 1.5; y += sh) facePanel(sink, 'glass', tf, 0, y + 0.9, 0.01, 0.7, 1.4, { decor: true, window: tf.out });
    // the mill's name along the parapet of its street front
    facePanel(sink, 'plaster', frame.faces.front, 0, eaveY + 0.75, 0.015, Math.min(W - 2, 9), 0.8, DEC);
    faceBox(sink, 'structureMetal', frame.faces.front, 0, eaveY + 0.75, 0.025, Math.min(W - 2, 9) * 0.75, 0.36, 0.012, { colour: rgb(0x262422), decor: true, fine: true });
    sink.dressing(mobile, () => pocks(sink, frame.faces.front, -W / 2 + 0.3, W / 2 - 0.3, 0.4, eaveY, 10 + Math.floor(look() * 12), look));
  });
  return sink.finish();
};

// ------------------------------------------------------------------------------------------------ the fire station

function fireDialect(look: () => number): HouseDialect {
  return {
    window: (s, face, o, y0) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, SASH, look, 0.3),
    door: (s, face, o, y0) => {
      const y = y0 + o.y0;
      facePanel(s, 'dark', face, o.u, y + o.h / 2, s.recess > 0 ? -s.recess + 0.01 : 0.01, o.w, o.h, DEC);
      const open = look() < 0.4;
      for (const side of [-1, 1]) {
        if (open && side > 0) continue;
        faceBox(s, 'structureWood', face, o.u + side * o.w / 4, y + o.h / 2, 0.03, o.w / 2 - 0.03, o.h, 0.05, { colour: rgb(0x7a2a22), decor: true, fineSides: true });
      }
      s.prism('plaster', archOutline(face, o.u, y + o.h, o.w / 2 + 0.22, 0.6, 0, 8), face.out, 0.1, DEC);
    },
  };
}

/** The fire station: three storeys of red brick over its engine bays, the watch tower on its corner with the lookout's gallery and clock. */
const fireStation: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const f = fillOf(ctx.bounds, 0.1);
  sink.placed(0, f.cx, 0, f.cz, () => {
    const look = ctx.variant, mobile = ctx.tier === 'mobile';
    const W = clampTo(f.w, 6, 40), D = clampTo(f.d, 6, 40);
    const tw = clampTo(Math.min(W, D) * 0.32, 2.4, 4.2);
    const bayW = W - tw - 0.4, bays = Math.max(1, Math.round(bayW / 3.6));
    const storeys = ctx.info.h > 11 ? 3 : 2;
    const openings: Opening[] = [];
    for (let k = 0; k < bays; k++) openings.push({ face: 'front', storey: 0, kind: 'gate', u: -W / 2 + tw + 0.4 + bayW * (k + 0.5) / bays, w: Math.min(3.0, bayW / bays - 0.7), y0: 0, h: 3.5 });
    for (let st = 1; st < storeys; st++) {
      openings.push(...windowRhythm('front', st, W, { w: 1.1, h: 1.8, sill: 0.8, spacing: 2.2, margin: 0.8, avoid: [[-W / 2, -W / 2 + tw + 0.2]] }));
      for (const face of ['right', 'left'] as const) openings.push(...windowRhythm(face, st, D, { w: 1.1, h: 1.8, sill: 0.8, spacing: 2.6, margin: 1.0 }));
    }
    for (const face of ['right', 'left', 'back'] as const) openings.push(...windowRhythm(face, 0, face === 'back' ? W : D, { w: 1.0, h: 1.6, sill: 1.1, spacing: 3.0, margin: 1.2 }));
    const spec: HouseSpec = {
      w: W, d: D, plinth: null,
      storeys: [{ h: 4.4, wall: 'plaster3' }, ...Array.from({ length: storeys - 1 }, () => ({ h: 3.4, wall: 'stone' as RegionalBucket }))],
      roof: { kind: 'flat', pitchDeg: 0, eave: 0, verge: 0, thickness: 0.3, bucket: 'plaster3', parapet: 0.9 }, openings, chimneys: [],
      reveal: 0.18, rafters: null, spall: 'stone',
    };
    const frame = buildHouse(sink, spec, fireDialect(look));
    const eaveY = frame.eaveY;
    for (let st = 1; st < storeys; st++) faceBox(sink, 'plaster', frame.faces.front, 0, frame.floors[st] - 0.05, 0.05, W, 0.16, 0.1, { decor: true, fineSides: true });
    // the watch tower on the front corner: its shaft, the lookout's gallery and railing, the clock, the cap
    const tTop = Math.max(eaveY + 7.5, 20.5);
    const x0 = -W / 2 - 0.06, x1 = -W / 2 + tw, z0 = D / 2 - tw, z1 = D / 2 + 0.06;
    sink.span('stone', x0, -0.4, z0, x1, tTop, z1);
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, half = tw / 2 + 0.06;
    sink.span('plaster3', x0 - 0.45, tTop, z0 - 0.45, x1 + 0.45, tTop + 0.22, z1 + 0.45, SHADOWED);
    for (const [fx, fz, ux, uz] of [[0, 1, 1, 0], [1, 0, 0, -1], [0, -1, -1, 0], [-1, 0, 0, 1]] as const) {
      const gf: Face = { origin: [cx + fx * (half + 0.4), 0, cz + fz * (half + 0.4)], u: [ux, 0, uz], out: [fx, 0, fz], width: tw + 0.9 };
      faceBox(sink, 'structureMetal', gf, 0, tTop + 1.05, 0, tw + 0.9, 0.05, 0.05, { colour: IRON, decor: true });
      for (let b = 0; b <= 8; b++) faceBox(sink, 'structureMetal', gf, -(tw + 0.9) / 2 + b * (tw + 0.9) / 8, tTop + 0.63, 0, 0.03, 0.82, 0.03, { colour: IRON, decor: true, fine: true });
      const cf: Face = { origin: [cx + fx * half, 0, cz + fz * half], u: [ux, 0, uz], out: [fx, 0, fz], width: tw };
      faceBox(sink, 'structureMetal', cf, 0, tTop - 1.6, 0.02, tw * 0.55, tw * 0.55, 0.04, { colour: WHITE_TRIM, decor: true });
      faceBox(sink, 'structureMetal', cf, 0, tTop - 1.45, 0.05, 0.05, tw * 0.22, 0.02, { colour: IRON, decor: true, fine: true });
      for (let y = 5.5; y < tTop - 3.5; y += 3.2) facePanel(sink, 'glass', cf, 0, y, 0.01, 0.5, 1.4, { decor: true, window: cf.out });
    }
    for (const [px, pz] of [[x0 + 0.15, z0 + 0.15], [x1 - 0.15, z0 + 0.15], [x1 - 0.15, z1 - 0.15], [x0 + 0.15, z1 - 0.15]] as const) {
      sink.cylinder('structureMetal', [px, tTop + 0.22, pz], 'y', 2.2, 0.08, 6, { colour: IRON, decor: true, shadow: true });
    }
    pyramid(sink, 'roof', cx, cz, half + 0.35, half + 0.35, tTop + 2.42, tTop + 3.9, SHADOWED);
    sink.cylinder('structureMetal', [cx, tTop + 3.85, cz], 'y', 2.4, 0.04, 4, { colour: IRON, decor: true, fine: true });
    sink.dressing(mobile, () => pocks(sink, frame.faces.front, -W / 2 + tw + 0.4, W / 2 - 0.3, 0.4, eaveY, 6 + Math.floor(look() * 8), look));
  });
  return sink.finish();
};

// ------------------------------------------------------------------------------------------------ the guild hall

/**
 * A guild hall (huiguan) of one of the provinces' merchants: its grey brick walls round the court with a tiled coping,
 * the gate under its own swept roof between red columns, the main hall at the back of the court under a hipped roof with
 * the gablets of a hip-and-gable, its corners swept up, its ridge ending in curls, red columns along its front.
 */
const guildHall: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const f = fillOf(ctx.bounds, 0.1);
  sink.placed(0, f.cx, 0, f.cz, () => {
    const look = ctx.variant, mobile = ctx.tier === 'mobile';
    const W = clampTo(f.w, 6, 40), D = clampTo(f.d, 6, 40), t = 0.36, wallH = 5.0;
    const wall: RegionalBucket = look() < 0.6 ? 'stone' : 'plaster';
    // the enclosure
    sink.span(wall, -W / 2, -0.4, D / 2 - t, W / 2, wallH, D / 2);
    sink.span(wall, -W / 2, -0.4, -D / 2, W / 2, wallH, -D / 2 + t);
    sink.span(wall, -W / 2, -0.4, -D / 2 + t, -W / 2 + t, wallH, D / 2 - t);
    sink.span(wall, W / 2 - t, -0.4, -D / 2 + t, W / 2, wallH, D / 2 - t);
    const cap = { ...SHADOWED, colour: TILE_COPING };
    sink.span('structureMetal', -W / 2 - 0.05, wallH, D / 2 - t - 0.08, W / 2 + 0.05, wallH + 0.14, D / 2 + 0.08, cap);
    sink.span('structureMetal', -W / 2 - 0.05, wallH, -D / 2 - 0.08, W / 2 + 0.05, wallH + 0.14, -D / 2 + t + 0.08, cap);
    sink.span('structureMetal', -W / 2 - 0.08, wallH, -D / 2 + t, -W / 2 + t + 0.08, wallH + 0.14, D / 2 - t, cap);
    sink.span('structureMetal', W / 2 - t - 0.08, wallH, -D / 2 + t, W / 2 + 0.08, wallH + 0.14, D / 2 - t, cap);
    // the main hall at the back of the court
    const hx = W / 2 - 1.5, hz0 = -D / 2 + 1.3, hz1 = clampTo(D / 2 - 4.8, hz0 + 4, D / 2 - 2.5), hallH = 6.0;
    sink.span('plaster', -hx, -0.4, hz0, hx, hallH, hz1);
    const roof: RoofSpec = { kind: 'hip', pitchDeg: 31, eave: 1.05, verge: 1.05, thickness: 0.2, bucket: 'roof', ridge: null, hipPitchDeg: 36 };
    const rg = roofGeometry(hz1 - hz0, 2 * hx, hallH, roof);
    const hzc = (hz0 + hz1) / 2;
    sink.placed(Math.PI / 2, 0, 0, hzc, () => emitRoof(sink, rg, roof));
    raisedRidge(sink, -rg.ridgeHalf - 0.2, rg.ridgeHalf + 0.2, rg.ridgeTopY, hzc, 0.75);
    // the gablets of the hip-and-gable, the corners swept up
    const tanP = Math.tan(roof.pitchDeg * DEG), gh = Math.min(1.5, (rg.ridgeY - hallH) * 0.55), gb = gh / tanP;
    for (const side of [-1, 1]) {
      const gx = side * (rg.ridgeHalf + 0.05);
      // the gablet's outer face is the cap the prism starts from: counter-clockwise seen from inside the hall
      const pts: Vec3[] = side > 0
        ? [[gx, rg.ridgeTopY - gh, hzc - gb], [gx, rg.ridgeTopY - gh, hzc + gb], [gx, rg.ridgeTopY, hzc]]
        : [[gx, rg.ridgeTopY - gh, hzc + gb], [gx, rg.ridgeTopY - gh, hzc - gb], [gx, rg.ridgeTopY, hzc]];
      sink.prism('plaster', pts, [-side, 0, 0], 0.16, SHADOWED);
    }
    const ex = hx + roof.eave, ez = (hz1 - hz0) / 2 + roof.eave, low = hallH - roof.eave * tanP;
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        sink.member('roof', [sx * (ex - 1.2), low + 0.2, hzc + sz * (ez - 1.2)], [sx * (ex + 0.25), low + 0.75, hzc + sz * (ez + 0.25)], 0.34, 0.16,
          [0, 1, 0], { ...SHADOWED, exposed: true }, 0);
      }
    }
    // the hall's front: red columns under the eave, the lattice doors between them
    const hf: Face = { origin: [0, 0, hz1], u: [1, 0, 0], out: [0, 0, 1], width: 2 * hx };
    const cols = Math.max(3, Math.round(2 * hx / 2.4));
    for (let k = 0; k <= cols; k++) {
      const u = -hx + 0.3 + k * (2 * hx - 0.6) / cols;
      sink.cylinder('structureWood', facePoint(hf, u, 0, 0.75), 'y', hallH, 0.2, 8, { colour: CHINA_RED, decor: true, shadow: true });
      if (k < cols) {
        const cu = u + (2 * hx - 0.6) / cols / 2;
        facePanel(sink, 'structureWood', hf, cu, 1.6, 0.01, (2 * hx - 0.6) / cols - 0.5, 3.0, { colour: shade(CHINA_RED, 0.75), decor: true });
        if (!mobile) for (let j = 0; j < 4; j++) faceBox(sink, 'structureWood', hf, cu, 0.6 + j * 0.7, 0.03, (2 * hx - 0.6) / cols - 0.6, 0.04, 0.03, { colour: GILT, decor: true, fine: true });
      }
    }
    faceBox(sink, 'structureWood', hf, 0, hallH - 0.4, 0.78, 2 * hx, 0.5, 0.26, { colour: shade(CHINA_RED, 0.6), decor: true, shadow: true });
    // the gate: red columns and a little swept roof proud of the front wall, the lacquer leaves, the name board
    const front: Face = { origin: [0, 0, D / 2], u: [1, 0, 0], out: [0, 0, 1], width: W };
    const gw = Math.min(3.2, W * 0.28);
    facePanel(sink, 'dark', front, 0, 1.6, 0.01, gw, 3.2, DEC);
    for (const side of [-1, 1]) {
      faceBox(sink, 'structureWood', front, side * gw / 4, 1.6, 0.04, gw / 2 - 0.04, 3.15, 0.06, { colour: shade(CHINA_RED, 0.8), decor: true, fineSides: true });
      sink.cylinder('structureWood', facePoint(front, side * (gw / 2 + 0.35), 0, 0.55), 'y', 4.2, 0.17, 8, { colour: CHINA_RED, decor: true, shadow: true });
    }
    const groof: RoofSpec = { kind: 'hip', pitchDeg: 30, eave: 0.45, verge: 0.45, thickness: 0.14, bucket: 'roof', ridge: null, decor: true };
    sink.placed(Math.PI / 2, 0, 0, D / 2 + 0.25, () => emitRoof(sink, roofGeometry(1.5, gw + 1.4, 4.25, groof), groof));
    nameBoard(sink, front, 0, 3.75, gw * 0.8, LACQUER);
    // an incense burner in the court
    sink.cylinder('structureMetal', [0, 0, (hz1 + D / 2 - t) / 2], 'y', 0.9, 0.42, 8, { colour: rgb(0x4a4136), decor: true }, 0.55);
    sink.dressing(mobile, () => pocks(sink, front, -W / 2 + 0.3, W / 2 - 0.3, 0.4, wallH - 0.3, 6 + Math.floor(look() * 8), look, [{ u0: -gw / 2 - 0.6, u1: gw / 2 + 0.6, y0: 0, y1: wallH }]));
  });
  return sink.finish();
};

export const SHANGHAI_BUILDERS: Readonly<Record<string, RegionalBuilder>> = Object.freeze({
  rowhouse,
  ruin,
  depot: tramDepot,
  warehouse: godown,
  factory: cottonMill,
  firestation: fireStation,
  foundryoffice: guildHall,
  ...SHANGHAI_BUND_BUILDERS,
});

export const SHANGHAI_STYLE: ArchitectureStyle = Object.freeze<ArchitectureStyle>({
  id: 'shanghai',
  region: 'Shanghai in 1937 on both banks of Suzhou Creek: the International Settlement\'s shikumen lanes, brick blocks, godowns '
    + 'and the Bund\'s granite and Art Deco towers; Zhabei\'s shophouses, shelled and burnt',
  surfaces: {
    // the lanes' grey canal tiles; brick (grey, banded red in the later lanes; the towers' brown)
    roof: { kind: 'canal', tint: [0.36, 0.37, 0.38] },
    stone: { kind: 'brick', tint: [0.56, 0.36, 0.30] },
    sourced: { plaster: true, wood: true },
    tones: {
      plaster: (_h, s, l) => [0.1, Math.min(1, s * 0.25 + 0.03), Math.min(1, l * 0.98 + 0.07)],
      plaster2: (_h, s, l) => [0.11, Math.min(1, s * 0.55 + 0.2), Math.min(1, l * 1.02 + 0.06)],
      plaster3: (_h, s, l) => [0.09, Math.min(1, s * 0.12 + 0.03), Math.min(1, l * 0.9 + 0.05)],
    },
  },
  builders: SHANGHAI_BUILDERS,
  weather: {
    plaster: [[1, 1, 1], [0.96, 0.95, 0.92], [0.9, 0.89, 0.86], [1.0, 0.97, 0.93]],
    // grey brick, brown brick, the red of the later lanes
    stone: [[1, 1, 1], [0.78, 0.8, 0.84], [0.9, 0.82, 0.78], [1.06, 0.9, 0.84], [0.84, 0.76, 0.72]],
    roof: [[1, 1, 1], [0.9, 0.9, 0.92], [0.82, 0.82, 0.84], [1.04, 1.02, 1.0]],
    damp: 0.85, moss: 0.35,
  },
  // the autumn of 1937: Zhabei shelled and burnt, the Settlement's edges pocked
  wear: 0.3,
});

export type { RegionalParts, Rgb };
