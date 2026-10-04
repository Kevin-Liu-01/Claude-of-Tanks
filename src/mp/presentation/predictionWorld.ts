/**
 * The world the viewer's prediction integrates against: the map's height
 * field plus a collision resolver that mirrors the authority's contact
 * geometry — the playable bounds, static obstacles the hull cannot pass, and
 * the hulls of disclosed tanks (never a hidden one). Parity with the
 * authority's spec-derived footprint is what keeps a teammate contact from
 * becoming a correction loop; fast overruns of crushable dressing are left
 * to the authority so the local hull does not stop at a fence the next
 * snapshot is about to destroy.
 *
 * Disclosed hulls are presented one interpolation delay in the past. The
 * authority resolved every contact at the tick a reconciliation rewinds to, so
 * a presented hull its own pose penetrates is stale (a turning or reversing
 * hull's old pose): `anchor` seats that hull against the authority's pose —
 * shifted out by the penetration until the next rewind — so the replay meets
 * it where it can be, not where it used to be. Before, the replay started
 * inside it and ground its speed away every tick (client soak, 2026-10-01:
 * 2.2 m of misprediction beside an ally bot backing out of a human's way).
 * Dropping the hull instead loses a contact that is one tick away (a hull
 * pivoting in place as the viewer drives into it). A parked or wrecked hull is
 * presented where it is and pushes unchanged.
 */
import type { Vector3 } from 'three';
import type { MovementCollisionResolver, MovementHeightField, TankState } from '../../sim/movement.ts';
import { tankBodyTopM, tankContactRect } from '../../sim/tankContactShape.ts';
import { pushHullInsidePlayableBounds } from '../../world/battlefieldBounds.ts';
import {
  createHullFootprint, hullFootprint, hullPassesObstacleTop, hullUndersideOver, pushHullFromHull, pushHullFromObstacle,
} from '../../world/collision.ts';
import type { CollisionRecord } from '../../world/collision.ts';
import { matchRulesetFor, rulesetPhysicsAt, type RulesetPhysics } from '../../sim/matchRuleset.ts';
import { createHullSupportPose, createStructureSupportField, hullSupportPose } from '../../sim/structureSupport.ts';
import { prefersVerticalTankContact, tanksVerticallyClear } from '../../sim/tankBodyContacts.ts';
import { normalizeGameMode } from '../../sim/matchModes.ts';
import type { PredictionWorld } from '../match/prediction.ts';

export interface PredictionObstacle extends CollisionRecord {
  crushed?: boolean;
  crushable?: boolean;
  crushMin?: number;
}

export interface WorldCollisionLike {
  heightField?: MovementHeightField | null;
  /** The device tier the world's placements were counted at (map.ts); 'mobile' lays out fewer props and trees. */
  layoutTier?: string | null;
  /** A terrain variant of the map (Frontline Assault's trench works add records); null for the base map. */
  terrainVariant?: string | null;
  queryObstacles?(minX: number, minZ: number, maxX: number, maxZ: number, target: PredictionObstacle[]): PredictionObstacle[];
  getObstacles?(): PredictionObstacle[];
  /** `options.settled` lays the prop at its final pose at once — no fall, no debris, no sound (the world's seam: src/world/map.ts). */
  crushObstacle?(
    obstacle: PredictionObstacle, directionX: number, directionZ: number, speedMps: number,
    cause?: 'ram' | 'shell', options?: { settled?: boolean },
  ): boolean | void;
}

/** A disclosed tank the prediction may collide with. */
export interface CollidableTank {
  spec: Parameters<typeof tankContactRect>[0];
  /** `state.pos` is the same object for the same tank from call to call: the world remembers stale hulls by it. */
  state: TankState;
  collidable: boolean;
}

/** A presented hull the authority's own pose penetrates deeper than this is stale (wire quantization is ~1 mm). */
const STALE_HULL_PENETRATION_M = 0.05;
/** A seated hull clears the authority's pose by this much, not by a rounding error that would still read as contact. */
const SEAT_CLEARANCE_M = 0.001;

export interface PredictionWorldOptions {
  worldCollision: WorldCollisionLike;
  /** The viewer's vehicle spec (contact footprint). */
  ownSpec: Parameters<typeof tankContactRect>[0];
  /** The viewer's simulation state while it integrates (yaw for the hull frame). */
  ownState: () => TankState | null;
  /** Every other actor; only `collidable` ones (disclosed, or wrecks) push. */
  others: () => Iterable<CollidableTank>;
  /** The room's game mode: its ruleset's impact physics (landing rebound) rides the prediction. */
  mode?: string | null;
}

interface ContactFrame {
  centerX: number;
  centerZ: number;
  halfLength: number;
  halfWidth: number;
  forwardX: number;
  forwardZ: number;
  rightX: number;
  rightZ: number;
  broadRadius: number;
}

