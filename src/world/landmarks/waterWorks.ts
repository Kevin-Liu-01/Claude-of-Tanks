// waterWorks.ts — props census #3 (lane B, 2026-10-14): the water tower and the valve tower moved here as they were from towers.ts, the industrial yard's
// src/world/landmarks/towers.ts — the towers (the landmarks lane, 2026-10-05): the water tower (a railway's octagonal
// brick shaft under its timber tank house, the Soviet steel Rozhnovsky tower, a timber trestle tank), the windmills
// (the Kursk governorate's post mill and smock mill, the Dutch brick tower mill with its stage), the free-standing
// belfry, the Dalmatian campanile, the fire lookout and a reservoir's valve tower with its footbridge. Sizes from the
// type: a railway water tower of the 1880s stands 16-20 m, a smock mill's cap 10-12 m with sails of 9-10 m, a campanile
// 25-45 m, the Roer dams' valve towers 15-20 m over the water.
import { LocalFrame, PartSink, faceBox, facePoint, rgb, shade, type Face, type Rgb } from '../maps/regional/geometry.ts';
import { archSurround, archWindow, archedFace, archedSlab, bar, prismBody, revolve, type ArchHole } from './kit.ts';
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
    // (227, lane B; the anti-raft floor: the trestle fell as a heap at its feet, 16 % of its height) the legs on their stone
    // pads, their braces and girts, the tank's deck and the tank one open frame (pieces.ts 'lattice'): it buckles over its
    // lower bays (world/toppleHinge.ts) and goes over along the blow, the tank on it (the pads in it: a leg stands in the
    // fall where it rests on what stands, landmarks/damage.ts standingVertices)
    piece(sink, { name: 'frame', kind: 'lattice', at: 'collapse', fall: 'topple' }, (s) => {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) s.span('stone', sx * half - 0.4, base, sz * half - 0.4, sx * half + 0.4, 0.5, sz * half + 0.4);
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        bar(s, 'structureWood', [sx * half, 0.5, sz * half], [sx * half * 0.72, legH, sz * half * 0.72], 0.3, { colour: TIMBER_DARK });
      }
      for (let k = 0; k < 3; k++) {
        const y0 = 0.5 + k * (legH - 0.5) / 3, y1 = 0.5 + (k + 1) * (legH - 0.5) / 3;
        const h0 = half * (1 - 0.28 * (y0 - 0.5) / legH), h1 = half * (1 - 0.28 * (y1 - 0.5) / legH);
        for (const [ax, az, bx, bz] of [[-1, -1, 1, -1], [1, -1, 1, 1], [1, 1, -1, 1], [-1, 1, -1, -1]]) {
          bar(s, 'structureWood', [ax * h0, y0, az * h0], [bx * h1, y1, bz * h1], 0.12, { colour: TIMBER, decor: true });
          bar(s, 'structureWood', [ax * h1, y1, az * h1], [bx * h1, y1, bz * h1], 0.16, { colour: TIMBER, decor: true });
        }
      }
      s.span('structureWood', -half * 0.85, legH, -half * 0.85, half * 0.85, legH + 0.3, half * 0.85, { colour: TIMBER_DARK });
      revolve(s, 'structureWood', 0, 0, [[2.9, legH + 0.3], [2.9, legH + 3.6], [3.1, legH + 3.6], [0.2, legH + 5.0], [0, legH + 5.05]], 16, { colour: TIMBER });
      for (let k = 0; k < 4; k++) revolve(s, 'structureMetal', 0, 0, [[2.94, legH + 0.6 + k * 0.85], [2.94, legH + 0.7 + k * 0.85]], 16, { colour: IRON, decor: true });
    });
    return { parts: finishLandmark(sink) };
  }
  // the railway tower
  const rShaft = 3.4, shaftTop = Math.max(7, H * 0.58), houseTop = shaftTop + Math.max(3.2, H * 0.22);
  // (227, lane B; the anti-raft floor: an open frame by its name, the tower fell as the default kit's heap, 16 % of its
  // height) the shaft and the tank house each a piece that goes over (pieces.ts 'lattice'): the brick shaft breaks over
  // its lower half and stands there in its own courses (world/toppleHinge.ts), the rest goes over along the blow, the
  // plinth standing
  const ring = (r: number) => r / Math.cos(OCT);
  piece(sink, { name: 'shaft', kind: 'lattice', at: 'collapse', fall: 'topple' }, (s) => {
    // (its plinth in it: the shaft stands in the fall on what stands)
    revolve(s, 'plaster', 0, 0, [[(rShaft + 0.25) / Math.cos(OCT), base], [(rShaft + 0.25) / Math.cos(OCT), 0.7], [(rShaft) / Math.cos(OCT), 0.7]], 8, {}, OCT);
    const door: ArchHole = { u: 0, w: 1.3, y0: 0.7, spring: 2.8, form: 'segmental', rise: 0.3 };
    const low = (): ArchHole => ({ u: 0, w: 0.8, y0: 2.9, spring: 4.4, form: 'segmental', rise: 0.2 });
    const high = (): ArchHole => ({ u: 0, w: 0.7, y0: shaftTop - 3.2, spring: shaftTop - 2.0, form: 'round' });
    const holes: Record<number, ArchHole[]> = { 0: [door, high()], 2: [low(), high()], 4: [low(), high()], 6: [low(), high()], 1: [high()], 3: [high()], 5: [high()], 7: [high()] };
    const faces = prismBody(s, 'stone', 0, 0, rShaft, 8, 0.7, shaftTop, holes, 0.36);
    faces.forEach((face, i) => {
      for (const h of holes[i] ?? []) {
        if (h === door) {
          plankDoor(s, face, 0, h.y0, h.w, h.spring - h.y0 + 0.25, TIMBER_DARK, -0.34);
          archSurround(s, 'plaster', face, h, 0.16, 0.05, { sill: false });
        } else {
          archWindow(s, face, h, 0.36, FRAME_WHITE, false, { bars: true });
          archSurround(s, 'plaster', face, h, 0.12, 0.04);
        }
      }
    });
    // the string course and the corbelled cornice the tank house bears on
    revolve(s, 'plaster', 0, 0, [[ring(rShaft + 0.04), shaftTop * 0.48], [ring(rShaft + 0.1), shaftTop * 0.48 + 0.04], [ring(rShaft + 0.1), shaftTop * 0.48 + 0.24],
      [ring(rShaft + 0.04), shaftTop * 0.48 + 0.28]], 8, { decor: true }, OCT);
    revolve(s, 'stone', 0, 0, [[ring(rShaft), shaftTop - 0.02], [ring(rShaft + 0.15), shaftTop - 0.02], [ring(rShaft + 0.15), shaftTop + 0.16],
      [ring(rShaft + 0.32), shaftTop + 0.16], [ring(rShaft + 0.32), shaftTop + 0.34], [ring(rShaft + 0.5), shaftTop + 0.34], [ring(rShaft + 0.5), shaftTop + 0.5],
      [ring(rShaft), shaftTop + 0.5]], 8, {}, OCT);
  });
  piece(sink, { name: 'tank-house', kind: 'lattice', at: 'collapse', fall: 'topple' }, (s) => {
    // the tank house: vertical boards painted ochre, a band of small windows, a slatted vent under the eaves
    const rHouse = rShaft + 0.7, houseFloor = shaftTop + 0.5;
    // (the looks lane's r2 sub-stream, 2026-10-16; the r2 sweep: "glass plates stuck on the boards") the band of windows cut
    // through the boarding on every other facet, each in its reveal (the boards on their studs) with its sash set back,
    // its white casing and sill round it
    const winY = houseFloor + (houseTop - houseFloor) * 0.45, WIN_REVEAL = 0.14;
    const win = (): ArchHole => ({ u: 0, w: 0.7, y0: winY, spring: winY + 0.7, form: 'flat' });
    const houseHoles: Record<number, ArchHole[]> = { 0: [win()], 2: [win()], 4: [win()], 6: [win()] };
    // (the boarding cut through, its reveals dressing: the house's collision is the unbroken octagon's)
    const tf = prismBody(s, 'structureWood', 0, 0, rHouse, 8, houseFloor, houseTop, houseHoles, 0, { colour: BOARD_OCHRE });
    // (the floor's underside, facing down: it is the overhang a man at the foot of the tower looks up into — it faced up
    // until 2026-10-06, and the house showed its inside from below)
    s.polygon('structureWood', tf.map((f) => facePoint(f, -f.width / 2, houseFloor)).reverse(), { colour: shade(BOARD_OCHRE, 0.6) });
    tf.forEach((f, i) => {
      // the boards' battens (the middle one stopped at the window's casing) and the windows in their reveals
      const holed = (houseHoles[i] ?? []).length > 0;
      const batten = (u: number, y0: number, y1: number) => s.box('structureWood', facePoint(f, u, (y0 + y1) / 2, 0.03), [0.035, (y1 - y0) / 2, 0.03],
        { colour: shade(BOARD_OCHRE, 0.82), decor: true, fine: true }, new LocalFrame(f.u, [0, 1, 0], f.out, [0, 0, 0]), { nz: true });
      for (let k = -2; k <= 2; k++) {
        if (k === 0 && holed) { batten(0, houseFloor, winY - 0.13); batten(0, winY + 0.82, houseTop); continue; }
        batten(k * f.width / 5, houseFloor, houseTop);
      }
      for (const h of houseHoles[i] ?? []) {
        // the reveal: the jambs, the sill and the head through the boarding and its studs, the room's dark behind the sash
        const P = (u: number, y: number, o = 0) => facePoint(f, u, y, o), r = -WIN_REVEAL, u0 = h.u - h.w / 2, u1 = h.u + h.w / 2;
        const rv = (k: number) => ({ colour: shade(BOARD_OCHRE, k), decor: true });
        s.quad('structureWood', P(u0, h.y0), P(u0, h.y0, r), P(u0, h.spring, r), P(u0, h.spring), rv(0.62));
        s.quad('structureWood', P(u1, h.y0), P(u1, h.spring), P(u1, h.spring, r), P(u1, h.y0, r), rv(0.62));
        s.quad('structureWood', P(u0, h.y0), P(u1, h.y0), P(u1, h.y0, r), P(u0, h.y0, r), rv(0.8));
        s.quad('structureWood', P(u0, h.spring), P(u0, h.spring, r), P(u1, h.spring, r), P(u1, h.spring), rv(0.5));
        s.polygon('dark', [P(u0, h.y0, r - 0.004), P(u1, h.y0, r - 0.004), P(u1, h.spring, r - 0.004), P(u0, h.spring, r - 0.004)], { decor: true });
        archWindow(s, f, h, WIN_REVEAL, FRAME_WHITE, false, { bars: true, coarse: true });
        archSurround(s, 'structureWood', f, h, 0.09, 0.035, { colour: FRAME_WHITE });
      }
      // the brackets under the overhang
      for (const du of [-0.3, 0.3]) {
        const a = facePoint(f, du * f.width, shaftTop - 0.6, -0.7), b = facePoint(f, du * f.width, houseFloor, 0.02);
        s.member('structureWood', a, b, 0.12, 0.12, [f.u[0], 0, f.u[2]], { colour: TIMBER_DARK, decor: true, exposed: true }, 0.06);
      }
    });
    // the tent roof, its eaves over the house, and the vent lantern with its cap
    const eaveR = ring(rHouse + 0.45), roofTop = houseTop + Math.max(2.2, H - houseTop - 1.2);
    revolve(s, 'structureMetal', 0, 0, [[eaveR, houseTop - 0.1], [eaveR * 0.94, houseTop + 0.05], [0.65, roofTop - 0.6], [0.6, roofTop - 0.6]], 8, { colour: IRON_RED }, OCT);
    revolve(s, 'structureWood', 0, 0, [[0.55, roofTop - 0.62], [0.55, roofTop + 0.15]], 8, { colour: BOARD_OCHRE }, OCT);
    revolve(s, 'structureMetal', 0, 0, [[0.8, roofTop + 0.15], [0.05, roofTop + 0.8], [0, roofTop + 0.82]], 8, { colour: IRON_RED }, OCT);
    s.span('structureMetal', -0.025, roofTop + 0.8, -0.025, 0.025, roofTop + 1.5, 0.025, { colour: IRON, decor: true });
  });
  return { parts: finishLandmark(sink), tints: { stone: [1.02, 0.97, 0.94], plaster: [0.95, 0.94, 0.9] } };
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
  // ---- the tower: the battered foot, the shaft, the string course at the bridge's floor
  revolve(sink, 'stone', 0, zT, [[R + 0.7, bed], [R + 0.7, 0.9], [R + 0.25, 2.1], [R, 2.4], [R, deckY - 0.35]], N, {}, phase);
  revolve(sink, 'stone', 0, zT, [[R, deckY - 0.35], [R + 0.22, deckY - 0.35], [R + 0.22, deckY - 0.05], [R, deckY - 0.05]], N, { decor: true }, phase);
  const top = deckY + C, rTop = R;
  // the valve chamber (props census #3, lane B 2026-10-14; the judges: "a smooth revolved drum, its windows and door
  // flat on it"): its facets laid in ashlar courses, each block its own tone; the five round-headed windows and the door
  // cut through their facets with deep reveals (kit.ts archedFace), their dressed surrounds, the iron door set back in
  // its reveal under a dark fanlight. Facets on the revolve's (every 18 degrees, the vertices between).
  const face = (a: number, r: number): Face => ({ origin: [Math.sin(a) * r, 0, zT + Math.cos(a) * r], u: [Math.cos(a), 0, -Math.sin(a)],
    out: [Math.sin(a), 0, Math.cos(a)], width: 1 });
  const apo = R * facet, half = R * Math.sin(Math.PI / N), course = C / Math.max(4, Math.round(C / 0.9));
  const win = (): ArchHole => ({ u: 0, w: 0.95, y0: deckY + C * 0.3, spring: deckY + C * 0.62, form: 'round' });
  const door: ArchHole = { u: 0, w: 1.0, y0: deckY - 0.05, spring: deckY + 2.0, form: 'round' };
  const reveal = 0.4;
  for (let k = 0; k < N; k++) {
    const a = k * (Math.PI * 2 / N), f = face(a, apo);
    const isWin = k % 4 === 0 && k !== N / 2, isDoor = k === N / 2;
    if (isWin || isDoor) {
      const h = isDoor ? door : win();
      archedFace(sink, 'stone', f, { u0: -half, u1: half, y0: deckY - 0.05, y1: top }, [h], reveal, { segments: 6 });
      archSurround(sink, 'stone', f, h, 0.16, 0.06, { keystone: true, sill: !isDoor });
      if (isDoor) {
        plankDoor(sink, f, 0, door.y0, door.w - 0.04, door.spring - door.y0, IRON_GREEN, -reveal + 0.05);
        for (const y of [door.y0 + 0.45, door.spring - 0.45]) faceBox(sink, 'structureWood', f, -0.05, y, -reveal + 0.07, door.w - 0.2, 0.07, 0.02, { colour: IRON, decor: true, fine: true });
      } else archWindow(sink, f, h, reveal, FRAME_WHITE, false, { coarse: true });
      continue;
    }
    // a plain facet: its courses, each block a shade of its own (the dressed stone's beds and tones)
    for (let y = deckY - 0.05, i = 0; y < top - 1e-3; y += course, i++) {
      const y1 = Math.min(top, y + course), tone = 0.9 + ((k * 7 + i * 3) % 5) * 0.03;
      sink.quad('stone', facePoint(f, -half, y, 0), facePoint(f, half, y, 0), facePoint(f, half, y1, 0), facePoint(f, -half, y1, 0), { shade: tone });
    }
  }
  // the corbelled cornice and the slated bell roof in its courses, its finial
  revolve(sink, 'stone', 0, zT, [[rTop, top], [rTop + 0.38, top + 0.3], [rTop + 0.38, top + 0.62], [rTop - 0.05, top + 0.66]], N, {}, phase);
  const roofY = top + 0.62, rr = rTop + 0.55;
  const bellP: Array<[number, number]> = [[rr, roofY], [rr * 0.9, roofY + 0.55], [rr * 0.62, roofY + R * 0.55], [rr * 0.3, roofY + R * 1.05], [0.22, roofY + R * 1.38], [0, roofY + R * 1.42]];
  // (each run of the bell split into slate courses, alternate courses a shade darker, a lead roll at the kick)
  for (let k = 0; k + 1 < bellP.length; k++) {
    const [r0, y0] = bellP[k], [r1, y1] = bellP[k + 1], len = Math.hypot(r1 - r0, y1 - y0), m = k + 2 < bellP.length ? Math.max(1, Math.round(len / 1.0)) : 1;
    for (let j = 0; j < m; j++) {
      const t0 = j / m, t1 = (j + 1) / m;
      revolve(sink, 'roof', 0, zT, [[r0 + (r1 - r0) * t0, y0 + (y1 - y0) * t0], [r0 + (r1 - r0) * t1, y0 + (y1 - y0) * t1]], N, { shade: (j + k) % 2 ? 0.9 : 1 }, phase);
    }
  }
  revolve(sink, 'structureWood', 0, zT, [[rr * 0.9 + 0.04, roofY + 0.5], [rr * 0.9 + 0.04, roofY + 0.62]], N, { colour: shade(STEEL_GREY, 0.8), decor: true }, phase);
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
  sink.placed(-Math.PI / 2, 0, 0, zMid, () => {
    archedSlab(sink, 'stone', -Lb / 2, Lb / 2, bed, deckY, W, holes, { ends: true, top: true });
    // each arch's voussoir ring on both faces, its keystone (props census #3: the arches were cut through a plain slab)
    const fr: Face = { origin: [0, 0, W / 2], u: [1, 0, 0], out: [0, 0, 1], width: Lb }, bk: Face = { origin: [0, 0, -W / 2], u: [-1, 0, 0], out: [0, 0, -1], width: Lb };
    for (const h of holes) {
      archSurround(sink, 'stone', fr, h, 0.42, 0.05, { keystone: true });
      archSurround(sink, 'stone', bk, { ...h, u: -h.u }, 0.42, 0.05, { keystone: true });
    }
  });
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
  // the valve gear on the bridge's end before the door: two cast-iron headstocks, their hand wheels and spindles (the
  // iron painted in the timber bucket the door already draws: no new batch on the reservoir, the cost census)
  for (const sx of [-1, 1]) {
    const x = sx * (W / 2 - 0.75), z = zFace - 1.3;
    revolve(sink, 'structureWood', x, z, [[0.22, deckY], [0.1, deckY + 0.3], [0.09, deckY + 0.85], [0.14, deckY + 0.95], [0.001, deckY + 1.0]], 6, { colour: IRON_GREEN });
    const wy = deckY + 1.05, wr = 0.32;
    for (let k = 0; k < 6; k++) {
      const a0 = k * Math.PI / 3, a1 = (k + 1) * Math.PI / 3;
      bar(sink, 'structureWood', [x + Math.cos(a0) * wr, wy, z + Math.sin(a0) * wr], [x + Math.cos(a1) * wr, wy, z + Math.sin(a1) * wr], 0.035, { colour: IRON, decor: true });
    }
    for (const a of [0, Math.PI / 2]) bar(sink, 'structureWood', [x - Math.cos(a) * wr, wy, z - Math.sin(a) * wr], [x + Math.cos(a) * wr, wy, z + Math.sin(a) * wr], 0.025, { colour: IRON, decor: true, fine: true });
    sink.span('structureWood', x - 0.025, wy, z - 0.025, x + 0.025, wy + 0.35, z + 0.025, { colour: STEEL_GREY, decor: true });
  }
  return { parts: finishLandmark(sink) };
};

// ---------------------------------------------------------------------------------------------------------- windmills

