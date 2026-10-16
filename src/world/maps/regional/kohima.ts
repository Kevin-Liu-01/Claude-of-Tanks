// src/world/maps/regional/kohima.ts — the Naga Hills kit (Monsoon Ridge: Kohima, April–June 1944). The hill station's
// colonial bungalows of whitewashed timber and plaster on stone plinths under corrugated iron painted red or green, with
// deep verandas; the bazaar's timber shops under sheet roofs; the mission church of rough stone under a red tin roof;
// Angami Naga houses with low plank walls and great thatched roofs that sweep near the ground, crossed gable horns over
// the front; bamboo granaries on posts; and the battle's shells — bungalows broken to their plinths and chimneys.
import { PartSink, alongPlot, faceBox, facePoint, pick, plotAxes, rgb, shade, type Face, type RegionalParts, type Rgb } from './geometry.ts';
import {
  buildHouse, closeGables, emitRoof, holedBox, holedPolygon, recordBody, recordShaft, roofCrown, roofGeometry, windowRhythm, type HouseDialect, type Opening, type RoofSpec,
} from './house.ts';
import { doorUnit, freeBox, openShop, windowUnit, type WindowStyle } from './openings.ts';
import { BAMBOO_MAT, WEATHERED_PLANK, boardWall, stilts, veranda } from './vernacular.ts';
import { ruinHouse, type RuinHead } from './ruinGrammar.ts';
import type { ArchitectureStyle, RegionalBuildContext, RegionalBuilder } from './types.ts';

const TIN: readonly Rgb[] = [0x8a3a2e, 0x7a3428, 0x4f6a4a, 0x5a7a52].map(rgb);
const WHITE = rgb(0xd4cfc2), GREEN_TRIM = rgb(0x3f5f46);

function uvOffset(ctx: RegionalBuildContext): [number, number] {
  return [ctx.rng() * 7.31, ctx.rng() * 5.17];
}

const tin = (pitch: number, kind: RoofSpec['kind'] = 'gable'): RoofSpec => ({ kind, pitchDeg: pitch, eave: 0.6, verge: 0.6, thickness: 0.06, bucket: 'structureMetal', ridge: 'saddle' });

/** The bungalow: whitewash on a stone plinth, a hipped tin roof, a veranda on two sides, a stack. */
const bungalow: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  // the body set back from the plot's +z and -x sides by its two verandas' depth, so the verandas stay inside the plot
  const V = 2.2, W = Math.max(6, Math.min(11, ctx.info.w - 0.6 - V)), D = Math.max(7, Math.min(13, ctx.info.d - 0.6 - V));
  const roofColour = pick(rng, TIN);
  const style: WindowStyle = { frame: GREEN_TRIM, frameWidth: 0.07, frameOut: 0.05, bars: 'six', surround: null, sill: { bucket: 'plaster', out: 0.06 }, shutters: { colour: GREEN_TRIM, kind: 'louvred', closed: 0.2 } };
  const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'door', u: 0, w: 1.3, y0: 0, h: 2.4 }];
  for (const face of ['front', 'left', 'right', 'back'] as const) {
    for (const o of windowRhythm(face, 0, face === 'front' || face === 'back' ? W : D, { w: 1.0, h: 1.5, sill: 0.8, spacing: 2.4, margin: 1.0, avoid: face === 'front' ? [[-1.0, 1.0]] : [] })) openings.push(o);
  }
  const dialect: HouseDialect = {
    window: (s, face, o, y0) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, style, rng, 0.45),
    door: (s, face, o, y0) => doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { leaf: GREEN_TRIM, frame: { bucket: 'structureWood', width: 0.1, out: 0.05, colour: WHITE }, transom: true, steps: { bucket: 'stone' }, leafKind: 'glazed' }, y0 + o.y0),
  };
  sink.placed(0, V / 2, 0, -V / 2, () => {
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: 0.75, out: 0.1, bucket: 'stone' }, storeys: [{ h: 3.3, wall: 'plaster' }],
      roof: tin(28, 'hip'), roofColour, gableBucket: 'plaster', openings,
      chimneys: [{ x: -W * 0.25, z: -D * 0.2, sx: 0.65, sz: 0.65, above: 0.9, bucket: 'stone', cap: 'slab' }], gutters: null, verge: null,
      // Assam-type walls: lime plaster on split-bamboo ekra between timber posts, no masonry under it to show
      spall: null,
    }, dialect);
    veranda(sink, frame.faces.front, 0.75, frame.eaveY - 0.2, W, V, WHITE, { bucket: 'structureMetal', colour: roofColour });
    veranda(sink, frame.faces.left, 0.75, frame.eaveY - 0.2, D, V, WHITE, { bucket: 'structureMetal', colour: roofColour });
  });
  return sink.finish();
};

