// src/world/landmarks/gates.ts — gates and arches (the landmarks lane, 2026-10-05): the kolkhoz entrance arch of the
// 1930s, a walled town's gate tower with its wall stubs (Franconia's Rothenburg and Dinkelsbühl gates), the triumphal
// arch and the torii. A road runs through each: its passage is clear of every ground-contact solid — the piers stand
// on the ground and everything over the passage (the lintel, the arch ring, the tower above it) is a separate solid
// lifted clear of them (kit.ts ARCH_GAP_M), so the movement record leaves the passage open while shells and sight
// still meet the arch.
import { PartSink, facePoint, rgb, shade, type Face, type RegionalBucket, type Vec3 } from '../maps/regional/geometry.ts';
import { emitRoof, roofGeometry, type RoofSpec } from '../maps/regional/house.ts';
import {
  ARCH_GAP_M, archLine, archRise, archSurround, archWindow, archedBody, archedFace, bar, columnProfile, moulding, revolve, smoothRender, star,
  type ArchHole,
} from './kit.ts';
import type { LandmarkBuilder } from './types.ts';

const BANNER_RED = rgb(0xa8261e), STAR_RED = rgb(0xb3221c), WHITE = rgb(0xece8de), TIMBER = rgb(0x6a5440), TIMBER_DARK = rgb(0x4a3b2e);
const VERMILION = rgb(0xc4452c), LACQUER_BLACK = rgb(0x1e1c1b), FRAME_WHITE = rgb(0xe8e4da), GILT = rgb(0xb8933e);

const uvOffset = (rng: () => number): [number, number] => [rng() * 7.31, rng() * 5.17];

/**
 * The vault through a block over a passage: the arch line's soffit run through the block's depth (z from -d/2 to d/2),
 * facing down into the passage.
 */
function vault(sink: PartSink, bucket: RegionalBucket, h: ArchHole, d: number, opts: { shade?: number } = {}): void {
  const line = archLine(h, 10);
  for (let i = 0; i + 1 < line.length; i++) {
    const [ua, ya] = line[i], [ub, yb] = line[i + 1];
    sink.quad(bucket, [ua, ya, d / 2], [ua, ya, -d / 2], [ub, yb, -d / 2], [ub, yb, d / 2], { shade: opts.shade ?? 0.66 });
  }
}

/**
 * A masonry block w × d from y0 to y1 with a passage arched through it along z: front and back faces cut by the arch,
 * the side faces, the top and the vault. The passage's jambs below y0 are the piers' (built separately).
 */
function archedBlock(sink: PartSink, bucket: RegionalBucket, w: number, d: number, y0: number, y1: number, h: ArchHole): void {
  const front: Face = { origin: [0, 0, d / 2], u: [1, 0, 0], out: [0, 0, 1], width: w };
  const back: Face = { origin: [0, 0, -d / 2], u: [-1, 0, 0], out: [0, 0, -1], width: w };
  archedFace(sink, bucket, front, { u0: -w / 2, u1: w / 2, y0, y1 }, [h], 0, {});
  archedFace(sink, bucket, back, { u0: -w / 2, u1: w / 2, y0, y1 }, [{ ...h, u: -h.u }], 0, {});
  sink.quad(bucket, [w / 2, y0, d / 2], [w / 2, y0, -d / 2], [w / 2, y1, -d / 2], [w / 2, y1, d / 2]);
  sink.quad(bucket, [-w / 2, y0, -d / 2], [-w / 2, y0, d / 2], [-w / 2, y1, d / 2], [-w / 2, y1, -d / 2]);
  sink.quad(bucket, [-w / 2, y1, d / 2], [w / 2, y1, d / 2], [w / 2, y1, -d / 2], [-w / 2, y1, -d / 2]);
  // the underside either side of the passage (over the piers) and the vault through it
  for (const [a, b] of [[-w / 2, h.u - h.w / 2], [h.u + h.w / 2, w / 2]] as const) {
    if (b - a > 1e-3) sink.quad(bucket, [a, y0, -d / 2], [b, y0, -d / 2], [b, y0, d / 2], [a, y0, d / 2], { shade: 0.7 });
  }
  vault(sink, bucket, h, d);
}

// ---------------------------------------------------------------------------------------------------------- kolkhoz arch

/**
 * The kolkhoz entrance arch (the collective farms' gates of the 1930s): two whitewashed brick pillars on plinths, a
 * timber beam braced into them carrying the red name banner in its white frame, a crest with the red star over it, a
 * flag on each pillar. The road runs between the pillars.
 */
