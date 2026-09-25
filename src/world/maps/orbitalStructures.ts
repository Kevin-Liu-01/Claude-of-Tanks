import * as THREE from 'three';
import { markWorldAperture, markWorldBeacon } from '../worldNightEmissionGeometry.ts';

type Rng = () => number;
interface OrbitalKit {
  box(w: number, h: number, d: number): THREE.BufferGeometry;
  cylinder(top: number, bottom: number, h: number, segments?: number): THREE.BufferGeometry;
  colored(out: THREE.BufferGeometry[], geometry: THREE.BufferGeometry, color: number, rng: Rng, jitter?: number): THREE.BufferGeometry;
  mergeConnectedStructure(id: string, parts: THREE.BufferGeometry[]): THREE.BufferGeometry;
}
const WHITE = 0xe7e7df, FRAME = 0x66727a, DARK = 0x263846;
const ORANGE = 0xd87736, GLASS = 0x52849a, GOLD = 0xb99a55;

/** Repeated base infrastructure stays in the existing metal instance buckets.
 * Opaque glazing/foil avoids a transparent pass; fixture masks use the shared
 * night-emission owner. Connectivity is certified before merging each kit.
 */
export function createOrbitalStructures(kit: OrbitalKit) {
  const { box, cylinder, colored, mergeConnectedStructure } = kit;
  function assembly(rng: Rng) {
    const out: THREE.BufferGeometry[] = [];
    const add = (g: THREE.BufferGeometry, color = WHITE) => colored(out, g, color, rng, .025);
    const block = (w: number, h: number, d: number, x: number, y: number, z: number, color = WHITE) => add(box(w, h, d).translate(x, y, z), color);
    const drum = (r: number, h: number, x: number, y: number, z: number, color = WHITE) => add(cylinder(r, r, h, 12).translate(x, y, z), color);
    const window = (w: number, h: number, x: number, y: number, z: number) => add(markWorldAperture(box(w, h, .08), [0, 0, 1]).translate(x, y, z), GLASS);
    return { out, add, block, drum, window };
  }

  function missioncontrol(rng: Rng): THREE.BufferGeometry {
    const a = assembly(rng);
    a.block(15, .6, 12, 0, .3, 0, FRAME);
    a.block(13.6, 4.4, 10.4, 0, 2.8, 0);
    a.block(14.3, .28, 11.1, 0, 5.08, 0, FRAME);
    a.block(9.4, 3.2, 7.5, 0, 6.82, -1);
    a.block(10, .25, 8.1, 0, 8.53, -1);
    for (const x of [-5.4, -2.7, 0, 2.7, 5.4]) {
      a.window(2.1, 1.25, x, 3.5, 5.23);
      a.block(.18, 4.4, .16, x + 1.15, 2.8, 5.26, FRAME);
    }
    for (const x of [-3.4, 0, 3.4]) a.window(2.6, 1.4, x, 7.1, 2.79);
    for (const side of [-1, 1]) {
      for (const z of [-3.8, -1.4, 1, 3.4]) {
        a.block(.18, 3.6, .14, side * 6.84, 2.7, z, FRAME);
        a.block(.12, .42, 1.4, side * 6.87, 1.05, z, ORANGE);
      }
      a.block(2.1, 1.0, 2.4, side * 5.3, 5.7, -2.6, FRAME);
      for (let i = 0; i < 6; i++) a.block(1.9, .06, .10, side * 5.3, 6.23, -3.6 + i * .38, WHITE);
    }
    a.block(2.7, 3.0, 1.25, -4.6, 1.8, 5.7, FRAME);
    a.window(1.85, 2.3, -4.6, 1.8, 6.37);
    a.block(6.3, .35, .10, 1.3, 4.7, 5.26, ORANGE);
    a.drum(.15, 3.6, -3.2, 10.45, -2.4, FRAME);
    a.block(2.8, .12, .15, -3.2, 11.35, -2.4, FRAME);
    a.add(markWorldBeacon(cylinder(.22, .22, .3, 8)).translate(-3.2, 12.4, -2.4), ORANGE);
    return mergeConnectedStructure('missioncontrol', a.out);
  }

  function greenhouse(rng: Rng): THREE.BufferGeometry {
    const a = assembly(rng);
    a.block(8.4, .7, 16, 0, .35, 0, FRAME);
    a.block(7.6, 1.3, 15.6, 0, 1.3, 0);
    // An opaque blue pressure shell, with broad white ribs over every bay.
    const roof = new THREE.CylinderGeometry(3.8, 3.8, 15.6, 16, 1, false, 0, Math.PI);
    roof.rotateZ(Math.PI / 2).rotateY(Math.PI / 2).translate(0, 1.94, 0);
    a.add(roof, GLASS);
    for (const z of [-7.7, -5.15, -2.58, 0, 2.58, 5.15, 7.7]) {
      const rib = new THREE.TorusGeometry(3.83, .11, 5, 18, Math.PI);
      rib.translate(0, 1.94, z); a.add(rib);
      a.block(.24, 1.6, .24, -3.83, 1.15, z);
      a.block(.24, 1.6, .24, 3.83, 1.15, z);
    }
    for (const side of [-1, 1]) a.block(.16, .16, 15.6, side * 2.68, 4.68, 0, FRAME);
    a.block(2.6, 2.8, 1.4, 0, 1.65, 8.1);
    a.window(1.6, 2.0, 0, 1.65, 8.84);
    a.block(2.2, .28, .14, 0, 2.85, 8.86, ORANGE);
    a.block(1.9, 1.6, 3.0, 4.65, .8, -3, WHITE);
    for (const z of [-3.8, -3.4, -3, -2.6, -2.2]) a.block(.10, 1.1, .10, 5.64, .9, z, FRAME);
    return mergeConnectedStructure('greenhouse', a.out);
  }

  function ascentlander(rng: Rng): THREE.BufferGeometry {
    const a = assembly(rng);
    // The service pad is the movement footprint; legs and engine have real stock.
    a.add(cylinder(6.8, 7, .35, 8).translate(0, .175, 0), FRAME);
    a.add(cylinder(1.0, 1.75, 1.7, 16).translate(0, 1.9, 0), DARK);
    a.add(cylinder(3.1, 3.6, 3.2, 8).translate(0, 4.15, 0), GOLD);
    a.add(cylinder(2.65, 3.1, 2.9, 8).translate(0, 7.2, 0));
    a.add(cylinder(1.35, 2.65, 1.6, 8).translate(0, 9.45, 0));
    a.drum(1.35, .35, 0, 10.43, 0, FRAME);
    for (const side of [-1, 1]) for (const zside of [-1, 1]) {
      const x = side * 4.6, z = zside * 4.6;
      a.drum(.85, .25, x, .49, z, GOLD);
      const start = new THREE.Vector3(x, .6, z), end = new THREE.Vector3(side * 2.2, 3.2, zside * 2.2);
      const delta = end.clone().sub(start);
      const leg = cylinder(.18, .24, delta.length(), 8);
      leg.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()));
      a.add(leg.translate(...start.add(end).multiplyScalar(.5).toArray()), FRAME);
      a.drum(.65, 2.5, side * 2.9, 6.45, zside * 1.3, GOLD);
    }
    for (const x of [-.8, .8]) a.window(1.0, .85, x, 7.6, 2.75);
    for (let y = 1; y < 6; y += .4) a.block(1.0, .09, .20, 0, y, 3.5, FRAME);
    for (const x of [-.53, .53]) a.block(.10, 5.3, .15, x, 3.35, 3.5, FRAME);
    a.block(.14, 2.5, .14, 0, 11.75, 0, FRAME);
    a.block(1.9, .13, .13, 0, 12.3, 0, FRAME);
    return mergeConnectedStructure('ascentlander', a.out);
  }

  function rovergarage(rng: Rng): THREE.BufferGeometry {
    const a = assembly(rng);
    a.block(13, .55, 17, 0, .275, 0, FRAME);
    a.block(12, 4.4, 16, 0, 2.75, 0);
    a.block(11.8, .4, 16.2, 0, 5.15, 0, FRAME);
    a.block(10.4, 1.25, 15.9, 0, 5.65, 0);
    for (const x of [-3.1, 3.1]) {
      a.block(5.25, 3.75, .13, x, 2.38, 8.05, DARK);
      for (let y = .75; y < 4.2; y += .42) a.block(5.2, .06, .10, x, y, 8.15, FRAME);
      a.block(5.3, .3, .20, x, 4.5, 8.08, ORANGE);
    }
    for (const side of [-1, 1]) for (const z of [-7, -3.5, 0, 3.5, 7]) {
      a.block(.22, 4.65, .25, side * 6.07, 2.8, z, FRAME);
      a.block(.15, .65, 1.8, side * 6.09, 3.7, z, GLASS);
    }
    for (const x of [-3, 3]) {
      a.block(1.7, .65, 3.8, x, 6.6, -2, FRAME);
      for (let z = -3.6; z < -.2; z += .4) a.block(1.55, .08, .12, x, 6.98, z);
    }
    return mergeConnectedStructure('rovergarage', a.out);
  }
  return { missioncontrol, greenhouse, ascentlander, rovergarage };
}
