// Namer-specific source-world authoring frame. These are measured scalar datums,
// not an imported mesh or a change to the existing running-gear rig.
import * as THREE from 'three';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

export function namerHullPart(P: TankBuilderPort, slot: string, geometry: THREE.BufferGeometry,
  x=0, y=0, z=0, rx=0, ry=0, rz=0): void {
  geometry.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx,ry,rz)));
  geometry.translate(x,y,z).scale(1/.95,1/1.012,1/.976);
  if(slot==='hull')P.add(slot,geometry);
  else P.addEquipment(slot,geometry);
}

export function namerTurretPart(P: TankBuilderPort, slot: string, geometry: THREE.BufferGeometry,
  x=0, y=0, z=0, rx=0, ry=0, rz=0): void {
  if(slot==='turret')P.add(slot,geometry,x,y-2.1,z+1.15,rx,ry,rz);
  else P.addEquipment(slot,geometry,x,y-2.1,z+1.15,rx,ry,rz);
}

export function namerMudguard(P: TankBuilderPort, label: string, geometry: THREE.BufferGeometry,
  x: number, y: number, z: number): void {
  geometry.translate(x,y,z).scale(1/.95,1/1.012,1/.976);
  P.addMudguard(label,'hullRubber',geometry);
}
