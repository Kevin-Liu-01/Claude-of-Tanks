// src/world/maps/regional/bengal.ts — the Bengal kit (Jade River Delta: a market village on a char of the braided
// Jamuna). Homesteads raised on earthen plinths (bhiti) above the flood line: houses walled and roofed with corrugated
// iron sheet — galvanised, rust-streaked or painted — under four-slope (char-chala) or two-slope roofs, with a bamboo
// veranda and plank shutters; the bazaar's long tin sheds on posts with shuttered stalls; brick shops with a flat roof
// and a signboard; a whitewashed mosque with small domes and a slender minaret; round clay-and-bamboo rice granaries
// (gola) under conical thatch; the river ghat's boat sheds.
import { PartSink, alongPlot, faceBox, pick, plotAxes, rgb, shade, type Face, type RegionalBucket, type RegionalParts, type Rgb, type Vec3 } from './geometry.ts';
import { bevelSpan, orientedPrism } from './millWorks.ts';
import { buildHouse, emitRoof, roofGeometry, storeyFaces, windowRhythm, type HouseDialect, type Opening, type RoofSpec } from './house.ts';
import { corrugatedCladding } from './villageCraft.ts';
import { doorUnit, windowUnit, type WindowStyle } from './openings.ts';
import { BAMBOO_MAT, GALVANISED, PAINTED_SHEET, RUSTED, WEATHERED_PLANK, veranda } from './vernacular.ts';
import type { ArchitectureStyle, RegionalBuildContext, RegionalBuilder } from './types.ts';
import { bengalBazaar } from './marketKits.ts'; // props #23: the char bazaar

const SHUTTERS: readonly Rgb[] = [0x3f6f9a, 0x4f8a62, 0x8a4a3a, 0x6a5a46].map(rgb);

function uvOffset(ctx: RegionalBuildContext): [number, number] {
  return [ctx.rng() * 7.31, ctx.rng() * 5.17];
}

/** The livery of one sheet: galvanised, rusted or painted. */
function sheetColour(rng: () => number): Rgb {
  const roll = rng();
  return roll < 0.45 ? pick(rng, GALVANISED) : roll < 0.75 ? pick(rng, RUSTED) : pick(rng, PAINTED_SHEET);
}

/**
 * The tin house: an earthen plinth, sheet walls on a timber frame, plank shutters, a char-chala sheet roof, a veranda.
 * The big homestead on a farmhouse plot (wider than deep) lies along it with its veranda down one long side
 * (plotAxes); built across the plot, its platform and veranda reached 1.5 m past it.
 */
function tinHouse(ctx: RegionalBuildContext, opts: { big?: boolean } = {}): RegionalParts {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const plot = plotAxes(ctx.info), t = !!opts.big && plot.turned;
  const W = t ? Math.max(4.8, Math.min(8, plot.w - 3.4)) : Math.max(4.8, Math.min(opts.big ? 8 : 6.6, ctx.info.w - 0.6));
  const D = t ? Math.max(6.4, Math.min(12, plot.d - 2.6)) : Math.max(6.4, Math.min(opts.big ? 11 : 9, ctx.info.d - 0.6));
  const plinth = 0.7 + rng() * 0.5;
  alongPlot(sink, t, () => tinHouseBody(sink, ctx, rng, t, W, D, plinth));
  return sink.finish();
}

