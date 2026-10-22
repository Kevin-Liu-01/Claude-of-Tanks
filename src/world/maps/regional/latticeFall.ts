// src/world/maps/regional/latticeFall.ts — how an open lattice comes down (props census #3, lane B 2026-10-14; the
// judges on the kit trestles, windmills, elevated tanks and radar towers: they "fall as solid metal drums 4.8 m across
// over a solid stump, not as their members").
//
// A lattice frame (lattice.ts latticeFrame, read back by damage.ts describeLattice) has no wall a round can hole: a
// blow passes through it. When it falls it folds over along the line it was struck from: each leg's foot stays a bent
// stub on its pad, the legs lie along the ground in the direction of the fall, the girts and braces lie scattered
// along them, and what stood on it (a tank, a wheel head, a radome) lies crumpled at the far end over a little scatter.
import {
  bodyMoundHeightAt, damageRng, registerStructureDamageKit,
  type DamageMeshWriter, type DamagePieceWriter, type DamageStageResult, type Rgb, type StructureDamageAnatomy, type StructureDescribeInput, type Vec3,
} from '../../destructionKit.ts';
import { describeDefault } from '../../destructionDefaultKit.ts';
import { HEAP_LIFT_M, Mesh, beamBetween, bodyCentre, domeMound, throwPieceAt, type MoundHeight } from './fracture.ts';
import { latticeReadingOfParts, type LatticeReading } from './lattice.ts';
import { lyingDrum } from './shaft.ts';
import { collapseShed } from './shedFall.ts';
import { collapsePenstock } from './penstockFall.ts';

type Writers = { mesh: DamageMeshWriter; pieces: DamagePieceWriter };
type P3 = [number, number, number];

/** The end of a beamBetween(a, b) box at `b` (its cross-section as beamBetween lays it), facing out along a -> b. */
function beamCap(mesh: Mesh, a: Vec3, b: Vec3, w: number, t: number, upHint: Vec3, tint: Rgb, shade: number): void {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2], l = Math.hypot(dx, dy, dz);
  if (!(l > 1e-6)) return;
  const ax: Vec3 = [dx / l, dy / l, dz / l];
  const cr = (p: Vec3, q: Vec3): Vec3 => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
  const nz = (v: Vec3): Vec3 => { const k = Math.hypot(v[0], v[1], v[2]); return [v[0] / k, v[1] / k, v[2] / k]; };
  let side = cr(ax, upHint);
  if (!(Math.hypot(side[0], side[1], side[2]) >= 0.5)) side = cr(ax, [1, 0, 0]);
  side = nz(side);
  const up = nz(cr(side, ax));
  const hw = w / 2, ht = t / 2;
  const P = (s: number, u: number): Vec3 => [b[0] + side[0] * s + up[0] * u, b[1] + side[1] * s + up[1] * u, b[2] + side[2] * s + up[2] * u];
  mesh.quadUvAlong(P(-hw, -ht), P(hw, -ht), P(hw, ht), P(-hw, ht), ax, w, [tint[0] * shade, tint[1] * shade, tint[2] * shade]);
}

export function latticeOf(anatomy: StructureDamageAnatomy): LatticeReading | null {
  const k = anatomy.kitPlan as { damage?: { lattice?: LatticeReading } } | undefined;
  return k?.damage?.lattice ?? null;
}

/** An open frame takes no hole and no spall: the blow passes through between its members. */
export function noLatticeDamage(): DamageStageResult {
  return { cuts: [], hides: [] };
}

/** The share of a frame's height its standing bays reach: the anti-raft floor's (25 % of the intact) with margin. */
export const LATTICE_STAND_SHARE = 0.5;

/**
 * Where a struck frame buckles: the girt nearest LATTICE_STAND_SHARE of its height (never under 1.5 m, never past 55 %),
 * the height over the frame's foot.
 */
