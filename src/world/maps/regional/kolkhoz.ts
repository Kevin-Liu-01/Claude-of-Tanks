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
import { buildHouse, emitRoof, holedBox, leanTo, recordShaft, roofCrown, roofGeometry, windowRhythm, type HoleRect, type HouseDialect, type HouseFrame, type Opening, type RoofSpec } from './house.ts';
import { openBelfry } from './sarajevoParts.ts';
import { doorUnit, gateUnit, windowUnit, type WindowStyle } from './openings.ts';
import { hollyhocks } from './dressing.ts';
import { dentilCornice, facadeOn, facadeRng, faceSlab, paintSurround, pilaster, plinthPaint, ridgeRiders, trimRing, trimRun, windowHead } from './facade.ts';
import type { ArchitectureStyle, RegionalBuildContext, RegionalBuilder, SurfaceTone } from './types.ts';
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
    roof: shifer(26), gableBucket: wall === 'stone' ? 'stone' : 'plaster', openings, chimneys: [], gutters: null, verge: null,
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
      roof: { kind: 'gable', pitchDeg: 38, eave: 0.3, verge: 1.2, thickness: 0.1, bucket: 'roof', ridge: 'saddle' },
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

/** An onion dome on a drum: stacked frustums swelling and narrowing to a gilt cross. */
function onion(sink: PartSink, x: number, y: number, z: number, r: number, colour: Rgb): void {
  const profile = [1.0, 1.18, 1.22, 1.12, 0.9, 0.6, 0.32, 0.14];
  let yy = y;
  for (let k = 0; k + 1 < profile.length; k++) {
    const h = r * 0.34;
    sink.cylinder('structureMetal', [x, yy, z], 'y', h, r * profile[k], 12, { colour }, r * profile[k + 1], k === 0 || k === profile.length - 2);
    yy += h;
  }
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
    roof: { kind: 'gable', pitchDeg: 34, eave: 0.35, verge: 0.2, thickness: 0.1, bucket: 'structureMetal', ridge: null },
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

/** The club or village shop (sel'po): one storey of whitewashed brick under a hipped sheet roof, a porch canopy. */
function club(ctx: RegionalBuildContext, school = false): RegionalParts {
  const sink = new PartSink(uvOffset(ctx));
  const st = stateFor(ctx);
  const W = Math.max(7, Math.min(9.5, ctx.info.w - 0.4)), D = Math.max(10, Math.min(15, ctx.info.d - 2.0));
  const wall: RegionalBucket = school ? 'stone' : 'plaster';
  const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'door', u: 0, w: 1.3, y0: 0, h: 2.3 }];
  for (const face of ['left', 'right'] as const) for (const o of windowRhythm(face, 0, D, { w: school ? 1.25 : 1.0, h: 1.5, sill: 0.95, spacing: school ? 2.2 : 2.6, margin: 1.0 })) openings.push(o);
  for (const o of windowRhythm('front', 0, W, { w: 1.0, h: 1.4, sill: 1.0, spacing: 2.4, margin: 1.0, avoid: [[-1.0, 1.0]] })) openings.push(o);
  // set back so its porch canopy (1.9 m) stays inside the plot
  sink.placed(0, 0, 0, -Math.min(0.75, Math.max(0, (ctx.info.d - D) / 2 - 0.25)), () => {
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: 0.5, out: 0.06, bucket: 'stone' }, storeys: [{ h: 3.3, wall }], roof: shifer(26, 'hip'), gableBucket: wall,
      openings, chimneys: [{ x: 0.9, z: -D * 0.2, sx: 0.55, sz: 0.55, above: 0.8, bucket: 'stone', cap: 'slab' }], gutters: null, verge: null,
    }, dialect({ ...st, window: { ...st.window, shutters: null, surround: school ? null : st.window.surround } }));
    // the porch canopy on two posts and its sign board
    const f = frame.faces.front;
    for (const du of [-1.0, 1.0]) faceBox(sink, 'structureWood', f, du, 1.45, 1.5, 0.14, 2.9, 0.14, { colour: WHITE_FRAME });
    const canopy: RoofSpec = { kind: 'gable', pitchDeg: 24, eave: 0.15, verge: 0.1, thickness: 0.08, bucket: 'roof', ridge: null };
    sink.placed(Math.PI / 2, 0, 0, D / 2 + 0.85, () => emitRoof(sink, roofGeometry(1.8, 2.6, 2.9, canopy), canopy));
    faceBox(sink, 'structureWood', f, 0, 3.0, 0.03, 2.6, 0.55, 0.04, { colour: school ? rgb(0x8a2e26) : st.paint, decor: true });
    if (facadeOn()) {
      // the club's masonry (facade craft): a cornice round the eaves, corner pilasters, a water table over the plinth,
      // lintels over the windows (in brick on the school, brows of render on the club)
      const b = frame.bodies[0];
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

/** The burnt khata: the stove and its chimney standing in the black stubs of the walls. */
const burnt: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const W = Math.max(5.0, ctx.info.w - 0.6), D = Math.max(7.0, ctx.info.d - 0.6);
  const char = rgb(0x2e2925);
  sink.span('stone', -W / 2, -0.3, -D / 2, W / 2, 0.42, D / 2);
  // the stove block and its whitewashed chimney stack, scorched
  sink.span('plaster', -0.9, 0.42, -0.6, 0.6, 1.9, 0.9);
  sink.span('plaster', -0.45, 1.9, -0.1, 0.15, 5.2 + rng() * 0.6, 0.5);
  sink.span('stone', -0.55, 5.2, -0.2, 0.25, 5.35, 0.6);
  // charred wall stubs and fallen beams
  for (let k = 0; k < 8; k++) {
    const side = k % 4, t = rng();
    const h = 0.4 + rng() * 1.1;
    const x = side < 2 ? (side === 0 ? -1 : 1) * (W / 2 - 0.15) : (t - 0.5) * W * 0.8;
    const z = side < 2 ? (t - 0.5) * D * 0.8 : (side === 2 ? -1 : 1) * (D / 2 - 0.15);
    sink.span('structureWood', x - 0.12, 0.4, z - 0.12, x + 0.12, 0.4 + h, z + 0.12, { colour: char });
  }
  // the fallen beams (the connectivity sweep: they lay 8 cm over the floor): one end on the floor, the other up on a
  // charred stub of the frame
  for (let k = 0; k < 4; k++) {
    const a: Vec3 = [(rng() - 0.5) * W, 0.42, (rng() - 0.5) * D], b: Vec3 = [a[0] + (rng() - 0.5) * 3, 0.42 + rng() * 0.7, a[2] + (rng() - 0.5) * 3];
    sink.member('structureWood', a, b, 0.16, 0.16, [0, 1, 0], { colour: char, decor: true, exposed: true });
    if (b[1] > 0.5) sink.span('structureWood', b[0] - 0.09, 0.4, b[2] - 0.09, b[0] + 0.09, b[1] + 0.02, b[2] + 0.09, { colour: char, decor: true });
  }
  return sink.finish();
};

export const KOLKHOZ_BUILDERS: Readonly<Record<string, RegionalBuilder>> = Object.freeze({
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