function tinHouseBody(sink: PartSink, ctx: RegionalBuildContext, rng: () => number, turned: boolean, W: number, D: number, plinth: number): void {
  // the bhiti: a raised earth platform a step wider than the house (rendered in mud plaster), under the veranda too. (Lane
  // C 2026-10-16, the building-detail ratchet: drawn beside a plinthless house spec the census and the damage plan never
  // saw it, and the kit's mid detail read 2 -> 1) it is the house's own plinth, 1.2 m out all round with no dressed course,
  // and a turned house's veranda side 0.4 m wider again
  const bOut = 1.2, bx0 = -W / 2 - (turned ? 1.6 : 1.2), bx1 = W / 2 + 1.2, bz0 = -D / 2 - 1.2, bz1 = D / 2 + 1.2;
  if (turned) sink.span('plaster3', bx0, -0.6, bz0, -W / 2 - bOut, plinth, bz1);
  const wallH = 2.5, walls = sheetColour(rng), frame = pick(rng, WEATHERED_PLANK);
  const mobile = ctx.tier === 'mobile', look = ctx.variant;
  // (the looks lane, 2026-10-15; WORKLIST #15: "bengal tinHouse rebuilt on buildHouse (framed board or mat panels, cut
  // openings)"; the r2 probe: its windows were dark plates on a sheet box) the house on the house grammar: a framed
  // storey whose sheet wall is cut by its door and its shuttered windows, the corrugated sheets laid on it each in its
  // own livery round the cuts (a patched one in five), the frame's corner posts and plate; the plank shutters opening
  // out of the cuts on their hinges, the grilles' bars in them; the bhiti's edges slumped and its mud steps up to the
  // veranda
  const patches: Rgb[] = [];
  for (let k = 0; k < 4; k++) patches.push(sheetColour(rng));
  const livery = (k: number): Rgb => {
    if (k < 0) return shade(walls, 0.97);
    const r = ((k * 2654435761) >>> 0) / 4294967296;
    return r < 0.2 ? patches[k % patches.length] : shade(walls, 0.9 + ((k * 40503) % 17) / 17 * 0.2);
  };
  const shutter = pick(rng, SHUTTERS);
  const style: WindowStyle = { frame, frameWidth: 0.06, frameOut: 0.04, bars: 'two', surround: null, sill: { bucket: 'structureWood', out: 0.06, colour: frame },
    shutters: { colour: shutter, kind: 'plank', closed: 0.25 } };
  const front = turned ? 'left' : 'front';
  const openings: Opening[] = [
    { face: front, storey: 0, kind: 'door', u: (turned ? D : W) * 0.15, w: 0.9, y0: 0, h: 1.95 },
    { face: 'front', storey: 0, kind: 'window', u: -W * 0.25, w: 0.7, y0: 0.95, h: 0.7 },
    { face: 'right', storey: 0, kind: 'window', u: -D * 0.2, w: 0.7, y0: 0.95, h: 0.7 },
    { face: 'right', storey: 0, kind: 'window', u: D * 0.2, w: 0.7, y0: 0.95, h: 0.7 },
    { face: 'left', storey: 0, kind: 'window', u: turned ? -D * 0.22 : 0, w: 0.7, y0: 0.95, h: 0.7 },
  ].filter((o, _i, all) => !(o.kind === 'window' && all.some((q) => q !== o && q.kind === 'door' && q.face === o.face && Math.abs(q.u - o.u) < 1.0))) as Opening[];
  const roof: RoofSpec = { kind: rng() < 0.6 ? 'hip' : 'gable', pitchDeg: 24 + rng() * 6, eave: 0.55, verge: 0.55, thickness: 0.06, bucket: 'structureMetal', ridge: 'saddle' };
  const roofLivery = sheetColour(rng);
  const dialect: HouseDialect = {
    window: (s, face, o, y0) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, style, rng, 0.3),
    door: (s, face, o, y0) => doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { leaf: shutter, frame: { bucket: 'structureWood', width: 0.09, out: 0.05, colour: frame }, steps: null, leafKind: 'plank' }, y0),
  };
  {
    // (the frame's sheet wall behind the cladding, a shade under its sheets: the joints read dark, and no sheet stands
    // darker than the wall it is nailed to)
    const prior = sink.paint;
    sink.paint = shade(walls, 0.5);
    try {
      const hf = buildHouse(sink, {
        w: W, d: D, plinth: { h: plinth, out: bOut, bucket: 'plaster3', course: false }, storeys: [{ h: wallH, wall: 'structureMetal' }],
        roof, roofColour: roofLivery, gableBucket: 'structureMetal',
        openings, chimneys: [], gutters: null, verge: null, reveal: 0.1, spall: null, skirt: null, rafters: null,
      }, dialect);
      // (Lane C 2026-10-16, houseDamage: a framed storey takes its infill from the wall's second layer, which a sheet wall has not, so the damage path threw at damage.ts:325; as the LOOKS fishery fix 182dca492) the storey is unframed and its sheets laid over the walls after the house is built, face by face round each face's openings
      const faces = storeyFaces(hf, 0), body = hf.bodies[0];
      for (const name of ['front', 'right', 'back', 'left'] as const) {
        const face = faces[name];
        corrugatedCladding(sink, face, { u0: -face.width / 2, u1: face.width / 2, y0: body.y0, y1: body.y1 },
          openings.filter((o) => o.face === name && o.storey === 0), livery, frame, { mobile });
      }
    } finally { sink.paint = prior; }
  }
  // the bhiti's edge slumped: a skirt of mud from its top edge out and down to the ground round it, and its steps
  sink.dressing(mobile, () => {
    // (Lane C 2026-10-16, regionalArchitecture's ray audit: the skirt's quads were wound inward) each wound to face out and up
    const slump = 0.45;
    const P = (x: number, y: number, z: number): [number, number, number] => [x, y, z];
    sink.quad('plaster3', P(bx0 - slump, -0.05, bz1 + slump), P(bx1 + slump, -0.05, bz1 + slump), P(bx1, plinth, bz1), P(bx0, plinth, bz1), { decor: true, shade: 0.92 });
    sink.quad('plaster3', P(bx1 + slump, -0.05, bz0 - slump), P(bx0 - slump, -0.05, bz0 - slump), P(bx0, plinth, bz0), P(bx1, plinth, bz0), { decor: true, shade: 0.92 });
    sink.quad('plaster3', P(bx1 + slump, -0.05, bz1 + slump), P(bx1 + slump, -0.05, bz0 - slump), P(bx1, plinth, bz0), P(bx1, plinth, bz1), { decor: true, shade: 0.92 });
    sink.quad('plaster3', P(bx0 - slump, -0.05, bz0 - slump), P(bx0 - slump, -0.05, bz1 + slump), P(bx0, plinth, bz1), P(bx0, plinth, bz0), { decor: true, shade: 0.92 });
    // the mud steps up to the veranda from its middle, a tread a rise
    const n = Math.max(2, Math.round(plinth / 0.26)), r = plinth / n, sz = turned ? 0 : 1;
    for (let k = 0; k < n; k++) {
      const out = 0.32 * (n - k), top = r * (k + 1), w = 1.3 + look() * 0.2;
      if (sz) sink.span('plaster3', -w / 2, -0.3, bz1 + slump * 0.2, w / 2, top, bz1 + slump * 0.2 + out, { decor: true, shade: 0.95 });
      else sink.span('plaster3', bx0 - slump * 0.2 - out, -0.3, -w / 2, bx0 - slump * 0.2, top, w / 2, { decor: true, shade: 0.95 });
    }
  });
  const frontFace: Face = turned ? { origin: [-W / 2, 0, 0], u: [0, 0, 1], out: [-1, 0, 0], width: D } : { origin: [0, 0, D / 2], u: [1, 0, 0], out: [0, 0, 1], width: W };
  veranda(sink, frontFace, plinth, plinth + wallH - 0.1, turned ? D : W, 1.5, rgb(0x9a8a62), { bucket: 'structureMetal', colour: sheetColour(rng) }, false);
}