/** A board wall's runs on a face, broken at its openings (each [u0, u1] cleared by 5 cm). */
function boardRuns(sink: PartSink, face: Face, y0: number, y1: number, colour: Rgb, gaps: ReadonlyArray<readonly [number, number]>): void {
  let u = -face.width / 2 + 0.05;
  for (const [g0, g1] of [...gaps].sort((p, q) => p[0] - q[0])) {
    if (g0 - 0.05 > u + 0.2) boardWall(sink, face, u, g0 - 0.05, y0, y1, colour);
    u = Math.max(u, g1 + 0.05);
  }
  if (face.width / 2 - 0.05 > u + 0.2) boardWall(sink, face, u, face.width / 2 - 0.05, y0, y1, colour);
}

/**
 * One shop: a Kohima bazaar shop of 1944 (props census #29, lane B 2026-10-15; the judges: "a plank-print box with a painted
 * dark opening and a flat board", the owner's counter-example). A timber frame on stone pads: the sole plates on the
 * pads, posts at the corners and the jambs, the wall plate round their heads, braces in the corners; board walls between
 * them (each board panel cut by its openings, its inside a room: house.ts holedPolygon with backs); the raised plank floor.
 * Its front open as the shop (openings.ts openShop: the counter, the shelves and their goods behind it, the shutter
 * boards hinged up from the head and propped on two poles as the awning, `awning` deep); a back door and a shuttered side
 * window; the tin roof on its gable ends with the rafter feet under the eaves; a signboard over the front, sacks and
 * baskets out before it. The shop is a house body for the damage (recordBody).
 */