function contactFrame(spec: Parameters<typeof tankContactRect>[0], x: number, z: number, yaw: number, out: ContactFrame): ContactFrame {
  const rect = tankContactRect(spec);
  const forwardX = Math.sin(yaw);
  const forwardZ = Math.cos(yaw);
  const rightX = forwardZ;
  const rightZ = -forwardX;
  out.centerX = x + rightX * rect.centerX + forwardX * rect.centerZ;
  out.centerZ = z + rightZ * rect.centerX + forwardZ * rect.centerZ;
  out.halfLength = rect.halfLength;
  out.halfWidth = rect.halfWidth;
  out.forwardX = forwardX;
  out.forwardZ = forwardZ;
  out.rightX = rightX;
  out.rightZ = rightZ;
  out.broadRadius = Math.hypot(rect.halfLength, rect.halfWidth) + 0.01;
  return out;
}

/** Build the prediction world; returns null when the map has no height field yet. */
export function createPredictionWorld({ worldCollision, ownSpec, ownState, others, mode = null }: PredictionWorldOptions): PredictionWorld | null {
  const heightField = worldCollision.heightField;
  if (!heightField || typeof heightField.getHeightAt !== 'function') return null;
  // impact physics: the mode's rebound law is a pure function of the mode, so the prediction bounces like the authority
  const physics = matchRulesetFor(normalizeGameMode(mode || 'standard')).physics;
  const frame: ContactFrame = { centerX: 0, centerZ: 0, halfLength: 0, halfWidth: 0, forwardX: 0, forwardZ: 1, rightX: 1, rightZ: 0, broadRadius: 0 };
  const otherFrame: ContactFrame = { ...frame };
  const nearby: PredictionObstacle[] = [];
  const footCenter = { x: 0, y: 0, z: 0 };
  const ownFoot = createHullFootprint();
  const hardObstacles: PredictionObstacle[] = [];
  const bodyTop = tankBodyTopM(ownSpec);
  const ownRect = tankContactRect(ownSpec);
  // physics lane (2026-10-03): the authority's two vertical rules, which the replay lacked. A hull on a roof stands on
  // the structure support field the authority rides (sim/structureSupport.ts; the replay fell through roofs and decks:
  // up to 9.5 m replay error landing on a roof edge), and a hull above or on another hull is not shoved sideways off it
  // (tankBodyContacts: the replay pushed a hull resting on a wreck 1.9 m off in 12 ticks).
  const support = createStructureSupportField(heightField, worldCollision);
  const ownBody = { spec: ownSpec, state: null as TankState | null };
  // The hulls the last anchor found stale, by their `state.pos`, and the shift that seats each one against the
  // authority's own pose (slot lists reused every reconciliation).
  const staleHulls: unknown[] = [];
  const staleShift: number[] = [];
  let staleCount = 0;
  const anchorPush = { x: 0, z: 0 };
  const staleSlot = (key: unknown): number => {
    for (let index = 0; index < staleCount; index++) if (staleHulls[index] === key) return index;
    return -1;
  };

  /** Overlap of the own hull at `frame` with `other`'s hull shifted by (shiftX, shiftZ), into `out`; false when apart. */
  const hullOverlap = (other: CollidableTank, shiftX: number, shiftZ: number, out: { x: number; z: number }): boolean => {
    contactFrame(other.spec, other.state.pos.x + shiftX, other.state.pos.z + shiftZ, other.state.yaw, otherFrame);
    const dx = frame.centerX - otherFrame.centerX;
    const dz = frame.centerZ - otherFrame.centerZ;
    const outer = frame.broadRadius + otherFrame.broadRadius - 0.02;
    if (dx * dx + dz * dz > outer * outer) return false;
    return pushHullFromHull(
      frame.centerX, frame.centerZ, frame.forwardX, frame.forwardZ, frame.rightX, frame.rightZ, frame.halfLength, frame.halfWidth,
      otherFrame.centerX, otherFrame.centerZ, otherFrame.forwardX, otherFrame.forwardZ, otherFrame.rightX, otherFrame.rightZ,
      otherFrame.halfLength, otherFrame.halfWidth, out,
    );
  };

  const anchor = (state: TankState): void => {
    staleCount = 0;
    contactFrame(ownSpec, state.pos.x, state.pos.z, state.yaw, frame);
    for (const other of others()) {
      if (!other.collidable) continue;
      anchorPush.x = 0;
      anchorPush.z = 0;
      if (!hullOverlap(other, 0, 0, anchorPush)) continue;
      const depth = Math.hypot(anchorPush.x, anchorPush.z);
      if (depth <= STALE_HULL_PENETRATION_M) continue;
      const seat = (depth + SEAT_CLEARANCE_M) / depth;
      staleHulls[staleCount] = other.state.pos;
      staleShift[staleCount * 2] = -anchorPush.x * seat;
      staleShift[staleCount * 2 + 1] = -anchorPush.z * seat;
      staleCount++;
    }
  };

  const collide: MovementCollisionResolver = (position: Vector3, _radius: number, outPush: Vector3): boolean => {
    outPush.set(0, 0, 0);
    const state = ownState();
    const yaw = state ? state.yaw : 0;
    const speed = state ? Math.abs(state.speed) : 0;
    contactFrame(ownSpec, position.x, position.z, yaw, frame);
    pushHullInsidePlayableBounds(
      frame.centerX, frame.centerZ, frame.forwardX, frame.forwardZ, frame.rightX, frame.rightZ,
      frame.halfLength, frame.halfWidth, outPush,
    );
    const obstacles = typeof worldCollision.queryObstacles === 'function'
      ? worldCollision.queryObstacles(
        frame.centerX - frame.broadRadius, frame.centerZ - frame.broadRadius,
        frame.centerX + frame.broadRadius, frame.centerZ + frame.broadRadius, nearby,
      )
      : (typeof worldCollision.getObstacles === 'function' ? worldCollision.getObstacles() : []);
    // the authority's standing rule and per-part vertical extents (sim/authoritativeMatch.ts collideWithObstacles): the
    // hull's footprint at its attitude and its underside there, the body's top for parts it passes beneath
    const foot = hullFootprint(ownRect, position.x, position.z, yaw, state ? state.visualPitch || 0 : 0,
      state ? state.visualRoll || 0 : 0, ownFoot);
    const footRadius = Math.hypot(foot.halfLength, foot.halfWidth) + 0.01;
    const spanTop = position.y + bodyTop;
    // each record meets the hull where the records before it have pushed it, as the authority resolves them
    const baseX = foot.centerX, baseZ = foot.centerZ, startX = outPush.x, startZ = outPush.z;
    let hardCount = 0;
    for (const obstacle of obstacles) {
      if (obstacle.crushed) continue;
      foot.centerX = baseX + outPush.x - startX;
      foot.centerZ = baseZ + outPush.z - startZ;
      footCenter.x = foot.centerX; footCenter.y = position.y; footCenter.z = foot.centerZ;
      const spanBottom = hullUndersideOver(obstacle, foot, position.y);
      const clearBottom = foot.clearBottom;
      if (hullPassesObstacleTop(spanBottom, obstacle.max[1], obstacle.min[1], !obstacle.crushable, clearBottom)) continue;
      if (obstacle.crushable && speed > (obstacle.crushMin ?? 2.8)) continue;
      const closestX = Math.max(obstacle.min[0], Math.min(foot.centerX, obstacle.max[0]));
      const closestZ = Math.max(obstacle.min[2], Math.min(foot.centerZ, obstacle.max[2]));
      const dx = foot.centerX - closestX;
      const dz = foot.centerZ - closestZ;
      if (dx * dx + dz * dz >= footRadius * footRadius) continue;
      if (pushHullFromObstacle(
        footCenter, foot.forwardX, foot.forwardZ, foot.rightX, foot.rightZ, foot.halfLength, foot.halfWidth, obstacle, outPush,
        spanBottom, spanTop, clearBottom,
      )) hardObstacles[hardCount++] = obstacle;
    }
    // the authority's second sweep over the contacts that pushed
    for (let index = 0; index < hardCount; index++) {
      const obstacle = hardObstacles[index]!;
      foot.centerX = baseX + outPush.x - startX;
      foot.centerZ = baseZ + outPush.z - startZ;
      footCenter.x = foot.centerX; footCenter.y = position.y; footCenter.z = foot.centerZ;
      const spanBottom = hullUndersideOver(obstacle, foot, position.y);
      if (hullPassesObstacleTop(spanBottom, obstacle.max[1], obstacle.min[1], !obstacle.crushable, foot.clearBottom)) continue;
      pushHullFromObstacle(
        footCenter, foot.forwardX, foot.forwardZ, foot.rightX, foot.rightZ, foot.halfLength, foot.halfWidth, obstacle, outPush,
        spanBottom, spanTop, foot.clearBottom,
      );
    }
    hardObstacles.length = 0;
    ownBody.state = state;
    for (const other of others()) {
      if (!other.collidable) continue;
      if (state && (prefersVerticalTankContact(ownBody as never, other as never) || tanksVerticallyClear(ownBody as never, other as never))) continue;
      const slot = staleCount > 0 ? staleSlot(other.state.pos) : -1;
      if (slot < 0) hullOverlap(other, 0, 0, outPush);
      else hullOverlap(other, staleShift[slot * 2]!, staleShift[slot * 2 + 1]!, outPush);
    }
    return outPush.x !== 0 || outPush.z !== 0;
  };

  // the authority's floor rule: the hull's underside over each part (structureSupport.ts hullSupportPose)
  const supportPose = createHullSupportPose();
  const beginStep = (state: TankState): void => {
    support.beginHull(state.pos.x, state.pos.z, state.pos.y, hullSupportPose(ownSpec, state, supportPose));
  };
  const gameMode = normalizeGameMode(mode || 'standard');
  const physicsAt = (gravityScale: number): RulesetPhysics => rulesetPhysicsAt(gameMode, gravityScale);
  return { heightField: support, collide, contactGeom: null, physics, physicsAt, anchor, beginStep };
}
