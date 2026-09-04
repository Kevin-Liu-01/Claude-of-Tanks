// Deterministic head-to-head balance range built on the authoritative battle path.
// This is tooling/test code: it deliberately loads the complete procedural fleet.

import { Vector3 } from 'three';
import './tankFactory.ts';
import { encodeAimIntent } from '../net/aimIntent.ts';
import {
  createAuthoritativeMatch,
  type AuthoritativeEntity,
  type AuthoritativeObstacle,
  type AuthoritativePlayerInput,
  type AuthoritativeWorldCollision,
} from '../sim/authoritativeMatch.ts';
import type { HeightField } from '../world/terrain.ts';

const SIM_DT = 1 / 60;
const FLAT_NORMAL = new Vector3(0, 1, 0);
const FLAT_VILLAGE = Object.freeze({
  x0: 0, x1: 0, z0: 0, z1: 0, cx: 0, cz: 0, feather: 0, flatten: 0,
});

const FLAT_RANGE_HEIGHT_FIELD: HeightField = {
  getHeightAt: () => 0,
  getHeightAtFast: () => 0,
  *warmFastTilesAround() {},
  getNormalAt: () => FLAT_NORMAL,
  getGroundType: () => 'hard',
  getWaterMaskAt: () => 0,
  size: 1024,
  minY: 0,
  maxY: 0,
  _roadDist: () => 0,
  _villageMask: () => 0,
  _noVeg: () => true,
  _layout: {
    village: FLAT_VILLAGE,
    marshes: [],
    lakes: [],
    spawns: { player: { x: 0, z: 0 }, enemies: [] },
    roads: [],
    terrain: {
      hillScale: 0,
      microScale: 0,
      rimH: 0,
      village: FLAT_VILLAGE,
      marshes: [],
      lakes: [],
      frozenMarshes: false,
      dunes: null,
      mesas: null,
      landforms: [],
      roads: 'country',
    },
  },
  _mesaW: null,
};

const FLAT_RANGE_WORLD: AuthoritativeWorldCollision = {
  mapId: 'steppe',
  heightField: FLAT_RANGE_HEIGHT_FIELD,
  getObstacles: () => [],
  queryObstacles: (
    _minX: number,
    _minZ: number,
    _maxX: number,
    _maxZ: number,
    out: AuthoritativeObstacle[],
  ) => {
    out.length = 0;
    return out;
  },
  getConcealment: () => [],
};

export interface BalanceDuelOptions {
  aId: string;
  bId: string;
  seed: number;
  /** Swap which vehicle receives the alpha/bravo range position. */
  swapSides?: boolean;
  distanceM?: number;
  durationS?: number;
  aShellSlot?: number;
  bShellSlot?: number;
  /** If set, drive toward the opponent until this separation is reached. */
  advanceToM?: number;
}

export interface BalanceDuelReceipt {
  aId: string;
  bId: string;
  seed: number;
  swapped: boolean;
  winner: 'a' | 'b' | 'draw';
  winnerId: string | 'draw';
  resultReason: string;
  durationS: number;
  aHp: number;
  bHp: number;
  aDamage: number;
  bDamage: number;
}

export interface BalanceSeriesOptions {
  aId: string;
  bId: string;
  seeds?: readonly number[];
  distanceM?: number;
  durationS?: number;
  aShellSlot?: number;
  bShellSlot?: number;
  advanceToM?: number;
}

export interface BalanceSeriesReceipt {
  aId: string;
  bId: string;
  seeds: number[];
  duels: number;
  aWins: number;
  bWins: number;
  draws: number;
  aScore: number;
  averageDurationS: number;
  averageAEndHp: number;
  averageBEndHp: number;
  averageADamage: number;
  averageBDamage: number;
}

function round(value: number, digits = 2): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function targetHeight(entity: AuthoritativeEntity): number {
  const pivotY = Number(entity.spec.armor?.turretPivot?.[1]);
  return Math.max(0.8, Math.min(1.45, Number.isFinite(pivotY) ? pivotY * 0.72 : 1.25));
}

function fireInput(
  shooter: AuthoritativeEntity,
  target: AuthoritativeEntity,
  shellSlot: number,
  advanceToM: number | undefined,
): AuthoritativePlayerInput {
  const separationM = Math.hypot(
    target.state.pos.x - shooter.state.pos.x,
    target.state.pos.z - shooter.state.pos.z,
  );
  const advancing = advanceToM != null && separationM > advanceToM;
  return {
    throttle: advancing ? 1 : 0,
    steer: 0,
    brake: !advancing,
    fire: true,
    aimLocked: true,
    shellSlot,
    actionBits: 0,
    ...encodeAimIntent(shooter.state.pos, {
      x: target.state.pos.x,
      y: target.state.pos.y + targetHeight(target),
      z: target.state.pos.z,
    }),
  };
}

