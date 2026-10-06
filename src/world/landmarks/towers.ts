// src/world/landmarks/towers.ts — the towers (the landmarks lane, 2026-10-05): the water tower (a railway's octagonal
// brick shaft under its timber tank house, the Soviet steel Rozhnovsky tower, a timber trestle tank), the windmills
// (the Kursk governorate's post mill and smock mill, the Dutch brick tower mill with its stage), the free-standing
// belfry, the Dalmatian campanile, the fire lookout and a reservoir's valve tower with its footbridge. Sizes from the
// type: a railway water tower of the 1880s stands 16-20 m, a smock mill's cap 10-12 m with sails of 9-10 m, a campanile
// 25-45 m, the Roer dams' valve towers 15-20 m over the water.
import { LocalFrame, PartSink, facePoint, rgb, shade, type Face, type RegionalBucket, type Rgb, type Vec3 } from '../maps/regional/geometry.ts';
import { emitRoof, roofGeometry, type RoofSpec } from '../maps/regional/house.ts';
import {
  archSurround, archWindow, archedBody, archedSlab, bar, cornerPilasters, cross, dome, drum, moulding, prismBody, railing, revolve, smoothRender, tentRoof,
  type ArchHole, LIMEWASH_UV } from './kit.ts';
import type { LandmarkBuilder } from './types.ts';

const IRON_RED = rgb(0x7a3b2e), IRON_GREEN = rgb(0x4f7d5a), GILT = rgb(0xb8933e), FRAME_WHITE = rgb(0xe8e4da);
const BOARD_OCHRE = rgb(0xb59a62), BOARD_GREY = rgb(0x7d7466), TIMBER = rgb(0x6a5440), TIMBER_DARK = rgb(0x4a3b2e);
const STEEL_GREY = rgb(0x8a9196), CANVAS = rgb(0xd9d0bc), BELL = rgb(0x5a4a32), IRON = rgb(0x2b2d2e);

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
  sink.polygon('structureWood', tf.map((f) => facePoint(f, -f.width / 2, houseFloor)), { colour: shade(BOARD_OCHRE, 0.6) });
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
    archWindow(sink, face(a, rw), win, 0, FRAME_WHITE, false);
    archSurround(sink, 'stone', face(a, rw), win, 0.2, 0.07);
  }
  plankDoor(sink, face(Math.PI, R * facet + 0.02), 0, deckY, 1.3, 2.4, IRON_GREEN, 0.03);
  // the corbelled cornice and the slated bell roof with its finial
  revolve(sink, 'stone', 0, zT, [[rTop, top], [rTop + 0.38, top + 0.3], [rTop + 0.38, top + 0.62], [rTop - 0.05, top + 0.66]], N, {}, phase);
  const roofY = top + 0.62, rr = rTop + 0.55;
  revolve(sink, 'roof', 0, zT, [[rr, roofY], [rr * 0.9, roofY + 0.55], [rr * 0.62, roofY + R * 0.55], [rr * 0.3, roofY + R * 1.05], [0.22, roofY + R * 1.38],
    [0, roofY + R * 1.42]], N, {}, phase);
  const fy = roofY + R * 1.38;
  revolve(sink, 'structureMetal', 0, zT, [[0.12, fy], [0.3, fy + 0.35], [0.12, fy + 0.7], [0.05, fy + 1.6], [0.0, fy + 1.8]], 8, { colour: IRON, decor: true });
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
  return { parts: sink.finish() };
};

// ---------------------------------------------------------------------------------------------------------- windmills

