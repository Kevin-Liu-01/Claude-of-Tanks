/**
 * studioDestruction.ts — the Studio's destruction, run by the core's own rules (destruction core lane, P2, 2026-10-08;
 * docs/DESTRUCTION.md §3.4, §11).
 *
 * A Studio scene films what a battle does: a round striking a wall opens the sim's hole there (or brings its section
 * down — a wall panel to its stub, the roof, a storey after it), a later round traced through the world (whose raycast
 * reads the openings) flies through the hole and strikes the far wall's inner face, and a building takes its stages and
 * comes down. This runs one destruction match (sim/destructionMatch.ts, sections on unless the scene films the battle's P1)
 * over the Studio world's own records and raises its events on the Studio's bus under the names the solo step raises
 * them (`structure:stage`, `structure:breach`), so the presentation draws exactly what a battle would. `reset` stands
 * every building up again (a scene load, the Studio's exit).
 *
 * The Studio wires it (studio.ts): a wall strike traces the world from the effect along its heading and calls `strike`
 * with the record it met; its flying rounds trace each step's segment and call `strike` where they meet a structure or
 * the ground; a ram effect calls `ram` where an actor's nose meets a wall; `step` runs once per fixed step after them.
 *
 * A burst fells the light props within its reach as a battle's does (2026-10-09; the owner: "destructible props must
 * break properly"): the solo step's fellBlastProps (game/state.ts) and the authority's fellPropsByBlast, restated over the
 * Studio world's records — props within 1.2 · W^⅓ of a burst of 2 kg or more, nearest first, at most PROP_FELL_PER_BLAST
 * a burst and PROP_FELL_PER_TICK a step, each by the world's own crush (its broken state, its debris, its sound). Before,
 * a Studio round broke only the light cover it flew through (a hut, a box truck): a fence, a crate or a car beside its
 * burst stood untouched.
 */
import type { CollisionRecord } from '../world/collision.ts';
import { DESTRUCTION_BUS_EVENTS, type DestructionRules, type StructureBreachEvent, type StructureStageEvent } from '../sim/destructionEvents.ts';
import { createDestructionMatch, resetStructureRecords, type DestructionMatch } from '../sim/destructionMatch.ts';
import { PROP_FELL_PER_BLAST, PROP_FELL_PER_TICK, propFellRadiusM, type MunitionShellLike } from '../sim/munitionBlast.ts';
import type { StructureMaterial } from '../sim/structureMaterial.ts';
import type { TerrainDeformation } from '../sim/terrainDeformation.ts';

interface StudioWorld {
  getObstacles(): CollisionRecord[];
  getColliders?(): CollisionRecord[];
  /** The movement records in a box (the world's broad phase): a burst's light props. */
  queryObstacles?(minX: number, minZ: number, maxX: number, maxZ: number, out: CollisionRecord[]): CollisionRecord[];
  /** The world's crush of a prop (props.ts breakRecord through map.ts crushObstacle): its broken state, debris, sound. */
  crushObstacle?(record: CollisionRecord, dirX: number, dirZ: number, speedMps?: number, cause?: 'ram' | 'shell'): boolean;
}

interface StudioBus {
  emit(event: string, payload: unknown): void;
}

export interface StudioDestruction {
  /** The match the Studio runs (its structures, sections and log): the receipts and the panel read it. */
  readonly match: DestructionMatch;
  /**
   * A round meeting the world at (x, y, z) heading (dirX, dirZ): `record` the record it met (null on the ground). `dig`:
   * the match digs a crater for a burst on the ground (default: on the ground); the Studio digs its own (studio.ts
   * studioDig, one crater count with its explosion effects) and passes false.
   */
  strike(spec: MunitionShellLike, record: CollisionRecord | null, x: number, y: number, z: number, dirX: number, dirZ: number,
    dig?: boolean): void;
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
  /** The battle's destruction block to film (the standard ruleset's). */
  rules: DestructionRules;
  /**
   * Sections (P2) on or off: on by default (the motion strips film the cascade); a scene that films what a battle plays
   * today (`destruction: { sections: false }`, every battle mode's switch) runs the P1 rules, so a collapse is the
   * crumble front over the whole building, not a storey cascade.
   */
  sections?: boolean;
  /** The map's walls (structureMaterial.ts): a ram's and a hole's material. */
  wallMaterial?: StructureMaterial;
  /** The ground overlay a collapse raises its rubble mound on, as a battle's does (the Studio's own, bound to its world
   * so the drawn terrain and the kit's pile follow it; the caller resets it with the scene). */
  ground?: TerrainDeformation | null;
}

