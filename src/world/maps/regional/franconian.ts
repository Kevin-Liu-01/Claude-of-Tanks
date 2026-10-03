// src/world/maps/regional/franconian.ts — the Franconian town kit (Steinburg: the walled hill towns of Franconia and
// Saxony — Kronach, Meissen, Pappenheim). Three- and four-storey town houses close along the streets: a ground storey
// of sandstone ashlar or render with an arched door or a shop window, framed upper storeys jettied over the street or a
// rendered front in ochre, cream, rose or pale green with sandstone dressings; steep plain-tile roofs, gable-fronted to
// the street or eaves-fronted with dormers, a hoist gable for the loft. The framing and openings are the Fachwerk kit's
// (hessian.ts) under a Franconian palette; the rows replace the street rows and the block-fill row houses.
import { PartSink, faceBox, rgb, type RegionalBucket, type RegionalParts } from './geometry.ts';
import { buildHouse, emitRoof, roofGeometry, windowRhythm, type HouseSpec, type Opening, type RoofSpec } from './house.ts';
import { windowUnit } from './openings.ts';
import {
  bindFachwerk, hessianDialect, houseUvOffset, roofFor, stateFor, withPalette, type FachwerkPalette,
} from './hessian.ts';
import type { ArchitectureStyle, RegionalBuildContext, RegionalBuilder } from './types.ts';

export const FRANCONIAN_PALETTE: FachwerkPalette = Object.freeze({
  // Franconian framing runs to oxblood and deep brown, the doors to green and red
  timbers: [0x7c3527, 0x6a2c22, 0x5c4434, 0x8c4c32].map(rgb),
  frame: rgb(0xcfcabd),
  doors: [0x426b49, 0x7a3024, 0x6a4b33, 0x4f6274].map(rgb),
  shutters: [0x4a7451, 0x7a3a2a, 0x667a86].map(rgb),
  shutterShare: 0.4, hungGable: 0.08, stoneGround: 0.7, halfHip: 0.15,
  // the upper storeys' casements two-light, a single mullion (the town's 160 houses carry ~3,000 windows)
  upperBars: 'two',
});

/** The town house: a street front three or four storeys high, framed or rendered, gable- or eaves-fronted. */
const townHouse: RegionalBuilder = (ctx) => {
  const sink = new PartSink(houseUvOffset(ctx));
  const st = stateFor(ctx, ctx.rng);
  const rng = st.rng;
  const W = Math.max(6.4, ctx.info.w - 0.25), D = Math.max(7.6, ctx.info.d - 0.25);
  const gableFront = rng() < 0.55;
  const framed = rng() < 0.55;
  const count = rng() < 0.35 ? 4 : 3;
  // the street front is +z; an eaves-fronted house is built along x and turned so its long side faces the street
  const bw = gableFront ? W : D, bd = gableFront ? D : W;
  const streetFace = gableFront ? 'front' : 'left';
  const render: RegionalBucket = ctx.wallBucket === 'stone' ? 'plaster' : ctx.wallBucket as RegionalBucket;
  const sts: HouseSpec['storeys'] = [];
  for (let i = 0; i < count; i++) {
    const ground = i === 0;
    sts.push({
      h: ground ? 3.1 + rng() * 0.3 : 2.75 + rng() * 0.2,
      wall: ground ? (rng() < 0.6 ? 'stone' : render) : framed ? st.infill : render,
      framed: !ground && framed,
      // framed storeys oversail the street
      jetty: !ground && framed ? (gableFront ? [0.22, 0, 0, 0] : [0, 0, 0, 0.22]) : undefined,
    });
  }
  const openings: Opening[] = [];
  const streetWidth = gableFront ? bw : bd;
  const shop = rng() < 0.45;
  openings.push({ face: streetFace, storey: 0, kind: 'door', u: shop ? -streetWidth * 0.3 : (rng() - 0.5) * streetWidth * 0.4, w: 1.15, y0: 0, h: 2.45 });
  if (shop) openings.push({ face: streetFace, storey: 0, kind: 'shopfront', u: streetWidth * 0.14, w: Math.min(3.2, streetWidth * 0.45), y0: 0, h: 2.7 });
  sts.forEach((_, i) => {
    for (const face of ['front', 'right', 'back', 'left'] as const) {
      const width = face === 'front' || face === 'back' ? bw : bd;
      const avoid: Array<[number, number]> = openings.filter((o) => o.face === face && o.storey === i).map((o) => [o.u - o.w / 2, o.u + o.w / 2]);
      const street = face === streetFace;
      if (!street && (face === 'right' || face === 'left') && gableFront) continue; // party walls in the row
      if (!street && !gableFront && (face === 'front' || face === 'back')) continue;
      for (const o of windowRhythm(face, i, width, { w: 0.85, h: i === 0 ? 1.3 : 1.25, sill: i === 0 ? 1.0 : 0.8, spacing: street ? 1.55 : 2.2, margin: 0.75, avoid })) openings.push(o);
    }
  });
  const roof: RoofSpec = { ...roofFor(rng, { halfHip: 0.12, pitch: [50, 58] }), eave: 0.32, verge: 0.18 };
  const build = () => {
    const frame = buildHouse(sink, {
      w: bw, d: bd, plinth: { h: 0.3, out: 0.05, bucket: 'stone' }, storeys: sts, roof,
      gableFramed: framed, gableBucket: framed ? st.infill : render, openings,
      chimneys: [{ x: (rng() - 0.5) * bw * 0.3, z: (rng() - 0.5) * bd * 0.4, sx: 0.55, sz: 0.6, above: 0.8, bucket: 'stone', cap: 'slab' }],
      gutters: { colour: rgb(0x8c9193) }, verge: framed ? { colour: st.timber, bucket: 'structureWood' } : null,
    }, hessianDialect(st));
    // rendered fronts: sandstone quoins and a cornice
    if (!framed) {
      const b = frame.bodies[0];
      for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]] as const) {
        const x = sx > 0 ? b.x1 : b.x0, z = sz > 0 ? b.z1 : b.z0;
        for (let y = 0.4, k = 0; y < frame.eaveY - 0.3; y += 0.42, k++) {
          const lx = k % 2 ? 0.32 : 0.56, lz = k % 2 ? 0.56 : 0.32;
          sink.span('stone', sx > 0 ? x - lx : x - 0.035, y, sz > 0 ? z - lz : z - 0.035, sx > 0 ? x + 0.035 : x + lx, y + 0.4, sz > 0 ? z + 0.035 : z + lz, { decor: true });
        }
      }
    }
    // a hoist dormer for the loft in the street roof of eaves-fronted houses, or a loft door in the street gable
    const rg = frame.roof;
    if (!gableFront) {
      const ex = -rg.s, y = frame.eaveY;
      const dw = 1.6, dz = (rng() - 0.5) * bd * 0.3;
      sink.span(render, ex - 0.05, y - 0.4, dz - dw / 2, ex + 1.2, y + 1.6, dz + dw / 2);
      const cap: RoofSpec = { kind: 'gable', pitchDeg: 48, eave: 0.12, verge: 0.12, thickness: 0.12, bucket: 'roof', ridge: 'round' };
      sink.placed(Math.PI / 2, ex + 0.55, 0, dz, () => emitRoof(sink, roofGeometry(dw + 0.1, 1.4, y + 1.6, cap), cap));
      windowUnit(sink, { origin: [ex - 0.05, 0, dz], u: [0, 0, 1], out: [-1, 0, 0], width: dw }, 0, y + 0.2, 0.8, 1.05, { ...st.window, shutters: null }, rng, 0.2);
    } else if (rg.gable) {
      const f = frame.faces.front;
      faceBox(sink, 'structureWood', f, 0, frame.eaveY + 1.6, 0.03, 0.9, 1.2, 0.05, { colour: st.timber, decor: true });
      faceBox(sink, 'structureWood', f, 0, frame.eaveY + 2.5, 0.5, 0.14, 0.14, 1.0, { colour: st.timber, decor: true });
    }
  };
  if (gableFront) build();
  else sink.placed(Math.PI / 2, 0, 0, 0, build);
  return sink.finish();
};

