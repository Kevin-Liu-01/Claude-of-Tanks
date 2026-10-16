/**
 * mapCraters.ts — a map's pre-placed shell craters as real bowls (DST-04, destruction lane 2026-10-15; the coordinator's
 * ruling of 2026-10-14: "pre-placed craters as real bowls = authoritative terrain deformation"; the owner: "explosions
 * that should be destructive and leave holes and craters and stuff").
 *
 * The props build chooses the battlefield's old shell scars as it always did (props.ts tryPlaceBattleScar: the site, its
 * radius and its raised rim, from the props stream) and records them as sites instead of drawing a flat disc. The world
 * turns them into stamps once, at its build (world/map.ts, from the built world's own records); the collision shards
 * carry those stamps (`craters`, as they carry the canopies), so the authority plays exactly what every seat built. At a
 * match's start each lays the same bowls into the match's ground overlay (sim/terrainDeformation.ts) before anything
 * else stamps it — so the simulation's heights and contact surface, the drawn terrain (world/terrainCraterMesh.ts), the
 * ground cover, the world's rays and the presentation's running gear all meet one bowl — and the presentation lays each
 * crater's surface (fx/craterMarks.ts, an old crater's weathering).
 *
 * The law, per site (props' disc of radius r, its rim mound on the disc's 0.7 ring):
 * - the bowl: rim crest radius R = 0.7 r, depth 0.28 R (a weathered crater, shallower than a fresh one's 0.35 R), the rim
 *   the scar's own (0.26–0.48 m), its shape seed from its centre (destructionMatch.ts craterSeed's law);
 * - a mark (the surface on undug ground, no bowl): a site under the dig radius (CRATER_DEFORM_MIN_RADIUS_M, the lattice
 *   cannot carry it), on hard ground (a road edge, a square, a hardstand) or water, whose ground buckets are full, whose
 *   bowl would reach under any record but a tree (a building, a wall, a rock, a crate: nothing that stands on the ground
 *   may hang over a hole), and every site past MAP_CRATER_MAX.
 *
 * Every tier builds the same world (props.ts environmentRichness: layout identity); the stamps are decided once on the
 * built world's exact records and the authority reads the decided stamps from its shard (the drift receipt keeps the
 * shards equal to the build), so the bowls are identical everywhere. Pure, Node-runnable; allocation only when a world
 * builds its stamps or a match lays them.
 */
import { CRATER_DEFORM_MIN_RADIUS_M } from '../sim/munitionBlast.ts';
import type { TerrainDeformation, TerrainStamp } from '../sim/terrainDeformation.ts';

/** The props disc's rim ring (props.ts CONTACT_PATCH_RINGS[2]): the bowl's rim crest. */
export const MAP_CRATER_RIM_RING = 0.7;
/** A weathered crater's depth per rim radius. */
export const MAP_CRATER_DEPTH_PER_RADIUS = 0.28;
/** At most this many bowls a map (the presentation's crater slots; the rest are marks). */
export const MAP_CRATER_MAX = 160;
/** A record's plan box within this share of the rim radius keeps the ground whole there. */
const CLEAR_SHARE = 1.05;
const GRID_M = 32;

/** A recorded site, quantized: centre and disc radius to the centimetre, the rim to the millimetre. */
export function quantizeMapCraterSite(x: number, z: number, r: number, rim: number): [number, number, number, number] {
  return [Math.round(x * 100) / 100, Math.round(z * 100) / 100, Math.round(r * 100) / 100, Math.round(rim * 1000) / 1000];
}

/** A site as a match lays it. */
export interface MapCraterStamp {
  readonly x: number;
  readonly z: number;
  /** The rim crest radius (m). */
  readonly radiusM: number;
  readonly depthM: number;
  readonly rimM: number;
  readonly seed: number;
  /** True: a bowl in the ground; false: a mark on the undug ground. */
  readonly deforms: boolean;
}

/** destructionMatch.ts craterSeed's law (a 16-bit hash of the millimetre centre), without importing the match. */
export function mapCraterSeed(x: number, z: number): number {
  let hash = 0x811c9dc5;
  for (const value of [Math.round(x * 1000), Math.round(z * 1000)]) {
    hash ^= value & 0xffff; hash = Math.imul(hash, 0x01000193);
    hash ^= (value >>> 16) & 0xffff; hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) & 0xffff;
}

interface CraterRecord {
  readonly min: readonly number[];
  readonly max: readonly number[];
  readonly treeIdx?: number | null;
}

export interface MapCraterGround {
  /** The base ground's drive type (terrain.ts getGroundType). */
  getGroundType?(x: number, z: number): string;
  /** Water over the ground (terrain.ts getWaterMaskAt). */
  getWaterMaskAt?(x: number, z: number): number;
}

function boxReachesDisc(record: CraterRecord, x: number, z: number, radius: number): boolean {
  const dx = Math.max(record.min[0]! - x, 0, x - record.max[0]!);
  const dz = Math.max(record.min[2]! - z, 0, z - record.max[2]!);
  return dx * dx + dz * dz < radius * radius;
}

/**
 * The stamps a world lays for its `sites` (flat [x, z, r, rim] quadruples, the props build's), decided once on the built
 * world's own records (every record but a tree: its plan box) and its base ground.
 */
