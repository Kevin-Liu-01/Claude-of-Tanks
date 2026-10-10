// Finite native main-weapon sweep. Axial stock cells enclose actual rendered
// triangles; interval chord padding covers every pitch between sample poses.
import {Box3,Euler,Matrix4,Vector3} from 'three';
const STEP=.15,ANGLE=4*Math.PI/180;
function partCells(mesh,gun,instance=null){
 const matrix=new Matrix4().copy(gun.matrixWorld).invert().multiply(mesh.matrixWorld),cells=new Map();
 if(instance!==null){const transform=new Matrix4();mesh.getMatrixAt(instance,transform);matrix.multiply(transform);}
 const p=mesh.geometry.attributes.position,index=mesh.geometry.index;
 for(let i=0;i<(index?.count??p.count);i+=3){
  const points=[0,1,2].map(k=>new Vector3().fromBufferAttribute(p,index?index.getX(i+k):i+k).applyMatrix4(matrix));
  const box=new Box3().setFromPoints(points);
  for(let z=Math.floor(box.min.z/STEP);z<=Math.floor(box.max.z/STEP);z++){
   const slice=box.clone();slice.min.z=Math.max(slice.min.z,z*STEP);slice.max.z=Math.min(slice.max.z,(z+1)*STEP);
   if(cells.has(z))cells.get(z).union(slice);else cells.set(z,slice);
  }
 }
 return [...cells.values()];
}
function ancestors(mesh,gun){let recoil=false;for(let p=mesh;p;p=p.parent){if(!p.visible)return null;if(/^rig_recoil$|^rig_barrel_/.test(p.name))recoil=true;if(p===gun)break;}return {recoil};}
function pitched(box,pitch,gun){const m=new Matrix4().makeRotationFromEuler(new Euler(-pitch,gun.rotation.y,gun.rotation.z,gun.rotation.order));return box.clone().applyMatrix4(m);}
export function collectMainGunSweep(tank,spec,inverse,visibleStock){
 const gun=tank.root.getObjectByName('rig_gun');if(!gun)return [];
 // These formulas are the actual normal/rapid recuperator limits in the rig.
 const caliber=spec.gun?.caliberMm??100,stroke=Math.max(Math.min(.24,Math.max(.06,.13*caliber/120)),Math.min(.085,Math.max(.055,caliber*.0022)));
 // syncFromState's two-plane stabilizer re-expresses the commanded bore in
 // the rocked chassis. Its atan2 elevation is bounded by ±90°, even when
 // suspension or an impact takes the visible receiver beyond the authored
 // command limit. Cover that entire finite range, plus the cradle kick;
 // do not constrain player aiming or assume a friendly stationary hull.
 const low=Math.min(-Math.PI/2,-(spec.gunDepressionDeg??0)*Math.PI/180);
 const high=Math.max(Math.PI/2,(spec.gunElevationDeg??0)*Math.PI/180)+.014;
 const steps=Math.max(1,Math.ceil((high-low)/ANGLE)),delta=(high-low)/steps;
 const base=new Matrix4().copy(inverse).multiply(gun.parent.matrixWorld).multiply(new Matrix4().makeTranslation(...gun.position.toArray()));
 const result=[];let owner='hull';for(let p=gun;p;p=p.parent)if(p.name==='rig_turret')owner='turret';
 gun.traverse(mesh=>{
  if(!visibleStock(mesh,tank.root)||!mesh.geometry?.attributes.position)return;
  const state=ancestors(mesh,gun);if(!state)return;
  for(let instance=0;instance<(mesh.isInstancedMesh?mesh.count:1);instance++)for(const cell of partCells(mesh,gun,mesh.isInstancedMesh?instance:null)){
   // Every intermediate linear recoil lies inside this finite swept stock.
   if(state.recoil)cell.min.z-=stroke;
   cell.applyMatrix4(new Matrix4().makeScale(...gun.scale.toArray()));
   const radius=Math.hypot(...['x','y','z'].map(axis=>Math.max(Math.abs(cell.min[axis]),Math.abs(cell.max[axis]))));
   // The rare twin barrel receiver rolls at most .02 rad during recoil.
   if(state.recoil&&spec.gun?.muzzles?.length>1)cell.expandByScalar(radius*Math.sin(.02));
   for(let i=0;i<steps;i++){
    const bounds=pitched(cell,low+i*delta,gun).union(pitched(cell,low+(i+1)*delta,gun));
    bounds.expandByScalar(radius*(1-Math.cos(delta/2))+.00001).applyMatrix4(base);
    result.push({name:mesh.name,owner,bounds,solidBox:true,kind:'main-gun pitch/recoil sweep'});
   }
  }
 });
 return result;
}
