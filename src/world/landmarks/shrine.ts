// src/world/landmarks/shrine.ts — a Shinto shrine's precinct (landmarks-271, 2026-11-06). Caldera is the Aso valley in
// Kumamoto: the census (buildings-270 signature places) names Aso Shrine — its two-storey rōmon gate, one of the three
// great gates of Japan, the torii and the haiden at the end of a straight sandō lined with stone lanterns — as what makes
// the town, and found it missing.
//
// - shrine: the precinct along its approach (front +z, where the road arrives): the stone torii at the mouth (the
//   gates family's `torii`, placed as a child), the sandō's gravel between pairs of stone lanterns, the rōmon over the
//   approach — a three-bay lower storey on round posts under its pent roof, the railed balcony of the upper storey and
//   the great irimoya roof with upturned eaves — the tamagaki fence round the inner court, the haiden on its stone
//   podium at the back under its own irimoya roof with the karahafu porch over its steps, the shimenawa rope at its door,
//   the purification basin's pavilion beside the approach.
//
// Drawn in its own frame (x across, y up, z out of the front) into the regional part sink, so the roofs take the kit's
// kawara and the walls its render (no draw call of its own). The posts, walls, podium and lanterns are structure; the
// rails, ropes, brackets and the fence's slats are dressing.
import { PartSink, rgb, shade, type EmitOptions, type RegionalBucket, type Rgb, type Vec3 } from '../maps/regional/geometry.ts';
import { bar, revolve } from './kit.ts';
import type { LandmarkBuilder, LandmarkBuildContext, LandmarkPlacement } from './types.ts';

const TIMBER = rgb(0x4e3828), TIMBER_DARK = rgb(0x33251b), COPPER = rgb(0x5f8a76), STRAW = rgb(0xc9b27a), WHITE = rgb(0xe8e2d4);
const GRAVEL = 0.86;

const uvOffset = (rng: () => number): [number, number] => [rng() * 7.31, rng() * 5.17];
const num = (ctx: LandmarkBuildContext, key: string, min: number, max = Infinity): number => Math.min(max, Math.max(min, Number(ctx.params[key])));

/** The precinct's plan along its axis (plan.ts footprint and the builder agree). */
export function shrineLayout(p: Readonly<Record<string, number | string | boolean>>) {
  const length = Math.max(48, Math.min(110, Number(p.length)));
  const width = Math.max(26, Math.min(44, Number(p.width)));
  return { length, width, front: length / 2, back: -length / 2 };
}

/**
 * An irimoya roof over a w (x) x d (z) body centred at (cx, cz): the eaves `over` out at height y, the ridge along x at
 * `ridgeY`, the hip-and-gable break at `breakY`, each eave's corners swept up `sori` metres. Its covering in `bucket`,
 * the fascia under its edge, the ridge's cap and its end tiles; `skirt` (a pent roof) has no upper part.
 */
