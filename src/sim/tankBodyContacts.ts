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
  modeActive?: boolean;
  spec: {
    weightTons: number;
    dims: { hullLengthM: number; widthM: number; heightM: number };
    armor?: {
      turretPivot?: readonly number[];
      bodyContactPoints?: { hull?: readonly number[]; turret?: readonly number[] };
    };
  };
  state: TankBodyState;
}

export type TankBodyImpact<Entity extends TankBodyEntity = TankBodyEntity> = (
  upper: Entity,
  lower: Entity,
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

interface BodyContactFrame {
  active: boolean;
  halfWidth: number;
  halfLength: number;
  forwardX: number;
  forwardZ: number;
  rightX: number;
  rightZ: number;
  centerX: number;
  centerZ: number;
}

const _contactFramePool: BodyContactFrame[] = [];

function contactFrame(index: number): BodyContactFrame {
  let frame = _contactFramePool[index];
  if (!frame) {
    frame = {
      active: false,
      halfWidth: 0,
      halfLength: 0,
      forwardX: 0,
      forwardZ: 0,
      rightX: 0,
      rightZ: 0,
      centerX: 0,
      centerZ: 0,
    };
    _contactFramePool[index] = frame;
  }
  return frame;
}

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

function includeHullVerticalBounds(
  state: TankBodyState,
  hull: readonly number[],
  cosPitch: number,
  sinPitch: number,
  cosRoll: number,
  sinRoll: number,
  out: Float64Array,
): void {
  for (let index = 0; index < hull.length; index += 3) {
    const rolledY = hull[index] * sinRoll + hull[index + 1] * cosRoll;
    const worldY = state.pos.y + rolledY * cosPitch - hull[index + 2] * sinPitch;
    if (worldY < out[0]) out[0] = worldY;
    if (worldY > out[1]) out[1] = worldY;
  }
}

function includeTurretVerticalBounds(
  entity: TankBodyEntity,
  turret: readonly number[],
  cosPitch: number,
  sinPitch: number,
  cosRoll: number,
  sinRoll: number,
  out: Float64Array,
): void {
  const state = entity.state;
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
    if (worldY < out[0]) out[0] = worldY;
    if (worldY > out[1]) out[1] = worldY;
  }
}

function setFallbackVerticalBounds(
  entity: TankBodyEntity,
  cosPitch: number,
  sinPitch: number,
  cosRoll: number,
  sinRoll: number,
  out: Float64Array,
): void {
  const state = entity.state;
  const dims = entity.spec.dims;
  const centerOffsetY = dims.heightM * 0.5 * cosRoll * cosPitch;
  const extentY = Math.abs(sinRoll * cosPitch) * dims.widthM * 0.5 +
    Math.abs(cosRoll * cosPitch) * dims.heightM * 0.5 +
    Math.abs(sinPitch) * dims.hullLengthM * 0.5;
  const centerY = state.pos.y + centerOffsetY;
  out[0] = centerY - extentY;
  out[1] = centerY + extentY;
  out[2] = centerY;
}

