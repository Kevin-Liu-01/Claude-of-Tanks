// grainElevator.ts — props census #3 (lane B, 2026-10-14): the grain elevator moved here as it was from civic.ts, the industrial yard's
// src/world/landmarks/civic.ts — the civic set pieces (the landmarks lane, 2026-10-05): the church (an Orthodox village
// church of the black-earth governorates, or a Western hall church with its spire), the town hall with its clock
// tower, the railway station with its platform canopy, the market hall and the grain elevator. Proportions from the
// buildings themselves: a Kursk-governorate village church of 1800-1900 is a whitewashed brick "ship" — the bell tower,
// the refectory, the cube with its drum and dome, the apse — 25-32 m long, its bell tower 25-30 m to the cross.
import { PartSink, rgb, type RegionalBucket, type Vec3 } from '../maps/regional/geometry.ts';
import { emitRoof, roofGeometry, type RoofSpec } from '../maps/regional/house.ts';
import { archWindow, archedBody, bar, cross, dome, drum, moulding, revolve, smoothRender, type ArchHole, type FaceName } from './kit.ts';
import type { LandmarkBuildContext, LandmarkBuilder } from './types.ts';

const GILT = rgb(0xb8933e);
const BELL = rgb(0x5a4a32), IRON = rgb(0x2b2d2e);

const uvOffset = (rng: () => number): [number, number] => [rng() * 7.31, rng() * 5.17];

/** A share of the windows show a lit curtain at night. */
const lit = (ctx: LandmarkBuildContext, share: number) => ctx.variant() < share;

/** The cornice of a body: a frieze band and a projecting crown over it. */
function cornice(sink: PartSink, bucket: RegionalBucket, cx: number, cz: number, w: number, d: number, y: number, scale = 1): void {
  sink.placed(0, cx, 0, cz, () => {
    moulding(sink, bucket, w, d, y - 0.34 * scale, 0.2 * scale, 0.06 * scale);
    moulding(sink, bucket, w, d, y - 0.14 * scale, 0.18 * scale, 0.2 * scale);
  });
}

/** A bell: a revolved bronze bell hung under a beam at (x, y, z), `r` its mouth radius. */
function bell(sink: PartSink, x: number, y: number, z: number, r: number): void {
  revolve(sink, 'structureMetal', x, z, [[r, y - r * 1.25], [r * 0.92, y - r * 1.12], [r * 0.62, y - r * 0.7], [r * 0.56, y - r * 0.2], [r * 0.4, y],
    [0.0, y + 0.02]], 10, { colour: BELL, decor: true });
  sink.span('structureMetal', x - 0.03, y, z - 0.03, x + 0.03, y + 0.18, z + 0.03, { colour: IRON, decor: true });
}

/** A slender spire over a small dome: the needle (шпиль) of the classicist bell towers, a gilt ball and the cross. */
function needle(sink: PartSink, x: number, y: number, z: number, r: number, h: number): number {
  revolve(sink, 'structureMetal', x, z, [[r, y], [r * 0.18, y + h * 0.8], [0, y + h]], 8, { colour: GILT }, Math.PI / 8);
  const ballY = y + h * 0.74;
  revolve(sink, 'structureMetal', x, z, [[0.05, ballY - 0.22], [0.24, ballY - 0.12], [0.28, ballY], [0.24, ballY + 0.12], [0.05, ballY + 0.22]], 10,
    { colour: GILT, decor: true });
  return y + h;
}

// ---------------------------------------------------------------------------------------------------------- the church

/** The UV scale of a church's and a monument's lime render over the village print (kit.ts smoothRender). */

/**
 * The grain elevator (the Soviet 1930s and the prairie's concrete elevators): a battery of cylindrical silos in rows,
 * the conveyor gallery along their tops, the tall head house at one end with its windows, its gabled top and the
 * loading spout over the track.
 */
