import type { BufferGeometry } from 'three';
import { cylZ } from './factoryGeometry.ts';

/** Closed launcher and its protective end cap, sharing one local +Z axis.
 * The caller applies the same mount transform to both material parts.
 * Half the cap depth overlaps the existing closed tube end: no air gap,
 * coincident front faces, new bore, or change to the tube/mount recipe. */
export function cappedSmokeLauncherGeometry(
  radiusM: number,
  lengthM: number,
  capRadiusM: number,
  capDepthM: number,
  segments: number,
): { body: BufferGeometry; cap: BufferGeometry } {
  const body = cylZ(radiusM, lengthM, segments);
  const cap = cylZ(capRadiusM, capDepthM, segments);
  cap.translate(0, 0, lengthM / 2);
  return { body, cap };
}
