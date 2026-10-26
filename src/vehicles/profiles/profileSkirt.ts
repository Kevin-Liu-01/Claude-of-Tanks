// Profile side skirts (the owner, 2026-10-24: "update the sideskirts ... to not be just rectangles, and instead match the
// geometries of their upperglacis and hull side profile (like the m6 linebacker). looks much cleaner and modern"). A
// skirt is one plate swept along the hull (sectionSolid): at each station its bottom and its top, so its top line can run
// along the hull's side, come down the upper glacis and rake its ends like the lower glacis and the stern, the way the
// M6's appliqué continues its hull's planes, instead of a row of rectangles standing past them. Callers own every
// station (each vehicle's own side and glacis lines); the helpers read the profile back so the armour and the cages laid
// on it follow it too.
import type * as THREE from 'three';
import { sectionSolid, type SectionPoint } from './sectionSolid.ts';

/** One station along the hull (rear to front): its z, the skirt's bottom and its top there (m, hull frame). */
export type SkirtStation = readonly [z: number, bottom: number, top: number];

export interface ProfileSkirt {
  /** Rear to front, strictly increasing z; an end's bottom and top may meet within 2 mm (a raked point). */
  readonly stations: readonly SkirtStation[];
  /** The plate's inner and outer faces' distances off the centreline (m). */
  readonly inner: number;
  readonly outer: number;
}

/** The skirt as a closed solid on one side (+1 right, -1 left). */
export function profileSkirtGeometry(skirt: ProfileSkirt, side: 1 | -1): THREE.BufferGeometry {
  const { stations, inner, outer } = skirt;
  if (stations.length < 2) throw new Error('profileSkirtGeometry needs two stations');
  for (let k = 1; k < stations.length; k++) {
    if (!(stations[k][0] > stations[k - 1][0])) throw new Error('profileSkirtGeometry stations must run rear to front');
  }
  return sectionSolid(stations.map(([z, bottom, top]) => {
    // a raked end keeps a 2 mm face: a section's contour may not collapse
    const t = Math.max(top, bottom + 0.002);
    const ring: SectionPoint[] = [[inner, bottom], [outer, bottom], [outer, t], [inner, t]];
    return { z, ring: side > 0 ? ring : ring.map(([x, y]): SectionPoint => [-x, y]).reverse() };
  }));
}

function lineAt(stations: readonly SkirtStation[], z: number, index: 1 | 2): number {
  if (z <= stations[0][0]) return stations[0][index];
  for (let k = 1; k < stations.length; k++) {
    const [z1] = stations[k];
    if (z <= z1) {
      const [z0] = stations[k - 1];
      const t = (z - z0) / (z1 - z0);
      return stations[k - 1][index] + (stations[k][index] - stations[k - 1][index]) * t;
    }
  }
  return stations[stations.length - 1][index];
}

/** The skirt's top and bottom lines at a z (linear between stations, held past the ends). */
export const skirtTopAt = (skirt: ProfileSkirt, z: number): number => lineAt(skirt.stations, z, 2);
export const skirtBottomAt = (skirt: ProfileSkirt, z: number): number => lineAt(skirt.stations, z, 1);

/** Whether a rectangle on the skirt's face (z0..z1, y0..y1) lies inside its profile by `margin` everywhere along it. */
export function fitsInSkirt(skirt: ProfileSkirt, z0: number, z1: number, y0: number, y1: number, margin = 0.01): boolean {
  const first = skirt.stations[0][0], last = skirt.stations[skirt.stations.length - 1][0];
  if (z0 < first + margin || z1 > last - margin) return false;
  const zs = [z0, z1, ...skirt.stations.map(([z]) => z).filter((z) => z > z0 && z < z1)];
  return zs.every((z) => y0 >= skirtBottomAt(skirt, z) + margin && y1 <= skirtTopAt(skirt, z) - margin);
}

/** A band of the skirt `fromTop` under its top line, `height` deep (never below its bottom line): a rail along the profile
 *  (on faces of its own), or, with a deep height, the field under the top that armour laid on the skirt keeps to. */
export function skirtBand(skirt: ProfileSkirt, fromTop: number, height: number,
  inner = skirt.inner, outer = skirt.outer): ProfileSkirt {
  return { inner, outer, stations: skirt.stations.map(([z, bottom, top]): SkirtStation => {
    const bandTop = Math.max(bottom, top - fromTop);
    return [z, Math.max(bottom, bandTop - height), bandTop];
  }) };
}

/** The skirt between z0 and z1 (rear to front), on its own faces if given: one panel of a segmented run, its top and
 *  bottom lines the run's. */
export function skirtSegment(skirt: ProfileSkirt, z0: number, z1: number,
  inner = skirt.inner, outer = skirt.outer): ProfileSkirt {
  const zs = [z0, ...skirt.stations.map(([z]) => z).filter((z) => z > z0 && z < z1), z1];
  return { inner, outer, stations: zs.map((z): SkirtStation => [z, skirtBottomAt(skirt, z), skirtTopAt(skirt, z)]) };
}
