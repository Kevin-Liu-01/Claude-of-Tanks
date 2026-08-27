/**
 * Deterministic, allocation-free dynamic tank contact overlay.
 *
 * Ground driving uses exact-shell OBB/static-world contact. This module handles
 * the missing third dimension once one hull is materially above another:
 * airborne landings, roof/side support and off-center angular impulse.
 * At the game's 14-vehicle ceiling the complete pair pass is only 91 cheap
 * tests, and the expensive path runs solely for horizontally overlapping hulls.
 */

import { tankContactRect } from './tankContactShape.ts';

export interface TankBodyState {
  pos: { x: number; y: number; z: number };
  yaw: number;
  speed: number;
  verticalSpeed: number;
  grounded: boolean;
  visualPitch: number;
  visualRoll: number;
  turretYaw: number;
  overturned?: boolean;
  _spring: { pitchV: number; rollV: number };
  _ride: {
    y: number;
    v: number;
    grounded: boolean;
    airTime: number;
  };
  _body?: {
    tumbling: boolean;
    landingBlendS: number;
    dynamicSupport: boolean;
    autoRighting?: boolean;
  };
}

export interface TankBodyEntity {
  id?: string;
  spec: {
    weightTons: number;
    dims: { hullLengthM: number; widthM: number; heightM: number };
    armor?: {
      turretPivot?: number[];
      bodyContactPoints?: { hull?: number[]; turret?: number[] };
    };
  };
  state: TankBodyState;
}

export type TankBodyImpact = (
  upper: TankBodyEntity,
  lower: TankBodyEntity,
  closingMps: number,
  normalX: number,
  normalZ: number,
) => void;

const CONTACT_SLOP_M = 0.025;
const STACK_AXIS_FRACTION = 0.30;
const STACK_MAX_PENETRATION_FRACTION = 0.58;
const STACK_APPROACH_M = 0.14;
const STACK_ANGULAR_GAIN = 0.18;
const STACK_ANGULAR_KICK_MAX = 2.2;
const STACK_TUMBLE_KICK = 0.55;
const STACK_RESTITUTION = 0.07;

const _boundsA = new Float64Array(3); // minY, maxY, centerY
const _boundsB = new Float64Array(3);

function clamp(value: number, lo: number, hi: number): number {
  return value < lo ? lo : value > hi ? hi : value;
}

function rectsOverlap(
  ax: number, az: number, afx: number, afz: number,
  arx: number, arz: number, aHalfL: number, aHalfW: number,
  bx: number, bz: number, bfx: number, bfz: number,
  brx: number, brz: number, bHalfL: number, bHalfW: number,
): boolean {
  const dx = ax - bx;
  const dz = az - bz;
  return !axisSeparates(dx, dz, afx, afz,
    afx, afz, arx, arz, aHalfL, aHalfW,
    bfx, bfz, brx, brz, bHalfL, bHalfW) &&
    !axisSeparates(dx, dz, arx, arz,
      afx, afz, arx, arz, aHalfL, aHalfW,
      bfx, bfz, brx, brz, bHalfL, bHalfW) &&
    !axisSeparates(dx, dz, bfx, bfz,
      afx, afz, arx, arz, aHalfL, aHalfW,
      bfx, bfz, brx, brz, bHalfL, bHalfW) &&
    !axisSeparates(dx, dz, brx, brz,
      afx, afz, arx, arz, aHalfL, aHalfW,
      bfx, bfz, brx, brz, bHalfL, bHalfW);
}

function axisSeparates(
  dx: number, dz: number, nx: number, nz: number,
  afx: number, afz: number, arx: number, arz: number,
  aHalfL: number, aHalfW: number,
  bfx: number, bfz: number, brx: number, brz: number,
  bHalfL: number, bHalfW: number,
): boolean {
  const distance = Math.abs(dx * nx + dz * nz);
  const aRadius = aHalfL * Math.abs(afx * nx + afz * nz) +
    aHalfW * Math.abs(arx * nx + arz * nz);
  const bRadius = bHalfL * Math.abs(bfx * nx + bfz * nz) +
    bHalfW * Math.abs(brx * nx + brz * nz);
  return distance >= aRadius + bRadius;
}

