// src/world/landmarks/civic.ts — the civic set pieces (the landmarks lane, 2026-10-05): the church (an Orthodox village
// church of the black-earth governorates, or a Western hall church with its spire), the town hall with its clock
// tower, the railway station with its platform canopy, the market hall and the grain elevator. Proportions from the
// buildings themselves: a Kursk-governorate village church of 1800-1900 is a whitewashed brick "ship" — the bell tower,
// the refectory, the cube with its drum and dome, the apse — 25-32 m long, its bell tower 25-30 m to the cross.
import { PartSink, faceBox, facePoint, rgb, type Face, type RegionalBucket, type Vec3 } from '../maps/regional/geometry.ts';
import { emitRoof, roofGeometry, type RoofSpec } from '../maps/regional/house.ts';
import { archSurround, archWindow, archedBody, archedSlab, bar, cornerPilasters, dome, drum, extrude, moulding, revolve, tentRoof, type ArchHole, type FaceName } from './kit.ts';
import { ageWall } from './age.ts';
import type { LandmarkBuilder } from './types.ts';
import { FRAME_WHITE, GILT, SLATE_BLUE, bell, doorLeaf, lit, revolveDisc, uvOffset } from './civicKit.ts';
export { church } from './civicChurch.ts';
export { stationHall } from './civicStation.ts';

// ---------------------------------------------------------------------------------------------------------- town hall

/**
 * The town hall (a German Rathaus): an open arcade across the ground floor of its front, two storeys of windows over
 * it, a steep roof with dormers and stepped gables at its ends, and a ridge turret — the clock stage, an open lantern
 * and a bell-shaped helm with its spike. `frame` (the Hessian Fachwerk-Rathaus, Alsfeld's): the stone arcade under
 * upper storeys of render in an oak frame — sill and head beams at every storey, posts at the bays and beside the
 * windows, the rails under the sills, the corners' braced figures — framed gables under the roof's verge instead of
 * stepped ones, and the two corner turrets (Erker) with their slate spires over the front.
 */
