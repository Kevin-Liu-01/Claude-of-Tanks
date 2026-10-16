// src/world/maps/regional/shanghaiBank.ts — the Shanghai kit's Bank of China (the terracetower on the Bund, shanghaiBund.ts),
// extracted as it was (the looks lane's r2 sweep, sub-stream b-east, 2026-10-16: lane B is parked, so its builder is taken
// extract-then-own) with copies of the Bund facade helpers it calls, for this lane to rebuild on the r2 standard.
import { PartSink, faceBox, facePanel, rgb, type Face, type RegionalBucket, type RegionalParts, type Rgb } from './geometry.ts';
import { emitRoof, recordBody, roofGeometry, type RoofSpec } from './house.ts';
import type { RegionalBuilder } from './types.ts';
import { BRONZE, GILT, clampTo, fillOf, planFaces, pocks, rect, uvOffset } from './shanghaiParts.ts';

const SHADOWED = { decor: true, shadow: true } as const;

/** A tower's facade: window columns between proud piers, per floor a pane over a spandrel panel. */
interface FacadeStyle {
  /** the window columns' pitch along the face and the piers' width */
  pitch: number;
  pier: number;
  pierBucket: RegionalBucket;
  pierOut: number;
  /** the piers' occlusion (a darker brick: the Park Hotel's brown) */
  pierShade?: number;
  /** the spandrel panel under each window (a coloured panel), or null (the wall shows) */
  spandrel: Rgb | null;
  /** shares of the windows lit at night and gone dark (shelled, shuttered, blacked out) */
  lit: number;
  dark: number;
}

/**
 * Dress one face from y0 to y1 in floors of fh with a facade style (dressing only): the piers proud, the spandrel beams
 * across each floor between the windows set back behind them, the glazing set back behind the beams (props census #9,
 * the standard's frame: "columns and spandrel beams proud, infill set back"; the panes and the spandrel panels were laid
 * flat on the face).
 */
function deco(sink: PartSink, face: Face, y0: number, y1: number, fh: number, st: FacadeStyle, look: () => number, inset = 0.35): void {
  const w = face.width - 2 * inset, floors = Math.floor((y1 - y0) / fh + 1e-6);
  if (w < 1 || floors < 1) return;
  const n = Math.max(1, Math.round(w / st.pitch)), pitch = w / n, gw = Math.max(0.3, pitch - st.pier);
  const beamOut = st.pierOut * 0.7, beam = st.spandrel ? { colour: st.spandrel } : st.pierShade ? { shade: st.pierShade } : {};
  const beamBucket = st.spandrel ? 'structureMetal' as const : st.pierBucket;
  for (let f = 0; f < floors; f++) {
    const y = y0 + f * fh;
    for (let k = 0; k < n; k++) {
      const u = -w / 2 + pitch * (k + 0.5), r = look();
      const bucket = r < st.dark ? 'dark' : r < st.dark + st.lit ? 'curtain' : 'glass';
      facePanel(sink, bucket, face, u, y + fh * 0.6, 0.012, gw, fh * 0.6, { decor: true, window: face.out });
    }
    // the floor's spandrel beam under its windows (over the ones below), the piers standing proud of it
    const b0 = Math.max(y0, y - fh * 0.1), b1 = y + fh * 0.3;
    faceBox(sink, beamBucket, face, 0, (b0 + b1) / 2, beamOut / 2, w, b1 - b0, beamOut, { decor: true, ...beam });
  }
  // the head beam over the top floor's windows
  const top = y0 + floors * fh;
  faceBox(sink, beamBucket, face, 0, top - fh * 0.05, beamOut / 2, w, fh * 0.1, beamOut, { decor: true, ...beam });
  const span = floors * fh, opts = { decor: true, fineSides: true, ...(st.pierShade ? { shade: st.pierShade } : {}) };
  for (let k = 0; k <= n; k++) faceBox(sink, st.pierBucket, face, -w / 2 + pitch * k, y0 + span / 2, st.pierOut / 2, st.pier, span, st.pierOut, opts);
}

/** The faces of a tier x0..x1, z0..z1 (front +z, right, back, left). */
const tierFaces = (x0: number, x1: number, z0: number, z1: number): Face[] => planFaces(rect(x0, z0, x1, z1));

/** The ground storey's shopfronts and doors along a podium face (dressing). */
function podiumFront(sink: PartSink, face: Face, h: number, look: () => number, pierBucket: RegionalBucket, pierShade = 1): void {
  // (props census #9) each shopfront set back between its piers under its bronze fascia, the piers and the fascia 0.22 m
  // proud of the glass (they were 16 and 9 cm: the glass read laid on the wall)
  const w = face.width - 0.8, n = Math.max(1, Math.round(w / 3.2)), pitch = w / n;
  for (let k = 0; k < n; k++) {
    const u = -w / 2 + pitch * (k + 0.5), gh = Math.min(h - 1.0, 3.6);
    facePanel(sink, look() < 0.25 ? 'curtain' : 'glass', face, u, 0.3 + gh / 2, 0.012, pitch - 0.9, gh, { decor: true, window: face.out });
    faceBox(sink, 'structureMetal', face, u, 0.3 + gh + 0.2, 0.11, pitch - 0.7, 0.3, 0.22, { colour: BRONZE, decor: true, fine: true });
  }
  for (let k = 0; k <= n; k++) faceBox(sink, pierBucket, face, -w / 2 + pitch * k, h / 2, 0.12, 0.7, h, 0.24, { decor: true, fineSides: true, shade: pierShade });
}

