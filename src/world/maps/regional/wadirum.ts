// src/world/maps/regional/wadirum.ts — the Wadi Rum kit (Redrock Divide: a desert outpost in the Wadi Rum country of
// southern Jordan). Flat-roofed houses of concrete block, bare grey or rendered sand-ochre, with the reinforcing bars of
// the next storey left standing at the corners and black water tanks on the roof, steel doors painted green or blue,
// window grilles; the Desert Patrol's fort, crenellated with corner towers; steel-portal stores and workshops under
// low corrugated roofs instead of tiles; walled compounds of block houses.
import { PartSink, alongPlot, faceBox, facePanel, facePoint, pick, plotAxes, rgb, shade, streamFrom, type EmitOptions, type Face, type RegionalBucket, type RegionalParts, type Rgb, type Vec3 } from './geometry.ts';
import {
  buildHouse, emitRoof, holedBox, holedShaft, layRoofRelief, recordShaft, reliefSlope, roofGeometry, windowRhythm, type HoleRect, type HouseDialect,
  type HouseFrame, type Opening, type ReliefHole, type RoofRelief, type RoofSpec,
} from './house.ts';
import { doorUnit, gateUnit, windowUnit, type WindowStyle } from './openings.ts';
import { ruinHouse, type RuinHead } from './ruinGrammar.ts';
import type { ArchitectureStyle, RegionalBuildContext, RegionalBuilder } from './types.ts';
import { sheetHall } from './hall.ts';
import { finialOn, smoothProfile } from './domes.ts';

const STEEL_DOORS: readonly Rgb[] = [0x3f6a5a, 0x3e5f86, 0x6a6e70, 0x8a6a3e].map(rgb);
const TANK = rgb(0x262626), REBAR = rgb(0x5a3e2e);
const SAND_SHEET: readonly Rgb[] = [0xc8b48e, 0xbcae96, 0xd6ccb4].map(rgb);

function uvOffset(ctx: RegionalBuildContext): [number, number] {
  return [ctx.rng() * 7.31, ctx.rng() * 5.17];
}

/**
 * (dome-detail-275) The roofs in relief (house.ts RoofSpec.relief, layRoofRelief): the stores' and the lorry shelter's
 * corrugated sheet in its lapped courses, a corrugation or two drawn across each sheet; the block houses' and the fort's
 * flat concrete roofs under bitumen felt in rolls with their laps and patches, the screed's gravel stop or the parapet's
 * coping round them.
 */
const SHEET: RoofRelief = { kind: 'sheet', ribs: 2 };
const FELT: RoofRelief = { kind: 'felt' };

/** (dome-detail-275) A gable's covering in relief over the house frame's roof (the ridge along z), its stripped patch open. */
function gableRelief(sink: PartSink, frame: HouseFrame, relief: RoofRelief, base: EmitOptions): void {
  const rg = frame.roof, roof = frame.spec.roof, X = rg.s + roof.eave, Z = rg.halfD + roof.verge;
  const ye = rg.topAt(X, 0) ?? rg.eaveY, yr = rg.topAt(0, 0) ?? rg.ridgeTopY, p = frame.roofPatch;
  const holes: ReliefHole[] = p ? [{ x0: Math.min(p.side * p.x0, p.side * p.x1), x1: Math.max(p.side * p.x0, p.side * p.x1), z0: p.z0, z1: p.z1 }] : [];
  const planes = ([1, -1] as const).map((sx) => reliefSlope([sx * X, ye, -sx * Z], [sx * X, ye, sx * Z], [-sx * X, yr - ye, 0]));
  layRoofRelief(sink, relief, planes, { bucket: roof.bucket, base, holes });
}

/** Rooftop furniture: rebar stubs at the corners and columns, one or two black tanks on a steel stand. */
function rooftop(sink: PartSink, W: number, D: number, top: number, rng: () => number): void {
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1]] as const) {
    if (sx === 0 && rng() < 0.5) continue;
    const x = sx * (W / 2 - 0.2), z = sz * (D / 2 - 0.2);
    for (const [dx, dz] of [[-0.08, -0.08], [0.08, -0.08], [-0.08, 0.08], [0.08, 0.08]]) {
      sink.span('structureWood', x + dx - 0.015, top, z + dz - 0.015, x + dx + 0.015, top + 0.9 + rng() * 0.5, z + dz + 0.015, { colour: REBAR, decor: true });
    }
  }
  const n = rng() < 0.6 ? 1 : 2;
  for (let k = 0; k < n; k++) {
    const x = (k - (n - 1) / 2) * 1.4 + (rng() - 0.5) * W * 0.2, z = (rng() - 0.5) * D * 0.3;
    for (const [dx, dz] of [[-0.45, -0.45], [0.45, -0.45], [-0.45, 0.45], [0.45, 0.45]]) sink.span('structureMetal', x + dx - 0.03, top, z + dz - 0.03, x + dx + 0.03, top + 0.6, z + dz + 0.03, { colour: rgb(0x6a6e70), decor: true });
    // the stand's frame on the legs' heads, the tank on it (the connectivity sweep: the round tank sat inside the
    // square of legs, touching none)
    sink.span('structureMetal', x - 0.48, top + 0.55, z - 0.48, x + 0.48, top + 0.6, z + 0.48, { colour: rgb(0x6a6e70), decor: true });
    sink.cylinder('structureMetal', [x, top + 0.6, z], 'y', 1.1, 0.55, 10, { colour: TANK, decor: true });
  }
}

/**
 * (the maps lane, 2026-10-15, Redrock's blind critics: the shops' fronts were "flat black cut-outs") A shop's open front
 * under its half-raised shutter: the back wall in shade, two display racks of tins, sacks and cartons under the shutter,
 * a crate of produce on the step — the goods from the shop's own stream (the kit's draws are as before); all decor. The opening spans 0.3 to
 * 2.6 m on the face.
 */
const SHOP_GOODS: readonly Rgb[] = [0xc9b48a, 0xb9a072, 0xa8442f, 0x4f7a4a, 0x3f5f8a, 0xc9a23a, 0xdedad0, 0x7a5a3a].map(rgb);
function shopInterior(sink: PartSink, face: Face, u: number, w: number, mobile: boolean, seed: number, reveal = 0, step = 0): void {
  faceBox(sink, 'structureWood', face, u, 1.45, 0.005, w, 2.3, 0.02, { colour: rgb(0x4a4038), decor: true });
  // the display racks stand under the half-drawn shutter (its foot is 1.5 m or more), the goods out on them
  const shelves = [0.55, 1.05];
  for (const y of shelves) faceBox(sink, 'structureWood', face, u, y, 0.17, w - 0.1, 0.04, 0.3, { colour: rgb(0x8a7a66), decor: true });
  sink.dressing(mobile, () => {
    const g = streamFrom(Math.round(seed * 1000) + 977);
    for (const y of shelves) for (let a = u - w / 2 + 0.25; a < u + w / 2 - 0.2; a += 0.32) {
      if (g() < 0.2) continue;
      const h = 0.16 + g() * 0.18;
      faceBox(sink, 'structureWood', face, a, y + 0.02 + h / 2, 0.17, 0.22 + g() * 0.06, h, 0.2, { colour: pick(g, SHOP_GOODS), decor: true });
    }
    // a crate of produce on the step in front (dome-detail-275: out of a cut shop's `reveal`, on its pavement `step` high)
    const a = u + (g() - 0.5) * (w - 0.8);
    faceBox(sink, 'structureWood', face, a, step + 0.2, reveal + 0.45, 0.6, 0.4, 0.45, { colour: rgb(0x9a7a52), decor: true });
    faceBox(sink, 'structureWood', face, a, step + 0.43, reveal + 0.45, 0.52, 0.06, 0.38, { colour: pick(g, [rgb(0xb8452e), rgb(0xc9a23a), rgb(0x5f8a3a)]), decor: true });
  });
}

/**
 * (MAPS 227, Redrock's blind critics on v2: the one loss, at the village's north-east corner looking up at the lane dome,
 * "a featureless olive slab of a house ... blocks a third of the frame and hides the jebel" — two two-storey houses on the
 * back lane, 8 m boxes, stood between the lane and the rock) Rum's second storeys are the main road's: the shops and the
 * flats over them line the valley track, and the compounds of the back lanes and the village's edge are one storey, low
 * enough that the jebels stand over them from inside the village. The kit reads its building's place (ctx.x, ctx.z;
 * types.ts: a form choice inside the plot, the footprint unchanged): its distance across Redrock's valley track (the line
 * through the square at (8, 0) along (0.2334, 0.9724), badlands.ts RUM_U) — the frontage stands 17 m off it, the lanes 36
 * and 55. The draw is the same one, so every other choice in the house draws as before; a bare build keeps the old share.
 */
const RUM_TRACK_ACROSS = [0.9724, -0.2334] as const;
function upperStoreyShare(ctx: RegionalBuildContext): number {
  if (ctx.x === undefined || ctx.z === undefined) return 0.3;
  const across = Math.abs((ctx.x - 8) * RUM_TRACK_ACROSS[0] + ctx.z * RUM_TRACK_ACROSS[1]);
  return across < 26 ? 0.4 : 0;
}

/**
 * The block house: one or two storeys of concrete block, flat roof, parapet, steel door, grilles, roof furniture.
 * (the looks lane, 2026-10-15; WORKLIST #26: "Wadi Rum concrete-block houses with an expressed RC frame, outside stairs
 * and steel canopies, broken as concrete") the reinforced-concrete frame the block fills, expressed: its columns at the
 * corners and down the long walls, standing a little proud of the infill in their bare grey, and its ring beam at every
 * floor and at the roof; on most houses the cast concrete stair up the side to the roof terrace (or the upper flat), its
 * steel pipe rail; over the door a steel canopy of corrugated sheet on two brackets. The wall breaks as concrete block
 * (damage.ts renderCore).
 */
