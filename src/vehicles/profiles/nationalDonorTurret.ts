// Owner 2026-10-15 (VEH-19..VEH-22): a national concept's turret is the donor
// fleet turret itself, emitted by that turret's own builder in its own turret
// frame, then carried on this vehicle's hull ring. National up-armour packages
// are fitted on top by the country kits; the donor's commander gun is omitted
// wherever the concept's own remote station replaces it.
import * as THREE from 'three';
import {buildT72B3XTurret} from './t72b3X.ts';
import {buildT72B3MXTurret} from './t72b3mX.ts';
import {buildZTZ99A2ProductionTurret} from './china.ts';
import {buildType96Turret} from './type96bX.ts';
import {preserveSourceStudyGunMountAppearance} from './sourceStudyGunMount.ts';
import {EASTERN_SOURCE_STUDIES} from '../easternSourceStudyData.ts';
import {NATIONAL_DONOR_TURRETS,type NationalDonorTurret} from '../nationalDonorTurrets.ts';
import type {TankBuilderPort} from '../tankFactoryCore.ts';

export function nationalDonorTurret(id:string):NationalDonorTurret|undefined {
  return NATIONAL_DONOR_TURRETS[id];
}

/** Emit the donor turret (shell, armour, roof fittings, mantlet and main gun) and
 * place it on this hull's ring. Everything the donor builder authored stays in
 * its turret frame, so the national kit seats against the real donor surfaces. */
export function buildNationalDonorTurret(P:TankBuilderPort,id:string):NationalDonorTurret {
  const d=NATIONAL_DONOR_TURRETS[id];
  if(!d)throw new Error(`${id}: no national donor turret`);
  if(d.donor==='type96b'){
    // The Type 96B builder reads its own frame from P.turretG while it authors.
    const frame=EASTERN_SOURCE_STUDIES.type96b.frame;
    P.turretG.position.set(...frame.turret);
    P.gunG.position.set(0,frame.gun[1]-frame.turret[1],frame.gun[2]-frame.turret[2]);
    buildType96Turret(P);
    preserveSourceStudyGunMountAppearance(P);
  }else if(d.donor==='ztz99a2')buildZTZ99A2ProductionTurret(P,{roofGun:false,decals:false,...d.builderOptions});
  // The concept's station on the commander's cupola sweeps the donor's rear roof masts/whips: each kit fits its own
  // aerials outside that sweep.
  else if(d.donor==='t72b3m_2016')buildT72B3MXTurret(P,{commanderGun:false,antennaMasts:false,...d.builderOptions});
  else buildT72B3XTurret(P,{commanderGun:false,antennae:false,...d.builderOptions});
  P.turretG.position.set(...d.pivot);
  P.topY=d.roofY;
  P.turretG.userData.nationalDonorTurret={donor:d.donor,pivot:[...d.pivot],station:[...d.station]};
  return d;
}

/** Height of the highest permanent turret surface under a plan point: the
 * shell, its cupolas and hatches and fixed fittings, never removable ERA. */
export function donorTurretSeatY(P:TankBuilderPort,x:number,z:number,radius=0):number {
  const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide}),meshes:THREE.Mesh[]=[];
  P.forEachBucketPart(['turret','turretCupola','turretHatch','turretDetail','turretEquipment','turretExternalArmor'],g=>{
    if(Object.hasOwn(g.userData,'eraHitFaceVertexStarts'))return;
    const mesh=new THREE.Mesh(g,material);mesh.updateMatrixWorld(true);meshes.push(mesh);
  });
  const ray=new THREE.Raycaster(new THREE.Vector3(),new THREE.Vector3(0,-1,0),0,8);
  let y=-Infinity;
  const probes:[number,number][]=[[0,0]];
  if(radius>0)for(let i=0;i<8;i++){const a=i*Math.PI/4;probes.push([Math.cos(a)*radius,Math.sin(a)*radius]);}
  for(const [dx,dz]of probes){
    ray.ray.origin.set(x+dx,4,z+dz);
    const hit=ray.intersectObjects(meshes,false)[0];if(hit)y=Math.max(y,hit.point.y);
  }
  material.dispose();
  if(!Number.isFinite(y))throw new Error(`${P.spec.id}: no donor turret seat at ${x},${z}`);
  return y;
}
