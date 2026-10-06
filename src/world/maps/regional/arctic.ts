// src/world/maps/regional/arctic.ts — the arctic kit (Whiteout Station: DYE-M, the Distant Early Warning Line's eastern
// main station at Cape Dyer, Baffin Island, in the 1980s, as the North Warning System replaced the line; map-revival
// lane 2, 2026-10-05). Nothing stands on the permafrost: the station's buildings are prefabricated insulated modules raised on
// steel piles so their heat cannot thaw the ground, joined end to end in the module train under the white radome;
// the tropospheric-scatter antennas stand beside it, great curved billboards on lattice frames facing the next station
// over the horizon; a radar on a lattice tower under its own small radome; the steel vehicle garages and the warehouse,
// insulated sheds with their overhead doors; the arched Jamesway huts of the construction camps; the plywood utility
// sheds on skids; a module stripped and left to the wind.
import {
  LocalFrame, PartSink, faceBox, facePoint, rgb, shade,
  type Face, type Rgb, type Vec3,
} from './geometry.ts';
import { buildHouse, windowRhythm, type HouseDialect, type HouseFrame, type Opening, type RoofSpec } from './house.ts';
import { doorUnit, windowUnit, type WindowStyle } from './openings.ts';
import type { ArchitectureStyle, RegionalBuildContext, RegionalBuilder } from './types.ts';

const STEEL = rgb(0x5d6266), STEEL_DARK = rgb(0x34383b), WHITE = rgb(0xe8e9e6), ORANGE = rgb(0xc4602b), BLUE = rgb(0x6f8796);
const OLIVE = rgb(0x5a5a3e), PLY = rgb(0xa58a60), RADOME = rgb(0xf0f0ec);
/** The renders of the kit (its tones): white panels, safety orange, a pale blue-grey. */
type Paint = 'plaster' | 'plaster2' | 'plaster3';
const PAINT_RGB: Readonly<Record<Paint, Rgb>> = { plaster: WHITE, plaster2: ORANGE, plaster3: BLUE };

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
/** The base geometry's measured box less the kit's own overhang (the coordinator's rule: fill the base's bounds). */
function wallsIn(ctx: RegionalBuildContext, ex: number, ez: number): { cx: number; cz: number; w: number; d: number } {
  const b = ctx.bounds;
  return { cx: (b.minX + b.maxX) / 2, cz: (b.minZ + b.maxZ) / 2, w: b.maxX - b.minX - 2 * ex, d: b.maxZ - b.minZ - 2 * ez };
}
const uvOffset = (ctx: RegionalBuildContext): [number, number] => [ctx.rng() * 7.31, ctx.rng() * 5.17];
/** A look-only choice from the building's own identity, drawn from a fork of its variant stream's seed. */
const hashPlot = (ctx: RegionalBuildContext): number => { const v = ctx.variant; const a = v(), b = v(); return (a + b * 0.5) % 1; };

const WINDOW: WindowStyle = {
  frame: STEEL_DARK, frameWidth: 0.06, frameOut: 0.03, bars: 'none',
  surround: { bucket: 'structureMetal', width: 0.08, out: 0.03, colour: STEEL },
  sill: { bucket: 'structureMetal', out: 0.06, colour: STEEL }, shutters: null,
};

/**
 * An insulated sectional overhead door (round 2, gauntlet wave 112b: "a door of vertical boards ... a plastered barn rather
 * than a steel-panel garage with a sectional overhead door"): the steel frame, the leaf of five horizontal sections in the
 * wall's paint, the joints between them, a row of small panes in the second section from the top, the bottom seal.
 */
function overheadDoor(sink: PartSink, face: Face, u: number, y: number, w: number, h: number, paint: Paint): void {
  const steel = { colour: STEEL, decor: true } as const;
  faceBox(sink, 'structureMetal', face, u - w / 2 - 0.07, y + h / 2, 0.04, 0.14, h + 0.1, 0.08, steel);
  faceBox(sink, 'structureMetal', face, u + w / 2 + 0.07, y + h / 2, 0.04, 0.14, h + 0.1, 0.08, steel);
  faceBox(sink, 'structureMetal', face, u, y + h + 0.07, 0.04, w + 0.28, 0.14, 0.08, steel, 'ends');
  const leaf = shade(PAINT_RGB[paint], 0.9);
  faceBox(sink, 'structureMetal', face, u, y + h / 2, -0.02, w, h, 0.04, { colour: leaf, decor: true });
  for (let k = 1; k < 5; k++) faceBox(sink, 'structureMetal', face, u, y + h * k / 5, 0.0, w, 0.035, 0.02, { colour: STEEL_DARK, decor: true, fine: true }, 'ends');
  for (let k = 0; k < 4; k++) faceBox(sink, 'dark', face, u - w * 0.375 + k * w * 0.25, y + h * 0.7, 0.002, w * 0.16, h * 0.08, 0.01, { decor: true });
  faceBox(sink, 'structureMetal', face, u, y + 0.03, 0.01, w, 0.06, 0.03, { colour: STEEL_DARK, decor: true }, 'ends');
}

/**
 * The snow banked against a building that stands on the ground (round 2, wave 112b: "set straight onto a featureless snow
 * plane with no piles, drifts, contact shadows"): a bank along each ground-storey wall, deeper on the windward side,
 * running past the corners and cut away before every door and gate (the ploughed way in). Dressing.
 */
