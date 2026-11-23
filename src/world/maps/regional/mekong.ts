// src/world/maps/regional/mekong.ts — the Mekong kit (Mangrove Reach: the Cà Mau shrimp-farm coast). Stilt houses
// (nhà sàn) of weathered planks or woven palm on posts above the creek banks, under nipa-palm thatch or corrugated
// iron, with a front veranda, a rail and a ladder; ground houses of rendered brick painted pale blue, green or yellow
// under sheet roofs with a columned porch; open boat shelters and shrimp-pond guard huts on stilts; tin-roofed market
// halls; a collapsed stilt house where the shelling found it.
import { PartSink, alongPlot, faceBox, pick, plotAxes, rgb, shade, type EmitOptions, type Face, type RegionalBucket, type RegionalParts, type Rgb, type Vec3 } from './geometry.ts';
import { hash01 } from './facade.ts';
import { mekongChoStall, mekongMarketHall } from './marketKits.ts'; // props #23: the chợ stall and the market hall
import { buildHouse, emitRoof, roofGeometry, storeyFaces, wallPolygon, windowRhythm, type HouseDialect, type Opening, type RoofSpec, type WallRect } from './house.ts';
import { doorUnit, windowUnit, type WindowStyle } from './openings.ts';
import { openShed } from './outbuildings.ts';
import { BAMBOO_MAT, RUSTED, WEATHERED_PLANK, ladder, stilts, veranda } from './vernacular.ts';
import { boardCladding, matCladding, proppedShutter } from './villageCraft.ts';
import type { ArchitectureStyle, RegionalBuildContext, RegionalBuilder } from './types.ts';
import { mekongBoatShelter, mekongFishShed } from './harbourSheds.ts'; // props #25: the boat shelter and the fish shed
import { orientedPrism } from './millWorks.ts';
import { DOME_MIN_SEGMENTS, smoothProfile } from './domes.ts';

const SHUTTER: readonly Rgb[] = [0x4f7a9a, 0x5a8a62, 0x8a5a3e, 0x6a8a9a].map(rgb);

function uvOffset(ctx: RegionalBuildContext): [number, number] {
  return [ctx.rng() * 7.31, ctx.rng() * 5.17];
}

// (the facades lane, 2026-10-08; gauntlet wave 260: "brown shingle gable roofs") an atap of nipa leaf: the kit's thatch print
// is the nipa's (surfaces.thatch), its eave one thick frayed course, no course lips up the slope
const nipa = (pitch: number): RoofSpec => ({ kind: 'gable', pitchDeg: pitch, eave: 0.6, verge: 0.4, thickness: 0.26, bucket: 'straw', ridge: 'round', thatch: 'nipa' });
const tole = (pitch: number, kind: RoofSpec['kind'] = 'gable'): RoofSpec => ({ kind, pitchDeg: pitch, eave: 0.5, verge: 0.35, thickness: 0.06, bucket: 'roof', ridge: 'saddle' });

/**
 * The stilt house: plank or mat walls on a deck over posts, nipa or sheet roof, veranda, ladder.
 * (the looks lane, 2026-10-15; WORKLIST #15: "mekong stiltHouse rebuilt on buildHouse (framed board or mat panels, cut
 * openings)"; the r2 probe read its windows as dark plates on a box) the house on the house grammar, its framed storey
 * on the deck: the door and the unglazed windows cut through the wall, each window's plank shutter hung from its head
 * and propped open on a stick, the room's dark in the cut; the walls laid in vertical planks each its own weathering with
 * battens over their joints, or in panels of woven palm mat held in a frame of poles; the gables boarded or matted under
 * the nipa.
 */
