// src/world/maps/regional/sharedStack.ts — the factory stack several regional kits share (shared.ts factoryStack), moved
// as it was (the looks lane's r2 sweep, sub-stream b-east, 2026-10-16: lane B is parked, so its builder is taken
// extract-then-own) for this lane to rebuild on the r2 standard.
import { PartSink, faceBox, normalize3, rgb, shade, type Face, type RegionalParts, type Rgb, type Vec3 } from './geometry.ts';
import { holedFace } from './house.ts';
import type { RegionalBuildContext, RegionalBuilder } from './types.ts';

const uvOffset = (ctx: RegionalBuildContext): [number, number] => [ctx.rng() * 7.31, ctx.rng() * 5.17];

const IRON: Rgb = rgb(0x2e2f31);

/**
 * A factory stack (props census #3, lane B 2026-10-14; the judges: "a plinth span and a cornice span, ONE 8-sided
 * tapered cylinder, two crown cylinders and a 4 cm cleaning-door plate"). The base stack's plot: a square plinth of the
 * kit's masonry on a sunk footing, a base course and a cornice, corner pilasters framing its faces, the flue inlet cut
 * through one face under a round head, its iron soot door set back in it; the
 * coursed shaft tapering in three lifts, darker with soot as it rises, an iron band at every lift and every 2.5 m; the
 * crown corbelled out in oversailing courses to a sooty mouth; an iron ladder up one side on stand-offs and a lightning
 * conductor up the other to a rod over the crown. The stream draws are the old stack's (total, plinth): the plot holds.
 * Its fall is shaft.ts's (damage.ts describeShaft reads the shaft's bands off its walls): it topples in drums.
 */
/** A slender run from a to b laid as lengths of at most `max` metres, each drawn by `draw`. */
function inLengths(a: Vec3, b: Vec3, draw: (p: Vec3, q: Vec3) => void, max = 4): void {
  const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]) / max));
  const at = (t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  for (let k = 0; k < n; k++) draw(at(k / n), at((k + 1) / n));
}

