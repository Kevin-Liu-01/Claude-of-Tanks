// src/world/maps/regional/mekong.ts — the Mekong kit (Mangrove Reach: the Cà Mau shrimp-farm coast). Stilt houses
// (nhà sàn) of weathered planks or woven palm on posts above the creek banks, under nipa-palm thatch or corrugated
// iron, with a front veranda, a rail and a ladder; ground houses of rendered brick painted pale blue, green or yellow
// under sheet roofs with a columned porch; open boat shelters and shrimp-pond guard huts on stilts; tin-roofed market
// halls; a collapsed stilt house where the shelling found it.
import { PartSink, alongPlot, faceBox, pick, plotAxes, rgb, shade, type EmitOptions, type Face, type RegionalBucket, type RegionalParts, type Rgb, type Vec3 } from './geometry.ts';
import { hash01 } from './facade.ts';
import { buildHouse, emitRoof, roofGeometry, wallPolygon, windowRhythm, type HouseDialect, type Opening, type RoofSpec } from './house.ts';
import { doorUnit, windowUnit, type WindowStyle } from './openings.ts';
import { BAMBOO_MAT, RUSTED, WEATHERED_PLANK, boardWall, ladder, stilts, veranda } from './vernacular.ts';
import type { ArchitectureStyle, RegionalBuildContext, RegionalBuilder } from './types.ts';

const SHUTTER: readonly Rgb[] = [0x4f7a9a, 0x5a8a62, 0x8a5a3e, 0x6a8a9a].map(rgb);

function uvOffset(ctx: RegionalBuildContext): [number, number] {
  return [ctx.rng() * 7.31, ctx.rng() * 5.17];
}

// (the facades lane, 2026-10-08; gauntlet wave 260: "brown shingle gable roofs") an atap of nipa leaf: the kit's thatch print
// is the nipa's (surfaces.thatch), its eave one thick frayed course, no course lips up the slope
const nipa = (pitch: number): RoofSpec => ({ kind: 'gable', pitchDeg: pitch, eave: 0.6, verge: 0.4, thickness: 0.26, bucket: 'straw', ridge: 'round', thatch: 'nipa' });
const tole = (pitch: number, kind: RoofSpec['kind'] = 'gable'): RoofSpec => ({ kind, pitchDeg: pitch, eave: 0.5, verge: 0.35, thickness: 0.06, bucket: 'roof', ridge: 'saddle' });

/** Board-shuttered window openings (no glass in the stilt houses): a dark opening, a frame, a propped shutter. */
function shutterWindow(sink: PartSink, face: Face, u: number, y: number, w: number, h: number, colour: Rgb): void {
  faceBox(sink, 'dark', face, u, y + h / 2, 0.005, w, h, 0.02, { decor: true });
  faceBox(sink, 'structureWood', face, u, y + h + 0.05, 0.04, w + 0.16, 0.1, 0.06, { colour: shade(colour, 0.8), decor: true });
  faceBox(sink, 'structureWood', face, u, y - 0.05, 0.04, w + 0.16, 0.1, 0.06, { colour: shade(colour, 0.8), decor: true });
  // the top-hung shutter propped open on a stick
  const leaf = { colour, decor: true };
  sink.member('structureWood', [face.origin[0] + face.u[0] * (u - w / 2), y + h + 0.02, face.origin[2] + face.u[2] * (u - w / 2)],
    [face.origin[0] + face.u[0] * (u + w / 2), y + h + 0.02, face.origin[2] + face.u[2] * (u + w / 2)], 0.05, 0.04, face.out, { ...leaf, exposed: true });
  faceBox(sink, 'structureWood', face, u, y + h - 0.1, 0.38, w, 0.035, 0.62, leaf);
}