/** Four lattice sails on a hub at (0, y, z) in the x-y plane (the sails face +z), turned `turn` radians. */
function sails(sink: PartSink, y: number, z: number, length: number, width: number, turn: number, colour: Rgb, cloth: number): void {
  const opts = { colour, decor: true, exposed: true };
  for (let k = 0; k < 4; k++) {
    const a = turn + k * Math.PI / 2, ca = Math.cos(a), sa = Math.sin(a);
    const tip: Vec3 = [ca * length, y + sa * length, z];
    sink.member('structureWood', [0, y, z], tip, 0.26, 0.2, [0, 0, 1], opts, 0.1);
    // the sail frame trailing the whip: its outer edge and the bars across
    const px = -sa, py = ca;
    const inner = length * 0.2;
    const a0: Vec3 = [ca * inner + px * width, y + sa * inner + py * width, z + 0.05], a1: Vec3 = [ca * length + px * width, y + sa * length + py * width, z + 0.05];
    sink.member('structureWood', a0, a1, 0.1, 0.08, [0, 0, 1], { ...opts }, 0.04);
    const bars = Math.round((length - inner) / 0.55);
    for (let b = 0; b <= bars; b++) {
      const r = inner + (length - inner) * b / bars;
      sink.member('structureWood', [ca * r, y + sa * r, z + 0.05], [ca * r + px * width, y + sa * r + py * width, z + 0.05], 0.06, 0.05, [0, 0, 1],
        { ...opts, fine: b % 2 === 1 }, 0.025);
    }
    // canvas spread on part of the frame (a mill at work), or bare lattice
    if (cloth > 0) {
      const r0 = inner + 0.2, r1 = inner + (length - inner) * cloth;
      sink.quad('structureWood', [ca * r0 + px * 0.12, y + sa * r0 + py * 0.12, z + 0.03], [ca * r1 + px * 0.12, y + sa * r1 + py * 0.12, z + 0.03],
        [ca * r1 + px * (width - 0.06), y + sa * r1 + py * (width - 0.06), z + 0.03], [ca * r0 + px * (width - 0.06), y + sa * r0 + py * (width - 0.06), z + 0.03],
        { colour: CANVAS, decor: true });
      sink.quad('structureWood', [ca * r0 + px * (width - 0.06), y + sa * r0 + py * (width - 0.06), z + 0.025], [ca * r1 + px * (width - 0.06), y + sa * r1 + py * (width - 0.06), z + 0.025],
        [ca * r1 + px * 0.12, y + sa * r1 + py * 0.12, z + 0.025], [ca * r0 + px * 0.12, y + sa * r0 + py * 0.12, z + 0.025], { colour: shade(CANVAS, 0.8), decor: true });
    }
  }
}

/**
 * The windmill: 'post' — the Kursk governorate's stolbovka, a boarded body on its post and trestle turned to the wind by
 * the tail pole, its ladder to the door; 'smock' — the shatrovka (a Dutch achtkant), a tapering boarded octagon on a
 * brick base under a turning cap; 'tower' — the Low Countries' brick tower mill with its stage and thatched cap.
 */
