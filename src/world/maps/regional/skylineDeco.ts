// src/world/maps/regional/skylineDeco.ts — the skyline kit's inter-war deco tower as the Shanghai kit's Bund towers build it
// (shanghaiBund.ts bundTower: arcology, megatower, needletower), copied from skyline.ts decoTower as it was (the looks
// lane's r2 sweep, sub-stream b-east, 2026-10-16: lane B is parked, so the builder is taken extract-then-own; skyline.ts
// keeps its own for the generic city kit) for this lane to rebuild on the r2 standard.
import { faceBox, PartSink, type RegionalBucket } from './geometry.ts';
import { recordBody } from './house.ts';
import type { RegionalBuilder } from './types.ts';
import {
  BRONZE, COPPER, DECOR, STEEL, damageOf, fit, inset, pierFinials, podium, pyramidCrown, rectFaces, skylineUvOffset as uvOffset, spire, tierDamage, towerTier,
  type SkylineOptions, type TowerFacade,
} from './skyline.ts';

/**
 * The art-deco tower of the Bund: a granite podium, a shaft of continuous piers over recessed spandrels in two or three
 * setbacks, the crown a copper pyramid (Sassoon House), a stepped crown with a flagstaff (Broadway Mansions) or a needle.
 */
export function decoTower(opts: SkylineOptions & { crown?: 'pyramid' | 'stepped' | 'needle' } = {}): RegionalBuilder {
  return (ctx) => {
    const sink = new PartSink(uvOffset(ctx));
    const rng = ctx.rng;
    const damage = damageOf(ctx, opts.damage);
    const plot = fit(ctx, 12, 12);
    const crown = opts.crown ?? (['pyramid', 'stepped', 'needle'] as const)[Math.floor(rng() * 3)];
    const stone: RegionalBucket = 'stone';
    const podiumH = 8.5;
    podium(sink, plot, podiumH, stone, rng, { arcade: rng() < 0.5 });
    // (props census #9, E13: the tower reader) the podium and the shaft (its first tier's plan, to the crown, in storey
    // bands) as bodies for the damage reading: the podium breaks as a house, the shaft topples
    recordBody(sink, (plot.x0 + plot.x1) / 2, (plot.z0 + plot.z1) / 2, plot.x1 - plot.x0, plot.z1 - plot.z0, podiumH, stone);
    // the vertical line of the deco shaft: piers standing well out, the spandrels set back between them and darker
    const facade: TowerFacade = {
      pier: { bucket: stone, w: 0.66, out: 0.5 }, spandrel: { bucket: stone, h: 1.1, out: 0.07, shade: 0.62 },
      bay: 2.2, lit: 0.32, glazing: 'bays', mullions: 1, mullion: BRONZE,
    };
    const total = opts.floors ?? Math.max(6, Math.min(22, Math.round((ctx.info.h > 20 ? ctx.info.h : 48) / 3.6)));
    const fh = 3.6;
    // the shaft in tiers: each a setback over the last, the top one carrying the crown
    const tiers = total > 12 ? 3 : 2;
    let r = inset(plot, Math.min(1.2, (plot.x1 - plot.x0) * 0.05));
    let y = podiumH, left = total;
    const first = Math.round(total * 0.55);
    const dmg = tierDamage(rng, damage, first);
    for (let t = 0; t < tiers; t++) {
      const n = t === tiers - 1 ? left : t === 0 ? first : Math.round(total * 0.28);
      const tierDmg = t === 0 ? dmg : { ...dmg, corner: null, blown: null, burnt: new Set<number>(), holes: dmg.holes.filter((h) => h.floor < n) };
      const top = towerTier(sink, r, y, n, fh, facade, tierDmg, rng);
      // the setback: the piers carried up past the parapet as finials, the terrace parapet between them
      // (from the tier's top: run 0.3 m down it stood behind the top floor's glass, the pane on stone instead of the dark)
      sink.span(stone, r.x0, top, r.z0, r.x1, top + 0.9, r.z1);
      pierFinials(sink, r, top + 0.9, facade.bay, stone);
      left -= n; y = top;
      if (left <= 0) break;
      const k = Math.min((r.x1 - r.x0) * 0.16, (r.z1 - r.z0) * 0.16, 3.2);
      r = inset(r, k);
    }
    // the crown
    const cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2, half = Math.min(r.x1 - r.x0, r.z1 - r.z0) / 2;
    {
      const r0 = inset(plot, Math.min(1.2, (plot.x1 - plot.x0) * 0.05));
      recordBody(sink, (r0.x0 + r0.x1) / 2, (r0.z0 + r0.z1) / 2, r0.x1 - r0.x0, r0.z1 - r0.z0, y + 0.9, stone, false, true);
    }
    if (damage === 3) {
      // the crown shot away: its stump and the broken frame
      sink.span(stone, cx - half * 0.6, y + 0.9, cz - half * 0.6, cx + half * 0.6, y + 3.1, cz + half * 0.6);
    } else if (crown === 'pyramid') {
      sink.span(stone, cx - half * 0.86, y + 0.9, cz - half * 0.86, cx + half * 0.86, y + 4.1, cz + half * 0.86);
      pyramidCrown(sink, cx, cz, half * 0.92, y + 4.1, half * 1.5, COPPER);
    } else if (crown === 'stepped') {
      // the ziggurat crown: three stepped drums, each ringed by fins, a flagstaff on the last
      let s = half * 0.82, yy = y + 0.9;
      for (let k = 0; k < 3; k++) {
        sink.span(stone, cx - s, yy, cz - s, cx + s, yy + 2.6, cz + s);
        for (const face of rectFaces({ x0: cx - s, x1: cx + s, z0: cz - s, z1: cz + s })) {
          // (the fins stand 0.6 m over the drum: their backs drawn, a centimetre off it)
          for (let f = -1; f <= 1; f++) faceBox(sink, stone, face, f * s * 0.55, yy + 1.6, 0.19, 0.28, 3.2, 0.36, { ...DECOR, fineSides: true });
        }
        yy += 2.6; s *= 0.7;
      }
      sink.cylinder('structureMetal', [cx, yy, cz], 'y', 9, 0.1, 6, { ...DECOR, colour: STEEL }, 0.05);
    } else {
      sink.span(stone, cx - half * 0.5, y + 0.9, cz - half * 0.5, cx + half * 0.5, y + 5.4, cz + half * 0.5);
      spire(sink, cx, cz, y + 5.4, half * 0.42, half * 3.2, COPPER, null);
    }
    return sink.finish();
  };
}
