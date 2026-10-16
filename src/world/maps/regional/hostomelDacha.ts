// src/world/maps/regional/hostomelDacha.ts — the dachas of Kestrel Airfield's garden cooperatives (the Hostomel kit,
// maps/regional/hostomel.ts; the maps lane's Kestrel rebuild, 2026-10-15, from the map-revival lane's round 1,
// 469c810d9). Round the Antonov airport the sadovi tovarystva of Hostomel and Bucha were laid out from the 1960s on
// six-sotok plots: a cottage of one storey in planks or rendered block on a brick plinth under a steep gable of
// asbestos-cement or painted sheet, the attic room behind a gable window to the lane, a small brick stack, the glazed
// veranda down one side (or across the back on a deep lot) under its lean-to, the garden shed at the plot's back.
import { PartSink, faceBox, pick, rgb, shade, type Face, type RegionalBucket, type Rgb } from './geometry.ts';
import { buildHouse, wallPolygon, windowRhythm, type HoleRect, type Opening, type RoofSpec } from './house.ts';
import { doorUnit, windowUnit, type WindowStyle } from './openings.ts';
import { tvAerial } from './dressing.ts';
import type { RegionalBuildContext, RegionalBuilder, YardStyle } from './types.ts';

/** The garden cooperatives' paints (board green, blue, ochre, cream, red-brown, sky blue) and the trim's white. */
const DACHA_PAINT: readonly Rgb[] = [0x4f7d4a, 0x3f6f9a, 0xc9a24a, 0xd9cfae, 0x7a3e30, 0x5a8aa0].map(rgb);
/** Their roofs: asbestos-cement sheet greys, sheet painted green, red or brown. */
const DACHA_SHEET: readonly Rgb[] = [0x9aa0a0, 0x878c8a, 0x4f7a52, 0x8a3a30, 0x6a4a3a].map(rgb);
const DACHA_TRIM = rgb(0xe3ded2), DACHA_PLANK = rgb(0x7a6048);
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

function uvOffset(ctx: RegionalBuildContext): [number, number] {
  return [ctx.rng() * 7.31, ctx.rng() * 5.17];
}

/**
 * The base geometry's measured footprint (ctx.bounds; the plot where it is empty). A kit house fills it (the
 * coordinator's rule, 2026-10-05: a kit body short of its base opens a lane the bots drive through).
 */
function footprint(ctx: RegionalBuildContext): { w: number; d: number; cx: number; cz: number } {
  const b = ctx.bounds;
  const ok = Number.isFinite(b.minX) && Number.isFinite(b.maxX) && b.maxX - b.minX > 0.5 && b.maxZ - b.minZ > 0.5;
  const x0 = ok ? b.minX : -ctx.info.w / 2, x1 = ok ? b.maxX : ctx.info.w / 2;
  const z0 = ok ? b.minZ : -ctx.info.d / 2, z1 = ok ? b.maxZ : ctx.info.d / 2;
  return { w: x1 - x0, d: z1 - z0, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2 };
}

/** The glazed veranda's panes: small lights in white frames over the boarded dado. */
const VERANDA_WINDOW: WindowStyle = { frame: DACHA_TRIM, frameWidth: 0.05, frameOut: 0.03, bars: 'cross', surround: null, sill: null, shutters: null };

/**
 * The attic room's window in the lane gable (+z): two lights in a white frame, cut through the boarded gable (the props
 * census's E2 rule: a gable light is an opening, never glass laid on the boards), a third of the way up the gable.
 */
function atticLight(face: Face, poly: Array<[number, number]>, W: number): HoleRect[] {
  if (face.out[2] < 0.5) return [];
  const base = poly[0][1], rise = Math.max(...poly.map(([, y]) => y)) - base;
  if (rise < 1.6) return [];
  const gh = clamp(rise * 0.34, 0.7, 1.1), gw = clamp(W * 0.17, 0.7, 1.0), y0 = base + rise * 0.36 - gh / 2;
  return [{ u0: -gw / 2, u1: gw / 2, y0, y1: y0 + gh }];
}

/**
 * The dacha: a cottage of one storey in planks or rendered block on a brick plinth under a steep gable of
 * asbestos-cement or painted sheet, the attic room behind its gable light to the lane, a small brick stack, and the
 * glazed veranda down one side (or across the back on a deep lot) under its lean-to — boarded to the sill in the house's
 * paint, small panes above, its door and steps. House and veranda fill the base's footprint; the house's gable faces the
 * lot's +z (the lane).
 */
