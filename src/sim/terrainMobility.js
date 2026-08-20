/**
 * Shared deterministic terrain-mobility policy.
 *
 * A slope is never classified by one fleet-wide angle. Uphill authority is
 * bounded by both the engine's available tractive acceleration and the
 * tracks' grip on the current ground. Downhill traversal is grip-limited:
 * the engine is not required to descend, but the tracks must retain control.
 * Movement and bot navigation consume these same scalar functions so a route
 * the planner accepts is one the authoritative drivetrain can sustain.
 */

export const DRIVE_ACCEL_PER_HPT = 0.165;
export const GRAVITY_MPS2 = 9.81;
export const TRACKED_GRAVITY_SHARE = 0.3;
export const TERRAIN_MARGIN_EPS = 0.01;

const TRACK_GRIP_PER_RESISTANCE = 0.24;
const TRACK_GRIP_MIN = 0.08;
// Caps controlled climb near 42° under the tuned tracked-gravity share. The
// limit still emerges from grip force (and is usually lower from engine or
// ground resistance); it is not a universal map-angle gate.
const TRACK_GRIP_MAX = 0.27;

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

/** Resistance multiplier authored per vehicle and ground material. */
export function groundResistanceFor(spec, groundType = 'medium') {
  const resistance = spec?.terrainResistance;
  if (!resistance) return 1;
  const value = resistance[groundType] ?? resistance.medium ?? resistance.hard ?? 1;
  return Number.isFinite(value) && value > 0 ? value : 1;
}

/** Rated engine acceleration available at the tracks on this ground. */
export function engineDriveAcceleration(
  spec,
  groundType = 'medium',
  powerMult = 1,
  accelMult = 1,
) {
  const hp = Math.max(0, Number(spec?.enginePowerHp) || 0);
  const tons = Math.max(0.1, Number(spec?.weightTons) || 0.1);
  const resistance = groundResistanceFor(spec, groundType);
  return DRIVE_ACCEL_PER_HPT * (hp / tons) / resistance *
    Math.max(0, powerMult) * Math.max(0, accelMult);
}

/**
 * Effective longitudinal grip coefficient. `terrainResistance` already
 * captures track/ground performance fleet-wide; `trackTraction` is an
 * optional explicit multiplier for vehicles with unusually capable or poor
 * running gear without forcing every existing specification to duplicate it.
 */
export function trackGripCoefficient(spec, groundType = 'medium') {
  const resistance = groundResistanceFor(spec, groundType);
  const requestedTraction = Number(spec?.trackTraction ?? 1);
  const authoredTraction = clamp(
    Number.isFinite(requestedTraction) ? requestedTraction : 1,
    0.35,
    1.8,
  );
  return clamp(
    TRACK_GRIP_PER_RESISTANCE * authoredTraction / resistance,
    TRACK_GRIP_MIN,
    TRACK_GRIP_MAX,
  );
}

function forceMargin(available, required) {
  if (!(available > 0)) return 0;
  return clamp((available - required) / available, 0, 1);
}

/** Grip-only margin for retaining controlled contact on an uphill face. */
export function trackGripMargin(spec, groundType, uphillPitchRad) {
  if (!(uphillPitchRad > 0)) return 1;
  const pitch = Math.min(uphillPitchRad, Math.PI * 0.5);
  const grip = trackGripCoefficient(spec, groundType) *
    GRAVITY_MPS2 * Math.max(0, Math.cos(pitch));
  const gravity = GRAVITY_MPS2 * Math.sin(pitch) * TRACKED_GRAVITY_SHARE;
  return forceMargin(grip, gravity);
}

/**
 * Rated uphill drive margin after engine force and track grip are both
 * applied. Zero means open throttle cannot sustain forward progress.
 */
export function uphillDriveMargin(
  spec,
  groundType,
  uphillPitchRad,
  powerMult = 1,
  accelMult = 1,
) {
  if (!(uphillPitchRad > 0)) return 1;
  const pitch = Math.min(uphillPitchRad, Math.PI * 0.5);
  const engine = engineDriveAcceleration(spec, groundType, powerMult, accelMult);
  const grip = trackGripCoefficient(spec, groundType) *
    GRAVITY_MPS2 * Math.max(0, Math.cos(pitch));
  const available = Math.min(engine, grip);
  const gravity = GRAVITY_MPS2 * Math.sin(pitch) * TRACKED_GRAVITY_SHARE;
  return forceMargin(available, gravity);
}

/** Signed grade (rise/run) margin used by terrain-aware route planning. */
export function terrainSlopeMargin(
  spec,
  groundType,
  signedGrade,
  powerMult = 1,
  accelMult = 1,
) {
  if (!Number.isFinite(signedGrade) || signedGrade === 0) return signedGrade === 0 ? 1 : 0;
  const pitch = Math.atan(Math.abs(signedGrade));
  return signedGrade > 0
    ? uphillDriveMargin(spec, groundType, pitch, powerMult, accelMult)
    : trackGripMargin(spec, groundType, pitch);
}

/**
 * Deterministic A* / local-fan cost. Infinity is a real capability rejection;
 * finite costs prefer firm, shallow routes without forcing every tank into
 * the same lane.
 */
export function terrainTravelCostFactor(
  spec,
  groundType,
  signedGrade,
  powerMult = 1,
  accelMult = 1,
) {
  const margin = terrainSlopeMargin(
    spec, groundType, signedGrade, powerMult, accelMult,
  );
  if (margin <= TERRAIN_MARGIN_EPS) return Infinity;
  const hard = groundResistanceFor(spec, 'hard');
  const resistance = groundResistanceFor(spec, groundType);
  const groundCost = clamp(resistance / Math.max(hard, 0.1), 0.8, 3.2);
  return groundCost * (1 + (1 - margin) * 2);
}
