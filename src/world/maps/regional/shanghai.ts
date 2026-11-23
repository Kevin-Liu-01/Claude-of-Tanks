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
import { PartSink, faceBox, facePanel, facePoint, rgb, shade, type EmitOptions, type Face, type RegionalBucket, type RegionalParts, type Rgb, type Vec3 } from './geometry.ts';
import {
  buildHouse, emitRoof, holedPolygon, recordBody, roofGeometry, windowRhythm, type HouseDialect, type HouseSpec, type Opening, type RoofPatch, type RoofSpec,
} from './house.ts';
import { doorUnit, gateUnit, windowUnit, type WindowStyle } from './openings.ts';
import { ruinHouse, type RuinHead } from './ruinGrammar.ts';
import type { ArchitectureStyle, RegionalBuildContext, RegionalBuilder } from './types.ts';
import {
  AWNINGS, CHAR, CHINA_RED, DEG, GILT, GODOWN_WINDOW, IRON, LACQUER, SASH, SIGN_BOARDS, TEAK, TILE_COPING, WHITE_TRIM,
  archOutline, bankOf, brickBands, choose, clampTo, fillOf, lantern, nameBoard, pocks, pyramid, raisedRidge, rooftopHoarding, rowFill, sandbags,
  signboard, streetLifeRng, uvOffset, wallAd,
} from './shanghaiParts.ts';
import { SHANGHAI_BUND_BUILDERS } from './shanghaiBund.ts';
import { canalRolls, facing, hipRidges, sub3, unit3 } from './shanghaiBank.ts'; // (dome-detail-275: the kit's roofs in relief)
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
    // (the owner, 2026-10-21: "improve the shanghai buildings a ton") the block's sides, blank brick or stucco three and four
    // storeys high wherever a gap opened beside it: each side its upper storeys' sashes, a painted advertisement across
    // them (wallAd, below) or the bare wall; chosen from the street's own stream (shanghaiParts.ts streetLifeRng)
    const life = streetLifeRng(ctx);
    const sides = (['left', 'right'] as const).map((face) => ({ face, kind: ((r: number) => (r < 0.55 ? 'windows' : r < 0.85 ? 'ad' : 'blank'))(life()) }));
    for (const side of sides) {
      if (side.kind !== 'windows') continue;
      for (let st = 1; st < floors; st++) openings.push(...windowRhythm(side.face, st, D, { w: 1.0, h: 1.7, sill: 0.85, spacing: 2.7, margin: 1.2 }));
    }
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
    // (230) a side's painted advertisement over its upper storeys; a hoarding on the roof over a third of the blocks,
    // set back from the street parapet and clear of its crest
    for (const side of sides) {
      if (side.kind !== 'ad') continue;
      const y0 = frame.floors[1] + 0.45;
      wallAd(sink, frame.faces[side.face], (life() - 0.5) * Math.max(0, D - 9.5), y0, Math.min(D - 2.2, 7.5), Math.min(eaveY - y0 - 0.7, 6.4), life);
    }
    if (life() < 0.34 && W > 7) {
      rooftopHoarding(sink, front, (life() - 0.5) * Math.max(0, W - 11), eaveY + 0.3, 2.4 + life() * 1.2, Math.min(W * 0.72, 9.5), 2.5 + life() * 0.9, life);
    }
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