function irimoya(sink: PartSink, cx: number, cz: number, w: number, d: number, y: number, ridgeY: number, opts: {
  over: number; sori: number; breakFrac?: number; bucket?: RegionalBucket; fascia?: Rgb; mobile: boolean;
}): void {
  const bucket = opts.bucket ?? 'roof', X = w / 2 + opts.over, Z = d / 2 + opts.over;
  const yr = ridgeY, yh = y + (yr - y) * (opts.breakFrac ?? 0.5);
  const zh = Z * (yr - yh) / (yr - y);
  const a = Math.max(0.6, X - Z * 0.9);
  const P = (x: number, yy: number, z: number): Vec3 => [cx + x, yy, cz + z];
  // the eave line: each side's edge rises toward its corners (the sori), in segments
  const n = opts.mobile ? 4 : 8;
  const eave = (t: number): number => y + opts.sori * Math.pow(Math.abs(t), 2.2);
  // front and back slopes: the eave from -X to X, up to the break points and the ridge
  for (const s of [1, -1]) {
    const top: Vec3[] = [P(-a, yh, s * zh), P(-a, yr, 0), P(a, yr, 0), P(a, yh, s * zh)];
    for (let k = 0; k < n; k++) {
      const t0 = -1 + 2 * k / n, t1 = -1 + 2 * (k + 1) / n;
      const e0 = P(t0 * X, eave(t0), s * Z), e1 = P(t1 * X, eave(t1), s * Z);
      // each eave segment to its share of the break line (the break line from (-a, zh) to (a, zh))
      const b0 = P(t0 * a, yh, s * zh), b1 = P(t1 * a, yh, s * zh);
      if (s > 0) sink.quad(bucket, e0, e1, b1, b0, {});
      else sink.quad(bucket, e1, e0, b0, b1, {});
      // the fascia
      sink.quad('structureWood', s > 0 ? P(t0 * X, eave(t0) - 0.3, s * Z) : P(t1 * X, eave(t1) - 0.3, s * Z), s > 0 ? P(t1 * X, eave(t1) - 0.3, s * Z) : P(t0 * X, eave(t0) - 0.3, s * Z),
        s > 0 ? e1 : e0, s > 0 ? e0 : e1, { colour: opts.fascia ?? TIMBER_DARK, decor: true });
      // the soffit under the eave
      sink.quad('structureWood', s > 0 ? e1 : e0, s > 0 ? e0 : e1, s > 0 ? P(t0 * (w / 2), y - 0.15, s * d / 2) : P(t1 * (w / 2), y - 0.15, s * d / 2),
        s > 0 ? P(t1 * (w / 2), y - 0.15, s * d / 2) : P(t0 * (w / 2), y - 0.15, s * d / 2), { colour: shade(opts.fascia ?? TIMBER_DARK, 0.7), decor: true });
    }
    // the upper part over the break line, to the ridge
    if (s > 0) sink.quad(bucket, top[0], top[3], top[2], top[1], {});
    else sink.quad(bucket, top[3], top[0], top[1], top[2], {});
  }
  // the end slopes (hips) and the gables over them
  for (const s of [1, -1]) {
    for (let k = 0; k < n; k++) {
      const t0 = -1 + 2 * k / n, t1 = -1 + 2 * (k + 1) / n;
      const e0 = P(s * X, eave(t0), t0 * Z), e1 = P(s * X, eave(t1), t1 * Z);
      const b0 = P(s * a, yh, t0 * zh), b1 = P(s * a, yh, t1 * zh);
      if (s > 0) sink.quad(bucket, e1, e0, b0, b1, {});
      else sink.quad(bucket, e0, e1, b1, b0, {});
      sink.quad('structureWood', s > 0 ? P(s * X, eave(t1) - 0.3, t1 * Z) : P(s * X, eave(t0) - 0.3, t0 * Z), s > 0 ? P(s * X, eave(t0) - 0.3, t0 * Z) : P(s * X, eave(t1) - 0.3, t1 * Z),
        s > 0 ? e0 : e1, s > 0 ? e1 : e0, { colour: opts.fascia ?? TIMBER_DARK, decor: true });
    }
    // the gable (tsuma): boarded, its bargeboards proud
    const g: Vec3[] = [P(s * a, yh, -zh), P(s * a, yh, zh), P(s * a, yr, 0)];
    sink.polygon('structureWood', s > 0 ? g : [g[1], g[0], g[2]], { colour: TIMBER });
    bar(sink, 'structureWood', P(s * (a + 0.12), yh - 0.1, zh + 0.15), P(s * (a + 0.12), yr + 0.2, 0), 0.32, { colour: TIMBER_DARK, decor: true });
    bar(sink, 'structureWood', P(s * (a + 0.12), yh - 0.1, -zh - 0.15), P(s * (a + 0.12), yr + 0.2, 0), 0.32, { colour: TIMBER_DARK, decor: true });
    // the copper fish-scale ornament (gegyo) at the gable's apex
    sink.span('structureMetal', cx + s * (a + 0.1) - 0.05, yr - 1.0, cz - 0.5, cx + s * (a + 0.1) + 0.05, yr - 0.1, cz + 0.5, { colour: COPPER, decor: true, fine: opts.mobile ? undefined : 'near' });
  }
  // the ridge: its cap the roof's length, the end tiles (onigawara) rising at each end
  sink.span(bucket, cx - a - 0.4, yr - 0.1, cz - 0.45, cx + a + 0.4, yr + 0.55, cz + 0.45, { decor: true, shade: 0.75 });
  for (const s of [-1, 1]) {
    // (each end tile a low fin, its face to the gable, flaring up and out: not a block that reads as a chimney)
    const ex = cx + s * (a + 0.35);
    sink.polygon(bucket, s > 0 ? [[ex, yr + 0.5, cz - 0.42], [ex, yr + 0.5, cz + 0.42], [ex + s * 0.25, yr + 1.05, cz + 0.32], [ex + s * 0.25, yr + 1.05, cz - 0.32]]
      : [[ex, yr + 0.5, cz + 0.42], [ex, yr + 0.5, cz - 0.42], [ex + s * 0.25, yr + 1.05, cz - 0.32], [ex + s * 0.25, yr + 1.05, cz + 0.32]], { decor: true, shade: 0.7 });
    sink.span(bucket, ex - 0.18, yr - 0.1, cz - 0.42, ex + 0.18, yr + 0.5, cz + 0.42, { decor: true, shade: 0.72 });
  }
}