export function latticeBuckle(lat: LatticeReading): number {
  const y0 = Math.min(...lat.legs.map((l) => l.foot[1]));
  const height = Math.max(...lat.legs.map((l) => l.head[1] - l.foot[1]));
  // (a column, one leg, stands to 80 %: a water tower's shaft standing when its tank comes off; so do a low shelter's posts,
  // under five metres, snapped under their plates as the roof comes down on them; a frame may name its own)
  const share = lat.stand ?? (lat.legs.length === 1 || height < 5 ? 0.8 : LATTICE_STAND_SHARE);
  const want = y0 + height * share;
  let best = want;
  for (const g of lat.girts) if (Math.abs(g - want) < Math.abs(best - want) || best === want) best = g;
  return Math.max(y0 + Math.min(1.5, height * 0.5), Math.min(best, y0 + height * Math.max(0.55, share + 0.05)));
}

/**
 * The frame buckled over its standing bays (lane B, 2026-10-16, for 227; the anti-raft floor, after the ruin pass
 * stopped standing masonry piers on frames: afa3babd3; the way navajoFall.ts brings the Navajo windmill down). A struck
 * tower of angle legs gives at a girt: its lower bays stand with their girts and X braces (latticeBuckle: about 40 % of its
 * height), the legs' heads bent over toward the fall, a rod of the top bay snapped; the frame above folds over from
 * there, each leg down from its stub's head to the ground along the fall and kinked where it struck, the frame
 * narrowing to its head as it stood; the upper girts and braces lie among the legs; what stood on it lies crumpled at
 * the fold's end. In the frame's own bucket and tint; no masonry.
 */