/**
 * A face's war: shell pocks over its lower storeys, a breach, sandbags along its foot (dressing: a phone draws it as the
 * desktop does and keeps none of it, PartSink.dressing).
 */
function scars(sink: PartSink, face: Face, h: number, look: () => number, mobile: boolean, heavy = false,
  keep: ReadonlyArray<{ u0: number; u1: number; y0: number; y1: number }> = []): void {
  sink.dressing(mobile, () => {
    pocks(sink, face, -face.width / 2 + 0.4, face.width / 2 - 0.4, 0.4, Math.min(h, 12), (heavy ? 24 : 6) + Math.floor(look() * 10), look, keep);
    // (props census #9: a heavy face's breaches are cut into its wall by its builder; the draws are kept)
    if (heavy && look() < 0.6) { look(); look(); look(); }
  });
}

/** The Bank of China: golden granite wings, the tower over them, the lattice band, the green-tiled pyramid roof. */
export const bankOfChina: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const f = fillOf(ctx.bounds, 0.1);
  sink.placed(0, f.cx, 0, f.cz, () => {
    const look = ctx.variant, mobile = ctx.tier === 'mobile';
    const W = clampTo(f.w, 5, 60), D = clampTo(f.d, 5, 60), H = clampTo(ctx.info.h, 8, 90);
    const fh = 3.4, wingTop = Math.max(fh * 2, H * 0.36), towerTop = Math.max(wingTop + fh, H * 0.84);
    const gold: FacadeStyle = { pitch: 1.6, pier: 0.55, pierBucket: 'plaster2', pierOut: 0.26, spandrel: rgb(0x6b5a3e), lit: 0.06, dark: 0.08 };
    sink.span('plaster2', -W / 2, -0.4, -D / 2, W / 2, wingTop, D / 2);
    sink.span('plaster2', -W / 2 - 0.1, wingTop - 0.45, -D / 2 - 0.1, W / 2 + 0.1, wingTop, D / 2 + 0.1, SHADOWED);
    const faces = tierFaces(-W / 2, W / 2, -D / 2, D / 2);
    for (const face of faces) {
      podiumFront(sink, face, 5.2, look, 'plaster2');
      deco(sink, face, 5.6, wingTop - 0.5, fh, gold, look, 0.5);
    }
    const tx = W * 0.3, tz = D * 0.4;
    sink.span('plaster2', -tx, wingTop, -tz, tx, towerTop, tz);
    // (props census #9, E13) the wings and the tower (in its storey bands) as bodies for the damage reading
    recordBody(sink, 0, 0, W, D, wingTop, 'plaster2', false, true);
    recordBody(sink, 0, 0, 2 * tx, 2 * tz, towerTop + 2, 'plaster2', false, true);
    const tfaces = tierFaces(-tx, tx, -tz, tz);
    for (const face of tfaces) {
      deco(sink, face, wingTop + 0.3, towerTop - 2.4, fh, gold, look, 0.4);
      // the band of Chinese lattice under the roof (props census #9: a frieze 14 cm proud, its lattice on it; it was a
      // panel laid on the wall)
      faceBox(sink, 'structureMetal', face, 0, towerTop - 1.2, 0.07, face.width - 0.6, 1.6, 0.14, { colour: rgb(0x5a4a33), decor: true });
      if (!mobile) for (let k = 0; k < Math.round(face.width / 0.9); k++) {
        faceBox(sink, 'plaster2', face, -face.width / 2 + 0.45 + k * 0.9, towerTop - 1.2, 0.17, 0.1, 1.5, 0.06, { decor: true, fine: true });
      }
    }
    // the roof: a pyramid of green glazed tile on its eaves, the finial
    const roof: RoofSpec = { kind: 'hip', pitchDeg: 27, eave: 0.9, verge: 0.9, thickness: 0.28, bucket: 'structureMetal', ridge: null };
    const rg = roofGeometry(2 * tx, 2 * tz, towerTop, roof);
    emitRoof(sink, rg, roof, rgb(0x3e6a60));
    sink.cylinder('structureMetal', [0, rg.ridgeTopY - 0.1, 0], 'y', 1.6, 0.18, 6, { colour: GILT, decor: true, shadow: true }, 0.06);
    scars(sink, faces[0], 5, look, mobile);
  });
  return sink.finish();
};