function stiltHouse(ctx: RegionalBuildContext, opts: { lift?: number } = {}): RegionalParts {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant, mobile = ctx.tier === 'mobile';
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
  const shutter = pick(rng, SHUTTER);
  const openings: Opening[] = [
    { face: 'front', storey: 0, kind: 'door', u: W * 0.18, w: 0.85, y0: 0, h: 1.9 },
    { face: 'front', storey: 0, kind: 'window', u: -W * 0.22, w: 0.8, y0: 0.9, h: 0.7 },
  ];
  for (const face of ['right', 'left'] as const) for (const u of [-D * 0.22, D * 0.22]) if (rng() < 0.8) openings.push({ face, storey: 0, kind: 'window', u, w: 0.75, y0: 0.9, h: 0.65 });
  const roof = thatched ? nipa(30 + rng() * 6) : tole(20 + rng() * 6);
  const plank = (k: number): Rgb => shade(wallColour, 0.86 + hash01(k, W, 3.1) * 0.24);
  const dialect: HouseDialect = {
    window: (s, face, o, y0) => proppedShutter(s, face, o.u, y0 + o.y0, o.w, o.h, shutter, mobile),
    door: (s, face, o, y0) => doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { leaf: shade(wallColour, 0.8), frame: { bucket: 'structureWood', width: 0.08, out: 0.06, colour: shade(post, 0.8) }, steps: null, leafKind: 'plank' }, y0),
  };
  const cladding = (s: PartSink, face: Face, rect: WallRect, own: readonly Opening[]) => (mat
    ? matCladding(s, face, rect, own, (k) => shade(BAMBOO_MAT, 0.86 + hash01(k, D, 1.7) * 0.22), shade(post, 0.9), { mobile })
    : boardCladding(s, face, rect, own, plank, shade(post, 0.85), { mobile }));
  sink.placed(0, 0, lift + 0.16, 0, () => {
    const prior = sink.paint;
    // (the framed wall behind the cladding a shade under it: its joints read dark)
    sink.paint = shade(wallColour, 0.55);
    try {
      const hf = buildHouse(sink, {
        w: W, d: D, plinth: null, storeys: [{ h: wallH, wall: 'structureWood' }], roof, gableBucket: 'structureWood',
        openings, chimneys: [], gutters: null, verge: null, reveal: 0.12, spall: null, skirt: null, rafters: shade(post, 0.8),
      }, dialect);
      // (Lane C 2026-10-16, houseDamage: a framed storey takes its infill from the wall's second layer, which a plank wall has not, so the damage path threw at damage.ts:325; as the LOOKS fishery fix 182dca492) the storey is unframed and its boards or mats laid over the walls after the house is built, face by face round each face's openings
      const faces = storeyFaces(hf, 0), body = hf.bodies[0];
      for (const name of ['front', 'right', 'back', 'left'] as const) {
        const face = faces[name];
        cladding(sink, face, { u0: -face.width / 2, u1: face.width / 2, y0: body.y0, y1: body.y1 }, openings.filter((o) => o.face === name && o.storey === 0));
      }
    } finally { sink.paint = prior; }
  });
  look();
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
  // (props census #15, Lane C 2026-10-16: "the rear long wall has no opening at all and reads as one blank plane") the
  // back wall to the yard: the kitchen's door off its middle and the rooms' windows either side of it, cut as the front's
  const rear = plot.turned ? 'right' : 'back', rearWidth = plot.turned ? D : W, backDoor = rearWidth * 0.18;
  openings.push({ face: rear, storey: 0, kind: 'door', u: backDoor, w: 0.95, y0: 0, h: 2.1 });
  for (const o of windowRhythm(rear, 0, rearWidth, { w: 0.9, h: 1.0, sill: 1.1, spacing: 2.4, margin: 0.9, avoid: [[backDoor - 0.75, backDoor + 0.75]] })) openings.push(o);
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
 * The delta's outbuildings member by member (the props census #17 and #22, 2026-10-15, the judges on the woodshed: "a
 * delta shelter: posts with braces on a raised plank floor or stilts, a roof frame (rafters, purlins, ridge), nipa thatch
 * with a ridge and eave fringe or corrugated tole with laps, and woven bamboo mat walls as panels in a frame"): the
 * woodshed on a low plank floor on its posts, open to its yard, its mat panels framed in bamboo on three sides; the rice
 * granary on stilts a man's height up with rat guards round them, boarded all round with its door at the ladder's head.
 * Both under nipa (its eave course beaten thick) or tole with its laps (outbuildings.ts openShed, gable form).
 */
