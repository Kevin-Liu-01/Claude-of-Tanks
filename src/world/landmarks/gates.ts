// src/world/landmarks/gates.ts — gates and arches (the landmarks lane, 2026-10-05): the kolkhoz entrance arch of the
// 1930s, a walled town's gate tower with its wall stubs (Franconia's Rothenburg and Dinkelsbühl gates), the triumphal
// arch and the torii. A road runs through each: its passage is clear of every ground-contact solid — the piers stand
// on the ground and everything over the passage (the lintel, the arch ring, the tower above it) is a separate solid
// lifted clear of them (kit.ts ARCH_GAP_M), so the movement record leaves the passage open while shells and sight
// still meet the arch.
import { PartSink, facePoint, rgb, shade, type Face, type RegionalBucket, type Rgb, type Vec3 } from '../maps/regional/geometry.ts';
import { emitRoof, roofGeometry, type RoofSpec } from '../maps/regional/house.ts';
import { dressedQuoin } from '../maps/regional/facade.ts';
import {
  ARCH_GAP_M, archLine, archRise, archSurround, archWindow, archedBody, archedFace, bar, columnProfile, cornerPilasters, moulding, revolve, smoothRender, star,
  type ArchHole, LIMEWASH_UV } from './kit.ts';
import { fenceRun } from './grounds.ts';
import { letterText, measureText } from './lettering.ts';
import { gateStubs } from './plan.ts';
import type { LandmarkBuilder } from './types.ts';
import { finishLandmark, piece } from './pieces.ts';
import { chamferedBox } from './monuments.ts';

