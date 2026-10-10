// src/world/maps/regional/ruhr.ts — the coalfield railway kit (Cinder Junction: a junction on the Ruhr / Upper Silesian
// coalfield). Soot-darkened red brick with bands of yellow brick, segmental-arched windows, slate roofs: the station
// building with its gabled central block, low wings and a platform canopy on cast columns; long goods sheds with a
// loading dock under a deep canopy; the brick water tower carrying its tank house; colliery cottages in pairs with
// two doors and a dormer each; a shelled brick shell.
import { PartSink, alongPlot, plotAxes, rgb, shade, type Face, type RegionalParts, type Rgb } from './geometry.ts';
import { buildHouse, emitRoof, roofGeometry, windowRhythm, type HouseDialect, type HouseFrame, type Opening, type RoofSpec } from './house.ts';
import { doorUnit, gateUnit, windowUnit, type WindowStyle } from './openings.ts';
import { dentilCornice, facadeOn, faceSlab, pilaster, trimRing } from './facade.ts';
import type { ArchitectureStyle, RegionalBuildContext, RegionalBuilder } from './types.ts';
import { factoryStack } from './shared.ts';

const YELLOW_BRICK = 'plaster2' as const; // the bands and dressings: the map's second render family
const FRAME = rgb(0xc8c2b4), DOOR: readonly Rgb[] = [0x3e5a46, 0x6a2c22, 0x3e4e5a].map(rgb);
const IRON = rgb(0x3a4246);

function uvOffset(ctx: RegionalBuildContext): [number, number] {
  return [ctx.rng() * 7.31, ctx.rng() * 5.17];
}

const WINDOW: WindowStyle = { frame: FRAME, frameWidth: 0.07, frameOut: 0.05, bars: 'six', surround: { bucket: YELLOW_BRICK, width: 0.14, out: 0.05, lintel: 0.26 }, sill: { bucket: 'stone', out: 0.1 }, shutters: null,
  // (facade craft, desktop: the segmental arch of yellow brick the flat lintel stood in for, a keystone at its crown)
  head: { kind: 'segment', bucket: YELLOW_BRICK, h: 0.15, out: 0.05, ext: 0, rise: 0.12 } };

/**
 * A coalfield building's brick masonry (facade craft, desktop): a corbelled dentil cornice under the eaves of the
 * `eaves` faces, returned round the corners; brick piers at the corners and between the bays of the `piers` faces;
 * a round vent in a yellow-brick ring high in each gable.
 */
function brickMasonry(frame: HouseFrame, sink: PartSink, eaves: readonly ('left' | 'right' | 'front' | 'back')[],
  piers: readonly ('left' | 'right' | 'front' | 'back')[], vents: boolean): void {
  const base = frame.floors[0], top = frame.eaveY;
  for (const name of eaves) {
    const face = frame.faces[name], half = face.width / 2;
    dentilCornice(sink, 'stone', face, -half, half, top - 0.31, { ret: 0.35 });
  }
  for (const name of piers) {
    const face = frame.faces[name], half = face.width / 2;
    const us = frame.spec.openings.filter((o) => o.face === name && o.storey === 0).map((o) => o.u).sort((a, b) => a - b);
    const at = [-half + 0.25, half - 0.25];
    for (let k = 0; k + 1 < us.length; k++) if (us[k + 1] - us[k] > 2.2) at.push((us[k] + us[k + 1]) / 2);
    for (const u of at) pilaster(sink, 'stone', face, u, base, top - (eaves.includes(name) ? 0.31 : 0.05), 0.48, 0.07);
  }
  if (vents && frame.roof.gable) {
    for (const name of ['front', 'back'] as const) {
      const face = frame.faces[name], vy = top + (frame.roof.ridgeY - top) * 0.5, ring: Array<[number, number]> = [], hole: Array<[number, number]> = [];
      for (let k = 0; k < 12; k++) {
        const a = Math.PI * 2 * k / 12;
        ring.push([Math.cos(a) * 0.46, vy + Math.sin(a) * 0.46]);
        hole.push([Math.cos(a) * 0.32, vy + Math.sin(a) * 0.32]);
      }
      faceSlab(sink, YELLOW_BRICK, face, ring, 0, 0.04);
      faceSlab(sink, 'dark', face, hole, 0.04, 0.004);
    }
  }
}

