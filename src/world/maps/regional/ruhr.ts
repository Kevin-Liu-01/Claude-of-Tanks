// src/world/maps/regional/ruhr.ts — the coalfield railway kit (Cinder Junction: a junction on the Ruhr / Upper Silesian
// coalfield). Soot-darkened red brick with bands of yellow brick, segmental-arched windows, slate roofs: the station
// building with its gabled central block, low wings and a platform canopy on cast columns; long goods sheds with a
// loading dock under a deep canopy; the brick water tower carrying its tank house; colliery cottages in pairs with
// two doors and a dormer each; the colony's terraced rows (terraceLayout.ts); a shelled brick shell.
import { PartSink, alongPlot, faceBox, plotAxes, rgb, shade, type Face, type RegionalParts, type Rgb } from './geometry.ts';
import { buildHouse, emitRoof, holedPolygon, leanTo, roofGeometry, windowRhythm, type HouseDialect, type HouseFrame, type Opening, type RoofSpec } from './house.ts';
import { doorUnit, gateUnit, windowUnit, type WindowStyle } from './openings.ts';
import { dentilCornice, facadeOn, faceSlab, pilaster, sillStreaks, trimRing } from './facade.ts';
import type { ArchitectureStyle, RegionalBuildContext, RegionalBuilder } from './types.ts';
import { factoryStack } from './shared.ts';
import { terraceLayout, terraceUnits } from '../terraceLayout.ts';

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
 * The colony terrace (a 'terrace' plot: map-revival's authored rows on Cinder Junction; terraceLayout.ts is the plot
 * contract): two-storey houses of soot-dark brick sharing party walls across the plot's width, the pairs' doors side by
 * side at their shared walls under yellow-brick arches with their steps on the pavement line, segmental-arched windows,
 * a yellow band at the first floor and a corbelled cornice, a pier up the street front at every party wall, a stack
 * with pots on the ridge at each party wall and inside each end gable, a continuous slate roof with verge boards at the
 * end gables and a socle 4 cm proud; behind each pair, where the plot is deep enough, the wash-house they share under
 * a lean-to falling to the yard, its copper's flue and a door for each house.
 */