/** A stone lantern (ishidōrō, the kasuga form) at (x, z): its base, shaft, fire box with its openings, the hat with
 *  upturned corners and the jewel on it. */
function lantern(sink: PartSink, x: number, z: number, h: number, mobile: boolean): void {
  const k = h / 2.2, n = mobile ? 6 : 8;
  revolve(sink, 'stone', x, z, [[0.42 * k, -0.4], [0.42 * k, 0.22 * k], [0.32 * k, 0.3 * k], [0.14 * k, 0.36 * k], [0.14 * k, 1.05 * k], [0.3 * k, 1.12 * k], [0.3 * k, 1.2 * k]], 6, { shade: 0.95 }, Math.PI / 6);
  sink.span('stone', x - 0.25 * k, 1.2 * k, z - 0.25 * k, x + 0.25 * k, 1.62 * k, z + 0.25 * k, {});
  sink.span('dark', x - 0.12 * k, 1.28 * k, z + 0.249 * k, x + 0.12 * k, 1.52 * k, z + 0.252 * k, { decor: true });
  sink.span('dark', x - 0.12 * k, 1.28 * k, z - 0.252 * k, x + 0.12 * k, 1.52 * k, z - 0.249 * k, { decor: true });
  revolve(sink, 'stone', x, z, [[0.52 * k, 1.62 * k], [0.52 * k, 1.68 * k], [0.12 * k, 1.95 * k], [0.08 * k, 2.0 * k]], n, {}, Math.PI / n);
  revolve(sink, 'stone', x, z, [[0.08 * k, 2.0 * k], [0.11 * k, 2.08 * k], [0.06 * k, 2.2 * k], [0.001, 2.22 * k]], n, { decor: true });
}

/** A run of posts and rails between two plan points (the tamagaki fence of slats on its rails), dressing over posts. */
function fence(sink: PartSink, a: readonly [number, number], b: readonly [number, number], h: number, mobile: boolean): void {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L;
  for (let t = 0; t <= L + 1e-6; t += 2.2) {
    const x = a[0] + ux * Math.min(t, L), z = a[1] + uz * Math.min(t, L);
    sink.span('structureWood', x - 0.1, -0.4, z - 0.1, x + 0.1, h + 0.12, z + 0.1, { colour: TIMBER });
  }
  for (const y of [0.25, h - 0.15]) bar(sink, 'structureWood', [a[0], y, a[1]], [b[0], y, b[1]], 0.1, { colour: TIMBER, decor: true });
  if (mobile) return;
  for (let t = 0.1; t < L; t += 0.16) {
    const x = a[0] + ux * t, z = a[1] + uz * t;
    bar(sink, 'structureWood', [x, 0.12, z], [x, h - 0.05, z], 0.05, { colour: shade(TIMBER, 1.1), decor: true, fine: true });
  }
}

/** A round post from the ground (or y0) to y1 at (x, z), on its stone footing. */
function post(sink: PartSink, x: number, z: number, y0: number, y1: number, r: number, mobile: boolean, colour: Rgb = TIMBER): void {
  if (y0 <= 0.01) sink.span('stone', x - r * 1.6, -0.4, z - r * 1.6, x + r * 1.6, 0.22, z + r * 1.6, { shade: 0.9 });
  sink.cylinder('structureWood', [x, Math.max(y0, 0.22), z], 'y', y1 - Math.max(y0, 0.22), r, mobile ? 8 : 10, { colour });
}

