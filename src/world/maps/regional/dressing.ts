// src/world/maps/regional/dressing.ts — the lived-in dressing of the regional kits' houses (regional-buildings lane,
// 2026-10-03; gauntlet wave 0: "box buildings ... no yards, wires, wear"). Small attached parts a house carries in
// the real place: flower boxes under the windows, the bench by the door, a woodpile under the eaves, the roof ladder
// to the stack, a television aerial on the ridge, a potted plant on a stair. All dressing (no collision); a kit draws
// their choices from its build stream and leaves them out on phones.
import { faceBox, normalize3, type Face, type PartSink, type Rgb, type Vec3 } from './geometry.ts';
import type { HouseFrame } from './house.ts';

const DECOR = { decor: true } as const;

/** A planted window box on its brackets under a window (u, y: the window's bottom-centre on the face). */
export function flowerBox(sink: PartSink, face: Face, u: number, y: number, w: number, box: Rgb, bloom: Rgb, rng: () => number): void {
  const bw = w + 0.12, by = y - 0.24;
  faceBox(sink, 'structureWood', face, u, by, 0.13, bw, 0.18, 0.2, { ...DECOR, colour: box });
  for (const side of [-1, 1]) faceBox(sink, 'structureMetal', face, u + side * (bw / 2 - 0.08), by - 0.12, 0.08, 0.03, 0.12, 0.14, { ...DECOR, colour: [0.12, 0.12, 0.12] });
  // the foliage mound and the blooms above it (geraniums hang over the front edge)
  const leaf: Rgb = [0.13 + rng() * 0.04, 0.24 + rng() * 0.06, 0.08];
  faceBox(sink, 'structureWood', face, u, by + 0.15, 0.15, bw - 0.06, 0.14, 0.24, { ...DECOR, colour: leaf });
  const n = Math.max(3, Math.round(bw / 0.22));
  for (let k = 0; k < n; k++) {
    const t = (k + 0.5) / n, uu = u - bw / 2 + 0.04 + (bw - 0.08) * t;
    const s = 0.07 + rng() * 0.05, lift = rng() * 0.06;
    faceBox(sink, 'structureWood', face, uu, by + 0.2 + lift, 0.2 + rng() * 0.06, s, s, s, { ...DECOR, colour: bloom });
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

/** A terracotta pot with a plant (a stair tread, a doorstep, a wall top). (x, y, z) is the pot's base. */
export function pottedPlant(sink: PartSink, x: number, y: number, z: number, size: number, rng: () => number): void {
  const clay: Rgb = [0.56 + rng() * 0.08, 0.26 + rng() * 0.04, 0.15];
  sink.cylinder('structureWood', [x, y, z], 'y', size * 0.8, size * 0.36, 7, { ...DECOR, colour: clay }, size * 0.48);
  const leaf: Rgb = [0.12 + rng() * 0.05, 0.26 + rng() * 0.08, 0.07];
  sink.cylinder('structureWood', [x, y + size * 0.8, z], 'y', size * 0.5, size * 0.5, 7, { ...DECOR, colour: leaf }, size * 0.18);
}