const blockHouse: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant;
  const Wp = Math.max(5.0, ctx.info.w - 0.3), D = Math.max(5.4, ctx.info.d - 0.3);
  // (round 11, the gauntlet's wave 282: "cinder-block cubes with a regular brick-pattern skin" — every house rendered;
  // the draw that chose bare block stays, so the rest of the house draws as before)
  if (ctx.wallBucket !== 'stone') rng();
  const wall: RegionalBucket = ctx.wallBucket === 'stone' ? 'plaster' : ctx.wallBucket as RegionalBucket;
  const door = pick(rng, STEEL_DOORS);
  const style: WindowStyle = { frame: rgb(0x5a5e60), frameWidth: 0.05, frameOut: 0.04, bars: 'six', surround: null, sill: { bucket: 'plaster', out: 0.06 }, shutters: null };
  const count = rng() < upperStoreyShare(ctx) ? 2 : 1;
  // the stair takes a strip of the plot along the +x side (the house a metre narrower beside it)
  const stair = look() < 0.65 && Wp > 6.0, SW = 0.95, W = stair ? Wp - SW - 0.05 : Wp, cx = stair ? -(SW + 0.05) / 2 : 0;
  const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'door', u: (rng() - 0.5) * W * 0.3, w: 1.0, y0: 0, h: 2.1 }];
  for (let i = 0; i < count; i++) for (const face of ['front', 'left', 'right', 'back'] as const) {
    // (round 11: "almost no openings" — a window every 2.2 m, up to three a face)
    for (const o of windowRhythm(face, i, face === 'front' || face === 'back' ? W : D, { w: 0.9, h: 1.0, sill: 1.1, spacing: 2.2, margin: 0.9, max: 3,
      avoid: face === 'front' && i === 0 ? [[openings[0].u - 0.8, openings[0].u + 0.8]] : [] })) if (face !== 'back' || rng() < 0.5) openings.push(o);
  }
  const dialect: HouseDialect = {
    window: (s, face, o, y0) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, style, rng, 0.4),
    door: (s, face, o, y0) => doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { leaf: door, frame: { bucket: 'plaster', width: 0.12, out: 0.04 }, steps: { bucket: 'stone' }, leafKind: 'panel' }, y0 + o.y0),
  };
  let frame: ReturnType<typeof buildHouse> | null = null;
  sink.placed(0, cx, 0, 0, () => {
    frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: 0.25, out: 0.05, bucket: 'stone' }, storeys: Array.from({ length: count }, () => ({ h: 3.0, wall })),
      roof: { kind: 'flat', pitchDeg: 0, eave: 0.08, verge: 0.08, thickness: 0.2, bucket: wall, parapet: 0.6, relief: FELT }, gableBucket: wall,
      // (Redrock r3, the blind critics on v2: "flat olive and beige house boxes with pasted windows" near the camera) the
      // windows set in their block wall's depth
      openings, chimneys: [], gutters: null, verge: null, reveal: 0.18, core: 'concrete',
    }, dialect);
    const f = frame;
    rcFrame(sink, f, wall, look);
    // the steel canopy over the door: a sheet of corrugated iron falling outward on two flat brackets
    const d0 = openings[0], df = f.faces.front, top = f.floors[0] + d0.h + 0.32, cw = d0.w + 0.7, cd = 0.85;
    for (const sx of [-1, 1]) sink.member('structureMetal', facePoint(df, d0.u + sx * (cw / 2 - 0.08), top - 0.42, 0.01), facePoint(df, d0.u + sx * (cw / 2 - 0.08), top - 0.06, cd - 0.05),
      0.05, 0.012, [df.u[0], 0, df.u[2]], { colour: rgb(0x4a4e50), decor: true, exposed: true }, 0);
    sink.quad('structureMetal', facePoint(df, d0.u - cw / 2, top - 0.06, cd), facePoint(df, d0.u + cw / 2, top - 0.06, cd), facePoint(df, d0.u + cw / 2, top, 0.0), facePoint(df, d0.u - cw / 2, top, 0.0),
      { colour: pick(look, SAND_SHEET), decor: true });
    sink.quad('structureMetal', facePoint(df, d0.u - cw / 2, top - 0.01, 0.0), facePoint(df, d0.u + cw / 2, top - 0.01, 0.0), facePoint(df, d0.u + cw / 2, top - 0.07, cd), facePoint(df, d0.u - cw / 2, top - 0.07, cd),
      { colour: rgb(0x5a5a56), decor: true });
    rooftop(sink, W, D, f.eaveY + 0.2, rng);
    houseWeather(sink, f, W, D, count);
    // (the fixtures keep off the side the stair stands against)
    houseFixtures(sink, W, D, f.eaveY + 0.2, rng, stair);
  });
  if (stair && frame) {
    // the stair: a flight cast against the +x wall from the front corner up to the roof terrace (or the upper flat),
    // each tread a block down to the ground; the landing at the head on the parapet's gap; the pipe rail on posts
    const f = frame as ReturnType<typeof buildHouse>;
    const x0 = cx + W / 2 + 0.02, x1 = x0 + SW, head = count > 1 ? f.floors[1] : f.eaveY + 0.2;
    const n = Math.max(8, Math.round(head / 0.18)), r = head / n, run = Math.min(0.28, (D - 1.4) / n);
    const z0 = D / 2 - 0.25;
    for (let k = 0; k < n; k++) {
      const za = z0 - (k + 1) * run, zb = z0 - k * run;
      sink.span(wall, x0, -0.3, za, x1, (k + 1) * r, zb, { tint: [0.84, 0.84, 0.86] });
    }
    const zl = z0 - n * run;
    sink.span(wall, x0, -0.3, zl - 0.95, x1, head, zl, { tint: [0.84, 0.84, 0.86] });
    // the rail: posts every few treads on the outer edge, the pipe along their heads
    const rail = { colour: rgb(0x3e4446), decor: true, exposed: true } as const, xr = x1 - 0.06;
    const posts: Vec3[] = [];
    for (let k = 0; k <= n; k += 4) posts.push([xr, k * r + 0.9, z0 - k * run - run / 2]);
    posts.push([xr, head + 0.9, zl - 0.85]);
    for (const p of posts) sink.member('structureMetal', [p[0], p[1] - 0.9, p[2]], p, 0.04, 0.04, [1, 0, 0], rail, 0);
    for (let i = 0; i + 1 < posts.length; i++) sink.member('structureMetal', posts[i], posts[i + 1], 0.045, 0.045, [1, 0, 0], rail, 0);
  }
  return renderCoat(sink.finish());
};

/**
 * A block house's reinforced-concrete frame, expressed: its columns (25 cm, 4 cm proud of the infill) at the corners and
 * down every wall longer than 4.5 m where no opening stands, and its ring beam (30 cm) at each floor and under the
 * parapet, in the bare grey of cast concrete over the render.
 */
function rcFrame(sink: PartSink, frame: ReturnType<typeof buildHouse>, wall: RegionalBucket, look: () => number): void {
  const grey: Rgb = [0.8 + look() * 0.06, 0.8, 0.82], o = 0.04, cw = 0.25;
  for (const name of ['front', 'right', 'back', 'left'] as const) {
    const f = frame.faces[name], W = f.width, own = frame.spec.openings.filter((q) => q.face === name);
    const cols = [-W / 2 + cw / 2, W / 2 - cw / 2];
    if (W > 4.5) {
      const n = Math.round(W / 3.4);
      for (let k = 1; k < n; k++) {
        const u = -W / 2 + W * k / n;
        if (!own.some((q) => Math.abs(q.u - u) < q.w / 2 + cw)) cols.push(u);
      }
    }
    const y0 = frame.floors[0], y1 = frame.eaveY;
    for (const u of cols) faceBox(sink, wall, f, u, (y0 + y1) / 2, o / 2, cw, y1 - y0, o, { decor: true, tint: grey, fineSides: true }, 'caps');
    for (const y of [...frame.floors.slice(1), y1 - 0.15]) {
      // the beam runs between the openings that cut it (a window's head can stand at the beam)
      faceBox(sink, wall, f, 0, y, o / 2 + 0.002, W + 0.004, 0.3, o + 0.004, { decor: true, tint: grey, fineSides: true }, 'ends');
    }
  }
}

/**
 * (Redrock r3) What a Rum house's render carries (dressing, from a stream of its own so the kit's draws are as before):
 * a cast concrete sunshade over each window, the dado the dust and the rain splash darken to a hand over a metre, and the
 * parapet's scuppers — a spout or two a face, the water's dark run down the render under each.
 */
function houseWeather(sink: PartSink, frame: ReturnType<typeof buildHouse>, W: number, D: number, count: number): void {
  const g = streamFrom(Math.round(W * 613 + D * 241 + count * 7));
  const dado = rgb(0x8a7a66), run = rgb(0x6e6254), slab = rgb(0xb8b0a2);
  for (const o of frame.spec.openings) {
    if (o.kind !== 'window') continue;
    const f = frame.faces[o.face], y = frame.floors[o.storey] + o.y0 + o.h + 0.12;
    faceBox(sink, 'plaster', f, o.u, y, 0.2, o.w + 0.36, 0.1, 0.4, { colour: slab, decor: true });
  }
  for (const name of ['front', 'right', 'back', 'left'] as const) {
    const f = frame.faces[name];
    faceBox(sink, 'plaster', f, 0, 0.25 + 0.5, 0.006, f.width - 0.04, 1.0, 0.012, { colour: shade(dado, 0.92 + g() * 0.16), decor: true });
    for (let k = 0, n = 1 + Math.floor(g() * 2); k < n; k++) {
      const u = (g() - 0.5) * (f.width - 1.2), top = frame.eaveY + 0.05;
      faceBox(sink, 'structureMetal', f, u, top, 0.22, 0.12, 0.12, 0.44, { colour: rgb(0x5a5e60), decor: true });
      const len = 1.2 + g() * 2.2;
      faceBox(sink, 'plaster', f, u, top - 0.1 - len / 2, 0.006, 0.18 + g() * 0.22, len, 0.012, { colour: shade(run, 0.9 + g() * 0.2), decor: true });
    }
  }
}

/**
 * (the maps lane, 2026-10-15, Redrock's blind critics: "huge blank box walls with no weathering, openings or fixtures")
 * What a Rum house carries on its walls and roof: the dish on its mast, the split air conditioner over the windows with
 * its drain, the downpipe from the roof, the electricity meter by the front corner. Drawn after every other part of the
 * house (the house's own draws are as before); all decor.
 */
function houseFixtures(sink: PartSink, W: number, D: number, top: number, rng: () => number, stairRight = false): void {
  const faces: Face[] = [{ origin: [0, 0, D / 2], u: [1, 0, 0], out: [0, 0, 1], width: W }, { origin: [W / 2, 0, 0], u: [0, 0, -1], out: [1, 0, 0], width: D },
    { origin: [0, 0, -D / 2], u: [-1, 0, 0], out: [0, 0, -1], width: W }, { origin: [-W / 2, 0, 0], u: [0, 0, 1], out: [-1, 0, 0], width: D }];
  const white = rgb(0xdedbd2), grey = rgb(0x9a9a94);
  // the dish: a mast at a front corner of the roof, the dish on it turned to the south-west sky
  if (rng() < 0.65) {
    const x = (rng() < 0.5 ? -1 : 1) * (W / 2 - 0.75), z = D / 2 - 0.75;
    sink.span('structureMetal', x - 0.03, top, z - 0.03, x + 0.03, top + 1.05, z + 0.03, { colour: grey, decor: true });
    sink.cylinder('structureMetal', [x, top + 1.0, z - 0.05], 'z', 0.12, 0.42, 12, { colour: white, decor: true }, 0.16);
  }
  // the split unit over the window heads (2.1 m) on a side or the back, its drain down the wall
  for (let k = 0, n = rng() < 0.45 ? 2 : 1; k < n; k++) {
    // (the looks lane, 2026-10-15: a house with its stair up the right side hangs its split unit on the far side)
    const pickF = faces[1 + Math.floor(rng() * 3)], f = stairRight && pickF === faces[1] ? faces[3] : pickF, u = (rng() - 0.5) * (f.width - 2.0);
    faceBox(sink, 'structureMetal', f, u, 2.55, 0.13, 0.82, 0.5, 0.26, { colour: white, decor: true });
    // (the looks lane, 2026-10-15: the fan's grille was a grey plate on the casing) the grille's bars across the fan
    for (let b = 0; b < 5; b++) faceBox(sink, 'structureMetal', f, u + 0.12, 2.39 + b * 0.08, 0.265, 0.4, 0.014, 0.01, { colour: grey, decor: true });
    faceBox(sink, 'structureMetal', f, u - 0.3, 1.15, 0.015, 0.03, 2.1, 0.03, { colour: white, decor: true });
  }
  // the downpipe from the roof at a back corner (the far one from a side stair)
  const pickSx = rng() < 0.5 ? -1 : 1, sx = stairRight ? -1 : pickSx;
  sink.cylinder('structureMetal', [sx * (W / 2 + 0.045), 0.25, -D / 2 + 0.25], 'y', top - 0.25, 0.05, 6, { colour: white, decor: true });
  // the meter box and its conduit by the front corner of the right wall
  const right = stairRight ? faces[3] : faces[1], mu = stairRight ? D / 2 - 0.45 : -D / 2 + 0.45;
  faceBox(sink, 'structureMetal', right, mu, 1.5, 0.07, 0.34, 0.44, 0.14, { colour: rgb(0xb4b0a4), decor: true });
  faceBox(sink, 'structureMetal', right, mu, (1.72 + top) / 2, 0.02, 0.04, top - 1.72, 0.04, { colour: grey, decor: true });
}

/**
 * (the maps lane, 2026-10-15, Redrock's blind critics: "a flat repeating camouflage-noise tile texture" on the walls) A
 * house's render as one coat: the plaster buckets' UVs scaled down, so a wall samples a few texels of the shared print
 * and the weathering pass's occlusion and damp show on it (landmarks/kit.ts smoothRender's law, at its limewash scale).
 */
const RUM_RENDER_UV = 0.006;
function renderCoat(parts: RegionalParts): RegionalParts {
  for (const name of ['plaster', 'plaster2', 'plaster3'] as const) {
    for (const geometry of parts[name] ?? []) {
      const uv = geometry.getAttribute('uv');
      if (!uv) continue;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * RUM_RENDER_UV, uv.getY(i) * RUM_RENDER_UV);
      uv.needsUpdate = true;
    }
  }
  return parts;
}

