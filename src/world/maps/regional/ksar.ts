// src/world/maps/regional/ksar.ts — the ksar kit (Sirocco Wadi: the Dahar ksour of southern Tunisia — Ouled Soltane,
// Hadada, Chenini). The fortified granary: ghorfas, barrel-vaulted cells of rubble under mud plaster, stacked two and
// three high round a court, their rounded ends in rows with small timber doors, hoisting beams and steep stairs up the
// fronts; flat-roofed village houses rendered in ochre or whitewash with Tunisian blue doors and window grilles, a stair
// block to the roof terrace and a parapet; a whitewashed mosque with a squat square minaret; the borj, a tapering
// watch tower; a domed hammam.
import { PartSink, faceBox, pick, rgb, shade, UV_MEMBER, type Face, type RegionalBucket, type Rgb } from './geometry.ts';
import { buildHouse, windowRhythm, type HouseDialect, type Opening } from './house.ts';
import { doorUnit, windowUnit, type WindowStyle } from './openings.ts';
import type { ArchitectureStyle, RegionalBuildContext, RegionalBuilder } from './types.ts';

const BLUES: readonly Rgb[] = [0x2f6a9e, 0x3a7ab0, 0x2e5f8a].map(rgb);
const TIMBER = rgb(0x7a6048);
// mud plaster over rubble: the map's own render (the sourced plaster set under the desert palette), the colour of the
// ground it was dug from (w2 captures: the kit's own saturated plaster3 tone read as orange against the sand)
const MUD: RegionalBucket = 'plaster';

function uvOffset(ctx: RegionalBuildContext): [number, number] {
  return [ctx.rng() * 7.31, ctx.rng() * 5.17];
}

/** One ghorfa cell: rubble walls and a barrel vault running back from its rounded front, a small door, a beam. */
function ghorfa(sink: PartSink, x: number, y: number, z: number, w: number, h: number, d: number, rng: () => number, blue: Rgb): void {
  const r = w / 2;
  sink.span(MUD, x - r, y, z - d, x + r, y + h, z);
  // the vault: a half drum along -z from the front
  sink.cylinder(MUD, [x, y + h, z - d], 'z', d, r, 8, {}, r, true, -Math.PI / 2, Math.PI);
  const front: Face = { origin: [x, 0, z], u: [1, 0, 0], out: [0, 0, 1], width: w };
  faceBox(sink, 'dark', front, 0, y + 0.7, 0.005, 0.7, 1.1, 0.02, { decor: true });
  faceBox(sink, 'structureWood', front, 0, y + 0.7, 0.03, 0.66, 1.05, 0.04, { colour: rng() < 0.5 ? blue : shade(TIMBER, 0.9), decor: true, uv: UV_MEMBER });
  if (rng() < 0.6) faceBox(sink, 'structureWood', front, (rng() - 0.5) * w * 0.4, y + h + r * 0.55, 0.3, 0.12, 0.12, 0.6, { colour: TIMBER, decor: true });
}

/** A ghorfa range: rows of vaulted cells stacked two or three high along the sides of a court, steps up the fronts. */
const ghorfaRange: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const W = Math.max(14, Math.min(24, ctx.info.w - 0.5)), D = Math.max(12, Math.min(20, ctx.info.d - 0.5));
  const blue = pick(rng, BLUES);
  const cw = 2.4, ch = 1.9, cd = Math.min(6.0, D * 0.35);
  const tiers = rng() < 0.5 ? 3 : 2;
  const tierH = ch + cw / 2 + 0.1;
  // the back range (along x at -z) faces the court (+z); the side ranges face inward along x
  const back = -D / 2 + cd;
  const n = Math.floor(W / (cw + 0.12));
  for (let t = 0; t < tiers; t++) for (let i = 0; i < n; i++) {
    const x = -W / 2 + (cw + 0.12) * (i + 0.5);
    if (t === tiers - 1 && rng() < 0.15) continue;
    ghorfa(sink, x, t * tierH, back, cw, ch, cd, rng, blue);
  }
  for (const side of [-1, 1]) {
    const m = Math.max(2, Math.floor((D - cd - 3) / (cw + 0.12)));
    for (let t = 0; t < Math.max(1, tiers - 1); t++) for (let i = 0; i < m; i++) {
      const z = back + 0.4 + (cw + 0.12) * (i + 0.5);
      // a side range: build the cell facing +z and turn it to face the court (±x)
      sink.placed(side > 0 ? -Math.PI / 2 : Math.PI / 2, side * (W / 2 - cd), 0, z, () => ghorfa(sink, 0, t * tierH, 0, cw, ch, cd, rng, blue));
    }
  }
  // steep stairs of jutting stones up the back range's front
  for (let t = 1; t < tiers; t++) {
    const sx = -W / 2 + (cw + 0.12) * (Math.floor(n / 2) + 0.5) + cw / 2 + 0.06;
    for (let k = 0; k < 6; k++) sink.span(MUD, sx - 0.3, (t - 1) * tierH + ch + k * (tierH / 6) - 0.05, back, sx + 0.3, (t - 1) * tierH + ch + k * (tierH / 6) + 0.1, back + 0.35 + (5 - k) * 0.06, { decor: true });
  }
  // the court's enclosing wall and gate on +z
  const wallH = 3.0;
  sink.span(MUD, -W / 2, 0, D / 2 - 0.6, -2.0, wallH, D / 2);
  sink.span(MUD, 2.0, 0, D / 2 - 0.6, W / 2, wallH, D / 2);
  sink.span(MUD, -2.2, 3.2, D / 2 - 0.7, 2.2, 4.0, D / 2 + 0.05);
  for (const sx of [-1, 1]) sink.span(MUD, sx * 2.0 - 0.3, 0, D / 2 - 0.7, sx * 2.0 + 0.3, 3.2, D / 2 + 0.05);
  return sink.finish();
};