export const grainElevator: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const rows = Math.max(1, Math.min(3, Math.round(Number(ctx.params.rows)))), cols = Math.max(2, Math.round(Number(ctx.params.cols)));
  const r = Math.max(2, Number(ctx.params.radius)), H = Math.max(14, Number(ctx.params.height)), head = Math.max(H + 6, Number(ctx.params.head));
  const base = -0.6 - ctx.groundFall, concrete: RegionalBucket = 'plaster3';
  // the whole run — silos, head house (7 m) and the spout (4.8 m) — centred on the piece
  const x0 = -(cols * 2 * r + 7.0 + 4.8) / 2;
  sink.span(concrete, x0 - 0.2, base, -rows * r - 0.2, x0 + cols * 2 * r + 0.2, 1.2, rows * r + 0.2);
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const x = x0 + r + i * 2 * r, z = -rows * r + r + j * 2 * r;
    revolve(sink, concrete, x, z, [[r, 1.2], [r, H], [r * 0.96, H + 0.12], [r * 0.3, H + 0.55], [0.001, H + 0.6]], 16);
    // the slip-form rings (the pours' joints) as faint bands
    for (let y = 3; y < H - 1; y += 3) revolve(sink, concrete, x, z, [[r + 0.02, y], [r + 0.02, y + 0.12]], 16, { decor: true, shade: 0.86 });
    // its age (gauntlet waves 154-158: "pristine"): the rain's runs down the concrete from the gallery and the domes, each
    // a strip bent round the silo two facets wide, darkest under the lip
    if (ctx.age) {
      const age = ctx.age;
      for (let k = 0; k < 4; k++) {
        const a0 = age() * Math.PI * 2, da = 0.18 + age() * 0.2, len = 4 + age() * (H - 6), depth = 0.24 + age() * 0.2;
        const top = H - 0.05, bottom = Math.max(1.6, top - len);
        for (const [aa, ab] of [[a0, a0 + da], [a0 + da, a0 + 2 * da]] as const) {
          const p = (a: number, y: number): Vec3 => [x + Math.cos(a) * (r + 0.03), y, z + Math.sin(a) * (r + 0.03)];
          // counter-clockwise from outside the silo (the angle runs clockwise seen from above as x→z)
          sink.quad(concrete, p(ab, top), p(ab, bottom), p(aa, bottom), p(aa, top), {
            decor: true, shadeAt: (q) => 1 - depth * Math.max(0, Math.min(1, (q[1] - bottom) / Math.max(0.5, top - bottom))),
          });
        }
      }
    }
  }
  // the gallery along the tops
  const gx1 = x0 + cols * 2 * r;
  sink.span(concrete, x0 + r * 0.4, H + 0.35, -1.6, gx1, H + 2.9, 1.6);
  sink.span('roof', x0 + r * 0.4 - 0.2, H + 2.9, -1.8, gx1, H + 3.05, 1.8);
  for (let x = x0 + r; x < gx1 - 1; x += 2.2) {
    for (const zs of [1, -1]) sink.quad('glass', [x, H + 1.4, zs * 1.61], [x + (zs > 0 ? 1 : -1) * 0.0, H + 1.4, zs * 1.61], [x, H + 2.2, zs * 1.61], [x, H + 2.2, zs * 1.61], { decor: true });
  }
  // the head house
  const hx0 = gx1 - 0.2, hw = 7.0, hd = Math.max(8, rows * 2 * r + 1);
  const holes: Partial<Record<FaceName, ArchHole[]>> = { front: [], back: [], right: [] };
  for (let y = 4; y < head - 4; y += 4.4) {
    holes.front!.push({ u: 0, w: 1.0, y0: y, spring: y + 1.6, form: 'flat' });
    holes.back!.push({ u: 0, w: 1.0, y0: y, spring: y + 1.6, form: 'flat' });
    holes.right!.push({ u: 0, w: 1.0, y0: y, spring: y + 1.6, form: 'flat' });
  }
  const hf = archedBody(sink, concrete, hx0 + hw / 2, 0, hw, hd, base, head, holes, 0.25);
  for (const name of ['front', 'back', 'right'] as const) for (const h of holes[name] ?? []) archWindow(sink, hf[name], h, 0.25, rgb(0x4a5a58), false, { bars: true });
  const roof: RoofSpec = { kind: 'gable', pitchDeg: 30, eave: 0.3, verge: 0.3, thickness: 0.12, bucket: 'roof', ridge: null };
  sink.placed(0, hx0 + hw / 2, 0, 0, () => emitRoof(sink, roofGeometry(hw, hd, head, roof), roof));
  // the loading spout leaning out over the track side
  bar(sink, 'structureMetal', [hx0 + hw, head * 0.55, 0], [hx0 + hw + 4.5, head * 0.32, 0], 0.35, { colour: rgb(0x5d6062), decor: true });
  // (the connectivity sweep: the spout's end hung in air) its hoist cable from high on the head house to the spout's
  // end, and the drop spout hanging from that end
  bar(sink, 'structureMetal', [hx0 + hw, head * 0.74, 0], [hx0 + hw + 4.3, head * 0.32 + 0.1, 0], 0.04, { colour: rgb(0x2e3032), decor: true });
  bar(sink, 'structureMetal', [hx0 + hw + 4.45, head * 0.32 + 0.05, 0], [hx0 + hw + 4.55, head * 0.32 - 1.4, 0], 0.26, { colour: rgb(0x5d6062), decor: true });
  // the harvest's lorries waiting in the yard before the silos (`trucks`, the props' destructible truck, a hull crushes)
  const trucks = Math.max(0, Math.min(4, Math.round(Number(ctx.params.trucks) || 0)));
  const destructibles = Array.from({ length: trucks }, (_, k) => ({ kind: 'truck', x: x0 + 4 + k * 7.5, z: rows * r + 5.5, yawDeg: 90 + (k % 2 ? 8 : -6) }));
  return { parts: sink.finish(), tints: { plaster3: [0.84, 0.83, 0.8] }, destructibles };
};

// ---------------------------------------------------------------------------------------------------------- granary

