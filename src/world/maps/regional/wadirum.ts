// src/world/maps/regional/wadirum.ts — the Wadi Rum kit (Redrock Divide: a desert outpost in the Wadi Rum country of
// southern Jordan). Flat-roofed houses of concrete block, bare grey or rendered sand-ochre, with the reinforcing bars of
// the next storey left standing at the corners and black water tanks on the roof, steel doors painted green or blue,
// window grilles; the Desert Patrol's fort, crenellated with corner towers; steel-portal stores and workshops under
// low corrugated roofs instead of tiles; walled compounds of block houses.
import { PartSink, alongPlot, faceBox, pick, plotAxes, rgb, type Face, type RegionalBucket, type RegionalParts, type Rgb } from './geometry.ts';
import { buildHouse, emitRoof, roofGeometry, windowRhythm, type HouseDialect, type Opening, type RoofSpec } from './house.ts';
import { doorUnit, gateUnit, windowUnit, type WindowStyle } from './openings.ts';
import type { ArchitectureStyle, RegionalBuildContext, RegionalBuilder } from './types.ts';

const STEEL_DOORS: readonly Rgb[] = [0x3f6a5a, 0x3e5f86, 0x6a6e70, 0x8a6a3e].map(rgb);
const TANK = rgb(0x262626), REBAR = rgb(0x5a3e2e);
const SAND_SHEET: readonly Rgb[] = [0xc8b48e, 0xbcae96, 0xd6ccb4].map(rgb);

function uvOffset(ctx: RegionalBuildContext): [number, number] {
  return [ctx.rng() * 7.31, ctx.rng() * 5.17];
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
    sink.cylinder('structureMetal', [x, top + 0.6, z], 'y', 1.1, 0.55, 10, { colour: TANK, decor: true });
  }
}

/** The block house: one or two storeys of concrete block, flat roof, parapet, steel door, grilles, roof furniture. */
const blockHouse: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const W = Math.max(5.0, ctx.info.w - 0.3), D = Math.max(5.4, ctx.info.d - 0.3);
  const rendered = ctx.wallBucket !== 'stone' && rng() < 0.7;
  const wall: RegionalBucket = rendered ? (ctx.wallBucket as RegionalBucket) : 'stone';
  const door = pick(rng, STEEL_DOORS);
  const style: WindowStyle = { frame: rgb(0x5a5e60), frameWidth: 0.05, frameOut: 0.04, bars: 'six', surround: null, sill: { bucket: 'plaster', out: 0.06 }, shutters: null };
  const count = rng() < 0.3 ? 2 : 1;
  const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'door', u: (rng() - 0.5) * W * 0.3, w: 1.0, y0: 0, h: 2.1 }];
  for (let i = 0; i < count; i++) for (const face of ['front', 'left', 'right', 'back'] as const) {
    for (const o of windowRhythm(face, i, face === 'front' || face === 'back' ? W : D, { w: 0.9, h: 1.0, sill: 1.1, spacing: 2.6, margin: 1.0, max: 2,
      avoid: face === 'front' && i === 0 ? [[openings[0].u - 0.8, openings[0].u + 0.8]] : [] })) if (face !== 'back' || rng() < 0.5) openings.push(o);
  }
  const dialect: HouseDialect = {
    window: (s, face, o, y0) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, style, rng, 0.4),
    door: (s, face, o, y0) => doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { leaf: door, frame: { bucket: 'plaster', width: 0.12, out: 0.04 }, steps: { bucket: 'stone' }, leafKind: 'panel' }, y0 + o.y0),
  };
  const frame = buildHouse(sink, {
    w: W, d: D, plinth: { h: 0.25, out: 0.05, bucket: 'stone' }, storeys: Array.from({ length: count }, () => ({ h: 3.0, wall })),
    roof: { kind: 'flat', pitchDeg: 0, eave: 0.08, verge: 0.08, thickness: 0.2, bucket: wall, parapet: 0.6 }, gableBucket: wall,
    openings, chimneys: [], gutters: null, verge: null,
  }, dialect);
  rooftop(sink, W, D, frame.eaveY + 0.2, rng);
  return sink.finish();
};

/** A steel-portal store: block plinth walls, sheet cladding in a sand livery, a low corrugated roof, a roller door. */
const steelStore: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const W = Math.max(8, Math.min(18, ctx.info.w - 0.6)), D = Math.max(10, Math.min(28, ctx.info.d - 0.6));
  const livery = pick(rng, SAND_SHEET);
  sink.span('stone', -W / 2, -0.3, -D / 2, W / 2, 1.2, D / 2);
  sink.span('structureMetal', -W / 2, 1.2, -D / 2, W / 2, 5.2, D / 2, { colour: livery });
  const roof: RoofSpec = { kind: 'gable', pitchDeg: 8, eave: 0.35, verge: 0.25, thickness: 0.08, bucket: 'structureMetal', ridge: 'saddle' };
  emitRoof(sink, roofGeometry(W, D, 5.2, roof), roof, rgb(0xb4b0a6));
  const front: Face = { origin: [0, 0, D / 2], u: [1, 0, 0], out: [0, 0, 1], width: W };
  gateUnit(sink, front, 0, 0, Math.min(4.2, W - 2), 4.0, rgb(0x8a8e90), { bucket: 'structureMetal', width: 0.2, out: 0.06, colour: rgb(0x6a6e70) });
  for (const side of [-1, 1]) {
    const f: Face = { origin: [side * W / 2, 0, 0], u: [0, 0, -side], out: [side, 0, 0], width: D };
    for (let u = -D / 2 + 2; u < D / 2 - 1; u += 4) faceBox(sink, 'glass', f, u, 4.4, 0.01, 2.0, 0.6, 0.02, { decor: true });
  }
  return sink.finish();
};