/**
 * The tram depot: a brick car barn, its doorways on the street gable under a stepped parapet, tall windows down its sides.
 * (dome-detail-275, the work list) Its canal tiles in rows, the clerestory seated on the ridge, the eave corbelled over
 * the side walls with its gutter and downpipes, the pilasters capped and based, the gable's round vent, keystones over
 * the car doors, the tracks running out of them across a granite apron; the shell hole a stripped patch on its slope.
 */
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
    // (dome-detail-275: its base stood 16 cm over the slopes at its sides) seated down to the slopes
    sink.span('roof', -0.9, rg.ridgeTopY - 0.9 * rg.tanP - 0.04, -cz, 0.9, cy0, cz, SHADOWED);
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
    // (dome-detail-275: the shell hole was drawn for a roof whose ridge runs across, and stood in the barn's air) a shell
    // through the slope: the tiles stripped round it, the dark of the barn, the charred rafters across it
    const hole: RoofPatch | null = look() < 0.5 ? { side: look() < 0.5 ? 1 : -1, z0: 0, z1: 0, x0: 1.2, x1: 1.2 + 1.2 + look() * 1.2 } : null;
    if (hole) {
      const zc = (look() - 0.5) * (D - 6), hw = 0.8 + look() * 0.7;
      hole.z0 = zc - hw; hole.z1 = zc + hw;
      const on = (x: number, z: number, lift: number): Vec3 => [hole.side * x, (rg.topAt(hole.side * x, z) ?? eaveY) + lift, z];
      const pts: Vec3[] = [on(hole.x0, hole.z0 + 0.2, 0.01), on(hole.x0 + 0.1, hole.z1 - 0.1, 0.01), on(hole.x1, hole.z1, 0.01), on(hole.x1 - 0.2, hole.z0, 0.01)];
      facing(sink, 'dark', pts, [hole.side * rg.tanP, 1, 0], { decor: true });
      for (let k = 0; k < 3; k++) {
        const z = hole.z0 + (k + 0.5) * (hole.z1 - hole.z0) / 3;
        sink.member('structureWood', on(hole.x0 - 0.2, z, 0.02), on(hole.x1 + 0.2, z + (look() - 0.5) * 0.3, 0.02), 0.1, 0.1, [0, 1, 0], { colour: CHAR, decor: true, exposed: true }, 0);
      }
    }
    // (dome-detail-275) the canal tiles in their rows, open over the war's stripped patch and the shell hole
    canalRolls(sink, rg, roof, look, { gaps: [frame.roofPatch, hole] });
    // the side eaves corbelled out in two brick courses, the gutter along them and the downpipes at the corners
    const iron = { colour: rgb(0x34322f), decor: true } as const;
    const lowY = eaveY - roof.eave * rg.tanP;
    for (const sx of [-1, 1]) {
      const xw = sx * bw / 2;
      sink.band('stone', Math.min(xw, xw + sx * 0.12), eaveY - 0.5, -D / 2, Math.max(xw, xw + sx * 0.12), eaveY - 0.32, D / 2, { decor: true, shade: 0.92 });
      sink.band('stone', Math.min(xw, xw + sx * 0.22), eaveY - 0.32, -D / 2, Math.max(xw, xw + sx * 0.22), eaveY - 0.08, D / 2, { decor: true, shade: 0.88 });
      const gx = sx * (bw / 2 + reach - 0.02);
      sink.pipe('structureMetal', [gx, lowY - 0.06, -D / 2 - 0.02], [gx, lowY - 0.06, D / 2 + 0.02], 0.08, 8, { ...iron, caps: true });
      for (const sz of [-1, 1]) {
        const pz = sz * (D / 2 - 0.35);
        sink.pipe('structureMetal', [gx, lowY - 0.1, pz], [sx * (bw / 2 + 0.08), lowY - 0.5, pz], 0.05, 6, iron);
        sink.pipe('structureMetal', [sx * (bw / 2 + 0.08), lowY - 0.5, pz], [sx * (bw / 2 + 0.08), 0.15, pz], 0.05, 6, { ...iron, caps: true });
        sink.span('structureMetal', sx * (bw / 2 + 0.02) - 0.06, 0, pz - 0.1, sx * (bw / 2 + 0.02) + 0.06, 0.15, pz + 0.1, iron);
      }
    }
    // the pilasters' granite caps and bases
    for (const face of [frame.faces.right, frame.faces.left]) {
      const n = Math.round(D / 2.9);
      for (let k = 0; k <= n; k++) {
        const u = -D / 2 + 0.3 + k * (D - 0.6) / n;
        faceBox(sink, 'plaster3', face, u, eaveY - 0.62, 0.08, 0.56, 0.24, 0.16, { decor: true });
        faceBox(sink, 'plaster3', face, u, 0.6, 0.08, 0.54, 0.4, 0.16, { decor: true });
      }
    }
    // the gable's round vent over the name plate: its granite ring, the louvres' dark behind it
    const vy = eaveY + 1.9;
    if ((rg.topAt(0, D / 2) ?? 0) + 1.1 > vy + 0.7) {
      sink.cylinder('plaster3', facePoint(gface, 0, vy, -0.02), 'z', 0.14, 0.62, 16, { decor: true, shadow: true }, 0.62);
      sink.cylinder('dark', facePoint(gface, 0, vy, -0.02), 'z', 0.15, 0.44, 16, { decor: true }, 0.44);
      for (const dy of [-0.2, 0, 0.2]) faceBox(sink, 'structureMetal', gface, 0, vy + dy, 0.13, 0.8 - Math.abs(dy) * 1.4, 0.05, 0.03, { colour: IRON, decor: true, fine: true });
    }
    // the car doors' keystones, the tracks run out of them across the granite apron (the apron to the plot's edge)
    for (const o of openings) {
      if (o.face !== 'front') continue;
      faceBox(sink, 'plaster3', frame.faces.front, o.u, frame.floors[0] + o.y0 + o.h + 0.5, 0.16, 0.42, 0.5, 0.14, { decor: true });
      for (const r of [-0.72, 0.72]) sink.span('structureMetal', o.u + r - 0.04, -0.05, D / 2 - 0.3, o.u + r + 0.04, 0.07, D / 2 + 0.55, { colour: rgb(0x5a554e), decor: true });
    }
    sink.span('plaster3', -bw / 2, -0.1, D / 2 + 0.02, bw / 2, 0.04, D / 2 + 0.6, { decor: true, shade: 0.85, ground: true });
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