function dialect(rng: () => number, door: Rgb): HouseDialect {
  return {
    window: (s, face, o, y0) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, o.kind === 'loft' ? { ...WINDOW, bars: 'cross' } : WINDOW, rng, 0.42),
    door: (s, face, o, y0) => {
      if (o.kind === 'gate') { gateUnit(s, face, o.u, y0 + o.y0, o.w, o.h, shade(door, 0.9), { bucket: YELLOW_BRICK, width: 0.24, out: 0.08 }); return; }
      doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { leaf: door, frame: { bucket: YELLOW_BRICK, width: 0.18, out: 0.06, arch: true }, transom: true, steps: { bucket: 'stone' }, leafKind: 'panel' }, y0 + o.y0);
    },
  };
}

const slate = (pitch: number, kind: RoofSpec['kind'] = 'gable'): RoofSpec => ({ kind, pitchDeg: pitch, eave: 0.35, verge: 0.2, thickness: 0.13, bucket: 'roof', ridge: 'saddle' });

/** A yellow-brick band round a body at height y. */
function band(sink: PartSink, b: { x0: number; x1: number; z0: number; z1: number }, y: number): void {
  sink.band(YELLOW_BRICK, b.x0 - 0.04, y, b.z0 - 0.04, b.x1 + 0.04, y + 0.24, b.z1 + 0.04, { decor: true });
}

/** The colliery cottage pair: two storeys of brick, two doors, a dormer each, a stack at each gable. */
const cottagePair: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const W = Math.max(7.6, ctx.info.w - 0.3), D = Math.max(7.6, Math.min(10, ctx.info.d - 0.3));
  const door = DOOR[Math.floor(rng() * DOOR.length) % DOOR.length];
  const openings: Opening[] = [];
  for (const u of [-W * 0.28, W * 0.28]) openings.push({ face: 'front', storey: 0, kind: 'door', u, w: 0.95, y0: 0, h: 2.2 });
  for (const i of [0, 1]) for (const o of windowRhythm('front', i, W, { w: 0.9, h: 1.3, sill: 0.9, spacing: 1.8, margin: 0.8, avoid: i === 0 ? [[-W * 0.28 - 0.6, -W * 0.28 + 0.6], [W * 0.28 - 0.6, W * 0.28 + 0.6]] : [] })) openings.push(o);
  for (const i of [0, 1]) for (const o of windowRhythm('back', i, W, { w: 0.8, h: 1.1, sill: 1.0, spacing: 2.4, margin: 1.0 })) openings.push(o);
  // the ridge runs along the street: built along local z and turned a quarter, its local -x side faces the street (+z)
  sink.placed(Math.PI / 2, 0, 0, 0, () => {
    const frame = buildHouse(sink, {
      w: D, d: W, plinth: { h: 0.4, out: 0.05, bucket: 'stone' }, storeys: [{ h: 2.8, wall: 'stone' }, { h: 2.6, wall: 'stone' }],
      roof: slate(45), gableBucket: 'stone', openings: openings.map((o) => ({ ...o, face: o.face === 'front' ? 'left' : o.face === 'back' ? 'right' : o.face })),
      chimneys: [{ x: 0, z: W / 2 - 0.6, sx: 0.6, sz: 0.7, above: 0.9, bucket: 'stone', cap: 'pots' }, { x: 0, z: -W / 2 + 0.6, sx: 0.6, sz: 0.7, above: 0.9, bucket: 'stone', cap: 'pots' }],
      gutters: { colour: rgb(0x6a6e70) }, verge: null,
    }, dialect(rng, door));
    band(sink, frame.bodies[0], frame.floors[1] - 0.12);
    if (facadeOn()) {
      brickMasonry(frame, sink, ['left', 'right'], ['front', 'back'], false);
      // the party wall between the pair, a pier up the street front
      pilaster(sink, 'stone', frame.faces.left, 0, frame.floors[0], frame.eaveY - 0.31, 0.5, 0.07);
    }
  });
  return sink.finish();
};

