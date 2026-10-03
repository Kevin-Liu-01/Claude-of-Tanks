// src/world/maps/regional/eifel.ts — the Eifel kit (Highland Reservoir: the Rur and Urft dams in the northern Eifel,
// Rurberg, Einruhr, the Monschau country). Black-and-white Fachwerk on ground storeys of grey-brown greywacke rubble,
// weather gables hung with dark Moselle slate, steep slate roofs, green shutters; the dam company's Wilhelminian
// buildings of quarry stone with rendered dressings under hipped slate with a ridge lantern; stone halls with arched
// cart doors. The Fachwerk builders are the Hessian kit's (hessian.ts) under the Eifel palette.
import { PartSink, faceBox, rgb, type Face, type RegionalParts } from './geometry.ts';
import { buildHouse, windowRhythm, type HouseDialect, type Opening } from './house.ts';
import { doorUnit, gateUnit, windowUnit, type WindowStyle } from './openings.ts';
import { bindFachwerk, type FachwerkPalette } from './hessian.ts';
import type { ArchitectureStyle, RegionalBuildContext, RegionalBuilder } from './types.ts';

export const EIFEL_PALETTE: FachwerkPalette = Object.freeze({
  // Monschau framing is near black over white infill; some houses tar their timbers brown
  timbers: [0x3e352f, 0x463b33, 0x352e29, 0x55473b].map(rgb),
  frame: rgb(0xd2cec4),
  doors: [0x3f5f4a, 0x5a3a2a, 0x3e4e5a].map(rgb),
  shutters: [0x3f6a4c, 0x4b5f52].map(rgb),
  shutterShare: 0.45, hungGable: 0.55, stoneGround: 0.5, halfHip: 0.25,
});

const DRESSING = 'plaster3' as const;

function uvOffset(ctx: RegionalBuildContext): [number, number] {
  return [ctx.rng() * 7.31, ctx.rng() * 5.17];
}

const WINDOW: WindowStyle = {
  frame: rgb(0xd2cec4), frameWidth: 0.07, frameOut: 0.05, bars: 'six',
  surround: { bucket: DRESSING, width: 0.2, out: 0.07, lintel: 0.28 }, sill: { bucket: DRESSING, out: 0.12 }, shutters: null,
};

function companyDialect(rng: () => number): HouseDialect {
  return {
    window: (sink, face, o, y0) => windowUnit(sink, face, o.u, y0 + o.y0, o.w, o.h, o.kind === 'loft' ? { ...WINDOW, bars: 'cross' } : WINDOW, rng, 0.35),
    door: (sink, face, o, y0) => {
      if (o.kind === 'gate') {
        gateUnit(sink, face, o.u, y0 + o.y0, o.w, o.h, rgb(0x4a5a50), { bucket: DRESSING, width: 0.34, out: 0.1 });
        return;
      }
      doorUnit(sink, face, o.u, y0 + o.y0, o.w, o.h, { leaf: rgb(0x4a3a2c), frame: { bucket: DRESSING, width: 0.26, out: 0.09, arch: true },
        transom: true, steps: { bucket: 'stone' }, leafKind: 'panel' }, y0 + o.y0);
    },
  };
}

