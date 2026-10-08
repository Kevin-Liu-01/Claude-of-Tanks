/**
 * destructionMatch.ts — one match's destruction (destruction core lane, 2026-10-07; docs/DESTRUCTION.md).
 *
 * The solo step (game/state.ts) and the network authority (sim/authoritativeMatch.ts) each own one of these per
 * battle and call it at the same moments with the same inputs: a shell meeting the world, an HE burst on a hull, a
 * hull's crash into a structure, a hull's death, the end of the fixed step. It prices the blows through the munition
 * catalog (munitionBlast.ts) onto the structure table (structureDamage.ts), keeps the destruction log (the settled
 * state a snapshot carries and a migration seals) and hands back the stage events for the caller to publish.
 *
 * Pure and Node-runnable. Inert (no table, nothing priced) when the ruleset turns structures off or the world's
 * records carry no structure groups (a shard captured before 2026-10-07).
 */
import type { CollisionRecord } from '../world/collision.ts';
import type { DestructionLogEntry, DestructionRules, StructureStage, StructureStageEvent } from './destructionEvents.ts';
import {
  cookOffChargeKg, FUEL_CHARGE_KG, kineticStructurePoints, munitionChargeKg, munitionClassForShell,
  type MunitionShellLike,
} from './munitionBlast.ts';
import { createStructureDamage, type StructureDamage, type StructureState } from './structureDamage.ts';
import { rubbleHeightFor, type TerrainDeformation } from './terrainDeformation.ts';


export interface DestructionMatchOptions {
  rules: DestructionRules | null | undefined;
  /** The match world's movement records and shell/sight records (the same objects its grids hold). */
  obstacles: readonly CollisionRecord[];
  colliders: readonly CollisionRecord[];
  /** The match's ground overlay (terrainDeformation.ts): a collapse raises its rubble mound there. */
  ground?: TerrainDeformation | null;
  /** A collapse was applied (records flipped, rubble raised): refresh the route grid. */
  onCollapse?(structure: StructureState): void;
  /** A blast of `chargeKg` burst at (x, y, z): the caller fells the light props within `propFellRadiusM` of it. */
  onBlast?(x: number, y: number, z: number, chargeKg: number): void;
}

export interface DestructionMatch {
  readonly enabled: boolean;
  readonly structures: StructureDamage | null;
  /** The log so far (append-only; its length is the revision). */
  readonly log: readonly DestructionLogEntry[];
  /**
   * A shell met the world at (x, y, z) flying along (dirX, dirZ): `record` is the shell or sight record it struck
   * (null on the ground). A penetrator's strike on a structure, then the round's charge as a blast (direct on the
   * struck structure).
   */
  shellWorldHit(spec: MunitionShellLike, record: CollisionRecord | null | undefined,
    x: number, y: number, z: number, dirX: number, dirZ: number): void;
  /** A round burst on a hull (HE splash, a shaped-charge strike): its charge as a blast on the structures near. */
  shellBurst(spec: MunitionShellLike, x: number, y: number, z: number, dirX: number, dirZ: number): void;
  /** A hull's crash into `record` priced by the impact law this tick (closing speed over the crash's prior). */
  ram(record: CollisionRecord | null | undefined, massTons: number, closingMps: number, priorClosingMps: number,
    x: number, y: number, z: number, dirX: number, dirZ: number): void;
  /**
   * A hull pressing into `record` this tick at `closingMps` (along the contact normal; `speedMps` its whole speed):
   * the share of its speed it keeps when the structure yields to the ram (it comes down), or null when it holds.
   */
  ramThrough(record: CollisionRecord | null | undefined, massTons: number, closingMps: number, speedMps: number,
    x: number, y: number, z: number, dirX: number, dirZ: number): number | null;
  /** A hull died: an ammunition cook-off or a fuel fire bursts on the structures near (never on the tanks). */
  tankDeath(cause: string, massTons: number, x: number, y: number, z: number): void;
  /** End of the fixed step: queued collapses, the log, this tick's events (drain them with `drainEvents`). */
  step(): void;
  drainEvents(out: StructureStageEvent[]): number;
  /** Lay a previous authority's log down without events (a resumed host): kept verbatim, its stages and collapses
   * applied at once; returns the entries this world applied. */
  restore(entries: readonly DestructionLogEntry[]): number;
}

/** Reset every structure record's flags (a world reused for a new battle; the props reset their own). */
export function resetStructureRecords(obstacles: readonly CollisionRecord[], colliders: readonly CollisionRecord[]): void {
  for (const record of obstacles) if (record.structureIdx !== undefined) record.crushed = false;
  for (const record of colliders) {
    if (record.structureIdx === undefined) continue;
    record.crushed = false;
    record.dead = false;
  }
}

