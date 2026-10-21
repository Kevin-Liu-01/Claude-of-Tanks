/**
 * The proving ground in the solo battle (v2 progression, owner 2026-10-17: "build out all the options": proving ground /
 * test drive). game/state.ts seats a proving-ground battle through these helpers: the range laid out on the battlefield
 * (sim/provingGround.ts planProvingRange over the world's ground and solids), the firing line and the lane marks as spawns,
 * the range card from the seated hulls, and the moving-target drive. The rules are the ruleset's (sim/matchRuleset.ts
 * PROVING_GROUND_RULES); nothing here reads a mode literal, a wall clock or Math.random.
 */
import { collisionFootprintContainsPoint, type CollisionRecord } from '../world/collision.ts';
import { placementTerrainSafe, type PlacementTerrain } from '../sim/matchPlacement.ts';
import type { ProvingGroundRules } from '../sim/matchRuleset.ts';
import type { ProvingLanePresentation, ProvingRangePresentation } from '../sim/matchModes.ts';
import type { HitEvent } from '../sim/damage.ts';
import {
  planProvingRange, provingCentreAim, provingPatrolInput, provingShellCard,
  type ProvingLaneMark, type ProvingMark, type ProvingPatrolState, type ProvingRangeLayout,
} from '../sim/provingGround.ts';
import type { DamageShellSpec } from '../sim/damage.ts';
import type { ArmorModel, ArmorPoseState } from '../sim/armor.ts';

interface ProvingWorld {
  readonly heightField: PlacementTerrain;
  getObstacles(): readonly CollisionRecord[];
  queryObstacles?: (minX: number, minZ: number, maxX: number, maxZ: number, out: CollisionRecord[]) => readonly CollisionRecord[];
}

const _scratch: CollisionRecord[] = [];

/** True where a hull of `radius` may stand: dry, level, firm ground (the placement's own test) clear of every solid. */
function standableOn(world: ProvingWorld, rules: ProvingGroundRules, x: number, z: number, radius: number): boolean {
  if (!placementTerrainSafe(world.heightField, { x, z }, { radius, relief: rules.markRelief, normalY: rules.markNormalY })) return false;
  _scratch.length = 0;
  const records = world.queryObstacles
    ? world.queryObstacles(x - radius, z - radius, x + radius, z + radius, _scratch) : world.getObstacles();
  const floor = world.heightField.getHeightAt(x, z);
  for (const record of records) {
    if (record.crushed || record.dead) continue;
    if (record.max[1] < floor - 0.5 || record.min[1] > floor + 5) continue;
    if (x < record.min[0] - radius || x > record.max[0] + radius || z < record.min[2] - radius || z > record.max[2] + radius) continue;
    if (collisionFootprintContainsPoint(record, x, z, radius)) return false;
  }
  return true;
}

/** The range laid out on this battlefield (fails closed: sim/provingGround.ts planProvingRange). */
export function planSoloProvingRange(rules: ProvingGroundRules, world: ProvingWorld): ProvingRangeLayout {
  return planProvingRange(rules, {
    heightAt: (x, z) => world.heightField.getHeightAt(x, z),
    standable: (x, z, radius) => standableOn(world, rules, x, z, radius),
  });
}

/** The spawn a proving-ground seat takes: the firing line for the player, lane `index`'s mark for a target. */
export function provingSpawn(layout: ProvingRangeLayout, isPlayer: boolean, index: number): ProvingMark | null {
  if (isPlayer) return layout.origin;
  return layout.lanes[index] ?? null;
}

interface ProvingSeat {
  readonly id: string;
  readonly specId: string;
  readonly state: ArmorPoseState & { readonly pos: { readonly x: number; readonly y: number; readonly z: number } };
  readonly spec: {
    readonly name: string;
    readonly label?: { readonly displayName?: string } | null;
    readonly armor: ArmorModel;
    readonly dims: { readonly heightM: number };
    readonly gun: { readonly shells: readonly DamageShellSpec[] };
  };
}

/**
 * The range as the HUD, the minimap and the receipts read it: each lane's mark, the target hull seated on it, and every
 * round of the player's loadout measured at the lane's range against that hull's centre of mass and the reference plates.
 */
