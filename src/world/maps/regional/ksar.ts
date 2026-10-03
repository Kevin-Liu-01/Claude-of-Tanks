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
  const look = ctx.variant;
  const W = Math.max(4.5, Math.min(6.4, ctx.info.w - 0.4)), D = Math.max(3.6, Math.min(5.0, ctx.info.d - 0.4));
  const floor = 0.18, top = 2.55, wallZ = -D / 2 + 0.4;
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
    sink.span('structureWood', -W / 2 - 0.2 + look() * 0.15, top + 0.31, z - 0.07, W / 2 + 0.2 - look() * 0.15, top + 0.35, z + 0.07, { colour: c, decor: true });
  }
  // the frond tips hanging ragged over the lane edge, leaning out, some missing
  for (let x = -W / 2 - 0.1; x < W / 2 + 0.1; x += 0.16 + look() * 0.16) {
    if (look() < 0.2) continue;
    const len = 0.2 + look() * 0.4, tone = look();
    sink.member('structureWood', [x, top + 0.33, postZ + 0.3], [x + (look() - 0.5) * 0.16, top + 0.33 - len, postZ + 0.36 + look() * 0.12],
      0.06 + look() * 0.07, 0.02, [0, 0, 1], { colour: [0.5 + tone * 0.14, 0.43 + tone * 0.12, 0.31 + tone * 0.08], decor: true, exposed: true });
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
  return sink.finish();
};

export const KSAR_BUILDERS: Readonly<Record<string, RegionalBuilder>> = Object.freeze({
  adobe: house,
  caravanserai: ghorfaRange,
  compound: ghorfaRange,
  compoundSouk: ghorfaRange,
  // the market row: a range of vaulted shop cells
  marketRow: ghorfaRange,
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
});
