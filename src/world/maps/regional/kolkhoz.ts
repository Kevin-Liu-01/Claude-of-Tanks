// src/world/maps/regional/kolkhoz.ts — the kolkhoz kit (Verdant Fields: the Prokhorovka farmland, Belgorod oblast).
// The south-Russian black-earth village: whitewashed khatas (clay-rendered timber or adobe) under thick hipped thatch
// or later asbestos-cement sheet, window frames and plank shutters painted blue or green, a brick plinth; the
// collective farm's long cowsheds (korovniki) of red or whitewashed brick under corrugated asbestos sheet with ridge
// vents; plank granaries (ambary) raised on stones under a projecting gable; a wooden post mill; a whitewashed
// Orthodox church with green onion domes; and, after the fighting, burnt khatas of which only the stove and its
// chimney stand.
import {
  PartSink, faceBox, facePoint, normalize3, pick, rgb, shade,
  type Face, type RegionalBucket, type RegionalParts, type Rgb, type Vec3,
} from './geometry.ts';
import { bulb } from './domes.ts';
import {
  buildHouse, emitRoof, holedBox, leanTo, recordShaft, roofCrown, roofGeometry, windowRhythm, type HoleRect, type HouseDialect, type HouseFrame, type Opening,
  type RoofRelief, type RoofSpec,
} from './house.ts';
import { openBelfry } from './sarajevoParts.ts';
import { doorUnit, gateUnit, windowUnit, type WindowStyle } from './openings.ts';
import { bench, hollyhocks, mound } from './dressing.ts';
import { dentilCornice, facadeOn, facadeRng, faceSlab, paintSurround, pilaster, plinthPaint, ridgeRiders, trimRing, trimRun, windowHead } from './facade.ts';
import type { ArchitectureStyle, RegionalBuildContext, RegionalBuilder, SurfaceTone } from './types.ts';
import { orientedPrism } from './millWorks.ts';
import { buildPostMill } from './windmills.ts';
import { logWork } from './goral.ts';

const PAINTS: readonly Rgb[] = [0x4a7aa8, 0x5a8fb8, 0x4f8a5a, 0x3f6f8f, 0x6b8a4a].map(rgb);
const WHITE_FRAME = rgb(0xd0ccc0);
const PLANK = rgb(0x7a6048);
const GREEN_ROOF = rgb(0x4f7d5a), DOME_GREEN = rgb(0x3f7a52), GILT = rgb(0xb8933e);

interface KolkhozState {
  rng: () => number;
  paint: Rgb;
  window: WindowStyle;
  litShare: number;
}

function stateFor(ctx: RegionalBuildContext): KolkhozState {
  const rng = ctx.rng;
  const paint = pick(rng, PAINTS);
  return {
    rng, paint,
    window: {
      frame: rng() < 0.6 ? paint : WHITE_FRAME, frameWidth: 0.07, frameOut: 0.05, bars: rng() < 0.7 ? 'cross' : 'six',
      // the carved surround (nalichnik), painted: a board frame with a peaked head
      surround: { bucket: 'structureWood', width: 0.12, out: 0.04, lintel: 0.2, colour: rng() < 0.5 ? WHITE_FRAME : paint },
      sill: { bucket: 'structureWood', out: 0.08, colour: paint },
      shutters: rng() < 0.7 ? { colour: shade(paint, 0.9), kind: 'plank', closed: 0.1 } : null,
    },
    litShare: 0.45,
  };
}

function dialect(st: KolkhozState): HouseDialect {
  return {
    window: (sink, face, o, y0) => windowUnit(sink, face, o.u, y0 + o.y0, o.w, o.h,
      o.kind === 'loft' ? { ...st.window, shutters: null, bars: 'none', surround: null } : st.window, st.rng, o.kind === 'loft' ? 0 : st.litShare),
    door: (sink, face, o, y0, frame) => {
      if (o.kind === 'gate') {
        gateUnit(sink, face, o.u, y0 + o.y0, o.w, o.h, PLANK, { bucket: 'structureWood', width: 0.16, out: 0.06, colour: shade(PLANK, 0.8) });
        return;
      }
      doorUnit(sink, face, o.u, y0 + o.y0, o.w, o.h, {
        leaf: st.rng() < 0.5 ? st.paint : PLANK, frame: { bucket: 'structureWood', width: 0.12, out: 0.05, colour: WHITE_FRAME },
        steps: { bucket: 'stone' }, leafKind: 'plank',
      }, frame.floors[o.storey] + o.y0);
    },
  };
}

function uvOffset(ctx: RegionalBuildContext): [number, number] {
  return [ctx.rng() * 7.31, ctx.rng() * 5.17];
}

const thatch = (pitch: number): RoofSpec => ({ kind: 'hip', pitchDeg: pitch, eave: 0.5, verge: 0.5, thickness: 0.34, bucket: 'straw', ridge: 'round' });
const shifer = (pitch: number, kind: RoofSpec['kind'] = 'gable'): RoofSpec => ({ kind, pitchDeg: pitch, eave: 0.35, verge: 0.3, thickness: 0.1, bucket: 'roof', ridge: 'saddle' });
/**
 * (dome-detail-275) The shared roof relief (house.ts RoofSpec.relief) over the roofs shiferSheets never laid: the asbestos
 * sheets in the club's measure (1.13 m wide in courses 1.5 m up the slope, lapped), on the cowshed, the granary and the
 * club's pediment; the church's painted roofing iron in its seamed sheets (a sheet of iron 0.6 m by 1.4 m).
 */
const SHIFER: RoofRelief = { kind: 'sheet', gauge: 1.5, pitch: 1.13, ribs: 0 };
const ROOF_IRON: RoofRelief = { kind: 'sheet', gauge: 1.4, pitch: 0.6, ribs: 0, budget: 520 };

/** The khata: whitewashed walls on a brick plinth, painted joinery, a hipped thatch. */
function khata(ctx: RegionalBuildContext, opts: { long?: boolean } = {}): RegionalParts {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx);
  // a long khata (dwelling and byre under one roof) on a wide plot lies along it, built a quarter turn round with its
  // side door and porch on the plot's +z side and a gable to each end: the plot's body is kept, not shrunk to a cottage
  // across it
  const turned = !!opts.long && ctx.info.w > ctx.info.d + 1;
  const pw = turned ? ctx.info.d : ctx.info.w, pd = turned ? ctx.info.w : ctx.info.d;
  // (turned, the porch on the door side stays inside the plot)
  const W = Math.max(4.8, Math.min(turned ? 6.6 : 6.2, pw - (turned ? 2.4 : 0.6))), D = Math.max(7.0, Math.min(opts.long ? (turned ? 15.4 : 12) : 10, pd - 0.4));
  if (turned) sink.placed(Math.PI / 2, 0, 0, 0, () => khataBody(sink, ctx, st, W, D));
  else khataBody(sink, ctx, st, W, D);
  return sink.finish();
}

/** Clay under the whitewash: what a khata's worn render shows (a tint on the render, facade craft). */
// (2026-10-09, the Verdant gate: the release's clay; wave 199 had asked for the daub's own ochre-brown, [0.76, 0.6, 0.44])
const CLAY: Rgb = [0.8, 0.7, 0.58];
const HOLLYHOCK: readonly Rgb[] = [0xc23a5e, 0xd8d0d6, 0x9a2a4a, 0xe08aa8, 0x7a2a6a].map(rgb);
const RIDER = rgb(0x6e6254);
/**
 * the plinth's clay paints: red-brown, umber, a dark blue-grey (sRGB as they should read), as multipliers over the
 * lime-wash's own albedo (~0.54 linear), so the band reads that dark — a paint in linear values over the lime read pale
 * in the close views (2026-10-05)
 */
const PRYZBA: readonly Rgb[] = [0x5a3a2c, 0x524433, 0x46505c].map((hex) => shade(rgb(hex), 1 / 0.54));

/**
 * The carving and paint of one khata (facade craft, desktop builds; from the facade stream, so the house's build
 * stream draws as before): most carry carved nalichniki — a crest cut to a gable peak, an arch or a step over the
 * window, an apron cut to a drop under it, in the surround's paint with the carved field in the house's other paint —
 * the rest keep their board surrounds inside a band painted on the whitewash. Returns the window style with its carving,
 * and the paint of the house's bands (`line`, the light line the plinth carried before its dark clay band, is still
 * drawn so the stream's later choices keep their order).
 */
function khataCraft(st: KolkhozState): { window: WindowStyle; line: Rgb; surround: Rgb | null } {
  const f = facadeRng();
  const s = st.window.surround!;
  const main = s.colour ?? WHITE_FRAME, other = main === WHITE_FRAME ? st.paint : WHITE_FRAME;
  const roll = f();
  const peak = roll < 0.5 ? 'gable' as const : roll < 0.8 ? 'arch' as const : 'stepped' as const;
  const carved = f() < 0.72;
  const rise = 0.13 + f() * 0.08, drop = 0.2 + f() * 0.1;
  // the bands: the house's paint lightened toward the lime (a pale line over a dark plinth)
  const light = (c: Rgb, k: number): Rgb => [c[0] + (1 - c[0]) * k, c[1] + (1 - c[1]) * k, c[2] + (1 - c[2]) * k];
  // the shutters painted: a border and a diamond or a heart in the surround's other colour
  const motif = f() < 0.5 ? 'diamond' as const : f() < 0.6 ? 'heart' as const : null;
  const shutters = st.window.shutters ? { ...st.window.shutters, paint: { border: other, motif } } : null;
  const window: WindowStyle = { ...st.window, shutters };
  return {
    window: carved ? { ...window, carved: { crest: { peak, colour: main, field: shade(other, 0.86), rise }, apronDrop: drop } } : window,
    line: light(st.paint, 0.18 + f() * 0.2),
    surround: carved ? null : light(st.paint, 0.45),
  };
}

