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

interface TankBodyState {
  pos: { x: number; y: number; z: number };
  yaw: number;
  speed: number;
  verticalSpeed: number;
  grounded: boolean;
  visualPitch: number;
  visualRoll: number;
  turretYaw: number;
  overturned?: boolean;
  /** The hull's own terrain/structure support under its tracks (movement's support envelope), when it has one. */
  _sup?: { y: number };
  _spring: { pitchV: number; rollV: number };
  _ride: {
    y: number;
    v: number;
    grounded: boolean;
    airTime: number;
    supportY: number;
    groundV: number;
  };
  _body?: {
    tumbling: boolean;
    landingBlendS: number;
    dynamicSupport: boolean;
    autoRighting?: boolean;
    /** The root height this hull rests at on another hull's roof (NaN when it does not): its ground for a tick. */
    restSupportY?: number;
  };
}

interface TankBodyEntity {
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

type TankBodyImpact<Entity extends TankBodyEntity = TankBodyEntity> = (
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
/**
 * Wreck contact (bots lane, 2026-10-02; Sirocco Wadi frontline seed 96596, an M1A2 airborne on wrecks for 300 s).
 * A stack is a landing from above: the upper's bottom sinks into the lower's roof by what a tick of closing (twice,
 * for the pass order) and a pitched nose or tail add, never by a side-by-side overlap — a hull hopping beside a wreck
 * in a 0.7 m dip was lifted 1.9 m onto its roof as a "stack".
 */
const STACK_ENTRY_M = 0.6;
/** The fixed simulation step the entry depth is measured over (prefers-vertical runs inside the movement step). */
const STACK_STEP_S = 1 / 60;
/** A roof contact closing slower than this is rest, not an impact: the upper stands on the roof as on ground (it
 * was held airborne, so it never drove, never stopped spinning, never righted, and climbed as its shell turned). */
const STACK_REST_MPS = 1.0;
/** A hull rising off a roof faster than this is leaving it, not resting on it. */
const STACK_LIFT_MPS = 0.5;
/**
 * A hull standing this far above its own terrain/structure support stands on something else: a roof it lost its seat
 * on this pass, a hull it hangs over (physics lane, 2026-10-03). Its grounded flag still says ground until its next
 * movement step, and the horizontal solver pushed a hull rocking on a wreck's roof a metre a tick off it as ground
 * traffic. Suspension and droop keep an ordinarily grounded hull within 0.25 m of its support.
 */
const STACK_ELEVATED_M = 0.5;

let _restingScratch = new Uint8Array(64);
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
const _preferFrameA: BodyContactFrame = {
  active: false, halfWidth: 0, halfLength: 0, forwardX: 0, forwardZ: 0, rightX: 0, rightZ: 0, centerX: 0, centerZ: 0,
};
const _preferFrameB: BodyContactFrame = { ..._preferFrameA };

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
    const worldY = state.pos.y + rolledY * cosPitch + hull[index + 2] * sinPitch;
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
    const worldY = state.pos.y + rolledY * cosPitch + localZ * sinPitch;
    if (worldY < out[0]) out[0] = worldY;
    if (worldY > out[1]) out[1] = worldY;
  }
}

/**
 * The lowest (or highest) closed-shell point of `entity` that lies over another hull's contact rect (physics lane,
 * 2026-10-03), ±Infinity when none does. A roof contact is decided where the two hulls overlap: the whole-shell
 * extents made a seat follow the upper's lowest corner wherever it was, so a hull rocking on a roof lifted that corner
 * clear, lost its seat, dropped a few centimetres and landed again — five times in 1.5 s. Pitch follows the renderer's
 * composition (rotation.x = -pitch: a nose-up hull raises its front).
 */