export function mapCraterStamps(sites: ArrayLike<number> | null | undefined, records: readonly CraterRecord[],
  ground: MapCraterGround | null): MapCraterStamp[] {
  const out: MapCraterStamp[] = [];
  if (!sites || sites.length < 4) return out;
  // the records by 32 m cell (each in every cell its plan box touches)
  const cells = new Map<number, CraterRecord[]>();
  const key = (cx: number, cz: number) => (cx + 1024) * 4096 + (cz + 1024);
  for (const record of records) {
    if (record.treeIdx != null) continue;
    for (let cz = Math.floor(record.min[2]! / GRID_M); cz <= Math.floor(record.max[2]! / GRID_M); cz++) {
      for (let cx = Math.floor(record.min[0]! / GRID_M); cx <= Math.floor(record.max[0]! / GRID_M); cx++) {
        const k = key(cx, cz);
        let list = cells.get(k);
        if (!list) cells.set(k, list = []);
        list.push(record);
      }
    }
  }
  let bowls = 0;
  for (let i = 0; i + 3 < sites.length; i += 4) {
    const [x, z, r, rim] = quantizeMapCraterSite(sites[i]!, sites[i + 1]!, sites[i + 2]!, sites[i + 3]!);
    if (!(r > 0)) continue;
    const radiusM = Math.round(r * MAP_CRATER_RIM_RING * 100) / 100;
    const depthM = Math.round(radiusM * MAP_CRATER_DEPTH_PER_RADIUS * 1000) / 1000;
    const rimM = Math.max(0, rim);
    let deforms = bowls < MAP_CRATER_MAX && radiusM >= CRATER_DEFORM_MIN_RADIUS_M
      && ground?.getGroundType?.(x, z) !== 'hard' && !((ground?.getWaterMaskAt?.(x, z) ?? 0) > 0.01);
    if (deforms) {
      const reach = radiusM * CLEAR_SHARE;
      search: for (let cz = Math.floor((z - reach) / GRID_M); cz <= Math.floor((z + reach) / GRID_M); cz++) {
        for (let cx = Math.floor((x - reach) / GRID_M); cx <= Math.floor((x + reach) / GRID_M); cx++) {
          for (const record of cells.get(key(cx, cz)) ?? []) {
            if (boxReachesDisc(record, x, z, reach)) { deforms = false; break search; }
          }
        }
      }
    }
    if (deforms) bowls++;
    out.push({ x, z, radiusM, depthM, rimM, seed: mapCraterSeed(x, z), deforms });
  }
  return out;
}

/** The stamps as a collision shard carries them: [x, z, radius, depth, rim, deforms 0|1]. */
export function packMapCraterStamps(stamps: readonly MapCraterStamp[]): Array<[number, number, number, number, number, number]> {
  return stamps.map((s) => [s.x, s.z, s.radiusM, s.depthM, s.rimM, s.deforms ? 1 : 0]);
}

/** A shard's stamps (the authority's), with their shape seeds. */
export function unpackMapCraterStamps(rows: ReadonlyArray<ArrayLike<number>> | null | undefined): MapCraterStamp[] {
  if (!rows) return [];
  return Array.from(rows, (row) => ({ x: row[0]!, z: row[1]!, radiusM: row[2]!, depthM: row[3]!, rimM: row[4]!,
    seed: mapCraterSeed(row[0]!, row[1]!), deforms: row[5] === 1 }));
}

interface LaidMapCraters {
  readonly stamps: readonly MapCraterStamp[];
  /** Which stamps went into the ground (a full bucket refuses one: a mark). */
  readonly dug: Uint8Array;
  /** The overlay's first map stamp and its index, to know the overlay still holds them (a reset clears them). */
  readonly first: TerrainStamp | null;
  readonly firstIndex: number;
  /** Grows with every laying (the presentation re-lays the surfaces). */
  readonly epoch: number;
}
const laidOn = new WeakMap<TerrainDeformation, LaidMapCraters>();
let epochs = 0;

/**
 * Lay a map's bowls into a match's ground overlay — before anything else stamps it, so a peer, a restored host and a late
 * joiner lay them in the same place in the overlay's order — and remember them for the presentation (mapCratersOn).
 * Returns how many bowls went in.
 */
export function stampMapCraters(overlay: TerrainDeformation, stamps: readonly MapCraterStamp[]): number {
  const firstIndex = overlay.stamps.length;
  const dug = new Uint8Array(stamps.length);
  let count = 0;
  for (let i = 0; i < stamps.length; i++) {
    const s = stamps[i]!;
    if (s.deforms && overlay.addCrater(s.x, s.z, s.radiusM, s.depthM, s.rimM, s.seed)) { dug[i] = 1; count++; }
  }
  laidOn.set(overlay, { stamps, dug, first: overlay.stamps[firstIndex] ?? null, firstIndex, epoch: ++epochs });
  return count;
}

/** The map craters laid on `overlay` while it still holds them (the presentation's surfaces), else null. */
export function mapCratersOn(overlay: TerrainDeformation | null | undefined): LaidMapCraters | null {
  if (!overlay) return null;
  const laid = laidOn.get(overlay);
  if (!laid) return null;
  if (laid.first && overlay.stamps[laid.firstIndex] !== laid.first) return null;
  return laid;
}

/** A world that carries its map craters' stamps (world/map.ts from its build; the headless world from its shard). */
export interface MapCraterWorld {
  getMapCraters?(): readonly MapCraterStamp[];
}

const NO_STAMPS: readonly MapCraterStamp[] = Object.freeze([]);
/** A world's map crater stamps (none for a world without them). */
export function mapCraterStampsOf(world: MapCraterWorld | null | undefined): readonly MapCraterStamp[] {
  return world?.getMapCraters?.() ?? NO_STAMPS;
}
