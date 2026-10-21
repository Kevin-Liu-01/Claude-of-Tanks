// src/world/landmarks/parks.ts — parks and squares (the landmarks lane, 2026-10-05): the fountain, the bandstand, the
// park gate with its railings, and the square that gathers them — a green with its paths and railing, the props'
// destructible benches and lamps along the paths, and a centre piece (an obelisk, a statue, a fountain, a bandstand).
import { PartSink, rgb, shade, type EmitOptions, type RegionalBucket, type Rgb, type Vec3 } from '../maps/regional/geometry.ts';
import { emitRoof, roofGeometry, type RoofSpec } from '../maps/regional/house.ts';
import { LIMEWASH_UV, archedSlab, bar, cross, moulding, railing, revolve, smoothRender } from './kit.ts';
import { drapedPath, drapedRect, enclosure, fenceRun, grave, type GraveMarker, type GroundsDestructible } from './grounds.ts';
import { figure } from './monuments.ts';
import type { LandmarkBuilder, LandmarkKind, LandmarkPlacement } from './types.ts';
import { finishLandmark, piece } from './pieces.ts';

const IRON = rgb(0x26282a), IRON_GREEN = rgb(0x334a3c), GILT = rgb(0xb8933e), PAINT_WHITE = rgb(0xe6e2d8), PICKET = rgb(0xdedad0);
const SANDSTONE = rgb(0xb59a7c);
/** A fountain's jets and ripples: water catching the light (a pale grey-blue on the vertex-coloured metal bucket). */
const WATER_JET = rgb(0xc8d4dc);

const uvOffset = (rng: () => number): [number, number] => [rng() * 7.31, rng() * 5.17];

/**
 * The fountain: a round stone basin (its coping a seat), the water in it, a pedestal rising from the middle with one, two
 * or three bowls, each smaller and higher, and a finial.
 */
export const fountain: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const R = Math.max(2, Number(ctx.params.radius)), tiers = Math.max(1, Math.min(3, Math.round(Number(ctx.params.tiers))));
  const base = -0.6 - ctx.groundFall;
  if (String(ctx.params.style) === 'ottoman') return ottomanFountain(sink, R, base, ctx.variant);
  if (String(ctx.params.style) === 'markt') return marktFountain(sink, R, base, ctx.variant);
  // the basin wall: a ring with its coping (outer face, top, inner face down to the water)
  revolve(sink, 'stone', 0, 0, [[R, base], [R, 0.55], [R + 0.08, 0.55], [R + 0.08, 0.7], [R - 0.42, 0.7], [R - 0.42, 0.42]], 28);
  // the water (dark glass, the sky in it) and the basin floor under it
  revolve(sink, 'glass', 0, 0, [[R - 0.42, 0.52], [0.3, 0.52]], 28, { decor: true });
  let y = 0.42, r = Math.min(0.5, R * 0.14);
  for (let k = 0; k < tiers; k++) {
    const shaft = 1.0 + (tiers - k) * 0.25, bowl = R * (0.62 - k * 0.17);
    // the shaft and the bowl on it: its underside swelling out to the lip, the water lying in it (the top tier comes off
    // when the fountain is breached: props lane A, E12, landmarks/pieces.ts)
    const ys = y, rs = r, emitTier = (s: PartSink) => {
      revolve(s, 'stone', 0, 0, [[rs * 1.4, ys], [rs * 1.2, ys + 0.2], [rs, ys + 0.35], [rs * 0.8, ys + shaft - 0.2], [rs * 1.05, ys + shaft]], 12);
      const yb = ys + shaft;
      revolve(s, 'stone', 0, 0, [[rs * 1.05, yb], [bowl * 0.55, yb + 0.12], [bowl, yb + 0.32], [bowl, yb + 0.42], [bowl - 0.12, yb + 0.42], [bowl - 0.12, yb + 0.32]], 20);
      revolve(s, 'glass', 0, 0, [[bowl - 0.12, yb + 0.38], [rs * 0.9, yb + 0.38]], 20, { decor: true });
    };
    if (k === tiers - 1) piece(sink, { name: 'bowl', kind: 'detach', at: 'breached', fall: 'drop' }, emitTier);
    else emitTier(sink);
    y += shaft;
    y += 0.32;
    r *= 0.75;
  }
  piece(sink, { name: 'finial', kind: 'detach', at: 'damaged', fall: 'drop' }, (s) => revolve(s, 'stone', 0, 0, [[r * 1.3, y], [r * 1.1, y + 0.4], [r * 1.6, y + 0.6], [0, y + 0.95]], 10));
  return { parts: finishLandmark(sink) };
};

/**
 * A ring of `n` slabs round a regular polygon (apothems rIn to rOut, from y0 to y1), each its own stone with a joint
 * either side: the polygon's corners at `phase` + k·2π/n, a corner at (sin a, cos a) (kit.ts ringY's octagon at its
 * phase π/8 is this one at π/8).
 */
function polySlabs(sink: PartSink, bucket: RegionalBucket, n: number, rIn: number, rOut: number, y0: number, y1: number, phase: number,
  opts: (k: number) => EmitOptions, joint = 0.008): void {
  const k0 = 1 / Math.cos(Math.PI / n), ci = rIn * k0, co = rOut * k0, dj = joint / Math.max(0.3, co);
  const P = (a: number, r: number): Vec3 => [Math.sin(a) * r, y0, Math.cos(a) * r];
  for (let k = 0; k < n; k++) {
    const a0 = phase + k * Math.PI * 2 / n + dj, a1 = phase + (k + 1) * Math.PI * 2 / n - dj;
    sink.prism(bucket, [P(a0, ci), P(a0, co), P(a1, co), P(a1, ci)], [0, 1, 0], y1 - y0, opts(k));
  }
}

/** A point on the k-th face of a regular n-gon (corners at `phase` + k·2π/n): `u` along the face (left to right seen
 *  from outside), `y` up, `o` out from the apothem `r`. */
function polyFace(n: number, phase: number, k: number, r: number): (u: number, y: number, o: number) => Vec3 {
  const a = phase + (k + 0.5) * Math.PI * 2 / n, ox = Math.sin(a), oz = Math.cos(a);
  return (u, y, o) => [ox * (r + o) + oz * u, y, oz * (r + o) - ox * u];
}

/**
 * A panel's moulded frame proud of a face (the field inside it the face itself, so it reads sunk): its sill, jambs and
 * head, square or pointed (an Ottoman niche's), each strip `fw` wide and `out` proud.
 */
function panelFrame(sink: PartSink, bucket: RegionalBucket, at: (u: number, y: number, o: number) => Vec3, pw: number, y0: number, y1: number,
  fw: number, out: number, pointed: boolean, opts: EmitOptions): void {
  const strip = (u0: number, ya0: number, u1: number, ya1: number) => {
    // a strip from (u0, ya0) to (u1, ya1) on the face, fw wide, its face and its upper edge back to the wall
    const du = u1 - u0, dy = ya1 - ya0, l = Math.hypot(du, dy) || 1, nu = -dy / l * fw / 2, ny = du / l * fw / 2;
    sink.quad(bucket, at(u0 - nu, ya0 - ny, out), at(u1 - nu, ya1 - ny, out), at(u1 + nu, ya1 + ny, out), at(u0 + nu, ya0 + ny, out), opts);
    sink.quad(bucket, at(u1 + nu, ya1 + ny, 0), at(u0 + nu, ya0 + ny, 0), at(u0 + nu, ya0 + ny, out), at(u1 + nu, ya1 + ny, out), opts);
  };
  const h = pw / 2, spring = pointed ? y1 - pw * 0.55 : y1;
  strip(-h - fw / 2, y0, h + fw / 2, y0);
  strip(-h, y0, -h, spring);
  strip(h, spring, h, y0);
  if (!pointed) { strip(h + fw / 2, y1, -h - fw / 2, y1); return; }
  // the pointed head: two arcs each in two chords from the springs to the apex
  const apex = y1, mid = (t: number) => spring + (apex - spring) * Math.sin(t * Math.PI / 2);
  strip(-h, spring, -h * 0.55, mid(0.62));
  strip(-h * 0.55, mid(0.62), 0, apex);
  strip(0, apex, h * 0.55, mid(0.62));
  strip(h * 0.55, mid(0.62), h, spring);
}

/**
 * The Franconian market fountain (Marktbrunnen: Rothenburg's St George's, Dinkelsbühl's; gauntlet wave 156: Steinburg's
 * Brunnen "a generic Italianate tiered fountain; a Franconian Marktbrunnen is a column on an octagonal basin"): an
 * octagonal trough of dressed sandstone on a step, its coping waist-high, the water in it; from its middle a moulded
 * pedestal carrying a slender column, its capital, and the saint standing on it; four iron spouts from the pedestal
 * into the trough.
 * (the looks lane, 2026-10-15; WORKLIST #11 r2) built as it is built: the step eight stones, the trough a sandstone slab
 * a side under a coping slab a side, the iron clamps leaded across the coping's joints, each stone its own tone and
 * the lichen in the shade of the step.
 */
