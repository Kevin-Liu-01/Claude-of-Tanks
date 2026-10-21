// src/world/maps/regional/hessian.ts — the Hessian Fachwerk kit (Frontier Basin: the Fulda Gap's Hünfeld basin,
// eastern Hesse). Two-storey half-timbered houses on red Buntsandstein plinths: oak frames in dark brown, oxblood or
// grey over limewashed infill, the upper storey jettied over the street gable, steep plain-tile (Biberschwanz) roofs,
// often half-hipped (Krüppelwalm), white casements with a cross of glazing bars, sandstone sills and steps. Farmsteads
// pair the house with a stone-and-timber stable wing; barns stand on a sandstone ground storey with a planked gate;
// the village church has a rendered nave and a west tower with a slate-hung belfry and a needle spire; the mills on
// the river are timber-framed water mills with an overshot wheel.
import {
  PartSink, faceBox, facePanel, hashSeed, pick, rgb, shade, UV_MEMBER,
  type Face, type RegionalBucket, type RegionalParts, type Rgb, type Vec3,
} from './geometry.ts';
import {
  buildHouse, emitRoof, holedBox, recordShaft, roofCrown, roofGeometry, storeyFaces, windowRhythm, H,
  type HoleRect, type HouseDialect, type HouseFrame, type HouseSpec, type Opening, type WallRect,
} from './house.ts';
import { bench, flowerBox, roofLadder, tvAerial, wallLantern, woodpile } from './dressing.ts';
import { ruinHouse, type RuinHead } from './ruinGrammar.ts';
import { openShed } from './outbuildings.ts';
import { doorUnit, gateUnit, windowUnit, type WindowStyle } from './openings.ts';
import { launder, millAxle, trestle, waterWheel } from './millWorks.ts';
import { doorCanopy, dressedQuoin, facadeOn, facadeRng, innEmblem, renderedShaft, roofDormers, shopDisplay, shopfrontJoinery, windowHead } from './facade.ts';
import type { ArchitectureStyle, RegionalBuildContext, RegionalBuilder } from './types.ts';

// oak framing: dark brown, oxblood (Ochsenblut), weathered grey, black-brown, ochre-red; sRGB, kept above ~6 % linear
// reflectance so the frame still reads in shade
/**
 * The colours and habits of one Fachwerk region. The Hessian kit and the Eifel kit (eifel.ts) share every builder
 * below and differ here: the framing colours, how often a gable is slate-hung and a ground storey is stone.
 */
export interface FachwerkPalette {
  timbers: readonly Rgb[];
  frame: Rgb;
  doors: readonly Rgb[];
  shutters: readonly Rgb[];
  /** share of houses with shutters */
  shutterShare: number;
  /** share of gables hung with roof slate / tile instead of framed */
  hungGable: number;
  /** share of dwellings on a stone ground storey (besides the stone wall draw) */
  stoneGround: number;
  /** share of half-hipped roofs */
  halfHip: number;
  /** the glazing bars of the windows above the ground storey (a town's upper casements), when they differ */
  upperBars?: WindowStyle['bars'];
}

const HESSIAN_PALETTE: FachwerkPalette = Object.freeze({
  // v1 captures: the pale grey-brown (0x6c625a) read as concrete in sun; oak darkens to brown-black or is painted oxblood
  timbers: [0x5c4434, 0x6e3024, 0x4a3a2f, 0x7a3a28, 0x45362c, 0x56483e].map(rgb),
  frame: rgb(0xcfcabd),
  doors: [0x426b49, 0x7a3024, 0x6a4b33, 0x55687a, 0x8a6338].map(rgb),
  shutters: [0x4a7451, 0x6a4b33, 0x667a86].map(rgb),
  shutterShare: 0.32, hungGable: 0.12, stoneGround: 0, halfHip: 0.45,
});

let palette: FachwerkPalette = HESSIAN_PALETTE;
/** Run a builder under a palette (builders are synchronous: the module-level palette cannot leak). */
export function withPalette(p: FachwerkPalette, builder: RegionalBuilder): RegionalBuilder {
  return (ctx) => {
    const prior = palette;
    palette = p;
    try { return builder(ctx); } finally { palette = prior; }
  };
}
const ZINC = rgb(0x8c9193);
/** (round 10) a dressed surround's stone over the coursed wall's: paler, a little cooler (a multiplier of the stone tint) */
const DRESSING_TINT: Rgb = [1.16, 1.13, 1.08];
const GATE = rgb(0x7a5d44);

interface HessianState {
  rng: () => number;
  timber: Rgb;
  infill: RegionalBucket;
  door: Rgb;
  window: WindowStyle;
  crosses: boolean;
  litShare: number;
  mobile: boolean;
  /** the building's look-only stream (ctx.variant): panel limewash, never the geometry */
  look: () => number;
}

// (the facades lane, round 10; gauntlet wave 301 on Steinburg and Frontier: "framing is thin painted red lines on flat
// infill rather than timbers with depth", "a rigid grid of thin red lines with no timber relief") a member is set 2 cm
// into the wall (PartSink.member's embed), so at 35 mm its face stood 15 mm proud — 3 mm over a panel's wash: the
// timbers now stand 5 cm proud of the daub (an oak frame's face a hand's breadth ahead of an infill weathered back),
// the posts 19 cm and the rails 16 cm wide, as a house's 20-24 cm oak reads once its arrises are worn
const OUT = 0.07, POST = 0.19, RAIL = 0.16;
const SW: RegionalBucket = 'structureWood';

export function stateFor(ctx: RegionalBuildContext, rng: () => number): HessianState {
  // the infill is limewash on daub: the primary render (the map's plaster photo set) under each house's own tint
  // (weather.ts); the v1 captures showed the procedural plaster2/plaster3 canvases reading as grey cobbles in the panels
  const infill: RegionalBucket = 'plaster';
  if (ctx.wallBucket === 'stone') rng(); // the stream keeps the draw the old variant pick took
  const shutters = rng() < palette.shutterShare ? pick(rng, palette.shutters) : null;
  return {
    rng,
    timber: shade(pick(rng, palette.timbers), 0.9 + rng() * 0.2),
    infill,
    door: pick(rng, palette.doors),
    window: {
      frame: palette.frame, frameWidth: 0.065, frameOut: 0.06, bars: rng() < 0.75 ? 'cross' : 'six',
      surround: null, sill: { bucket: 'stone', out: 0.13 },
      shutters: shutters ? { colour: shutters, kind: 'panel' } : null,
    },
    crosses: rng() < 0.55,
    litShare: 0.38,
    mobile: ctx.tier === 'mobile',
    look: ctx.variant,
  };
}

/**
 * One infill panel limewashed at its own time (2026-10-03, after gauntlet wave 0's "one tiled texture"): every panel of a
 * framed wall is daubed and washed on its own, so the panels of an old house differ by a shade, a few freshly whitened,
 * a few gone grey. Half the panels carry their own wash: a decor quad 12 mm proud of the wall (the timbers stand 35 mm
 * proud), inside its timbers, from the look-only stream (the build stream, geometry and collision as before).
 */
function panelWash(sink: PartSink, face: Face, st: HessianState, a: number, b: number, ya: number, yb: number): void {
  const roll = st.look(), k = st.look();
  if (b - a < 0.2 || yb - ya < 0.2) return;
  const washed = roll < 0.5;
  const shadeK = washed ? (k < 0.3 ? 1.06 + k * 0.2 : 0.8 + (k - 0.3) * 0.2) : 1;
  // 12 mm proud: resolved by the depth buffer to ~250 m (3 mm fought the infill from ~150 m)
  const P = (u: number, y: number, o = 0.012) => H.facePoint(face, u, y, o);
  // (round 10) the shadow the rail or plate over the panel throws on it — the frame standing 5 cm proud reads by the
  // shade under its members (the near sun is high: the posts' sides take the shade sideways from the cascades): a band
  // 13 cm deep under the panel's head, darkest against the timber, over the panel's own wash or the bare daub (fine
  // dressing on a bare panel: out of the shadow maps and drawn near the camera; a washed panel's band with its wash)
  const band = Math.min(0.13, (yb - ya) * 0.3), top = yb - 0.01, foot = top - band;
  if (washed) sink.quad(st.infill, P(a + 0.01, ya + 0.01), P(b - 0.01, ya + 0.01), P(b - 0.01, foot), P(a + 0.01, foot), { decor: true, shade: shadeK });
  sink.quad(st.infill, P(a + 0.01, foot, 0.013), P(b - 0.01, foot, 0.013), P(b - 0.01, top, 0.013), P(a + 0.01, top, 0.013), {
    decor: true, ...(washed ? {} : { fine: true }), shadeAt: (p: Vec3) => (p[1] > foot + band * 0.5 ? shadeK * 0.58 : shadeK),
  });
}

/**
 * The joinery of a framed face (the facade craft's round 6; wave 241: "timbers overlap without joints", "no sill plate or
 * pegs"): on a desktop build with the craft each timber takes a shade of its own from the facade stream (hewn, replaced
 * and weathered at its own time), and the oak pegs that lock the rails' and braces' tenons show as dark end-grain heads
 * on the timber they are driven through — near the camera only (EmitOptions.fine 'near'), and only below PEG_TOP, where
 * an eye at the street resolves a 3 cm peg (the kit's triangle budget pays for the street storeys' pegs, not a third
 * storey's). Without the craft every timber keeps the house's colour and no peg is drawn.
 */
const PEG_TOP = 4.2;
function joinery(sink: PartSink, face: Face, timber: Rgb): { tone: () => { colour: Rgb; decor: true }; peg: (u: number, y: number, o?: number) => void } {
  const fr = facadeOn() ? facadeRng() : null;
  const base = { colour: timber, decor: true as const };
  const peg = { colour: shade(timber, 0.55), decor: true, fine: 'near' as const };
  return {
    tone: () => (fr ? { colour: shade(timber, 0.9 + fr() * 0.16), decor: true as const } : base),
    // a peg's head 3 mm proud of the face of the timber it is driven through (a member `o` deep stands o - 0.02 proud)
    peg: (u, y, o = OUT) => { if (fr && y < PEG_TOP) facePanel(sink, SW, face, u, y, o - 0.017, 0.028, 0.028, peg); },
  };
}

