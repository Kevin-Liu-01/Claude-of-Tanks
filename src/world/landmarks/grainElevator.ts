// grainElevator.ts — the grain elevator (moved here from civic.ts for props census #3, lane B 2026-10-14; the judges:
// "a smooth-silo battery, a gallery with its windows as zero-width quads, a plain tower with a gable on it"). The Soviet
// elevator of the 1930s-50s on the steppe's sidings: the slip-formed silo battery, the gallery over it in a band of
// windows, the working tower stepped at its top under a flat roof and parapet, its bucket-elevator legs up its back,
// the truck receiving shed at the battery's end and the rail loading canopy and spout over the siding.
import { PartSink, faceBox, rgb, shade, type RegionalBucket, type Vec3 } from '../maps/regional/geometry.ts';
import { emitRoof, roofGeometry, type RoofSpec } from '../maps/regional/house.ts';
import { archWindow, archedBody, bar, revolve, type ArchHole, type FaceName } from './kit.ts';
import type { LandmarkBuilder } from './types.ts';

const IRON = rgb(0x2b2d2e), RUST = rgb(0x6a4434), SPOUT = rgb(0x5d6062);

const uvOffset = (rng: () => number): [number, number] => [rng() * 7.31, rng() * 5.17];

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
    for (let y = 4.5; y < H - 1; y += 4.5) revolve(sink, concrete, x, z, [[r + 0.02, y], [r + 0.02, y + 0.14]], 16, { decor: true, shade: 0.84 });
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
  // the gallery along the tops: a concrete box in a band of windows set in their reveals, its flat roof under a coping
  const gx1 = x0 + cols * 2 * r, ga = x0 + r * 0.4, gLen = gx1 - ga, gy0 = H + 0.35, gy1 = H + 2.9;
  const gWin: ArchHole[] = [];
  for (let u = -gLen / 2 + 1.9; u < gLen / 2 - 1.2; u += 3.2) gWin.push({ u, w: 1.6, y0: gy0 + 0.95, spring: gy0 + 2.05, form: 'flat' });
  const gf = archedBody(sink, concrete, ga + gLen / 2, 0, gLen, 3.2, gy0, gy1, { front: gWin, back: gWin.map((h) => ({ ...h, u: -h.u })) }, 0.18);
  for (const name of ['front', 'back'] as const) for (const h of name === 'front' ? gWin : gWin.map((q) => ({ ...q, u: -q.u }))) archWindow(sink, gf[name], h, 0.18, rgb(0x3e4a48), false, { bars: true, coarse: true });
  sink.span(concrete, ga - 0.15, gy1, -1.75, gx1, gy1 + 0.2, 1.75, { shade: 0.9 });
  sink.span(concrete, ga - 0.1, gy0 - 0.12, -1.7, gx1, gy0 + 0.02, 1.7, { decor: true, shade: 0.8 });
  // the working tower: its windows up the faces in their reveals, the door at its foot, corner pilasters, a band at
  // the gallery's floor; stepped at the top into the head storey in its window band, under flat roofs and parapets
  const hx0 = gx1 - 0.2, hw = 7.0, hd = Math.max(8, rows * 2 * r + 1), cx = hx0 + hw / 2;
  const holes: Partial<Record<FaceName, ArchHole[]>> = { front: [{ u: -1.8, w: 1.5, y0: 0, spring: 2.5, form: 'flat' }], back: [], right: [] };
  for (let y = 4; y < head - 4; y += 4.4) {
    holes.front!.push({ u: 1.2, w: 1.0, y0: y, spring: y + 1.6, form: 'flat' });
    holes.back!.push({ u: 0, w: 1.0, y0: y, spring: y + 1.6, form: 'flat' });
    holes.right!.push({ u: 0, w: 1.0, y0: y, spring: y + 1.6, form: 'flat' });
  }
  const hf = archedBody(sink, concrete, cx, 0, hw, hd, base, head, holes, 0.25);
  for (const name of ['front', 'back', 'right'] as const) for (const h of holes[name] ?? []) {
    if (h.y0 === 0) continue;
    archWindow(sink, hf[name], h, 0.25, rgb(0x4a5a58), false, { bars: true, coarse: true });
  }
  faceBox(sink, 'structureMetal', hf.front, -1.8, 1.25, -0.22, 1.44, 2.46, 0.05, { colour: RUST, decor: true });
  sink.span(concrete, cx - 2.9, 2.7, hd / 2, cx - 0.7, 2.85, hd / 2 + 1.0, { decor: true, shade: 0.85 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    sink.span(concrete, cx + sx * hw / 2 - (sx > 0 ? 0.35 : -0.15) - 0.25, 0.4, sz * hd / 2 - (sz > 0 ? 0.35 : -0.15) - 0.25,
      cx + sx * hw / 2 - (sx > 0 ? 0.35 : -0.15) + 0.25, head, sz * hd / 2 - (sz > 0 ? 0.35 : -0.15) + 0.25, { decor: true, shade: 0.94 });
  }
  sink.span(concrete, cx - hw / 2 - 0.12, gy0 - 0.1, -hd / 2 - 0.12, cx + hw / 2 + 0.12, gy0 + 0.2, hd / 2 + 0.12, { decor: true, shade: 0.86 });
  const prairie = String(ctx.params.style) === 'prairie';
  if (prairie) {
    const roof: RoofSpec = { kind: 'gable', pitchDeg: 30, eave: 0.3, verge: 0.3, thickness: 0.12, bucket: 'roof', ridge: null };
    sink.placed(0, cx, 0, 0, () => emitRoof(sink, roofGeometry(hw, hd, head, roof), roof));
  } else {
    // the tower's roof and its parapet, the head storey set back on it in its window band, its own roof and parapet
    sink.span(concrete, cx - hw / 2 - 0.1, head, -hd / 2 - 0.1, cx + hw / 2 + 0.1, head + 0.25, hd / 2 + 0.1, { shade: 0.9 });
    parapet(sink, concrete, cx, 0, hw + 0.2, hd + 0.2, head + 0.25, 0.9);
    const uw = hw - 1.6, ud = hd - 3.2, uh = 4.2;
    const band: ArchHole[] = [];
    for (let u = -ud / 2 + 1.3; u < ud / 2 - 0.8; u += 2.2) band.push({ u, w: 1.3, y0: head + 1.4, spring: head + 2.9, form: 'flat' });
    const ends: ArchHole[] = [{ u: -1.2, w: 1.3, y0: head + 1.4, spring: head + 2.9, form: 'flat' }, { u: 1.2, w: 1.3, y0: head + 1.4, spring: head + 2.9, form: 'flat' }];
    const uf = archedBody(sink, concrete, cx, 0, uw, ud, head + 0.25, head + uh, { left: band, right: band, front: ends, back: ends }, 0.2);
    for (const name of ['left', 'right', 'front', 'back'] as const) for (const h of name === 'left' || name === 'right' ? band : ends) {
      archWindow(sink, uf[name], h, 0.2, rgb(0x4a5a58), false, { bars: true, coarse: true });
    }
    sink.span(concrete, cx - uw / 2 - 0.15, head + uh, -ud / 2 - 0.15, cx + uw / 2 + 0.15, head + uh + 0.25, ud / 2 + 0.15, { shade: 0.88 });
    parapet(sink, concrete, cx, 0, uw + 0.3, ud + 0.3, head + uh + 0.25, 0.7);
    // the vent on the head storey's roof and the flag mast
    sink.span('structureMetal', cx - 0.6, head + uh + 0.25, -0.6, cx + 0.6, head + uh + 1.1, 0.6, { colour: shade(SPOUT, 0.9), decor: true });
    bar(sink, 'structureMetal', [cx + uw / 2 - 0.4, head + uh + 0.25, ud / 2 - 0.4], [cx + uw / 2 - 0.4, head + uh + 6.5, ud / 2 - 0.4], 0.07, { colour: IRON, decor: true });
  }
  // the bucket elevators' legs up the tower's back, their boots at the foot and heads under the roof
  for (const u of [-1.6, 1.6]) {
    sink.span('structureMetal', cx + u - 0.35, 0.3, -hd / 2 - 0.75, cx + u + 0.35, head - 1.2, -hd / 2, { colour: SPOUT, decor: true });
    sink.span('structureMetal', cx + u - 0.55, base, -hd / 2 - 1.05, cx + u + 0.55, 1.4, -hd / 2, { colour: shade(SPOUT, 0.85) });
    for (let y = 3; y < head - 2; y += 4.4) sink.span('structureMetal', cx + u - 0.42, y, -hd / 2 - 0.82, cx + u + 0.42, y + 0.12, -hd / 2, { colour: shade(SPOUT, 0.8), decor: true, fine: true });
  }
  // the loading spout leaning out over the track side (the connectivity sweep: its end hung in air: its hoist cable from
  // high on the head house to the spout's end, and the drop spout hanging from that end)
  bar(sink, 'structureMetal', [hx0 + hw, head * 0.55, 0], [hx0 + hw + 4.5, head * 0.32, 0], 0.35, { colour: SPOUT, decor: true });
  bar(sink, 'structureMetal', [hx0 + hw, head * 0.74, 0], [hx0 + hw + 4.3, head * 0.32 + 0.1, 0], 0.04, { colour: rgb(0x2e3032), decor: true });
  bar(sink, 'structureMetal', [hx0 + hw + 4.45, head * 0.32 + 0.05, 0], [hx0 + hw + 4.55, head * 0.32 - 1.4, 0], 0.26, { colour: SPOUT, decor: true });
  // the rail loading canopy over the siding's near side, on its struts back to the tower, the gutter along its edge
  const cy = 7.2, cx1 = hx0 + hw + 3.9;
  sink.span(concrete, hx0 + hw, cy, -4.2, cx1, cy + 0.22, 4.2, { shade: 0.88 });
  sink.span('structureMetal', cx1 - 0.05, cy - 0.12, -4.2, cx1 + 0.12, cy + 0.05, 4.2, { colour: IRON, decor: true });
  for (const z of [-3.6, 0.0, 3.6]) bar(sink, 'structureMetal', [hx0 + hw, cy - 3.0, z], [cx1 - 0.3, cy, z], 0.18, { colour: shade(SPOUT, 0.8), decor: true });
  // the truck receiving shed at the battery's -x end: a drive-through under its slab, its posts on the outer side, the
  // tipping pit's grating between them
  const rx1 = x0 - 0.2, rx0 = x0 - 2.85, ry = 5.0; // (inside the footprint: plan.ts cols·r + 9)
  sink.span(concrete, rx0 - 0.1, ry, -4.8, rx1, ry + 0.25, 4.8, { shade: 0.9 });
  for (const z of [-4.4, 0, 4.4]) {
    sink.span(concrete, rx0 - 0.1, base, z - 0.18, rx0 + 0.26, ry, z + 0.18);
    sink.span(concrete, rx1 - 0.3, 1.2, z - 0.18, rx1, ry, z + 0.18, { decor: true });
  }
  sink.span('structureMetal', rx0 + 0.6, 0.0, -1.6, rx1 - 0.6, 0.04, 1.6, { colour: rgb(0x1e1f20), decor: true });
  for (let z = -1.4; z < 1.5; z += 0.28) sink.span('structureMetal', rx0 + 0.6, 0.04, z - 0.03, rx1 - 0.6, 0.07, z + 0.03, { colour: IRON, decor: true, fine: true });
  // the cat ladder up the battery's end silo to its top, caged above head height
  const lx = x0 - 0.35, lz = -rows * r + r;
  for (const dz of [-0.24, 0.24]) bar(sink, 'structureMetal', [lx, 1.2, lz + dz], [lx, H + 1.0, lz + dz], 0.05, { colour: IRON, decor: true });
  for (let y = 1.5; y < H + 0.6; y += 0.35) bar(sink, 'structureMetal', [lx, y, lz - 0.24], [lx, y, lz + 0.24], 0.03, { colour: IRON, decor: true, fine: true });
  for (let y = 3.5; y < H + 0.6; y += 2.4) {
    bar(sink, 'structureMetal', [lx, y, lz - 0.38], [lx - 0.7, y, lz - 0.38], 0.03, { colour: IRON, decor: true, fine: true });
    bar(sink, 'structureMetal', [lx - 0.7, y, lz - 0.38], [lx - 0.7, y, lz + 0.38], 0.03, { colour: IRON, decor: true, fine: true });
    bar(sink, 'structureMetal', [lx - 0.7, y, lz + 0.38], [lx, y, lz + 0.38], 0.03, { colour: IRON, decor: true, fine: true });
  }
  // the harvest's lorries waiting in the yard before the silos (`trucks`, the props' destructible truck, a hull crushes)
  const trucks = Math.max(0, Math.min(4, Math.round(Number(ctx.params.trucks) || 0)));
  const destructibles = Array.from({ length: trucks }, (_, k) => ({ kind: 'truck', x: x0 + 4 + k * 7.5, z: rows * r + 5.5, yawDeg: 90 + (k % 2 ? 8 : -6) }));
  return { parts: sink.finish(), tints: { plaster3: [0.84, 0.83, 0.8] }, destructibles };
};

/** A flat roof's parapet round a w x d body at (cx, cz) from y: four walls and their coping. */
function parapet(sink: PartSink, bucket: RegionalBucket, cx: number, cz: number, w: number, d: number, y: number, h: number): void {
  const t = 0.2, x0 = cx - w / 2, x1 = cx + w / 2, z0 = cz - d / 2, z1 = cz + d / 2;
  sink.span(bucket, x0, y, z1 - t, x1, y + h, z1);
  sink.span(bucket, x0, y, z0, x1, y + h, z0 + t);
  sink.span(bucket, x0, y, z0 + t, x0 + t, y + h, z1 - t);
  sink.span(bucket, x1 - t, y, z0 + t, x1, y + h, z1 - t);
  sink.span(bucket, x0 - 0.05, y + h, z0 - 0.05, x1 + 0.05, y + h + 0.08, z1 + 0.05, { decor: true, shade: 0.82 });
}