/**
 * Run one stationary duel on a level, obstacle-free range. Both vehicles use
 * the same authoritative movement, gun laying, dispersion, armor, modules,
 * fire, ammunition, and damage code as a live match. The paired series below
 * swaps range ends to cancel any remaining alpha/bravo ordering effect.
 */
export function runBalanceDuel({
  aId,
  bId,
  seed,
  swapSides = false,
  distanceM = 120,
  durationS = 90,
  aShellSlot = 0,
  bShellSlot = 0,
  advanceToM,
}: BalanceDuelOptions): BalanceDuelReceipt {
  const alphaId = swapSides ? bId : aId;
  const bravoId = swapSides ? aId : bId;
  const match = createAuthoritativeMatch({
    mapId: 'steppe',
    seed,
    countdownS: 0,
    battleLimitS: durationS,
    worldCollision: FLAT_RANGE_WORLD,
    players: [
      {
        id: 'range-alpha',
        specId: alphaId,
        team: 'alpha',
        spawn: { x: 0, z: -distanceM / 2, yaw: 0 },
      },
      {
        id: 'range-bravo',
        specId: bravoId,
        team: 'bravo',
        spawn: { x: 0, z: distanceM / 2, yaw: Math.PI },
      },
    ],
  });
  match.onMatchReady();

  const alpha = match.entityById.get('range-alpha')!;
  const bravo = match.entityById.get('range-bravo')!;
  const alphaSlot = swapSides ? bShellSlot : aShellSlot;
  const bravoSlot = swapSides ? aShellSlot : bShellSlot;
  const maxTicks = Math.ceil(durationS / SIM_DT) + 1;
  for (let tick = 0; tick < maxTicks && !match.result; tick++) {
    match.step({
      dt: SIM_DT,
      inputs: new Map([
        ['range-alpha', fireInput(alpha, bravo, alphaSlot, advanceToM)],
        ['range-bravo', fireInput(bravo, alpha, bravoSlot, advanceToM)],
      ]),
    });
  }

  const a = swapSides ? bravo : alpha;
  const b = swapSides ? alpha : bravo;
  const winnerId = match.result === 'draw' || match.result == null
    ? 'draw'
    : match.result === 'alpha' ? alpha.specId : bravo.specId;
  const winner = match.result === 'draw' || match.result == null
    ? 'draw'
    : (match.result === 'alpha') === !swapSides ? 'a' : 'b';
  return {
    aId,
    bId,
    seed,
    swapped: swapSides,
    winner,
    winnerId,
    resultReason: match.resultReason || 'incomplete',
    durationS: round(match.timeS),
    aHp: Math.max(0, Math.round(a.combat.hp)),
    bHp: Math.max(0, Math.round(b.combat.hp)),
    aDamage: Math.round(a.damage),
    bDamage: Math.round(b.damage),
  };
}

/** Run both range orientations for every seed and return stable aggregate data. */
export function runBalanceSeries({
  aId,
  bId,
  seeds = [101, 211, 307, 401, 503, 601],
  ...options
}: BalanceSeriesOptions): BalanceSeriesReceipt {
  const receipts = seeds.flatMap((seed) => [false, true].map((swapSides) =>
    runBalanceDuel({ aId, bId, seed, swapSides, ...options })));
  let aWins = 0;
  let bWins = 0;
  let draws = 0;
  for (const receipt of receipts) {
    if (receipt.winner === 'a') aWins++;
    else if (receipt.winner === 'b') bWins++;
    else draws++;
  }
  const average = (pick: (receipt: BalanceDuelReceipt) => number): number =>
    receipts.reduce((sum, receipt) => sum + pick(receipt), 0) / receipts.length;
  return {
    aId,
    bId,
    seeds: [...seeds],
    duels: receipts.length,
    aWins,
    bWins,
    draws,
    aScore: round((aWins + draws * 0.5) / receipts.length, 3),
    averageDurationS: round(average((receipt) => receipt.durationS)),
    averageAEndHp: round(average((receipt) => receipt.aHp)),
    averageBEndHp: round(average((receipt) => receipt.bHp)),
    averageADamage: round(average((receipt) => receipt.aDamage)),
    averageBDamage: round(average((receipt) => receipt.bDamage)),
  };
}