/** The framed wall: sill beam, plate, corner and opening posts, rails, braces and the parapet crosses. */
function fachwerkWall(sink: PartSink, face: Face, rect: WallRect, openings: Opening[], st: HessianState): void {
  const { u0, u1, y0, y1 } = rect;
  const tc = { colour: st.timber, decor: true };
  // the sill beam and plate run past the corner posts: their ends show at the corners
  H.rail(sink, SW, face, u0, u1, y0 + 0.09, 0.18, OUT + 0.01, { ...tc, ends: true });
  H.rail(sink, SW, face, u0, u1, y1 - 0.08, 0.16, OUT + 0.01, { ...tc, ends: true });
  if (st.mobile) {
    H.post(sink, SW, face, u0 + 0.1, y0 + 0.18, y1 - 0.16, 0.2, OUT, tc);
    H.post(sink, SW, face, u1 - 0.1, y0 + 0.18, y1 - 0.16, 0.2, OUT, tc);
  }
  // a phone keeps its two corner posts; the framing (its panel washes draw the look stream) it draws as the desktop
  // does and keeps none of it (PartSink.dressing)
  sink.dressing(st.mobile, () => framing(sink, face, rect, openings, st));
}

/** The framed wall's members and panel washes between its sill beam and plate (fachwerkWall on a desktop). */
function framing(sink: PartSink, face: Face, rect: WallRect, openings: Opening[], st: HessianState): void {
  const { u0, u1, y0, y1 } = rect;
  const yA = y0 + 0.18, yB = y1 - 0.16;
  const j = joinery(sink, face, st.timber);
  // a burnt opening's soot climbs the panels round it: a panel wash would paint over it
  const sooty = openings.some((o) => o.state === 'burnt');
  const posts: number[] = [u0 + 0.1, u1 - 0.1];
  for (const o of openings) {
    posts.push(o.u - o.w / 2 - POST / 2, o.u + o.w / 2 + POST / 2);
  }
  posts.sort((a, b) => a - b);
  const merged: number[] = [];
  for (const p of posts) {
    if (merged.length && p - merged[merged.length - 1] < 0.32) { merged[merged.length - 1] = (merged[merged.length - 1] + p) / 2; continue; }
    merged.push(p);
  }
  const inOpening = (a: number, b: number) => openings.find((o) => o.u > a && o.u < b);
  const all: number[] = [];
  for (let i = 0; i < merged.length; i++) {
    all.push(merged[i]);
    const next = merged[i + 1];
    if (next === undefined) break;
    const gap = next - merged[i];
    if (!inOpening(merged[i], next) && gap > 1.45) {
      const n = Math.floor(gap / 1.1);
      for (let k = 1; k < n; k++) all.push(merged[i] + gap * k / n);
    }
  }
  // (round 6) the corner posts are the stouter: every rail and brace stops at the face of the post it is tenoned into
  const width = (i: number) => (i === 0 || i === all.length - 1 ? 0.23 : POST);
  for (let i = 0; i < all.length; i++) {
    H.post(sink, SW, face, all[i], yA, yB, width(i), OUT, j.tone());
  }
  const brust = y0 + Math.min(0.92, (y1 - y0) * 0.36), sturz = y0 + Math.min(2.05, (y1 - y0) * 0.8);
  for (let i = 0; i + 1 < all.length; i++) {
    const a = all[i] + width(i) / 2, b = all[i + 1] - width(i + 1) / 2;
    if (b - a < 0.12) continue;
    // a rail tenoned into the posts either side, a peg through each post's face beside it
    const rail = (y: number) => {
      H.rail(sink, SW, face, a, b, y, RAIL, OUT, j.tone());
      j.peg(a - 0.045, y);
      j.peg(b + 0.045, y);
    };
    const op = inOpening(all[i], all[i + 1]);
    if (op && (op.kind === 'window' || op.kind === 'loft')) {
      const sill = y0 + op.y0, head = sill + op.h;
      rail(sill - 0.16);
      if (head + 0.15 < yB) rail(head + 0.08);
      if (st.crosses && sill - 0.23 - yA > 0.42) {
        // the Andreaskreuz in the parapet panel under the window: one brace whole, the other halved into it, both cut
        // to the panel between the posts, the sill beam and the window's rail
        const top = sill - 0.23, panel = H.panel(a, b, yA, top), [left, right] = H.beside(a, yA, b, top, 0.13);
        H.strut(sink, SW, face, a, yA, b, top, 0.13, OUT, panel, j.tone());
        const half = j.tone();
        H.strut(sink, SW, face, a, top, b, yA, 0.13, OUT, [...panel, left], half);
        H.strut(sink, SW, face, a, top, b, yA, 0.13, OUT, [...panel, right], half);
        for (const u of [a + 0.1, b - 0.1]) { j.peg(u, yA - 0.06, OUT + 0.01); j.peg(u, top + 0.06); }
      }
      continue;
    }
    if (op) {
      const head = y0 + op.y0 + op.h;
      if (head + 0.15 < yB) rail(head + 0.08);
      if (!sooty && head + 0.36 < yB) panelWash(sink, face, st, a, b, head + 0.15, yB);
      continue;
    }
    const cornerBay = i === 0 || i === all.length - 2;
    if (cornerBay && b - a > 0.55) {
      // the corner brace (Strebe) runs from the sill at the corner post to the plate at the next post, its foot and its
      // head cut into the corners of the bay and pegged through the sill and the plate
      const panel = H.panel(a, b, yA, yB), foot = i === 0 ? a : b, head = i === 0 ? b : a, k = i === 0 ? 1 : -1;
      H.strut(sink, SW, face, foot, yA, head, yB, 0.16, OUT, panel, j.tone());
      j.peg(foot + k * 0.12, yA - 0.06, OUT + 0.01);
      j.peg(head - k * 0.12, yB + 0.06, OUT + 0.01);
      continue;
    }
    rail(brust);
    if (sturz + 0.15 < yB) rail(sturz);
    if (!sooty) {
      panelWash(sink, face, st, a, b, yA, brust - 0.07);
      if (sturz + 0.15 < yB) {
        panelWash(sink, face, st, a, b, brust + 0.07, sturz - 0.07);
        panelWash(sink, face, st, a, b, sturz + 0.07, yB);
      } else panelWash(sink, face, st, a, b, brust + 0.07, yB);
    }
  }
}

/**
 * The framed gable: king post, collar, side posts and braces, cut under the roof line. (Round 6, wave 241: "timbers
 * overlap without joints") on a desktop build every member stops at the faces of the members it meets: the posts stand
 * on a gable sill and rise to the collar, the collar is tenoned into the posts, and the braces stand in their own
 * panels — beside the gable windows, never across them.
 */
function fachwerkGable(sink: PartSink, face: Face, poly: Array<[number, number]>, st: HessianState): void {
  const tc = { colour: st.timber, decor: true };
  const base = poly[0][1], s = Math.abs(poly[1][0]);
  const top = Math.max(...poly.map(([, y]) => y));
  const h = top - base;
  if (h < 0.8) return;
  // the half-width of the gable at height y (triangle or trapezoid under the same slopes)
  const apexY = poly.length === 3 ? poly[2][1] : base + (top - base) * s / Math.max(0.01, s - Math.abs(poly[2][0]));
  const halfAt = (y: number) => s * Math.max(0, 1 - (y - base) / Math.max(0.01, apexY - base));
  const collar = base + h * 0.5;
  if (st.mobile) {
    H.post(sink, SW, face, 0, base + 0.06, top - 0.12, POST, OUT, tc);
    H.rail(sink, SW, face, -halfAt(collar) + 0.16, halfAt(collar) - 0.16, collar, 0.14, OUT, tc);
  }
  // a phone keeps the king post and the collar; the rest of the framing and the gable's windows it draws as the desktop
  // does and keeps none of it: the windows take the build stream, and the house's next solids (a hoist dormer, a wing)
  // draw from it after them (PartSink.dressing)
  sink.dressing(st.mobile, () => framedGable(sink, face, st, base, s, top, h, apexY, collar, halfAt));
}

/**
 * The framed gable's two windows (framedGable lays them; the house cuts them first, HouseDialect.gableOpenings): either
 * side of the king post a quarter of the way out, their sills 0.55 m over the gable's sill, on a gable over 2.4 m.
 */
function gableWindowHoles(poly: Array<[number, number]>): HoleRect[] {
  const base = poly[0][1], s = Math.abs(poly[1][0]), top = Math.max(...poly.map(([, y]) => y));
  if (top - base <= 2.4) return [];
  const wy = base + 0.55;
  return [-1, 1].map((side) => ({ u0: side * s * 0.25 - 0.25, u1: side * s * 0.25 + 0.25, y0: wy, y1: wy + 0.62 }));
}

