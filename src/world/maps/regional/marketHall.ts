// src/world/maps/regional/marketHall.ts — the covered market hall's carpentry (props census #23, the looks lane
// 2026-10-15; WORKLIST.md "Markets & stalls": the Breton halles "the plinths plain unchamfered boxes, the setts one slab,
// no rafters, purlins or truss, the default kit's spalls"; the Lorraine halle "six plain stone pier boxes ... no trusses,
// braces, goods or own destruction"). A hall of the old French type (Le Faouët, Questembert, Plougasnou; Lorraine's
// village halles): oak posts on dressed stone dés with their chamfer stops, knee-braced both ways to the wall plates and
// the tie beams; on every tie beam a king-post truss, its principals and struts, purlins along the slopes and common
// rafters under the covering; a floor of setts in their courses inside a dressed kerb; trestle stalls heaped with the
// season's produce, baskets, crates and sacks, a beam scale hung from a tie beam. The post frame is recorded as an open
// frame with the roof its crown (lattice.ts recordLattice), so a shot hall comes down as its posts and its roof (damage.ts
// describeLattice), never as the default kit's box spalls.
import { PartSink, faceBox, shade, type Face, type RegionalBucket, type Rgb, type Vec3 } from './geometry.ts';
import { emitRoof, roofGeometry, type RoofGeometry, type RoofSpec } from './house.ts';
import { recordLattice } from './lattice.ts';

export interface HalleSpec {
  /** the floor's extent, the kerb's outside: across (x) and along (z) */
  W: number;
  D: number;
  /** the wall plates' underside over the floor's datum */
  H: number;
  roof: RoofSpec;
  /** the oak, the dés' stone */
  timber: Rgb;
  /** bays along each long side (posts: bays + 1 a side) */
  bays: number;
  /** the stalls' produce, heaped on the trestles */
  produce: readonly Rgb[];
  mobile: boolean;
  /** the dressing's stream (the kit's look stream: no structure follows from it) */
  look: () => number;
  /** the roof covering's paint over a coloured bucket (a painted sheet), if any */
  roofColour?: Rgb;
  /** a gable roof's end triangles boarded above the end tie beams (a louvred vent in each) */
  boardedGables?: Rgb | null;
}

const FLOOR = 0.1, KERB = 0.32;

/** A dé: the dressed stone block a post stands on, its top chamfered back to a stop under the post's foot. */
function de(sink: PartSink, x: number, z: number, top: number): number {
  sink.span('stone', x - 0.27, FLOOR - 0.2, z - 0.27, x + 0.27, top - 0.12, z + 0.27, { tint: [1.04, 1.02, 0.98] });
  // the chamfered stop: a square frustum from the block's arris in to the post (4 faces turned to the square)
  sink.cylinder('stone', [x, top - 0.12, z], 'y', 0.12, 0.27 * Math.SQRT2, 4, { tint: [1.06, 1.04, 1.0] }, 0.17 * Math.SQRT2, true, Math.PI / 4);
  return top;
}

/** The setts' kerb along a side from a to b (x or z run): dressed blocks with their joints. Structure. */
function kerbRun(sink: PartSink, alongX: boolean, a: number, b: number, at: number, look: () => number): void {
  let u = a;
  while (u < b - 0.05) {
    const len = Math.min(b - u, 0.8 + look() * 0.5), v = b - (u + len) < 0.4 ? b : u + len;
    const tint: Rgb = [0.96 + look() * 0.08, 0.95 + look() * 0.06, 0.93 + look() * 0.06];
    if (alongX) sink.span('stone', u + 0.006, -0.3, at - KERB / 2, v - 0.006, FLOOR + 0.05, at + KERB / 2, { tint });
    else sink.span('stone', at - KERB / 2, -0.3, u + 0.006, at + KERB / 2, FLOOR + 0.05, v - 0.006, { tint });
    u = v;
  }
}

/**
 * Lay a covered market hall centred on the emitting frame's origin, its length along z. Returns the roof's geometry
 * (the caller dresses the covering's ends) and the posts' feet.
 */