// (the maps lane, 2026-10-15; the blind critics on Verdant v2: the gate's sign blew out under High bloom) the banner's
// frame, its lettering and the crest in a painted white, not a lamp's
const BANNER_RED = rgb(0xa8261e), STAR_RED = rgb(0xb3221c), WHITE = rgb(0xc9c5bb), TIMBER = rgb(0x6a5440), TIMBER_DARK = rgb(0x4a3b2e);
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
    // (the looks lane, 2026-10-15; WORKLIST #11 r2: plinths stepped, panels sunk) the pillar's plinth in two courses,
    // the lower proud of the upper; the shaft's front and back each a panel sunk 4 cm in its frame of stiles and rails,
    // the red star in relief in the field
    sink.span('stone', x - p / 2 - 0.16, base, -p / 2 - 0.16, x + p / 2 + 0.16, 0.3, p / 2 + 0.16);
    sink.span('stone', x - p / 2 - 0.08, 0.3, -p / 2 - 0.08, x + p / 2 + 0.08, 0.55, p / 2 + 0.08, { shade: 0.95 });
    const sunk = 0.04, st = 0.15, py0 = 1.62, py1 = pillarTop - 0.5;
    sink.span('plaster', x - p / 2, 0.55, -p / 2 + sunk, x + p / 2, pillarTop, p / 2 - sunk);
    for (const zs of [-1, 1]) {
      const z0 = zs > 0 ? p / 2 - sunk : -p / 2, z1 = zs > 0 ? p / 2 : -p / 2 + sunk;
      sink.span('plaster', x - p / 2, 0.55, z0, x - p / 2 + st, pillarTop, z1);
      sink.span('plaster', x + p / 2 - st, 0.55, z0, x + p / 2, pillarTop, z1);
      sink.span('plaster', x - p / 2 + st, 0.55, z0, x + p / 2 - st, py0, z1);
      sink.span('plaster', x - p / 2 + st, py1, z0, x + p / 2 - st, pillarTop, z1);
      if (py1 - py0 > 0.9) star(sink, 'structureMetal', x, py1 - 0.42, zs * (p / 2 - sunk + 0.016), 0.2, 0.03, { colour: STAR_RED, decor: true }, zs > 0 ? 0 : Math.PI);
    }
    sink.placed(0, x, 0, 0, () => {
      moulding(sink, 'plaster', p, p, pillarTop - 0.02, 0.14, 0.1);
      moulding(sink, 'plaster', p, p, 1.4, 0.1, 0.04);
    });
    revolve(sink, 'plaster', x, 0, [[(p / 2 + 0.06) * Math.SQRT2, pillarTop + 0.12], [0.05, pillarTop + 0.75]], 4, {}, Math.PI / 4);
    // the flag on its pole (it topples when the arch is breached: props lane A, E12, landmarks/pieces.ts)
    piece(sink, { name: `flag-${sx < 0 ? 'l' : 'r'}`, kind: 'detach', at: 'breached', fall: 'topple' }, (s) => {
      s.span('structureMetal', x - 0.025, pillarTop + 0.6, -0.025, x + 0.025, pillarTop + 3.0, 0.025, { colour: rgb(0x3a3a38), decor: true });
      const fy = pillarTop + 2.05, fl = 1.15; // both flags stream the same way, with the wind
      s.quad('structureWood', [x, fy, 0.012], [x + fl * 0.5, fy - 0.06, 0.03], [x + fl * 0.5, fy + 0.84, 0.03], [x, fy + 0.9, 0.012], { colour: BANNER_RED, decor: true });
      s.quad('structureWood', [x + fl * 0.5, fy - 0.06, 0.03], [x + fl, fy + 0.02, 0.0], [x + fl, fy + 0.86, 0.0], [x + fl * 0.5, fy + 0.84, 0.03], { colour: shade(BANNER_RED, 0.9), decor: true });
      s.quad('structureWood', [x, fy + 0.9, -0.012], [x + fl * 0.5, fy + 0.84, -0.03], [x + fl * 0.5, fy - 0.06, -0.03], [x, fy, -0.012], { colour: shade(BANNER_RED, 0.8), decor: true });
      s.quad('structureWood', [x + fl * 0.5, fy + 0.84, -0.03], [x + fl, fy + 0.86, 0.0], [x + fl, fy + 0.02, 0.0], [x + fl * 0.5, fy - 0.06, -0.03], { colour: shade(BANNER_RED, 0.72), decor: true });
    });
  }
  // the beam and the banner over the passage (a solid of their own, clear of the pillars' tops)
  const beamY = pillarTop - 1.35, inner = span / 2;
  // (the looks lane, 2026-10-16, the r2 sweep: the beam and the banner were plain boxes, most of the arch's surface)
  chamferedBox(sink, 'structureWood', [-inner - 0.02, beamY, -0.16], [inner + 0.02, beamY + 0.3, 0.16], 0, 0.04, { colour: TIMBER_DARK });
  const by0 = beamY + 0.3 + ARCH_GAP_M, by1 = by0 + 1.2;
  // the banner, its frame and its lettering (laid flat when the arch is breached: props lane A, E12)
  piece(sink, { name: 'banner', kind: 'detach', at: 'breached', fall: 'flat' }, (s) => {
    chamferedBox(s, 'structureWood', [-inner + 0.25, by0, -0.07], [inner - 0.25, by1, 0.07], 0, 0.03, { colour: BANNER_RED });
    for (const [x0, x1, y0, y1] of [[-inner + 0.15, inner - 0.15, by0 - 0.06, by0 + 0.08], [-inner + 0.15, inner - 0.15, by1 - 0.08, by1 + 0.06],
      [-inner + 0.15, -inner + 0.3, by0, by1], [inner - 0.3, inner - 0.15, by0, by1]] as const) {
      s.span('structureWood', x0, y0, -0.1, x1, y1, 0.1, { colour: WHITE, decor: true });
    }
    // the lettering: the farm's name in white sign-writer's capitals on both faces, each reading left to right from its
    // own side (gauntlet wave 154: pseudo-glyph strokes at the same x on both faces read "garbled, mirror-reversed" from
    // behind)
    const sign = String(ctx.params.sign ?? '').trim();
    if (sign) {
      const style = { capHeight: 0.46, maxWidth: span - 1.3, colour: WHITE };
      const { unit } = measureText(sign, style);
      const baseline = (by0 + by1) / 2 - 3 * unit;
      for (const face of [
        { origin: [0, 0, 0.07], u: [1, 0, 0], out: [0, 0, 1], width: span },
        { origin: [0, 0, -0.07], u: [-1, 0, 0], out: [0, 0, -1], width: span },
      ] satisfies Face[]) letterText(s, 'structureWood', face, sign, 0, baseline, style);
    }
  });
  // the crest with the star (it topples at the first damage: props lane A, E12)
  piece(sink, { name: 'crest', kind: 'detach', at: 'damaged', fall: 'topple' }, (s) => {
    const cy = by1 + ARCH_GAP_M, cr = 0.95;
    const crest: Vec3[] = [];
    for (let i = 0; i <= 10; i++) { const a = i / 10 * Math.PI; crest.push([Math.cos(a) * cr, cy + Math.sin(a) * cr, 0]); }
    // (the crest's half disc, counter-clockwise seen from the front, extruded back through the banner's plane)
    s.prism('structureWood', crest.map((p): Vec3 => [p[0], p[1], 0.06]).reverse(), [0, 0, -1], 0.12, { colour: WHITE });
    star(s, 'structureMetal', 0, cy + 0.45, 0.09, 0.38, 0.05, { colour: STAR_RED, decor: true });
    star(s, 'structureMetal', 0, cy + 0.45, -0.09, 0.38, 0.05, { colour: STAR_RED, decor: true }, Math.PI);
  });
  // the braces from the pillars to the beam
  for (const sx of [-1, 1]) {
    bar(sink, 'structureWood', [sx * inner, beamY - 1.2, 0], [sx * (inner - 1.2), beamY, 0], 0.14, { colour: TIMBER_DARK, decor: true });
  }
  // the wings (gauntlet wave 154's settings round: a gate needs a boundary): a fence run off each pillar along the
  // arch's line, the props' own destructible modules (a hull breaks them as any fence), `wings` metres each side
  const wings = Math.max(0, Number(ctx.params.wings) || 0);
  const destructibles: Array<{ kind: string; x: number; z: number; yawDeg: number }> = [];
  if (wings > 0) {
    const kind = String(ctx.params.wingFence || 'fencepicket'), x0 = px + p / 2 + 0.25;
    for (const sx of [-1, 1]) fenceRun(destructibles, kind, [sx * x0, 0], [sx * (x0 + wings), 0]);
  }
  // (2026-10-15: the pillars' lime-wash at about two thirds, as the church's, under High bloom)
  return { parts: smoothRender(finishLandmark(sink), LIMEWASH_UV), tints: { plaster: [0.8, 0.8, 0.78] }, destructibles };
};

