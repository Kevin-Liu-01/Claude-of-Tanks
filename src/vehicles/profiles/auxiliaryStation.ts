import * as THREE from 'three';
import type { TankBuilderPort } from '../tankFactoryCore.ts';

type Point=readonly [number,number,number];
export interface StationDatum {name:string;caliberMm:number;yaw:Point;pivot:Point;muzzle:Point}
const BUCKETS=['turret','turretEquipment','turretDetail','turretDark','turretGlass','turretGunmetal','turretTrack'];
/** Capture only explicitly authored station stock. The factory still performs
 * its normal material, UV, damage and receipt work before mounting that stock. */
export function beginAuxiliaryStation(P:Pick<TankBuilderPort,'turretG'|'forEachBucketPart'>, datum:StationDatum) {
  const root=new THREE.Group(), weapon=new THREE.Group();
  root.name=datum.name;root.position.fromArray(datum.yaw);weapon.name='auxiliaryWeaponPitch';
  weapon.position.fromArray(datum.pivot).sub(root.position);root.add(weapon);P.turretG.add(root);
  const muzzle=new THREE.Vector3(...datum.muzzle).sub(root.position);
  Object.assign(root.userData,{remoteControlled:true,firingAxis:'+Z',caliberMm:datum.caliberMm,
    auxiliaryPivot:weapon.position.toArray(),auxiliaryMuzzle:muzzle.toArray(),muzzleLocalZ:muzzle.z,
    barrelAxisLocalY:muzzle.y,fittingRoot:true,fitting:'pintleMG',fittingExact:true});
  const seen=new Set<THREE.BufferGeometry>();
  P.forEachBucketPart(BUCKETS,part=>seen.add(part));
  return {root,weapon, attachPitch(stock:THREE.Object3D){
    stock.position.set(-datum.pivot[0],-datum.pivot[1],-datum.pivot[2]);weapon.add(stock);
  }, mark(stage:'yaw'|'pitch'){
    P.forEachBucketPart(BUCKETS,part=>{
      if(seen.has(part))return;seen.add(part);
      part.userData.auxiliaryStation={name:root.name,stage};
    });
  }};
}