/**
 * The bazaar shed: a long sheet roof on posts over two rows of shuttered stalls. On a market row's plot (wider than
 * deep) the shed lies along it, its stalls facing both long sides (plotAxes): it no longer reaches 2.4 m past them.
 */
const bazaar: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const plot = plotAxes(ctx.info), m = plot.turned ? 0.25 : 0.5;
  const W = Math.max(plot.turned ? 4.2 : 6, Math.min(10, plot.w - (plot.turned ? 1.0 : 0.6))), D = Math.max(plot.turned ? 6 : 9, Math.min(20, plot.d - 0.6));
  alongPlot(sink, plot.turned, () => {
    sink.span('plaster3', -W / 2 - m, -0.3, -D / 2 - m, W / 2 + m, 0.5, D / 2 + m);
    const top = 3.2;
    for (const sx of [-1, 1]) for (let k = 0, n = Math.max(2, Math.round(D / 3) + 1); k < n; k++) {
      const x = sx * (W / 2 - 0.15), z = -D / 2 + 0.15 + (D - 0.3) * k / (n - 1);
      sink.span('structureWood', x - 0.09, 0.5, z - 0.09, x + 0.09, top, z + 0.09, { colour: BAMBOO_MAT });
    }
    // the stall boxes along the spine, shutters half open
    for (let z = -D / 2 + 1.3; z < D / 2 - 1.0; z += 2.6) for (const side of [-1, 1]) {
      const x = side * 0.9;
      sink.span('structureMetal', x - 0.8, 0.5, z - 1.15, x + 0.8, 2.6, z + 1.15, { colour: sheetColour(rng) });
      faceBox(sink, 'dark', { origin: [x + side * 0.8, 0, z], u: [0, 0, -side], out: [side, 0, 0], width: 2.3 }, 0, 1.55, 0.005, 1.9, 1.6, 0.02, { decor: true });
    }
    const roof: RoofSpec = { kind: 'gable', pitchDeg: 18, eave: plot.turned ? 0.35 : 0.6, verge: 0.4, thickness: 0.06, bucket: 'roof', ridge: 'saddle' };
    emitRoof(sink, roofGeometry(W, D, top, roof), roof);
  });
  return sink.finish();
};

