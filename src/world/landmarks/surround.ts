// src/world/landmarks/surround.ts — a set piece's surroundings (landmarks-realism-273, 2026-11-14; the owner: "the
// buildings need to look like they belong in the area more and be surrounded by stuff that makes them more natural in
// the environment", and on Railyard, whose roundhouse took a goods shed's plot: "add back the railyard stuff back around
// the new landmark").
//
// After a piece is placed (compose.ts), its kind's surroundings — the props' own destructibles of its region and trade:
// a shed's pallets, drums and timber, a ksar's water jars and garden walls, a fort's jerrycans and wire — are set round
// it: groups hugging its walls (a yard's working edge), a few further out (a parked cart, a lorry), and short wall or
// fence runs along a side. Each spot keeps off the roads, water, steep ground, the spawn pads and objective discs, every
// solid standing and the other spots, and is reserved so the scatter passes after keep off it. Drawn from a stream of its
// own (map, kind, place), the same on every tier; a spot that fails is left out, never moved elsewhere.
import { collisionFootprintContainsPoint, type CollisionRecord } from '../collision.ts';
import { hashSeed, streamFrom } from '../maps/regional/geometry.ts';
import type { HeightField } from '../terrain.ts';
import type { LandmarkKind } from './types.ts';

type Side = 'front' | 'back' | 'left' | 'right';

/** A group of props set together against one side of the piece: its kinds and counts, how far out from the wall. */
interface SurroundGroup {
  items: ReadonlyArray<readonly [kind: string, count: number]>;
  /** Metres out from the footprint's edge to the group's anchor: [min, max]. */
  out: readonly [number, number];
  /** The group's radius round its anchor. */
  spread: number;
  /** The sides it may stand on (default: any). */
  sides?: readonly Side[];
}

/** A run of wall or fence modules parallel to one side. */
interface SurroundRun {
  kind: string;
  modules: number;
  out: number;
  sides?: readonly Side[];
}

interface Surround {
  groups: readonly SurroundGroup[];
  runs?: readonly SurroundRun[];
}

/** The footprint radius of each kind the surroundings use (inhabitKit / sceneryKit metas; vehicles from their bodies). */
const RADIUS: Readonly<Record<string, number>> = {
  barrel: 0.4, crate: 0.62, pallet: 0.62, drum: 0.32, drumred: 0.32, gasbottle: 0.25, jerrycan: 0.25, bucket: 0.25,
  pot: 0.55, firewood: 0.9, trough: 1.0, bench: 1.0, lamp: 0.3, handcart: 1.2, cablespool: 0.9, ammobox: 0.4,
  tent: 2.2, stall: 1.6, sled: 1.1, bale: 0.8, trashcan: 0.35, barrier: 1.2, cone: 0.25, transformer: 0.9,
  sandbagsmall: 1.0, lumberstack: 2.7, logdeck: 4.1, wagon: 2.6, pickup: 2.8, truck: 3.6, jeep: 2.4, truckflatbed: 3.6,
  haycart: 2.4, walladobe: 1.6, wallstone: 1.6, fencerail: 1.25, barbedwire: 1.5, loosewheel: 0.5, churn: 0.3,
};
/** A run module's half length along its run (its meta's hl). */
const HALF_LENGTH: Readonly<Record<string, number>> = { walladobe: 1.53, wallstone: 1.54, fencerail: 1.25, barbedwire: 1.4 };
/** Kinds that sit only on near-level ground (wheels, long bodies). */
const LEVEL_KINDS: ReadonlySet<string> = new Set(['wagon', 'pickup', 'truck', 'jeep', 'truckflatbed', 'haycart', 'handcart', 'lumberstack', 'logdeck', 'tent', 'stall']);

const yard = (items: SurroundGroup['items'], out: readonly [number, number] = [0.8, 2.6], spread = 2.6, sides?: readonly Side[]): SurroundGroup =>
  ({ items, out, spread, sides });