function drifts(sink: PartSink, frame: HouseFrame, openings: readonly Opening[], look: () => number): void {
  const foot = -0.3;
  for (const name of ['front', 'back', 'left', 'right'] as const) {
    const face = frame.faces[name], half = face.width / 2;
    const out = 0.8 + look() * 0.5;
    const cuts = openings.filter((o) => o.face === name && o.storey === 0 && (o.kind === 'door' || o.kind === 'gate'))
      .map((o) => [o.u - o.w / 2 - 0.8, o.u + o.w / 2 + 0.8] as const).sort((a, b) => a[0] - b[0]);
    let u = -half - out * 0.8;
    const runs: Array<[number, number]> = [];
    for (const [c0, c1] of cuts) { if (c0 > u) runs.push([u, c0]); u = Math.max(u, c1); }
    if (half + out * 0.8 > u) runs.push([u, half + out * 0.8]);
    for (const [u0, u1] of runs) {
      if (u1 - u0 < 0.8) continue;
      const h0 = 0.35 + look() * 0.45, h1 = 0.35 + look() * 0.45;
      const a = facePoint(face, u0, h0, 0.01), b = facePoint(face, u1, h1, 0.01);
      const c = facePoint(face, u1, foot, out), d = facePoint(face, u0, foot, out);
      sink.polygon('plaster', [a, d, c, b], { decor: true });
      sink.polygon('plaster', [a, facePoint(face, u0, foot, 0.01), d], { decor: true });
      sink.polygon('plaster', [b, c, facePoint(face, u1, foot, 0.01)], { decor: true });
    }
  }
}

function dialect(rng: () => number, paint: Paint): HouseDialect {
  return {
    window: (sink, face, o, y0) => windowUnit(sink, face, o.u, y0 + o.y0, o.w, o.h, WINDOW, rng, 0.5),
    door: (sink, face, o, y0, frame) => {
      if (o.kind === 'gate') {
        overheadDoor(sink, face, o.u, y0 + o.y0, o.w, o.h, paint);
        return;
      }
      doorUnit(sink, face, o.u, y0 + o.y0, o.w, o.h, {
        leaf: STEEL, frame: { bucket: 'structureMetal', width: 0.1, out: 0.04, colour: STEEL_DARK },
        steps: o.storey === 0 ? { bucket: 'stone' } : null, leafKind: 'panel', transom: false,
      }, frame.floors[o.storey] + o.y0);
    },
  };
}

/** A face of an axis-aligned box: `side` 'n' (-z), 's' (+z), 'e' (+x), 'w' (-x). */
function boxFace(x0: number, z0: number, x1: number, z1: number, side: 'n' | 's' | 'e' | 'w'): Face {
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  if (side === 's') return { origin: [cx, 0, z1], u: [1, 0, 0], out: [0, 0, 1], width: x1 - x0 };
  if (side === 'n') return { origin: [cx, 0, z0], u: [-1, 0, 0], out: [0, 0, -1], width: x1 - x0 };
  if (side === 'e') return { origin: [x1, 0, cz], u: [0, 0, -1], out: [1, 0, 0], width: z1 - z0 };
  return { origin: [x0, 0, cz], u: [0, 0, 1], out: [-1, 0, 0], width: z1 - z0 };
}

/**
 * A module on its piles: the steel columns and the beams under its edges, the insulated box with its panel seams and
 * the coloured fascia band, a flat roof; `floor` is the height of its underside above the ground.
 */
function module(sink: PartSink, x0: number, z0: number, x1: number, z1: number, floor: number, h: number, paint: Paint,
  band: Paint, mobile: boolean, piles = true): void {
  if (piles) {
    const stepZ = Math.max(2.4, (z1 - z0 - 0.4) / Math.max(1, Math.round((z1 - z0 - 0.4) / 3)));
    for (const x of [x0 + 0.25, x1 - 0.25]) {
      for (let z = z0 + 0.2; z <= z1 - 0.19; z += stepZ) sink.span('structureMetal', x - 0.13, -0.4, z - 0.13, x + 0.13, floor - 0.28, z + 0.13, { colour: STEEL_DARK });
      sink.span('structureMetal', x - 0.16, floor - 0.3, z0, x + 0.16, floor, z1, { colour: STEEL });
    }
  }
  sink.span(paint, x0, floor, z0, x1, floor + h, z1);
  sink.span(band, x0 - 0.03, floor + h - 0.5, z0 - 0.03, x1 + 0.03, floor + h - 0.1, z1 + 0.03);
  sink.span('roof', x0 - 0.12, floor + h, z0 - 0.12, x1 + 0.12, floor + h + 0.22, z1 + 0.12);
  if (mobile) return;
  // the panel seams down every face
  const seam = { colour: shade(PAINT_RGB[paint], 0.8), decor: true, fine: true } as const;
  for (const side of ['n', 's', 'e', 'w'] as const) {
    const f = boxFace(x0, z0, x1, z1, side);
    for (let u = -f.width / 2 + 1.2; u < f.width / 2 - 0.3; u += 1.2) faceBox(sink, 'structureMetal', f, u, floor + (h - 0.5) / 2, 0.01, 0.04, h - 0.55, 0.02, seam, 'caps');
  }
}