/** The rōmon: the two-storey gate over the approach at z = gz, w across (three bays), its passage open along z. */
function romon(sink: PartSink, gz: number, w: number, d: number, mobile: boolean): void {
  const bay = w / 3, y1 = 5.4, ySkirt = 5.6, yDeck = 6.5, y2 = 10.6, top = 17.2;
  // the lower storey: four rows of round posts across, the side bays walled in white render between rails, the
  // passage's bay open
  for (const zz of [-d / 2, d / 2]) for (let i = 0; i <= 3; i++) post(sink, -w / 2 + i * bay, gz + zz, 0, y1, 0.32, mobile);
  for (const s of [-1, 1]) {
    // the side bays' walls (the guardian niches behind lattice on the approach faces)
    const x0 = s * (w / 2 - bay * 0.5);
    sink.span('plaster', x0 - bay / 2 + 0.3, 0.6, gz - 0.12, x0 + bay / 2 - 0.3, y1 - 0.5, gz + 0.12, { shade: 0.98 });
    for (const zz of [-1, 1]) {
      sink.span('dark', x0 - bay / 2 + 0.6, 1.0, gz + zz * 0.14, x0 + bay / 2 - 0.6, y1 - 1.0, gz + zz * 0.15, { decor: true });
      if (!mobile) for (let u = -bay / 2 + 0.75; u < bay / 2 - 0.6; u += 0.22) bar(sink, 'structureWood', [x0 + u, 1.0, gz + zz * 0.2], [x0 + u, y1 - 1.0, gz + zz * 0.2], 0.05, { colour: TIMBER, decor: true, fine: true });
    }
    sink.span('stone', x0 - bay / 2 + 0.2, -0.4, gz - d / 2 + 0.3, x0 + bay / 2 - 0.2, 0.6, gz + d / 2 - 0.3, { shade: 0.88 });
  }
  // the tie beams and the bracket sets over the posts, the pent roof skirting the lower storey
  for (const zz of [-d / 2, d / 2]) sink.span('structureWood', -w / 2 - 0.2, y1 - 0.3, gz + zz - 0.2, w / 2 + 0.2, y1 + 0.1, gz + zz + 0.2, { colour: TIMBER_DARK });
  for (let i = 0; i <= 3; i++) sink.span('structureWood', -w / 2 + i * bay - 0.2, y1 - 0.3, gz - d / 2, -w / 2 + i * bay + 0.2, y1 + 0.1, gz + d / 2, { colour: TIMBER_DARK });
  if (!mobile) for (const zz of [-d / 2, d / 2]) for (let i = 0; i <= 3; i++) {
    const x = -w / 2 + i * bay;
    sink.span('structureWood', x - 0.45, y1 + 0.1, gz + zz - 0.45, x + 0.45, y1 + 0.45, gz + zz + 0.45, { colour: TIMBER, decor: true, fine: true });
  }
  irimoya(sink, 0, gz, w, d, ySkirt, ySkirt + 0.9, { over: 1.9, sori: 0.35, breakFrac: 0.99, mobile });
  // the upper storey: its floor and the railed balcony round it, the walls set in from the posts, the windows
  const uw = w - 1.4, ud = d - 1.2;
  sink.span('structureWood', -w / 2 - 0.7, yDeck - 0.3, gz - d / 2 - 0.7, w / 2 + 0.7, yDeck, gz + d / 2 + 0.7, { colour: TIMBER_DARK });
  sink.span('plaster', -uw / 2, yDeck, gz - ud / 2, uw / 2, y2, gz + ud / 2, { shade: 0.97 });
  for (const s of [-1, 1]) for (let i = 0; i <= 3; i++) {
    const x = -uw / 2 + i * uw / 3;
    sink.span('structureWood', x - 0.2, yDeck, gz + s * ud / 2 - 0.2, x + 0.2, y2, gz + s * ud / 2 + 0.2, { colour: TIMBER, decor: true });
    if (i < 3) sink.span('dark', x + 0.7, yDeck + 1.0, gz + s * (ud / 2 + 0.01), x + uw / 3 - 0.7, y2 - 1.0, gz + s * (ud / 2 + 0.02), { decor: true });
  }
  for (const s of [-1, 1]) sink.span('structureWood', -uw / 2, y2 - 0.35, gz + s * ud / 2 - 0.25, uw / 2, y2, gz + s * ud / 2 + 0.25, { colour: TIMBER_DARK, decor: true });
  // the balcony's railing on its posts round the deck's edge
  const rw = w / 2 + 0.55, rd = d / 2 + 0.55, ry = yDeck + 0.95;
  const ring: Array<[number, number]> = [[-rw, -rd], [rw, -rd], [rw, rd], [-rw, rd]];
  for (let k = 0; k < 4; k++) {
    const [ax, az] = ring[k], [bx, bz] = ring[(k + 1) % 4];
    bar(sink, 'structureWood', [ax, ry, gz + az], [bx, ry, gz + bz], 0.12, { colour: TIMBER_DARK, decor: true });
    if (!mobile) {
      const L = Math.hypot(bx - ax, bz - az);
      for (let t = 0; t <= L; t += 1.1) bar(sink, 'structureWood', [ax + (bx - ax) * t / L, yDeck, gz + az + (bz - az) * t / L], [ax + (bx - ax) * t / L, ry, gz + az + (bz - az) * t / L], 0.08, { colour: TIMBER_DARK, decor: true, fine: true });
    }
  }
  // the great roof: its eaves well out on the bracket sets, the corners swept up
  irimoya(sink, 0, gz, uw, ud, y2 + 0.2, top, { over: 2.6, sori: 0.75, breakFrac: 0.48, mobile });
  // the name tablet under the upper eave on the approach face
  sink.span('structureWood', -0.7, y2 - 2.6, gz + ud / 2 + 0.02, 0.7, y2 - 0.6, gz + ud / 2 + 0.16, { colour: TIMBER_DARK, decor: true });
  sink.span('structureMetal', -0.5, y2 - 2.4, gz + ud / 2 + 0.16, 0.5, y2 - 0.8, gz + ud / 2 + 0.18, { colour: rgb(0xb59a4e), decor: true, fine: mobile ? undefined : 'near' });
}