/** The stilt house: plank or mat walls on a deck over posts, nipa or sheet roof, veranda, ladder. */
function stiltHouse(ctx: RegionalBuildContext, opts: { lift?: number } = {}): RegionalParts {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const W = Math.max(4.6, Math.min(6.4, ctx.info.w - 0.8)), D = Math.max(6.0, Math.min(9.0, ctx.info.d - 1.8));
  const lift = opts.lift ?? 1.3 + rng() * 0.5;
  const post = pick(rng, WEATHERED_PLANK);
  const mat = rng() < 0.35;
  const wallColour = mat ? BAMBOO_MAT : pick(rng, WEATHERED_PLANK);
  const thatched = rng() < 0.6;
  stilts(sink, W, D, lift, shade(post, 0.85));
  // the back half of the under-floor boarded in for nets, tools and the boat engine (it also keeps the cover the
  // base house gave: an open stilt house is a window under its floor)
  sink.span('structureWood', -W / 2 + 0.12, -0.25, -D / 2 + 0.12, W / 2 - 0.12, lift + 0.06, -D * 0.04, { colour: shade(wallColour, 0.72) });
  const wallH = 2.5, top = lift + 0.16 + wallH;
  sink.placed(0, 0, lift + 0.16, 0, () => {
    // the house body: a structural wall box behind board dressing
    sink.span('structureWood', -W / 2, 0, -D / 2, W / 2, wallH, D / 2, { colour: shade(wallColour, 0.9) });
    const faces: Face[] = [
      { origin: [0, 0, D / 2], u: [1, 0, 0], out: [0, 0, 1], width: W }, { origin: [W / 2, 0, 0], u: [0, 0, -1], out: [1, 0, 0], width: D },
      { origin: [0, 0, -D / 2], u: [-1, 0, 0], out: [0, 0, -1], width: W }, { origin: [-W / 2, 0, 0], u: [0, 0, 1], out: [-1, 0, 0], width: D },
    ];
    if (ctx.tier !== 'mobile') for (const f of faces) boardWall(sink, f, -f.width / 2 + 0.05, f.width / 2 - 0.05, 0.05, wallH - 0.05, wallColour);
    // the door on the veranda front, shuttered openings on the sides
    doorUnit(sink, faces[0], W * 0.18, 0, 0.85, 1.9, { leaf: shade(wallColour, 0.8), frame: { bucket: 'structureWood', width: 0.08, out: 0.06, colour: shade(post, 0.8) }, steps: null, leafKind: 'plank' }, 0);
    const shutter = pick(rng, SHUTTER);
    shutterWindow(sink, faces[0], -W * 0.22, 0.9, 0.8, 0.7, shutter);
    for (const f of [faces[1], faces[3]]) for (const u of [-D * 0.22, D * 0.22]) if (rng() < 0.8) shutterWindow(sink, f, u, 0.9, 0.75, 0.65, shutter);
  });
  const roof = thatched ? nipa(30 + rng() * 6) : tole(20 + rng() * 6);
  emitRoof(sink, roofGeometry(W, D, top, roof), roof);
  const front: Face = { origin: [0, 0, D / 2], u: [1, 0, 0], out: [0, 0, 1], width: W };
  veranda(sink, front, lift, top - 0.05, W, 1.3, post, thatched ? { bucket: 'straw', thatch: 'nipa' } : { bucket: 'roof' });
  ladder(sink, { ...front, origin: [0, 0, D / 2 + 1.3] }, W * 0.3, 0, lift + 0.16, shade(post, 0.9));
  wetYard(sink, ctx);
  return sink.finish();
}