/** The Desert Patrol fort: a square crenellated court, corner towers, a gate with the flagpole over it. */
const fort: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  // the corner towers (3.2 m square) stand half a tower out from the walls' corners: walls inset so they stay in the plot
  const W = Math.max(12, Math.min(22, ctx.info.w - 2.0)), D = Math.max(11, Math.min(20, ctx.info.d - 2.0));
  const t = 0.8, h = 5.0;
  const wall: RegionalBucket = 'plaster2';
  sink.span(wall, -W / 2, -0.3, -D / 2, W / 2, h, -D / 2 + t);
  sink.span(wall, -W / 2, -0.3, D / 2 - t, -1.8, h, D / 2);
  sink.span(wall, 1.8, -0.3, D / 2 - t, W / 2, h, D / 2);
  sink.span(wall, -W / 2, -0.3, -D / 2 + t, -W / 2 + t, h, D / 2 - t);
  sink.span(wall, W / 2 - t, -0.3, -D / 2 + t, W / 2, h, D / 2 - t);
  sink.span(wall, -2.0, 3.6, D / 2 - t - 0.1, 2.0, h + 0.6, D / 2 + 0.1);
  // crenellations along the parapet
  const merlon = (x0: number, z0: number, x1: number, z1: number) => sink.span(wall, x0, h, z0, x1, h + 0.7, z1, { decor: true });
  for (let x = -W / 2 + 0.4; x < W / 2 - 0.4; x += 1.4) { merlon(x, -D / 2, x + 0.7, -D / 2 + t); if (Math.abs(x) > 2.4) merlon(x, D / 2 - t, x + 0.7, D / 2); }
  for (let z = -D / 2 + 1.4; z < D / 2 - 1.4; z += 1.4) { merlon(-W / 2, z, -W / 2 + t, z + 0.7); merlon(W / 2 - t, z, W / 2, z + 0.7); }
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const tx = sx * (W / 2 - 0.8), tz = sz * (D / 2 - 0.8);
    sink.span(wall, tx - 1.6, -0.3, tz - 1.6, tx + 1.6, h + 2.2, tz + 1.6);
  }
  // the closed gate's backing in the wall gap
  sink.span(wall, -1.8, -0.3, D / 2 - t, 1.8, 3.6, D / 2 - 0.1);
  const gate: Face = { origin: [0, 0, D / 2 - 0.1], u: [1, 0, 0], out: [0, 0, 1], width: 4 };
  gateUnit(sink, gate, 0, 0, 3.4, 3.4, rgb(0x5a4a3a), { bucket: 'plaster', width: 0.3, out: 0.1 });
  sink.span('structureMetal', -0.05, h + 0.6, D / 2 - 0.4, 0.05, h + 7.6, D / 2 - 0.3, { colour: rgb(0x8a8e90), decor: true });
  // the quarters inside along the back wall
  sink.span('plaster', -W / 2 + t, -0.3, -D / 2 + t, W / 2 - t, 3.2, -D / 2 + t + 4.0);
  return sink.finish();
};

/** A shelled block house: walls broken to stumps, the slab fallen in, rebar curling from the breaks. */
const ruin: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const W = Math.max(5.4, ctx.info.w - 0.3), D = Math.max(6, ctx.info.d - 0.3), t = 0.25;
  for (const [x0, z0, x1, z1] of [[-W / 2, -D / 2, W / 2, -D / 2 + t], [-W / 2, D / 2 - t, W / 2, D / 2], [-W / 2, -D / 2 + t, -W / 2 + t, D / 2 - t], [W / 2 - t, -D / 2 + t, W / 2, D / 2 - t]] as const) {
    const along = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    for (let k = 0; k < 4; k++) {
      if (rng() < 0.3) continue;
      const a = k / 4, b = (k + 1) / 4, top = 0.6 + rng() * 2.4;
      if (along) sink.span('stone', x0 + (x1 - x0) * a, -0.3, z0, x0 + (x1 - x0) * b, top, z1);
      else sink.span('stone', x0, -0.3, z0 + (z1 - z0) * a, x1, top, z0 + (z1 - z0) * b);
    }
  }
  sink.member('plaster', [-W * 0.35, 0.2, -D * 0.2], [W * 0.3, 1.6, D * 0.25], 2.2, 0.2, [0, 1, 0], { decor: true, exposed: true });
  rooftop(sink, W * 0.5, D * 0.5, 0.2, rng);
  return sink.finish();
};

