// src/world/maps/regional/shanghaiBank.ts — the Shanghai kit's Bank of China (the terracetower on the Bund, shanghaiBund.ts),
// extracted (the looks lane's r2 sweep, sub-stream b-east, 2026-10-16: lane B is parked, so its builder was taken
// extract-then-own) with copies of the Bund facade helpers it calls, and rebuilt here on the r2 standard.
//
// The r2 sweep measured it 0.68 plain boxes by area (blackglass): its wings and tower bare spans, its piers and spandrel
// beams bare boxes, the cornice and the lattice band slabs. Now the wings stand on a chamfered granite plinth course
// under a moulded cornice, the tower on its own base course, both swept round their plans with their decks; the piers
// are of two orders (skylineDeco.ts steppedPier), the spandrel beams carry drip-nosed sills, the lattice band is a frieze
// between its fillets. The streams draw as before.
import { PartSink, faceBox, facePanel, rgb, shade, type EmitOptions, type Face, type RegionalBucket, type Rgb, type Vec3 } from './geometry.ts';
import { faceSection, steppedPier } from './skylineDeco.ts';
import { emitRoof, recordBody, roofGeometry, type RoofGeometry, type RoofPatch, type RoofSpec } from './house.ts';
import type { RegionalBuilder } from './types.ts';
import { BRONZE, GILT, clampTo, fillOf, planFaces, pocks, rect, uvOffset } from './shanghaiParts.ts';

const SHADOWED = { decor: true, shadow: true } as const;

// ------------------------------------------------------------------------------------------------ (dome-detail-275) roofs in relief (the kit's: shanghai.ts and the Bank of China)

export const sub3 = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross3 = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const unit3 = (v: Vec3): Vec3 => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

/** A convex polygon wound to face `toward` (dome-detail-275). */
export function facing(sink: PartSink, bucket: RegionalBucket, pts: Vec3[], toward: Vec3, opts: EmitOptions): void {
  const n = cross3(sub3(pts[1], pts[0]), sub3(pts[2], pts[0]));
  sink.polygon(bucket, n[0] * toward[0] + n[1] * toward[1] + n[2] * toward[2] >= 0 ? pts : [...pts].reverse(), opts);
}

/** How a roof's tiles are laid (dome-detail-275): the rows' pitch, a roll's width, a glazed tile's colour. */
export interface TileLay { pitch?: number; w?: number; colour?: Rgb; bucket?: RegionalBucket; stopY?: number; gaps?: ReadonlyArray<RoofPatch | null> }

/**
 * (dome-detail-275; the roof bar: "lay them in relief") A Jiangnan roof's canal tiles in relief, drawn in the roof's own
 * frame (where emitRoof drew it): the cover rows of convex tiles down each slope a hand apart, from the eave to the ridge
 * or cut at a hip line, each row its own tone, the drip tile's dark mouth at its foot; `stopY` holds a hip end's rows
 * under its gablet; `gaps` (a stripped patch, a shell hole: house.ts RoofPatch) are left open. Returns the hip lines
 * (ridge end to eave corner) for the hip ridges.
 */
