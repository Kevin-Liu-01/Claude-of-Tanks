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
import {
  buildHouse, emitRoof, holedPolygon, recordBody, roofGeometry, windowRhythm, type HouseDialect, type HouseSpec, type Opening, type RoofSpec,
} from './house.ts';
import { doorUnit, gateUnit, windowUnit, type WindowStyle } from './openings.ts';
import { ruinHouse, type RuinHead } from './ruinGrammar.ts';
import type { ArchitectureStyle, RegionalBuildContext, RegionalBuilder } from './types.ts';
import {
  AWNINGS, CHAR, CHINA_RED, DEG, GILT, GODOWN_WINDOW, IRON, LACQUER, SASH, SIGN_BOARDS, TEAK, TILE_COPING, WHITE_TRIM,
  archOutline, bankOf, brickBands, choose, clampTo, fillOf, nameBoard, pocks, pyramid, raisedRidge, roofHole, rowFill, sandbags,
  signboard, uvOffset,
} from './shanghaiParts.ts';
import { SHANGHAI_BUND_BUILDERS } from './shanghaiBund.ts';
import { shikumenRow, shophouseRow } from './shanghaiLanes.ts';
import { hoistTackle } from './shanghaiHoist.ts';

const DEC = { decor: true } as const;
/**
 * (looks 227, the census world pass: the godowns, the mill and the fire station stood on the ground at y = 0 with nothing
 * sunk, so a slope opened under their downhill feet) a footing under the walls, the ground storey's own masonry carried
 * 0.6 m down (house.ts plinth) to the ground line: it shows only where the ground falls away, and every storey, opening
 * and part over it stands where it stood. Collision-bearing.
 */
const footing = (bucket: RegionalBucket): NonNullable<HouseSpec['plinth']> => ({ h: 0, out: 0, bucket, course: false });
const SHADOWED = { decor: true, shadow: true } as const;

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

/**
 * (looks 227) The Settlement's sashes under a moulded hood over their stucco surrounds (the facade craft lays the hood in
 * place of the surround's flat lintel on a desktop build).
 */
const BLOCK_SASH: WindowStyle = { ...SASH, head: { kind: 'hood', bucket: 'plaster', h: 0.2, out: 0.08, ext: 0.05 } };

function blockDialect(look: () => number): HouseDialect {
  return {
    window: (s, face, o, y0) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, BLOCK_SASH, look, 0.3),
    door: (s, face, o, y0, frame) => {
      if (o.kind === 'shopfront') { settlementShop(s, face, o, y0, look); return; }
      doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h,
        { leaf: rgb(0x3d3a36), frame: { bucket: 'plaster3', width: 0.12, out: 0.05 }, transom: false, steps: { bucket: 'plaster3' }, leafKind: 'plank' },
        frame.floors[o.storey] + o.y0);
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
    // (looks 227) the grey stone shop storey on its granite plinth, the shops a step up from the street
    const spec: HouseSpec = {
      w: W, d: D, plinth: { h: 0.3, out: 0.06, bucket: 'plaster3' }, skirt: null,
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
        // (looks 227, the contact audit: the bars stood 4 cm over the slab) from the slab's top to the rail
        faceBox(sink, 'structureMetal', front, -bw / 2 + b * bw / Math.round(bw / 0.16), by + 0.485, 0.88, 0.022, 0.95, 0.022, { colour: IRON, decor: true, fine: true });
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
      nameBoard(sink, front, u, frame.floors[1] - 0.35, aw + 0.3, choose(look(), SIGN_BOARDS));
      if (look() < 0.45) {
        const yT = frame.floors[1] - 0.7, z0 = D / 2;
        sink.prism('structureWood', [[u - aw / 2, yT, z0], [u - aw / 2, yT - 0.55, z0 + 1.15], [u - aw / 2, yT - 0.67, z0 + 1.15], [u - aw / 2, yT - 0.12, z0]],
          [1, 0, 0], aw, { colour: choose(look(), AWNINGS), decor: true });
      }
      if (look() < 0.3) sandbags(sink, front, u, 0, aw, 1.25, look);
    }
    // (looks 227, the integrity check: a pock fell over a window and hung in its reveal) clear of the front's openings
    const keepOpen = frame.spec.openings.filter((o) => o.face === 'front').map((o) => ({ u0: o.u - o.w / 2 - 0.25, u1: o.u + o.w / 2 + 0.25,
      y0: frame.floors[o.storey] + o.y0 - 0.3, y1: frame.floors[o.storey] + o.y0 + o.h + 0.45 }));
    sink.dressing(mobile, () => pocks(sink, front, -W / 2 + 0.3, W / 2 - 0.3, frame.floors[1] + 0.2, eaveY - 0.3, 3 + Math.floor(look() * 8), look, keepOpen, 'plaster'));
    // (looks 227: the white course ran across the top storey's windows at eaveY - 0.75) the sill course under them
    if (brick && !mobile) brickBands(sink, front, -W / 2, W / 2, [frame.floors[floors - 1] + 0.62], WHITE_TRIM);
  });
  return sink.finish();
}

