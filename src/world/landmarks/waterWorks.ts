// waterWorks.ts — props census #3 (lane B, 2026-10-14): the water tower and the valve tower moved here as they were from towers.ts, the industrial yard's
// src/world/landmarks/towers.ts — the towers (the landmarks lane, 2026-10-05): the water tower (a railway's octagonal
// brick shaft under its timber tank house, the Soviet steel Rozhnovsky tower, a timber trestle tank), the windmills
// (the Kursk governorate's post mill and smock mill, the Dutch brick tower mill with its stage), the free-standing
// belfry, the Dalmatian campanile, the fire lookout and a reservoir's valve tower with its footbridge. Sizes from the
// type: a railway water tower of the 1880s stands 16-20 m, a smock mill's cap 10-12 m with sails of 9-10 m, a campanile
// 25-45 m, the Roer dams' valve towers 15-20 m over the water.
import { LocalFrame, PartSink, facePoint, rgb, shade, type Face, type Rgb } from '../maps/regional/geometry.ts';
import { archSurround, archWindow, archedSlab, bar, prismBody, revolve, type ArchHole } from './kit.ts';
import type { LandmarkBuilder } from './types.ts';
import { finishLandmark, piece } from './pieces.ts';

const IRON_RED = rgb(0x7a3b2e), IRON_GREEN = rgb(0x4f7d5a), FRAME_WHITE = rgb(0xe8e4da);
const BOARD_OCHRE = rgb(0xb59a62), TIMBER = rgb(0x6a5440), TIMBER_DARK = rgb(0x4a3b2e);
const STEEL_GREY = rgb(0x8a9196), IRON = rgb(0x2b2d2e);

const uvOffset = (rng: () => number): [number, number] => [rng() * 7.31, rng() * 5.17];
const OCT = Math.PI / 8;

/** A door leaf on a face (boarded), flush in a shallow reveal. */
function plankDoor(sink: PartSink, face: Face, u: number, y0: number, w: number, h: number, colour: Rgb, o = -0.12): void {
  sink.quad('structureWood', facePoint(face, u - w / 2, y0, o), facePoint(face, u + w / 2, y0, o), facePoint(face, u + w / 2, y0 + h, o),
    facePoint(face, u - w / 2, y0 + h, o), { colour, decor: true });
}

// ---------------------------------------------------------------------------------------------------------- water tower

/**
 * The railway water tower (a Russian line's standard tower of the 1870s-1900s): an octagonal brick shaft with segmental
 * windows and a corbelled cornice, the boarded tank house overhanging it on brackets, an octagonal tent roof with a
 * vent lantern. 'rozhnovsky' is the Soviet steel tower (a riveted shaft carrying a cylindrical tank under a cone);
 * 'trestle' a timber tank on four braced legs.
 */
/**
 * The railway water tower (a Russian line's standard tower of the 1870s-1900s): an octagonal brick shaft with segmental
 * windows and a corbelled cornice, the boarded tank house overhanging it on brackets, an octagonal tent roof with a
 * vent lantern. 'rozhnovsky' is the Soviet steel tower (a riveted shaft carrying a cylindrical tank under a cone);
 * 'trestle' a timber tank on four braced legs.
 */