/** A steel stair up to a module's door: the landing on its post and the flight down to the ground along the face. */
function stair(sink: PartSink, face: Face, u: number, floor: number, mobile: boolean): void {
  const c = { colour: STEEL } as const;
  const land = facePoint(face, u, floor - 0.1, 0.75);
  sink.box('structureMetal', land, [0.8, 0.06, 0.75], c, new LocalFrame(face.u, [0, 1, 0], face.out, land));
  const post = facePoint(face, u, (floor - 0.4) / 2 - 0.2, 1.35);
  sink.box('structureMetal', post, [0.07, (floor + 0.2) / 2, 0.07], c, new LocalFrame(face.u, [0, 1, 0], face.out, post));
  const n = Math.max(2, Math.round(floor / 0.2));
  for (let k = 1; k < n; k++) {
    const p = facePoint(face, u + 0.8 + k * 0.26, floor - 0.1 - k * (floor / n), 0.75);
    sink.box('structureMetal', p, [0.13, 0.03, 0.55], c, new LocalFrame(face.u, [0, 1, 0], face.out, p));
  }
  if (!mobile) {
    const top = facePoint(face, u + 0.8, floor + 0.85, 1.45), foot = facePoint(face, u + 0.8 + n * 0.26, 0.85, 1.45);
    sink.member('structureMetal', top, foot, 0.05, 0.05, face.out, { colour: STEEL_DARK, decor: true, exposed: true });
  }
}

/** A small window and a steel door on a module face (no hole: the module's insulated box carries them). */
function moduleWindow(sink: PartSink, face: Face, u: number, y: number, rng: () => number): void {
  windowUnit(sink, face, u, y, 0.9, 0.7, WINDOW, rng, 0.5);
}
function moduleDoor(sink: PartSink, face: Face, u: number, y: number): void {
  faceBox(sink, 'structureMetal', face, u, y + 1.05, 0.04, 1.0, 2.1, 0.06, { colour: STEEL, decor: true });
  faceBox(sink, 'structureMetal', face, u, y + 1.05, 0.02, 1.16, 2.24, 0.04, { colour: STEEL_DARK, decor: true });
}

/** A white sphere of stacked frustums (the radome) on its ring beam, `y` the ring beam's top. */
function radome(sink: PartSink, cx: number, y: number, cz: number, r: number, segments: number): void {
  sink.cylinder('structureMetal', [cx, y - 0.4, cz], 'y', 0.4, r * 0.82, segments, { colour: STEEL });
  const rings = 7;
  // from the ring beam (a little under the equator: the dome is three-quarters of a sphere) to the top
  const a0 = -0.55;
  for (let k = 0; k < rings; k++) {
    const t0 = a0 + (Math.PI / 2 - a0) * k / rings, t1 = a0 + (Math.PI / 2 - a0) * (k + 1) / rings;
    const y0 = y + r * (Math.sin(t0) - Math.sin(a0)), y1 = y + r * (Math.sin(t1) - Math.sin(a0));
    sink.cylinder('plaster', [cx, y0, cz], 'y', y1 - y0, r * Math.cos(t0), segments, { colour: RADOME }, Math.max(0.02, r * Math.cos(t1)), k === 0);
  }
}

// ------------------------------------------------------------------------------------------------ the station

/**
 * The module train (the office's plot): two rows of insulated modules on steel piles, side by side and joined by a
 * covered link, the upper control level over one end, steel stairs to the doors, small windows; on most plots the
 * radar's white radome on its ring beam over the upper level, the roof's vents and the whip antennas.
 */
const moduleTrain: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant, mobile = ctx.tier === 'mobile';
  const fit = wallsIn(ctx, 0.15, 0.15);
  const W = clamp(fit.w, 8, 16), D = clamp(fit.d, 9, 18);
  const paint: Paint = look() < 0.75 ? 'plaster' : 'plaster3', band: Paint = look() < 0.6 ? 'plaster2' : 'plaster3';
  sink.placed(0, fit.cx, 0, fit.cz, () => {
    const floor = 1.25, h = 3.0, gap = 1.2, mw = (W - gap) / 2;
    const ax0 = -W / 2, ax1 = -W / 2 + mw, bx0 = W / 2 - mw, bx1 = W / 2;
    // the rows stop short of the plot's +z edge: the stairs to their doors stand in front of them
    module(sink, ax0, -D / 2, ax1, D / 2 - 1.6, floor, h, paint, band, mobile);
    module(sink, bx0, -D / 2, bx1, D / 2 - 2.4, floor, h, paint, band, mobile);
    // the covered link between the rows
    module(sink, ax1 - 0.05, -1.4, bx0 + 0.05, 1.4, floor, h - 0.4, paint, band, mobile, false);
    // the upper control level over the north end of the second row, and the radome over it
    const uz0 = -D / 2 + 0.4, uz1 = uz0 + Math.min(7, D * 0.45);
    module(sink, bx0 + 0.3, uz0, bx1 - 0.3, uz1, floor + h + 0.22, 2.7, paint, band, mobile, false);
    const top = floor + h + 0.22 + 2.7 + 0.22;
    if (look() < 0.7) radome(sink, (bx0 + bx1) / 2, top + 0.4, (uz0 + uz1) / 2, clamp(mw * 0.62, 2.6, 4.6), 16);
    else for (const s of [-1, 1]) sink.member('structureMetal', [(bx0 + bx1) / 2 + s * 1.2, top, (uz0 + uz1) / 2], [(bx0 + bx1) / 2 + s * 1.2, top + 5.5, (uz0 + uz1) / 2], 0.08, 0.08, [0, 0, 1], { colour: STEEL_DARK, decor: true, exposed: true });
    // the doors at the rows' ends with their stairs, windows down the long faces
    const sa = boxFace(ax0, -D / 2, ax1, D / 2 - 1.6, 's'), sb = boxFace(bx0, -D / 2, bx1, D / 2 - 2.4, 's');
    for (const f of [sa, sb]) { moduleDoor(sink, f, -f.width * 0.18, floor); stair(sink, f, -f.width * 0.18, floor, mobile); }
    for (const f of [boxFace(ax0, -D / 2, ax1, D / 2 - 1.6, 'w'), boxFace(bx0, -D / 2, bx1, D / 2 - 2.4, 'e')]) {
      for (let u = -f.width / 2 + 1.6; u < f.width / 2 - 1.2; u += 2.6) moduleWindow(sink, f, u, floor + 1.25, rng);
    }
    // the roof's vents and stacks
    if (!mobile) {
      for (let k = 0; k < 3; k++) {
        const z = -D / 2 + 2 + k * (D - 4) / 2;
        sink.span('structureMetal', ax0 + mw * 0.3, floor + h + 0.22, z - 0.35, ax0 + mw * 0.3 + 0.7, floor + h + 0.9, z + 0.35, { colour: STEEL, decor: true });
      }
      sink.cylinder('structureMetal', [ax1 - 0.8, floor + h + 0.22, D / 2 - 2.8], 'y', 2.2, 0.16, 8, { colour: STEEL_DARK, decor: true });
    }
  });
  return sink.finish();
};