/**
 * The wet yard under a house on stilts (gauntlet wave 15: "the stilt house stands on dry mown lawn"): a skin of dark
 * tidal mud under the house and round its posts, and standing water in its hollows. Decor only (no collision); its pools
 * drawn from the look stream, as many draws as ever, so neither stream moves; a phone builds the same house without it.
 * (A plank walkway to the bank was tried here and dropped: the base plots end under the veranda, so it never fitted.)
 * The facades lane, 2026-10-08 (round nine; gauntlet wave 260 asks the delta for "mud rather than lawn"): the skin was a
 * 33 cm slab in the timber bucket, which the structure wood's grain drew as a plank deck on a stand. It is laid on the
 * ground now, as house.ts lays a wall-foot strip: every corner of the mud 3 cm over the terrain under it, of the water
 * 4 cm (a bare build lays them level at 4 and 5 cm, the mud closed into a slab down to -0.3, as a bare strip's lips go
 * down, so nothing sees its back from below). It is wet silt in the render bucket under a dark tint (the render's
 * grit reads as silt), its edge an irregular blob inside the plot rather than the plot's rectangle, its puddles irregular
 * too, and the world's grass kept off all of it (a grid of discs over everything it lays).
 */
function wetYard(sink: PartSink, ctx: RegionalBuildContext): void {
  sink.dressing(ctx.tier === 'mobile', () => {
    const look = ctx.variant, ground = ctx.ground;
    const rx = ctx.info.w / 2 - 0.15, rz = ctx.info.d / 2 - 0.15;
    // the extent of everything laid (the ground cover's holes cover it)
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    const at = (x: number, z: number, lift: number): Vec3 => {
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
      if (!ground) return [x, lift + 0.01, z];
      const q = sink.framePoint([x, 0, z]);
      return [x, ground.at(q[0], q[2]) - q[1] + lift, z];
    };
    // a triangle wound to face up (the ground under it need not be level)
    const up = (a: Vec3, b: Vec3, c: Vec3): Vec3[] =>
      (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]) > 0 ? [a, b, c] : [a, c, b];
    const mud: EmitOptions = { decor: true, ...(ground ? { ground: true } : {}), tint: [0.42, 0.37, 0.3] };
    // the blob: the plot's ellipse, its radius wandering 84-100 % round it in two slow harmonics (no stream draws)
    const p1 = hash01(rx, rz, 1.1) * Math.PI * 2, p2 = hash01(rx, rz, 2.2) * Math.PI * 2;
    const N = 20, rings = [0.34, 0.67, 1];
    const ring = (r: number, k: number): Vec3 => {
      const t = (k % N) / N * Math.PI * 2, e = 0.92 + 0.05 * Math.sin(2 * t + p1) + 0.03 * Math.sin(3 * t + p2);
      return at(Math.cos(t) * rx * r * e, Math.sin(t) * rz * r * e, 0.03);
    };
    const centre = at(0, 0, 0.03);
    for (let k = 0; k < N; k++) {
      sink.polygon('plaster', up(centre, ring(rings[0], k), ring(rings[0], k + 1)), mud);
      for (let r = 1; r < rings.length; r++) {
        const a = ring(rings[r - 1], k), b = ring(rings[r - 1], k + 1), c = ring(rings[r], k + 1), d = ring(rings[r], k);
        sink.polygon('plaster', up(a, b, c), mud);
        sink.polygon('plaster', up(a, c, d), mud);
      }
    }
    if (!ground) {
      // a bare build: the blob closed into a slab, its underside and its rim down to -0.3
      const low = (p: Vec3): Vec3 => [p[0], -0.3, p[2]];
      const down = (a: Vec3, b: Vec3, c: Vec3): Vec3[] => { const t = up(a, b, c); return [t[0], t[2], t[1]]; };
      const edge = (k: number) => ring(1, k);
      for (let k = 0; k < N; k++) {
        sink.polygon('plaster', down(low(centre), low(edge(k)), low(edge(k + 1))), mud);
        // the rim's quad, wound to face out of the blob
        const a = edge(k), b = edge(k + 1), c = low(b), d = low(a);
        const nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
        sink.polygon('plaster', nx * (a[0] + b[0]) + nz * (a[2] + b[2]) >= 0 ? [a, b, c, d] : [d, c, b, a], mud);
      }
    }
    // the puddles: irregular octagons a centimetre over the mud
    const water: EmitOptions = { decor: true, ...(ground ? { ground: true } : {}) };
    for (let k = 0; k < 3; k++) {
      const x = (look() - 0.5) * rx * 1.4, z = (look() - 0.5) * rz * 1.2, a = 0.5 + look() * 0.9, b = 0.4 + look() * 0.7;
      const corner = (j: number): Vec3 => {
        const t = (j % 8) / 8 * Math.PI * 2, f = 0.72 + hash01(x, z, j % 8, 6.6) * 0.28;
        return at(x + Math.cos(t) * a * f, z + Math.sin(t) * b * f, 0.04);
      };
      const c0 = at(x, z, 0.04);
      for (let j = 0; j < 8; j++) sink.polygon('glass', up(c0, corner(j), corner(j + 1)), water);
    }
    // no grass through the mud or the water (a phone builds neither, so it keeps its grass): discs on a grid over their
    // extent, each covering its grid cell (radius >= the cell's half diagonal)
    if (ground?.hole && ctx.tier !== 'mobile' && x1 > x0) {
      const nx = Math.max(2, Math.ceil((x1 - x0) / 1.6) + 1), nz = Math.max(2, Math.ceil((z1 - z0) / 1.6) + 1);
      const dx = (x1 - x0) / (nx - 1), dz = (z1 - z0) / (nz - 1), r = Math.hypot(dx, dz) / 2 + 0.02;
      for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
        const q = sink.framePoint([x0 + i * dx, 0, z0 + j * dz]);
        ground.hole(q[0], q[2], r);
      }
    }
  });
}