function khataBody(sink: PartSink, ctx: RegionalBuildContext, st0: KolkhozState, W: number, D: number): void {
  // (the craft draws from the facade stream: a phone and the build stream see the house as before)
  const craft = facadeOn() ? khataCraft(st0) : null;
  const st: KolkhozState = craft ? { ...st0, window: craft.window } : st0;
  const rng = st.rng;
  const wall: RegionalBucket = ctx.wallBucket === 'stone' ? 'plaster' : ctx.wallBucket as RegionalBucket;
  // (b12, gauntlet wave 81: the village "mixes a thatched roof, a red tile roof … with no coherent regional building
  // vocabulary") every khata under its thatch; the asbestos sheet keeps to the kolkhoz's own buildings (the cowshed, the
  // club and the school), not drawn house by house at random. The old roof draw is still spent, so a house's other
  // details keep their stream.
  rng();
  const openings: Opening[] = [{ face: 'left', storey: 0, kind: 'door', u: D * 0.2, w: 0.95, y0: 0, h: 1.95 }];
  for (const face of ['left', 'right'] as const) {
    for (const o of windowRhythm(face, 0, D, { w: 0.72, h: 0.95, sill: 0.85, spacing: 2.0, margin: 0.9, max: 3,
      avoid: face === 'left' ? [[D * 0.2 - 0.6, D * 0.2 + 0.6]] : [] })) openings.push(o);
  }
  for (const o of windowRhythm('front', 0, W, { w: 0.72, h: 0.95, sill: 0.85, spacing: 1.8, margin: 0.9, max: 2 })) openings.push(o);
  const frame = buildHouse(sink, {
    w: W, d: D, plinth: { h: 0.45, out: 0.06, bucket: 'stone' }, storeys: [{ h: 2.45 + rng() * 0.2, wall }],
    roof: thatch(40 + rng() * 6), gableBucket: wall, openings,
    chimneys: [{ x: (rng() - 0.5) * 0.8, z: (rng() - 0.5) * D * 0.3, sx: 0.5, sz: 0.5, above: 0.55, bucket: 'plaster', cap: 'slab' }],
    // clay-rendered timber or adobe: no brick under the whitewash to show where it has spalled
    gutters: null, verge: null, spall: null,
    // (the facade craft, desktop) where the lime has worn off, the clay under it shows; the yard's trodden clay round
    // the wall foot and out from the door (house.ts groundSkirt), darkest against the plinth
    ...(craft ? { spall: wall, spallTint: CLAY, spallScale: 0.45, skirt: { bucket: 'plaster' as const, tint: TRODDEN } } : {}),
  }, dialect(st));
  if (craft) khataDressing(sink, frame, st, craft);
  // the porch (ganok) over the door: a small lean-to falling from the wall under the thatch's eave to a plate on two
  // posts (props census E4, lane B 2026-10-14: its high edge stood in the thatch, its posts unseated)
  const f = frame.faces.left, u = D * 0.2;
  leanTo(sink, { face: f, u0: u - 0.85, u1: u + 0.85, depth: 1.05, highY: frame.eaveY,
    under: { eaveY: frame.eaveY, eave: frame.spec.roof.eave, tanP: frame.roof.tanP },
    roof: { pitchDeg: 18, eave: 0.1, verge: 0.12, thickness: 0.08, bucket: 'roof' },
    posts: { at: [u - 0.75, u + 0.75], size: 0.12, bucket: 'structureWood', colour: PLANK },
    plate: { h: 0.11, w: 0.12, bucket: 'structureWood', colour: shade(PLANK, 0.85) } });
}

/**
 * A khata's craft past its windows (desktop): the painted bands round the board surrounds of an uncarved house; the
 * riders crossed over a thatch ridge; hollyhocks against the front wall; the plinth painted a dark clay band.
 */
function khataDressing(sink: PartSink, frame: HouseFrame, st: KolkhozState, craft: { line: Rgb; surround: Rgb | null }): void {
  const f = facadeRng();
  // (read off the roof the house was built with, not the khata's own draw: the craft follows whatever roofs it)
  const thatched = frame.spec.roof.bucket === 'straw';
  const body = frame.bodies[0], y0 = body.y0;
  // (the painted bands lie in the first render family whatever the wall's: its fine paint draws by the fine-detail cells,
  // props.ts DESKTOP_CELLED, where the second and third families' would be drawn at every range)
  for (const name of ['front', 'right', 'back', 'left'] as const) {
    const face = frame.faces[name];
    if (craft.surround) {
      for (const o of frame.spec.openings) {
        if (o.face !== name || o.kind !== 'window' || o.state) continue;
        const sw = st.window.surround?.width ?? 0.12;
        paintSurround(sink, 'plaster', face, o.u, y0 + o.y0 - 0.09, o.w + 2 * sw, o.h + 0.09 + (st.window.surround?.lintel ?? 0.2), 0.1, craft.surround);
      }
    }
  }
  const rg = frame.roof;
  // (calibration 2026-10-05: nine pairs down a long khata's ridge read as a fence; two or three, on most houses)
  if (thatched && rg.kind === 'hip' && f() < 0.7) {
    const half = rg.ridgeHalf, n = Math.min(2, Math.max(0, Math.round(2 * half / 2.6)));
    const zs = n === 0 ? [0] : Array.from({ length: n + 1 }, (_, k) => -half * 0.8 + 1.6 * half * k / n);
    ridgeRiders(sink, zs, rg.ridgeTopY + 0.06, rg.tanP, RIDER, rg.topAt);
  }
  // hollyhocks against the long front (the porch's face), clear of its windows and the porch
  if (f() < 0.65) {
    const face = frame.faces.left;
    const taken = frame.spec.openings.filter((o) => o.face === 'left').map((o) => [o.u - o.w / 2 - 0.5, o.u + o.w / 2 + 0.5]);
    const half = face.width / 2 - 0.7;
    for (let k = 0; k < 6; k++) {
      const u = -half + f() * 2 * half;
      if (taken.some(([a, b]) => u > a - 0.4 && u < b + 0.4)) continue;
      hollyhocks(sink, face, u, pick(f, HOLLYHOCK), f);
      break;
    }
  }
  // the plinth (pryzba) painted a dark clay band under the lime (wave 116: "lime-wash should be a soft, brushed white over
  // mud plaster, with a darker plinth band"): red-brown clay, umber or a dark blue-grey, over the brick the phone keeps
  const plinth = frame.spec.plinth;
  if (plinth) plinthPaint(sink, 'plaster', [frame.spec.w / 2, frame.spec.d / 2], plinth.out, -0.6, plinth.h, pick(f, PRYZBA));
}

/**
 * A cowshed's masonry (facade craft, desktop): brick piers between its windows and at its corners, a corbelled dentil
 * cornice under both eaves returned round the gables, the windows under segmental brick arches (lintels on a
 * whitewashed shed), a round vent high in each gable and a brick arch over each cart gate.
 */
function shedMasonry(sink: PartSink, frame: HouseFrame, wall: RegionalBucket): void {
  const top = frame.eaveY, base = frame.floors[0];
  for (const name of ['left', 'right'] as const) {
    const face = frame.faces[name], half = face.width / 2;
    const us = frame.spec.openings.filter((o) => o.face === name).map((o) => o.u).sort((a, b) => a - b);
    const piers = [-half + 0.22, half - 0.22];
    for (let k = 0; k + 1 < us.length; k++) piers.push((us[k] + us[k + 1]) / 2);
    for (const u of piers) pilaster(sink, wall, face, u, base, top - 0.31, 0.5, 0.12);
    dentilCornice(sink, wall, face, -half, half, top - 0.31, { ret: 0.35 });
    for (const o of frame.spec.openings) {
      if (o.face !== name) continue;
      const y = base + o.y0 + o.h;
      if (wall === 'stone') windowHead(sink, face, o.u, y, o.w, { kind: 'segment', bucket: 'stone', h: 0.09, out: 0.035, ext: 0.07, rise: 0.07 });
      else windowHead(sink, face, o.u, y, o.w, { kind: 'lintel', bucket: wall, h: 0.14, out: 0.03, ext: 0.08 });
    }
  }
  const rg = frame.roof;
  for (const name of ['front', 'back'] as const) {
    const face = frame.faces[name], half = face.width / 2;
    for (const u of [-half + 0.25, half - 0.25]) pilaster(sink, wall, face, u, base, top - 0.05, 0.5, 0.12);
    // the round vent in the gable, in a brick ring
    const vy = top + (rg.ridgeY - top) * 0.52, ring: Array<[number, number]> = [], hole: Array<[number, number]> = [];
    for (let k = 0; k < 12; k++) {
      const a = Math.PI * 2 * k / 12;
      ring.push([Math.cos(a) * 0.42, vy + Math.sin(a) * 0.42]);
      hole.push([Math.cos(a) * 0.3, vy + Math.sin(a) * 0.3]);
    }
    faceSlab(sink, wall === 'stone' ? 'stone' : wall, face, ring, 0, 0.03, { fine: true });
    // (props census E2, lane B 2026-10-14: the vent was a dark disc on the gable) the vent is cut through the gable
    // (korovnik's gableOpenings) and its louvres stand in it, boards sloping down and out
    void hole;
    for (const dy of [-0.18, -0.06, 0.06, 0.18]) {
      const half = Math.sqrt(Math.max(0, 0.3 * 0.3 - dy * dy)) + 0.04;
      sink.member('structureWood', facePoint(face, -half, vy + dy + 0.04, -0.07), facePoint(face, half, vy + dy + 0.04, -0.07), 0.1, 0.025,
        normalize3([face.out[0], 1.1, face.out[2]]), { colour: shade(PLANK, 0.7), decor: true, exposed: true }, 0);
    }
    for (const o of frame.spec.openings) {
      if (o.face !== name || o.kind !== 'gate') continue;
      windowHead(sink, face, o.u, base + o.y0 + o.h + 0.12, o.w + 0.24, { kind: 'segment', bucket: wall, h: 0.12, out: 0.05, ext: 0.1, rise: 0.22 });
    }
  }
}

/** The korovnik: a long brick cowshed, small windows in a row, cart doors at both gables, ridge vents. */
const korovnik: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx);
  const rng = st.rng;
  const W = Math.max(7.0, ctx.info.w - 0.3), D = Math.max(11, ctx.info.d - 0.3);
  const wall: RegionalBucket = rng() < 0.55 ? 'stone' : 'plaster';
  const openings: Opening[] = [
    { face: 'front', storey: 0, kind: 'gate', u: 0, w: 2.4, y0: 0, h: 2.6 },
    { face: 'back', storey: 0, kind: 'gate', u: 0, w: 2.4, y0: 0, h: 2.6 },
  ];
  for (const face of ['left', 'right'] as const) {
    for (const o of windowRhythm(face, 0, D, { w: 0.7, h: 0.55, sill: 1.75, spacing: 1.9, margin: 1.0 })) openings.push({ ...o, kind: 'loft' });
  }
  // the round vent in each gable (shedMasonry rings it), cut through the gable: its square hole under the ring
  const ventHole = (poly: Array<[number, number]>): HoleRect[] => {
    const base = poly[0][1], vy = base + (Math.max(...poly.map(([, y]) => y)) - base) * 0.52;
    return [{ u0: -0.29, u1: 0.29, y0: vy - 0.29, y1: vy + 0.29 }];
  };
  const frame = buildHouse(sink, {
    w: W, d: D, plinth: { h: 0.3, out: 0.05, bucket: 'stone' }, storeys: [{ h: 3.0, wall }],
    roof: { ...shifer(26), relief: SHIFER }, gableBucket: wall === 'stone' ? 'stone' : 'plaster', openings, chimneys: [], gutters: null, verge: null,
  }, { ...dialect({ ...st, litShare: 0 }), gableOpenings: (_face, poly) => ventHole(poly) });
  if (facadeOn()) shedMasonry(sink, frame, wall);
  // ventilation stacks on the ridge: boarded boxes with little gabled caps
  const rg = frame.roof;
  for (const z of [-D * 0.28, D * 0.28]) {
    const top = rg.ridgeTopY;
    sink.span('structureWood', -0.35, top - 0.4, z - 0.35, 0.35, top + 0.9, z + 0.35, { colour: shade(PLANK, 0.9) });
    const cap: RoofSpec = { kind: 'gable', pitchDeg: 30, eave: 0.12, verge: 0.1, thickness: 0.06, bucket: 'roof', ridge: null };
    sink.placed(0, 0, 0, z, () => emitRoof(sink, roofGeometry(0.7, 0.7, top + 0.9, cap), cap));
  }
  return sink.finish();
};