export function canalRolls(sink: PartSink, rg: RoofGeometry, roof: RoofSpec, look: () => number, lay: TileLay = {}): Array<[Vec3, Vec3]> {
  const hips: Array<[Vec3, Vec3]> = [];
  if (rg.kind !== 'gable' && rg.kind !== 'hip') return hips;
  const pitch = lay.pitch ?? 0.3, w = lay.w ?? 0.15, dep = 0.075, bucket = lay.bucket ?? 'roof', colour = lay.colour;
  const xe = rg.s + roof.eave, hip = rg.kind === 'hip' && rg.ridgeHalf < rg.halfD + (rg.hipVerge ?? roof.verge) - 0.05;
  const D = rg.halfD + (rg.kind === 'hip' ? rg.hipVerge ?? roof.verge : roof.verge);
  const top = (x: number, z: number): number => rg.topAt(x, z) ?? rg.eaveY;
  const hF = hip ? (rg.ridgeTopY - top(0, D - 1e-4)) / Math.max(1e-3, D - 1e-4 - rg.ridgeHalf) : 1;
  const opt = (tone: number): EmitOptions => (colour ? { decor: true, colour: shade(colour, tone) } : { decor: true, shade: tone });
  const gaps = (lay.gaps ?? []).filter((g): g is RoofPatch => !!g);
  const row = (a: Vec3, b: Vec3, n: Vec3, mouth: boolean): void => {
    const tone = 0.8 + look() * 0.24;
    sink.member(bucket, a, b, w, dep, n, opt(tone), 0.02);
    if (!mouth) return;
    const ay = unit3(sub3(b, a)), ax = unit3(cross3(ay, n));
    const P = (s: number, h: number): Vec3 => [a[0] + ax[0] * s * w / 2 + n[0] * h, a[1] + ax[1] * s * w / 2 + n[1] * h, a[2] + ax[2] * s * w / 2 + n[2] * h];
    facing(sink, bucket, [P(-1, -0.02), P(1, -0.02), P(1, dep - 0.02), P(-1, dep - 0.02)], [-ay[0], -ay[1], -ay[2]], opt(tone * 0.42));
  };
  // the side slopes: each row from the eave up to the ridge, or to the hip line where a hip closes the slope
  for (const sx of [-1, 1] as const) {
    const n = unit3([sx * rg.tanP, 1, 0]), rows = Math.max(2, Math.round((2 * D - 0.2) / pitch));
    for (let k = 0; k < rows; k++) {
      const z = -D + 0.1 + (k + 0.5) * (2 * D - 0.2) / rows;
      const x1 = Math.max(0.12, hip ? (Math.abs(z) - rg.ridgeHalf) * hF / rg.tanP + w : 0.12);
      if (x1 > xe - 0.25) continue;
      // the row split round an open patch on this slope (its x measured out from the ridge line)
      const runs: Array<[number, number]> = [[xe, x1]];
      for (const g of gaps) {
        if (g.side !== sx || z < g.z0 - w || z > g.z1 + w) continue;
        const [r0, r1] = runs.pop()!;
        if (g.x1 + 0.05 < r0) runs.push([r0, Math.max(r1, g.x1 + 0.05)]);
        if (g.x0 - 0.05 > r1) runs.push([Math.min(r0, g.x0 - 0.05), r1]);
      }
      for (const [r0, r1] of runs) if (r0 - r1 > 0.2) row([sx * r0, top(sx * r0, z), z], [sx * r1, top(sx * r1, z), z], n, r0 === xe);
    }
  }
  if (!hip) return hips;
  // the hip ends: each row from the end's eave up to the hip lines (or the gablet's foot)
  for (const sz of [-1, 1] as const) {
    const n = unit3([0, 1, sz * hF]), rows = Math.max(2, Math.round((2 * xe - 0.2) / pitch));
    const zStop = lay.stopY !== undefined ? rg.ridgeHalf + (rg.ridgeTopY - lay.stopY) / hF : 0;
    for (let k = 0; k < rows; k++) {
      const x = -xe + 0.1 + (k + 0.5) * (2 * xe - 0.2) / rows;
      const z1 = Math.max(zStop, rg.ridgeHalf + Math.abs(x) * rg.tanP / hF + w), z0 = D - 1e-3;
      if (z1 > z0 - 0.25) continue;
      row([x, top(x, sz * z0), sz * z0], [x, top(x, sz * z1), sz * z1], n, true);
    }
    for (const sx of [-1, 1]) {
      const t = Math.min(xe / hF, (D - rg.ridgeHalf) / rg.tanP);
      const b: Vec3 = [sx * t * hF * 0.995, 0, sz * (rg.ridgeHalf + t * rg.tanP * 0.995)];
      hips.push([[0, rg.ridgeTopY, sz * rg.ridgeHalf], [b[0], top(b[0], b[2]), b[2]]]);
    }
  }
  return hips;
}