function deltaShed(ctx: RegionalBuildContext, granary: boolean): RegionalParts {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant, mobile = ctx.tier === 'mobile';
  const W = Math.max(3.6, Math.min(7, ctx.info.w - 0.8)), D = Math.max(5, Math.min(11, ctx.info.d - 0.8));
  const post = pick(rng, WEATHERED_PLANK);
  const thatched = rng() < 0.5;
  const sheet = rng() < 0.5 ? BAMBOO_MAT : shade(post, 0.9);
  const lift = granary ? 1.05 : 0.45;
  if (granary) wetYard(sink, ctx);
  openShed(sink, {
    W, D, hLo: lift + (granary ? 2.0 : 2.1), pitchDeg: thatched ? 30 : 18, gable: true, lift, back: true, ends: true, pile: granary ? 0 : 1.1 + look() * 0.3,
    ratGuards: granary, ladder: granary, front: granary ? { u: 0, w: 0.85, h: 1.55, leaf: shade(post, 0.8) } : null, mobile,
  }, {
    timber: shade(post, 0.85), post: 0.15, round: true, pad: null,
    cladding: granary ? 'lapped' : 'batten', boards: [sheet, shade(sheet, 0.93), shade(sheet, 1.06)], boardW: granary ? 0.34 : 0.85, batten: shade(post, 0.75), trim: shade(post, 0.75),
    covering: thatched ? 'thatch' : 'sheet', roofBucket: thatched ? 'straw' : 'structureMetal', ...(thatched ? { thatch: 'nipa' as const } : { roofColour: pick(rng, RUSTED) }),
    eave: thatched ? 0.6 : 0.45, verge: thatched ? 0.4 : 0.3,
  }, look);
  return sink.finish();
}

/**
 * A tin-roofed market hall: open sides, concrete posts, a long sheet roof, stall counters. On a market row's plot (wider
 * than deep) the hall lies along it (plotAxes): it no longer reaches 2.4 m past the plot's long sides.
 */
// (props census #23, the looks lane 2026-10-15: member-built in marketKits.ts)
const marketHall: RegionalBuilder = (ctx) => mekongMarketHall(ctx, RUSTED);