/**
 * The ambar, the log granary of the kolkhoz yards (props census #22, Lane C 2026-10-16: "nothing is log"): hewn courses
 * saddle-notched at the corners, their ends running past them (goral.ts logWork), on two sill logs over its stone pads,
 * the gable boarded, the plank door in its frame cut through the courses, the gable roof carried forward over the door
 * on two posts, the treads up to the sill.
 */
const ambar: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx);
  const W = Math.max(3.2, ctx.info.w - 0.6), D = Math.max(4.0, ctx.info.d - 2.0);
  const raise = 0.55, sill = 0.26, lift = raise + sill;
  for (const sx of [-1, 1]) for (const sz of [-1, 0, 1]) sink.span('stone', sx * (W / 2 - 0.25) - 0.22, -0.3, sz * (D / 2 - 0.25) - 0.22, sx * (W / 2 - 0.25) + 0.22, raise, sz * (D / 2 - 0.25) + 0.22);
  // the sill frame on the pads: four heavy sill logs under the wall lines, crossing past the corners as the courses over
  // them do (they close the courses' ends from below: the ambar stands clear of the ground)
  const sc = { colour: shade(PLANK, 0.72) } as const, past = 0.36, t2 = 0.14;
  for (const sz of [-1, 1]) sink.span('structureWood', -W / 2 - past, raise, sz * D / 2 - t2, W / 2 + past, lift, sz * D / 2 + t2, sc);
  for (const sx of [-1, 1]) sink.span('structureWood', sx * W / 2 - t2, raise, -D / 2 - past, sx * W / 2 + t2, lift - 0.01, D / 2 + past, sc);
  sink.placed(0, 0, lift, 0, () => {
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: null, storeys: [{ h: 2.2, wall: 'wood' }],
      roof: { kind: 'gable', pitchDeg: 38, eave: 0.3, verge: 1.2, thickness: 0.1, bucket: 'roof', ridge: 'saddle', relief: SHIFER },
      gableBucket: 'wood', openings: [{ face: 'front', storey: 0, kind: 'door', u: 0, w: 1.0, y0: 0, h: 1.8 }],
      chimneys: [], gutters: null, verge: { colour: shade(PLANK, 0.85), bucket: 'structureWood', carved: shade(PLANK, 1.15) }, reveal: 0.2,
    }, dialect({ ...st, litShare: 0 }));
    logWork(sink, frame, [0], ctx.variant, st.window, ctx.tier === 'mobile', 0.25);
  });
  // the posts under the projecting gable
  for (const sx of [-1, 1]) sink.span('structureWood', sx * (W / 2 - 0.1) - 0.08, 0, D / 2 + 1.0 - 0.08, sx * (W / 2 - 0.1) + 0.08, lift + 2.2, D / 2 + 1.0 + 0.08, { colour: PLANK });
  // three plank treads up to the door
  for (let k = 0; k < 3; k++) sink.span('structureWood', -0.5, lift * (k / 3) - 0.05, D / 2 + 0.25 + (2 - k) * 0.28, 0.5, lift * ((k + 1) / 3), D / 2 + 0.25 + (3 - k) * 0.28, { colour: PLANK, decor: true });
  return sink.finish();
};

/** The wooden post mill (props census #22, Lane C 2026-10-16: windmills.ts buildPostMill, at the standard). */
const postMill: RegionalBuilder = (ctx) => buildPostMill(ctx, { timber: rgb(0x6a5440), dark: rgb(0x4a3b2e) });

/** An onion dome on a drum: swelling and narrowing to a gilt cross. */
function onion(sink: PartSink, x: number, y: number, z: number, r: number, colour: Rgb): void {
  const profile = [1.0, 1.18, 1.22, 1.12, 0.9, 0.6, 0.32, 0.14];
  // (dome-detail-275: seven frustums of twelve flat facets) the same swell turned smooth (domes.ts)
  const yy = bulb(sink, 'structureMetal', x, y, z, profile.slice(1).map((b, k) => [r * 0.34, r * profile[k], r * b] as const), { colour });
  sink.cylinder('structureMetal', [x, yy, z], 'y', r * 0.5, r * 0.08, 6, { colour: GILT, decor: true }, r * 0.04);
  sink.span('structureMetal', x - 0.03, yy + r * 0.5, z - 0.03, x + 0.03, yy + r * 0.5 + 1.0, z + 0.03, { colour: GILT, decor: true });
  sink.span('structureMetal', x - 0.28, yy + r * 0.5 + 0.62, z - 0.03, x + 0.28, yy + r * 0.5 + 0.7, z + 0.03, { colour: GILT, decor: true });
}

/**
 * The village church: whitewashed nave and drum, a green sheet roof, onion domes on the drum and the bell tower. Where
 * the plot is too short for the west tower beside the nave, a chapel (chasovnya): a shorter nave with one onion on its
 * drum and an open belfry over the west gable, all inside the plot.
 */
const church: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx);
  const tower = ctx.info.d - 0.4 >= 12.9;
  const W = Math.max(tower ? 6.0 : 4.6, Math.min(8.6, ctx.info.w - 0.6));
  const D = tower ? Math.max(9, Math.min(16, ctx.info.d - 4.0)) : Math.max(6.0, Math.min(9, ctx.info.d - 0.4));
  const openings: Opening[] = [];
  for (const face of ['left', 'right'] as const) for (const o of windowRhythm(face, 0, D, { w: 0.85, h: 1.8, sill: 1.6, spacing: 2.6, margin: 1.2 })) openings.push(o);
  if (!tower) openings.push({ face: 'front', storey: 0, kind: 'door', u: 0, w: 1.2, y0: 0, h: 2.4 });
  const frame = buildHouse(sink, {
    w: W, d: D, plinth: { h: 0.4, out: 0.08, bucket: 'stone' }, storeys: [{ h: tower ? 5.2 : 4.4, wall: 'plaster' }],
    roof: { kind: 'gable', pitchDeg: 34, eave: 0.35, verge: 0.2, thickness: 0.1, bucket: 'structureMetal', ridge: null, relief: ROOF_IRON },
    gableBucket: 'plaster', openings, chimneys: [], gutters: null, verge: null,
  }, {
    ...dialect(st),
    window: (s, face, o, y0) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, {
      frame: WHITE_FRAME, frameWidth: 0.06, frameOut: 0.04, bars: 'six',
      surround: { bucket: 'plaster', width: 0.18, out: 0.06, lintel: 0.3 }, sill: { bucket: 'plaster', out: 0.1 }, shutters: null,
    }, st.rng, 0.2),
    door: (s, face, o, y0) => doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { leaf: rgb(0x6e5440), frame: { bucket: 'plaster', width: 0.24, out: 0.08, arch: true }, steps: { bucket: 'stone' }, leafKind: 'plank' }, y0 + o.y0),
  });
  // the drum and its dome over the crossing
  const top = frame.roof.ridgeTopY, r = Math.min(1.5, W * 0.24);
  sink.cylinder('plaster', [0, top - 1.2, -D * 0.1], 'y', 2.4 * r / 1.5, r, 12, {});
  onion(sink, 0, top - 1.2 + 2.4 * r / 1.5, -D * 0.1, r, DOME_GREEN);
  if (facadeOn()) churchMasonry(sink, frame, [0, top - 1.2, -D * 0.1], 2.4 * r / 1.5, r);
  if (!tower) {
    // the belfry over the west gable: four posts on the ridge, open between them, a pyramid of sheet and a small onion
    const bz = D / 2 - 0.9, by = frame.roof.ridgeY - 0.6, bh = 1.7, b = 0.65;
    // (props census #5: the belfry a crown of the roof in the house's plan: it falls with its roof section)
    roofCrown(sink, frame, { kind: 'belfry', x0: -b - 0.18, x1: b + 0.18, z0: bz - b - 0.18, z1: bz + b + 0.18, y0: by, y1: by + bh + 2.4, bucket: 'plaster' }, () => {
      for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
        sink.span('plaster', sx * b - 0.13, by, bz + sz * b - 0.13, sx * b + 0.13, by + bh + 0.6, bz + sz * b + 0.13);
      }
      sink.span('plaster', -b - 0.18, by + bh + 0.6, bz - b - 0.18, b + 0.18, by + bh + 0.85, bz + b + 0.18);
      sink.span('structureMetal', -0.06, by + 0.95, bz - 0.06, 0.06, by + bh + 0.6, bz + 0.06, { colour: rgb(0x2e3032), decor: true });
      sink.cylinder('structureMetal', [0, by + 0.75, bz], 'y', 0.42, 0.3, 8, { colour: rgb(0x6a5a3a), decor: true }, 0.15);
      onion(sink, 0, by + bh + 0.85, bz, 0.55, DOME_GREEN);
    });
    return sink.finish();
  }
  // the bell tower at the west (+z) end: two square tiers and a small onion
  const tz = D / 2 + 1.6;
  sink.span('stone', -1.95, -0.4, tz - 1.95, 1.95, 0.4, tz + 1.95);
  // (props census #5, lane B 2026-10-15) the lower tier's door cut through it (the leaf was laid on a solid span), the
  // leaf at the back of its reveal; the belfry tier open on its four corner piers under its head, the bell hung in it
  // (its openings were dark plates on a solid block); the tower recorded as a shaft body under its onion
  holedBox(sink, 'plaster', -1.6, tz - 1.6, 1.6, tz + 1.6, 0.4, 7.0, { front: [{ u0: -0.65, u1: 0.65, y0: 0.4, y1: 3.0 }] }, 0.4, 0.34);
  openBelfry(sink, 'plaster', 0, tz, 2.5, 7.0, 9.05, 9.6, 0.8, rgb(0x6a5a3a), rgb(0x4a3a2a));
  recordShaft(sink, 0, tz, 3.2, 9.75 + 2.4, 'plaster');
  const towerFace: Face = { origin: [0, 0, tz + 1.6], u: [1, 0, 0], out: [0, 0, 1], width: 3.2 };
  sink.recess = 0.34;
  try {
    doorUnit(sink, towerFace, 0, 0.4, 1.3, 2.6, { leaf: rgb(0x6e5440), frame: { bucket: 'plaster', width: 0.24, out: 0.08, arch: true }, steps: { bucket: 'stone' }, leafKind: 'plank' }, 0.4);
  } finally { sink.recess = 0; }
  sink.span('structureMetal', -1.35, 9.6, tz - 1.35, 1.35, 9.75, tz + 1.35, { colour: GREEN_ROOF });
  onion(sink, 0, 9.75, tz, 0.95, DOME_GREEN);
  if (facadeOn()) {
    // the tower's tiers parted by cornices, its corners by pilasters, brows over the belfry's openings
    trimRing(sink, 'plaster', { x0: -1.6, x1: 1.6, z0: tz - 1.6, z1: tz + 1.6 }, 6.72, [{ h: 0.1, out: 0.06 }, { h: 0.12, out: 0.14 }, { h: 0.06, out: 0.2 }]);
    trimRing(sink, 'plaster', { x0: -1.25, x1: 1.25, z0: tz - 1.25, z1: tz + 1.25 }, 9.36, [{ h: 0.1, out: 0.05 }, { h: 0.12, out: 0.12 }]);
    for (const [o, u] of [[[0, 0, tz + 1.25], [1, 0, 0]], [[0, 0, tz - 1.25], [-1, 0, 0]], [[1.25, 0, tz], [0, 0, -1]], [[-1.25, 0, tz], [0, 0, 1]]] as const) {
      const f: Face = { origin: o as Vec3, u: u as Vec3, out: [Math.sign(o[0]), 0, o[0] === 0 ? Math.sign(o[2] - tz) : 0], width: 2.5 };
      windowHead(sink, f, 0, 9.05, 0.8, { kind: 'segment', bucket: 'plaster', h: 0.08, out: 0.05, ext: 0.1, rise: 0.18 });
      for (const cu of [-1.03, 1.03]) pilaster(sink, 'plaster', f, cu, 7.0, 9.36, 0.34, 0.05);
    }
    const lower: Face[] = [
      { origin: [0, 0, tz + 1.6], u: [1, 0, 0], out: [0, 0, 1], width: 3.2 }, { origin: [1.6, 0, tz], u: [0, 0, -1], out: [1, 0, 0], width: 3.2 },
      { origin: [-1.6, 0, tz], u: [0, 0, 1], out: [-1, 0, 0], width: 3.2 },
    ];
    for (const f of lower) for (const cu of [-1.35, 1.35]) pilaster(sink, 'plaster', f, cu, 0.4, 6.72, 0.42, 0.06);
  }
  return sink.finish();
};

