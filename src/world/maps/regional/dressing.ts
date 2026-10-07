// src/world/maps/regional/dressing.ts — the lived-in dressing of the regional kits' houses (regional-buildings lane,
// 2026-10-03; gauntlet wave 0: "box buildings ... no yards, wires, wear"). Small attached parts a house carries in
// the real place: flower boxes under the windows, the bench by the door, a woodpile under the eaves, the roof ladder
// to the stack, a television aerial on the ridge, a potted plant on a stair. All dressing (no collision); a kit draws
// their choices from its build stream and leaves them out on phones.
import { faceBox, normalize3, type Face, type PartSink, type Rgb, type Vec3 } from './geometry.ts';
import type { HouseFrame } from './house.ts';

const DECOR = { decor: true } as const;

/** A planted window box on its brackets under a window (u, y: the window's bottom-centre on the face). */
export function flowerBox(sink: PartSink, face: Face, u: number, y: number, w: number, box: Rgb, bloom: Rgb, rng: () => number,
  fine = false): void {
  // (`fine`: the facade craft's boxes are fine dressing, drawn near the camera only, in no shadow map: EmitOptions.fine
  // 'near')
  const d = fine ? { ...DECOR, fine: 'near' as const } : DECOR;
  const bw = w + 0.12, by = y - 0.24;
  faceBox(sink, 'structureWood', face, u, by, 0.13, bw, 0.18, 0.2, { ...d, colour: box });
  for (const side of [-1, 1]) faceBox(sink, 'structureMetal', face, u + side * (bw / 2 - 0.08), by - 0.12, 0.08, 0.03, 0.12, 0.14, { ...d, colour: [0.12, 0.12, 0.12] });
  // the foliage mound and the blooms above it (geraniums hang over the front edge)
  const leaf: Rgb = [0.13 + rng() * 0.04, 0.24 + rng() * 0.06, 0.08];
  faceBox(sink, 'structureWood', face, u, by + 0.15, 0.15, bw - 0.06, 0.14, 0.24, { ...d, colour: leaf });
  const n = Math.max(3, Math.round(bw / 0.22));
  for (let k = 0; k < n; k++) {
    const t = (k + 0.5) / n, uu = u - bw / 2 + 0.04 + (bw - 0.08) * t;
    const s = 0.07 + rng() * 0.05, lift = rng() * 0.06;
    faceBox(sink, 'structureWood', face, uu, by + 0.2 + lift, 0.2 + rng() * 0.06, s, s, s, { ...d, colour: bloom });
  }
}

/** A plank bench against the wall beside a door, its back to the house. */
export function bench(sink: PartSink, face: Face, u: number, length: number, wood: Rgb): void {
  faceBox(sink, 'structureWood', face, u, 0.45, 0.25, length, 0.06, 0.36, { ...DECOR, colour: wood });
  faceBox(sink, 'structureWood', face, u, 0.78, 0.06, length, 0.22, 0.04, { ...DECOR, colour: wood });
  for (const side of [-1, 1]) faceBox(sink, 'structureWood', face, u + side * (length / 2 - 0.12), 0.21, 0.25, 0.06, 0.42, 0.3, { ...DECOR, colour: wood });
}

/**
 * A woodpile stacked against the wall under the eaves: courses of split logs, end grain out, read as rows of short
 * stacks (each a bark-dark body and a pale end-grain face), a board roof over it.
 */
export function woodpile(sink: PartSink, face: Face, u0: number, u1: number, height: number, rng: () => number): void {
  const depth = 0.42, row = 0.17;
  const rows = Math.max(3, Math.round(height / row));
  for (let r = 0; r < rows; r++) {
    const y = r * row + row / 2;
    // each course in two to four stacks of slightly different length and tone
    let u = u0 + (r % 2 ? 0.05 : 0);
    while (u < u1 - 0.2) {
      const len = Math.min(u1 - u, 0.5 + rng() * 0.5), tone = 0.46 + rng() * 0.14, o = depth / 2 + (rng() - 0.5) * 0.04;
      faceBox(sink, 'structureWood', face, u + len / 2, y, o, len - 0.02, row - 0.012, depth, { ...DECOR, colour: [tone * 0.62, tone * 0.5, tone * 0.38] });
      faceBox(sink, 'structureWood', face, u + len / 2, y, o + depth / 2 + 0.003, len - 0.05, row - 0.03, 0.006, { ...DECOR, colour: [tone * 1.18, tone * 0.98, tone * 0.7] });
      u += len;
    }
  }
  // a little roof of boards over the pile
  faceBox(sink, 'structureWood', face, (u0 + u1) / 2, rows * row + 0.08, depth / 2 + 0.05, u1 - u0 + 0.2, 0.04, depth + 0.16, { ...DECOR, colour: [0.32, 0.27, 0.22] });
}

/**
 * The roof ladder (Dachleiter) from the eaves up to the stack on the +x or -x slope at z: two rails and rungs riding
 * on hooks a hand's breadth above the covering.
 */