export const windmill: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const style = String(ctx.params.style), H = Math.max(9, Number(ctx.params.height));
  const base = -0.6 - ctx.groundFall;
  const turn = ctx.variant() * Math.PI / 2;
  const cloth = ctx.variant() < 0.5 ? 0 : 0.35 + ctx.variant() * 0.5;
  if (style === 'post') {
    const bw = 3.8, bd = 4.6, bh = 5.0, lift = Math.max(3.2, H - bh - 1.8);
    for (const [x, z] of [[-2.6, 0], [2.6, 0], [0, -2.6], [0, 2.6]] as const) sink.span('stone', x - 0.42, base, z - 0.42, x + 0.42, 0.55, z + 0.42);
    sink.span('structureWood', -2.8, 0.55, -0.2, 2.8, 0.95, 0.2, { colour: TIMBER_DARK });
    sink.span('structureWood', -0.2, 0.55, -2.8, 0.2, 0.95, 2.8, { colour: TIMBER_DARK });
    revolve(sink, 'structureWood', 0, 0, [[0.3, 0.55], [0.26, lift]], 8, { colour: TIMBER_DARK });
    for (const [x, z] of [[-2.4, 0], [2.4, 0], [0, -2.4], [0, 2.4]] as const) bar(sink, 'structureWood', [x, 0.95, z], [x * 0.07, lift - 0.6, z * 0.07], 0.2, { colour: TIMBER_DARK });
    // the body: boards, a gable roof, the door at the back up the ladder
    const roof: RoofSpec = { kind: 'gable', pitchDeg: 38, eave: 0.25, verge: 0.3, thickness: 0.1, bucket: 'roof', ridge: 'saddle' };
    sink.placed(0, 0, lift, 0, () => {
      const f = archedBody(sink, 'structureWood', 0, 0, bw, bd, 0, bh, {}, 0, { colour: BOARD_GREY });
      emitRoof(sink, roofGeometry(bw, bd, bh, roof), roof);
      plankDoor(sink, f.back, 0, 0.1, 0.9, 1.8, TIMBER_DARK, 0.02);
      for (let k = -3; k <= 3; k++) {
        for (const name of ['left', 'right'] as const) {
          sink.box('structureWood', facePoint(f[name], k * bd / 7, bh / 2, 0.03), [0.03, bh / 2, 0.03], { colour: shade(BOARD_GREY, 0.8), decor: true, fine: true },
            new LocalFrame(f[name].u, [0, 1, 0], f[name].out, [0, 0, 0]), { nz: true });
        }
      }
    });
    const hubY = lift + bh * 0.8, hubZ = bd / 2 + 0.7;
    sink.member('structureWood', [0, hubY - 0.1, bd / 2 - 0.5], [0, hubY + 0.05, hubZ], 0.34, 0.34, [1, 0, 0], { colour: TIMBER_DARK, exposed: true }, 0.17);
    sails(sink, hubY, hubZ, Math.min(9.5, hubY - 0.8), 1.15, turn, TIMBER, cloth);
    // the tail pole to the ground and the ladder up to the door
    bar(sink, 'structureWood', [0, lift + 0.3, -bd / 2], [0, 0.5, -bd / 2 - 5.2], 0.22, { colour: TIMBER_DARK, decor: true });
    for (const sx of [-0.5, 0.5]) bar(sink, 'structureWood', [sx, lift, -bd / 2 - 0.1], [sx, 0.1, -bd / 2 - 3.0], 0.12, { colour: TIMBER_DARK, decor: true });
    for (let k = 1; k < 9; k++) {
      const t = k / 9, y = lift * (1 - t) + 0.1 * t, z = -bd / 2 - 0.1 - 2.9 * t;
      sink.span('structureWood', -0.5, y - 0.03, z - 0.08, 0.5, y + 0.03, z + 0.08, { colour: TIMBER, decor: true, fine: true });
    }
    return { parts: sink.finish() };
  }
  const tower = style === 'tower';
  // the base: brick (an octagonal plinth storey for the smock mill, the round tower itself for a tower mill)
  const r0 = tower ? 4.3 : 4.0, capY = H - 2.2;
  // the tower mill's sails (their span with the tower's height) and its stage (stelling) low enough that the lowest
  // sail tip sweeps clear over the stage's railing (1.7 m: the railing and the miller's reach to set the cloth)
  const sailLen = tower ? Math.min(11.5, capY * 0.6) : 0, towerR = (y: number) => r0 - 0.26 * r0 * Math.max(0, y - 0.6) / (capY - 0.6);
  if (tower) {
    // (a facet, not a corner, to the front and to each quarter: the door and the windows sit flat on the brick)
    revolve(sink, 'stone', 0, 0, [[r0 + 0.2, base], [r0 + 0.2, 0.6], [r0, 0.6], [r0 * 0.74, capY]], 16, {}, Math.PI / 16);
    // the stage (stelling) round the tower at a third of its height, its railing and the struts under it
    const sy = Math.min(capY * 0.42, capY + 1.3 - sailLen - 1.7), rs = r0 * (1 - 0.26 * sy / capY) + 2.2;
    // the deck: its soffit, its edge and its boards (a closed ring round the tower)
    revolve(sink, 'structureWood', 0, 0, [[0.5, sy], [rs, sy], [rs, sy + 0.18], [0.5, sy + 0.18]], 16, { colour: TIMBER });
    for (let k = 0; k < 8; k++) {
      const a = k / 8 * Math.PI * 2, ca = Math.cos(a), sa = Math.sin(a), rr = r0 * (1 - 0.26 * (sy - 2.2) / capY);
      bar(sink, 'structureWood', [ca * rr, sy - 2.2, sa * rr], [ca * (rs - 0.2), sy, sa * (rs - 0.2)], 0.14, { colour: TIMBER_DARK, decor: true });
      const b = (k + 1) / 8 * Math.PI * 2;
      railing(sink, [Math.cos(a) * rs, Math.sin(a) * rs], [Math.cos(b) * rs, Math.sin(b) * rs], 0.95, TIMBER_DARK, { pitch: 1.8, base: sy + 0.18 });
    }
    for (const a of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      // (each on the tapering wall at its own height, the 16-sided tower's facet a little inside its corner radius)
      const rw = towerR(capY * 0.62 + 0.6) * Math.cos(Math.PI / 16) + 0.02;
      const f: Face = { origin: [Math.sin(a) * rw, 0, Math.cos(a) * rw], u: [Math.cos(a), 0, -Math.sin(a)], out: [Math.sin(a), 0, Math.cos(a)], width: 1 };
      archWindow(sink, f, { u: 0, w: 0.7, y0: capY * 0.62, spring: capY * 0.62 + 1.0, form: 'segmental', rise: 0.18 }, 0, FRAME_WHITE, false, { bars: false });
    }
    plankDoor(sink, { origin: [0, 0, towerR(1.6) * Math.cos(Math.PI / 16) + 0.02], u: [1, 0, 0], out: [0, 0, 1], width: 1 }, 0, 0.6, 1.1, 2.1, IRON_GREEN, 0.02);
  } else {
    revolve(sink, 'stone', 0, 0, [[r0 / Math.cos(OCT), base], [r0 / Math.cos(OCT), 1.6], [(r0 - 0.15) / Math.cos(OCT), 1.6]], 8, {}, OCT);
    const body = ctx.mapId === 'polders' ? 'straw' : 'structureWood';
    revolve(sink, body, 0, 0, [[(r0 - 0.15) / Math.cos(OCT), 1.6], [2.0 / Math.cos(OCT), capY]], 8, body === 'straw' ? {} : { colour: BOARD_GREY }, OCT);
    plankDoor(sink, { origin: [0, 0, r0 - 0.1], u: [1, 0, 0], out: [0, 0, 1], width: 1 }, 0, 0.3, 1.0, 1.25, TIMBER_DARK, 0.02);
    for (const a of [Math.PI / 4, Math.PI * 1.25]) {
      const rr = (r0 - 0.15) + (2.0 - (r0 - 0.15)) * 0.45;
      const f: Face = { origin: [Math.sin(a) * (rr + 0.02), 0, Math.cos(a) * (rr + 0.02)], u: [Math.cos(a), 0, -Math.sin(a)], out: [Math.sin(a), 0, Math.cos(a)], width: 1 };
      sink.quad('glass', facePoint(f, -0.3, capY * 0.5, 0), facePoint(f, 0.3, capY * 0.5, 0), facePoint(f, 0.3, capY * 0.5 + 0.6, 0), facePoint(f, -0.3, capY * 0.5 + 0.6, 0),
        { decor: true });
    }
  }
  // the cap: a boat-shaped gable turning on the curb, the windshaft out of its breast, the sails, the tail
  const capW = tower ? 4.8 : 4.4, capD = tower ? 6.0 : 5.4;
  sink.span('structureWood', -capW / 2 + 0.2, capY - 0.1, -capD / 2 + 0.3, capW / 2 - 0.2, capY + 0.2, capD / 2 - 0.3, { colour: TIMBER_DARK });
  const capRoof: RoofSpec = { kind: tower ? 'hip' : 'gable', pitchDeg: tower ? 55 : 48, eave: 0.25, verge: 0.3, thickness: 0.12,
    bucket: tower ? 'straw' : 'roof', ridge: tower ? 'round' : 'saddle' };
  const rg = roofGeometry(capW, capD, capY + 0.2, capRoof);
  emitRoof(sink, rg, capRoof);
  if (!tower && rg.gable) {
    for (const end of [1, -1]) {
      const f: Face = { origin: [0, 0, end * capD / 2], u: [end, 0, 0], out: [0, 0, end], width: capW };
      sink.prism('structureWood', rg.gable.map(([u, y]) => facePoint(f, u, y, 0)).reverse() as Vec3[], [-f.out[0], 0, -f.out[2]], 0.2, { colour: BOARD_GREY });
    }
  }
  const hubY = capY + 1.3, hubZ = capD / 2 + 0.8;
  sink.member('structureWood', [0, hubY - 0.15, capD / 2 - 0.8], [0, hubY, hubZ], 0.4, 0.4, [1, 0, 0], { colour: TIMBER_DARK, exposed: true }, 0.2);
  sails(sink, hubY, hubZ, tower ? sailLen : Math.min(10, hubY - 1.2), tower ? 1.45 : 1.2, turn, TIMBER, cloth);
  // the tail pole and its struts down from the cap's back, the capstan wheel at its foot (the miller turns the cap)
  const stageY = Math.min(capY * 0.42, capY + 1.3 - sailLen - 1.7);
  const footY = tower ? stageY + 0.9 : 0.9, footZ = tower ? -(towerR(stageY) + 1.6) : -(r0 + 3.6);
  bar(sink, 'structureWood', [0, capY + 0.1, -capD / 2 + 0.3], [0, footY, footZ], 0.24, { colour: TIMBER_DARK, decor: true });
  for (const sx of [-1, 1]) bar(sink, 'structureWood', [sx * capW * 0.4, capY + 0.05, -capD / 2 + 0.4], [0, footY + 2.2, footZ * 0.8], 0.14, { colour: TIMBER_DARK, decor: true });
  revolve(sink, 'structureWood', 0, footZ - 0.2, [[0.9, footY - 0.05], [0.9, footY + 0.05]], 10, { colour: TIMBER, decor: true });
  return { parts: sink.finish() };
};