/**
 * A cotton mill: four storeys of brick with its rows of mill windows, the stair and water tower on a corner, its name.
 * (dome-detail-275) Its piers between the bays, the corbelled cornice and coping, the boiler chimney, the roof's laps.
 */
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
    // (dome-detail-275, the work list) the brick piers between the window bays up every face, a shade darker than the
    // panels; the corbelled cornice and the parapet's coping round the block (clear of the stair tower); the boiler's
    // chimney up through the roof at the far corner, its banded shaft and its corbelled head; the roofing felt's laps
    const faceNames = ['front', 'right', 'back', 'left'] as const;
    for (const name of faceNames) {
      const face = frame.faces[name], us = frame.spec.openings.filter((o) => o.face === name && o.storey === floors - 1 && o.kind === 'window').map((o) => o.u).sort((a, b) => a - b);
      // (a pier at every second bay: the weathering cuts each at its damp lines, so a pier a bay cost a thousand triangles)
      const mids = us.slice(1).map((u, i) => (u + us[i]) / 2).filter((_, i) => i % 2 === (us.length % 2 === 0 ? 1 : 0));
      const piers = [-face.width / 2 + 0.3, ...mids, face.width / 2 - 0.3];
      for (const u of piers) {
        if (name === 'back' && u > W / 2 - tw - 0.4) continue;
        if (name === 'right' && u < -D / 2 + tw + 0.4) continue;
        faceBox(sink, 'stone', face, u, eaveY / 2, 0.06, 0.6, eaveY, 0.12, { decor: true, fineSides: true, shade: 0.84 }, { bottom: true });
      }
    }
    const ring = (y0: number, y1: number, o: number, opts: EmitOptions): void => {
      sink.band('stone', -W / 2 - o, y0, D / 2 - 0.05, W / 2 + o, y1, D / 2 + o, opts);
      sink.band('stone', -W / 2 - o, y0, -D / 2 - o, -W / 2 + 0.05, y1, D / 2 - 0.05, opts);
      sink.band('stone', -W / 2 + 0.05, y0, -D / 2 - o, tx0 - 0.02, y1, -D / 2 + 0.05, opts);
      sink.band('stone', W / 2 - 0.05, y0, tz1 + 0.02, W / 2 + o, y1, D / 2 - 0.05, opts);
    };
    ring(eaveY - 0.42, eaveY - 0.12, 0.08, { decor: true, shade: 0.9 });
    ring(eaveY - 0.12, eaveY + 0.12, 0.18, { decor: true, shade: 0.82 });
    ring(eaveY + 1.12, eaveY + 1.24, 0.05, { decor: true, shade: 0.7 });
    const cx = -W / 2 + 1.7, cz = -D / 2 + 1.7, cy = eaveY + 0.3, stackH = Math.max(8, 26 - cy);
    sink.span('stone', cx - 1.4, cy - 0.05, cz - 1.4, cx + 1.4, cy + 1.3, cz + 1.4, { ...SHADOWED, shade: 0.9 });
    sink.band('plaster3', cx - 1.48, cy + 1.3, cz - 1.48, cx + 1.48, cy + 1.45, cz + 1.48, { decor: true, shade: 0.9 });
    const rAt = (k: number): number => (k < 0.5 ? 1.25 - 0.5 * k : 1.0 - 0.4 * (k - 0.5));
    sink.revolve('stone', [cx, cy + 1.45, cz], 'y', [[0, 1.25], [stackH * 0.5, 1.0], [stackH - 0.9, rAt(1) + 0.03], [stackH - 0.9, 1.0], [stackH - 0.45, 1.06],
      [stackH, 1.06], [stackH, 0.82]], 16, { ...SHADOWED, shade: 0.85 });
    for (const k of [0.3, 0.62]) sink.revolve('structureMetal', [cx, cy + 1.45 + stackH * k - 0.07, cz], 'y', [[0, rAt(k) + 0.02], [0.14, rAt(k) + 0.02]], 16, { colour: IRON, decor: true });
    sink.polygon('dark', Array.from({ length: 12 }, (_, i): Vec3 => [cx + Math.cos(-i * Math.PI / 6) * 0.82, cy + 1.45 + stackH - 0.3, cz + Math.sin(-i * Math.PI / 6) * 0.82]), DEC);
    for (let z = -D / 2 + 1.6; z < D / 2 - 0.6; z += 2.3) {
      const xa = z < tz1 + 0.1 ? Math.min(W / 2 - 0.3, tx0 - 0.1) : W / 2 - 0.3;
      sink.span('plaster3', -W / 2 + 0.3, eaveY + 0.3, z - 0.04, xa, eaveY + 0.33, z + 0.04, { decor: true, fine: true, shade: 0.8 });
    }
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

