// src/world/maps/regional/sarajevo.ts — the Sarajevo kit (Ruinspires: the city under siege, 1992-1996). The capital
// fills a river valley between steep hills; its street rows change with the ground they stand on:
//   - on the valley floor, along the boulevard (Zmaja od Bosne, "Sniper Alley") and the streets off it: the
//     Austro-Hungarian blocks of 1878-1918, four and five storeys of ochre, cream, pale-green and pink render over a
//     ground storey of ashlar or rusticated render with its shops and carriage passages, string courses, tall casements
//     in stone surrounds, the piano nobile under pediments, a balcony on corbels, a crowning cornice, hipped tile roofs
//     or zinc mansards with dormers, the odd Secession attic gable; between them the Yugoslav infill of the 1960s and
//     70s, five and six storeys of concrete with loggias behind coloured parapet panels and roller shutters;
//   - up the flanks, the Ottoman mahalas: two-storey houses with a ground storey of rubble stone or whitewash, a
//     whitewashed upper storey oversailing the street on its beam ends, a doksat (the bay of windows) on timber
//     brackets, a steep hipped roof of dark tile on wide eaves, a chimney under its little hood, a garden behind a
//     whitewashed wall with a tiled coping and a gate;
//   - the siege on every one: shell pocks chipped through the render to the masonry, a shell hole in a pier, burnt and
//     boarded windows, UNHCR sheeting nailed over the glass the blasts took, sandbagged ground-floor windows, burnt top
//     storeys, a corner collapsed to a stub with the floors' scars and the rooms' paint on the wall above it;
//   - the ruins: an Austro-Hungarian block's shell (its street front standing with its empty windows, the floors fallen
//     in behind), a mahala house burnt to its stone ground storey with the charred posts of its upper floor and the
//     chimney standing, a gutted concrete frame.
// The landmarks are sarajevoTowers.ts (the UNIS twin towers, the parliament's tower, the Holiday Inn, the estates'
// towers and slabs, the newspaper's tower) and sarajevoCivic.ts (the museum, the city hall, a mosque, the Orthodox and
// Catholic churches, the market hall, the čaršija's shops).
//
// The kit reads its building's place (ctx.x, ctx.z): the valley runs along the map's x axis, so the distance from it is the
// climb up the flank — the valley-floor blocks give way to the mahala houses between 70 and 150 m out. Without a place
// (the receipts) the mix is drawn from the build stream.
import { PartSink, faceBox, facePoint, rgb, shade, type Face, type RegionalBucket, type RegionalParts, type Rgb } from './geometry.ts';
import { buildHouse, emitRoof, roofGeometry, storeyFaces, wallPolygon, windowRhythm, type HouseDialect, type HouseFrame, type HouseSpec, type Opening, type RoofSpec } from './house.ts';
import { doorUnit, gateUnit, windowUnit, type WindowStyle } from './openings.ts';
import { tvAerial, woodpile, pottedPlant } from './dressing.ts';
import { ruinHouse, type RuinHead } from './ruinGrammar.ts';
import type { ArchitectureStyle, RegionalBuildContext, RegionalBuilder } from './types.ts';
import {
  AH_FRAME, CHAR, DARK_FRAME, DOOR_LEAVES, IRON, PANEL_PAINTS, ROLL_SHUTTER, TIMBER, ZINC,
  archHead, choose, clampTo, fillOf, pediment, railing, sandbagWindow, shellPocks, sootBand, unhcrSheet, type Keep,
} from './sarajevoParts.ts';
import { SARAJEVO_CIVIC_BUILDERS } from './sarajevoCivic.ts';
import { SARAJEVO_TOWER_BUILDERS } from './sarajevoTowers.ts';
import { ahDormer } from './sarajevoDormer.ts';
import { atticOculus, doksatBay, mansardDormer } from './sarajevoRoofs.ts';

function uvOffset(ctx: RegionalBuildContext): [number, number] {
  return [ctx.rng() * 7.31, ctx.rng() * 5.17];
}

/**
 * A street-row building's footprint: the base geometry's bounds (the row's houses meet and the gaps between them stay
 * the base's), its street front no further out than the plot's (the base's steps and porches reach past it), and its
 * sides no further out than the plot's width (the buildings stream, 2026-10-13, the weird-buildings survey: the base's
 * eaves, downpipes and side dressing reach 0.5-1.5 m past its walls, so a house filling them stood 1-2 m into each
 * neighbour of a row laid wall to wall, its walls through theirs and the roofs crossed).
 */
const rowFill = (ctx: RegionalBuildContext) => {
  const half = ctx.info.w / 2 - 0.15;
  return fillOf({ ...ctx.bounds, minX: Math.max(ctx.bounds.minX, -half), maxX: Math.min(ctx.bounds.maxX, half) }, 0.05, ctx.info.d / 2 - 0.1);
};

/** 0 on the valley floor .. 1 up the mahala slopes (the distance from the valley axis), or null without a place. */
export function slopeOf(ctx: RegionalBuildContext): number | null {
  if (ctx.z === undefined) return null;
  return clampTo((Math.abs(ctx.z) - 70) / 80, 0, 1);
}

// ------------------------------------------------------------------------------------------------ dialects

interface SiegeHabits {
  look: () => number;
  /** share of windows under UNHCR sheeting, of ground-storey windows sandbagged */
  sheets: number;
  sandbags: number;
  lit: number;
}

const AH_WINDOW: WindowStyle = {
  frame: AH_FRAME, frameWidth: 0.07, frameOut: 0.05, bars: 'cross',
  surround: { bucket: 'stone', width: 0.15, out: 0.06, lintel: 0.3 }, sill: { bucket: 'stone', out: 0.12 }, shutters: null,
};

/** A shop under its sign, the roll shutter down most of the way (the shops shut for the siege). */
function shopfront(sink: PartSink, face: Face, o: Opening, y0: number, sign: Rgb, h: SiegeHabits, frame: Rgb): void {
  const y = y0 + o.y0, r = sink.recess, back = r > 0 ? -r : 0;
  windowUnit(sink, face, o.u, y + 0.55, o.w, o.h - 0.55, { frame, frameWidth: 0.08, frameOut: 0.06, bars: 'two', surround: null, sill: null, shutters: null }, h.look, 0.15);
  const down = 0.35 + h.look() * 0.65;
  const sh = (o.h - 0.1) * down;
  faceBox(sink, 'structureMetal', face, o.u, y + o.h - sh / 2, back + 0.11, o.w + 0.04, sh, 0.03, { colour: ROLL_SHUTTER, decor: true });
  for (let k = 1; k < Math.floor(sh / 0.22); k++) {
    faceBox(sink, 'structureWood', face, o.u, y + o.h - k * 0.22, back + 0.13, o.w, 0.025, 0.012, { colour: shade(ROLL_SHUTTER, 0.75), decor: true, fine: true });
  }
  // the fascia sign over the opening
  faceBox(sink, 'structureWood', face, o.u, y + o.h + 0.32, 0.05, o.w + 0.4, 0.5, 0.06, { colour: sign, decor: true, fineSides: true });
}