/**
 * A souk row of ghorfa shops on the base market row's plot (12 x 5.2 m): vaulted cells side by side along it, their
 * doors on its long side, a second tier over the middle cells reached by jutting stair stones (the ghorfa souk of
 * Medenine). The ghorfa range's court needs a plot three times as deep; this row stays inside its own.
 */
const ghorfaShops: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const W = Math.max(5, ctx.info.w - 0.5), D = Math.max(3.4, Math.min(6, ctx.info.d - 0.9));
  const blue = pick(rng, BLUES);
  const cw = 2.4, ch = 1.9, tierH = ch + cw / 2 + 0.1;
  const n = Math.max(2, Math.floor(W / (cw + 0.12)));
  const cellX = (i: number) => -n * (cw + 0.12) / 2 + (cw + 0.12) * (i + 0.5);
  for (let i = 0; i < n; i++) ghorfa(sink, cellX(i), 0, D / 2, cw, ch, D, rng, blue);
  // the upper tier over the middle cells, set back a little from the lane
  const first = Math.floor((n - 1) / 2), last = n >= 4 ? first + 1 : first;
  for (let i = first; i <= last; i++) {
    if (rng() < 0.2) continue;
    ghorfa(sink, cellX(i), tierH, D / 2 - 0.4, cw, ch, D - 0.4, rng, blue);
  }
  // the stair stones jutting from the front between the cells, from the ground up to the upper floor
  const sx = cellX(first) - cw / 2 - 0.06;
  for (let k = 0; k < 6; k++) {
    const y = 0.35 + k * (tierH - 0.35) / 5.5;
    sink.span(MUD, sx - 0.3, y - 0.05, D / 2 - 0.05, sx + 0.3, y + 0.1, D / 2 + 0.3 - k * 0.04, { decor: true });
  }
  return sink.finish();
};

/** The village house: a flat roof behind a parapet, ochre or whitewash, blue door and grilles, a roof stair block. */
const house: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const W = Math.max(5.0, ctx.info.w - 0.3), D = Math.max(5.4, ctx.info.d - 0.3);
  const wall: RegionalBucket = ctx.wallBucket === 'stone' ? MUD : ctx.wallBucket as RegionalBucket;
  const blue = pick(rng, BLUES);
  const style: WindowStyle = { frame: blue, frameWidth: 0.06, frameOut: 0.04, bars: 'six', surround: { bucket: 'plaster', width: 0.12, out: 0.04 }, sill: null, shutters: null };
  const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'door', u: (rng() - 0.5) * W * 0.3, w: 1.05, y0: 0, h: 2.1 }];
  for (const face of ['front', 'left', 'right'] as const) {
    for (const o of windowRhythm(face, 0, face === 'front' ? W : D, { w: 0.55, h: 0.7, sill: 1.5, spacing: 2.4, margin: 1.0, max: 2,
      avoid: face === 'front' ? [[openings[0].u - 0.8, openings[0].u + 0.8]] : [] })) openings.push(o);
  }
  const dialect: HouseDialect = {
    window: (s, face, o, y0) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, style, rng, 0.35),
    door: (s, face, o, y0) => doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { leaf: blue, frame: { bucket: 'plaster', width: 0.18, out: 0.06, arch: rng() < 0.5 }, steps: { bucket: MUD }, leafKind: 'panel' }, y0 + o.y0),
  };
  const wallH = 3.0 + rng() * 0.5;
  const frame = buildHouse(sink, {
    w: W, d: D, plinth: { h: 0.2, out: 0.06, bucket: MUD }, storeys: [{ h: wallH, wall }],
    roof: { kind: 'flat', pitchDeg: 0, eave: 0.05, verge: 0.05, thickness: 0.18, bucket: wall, parapet: 0.55 + rng() * 0.3 },
    gableBucket: wall, openings, chimneys: [], gutters: null, verge: null,
  }, dialect);
  // rainwater spouts through the parapet and the roof stair block
  const b = frame.bodies[0];
  for (const x of [-W * 0.3, W * 0.3]) sink.span('structureWood', x - 0.06, wallH - 0.1, b.z1, x + 0.06, wallH + 0.0, b.z1 + 0.45, { colour: TIMBER, decor: true });
  if (rng() < 0.5) sink.span(wall, -W / 2 + 0.2, wallH, -D / 2 + 0.2, -W / 2 + 0.2 + W * 0.35, wallH + 2.2, -D / 2 + 0.2 + D * 0.3);
  return sink.finish();
};

/** The square Tunisian minaret: whitewashed shaft, a gallery parapet, a lantern of arches and a little dome. */
const minaret: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const S = 2.8, H = 11.5;
  sink.span(MUD, -S / 2 - 0.25, -0.3, -S / 2 - 0.25, S / 2 + 0.25, 0.6, S / 2 + 0.25);
  sink.span('plaster', -S / 2, 0.6, -S / 2, S / 2, H, S / 2);
  sink.span('plaster', -S / 2 - 0.2, H, -S / 2 - 0.2, S / 2 + 0.2, H + 0.25, S / 2 + 0.2);
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) sink.span('plaster', sx * (S / 2 + 0.1) - 0.15, H + 0.25, sz * (S / 2 + 0.1) - 0.15, sx * (S / 2 + 0.1) + 0.15, H + 1.0, sz * (S / 2 + 0.1) + 0.15);
  const L = S * 0.62;
  sink.span('plaster', -L / 2, H + 0.25, -L / 2, L / 2, H + 2.4, L / 2);
  for (const face of [{ origin: [0, 0, L / 2], u: [1, 0, 0], out: [0, 0, 1], width: L }, { origin: [L / 2, 0, 0], u: [0, 0, -1], out: [1, 0, 0], width: L },
    { origin: [0, 0, -L / 2], u: [-1, 0, 0], out: [0, 0, -1], width: L }, { origin: [-L / 2, 0, 0], u: [0, 0, 1], out: [-1, 0, 0], width: L }] as Face[]) {
    faceBox(sink, 'dark', face, 0, H + 1.3, 0.005, 0.7, 1.2, 0.02, { decor: true });
  }
  sink.cylinder('plaster', [0, H + 2.4, 0], 'y', 0.6, L * 0.5, 10, {}, L * 0.42, false);
  sink.cylinder('plaster', [0, H + 3.0, 0], 'y', 0.6, L * 0.42, 10, {}, 0.05);
  // the green-tiled band under the gallery
  sink.span('structureWood', -S / 2 - 0.02, H - 0.6, -S / 2 - 0.02, S / 2 + 0.02, H - 0.3, S / 2 + 0.02, { colour: rgb(0x3f7a5a), decor: true });
  return sink.finish();
};

