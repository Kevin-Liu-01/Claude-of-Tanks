// Independent comparison target chosen by the owner on 2026-09-29.
// Never infer this transform from candidate dimensions or its measured bounds.
export const OWNER_SIZE_TARGETS: Readonly<Record<string, number>> = Object.freeze({
  k21: .90, kf41_lynx: .90, ajax: .90, ares_apc: .90,
  griffin50mm: .90, challenger1_mk3: 1.10,
  // 267: the Burlak prototype's installed size (src/vehicles/vehicleSizePolicy.ts VEHICLE_SIZE_FACTORS, the owner's)
  // over its composite of the T-90A X and Burlak X sources (source-world-registration.mjs).
  t90a_burlak_proto: 1.05,
});
export function withOwnerSizeTargets<T extends Record<string, { turret: readonly number[]; gun: readonly number[] }>>(frames: T): T {
  return Object.fromEntries(Object.entries(frames).map(([id, frame]) => {
    const factor = OWNER_SIZE_TARGETS[id];
    return [id, factor ? { ...frame, ownerSizeFactor: factor,
      turret: frame.turret.map(v => v * factor), gun: frame.gun.map(v => v * factor) } : frame];
  })) as T;
}
