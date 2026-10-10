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
 *
 * Sections (P2, §3.4) when the ruleset turns them on: a round's strike opens a hole in the struck section (its blast's by
 * the charge, a penetrator's by its calibre), sections fall at zero and bring what stood on them; each is a
 * StructureBreachEvent, logged ('breach', its footprint centre with it) and handed back like the stages.
 *
 * Craters (P3, §7): a round that bursts on the ground digs one when the ruleset allows craters and the crater law gives
 * at least CRATER_DEFORM_MIN_RADIUS_M — never on hard ground (roads, bridge decks, ice), at most CRATERS_PER_TICK a tick
 * and `maxCraters` a match — stamped on the match's ground overlay quantized as the wire carries it (so every peer and a
 * restored host stamp the same bits), logged, and handed back as a TerrainCraterEvent. Smaller bursts are marks: the
 * presentation draws them from `munition:blast`.
 */
import type { CollisionRecord } from '../world/collision.ts';
import type {
  DestructionLogEntry, DestructionRules, MunitionClass, StructureBreachEvent, StructureStage, StructureStageEvent,
  TerrainCraterEvent,
} from './destructionEvents.ts';
import {
  CRATER_DEFORM_MIN_RADIUS_M, cookOffChargeKg, craterFor, FUEL_CHARGE_KG, kineticStructurePoints, munitionChargeKg,
  munitionClassForShell, penetratorHoleRadiusM, type CraterShape, type MunitionShellLike,
} from './munitionBlast.ts';
import { createStructureDamage, type StructureDamage, type StructureState } from './structureDamage.ts';
import { rubbleHeightFor, type TerrainDeformation } from './terrainDeformation.ts';
import type { StructureMaterial } from './structureMaterial.ts';


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
  /** The ground's drive type at a point (terrain.ts getGroundType): no crater on 'hard' ground (roads, decks, ice). */
  groundTypeAt?(x: number, z: number): string;
  /** The map's house walls (structureMaterial.ts): the ram's scuff energy per structure (§4.4). */
  wallMaterial?: StructureMaterial;
}

/** Deforming craters a fixed step may dig (§8.5): the rest of the tick's ground bursts are marks. */
export const CRATERS_PER_TICK = 4;

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
    x: number, y: number, z: number, dirX: number, dirZ: number, groundBurst?: boolean): number | null;
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
  /** This tick's holes and section falls (P2), in log order. */
  drainBreaches(out: StructureBreachEvent[]): number;
  /** This tick's craters (P3), in log order. */
  drainCraters(out: TerrainCraterEvent[]): number;
  /** Deforming craters dug so far this match (and restored). */
  readonly craters: number;
  /** Lay a previous authority's log down without events (a resumed host): kept verbatim, its stages and collapses
   * applied at once; returns the entries this world applied. */
  restore(entries: readonly DestructionLogEntry[]): number;
}

/** A crater's shape seed (0..65535) from its quantized centre: the same on every peer. */
export function craterSeed(x: number, z: number): number {
  let hash = 0x811c9dc5;
  for (const value of [Math.round(x * 1000), Math.round(z * 1000)]) {
    hash ^= value & 0xffff; hash = Math.imul(hash, 0x01000193);
    hash ^= (value >>> 16) & 0xffff; hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) & 0xffff;
}

/** A dug crater as the log and the wire carry it (mp/wire/destructionLog.ts): centre to the millimetre, radius to the
 * centimetre, depth and rim to the millimetre, and the quantized centre's seed. */
export interface QuantizedCrater { x: number; z: number; radiusM: number; depthM: number; rimM: number; seed: number }

/** Quantize a crater as every peer stamps it (the match's dig and the Studio's alike). */
export function quantizeCrater(x: number, z: number, shape: CraterShape, out: QuantizedCrater): QuantizedCrater {
  out.x = Math.round(x * 1000) / 1000;
  out.z = Math.round(z * 1000) / 1000;
  out.radiusM = Math.min(655.35, Math.round(shape.radiusM * 100) / 100);
  out.depthM = Math.min(65.535, Math.round(shape.depthM * 1000) / 1000);
  out.rimM = Math.min(65.535, Math.round(shape.rimM * 1000) / 1000);
  out.seed = craterSeed(out.x, out.z);
  return out;
}