const terraceRow: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const L = terraceLayout(ctx.info);
  const { partyWalls, houses } = terraceUnits(L);
  const door = DOOR[Math.floor(rng() * DOOR.length) % DOOR.length];
  const zc = (L.front + L.back) / 2;
  // openings in the row's frame: the street face (+z) and the back (-z); the body is built along local z and turned a
  // quarter (as the cottage pair is), its local -x side (left) to the street, its +x side (right) to the back, whose
  // u runs the other way
  const openings: Opening[] = [];
  const street = (o: Omit<Opening, 'face'>): void => { openings.push({ ...o, face: 'left' }); };
  const back = (o: Omit<Opening, 'face'>): void => { openings.push({ ...o, face: 'right', u: -o.u }); };
  const sills: Array<[number, number]> = [];
  for (const h of houses) {
    const xc = (h.x0 + h.x1) / 2, uw = h.x1 - h.x0;
    // (the doors 0.9 m off the party wall: the pier up the front stands between the pair's frames)
    const xd = h.door > 0 ? h.x1 - 0.9 : h.x0 + 0.9, xw = xc - h.door * uw * 0.17;
    street({ storey: 0, kind: 'door', u: xd, w: 0.95, y0: 0, h: 2.2 });
    street({ storey: 0, kind: 'window', u: xw, w: 1.1, y0: 0.85, h: 1.35 });
    for (const x of [xc - uw * 0.2, xc + uw * 0.2]) { street({ storey: 1, kind: 'window', u: x, w: 0.9, y0: 0.7, h: 1.2 }); sills.push([x, 0.9]); }
    if (!L.washhouses) back({ storey: 0, kind: 'door', u: xd, w: 0.85, y0: 0, h: 2.05 });
    back({ storey: 0, kind: 'window', u: xw, w: 0.9, y0: 1.0, h: 1.1 });
    back({ storey: 1, kind: 'window', u: xc, w: 0.9, y0: 0.85, h: 1.15 });
  }
  const stacks = [-L.w / 2 + 0.5, ...partyWalls, L.w / 2 - 0.5].map((z) => ({ x: 0, z, sx: 0.55, sz: 0.75, above: 1.0, bucket: 'stone' as const, cap: 'pots' as const }));
  sink.placed(Math.PI / 2, 0, 0, zc, () => {
    const frame = buildHouse(sink, {
      w: L.depth, d: L.w, plinth: { h: 0.35, out: 0.04, bucket: 'stone' }, storeys: [{ h: 2.9, wall: 'stone' }, { h: 2.7, wall: 'stone' }],
      roof: slate(40), gableBucket: 'stone', openings, chimneys: stacks,
      gutters: { colour: rgb(0x5a5e60) }, verge: { colour: rgb(0x34302c), bucket: 'structureWood' }, reveal: 0.15,
    }, dialect(rng, door));
    band(sink, frame.bodies[0], frame.floors[1] - 0.12);
    if (facadeOn()) {
      brickMasonry(frame, sink, ['left', 'right'], ['front', 'back'], false);
      for (const x of partyWalls) pilaster(sink, 'stone', frame.faces.left, x, frame.floors[0], frame.eaveY - 0.31, 0.46, 0.06);
      // the soot run off the first-floor sills
      for (const [u, w] of sills) sillStreaks(sink, 'stone', frame.faces.left, u, frame.floors[1] + 0.7, w, frame.floors[1]);
    }
  });
  if (L.washhouses) {
    // the wash-houses behind the pairs, astride their party walls (an odd last house has its own): built along local z
    // and turned a quarter, so the lean-to's fall (local +x) runs to the yard (-z)
    const zw = L.back - L.washDepth / 2;
    const lean: RoofSpec = { kind: 'shed', pitchDeg: 14, eave: 0.25, verge: 0.12, thickness: 0.1, bucket: 'roof' };
    const yard: HouseDialect = {
      window: (s, face, o, y0) => windowUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { ...WINDOW, bars: 'cross', head: null }, rng, 0.2),
      door: (s, face, o, y0) => doorUnit(s, face, o.u, y0 + o.y0, o.w, o.h, { leaf: shade(door, 0.85), frame: { bucket: 'stone', width: 0.1, out: 0.04 }, steps: null, leafKind: 'plank' }, y0 + o.y0),
    };
    for (let i = 0; i < houses.length; i += 2) {
      const pair = i + 1 < houses.length;
      const x = pair ? houses[i].x1 : houses[i].x0 + 1.25, ww = pair ? 4.2 : 2.3;
      const doors: Opening[] = (pair ? [-1, 1] : [0]).map((k) => ({ face: 'right', storey: 0, kind: 'door', u: -k * 1.05, w: 0.8, y0: 0, h: 1.9 }));
      sink.placed(Math.PI / 2, x, 0, zw, () => {
        buildHouse(sink, {
          w: L.washDepth, d: ww, plinth: { h: 0.25, out: 0.03, bucket: 'stone' }, storeys: [{ h: 2.15, wall: 'stone' }],
          roof: lean, gableBucket: 'stone', openings: doors,
          chimneys: [{ x: -L.washDepth / 2 + 0.35, z: pair ? 0 : -0.4, sx: 0.38, sz: 0.38, above: 0.8, bucket: 'stone', cap: 'pots' }],
          gutters: null, verge: null, reveal: 0.12, skirt: null,
        }, yard);
      });
    }
  }
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
  const D = Math.max(plot.turned ? 8 : 16, Math.min(26, plot.d - 0.6));
  // (map-revival's wave 362: on a yard shed the dock read as "a protruding slab plinth") a shed under 12 m has no dock:
  // it fills its plot's width instead, its floor and its doors at the ground
  const dock = D >= 12;
  const W = dock ? Math.max(plot.turned ? 4.4 : 9, Math.min(14, plot.w - 3.5)) : Math.max(4.4, Math.min(14, plot.w - 0.6));
  const floor = dock ? 1.1 : 0.35;
  const openings: Opening[] = [];
  for (let k = 0, n = Math.max(3, Math.round(D / 5)); k < n; k++) {
    const u = -D / 2 + (k + 0.5) * (D / n);
    openings.push(k % 2 === 0 ? { face: 'right', storey: 0, kind: 'gate', u, w: 2.6, y0: dock ? 1.1 : 0, h: dock ? 2.6 : 2.9 }
      : { face: 'right', storey: 0, kind: 'window', u, w: 1.1, y0: dock ? 2.2 : 1.4, h: 1.3 });
    if (k % 2 === 1) openings.push({ face: 'left', storey: 0, kind: 'window', u, w: 1.1, y0: dock ? 2.2 : 1.4, h: 1.3 });
  }
  // the body against one side of the plot, the dock beside it (turned: in the plot-axes frame)
  const cx = plot.turned ? -plot.w / 2 + 0.3 + W / 2 : ctx.bounds.minX + 0.3 + W / 2;
  alongPlot(sink, plot.turned, () => sink.placed(0, cx, 0, 0, () => {
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: floor, out: 0.04, bucket: 'stone' }, storeys: [{ h: 4.4, wall: 'stone' }],
      roof: slate(28), gableBucket: 'stone', openings, chimneys: [], gutters: { colour: rgb(0x6a6e70) }, verge: null,
    }, dialect(rng, DOOR[1]));
    band(sink, frame.bodies[0], floor + 2.8);
    if (facadeOn()) brickMasonry(frame, sink, ['left', 'right'], ['left'], true);
    if (!dock) return;
    // the loading dock: its stone coping along the edge, oak fenders and a rubbing strake down its face, a flight of
    // steps up its end; its canopy on brackets
    sink.span('stone', W / 2, -0.4, -D / 2, W / 2 + 2.4, 1.1, D / 2);
    sink.span('stone', W / 2 + 2.12, 1.1, -D / 2, W / 2 + 2.46, 1.18, D / 2, { decor: true, shade: 0.92 });
    for (let z = -D / 2 + 0.9; z < D / 2 - 0.5; z += 2.6) sink.span('structureWood', W / 2 + 2.4, 0.15, z - 0.12, W / 2 + 2.52, 1.06, z + 0.12, { colour: rgb(0x4a3c30), decor: true });
    sink.span('structureWood', W / 2 + 2.4, 0.7, -D / 2 + 0.3, W / 2 + 2.47, 0.85, D / 2 - 0.3, { colour: rgb(0x3e332a), decor: true });
    for (let k = 0; k < 3; k++) sink.span('stone', W / 2 + 2.4 + (2 - k) * 0.25, -0.3, -D / 2 + 0.15, W / 2 + 2.4 + (3 - k) * 0.25, 0.32 + k * 0.26, -D / 2 + 1.35);
    const canopy: RoofSpec = { kind: 'shed', pitchDeg: 7, eave: 0.1, verge: 0.3, thickness: 0.08, bucket: 'roof' };
    const cw = plot.turned ? 2.6 : 3.0;
    const crg = roofGeometry(cw, D + 0.4, 4.9, canopy);
    sink.placed(Math.PI, W / 2 + cw / 2, 0, 0, () => emitRoof(sink, crg, canopy));
    // (the connectivity sweep: the brackets stopped 0.3 m under the canopy, which rises from the wall) each bracket up to
    // the canopy's underside, and an iron ledger along the wall under its inner edge
    const under = (x: number) => (crg.topAt(cw / 2 - (x - W / 2), 0) ?? 4.9) - canopy.thickness;
    sink.span('structureWood', W / 2, under(W / 2 + 0.06) - 0.14, -D / 2, W / 2 + 0.1, under(W / 2 + 0.06) + 0.01, D / 2, { colour: IRON, decor: true });
    for (let z = -D / 2 + 1; z < D / 2; z += 3.2) {
      sink.member('structureWood', [W / 2 + 0.05, 3.8, z], [W / 2 + 2.4, under(W / 2 + 2.4) - 0.05, z], 0.12, 0.12, [0, 0, 1], { colour: IRON, decor: true, exposed: true });
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
  // (props census #3, lane B 2026-10-14; the judges: "no stair windows, no corbel table or cornice where the tank house
  // sits, the tank house a solid sheet box with no windows, gallery or vent; a square box on an octagon") the brick
  // octagon on its battered plinth, its eight faces each a wall with the door and the stair's slit windows cut in
  // reveals, the yellow bands round it; a corbel table stepping out under the tank house; the tank house an octagon of
  // sheet on battens with a window cut in every other face; its octagonal slate cap and the vent lantern on it
  sink.cylinder('stone', [0, -0.4, 0], 'y', 0.9, R + 0.25, 8, {}, R + 0.2, true, Math.PI / 8);
  const Rs = R * 0.95, sin8 = Math.sin(Math.PI / 8), cos8 = Math.cos(Math.PI / 8), shaftTop = 0.5 + H;
  const faceOf = (k: number, r: number): Face => {
    const t = k * Math.PI / 4;
    return { origin: [Math.sin(t) * r * cos8, 0, Math.cos(t) * r * cos8], u: [Math.cos(t), 0, -Math.sin(t)], out: [Math.sin(t), 0, Math.cos(t)], width: 2 * r * sin8 };
  };
  const hw = Rs * sin8;
  // the stair's slits: up the faces either side of the back, staggered between the bands
  const slits: Array<[number, number]> = [[3, 1.6], [5, 4.3], [3, 7.4], [5, 8.4]];
  for (let k = 0; k < 8; k++) {
    const f = faceOf(k, Rs);
    const holes = [
      ...(k === 0 ? [{ u0: -0.5, u1: 0.5, y0: 0.5, y1: 0.5 + 2.2 }] : []),
      ...slits.filter(([fk]) => fk === k).map(([, y]) => ({ u0: -0.17, u1: 0.17, y0: y, y1: y + 0.95 })),
    ];
    holedPolygon(sink, 'stone', f, [[-hw, 0.5], [hw, 0.5], [hw, shaftTop], [-hw, shaftTop]], holes, 0.38, 0.3);
    // the slits' sills and the door in its reveal
    for (const [fk, y] of slits) if (fk === k) faceBox(sink, 'stone', f, 0, y - 0.04, 0.03, 0.46, 0.08, 0.12, { decor: true });
    if (k === 0) {
      sink.recess = 0.3;
      try {
        doorUnit(sink, f, 0, 0.5, 1.0, 2.2, { leaf: DOOR[0], frame: { bucket: YELLOW_BRICK, width: 0.16, out: 0.06, arch: true }, steps: { bucket: 'stone' }, leafKind: 'plank' }, 0.5);
      } finally { sink.recess = 0; }
    }
  }
  for (const y of [3.2, 6.6, 10.0]) sink.cylinder(YELLOW_BRICK, [0, y, 0], 'y', 0.3, Rs + 0.05, 8, { decor: true }, Rs + 0.05, true, Math.PI / 8);
  // the corbel table: three courses stepping out to the tank house
  const T = Math.max(R + 0.3, Math.min(3.4, half - 0.4)), th = 3.6, ty = H + 0.5;
  for (let c = 0; c < 3; c++) {
    const r0 = Rs + (T - Rs) * (c / 3), r1 = Rs + (T - Rs) * ((c + 1) / 3);
    sink.cylinder(c === 1 ? YELLOW_BRICK : 'stone', [0, ty - 0.66 + c * 0.22, 0], 'y', 0.22, r0 + 0.06, 8, { shade: 0.9 }, r1, true, Math.PI / 8);
  }
  // the tank house: eight faces of sheet on battens, a window cut in every other face, the gallery's rail round it
  const Tf = T / cos8, tw = Tf * sin8;
  for (let k = 0; k < 8; k++) {
    const f = faceOf(k, Tf);
    const win = k % 2 === 1;
    holedPolygon(sink, 'structureMetal', f, [[-tw, ty], [tw, ty], [tw, ty + th], [-tw, ty + th]],
      win ? [{ u0: -0.4, u1: 0.4, y0: ty + 1.4, y1: ty + 2.5 }] : [], 0.12, 0.1, { colour: rgb(0x5a6266) });
    if (win) {
      sink.recess = 0.1;
      try {
        windowUnit(sink, f, 0, ty + 1.4, 0.8, 1.1, { frame: rgb(0x3e4448), frameWidth: 0.06, frameOut: 0.04, bars: 'six', surround: null, sill: { bucket: 'stone', out: 0.06 }, shutters: null }, ctx.rng, 0);
      } finally { sink.recess = 0; }
    }
    for (const u of [-tw + 0.04, 0, tw - 0.04]) faceBox(sink, 'structureMetal', f, u, ty + th / 2, 0.03, 0.08, th, 0.06, { colour: rgb(0x3e4448), decor: true });
  }
  // the octagonal slate cap, the vent lantern on its apex: its louvred drum and little cap
  const capR = Tf + 0.35, capH = 2.2;
  sink.cylinder('roof', [0, ty + th, 0], 'y', capH, capR, 8, {}, 0.35, true, Math.PI / 8);
  sink.cylinder('structureMetal', [0, ty + th + capH - 0.1, 0], 'y', 0.7, 0.32, 8, { colour: rgb(0x4a5054) }, 0.32, true, Math.PI / 8);
  sink.cylinder('roof', [0, ty + th + capH + 0.6, 0], 'y', 0.55, 0.48, 8, {}, 0.04, true, Math.PI / 8);
  for (let y = ty + th + capH; y < ty + th + capH + 0.55; y += 0.14) {
    sink.cylinder('structureMetal', [0, y, 0], 'y', 0.04, 0.34, 8, { colour: rgb(0x2e3236), decor: true, fine: true }, 0.34, false, Math.PI / 8);
  }
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
    // the platform canopy along the track side (+x) on cast columns (props census E4, lane B 2026-10-14: it rose from
    // the wall and its columns stopped 0.34 m under it): it falls from the wall over the platform to an iron girder on
    // the columns' heads, the columns' feet sunk in the platform
    const side: Face = { origin: [W / 2, 0, 0], u: [0, 0, -1], out: [1, 0, 0], width: D };
    const cols: number[] = [];
    for (let z = -D / 2 + 1.2; z < D / 2; z += 3.4) cols.push(-z);
    leanTo(sink, { face: side, u0: -D / 2, u1: D / 2, depth: 3.3, highY: 4.65,
      roof: { pitchDeg: 6, eave: 0.4, verge: 0.3, thickness: 0.09, bucket: 'roof' },
      posts: { at: cols, size: 0.2, bucket: 'structureMetal', colour: IRON, round: true },
      plate: { h: 0.3, w: 0.16, bucket: 'structureMetal', colour: IRON } });
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

/**
 * (the looks lane, 2026-10-13; LOOKS-BRIEF section 6: Cinder Junction's two works drawn by the generic factory) the
 * junction's works (a Zeche's Maschinenhalle or a Ruhr wire works of about 1900): a two-storey hall of soot-dark brick
 * on a stone plinth, yellow-brick bands at its floors, brick piers between the bays of tall segment-arched windows, a
 * dentil cornice; its gable to the yard with a great round-arched window and the gable's vent; the slate roof's ridge
 * lantern; the boiler house against its back under a shed roof; the works' chimney on its plinth at the plot's corner.
 */
const works: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const bb = ctx.bounds, plotW = bb.maxX - bb.minX, plotD = bb.maxZ - bb.minZ;
  // the boiler house wants 3.6 m behind the hall: a deep plot keeps it (the hall drawn forward), a short one goes without
  const boiler = plotD >= 13 + 1.2 + 3.6;
  const W = Math.max(9, Math.min(12.5, plotW - 4.2)), D = Math.max(13, Math.min(20, plotD - 1.2 - (boiler ? 3.6 : 0)));
  const cx = bb.minX + 0.6 + W / 2, cz = boiler ? bb.maxZ - 0.6 - D / 2 : (bb.minZ + bb.maxZ) / 2;
  const storeys = [{ h: 4.6, wall: 'stone' as const }, { h: 4.2, wall: 'stone' as const }];
  const openings: Opening[] = [{ face: 'front', storey: 0, kind: 'gate', u: 0, w: 3.2, y0: 0, h: 3.8 }];
  openings.push({ face: 'front', storey: 1, kind: 'window', u: 0, w: 2.2, y0: 0.5, h: 3.0 });
  for (const u of [-W * 0.32, W * 0.32]) openings.push({ face: 'front', storey: 0, kind: 'window', u, w: 1.3, y0: 1.2, h: 2.5 }, { face: 'front', storey: 1, kind: 'window', u, w: 1.3, y0: 0.8, h: 2.4 });
  const bays = Math.max(4, Math.round(D / 3.4));
  for (const face of ['left', 'right'] as const) {
    for (let k = 0; k < bays; k++) {
      const u = -D / 2 + (k + 0.5) * (D / bays);
      openings.push({ face, storey: 0, kind: 'window', u, w: 1.5, y0: 1.2, h: 2.6 }, { face, storey: 1, kind: 'window', u, w: 1.5, y0: 0.8, h: 2.5 });
    }
  }
  sink.placed(0, cx, 0, cz, () => {
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: 0.6, out: 0.08, bucket: 'stone' }, storeys, roof: slate(32), gableBucket: 'stone', openings,
      chimneys: [], gutters: { colour: rgb(0x5e6264) }, verge: null, reveal: 0.36,
    }, dialect(rng, DOOR[2]));
    band(sink, frame.bodies[0], 0.6 + storeys[0].h - 0.12);
    band(sink, frame.bodies[0], 0.6 + 1.0);
    if (facadeOn()) brickMasonry(frame, sink, ['left', 'right'], ['left', 'right', 'front'], true);
    // the ridge lantern: a raised louvred stage along the ridge under its own slate roof
    const rg = frame.roof, ly = rg.ridgeTopY - 0.08, len = D * 0.55;
    sink.span('stone', -0.8, ly - 0.3, -len / 2, 0.8, ly + 0.7, len / 2);
    for (const sx of [-1, 1]) for (let k = 0; k < 3; k++) {
      sink.span('structureWood', sx * 0.81 - 0.02, ly + 0.05 + k * 0.2, -len / 2 + 0.2, sx * 0.81 + 0.02, ly + 0.12 + k * 0.2, len / 2 - 0.2, { colour: rgb(0x2e3032), decor: true });
    }
    const cap = slate(26);
    emitRoof(sink, roofGeometry(1.7, len + 0.2, ly + 0.7, cap), cap);
  });
  // the boiler house against the hall's back, its shed roof leaning on the hall
  const BW = Math.min(5.4, W - 2), BD = Math.min(4.6, (cz - D / 2) - bb.minZ - 0.4);
  if (boiler && BD >= 3.2) {
    sink.placed(0, cx - W / 2 + BW / 2 + 0.5, 0, cz - D / 2 - BD / 2 + 0.05, () => {
      const f2 = buildHouse(sink, {
        w: BW, d: BD, plinth: { h: 0.5, out: 0.06, bucket: 'stone' }, storeys: [{ h: 4.8, wall: 'stone' }],
        roof: { kind: 'shed', pitchDeg: 14, eave: 0.3, verge: 0.25, thickness: 0.12, bucket: 'roof' }, gableBucket: 'stone',
        openings: [{ face: 'left', storey: 0, kind: 'window', u: 0, w: 1.4, y0: 1.2, h: 2.8 }, { face: 'back', storey: 0, kind: 'door', u: 0, w: 1.3, y0: 0, h: 2.5 }],
        chimneys: [], gutters: { colour: rgb(0x5e6264) }, verge: null, reveal: 0.34,
      }, dialect(rng, DOOR[0]));
      band(sink, f2.bodies[0], 0.5 + 3.2);
    });
  }
  // the chimney at the plot's free corner beside the hall (the kit's own stack, moved to its seat)
  const parts = sink.finish();
  const stack = factoryStack({ ...ctx, info: { w: 3.2, d: 3.2, h: 26 }, bounds: { minX: -1.6, maxX: 1.6, minZ: -1.6, maxZ: 1.6, maxY: 26 } });
  for (const [bucket, list] of Object.entries(stack) as Array<[keyof RegionalParts, RegionalParts[keyof RegionalParts]]>) {
    for (const g of list) parts[bucket].push(g.translate(bb.maxX - 1.9, 0, bb.minZ + 2.0));
  }
  return parts;
};