/** The framed gable's members, joints and windows on a desktop (fachwerkGable). */
function framedGable(sink: PartSink, face: Face, st: HessianState, base: number, s: number, top: number, h: number,
  apexY: number, collar: number, halfAt: (y: number) => number): void {
  const j = joinery(sink, face, st.timber);
  // the gable's sill on the storey's plate, a centimetre proud of the posts that stand on it
  const sillTop = base + 0.14;
  H.rail(sink, SW, face, -s + 0.05, s - 0.05, base + 0.07, 0.14, OUT + 0.01, j.tone());
  H.post(sink, SW, face, 0, sillTop, top - 0.12, POST, OUT, j.tone());
  j.peg(0, base + 0.07, OUT + 0.01);
  // the roof line, kept clear by the verge's margin: a member under it is cut along it
  const margin = 0.16, rise = (apexY - base) / s;
  const roofLine = (side: number): readonly [number, number, number] => [side * rise, 1, apexY - margin * Math.hypot(1, rise)];
  const cBot = collar - 0.07, cHalf = halfAt(collar) - margin;
  const windows = h > 2.4;
  // the sides whose post stands under the collar: a gable window there is framed between it and the king post
  const framedSide = new Set<number>();
  for (const side of [-1, 1]) {
    const u = side * s * 0.5;
    // the side post rises from the sill to the collar when the collar reaches over it, else to the roof line
    const underCollar = Math.abs(u) + POST / 2 < cHalf;
    const yTop = underCollar ? cBot : base + (apexY - base) * (1 - Math.abs(u) / s) - 0.22;
    const post = yTop > sillTop + 0.36;
    if (post && underCollar) framedSide.add(side);
    if (post) {
      H.post(sink, SW, face, u, sillTop, yTop, POST, OUT, j.tone());
      j.peg(u, base + 0.07, OUT + 0.01);
    }
    // the collar tenoned into the king post's side and running out to the roof line, the side post pegged up into it
    const inner = POST / 2, outer = cHalf;
    if (outer - inner > 0.12) {
      H.rail(sink, SW, face, side > 0 ? inner : -outer, side > 0 ? outer : -inner, collar, 0.14, OUT, j.tone());
      j.peg(side * (inner - 0.045), collar);
      if (post && underCollar) j.peg(u, collar + 0.035);
    }
    // the braces: under the collar in the panel between the side post and the king post, or, where the gable windows
    // stand there, in the outer panel between the side post and the roof line
    if (post && underCollar && !windows) {
      const lo = Math.abs(u) - POST / 2, panel = side > 0 ? H.panel(inner, lo, sillTop, cBot) : H.panel(-lo, -inner, sillTop, cBot);
      H.strut(sink, SW, face, side * lo, sillTop, side * inner, cBot, 0.14, OUT, panel, j.tone());
      j.peg(side * (lo - 0.1), base + 0.07, OUT + 0.01);
    } else if (post) {
      const lo = Math.abs(u) + POST / 2;
      const keep = [...(side > 0 ? H.panel(lo, s, sillTop, underCollar ? cBot : apexY) : H.panel(-s, -lo, sillTop, underCollar ? cBot : apexY)), roofLine(side)];
      const footU = Math.min(s - 0.3, lo + (s - lo) * 0.78), headY = Math.min(underCollar ? cBot : yTop, sillTop + (footU - lo) * 1.4);
      if (footU - lo > 0.35) {
        H.strut(sink, SW, face, side * footU, sillTop, side * lo, headY, 0.14, OUT, keep, j.tone());
        j.peg(side * (lo + 0.045), headY - 0.1);
      }
    } else if (!windows) {
      // no side post: the brace from the gable's foot to the king post under the collar, cut along the roof line
      const keep = [...(side > 0 ? H.panel(inner, s, sillTop, cBot) : H.panel(-s, -inner, sillTop, cBot)), roofLine(side)];
      H.strut(sink, SW, face, side * s * 0.82, sillTop, side * inner, cBot, 0.14, OUT, keep, j.tone());
    }
  }
  if (windows) {
    for (const side of [-1, 1]) {
      const u = side * s * 0.25, wy = base + 0.55;
      windowUnit(sink, face, u, wy, 0.5, 0.62, { ...st.window, shutters: null, bars: 'cross' }, st.rng, st.litShare * 0.6);
      // (round 6) the window's breast and head rails between the king post and the side post, as the wall's windows
      const lo = s * 0.5 - POST / 2;
      if (framedSide.has(side) && wy + 0.77 < cBot) {
        for (const y of [wy - 0.16, wy + 0.7]) {
          H.rail(sink, SW, face, side > 0 ? POST / 2 : -lo, side > 0 ? lo : -POST / 2, y, 0.14, OUT, j.tone());
          j.peg(side * (POST / 2 - 0.045), y);
          j.peg(side * (lo + 0.045), y);
        }
      }
    }
  }
}

/** the shop paints (facade craft): bottle green, oxblood, navy, umber, cream (sRGB, as the kit's door paints) */
const SHOP_PAINT: readonly Rgb[] = [0x3d5c45, 0x6e2a22, 0x2c3a52, 0x5a4030, 0xd6ccb0].map(rgb);

export function hessianDialect(st: HessianState): HouseDialect {
  return {
    window: (sink, face, o, y0, frame) => {
      // (the facade craft's round 6; wave 241: "flat panes") a town's two-light upper casements take their transom on a
      // desktop build: the cross of an old Kreuzstock window (the transom is fine joinery, near the camera only)
      const upper = palette.upperBars === 'two' && facadeOn() ? 'cross' : palette.upperBars;
      windowUnit(sink, face, o.u, y0 + o.y0, o.w, o.h,
        o.kind === 'loft' ? { ...st.window, shutters: null, bars: 'none' }
          : o.storey > 0 && upper ? { ...st.window, bars: upper } : st.window,
        st.rng, o.kind === 'loft' ? 0 : st.litShare);
      // a sandstone storey's windows carry a dressed lintel over the reveal (facade craft)
      if (facadeOn() && !st.window.surround && frame.spec.storeys[o.storey]?.wall === 'stone') {
        windowHead(sink, face, o.u, y0 + o.y0 + o.h, o.w, { kind: 'lintel', bucket: 'stone', h: 0.2, out: 0.03, ext: 0.1 });
      }
    },
    door: (sink, face, o, y0, frame) => {
      if (o.kind === 'gate') {
        gateUnit(sink, face, o.u, y0 + o.y0, o.w, o.h, GATE, { bucket: 'stone', width: 0.28, out: 0.12 });
        return;
      }
      if (o.kind === 'shopfront') {
        // (wave 199: the shop windows read "opaque grey-beige, boarded-up": glass, never a drawn curtain, in a shop)
        windowUnit(sink, face, o.u, y0 + o.y0 + 0.55, o.w, o.h - 0.55, { ...st.window, bars: 'two', shutters: null,
          surround: { bucket: 'stone', width: 0.2, out: 0.12 } }, st.rng, 0);
        // (facade craft, desktop; wave 116 read "large single-pane plate-glass shopfronts") divided lights, transom
        // lights, a panelled stall riser and a fascia, in a shop paint from the facade stream; the goods in the window
        if (facadeOn()) {
          shopfrontJoinery(sink, face, o.u, y0 + o.y0 + 0.55, o.w, o.h - 0.55, 0.55, -sink.recess, pick(facadeRng(), SHOP_PAINT),
            st.window.frame, 0.2, frame.bodies[o.storey].y1);
          shopDisplay(sink, face, o.u, y0 + o.y0 + 0.55, o.w, o.h - 0.55, -sink.recess);
        }
        return;
      }
      // (round 10; wave 301 on a Steinburg door: "a flat plank panel in a plain rectangular hole with no stone surround,
      // threshold or step": the surround stood in the ashlar's own print and tone) the door's dressed surround paler and
      // cleaner than the coursed wall round it, as a mason's finer-tooled jambs and lintel are
      doorUnit(sink, face, o.u, y0 + o.y0, o.w, o.h, {
        leaf: st.door, frame: { bucket: 'stone', width: 0.2, out: 0.1, ...(facadeOn() ? { tint: DRESSING_TINT } : {}) }, transom: o.h > 2.25,
        steps: { bucket: 'stone' }, leafKind: st.rng() < 0.6 ? 'panel' : 'plank',
      }, frame.floors[o.storey] + o.y0);
    },
    dressWall: (sink, face, rect, openings) => fachwerkWall(sink, face, rect, openings, st),
    dressGable: (sink, face, poly) => fachwerkGable(sink, face, poly, st),
    gableOpenings: (_face, poly, frame) => (frame.spec.gableFramed ? gableWindowHoles(poly) : []),
    dressJetty: (sink, face, u0, u1, y, depth) => {
      if (st.mobile) return;
      for (let u = u0 + 0.35; u < u1 - 0.2; u += 0.62) {
        faceBox(sink, SW, face, u, y - 0.08, (0.06 - depth) / 2, 0.14, 0.16, depth + 0.06, { colour: st.timber, decor: true, uv: UV_MEMBER, fineSides: true });
      }
    },
  };
}

/** The storey stack of a Hessian house. */
export function storeys(st: HessianState, ctx: RegionalBuildContext, count: number, opts: { stoneGround?: boolean; jettyFront?: number; jettySides?: number } = {}) {
  const rng = st.rng;
  const out: HouseSpec['storeys'] = [];
  for (let i = 0; i < count; i++) {
    const ground = i === 0;
    const stone = ground && (opts.stoneGround ?? ctx.wallBucket === 'stone');
    const jf = !ground ? (opts.jettyFront ?? 0.24) : 0, js = !ground ? (opts.jettySides ?? (rng() < 0.5 ? 0.16 : 0)) : 0;
    out.push({
      h: ground ? 2.6 + rng() * 0.25 : 2.42 + rng() * 0.2,
      wall: stone ? 'stone' : st.infill,
      framed: !stone,
      jetty: ground ? undefined : [jf, js, 0, js],
    });
  }
  return out;
}

export function roofFor(rng: () => number, opts: { halfHip?: number; pitch?: [number, number] } = {}): HouseSpec['roof'] {
  const [lo, hi] = opts.pitch ?? [47, 55];
  return {
    kind: rng() < (opts.halfHip ?? 0.45) ? 'halfhip' : 'gable', pitchDeg: lo + rng() * (hi - lo),
    eave: 0.36, verge: 0.24, thickness: 0.17, bucket: 'roof', hipFrac: 0.32 + rng() * 0.12, ridge: 'round',
  };
}