function marktFountain(sink: PartSink, R: number, base: number, look: () => number): ReturnType<LandmarkBuilder> {
  const oct = Math.PI / 8, Ro = R / Math.cos(oct);
  polySlabs(sink, 'stone', 8, R - 0.06, R + 0.55, base, 0.18, oct, () => ({ tint: stoneTone(look, 0.12, 0.3) }));
  polySlabs(sink, 'stone', 8, R - 0.28, R, 0.18, 0.82, oct, () => ({ tint: stoneTone(look, 0.14, 0.12) }));
  polySlabs(sink, 'stone', 8, R - 0.34, R + 0.12, 0.82, 1.0, oct, () => ({ tint: stoneTone(look, 0.1, 0.18) }));
  // the trough's floor under the water, and the water
  revolve(sink, 'stone', 0, 0, [[Ro - 0.29, 0.42], [0.62, 0.42]], 8, { decor: true, shade: 0.55 }, oct);
  revolve(sink, 'glass', 0, 0, [[Ro - 0.3, 0.72], [0.62, 0.72]], 8, { decor: true }, oct);
  // the iron clamps across the coping's joints, leaded into the stone
  for (let k = 0; k < 8; k++) {
    const a = oct + k * Math.PI / 4, r = (R - 0.11) / Math.cos(oct), tx = Math.cos(a), tz = -Math.sin(a);
    const c: Vec3 = [Math.sin(a) * r, 1.006, Math.cos(a) * r];
    sink.member('structureMetal', [c[0] - tx * 0.13, c[1], c[2] - tz * 0.13], [c[0] + tx * 0.13, c[1], c[2] + tz * 0.13], 0.05, 0.014, [0, 1, 0],
      { colour: IRON, decor: true, exposed: true }, 0.004);
  }
  const shaftTop = 4.7;
  revolve(sink, 'stone', 0, 0, [[0.66, 0.42], [0.66, 1.25], [0.54, 1.38], [0.4, 1.48], [0.33, 1.62], [0.29, shaftTop - 0.3], [0.38, shaftTop - 0.2],
    [0.52, shaftTop], [0.52, shaftTop + 0.18], [0, shaftTop + 0.19]], 8, {}, oct);
  // the saint topples off the column when the fountain is breached (props lane A, E12)
  piece(sink, { name: 'figure', kind: 'detach', at: 'breached', fall: 'topple' }, (s) => figure(s, shaftTop + 0.18, 1.85, SANDSTONE, shade(SANDSTONE, 0.78), 'robe'));
  // (the looks lane, 2026-10-13; LOOKS-BRIEF item 3: "the water is a flat blue disc ... wants a sandstone basin with
  // carved panels ... and spout jets") each of the trough's eight faces a sunk panel in a moulded frame, a ringed boss
  // on four of them; the pedestal's acanthus band; the water's surface rings where the jets land
  for (let k = 0; k < 8; k++) {
    const at = polyFace(8, oct, k, R), side = 2 * R * Math.tan(oct), pw = side * 0.62, cy = 0.5;
    panelFrame(sink, 'stone', at, pw, cy - 0.21, cy + 0.21, 0.05, 0.035, false, { decor: true });
    if (k % 2 === 0) {
      // a boss in the field: the town's arms in a ring
      const r0 = 0.13, n = 8;
      for (let i = 0; i < n; i++) {
        const t0 = i / n * Math.PI * 2, t1 = (i + 1) / n * Math.PI * 2;
        sink.quad('stone', at(Math.cos(t0) * r0, cy + Math.sin(t0) * r0, 0.05), at(Math.cos(t1) * r0, cy + Math.sin(t1) * r0, 0.05),
          at(Math.cos(t1) * r0, cy + Math.sin(t1) * r0, 0.0), at(Math.cos(t0) * r0, cy + Math.sin(t0) * r0, 0.0), { decor: true });
      }
      sink.polygon('stone', Array.from({ length: n }, (_, i) => at(Math.cos(i / n * Math.PI * 2) * r0, cy + Math.sin(i / n * Math.PI * 2) * r0, 0.05)), { decor: true });
    }
  }
  revolve(sink, 'stone', 0, 0, [[0.7, 1.1], [0.74, 1.16], [0.7, 1.24]], 8, { decor: true }, oct);
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2 + Math.PI / 4, c = Math.cos(a), s = Math.sin(a);
    bar(sink, 'structureMetal', [c * 0.6, 1.05, s * 0.6], [c * 1.15, 0.98, s * 1.15], 0.05, { colour: IRON, decor: true });
    // the jet: an arc of water from the spout's mouth to the trough, pale and catching the light, and its ring of ripples
    let prev: Vec3 = [c * 1.17, 0.97, s * 1.17];
    for (let i = 1; i <= 5; i++) {
      const t = i / 5, d = 1.17 + t * 0.55, y = 0.97 + 0.12 * t - 0.36 * t * t;
      const p: Vec3 = [c * d, y, s * d];
      bar(sink, 'structureMetal', prev, p, 0.032 - t * 0.008, { colour: WATER_JET, decor: true });
      prev = p;
    }
    const rc: Vec3 = [c * 1.72, 0.735, s * 1.72];
    for (let i = 0; i < 10; i++) {
      const t0 = i / 10 * Math.PI * 2, t1 = (i + 1) / 10 * Math.PI * 2, r1 = 0.16, r2 = 0.22;
      sink.quad('structureMetal', [rc[0] + Math.cos(t0) * r1, rc[1], rc[2] + Math.sin(t0) * r1], [rc[0] + Math.cos(t0) * r2, rc[1], rc[2] + Math.sin(t0) * r2],
        [rc[0] + Math.cos(t1) * r2, rc[1], rc[2] + Math.sin(t1) * r2], [rc[0] + Math.cos(t1) * r1, rc[1], rc[2] + Math.sin(t1) * r1], { colour: WATER_JET, decor: true });
    }
  }
  return { parts: finishLandmark(sink), tints: { stone: [1.04, 0.95, 0.85] } };
}

/**
 * The Ottoman village fountain (a Levantine market square's, Deir el Qamar's on its Midan): an octagonal basin of dressed
 * sandstone with its moulded coping, the water in it, and from its middle an octagonal pillar carrying the brass spouts
 * on each face, a carved band, a moulded cornice and a small ribbed dome with its finial.
 * (the looks lane, 2026-10-15; WORKLIST #11 r2: "arches and niches cut", members and construction) the basin on a step
 * of eight stones, its walls a slab a side under a coping slab a side, a pointed niche framed on each face; the pillar's
 * faces each a pointed niche, the stalactite corbels (muqarnas) stepping out under its cornice, the dome's eight ribs to
 * the finial; the water arcing from the spouts. The dome and its finial come off as the fountain's own pieces (E12).
 */
function ottomanFountain(sink: PartSink, R: number, base: number, look: () => number): ReturnType<LandmarkBuilder> {
  const oct = Math.PI / 8, Ro = R / Math.cos(oct);
  polySlabs(sink, 'stone', 8, R - 0.05, R + 0.5, base, 0.16, oct, () => ({ tint: stoneTone(look, 0.12, 0.2) }));
  polySlabs(sink, 'stone', 8, R - 0.3, R, 0.16, 0.64, oct, () => ({ tint: stoneTone(look, 0.12, 0.1) }));
  polySlabs(sink, 'stone', 8, R - 0.36, R + 0.1, 0.64, 0.8, oct, () => ({ tint: stoneTone(look, 0.1, 0.14) }));
  revolve(sink, 'stone', 0, 0, [[Ro - 0.31, 0.4], [0.6, 0.4]], 8, { decor: true, shade: 0.55 }, oct);
  revolve(sink, 'glass', 0, 0, [[Ro - 0.32, 0.56], [0.6, 0.56]], 8, { decor: true }, oct);
  // a pointed niche framed on each of the basin's faces
  for (let k = 0; k < 8; k++) panelFrame(sink, 'stone', polyFace(8, oct, k, R), 2 * R * Math.tan(oct) * 0.5, 0.24, 0.56, 0.045, 0.03, true, { decor: true });
  // the pillar: its foot, the shaft, the band where the spouts come out, the cornice
  const p = Math.max(0.45, R * 0.16) / Math.cos(oct), ap = p * Math.cos(oct);
  revolve(sink, 'stone', 0, 0, [[p * 1.35, 0.4], [p * 1.35, 0.85], [p, 1.0], [p, 1.9], [p * 1.12, 1.95], [p * 1.12, 2.25], [p, 2.3], [p, 2.6],
    [p * 1.32, 2.78], [p * 1.32, 2.92], [p * 0.95, 2.95]], 8, {}, oct);
  // a pointed niche on each face of the shaft, over the spouts' band the stalactite corbels in two tiers
  for (let k = 0; k < 8; k++) panelFrame(sink, 'stone', polyFace(8, oct, k, ap), ap * 2 * Math.tan(oct) * 0.56, 1.06, 1.82, 0.035, 0.025, true, { decor: true });
  for (let tier = 0; tier < 2; tier++) {
    const y = 2.6 + tier * 0.09, r = ap + 0.02 + tier * 0.07;
    for (let k = 0; k < 16; k++) {
      const a = (k + (tier ? 0.5 : 0)) / 16 * Math.PI * 2, x = Math.sin(a) * r, z = Math.cos(a) * r;
      sink.placed(a, x, 0, z, () => sink.span('stone', -0.06, y, -0.06, 0.06, y + 0.09, 0.06, { decor: true, fine: true, shade: 0.85 }));
    }
  }
  // the dome and its ribs, the finial (the dome comes off when the fountain is breached, the finial at the first damage)
  piece(sink, { name: 'dome', kind: 'detach', at: 'breached', fall: 'drop' }, (s) => {
    const prof: Array<[number, number]> = [[p * 0.95, 2.95], [p * 0.92, 3.25], [p * 0.7, 3.55], [p * 0.36, 3.75], [0, 3.8]];
    revolve(s, 'stone', 0, 0, prof, 8, {}, oct);
    for (let k = 0; k < 8; k++) {
      const a = oct + k * Math.PI / 4 + Math.PI / 2;
      for (let i = 0; i + 1 < prof.length - 1; i++) {
        const [r0, y0] = prof[i], [r1, y1] = prof[i + 1];
        bar(s, 'stone', [Math.cos(-a) * r0 * 1.01, y0, Math.sin(-a) * r0 * 1.01], [Math.cos(-a) * r1 * 1.01, y1, Math.sin(-a) * r1 * 1.01], 0.05, { decor: true });
      }
    }
  });
  piece(sink, { name: 'finial', kind: 'detach', at: 'damaged', fall: 'drop' }, (s) =>
    revolve(s, 'structureMetal', 0, 0, [[0.04, 3.78], [0.11, 3.88], [0.12, 4.0], [0.05, 4.1], [0.03, 4.45], [0, 4.5]], 8, { colour: BRASS, decor: true }));
  // a brass spout from the middle of each face of the band, over the water, and the water arcing from it
  for (let k = 0; k < 8; k++) {
    const a = k * Math.PI / 4, cs = Math.sin(a), cc = Math.cos(a), r0 = p * Math.cos(oct) * 1.12;
    bar(sink, 'structureMetal', [cs * r0, 2.1, cc * r0], [cs * (r0 + 0.32), 2.04, cc * (r0 + 0.32)], 0.05, { colour: BRASS, decor: true });
    let prev: Vec3 = [cs * (r0 + 0.33), 2.03, cc * (r0 + 0.33)];
    const fall = Math.min(0.6, Math.max(0.3, R - 0.6 - (r0 + 0.33)));
    for (let i = 1; i <= 4; i++) {
      const t = i / 4, d = r0 + 0.33 + t * fall, y = 2.03 + 0.06 * t - (2.03 - 0.56) * t * t;
      const q: Vec3 = [cs * d, Math.max(0.57, y), cc * d];
      bar(sink, 'structureMetal', prev, q, 0.028 - t * 0.008, { colour: WATER_JET, decor: true, fine: true });
      prev = q;
    }
  }
  return { parts: finishLandmark(sink), tints: { stone: [1.02, 0.96, 0.88] } };
}
const BRASS = rgb(0xa98a46);

/**
 * The bandstand (a spa park's or a garrison town's music pavilion): an octagonal plinth with its steps, eight slender
 * cast-iron columns with brackets, a railing between them, and a bell-shaped roof with a finial.
 */