export const dacha: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant;
  const fp = footprint(ctx);
  const paint = pick(rng, DACHA_PAINT), livery = pick(rng, DACHA_SHEET);
  const wall: RegionalBucket = rng() < 0.35 ? 'plaster' : 'wood';
  const sheet = rng() < 0.55;
  // the veranda down one side on a wide lot, across the back on a deep one
  const sideways = fp.w >= fp.d * 0.8;
  const side = rng() < 0.5 ? 1 : -1;
  const vD = sideways ? clamp(fp.w * 0.3, 1.8, 2.8) : clamp(fp.d * 0.26, 1.8, 2.6);
  const W = Math.max(3.6, sideways ? fp.w - vD : fp.w), D = Math.max(4.4, sideways ? fp.d : fp.d - vD);
  const bx = sideways ? fp.cx - side * vD / 2 : fp.cx, bz = sideways ? fp.cz : fp.cz + vD / 2;
  const pitch = 40 + rng() * 8, wallH = 2.4 + rng() * 0.25, plinth = 0.45;
  const win: WindowStyle = {
    frame: rng() < 0.6 ? DACHA_TRIM : paint, frameWidth: 0.06, frameOut: 0.04, bars: rng() < 0.6 ? 'cross' : 'two',
    surround: wall === 'wood' ? { bucket: 'structureWood', width: 0.1, out: 0.03, lintel: 0.16, colour: rng() < 0.6 ? DACHA_TRIM : paint } : null,
    sill: { bucket: 'structureWood', out: 0.06, colour: DACHA_TRIM }, shutters: null,
  };
  // the side the veranda does not cover keeps its windows; the lane gable two (or one and the door, with the veranda behind)
  const free: 'left' | 'right' = side > 0 ? 'left' : 'right';
  const openings: Opening[] = sideways
    ? [...windowRhythm('front', 0, W - 0.1, { w: 0.9, h: 1.2, sill: 0.85, spacing: 1.6, margin: 0.7, max: 2 }),
      ...windowRhythm(free, 0, D - 0.1, { w: 0.9, h: 1.2, sill: 0.85, spacing: 2.4, margin: 1.1, max: 2 }),
      ...windowRhythm('back', 0, W - 0.1, { w: 0.8, h: 1.1, sill: 0.95, spacing: 1.6, margin: 1.0, max: 1 })]
    : [{ face: 'front', storey: 0, kind: 'door', u: -(W - 0.1) * 0.22, w: 0.85, y0: 0, h: 1.95 },
      { face: 'front', storey: 0, kind: 'window', u: (W - 0.1) * 0.2, w: 0.9, y0: 0.85, h: 1.2 },
      ...windowRhythm('left', 0, D - 0.1, { w: 0.9, h: 1.2, sill: 0.85, spacing: 2.4, margin: 1.0, max: 2 }),
      ...windowRhythm('right', 0, D - 0.1, { w: 0.9, h: 1.2, sill: 0.85, spacing: 2.4, margin: 1.0, max: 2 })];
  const roof: RoofSpec = { kind: 'gable', pitchDeg: pitch, eave: 0.35, verge: 0.32, thickness: sheet ? 0.06 : 0.1, bucket: sheet ? 'structureMetal' : 'roof', ridge: 'saddle' };
  const attic: WindowStyle = { frame: DACHA_TRIM, frameWidth: 0.06, frameOut: 0.03, bars: 'two', surround: { bucket: 'structureWood', width: 0.08, out: 0.03, colour: DACHA_TRIM }, sill: null, shutters: null };
  sink.placed(0, bx, 0, bz, () => {
    const frame = buildHouse(sink, {
      w: W - 0.1, d: D - 0.1, plinth: { h: plinth, out: 0.05, bucket: 'stone' }, storeys: [{ h: wallH, wall }],
      roof, roofColour: sheet ? livery : undefined, gableBucket: 'wood', openings,
      chimneys: [{ x: -side * (W - 0.1) * 0.18, z: -(D - 0.1) * 0.2, sx: 0.42, sz: 0.52, above: 0.6, bucket: 'stone', cap: 'slab' }],
      gutters: null, verge: { colour: rng() < 0.5 ? DACHA_TRIM : paint, bucket: 'structureWood' }, reveal: 0.1,
      spall: wall === 'plaster' ? undefined : null,
    }, {
      window: (s, face, o, y0) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, win, rng, 0.4),
      door: (s, face, o, y0, fr) => doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, {
        leaf: rng() < 0.5 ? paint : DACHA_PLANK, frame: { bucket: 'structureWood', width: 0.09, out: 0.04, colour: DACHA_TRIM },
        steps: { bucket: 'stone' }, leafKind: 'plank',
      }, fr.floors[o.storey] + o.y0),
      gableOpenings: (face, poly) => atticLight(face, poly, W),
    });
    // the attic light's unit, set back in its cut
    const gf = frame.faces.front;
    if (frame.roof.gable) {
      const [hole] = atticLight(gf, frame.roof.gable.map(([u, y]): [number, number] => [u, y]), W);
      if (hole) {
        sink.recess = frame.gableReveal;
        try {
          windowUnit(sink, gf, 0, hole.y0, hole.u1 - hole.u0, hole.y1 - hole.y0, attic, rng, 0.3);
        } finally { sink.recess = 0; }
      }
    }
    // the house's paint on the corner boards and the gable's apron board
    if (wall === 'wood') {
      for (const fx of [-1, 1]) for (const face of [gf, frame.faces.back]) {
        faceBox(sink, 'structureWood', face, fx * ((W - 0.1) / 2 - 0.06), plinth + wallH / 2, 0.03, 0.12, wallH, 0.05, { colour: paint, decor: true, fine: true });
      }
      faceBox(sink, 'structureWood', gf, 0, frame.eaveY + 0.06, 0.04, W - 0.1, 0.14, 0.05, { colour: paint, decor: true });
    }
    if (look() < 0.5) tvAerial(sink, frame, (look() - 0.5) * D * 0.4, look);
  });
  // the veranda: a body of its own under a lean-to rising to the house wall (its local +x out from the house)
  const vH = 2.2, vPlinth = 0.4;
  const vRoof: RoofSpec = { kind: 'shed', pitchDeg: 12, eave: 0.25, verge: 0.2, thickness: sheet ? 0.06 : 0.1, bucket: sheet ? 'structureMetal' : 'roof', ridge: null };
  const vLen = sideways ? D : W;
  const vOpen: Opening[] = [
    { face: 'front', storey: 0, kind: 'door', u: sideways ? 0 : (side > 0 ? -1 : 1) * (vD / 2 - 0.6), w: 0.82, y0: 0, h: 1.95 },
    ...windowRhythm('right', 0, vLen - 0.06, { w: 0.62, h: 0.95, sill: 1.0, spacing: 0.72, margin: 0.3 }),
    ...windowRhythm('back', 0, vD - 0.06, { w: 0.62, h: 0.95, sill: 1.0, spacing: 0.72, margin: 0.3, max: 2 }),
  ];
  // sideways: the veranda's local frame is the house's turned by 0 (side +1) or π (side -1), its +x away from the house;
  // across the back: turned a quarter so its +x runs out to the lot's -z
  const vyaw = sideways ? (side > 0 ? 0 : Math.PI) : -Math.PI / 2;
  const vx = sideways ? fp.cx + side * (fp.w / 2 - vD / 2) : fp.cx, vz = sideways ? fp.cz : fp.cz - fp.d / 2 + vD / 2;
  sink.placed(vyaw, vx, 0, vz, () => {
    const vf = buildHouse(sink, {
      w: vD - 0.06, d: vLen - 0.06, plinth: { h: vPlinth, out: 0.03, bucket: 'stone' }, storeys: [{ h: vH, wall: 'wood' }],
      roof: vRoof, roofColour: sheet ? livery : undefined, openings: vOpen, chimneys: [], gutters: null, verge: null, reveal: 0.05, spall: null,
    }, {
      window: (s, face, o, y0) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, VERANDA_WINDOW, rng, 0.35),
      door: (s, face, o, y0, fr) => doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, {
        leaf: paint, frame: { bucket: 'structureWood', width: 0.08, out: 0.03, colour: DACHA_TRIM }, steps: { bucket: 'stone' }, leafKind: 'panel',
      }, fr.floors[o.storey] + o.y0),
    });
    // the boarded dado in the house's paint along the open sides, a rail at the sill
    const L = vLen - 0.06, w = vD - 0.06;
    const outer: Face = { origin: [w / 2, 0, 0], u: [0, 0, -1], out: [1, 0, 0], width: L };
    faceBox(sink, 'structureWood', outer, 0, vPlinth + 0.5, 0.03, L - 0.04, 0.95, 0.04, { colour: paint, decor: true });
    faceBox(sink, 'structureWood', outer, 0, vPlinth + 0.98, 0.06, L, 0.07, 0.08, { colour: DACHA_TRIM, decor: true }, 'ends');
    // the lean-to leaves two triangles open over its ends: boarded
    const rise = w * Math.tan(12 * Math.PI / 180);
    const front: Face = { origin: [0, 0, L / 2], u: [1, 0, 0], out: [0, 0, 1], width: w };
    const back: Face = { origin: [0, 0, -L / 2], u: [-1, 0, 0], out: [0, 0, -1], width: w };
    wallPolygon(sink, 'wood', front, [[-w / 2, vf.eaveY], [w / 2, vf.eaveY], [-w / 2, vf.eaveY + rise]], 0.12);
    wallPolygon(sink, 'wood', back, [[-w / 2, vf.eaveY], [w / 2, vf.eaveY], [w / 2, vf.eaveY + rise]], 0.12);
  });
  return sink.finish();
};