/** The borj: a tapering mud-plastered watch tower with a crenellated top and a timber door high in its wall. */
const borj: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const S = Math.max(3.2, Math.min(ctx.info.w, ctx.info.d) - 0.6), H = Math.max(7.5, ctx.info.h - 1.5);
  sink.cylinder(MUD, [0, -0.3, 0], 'y', H + 0.3, S * 0.72, 4, {}, S * 0.6, true, Math.PI / 4);
  const top = H, s = S * 0.6 * Math.SQRT1_2;
  for (let k = -2; k <= 2; k++) for (const [ax, sgn] of [['x', 1], ['x', -1], ['z', 1], ['z', -1]] as const) {
    if (k % 2 !== 0) continue;
    const c = k * s / 2.5;
    if (ax === 'x') sink.span(MUD, sgn * s - 0.18, top, c - 0.25, sgn * s + 0.18, top + 0.6, c + 0.25);
    else sink.span(MUD, c - 0.25, top, sgn * s - 0.18, c + 0.25, top + 0.6, sgn * s + 0.18);
  }
  const face: Face = { origin: [0, 0, S * 0.66 * Math.SQRT1_2], u: [1, 0, 0], out: [0, 0, 1], width: S };
  doorUnit(sink, face, 0, 0, 0.9, 1.9, { leaf: TIMBER, frame: { bucket: MUD, width: 0.2, out: 0.08 }, steps: null, leafKind: 'plank' });
  return sink.finish();
};

/** A domed hammam: a whitewashed block with three domes and a tiny lantern. */
const hammam: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const W = Math.max(7, Math.min(12, ctx.info.w - 0.6)), D = Math.max(7, Math.min(12, ctx.info.d - 0.6));
  const frame = buildHouse(sink, {
    w: W, d: D, plinth: { h: 0.25, out: 0.06, bucket: MUD }, storeys: [{ h: 3.6, wall: 'plaster' }],
    roof: { kind: 'flat', pitchDeg: 0, eave: 0.06, verge: 0.06, thickness: 0.2, bucket: 'plaster', parapet: 0.35 }, gableBucket: 'plaster',
    openings: [{ face: 'front', storey: 0, kind: 'door', u: 0, w: 1.2, y0: 0, h: 2.3 }], chimneys: [], gutters: null, verge: null,
  }, {
    window: () => {},
    door: (s, face, o, y0) => doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { leaf: pick(ctx.rng, BLUES), frame: { bucket: 'plaster', width: 0.2, out: 0.06, arch: true }, steps: { bucket: MUD }, leafKind: 'panel' }, y0 + o.y0),
  });
  const top = frame.eaveY + 0.2;
  for (const [x, z, r] of [[-W * 0.22, -D * 0.15, 1.6], [W * 0.22, -D * 0.15, 1.6], [0, D * 0.18, 2.0]] as const) {
    const prof = [1.0, 0.97, 0.88, 0.7, 0.42, 0.12];
    let y = top;
    for (let k = 0; k + 1 < prof.length; k++) { sink.cylinder('plaster', [x, y, z], 'y', r * 0.24, r * prof[k], 12, {}, r * prof[k + 1], k === prof.length - 2); y += r * 0.24; }
  }
  return sink.finish();
};

/** A collapsed ghorfa range: broken vault stubs and a slump of mud rubble. */
const ruin: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const W = Math.max(5.4, ctx.info.w - 0.3), D = Math.max(6, ctx.info.d - 0.3);
  const blue = pick(rng, BLUES);
  const n = Math.max(2, Math.floor(W / 2.5));
  for (let i = 0; i < n; i++) {
    if (rng() < 0.35) continue;
    ghorfa(sink, -W / 2 + 2.5 * (i + 0.5), 0, D / 2, 2.4, 1.6 + rng() * 0.5, D * (0.4 + rng() * 0.5), rng, blue);
  }
  sink.span(MUD, -W * 0.4, -0.2, -D * 0.3, W * 0.35, 0.9, D * 0.1, { decor: true });
  return sink.finish();
};

/**
 * A souk stall (the base market plot): a mud-plastered back wall hung with kilims, two palm-trunk posts and the beams
 * to the wall under a mat of palm ribs (jerid) that lets the sun through in stripes, the fronds hanging ragged over
 * the lane; a plastered counter of baskets of dates and spice, clay jars at its foot (the market lanes of Tataouine
 * and Medenine). The mat and the goods are dressing: shells pass through palm fronds.
 */
const soukStall: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const W = Math.max(4.5, Math.min(6.4, ctx.info.w - 0.4)), D = Math.max(3.6, Math.min(5.0, ctx.info.d - 0.4));
  stallBody(sink, ctx.variant, W, D);
  return sink.finish();
};