export const bandstand: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const R = Math.max(2.5, Number(ctx.params.radius)), base = -0.6 - ctx.groundFall, deck = 1.0, colH = 3.0;
  const oct = Math.PI / 8, Rc = R / Math.cos(oct);
  revolve(sink, 'stone', 0, 0, [[Rc, base], [Rc, deck - 0.12], [Rc + 0.12, deck - 0.12], [Rc + 0.12, deck], [0.001, deck]], 8, {}, oct);
  // the steps up to the deck on the front facet
  for (let k = 0; k < 4; k++) {
    const y = deck * (k + 1) / 5, z = R + 0.3 * (4 - k);
    sink.span('stone', -0.9, base, R - 0.2, 0.9, y, z);
  }
  const top = deck + colH;
  for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4 + oct, x = Math.sin(a) * (Rc - 0.2), z = Math.cos(a) * (Rc - 0.2);
    revolve(sink, 'structureMetal', x, z, [[0.14, deck], [0.14, deck + 0.2], [0.07, deck + 0.3], [0.06, top - 0.2], [0.11, top - 0.05], [0.11, top]], 8,
      { colour: IRON_GREEN });
    bar(sink, 'structureMetal', [x, top - 0.7, z], [x * 0.82, top, z * 0.82], 0.05, { colour: IRON_GREEN, decor: true });
    // the railing round the deck, open over the steps
    const b = (i + 1) * Math.PI / 4 + oct;
    if (i !== 7) railing(sink, [x, z], [Math.sin(b) * (Rc - 0.2), Math.cos(b) * (Rc - 0.2)], 0.9, IRON_GREEN, { base: deck, pitch: 1.4, module: false });
  }
  // the roof: an eave ring, the bell-shaped sweep, a lantern and finial
  revolve(sink, 'structureMetal', 0, 0, [[Rc + 0.4, top], [Rc + 0.4, top + 0.16], [Rc * 0.86, top + 0.55], [Rc * 0.55, top + 1.35], [Rc * 0.28, top + 2.0],
    [0.3, top + 2.3], [0.3, top + 2.55], [0.001, top + 2.6]], 8, { colour: IRON_GREEN }, oct);
  revolve(sink, 'structureMetal', 0, 0, [[0.001, top - 0.01], [Rc + 0.4, top - 0.01]], 8, { colour: PAINT_WHITE }, oct);
  revolve(sink, 'structureMetal', 0, 0, [[0.06, top + 2.55], [0.16, top + 2.75], [0.04, top + 3.0], [0.02, top + 3.5]], 8, { colour: GILT, decor: true });
  return { parts: sink.finish() };
};

/**
 * The park gate: two masonry piers with stone caps and urns, the wrought-iron double gate between them standing open,
 * and a run of railing each side on a dwarf wall to an end pier.
 */
export const parkGate: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const W = Math.max(3, Number(ctx.params.width)), run = Math.max(0, Number(ctx.params.railing));
  const base = -0.6 - ctx.groundFall;
  const pier = (x: number, h: number) => {
    sink.span('stone', x - 0.55, base, -0.55, x + 0.55, h, 0.55);
    sink.span('stone', x - 0.68, h, -0.68, x + 0.68, h + 0.22, 0.68);
    revolve(sink, 'stone', x, 0, [[0.28, h + 0.22], [0.36, h + 0.42], [0.24, h + 0.7], [0.3, h + 0.85], [0.001, h + 1.0]], 10);
  };
  pier(-W / 2 - 0.55, 3.0);
  pier(W / 2 + 0.55, 3.0);
  // the gate leaves, swung open into the park (dressing: a hull passes as through the open gate it is)
  for (const sx of [-1, 1]) {
    const hx = sx * W / 2, leaf = W / 2 - 0.1, open = 1.2;
    const tip: [number, number] = [hx - sx * Math.cos(open) * leaf, -Math.sin(open) * leaf];
    railing(sink, [hx, 0], tip, 2.2, IRON, { pitch: leaf, base: 0.05 });
    sink.member('structureMetal', [hx, 2.35, 0], [tip[0], 2.35, tip[1]], 0.06, 0.06, [0, 1, 0], { colour: GILT, decor: true, exposed: true }, 0.03);
  }
  if (run > 0) {
    for (const sx of [-1, 1]) {
      const x0 = sx * (W / 2 + 1.1), x1 = sx * (W / 2 + 1.1 + run);
      railing(sink, [x0, 0], [x1, 0], 1.5, IRON, { plinth: 'stone', base: 0.4 });
      pier(x1 + sx * 0.45, 1.9);
    }
  }
  return { parts: finishLandmark(sink) };
};

/**
 * The square: a green w × d with its gravel paths (a cross, a ring, or diagonals), a railing round it (iron on a dwarf
 * wall, or a painted picket fence) open where the paths leave, benches and lamps along the paths (the props'
 * destructible kinds) and a centre piece (another set piece, placed on the green's centre after it).
 */
export const parkSquare: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const W = Math.max(10, Number(ctx.params.width)), D = Math.max(10, Number(ctx.params.depth)), paths = String(ctx.params.paths);
  const fence = ctx.params.railing === false ? 'none' : String(ctx.params.railing) === 'picket' ? 'picket' : 'iron';
  const benches = Math.max(0, Math.round(Number(ctx.params.benches))), lamps = Math.max(0, Math.round(Number(ctx.params.lamps)));
  const centre = String(ctx.params.centre), pw = 2.4;
  const gravel: RegionalBucket = 'plaster3';
  // the gravel paths, draped over the ground (2026-10-06: level beds at the base sank under the green's high side)
  const bed = (a: readonly [number, number], b: readonly [number, number], w: number) => drapedPath(sink, gravel, ctx.ground, a, b, w, { lift: 0.04 });
  const exits: Array<[number, number]> = [];
  if (paths === 'cross' || paths === 'ring') {
    bed([-W / 2, 0], [W / 2, 0], pw); bed([0, -D / 2], [0, D / 2], pw);
    exits.push([-W / 2, 0], [W / 2, 0], [0, -D / 2], [0, D / 2]);
  }
  if (paths === 'diagonal') {
    bed([-W / 2, -D / 2], [W / 2, D / 2], pw); bed([-W / 2, D / 2], [W / 2, -D / 2], pw);
    exits.push([-W / 2, -D / 2], [W / 2, D / 2], [-W / 2, D / 2], [W / 2, -D / 2]);
  }
  if (paths === 'ring') {
    const rr = Math.min(W, D) * 0.3;
    for (let k = 0; k < 16; k++) {
      const a = k / 16 * Math.PI * 2, b = (k + 1) / 16 * Math.PI * 2;
      bed([Math.cos(a) * rr, Math.sin(a) * rr], [Math.cos(b) * rr, Math.sin(b) * rr], pw * 0.8);
    }
  }
  // the fence round the green, broken where a path leaves it
  if (fence !== 'none') {
    const corners: Array<[number, number]> = [[-W / 2, -D / 2], [W / 2, -D / 2], [W / 2, D / 2], [-W / 2, D / 2]];
    for (let i = 0; i < 4; i++) {
      const a = corners[i], b = corners[(i + 1) % 4];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / len, uz = (b[1] - a[1]) / len;
      // the cuts along this side (exits within a path's half width of the side's line)
      const cuts = exits.map(([x, z]) => (x - a[0]) * ux + (z - a[1]) * uz).filter((t, k) => {
        const [x, z] = exits[k];
        return Math.abs((x - a[0]) * uz - (z - a[1]) * ux) < 0.5 && t > 0.5 && t < len - 0.5;
      }).sort((p, q) => p - q);
      let t0 = 0;
      for (const t of [...cuts, len + pw]) {
        const t1 = Math.min(len, t - pw * 0.75);
        if (t1 - t0 > 0.6) {
          const p0: [number, number] = [a[0] + ux * t0, a[1] + uz * t0], p1: [number, number] = [a[0] + ux * t1, a[1] + uz * t1];
          if (fence === 'iron') railing(sink, p0, p1, 1.1, IRON, { plinth: 'stone', base: 0.35 });
          else picketRun(sink, p0, p1, PICKET);
        }
        t0 = t + pw * 0.75;
      }
    }
  }
  // benches and lamps along the paths (the props' destructibles), facing the paths
  const destructibles: Array<{ kind: string; x: number; z: number; yawDeg: number }> = [];
  // each path's direction out from the centre and how far along it the furniture stands
  const dirs: Array<[number, number, number]> = paths === 'diagonal'
    ? [[W, D], [-W, D], [W, -D], [-W, -D]].map(([a, b]): [number, number, number] => { const l = Math.hypot(a, b); return [a / l, b / l, l * 0.28]; })
    : [[1, 0, W * 0.34], [-1, 0, W * 0.34], [0, 1, D * 0.34], [0, -1, D * 0.34]];
  for (let k = 0; k < benches; k++) {
    const [ux, uz, t] = dirs[k % 4], side = k < 4 ? 1 : -1, off = pw / 2 + 0.9;
    const nx = -uz * side, nz = ux * side;
    destructibles.push({ kind: 'bench', x: ux * t + nx * off, z: uz * t + nz * off, yawDeg: Math.atan2(-nx, -nz) * 180 / Math.PI });
  }
  for (let k = 0; k < lamps; k++) {
    const [ux, uz, t] = dirs[k % 4], off = pw / 2 + 0.5;
    destructibles.push({ kind: 'lamp', x: ux * t * 0.55 + uz * off, z: uz * t * 0.55 - ux * off, yawDeg: Math.atan2(-uz, ux) * 180 / Math.PI });
  }
  const children: LandmarkPlacement[] = [];
  // the centre piece inside the square's own railing; `centreHeight` (when set) sizes it — a village's memorial obelisk
  // stands a third lower than a town square's
  const centreHeight = Number(ctx.params.centreHeight) > 0 ? { height: Number(ctx.params.centreHeight) } : {};
  // (`inscription`: the centre piece's, an obelisk's plaque)
  const inscription = ctx.params.inscription ? { inscription: String(ctx.params.inscription) } : {};
  if (centre !== 'none' && centre !== '') children.push({ kind: centre as LandmarkKind, x: 0, z: 0, yawDeg: 0, params: centre === 'obelisk' ? { railing: false, ...centreHeight, ...inscription } : centreHeight });
  return { parts: finishLandmark(sink), tints: { plaster3: [0.95, 0.86, 0.68] }, destructibles, children };
};

/** A painted picket fence from a to b: posts, two rails and the pickets (fine), a hull's height. */
function picketRun(sink: PartSink, a: readonly [number, number], b: readonly [number, number], colour: Rgb): void {
  const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz);
  const posts = Math.max(1, Math.round(len / 2.2));
  for (let k = 0; k <= posts; k++) {
    const x = a[0] + dx * k / posts, z = a[1] + dz * k / posts;
    sink.span('structureWood', x - 0.05, -0.2, z - 0.05, x + 0.05, 1.05, z + 0.05, { colour, decor: true });
  }
  for (const y of [0.3, 0.8]) bar(sink, 'structureWood', [a[0], y, a[1]], [b[0], y, b[1]], 0.06, { colour, decor: true });
  const n = Math.floor(len / 0.16);
  for (let k = 1; k < n; k++) {
    const x = a[0] + dx * k / n, z = a[1] + dz * k / n;
    const p: Vec3 = [x, 0.08, z];
    sink.span('structureWood', p[0] - 0.035, 0.08, p[2] - 0.035, p[0] + 0.035, 0.98 + (k % 2) * 0.04, p[2] + 0.035, { colour, decor: true, fine: true });
  }
}