function shop(sink: PartSink, ctx: RegionalBuildContext, x: number, W: number, D: number, awning: number): void {
  const rng = ctx.rng, look = ctx.variant, mobile = ctx.tier === 'mobile';
  const plank = pick(rng, WEATHERED_PLANK), roofColour = pick(rng, TIN), frameC = shade(plank, 0.62);
  const F = 0.45, H = 2.75, t = 0.06, top = F + H;
  const front = W - 1.2, shopH = 2.2, doorU = W * 0.2;
  sink.placed(0, x, 0, 0, () => {
    const timber = { colour: frameC };
    // the stone pads, the sole plates on them, the raised plank floor
    const nx = Math.max(2, Math.round(W / 2.0) + 1), nz = Math.max(2, Math.round(D / 2.0) + 1);
    const posts: Array<[number, number]> = [];
    for (let i = 0; i < nx; i++) for (let k = 0; k < nz; k++) {
      if (i > 0 && i < nx - 1 && k > 0 && k < nz - 1) continue;
      posts.push([-W / 2 + 0.07 + (W - 0.14) * i / (nx - 1), -D / 2 + 0.07 + (D - 0.14) * k / (nz - 1)]);
    }
    for (const [px, pz] of posts) sink.span('stone', px - 0.2, -0.3, pz - 0.2, px + 0.2, 0.2, pz + 0.2);
    sink.span('structureWood', -W / 2, 0.2, -D / 2, W / 2, F - 0.08, -D / 2 + 0.14, timber);
    sink.span('structureWood', -W / 2, 0.2, D / 2 - 0.14, W / 2, F - 0.08, D / 2, timber);
    sink.span('structureWood', -W / 2, 0.2, -D / 2 + 0.14, -W / 2 + 0.14, F - 0.08, D / 2 - 0.14, timber);
    sink.span('structureWood', W / 2 - 0.14, 0.2, -D / 2 + 0.14, W / 2, F - 0.08, D / 2 - 0.14, timber);
    sink.span('structureWood', -W / 2 + 0.14, F - 0.08, -D / 2 + 0.14, W / 2 - 0.14, F, D / 2 - 0.14, { colour: shade(plank, 0.8) });
    // the board walls, each cut by its openings, their insides the shop's
    const faces = {
      front: { origin: [0, 0, D / 2], u: [1, 0, 0], out: [0, 0, 1], width: W } as Face,
      right: { origin: [W / 2, 0, 0], u: [0, 0, -1], out: [1, 0, 0], width: D } as Face,
      back: { origin: [0, 0, -D / 2], u: [-1, 0, 0], out: [0, 0, -1], width: W } as Face,
      left: { origin: [-W / 2, 0, 0], u: [0, 0, 1], out: [-1, 0, 0], width: D } as Face,
    };
    const winU = (look() - 0.5) * (D - 2.4);
    const holes = {
      front: [{ u0: -front / 2, u1: front / 2, y0: F, y1: F + shopH }],
      back: [{ u0: doorU - 0.43, u1: doorU + 0.43, y0: F, y1: F + 2.0 }],
      right: [{ u0: winU - 0.4, u1: winU + 0.4, y0: F + 0.95, y1: F + 1.75 }],
      left: [] as Array<{ u0: number; u1: number; y0: number; y1: number }>,
    };
    const wallC = { colour: shade(plank, 0.9) };
    for (const name of ['front', 'right', 'back', 'left'] as const) {
      const f = faces[name], half = f.width / 2 - (name === 'right' || name === 'left' ? t : 0);
      holedPolygon(sink, 'structureWood', f, [[-half, F], [half, F], [half, top], [-half, top]], holes[name], t, 0, wallC, [], [], true);
    }
    // the frame over the boards: the posts at the corners and the jambs, the wall plate, the braces in the corners
    const fr = { colour: frameC, decor: true, fineSides: true } as const;
    for (const name of ['front', 'right', 'back', 'left'] as const) {
      const f = faces[name], half = f.width / 2;
      const at = [-half + 0.07, half - 0.07, ...holes[name].flatMap((h) => [h.u0 - 0.06, h.u1 + 0.06])];
      for (const u of at) faceBox(sink, 'structureWood', f, u, (F + top) / 2, 0.04, 0.12, H, 0.08, fr, 'caps');
      faceBox(sink, 'structureWood', f, 0, top - 0.07, 0.045, f.width, 0.14, 0.09, fr, 'ends');
      if (!mobile && name !== 'front') for (const s of [-1, 1]) {
        const a = facePoint(f, s * (half - 0.13), F + 0.15, 0.03), b = facePoint(f, s * (half - 0.95), top - 0.2, 0.03);
        sink.member('structureWood', a, b, 0.09, 0.05, f.out, { colour: frameC, decor: true }, 0);
      }
    }
    if (!mobile) {
      boardRuns(sink, faces.back, F + 0.05, top - 0.15, plank, [[doorU - 0.55, doorU + 0.55]]);
      boardRuns(sink, faces.left, F + 0.05, top - 0.15, plank, []);
    }
    // the tin roof on its closed gables, the rafter feet under the eaves
    const roof = tin(26), rg = roofGeometry(W, D, top, roof);
    emitRoof(sink, rg, roof, roofColour);
    closeGables(sink, rg, 'structureWood', { colour: shade(plank, 0.85) });
    // the rafter feet under the eaves, down the slope from the wall plate
    if (!mobile) {
      const tanP = Math.tan(26 * Math.PI / 180);
      for (const f of [faces.right, faces.left]) {
        for (let k = 0; k < Math.round(D / 0.9); k++) {
          const u = -D / 2 + 0.45 + k * 0.9, a = facePoint(f, u, top - 0.03, 0), b = facePoint(f, u, top - 0.03 - 0.52 * tanP, 0.52);
          sink.member('structureWood', a, b, 0.06, 0.08, [-f.out[0] * Math.sin(Math.atan(tanP)), Math.cos(Math.atan(tanP)), -f.out[2] * Math.sin(Math.atan(tanP))],
            { colour: frameC, decor: true, fine: true, exposed: true }, 0.08);
        }
      }
    }
    // the shop: its counter, shelves and goods, the shutter boards propped up as the awning
    openShop(sink, faces.front, 0, F, front, shopH, { wall: t, depth: D - 2 * t, width: W - 2 * t, height: H },
      { timber: shade(plank, 1.0), shutters: { colour: shade(plank, 1.08), mode: look() < 0.15 ? 'stacked' : 'propped' }, goods: BAZAAR_GOODS }, look);
    faceBox(sink, 'structureWood', faces.front, 0, F + shopH + 0.24, 0.03, Math.min(front, 2.6), 0.36, 0.04, { colour: pick(look, SIGNS), decor: true });
    // the steps up to the floor, the sacks and the baskets out before the shop
    freeBox(sink, 'stone', faces.front, (look() - 0.5) * (front - 1.2), 0.1, 0.25, 1.1, 0.3, 0.5, { decor: true });
    sink.dressing(mobile, () => {
      for (let k = 0; k < 4; k++) {
        const u = (look() - 0.5) * (W - 0.8), o = 0.45 + look() * Math.max(0.2, awning - 0.6);
        const p = facePoint(faces.front, u, 0, o);
        if (look() < 0.5) sink.cylinder('structureWood', [p[0], -0.02, p[2]], 'y', 0.42, 0.24, 8, { colour: rgb(0x9a7a4a), decor: true, fine: true }, 0.3, true);
        else faceBox(sink, 'structureWood', faces.front, u, 0.24, o, 0.45, 0.5, 0.32, { colour: pick(look, BAZAAR_GOODS), decor: true, fine: true });
      }
    });
    // the back door and the side window's closed plank shutters, in their boards' thickness (whole boxes: the shop's inside
    // sees their backs), the door's battens and its steps down to the ground
    const leafC = { colour: shade(plank, 0.75), decor: true };
    freeBox(sink, 'structureWood', faces.back, doorU, F + 1.0, -t / 2, 0.84, 1.98, 0.035, leafC);
    for (const y of [F + 0.3, F + 1.7]) faceBox(sink, 'structureWood', faces.back, doorU, y, 0.012, 0.8, 0.1, 0.024, { colour: shade(plank, 0.62), decor: true, fine: true });
    freeBox(sink, 'stone', faces.back, doorU, 0.12, 0.25, 1.1, 0.3, 0.5, { decor: true });
    for (const s of [-1, 1]) freeBox(sink, 'structureWood', faces.right, winU + s * 0.2, F + 1.35, -t / 2, 0.39, 0.78, 0.03, { colour: shade(plank, 0.8), decor: true });
    recordBody(sink, 0, 0, W, D, rg.ridgeTopY, 'structureWood');
  });
}