/**
 * The fire station: three storeys of red brick over its engine bays, the watch tower on its corner with the lookout's
 * gallery and clock. (dome-detail-275) Its cornice and coping, the named parapet over the bays, the roof's laps, hatch and
 * stacks; the tower's string courses, quoins and gallery corbels, the alarm bell in the lookout, the cap's hips and ball.
 */
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
      // (259, the phone census: the rail stood 0.7 m over the deck on balusters a phone never builds) the corner
      // balusters coarse, the rail on them at any range; the rest fine joinery
      for (let b = 0; b <= 8; b++) faceBox(sink, 'structureMetal', gf, -(tw + 0.9) / 2 + b * (tw + 0.9) / 8, tTop + 0.63, 0, 0.03, 0.82, 0.03, { colour: IRON, decor: true, fine: b > 0 && b < 8 });
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
    // (dome-detail-275, the work list) the station's cornice and the parapet's coping round the block (clear of the
    // tower), the raised parapet over the engine bays with the brigade's name, the granite apron before the bays
    const ring = (y0: number, y1: number, o: number, opts: EmitOptions): void => {
      sink.band('plaster', x1 + 0.02, y0, D / 2 - 0.05, W / 2 + o, y1, D / 2 + o, opts);
      sink.band('plaster', W / 2 - 0.05, y0, -D / 2 - o, W / 2 + o, y1, D / 2 - 0.05, opts);
      sink.band('plaster', -W / 2 - o, y0, -D / 2 - o, W / 2 - 0.05, y1, -D / 2 + 0.05, opts);
      sink.band('plaster', -W / 2 - o, y0, -D / 2 + 0.05, -W / 2 + 0.05, y1, z0 - 0.02, opts);
    };
    ring(eaveY - 0.4, eaveY - 0.1, 0.08, { decor: true, shade: 0.95 });
    ring(eaveY - 0.1, eaveY + 0.16, 0.2, { decor: true, shade: 0.88 });
    ring(roofTop - 0.1, roofTop + 0.02, 0.06, { decor: true, shade: 0.9 });
    const xm = (x1 + 0.4 + W / 2) / 2, pw = Math.min(5.2, W - tw - 1.6);
    sink.span('stone', xm - pw / 2, roofTop - 0.1, D / 2 - 0.3, xm + pw / 2, roofTop + 1.0, D / 2, SHADOWED);
    sink.prism('plaster', [[xm - pw / 2 - 0.08, roofTop + 1.0, D / 2 - 0.38], [xm + pw / 2 + 0.08, roofTop + 1.0, D / 2 - 0.38], [xm, roofTop + 1.55, D / 2 - 0.38]],
      [0, 0, 1], 0.46, SHADOWED);
    const fr = frame.faces.front;
    faceBox(sink, 'plaster', fr, xm, roofTop + 0.45, 0.04, pw - 0.6, 0.62, 0.08, { decor: true, fineSides: true });
    faceBox(sink, 'structureMetal', fr, xm, roofTop + 0.45, 0.09, pw - 1.2, 0.3, 0.02, { colour: rgb(0x2a2724), decor: true, fine: true });
    sink.span('plaster3', x1, -0.1, D / 2 + 0.02, W / 2, 0.05, D / 2 + 0.6, { decor: true, shade: 0.86, ground: true });
    // the roofing felt's laps across the station's roof, a roof hatch, the chimney stacks on the back parapet
    for (let z = -D / 2 + 1.4; z < D / 2 - 0.6; z += 2.0) {
      sink.span('plaster3', z > z0 - 0.1 ? x1 + 0.1 : -W / 2 + 0.3, eaveY + 0.3, z - 0.04, W / 2 - 0.3, eaveY + 0.33, z + 0.04, { decor: true, fine: true, shade: 0.8 });
    }
    sink.span('plaster3', W * 0.15 - 0.55, eaveY + 0.3, -0.55, W * 0.15 + 0.55, eaveY + 0.85, 0.55, { decor: true, shade: 0.9 });
    sink.span('structureMetal', W * 0.15 - 0.62, eaveY + 0.85, -0.62, W * 0.15 + 0.62, eaveY + 0.93, 0.62, { colour: IRON, decor: true });
    for (const sx of [-0.1, 0.32]) {
      const kx = sx * W;
      sink.span('stone', kx - 0.45, eaveY + 0.3, -D / 2 + 0.05, kx + 0.45, roofTop + 1.4, -D / 2 + 0.75, SHADOWED);
      sink.band('plaster', kx - 0.52, roofTop + 1.4, -D / 2 - 0.02, kx + 0.52, roofTop + 1.55, -D / 2 + 0.82, { decor: true, shade: 0.9 });
      for (const dx of [-0.2, 0.2]) sink.cylinder('structureMetal', [kx + dx, roofTop + 1.55, -D / 2 + 0.4], 'y', 0.45, 0.1, 6, { colour: rgb(0x6a4a3a), decor: true }, 0.08);
    }
    // the tower: its string courses at its stages, the quoins up its street corner, the corbels under the gallery's deck,
    // the alarm bell hung in the lookout from the cap's beams, the cap's hip rolls and its ball
    for (let k = 0; k < tStoreys.length - 1; k++) {
      const y = tStoreys.slice(0, k + 1).reduce((a, b) => a + b, 0);
      sink.band('plaster', x0 - 0.06, y - 0.08, z0 - 0.06, x1 + 0.06, y + 0.08, z1 + 0.06, { decor: true, shade: 0.95 });
    }
    for (let y = 0.1, k = 0; y < tTop - 0.6; y += 0.62, k++) {
      const lx = k % 2 ? 0.28 : 0.52, lz = k % 2 ? 0.52 : 0.28;
      sink.quoin('plaster', x0 - 0.035, y, z1 - lz, x0 + lx, y + 0.56, z1 + 0.035, -1, 1, { decor: true, shade: 0.97 });
    }
    for (const [fx, fz, ux, uz] of [[0, 1, 1, 0], [1, 0, 0, -1], [0, -1, -1, 0], [-1, 0, 0, 1]] as const) {
      const cf: Face = { origin: [cx + fx * half, 0, cz + fz * half], u: [ux, 0, uz], out: [fx, 0, fz], width: tw };
      for (const cu of [-tw * 0.33, 0, tw * 0.33]) {
        faceBox(sink, 'plaster', cf, cu, tTop - 0.18, 0.2, 0.22, 0.36, 0.4, { decor: true });
        faceBox(sink, 'plaster', cf, cu, tTop - 0.5, 0.11, 0.2, 0.28, 0.22, { decor: true });
      }
    }
    const bronze = { colour: rgb(0x5a4a32), decor: true, shadow: true } as const;
    for (const [ax, az, bx, bz] of [[x0 + 0.15, z0 + 0.15, x1 - 0.15, z1 - 0.15], [x1 - 0.15, z0 + 0.15, x0 + 0.15, z1 - 0.15]] as const) {
      sink.member('structureMetal', [ax, tTop + 2.3, az], [bx, tTop + 2.3, bz], 0.08, 0.12, [0, 1, 0], { colour: IRON, decor: true, exposed: true }, 0);
    }
    sink.cylinder('structureMetal', [cx, tTop + 1.92, cz], 'y', 0.4, 0.03, 4, { colour: IRON, decor: true });
    sink.revolve('structureMetal', [cx, tTop + 1.2, cz], 'y', [[0, 0.44], [0.08, 0.42], [0.26, 0.31], [0.5, 0.27], [0.62, 0.2], [0.7, 0.08], [0.73, 0]], 12, bronze);
    const ch = half + 0.35, ap: Vec3 = [cx, tTop + 3.9, cz];
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
      const b: Vec3 = [cx + sx * ch, tTop + 2.42, cz + sz * ch], ay = unit3(sub3(ap, b));
      sink.member('roof', b, ap, 0.12, 0.1, unit3([-ay[0] * ay[1], 1 - ay[1] * ay[1], -ay[2] * ay[1]]), { decor: true, shadow: true, exposed: true }, 0.03);
    }
    sink.revolve('structureMetal', [cx, tTop + 3.86, cz], 'y', [[0, 0.04], [0.06, 0.12], [0.16, 0.16], [0.26, 0.12], [0.32, 0]], 10, { colour: GILT, decor: true });
  });
  return sink.finish();
};