function ahDialect(rng: () => number, door: Rgb, h: SiegeHabits, sign: Rgb): HouseDialect {
  return {
    window: (s, face, o, y0) => {
      const y = y0 + o.y0, roll = h.look();
      const style = o.storey === 0 ? { ...AH_WINDOW, surround: { bucket: 'stone' as const, width: 0.12, out: 0.04, lintel: 0.18 } } : AH_WINDOW;
      if (roll < h.sheets) {
        windowUnit(s, face, o.u, y, o.w, o.h, { ...style, bars: 'none' }, h.look, 0);
        unhcrSheet(s, face, o.u, y, o.w, o.h, h.look);
        return;
      }
      windowUnit(s, face, o.u, y, o.w, o.h, style, h.look, h.lit);
      if (o.storey === 0 && roll < h.sheets + h.sandbags) sandbagWindow(s, face, o.u, y, o.w, o.h, h.look);
    },
    door: (s, face, o, y0, frame) => {
      if (o.kind === 'shopfront') { shopfront(s, face, o, y0, sign, h, AH_FRAME); return; }
      if (o.kind === 'gate') {
        gateUnit(s, face, o.u, y0 + o.y0, o.w, o.h - 0.6, door, { bucket: 'stone', width: 0.3, out: 0.12 });
        archHead(s, face, o.u, y0 + o.y0 + o.h - 0.6 + 0.02, o.w / 2, 'stone', 0.22);
        return;
      }
      if (o.storey > 0) {
        doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { leaf: AH_FRAME, frame: { bucket: 'stone', width: 0.15, out: 0.06 }, transom: true, steps: null, leafKind: 'glazed' }, frame.floors[o.storey] + o.y0);
        return;
      }
      doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, {
        leaf: door, frame: { bucket: 'stone', width: 0.26, out: 0.1, arch: true }, transom: true, steps: { bucket: 'stone' }, leafKind: rng() < 0.7 ? 'panel' : 'glazed',
      }, frame.floors[o.storey] + o.y0);
    },
  };
}

const YU_WINDOW: WindowStyle = {
  frame: rgb(0xd6d2c6), frameWidth: 0.06, frameOut: 0.04, bars: 'two', surround: null, sill: { bucket: 'plaster3', out: 0.07 }, shutters: null,
};

/** The roller shutter of a Yugoslav flat's window: its box over the opening and the slats down part way. */
function rollerShutter(s: PartSink, face: Face, u: number, y: number, w: number, hgt: number, look: () => number): void {
  faceBox(s, 'structureMetal', face, u, y + hgt + 0.14, 0.09, w + 0.12, 0.26, 0.18, { colour: shade(ROLL_SHUTTER, 1.1), decor: true });
  const down = look();
  if (down < 0.25) return;
  const sh = hgt * Math.min(1, (down - 0.25) * 1.4);
  faceBox(s, 'structureMetal', face, u, y + hgt - sh / 2, 0.035, w - 0.04, sh, 0.02, { colour: ROLL_SHUTTER, decor: true });
}

function yuDialect(h: SiegeHabits, sign: Rgb): HouseDialect {
  return {
    window: (s, face, o, y0) => {
      const y = y0 + o.y0, roll = h.look();
      if (roll < h.sheets) {
        windowUnit(s, face, o.u, y, o.w, o.h, { ...YU_WINDOW, bars: 'none' }, h.look, 0);
        unhcrSheet(s, face, o.u, y, o.w, o.h, h.look);
      } else windowUnit(s, face, o.u, y, o.w, o.h, YU_WINDOW, h.look, h.lit);
      if (o.storey > 0) rollerShutter(s, face, o.u, y, o.w, o.h, h.look);
      else if (roll < h.sheets + h.sandbags) sandbagWindow(s, face, o.u, y, o.w, o.h, h.look);
    },
    door: (s, face, o, y0, frame) => {
      if (o.kind === 'shopfront') { shopfront(s, face, o, y0, sign, h, rgb(0x8a8e8c)); return; }
      doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { leaf: rgb(0x6c6f6c), frame: { bucket: 'plaster3', width: 0.1, out: 0.05 }, transom: o.storey === 0,
        steps: o.storey === 0 ? { bucket: 'plaster3' } : null, leafKind: 'glazed' }, frame.floors[o.storey] + o.y0);
    },
  };
}

function mahalaDialect(rng: () => number, timber: Rgb, h: SiegeHabits): HouseDialect {
  const window: WindowStyle = {
    frame: DARK_FRAME, frameWidth: 0.06, frameOut: 0.04, bars: 'six',
    surround: { bucket: 'structureWood', width: 0.09, out: 0.03, lintel: 0.12, colour: timber },
    sill: { bucket: 'structureWood', out: 0.08, colour: timber },
    shutters: rng() < 0.55 ? { colour: shade(timber, 1.15), kind: 'louvred', closed: 0.18 } : null,
  };
  return {
    window: (s, face, o, y0) => {
      const y = y0 + o.y0;
      if (o.storey === 0) {
        windowUnit(s, face, o.u, y, o.w, o.h, { ...window, shutters: null, bars: 'cross' }, h.look, h.lit * 0.6);
        // the ground storey's iron grille across the opening
        for (let k = 1; k < 4; k++) faceBox(s, 'structureWood', face, o.u - o.w / 2 + o.w * k / 4, y + o.h / 2, 0.03, 0.025, o.h, 0.025, { colour: IRON, decor: true, fine: true });
        if (h.look() < h.sandbags) sandbagWindow(s, face, o.u, y, o.w, o.h, h.look);
        return;
      }
      if (h.look() < h.sheets * 0.6) {
        windowUnit(s, face, o.u, y, o.w, o.h, { ...window, bars: 'none', shutters: null }, h.look, 0);
        unhcrSheet(s, face, o.u, y, o.w, o.h, h.look);
        return;
      }
      windowUnit(s, face, o.u, y, o.w, o.h, window, h.look, h.lit);
    },
    door: (s, face, o, y0, frame) => {
      if (o.kind === 'gate') { gateUnit(s, face, o.u, y0 + o.y0, o.w, o.h, timber, { bucket: 'structureWood', width: 0.14, out: 0.06, colour: shade(timber, 0.8) }); return; }
      doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { leaf: timber, frame: { bucket: 'structureWood', width: 0.12, out: 0.05, colour: shade(timber, 0.8) },
        steps: { bucket: 'stone' }, leafKind: 'plank' }, frame.floors[o.storey] + o.y0);
    },
    // the beam ends under the upper storey's overhang
    dressJetty: (s, face, u0, u1, y, depth) => {
      for (let u = u0 + 0.3; u < u1 - 0.15; u += 0.55) {
        faceBox(s, 'structureWood', face, u, y - 0.07, (0.06 - depth) / 2, 0.13, 0.14, depth + 0.06, { colour: timber, decor: true, fineSides: true });
      }
      faceBox(s, 'structureWood', face, (u0 + u1) / 2, y + 0.05, 0.02, u1 - u0, 0.12, 0.05, { colour: timber, decor: true, fineSides: true });
    },
  };
}

function siege(ctx: RegionalBuildContext, intensity: number): SiegeHabits {
  const look = ctx.variant;
  return { look, sheets: 0.06 + look() * 0.16 * intensity, sandbags: 0.08 + look() * 0.3 * intensity, lit: 0.08 };
}

/** The openings of one face as holes to keep shell pocks out of (absolute heights). */
function keepsOf(openings: readonly Opening[], face: Opening['face'], frame: HouseFrame): Keep[] {
  return openings.filter((o) => o.face === face).map((o) => {
    const y0 = frame.floors[o.storey] + o.y0;
    return { u0: o.u - o.w / 2 - 0.25, u1: o.u + o.w / 2 + 0.25, y0: y0 - 0.2, y1: y0 + o.h + 0.45 };
  });
}

/**
 * A shell's breach in a block's street front (props census #7, lane B 2026-10-14: it was a dark plate on the render),
 * decided before the house is built so its wall is cut through: with `chance`, on an upper storey, 1.2-1.3 m over that
 * storey's floor, clear of the front's openings by half a metre; null otherwise.
 */