/** A bazaar's goods: rice and dal sacks, tea, cloth, tins. */
const BAZAAR_GOODS: readonly Rgb[] = [0xc8b88a, 0xa89068, 0x6a7a4a, 0x8a3a2e, 0x3a4a6a, 0xd0c4a0, 0x7a5a3a].map(rgb);
/** The shops' painted signboards. */
const SIGNS: readonly Rgb[] = [0x2f4f6a, 0x7a2e26, 0x3f5f46, 0xc0a040].map(rgb);

/** A bazaar shop: one shop on its plot. */
const bazaarShop: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const W = Math.max(5, Math.min(9, ctx.info.w - 0.6)), D = Math.max(6, Math.min(10, ctx.info.d - 0.6));
  shop(sink, ctx, 0, W, D, 1.3);
  return sink.finish();
};

/**
 * A bazaar row on the base market row's plot (12 x 5.2 m): two or three shops side by side along it under their own
 * tin gables, inside the plot (the single shop it replaces was 6 m deep on a 5.2 m plot).
 */
const bazaarRow: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const L = ctx.info.w - 0.6, D = Math.max(3.8, Math.min(10, ctx.info.d - 1.4));
  const n = Math.max(1, Math.min(3, Math.floor(L / 3.6)));
  const w = L / n - 0.25;
  for (let i = 0; i < n; i++) shop(sink, ctx, -L / 2 + (i + 0.5) * L / n, w, D, 0.9);
  return sink.finish();
};

