/**
 * The world the viewer's prediction integrates against: the map's height
 * field plus a collision resolver that mirrors the authority's contact
 * geometry — the playable bounds, static obstacles the hull cannot pass, and
 * the hulls of disclosed tanks (never a hidden one). Parity with the
 * authority's spec-derived footprint is what keeps a teammate contact from
 * becoming a correction loop; fast overruns of crushable dressing are left
 * to the authority so the local hull does not stop at a fence the next
 * snapshot is about to destroy.
 */
import type { Vector3 } from 'three';
import type { MovementCollisionResolver, MovementHeightField, TankState } from '../../sim/movement.ts';
import { tankContactRect } from '../../sim/tankContactShape.ts';
import { pushHullInsidePlayableBounds } from '../../world/battlefieldBounds.ts';
import { hullPassesObstacleTop, pushHullFromHull, pushHullFromObstacle } from '../../world/collision.ts';
import type { CollisionRecord } from '../../world/collision.ts';
import type { PredictionWorld } from '../match/prediction.ts';

export interface PredictionObstacle extends CollisionRecord {
  crushed?: boolean;
  crushable?: boolean;
  crushMin?: number;
}

export interface WorldCollisionLike {
  heightField?: MovementHeightField | null;
  queryObstacles?(minX: number, minZ: number, maxX: number, maxZ: number, target: PredictionObstacle[]): PredictionObstacle[];
  getObstacles?(): PredictionObstacle[];
  crushObstacle?(obstacle: PredictionObstacle, directionX: number, directionZ: number, speedMps: number): void;
}

/** A disclosed tank the prediction may collide with. */
export interface CollidableTank {
  spec: Parameters<typeof tankContactRect>[0];
  state: TankState;
  collidable: boolean;
}

export interface PredictionWorldOptions {
  worldCollision: WorldCollisionLike;
  /** The viewer's vehicle spec (contact footprint). */
  ownSpec: Parameters<typeof tankContactRect>[0];
  /** The viewer's simulation state while it integrates (yaw for the hull frame). */
  ownState: () => TankState | null;
  /** Every other actor; only `collidable` ones (disclosed, or wrecks) push. */
  others: () => Iterable<CollidableTank>;
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
export function createPredictionWorld({ worldCollision, ownSpec, ownState, others }: PredictionWorldOptions): PredictionWorld | null {
  const heightField = worldCollision.heightField;
  if (!heightField || typeof heightField.getHeightAt !== 'function') return null;
  const frame: ContactFrame = { centerX: 0, centerZ: 0, halfLength: 0, halfWidth: 0, forwardX: 0, forwardZ: 1, rightX: 1, rightZ: 0, broadRadius: 0 };
  const otherFrame: ContactFrame = { ...frame };
  const nearby: PredictionObstacle[] = [];
  const center = { x: 0, y: 0, z: 0 };

  const collide: MovementCollisionResolver = (position: Vector3, _radius: number, outPush: Vector3): boolean => {
    outPush.set(0, 0, 0);
    const state = ownState();
    const yaw = state ? state.yaw : 0;
    const speed = state ? Math.abs(state.speed) : 0;
    contactFrame(ownSpec, position.x, position.z, yaw, frame);
    center.x = frame.centerX; center.y = position.y; center.z = frame.centerZ;
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
    for (const obstacle of obstacles) {
      if (obstacle.crushed || hullPassesObstacleTop(position.y, obstacle.max[1], obstacle.min[1], !obstacle.crushable)) continue;
      if (obstacle.crushable && speed > (obstacle.crushMin ?? 2.8)) continue;
      const closestX = Math.max(obstacle.min[0], Math.min(frame.centerX, obstacle.max[0]));
      const closestZ = Math.max(obstacle.min[2], Math.min(frame.centerZ, obstacle.max[2]));
      const dx = frame.centerX - closestX;
      const dz = frame.centerZ - closestZ;
      if (dx * dx + dz * dz >= frame.broadRadius * frame.broadRadius) continue;
      pushHullFromObstacle(
        center, frame.forwardX, frame.forwardZ, frame.rightX, frame.rightZ, frame.halfLength, frame.halfWidth, obstacle, outPush,
      );
    }
    for (const other of others()) {
      if (!other.collidable) continue;
      contactFrame(other.spec, other.state.pos.x, other.state.pos.z, other.state.yaw, otherFrame);
      const dx = frame.centerX - otherFrame.centerX;
      const dz = frame.centerZ - otherFrame.centerZ;
      const outer = frame.broadRadius + otherFrame.broadRadius - 0.02;
      if (dx * dx + dz * dz > outer * outer) continue;
      pushHullFromHull(
        frame.centerX, frame.centerZ, frame.forwardX, frame.forwardZ, frame.rightX, frame.rightZ, frame.halfLength, frame.halfWidth,
        otherFrame.centerX, otherFrame.centerZ, otherFrame.forwardX, otherFrame.forwardZ, otherFrame.rightX, otherFrame.rightZ,
        otherFrame.halfLength, otherFrame.halfWidth, outPush,
      );
    }
    return outPush.x !== 0 || outPush.z !== 0;
  };

  return { heightField, collide, contactGeom: null };
}