/** The hip ridges (dome-detail-275): a stack of ridge tiles bedded down each hip line, its foot turned up. */
export function hipRidges(sink: PartSink, hips: ReadonlyArray<[Vec3, Vec3]>, w: number, h: number, opts: EmitOptions, curl = 0, bucket: RegionalBucket = 'roof'): void {
  for (const [a, b] of hips) {
    const ay = unit3(sub3(b, a)), up = unit3([-ay[0] * ay[1], 1 - ay[1] * ay[1], -ay[2] * ay[1]]);
    sink.member(bucket, a, b, w, h, up, { ...opts, exposed: true }, h * 0.35);
    if (curl > 0) {
      const d = unit3([b[0] - a[0], 0, b[2] - a[2]]);
      sink.member(bucket, [b[0] - d[0] * 0.5, b[1] + h * 0.4, b[2] - d[2] * 0.5], [b[0] + d[0] * curl * 0.5, b[1] + curl, b[2] + d[2] * curl * 0.5], w * 0.8, h * 0.8,
        [0, 1, 0], { ...opts, exposed: true }, 0);
    }
  }
}


/** A convex plan (counter-clockwise seen from above) moved in by `r` on every side (each edge offset, the offsets met). */
function insetPlan(points: ReadonlyArray<readonly [number, number]>, r: number): Array<[number, number]> {
  const n = points.length, lines: Array<{ p: [number, number]; d: [number, number] }> = [];
  for (let i = 0; i < n; i++) {
    const [ax, az] = points[i], [bx, bz] = points[(i + 1) % n], len = Math.hypot(bx - ax, bz - az) || 1;
    const ux = (bx - ax) / len, uz = (bz - az) / len;
    lines.push({ p: [ax + uz * r, az - ux * r], d: [ux, uz] });
  }
  const out: Array<[number, number]> = [];
  for (let i = 0; i < n; i++) {
    const a = lines[(i + n - 1) % n], b = lines[i];
    const den = a.d[0] * b.d[1] - a.d[1] * b.d[0];
    if (Math.abs(den) < 1e-9) { out.push([b.p[0], b.p[1]]); continue; }
    const t = ((b.p[0] - a.p[0]) * b.d[1] - (b.p[1] - a.p[1]) * b.d[0]) / den;
    out.push([a.p[0] + a.d[0] * t, a.p[1] + a.d[1] * t]);
  }
  return out;
}

/** A section ([proud of the plan's edge, height]) swept round a convex plan: one welded band a segment and edge, no caps. */
function sweep(sink: PartSink, bucket: RegionalBucket, plan: ReadonlyArray<readonly [number, number]>, section: ReadonlyArray<readonly [number, number]>,
  opts: EmitOptions = {}): void {
  const rings = section.map(([o, y]) => insetPlan(plan, -o).map(([x, z]): Vec3 => [x, y, z]));
  for (let k = 0; k + 1 < rings.length; k++) {
    const a = rings[k], b = rings[k + 1];
    for (let i = 0; i < a.length; i++) {
      const j = (i + 1) % a.length;
      sink.quad(bucket, a[i], a[j], b[j], b[i], opts);
    }
  }
}

/** A deck over a plan at y (counter-clockwise seen from above: it faces up). */
function deck(sink: PartSink, bucket: RegionalBucket, plan: ReadonlyArray<readonly [number, number]>, y: number): void {
  sink.polygon(bucket, plan.map(([x, z]): Vec3 => [x, y, z]));
}

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
    // (looks r2) the beam with its sill: a drip-nosed sill course along its head, 4 cm proud of it
    faceSection(sink, beamBucket, face, -w / 2, w / 2, [[0, b0], [beamOut, b0], [beamOut, b1 - 0.12], [beamOut + 0.04, b1 - 0.09], [beamOut + 0.04, b1], [0, b1]],
      { decor: true, ...beam });
  }
  // the head beam over the top floor's windows
  const top = y0 + floors * fh;
  faceBox(sink, beamBucket, face, 0, top - fh * 0.05, beamOut / 2, w, fh * 0.1, beamOut, { decor: true, ...beam });
  const span = floors * fh, opts = { decor: true, fineSides: true, ...(st.pierShade ? { shade: st.pierShade } : {}) };
  // (looks r2) piers of two orders, the front order stepped in, its arrises chamfered (bare boxes before)
  for (let k = 0; k <= n; k++) steppedPier(sink, st.pierBucket, face, -w / 2 + pitch * k, y0, y0 + span, st.pier, st.pierOut, opts);
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

/**
 * The Bank of China: golden granite wings, the tower over them, the lattice band, the green-tiled pyramid roof.
 * (dome-detail-275) Its tiles in rows with stacked ridges, the eave's bracket sets, the wings' stone railing, the portal.
 */