/** Exact world-Y interval of the YXZ-oriented closed armor shell. */
function verticalBounds(entity: TankBodyEntity, out: Float64Array): Float64Array {
  const state = entity.state;
  const dims = entity.spec.dims;
  const pitch = state.visualPitch || 0;
  const roll = state.visualRoll || 0;
  const cosPitch = Math.cos(pitch);
  const sinPitch = Math.sin(pitch);
  const cosRoll = Math.cos(roll);
  const sinRoll = Math.sin(roll);
  const contact = entity.spec.armor?.bodyContactPoints;
  const hull = contact?.hull;
  if (hull && hull.length >= 3) {
    let minY = Infinity;
    let maxY = -Infinity;
    for (let index = 0; index < hull.length; index += 3) {
      // Euler YXZ: yaw does not affect world Y. Roll is applied before the
      // pitch rotation, matching movement.js pointCloudSupportY.
      const rolledY = hull[index] * sinRoll + hull[index + 1] * cosRoll;
      const worldY = state.pos.y + rolledY * cosPitch - hull[index + 2] * sinPitch;
      if (worldY < minY) minY = worldY;
      if (worldY > maxY) maxY = worldY;
    }
    const turret = contact?.turret;
    if (turret && turret.length >= 3) {
      const pivot = entity.spec.armor?.turretPivot || [0, 0, 0];
      const turretYaw = state.turretYaw || 0;
      const turretCos = Math.cos(turretYaw);
      const turretSin = Math.sin(turretYaw);
      for (let index = 0; index < turret.length; index += 3) {
        const x = turret[index];
        const z = turret[index + 2];
        const localX = pivot[0] + x * turretCos + z * turretSin;
        const localY = pivot[1] + turret[index + 1];
        const localZ = pivot[2] - x * turretSin + z * turretCos;
        const rolledY = localX * sinRoll + localY * cosRoll;
        const worldY = state.pos.y + rolledY * cosPitch - localZ * sinPitch;
        if (worldY < minY) minY = worldY;
        if (worldY > maxY) maxY = worldY;
      }
    }
    out[0] = minY;
    out[1] = maxY;
    out[2] = (minY + maxY) * 0.5;
    return out;
  }

  // Synthetic/unfinalized fixtures retain a conservative dimensions box.
  const centerOffsetY = dims.heightM * 0.5 * cosRoll * cosPitch;
  const extentY = Math.abs(sinRoll * cosPitch) * dims.widthM * 0.5 +
    Math.abs(cosRoll * cosPitch) * dims.heightM * 0.5 +
    Math.abs(sinPitch) * dims.hullLengthM * 0.5;
  const centerY = state.pos.y + centerOffsetY;
  out[0] = centerY - extentY;
  out[1] = centerY + extentY;
  out[2] = centerY;
  return out;
}

function ensureBodyState(state: TankBodyState) {
  return state._body || (state._body = {
    tumbling: false,
    landingBlendS: 0,
    dynamicSupport: false,
    autoRighting: false,
  });
}

function isDynamicBodyContact(entity: TankBodyEntity): boolean {
  const state = entity.state;
  return state.grounded === false || state.overturned === true ||
    state._body?.tumbling === true || state._body?.dynamicSupport === true;
}

/**
 * The ground-driving OBB solver calls this before applying a horizontal push.
 * A clear vertical ordering reserves the pair for this module, allowing an
 * airborne hull to land on another tank instead of being teleported sideways.
 */
