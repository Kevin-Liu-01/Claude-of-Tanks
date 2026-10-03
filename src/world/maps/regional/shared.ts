// src/world/maps/regional/shared.ts — structures several regional kits share, built in whatever masonry the kit
// paints (its stone surface): the brick or stone factory stack (regional-buildings lane, 2026-10-03).
import { PartSink, faceBox, rgb, type Face, type RegionalParts } from './geometry.ts';
import type { RegionalBuildContext, RegionalBuilder } from './types.ts';

const uvOffset = (ctx: RegionalBuildContext): [number, number] => [ctx.rng() * 7.31, ctx.rng() * 5.17];

/**
 * A factory stack: a square plinth with a cornice, a tapering shaft of the kit's masonry, a corbelled crown blackened
 * by the smoke (the base stack's plot).
 */
export const factoryStack: RegionalBuilder = (ctx): RegionalParts => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const base = Math.max(2.2, Math.min(3.6, Math.min(ctx.info.w, ctx.info.d) - 0.4));
  const total = Math.max(18, Math.min(34, ctx.info.h > 8 ? ctx.info.h : 26 + rng() * 6));
  const plinthH = 3.2 + rng() * 1.2;
  sink.span('stone', -base / 2, -0.4, -base / 2, base / 2, plinthH, base / 2);
  sink.span('stone', -base / 2 - 0.12, plinthH, -base / 2 - 0.12, base / 2 + 0.12, plinthH + 0.3, base / 2 + 0.12, { decor: true });
  const r0 = base * 0.42, r1 = base * 0.26, shaft = total - plinthH - 1.4;
  sink.cylinder('stone', [0, plinthH + 0.3, 0], 'y', shaft, r0, 8, {}, r1, true, Math.PI / 8);
  // the crown: two corbelled bands and the sooty mouth
  const crownY = plinthH + 0.3 + shaft;
  sink.cylinder('stone', [0, crownY, 0], 'y', 0.5, r1 * 1.18, 8, { shade: 0.62 }, r1 * 1.25, true, Math.PI / 8);
  sink.cylinder('stone', [0, crownY + 0.5, 0], 'y', 0.6, r1 * 1.1, 8, { shade: 0.45 }, r1 * 1.08, true, Math.PI / 8);
  // a cleaning door at the foot of the plinth
  const face: Face = { origin: [0, 0, base / 2], u: [1, 0, 0], out: [0, 0, 1], width: base };
  faceBox(sink, 'structureMetal', face, 0, 0.75, 0.02, 0.7, 1.1, 0.04, { colour: rgb(0x3a3c3e), decor: true });
  return sink.finish();
};