// ---------------------------------------------------------------------------------------------------------- paving
// (the looks lane, 2026-10-15; WORKLIST #11, the r2 standard: "setts and kerbs as units", "kerbed gravel beds",
// "feathered path edges"; the bunker r2 rule 2, "a plank print does not count as a member") a square's or a path's
// paving laid as what it is: each flag, sett or brick bay its own unit over the ground at its corners, its own tone and
// window of the print, a hair of heave, the joints between them showing the bedding under; kerbs as dressed blocks, each
// its own length and tone; gravel and beaten earth with ragged, feathered edges that fade into the ground. Dressing all
// (a hull drives over it as over the ground); a unit's sides are fine joinery (a phone and a long view keep the tops).

/** The ground over the piece's base (0 where the builder has none). */
type Ground = (x: number, z: number) => number;
const flatGround: Ground = () => 0;

interface UnitLook {
  /** the unit's top over the ground (m) */
  lift: number;
  /** its own rise or fall (m, ±half) */
  heave?: number;
  /** its tone: an rgb multiplier on the bucket's paint */
  tint: Rgb;
  /** the print's window: its origin in the piece's frame and its axes (u along `u`, v across) */
  uv?: { x: number; z: number; turn?: boolean };
}

/**
 * One unit of paving over [x0, x1] × [z0, z1] (the piece's frame): its top over the ground at each corner + lift, its four
 * sides carried down 4 cm under the ground (fine), the print's window its own.
 */
function paveUnit(sink: PartSink, bucket: RegionalBucket, ground: Ground, x0: number, x1: number, z0: number, z1: number, look: UnitLook): void {
  const h = look.lift + (look.heave ?? 0);
  const top = (x: number, z: number): Vec3 => [x, ground(x, z) + h, z];
  const low = (x: number, z: number): Vec3 => [x, ground(x, z) - 0.04, z];
  const o = look.uv ?? { x: x0, z: z0 };
  const uv = o.turn ? { kind: 'plane' as const, origin: [o.x, 0, o.z] as Vec3, u: [0, 0, 1] as Vec3, v: [1, 0, 0] as Vec3 }
    : { kind: 'plane' as const, origin: [o.x, 0, o.z] as Vec3, u: [1, 0, 0] as Vec3, v: [0, 0, 1] as Vec3 };
  // counter-clockwise from above; a unit over 1.2 m a side follows the ground on a grid (a brick court's bay), so the
  // bedding under it never shows through its middle
  const nx = Math.max(1, Math.ceil((x1 - x0) / 1.2 - 1e-6)), nz = Math.max(1, Math.ceil((z1 - z0) / 1.2 - 1e-6));
  const X = (i: number) => x0 + (x1 - x0) * i / nx, Zc = (j: number) => z0 + (z1 - z0) * j / nz;
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    sink.quad(bucket, top(X(i), Zc(j)), top(X(i), Zc(j + 1)), top(X(i + 1), Zc(j + 1)), top(X(i + 1), Zc(j)), { decor: true, uv, tint: look.tint });
  }
  const side = { decor: true, fine: true, tint: look.tint, shade: 0.82 } as const;
  for (let i = 0; i < nx; i++) {
    sink.quad(bucket, top(X(i + 1), z0), low(X(i + 1), z0), low(X(i), z0), top(X(i), z0), side);
    sink.quad(bucket, top(X(i), z1), low(X(i), z1), low(X(i + 1), z1), top(X(i + 1), z1), side);
  }
  for (let j = 0; j < nz; j++) {
    sink.quad(bucket, top(x0, Zc(j)), low(x0, Zc(j)), low(x0, Zc(j + 1)), top(x0, Zc(j + 1)), side);
    sink.quad(bucket, top(x1, Zc(j + 1)), low(x1, Zc(j + 1)), low(x1, Zc(j)), top(x1, Zc(j)), side);
  }
}

/** A stone's tone: a warm-grey spread, a share of them lichened or stained (from the look stream). */
function stoneTone(look: () => number, spread = 0.18, lichen = 0.12): Rgb {
  const t = 0.9 + (look() - 0.5) * spread, l = look();
  if (l < lichen) return [t * 0.9, t * 0.97, t * 0.8];
  if (l > 0.94) return [t * 0.8, t * 0.79, t * 0.78];
  return [t, t * 0.985, t * 0.955];
}

interface FlagOptions {
  /** the courses run along x (rows stacked along z), or along z */
  along: 'x' | 'z';
  /** a course's depth (m: min, max) and a unit's length along it */
  course: readonly [number, number];
  length: readonly [number, number];
  joint?: number;
  lift?: number;
  heave?: number;
  lichen?: number;
}

/**
 * Flags or setts laid in courses over the rectangle [x0, x1] × [z0, z1]: each course its own depth, each unit its own
 * length (the joints broken course to course), the bedding under them a darker sheet a little lower.
 */
function layFlags(sink: PartSink, bucket: RegionalBucket, ground: Ground, x0: number, x1: number, z0: number, z1: number,
  o: FlagOptions, look: () => number): void {
  const joint = o.joint ?? 0.012, lift = o.lift ?? 0.06;
  // the bedding: the joints' sand and mortar, dark, under the units
  drapedRect(sink, bucket, ground, { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, hw: (x1 - x0) / 2, hd: (z1 - z0) / 2 },
    { lift: lift - 0.032, cell: 1, skirt: 0.2, emit: { tint: [0.55, 0.53, 0.5], shade: 0.8 } });
  const [a0, a1, b0, b1] = o.along === 'x' ? [x0, x1, z0, z1] : [z0, z1, x0, x1];
  for (let b = b0; b < b1 - 0.05;) {
    let depth = o.course[0] + look() * (o.course[1] - o.course[0]);
    if (b1 - (b + depth) < o.course[0] * 0.6) depth = b1 - b;
    const bb = Math.min(b1, b + depth);
    for (let a = a0 + (look() < 0.5 ? 0 : -o.length[0] * 0.5); a < a1 - 0.05;) {
      let len = o.length[0] + look() * (o.length[1] - o.length[0]);
      if (a1 - (a + len) < o.length[0] * 0.5) len = a1 - a;
      const aa = Math.max(a0, a), ab = Math.min(a1, a + len);
      const tint = stoneTone(look, 0.2, o.lichen ?? 0.12), heave = (look() - 0.5) * (o.heave ?? 0.02), ux = look() * 3, uz = look() * 3;
      if (ab - aa > 0.08) {
        const [ux0, ux1, uz0, uz1] = o.along === 'x' ? [aa + joint / 2, ab - joint / 2, b + joint / 2, bb - joint / 2] : [b + joint / 2, bb - joint / 2, aa + joint / 2, ab - joint / 2];
        paveUnit(sink, bucket, ground, ux0, ux1, uz0, uz1, { lift, heave, tint, uv: { x: ux0 - ux, z: uz0 - uz } });
      }
      a += len;
    }
    b = bb;
  }
}

/**
 * Kerb blocks round the rectangle [x0, x1] × [z0, z1] (its outside the outline), `k` wide: each block its own length
 * and tone, a hand over the paving, its outer face carried down past the ground's lowest point under it. `open`: the
 * sides left unkerbed ('+z' the front ...).
 */
function kerbRing(sink: PartSink, bucket: RegionalBucket, ground: Ground, x0: number, x1: number, z0: number, z1: number, k: number,
  o: { top: number; length: readonly [number, number]; joint?: number; foot?: number; open?: ReadonlyArray<'+x' | '-x' | '+z' | '-z'> }, look: () => number): void {
  const joint = o.joint ?? 0.012, foot = o.foot ?? 0.35, open = new Set(o.open ?? []);
  const block = (xa: number, xb: number, za: number, zb: number) => {
    const gs = [ground(xa, za), ground(xb, za), ground(xb, zb), ground(xa, zb)];
    const t = stoneTone(look, 0.16, 0.1);
    sink.span(bucket, xa, Math.min(...gs) - foot, za, xb, Math.max(...gs) + o.top, zb, { decor: true, tint: t });
  };
  const run = (a: number, b: number, at: (t0: number, t1: number) => void) => {
    for (let t = a; t < b - 0.05;) {
      const len = o.length[0] + look() * (o.length[1] - o.length[0]);
      const t1 = b - (t + len) < o.length[0] * 0.5 ? b : t + len;
      at(t, t1);
      t = t1 + joint;
    }
  };
  // the front and back runs carry the corners; the sides run between them
  if (!open.has('+z')) run(x0, x1, (t0, t1) => block(t0, t1, z1 - k, z1));
  if (!open.has('-z')) run(x0, x1, (t0, t1) => block(t0, t1, z0, z0 + k));
  const s0 = open.has('-z') ? z0 : z0 + k + joint, s1 = open.has('+z') ? z1 : z1 - k - joint;
  if (!open.has('+x')) run(s0, s1, (t0, t1) => block(x1 - k, x1, t0, t1));
  if (!open.has('-x')) run(s0, s1, (t0, t1) => block(x0, x0 + k, t0, t1));
}

/**
 * A Bengal temple court's brick paving (Bishnupur's, Kalna's): bays of bricks laid flat, framed by bands of bricks on
 * edge (their courses turned across the band, a hair proud), the court's edge a soldier course carried down to the
 * ground. Over [x0, x1] × [z0, z1], `bay` the bays' side.
 */
function brickCourt(sink: PartSink, ground: Ground, x0: number, x1: number, z0: number, z1: number, bay: number, lift: number, look: () => number): void {
  const band = 0.13, edge = 0.25;
  drapedRect(sink, 'stone', ground, { cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, hw: (x1 - x0) / 2 - edge, hd: (z1 - z0) / 2 - edge },
    { lift: lift - 0.035, cell: 1.2, skirt: 0.15, emit: { tint: [0.5, 0.46, 0.42], shade: 0.8 } });
  const ix0 = x0 + edge, ix1 = x1 - edge, iz0 = z0 + edge, iz1 = z1 - edge;
  const nx = Math.max(1, Math.round((ix1 - ix0) / bay)), nz = Math.max(1, Math.round((iz1 - iz0) / bay));
  const bx = (ix1 - ix0) / nx, bz = (iz1 - iz0) / nz;
  // (a bay's bricks vary brick by brick in the print; a bay its own firing and wear, a few lichened in the shade or
  // stained dark)
  const brick = (): Rgb => { const t = 0.93 + look() * 0.11, l = look(); return l < 0.06 ? [t * 0.88, t * 0.94, t * 0.82] : l > 0.95 ? [t * 0.8, t * 0.77, t * 0.75] : [t, t * 0.98, t * 0.95]; };
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    // a bay inside its bands (the bands are the bays' shared edges, half each side)
    const xa = ix0 + i * bx + (i === 0 ? 0 : band / 2), xb = ix0 + (i + 1) * bx - (i === nx - 1 ? 0 : band / 2);
    const za = iz0 + j * bz + (j === 0 ? 0 : band / 2), zb = iz0 + (j + 1) * bz - (j === nz - 1 ? 0 : band / 2);
    paveUnit(sink, 'stone', ground, xa + 0.004, xb - 0.004, za + 0.004, zb - 0.004, { lift, heave: (look() - 0.5) * 0.025, tint: brick(), uv: { x: xa, z: za } });
  }
  // the bands of bricks on edge between the bays: along x at each inner z line, along z at each inner x line (in lengths
  // between the crossings), their print turned across them
  for (let j = 1; j < nz; j++) {
    const z = iz0 + j * bz;
    for (let i = 0; i < nx; i++) {
      const xa = ix0 + i * bx + (i === 0 ? 0 : band / 2), xb = ix0 + (i + 1) * bx - (i === nx - 1 ? 0 : band / 2);
      paveUnit(sink, 'stone', ground, xa, xb, z - band / 2 + 0.003, z + band / 2 - 0.003, { lift: lift + 0.012, tint: brick(), uv: { x: xa, z: z, turn: true } });
    }
  }
  for (let i = 1; i < nx; i++) {
    const x = ix0 + i * bx;
    for (let j = 0; j < nz; j++) {
      const za = iz0 + j * bz - (j === 0 ? 0 : band / 2), zb = iz0 + (j + 1) * bz + (j === nz - 1 ? 0 : band / 2);
      paveUnit(sink, 'stone', ground, x - band / 2 + 0.003, x + band / 2 - 0.003, za, zb, { lift: lift + 0.012, tint: brick(), uv: { x, z: za } });
    }
  }
  // the soldier course round the edge: bricks on end in pairs, their tops a hair over the court, carried to the ground
  kerbRing(sink, 'stone', ground, x0, x1, z0, z1, edge, { top: lift + 0.03, length: [0.46, 0.5], joint: 0.008, foot: 0.25 }, look);
}