export function roofLadder(sink: PartSink, frame: HouseFrame, side: 1 | -1, z: number, rise: number, colour: Rgb): void {
  const rg = frame.roof;
  if (rg.kind === 'flat' || rg.kind === 'shed') return;
  const lift = 0.09;
  const point = (x: number, dz: number): Vec3 => {
    const top = rg.topAt(side * x, z + dz) ?? rg.eaveY;
    return [side * x, top + lift, z + dz];
  };
  const x0 = rg.s * 0.92, x1 = Math.max(0.3, rg.s * (1 - rise));
  const n = normalize3([side * rg.tanP, 1, 0]);
  for (const dz of [-0.2, 0.2]) sink.member('structureWood', point(x0, dz), point(x1, dz), 0.05, 0.05, n, { ...DECOR, colour, exposed: true }, 0);
  const steps = Math.max(3, Math.round((x0 - x1) / 0.3 * Math.hypot(1, rg.tanP)));
  for (let k = 0; k <= steps; k++) {
    const x = x0 + (x1 - x0) * k / steps;
    sink.member('structureWood', point(x, -0.2), point(x, 0.2), 0.035, 0.035, n, { ...DECOR, colour, exposed: true }, 0);
  }
}

/** A television aerial on a mast at the ridge: a Yagi of elements on a boom, guyed to the roof (1970s–90s Europe). */
export function tvAerial(sink: PartSink, frame: HouseFrame, z: number, rng: () => number): void {
  const rg = frame.roof;
  const base = rg.topAt(0, z) ?? rg.ridgeTopY;
  const mast = 2.2 + rng() * 1.2;
  const metal: Rgb = [0.5, 0.52, 0.54];
  sink.cylinder('structureMetal', [0, base - 0.1, z], 'y', mast + 0.1, 0.025, 5, { ...DECOR, colour: metal });
  const yaw = (rng() - 0.5) * 1.2;
  const dirX = Math.cos(yaw), dirZ = Math.sin(yaw);
  for (const [h, len, count] of [[mast - 0.05, 1.6, 7], [mast - 0.65, 1.1, 5]] as const) {
    const y = base + h;
    const a: Vec3 = [-dirX * len / 2, y, z - dirZ * len / 2], b: Vec3 = [dirX * len / 2, y, z + dirZ * len / 2];
    sink.member('structureMetal', a, b, 0.025, 0.025, [0, 1, 0], { ...DECOR, colour: metal, exposed: true }, 0);
    for (let k = 0; k < count; k++) {
      const t = (k + 0.5) / count, el = 0.5 - k * 0.04;
      const cx = a[0] + (b[0] - a[0]) * t, cz = a[2] + (b[2] - a[2]) * t;
      sink.member('structureMetal', [cx + dirZ * el / 2, y, cz - dirX * el / 2], [cx - dirZ * el / 2, y, cz + dirX * el / 2], 0.015, 0.015, [0, 1, 0],
        { ...DECOR, colour: metal, exposed: true }, 0);
    }
  }
}

/**
 * A wall lantern on an iron bracket beside a door: its glass is a curtain pane, so it glows with the lit windows at
 * night. (u, y) is the lantern's centre on the face.
 */
export function wallLantern(sink: PartSink, face: Face, u: number, y: number): void {
  const iron: Rgb = [0.12, 0.12, 0.12];
  faceBox(sink, 'structureMetal', face, u, y + 0.3, 0.2, 0.04, 0.04, 0.4, { ...DECOR, colour: iron });
  faceBox(sink, 'structureMetal', face, u, y + 0.2, 0.36, 0.2, 0.04, 0.2, { ...DECOR, colour: iron });
  faceBox(sink, 'curtain', face, u, y, 0.36, 0.16, 0.26, 0.16, { ...DECOR, window: face.out });
  faceBox(sink, 'structureMetal', face, u, y - 0.15, 0.36, 0.2, 0.04, 0.2, { ...DECOR, colour: iron });
}

/** A terracotta pot with a plant (a stair tread, a doorstep, a wall top). (x, y, z) is the pot's base. */
export function pottedPlant(sink: PartSink, x: number, y: number, z: number, size: number, rng: () => number): void {
  const clay: Rgb = [0.56 + rng() * 0.08, 0.26 + rng() * 0.04, 0.15];
  sink.cylinder('structureWood', [x, y, z], 'y', size * 0.8, size * 0.36, 7, { ...DECOR, colour: clay }, size * 0.48);
  const leaf: Rgb = [0.12 + rng() * 0.05, 0.26 + rng() * 0.08, 0.07];
  sink.cylinder('structureWood', [x, y + size * 0.8, z], 'y', size * 0.5, size * 0.5, 7, { ...DECOR, colour: leaf }, size * 0.18);
}

/**
 * A washing line strung across a face between two wall brackets, the washing pegged along it (the Mediterranean
 * street front). (u0, u1, y) on the face; the line sags a hand's breadth in the middle.
 */