export const kolkhozArch: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const span = Math.max(6, Number(ctx.params.span)), H = Math.max(5, Number(ctx.params.height));
  const base = -0.6 - ctx.groundFall, p = 0.8, px = span / 2 + p / 2, pillarTop = H - 1.6;
  for (const sx of [-1, 1]) {
    const x = sx * px;
    sink.span('stone', x - p / 2 - 0.12, base, -p / 2 - 0.12, x + p / 2 + 0.12, 0.55, p / 2 + 0.12);
    sink.span('plaster', x - p / 2, 0.55, -p / 2, x + p / 2, pillarTop, p / 2);
    sink.placed(0, x, 0, 0, () => {
      moulding(sink, 'plaster', p, p, pillarTop - 0.02, 0.14, 0.1);
      moulding(sink, 'plaster', p, p, 1.4, 0.1, 0.04);
    });
    revolve(sink, 'plaster', x, 0, [[(p / 2 + 0.06) * Math.SQRT2, pillarTop + 0.12], [0.05, pillarTop + 0.75]], 4, {}, Math.PI / 4);
    // the flag on its pole
    sink.span('structureMetal', x - 0.025, pillarTop + 0.6, -0.025, x + 0.025, pillarTop + 3.0, 0.025, { colour: rgb(0x3a3a38), decor: true });
    const fy = pillarTop + 2.05, fl = 1.15; // both flags stream the same way, with the wind
    sink.quad('structureWood', [x, fy, 0.012], [x + fl * 0.5, fy - 0.06, 0.03], [x + fl * 0.5, fy + 0.84, 0.03], [x, fy + 0.9, 0.012], { colour: BANNER_RED, decor: true });
    sink.quad('structureWood', [x + fl * 0.5, fy - 0.06, 0.03], [x + fl, fy + 0.02, 0.0], [x + fl, fy + 0.86, 0.0], [x + fl * 0.5, fy + 0.84, 0.03], { colour: shade(BANNER_RED, 0.9), decor: true });
    sink.quad('structureWood', [x, fy + 0.9, -0.012], [x + fl * 0.5, fy + 0.84, -0.03], [x + fl * 0.5, fy - 0.06, -0.03], [x, fy, -0.012], { colour: shade(BANNER_RED, 0.8), decor: true });
    sink.quad('structureWood', [x + fl * 0.5, fy + 0.84, -0.03], [x + fl, fy + 0.86, 0.0], [x + fl, fy + 0.02, 0.0], [x + fl * 0.5, fy - 0.06, -0.03], { colour: shade(BANNER_RED, 0.72), decor: true });
  }
  // the beam and the banner over the passage (a solid of their own, clear of the pillars' tops)
  const beamY = pillarTop - 1.35, inner = span / 2;
  sink.span('structureWood', -inner - 0.02, beamY, -0.16, inner + 0.02, beamY + 0.3, 0.16, { colour: TIMBER_DARK });
  const by0 = beamY + 0.3 + ARCH_GAP_M, by1 = by0 + 1.2;
  sink.span('structureWood', -inner + 0.25, by0, -0.07, inner - 0.25, by1, 0.07, { colour: BANNER_RED });
  for (const [x0, x1, y0, y1] of [[-inner + 0.15, inner - 0.15, by0 - 0.06, by0 + 0.08], [-inner + 0.15, inner - 0.15, by1 - 0.08, by1 + 0.06],
    [-inner + 0.15, -inner + 0.3, by0, by1], [inner - 0.3, inner - 0.15, by0, by1]] as const) {
    sink.span('structureWood', x0, y0, -0.1, x1, y1, 0.1, { colour: WHITE, decor: true });
  }
  // the lettering: thin white strokes along the banner on both faces (the farm's name; at range a light line of text)
  const letters = Math.max(6, Math.round(span * 1.1)), lw = (span - 1.6) / letters, ly0 = by0 + 0.36, ly1 = by1 - 0.36;
  for (const zs of [1, -1]) for (let k = 0; k < letters; k++) {
    const x = -inner + 0.8 + lw * (k + 0.5), z0 = zs * 0.07 - 0.006, z1 = zs * 0.07 + 0.006, half = lw * 0.28;
    const form = Math.floor(ctx.variant() * 3);
    const stroke = (a: number, b: number, c: number, d: number) => sink.span('structureWood', a, b, z0, c, d, z1, { colour: WHITE, decor: true, fine: true });
    stroke(x - half, ly0, x - half + 0.06, ly1);
    if (form !== 1) stroke(x + half - 0.06, ly0, x + half, ly1);
    stroke(x - half, form === 2 ? ly0 : ly1 - 0.06, x + half, form === 2 ? ly0 + 0.06 : ly1);
    if (form === 0) stroke(x - half, (ly0 + ly1) / 2 - 0.03, x + half, (ly0 + ly1) / 2 + 0.03);
  }
  // the crest with the star
  const cy = by1 + ARCH_GAP_M, cr = 0.95;
  const crest: Vec3[] = [];
  for (let i = 0; i <= 10; i++) { const a = i / 10 * Math.PI; crest.push([Math.cos(a) * cr, cy + Math.sin(a) * cr, 0]); }
  // (the crest's half disc, counter-clockwise seen from the front, extruded back through the banner's plane)
  sink.prism('structureWood', crest.map((p): Vec3 => [p[0], p[1], 0.06]).reverse(), [0, 0, -1], 0.12, { colour: WHITE });
  star(sink, 'structureMetal', 0, cy + 0.45, 0.09, 0.38, 0.05, { colour: STAR_RED, decor: true });
  star(sink, 'structureMetal', 0, cy + 0.45, -0.09, 0.38, 0.05, { colour: STAR_RED, decor: true }, Math.PI);
  // the braces from the pillars to the beam
  for (const sx of [-1, 1]) {
    bar(sink, 'structureWood', [sx * inner, beamY - 1.2, 0], [sx * (inner - 1.2), beamY, 0], 0.14, { colour: TIMBER_DARK, decor: true });
  }
  return { parts: smoothRender(sink.finish(), 0.3), tints: { plaster: [1, 1, 0.98] } };
};

