// src/world/maps/regional/arcticShed.ts — DYE-M's utility shed (the arctic kit's woodshed), moved out of arctic.ts byte
// for byte (props census #17, the looks lane's vernacular sub-stream, 2026-10-15; the coordinator's extract-then-own
// grant). arctic.ts builds its table from it, as it does arcticYard.ts's builders.
import { PartSink, faceBox, rgb, shade } from './geometry.ts';
import { windowUnit } from './openings.ts';
import type { RegionalBuilder } from './types.ts';
import { PLY, STEEL_DARK, WINDOW, boxFace, uvOffset, wallsIn } from './arctic.ts';

type Paint = 'plaster' | 'plaster2' | 'plaster3';
const ORANGE = rgb(0xc4602b);

/**
 * The utility shed (the woodshed's plot, its door to +x): a plywood hut on runners so it can be towed, painted, a small
 * window, a vent stack, the fuel drums beside it.
 */
export const shed: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng, look = ctx.variant, mobile = ctx.tier === 'mobile';
  const fit = wallsIn(ctx, 0.15, 0.15);
  const W = Math.max(2.4, fit.w), D = Math.max(2.4, fit.d), paint: Paint = look() < 0.6 ? 'plaster2' : 'plaster';
  sink.placed(0, fit.cx, 0, fit.cz, () => {
    for (const z of [-D / 2 + 0.3, D / 2 - 0.3]) sink.span('wood', -W / 2, -0.2, z - 0.12, W / 2, 0.25, z + 0.12);
    const w = W - 0.9;
    sink.span(paint, -W / 2, 0.25, -D / 2, -W / 2 + w, 2.6, D / 2);
    sink.span('roof', -W / 2 - 0.15, 2.6, -D / 2 - 0.15, -W / 2 + w + 0.15, 2.78, D / 2 + 0.15);
    const f = boxFace(-W / 2, -D / 2, -W / 2 + w, D / 2, 'e');
    faceBox(sink, 'structureMetal', f, -D * 0.15, 1.3, 0.03, 0.85, 1.95, 0.05, { colour: shade(PLY, 0.75), decor: true });
    windowUnit(sink, f, D * 0.25, 1.45, 0.6, 0.55, WINDOW, rng, 0.5);
    if (!mobile) sink.cylinder('structureMetal', [-W / 2 + w * 0.3, 2.78, D * 0.2], 'y', 0.9, 0.1, 8, { colour: STEEL_DARK, decor: true });
    // the fuel drums on the open side
    for (let k = 0; k < 2; k++) sink.cylinder('structureMetal', [W / 2 - 0.4, 0, -D / 2 + 0.5 + k * 0.62], 'y', 0.88, 0.29, 10, { colour: k ? shade(ORANGE, 0.8) : STEEL_DARK });
  });
  return sink.finish();
};
