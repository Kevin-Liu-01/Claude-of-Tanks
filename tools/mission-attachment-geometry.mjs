import crypto from 'node:crypto';
import {collectMainGunSweep} from './mission-attachment-gun-sweep.mjs';
import {casemateGunYawLimit,limitedGunYawStock} from './mission-attachment-yaw-sweep.mjs';
import {MISSION_RECEIVER_SEATS} from '../src/vehicles/missionAttachmentReceiver.ts';
import {AERIAL_RULES} from '../src/sim/matchRuleset.ts';
import {Box3,Vector3,Matrix4,Triangle,Ray} from 'three';
import {missionAirframeVolumes,missionCradleVolumes} from '../src/sim/missionAttachment.ts';
const CELL=.25;
const vector=new Vector3(),ray=new Ray(new Vector3(),new Vector3(0,1,0)),intersection=new Vector3();
// Kunlun's permanent welded flank housing is structural steel, authored by
// nationalChina.ts::turretWrap(model=1). Only its bare left top is a support:
// nearby smoke launchers, service crates and replaceable ERA remain obstacles.
const KUNLUN_WELDED_SUPPORT={minX:-1.59,maxX:-1.18,minZ:-.75,maxZ:-.15,minY:.69,maxY:.75};
// These finite atlas patches are permanent welded housing roofs. Separate
// removable ERA, crates, cloth and lamps continue to collide with the dock.
const WELDED_SUPPORT_PATCHES={
 cn_t72b3m_modern:{region:KUNLUN_WELDED_SUPPORT,plane:()=>.72,tolerance:.03},
 pl_t72b3m_modern:{region:{minX:-1.69,maxX:-1.28,minZ:-.22,maxZ:.28},plane:()=>.740,tolerance:.000002},
 ru_t80u_modern:{region:{minX:-1.22,maxX:-1.09,minZ:-.86,maxZ:-.54},plane:p=>.71-(.01/1.05)*(p.z+1.02),tolerance:.000002},
 ru_t72b3m_modern:{region:{minX:-1.615,maxX:-1.28,minZ:.28,maxZ:.62},plane:p=>.77-(.07/.74)*(p.z-.14),tolerance:.000002},
 ru_t72b3_modern:{region:{minX:-1.22,maxX:-1.085,minZ:-.77,maxZ:-.44},plane:p=>.67-(.02/.98)*(p.z+.79),tolerance:.000002},
};
function weldedSupportRegion(output,mesh,tri){
 if(output.frame!=='turret'||tri.getNormal(vector).y<.9)return null;
 const receiver=MISSION_RECEIVER_SEATS[output.specId];
 if(receiver&&mesh.name==='turretMissionReceiver'&&[tri.a,tri.b,tri.c].every(p=>Math.abs(p.y-receiver.topY)<.000002))return receiver;
 if(mesh.name!=='turretExternalArmor')return null;
 const patch=WELDED_SUPPORT_PATCHES[output.specId];if(!patch)return null;
 if([tri.a,tri.b,tri.c].every(p=>Math.abs(p.y-patch.plane(p))<=patch.tolerance))return patch.region;
 return null;
}
function withinSupportRegion(region,x,z,padding=0){return !region||(x-padding>=region.minX&&x+padding<=region.maxX&&z-padding>=region.minZ&&z+padding<=region.maxZ);}
/** Dock centres for a hull's authored turret supports: a receiver's own centre, then every `step` centre that can put
 * a foot column or row on its welded patch. Both are narrow (a patch leaves a 2-4 cm window for a padded foot), so the
 * seat generator's .06 m native grid can step over them; 2026-10-08 it found no seat on either Russian patch hull. */