// ---------------------------------------------------------------------------------------------------------- bell towers

/**
 * The free-standing belfry (a monastery's or a town square's bell tower): a square base with an arched passage or a
 * door, the open bell stage with its bells, an octagon, and a crown — an onion, a tent, a needle or a helm.
 */
export const belfry: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const H = Math.max(14, Number(ctx.params.height)), S = Math.max(4, Number(ctx.params.side)), crown = String(ctx.params.crown);
  const base = -0.6 - ctx.groundFall, wall: RegionalBucket = 'plaster';
  sink.span('stone', -S / 2 - 0.15, base, -S / 2 - 0.15, S / 2 + 0.15, 0.5, S / 2 + 0.15);
  const H1 = H * 0.36;
  const door: ArchHole = { u: 0, w: Math.min(2.2, S * 0.4), y0: 0.5, spring: Math.min(3.6, H1 - 1.5), form: 'round' };
  const win = (): ArchHole => ({ u: 0, w: 0.9, y0: H1 - 2.6, spring: H1 - 1.3, form: 'round' });
  const holes = { front: [door], back: [win()], left: [win()], right: [win()] };
  const f = archedBody(sink, wall, 0, 0, S, S, 0.5, H1, holes, 0.42);
  archSurround(sink, 'plaster', f.front, door, 0.28, 0.1);
  sink.quad('structureWood', facePoint(f.front, -door.w / 2, door.y0, -0.4), facePoint(f.front, door.w / 2, door.y0, -0.4),
    facePoint(f.front, door.w / 2, door.spring, -0.4), facePoint(f.front, -door.w / 2, door.spring, -0.4), { colour: TIMBER_DARK, decor: true });
  for (const name of ['back', 'left', 'right'] as const) for (const h of holes[name]) { archWindow(sink, f[name], h, 0.42, FRAME_WHITE, false); archSurround(sink, 'plaster', f[name], h, 0.14, 0.06); }
  moulding(sink, wall, S, S, H1 - 0.3, 0.3, 0.16);
  const S2 = S * 0.86, b0 = H1, b1 = H1 + Math.max(4, H * 0.22), t = 0.55;
  const spring = b1 - Math.min(2.2, S2 * 0.46) / 2 - 0.55;
  for (const [yaw, len] of [[0, S2], [Math.PI, S2], [Math.PI / 2, S2 - 2 * t], [-Math.PI / 2, S2 - 2 * t]] as const) {
    sink.placed(yaw, Math.sin(yaw) * (S2 / 2 - t / 2), 0, Math.cos(yaw) * (S2 / 2 - t / 2), () => archedSlab(sink, wall, -len / 2, len / 2, b0, b1, t,
      [{ u: 0, w: Math.min(2.2, len - 1.2), y0: b0 + 0.9, spring, form: 'round' }], { ends: true, top: true }));
  }
  sink.span(wall, -S2 / 2 + t, b0, -S2 / 2 + t, S2 / 2 - t, b0 + 0.2, S2 / 2 - t);
  revolve(sink, 'structureMetal', 0, 0, [[0.62, spring - 0.8], [0.56, spring - 0.6], [0.36, spring - 0.15], [0.25, spring + 0.2], [0, spring + 0.25]], 10, { colour: BELL, decor: true });
  sink.span('structureWood', -S2 / 2 + t, spring + 0.25, -0.09, S2 / 2 - t, spring + 0.43, 0.09, { colour: TIMBER_DARK, decor: true });
  moulding(sink, wall, S2, S2, b1 - 0.3, 0.3, 0.16);
  const R3 = S2 * 0.4;
  const top3 = drum(sink, wall, 0, b1, 0, R3, Math.max(1.8, H * 0.08), 8, { windows: 4 });
  if (crown === 'tent') {
    tentRoof(sink, 'structureMetal', 0, 0, R3 * 1.18, top3, Math.max(3, H - top3 - 2.4), 8, { colour: IRON_GREEN });
    const tip = H - 2.4;
    const head = dome(sink, 'structureMetal', 0, tip, 0, 0.45, 'onion', 10, { colour: GILT });
    cross(sink, 'structureMetal', 0, head - 0.05, 0, 1.5, 'orthodox', GILT);
  } else if (crown === 'spire' || crown === 'needle') {
    const cap = dome(sink, 'structureMetal', 0, top3, 0, R3, 'helm', 12, { colour: IRON_GREEN });
    revolve(sink, 'structureMetal', 0, 0, [[R3 * 0.22, cap - 0.2], [R3 * 0.04, H - 1.8], [0, H - 1.5]], 8, { colour: GILT });
    cross(sink, 'structureMetal', 0, H - 1.7, 0, 1.4, crown === 'needle' ? 'orthodox' : 'latin', GILT);
  } else {
    const neck = drum(sink, wall, 0, top3, 0, R3 * 0.6, 1.0, 10, {});
    const head = dome(sink, 'structureMetal', 0, neck, 0, R3 * 0.74, crown === 'helm' ? 'helm' : 'onion', 12, { colour: IRON_GREEN });
    cross(sink, 'structureMetal', 0, head - 0.05, 0, 1.6, 'orthodox', GILT);
  }
  return { parts: smoothRender(sink.finish(), LIMEWASH_UV), tints: { plaster: [1, 1, 0.99] } };
};