export const factoryStack: RegionalBuilder = (ctx): RegionalParts => {
  const sink = new PartSink(uvOffset(ctx));
  const rng = ctx.rng;
  const base = Math.max(2.2, Math.min(3.6, Math.min(ctx.info.w, ctx.info.d) - 0.4));
  const total = Math.max(18, Math.min(34, ctx.info.h > 8 ? ctx.info.h : 26 + rng() * 6));
  const plinthH = 3.2 + rng() * 1.2;
  const hb = base / 2, mobile = ctx.tier === 'mobile';
  // the plinth: three walls and the inlet's face round its hole, the top over them, its footing sunk
  sink.span('stone', -hb, -0.4, -hb, hb, plinthH, hb - 0.5);
  sink.span('stone', -hb, -0.4, hb - 0.5, -hb + 0.5, plinthH, hb);
  sink.span('stone', hb - 0.5, -0.4, hb - 0.5, hb, plinthH, hb);
  const front: Face = { origin: [0, 0, hb], u: [1, 0, 0], out: [0, 0, 1], width: base };
  const inW = Math.min(1.1, base - 1.2), inH = 1.5;
  holedFace(sink, 'stone', front, { u0: -hb + 0.5, u1: hb - 0.5, y0: -0.4, y1: plinthH }, [{ u0: -inW / 2, u1: inW / 2, y0: 0.15, y1: 0.15 + inH + inW / 2, spring: 0.15 + inH }], 0.45);
  sink.quad('stone', [-hb + 0.5, plinthH, hb], [hb - 0.5, plinthH, hb], [hb - 0.5, plinthH, hb - 0.5], [-hb + 0.5, plinthH, hb - 0.5]);
  // the iron soot door set back in the inlet, its ring handle
  faceBox(sink, 'structureMetal', front, 0, 0.15 + inH / 2, -0.4, inW - 0.06, inH - 0.04, 0.04, { colour: IRON, decor: true });
  faceBox(sink, 'structureMetal', front, inW * 0.3, 0.15 + inH * 0.5, -0.37, 0.08, 0.08, 0.03, { colour: shade(IRON, 1.3), decor: true, fine: true });
  // the base course and the cornice round the plinth, the pilasters at its corners (dressing)
  sink.span('stone', -hb - 0.1, -0.1, -hb - 0.1, hb + 0.1, 0.35, hb + 0.1, { decor: true, shade: 0.85 });
  sink.span('stone', -hb - 0.12, plinthH, -hb - 0.12, hb + 0.12, plinthH + 0.3, hb + 0.12, { decor: true });
  sink.span('stone', -hb - 0.06, plinthH - 0.22, -hb - 0.06, hb + 0.06, plinthH, hb + 0.06, { decor: true, shade: 0.92 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    sink.span('stone', sx > 0 ? hb - 0.32 : -hb - 0.06, 0.35, sz > 0 ? hb - 0.32 : -hb - 0.06, sx > 0 ? hb + 0.06 : -hb + 0.32, plinthH - 0.22, sz > 0 ? hb + 0.06 : -hb + 0.32,
      { decor: true, shade: 0.96 });
  }
  // the shaft in three lifts, each a shade sootier, an iron band at every lift's foot and every 2.5 m up it
  const r0 = base * 0.42, r1 = base * 0.26, shaft = total - plinthH - 1.4, y0 = plinthH + 0.3;
  const rAt = (y: number) => r0 + (r1 - r0) * Math.max(0, Math.min(1, (y - y0) / shaft));
  const lifts = [0, 0.42, 0.78, 1], soot = [1, 0.86, 0.7];
  for (let k = 0; k < 3; k++) {
    const a = y0 + shaft * lifts[k], b = y0 + shaft * lifts[k + 1];
    sink.cylinder('stone', [0, a, 0], 'y', b - a, rAt(a), 8, k ? { shade: soot[k] } : {}, rAt(b), true, Math.PI / 8);
  }
  for (let y = y0 + 1.2; y < y0 + shaft - 0.6; y += 2.5) {
    sink.cylinder('structureMetal', [0, y, 0], 'y', 0.09, rAt(y) + 0.025, 8, { colour: IRON, decor: true }, rAt(y + 0.09) + 0.025, false, Math.PI / 8);
  }
  // the crown: three oversailing courses corbelled out, the sooted mouth over them
  const crownY = y0 + shaft;
  sink.cylinder('stone', [0, crownY, 0], 'y', 0.22, r1 * 1.08, 8, { shade: 0.62 }, r1 * 1.1, true, Math.PI / 8);
  sink.cylinder('stone', [0, crownY + 0.22, 0], 'y', 0.22, r1 * 1.18, 8, { shade: 0.55 }, r1 * 1.2, true, Math.PI / 8);
  sink.cylinder('stone', [0, crownY + 0.44, 0], 'y', 0.3, r1 * 1.28, 8, { shade: 0.5 }, r1 * 1.3, true, Math.PI / 8);
  sink.cylinder('stone', [0, crownY + 0.74, 0], 'y', 0.66, r1 * 1.12, 8, { shade: 0.4 }, r1 * 1.08, true, Math.PI / 8);
  // the ladder up the +x side on stand-offs (its rungs fine joinery), the conductor up the -x side to its rod
  sink.dressing(mobile, () => {
    const ladder = { colour: IRON, decor: true };
    const off = 0.16, yTop = crownY + 0.4;
    // (the integrity gate, 2026-10-14: a 2 cm stile 25 m long is a sliver: the stiles and the conductor in 4 m lengths)
    for (const dz of [-0.2, 0.2]) {
      inLengths([rAt(y0 + 0.3) + off, y0 + 0.3, dz], [rAt(yTop) + off, yTop, dz], (p, q) => sink.member('structureMetal', p, q, 0.035, 0.02, [0, 0, 1], { ...ladder, exposed: true }, 0));
    }
    for (let y = y0 + 0.5; y < yTop - 0.1; y += 0.32) {
      const x = rAt(y) + off;
      sink.span('structureMetal', x - 0.012, y - 0.012, -0.2, x + 0.012, y + 0.012, 0.2, { ...ladder, fine: true });
    }
    for (let y = y0 + 1.0; y < yTop; y += 2.5) {
      const r = rAt(y);
      sink.span('structureMetal', r - 0.04, y - 0.02, -0.24, r + off + 0.02, y + 0.02, -0.18, { ...ladder, fine: true });
      sink.span('structureMetal', r - 0.04, y - 0.02, 0.18, r + off + 0.02, y + 0.02, 0.24, { ...ladder, fine: true });
    }
    inLengths([-(rAt(y0) + 0.05), y0, 0], [-(rAt(crownY) + 0.05), crownY + 0.2, 0], (p, q) => sink.member('structureMetal', p, q, 0.02, 0.02, [-1, 0, 0], { colour: rgb(0x5a4a3a), decor: true, exposed: true }, 0));
    sink.member('structureMetal', [-(r1 * 1.12), crownY + 0.2, 0], [-(r1 * 1.12) + 0.02, crownY + 2.4, 0], 0.025, 0.025, normalize3([-1, 0, 0]), { colour: shade(IRON, 1.2), decor: true, exposed: true }, 0);
  });
  return sink.finish();
};