/** A steel-portal store: block plinth walls, sheet cladding in a sand livery, a low corrugated roof, a roller door. */
const steelStore: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const W = Math.max(8, Math.min(18, ctx.info.w - 0.6)), D = Math.max(10, Math.min(28, ctx.info.d - 0.6));
  const livery = pick(rng, SAND_SHEET);
  // (props census #4, lane B 2026-10-14; the judges: "a span box with a gate laid on its face and glass strips stuck on")
  // the shared sheet hall (hall.ts): sand-coloured sheet on its block kerb, the apron gate's leaves on their tracks over
  // the cut opening onto the store's floor, its lights under the eaves in their frames, a side door, the gutters
  const roofSheet = rgb(0xb4b0a6);
  const frame = sheetHall(sink, { w: W, d: D, eave: 5.2, pitchDeg: 8, kerb: 1.2, livery, doorLivery: rgb(0x8a8e90), trim: rgb(0x6a6e70), doors: 'sliding',
    doorW: Math.min(4.2, W - 2), doorH: 4.0, open: 0.15 + rng() * 0.35, backDoor: null, sideDoor: D * 0.25, clerestory: true, roofLights: false, ridgeVent: false,
    gutters: true, mobile: ctx.tier === 'mobile', roof: { bucket: 'structureMetal', colour: roofSheet } }, ctx.variant);
  // (dome-detail-275) the roof's corrugated sheets in their lapped courses
  gableRelief(sink, frame, { ...SHEET, budget: Math.round((W + 0.8) * (D + 0.6) * 3) }, { colour: roofSheet });
  return sink.finish();
};

/**
 * The Desert Patrol fort (Qasr al-Badia at Rum; the Redrock lane, 2026-10-07, the owner's "redrock is really rough": the
 * fort was a blank box in a harsh cork print). Rendered stone (round 9), the render fallen away in patches to the coursed
 * sandstone under it, a stone footing at the foot, sand drifted against the walls, sand-scoured at the foot;
 * a parapet of merlons on a coping over the wall walk; corner towers with arrow slits; a gate tower with an arched
 * gateway, its doors set back in the arch, a plain pennant over it; an inner court ringed by the post's rooms, their doors and
 * windows on the court, and a cistern head in it. The footprint is the old fort's (walls inset from the plot by a metre,
 * the towers half a tower out from the corners, the gate tower 0.7 m proud of the front).
 */
