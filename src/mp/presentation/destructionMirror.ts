/**
 * The authority's destruction on a peer's own world (destruction core lane, 2026-10-07; docs/DESTRUCTION.md §8).
 *
 * The host decides every stage; a peer lays them on its world so what it predicts and what it shows agree with the
 * authority: a collapsed structure's records stop pushing the predicted hull and stop its own sight and aim rays, and
 * its heap joins the ground the prediction rides (the mirror's wrapped height field). Live `structure_stage` events
 * animate; the snapshot's destruction log lays down, settled, every stage this seat did not see happen (a late joiner,
 * a rejoin, a reconnect's lost events, a migration) — except a stage whose event is still owed to the presentation.
 *
 * Structures are found in this world by the authority's id when that id names the same footprint here (the ids are the
 * build order of the same placements), else by the identity the event carries (footprint centre within 5 cm, the same
 * mass class); a stage for a structure this world does not have changes nothing here. Every applied stage is emitted on
 * the bus as `structure:stage` with this world's structure id, for the presentation's collapse and its sound.
 */
import { DESTRUCTION_BUS_EVENTS, type DestructionLogEntry, type StructureStage, type StructureStageEvent } from '../../sim/destructionEvents.ts';
import { resetStructureRecords } from '../../sim/destructionMatch.ts';
import { createStructureDamage, STAGE_ORDER, type StructureDamage, type StructureState } from '../../sim/structureDamage.ts';
import {
  createDeformedHeightField, createTerrainDeformation, rubbleHeightFor, type DeformableHeightField, type TerrainDeformation,
} from '../../sim/terrainDeformation.ts';
import type { CollisionRecord } from '../../world/collision.ts';

/** A footprint centre within this of the event's is the same structure. */
const IDENTITY_TOLERANCE_M = 0.05;

interface MirrorWorld {
  heightField?: DeformableHeightField | null;
  getObstacles?(): CollisionRecord[];
  getColliders?(): CollisionRecord[];
}

interface MirrorBus {
  emit(event: string, payload: unknown): void;
}

export interface DestructionMirror {
  /** The world's ground plus this round's heaps (null without a world height field): the prediction rides it. */
  readonly groundField: DeformableHeightField | null;
  readonly ground: TerrainDeformation;
  readonly structures: StructureDamage | null;
  /** A live `structure_stage` (the event's payload): applied and emitted unless this world already stands at it. */
  applyStageEvent(payload: Record<string, unknown>): StructureState | null;
  /** The snapshot's log: every stage not yet applied here and not owed to an event, laid down settled. */
  applyLog(entries: readonly DestructionLogEntry[], pending: ((structureId: number) => boolean) | null): void;
}

const finite = (value: unknown, fallback = 0): number => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);