/** The stall itself, W x D about the origin, its counter to +z (the ksar's market plot, Siwa's shop rows). */
function stallBody(sink: PartSink, look: () => number, W: number, D: number, top = 2.55): void {
  const floor = 0.18, wallZ = -D / 2 + 0.4;
  // a beaten-earth platform skimmed with mud, the back wall of mud brick under plaster standing proud of the mat
  sink.span(MUD, -W / 2 - 0.2, -0.3, -D / 2 - 0.2, W / 2 + 0.2, floor, D / 2 + 0.2);
  sink.span(MUD, -W / 2, floor, -D / 2, W / 2, top + 0.45, wallZ);
  // palm-trunk posts at the front, a trunk beam across them, three trunk joists back to the wall
  const palm = rgb(0x6a5a46), postZ = D / 2 - 0.2;
  for (const sx of [-1, 1]) sink.cylinder('structureWood', [sx * (W / 2 - 0.2), floor, postZ], 'y', top - floor, 0.14, 7, { colour: palm, uv: UV_MEMBER }, 0.12);
  sink.member('structureWood', [-W / 2 - 0.1, top + 0.08, postZ], [W / 2 + 0.1, top + 0.08, postZ], 0.18, 0.18, [0, 1, 0], { colour: palm });
  for (const t of [-0.36, 0, 0.36]) sink.member('structureWood', [t * W, top + 0.24, wallZ - 0.1], [t * W, top + 0.24, postZ + 0.15], 0.13, 0.13, [0, 1, 0], { colour: shade(palm, 0.92) });
  // the jerid: palm ribs laid across the joists with gaps between them, fresh tan to sun-grey
  const ribs = Math.max(12, Math.round((postZ + 0.3 - wallZ) / 0.21));
  for (let k = 0; k < ribs; k++) {
    const z = wallZ + 0.05 + (postZ + 0.3 - wallZ) * (k + 0.5) / ribs, tone = look();
    const c: Rgb = [0.55 + tone * 0.14, 0.48 + tone * 0.12, 0.36 + tone * 0.08];
    sink.span('structureWood', -W / 2 - 0.2 + look() * 0.15, top + 0.31, z - 0.07, W / 2 + 0.2 - look() * 0.15, top + 0.35, z + 0.07, { colour: c, decor: true, shadow: true });
  }
  // the frond tips hanging ragged over the lane edge, leaning out, some missing
  for (let x = -W / 2 - 0.1; x < W / 2 + 0.1; x += 0.16 + look() * 0.16) {
    if (look() < 0.2) continue;
    const len = 0.2 + look() * 0.4, tone = look();
    sink.member('structureWood', [x, top + 0.33, postZ + 0.3], [x + (look() - 0.5) * 0.16, top + 0.33 - len, postZ + 0.36 + look() * 0.12],
      0.06 + look() * 0.07, 0.02, [0, 0, 1], { colour: [0.5 + tone * 0.14, 0.43 + tone * 0.12, 0.31 + tone * 0.08], decor: true, shadow: true, exposed: true });
  }
  // the counter: a plastered bench across the front, open at one end
  sink.span(MUD, -W / 2 + 0.35, floor, D / 2 - 1.05, W / 2 - 0.95, floor + 0.75, D / 2 - 0.5);
  // the kilims on the back wall: bands of madder, indigo, saffron and undyed wool
  const wall: Face = { origin: [0, 0, wallZ], u: [1, 0, 0], out: [0, 0, 1], width: W };
  const grounds: readonly Rgb[] = [0x8e2f24, 0x8e2f24, 0x2f3a5e, 0x9a5a2a].map(rgb);
  const accents: readonly Rgb[] = [0xd8ccb0, 0xc08a2a, 0x2f3a5e, 0x6e2a3a, 0x2a2522].map(rgb);
  for (const u of [-W * 0.27, W * 0.2]) {
    const rw = 1.0 + look() * 0.4, rh = 1.5 + look() * 0.4, y0 = floor + 0.55, bands = 5 + 2 * Math.floor(look() * 3);
    const ground = pick(look, grounds), unit = rh / (1.45 * (bands + 1) / 2 + 0.55 * (bands - 1) / 2);
    // wide ground bands at either end and between the narrow accent stripes
    for (let b = 0, y = y0; b < bands; b++) {
      const colour = b % 2 ? pick(look, accents) : ground, h = unit * (b % 2 ? 0.55 : 1.45);
      faceBox(sink, 'structureWood', wall, u, y + h / 2, 0.016, rw, h, 0.012, { colour, decor: true });
      y += h;
    }
  }
  // flat baskets of dates, chillies, turmeric and chickpeas on the counter; clay jars by the posts
  const basket = rgb(0xa08a5a), goods: readonly Rgb[] = [0x5a3020, 0xa83a1e, 0xc89a2a, 0xc8b080].map(rgb);
  for (let k = 0; k < 3; k++) {
    const x = -W / 2 + 0.75 + k * (W - 2.1) / 2.4;
    sink.cylinder('structureWood', [x, floor + 0.75, D / 2 - 0.78], 'y', 0.1, 0.22, 8, { colour: basket, decor: true }, 0.24);
    sink.cylinder('structureWood', [x, floor + 0.85, D / 2 - 0.78], 'y', 0.07, 0.2, 8, { colour: pick(look, goods), decor: true }, 0.1);
  }
  const clay: Rgb = rgb(0xa8673e);
  for (let k = 0, n = 2 + Math.floor(look() * 3); k < n; k++) {
    const x = (look() < 0.5 ? -1 : 1) * (W / 2 - 0.55 - look() * 0.5), z = wallZ + 0.4 + look() * 1.2, r = 0.17 + look() * 0.08;
    sink.cylinder('structureWood', [x, floor, z], 'y', r * 1.8, r * 0.7, 8, { colour: clay, decor: true }, r * 1.25);
    sink.cylinder('structureWood', [x, floor + r * 1.8, z], 'y', r * 0.9, r * 1.25, 8, { colour: shade(clay, 0.95), decor: true }, r * 0.45);
  }
}