export function timberHalle(sink: PartSink, spec: HalleSpec): { rg: RoofGeometry; eaveY: number } {
  const { W, D, H, timber, look } = spec;
  const oak = { colour: timber }, oakDark = { colour: shade(timber, 0.82) };
  // ---- the floor: setts inside the kerb, the kerb's blocks round them
  sink.span('stone', -W / 2 + KERB, -0.3, -D / 2 + KERB, W / 2 - KERB, FLOOR, D / 2 - KERB, { tint: [0.9, 0.9, 0.88] });
  for (const s of [-1, 1]) kerbRun(sink, true, -W / 2, W / 2, s * (D / 2 - KERB / 2), look);
  for (const s of [-1, 1]) kerbRun(sink, false, -D / 2 + KERB, D / 2 - KERB, s * (W / 2 - KERB / 2), look);
  sink.dressing(spec.mobile, () => {
    // the setts in their courses: each a little out of the next's tone, the courses broken bond
    const sx0 = -W / 2 + KERB + 0.02, sx1 = W / 2 - KERB - 0.02, sz0 = -D / 2 + KERB + 0.02, sz1 = D / 2 - KERB - 0.02;
    const step = 0.42;
    for (let z = sz0, row = 0; z < sz1 - 0.05; z += step, row++) {
      const z1 = Math.min(sz1, z + step - 0.025);
      for (let x = sx0 - (row % 2 ? step / 2 : 0); x < sx1 - 0.05; x += step) {
        const a = Math.max(sx0, x), b = Math.min(sx1, x + step - 0.025);
        if (b - a < 0.08) continue;
        const k = 0.86 + look() * 0.22;
        sink.quad('stone', [a, FLOOR + 0.004, z1], [b, FLOOR + 0.004, z1], [b, FLOOR + 0.004, z], [a, FLOOR + 0.004, z], { decor: true, tint: [k, k * 0.99, k * 0.97] });
      }
    }
  });
  // ---- the posts on their dés, the plates and the tie beams
  const px = W / 2 - KERB - 0.3, n = spec.bays + 1, pz0 = -D / 2 + KERB + 0.3, span = D - 2 * (KERB + 0.3);
  const zs = Array.from({ length: n }, (_, k) => pz0 + span * k / spec.bays);
  const deTop = FLOOR + 0.5, plateTop = H + 0.22, tieTop = plateTop + 0.22;
  const legs: Array<{ foot: Vec3; head: Vec3 }> = [];
  for (const sx of [-1, 1]) for (const z of zs) {
    const x = sx * px;
    de(sink, x, z, deTop);
    // the oak post, its arrises chamfered (an octagon), tapering a little to its head
    sink.cylinder('structureWood', [x, deTop, z], 'y', H - deTop, 0.135, 8, oak, 0.125, true, Math.PI / 8);
    legs.push({ foot: [x, deTop, z], head: [x, H, z] });
  }
  for (const sx of [-1, 1]) sink.span('structureWood', sx * px - 0.13, H, zs[0] - 0.32, sx * px + 0.13, plateTop, zs[n - 1] + 0.32, oak);
  for (const z of zs) sink.span('structureWood', -px - 0.32, plateTop, z - 0.12, px + 0.32, tieTop, z + 0.12, oakDark);
  // the knee braces: along the plates from every post both ways, across to the tie beams
  sink.dressing(spec.mobile, () => {
    for (const sx of [-1, 1]) for (let k = 0; k < n; k++) {
      const x = sx * px, z = zs[k];
      for (const dz of [-1, 1]) {
        if (k === 0 && dz < 0 || k === n - 1 && dz > 0) continue;
        sink.member('structureWood', [x, H - 0.8, z + dz * 0.1], [x, H - 0.01, z + dz * 0.8], 0.1, 0.12, [1, 0, 0], { ...oakDark, decor: true, exposed: true }, 0.06);
      }
      sink.member('structureWood', [x - sx * 0.1, H - 0.7, z], [x - sx * 0.75, plateTop + 0.01, z], 0.1, 0.12, [0, 0, 1], { ...oakDark, decor: true, exposed: true }, 0.06);
    }
  });
  // ---- the roof: its covering on the plates, the trusses on the tie beams, the purlins and the common rafters
  const eaveY = tieTop;
  const rw = 2 * (px + 0.13), rd = zs[n - 1] - zs[0] + 0.64;
  const rg = roofGeometry(rw, rd, eaveY, spec.roof);
  emitRoof(sink, rg, spec.roof, spec.roofColour);
  const under = (x: number): number => rg.ridgeY - Math.abs(x) * rg.tanP - 0.02;
  hallRoofTimbers(sink, { rg, roof: spec.roof, px, zs, tieTop, eaveY, rd, timber, mobile: spec.mobile });
  // a gable roof's ends boarded above the end tie beams, a louvred vent in each
  if (spec.roof.kind === 'gable' && spec.boardedGables) {
    const bc = spec.boardedGables;
    for (const sz of [-1, 1]) {
      const z = sz * (rd / 2 - 0.34);
      for (let x = -px; x < px - 0.1; x += 0.2) {
        const xm = x + 0.1, top = under(Math.abs(xm) + 0.1) - 0.04;
        if (top - tieTop < 0.1) continue;
        sink.span('structureWood', x + 0.005, tieTop, z - 0.012, x + 0.195, top, z + 0.012, { colour: shade(bc, 0.88 + look() * 0.2), decor: true });
      }
      const face: Face = { origin: [0, 0, z + sz * 0.012], u: [sz, 0, 0], out: [0, 0, sz], width: 1 };
      const vy = tieTop + (under(0) - tieTop) * 0.45;
      faceBox(sink, 'dark', face, 0, vy, 0.004, 0.6, 0.5, 0.008, { decor: true });
      for (let k = 0; k < 4; k++) faceBox(sink, 'structureWood', face, 0, vy - 0.19 + k * 0.125, 0.02, 0.64, 0.05, 0.03, { colour: shade(bc, 0.8), decor: true, fine: true });
    }
  }
  // the frame recorded as an open frame: a shot hall falls as its posts and its timbers, the covering heaped where the
  // fall throws it (the crown: the lattice fall lays it as one crumpled mass at the end of the fall, its girth the box's,
  // so the box is the heap the slates or tiles and their battens make, not the roof's whole span)
  const crownB: RegionalBucket = spec.roof.bucket, cw = Math.min(rw, 2.6) / 2, cd = Math.min(rd, 2.6) / 2;
  recordLattice(sink, legs, [H, tieTop], 0.26, 'structureWood', timber, {
    x0: -cw, x1: cw, y0: eaveY, y1: eaveY + 2.6, z0: -cd, z1: cd, bucket: crownB, tint: spec.roofColour ?? [0.42, 0.43, 0.45],
  });
  return { rg, eaveY };
}