export const waterTower: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const H = Math.max(10, Number(ctx.params.height)), style = String(ctx.params.style);
  const base = -0.6 - ctx.groundFall;
  if (style === 'rozhnovsky') {
    const tankY = H - 5.2;
    revolve(sink, 'stone', 0, 0, [[1.7, base], [1.7, 0.4], [1.25, 0.4]], 12);
    revolve(sink, 'structureMetal', 0, 0, [[1.05, 0.4], [1.05, tankY], [3.0, tankY + 0.6], [3.0, tankY + 4.2], [1.4, tankY + 5.0], [0.3, tankY + 5.25], [0, tankY + 5.3]],
      16, { colour: STEEL_GREY });
    // the ladder up the shaft and the gallery round the tank's foot
    for (const dx of [-0.22, 0.22]) sink.span('structureMetal', dx - 0.025, 0.4, 1.05, dx + 0.025, tankY + 0.6, 1.1, { colour: IRON, decor: true, fine: true });
    for (let y = 0.8; y < tankY; y += 0.35) sink.span('structureMetal', -0.22, y, 1.06, 0.22, y + 0.03, 1.1, { colour: IRON, decor: true, fine: true });
    plankDoor(sink, { origin: [0, 0, 1.06], u: [1, 0, 0], out: [0, 0, 1], width: 1 }, 0, 0.4, 0.8, 1.9, IRON, 0.01);
    return { parts: sink.finish() };
  }
  if (style === 'trestle') {
    const legH = H - 5, half = 2.2;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      sink.span('stone', sx * half - 0.4, base, sz * half - 0.4, sx * half + 0.4, 0.5, sz * half + 0.4);
      bar(sink, 'structureWood', [sx * half, 0.5, sz * half], [sx * half * 0.72, legH, sz * half * 0.72], 0.3, { colour: TIMBER_DARK });
    }
    for (let k = 0; k < 3; k++) {
      const y0 = 0.5 + k * (legH - 0.5) / 3, y1 = 0.5 + (k + 1) * (legH - 0.5) / 3;
      const h0 = half * (1 - 0.28 * (y0 - 0.5) / legH), h1 = half * (1 - 0.28 * (y1 - 0.5) / legH);
      for (const [ax, az, bx, bz] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]]) {
        bar(sink, 'structureWood', [ax * h0, y0, az * h0], [bx * h1, y1, bz * h1], 0.12, { colour: TIMBER, decor: true });
        bar(sink, 'structureWood', [ax * h1, y1, az * h1], [bx * h1, y1, bz * h1], 0.16, { colour: TIMBER, decor: true });
      }
    }
    sink.span('structureWood', -half * 0.85, legH, -half * 0.85, half * 0.85, legH + 0.3, half * 0.85, { colour: TIMBER_DARK });
    revolve(sink, 'structureWood', 0, 0, [[2.9, legH + 0.3], [2.9, legH + 3.6], [3.1, legH + 3.6], [0.2, legH + 5.0], [0, legH + 5.05]], 16, { colour: TIMBER });
    for (let k = 0; k < 4; k++) revolve(sink, 'structureMetal', 0, 0, [[2.94, legH + 0.6 + k * 0.85], [2.94, legH + 0.7 + k * 0.85]], 16, { colour: IRON, decor: true });
    return { parts: sink.finish() };
  }
  // the railway tower
  const rShaft = 3.4, shaftTop = Math.max(7, H * 0.58), houseTop = shaftTop + Math.max(3.2, H * 0.22);
  revolve(sink, 'plaster', 0, 0, [[(rShaft + 0.25) / Math.cos(OCT), base], [(rShaft + 0.25) / Math.cos(OCT), 0.7], [(rShaft) / Math.cos(OCT), 0.7]], 8, {}, OCT);
  const door: ArchHole = { u: 0, w: 1.3, y0: 0.7, spring: 2.8, form: 'segmental', rise: 0.3 };
  const low = (): ArchHole => ({ u: 0, w: 0.8, y0: 2.9, spring: 4.4, form: 'segmental', rise: 0.2 });
  const high = (): ArchHole => ({ u: 0, w: 0.7, y0: shaftTop - 3.2, spring: shaftTop - 2.0, form: 'round' });
  const holes: Record<number, ArchHole[]> = { 0: [door, high()], 2: [low(), high()], 4: [low(), high()], 6: [low(), high()], 1: [high()], 3: [high()], 5: [high()], 7: [high()] };
  const faces = prismBody(sink, 'stone', 0, 0, rShaft, 8, 0.7, shaftTop, holes, 0.36);
  faces.forEach((face, i) => {
    for (const h of holes[i] ?? []) {
      if (h === door) {
        plankDoor(sink, face, 0, h.y0, h.w, h.spring - h.y0 + 0.25, TIMBER_DARK, -0.34);
        archSurround(sink, 'plaster', face, h, 0.16, 0.05, { sill: false });
      } else {
        archWindow(sink, face, h, 0.36, FRAME_WHITE, false, { bars: true });
        archSurround(sink, 'plaster', face, h, 0.12, 0.04);
      }
    }
  });
  // the string course and the corbelled cornice the tank house bears on
  const ring = (r: number) => r / Math.cos(OCT);
  revolve(sink, 'plaster', 0, 0, [[ring(rShaft + 0.04), shaftTop * 0.48], [ring(rShaft + 0.1), shaftTop * 0.48 + 0.04], [ring(rShaft + 0.1), shaftTop * 0.48 + 0.24],
    [ring(rShaft + 0.04), shaftTop * 0.48 + 0.28]], 8, { decor: true }, OCT);
  revolve(sink, 'stone', 0, 0, [[ring(rShaft), shaftTop - 0.02], [ring(rShaft + 0.15), shaftTop - 0.02], [ring(rShaft + 0.15), shaftTop + 0.16],
    [ring(rShaft + 0.32), shaftTop + 0.16], [ring(rShaft + 0.32), shaftTop + 0.34], [ring(rShaft + 0.5), shaftTop + 0.34], [ring(rShaft + 0.5), shaftTop + 0.5],
    [ring(rShaft), shaftTop + 0.5]], 8, {}, OCT);
  // the tank house: vertical boards painted ochre, a band of small windows, a slatted vent under the eaves
  const rHouse = rShaft + 0.7, houseFloor = shaftTop + 0.5;
  const tf = prismBody(sink, 'structureWood', 0, 0, rHouse, 8, houseFloor, houseTop, {}, 0, { colour: BOARD_OCHRE });
  // (the floor's underside, facing down: it is the overhang a man at the foot of the tower looks up into — it faced up
  // until 2026-10-06, and the house showed its inside from below)
  sink.polygon('structureWood', tf.map((f) => facePoint(f, -f.width / 2, houseFloor)).reverse(), { colour: shade(BOARD_OCHRE, 0.6) });
  tf.forEach((f, i) => {
    // the boards' battens and a small window on every other facet
    for (let k = -2; k <= 2; k++) {
      sink.box('structureWood', facePoint(f, k * f.width / 5, (houseFloor + houseTop) / 2, 0.03), [0.035, (houseTop - houseFloor) / 2, 0.03],
        { colour: shade(BOARD_OCHRE, 0.82), decor: true, fine: true }, new LocalFrame(f.u, [0, 1, 0], f.out, [0, 0, 0]), { nz: true });
    }
    if (i % 2 === 0) {
      const y = houseFloor + (houseTop - houseFloor) * 0.45;
      sink.quad('glass', facePoint(f, -0.35, y, 0.02), facePoint(f, 0.35, y, 0.02), facePoint(f, 0.35, y + 0.7, 0.02), facePoint(f, -0.35, y + 0.7, 0.02),
        { decor: true, window: f.out });
      sink.box('structureWood', facePoint(f, 0, y + 0.35, 0.04), [0.42, 0.42, 0.02], { colour: FRAME_WHITE, decor: true, fine: true },
        new LocalFrame(f.u, [0, 1, 0], f.out, [0, 0, 0]), { nz: true });
    }
    // the brackets under the overhang
    for (const du of [-0.3, 0.3]) {
      const a = facePoint(f, du * f.width, shaftTop - 0.6, -0.7), b = facePoint(f, du * f.width, houseFloor, 0.02);
      sink.member('structureWood', a, b, 0.12, 0.12, [f.u[0], 0, f.u[2]], { colour: TIMBER_DARK, decor: true, exposed: true }, 0.06);
    }
  });
  // the tent roof, its eaves over the house, and the vent lantern with its cap
  const eaveR = ring(rHouse + 0.45), roofTop = houseTop + Math.max(2.2, H - houseTop - 1.2);
  revolve(sink, 'structureMetal', 0, 0, [[eaveR, houseTop - 0.1], [eaveR * 0.94, houseTop + 0.05], [0.65, roofTop - 0.6], [0.6, roofTop - 0.6]], 8, { colour: IRON_RED }, OCT);
  revolve(sink, 'structureWood', 0, 0, [[0.55, roofTop - 0.62], [0.55, roofTop + 0.15]], 8, { colour: BOARD_OCHRE }, OCT);
  revolve(sink, 'structureMetal', 0, 0, [[0.8, roofTop + 0.15], [0.05, roofTop + 0.8], [0, roofTop + 0.82]], 8, { colour: IRON_RED }, OCT);
  sink.span('structureMetal', -0.025, roofTop + 0.8, -0.025, 0.025, roofTop + 1.5, 0.025, { colour: IRON, decor: true });
  return { parts: sink.finish(), tints: { stone: [1.02, 0.97, 0.94], plaster: [0.95, 0.94, 0.9] } };
};