/** The dam company's office: two storeys of quarry stone, rendered dressings, a hipped slate roof and a ridge lantern. */
const companyOffice: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const W = Math.max(10, Math.min(13, ctx.info.w - 0.6)), D = Math.max(11, Math.min(14, ctx.info.d - 0.6));
  const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'door', u: 0, w: 1.5, y0: 0, h: 2.8 }];
  for (const i of [0, 1]) for (const face of ['front', 'right', 'back', 'left'] as const) {
    const width = face === 'front' || face === 'back' ? W : D;
    const avoid: Array<[number, number]> = face === 'front' && i === 0 ? [[-1.2, 1.2]] : [];
    for (const o of windowRhythm(face, i, width, { w: 1.05, h: i ? 1.6 : 1.8, sill: 0.95, spacing: 2.3, margin: 1.2, avoid })) openings.push(o);
  }
  const frame = buildHouse(sink, {
    w: W, d: D, plinth: { h: 0.6, out: 0.08, bucket: 'stone' }, storeys: [{ h: 3.6, wall: 'stone' }, { h: 3.3, wall: 'stone' }],
    roof: { kind: 'hip', pitchDeg: 38, eave: 0.55, verge: 0.55, thickness: 0.14, bucket: 'roof', ridge: 'saddle' }, gableBucket: 'stone',
    openings, chimneys: [{ x: W * 0.25, z: -D * 0.2, sx: 0.6, sz: 0.6, above: 1.0, bucket: 'stone', cap: 'slab' }], gutters: { colour: rgb(0x8c9193) }, verge: null,
  }, companyDialect(ctx.rng));
  // rendered quoins and a string course between the storeys
  const b = frame.bodies[0];
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    const x = sx > 0 ? b.x1 : b.x0, z = sz > 0 ? b.z1 : b.z0;
    for (let y = 0.7, k = 0; y < frame.eaveY - 0.3; y += 0.45, k++) {
      const lx = k % 2 ? 0.36 : 0.62, lz = k % 2 ? 0.62 : 0.36;
      sink.span(DRESSING, sx > 0 ? x - lx : x - 0.04, y, sz > 0 ? z - lz : z - 0.04, sx > 0 ? x + 0.04 : x + lx, y + 0.42, sz > 0 ? z + 0.04 : z + lz, { decor: true });
    }
  }
  sink.span(DRESSING, b.x0 - 0.06, frame.floors[1] - 0.1, b.z0 - 0.06, b.x1 + 0.06, frame.floors[1] + 0.12, b.z1 + 0.06, { decor: true });
  // the ridge lantern: a small slate-capped vent turret
  const top = frame.roof.ridgeTopY;
  sink.span('plaster', -0.6, top - 0.5, -0.6, 0.6, top + 1.1, 0.6);
  sink.cylinder('roof', [0, top + 1.1, 0], 'y', 1.6, 0.95, 4, {}, 0.03, true, Math.PI / 4);
  return sink.finish();
};

/** A stone hall: one tall storey of quarry stone under slate, arched cart doors, high windows (warehouses). */
const stoneHall: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const W = Math.max(9, Math.min(16, ctx.info.w - 0.6)), D = Math.max(14, Math.min(26, ctx.info.d - 0.6));
  const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'gate', u: 0, w: 3.6, y0: 0, h: 3.8 }, { face: 'back', storey: 0, kind: 'gate', u: 0, w: 3.0, y0: 0, h: 3.4 }];
  for (const face of ['left', 'right'] as const) for (const o of windowRhythm(face, 0, D, { w: 1.3, h: 1.6, sill: 3.0, spacing: 3.2, margin: 1.6 })) openings.push(o);
  const frame = buildHouse(sink, {
    w: W, d: D, plinth: { h: 0.4, out: 0.06, bucket: 'stone' }, storeys: [{ h: 5.6, wall: 'stone' }],
    roof: { kind: 'gable', pitchDeg: 36, eave: 0.45, verge: 0.3, thickness: 0.14, bucket: 'roof', ridge: 'saddle' }, gableBucket: 'stone',
    openings, chimneys: [], gutters: { colour: rgb(0x8c9193) }, verge: null,
  }, companyDialect(ctx.rng));
  // the arch over the cart door, read as a rendered voussoir ring
  const f: Face = frame.faces.front;
  for (let k = 0; k <= 8; k++) {
    const a = Math.PI * k / 8;
    faceBox(sink, DRESSING, f, Math.cos(a) * 2.0, 0.4 + 3.8 + Math.sin(a) * 0.6, 0.06, 0.4, 0.34, 0.12, { decor: true });
  }
  return sink.finish();
};

export const EIFEL_BUILDERS: Readonly<Record<string, RegionalBuilder>> = Object.freeze({
  ...bindFachwerk(EIFEL_PALETTE, ['cottage', 'tavern', 'farmhouse', 'barn', 'granary', 'woodshed', 'depot', 'ruin', 'church', 'chapel', 'rangerlodge']),
  foundryoffice: companyOffice,
  warehouse: stoneHall,
});

export const EIFEL_STYLE: ArchitectureStyle = Object.freeze<ArchitectureStyle>({
  id: 'eifel',
  region: 'Northern Eifel (Rur and Urft dams, Monschau country): black-and-white Fachwerk on greywacke under Moselle slate',
  surfaces: {
    roof: { kind: 'slate', tint: [0.27, 0.29, 0.32] },
    stone: { kind: 'greywacke', tint: [0.47, 0.45, 0.42] },
    sourced: { plaster: true, wood: true },
  },
  builders: EIFEL_BUILDERS,
  // the yards: a plank fence round the kitchen garden and the woodshed, a gate (yards.ts)
  yard: { kinds: ['cottage', 'farmhouse'], fence: 'fenceplank', gate: 'gate', shed: 'woodshed', shedSize: [4.2, 5.1], garden: true },
});

export type { RegionalParts };