// ---------------------------------------------------------------------------------------------------------- town gate

/**
 * The town gate (a walled Franconian town's Tor): a square tower over a vaulted passage — the piers with their
 * chamfered plinths, the arched block over the passage, the tower's upper storeys with small windows and a clock, a
 * steep hipped roof with dormers — and a stub of the town wall each side, crenellated, its wall-walk behind.
 */
export const townGate: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const P = Math.max(3.5, Number(ctx.params.passage)), H = Math.max(10, Number(ctx.params.height)), D = Math.max(5, Number(ctx.params.depth));
  const walls = Math.max(0, Number(ctx.params.walls));
  const base = -0.6 - ctx.groundFall, wall: RegionalBucket = 'stone';
  const W = P + 4.6, spring = Math.min(4.6, H * 0.26), passage: ArchHole = { u: 0, w: P, y0: 0, spring, form: 'round' };
  const crown = spring + archRise(passage);
  // the piers either side of the passage
  for (const sx of [-1, 1]) {
    const x0 = sx * P / 2, x1 = sx * W / 2;
    sink.span(wall, Math.min(x0, x1), base, -D / 2, Math.max(x0, x1), spring, D / 2);
    sink.span(wall, Math.min(x0, x1) - (sx > 0 ? 0 : 0.15), base, -D / 2 - 0.15, Math.max(x0, x1) + (sx > 0 ? 0.15 : 0), 0.6, D / 2 + 0.15);
  }
  // the block over the passage, a separate solid
  const blockTop = crown + 1.2;
  sink.placed(0, 0, ARCH_GAP_M, 0, () => archedBlock(sink, wall, W, D, spring, blockTop, passage));
  sink.placed(0, 0, ARCH_GAP_M, 0, () => {
    archSurround(sink, wall, { origin: [0, 0, D / 2], u: [1, 0, 0], out: [0, 0, 1], width: W }, { ...passage, y0: spring }, 0.4, 0.12, { sill: false });
    archSurround(sink, wall, { origin: [0, 0, -D / 2], u: [-1, 0, 0], out: [0, 0, -1], width: W }, { ...passage, y0: spring }, 0.4, 0.12, { sill: false });
  });
  // the upper storeys of the tower
  const top = H - Math.max(4, W * 0.55);
  const win = (u: number, y: number): ArchHole => ({ u, w: 0.85, y0: y, spring: y + 1.1, form: 'segmental', rise: 0.2 });
  const holes = {
    front: [win(-W * 0.22, blockTop + 1.2), win(W * 0.22, blockTop + 1.2), win(0, top - 2.2)],
    back: [win(0, blockTop + 1.2), win(0, top - 2.2)], left: [win(0, blockTop + 2.0)], right: [win(0, blockTop + 2.0)],
  };
  const f = archedBody(sink, wall, 0, 0, W, D, blockTop + ARCH_GAP_M, top, holes, 0.3);
  for (const name of ['front', 'back', 'left', 'right'] as const) {
    for (const h of holes[name]) archWindow(sink, f[name], h, 0.3, FRAME_WHITE, ctx.variant() < 0.2);
  }
  moulding(sink, wall, W, D, blockTop - 0.2, 0.25, 0.1);
  // the clock under the roof on the field side
  const cf = f.front, cy = top - 0.9;
  const disc: Vec3[] = [], ring: Vec3[] = [];
  for (let i = 0; i < 16; i++) {
    const a = i / 16 * Math.PI * 2;
    ring.push(facePoint(cf, Math.cos(a) * 0.75, cy + Math.sin(a) * 0.75, 0.03));
    disc.push(facePoint(cf, Math.cos(a) * 0.64, cy + Math.sin(a) * 0.64, 0.045));
  }
  sink.polygon('structureMetal', ring, { colour: GILT, decor: true });
  sink.polygon('structureMetal', disc, { colour: rgb(0x1f2d4a), decor: true });
  for (const [dx, dy] of [[-0.3, 0.2], [0.42, 0.1]]) sink.member('structureMetal', facePoint(cf, 0, cy, 0.06), facePoint(cf, dx, cy + dy, 0.06), 0.06, 0.02, cf.out, { colour: GILT, decor: true }, 0);
  // the steep hipped roof and two dormers
  const roof: RoofSpec = { kind: 'hip', pitchDeg: 62, eave: 0.45, verge: 0.45, thickness: 0.14, bucket: 'roof', ridge: 'saddle' };
  const rg = roofGeometry(W, D, top, roof);
  emitRoof(sink, rg, roof);
  for (const zs of [1, -1]) {
    const dRoof: RoofSpec = { kind: 'gable', pitchDeg: 50, eave: 0.12, verge: 0.12, thickness: 0.08, bucket: 'roof', ridge: null };
    sink.placed(zs > 0 ? 0 : Math.PI, 0, 0, zs * (D / 2 - 0.9), () => {
      sink.span('stone', -0.55, top + 0.6, -0.4, 0.55, top + 1.6, 0.9);
      sink.quad('glass', [-0.35, top + 0.75, 0.91], [0.35, top + 0.75, 0.91], [0.35, top + 1.45, 0.91], [-0.35, top + 1.45, 0.91], { decor: true });
      emitRoof(sink, roofGeometry(1.1, 1.3, top + 1.6, dRoof), dRoof);
    });
  }
  // a finial on the roof's ridge
  revolve(sink, 'structureMetal', 0, 0, [[0.05, rg.ridgeTopY - 0.1], [0.16, rg.ridgeTopY + 0.3], [0.05, rg.ridgeTopY + 0.5], [0.02, rg.ridgeTopY + 1.3]], 8, { colour: GILT, decor: true });
  // the town wall either side: rubble wall, crenellations, the wall-walk on corbels behind
  if (walls > 0) {
    for (const sx of [-1, 1]) {
      const x0 = sx * W / 2, x1 = sx * (W / 2 + walls), lo = Math.min(x0, x1), hi = Math.max(x0, x1), wh = Math.min(7.5, H * 0.42);
      sink.span(wall, lo, base, -0.6, hi, wh, 0.6);
      for (let x = lo + 0.3; x + 0.9 < hi; x += 1.8) sink.span(wall, x, wh, 0.05, x + 0.9, wh + 0.9, 0.6);
      sink.span('structureWood', lo, wh - 0.9, -1.6, hi, wh - 0.75, -0.6, { colour: TIMBER, decor: true });
      for (let x = lo + 0.6; x < hi; x += 1.5) sink.span('structureWood', x - 0.08, wh - 1.6, -1.5, x + 0.08, wh - 0.9, -1.35, { colour: TIMBER_DARK, decor: true });
    }
  }
  return { parts: sink.finish() };
};