/**
 * The ground house: rendered brick painted pale, a sheet roof, a columned porch, shutters. On a farmhouse plot (wider
 * than deep) it is the three-bay house (nha ba gian) lying along the plot with its porch down one long side
 * (plotAxes), not a gable-fronted house whose porch reached 2 m past the plot.
 */
function groundHouse(ctx: RegionalBuildContext): RegionalParts {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const plot = plotAxes(ctx.info);
  // turned, the porch (2 m) and the house stand inside the plot's depth; the house runs the plot's length
  const W = plot.turned ? Math.max(5.0, Math.min(8, plot.w - 4.4)) : Math.max(5.6, Math.min(8, ctx.info.w - 0.4));
  const D = plot.turned ? Math.max(7.2, Math.min(14, plot.d - 0.8)) : Math.max(7.2, Math.min(11, ctx.info.d - 0.4));
  const porchFace = plot.turned ? 'left' : 'front', porchWidth = plot.turned ? D : W;
  const wall: RegionalBucket = ctx.wallBucket === 'stone' ? 'plaster2' : ctx.wallBucket as RegionalBucket;
  const shutter = pick(rng, SHUTTER);
  const style: WindowStyle = {
    frame: shade(shutter, 1.05), frameWidth: 0.07, frameOut: 0.05, bars: 'none',
    surround: { bucket: 'plaster', width: 0.12, out: 0.04 }, sill: { bucket: 'plaster', out: 0.08 },
    shutters: { colour: shutter, kind: 'louvred', closed: 0.5 },
  };
  const openings: Opening[] = [{ face: porchFace, storey: 0, kind: 'door', u: 0, w: 1.6, y0: 0, h: 2.3 }];
  const faces = plot.turned ? (['left', 'front', 'back'] as const) : (['front', 'left', 'right'] as const);
  for (const face of faces) {
    const width = face === 'front' || face === 'back' ? W : D;
    for (const o of windowRhythm(face, 0, width, { w: 0.9, h: 1.2, sill: 0.9, spacing: 2.2, margin: 0.9, avoid: face === porchFace ? [[-1.0, 1.0]] : [] })) openings.push(o);
  }
  const dialect: HouseDialect = {
    window: (s, face, o, y0) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, style, rng, 0.5),
    door: (s, face, o, y0) => doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { leaf: shutter, frame: { bucket: 'plaster', width: 0.14, out: 0.05 }, steps: { bucket: 'stone' }, leafKind: 'panel' }, y0 + o.y0),
  };
  alongPlot(sink, plot.turned, () => {
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: 0.55, out: 0.08, bucket: 'stone' }, storeys: [{ h: 3.0, wall }],
      roof: tole(22 + rng() * 6, rng() < 0.4 ? 'hip' : 'gable'), gableBucket: wall, openings, chimneys: [], gutters: null, verge: null,
    }, dialect);
    const post = rgb(0xd6d0c2);
    veranda(sink, frame.faces[porchFace], 0.55, frame.eaveY - 0.1, porchWidth, 2.0, post, { bucket: 'roof' }, false);
  });
  return sink.finish();
}