/** Each kind's surroundings: its trade's and its region's things. */
export const LANDMARK_SURROUNDS: Partial<Record<LandmarkKind, Surround>> = {
  // the engine shed's working yard: the goods yard it stands in (timber, pallets, oil drums, cable drums, a wagon)
  roundhouse: {
    groups: [
      yard([['pallet', 3], ['crate', 3], ['drum', 2]], [1.0, 3.5], 3.2, ['left', 'right']),
      yard([['drum', 3], ['drumred', 2], ['barrel', 2], ['gasbottle', 2]], [0.8, 2.4], 2.4, ['left', 'right', 'back']),
      yard([['lumberstack', 1], ['pallet', 2]], [3.0, 7.0], 3.5, ['left', 'right', 'back']),
      yard([['cablespool', 2], ['crate', 2], ['loosewheel', 2]], [1.0, 3.0], 2.8, ['back', 'left']),
      yard([['wagon', 1]], [5.0, 10.0], 1, ['left', 'right']),
      yard([['handcart', 1], ['barrel', 2]], [1.5, 4.0], 2.0, ['front']),
    ],
  },
  signalBox: {
    groups: [yard([['drum', 2], ['crate', 1], ['cablespool', 1]], [0.7, 2.0], 1.8), yard([['lamp', 1]], [0.6, 1.4], 0.5, ['front'])],
  },
  // the ksar's life outside its gate: water jars, a cart, firewood of palm, garden walls of mud brick
  ghorfaKsar: {
    groups: [
      yard([['pot', 4], ['bucket', 2]], [0.6, 2.2], 2.2, ['front']),
      yard([['firewood', 2], ['handcart', 1]], [1.0, 3.5], 2.8, ['left', 'right']),
      yard([['trough', 1], ['pot', 2], ['jerrycan', 2]], [1.0, 3.0], 2.2),
      yard([['stall', 1], ['pot', 2]], [3.0, 6.0], 2.4, ['front']),
      yard([['pickup', 1]], [6.0, 11.0], 1, ['front', 'left', 'right']),
    ],
    runs: [{ kind: 'walladobe', modules: 4, out: 6, sides: ['left', 'right', 'back'] }, { kind: 'walladobe', modules: 3, out: 9, sides: ['front', 'left'] }],
  },
  marabout: {
    groups: [yard([['pot', 2], ['bucket', 1]], [0.6, 2.0], 1.6, ['front']), yard([['jerrycan', 1], ['pot', 1]], [0.8, 2.4], 1.4)],
  },
  shrine: {
    groups: [yard([['bench', 2]], [1.0, 3.0], 3.0, ['left', 'right']), yard([['firewood', 1], ['bucket', 2]], [0.8, 2.4], 2.0, ['back'])],
  },
  // the patrol's post: fuel, ammunition, a tent, wire and the patrol's vehicle
  desertFort: {
    groups: [
      yard([['jerrycan', 4], ['drum', 3]], [0.8, 2.6], 2.4),
      yard([['ammobox', 3], ['crate', 2]], [0.8, 2.6], 2.2),
      yard([['tent', 1], ['jerrycan', 2]], [4.0, 8.0], 3.0, ['left', 'right', 'back']),
      yard([['jeep', 1]], [5.0, 10.0], 1, ['front', 'left', 'right']),
      yard([['sandbagsmall', 2]], [1.5, 3.5], 2.6, ['front']),
    ],
    runs: [{ kind: 'barbedwire', modules: 3, out: 7, sides: ['front', 'left', 'right'] }],
  },
  casemateFort: {
    groups: [
      yard([['ammobox', 3], ['crate', 3]], [1.0, 3.0], 2.6, ['back', 'left', 'right']),
      yard([['drum', 2], ['firewood', 1]], [1.0, 3.0], 2.4, ['back', 'left', 'right']),
      yard([['sandbagsmall', 3]], [2.0, 5.0], 3.0, ['front']),
    ],
    runs: [{ kind: 'barbedwire', modules: 4, out: 9, sides: ['front'] }, { kind: 'barbedwire', modules: 3, out: 8, sides: ['left', 'right'] }],
  },
  // Siwa: water jars, palm-wood, mud-brick garden walls round the palms
  shaliMosque: {
    groups: [
      yard([['pot', 3], ['bucket', 2]], [0.6, 2.2], 2.2, ['front']),
      yard([['handcart', 1], ['firewood', 1]], [1.5, 4.0], 2.6),
      yard([['stall', 1], ['pot', 2]], [3.0, 6.0], 2.6, ['front', 'left']),
    ],
    runs: [{ kind: 'walladobe', modules: 3, out: 5, sides: ['left', 'right', 'back'] }],
  },
  springPool: {
    groups: [yard([['pot', 3], ['bucket', 2]], [0.6, 2.0], 2.2), yard([['bench', 1]], [1.0, 2.5], 1.0)],
    runs: [{ kind: 'walladobe', modules: 3, out: 4, sides: ['left', 'right', 'back'] }],
  },
  // the canal market's landing side and its back yard
  canalMarket: {
    groups: [
      yard([['crate', 4], ['barrel', 2]], [0.6, 2.4], 2.6),
      yard([['bucket', 3], ['pot', 2], ['jerrycan', 2]], [0.6, 2.2], 2.2),
      yard([['stall', 2]], [2.0, 5.0], 3.5, ['front', 'left', 'right']),
      yard([['handcart', 1], ['pallet', 2]], [1.5, 4.0], 2.6, ['back', 'left', 'right']),
    ],
  },
  charcoalKilns: {
    groups: [
      yard([['firewood', 3], ['handcart', 1]], [1.0, 3.5], 3.2),
      yard([['logdeck', 1]], [3.5, 8.0], 2.0, ['back', 'left', 'right']),
      yard([['crate', 2], ['bucket', 2]], [0.8, 2.4], 2.2),
    ],
  },
  bullring: {
    groups: [
      yard([['bench', 2], ['lamp', 2]], [1.5, 4.0], 4.0, ['front']),
      yard([['trashcan', 2], ['bench', 1]], [1.0, 3.0], 3.0, ['left', 'right']),
      yard([['stall', 1], ['crate', 2]], [2.5, 6.0], 2.6, ['front', 'left']),
    ],
  },
  alcazaba: {
    groups: [
      yard([['firewood', 1], ['haycart', 1]], [3.0, 7.0], 3.0, ['left', 'right', 'back']),
      yard([['bale', 3]], [2.0, 5.0], 2.6, ['left', 'right']),
    ],
    runs: [{ kind: 'wallstone', modules: 4, out: 6, sides: ['left', 'right', 'back'] }],
  },
  // the trading post's yard and the hogans' camp: a pickup, barrels and drums, the corral's rails, firewood
  tradingPost: {
    groups: [
      yard([['barrel', 3], ['crate', 3]], [0.6, 2.4], 2.6),
      yard([['pickup', 1]], [4.0, 9.0], 1, ['front', 'left', 'right']),
      yard([['drum', 2], ['handcart', 1]], [1.0, 3.0], 2.4, ['back', 'left', 'right']),
      yard([['wagon', 1]], [5.0, 10.0], 1, ['back', 'left', 'right']),
    ],
    runs: [{ kind: 'fencerail', modules: 4, out: 8, sides: ['back', 'left', 'right'] }],
  },
  hogan: {
    groups: [yard([['firewood', 2], ['bucket', 1]], [0.8, 3.0], 2.4), yard([['trough', 1]], [3.0, 6.0], 1.2)],
    runs: [{ kind: 'fencerail', modules: 4, out: 7, sides: ['left', 'right', 'back'] }],
  },
  cablewayTower: {
    groups: [
      yard([['cablespool', 2], ['drum', 3]], [0.8, 3.0], 2.6),
      yard([['crate', 2], ['pallet', 2]], [1.0, 3.5], 2.6),
      yard([['truckflatbed', 1]], [5.0, 10.0], 1),
    ],
  },
  landingPad: {
    groups: [
      yard([['crate', 4], ['gasbottle', 3]], [1.0, 3.5], 3.0),
      yard([['drum', 3], ['cone', 3]], [1.0, 3.5], 3.0),
      yard([['barrier', 2]], [1.5, 4.0], 3.6),
    ],
  },
  woodenChurch: {
    groups: [
      yard([['bench', 2]], [1.0, 3.0], 3.0, ['front']),
      yard([['firewood', 2], ['sled', 1]], [1.0, 3.5], 2.6, ['back', 'left', 'right']),
      yard([['lamp', 1]], [1.0, 2.0], 0.5, ['front']),
    ],
  },
  // the works' gas yard: drums, gas bottles, cable drums, pallets, the transformer, barriers
  gasholder: {
    groups: [
      yard([['drum', 4], ['drumred', 2]], [1.0, 3.0], 2.6),
      yard([['gasbottle', 3], ['cablespool', 1]], [1.0, 3.0], 2.4),
      yard([['pallet', 3], ['crate', 2]], [1.0, 3.5], 2.8),
      yard([['transformer', 1], ['barrier', 2]], [2.0, 5.0], 3.0),
    ],
  },
};