/**
 * The tropospheric-scatter antennas (the fire station's plot): two curved billboard reflectors side by side on their
 * lattice back frames, facing the next station over the horizon (+z), their feed horns on stands before them, and the
 * transmitter module on its piles at the plot's front.
 */
const tropo: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, mobile = ctx.tier === 'mobile';
  const bb = ctx.bounds;
  const W = bb.maxX - bb.minX - 0.3, cx = (bb.minX + bb.maxX) / 2;
  const z0 = bb.minZ + 0.2, z1 = bb.maxZ - 0.2;
  const H = clamp(bb.maxY + 1.5, 12, 16), bw = (W - 0.6) / 2;
  const back = z0 + 2.6;
  for (const s of [-1, 1]) {
    const bx = cx + s * (bw / 2 + 0.3);
    // the reflector: vertical slats on a parabolic-cylinder curve, concave to +z — deep enough to read as the dish it is
    // (round 2, wave 112b: "flat white slabs standing in for the curved tropo-scatter reflectors": the sag was 0.9 m)
    // (the slats are solid: their count is the same on every tier, so the collision is)
    const n = 13, SAG = 2.4;
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n - 0.5, x = bx + t * bw, sag = 4 * SAG * t * t;
      const ang = Math.atan(8 * SAG * t / bw);
      const c: Vec3 = [x, H / 2 + 0.6, back + sag];
      const f = new LocalFrame([Math.cos(ang), 0, Math.sin(ang)], [0, 1, 0], [-Math.sin(ang), 0, Math.cos(ang)], c);
      sink.box('plaster', c, [bw / n / 2 + 0.02, H / 2 - 0.6, 0.05], { colour: WHITE }, f);
    }
    // the back frame: legs, struts down to the ground behind, the braces
    for (const t of [-0.45, 0, 0.45]) {
      const x = bx + t * bw;
      sink.member('structureMetal', [x, -0.3, back + 4 * SAG * t * t - 0.15], [x, H + 0.2, back + 4 * SAG * t * t - 0.15], 0.25, 0.25, [0, 0, 1], { colour: STEEL, exposed: true });
      sink.member('structureMetal', [x, -0.3, z0], [x, H * 0.75, back + 4 * SAG * t * t - 0.3], 0.18, 0.18, [1, 0, 0], { colour: STEEL, exposed: true });
    }
    // the reflector's stiffeners: horizontal ribs following its curve on the back, every three metres (dressing)
    for (let y = 2.0; y < H - 0.5; y += 3.0) {
      for (let k = 0; k + 1 < n; k++) {
        const ta = (k + 0.5) / n - 0.5, tb = (k + 1.5) / n - 0.5;
        sink.member('structureMetal', [bx + ta * bw, y, back + 4 * SAG * ta * ta - 0.1], [bx + tb * bw, y, back + 4 * SAG * tb * tb - 0.1], 0.07, 0.12, [0, 1, 0],
          { colour: STEEL_DARK, decor: true, exposed: true });
      }
    }
    if (!mobile) for (let y = 1.5; y < H; y += 2.6) sink.member('structureMetal', [bx - bw * 0.45, y, back - 0.3], [bx + bw * 0.45, y + 1.3, back - 0.3], 0.08, 0.08, [0, 0, 1], { colour: STEEL_DARK, decor: true, exposed: true });
    // the feed horn on its stand before the reflector's focus
    const fz = back + 4.2;
    sink.span('structureMetal', bx - 0.15, -0.3, fz - 0.15, bx + 0.15, H * 0.42, fz + 0.15, { colour: STEEL });
    // its mouth toward the reflector
    sink.cylinder('structureMetal', [bx, H * 0.42, fz - 1.1], 'z', 1.1, 0.6, 8, { colour: STEEL_DARK }, 0.25);
  }
  // the transmitter module at the front on its piles, its door and stair
  const mz1 = z1 - 1.6, mz0 = Math.max(back + 5.2, mz1 - 3.2);
  module(sink, cx - W / 2 + 0.6, mz0, cx + W / 2 - 0.6, mz1, 1.1, 2.8, 'plaster', 'plaster2', mobile);
  const mf = boxFace(cx - W / 2 + 0.6, mz0, cx + W / 2 - 0.6, mz1, 's');
  moduleDoor(sink, mf, mf.width * 0.25, 1.1);
  stair(sink, mf, mf.width * 0.25, 1.1, mobile);
  moduleWindow(sink, mf, -mf.width * 0.2, 2.3, rng);
  return sink.finish();
};

