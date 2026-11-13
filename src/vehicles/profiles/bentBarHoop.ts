// First-party geometric primitive (release 268 round b): an upright half hoop of bent bar, the lamp guards, lifting
// eyes and tow hooks of the BMP family (profiles/bmp3Family.ts, profiles/bmpBoatHull.ts).
import * as THREE from 'three';
import { KIT } from '../tankFactoryCore.ts';

/** Upright half hoop (a bent bar): arch radius r in the plane holding +y and x (alongX) or z. Its open ends lie on
 * y = 0: seat it with the ends buried in the part it is welded to. */
export function hoop(r: number, tube: number, alongX: boolean): THREE.BufferGeometry {
  const g = new THREE.TorusGeometry(r, tube, 6, 10, Math.PI);
  return alongX ? g : KIT.xform(g, 0, 0, 0, 0, Math.PI / 2, 0);
}
