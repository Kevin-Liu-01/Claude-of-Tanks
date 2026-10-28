// The Christian II's bolted side modules (release 262; profiles/christian2.ts draws them, christian2Specs.ts carries their
// spaced plates), from one table. Boot-light: plain data, no geometry. World metres on the Type 90 X frame
// (profiles/type90X.ts): its turret pivot (0, 1.681682, 0.156993); the plates are turret-local (pivot at the origin).
import { plate, type ArmorPlate } from './specHelpers.ts';

export const CHRISTIAN2_PIVOT = Object.freeze([0, 1.681682, 0.156993] as const);

/**
 * The Type 90 X compartment wall's half-width by station (its turretArmor rows, [z, -X side, +X side]): the -X wall
 * stands 9-12 cm further out than the +X wall. Linear between the rows; the modules stay between z -0.60 and 1.22, where
 * the wall is vertical.
 */
const WALL_ROWS: ReadonlyArray<readonly [number, number, number]> = Object.freeze([
  [-0.927, 1.296256, 1.191278], [0.157, 1.313827, 1.219205], [0.699, 1.313827, 1.219205], [1.241, 1.292065, 1.193370],
]);

/** Wall half-width at world z on side -1 (-X) or +1 (+X). */
export function christian2WallX(z: number, side: number): number {
  const col = side < 0 ? 1 : 2;
  if (z <= WALL_ROWS[0][0]) return WALL_ROWS[0][col];
  for (let i = 1; i < WALL_ROWS.length; i++) {
    const a = WALL_ROWS[i - 1], b = WALL_ROWS[i];
    if (z <= b[0]) return a[col] + (b[col] - a[col]) * (z - a[0]) / (b[0] - a[0]);
  }
  return WALL_ROWS[WALL_ROWS.length - 1][col];
}

/** Three modules a side: world z spans, standoff from the wall and plate depth, world y band (metres). */
export const CHRISTIAN2_SIDE_MODULES = Object.freeze({
  spans: Object.freeze([[-0.58, 0.02], [0.07, 0.66], [0.71, 1.20]] as const),
  standoffM: 0.055,
  depthM: 0.075,
  y0: 1.80,
  y1: 2.26,
});

/** The modules' composite cassettes over the compartment wall: spaced protection a round meets before the wall. */
const SIDE_PROTECTION = { kind: 'spaced', keMm: 130, ceMm: 340 } as const;

/** The spaced plates on each module's outer face, both sides, turret-local. */
export function christian2SideModulePlates(): ArmorPlate[] {
  const M = CHRISTIAN2_SIDE_MODULES, [px, py, pz] = CHRISTIAN2_PIVOT;
  const plates: ArmorPlate[] = [];
  for (const [s, tag] of [[1, 'R'], [-1, 'L']] as const) {
    M.spans.forEach(([rear, front], i) => {
      const x = (z: number): number => s * (christian2WallX(z, s) + M.standoffM + M.depthM) - px;
      const name = `christian2_side_module_${tag}${i}`, y0 = M.y0 - py, y1 = M.y1 - py, zr = rear - pz, zf = front - pz;
      plates.push(s > 0
        ? plate(name, 70, [x(front), y0, zf], [x(rear), y0, zr], [x(front), y1, zf], SIDE_PROTECTION)
        : plate(name, 70, [x(rear), y0, zr], [x(front), y0, zf], [x(rear), y1, zr], SIDE_PROTECTION));
    });
  }
  return plates;
}
