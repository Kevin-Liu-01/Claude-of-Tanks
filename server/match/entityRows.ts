/**
 * Authority entity -> wire row capture. Positions and angles are quantized
 * from the raw simulation state (mm, u16 turns); combat fields follow the
 * same rules as v1's captureEntitySnapshot; ERA cassettes become spec-order
 * plate indices. Reused scratch, no per-viewer allocation beyond the row.
 */
import { magazineIndicator, type MagazineIndicator } from '../../src/sim/magazineIndicator.ts';
import type { AuthoritativeEntity } from '../../src/sim/authoritativeMatch.ts';
import type { DamageShell } from '../../src/sim/damage.ts';
import {
  ENTITY_FLAGS, MODULE_STATE_NAMES, PHASE, RELOAD_KIND_NAMES, SHELL_FLAGS, VERDICT, VIEWER_CREW, VIEWER_EQUIPMENT, VIEWER_MODULES,
} from '../../src/mp/wire/constants.ts';
import type { EntityRow, ShellRow, SnapshotMeta, ViewerState } from '../../src/mp/wire/messages.ts';
import {
  clampU16, clampU8, quantizeAngle, quantizeMultiplier, quantizePosition, quantizeReloadS, quantizeShellVelocity, quantizeVelocity,
} from '../../src/mp/wire/quantize.ts';
import { shellTypeIndex } from '../../src/mp/wire/codec.ts';
import { MOVEMENT_CHECKPOINT_VERSION } from '../../src/mp/match/movementCheckpoint.ts';
import { eraPlateIndices } from '../../src/mp/wire/era.ts';

const indicatorScratch: MagazineIndicator = { rounds: 0, capacity: 0, launcher: false };
const indicatorView = {
  shellSlot: 0,
  reload: { t: 0, kind: 'ready' as string },
  magazine: null as { rounds: number; capacity: number } | null,
  magazineScratch: { rounds: 0, capacity: 0 },
  launcherSalvoShots: 0,
  magazineIndicator: undefined as MagazineIndicator | null | undefined,
};

function reloadKindIndex(kind: unknown): number {
  const index = RELOAD_KIND_NAMES.indexOf(kind as typeof RELOAD_KIND_NAMES[number]);
  return index < 0 ? 0 : index;
}

/** Sorted spec-order indices of the spent cassettes; cached per entity while the set size is unchanged. */
export interface EraIndexer {
  indices(entity: AuthoritativeEntity): number[];
}

export function createEraIndexer(): EraIndexer {
  const tables = new Map<string, Map<string, number>>();
  const cache = new WeakMap<AuthoritativeEntity, { size: number; combat: unknown; sorted: number[] }>();
  return {
    indices(entity) {
      const spent = entity.combat.eraSpent;
      const size = spent ? spent.size : 0;
      const cached = cache.get(entity);
      if (cached && cached.size === size && cached.combat === entity.combat) return cached.sorted;
      let table = tables.get(entity.specId);
      if (!table) {
        table = eraPlateIndices(entity.spec.armor as { hullPlates?: { kind?: string; name?: string }[]; turretPlates?: { kind?: string; name?: string }[] });
        tables.set(entity.specId, table);
      }
      const sorted: number[] = [];
      if (spent) {
        for (const name of spent) {
          const index = table.get(name);
          if (index != null) sorted.push(index);
        }
        sorted.sort((a, b) => a - b);
      }
      cache.set(entity, { size, combat: entity.combat, sorted });
      return sorted;
    },
  };
}

function entityFlags(entity: AuthoritativeEntity): number {
  let flags = 0;
  const combat = entity.combat;
  const state = entity.state;
  if (combat.destroyed) flags |= ENTITY_FLAGS.DESTROYED;
  if (combat.fire?.burning) flags |= ENTITY_FLAGS.BURNING;
  if (entity.input.fire) flags |= ENTITY_FLAGS.FIRING;
  if (entity.specialAction?.active) flags |= ENTITY_FLAGS.SPECIAL_ACTIVE;
  if (state.grounded === false) flags |= ENTITY_FLAGS.AIRBORNE;
  if (state.overturned) flags |= ENTITY_FLAGS.OVERTURNED;
  if (state._body?.autoRighting) flags |= ENTITY_FLAGS.AUTO_RIGHTING;
  return flags;
}

