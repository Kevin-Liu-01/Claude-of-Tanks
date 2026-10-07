// src/world/karstRelief.ts — the limestone in relief over a karst map's flush pavement (the scenery lane, b23).
//
// The ground lane draws Saltwind's limestone pavement flush with the ground: clints between two joint sets, deep grikes,
// the sward in the grikes alone, where the soil is thin (terrain.ts karstCoverAt, the height field's _karstCoverAt, the
// pavement's patch weight 0..1). This is the stone that stands proud of it, in three families by that weight:
//
//   - the bosses and the tilted blocks (cover over 0.5): the bedrock's own rounded slabs, long along the master joints (the
//     field grid's heading), their tops following the bedding and tipped a few degrees their own way, their sides fluted
//     by the rain (rundkarren). (b27; gauntlet wave 177 on b23's: "long tan slabs with thick edges, warmer than the
//     pavement"; the coordinator: "buried and tone-matched") 0.12 to 0.38 m proud, their sides sloping down into the
//     ground over a hand and more (no edge standing up out of the turf), and the formations' own stone in the pavement's
//     pale grey (sceneryRocks.ts finishKarstStone: the scenery rock material; the terrain's material on a raised form
//     drew its beach and its rock layer, tan);
//   - the loose blocks (cover 0.15 to 0.5, the patch's edge, where the soil gains on the slabs): angular stones lying in
//     twos to fives, sunk a third, the same stone.
//
// (The third family, the clearance heaps — gromače, where the cover is thin — follows in a batch of its own: they are
// collision, and their form wants its own round.) Neither family is collision: a block a tank drives over is no wall.
//
// The keep-outs are the scenery lane's own (the material gates the pavement the same way): the roads and their
// shoulders, the village, the water, the marsh and the shore, the rock layer's faces (steep ground), and whatever the
// caller has placed (`blocked`). The cover is read with the fold at 0: the node world that captures the collision
// shards builds no terrain mesh and so bakes no fold, and with it at 0 the cover is never above the material's (its
// crest term only adds), so a boss never stands where the pavement does not. A stream of its own, so every other
// placement keeps its seat. A height field without the hook (every map but a walled karst) builds nothing.
import * as THREE from 'three';
import type { SimplexNoise } from '../engine/simplexFast.ts';
import type { LandFieldSample } from './landUse.ts';
import { fieldStone } from './maps/fieldWallDressing.ts';
import { finishKarstStone } from './sceneryRocks.ts';

type Rng = () => number;

/** What the relief reads of the ground (terrain.ts HeightField). */
export interface KarstGround {
  getHeightAt(x: number, z: number): number;
  getNormalAt(x: number, z: number): { y: number };
  getWaterMaskAt(x: number, z: number): number;
  _roadDist(x: number, z: number): number;
  _villageMask(x: number, z: number): number;
  _waterWetnessAt?: (x: number, z: number) => number;
  _landUseAt?(x: number, z: number, out: LandFieldSample): LandFieldSample;
  _karstCoverAt?(x: number, z: number, normalY: number, fold: number, field: LandFieldSample): number;
  _foldAt?(x: number, z: number): number;
}

interface KarstReliefOptions {
  seed: number;
  /** The formations' shared noise (their tone's mottle). */
  noise: SimplexNoise;
  /** The field grid's heading (landUse.ts LandUseProfile heading): the master joints run along it. */
  heading: number;
  /** True where something placed before stands within r of (x, z). */
  blocked(x: number, z: number, r: number): boolean;
  /** A phone builds the loose stones but no bosses (no ground mesh of their kind on a phone: the beds are desktop's). */
  mobile?: boolean;
}

