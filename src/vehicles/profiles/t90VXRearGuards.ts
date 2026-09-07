import { sectionSolid, type SolidSection } from './sectionSolid.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

type GuardStation = readonly [number, number, number, number];

function skin(side: number, rows: readonly GuardStation[], outerWall: boolean): ReturnType<typeof sectionSolid> {
  const sections = rows.map(([z, outer, top, low]): SolidSection => {
    const inner = outerWall ? outer - .009 : 1.124;
    const bottom = outerWall ? low : top - .0082;
    const ring: readonly (readonly [number, number])[] = [[inner, bottom], [outer, bottom], [outer, top], [inner, top]];
    return { z, ring: side > 0 ? ring : ring.map(([x, y]) => [-x, y] as const).reverse() };
  });
  return sectionSolid(sections);
}

/** Source-measured folded rear guards; no source mesh or topology is loaded. */
export function addT90VRearGuards(P: TankBuilderPort): void {
  const rows: readonly GuardStation[] = [
    [-3.603, 1.57, 1.2142, 1.200], [-3.55, 1.70, 1.2192, 1.133],
    [-3.50, 1.7372, 1.2241, 1.0545], [-3.42, 1.773, 1.2333, 1.006],
    [-3.30, 1.7809, 1.2333, .9670], [-3.2235, 1.7809, 1.2333, .9582],
  ];
  for (const side of [-1, 1]) {
    // A short folded mounting flange joins the retained longitudinal fender.
    P.add('hull', skin(side, [[-3.325, 1.6803, 1.2487, 0],
      [-3.203, 1.6803, 1.2487, 0], [-3.02, 1.825, 1.344, 0]], false));
    P.addMudguard('t90a-vladimir-x-rear-roof', 'hull', skin(side, rows, false));
    P.addMudguard('t90a-vladimir-x-rear-return', 'hull', skin(side, rows, true));
    // The roof is fixed to the flange by two small, shallow lap joints.
    for (const x of [1.25, 1.58]) P.add('hull', sectionSolid([
      { z: -3.31, ring: [[side*x-.018, 1.230], [side*x+.018, 1.230], [side*x+.018, 1.25], [side*x-.018, 1.25]] },
      { z: -3.27, ring: [[side*x-.018, 1.230], [side*x+.018, 1.230], [side*x+.018, 1.25], [side*x-.018, 1.25]] },
    ]));
  }
}