export const KSAR_BUILDERS: Readonly<Record<string, RegionalBuilder>> = Object.freeze({
  adobe: house,
  caravanserai: ghorfaRange,
  compound: ghorfaRange,
  compoundSouk: ghorfaRange,
  // the market row: a souk row of vaulted shop cells along the lane
  marketRow: ghorfaShops,
  minaret,
  tower: borj,
  bathhouse: hammam,
  ruin,
  // the base market plot: the generic canvas stall becomes a souk stall
  market: soukStall,
});

export const KSAR_STYLE: ArchitectureStyle = Object.freeze<ArchitectureStyle>({
  id: 'ksar',
  region: 'Dahar plateau, southern Tunisia (Ouled Soltane, Hadada, Chenini): vaulted ghorfa granaries and flat-roofed houses',
  surfaces: {
    roof: { kind: 'canal', tint: [0.70, 0.52, 0.38] },
    stone: { kind: 'rubble', tint: [0.68, 0.62, 0.53] },
    sourced: { plaster: true, wood: true },
    tones: {
      plaster: (_h, s, l) => [0.11, Math.min(1, s * 0.2), Math.min(1, l * 1.3 + 0.12)],
      plaster2: (_h, s, l) => [0.09, Math.min(1, s * 0.6 + 0.18), Math.min(1, l * 1.08 + 0.06)],
      plaster3: (_h, s, l) => [0.085, Math.min(1, s * 0.7 + 0.22), Math.min(1, l * 1.02 + 0.03)],
    },
  },
  builders: KSAR_BUILDERS,
  // mud render from fresh pale clay to an older ochre house to house (Ouled Soltane's courts are both); a dry climate
  // (little damp, no moss)
  weather: {
    plaster: [[1, 1, 1], [1.04, 1.02, 0.98], [0.95, 0.9, 0.82], [0.9, 0.84, 0.74], [1.06, 1.05, 1.02]],
    stone: [[1, 1, 1], [0.94, 0.92, 0.9]],
    roof: [[1, 1, 1], [0.9, 0.86, 0.82]],
    damp: 0.25, moss: 0.05,
  },
  wear: 0.15,
  // the courtyards: mud-brick walls round each house's court (hosh), a gate (yards.ts)
  yard: { kinds: ['adobe'], fence: 'walladobe', gate: 'gate', shed: null, garden: false },
});

// ---------------------------------------------------------------------------------------------------------------------
// The siwa variant (the map-revival lane, 2026-10-05). Sunscar Oasis is Siwa, in Egypt's Western Desert: the old town of
// Shali, houses of kershef (salt-crusted mud and rock) heaped up a hill in rounded, battered blocks of one to three
// storeys, their corners thickened, palm-trunk beams through the walls under the roof parapets, small windows behind
// palm-wood shutters and plank doors; the mosque's tapering mud minaret; the springs in their stone rims under palm
// shelters; the souk's stalls under palm-rib mats. It shares the ksar's mud render (MUD), timber, uv offset and its
// palm-rib stall (stallBody, and the market plot's soukStall itself); its own forms follow. Every Siwa builder sizes its
// body from the base's measured reach (ctx.bounds), so no lane opens beside it.

/** Palm-trunk wood: the posts, beams and shutters of Siwa. */
const PALM = rgb(0x6a5a46), PALM_GREY = rgb(0x8a7c68);
/** Older kershef, darker and greyer; the mosque's limewash. */
const KERSHEF_OLD: RegionalBucket = 'plaster2';

function reach(ctx: RegionalBuildContext): { W: number; D: number; cx: number; cz: number; x0: number; x1: number; z0: number; z1: number } {
  const b = ctx.bounds;
  return { W: b.maxX - b.minX, D: b.maxZ - b.minZ, cx: (b.maxX + b.minX) / 2, cz: (b.maxZ + b.minZ) / 2, x0: b.minX, x1: b.maxX, z0: b.minZ, z1: b.maxZ };
}

/** The four faces of a box x0..x1 x z0..z1 (front +z, right +x, back -z, left -x). */
function boxFaces(x0: number, z0: number, x1: number, z1: number): { front: Face; right: Face; back: Face; left: Face } {
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = x1 - x0, d = z1 - z0;
  return {
    front: { origin: [cx, 0, z1], u: [1, 0, 0], out: [0, 0, 1], width: w },
    right: { origin: [x1, 0, cz], u: [0, 0, -1], out: [1, 0, 0], width: d },
    back: { origin: [cx, 0, z0], u: [-1, 0, 0], out: [0, 0, -1], width: w },
    left: { origin: [x0, 0, cz], u: [0, 0, 1], out: [-1, 0, 0], width: d },
  };
}

/** A small Siwan window: a mud reveal round it and a palm-wood shutter set back in it (no dark void). */
function siwaWindow(sink: PartSink, face: Face, u: number, y: number, w: number, h: number, look: () => number): void {
  faceBox(sink, MUD, face, u, y + h / 2, 0.03, w + 0.24, h + 0.24, 0.06, { decor: true, shade: 0.88 });
  faceBox(sink, 'structureWood', face, u, y + h / 2, 0.065, w, h, 0.03, { colour: look() < 0.5 ? PALM : PALM_GREY, decor: true, uv: UV_MEMBER });
  faceBox(sink, 'structureWood', face, u, y + h / 2, 0.085, 0.04, h - 0.06, 0.012, { colour: shade(PALM, 0.7), decor: true, fine: true });
}

/**
 * A kershef block from y0, h high, over x0..x1 x z0..z1: the body, a battered foot a little proud of it, thickened round
 * corners, the roof's parapet with rounded merlons at the corners, palm-beam ends under it, small shuttered windows
 * on the outer faces, and a plank door in the front when `door`.
 */
