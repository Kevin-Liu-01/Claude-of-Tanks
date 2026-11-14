// src/world/landmarks/village.ts — a village's working buildings (the landmarks lane, 2026-10-06): the Lorraine lavoir
// and the Levantine khan; and (2026-10-07) a row of the map kit's houses, the fronts a square is enclosed by.
//
// The lavoir is the covered communal wash-house of a Lorraine village (the Meuse's and the Moselle's, rebuilt through the
// nineteenth century beside the stream or the fountain that feeds it): rendered rubble walls on three sides with sandstone
// quoins, the open front an arcade of round arches on sandstone piers, a low hipped roof of canal tiles on its tie beams,
// and inside, round the basin, the sloping washing stones the women knelt at.
//
// The khan is the merchants' inn of an Ottoman market town (Deir el Qamar's silk khan by the Midan): a two-storey ring of
// sandstone ranges round an open court, blank to the street but for the upper storey's small grilled windows and the
// tall pointed gate with its studded doors, and inside, the deep pointed arcades of the ground floor's stores and the
// upper gallery's, under flat roofs behind a parapet. Its gate is shut: the court is closed to a hull. `form: 'arcade'`
// builds only its street range, the arcade open to the street, as a market's row of shops.
import { PartSink, REGIONAL_BUCKETS, bodyFaces, facePoint, rgb, streamFrom, type Face, type RegionalBucket, type Vec3 } from '../maps/regional/geometry.ts';
import { buildRegionalParts, resolveRegionalArchitecture } from '../maps/regional/index.ts';
import { emitRoof, roofGeometry, type RoofSpec } from '../maps/regional/house.ts';
import { archedFace, archedSlab, bar, cornerPilasters, extrude, moulding, type ArchHole } from './kit.ts';
import { ageWall } from './age.ts';
import { drapedRect } from './grounds.ts';
import type { LandmarkBuilder } from './types.ts';
import { finishLandmark, piece, prebuiltPiece } from './pieces.ts';

const TIMBER = rgb(0x5f4a36), DOOR = rgb(0x4d3324), IRON = rgb(0x2a2c2d);
const uvOffset = (rng: () => number): [number, number] => [rng() * 7.31, rng() * 5.17];

// ---------------------------------------------------------------------------------------------------------- lavoir

/**
 * The lavoir (the frame: its length along x, the open arcade to +z, y = 0 the ground at its lowest corner): see the
 * module's note. (amberford-lavoir-272, 2026-11-10: placed on Amberford's place, and finished as a working wash-house)
 * The spring end (`spring`: 'left' -x, 'right' +x) is the uphill one. The spring rises outside it into the fontaine's
 * stone pillar, runs from its spout into the abreuvoir (the beasts' trough along that end wall) and through the wall by
 * an iron pipe into the rinçoir, the small upstream basin where the washing was rinsed; over the stone sill into the
 * long washing basin, ringed by its sloping washing stones; and out by the overflow through the far end wall into the
 * rill, a stone-kerbed channel to its drain. The roof and its tie beams come down when the lavoir is breached, the
 * fontaine's pillar at the first damage (landmarks/pieces.ts, the set-piece damage kit).
 */
