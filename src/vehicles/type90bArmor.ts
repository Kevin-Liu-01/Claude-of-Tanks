// The Type 90 (B)'s roller mounting plate (267; Main 2026-10-31): the datums its builder draws (profiles/type90B.ts) and
// the spaced plate its spec carries (type90bSpecs.ts), from one table. Boot-light: plain data, no geometry. Hull frame.
// The Type 90's lower front plate (profiles/type90X.ts hull rows) rises from y 0.647 at z 3.408 to the nose's foot
// (y 0.902, z 3.570) across |x| <= 0.922, facing forward and down; the 10 mm plate covers it to |x| 0.86.
import { plate, type ArmorPlate } from './specHelpers.ts';

const FOOT = [0.647, 3.408] as const, TOP = [0.902, 3.570] as const;
const LEN = Math.hypot(TOP[0] - FOOT[0], TOP[1] - FOOT[1]);
const UP = [(TOP[0] - FOOT[0]) / LEN, (TOP[1] - FOOT[1]) / LEN] as const;

export const TYPE90B_ROLLER_PLATE = Object.freeze({
  halfW: 0.86, thicknessM: 0.010, foot: FOOT, top: TOP, lengthM: LEN,
  /** [y, z] up the plate and out of it (forward and down). */
  up: UP, out: [-UP[1], UP[0]] as const,
});

/** The plate's outer face as a spaced plate: 10 mm of steel over the lower front plate. */
export function type90bRollerPlate(): ArmorPlate {
  const { halfW, thicknessM: t, out } = TYPE90B_ROLLER_PLATE;
  const [fy, fz] = [FOOT[0] + out[0] * t, FOOT[1] + out[1] * t], [ty, tz] = [TOP[0] + out[0] * t, TOP[1] + out[1] * t];
  return plate('type90b_roller_mount_plate', 10, [-halfW, fy, fz], [halfW, fy, fz], [-halfW, ty, tz], { kind: 'spaced' });
}