function kershefBlock(sink: PartSink, x0: number, z0: number, x1: number, z1: number, y0: number, h: number, bucket: RegionalBucket,
  rng: () => number, look: () => number, opts: { door?: boolean; faces?: ReadonlyArray<'front' | 'right' | 'back' | 'left'> } = {}): void {
  const top = y0 + h;
  sink.span(bucket, x0, y0 - (y0 > 0 ? 0 : 0.3), z0, x1, top, z1);
  if (y0 === 0) sink.span(bucket, x0 - 0.12, -0.3, z0 - 0.12, x1 + 0.12, 0.75, z1 + 0.12, { shade: 0.94 });
  for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]] as const) {
    sink.cylinder(bucket, [x, y0 - (y0 > 0 ? 0 : 0.3), z], 'y', h + (y0 > 0 ? 0.55 : 0.85), 0.32, 8, {}, 0.24);
  }
  // the parapet round the roof and the merlons' rounded tops at the corners
  const t = 0.22, ph = 0.5;
  for (const [a, b, c, d] of [[x0, z0, x1, z0 + t], [x0, z1 - t, x1, z1], [x0, z0 + t, x0 + t, z1 - t], [x1 - t, z0 + t, x1, z1 - t]] as const) sink.span(bucket, a, top, b, c, top + ph, d);
  for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]] as const) sink.cylinder(bucket, [x, top + ph - 0.05, z], 'y', 0.28, 0.24, 8, { decor: true }, 0.04);
  const faces = boxFaces(x0, z0, x1, z1);
  for (const name of opts.faces ?? ['front', 'right', 'back', 'left'] as const) {
    const f = faces[name];
    // the palm-beam ends through the wall under the parapet
    const n = Math.max(2, Math.floor(f.width / 0.9));
    for (let k = 0; k < n; k++) {
      const u = -f.width / 2 + (k + 0.5) * f.width / n;
      if (look() < 0.2) continue;
      faceBox(sink, 'structureWood', f, u, top - 0.32, 0.18, 0.16, 0.16, 0.36, { colour: shade(PALM, 0.85 + look() * 0.25), decor: true, uv: UV_MEMBER });
    }
    // small windows high in the wall, one or two to a storey
    const storeys = Math.max(1, Math.round(h / 3.0));
    for (let st = 0; st < storeys; st++) {
      const wy = y0 + st * 3.0 + 1.45;
      if (wy + 0.6 > top - 0.45) continue;
      const m = f.width > 5 ? 2 : 1;
      for (let k = 0; k < m; k++) {
        if (rng() < 0.3) continue;
        const u = m === 1 ? (rng() - 0.5) * f.width * 0.3 : (k === 0 ? -1 : 1) * f.width * (0.18 + rng() * 0.12);
        siwaWindow(sink, f, u, wy, 0.5, 0.55, look);
      }
    }
  }
  if (opts.door && y0 === 0) {
    const f = faces.front;
    doorUnit(sink, f, (rng() - 0.5) * Math.max(0, f.width - 2.4) * 0.6, 0, 0.95, 1.95, { leaf: PALM, frame: { bucket, width: 0.22, out: 0.07 }, steps: null, leafKind: 'plank' });
  }
}

/** A Siwan house (an adobe plot): a kershef block filling the plot, a door to the lane, often an upper room at the back. */
const kershefHouse: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant;
  const R = reach(ctx);
  const x0 = R.x0 + 0.25, x1 = R.x1 - 0.25, z0 = R.z0 + 0.25, z1 = R.z1 - 0.25, h = 3.1 + rng() * 0.5;
  kershefBlock(sink, x0, z0, x1, z1, 0, h, rng() < 0.3 ? KERSHEF_OLD : MUD, rng, look, { door: true });
  if (rng() < 0.55) {
    const ux1 = x0 + (x1 - x0) * (0.5 + rng() * 0.2), uz1 = z0 + (z1 - z0) * (0.45 + rng() * 0.15);
    kershefBlock(sink, x0 + 0.1, z0 + 0.1, ux1, uz1, h, 2.7, MUD, rng, look, { faces: ['front', 'right'] });
  }
  return sink.finish();
};

/**
 * Old Shali (a caravanserai or compound plot): the town's houses heaped together, a block to each cell of the plot,
 * one to three storeys, the middle highest, set a little in from each other, the outer faces on the plot's edge; doors
 * to the front lane.
 */
const shaliCluster: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant;
  const R = reach(ctx);
  const nx = R.W > 15 ? 3 : 2, nz = R.D > 13 ? 3 : 2;
  const cw = R.W / nx, cd = R.D / nz;
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const x0 = R.x0 + i * cw + (i === 0 ? 0.25 : 0.15 + rng() * 0.35), x1 = R.x0 + (i + 1) * cw - (i === nx - 1 ? 0.25 : 0.15 + rng() * 0.35);
    const z0 = R.z0 + j * cd + (j === 0 ? 0.25 : 0.15 + rng() * 0.35), z1 = R.z0 + (j + 1) * cd - (j === nz - 1 ? 0.25 : 0.15 + rng() * 0.35);
    const middle = (i > 0 && i < nx - 1) || (j > 0 && j < nz - 1);
    const storeys = Math.min(3, 1 + Math.floor(rng() * 2) + (middle ? 1 : 0));
    const h = 3.0 * storeys + rng() * 0.4;
    const outer: Array<'front' | 'right' | 'back' | 'left'> = [];
    if (j === nz - 1) outer.push('front');
    if (i === nx - 1) outer.push('right');
    if (j === 0) outer.push('back');
    if (i === 0) outer.push('left');
    kershefBlock(sink, x0, z0, x1, z1, 0, h, rng() < 0.35 ? KERSHEF_OLD : MUD, rng, look, { door: j === nz - 1, faces: outer.length ? outer : ['front'] });
  }
  return sink.finish();
};

/**
 * A square mud tower over S x S tapering to its top: the Shali mosque's minaret (crenellated with rounded merlons, a
 * gallery of palm beams and slit openings near the top) or a watch tower with its door high in the wall. Kershef the
 * colour of the town (no limewash, no cap of another colour: a tall pale taper with a coloured top reads as a lighthouse).
 */