/** The mission church: rough stone, a steep red tin roof, a timber porch and a small belfry over the gable. */
const church: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const W = Math.max(5.5, Math.min(8, ctx.info.w - 0.4)), D = Math.max(8, Math.min(12, ctx.info.d - 0.4));
  const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'door', u: 0, w: 1.4, y0: 0, h: 2.6 }];
  for (const face of ['left', 'right'] as const) for (const o of windowRhythm(face, 0, D, { w: 0.8, h: 1.9, sill: 1.2, spacing: 2.4, margin: 1.0 })) openings.push(o);
  const dialect: HouseDialect = {
    window: (s, face, o, y0) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { frame: WHITE, frameWidth: 0.06, frameOut: 0.05, bars: 'six', surround: { bucket: 'stone', width: 0.18, out: 0.06, lintel: 0.26 }, sill: { bucket: 'stone', out: 0.1 }, shutters: null }, ctx.rng, 0.3),
    door: (s, face, o, y0) => doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { leaf: rgb(0x6a4b33), frame: { bucket: 'stone', width: 0.22, out: 0.07, arch: true }, steps: { bucket: 'stone' }, leafKind: 'plank' }, y0 + o.y0),
  };
  const roof = { ...tin(48), eave: 0.4, verge: 0.3 };
  const frame = buildHouse(sink, {
    w: W, d: D, plinth: { h: 0.45, out: 0.08, bucket: 'stone' }, storeys: [{ h: 3.8, wall: 'stone' }], roof, roofColour: TIN[0], gableBucket: 'stone',
    openings, chimneys: [], gutters: null, verge: null,
  }, dialect);
  // the belfry: a timber box on the front gable with a pyramid cap and a cross
  const z = D / 2 - 0.6, top = frame.roof.ridgeTopY;
  // (props census #5, lane B 2026-10-15) the belfry's bell opening cut through its front (a dark plate on the box), the
  // bell hung in it from its beam
  // (the belfry a crown of the roof in the house's plan: it falls with its roof section)
  roofCrown(sink, frame, { kind: 'belfry', x0: -1.0, x1: 1.0, z0: z - 1.0, z1: z + 1.0, y0: top - 0.8, y1: top + 3.3, bucket: 'structureWood' }, () => {
    holedBox(sink, 'structureWood', -0.6, z - 0.6, 0.6, z + 0.6, top - 0.8, top + 1.3, { front: [{ u0: -0.3, u1: 0.3, y0: top + 0.2, y1: top + 1.0 }] }, 0.18, 0.14,
      { colour: WHITE });
    sink.cylinder('structureMetal', [0, top + 0.5, z + 0.3], 'y', 0.42, 0.2, 8, { colour: rgb(0x6a5a3a), decor: true }, 0.1);
    sink.cylinder('structureMetal', [0, top + 1.3, z], 'y', 1.3, 1.0, 4, { colour: TIN[0] }, 0.04, true, Math.PI / 4);
    sink.span('structureWood', -0.04, top + 2.5, z - 0.04, 0.04, top + 3.3, z + 0.04, { colour: WHITE, decor: true });
    sink.span('structureWood', -0.25, top + 3.0, z - 0.04, 0.25, top + 3.08, z + 0.04, { colour: WHITE, decor: true });
  });
  return sink.finish();
};