/**
 * The garden shed at the plot's back (the yards' outbuilding): planks or old sheet on a timber frame under a lean-to
 * of asbestos sheet, a plank door; it fills its plot.
 */
export const gardenShed: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const fp = footprint(ctx);
  const W = Math.max(1.8, fp.w - 0.06), D = Math.max(1.6, fp.d - 0.06), h = 2.0 + rng() * 0.25;
  const sheetWall = rng() < 0.3, livery = pick(rng, DACHA_SHEET);
  const roof: RoofSpec = { kind: 'shed', pitchDeg: 10, eave: 0.2, verge: 0.15, thickness: 0.06, bucket: 'structureMetal', ridge: null };
  sink.placed(0, fp.cx, 0, fp.cz, () => {
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: null, storeys: [{ h, wall: 'wood' }], roof, roofColour: livery,
      openings: [{ face: 'front', storey: 0, kind: 'door', u: (rng() - 0.5) * Math.max(0, W - 1.2), w: 0.8, y0: 0, h: 1.8 }],
      chimneys: [], gutters: null, verge: null, reveal: 0.04, spall: null,
    }, {
      window: () => { /* none */ },
      door: (s, face, o, y0, fr) => doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, {
        leaf: DACHA_PLANK, frame: { bucket: 'structureWood', width: 0.06, out: 0.03, colour: shade(DACHA_PLANK, 0.85) }, steps: null, leafKind: 'plank',
      }, fr.floors[o.storey] + o.y0),
    });
    const rise = W * Math.tan(10 * Math.PI / 180);
    const front: Face = { origin: [0, 0, D / 2], u: [1, 0, 0], out: [0, 0, 1], width: W };
    const back: Face = { origin: [0, 0, -D / 2], u: [-1, 0, 0], out: [0, 0, -1], width: W };
    // (the boards' top edge 3 cm under the roof's underside at the high end: never a face lying on the roof slab's)
    wallPolygon(sink, 'wood', front, [[-W / 2, frame.eaveY], [W / 2, frame.eaveY], [-W / 2, frame.eaveY + rise - 0.03]], 0.1);
    wallPolygon(sink, 'wood', back, [[-W / 2, frame.eaveY], [W / 2, frame.eaveY], [W / 2, frame.eaveY + rise - 0.03]], 0.1);
    // the lean-to's high side boarded up to the roof (the walls stop at the eave; the slab rises from +x to -x)
    const high: Face = { origin: [-W / 2, 0, 0], u: [0, 0, 1], out: [-1, 0, 0], width: D };
    wallPolygon(sink, 'wood', high, [[-D / 2, frame.eaveY], [D / 2, frame.eaveY], [D / 2, frame.eaveY + rise - 0.03], [-D / 2, frame.eaveY + rise - 0.03]], 0.1);
    // an old sheet patched over one side
    if (sheetWall) {
      const sf: Face = { origin: [W / 2, 0, 0], u: [0, 0, -1], out: [1, 0, 0], width: D };
      faceBox(sink, 'structureMetal', sf, 0, h * 0.45, 0.03, D * 0.8, h * 0.8, 0.03, { colour: shade(livery, 0.85), decor: true });
    }
  });
  return sink.finish();
};

/** The dachas' garden plots (yards.ts): a picket fence round the yard and its picket wicket (the fence family's gate, gateKit), the garden shed at its back, the beds. */
export const DACHA_YARD: YardStyle = { kinds: ['cottage'], fence: 'fencepicket', gate: 'gatepicket', shed: 'woodshed', shedSize: [2.6, 2.2], garden: true };