export const lavoir: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const L = Math.max(8, Number(ctx.params.length)), D = Math.max(5, Number(ctx.params.depth));
  const bays = Math.max(2, Math.round(Number(ctx.params.bays)));
  const s = ctx.params.spring === 'right' ? 1 : -1; // the spring end's side along x
  const t = 0.6, base = -0.6 - ctx.groundFall;
  const groundAt = (lx: number, lz: number): number => ctx.ground?.(lx, lz) ?? 0;
  // the floor stands a hand over the highest ground inside the walls (cut into a bank, the lavoir is terraced: its paved
  // floor on a stone podium toward the low side, never the ground showing through it), at least 0.25 m over the lowest
  let inside = 0;
  for (let i = 0; i <= 6; i++) for (let j = 0; j <= 4; j++) inside = Math.max(inside, groundAt(-L / 2 + t + (L - 2 * t) * i / 6, -D / 2 + t + (D - 2 * t) * j / 4));
  const floor = Math.max(0.25, inside + 0.12), h = floor + 3.65;
  // the paved floor, a step proud of the walls
  sink.span('stone', -L / 2 - 0.3, base, -D / 2 - 0.3, L / 2 + 0.3, floor, D / 2 + 0.3);
  // the flight up to the middle arch from the ground before it (`steps`: its run, m), when the floor stands over it
  const run = Math.max(0, Number(ctx.params.steps) || 0), front = D / 2 + 0.3;
  if (run > 0) {
    const foot = groundAt(0, front + run / 2), risers = Math.ceil(Math.max(0, floor - foot) / 0.18);
    const rise = (floor - foot) / Math.max(1, risers), tread = Math.min(0.34, run / Math.max(1, risers - 1));
    const sw = Math.min(2.6, (L - 0.8 * (bays + 1)) / bays) / 2 + 0.2;
    for (let k = 1; k < risers; k++) {
      const z0 = front + (risers - 1 - k) * tread;
      sink.span('stone', -sw, base, z0, sw, foot + k * rise, z0 + tread);
    }
  }
  // the back wall and the two end walls: render on the rubble
  sink.span('plaster', -L / 2, floor, -D / 2, L / 2, h, -D / 2 + t);
  for (const sx of [-1, 1]) {
    const x0 = sx > 0 ? L / 2 - t : -L / 2;
    sink.span('plaster', x0, floor, -D / 2 + t, x0 + t, h, D / 2 - t);
  }
  // the front: an arcade of round arches on sandstone piers, a plain impost band at the springing
  const pier = 0.8, A = (L - (bays + 1) * pier) / bays, spring = h - A / 2 - 0.42;
  const holes: ArchHole[] = Array.from({ length: bays }, (_, i) => ({
    u: -L / 2 + pier + A / 2 + i * (A + pier), w: A, y0: floor, spring, form: 'round' as const,
  }));
  sink.placed(0, 0, 0, D / 2 - t / 2, () => archedSlab(sink, 'stone', -L / 2, L / 2, floor, h, t, holes, { ends: true, top: true }));
  for (let i = 0; i <= bays; i++) {
    const x = -L / 2 + pier / 2 + i * (A + pier), hw = pier / 2 + 0.06;
    sink.span('stone', x - hw, spring - 0.16, D / 2 - t - 0.02, x + hw, spring, D / 2 + 0.06, { decor: true });
  }
  // the sandstone quoins and the eaves course
  cornerPilasters(sink, 'stone', 0, 0, L, D, floor, h - 0.22, 0.45, 0.04);
  moulding(sink, 'stone', L, D, h - 0.22, 0.22, 0.1);
  // the two basins, ringed by the washing stones sloping to the water: the rinçoir (the spring's end, short) and the
  // washing basin (the rest), the stone sill between them a hand under the kerb
  const bx = L / 2 - t - 1.3, bz0 = -D / 2 + t + 1.05, bz1 = D / 2 - t - 1.25, kerb = floor + 0.42, lip = floor + 0.26, w = 0.55;
  const sides: Array<[Vec3[], Vec3, number]> = [
    // along x: the front side and the back side (profile in y-z at x = -bx - w, extruded along +x)
    [[[-bx - w, floor - 0.5, bz1], [-bx - w, lip, bz1], [-bx - w, kerb, bz1 + w], [-bx - w, floor - 0.5, bz1 + w]], [1, 0, 0], 2 * (bx + w)],
    [[[-bx - w, floor - 0.5, bz0 - w], [-bx - w, kerb, bz0 - w], [-bx - w, lip, bz0], [-bx - w, floor - 0.5, bz0]], [1, 0, 0], 2 * (bx + w)],
    // along z: the two ends (profile in x-y at z = bz0, extruded along +z)
    [[[bx, floor - 0.5, bz0], [bx, lip, bz0], [bx + w, kerb, bz0], [bx + w, floor - 0.5, bz0]], [0, 0, 1], bz1 - bz0],
    [[[-bx - w, floor - 0.5, bz0], [-bx - w, kerb, bz0], [-bx, lip, bz0], [-bx, floor - 0.5, bz0]], [0, 0, 1], bz1 - bz0],
  ];
  for (const [profile, dir, depth] of sides) extrude(sink, 'stone', profile, dir, depth, { decor: true });
  const sill = s * (bx - Math.min(2.2, bx * 0.45)), sw = 0.16;
  sink.span('stone', sill - sw, floor - 0.2, bz0, sill + sw, lip - 0.04, bz1, { decor: true });
  const water = floor + 0.12;
  const pools: Array<[number, number, number]> = s < 0 ? [[-bx, sill - sw, water + 0.05], [sill + sw, bx, water]] : [[-bx, sill - sw, water], [sill + sw, bx, water + 0.05]];
  for (const [x0, x1, y] of pools) sink.quad('glass', [x0, y, bz1], [x1, y, bz1], [x1, y, bz0], [x0, y, bz0], { decor: true });
  // the spring's iron pipe through the spring end wall into the rinçoir, and the overflow's spout out of the far end
  const xi = s * (L / 2 - t), zm = (bz0 + bz1) / 2;
  bar(sink, 'structureMetal', [xi + s * 0.05, floor + 0.62, zm], [xi - s * 0.5, floor + 0.62, zm], 0.07, { colour: IRON, decor: true });
  bar(sink, 'structureMetal', [-s * (L / 2 - 0.05), floor + 0.05, zm], [-s * (L / 2 + 0.3), floor + 0.05, zm], 0.12, { colour: IRON, decor: true });
  // the drying pole the length of the back wall, on iron hooks
  const pz = -D / 2 + t + 0.35, py = floor + 2.0;
  bar(sink, 'structureWood', [-L / 2 + t + 0.4, py, pz], [L / 2 - t - 0.4, py, pz], 0.07, { colour: TIMBER, decor: true, fine: true });
  for (const x of [-L / 2 + t + 0.6, 0, L / 2 - t - 0.6]) bar(sink, 'structureMetal', [x, py, -D / 2 + t], [x, py, pz], 0.03, { colour: IRON, decor: true, fine: true });
  // the washerwomen's kneeling boxes along the front kerb, open to the basin
  for (let k = 0; k < bays; k++) {
    const x = -bx + (2 * bx) * (k + 0.5) / bays + (ctx.variant() - 0.5) * 0.8, z = bz1 + w + 0.32, bw = 0.55, bd = 0.42, bh = 0.32;
    sink.span('structureWood', x - bw / 2, floor, z - bd / 2, x + bw / 2, floor + 0.04, z + bd / 2, { colour: TIMBER, decor: true, fine: true });
    sink.span('structureWood', x - bw / 2, floor, z + bd / 2 - 0.03, x + bw / 2, floor + bh, z + bd / 2, { colour: TIMBER, decor: true, fine: true });
    for (const e of [-1, 1]) sink.span('structureWood', x + e * bw / 2 - (e > 0 ? 0.03 : 0), floor, z - bd / 2, x + e * bw / 2 + (e < 0 ? 0.03 : 0), floor + bh, z + bd / 2,
      { colour: TIMBER, decor: true, fine: true });
  }
  // outside the spring end: the abreuvoir along the wall, a hollow stone trough seated on the ground there, and the
  // fontaine's pillar at its outer side, its spout over the water
  const tx0 = s * L / 2, tx1 = s * (L / 2 + 1.05), tz = Math.min(1.7, D / 2 - 0.9), tg = Math.max(floor, groundAt(s * (L / 2 + 0.55), 0));
  const rim = tg + 0.72, tw = 0.16, lo = Math.min(tx0, tx1), hi = Math.max(tx0, tx1);
  sink.span('stone', lo, base, -tz, hi, tg + 0.1, tz);
  sink.span('stone', lo, tg + 0.1, -tz, hi, rim, -tz + tw);
  sink.span('stone', lo, tg + 0.1, tz - tw, hi, rim, tz);
  sink.span('stone', lo, tg + 0.1, -tz + tw, lo + tw, rim, tz - tw);
  sink.span('stone', hi - tw, tg + 0.1, -tz + tw, hi, rim, tz - tw);
  sink.quad('glass', [lo + tw, rim - 0.1, tz - tw], [hi - tw, rim - 0.1, tz - tw], [hi - tw, rim - 0.1, -tz + tw], [lo + tw, rim - 0.1, -tz + tw], { decor: true });
  const fx = s * (L / 2 + 1.05 + 0.28), fg = Math.max(floor, groundAt(fx, 0)), top = fg + 1.75;
  piece(sink, { name: 'fontaine', kind: 'detach', at: 'damaged', fall: 'topple', toward: [s, 0] }, (p) => {
    p.span('stone', fx - 0.28, base, -0.36, fx + 0.28, top, 0.36);
    p.span('stone', fx - 0.36, top, -0.44, fx + 0.36, top + 0.14, 0.44);
    p.polygon('stone', [[fx - 0.3, top + 0.14, 0.38], [fx + 0.3, top + 0.14, 0.38], [fx, top + 0.52, 0]], { decor: true });
    p.polygon('stone', [[fx + 0.3, top + 0.14, -0.38], [fx - 0.3, top + 0.14, -0.38], [fx, top + 0.52, 0]], { decor: true });
    p.polygon('stone', [[fx - 0.3, top + 0.14, -0.38], [fx - 0.3, top + 0.14, 0.38], [fx, top + 0.52, 0]], { decor: true });
    p.polygon('stone', [[fx + 0.3, top + 0.14, 0.38], [fx + 0.3, top + 0.14, -0.38], [fx, top + 0.52, 0]], { decor: true });
    bar(p, 'structureMetal', [fx - s * 0.28, rim + 0.42, 0], [fx - s * 0.7, rim + 0.36, 0], 0.06, { colour: IRON, decor: true });
  });
  // the rill from the overflow: two stone kerbs, its bed and its water, to the iron grating of the drain
  const r0 = -s * (L / 2 + 0.3), r1 = -s * (L / 2 + 1.15), rg = groundAt((r0 + r1) / 2, zm), rlo = Math.min(r0, r1), rhi = Math.max(r0, r1);
  for (const e of [-1, 1]) sink.span('stone', rlo, base, zm + e * 0.32 - 0.11, rhi, rg + 0.14, zm + e * 0.32 + 0.11, { decor: true });
  sink.span('stone', rlo, base, zm - 0.21, rhi, rg - 0.04, zm + 0.21, { decor: true });
  sink.quad('glass', [rlo, rg + 0.02, zm + 0.21], [rhi, rg + 0.02, zm + 0.21], [rhi, rg + 0.02, zm - 0.21], [rlo, rg + 0.02, zm - 0.21], { decor: true });
  const gx = s < 0 ? rhi - 0.05 : rlo - 0.55;
  sink.span('stone', gx, base, zm - 0.34, gx + 0.6, rg - 0.02, zm + 0.34, { decor: true });
  sink.span('structureMetal', gx + 0.04, rg - 0.02, zm - 0.3, gx + 0.56, rg + 0.04, zm + 0.3, { colour: IRON, decor: true });
  // the low hipped roof of canal tiles on its tie beams, one over each pier: it comes down when the lavoir is breached
  piece(sink, { name: 'roof', kind: 'detach', at: 'breached', fall: 'slump' }, (p) => {
    for (let i = 0; i <= bays; i++) {
      const x = -L / 2 + pier / 2 + i * (A + pier);
      bar(p, 'structureWood', [x, h - 0.12, -D / 2 + t], [x, h - 0.12, D / 2 - t], 0.2, { colour: TIMBER, decor: true });
    }
    const roof: RoofSpec = { kind: 'hip', pitchDeg: 22, eave: 0.55, verge: 0.55, thickness: 0.12, bucket: 'roof', ridge: 'round' };
    p.placed(Math.PI / 2, 0, 0, 0, () => emitRoof(p, roofGeometry(D, L, h, roof), roof));
  });
  // its age (age.ts): the render fallen from the rubble at the wall foot, the grime run down from the eaves
  if (ctx.age) {
    const outside: Face[] = [
      { origin: [0, 0, -D / 2], u: [-1, 0, 0], out: [0, 0, -1], width: L },
      { origin: [L / 2, 0, 0], u: [0, 0, -1], out: [1, 0, 0], width: D },
      { origin: [-L / 2, 0, 0], u: [0, 0, 1], out: [-1, 0, 0], width: D },
    ];
    outside.forEach((face, k) => {
      const half = (k === 0 ? L : D) / 2 - 0.5;
      ageWall(sink, ctx.age!, { face, bucket: 'plaster', area: { u0: -half, u1: half, y0: floor, y1: h - 0.3 }, ledge: h - 0.24, spall: 'stone',
        spallCount: k === 0 ? 3 : 2, grime: 0.3 });
    });
  }
  return { parts: finishLandmark(sink), tints: { plaster: [0.98, 0.92, 0.8] } };
};