/**
 * Gravel or beaten earth draped over [-w/2, w/2] × [z0, z1] with ragged, feathered edges: the outline's points pushed in
 * and out a hand and brought down to the ground, so the surface thins into the field instead of ending on a straight
 * hard edge; worn darker down the middle (a trodden line, or a yard's wheel ruts `ruts` m either side of the middle);
 * a few loose stones in it (earth) or spilt over its edges (gravel).
 */
function featheredStrip(sink: PartSink, ground: Ground, w: number, z0: number, z1: number, o: { lift: number; surface: 'gravel' | 'earth'; ruts?: number; ends?: boolean; stones?: boolean },
  look: () => number): void {
  const cell = 0.5, nx = Math.max(2, Math.ceil(w / cell)), nz = Math.max(2, Math.ceil((z1 - z0) / 1.0));
  const jx: number[] = [], jz: number[] = [];
  for (let j = 0; j <= nz; j++) jx.push((look() - 0.5) * 0.45, (look() - 0.5) * 0.45);
  for (let i = 0; i <= nx; i++) jz.push((look() - 0.5) * 0.4, (look() - 0.5) * 0.4);
  const at = (i: number, j: number): Vec3 => {
    let x = -w / 2 + w * i / nx, z = z0 + (z1 - z0) * j / nz;
    // (`ends: false`: a lane's landing meets its flights square, its ends neither ragged nor feathered)
    const ends = o.ends !== false;
    const edge = i === 0 || i === nx || (ends && (j === 0 || j === nz)), near = i === 1 || i === nx - 1 || (ends && (j === 1 || j === nz - 1));
    if (i === 0) x += jx[j * 2]; else if (i === nx) x += jx[j * 2 + 1];
    if (ends && j === 0) z += jz[i * 2]; else if (ends && j === nz) z += jz[i * 2 + 1];
    const lift = edge ? 0.006 : near ? o.lift * 0.6 : o.lift;
    return [x, ground(x, z) + lift, z];
  };
  // the wear: darker down the middle (a path's trodden line) or in the ruts, lighter where it thins at the edges
  const wear = (p: Vec3): Rgb => {
    const across = Math.abs(p[0]);
    let k = 1;
    if (o.ruts !== undefined) { for (const r of [-o.ruts, o.ruts]) k = Math.min(k, 0.8 + 0.2 * Math.min(1, Math.abs(p[0] - r) / 0.35)); }
    else k = 0.86 + 0.14 * Math.min(1, across / Math.max(0.4, w * 0.22));
    const thin = Math.max(0, across - (w / 2 - 0.5)) / 0.5;
    const t = k * (1 + thin * 0.08);
    return [t, t * 0.99, t * 0.97];
  };
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const p00 = at(i, j), p01 = at(i, j + 1), p11 = at(i + 1, j + 1), p10 = at(i + 1, j);
    sink.polygon('plaster3', [p00, p01, p11], { decor: true, tintAt: wear });
    sink.polygon('plaster3', [p00, p11, p10], { decor: true, tintAt: wear });
  }
  // loose stones: bedded in beaten earth along its length, spilt round a gravel bed's edges (fine)
  const n = o.stones === false ? 0 : Math.round((z1 - z0) * w * (o.surface === 'earth' ? 0.35 : 0.12));
  for (let k = 0; k < n; k++) {
    const spill = o.surface === 'gravel';
    const x = spill ? (look() < 0.5 ? -1 : 1) * (w / 2 + (look() - 0.3) * 0.5) : (look() - 0.5) * (w - 0.6), z = z0 + 0.3 + look() * (z1 - z0 - 0.6);
    const s = spill ? 0.05 + look() * 0.06 : 0.08 + look() * 0.14, y = ground(x, z);
    sink.span('stone', x - s, y - 0.05, z - s * 0.8, x + s, y + o.lift + 0.015 + look() * 0.025, z + s * 0.8, { decor: true, fine: true, tint: stoneTone(look, 0.25, 0.2) });
  }
}

// ---------------------------------------------------------------------------------------------------------- paths

/** The tints of a path's surfaces in the plaster3 bucket (the props' gravel convention: parkSquare's paths). */
const PATH_TINT: Readonly<Record<string, Rgb>> = Object.freeze({ gravel: [0.95, 0.86, 0.68], earth: [0.52, 0.42, 0.32] });

/**
 * A path (gauntlet waves 154-158: "no approach path"): a strip draped over the ground from the piece's origin `length`
 * metres along its +z, `width` wide — flagstones or setts in the map's masonry (`surface: 'stone'`), gravel, or beaten
 * earth. Dressing only: a hull drives over it as over the ground.
 * (the map-revival lane, 2026-10-11, Longleaf round 4; wave 376 read the draped earth strip as "a raised slab painted
 * with a high-contrast black-and-tan zebra-noise pattern"): `surface: 'ground'` draws no strip — the track is the
 * terrain's own (the map stamps its worn ground along the line) — and keeps only the piece's ground-cover hole, so no
 * grass stands on it.
 */
export const path: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const L = Math.max(1, Number(ctx.params.length)), w = Math.max(0.6, Number(ctx.params.width)), surface = String(ctx.params.surface);
  if (surface === 'ground') return { parts: sink.finish() };
  const ground = ctx.ground ?? flatGround, look = ctx.variant;
  if (surface === 'stone') {
    // (the looks lane, 2026-10-15; WORKLIST #11 "path setts per kit") a square (both sides over 5 m) kerbed round, a path
    // not; the paving each kit's: a brick kit's court in bays of flat brick framed by bricks on edge (the Jamuna char's
    // temple court), a stone kit's in flags laid in courses (Chouf limestone, the Franconian sandstone)
    const square = w >= 5 && L >= 5;
    if (ctx.brick) brickCourt(sink, ground, -w / 2, w / 2, -L / 2, L / 2, square ? 2.4 : Math.max(0.8, Math.min(w - 0.5, 2.4)), 0.07, look);
    else {
      const k = square ? 0.32 : 0, j = 0.01;
      if (k > 0) kerbRing(sink, 'stone', ground, -w / 2, w / 2, -L / 2, L / 2, k, { top: 0.12, length: [0.7, 1.3] }, look);
      layFlags(sink, 'stone', ground, -w / 2 + k + j, w / 2 - k - j, -L / 2 + k + j, L / 2 - k - j, square
        ? { along: 'x', course: [0.42, 0.62], length: [0.55, 1.0], lift: 0.07 }
        : { along: 'x', course: [0.36, 0.52], length: [0.42, 0.8], lift: 0.05 }, look);
    }
    return { parts: sink.finish(), tints: { stone: [0.98, 0.96, 0.91] } };
  }
  featheredStrip(sink, ground, w, -L / 2, L / 2, { lift: surface === 'earth' ? 0.03 : 0.045, surface: surface === 'earth' ? 'earth' : 'gravel' }, look);
  return { parts: sink.finish(), tints: { plaster3: PATH_TINT[surface] ?? PATH_TINT.gravel } };
};

// ---------------------------------------------------------------------------------------------------------- stairway

/**
 * A stepped lane (the map-revival lane, 2026-10-07, Orchard round 5 — the coordinator's condition for the terraced
 * village: "paths, stairs and a ramped mule track from the cross road up to the church square … ground-material paths
 * with stone steps on the risers", every one "a place a person would walk, with treads, risers and landings"): a lane
 * from the piece's origin `length` m along its +z, `width` wide, read off the ground under its centre and both edges (the
 * highest of the three, so no step is buried by a cross-fall). Its level stretches are landings paved over the ground
 * (flags in the map's masonry, gravel or beaten earth); wherever the ground along it climbs steeper than `steep` (a
 * terrace's riser, a road's cut bank, a graded ramp) a flight is set into the slope: risers near `rise` m, each step's
 * back level with the ground and its nosing one rise over it, its block reaching under the ground, between two low stone
 * kerbs. `steps: 'block'` lays solid stone steps (a village stair); `'cordonata'` a mule stair — a stone curb across the
 * lane at every riser and a tread of the landing's surface behind it, long and low, the way a laden mule climbs. Dressing
 * only: a hull drives over it as over the ground.
 */
