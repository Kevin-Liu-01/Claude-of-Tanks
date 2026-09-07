// First-party narrow rear support: two shaped leaves and unequal upper
// receiving caps, independently measured from root_7001 scalar planes.
import * as THREE from 'three';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

type Profile = readonly (readonly [z: number, y: number])[];

function stock(profile: Profile, x0: number, x1: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  for (const [i, [z, y]] of profile.entries()) {
    if (i === 0) shape.moveTo(-z, y); else shape.lineTo(-z, y);
  }
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, { depth: x1 - x0, bevelEnabled: false })
    .rotateY(Math.PI / 2).translate(x0, 0, 0);
}

function add(P: TankBuilderPort, g: THREE.BufferGeometry, name: string): void {
  g.userData.chieftain10RearSupport = name;
  P.addEquipment('hullDetail', g);
}

function leaf(P: TankBuilderPort, side: number): void {
  const profile: Profile = [[-3.62449479, 1.36346960], [-3.57839489, 1.36346960],
    [-3.54892492, 1.43859959], [-3.55045485, 1.48941958],
    [-3.57364488, 1.66903996], [-3.57783484, 1.68269980],
    [-3.58789468, 1.69262981], [-3.60144, 1.69626975],
    [-3.61499453, 1.69262981], [-3.62519479, 1.68269980],
    [-3.62924480, 1.66903996], [-3.65243483, 1.48941958], [-3.65397477, 1.43859959]];
  add(P, stock(profile, side < 0 ? -.15635 : .13659, side < 0 ? -.13660 : .15634), 'leaf');
}

function cap(P: TankBuilderPort, side: number): void {
  const forwardTop: Profile = side > 0
    ? [[-3.58580446, 1.69626975], [-3.58454466, 1.70992982],
      [-3.57253480, 1.70947969], [-3.57225466, 1.68561971]]
    : [[-3.58608484, 1.69564986], [-3.57225466, 1.68561971]];
  const profile: Profile = [[-3.54920483, 1.58432961], [-3.62868476, 1.65341985],
    [-3.63218474, 1.66911983], [-3.62813473, 1.68446982],
    [-3.61681509, 1.69564986], [-3.60144472, 1.69980979],
    ...forwardTop, [-3.54920483, 1.66645980]];
  add(P, stock(profile, side < 0 ? -.13426 : .11143, side < 0 ? -.11144 : .13431), 'cap');
  // The measured flared toe meets the permanent rear box. Its 4.61 mm
  // forward projection is part of the source, not a pedestal extension.
  const toe: Profile = [[-3.5493, 1.58433], [-3.54459476, 1.58193],
    [-3.54459476, 1.66904], [-3.5493, 1.66646]];
  add(P, stock(toe, side < 0 ? -.13906 : .10663, side < 0 ? -.10664 : .13905), 'toe');
  // Separate source islands leave a 2.3 mm side seam. This concealed lap
  // joins their overlapping solid region without closing the central air.
  const lap: Profile = [[-3.605, 1.656], [-3.595, 1.656], [-3.595, 1.667], [-3.605, 1.667]];
  add(P, stock(lap, side < 0 ? -.1370 : .1339, side < 0 ? -.1338 : .1370), 'concealedCapLap');
}

export function addChieftain10XRearSupport(P: TankBuilderPort): void {
  for (const side of [-1, 1]) { leaf(P, side); cap(P, side); }
}