export function createStudioDestruction(world: StudioWorld, bus: StudioBus, options: StudioDestructionOptions): StudioDestruction {
  const obstacles = world.getObstacles();
  const colliders = world.getColliders ? world.getColliders() : [];
  const rules: DestructionRules = { ...options.rules, structures: true, sections: options.sections !== false };
  const stages: StructureStageEvent[] = [];
  const breaches: StructureBreachEvent[] = [];
  /** This step's bursts (x, y, z, kg), felled in step() before the match steps, as the solo step's stepDestruction does. */
  const blasts: number[] = [];
  const candidates: CollisionRecord[] = [], felled: CollisionRecord[] = [];
  const centreDistance = (record: CollisionRecord, x: number, z: number): number =>
    Math.hypot((record.min[0] + record.max[0]) * 0.5 - x, (record.min[2] + record.max[2]) * 0.5 - z);
  /** The solo step's fellBlastProps over the Studio world (game/state.ts; the receipt holds the two to one rule). */
  function fellBlastProps(): void {
    if (!blasts.length) return;
    if (!world.queryObstacles || !world.crushObstacle) { blasts.length = 0; return; }
    let budget = PROP_FELL_PER_TICK;
    for (let b = 0; b < blasts.length && budget > 0; b += 4) {
      const x = blasts[b], y = blasts[b + 1], z = blasts[b + 2], radius = propFellRadiusM(blasts[b + 3]);
      if (!(radius > 0)) continue;
      world.queryObstacles(x - radius, z - radius, x + radius, z + radius, candidates);
      felled.length = 0;
      for (const obstacle of candidates) {
        if (!obstacle.crushable || obstacle.crushed || obstacle.min[1] > y + radius) continue;
        if (centreDistance(obstacle, x, z) <= radius) felled.push(obstacle);
      }
      felled.sort((a, c) => centreDistance(a, x, z) - centreDistance(c, x, z) || obstacles.indexOf(a) - obstacles.indexOf(c));
      const fell = Math.min(felled.length, PROP_FELL_PER_BLAST, budget);
      budget -= fell;
      for (let i = 0; i < fell; i++) {
        const obstacle = felled[i];
        const dx = (obstacle.min[0] + obstacle.max[0]) * 0.5 - x, dz = (obstacle.min[2] + obstacle.max[2]) * 0.5 - z;
        const length = Math.hypot(dx, dz) || 1;
        obstacle.crushed = true;
        world.crushObstacle(obstacle, dx / length, dz / length, 6, 'shell');
      }
    }
    blasts.length = 0;
    candidates.length = 0;
    felled.length = 0;
  }
  const build = (): DestructionMatch => {
    resetStructureRecords(obstacles, colliders);
    blasts.length = 0;
    return createDestructionMatch({ rules, obstacles, colliders, wallMaterial: options.wallMaterial, ground: options.ground ?? null,
      onBlast: (x, y, z, chargeKg) => { blasts.push(x, y, z, chargeKg); } });
  };
  let match = build();
  return {
    get match() { return match; },
    strike(spec, record, x, y, z, dirX, dirZ, dig = !record) {
      match.shellWorldHit(spec, record, x, y, z, dirX, dirZ, dig && !record);
    },
    ram(record, massTons, closingMps, x, y, z, dirX, dirZ) {
      const keep = match.ramThrough(record, massTons, closingMps, closingMps, x, y, z, dirX, dirZ);
      if (keep === null) match.ram(record, massTons, closingMps, 0, x, y, z, dirX, dirZ);
      return keep;
    },
    step() {
      // the step's bursts fell their light props first, in report order (the solo step's stepDestruction alike)
      fellBlastProps();
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