export function captureEntityRow(entity: AuthoritativeEntity, entityId: number, era: EraIndexer): EntityRow {
  const state = entity.state;
  const combat = entity.combat;
  const reload = combat.reload;
  const gunReload = combat.gunReload || reload;
  indicatorView.shellSlot = Math.max(0, combat.shellSlot | 0);
  indicatorView.reload.t = reload?.t ?? 0;
  indicatorView.reload.kind = typeof reload?.kind === 'string' ? reload.kind : 'ready';
  if (combat.magazine) {
    indicatorView.magazineScratch.rounds = Math.max(0, combat.magazine.rounds | 0);
    indicatorView.magazineScratch.capacity = Math.max(0, combat.magazine.capacity | 0);
    indicatorView.magazine = indicatorView.magazineScratch;
  } else indicatorView.magazine = null;
  indicatorView.launcherSalvoShots = Math.max(0, Number(combat.launcherSalvoShots) | 0);
  indicatorView.magazineIndicator = combat.magazineIndicator as MagazineIndicator | null | undefined;
  const indicator = magazineIndicator(indicatorView, entity.spec, indicatorScratch);
  const verticalSpeed = Number.isFinite(state.verticalSpeed) ? state.verticalSpeed : (state._ride?.v ?? 0);
  return {
    entityId,
    x: quantizePosition(state.pos.x), y: quantizePosition(state.pos.y), z: quantizePosition(state.pos.z),
    speed: quantizeVelocity(state.speed), verticalSpeed: quantizeVelocity(verticalSpeed),
    yaw: quantizeAngle(state.yaw), pitch: quantizeAngle(state.visualPitch), roll: quantizeAngle(state.visualRoll),
    turretYaw: quantizeAngle(state.turretYaw), gunPitch: quantizeAngle(state.gunPitch),
    hp: clampU16(Math.round(combat.hp)), maxHp: Math.max(1, clampU16(Math.round(combat.maxHp))),
    reload: quantizeReloadS(reload?.t ?? 0), reloadTotal: quantizeReloadS(reload?.totalS ?? 0), reloadKind: reloadKindIndex(reload?.kind),
    gunReload: quantizeReloadS(gunReload?.t ?? 0), gunReloadTotal: quantizeReloadS(gunReload?.totalS ?? 0), gunReloadKind: reloadKindIndex(gunReload?.kind),
    magazineRounds: clampU8(indicator?.rounds ?? 0), magazineCapacity: clampU8(indicator?.capacity ?? 0),
    shellSlot: Math.max(0, Math.min(2, combat.shellSlot | 0)),
    ammo0: clampU16(combat.ammo?.[0] ?? 0), ammo1: clampU16(combat.ammo?.[1] ?? 0), ammo2: clampU16(combat.ammo?.[2] ?? 0),
    flags: entityFlags(entity),
    eraSpent: era.indices(entity),
  };
}

export function captureShellRow(shell: DamageShell, shooterEntityId: number): ShellRow {
  return {
    id: shell.id & 0xffff, shooterEntityId,
    x: quantizePosition(shell.pos.x), y: quantizePosition(shell.pos.y), z: quantizePosition(shell.pos.z),
    vx: quantizeShellVelocity(shell.vel.x), vy: quantizeShellVelocity(shell.vel.y), vz: quantizeShellVelocity(shell.vel.z),
    shellType: shellTypeIndex(String(shell.spec.type)),
    flags: shell.spec.guided ? SHELL_FLAGS.GUIDED : 0,
  };
}

interface PredictionMeta {
  modules?: Record<string, string>;
  crew?: Record<string, boolean>;
  equipment?: Record<string, number>;
  movement?: { version?: number; values?: number[]; flags?: number } | null;
  modeSpeedMultiplier?: number;
  modeGravityScale?: number;
}

/** Map the authority's viewer prediction meta (src/net/predictionAuthorityState) onto the wire section. */
export function captureViewerState(entityId: number, meta: unknown): ViewerState | null {
  if (!meta || typeof meta !== 'object') return null;
  const prediction = meta as PredictionMeta;
  const modules = VIEWER_MODULES.map((key) => {
    const index = MODULE_STATE_NAMES.indexOf((prediction.modules?.[key] ?? 'ok') as typeof MODULE_STATE_NAMES[number]);
    return index < 0 ? 0 : index;
  });
  let crewBits = 0;
  VIEWER_CREW.forEach((key, index) => { if (prediction.crew?.[key] !== false) crewBits |= 1 << index; });
  const equipment = VIEWER_EQUIPMENT.map((key) => quantizeMultiplier(prediction.equipment?.[key] ?? 1));
  const movement = prediction.movement;
  const values = Array.isArray(movement?.values) ? movement.values.filter((value) => Number.isFinite(value)) : [];
  const valid = movement && movement.version === MOVEMENT_CHECKPOINT_VERSION && Array.isArray(movement.values) && values.length === movement.values.length && values.length <= 64;
  return {
    entityId, modules, crewBits, equipment,
    modeSpeedMultiplier: quantizeMultiplier(prediction.modeSpeedMultiplier ?? 1),
    modeGravityScale: quantizeMultiplier(prediction.modeGravityScale ?? 1),
    movementVersion: valid ? MOVEMENT_CHECKPOINT_VERSION : 0,
    movementFlags: valid ? Math.max(0, Math.min(65535, (movement.flags ?? 0) | 0)) : 0,
    movementValues: valid ? values : [],
  };
}

export function captureMeta(meta: Record<string, unknown> | null, ended: boolean): SnapshotMeta {
  const phase = meta?.phase === 'countdown' ? PHASE.COUNTDOWN : meta?.phase === 'playing' ? PHASE.PLAYING : PHASE.LOADING;
  const result = meta?.result;
  const verdict = result === 'alpha' ? VERDICT.ALPHA : result === 'bravo' ? VERDICT.BRAVO : result === 'draw' ? VERDICT.DRAW : VERDICT.NONE;
  return {
    phase: ended || verdict !== VERDICT.NONE ? PHASE.ENDED : phase,
    countdownMs: clampU16(Number(meta?.countdownMs) || 0),
    battleTimeMs: Math.max(0, Math.min(0xffffffff, Math.round(Number(meta?.battleTimeMs) || 0))),
    verdict,
    verdictReason: verdict === VERDICT.NONE ? '' : String(meta?.resultReason ?? '').slice(0, 60),
    destructibleRevision: Math.max(0, Math.min(0xffffffff, Number(meta?.destructibleRevision) || 0)),
  };
}
