// src/world/maps/regional/olympus.ts — the Olympus Basin station kit (the looks lane, 2026-10-13; LOOKS-BRIEF section 6:
// "Mars and the Moon need a station kit ... Today they have only gantries and container rows (Mars)"). Olympus Basin is
// the future (periodClutterKit: 2100); the station's habitats, greenhouses, depots, masts and lander are its authored
// set pieces (marsSettlement.ts, structureKit's orbital families). Its plan's two generic types were the rail yard's —
// a gantry crane over sleepers and a row of ISO boxes, a goods yard on Mars. This kit builds them as the station would:
//   - gantry        the regolith works (ISRU): two piers of sintered regolith blocks, a steel truss bridge across them
//                   with its trolley and bucket, the hopper and the processing drum under it, the feed conveyor
//                   rising from the regolith heap;
//   - containerRow  the pressurised cargo modules: white cylinders on cradles, their hatches orange, laid side by side
//                   and banked in sandbagged regolith to their shoulders against radiation, a catwalk along their tops.
// Coherent with the set pieces: their white panelling, their safety orange and their dark cells (structureKit PAL.orbital,
// MARS_ACCENT), the basin's own regolith for the masonry (the kit's stone: sintered blocks, red ochre).
import { PartSink, faceBox, rgb, shade, type Face, type RegionalParts, type Vec3 } from './geometry.ts';
import type { ArchitectureStyle, RegionalBuildContext, RegionalBuilder } from './types.ts';

const WHITE = rgb(0xd4d9de), PANEL = rgb(0xeef1f3), DARK = rgb(0x4c545b), ORANGE = rgb(0xd8712a), CELL = rgb(0x1f2f4a);
const STEEL = rgb(0x6a6f74), RUST_DUST = rgb(0xa86a4a);
const M = 'structureMetal' as const;

const uvOffset = (ctx: RegionalBuildContext): [number, number] => [ctx.rng() * 7.31, ctx.rng() * 5.17];
const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);

/** A straight steel member between two points (a truss chord, a brace, a rail). */
function strut(sink: PartSink, a: Vec3, b: Vec3, t: number, colour = STEEL, decor = false): void {
  sink.member(M, a, b, t, t, [0, 1, 0], { colour, ...(decor ? { decor: true } : {}), exposed: true }, 0);
}