export const townHall: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const W = Math.max(14, Number(ctx.params.width)), D = Math.max(9, Number(ctx.params.depth));
  const storeys = Math.max(2, Math.min(4, Math.round(Number(ctx.params.storeys)))), towerTop = Math.max(18, Number(ctx.params.tower));
  const base = -0.6 - ctx.groundFall, wall: RegionalBucket = 'stone', render: RegionalBucket = 'plaster', plinth = 0.5;
  const framed = ctx.params.frame === true, OAK = rgb(0x46302a);
  const g = 4.6, up = 3.5, eave = plinth + g + up * (storeys - 1), arcadeD = 2.8;
  sink.span(wall, -W / 2 - 0.1, base, -D / 2 - 0.1, W / 2 + 0.1, plinth, D / 2 + 0.1);
  // the ground floor: the arcade slab across the front, the hall's wall set back behind it, the side and back walls
  const bays = Math.max(3, Math.round(W / 4.2)), bw = W / bays;
  const arches: ArchHole[] = Array.from({ length: bays }, (_, i) => ({ u: -W / 2 + bw * (i + 0.5), w: bw * 0.66, y0: plinth, spring: plinth + g - bw * 0.33 - 0.5, form: 'round' as const }));
  sink.placed(0, 0, 0, D / 2 - 0.4, () => archedSlab(sink, wall, -W / 2, W / 2, plinth, plinth + g, 0.8, arches, { ends: true, top: false }));
  const back = archedBody(sink, render, 0, -arcadeD / 2, W - 1.0, D - arcadeD - 0.6, plinth, plinth + g, {
    front: [{ u: 0, w: 1.6, y0: plinth, spring: plinth + 2.6, form: 'round' }],
  }, 0.3);
  doorLeaf(sink, back.front, { u: 0, w: 1.6, y0: plinth, spring: plinth + 2.6, form: 'round' }, 0.3);
  // the arcade's own interior (gauntlet wave 156: "its ground-floor arches are filled with cream render, so the market
  // hall reads as a painted facade"): the hall's front in the arcade's shadow (the render's own bucket under the kit
  // weathering's occlusion), the boarded ceiling on its beams under the floor above, and the market's stalls under it
  const zIn = D / 2 - 0.8, zWall = back.front.origin[2] + 0.02;
  for (const [u0, u1] of [[-(W - 1.0) / 2, -1.0], [1.0, (W - 1.0) / 2]] as const) {
    sink.quad(render, facePoint(back.front, u0, plinth, 0.02), facePoint(back.front, u1, plinth, 0.02), facePoint(back.front, u1, plinth + g, 0.02),
      facePoint(back.front, u0, plinth + g, 0.02), { decor: true, shade: 0.5 });
  }
  // (the boards face down into the arcade)
  sink.quad('structureWood', [-W / 2 + 0.4, plinth + g - 0.02, zWall], [W / 2 - 0.4, plinth + g - 0.02, zWall], [W / 2 - 0.4, plinth + g - 0.02, zIn],
    [-W / 2 + 0.4, plinth + g - 0.02, zIn], { colour: rgb(0x3a2c22), decor: true });
  for (let i = 0; i <= bays; i++) {
    const x = -W / 2 + bw * i;
    sink.span('structureWood', x - 0.12, plinth + g - 0.32, zWall, x + 0.12, plinth + g - 0.02, zIn, { colour: OAK, decor: true, fine: true });
  }
  const stalls = Math.max(0, Math.min(bays - 1, Math.round(Number(ctx.params.stalls ?? 2))));
  const arcadeStalls = Array.from({ length: stalls }, (_, k) => ({ kind: 'stall', x: -W / 2 + bw * (k * 2 + 0.5 + (bays > 4 ? 1 : 0)), z: (zIn + zWall) / 2, yawDeg: 0 }))
    .filter((d) => Math.abs(d.x) > 1.6);
  // the upper storeys over the whole plan, a window to a bay, each storey's string course
  const holes: Partial<Record<FaceName, ArchHole[]>> = { front: [], back: [], left: [], right: [] };
  for (let k = 0; k < storeys - 1; k++) {
    const y0 = plinth + g + up * k + 0.9;
    for (let i = 0; i < bays; i++) {
      const u = -W / 2 + bw * (i + 0.5);
      const rise = framed ? 0.04 : 0.2;
      holes.front!.push({ u, w: 1.15, y0, spring: y0 + 1.75, form: 'segmental', rise });
      holes.back!.push({ u: -u, w: 1.15, y0, spring: y0 + 1.75, form: 'segmental', rise });
    }
    for (const u of [-D * 0.25, D * 0.25]) {
      holes.left!.push({ u, w: 1.1, y0, spring: y0 + 1.75, form: 'segmental', rise: framed ? 0.04 : 0.2 });
      holes.right!.push({ u, w: 1.1, y0, spring: y0 + 1.75, form: 'segmental', rise: framed ? 0.04 : 0.2 });
    }
  }
  // (one body to a storey: a face cuts one opening to a column, so the storeys' windows stacked over each other in one
  // body left every storey but the first blank — the round-2 review of Frontier's Rathaus)
  let storeyFaces: Record<FaceName, Face> | null = null;
  for (let k = 0; k < storeys - 1; k++) {
    const yb = plinth + g + up * k + (k === 0 ? ARCH_GAP_M_CIVIC : 0), yt = k === storeys - 2 ? eave : plinth + g + up * (k + 1);
    const row: Partial<Record<FaceName, ArchHole[]>> = {};
    for (const name of ['front', 'back', 'left', 'right'] as const) row[name] = (holes[name] ?? []).filter((h) => h.y0 > yb && h.y0 < yt);
    storeyFaces = archedBody(sink, render, 0, 0, W, D, yb, yt, row, 0.28);
  }
  if (!storeyFaces) throw new Error('townHall: no upper storey');
  const upper = storeyFaces;
  for (const name of ['front', 'back', 'left', 'right'] as const) {
    for (const h of holes[name] ?? []) {
      archWindow(sink, upper[name], h, 0.28, FRAME_WHITE, lit(ctx, 0.35));
      if (!framed) archSurround(sink, wall, upper[name], h, 0.16, 0.06);
    }
  }
  // its age (round 2: the pieces stood "pristine with no weathering"): the render fallen in patches — the clay infill
  // under it in a framed hall, the masonry in a rendered one — and the rain run down from the eaves and the sills
  if (ctx.age) for (const name of ['front', 'back', 'left', 'right'] as const) {
    const len = name === 'front' || name === 'back' ? W : D;
    ageWall(sink, ctx.age, { face: upper[name], bucket: render, area: { u0: -len / 2 + 0.3, u1: len / 2 - 0.3, y0: plinth + g + 0.1, y1: eave - 0.3 },
      openings: holes[name] ?? [], ledge: eave - 0.3, spall: framed ? 'plaster2' : wall, spallCount: name === 'front' || name === 'back' ? 3 : 2, grime: 0.22 });
  }
  if (framed) {
    // the oak frame over the render: per storey the sill beam, the posts at the bays and either side of each window,
    // the rails under the sills between them, and a braced figure at each corner
    for (const name of ['front', 'back', 'left', 'right'] as const) {
      const face = upper[name], fw = face.width, win = holes[name] ?? [];
      for (let k = 0; k < storeys - 1; k++) {
        const y0 = plinth + g + up * k, y1 = y0 + up;
        faceBox(sink, 'structureWood', face, 0, y0 + 0.14, 0.04, fw, 0.28, 0.08, { colour: OAK, decor: true });
        const storeyWin = win.filter((h) => h.y0 > y0 && h.y0 < y1);
        const posts = new Set<number>([-fw / 2 + 0.12, fw / 2 - 0.12]);
        for (const h of storeyWin) { posts.add(h.u - h.w / 2 - 0.12); posts.add(h.u + h.w / 2 + 0.12); }
        const bayLines = name === 'front' || name === 'back' ? bays : 3;
        for (let i = 1; i < bayLines; i++) {
          const u = -fw / 2 + fw * i / bayLines;
          if (!storeyWin.some((h) => Math.abs(h.u - u) < h.w / 2 + 0.25)) posts.add(u);
        }
        for (const u of posts) faceBox(sink, 'structureWood', face, u, (y0 + y1) / 2 + 0.07, 0.035, 0.18, up - 0.14, 0.07, { colour: OAK, decor: true });
        // the rails under the sills, interrupted at the windows
        const sillY = storeyWin.length ? storeyWin[0].y0 - 0.1 : y0 + 0.8;
        const sorted = [...posts].sort((a, b) => a - b);
        for (let i = 0; i + 1 < sorted.length; i++) {
          const a = sorted[i], b = sorted[i + 1];
          if (storeyWin.some((h) => h.u > a && h.u < b)) continue;
          faceBox(sink, 'structureWood', face, (a + b) / 2, sillY, 0.035, b - a, 0.14, 0.07, { colour: OAK, decor: true, fine: true });
          // the braced figure in the end panels
          if (i === 0 || i + 2 === sorted.length) {
            const p0 = facePoint(face, i === 0 ? a + 0.1 : b - 0.1, y0 + 0.3, 0.04), p1 = facePoint(face, i === 0 ? b - 0.1 : a + 0.1, y1 - 0.25, 0.04);
            bar(sink, 'structureWood', p0, p1, 0.12, { colour: OAK, decor: true });
          }
        }
      }
    }
    faceBox(sink, 'structureWood', upper.front, 0, eave - 0.12, 0.04, W, 0.24, 0.08, { colour: OAK, decor: true });
    faceBox(sink, 'structureWood', upper.back, 0, eave - 0.12, 0.04, W, 0.24, 0.08, { colour: OAK, decor: true });
  } else {
    for (let k = 0; k < storeys - 1; k++) moulding(sink, wall, W, D, plinth + g + up * k - 0.05, 0.22, 0.1);
    cornerPilasters(sink, wall, 0, 0, W, D, plinth + g, eave - 0.2, 0.6, 0.07);
    moulding(sink, wall, W, D, eave - 0.3, 0.3, 0.2);
  }
  // the roof: ridge along the front (built in a frame turned a quarter), the gables (stepped, or framed under the verge),
  // the dormers
  const roof: RoofSpec = { kind: 'gable', pitchDeg: 55, eave: 0.4, verge: framed ? 0.45 : 0.05, thickness: 0.14, bucket: 'roof', ridge: 'saddle' };
  const rg = roofGeometry(D, W, eave, roof);
  sink.placed(Math.PI / 2, 0, 0, 0, () => emitRoof(sink, rg, roof));
  const rise = rg.ridgeY - eave, steps = 6;
  if (framed) {
    for (const sx of [-1, 1]) {
      const x = sx * W / 2;
      const A: Vec3 = [x, eave, -D / 2], B: Vec3 = [x, eave, D / 2], C: Vec3 = [x, rg.ridgeY, 0];
      sink.polygon('plaster', sx > 0 ? [A, C, B] : [A, B, C]);
      const o = sx * 0.04;
      // the gable's frame: its foot beam, a collar at half height, the king post and the two raking braces
      bar(sink, 'structureWood', [x + o, eave + 0.1, -D / 2], [x + o, eave + 0.1, D / 2], 0.2, { colour: OAK, decor: true });
      const cy = eave + rise * 0.5, half = (D / 2) * 0.5;
      bar(sink, 'structureWood', [x + o, cy, -half], [x + o, cy, half], 0.16, { colour: OAK, decor: true });
      bar(sink, 'structureWood', [x + o, eave + 0.1, 0], [x + o, rg.ridgeY - 0.2, 0], 0.16, { colour: OAK, decor: true });
      for (const zs of [-1, 1]) bar(sink, 'structureWood', [x + o, eave + 0.2, zs * (D / 2 - 0.3)], [x + o, cy, zs * half * 0.4], 0.12, { colour: OAK, decor: true, fine: true });
    }
    // the corner turrets over the front: corbelled out from the first upper storey, octagonal, under slate spires
    for (const sx of [-1, 1]) {
      const tx = sx * (W / 2 - 0.15), tz = D / 2 - 0.15, y0 = plinth + g + 0.2, yTop = eave + 1.3;
      revolve(sink, 'plaster', tx, tz, [[0.35, y0], [1.15, y0 + 0.9], [1.15, yTop]], 8, {}, Math.PI / 8);
      revolve(sink, 'stone', tx, tz, [[1.2, yTop - 0.05], [1.22, yTop + 0.15]], 8, { decor: true }, Math.PI / 8);
      const spire = yTop + Math.max(3.6, rise * 0.7);
      revolve(sink, 'structureMetal', tx, tz, [[1.3, yTop + 0.1], [0.04, spire]], 8, { colour: SLATE_BLUE }, Math.PI / 8);
      revolve(sink, 'structureMetal', tx, tz, [[0.05, spire - 0.1], [0.015, spire + 0.9]], 4, { colour: GILT, decor: true });
    }
  } else for (const sx of [-1, 1]) {
    for (let k = 0; k < steps; k++) {
      const y0 = eave + rise * k / steps, y1 = eave + rise * (k + 1) / steps + 0.35, half = (D / 2 + 0.1) * (1 - k / steps);
      sink.span(wall, sx * W / 2 - 0.35, y0, -half, sx * W / 2 + 0.05, y1, half);
      sink.span(wall, sx * W / 2 - 0.45, y1, -half - 0.08, sx * W / 2 + 0.12, y1 + 0.1, -half + 0.4);
      sink.span(wall, sx * W / 2 - 0.45, y1, half - 0.4, sx * W / 2 + 0.12, y1 + 0.1, half + 0.08);
    }
  }
  for (const zs of [1, -1]) for (const u of [-W * 0.3, W * 0.3]) {
    const dRoof: RoofSpec = { kind: 'gable', pitchDeg: 48, eave: 0.12, verge: 0.12, thickness: 0.08, bucket: 'roof', ridge: null };
    const zf = zs * (D / 2 - 1.2);
    sink.placed(zs > 0 ? 0 : Math.PI, u, 0, zf, () => {
      sink.span(render, -0.7, eave + 0.4, -0.6, 0.7, eave + 1.7, 0.9);
      sink.quad('glass', [-0.45, eave + 0.6, 0.91], [0.45, eave + 0.6, 0.91], [0.45, eave + 1.5, 0.91], [-0.45, eave + 1.5, 0.91], { decor: true, window: [0, 0, 1] });
      emitRoof(sink, roofGeometry(1.4, 1.5, eave + 1.7, dRoof), dRoof);
    });
  }
  // the ridge turret
  // (its body reaches down to the roof slopes at its sides: no gap shows under it)
  const tb = 3.0, ty0 = rg.ridgeY - (tb / 2) * Math.tan(roof.pitchDeg * Math.PI / 180) - 0.3, ty1 = rg.ridgeTopY + 3.2;
  const tf = archedBody(sink, render, 0, 0, tb, tb, ty0, ty1, {}, 0);
  for (const name of ['front', 'back', 'left', 'right'] as const) revolveDisc(sink, tf[name], 0, ty1 - 1.3, 0.85);
  moulding(sink, wall, tb, tb, ty1 - 0.2, 0.2, 0.12);
  const lanternTop = ty1 + 2.6;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) sink.span('structureWood', sx * (tb / 2 - 0.3) - 0.12, ty1, sz * (tb / 2 - 0.3) - 0.12, sx * (tb / 2 - 0.3) + 0.12, lanternTop, sz * (tb / 2 - 0.3) + 0.12, { colour: rgb(0x3a3430) });
  sink.span('structureWood', -tb / 2 + 0.2, lanternTop, -tb / 2 + 0.2, tb / 2 - 0.2, lanternTop + 0.25, tb / 2 - 0.2, { colour: rgb(0x3a3430) });
  bell(sink, 0, lanternTop - 0.2, 0, 0.42);
  const helm = dome(sink, 'structureMetal', 0, lanternTop + 0.25, 0, tb * 0.52, 'onion', 12, { colour: SLATE_BLUE });
  revolve(sink, 'structureMetal', 0, 0, [[0.12, helm - 0.1], [0.02, Math.max(helm + 1.5, towerTop)], [0, Math.max(helm + 1.6, towerTop + 0.1)]], 6, { colour: GILT, decor: true });
  return { parts: sink.finish(), tints: { plaster: [1.0, 0.94, 0.84] }, destructibles: arcadeStalls };
};
const ARCH_GAP_M_CIVIC = 0.002;