/**
 * The radar tower (the water tower's plot): a four-legged lattice tower tapering to a railed platform under the short
 * range radar's radome, the cable ladder up one leg, the equipment hut at its foot.
 */
const radarTower: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const mobile = ctx.tier === 'mobile';
  const fit = wallsIn(ctx, 0.1, 0.1);
  const B = Math.min(fit.w, fit.d) / 2 - 0.15, T = Math.max(1.0, B * 0.42), H = clamp(ctx.bounds.maxY - 1.8, 9, 13);
  sink.placed(0, fit.cx, 0, fit.cz, () => {
    const leg = (sx: number, sz: number, y: number): Vec3 => { const k = y / H, r = B + (T - B) * k; return [sx * r, y, sz * r]; };
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      sink.member('structureMetal', leg(sx, sz, -0.3), leg(sx, sz, H), 0.2, 0.2, [sx, 0, 0], { colour: STEEL, exposed: true });
      sink.span('stone', sx * B - 0.45, -0.4, sz * B - 0.45, sx * B + 0.45, 0.25, sz * B + 0.45);
    }
    // the braces: an X in each face, panel by panel
    const panels = 4;
    for (let k = 0; k < panels; k++) {
      const ya = H * k / panels, yb = H * (k + 1) / panels;
      for (const [s1, s2, t1, t2] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]] as const) {
        // the face's outward normal: a face along x keeps its z sign, a face along z its x sign
        const out: Vec3 = s2 === t2 ? [0, 0, s2] : [s1, 0, 0];
        const opts = { colour: STEEL_DARK, exposed: true } as const;
        sink.member('structureMetal', leg(s1, s2, ya), leg(t1, t2, yb), 0.09, 0.09, out, opts);
        sink.member('structureMetal', leg(t1, t2, ya), leg(s1, s2, yb), 0.09, 0.09, out, opts);
      }
    }
    // the platform, its rail, and the radome on it
    sink.span('structureMetal', -T - 0.5, H, -T - 0.5, T + 0.5, H + 0.18, T + 0.5, { colour: STEEL });
    if (!mobile) for (const [a, b] of [[[-1, -1], [1, -1]], [[1, -1], [1, 1]], [[1, 1], [-1, 1]], [[-1, 1], [-1, -1]]] as const) {
      const r = T + 0.45;
      sink.member('structureMetal', [a[0] * r, H + 1.0, a[1] * r], [b[0] * r, H + 1.0, b[1] * r], 0.05, 0.05, [0, 1, 0], { colour: STEEL_DARK, decor: true, exposed: true });
    }
    radome(sink, 0, H + 0.6, 0, clamp(T + 0.4, 1.4, 2.4), 14);
    // the equipment hut at the foot between two legs
    sink.span('plaster2', -1.1, 0, -B + 0.1, 1.1, 2.4, -B + 1.7);
    sink.span('roof', -1.2, 2.4, -B, 1.2, 2.55, -B + 1.8);
  });
  return sink.finish();
};

/**
 * The vehicle garage (the depot's plot, its doors to +x): a long insulated steel shed under a low gable of ribbed
 * sheet, three overhead doors on the apron side, the man door and a few small windows, the concrete apron before it.
 */
const garage: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant;
  const bb = ctx.bounds;
  const apron = clamp((bb.maxX - bb.minX) * 0.24, 2.2, 3.2);
  const W = clamp(bb.maxX - bb.minX - apron - 0.6, 7, 12), D = clamp(bb.maxZ - bb.minZ - 0.6, 12, 24);
  const paint: Paint = look() < 0.6 ? 'plaster2' : look() < 0.5 ? 'plaster3' : 'plaster';
  sink.placed(0, bb.minX + 0.3 + W / 2, 0, (bb.minZ + bb.maxZ) / 2, () => {
    const n = Math.max(2, Math.min(4, Math.round(D / 6)));
    const openings: Opening[] = [];
    for (let k = 0; k < n; k++) openings.push({ face: 'right', storey: 0, kind: 'gate', u: -D / 2 + D * (k + 0.5) / n, w: 3.6, y0: 0, h: 3.8 });
    openings.push({ face: 'front', storey: 0, kind: 'door', u: -W * 0.25, w: 1.0, y0: 0, h: 2.1 });
    for (const o of windowRhythm('left', 0, D, { w: 1.0, h: 0.7, sill: 2.4, spacing: 3.2, margin: 1.6, max: 6 })) openings.push(o);
    for (const o of windowRhythm('front', 0, W, { w: 1.0, h: 0.7, sill: 2.4, spacing: 2.4, margin: W * 0.45, max: 1 })) openings.push(o);
    const roof: RoofSpec = { kind: 'gable', pitchDeg: 10, eave: 0.35, verge: 0.3, thickness: 0.14, bucket: 'roof', ridge: 'saddle' };
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: 0.3, out: 0.05, bucket: 'stone' }, storeys: [{ h: 4.6, wall: paint }], roof, gableBucket: paint, openings,
      chimneys: [{ x: -W * 0.25, z: -D * 0.3, sx: 0.4, sz: 0.4, above: 1.4, bucket: 'stone', cap: 'none' }],
      gutters: null, verge: null, reveal: 0.08, spall: null,
    }, dialect(rng, paint));
    drifts(sink, frame, openings, look);
    // the apron along the doors
    sink.span('stone', W / 2, -0.3, -D / 2, W / 2 + apron, 0.08, D / 2);
  });
  return sink.finish();
};