/** The regolith works under its gantry. */
const isruGantry: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, bb = ctx.bounds, mobile = ctx.tier === 'mobile';
  // (item/maps-olympus-227: the piers' outer faces stand on the base's reach, as every new kit's body does — the
  // regionalArchitecture coverage rule, COVER_M — so no lane opens beside the works; was clamp(w - 1.6, 11, 17))
  const span = clamp(bb.maxX - bb.minX - 2.0, 11, 19), depth = clamp(bb.maxZ - bb.minZ - 0.6, 3.2, 5.2);
  const legH = clamp((bb.maxY ?? 11) - 1.6, 8.5, 10.5);
  // the piers: sintered regolith blocks in courses, battered, a steel bearing plate on each
  for (const s of [-1, 1]) {
    const x = s * span / 2;
    for (let k = 0; k < 4; k++) {
      const y0 = k * legH / 4 - (k === 0 ? 0.4 : 0), y1 = (k + 1) * legH / 4, inset = k * 0.12;
      sink.span('stone', x - 1.0 + inset, y0, -depth / 2 + inset, x + 1.0 - inset, y1, depth / 2 - inset);
    }
    sink.span(M, x - 0.75, legH, -depth / 2 + 0.4, x + 0.75, legH + 0.18, depth / 2 - 0.4, { colour: DARK });
  }
  // the truss bridge: top and bottom chords on both faces, verticals and diagonals, the cross members
  const y0 = legH + 0.18, y1 = legH + 1.55, hz = depth / 2 - 0.55;
  for (const z of [-hz, hz]) {
    strut(sink, [-span / 2 - 0.4, y0, z], [span / 2 + 0.4, y0, z], 0.22, WHITE);
    strut(sink, [-span / 2 - 0.4, y1, z], [span / 2 + 0.4, y1, z], 0.22, WHITE);
    const bays = Math.round(span / 1.8);
    for (let k = 0; k <= bays; k++) {
      const x = -span / 2 + k * span / bays;
      strut(sink, [x, y0, z], [x, y1, z], 0.12, WHITE, true);
      if (k < bays) strut(sink, [x, (k % 2 ? y0 : y1), z], [x + span / bays, (k % 2 ? y1 : y0), z], 0.1, WHITE, true);
    }
  }
  for (let k = 0; k <= 4; k++) strut(sink, [-span / 2 + k * span / 4, y1, -hz], [-span / 2 + k * span / 4, y1, hz], 0.12, WHITE, true);
  // the trolley over the hopper, its bucket hanging on its cables
  const tx = -span * 0.12 + (rng() - 0.5) * span * 0.2;
  // (its frame under the bottom chords, its wheels on them)
  sink.span(M, tx - 0.9, y0 - 0.5, -hz - 0.05, tx + 0.9, y0 + 0.02, hz + 0.05, { colour: ORANGE });
  for (const z of [-0.5, 0.5]) strut(sink, [tx, y0 - 0.48, z], [tx, 5.18, z], 0.04, DARK, true);
  sink.span(M, tx - 0.8, 4.3, -0.8, tx + 0.8, 5.2, 0.8, { colour: shade(ORANGE, 0.8), decor: true });
  // the hopper and the processing drum under the bridge, on their stands
  sink.span(M, -1.2, 0, -1.2, 1.2, 0.35, 1.2, { colour: DARK });
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) sink.span(M, x - 0.1, 0.35, z - 0.1, x + 0.1, 3.2, z + 0.1, { colour: STEEL });
  sink.cylinder(M, [0, 3.2, 0], 'y', 1.4, 1.35, 12, { colour: WHITE }, 0.35);
  sink.cylinder(M, [0, 4.6, 0], 'y', 0.5, 1.35, 12, { colour: PANEL });
  // (the drum on its two saddles, its inspection port let into its side at the axis)
  sink.cylinder(M, [span * 0.22, 1.15, 0], 'x', span * 0.18, 1.0, 14, { colour: WHITE });
  for (const x of [span * 0.22 + 0.2, span * 0.22 + span * 0.18 - 0.2]) sink.span(M, x - 0.12, 0, -0.9, x + 0.12, 0.6, 0.9, { colour: DARK });
  faceBox(sink, M, { origin: [span * 0.22 + span * 0.09, 0, 0.9], u: [1, 0, 0], out: [0, 0, 1], width: span * 0.18 }, 0, 1.15, 0.05, 0.6, 0.6, 0.12, { colour: CELL, decor: true });
  // the feed conveyor rising from the heap at the -x pier to the hopper's mouth, its tail pulley's frame on the ground
  // (item/maps-olympus-227: the belt and its frame are solid, so they stand on every tier — a phone's collision is the
  // desktop's; only the trestles under the belt are the desktop's dressing)
  strut(sink, [-span / 2 + 1.4, 0.6, 0], [-1.3, 4.6, 0], 0.5, STEEL);
  sink.span(M, -span / 2 + 1.0, 0, -0.4, -span / 2 + 1.8, 0.75, 0.4, { colour: DARK });
  if (!mobile) {
    for (let k = 1; k < 4; k++) {
      const x = -span / 2 + 1.4 + k * (span / 2 - 2.7) / 4, y = 0.6 + k * 4.0 / 4;
      strut(sink, [x, 0, 0], [x, y - 0.15, 0], 0.1, STEEL, true);
    }
  }
  // the regolith heap at the conveyor's foot (the masonry's own stone in rough blocks, low)
  for (let k = 0; k < 5; k++) {
    const x = -span / 2 + 2.2 + (rng() - 0.5) * 1.6, z = (rng() - 0.5) * (depth - 1.2), s = 0.5 + rng() * 0.5;
    sink.span('stone', x - s, -0.2, z - s * 0.8, x + s, 0.25 + rng() * 0.35, z + s * 0.8, { decor: true });
  }
  void RUST_DUST;
  return sink.finish();
};