/**
 * The goods shed: a long brick shed, sliding doors along a loading dock under a deep canopy on brackets. A yard shed's
 * plot (11.7 x 7.2 m) is wider than deep: the shed lies along it (plotAxes), its loading dock down one long side,
 * instead of running 16 m deep across the plot, 4.4 m past either side.
 */
const goodsShed: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const plot = plotAxes(ctx.info);
  const W = Math.max(plot.turned ? 4.4 : 9, Math.min(14, plot.w - 3.5)), D = Math.max(plot.turned ? 8 : 16, Math.min(26, plot.d - 0.6));
  const openings: Opening[] = [];
  for (let k = 0, n = Math.max(3, Math.round(D / 5)); k < n; k++) {
    const u = -D / 2 + (k + 0.5) * (D / n);
    openings.push(k % 2 === 0 ? { face: 'right', storey: 0, kind: 'gate', u, w: 2.6, y0: 1.1, h: 2.6 } : { face: 'right', storey: 0, kind: 'window', u, w: 1.1, y0: 2.2, h: 1.3 });
    if (k % 2 === 1) openings.push({ face: 'left', storey: 0, kind: 'window', u, w: 1.1, y0: 2.2, h: 1.3 });
  }
  // the body against one side of the plot, the dock beside it (turned: in the plot-axes frame)
  const cx = plot.turned ? -plot.w / 2 + 0.3 + W / 2 : ctx.bounds.minX + 0.3 + W / 2;
  alongPlot(sink, plot.turned, () => sink.placed(0, cx, 0, 0, () => {
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: 1.1, out: 0.04, bucket: 'stone' }, storeys: [{ h: 4.4, wall: 'stone' }],
      roof: slate(28), gableBucket: 'stone', openings, chimneys: [], gutters: { colour: rgb(0x6a6e70) }, verge: null,
    }, dialect(rng, DOOR[1]));
    band(sink, frame.bodies[0], 3.9);
    if (facadeOn()) brickMasonry(frame, sink, ['left', 'right'], ['left'], true);
    // the loading dock and its canopy on brackets
    sink.span('stone', W / 2, -0.4, -D / 2, W / 2 + 2.4, 1.1, D / 2);
    const canopy: RoofSpec = { kind: 'shed', pitchDeg: 7, eave: 0.1, verge: 0.3, thickness: 0.08, bucket: 'roof' };
    const cw = plot.turned ? 2.6 : 3.0;
    sink.placed(Math.PI, W / 2 + cw / 2, 0, 0, () => emitRoof(sink, roofGeometry(cw, D + 0.4, 4.9, canopy), canopy));
    for (let z = -D / 2 + 1; z < D / 2; z += 3.2) {
      sink.member('structureWood', [W / 2 + 0.05, 3.8, z], [W / 2 + 2.4, 4.85, z], 0.12, 0.12, [0, 0, 1], { colour: IRON, decor: true, exposed: true });
    }
  }), 1);
  return sink.finish();
};