/** A brick shop: two storeys, a flat roof with a parapet, a rolling shutter and a painted signboard. */
const brickShop: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const W = Math.max(6, Math.min(9, ctx.info.w - 0.6)), D = Math.max(7, Math.min(10, ctx.info.d - 0.6));
  const rendered = rng() < 0.5;
  const wall: RegionalBucket = rendered ? 'plaster' : 'stone';
  const style: WindowStyle = { frame: rgb(0x4a5a6a), frameWidth: 0.06, frameOut: 0.04, bars: 'two', surround: null, sill: { bucket: 'plaster', out: 0.08 }, shutters: null };
  const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'gate', u: 0, w: W - 1.6, y0: 0, h: 2.6 }];
  for (const face of ['front', 'left', 'right'] as const) {
    for (const o of windowRhythm(face, 1, face === 'front' ? W : D, { w: 1.1, h: 1.3, sill: 0.9, spacing: 2.2, margin: 0.9 })) openings.push(o);
  }
  const dialect: HouseDialect = {
    window: (s, face, o, y0) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, style, rng, 0.5),
    door: (s, face, o, y0) => {
      // the rolling shutter: a ribbed steel curtain half raised over a dark shopfront
      faceBox(s, 'dark', face, o.u, y0 + o.h / 2, 0.005, o.w, o.h, 0.02, { decor: true });
      faceBox(s, 'structureMetal', face, o.u, y0 + o.h * 0.78, 0.04, o.w, o.h * 0.44, 0.05, { colour: pick(rng, GALVANISED), decor: true });
    },
  };
  const frame = buildHouse(sink, {
    w: W, d: D, plinth: { h: 0.4, out: 0.05, bucket: 'stone' }, storeys: [{ h: 3.2, wall }, { h: 3.0, wall }],
    roof: { kind: 'flat', pitchDeg: 0, eave: 0.12, verge: 0.12, thickness: 0.2, bucket: 'plaster', parapet: 0.8 }, gableBucket: wall,
    openings, chimneys: [], gutters: null, verge: null,
  }, dialect);
  faceBox(sink, 'structureWood', frame.faces.front, 0, 3.0, 0.05, W - 0.8, 0.6, 0.05, { colour: pick(rng, PAINTED_SHEET), decor: true });
  return sink.finish();
};