/** The street row: a shikumen terrace, a shophouse row or a Settlement block, by the bank of the creek it stands on. */
const rowhouse: RegionalBuilder = (ctx) => {
  const bank = bankOf(ctx), r = ctx.rng();
  // a lane's terrace (round 2's lilong rows on the empty lots: plots of four or more gate houses) is always shikumen
  if (ctx.info.w >= 19) return shikumenRow(ctx, bank);
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
    // (props census #7, lane B 2026-10-14; the judges: "slices of span boxes to random tops, the rubble boxes, the soot a
    // painted panel") the ruin grammar (ruinGrammar.ts): the shophouse's own walls, storeys and openings broken — every
    // wall's head at least a tank's height (1.1 m), the shops' openings over their sills
    const nb = Math.max(2, Math.round(W / 2.1)), bw = W / nb;
    const openings: Opening[] = [];
    const base = { w: W, d: D, t, wall, plinth: null, storeys: [3.6, 3.2], stub: 1.1, lintel: { bucket: 'stone' as const },
      roof: { bucket: 'roof' as const, piece: [0.45, 0.3, 0.03] as const }, timber: CHAR, mobile };
    if (kind < 0.36) {
      // the shell: the front to its broken second storey over the shops' openings and the windows above them, the side
      // walls falling from the front to the back, the back broken low
      for (let k = 0; k < nb; k++) {
        const u = -W / 2 + (k + 0.5) * bw;
        openings.push({ face: 'front', storey: 0, kind: 'shopfront', u, w: Math.max(0.8, bw - 0.6), y0: 0.9 + rng() * 0.5, h: 2.1 });
        openings.push({ face: 'front', storey: 1, kind: 'window', u, w: Math.min(1.1, bw - 0.9), y0: 0.8, h: 1.6 });
      }
      ruinHouse(sink, { ...base, openings, heads: {
        front: { a: 4.4 + rng() * 2.6, b: 4.4 + rng() * 2.6, at: 0.2 + rng() * 0.6, dip: 0.2 + rng() * 0.3, ragged: 0.4 },
        right: { a: 5.6, b: 1.8, ragged: 0.4 }, left: { a: 1.8, b: 5.6, ragged: 0.4 }, back: { a: 1.2 + rng() * 1.4, b: 1.2 + rng() * 1.4, ragged: 0.3 },
      } }, rng, look);
    } else if (kind < 0.72) {
      // collapsed: broken walls round the rubble, the chimney stack standing
      const low = (): RuinHead => ({ a: 1.1 + rng() * 1.5, b: 1.1 + rng() * 1.5, at: rng(), dip: 0.2, ragged: 0.3 });
      openings.push({ face: 'front', storey: 0, kind: 'door', u: (rng() - 0.5) * (W - 2.4), w: 1.0, y0: 0.15, h: 2.1 });
      const cx = (rng() < 0.5 ? -1 : 1) * (W / 2 - 1.0), cz = (rng() < 0.5 ? -1 : 1) * (D / 2 - 1.0);
      ruinHouse(sink, { ...base, openings, heads: { front: low(), right: low(), back: low(), left: low() },
        chimney: { x: cx, z: cz, w: 0.72, h: 3.6 + rng() * 1.6, bucket: wall } }, rng, look);
    } else {
      // the burnt shophouse: its party walls to the eaves and the gable's ragged line, the charred posts of its front
      // over the rubble across it, the back wall broken low
      const gable = (): RuinHead => ({ a: 5.2, b: 5.2, at: 0.5, dip: -0.38, ragged: 0.35 });
      ruinHouse(sink, { ...base, openings, heads: { right: gable(), left: gable(), front: { a: 1.1 + rng() * 0.4, b: 1.1 + rng() * 0.4, ragged: 0.2 },
        back: { a: 1.2 + rng() * 2.2, b: 1.2 + rng() * 2.2, ragged: 0.3 } } }, rng, look);
      for (let k = 1; k < Math.max(2, Math.round(W / 2.2)); k++) {
        const x = -W / 2 + k * W / Math.max(2, Math.round(W / 2.2)), h = 1.8 + look() * 2.6;
        sink.member('structureWood', [x, 1.0, D / 2 - t - 0.15], [x + (look() - 0.5) * 0.3, h, D / 2 - t - 0.15], 0.22, 0.22, [0, 0, 1],
          { colour: CHAR, decor: true, exposed: true }, 0);
      }
    }
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
    // (props census #4, lane B 2026-10-14: "a name plate and the clerestory's glass stuck on") the plate stands 10 cm
    // off the gable on its cleats; the clerestory's glass is let in between its posts, the barn's dark roof space behind
    const pw = Math.min(bw * 0.5, 4.2);
    faceBox(sink, 'structureMetal', gface, 0, eaveY + 0.9, 0.12, pw, 0.6, 0.04, { colour: rgb(0x2f3a35), decor: true });
    for (const cu of [-pw * 0.35, pw * 0.35]) faceBox(sink, 'structureMetal', gface, cu, eaveY + 0.9, 0.05, 0.08, 0.4, 0.1, { colour: rgb(0x2f3a35), decor: true });
    faceBox(sink, 'structureMetal', gface, 0, eaveY + 0.9, 0.15, Math.min(bw * 0.38, 3.2), 0.22, 0.02, { colour: GILT, decor: true, fine: true });
    const cy0 = rg.ridgeTopY + 0.02, cy1 = rg.ridgeTopY + 0.55, cz = D / 2 - 1.2;
    sink.span('roof', -0.9, rg.ridgeTopY - 0.2, -cz, 0.9, cy0, cz, SHADOWED);
    sink.span('roof', -0.9, cy1, -cz, 0.9, rg.ridgeTopY + 0.75, cz, SHADOWED);
    const posts = Math.max(2, Math.round(2 * cz / 3));
    for (let k = 0; k <= posts; k++) {
      const z = -cz + 2 * cz * k / posts, z0 = k === 0 ? z : k === posts ? z - 0.2 : z - 0.06, z1 = k === 0 ? z + 0.2 : k === posts ? z : z + 0.06;
      sink.span('roof', -0.9, cy0, z0, 0.9, cy1, z1, SHADOWED);
    }
    sink.span('dark', -0.6, cy0, -cz + 0.2, 0.6, cy1, cz - 0.2, DEC);
    for (const side of [-1, 1]) {
      const cl: Face = { origin: [side * 0.9, 0, 0], u: [0, 0, -side], out: [side, 0, 0], width: D - 2.4 };
      facePanel(sink, 'glass', cl, 0, (cy0 + cy1) / 2, -0.03, D - 2.8, cy1 - cy0, { decor: true, window: cl.out });
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
      w: W, d: D, plinth: footing('stone'), skirt: null, storeys: Array.from({ length: floors }, () => ({ h: sh, wall: 'stone' as RegionalBucket })),
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
    hoistTackle(sink, eaveY, D); // (looks r2 b-east, 2026-10-16: extracted to shanghaiHoist.ts, rebuilt there)
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
      w: W, d: D, plinth: footing('stone'), skirt: null, storeys: Array.from({ length: floors }, () => ({ h: sh, wall: 'stone' as RegionalBucket })),
      roof: { kind: 'flat', pitchDeg: 0, eave: 0, verge: 0, thickness: 0.3, bucket: 'plaster3', parapet: 0.9 }, openings, chimneys: [],
      reveal: 0.2, rafters: null, spall: null,
    };
    const frame = buildHouse(sink, spec, millDialect(look));
    const eaveY = frame.eaveY;
    // the stair and water tower on the back corner, a body of its own (it topples in its courses when the mill falls),
    // standing a hand proud of the mill's back wall and a quarter metre proud of its side, where the stair's lights are
    // cut through its face, a light to a floor (were glass laid on a solid shaft): each pane and its mullions at the back
    // of the reveal, the dark of the stair behind it, a stone sill under it; its flat cap under the tank
    const tw = clampTo(Math.min(W, D) * 0.3, 2.6, 4.6), tTop = eaveY + 5.2;
    const tx0 = W / 2 - tw, tz1 = -D / 2 + tw, tp = 0.25;
    const tStoreys = [...Array.from({ length: floors }, () => sh), tTop - floors * sh];
    const stairDialect: HouseDialect = {
      window: (s, face, o, y0) => {
        const ym = y0 + o.y0 + o.h / 2, r = s.recess, fc = { colour: rgb(0x3a3430), decor: true, fine: true };
        facePanel(s, 'glass', face, o.u, ym, -r + 0.012, o.w, o.h, { decor: true, window: face.out });
        faceBox(s, 'structureWood', face, o.u, ym, -r + 0.03, 0.05, o.h, 0.04, fc, 'caps');
        faceBox(s, 'structureWood', face, o.u, ym + 0.2, -r + 0.03, o.w, 0.05, 0.04, fc, 'ends');
        faceBox(s, 'stone', face, o.u, y0 + o.y0 - 0.05, 0.03, o.w + 0.2, 0.1, 0.12, DEC);
      },
      door: () => undefined,
    };
    sink.placed(0, (tx0 + W / 2 + tp) / 2, 0, (-D / 2 - 0.06 + tz1) / 2, () => buildHouse(sink, {
      w: tw + tp, d: tw + 0.06, plinth: footing('stone'), skirt: null, storeys: tStoreys.map((h) => ({ h, wall: 'stone' as RegionalBucket })),
      roof: { kind: 'flat', pitchDeg: 0, eave: 0.08, verge: 0.08, thickness: 0.35, bucket: 'plaster3' },
      openings: tStoreys.map((_, k): Opening => ({ face: 'right', storey: k, kind: 'window', u: 0, w: 0.7, y0: 1.2, h: 1.4 })), chimneys: [],
      reveal: 0.2, rafters: null, spall: null, gutters: null, verge: null,
    }, stairDialect));
    sink.cylinder('structureMetal', [tx0 + tw / 2, tTop + 0.35, -D / 2 + tw / 2], 'y', 2.4, tw * 0.42, 12, { colour: rgb(0x4b4d4a), decor: true, shadow: true });
    pyramid(sink, 'structureMetal', tx0 + tw / 2, -D / 2 + tw / 2, tw * 0.44, tw * 0.44, tTop + 2.75, tTop + 3.6, { colour: rgb(0x3d3f3c), decor: true, shadow: true });
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
      // the leaves hang at the back of the reveal (they stood on the face over the cut)
      const open = look() < 0.4, lo = s.recess > 0 ? -s.recess + 0.035 : 0.03;
      for (const side of [-1, 1]) {
        if (open && side > 0) continue;
        faceBox(s, 'structureWood', face, o.u + side * o.w / 4, y + o.h / 2, lo, o.w / 2 - 0.03, o.h, 0.05, { colour: rgb(0x7a2a22), decor: true, fineSides: true });
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
      w: W, d: D, plinth: footing('plaster3'), skirt: null,
      storeys: [{ h: 4.4, wall: 'plaster3' }, ...Array.from({ length: storeys - 1 }, () => ({ h: 3.4, wall: 'stone' as RegionalBucket }))],
      roof: { kind: 'flat', pitchDeg: 0, eave: 0, verge: 0, thickness: 0.3, bucket: 'plaster3', parapet: 0.9 }, openings, chimneys: [],
      reveal: 0.18, rafters: null, spall: 'stone',
      // the watch tower's corner: its faces are the walls there
      abutted: [{ face: 'front', u0: -W / 2, u1: -W / 2 + tw }, { face: 'left', u0: D / 2 - tw, u1: D / 2 }],
    };
    const frame = buildHouse(sink, spec, fireDialect(look));
    const eaveY = frame.eaveY;
    for (let st = 1; st < storeys; st++) faceBox(sink, 'plaster', frame.faces.front, 0, frame.floors[st] - 0.05, 0.05, W, 0.16, 0.1, { decor: true, fineSides: true });
    // the watch tower on the front corner: a body of its own (it topples in its courses when the station falls), its
    // stair's lights cut through its faces (were glass laid on a solid shaft: each pane at the back of its reveal, the
    // stair's dark behind it, a stone sill under it; on the faces over the station's roof, the lights over its parapet),
    // the lookout's gallery deck its flat roof, the railing, the clock, the cap
    const tTop = Math.max(eaveY + 7.5, 20.5), roofTop = eaveY + 0.3 + 0.9;
    const x0 = -W / 2 - 0.06, x1 = -W / 2 + tw, z0 = D / 2 - tw, z1 = D / 2 + 0.06;
    const tn = Math.max(1, Math.floor((tTop - 4.1) / 3.2));
    const tStoreys = [4.1, ...Array.from({ length: tn }, (_, k) => (k < tn - 1 ? 3.2 : tTop - 4.1 - 3.2 * (tn - 1)))];
    const tOpenings: Opening[] = [];
    for (let k = 1; k < tStoreys.length - 1; k++) {
      const y0 = 4.1 + 3.2 * (k - 1) + 0.7, y1 = y0 + 1.4;
      const over = y0 > roofTop + 0.05, street = over || y1 < eaveY - 0.05;
      for (const face of ['front', 'right', 'back', 'left'] as const) {
        if (face === 'front' || face === 'left' ? street : over) tOpenings.push({ face, storey: k, kind: 'window', u: 0, w: 0.5, y0: 0.7, h: 1.4 });
      }
    }
    const lights: HouseDialect = {
      window: (s, face, o, y0) => {
        const ym = y0 + o.y0 + o.h / 2, r = s.recess;
        facePanel(s, 'glass', face, o.u, ym, -r + 0.012, o.w, o.h, { decor: true, window: face.out });
        faceBox(s, 'structureWood', face, o.u, ym + 0.15, -r + 0.03, o.w, 0.05, 0.04, { colour: IRON, decor: true, fine: true }, 'ends');
        faceBox(s, 'stone', face, o.u, y0 + o.y0 - 0.05, 0.03, o.w + 0.2, 0.1, 0.12, DEC);
      },
      door: () => undefined,
    };
    sink.placed(0, (x0 + x1) / 2, 0, (z0 + z1) / 2, () => buildHouse(sink, {
      w: x1 - x0, d: z1 - z0, plinth: footing('stone'), skirt: null, storeys: tStoreys.map((h) => ({ h, wall: 'stone' as RegionalBucket })),
      roof: { kind: 'flat', pitchDeg: 0, eave: 0.45, verge: 0.45, thickness: 0.22, bucket: 'plaster3' }, openings: tOpenings, chimneys: [],
      reveal: 0.2, rafters: null, spall: null, gutters: null, verge: null,
    }, lights));
    // (the clocks seated on the shaft's faces: they stood 3 cm off them)
    const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, half = (x1 - x0) / 2;
    for (const [fx, fz, ux, uz] of [[0, 1, 1, 0], [1, 0, 0, -1], [0, -1, -1, 0], [-1, 0, 0, 1]] as const) {
      const gf: Face = { origin: [cx + fx * (half + 0.4), 0, cz + fz * (half + 0.4)], u: [ux, 0, uz], out: [fx, 0, fz], width: tw + 0.9 };
      faceBox(sink, 'structureMetal', gf, 0, tTop + 1.05, 0, tw + 0.9, 0.05, 0.05, { colour: IRON, decor: true });
      for (let b = 0; b <= 8; b++) faceBox(sink, 'structureMetal', gf, -(tw + 0.9) / 2 + b * (tw + 0.9) / 8, tTop + 0.63, 0, 0.03, 0.82, 0.03, { colour: IRON, decor: true, fine: true });
      const cf: Face = { origin: [cx + fx * half, 0, cz + fz * half], u: [ux, 0, uz], out: [fx, 0, fz], width: tw };
      faceBox(sink, 'structureMetal', cf, 0, tTop - 1.6, 0.02, tw * 0.55, tw * 0.55, 0.04, { colour: WHITE_TRIM, decor: true });
      faceBox(sink, 'structureMetal', cf, 0, tTop - 1.45, 0.05, 0.05, tw * 0.22, 0.02, { colour: IRON, decor: true, fine: true });
    }
    for (const [px, pz] of [[x0 + 0.15, z0 + 0.15], [x1 - 0.15, z0 + 0.15], [x1 - 0.15, z1 - 0.15], [x0 + 0.15, z1 - 0.15]] as const) {
      sink.cylinder('structureMetal', [px, tTop + 0.22, pz], 'y', 2.2, 0.08, 6, { colour: IRON, decor: true, shadow: true });
    }
    pyramid(sink, 'roof', cx, cz, half + 0.35, half + 0.35, tTop + 2.42, tTop + 3.9, SHADOWED);
    sink.cylinder('structureMetal', [cx, tTop + 3.85, cz], 'y', 2.4, 0.04, 4, { colour: IRON, decor: true, fine: true });
    // (the integrity gate, 2026-10-15: a pock fell in a cut door and hung in it) clear of the front's openings
    const doors = frame.spec.openings.filter((o) => o.face === 'front').map((o) => ({ u0: o.u - o.w / 2 - 0.1, u1: o.u + o.w / 2 + 0.1,
      y0: frame.floors[o.storey] + o.y0 - 0.1, y1: frame.floors[o.storey] + o.y0 + o.h + 0.4 }));
    sink.dressing(mobile, () => pocks(sink, frame.faces.front, -W / 2 + tw + 0.4, W / 2 - 0.3, 0.4, eaveY, 6 + Math.floor(look() * 8), look, doors));
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
    // the enclosure, its gate cut through the front wall (the leaves shut in the cut close it)
    const gw = Math.min(3.2, W * 0.28), gateH = 3.2;
    sink.span(wall, -W / 2, -0.4, D / 2 - t, -gw / 2, wallH, D / 2);
    sink.span(wall, gw / 2, -0.4, D / 2 - t, W / 2, wallH, D / 2);
    sink.span(wall, -gw / 2, gateH, D / 2 - t, gw / 2, wallH, D / 2);
    sink.span(wall, -W / 2, -0.4, -D / 2, W / 2, wallH, -D / 2 + t);
    // the side walls' leak windows (louchuang, props census #13, lane B 2026-10-15; the judges: "three faces are blank"):
    // square openings through the wall, each with its tile lattice across it, the court seen through them
    const lw = 1.0, ly0 = 2.0, lz0 = -D / 2 + t, lz1 = D / 2 - t, nL = Math.max(1, Math.floor((lz1 - lz0 - 1.6) / 3.2));
    const leakZ = Array.from({ length: nL }, (_, k) => lz0 + (lz1 - lz0) * (k + 0.5) / nL);
    const lattice = { colour: shade(TILE_COPING, 1.25), decor: true };
    for (const sx of [-1, 1]) {
      const x0 = sx < 0 ? -W / 2 : W / 2 - t, x1 = x0 + t;
      sink.span(wall, x0, -0.4, lz0, x1, ly0, lz1);
      sink.span(wall, x0, ly0 + lw, lz0, x1, wallH, lz1);
      let from = lz0;
      for (const z of leakZ) {
        sink.span(wall, x0, ly0, from, x1, ly0 + lw, z - lw / 2);
        from = z + lw / 2;
        for (const k of [1, 2]) {
          sink.span('stone', x0 + t * 0.3, ly0, z - lw / 2 + lw * k / 3 - 0.03, x1 - t * 0.3, ly0 + lw, z - lw / 2 + lw * k / 3 + 0.03, lattice);
          sink.span('stone', x0 + t * 0.3, ly0 + lw * k / 3 - 0.03, z - lw / 2, x1 - t * 0.3, ly0 + lw * k / 3 + 0.03, z + lw / 2, lattice);
        }
      }
      sink.span(wall, x0, ly0, from, x1, ly0 + lw, lz1);
    }
    // (props census #13, lane B 2026-10-15) the street wall a body of its own for the damage reading, breaking into its own
    // heap beside the hall's (the guild hall went down to the default kit's bounding-box spalls)
    recordBody(sink, 0, D / 2 - t / 2, W, t, wallH, wall);
    const cap = { ...SHADOWED, colour: TILE_COPING };
    sink.span('structureMetal', -W / 2 - 0.05, wallH, D / 2 - t - 0.08, W / 2 + 0.05, wallH + 0.14, D / 2 + 0.08, cap);
    sink.span('structureMetal', -W / 2 - 0.05, wallH, -D / 2 - 0.08, W / 2 + 0.05, wallH + 0.14, -D / 2 + t + 0.08, cap);
    sink.span('structureMetal', -W / 2 - 0.08, wallH, -D / 2 + t, -W / 2 + t + 0.08, wallH + 0.14, D / 2 - t, cap);
    sink.span('structureMetal', W / 2 - t - 0.08, wallH, -D / 2 + t, W / 2 + 0.08, wallH + 0.14, D / 2 - t, cap);
    // the main hall at the back of the court, its front bays' doors cut into the front wall
    const hx = W / 2 - 1.5, hz0 = -D / 2 + 1.3, hz1 = clampTo(D / 2 - 4.8, hz0 + 4, D / 2 - 2.5), hallH = 6.0;
    const hf: Face = { origin: [0, 0, hz1], u: [1, 0, 0], out: [0, 0, 1], width: 2 * hx };
    const cols = Math.max(3, Math.round(2 * hx / 2.4)), bay = (2 * hx - 0.6) / cols, dw = bay - 0.5;
    const bayU = (k: number): number => -hx + 0.3 + (k + 0.5) * bay;
    // (the judges: "the hall has no plinth") the hall on its stone terrace, a step down to the court before its doors
    const apron = Math.min(1.3, (D / 2 - t - hz1) * 0.45), deck = 0.45;
    sink.span('stone', -hx - 0.6, -0.4, hz0 - 0.4, hx + 0.6, deck, hz1 + apron);
    sink.span('stone', -1.6, -0.4, hz1 + apron, 1.6, deck / 2, hz1 + apron + 0.35);
    sink.span('plaster', -hx, -0.4, hz0, hx, hallH, hz1 - 0.3);
    recordBody(sink, 0, (hz0 + hz1) / 2, 2 * hx, hz1 - hz0, hallH, 'plaster');
    holedPolygon(sink, 'plaster', hf, [[-hx, -0.4], [hx, -0.4], [hx, hallH], [-hx, hallH]],
      Array.from({ length: cols }, (_, k) => ({ u0: bayU(k) - dw / 2, u1: bayU(k) + dw / 2, y0: deck + 0.05, y1: deck + 2.85 })), 0.3, 0.26);
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
    // the hall's front: red columns under the eave, the lattice doors shut at the back of their cuts between them
    for (let k = 0; k <= cols; k++) {
      const u = -hx + 0.3 + k * bay;
      sink.cylinder('structureWood', facePoint(hf, u, deck, 0.75), 'y', hallH - deck, 0.2, 8, { colour: CHINA_RED, decor: true, shadow: true });
      if (k < cols) {
        const cu = bayU(k);
        faceBox(sink, 'structureWood', hf, cu, deck + 1.45, -0.22, dw, 2.8, 0.05, { colour: shade(CHINA_RED, 0.75), decor: true });
        if (!mobile) for (let j = 0; j < 4; j++) faceBox(sink, 'structureWood', hf, cu, deck + 0.45 + j * 0.65, -0.18, dw - 0.1, 0.04, 0.03, { colour: GILT, decor: true, fine: true });
      }
    }
    faceBox(sink, 'structureWood', hf, 0, hallH - 0.4, 0.78, 2 * hx, 0.5, 0.26, { colour: shade(CHINA_RED, 0.6), decor: true, shadow: true });
    // the gate: red columns and a little swept roof proud of the front wall, the lacquer leaves, the name board
    const front: Face = { origin: [0, 0, D / 2], u: [1, 0, 0], out: [0, 0, 1], width: W };
    for (const side of [-1, 1]) {
      // the leaf shut in the cut, mid-wall, both its faces (the court sees its back; structural: the gate closes the court)
      sink.span('structureWood', Math.min(0, side * gw / 2), 0, D / 2 - t / 2 - 0.04, Math.max(0, side * gw / 2), gateH, D / 2 - t / 2 + 0.04, { colour: shade(CHINA_RED, 0.8) });
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

const SHANGHAI_BUILDERS: Readonly<Record<string, RegionalBuilder>> = Object.freeze({
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
    // (round 11; waves 319/320: "clean, saturated, uniformly tiled brick with no soot") an industrial town's brick, soiled
    stone: { kind: 'brick', tint: [0.56, 0.36, 0.30], weathered: true },
    sourced: { plaster: false, wood: true },
    // (the facades lane, round 11; waves 319/320: the walls' procedural canvas read as "speckle", "sponge", "cork",
    // "camouflage noise": its 6 cm bumps shade as dots from the street, as Steinburg's did before round 8) the walls
    // painted as the region renders them (regionalSurfaces.ts paintLimeRender), every family under the kit's and the map's
    // tones; the plaster photo set is off (its 2.4 m tile repeats a lichen motif down every wall)
    render: { kind: 'limeRender', seed: 0x5b37 },
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
