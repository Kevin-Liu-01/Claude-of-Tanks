// 2026-10-30 (lane t90-family-266; Main's ruling A, the critics' "rear hooks"): the T-90, T-90MS and T-90SM source
// builds carried their four rear drum cradles empty, and the bare U-webs read as hooks or tusks off the stern. Two
// 200 L drums (585 mm across, 880 mm long) now ride each pair of cradles, as on the service tanks.
import * as THREE from 'three';
import {KIT} from './kit.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';

const DRUM_R=.2925,DRUM_LEN=.88;

/** The hull's rear face ahead of (x, y, z): the first hull stock a ray toward +Z meets. */
function hullFaceZ(P:TankBuilderPort,x:number,y:number,z:number):number{
  const mat=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
  const ray=new THREE.Raycaster(new THREE.Vector3(x,y,z),new THREE.Vector3(0,0,1),0,1.5);
  let face=Infinity;
  P.forEachBucketPart(['hull'],g=>{const h=ray.intersectObject(new THREE.Mesh(g,mat))[0];if(h)face=Math.min(face,h.point.z);});
  mat.dispose();
  if(!Number.isFinite(face))throw new Error(`${P.spec.id}: no hull face ahead of the drum cradle at ${x},${y},${z}`);
  return face;
}

/** Two transverse drums, each centred on a pair of cradles, resting in the cradle bowl at (y, z). */
export function addT90CradleDrums(P:TankBuilderPort,y:number,z:number,pairs:readonly(readonly[number,number])[]):void{
  const {box,cylX,cylY}=KIT;
  for(const [a,b]of pairs){
    const x=(a+b)/2;
    P.addEquipment('hullDetail',cylX(DRUM_R,DRUM_LEN,32),x,y,z);
    // rolling hoops and the rolled end rims stand proud of the shell
    for(const dx of [-.29,.29])P.addEquipment('hullDetail',cylX(DRUM_R+.009,.026,32),x+dx,y,z);
    for(const dx of [-DRUM_LEN/2+.012,DRUM_LEN/2-.012])P.addEquipment('hullDetail',cylX(DRUM_R+.006,.022,32),x+dx,y,z);
    // a strap over each cradle holds the drum down; the filler bung sits on the outboard end
    for(const cx of [a,b])P.addEquipment('hullDark',cylX(DRUM_R+.014,.032,32),cx,y,z);
    P.addEquipment('hullDark',cylX(.032,.022,12),x+Math.sign(x)*(DRUM_LEN/2+.009),y+.16,z);
    // 2026-10-31 (tank-standard-check §B2): the cradle pair's mounting plate, bolted to the hull's rear face and running
    // under the drum's front half, closes the plan gap the two cradle webs and the hull enclosed ahead of the drum
    const low=y-DRUM_R+.004,front=hullFaceZ(P,x,low,z)+.012,back=z+DRUM_R*.45;
    P.addEquipment('hullDark',box(b-a+.04,.012,front-back),x,low-.006,(front+back)/2);
    for(const cx of [a+.06,b-.06])P.addEquipment('hullDark',cylY(.012,.012,.012,8),cx,low+.002,front-.04); // bolts
  }
}
