import * as THREE from 'three';
import { KIT } from './kit.ts';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

// Independent source scalar datums: two shallow elliptic bearing plates,
// the central collar, and a raised partial rear-left rim. This is an original
// analytic solid construction, not the reference's mesh or contour buffers.
const YAW = [.008, 1.532, .359] as const;

function plate(P: TankBuilderPort, x: number, y: number, z: number,
  radiusX: number, radiusZ: number, height: number): void {
  P.addEquipment('turretDetail', KIT.cylY(radiusX, radiusX, height, 48)
    .scale(1, 1, radiusZ / radiusX), x-YAW[0], y-YAW[1], z-YAW[2]);
}

function partialRim(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  const cx = .55390, cz = -.97617;
  for (let i = 0; i <= 12; i++) {
    const angle = (-90 - i * 58 / 12) * Math.PI / 180;
    const x = cx + Math.sin(angle) * .30247;
    const z = cz + Math.cos(angle) * .31930;
    if (i === 0) shape.moveTo(x, z); else shape.lineTo(x, z);
  }
  for (let i = 0; i <= 14; i++) {
    const angle = (-162 + i * 72 / 14) * Math.PI / 180;
    shape.lineTo(cx + Math.sin(angle) * .21776, cz + Math.cos(angle) * .23400);
  }
  shape.closePath();
  return new THREE.ExtrudeGeometry(shape, {depth: .06630, bevelEnabled: false})
    .rotateX(Math.PI / 2).translate(0, 2.479199, 0);
}

export function addT90SMRwsBase(P: TankBuilderPort): void {
  plate(P, .553775, 2.39197, -.975905, .288885, .310215, .02493);
  plate(P, .5539006, 2.4084184, -.9761689, .3088384, .3320549, .0099751);
  plate(P, .55292, 2.42063, -.97564, .21483, .23049, .01446);
  P.addEquipment('turretDetail', partialRim(), -YAW[0], -YAW[1], -YAW[2]);
}