export const bankOfChina: RegionalBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx));
  const f = fillOf(ctx.bounds, 0.1);
  sink.placed(0, f.cx, 0, f.cz, () => {
    const look = ctx.variant, mobile = ctx.tier === 'mobile';
    const W = clampTo(f.w, 5, 60), D = clampTo(f.d, 5, 60), H = clampTo(ctx.info.h, 8, 90);
    const fh = 3.4, wingTop = Math.max(fh * 2, H * 0.36), towerTop = Math.max(wingTop + fh, H * 0.84);
    const gold: FacadeStyle = { pitch: 1.6, pier: 0.55, pierBucket: 'plaster2', pierOut: 0.26, spandrel: rgb(0x6b5a3e), lit: 0.06, dark: 0.08 };
    // (looks r2) the wings on a chamfered granite plinth course, closed under, their deck at the cornice's head; the cornice
    // a moulding run round them (a fascia, a bed mould, the corona over it)
    const wing = rect(-W / 2, -D / 2, W / 2, D / 2);
    // (the plinth course is dressing: the wings' collision stays their walls' prism; the walls meet it at its head)
    sweep(sink, 'plaster2', wing, [[0, -0.4], [0, 0.72], [0, wingTop]]);
    sweep(sink, 'plaster2', wing, [[0.12, -0.4], [0.12, 0.6], [0, 0.72]], SHADOWED);
    deck(sink, 'plaster2', wing, wingTop);
    sink.polygon('plaster2', wing.map(([x, z]): Vec3 => [x, -0.4, z]).reverse());
    sweep(sink, 'plaster2', wing, [[0, wingTop - 0.45], [0.04, wingTop - 0.45], [0.04, wingTop - 0.3], [0.1, wingTop - 0.24], [0.1, wingTop - 0.08],
      [0, wingTop - 0.02]], SHADOWED);
    const faces = tierFaces(-W / 2, W / 2, -D / 2, D / 2);
    for (const face of faces) {
      podiumFront(sink, face, 5.2, look, 'plaster2');
      deco(sink, face, 5.6, wingTop - 0.5, fh, gold, look, 0.5);
    }
    const tx = W * 0.3, tz = D * 0.4;
    // (looks r2) the tower on its base course, its deck under the roof
    const tower = rect(-tx, -tz, tx, tz);
    sweep(sink, 'plaster2', tower, [[0, wingTop], [0, wingTop + 0.6], [0, towerTop]]);
    sweep(sink, 'plaster2', tower, [[0.1, wingTop], [0.1, wingTop + 0.5], [0, wingTop + 0.6]], SHADOWED);
    deck(sink, 'plaster2', tower, towerTop);
    // (props census #9, E13) the wings and the tower (in its storey bands) as bodies for the damage reading
    recordBody(sink, 0, 0, W, D, wingTop, 'plaster2', false, true);
    recordBody(sink, 0, 0, 2 * tx, 2 * tz, towerTop + 2, 'plaster2', false, true);
    const tfaces = tierFaces(-tx, tx, -tz, tz);
    for (const face of tfaces) {
      deco(sink, face, wingTop + 0.3, towerTop - 2.4, fh, gold, look, 0.4);
      // the band of Chinese lattice under the roof (props census #9: a frieze 14 cm proud, its lattice on it; it was a
      // panel laid on the wall)
      // (looks r2) a frieze between its fillets: the rails 14 cm proud, the panel between them 4 cm behind their faces
      const fy0 = towerTop - 2.0, fy1 = towerTop - 0.4;
      faceSection(sink, 'structureMetal', face, -(face.width - 0.6) / 2, (face.width - 0.6) / 2, [[0, fy0], [0.14, fy0], [0.14, fy0 + 0.1], [0.1, fy0 + 0.14],
        [0.1, fy1 - 0.14], [0.14, fy1 - 0.1], [0.14, fy1], [0, fy1]], { colour: rgb(0x5a4a33), decor: true });
      if (!mobile) for (let k = 0; k < Math.round(face.width / 0.9); k++) {
        faceBox(sink, 'plaster2', face, -face.width / 2 + 0.45 + k * 0.9, towerTop - 1.2, 0.17, 0.1, 1.5, 0.06, { decor: true, fine: true });
      }
    }
    // the roof: a pyramid of green glazed tile on its eaves, the finial
    const roof: RoofSpec = { kind: 'hip', pitchDeg: 27, eave: 0.9, verge: 0.9, thickness: 0.28, bucket: 'structureMetal', ridge: null };
    const rg = roofGeometry(2 * tx, 2 * tz, towerTop, roof);
    const glaze = rgb(0x3e6a60);
    emitRoof(sink, rg, roof, glaze);
    sink.cylinder('structureMetal', [0, rg.ridgeTopY - 0.1, 0], 'y', 1.6, 0.18, 6, { colour: GILT, decor: true, shadow: true }, 0.06);
    scars(sink, faces[0], 5, look, mobile);
    // (dome-detail-275, the work list: "two stacked boxes with a flat window grid, a plain podium and a plain cap") The roof
    // laid in green glazed tiles in their rows, its ridge and hip ridges stacked, the hips' feet swept up; the bracket
    // sets along the tower's eave beam; the wings' roof terraces behind a Chinese stone railing (its posts and rail);
    // the entrance's granite portal, its bronze doors and lintel, its steps
    const hips = canalRolls(sink, rg, roof, look, { pitch: 0.36, w: 0.16, colour: glaze, bucket: 'structureMetal' });
    hipRidges(sink, hips, 0.34, 0.3, { colour: shade(glaze, 0.8), decor: true, shadow: true }, 1.1, 'structureMetal');
    sink.span('structureMetal', -0.22, rg.ridgeTopY - 0.1, -rg.ridgeHalf - 0.2, 0.22, rg.ridgeTopY + 0.4, rg.ridgeHalf + 0.2, { colour: shade(glaze, 0.8), decor: true, shadow: true });
    const beam = { colour: rgb(0x6b3a2a), decor: true } as const, paint = { colour: rgb(0x2f5a55), decor: true } as const;
    for (const face of tfaces) {
      faceBox(sink, 'structureMetal', face, 0, towerTop - 0.2, 0.09, face.width, 0.36, 0.18, beam);
      const n = Math.max(2, Math.round(face.width / 1.3));
      for (let k = 0; k <= n; k++) {
        faceBox(sink, 'structureMetal', face, -face.width / 2 + 0.2 + k * (face.width - 0.4) / n, towerTop + 0.08, 0.3, 0.42, 0.2, 0.6, paint);
      }
    }
    const rail = { decor: true, shade: 0.96 } as const;
    const wf = tierFaces(-W / 2 + 0.15, W / 2 - 0.15, -D / 2 + 0.15, D / 2 - 0.15);
    for (const face of wf) {
      const n = Math.max(2, Math.round(face.width / 2.0));
      for (let k = 0; k <= n; k++) faceBox(sink, 'plaster2', face, -face.width / 2 + 0.15 + k * (face.width - 0.3) / n, wingTop + 0.5, -0.15, 0.24, 1.0, 0.24, rail, { bottom: true });
      faceBox(sink, 'plaster2', face, 0, wingTop + 0.82, -0.15, face.width - 0.3, 0.14, 0.18, rail, 'ends');
      faceBox(sink, 'plaster2', face, 0, wingTop + 0.12, -0.15, face.width - 0.3, 0.24, 0.16, rail, 'ends');
    }
    const fr = faces[0], dw = Math.min(4.2, W * 0.18);
    faceBox(sink, 'structureMetal', fr, 0, 2.0, 0.14, dw, 3.4, 0.04, { colour: BRONZE, decor: true });
    for (const s2 of [-1, 1]) faceBox(sink, 'plaster2', fr, s2 * (dw / 2 + 0.3), 2.3, 0.3, 0.6, 4.6, 0.6, { decor: true, shadow: true, shade: 1.06 });
    faceBox(sink, 'plaster2', fr, 0, 4.85, 0.32, dw + 1.6, 0.5, 0.64, { decor: true, shadow: true, shade: 1.06 });
    faceBox(sink, 'structureMetal', fr, 0, 4.85, 0.66, dw, 0.24, 0.04, { colour: GILT, decor: true, fine: true });
    sink.span('plaster2', -dw / 2 - 1.0, -0.4, D / 2, dw / 2 + 1.0, 0.16, D / 2 + 0.6, { decor: true, shade: 1.02 });
  });
  return sink.finish();
};