/** The haiden at z = hz on its stone podium: w x d, its front (+z) open under the karahafu porch over the steps. */
function haiden(sink: PartSink, hz: number, w: number, d: number, mobile: boolean): void {
  const podium = 0.9, eaveY = podium + 4.6, ridgeY = eaveY + 5.2;
  sink.span('stone', -w / 2 - 1.2, -0.6, hz - d / 2 - 1.2, w / 2 + 1.2, podium, hz + d / 2 + 1.2, { shade: 0.86 });
  // the posts round the hall, its walls white render between them at the sides and back, the front's lattice doors
  const bays = 5, bw = w / bays;
  for (let i = 0; i <= bays; i++) for (const s of [-1, 1]) post(sink, -w / 2 + i * bw, hz + s * d / 2, podium, eaveY, 0.24, mobile);
  for (let j = 1; j < 3; j++) for (const s of [-1, 1]) post(sink, s * w / 2, hz - d / 2 + j * d / 3, podium, eaveY, 0.24, mobile);
  sink.span('plaster', -w / 2 + 0.1, podium, hz - d / 2 + 0.05, w / 2 - 0.1, eaveY - 0.4, hz - d / 2 + 0.25, { shade: 0.97 });
  for (const s of [-1, 1]) sink.span('plaster', s * w / 2 - 0.1 - (s > 0 ? 0.1 : -0.1), podium, hz - d / 2 + 0.2, s * w / 2 + (s > 0 ? -0.05 : 0.05), eaveY - 0.4, hz + d / 2 - 0.2, { shade: 0.95 });
  // the front: the dark interior beyond lattice doors folded up, and the tie beam
  sink.span('dark', -w / 2 + 0.2, podium, hz + d / 2 - 1.4, w / 2 - 0.2, eaveY - 0.4, hz + d / 2 - 1.2, {});
  if (!mobile) for (let i = 0; i < bays; i++) {
    const x0 = -w / 2 + i * bw;
    for (let u = 0.3; u < bw - 0.2; u += 0.3) bar(sink, 'structureWood', [x0 + u, eaveY - 1.3, hz + d / 2 - 0.05], [x0 + u, eaveY - 0.45, hz + d / 2 - 0.05], 0.05, { colour: TIMBER, decor: true, fine: true });
  }
  sink.span('structureWood', -w / 2 - 0.2, eaveY - 0.45, hz + d / 2 - 0.2, w / 2 + 0.2, eaveY, hz + d / 2 + 0.2, { colour: TIMBER_DARK, decor: true });
  // the veranda (engawa) along the front with its railing
  sink.span('structureWood', -w / 2 - 0.9, podium, hz + d / 2, w / 2 + 0.9, podium + 0.35, hz + d / 2 + 1.1, { colour: TIMBER });
  // the hall's roof, then the karahafu porch: posts, its own sweeping roof over the steps
  irimoya(sink, 0, hz, w, d, eaveY + 0.15, ridgeY, { over: 2.2, sori: 0.6, breakFrac: 0.5, mobile });
  const pw = Math.min(6.4, w * 0.45), pz0 = hz + d / 2 + 1.1, pd = 3.6;
  for (const s of [-1, 1]) for (const zz of [pz0 + 0.3, pz0 + pd - 0.2]) post(sink, s * pw / 2, zz, podium * (zz < pz0 + 1 ? 1 : 0), eaveY - 0.3, 0.2, mobile);
  // the karahafu: a gable whose bargeboard sweeps up to a rounded crest, its roof two curved slopes
  const cy = eaveY + 0.2, crest = eaveY + 2.4, segs = mobile ? 6 : 12;
  const curve = (t: number): number => cy + (crest - cy) * (t < 0.5 ? Math.sin(t * Math.PI) ** 1.6 : Math.sin(t * Math.PI) ** 1.6);
  for (let k = 0; k < segs; k++) {
    const t0 = k / segs, t1 = (k + 1) / segs;
    const x0 = -pw / 2 - 0.6 + (pw + 1.2) * t0, x1 = -pw / 2 - 0.6 + (pw + 1.2) * t1;
    const y0 = curve(t0), y1 = curve(t1);
    sink.quad('roof', [x0, y0, pz0 + pd + 0.9], [x1, y1, pz0 + pd + 0.9], [x1, y1 + 0.2, hz + d / 2 + 0.5], [x0, y0 + 0.2, hz + d / 2 + 0.5], {});
    sink.quad('structureWood', [x0, y0 - 0.45, pz0 + pd + 0.92], [x1, y1 - 0.45, pz0 + pd + 0.92], [x1, y1, pz0 + pd + 0.92], [x0, y0, pz0 + pd + 0.92], { colour: TIMBER_DARK, decor: true });
  }
  // the steps up to the veranda under the porch, the offering box, the shimenawa over the door with its tassels
  for (let k = 0; k < 3; k++) sink.span('stone', -pw / 2 + 0.4, -0.3, pz0 + 1.1 + k * 0.45, pw / 2 - 0.4, podium - k * 0.3, pz0 + 1.55 + k * 0.45, { shade: 0.92 });
  sink.span('structureWood', -1.0, podium + 0.35, pz0 + 0.1, 1.0, podium + 1.15, pz0 + 0.8, { colour: TIMBER_DARK });
  bar(sink, 'straw', [-pw / 2 + 0.2, eaveY - 0.7, pz0 + pd - 0.2], [pw / 2 - 0.2, eaveY - 0.7, pz0 + pd - 0.2], 0.42, { colour: STRAW, decor: true });
  if (!mobile) for (const x of [-pw / 4, 0, pw / 4]) bar(sink, 'straw', [x, eaveY - 0.9, pz0 + pd - 0.2], [x, eaveY - 1.7, pz0 + pd - 0.2], 0.1, { colour: STRAW, decor: true, fine: true });
  // the white paper streamers (shide) on the rope
  if (!mobile) for (const x of [-pw / 3, -pw / 9, pw / 9, pw / 3]) sink.span('structureWood', x - 0.08, eaveY - 1.6, pz0 + pd - 0.17, x + 0.08, eaveY - 0.95, pz0 + pd - 0.15, { colour: WHITE, decor: true, fine: 'near' });
}