/**
 * The fuel tank farm (on some of the depots' plots): two vertical tanks of white steel under shallow cones inside the
 * gravel berm that would hold a spill, their ladders and the walkway between their tops, the pump house in a corner and
 * the pipe run from the tanks to it.
 */
const tankFarm: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const mobile = ctx.tier === 'mobile';
  const bb = ctx.bounds;
  const x0 = bb.minX + 0.15, x1 = bb.maxX - 0.15, z0 = bb.minZ + 0.15, z1 = bb.maxZ - 0.15;
  const t = 1.2, bh = 1.1;
  // the berm: four gravel banks round the plot
  sink.span('stone', x0, -0.3, z0, x1, bh, z0 + t);
  sink.span('stone', x0, -0.3, z1 - t, x1, bh, z1);
  sink.span('stone', x0, -0.3, z0 + t, x0 + t, bh, z1 - t);
  sink.span('stone', x1 - t, -0.3, z0 + t, x1, bh, z1 - t);
  const iw = x1 - x0 - 2 * t, id = z1 - z0 - 2 * t, cx = (x0 + x1) / 2;
  const R = clamp(Math.min(iw / 2 - 0.5, id / 4 - 0.6), 2.2, 4.4), H = 6.2;
  const zs = [z0 + t + 0.5 + R, z1 - t - 0.5 - R];
  for (const tz of zs) {
    sink.cylinder('plaster', [cx, -0.2, tz], 'y', H + 0.2, R, 16, {});
    sink.cylinder('roof', [cx, H, tz], 'y', 0.9, R + 0.08, 16, {}, 0.35);
    // the ladder up the side to the roof and the walkway rail
    if (!mobile) {
      for (const s of [-1, 1]) sink.span('structureMetal', cx + R + 0.05, 0.2, tz + s * 0.25 - 0.03, cx + R + 0.11, H + 0.6, tz + s * 0.25 + 0.03, { colour: STEEL_DARK, decor: true });
      for (let y = 0.5; y < H; y += 0.4) sink.span('structureMetal', cx + R + 0.05, y, tz - 0.25, cx + R + 0.11, y + 0.04, tz + 0.25, { colour: STEEL_DARK, decor: true, fine: true });
    }
  }
  // the walkway between the tops
  if (!mobile) sink.span('structureMetal', cx - 0.5, H + 0.3, zs[0], cx + 0.5, H + 0.42, zs[1], { colour: STEEL, decor: true });
  // the pump house in a corner inside the berm, the pipe run along the tanks to it
  const px0 = x1 - t - 2.4, pz0 = (zs[0] + zs[1]) / 2 - 1.3;
  sink.span('plaster2', px0, 0, pz0, x1 - t - 0.1, 2.5, pz0 + 2.6);
  sink.span('roof', px0 - 0.1, 2.5, pz0 - 0.1, x1 - t, 2.65, pz0 + 2.7);
  if (!mobile) sink.cylinder('structureMetal', [px0 - 0.2, 0.6, zs[0]], 'z', zs[1] - zs[0], 0.14, 8, { colour: STEEL, decor: true });
  return sink.finish();
};

/**
 * The warehouse (the warehouse's plot): a big insulated steel building under a low ribbed gable, the rolling door and
 * the man door in its front gable to the apron, a row of small windows high in its long sides.
 */
const warehouse: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant;
  const bb = ctx.bounds;
  const apron = clamp((bb.maxZ - bb.minZ) * 0.1, 2.0, 3.0);
  const W = clamp(bb.maxX - bb.minX - 0.7, 10, 18), D = clamp(bb.maxZ - bb.minZ - apron - 0.6, 14, 28);
  const paint: Paint = look() < 0.55 ? 'plaster3' : 'plaster';
  sink.placed(0, (bb.minX + bb.maxX) / 2, 0, bb.minZ + 0.3 + D / 2, () => {
    const openings: Opening[] = [
      { face: 'front', storey: 0, kind: 'gate', u: -W * 0.12, w: Math.min(5.0, W * 0.36), y0: 0, h: 4.6 },
      { face: 'front', storey: 0, kind: 'door', u: W * 0.3, w: 1.0, y0: 0, h: 2.1 },
      { face: 'back', storey: 0, kind: 'gate', u: 0, w: 3.6, y0: 0, h: 3.6 },
    ];
    for (const face of ['right', 'left'] as const) for (const o of windowRhythm(face, 0, D, { w: 1.2, h: 0.6, sill: 4.4, spacing: 3.6, margin: 2.0, max: 7 })) openings.push(o);
    const roof: RoofSpec = { kind: 'gable', pitchDeg: 9, eave: 0.35, verge: 0.3, thickness: 0.14, bucket: 'roof', ridge: 'saddle' };
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: 0.35, out: 0.05, bucket: 'stone' }, storeys: [{ h: 6.4, wall: paint }], roof, gableBucket: paint, openings,
      chimneys: [], gutters: null, verge: null, reveal: 0.08, spall: null,
    }, dialect(rng, paint));
    drifts(sink, frame, openings, look);
    sink.span('stone', -W / 2, -0.3, D / 2, W / 2, 0.08, D / 2 + apron);
    // the band of the station's colour round the eaves
    sink.span('plaster2', -W / 2 - 0.03, 5.85, -D / 2 - 0.03, W / 2 + 0.03, 6.35, D / 2 + 0.03);
  });
  return sink.finish();
};