/** An open shelter on stilts: posts, a deck and a roof (boat sheds, pond guard huts). */
function shelter(ctx: RegionalBuildContext, opts: { deck?: boolean; walls?: 0 | 1 | 2 | 3 } = {}): RegionalParts {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const W = Math.max(3.6, Math.min(7, ctx.info.w - 0.8)), D = Math.max(5, Math.min(11, ctx.info.d - 0.8));
  const post = pick(rng, WEATHERED_PLANK);
  const lift = opts.deck ? 0.9 : 0;
  if (opts.deck) stilts(sink, W, D, lift, shade(post, 0.85), { brace: false });
  if (opts.deck) wetYard(sink, ctx);
  const top = lift + 2.6;
  for (const sx of [-1, 1]) for (let k = 0, n = Math.max(2, Math.round(D / 2.6) + 1); k < n; k++) {
    const x = sx * (W / 2 - 0.12), z = -D / 2 + 0.12 + (D - 0.24) * k / (n - 1);
    sink.span('structureWood', x - 0.08, lift, z - 0.08, x + 0.08, top, z + 0.08, { colour: post });
  }
  const thatched = rng() < 0.5;
  const roof = thatched ? nipa(28) : tole(18);
  const rg = roofGeometry(W, D, top, roof);
  emitRoof(sink, rg, roof);
  // plank or woven-mat walls: the back (1), the back and both sides (2), and the creek end round a boat mouth (3)
  if (opts.walls) {
    const sheet = rng() < 0.5 ? BAMBOO_MAT : shade(post, 0.9);
    sink.span('structureWood', -W / 2 + 0.1, lift, -D / 2 + 0.06, W / 2 - 0.1, top - 0.12, -D / 2 + 0.14, { colour: sheet });
    // a walled end closes its gable up to the roof
    const gable = rg.gable ? rg.gable.map(([u, y]): [number, number] => [u * 0.97, y <= top + 1e-6 ? top - 0.12 : y - 0.02]) : null;
    if (gable) wallPolygon(sink, 'structureWood', { origin: [0, 0, -D / 2 + 0.06], u: [-1, 0, 0], out: [0, 0, -1], width: W }, gable, 0.08, { colour: sheet });
    if (gable && opts.walls > 2) wallPolygon(sink, 'structureWood', { origin: [0, 0, D / 2 - 0.3], u: [1, 0, 0], out: [0, 0, 1], width: W }, gable, 0.08, { colour: sheet });
    if (opts.walls > 1) {
      for (const sx of [-1, 1]) sink.span('structureWood', sx * (W / 2 - 0.14) - 0.04, lift, -D / 2 + 0.14, sx * (W / 2 - 0.14) + 0.04, top - 0.12, D / 2 - 0.3, { colour: sheet });
    }
    if (opts.walls > 2) {
      // the creek end boarded in either side of the boat mouth, a board fascia over it
      const mouth = W * 0.5;
      for (const sx of [-1, 1]) sink.span('structureWood', sx > 0 ? mouth / 2 : -W / 2 + 0.1, lift, D / 2 - 0.38, sx > 0 ? W / 2 - 0.1 : -mouth / 2, top - 0.12, D / 2 - 0.3, { colour: sheet });
      sink.span('structureWood', -mouth / 2, top - 0.75, D / 2 - 0.38, mouth / 2, top - 0.12, D / 2 - 0.3, { colour: sheet });
    }
  }
  return sink.finish();
}