export const stairway: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const L = Math.max(2, Number(ctx.params.length)), w = Math.max(0.8, Number(ctx.params.width));
  const rise = Math.min(0.24, Math.max(0.1, Number(ctx.params.rise))), steep = Math.max(0.03, Number(ctx.params.steep));
  const surface = String(ctx.params.surface), cordonata = String(ctx.params.steps) === 'cordonata', kerbs = ctx.params.kerbs !== false;
  const paving: RegionalBucket = surface === 'stone' ? 'stone' : 'plaster3';
  const ground = ctx.ground ?? (() => 0);
  const hw = w / 2, N = Math.max(4, Math.round(L / 0.1)), DZ = L / N;
  const zAt = (i: number): number => -L / 2 + i * DZ;
  const ys: number[] = [];
  for (let i = 0; i <= N; i++) { const z = zAt(i); ys.push(Math.max(ground(-hw, z), ground(0, z), ground(hw, z))); }
  // the flights: the stretches whose grade over a 0.6 m window passes `steep`, joined across gaps under 0.6 m and
  // widened by 0.2 m at either end (a riser's rounded foot and brow)
  const steepAt = (i: number): boolean => {
    const a = Math.max(0, i - 3), b = Math.min(N, i + 3);
    return Math.abs(ys[b] - ys[a]) / ((b - a) * DZ) > steep;
  };
  const flights: Array<{ i0: number; i1: number }> = [];
  for (let i = 0; i <= N; i++) {
    if (!steepAt(i)) continue;
    const last = flights[flights.length - 1];
    if (last && i - last.i1 <= 6) last.i1 = i; else flights.push({ i0: i, i1: i });
  }
  for (const f of flights) { f.i0 = Math.max(0, f.i0 - 2); f.i1 = Math.min(N, f.i1 + 2); }
  // the landings between the flights (and from the lane's ends), paved over the ground
  // (the looks lane, 2026-10-15; WORKLIST #11 r2: "setts and kerbs as units", "feathered path edges") a stone landing
  // laid in flags, each its own; gravel and earth thinning into the ground at the lane's sides; every step and kerb block
  // its own stone and tone
  const lift = surface === 'earth' ? 0.03 : 0.045, look = ctx.variant;
  let from = 0;
  for (const f of [...flights, { i0: N, i1: N }]) {
    const za = zAt(from), zb = zAt(f.i0);
    if (zb - za >= 0.3) {
      if (paving === 'stone') layFlags(sink, 'stone', ground, -hw, hw, za, zb, { along: 'x', course: [0.36, 0.52], length: [0.42, 0.8], lift: 0.05 }, look);
      // (no loose stones on a lane's landings: its steps alone are its stone, as the flights receipt reads them)
      else featheredStrip(sink, ground, w, za, zb, { lift, surface: surface === 'earth' ? 'earth' : 'gravel', ends: false, stones: false }, look);
    }
    from = f.i1;
  }
  const kerbW = 0.22, curbD = 0.26;
  for (const f of flights) {
    const up = ys[f.i1] >= ys[f.i0];
    const foot = up ? f.i0 : f.i1, head = up ? f.i1 : f.i0, dir = up ? 1 : -1;
    const y0 = ys[foot], y1 = ys[head];
    const n = Math.max(1, Math.round((y1 - y0) / rise));
    const r = (y1 - y0) / n;
    if (!(r > 0.05)) continue;
    // each step's front: the first sample from the foot where the ground reaches its base (y0 + k r)
    const fronts: number[] = [foot];
    let i = foot;
    for (let k = 1; k < n; k++) {
      while (i !== head && ys[i] < y0 + k * r) i += dir;
      fronts.push(i);
    }
    fronts.push(head);
    for (let k = 0; k < n; k++) {
      const za = zAt(fronts[k]);
      let zb = zAt(fronts[k + 1]);
      if (Math.abs(zb - za) < 0.12) zb = za + dir * 0.12;
      const lo = Math.min(za, zb), hi = Math.max(za, zb);
      let under = Infinity;
      for (let j = Math.min(fronts[k], fronts[k + 1]); j <= Math.max(fronts[k], fronts[k + 1]); j++) under = Math.min(under, ys[j]);
      const top = y0 + (k + 1) * r, bottom = Math.min(under, top - r) - 0.35;
      if (cordonata && hi - lo > curbD + 0.2) {
        // the curb across the lane at the riser, and the tread behind it in the landing's surface
        const curb0 = dir > 0 ? lo : hi - curbD, curb1 = dir > 0 ? lo + curbD : hi;
        sink.span('stone', -hw, bottom, curb0, hw, top, curb1, { decor: true, tint: stoneTone(look, 0.16, 0.14) });
        sink.span(paving, -hw, bottom, dir > 0 ? curb1 : lo, hw, top - 0.02, dir > 0 ? hi : curb0, { decor: true, tint: [0.92 + look() * 0.12, 0.92, 0.9] });
      } else sink.span('stone', -hw, bottom, lo, hw, top, hi, { decor: true, tint: stoneTone(look, 0.16, 0.14) });
      // the kerbs: a low stone edge either side, its top a hand over the step, each its own block
      if (kerbs) for (const s of [-1, 1]) sink.span('stone', s > 0 ? hw : -hw - kerbW, bottom, lo, s > 0 ? hw + kerbW : -hw, top + 0.16, hi, { decor: true, tint: stoneTone(look, 0.18, 0.2) });
    }
  }
  return { parts: sink.finish(), tints: { plaster3: PATH_TINT[surface] ?? PATH_TINT.gravel } };
};

/**
 * A mill's outfall (Polders round 2, the gauntlet: the mills "need a mound, a yard and a link to the water"): where the
 * drain under a mill's terp comes out, a brick headwall at the top of the bank with the culvert's round mouth in its face,
 * and the runnel below it pitched in stone down the bank to the water, its kerbs a course higher, the wet down its middle.
 * The headwall stands at the piece's -z end, the runnel runs `length` metres along +z. Dressing: no solid.
 */
export const outfall: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const L = Math.max(2, Number(ctx.params.length)), w = Math.max(0.5, Number(ctx.params.width));
  const z0 = -L / 2, z1 = L / 2, ground = (x: number, z: number) => ctx.ground?.(x, z) ?? 0;
  // the headwall: brick across the runnel's head, its coping proud of it, its face (+z) toward the water
  const half = w / 2 + 0.45, g0 = Math.min(ground(-half, z0), ground(half, z0), ground(0, z0)), top = g0 + 0.95;
  const foot = g0 - 0.35, depth = 0.38;
  // #16 r2 (Lane C, 2026-10-14): the culvert is cut through the headwall (its mouth was a dark disc on the face): the
  // wall's body without its face, the face laid round the mouth to its edges, the barrel's brick lining back through
  // the wall, the pipe's dark only at its far end
  sink.box('stone', [0, (foot + top) / 2, z0 - depth / 2], [half, (top - foot) / 2, depth / 2], { decor: true }, undefined, { pz: true });
  sink.span('stone', -half - 0.06, top, z0 - 0.44, half + 0.06, top + 0.1, z0 + 0.06, { decor: true, shade: 0.9 });
  const r = Math.min(0.34, w * 0.42), cy = g0 + 0.12 + r, n = 12, zf = z0 + 0.006;
  const ringAt = (k: number, rr: number, dz: number): Vec3 => [Math.cos(k / n * Math.PI * 2) * rr, cy + Math.sin(k / n * Math.PI * 2) * rr, zf + dz];
  const face = (k: number): Vec3 => {
    const a = k / n * Math.PI * 2, ux = Math.cos(a), uy = Math.sin(a);
    const t = Math.min(Math.abs(ux) > 1e-9 ? half / Math.abs(ux) : Infinity, uy > 1e-9 ? (top - cy) / uy : uy < -1e-9 ? (foot - cy) / uy : Infinity);
    return [ux * t, cy + uy * t, z0];
  };
  const corners: Array<[number, Vec3]> = ([[half, top], [-half, top], [-half, foot], [half, foot]] as const).map(([x, yy]) => {
    const a = Math.atan2(yy - cy, x);
    return [a < 0 ? a + Math.PI * 2 : a, [x, yy, z0] as Vec3];
  });
  for (let k = 0; k < n; k++) {
    const a0 = k / n * Math.PI * 2, a1 = (k + 1) / n * Math.PI * 2;
    const p0: Vec3 = [Math.cos(a0) * r, cy + Math.sin(a0) * r, z0], p1: Vec3 = [Math.cos(a1) * r, cy + Math.sin(a1) * r, z0];
    sink.polygon('stone', [p0, face(k), face(k + 1), p1], { decor: true });
    for (const [ca, corner] of corners) if (ca > a0 && ca < a1) sink.polygon('stone', [face(k), corner, face(k + 1)], { decor: true });
    // the barrel's lining, facing in, back through the wall
    sink.quad('stone', p0, p1, [p1[0], p1[1], z0 - depth], [p0[0], p0[1], z0 - depth], { decor: true, shade: 0.7 });
  }
  const back: Vec3[] = [];
  for (let k = 0; k < n; k++) back.push([Math.cos(k / n * Math.PI * 2) * r, cy + Math.sin(k / n * Math.PI * 2) * r, z0 - depth + 0.01]);
  sink.polygon('dark', back, { decor: true });
  for (let k = 0; k < n; k++) {
    sink.quad('stone', ringAt(k, r, 0.01), ringAt(k, r + 0.14, 0.03), ringAt(k + 1, r + 0.14, 0.03), ringAt(k + 1, r, 0.01), { decor: true, shade: 0.8 });
  }
  // the runnel: pitched stone from the headwall's foot down the bank, its kerbs, and the wet down its middle
  drapedPath(sink, 'stone', ctx.ground, [0, z0 + 0.02], [0, z1], w, { lift: 0.04, emit: { shade: 0.86 } });
  for (const sx of [-1, 1]) drapedPath(sink, 'stone', ctx.ground, [sx * (w / 2 + 0.09), z0], [sx * (w / 2 + 0.09), z1], 0.18, { lift: 0.085 });
  drapedPath(sink, 'structureWood', ctx.ground, [0, z0 + 0.02], [0, z1], Math.max(0.16, w * 0.3), { lift: 0.05, emit: { colour: WET_RUNNEL } });
  return { parts: sink.finish() };
};
const WET_RUNNEL: Rgb = rgb(0x2b3330);
// ---------------------------------------------------------------------------------------------------------- piazza

/**
 * A town's paved square (the landmarks lane, 2026-10-07, Saltwind round 4: the campanile's piazza was "a thin raised
 * sheet… ends in a straight hard edge on bare dirt"; it needs "a kerb, thickness and contact"): the map's masonry
 * paving a step over the ground inside a kerb of dressed blocks round its edge — each block its own length and tone,
 * a hand proud of the paving, its outer face carried down past the ground's lowest point under it, so the square is set
 * into the field rather than laid on it. The frame: `width` across x, `depth` along z, the kerb's outside the outline.
 * (the looks lane, 2026-10-15; WORKLIST #11 r2, "setts and kerbs as units") the paving a Venetian Dalmatian square's
 * (Trogir's, Korčula's): the field divided into panels by liste — bands of pale dressed stone, each stone its own —
 * and each panel laid in courses of limestone slabs, every slab its own unit over the ground, its own tone and heave,
 * the joints showing the bedding. Dressing: a hull drives over it as over the ground.
 */