/** The village mosque: a whitewashed hall, three small domes, a slender minaret at one corner. */
const mosque: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const W = Math.max(6, Math.min(8.5, ctx.info.w - 0.4)), D = Math.max(7.5, Math.min(10, ctx.info.d - 0.4));
  const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'door', u: 0, w: 1.4, y0: 0, h: 2.6 }];
  for (const u of [-W * 0.3, W * 0.3]) openings.push({ face: 'front', storey: 0, kind: 'door', u, w: 1.0, y0: 0, h: 2.3 });
  for (const face of ['left', 'right'] as const) for (const o of windowRhythm(face, 0, D, { w: 0.9, h: 1.6, sill: 0.9, spacing: 2.4, margin: 1.0 })) openings.push(o);
  const dialect: HouseDialect = {
    window: (s, face, o, y0) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { frame: rgb(0x3e6a5a), frameWidth: 0.06, frameOut: 0.04, bars: 'two', surround: { bucket: 'plaster', width: 0.14, out: 0.06, lintel: 0.24 }, sill: null, shutters: null }, ctx.rng, 0.4),
    door: (s, face, o, y0) => doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { leaf: rgb(0x3e6a5a), frame: { bucket: 'plaster', width: 0.18, out: 0.08, arch: true }, steps: { bucket: 'stone' }, leafKind: 'panel' }, y0 + o.y0),
  };
  const frame = buildHouse(sink, {
    w: W, d: D, plinth: { h: 0.6, out: 0.1, bucket: 'stone' }, storeys: [{ h: 4.0, wall: 'plaster' }],
    roof: { kind: 'flat', pitchDeg: 0, eave: 0.15, verge: 0.15, thickness: 0.22, bucket: 'plaster', parapet: 0.6 }, gableBucket: 'plaster',
    openings, chimneys: [], gutters: null, verge: null,
  }, dialect);
  const top = frame.eaveY + 0.22;
  for (const [x, r] of [[-W * 0.3, 0.9], [0, 1.3], [W * 0.3, 0.9]] as const) {
    sink.cylinder('plaster', [x, top, 0], 'y', 0.4, r, 12, {});
    const prof = [1.0, 0.98, 0.9, 0.74, 0.5, 0.2];
    let y = top + 0.4;
    for (let k = 0; k + 1 < prof.length; k++) { sink.cylinder('plaster', [x, y, 0], 'y', r * 0.26, r * prof[k], 12, {}, r * prof[k + 1], k === prof.length - 2); y += r * 0.26; }
    sink.cylinder('structureMetal', [x, y, 0], 'y', 0.5, 0.05, 6, { colour: rgb(0xb8933e), decor: true }, 0.02);
  }
  // the minaret at a rear corner, engaged in the walls (the 225 gate, 2026-10-15: standing clear of the front corner it
  // reached 1.1 m past the chapel's 5.7 m plot, and the front's doors leave it no room there): its shaft reaches at most
  // 0.3 m past the plot's side and back
  const mr = 0.75;
  const mx = Math.min(W / 2 + 0.2, ctx.info.w / 2 + 0.3 - mr), mz = -Math.min(D / 2 + 0.2, ctx.info.d / 2 + 0.3 - mr);
  sink.cylinder('plaster', [mx, 0, mz], 'y', 11.5, mr, 10, {}, 0.55);
  sink.cylinder('plaster', [mx, 8.6, mz], 'y', 0.3, 1.05, 10, { decor: true });
  sink.cylinder('plaster', [mx, 11.5, mz], 'y', 1.3, 0.55, 10, {}, 0.05);
  return sink.finish();
};

/** The gola: a round rice granary of clay-plastered bamboo on a plinth, under a conical thatch. */
const gola: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const R = Math.max(1.4, Math.min(2.1, Math.min(ctx.info.w, ctx.info.d) / 2 - 0.4));
  sink.cylinder('plaster3', [0, -0.3, 0], 'y', 0.9, R + 0.4, 12, {});
  sink.cylinder('plaster3', [0, 0.6, 0], 'y', 2.0, R, 12, {}, R * 1.08);
  sink.cylinder('straw', [0, 2.55, 0], 'y', 2.2, R * 1.35, 12, {}, 0.12);
  return sink.finish();
};