const fort: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const W = Math.max(12, Math.min(22, ctx.info.w - 2.0)), D = Math.max(11, Math.min(20, ctx.info.d - 2.0));
  // (round 9, the gauntlet's wave 261: "clean, perfectly regular brick tile with crisp European crenellations and no
  // weathering, base staining or footing ... a new toy castle"): the walls rendered over their stone, the render fallen
  // away in patches to the coursed stone under it, a stone footing proud at the foot, sand drifted against the walls
  const t = 0.9, h = 5.0, wall: RegionalBucket = 'plaster';
  // the foot sand-scoured and darker, the courses paling a little up the wall (a per-corner occlusion the weathering
  // pass folds in), each wall a slightly different lot of stone
  // (round 11, the gauntlet's wave 282: "a hard, grime-free base line on the sand" — the foot darker and higher)
  const scour = (p: Vec3) => (p[1] < 0.25 ? 0.64 : p[1] < 1.1 ? 0.8 : p[1] < 1.9 ? 0.91 : 1.0);
  const lot = (): Rgb => { const k = 0.94 + rng() * 0.12; return [k * 1.02, k, k * 0.97]; };
  // (round 10, the gauntlet's wave 270: "a flat plane with a stucco noise texture and two rectangles of stone-block texture
  // pasted on like decals", "grey cobbled wedge ramps butted against its base") the walls' and towers' cores are the
  // coursed stone itself, and their render a skin 8 cm proud of it, laid in 0.35 m courses, each course one panel between
  // the holes; the holes are a few ragged patches where the render has fallen, more of them low and towards the ends, the
  // stone showing in them behind the render's broken edge. One lot of render to a face; no drift wedges, the ground is
  // the terrain's
  const skin = (face: Face, u0: number, u1: number, y0: number, y1: number, keep: ReadonlyArray<readonly [number, number, number, number]> = []) => {
    if (u1 - u0 < 0.3 || y1 - y0 < 0.3) return;
    const tint = lot(), size = Math.min(1, (u1 - u0) / 6);
    const holes: Array<[number, number, number, number]> = [];
    const n = Math.round((u1 - u0) * (y1 - y0) / 18 * (0.5 + rng() * 0.8));
    for (let k = 0; k < n; k++) {
      const end = rng() < 0.35;
      const cu = end ? (rng() < 0.5 ? u0 + rng() * 1.2 : u1 - rng() * 1.2) : u0 + rng() * (u1 - u0);
      holes.push([cu, y0 + (y1 - y0) * rng() * rng(), (0.5 + rng() * 1.3) * size, (0.35 + rng() * 0.8) * size]);
    }
    const rows = Math.max(1, Math.round((y1 - y0) / 0.35)), dy = (y1 - y0) / rows;
    const cols = Math.max(1, Math.round((u1 - u0) / 0.2)), du = (u1 - u0) / cols;
    // (dome-detail-275, a triangle trade for the rooms' felt roofs: the fort stood over the 11,500 cap) the render's lost
    // cells first (the same draws in the same order), then its runs, each run's top and bottom left out where the course
    // over or under it covers the run whole (the two faces coplanar inside the render, never seen)
    const lostAt: boolean[][] = [];
    for (let r = 0; r < rows; r++) {
      const y = y0 + (r + 0.5) * dy, row: boolean[] = [];
      for (let c = 0; c < cols; c++) {
        let lost = false;
        const u = u0 + (c + 0.5) * du, edge = 0.7 + 0.6 * rng();
        // (the render stops at a slit's dressed surround: `keep` its rectangles on the face, u0 u1 y0 y1)
        if (keep.some(([a, b, c0, c1]) => u > a && u < b && y > c0 && y < c1)) lost = true;
        for (const [hu, hy, ru, ry] of holes) {
          const qu = (u - hu) / ru, qy = (y - hy) / ry;
          if (qu * qu + qy * qy < edge) { lost = true; break; }
        }
        row.push(lost);
      }
      lostAt.push(row);
    }
    const whole = (r: number, c0: number, c1: number) => r >= 0 && r < rows && lostAt[r].slice(c0, c1).every((l) => !l);
    for (let r = 0; r < rows; r++) {
      const y = y0 + (r + 0.5) * dy;
      for (let c = 0, run = -1; c <= cols; c++) {
        const lost = c === cols || lostAt[r][c];
        if (!lost && run < 0) run = c;
        if (lost && run >= 0) {
          const a = u0 + run * du, b = u0 + c * du;
          faceBox(sink, 'plaster', face, (a + b) / 2, y, 0.04, b - a, dy, 0.08, { tint, shadeAt: scour }, { top: whole(r + 1, run, c), bottom: whole(r - 1, run, c) });
          run = -1;
        }
      }
    }
  };
  // a stone core on its footing (the footing a hand proud of the wall and knee-high)
  const core = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => {
    // (round 11, the gauntlet's wave 282: the holes "hard-edged rectangular stone-block decals" — the core is the render's
    // brown coat, darker and redder, where the finish coat has fallen; the footing stays the coursed stone)
    const coat = lot();
    sink.span('plaster', x0, y0, z0, x1, y1, z1, { shadeAt: scour, tint: [coat[0] * 0.74, coat[1] * 0.63, coat[2] * 0.54] });
    sink.span('stone', x0 - 0.07, -0.3, z0 - 0.07, x1 + 0.07, 0.55 + rng() * 0.25, z1 + 0.07, { shadeAt: scour, tint: lot() });
  };
  const gateW = 3.2, gateH = 3.9, gateTowerW = 6.0, proud = 0.7;
  // the curtain walls: the back, the two sides, the front either side of the gate tower
  core(-W / 2, -0.3, -D / 2, W / 2, h, -D / 2 + t);
  core(-W / 2, -0.3, -D / 2 + t, -W / 2 + t, h, D / 2 - t);
  core(W / 2 - t, -0.3, -D / 2 + t, W / 2, h, D / 2 - t);
  core(-W / 2, -0.3, D / 2 - t, -gateTowerW / 2, h, D / 2);
  core(gateTowerW / 2, -0.3, D / 2 - t, W / 2, h, D / 2);
  // the coping along the wall heads (a pale lime-mortared course) and the merlons on its outer edge
  const coping = { tint: [1.12, 1.08, 1.0] as Rgb };
  const cope = (x0: number, z0: number, x1: number, z1: number) => sink.span(wall, x0, h, z0, x1, h + 0.18, z1, coping);
  cope(-W / 2 - 0.08, -D / 2 - 0.08, W / 2 + 0.08, -D / 2 + t);
  cope(-W / 2 - 0.08, -D / 2 + t, -W / 2 + t, D / 2 - t);
  cope(W / 2 - t, -D / 2 + t, W / 2 + 0.08, D / 2 - t);
  cope(-W / 2 - 0.08, D / 2 - t, -gateTowerW / 2, D / 2 + 0.08);
  cope(gateTowerW / 2, D / 2 - t, W / 2 + 0.08, D / 2 + 0.08);
  {
    // rendered between the towers (each corner tower covers 2.4 m of the walls' ends)
    const back: Face = { origin: [0, 0, -D / 2], u: [-1, 0, 0], out: [0, 0, -1], width: W };
    const west: Face = { origin: [-W / 2, 0, 0], u: [0, 0, 1], out: [-1, 0, 0], width: D };
    const east: Face = { origin: [W / 2, 0, 0], u: [0, 0, -1], out: [1, 0, 0], width: D };
    const front: Face = { origin: [0, 0, D / 2], u: [1, 0, 0], out: [0, 0, 1], width: W };
    skin(back, -W / 2 + 2.4, W / 2 - 2.4, 0.75, h);
    skin(west, -D / 2 + 2.4, D / 2 - 2.4, 0.75, h);
    skin(east, -D / 2 + 2.4, D / 2 - 2.4, 0.75, h);
    skin(front, -W / 2 + 2.4, -gateTowerW / 2, 0.75, h);
    skin(front, gateTowerW / 2, W / 2 - 2.4, 0.75, h);
    // and on the court side: over the rooms along the back and the west wall, to the foot on the east and the front
    const backIn: Face = { origin: [0, 0, -D / 2 + t], u: [1, 0, 0], out: [0, 0, 1], width: W };
    const westIn: Face = { origin: [-W / 2 + t, 0, 0], u: [0, 0, -1], out: [1, 0, 0], width: D };
    const eastIn: Face = { origin: [W / 2 - t, 0, 0], u: [0, 0, 1], out: [-1, 0, 0], width: D };
    const frontIn: Face = { origin: [0, 0, D / 2 - t], u: [-1, 0, 0], out: [0, 0, -1], width: W };
    const roomsTop = Math.min(3.4, h - 0.6) + 0.5;
    skin(backIn, -W / 2 + 2.4, W / 2 - 2.4, roomsTop, h);
    skin(westIn, -D / 2 + 2.4, D / 2 - 2.4, roomsTop, h);
    skin(eastIn, -D / 2 + 2.4, D / 2 - 2.4, 0.75, h);
    skin(frontIn, -W / 2 + 2.4, -gateTowerW / 2, 0.75, h);
    skin(frontIn, gateTowerW / 2, W / 2 - 2.4, 0.75, h);
  }
  // (the merlons each a little different, worn at their tops, one in nine fallen)
  const merlon = (x0: number, z0: number, x1: number, z1: number, y = h + 0.18) => {
    if (rng() < 0.11) return;
    // (round 11, the gauntlet's wave 282: "identical oversized cube merlons" — smaller, each its own width and height)
    const inset = 0.05 + rng() * 0.12;
    sink.span(wall, x0 + inset, y, z0 + inset, x1 - inset, y + 0.5 + rng() * 0.35, z1 - inset, { decor: true, tint: lot() });
  };
  for (let x = -W / 2 + 0.3; x < W / 2 - 0.9; x += 1.5) {
    merlon(x, -D / 2 - 0.08, x + 0.8, -D / 2 + 0.42);
    if (x + 0.8 < -gateTowerW / 2 || x > gateTowerW / 2) merlon(x, D / 2 - 0.42, x + 0.8, D / 2 + 0.08);
  }
  for (let z = -D / 2 + 1.6; z < D / 2 - 1.6; z += 1.5) {
    merlon(-W / 2 - 0.08, z, -W / 2 + 0.42, z + 0.8);
    merlon(W / 2 - 0.42, z, W / 2 + 0.08, z + 0.8);
  }
  // the corner towers: 3.2 m square, half a tower out from the corners, a storey over the walls, slits in their faces
  const tw = 3.2, th = h + 2.4;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const tx = sx * (W / 2 - 0.8), tz = sz * (D / 2 - 0.8);
    core(tx - tw / 2, -0.3, tz - tw / 2, tx + tw / 2, th, tz + tw / 2);
    sink.span(wall, tx - tw / 2 - 0.1, th, tz - tw / 2 - 0.1, tx + tw / 2 + 0.1, th + 0.2, tz + tw / 2 + 0.1, coping);
    for (const k of [-1, 0, 1]) {
      merlon(tx + k * 1.15 - 0.36, tz + sz * (tw / 2 - 0.36), tx + k * 1.15 + 0.36, tz + sz * (tw / 2 + 0.1), th + 0.2);
      merlon(tx + sx * (tw / 2 - 0.36), tz + k * 1.15 - 0.36, tx + sx * (tw / 2 + 0.1), tz + k * 1.15 + 0.36, th + 0.2);
    }
    const outX: Face = { origin: [tx + sx * tw / 2, 0, tz], u: [0, 0, -sx], out: [sx, 0, 0], width: tw };
    const outZ: Face = { origin: [tx, 0, tz + sz * tw / 2], u: [sz, 0, 0], out: [0, 0, sz], width: tw };
    // rendered on their outer faces, and over the wall heads on their inner ones; the slits through the render
    const inX: Face = { origin: [tx - sx * tw / 2, 0, tz], u: [0, 0, sx], out: [-sx, 0, 0], width: tw };
    const inZ: Face = { origin: [tx, 0, tz - sz * tw / 2], u: [-sz, 0, 0], out: [0, 0, -sz], width: tw };
    // (the looks lane, 2026-10-15; WORKLIST #26 "no painted plates (... wadirum slits)": the slits were dark plates on the
    // render) each slit in a dressed-stone surround standing 22 cm proud of the core, the render stopping at it, the dark
    // of the tower at the back of the 22 cm reveal it makes, its splayed sill
    const slitAt: Array<readonly [number, number, number, number]> = [2.6, 5.4].map((y) => [-0.42, 0.42, y - 0.75, y + 0.75] as const);
    for (const f of [outX, outZ]) skin(f, -tw / 2, tw / 2, 0.75, th, slitAt);
    for (const f of [inX, inZ]) skin(f, -tw / 2, tw / 2, 0.75, th);
    for (const f of [outX, outZ]) for (const y of [2.6, 5.4]) {
      const sw = 0.16, sh = 0.95, fw = 0.2, o = 0.22, dress = { tint: [1.08, 1.04, 0.96] as Rgb, shadeAt: scour };
      faceBox(sink, 'dark', f, 0, y, 0.004, sw + 0.02, sh + 0.02, 0.008, { decor: true });
      for (const sx of [-1, 1]) faceBox(sink, 'stone', f, sx * (sw / 2 + fw / 2), y, o / 2, fw, sh + 2 * fw, o, dress);
      faceBox(sink, 'stone', f, 0, y + sh / 2 + fw / 2, o / 2, sw, fw, o, dress, 'ends');
      // the sill splayed down and out, the way rain and a rifle's muzzle wear it
      sink.quad('stone', facePoint(f, -sw / 2 - 0.06, y - sh / 2 - fw, o), facePoint(f, sw / 2 + 0.06, y - sh / 2 - fw, o), facePoint(f, sw / 2, y - sh / 2, 0.01), facePoint(f, -sw / 2, y - sh / 2, 0.01), dress);
      faceBox(sink, 'stone', f, 0, y - sh / 2 - fw - 0.04, o / 2, sw + 2 * fw, 0.08, o, dress);
    }
  }
  // the gate tower: 6 m wide, 0.7 m proud of the front, two metres over the walls; its arched gateway
  const gz = D / 2 + proud, gth = h + 2.0, gx = gateTowerW / 2;
  core(-gx, -0.3, D / 2 - t - 0.6, -gateW / 2, gth, gz);
  core(gateW / 2, -0.3, D / 2 - t - 0.6, gx, gth, gz);
  core(-gateW / 2, gateH + gateW / 2 + 0.25, D / 2 - t - 0.6, gateW / 2, gth, gz);
  {
    // its render: the jambs, the spandrels clear of the voussoirs, the head over the arch; the sides' proud foot and
    // their full depth over the wall heads
    const gf: Face = { origin: [0, 0, gz], u: [1, 0, 0], out: [0, 0, 1], width: 2 * gx };
    const zc = (D / 2 - t - 0.6 + gz) / 2, top = gateH + gateW / 2 + 0.35;
    for (const s of [-1, 1]) {
      const [a, b] = s < 0 ? [-gx, -gateW / 2] : [gateW / 2, gx];
      skin(gf, a, b, 0.75, gateH);
      skin(gf, s < 0 ? -gx : gateW / 2 + 0.35, s < 0 ? -gateW / 2 - 0.35 : gx, gateH, top);
      const side: Face = { origin: [s * gx, 0, zc], u: [0, 0, -s], out: [s, 0, 0], width: gz - (D / 2 - t - 0.6) };
      const [p0, p1] = s < 0 ? [D / 2 - zc, gz - zc] : [zc - gz, zc - D / 2];
      skin(side, p0, p1, 0.75, h);
      skin(side, -side.width / 2, side.width / 2, h + 0.18, gth);
    }
    skin(gf, -gx, gx, top, gth);
    // the back on the court: the jambs either side of the passage, the head over it
    const gb: Face = { origin: [0, 0, D / 2 - t - 0.6], u: [-1, 0, 0], out: [0, 0, -1], width: 2 * gx };
    skin(gb, -gx, -gateW / 2, 0.75, gateH);
    skin(gb, gateW / 2, gx, 0.75, gateH);
    skin(gb, -gx, gx, gateH, gth);
  }
  // the arch: seven voussoirs round a half circle over the jambs, the keystone proud
  const archR = gateW / 2, archY = gateH;
  for (let k = 0; k < 7; k++) {
    const a0 = Math.PI * k / 7, a1 = Math.PI * (k + 1) / 7, am = (a0 + a1) / 2;
    // centre on the ring 0.15 m out from the opening, the voussoir along the ring's tangent (sin, cos) there
    const cx = -Math.cos(am) * (archR + 0.15), cy = archY + Math.sin(am) * (archR + 0.15);
    const len = (archR + 0.3) * (a1 - a0) + 0.04, ts = Math.sin(am) * len / 2, tc = Math.cos(am) * len / 2;
    sink.member(wall, [cx - ts, cy - tc, gz - 0.02], [cx + ts, cy + tc, gz - 0.02], 0.32, k === 3 ? 0.18 : 0.08, [0, 0, 1],
      { tint: [1.1, 1.06, 0.98] });
  }
  // the tympanum: the arch's head closed by a recessed stone panel over the doors
  sink.span(wall, -gateW / 2, gateH - 0.05, D / 2 - t + 0.2, gateW / 2, gateH + archR + 0.3, D / 2 - t + 0.45, { tint: lot() });
  // (the looks lane, 2026-10-16, the integrity ledger: the arch's void ran on behind the tympanum to the court face, a
  // sealed pocket seen through the render's lost patches there) the masonry fills it behind the tympanum, under the court
  // face's flat head (dressing: the passage under it and the tower's collision as before; no draw)
  sink.span(wall, -gateW / 2, gateH - 0.05, D / 2 - t - 0.6, gateW / 2, gateH + archR + 0.3, D / 2 - t + 0.2, { tint: [0.96, 0.94, 0.9], decor: true });
  // the arch's head: the opening narrowing in four courses to the crown (each course's half-width the circle's at its
  // middle), the stone beside it filled through the tower's depth
  for (let k = 0; k < 4; k++) {
    const y0 = gateH + k * (archR + 0.25) / 4, y1 = gateH + (k + 1) * (archR + 0.25) / 4, ym = (y0 + y1) / 2 - gateH;
    const half = Math.sqrt(Math.max(0, archR * archR - ym * ym));
    for (const side of [-1, 1]) sink.span(wall, side < 0 ? -gateW / 2 : half, y0, D / 2 - t - 0.6, side < 0 ? -half : gateW / 2, y1, gz - 0.05,
      { tint: lot() });
  }
  // the doors stand back in the arch: the gateway's passage dark behind them
  const doorFace: Face = { origin: [0, 0, D / 2 - t + 0.2], u: [1, 0, 0], out: [0, 0, 1], width: gateW };
  gateUnit(sink, doorFace, 0, 0, gateW - 0.1, gateH - 0.05, rgb(0x4a3a2c), { bucket: 'structureWood', width: 0.1, out: 0.04, colour: rgb(0x3a2e24) });
  sink.span(wall, -gateW / 2, -0.3, D / 2 - t - 0.6, gateW / 2, gateH, D / 2 - t + 0.2, { tint: lot() });
  // the gate tower's merlons and the pennant over the gate
  for (let x = -gx + 0.2; x < gx - 0.5; x += 1.45) merlon(x, gz - 0.5, x + 0.8, gz, gth);
  sink.span('structureMetal', -0.05, gth, gz - 1.0, 0.05, gth + 6.5, gz - 0.9, { colour: rgb(0x8a8e90), decor: true });
  // (the facades lane, 2026-10-09; the owner: the fort "uses a country flag that we shouldn't use") no nation's flag: a
  // plain pennant of sun-faded khaki cloth on the gate tower's mast, 2.4 m to the fly, 0.9 m at the hoist
  {
    const fz = gz - 0.976, cloth = rgb(0xb9a98a);
    sink.prism('structureWood', [[0.06, gth + 5.4, fz], [2.46, gth + 5.9, fz], [0.06, gth + 6.3, fz]], [0, 0, 1], 0.032, { colour: cloth, decor: true });
  }
  // the court: rooms along the back and the west wall, flat roofs behind a low parapet, doors and windows on the court
  // (the looks lane, 2026-10-15; WORKLIST #26: the rooms' doors and windows were dark plates on a span) the rooms on the
  // house grammar against the curtain's inner faces: rendered stone on a footing, their doors and grilled windows cut
  // through the court walls in reveals, a timber lintel over each door, a flat roof behind a low parapet
  const ri = -D / 2 + t, rd = Math.min(4.2, D * 0.28), rh = 3.4;
  const sideW = Math.min(3.8, W * 0.22), sideL = D / 2 - t - 1.6 - ri - rd;
  const leafWood = rgb(0x5a4632), grille: WindowStyle = { frame: rgb(0x4a4e50), frameWidth: 0.05, frameOut: 0.04, bars: 'six', surround: null, sill: { bucket: 'stone', out: 0.06 }, shutters: null };
  const roomDialect: HouseDialect = {
    window: (s2, face, o, y0) => windowUnit(s2, face, o.u, y0 + o.y0, o.w, o.h, grille, rng, 0.25),
    door: (s2, face, o, y0) => {
      doorUnit(s2, face, o.u, y0 + o.y0, o.w, o.h, { leaf: leafWood, frame: { bucket: 'structureWood', width: 0.1, out: 0.04, colour: shade(leafWood, 0.8) }, steps: { bucket: 'stone' }, leafKind: 'plank' }, y0 + o.y0);
      faceBox(s2, 'structureWood', face, o.u, y0 + o.y0 + o.h + 0.1, 0.03, o.w + 0.36, 0.14, 0.06, { colour: shade(leafWood, 0.75), decor: true });
    },
  };
  const backOpenings: Opening[] = [];
  for (let u = -(W - 2 * t) / 2 + 2.2; u < (W - 2 * t) / 2 - 1.2; u += 3.4) {
    const isDoor = rng() < 0.5;
    backOpenings.push(isDoor ? { face: 'front', storey: 0, kind: 'door', u, w: 1.0, y0: 0, h: 2.1 } : { face: 'front', storey: 0, kind: 'window', u, w: 0.8, y0: 1.3, h: 0.9 });
  }
  const sideOpenings: Opening[] = [];
  for (let u = -sideL / 2 + 1.6; u < sideL / 2 - 0.8; u += 3.2) sideOpenings.push({ face: 'front', storey: 0, kind: 'door', u, w: 1.0, y0: 0, h: 2.1 });
  // (dome-detail-275) the rooms' concrete roofs under bitumen felt in relief (a lean allowance: the fort is near the cap)
  const roomRoof = { kind: 'flat' as const, pitchDeg: 0, eave: 0.06, verge: 0.06, thickness: 0.2, bucket: wall, parapet: 0.5, relief: { ...FELT, budget: 110 } };
  sink.placed(0, 0, 0, ri + rd / 2, () => buildHouse(sink, {
    w: W - 2 * t, d: rd, plinth: { h: 0.35, out: 0.06, bucket: 'stone' }, storeys: [{ h: rh - 0.35, wall }], roof: roomRoof, gableBucket: wall,
    openings: backOpenings, chimneys: [], gutters: null, verge: null, reveal: 0.3, spall: 'stone', core: 'rubble',
  }, roomDialect));
  // the west rooms, their court face to +x (a quarter turn: the body's front faces the court)
  sink.placed(Math.PI / 2, -W / 2 + t + sideW / 2, 0, ri + rd + sideL / 2, () => buildHouse(sink, {
    w: sideL, d: sideW, plinth: { h: 0.35, out: 0.06, bucket: 'stone' }, storeys: [{ h: rh - 0.35, wall }], roof: roomRoof, gableBucket: wall,
    openings: sideOpenings, chimneys: [], gutters: null, verge: null, reveal: 0.3, spall: 'stone', core: 'rubble',
  }, roomDialect));
  // the court's floor of beaten earth and its cistern head
  sink.span('plaster3', -W / 2 + t, -0.3, ri + rd, W / 2 - t, 0.06, D / 2 - t, { decor: true });
  sink.cylinder(wall, [W * 0.12, 0.06, (ri + rd + D / 2 - t) / 2], 'y', 0.75, 0.85, 10, { tint: lot() });
  sink.cylinder('dark', [W * 0.12, 0.81, (ri + rd + D / 2 - t) / 2], 'y', 0.02, 0.6, 10, { decor: true });
  return sink.finish();
};

