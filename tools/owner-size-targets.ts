// Independent comparison target chosen by the owner on 2026-09-29.
// Never infer this transform from candidate dimensions or its measured bounds.
export const OWNER_SIZE_TARGETS: Readonly<Record<string, number>> = Object.freeze({
  k21_x: .90, kf41_lynx_x: .90, ajax_x: .90, ares_apc_x: .90,
  griffin50_x: .90, challenger1_x: 1.10,
});
export function withOwnerSizeTargets<T extends Record<string, { turret: readonly number[]; gun: readonly number[] }>>(frames: T): T {
  return Object.fromEntries(Object.entries(frames).map(([id, frame]) => {
    const factor = OWNER_SIZE_TARGETS[id];
    return [id, factor ? { ...frame, ownerSizeFactor: factor,
      turret: frame.turret.map(v => v * factor), gun: frame.gun.map(v => v * factor) } : frame];
  })) as T;
}