function streetBreach(openings: readonly Opening[], n: number, len: number, look: () => number, chance: number, y: number, r0: number, rs: number):
  NonNullable<HouseSpec['breaches']> {
  if (n < 2 || look() >= chance) return [];
  const storey = 1 + Math.floor(look() * (n - 1)), u = (look() - 0.5) * len * 0.7, r = r0 + look() * rs, seed = Math.floor(look() * 1e9);
  const clear = openings.filter((o) => o.face === 'left' && o.storey === storey)
    .every((o) => u < o.u - o.w / 2 - 0.75 || u > o.u + o.w / 2 + 0.75 || y < o.y0 - 0.7 || y > o.y0 + o.h + 0.95);
  return clear ? [{ face: 'left', storey, u, y, r, seed, spall: 'stone' }] : [];
}

const SIGNS: readonly Rgb[] = [0x2f4f3f, 0x6a2e26, 0x2c3d57, 0x7a6a3a, 0x3c3c3c].map(rgb);

// ------------------------------------------------------------------------------------------------ the valley blocks

/**
 * The Austro-Hungarian block: `n` storeys over a ground storey of shops, built along the street (its long side to the
 * street, +z): turned a quarter, its local -x side ('left') is the street front, 'right' the court, its gable ends the
 * party walls. One in nine has lost a corner to the shelling: that end of the front stands one storey high, jagged,
 * the rooms' paint and the floors' scars on the wall above it.
 */
function ahBlock(ctx: RegionalBuildContext, n: number): RegionalParts {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant, mobile = ctx.tier === 'mobile';
  const groundH = 3.9 + rng() * 0.5, upperH = 3.2 + rng() * 0.3;
  const groundStone = rng() < 0.45;
  const roofRoll = rng();
  // a row's blocks meet at firewalls: a gable roof flush with them, or a zinc mansard; the street and court walls stand
  // in by the roof's overhang, so the eaves meet the lot's edge and every row house's solid envelope is the lot's fill
  const roofKind: 'gable' | 'mansard' = roofRoll < 0.62 ? 'gable' : 'mansard';
  // (a pitched roof's slab reaches past its eave by its thickness on the slope: 0.16 m at 35-43 degrees, ~0.11 m)
  const over = roofKind === 'gable' ? 0.62 : 0.12;
  const f = rowFill(ctx), W = clampTo(f.w, 5.0, 60), D = clampTo(f.d - 2 * over, 4.0, 60);
  const door = choose(rng(), DOOR_LEAVES), sign = choose(rng(), SIGNS);
  const passage = rng() < 0.3;
  const balcony = n >= 4 && rng() < 0.38;
  const attic = roofKind !== 'mansard' && rng() < 0.22;
  const pediments = rng() < 0.6;
  const collapse = n >= 4 && W >= 7.6 && rng() < 0.11 ? (rng() < 0.5 ? -1 : 1) : 0;
  const cut = collapse ? clampTo(W * 0.32, 2.4, 3.6) : 0;
  const len = W - cut, zc = -collapse * cut / 2;
  const pitch = 32 + rng() * 8;
  const h = siege(ctx, 1);
  const storeys: HouseSpec['storeys'] = [];
  for (let i = 0; i < n; i++) storeys.push({ h: i === 0 ? groundH : upperH, wall: i === 0 && groundStone ? 'stone' : 'plaster' });
  // the street front ('left'): the entrance or the carriage passage, the shops, the casements above
  const openings: Opening[] = [];
  const doorU = (rng() - 0.5) * len * 0.3;
  // (E10) the carriage passage's round head, cut: it springs over the leaves (the dialect's gate is h - 0.6 tall)
  const entrance: Opening = passage ? { face: 'left', storey: 0, kind: 'gate', u: doorU, w: 2.6, y0: 0, h: 3.3, arch: { spring: 3.3 - 0.58 } }
    : { face: 'left', storey: 0, kind: 'door', u: doorU, w: 1.4, y0: 0, h: 2.9 };
  openings.push(entrance);
  for (const side of [-1, 1]) {
    const sw = Math.min(3.0, len * 0.28), su = doorU + side * (entrance.w / 2 + 0.55 + sw / 2);
    if (Math.abs(su) + sw / 2 < len / 2 - 0.55) openings.push({ face: 'left', storey: 0, kind: 'shopfront', u: su, w: sw, y0: 0, h: Math.min(3.2, groundH - 0.55) });
  }
  for (let i = 1; i < n; i++) {
    for (const o of windowRhythm('left', i, len, { w: 1.05, h: i === 1 ? 2.05 : 1.85, sill: 0.75, spacing: 2.05, margin: 0.95 })) openings.push(o);
  }
  if (balcony) {
    const row = openings.filter((o) => o.face === 'left' && o.storey === 1);
    if (row.length) {
      const mid = row.reduce((a, b) => (Math.abs(b.u) < Math.abs(a.u) ? b : a));
      mid.kind = 'door'; mid.y0 = 0.05; mid.h = 2.45; mid.w = 1.15;
    }
  }
  // the court side ('right'): a back door, smaller casements
  openings.push({ face: 'right', storey: 0, kind: 'door', u: (rng() - 0.5) * len * 0.4, w: 1.0, y0: 0, h: 2.3 });
  for (let i = 1; i < n; i++) for (const o of windowRhythm('right', i, len, { w: 0.95, h: 1.6, sill: 0.95, spacing: 2.5, margin: 1.0 })) openings.push(o);
  // a burnt top storey (one block in six): every casement of it gutted, the soot up to the cornice
  if (look() < 0.17) for (const o of openings) if (o.storey === n - 1 && o.kind === 'window' && o.face === 'left') o.state = 'burnt';
  const roof: RoofSpec = roofKind === 'gable' ? { kind: 'gable', pitchDeg: pitch + 3, eave: over - 0.12, verge: 0, thickness: 0.16, bucket: 'roof', ridge: 'saddle' }
    : { kind: 'flat', pitchDeg: 0, eave: 0.06, verge: 0, thickness: 0.24, bucket: 'stone' };
  const chimneys: HouseSpec['chimneys'] = roofKind === 'mansard' ? [] : [
    { x: (rng() - 0.5) * 0.8, z: len / 2 - 0.9, sx: 0.6, sz: 0.75, above: 1.0, bucket: 'stone', cap: 'slab' },
    { x: (rng() - 0.5) * 0.8, z: -len / 2 + 0.9, sx: 0.6, sz: 0.75, above: 1.0, bucket: 'stone', cap: 'slab' },
  ];
  const breaches = streetBreach(openings, n, len, look, 0.22, 1.2, 0.35, 0.3);
  sink.placed(0, f.cx, 0, f.cz, () => sink.placed(Math.PI / 2, 0, 0, 0, () => sink.placed(0, 0, 0, zc, () => {
    const frame = buildHouse(sink, {
      w: D, d: len, plinth: { h: 0.35, out: 0.05, bucket: 'stone' }, storeys, roof, gableBucket: 'plaster', openings, chimneys,
      gutters: roofKind === 'mansard' ? null : { colour: ZINC }, verge: null, reveal: 0.22, rafters: null, spall: 'stone', breaches,
    }, ahDialect(rng, door, h, sign));
    const b = frame.bodies[0], eave = frame.eaveY;
    // string course over the shops, the piano nobile's sill course, the crowning cornice
    sink.band('stone', b.x0 - 0.07, frame.floors[1] - 0.26, b.z0 - 0.07, b.x1 + 0.07, frame.floors[1] - 0.02, b.z1 + 0.07, { decor: true });
    if (n > 2) sink.band('stone', b.x0 - 0.04, frame.floors[1] + 0.58, b.z0 - 0.04, b.x1 + 0.04, frame.floors[1] + 0.7, b.z1 + 0.04, { decor: true });
    sink.band('stone', b.x0 - 0.18, eave - 0.62, b.z0 - 0.18, b.x1 + 0.18, eave - 0.2, b.z1 + 0.18, { decor: true });
    sink.band('stone', b.x0 - 0.36, eave - 0.2, b.z0 - 0.36, b.x1 + 0.36, eave + 0.02, b.z1 + 0.36, { decor: true });
    const street = frame.faces.left;
    // the street front's corner lesenes
    for (const side of [-1, 1]) {
      faceBox(sink, 'stone', street, side * (len / 2 - 0.3), (frame.floors[1] + eave - 0.62) / 2, 0.025, 0.6, eave - 0.62 - frame.floors[1], 0.05, { decor: true, fineSides: true });
    }
    // pediments over the piano nobile, segmental hoods (a cornice slab) over the storey above
    for (const o of openings) {
      if (o.face !== 'left' || o.kind !== 'window' || o.state) continue;
      const top = frame.floors[o.storey] + o.y0 + o.h + 0.3;
      if (o.storey === 1 && pediments) pediment(sink, street, o.u, top + 0.02, o.w + 0.62, 0.38);
      else if (o.storey === 2 || (o.storey === 1 && !pediments)) faceBox(sink, 'stone', street, o.u, top + 0.06, 0.09, o.w + 0.56, 0.12, 0.18, { decor: true, fineSides: true });
    }
    // the balcony on its corbels, the cast-iron railing
    const bal = openings.find((o) => o.face === 'left' && o.storey === 1 && o.kind === 'door');
    if (bal) {
      const y = frame.floors[1];
      faceBox(sink, 'stone', street, bal.u, y - 0.08, 0.45, 2.6, 0.18, 0.9, { decor: true });
      for (const du of [-1.0, 0, 1.0]) faceBox(sink, 'stone', street, bal.u + du, y - 0.42, 0.3, 0.22, 0.5, 0.6, { decor: true, fineSides: true });
      if (!mobile) railing(sink, street, bal.u - 1.25, bal.u + 1.25, y + 0.01, 0.86);
    }
    // the roof: a mansard of zinc with its dormers, or the tiled roof's dormer, a Secession attic gable, an aerial
    if (roofKind === 'mansard') mansard(sink, frame, len, look, mobile);
    else {
      const rg = frame.roof;
      if (attic) {
        const g = Math.min(len * 0.45, 4.6);
        const poly: Array<[number, number]> = [[-g / 2, eave], [g / 2, eave], [g / 2, eave + 0.9], [g * 0.3, eave + 1.55], [0, eave + 1.95], [-g * 0.3, eave + 1.55], [-g / 2, eave + 0.9]];
        const face: Face = { ...street, origin: [street.origin[0] + 0.12, 0, street.origin[2]] };
        wallPolygon(sink, 'plaster', face, poly, 0.3, { decor: true });
        atticOculus(sink, face, eave); // (looks r2 forms, 2026-10-16: extracted to sarajevoRoofs.ts, rebuilt there)
      } else if (rg.kind !== 'flat' && look() < 0.45) {
        ahDormer(sink, rg, eave, len, look, AH_WINDOW); // (looks r2 b-east, 2026-10-16: extracted to sarajevoDormer.ts, rebuilt there)
      }
      if (rg.kind !== 'flat' && look() < 0.4) {
        const at = (look() - 0.5) * len * 0.5;
        sink.dressing(mobile, () => tvAerial(sink, frame, at, look));
      }
    }
    // the siege on the street front: shell pocks, a shell hole in a pier, a burnt storey's soot
    const keeps = keepsOf(openings, 'left', frame);
    const pocks = 8 + look() * 30;
    shellPocks(sink, street, { u0: -len / 2 + 0.3, u1: len / 2 - 0.3, y0: 0.5, y1: eave - 0.7 }, Math.round(pocks), keeps, look, 'stone',
      Math.round((mobile ? 0.4 : 1) * pocks));
    if (collapse) collapsedEnd(sink, frame, collapse, cut, len, groundH, look, mobile);
  })));
  return sink.finish();
}