/** The Angami house: low plank walls on a stone terrace, a great thatch sweeping low, crossed horns on the front gable. */
const nagaHouse: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  // the Angami house is long and narrow: on a farmhouse plot (wider than deep) it lies along the plot (plotAxes), its
  // stone platform and the thatch inside it; across the plot (9 m deep) it reached 0.9 m past its +z side
  const plot = plotAxes(ctx.info);
  const W = Math.max(5.6, Math.min(8, plot.w - (plot.turned ? 2.0 : 1.6))), D = Math.max(7, Math.min(14, plot.d - (plot.turned ? 2.2 : 0.4)));
  const plank = pick(rng, WEATHERED_PLANK);
  // (props census BS-3, lane B 2026-10-14: its walls a span box with the door laid on; 334 triangles, 1.2 a m² of wall)
  // the house grammar's plank walls on the stone terrace, the door cut low in the front and a shuttered hatch in a side,
  // the thatch sweeping low over them with the front gable boarded under it; the boards run between the openings
  const du = -W * 0.15;
  const openings: Opening[] = [
    { face: 'front', storey: 0, kind: 'door', u: du, w: 0.8, y0: 0, h: 1.6 },
    { face: 'right', storey: 0, kind: 'window', u: D * 0.18, w: 0.55, y0: 0.75, h: 0.45 },
  ];
  const dialect: HouseDialect = {
    window: (s2, face, o, y0) => windowUnit(s2, face, o.u, y0 + o.y0, o.w, o.h, { frame: shade(plank, 0.7), frameWidth: 0.06, frameOut: 0.03, bars: 'none', surround: null, sill: null,
      shutters: { colour: shade(plank, 0.8), kind: 'plank', closed: 0.6 } }, rng, 0.2),
    door: (s2, face, o, y0) => doorUnit(s2, face, o.u, y0 + o.y0, o.w, o.h, { leaf: shade(plank, 0.75), frame: { bucket: 'structureWood', width: 0.12, out: 0.06, colour: shade(plank, 0.7) }, steps: { bucket: 'stone' }, leafKind: 'plank' }, y0 + o.y0),
  };
  // the thatch: steep, deep eaves sweeping down to near a metre off the ground
  const roof: RoofSpec = { kind: 'gable', pitchDeg: 52, eave: plot.turned ? 0.9 : 1.3, verge: plot.turned ? 0.7 : 0.9, thickness: 0.4, bucket: 'straw', ridge: 'round', thatch: 'rows' };
  alongPlot(sink, plot.turned, () => {
    sink.paint = shade(plank, 0.9);
    let frame;
    try {
      frame = buildHouse(sink, {
        w: W, d: D, plinth: { h: 0.5, out: 0.8, bucket: 'stone' }, storeys: [{ h: 1.7, wall: 'structureWood' }], roof, gableBucket: 'structureWood',
        openings, chimneys: [], gutters: null, verge: null, reveal: 0.1, spall: null,
      }, dialect);
      if (ctx.tier !== 'mobile') {
        const y0 = frame.floors[0] + 0.05, y1 = frame.eaveY - 0.05;
        boardRuns(sink, frame.faces.front, y0, y1, plank, [[du - 0.4, du + 0.4]]);
        boardRuns(sink, frame.faces.right, y0, y1, plank, [[D * 0.18 - 0.28, D * 0.18 + 0.28]]);
        boardRuns(sink, frame.faces.back, y0, y1, plank, []);
        boardRuns(sink, frame.faces.left, y0, y1, plank, []);
      }
    } finally { sink.paint = null; }
    // the crossed horns (kika) over the front gable
    const z = D / 2 + roof.verge - 0.1, apex = frame.roof.ridgeTopY;
    for (const side of [-1, 1]) {
      // (the connectivity sweep) the horns are the bargeboards run on up past the apex: each from down the verge, on the
      // thatch, so the pair cross in their heads' last third
      sink.member('structureWood', [side * 1.48, apex - 1.96, z], [-side * 0.55, apex + 1.4, z], 0.22, 0.12, [0, 0, 1], { colour: rgb(0x5a4636), decor: true, exposed: true });
    }
  });
  return sink.finish();
};

/** A bamboo granary on posts under a small thatch. */
const granary: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const W = Math.max(2.8, Math.min(4, ctx.info.w - 1)), D = Math.max(3.2, Math.min(5, ctx.info.d - 1.5));
  stilts(sink, W, D, 1.0, rgb(0x6a5a46), { brace: false });
  sink.span('structureWood', -W / 2 + 0.05, 1.16, -D / 2 + 0.05, W / 2 - 0.05, 2.9, D / 2 - 0.05, { colour: BAMBOO_MAT });
  const roof: RoofSpec = { kind: 'gable', pitchDeg: 48, eave: 0.5, verge: 0.4, thickness: 0.3, bucket: 'straw', ridge: 'round', thatch: 'rows' };
  const rg = roofGeometry(W, D, 2.9, roof);
  emitRoof(sink, rg, roof);
  // (the integrity check, 2026-10-12: sky through the thatch's open ends) the gables in the bin's bamboo mat
  closeGables(sink, rg, 'structureWood', { colour: BAMBOO_MAT });
  return sink.finish();
};