// ---------------------------------------------------------------------------------------------------------- valve tower

/**
 * A reservoir's valve tower (the Roer dams' Schieberturm, the Urft's of 1905): a round masonry tower standing in the
 * water, battered at its foot; its valve chamber a storey over the bridge's floor, round-headed windows under a
 * corbelled cornice, a slated bell roof and its finial; reached from the bank by an arched masonry footbridge at the
 * chamber's floor, its parapets coped, a string course along its spandrels. The frame: the whole piece along z, centred
 * — the tower's axis at (bridge - radius) / 2, the bridge's bank end at -(bridge + radius) / 2; y = 0 the lowest ground
 * under it (the water's bed); the bridge's floor meets the bank at its end (ctx.ground), 2.6 m over the water at least.
 */
export const valveTower: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const R = Math.max(3, Number(ctx.params.radius)), L = Math.max(R + 8, Number(ctx.params.bridge));
  const W = Math.max(2.4, Number(ctx.params.width)), C = Math.max(3.6, Number(ctx.params.chamber));
  const ground = (lx: number, lz: number) => (ctx.ground ? ctx.ground(lx, lz) : 0);
  const zT = (L - R) / 2, zS = -(L + R) / 2, bed = -0.8;
  const deckY = Math.max(2.6, ground(0, zS) + 0.05), N = 20, phase = Math.PI / N, facet = Math.cos(Math.PI / N);
  // ---- the tower: the battered foot, the shaft, the string course at the bridge's floor, the valve chamber
  revolve(sink, 'stone', 0, zT, [[R + 0.7, bed], [R + 0.7, 0.9], [R + 0.25, 2.1], [R, 2.4], [R, deckY - 0.35]], N, {}, phase);
  revolve(sink, 'stone', 0, zT, [[R, deckY - 0.35], [R + 0.22, deckY - 0.35], [R + 0.22, deckY - 0.05], [R, deckY - 0.05]], N, { decor: true }, phase);
  const top = deckY + C, rTop = R - 0.12;
  revolve(sink, 'stone', 0, zT, [[R, deckY - 0.05], [rTop, top]], N, {}, phase);
  // the windows round the chamber (none on the bridge's side), the door at the bridge's end
  const face = (a: number, r: number): Face => ({ origin: [Math.sin(a) * r, 0, zT + Math.cos(a) * r], u: [Math.cos(a), 0, -Math.sin(a)],
    out: [Math.sin(a), 0, Math.cos(a)], width: 1 });
  for (let k = -2; k <= 2; k++) {
    // on facet centres (every 18 degrees), the five round the side away from the bridge (at 180 degrees: the door's)
    const a = k * (Math.PI * 2 / 5), rw = (R + (rTop - R) * 0.45) * facet + 0.02;
    const win: ArchHole = { u: 0, w: 0.95, y0: deckY + C * 0.3, spring: deckY + C * 0.62, form: 'round' };
    archWindow(sink, face(a, rw), win, 0, FRAME_WHITE, false, { coarse: true });
    archSurround(sink, 'stone', face(a, rw), win, 0.2, 0.07);
  }
  plankDoor(sink, face(Math.PI, R * facet + 0.02), 0, deckY, 1.3, 2.4, IRON_GREEN, 0.03);
  // the corbelled cornice and the slated bell roof with its finial
  revolve(sink, 'stone', 0, zT, [[rTop, top], [rTop + 0.38, top + 0.3], [rTop + 0.38, top + 0.62], [rTop - 0.05, top + 0.66]], N, {}, phase);
  const roofY = top + 0.62, rr = rTop + 0.55;
  revolve(sink, 'roof', 0, zT, [[rr, roofY], [rr * 0.9, roofY + 0.55], [rr * 0.62, roofY + R * 0.55], [rr * 0.3, roofY + R * 1.05], [0.22, roofY + R * 1.38],
    [0, roofY + R * 1.42]], N, {}, phase);
  const fy = roofY + R * 1.38;
  // (the finial comes off at the first damage: props lane A, E12)
  piece(sink, { name: 'finial', kind: 'detach', at: 'damaged', fall: 'drop' }, (s) =>
    revolve(s, 'structureMetal', 0, zT, [[0.12, fy], [0.3, fy + 0.35], [0.12, fy + 0.7], [0.05, fy + 1.6], [0.0, fy + 1.8]], 8, { colour: IRON, decor: true }));
  // ---- the footbridge: an arched masonry slab from the bank to the tower's door, its parapets, the string course
  const zFace = zT - R + 0.3, Lb = zFace - zS, zMid = (zS + zFace) / 2;
  const n = Math.max(2, Math.round(Lb / 8.5)), pier = 1.8, A = (Lb - (n + 1) * pier) / n;
  const spring = Math.max(bed + 1.2, deckY - 1.15 - A / 2);
  const holes: ArchHole[] = Array.from({ length: n }, (_, i) => ({ u: -Lb / 2 + pier + A / 2 + i * (A + pier), w: A, y0: bed, spring,
    form: 'round' as const }));
  sink.placed(-Math.PI / 2, 0, 0, zMid, () => archedSlab(sink, 'stone', -Lb / 2, Lb / 2, bed, deckY, W, holes, { ends: true, top: true }));
  for (const sx of [-1, 1]) {
    const x0 = sx > 0 ? W / 2 - 0.36 : -W / 2;
    sink.span('stone', x0, deckY, zS, x0 + 0.36, deckY + 1.0, zFace);
    sink.span('stone', x0 - 0.06, deckY + 1.0, zS, x0 + 0.42, deckY + 1.12, zFace, { decor: true });
    sink.span('stone', sx > 0 ? W / 2 : -W / 2 - 0.12, deckY - 0.45, zS, sx > 0 ? W / 2 + 0.12 : -W / 2, deckY - 0.3, zFace, { decor: true });
  }
  // the abutment at the bank (gauntlet wave 158: "the footbridge simply ends at a grassy mound with no dam or
  // abutment"): the deck's end carried on a dressed block a metre into the bank and down to the bed, a little wider than
  // the deck, coped, with the parapets' end piers over it — inside the footprint the piece always had, so the ground it
  // reserves (and every scatter placement round it) is the same
  const abut = 1.0;
  sink.span('stone', -W / 2 - 0.45, bed, zS - abut, W / 2 + 0.45, deckY - 0.02, zS + 0.05);
  sink.span('stone', -W / 2 - 0.55, deckY - 0.02, zS - abut - 0.08, W / 2 + 0.55, deckY + 0.12, zS + 0.12, { decor: true });
  for (const sx of [-1, 1]) {
    sink.span('stone', sx > 0 ? W / 2 - 0.45 : -W / 2 - 0.05, deckY, zS - 0.75, sx > 0 ? W / 2 + 0.05 : -W / 2 + 0.45, deckY + 1.35, zS + 0.1);
  }
  return { parts: finishLandmark(sink) };
};

// ---------------------------------------------------------------------------------------------------------- windmills

