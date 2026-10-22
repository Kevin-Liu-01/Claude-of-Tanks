import * as THREE from 'three';
type AuxiliaryStockPort = {
  forEachBucketPart(names: string[], visitor: (geometry: THREE.BufferGeometry) => void): void;
};

type Point=readonly [number,number,number];
/** `recoilM` (release 230, the MBT-70's gun housing): the gun recoils that far along its bore in its own
 * `auxiliaryWeaponRecoil` group under the pitch group (stage 'recoil'), while the pitch stage (a housing or cradle) only
 * elevates; without it the whole pitch group recoils (fx/auxiliaryPresentation.ts). */
export interface StationDatum {name:string;caliberMm:number;yaw:Point;pivot:Point;muzzle:Point;recoilM?:number}
const BUCKETS=['turret','turretEquipment','turretDetail','turretDark','turretGlass','turretGunmetal','turretTrack'];
/** Capture only explicitly authored station stock. The factory still performs
 * its normal material, UV, damage and receipt work before mounting that stock. */
export function beginAuxiliaryStation(P:AuxiliaryStockPort & {turretG: THREE.Group}, datum:StationDatum) {
  const root=new THREE.Group(), weapon=new THREE.Group();
  root.name=datum.name;root.position.fromArray(datum.yaw);weapon.name='auxiliaryWeaponPitch';
  weapon.position.fromArray(datum.pivot).sub(root.position);root.add(weapon);P.turretG.add(root);
  if(datum.recoilM!==undefined){const recoil=new THREE.Group();recoil.name='auxiliaryWeaponRecoil';weapon.add(recoil);
    root.userData.auxiliaryRecoilM=datum.recoilM;}
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
  }, mark(stage:'yaw'|'pitch'|'recoil'){
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

/**
 * VH.14 (coordinator ruling 2026-10-14: roof weapons match the real vehicle and every drawn gun works): an exact gun
 * already built and mounted as one group (its trunnion at `pivot`, gun-local, by default its origin, and its barrel
 * along its +Z) becomes a working station in place. A yaw root takes the group's mount transform under the same parent,
 * the gun pitches about the trunnion, and the root publishes the pivot and muzzle the inventory reads. Nothing moves at
 * rest. Returns the station root (the weapon-station mount; the gun stays the exact weapon fitting).
 */
export function stationFromGun(gun: THREE.Object3D, datum: { name: string; caliberMm: number; muzzle: Point; pivot?: Point;
  level?: boolean }): THREE.Group {
  const parent = gun.parent;
  if (!parent) throw new Error(`${datum.name}: mount the gun before making it a station`);
  const pivot = new THREE.Vector3(...(datum.pivot ?? [0, 0, 0]));
  const root = new THREE.Group(), weapon = new THREE.Group();
  root.name = datum.name; weapon.name = 'auxiliaryWeaponPitch';
  gun.updateMatrix();
  root.position.copy(pivot).applyMatrix4(gun.matrix);
  root.quaternion.copy(gun.quaternion);
  if (datum.level) {
    // a gun drawn elevated (or canted) at rest turns about the vertical and rests level along its own bearing, so the
    // drawn barrel and the station's level rest (pitch 0, the presentation's rest) agree
    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(gun.quaternion);
    root.quaternion.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(forward.x, forward.z));
  }
  root.scale.copy(gun.scale);
  parent.add(root); root.add(weapon);
  gun.removeFromParent();
  gun.position.copy(pivot).negate(); gun.quaternion.identity(); gun.scale.set(1, 1, 1);
  weapon.add(gun);
  const muzzle = new THREE.Vector3(...datum.muzzle).sub(pivot);
  Object.assign(root.userData, { remoteControlled: true, crewServed: true, firingAxis: '+Z', caliberMm: datum.caliberMm,
    auxiliaryPivot: [0, 0, 0], auxiliaryMuzzle: muzzle.toArray(), muzzleLocalZ: muzzle.z, barrelAxisLocalY: muzzle.y,
    fittingRoot: true, fitting: 'weaponStationMount', fittingExact: true, surfaceMarkupSelectable: true });
  return root;
}

/**
 * VH.14: stationFromGun for an exact gun whose datum is read off its drawn solids, in its own frame (barrel along +Z):
 * the muzzle is the centre of the foremost face, the trunnion stands on that bore line 30 % of the gun's length from its
 * back (the receiver). A gun drawn elevated at rest is levelled about the trunnion (stationFromGun's `level`).
 */
export function stationFromDrawnGun(gun: THREE.Object3D, station: { name: string; caliberMm: number }): THREE.Group {
  gun.updateMatrixWorld(true);
  const toGun = new THREE.Matrix4().copy(gun.matrixWorld).invert(), m = new THREE.Matrix4(), v = new THREE.Vector3();
  const points: THREE.Vector3[] = [];
  gun.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry?.getAttribute('position')) return;
    m.multiplyMatrices(toGun, mesh.matrixWorld);
    const pos = mesh.geometry.getAttribute('position');
    for (let i = 0; i < pos.count; i++) points.push(v.fromBufferAttribute(pos, i).applyMatrix4(m).clone());
  });
  if (!points.length) throw new Error(`${station.name}: the gun has no drawn solids`);
  const box = new THREE.Box3().setFromPoints(points);
  const front = points.filter((p) => p.z >= box.max.z - .005);
  const x = front.reduce((a, p) => a + p.x, 0) / front.length, y = front.reduce((a, p) => a + p.y, 0) / front.length;
  const trunnionZ = box.min.z + (box.max.z - box.min.z) * .3;
  return stationFromGun(gun, { ...station, pivot: [x, y, trunnionZ], muzzle: [x, y, box.max.z], level: true });
}