// ------------------------------------------------------------------------------------------------ the guild hall

/**
 * A guild hall (huiguan) of one of the provinces' merchants: its grey brick walls round the court with a tiled coping,
 * the gate under its own swept roof between red columns, the main hall at the back of the court under a hipped roof with
 * the gablets of a hip-and-gable, its corners swept up, its ridge ending in curls, red columns along its front.
 * (dome-detail-275, the work list: a blank box under a smooth roof) The walls on a granite base course under a corbelled,
 * gabled coping; the leak windows framed in granite; the gate bay carried up under a tiled gatehouse roof on red columns
 * and a lintel, its doorway in a granite frame with its drum stones and studded leaves; the hall's roofs in tile rows with
 * hip ridges, the bracket sets (dougong) between its columns and the eave, its transoms, plaque and lanterns; the court
 * paved, the burner on its stand.
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
        // (dome-detail-275) the leak window's granite frame on the street face: its sill, its lintel, its jambs
        const sf: Face = { origin: [sx * W / 2, 0, 0], u: [0, 0, -sx], out: [sx, 0, 0], width: D }, u = -sx * z;
        faceBox(sink, 'plaster3', sf, u, ly0 - 0.08, 0.035, lw + 0.36, 0.16, 0.07, { decor: true, fineSides: true });
        faceBox(sink, 'plaster3', sf, u, ly0 + lw + 0.09, 0.035, lw + 0.36, 0.18, 0.07, { decor: true, fineSides: true });
        for (const s2 of [-1, 1]) faceBox(sink, 'plaster3', sf, u + s2 * (lw / 2 + 0.09), ly0 + lw / 2, 0.03, 0.18, lw, 0.06, { decor: true, fineSides: true });
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
    // (dome-detail-275) the coping's tiles pitched to a ridge along each wall head, the brick corbelled out under it, the
    // granite base course along the wall foot (each broken by the gate)
    const gb = gw / 2 + 0.95, ch = wallH + 0.14, cr = t / 2 + 0.08;
    const runsX: Array<[number, number, number]> = [[-W / 2 - 0.05, -gb, D / 2 - t / 2], [gb, W / 2 + 0.05, D / 2 - t / 2], [-W / 2 - 0.05, W / 2 + 0.05, -D / 2 + t / 2]];
    for (const [xa, xb, zc] of runsX) sink.prism('structureMetal', [[xa, ch, zc + cr], [xa, ch, zc - cr], [xa, ch + 0.24, zc]], [1, 0, 0], xb - xa, cap);
    for (const sx of [-1, 1]) {
      const xc = sx * (W / 2 - t / 2);
      sink.prism('structureMetal', [[xc - cr, ch, -D / 2 + t], [xc + cr, ch, -D / 2 + t], [xc, ch + 0.24, -D / 2 + t]], [0, 0, 1], D - 2 * t, cap);
    }
    const band = { decor: true, shade: 0.9 } as const;
    sink.band(wall, -W / 2 - 0.05, wallH - 0.22, D / 2 - 0.1, -gb, wallH, D / 2 + 0.05, band);
    sink.band(wall, gb, wallH - 0.22, D / 2 - 0.1, W / 2 + 0.05, wallH, D / 2 + 0.05, band);
    sink.band(wall, -W / 2 - 0.05, wallH - 0.22, -D / 2 - 0.05, W / 2 + 0.05, wallH, -D / 2 + 0.1, band);
    const granite = { decor: true, shade: 0.94 } as const, by = 0.7;
    sink.band('plaster3', -W / 2 - 0.05, -0.4, D / 2 - 0.1, -gw / 2 - 0.3, by, D / 2 + 0.05, granite);
    sink.band('plaster3', gw / 2 + 0.3, -0.4, D / 2 - 0.1, W / 2 + 0.05, by, D / 2 + 0.05, granite);
    sink.band('plaster3', -W / 2 - 0.05, -0.4, -D / 2 - 0.05, W / 2 + 0.05, by, -D / 2 + 0.1, granite);
    for (const sx of [-1, 1]) {
      const xo = sx * (W / 2 + 0.05), xi = sx * (W / 2 - 0.1);
      sink.band('plaster3', Math.min(xo, xi), -0.4, -D / 2 + 0.1, Math.max(xo, xi), by, D / 2 - 0.1, granite);
      sink.band(wall, Math.min(xo, xi), wallH - 0.22, -D / 2 + 0.1, Math.max(xo, xi), wallH, D / 2 - 0.1, band);
    }
    // (dome-detail-275) the back wall's blind panels, framed in moulded brick; soot and rain streaks down the street wall
    const backF: Face = { origin: [0, 0, -D / 2], u: [-1, 0, 0], out: [0, 0, -1], width: W };
    for (const pu of [-W * 0.25, W * 0.25]) {
      const pw = Math.min(2.4, W * 0.2), py = 2.6, ph = 2.0;
      for (const s2 of [-1, 1]) {
        faceBox(sink, 'plaster3', backF, pu, py + s2 * (ph / 2 + 0.06), 0.03, pw + 0.24, 0.12, 0.06, { decor: true, fineSides: true });
        faceBox(sink, 'plaster3', backF, pu + s2 * (pw / 2 + 0.06), py, 0.03, 0.12, ph, 0.06, { decor: true, fineSides: true });
      }
    }
    const frontF: Face = { origin: [0, 0, D / 2], u: [1, 0, 0], out: [0, 0, 1], width: W };
    for (let k = 0, n = 3 + Math.floor(look() * 3); k < n; k++) {
      const su = (look() < 0.5 ? -1 : 1) * (gb + 0.4 + look() * (W / 2 - gb - 0.8)), sh = 0.8 + look() * 1.8;
      facePanel(sink, wall, frontF, su, wallH - 0.22 - sh / 2, 0.006, 0.3 + look() * 0.5, sh, { decor: true, shade: 0.72 + look() * 0.1 });
    }
    // the main hall at the back of the court, its front bays' doors cut into the front wall
    const hx = W / 2 - 1.5, hz0 = -D / 2 + 1.3, hz1 = clampTo(D / 2 - 4.8, hz0 + 4, D / 2 - 2.5), hallH = 6.0;
    const hf: Face = { origin: [0, 0, hz1], u: [1, 0, 0], out: [0, 0, 1], width: 2 * hx };
    const cols = Math.max(3, Math.round(2 * hx / 2.4)), bay = (2 * hx - 0.6) / cols, dw = bay - 0.5;
    const bayU = (k: number): number => -hx + 0.3 + (k + 0.5) * bay;
    // (the judges: "the hall has no plinth") the hall on its stone terrace, a step down to the court before its doors
    const apron = Math.min(1.3, (D / 2 - t - hz1) * 0.45), deck = 0.45;
    sink.span('stone', -hx - 0.6, -0.4, hz0 - 0.4, hx + 0.6, deck, hz1 + apron);
    sink.span('stone', -1.6, -0.4, hz1 + apron, 1.6, deck / 2, hz1 + apron + 0.35);
    // (dome-detail-275) the terrace's granite kerb, a second step
    sink.span('plaster3', -hx - 0.62, deck - 0.14, hz1 + apron - 0.32, hx + 0.62, deck + 0.03, hz1 + apron + 0.02, { decor: true, shade: 1.06 });
    sink.span('plaster3', -1.9, -0.4, hz1 + apron + 0.35, 1.9, deck * 0.25, hz1 + apron + 0.7, { decor: true, shade: 1.02 });
    sink.span('plaster', -hx, -0.4, hz0, hx, hallH, hz1 - 0.3);
    recordBody(sink, 0, (hz0 + hz1) / 2, 2 * hx, hz1 - hz0, hallH, 'plaster');
    holedPolygon(sink, 'plaster', hf, [[-hx, -0.4], [hx, -0.4], [hx, hallH], [-hx, hallH]],
      Array.from({ length: cols }, (_, k) => ({ u0: bayU(k) - dw / 2, u1: bayU(k) + dw / 2, y0: deck + 0.05, y1: deck + 2.85 })), 0.3, 0.26);
    const roof: RoofSpec = { kind: 'hip', pitchDeg: 31, eave: 1.05, verge: 1.05, thickness: 0.2, bucket: 'roof', ridge: null, hipPitchDeg: 36 };
    const rg = roofGeometry(hz1 - hz0, 2 * hx, hallH, roof);
    const hzc = (hz0 + hz1) / 2;
    const tanP = Math.tan(roof.pitchDeg * DEG), gh = Math.min(1.5, (rg.ridgeY - hallH) * 0.55), gbs = gh / tanP;
    // (dome-detail-275) the hall's tiles in their rows, its hip ridges turned up at their feet
    sink.placed(Math.PI / 2, 0, 0, hzc, () => {
      emitRoof(sink, rg, roof);
      hipRidges(sink, canalRolls(sink, rg, roof, look, { pitch: 0.32, stopY: rg.ridgeTopY - gh - 0.05 }), 0.26, 0.24, SHADOWED, 0.6);
    });
    raisedRidge(sink, -rg.ridgeHalf - 0.2, rg.ridgeHalf + 0.2, rg.ridgeTopY, hzc, 0.75);
    // the gablets of the hip-and-gable, the corners swept up
    for (const side of [-1, 1]) {
      const gx = side * (rg.ridgeHalf + 0.05);
      // the gablet's outer face is the cap the prism starts from: counter-clockwise seen from inside the hall
      const pts: Vec3[] = side > 0
        ? [[gx, rg.ridgeTopY - gh, hzc - gbs], [gx, rg.ridgeTopY - gh, hzc + gbs], [gx, rg.ridgeTopY, hzc]]
        : [[gx, rg.ridgeTopY - gh, hzc + gbs], [gx, rg.ridgeTopY - gh, hzc - gbs], [gx, rg.ridgeTopY, hzc]];
      sink.prism('plaster', pts, [-side, 0, 0], 0.16, SHADOWED);
      // (dome-detail-275) the gablet's barge boards and its hanging fish under the apex
      const gf: Face = { origin: [gx, 0, hzc], u: [0, 0, -side], out: [side, 0, 0], width: 2 * gbs };
      faceBox(sink, 'structureWood', gf, 0, rg.ridgeTopY - gh * 0.55, 0.03, 0.16, gh * 0.6, 0.05, { colour: shade(CHINA_RED, 0.7), decor: true, fineSides: true });
    }
    // the hall's front: red columns under the eave, the lattice doors shut at the back of their cuts between them
    // (dome-detail-275: the columns and their beam stood up through the eave) the columns on their stone bases to the
    // soffit, the beam under it, the bracket sets between the beam and the eave
    const hs = hallH - 0.75 * tanP - 0.02, beamTop = hs - 0.3;
    const teal = rgb(0x2f5a55), lintelRed = shade(CHINA_RED, 0.6);
    for (let k = 0; k <= cols; k++) {
      const u = -hx + 0.3 + k * bay;
      sink.cylinder('plaster3', facePoint(hf, u, deck, 0.75), 'y', 0.22, 0.3, 8, { decor: true, shade: 1.05 }, 0.27);
      sink.cylinder('structureWood', facePoint(hf, u, deck + 0.22, 0.75), 'y', beamTop - deck - 0.22, 0.2, 8, { colour: CHINA_RED, decor: true, shadow: true });
      if (k < cols) {
        const cu = bayU(k);
        faceBox(sink, 'structureWood', hf, cu, deck + 1.45, -0.22, dw, 2.8, 0.05, { colour: shade(CHINA_RED, 0.75), decor: true });
        if (!mobile) for (let j = 0; j < 4; j++) faceBox(sink, 'structureWood', hf, cu, deck + 0.45 + j * 0.65, -0.18, dw - 0.1, 0.04, 0.03, { colour: GILT, decor: true, fine: true });
        // (dome-detail-275) the lattice transom over the doors
        faceBox(sink, 'structureWood', hf, cu, deck + 3.3, 0.03, dw, 0.66, 0.06, { colour: shade(CHINA_RED, 0.68), decor: true, fineSides: true });
        for (let j = 1; j < 4; j++) faceBox(sink, 'structureWood', hf, cu - dw / 2 + j * dw / 4, deck + 3.3, 0.07, 0.04, 0.6, 0.02, { colour: GILT, decor: true, fine: true });
      }
    }
    faceBox(sink, 'structureWood', hf, 0, beamTop - 0.22, 0.78, 2 * hx, 0.44, 0.26, { colour: lintelRed, decor: true, shadow: true });
    faceBox(sink, 'structureWood', hf, 0, beamTop - 0.22, 0.92, 2 * hx - 0.2, 0.16, 0.02, { colour: teal, decor: true, fine: true });
    for (let k = 0; k <= 2 * cols; k++) {
      const u = -hx + 0.3 + k * bay / 2, main = k % 2 === 0;
      // the bracket set: a block on the beam, the arms crossing it, the block under the eave purlin
      faceBox(sink, 'structureWood', hf, u, beamTop + 0.06, 0.78, 0.26, 0.12, 0.3, { colour: lintelRed, decor: true });
      faceBox(sink, 'structureWood', hf, u, beamTop + 0.17, main ? 0.86 : 0.8, main ? 0.78 : 0.56, 0.1, main ? 0.46 : 0.3, { colour: teal, decor: true });
      faceBox(sink, 'structureWood', hf, u, beamTop + 0.26, 0.86, 0.24, 0.1, 0.44, { colour: lintelRed, decor: true });
    }
    // (dome-detail-275) the hall's plaque over its middle doors, its lanterns hung from the beam
    faceBox(sink, 'structureWood', hf, 0, deck + 3.95, 0.05, Math.min(2.8, bay * 1.2), 0.62, 0.08, { colour: LACQUER, decor: true, fineSides: true });
    faceBox(sink, 'structureWood', hf, 0, deck + 3.95, 0.1, Math.min(2.8, bay * 1.2) * 0.75, 0.3, 0.02, { colour: GILT, decor: true, fine: true });
    for (const k of [0, cols - 1]) lantern(sink, hf, bayU(k), beamTop - 0.44, 0.78);
    // the gate: (dome-detail-275) the gate bay carried up through the wall head under its own tiled roof, on red columns and a
    // lintel; the doorway's granite frame, the drum stones, the leaves' studs; the name board
    const front: Face = { origin: [0, 0, D / 2], u: [1, 0, 0], out: [0, 0, 1], width: W };
    const gy = wallH + 0.55, gz = D / 2 - 0.28;
    sink.span(wall, -gb, wallH, D / 2 - t, gb, gy + 0.2, D / 2);
    for (const side of [-1, 1]) {
      // the leaf shut in the cut, mid-wall, both its faces (the court sees its back; structural: the gate closes the court)
      sink.span('structureWood', Math.min(0, side * gw / 2), 0, D / 2 - t / 2 - 0.04, Math.max(0, side * gw / 2), gateH, D / 2 - t / 2 + 0.04, { colour: shade(CHINA_RED, 0.8) });
      if (!mobile) for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) {
        faceBox(sink, 'structureMetal', front, side * (gw / 2) * (c + 1) / 4, 0.7 + r * 0.6, -t / 2 + 0.06, 0.06, 0.06, 0.04, { colour: GILT, decor: true, fine: true });
      }
      sink.cylinder('structureWood', facePoint(front, side * (gw / 2 + 0.55), 0, 0.22), 'y', gy - 0.36, 0.15, 8, { colour: CHINA_RED, decor: true, shadow: true });
      // the doorway's granite jamb, the drum stone at its foot on its block
      faceBox(sink, 'plaster3', front, side * (gw / 2 + 0.14), gateH / 2, 0.045, 0.28, gateH, 0.09, { decor: true, fineSides: true, shade: 1.04 });
      faceBox(sink, 'plaster3', front, side * (gw / 2 - 0.17), 0.25, 0.3, 0.32, 0.5, 0.6, { decor: true, shade: 1.02 });
      sink.cylinder('plaster3', facePoint(front, side * (gw / 2 - 0.17) - 0.13, 0.5 + 0.34, 0.32), 'x', 0.26, 0.34, 10, { decor: true, shadow: true, shade: 1.04 });
    }
    faceBox(sink, 'plaster3', front, 0, gateH + 0.15, 0.05, gw + 0.56, 0.3, 0.1, { decor: true, fineSides: true, shade: 1.04 });
    faceBox(sink, 'structureWood', front, 0, gy - 0.2, 0.22, 2 * gb - 0.3, 0.36, 0.24, { colour: lintelRed, decor: true, shadow: true });
    for (let k = 0; k < 5; k++) faceBox(sink, 'structureWood', front, -gb + 0.4 + k * (2 * gb - 0.8) / 4, gy - 0.06, 0.24, 0.3, 0.12, 0.4, { colour: teal, decor: true });
    const groof: RoofSpec = { kind: 'hip', pitchDeg: 30, eave: 0.32, verge: 0.4, thickness: 0.12, bucket: 'roof', ridge: null, decor: true, hipPitchDeg: 42 };
    const grg = roofGeometry(1.0, 2 * gb, gy, groof);
    sink.placed(Math.PI / 2, 0, 0, gz, () => {
      emitRoof(sink, grg, groof);
      hipRidges(sink, canalRolls(sink, grg, groof, look, { pitch: 0.26, w: 0.12 }), 0.16, 0.14, SHADOWED, 0.3);
    });
    raisedRidge(sink, -grg.ridgeHalf - 0.1, grg.ridgeHalf + 0.1, grg.ridgeTopY, gz, 0.45);
    nameBoard(sink, front, 0, (gateH + 0.3 + wallH - 0.22) / 2, gw * 0.8, LACQUER);
    sink.span('plaster3', -gw / 2 - 0.3, -0.4, D / 2, gw / 2 + 0.3, 0.14, D / 2 + 0.5, { decor: true, shade: 0.98 });
    // (dome-detail-275) the court paved, a granite walk from the gate to the hall's steps
    const c0 = hz1 + apron + 0.7, c1 = D / 2 - t;
    if (c1 - c0 > 0.4) {
      sink.span('plaster3', -W / 2 + t, -0.1, c0, W / 2 - t, 0.03, c1, { decor: true, shade: 0.82, ground: true });
      sink.span('plaster3', -1.0, -0.1, c0, 1.0, 0.06, c1, { decor: true, shade: 1.0, ground: true });
    }
    // an incense burner in the court: (dome-detail-275) a bronze ding on three legs over its granite stand, its lid and ears
    const bz = (hz1 + apron + 0.7 + D / 2 - t) / 2, bx = 0, bronze = { colour: rgb(0x4a4136), decor: true, shadow: true };
    sink.span('plaster3', bx - 0.5, -0.1, bz - 0.5, bx + 0.5, 0.36, bz + 0.5, { decor: true, shade: 1.02 });
    for (let k = 0; k < 3; k++) {
      const a = k * Math.PI * 2 / 3;
      sink.cylinder('structureMetal', [bx + Math.cos(a) * 0.22, 0.36, bz + Math.sin(a) * 0.22], 'y', 0.26, 0.05, 6, bronze);
    }
    sink.revolve('structureMetal', [bx, 0.58, bz], 'y', [[0, 0.24], [0.1, 0.36], [0.42, 0.4], [0.5, 0.34], [0.52, 0.4], [0.58, 0.4]], 14, bronze);
    sink.revolve('structureMetal', [bx, 1.16, bz], 'y', [[0, 0.4], [0.05, 0.36], [0.24, 0.22], [0.34, 0.08], [0.42, 0.06], [0.5, 0.0]], 14, bronze);
    for (const s2 of [-1, 1]) sink.span('structureMetal', bx + s2 * 0.34, 1.12, bz - 0.04, bx + s2 * 0.42, 1.36, bz + 0.04, bronze);
    sink.dressing(mobile, () => pocks(sink, front, -W / 2 + 0.3, W / 2 - 0.3, 0.4, wallH - 0.3, 6 + Math.floor(look() * 8), look, [{ u0: -gb - 0.6, u1: gb + 0.6, y0: 0, y1: wallH }]));
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
  },
  // the autumn of 1937: Zhabei shelled and burnt, the Settlement's edges pocked
});

export type { RegionalParts, Rgb };