/**
 * The campanile (Dalmatia's and Istria's free-standing bell towers, Italy's): a slender square stone shaft divided into
 * stages by string courses, its corners stiffened by lesenes; its openings multiply as it rises, as on Rab's great
 * tower — slits at the foot, a monofora on each face of the middle stages, a bifora on each face of the top one —
 * then the open bell stage with paired round arches on a colonnette, a balustrade round the stone pyramid with a
 * pinnacle at each corner, the ball and the cross.
 */
export const campanile: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const H = Math.max(16, Number(ctx.params.height)), S = Math.max(3.6, Number(ctx.params.side));
  const base = -0.6 - ctx.groundFall;
  sink.span('stone', -S / 2 - 0.2, base, -S / 2 - 0.2, S / 2 + 0.2, 0.7, S / 2 + 0.2);
  const shaftTop = H * 0.68, bellTop = H * 0.82, stages = Math.max(3, Math.round(shaftTop / 6));
  const stageY = (k: number) => 0.7 + (shaftTop - 0.7) * k / stages;
  const slit = (y: number): ArchHole => ({ u: 0, w: 0.28, y0: y, spring: y + 1.1, form: 'round' });
  // the shaft stage by stage (archedFace cuts one row of openings a face): the door and a slit a face in the lowest, a
  // monofora a face in the middle ones, a bifora a face in the top one, each sill 1 m over its stage's string course
  type FaceHoles = Record<'front' | 'back' | 'left' | 'right', ArchHole[]>;
  let front: ReturnType<typeof archedBody> | null = null;
  for (let k = 0; k < stages; k++) {
    const y0 = stageY(k), y1 = stageY(k + 1);
    let holes: FaceHoles;
    if (k === 0) {
      const sy = Math.min(y1 - 1.6, y0 + (y1 - y0) * 0.55);
      holes = { front: [{ u: 0, w: 1.2, y0: 0.7, spring: 2.6, form: 'round' as const }], back: [slit(sy)], left: [slit(sy - 0.6)], right: [slit(sy + 0.4)] };
    } else {
      const last = k === stages - 1, wy0 = y0 + 1.0, h = Math.min(y1 - 0.9 - wy0, last ? 2.0 : 2.3);
      const w = last ? Math.min(0.55, S * 0.11) : Math.min(0.7, S * 0.14);
      const row = h < 1.2 ? [] : (last ? [-w / 2 - 0.12, w / 2 + 0.12] : [0]).map((u): ArchHole => ({ u, w, y0: wy0, spring: wy0 + h - w / 2, form: 'round' }));
      holes = { front: row, back: row, left: row, right: row };
    }
    const faces = archedBody(sink, 'stone', 0, 0, S, S, y0, y1, holes, 0.36);
    if (k === 0) front = faces;
  }
  const f = front!;
  sink.quad('structureWood', facePoint(f.front, -0.6, 0.7, -0.34), facePoint(f.front, 0.6, 0.7, -0.34), facePoint(f.front, 0.6, 2.6, -0.34),
    facePoint(f.front, -0.6, 2.6, -0.34), { colour: TIMBER_DARK, decor: true });
  for (let k = 1; k <= stages; k++) moulding(sink, 'stone', S, S, stageY(k) - 0.2, 0.2, 0.08);
  // the lesenes up the corners
  cornerPilasters(sink, 'stone', 0, 0, S, S, 0.7, shaftTop - 0.2, Math.min(0.55, S * 0.1), 0.07);
  // the bell stage: each face a bifora (two round arches on a colonnette)
  const t = 0.5;
  for (const [yaw, len] of [[0, S], [Math.PI, S], [Math.PI / 2, S - 2 * t], [-Math.PI / 2, S - 2 * t]] as const) {
    const w = (len - 1.4) / 2;
    sink.placed(yaw, Math.sin(yaw) * (S / 2 - t / 2), 0, Math.cos(yaw) * (S / 2 - t / 2), () => archedSlab(sink, 'stone', -len / 2, len / 2, shaftTop, bellTop, t,
      [{ u: -w / 2 - 0.2, w, y0: shaftTop + 0.6, spring: bellTop - w / 2 - 0.5, form: 'round' }, { u: w / 2 + 0.2, w, y0: shaftTop + 0.6, spring: bellTop - w / 2 - 0.5, form: 'round' }],
      { ends: true, top: true }));
  }
  sink.span('stone', -S / 2 + t, shaftTop, -S / 2 + t, S / 2 - t, shaftTop + 0.25, S / 2 - t);
  revolve(sink, 'structureMetal', 0, 0, [[0.55, bellTop - 2.6], [0.5, bellTop - 2.45], [0.32, bellTop - 2.05], [0.22, bellTop - 1.75], [0, bellTop - 1.7]], 10,
    { colour: BELL, decor: true });
  moulding(sink, 'stone', S, S, bellTop, 0.3, 0.18);
  // the balustrade round the pyramid's foot: corner piers, a rail, the balusters between (fine), a pinnacle on each pier
  const by = bellTop + 0.3, bh = 0.75, e = S / 2 + 0.1;
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) {
    sink.span('stone', sx * e - 0.22, by, sz * e - 0.22, sx * e + 0.22, by + bh + 0.1, sz * e + 0.22);
    revolve(sink, 'stone', sx * e, sz * e, [[0.24, by + bh + 0.1], [0, by + bh + 1.05]], 4, { decor: true }, Math.PI / 4);
  }
  for (const [x0, z0, x1, z1] of [[-e, -e, e, -e], [e, -e, e, e], [e, e, -e, e], [-e, e, -e, -e]] as const) {
    const ax = x0 === x1, lo = (v0: number, v1: number) => Math.min(v0, v1), hi = (v0: number, v1: number) => Math.max(v0, v1);
    sink.span('stone', ax ? x0 - 0.13 : lo(x0, x1), by + bh - 0.12, ax ? lo(z0, z1) : z0 - 0.13, ax ? x0 + 0.13 : hi(x0, x1), by + bh, ax ? hi(z0, z1) : z0 + 0.13,
      { decor: true });
    const n = Math.max(4, Math.round((2 * e) / 0.42));
    for (let k = 1; k < n; k++) {
      const q = k / n, x = x0 + (x1 - x0) * q, z = z0 + (z1 - z0) * q;
      sink.span('stone', x - 0.07, by, z - 0.07, x + 0.07, by + bh - 0.12, z + 0.07, { decor: true, fine: true });
    }
  }
  // the stone pyramid, a ball and the cross
  revolve(sink, 'stone', 0, 0, [[(S / 2 + 0.1) * Math.SQRT2, bellTop + 0.3], [0, H - 1.3]], 4, {}, Math.PI / 4);
  revolve(sink, 'structureMetal', 0, 0, [[0.05, H - 1.35], [0.2, H - 1.25], [0.22, H - 1.1], [0.05, H - 0.95]], 8, { colour: rgb(0x8a7a5a), decor: true });
  cross(sink, 'structureMetal', 0, H - 1.0, 0, 1.0, 'latin', rgb(0x3a3a38));
  return { parts: sink.finish() };
};