/**
 * The block's zinc mansard over its flat roof: steep lower slopes, a flat top, dormers in the street slope (the
 * turned frame: the street is local -x).
 */
function mansard(sink: PartSink, frame: HouseFrame, len: number, look: () => number, mobile: boolean): void {
  const b = frame.bodies[frame.bodies.length - 1], e = frame.eaveY + 0.24, a = (b.x1 - b.x0) / 2;
  const rise = 2.7, inset = 1.0;
  const colour = choose(look(), [ZINC, rgb(0x6b3a2e), rgb(0x3f5848), rgb(0x55595c)]);
  sink.prism('structureMetal', [[-a - 0.1, e, -len / 2], [a + 0.1, e, -len / 2], [a - inset, e + rise, -len / 2], [-a + inset, e + rise, -len / 2]],
    [0, 0, 1], len, { colour });
  const count = Math.max(1, Math.floor((len - 1.2) / 2.6));
  for (let k = 0; k < count; k++) {
    const dz = -len / 2 + (k + 0.5) * (len / count), dw = 1.15, x0 = -a - 0.02, x1 = -a + inset + 0.15;
    mansardDormer(sink, x0, x1, e, dz, dw, look, { ...AH_WINDOW, surround: null, sill: null, bars: mobile ? 'none' : 'cross' }); // (looks r2 forms: sarajevoRoofs.ts)
  }
}

/**
 * The collapsed end of a block (turned frame, the street local -x): one storey of piers and a gutted shop, the floors
 * above gone to a jagged stub, the end wall of the standing block scarred with the floors and the rooms' paint, the
 * rubble spilled toward the street.
 */
function collapsedEnd(sink: PartSink, frame: HouseFrame, side: -1 | 1, cut: number, len: number, groundH: number, look: () => number, mobile: boolean): void {
  const b = frame.bodies[0];
  const z0 = side > 0 ? len / 2 : -len / 2 - cut, z1 = z0 + cut;
  const t = 0.35;
  // the street wall: a pier against the standing block broken off a storey up, the gutted shop's sill, a far pier
  const near = (f0: number, f1: number): [number, number] => (side > 0 ? [z0 + cut * f0, z0 + cut * f1] : [z1 - cut * f1, z1 - cut * f0]);
  const [pa, pb] = near(0, 0.32), [sa, sb] = near(0.32, 0.78), [fa, fb] = near(0.78, 1);
  sink.span('plaster', b.x0, -0.3, pa, b.x0 + t, groundH + 1.4 + look() * 1.4, pb);
  sink.span('plaster', b.x0, -0.3, sa, b.x0 + t, 0.7, sb);
  sink.span('plaster', b.x0, -0.3, fa, b.x0 + t, groundH * (0.55 + look() * 0.3), fb);
  sink.span('plaster', b.x1 - t, -0.3, z0, b.x1, groundH + 0.9, z1);
  const farZ = side > 0 ? z1 - t : z0;
  sink.span('plaster', b.x0 + t, -0.3, farZ, b.x1 - t, groundH + 2.4, farZ + t);
  // the rubble heap inside and spilled to the pavement, a floor slab hanging off the end wall
  sink.span('stone', b.x0 + 0.2, -0.3, z0 + 0.2, b.x1 - 0.2, 1.1, z1 - 0.2, { decor: true });
  const mx = (b.x0 + b.x1) / 2;
  sink.member('stone', [mx, groundH + 0.2, side > 0 ? z0 + 0.1 : z1 - 0.1], [mx + 0.3, 1.0, side > 0 ? z0 + cut * 0.7 : z1 - cut * 0.7],
    (b.x1 - b.x0) * 0.7, 0.22, [0, 1, 0], { decor: true, exposed: true });
  // the standing block's end wall over the stub: the floors' scars and the rooms' paint
  const wallFace: Face = side > 0 ? { origin: [0, 0, len / 2], u: [1, 0, 0], out: [0, 0, 1], width: b.x1 - b.x0 }
    : { origin: [0, 0, -len / 2], u: [-1, 0, 0], out: [0, 0, -1], width: b.x1 - b.x0 };
  const paints: readonly Rgb[] = [0xb9a98a, 0x9db0a4, 0xc4a49a, 0xa8a0b4, 0xd2c7a8].map(rgb);
  for (let i = 1; i < frame.floors.length; i++) {
    const y = frame.floors[i];
    faceBox(sink, 'stone', wallFace, 0, y - 0.1, 0.03, wallFace.width - 0.3, 0.24, 0.06, { decor: true });
    sink.dressing(mobile, () => {
      const rooms = 1 + Math.floor(look() * 2);
      for (let r = 0; r < rooms; r++) {
        const w = (wallFace.width - 0.6) / rooms, u = -wallFace.width / 2 + 0.3 + w * (r + 0.5);
        faceBox(sink, 'structureWood', wallFace, u, y + 1.45, 0.012, w - 0.15, 2.4, 0.01, { colour: choose(look(), paints), decor: true });
      }
    });
  }
  sootBand(sink, 'plaster', wallFace, -wallFace.width / 2, wallFace.width / 2, groundH + 2.4, groundH + 5.0);
}

