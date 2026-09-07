// Original permanent C1 fittings informed by the dated Army side and reversed-
// turret photographs. These are construction estimates, not AI-mesh metrics.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

const { box, cylX, cylZ, torus } = KIT;
type Pivot = readonly [number, number, number];

function add(P: TankBuilderPort, pivot: Pivot, bucket: string,
  geometry: THREE.BufferGeometry, x = 0, y = 0, z = 0): void {
  P.addEquipment(bucket, geometry, x - pivot[0], y - pivot[1], z - pivot[2]);
}

function launcher(P: TankBuilderPort, pivot: Pivot, side: number, z: number): void {
  const center = new THREE.Vector3(side * 1.61, 2.205, z);
  const axis = new THREE.Vector3(side * .76, .19, .62).normalize();
  const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis);
  // Closed metal wall and stock, with an actual 170 mm-deep open mouth.
  // The old outside-only cylinder was mostly buried in the armor flank.
  const points = [[.045, -.095], [.045, .095], [.035, .095],
    [.035, -.085], [0, -.085], [0, -.095], [.045, -.095]];
  const tube = new THREE.LatheGeometry(points.map(([r, a]) => new THREE.Vector2(r, a)), 24)
    .rotateX(Math.PI / 2).applyQuaternion(rotation).translate(...center.toArray());
  add(P, pivot, 'turretDetail', tube);
  const stock = cylZ(.0352, .010, 24).applyQuaternion(rotation);
  const back = center.clone().addScaledVector(axis, -.080);
  add(P, pivot, 'turretDark', stock, back.x, back.y, back.z);
}

export function addArieteXLaunchers(P: TankBuilderPort, pivot: Pivot): void {
  for (const side of [-1, 1]) {
    // The carrier overlaps the existing permanent flank, and receives the
    // rear tube stocks. It ends behind the recessed stock faces, not inside
    // the forward mouths. No turret armor or source dimensions are changed.
    add(P, pivot, 'turretDetail', box(.127, .060, .71), side * 1.4885, 2.130, .345);
    for (const z of [.66, .48, .30, .12]) launcher(P, pivot, side, z);
  }
}

export function addArieteXRearStowage(P: TankBuilderPort, pivot: Pivot): void {
  for (const side of [-1, 1]) {
    // Broad paired bins and their hinges are distinct exterior equipment;
    // their forward faces overlap the unchanged closed bustle by 10 mm.
    add(P, pivot, 'turretDetail', box(.72, .47, .16), side * .82, 2.255, -2.10);
    add(P, pivot, 'turretDetail', box(.75, .024, .026), side * .82, 2.023, -2.184);
    for (const dx of [-.19, .19]) add(P, pivot, 'turretDetail', cylX(.020, .115, 12),
      side * .82 + dx, 2.495, -2.177);

    // Separate folded receiving brackets leave open recesses ahead of their
    // stocks. A filled projecting box would erase the photographed relief.
    const x = side * .25;
    add(P, pivot, 'turretDetail', box(.09, .19, .048), x, 2.335, -2.044);
    for (const dx of [-.035, .035]) add(P, pivot, 'turretDetail', box(.015, .15, .10),
      x + dx, 2.33, -2.103);
    add(P, pivot, 'turretDetail', box(.085, .035, .030), x, 2.385, -2.155);
    add(P, pivot, 'turretDetail', box(.09, .08, .040), x, 2.095, -2.040);
    add(P, pivot, 'turretDetail', torus(.028, .009, 20, 8).rotateX(Math.PI / 2),
      x, 2.108, -2.062);
  }
}