export function washingLine(sink: PartSink, face: Face, u0: number, u1: number, y: number, rng: () => number): void {
  const out = 0.55, sag = 0.12;
  const iron: Rgb = [0.18, 0.18, 0.18];
  for (const u of [u0, u1]) faceBox(sink, 'structureMetal', face, u, y, out / 2, 0.03, 0.03, out, { ...DECOR, colour: iron });
  const pegs = Math.max(3, Math.floor((u1 - u0) / 0.42));
  const at = (t: number) => y - sag * 4 * t * (1 - t);
  for (let k = 0; k < 8; k++) {
    const a = k / 8, b = (k + 1) / 8;
    const p = facePointOut(face, u0 + (u1 - u0) * a, at(a), out), q = facePointOut(face, u0 + (u1 - u0) * b, at(b), out);
    sink.member('structureMetal', p, q, 0.012, 0.012, face.out, { ...DECOR, colour: [0.75, 0.75, 0.72], exposed: true }, 0);
  }
  const cloth: readonly Rgb[] = [[0.82, 0.82, 0.8], [0.62, 0.16, 0.14], [0.2, 0.32, 0.58], [0.85, 0.72, 0.32], [0.45, 0.6, 0.42], [0.9, 0.88, 0.84]];
  for (let k = 0; k < pegs; k++) {
    if (rng() < 0.25) continue;
    const t = (k + 0.5) / pegs, w = 0.24 + rng() * 0.3, h = 0.3 + rng() * 0.45;
    const c = cloth[Math.floor(rng() * cloth.length)];
    faceBox(sink, 'structureWood', face, u0 + (u1 - u0) * t, at(t) - h / 2 - 0.01, out, w, h, 0.012, { ...DECOR, colour: c });
  }
}

/** A flowering shrub against a wall (a Breton hydrangea): a leafy mound and its flower heads. */
export function floweringShrub(sink: PartSink, face: Face, u: number, size: number, bloom: Rgb, rng: () => number): void {
  const leaf: Rgb = [0.1 + rng() * 0.04, 0.22 + rng() * 0.06, 0.08];
  faceBox(sink, 'structureWood', face, u, size * 0.42, size * 0.42, size * 1.3, size * 0.84, size * 0.8, { ...DECOR, colour: leaf });
  for (let k = 0; k < 7; k++) {
    const s = size * (0.22 + rng() * 0.12);
    faceBox(sink, 'structureWood', face, u + (rng() - 0.5) * size, size * (0.55 + rng() * 0.32), size * (0.3 + rng() * 0.5), s, s, s,
      { ...DECOR, colour: [bloom[0] * (0.85 + rng() * 0.3), bloom[1] * (0.85 + rng() * 0.3), bloom[2] * (0.85 + rng() * 0.3)] });
  }
}

/** A point `o` metres out of a face (u along it, y up). */
function facePointOut(face: Face, u: number, y: number, o: number): Vec3 {
  return [face.origin[0] + face.u[0] * u + face.out[0] * o, y, face.origin[2] + face.u[2] * u + face.out[2] * o];
}

/**
 * Hollyhocks (mal'vy) against a house wall (the south Russian and Ukrainian village front): a clump of tall stalks
 * leaning a little apart, leafy at the foot, the flowers set up the top half of each. (facades lane, 2026-10-05)
 */
export function hollyhocks(sink: PartSink, face: Face, u: number, bloom: Rgb, rng: () => number): void {
  const stalks = 3 + Math.floor(rng() * 3);
  const leaf: Rgb = [0.1 + rng() * 0.04, 0.2 + rng() * 0.06, 0.07];
  // the leafy foot of the clump
  faceBox(sink, 'structureWood', face, u, 0.28, 0.32, 0.9, 0.56, 0.5, { ...DECOR, colour: leaf });
  for (let k = 0; k < stalks; k++) {
    const du = (k - (stalks - 1) / 2) * 0.2 + (rng() - 0.5) * 0.08, o = 0.22 + rng() * 0.22;
    const height = 1.5 + rng() * 0.7, lean = (rng() - 0.5) * 0.25;
    const foot: Vec3 = [face.origin[0] + face.u[0] * (u + du) + face.out[0] * o, 0.3, face.origin[2] + face.u[2] * (u + du) + face.out[2] * o];
    const tip: Vec3 = [foot[0] + face.u[0] * lean, height, foot[2] + face.u[2] * lean];
    sink.member('structureWood', foot, tip, 0.03, 0.03, face.out, { ...DECOR, colour: [leaf[0] * 0.9, leaf[1] * 1.1, leaf[2]], exposed: true }, 0.015);
    const tone = 0.82 + rng() * 0.3;
    const c: Rgb = [Math.min(1, bloom[0] * tone), Math.min(1, bloom[1] * tone), Math.min(1, bloom[2] * tone)];
    const flowers = 4 + Math.floor(rng() * 3);
    for (let f = 0; f < flowers; f++) {
      const t = 0.5 + 0.48 * f / flowers, s = 0.1 - f * 0.008;
      const x = foot[0] + (tip[0] - foot[0]) * t, y = foot[1] + (tip[1] - foot[1]) * t, z = foot[2] + (tip[2] - foot[2]) * t;
      // the flowers read near (EmitOptions.fine 'near'); past that distance the stalks and the leafy foot remain
      sink.box('structureWood', [x, y, z], [s / 2, s / 2, s / 2], { ...DECOR, colour: c, fine: 'near' });
    }
  }
}