/**
 * The Yugoslav infill block of the 1960s and 70s: `n` storeys of concrete over a ground storey of shop glazing, the
 * windows in a grid under their roller-shutter boxes, loggia doors with balconies behind coloured parapet panels, the
 * slab edges banding the front, a flat roof with its lift room and aerials.
 */
function yuBlock(ctx: RegionalBuildContext, n: number): RegionalParts {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant, mobile = ctx.tier === 'mobile';
  // the flat roof overhangs its walls by 0.12 m: the walls stand in by that, the roof's edge on the lot's fill
  const f = rowFill(ctx), W = clampTo(f.w - 0.24, 5.0, 60), D = clampTo(f.d - 0.24, 5.0, 60);
  const groundH = 3.5, upperH = 2.85;
  const panel = choose(rng(), PANEL_PAINTS), sign = choose(rng(), SIGNS);
  const loggiaEvery = rng() < 0.5 ? 2 : 3;
  const h = siege(ctx, 1);
  const storeys: HouseSpec['storeys'] = [];
  for (let i = 0; i < n; i++) storeys.push({ h: i === 0 ? groundH : upperH, wall: 'plaster3' });
  const openings: Opening[] = [];
  const doorU = (rng() - 0.5) * W * 0.3;
  openings.push({ face: 'left', storey: 0, kind: 'door', u: doorU, w: 1.6, y0: 0, h: 2.6 });
  for (const side of [-1, 1]) {
    const sw = Math.min(3.4, W * 0.3), su = doorU + side * (0.8 + 0.5 + sw / 2);
    if (Math.abs(su) + sw / 2 < W / 2 - 0.4) openings.push({ face: 'left', storey: 0, kind: 'shopfront', u: su, w: sw, y0: 0, h: 3.0 });
  }
  const bays = Math.max(2, Math.floor((W - 1.0) / 2.6));
  for (let i = 1; i < n; i++) for (let k = 0; k < bays; k++) {
    const u = -W / 2 + 0.5 + (W - 1.0) * (k + 0.5) / bays;
    if (k % loggiaEvery === 0) openings.push({ face: 'left', storey: i, kind: 'door', u, w: 1.7, y0: 0.05, h: 2.25 });
    else openings.push({ face: 'left', storey: i, kind: 'window', u, w: 1.45, y0: 0.9, h: 1.35 });
  }
  openings.push({ face: 'right', storey: 0, kind: 'door', u: 0, w: 1.1, y0: 0, h: 2.3 });
  for (let i = 1; i < n; i++) for (const o of windowRhythm('right', i, W, { w: 1.1, h: 1.2, sill: 1.0, spacing: 2.4, margin: 0.9 })) openings.push(o);
  if (look() < 0.15) for (const o of openings) if (o.storey === n - 2 && o.face === 'left' && o.kind === 'window') o.state = 'burnt';
  const breaches = streetBreach(openings, n, W, look, 0.28, 1.3, 0.4, 0.35);
  sink.placed(0, f.cx, 0, f.cz, () => sink.placed(Math.PI / 2, 0, 0, 0, () => {
    const frame = buildHouse(sink, {
      w: D, d: W, plinth: { h: 0.25, out: 0.04, bucket: 'plaster3' }, storeys,
      roof: { kind: 'flat', pitchDeg: 0, eave: 0.12, verge: 0.12, thickness: 0.3, bucket: 'plaster3', parapet: 0.45 }, gableBucket: 'plaster3',
      openings, chimneys: [], gutters: null, verge: null, reveal: 0.16, spall: 'stone', breaches,
    }, yuDialect(h, sign));
    const b = frame.bodies[0], street = frame.faces.left;
    // the slab edges banding the street and court fronts
    for (let i = 1; i < n; i++) {
      const y = frame.floors[i];
      for (const f of [frame.faces.left, frame.faces.right]) faceBox(sink, 'plaster3', f, 0, y - 0.05, 0.04, f.width + 0.06, 0.3, 0.08, { decor: true, fineSides: true });
    }
    // the balconies: a slab on the loggia's floor, the coloured parapet panel at its edge
    for (const o of openings) {
      if (o.face !== 'left' || o.kind !== 'door' || o.storey === 0) continue;
      const y = frame.floors[o.storey];
      faceBox(sink, 'plaster3', street, o.u, y - 0.04, 0.5, o.w + 0.9, 0.16, 1.0, { decor: true });
      const pc = o.state ? CHAR : shade(panel, 0.92 + look() * 0.16);
      faceBox(sink, 'structureMetal', street, o.u, y + 0.55, 0.96, o.w + 0.9, 1.0, 0.07, { colour: pc, decor: true });
      for (const du of [-1, 1]) faceBox(sink, 'structureWood', street, o.u + du * (o.w + 0.86) / 2, y + 0.55, 0.5, 0.06, 1.0, 0.9, { colour: shade(pc, 0.85), decor: true, fine: true });
    }
    // the lift room and the aerials on the roof
    const top = frame.eaveY + 0.3;
    sink.span('plaster3', -1.2, top, -1.4, 1.2, top + 2.3, 1.4, { decor: true });
    sink.dressing(mobile, () => {
      for (let k = 0; k < 2 + Math.floor(look() * 3); k++) {
        const x = (look() - 0.5) * (b.x1 - b.x0 - 1.5), z = (look() - 0.5) * (W - 1.5);
        sink.cylinder('structureMetal', [x, top - 0.05, z], 'y', 2.4 + look() * 1.6, 0.03, 5, { colour: rgb(0x8c9092), decor: true });
        sink.member('structureMetal', [x - 0.6, top + 2.2, z], [x + 0.6, top + 2.2, z], 0.03, 0.03, [0, 1, 0], { colour: rgb(0x8c9092), decor: true, exposed: true }, 0);
      }
    });
    const keeps = keepsOf(openings, 'left', frame);
    const pocks = 10 + look() * 26;
    shellPocks(sink, street, { u0: -W / 2 + 0.3, u1: W / 2 - 0.3, y0: 0.6, y1: frame.eaveY - 0.4 }, Math.round(pocks), keeps, look, 'stone',
      Math.round((mobile ? 0.4 : 1) * pocks));
  }));
  return sink.finish();
}

// ------------------------------------------------------------------------------------------------ the mahala

/**
 * The mahala house: the house at the street front (+z) of its plot, its garden behind it within a whitewashed wall
 * under a tiled coping. A ground storey of rubble stone or whitewash with small grilled windows and a plank door, the
 * whitewashed upper storey oversailing the street on its beam ends, the doksat's row of windows on its brackets, a
 * steep hipped roof of dark tile on wide eaves with the rafter feet showing, the chimney under its hood.
 */