/** A shelled bungalow: the plinth, a standing chimney stack, wall stubs, the tin roof down in sheets. */
const shelled: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant;
  const W = Math.max(6, ctx.info.w - 0.6), D = Math.max(7, ctx.info.d - 0.6);
  // (props census #7, lane B 2026-10-14; the judges: "seven plaster posts on a plinth box, the sheets as slabs on cones")
  // the ruin grammar: the bungalow's own rendered walls on its high plinth broken low, its door and windows cut through
  // where they still stand, the chimney stack standing with its firebox, the tin roof down in its sheets over the heaps
  const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'door', u: (rng() - 0.5) * (W - 2.6), w: 1.0, y0: 0, h: 2.1 }];
  for (const face of ['right', 'left'] as const) for (const o of windowRhythm(face, 0, D - 0.6, { w: 1.1, h: 1.2, sill: 0.8, spacing: 2.6, margin: 1.0, max: 2 })) openings.push(o);
  const head = (): RuinHead => ({ a: 0.4 + rng() * 1.8, b: 0.4 + rng() * 1.8, at: rng(), dip: 0.3 + rng() * 0.4, ragged: 0.3 });
  ruinHouse(sink, {
    w: W, d: D, t: 0.3, wall: 'plaster', plinth: { h: 0.75, out: 0.08, bucket: 'stone' }, storeys: [2.8], openings,
    heads: { front: head(), right: head(), back: head(), left: head() }, stub: 0.35,
    lintel: { bucket: 'structureWood', colour: rgb(0x3a2f26) }, roof: { bucket: 'structureMetal', colour: pick(rng, TIN), piece: [1.0, 2.4, 0.02] },
    timber: rgb(0x2e2620), chimney: { x: -W * 0.25, z: -D * 0.2, w: 0.7, h: 4.6 + rng(), bucket: 'stone' }, mobile: ctx.tier === 'mobile',
  }, rng, look);
  return sink.finish();
};

/**
 * The mission bell tower (the base tower plot; gauntlet wave 15 still saw a tiled European steeple there): a rough
 * stone base, a whitewashed timber belfry with louvred openings, a pyramid of painted tin and a cross.
 */
const bellTower: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const S = Math.max(2.8, Math.min(3.6, Math.min(ctx.info.w, ctx.info.d) - 0.3)), H = Math.max(7.5, Math.min(9.4, ctx.info.h));
  const base = H * 0.5, bel = H * 0.82;
  // (props census #5) the base's door and the belfry's four louvred openings cut through them (the leaf and dark
  // plates with their slats were laid on solid spans), the leaf at the back of the door's reveal and the slats across
  // the openings in theirs; the tower recorded as a shaft body
  holedBox(sink, 'stone', -S / 2, -S / 2, S / 2, S / 2, -0.4, base, { front: [{ u0: -0.5, u1: 0.5, y0: 0, y1: 2.1 }] }, 0.35, 0.3);
  recordShaft(sink, 0, 0, S, H + 0.75, 'stone');
  sink.span('stone', -S / 2 - 0.12, base - 0.05, -S / 2 - 0.12, S / 2 + 0.12, base + 0.2, S / 2 + 0.12, { decor: true });
  const T = S - 0.5;
  const lv = { u0: -T * 0.25, u1: T * 0.25, y0: bel - 1.4, y1: bel - 0.3 };
  const bf = holedBox(sink, 'structureWood', -T / 2, -T / 2, T / 2, T / 2, base + 0.2, bel, { front: [lv], right: [lv], back: [lv], left: [lv] }, 0.18, 0.14, { colour: WHITE });
  for (const f of [bf.front, bf.right, bf.back, bf.left]) {
    for (let k = 0; k < 4; k++) faceBox(sink, 'structureWood', f, 0, bel - 1.3 + k * 0.28, -0.07, T * 0.5, 0.05, 0.06, { colour: GREEN_TRIM, decor: true }, 'ends');
  }
  const door: Face = { origin: [0, 0, S / 2], u: [1, 0, 0], out: [0, 0, 1], width: S };
  sink.recess = 0.3;
  try {
    doorUnit(sink, door, 0, 0, 1.0, 2.1, { leaf: rgb(0x6a4b33), frame: { bucket: 'stone', width: 0.2, out: 0.06, arch: true }, steps: { bucket: 'stone' }, leafKind: 'plank' });
  } finally { sink.recess = 0; }
  sink.cylinder('structureMetal', [0, bel, 0], 'y', H - bel, T * 0.78, 4, { colour: TIN[0] }, 0.04, true, Math.PI / 4);
  sink.span('structureWood', -0.04, H - 0.05, -0.04, 0.04, H + 0.75, 0.04, { colour: WHITE, decor: true });
  sink.span('structureWood', -0.24, H + 0.45, -0.04, 0.24, H + 0.53, 0.04, { colour: WHITE, decor: true });
  return sink.finish();
};