/** Openings of a house body: the street gable (front), the eaves sides and the back. */
function houseOpenings(w: number, d: number, sts: HouseSpec['storeys'], door: { face: Opening['face']; u: number } | null,
  st: HessianState, extra: Opening[] = []): Opening[] {
  const out: Opening[] = [...extra];
  const doorW = 1.0, doorH = 2.12;
  if (door) out.push({ face: door.face, storey: 0, kind: 'door', u: door.u, w: doorW, y0: 0, h: doorH });
  sts.forEach((storey, i) => {
    const ww = i === 0 ? 0.78 : 0.74, wh = i === 0 ? 1.08 : 1.0, sill = i === 0 ? 0.92 : 0.78;
    for (const face of ['front', 'right', 'back', 'left'] as const) {
      const width = face === 'front' || face === 'back' ? w : d;
      const avoid: Array<[number, number]> = out.filter((o) => o.face === face && o.storey === i && o.kind !== 'window')
        .map((o) => [o.u - o.w / 2, o.u + o.w / 2]);
      const spacing = face === 'back' ? 2.3 : 1.75;
      for (const o of windowRhythm(face, i, width, { w: ww, h: Math.min(wh, storey.h - sill - 0.3), sill, spacing, margin: 0.85, avoid })) {
        if (face === 'back' && st.rng() < 0.3) continue;
        out.push(o);
      }
    }
  });
  return out;
}

function chimneyFor(rng: () => number, d: number, bucket: RegionalBucket): HouseSpec['chimneys'] {
  return [{ x: (rng() < 0.5 ? -1 : 1) * 0.42, z: (rng() - 0.5) * d * 0.5, sx: 0.52, sz: 0.62, above: 0.75 + rng() * 0.3, bucket, cap: 'slab' }];
}

export function houseUvOffset(ctx: RegionalBuildContext): [number, number] {
  return [ctx.rng() * 7.31, ctx.rng() * 5.17];
}

/** The Hessian dwelling: cottage, tavern, schoolhouse and shop variants. */
function hessianDwelling(ctx: RegionalBuildContext, opts: { storeys?: number; shop?: boolean; tavern?: boolean; school?: boolean } = {}): RegionalParts {
  const sink = new PartSink(houseUvOffset(ctx));
  const st = stateFor(ctx, ctx.rng);
  const W = Math.max(5.0, ctx.info.w - 0.3), D = Math.max(6.6, ctx.info.d - 0.3);
  const count = opts.storeys ?? 2;
  const stoneGround = opts.tavern || opts.school || st.rng() < palette.stoneGround ? true : undefined;
  const sts = storeys(st, ctx, count, { stoneGround });
  const hung = st.rng() < palette.hungGable;
  const extra: Opening[] = [];
  if (opts.shop) extra.push({ face: 'front', storey: 0, kind: 'shopfront', u: W * 0.16, w: 2.2, y0: 0, h: 2.3 });
  const doorU = opts.shop ? -W * 0.28 : opts.tavern || opts.school ? 0 : (st.rng() < 0.5 ? -1 : 1) * W * 0.22;
  const spec: HouseSpec = {
    w: W, d: D,
    plinth: { h: opts.tavern || opts.school ? 0.75 : 0.5 + st.rng() * 0.25, out: 0.06, bucket: 'stone' },
    storeys: sts,
    roof: roofFor(st.rng, { halfHip: opts.tavern ? 0.8 : palette.halfHip }),
    // a weather gable hung with the roof's own slate or tile, or framed like the walls below
    gableFramed: !hung,
    gableBucket: hung ? 'roof' : st.infill,
    openings: houseOpenings(W, D, sts, { face: 'front', u: doorU }, st, extra),
    chimneys: chimneyFor(st.rng, D, st.rng() < 0.5 ? 'stone' : 'plaster'),
    gutters: st.rng() < 0.7 ? { colour: ZINC } : null,
    verge: { colour: st.timber, bucket: SW },
    rafters: st.mobile ? null : shade(st.timber, 0.92),
  };
  const frame = buildHouse(sink, spec, hessianDialect(st));
  if (opts.tavern) innSign(sink, frame, st);
  if (opts.school) roofTurret(sink, frame, st, 0.3);
  // an inn's and a school's big roof carries a dormer on each eaves slope (facade craft, desktop)
  if ((opts.tavern || opts.school) && facadeOn() && frame.roof.kind !== 'flat' && frame.roof.kind !== 'shed') {
    const f = facadeRng();
    if (f() < 0.7) {
      const top = frame.bodies[frame.bodies.length - 1], z = (f() - 0.5) * frame.roof.halfD * 0.6 + (opts.school ? -frame.roof.halfD * 0.35 : 0);
      sink.placed(0, (top.x0 + top.x1) / 2, 0, (top.z0 + top.z1) / 2, () => roofDormers(sink, frame.roof, [1, -1], [z], {
        kind: f() < 0.5 ? 'gable' : 'shed', wall: st.infill, covering: 'roof',
        window: (face, u, y, w, h) => windowUnit(sink, face, u, y, w, h, { ...st.window, shutters: null, bars: 'cross' }, f, 0.3),
      }));
    }
  }
  dressHessianHouse(sink, frame, st, { aerial: opts.school ? 0.2 : 0.45, boxes: opts.school ? 0.2 : 0.6 });
  return sink.finish();
}

const BLOOMS: readonly Rgb[] = [0xc0242a, 0xd23a5a, 0xc8462e, 0xe0e0d8, 0xb0306a].map(rgb);
const BOX_COLOURS: readonly Rgb[] = [0x4a3a2c, 0x3e5a3a, 0x6a4a30].map(rgb);

/**
 * The lived-in dressing of a Hessian house (dressing.ts): geraniums in window boxes on the street faces, the bench by
 * the front door, a woodpile under the eaves at the back, the chimney sweep's roof ladder, a television aerial on the
 * ridge (1980s). Every choice is drawn before the phones leave the parts out, so both tiers draw alike.
 */
/**
 * `clear`: spans of a face another body stands against (a farmhouse's stable wing): a window there keeps its draws but
 * hangs no flower box, which would stand in that body's wall.
 */
function dressHessianHouse(sink: PartSink, frame: HouseFrame, st: HessianState,
  opts: { aerial?: number; boxes?: number; clear?: ReadonlyArray<{ face: Opening['face']; u0: number; u1: number }> } = {}): void {
  const rng = st.rng;
  const boxes = rng() < (opts.boxes ?? 0.55), bloom = pick(rng, BLOOMS), boxColour = pick(rng, BOX_COLOURS);
  const aerial = rng() < (opts.aerial ?? 0.45), aerialZ = (rng() - 0.5) * frame.roof.halfD;
  const ladder = rng() < 0.4, pile = rng() < 0.45, seat = rng() < 0.6, lantern = rng() < 0.5;
  const picks = frame.spec.openings.map(() => rng());
  // the dressing draws the build stream (flower boxes, the woodpile, the aerial): a phone draws it as the desktop does
  // and keeps none of it (PartSink.dressing)
  sink.dressing(st.mobile, () => houseDressing(sink, frame, st, rng, { boxes, bloom, boxColour, aerial, aerialZ, ladder, pile, seat, lantern, picks, clear: opts.clear ?? [] }));
}

/**
 * The house's lived-in dressing (dressHessianHouse on a desktop): the door canopy, the flower boxes, the bench, the
 * lantern, the woodpile, the roof ladder and the aerial.
 */
function houseDressing(sink: PartSink, frame: HouseFrame, st: HessianState, rng: () => number, c: {
  boxes: boolean; bloom: Rgb; boxColour: Rgb; aerial: boolean; aerialZ: number; ladder: boolean; pile: boolean; seat: boolean;
  lantern: boolean; picks: number[]; clear: ReadonlyArray<{ face: Opening['face']; u0: number; u1: number }>;
}): void {
  const { boxes, bloom, boxColour, aerial, aerialZ, ladder, pile, seat, lantern, picks, clear } = c;
  const spec = frame.spec;
  // (props census r2 sweep, Lane C 2026-10-16: a farmhouse's upper window over its stable wing hung its box into the
  // wing's framed wall, an iron bracket lying flat on its post) a box that would stand in a body built against the face
  // is drawn into a sink that is thrown away: its draws are spent as before, so the stream's later choices never move
  const scratch = new PartSink();
  const boxSink = (o: Opening): PartSink => (clear.some((s) => s.face === o.face && o.u + o.w / 2 + 0.16 > s.u0 && o.u - o.w / 2 - 0.16 < s.u1) ? scratch : sink);
  // the canopy over the front door (facade craft: its own stream, the build stream draws as before)
  if (facadeOn()) {
    const f = facadeRng();
    const front = spec.openings.find((o) => o.kind === 'door' && o.storey === 0 && !o.state);
    if (front && f() < 0.45) {
      doorCanopy(sink, frame.faces[front.face], front.u, frame.floors[0] + front.y0 + front.h + 0.2, front.w,
        { kind: f() < 0.5 ? 'gable' : 'shed', bucket: 'roof', timber: shade(st.timber, 1.1) });
    }
  }
  if (boxes) {
    let placed = 0;
    spec.openings.forEach((o, k) => {
      if (placed >= 8 || o.kind !== 'window' || o.state || o.storey > 1 || (o.face !== 'front' && o.face !== 'right') || picks[k] > 0.7) return;
      const face = storeyFaces(frame, o.storey)[o.face];
      flowerBox(boxSink(o), face, o.u, frame.bodies[o.storey].y0 + o.y0, o.w, boxColour, bloom, rng);
      placed++;
    });
    // (facade craft, desktop; wave 150 named the jettied corner house's flower boxes as what works) the street
    // windows the boxes skipped get theirs too, their blooms drawn from the facade stream
    if (facadeOn()) {
      const f = facadeRng();
      spec.openings.forEach((o, k) => {
        if (placed >= 12 || o.kind !== 'window' || o.state || o.storey > 1 || (o.face !== 'front' && o.face !== 'right') || picks[k] <= 0.7 || picks[k] > 0.94) return;
        const face = storeyFaces(frame, o.storey)[o.face];
        flowerBox(boxSink(o), face, o.u, frame.bodies[o.storey].y0 + o.y0, o.w, boxColour, bloom, f, true);
        placed++;
      });
    }
  }
  const door = spec.openings.find((o) => o.kind === 'door' && o.storey === 0);
  if (seat && door) {
    const face = frame.faces[door.face];
    const side = door.u > 0 ? -1 : 1, u = door.u + side * (door.w / 2 + 1.05);
    if (Math.abs(u) + 0.8 < face.width / 2) bench(sink, face, u, 1.4, shade(st.timber, 1.25));
  }
  if (lantern && door) {
    const face = frame.faces[door.face], u = door.u + (door.u > 0 ? 1 : -1) * (door.w / 2 + 0.38);
    if (Math.abs(u) + 0.3 < face.width / 2) wallLantern(sink, face, u, frame.floors[0] + 2.05);
  }
  if (pile) {
    const face = frame.faces.back;
    const blocked = spec.openings.some((o) => o.face === 'back' && o.storey === 0 && o.kind !== 'window' && o.u < -face.width / 2 + 3.4);
    if (!blocked) woodpile(sink, face, -face.width / 2 + 0.4, Math.min(face.width / 2 - 0.4, -face.width / 2 + 2.9), 1.15, rng);
  }
  const stack = spec.chimneys[0];
  if (ladder && stack) roofLadder(sink, frame, stack.x >= 0 ? 1 : -1, stack.z - 0.7, 0.85, [0.36, 0.3, 0.24]);
  if (aerial) tvAerial(sink, frame, aerialZ, rng);
}