export const FRANCONIAN_BUILDERS: Readonly<Record<string, RegionalBuilder>> = Object.freeze({
  rowhouse: withPalette(FRANCONIAN_PALETTE, townHouse),
  ...bindFachwerk(FRANCONIAN_PALETTE, ['tavern', 'schoolhouse', 'cornershop', 'ruin', 'church', 'depot', 'cottage', 'farmhouse', 'barn']),
});

export const FRANCONIAN_STYLE: ArchitectureStyle = Object.freeze<ArchitectureStyle>({
  id: 'franconian',
  region: 'Upper Franconia and Saxony (Kronach, Meissen): walled hill towns of framed and rendered town houses under plain tiles',
  surfaces: {
    // w2/w3 captures: the first tints made the old town a sea of new orange tile (roof pixels at saturation 0.53 in the
    // establishing view, the base town's dark sheets 0.37); old plain tiles weather to a duller brown-red
    roof: { kind: 'beavertail', tint: [0.42, 0.28, 0.22] },
    stone: { kind: 'sandstone', tint: [0.64, 0.52, 0.42] },
    sourced: { plaster: true, wood: true },
  },
  builders: FRANCONIAN_BUILDERS,
  // render in cream, ochre and pale pink; roofs from a few fresher red ones through brown to the grey-brown and dark
  // patina of old tiles (the cooler multipliers take the red out as well as the light)
  weather: {
    plaster: [[1, 1, 1], [1, 0.95, 0.86], [1, 0.92, 0.88], [0.97, 0.96, 0.92], [1, 0.9, 0.8]],
    stone: [[1, 1, 1], [0.92, 0.9, 0.88], [1.04, 0.98, 0.94]],
    roof: [[1.06, 0.96, 0.92], [1, 1, 1], [0.9, 0.88, 0.88], [0.78, 0.86, 0.92], [0.7, 0.78, 0.86], [0.82, 0.92, 1.0]],
    damp: 0.8, moss: 0.5,
  },
  wear: 0.25,
  // the yards of the outlying farms: sandstone walls round a kitchen garden, a gate (yards.ts)
  yard: { kinds: ['cottage', 'farmhouse'], fence: 'wallstone', gate: 'gate', shed: null, garden: true },
});

export type { RegionalParts, RegionalBuildContext };
