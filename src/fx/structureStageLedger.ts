/**
 * structureStageLedger.ts — what the FX side has laid for each building (2026-11-02 audit F10).
 *
 * The simulation raises each structure's stage crossing once (sim/destructionEvents.ts: intact → damaged → breached →
 * collapsed, forward only) and each section's hole or fall once (a hole slot within a section is never reused). The FX
 * side trusted that: nothing checked "already laid" before acting, so a replayed or doubled event (a reconnect, a late
 * joiner's settled events over an FX graph that was not reset, a bus that delivered twice) re-stamped the mask's
 * collapse (the building stood up and fell again), re-ran the stage builders (rubble laid twice) and re-cut the hole.
 * The ledger is the one owner of "what this building shows": a stage is admitted only above the highest laid for its
 * structure, a breach once per (structure, section, hole); the runtime's resetAll clears it with everything else.
 *
 * Node-only, no three.
 */
import type { StructureStage } from '../sim/destructionEvents.ts';

const STAGE_RANK: Readonly<Record<StructureStage, number>> = Object.freeze({ intact: 0, damaged: 1, breached: 2, collapsed: 3 });

export interface StructureStageLedger {
  /** True once per structure and stage, in rising order: lay it. False: laid already (or a lower stage: lay nothing). */
  admitStage(e: { readonly structureId: number; readonly stage: StructureStage }): boolean;
  /** True once per structure, section and hole (255: the section's fall). */
  admitBreach(e: { readonly structureId: number; readonly section: number; readonly hole: number }): boolean;
  /** The highest stage laid for a structure (null: none). */
  laid(structureId: number): StructureStage | null;
  reset(): void;
}

export function createStructureStageLedger(): StructureStageLedger {
  const laid = new Map<number, StructureStage>();
  const breaches = new Set<string>();
  return {
    admitStage(e) {
      const rank = STAGE_RANK[e.stage];
      if (rank === undefined) return false;
      const before = laid.get(e.structureId);
      if (before !== undefined && rank <= STAGE_RANK[before]) return false;
      laid.set(e.structureId, e.stage);
      return true;
    },
    admitBreach(e) {
      const key = `${e.structureId}:${e.section}:${e.hole}`;
      if (breaches.has(key)) return false;
      breaches.add(key);
      return true;
    },
    laid(structureId) { return laid.get(structureId) ?? null; },
    reset() { laid.clear(); breaches.clear(); },
  };
}