/** A boat shed at the ghat: a sheet roof on bamboo posts, open sides. */
const ghatShed: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const W = Math.max(4, Math.min(8, ctx.info.w - 0.6)), D = Math.max(6, Math.min(12, ctx.info.d - 0.6));
  const top = 2.8;
  for (const sx of [-1, 1]) for (let k = 0, n = Math.max(2, Math.round(D / 2.6) + 1); k < n; k++) {
    const x = sx * (W / 2 - 0.12), z = -D / 2 + 0.12 + (D - 0.24) * k / (n - 1);
    sink.span('structureWood', x - 0.08, -0.3, z - 0.08, x + 0.08, top, z + 0.08, { colour: BAMBOO_MAT });
  }
  const roof: RoofSpec = { kind: 'gable', pitchDeg: 20, eave: 0.5, verge: 0.3, thickness: 0.06, bucket: 'structureMetal', ridge: 'saddle' };
  emitRoof(sink, roofGeometry(W, D, top, roof), roof, sheetColour(rng));
  return sink.finish();
};

/** A storm-wrecked tin house: the plinth, a few posts, the sheets torn and down. */
const wrecked: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const W = Math.max(4.8, ctx.info.w - 1.0), D = Math.max(6.4, ctx.info.d - 1.0);
  sink.span('plaster3', -W / 2 - 1, -0.4, -D / 2 - 1, W / 2 + 1, 0.8, D / 2 + 1);
  for (let k = 0; k < 6; k++) {
    const x = (rng() - 0.5) * W, z = (rng() - 0.5) * D;
    sink.member('structureWood', [x, 0.8, z], [x + (rng() - 0.5) * 0.6, 0.8 + 0.8 + rng() * 1.6, z + (rng() - 0.5) * 0.6], 0.12, 0.12, [1, 0, 0], { colour: pick(rng, WEATHERED_PLANK), exposed: true });
  }
  // the fallen sheets (the connectivity sweep: they hung over the slab): each with its low end on the slab, its raised
  // end propped on a broken bamboo post
  for (let k = 0; k < 6; k++) {
    const a = rng() * Math.PI, x = (rng() - 0.5) * W * 0.7, z = (rng() - 0.5) * D * 0.7;
    rng();
    const hy = 0.9 + rng() * 1.2, ex = x + Math.cos(a), ez = z + Math.sin(a);
    sink.member('structureMetal', [x - Math.cos(a), 0.8, z - Math.sin(a)], [ex, hy, ez], 0.9, 0.04, [0, 1, 0], { colour: sheetColour(rng), decor: true, exposed: true });
    sink.cylinder('structureWood', [ex, 0.78, ez], 'y', hy - 0.76, 0.06, 6, { colour: BAMBOO_MAT, decor: true }, 0.05);
  }
  return sink.finish();
};

/**
 * A bazaar stall (the base market plot): a raised earthen platform, bamboo posts carrying a tin roof that falls to the
 * lane, a tin back wall, a plank counter with sacks of rice and lentils and baskets of produce.
 */