// ---------------------------------------------------------------------------------------------------------- market hall

/**
 * The market hall (a Renaissance town's Markthalle, a Tuscan loggia del mercato): an arcade round the ground floor,
 * open bay by bay, the upper hall with its windows over it, and a hipped roof with a lantern.
 */
export const marketHall: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const L = Math.max(14, Number(ctx.params.length)), W = Math.max(8, Number(ctx.params.width)), bays = Math.max(3, Math.round(Number(ctx.params.bays)));
  const base = -0.6 - ctx.groundFall, wall: RegionalBucket = 'stone', t = 0.8, g = 5.2, plinth = 0.4;
  sink.span(wall, -W / 2 - 0.1, base, -L / 2 - 0.1, W / 2 + 0.1, plinth, L / 2 + 0.1);
  const arcade = (len: number, n: number): ArchHole[] => Array.from({ length: n }, (_, i) => ({ u: -len / 2 + len * (i + 0.5) / n, w: len / n * 0.68, y0: plinth,
    spring: plinth + g - len / n * 0.34 - 0.6, form: 'round' as const }));
  const crossBays = Math.max(2, Math.round(bays * W / L));
  for (const [yaw, off, len, n] of [[0, L / 2 - t / 2, W, crossBays], [Math.PI, L / 2 - t / 2, W, crossBays], [Math.PI / 2, W / 2 - t / 2, L - 2 * t, bays],
    [-Math.PI / 2, W / 2 - t / 2, L - 2 * t, bays]] as const) {
    sink.placed(yaw, Math.sin(yaw) * off, 0, Math.cos(yaw) * off, () => archedSlab(sink, wall, -len / 2, len / 2, plinth, plinth + g, t, arcade(len, n), { ends: true, top: true }));
  }
  // the upper hall, its windows, the cornice, the hipped roof and lantern
  const up = 4.0, holes: Partial<Record<FaceName, ArchHole[]>> = {};
  holes.left = arcade(L, bays).map((h) => ({ u: h.u, w: 1.1, y0: plinth + g + 0.9, spring: plinth + g + 2.6, form: 'round' as const }));
  holes.right = holes.left.map((h) => ({ ...h }));
  holes.front = arcade(W, crossBays).map((h) => ({ u: h.u, w: 1.1, y0: plinth + g + 0.9, spring: plinth + g + 2.6, form: 'round' as const }));
  holes.back = holes.front.map((h) => ({ ...h }));
  const f = archedBody(sink, 'plaster', 0, 0, W, L, plinth + g + 0.002, plinth + g + up, holes, 0.3);
  for (const name of ['front', 'back', 'left', 'right'] as const) for (const h of holes[name] ?? []) {
    archWindow(sink, f[name], h, 0.3, FRAME_WHITE, lit(ctx, 0.2));
    archSurround(sink, wall, f[name], h, 0.14, 0.05);
  }
  moulding(sink, wall, W, L, plinth + g - 0.05, 0.25, 0.12);
  moulding(sink, wall, W, L, plinth + g + up - 0.3, 0.3, 0.22);
  const roof: RoofSpec = { kind: 'hip', pitchDeg: 32, eave: 0.7, verge: 0.7, thickness: 0.14, bucket: 'roof', ridge: 'saddle' };
  const rg = roofGeometry(W, L, plinth + g + up, roof);
  emitRoof(sink, rg, roof);
  const lt = drum(sink, 'plaster', 0, rg.ridgeY - 0.3, 0, 0.9, 1.4, 8, { windows: 4 });
  tentRoof(sink, 'roof', 0, 0, 1.25, lt, 1.4, 8);
  return { parts: sink.finish(), tints: { plaster: [1.0, 0.93, 0.8] } };
};