export function createDestructionMirror(world: MirrorWorld | null, bus: MirrorBus | null): DestructionMirror {
  const ground = createTerrainDeformation();
  const obstacles = world?.getObstacles?.() ?? [];
  const colliders = world?.getColliders?.() ?? [];
  // a cached world comes back from its last battle (solo or another round): its buildings stand again first
  resetStructureRecords(obstacles, colliders);
  const hasGroups = obstacles.some((record) => record.structureIdx !== undefined);
  const structures = hasGroups
    ? createStructureDamage(obstacles, colliders, {
      onCollapse: (structure) => ground.addRubble(structure.cx, structure.cz, structure.hw, structure.hd, structure.yaw,
        rubbleHeightFor(structure.topY - structure.baseY)),
    })
    : null;
  const groundField = world?.heightField && typeof world.heightField.getHeightAt === 'function'
    ? createDeformedHeightField(world.heightField, ground) : null;
  /** Authority id → this world's structure, learned from events when the ids disagree. */
  const learned = new Map<number, StructureState>();
  let idsShared = true;
  let settledUpTo = 0;

  function byIdentity(cx: number, cz: number, massClass: unknown): StructureState | null {
    if (!structures) return null;
    for (const structure of structures.structures) {
      if (Math.abs(structure.cx - cx) <= IDENTITY_TOLERANCE_M && Math.abs(structure.cz - cz) <= IDENTITY_TOLERANCE_M
        && (typeof massClass !== 'string' || structure.massClass === massClass)) return structure;
    }
    return null;
  }

  function resolveEvent(payload: Record<string, unknown>): StructureState | null {
    if (!structures) return null;
    const id = Number(payload.structureId);
    const cx = finite(payload.cx, NaN), cz = finite(payload.cz, NaN);
    const hasIdentity = Number.isFinite(cx) && Number.isFinite(cz);
    const direct = Number.isSafeInteger(id) ? structures.byId(id) : null;
    if (direct && (!hasIdentity
      || (Math.abs(direct.cx - cx) <= IDENTITY_TOLERANCE_M && Math.abs(direct.cz - cz) <= IDENTITY_TOLERANCE_M))) {
      return direct;
    }
    if (!hasIdentity) return null;
    // the ids disagree in this world (laid out otherwise): find it by its footprint, and remember the pairing
    idsShared = false;
    const found = byIdentity(cx, cz, payload.massClass);
    if (found && Number.isSafeInteger(id)) learned.set(id, found);
    return found;
  }

  function resolveLogged(entry: { structureId: number; cx?: number; cz?: number }): StructureState | null {
    if (!structures) return null;
    const known = learned.get(entry.structureId);
    if (known) return known;
    const direct = structures.byId(entry.structureId);
    const hasIdentity = Number.isFinite(entry.cx) && Number.isFinite(entry.cz);
    if (!hasIdentity) return idsShared ? direct : null;
    if (direct && Math.abs(direct.cx - entry.cx!) <= IDENTITY_TOLERANCE_M && Math.abs(direct.cz - entry.cz!) <= IDENTITY_TOLERANCE_M) {
      return direct;
    }
    idsShared = false;
    const found = byIdentity(entry.cx!, entry.cz!, undefined);
    if (found) learned.set(entry.structureId, found);
    return found;
  }

  function emit(structure: StructureState, stage: StructureStage, previous: StructureStage, settled: boolean,
    payload: Record<string, unknown> | null): void {
    if (!bus) return;
    const event: StructureStageEvent = {
      structureId: structure.id, massClass: structure.massClass,
      cx: structure.cx, cz: structure.cz, hw: structure.hw, hd: structure.hd, yaw: structure.yaw,
      baseY: structure.baseY, topY: structure.topY,
      stage, previous,
      cause: payload?.cause === 'ram' || payload?.cause === 'kinetic' ? payload.cause : 'blast',
      munition: typeof payload?.munition === 'string' ? payload.munition as StructureStageEvent['munition'] : null,
      x: finite(payload?.x, structure.cx), y: finite(payload?.y, structure.baseY), z: finite(payload?.z, structure.cz),
      dirX: finite(payload?.dirX, 0), dirZ: finite(payload?.dirZ, 1),
      points: finite(payload?.points, 0), integrity: finite(payload?.integrity, 0),
      ...(settled ? { settled: true } : {}),
    };
    bus.emit(DESTRUCTION_BUS_EVENTS.stage, event);
  }

  function apply(structure: StructureState, stage: StructureStage, settled: boolean, payload: Record<string, unknown> | null): boolean {
    const target = STAGE_ORDER.indexOf(stage);
    if (target < 0 || target <= structure.stage) return false;
    const previous = STAGE_ORDER[structure.stage]!;
    if (!structures!.restoreStage(structure.id, stage)) return false;
    emit(structure, stage, previous, settled, payload);
    return true;
  }

  return {
    groundField,
    ground,
    structures,
    applyStageEvent(payload) {
      const structure = resolveEvent(payload);
      if (!structure) return null;
      const stage = payload.stage;
      if (stage !== 'damaged' && stage !== 'breached' && stage !== 'collapsed') return null;
      apply(structure, stage, false, payload);
      return structure;
    },
    applyLog(entries, pending) {
      if (!structures || settledUpTo >= entries.length) return;
      let stuck = false;
      for (let i = settledUpTo; i < entries.length; i++) {
        const entry = entries[i]!;
        if (entry.kind === 'stage') {
          // its event is still on its way: the stage belongs to it (it animates then)
          if (pending && pending(entry.structureId)) { stuck = true; continue; }
          const structure = resolveLogged(entry);
          if (structure) apply(structure, entry.stage, true, null);
        }
        if (!stuck) settledUpTo = i + 1;
      }
    },
  };
}
