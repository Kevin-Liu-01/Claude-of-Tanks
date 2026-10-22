import type { GroundSampler, TankBuilderPort } from './tankFactoryCore.ts';

/**
 * A ground sampler in a scaled authoring frame (profiles/vehicleSize.ts, profiles/arieteXFamilyScale.ts): the canonical
 * gear solver works in the source frame, so points, heights, the standable-top ceiling and the per-hull preparation
 * reach scale by `factor` on the way to the integration's sampler. The vehicle-contact lane (2026-10-09): the wrappers
 * dropped the ceiling and the preparation, which left every resized hull's wheels on the terrain alone. One record per
 * wrapper; `current` reads the sampler the latest conform was handed.
 */
export function scaledGroundSampler(factor: number, current: () => GroundSampler): GroundSampler {
  return Object.assign(
    (x: number, z: number, ceiling?: number): number =>
      current()(x * factor, z * factor, ceiling === undefined ? undefined : ceiling * factor) / factor,
    { prepareHull(x: number, z: number, reachM: number): void { current().prepareHull?.(x * factor, z * factor, reachM * factor); } },
  );
}

type RunningGear = NonNullable<TankBuilderPort['gear']>;
interface RunningGearMotionScale {
  readonly factor: number;
  readonly update: RunningGear['update'];
  readonly updateSurface: RunningGear['updateSurface'];
  readonly conform: RunningGear['conform'];
}
const MOTION_SCALES = new WeakMap<RunningGear, RunningGearMotionScale>();

/**
 * Run a running gear's unchanged solver in its scaled authoring frame (profiles/vehicleSize.ts,
 * profiles/arieteXFamilyScale.ts): track travel and world motion reach it divided by `factor` and the terrain through
 * scaledGroundSampler, so the scaled children display the solved wheel, band and shoe stock in installed metres. A
 * clone of the vehicle (tankFactoryCore cloneTankVisual) scales its own gear the same way (runningGearMotionScaleOf).
 */
export function scaleRunningGearMotion(gear: RunningGear, factor: number): void {
  const update = gear.update.bind(gear), surface = gear.updateSurface?.bind(gear);
  const conform = gear.conform.bind(gear);
  let frame: Parameters<typeof conform>[0] | null = null;
  let ground: Parameters<typeof conform>[1];
  const sourceGround = scaledGroundSampler(factor, () => ground);
  gear.update = (left, right, dt) => update(left / factor, right / factor, dt);
  if (surface) gear.updateSurface = (left, right) => surface(left / factor, right / factor);
  gear.conform = (state, sampler, pitch, roll, dt) => {
    if (!frame) frame = { ...state, pos: { ...state.pos } };
    frame.pos.x = state.pos.x / factor; frame.pos.y = state.pos.y / factor; frame.pos.z = state.pos.z / factor;
    frame.yaw = state.yaw; frame.visualPitch = state.visualPitch; frame.visualRoll = state.visualRoll;
    ground = sampler;
    return conform(frame, sourceGround, pitch, roll, dt);
  };
  MOTION_SCALES.set(gear, { factor, update: gear.update, updateSurface: gear.updateSurface, conform: gear.conform });
}

/** The motion scale scaleRunningGearMotion put on `gear` and the methods it installed, or null. */
export function runningGearMotionScaleOf(gear: RunningGear): RunningGearMotionScale | null {
  return MOTION_SCALES.get(gear) ?? null;
}
