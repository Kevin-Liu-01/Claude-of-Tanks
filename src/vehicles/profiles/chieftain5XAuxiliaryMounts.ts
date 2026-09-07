// Exterior-only first-party forms: MoD Armament Pamphlet No.33 (1980),
// printed pp40 and69–70, identifies the left ranging gun and upper coax sleeve.
// Local dimensions/placement are photo-led construction estimates, not a
// working mechanism, firing model, or copied source topology.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

type Point = readonly [number, number, number];

function barrel(P: TankBuilderPort, datum: Point, x: number, y: number,
  back: number, front: number, radius: number, bore: number): void {
  const profile = [[radius, back], [radius, front], [bore, front],
    [bore, front - .060], [0, front - .060], [0, back], [radius, back]];
  const g = new THREE.LatheGeometry(profile.map(([r, z]) => new THREE.Vector2(r, z)), 24)
    .rotateX(Math.PI / 2).translate(x - datum[0], y - datum[1], -datum[2]);
  // Both auxiliary weapons are cradle-mounted: pitch/yaw with the main gun,
  // but never inherit the main barrel's independent recoil travel.
  P.addEquipment('gunMount', g);
}

export function addChieftain5XAuxiliaryMounts(P: TankBuilderPort, trunnion: Point): void {
  const add = (g: THREE.BufferGeometry, x: number, y: number, z: number) =>
    P.addEquipment('gunMount', g, x - trunnion[0], y - trunnion[1], z - trunnion[2]);
  // Ranging receiver boot and its concealed saddle overlap the actual cast
  // cradle. Keep the separately projecting narrow tube and true muzzle mouth.
  add(KIT.box(.19, .09, .27), -.278, 2.180, 1.64);
  add(KIT.cylZ(.067, .39, 24), -.358, 2.192, 1.700);
  add(KIT.cylZ(.042, .26, 20), -.358, 2.192, 1.995);
  barrel(P, trunnion, -.358, 2.192, 2.03, 2.71, .019, .00635);
  // A short tapered flexible sleeve over the upper cradle. Its closed wall
  // surrounds the coax tube; the main turret casting and roof stay untouched.
  add(KIT.box(.16, .10, .24), .15, 2.290, 1.56);
  const sleeve = new THREE.LatheGeometry([[.064, 1.44], [.073, 1.52],
    [.068, 1.66], [.052, 1.79], [.033, 1.93], [.017, 1.93],
    [.017, 1.44], [.064, 1.44]].map(([r, z]) => new THREE.Vector2(r, z)), 28)
    .rotateX(Math.PI / 2);
  add(sleeve, .15, 2.354, 0);
  barrel(P, trunnion, .15, 2.354, 1.75, 2.145, .015, .00381);
}