/**
 * The Jamesway hut (the container row's plot): an arched hut of insulated canvas over a timber floor on sleepers, its
 * plywood end walls with the door and a small window, the vestibule at its entrance and the boardwalk along its side.
 */
const jamesway: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, mobile = ctx.tier === 'mobile';
  const bb = ctx.bounds;
  const walk = clamp((bb.maxZ - bb.minZ) * 0.22, 1.2, 2.0);
  const x0 = bb.minX + 0.15, x1 = bb.maxX - 0.15, z0 = bb.minZ + 0.15, zH = bb.maxZ - 0.15 - walk;
  const r = (zH - z0) / 2, zc = (z0 + zH) / 2, fl = 0.5, vest = clamp((x1 - x0) * 0.12, 1.6, 2.4);
  // the floor platform on its sleepers
  sink.span('wood', x0, -0.3, z0, x1, fl, zH);
  // the arch from the vestibule to the far end, the end wall at the far end
  // the canvas over the ribs: olive drab (in the vertex-coloured timber bucket: the sheet roof takes no colour)
  sink.cylinder('structureWood', [x0, fl, zc], 'x', x1 - x0 - vest, r, 10, { colour: OLIVE }, r, false, -Math.PI / 2, Math.PI);
  const endW: Face = { origin: [x0, 0, zc], u: [0, 0, 1], out: [-1, 0, 0], width: 2 * r };
  const pts: Array<[number, number]> = [];
  for (let k = 0; k <= 10; k++) { const a = Math.PI * k / 10; pts.push([-Math.cos(a) * r, fl + Math.sin(a) * r]); }
  sink.prism('wood', pts.map(([u, y]): Vec3 => [x0 + 0.06, y, zc + u]), [1, 0, 0], 0.05);
  // the vestibule: a plywood box at the entrance end with its door and a window
  const vx0 = x1 - vest;
  sink.span('plaster2', vx0, fl, zc - r * 0.62, x1, fl + r * 0.95, zc + r * 0.62);
  sink.span('roof', vx0 - 0.1, fl + r * 0.95, zc - r * 0.62 - 0.1, x1 + 0.1, fl + r * 0.95 + 0.12, zc + r * 0.62 + 0.1, { colour: OLIVE });
  const vf: Face = { origin: [x1, 0, zc], u: [0, 0, -1], out: [1, 0, 0], width: r * 1.24 };
  faceBox(sink, 'structureMetal', vf, 0, fl + 1.0, 0.04, 0.9, 2.0, 0.06, { colour: shade(PLY, 0.7), decor: true });
  // the arch's ribs and the window in the far end
  if (!mobile) {
    for (let x = x0 + 1.2; x < vx0 - 0.3; x += 1.2) sink.cylinder('structureWood', [x, fl, zc], 'x', 0.08, r + 0.03, 12, { colour: shade(OLIVE, 0.75), decor: true }, r + 0.03, false, -Math.PI / 2, Math.PI);
    windowUnit(sink, endW, 0, fl + r * 0.35, 0.7, 0.6, WINDOW, rng, 0.4);
  }
  // the boardwalk along its side
  sink.span('wood', x0, -0.3, zH, x1, fl - 0.15, bb.maxZ - 0.15);
  return sink.finish();
};

/**
 * A module stripped and left to the wind (the ruin's plot): the piles and the floor frame standing, a wall of panels and
 * its door frame, the others down in the snow, the roof gone.
 */
const derelict: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const look = ctx.variant;
  const fit = wallsIn(ctx, 0.1, 0.1);
  const W = fit.w, D = fit.d, floor = 1.1;
  sink.placed(0, fit.cx, 0, fit.cz, () => {
    for (const x of [-W / 2 + 0.25, W / 2 - 0.25]) {
      for (let z = -D / 2 + 0.2; z <= D / 2 - 0.19; z += (D - 0.4) / Math.max(1, Math.round((D - 0.4) / 2.6))) {
        sink.span('structureMetal', x - 0.13, -0.4, z - 0.13, x + 0.13, floor - 0.28, z + 0.13, { colour: STEEL_DARK });
      }
      sink.span('structureMetal', x - 0.16, floor - 0.3, -D / 2, x + 0.16, floor, D / 2, { colour: STEEL });
    }
    sink.span('wood', -W / 2, floor, -D / 2, W / 2, floor + 0.2, D / 2);
    // one long wall still standing to half its height, its door frame, a few panels on end
    sink.span('plaster3', -W / 2, floor + 0.2, -D / 2, -W / 2 + 0.15, floor + 1.6 + look() * 0.8, D / 2 - 1.2);
    for (const s of [-1, 1]) sink.span('structureMetal', -W / 2 + 0.15 + 0.6 * (s + 1), floor + 0.2, -D / 2, -W / 2 + 0.27 + 0.6 * (s + 1), floor + 2.3, -D / 2 + 0.12, { colour: STEEL });
    for (let k = 0; k < 3; k++) {
      const x = -W / 4 + k * W * 0.25, z = D / 2 - 0.6 - look() * 0.4;
      sink.span('plaster3', x - 0.6, -0.1, z - 0.06, x + 0.6, 0.04, z + 1.1);
    }
  });
  return sink.finish();
};

