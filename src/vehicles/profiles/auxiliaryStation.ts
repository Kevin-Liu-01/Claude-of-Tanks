import * as THREE from 'three';
type AuxiliaryStockPort = {
  forEachBucketPart(names: string[], visitor: (geometry: THREE.BufferGeometry) => void): void;
};

type Point=readonly [number,number,number];
export interface StationDatum {name:string;caliberMm:number;yaw:Point;pivot:Point;muzzle:Point}
const BUCKETS=['turret','turretEquipment','turretDetail','turretDark','turretGlass','turretGunmetal','turretTrack'];
/** Capture only explicitly authored station stock. The factory still performs
 * its normal material, UV, damage and receipt work before mounting that stock. */
export function beginAuxiliaryStation(P:AuxiliaryStockPort & {turretG: THREE.Group}, datum:StationDatum) {
  const root=new THREE.Group(), weapon=new THREE.Group();
  root.name=datum.name;root.position.fromArray(datum.yaw);weapon.name='auxiliaryWeaponPitch';
  weapon.position.fromArray(datum.pivot).sub(root.position);root.add(weapon);P.turretG.add(root);
  const muzzle=new THREE.Vector3(...datum.muzzle).sub(root.position);
  Object.assign(root.userData,{remoteControlled:true,firingAxis:'+Z',caliberMm:datum.caliberMm,
    auxiliaryPivot:weapon.position.toArray(),auxiliaryMuzzle:muzzle.toArray(),muzzleLocalZ:muzzle.z,
    barrelAxisLocalY:muzzle.y,fittingRoot:true,fitting:'pintleMG',fittingExact:true,
    surfaceMarkupSelectable:true});
  const seen=new Set<THREE.BufferGeometry>();
  P.forEachBucketPart(BUCKETS,part=>seen.add(part));
  return {root,weapon, attachPitch(stock:THREE.Object3D){
    stock.position.set(-datum.pivot[0],-datum.pivot[1],-datum.pivot[2]);weapon.add(stock);
    // One physical gun is one weapon fitting. When the pitching stock is
    // already an exact gun fitting (sourceMachineGun without a datum), this
    // root is that gun's mount; marking both double-counted the weapon.
    let exactGun=false;
    stock.traverse(o=>{if(o.userData.fittingRoot&&o.userData.fittingExact&&o.userData.fitting==='pintleMG')exactGun=true;});
    if(exactGun)root.userData.fitting='weaponStationMount';
  }, mark(stage:'yaw'|'pitch'){
    P.forEachBucketPart(BUCKETS,part=>{
      if(seen.has(part))return;seen.add(part);
      part.userData.auxiliaryStation={name:root.name,stage};
    });
  }};
}

/** Mark a bounded authoring scope for an existing fitting's yaw owner. */
export function captureAuxiliaryStock(P:AuxiliaryStockPort,
  name:string, stage:'yaw'|'pitch'='yaw'):()=>void {
  const seen=new Set<THREE.BufferGeometry>();
  P.forEachBucketPart(BUCKETS,part=>seen.add(part));
  return ()=>P.forEachBucketPart(BUCKETS,part=>{
    if(!seen.has(part))part.userData.auxiliaryStation={name,stage};
  });
}