/** A shelled block house: walls broken to stumps, the slab fallen in, rebar curling from the breaks. */
const ruin: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant;
  const W = Math.max(5.4, ctx.info.w - 0.3), D = Math.max(6, ctx.info.d - 0.3), t = 0.25;
  // (props census #7, lane B 2026-10-14; the judges: "four slices a side to random tops") the ruin grammar: the block
  // house's own walls broken to stumps, its door and windows cut through, the bars curling from the heads, the slab
  // fallen in, the roof's furniture down among the heaps
  const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'door', u: (rng() - 0.5) * (W - 2.4), w: 1.0, y0: 0, h: 2.1 }];
  for (const face of ['right', 'left', 'back'] as const) openings.push({ face, storey: 0, kind: 'window', u: (rng() - 0.5) * 2, w: 1.0, y0: 1.0, h: 1.0 });
  const head = (): RuinHead => ({ a: 0.6 + rng() * 2.4, b: 0.6 + rng() * 2.4, at: rng(), dip: 0.3 + rng() * 0.4, ragged: 0.3 });
  const r = ruinHouse(sink, {
    w: W, d: D, t, wall: 'stone', plinth: { h: 0.2, out: 0.04, bucket: 'stone' }, storeys: [3.0], openings,
    heads: { front: head(), right: head(), back: head(), left: head() }, stub: 0.5, lintel: { bucket: 'plaster' }, roof: null,
    timber: rgb(0x2e2a26), rebar: rgb(0x6a3a22), mobile: ctx.tier === 'mobile',
  }, rng, look);
  sink.member('plaster', [-W * 0.35, r.floor, -D * 0.2], [W * 0.3, r.restOn(W * 0.3, D * 0.25) + 0.3, D * 0.25], 2.2, 0.2, [0, 1, 0], { decor: true, exposed: true });
  // the fallen roof's furniture on the floor among the heaps: its rebar sticking up from the rubble, its tank stand
  rooftop(sink, W * 0.5, D * 0.5, r.floor - 0.02, rng);
  return sink.finish();
};

// ---- the base plots the first kit left to the generic yard (gauntlet wave 15: containers, gantries and steel water
// towers read as a rail yard, not a Jordanian desert outpost)

/** A shop row of the souq: one storey of rendered block, a run of shopfronts with rolling shutters and awnings, a flat
 *  roof behind a parapet with its tanks (the base marketRow plot).
 *  (dome-detail-275; the worklist: "the shopfronts read; the back, sides and parapet are blank") the row as Rum's are
 *  built: the shops cut deep into the front between the concrete frame's piers, under its ring beam; each shop's
 *  rolling shutter half up from its drum box, in its guides; a steel-framed sheet awning on brackets, the painted board
 *  over it; the raised pavement along the front with its kerb; the back with the shops' steel doors and barred store
 *  windows, the split units and their drains, the meters, the cable run and a downpipe; one end barred and shaded, the
 *  other a painted advertising board; the dust's dado round the foot; the parapet coped, spouted and stained; a solar
 *  water heater by the tanks, a cage of gas bottles at the street corner. */