/**
 * A village church's masonry (facade craft, desktop): pilasters at the nave's corners and between its windows, a
 * stepped cornice under the eaves returned round the gables, arched brows over the windows; on the drum a cornice
 * under the dome, a band at its foot and four arched windows.
 */
function churchMasonry(sink: PartSink, frame: HouseFrame, drum: Vec3, drumH: number, r: number): void {
  const base = frame.floors[0], top = frame.eaveY;
  for (const name of ['left', 'right'] as const) {
    const face = frame.faces[name], half = face.width / 2;
    const us = frame.spec.openings.filter((o) => o.face === name).map((o) => o.u).sort((a, b) => a - b);
    const piers = [-half + 0.25, half - 0.25];
    for (let k = 0; k + 1 < us.length; k++) piers.push((us[k] + us[k + 1]) / 2);
    for (const u of piers) pilaster(sink, 'plaster', face, u, base, top - 0.34, 0.5, 0.07);
    trimRun(sink, 'plaster', face, -half, half, top - 0.34, [{ h: 0.12, out: 0.07 }, { h: 0.1, out: 0.14 }, { h: 0.12, out: 0.22 }], { ret: 0.45 });
    for (const o of frame.spec.openings) {
      if (o.face !== name || o.state) continue;
      windowHead(sink, face, o.u, base + o.y0 + o.h + 0.3, o.w + 0.36, { kind: 'segment', bucket: 'plaster', h: 0.1, out: 0.08, ext: 0.06, rise: 0.3 });
    }
  }
  for (const name of ['front', 'back'] as const) {
    const face = frame.faces[name], half = face.width / 2;
    for (const u of [-half + 0.25, half - 0.25]) pilaster(sink, 'plaster', face, u, base, top - 0.04, 0.5, 0.07);
  }
  // the drum: a band at its foot, a cornice under the dome, four arched windows between
  sink.cylinder('plaster', [drum[0], drum[1] + 0.95, drum[2]], 'y', 0.16, r + 0.07, 12, { decor: true, fine: true }, r + 0.07, false);
  sink.cylinder('plaster', [drum[0], drum[1] + drumH - 0.22, drum[2]], 'y', 0.22, r + 0.06, 12, { decor: true }, r + 0.16, false);
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + k * Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a);
    const f: Face = { origin: [drum[0] + ca * r * 0.97, 0, drum[2] + sa * r * 0.97], u: [-sa, 0, ca], out: [ca, 0, sa], width: 1 };
    const wy = drum[1] + 1.2, wh = Math.max(0.5, drumH - 1.6);
    faceSlab(sink, 'dark', f, [[-0.2, wy], [0.2, wy], [0.2, wy + wh], [0, wy + wh + 0.18], [-0.2, wy + wh]], 0, 0.04);
    // (props census #5, lane B 2026-10-15: the dark lay on the drum, a painted window) its deep plaster surround, the dark
    // at the back of its reveal: the jambs, the sill and the head 22 cm proud of it
    // (on a right-handed face: the drum face's u runs the other way, which turned the boxes inside out)
    const fr: Face = { ...f, u: [sa, 0, -ca] };
    for (const s2 of [-1, 1]) faceBox(sink, 'plaster', fr, s2 * 0.25, wy + (wh + 0.18) / 2, 0.11, 0.1, wh + 0.28, 0.22, { decor: true });
    faceBox(sink, 'plaster', fr, 0, wy - 0.05, 0.11, 0.4, 0.1, 0.22, { decor: true }, 'ends');
    faceBox(sink, 'plaster', fr, 0, wy + wh + 0.23, 0.11, 0.4, 0.1, 0.22, { decor: true }, 'ends');
  }
}

// ---- (dome-detail-275) the club's and the school's sheet roof in relief, its vent dormers, its pediment ----

const cross3 = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

/** A convex polygon wound to face `toward` (dome-detail-275; its normal by Newell's sum, so a cut outline's repeated or
 *  collinear corners cannot turn it). */
function facing(sink: PartSink, bucket: RegionalBucket, pts: Vec3[], toward: Vec3, opts: Parameters<PartSink['polygon']>[2]): void {
  let nx = 0, ny = 0, nz = 0;
  pts.forEach((p, i) => { const q = pts[(i + 1) % pts.length]; const c = cross3(p, q); nx += c[0]; ny += c[1]; nz += c[2]; });
  sink.polygon(bucket, nx * toward[0] + ny * toward[1] + nz * toward[2] >= 0 ? pts : [...pts].reverse(), opts);
}

/**
 * One slope of a hip roof in its own terms (dome-detail-275, after dalmatian's tile slope): a point `v` up the slope from
 * the eave's edge, `t` along it, `h` off the covering; `lim(v)` how far either way the slope reaches at `v` before its
 * hips; `reach` its run to the ridge; `along` the way `t` runs.
 */
interface SheetSlope { at: (v: number, t: number, h: number) => Vec3; n: Vec3; up: Vec3; along: Vec3; lim: (v: number) => number; reach: number; side: 1 | -1; end: boolean }

function sheetSlope(rg: HouseFrame['roof'], roof: RoofSpec, side: 1 | -1, end: boolean): SheetSlope {
  const cosP = 1 / Math.hypot(1, rg.tanP), sinP = rg.tanP * cosP, xe = rg.s + roof.eave;
  const D = rg.halfD + (rg.hipVerge ?? roof.verge), run = Math.max(0.1, D - rg.ridgeHalf);
  if (end) {
    const ye = rg.topAt(0, side * D) ?? rg.eaveY;
    return {
      at: (v, t, h) => [t, ye + sinP * v + cosP * h, side * (D - cosP * v + sinP * h)], n: [0, cosP, side * sinP], up: [0, sinP, -side * cosP],
      along: [1, 0, 0], lim: (v) => xe * (1 - cosP * v / run), reach: run / cosP, side, end,
    };
  }
  const ye = rg.topAt(side * xe, 0) ?? rg.eaveY;
  const up: Vec3 = [-side * cosP, sinP, 0], n: Vec3 = [side * sinP, cosP, 0];
  return {
    at: (v, t, h) => [side * xe + up[0] * v + n[0] * h, ye + up[1] * v + n[1] * h, t], n, up, along: [0, 0, 1],
    lim: (v) => rg.ridgeHalf + run * (1 - cosP * v / xe), reach: xe / cosP, side, end,
  };
}

/** A rectangle of a slope (v up it, t along it) the sheets leave to something standing on the roof (dome-detail-275). */
interface SlopeKeep { side: 1 | -1; end: boolean; v0: number; v1: number; t0: number; t1: number }

/**
 * The asbestos-cement sheets (shifer) of a hip roof in relief (dome-detail-275; the roof bar: "sheets with laps"): each
 * slope in courses of wave sheets 1.13 m wide, every course's butt a corrugation's depth proud of the one under it and
 * thinning up to its lap under the next, every sheet its own grey — weathered darker toward the eaves, here and there a
 * newer pale one put in — and each lapping its neighbour along a side; the sheets cut along the hips under their caps.
 * Left open over the stripped patch the war wear opened (HouseFrame.roofPatch) and round what stands on the slope.
 */