export function prefersVerticalTankContact(
  a: TankBodyEntity,
  b: TankBodyEntity,
): boolean {
  // Two ordinarily grounded tanks can have materially different world-Y on a
  // side slope while still sharing a normal horizontal hull contact. Reserve
  // the pair only after one body is actually in flight/tumble/support state;
  // otherwise this layer would mistake hill traffic for a roof landing.
  if (!isDynamicBodyContact(a) && !isDynamicBodyContact(b)) return false;
  verticalBounds(a, _boundsA);
  verticalBounds(b, _boundsB);
  const minHeight = Math.min(
    _boundsA[1] - _boundsA[0],
    _boundsB[1] - _boundsB[0],
  );
  if (Math.abs(_boundsA[2] - _boundsB[2]) < minHeight * STACK_AXIS_FRACTION) {
    return false;
  }
  const gap = _boundsA[0] > _boundsB[1]
    ? _boundsA[0] - _boundsB[1]
    : _boundsB[0] > _boundsA[1]
      ? _boundsB[0] - _boundsA[1]
      : 0;
  return gap <= STACK_APPROACH_M;
}

function setVerticalVelocity(state: TankBodyState, velocity: number): void {
  state.verticalSpeed = velocity;
  state._ride.v = velocity;
}

function moveRootY(state: TankBodyState, delta: number): void {
  state.pos.y += delta;
  state._ride.y = state.pos.y;
}

/**
 * Resolve vertical tank-on-tank contacts once after every movement pass.
 * Returns the number of active contacts for probes/telemetry.
 */