/** A collapsed stilt house: posts leaning, the deck broken, the roof sheets down. */
/** A round pole from `a` to `b` (an octagon of radius `r` run along the axis). */
function roundPole(sink: PartSink, a: Vec3, b: Vec3, r: number, opts: EmitOptions & { exposed?: boolean }): void {
  const d: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], len = Math.hypot(d[0], d[1], d[2]);
  if (len < 1e-3) return;
  const ax: Vec3 = [d[0] / len, d[1] / len, d[2] / len];
  const hint: Vec3 = Math.abs(ax[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  const u = unit3(cross3(ax, hint)), v = cross3(ax, u);
  const pts: Vec3[] = [];
  for (let k = 0; k < 8; k++) {
    const t = (k / 8) * Math.PI * 2;
    pts.push([a[0] + (u[0] * Math.cos(t) + v[0] * Math.sin(t)) * r, a[1] + (u[1] * Math.cos(t) + v[1] * Math.sin(t)) * r, a[2] + (u[2] * Math.cos(t) + v[2] * Math.sin(t)) * r]);
  }
  orientedPrism(sink, 'structureWood', pts, ax, len, opts);
}

/** A corrugated sheet `w` wide lying from `a` to `b` (its ribs along the run, its faces 12 mm apart, every face closed). */
function corrugatedSheet(sink: PartSink, a: Vec3, b: Vec3, w: number, opts: EmitOptions & { exposed?: boolean }): void {
  const d: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], len = Math.hypot(d[0], d[1], d[2]);
  if (len < 1e-3) return;
  const ax: Vec3 = [d[0] / len, d[1] / len, d[2] / len];
  const across = unit3(cross3([0, 1, 0], ax)), up = unit3(cross3(ax, across));
  const ribs = 10, t = 0.012;
  const at = (k: number, lift: number, end: 0 | 1): Vec3 => {
    const uu = -w / 2 + (w * k) / ribs, vv = (k % 2 ? 0.025 : 0) + lift, p = end ? b : a;
    return [p[0] + across[0] * uu + up[0] * vv, p[1] + across[1] * uu + up[1] * vv, p[2] + across[2] * uu + up[2] * vv];
  };
  const face = (p: Vec3[], n: Vec3) => {
    const c = cross3([p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]], [p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]]);
    const q = c[0] * n[0] + c[1] * n[1] + c[2] * n[2] >= 0 ? p : [...p].reverse();
    sink.quad('roof', q[0], q[1], q[2], q[3], opts);
  };
  const down: Vec3 = [-up[0], -up[1], -up[2]];
  for (let k = 0; k < ribs; k++) {
    face([at(k, 0, 0), at(k + 1, 0, 0), at(k + 1, 0, 1), at(k, 0, 1)], up);
    face([at(k, -t, 0), at(k + 1, -t, 0), at(k + 1, -t, 1), at(k, -t, 1)], down);
    for (const end of [0, 1] as const) face([at(k, 0, end), at(k + 1, 0, end), at(k + 1, -t, end), at(k, -t, end)], end ? ax : [-ax[0], -ax[1], -ax[2]]);
  }
  for (const k of [0, ribs]) face([at(k, 0, 0), at(k, 0, 1), at(k, -t, 1), at(k, -t, 0)], k ? across : [-across[0], -across[1], -across[2]]);
}
const cross3 = (p: Vec3, q: Vec3): Vec3 => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
const unit3 = (p: Vec3): Vec3 => { const l = Math.hypot(p[0], p[1], p[2]) || 1; return [p[0] / l, p[1] / l, p[2] / l]; };

