// src/world/maps/regional/fyr.ts — the Nordland kit's light (the plan's lighthouse on the fjord; props census #5, lane B
// 2026-10-15; the judges on the plan builder: "a whitewashed cylinder with a dark drum on it, the door a board laid on
// the wall"). A Norwegian fyrstasjon as the small lights of the Ofotfjord stand: the cast-iron lantern on the keeper's
// timber house. A white board house of one storey and its loft under slate, gable to the sea, its windows and door cut in
// the boards' reveals in the kit's own joinery (nordland.ts hands in its state and dialect), a stack at the land gable;
// out of the sea gable's roof the light's boarded turret, a window to the sea, the iron gallery on it with its railing,
// the red lantern with its astragals and cupola (lantern.ts). The turret is a roof crown (house.ts roofCrown): it falls
// with the roof's section.
import { PartSink, faceBox, rgb, type RegionalParts, type Rgb } from './geometry.ts';
import { buildHouse, holedBox, roofCrown, type HouseDialect, type Opening, type RoofSpec } from './house.ts';
import { windowUnit, type WindowStyle } from './openings.ts';
import { lightLantern } from './lantern.ts';
import type { RegionalBuildContext } from './types.ts';

const WHITE = rgb(0xece9e1), IRON = rgb(0x262626), LANTERN_RED = rgb(0x9a2b24);
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

/**
 * The light, in the kit's dialect: nordland.ts hands in its state (white paint, its joinery) and dialect (the kit file
 * keeps only its call site; this file imports nothing from it).
 */
export function fyr<S extends { rng: () => number; look: () => number; window: WindowStyle; mobile: boolean }>(ctx: RegionalBuildContext,
  stateFor: (ctx: RegionalBuildContext, weights: readonly [number, number, number]) => S, dialect: (st: S) => HouseDialect): RegionalParts {
  const sink = new PartSink([ctx.rng() * 7.31, ctx.rng() * 5.17]);
  const st = stateFor(ctx, [1, 0, 0]);
  const rng = st.rng, look = st.look;
  const b = ctx.bounds;
  const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
  // the walls inside the base's reach less the roof's overhang (the kit's rule: a kit building fills the base's bounds)
  const W = clamp(b.maxX - b.minX - 0.9, 4.4, 9), D = clamp(b.maxZ - b.minZ - 0.64, 4.6, 10);
  const openings: Opening[] = [
    { face: 'right', storey: 0, kind: 'door', u: -D * 0.18 + (look() - 0.5) * 0.4, w: 0.9, y0: 0, h: 2.05 },
    { face: 'right', storey: 0, kind: 'window', u: D * 0.24, w: 0.8, y0: 0.95, h: 1.15 },
    { face: 'left', storey: 0, kind: 'window', u: -D * 0.22, w: 0.8, y0: 0.95, h: 1.15 },
    { face: 'left', storey: 0, kind: 'window', u: D * 0.22, w: 0.8, y0: 0.95, h: 1.15 },
    { face: 'front', storey: 0, kind: 'window', u: 0, w: 0.8, y0: 0.95, h: 1.15 },
    { face: 'back', storey: 0, kind: 'window', u: (look() - 0.5) * 0.8, w: 0.8, y0: 0.95, h: 1.15 },
  ];
  const roof: RoofSpec = { kind: 'gable', pitchDeg: 40 + rng() * 4, eave: 0.45, verge: 0.32, thickness: 0.12, bucket: 'roof', ridge: 'saddle' };
  sink.placed(0, cx, 0, cz, () => {
    const frame = buildHouse(sink, {
      w: W, d: D, plinth: { h: 0.45, out: 0.06, bucket: 'stone' }, storeys: [{ h: 2.7, wall: 'plaster', framed: true }],
      roof, gableBucket: 'plaster', gableFramed: true, openings,
      chimneys: [{ x: 0, z: -D * 0.22, sx: 0.55, sz: 0.55, above: 0.75, bucket: 'stone', cap: 'slab' }],
      gutters: null, verge: { colour: WHITE, bucket: 'structureWood' }, reveal: 0.1, spall: null,
    }, dialect(st));
    // the light's turret out of the sea gable's roof: boarded, a hand behind the gable's face, its foot down in the loft
    const rg = frame.roof, tw = 1.7, z1 = frame.bodies[0].z1 - 0.12, z0 = z1 - tw;
    const y0 = rg.eaveY - 0.1, yT = rg.ridgeTopY + 1.15, Gy = yT + 0.12, G = tw / 2 + 0.42;
    const cut = 0.12, reveal = 0.1;
    roofCrown(sink, frame, { kind: 'lantern', x0: -G, x1: G, z0: (z0 + z1) / 2 - G, z1: (z0 + z1) / 2 + G, y0, y1: yT + 4.2, bucket: 'plaster' }, () => {
      const pane = { u0: -0.3, u1: 0.3, y0: rg.ridgeTopY + 0.2, y1: rg.ridgeTopY + 0.85 };
      const faces = holedBox(sink, 'plaster', -tw / 2, z0, tw / 2, z1, y0, yT, { front: [pane] }, cut, reveal, {}, { edgeBreaks: [] });
      sink.recess = reveal;
      try {
        windowUnit(sink, faces.front, 0, pane.y0, pane.u1 - pane.u0, pane.y1 - pane.y0, { ...st.window, bars: 'cross' }, rng, 0.2);
      } finally { sink.recess = 0; }
      // the white corner boards up the turret and the board under the gallery
      for (const f of [faces.front, faces.back]) {
        for (const s of [-1, 1]) faceBox(sink, 'structureWood', f, s * (tw / 2 - 0.08), (rg.ridgeY + yT) / 2, 0.025, 0.16, yT - rg.ridgeY, 0.05, { colour: WHITE, decor: true }, 'caps');
      }
      // the iron gallery: its grating on brackets out from the turret
      const zc = (z0 + z1) / 2;
      sink.span('structureMetal', -G, yT, zc - G, G, Gy, zc + G, { colour: IRON });
      for (const f of [faces.front, faces.right, faces.back, faces.left]) {
        for (const u of [-0.55, 0.55]) faceBox(sink, 'structureMetal', f, u, yT - 0.16, 0.18, 0.05, 0.3, 0.36, { colour: IRON, decor: true, fine: true });
      }
      lightLantern(sink, {
        x: 0, z: zc, y: Gy, r: 0.62, sides: 8, dwarf: 0.5, glass: 1.1,
        rail: { half: G - 0.05, sides: 4, colour: WHITE as Rgb }, iron: LANTERN_RED, cupola: LANTERN_RED,
      });
    });
  });
  return sink.finish();
}