function shellOverRect(entity: TankBodyEntity, rect: BodyContactFrame, highest: boolean): number {
  const state = entity.state;
  const contact = entity.spec.armor?.bodyContactPoints;
  const pitch = state.visualPitch || 0, roll = state.visualRoll || 0;
  const cosPitch = Math.cos(pitch), sinPitch = Math.sin(pitch);
  const cosRoll = Math.cos(roll), sinRoll = Math.sin(roll);
  const cosYaw = Math.cos(state.yaw), sinYaw = Math.sin(state.yaw);
  let best = highest ? -Infinity : Infinity;
  for (let cloud = 0; cloud < 2; cloud++) {
    const points = cloud === 0 ? contact?.hull : contact?.turret;
    if (!points || points.length < 3) continue;
    const pivot = cloud === 1 ? (entity.spec.armor?.turretPivot || _zeroPivot) : _zeroPivot;
    const frameYaw = cloud === 1 ? (state.turretYaw || 0) : 0;
    const frameCos = Math.cos(frameYaw), frameSin = Math.sin(frameYaw);
    for (let index = 0; index + 2 < points.length; index += 3) {
      const localX = pivot[0] + points[index] * frameCos + points[index + 2] * frameSin;
      const localY = pivot[1] + points[index + 1];
      const localZ = pivot[2] - points[index] * frameSin + points[index + 2] * frameCos;
      const rolledX = localX * cosRoll - localY * sinRoll;
      const rolledY = localX * sinRoll + localY * cosRoll;
      const pitchedZ = localZ * cosPitch - rolledY * sinPitch;
      const worldX = state.pos.x + rolledX * cosYaw + pitchedZ * sinYaw;
      const worldZ = state.pos.z - rolledX * sinYaw + pitchedZ * cosYaw;
      const dx = worldX - rect.centerX, dz = worldZ - rect.centerZ;
      if (Math.abs(dx * rect.forwardX + dz * rect.forwardZ) > rect.halfLength) continue;
      if (Math.abs(dx * rect.rightX + dz * rect.rightZ) > rect.halfWidth) continue;
      const worldY = state.pos.y + rolledY * cosPitch + localZ * sinPitch;
      if (highest ? worldY > best : worldY < best) best = worldY;
    }
  }
  return best;
}
const _zeroPivot: readonly number[] = Object.freeze([0, 0, 0]);

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
    restSupportY: NaN,
  });
}

function isDynamicBodyContact(entity: TankBodyEntity): boolean {
  const state = entity.state;
  return state.grounded === false || state.overturned === true ||
    state._body?.tumbling === true || state._body?.dynamicSupport === true ||
    Number.isFinite(state._body?.restSupportY) ||
    state.pos.y > (state._sup?.y ?? Infinity) + STACK_ELEVATED_M;
}

/** How deep an upper hull's bottom may sit in a lower roof and still be a landing on it (see STACK_ENTRY_M). */
function stackEntryLimit(upper: TankBodyEntity, lower: TankBodyEntity, minHeight: number, dt: number): number {
  // (a client's prediction world holds other hulls as interpolated poses without a ride: their vertical speed is 0)
  const upperV = upper.state.verticalSpeed || upper.state._ride?.v || 0;
  const lowerV = lower.state.verticalSpeed || lower.state._ride?.v || 0;
  return Math.min(minHeight * STACK_MAX_PENETRATION_FRACTION,
    STACK_ENTRY_M + 2 * Math.max(0, lowerV - upperV) * dt);
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
  // the depth is the pair resolver's own (where the footprints overlap, orderedPairDepth): a hull standing on a roof
  // with its nose or a track hanging beside the lower hull is on that roof, not beside it. Clear above the approach it
  // is tanksVerticallyClear's; hulls overlapping deeper than a landing are side by side, and the horizontal solver
  // keeps them apart.
  const depth = orderedPairDepth(a, b);
  if (depth < -STACK_APPROACH_M) return false;
  const aAbove = _boundsA[2] >= _boundsB[2];
  return depth <= stackEntryLimit(aAbove ? a : b, aAbove ? b : a, minHeight, STACK_STEP_S);
}

/** contactPenetration for a vertically ordered pair whose bounds are in _boundsA/_boundsB (the higher centre above). */
function orderedPairDepth(a: TankBodyEntity, b: TankBodyEntity): number {
  const aAbove = _boundsA[2] >= _boundsB[2];
  fillContactFrame(_preferFrameA, a);
  fillContactFrame(_preferFrameB, b);
  return aAbove
    ? contactPenetration(a, b, _preferFrameA, _preferFrameB, _boundsA, _boundsB)
    : contactPenetration(b, a, _preferFrameB, _preferFrameA, _boundsB, _boundsA);
}

/**
 * How deep the upper hull's underside sits in the lower hull's top where their footprints overlap (negative: the gap
 * between them): the upper's lowest shell point over the lower's rect against the lower's highest under the upper's
 * (shellOverRect); the whole-shell extents only when no shell point lies in the overlap.
 */
function contactPenetration(
  upper: TankBodyEntity,
  lower: TankBodyEntity,
  upperFrame: BodyContactFrame,
  lowerFrame: BodyContactFrame,
  upperBounds: Float64Array,
  lowerBounds: Float64Array,
): number {
  const regionBottom = shellOverRect(upper, lowerFrame, false);
  const regionTop = shellOverRect(lower, upperFrame, true);
  return regionBottom < Infinity && regionTop > -Infinity
    ? regionTop - regionBottom : lowerBounds[1] - upperBounds[0];
}

/**
 * True when one hull's whole vertical extent lies above the other's by more than the stacking approach: the
 * ground OBB solver must not push the pair apart sideways. Before this (2026-09-19, owner: "if you try to fly
 * over a tank … you just hit an invisible wall") an airborne hull clearing another tank by more than 14 cm was
 * neither reserved for the vertical module nor exempt from the horizontal push.
 */