/** Reset every structure record's flags and openings (a world reused for a new battle; the props reset their own). */
export function resetStructureRecords(obstacles: readonly CollisionRecord[], colliders: readonly CollisionRecord[]): void {
  for (const record of obstacles) if (record.structureIdx !== undefined) record.crushed = false;
  for (const record of colliders) {
    if (record.structureIdx === undefined) continue;
    record.crushed = false;
    record.dead = false;
    if (record.openings) record.openings = null;
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
      wallMaterial: options.wallMaterial ?? 'masonry',
      sections: rules!.sections === true,
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
  const stepBreaches: StructureBreachEvent[] = [];
  const breachOutbox: StructureBreachEvent[] = [];
  const craterOutbox: TerrainCraterEvent[] = [];
  const shape: CraterShape = { radiusM: 0, depthM: 0, rimM: 0 };
  const quantized: QuantizedCrater = { x: 0, z: 0, radiusM: 0, depthM: 0, rimM: 0, seed: 0 };
  const cratering = !!rules?.craters && !!ground && (rules.maxCraters ?? 0) > 0;
  let craterCount = 0;
  let cratersThisTick = 0;
  /** A ground burst's crater, when it deforms (the wire's quantization: mm positions, cm radius, mm depth and rim): its
   * id, or null for a mark. */
  function dig(munition: MunitionClass, chargeKg: number, x: number, z: number): number | null {
    if (!cratering || craterCount >= rules!.maxCraters || cratersThisTick >= CRATERS_PER_TICK) return null;
    craterFor(chargeKg, munition, rules!.craterScale, shape);
    if (shape.radiusM < CRATER_DEFORM_MIN_RADIUS_M) return null;
    if (options.groundTypeAt?.(x, z) === 'hard') return null;
    const { x: qx, z: qz, radiusM, depthM, rimM, seed } = quantizeCrater(x, z, shape, quantized);
    if (!ground!.addCrater(qx, qz, radiusM, depthM, rimM, seed)) return null; // its ground buckets are full: a mark
    const craterId = craterCount++;
    cratersThisTick++;
    log.push({ kind: 'crater', craterId, x: qx, z: qz, radiusM, depthM, rimM, seed });
    craterOutbox.push({ craterId, x: qx, z: qz, radiusM, depthM, rimM, seed, munition, deforms: true });
    return craterId;
  }
  const blow = { cause: 'blast' as StructureStageEvent['cause'], munition: null as StructureStageEvent['munition'],
    x: 0, y: 0, z: 0, dirX: 0, dirZ: 1, holeRadiusM: 0 };
  const setBlow = (cause: StructureStageEvent['cause'], munition: StructureStageEvent['munition'],
    x: number, y: number, z: number, dirX: number, dirZ: number, holeRadiusM = 0) => {
    const length = Math.hypot(dirX, dirZ);
    blow.cause = cause; blow.munition = munition;
    blow.x = x; blow.y = y; blow.z = z;
    blow.dirX = length > 1e-9 ? dirX / length : 0;
    blow.dirZ = length > 1e-9 ? dirZ / length : 1;
    blow.holeRadiusM = holeRadiusM;
    return blow;
  };

  return {
    enabled,
    structures,
    log,
    shellWorldHit(spec, record, x, y, z, dirX, dirZ, groundBurst = false) {
      const munition = munitionClassForShell(spec);
      const charge = munitionChargeKg(spec, munition);
      const craterId = groundBurst && !record && charge > 0 ? dig(munition, charge, x, z) : null;
      if (!structures) return craterId;
      const struck = structures.structureOf(record);
      const kinetic = struck ? kineticStructurePoints(spec, munition) : 0;
      // a penetrator's hole (P2): a kinetic round's own; a shaped charge's rides its blast (the larger of the two)
      const hole = kinetic > 0 ? penetratorHoleRadiusM(spec) : 0;
      if (struck && kinetic > 0) {
        structures.applyPoints(struck, kinetic, setBlow('kinetic', munition, x, y, z, dirX, dirZ, charge > 0 ? 0 : hole));
      }
      if (charge > 0) {
        structures.applyBlast(charge, munition, setBlow('blast', munition, x, y, z, dirX, dirZ, hole), struck);
        options.onBlast?.(x, y, z, charge);
      }
      return craterId;
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
    get craters() { return craterCount; },
    step() {
      cratersThisTick = 0;
      if (!structures) return;
      structures.step();
      stepEvents.length = 0;
      structures.drainEvents(stepEvents);
      for (const event of stepEvents) {
        log.push({ kind: 'stage', structureId: event.structureId, stage: event.stage, cx: event.cx, cz: event.cz });
        outbox.push(event);
      }
      stepBreaches.length = 0;
      structures.drainBreaches(stepBreaches);
      for (const event of stepBreaches) {
        log.push({ kind: 'breach', structureId: event.structureId, section: event.section, hole: event.hole,
          x: event.x, y: event.y, z: event.z, radiusM: event.radiusM, sectionDown: event.sectionDown, cx: event.cx, cz: event.cz });
        breachOutbox.push(event);
      }
    },
    drainEvents(out) {
      if (!outbox.length) return 0;
      const count = outbox.length;
      for (const event of outbox) out.push(event);
      outbox.length = 0;
      return count;
    },
    drainBreaches(out) {
      if (!breachOutbox.length) return 0;
      const count = breachOutbox.length;
      for (const event of breachOutbox) out.push(event);
      breachOutbox.length = 0;
      return count;
    },
    drainCraters(out) {
      if (!craterOutbox.length) return 0;
      const count = craterOutbox.length;
      for (const event of craterOutbox) out.push(event);
      craterOutbox.length = 0;
      return count;
    },
    restore(entries) {
      // the previous authority's log is kept verbatim (its revision continues); what this world can apply, it applies
      let applied = 0;
      for (const entry of entries) {
        log.push({ ...entry });
        if (entry.kind === 'stage' && structures?.restoreStage(entry.structureId, entry.stage as StructureStage)) applied++;
        if (entry.kind === 'breach' && structures && structures.restoreBreach(entry.structureId, entry.section, entry.hole,
          entry.x, entry.y, entry.z, entry.radiusM, entry.sectionDown) >= 0) applied++;
        if (entry.kind === 'crater') {
          // the previous authority's crater, as it stamped it (its id continues the count; a full bucket stays a mark)
          if (ground?.addCrater(entry.x, entry.z, entry.radiusM, entry.depthM, entry.rimM, entry.seed)) applied++;
          craterCount = Math.max(craterCount, entry.craterId + 1);
        }
      }
      return applied;
    },
  };
}