export function createDestructionMatch(options: DestructionMatchOptions): DestructionMatch {
  const rules = options.rules;
  const hasGroups = options.obstacles.some((record) => record.structureIdx !== undefined)
    || options.colliders.some((record) => record.structureIdx !== undefined);
  const enabled = !!rules?.structures && hasGroups;
  const ground = options.ground ?? null;
  const structures = enabled
    ? createStructureDamage(options.obstacles, options.colliders, {
      damageScale: rules!.structureDamageScale,
      // the heap over its footprint first (a hull on it rides the mound from this tick), then the caller's refresh
      onCollapse: (structure) => {
        ground?.addRubble(structure.cx, structure.cz, structure.hw, structure.hd, structure.yaw,
          rubbleHeightFor(structure.topY - structure.baseY));
        options.onCollapse?.(structure);
      },
    })
    : null;
  const log: DestructionLogEntry[] = [];
  const stepEvents: StructureStageEvent[] = [];
  const outbox: StructureStageEvent[] = [];
  const blow = { cause: 'blast' as StructureStageEvent['cause'], munition: null as StructureStageEvent['munition'],
    x: 0, y: 0, z: 0, dirX: 0, dirZ: 1 };
  const setBlow = (cause: StructureStageEvent['cause'], munition: StructureStageEvent['munition'],
    x: number, y: number, z: number, dirX: number, dirZ: number) => {
    const length = Math.hypot(dirX, dirZ);
    blow.cause = cause; blow.munition = munition;
    blow.x = x; blow.y = y; blow.z = z;
    blow.dirX = length > 1e-9 ? dirX / length : 0;
    blow.dirZ = length > 1e-9 ? dirZ / length : 1;
    return blow;
  };

  return {
    enabled,
    structures,
    log,
    shellWorldHit(spec, record, x, y, z, dirX, dirZ) {
      if (!structures) return;
      const munition = munitionClassForShell(spec);
      const struck = structures.structureOf(record);
      const kinetic = struck ? kineticStructurePoints(spec, munition) : 0;
      if (struck && kinetic > 0) structures.applyPoints(struck, kinetic, setBlow('kinetic', munition, x, y, z, dirX, dirZ));
      const charge = munitionChargeKg(spec, munition);
      if (charge > 0) {
        structures.applyBlast(charge, munition, setBlow('blast', munition, x, y, z, dirX, dirZ), struck);
        options.onBlast?.(x, y, z, charge);
      }
    },
    shellBurst(spec, x, y, z, dirX, dirZ) {
      if (!structures) return;
      const munition = munitionClassForShell(spec);
      const charge = munitionChargeKg(spec, munition);
      if (charge > 0) {
        structures.applyBlast(charge, munition, setBlow('blast', munition, x, y, z, dirX, dirZ));
        options.onBlast?.(x, y, z, charge);
      }
    },
    ram(record, massTons, closingMps, priorClosingMps, x, y, z, dirX, dirZ) {
      if (!structures) return;
      const struck = structures.structureOf(record);
      if (!struck) return;
      structures.applyRam(struck, massTons, closingMps, priorClosingMps, setBlow('ram', null, x, y, z, dirX, dirZ));
    },
    ramThrough(record, massTons, closingMps, speedMps, x, y, z, dirX, dirZ) {
      if (!structures) return null;
      const struck = structures.structureOf(record);
      if (!struck) return null;
      return structures.yieldTo(struck, massTons, closingMps, speedMps, setBlow('ram', null, x, y, z, dirX, dirZ));
    },
    tankDeath(cause, massTons, x, y, z) {
      if (!structures) return;
      if (cause === 'ammo_rack' || cause === 'ammorack') {
        const charge = cookOffChargeKg(massTons);
        structures.applyBlast(charge, 'cook_off', setBlow('blast', 'cook_off', x, y, z, 0, 0));
        options.onBlast?.(x, y, z, charge);
      } else if (cause === 'fire') {
        structures.applyBlast(FUEL_CHARGE_KG, 'fuel', setBlow('blast', 'fuel', x, y, z, 0, 0));
      }
    },
    step() {
      if (!structures) return;
      structures.step();
      stepEvents.length = 0;
      structures.drainEvents(stepEvents);
      for (const event of stepEvents) {
        log.push({ kind: 'stage', structureId: event.structureId, stage: event.stage });
        outbox.push(event);
      }
    },
    drainEvents(out) {
      if (!outbox.length) return 0;
      const count = outbox.length;
      for (const event of outbox) out.push(event);
      outbox.length = 0;
      return count;
    },
    restore(entries) {
      // the previous authority's log is kept verbatim (its revision continues); what this world can apply, it applies
      let applied = 0;
      for (const entry of entries) {
        log.push({ ...entry });
        if (entry.kind === 'stage' && structures?.restoreStage(entry.structureId, entry.stage as StructureStage)) applied++;
      }
      return applied;
    },
  };
}