/**
 * The utility shed (the woodshed's plot, its door to +x): a plywood hut on runners so it can be towed, painted, a small
 * window, a vent stack, the fuel drums beside it.
 */
const shed: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant, mobile = ctx.tier === 'mobile';
  const fit = wallsIn(ctx, 0.15, 0.15);
  const W = Math.max(2.4, fit.w), D = Math.max(2.4, fit.d), paint: Paint = look() < 0.6 ? 'plaster2' : 'plaster';
  sink.placed(0, fit.cx, 0, fit.cz, () => {
    for (const z of [-D / 2 + 0.3, D / 2 - 0.3]) sink.span('wood', -W / 2, -0.2, z - 0.12, W / 2, 0.25, z + 0.12);
    const w = W - 0.9;
    sink.span(paint, -W / 2, 0.25, -D / 2, -W / 2 + w, 2.6, D / 2);
    sink.span('roof', -W / 2 - 0.15, 2.6, -D / 2 - 0.15, -W / 2 + w + 0.15, 2.78, D / 2 + 0.15);
    const f = boxFace(-W / 2, -D / 2, -W / 2 + w, D / 2, 'e');
    faceBox(sink, 'structureMetal', f, -D * 0.15, 1.3, 0.03, 0.85, 1.95, 0.05, { colour: shade(PLY, 0.75), decor: true });
    windowUnit(sink, f, D * 0.25, 1.45, 0.6, 0.55, WINDOW, rng, 0.5);
    if (!mobile) sink.cylinder('structureMetal', [-W / 2 + w * 0.3, 2.78, D * 0.2], 'y', 0.9, 0.1, 8, { colour: STEEL_DARK, decor: true });
    // the fuel drums on the open side
    for (let k = 0; k < 2; k++) sink.cylinder('structureMetal', [W / 2 - 0.4, 0, -D / 2 + 0.5 + k * 0.62], 'y', 0.88, 0.29, 10, { colour: k ? shade(ORANGE, 0.8) : STEEL_DARK });
  });
  return sink.finish();
};

export const ARCTIC_BUILDERS: Readonly<Record<string, RegionalBuilder>> = Object.freeze({
  foundryoffice: moduleTrain,
  firestation: tropo,
  watertower: radarTower,
  // a depot's plot is the vehicle garage, or on some (one in three) the fuel tank farm in its berm
  depot: (ctx) => (hashPlot(ctx) < 0.34 ? tankFarm(ctx) : garage(ctx)),
  warehouse,
  containerRow: jamesway,
  ruin: derelict,
  woodshed: shed,
});

export const ARCTIC_STYLE: ArchitectureStyle = Object.freeze<ArchitectureStyle>({
  id: 'arctic',
  region: 'Cape Dyer, Baffin Island, 1980s: DYE-M, a DEW Line main station on its plateau above Davis Strait (module train, radome, tropo-scatter billboards, Jamesways, steel garages)',
  surfaces: {
    // ribbed sheet steel
    roof: { kind: 'sheet', tint: [0.72, 0.74, 0.76] },
    // the concrete of the aprons and the footings
    stone: { kind: 'block', tint: [0.66, 0.66, 0.65] },
    sourced: { plaster: false, wood: true },
    tones: {
      // the insulated panels, white
      plaster: (_h, s, l) => [0.12, Math.min(1, s * 0.06), Math.min(1, l * 0.22 + 0.72)],
      // safety orange, sun-faded
      plaster2: (_h, s, l) => [0.055, Math.min(1, 0.6 + s * 0.2), Math.min(1, l * 0.3 + 0.36)],
      // a pale blue-grey
      plaster3: (_h, s, l) => [0.56, Math.min(1, 0.1 + s * 0.1), Math.min(1, l * 0.3 + 0.44)],
    },
    // round 2 (the render canvas read as stucco on the station's steel: the warehouse walls "popcorn" at 10 m): the
    // painted panels nearly smooth, the canvas's grain a faint skin (surfaces.relief)
    relief: { plasterUv: 2.6, normal: 0.14, ao: 0.3 },
  },
  builders: ARCTIC_BUILDERS,
  // painted steel under the wind and the cold: little damp, no moss, the rust at the feet
  weather: {
    plaster: [[1, 1, 1], [0.98, 0.98, 0.97], [0.96, 0.97, 0.98]],
    stone: [[1, 1, 1], [0.96, 0.96, 0.95], [0.92, 0.92, 0.92]],
    roof: [[1, 1, 1], [0.94, 0.94, 0.95], [0.88, 0.86, 0.84]],
    damp: 0.25, moss: 0,
  },
  wear: 0.1,
});
