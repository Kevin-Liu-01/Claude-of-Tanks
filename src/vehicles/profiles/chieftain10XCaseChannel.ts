// Original closed bearing shoulder beside the middle equipment cases.
// Dimensions and one broad joining plane were measured from root_7005;
// the rounded transition is an authored analytic casting, not source contours.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { sectionSolid, type SolidSection } from './sectionSolid.ts';
import { chieftain10ClosedHull } from './chieftain10XRearHull.ts';

function at(sections: readonly SolidSection[], z: number): SolidSection {
  const i = sections.findIndex(s => s.z >= z);
  if (i < 1) throw new Error('Mk10 case channel lies outside the authored carrier');
  const a = sections[i - 1], b = sections[i], t = (z - a.z) / (b.z - a.z);
  return { z, ring: a.ring.map(([x, y], k) => [x + (b.ring[k][0] - x) * t,
    y + (b.ring[k][1] - y) * t]) };
}

function castingWidth(y: number, z: number): number {
  // The three independent shoulder-width datums at Z .8/1.2/1.6 define
  // this quadratic plan crown. Small casting fillets remain simplified.
  const crown = 1.519754 + .064209 * z - .202861 * z * z;
  const round = y < 1.44 ? .110 * Math.pow((1.44 - y) / .12, 3)
    : (.22 - .08 * Math.min(1, Math.max(0, (z - .70) / .70))) * (y - 1.44);
  // The actual front side closes on the separate driver-deck wall. Its
  // nearly vertical one-metre face is not an extension of the rounded ring.
  const front = z <= 1.67 ? 0 : Math.min(1, (z - 1.67) / .2886);
  let x = crown - round;
  x += (.99880 - x) * front;
  if (z >= 1.1793848276 && z <= 1.3412948847 && y >= 1.44 && y <= 1.505) {
    // Actual steep joining facet; n·p=d. Keeping this real stock is just
    // as important as removing the adjacent 238 mm-deep false roof fill.
    x = (1.810808542528 - .088993916151 * y - .420631927869 * z) / .902855948724;
  }
  return x;
}

function channelSection(section: SolidSection): SolidSection {
  const { z, ring } = section, low = ring[0][1], elbow = ring[2][1], bay = ring[3][1];
  const roof = ring[5][1], shoulder = ring[4][1], wall = ring[3][0];
  const ys = [bay, 1.35, 1.38, 1.44, shoulder, 1.505, roof];
  const edge = ys.map((y, i): [number, number] => [i === 0 ? wall : castingWidth(y, z), y]);
  return { z, ring: [[ring[0][0], low], [ring[1][0], low], [ring[2][0], elbow],
    ...edge, ...[...edge].reverse().map(([x, y]): [number, number] => [-x, y]),
    [ring[9][0], elbow]] };
}

/** Only the middle-case receiving interval changes. The aft closure, belly,
 * bow planes and all running gear remain on their previous construction. */
export function chieftain10HullWithCaseChannel(sections: readonly SolidSection[]): THREE.BufferGeometry {
  const begin = .65, end = 2.08582;
  const rear = chieftain10ClosedHull([...sections.filter(s => s.z < begin), at(sections, begin)]);
  const front = sectionSolid([at(sections, end), ...sections.filter(s => s.z > end)]);
  const zs = [begin, .80, 1.01, 1.1793848276, 1.3412948847, 1.50, 1.67, 1.80, 1.9586, end];
  const middle = sectionSolid(zs.map(z => channelSection(at(sections, z))));
  // Closed pieces meet at the two receiving stations. End-cap overlap is
  // concealed by the source cases; it does not seal the exposed channel.
  const geometry = mergeGeometries([rear, middle, front]);
  rear.dispose(); middle.dispose(); front.dispose();
  if (!geometry) throw new Error('Mk10 closed case channel attributes differ');
  return geometry;
}
