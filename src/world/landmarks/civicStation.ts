// src/world/landmarks/civicStation.ts — the railway station set piece (moved byte for byte out of civic.ts by the looks
// lane, r2 sweep 2026-10-16).
import { LocalFrame, PartSink, faceBox, facePoint, rgb, type Face, type RegionalBucket, type Vec3 } from '../maps/regional/geometry.ts';
import { emitRoof, roofGeometry, type RoofSpec } from '../maps/regional/house.ts';
import { LIMEWASH_UV, archSurround, archWindow, archedBody, archedSlab, bar, cornerPilasters, cross, dome, drum, extrude, moulding, portico, revolve, smoothRender, tentRoof, type ArchHole, type FaceName } from './kit.ts';
import { ageWall } from './age.ts';
import type { LandmarkBuildContext, LandmarkBuilder } from './types.ts';
import { FRAME_WHITE, IRON, bell, doorLeaf, lit, towerClock, uvOffset } from './civicKit.ts';
import { letterText } from './lettering.ts';

// ---------------------------------------------------------------------------------------------------------- the station

const BRICK_RED_IRON = rgb(0x7a3b2e), CAST_IRON = rgb(0x30393a), CANOPY_WOOD = rgb(0x6e5a46), BOARD_WHITE = rgb(0xe9e5d8);
/** The name a map's station carries on its board (Verdant's is Prokhorovka, on the Kursk–Belgorod line). */
const STATION_NAMES: Readonly<Record<string, string>> = { verdant: 'ПРОХОРОВКА' };

/**
 * The railway station (the Kursk–Kharkov–Azov line's stations of the 1870s-80s; any line's country station): a long
 * brick hall — a two-storey centre block between single-storey wings — with segmental-arched windows under white
 * dressings, corbelled cornices, hipped iron roofs and brick stacks; on the track side (its front, +z) the platform
 * under a timber canopy on cast-iron columns, the station bell by the door and the name board on the centre block.
 */