/** Exact world-Y interval of the YXZ-oriented closed armor shell. */
function verticalBounds(entity: TankBodyEntity, out: Float64Array): Float64Array {
  const state = entity.state;
  const pitch = state.visualPitch || 0;
  const roll = state.visualRoll || 0;
  const cosPitch = Math.cos(pitch);
  const sinPitch = Math.sin(pitch);
  const cosRoll = Math.cos(roll);
  const sinRoll = Math.sin(roll);
  const contact = entity.spec.armor?.bodyContactPoints;
  const hull = contact?.hull;
  if (hull && hull.length >= 3) {
    out[0] = Infinity;
    out[1] = -Infinity;
    includeHullVerticalBounds(state, hull, cosPitch, sinPitch, cosRoll, sinRoll, out);
    const turret = contact?.turret;
    if (turret && turret.length >= 3) {
      includeTurretVerticalBounds(entity, turret, cosPitch, sinPitch, cosRoll, sinRoll, out);
    }
    out[2] = (out[0] + out[1]) * 0.5;
    return out;
  }

  // Synthetic/unfinalized fixtures retain a conservative dimensions box.
  setFallbackVerticalBounds(entity, cosPitch, sinPitch, cosRoll, sinRoll, out);
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

function prepareContactFrame(entity: TankBodyEntity | null | undefined, index: number): void {
  const frame = contactFrame(index);
  frame.active = !!entity?.state && !!entity.spec?.dims && entity.modeActive !== false;
  if (!frame.active || !entity) return;
  const state = entity.state;
  const rect = tankContactRect(entity.spec);
  frame.halfWidth = rect.halfWidth;
  frame.halfLength = rect.halfLength;
  frame.forwardX = Math.sin(state.yaw);
  frame.forwardZ = Math.cos(state.yaw);
  frame.rightX = frame.forwardZ;
  frame.rightZ = -frame.forwardX;
  frame.centerX = state.pos.x + frame.rightX * rect.centerX + frame.forwardX * rect.centerZ;
  frame.centerZ = state.pos.z + frame.rightZ * rect.centerX + frame.forwardZ * rect.centerZ;
}

function prepareContactFrames(entities: readonly TankBodyEntity[]): void {
  for (let index = 0; index < entities.length; index++) {
    prepareContactFrame(entities[index], index);
  }
}

function horizontalBodiesOverlap(a: BodyContactFrame, b: BodyContactFrame): boolean {
  const dx = a.centerX - b.centerX;
  const dz = a.centerZ - b.centerZ;
  const outer = Math.hypot(a.halfLength, a.halfWidth) + Math.hypot(b.halfLength, b.halfWidth);
  if (dx * dx + dz * dz > outer * outer) return false;
  return rectsOverlap(
    a.centerX, a.centerZ,
    a.forwardX, a.forwardZ,
    a.rightX, a.rightZ,
    a.halfLength, a.halfWidth,
    b.centerX, b.centerZ,
    b.forwardX, b.forwardZ,
    b.rightX, b.rightZ,
    b.halfLength, b.halfWidth,
  );
}

function correctVerticalOverlap(
  upper: TankBodyEntity,
  lower: TankBodyEntity,
  penetration: number,
  upperMass: number,
  lowerMass: number,
  lowerLocked: boolean,
): void {
  const correction = Math.max(0, penetration + CONTACT_SLOP_M);
  if (correction <= 0) return;
  const upperShare = lowerLocked ? 1 : lowerMass / (upperMass + lowerMass);
  moveRootY(upper.state, correction * upperShare);
  if (!lowerLocked) moveRootY(lower.state, -correction * (1 - upperShare));
}

function resolveVerticalImpulse(
  upper: TankBodyEntity,
  lower: TankBodyEntity,
  upperMass: number,
  lowerMass: number,
  lowerLocked: boolean,
): number {
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
  return closing;
}

function markDynamicSupport(upper: TankBodyEntity): ReturnType<typeof ensureBodyState> {
  const body = ensureBodyState(upper.state);
  body.dynamicSupport = true;
  upper.state.grounded = false;
  upper.state._ride.grounded = false;
  return body;
}

function applyAngularImpact<Entity extends TankBodyEntity>(
  upper: Entity,
  lower: Entity,
  upperFrame: BodyContactFrame,
  upperBody: ReturnType<typeof ensureBodyState>,
  closing: number,
  onImpact: TankBodyImpact<Entity> | null,
): void {
  if (closing <= 0.8) return;
  const centerDx = upper.state.pos.x - lower.state.pos.x;
  const centerDz = upper.state.pos.z - lower.state.pos.z;
  const rightX = Math.cos(upper.state.yaw);
  const rightZ = -Math.sin(upper.state.yaw);
  const forwardX = Math.sin(upper.state.yaw);
  const forwardZ = Math.cos(upper.state.yaw);
  const leverRight = clamp(
    -(centerDx * rightX + centerDz * rightZ) / Math.max(upperFrame.halfWidth, 0.1),
    -1,
    1,
  );
  const leverForward = clamp(
    -(centerDx * forwardX + centerDz * forwardZ) / Math.max(upperFrame.halfLength, 0.1),
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
  if (!onImpact) return;
  const centerDistance = Math.hypot(centerDx, centerDz);
  const normalX = centerDistance > 1e-5 ? centerDx / centerDistance : 0;
  const normalZ = centerDistance > 1e-5 ? centerDz / centerDistance : 0;
  onImpact(upper, lower, closing, normalX, normalZ);
}

function resolveContactPair<Entity extends TankBodyEntity>(
  a: Entity,
  b: Entity,
  aFrame: BodyContactFrame,
  bFrame: BodyContactFrame,
  onImpact: TankBodyImpact<Entity> | null,
): boolean {
  if (!isDynamicBodyContact(a) && !isDynamicBodyContact(b)) return false;
  if (!horizontalBodiesOverlap(aFrame, bFrame)) return false;
  verticalBounds(a, _boundsA);
  verticalBounds(b, _boundsB);
  const aAbove = _boundsA[2] >= _boundsB[2];
  const upper = aAbove ? a : b;
  const lower = aAbove ? b : a;
  const upperFrame = aAbove ? aFrame : bFrame;
  const upperBounds = aAbove ? _boundsA : _boundsB;
  const lowerBounds = aAbove ? _boundsB : _boundsA;
  const minHeight = Math.min(
    upperBounds[1] - upperBounds[0],
    lowerBounds[1] - lowerBounds[0],
  );
  if (upperBounds[2] - lowerBounds[2] < minHeight * STACK_AXIS_FRACTION) return false;
  const penetration = lowerBounds[1] - upperBounds[0];
  if (penetration < -CONTACT_SLOP_M ||
      penetration > minHeight * STACK_MAX_PENETRATION_FRACTION) return false;

  const upperMass = Math.max(1, upper.spec.weightTons || 1);
  const lowerMass = Math.max(1, lower.spec.weightTons || 1);
  const lowerLocked = lower.state.grounded !== false && !ensureBodyState(lower.state).tumbling;
  correctVerticalOverlap(upper, lower, penetration, upperMass, lowerMass, lowerLocked);
  const closing = resolveVerticalImpulse(upper, lower, upperMass, lowerMass, lowerLocked);
  const upperBody = markDynamicSupport(upper);
  applyAngularImpact(upper, lower, upperFrame, upperBody, closing, onImpact);
  upper.state.speed *= 0.985;
  return true;
}

/**
 * Resolve vertical tank-on-tank contacts once after every movement pass.
 * Returns the number of active contacts for probes/telemetry.
 */
export function resolveTankBodyContacts<Entity extends TankBodyEntity>(
  entities: readonly Entity[],
  _dt: number,
  onImpact: TankBodyImpact<Entity> | null = null,
): number {
  prepareContactFrames(entities);
  let contacts = 0;
  for (let i = 0; i < entities.length; i++) {
    const a = entities[i];
    const aFrame = _contactFramePool[i];
    if (!aFrame.active) continue;
    for (let j = i + 1; j < entities.length; j++) {
      const b = entities[j];
      const bFrame = _contactFramePool[j];
      if (!bFrame.active) continue;
      if (resolveContactPair(a, b, aFrame, bFrame, onImpact)) contacts++;
    }
  }
  return contacts;
}