function mahalaHouse(ctx: RegionalBuildContext): RegionalParts {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant, mobile = ctx.tier === 'mobile';
  const f = rowFill(ctx), W = clampTo(f.w, 5.0, 40), D = clampTo(f.d, 5.0, 40);
  // the house fills the plot's width (the row's houses meet, as the base row's do), its garden behind it
  const jet = 0.45, sideJet = rng() < 0.4 ? 0.3 : 0;
  // the house as wide as its eaves allow in the lot (they meet the neighbours' at the lot's edge), the lot's sides walled
  // to the street; a narrow lot takes a shorter eave
  // (the steep roof's slab reaches past its eave by its thickness on the slope: 0.15 m at 47-56 degrees, under 0.13 m)
  const eaveM = Math.max(0.35, Math.min(0.8 + rng() * 0.2, (W - 4.4) / 2 - sideJet - 0.13));
  const reach = eaveM + 0.13;
  const Wh = clampTo(W - 2 * (reach + sideJet), 3.6, 14), Dh = clampTo(D * (0.55 + rng() * 0.12), 4.6, 9.0);
  const groundStone = rng() < 0.6;
  const timber = choose(rng(), TIMBER);
  const pitch = 47 + rng() * 9, eave = eaveM;
  const doksat = rng() < 0.8, dw = clampTo(Wh * (0.36 + rng() * 0.12), 2.2, 3.6), du = (rng() - 0.5) * (Wh - dw - 1.2);
  const g0 = 2.55 + rng() * 0.25, g1 = 2.7 + rng() * 0.25;
  const h = siege(ctx, 0.7);
  // the house's front face (its upper storey's, jettied) at the plot's street edge
  const front = D / 2 - jet - reach, zc = front - Dh / 2;
  sink.placed(0, f.cx, 0, f.cz, () => {
  const openings: Opening[] = [];
  const doorU = (rng() - 0.5) * (Wh - 2.2);
  openings.push({ face: 'front', storey: 0, kind: 'door', u: doorU, w: 1.05, y0: 0, h: 2.05 });
  for (const o of windowRhythm('front', 0, Wh, { w: 0.62, h: 0.78, sill: 1.25, spacing: 1.8, margin: 0.8, avoid: [[doorU - 0.6, doorU + 0.6]] })) openings.push(o);
  for (const o of windowRhythm('front', 1, Wh + 2 * sideJet, { w: 0.74, h: 1.05, sill: 0.72, spacing: 1.45, margin: 0.6, avoid: doksat ? [[du - dw / 2 - 0.2, du + dw / 2 + 0.2]] : [] })) openings.push(o);
  for (const face of ['left', 'right'] as const) {
    for (const o of windowRhythm(face, 1, Dh + jet, { w: 0.7, h: 1.0, sill: 0.75, spacing: 1.7, margin: 0.7, max: 3 })) openings.push(o);
    for (const o of windowRhythm(face, 0, Dh, { w: 0.55, h: 0.72, sill: 1.3, spacing: 2.4, margin: 1.2, max: 1 })) openings.push(o);
  }
  openings.push({ face: 'back', storey: 0, kind: 'door', u: (rng() - 0.5) * (Wh - 2), w: 0.95, y0: 0, h: 2.0 });
  for (const o of windowRhythm('back', 1, Wh + 2 * sideJet, { w: 0.72, h: 1.0, sill: 0.75, spacing: 1.7, margin: 0.8 })) openings.push(o);
  const roof: RoofSpec = { kind: 'hip', pitchDeg: pitch, eave, verge: eave, thickness: 0.15, bucket: 'roof', ridge: 'round' };
  sink.placed(0, 0, 0, zc, () => {
    const frame = buildHouse(sink, {
      w: Wh, d: Dh, plinth: { h: 0.25, out: 0.04, bucket: 'stone' },
      storeys: [{ h: g0, wall: groundStone ? 'stone' : 'plaster' }, { h: g1, wall: 'plaster', jetty: [jet, sideJet, 0, sideJet] }],
      roof, gableBucket: 'plaster', openings,
      chimneys: [{ x: (rng() - 0.5) * Wh * 0.4, z: (rng() - 0.5) * Dh * 0.4, sx: 0.55, sz: 0.55, above: 0.7, bucket: 'plaster', cap: 'tile' }],
      gutters: null, verge: null, reveal: groundStone ? 0.28 : 0.2, rafters: mobile ? null : timber, spall: 'stone',
    }, mahalaDialect(rng, timber, h));
    const up = storeyFaces(frame, 1).front;
    const y1 = frame.floors[1];
    // the corner posts and the sill beam of the timber-framed upper storey
    const tc = { colour: timber, decor: true, fineSides: true } as const;
    for (const s of [-1, 1]) faceBox(sink, 'structureWood', up, s * (up.width / 2 - 0.07), y1 + g1 / 2, 0.02, 0.14, g1, 0.05, tc);
    faceBox(sink, 'structureWood', up, 0, frame.eaveY - 0.08, 0.02, up.width, 0.16, 0.05, tc);
    // the doksat: a bay of windows on its brackets, under the main eaves
    if (doksat) {
      const dd = 0.7, yb = y1 + 0.05, yt = frame.eaveY - 0.1;
      const bay = doksatBay(sink, up, du, dw, dd, yb, yt, look, h.lit, DARK_FRAME); // (looks r2 forms: sarajevoRoofs.ts)
      faceBox(sink, 'structureWood', bay, du, yb + 0.47, 0.03, dw + 0.06, 0.1, 0.07, tc);
      faceBox(sink, 'structureWood', up, du, yb + 0.02, dd / 2 + 0.02, dw + 0.12, 0.12, dd + 0.05, { colour: timber, decor: true });
      // the side walls of the bay, its brackets down the wall
      for (const s of [-1, 1]) {
        sink.member('structureWood', facePoint(up, du + s * (dw / 2 - 0.12), y1 - 0.9, 0.02 - jet), facePoint(up, du + s * (dw / 2 - 0.12), yb - 0.02, dd - 0.05),
          0.11, 0.11, [s * up.u[0], 0, s * up.u[2]], { colour: timber, decor: true, exposed: true }, 0);
      }
    }
    // the garden wall round the yard behind the house, under its tiled coping, the gate in a side wall
    // (the side walls run the lot's whole depth, alongside the house to the street: the row's lots stay closed)
    const ga = -D / 2, gb = D / 2 - 0.1, yard = zc - Dh / 2;
    if (yard - ga > 1.2) {
      const wallH = 2.1 + rng() * 0.3, t = 0.34, gateSide = rng() < 0.5 ? -1 : 1, gz = ga + (yard - ga) * (0.35 + rng() * 0.3), gw = 1.6;
      const runs: Array<[number, number, number, number]> = [[-W / 2, ga, W / 2, ga + t]];
      for (const s of [-1, 1]) {
        const x0 = s < 0 ? -W / 2 : W / 2 - t, x1 = x0 + t;
        if (s === gateSide && yard - ga > gw + 1.2) {
          runs.push([x0, ga + t, x1, gz - gw / 2], [x0, gz + gw / 2, x1, gb]);
          const gf: Face = { origin: [s * W / 2, 0, gz], u: [0, 0, -s], out: [s, 0, 0], width: gw };
          // (the buildings stream, 2026-10-13, the integrity check: the gate's leaves were drawn on the lane side only,
          // so from the yard the gap stood open, the leaves' backs culled) the leaves on the yard side as well, and the
          // wall carried over the gate through its thickness (dressing: the runs keep their collision)
          const gIn: Face = { origin: [s * (W / 2 - t), 0, gz], u: [0, 0, s], out: [-s, 0, 0], width: gw };
          sink.placed(0, 0, 0, -zc, () => {
            gateUnit(sink, gf, 0, 0, gw - 0.1, 1.95, timber, { bucket: 'plaster', width: 0.18, out: 0.04 });
            gateUnit(sink, gIn, 0, 0, gw - 0.1, 1.95, timber, { bucket: 'plaster', width: 0.18, out: 0.04 });
            sink.span('plaster', x0, 2.13, gz - gw / 2, x1, Math.max(2.16, wallH), gz + gw / 2, { decor: true });
          });
        } else runs.push([x0, ga + t, x1, gb]);
      }
      sink.placed(0, 0, 0, -zc, () => {
        for (const [x0, z0, x1, z1] of runs) {
          if (z1 - z0 < 0.1 || x1 - x0 < 0.1) continue;
          sink.span('plaster', x0, -0.3, z0, x1, wallH, z1);
          // the coping: a ridge of tiles along the wall head
          const along = Math.abs(x1 - x0) > Math.abs(z1 - z0);
          const cap: RoofSpec = { kind: 'gable', pitchDeg: 30, eave: 0.12, verge: 0.04, thickness: 0.07, bucket: 'roof', ridge: null };
          const lenW = along ? x1 - x0 : z1 - z0;
          sink.placed(along ? Math.PI / 2 : 0, (x0 + x1) / 2, 0, (z0 + z1) / 2, () => emitRoof(sink, roofGeometry(t, lenW, wallH, cap), { ...cap, decor: true }));
        }
        if (look() < 0.6) {
          const wf: Face = { origin: [0, 0, ga + t], u: [1, 0, 0], out: [0, 0, 1], width: W - 0.4 };
          sink.dressing(mobile, () => woodpile(sink, wf, -W / 2 + 0.8, -W / 2 + 0.8 + Math.min(2.6, W * 0.3), 1.2, look));
        }
        sink.dressing(mobile, () => {
          for (let k = 0; k < 3; k++) pottedPlant(sink, (look() - 0.5) * (W - 1.5), 0, ga + 1 + look() * Math.max(0.2, gb - ga - 2), 0.35 + look() * 0.2, look);
        });
      });
    }
    const keeps = keepsOf(openings, 'front', frame);
    const pocks = 3 + look() * 12;
    shellPocks(sink, frame.faces.front, { u0: -Wh / 2 + 0.2, u1: Wh / 2 - 0.2, y0: 0.4, y1: y1 - 0.2 }, Math.round(pocks), keeps, look, 'stone',
      Math.round((mobile ? 0.3 : 1) * pocks));
  });
  });
  return sink.finish();
}

