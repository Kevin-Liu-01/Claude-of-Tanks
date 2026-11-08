/**
 * One hull's contact with the other hulls (268; docs/ARCHITECTURE.md "One core, two drivers"): the solo battle's collider
 * (game/state.ts) and the authority's (sim/authoritativeMatch.ts collideFor) push a moving hull out of every hull its
 * contact rect overlaps (world/collision.ts pushHullFromHull, the exact-shell OBB test) and record the ram each push makes
 * here, so a crash between two hulls resolves to the bit on either driver (src/sim/driverStepParity.selftest.mjs). Both
 * colliders call it last, after the map's bounds and the obstacles: the pushes add into one vector, in that order.
 */
import * as detMath from './detMath.ts';
import { hullVelocityAlong } from './impact.ts';
import { tankContactRect } from './tankContactShape.ts';
import { prefersVerticalTankContact, tanksVerticallyClear } from './tankBodyContacts.ts';
import { pushHullFromHull } from '../world/collision.ts';

type ContactHull = Parameters<typeof prefersVerticalTankContact>[0] & {
  state: Parameters<typeof hullVelocityAlong>[0] & Parameters<typeof prefersVerticalTankContact>[0]['state'];
  spec: Parameters<typeof tankContactRect>[0];
  modeActive?: boolean;
};

/** A horizontal ram one push records: the pair, its closing speed, the normal and each hull's speed along it before. */
export interface HullRam<Hull> {
  a: Hull;
  b: Hull;
  closing: number;
  nx: number;
  nz: number;
  vAn: number;
  vBn: number;
  vertical: boolean;
}

/**
 * Push `entity` (its contact rect centred at centerX/centerZ on axes fx/fz, rx/rz) out of every other hull in `hulls`,
 * adding into `outPush`, and record a ram for each push that closes. `reachMaxM` (the most any hull's rect reaches from its
 * root) rejects a far hull before its rect is read, exactly where the full test would; Infinity reads every hull.
 */
export function pushFromHulls<Hull extends ContactHull>(
  entity: Hull,
  hulls: readonly Hull[],
  centerX: number,
  centerZ: number,
  fx: number,
  fz: number,
  rx: number,
  rz: number,
  halfL: number,
  halfW: number,
  outPush: Parameters<typeof pushHullFromHull>[16],
  rams: HullRam<Hull>[],
  reachMaxM = Infinity,
): boolean {
  const ownReach = detMath.hypot(halfL, halfW) + reachMaxM;
  const ownReach2 = ownReach * ownReach;
  let pushed = false;
  for (const other of hulls) {
    if (other === entity || other.modeActive === false || !other.state) continue;
    const rootDX = centerX - other.state.pos.x, rootDZ = centerZ - other.state.pos.z;
    if (rootDX * rootDX + rootDZ * rootDZ > ownReach2) continue;
    const otherRect = tankContactRect(other.spec);
    const otherHalfW = otherRect.halfWidth;
    const otherHalfL = otherRect.halfLength;
    const ofx = detMath.sin(other.state.yaw);
    const ofz = detMath.cos(other.state.yaw);
    const orx = ofz;
    const orz = -ofx;
    const otherCenterX = other.state.pos.x + orx * otherRect.centerX + ofx * otherRect.centerZ;
    const otherCenterZ = other.state.pos.z + orz * otherRect.centerX + ofz * otherRect.centerZ;
    const dx = centerX - otherCenterX;
    const dz = centerZ - otherCenterZ;
    const outer = detMath.hypot(halfL, halfW) + detMath.hypot(otherHalfL, otherHalfW);
    if (dx * dx + dz * dz > outer * outer || prefersVerticalTankContact(entity, other) || tanksVerticallyClear(entity, other)) continue;
    const beforeX = outPush.x;
    const beforeZ = outPush.z;
    if (!pushHullFromHull(
      centerX, centerZ, fx, fz, rx, rz, halfL, halfW,
      otherCenterX, otherCenterZ, ofx, ofz, orx, orz, otherHalfL, otherHalfW,
      outPush,
    )) continue;
    pushed = true;
    queueRamFromPush(entity, other, outPush.x - beforeX, outPush.z - beforeZ, rams);
  }
  return pushed;
}

function queueRamFromPush<Hull extends ContactHull>(entity: Hull, other: Hull, pushX: number, pushZ: number, rams: HullRam<Hull>[]): void {
  const pushLength = detMath.hypot(pushX, pushZ);
  if (pushLength <= 1e-6) return;
  const nx = pushX / pushLength;
  const nz = pushZ / pushLength;
  // impact physics: each hull's velocity along the normal (drive plus the decaying shove) BEFORE the contact — the
  // momentum exchange and the aggression split read these, not the speeds the blocked-drive bleed leaves
  const vAn = hullVelocityAlong(entity.state, nx, nz);
  const vBn = hullVelocityAlong(other.state, nx, nz);
  const closing = vBn - vAn;
  if (closing > 0) rams.push({ a: entity, b: other, closing, nx, nz, vAn, vBn, vertical: false });
}
