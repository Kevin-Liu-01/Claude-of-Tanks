// First-party Mk10 paired lamp stocks and open diamond-section guards.
// Locations and section stations come from separate source scalar studies.
import * as THREE from 'three';
import { KIT } from './kit.ts';
import { sectionSolid } from './sectionSolid.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

type Point = readonly [number, number, number];
const { box } = KIT;

function add(P: TankBuilderPort, bucket: string, geometry: THREE.BufferGeometry, name: string): void {
  geometry.userData.chieftain10BowLight = name;
  P.addEquipment(bucket, geometry);
}

function rod(P: TankBuilderPort, a: Point, b: Point, radius = .0095): void {
  const from = new THREE.Vector3(...a), to = new THREE.Vector3(...b), direction = to.clone().sub(from);
  const g = new THREE.CylinderGeometry(radius, radius, direction.length() + .0003, 4)
    .applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize()))
    .translate(...from.add(to).multiplyScalar(.5).toArray());
  add(P, 'hullDetail', g, 'guardRod');
}

function lamp(P: TankBuilderPort, side: number, centerX: number): void {
  const x = side * centerX, y = 1.3673203;
  // The sixteen-sided crown has flat cardinal faces; its rounded rear stock
  // expands over four independent longitudinal stations, not a full cylinder.
  const stations = [[3.3019278, .0060], [3.31, .035364], [3.32, .052594],
    [3.33, .060936], [3.3368578, .0658301], [3.4034879, .0658301]];
  const g = sectionSolid(stations.map(([z, height]) => ({ z,
    ring: Array.from({ length: 4 }, (_, quadrant) => {
      const a = quadrant * Math.PI / 2, scale = height / .0658301;
      return [[.065945, .01774], [.054415, .04045], [.041555, .05345], [.017875, .0658301]]
        .map(([u, v]): [number, number] => [x + (u * Math.cos(a) - v * Math.sin(a)) * scale,
          y + (u * Math.sin(a) + v * Math.cos(a)) * scale]);
    }).flat(),
  })));
  add(P, 'hullDetail', g, 'lampStock');
  // The source front plane is opaque; a separately colored closed face is
  // not falsely represented as an empty optical aperture.
  const front = new THREE.CylinderGeometry(.0618, .0618, .001, 24)
    .rotateX(Math.PI / 2).translate(x, y, 3.4029879);
  add(P, 'hullGlass', front, 'lampFace');
  add(P, 'hullDetail', box(.024, .0098, .039).translate(x, 1.2431, 3.3583), 'lampFoot');
  add(P, 'hullDetail', box(.0274, .071, .026).translate(x, 1.2775, 3.357), 'lampUpright');
}

function guard(P: TankBuilderPort, side: number): void {
  const p = (x: number, y: number, z = 3.419835): Point => [side * x, y, z];
  const front = [p(.491, 1.240), p(.491, 1.419), p(.495, 1.432), p(.51802, 1.44170),
    p(.82776, 1.44170), p(.8507, 1.432), p(.8547, 1.419), p(.867, 1.190)];
  for (let i = 1; i < front.length; i++) rod(P, front[i - 1], front[i]);
  rod(P, p(.51908, 1.27406), p(.67289, 1.27406));
  rod(P, p(.67289, 1.205), p(.67289, 1.44170));
  // Raised center brace bends back to the source bow plate while leaving
  // both lamp approach windows and the under-brace volume open.
  const brace = [p(.67286, 1.229, 3.1462), p(.67286, 1.3480, 3.16),
    p(.67286, 1.3866, 3.20), p(.67286, 1.4136, 3.24),
    p(.67286, 1.4342, 3.28), p(.67286, 1.4392, 3.36), p(.67286, 1.4417)];
  for (let i = 1; i < brace.length; i++) rod(P, brace[i - 1], brace[i]);
}

export function addChieftain10XBowLights(P: TankBuilderPort): void {
  for (const side of [-1, 1]) {
    lamp(P, side, .584961);
    lamp(P, side, .760321);
    guard(P, side);
  }
}