function shiferSheets(sink: PartSink, frame: HouseFrame, look: () => number, keep: readonly SlopeKeep[]): void {
  const rg = frame.roof, roof = frame.spec.roof, hole = frame.roofPatch, pad = 0.08;
  if (rg.kind !== 'hip' || rg.hipTan !== undefined) return;
  const cosP = 1 / Math.hypot(1, rg.tanP), xe = rg.s + roof.eave;
  const SW = 1.13, C = 1.5, LAP = 0.16, B = 0.045, IN = 0.12;
  for (const sl of [sheetSlope(rg, roof, 1, false), sheetSlope(rg, roof, -1, false), sheetSlope(rg, roof, 1, true), sheetSlope(rg, roof, -1, true)]) {
    const gaps: Array<{ v0: number; v1: number; t0: number; t1: number }> = keep.filter((k) => k.side === sl.side && k.end === sl.end);
    if (hole && !sl.end && hole.side === sl.side) gaps.push({ v0: (xe - hole.x1 - pad) / cosP, v1: (xe - hole.x0 + pad) / cosP, t0: hole.z0 - pad, t1: hole.z1 + pad });
    const top = sl.reach - 0.14, shift = look() * SW, down: Vec3 = [-sl.up[0], -sl.up[1], -sl.up[2]];
    const uv = { kind: 'plane' as const, origin: sl.at(0, 0, 0), u: sl.along, v: down };
    for (let k = 0, v = 0; v < top - 0.2; k++, v += C) {
      const v1 = Math.min(top, v + C + LAP), L0 = sl.lim(v) - IN;
      if (L0 < 0.3) break;
      // the course's sheets from its one hip to the other, the first and last cut along the hips
      for (let t = -L0 - shift; t < L0; t += SW) {
        const ta = Math.max(t, -L0), tb = Math.min(t + SW, L0);
        if (tb - ta < 0.06 || gaps.some((g) => v1 > g.v0 && v < g.v1 && tb > g.t0 && ta < g.t1)) continue;
        // the sheet's outline in (v, t), cut by both hips' lines
        let poly: Array<[number, number]> = [[v, ta], [v, tb], [v1, tb], [v1, ta]];
        for (const sg of [1, -1]) {
          const d = (p: readonly [number, number]) => sl.lim(p[0]) - IN - sg * p[1];
          const out: Array<[number, number]> = [];
          for (let i = 0; i < poly.length; i++) {
            const p = poly[i], q = poly[(i + 1) % poly.length], dp = d(p), dq = d(q);
            if (dp >= 0) out.push(p);
            if ((dp >= 0) !== (dq >= 0)) { const s = dp / (dp - dq); out.push([p[0] + (q[0] - p[0]) * s, p[1] + (q[1] - p[1]) * s]); }
          }
          poly = out;
        }
        if (poly.length < 3) continue;
        const h = (vv: number): number => B + (vv - v) / (v1 - v) * (-0.01 - B);
        const tone = (k === 0 ? 0.84 : 0.9) + look() * 0.14, newer = look() < 0.04;
        const o = { decor: true, shade: newer ? 1.14 : tone, uv };
        facing(sink, 'roof', poly.map(([vv, tt]) => sl.at(vv, tt, h(vv))), sl.n, o);
        // the butt across its foot, and the lap along its side over the neighbour it was laid on
        const foot = poly.filter(([vv]) => Math.abs(vv - v) < 1e-6);
        if (foot.length === 2) {
          const [p, q] = foot;
          facing(sink, 'roof', [sl.at(v, p[1], -0.01), sl.at(v, q[1], -0.01), sl.at(v, q[1], B), sl.at(v, p[1], B)], down, { ...o, shade: o.shade * 0.7 });
        }
        const lap = poly.filter(([, tt]) => Math.abs(tt - t) < 1e-6);
        if (t > -L0 && lap.length === 2) {
          const [p, q] = lap;
          facing(sink, 'roof', [sl.at(p[0], t, -0.01), sl.at(q[0], t, -0.01), sl.at(q[0], t, h(q[0])), sl.at(p[0], t, h(p[0]))],
            [-sl.along[0], -sl.along[1], -sl.along[2]], { ...o, fine: true, shade: o.shade * 0.75 });
        }
      }
    }
  }
}

/**
 * A slukhovoe okno (dome-detail-275): the roof space's little vent on a hip roof's long slope, a boarded triangle
 * standing up out of the sheet with its louvre boards, under two small planes of the same sheet run back into the slope.
 * Returns the rectangle of the slope it stands on.
 */
function ventDormer(sink: PartSink, rg: HouseFrame['roof'], roof: RoofSpec, side: 1 | -1, zc: number, w: number, rise: number, boards: Rgb): SlopeKeep {
  const xf = rg.s - 1.25, yb = (rg.topAt(side * xf, zc) ?? rg.eaveY) - 0.03, ya = yb + rise;
  const xr = Math.max(0.3, (rg.ridgeTopY - ya - 0.03) / rg.tanP);
  const g = { decor: true, colour: boards };
  // the gable's boards and the louvre in it: the dark behind, three boards across
  orientedPrism(sink, 'structureWood', [[side * xf, yb - 0.14, zc - w / 2], [side * xf, yb - 0.14, zc + w / 2], [side * xf, ya, zc]], [-side, 0, 0], 0.05, g);
  const face: Face = { origin: [side * xf, 0, zc], u: [0, 0, -side], out: [side, 0, 0], width: w };
  const l0 = yb + 0.08, l1 = ya - 0.16, lw = w / 2 - 0.16;
  facing(sink, 'dark', [facePoint(face, -lw, l0, 0.004), facePoint(face, lw, l0, 0.004), facePoint(face, 0, l1, 0.004)], [side, 0, 0], { decor: true });
  for (let k = 0; k < 3; k++) {
    const y = l0 + 0.07 + k * (l1 - l0 - 0.1) / 3, half = lw * (1 - (y + 0.03 - l0) / (l1 - l0));
    if (half > 0.06) faceBox(sink, 'structureWood', face, 0, y, 0.025, 2 * half, 0.06, 0.03, { decor: true, fine: 'near', colour: shade(boards, 0.8) });
  }
  // its two little planes of sheet from the gable's head back to the slope, a hand over the boards
  const xo = xf + 0.1, ye = rg.topAt(side * xo, zc) ?? yb;
  for (const e of [-1, 1]) {
    const pts: Vec3[] = [[side * xo, ye - 0.02, zc + e * (w / 2 + 0.1)], [side * xo, ya + 0.03, zc], [side * xr, ya + 0.03, zc]];
    const c = cross3([pts[1][0] - pts[0][0], pts[1][1] - pts[0][1], pts[1][2] - pts[0][2]], [pts[2][0] - pts[0][0], pts[2][1] - pts[0][1], pts[2][2] - pts[0][2]]);
    const len = Math.hypot(c[0], c[1], c[2]) * (c[1] < 0 ? -1 : 1);
    orientedPrism(sink, 'roof', pts, [c[0] / len, c[1] / len, c[2] / len], 0.04, { decor: true, shade: 0.86 });
  }
  const cosP = 1 / Math.hypot(1, rg.tanP), xe = rg.s + roof.eave;
  return { side, end: false, v0: (xe - xo - 0.1) / cosP, v1: (xe - xr + 0.1) / cosP, t0: zc - w / 2 - 0.25, t1: zc + w / 2 + 0.25 };
}

/** A five-pointed star in relief on a wall (dome-detail-275): five kites from its centre, `r` to its points. */
function star(sink: PartSink, face: Face, u: number, y: number, r: number, o: number, colour: Rgb): void {
  for (let k = 0; k < 5; k++) {
    const a = Math.PI / 2 + k * 2 * Math.PI / 5, at = (aa: number, rr: number): Vec3 => facePoint(face, u + Math.cos(aa) * rr, y + Math.sin(aa) * rr, o);
    orientedPrism(sink, 'structureMetal', [at(0, 0), at(a - Math.PI / 5, r * 0.4), at(a, r), at(a + Math.PI / 5, r * 0.4)], face.out, 0.03, { decor: true, colour });
  }
}

/**
 * The club or village shop (sel'po): one storey of whitewashed brick under a hipped sheet roof, a porch canopy.
 * (dome-detail-275; the work list: "a plain hipped box") The kolkhoz club and the village school as the 1950s built
 * them: the asbestos sheet in its courses; over the entrance bay a pediment (fronton) of the walls' own masonry under a
 * little gable of sheet run back into the hip, a star on a roundel in it (the club) or a round window (the school); a
 * slukhovoe okno on each long slope; the porch's posts squared on brick bases under a plate with its braces, benches
 * either side of it; the back wall's windows (the club's two high ones over its stage, the school's classroom row); a
 * second chimney for the hall's stove; the cellar's vents through the plinth; the brick apron (otmostka) round its
 * foot; the club's loudspeaker on its bracket, the school's flag.
 */