function mudTower(sink: PartSink, S: number, H: number, rng: () => number, look: () => number, minaret: boolean): void {
  const r0 = S * 0.72, r1 = S * (minaret ? 0.5 : 0.58);
  sink.cylinder(MUD, [0, -0.3, 0], 'y', H + 0.3, r0, 4, {}, r1, true, Math.PI / 4);
  const s = r1 * Math.SQRT1_2;
  // the crenellation: rounded merlons on the parapet
  for (let k = -2; k <= 2; k += 2) for (const [ax, sgn] of [['x', 1], ['x', -1], ['z', 1], ['z', -1]] as const) {
    const c = k * s / 2.5;
    if (ax === 'x') sink.cylinder(MUD, [sgn * s, H, c], 'y', 0.7, 0.24, 8, {}, 0.1);
    else sink.cylinder(MUD, [c, H, sgn * s], 'y', 0.7, 0.24, 8, {}, 0.1);
  }
  const at = (y: number) => (r0 + (r1 - r0) * y / H) * Math.SQRT1_2;
  const faces = (y: number): Face[] => {
    const a = at(y);
    return [{ origin: [0, 0, a], u: [1, 0, 0], out: [0, 0, 1], width: 2 * a }, { origin: [a, 0, 0], u: [0, 0, -1], out: [1, 0, 0], width: 2 * a },
      { origin: [0, 0, -a], u: [-1, 0, 0], out: [0, 0, -1], width: 2 * a }, { origin: [-a, 0, 0], u: [0, 0, 1], out: [-1, 0, 0], width: 2 * a }];
  };
  if (minaret) {
    // the gallery's palm beams and the slit openings under the crenellation, on all four faces
    for (const f of faces(H - 1.6)) {
      for (const u of [-0.45, 0.45]) siwaWindow(sink, f, u * f.width * 0.5, H - 2.1, 0.22, 0.75, look);
      for (let k = -2; k <= 2; k++) faceBox(sink, 'structureWood', f, k * f.width / 5.5, H - 0.75, 0.16, 0.14, 0.14, 0.32, { colour: PALM, decor: true, uv: UV_MEMBER });
    }
  } else {
    // the watch tower's door, high in its front wall, and a beam over it
    const f = faces(H * 0.35)[0];
    doorUnit(sink, f, 0, H * 0.3, 0.8, 1.6, { leaf: PALM, frame: { bucket: MUD, width: 0.2, out: 0.08 }, steps: null, leafKind: 'plank' });
    faceBox(sink, 'structureWood', f, 0, H * 0.3 + 1.75, 0.18, 1.3, 0.16, 0.36, { colour: PALM, decor: true, uv: UV_MEMBER });
    if (rng() < 0.5) for (const g of faces(H * 0.7)) siwaWindow(sink, g, 0, H * 0.68, 0.3, 0.45, look);
  }
}

/** The Shali mosque's minaret (a minaret plot): the square mud tower tapering to its crenellated top. */
const shaliMinaret: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const R = reach(ctx);
  const S = Math.max(2.6, Math.min(R.W, R.D) - 0.4);
  sink.placed(0, R.cx, 0, R.cz, () => mudTower(sink, S, Math.max(11, Math.min(15, ctx.info.h - 0.5)), ctx.rng, ctx.variant, true));
  return sink.finish();
};

/** A kershef watch tower (a tower plot): the square mud tower with its door high up. */
const siwaTower: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const R = reach(ctx);
  const S = Math.max(3.0, Math.min(R.W, R.D) - 0.4);
  sink.placed(0, R.cx, 0, R.cz, () => mudTower(sink, S, Math.max(7.5, ctx.info.h - 1.5), ctx.rng, ctx.variant, false));
  return sink.finish();
};

/**
 * A spring (a bath house plot), Siwa's Ain Juba (Cleopatra's Spring) and its like: the round pool in its rim of dressed
 * stone, clear water over the spring's pale sand, steps down; the café's low kershef wall and a palm-rib shelter on its
 * posts on the plot's long side.
 */
const ainSpring: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant;
  const R = reach(ctx);
  const r = Math.max(2.4, Math.min(R.W, R.D) / 2 - 0.35);
  const along = R.W >= R.D;
  const px = along ? R.x0 + 0.3 + r : R.cx, pz = along ? R.cz : R.z0 + 0.3 + r;
  const n = 20;
  for (let k = 0; k < n; k++) {
    const a0 = k / n * Math.PI * 2, a1 = (k + 1) / n * Math.PI * 2, am = (a0 + a1) / 2;
    sink.member('stone', [px + Math.cos(a0) * r, 0.3, pz + Math.sin(a0) * r], [px + Math.cos(a1) * r, 0.3, pz + Math.sin(a1) * r], 1.0, 0.5,
      [Math.cos(am), 0, Math.sin(am)], { exposed: true }, 0);
  }
  sink.cylinder('glass', [px, 0.22, pz], 'y', 0.02, r - 0.22, 24, { decor: true });
  for (let k = 0; k < 3; k++) sink.span('stone', px - 0.8, 0.5 - k * 0.2, pz + r - 0.5 - k * 0.35, px + 0.8, 0.62 - k * 0.2, pz + r - 0.2 - k * 0.35, { decor: true });
  // the rest of the plot: the café's low wall along the far edge and the palm-rib shelter by the pool
  const rest = along ? R.x1 - (px + r + 0.25) : R.z1 - (pz + r + 0.25);
  if (rest > 0.45) {
    if (along) sink.span(MUD, R.x1 - 0.5, -0.3, R.z0 + 0.3, R.x1 - 0.2, 0.9, R.z1 - 0.3);
    else sink.span(MUD, R.x0 + 0.3, -0.3, R.z1 - 0.5, R.x1 - 0.3, 0.9, R.z1 - 0.2);
  }
  if (rest > 3.4) {
    const sw = Math.min(5.5, rest - 0.6), sd = Math.min(4.6, (along ? R.D : R.W) - 0.6);
    if (along) sink.placed(-Math.PI / 2, R.x1 - 0.55 - sw / 2, 0, R.cz, () => stallBody(sink, look, sd, sw));
    else sink.placed(Math.PI, R.cx, 0, R.z1 - 0.55 - sw / 2, () => stallBody(sink, look, sd, sw));
  }
  void rng;
  return sink.finish();
};