export function resolveTankBodyContacts(
  entities: readonly TankBodyEntity[],
  _dt: number,
  onImpact: TankBodyImpact | null = null,
): number {
  let contacts = 0;
  for (let i = 0; i < entities.length; i++) {
    const a = entities[i];
    if (!a?.state || !a.spec?.dims) continue;
    const aState = a.state;
    const aRect = tankContactRect(a.spec);
    const aHalfW = aRect.halfWidth;
    const aHalfL = aRect.halfLength;
    const aFx = Math.sin(aState.yaw);
    const aFz = Math.cos(aState.yaw);
    const aRx = aFz;
    const aRz = -aFx;
    const aCenterX = aState.pos.x + aRx * aRect.centerX + aFx * aRect.centerZ;
    const aCenterZ = aState.pos.z + aRz * aRect.centerX + aFz * aRect.centerZ;

    for (let j = i + 1; j < entities.length; j++) {
      const b = entities[j];
      if (!b?.state || !b.spec?.dims) continue;
      if (!isDynamicBodyContact(a) && !isDynamicBodyContact(b)) continue;
      const bState = b.state;
      const bRect = tankContactRect(b.spec);
      const bHalfW = bRect.halfWidth;
      const bHalfL = bRect.halfLength;
      const bFx = Math.sin(bState.yaw);
      const bFz = Math.cos(bState.yaw);
      const bRx = bFz;
      const bRz = -bFx;
      const bCenterX = bState.pos.x + bRx * bRect.centerX + bFx * bRect.centerZ;
      const bCenterZ = bState.pos.z + bRz * bRect.centerX + bFz * bRect.centerZ;
      const dx = aCenterX - bCenterX;
      const dz = aCenterZ - bCenterZ;
      const outer = Math.hypot(aHalfL, aHalfW) + Math.hypot(bHalfL, bHalfW);
      if (dx * dx + dz * dz > outer * outer) continue;
      if (!rectsOverlap(
        aCenterX, aCenterZ, aFx, aFz, aRx, aRz, aHalfL, aHalfW,
        bCenterX, bCenterZ, bFx, bFz, bRx, bRz, bHalfL, bHalfW,
      )) continue;

      verticalBounds(a, _boundsA);
      verticalBounds(b, _boundsB);
      const aAbove = _boundsA[2] >= _boundsB[2];
      const upper = aAbove ? a : b;
      const lower = aAbove ? b : a;
      const upperBounds = aAbove ? _boundsA : _boundsB;
      const lowerBounds = aAbove ? _boundsB : _boundsA;
      const minHeight = Math.min(
        upperBounds[1] - upperBounds[0],
        lowerBounds[1] - lowerBounds[0],
      );
      if (upperBounds[2] - lowerBounds[2] < minHeight * STACK_AXIS_FRACTION) continue;

      const penetration = lowerBounds[1] - upperBounds[0];
      if (penetration < -CONTACT_SLOP_M ||
          penetration > minHeight * STACK_MAX_PENETRATION_FRACTION) continue;

      const correction = Math.max(0, penetration + CONTACT_SLOP_M);
      const upperMass = Math.max(1, upper.spec.weightTons || 1);
      const lowerMass = Math.max(1, lower.spec.weightTons || 1);
      const lowerLocked = lower.state.grounded !== false &&
        !ensureBodyState(lower.state).tumbling;
      const upperShare = lowerLocked ? 1 : lowerMass / (upperMass + lowerMass);
      if (correction > 0) {
        moveRootY(upper.state, correction * upperShare);
        if (!lowerLocked) moveRootY(lower.state, -correction * (1 - upperShare));
      }

      const upperV = upper.state.verticalSpeed || upper.state._ride.v || 0;
      const lowerV = lower.state.verticalSpeed || lower.state._ride.v || 0;
      const closing = Math.max(0, lowerV - upperV);
      if (closing > 0) {
        const invUpper = 1 / upperMass;
        const invLower = lowerLocked ? 0 : 1 / lowerMass;
        const impulse = (1 + STACK_RESTITUTION) * closing / (invUpper + invLower);
        setVerticalVelocity(upper.state, upperV + impulse * invUpper);
        if (!lowerLocked) setVerticalVelocity(lower.state, lowerV - impulse * invLower);
      } else if (upper.state.verticalSpeed < lowerV) {
        setVerticalVelocity(upper.state, lowerV);
      }

      const upperBody = ensureBodyState(upper.state);
      upperBody.dynamicSupport = true;
      // Terrain-grounded means supported by the heightfield. A tank roof is a
      // dynamic support, so retain the airborne flag and let this pair pass
      // re-seat it every fixed tick without feeding the terrain spring.
      upper.state.grounded = false;
      upper.state._ride.grounded = false;

      if (closing > 0.8) {
        const upperRect = aAbove ? aRect : bRect;
        const centerDx = upper.state.pos.x - lower.state.pos.x;
        const centerDz = upper.state.pos.z - lower.state.pos.z;
        const upperYaw = upper.state.yaw;
        const rightX = Math.cos(upperYaw);
        const rightZ = -Math.sin(upperYaw);
        const forwardX = Math.sin(upperYaw);
        const forwardZ = Math.cos(upperYaw);
        // The lower hull supports the side opposite the upper center offset.
        // Upward impulse there supplies the physically correct tipping sense.
        const leverRight = clamp(
          -(centerDx * rightX + centerDz * rightZ) /
            Math.max(upperRect.halfWidth, 0.1),
          -1,
          1,
        );
        const leverForward = clamp(
          -(centerDx * forwardX + centerDz * forwardZ) /
            Math.max(upperRect.halfLength, 0.1),
          -1,
          1,
        );
        const pitchKick = clamp(
          leverForward * closing * STACK_ANGULAR_GAIN,
          -STACK_ANGULAR_KICK_MAX,
          STACK_ANGULAR_KICK_MAX,
        );
        const rollKick = clamp(
          leverRight * closing * STACK_ANGULAR_GAIN,
          -STACK_ANGULAR_KICK_MAX,
          STACK_ANGULAR_KICK_MAX,
        );
        upper.state._spring.pitchV += pitchKick;
        upper.state._spring.rollV += rollKick;
        const upY = Math.cos(upper.state.visualPitch) * Math.cos(upper.state.visualRoll);
        if (Math.abs(pitchKick) + Math.abs(rollKick) >= STACK_TUMBLE_KICK || upY < 0.7) {
          upperBody.tumbling = true;
        }
        if (onImpact) {
          const centerDistance = Math.hypot(centerDx, centerDz);
          const normalX = centerDistance > 1e-5 ? centerDx / centerDistance : 0;
          const normalZ = centerDistance > 1e-5 ? centerDz / centerDistance : 0;
          onImpact(upper, lower, closing, normalX, normalZ);
        }
      }

      // Dynamic roof contact scrubs track momentum rather than letting a tank
      // skate indefinitely across another hull.
      upper.state.speed *= 0.985;
      contacts++;
    }
  }
  return contacts;
}
