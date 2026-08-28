export type DriveDirection = 'FWD' | 'REV' | 'HOLD';

export interface DriveTelemetryState {
  readonly speed?: number;
}

export interface DriveTelemetrySpec {
  readonly topSpeedKmh?: number;
  readonly reverseSpeedKmh?: number;
}

export interface DriveTelemetry {
  speedKmh: number;
  direction: DriveDirection;
  limitKmh: number;
  speedRatio: number;
  sweepDeg: number;
  sweepLength: number;
  needleDeg: number;
}

function finite(value: number | null | undefined, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

const CADENCE_EPSILON_S = 1e-6;

/** Keep fixed-step HUD cadences from slipping a whole frame on float error. */
export function isDriveSampleDue(nowS: number, lastS: number, intervalS: number): boolean {
  return lastS < 0 || nowS - lastS >= intervalS - CADENCE_EPSILON_S;
}

/**
 * Fill the reusable bottom-left mobility readout model without allocating.
 * Runtime speed is m/s; presentation values use the familiar km/h contract.
 */
export function fillDriveTelemetry(
  out: DriveTelemetry,
  state: DriveTelemetryState | null | undefined,
  spec: DriveTelemetrySpec | null | undefined,
): DriveTelemetry {
  const speedKmhSigned = finite(state?.speed) * 3.6;
  const speedKmhExact = Math.min(999, Math.abs(speedKmhSigned));
  const speedKmh = Math.round(speedKmhExact);
  const direction = speedKmhSigned > 0.5 ? 'FWD' : speedKmhSigned < -0.5 ? 'REV' : 'HOLD';
  const forwardLimit = Math.max(0, finite(spec?.topSpeedKmh));
  const reverseLimit = Math.max(0, finite(spec?.reverseSpeedKmh, forwardLimit * 0.2));
  const limitKmh = direction === 'REV' ? reverseLimit : forwardLimit;
  // Keep the label integer-valued, but drive the analog presentation from the
  // unrounded speed. Quantizing the needle to whole km/h made a retained 10 Hz
  // readout look visibly sticky even when the simulation itself was smooth.
  const speedRatio = limitKmh > 0 ? Math.min(1, speedKmhExact / limitKmh) : 0;

  out.speedKmh = speedKmh;
  out.direction = direction;
  out.limitKmh = Math.round(limitKmh);
  out.speedRatio = speedRatio;
  out.sweepDeg = speedRatio * 270;
  out.sweepLength = speedRatio * 75;
  out.needleDeg = -135 + out.sweepDeg;
  return out;
}