// ---- the base plots the first kit left to the generic yard (gauntlet wave 15: containers, gantries and steel water
// towers read as a rail yard, not a Jordanian desert outpost)

/** A shop row of the souq: one storey of rendered block, a run of shopfronts with rolling shutters and awnings, a flat
 *  roof behind a parapet with its tanks (the base marketRow plot). */
const souqRow: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  // the base market row's plot is wider than deep: the row lies along it, its shopfronts (+x) down one long side
  const plot = plotAxes(ctx.info);
  const W = Math.max(plot.turned ? 4.2 : 6, Math.min(10, plot.w - 0.6)), D = Math.max(plot.turned ? 6 : 10, Math.min(18, plot.d - 0.6));
  const H = 3.6, wall: RegionalBucket = ctx.wallBucket === 'stone' ? 'plaster' : ctx.wallBucket as RegionalBucket;
  const awning = plot.turned ? 0.8 : 1.1;
  alongPlot(sink, plot.turned, () => {
    sink.span('stone', -W / 2 - 0.05, -0.3, -D / 2 - 0.05, W / 2 + 0.05, 0.25, D / 2 + 0.05);
    sink.span(wall, -W / 2, 0.25, -D / 2, W / 2, H, D / 2);
    for (const [x0, z0, x1, z1] of [[-W / 2, -D / 2, W / 2, -D / 2 + 0.22], [-W / 2, D / 2 - 0.22, W / 2, D / 2], [-W / 2, -D / 2, -W / 2 + 0.22, D / 2], [W / 2 - 0.22, -D / 2, W / 2, D / 2]] as const) {
      sink.span(wall, x0, H, z0, x1, H + 0.6, z1);
    }
    // the shopfronts along the street side (+x): rolling shutters half up over dark shops, an awning over each
    const face: Face = { origin: [W / 2, 0, 0], u: [0, 0, -1], out: [1, 0, 0], width: D };
    const n = Math.max(2, Math.floor(D / 3.2));
    for (let k = 0; k < n; k++) {
      const u = -D / 2 + (k + 0.5) * D / n, w = D / n - 0.7;
      faceBox(sink, 'dark', face, u, 1.45, 0.005, w, 2.3, 0.02, { decor: true });
      faceBox(sink, 'structureMetal', face, u, 2.15 + rng() * 0.25, 0.04, w, 0.9 + rng() * 0.4, 0.05, { colour: rgb(0x8a8e90), decor: true });
      faceBox(sink, 'structureMetal', face, u, 2.95, awning / 2, w + 0.3, 0.05, awning, { colour: pick(rng, SAND_SHEET), decor: true });
      faceBox(sink, 'structureWood', face, u, 3.3, 0.03, w * 0.8, 0.35, 0.04, { colour: pick(rng, STEEL_DOORS), decor: true });
    }
    rooftop(sink, W, D, H, rng);
  }, 1);
  return sink.finish();
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
  const roof: RoofSpec = { kind: 'gable', pitchDeg: 6, eave: 0.4, verge: 0.3, thickness: 0.06, bucket: 'structureMetal', ridge: 'saddle' };
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
  for (let y = 0.4; y < legH + tankH; y += 0.35) sink.span('structureMetal', c + 0.22, y, -0.25, c + 0.26, y + 0.04, 0.25, { colour: rgb(0x5a5e60), decor: true });
  return sink.finish();
};

/** The mosque's minaret: a slender rendered shaft on a square base, a balcony ring, a lantern and a pointed cap. */
const minaret: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const H = Math.max(10, Math.min(13, ctx.info.h)), B = 2.6;
  sink.span('stone', -B / 2, -0.3, -B / 2, B / 2, 2.4, B / 2);
  sink.cylinder('plaster', [0, 2.4, 0], 'y', H * 0.62 - 2.4, 0.95, 8, {}, 0.82, true, Math.PI / 8);
  const bal = H * 0.62;
  // the balcony: a corbelled slab and its solid parapet drum (an open ring shows its inner faces from above)
  sink.cylinder('plaster', [0, bal, 0], 'y', 0.3, 1.35, 8, {}, 1.35, true, Math.PI / 8);
  sink.cylinder('plaster', [0, bal + 0.3, 0], 'y', 0.55, 1.3, 8, { decor: true }, 1.3, true, Math.PI / 8);
  sink.cylinder('plaster', [0, bal + 0.3, 0], 'y', H * 0.2, 0.7, 8, {}, 0.7, true, Math.PI / 8);
  sink.cylinder('structureMetal', [0, bal + 0.3 + H * 0.2, 0], 'y', H * 0.16, 0.78, 8, { colour: rgb(0x3f6a5a) }, 0.05, true, Math.PI / 8);
  return sink.finish();
};

export const WADIRUM_BUILDERS: Readonly<Record<string, RegionalBuilder>> = Object.freeze({
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
    stone: { kind: 'block', tint: [0.66, 0.63, 0.58] },
    sourced: { plaster: true, wood: true },
  },
  builders: WADIRUM_BUILDERS,
});

export type { RegionalParts };