/**
 * The fire lookout: a tapering steel lattice tower (four legs, braced panels) carrying a glazed cab under a pyramid
 * roof, the zig-zag stair inside its frame; the forest maps' watchtower.
 */
export const fireLookout: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const H = Math.max(10, Number(ctx.params.height));
  const base = -0.6 - ctx.groundFall, cabY = H - 3.4, half0 = 2.4 + H * 0.05, half1 = 1.6;
  const at = (y: number) => half0 + (half1 - half0) * (y / cabY);
  const steel = { colour: STEEL_GREY };
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    sink.span('stone', sx * half0 - 0.45, base, sz * half0 - 0.45, sx * half0 + 0.45, 0.4, sz * half0 + 0.45);
    bar(sink, 'structureMetal', [sx * half0, 0.4, sz * half0], [sx * half1, cabY, sz * half1], 0.16, steel);
  }
  const panels = Math.max(3, Math.round(cabY / 4));
  for (let k = 0; k < panels; k++) {
    const y0 = 0.4 + (cabY - 0.4) * k / panels, y1 = 0.4 + (cabY - 0.4) * (k + 1) / panels, h0 = at(y0), h1 = at(y1);
    for (const [ax, az, bx, bz] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]]) {
      bar(sink, 'structureMetal', [ax * h1, y1, az * h1], [bx * h1, y1, bz * h1], 0.09, { ...steel, decor: true });
      bar(sink, 'structureMetal', [ax * h0, y0, az * h0], [bx * h1, y1, bz * h1], 0.06, { ...steel, decor: true });
      bar(sink, 'structureMetal', [bx * h0, y0, bz * h0], [ax * h1, y1, az * h1], 0.06, { ...steel, decor: true, fine: true });
    }
    // a flight of the stair inside the frame
    const s = (k % 2 ? 1 : -1) * 0.5;
    bar(sink, 'structureWood', [s, y0, -0.6], [s, y1, 0.6], 0.5, { colour: TIMBER, decor: true, fine: true });
  }
  // the cab: a floor, posts, the glazing, a balcony rail, the pyramid roof
  const cw = half1 * 2 + 0.6;
  sink.span('structureWood', -cw / 2 - 0.5, cabY, -cw / 2 - 0.5, cw / 2 + 0.5, cabY + 0.2, cw / 2 + 0.5, { colour: TIMBER_DARK });
  const cab = archedBody(sink, 'structureWood', 0, 0, cw, cw, cabY + 0.2, cabY + 1.2, {}, 0, { colour: BOARD_GREY });
  for (const name of ['front', 'right', 'back', 'left'] as const) {
    const face = cab[name];
    sink.quad('glass', facePoint(face, -cw / 2 + 0.15, cabY + 1.2, 0), facePoint(face, cw / 2 - 0.15, cabY + 1.2, 0), facePoint(face, cw / 2 - 0.15, cabY + 2.4, 0),
      facePoint(face, -cw / 2 + 0.15, cabY + 2.4, 0), { decor: true });
    for (const u of [-cw / 2 + 0.06, 0, cw / 2 - 0.06]) sink.box('structureWood', facePoint(face, u, cabY + 1.8, -0.06), [0.06, 0.6, 0.06], { colour: TIMBER_DARK }, new LocalFrame(face.u, [0, 1, 0], face.out, [0, 0, 0]));
  }
  for (const [a, b] of [[[-1, -1], [1, -1]], [[1, -1], [1, 1]], [[1, 1], [-1, 1]], [[-1, 1], [-1, -1]]] as const) {
    railing(sink, [a[0] * (cw / 2 + 0.45), a[1] * (cw / 2 + 0.45)], [b[0] * (cw / 2 + 0.45), b[1] * (cw / 2 + 0.45)], 1.0, IRON, { base: cabY + 0.2, pitch: 1.6 });
  }
  sink.span('structureWood', -cw / 2, cabY + 2.4, -cw / 2, cw / 2, cabY + 2.55, cw / 2, { colour: TIMBER_DARK });
  revolve(sink, 'structureMetal', 0, 0, [[(cw / 2 + 0.5) * Math.SQRT2, cabY + 2.55], [0, H]], 4, { colour: IRON_RED }, Math.PI / 4);
  return { parts: sink.finish() };
};