export const piazza: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const W = Math.max(4, Number(ctx.params.width)), D = Math.max(4, Number(ctx.params.depth)), K = Math.max(0.2, Number(ctx.params.kerb) || 0.38);
  const ground = ctx.ground ?? flatGround, look = ctx.variant;
  // (`lift`, `kerbTop`: the flags' step over the ground and the kerb's top over its highest ground; wave 418a read
  // Delta's temple court at the defaults as "a flat, edgeless pink decal with no kerb, step or thickness")
  const FLAGS = Number(ctx.params.lift) || 0.12, KERB_TOP = Math.max(FLAGS + 0.05, Number(ctx.params.kerbTop) || 0.17), JOINT = 0.012, LISTA = 0.32;
  kerbRing(sink, 'stone', ground, -W / 2, W / 2, -D / 2, D / 2, K, { top: KERB_TOP, length: [0.9, 1.5], joint: JOINT, foot: 0.35 }, look);
  const ix0 = -W / 2 + K + JOINT, ix1 = W / 2 - K - JOINT, iz0 = -D / 2 + K + JOINT, iz1 = D / 2 - K - JOINT;
  const nx = Math.max(1, Math.round((ix1 - ix0) / 4.6)), nz = Math.max(1, Math.round((iz1 - iz0) / 4.6));
  const px = (ix1 - ix0) / nx, pz = (iz1 - iz0) / nz;
  const pale = (): Rgb => { const t = 1.08 + (look() - 0.5) * 0.08; return [t, t * 0.99, t * 0.96]; };
  /** One lista from a to b along `axis` at `at` across it: its stones 0.9 to 1.5 m each. */
  const lista = (axis: 'x' | 'z', at: number, a: number, b: number) => {
    for (let t = a; t < b - 0.05;) {
      const len = 0.9 + look() * 0.6, t1 = b - (t + len) < 0.45 ? b : t + len;
      if (axis === 'x') paveUnit(sink, 'stone', ground, t + 0.006, t1 - 0.006, at - LISTA / 2, at + LISTA / 2, { lift: FLAGS + 0.006, heave: (look() - 0.5) * 0.01, tint: pale(), uv: { x: t, z: at, turn: true } });
      else paveUnit(sink, 'stone', ground, at - LISTA / 2, at + LISTA / 2, t + 0.006, t1 - 0.006, { lift: FLAGS + 0.006, heave: (look() - 0.5) * 0.01, tint: pale(), uv: { x: at, z: t } });
      t = t1;
    }
  };
  // the liste: across the square at each inner line, the long ones running through, the short ones between them
  for (let i = 1; i < nx; i++) lista('z', ix0 + i * px, iz0, iz1);
  for (let j = 1; j < nz; j++) for (let i = 0; i < nx; i++) {
    const xa = ix0 + i * px + (i === 0 ? 0 : LISTA / 2), xb = ix0 + (i + 1) * px - (i === nx - 1 ? 0 : LISTA / 2);
    lista('x', iz0 + j * pz, xa, xb);
  }
  // each panel's slabs in courses
  for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
    const xa = ix0 + i * px + (i === 0 ? 0 : LISTA / 2), xb = ix0 + (i + 1) * px - (i === nx - 1 ? 0 : LISTA / 2);
    const za = iz0 + j * pz + (j === 0 ? 0 : LISTA / 2), zb = iz0 + (j + 1) * pz - (j === nz - 1 ? 0 : LISTA / 2);
    layFlags(sink, 'stone', ground, xa, xb, za, zb, { along: 'x', course: [0.5, 0.75], length: [0.75, 1.3], lift: FLAGS, heave: 0.015, lichen: 0.06 }, look);
  }
  // (the landmarks lane, round 5, wave 389) a square that asks for it furnished
  if (ctx.params.furnish === true) furnishSquare(sink, W, D, FLAGS, ground);
  return { parts: sink.finish(), tints: { stone: [0.98, 0.96, 0.91] } };
};

const IRON_BLACK = rgb(0x26282a), FLAG_RED = rgb(0xc8102e), FLAG_WHITE = rgb(0xeae6dc), FLAG_BLUE = rgb(0x171796), BRONZE = rgb(0x6e5a34), PLANTER_BOX = rgb(0x3f5a32);

/**
 * A Dalmatian square's furniture (the landmarks lane, round 5: wave 389, the campanile "stands on a blank slab with no
 * closed square around it"): the well-head on its stepped platform under its iron arch and pulley at the square's north
 * end, the Venetian flag pedestal (stendardo) with its mast and Croatia's flag at the south end, stone benches before the house
 * fronts, an iron lamp at each quarter, two stone planters of box. All dressing (a hull drives through them as through
 * the square's other dressing); each stands a step over the ground at its own seat.
 */
function furnishSquare(sink: PartSink, W: number, D: number, flags: number, ground: (x: number, z: number) => number): void {
  const at = (x: number, z: number) => ground(x, z) + flags;
  // the well-head: two octagonal steps, the carved drum, the iron arch and its pulley
  { const x = -1, z = D * 0.31, y = at(x, z);
    revolve(sink, 'stone', x, z, [[1.45, y - 0.3], [1.45, y + 0.16], [1.12, y + 0.16], [1.12, y + 0.32], [0.82, y + 0.32], [0.82, y + 1.15], [0.9, y + 1.2], [0.9, y + 1.3], [0.6, y + 1.3], [0.6, y + 1.0]], 8, { decor: true });
    for (const s of [-1, 1]) sink.span('structureMetal', x + s * 0.72 - 0.04, y + 1.25, z - 0.04, x + s * 0.72 + 0.04, y + 2.6, z + 0.04, { colour: IRON_BLACK, decor: true });
    for (let k = 0; k < 6; k++) {
      const a0 = Math.PI * k / 6, a1 = Math.PI * (k + 1) / 6;
      bar(sink, 'structureMetal', [x + Math.cos(a0) * 0.72, y + 2.6 + Math.sin(a0) * 0.42, z], [x + Math.cos(a1) * 0.72, y + 2.6 + Math.sin(a1) * 0.42, z], 0.06, { colour: IRON_BLACK, decor: true });
    }
    revolve(sink, 'structureMetal', x, z, [[0.16, y + 2.7], [0.16, y + 2.78]], 10, { colour: IRON_BLACK, decor: true });
    sink.span('structureMetal', x - 0.02, y + 2.62, z - 0.02, x + 0.02, y + 3.02, z + 0.02, { colour: IRON_BLACK, decor: true });
  }
  // the stendardo: a stepped stone base, the octagonal pedestal with its bronze ring, the mast and the flag
  { const x = -1, z = -D * 0.31, y = at(x, z);
    sink.span('stone', x - 0.75, y - 0.3, z - 0.75, x + 0.75, y + 0.3, z + 0.75, { decor: true });
    revolve(sink, 'stone', x, z, [[0.5, y + 0.3], [0.5, y + 0.45], [0.36, y + 0.55], [0.32, y + 1.9], [0.42, y + 2.0], [0.42, y + 2.12], [0.12, y + 2.12]], 8, { decor: true });
    revolve(sink, 'structureMetal', x, z, [[0.335, y + 1.2], [0.335, y + 1.32]], 8, { colour: BRONZE, decor: true });
    revolve(sink, 'structureWood', x, z, [[0.08, y + 2.1], [0.05, y + 9.5], [0.07, y + 9.6], [0.0, y + 9.75]], 8, { colour: shade(FLAG_WHITE, 0.82), decor: true });
    // (round 6, wave 418a: St Mark's crimson banner "doesn't read as a Croatian flag of 1992") Croatia's flag since
    // December 1990: the red, white and blue tricolour, the chequy shield of thirteen red and twelve white over its
    // middle band, its crown of five small shields above (both faces; the fly drooping 5 cm)
    const L = 1.84, H = 1.1, x0 = 0.06, y0 = 8.25, droop = (fx: number) => 0.05 * (fx - x0) / L;
    const field = (fx0: number, fx1: number, fy0: number, fy1: number, c: Rgb, dz: number) => {
      sink.quad('structureMetal', [x + fx0, y + fy0 - droop(fx0), z + dz], [x + fx1, y + fy0 - droop(fx1), z + dz], [x + fx1, y + fy1 - droop(fx1), z + dz], [x + fx0, y + fy1 - droop(fx0), z + dz], { colour: c, decor: true });
      sink.quad('structureMetal', [x + fx1, y + fy0 - droop(fx1), z - dz], [x + fx0, y + fy0 - droop(fx0), z - dz], [x + fx0, y + fy1 - droop(fx0), z - dz], [x + fx1, y + fy1 - droop(fx1), z - dz], { colour: c, decor: true });
    };
    [FLAG_BLUE, FLAG_WHITE, FLAG_RED].forEach((c, k) => field(x0, x0 + L, y0 + (k * H) / 3, y0 + ((k + 1) * H) / 3, c, 0));
    const sx = x0 + L / 2 - 0.25, sy = y0 + 0.18, cell = 0.1;
    field(sx - 0.02, sx + 0.52, sy - 0.02, sy + 0.52, FLAG_WHITE, 0.004);
    for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) if ((i + j) % 2 === 0) field(sx + i * cell, sx + (i + 1) * cell, sy + (4 - j) * cell, sy + (5 - j) * cell, FLAG_RED, 0.008);
    for (let k = 0; k < 5; k++) field(sx + k * 0.104, sx + k * 0.104 + 0.09, sy + 0.54, sy + 0.66 + (k === 2 ? 0.03 : 0), k % 2 ? FLAG_RED : FLAG_BLUE, 0.006);
  }
  // the benches before the house fronts: a slab on two blocks
  for (const sz of [-1, 1]) for (const x of [-5.2, 4.2]) {
    const z = sz * (D / 2 - 1.1), y = at(x, z);
    for (const dx of [-0.85, 0.85]) sink.span('stone', x + dx - 0.16, y - 0.1, z - 0.18, x + dx + 0.16, y + 0.4, z + 0.18, { decor: true });
    sink.span('stone', x - 1.15, y + 0.4, z - 0.24, x + 1.15, y + 0.52, z + 0.24, { decor: true, shade: 0.95 });
  }
  // an iron lamp at each quarter
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    const x = sx * (W / 2 - 1.4), z = sz * D * 0.22, y = at(x, z);
    sink.span('stone', x - 0.25, y - 0.1, z - 0.25, x + 0.25, y + 0.25, z + 0.25, { decor: true });
    revolve(sink, 'structureMetal', x, z, [[0.09, y + 0.25], [0.06, y + 3.0], [0.1, y + 3.05]], 8, { colour: IRON_BLACK, decor: true });
    sink.span('structureMetal', x - 0.2, y + 3.05, z - 0.2, x + 0.2, y + 3.55, z + 0.2, { colour: rgb(0x3a3c38), decor: true });
    revolve(sink, 'structureMetal', x, z, [[0.3, y + 3.55], [0.05, y + 3.8]], 8, { colour: IRON_BLACK, decor: true });
  }
  // two stone planters of box, either side of the campanile's door axis
  for (const [x, z] of [[-W * 0.3, D * 0.1], [W * 0.3, -D * 0.1]] as const) {
    const y = at(x, z);
    revolve(sink, 'stone', x, z, [[0.8, y - 0.1], [0.8, y + 0.5], [0.7, y + 0.5], [0.7, y + 0.42]], 10, { decor: true });
    revolve(sink, 'structureWood', x, z, [[0.7, y + 0.42], [0.82, y + 0.85], [0.6, y + 1.25], [0.0, y + 1.4]], 9, { colour: PLANTER_BOX, decor: true });
  }
}

// ---------------------------------------------------------------------------------------------------------- churchyard

const GREEN_IRON = rgb(0x4f7d5a);

/**
 * The churchyard (gauntlet waves 154-158: "the church stands straight in the grass … with no churchyard, fence or
 * approach path"): the ground before a church's front (the piece's +z the gate, the church closing its -z side), its
 * fence round the three open sides as the props' destructible modules (a hull breaks them as any fence); in the front
 * fence the holy gate of a Russian church — a whitewashed brick gateway, its arch, a cornice and a small iron roof under
 * a cross — or a plain gate; the flagstone path from the gate to the church door, and on from the gate toward the road
 * (a `path` piece of its own); the graves either side of the path under their crosses.
 * (2026-10-17, the maps lane; the Polders village blind 227's follow-ups, pose 5: "a grey cross stands in the approach
 * path right in front of the church door … the right-hand picket fence runs diagonally and encloses nothing")
 * `doorApron` (m): the ground that deep before the church kept clear of graves beside the path, the door's approach
 * open; `reach` (m): the side fences run on that far past the yard's back, beside a west tower narrower than the yard,
 * to close on the nave's corners.
 */