// ---------------------------------------------------------------------------------------------------------- town gate

/** The dressings' bucket: the voussoirs, quoins, string courses, coping, merlon caps and the oriel in a smooth dressed
 * sandstone (the render surface retinted, townGate's tints) over the walls' rough ashlar, so they read from the street. */
const DRESS_BUCKET: RegionalBucket = 'plaster3';
/**
 * The dressed sandstone's tint over the kit's render: Steinburg's plaster3 is a weathered grey-green distemper, lifted to
 * a pale warm grey-cream (the coordinator, 2026-10-14: the first tint read olive on the arch ring).
 */
const DRESS_TINT: [number, number, number] = [1.34, 1.24, 1.16];

/**
 * (the looks lane, 2026-10-13; LOOKS-BRIEF item 3: the gate's "one flat, uniform sandstone tint with no coursing, quoins
 * or string courses") the passage arch's voussoirs: wedge stones round the arch line on a face, long and short by turns,
 * each a stone of its own standing a little proud with a joint round it, the keystone larger. Dressing (the arch block
 * is the solid).
 */
function voussoirs(sink: PartSink, bucket: RegionalBucket, face: Face, h: ArchHole, depth: number): void {
  const line = archLine(h, 24);
  const n = line.length - 1, joint = 0.025;
  for (let i = 0; i < n; i += 2) {
    const j = Math.min(n, i + 2), mid = (i + j) / 2;
    const key = Math.abs(mid - n / 2) < 1.01;
    const width = key ? 0.95 : (i / 2) % 2 ? 0.62 : 0.82, out = key ? depth + 0.06 : depth + ((i / 2) % 2 ? 0 : 0.03);
    const pts = [line[i], line[j]].map(([u, y], k) => {
      const ii = k === 0 ? i : j;
      const [pu, py] = line[Math.max(0, ii - 1)], [nu, ny] = line[Math.min(n, ii + 1)];
      const tu = nu - pu, ty = ny - py, l = Math.hypot(tu, ty) || 1;
      const ou = ii === 0 ? -1 : ii === n ? 1 : -ty / l, oy = ii === 0 || ii === n ? 0 : tu / l;
      // the joint: each stone a little shorter than its share of the arch
      const su = (k === 0 ? 1 : -1) * joint * tu / l, sy = (k === 0 ? 1 : -1) * joint * ty / l;
      return { a: [u + su, y + sy] as [number, number], b: [u + su + ou * width, y + sy + oy * width] as [number, number] };
    });
    const [p, q] = pts;
    const dec = { decor: true } as const;
    sink.quad(bucket, facePoint(face, p.a[0], p.a[1], out), facePoint(face, q.a[0], q.a[1], out), facePoint(face, q.b[0], q.b[1], out), facePoint(face, p.b[0], p.b[1], out), dec);
    // its outer edge and its two joints back to the wall
    sink.quad(bucket, facePoint(face, q.b[0], q.b[1], 0), facePoint(face, p.b[0], p.b[1], 0), facePoint(face, p.b[0], p.b[1], out), facePoint(face, q.b[0], q.b[1], out), dec);
    sink.quad(bucket, facePoint(face, p.a[0], p.a[1], 0), facePoint(face, p.b[0], p.b[1], 0), facePoint(face, p.b[0], p.b[1], out), facePoint(face, p.a[0], p.a[1], out), dec);
    sink.quad(bucket, facePoint(face, q.b[0], q.b[1], 0), facePoint(face, q.a[0], q.a[1], 0), facePoint(face, q.a[0], q.a[1], out), facePoint(face, q.b[0], q.b[1], out), dec);
  }
}

/** Rusticated quoins up a block's four corners from y0 to y1 (dressed stones long and short by turns, 45 cm courses). */
function towerQuoins(sink: PartSink, bucket: RegionalBucket, w: number, d: number, y0: number, y1: number): void {
  for (const [sx, sz] of [[-1, 1], [1, 1], [-1, -1], [1, -1]] as const) {
    const x = sx * w / 2, z = sz * d / 2;
    for (let y = y0, k = 0; y + 0.42 <= y1 + 0.01; y += 0.45, k++) {
      const lx = k % 2 ? 0.45 : 0.78, lz = k % 2 ? 0.78 : 0.45;
      dressedQuoin(sink, bucket, sx > 0 ? x - lx : x - 0.05, y, sz > 0 ? z - lz : z - 0.05, sx > 0 ? x + 0.05 : x + lx, y + 0.42,
        sz > 0 ? z + 0.05 : z + lz, sx, sz, { decor: true });
    }
  }
}

/**
 * The gatekeeper's oriel on the town side: a three-sided bay of dressed stone on stepped corbels, its windows, a little
 * hipped roof of the tower's tiles. In the tower's frame (+z the field face): `z` its wall plane, facing -z.
 */
