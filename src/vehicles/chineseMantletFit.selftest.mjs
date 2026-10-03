import assert from 'node:assert/strict';
import {Vector3,Mesh,MeshBasicMaterial,DoubleSide,Raycaster} from 'three';
import {createTank} from './tankFactory.ts';
import {getSpec} from './specs.ts';
const mat=new MeshBasicMaterial({side:DoubleSide}),ray=new Raycaster();
for(const id of ['vt4a1','ztz99a2','ztz99a2_prototype'])for(const quality of ['high','low']){
 const t=createTank(id,null,{quality,proceduralOnly:true,geometryReceipt:true}),spec=getSpec(id);
 try{
  const gun=t.root.getObjectByName('rig_gun'),turret=t.root.getObjectByName('rig_turret');
  const fixed=new Mesh(t.root.getObjectByName('turret').geometry,mat),moving=new Mesh(t.root.getObjectByName('gunMount').geometry,mat);
  fixed.updateMatrixWorld(true);moving.updateMatrixWorld(true);
  // Real unfilled slot, rather than a narrow sleeve poking through a roof.
  for(const x of [-.30,0,.30])for(const y of [gun.position.y-.15,gun.position.y,gun.position.y+.15]){
   ray.set(new Vector3(x,y,4),new Vector3(0,0,-1));ray.near=0;ray.far=8;
   const h=ray.intersectObject(fixed)[0];
   assert(!h||h.point.z<=gun.position.z-.58+1e-5,`${id}: open central pitch channel`);
  }
  for(const pitch of [-spec.gunElevationDeg,0,spec.gunDepressionDeg]){
   gun.rotation.x=pitch*Math.PI/180;gun.updateMatrix();
   const p=moving.geometry.attributes.position,point=new Vector3();
   for(let i=0;i<p.count;i++){
    point.fromBufferAttribute(p,i).applyMatrix4(gun.matrix);
    if(Math.abs(point.x)>.37701)continue; // bearing axle intentionally enters the cheeks
    assert(point.z>gun.position.z-.58+.002,`${id}: moving cover clears the rear receiver at ${pitch} degrees`);
   }
   for(const yaw of [-Math.PI/2,0,Math.PI/2]){
    turret.rotation.y=yaw;t.root.updateMatrixWorld(true);
    assert(t.gunMuzzleWorld(new Vector3()).toArray().every(Number.isFinite));
   }
  }
  // The designed 23 mm seam is narrow on both sides at the trunnion station.
  for(const side of [-1,1]){
   ray.set(new Vector3(0,gun.position.y-.1,gun.position.z+.1),new Vector3(side,0,0));ray.far=2;
   const wall=ray.intersectObject(fixed)[0];assert(wall,`${id}: receiver wall exists`);
   ray.set(new Vector3(0,-.1,.1),new Vector3(side,0,0));
   const cover=ray.intersectObject(moving)[0];assert(cover,`${id}: continuous elevating shield`);
   const seam=Math.abs(wall.point.x)-Math.abs(cover.point.x);
   assert(seam>.001&&seam<.026,`${id}: shield/receiver seam ${seam}`);
  }
 }finally{t.dispose();}
}
mat.dispose();console.log('Chinese gun stations: high/low actual receiver air, articulated cover/rear clearance and close side seams PASS');