/** The water tower: a brick shaft and a riveted tank house with a hipped cap. */
const waterTower: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  // the tank house stays over the plot (a 5.4 m plot: the cap's eaves reach its edge)
  const half = Math.min(ctx.info.w, ctx.info.d) / 2;
  const R = Math.max(1.5, Math.min(2.2, half - 0.75)), H = 11.0;
  sink.cylinder('stone', [0, -0.4, 0], 'y', 0.9, R + 0.25, 8, {}, R + 0.2, true, Math.PI / 8);
  sink.cylinder('stone', [0, 0.5, 0], 'y', H, R, 8, {}, R * 0.9, true, Math.PI / 8);
  for (const y of [3.2, 6.6, 10.0]) sink.cylinder(YELLOW_BRICK, [0, y, 0], 'y', 0.3, R * (1 - (y / H) * 0.1) + 0.05, 8, { decor: true }, R * (1 - (y / H) * 0.1) + 0.05, true, Math.PI / 8);
  // the tank house: wider than the shaft, sheet-clad, under a hipped slate cap
  const T = Math.max(R + 0.3, Math.min(3.4, half - 0.4)), th = 3.6, ty = H + 0.5;
  sink.span('structureMetal', -T, ty, -T, T, ty + th, T, { colour: rgb(0x5a6266) });
  for (let u = -T + 0.6; u < T; u += 1.2) for (const sgn of [-1, 1]) {
    sink.span('structureMetal', u - 0.04, ty, sgn * T - 0.04, u + 0.04, ty + th, sgn * T + 0.04, { colour: rgb(0x3e4448), decor: true });
    sink.span('structureMetal', sgn * T - 0.04, ty, u - 0.04, sgn * T + 0.04, ty + th, u + 0.04, { colour: rgb(0x3e4448), decor: true });
  }
  const cap = slate(32, 'hip');
  emitRoof(sink, roofGeometry(2 * T, 2 * T, ty + th, { ...cap, verge: cap.eave }), { ...cap, verge: cap.eave });
  const f: Face = { origin: [0, 0, R * Math.cos(Math.PI / 8)], u: [1, 0, 0], out: [0, 0, 1], width: 2 };
  doorUnit(sink, f, 0, 0.5, 1.0, 2.2, { leaf: DOOR[0], frame: { bucket: YELLOW_BRICK, width: 0.16, out: 0.06, arch: true }, steps: { bucket: 'stone' }, leafKind: 'plank' }, 0.5);
  return sink.finish();
};

/** The station building: a gabled two-storey block between single-storey wings, arched windows, a platform canopy. */
const station: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  // the body and the platform canopy (3.4 m past its track side) inside the plot
  const W = Math.max(6.4, Math.min(10, ctx.info.w - 4.6)), D = Math.max(14, Math.min(22, ctx.info.d - 2));
  const coreD = Math.min(9, D * 0.45), wingD = (D - coreD) / 2;
  const door = DOOR[0];
  const coreOpenings: Opening[] = [{ face: 'left', storey: 0, kind: 'door', u: 0, w: 1.6, y0: 0, h: 2.8 }];
  for (const i of [0, 1]) for (const face of ['left', 'right'] as const) for (const o of windowRhythm(face, i, coreD, { w: 1.1, h: 1.7, sill: 0.9, spacing: 2.1, margin: 1.0, avoid: face === 'left' && i === 0 ? [[-1.0, 1.0]] : [] })) coreOpenings.push(o);
  const cx = ctx.bounds.minX + 0.3 + W / 2;
  sink.placed(0, cx, 0, 0, () => {
    const core = buildHouse(sink, {
      w: W, d: coreD, plinth: { h: 0.5, out: 0.06, bucket: 'stone' }, storeys: [{ h: 3.8, wall: 'stone' }, { h: 3.2, wall: 'stone' }],
      roof: slate(42), gableBucket: 'stone', openings: coreOpenings,
      chimneys: [{ x: W * 0.25, z: 0, sx: 0.6, sz: 0.6, above: 1.0, bucket: 'stone', cap: 'pots' }], gutters: { colour: rgb(0x6a6e70) }, verge: null,
    }, dialect(rng, door));
    band(sink, core.bodies[0], core.floors[1] - 0.15);
    if (facadeOn()) brickMasonry(core, sink, ['left', 'right'], ['left', 'right'], true);
    for (const end of [1, -1]) {
      sink.placed(0, 0, 0, end * (coreD / 2 + wingD / 2 - 0.05), () => {
        const wingOpenings: Opening[] = [];
        for (const face of ['left', 'right'] as const) for (const o of windowRhythm(face, 0, wingD, { w: 1.1, h: 1.8, sill: 0.8, spacing: 2.2, margin: 0.8 })) wingOpenings.push(o);
        const wing = buildHouse(sink, {
          w: W - 1.2, d: wingD, plinth: { h: 0.5, out: 0.06, bucket: 'stone' }, storeys: [{ h: 4.0, wall: 'stone' }],
          roof: slate(30, 'hip'), gableBucket: 'stone', openings: wingOpenings, chimneys: [], gutters: { colour: rgb(0x6a6e70) }, verge: null,
        }, dialect(rng, door));
        band(sink, wing.bodies[0], 3.5);
        if (facadeOn()) trimRing(sink, 'stone', wing.bodies[0], wing.eaveY - 0.24, [{ h: 0.08, out: 0.05 }, { h: 0.08, out: 0.1 }, { h: 0.08, out: 0.14 }]);
      });
    }
    // the platform canopy along the track side (+x) on cast columns
    const canopy: RoofSpec = { kind: 'shed', pitchDeg: 6, eave: 0.2, verge: 0.3, thickness: 0.09, bucket: 'roof' };
    sink.placed(Math.PI, W / 2 + 1.9, 0, 0, () => emitRoof(sink, roofGeometry(3.6, D, 4.3, canopy), canopy));
    for (let z = -D / 2 + 1.2; z < D / 2; z += 3.4) sink.cylinder('structureMetal', [W / 2 + 3.3, 0, z], 'y', 4.3, 0.1, 8, { colour: IRON });
  });
  return sink.finish();
};

