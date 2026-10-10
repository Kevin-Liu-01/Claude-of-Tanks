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
 *
 * Holes and section falls (P2, `structure_breach`) open this world's structure as the authority's opened (its quantized
 * point, in the section at that point here), so its own shells, sight and aim pass them as the host's do, and are
 * emitted as `structure:breach`; the log lays down, settled, those this seat did not see.
 */
import {
  DESTRUCTION_BUS_EVENTS, MUNITION_CLASSES, type DestructionLogEntry, type MunitionClass, type StructureBreachEvent,
  type StructureStage, type StructureStageEvent, type TerrainCraterEvent,
} from '../../sim/destructionEvents.ts';
import { resetStructureRecords } from '../../sim/destructionMatch.ts';
import { createStructureDamage, STAGE_ORDER, type StructureDamage, type StructureState } from '../../sim/structureDamage.ts';
import { sectionKind, sectionNormal, sectionSpan, storeyDownAt } from '../../sim/structureSections.ts';
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
  applyLog(entries: readonly DestructionLogEntry[], pending: ((structureId: number) => boolean) | null,
    craterPending?: ((craterId: number) => boolean) | null): void;
  /** A live `terrain_crater` (P3): stamped on this world's ground once (the log never stamps it again); emits terrain:crater. */
  applyCraterEvent(payload: Record<string, unknown>): boolean;
  /** A live `structure_breach` (P2): the hole or the fall opened on this world's structure once; emits structure:breach. */
  applyBreachEvent(payload: Record<string, unknown>): StructureState | null;
  /** This world's structure for an authority id, when known (the same id where the layouts agree), else null. */
  localId(authorityId: number): number | null;
  /** The match plays sections (its ruleset's `destruction.sections`): every stage this mirror raises says so (P2). */
  setSections(on: boolean): void;
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
      // a structure's sections are derived when the authority first opens one (nothing costs until then)
      sections: true,
    })
    : null;
  const groundField = world?.heightField && typeof world.heightField.getHeightAt === 'function'
    ? createDeformedHeightField(world.heightField, ground) : null;
  /** Authority id → this world's structure, learned from events when the ids disagree. */
  const learned = new Map<number, StructureState>();
  /** Crater ids stamped on this world's ground (an event and the log name the same crater). */
  const cratered = new Set<number>();
  /** Stamp a crater once, as the authority did (its values arrive quantized as it stamped them), and emit it. */
  function crater(entry: { craterId: number; x: number; z: number; radiusM: number; depthM: number; rimM: number; seed: number },
    munition: MunitionClass, settled: boolean): boolean {
    if (!Number.isSafeInteger(entry.craterId) || cratered.has(entry.craterId)) return false;
    cratered.add(entry.craterId);
    const deforms = ground.addCrater(entry.x, entry.z, entry.radiusM, entry.depthM, entry.rimM, entry.seed);
    const event: TerrainCraterEvent = { craterId: entry.craterId, x: entry.x, z: entry.z, radiusM: entry.radiusM,
      depthM: entry.depthM, rimM: entry.rimM, seed: entry.seed, munition, deforms, ...(settled ? { settled: true } : {}) };
    bus?.emit(DESTRUCTION_BUS_EVENTS.crater, event);
    return true;
  }
  let idsShared = true;
  let settledUpTo = 0;
  let sectionsOn = false;

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
      ...(sectionsOn || payload?.sections === true ? { sections: true } : {}),
      ...(settled ? { settled: true } : {}),
    };
    bus.emit(DESTRUCTION_BUS_EVENTS.stage, event);
  }

  const span = { y0: 0, y1: 0 };
  const normal = { x: 0, y: 0, z: 0 };
  /** Open the authority's hole or fall on this world's structure (once) and emit it with this world's section. */
  function breach(structure: StructureState, entry: { section: number; hole: number; x: number; y: number; z: number;
    radiusM: number; sectionDown: boolean }, munition: MunitionClass | null, settled: boolean): boolean {
    const section = structures!.restoreBreach(structure.id, entry.section, entry.hole, entry.x, entry.y, entry.z, entry.radiusM,
      entry.sectionDown);
    const sections = section >= 0 ? structures!.sectionsOf(structure) : null;
    if (!sections) return false;
    if (!bus) return true;
    sectionSpan(sections, section, span);
    sectionNormal(sections, section, normal);
    const event: StructureBreachEvent = {
      structureId: structure.id, massClass: structure.massClass,
      cx: structure.cx, cz: structure.cz, hw: structure.hw, hd: structure.hd, yaw: structure.yaw,
      baseY: structure.baseY, topY: structure.topY,
      section, sectionKind: sectionKind(sections, section), y0: span.y0, y1: span.y1,
      hole: entry.sectionDown ? 255 : entry.hole, x: entry.x, y: entry.y, z: entry.z, nx: normal.x, ny: normal.y, nz: normal.z,
      radiusM: entry.sectionDown ? 0 : entry.radiusM, munition, sectionDown: entry.sectionDown,
      ...(entry.sectionDown && storeyDownAt(sections, section) ? { storeyDown: true } : {}),
      ...(settled ? { settled: true } : {}),
    };
    bus.emit(DESTRUCTION_BUS_EVENTS.breach, event);
    return true;
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
    setSections(on) {
      sectionsOn = on === true;
    },
    localId(authorityId) {
      if (!structures || !Number.isSafeInteger(authorityId)) return null;
      const learnedStructure = learned.get(authorityId);
      if (learnedStructure) return learnedStructure.id;
      return idsShared ? structures.byId(authorityId)?.id ?? null : null;
    },
    applyLog(entries, pending, craterPending = null) {
      if (settledUpTo >= entries.length) return;
      let stuck = false;
      for (let i = settledUpTo; i < entries.length; i++) {
        const entry = entries[i]!;
        if (entry.kind === 'stage' && structures) {
          // its event is still on its way: the stage belongs to it (it animates then)
          if (pending && pending(entry.structureId)) { stuck = true; continue; }
          const structure = resolveLogged(entry);
          if (structure) apply(structure, entry.stage, true, null);
        } else if (entry.kind === 'breach' && structures) {
          // a structure with an event still on its way: its breaches belong to that event's order
          if (pending && pending(entry.structureId)) { stuck = true; continue; }
          const structure = resolveLogged(entry);
          if (structure) breach(structure, entry, null, true);
        } else if (entry.kind === 'crater') {
          if (craterPending && craterPending(entry.craterId)) { stuck = true; continue; }
          crater(entry, 'he', true);
        }
        if (!stuck) settledUpTo = i + 1;
      }
    },
    applyBreachEvent(payload) {
      const structure = resolveEvent(payload);
      if (!structure) return null;
      const munition = typeof payload.munition === 'string' && (MUNITION_CLASSES as readonly string[]).includes(payload.munition)
        ? payload.munition as MunitionClass : null;
      breach(structure, {
        section: finite(payload.section, -1), hole: finite(payload.hole, 255), x: finite(payload.x), y: finite(payload.y),
        z: finite(payload.z), radiusM: finite(payload.radiusM), sectionDown: payload.sectionDown === true,
      }, munition, false);
      return structure;
    },
    applyCraterEvent(payload) {
      const munition = typeof payload.munition === 'string' && (MUNITION_CLASSES as readonly string[]).includes(payload.munition)
        ? payload.munition as MunitionClass : 'he';
      return crater({ craterId: Number(payload.craterId), x: finite(payload.x), z: finite(payload.z), radiusM: finite(payload.radiusM),
        depthM: finite(payload.depthM), rimM: finite(payload.rimM), seed: finite(payload.seed) }, munition, false);
    },
  };
}