/** The pressurised cargo modules banked in regolith. */
const cargoModules: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, bb = ctx.bounds, mobile = ctx.tier === 'mobile';
  const W = bb.maxX - bb.minX - 0.4, D = bb.maxZ - bb.minZ - 0.6;
  // (item/maps-olympus-227: the modules run the base's depth to within the coverage rule's COVER_M, their banks with
  // them, so no lane opens at their ends; was clamp(D - 1.6, 4.5, 6.5))
  const r = clamp(D * 0.17, 1.05, 1.35), len = clamp(D - 0.2, 4.5, 6.6);
  const n = Math.max(2, Math.floor(W / (2 * r + 0.55)));
  const pitch = W / n, x0 = bb.minX + 0.2 + pitch / 2, zc = (bb.minZ + bb.maxZ) / 2;
  for (let k = 0; k < n; k++) {
    const x = x0 + k * pitch;
    // the cradle and the module, its hatch end orange
    for (const z of [zc - len * 0.32, zc + len * 0.32]) sink.span(M, x - r * 0.9, -0.2, z - 0.18, x + r * 0.9, 0.55, z + 0.18, { colour: DARK });
    sink.cylinder(M, [x, r + 0.35, zc - len / 2], 'z', len, r, 16, { colour: k % 3 === 1 ? PANEL : WHITE });
    sink.cylinder(M, [x, r + 0.35, zc + len / 2], 'z', 0.12, r * 0.92, 16, { colour: ORANGE });
    const hatch: Face = { origin: [x, 0, zc + len / 2 + 0.12], u: [1, 0, 0], out: [0, 0, 1], width: 2 * r };
    faceBox(sink, M, hatch, 0, r + 0.35, 0.02, r * 0.9, r * 0.9, 0.05, { colour: shade(ORANGE, 0.75), decor: true });
    faceBox(sink, M, hatch, 0, r + 0.35, 0.05, r * 0.3, r * 0.08, 0.04, { colour: DARK, decor: true });
    // the bands round its hull
    if (!mobile) for (const z of [zc - len / 3, zc, zc + len / 3]) sink.cylinder(M, [x, r + 0.35, z - 0.06], 'z', 0.12, r + 0.03, 16, { colour: DARK, decor: true });
    // the regolith banked against it between the modules to the shoulder: sintered block bags in courses
    if (k < n - 1) {
      const gx = x + pitch / 2;
      for (let c = 0; c < 3; c++) {
        const hw = (pitch - 2 * r) / 2 + r * (0.85 - c * 0.28), y0 = c * 0.55 - (c === 0 ? 0.3 : 0), y1 = (c + 1) * 0.55;
        sink.span('stone', gx - hw, y0, zc - len / 2 + 0.2, gx + hw, y1 + rng() * 0.08, zc + len / 2 - 0.3);
      }
    }
  }
  // the bank's ends at the row's two sides, and the catwalk along the module tops on its posts
  for (const s of [-1, 1]) {
    const ex = s < 0 ? bb.minX + 0.2 : bb.maxX - 0.2;
    for (let c = 0; c < 3; c++) sink.span('stone', s < 0 ? ex : ex - (1.0 - c * 0.3), c * 0.55 - (c === 0 ? 0.3 : 0), zc - len / 2 + 0.2,
      s < 0 ? ex + (1.0 - c * 0.3) : ex, (c + 1) * 0.55, zc + len / 2 - 0.3);
  }
  const cy = 2 * r + 0.32; // (the catwalk's deck on the hulls' crowns)
  sink.span(M, bb.minX + 0.4, cy, zc - 0.35, bb.maxX - 0.4, cy + 0.06, zc + 0.35, { colour: STEEL, decor: true });
  if (!mobile) {
    // the catwalk's handrails on their posts
    for (const z of [zc - 0.35, zc + 0.35]) {
      sink.span(M, bb.minX + 0.4, cy + 0.95, z - 0.025, bb.maxX - 0.4, cy + 1.0, z + 0.025, { colour: ORANGE, decor: true });
      const posts = Math.max(2, Math.round((W - 0.4) / 2.2));
      for (let k = 0; k <= posts; k++) {
        const x = bb.minX + 0.45 + k * (W - 0.5) / posts;
        sink.span(M, x - 0.025, cy + 0.06, z - 0.025, x + 0.025, cy + 0.96, z + 0.025, { colour: STEEL, decor: true });
      }
    }
  }
  return sink.finish();
};

export const OLYMPUS_BUILDERS: Readonly<Record<string, RegionalBuilder>> = Object.freeze({
  gantry: isruGantry,
  containerRow: cargoModules,
});

export const OLYMPUS_STYLE: ArchitectureStyle = Object.freeze<ArchitectureStyle>({
  id: 'olympus',
  region: 'Olympus Basin, Mars, 2100: a research station on the basin floor — its regolith works under a gantry and its pressurised cargo modules banked in sintered regolith, in the habitats\' white panelling and safety orange',
  surfaces: {
    // the station's sheet roofs, pale and dusted
    roof: { kind: 'sheet', tint: [0.78, 0.72, 0.68] },
    // sintered regolith blocks: the basin's red ochre
    stone: { kind: 'block', tint: [0.62, 0.4, 0.3] },
    sourced: { plaster: false, wood: false },
  },
  builders: OLYMPUS_BUILDERS,
  // a dry, dusty world: no damp, no moss; the dust settles at the feet
  weather: {
    plaster: [[1, 1, 1], [0.98, 0.96, 0.94]],
    stone: [[1, 1, 1], [0.95, 0.92, 0.9], [1.03, 0.98, 0.95]],
    roof: [[1, 1, 1], [0.96, 0.92, 0.88]],
    damp: 0.05, moss: 0,
  },
  wear: 0.05,
});

export type { RegionalParts };