const bazaarStall: RegionalBuilder = (ctx) => {
  // (props census r2 sweep, Lane C 2026-10-16: the stall's box-only share 99 %) its parts in their own forms: the mud
  // plinth's corners worn round, the bamboo posts round, the back wall of corrugated tin, the counter's plank eased, the
  // tin roof's front edge turned down into a drip, the jute sacks round; the draws as before
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const W = Math.max(4.5, Math.min(6.4, ctx.info.w - 0.4)), D = Math.max(3.6, Math.min(5.0, ctx.info.d - 0.4));
  const floor = 0.35, back = 2.95, front = 2.4;
  const px = W / 2 + 0.25, pz = D / 2 + 0.25, wear = 0.35;
  const plinth: Vec3[] = [[px, -0.3, -pz + wear], [px, -0.3, pz - wear], [px - wear, -0.3, pz], [-px + wear, -0.3, pz], [-px, -0.3, pz - wear],
    [-px, -0.3, -pz + wear], [-px + wear, -0.3, -pz], [px - wear, -0.3, -pz]];
  orientedPrism(sink, 'plaster3', plinth, [0, 1, 0], floor + 0.3, {});
  for (const [x, z, h] of [[-1, -1, back], [1, -1, back], [-1, 1, front], [1, 1, front]] as const) {
    sink.cylinder('structureWood', [x * (W / 2 - 0.15), floor, z * (D / 2 - 0.15)], 'y', h - floor, 0.07, 8, { colour: BAMBOO_MAT });
  }
  // the back wall: corrugated tin, its facets welded into one sheet, its outer face a sheet's thickness behind the inner
  // (regionalArchitecture's ray audit: the two faces laid on one plane read as inverted from either side)
  const tin = sheetColour(rng), zb = -D / 2 + 0.12, ribs = Math.max(8, Math.round((W - 0.16) / 0.15)), xa = -W / 2 + 0.08, xb = W / 2 - 0.08;
  const t = 0.012;
  for (let i = 0; i < ribs; i++) {
    const u0 = xa + (xb - xa) * i / ribs, u1 = xa + (xb - xa) * (i + 1) / ribs, z0 = zb + (i % 2 ? 0.03 : 0), z1 = zb + (i % 2 ? 0 : 0.03);
    sink.quad('structureMetal', [u0, floor, z0], [u1, floor, z1], [u1, back - 0.12, z1], [u0, back - 0.12, z0], { colour: tin });
    sink.quad('structureMetal', [u1, floor, z1 - t], [u0, floor, z0 - t], [u0, back - 0.12, z0 - t], [u1, back - 0.12, z1 - t], { colour: shade(tin, 0.8) });
  }
  // the sheet's top edge and its two ends closed
  for (let i = 0; i < ribs; i++) {
    const u0 = xa + (xb - xa) * i / ribs, u1 = xa + (xb - xa) * (i + 1) / ribs, z0 = zb + (i % 2 ? 0.03 : 0), z1 = zb + (i % 2 ? 0 : 0.03), y = back - 0.12;
    sink.quad('structureMetal', [u0, y, z0], [u1, y, z1], [u1, y, z1 - t], [u0, y, z0 - t], { colour: shade(tin, 0.9) });
  }
  sink.quad('structureMetal', [xa, floor, zb - t], [xa, floor, zb], [xa, back - 0.12, zb], [xa, back - 0.12, zb - t], { colour: shade(tin, 0.85) });
  const zEnd = zb + (ribs % 2 ? 0.03 : 0);
  sink.quad('structureMetal', [xb, floor, zEnd], [xb, floor, zEnd - t], [xb, back - 0.12, zEnd - t], [xb, back - 0.12, zEnd], { colour: shade(tin, 0.85) });
  // the tin roof falls from the back wall to the lane: a shed laid along the stall's depth (local +x low = world +z), its
  // front edge turned down in a drip welded to the sheet
  const roofColour = sheetColour(rng);
  const roof: RoofSpec = { kind: 'shed', pitchDeg: Math.atan2(back - front, D) * 180 / Math.PI, eave: 0.35, verge: 0.3, thickness: 0.05, bucket: 'structureMetal', ridge: null };
  sink.placed(-Math.PI / 2, 0, 0, 0, () => emitRoof(sink, roofGeometry(D, W, front, roof), roof, roofColour));
  const tan = (back - front) / D, ze = D / 2 + 0.35, ye = front - 0.35 * tan;
  sink.quad('structureMetal', [-W / 2 - 0.3, ye - 0.12, ze], [W / 2 + 0.3, ye - 0.12, ze], [W / 2 + 0.3, ye + 0.01, ze], [-W / 2 - 0.3, ye + 0.01, ze], { colour: shade(roofColour, 0.85), decor: true });
  sink.quad('structureMetal', [W / 2 + 0.3, ye - 0.12, ze - 0.01], [-W / 2 - 0.3, ye - 0.12, ze - 0.01], [-W / 2 - 0.3, ye + 0.01, ze - 0.01], [W / 2 + 0.3, ye + 0.01, ze - 0.01], { colour: shade(roofColour, 0.7), decor: true });
  bevelSpan(sink, 'structureWood', -W / 2 + 0.35, floor, D / 2 - 1.0, W / 2 - 0.35, floor + 0.8, D / 2 - 0.45, 0.04, { colour: pick(rng, WEATHERED_PLANK) });
  // the goods: jute sacks on the counter and the floor, flat baskets of produce
  const jute = rgb(0xa08a62), produce: readonly Rgb[] = [0x8a3a2a, 0xc0902a, 0x5a7a3a, 0xb8b0a0].map(rgb);
  for (let k = 0, n = 3 + Math.floor(rng() * 3); k < n; k++) {
    const x = -W / 2 + 0.7 + rng() * (W - 1.4), onCounter = rng() < 0.5;
    const y0 = onCounter ? floor + 0.8 : floor, z = onCounter ? D / 2 - 0.72 : -D / 2 + 0.7 + rng() * 0.8, h = 0.42 + rng() * 0.16;
    sink.cylinder('structureWood', [x, y0, z], 'y', h, 0.2, 8, { colour: jute, decor: true }, 0.16);
  }
  for (let k = 0; k < 3; k++) {
    const x = -W / 2 + 0.8 + k * (W - 1.6) / 2;
    sink.cylinder('structureWood', [x, floor + 0.8, D / 2 - 0.72], 'y', 0.12, 0.28, 8, { colour: pick(rng, produce), decor: true });
  }
  return sink.finish();
};

