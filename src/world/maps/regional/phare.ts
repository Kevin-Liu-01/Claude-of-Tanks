// src/world/maps/regional/phare.ts — the Breton kit's light (the plan's lighthouse on Saltmere Bay; props census #5,
// lane B 2026-10-15; the judges on the plan builder: "a whitewashed cylinder with a dark drum on it, the door a board laid
// on the wall"). A light of the Léon coast as the small harbour and coast lights of the Pays Pagan stand (Pontusval,
// Brignogan): a square tower of coursed granite at the back of a one-storey keeper's house under slate. The tower's
// lights are cut through the shaft in reveals; a string course and a corbelled gallery carry the iron railing round the
// lantern (its dwarf wall, panes, astragals and the verdigris cupola: lantern.ts). The house wears the kit's granite: its
// door and windows cut in reveals, coped gables on kneelers, a gable-end stack, dressed quoins. The tower is a shaft
// body (house.ts recordShaft: it topples in its courses with its lantern) and the house a body of its own.
import { PartSink, faceBox, facePoint, rgb, type Face, type RegionalBucket, type RegionalParts } from './geometry.ts';
import {
  buildHouse, holedBox, recordShaft, type FaceName, type HoleRect, type HouseDialect, type HouseFrame, type Opening, type RoofSpec,
} from './house.ts';
import { windowUnit } from './openings.ts';
import { lightLantern } from './lantern.ts';
import type { RegionalBuildContext } from './types.ts';

const IRON = rgb(0x26302b), VERDIGRIS = rgb(0x5e8f7b), LIGHT_FRAME = rgb(0x2b2e2c);
const slate = (pitch: number): RoofSpec => ({ kind: 'gable', pitchDeg: pitch, eave: 0.1, verge: 0.02, thickness: 0.12, bucket: 'roof', ridge: 'saddle' });

/** The coped gables of the keeper's house: granite coping riding the rakes on kneelers, a stack on the land gable. */
function copedGables(sink: PartSink, frame: HouseFrame, rng: () => number): void {
  const rg = frame.roof, b = frame.bodies[0], s = rg.s;
  for (const [z, sgn] of [[b.z1, 1], [b.z0, -1]] as const) {
    const face: Face = { origin: [0, 0, z], u: [sgn, 0, 0], out: [0, 0, sgn], width: 2 * s };
    for (const side of [-1, 1]) {
      const a = facePoint(face, side * (s + 0.06), rg.eaveY + 0.2, 0), c = facePoint(face, 0, rg.ridgeTopY + 0.12, 0);
      sink.member('stone', a, c, 0.34, 0.5, face.out, { exposed: true, decor: true }, 0.5);
      faceBox(sink, 'stone', face, side * (s - 0.05), rg.eaveY - 0.05, -0.18, 0.62, 0.42, 0.6, { decor: true });
    }
    if (sgn > 0) {
      const w = 0.9 + rng() * 0.2, dz = 0.6, zc = z - dz / 2, above = 0.85 + rng() * 0.3;
      sink.span('stone', -w / 2, rg.ridgeY - 1.6, zc - dz / 2, w / 2, rg.ridgeTopY + above, zc + dz / 2);
      sink.span('stone', -w / 2 - 0.08, rg.ridgeTopY + above, zc - dz / 2 - 0.08, w / 2 + 0.08, rg.ridgeTopY + above + 0.15, zc + dz / 2 + 0.08);
      for (const px of [-w * 0.22, w * 0.22]) sink.cylinder('roof', [px, rg.ridgeTopY + above + 0.15, zc], 'y', 0.3, 0.09, 6, { decor: true });
    }
  }
}

/**
 * The light, in the kit's dialect: breton.ts hands in its state, dialect and quoins (the kit file keeps only its call
 * site; this file imports nothing from it).
 */