function club(ctx: RegionalBuildContext, school = false): RegionalParts {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx);
  const look = ctx.variant;
  const W = Math.max(7, Math.min(9.5, ctx.info.w - 0.4)), D = Math.max(10, Math.min(15, ctx.info.d - 2.0));
  const wall: RegionalBucket = school ? 'stone' : 'plaster';
  const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'door', u: 0, w: 1.3, y0: 0, h: 2.3 }];
  for (const face of ['left', 'right'] as const) for (const o of windowRhythm(face, 0, D, { w: school ? 1.25 : 1.0, h: 1.5, sill: 0.95, spacing: school ? 2.2 : 2.6, margin: 1.0 })) openings.push(o);
  for (const o of windowRhythm('front', 0, W, { w: 1.0, h: 1.4, sill: 1.0, spacing: 2.4, margin: 1.0, avoid: [[-1.0, 1.0]] })) openings.push(o);
  // (dome-detail-275) the back wall's windows: the club's two high ones over its stage, the school's classroom row
  for (const o of windowRhythm('back', 0, W, school ? { w: 1.25, h: 1.5, sill: 0.95, spacing: 2.4, margin: 1.2, max: 3 } : { w: 0.9, h: 0.9, sill: 1.6, spacing: 3.0, margin: 1.8, max: 2 })) openings.push(o);
  const joinery: KolkhozState = { ...st, window: { ...st.window, shutters: null, surround: school ? null : st.window.surround } };
  // (the back wall's windows draw from the look stream: the build stream's draws for the rest keep their order)
  const main = dialect(joinery), rear = dialect({ ...joinery, rng: look });
  const join: HouseDialect = { window: (s, f, o, y0, fr) => (o.face === 'back' ? rear : main).window(s, f, o, y0, fr), door: main.door };
  // set back so its porch canopy (1.9 m) stays inside the plot
  sink.placed(0, 0, 0, -Math.min(0.75, Math.max(0, (ctx.info.d - D) / 2 - 0.25)), () => {
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: 0.5, out: 0.06, bucket: 'stone' }, storeys: [{ h: 3.3, wall }], roof: shifer(26, 'hip'), gableBucket: wall,
      openings, chimneys: [{ x: 0.9, z: -D * 0.2, sx: 0.55, sz: 0.55, above: 0.8, bucket: 'stone', cap: 'slab' },
        // (dome-detail-275) the hall's stove's chimney
        { x: -0.8, z: D * 0.08, sx: 0.5, sz: 0.5, above: 0.7, bucket: 'stone', cap: 'slab' }], gutters: null, verge: null,
    }, join);
    // the porch canopy on two posts and its sign board
    const f = frame.faces.front, rg = frame.roof, eave = frame.eaveY, wood = shade(PLANK, 0.9);
    // (dome-detail-275) the posts squared on brick bases, a plate along the canopy's front under it, braces up to it
    for (const du of [-1.0, 1.0]) {
      faceBox(sink, 'stone', f, du, 0.2, 1.5, 0.3, 0.4, 0.3, { shade: 0.85 });
      faceBox(sink, 'structureWood', f, du, 1.65, 1.5, 0.16, 2.5, 0.16, { colour: WHITE_FRAME });
      sink.member('structureWood', facePoint(f, du, 2.42, 1.5), facePoint(f, du * 0.55, 2.92, 1.5), 0.07, 0.07, f.out, { colour: WHITE_FRAME, decor: true, exposed: true }, 0.035);
    }
    faceBox(sink, 'structureWood', f, 0, 2.96, 1.5, 2.3, 0.12, 0.14, { colour: shade(WHITE_FRAME, 0.9), decor: true });
    const canopy: RoofSpec = { kind: 'gable', pitchDeg: 24, eave: 0.15, verge: 0.1, thickness: 0.08, bucket: 'roof', ridge: null };
    sink.placed(Math.PI / 2, 0, 0, D / 2 + 0.85, () => emitRoof(sink, roofGeometry(1.8, 2.6, 2.9, canopy), canopy));
    faceBox(sink, 'structureWood', f, 0, 3.0, 0.03, 2.6, 0.55, 0.04, { colour: school ? rgb(0x8a2e26) : st.paint, decor: true });
    // (dome-detail-275) the pediment over the entrance bay: a gable of the walls' masonry raised over the eave, under a
    // little gable of sheet run back into the hip; a star on a roundel in it (the club) or a round window (the school)
    const fw = Math.min(4.4, W * 0.46), fp: RoofSpec = { kind: 'gable', pitchDeg: 30, eave: 0.22, verge: 0.28, thickness: 0.1, bucket: 'roof', ridge: 'saddle', decor: true, relief: SHIFER };
    const frise = (fw / 2) * Math.tan(Math.PI / 6), Lf = (frise + 0.2) / rg.tanP + 0.3;
    const fg = roofGeometry(fw, Lf, eave, fp);
    sink.placed(0, 0, 0, D / 2 - Lf / 2, () => emitRoof(sink, fg, fp));
    sink.prism(wall, fg.gable!.map(([u, y]): Vec3 => [u, y, D / 2 - 0.4]), [0, 0, 1], 0.4, { decor: true });
    const ry = eave + frise * 0.42;
    sink.cylinder(wall, [0, ry, D / 2], 'z', 0.05, 0.4, 20, { decor: true, shade: 1.06 });
    if (school) {
      sink.cylinder('dark', [0, ry, D / 2 + 0.02], 'z', 0.05, 0.29, 20, { decor: true });
      faceBox(sink, 'structureWood', f, 0, ry, 0.08, 0.6, 0.045, 0.02, { decor: true, fine: 'near', colour: WHITE_FRAME });
      faceBox(sink, 'structureWood', f, 0, ry, 0.08, 0.045, 0.6, 0.02, { decor: true, fine: 'near', colour: WHITE_FRAME });
    } else {
      sink.cylinder('plaster', [0, ry, D / 2 + 0.02], 'z', 0.05, 0.33, 20, { decor: true, shade: 0.92 });
      star(sink, f, 0, ry, 0.27, 0.07, rgb(0xa8302a));
    }
    const fKeep: SlopeKeep = { side: 1, end: true, v0: -1, v1: (Lf + 0.6) / Math.cos(Math.atan(rg.tanP)), t0: -fw / 2 - 0.45, t1: fw / 2 + 0.45 };
    // (dome-detail-275) a slukhovoe okno on each long slope, the sheet in its courses round them
    const zd = (look() - 0.5) * Math.max(0, rg.ridgeHalf * 2 - 0.4);
    const vents = ([1, -1] as const).map((side) => ventDormer(sink, rg, frame.spec.roof, side, side * zd, 1.2, 0.68, shade(PLANK, 1.1)));
    shiferSheets(sink, frame, look, [fKeep, ...vents]);
    const b = frame.bodies[0];
    // (dome-detail-275) the benches either side of the porch; the cellar's vents through the plinth; the brick apron
    for (const s of [-1, 1]) bench(sink, f, s * 2.35, 1.5, wood);
    for (const name of ['left', 'right', 'back'] as const) {
      const face = frame.faces[name], half = face.width / 2;
      for (const u of name === 'back' ? [(look() - 0.5) * half] : [-half * 0.55 + (look() - 0.5) * 0.6, half * 0.5 + (look() - 0.5) * 0.6]) {
        faceBox(sink, 'dark', face, u, 0.26, 0.064, 0.26, 0.16, 0.01, { decor: true, fine: 'near' });
      }
    }
    const ax = b.x1 + 0.06, az = b.z1 + 0.06, aw = 0.5;
    for (const sz of [-1, 1]) sink.span('stone', -ax - aw, -0.05, sz > 0 ? az : -az - aw, ax + aw, 0.03, sz > 0 ? az + aw : -az, { decor: true, shade: 0.62 });
    for (const sx of [-1, 1]) sink.span('stone', sx > 0 ? ax : -ax - aw, -0.05, -az, sx > 0 ? ax + aw : -ax, 0.03, az, { decor: true, shade: 0.62 });
    // (dome-detail-275) at the front's corner the club's loudspeaker on its bracket, the school's flag on its staff
    const cu = (look() < 0.5 ? -1 : 1) * (f.width / 2 - 0.45), cy = eave - 0.55, grey = rgb(0x8a8f8c);
    if (school) {
      const a = facePoint(f, cu, cy, 0), tip = facePoint(f, cu, cy + 0.85, 0.85);
      sink.member('structureWood', a, tip, 0.045, 0.045, [Math.sign(cu), 0, 0], { colour: shade(PLANK, 1.2), decor: true, exposed: true }, 0);
      const at = (k: number, dy: number): Vec3 => [a[0] + (tip[0] - a[0]) * k, a[1] + (tip[1] - a[1]) * k + dy, a[2] + (tip[2] - a[2]) * k];
      orientedPrism(sink, 'structureMetal', [at(0.5, 0), at(0.97, 0), at(0.97, -0.62), at(0.5, -0.62)], [-Math.sign(cu), 0, 0], 0.012, { colour: rgb(0xa8302a), decor: true });
    } else {
      const p = facePoint(f, cu, cy, 0);
      sink.member('structureMetal', p, [p[0], p[1], p[2] + 0.55], 0.05, 0.05, [0, 1, 0], { colour: grey, decor: true, exposed: true }, 0);
      sink.cylinder('structureMetal', [p[0], p[1] - 0.1, p[2] + 0.38], 'y', 0.12, 0.03, 6, { colour: grey, decor: true });
      sink.cylinder('structureMetal', [p[0], p[1] - 0.16, p[2] + 0.3], 'z', 0.16, 0.09, 10, { colour: grey, decor: true });
      sink.cylinder('structureMetal', [p[0], p[1] - 0.16, p[2] + 0.45], 'z', 0.5, 0.07, 14, { colour: grey, decor: true }, 0.27);
    }
    if (facadeOn()) {
      // the club's masonry (facade craft): a cornice round the eaves, corner pilasters, a water table over the plinth,
      // lintels over the windows (in brick on the school, brows of render on the club)
      trimRing(sink, wall, b, frame.eaveY - 0.26, [{ h: 0.12, out: 0.06 }, { h: 0.14, out: 0.16 }]);
      trimRing(sink, wall, b, b.y0, [{ h: 0.08, out: 0.045 }]);
      for (const name of ['front', 'right', 'back', 'left'] as const) {
        const face = frame.faces[name], half = face.width / 2;
        for (const u of [-half + 0.25, half - 0.25]) pilaster(sink, wall, face, u, b.y0 + 0.08, frame.eaveY - 0.3, 0.5, 0.06);
        for (const o of frame.spec.openings) {
          if (o.face !== name || o.kind !== 'window' || o.state) continue;
          const y = b.y0 + o.y0 + o.h + (school ? 0 : 0.2);
          if (school) windowHead(sink, face, o.u, y, o.w, { kind: 'segment', bucket: 'stone', h: 0.1, out: 0.04, ext: 0.08, rise: 0.1 });
          else windowHead(sink, face, o.u, y, o.w + 0.24, { kind: 'hood', bucket: 'plaster', h: 0.16, out: 0.09, ext: 0.03 });
        }
      }
    }
  });
  return sink.finish();
}

/** The burnt khata's char, its ash, the rust and iron of what was left in it (dome-detail-275). */
const CHAR = rgb(0x2e2925), ASH = rgb(0x6b665e), RUST = rgb(0x5a3828), IRON = rgb(0x2e3032);

/**
 * The burnt khata: the Russian stove and its chimney standing in the clay stubs of the walls.
 * (dome-detail-275, wave 2: "a lone chimney box and stumps on a slab") A khata after the fighting of July 1943, as the
 * burnt villages round Prokhorovka stood: the brick plinth's ring with its dark clay band scorched and broken, the floor
 * inside deep in ash; the clay walls (daub on a timber frame) fallen to stubs of their own heights, their heads scorched
 * black and the charred wattle standing out of them, one corner still standing to the old wall plate with a window's
 * jamb and a blue shutter hung askew from it; the frame's charred posts at the corners and the door, the threshold and
 * its step; in the back corner the whitewashed Russian stove (pech'), its arched mouth (chelo) sooted, the ledge
 * (shestok) before it with a cast-iron pot (chugunok) left on it and the oven fork leant by it, the bench (pripechek)
 * along its side and the dark under-oven; the chimney breast over the mouth and the stack up through where the ceiling
 * and the thatch were — whitewashed to the ceiling, scorched where the roof burnt round it, bare brick above, the
 * oversailing course and the iron hood (dymnik) on its brick stubs; the main ceiling beam (matitsa) fallen from the
 * stove across the floor, a sheet of the clay ceiling slid down beside it, two rafters leant on the stack and more lying
 * in the ash; heaps of ash and burnt thatch; the iron bedstead; bricks fallen from the stack's head.
 */