// ---------------------------------------------------------------------------------------------------------- grain elevator

/**
 * The collective farm's grain store (zernosklad): a long single-storey store of brick (or of boards on a brick plinth)
 * under a low gable roof, its double doors along the front with a ramp to each, a hoist gable at the middle with its
 * beam, and the small vents high under the eaves.
 */
export const granary: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const L = Math.max(14, Number(ctx.params.length)), W = Math.max(7, Number(ctx.params.width)), timber = String(ctx.params.walls) === 'timber';
  const base = -0.6 - ctx.groundFall, plinth = 0.9, H = plinth + 3.8;
  const wall: RegionalBucket = timber ? 'structureWood' : 'stone', wallOpts = timber ? { colour: rgb(0x6f5f4c) } : {};
  // (gauntlet wave 155: "no plinth, mortar loss, damp or soot staining") the plinth in a dark cement render
  sink.span(timber ? 'stone' : 'plaster2', -L / 2 - 0.1, base, -W / 2 - 0.1, L / 2 + 0.1, plinth, W / 2 + 0.1);
  const doors = Math.max(2, Math.round(L / 9)), du = (i: number) => -L / 2 + L * (i + 0.5) / doors;
  const front: ArchHole[] = Array.from({ length: doors }, (_, i) => ({ u: du(i), w: 2.6, y0: plinth, spring: plinth + 2.8, form: 'flat' as const }));
  const vents = (len: number) => Array.from({ length: Math.round(len / 3.2) }, (_, i) => ({ u: -len / 2 + 1.6 + i * 3.2, w: 0.6, y0: H - 1.0, spring: H - 0.6, form: 'flat' as const }));
  const holes: Partial<Record<FaceName, ArchHole[]>> = { front: [...front, ...vents(L).filter((v) => front.every((d) => Math.abs(d.u - v.u) > 2))], back: vents(L) };
  const f = archedBody(sink, wall, 0, 0, L, W, plinth, H, holes, 0.3, wallOpts);
  for (const d of front) {
    gateLeaves(sink, f.front, d);
    // the ramp up to the door sill: its side profile run across the door's width
    extrude(sink, 'stone', [[d.u - 1.6, base, W / 2], [d.u - 1.6, base, W / 2 + 2.4], [d.u - 1.6, -0.1, W / 2 + 2.4], [d.u - 1.6, plinth, W / 2]],
      [1, 0, 0], 3.2);
  }
  const roof: RoofSpec = { kind: 'gable', pitchDeg: 24, eave: 0.6, verge: 0.4, thickness: 0.1, bucket: 'roof', ridge: 'saddle' };
  sink.placed(Math.PI / 2, 0, 0, 0, () => emitRoof(sink, roofGeometry(W, L, H, roof), roof));
  if (!timber) moulding(sink, 'stone', L, W, H - 0.25, 0.25, 0.1);
  if (ctx.age && !timber) for (const name of ['front', 'back', 'left', 'right'] as const) {
    const len = name === 'front' || name === 'back' ? L : W;
    ageWall(sink, ctx.age, { face: f[name], bucket: wall, area: { u0: -len / 2 + 0.3, u1: len / 2 - 0.3, y0: plinth, y1: H - 0.3 },
      openings: holes[name] ?? [], ledge: H - 0.26, grime: 0.3 });
  }
  // the hoist gable over the middle door: a small cross gable, its loft door and the beam out of its peak
  const hg: RoofSpec = { kind: 'gable', pitchDeg: 40, eave: 0.2, verge: 0.3, thickness: 0.1, bucket: 'roof', ridge: null };
  sink.placed(0, 0, 0, W / 2 - 1.2, () => {
    sink.span(wall, -1.6, H - 0.2, -1.0, 1.6, H + 1.6, 1.6, wallOpts);
    sink.quad('structureWood', [-0.6, H + 0.1, 1.61], [0.6, H + 0.1, 1.61], [0.6, H + 1.4, 1.61], [-0.6, H + 1.4, 1.61], { colour: rgb(0x4a3b2e), decor: true });
    emitRoof(sink, roofGeometry(3.2, 2.6, H + 1.6, hg), hg);
    bar(sink, 'structureWood', [0, H + 2.4, 1.0], [0, H + 2.4, 2.6], 0.2, { colour: rgb(0x4a3b2e), decor: true });
  });
  return { parts: sink.finish(), tints: { plaster2: [0.6, 0.58, 0.55] } };
};

/** A double plank door hung in a flat-headed opening. */
function gateLeaves(sink: PartSink, face: Face, h: ArchHole): void {
  for (const side of [-1, 1]) {
    const u0 = h.u + side * 0.02, u1 = h.u + side * h.w / 2;
    sink.quad('structureWood', facePoint(face, Math.min(u0, u1), h.y0, -0.27), facePoint(face, Math.max(u0, u1), h.y0, -0.27),
      facePoint(face, Math.max(u0, u1), h.spring, -0.27), facePoint(face, Math.min(u0, u1), h.spring, -0.27), { colour: rgb(0x5e4a38), decor: true });
    sink.member('structureWood', facePoint(face, Math.min(u0, u1), h.y0 + 0.2, -0.25), facePoint(face, Math.max(u0, u1), h.spring - 0.2, -0.25), 0.12, 0.03,
      face.out, { colour: rgb(0x4e3c2e), decor: true, fine: true }, 0);
  }
}