interface KarstRelief {
  /** The bosses and the loose blocks, finished as the formations' stone (world space: position, normal, colour,
   *  aRockGround, uv) for the scenery rock material; null where none stands. */
  stone: THREE.BufferGeometry | null;
  /** Each piece of it in order (its triangles a run of the stone's), for the receipts: a boss or a block, its seat and
   *  its triangles, a boss's height proud. */
  parts: Array<{ kind: 'boss' | 'block'; x: number; z: number; triangles: number; proud?: number }>;
  counts: { bosses: number; blocks: number; candidates: number };
}

/** (b27) The karst stone's tone (HSL): the pavement's pale grey, a little warm (the formations' limestone is cream). */
export const KARST_STONE_TONE: readonly [number, number, number] = [0.1, 0.035, 0.6];

/** The candidates' lattice (m) and the square they cover. */
const KARST_CELL_M = 5;
const KARST_EXTENT_M = 468;
/** The cover bands: a boss over BOSS, loose blocks between BLOCKS[0] and BLOCKS[1]. */
export const KARST_COVER = Object.freeze({ boss: 0.5, blocks: [0.15, 0.5] as const });
/** The keep-outs: metres from a road's centre line (its core and shoulder), the village mask, the water's wetness, the
 * terrain normal's least y (the rock layer's faces start steeper). */
export const KARST_KEEP = Object.freeze({ roadM: 9.5, village: 0.02, wet: 0.05, normalY: 0.85 });
/** A boss's height proud of the ground (m) and its plan (the long side, m). */
export const KARST_BOSS_PROUD: readonly [number, number] = [0.12, 0.38];
const KARST_BOSS_LONG: readonly [number, number] = [0.8, 2.2];
/** How far a boss's foot is sunk under the ground (m): the ground covers the seam. */
export const KARST_BOSS_SINK_M = 0.18;
/** The plan's segments round a boss. */
const BOSS_SEGS = 16;
/** At most this many of each (a karst map's whole square). */
const KARST_MAX = Object.freeze({ bosses: 700, clusters: 400 });