/** A wrought-iron bracket with a hanging inn sign at the street gable. */
function innSign(sink: PartSink, frame: HouseFrame, st: HessianState): void {
  const face = frame.faces.front, y = frame.floors[1] - 0.25 || 2.9;
  const u = face.width / 2 - 0.6;
  faceBox(sink, 'dark', face, u, y, 0.45, 0.06, 0.06, 0.9, { decor: true });
  faceBox(sink, 'dark', face, u, y - 0.25, 0.65, 0.04, 0.5, 0.04, { decor: true });
  faceBox(sink, SW, face, u, y - 0.62, 0.8, 0.06, 0.55, 0.62, { colour: shade(st.door, 1.2), decor: true });
  // (facade craft, desktop) the sign painted: a gilded tankard under its foam in a dark border, on both faces
  if (facadeOn()) innEmblem(sink, face, u, y - 0.62, 0.8, 0.03, 0.62, 0.55);
}

/**
 * A small slate-capped roof turret (Dachreiter) on the ridge: the school and chapel bell. (Props census E7 and E2, lane B
 * 2026-10-14: its bell openings were dark plates on a solid box, and it stood in the air over a fallen roof.) Its foot
 * and head in the infill, between them the bell chamber open on every side: oak corner posts, louvre boards sloping
 * down and out between them, the dark of the chamber behind and its bell; the slate spire and finial over it. It is the
 * roof's crown (house.ts roofCrown): it falls with the roof in its own pieces.
 */
function roofTurret(sink: PartSink, frame: HouseFrame, st: HessianState, zFrac: number): void {
  const rg = frame.roof, z = rg.halfD * zFrac;
  const top = rg.topAt(0, z) ?? rg.ridgeTopY;
  const s = 0.62;
  const low = (rg.topAt(s, z) ?? top) - 0.12;
  const b0 = top + 0.36, b1 = top + 1.2;
  roofCrown(sink, frame, { kind: 'turret', x0: -s * 1.3, x1: s * 1.3, z0: z - s * 1.3, z1: z + s * 1.3, y0: low, y1: top + 3.6, bucket: st.infill }, () => {
    sink.span(st.infill, -s, low, z - s, s, b0, z + s);
    sink.span(st.infill, -s, b1, z - s, s, top + 1.4, z + s);
    const post = { colour: st.timber, uv: UV_MEMBER };
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      sink.span(SW, sx * s - (sx > 0 ? 0.14 : 0), b0, z + sz * s - (sz > 0 ? 0.14 : 0), sx * s + (sx < 0 ? 0.14 : 0), b1, z + sz * s + (sz < 0 ? 0.14 : 0), post);
    }
    sink.span('dark', -s + 0.15, b0, z - s + 0.15, s - 0.15, b1, z + s - 0.15, { decor: true });
    const sides: Face[] = [
      { origin: [0, 0, z + s], u: [1, 0, 0], out: [0, 0, 1], width: 2 * s }, { origin: [s, 0, z], u: [0, 0, -1], out: [1, 0, 0], width: 2 * s },
      { origin: [0, 0, z - s], u: [-1, 0, 0], out: [0, 0, -1], width: 2 * s }, { origin: [-s, 0, z], u: [0, 0, 1], out: [-1, 0, 0], width: 2 * s },
    ];
    const slat = { colour: shade(st.timber, 0.82), decor: true, exposed: true, uv: UV_MEMBER };
    for (const f of sides) {
      const n: Vec3 = [f.out[0] * 0.75, 0.66, f.out[2] * 0.75];
      for (let y = b0 + 0.12; y < b1 - 0.08; y += 0.17) {
        sink.member(SW, H.facePoint(f, -s + 0.14, y, -0.06), H.facePoint(f, s - 0.14, y, -0.06), 0.15, 0.018, n, slat, 0);
      }
    }
    // the bell in the chamber, hung from its yoke
    sink.cylinder('structureMetal', [0, b0 + 0.12, z], 'y', 0.42, 0.24, 10, { colour: [0.42, 0.33, 0.2], decor: true }, 0.12);
    sink.span(SW, -0.3, b0 + 0.54, z - 0.05, 0.3, b0 + 0.62, z + 0.05, { colour: shade(st.timber, 0.8), decor: true });
    sink.cylinder('roof', [0, top + 1.4, z], 'y', 2.2, s * 1.3, 8, {}, 0.04);
    sink.cylinder('dark', [0, top + 3.55, z], 'y', 0.5, 0.025, 4, { decor: true });
  });
}

/** The Hessian farmhouse: the dwelling (door on the -x eaves side) with a stone-and-timber stable wing on +x. */
const farmhouse: RegionalBuilder = (ctx) => {
  const sink = new PartSink(houseUvOffset(ctx));
  const st = stateFor(ctx, ctx.rng);
  const D = Math.max(8.2, ctx.info.d - 0.3);
  const W = Math.min(7.6, Math.max(6.2, D * 0.74));
  const wingL = Math.max(4.2, Math.min(5.8, (ctx.info.w - W) / 1.6));
  const sts = storeys(st, ctx, 2, { jettyFront: 0.2, jettySides: 0 });
  const spec: HouseSpec = {
    w: W, d: D, plinth: { h: 0.62, out: 0.06, bucket: 'stone' }, storeys: sts,
    roof: roofFor(st.rng, { halfHip: 0.55 }), gableFramed: true, gableBucket: st.infill,
    openings: houseOpenings(W, D, sts, { face: 'left', u: D * 0.12 }, st),
    chimneys: chimneyFor(st.rng, D, 'stone'), gutters: { colour: ZINC }, verge: { colour: st.timber, bucket: SW },
    rafters: st.mobile ? null : shade(st.timber, 0.92),
  };
  // the wing's footprint is kept off the dwelling's right face openings
  spec.openings = spec.openings.filter((o) => !(o.face === 'right' && o.storey === 0 && Math.abs(o.u + D * 0.16) < W * 0.4));
  const house = buildHouse(sink, spec, hessianDialect(st));
  // the stable wing (ridge along x): stone ground, framed half storey, its gable toward +x
  const ww = Math.min(W * 0.66, 5.2);
  // (its walls and its roof's eave against the dwelling's right face, whose u runs along -z: no flower box there)
  dressHessianHouse(sink, house, st, { clear: [{ face: 'right', u0: D * 0.16 - ww / 2 - 0.3, u1: D * 0.16 + ww / 2 + 0.3 }] });
  sink.placed(Math.PI / 2, W / 2 + wingL / 2 - 0.2, 0, -D * 0.16, () => {
    const wst: HessianState = { ...st, crosses: false };
    const wing: HouseSpec = {
      w: ww, d: wingL, plinth: { h: 0.3, out: 0.05, bucket: 'stone' },
      storeys: [{ h: 2.5, wall: 'stone' }, { h: 1.1, wall: st.infill, framed: true }],
      roof: { kind: 'gable', pitchDeg: 46, eave: 0.3, verge: 0.2, thickness: 0.16, bucket: 'roof', ridge: 'round' },
      gableFramed: true, gableBucket: st.infill,
      openings: [
        { face: 'front', storey: 0, kind: 'gate', u: 0, w: 2.2, y0: 0, h: 2.25 },
        { face: 'right', storey: 0, kind: 'window', u: 0.6, w: 0.55, y0: 1.5, h: 0.5 },
        { face: 'left', storey: 0, kind: 'window', u: -0.6, w: 0.55, y0: 1.5, h: 0.5 },
      ],
      chimneys: [], gutters: null, verge: { colour: st.timber, bucket: SW },
    };
    buildHouse(sink, wing, hessianDialect(wst));
  });
  return sink.finish();
};

/** The Hessian barn: a sandstone ground storey with the planked gate in the street gable, a framed loft. */
const barn: RegionalBuilder = (ctx) => {
  const sink = new PartSink(houseUvOffset(ctx));
  const st = stateFor(ctx, ctx.rng);
  const W = Math.max(7.0, ctx.info.w - 0.3), D = Math.max(10.4, ctx.info.d - 0.3);
  const spec: HouseSpec = {
    w: W, d: D, plinth: { h: 0.25, out: 0.05, bucket: 'stone' },
    storeys: [{ h: 3.5, wall: 'stone' }, { h: 1.9, wall: st.infill, framed: true, jetty: [0.18, 0, 0, 0] }],
    roof: roofFor(st.rng, { halfHip: 0.3, pitch: [48, 53] }), gableFramed: true, gableBucket: st.infill,
    openings: [
      { face: 'front', storey: 0, kind: 'gate', u: 0, w: 3.1, y0: 0, h: 3.05 },
      { face: 'right', storey: 0, kind: 'door', u: -D * 0.22, w: 1.0, y0: 0, h: 1.95 },
      { face: 'right', storey: 0, kind: 'window', u: D * 0.12, w: 0.6, y0: 2.05, h: 0.6 },
      { face: 'left', storey: 0, kind: 'window', u: -D * 0.18, w: 0.6, y0: 2.05, h: 0.6 },
      { face: 'left', storey: 0, kind: 'window', u: D * 0.2, w: 0.6, y0: 2.05, h: 0.6 },
      { face: 'front', storey: 1, kind: 'loft', u: 0, w: 1.1, y0: 0.35, h: 1.15 },
    ],
    chimneys: [], gutters: st.rng() < 0.5 ? { colour: ZINC } : null, verge: { colour: st.timber, bucket: SW },
  };
  buildHouse(sink, spec, hessianDialect({ ...st, crosses: false, litShare: 0.05 }));
  return sink.finish();
};