export function authoredSupportCandidates(specId,{footX,footZ},step=.01){
 const result=[],receiver=MISSION_RECEIVER_SEATS[specId],patch=WELDED_SUPPORT_PATCHES[specId];
 if(receiver)result.push({frame:'turret',x:receiver.x,y:receiver.topY+.045,z:receiver.z});
 if(patch){
  const r=patch.region;
  for(let z=r.minZ-footZ;z<=r.maxZ+footZ+1e-9;z+=step)for(let x=r.minX-footX;x<=r.maxX+footX+1e-9;x+=step){
   result.push({frame:'turret',x:+x.toFixed(4),y:patch.plane({x,y:0,z})+.045,z:+z.toFixed(4)});
  }
 }
 return result;
}
function visibleStock(mesh,root){
 if(!mesh.isMesh||/^procShadow|^contact|^shadow/i.test(mesh.name)||mesh.material?.colorWrite===false)return false;
 for(let p=mesh;p&&p!==root;p=p.parent){
  if(p.visible===false)return false;
  if(p.isLOD&&p.levels[0]?.object&&!p.levels[0].object.getObjectById(mesh.id))return false;
 }
 return true;
}
function ownerOf(mesh,root){for(let p=mesh;p&&p!==root;p=p.parent)if(p.name==='rig_turret')return 'turret';return 'hull';}
function radialRange(bounds,pivot){
 const x0=bounds.min.x-pivot.x,x1=bounds.max.x-pivot.x,z0=bounds.min.z-pivot.z,z1=bounds.max.z-pivot.z;
 return [Math.hypot(Math.max(x0,0,-x1),Math.max(z0,0,-z1)),Math.hypot(Math.max(Math.abs(x0),Math.abs(x1)),Math.max(Math.abs(z0),Math.abs(z1)))];
}
function addSweep(output,row){
 if(row.owner===output.frame)return;
 if(output.frame==='hull'&&row.owner==='turret'&&Number.isFinite(output.yawHalfArc)){
  for(const segment of limitedGunYawStock(row,output.pivot,output.yawHalfArc)){segment.id=output.nextId++;addToGrid(output.grid,segment);}
  return;
 }
 row.radial=radialRange(row.bounds,output.pivot);
 for(let y=Math.floor(row.bounds.min.y/CELL);y<=Math.floor(row.bounds.max.y/CELL);y++){
  let rows=output.sweeps.get(y);if(!rows){rows=[];output.sweeps.set(y,rows);}rows.push(row);
 }
}
function addToGrid(grid,record){
 const b=record.bounds;
 for(let x=Math.floor(b.min.x/CELL);x<=Math.floor(b.max.x/CELL);x++)for(let z=Math.floor(b.min.z/CELL);z<=Math.floor(b.max.z/CELL);z++){
  const key=x+','+z;let rows=grid.get(key);if(!rows){rows=[];grid.set(key,rows);}rows.push(record);
 }
}
function trianglesFor(mesh,transform,owner,output,minY){
 const p=mesh.geometry.attributes.position,index=mesh.geometry.index;
 for(let i=0;i<(index?.count??p.count);i+=3){
  const tri=new Triangle();
  tri.a.fromBufferAttribute(p,index?index.getX(i):i).applyMatrix4(transform);
  tri.b.fromBufferAttribute(p,index?index.getX(i+1):i+1).applyMatrix4(transform);
  tri.c.fromBufferAttribute(p,index?index.getX(i+2):i+2).applyMatrix4(transform);
  const bounds=new Box3().setFromPoints([tri.a,tri.b,tri.c]);
  const supportRegion=weldedSupportRegion(output,mesh,tri);
  const row={id:output.nextId++,tri,bounds,name:mesh.name,owner,supportRegion};
  if(mesh.name===output.frame||supportRegion){output.support.push(row);addToGrid(output.supportGrid,row);}
  if(bounds.max.y>=minY){addToGrid(output.grid,row);addSweep(output,row);}
 }
}
function collectMesh(mesh,inverse,output,minY,root){
 if(!visibleStock(mesh,root)||!mesh.geometry.attributes.position)return;
 const base=new Matrix4().multiplyMatrices(inverse,mesh.matrixWorld),owner=ownerOf(mesh,root);
 mesh.geometry.computeBoundingBox();
 for(let instance=0;instance<(mesh.isInstancedMesh?mesh.count:1);instance++){
  const transform=base.clone();
  if(mesh.isInstancedMesh){const local=new Matrix4();mesh.getMatrixAt(instance,local);transform.multiply(local);}
  const meshBox=mesh.geometry.boundingBox.clone().applyMatrix4(transform);
  const p=mesh.geometry.attributes.position;
  output.digest.update(mesh.name).update(new Uint8Array(p.array.buffer,p.array.byteOffset,p.array.byteLength)).update(JSON.stringify(transform.elements));
  if(mesh.geometry.index){const a=mesh.geometry.index.array;output.digest.update(new Uint8Array(a.buffer,a.byteOffset,a.byteLength));}
  if(output.fingerprintOnly)continue;
  if(meshBox.max.y<minY&&mesh.name!==output.frame)continue;
  trianglesFor(mesh,transform,owner,output,minY);
 }
}
/** Actual near-LOD render stock, including instances, in the canonical dock frame. */
export function collectMissionStock(tank,frame,minY=-Infinity,fingerprintOnly=false,spec=null){
 const owner=frame==='turret'?tank.root.getObjectByName('rig_turret'):tank.root;
 if(!owner)throw new Error('Missing '+frame+' frame');
 const inverse=new Matrix4().copy(owner.matrixWorld).scale(new Vector3(1/owner.scale.x,1/owner.scale.y,1/owner.scale.z)).invert();
 const turret=tank.root.getObjectByName('rig_turret');
 const pivot=turret?new Vector3().setFromMatrixPosition(turret.matrixWorld).applyMatrix4(inverse):new Vector3();
 const output={frame,specId:spec?.id,pivot,yawHalfArc:spec?casemateGunYawLimit(spec):Infinity,minY,fingerprintOnly,grid:new Map(),supportGrid:new Map(),sweeps:new Map(),support:[],nextId:0,digest:crypto.createHash('sha256')};
 tank.root.traverse(mesh=>collectMesh(mesh,inverse,output,minY,tank.root));
 if(spec&&!fingerprintOnly)for(const row of collectMainGunSweep(tank,spec,inverse,visibleStock)){row.id=output.nextId++;if(row.bounds.max.y>=minY){addToGrid(output.grid,row);addSweep(output,row);}}
 output.geometryHash=output.digest.digest('hex');delete output.digest;return output;
}
/** Full actual geometry/index/transforms fingerprint, without allocating triangles. */
export function missionStockFingerprint(tank,frame){return collectMissionStock(tank,frame,Infinity,true).geometryHash;}
export function nativeRoofHeight(stock,x,z){
 let high=-Infinity;ray.origin.set(x,30,z);ray.direction.set(0,-1,0);
 for(const r of stock.supportGrid.get(Math.floor(x/CELL)+','+Math.floor(z/CELL))??[]){
  const b=r.bounds;if(x<b.min.x||x>b.max.x||z<b.min.z||z>b.max.z)continue;
  if(!withinSupportRegion(r.supportRegion,x,z,.05))continue;
  if(ray.intersectTriangle(r.tri.a,r.tri.b,r.tri.c,false,intersection))high=Math.max(high,intersection.y);
 }
 return high;
}
function recordsInBox(stock,box){
 const records=[],seen=new Set();
 for(let x=Math.floor(box.min.x/CELL);x<=Math.floor(box.max.x/CELL);x++)for(let z=Math.floor(box.min.z/CELL);z<=Math.floor(box.max.z/CELL);z++){
  for(const row of stock.grid.get(x+','+z)??[]){if(seen.has(row.id))continue;seen.add(row.id);records.push(row);}
 }
 return records;
}
function occupiedCenter(stock,box){
 // Surfaces alone miss a payload volume entirely buried in a closed box.
 // The nearest upward crossing exits outward stock only when inside it.
 box.getCenter(ray.origin);ray.direction.set(0,1,0);let nearest=Infinity,hit=null;
 for(const row of stock.grid.get(Math.floor(ray.origin.x/CELL)+','+Math.floor(ray.origin.z/CELL))??[]){
  if(row.solidBox){if(row.bounds.containsPoint(ray.origin))return row;continue;}
  if(!ray.intersectTriangle(row.tri.a,row.tri.b,row.tri.c,false,intersection))continue;
  const distance=intersection.y-ray.origin.y;
  if(distance<nearest){nearest=distance;hit=row;}
 }
 return hit&&hit.tri.getNormal(vector).y>1e-6?hit:null;
}
function oppositeOwnerCollision(stock,box){
 const range=radialRange(box,stock.pivot),seen=new Set();
 for(let y=Math.floor(box.min.y/CELL);y<=Math.floor(box.max.y/CELL);y++)for(const row of stock.sweeps.get(y)??[]){
  if(seen.has(row.id))continue;seen.add(row.id);
  if(box.max.y<row.bounds.min.y||box.min.y>row.bounds.max.y)continue;
  if(range[1]>=row.radial[0]&&range[0]<=row.radial[1])return {mesh:row.name,triangle:row.id,kind:'opposite-owner yaw sweep'};
 }
 return null;
}
function isOwnRoofContact(row,volume,seat){
 if(!row||!volume.roofContact)return false;
 if(row.name===seat.frame)return true;
 if(row.supportRegion&&withinSupportRegion(row.supportRegion,seat.x+(volume.min[0]+volume.max[0])/2,seat.z+(volume.min[2]+volume.max[2])/2,.05))return true;
 return row.name===seat.frame+'InteriorFill'&&row.bounds.max.y<=seat.y+volume.min[1]+.02;
}
export function nativeMissionCollision(stock,seat,padding=.006){
 for(const volume of [...missionAirframeVolumes(seat),...missionCradleVolumes(seat)]){
  const box=new Box3(new Vector3(...volume.min),new Vector3(...volume.max)).translate(new Vector3(seat.x,seat.y,seat.z)).expandByScalar(padding);
  if(box.min.y<stock.minY)return {kind:'stock audit floor',floor:stock.minY};
  for(const row of recordsInBox(stock,box)){
   // Only the four support feet may penetrate their own measured roof; the
   // entire column is still tested against all other equipment and yaw sweeps.
   if(isOwnRoofContact(row,volume,seat))continue;
   if(box.intersectsBox(row.bounds)&&(row.solidBox||box.intersectsTriangle(row.tri)))return {mesh:row.name,triangle:row.id,kind:row.kind??'surface'};
  }
  const contained=occupiedCenter(stock,box);
  const supportedContact=isOwnRoofContact(contained,volume,seat);
  if(contained&&!supportedContact)return {mesh:contained.name,kind:'contained'};
  const sweep=oppositeOwnerCollision(stock,box);if(sweep)return sweep;
 }
 return null;
}
export function nativeSupportedSeat(stock,candidate,rise=.045){
 const supportY=[];
 for(const x of[-candidate.footX,candidate.footX])for(const z of[-candidate.footZ,candidate.footZ])supportY.push(nativeRoofHeight(stock,candidate.x+x,candidate.z+z));
 const high=Math.max(...supportY),low=Math.min(...supportY);
 if(!Number.isFinite(low)||high-low>.10)return null;
 return {...candidate,y:high+rise,supportY};
}

/** Straight lift in the dock frame: the union of these columns contains every
 * airframe/rotor pose throughout spool-up. Bob/bank begin only after 12 m. */
export function nativeMissionTakeoffCollision(stock,seat,padding=.006){
 for(const volume of missionAirframeVolumes(seat)){
  const box=new Box3(new Vector3(...volume.min),new Vector3(...volume.max));
  box.max.y+=AERIAL_RULES.drone.launchHeightM;box.translate(new Vector3(seat.x,seat.y,seat.z)).expandByScalar(padding);
  for(const row of recordsInBox(stock,box)){
   if(box.intersectsBox(row.bounds)&&(row.solidBox||box.intersectsTriangle(row.tri)))return {mesh:row.name,triangle:row.id,kind:'takeoff '+(row.kind??'surface')};
  }
  const contained=occupiedCenter(stock,box);if(contained)return {mesh:contained.name,kind:'takeoff contained'};
  const sweep=oppositeOwnerCollision(stock,box);if(sweep)return {...sweep,kind:'takeoff '+sweep.kind};
 }
 return null;
}