const collapsed: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant;
  const W = Math.max(4.6, ctx.info.w - 1.0), D = Math.max(6, ctx.info.d - 2.0);
  const post = shade(pick(rng, WEATHERED_PLANK), 0.75);
  // (props census r2 sweep, Lane C 2026-10-16: the ruin's box-only share 72 %) the stilts left standing are round poles,
  // the fallen sheets corrugated; the draws as before
  for (let k = 0; k < 7; k++) {
    const x = (rng() - 0.5) * W, z = (rng() - 0.5) * D, h = 0.6 + rng() * 1.8;
    roundPole(sink, [x, -0.3, z], [x + (rng() - 0.5) * 0.8, h, z + (rng() - 0.5) * 0.8], 0.085, { colour: post, exposed: true });
  }
  // (props census #7, lane B 2026-10-14; the judges: "the thatch a straw box") the fallen thatch slumped in a low mound
  // under the sheets, its ends ragged
  // (dome-detail-275; the dome law: a heap is a smooth revolve) the mound turned round from a soft profile, darker and
  // wetter at its foot; `under` reads its height off the same profile, so what lies on it lies on it
  const moundR = Math.min(W * 0.32, D * 0.27), moundTop = Math.min(W, D) * 0.1;
  const heap = smoothProfile([[-0.1, moundR + 0.06], [0.12, moundR * 0.85], [moundTop + 0.03, moundR * 0.38], [moundTop + 0.12, 0]], 3);
  const under = (px: number, pz: number): number => {
    const r = Math.hypot(px, pz);
    for (let i = 1; i < heap.length; i++) {
      const [y0, r0] = heap[i - 1], [y1, r1] = heap[i];
      if (r <= r0 && r >= r1) return Math.max(0.02, y0 + (y1 - y0) * (r0 - r) / Math.max(1e-6, r0 - r1) - 0.012);
    }
    return r < moundR ? moundTop + 0.1 : 0.02;
  };
  // (the buildings stream, 2026-10-12, the integrity check: the fallen roof sheets hung at drawn heights over the mud)
  // each sheet's ends on what is under them: the thatch heap where it reaches, the ground elsewhere
  for (let k = 0; k < 4; k++) {
    const a = rng() * Math.PI, x = (rng() - 0.5) * W * 0.6, z = (rng() - 0.5) * D * 0.6;
    const ax = x - Math.cos(a) * 1.6, az = z - Math.sin(a) * 1.6; rng();
    const bx = x + Math.cos(a) * 1.6, bz = z + Math.sin(a) * 1.6; rng();
    corrugatedSheet(sink, [ax, under(ax, az) + 0.02, az], [bx, under(bx, bz) + 0.02, bz], 1.6, { decor: true, exposed: true });
  }
  rng();
  sink.revolve('straw', [0, 0, 0], 'y', heap, DOME_MIN_SEGMENTS, { decor: true, shadeAt: (p) => 0.62 + 0.38 * Math.min(1, Math.max(0, (p[1] + 0.1) / (moundTop + 0.2))) });
  sink.polygon('straw', Array.from({ length: DOME_MIN_SEGMENTS }, (_, k): Vec3 => [Math.cos(k * Math.PI * 2 / DOME_MIN_SEGMENTS) * (moundR + 0.06), -0.1, Math.sin(k * Math.PI * 2 / DOME_MIN_SEGMENTS) * (moundR + 0.06)]), { decor: true, shade: 0.5 });
  // (dome-detail-275; the work list: posts, a few sheets and a heap) the house's one corner still standing where the shell
  // spared it: three stilts to the floor's height with the bearers on their heads, the corner post broken off above, a
  // run of the wall's boards standing ragged on the bearer, the floor's planks torn away and slid down from it to the mud
  const sx = look() < 0.5 ? -1 : 1, sz = look() < 0.5 ? -1 : 1, lift = 1.5 + look() * 0.3;
  const P0: Vec3 = [sx * (W / 2 - 0.3), 0, sz * (D / 2 - 0.3)], reach = 2.3 + look() * 0.4;
  const plank = pick(look, WEATHERED_PLANK), charred = shade(post, 0.5);
  roundPole(sink, [P0[0], -0.3, P0[2]], [P0[0], lift + 1.1 + look() * 1.0, P0[2]], 0.1, { colour: shade(post, 0.9), exposed: true });
  roundPole(sink, [P0[0] - sx * reach, -0.3, P0[2]], [P0[0] - sx * reach, lift, P0[2]], 0.09, { colour: post, exposed: true });
  roundPole(sink, [P0[0], -0.3, P0[2] - sz * reach], [P0[0], lift + 0.07, P0[2] - sz * reach], 0.09, { colour: post, exposed: true });
  const bear = { colour: shade(post, 0.85), exposed: true } as const;
  sink.member('structureWood', [P0[0] + sx * 0.1, lift, P0[2]], [P0[0] - sx * (reach + 0.1), lift, P0[2]], 0.14, 0.16, [0, 0, sz], bear, 0.08);
  sink.member('structureWood', [P0[0], lift + 0.14, P0[2] + sz * 0.1], [P0[0], lift + 0.14, P0[2] - sz * (reach + 0.1)], 0.14, 0.16, [sx, 0, 0], bear, 0.08);
  // the planks from the bearer down the slide, one or two gone, each its own length and weathering
  const top = lift + 0.08;
  for (let k = 0, n = Math.round(reach / 0.27); k < n; k++) {
    if (look() < 0.18) continue;
    const x = P0[0] - sx * (0.15 + k * 0.27), len = 2.0 + look() * 0.9, zl = P0[2] - sz * len, yl = under(x, zl) + 0.03;
    const hi: Vec3 = [x, top + 0.02, P0[2]], lo: Vec3 = [x, yl, zl], d = Math.hypot(top - yl, len);
    sink.member('structureWood', hi, lo, 0.24, 0.035, [0, len / d, -sz * (top - yl) / d], { colour: shade(plank, 0.8 + look() * 0.3), decor: true, exposed: true }, 0.035);
  }
  // the wall's boards along the x bearer, standing to ragged heights, a window's gap among them
  const wallFace: Face = { origin: [P0[0], 0, P0[2] + sz * 0.02], u: [sz, 0, 0], out: [0, 0, sz], width: reach };
  const gapAt = 0.8 + look() * (reach - 1.6);
  for (let u = 0.1; u < reach; u += 0.26) {
    const at = -sx * sz * u;
    if (Math.abs(u - gapAt) < 0.35) continue;
    const h = 0.3 + look() * (u < 0.6 ? 1.9 : 1.2);
    faceBox(sink, 'structureWood', wallFace, at, lift + 0.07 + h / 2, 0.06, 0.24, h, 0.03, { colour: shade(plank, 0.78 + look() * 0.3), decor: true });
  }
  // the roof's one slope slid off whole on the far side: its nipa slab, its lower edge in the mud, its upper on the heap,
  // the bamboo rafters run out from under it
  const zA = -sz * (D / 2 - 0.35), zB = -sz * (moundR * 0.55), xc = -sx * (0.3 + look() * 0.5), half = 1.3 + look() * 0.3;
  // (the rafters' feet in the mud past the slab's edge, their heads on the heap; the slab laid on them)
  const z0 = zA - sz * 0.35, yH = Math.max(under(xc - half, zB), under(xc, zB), under(xc + half, zB)) + 0.03;
  const rafterY = (z: number): number => 0.04 + (yH - 0.04) * (z - z0) / (zB - z0);
  for (let k = 0; k < 4; k++) {
    const x = xc - half + 0.25 + k * (2 * half - 0.5) / 3;
    roundPole(sink, [x, 0.04, z0], [x, yH, zB], 0.04, { colour: shade(BAMBOO_MAT, 0.75), decor: true, exposed: true });
  }
  const ya = rafterY(zA) + 0.12, yb = yH + 0.12, run = Math.hypot(yb - ya, zB - zA), sn: Vec3 = [0, Math.abs(zB - zA) / run, -sz * (yb - ya) / run];
  const along = (t: number, o: number): Vec3 => [xc, ya + (yb - ya) * t + sn[1] * o, zA + (zB - zA) * t + sn[2] * o];
  // the slab torn across a third of the way up, its upper piece slewed; the eave course's thick frayed lip along its foot;
  // the bamboo poles that held it down still lashed across it
  const tear = 0.34 + look() * 0.1, slew = (look() - 0.5) * 0.5;
  sink.member('straw', along(0, 0), along(tear, 0), 2 * half, 0.16, sn, { decor: true, exposed: true, shade: 0.8 }, 0.08);
  sink.member('straw', [along(tear + 0.04, 0)[0] + slew, along(tear + 0.04, 0)[1], along(tear + 0.04, 0)[2]], along(1, 0), 2 * half - 0.3, 0.16, sn, { decor: true, exposed: true, shade: 0.86 }, 0.08);
  sink.member('straw', along(0, 0.06), along(0.1, 0.06), 2 * half + 0.12, 0.12, sn, { decor: true, exposed: true, shade: 0.7 }, 0.02);
  for (const t of [-0.55, 0.45]) {
    const x = xc + t * half;
    roundPole(sink, [x, along(0.02, 0.09)[1], along(0.02, 0.09)[2]], [x + slew * 0.5, along(0.95, 0.09)[1], along(0.95, 0.09)[2]], 0.035, { colour: shade(BAMBOO_MAT, 0.7), decor: true, exposed: true });
  }
  // what the house held: its glazed water jar (khạp) by the standing corner, a mat wall panel flat in the mud, loose boards,
  // a charred post, and the shell's crater filled with rain
  const jx = P0[0] - sx * 0.6, jz = P0[2] - sz * (reach + 0.55);
  sink.revolve('structureWood', [jx, 0, jz], 'y', [[0, 0.2], [0.12, 0.3], [0.34, 0.36], [0.56, 0.3], [0.68, 0.2], [0.72, 0.22]], 12, { colour: rgb(0x5a3a22), decor: true });
  sink.cylinder('structureWood', [jx, 0.66, jz], 'y', 0.02, 0.19, 12, { colour: [0.05, 0.05, 0.045], decor: true });
  sink.polygon('structureWood', Array.from({ length: 12 }, (_, k): Vec3 => [jx + Math.cos(k * Math.PI / 6) * 0.2, 0, jz + Math.sin(k * Math.PI / 6) * 0.2]), { colour: rgb(0x3a2616), decor: true });
  const mx = -sx * (W / 2 - 1.2), mz = sz * (D / 2 - 1.3);
  sink.member('structureWood', [mx - 0.8, 0, mz], [mx + 0.8, 0, mz + 0.3], 1.9, 0.04, [0, 1, 0], { colour: shade(BAMBOO_MAT, 0.8), decor: true, exposed: true }, 0);
  for (let k = 0; k < 4; k++) {
    const a = look() * Math.PI, x = (look() - 0.5) * W * 0.9, z = (look() - 0.5) * D * 0.9, l = 1.2 + look() * 1.2;
    const p: Vec3 = [x - Math.cos(a) * l / 2, under(x - Math.cos(a) * l / 2, z - Math.sin(a) * l / 2) - 0.015, z - Math.sin(a) * l / 2];
    const q: Vec3 = [x + Math.cos(a) * l / 2, under(x + Math.cos(a) * l / 2, z + Math.sin(a) * l / 2) - 0.015, z + Math.sin(a) * l / 2];
    sink.member('structureWood', p, q, 0.22, 0.04, [0, 1, 0], { colour: k === 0 ? charred : shade(plank, 0.7 + look() * 0.3), decor: true, exposed: true }, 0);
  }
  const cx = -sx * (W / 2 - 1.0), cz = -sz * 0.2 + sz * look() * 0.6, cr = 0.9 + look() * 0.3, pool: Vec3[] = [];
  for (let k = 0; k < 10; k++) {
    const t = -k * Math.PI * 2 / 10, f = 0.8 + hash01(cx, cz, k, 4.4) * 0.3;
    pool.push([cx + Math.cos(t) * cr * f, 0.02, cz + Math.sin(t) * cr * f * 0.8]);
  }
  sink.prism('structureWood', pool.map((p): Vec3 => [p[0], 0, p[2]]), [0, 1, 0], 0.025, { colour: rgb(0x3a4038), decor: true, ...(ctx.ground ? { ground: true } : {}) });
  return sink.finish();
};

/** A market stall (the base market plot): a plank platform, a bamboo frame under a nipa-thatch roof, a counter of baskets. */
// (props census #23, the looks lane 2026-10-15: member-built in marketKits.ts)
const marketStall: RegionalBuilder = (ctx) => mekongChoStall(ctx);

const MEKONG_BUILDERS: Readonly<Record<string, RegionalBuilder>> = Object.freeze({
  cottage: (ctx) => stiltHouse(ctx),
  farmhouse: (ctx) => groundHouse(ctx),
  // boat shelters walled at the back, stores and rice houses walled on three sides (they keep the cover of the base
  // sheds), the depot a rendered shophouse
  boatshed: (ctx) => shelter(ctx, { walls: 3 }),
  granary: (ctx) => deltaShed(ctx, true),
  woodshed: (ctx) => deltaShed(ctx, false),
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
  builders: { ...MEKONG_BUILDERS, boatshed: mekongBoatShelter, fishery: mekongFishShed },
  // the yards: a woven-bamboo fence round raised vegetable beds, an open gap for a gate (yards.ts)
  yard: { kinds: ['cottage', 'farmhouse'], fence: 'fencewattle', gate: null, shed: null, garden: true },
});