/** A shelled brick building: walls broken to jagged stubs, a gable standing, the roof slates down. */
const ruin: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const W = Math.max(6, ctx.info.w - 0.3), D = Math.max(7, ctx.info.d - 0.3), t = 0.38;
  for (const [x0, z0, x1, z1] of [[-W / 2, -D / 2, W / 2, -D / 2 + t], [-W / 2, D / 2 - t, W / 2, D / 2], [-W / 2, -D / 2 + t, -W / 2 + t, D / 2 - t], [W / 2 - t, -D / 2 + t, W / 2, D / 2 - t]] as const) {
    const along = Math.abs(x1 - x0) > Math.abs(z1 - z0);
    for (let k = 0; k < 5; k++) {
      if (rng() < 0.25) continue;
      const a = k / 5, b = (k + 1) / 5, top = 1.0 + rng() * 4.2;
      if (along) sink.span('stone', x0 + (x1 - x0) * a, -0.3, z0, x0 + (x1 - x0) * b, top, z1);
      else sink.span('stone', x0, -0.3, z0 + (z1 - z0) * a, x1, top, z0 + (z1 - z0) * b);
    }
  }
  sink.span('stone', -W * 0.35, -0.2, -D * 0.3, W * 0.3, 1.0, D * 0.25, { decor: true });
  sink.member('roof', [-W * 0.3, 0.9, -D * 0.1], [W * 0.25, 2.2, D * 0.2], 2.4, 0.12, [0, 1, 0], { decor: true, exposed: true });
  return sink.finish();
};

export const RUHR_BUILDERS: Readonly<Record<string, RegionalBuilder>> = Object.freeze({
  rowhouse: cottagePair,
  warehouse: goodsShed,
  watertower: waterTower,
  depot: station,
  ruin,
  shed: goodsShed,
  stack: factoryStack,
});

export const RUHR_STYLE: ArchitectureStyle = Object.freeze<ArchitectureStyle>({
  id: 'ruhr',
  region: 'Ruhr and Upper Silesian coalfield junctions: soot-dark brick with yellow-brick bands under slate',
  surfaces: {
    roof: { kind: 'slate', tint: [0.25, 0.26, 0.28] },
    stone: { kind: 'brick', tint: [0.50, 0.26, 0.20] },
    sourced: { plaster: true, wood: true },
    tones: { plaster2: (_h, s, l) => [0.11, Math.min(1, s * 0.6 + 0.2), Math.min(1, l * 1.1 + 0.08)] },
  },
  builders: RUHR_BUILDERS,
  // the colliery cottages' gardens: a board fence round the vegetable plot behind the pair, a gate (yards.ts; the
  // facades lane, 2026-10-06, after waves 182-184 read the white picket as American: a Ruhr colony fenced its gardens in
  // rough boards)
  yard: { kinds: ['rowhouse'], fence: 'fenceplank', gate: 'gate', shed: null, garden: true },
});

export type { RegionalParts };