const burnt: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant;
  const W = Math.max(5.0, ctx.info.w - 0.6), D = Math.max(7.0, ctx.info.d - 0.6);
  // hw, hd the plinth's half extents; P0 its top, PT its thickness; WT the clay walls' thickness, set 5 cm in from its face
  const hw = W / 2, hd = D / 2, P0 = 0.45, PT = 0.4, WT = 0.34, IN = 0.05, ix = hw - PT, iz = hd - PT, FL = 0.16;
  // the brick plinth's ring and the clay floor inside it under its ash
  for (const sz of [-1, 1]) sink.span('stone', -hw, -0.3, sz > 0 ? iz : -hd, hw, P0, sz > 0 ? hd : -iz, { shade: 0.7 });
  for (const sx of [-1, 1]) sink.span('stone', sx > 0 ? ix : -hw, -0.3, -iz, sx > 0 ? hw : -ix, P0, iz, { shade: 0.7 });
  sink.span('stone', -ix, -0.3, -iz, ix, FL - 0.04, iz, { shade: 0.45 });
  sink.span('structureWood', -ix, FL - 0.04, -iz, ix, FL, iz, { colour: ASH, decor: true });
  const faces: Record<'front' | 'right' | 'back' | 'left', Face> = {
    front: { origin: [0, 0, hd], u: [1, 0, 0], out: [0, 0, 1], width: W }, right: { origin: [hw, 0, 0], u: [0, 0, -1], out: [1, 0, 0], width: D },
    back: { origin: [0, 0, -hd], u: [-1, 0, 0], out: [0, 0, -1], width: W }, left: { origin: [-hw, 0, 0], u: [0, 0, 1], out: [-1, 0, 0], width: D },
  };
  // the plinth's dark clay band (pryzba), in lengths: scorched, broken off in places to the brick
  const band = pick(look, PRYZBA);
  for (const f of Object.values(faces)) {
    for (let u = -f.width / 2; u < f.width / 2 - 0.1;) {
      const len = Math.min(f.width / 2 - u, 0.8 + look() * 1.6);
      if (look() > 0.22) {
        const yt = P0 - 0.02 - look() * 0.12;
        faceBox(sink, 'plaster', f, u + len / 2, (yt - 0.05) / 2, 0.012, len, yt + 0.05, 0.024, { decor: true, tint: shade(band, 0.55 + look() * 0.3) }, 'ends');
      }
      u += len;
    }
  }
  // the standing corner, the door on the long side away from it, the stove in the back corner across from the door
  const corner = Math.floor(rng() * 4), csx = corner & 1 ? 1 : -1, csz = corner & 2 ? 1 : -1;
  const ds = rng() < 0.5 ? 1 : -1, dz = (rng() - 0.5) * D * 0.3 + D * 0.12;
  const H = 2.05 + rng() * 0.35;
  const cornerU = (name: keyof typeof faces): number | null => {
    if (name === 'front') return csz > 0 ? csx * hw : null;
    if (name === 'back') return csz < 0 ? -csx * hw : null;
    if (name === 'right') return csx > 0 ? -csz * hd : null;
    return csx < 0 ? csz * hd : null;
  };
  const doorU = (name: keyof typeof faces): number | null => (name === (ds > 0 ? 'right' : 'left') ? (ds > 0 ? -dz : dz) : null);
  // the walls' stubs: the long walls run through the corners, the end walls between them; each length its own height,
  // the standing corner's falling away from it; a window's gap in its long wall, the door's gap in the other
  let shutterSet = false;
  for (const name of ['front', 'right', 'back', 'left'] as const) {
    const f = faces[name], long = name === 'left' || name === 'right';
    const half = long ? hd - IN : hw - IN - WT, cu = cornerU(name), du = doorU(name);
    const win = long && cu !== null ? cu - Math.sign(cu) * 1.45 : null;
    // the lengths break at the window's and the door's edges
    const cuts = [...(win !== null ? [win - 0.4, win + 0.4] : []), ...(du !== null ? [du - 0.55, du + 0.55] : [])];
    const fall = 2.4 + look() * 0.4;
    let hPrev = 0.15 + look() * 0.45;
    for (let u = -half; u < half - 0.05;) {
      let len = Math.min(half - u, 0.45 + look() * 0.6);
      if (half - u - len < 0.25) len = half - u;
      for (const c of cuts) if (c > u + 0.03 && c < u + len - 0.03) len = c - u;
      const um = u + len / 2;
      // the head falls away along a length from where the last one broke off, or breaks off itself; the standing corner
      // full height to the plate within a pier's width of it, then falling away
      const stand = (uu: number, h: number): number => (cu === null ? h : Math.max(h, (H - 0.04) * Math.min(1, 1 - Math.max(0, Math.abs(uu - cu) - 0.75) / fall)));
      const atWin = win !== null && Math.abs(um - win) < 0.4, atDoor = du !== null && Math.abs(um - du) < 0.55;
      let h0 = stand(u, look() < 0.35 || atDoor ? (look() < 0.2 ? 0.06 : 0.15 + look() * 0.55) : hPrev);
      let h1 = stand(u + len, look() < 0.15 ? 0.06 + look() * 0.08 : 0.15 + look() * 0.55);
      if (atWin) h0 = h1 = 0.82;
      hPrev = h1;
      if (!atDoor) {
        const lo = Math.min(h0, h1), sc = 0.82 + look() * 0.12, inward: Vec3 = [-f.out[0], 0, -f.out[2]];
        const head = (y0: number, opts: { shadeAt: (p: Vec3) => number }) => orientedPrism(sink, 'plaster',
          [facePoint(f, u, y0, -IN), facePoint(f, u + len, y0, -IN), facePoint(f, u + len, P0 + h1, -IN), facePoint(f, u, P0 + h0, -IN)], inward, WT, opts);
        // the whitewash clean to a hand under the head, the head scorched black where the burning roof fell on it
        if (lo > 0.7) {
          const a = facePoint(f, u, P0, -IN - WT), b = facePoint(f, u + len, P0 + lo - 0.3, -IN);
          sink.span('plaster', Math.min(a[0], b[0]), P0, Math.min(a[2], b[2]), Math.max(a[0], b[0]), b[1], Math.max(a[2], b[2]), { shade: sc });
          head(P0 + lo - 0.3, { shadeAt: (p) => (p[1] > P0 + lo - 0.25 ? 0.3 : sc * 0.8) });
        } else head(P0, { shadeAt: (p) => (p[1] > P0 + 0.04 ? 0.3 + 0.12 * Math.min(1, lo / 0.6) : sc) });
        // the charred wattle standing out of a broken head
        if (lo > 0.2 && lo < 1.6 && look() < 0.3) {
          for (const k of [0.3, 0.62]) {
            const p = facePoint(f, u + len * k, 0, -IN - WT / 2), top = P0 + h0 + (h1 - h0) * k;
            sink.span('structureWood', p[0] - 0.025, top - 0.12, p[2] - 0.025, p[0] + 0.025, top + 0.15 + look() * 0.3, p[2] + 0.025, { colour: CHAR, decor: true, fine: 'near' });
          }
        }
      }
      u += len;
    }
    // the frame's posts at the corners and the door, charred to points of their own heights; the plate on the standing
    // corner's head
    for (const pu of long ? [-hd + IN + WT / 2, hd - IN - WT / 2] : []) {
      const p = facePoint(f, pu, 0, -IN - WT / 2), standing = cu !== null && Math.abs(pu - cu) < 0.6;
      const top = P0 + (standing ? H + 0.05 : 0.6 + look() * 0.9);
      sink.span('structureWood', p[0] - 0.09, P0, p[2] - 0.09, p[0] + 0.09, top, p[2] + 0.09, { colour: shade(CHAR, 0.9 + look() * 0.3), decor: true });
    }
    if (du !== null) {
      // the door's posts either side of its gap, the threshold stone and the step down to the yard
      for (const s of [-1, 1]) {
        const p = facePoint(f, du + s * 0.55, 0, -IN - WT / 2), top = P0 + (s > 0 ? 1.1 : 1.6) + look() * 0.4;
        sink.span('structureWood', p[0] - 0.08, P0, p[2] - 0.08, p[0] + 0.08, top, p[2] + 0.08, { colour: CHAR, decor: true });
      }
      faceBox(sink, 'stone', f, du, P0 + 0.03, -0.2, 1.0, 0.06, 0.34, { decor: true, shade: 0.8 });
      faceBox(sink, 'stone', f, du, 0.11, 0.24, 1.1, 0.22, 0.48, { decor: true, shade: 0.72 });
    }
    if (win !== null && cu !== null) {
      // the window's charred sill and its jamb on the corner's side; the shutter hung askew from its hinge on the pier
      const s = Math.sign(cu), sill = P0 + 0.82;
      faceBox(sink, 'structureWood', f, cu - s * 0.42, P0 + H + 0.01, -IN - WT / 2, 0.8, 0.18, 0.2, { colour: CHAR, decor: true });
      faceBox(sink, 'structureWood', f, win, sill + 0.03, -IN + 0.05, 0.92, 0.06, 0.16, { colour: CHAR, decor: true });
      faceBox(sink, 'structureWood', f, win + s * 0.38, sill + 0.5, -IN - 0.06, 0.1, 1.0, 0.12, { colour: shade(CHAR, 1.2), decor: true });
      if (!shutterSet) {
        shutterSet = true;
        const tilt = (0.1 + look() * 0.16) * -s, hu = win + s * 0.72, hy = sill + 1.0;
        const at = (du2: number, dy: number): Vec3 => facePoint(f, hu + du2 * Math.cos(tilt) - dy * Math.sin(tilt), hy + du2 * Math.sin(tilt) + dy * Math.cos(tilt), -IN + 0.004);
        const paint = shade(pick(look, PAINTS), 0.75);
        orientedPrism(sink, 'structureWood', [at(-0.2, -0.9), at(0.2, -0.9), at(0.2, 0), at(-0.2, 0)], f.out, 0.035, { colour: paint, decor: true });
        for (const dy of [-0.78, -0.12]) {
          orientedPrism(sink, 'structureWood', [at(-0.19, dy - 0.04), at(0.19, dy - 0.04), at(0.19, dy + 0.04), at(-0.19, dy + 0.04)].map((q): Vec3 => [q[0] + f.out[0] * 0.035, q[1], q[2] + f.out[2] * 0.035]),
            f.out, 0.02, { colour: shade(paint, 0.7), decor: true, fine: 'near' });
        }
      }
    }
  }
  // the Russian stove in the back corner across from the door: its body, the under-oven, the ledge before its mouth, the
  // arched mouth sooted, the bench along its side
  const sx = -ds, x0 = sx > 0 ? ix - 2.0 : -ix, x1 = x0 + 2.0, mouthX = sx > 0 ? x0 : x1, mo = -sx;
  const z0 = -iz + 0.02, z1 = z0 + 1.55, zc = (z0 + z1) / 2, sTop = 1.62;
  sink.span('plaster', x0, FL - 0.04, z0, x1, sTop, z1, { shadeAt: (p) => (p[1] > sTop - 0.1 ? 0.62 : 0.9) });
  const sf: Face = { origin: [mouthX, 0, zc], u: [0, 0, -mo], out: [mo, 0, 0], width: 1.55 };
  const reach = (t: number): number => mouthX + mo * t;
  faceBox(sink, 'dark', sf, 0, 0.42, 0.004, 0.62, 0.34, 0.008, { decor: true });
  faceBox(sink, 'plaster', sf, 0, 0.86, 0.13, 1.25, 0.08, 0.26, { decor: true, shade: 0.8 });
  faceSlab(sink, 'dark', sf, [[-0.3, 0.92], [0.3, 0.92], [0.3, 1.18], [0.18, 1.32], [0, 1.36], [-0.18, 1.32], [-0.3, 1.18]], 0.004, 0.008, { decor: true });
  faceSlab(sink, 'plaster', sf, [[-0.42, 1.28], [0.42, 1.28], [0.32, 1.62], [-0.32, 1.62]], 0.002, 0.006, { decor: true, shade: 0.36 });
  sink.span('plaster', Math.min(reach(-1.75), reach(-0.35)), FL - 0.04, z1, Math.max(reach(-1.75), reach(-0.35)), 0.62, z1 + 0.42, { decor: true, shade: 0.78 });
  // the pot left on the ledge and the oven fork leant on the stove's face
  const lp = facePoint(sf, 0.38, 0.9, 0.12);
  sink.cylinder('structureMetal', lp, 'y', 0.2, 0.13, 10, { colour: IRON, decor: true, fine: 'near' }, 0.1);
  {
    const a = facePoint(sf, -0.55, FL, 1.0), b = facePoint(sf, -0.6, 1.5, 0.03);
    sink.member('structureWood', a, b, 0.035, 0.035, [0, 0, 1], { colour: shade(PLANK, 0.7), decor: true, fine: 'near', exposed: true }, 0);
  }
  // the chimney breast over the mouth, the stack up through the ceiling and the thatch: whitewashed to the ceiling,
  // scorched where the roof burnt round it, bare brick over the old ridge, the oversailing course and its iron hood
  const kx = mouthX - mo * 0.45, K = 0.27, T = 5.0 + rng() * 0.6;
  sink.span('plaster', Math.min(kx - mo * 0.4, mouthX), sTop, zc - 0.5, Math.max(kx - mo * 0.4, mouthX), 2.35, zc + 0.5, { shadeAt: (p) => (p[1] > 2.0 ? 0.55 : 0.85) });
  sink.span('plaster', kx - K, 2.35, zc - K, kx + K, 2.6, zc + K, { shade: 0.78 });
  sink.span('plaster', kx - K, 2.6, zc - K, kx + K, 3.45, zc + K, { shadeAt: (p) => (p[1] < 3.0 ? 0.5 : 0.3) });
  sink.span('stone', kx - K, 3.45, zc - K, kx + K, T, zc + K, { shadeAt: (p) => (p[1] < 3.5 ? 0.45 : p[1] > T - 0.05 ? 0.5 : 0.92) });
  sink.span('stone', kx - K - 0.06, T - 0.34, zc - K - 0.06, kx + K + 0.06, T - 0.22, zc + K + 0.06, { decor: true, shade: 0.8 });
  sink.span('stone', kx - K - 0.03, T, zc - K - 0.03, kx + K + 0.03, T + 0.08, zc + K + 0.03, { shade: 0.6 });
  for (const [ex, ez] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
    sink.span('stone', kx + ex * (K - 0.02) - 0.06, T + 0.08, zc + ez * (K - 0.02) - 0.06, kx + ex * (K - 0.02) + 0.06, T + 0.3, zc + ez * (K - 0.02) + 0.06, { decor: true, shade: 0.7 });
  }
  const hood: RoofSpec = { kind: 'gable', pitchDeg: 32, eave: 0.08, verge: 0.06, thickness: 0.025, bucket: 'structureMetal', ridge: null, decor: true };
  sink.placed(0, kx, 0, zc, () => emitRoof(sink, roofGeometry(2 * K, 2 * K, T + 0.3, hood), hood, RUST));
  // the matitsa (the ceiling's main beam) fallen from the stove's top across the floor; a sheet of the clay ceiling slid
  // down by it, its boards' charred edge; two rafters leant on the stack, more lying in the ash
  sink.member('structureWood', [reach(-1.1), sTop, zc + 0.35], [reach(2.6), FL, zc + 1.9 + look() * 0.6], 0.24, 0.22, [0, 1, 0], { colour: CHAR, decor: true, exposed: true });
  {
    const zA = z1 + 0.42, yA = 0.62, zB = Math.min(iz - 0.3, zA + 1.3);
    const xa = reach(-1.6), xb = reach(-0.3), nl = Math.hypot(zB - zA, yA - FL);
    orientedPrism(sink, 'plaster', [[xa, yA, zA], [xb, yA, zA], [xb + mo * 0.15, FL, zB], [xa - mo * 0.1, FL, zB]], [0, (zB - zA) / nl, (yA - FL) / nl], 0.07, { decor: true, shade: 0.42 });
    sink.member('structureWood', [xa - mo * 0.1, FL, zB], [xb + mo * 0.15, FL, zB], 0.1, 0.08, [0, 1, 0], { colour: CHAR, decor: true, exposed: true });
  }
  for (const [dx, dzz] of [[1, 0.25], [0.2, 1]] as const) {
    const top: Vec3 = dzz > 0.5 ? [kx + dx * 0.1, 2.95 + look() * 0.3, zc + K - 0.02] : [kx + mo * (K - 0.02), 3.1 + look() * 0.3, zc + dzz * 0.2];
    const foot: Vec3 = dzz > 0.5 ? [kx + dx * 0.4, FL, Math.min(iz - 0.25, zc + 2.6)] : [reach(2.4), FL, zc + 0.5];
    sink.member('structureWood', foot, top, 0.12, 0.12, [0, 1, 0], { colour: CHAR, decor: true, exposed: true }, 0.04);
  }
  for (let k = 0; k < 3; k++) {
    const a: Vec3 = [(look() - 0.5) * W * 0.55 + ds * 0.6, FL, (look() - 0.2) * D * 0.5], yaw = look() * Math.PI, len = 1.6 + look() * 1.6;
    const lim = (v: number, m: number): number => Math.max(-m, Math.min(m, v));
    sink.member('structureWood', a, [lim(a[0] + Math.cos(yaw) * len, ix - 0.2), FL, lim(a[2] + Math.sin(yaw) * len, iz - 0.2)], 0.13, 0.12, [0, 1, 0], { colour: shade(CHAR, 0.8 + look() * 0.4), decor: true, exposed: true }, 0);
  }
  // the heaps of ash and burnt thatch
  for (let k = 0; k < 4; k++) {
    const c: Vec3 = [ds * (0.4 + look() * (ix - 1.4)), FL - 0.02, (look() - 0.5) * (2 * iz - 2.2) + 0.5];
    mound(sink, c, [1, 0, 0], [0, 0, 1], 0.5 + look() * 0.5, 0.4 + look() * 0.45, 0.18 + look() * 0.22, shade(k % 2 ? ASH : CHAR, 0.9 + look() * 0.4), { decor: true }, look());
  }
  // the iron bedstead in the front corner, its rails and its ends' bars
  {
    const bx = ds * (ix - 0.95), bz = iz - 1.25, bw = 0.45, bl = 0.95, iron = { colour: shade(RUST, 0.9), decor: true, fine: 'near' as const };
    for (const ez of [-1, 1]) {
      const z = bz + ez * bl, th = ez > 0 ? 1.05 : 0.8;
      for (const ex of [-1, 1]) sink.span('structureMetal', bx + ex * bw - 0.02, FL, z - 0.02, bx + ex * bw + 0.02, th, z + 0.02, iron);
      for (const ry of [th - 0.05, 0.38]) sink.span('structureMetal', bx - bw, ry, z - 0.015, bx + bw, ry + 0.04, z + 0.015, iron);
      for (const t of [-0.5, 0, 0.5]) sink.span('structureMetal', bx + t * bw - 0.01, 0.42, z - 0.01, bx + t * bw + 0.01, th - 0.05, z + 0.01, iron);
    }
    for (const ex of [-1, 1]) sink.span('structureMetal', bx + ex * bw - 0.02, 0.38, bz - bl, bx + ex * bw + 0.02, 0.44, bz + bl, iron);
  }
  // the bricks fallen from the stack's head
  for (let k = 0; k < 6; k++) {
    const a = look() * Math.PI * 2, r = 0.5 + look() * 1.2, bxx = kx + Math.cos(a) * r, bzz = zc + Math.sin(a) * r;
    if (Math.abs(bxx) > ix - 0.15 || Math.abs(bzz) > iz - 0.15 || (Math.abs(bxx - (x0 + x1) / 2) < 1.05 && bzz < z1 + 0.45)) continue;
    const along = look() < 0.5;
    sink.span('stone', bxx - (along ? 0.13 : 0.06), FL, bzz - (along ? 0.06 : 0.13), bxx + (along ? 0.13 : 0.06), FL + 0.07, bzz + (along ? 0.06 : 0.13), { decor: true, fine: 'near', shade: 0.6 + look() * 0.3 });
  }
  return sink.finish();
};