export function provingRangePresentation(
  rules: ProvingGroundRules,
  layout: ProvingRangeLayout,
  player: ProvingSeat,
  targets: readonly (ProvingSeat | null)[],
  heightAt: (x: number, z: number) => number,
): ProvingRangePresentation {
  const sight = { x: layout.origin.x, y: heightAt(layout.origin.x, layout.origin.z) + rules.sightHeightM, z: layout.origin.z };
  const lanes: ProvingLanePresentation[] = layout.lanes.map((lane: ProvingLaneMark) => {
    const target = targets[lane.index] ?? null;
    const aim = target ? provingCentreAim(sight, target) : null;
    return {
      index: lane.index, rangeM: lane.rangeM, presentDeg: lane.presentDeg, x: lane.x, z: lane.z,
      targetId: target?.id ?? '', targetSpecId: target?.specId ?? '',
      targetName: target ? (target.spec.label?.displayName || target.spec.name) : '',
      shells: player.spec.gun.shells.map((shell) => provingShellCard(shell, lane.measuredM, aim, rules.plateAnglesDeg)),
    };
  });
  const course = layout.course;
  return {
    mapId: rules.mapId, moving: rules.moving, plateAnglesDeg: [...rules.plateAnglesDeg],
    origin: { x: layout.origin.x, z: layout.origin.z }, lanes,
    plates: layout.plates.map((plate) => ({
      index: plate.index, id: plate.id, mm: plate.mm, angleDeg: plate.angleDeg, rangeM: plate.rangeM,
      x: plate.x, y: plate.y, z: plate.z, groundY: plate.groundY, yaw: plate.yaw,
      widthM: plate.halfW * 2, heightM: plate.halfH * 2, strikes: [],
    })),
    course: {
      yaw: course.yaw, widthM: course.widthM, start: { ...course.start }, end: { ...course.end },
      features: course.features.map((feature) => ({
        kind: feature.kind, x0: feature.x0, z0: feature.z0, x1: feature.x1, z1: feature.z1,
        first: feature.first, second: feature.second,
      })),
    },
    lastShot: null,
  };
}

interface ProvingDriven {
  readonly state: { readonly pos: { readonly x: number; readonly z: number }; readonly yaw: number; readonly speed: number };
  readonly input: { throttle: number; steer: number; brake: boolean; fire: boolean };
  _provingMark?: ProvingMark | null;
  _provingPatrol?: ProvingPatrolState | null;
}

/**
 * One step of a proving-ground target's drive: with moving targets on, shuttle about its mark (sim/provingGround.ts
 * provingPatrolInput); off, hold still on it. A target never fires.
 */
export function driveProvingTarget(entity: ProvingDriven, rules: ProvingGroundRules): void {
  const mark = entity._provingMark;
  if (!mark) return;
  entity.input.fire = false;
  if (!rules.moving) {
    entity.input.throttle = 0;
    entity.input.steer = 0;
    entity.input.brake = true;
    return;
  }
  entity.input.brake = false;
  provingPatrolInput(mark, entity.state, rules.patrol, entity._provingPatrol ??= { dir: 1 }, entity.input);
}

/** The marks a plate keeps (its oldest go first). */
export const PROVING_STRIKE_MARKS = 24;

/**
 * The player's hit on the range, recorded for the range card and the plate dressing (only the player's, only on a lane's
 * hull or a plate): the last shot's readout, and on a plate its mark on the face, across and up from the face's centre.
 * Called once a hit, never a frame.
 */
export function noteProvingHit(
  range: ProvingRangePresentation,
  layout: ProvingRangeLayout,
  event: HitEvent & { targetName?: string; flightDistM?: number; attackerSpecId?: string },
): void {
  const targetId = event.targetId;
  if (!targetId) return;
  const lane = range.lanes.find((entry) => entry.targetId === targetId);
  const index = layout.plates.findIndex((plate) => plate.id === targetId);
  if (!lane && index < 0) return;
  range.lastShot = {
    serial: (range.lastShot?.serial ?? 0) + 1,
    kind: event.kind, targetId, targetName: event.targetName ?? lane?.targetName ?? '', shellName: event.shellName,
    attackerSpecId: event.attackerSpecId ?? '', shellType: event.shellType,
    rangeM: event.flightDistM ?? 0, penRollMm: event.penRollMm, effectiveMm: event.effectiveMm,
    impactAngleDeg: event.impactAngleDeg, damage: event.damage,
  };
  if (index < 0) return;
  const plate = layout.plates[index];
  const [x, y, z] = event.pos;
  const dx = x - plate.x, dy = y - plate.y, dz = z - plate.z;
  const marks = range.plates[index].strikes;
  if (marks.length >= PROVING_STRIKE_MARKS) marks.shift();
  marks.push({
    u: dx * plate.rx + dz * plate.rz, v: dx * plate.ux + dy * plate.uy + dz * plate.uz,
    kind: event.kind === 'ricochet' ? 'ricochet' : event.kind === 'pen' || event.kind === 'he_pen' ? 'pen' : 'nonpen',
  });
}

/** A reset's clean range: no last shot, every plate's face clean. */
export function clearProvingMarks(range: ProvingRangePresentation): void {
  range.lastShot = null;
  for (const plate of range.plates) plate.strikes.length = 0;
}