function oriel(sink: PartSink, bucket: RegionalBucket, z: number, y0: number, frame: Rgb): void {
  const w = 2.0, dep = 0.75, h = 2.3;
  for (let k = 0; k < 3; k++) {
    const t = 0.32 - k * 0.1;
    sink.span(bucket, -w / 2 + k * 0.22, y0 - 0.3 * (k + 1), z - dep + k * 0.22 - t, w / 2 - k * 0.22, y0 - 0.3 * k, z, { decor: true });
  }
  // (the looks lane, 2026-10-16, the r2 sweep: the lights were glass plates on the bay's face) the bay's front cut by its
  // two lights, each a reveal 14 cm deep with the glazing at its back and the casement's mullion in it
  const R = 0.14;
  sink.box(bucket, [0, y0 + h / 2, z - dep / 2], [w / 2, h / 2, dep / 2], { decor: true }, undefined, { nz: true });
  const face: Face = { origin: [0, 0, z - dep], u: [-1, 0, 0], out: [0, 0, -1], width: w };
  const lights: ArchHole[] = [-0.5, 0.5].map((u) => ({ u, w: 0.6, y0: y0 + 0.75, spring: y0 + 1.85, form: 'flat' as const }));
  archedFace(sink, bucket, face, { u0: -w / 2, u1: w / 2, y0, y1: y0 + h }, lights, R, { decor: true });
  for (const u of [-0.5, 0.5]) {
    // (the looks lane, 2026-10-15; WORKLIST #11 r2 "openings with depth") each light in a stone frame proud of the bay
    // (its sill, jambs and head), the glazing set back in its reveal, the casement's mullion in it
    sink.quad('glass', facePoint(face, u - 0.3, y0 + 0.75, -R + 0.012), facePoint(face, u + 0.3, y0 + 0.75, -R + 0.012), facePoint(face, u + 0.3, y0 + 1.85, -R + 0.012),
      facePoint(face, u - 0.3, y0 + 1.85, -R + 0.012), { decor: true });
    sink.member('structureMetal', facePoint(face, u, y0 + 0.75, -R + 0.03), facePoint(face, u, y0 + 1.85, -R + 0.03), 0.05, 0.03, face.out, { colour: frame, decor: true }, 0);
    for (const [a, b, w] of [[[u - 0.38, y0 + 0.71], [u + 0.38, y0 + 0.71], 0.09], [[u - 0.38, y0 + 1.9], [u + 0.38, y0 + 1.9], 0.1],
      [[u - 0.34, y0 + 0.75], [u - 0.34, y0 + 1.85], 0.08], [[u + 0.34, y0 + 0.75], [u + 0.34, y0 + 1.85], 0.08]] as const) {
      sink.member(bucket, facePoint(face, a[0], a[1], 0.04), facePoint(face, b[0], b[1], 0.04), w, 0.08, face.out, { decor: true, exposed: true }, 0.04);
    }
  }
  sink.span(bucket, -w / 2 - 0.08, y0 + h, z - dep - 0.08, w / 2 + 0.08, y0 + h + 0.14, z, { decor: true });
  const cap: RoofSpec = { kind: 'shed', pitchDeg: 38, eave: 0.12, verge: 0.1, thickness: 0.07, bucket: 'roof', decor: true };
  sink.placed(Math.PI, 0, 0, z - dep / 2, () => emitRoof(sink, roofGeometry(w + 0.1, dep + 0.05, y0 + h + 0.14, cap), cap));
}

/**
 * The town gate (a walled Franconian town's Tor): a square tower over a vaulted passage — the piers with their
 * chamfered plinths, the arched block over the passage, the tower's upper storeys with small windows and a clock, a
 * steep hipped roof with dormers — and a stub of the town wall each side, crenellated, its wall-walk behind.
 */