/** What the surroundings read of the composer's context. */
export interface SurroundContext {
  mapId: string;
  heightField: Pick<HeightField, 'getHeightAt' | 'getWaterMaskAt' | '_roadDist' | '_noVeg' | 'getNormalAt'>;
  obstacles: readonly CollisionRecord[];
  spawns: ReadonlyArray<{ x: number; z: number }>;
  square: number;
  spawnClear: number;
  roadClear: number;
  /** The bridges' piers (compose.ts keepOuts): no prop stands in one. */
  keepOuts?: ReadonlyArray<{ x: number; z: number; c: number; s: number; hw: number; hd: number }>;
  reserve(x: number, z: number, r: number): void;
  addDestructible(kind: string, x: number, y: number, z: number, yaw: number, scale: number): void;
}

/** One placed spot of the surroundings (for spacing and the receipt). */
interface Spot { x: number; z: number; r: number }

/**
 * Set a placed piece's surroundings round its footprint (centre x, z; half extents hw across, hl along; heading yaw).
 * Returns the number of props set (the receipt's).
 */
export function placeSurroundings(ctx: SurroundContext, kind: LandmarkKind, x: number, z: number, hw: number, hl: number, yaw: number,
  discs: ReadonlyArray<readonly [number, number, number]>, identity: readonly number[]): number {
  const spec = LANDMARK_SURROUNDS[kind];
  if (!spec) return 0;
  const rng = streamFrom(hashSeed(`landmark:surround:${ctx.mapId}:${kind}`, ...identity));
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const toWorld = (lx: number, lz: number): [number, number] => [x + lx * c + lz * s, z - lx * s + lz * c];
  const spots: Spot[] = [];
  const clear = (px: number, pz: number, r: number, level: boolean): boolean => {
    if (Math.max(Math.abs(px), Math.abs(pz)) > ctx.square - r) return false;
    // outside the piece's own footprint
    const ox = px - x, oz = pz - z, lx = ox * c - oz * s, lz = ox * s + oz * c;
    if (Math.abs(lx) < hw + r * 0.5 && Math.abs(lz) < hl + r * 0.5) return false;
    const hf = ctx.heightField;
    if (hf.getWaterMaskAt(px, pz) > 0.02 || hf._noVeg(px, pz) || hf._roadDist(px, pz) < ctx.roadClear + r) return false;
    if (hf.getNormalAt(px, pz).y < (level ? 0.95 : 0.88)) return false;
    for (const sp of ctx.spawns) if (Math.hypot(px - sp.x, pz - sp.z) < ctx.spawnClear + r) return false;
    if (ctx.keepOuts?.some((k) => {
      const dx = px - k.x, dz = pz - k.z;
      return Math.abs(dx * k.c - dz * k.s) < k.hw + r && Math.abs(dx * k.s + dz * k.c) < k.hd + r;
    })) return false;
    for (const [dx, dz, dr] of discs) if (Math.hypot(px - dx, pz - dz) < dr + r) return false;
    for (const sp of spots) if (Math.hypot(px - sp.x, pz - sp.z) < sp.r + r + 0.25) return false;
    for (const ob of ctx.obstacles) {
      if (px + r < ob.min[0] - 0.3 || px - r > ob.max[0] + 0.3 || pz + r < ob.min[2] - 0.3 || pz - r > ob.max[2] + 0.3) continue;
      if (!ob.shape2 || collisionFootprintContainsPoint(ob, px, pz, r + 0.3)) return false;
    }
    return true;
  };
  const put = (k: string, px: number, pz: number, r: number, ry: number): void => {
    spots.push({ x: px, z: pz, r });
    ctx.reserve(px, pz, r + 0.4);
    ctx.addDestructible(k, px, ctx.heightField.getHeightAt(px, pz), pz, ry, 1);
  };
  // a point on a side: `t` along it (-1..1), `out` metres past its edge; and the side's run direction and outward normal
  const sideFrame = (side: Side, t: number, out: number): { lx: number; lz: number; ax: number; az: number } => {
    switch (side) {
      case 'front': return { lx: t * hw, lz: hl + out, ax: 1, az: 0 };
      case 'back': return { lx: t * hw, lz: -hl - out, ax: 1, az: 0 };
      case 'left': return { lx: -hw - out, lz: t * hl, ax: 0, az: 1 };
      default: return { lx: hw + out, lz: t * hl, ax: 0, az: 1 };
    }
  };
  const ALL: readonly Side[] = ['front', 'back', 'left', 'right'];
  let placed = 0;
  for (const group of spec.groups) {
    const sides = group.sides ?? ALL;
    // the group's anchor: up to 6 tries on its sides; a group that finds none is left out
    let anchor: [number, number] | null = null;
    for (let t = 0; t < 6 && !anchor; t++) {
      const side = sides[Math.floor(rng() * sides.length) % sides.length];
      const f = sideFrame(side, rng() * 1.8 - 0.9, group.out[0] + rng() * (group.out[1] - group.out[0]));
      const [ax, az] = toWorld(f.lx, f.lz);
      if (clear(ax, az, 0.4, false)) anchor = [ax, az];
    }
    if (!anchor) continue;
    for (const [k, count] of group.items) {
      const r = RADIUS[k] ?? 0.6, level = LEVEL_KINDS.has(k);
      for (let n = 0; n < count; n++) {
        for (let t = 0; t < 6; t++) {
          const a = rng() * Math.PI * 2, d = group.spread <= 1 ? 0 : rng() * group.spread;
          const px = anchor[0] + Math.cos(a) * d, pz = anchor[1] + Math.sin(a) * d;
          // (wheeled and long things lie square to the piece; the loose things any way)
          const ry = level ? yaw + (rng() < 0.5 ? 0 : Math.PI / 2) + (rng() - 0.5) * 0.3 : rng() * Math.PI * 2;
          if (!clear(px, pz, r, level)) continue;
          put(k, px, pz, r, ry);
          placed++;
          break;
        }
      }
    }
  }
  for (const run of spec.runs ?? []) {
    const sides = run.sides ?? ALL, half = HALF_LENGTH[run.kind] ?? 1.5, r = RADIUS[run.kind] ?? 1.5;
    const side = sides[Math.floor(rng() * sides.length) % sides.length];
    const along = side === 'front' || side === 'back' ? hw : hl, length = run.modules * half * 2;
    const t0 = Math.max(-1, Math.min(1, (rng() * 2 - 1) * Math.max(0, 1 - length / (2 * Math.max(along, 1)))));
    const f = sideFrame(side, t0, run.out);
    for (let m = 0; m < run.modules; m++) {
      const off = (m - (run.modules - 1) / 2) * half * 2 * 0.98;
      const [px, pz] = toWorld(f.lx + f.ax * off, f.lz + f.az * off);
      // a module's local +z runs along it (its hl is its length): the run's direction in the world
      const ry = yaw + (f.ax ? Math.PI / 2 : 0);
      if (!clear(px, pz, Math.min(r, half * 0.6), false)) continue;
      put(run.kind, px, pz, Math.min(r, half * 0.6), ry);
      placed++;
    }
  }
  return placed;
}