export function collapseLattice(anatomy: StructureDamageAnatomy, seed: number, out: Writers, mound: MoundHeight): DamageStageResult {
  const lat = latticeOf(anatomy);
  if (!lat) return { cuts: [], hides: [{ section: null, partClass: null }] };
  if (lat.shed) return collapseShed(anatomy, lat.shed, seed, out, mound);
  if (lat.penstock) {
    // (the concrete in the run's own weathered tint: the kit's plan, when the anatomy carries it)
    const tints = (anatomy.kitPlan as { regional?: { tints?: Record<string, Rgb> } } | undefined)?.regional?.tints;
    return collapsePenstock(lat.penstock, seed, out, mound, tints?.[lat.penstock.concrete.tintKey] ?? null);
  }
  const rng = damageRng(seed);
  const mesh = new Mesh(out.mesh);
  const given = (out as Writers & { fallAxis?: [number, number] }).fallAxis;
  const gl = given ? Math.hypot(given[0], given[1]) : 0;
  const ang = rng() * Math.PI * 2;
  const axis: Vec3 = given && gl > 1e-3 ? [given[0] / gl, 0, given[1] / gl] : [Math.cos(ang), 0, Math.sin(ang)];
  const side: Vec3 = [-axis[2], 0, axis[0]];
  const ground = (x: number, z: number): number => mound(x, z) + HEAP_LIFT_M * Math.max(0, Math.min(1, (mound(x, z) - 0.12) / 0.5));
  // (a frame in a weathered bucket, a bin tower's render: the kit's own tint for it, from the plan the anatomy carries)
  const kitTints = (anatomy.kitPlan as { regional?: { tints?: Record<string, Rgb> } } | undefined)?.regional?.tints;
  const regional = /^regional(.)(.*)$/.exec(lat.bucket), tintKey = regional ? regional[1].toLowerCase() + regional[2] : '';
  const tint: Rgb = lat.colour ?? (tintKey ? kitTints?.[tintKey] : undefined) ?? [0.6, 0.6, 0.6];
  const dull: Rgb = [tint[0] * 0.9, tint[1] * 0.9, tint[2] * 0.9];
  const s = lat.size;
  const legs = lat.legs, y0 = Math.min(...legs.map((l) => l.foot[1]));
  const height = Math.max(...legs.map((l) => l.head[1] - l.foot[1]));
  const [bx, bz] = bodyCentre(anatomy);
  const cx = legs.length ? legs.reduce((a, l) => a + l.foot[0], 0) / legs.length : bx;
  const cz = legs.length ? legs.reduce((a, l) => a + l.foot[2], 0) / legs.length : bz;
  const stand = latticeBuckle(lat);
  const along = (l: { foot: Vec3; head: Vec3 }, y: number): Vec3 => {
    const t = (y - l.foot[1]) / Math.max(1e-6, l.head[1] - l.foot[1]);
    return [l.foot[0] + (l.head[0] - l.foot[0]) * t, y, l.foot[2] + (l.head[2] - l.foot[2]) * t];
  };
  // the buckle: each stub's head bent over toward the fall, the legs on the fall's side crushed a little lower
  const tops: Vec3[] = legs.map((l) => {
    const p = along(l, stand), lean = 0.15 + rng() * 0.2, lead = (p[0] - cx) * axis[0] + (p[2] - cz) * axis[2] > 0 ? 0.15 + rng() * 0.2 : 0;
    return [p[0] + axis[0] * lean, p[1] - lead, p[2] + axis[2] * lean];
  });
  const onStub = (k: number, y: number): Vec3 => {
    const f = legs[k].foot, t = tops[k], u = (y - f[1]) / Math.max(1e-6, t[1] - f[1]);
    return [f[0] + (t[0] - f[0]) * u, y, f[2] + (t[2] - f[2]) * u];
  };
  // the standing bays: the stubs, the girts under the buckle, each bay's X braces (the legs go round the frame in their
  // laid order: latticeFrame's corners)
  const n = legs.length;
  // (a column, one leg: its stub alone; a frame of two or more legs, its bays)
  // (destruction-slabs 227 round 4; steppe #4, tselina's gantry: its rendered tower read as one leg 4.4 m across, its stub
  // an open tube and its upper length folded as one, a 5 x 4 m side of it standing 2.7 m up on nothing) a column as broad
  // as a wall is no angle leg: its stub capped, its upper length a closed block lying on the ground along the fall
  const solid = n === 1 && s > 1;
  if (n >= 1 && mesh.begin(lat.bucket, 'remnant')) {
    legs.forEach((l, k) => beamBetween(mesh, l.foot, tops[k], s, s, [0, 1, 0], tint));
    if (solid) beamCap(mesh, legs[0].foot, tops[0], s, s, [0, 1, 0], tint, 0.9);
    const low = Math.min(...tops.map((t) => t[1])) - 0.1;
    const levels = [y0 + 0.3, ...lat.girts.filter((g) => g > y0 + 0.3 && g < low)];
    // (a face the frame leaves open, a portal's along its bridge, stands its posts alone: LatticeReading.faces)
    const braced = (k: number): boolean => lat.faces?.[k] !== false;
    for (let i = 1; i < levels.length && n >= 2; i++) for (let k = 0; k < n; k++) {
      if (braced(k)) beamBetween(mesh, onStub(k, levels[i]), onStub((k + 1) % n, levels[i]), s * 0.6, s * 0.6, [0, 1, 0], tint);
    }
    const bays = [...levels, low];
    for (let i = 0; i + 1 < bays.length && n >= 2; i++) for (let k = 0; k < n; k++) {
      if (!braced(k)) continue;
      const j = (k + 1) % n;
      beamBetween(mesh, onStub(k, bays[i]), onStub(j, bays[i + 1]), s * 0.4, s * 0.4, [0, 1, 0], dull);
      // (a brace of the top bay snapped at the buckle hangs short)
      if (i + 2 < bays.length || rng() < 0.5) beamBetween(mesh, onStub(j, bays[i]), onStub(k, bays[i + 1]), s * 0.4, s * 0.4, [0, 1, 0], dull);
    }
  }
  // the frame above the buckle folded over: each leg from its stub's head down along the fall, kinked where it struck
  const upper = height - (stand - y0);
  let reach = 0;
  if (solid && mesh.begin(lat.bucket, 'rubble')) {
    // the column's upper length on the ground beside its stump, broken in two where it struck, each a closed block
    const t = tops[0], half = s / 2, len = Math.max(s, upper * (0.85 + rng() * 0.1));
    const kink = (rng() - 0.5) * 0.3, d2: Vec3 = [axis[0] * Math.cos(kink) - axis[2] * Math.sin(kink), 0, axis[0] * Math.sin(kink) + axis[2] * Math.cos(kink)];
    const a: P3 = [t[0] + axis[0] * (s * 0.75 + 0.3), 0, t[2] + axis[2] * (s * 0.75 + 0.3)];
    const m: P3 = [a[0] + axis[0] * len * 0.5, 0, a[2] + axis[2] * len * 0.5];
    const e: P3 = [m[0] + d2[0] * len * 0.5, 0, m[2] + d2[2] * len * 0.5];
    for (const p of [a, m, e]) p[1] = ground(p[0], p[2]) + half * 0.9;
    beamBetween(mesh, a, m, s, s * 0.9, [0, 1, 0], tint);
    beamCap(mesh, m, a, s, s * 0.9, [0, 1, 0], dull, 0.75);
    beamCap(mesh, a, m, s, s * 0.9, [0, 1, 0], dull, 0.75);
    beamBetween(mesh, m, e, s, s * 0.9, [0, 1, 0], tint);
    beamCap(mesh, e, m, s, s * 0.9, [0, 1, 0], dull, 0.75);
    beamCap(mesh, m, e, s, s * 0.9, [0, 1, 0], dull, 0.75);
    reach = (e[0] - cx) * axis[0] + (e[2] - cz) * axis[2];
  } else if (mesh.begin(lat.bucket, 'rubble')) {
    for (const t of tops) {
      const drop = t[1] - ground(t[0], t[2]), run = Math.sqrt(Math.max(0.25, upper * upper * (0.9 + rng() * 0.08) - drop * drop));
      const yaw = (rng() - 0.5) * 0.25, d: Vec3 = [axis[0] * Math.cos(yaw) - axis[2] * Math.sin(yaw), 0, axis[0] * Math.sin(yaw) + axis[2] * Math.cos(yaw)];
      const lateral = (t[0] - cx) * side[0] + (t[2] - cz) * side[2];
      const e: P3 = [t[0] + d[0] * run - side[0] * lateral * 0.6, 0, t[2] + d[2] * run - side[2] * lateral * 0.6];
      e[1] = ground(e[0], e[2]) + s / 2;
      const m: P3 = [t[0] + (e[0] - t[0]) * 0.45, 0, t[2] + (e[2] - t[2]) * 0.45];
      m[1] = Math.max(ground(m[0], m[2]) + s / 2, t[1] * 0.55 + e[1] * 0.45 - 0.25 - rng() * 0.3);
      beamBetween(mesh, t, m, s, s, [0, 1, 0], tint);
      beamBetween(mesh, m, e, s, s, [0, 1, 0], tint);
      reach = Math.max(reach, (e[0] - cx) * axis[0] + (e[2] - cz) * axis[2]);
    }
    // the upper girts and braces among the folded legs, some across them
    const members = Math.min(14, 4 + lat.girts.length * 2);
    for (let k = 0; k < members; k++) {
      const t = 0.2 + rng() * 0.75, off = (rng() - 0.5) * 2.4, len = 0.8 + rng() * 1.8, yaw = rng() * Math.PI;
      const c: Vec3 = [cx + axis[0] * reach * t + side[0] * off, 0, cz + axis[2] * reach * t + side[2] * off];
      const lift = (stand - y0) * Math.max(0, 1 - t * 1.6) * rng();
      const p0: Vec3 = [c[0] - Math.cos(yaw) * len / 2, 0, c[2] - Math.sin(yaw) * len / 2], p1: Vec3 = [c[0] + Math.cos(yaw) * len / 2, 0, c[2] + Math.sin(yaw) * len / 2];
      beamBetween(mesh, [p0[0], ground(p0[0], p0[2]) + s * 0.3 + lift, p0[2]], [p1[0], ground(p1[0], p1[2]) + s * 0.3, p1[2]], s * 0.45, s * 0.45, [0, 1, 0], dull);
    }
  }
  // the crown at the far end, crumpled flat on its side
  const crown = lat.crown;
  if (crown && mesh.begin(crown.bucket, 'rubble')) {
    const w = crown.x1 - crown.x0, d = crown.z1 - crown.z0, h = crown.y1 - crown.y0;
    if (Math.max(w, d) > 3 * Math.min(w, d)) {
      // a girder (a portal crane's bridge) comes down with its legs, still along its own length, turned a little and broken
      // where it struck: its two lengths on the ground beyond the folded legs
      const len = Math.max(w, d), along: Vec3 = w > d ? [1, 0, 0] : [0, 0, 1], turn = (rng() - 0.5) * 0.2;
      const u: Vec3 = [along[0] * Math.cos(turn) - along[2] * Math.sin(turn), 0, along[0] * Math.sin(turn) + along[2] * Math.cos(turn)];
      const off = Math.max(reach, upper * 0.9) * 0.9;
      const mx = (crown.x0 + crown.x1) / 2 + axis[0] * off, mz = (crown.z0 + crown.z1) / 2 + axis[2] * off, sag = (rng() - 0.5) * len * 0.15;
      const half = Math.min(w, d) / 2, t = h * 0.5;
      const p0: Vec3 = [mx - u[0] * len / 2, 0, mz - u[2] * len / 2], p1: Vec3 = [mx + u[0] * sag + axis[0] * 0.4, 0, mz + u[2] * sag + axis[2] * 0.4];
      const p2: Vec3 = [mx + u[0] * len / 2, 0, mz + u[2] * len / 2];
      for (const p of [p0, p1, p2]) (p as P3)[1] = ground(p[0], p[2]) + t;
      beamBetween(mesh, p0, p1, half * 2, h, [0, 1, 0], crown.tint);
      beamBetween(mesh, p1, p2, half * 2, h, [0, 1, 0], crown.tint);
      mesh.end();
      return throwAndHide(out, rng, lat, cx, cz, axis, reach, stand, tint);
    }
    const at = Math.max(reach, upper * 0.9) + Math.max(w, d) * 0.4;
    const c: Vec3 = [cx + axis[0] * at, 0, cz + axis[2] * at];
    // a drum on its side along the fall, flattened where it struck (shaft.ts lyingDrum: chamfered, its ends ragged)
    const r = Math.max(w, d) * 0.45, flat = r * (0.55 + rng() * 0.2);
    lyingDrum(mesh, [c[0], ground(c[0], c[2]) + flat * 0.9, c[2]], axis, h * 0.5, r, flat, (rng() - 0.5) * 0.6, crown.tint, rng);
  }
  mesh.end();
  return throwAndHide(out, rng, lat, cx, cz, axis, reach, stand, tint);
}