const souqRow: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant;
  // the base market row's plot is wider than deep: the row lies along it, its shopfronts (+x) down one long side
  const plot = plotAxes(ctx.info);
  const W = Math.max(plot.turned ? 4.2 : 6, Math.min(10, plot.w - 0.6)), D = Math.max(plot.turned ? 6 : 10, Math.min(18, plot.d - 0.6));
  const H = 3.6, wall: RegionalBucket = ctx.wallBucket === 'stone' ? 'plaster' : ctx.wallBucket as RegionalBucket;
  const awning = plot.turned ? 0.8 : 1.1, mobile = ctx.tier === 'mobile';
  alongPlot(sink, plot.turned, () => {
    sink.span('stone', -W / 2 - 0.05, -0.3, -D / 2 - 0.05, W / 2 + 0.05, 0.25, D / 2 + 0.05);
    // (dome-detail-275) the shops cut into the street face (+x) a deep bay each, the back's doors and store windows, one
    // end's window: the body a holed box (its core inset from each face by that face's wall)
    const n = Math.max(2, Math.floor(D / 3.2)), bay = D / n, sh = 2.5, deep = 0.85, step = 0.18;
    const shops: HoleRect[] = [], back: HoleRect[] = [], backDoor: boolean[] = [];
    for (let k = 0; k < n; k++) {
      const u = -D / 2 + (k + 0.5) * bay, w = bay - 0.7;
      shops.push({ u0: u - w / 2, u1: u + w / 2, y0: 0.25, y1: sh });
      // the back face runs the other way along z (its u is +z): each shop's door or store window behind it
      const door = look() < 0.55, bu = -u + (look() - 0.5) * (w - 1.4);
      backDoor.push(door);
      back.push(door ? { u0: bu - 0.45, u1: bu + 0.45, y0: 0.25, y1: 2.25 } : { u0: bu - 0.4, u1: bu + 0.4, y0: 1.75, y1: 2.35 });
    }
    const endWin = look() < 0.5 ? 'front' : 'back', endHole: HoleRect = { u0: -0.45, u1: 0.45, y0: 1.2, y1: 2.2 };
    const F = holedBox(sink, wall, -W / 2, -D / 2, W / 2, D / 2, 0.25, H, { right: shops, left: back, ...(endWin === 'front' ? { front: [endHole] } : { back: [endHole] }) },
      { right: deep, left: 0.25, front: 0.25, back: 0.25 }, 0.2, {}, { reveals: { right: deep - 0.05 } });
    for (const [x0, z0, x1, z1] of [[-W / 2, -D / 2, W / 2, -D / 2 + 0.22], [-W / 2, D / 2 - 0.22, W / 2, D / 2], [-W / 2, -D / 2, -W / 2 + 0.22, D / 2], [W / 2 - 0.22, -D / 2, W / 2, D / 2]] as const) {
      sink.span(wall, x0, H, z0, x1, H + 0.6, z1);
      // (dome-detail-275) its coping, a pale cast course a hand over both faces
      sink.band(wall, x0 - 0.04, H + 0.6, z0 - 0.04, x1 + 0.04, H + 0.68, z1 + 0.04, { decor: true, tint: [1.08, 1.06, 1.02] });
    }
    // (dome-detail-275) the concrete frame the block fills: its piers between the shops and at the corners, 6 cm proud in
    // the bare grey, the ring beam over them round all four faces
    const grey: Rgb = [0.8 + look() * 0.06, 0.8, 0.82], frame = { decor: true, tint: grey, fineSides: true } as const;
    for (const fn of ['front', 'right', 'back', 'left'] as const) {
      const f = F[fn], piers = fn === 'right' ? Array.from({ length: n + 1 }, (_, k) => Math.max(-D / 2 + 0.17, Math.min(D / 2 - 0.17, -D / 2 + k * bay))) : [-f.width / 2 + 0.17, f.width / 2 - 0.17];
      for (const u of piers) faceBox(sink, wall, f, u, (0.25 + H - 0.3) / 2, 0.03, 0.34, H - 0.3 - 0.25, 0.06, frame, 'caps');
      faceBox(sink, wall, f, 0, H - 0.15, 0.035, f.width + 0.07, 0.3, 0.07, frame);
      // the dust's dado round the foot, darker to a hand over a metre, broken at the doors (the shops' pavement takes it
      // on the front)
      if (fn === 'right') continue;
      const cuts = (fn === 'left' ? back.filter((h) => h.y0 < 1.25) : []).map((h) => [h.u0 - 0.12, h.u1 + 0.12] as const).sort((a, b) => a[0] - b[0]);
      let a = -f.width / 2 + 0.02;
      for (const [c0, c1] of [...cuts, [f.width / 2 - 0.02, f.width / 2] as const]) {
        if (c0 - a > 0.2) faceBox(sink, wall, f, (a + c0) / 2, 0.25 + 0.5, 0.004, c0 - a, 1.0, 0.008, { decor: true, tint: [0.84, 0.78, 0.7] });
        a = Math.max(a, c1);
      }
    }
    // the shopfronts along the street side (+x): rolling shutters half up over dark shops, an awning over each
    const face = F.right, inner: Face = { ...face, origin: facePoint(face, 0, 0, -(deep - 0.05)) }, steel = rgb(0x8a8e90);
    for (let k = 0; k < n; k++) {
      const u = -D / 2 + (k + 0.5) * bay, w = bay - 0.7;
      shopInterior(sink, inner, u, w, mobile, k * 7.31 + D * 3.7 + W, deep - 0.05, step);
      // its floor of terrazzo over the sill (dome-detail-275)
      faceBox(sink, 'stone', face, u, 0.26, -(deep - 0.05) / 2, w, 0.02, deep - 0.05, { decor: true, tint: [1.1, 1.06, 1.0] });
      // (dome-detail-275) the shutter: its curtain run down from the head to where it stands (the old draws), in its
      // guides 6 cm inside the face, the bottom bar, the slats; its drum's box over the head
      const yc = 2.15 + rng() * 0.25, hh = 0.9 + rng() * 0.4, foot = Math.min(sh - 0.5, yc - hh / 2 + 0.2);
      faceBox(sink, 'structureMetal', face, u, (sh + foot) / 2, -0.07, w - 0.04, sh - foot, 0.03, { colour: steel, decor: true });
      faceBox(sink, 'structureMetal', face, u, foot + 0.04, -0.07, w - 0.04, 0.08, 0.06, { colour: shade(steel, 0.7), decor: true });
      sink.dressing(mobile, () => {
        for (let y = sh - 0.16; y > foot + 0.12; y -= 0.2) faceBox(sink, 'structureMetal', face, u, y, -0.05, w - 0.04, 0.015, 0.01, { colour: shade(steel, 0.78), decor: true, fine: true });
      });
      for (const s of [-1, 1]) faceBox(sink, 'structureMetal', face, u + s * (w / 2 - 0.03), (0.25 + sh) / 2, -0.07, 0.06, sh - 0.25, 0.08, { colour: shade(steel, 0.85), decor: true });
      faceBox(sink, 'structureMetal', face, u, sh + 0.2, 0.15, w + 0.2, 0.4, 0.3, { colour: shade(steel, 0.9), decor: true });
      // the awning: a sheet falling outward from the wall over the drum box on two flat brackets, its underside dark
      const top = 3.28, low = top - 0.26, cw = w + 0.3, sheet = pick(rng, SAND_SHEET);
      for (const s of [-1, 1]) {
        sink.member('structureMetal', facePoint(face, u + s * (cw / 2 - 0.08), top - 0.32, 0.01), facePoint(face, u + s * (cw / 2 - 0.08), low - 0.05, awning - 0.05),
          0.05, 0.012, [face.u[0], 0, face.u[2]], { colour: rgb(0x4a4e50), decor: true, exposed: true }, 0);
      }
      // (a thin closed sheet: two open quads let the ray casts in between them at the edges)
      const fallL = Math.hypot(awning, top - low), sheetOut: Vec3 = [face.out[0] * (top - low) / fallL, awning / fallL, face.out[2] * (top - low) / fallL];
      sink.member('structureMetal', facePoint(face, u, top - 0.03, 0), facePoint(face, u, low - 0.03, awning), cw, 0.03, sheetOut, { colour: sheet, decor: true, exposed: true }, 0);
      faceBox(sink, 'structureMetal', face, u, low - 0.04, awning, cw, 0.1, 0.03, { colour: shade(sheet, 0.85), decor: true });
      // the painted board over it on the ring beam, its lettering
      const board = pick(rng, STEEL_DOORS);
      faceBox(sink, 'structureWood', face, u, 3.6, 0.09, w * 0.85, 0.46, 0.04, { colour: board, decor: true });
      faceBox(sink, 'structureWood', face, u - w * 0.08, 3.62, 0.115, w * 0.5, 0.14, 0.01, { colour: rgb(0xe8e2d0), decor: true, fine: 'near' });
    }
    // (dome-detail-275) the raised pavement along the front, its kerb
    sink.span('stone', W / 2, -0.3, -D / 2, W / 2 + 0.82, step, D / 2, { decor: true, shade: 0.92 });
    sink.span('stone', W / 2 + 0.72, -0.3, -D / 2, W / 2 + 0.84, step + 0.03, D / 2, { decor: true, tint: [1.1, 1.08, 1.04] });
    // the back: the shops' steel doors and barred store windows at the back of their reveals; the split units, the meters
    // on a board, the cable run under the beam, the downpipe, the parapet's spouts and the stains under them
    const bf = F.left, grille: WindowStyle = { frame: rgb(0x4a4e50), frameWidth: 0.04, frameOut: 0.03, bars: 'six', surround: null, sill: { bucket: 'plaster', out: 0.05 }, shutters: null };
    sink.recess = 0.2;
    try {
      back.forEach((h, k) => {
        const hu = (h.u0 + h.u1) / 2, hw = h.u1 - h.u0;
        if (backDoor[k]) {
          // a plain steel leaf at the back of its reveal, its frame, the step up to it
          faceBox(sink, 'structureMetal', bf, hu, (h.y0 + h.y1) / 2, -0.18, hw - 0.02, h.y1 - h.y0 - 0.01, 0.04, { colour: pick(look, STEEL_DOORS), decor: true });
          faceBox(sink, 'structureMetal', bf, hu, h.y1 + 0.05, 0.02, hw + 0.2, 0.1, 0.04, { colour: rgb(0x4a4e50), decor: true });
          faceBox(sink, 'stone', bf, hu, 0.1, 0.18, hw + 0.3, 0.2, 0.36, { decor: true });
        } else windowUnit(sink, bf, (h.u0 + h.u1) / 2, h.y0, h.u1 - h.u0, h.y1 - h.y0, grille, look, 0.2);
      });
      const ef = F[endWin];
      windowUnit(sink, ef, 0, endHole.y0, endHole.u1 - endHole.u0, endHole.y1 - endHole.y0, grille, look, 0.3);
    } finally { sink.recess = 0; }
    const white = rgb(0xdedbd2), pale = rgb(0x9a9a94);
    {
      const ef = F[endWin];
      faceBox(sink, 'plaster', ef, 0, endHole.y1 + 0.17, 0.2, 1.26, 0.1, 0.4, { decor: true, tint: [1.04, 1.02, 0.98] });
      // the other end: the painted board of an advertisement, framed, its two fields and its slogan
      const af = F[endWin === 'front' ? 'back' : 'front'], aw = Math.min(3.0, W - 1.0), paint = pick(look, [rgb(0xb83a2e), rgb(0x2e5a9a), rgb(0x3a7a4a)]);
      faceBox(sink, 'structureMetal', af, 0, 2.2, 0.03, aw + 0.1, 1.5, 0.06, { colour: rgb(0x4a4e50), decor: true });
      faceBox(sink, 'structureWood', af, 0, 2.45, 0.065, aw, 0.9, 0.01, { colour: paint, decor: true });
      faceBox(sink, 'structureWood', af, 0, 1.75, 0.065, aw, 0.5, 0.01, { colour: rgb(0xe8e2d0), decor: true });
      faceBox(sink, 'structureWood', af, -aw * 0.12, 2.5, 0.072, aw * 0.6, 0.22, 0.006, { colour: rgb(0xf0ead8), decor: true, fine: 'near' });
      faceBox(sink, 'structureWood', af, 0, 1.75, 0.072, aw * 0.7, 0.12, 0.006, { colour: shade(paint, 0.9), decor: true, fine: 'near' });
      // its meter by the corner
      faceBox(sink, 'structureMetal', af, af.width / 2 - 0.5, 1.5, 0.07, 0.34, 0.44, 0.14, { colour: rgb(0xb4b0a4), decor: true });
    }
    // the split units where two shops' backs meet (clear of their doors), their drains down the wall
    for (let k = 0, m = Math.min(n - 1, 1 + Math.floor(look() * 2)); k < m; k++) {
      const u = D / 2 - (k + 1) * bay + 0.25;
      faceBox(sink, 'structureMetal', bf, u, 2.75, 0.13, 0.82, 0.5, 0.26, { colour: white, decor: true });
      for (let b = 0; b < 3; b++) faceBox(sink, 'structureMetal', bf, u + 0.12, 2.62 + b * 0.11, 0.265, 0.4, 0.014, 0.01, { colour: pale, decor: true, fine: 'near' });
      faceBox(sink, 'structureMetal', bf, u - 0.3, 1.25, 0.015, 0.03, 2.25, 0.03, { colour: white, decor: true });
    }
    // (the meters on their board where two shops' backs meet, clear of their doors)
    const mu = -D / 2 + bay, mn = Math.min(3, n);
    faceBox(sink, 'structureMetal', bf, mu, 1.55, 0.02, 0.28 * mn + 0.12, 0.55, 0.04, { colour: rgb(0x8a8478), decor: true });
    for (let k = 0; k < mn; k++) faceBox(sink, 'structureMetal', bf, mu + (k - (mn - 1) / 2) * 0.28, 1.55, 0.07, 0.2, 0.32, 0.06, { colour: rgb(0xb4b0a4), decor: true, fine: 'near' });
    faceBox(sink, 'structureMetal', bf, mu, (1.825 + 3.12) / 2, 0.02, 0.04, 3.12 - 1.825, 0.04, { colour: pale, decor: true });
    faceBox(sink, 'structureMetal', bf, 0, 3.12, 0.025, D - 0.6, 0.05, 0.05, { colour: rgb(0x2a2a2a), decor: true });
    const ds = look() < 0.5 ? -1 : 1;
    sink.cylinder('structureMetal', [-W / 2 - 0.06, 0.25, ds * (D / 2 - 0.3)], 'y', H + 0.4 - 0.25, 0.05, 6, { colour: white, decor: true });
    for (let k = 0, m = 2 + Math.floor(look() * 2); k < m; k++) {
      const u = (k + 0.5 + (look() - 0.5) * 0.6) * D / m - D / 2, len = 1.0 + look() * 1.8;
      faceBox(sink, 'structureMetal', bf, u, H + 0.08, 0.22, 0.12, 0.12, 0.44, { colour: pale, decor: true });
      faceBox(sink, wall, bf, u, H - len / 2, 0.006, 0.18 + look() * 0.2, len, 0.012, { decor: true, tint: [0.78, 0.72, 0.64] });
    }
    // the roof: its tanks and rebar (the old draws); a solar water heater: the collector tilted south on its frame,
    // the cylinder over it on two saddles (dome-detail-275)
    rooftop(sink, W, D, H, rng);
    {
      const z = (look() < 0.5 ? -1 : 1) * (D / 2 - 1.3), x0 = -0.9, x1 = 0.6, hi = 1.0, ink = { colour: rgb(0x6a6e70), decor: true } as const;
      for (const zz of [z - 0.7, z + 0.7]) {
        sink.span('structureMetal', x0 - 0.03, H, zz - 0.03, x0 + 0.03, H + hi, zz + 0.03, ink);
        sink.span('structureMetal', x1 - 0.03, H, zz - 0.03, x1 + 0.03, H + 0.3, zz + 0.03, ink);
        sink.span('structureMetal', x0 - 0.06, H + hi - 0.02, zz - 0.12, x0 + 0.06, H + hi + 0.02, zz + 0.12, ink);
      }
      const pl = Math.hypot(x1 - x0, hi - 0.3);
      sink.member('structureMetal', [x1, H + 0.27, z], [x0, H + hi - 0.03, z], 1.5, 0.04, [(hi - 0.3) / pl, (x1 - x0) / pl, 0], { colour: rgb(0x2a3a52), decor: true, exposed: true }, 0);
      sink.cylinder('structureMetal', [x0, H + hi + 0.26, z - 0.85], 'z', 1.7, 0.24, 10, { colour: rgb(0xd4d2ca), decor: true });
    }
    // the cage of gas bottles at the street corner of the end with the board
    {
      const zs = endWin === 'front' ? -1 : 1, zc = zs * (D / 2 + 0.32), xc = W / 2 - 0.75, cage = { colour: rgb(0x5a5e60), decor: true } as const;
      for (const [dx, dz] of [[-0.5, -0.25], [0.5, -0.25], [-0.5, 0.25], [0.5, 0.25]] as const) sink.span('structureMetal', xc + dx - 0.02, 0, zc + dz - 0.02, xc + dx + 0.02, 1.15, zc + dz + 0.02, cage);
      for (const y of [0.05, 1.1]) for (const dz of [-0.25, 0.25]) sink.span('structureMetal', xc - 0.52, y, zc + dz - 0.015, xc + 0.52, y + 0.04, zc + dz + 0.015, cage);
      for (let b = 0; b < 3; b++) sink.cylinder('structureMetal', [xc - 0.32 + b * 0.32, 0, zc], 'y', 0.85, 0.14, 6, { colour: pick(look, [rgb(0x3e5f86), rgb(0x8a8e90), rgb(0xb8452e)]), decor: true });
    }
  }, 1);
  return renderCoat(sink.finish());
};