/**
 * A tin-roofed market hall: open sides, concrete posts, a long sheet roof, stall counters. On a market row's plot (wider
 * than deep) the hall lies along it (plotAxes): it no longer reaches 2.4 m past the plot's long sides.
 */
const marketHall: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const plot = plotAxes(ctx.info);
  const W = Math.max(plot.turned ? 4.2 : 6, Math.min(10, plot.w - 0.6)), D = Math.max(plot.turned ? 6 : 10, Math.min(20, plot.d - 0.6));
  alongPlot(sink, plot.turned, () => {
    sink.span('stone', -W / 2, -0.3, -D / 2, W / 2, 0.25, D / 2);
    const top = 3.4;
    for (const sx of [-1, 0, 1]) for (let k = 0, n = Math.max(2, Math.round(D / 3.5) + 1); k < n; k++) {
      const x = sx * (W / 2 - 0.2), z = -D / 2 + 0.2 + (D - 0.4) * k / (n - 1);
      sink.span('plaster', x - 0.14, 0.25, z - 0.14, x + 0.14, top + (sx === 0 ? (plot.turned ? 0.65 : 1.4) : 0), z + 0.14);
    }
    const roof = plot.turned ? { ...tole(16), eave: 0.3 } : tole(16);
    emitRoof(sink, roofGeometry(W, D, top, roof), roof, rng() < 0.5 ? pick(rng, RUSTED) : undefined);
    // the stall platforms: fixed counters of plank on block (they stand as the base hall's walls stood: cover)
    for (const side of [-1, 1]) for (let z = -D / 2 + 1.2; z < D / 2 - 1; z += 2.4) {
      sink.span('structureWood', side * (W / 2 - 1.3) - 0.5, 0.25, z - 1.0, side * (W / 2 - 1.3) + 0.5, 1.15, z + 1.0, { colour: pick(rng, WEATHERED_PLANK) });
    }
  });
  return sink.finish();
};

/** A collapsed stilt house: posts leaning, the deck broken, the roof sheets down. */
const collapsed: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const W = Math.max(4.6, ctx.info.w - 1.0), D = Math.max(6, ctx.info.d - 2.0);
  const post = shade(pick(rng, WEATHERED_PLANK), 0.75);
  for (let k = 0; k < 7; k++) {
    const x = (rng() - 0.5) * W, z = (rng() - 0.5) * D, h = 0.6 + rng() * 1.8;
    sink.member('structureWood', [x, -0.3, z], [x + (rng() - 0.5) * 0.8, h, z + (rng() - 0.5) * 0.8], 0.16, 0.16, [1, 0, 0], { colour: post, exposed: true });
  }
  for (let k = 0; k < 4; k++) {
    const a = rng() * Math.PI, x = (rng() - 0.5) * W * 0.6, z = (rng() - 0.5) * D * 0.6;
    sink.member('roof', [x - Math.cos(a) * 1.6, 0.2 + rng() * 0.5, z - Math.sin(a) * 1.6], [x + Math.cos(a) * 1.6, 0.3 + rng() * 0.9, z + Math.sin(a) * 1.6], 1.6, 0.05, [0, 1, 0], { decor: true, exposed: true });
  }
  sink.span('straw', -W * 0.3, -0.1, -D * 0.25, W * 0.3, 0.45, D * 0.25, { decor: true });
  return sink.finish();
};