/** A small timber-framed granary (Speicher) on a high sandstone plinth, door up a flight of steps. */
const granary: RegionalBuilder = (ctx) => {
  const sink = new PartSink(houseUvOffset(ctx));
  const st = stateFor(ctx, ctx.rng);
  const W = Math.max(3.4, ctx.info.w - 0.6), D = Math.max(4.3, ctx.info.d - 1.6);
  const spec: HouseSpec = {
    w: W, d: D, plinth: { h: 0.95, out: 0.08, bucket: 'stone' },
    storeys: [{ h: 2.35, wall: st.infill, framed: true }],
    roof: roofFor(st.rng, { halfHip: 0.35, pitch: [50, 56] }), gableFramed: true, gableBucket: st.infill,
    openings: [
      { face: 'front', storey: 0, kind: 'door', u: 0, w: 0.9, y0: 0, h: 1.85 },
      { face: 'right', storey: 0, kind: 'loft', u: 0, w: 0.5, y0: 1.2, h: 0.5 },
      { face: 'left', storey: 0, kind: 'loft', u: 0, w: 0.5, y0: 1.2, h: 0.5 },
    ],
    chimneys: [], gutters: null, verge: { colour: st.timber, bucket: SW },
  };
  buildHouse(sink, spec, hessianDialect({ ...st, litShare: 0 }));
  return sink.finish();
};

/**
 * The woodshed (Holzschuppen; the props census #17, 2026-10-15, the judges: "a sandstone sill or pads, a timber frame
 * (sole plate, posts, wall plate, knee braces) as members, and boarding (Bretterschalung) as separate vertical boards
 * with gaps; rafters with tile courses, eave and verge, and a stacked log-end woodpile"): built member by member
 * (outbuildings.ts openShed) on sandstone pads, the oak frame in the house's timber colour, the boards standing with
 * an air gap on three sides, the beaver-tail tiles in courses; open to +x. The Eifel kit builds the same in its palette.
 */
const woodshed: RegionalBuilder = (ctx) => {
  const sink = new PartSink(houseUvOffset(ctx));
  const st = stateFor(ctx, ctx.rng);
  const W = Math.max(3.4, ctx.info.w - 0.3), D = Math.max(4.4, ctx.info.d - 0.3);
  const look = st.look;
  const boards = [shade(st.timber, 1.25), shade(st.timber, 1.4), rgb(0x6a5a4a)];
  openShed(sink, { W, D, hLo: 2.3, pitchDeg: 14, back: true, ends: true, pile: 1.6 + look() * 0.3, block: look() < 0.6, mobile: st.mobile }, {
    timber: st.timber, post: 0.17, pad: { bucket: 'stone', size: 0.36, top: 0.22 },
    cladding: 'gapped', boards, boardW: 0.2, gap: 0.035, trim: shade(st.timber, 0.9),
    covering: 'plaintile', roofBucket: 'roof', eave: 0.35, verge: 0.3,
  }, look);
  return sink.finish();
};

/** A long timber-framed storehouse with a loading platform and canopy on +x (the base depot's footprint). */
const depot: RegionalBuilder = (ctx) => {
  const sink = new PartSink(houseUvOffset(ctx));
  const st = stateFor(ctx, ctx.rng);
  const pw = 2.8;
  const W = Math.max(5.8, Math.min(7.0, ctx.bounds.maxX - ctx.bounds.minX - pw - 1.4));
  const D = Math.max(14, ctx.info.d - 2.6);
  const cx = ctx.bounds.minX + 0.15 + W / 2;
  const sts: HouseSpec['storeys'] = [{ h: 3.4, wall: 'stone' }, { h: 1.6, wall: st.infill, framed: true }];
  const openings: Opening[] = [];
  for (let k = 0, n = Math.max(2, Math.round(D / 4.2)); k < n; k++) {
    const u = -D / 2 + (k + 0.5) * (D / n);
    openings.push(k % 2 === 0
      ? { face: 'right', storey: 0, kind: 'gate', u, w: 2.0, y0: 0.2, h: 2.4 }
      : { face: 'right', storey: 0, kind: 'window', u, w: 0.9, y0: 1.6, h: 0.9 });
  }
  openings.push({ face: 'front', storey: 0, kind: 'gate', u: 0, w: 2.6, y0: 0, h: 2.9 });
  sink.placed(0, cx, 0, 0, () => {
    buildHouse(sink, {
      w: W, d: D, plinth: { h: 0.75, out: 0.05, bucket: 'stone' }, storeys: sts,
      roof: { kind: 'gable', pitchDeg: 42, eave: 0.45, verge: 0.3, thickness: 0.16, bucket: 'roof', ridge: 'round' },
      gableFramed: true, gableBucket: st.infill, openings, chimneys: [], gutters: { colour: ZINC },
      verge: { colour: st.timber, bucket: SW },
    }, hessianDialect({ ...st, crosses: false, litShare: 0.1 }));
  });
  // the loading platform along +x, its canopy posts and the canopy
  const px0 = cx + W / 2;
  sink.span('stone', px0, -0.4, -D / 2 - 0.6, px0 + pw, 0.95, D / 2 + 0.6);
  for (let k = 0, n = Math.max(3, Math.round(D / 4.5)); k <= n; k++) {
    const z = -D / 2 + k * (D / n);
    sink.span(SW, px0 + pw - 0.32, 0.95, z - 0.08, px0 + pw - 0.16, 4.0, z + 0.08, { colour: st.timber });
  }
  const canopy = { kind: 'shed' as const, pitchDeg: 9, eave: 0.25, verge: 0.3, thickness: 0.1, bucket: 'roof' as const };
  // a shed roof rises toward -x: its high side meets the storehouse wall
  sink.placed(0, px0 + pw / 2 + 0.05, 0, 0, () => emitRoof(sink, roofGeometry(pw + 0.3, D + 1.2, 4.0, canopy), canopy));
  return sink.finish();
};

/** A burnt-out Fachwerk house: the sandstone ground storey and a charred frame, the roof gone. */
const ruin: RegionalBuilder = (ctx) => {
  const sink = new PartSink(houseUvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant, mobile = ctx.tier === 'mobile';
  const W = Math.max(5.6, ctx.info.w - 0.3), D = Math.max(7.6, ctx.info.d - 0.3);
  const charred = rgb(0x2b2521), burnt = rgb(0x3d3127);
  // (props census #7, lane B 2026-10-14; the judges: "stone stubs as span boxes with gaps, a box of tiles") the ruin
  // grammar: the sandstone ground storey's own walls broken to heads falling to the breach, its door and windows cut
  // through with their lintels and sills, the joists' stubs, the tiles slid in over the heaps; over it the charred frame
  // of the upper storey: the corner posts standing on the wall heads, a broken plate, studs and rafters fallen in
  const gH = 2.5, t = 0.42;
  const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'door', u: (rng() - 0.5) * (W - 2.6), w: 1.0, y0: 0, h: 2.1 }];
  for (const face of ['right', 'left'] as const) for (const o of windowRhythm(face, 0, D - 2 * t, { w: 0.9, h: 1.1, sill: 0.85, spacing: 2.4, margin: 1.0, max: 3 })) openings.push(o);
  const head = (): RuinHead => ({ a: gH * (0.6 + rng() * 0.45), b: gH * (0.6 + rng() * 0.45), at: 0.15 + rng() * 0.7, dip: 0.25 + rng() * 0.5, ragged: 0.3 });
  const r = ruinHouse(sink, {
    w: W, d: D, t, wall: 'stone', plinth: { h: 0.55, out: 0.06, bucket: 'stone' }, storeys: [gH, 2.6], openings,
    heads: { front: head(), right: head(), back: head(), left: head() }, stub: 0.6,
    lintel: { bucket: SW, colour: charred }, roof: { bucket: 'roof', piece: [0.6, 0.4, 0.03] }, timber: charred, mobile,
  }, rng, look);
  // the charred frame: a corner post on each corner's wall head, the broken plate on the front-left one
  const postTops: number[] = [];
  for (const [sx, sz, name, end] of [[-1, -1, 'back', 1], [1, -1, 'back', 0], [-1, 1, 'front', 0], [1, 1, 'front', 1]] as const) {
    const tp = r.tops[name], foot = end ? tp[tp.length - 1] : tp[0], h = 1.2 + rng() * 2.0;
    sink.span(SW, sx * (W / 2 - t / 2) - 0.1, foot - 0.05, sz * (D / 2 - t / 2) - 0.1, sx * (W / 2 - t / 2) + 0.1, foot + h, sz * (D / 2 - t / 2) + 0.1, { colour: charred });
    postTops.push(foot + h);
  }
  // (the plate rests on its front-left post, no higher than that post's charred head)
  const plateY = postTops[2] - 0.18;
  sink.span(SW, -W / 2 + 0.02, plateY, D / 2 - t / 2 - 0.1, -W / 2 + W * 0.45, plateY + 0.18, D / 2 - t / 2 + 0.1, { colour: charred, decor: true });
  sink.dressing(mobile, () => {
    for (let k = 0; k < 4; k++) {
      const x = (look() - 0.5) * (W - 2 * t - 1.2), z = (look() - 0.5) * (D - 2 * t - 1.2);
      const a: Vec3 = [x - 1.2, r.restOn(x - 1.2, z) - 0.05, z], b: Vec3 = [x + 1.1, r.restOn(x + 1.1, z) + 0.8 + look() * 0.9, z + (look() - 0.5) * 1.0];
      sink.member(SW, a, b, 0.14, 0.16, [0, 0, 1], { colour: k % 2 ? charred : burnt, decor: true, exposed: true });
      // the stud still standing that holds its raised end, from the heap under it
      sink.span(SW, b[0] - 0.08, r.restOn(b[0], b[2]) - 0.05, b[2] - 0.02, b[0] + 0.08, b[1] + 0.02, b[2] + 0.14, { colour: charred, decor: true });
    }
  });
  return sink.finish();
};