// ---------------------------------------------------------------------------------------------------------- triumphal arch

/**
 * The triumphal arch (a capital's victory gate: Paris's Carrousel, Moscow's and St Petersburg's Narva gates): one great
 * arch (or three) through a rusticated body between piers dressed with paired columns on pedestals, the entablature
 * running round, the attic over it with its inscription panel.
 */
export const triumphalArch: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const P = Math.max(4, Number(ctx.params.passage)), H = Math.max(9, Number(ctx.params.height)), three = Number(ctx.params.arches) >= 3;
  const base = -0.6 - ctx.groundFall, wall: RegionalBucket = 'stone', D = Math.max(5, P * 0.75);
  const side = P * 0.42, pier = Math.max(2.6, P * 0.48);
  const W = three ? P + 2 * side + 4 * pier * 0.8 : P + 2 * pier;
  const spring = H * 0.42, main: ArchHole = { u: 0, w: P, y0: 0, spring, form: 'round' };
  const holes: ArchHole[] = [main];
  if (three) for (const sx of [-1, 1]) holes.push({ u: sx * (P / 2 + pier * 0.8 + side / 2), w: side, y0: 0, spring: spring * 0.62, form: 'round' });
  const entab = spring + P / 2 + 1.4, atticTop = H;
  // the piers between the openings, footed on a plinth
  const edges = [-W / 2, ...holes.flatMap((h) => [h.u - h.w / 2, h.u + h.w / 2]).sort((a, b) => a - b), W / 2];
  for (let i = 0; i + 1 < edges.length; i += 2) {
    const [a, b] = [edges[i], edges[i + 1]];
    const lowest = Math.min(...holes.filter((h) => Math.abs(h.u - h.w / 2 - b) < 1e-6 || Math.abs(h.u + h.w / 2 - a) < 1e-6).map((h) => h.spring));
    sink.span(wall, a, base, -D / 2, b, lowest, D / 2);
  }
  // the body over the openings (one solid, lifted clear of the piers), the vaults through it
  sink.placed(0, 0, ARCH_GAP_M, 0, () => {
    const front: Face = { origin: [0, 0, D / 2], u: [1, 0, 0], out: [0, 0, 1], width: W };
    const back: Face = { origin: [0, 0, -D / 2], u: [-1, 0, 0], out: [0, 0, -1], width: W };
    const minSpring = Math.min(...holes.map((h) => h.spring));
    archedFace(sink, wall, front, { u0: -W / 2, u1: W / 2, y0: minSpring, y1: entab }, holes.map((h) => ({ ...h, y0: minSpring })), 0);
    archedFace(sink, wall, back, { u0: -W / 2, u1: W / 2, y0: minSpring, y1: entab }, holes.map((h) => ({ ...h, u: -h.u, y0: minSpring })), 0);
    sink.quad(wall, [W / 2, minSpring, D / 2], [W / 2, minSpring, -D / 2], [W / 2, entab, -D / 2], [W / 2, entab, D / 2]);
    sink.quad(wall, [-W / 2, minSpring, -D / 2], [-W / 2, minSpring, D / 2], [-W / 2, entab, D / 2], [-W / 2, entab, -D / 2]);
    for (const h of holes) {
      // the jambs from the lowest spring to this opening's own spring, then its vault
      if (h.spring > minSpring + 1e-3) for (const sx of [-1, 1]) {
        const x = h.u + sx * h.w / 2;
        sink.quad(wall, sx < 0 ? [x, minSpring, D / 2] : [x, minSpring, -D / 2], sx < 0 ? [x, minSpring, -D / 2] : [x, minSpring, D / 2],
          sx < 0 ? [x, h.spring, -D / 2] : [x, h.spring, D / 2], sx < 0 ? [x, h.spring, D / 2] : [x, h.spring, -D / 2], { shade: 0.74 });
      }
      vault(sink, wall, h, D);
      archSurround(sink, wall, front, { ...h, y0: h.spring }, 0.45, 0.12, { sill: false });
      archSurround(sink, wall, back, { ...h, u: -h.u, y0: h.spring }, 0.45, 0.12, { sill: false });
    }
    // the soffits over the piers at the lowest spring
    for (let i = 0; i + 1 < edges.length; i += 2) {
      const [a, b] = [edges[i], edges[i + 1]];
      sink.quad(wall, [a, minSpring, -D / 2], [b, minSpring, -D / 2], [b, minSpring, D / 2], [a, minSpring, D / 2], { shade: 0.7 });
    }
    // the entablature, the attic and its inscription panel
    moulding(sink, wall, W, D, entab - 0.9, 0.5, 0.08);
    sink.band(wall, -W / 2 - 0.35, entab - 0.4, -D / 2 - 0.35, W / 2 + 0.35, entab, D / 2 + 0.35);
    sink.span(wall, -W / 2 + 0.3, entab, -D / 2 + 0.3, W / 2 - 0.3, atticTop - 0.3, D / 2 - 0.3);
    sink.band(wall, -W / 2 + 0.1, atticTop - 0.3, -D / 2 + 0.1, W / 2 - 0.1, atticTop, D / 2 + -0.1);
    for (const zs of [1, -1]) {
      const pz = zs * (D / 2 - 0.3 + 0.02);
      sink.quad('structureMetal', [-P * 0.55 * zs, entab + 0.5, pz], [P * 0.55 * zs, entab + 0.5, pz], [P * 0.55 * zs, atticTop - 0.8, pz], [-P * 0.55 * zs, atticTop - 0.8, pz],
        { colour: rgb(0x2e3a35), decor: true });
    }
  });
  // paired columns on pedestals before the piers, both faces
  const colH = entab - 0.9 - 2.0, r = Math.min(0.45, pier * 0.13);
  for (const zs of [1, -1]) for (let i = 0; i + 1 < edges.length; i += 2) {
    const mid = (edges[i] + edges[i + 1]) / 2, half = (edges[i + 1] - edges[i]) / 2;
    for (const dx of [-half * 0.5, half * 0.5]) {
      const z = zs * (D / 2 + r * 1.6);
      sink.span(wall, mid + dx - r * 1.5, 0, z - r * 1.5, mid + dx + r * 1.5, 2.0, z + r * 1.5, { decor: true });
      revolve(sink, wall, mid + dx, z, columnProfile(r, colH, 2.0), 12, { decor: true });
    }
  }
  return { parts: sink.finish() };
};