export const stationHall: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const L = Math.max(20, Number(ctx.params.length)), D = Math.max(8, Number(ctx.params.depth)), canopyL = Math.max(0, Number(ctx.params.canopy));
  const base = -0.6 - ctx.groundFall, plinth = 0.5;
  const wall: RegionalBucket = 'stone', trim: RegionalBucket = 'plaster';
  const Wc = Math.min(14, Math.max(10, L * 0.34)), Dc = D + 1.0, Ww = (L - Wc) / 2;
  const H1 = plinth + 4.6, H2 = H1 + 3.8, Hw = plinth + 4.7;
  const surround = { bucket: trim, width: 0.15, out: 0.05 };
  const seg = (u: number, w: number, y0: number, spring: number): ArchHole => ({ u, w, y0, spring, form: 'segmental', rise: w * 0.22 });
  // the plinth under the whole hall (rendered)
  sink.span(trim, -L / 2 - 0.08, base, -D / 2 - 0.08, L / 2 + 0.08, plinth, D / 2 + 0.08);
  sink.span(trim, -Wc / 2 - 0.08, base, -Dc / 2 - 0.08, Wc / 2 + 0.08, plinth, Dc / 2 + 0.08);
  // ---- the wings
  for (const side of [-1, 1]) {
    const cx = side * (Wc / 2 + Ww / 2);
    const bays = Math.max(2, Math.round(Ww / 3.4));
    const us = Array.from({ length: bays }, (_, i) => -Ww / 2 + Ww * (i + 0.5) / bays);
    const doorAt = side < 0 ? us.length - 1 : 0; // the door in the bay next to the centre block
    const front = us.map((u, i) => (i === doorAt ? seg(u, 1.5, plinth, plinth + 2.7) : seg(u, 1.25, 1.25, 3.4)));
    const back = us.map((u) => seg(-u, 1.25, 1.25, 3.4));
    const holes: Partial<Record<FaceName, ArchHole[]>> = { front, back, [side < 0 ? 'left' : 'right']: [seg(0, 1.25, 1.25, 3.4)] };
    const faces = archedBody(sink, wall, cx, 0, Ww, D, plinth, Hw, holes, 0.3);
    for (const name of ['front', 'back', 'left', 'right'] as const) {
      for (const h of holes[name] ?? []) {
        if (h.y0 <= plinth + 0.01) doorLeaf(sink, faces[name], h, 0.3);
        else archWindow(sink, faces[name], h, 0.3, FRAME_WHITE, lit(ctx, 0.35));
        archSurround(sink, surround.bucket, faces[name], h, surround.width, surround.out);
      }
    }
    // its age: the soot and the rain run down the brick from the cornice and the sills
    if (ctx.age) for (const name of ['front', 'back', 'left', 'right'] as const) {
      const len = name === 'front' || name === 'back' ? Ww : D;
      if (!holes[name] && name !== (side < 0 ? 'left' : 'right')) continue;
      ageWall(sink, ctx.age, { face: faces[name], bucket: wall, area: { u0: -len / 2 + 0.3, u1: len / 2 - 0.3, y0: plinth, y1: Hw - 0.7 },
        openings: holes[name] ?? [], ledge: Hw - 0.62, grime: 0.28 });
    }
    // the corbelled cornice: a brick band stepped out under a white frieze
    sink.placed(0, cx, 0, 0, () => {
      moulding(sink, trim, Ww, D, Hw - 0.62, 0.3, 0.04);
      moulding(sink, wall, Ww, D, Hw - 0.3, 0.16, 0.12);
      moulding(sink, wall, Ww, D, Hw - 0.14, 0.14, 0.22);
    });
    const roof: RoofSpec = { kind: 'hip', pitchDeg: 26, eave: 0.55, verge: 0.55, thickness: 0.1, bucket: 'structureMetal', ridge: null };
    const rg = roofGeometry(Ww, D, Hw, roof);
    sink.placed(0, cx, 0, 0, () => emitRoof(sink, rg, roof, BRICK_RED_IRON));
    // a brick stack through the ridge
    const sx = cx + side * Ww * 0.18, top = rg.ridgeTopY + 0.9;
    sink.span(wall, sx - 0.32, Hw, -0.32, sx + 0.32, top, 0.32);
    sink.span(wall, sx - 0.42, top, -0.42, sx + 0.42, top + 0.16, 0.42);
  }
  // ---- the centre block: two storeys, three bays a face, the main doors front and back
  const third = Wc / 3;
  const cHoles: Partial<Record<FaceName, ArchHole[]>> = {
    front: [seg(-third, 1.3, 1.25, 3.4), seg(0, 1.9, plinth, plinth + 2.9), seg(third, 1.3, 1.25, 3.4),
      seg(-third, 1.15, H1 + 0.9, H1 + 2.55), seg(0, 1.15, H1 + 0.9, H1 + 2.55), seg(third, 1.15, H1 + 0.9, H1 + 2.55)],
    back: [seg(-third, 1.3, 1.25, 3.4), seg(0, 1.9, plinth, plinth + 2.9), seg(third, 1.3, 1.25, 3.4),
      seg(-third, 1.15, H1 + 0.9, H1 + 2.55), seg(0, 1.15, H1 + 0.9, H1 + 2.55), seg(third, 1.15, H1 + 0.9, H1 + 2.55)],
    left: [seg(0, 1.15, H1 + 0.9, H1 + 2.55)],
    right: [seg(0, 1.15, H1 + 0.9, H1 + 2.55)],
  };
  const cf = archedBody(sink, wall, 0, 0, Wc, Dc, plinth, H2, cHoles, 0.32);
  for (const name of ['front', 'back', 'left', 'right'] as const) {
    for (const h of cHoles[name] ?? []) {
      if (h.y0 <= plinth + 0.01) doorLeaf(sink, cf[name], h, 0.32);
      else archWindow(sink, cf[name], h, 0.32, FRAME_WHITE, lit(ctx, 0.4));
      archSurround(sink, surround.bucket, cf[name], h, surround.width, surround.out);
    }
  }
  cornerPilasters(sink, trim, 0, 0, Wc, Dc, plinth, H2 - 0.6, 0.5, 0.07);
  if (ctx.age) for (const name of ['front', 'back', 'left', 'right'] as const) {
    const len = name === 'front' || name === 'back' ? Wc : Dc;
    // each storey runs off its own ledge: the string course and the cornice
    ageWall(sink, ctx.age, { face: cf[name], bucket: wall, area: { u0: -len / 2 + 0.6, u1: len / 2 - 0.6, y0: plinth, y1: H1 - 0.1 },
      openings: (cHoles[name] ?? []).filter((h) => h.y0 < H1), ledge: H1 - 0.02, grime: 0.24 });
    ageWall(sink, ctx.age, { face: cf[name], bucket: wall, area: { u0: -len / 2 + 0.6, u1: len / 2 - 0.6, y0: H1 + 0.35, y1: H2 - 0.7 },
      openings: (cHoles[name] ?? []).filter((h) => h.y0 >= H1), ledge: H2 - 0.66, grime: 0.28 });
  }
  // the string course between the storeys and the cornice
  moulding(sink, trim, Wc, Dc, H1 + 0.05, 0.26, 0.08);
  moulding(sink, trim, Wc, Dc, H2 - 0.64, 0.32, 0.04);
  moulding(sink, wall, Wc, Dc, H2 - 0.32, 0.16, 0.14);
  moulding(sink, wall, Wc, Dc, H2 - 0.16, 0.16, 0.26);
  const roofC: RoofSpec = { kind: 'hip', pitchDeg: 27, eave: 0.6, verge: 0.6, thickness: 0.1, bucket: 'structureMetal', ridge: null };
  const rgC = roofGeometry(Wc, Dc, H2, roofC);
  emitRoof(sink, rgC, roofC, BRICK_RED_IRON);
  for (const sx of [-1, 1]) {
    const x = sx * Wc * 0.22, top = rgC.ridgeTopY + 0.8;
    sink.span(wall, x - 0.34, H2, -0.34, x + 0.34, top, 0.34);
    sink.span(wall, x - 0.44, top, -0.44, x + 0.44, top + 0.16, 0.44);
  }
  // the name board between the storeys and the clock over the door (platform face)
  const pf = cf.front;
  sink.box('structureWood', facePoint(pf, 0, H1 + 0.55, 0.05), [Wc * 0.3, 0.3, 0.05], { colour: BOARD_WHITE, decor: true }, frameOf(pf));
  // (the looks lane, r2 sweep 2026-10-16: ten dark tiles stood for the letters) the board's moulded frame and the station's
  // name sign-written on it (lettering.ts), the clock in its roundel over the door
  const board: Face = { origin: facePoint(pf, 0, 0, 0.1), u: pf.u, out: pf.out, width: Wc * 0.6 };
  const rim = { colour: CANOPY_WOOD, decor: true, fine: true } as const, bw = Wc * 0.3, by = H1 + 0.55;
  for (const y of [by - 0.27, by + 0.27]) sink.member('structureWood', facePoint(board, -bw, y, 0), facePoint(board, bw, y, 0), 0.06, 0.03, pf.out, rim, 0);
  for (const u of [-bw + 0.03, bw - 0.03]) sink.member('structureWood', facePoint(board, u, by - 0.24, 0), facePoint(board, u, by + 0.24, 0), 0.06, 0.03, pf.out, rim, 0);
  const name = String(ctx.params.board ?? STATION_NAMES[ctx.mapId] ?? 'ВОКЗАЛ');
  letterText(sink, 'structureMetal', board, name, 0, by - 0.17, { capHeight: 0.34, maxWidth: Wc * 0.5, colour: IRON, fine: true });
  towerClock(sink, pf, 0, H2 - 1.25, 0.5, trim);
  // ---- the platform canopy on cast-iron columns, its roof falling toward the track
  if (canopyL > 0) {
    const z0 = D / 2, depth = 3.7, yIn = Hw - 0.55, yOut = yIn - 0.5, cols = Math.max(2, Math.round(canopyL / 3.8));
    const zc = z0 + depth - 0.35;
    for (let i = 0; i <= cols; i++) {
      const x = -canopyL / 2 + 0.3 + (canopyL - 0.6) * i / cols;
      revolve(sink, 'structureMetal', x, zc, [[0.17, 0], [0.17, 0.3], [0.09, 0.42], [0.085, yOut - 0.5], [0.13, yOut - 0.3], [0.13, yOut - 0.12]], 8,
        { colour: CAST_IRON });
      // the bracket: a diagonal strut from the column up to the roof's underside (the roof climbs toward the wall: a
      // strut ending level with the beam stopped a quarter metre under it)
      const bz = zc - 1.1, by = yIn + (yOut - yIn) * (bz - z0) / (depth + 0.25) - 0.04;
      sink.member('structureMetal', [x, yOut - 1.3, zc], [x, by, bz], 0.07, 0.07, [1, 0, 0], { colour: CAST_IRON, decor: true, exposed: true }, 0.035);
    }
    // the beam along the columns and the roof slab
    sink.span('structureWood', -canopyL / 2, yOut - 0.3, zc - 0.11, canopyL / 2, yOut - 0.06, zc + 0.11, { colour: CANOPY_WOOD });
    const n: Vec3 = [0, Math.cos(Math.atan(0.5 / depth)), Math.sin(Math.atan(0.5 / depth))];
    const slab: Vec3[] = [[-canopyL / 2, yIn, z0], [canopyL / 2, yIn, z0], [canopyL / 2, yOut, z0 + depth + 0.25], [-canopyL / 2, yOut, z0 + depth + 0.25]];
    extrude(sink, 'structureMetal', slab, n, 0.08, { colour: BRICK_RED_IRON });
    // the fretwork valance along the outer edge (dressing)
    sink.span('structureWood', -canopyL / 2, yOut - 0.42, z0 + depth + 0.2, canopyL / 2, yOut + 0.02, z0 + depth + 0.25, { colour: CANOPY_WOOD, decor: true });
    for (let x = -canopyL / 2 + 0.15; x < canopyL / 2; x += 0.3) {
      sink.span('structureWood', x - 0.07, yOut - 0.56, z0 + depth + 0.21, x + 0.07, yOut - 0.42, z0 + depth + 0.24, { colour: CANOPY_WOOD, decor: true, fine: true });
    }
    // the station bell on its bracket beside the main door
    sink.member('structureMetal', facePoint(pf, 1.6, 3.6, 0), facePoint(pf, 1.6, 3.6, 0.55), 0.05, 0.05, [1, 0, 0], { colour: IRON, decor: true, exposed: true }, 0.025);
    bell(sink, facePoint(pf, 1.6, 0, 0.55)[0], 3.5, facePoint(pf, 1.6, 0, 0.55)[2], 0.17);
  }
  // ---- the platform: a low brick-edged deck along the track side (no collision: a hull rolls up it like a kerb)
  const PL = Math.max(L, canopyL) / 2 + 2, pz0 = D / 2 - 0.1, pz1 = D / 2 + 5.0;
  sink.span(trim, -PL, -0.4, pz0, PL, 0.3, pz1, { decor: true });
  sink.span('stone', -PL, 0.3, pz1 - 0.35, PL, 0.34, pz1, { decor: true });
  return {
    parts: sink.finish(),
    tints: { plaster: [0.94, 0.93, 0.9], stone: [1.02, 0.98, 0.95] },
    destructibles: [
      { kind: 'bench', x: -Wc / 2 - 2.6, z: D / 2 + 1.2, yawDeg: 0 },
      { kind: 'bench', x: Wc / 2 + 2.6, z: D / 2 + 1.2, yawDeg: 0 },
    ],
  };
};

/** A face's own frame for boxes set on it (u across, y up, out). */
function frameOf(face: Face) {
  return new LocalFrame(face.u, [0, 1, 0], face.out, [0, 0, 0]);
}