/** The souk's shop row (a market row plot): palm-rib stalls side by side along the plot. */
const siwaShops: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const look = ctx.variant;
  const R = reach(ctx);
  const n = Math.max(1, Math.round(R.W / 5.2)), w = R.W / n - 0.2, d = Math.max(3.6, R.D - 0.6);
  // the back wall (0.45 m over the mat's beam) no higher than the market row it replaces: Oasis's east zone stands on an
  // apron above the row, and the objective search counts a solid reaching within half a metre of a zone's floor
  const top = Math.max(2.0, Math.min(2.55, ctx.bounds.maxY - 0.45));
  for (let k = 0; k < n; k++) sink.placed(0, R.x0 + (k + 0.5) * R.W / n, 0, R.cz, () => stallBody(sink, look, w, d, top));
  return sink.finish();
};

/** A melted house of old Shali (a ruin plot): the kershef walls slumped to rounded stubs, the roof's rubble inside. */
const shaliRuin: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant;
  const R = reach(ctx);
  const x0 = R.x0 + 0.25, x1 = R.x1 - 0.25, z0 = R.z0 + 0.25, z1 = R.z1 - 0.25, t = 0.45;
  for (const [a, b, c, d, axis] of [[x0, z0, x1, z0 + t, 'x'], [x0, z1 - t, x1, z1, 'x'], [x0, z0 + t, x0 + t, z1 - t, 'z'], [x1 - t, z0 + t, x1, z1 - t, 'z']] as const) {
    const len = axis === 'x' ? c - a : d - b, pieces = Math.max(3, Math.round(len / 1.3));
    for (let k = 0; k < pieces; k++) {
      if (rng() < 0.2) continue;
      const p0 = k / pieces, p1 = (k + 1) / pieces, top = 0.7 + rng() * 2.4;
      if (axis === 'x') sink.span(MUD, a + len * p0, -0.3, b, a + len * p1, top, d);
      else sink.span(MUD, a, -0.3, b + len * p0, c, top, b + len * p1);
      // the rain-rounded top of the stub
      const cxm = axis === 'x' ? a + len * (p0 + p1) / 2 : (a + c) / 2, czm = axis === 'x' ? (b + d) / 2 : b + len * (p0 + p1) / 2;
      sink.cylinder(MUD, [cxm, top, czm], 'y', 0.35, Math.min(len / pieces, t) * 0.6, 7, { decor: true }, 0.08);
    }
  }
  sink.cylinder(KERSHEF_OLD, [(x0 + x1) / 2, -0.2, (z0 + z1) / 2], 'y', 0.9, Math.min(x1 - x0, z1 - z0) * 0.32, 8, { decor: true }, Math.min(x1 - x0, z1 - z0) * 0.1, true, look());
  return sink.finish();
};

export const SIWA_BUILDERS: Readonly<Record<string, RegionalBuilder>> = Object.freeze({
  adobe: kershefHouse,
  caravanserai: shaliCluster,
  compound: shaliCluster,
  compoundSouk: shaliCluster,
  marketRow: siwaShops,
  minaret: shaliMinaret,
  tower: siwaTower,
  bathhouse: ainSpring,
  ruin: shaliRuin,
  // the market plot: the ksar's palm-rib stall, shared
  market: soukStall,
});

export const SIWA_STYLE: ArchitectureStyle = Object.freeze<ArchitectureStyle>({
  id: 'siwa',
  region: 'Siwa, Egypt\'s Western Desert: the kershef houses of old Shali heaped on their hill, palm-trunk beams, the tapering mud minaret, the springs in their stone rims, the souk under palm-rib mats',
  surfaces: {
    roof: { kind: 'canal', tint: [0.66, 0.6, 0.52] },
    stone: { kind: 'rubble', tint: [0.7, 0.66, 0.58] },
    // (the kershef is the render canvas, toned: the plaster photo set read as speckled grey granite on the walls, h4)
    sourced: { plaster: false, wood: true },
    tones: {
      // kershef: the salt-crusted mud's warm grey-beige; the older walls darker; limewash
      plaster: (_h, s, l) => [0.088, Math.min(1, s * 0.4 + 0.06), Math.min(1, l * 1.02 + 0.08)],
      plaster2: (_h, s, l) => [0.085, Math.min(1, s * 0.32 + 0.04), Math.min(1, l * 0.96 + 0.04)],
      plaster3: (_h, s, l) => [0.11, Math.min(1, s * 0.12), Math.min(1, l * 1.3 + 0.16)],
    },
  },
  builders: SIWA_BUILDERS,
  // a hyper-arid oasis: no moss; the salt draws a pale crust up the wall foot rather than a damp stain
  weather: {
    plaster: [[1, 1, 1], [1.05, 1.04, 1.02], [0.94, 0.92, 0.88], [0.9, 0.87, 0.82], [1.08, 1.07, 1.05]],
    stone: [[1, 1, 1], [0.95, 0.94, 0.92]],
    roof: [[1, 1, 1], [0.9, 0.87, 0.83]],
    damp: 0.12, moss: 0,
  },
  wear: 0.2,
  // the courtyards: kershef walls round each house's court, a gate (yards.ts)
  yard: { kinds: ['adobe'], fence: 'walladobe', gate: 'gate', shed: null, garden: false },
});