/** The throw (rods, plates and bolts down the line of the fall) and the frame's hide. */
function throwAndHide(out: Writers, rng: () => number, lat: LatticeReading, cx: number, cz: number, axis: Vec3, reach: number, stand: number,
  tint: Rgb): DamageStageResult {
  for (let i = 0; i < out.pieces.capacity; i++) {
    const t = rng();
    const p: Vec3 = [cx + axis[0] * reach * t + (rng() - 0.5) * 1.5, 0.5 + (1 - t) * stand * 0.5, cz + axis[2] * reach * t + (rng() - 0.5) * 1.5];
    if (!throwPieceAt(out.pieces, rng, lat.bucket, rng() < 0.7 ? 'beam' : 'sheet', p, [0.05 + rng() * 0.05, 0.05, 0.4 + rng() * 0.8], tint, 3)) break;
  }
  return { cuts: [], hides: [{ section: null, partClass: null }] };
}

/**
 * The damage kit of a frame a builder outside the regional kits laid and carried on its parts (lattice.ts
 * tagLatticeReading: the catalog gantry), under its builder's name: the default's reading of it with the frame as its
 * plan; a blow passes through it (no hole, no spall); it falls as its lattice (collapseLattice), its lower bays standing.
 * A build a kit already reads (its own plan: a regional gantry) is left to that kit.
 */
export function registerLatticeFrameKit(builder: string): void {
  registerStructureDamageKit({
    id: builder,
    describe(input: StructureDescribeInput): StructureDamageAnatomy | null {
      if (input.kitPlan) return null;
      const lattice = latticeReadingOfParts(input.parts as Parameters<typeof latticeReadingOfParts>[0]);
      if (!lattice) return null;
      const anatomy = describeDefault(input);
      return { ...anatomy, kit: builder, kitPlan: { damage: { kind: 'lattice-frame', lattice } } };
    },
    damaged: () => noLatticeDamage(),
    breach: () => noLatticeDamage(),
    collapse: (anatomy, seed, out) => collapseLattice(anatomy, seed, out,
      anatomy.mound ? (x: number, z: number) => bodyMoundHeightAt(anatomy, x, z) : domeMound(anatomy)),
    sectionDown: () => noLatticeDamage(),
    storeyDown: () => noLatticeDamage(),
  });
}
