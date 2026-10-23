// Track-width mine plow (TWMP) for the Abrams bows. Release 233 authored it on the M1A1HA (profiles/abramsM1A1Identity.ts);
// lane 240 (owner 2026-10-22: "add one to the ua m1a2 and m1a2 sep v2 as well") moved it here so the source-X study
// (profiles/abramsSourceX.ts) carries the same plow without importing the M1A1 kits. The two hulls share the bow datums
// the plow is fitted to: the nose apex at z 3.905 over y 1.15, the lower glacis rising from (y 0.66, z 3.52) to it, and
// the track and fender fronts behind z 3.86.
// First-party procedural geometry: Kevin B. Liu (NOTICE.md).
import * as THREE from 'three';
import { box, cylX } from '../factoryGeometry.ts';

type Vec3 = readonly [number, number, number];

/** The part of a hull builder port the plow uses (the Abrams and source-X builder ports satisfy it). */
interface MinePlowPort {
  readonly hullG: THREE.Group;
  readonly q: boolean;
  addEquipment(slot: string, geometry: THREE.BufferGeometry, ...transform: number[]): void;
}

/** A box beam of section w x h running from a to b (its length axis on the segment). */
function beam(a: Vec3, b: Vec3, w: number, h: number): THREE.BufferGeometry {
  const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b);
  const dir = to.clone().sub(from);
  const len = dir.length();
  const geometry = box(w, h, len);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir.normalize());
  geometry.applyMatrix4(new THREE.Matrix4().compose(from.add(to).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
  return geometry;
}

/** A closed prism: the (z, y) outline extruded across x from x0 to x1 (world orientation, no further transform). */
function prismAcrossX(outline: ReadonlyArray<readonly [number, number]>, x0: number, x1: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  outline.forEach(([z, y], i) => (i ? shape.lineTo(-z, y) : shape.moveTo(-z, y)));
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: x1 - x0, steps: 1, bevelEnabled: false, curveSegments: 4 });
  // shape (u = -z, v = y, w) -> world (x = w, y = v, z = -u): a quarter turn about +Y, then out to x0
  geometry.rotateY(Math.PI / 2);
  geometry.translate(x0, 0, 0);
  return geometry;
}

/**
 * Track-width mine plow in its raised travel position on the bow. Hull frame (world coordinates):
 * the lift beam crosses in front of the nose on two hull brackets that bite into the lower glacis; each blade unit
 * hangs on two push arms in front of its track, its curved moldboard, skids and tines 0.40 m over the ground. The
 * blades sit outside the gun lane, and the beam's crown (1.05 m) stays under the 10-degree depressed bore there.
 */
export function addTrackWidthMinePlow(P: MinePlowPort): void {
  const BEAM_Z = 4.04, BEAM_Y = 0.98, BLADE_X0 = 0.94, BLADE_X1 = 1.86;
  // Hull brackets: from inside the nose casting out to the beam.
  for (const side of [-1, 1]) {
    P.addEquipment('hullDetail', box(0.22, 0.26, 0.42), side * 0.56, 0.96, 3.86);
    P.addEquipment('hullDark', cylX(0.032, 0.27, P.q ? 12 : 8), side * 0.56, BEAM_Y, BEAM_Z);   // pivot pin
    // electro-hydraulic lift ram from the upper bracket to the beam arm
    P.addEquipment('hullDark', beam([side * 0.70, 1.17, 3.84], [side * 0.70, 1.02, 4.10], 0.06, 0.06));
    P.addEquipment('hullDetail', box(0.10, 0.09, 0.14), side * 0.70, 1.19, 3.84);
  }
  P.addEquipment('hullDetail', box(3.74, 0.15, 0.17), 0, BEAM_Y, BEAM_Z);                        // lift beam
  // Mounting frame (blind critic r1: the blades read "hung on rather than mounted"): a lower frame bar across the nose
  // and a diagonal strut from each beam end back to it, so every blade unit is carried by a braced triangle.
  // (the bar passes through both hull brackets, which carry it into the nose)
  P.addEquipment('hullDetail', box(2.02, 0.12, 0.14), 0, 0.80, 3.75);
  for (const side of [-1, 1]) {
    P.addEquipment('hullDetail', beam([side * 1.80, BEAM_Y - 0.02, BEAM_Z - 0.04], [side * 0.96, 0.80, 3.77], 0.08, 0.09));
    P.addEquipment('hullDetail', beam([side * 1.30, BEAM_Y - 0.04, BEAM_Z - 0.05], [side * 0.78, 0.81, 3.77], 0.07, 0.08));
  }
  for (const side of [-1, 1]) {
    const x0 = side > 0 ? BLADE_X0 : -BLADE_X1, x1 = side > 0 ? BLADE_X1 : -BLADE_X0;
    // Moldboard: a curved 20 mm plate, concave forward, its cutting edge low and leading.
    const face: Array<[number, number]> = [[4.74, 0.38], [4.63, 0.54], [4.555, 0.72], [4.515, 0.90], [4.52, 1.04],
      [4.565, 1.12]];
    const back = face.map(([z, y]) => [z - 0.03, y - 0.004] as [number, number]).reverse();
    P.addEquipment('hullDetail', prismAcrossX([...face, ...back], x0, x1));
    // Back stiffeners and the two push arms to the lift beam.
    for (const fx of [0.16, 0.50, 0.84]) {
      const x = x0 + (x1 - x0) * fx;
      P.addEquipment('hullDetail', prismAcrossX([[4.525, 0.46], [4.495, 1.04], [4.42, 0.99], [4.45, 0.50]], x - 0.025, x + 0.025));
    }
    for (const fx of [0.22, 0.78]) {
      const x = x0 + (x1 - x0) * fx;
      P.addEquipment('hullDetail', beam([x, BEAM_Y - 0.02, BEAM_Z + 0.06], [x, 0.74, 4.48], 0.10, 0.12));
    }
    // Skids under the moldboard ends (depth shoes) and the cutting tines along its edge.
    for (const x of [x0 + 0.06, x1 - 0.06]) {
      P.addEquipment('hullDetail', box(0.06, 0.07, 0.40), x, 0.43, 4.50);
      P.addEquipment('hullDetail', beam([x, 0.47, 4.36], [x, 0.66, 4.50], 0.05, 0.05));
    }
    const tines = P.q ? 6 : 4;
    for (let i = 0; i < tines; i++) {
      const x = x0 + 0.09 + (x1 - x0 - 0.18) * (i / (tines - 1));
      P.addEquipment('hullDark', beam([x, 0.47, 4.66], [x, 0.34, 4.82], 0.07, 0.06));
    }
  }
  // The dog-bone chain links the two blade units low across the centre.
  const chain = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.95, 0.50, 4.50), new THREE.Vector3(-0.45, 0.42, 4.52), new THREE.Vector3(0, 0.40, 4.53),
    new THREE.Vector3(0.45, 0.42, 4.52), new THREE.Vector3(0.95, 0.50, 4.50),
  ], false, 'centripetal'), 16, 0.018, 6, false);
  P.addEquipment('hullDark', chain);
  P.hullG.userData.minePlowReceipt = Object.freeze({
    designFamily: 'cot-twmp-travel-v1', bladeUnits: 2, bladeBottomY: 0.31, beamTopY: BEAM_Y + 0.075,
    forwardZ: 4.85, mountedOn: 'lower-glacis-brackets', equipmentOwned: true,
  });
}