function mulberry32(a: number): Rng {
  return () => {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * The boss's plan: a superellipse `long` by `wide` (exponent p, 4 a rounded block .. 9 near square-cornered), cut flat
 * by the joints that bound it (`cuts`: [angle, distance as a share of the radius there], the joints run along and
 * square to the long side, each a few degrees off), and broken by two slow harmonics so no two read alike; the radius at
 * angle a (local frame: u along the long side).
 */
function planRadius(a: number, long: number, wide: number, p: number, h: readonly number[], cuts: readonly number[]): number {
  const c = Math.abs(Math.cos(a)) / long, s = Math.abs(Math.sin(a)) / wide;
  let r = 1 / Math.pow(Math.pow(c, p) + Math.pow(s, p), 1 / p);
  r *= 1 + h[0] * Math.sin(2 * a + h[1]) + h[2] * Math.sin(3 * a + h[3]);
  for (let i = 0; i < cuts.length; i += 2) {
    const along = Math.cos(a - cuts[i]);
    if (along > 1e-3) r = Math.min(r, cuts[i + 1] / along);
  }
  return r;
}

/**
 * One boss in world space at (cx, cz): its rings from the sunk foot up the fluted side to the shoulder and the domed
 * top, every height on the ground under it (the top follows the bedding, the ground's own slope) plus the tilt along
 * its short axis. (b27) Its side slopes down into the ground: the foot ring sunk a fifth wider than the shoulder, so no
 * edge stands up out of the turf. Its own indexed geometry.
 */
function bossGeometry(ground: KarstGround, cx: number, cz: number, yaw: number, long: number, wide: number, proud: number,
  tilt: number, p: number, harm: readonly number[], cuts: readonly number[], pan: number): THREE.BufferGeometry {
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  // [scale of the plan, height share of the boss's proud, the flutes' share]: the sunk foot well out, the side sloping
  // up to the shoulder, the shoulder rounded, the top's edge (the top's centre is the fan's apex, a solution pan on some)
  const rings: ReadonlyArray<readonly [number, number, number]> = [[1.22, -1, 0], [1.07, 0.42, 0.025], [0.93, 0.86, 0.015], [0.62, 1.0, 0]];
  const pos: number[] = [], index: number[] = [];
  for (const [scale, rise, flute] of rings) {
    for (let k = 0; k < BOSS_SEGS; k++) {
      const a = (k / BOSS_SEGS) * Math.PI * 2;
      const r = planRadius(a, long, wide, p, harm, cuts) * scale * (1 + flute * Math.cos(BOSS_SEGS / 2 * a));
      const lu = Math.cos(a) * r, lv = Math.sin(a) * r;
      const x = cx + lu * cy - lv * sy, z = cz + lu * sy + lv * cy;
      const g = ground.getHeightAt(x, z);
      // (the tilt: the block tipped about its long axis, its v side up)
      const y = rise < 0 ? g - KARST_BOSS_SINK_M : g + proud * rise + tilt * lv * Math.min(1, rise);
      pos.push(x, y, z);
    }
  }
  const apex = pos.length / 3;
  pos.push(cx, ground.getHeightAt(cx, cz) + proud * (1.04 - pan), cz);
  for (let ring = 0; ring < rings.length - 1; ring++) {
    for (let k = 0; k < BOSS_SEGS; k++) {
      const a = ring * BOSS_SEGS + k, b = ring * BOSS_SEGS + (k + 1) % BOSS_SEGS;
      const c = a + BOSS_SEGS, d = b + BOSS_SEGS;
      index.push(a, c, b, b, c, d);
    }
  }
  const top = (rings.length - 1) * BOSS_SEGS;
  for (let k = 0; k < BOSS_SEGS; k++) index.push(top + k, apex, top + (k + 1) % BOSS_SEGS);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setIndex(index);
  return geometry;
}

/** The relief of one karst map, or null without the hook. A generator: it yields every so many candidates. */
export function* buildKarstRelief(ground: KarstGround, o: KarstReliefOptions): Generator<undefined, KarstRelief | null, void> {
  const coverAt = ground._karstCoverAt, landAt = ground._landUseAt;
  if (!coverAt || !landAt) return null;
  const r = mulberry32((o.seed ^ 0x6b5a7) >>> 0);
  const field = {} as LandFieldSample;
  const pieces: THREE.BufferGeometry[] = [];
  const parts: KarstRelief['parts'] = [];
  const counts = { bosses: 0, blocks: 0, candidates: 0 };
  let clusters = 0;
  const kept = (x: number, z: number, ny = ground.getNormalAt(x, z).y): boolean =>
    ny >= KARST_KEEP.normalY && ground._roadDist(x, z) >= KARST_KEEP.roadM && ground._villageMask(x, z) <= KARST_KEEP.village
    && ground.getWaterMaskAt(x, z) <= 0 && (!ground._waterWetnessAt || ground._waterWetnessAt(x, z) <= KARST_KEEP.wet);
  const cells = Math.floor((KARST_EXTENT_M * 2) / KARST_CELL_M);
  for (let j = 0; j < cells; j++) {
    for (let i = 0; i < cells; i++) {
      // every cell draws the same five numbers whatever it holds, so one cell's verdict never moves another's seat
      const jx = r(), jz = r(), pick = r(), sizeR = r(), shapeR = r();
      const x = -KARST_EXTENT_M + (i + jx) * KARST_CELL_M, z = -KARST_EXTENT_M + (j + jz) * KARST_CELL_M;
      counts.candidates++;
      const ny = ground.getNormalAt(x, z).y;
      if (!kept(x, z, ny)) continue;
      landAt(x, z, field);
      const cover = coverAt(x, z, ny, 0, field);
      if (cover > KARST_COVER.boss) {
        if (o.mobile || counts.bosses >= KARST_MAX.bosses) continue;
        // a boss in about one cell in six where the pavement is whole, fewer toward its edge
        if (pick > 0.16 * smooth(KARST_COVER.boss, 0.85, cover)) continue;
        const local = mulberry32(Math.floor(shapeR * 4294967296) ^ (i * 73856093) ^ (j * 19349663));
        const long = KARST_BOSS_LONG[0] + (KARST_BOSS_LONG[1] - KARST_BOSS_LONG[0]) * Math.pow(sizeR, 1.4);
        const wide = long * (0.42 + local() * 0.36);
        // long along the master joints, or (one in three) along the cross joints, a few degrees off either
        const yaw = o.heading + (local() - 0.5) * 0.3 + (local() < 0.3 ? Math.PI / 2 : 0);
        const ex = Math.cos(yaw) * long, ez = Math.sin(yaw) * long;
        if (o.blocked(x, z, long * 1.1) || !kept(x + ex, z + ez) || !kept(x - ex, z - ez)) continue;
        const proud = KARST_BOSS_PROUD[0] + (KARST_BOSS_PROUD[1] - KARST_BOSS_PROUD[0]) * smooth(0.5, 0.95, cover) * (0.45 + 0.55 * local());
        const tilt = (local() - 0.5) * 2 * Math.min(0.22, proud / wide * 0.5);
        const p = 4 + local() * 5;
        const harm = [0.03 + local() * 0.04, local() * 6.28, 0.02 + local() * 0.03, local() * 6.28];
        // one or two joints cut a side flat (along the long side or square to it, a few degrees off), a quarter to a
        // third of the way in; a solution pan in the top of one in three
        const cuts: number[] = [];
        for (let c = local() < 0.55 ? 2 : 1; c > 0; c--) {
          const side = Math.floor(local() * 4) * (Math.PI / 2) + (local() - 0.5) * 0.12;
          const reachThere = Math.abs(Math.cos(side)) * long + Math.abs(Math.sin(side)) * wide;
          cuts.push(side, reachThere * (0.68 + local() * 0.1));
        }
        const pan = local() < 0.33 ? 0.06 + local() * 0.08 : 0;
        pieces.push(bossGeometry(ground, x, z, yaw, long, wide, proud, tilt, p, harm, cuts, pan));
        parts.push({ kind: 'boss', x, z, triangles: pieces[pieces.length - 1].index!.count / 3, proud });
        counts.bosses++;
      } else if (cover > KARST_COVER.blocks[0]) {
        if (clusters >= KARST_MAX.clusters || pick > 0.12) continue;
        if (o.blocked(x, z, 1.4)) continue;
        const local = mulberry32(Math.floor(shapeR * 4294967296) ^ (i * 83492791) ^ (j * 2654435761));
        const n = 2 + Math.floor(local() * 4);
        for (let k = 0; k < n; k++) {
          const a = local() * Math.PI * 2, rr = Math.sqrt(local()) * 1.2;
          const px = x + Math.cos(a) * rr, pz = z + Math.sin(a) * rr;
          const size = 0.15 + Math.pow(local(), 1.5) * 0.3;
          const stone = fieldStone(size * (1.1 + local() * 0.7), size * (0.5 + local() * 0.4), size * (0.75 + local() * 0.4), local, 0.36, 1.2);
          stone.rotateZ((local() - 0.5) * 0.5); stone.rotateX((local() - 0.5) * 0.4); stone.rotateY(local() * Math.PI);
          pieces.push(stone.translate(px, ground.getHeightAt(px, pz) - size * 0.3, pz));
          parts.push({ kind: 'block', x: px, z: pz, triangles: stone.index!.count / 3 });
          counts.blocks++;
        }
        clusters++;
      }
    }
    if (j & 1) yield; // (every other row: a slice of a few milliseconds at the loading screen)
  }
  // (the formations' finish: their colour, their ground and their normals split at the cleavage angle)
  const stone = finishKarstStone(pieces, ground, o.noise, KARST_STONE_TONE, o.seed * 0.0013);
  return { stone, parts, counts };
}
