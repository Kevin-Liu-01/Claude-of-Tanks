function finite(value, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Fill the reusable bottom-left mobility readout model without allocating.
 * Runtime speed is m/s; presentation values use the familiar km/h contract.
 */
export function fillDriveTelemetry(out, state, spec) {
  const speedKmhSigned = finite(state?.speed) * 3.6;
  const speedKmh = Math.min(999, Math.round(Math.abs(speedKmhSigned)));
  const direction = speedKmhSigned > 0.5 ? 'FWD' : speedKmhSigned < -0.5 ? 'REV' : 'HOLD';
  const forwardLimit = Math.max(0, finite(spec?.topSpeedKmh));
  const reverseLimit = Math.max(0, finite(spec?.reverseSpeedKmh, forwardLimit * 0.2));
  const limitKmh = direction === 'REV' ? reverseLimit : forwardLimit;
  const speedRatio = limitKmh > 0 ? Math.min(1, speedKmh / limitKmh) : 0;

  out.speedKmh = speedKmh;
  out.direction = direction;
  out.limitKmh = Math.round(limitKmh);
  out.speedRatio = speedRatio;
  out.sweepDeg = Math.round(speedRatio * 270);
  out.needleDeg = -135 + out.sweepDeg;
  return out;
}