export function tanksVerticallyClear(a: TankBodyEntity, b: TankBodyEntity): boolean {
  verticalBounds(a, _boundsA);
  verticalBounds(b, _boundsB);
  if (_boundsA[0] > _boundsB[1] + STACK_APPROACH_M || _boundsB[0] > _boundsA[1] + STACK_APPROACH_M) return true;
  // a vertically ordered pair is clear where the footprints overlap (physics lane, 2026-10-03): a hull above a roof
  // with a track hanging beside the lower hull, lower than its roof, flies over it
  const minHeight = Math.min(_boundsA[1] - _boundsA[0], _boundsB[1] - _boundsB[0]);
  if (Math.abs(_boundsA[2] - _boundsB[2]) < minHeight * STACK_AXIS_FRACTION) return false;
  return orderedPairDepth(a, b) < -STACK_APPROACH_M;
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
  fillContactFrame(contactFrame(index), entity);
}

function fillContactFrame(frame: BodyContactFrame, entity: TankBodyEntity | null | undefined): void {
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

/** A resting roof contact is ground contact: the upper stands at its seated height until the next contact pass. The
 * ride's support moves with the roof it is on (no launch from the step up onto it). */
function seatOnRoof(upper: TankBodyEntity, lower: TankBodyEntity): void {
  const state = upper.state, body = ensureBodyState(state), ride = state._ride;
  body.dynamicSupport = true;
  const seated = state.pos.y;
  body.restSupportY = Number.isFinite(body.restSupportY) ? Math.max(body.restSupportY!, seated) : seated;
  const lowerV = lower.state.verticalSpeed || lower.state._ride.v || 0;
  state.grounded = true;
  ride.grounded = true;
  ride.airTime = 0;
  ride.supportY = body.restSupportY!;
  ride.groundV = lowerV;
  setVerticalVelocity(state, lowerV);
}

function resolveContactPair<Entity extends TankBodyEntity>(
  a: Entity,
  b: Entity,
  aFrame: BodyContactFrame,
  bFrame: BodyContactFrame,
  onImpact: TankBodyImpact<Entity> | null,
  dt: number,
  aResting: boolean,
  bResting: boolean,
): boolean {
  if (!aResting && !bResting && !isDynamicBodyContact(a) && !isDynamicBodyContact(b)) return false;
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
  // the contact is where the footprints overlap (contactPenetration)
  const penetration = contactPenetration(upper, lower, upperFrame, aAbove ? bFrame : aFrame, upperBounds, lowerBounds);
  // a hull that rested on this roof keeps its seat across the stacking approach unless it is lifting off
  const upperResting = aAbove ? aResting : bResting;
  const lift = (upper.state.verticalSpeed || upper.state._ride.v || 0) - (lower.state.verticalSpeed || lower.state._ride.v || 0);
  const seatGap = upperResting && lift < STACK_LIFT_MPS ? STACK_APPROACH_M : CONTACT_SLOP_M;
  if (penetration < -seatGap || penetration > stackEntryLimit(upper, lower, minHeight, dt)) return false;

  const upperMass = Math.max(1, upper.spec.weightTons || 1);
  const lowerMass = Math.max(1, lower.spec.weightTons || 1);
  const lowerLocked = lower.state.grounded !== false && !ensureBodyState(lower.state).tumbling;
  correctVerticalOverlap(upper, lower, penetration, upperMass, lowerMass, lowerLocked);
  const closing = resolveVerticalImpulse(upper, lower, upperMass, lowerMass, lowerLocked);
  if (closing < STACK_REST_MPS) {
    seatOnRoof(upper, lower);
    upper.state.speed *= 0.985;
    return true;
  }
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
  dt: number,
  onImpact: TankBodyImpact<Entity> | null = null,
): number {
  prepareContactFrames(entities);
  // roof rest lasts one movement step: this pass re-seats every hull still on a roof (a hull that rested is still a
  // dynamic contact for the pass, though its own movement step reset its support flag)
  if (_restingScratch.length < entities.length) _restingScratch = new Uint8Array(entities.length * 2);
  for (let i = 0; i < entities.length; i++) {
    const body = entities[i]?.state?._body;
    _restingScratch[i] = body && Number.isFinite(body.restSupportY) ? 1 : 0;
    if (body) body.restSupportY = NaN;
  }
  let contacts = 0;
  for (let i = 0; i < entities.length; i++) {
    const a = entities[i];
    const aFrame = _contactFramePool[i];
    if (!aFrame.active) continue;
    for (let j = i + 1; j < entities.length; j++) {
      const b = entities[j];
      const bFrame = _contactFramePool[j];
      if (!bFrame.active) continue;
      if (resolveContactPair(a, b, aFrame, bFrame, onImpact, dt, _restingScratch[i] === 1, _restingScratch[j] === 1)) {
        contacts++;
      }
    }
  }
  return contacts;
}