export const townGate: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const P = Math.max(3.5, Number(ctx.params.passage)), H = Math.max(10, Number(ctx.params.height)), D = Math.max(5, Number(ctx.params.depth));
  const [wallsLeft, wallsRight] = gateStubs(ctx.params);
  const base = -0.6 - ctx.groundFall, wall: RegionalBucket = 'stone';
  // (wave 389, round 2: "a single uniformly brick-skinned gate ... north and south are the same tower model") the
  // dressings in the town's sandstone over the wall's stone — the arch rings, the quoins, the string course and the
  // cornice — and a second form: `style: 'framed'`, the top storey timber framed and jettied on its corbels under a
  // steeper roof with a lantern, the town's arms over the passage instead of the clock
  const framed = String(ctx.params.style) === 'framed', DRESS: Rgb = [1.32, 1.24, 1.08];
  const W = P + 4.6, spring = Math.min(4.6, H * 0.26), passage: ArchHole = { u: 0, w: P, y0: 0, spring, form: 'round' };
  const crown = spring + archRise(passage);
  // the piers either side of the passage
  for (const sx of [-1, 1]) {
    const x0 = sx * P / 2, x1 = sx * W / 2;
    sink.span(wall, Math.min(x0, x1), base, -D / 2, Math.max(x0, x1), spring, D / 2);
    sink.span(wall, Math.min(x0, x1) - (sx > 0 ? 0 : 0.15), base, -D / 2 - 0.15, Math.max(x0, x1) + (sx > 0 ? 0.15 : 0), 0.6, D / 2 + 0.15, { tint: DRESS });
  }
  // the block over the passage, a separate solid
  const blockTop = crown + 1.2;
  sink.placed(0, 0, ARCH_GAP_M, 0, () => archedBlock(sink, wall, W, D, spring, blockTop, passage));
  sink.placed(0, 0, ARCH_GAP_M, 0, () => {
    archSurround(sink, wall, { origin: [0, 0, D / 2], u: [1, 0, 0], out: [0, 0, 1], width: W }, { ...passage, y0: spring }, 0.4, 0.12, { sill: false });
    archSurround(sink, wall, { origin: [0, 0, -D / 2], u: [-1, 0, 0], out: [0, 0, -1], width: W }, { ...passage, y0: spring }, 0.4, 0.12, { sill: false });
    // (the looks lane) the voussoirs over the surround, each its own stone, the keystone proud
    voussoirs(sink, DRESS_BUCKET, { origin: [0, 0, D / 2], u: [1, 0, 0], out: [0, 0, 1], width: W }, { ...passage, y0: spring }, 0.2);
    voussoirs(sink, DRESS_BUCKET, { origin: [0, 0, -D / 2], u: [-1, 0, 0], out: [0, 0, -1], width: W }, { ...passage, y0: spring }, 0.2);
  });
  // the upper storeys of the tower (a framed gate's masonry stops under its framed storey)
  const top = H - Math.max(4, W * 0.55);
  const stoneTop = framed ? blockTop + Math.max(3.2, (top - blockTop) * 0.5) : top;
  const win = (u: number, y: number): ArchHole => ({ u, w: 0.85, y0: y, spring: y + 1.1, form: 'segmental', rise: 0.2 });
  const holes = framed ? {
    front: [win(-W * 0.22, blockTop + 1.2), win(W * 0.22, blockTop + 1.2)], back: [win(0, blockTop + 1.2)], left: [win(0, blockTop + 1.4)], right: [win(0, blockTop + 1.4)],
  } : {
    front: [win(-W * 0.22, blockTop + 1.2), win(W * 0.22, blockTop + 1.2), win(0, top - 2.2)],
    back: [win(0, blockTop + 1.2), win(0, top - 2.2)], left: [win(0, blockTop + 2.0)], right: [win(0, blockTop + 2.0)],
  };
  const f = archedBody(sink, wall, 0, 0, W, D, blockTop + ARCH_GAP_M, stoneTop, holes, 0.3);
  for (const name of ['front', 'back', 'left', 'right'] as const) {
    for (const h of holes[name]) archWindow(sink, f[name], h, 0.3, FRAME_WHITE, ctx.variant() < 0.2);
  }
  moulding(sink, wall, W, D, blockTop - 0.2, 0.25, 0.1);
  // (the looks lane) the tower's rusticated quoins from its plinth to the eaves, a string course at each storey, the
  // gatekeeper's oriel over the passage on the town side (a framed gate's quoins and courses stop under its framed storey)
  const masonTop = framed ? stoneTop : top;
  towerQuoins(sink, DRESS_BUCKET, W, D, 0.62, masonTop - 0.15);
  for (const y of [blockTop + 3.3, top - 3.2]) if (y > blockTop + 1.5 && y < masonTop - 1.2) moulding(sink, DRESS_BUCKET, W, D, y, 0.18, 0.08, { decor: true });
  if (!framed) moulding(sink, DRESS_BUCKET, W, D, top - 0.32, 0.3, 0.16, { decor: true });
  oriel(sink, DRESS_BUCKET, -D / 2, blockTop + 1.35, FRAME_WHITE);
  if (framed) {
    // the framed storey jettied out on its corbels: the render infill, oak posts, sill and head plates, a brace in each
    // bay's corners, two small windows a face; the town's arms over the passage on the field side
    const J = 0.38, fw = W + 2 * J, fd = D + 2 * J, y0 = stoneTop + 0.32;
    for (let x = -W / 2 + 0.4; x <= W / 2 - 0.3; x += 1.25) for (const sz of [-1, 1]) {
      sink.span('structureWood', x - 0.11, stoneTop - 0.3, sz > 0 ? D / 2 - 0.05 : -D / 2 - J, x + 0.11, stoneTop + 0.32, sz > 0 ? D / 2 + J : -D / 2 + 0.05, { colour: TIMBER_DARK, decor: true });
    }
    sink.span('structureWood', -fw / 2, stoneTop + 0.05, -fd / 2, fw / 2, y0, fd / 2, { colour: TIMBER_DARK });
    sink.span('plaster', -fw / 2 + 0.04, y0, -fd / 2 + 0.04, fw / 2 - 0.04, top, fd / 2 - 0.04, {});
    const frameFace = (origin: Vec3, u: Vec3, out: Vec3, width: number): Face => ({ origin, u, out, width });
    const fFaces: Face[] = [frameFace([0, 0, fd / 2], [1, 0, 0], [0, 0, 1], fw), frameFace([0, 0, -fd / 2], [-1, 0, 0], [0, 0, -1], fw),
      frameFace([fw / 2, 0, 0], [0, 0, -1], [1, 0, 0], fd), frameFace([-fw / 2, 0, 0], [0, 0, 1], [-1, 0, 0], fd)];
    for (const face of fFaces) {
      const half = face.width / 2, bays = Math.max(2, Math.round(face.width / 1.6));
      const post = (u: number) => sink.member('structureWood', facePoint(face, u, y0, 0), facePoint(face, u, top, 0), 0.18, 0.06, face.out, { colour: TIMBER, decor: true }, 0.02);
      for (let k = 0; k <= bays; k++) post(-half + 0.09 + (face.width - 0.18) * k / bays);
      for (const y of [y0 + 0.09, top - 0.09, y0 + (top - y0) * 0.38]) {
        sink.member('structureWood', facePoint(face, -half, y, 0), facePoint(face, half, y, 0), 0.16, 0.06, face.out, { colour: TIMBER, decor: true }, 0.02);
      }
      for (let k = 0; k < bays; k++) {
        const ua = -half + 0.09 + (face.width - 0.18) * k / bays, ub = -half + 0.09 + (face.width - 0.18) * (k + 1) / bays;
        if (k === 0 || k === bays - 1) {
          const [p0, p1] = k === 0 ? [ua, ub] : [ub, ua];
          sink.member('structureWood', facePoint(face, p0, y0 + 0.12, 0), facePoint(face, p1, y0 + (top - y0) * 0.36, 0), 0.14, 0.05, face.out, { colour: TIMBER, decor: true }, 0.02);
        } else if (k % 2 === 1) {
          const um = (ua + ub) / 2, wy = y0 + (top - y0) * 0.5;
          sink.quad('glass', facePoint(face, um - 0.32, wy, 0.02), facePoint(face, um + 0.32, wy, 0.02), facePoint(face, um + 0.32, wy + 0.85, 0.02), facePoint(face, um - 0.32, wy + 0.85, 0.02), { decor: true });
          sink.member('structureWood', facePoint(face, um - 0.4, wy - 0.05, 0), facePoint(face, um + 0.4, wy - 0.05, 0), 0.1, 0.08, face.out, { colour: FRAME_WHITE, decor: true }, 0.02);
        }
      }
    }
    // the arms: a shield in the town's colours on the field face over the arch ring
    const af: Face = { origin: [0, 0, D / 2], u: [1, 0, 0], out: [0, 0, 1], width: W }, ay = crown + 0.75;
    const shield = (s: number, dz: number): Vec3[] => [[-0.55 * s, ay + 0.65 * s], [0.55 * s, ay + 0.65 * s], [0.55 * s, ay - 0.1 * s], [0, ay - 0.7 * s], [-0.55 * s, ay - 0.1 * s]]
      .map(([u, y]) => facePoint(af, u, y, dz));
    sink.polygon('structureMetal', shield(1.12, 0.15), { colour: GILT, decor: true });
    sink.polygon('structureMetal', shield(1, 0.17), { colour: rgb(0xa8261e), decor: true });
    sink.polygon('structureMetal', [[-0.12, ay + 0.5], [0.12, ay + 0.5], [0.12, ay - 0.45], [-0.12, ay - 0.45]].map(([u, y]) => facePoint(af, u, y, 0.19)), { colour: WHITE, decor: true });
  }
  // the clock under the roof on the field side (a framed gate carries the town's arms over its passage instead)
  const cf = f.front, cy = top - 0.9;
  if (!framed) {
    // (the looks lane, 2026-10-16, the r2 sweep: the dial and its gilt ring were plates on the wall) the dial sits back in
    // its moulded stone ring, 14 cm proud of the wall: the ring's outer and inner faces and its gilt front, the blue dial at
    // its back with the gilt hour marks and the hands
    const disc: Vec3[] = [], RO = 0.78, RI = 0.64, RD = 0.14;
    for (let i = 0; i < 16; i++) {
      const a0 = i / 16 * Math.PI * 2, a1 = (i + 1) / 16 * Math.PI * 2;
      const p = (r: number, a: number, o: number) => facePoint(cf, Math.cos(a) * r, cy + Math.sin(a) * r, o);
      sink.quad(DRESS_BUCKET, p(RO, a1, 0), p(RO, a0, 0), p(RO, a0, RD), p(RO, a1, RD), { decor: true });
      sink.quad(DRESS_BUCKET, p(RI, a0, 0.01), p(RI, a1, 0.01), p(RI, a1, RD), p(RI, a0, RD), { decor: true, shade: 0.7 });
      sink.quad('structureMetal', p(RI, a0, RD), p(RI, a1, RD), p(RO, a1, RD), p(RO, a0, RD), { colour: GILT, decor: true });
      disc.push(p(RI + 0.005, a0, 0.012));
    }
    sink.polygon('structureMetal', disc, { colour: rgb(0x1f2d4a), decor: true });
    for (let k = 0; k < 12; k++) {
      const a = k / 12 * Math.PI * 2, r0 = RI - (k % 3 ? 0.09 : 0.14);
      sink.member('structureMetal', facePoint(cf, Math.cos(a) * r0, cy + Math.sin(a) * r0, 0.02), facePoint(cf, Math.cos(a) * (RI - 0.03), cy + Math.sin(a) * (RI - 0.03), 0.02),
        0.035, 0.012, cf.out, { colour: GILT, decor: true }, 0);
    }
    for (const [dx, dy] of [[-0.3, 0.2], [0.42, 0.1]]) sink.member('structureMetal', facePoint(cf, 0, cy, 0.035), facePoint(cf, dx, cy + dy, 0.035), 0.06, 0.02, cf.out, { colour: GILT, decor: true }, 0);
  }
  // the steep hipped roof and two dormers (the framed gate's roof steeper over its jettied storey, with a lantern)
  const roof: RoofSpec = framed ? { kind: 'hip', pitchDeg: 57, eave: 0.4, verge: 0.4, thickness: 0.14, bucket: 'roof', ridge: 'saddle' }
    : { kind: 'hip', pitchDeg: 62, eave: 0.45, verge: 0.45, thickness: 0.14, bucket: 'roof', ridge: 'saddle' };
  const rg = framed ? roofGeometry(W + 0.76, D + 0.76, top, roof) : roofGeometry(W, D, top, roof);
  emitRoof(sink, rg, roof);
  if (framed) {
    // the lantern astride the ridge: its posts, its little hipped cap
    const ly = rg.ridgeY - 0.25, lx = 0.9;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) sink.span('structureWood', sx * lx - 0.08, ly, sz * 0.6 - 0.08, sx * lx + 0.08, ly + 1.5, sz * 0.6 + 0.08, { colour: TIMBER, decor: true });
    sink.span('plaster', -lx + 0.1, ly, -0.5, lx - 0.1, ly + 0.5, 0.5, { decor: true });
    const cap: RoofSpec = { kind: 'hip', pitchDeg: 55, eave: 0.2, verge: 0.2, thickness: 0.08, bucket: 'roof', ridge: null };
    emitRoof(sink, roofGeometry(2 * lx + 0.16, 1.36, ly + 1.5, cap), cap);
  }
  if (!framed) for (const zs of [1, -1]) {
    const dRoof: RoofSpec = { kind: 'gable', pitchDeg: 50, eave: 0.12, verge: 0.12, thickness: 0.08, bucket: 'roof', ridge: null };
    sink.placed(zs > 0 ? 0 : Math.PI, 0, 0, zs * (D / 2 - 0.9), () => {
      // (the looks lane, 2026-10-15; WORKLIST #11 r2 "openings with depth": the dormer's pane was a glass plate on a stone
      // box) the dormer built round its window: two cheeks, the sill and the head across between them, the window cut
      // 13 cm in behind them, its casement frame, mullion and transom
      for (const sx of [-1, 1]) sink.span('stone', sx < 0 ? -0.55 : 0.38, top + 0.6, -0.4, sx < 0 ? -0.38 : 0.55, top + 1.6, 0.9);
      sink.span('stone', -0.38, top + 0.6, -0.4, 0.38, top + 1.6, 0.77);
      sink.span('stone', -0.38, top + 0.6, 0.77, 0.38, top + 0.74, 0.9, { decor: true });
      sink.span('stone', -0.38, top + 1.46, 0.77, 0.38, top + 1.6, 0.9, { decor: true });
      sink.quad('glass', [-0.38, top + 0.74, 0.775], [0.38, top + 0.74, 0.775], [0.38, top + 1.46, 0.775], [-0.38, top + 1.46, 0.775], { decor: true });
      const frameOpts = { colour: FRAME_WHITE, decor: true, fine: true } as const;
      for (const [a, b] of [[[-0.36, top + 0.76], [0.36, top + 0.76]], [[-0.36, top + 1.44], [0.36, top + 1.44]], [[-0.36, top + 0.76], [-0.36, top + 1.44]],
        [[0.36, top + 0.76], [0.36, top + 1.44]], [[0, top + 0.76], [0, top + 1.44]], [[-0.36, top + 1.2], [0.36, top + 1.2]]] as const) {
        sink.member('structureMetal', [a[0], a[1], 0.79], [b[0], b[1], 0.79], 0.04, 0.03, [0, 0, 1], frameOpts, 0);
      }
      emitRoof(sink, roofGeometry(1.1, 1.3, top + 1.6, dRoof), dRoof);
    });
  }
  // (the looks lane, 2026-10-15) the gate's two leaves standing open in the passage, folded back against its walls from
  // their hinges inside the field face: ledged and braced oak boards, the iron straps across them on their pintles.
  // Dressing: the passage stays open to a hull.
  const leafH = spring - 0.08, leafW = P / 2 - 0.05, hingeZ = D / 2 - 0.45;
  for (const sx of [-1, 1]) {
    const x = sx * (P / 2 - 0.07), boards = Math.max(4, Math.round(leafW / 0.32)), bw = leafW / boards;
    for (let k = 0; k < boards; k++) {
      const z0 = hingeZ - k * bw, tone = 0.88 + ((k * 7919) % 13) / 13 * 0.2;
      // (the r2 sweep: plain boxes) each board with its arrises taken off
      chamferedBox(sink, 'structureWood', [x - 0.04, 0.0, z0 - bw + 0.006], [x + 0.04, leafH - (k % 2) * 0.03, z0], 1, 0.012, { colour: shade(TIMBER, tone), decor: true });
    }
    // the ledges and the braces on the leaf's back (toward the passage's middle), the straps on its face
    const inner = x - sx * 0.06;
    for (const y of [0.45, leafH / 2, leafH - 0.45]) sink.span('structureWood', inner - 0.03, y - 0.1, hingeZ - leafW + 0.05, inner + 0.03, y + 0.1, hingeZ - 0.05, { colour: TIMBER_DARK, decor: true });
    for (const [ya, yb] of [[0.55, leafH / 2 - 0.1], [leafH / 2 + 0.1, leafH - 0.55]] as const) {
      sink.member('structureWood', [inner, ya, hingeZ - 0.15], [inner, yb, hingeZ - leafW + 0.2], 0.16, 0.06, [-sx, 0, 0], { colour: TIMBER_DARK, decor: true, exposed: true }, 0.02);
    }
    for (const y of [0.45, leafH / 2, leafH - 0.45]) {
      sink.member('structureMetal', [inner - sx * 0.035, y, hingeZ + 0.02], [inner - sx * 0.035, y, hingeZ - leafW * 0.62], 0.07, 0.012, [-sx, 0, 0], { colour: rgb(0x2a2a28), decor: true, exposed: true }, 0);
    }
  }
  // a finial on the roof's ridge (it comes off at the first damage: props lane A, E12)
  piece(sink, { name: 'finial', kind: 'detach', at: 'damaged', fall: 'drop' }, (s) =>
    revolve(s, 'structureMetal', 0, 0, [[0.05, rg.ridgeTopY - 0.1], [0.16, rg.ridgeTopY + 0.3], [0.05, rg.ridgeTopY + 0.5], [0.02, rg.ridgeTopY + 1.3]], 8, { colour: GILT, decor: true }));
  // the town wall either side (each stub its own length): rubble wall, crenellations, the wall-walk on corbels behind
  for (const sx of [-1, 1]) {
    const walls = sx < 0 ? wallsLeft : wallsRight;
    if (walls <= 0) continue;
    const x0 = sx * W / 2, x1 = sx * (W / 2 + walls), lo = Math.min(x0, x1), hi = Math.max(x0, x1), wh = Math.min(7.5, H * 0.42);
    sink.span(wall, lo, base, -0.6, hi, wh, 0.6);
    // (the looks lane, 2026-10-15) the wall's battered foot: a plinth course proud of it on both faces, its top weathered
    sink.span(wall, lo, base, -0.78, hi, 0.75, 0.78, { decor: true, shade: 0.92 });
    // (the looks lane) the parapet's coping, the merlons each under its own capstone, a loop through every other one
    sink.span(DRESS_BUCKET, lo, wh - 0.12, -0.68, hi, wh + 0.04, 0.68, { decor: true });
    for (let x = lo + 0.3, k = 0; x + 0.9 < hi; x += 1.8, k++) {
      // (props lane A, E12: every third merlon falls off the wall's face at the first damage, the next of each three when
      // the gate is breached, each under its own capstone; landmarks/pieces.ts)
      const emit = (s: PartSink, xm: number, km: number) => {
        // (the looks lane, 2026-10-15; WORKLIST #11 r2: the loop was a dark plate 2 cm proud of the merlon) every other
        // merlon's loop cut through it: the merlon its two cheeks, the stone under the slit and the stone over it
        if (km % 2 === 0) {
          s.span(wall, xm, wh, 0.05, xm + 0.4, wh + 0.9, 0.6);
          s.span(wall, xm + 0.5, wh, 0.05, xm + 0.9, wh + 0.9, 0.6);
          s.span(wall, xm + 0.4, wh, 0.05, xm + 0.5, wh + 0.25, 0.6, { shade: 0.7 });
          s.span(wall, xm + 0.4, wh + 0.75, 0.05, xm + 0.5, wh + 0.9, 0.6, { shade: 0.7 });
        } else s.span(wall, xm, wh, 0.05, xm + 0.9, wh + 0.9, 0.6);
        s.span(DRESS_BUCKET, xm - 0.05, wh + 0.9, 0.0, xm + 0.95, wh + 1.02, 0.65, { decor: true });
      };
      const xm = x, km = k;
      if (k % 3 < 2) {
        piece(sink, { name: `merlon-${sx < 0 ? 'l' : 'r'}-${k}`, kind: 'detach', at: k % 3 === 0 ? 'damaged' : 'breached', fall: 'drop', toward: [0, 1], clear: 1.0 },
          (s) => emit(s, xm, km));
      } else emit(sink, xm, km);
    }
    sink.span('structureWood', lo, wh - 0.9, -1.6, hi, wh - 0.75, -0.6, { colour: TIMBER, decor: true });
    for (let x = lo + 0.6; x < hi; x += 1.5) sink.span('structureWood', x - 0.08, wh - 1.6, -1.5, x + 0.08, wh - 0.9, -1.35, { colour: TIMBER_DARK, decor: true });
  }
  return { parts: finishLandmark(sink), tints: { plaster3: DRESS_TINT } };
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