export const BENGAL_BUILDERS: Readonly<Record<string, RegionalBuilder>> = Object.freeze({
  cottage: (ctx) => tinHouse(ctx),
  farmhouse: (ctx) => tinHouse(ctx, { big: true }),
  marketRow: bengalBazaar,
  fishery: bazaar,
  // the base market plot: a tin bazaar stall (gauntlet wave 15: the delta's streets still showed the generic stall)
  market: bazaarStall,
  cornershop: brickShop,
  depot: brickShop,
  chapel: mosque,
  granary: gola,
  boatshed: ghatShed,
  woodshed: ghatShed,
  ruin: wrecked,
});

export const BENGAL_STYLE: ArchitectureStyle = Object.freeze<ArchitectureStyle>({
  id: 'bengal',
  region: 'Jamuna chars (Sirajganj, Bogura): homesteads of corrugated iron on earthen plinths, a tin bazaar, a village mosque',
  surfaces: {
    roof: { kind: 'sheet', tint: [0.60, 0.62, 0.63] },
    // (round 11; waves 319/320: "clean, saturated, uniformly tiled brick with no soot") an industrial town's brick, soiled
    stone: { kind: 'brick', tint: [0.62, 0.32, 0.24], weathered: true },
    sourced: { plaster: false, wood: true },
    // (the facades lane, round 11; waves 319/320: the walls' procedural canvas read as "speckle", "sponge", "cork",
    // "camouflage noise": its 6 cm bumps shade as dots from the street, as Steinburg's did before round 8) the walls
    // painted as the region renders them (regionalSurfaces.ts paintLimewash), every family under the kit's and the map's
    // tones
    render: { kind: 'limewash', seed: 0x6b4e },
    tones: {
      plaster: (_h, s, l) => [0.12, Math.min(1, s * 0.25), Math.min(1, l * 1.25 + 0.1)],
      plaster2: (_h, s, l) => [0.1, Math.min(1, s * 0.4 + 0.08), Math.min(1, l * 1.1 + 0.05)],
      plaster3: (_h, s, l) => [0.075, Math.min(1, s * 0.6 + 0.18), Math.min(1, l * 0.78)],
      straw: (h, s, l) => [h - 0.015, Math.min(1, s * 0.55), Math.min(1, l * 0.82)],
    },
  },
  builders: BENGAL_BUILDERS,
});

export type { RegionalParts };
