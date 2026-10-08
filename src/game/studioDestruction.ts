/**
 * studioDestruction.ts — the Studio's destruction, run by the core's own rules (destruction core lane, P2, 2026-10-08;
 * docs/DESTRUCTION.md §3.4, §11).
 *
 * A Studio scene films what a battle does: a round striking a wall opens the sim's hole there (or brings its section
 * down — a wall panel to its stub, the roof, a storey after it), a later round traced through the world (whose raycast
 * reads the openings) flies through the hole and strikes the far wall's inner face, and a building takes its stages and
 * comes down. This runs one destruction match (sim/destructionMatch.ts, sections on, whatever the battle switch says)
 * over the Studio world's own records and raises its events on the Studio's bus under the names the solo step raises
 * them (`structure:stage`, `structure:breach`), so the presentation draws exactly what a battle would. `reset` stands
 * every building up again (a scene load, the Studio's exit).
 *
 * The Studio wires it (studio.ts): a wall strike traces the world from the effect along its heading and calls `strike`
 * with the record it met; its flying rounds trace each step's segment and call `strike` where they meet a structure;
 * a ram effect calls `ram` where an actor's nose meets a wall; `step` runs once per fixed step after them.
 */
import type { CollisionRecord } from '../world/collision.ts';
import { DESTRUCTION_BUS_EVENTS, type DestructionRules, type StructureBreachEvent, type StructureStageEvent } from '../sim/destructionEvents.ts';
import { createDestructionMatch, resetStructureRecords, type DestructionMatch } from '../sim/destructionMatch.ts';
import type { MunitionShellLike } from '../sim/munitionBlast.ts';
import type { StructureMaterial } from '../sim/structureMaterial.ts';
import type { TerrainDeformation } from '../sim/terrainDeformation.ts';

interface StudioWorld {
  getObstacles(): CollisionRecord[];
  getColliders?(): CollisionRecord[];
}

interface StudioBus {
  emit(event: string, payload: unknown): void;
}

export interface StudioDestruction {
  /** The match the Studio runs (its structures, sections and log): the receipts and the panel read it. */
  readonly match: DestructionMatch;
  /** A round meeting the world at (x, y, z) heading (dirX, dirZ): `record` the record it met (null on the ground). */
  strike(spec: MunitionShellLike, record: CollisionRecord | null, x: number, y: number, z: number, dirX: number, dirZ: number): void;
  /**
   * A hull of `massTons` ramming the structure `record` belongs to at `closingMps`, its nose at (x, y, z) heading
   * (dirX, dirZ), as the authority prices a ram (§4.4): when the ram brings it down the structure yields and this returns
   * the share of its speed the hull keeps; otherwise the crash is priced and this returns null (it holds).
   */
  ram(record: CollisionRecord, massTons: number, closingMps: number, x: number, y: number, z: number, dirX: number, dirZ: number): number | null;
  /** One fixed step: queued collapses, then this step's stages and breaches raised on the bus (the solo step's order). */
  step(): void;
  /** Stand every building up again and start a fresh match over the same records. */
  reset(): void;
}

export interface StudioDestructionOptions {
  /** The battle's destruction block to film (the standard ruleset's); sections are on in the Studio regardless. */
  rules: DestructionRules;
  /** The map's walls (structureMaterial.ts): a ram's and a hole's material. */
  wallMaterial?: StructureMaterial;
  /** The ground overlay a collapse raises its rubble mound on, as a battle's does (the Studio's own, bound to its world
   * so the drawn terrain and the kit's pile follow it; the caller resets it with the scene). */
  ground?: TerrainDeformation | null;
}

export function createStudioDestruction(world: StudioWorld, bus: StudioBus, options: StudioDestructionOptions): StudioDestruction {
  const obstacles = world.getObstacles();
  const colliders = world.getColliders ? world.getColliders() : [];
  const rules: DestructionRules = { ...options.rules, structures: true, sections: true };
  const stages: StructureStageEvent[] = [];
  const breaches: StructureBreachEvent[] = [];
  const build = (): DestructionMatch => {
    resetStructureRecords(obstacles, colliders);
    return createDestructionMatch({ rules, obstacles, colliders, wallMaterial: options.wallMaterial, ground: options.ground ?? null });
  };
  let match = build();
  return {
    get match() { return match; },
    strike(spec, record, x, y, z, dirX, dirZ) {
      match.shellWorldHit(spec, record, x, y, z, dirX, dirZ, !record);
    },
    ram(record, massTons, closingMps, x, y, z, dirX, dirZ) {
      const keep = match.ramThrough(record, massTons, closingMps, closingMps, x, y, z, dirX, dirZ);
      if (keep === null) match.ram(record, massTons, closingMps, 0, x, y, z, dirX, dirZ);
      return keep;
    },
    step() {
      match.step();
      stages.length = 0;
      match.drainEvents(stages);
      for (const event of stages) bus.emit(DESTRUCTION_BUS_EVENTS.stage, event);
      breaches.length = 0;
      match.drainBreaches(breaches);
      for (const event of breaches) bus.emit(DESTRUCTION_BUS_EVENTS.breach, event);
    },
    reset() {
      match = build();
    },
  };
}