// ---------------------------------------------------------------------------------------------------------- khan

/** The court arcade's openings along a range face `len` long: pointed arches in bays of about 3.8 m. */
function arcade(len: number, y0: number, spring: number, w: number): ArchHole[] {
  const n = Math.max(1, Math.round(len / 3.8));
  return Array.from({ length: n }, (_, i) => ({ u: -len / 2 + len * (i + 0.5) / n, w, y0, spring, form: 'pointed' as const }));
}

/** A range face's role: toward the court (or the street, for the arcade form) its arcades; outward its windows. */
type Role = 'arcade' | 'outside' | 'gate';

/**
 * The khan (the frame: its street front to +z, y = 0 the ground at its lowest corner): see the module's note. A range
 * is a solid two-storey block; its court face carries the ground floor's deep arcade and the gallery's over it, its
 * outer faces the small upper windows, and the street front the gate.
 */
export const khan: LandmarkBuilder = (ctx) => {
  const sink = new PartSink(uvOffset(ctx.rng));
  const W = Math.max(14, Number(ctx.params.width)), Dk = Math.max(10, Number(ctx.params.depth)), r = Math.max(4.5, Number(ctx.params.range));
  const court = String(ctx.params.form) !== 'arcade';
  const base = -0.6 - ctx.groundFall, floor = 0.35, g1 = 4.6, g2 = 3.7, H = floor + g1 + g2, wall: RegionalBucket = 'stone';
  const depth = court ? Dk : r, cw = W - 2 * r, cd = Dk - 2 * r;
  sink.span(wall, -W / 2 - 0.15, base, -depth / 2 - 0.15, W / 2 + 0.15, floor, depth / 2 + 0.15);
  // the ranges, each with its faces' roles and the stretch of each face that shows (in the face's own u)
  type FaceName = 'front' | 'right' | 'back' | 'left';
  const ranges: Array<{ cx: number; cz: number; w: number; d: number; faces: Partial<Record<FaceName, [Role, number, number]>> }> = court
    ? [
      { cx: 0, cz: Dk / 2 - r / 2, w: W, d: r, faces: { front: ['gate', -W / 2, W / 2], back: ['arcade', -cw / 2, cw / 2], right: ['outside', -r / 2, r / 2], left: ['outside', -r / 2, r / 2] } },
      { cx: 0, cz: -Dk / 2 + r / 2, w: W, d: r, faces: { back: ['outside', -W / 2, W / 2], front: ['arcade', -cw / 2, cw / 2], right: ['outside', -r / 2, r / 2], left: ['outside', -r / 2, r / 2] } },
      { cx: W / 2 - r / 2, cz: 0, w: r, d: cd, faces: { right: ['outside', -cd / 2, cd / 2], left: ['arcade', -cd / 2, cd / 2] } },
      { cx: -W / 2 + r / 2, cz: 0, w: r, d: cd, faces: { left: ['outside', -cd / 2, cd / 2], right: ['arcade', -cd / 2, cd / 2] } },
    ]
    : [{ cx: 0, cz: 0, w: W, d: r, faces: { front: ['arcade', -W / 2, W / 2], back: ['outside', -W / 2, W / 2], right: ['outside', -r / 2, r / 2], left: ['outside', -r / 2, r / 2] } }];
  for (const b of ranges) {
    const f = bodyFaces(b.w, b.d);
    sink.span(wall, b.cx - b.w / 2, H - 0.3, b.cz - b.d / 2, b.cx + b.w / 2, H, b.cz + b.d / 2);
    for (const name of ['front', 'right', 'back', 'left'] as const) {
      const spec = b.faces[name];
      if (!spec) continue;
      const [role, u0, u1] = spec, len = u1 - u0;
      const fc: Face = { origin: [f[name].origin[0] + b.cx, 0, f[name].origin[2] + b.cz], u: f[name].u, out: f[name].out, width: f[name].width };
      if (role === 'arcade') {
        // the ground floor's deep arcade, the gallery's over it, and the string course at the gallery's floor
        archedFace(sink, wall, fc, { u0, u1, y0: floor, y1: floor + g1 }, arcade(len, floor, floor + 2.3, 2.6).map((h) => ({ ...h, u: h.u + (u0 + u1) / 2 })),
          2.4, { segments: 10 });
        archedFace(sink, wall, fc, { u0, u1, y0: floor + g1, y1: H - 0.3 },
          arcade(len, floor + g1 + 0.85, floor + g1 + 1.8, 2.0).map((h) => ({ ...h, u: h.u + (u0 + u1) / 2 })), 1.6, { segments: 10 });
        const a = facePoint(fc, u0, floor + g1 - 0.06, 0.1), c = facePoint(fc, u1, floor + g1 + 0.12, 0);
        sink.span(wall, Math.min(a[0], c[0]), a[1], Math.min(a[2], c[2]), Math.max(a[0], c[0]), c[1], Math.max(a[2], c[2]), { decor: true });
        continue;
      }
      // outside: blank below (the gate in the street front), small grilled windows in the upper storey
      const n = Math.max(1, Math.round(len / 4.2));
      const gate: ArchHole[] = role === 'gate' ? [{ u: 0, w: 3.0, y0: floor, spring: floor + 2.3, form: 'pointed' as const }] : [];
      const windows: ArchHole[] = Array.from({ length: n }, (_, i) => ({ u: u0 + len * (i + 0.5) / n, w: 0.8, y0: floor + g1 + 1.0,
        spring: floor + g1 + 2.1, form: 'flat' as const })).filter((wd) => !gate.length || Math.abs(wd.u) > 2.4);
      archedFace(sink, wall, fc, { u0, u1, y0: floor, y1: floor + g1 }, gate, 1.0, { segments: 10 });
      archedFace(sink, wall, fc, { u0, u1, y0: floor + g1, y1: H - 0.3 }, windows, 0.35);
      // its age (age.ts): the grime run down the sandstone from the string course and the windows' sills
      if (ctx.age) ageWall(sink, ctx.age, { face: fc, bucket: wall, area: { u0: u0 + 0.3, u1: u1 - 0.3, y0: floor, y1: H - 0.4 },
        openings: [...gate, ...windows], ledge: H - 0.22, grime: 0.28 });
      for (const wd of windows) {
        for (let k = 1; k < 4; k++) {
          const u = wd.u - wd.w / 2 + wd.w * k / 4;
          sink.member('structureMetal', facePoint(fc, u, wd.y0, -0.1), facePoint(fc, u, wd.spring, -0.1), 0.035, 0.035, fc.out,
            { colour: IRON, decor: true, fine: true }, 0.0175);
        }
      }
      if (gate.length) {
        // the studded doors shut at the back of the gate's reveal, and its dressed frame proud of the wall
        const g = gate[0];
        sink.quad('structureWood', facePoint(fc, -g.w / 2, g.y0, -0.95), facePoint(fc, g.w / 2, g.y0, -0.95), facePoint(fc, g.w / 2, g.spring + 1.2, -0.95),
          facePoint(fc, -g.w / 2, g.spring + 1.2, -0.95), { colour: DOOR, decor: true });
        for (const side of [-1, 1]) {
          const p = facePoint(fc, side * (g.w / 2 + 0.45), floor, 0), q = facePoint(fc, side * (g.w / 2 + 0.95), floor + 6.2, 0.22);
          sink.span(wall, Math.min(p[0], q[0]), p[1], Math.min(p[2], q[2]), Math.max(p[0], q[0]), q[1], Math.max(p[2], q[2]));
        }
        const p = facePoint(fc, -g.w / 2 - 0.95, floor + 5.7, 0), q = facePoint(fc, g.w / 2 + 0.95, floor + 6.4, 0.24);
        sink.span(wall, Math.min(p[0], q[0]), p[1], Math.min(p[2], q[2]), Math.max(p[0], q[0]), q[1], Math.max(p[2], q[2]));
      }
    }
    // the parapet round the range's roof
    const pt = 0.3, ph = 0.85;
    sink.span(wall, b.cx - b.w / 2, H, b.cz - b.d / 2, b.cx + b.w / 2, H + ph, b.cz - b.d / 2 + pt, { decor: true });
    sink.span(wall, b.cx - b.w / 2, H, b.cz + b.d / 2 - pt, b.cx + b.w / 2, H + ph, b.cz + b.d / 2, { decor: true });
    sink.span(wall, b.cx - b.w / 2, H, b.cz - b.d / 2 + pt, b.cx - b.w / 2 + pt, H + ph, b.cz + b.d / 2 - pt, { decor: true });
    sink.span(wall, b.cx + b.w / 2 - pt, H, b.cz - b.d / 2 + pt, b.cx + b.w / 2, H + ph, b.cz + b.d / 2 - pt, { decor: true });
  }
  // the string course under the parapet, round the outside only (a moulding's band would lid the court), and the court's
  // paving
  const sc = 0.08, y0 = H - 0.2;
  sink.span(wall, -W / 2 - sc, y0, depth / 2, W / 2 + sc, H, depth / 2 + sc, { decor: true });
  sink.span(wall, -W / 2 - sc, y0, -depth / 2 - sc, W / 2 + sc, H, -depth / 2, { decor: true });
  sink.span(wall, -W / 2 - sc, y0, -depth / 2, -W / 2, H, depth / 2, { decor: true });
  sink.span(wall, W / 2, y0, -depth / 2, W / 2 + sc, H, depth / 2, { decor: true });
  if (court) sink.span(wall, -cw / 2, floor, -cd / 2, cw / 2, floor + 0.08, cd / 2, { decor: true });
  // the paved front between the gate and the street (`forecourt` metres deep; gauntlet waves 154-158: no square, no
  // paving, no approach), draped over the ground
  const fore = Math.max(0, Number(ctx.params.forecourt) || 0);
  if (fore > 0) drapedRect(sink, wall, ctx.ground, { cx: 0, cz: depth / 2 + fore / 2, hw: W / 2 + 0.6, hd: fore / 2 }, { lift: 0.05 });
  return { parts: sink.finish(), tints: { stone: [1.04, 0.96, 0.82] } };
};