export const churchyard: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const W = Math.max(8, Number(ctx.params.width)), D = Math.max(6, Number(ctx.params.depth));
  const fence = String(ctx.params.fence || 'fencepicket'), holy = ctx.params.holyGate !== false;
  const pathW = Math.max(0, Number(ctx.params.path) || 0);
  const orthodox = String(ctx.params.tradition || 'orthodox') === 'orthodox';
  const hw = W / 2, hd = D / 2, gateW = 2.2, pier = 0.85;
  const doorApron = Math.max(0, Number(ctx.params.doorApron) || 0), reach = Math.max(0, Number(ctx.params.reach) || 0);
  const destructibles: GroundsDestructible[] = [];
  // the fence: the two sides from the church to the front, the front either side of the gate (the back is the church's);
  // `gate: 'right' | 'left'` hangs a plain gate in that side instead (the front fenced through)
  const side = String(ctx.params.gate ?? 'front');
  fenceRun(destructibles, fence, [hw, -hd - reach], [hw, hd], side === 'right' ? { gateAt: hd + reach, gate: 'gate' } : {});
  fenceRun(destructibles, fence, [-hw, hd], [-hw, -hd - reach], side === 'left' ? { gateAt: hd, gate: 'gate' } : {});
  if (String(ctx.params.back) === 'fence') fenceRun(destructibles, fence, [-hw, -hd], [hw, -hd]);
  if (side === 'right' || side === 'left') fenceRun(destructibles, fence, [hw, hd], [-hw, hd]);
  else if (holy) {
    const gx = gateW / 2 + pier;
    fenceRun(destructibles, fence, [hw, hd], [gx + 0.15, hd]);
    fenceRun(destructibles, fence, [-gx - 0.15, hd], [-hw, hd]);
    // the holy gate: the gateway (its passage along z), the cornice over it, a low gabled iron roof and the cross
    const H = 3.4, t = 0.8;
    sink.placed(0, 0, 0, hd, () => {
      archedSlab(sink, 'plaster', -gx, gx, -0.5 - ctx.groundFall, H, t, [{ u: 0, w: gateW, y0: 0, spring: 2.25, form: 'round' }], { ends: true, top: true });
      moulding(sink, 'plaster', gx * 2, t, H - 0.02, 0.16, 0.12);
      const roof: RoofSpec = { kind: 'gable', pitchDeg: 28, eave: 0.3, verge: 0.3, thickness: 0.08, bucket: 'structureMetal', ridge: null };
      const rg = roofGeometry(t + 0.24, gx * 2 + 0.24, H + 0.14, roof);
      sink.placed(Math.PI / 2, 0, 0, 0, () => emitRoof(sink, rg, roof, GREEN_IRON));
      cross(sink, 'structureMetal', 0, rg.ridgeTopY - 0.04, 0, 1.1, orthodox ? 'orthodox' : 'latin', rgb(0xb8933e));
    });
  } else {
    fenceRun(destructibles, fence, [hw, hd], [-hw, hd], { gateAt: hw, gate: 'gate' });
  }
  // the path from the gate to the church door (the way on to the road is a `path` piece of its own)
  if (pathW > 0) {
    if (side === 'right' || side === 'left') {
      const sx = side === 'right' ? 1 : -1;
      drapedPath(sink, 'stone', ctx.ground, [sx * (hw + 0.4), 0], [0, 0], pathW);
      drapedPath(sink, 'stone', ctx.ground, [0, 0.4], [0, -hd], pathW);
    } else drapedPath(sink, 'stone', ctx.ground, [0, hd + 0.4], [0, -hd], pathW);
  }
  // the graves either side of the path, in rows across the yard, their markers toward the church
  const max = Math.max(0, Math.round(Number(ctx.params.graves) || 0));
  const markers: readonly GraveMarker[] = orthodox ? ['orthodox', 'orthodox', 'orthodox', 'railed'] : ['latin', 'latin', 'stone', 'stone'];
  let placed = 0;
  for (let z = -hd + 3.2; z < hd - 2.4 && placed < max; z += 3.1) {
    for (const side of [-1, 1]) {
      for (let x = pathW / 2 + 1.5; x < hw - 1.0 && placed < max; x += 2.3) {
        if (ctx.variant() < 0.3) continue;
        const jx = (ctx.variant() - 0.5) * 0.5, jz = (ctx.variant() - 0.5) * 0.6, yaw = (ctx.variant() - 0.5) * 0.08;
        const marker = markers[Math.floor(ctx.variant() * markers.length)];
        // (`doorApron`) a grave whose marker would stand in the door's approach is left out, its draws taken
        if (doorApron > 0 && z + jz - 1.25 < -hd + doorApron && x < pathW / 2 + 2.9) continue;
        grave(sink, ctx.ground, side * x + jx, z + jz, yaw, marker);
        placed++;
      }
    }
  }
  return { parts: smoothRender(sink.finish(), LIMEWASH_UV), tints: { plaster: [1, 1, 0.98] }, destructibles };
};

// ---------------------------------------------------------------------------------------------------------- garden

const FOLIAGE: readonly Rgb[] = [rgb(0x2f4a2c), rgb(0x3a5532), rgb(0x2a4230), rgb(0x445c36)];
const BLOOM: readonly Rgb[] = [rgb(0xb8323c), rgb(0xd86a8a), rgb(0xe8e2d8), rgb(0xd88a2c), rgb(0x9a3a6a)];
const SOIL_DARK = rgb(0x3a2e24), BRICK_EDGE = rgb(0x8a4a36), BOX_GREEN = rgb(0x2c4428);

/**
 * A garden (gauntlet wave 157: the bungalow "has no garden, path or sign of age"): an enclosure of the props' fence
 * modules round a lawn (the ground's own), its gate in the front (+z) and its back (-z, toward the house) open unless
 * `back: 'fence'`; the gravel path from the gate to the back; flower borders inside the side and front fences — beds of
 * dug earth edged in brick, the bushes in them in leaf and flower — and two clipped box hedges at the path's mouth.
 * Dressing, but for the fence.
 */
export const garden: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const W = Math.max(6, Number(ctx.params.width)), D = Math.max(5, Number(ctx.params.depth));
  const fence = String(ctx.params.fence || 'fencepicket'), pathW = Math.max(0, Number(ctx.params.path) || 0);
  const destructibles: GroundsDestructible[] = [];
  const hw = W / 2, hd = D / 2;
  if (String(ctx.params.back) === 'fence') enclosure(destructibles, fence, { cx: 0, cz: 0, hw, hd }, { side: '+z', kind: 'gate' });
  else {
    fenceRun(destructibles, fence, [hw, -hd], [hw, hd]);
    fenceRun(destructibles, fence, [-hw, hd], [-hw, -hd]);
    fenceRun(destructibles, fence, [hw, hd], [-hw, hd], { gateAt: hw, gate: 'gate' });
  }
  const look = ctx.variant;
  if (pathW > 0) drapedPath(sink, 'plaster3', ctx.ground, [0, hd + 0.3], [0, -hd - 0.6], pathW, { lift: 0.04 });
  else {
    // (the looks lane, 2026-10-15; WORKLIST #11 r2 "feathered path edges") a working yard's gateway (a mill's, a
    // lookout's compound): no laid path, the ground trodden bare through the gate and a few metres in and out of it, its
    // edges thinning into the grass, a few stones worked up through it
    featheredStrip(sink, ctx.ground ?? flatGround, 3.4, hd - Math.min(3.2, D * 0.3), hd + 1.1, { lift: 0.025, surface: 'earth' }, look);
  }
  // the borders: beds a metre wide inside the fence, their brick edging, the bushes in them
  const bed = (cx: number, cz: number, bw: number, bd: number) => {
    drapedRect(sink, 'structureWood', ctx.ground, { cx, cz, hw: bw / 2, hd: bd / 2 }, { lift: 0.07, cell: 1.5, emit: { colour: SOIL_DARK } });
    for (const [ex, ez, ew, ed] of [[cx, cz - bd / 2, bw / 2 + 0.06, 0.06], [cx, cz + bd / 2, bw / 2 + 0.06, 0.06], [cx - bw / 2, cz, 0.06, bd / 2], [cx + bw / 2, cz, 0.06, bd / 2]] as const) {
      drapedRect(sink, 'structureWood', ctx.ground, { cx: ex, cz: ez, hw: ew, hd: ed }, { lift: 0.13, cell: 2, skirt: 0.2, emit: { colour: BRICK_EDGE } });
    }
    const along = bw > bd, len = Math.max(bw, bd), n = Math.max(1, Math.floor(len / 0.85));
    for (let k = 0; k < n; k++) {
      if (look() < 0.15) continue;
      const t = -len / 2 + len * (k + 0.5) / n + (look() - 0.5) * 0.3, off = (look() - 0.5) * 0.25;
      const x = cx + (along ? t : off), z = cz + (along ? off : t), y = ctx.ground?.(x, z) ?? 0;
      const r = 0.22 + look() * 0.2, h = 0.45 + look() * 0.55;
      const leaf = FOLIAGE[Math.floor(look() * FOLIAGE.length) % FOLIAGE.length];
      sink.span('structureWood', x - r, y + 0.05, z - r, x + r, y + h, z + r, { colour: leaf, decor: true });
      if (look() < 0.7) {
        const bloom = BLOOM[Math.floor(look() * BLOOM.length) % BLOOM.length], br = r * 0.85;
        sink.span('structureWood', x - br, y + h - 0.02, z - br, x + br, y + h + 0.14, z + br, { colour: bloom, decor: true, fine: true });
      }
    }
  };
  // (`beds: false`: a working compound's fence alone — a lookout's, a yard's — no borders and no box)
  if (ctx.params.beds !== false) {
    bed(-hw + 0.75, -0.2, 1.0, D - 2.2);
    bed(hw - 0.75, -0.2, 1.0, D - 2.2);
    const front = (W - pathW) / 2 - 2.0;
    if (front > 1.2) for (const sx of [-1, 1]) bed(sx * (pathW / 2 + 0.9 + front / 2), hd - 0.8, front, 0.9);
    // the clipped box hedges either side of the path inside the gate
    for (const sx of [-1, 1]) {
      const x = sx * (pathW / 2 + 0.55), z = hd - 1.6, y = ctx.ground?.(x, z) ?? 0;
      sink.span('structureWood', x - 0.3, y, z - 0.9, x + 0.3, y + 0.8, z + 0.9, { colour: BOX_GREEN, decor: true });
    }
  }
  return { parts: sink.finish(), tints: { plaster3: pathW > 0 ? PATH_TINT.gravel : PATH_TINT.earth }, destructibles };
};