// ------------------------------------------------------------------------------------------------ ruins

/**
 * The shell of an Austro-Hungarian block: the street front standing two or three storeys with its empty windows to a
 * ragged head, the side walls stepping down toward the court, the floors fallen into a heap behind the front, a slab
 * hanging, charred joists. Inside the ruin's plot; the front is +z.
 */
function ahShell(ctx: RegionalBuildContext): RegionalParts {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant, mobile = ctx.tier === 'mobile';
  // (a ruin's base is centred on its plot: its fill's centre stands within a few centimetres of the origin)
  const f = rowFill(ctx), W = clampTo(f.w, 4.6, 30), D = clampTo(f.d, 5.0, 30), t = 0.4;
  const storeys = 2 + (rng() < 0.45 ? 1 : 0), gH = 4.0, uH = 3.3;
  const wall: RegionalBucket = rng() < 0.3 ? 'stone' : 'plaster';
  // (props census #7, lane B 2026-10-14; the judges: "span boxes to level tops, the floors one box, the windows gaps
  // between boxes") the ruin grammar (ruinGrammar.ts): the block's own walls, storeys and windows broken — the street
  // front standing to a ragged head over its empty windows with their lintels and sills, the side walls falling from the
  // front to the court, a stub of the back; the floors fallen into the heaps with the joists broken off at the storey
  // lines, the roof's tiles slid in, a slab hanging from the front
  const bays = W > 6.6 ? 3 : 2, bw = W / bays;
  const heights = Array.from({ length: storeys }, (_, s) => (s === 0 ? gH - 0.35 : uH));
  const openings: Opening[] = [];
  for (let s = 0; s < storeys; s++) {
    const ow = s === 0 ? Math.min(1.9, bw - 0.9) : Math.min(1.1, bw - 0.8), sill = s === 0 ? 0.25 : 0.8, oh = s === 0 ? 2.9 : 1.85;
    for (let k = 0; k < bays; k++) openings.push({ face: 'front', storey: s, kind: s === 0 ? 'shopfront' : 'window', u: -W / 2 + (k + 0.5) * bw, w: ow, y0: sill, h: oh });
  }
  const total = heights.reduce((x, y) => x + y, 0);
  const front = total * (0.82 + rng() * 0.18);
  ruinHouse(sink, {
    w: W, d: D, t, wall, plinth: { h: 0.35, out: 0.06, bucket: 'stone' }, storeys: heights, openings,
    heads: {
      front: { a: front * (0.85 + rng() * 0.15), b: front * (0.7 + rng() * 0.3), at: 0.2 + rng() * 0.6, dip: 0.25 + rng() * 0.35, ragged: 0.6 },
      right: { a: front * (0.75 + rng() * 0.2), b: 0.9 + rng() * 1.2, ragged: 0.5 },
      left: { a: 0.9 + rng() * 1.2, b: front * (0.75 + rng() * 0.2), ragged: 0.5 },
      back: rng() < 0.5 ? { a: 0.9 + rng() * 1.6, b: 0.6 + rng() * 0.8, ragged: 0.4 } : null,
    },
    stub: 0.55, lintel: { bucket: 'stone' }, roof: { bucket: 'roof', piece: [0.9, 0.6, 0.04] }, timber: CHAR, mobile,
  }, rng, look);
  // the slab hanging from the front over the heap
  sink.member('stone', [0, 0.35 + gH - 0.35, D / 2 - t - 0.1], [0.4, 1.2, D / 2 - t - D * 0.45], W * 0.55, 0.22, [0, 1, 0.3], { decor: true, exposed: true });
  return sink.finish();
}

/**
 * A mahala house burnt to its stone ground storey: the walls to ragged heads with their door and window gaps, the
 * charred posts of the upper floor standing out of them, the roof's tiles fallen in, the chimney standing alone.
 */
function mahalaShell(ctx: RegionalBuildContext): RegionalParts {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant, mobile = ctx.tier === 'mobile';
  const f = rowFill(ctx), W = clampTo(f.w, 4.6, 30), D = clampTo(f.d, 5.0, 30), t = 0.5;
  const gH = 2.5 + rng() * 0.3;
  // (props census #7, lane B 2026-10-14; the judges: "a ring of boxes to toothed tops, a toy brick wall") the ruin
  // grammar: the stone ground storey's own walls broken to heads falling from the corners to the breach, the door and
  // the windows cut through them, the chimney stack standing with its firebox, the tiles fallen in over the heaps
  const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'door', u: (rng() - 0.5) * (W - 2.4), w: 1.0, y0: 0, h: 2.0 }];
  for (const face of ['right', 'left'] as const) for (const o of windowRhythm(face, 0, D - 2 * t, { w: 0.8, h: 0.9, sill: 0.9, spacing: 2.4, margin: 0.9, max: 2 })) openings.push(o);
  const head = (lo: number): RuinHead => ({ a: gH * (lo + rng() * 0.35), b: gH * (lo + rng() * 0.35), at: 0.2 + rng() * 0.6, dip: 0.2 + rng() * 0.5, ragged: 0.3 });
  const cx = (rng() - 0.5) * W * 0.4, cz = (rng() - 0.5) * D * 0.4;
  ruinHouse(sink, {
    w: W, d: D, t, wall: 'stone', plinth: { h: 0.3, out: 0.05, bucket: 'stone' }, storeys: [gH], openings,
    heads: { front: head(0.7), right: head(0.6), back: head(0.55), left: head(0.6) },
    stub: 0.5, lintel: { bucket: 'structureWood', colour: CHAR }, roof: { bucket: 'roof', piece: [0.5, 0.35, 0.03] }, timber: CHAR,
    chimney: { x: cx, z: cz, w: 0.64, h: gH + 3.4, bucket: 'plaster' }, mobile,
  }, rng, look);
  sink.dressing(mobile, () => {
    for (let k = 0; k < 5; k++) {
      const x = (look() < 0.5 ? -1 : 1) * (W / 2 - 0.3), z = (look() - 0.5) * (D - 1);
      // (the integrity check, 2026-10-12: the charred posts began 2 m up the broken walls, in the air) each post from
      // the fallen tiles' heap at the wall's foot
      sink.member('structureWood', [x, 0.2, z], [x + (look() - 0.5) * 0.4, gH + 0.8 + look() * 1.8, z + (look() - 0.5) * 0.4], 0.16, 0.16, [1, 0, 0], { colour: CHAR, decor: true, exposed: true }, 0);
    }
  });
  return sink.finish();
}