export const RUHR_BUILDERS: Readonly<Record<string, RegionalBuilder>> = Object.freeze({
  rowhouse: cottagePair,
  terrace: terraceRow,
  warehouse: goodsShed,
  watertower: waterTower,
  depot: station,
  ruin,
  shed: goodsShed,
  stack: factoryStack,
  // (the looks lane, 2026-10-13) the junction's works in the coalfield's brick
  factory: works,
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
  // soot from the junction's engines and the pits' stacks on every wall and roof (map-revival's wave 362: "clean orange
  // brick boxes ... nothing like the dense, soot-darkened terraced streets round a 1962 Ruhr junction"): the brick from
  // red to smoke-dark, the yellow bands dulled, the slate blackened
  weather: {
    plaster: [[0.9, 0.88, 0.84], [0.82, 0.8, 0.77], [0.74, 0.72, 0.7]],
    stone: [[0.8, 0.76, 0.74], [0.7, 0.66, 0.64], [0.6, 0.57, 0.56], [0.75, 0.71, 0.68]],
    roof: [[0.92, 0.92, 0.92], [0.8, 0.79, 0.79], [0.7, 0.69, 0.7]],
    damp: 0.7, moss: 0.1,
  },
  // the colliery cottages' gardens: a board fence round the vegetable plot behind the pair, a gate (yards.ts; the
  // facades lane, 2026-10-06, after waves 182-184 read the white picket as American: a Ruhr colony fenced its gardens in
  // rough boards)
  yard: { kinds: ['rowhouse'], fence: 'fenceplank', gate: 'gate', shed: null, garden: true },
});

export type { RegionalParts };