/** What a hall's roof frame stands on: its roof, the tie beams' half span (`px`) and their places along it (`zs`), the
 *  ties' top, the eave, the roof's depth along the ridge, the oak. */
export interface RoofFrame { rg: RoofGeometry; roof: RoofSpec; px: number; zs: readonly number[]; tieTop: number; eaveY: number; rd: number; timber: Rgb; mobile: boolean }

/**
 * The carpentry under a hall's covering, the roof's frame centred on the emitting frame's origin (the ridge along z): on
 * every tie beam a king-post truss (on a hip roof those under the ridge), its principals and struts; the purlins along
 * both slopes, the ridge piece, the common rafters a pace apart, a hip roof's hip rafters. Dressing.
 */
export function hallRoofTimbers(sink: PartSink, f: RoofFrame): void {
  const { rg, roof, px, zs, tieTop, eaveY, rd, timber } = f;
  const oakDark = { colour: shade(timber, 0.82) };
  const under = (x: number): number => rg.ridgeY - Math.abs(x) * rg.tanP - 0.02;
  sink.dressing(f.mobile, () => {
    const t = { ...oakDark, decor: true, exposed: true } as const;
    const trussZs = roof.kind === 'gable' ? zs : zs.filter((z) => Math.abs(z) <= rg.ridgeHalf + 0.05 || zs.length <= 2);
    for (const z of trussZs) {
      // the principals from the tie's ends to the apex, the king post, the struts from its foot to the principals' middles
      for (const s of [-1, 1]) sink.member('structureWood', [s * (px + 0.05), tieTop, z], [0, under(0) - 0.08, z], 0.16, 0.12, [0, 0, 1], t, 0.06);
      sink.member('structureWood', [0, tieTop, z], [0, under(0) - 0.05, z], 0.16, 0.14, [0, 0, 1], t, 0.07);
      for (const s of [-1, 1]) sink.member('structureWood', [s * 0.07, tieTop + 0.35, z], [s * px * 0.5, under(px * 0.5) - 0.12, z], 0.1, 0.1, [0, 0, 1], t, 0.05);
    }
    // the purlins along both slopes at the principals' middles, the ridge piece under the apex
    const ze0 = roof.kind === 'gable' ? -rd / 2 - roof.verge + 0.1 : -Math.max(0.2, rg.ridgeHalf) - 0.3;
    for (const s of [-1, 1]) {
      const x = s * px * 0.5;
      sink.span('structureWood', x - 0.07, under(x) - 0.2, ze0, x + 0.07, under(x) - 0.06, -ze0, t);
    }
    sink.span('structureWood', -0.08, under(0) - 0.24, ze0, 0.08, under(0) - 0.06, -ze0, t);
    // the common rafters under the covering, a pace apart along the ridge
    const rz = roof.kind === 'gable' ? rd / 2 + roof.verge - 0.15 : Math.max(0.3, rg.ridgeHalf);
    for (let z = -rz; z <= rz + 1e-6; z += Math.max(0.5, (2 * rz) / Math.max(1, Math.round(2 * rz / 0.75)))) {
      for (const s of [-1, 1]) sink.member('structureWood', [s * (rg.s + roof.eave * 0.8), under(rg.s + roof.eave * 0.8) - 0.07, z],
        [s * 0.06, under(0.06) - 0.07, z], 0.12, 0.07, [0, 0, 1], { colour: shade(timber, 0.76), decor: true, exposed: true }, 0.035);
    }
    // a hip roof's hip rafters from the plates' corners to the ridge's ends
    if (roof.kind === 'hip') {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const dx = -sx * (px + 0.1), dz = sz * (rg.ridgeHalf - rd / 2 + 0.02), dl = Math.hypot(dx, dz);
        sink.member('structureWood', [sx * (px + 0.1), eaveY + 0.02, sz * (rd / 2 - 0.02)], [0, under(0) - 0.08, sz * rg.ridgeHalf], 0.14, 0.09, [dz / dl, 0, -dx / dl],
          { colour: shade(timber, 0.76), decor: true, exposed: true }, 0.045);
      }
    }
  });
}

