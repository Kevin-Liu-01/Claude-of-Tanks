// Continuous finite traverse stock for a mechanically limited casemate gun.
// Normal rotating turrets retain the native audit's full yaw annulus.
import {Matrix4,Vector3} from 'three';
import {casemateGunYawLimit} from '../src/vehicles/casemateGunPose.ts';
export {casemateGunYawLimit};
const STEP=4*Math.PI/180;
export function limitedGunYawStock(row,pivot,halfArc){
 if(!Number.isFinite(halfArc)||halfArc<0)throw new Error('Limited gun stock needs a finite nonnegative arc');
 const local=row.bounds.clone().translate(new Vector3(-pivot.x,-pivot.y,-pivot.z));
 const radius=Math.hypot(Math.max(Math.abs(local.min.x),Math.abs(local.max.x)),Math.max(Math.abs(local.min.z),Math.abs(local.max.z)));
 const steps=Math.max(1,Math.ceil(halfArc*2/STEP)),delta=halfArc*2/steps,result=[];
 for(let i=0;i<steps;i++){
  const a=-halfArc+i*delta,b=a+delta;
  const bounds=local.clone().applyMatrix4(new Matrix4().makeRotationY(a))
   .union(local.clone().applyMatrix4(new Matrix4().makeRotationY(b)));
  // Any intermediate corner lies within the endpoint chord plus this exact
  // sagitta bound. Preserve open rear air instead of treating a 12° bearing
  // as a 360° turret; no gun stock, pitch or recoil is omitted.
  bounds.expandByScalar(radius*(1-Math.cos(delta/2))+.00001).translate(pivot);
  result.push({name:row.name,owner:row.owner,bounds,solidBox:true,kind:'limited main-gun yaw sweep'});
 }
 return result;
}
