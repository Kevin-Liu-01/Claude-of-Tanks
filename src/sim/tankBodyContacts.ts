/**
 * Deterministic, allocation-free dynamic tank contact overlay.
 *
 * Ground driving keeps the established hull-capsule/static-world solver. This
 * module handles the missing third dimension once one hull is materially above
 * another: airborne landings, roof/side support and off-center angular impulse.
 * At the game's 14-vehicle ceiling the complete pair pass is only 91 cheap
 * tests, and the expensive path runs solely for horizontally overlapping hulls.
 */

export interface TankBodyState {
  pos: { x: number; y: number; z: number };
  yaw: number;
  speed: number;
  verticalSpeed: number;
  grounded: boolean;
  visualPitch: number;
  visualRoll: number;
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
  };
}

export interface TankBodyEntity {
  id?: string;
  spec: {
    weightTons: number;
    dims: { hullLengthM: number; widthM: number; heightM: number };
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

/** Conservative world-Y interval of the rendered YXZ-oriented hull box. */
function verticalBounds(entity: TankBodyEntity, out: Float64Array): Float64Array {
  const state = entity.state;
  const dims = entity.spec.dims;
  const pitch = state.visualPitch || 0;
  const roll = state.visualRoll || 0;
  const cosPitch = Math.cos(pitch);
  const sinPitch = Math.sin(pitch);
  const cosRoll = Math.cos(roll);
  const sinRoll = Math.sin(roll);
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
  });
}

/**
 * The legacy 2D capsule solver calls this before applying a horizontal push.
 * A clear vertical ordering reserves the pair for this module, allowing an
 * airborne hull to land on another tank instead of being teleported sideways.
 */
export function prefersVerticalTankContact(
  a: TankBodyEntity,
  b: TankBodyEntity,
): boolean {
  verticalBounds(a, _boundsA);
  verticalBounds(b, _boundsB);
  const minHeight = Math.min(
    a.spec.dims.heightM,
    b.spec.dims.heightM,
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
    const aHalfW = a.spec.dims.widthM * 0.5;
    const aSeg = Math.max(a.spec.dims.hullLengthM * 0.5 - aHalfW, 0);
    const aFx = Math.sin(aState.yaw);
    const aFz = Math.cos(aState.yaw);

    for (let j = i + 1; j < entities.length; j++) {
      const b = entities[j];
      if (!b?.state || !b.spec?.dims) continue;
      const bState = b.state;
      const bHalfW = b.spec.dims.widthM * 0.5;
      const bSeg = Math.max(b.spec.dims.hullLengthM * 0.5 - bHalfW, 0);
      const minDistance = aHalfW + bHalfW;
      const dx = aState.pos.x - bState.pos.x;
      const dz = aState.pos.z - bState.pos.z;
      const outer = aSeg + bSeg + minDistance;
      if (dx * dx + dz * dz > outer * outer) continue;

      // Closest points between the two horizontal hull capsule segments.
      const bFx = Math.sin(bState.yaw);
      const bFz = Math.cos(bState.yaw);
      const parallel = aFx * bFx + aFz * bFz;
      const alongA = dx * aFx + dz * aFz;
      const alongB = dx * bFx + dz * bFz;
      const denom = 1 - parallel * parallel;
      let aT = denom > 1e-6
        ? (parallel * alongB - alongA) / denom
        : -alongA;
      aT = clamp(aT, -aSeg, aSeg);
      let bT = clamp(alongB + parallel * aT, -bSeg, bSeg);
      aT = clamp(parallel * bT - alongA, -aSeg, aSeg);
      const wx = dx + aFx * aT - bFx * bT;
      const wz = dz + aFz * aT - bFz * bT;
      const distanceSq = wx * wx + wz * wz;
      if (distanceSq >= minDistance * minDistance) continue;

      verticalBounds(a, _boundsA);
      verticalBounds(b, _boundsB);
      const aAbove = _boundsA[2] >= _boundsB[2];
      const upper = aAbove ? a : b;
      const lower = aAbove ? b : a;
      const upperBounds = aAbove ? _boundsA : _boundsB;
      const lowerBounds = aAbove ? _boundsB : _boundsA;
      const minHeight = Math.min(upper.spec.dims.heightM, lower.spec.dims.heightM);
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
        const centerDx = upper.state.pos.x - lower.state.pos.x;
        const centerDz = upper.state.pos.z - lower.state.pos.z;
        const rightX = Math.cos(upper.state.yaw);
        const rightZ = -Math.sin(upper.state.yaw);
        const forwardX = Math.sin(upper.state.yaw);
        const forwardZ = Math.cos(upper.state.yaw);
        // The lower hull supports the side opposite the upper center offset.
        // Upward impulse there supplies the physically correct tipping sense.
        const leverRight = clamp(
          -(centerDx * rightX + centerDz * rightZ) /
            Math.max(upper.spec.dims.widthM * 0.5, 0.1),
          -1,
          1,
        );
        const leverForward = clamp(
          -(centerDx * forwardX + centerDz * forwardZ) /
            Math.max(upper.spec.dims.hullLengthM * 0.5, 0.1),
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
