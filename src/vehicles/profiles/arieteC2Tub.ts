// Closed C2-only receiving walls for its wider articulated links. Coordinates
// remain in the supplied C1 authoring frame; original C1 stock is untouched.
import type { SolidSection } from './sectionSolid.ts';

const FLOOR_STATIONS = [
  [-3.157488, .990815, 1.200249], [-2.763854, .402046, 1.200249],
  [2.657875, .402046, 1.200249], [3.035, .69896, 1.1873],
  [3.329914, .931097, 1.02028], [3.400566, .990, .9918],
] as const;

function heights(z: number): [number, number] {
  for (let i = 1; i < FLOOR_STATIONS.length; i++) {
    const a = FLOOR_STATIONS[i - 1], b = FLOOR_STATIONS[i];
    if (z <= b[0]) {
      const t = (z - a[0]) / (b[0] - a[0]);
      return [a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    }
  }
  throw new RangeError('C2 receiving-wall station outside retained tub');
}

/** Keep floor/roof heights and the complete nose/stern length. The inward
 * receiving wall is a convex trapezoid, not a concave notch. The centre floor
 * stays full width and its roof edges retreat 50.7 mm behind the old wall;
 * only the hidden end wraps narrow through the wall's full height. */
export function arieteC2TubSections(): SolidSection[] {
  const stations = [
    [-3.157488, .877267, .876267], [-3.04, .8465, .846],
    [-2.763854, .8465, .846], [-2.40, .8465, .846],
    [-2.30, .877267, .832], [2.30, .877267, .832],
    [2.40, .8465, .846], [2.657875, .8465, .846],
    [3.035, .8465, .846], [3.18, .8465, .846],
    [3.329914, .877267, .876267], [3.400566, .877267, .876267],
  ];
  return stations.map(([z, outer, inner]) => {
    const [bottom, roof] = heights(z);
    return { z, ring: [[-outer, bottom], [outer, bottom],
      [inner, roof], [-inner, roof]] };
  });
}