/** The village church: rendered nave with sandstone dressings, a west tower, slate-hung belfry and needle spire. */
const church: RegionalBuilder = (ctx) => {
  const sink = new PartSink(houseUvOffset(ctx));
  const st = stateFor(ctx, ctx.rng);
  const naveW = 8.6, naveD = 16, wallH = 6.2;
  const towerS = 4.4, towerH = 15.5;
  const towerZ = naveD / 2 + towerS / 2 - 0.4;
  const naveZ = -1.2;
  sink.placed(0, 0, 0, naveZ, () => {
    const openings: Opening[] = [];
    for (const face of ['right', 'left'] as const) {
      for (const u of [-5.2, -1.7, 1.8, 5.3]) openings.push({ face, storey: 0, kind: 'window', u, w: 1.1, y0: 2.2, h: 2.9 });
    }
    buildHouse(sink, {
      w: naveW, d: naveD, plinth: { h: 0.55, out: 0.1, bucket: 'stone' },
      storeys: [{ h: wallH, wall: 'plaster' }],
      roof: { kind: 'gable', pitchDeg: 52, eave: 0.4, verge: 0.2, thickness: 0.18, bucket: 'roof', ridge: 'round' },
      gableBucket: 'plaster', openings, chimneys: [], gutters: { colour: ZINC }, verge: null,
    }, {
      window: (s, face, o, y0) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, {
        frame: rgb(0x3b3a36), frameWidth: 0.07, frameOut: 0.04, bars: 'six',
        surround: { bucket: 'stone', width: 0.24, out: 0.1, lintel: 0.3 }, sill: { bucket: 'stone', out: 0.16 }, shutters: null,
      }, st.rng, 0.25),
      door: () => {},
    });
    // sandstone quoins at the nave corners (round 10; wave 301: "oversized ... toy blocks": a church's quoins 34 cm
    // courses, long and short stones of 54 and 30 cm)
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      for (let y = 0.6, k = 0; y < wallH + 0.3; y += 0.355, k++) {
        const long = (k + (sx * sz > 0 ? 0 : 1)) % 2 === 0;
        const xIn = long ? 0.54 : 0.3, zIn = long ? 0.3 : 0.54;
        const xa = sx > 0 ? naveW / 2 - xIn : -naveW / 2 - 0.04, xb = sx > 0 ? naveW / 2 + 0.04 : -naveW / 2 + xIn;
        const za = sz > 0 ? naveD / 2 - zIn : -naveD / 2 - 0.04, zb = sz > 0 ? naveD / 2 + 0.04 : -naveD / 2 + zIn;
        dressedQuoin(sink, 'stone', xa, y, za, xb, y + 0.335, zb, sx, sz, { decor: true });
      }
    }
  });
  // the west tower (toward +z, the street front), stone lower stage, slate-hung belfry, octagonal needle spire
  const tz = naveZ + towerZ;
  sink.span('stone', -towerS / 2 - 0.12, -0.5, tz - towerS / 2 - 0.12, towerS / 2 + 0.12, 0.6, tz + towerS / 2 + 0.12);
  // (props census #5, lane B 2026-10-15) the shaft's west door cut through it (its leaf was laid on the solid span), the
  // leaf at the back of the reveal; the tower recorded as a shaft body (it topples in its courses, the spire its crown)
  const dRev = 0.34;
  holedBox(sink, 'stone', -towerS / 2, tz - towerS / 2, towerS / 2, tz + towerS / 2, 0.5, towerH - 3.6, { front: [{ u0: -0.75, u1: 0.75, y0: 0.6, y1: 3.5 }] }, 0.4, dRev);
  recordShaft(sink, 0, tz, towerS, towerH + 9.5, 'stone');
  // (facade craft, desktop; wave 116 read the bare shaft as "a church tower brick scaled several times too large") the
  // shaft rendered like the nave over its rubble, its dressed sandstone corners bare as quoin strips, clear of the door
  if (facadeOn()) renderedShaft(sink, 'plaster', 0, tz, towerS, 0.6, towerH - 3.75, 0.42, [[[-1.14, 1.14, 0.55, 4.1]]]);
  // the belfry stage hung with roof tiles, its two louvred openings a face cut through it (they were dark plates with
  // their slats laid on the hung box): the slats across each opening in its reveal, the belfry's dark behind them
  const hs = towerS / 2 + 0.08, louvre: HoleRect[] = [-0.75, 0.75].map((u) => ({ u0: u - 0.31, u1: u + 0.31, y0: towerH - 2.7, y1: towerH - 1.1 }));
  const bf = holedBox(sink, 'roof', -hs, tz - hs, hs, tz + hs, towerH - 3.6, towerH, { front: louvre, right: louvre, back: louvre, left: louvre }, 0.3, 0.24);
  const front: Face = { origin: [0, 0, tz + towerS / 2], u: [1, 0, 0], out: [0, 0, 1], width: towerS };
  sink.recess = dRev;
  try {
    doorUnit(sink, front, 0, 0.6, 1.5, 2.9, { leaf: rgb(0x4a3020), frame: { bucket: 'stone', width: 0.3, out: 0.16, arch: true },
      steps: { bucket: 'stone' }, leafKind: 'plank' }, 0.6);
  } finally { sink.recess = 0; }
  for (const [face, sgn] of [[0, 1], [0, -1], [1, 1], [1, -1]] as const) {
    const f: Face = face === 0
      ? { origin: [0, 0, tz + sgn * (towerS / 2 + 0.08)], u: [sgn, 0, 0], out: [0, 0, sgn], width: towerS }
      : { origin: [sgn * (towerS / 2 + 0.08), 0, tz], u: [0, 0, -sgn], out: [sgn, 0, 0], width: towerS };
    // belfry louvres (in the openings' reveals) and a clock face
    const bfFace = face === 0 ? (sgn > 0 ? bf.front : bf.back) : (sgn > 0 ? bf.right : bf.left);
    for (const u of [-0.75, 0.75]) {
      for (let k = 0; k < 5; k++) faceBox(sink, SW, bfFace, u, towerH - 2.55 + k * 0.32, -0.1, 0.62, 0.06, 0.06, { colour: rgb(0x403a33), decor: true }, 'ends');
    }
    // the clock and the slit window stand on the shaft below the belfry, whose hung tiles stand 8 cm proud of it: on the
    // shaft's own face (the connectivity sweep: both hung 7-8 cm in front of the stone)
    faceBox(sink, SW, f, 0, towerH - 4.6, -0.045, 1.15, 1.15, 0.05, { colour: rgb(0xd8d2c2), decor: true });
    // (the hand 5 cm wide: at 7 cm it read as a dark plate on the dial)
    faceBox(sink, 'dark', f, 0, towerH - 4.6, -0.01, 0.05, 0.5, 0.02, { decor: true });
    faceBox(sink, 'stone', f, 0, towerH - 6.0, -0.065, 0.3, 0.9, 0.04, { decor: true });
  }
  sink.span('stone', -towerS / 2 - 0.2, towerH - 3.75, tz - towerS / 2 - 0.2, towerS / 2 + 0.2, towerH - 3.55, tz + towerS / 2 + 0.2, { decor: true });
  // spire: eight-sided needle from a square base
  sink.cylinder('roof', [0, towerH, tz], 'y', 9.5, towerS * 0.66, 8, {}, 0.05);
  sink.cylinder('dark', [0, towerH + 9.4, tz], 'y', 1.1, 0.045, 4, { decor: true });
  sink.span('dark', -0.32, towerH + 10.05, tz - 0.035, 0.32, towerH + 10.12, tz + 0.035, { decor: true });
  return sink.finish();
};

/** The chapel: a small rendered nave with a framed gable and a slate roof turret. */
const chapel: RegionalBuilder = (ctx) => {
  const sink = new PartSink(houseUvOffset(ctx));
  const st = stateFor(ctx, ctx.rng);
  const W = Math.max(5.0, ctx.info.w - 0.4), D = Math.max(7.4, ctx.info.d - 0.4);
  const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'door', u: 0, w: 1.15, y0: 0, h: 2.35 }];
  for (const face of ['right', 'left'] as const) for (const u of [-D * 0.22, D * 0.22]) openings.push({ face, storey: 0, kind: 'window', u, w: 0.8, y0: 1.6, h: 1.7 });
  const frame = buildHouse(sink, {
    w: W, d: D, plinth: { h: 0.45, out: 0.08, bucket: 'stone' }, storeys: [{ h: 3.9, wall: 'plaster' }],
    roof: { kind: 'gable', pitchDeg: 54, eave: 0.35, verge: 0.2, thickness: 0.17, bucket: 'roof', ridge: 'round' },
    gableFramed: true, gableBucket: st.infill, openings, chimneys: [], gutters: null, verge: { colour: st.timber, bucket: SW },
  }, {
    ...hessianDialect(st),
    window: (s, face, o, y0) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, {
      frame: rgb(0x3b3a36), frameWidth: 0.06, frameOut: 0.04, bars: 'six',
      surround: { bucket: 'stone', width: 0.2, out: 0.09, lintel: 0.26 }, sill: { bucket: 'stone', out: 0.14 }, shutters: null,
    }, st.rng, 0.2),
  });
  roofTurret(sink, frame, st, 0.55);
  return sink.finish();
};