/** Lock-up stores in place of a container row: a single storey of bare block with steel roller doors (containerRow). */
const lockUps: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const W = Math.max(10, Math.min(16, ctx.info.w - 0.6)), D = Math.max(4.6, Math.min(6.4, ctx.info.d - 0.6)), H = 3.3;
  sink.span('stone', -W / 2, -0.3, -D / 2, W / 2, H, D / 2);
  sink.span('stone', -W / 2 - 0.08, H, -D / 2 - 0.08, W / 2 + 0.08, H + 0.25, D / 2 + 0.08);
  const face: Face = { origin: [0, 0, D / 2], u: [1, 0, 0], out: [0, 0, 1], width: W };
  const n = Math.max(3, Math.floor(W / 3.4));
  for (let k = 0; k < n; k++) {
    const u = -W / 2 + (k + 0.5) * W / n;
    faceBox(sink, 'structureMetal', face, u, 1.3, 0.03, W / n - 0.8, 2.5, 0.05, { colour: pick(rng, STEEL_DOORS), decor: true });
  }
  rooftop(sink, W, D, H + 0.25, rng);
  return sink.finish();
};

/** A lorry shelter in place of a gantry crane: a steel portal canopy on columns over a concrete apron, open-sided. */
const lorryShelter: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const W = Math.max(12, Math.min(20, ctx.info.w - 1.0)), D = Math.max(4.4, Math.min(6.0, ctx.info.d - 0.4)), H = 5.2;
  sink.span('stone', -W / 2, -0.3, -D / 2, W / 2, 0.12, D / 2);
  const steel = rgb(0x7a7e80);
  for (let k = 0, n = Math.max(3, Math.round(W / 5) + 1); k < n; k++) {
    const x = -W / 2 + 0.25 + (W - 0.5) * k / (n - 1);
    for (const z of [-D / 2 + 0.25, D / 2 - 0.25]) sink.span('structureMetal', x - 0.12, 0.12, z - 0.12, x + 0.12, H, z + 0.12, { colour: steel });
    sink.span('structureMetal', x - 0.1, H - 0.4, -D / 2 + 0.1, x + 0.1, H, D / 2 - 0.1, { colour: steel });
  }
  // (dome-detail-275) its corrugated sheets in their lapped courses
  const roof: RoofSpec = { kind: 'gable', pitchDeg: 6, eave: 0.4, verge: 0.3, thickness: 0.06, bucket: 'structureMetal', ridge: 'saddle', relief: SHEET };
  sink.placed(Math.PI / 2, 0, 0, 0, () => emitRoof(sink, roofGeometry(D, W, H, roof), roof, pick(rng, SAND_SHEET)));
  return sink.finish();
};

/** The village water tower: four concrete legs with ring beams, a rendered concrete tank, a ladder (watertower). */
const concreteTower: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const S = Math.max(3.6, Math.min(5.0, Math.min(ctx.info.w, ctx.info.d) - 0.4)), legH = 9.0, tankH = 3.2;
  const c = S / 2 - 0.3;
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) sink.span('plaster', sx * c - 0.22, -0.3, sz * c - 0.22, sx * c + 0.22, legH, sz * c + 0.22);
  for (const y of [3.2, 6.2]) {
    sink.span('plaster', -c - 0.15, y, -c - 0.15, c + 0.15, y + 0.3, -c + 0.15);
    sink.span('plaster', -c - 0.15, y, c - 0.15, c + 0.15, y + 0.3, c + 0.15);
    sink.span('plaster', -c - 0.15, y, -c + 0.15, -c + 0.15, y + 0.3, c - 0.15);
    sink.span('plaster', c - 0.15, y, -c + 0.15, c + 0.15, y + 0.3, c - 0.15);
  }
  sink.span('plaster', -S / 2, legH, -S / 2, S / 2, legH + tankH, S / 2);
  sink.span('plaster', -S / 2 - 0.12, legH + tankH, -S / 2 - 0.12, S / 2 + 0.12, legH + tankH + 0.25, S / 2 + 0.12);
  // the ladder (the buildings and landmarks lane, 2026-10-10, the connectivity sweep: its rungs hung in the air between
  // the legs, with no stiles): two stiles from the ground up past the tank's parapet, standing off the ring beams and the
  // tank on brackets, the rungs between them
  const lx = S / 2 + 0.1, iron = { colour: rgb(0x5a5e60), decor: true }, top = legH + tankH + 1.15;
  for (const z of [-0.24, 0.24]) {
    sink.span('structureMetal', lx - 0.025, -0.1, z - 0.025, lx + 0.025, top, z + 0.025, iron);
    for (const y of [3.35, 6.35, legH + 0.6, legH + tankH - 0.4]) {
      const x0 = y < legH ? c + 0.1 : S / 2 - 0.02;
      sink.span('structureMetal', x0, y - 0.025, z - 0.02, lx + 0.02, y + 0.025, z + 0.02, iron);
    }
  }
  for (let y = 0.4; y < legH + tankH + 0.9; y += 0.35) sink.span('structureMetal', lx - 0.02, y, -0.24, lx + 0.02, y + 0.04, 0.24, iron);
  return sink.finish();
};

/**
 * The mosque's minaret: a slender rendered shaft on a square base, a balcony ring, a lantern and a pointed cap. (Props
 * census #5, lane B 2026-10-15; the judges: "a blank shaft on a solid block") the base's door and the shaft's stair lights
 * cut in reveals, climbing round the shaft as its stair does; the muezzin's lantern open on four sides; the shaft recorded
 * as a tower body (it topples in its courses, the cap its crown).
 * (dome-detail-275; the worklist: "a plain shaft with a blocky gallery") the village minaret of southern Jordan as it is
 * built: the square base on a stepped stone apron, corner pilasters and a stepped cornice, its door in a pointed arch of
 * dressed stone over a painted tympanum and the foundation plaque; the square brought to the octagon in sloped broaches;
 * the shaft in two stages under string courses, a blind pointed niche up each facet of the upper stage, a hood and a
 * sill to each stair light, the loudspeakers' cable up one arris; the balcony corbelled out in three stepped rings, the
 * green light-strip round its edge, its pierced balustrade of posts and balusters under a coping; the lantern's openings
 * under pointed hoods, the four horn loudspeakers on their brackets between them, a stepped cornice; the cap a slender
 * pencil cone on its collar and the brass alem with its crescent; the rain's stains under the balcony.
 */
function pointedArch(a: number, rise: number, n: number): Array<[number, number]> {
  // a two-centred arch of half-span a and rise `rise` over its springing at (0, 0): from the right springing over the
  // apex to the left (counter-clockwise seen from the face, as prism wants it) (dome-detail-275)
  const R = (a * a + rise * rise) / (2 * a), c = a - R, top = Math.acos(Math.max(-1, Math.min(1, -c / R)));
  const pts: Array<[number, number]> = [];
  for (let i = 0; i <= n; i++) { const t = top * i / n; pts.push([c + R * Math.cos(t), R * Math.sin(t)]); }
  for (let i = n - 1; i >= 0; i--) { const t = top * i / n; pts.push([-(c + R * Math.cos(t)), R * Math.sin(t)]); }
  return pts;
}

/** A pointed arch's ring laid flat `o` proud of a face (a niche's or a hood's head): `ringW` wide about the arch line. */
function archRing(sink: PartSink, bucket: RegionalBucket, face: Face, u: number, y: number, a: number, rise: number, ringW: number, n: number, o: number,
  opts: EmitOptions): void {
  const lo = pointedArch(a - ringW / 2, rise - ringW / 2, n), hi = pointedArch(a + ringW / 2, rise + ringW / 2, n);
  const P = ([pu, py]: [number, number]) => facePoint(face, u + pu, y + py, o);
  for (let j = 0; j + 1 < lo.length; j++) sink.quad(bucket, P(lo[j + 1]), P(lo[j]), P(hi[j]), P(hi[j + 1]), opts);
}

/** The eight facets of an octagon of apothem `a` about the axis, facet 0 facing +z (holedShaft's turn) (dome-detail-275). */
function octFaces(a: number): Face[] {
  const w = 2 * a * Math.tan(Math.PI / 8);
  return Array.from({ length: 8 }, (_, i): Face => {
    const t = Math.PI / 2 - i * Math.PI / 4, out: Vec3 = [Math.cos(t), 0, Math.sin(t)];
    return { origin: [out[0] * a, 0, out[2] * a], u: [out[2], 0, -out[0]], out, width: w };
  });
}