// ---------------------------------------------------------------------------------------------------------- house row

/**
 * A row of the map kit's houses (the landmarks lane, 2026-10-07, Saltwind round 4: the campanile's piazza needs "house
 * fronts enclosing it"): `count` houses side by side along the piece's x, each about `width` wide (a hand either way,
 * the row's length kept at count × width) and `depth` deep, their street fronts toward +z — each the kit's own build of
 * `structure` (its walls and openings, roof, weathering and wear: maps/regional/index.ts buildRegionalParts) drawn from a
 * stream of the piece's. The houses abut: their party walls face each other, the eaves meeting over them.
 */
export const houseRow: LandmarkBuilder = (ctx) => {
  const style = resolveRegionalArchitecture(String(ctx.params.kit));
  if (!style) throw new Error('houseRow: no architecture kit');
  const structure = String(ctx.params.structure || 'cottage');
  const count = Math.max(1, Math.min(6, Math.round(Number(ctx.params.count)))), W = Math.max(4.5, Number(ctx.params.width));
  const D = Math.max(6, Number(ctx.params.depth));
  const widths = Array.from({ length: count }, () => W + (ctx.variant() - 0.5) * 1.2);
  const sum = widths.reduce((a, b) => a + b, 0);
  // (props census #15, Lane C 2026-10-16: "built as one landmark, the row is a setpiece, so all six houses are
  // breach-only and can never collapse") each house a named piece of the row (pieces.ts): every other one slumps where
  // it stands at the row's first damage, the rest when it is breached
  const sink = new PartSink();
  let x = -count * W / 2, k = 0;
  for (const raw of widths) {
    const w = raw * count * W / sum, seed = Math.floor(ctx.rng() * 4294967296);
    const house = buildRegionalParts(style, {
      structureId: structure, info: { w, d: D, h: 8 }, bounds: { minX: -w / 2, maxX: w / 2, minZ: -D / 2, maxZ: D / 2, maxY: 8 },
      wallBucket: ctx.variant() < 0.75 ? 'stone' : 'plaster', rng: streamFrom(seed), variant: streamFrom((seed ^ 0x5bd1e995) >>> 0),
      // (built as the desktop's: the composer leaves the fine joinery out on a phone, so its coarse parts and its
      // collision are the desktop's, as every piece's are)
      mapId: ctx.mapId, snowCap: ctx.snowCap, tier: 'desktop',
    }, streamFrom((seed ^ 0x27d4eb2f) >>> 0));
    for (const name of REGIONAL_BUCKETS) for (const g of house[name] ?? []) g.translate(x + w / 2, 0, 0);
    prebuiltPiece(sink, { name: `house-${k}`, kind: 'detach', at: k % 2 === 0 ? 'breached' : 'damaged', fall: 'slump', outward: false }, house);
    x += w; k++;
  }
  return { parts: finishLandmark(sink) };
};