export function phare<S extends { rng: () => number; wall: RegionalBucket }>(ctx: RegionalBuildContext, stateFor: (ctx: RegionalBuildContext) => S,
  dialect: (st: S) => HouseDialect, quoins: (sink: PartSink, frame: HouseFrame) => void): RegionalParts {
  const sink = new PartSink([ctx.rng() * 7.31, ctx.rng() * 5.17]);
  const st = { ...stateFor(ctx), wall: 'stone' as RegionalBucket };
  const rng = st.rng, look = ctx.variant;
  const b = ctx.bounds;
  const cx = (b.minX + b.maxX) / 2, cz = (b.minZ + b.maxZ) / 2;
  // the base's reach filled (the kit's rule): the gables to its sides, the house's front eave to its front
  const W = Math.max(5.0, b.maxX - b.minX - 0.1), D = Math.max(5.0, b.maxZ - b.minZ - 0.1);
  const S = 2.5, H = Math.max(9.5, Math.min(12, ctx.info.h - 3.4));
  const tz0 = cz - D / 2, tz1 = tz0 + S, tzc = (tz0 + tz1) / 2;
  // the keeper's house in front of the tower, its long side to the street (+z), the tower standing 0.6 m into its back
  // wall; built a quarter turned (its long axis is its d), so its local -x ('left') is the street front, +x the back
  const hz0 = tz1 - 0.6, hz1 = cz + D / 2 - 0.05, Dh = hz1 - hz0;
  const win = { w: 0.78, h: 1.05, sill: 0.9 };
  const openings: Opening[] = [
    { face: 'left', storey: 0, kind: 'door', u: (look() - 0.5) * 0.6, w: 0.95, y0: 0, h: 2.05 },
    { face: 'left', storey: 0, kind: 'window', u: -(W / 2 - 1.05), w: win.w, y0: win.sill, h: win.h },
    { face: 'left', storey: 0, kind: 'window', u: W / 2 - 1.05, w: win.w, y0: win.sill, h: win.h },
    { face: 'back', storey: 0, kind: 'window', u: (look() - 0.5) * 0.5, w: 0.62, y0: 1.0, h: 0.85 },
    { face: 'right', storey: 0, kind: 'window', u: (look() < 0.5 ? -1 : 1) * (S / 2 + 0.75), w: 0.6, y0: 1.0, h: 0.85 },
  ];
  sink.placed(Math.PI / 2, cx, 0, (hz0 + hz1) / 2, () => {
    const frame = buildHouse(sink, {
      w: Dh, d: W, plinth: { h: 0.15, out: 0.03, bucket: 'stone' }, storeys: [{ h: 2.6, wall: 'stone' }],
      roof: slate(46 + rng() * 4), gableBucket: 'stone', openings, chimneys: [], gutters: null, verge: null, reveal: 0.34,
      abutted: [{ face: 'right', u0: -S / 2, u1: S / 2 }],
    }, dialect(st));
    copedGables(sink, frame, rng);
    quoins(sink, frame);
  });
  // the tower: its granite foot, the shaft cut by its lights (seaward up the back, one on each side over the house's roof
  // and one to the land over its ridge), each light's unit at the back of its reveal
  const x0 = cx - S / 2, x1 = cx + S / 2;
  sink.span('stone', x0 - 0.15, -0.4, tz0 - 0.15, x1 + 0.15, 0.3, tz1 + 0.15);
  const light = (y: number, u = 0): HoleRect => ({ u0: u - 0.24, u1: u + 0.24, y0: y, y1: y + 0.9 });
  const holes: Partial<Record<FaceName, HoleRect[]>> = {
    back: [light(2.3), light(5.2), light(8.1)], right: [light(6.3)], left: [light(7.4)], front: [light(H - 2.6)],
  };
  const reveal = 0.3;
  const faces = holedBox(sink, 'stone', x0, tz0, x1, tz1, 0.3, H, holes, 0.45, reveal);
  sink.recess = reveal;
  try {
    for (const name of ['front', 'right', 'back', 'left'] as const) {
      for (const h of holes[name] ?? []) {
        windowUnit(sink, faces[name], (h.u0 + h.u1) / 2, h.y0, h.u1 - h.u0, h.y1 - h.y0, {
          frame: LIGHT_FRAME, frameWidth: 0.05, frameOut: 0.03, bars: 'cross',
          surround: { bucket: 'stone', width: 0.16, out: 0.05, lintel: 0.22 }, sill: { bucket: 'stone', out: 0.08 }, shutters: null,
        }, rng, 0.15);
      }
    }
  } finally { sink.recess = 0; }
  // the string course, the corbels in two steps under the gallery, the gallery's granite floor
  sink.span('stone', x0 - 0.08, H - 0.75, tz0 - 0.08, x1 + 0.08, H - 0.55, tz1 + 0.08);
  for (const name of ['front', 'right', 'back', 'left'] as const) {
    const f = faces[name];
    for (const u of [-0.85, 0, 0.85]) {
      faceBox(sink, 'stone', f, u, H - 0.38, 0.12, 0.3, 0.26, 0.24);
      faceBox(sink, 'stone', f, u, H - 0.13, 0.24, 0.3, 0.26, 0.48);
    }
  }
  const G = S / 2 + 0.52;
  sink.span('stone', cx - G, H, tzc - G, cx + G, H + 0.24, tzc + G);
  const top = lightLantern(sink, {
    x: cx, z: tzc, y: H + 0.24, r: 0.82, sides: 8, dwarf: 0.55, glass: 1.35,
    rail: { half: G - 0.07, sides: 4, colour: IRON }, iron: IRON, cupola: VERDIGRIS,
  });
  recordShaft(sink, cx, tzc, S, top, 'stone', true);
  return sink.finish();
}