/**
 * The stalls under a hall: trestle tables (boards on splayed trestles) heaped with produce, baskets beside them,
 * slatted crates and sacks, and a beam scale hung from the tie beam over them. Dressing: none of it is collision.
 */
export function hallStalls(sink: PartSink, spec: HalleSpec, opts: { tables?: number; scaleZ?: number | null } = {}): void {
  const { W, D, look } = spec;
  sink.dressing(spec.mobile, () => {
    const board = shade(spec.timber, 1.35), leg = shade(spec.timber, 1.1), willow: Rgb = [0.55, 0.45, 0.31], sack: Rgb = [0.7, 0.62, 0.48];
    const px = W / 2 - KERB - 0.3, rows = opts.tables ?? 2;
    for (let r = 0; r < rows; r++) {
      const zc = rows === 1 ? 0 : (r / (rows - 1) - 0.5) * Math.min(D * 0.45, D - 2.6);
      for (const sx of [-1, 1]) {
        const x = sx * Math.min(px - 0.85, W * 0.2), L = Math.min(2.4, D * 0.36), y = FLOOR + 0.74;
        sink.span('structureWood', x - 0.4, y, zc - L / 2, x + 0.4, y + 0.045, zc + L / 2, { colour: board, decor: true, shadow: true });
        for (const dz of [-1, 1]) for (const dx of [-1, 1]) {
          sink.member('structureWood', [x + dx * 0.38, FLOOR, zc + dz * (L / 2 - 0.2)], [x + dx * 0.2, y, zc + dz * (L / 2 - 0.2)], 0.05, 0.05, [0, 0, 1],
            { colour: leg, decor: true, exposed: true }, 0);
        }
        // the produce in heaps along the boards
        for (let k = 0, m = 4 + Math.floor(look() * 3); k < m; k++) {
          const zz = zc - L / 2 + 0.3 + (L - 0.6) * k / Math.max(1, m - 1), c = spec.produce[Math.floor(look() * spec.produce.length)];
          sink.cylinder('structureWood', [x + (look() - 0.5) * 0.3, y + 0.045, zz], 'y', 0.12, 0.17, 7, { colour: shade(c, 0.85 + look() * 0.25), decor: true }, 0.07);
        }
        // a willow basket and a slatted crate on the setts beside the table
        const bz = zc + (look() < 0.5 ? -1 : 1) * (L / 2 + 0.35);
        sink.cylinder('structureWood', [x, FLOOR, bz], 'y', 0.34, 0.24, 9, { colour: shade(willow, 0.9 + look() * 0.2), decor: true }, 0.28, false);
        sink.cylinder('structureWood', [x, FLOOR, bz], 'y', 0.02, 0.2, 9, { colour: shade(willow, 0.7), decor: true }, 0.2, true);
        const cx = x - sx * 0.62;
        for (let s = 0; s < 3; s++) sink.span('structureWood', cx - 0.26, FLOOR + 0.02 + s * 0.11, bz - 0.2, cx + 0.26, FLOOR + 0.09 + s * 0.11, bz + 0.2, { colour: shade(board, 0.78 + s * 0.06), decor: true });
        for (const dx of [-1, 1]) sink.span('structureWood', cx + dx * 0.25 - 0.02, FLOOR, bz - 0.2, cx + dx * 0.25 + 0.02, FLOOR + 0.34, bz + 0.2, { colour: shade(board, 0.7), decor: true });
      }
      // sacks against a post
      for (let k = 0; k < 2; k++) sink.cylinder('structureWood', [-px + 0.45 + k * 0.5, FLOOR, zc + 0.6], 'y', 0.5, 0.22, 7, { colour: shade(sack, 0.9 + look() * 0.15), decor: true }, 0.16);
    }
    // the beam scale hung from a tie beam: its hook and chains, the beam, the two pans
    if (opts.scaleZ !== null) {
      const z = opts.scaleZ ?? 0, top = spec.H + 0.22, y = FLOOR + 1.45;
      sink.member('structureMetal', [0.3, top, z], [0.3, y + 0.12, z], 0.015, 0.015, [1, 0, 0], { colour: [0.22, 0.22, 0.22], decor: true, exposed: true, fine: true }, 0);
      sink.span('structureMetal', -0.15, y + 0.1, z - 0.02, 0.75, y + 0.14, z + 0.02, { colour: [0.25, 0.24, 0.22], decor: true, fine: true });
      for (const x of [-0.12, 0.72]) {
        sink.member('structureMetal', [x, y + 0.1, z], [x, y - 0.32, z], 0.01, 0.01, [1, 0, 0], { colour: [0.22, 0.22, 0.22], decor: true, exposed: true, fine: true }, 0);
        sink.cylinder('structureMetal', [x, y - 0.36, z], 'y', 0.04, 0.17, 10, { colour: [0.5, 0.4, 0.26], decor: true, fine: true }, 0.12);
      }
    }
  });
}