// ---------------------------------------------------------------------------------------------------------- torii

/**
 * The torii (a Shinto shrine's gate, myōjin form): two vermilion pillars leaning in, the tie beam (nuki) through them,
 * the black-lacquered top lintel (kasagi) with its upswept ends over the shimaki, the central strut with its plaque.
 */
export const torii: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const span = Math.max(3, Number(ctx.params.span)), H = Math.max(4, Number(ctx.params.height));
  const base = -0.6 - ctx.groundFall, r = Math.max(0.22, span * 0.05), lean = 0.04;
  for (const sx of [-1, 1]) {
    const x = sx * span / 2;
    sink.span('stone', x - r * 1.5, base, -r * 1.5, x + r * 1.5, 0.35, r * 1.5);
    revolve(sink, 'structureMetal', x, 0, [[r * 1.25, 0.35], [r * 1.25, 0.8], [r, 0.8]], 12, { colour: LACQUER_BLACK });
    // the pillar leaning in toward the centre
    sink.member('structureMetal', [x, 0.8, 0], [x - sx * lean * H, H - 1.3, 0], r * 2, r * 2, [0, 0, 1], { colour: VERMILION, exposed: true }, r);
  }
  // the nuki tie beam, the shimaki and kasagi (its ends sweeping up), the central strut and plaque
  const nukiY = H * 0.7, topY = H - 0.95;
  sink.placed(0, 0, ARCH_GAP_M, 0, () => {
    sink.span('structureMetal', -span / 2 - 0.9, nukiY, -r * 0.6, span / 2 + 0.9, nukiY + 0.42, r * 0.6, { colour: VERMILION });
    sink.span('structureMetal', -span / 2 - 1.2, topY, -r * 0.9, span / 2 + 1.2, topY + 0.35, r * 0.9, { colour: VERMILION });
    const kas: Vec3[] = [];
    const L = span / 2 + 1.7;
    for (let i = 0; i <= 12; i++) { const t = -1 + 2 * i / 12; kas.push([t * L, topY + 0.35 + 0.28 * t * t * t * t, 0]); }
    for (let i = 0; i + 1 < kas.length; i++) {
      const [a, b] = [kas[i], kas[i + 1]];
      sink.span('structureMetal', Math.min(a[0], b[0]), Math.min(a[1], b[1]), -r * 1.15, Math.max(a[0], b[0]), Math.max(a[1], b[1]) + 0.45, r * 1.15, { colour: LACQUER_BLACK });
    }
    sink.span('structureMetal', -0.2, nukiY + 0.42, -r * 0.5, 0.2, topY, r * 0.5, { colour: VERMILION });
    sink.span('structureMetal', -0.45, nukiY + 0.7, -r * 0.62, 0.45, topY - 0.15, r * 0.62, { colour: LACQUER_BLACK, decor: true });
    sink.span('structureMetal', -0.35, nukiY + 0.8, -r * 0.64, 0.35, topY - 0.25, r * 0.64, { colour: GILT, decor: true });
  });
  return { parts: sink.finish() };
};