/**
 * The water mill: a two-storey Fachwerk mill house on a sandstone ground storey, an overshot wheel on its flank. (Props
 * census #22, Lane C 2026-10-16) the water works at the standard (millWorks.ts): the wheel's shrouds, arms, sole and
 * raked buckets on an iron hub, its banded axle into the wall through a hole cut for it; the launder's plank trough on
 * its yokes with its water, borne on a beam from the wall and braced trestles clear of the wheel, its penstock board at
 * the head; the wheel pit in sandstone with the tail water. The wheel, the axle, the launder and the trestles stand in
 * the mill's records where the plot's slack holds them; the pit, its bearing pier and the water are dressing.
 */
const mill: RegionalBuilder = (ctx) => {
  const sink = new PartSink(houseUvOffset(ctx));
  const st = stateFor(ctx, ctx.rng);
  // the mill house fitted to its plot (a 6.4 m plot: its wheel on +x, the launder up to the plot's front edge)
  const W = Math.max(4.6, Math.min(6.0, ctx.info.w - 1.8)), D = Math.max(5.6, Math.min(7.6, ctx.info.d - 0.8));
  const sts: HouseSpec['storeys'] = [{ h: 2.8, wall: 'stone' }, { h: 2.5, wall: st.infill, framed: true, jetty: [0.2, 0, 0, 0] }];
  const R = 2.3, half = 0.5, cxw = W / 2 + 0.78, cy = R - 0.35, plinth = 0.4;
  // the axle's hole in the ground storey's flank (the wheel's side has no other opening there)
  const isHole = (o: Opening): boolean => o.face === 'right' && o.storey === 0 && o.kind === 'loft';
  const openings = houseOpenings(W, D, sts, { face: 'front', u: -1.2 }, st).filter((o) => !(o.face === 'right' && o.storey === 0));
  openings.push({ face: 'right', storey: 0, kind: 'loft', u: 0, w: 0.56, h: 0.56, y0: cy - plinth - 0.28 });
  const dialect = hessianDialect(st);
  buildHouse(sink, {
    w: W, d: D, plinth: { h: plinth, out: 0.06, bucket: 'stone' }, storeys: sts,
    roof: roofFor(st.rng, { halfHip: 0.6 }), gableFramed: true, gableBucket: st.infill,
    openings, chimneys: chimneyFor(st.rng, D, 'stone'), gutters: { colour: ZINC }, verge: { colour: st.timber, bucket: SW },
  }, {
    ...dialect,
    window: (s, face, o, y0, frame) => {
      // the axle's hole: the mill room's dark round the shaft at the back of its reveal
      if (isHole(o)) faceBox(s, 'dark', face, o.u, y0 + o.y0 + o.h / 2, -s.recess + 0.01, o.w, o.h, 0.02, { decor: true });
      else dialect.window(s, face, o, y0, frame);
    },
  });
  const wood = rgb(0x6a5440), wet = shade(wood, 0.72), iron = rgb(0x1e1e1e);
  // the wheel, its axle and the launder are collision-bearing where they stay within the plot's slack
  const solid = cxw + half + 0.22 - ctx.info.w / 2 <= 0.75;
  sink.placed(Math.PI / 2, cxw, cy, 0, () => {
    millAxle(sink, W / 2 - 0.25 - cxw, half + 0.22, wet, iron, [-half - 0.12, half + 0.12], solid);
    waterWheel(sink, { R, half, kind: 'overshot', wood: wet, boards: wood, iron, solid });
  });
  // the pit: its outer wall in sandstone with a coping, the end wall upstream, the tail water; the bearing pier on it
  const px0 = cxw + half + 0.14, px1 = px0 + 0.3, pz = R + 0.5;
  sink.span('stone', px0, -0.6, -pz, px1, 0.35, pz, { decor: true });
  sink.band('stone', px0 - 0.04, 0.35, -pz - 0.04, px1 + 0.04, 0.43, pz + 0.04, { decor: true });
  sink.span('stone', W / 2 + 0.06, -0.6, pz, px1, 0.35, pz + 0.3, { decor: true });
  sink.quad('glass', [W / 2 + 0.06, 0.04, pz], [px0, 0.04, pz], [px0, 0.04, -pz], [W / 2 + 0.06, 0.04, -pz], { decor: true });
  sink.span('stone', px0, 0.43, -0.32, px1 - 0.06, cy - 0.37, 0.32, { decor: true });
  sink.span('structureWood', px0 + 0.02, cy - 0.37, -0.26, px1 - 0.1, cy - 0.17, 0.26, { colour: wet, decor: true });
  // the launder from over the wheel's crown to the plot's front edge, closed at its far end
  const lf = cy + R + 0.3, lw = 0.7;
  const flumeEnd = Math.min(D / 2 + 3.4, Math.max(D / 2 + 0.4, ctx.info.d / 2 - 0.1));
  launder(sink, { x: cxw, y: lf, z0: -0.35, z1: flumeEnd, width: lw, sides: 0.34, wood, solid, water: 0.22 });
  sink.span('structureWood', cxw - lw / 2, lf, flumeEnd - 0.06, cxw + lw / 2, lf + 0.34, flumeEnd, { colour: wood, decor: true });
  // the penstock board at the head, raised in its cleats on an iron rod with a cross handle
  sink.span('structureWood', cxw - lw / 2, lf + 0.1, -0.12, cxw + lw / 2, lf + 0.5, -0.08, { colour: wet, decor: true });
  sink.span('structureMetal', cxw - 0.015, lf + 0.5, -0.115, cxw + 0.015, lf + 1.05, -0.085, { colour: iron, decor: true });
  sink.span('structureMetal', cxw - 0.16, lf + 1.02, -0.115, cxw + 0.16, lf + 1.05, -0.085, { colour: iron, decor: true, fine: true });
  // its bearers: a beam from the house wall under the trough over the wheel, braced trestles beyond the wheel's rim
  const under = lf - 0.06 - 0.12;
  sink.span(SW, W / 2 - 0.1, under - 0.16, 0.92, cxw + lw / 2 + 0.12, under, 1.08, { colour: shade(wood, 0.9), ...(solid ? {} : { decor: true }) });
  const t0 = R + 0.45, t1 = flumeEnd - 0.3;
  for (const z of t1 - t0 > 1.0 ? [t0, t1] : [Math.max(t0, t1)]) trestle(sink, cxw, z, 0.33, -0.3, under, wood, solid);
  return sink.finish();
};

/** The Fachwerk builders, by plan structure id, unbound: a kit binds them to its palette (withPalette). */
const FACHWERK_BUILDERS: Readonly<Record<string, RegionalBuilder>> = Object.freeze({
  cottage: (ctx) => hessianDwelling(ctx),
  tavern: (ctx) => hessianDwelling(ctx, { storeys: 3, tavern: true }),
  schoolhouse: (ctx) => hessianDwelling(ctx, { school: true }),
  cornershop: (ctx) => hessianDwelling(ctx, { shop: true }),
  rangerlodge: (ctx) => hessianDwelling(ctx, { school: false, tavern: false }),
  farmhouse, barn, granary, woodshed, depot, ruin, church, chapel, mill,
});

export function bindFachwerk(p: FachwerkPalette, ids: readonly string[]): Record<string, RegionalBuilder> {
  return Object.fromEntries(ids.map((id) => [id, withPalette(p, FACHWERK_BUILDERS[id])]));
}

/** The Hessian kit's builders, by plan structure id. */
const HESSIAN_BUILDERS: Readonly<Record<string, RegionalBuilder>> = Object.freeze(bindFachwerk(HESSIAN_PALETTE,
  ['cottage', 'tavern', 'schoolhouse', 'cornershop', 'farmhouse', 'barn', 'granary', 'woodshed', 'depot', 'ruin', 'church', 'chapel', 'mill']));

export const HESSIAN_STYLE: ArchitectureStyle = Object.freeze<ArchitectureStyle>({
  id: 'hessian',
  region: 'Osthessen (Fulda Gap, Hünfeld basin): Fachwerk villages on Buntsandstein',
  surfaces: {
    roof: { kind: 'beavertail', tint: [0.50, 0.25, 0.17] },
    // (the facades lane, round 10; wave 301 on the Frontier church: "oversized, saturated red-brick quoins and door
    // surround that read as toy blocks against plain render") the Buntsandstein a third less saturated, at the same
    // light: the weathered red-brown of an old church's dressings, not a fresh-cut red
    stone: { kind: 'sandstone', tint: [0.52, 0.39, 0.34] },
    sourced: { plaster: true, wood: true },
  },
  builders: HESSIAN_BUILDERS,
  // the churchyard on the church's freest side but its front, walled in stone, its graves in place of the yards' beds
  // (yards.ts; a map opts in: props `churchyard: true`; the facades lane, 2026-10-06)
  churchyard: { kinds: ['church'], fence: 'wallstone', gate: 'gatestone', shed: null, garden: false, graves: true, keepFront: true },
  // limewash from white to pale ochre, plain tiles from new red to old brown, a wet upland climate
  weather: {
    plaster: [[1, 1, 1], [1, 0.97, 0.9], [1, 0.94, 0.84], [0.97, 0.96, 0.93], [1, 0.93, 0.89]],
    stone: [[1, 1, 1], [0.92, 0.9, 0.88], [1.04, 0.98, 0.94]],
    roof: [[1, 1, 1], [0.86, 0.8, 0.74], [0.78, 0.74, 0.7], [1.05, 0.98, 0.95], [0.92, 0.86, 0.82]],
    damp: 0.85, moss: 0.55,
  },
  wear: 0.22,
  // the farmyards: a picket fence round a kitchen garden and the woodshed, a gate to the lane (yards.ts)
  yard: { kinds: ['cottage', 'farmhouse'], fence: 'fencepicket', gate: 'gatepicket', shed: 'woodshed', shedSize: [4.2, 5.1], garden: true },
});

export { hashSeed };