const minaret: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const look = ctx.variant;
  const H = Math.max(10, Math.min(13, ctx.info.h)), B = 2.6, k = H / 13;
  const P8 = Math.PI / 8, lime = { tint: [1.1, 1.07, 1.0] as Rgb };
  const dressed = { tint: [1.12, 1.06, 0.96] as Rgb }, brass = rgb(0xa08a52), grey = rgb(0x9a9a94);
  // the heights: the base's head, the broach's, the string course, the balcony's corbels, floor and parapet, the lantern
  const yb = 3.4, ys = yb + 0.6, sc = ys + 1.1, bal = 8.2 * k, fl = bal + 0.45, ff = fl + 0.15;
  // the apron: a stepped stone platform the base stands on (dome-detail-275), the dust darker at the foot
  const scour = (p: Vec3) => (p[1] < 0.6 ? 0.82 : p[1] < 1.3 ? 0.92 : 1.0);
  sink.span('stone', -1.85, -0.3, -1.85, 1.85, 0.1, 1.85, { decor: true, shade: 0.9 });
  // the base: a rendered block on its stone footing, the door cut in its front
  sink.span('stone', -B / 2 - 0.08, -0.3, -B / 2 - 0.08, B / 2 + 0.08, 0.25, B / 2 + 0.08);
  const door: HoleRect = { u0: -0.45, u1: 0.45, y0: 0.25, y1: 2.15 };
  const win: HoleRect = { u0: -0.22, u1: 0.22, y0: 1.55, y1: 2.25 };
  const base = holedBox(sink, 'plaster', -B / 2, -B / 2, B / 2, B / 2, 0.25, yb, { front: [door], right: [win], left: [win] }, 0.35, 0.28, { shadeAt: scour });
  // (dome-detail-275) the base's corner pilasters (each face's running past the corner over its neighbour's end), its
  // stepped cornice; the door's dressed jambs and pointed arch over a painted tympanum, the foundation plaque over it
  for (const fn of ['front', 'right', 'back', 'left'] as const) {
    const f = base[fn];
    for (const e of [-1, 1]) faceBox(sink, 'plaster', f, e * (B / 2 - 0.125), (0.25 + yb - 0.28) / 2, 0.025, 0.3, yb - 0.28 - 0.25, 0.05, { ...lime, decor: true, shadeAt: scour }, 'caps');
  }
  sink.band('plaster', -B / 2 - 0.07, yb - 0.28, -B / 2 - 0.07, B / 2 + 0.07, yb - 0.1, B / 2 + 0.07, { ...lime, decor: true });
  sink.band('plaster', -B / 2 - 0.14, yb - 0.1, -B / 2 - 0.14, B / 2 + 0.14, yb, B / 2 + 0.14, { ...lime, decor: true });
  {
    const f = base.front, ja = 0.45 + 0.08, spring = door.y1, rise = 0.55;
    for (const e of [-1, 1]) faceBox(sink, 'stone', f, e * ja, (0.25 + spring) / 2, 0.035, 0.16, spring - 0.25, 0.07, { ...dressed, decor: true }, 'caps');
    const arch = pointedArch(ja, rise, 4);
    sink.prism('plaster', arch.map(([u, y]) => facePoint(f, u * 0.9, spring + y * 0.9, 0)), f.out, 0.02, { decor: true, tint: [0.62, 0.8, 0.68] });
    for (let i = 0; i + 1 < arch.length; i++) {
      const [ua, ya] = arch[i], [ub, yb2] = arch[i + 1];
      sink.member('stone', facePoint(f, ua, spring + ya, 0), facePoint(f, ub, spring + yb2, 0), 0.16, 0.07, f.out, { ...dressed, decor: true });
    }
    faceBox(sink, 'structureWood', f, 0, spring + rise + 0.22, 0.02, 1.0, 0.26, 0.04, { colour: rgb(0x2f5a46), decor: true });
    faceBox(sink, 'structureWood', f, 0, spring + rise + 0.22, 0.045, 0.8, 0.07, 0.01, { colour: rgb(0xd8cfa8), decor: true, fine: 'near' });
  }
  // the broaches: the base's square brought to the shaft's octagon on a sloped course (dome-detail-275)
  const r = 0.95;
  sink.cylinder('plaster', [0, yb, 0], 'y', ys - yb, (B / 2) / Math.cos(P8), 8, lime, r, false, P8);
  // the shaft: eight facets, its stair's lights cut round it (each a quarter turn and a metre up from the last)
  const light = (y: number): HoleRect[] => [{ u0: -0.12, u1: 0.12, y0: y, y1: y + 0.55 }];
  const holes: Array<HoleRect[] | undefined> = [];
  for (let i = 0, y = ys + 0.4; y + 0.55 < bal - 0.5; i++, y += 1.05) holes[(i * 2) % 8] = [...(holes[(i * 2) % 8] ?? []), ...light(y)];
  const shaft = holedShaft(sink, 'plaster', 0, 0, r, 8, 0, ys, bal, holes, 0.22, 0.16);
  // (dome-detail-275) the string courses between the stages and under the corbels; each facet's upper stage a blind
  // pointed niche (its strips and head 5 cm proud); the lights' hoods and sills; the cable up one arris to the horns; the
  // rain's stains down a few facets from the balcony
  for (const [y, h] of [[sc, 0.16], [bal - 0.2, 0.2]] as const) sink.cylinder('plaster', [0, y, 0], 'y', h, r + 0.06, 8, { ...lime, decor: true }, r + 0.06, true, P8);
  // (the niche stands on the string course)
  const n0 = sc + 0.16, n1 = bal - 0.75, na = 0.24, nr = 0.32;
  shaft.forEach((f, i) => {
    // (their heads open under the flat ring: closed, the ray casts see into them)
    for (const e of [-1, 1]) faceBox(sink, 'plaster', f, e * na, (n0 + n1) / 2, 0.025, 0.07, n1 - n0, 0.05, { ...lime, decor: true }, { bottom: true });
    archRing(sink, 'plaster', f, 0, n1, na, nr, 0.07, 2, 0.05, { ...lime, decor: true });
    for (const h of holes[i] ?? []) {
      faceBox(sink, 'plaster', f, 0, h.y1 + 0.05, 0.05, 0.36, 0.08, 0.1, { ...lime, decor: true });
      faceBox(sink, 'plaster', f, 0, h.y0 - 0.04, 0.04, 0.32, 0.06, 0.08, { ...lime, decor: true });
    }
    if (i % 2 === 1 && look() < 0.6) {
      const len = 1.2 + look() * 1.6;
      for (let b = 0; b < 3; b++) {
        const t = b / 3, w = 0.22 * (1 - 0.5 * t);
        facePanel(sink, 'plaster', f, (look() - 0.5) * 0.1, bal - 0.2 - len * (t + 1 / 6), 0.004 + b * 0.001, w, len / 3 + 0.01, { decor: true, tint: [0.84 + 0.05 * t, 0.8 + 0.05 * t, 0.74 + 0.06 * t] });
      }
    }
  });
  {
    const f = shaft[3];
    faceBox(sink, 'structureMetal', f, f.width / 2 - 0.05, (ys + bal - 0.2) / 2, 0.015, 0.03, bal - 0.2 - ys, 0.03, { colour: grey, decor: true });
  }
  // the balcony: corbelled out in three stepped rings under its floor slab (dome-detail-275: a single slab before), the
  // green light-strip round its edge, its balustrade (an open ring shows its inner faces from above: each facet a run of
  // its own, faced both sides): a kerb, a post at each corner, the balusters between, the coping
  for (const [j, rr] of [[0, r + 0.12], [1, r + 0.26], [2, r + 0.4]] as const) {
    sink.cylinder('plaster', [0, bal + j * 0.15, 0], 'y', 0.15, rr, 8, { ...lime, decor: j < 2, shade: 0.94 + j * 0.03 }, rr, true, P8);
  }
  const R = 1.48;
  sink.cylinder('plaster', [0, fl, 0], 'y', 0.15, R, 8, lime, R, true, P8);
  sink.cylinder('structureWood', [0, fl + 0.04, 0], 'y', 0.05, R + 0.012, 8, { colour: rgb(0x3fae62), decor: true }, R + 0.012, false, P8);
  // (each run's faces laid on a facet 10 cm inside its middle line, so the box is not seated on it and keeps its inner face)
  const ga = R * Math.cos(P8) - 0.17, gf = octFaces(ga), kh = 0.22, ph = 0.95, go = 0.1;
  for (const f of gf) {
    const w = f.width + 0.06 + 2 * go * Math.tan(P8);
    faceBox(sink, 'plaster', f, 0, ff + kh / 2, go, w, kh, 0.12, { ...lime, decor: true });
    faceBox(sink, 'plaster', f, 0, ff + ph - 0.04, go, w + 0.04, 0.08, 0.16, { ...lime, decor: true });
    faceBox(sink, 'plaster', f, -w / 2 + 0.08, ff + (kh + ph - 0.08) / 2, go, 0.1, ph - 0.08 - kh, 0.1, { ...lime, decor: true }, 'caps');
    for (let b = 1; b <= 3; b++) {
      faceBox(sink, 'plaster', f, -w / 2 + 0.08 + b * (w - 0.16) / 4 + (look() - 0.5) * 0.02, ff + (kh + ph - 0.08) / 2, go, 0.06, ph - 0.08 - kh, 0.06,
        { ...lime, decor: true, fine: 'near' }, 'caps');
    }
  }
  // the lantern over it, its four openings to the four quarters
  const lt = ff, lh = 2.0 * k, open: HoleRect = { u0: -0.15, u1: 0.15, y0: lt + 0.6, y1: lt + lh - 0.45 };
  const lr = 0.74;
  const lantern = holedShaft(sink, 'plaster', 0, 0, lr, 8, 0, lt, lt + lh, [[open], undefined, [open], undefined, [open], undefined, [open]], 0.16, 0.12);
  // (dome-detail-275) a pointed hood over each opening; the horn loudspeakers on their brackets on the facets between,
  // one to each quarter; the stepped cornice
  lantern.forEach((f, i) => {
    if (i % 2 === 0) {
      archRing(sink, 'plaster', f, 0, open.y1 + 0.03, 0.21, 0.28, 0.06, 2, 0.05, { ...lime, decor: true });
      for (const e of [-1, 1]) faceBox(sink, 'plaster', f, e * 0.21, (open.y0 + open.y1 + 0.03) / 2, 0.025, 0.06, open.y1 + 0.03 - open.y0, 0.05, { ...lime, decor: true }, { bottom: true });
      faceBox(sink, 'plaster', f, 0, open.y0 - 0.03, 0.04, 0.5, 0.06, 0.08, { ...lime, decor: true });
    } else {
      const y = lt + lh * 0.62;
      faceBox(sink, 'structureMetal', f, 0, y, 0.09, 0.06, 0.3, 0.18, { colour: grey, decor: true });
      sink.pipe('structureMetal', facePoint(f, 0, y + 0.02, 0.17), facePoint(f, 0, y - 0.1, 0.58), 0.06, 6, { colour: rgb(0xc8c6bc), decor: true, caps: true }, 0.17);
    }
  });
  const capY = lt + lh;
  sink.cylinder('plaster', [0, capY, 0], 'y', 0.1, lr + 0.08, 8, { ...lime, decor: true }, lr + 0.08, true, P8);
  sink.cylinder('plaster', [0, capY + 0.1, 0], 'y', 0.12, lr + 0.16, 8, { ...lime, decor: true }, lr + 0.16, true, P8);
  // the cap: a collar, then the pencil cone turned smooth (dome-detail-275: an eight-facet frustum before), the alem
  const cone = 2.1 * k, coneY = capY + 0.22;
  sink.cylinder('plaster', [0, coneY, 0], 'y', 0.12, 0.8, 16, {}, 0.8, true);
  sink.revolve('plaster', [0, coneY + 0.12, 0], 'y', smoothProfile([[0, 0.74], [cone * 0.35, 0.6], [cone * 0.7, 0.33], [cone, 0]], 2), 16, {});
  finialOn(sink, 0, coneY + 0.12 + cone - 0.02, 0, 0.75, brass, 'alem');
  // the units at the back of their reveals: the plank door, the side windows' grilles, the lights' dark frames
  const frame = rgb(0x4a4038);
  sink.recess = 0.28;
  try {
    doorUnit(sink, base.front, 0, door.y0, door.u1 - door.u0, door.y1 - door.y0, { leaf: rgb(0x3f5f6a), frame: { bucket: 'plaster', width: 0.14, out: 0.04 },
      steps: { bucket: 'stone' }, leafKind: 'plank' }, door.y0);
    const grille: WindowStyle = { frame: rgb(0x3e4446), frameWidth: 0.04, frameOut: 0.03, bars: 'six', surround: null, sill: { bucket: 'stone', out: 0.06 }, shutters: null };
    for (const f of [base.right, base.left]) windowUnit(sink, f, 0, win.y0, win.u1 - win.u0, win.y1 - win.y0, grille, look, 0.2);
  } finally { sink.recess = 0; }
  sink.recess = 0.16;
  try {
    shaft.forEach((f, i) => { for (const h of holes[i] ?? []) windowUnit(sink, f, 0, h.y0, h.u1 - h.u0, h.y1 - h.y0, { frame, frameWidth: 0.03, frameOut: 0.02, bars: 'none', surround: null, sill: null, shutters: null }, ctx.rng, 0.1); });
  } finally { sink.recess = 0; }
  recordShaft(sink, 0, 0, 2 * r, coneY + 0.12 + cone, 'plaster', true);
  return sink.finish();
};

const WADIRUM_BUILDERS: Readonly<Record<string, RegionalBuilder>> = Object.freeze({
  adobe: blockHouse,
  depot: steelStore,
  warehouse: steelStore,
  factory: steelStore,
  caravanserai: fort,
  // the walled compounds of the village edge read as the patrol post's enclosure
  compound: fort,
  compoundSouk: fort,
  ruin,
  marketRow: souqRow,
  containerRow: lockUps,
  gantry: lorryShelter,
  watertower: concreteTower,
  minaret,
});

export const WADIRUM_STYLE: ArchitectureStyle = Object.freeze<ArchitectureStyle>({
  id: 'wadirum',
  region: 'Wadi Rum, southern Jordan: flat-roofed block houses with rooftop tanks and rebar, the Desert Patrol fort, steel stores',
  surfaces: {
    roof: { kind: 'sheet', tint: [0.70, 0.68, 0.62] },
    // (the Redrock lane, 2026-10-07: the fort and the bare walls in the valley's own sandstone, laid in courses, where a
    // grey concrete block stood; the render finer and shallower than the shared tile — the fort's "cork" print)
    stone: { kind: 'sandstone', tint: [0.80, 0.62, 0.48] },
    sourced: { plaster: true, wood: true },
    relief: { plasterUv: 1.8, normal: 0.22, ao: 0.32 },
    // (MAPS 227, Redrock's blind critics on v2: "flat olive and beige house boxes", "an untextured flat olive box") the
    // second and third render families were the shared canvas's generic shifts — a khaki that reads olive in the shade,
    // and a dull brown-grey. Rum's houses are rendered sand (the first family, the sourced render under the map's tint),
    // bare cement-grey block render, or a pale cream wash: the kit's own two paints
    tones: {
      plaster2: (_h, s, l) => [0.1, Math.min(1, s * 0.3), Math.min(1, l * 1.2)],
      plaster3: (_h, s, l) => [0.105, Math.min(1, s * 0.4 + 0.16), Math.min(1, l * 1.25 + 0.07)],
    },
  },
  builders: WADIRUM_BUILDERS,
  // the courtyards: a block wall round the house's court, a gate (yards.ts)
  yard: { kinds: ['adobe'], fence: 'walladobe', gate: 'gateadobe', shed: null, garden: false },
});

export type { RegionalParts };