/**
 * The shrine precinct (`length` along its approach, `width` across), its front (+z) at the road: the torii at the mouth,
 * the lantern pairs along the sandō, the rōmon at `gate` of the way in (0-1), the inner court's fence, the haiden.
 */
export const shrine: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const mobile = ctx.tier === 'mobile';
  const { length, width, front, back } = shrineLayout(ctx.params);
  const gateZ = front - Math.max(16, length * num(ctx, 'gate', 0.15, 0.6));
  const courtZ = gateZ - 3.2, hallW = Math.min(15, width - 8), hallD = 9.5, hallZ = back + hallD / 2 + 2.4;
  // the sandō: a gravel band from the mouth through the gate to the hall's steps, its stone kerbs
  const sw = 4.2;
  sink.quad('stone', [-sw / 2, 0.04, front], [sw / 2, 0.04, front], [sw / 2, 0.04, hallZ + hallD / 2 + 4.6], [-sw / 2, 0.04, hallZ + hallD / 2 + 4.6], { decor: true, shade: GRAVEL, uv: { kind: 'world' } });
  for (const s of [-1, 1]) bar(sink, 'stone', [s * (sw / 2 + 0.1), 0.06, front], [s * (sw / 2 + 0.1), 0.06, hallZ + hallD / 2 + 4.6], 0.24, { decor: true, shade: 0.72 });
  // the inner court's gravel
  sink.quad('stone', [-width / 2 + 1, 0.03, courtZ], [width / 2 - 1, 0.03, courtZ], [width / 2 - 1, 0.03, back + 1], [-width / 2 + 1, 0.03, back + 1], { decor: true, shade: 0.93, uv: { kind: 'world' } });
  // the lantern pairs along the approach outside the gate and in the court
  for (let z = front - 6; z > gateZ + 5; z -= 5.5) for (const s of [-1, 1]) lantern(sink, s * (sw / 2 + 1.4), z, 2.2, mobile);
  for (let z = courtZ - 4; z > hallZ + hallD / 2 + 6; z -= 6) for (const s of [-1, 1]) lantern(sink, s * (sw / 2 + 1.6), z, 2.0, mobile);
  romon(sink, gateZ, 12, 7, mobile);
  // the tamagaki round the inner court, from the gate's ends round to the back
  const fx = width / 2 - 0.6;
  fence(sink, [-6.4, courtZ + 0.4], [-fx, courtZ + 0.4], 1.6, mobile);
  fence(sink, [6.4, courtZ + 0.4], [fx, courtZ + 0.4], 1.6, mobile);
  fence(sink, [-fx, courtZ + 0.4], [-fx, back + 0.6], 1.6, mobile);
  fence(sink, [fx, courtZ + 0.4], [fx, back + 0.6], 1.6, mobile);
  fence(sink, [-fx, back + 0.6], [fx, back + 0.6], 1.6, mobile);
  haiden(sink, hallZ, hallW, hallD, mobile);
  // the purification basin's pavilion (temizuya) beside the approach inside the court: four posts, a little gabled roof
  const tx = sw / 2 + 4.6, tz = courtZ - 5;
  for (const [dx, dz] of [[-1.3, -0.9], [1.3, -0.9], [1.3, 0.9], [-1.3, 0.9]] as const) post(sink, tx + dx, tz + dz, 0, 2.6, 0.13, mobile);
  sink.span('stone', tx - 0.9, -0.3, tz - 0.45, tx + 0.9, 0.75, tz + 0.45, { shade: 0.8 });
  sink.span('dark', tx - 0.75, 0.74, tz - 0.3, tx + 0.75, 0.76, tz + 0.3, { decor: true });
  irimoya(sink, tx, tz, 2.6, 1.8, 2.7, 3.9, { over: 0.6, sori: 0.15, breakFrac: 0.55, mobile });
  // the torii at the mouth of the approach (gates.ts torii, placed after this piece in its frame)
  const children: LandmarkPlacement[] = [{ kind: 'torii', x: 0, z: front - 1.4, yawDeg: 0, params: { span: 6.2, height: 7.6 }, ground: 'veto' }];
  return { parts: sink.finish(), children };
};