const KOLKHOZ_BUILDERS: Readonly<Record<string, RegionalBuilder>> = Object.freeze({
  cottage: (ctx) => khata(ctx),
  farmhouse: (ctx) => khata(ctx, { long: true }),
  barn: korovnik,
  granary: ambar,
  mill: postMill,
  chapel: church,
  tavern: (ctx) => club(ctx),
  schoolhouse: (ctx) => club(ctx, true),
  ruin: burnt,
});

/** the yard's trodden black-earth clay round a khata (facade craft): sRGB 4a3e30 as it should read, over the lime's albedo */
const TRODDEN: Rgb = shade(rgb(0x4a3e30), 1 / 0.54);

/** whitewash: the khatas' lime render, cool and bright (the photo render set stays off); (the maps lane, 2026-10-15; the
 *  blind critics on Verdant v2: High bloom blew the white walls out to glowing blanks) its brightest lime eased in over a
 *  knee at 0.6, so the wash keeps its brushwork and stops short of the bloom's threshold */
const whitewash = (_h: number, s: number, l: number): readonly [number, number, number] => {
  const x = l * 1.28 + 0.12;
  return [0.12, Math.min(1, s * 0.25), Math.min(1, x < 0.6 ? x : 0.6 + (x - 0.6) * 0.35)];
};
/**
 * The render painted as lime-wash brushed over mud plaster, not the plain render's canvas (the facades lane,
 * 2026-10-05; wave 116: the khatas and the church read "a grey stone-chip texture instead of lime-wash"). The blue
 * family shares the cream one's seed: it borrows that relief (props.ts plaster3).
 */
const limewash = (tone: (h: number, s: number, l: number) => readonly [number, number, number], seed: number): SurfaceTone =>
  Object.assign(tone, { paint: { kind: 'limewash' as const, seed } });

export const KOLKHOZ_STYLE: ArchitectureStyle = Object.freeze<ArchitectureStyle>({
  id: 'kolkhoz',
  region: 'Belgorod black-earth steppe (Prokhorovka): whitewashed khatas under thatch, kolkhoz brick and asbestos sheet',
  surfaces: {
    roof: { kind: 'asbestos', tint: [0.60, 0.61, 0.58] },
    stone: { kind: 'brick', tint: [0.60, 0.33, 0.25] },
    sourced: { plaster: false, wood: true },
    tones: {
      plaster: limewash(whitewash, 0x11a1),
      plaster2: limewash((_h, s, l) => [0.11, Math.min(1, s * 0.3), Math.min(1, l * 1.2 + 0.1)], 0x11a2),
      // (2026-10-09, the Verdant gate: the release's blue lime-wash; wave 150's light sky blue was [0.57, s * 0.2 + 0.12,
      // l * 1.18 + 0.14])
      plaster3: limewash((_h, s, l) => [0.58, Math.min(1, s * 0.2 + 0.03), Math.min(1, l * 1.15 + 0.1)], 0x11a2),
      straw: (h, s, l) => [h - 0.01, Math.min(1, s * 0.62), Math.min(1, l * 0.86)],
    },
  },
  builders: KOLKHOZ_BUILDERS,
  // the yards: a wattle fence (pleten) round the vegetable plot (ogorod) and the log granary (ambar), a gate (yards.ts)
  yard: { kinds: ['cottage', 'farmhouse'], fence: 'fencewattle', gate: 'gatewattle', shed: 'granary', shedSize: [4.0, 6.5], garden: true },
  // (round 10) Verdant's khatas keep their foot as it is: the owner's favourite village
  groundCraft: false,
});