/** A gutted concrete frame: columns, the floor slabs (one hanging off its column line), block infill stubs. */
function frameShell(ctx: RegionalBuildContext): RegionalParts {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant, mobile = ctx.tier === 'mobile';
  const f = rowFill(ctx), W = clampTo(f.w, 4.6, 30), D = clampTo(f.d, 5.0, 30);
  const floors = 2 + (rng() < 0.5 ? 1 : 0), fh = 2.9, c = 0.4;
  sink.span('plaster3', -W / 2, -0.3, -D / 2, W / 2, 0.3, D / 2);
  const xs = [-W / 2 + c / 2, 0, W / 2 - c / 2], zs = [-D / 2 + c / 2, D / 2 - c / 2];
  const lost = Math.floor(rng() * 6);
  const tops: number[] = [];
  xs.forEach((x, i) => zs.forEach((z, j) => {
    const k = i * 2 + j, top = k === lost ? fh * (0.6 + rng() * 0.6) : floors * fh;
    tops[k] = top;
    sink.span('plaster3', x - c / 2, 0.3, z - c / 2, x + c / 2, top, z + c / 2);
  }));
  for (let f = 1; f <= floors; f++) {
    const y = f * fh;
    if (f === floors && rng() < 0.5) {
      sink.member('plaster3', [0, y - 0.2, D / 2 - c], [0, y - 2.2, -D / 2 + 1.2], W - 0.4, 0.24, [0, 1, 0], { decor: true, exposed: true });
      continue;
    }
    sink.span('plaster3', -W / 2, y - 0.25, -D / 2, W / 2, y, D / 2);
  }
  // block infill stubs between the columns, the rubble
  for (const s of [-1, 1]) sink.span('stone', -W / 2 + c, 0.3, s * (D / 2 - c / 2) - 0.12, -W / 2 + c + (W - 2 * c) * (0.3 + rng() * 0.5), 0.9 + rng() * 1.5, s * (D / 2 - c / 2) + 0.12);
  sink.span('stone', -W / 2 + 0.5, 0.2, -D / 2 + 0.5, W / 2 - 0.5, 0.9, D / 2 - 0.5, { decor: true });
  sink.dressing(mobile, () => {
    for (let k = 0; k < 6; k++) {
      // (the buildings stream, 2026-10-13, the integrity check: the bars stood at the frame's full height over the column
      // that broke off, up to 2.2 m in the air) each bar out of its own column's broken head
      const i = Math.floor(look() * 3), j = Math.floor(look() * 2), x = xs[i], z = zs[j], head = tops[i * 2 + j];
      sink.member('structureWood', [x, head, z], [x + (look() - 0.5) * 0.5, head + 0.4 + look() * 0.7, z + (look() - 0.5) * 0.5], 0.03, 0.03, [0, 0, 1],
        { colour: rgb(0x5e4030), decor: true, exposed: true }, 0);
    }
  });
  return sink.finish();
}

// ------------------------------------------------------------------------------------------------ dispatch

/** The street row's house, by the ground it stands on: the valley's blocks and infill, the slopes' mahala houses. */
const rowhouse: RegionalBuilder = (ctx) => {
  const roll = ctx.rng(), size = ctx.rng();
  const s = slopeOf(ctx) ?? ctx.rng();
  if (roll < s * 0.85) return mahalaHouse(ctx);
  if (roll < s * 0.85 + (1 - s) * 0.3) return yuBlock(ctx, size < 0.55 ? 5 : 6);
  return ahBlock(ctx, s > 0.45 ? 3 : size < 0.55 ? 4 : 5);
};

/** The street row's ruin, by the same ground. */
const ruin: RegionalBuilder = (ctx) => {
  const roll = ctx.rng();
  const s = slopeOf(ctx) ?? ctx.rng();
  if (roll < s) return mahalaShell(ctx);
  if (roll < s + (1 - s) * 0.28) return frameShell(ctx);
  return ahShell(ctx);
};

export const SARAJEVO_BUILDERS: Readonly<Record<string, RegionalBuilder>> = Object.freeze({
  rowhouse,
  ruin,
  ...SARAJEVO_TOWER_BUILDERS,
  ...SARAJEVO_CIVIC_BUILDERS,
});

export const SARAJEVO_STYLE: ArchitectureStyle = Object.freeze<ArchitectureStyle>({
  id: 'sarajevo',
  region: 'Sarajevo under siege (1992-1996): Austro-Hungarian blocks and Yugoslav towers on the valley floor, Ottoman mahala houses on the flanks',
  surfaces: {
    // the Austro-Hungarian plain tiles (Biberschwanz) and the mahalas' dark tile: one red-brown family, darkened per house
    roof: { kind: 'beavertail', tint: [0.44, 0.3, 0.24] },
    // the dressings, the ashlar ground storeys and the mahala's rubble: a warm grey limestone
    stone: { kind: 'limestone', tint: [0.72, 0.68, 0.62] },
    sourced: { plaster: false, wood: true },
    // (the facades lane, round 11; waves 319/320: the walls' procedural canvas read as "speckle", "sponge", "cork",
    // "camouflage noise": its 6 cm bumps shade as dots from the street, as Steinburg's did before round 8) the walls
    // painted as the region renders them (regionalSurfaces.ts paintLimeRender), every family under the kit's and the map's
    // tones; the plaster photo set is off (its 2.4 m tile repeats a lichen motif down every wall)
    render: { kind: 'limeRender', seed: 0x5a12 },
    tones: {
      // the second render: Austro-Hungarian ochre
      plaster2: (_h, s, l) => [0.105, Math.min(1, s * 0.4 + 0.34), Math.min(1, l * 0.82 + 0.06)],
      // the Yugoslav concrete
      plaster3: (_h, s, l) => [0.11, Math.min(1, s * 0.12 + 0.03), Math.min(1, l * 0.78 + 0.04)],
    },
  },
  builders: SARAJEVO_BUILDERS,
  // render in cream, ochre, pale green, pink and grey-blue; the stone pale to sooted; the tiles from fresh red-brown
  // through brown to the dark of the old mahala roofs
  weather: {
    plaster: [[1, 1, 1], [1.0, 0.95, 0.86], [1.02, 0.88, 0.66], [0.88, 0.96, 0.86], [1.0, 0.87, 0.82], [0.9, 0.93, 0.98], [1.0, 0.92, 0.76]],
    stone: [[1, 1, 1], [0.93, 0.92, 0.9], [0.84, 0.83, 0.81], [1.02, 0.99, 0.94]],
    roof: [[1.08, 0.96, 0.9], [1, 1, 1], [0.86, 0.82, 0.8], [0.7, 0.66, 0.66], [0.6, 0.58, 0.6], [0.94, 0.86, 0.8]],
    damp: 0.7, moss: 0.3,
  },
  // the shelling: half the city's houses show it at their windows and roofs
  wear: 0.5,
});