/** A bazaar stall (the base market plot): timber posts under a painted tin roof, a plank counter of baskets. */
const bazaarStall: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const W = Math.max(4.5, Math.min(6.4, ctx.info.w - 0.4)), D = Math.max(3.6, Math.min(5.0, ctx.info.d - 0.4));
  const floor = 0.3, back = 2.9, front = 2.35, post = pick(rng, WEATHERED_PLANK);
  sink.span('stone', -W / 2 - 0.2, -0.3, -D / 2 - 0.2, W / 2 + 0.2, floor, D / 2 + 0.2);
  for (const [x, z, h] of [[-1, -1, back], [1, -1, back], [-1, 1, front], [1, 1, front]] as const) {
    sink.span('structureWood', x * (W / 2 - 0.15) - 0.08, floor, z * (D / 2 - 0.15) - 0.08, x * (W / 2 - 0.15) + 0.08, h, z * (D / 2 - 0.15) + 0.08, { colour: post });
  }
  sink.span('structureWood', -W / 2 + 0.1, floor, -D / 2 + 0.08, W / 2 - 0.1, back - 0.12, -D / 2 + 0.18, { colour: shade(post, 0.85) });
  const roof: RoofSpec = { kind: 'shed', pitchDeg: Math.atan2(back - front, D) * 180 / Math.PI, eave: 0.35, verge: 0.3, thickness: 0.05, bucket: 'structureMetal', ridge: null };
  sink.placed(-Math.PI / 2, 0, 0, 0, () => emitRoof(sink, roofGeometry(D, W, front, roof), roof, pick(rng, TIN)));
  sink.span('structureWood', -W / 2 + 0.35, floor, D / 2 - 1.0, W / 2 - 0.35, floor + 0.85, D / 2 - 0.45, { colour: shade(post, 1.1) });
  const produce: readonly Rgb[] = [0x6a8a3a, 0xb0802a, 0x8a3a2a, 0x9a8a5a].map(rgb);
  for (let k = 0; k < 4; k++) {
    const x = -W / 2 + 0.75 + k * (W - 1.5) / 3;
    sink.cylinder('structureWood', [x, floor + 0.85, D / 2 - 0.72], 'y', 0.16, 0.26, 8, { colour: pick(rng, produce), decor: true }, 0.2);
  }
  return sink.finish();
};

export const KOHIMA_BUILDERS: Readonly<Record<string, RegionalBuilder>> = Object.freeze({
  bathhouse: bungalow,
  farmhouse: nagaHouse,
  cornershop: bazaarShop,
  marketRow: bazaarRow,
  depot: bazaarShop,
  chapel: church,
  granary,
  woodshed: granary,
  ruin: shelled,
  // the base plots the first kit left: the steeple and the market stalls (gauntlet wave 15)
  tower: bellTower,
  market: bazaarStall,
});

export const KOHIMA_STYLE: ArchitectureStyle = Object.freeze<ArchitectureStyle>({
  id: 'kohima',
  region: 'Kohima, Naga Hills (1944): colonial bungalows under painted tin, a bazaar, a mission church, Angami thatched houses',
  surfaces: {
    roof: { kind: 'sheet', tint: [0.56, 0.30, 0.24] },
    stone: { kind: 'rubble', tint: [0.55, 0.52, 0.47] },
    sourced: { plaster: false, wood: true },
    // (the facades lane, round 11; waves 319/320: the walls' procedural canvas read as "speckle", "sponge", "cork",
    // "camouflage noise": its 6 cm bumps shade as dots from the street, as Steinburg's did before round 8) the walls
    // painted as the region renders them (regionalSurfaces.ts paintLimewash), every family under the kit's and the map's
    // tones; the plaster photo set is off (its 2.4 m tile repeats a lichen motif down every wall)
    render: { kind: 'limewash', seed: 0x6b0a },
    tones: { straw: (h, s, l) => [h - 0.02, Math.min(1, s * 0.5), Math.min(1, l * 0.8)] },
  },
  builders: KOHIMA_BUILDERS,
  // the Angami yards: a bamboo fence round the vegetable terrace and the granary on posts, an open gap (yards.ts)
  yard: { kinds: ['farmhouse'], fence: 'fencewattle', gate: null, shed: 'granary', shedSize: [4.3, 4.1], garden: true },
});

export type { RegionalParts };