/** A market stall (the base market plot): a plank platform, a bamboo frame under a nipa-thatch roof, a counter of baskets. */
const marketStall: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const W = Math.max(4.5, Math.min(6.4, ctx.info.w - 0.4)), D = Math.max(3.6, Math.min(5.0, ctx.info.d - 0.4));
  const floor = 0.2, top = 2.5;
  // a plank platform on the mud (the canal-side stall), not a slab of concrete
  sink.span('structureWood', -W / 2 - 0.2, -0.3, -D / 2 - 0.2, W / 2 + 0.2, floor, D / 2 + 0.2, { colour: shade(pick(rng, WEATHERED_PLANK), 0.82) });
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    sink.span('structureWood', x * (W / 2 - 0.15) - 0.07, floor, z * (D / 2 - 0.15) - 0.07, x * (W / 2 - 0.15) + 0.07, top, z * (D / 2 - 0.15) + 0.07, { colour: BAMBOO_MAT });
  }
  const roof = nipa(24);
  emitRoof(sink, roofGeometry(W, D, top, roof), roof);
  sink.span('structureWood', -W / 2 + 0.35, floor, D / 2 - 1.0, W / 2 - 0.35, floor + 0.8, D / 2 - 0.45, { colour: pick(rng, WEATHERED_PLANK) });
  const produce: readonly Rgb[] = [0x5a7a3a, 0xc0902a, 0x8a3a2a, 0xa8a090].map(rgb);
  for (let k = 0; k < 4; k++) {
    sink.cylinder('structureWood', [-W / 2 + 0.75 + k * (W - 1.5) / 3, floor + 0.8, D / 2 - 0.72], 'y', 0.14, 0.27, 8, { colour: pick(rng, produce), decor: true }, 0.22);
  }
  return sink.finish();
};

export const MEKONG_BUILDERS: Readonly<Record<string, RegionalBuilder>> = Object.freeze({
  cottage: (ctx) => stiltHouse(ctx),
  farmhouse: (ctx) => groundHouse(ctx),
  // boat shelters walled at the back, stores and rice houses walled on three sides (they keep the cover of the base
  // sheds), the depot a rendered shophouse
  boatshed: (ctx) => shelter(ctx, { walls: 3 }),
  granary: (ctx) => shelter(ctx, { deck: true, walls: 2 }),
  woodshed: (ctx) => shelter(ctx, { walls: 2 }),
  marketRow: marketHall,
  depot: (ctx) => groundHouse(ctx),
  ruin: collapsed,
  // the base plots the first kit left (gauntlet wave 15): the fish landings under a long tin hall, the market stalls
  fishery: marketHall,
  market: marketStall,
});

export const MEKONG_STYLE: ArchitectureStyle = Object.freeze<ArchitectureStyle>({
  id: 'mekong',
  region: 'Cà Mau peninsula (Mekong delta coast): stilt houses of plank and palm under nipa thatch and corrugated iron',
  surfaces: {
    roof: { kind: 'sheet', tint: [0.62, 0.64, 0.65] },
    stone: { kind: 'block', tint: [0.62, 0.61, 0.58] },
    sourced: { plaster: false, wood: true },
    thatch: { kind: 'nipa' },
    tones: {
      plaster: (_h, s, l) => [0.12, Math.min(1, s * 0.3 + 0.05), Math.min(1, l * 1.18 + 0.08)],
      plaster2: (_h, s, l) => [0.53, Math.min(1, s * 0.4 + 0.12), Math.min(1, l * 1.15 + 0.1)],
      plaster3: (_h, s, l) => [0.3, Math.min(1, s * 0.4 + 0.1), Math.min(1, l * 1.12 + 0.08)],
      straw: (h, s, l) => [h - 0.025, Math.min(1, s * 0.45), Math.min(1, l * 0.78)],
    },
  },
  builders: MEKONG_BUILDERS,
  // the yards: a woven-bamboo fence round raised vegetable beds, an open gap for a gate (yards.ts)
  yard: { kinds: ['cottage', 'farmhouse'], fence: 'fencewattle', gate: null, shed: null, garden: true },
});
