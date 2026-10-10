import assert from 'node:assert/strict';
import {Box3,Vector3,Ray} from 'three';
import {createTank} from './tankFactory.ts';
import {getSpec} from './specs.ts';
import {ensureInteriorFills} from './interiorFills.ts';
import {MISSION_RECEIVER_SEATS} from './missionAttachmentReceiver.ts';
import {DRONE_DOCK_CRADLE,missionAttachmentMotionClear,missionAttachmentVolumesClear} from '../sim/missionAttachment.ts';
import {collectMissionStock,nativeSupportedSeat,nativeMissionCollision,nativeMissionTakeoffCollision} from '../../tools/mission-attachment-geometry.mjs';

const ids=['pt91_twardy','leo2a6_ua','ua_m1a1','ua_t80u_modern'];
const counts={pt91_twardy:6,leo2a6_ua:4,ua_m1a1:8,ua_t80u_modern:2};
const ray=new Ray(new Vector3(),new Vector3(0,-1,0)),hit=new Vector3();
function nativeRows(stock){const rows=new Map();for(const bucket of stock.grid.values())for(const row of bucket)rows.set(row.id,row);return [...rows.values()];}
function nativeParts(mesh,turret){
 const transform=turret.matrixWorld.clone().invert().multiply(mesh.matrixWorld),p=mesh.geometry.attributes.position;
 assert.equal(mesh.geometry.index,null,'finite receiver boxes remain directly inspectable');
 assert.equal(p.count%36,0);
 return Array.from({length:p.count/36},(_,i)=>{
  const box=new Box3();for(let v=i*36;v<(i+1)*36;v++)box.expandByPoint(new Vector3().fromBufferAttribute(p,v).applyMatrix4(transform));return box;
 });
}
function anchorIndexes(id){return id==='pt91_twardy'?[0,1,2,3]:id==='leo2a6_ua'||id==='ua_t80u_modern'?[0,1]:[0,4];}
function anchorStock(id,row){
 if(row.solidBox)return false;
 if(id==='pt91_twardy')return row.name==='turret';
 // Zoria's bearers rest on the top lattice of the left roof-cage wing (rails, ties and cross rows at y 1.04).
 if(id==='ua_t80u_modern')return row.name==='turretOpenLattice'&&[row.tri.a,row.tri.b,row.tri.c].every(v=>v.x>=-1.645&&v.x<=-.955&&v.y>=1.015&&v.y<=1.065&&v.z>=-1.235&&v.z<=.345);
 if(id==='leo2a6_ua')return row.name==='turretDetail'&&[row.tri.a,row.tri.b,row.tri.c].every(v=>Math.abs(v.x+1.55)<.0161&&v.y>=.8939&&v.y<=.9261&&v.z>=-2.901&&v.z<=.801);
 return row.name==='turretOpenLatticeDark'&&[row.tri.a,row.tri.b,row.tri.c].every(v=>Math.abs(v.x+2.01)<.0161&&v.z>=-1.281&&v.z<=.281&&Math.abs(v.y-(1.3+(.28-v.z)*.04/1.56))<.0161);
}
function contactCount(id,box,rows){return rows.filter(row=>anchorStock(id,row)&&box.intersectsBox(row.bounds)&&box.intersectsTriangle(row.tri)).length;}
function nativeTop(rows,x,z){let height=-Infinity;ray.origin.set(x,20,z);for(const row of rows)if(ray.intersectTriangle(row.tri.a,row.tri.b,row.tri.c,false,hit))height=Math.max(height,hit.y);return height;}
function radial(b,p){const x0=b.min.x-p.x,x1=b.max.x-p.x,z0=b.min.z-p.z,z1=b.max.z-p.z;return[Math.hypot(Math.max(x0,0,-x1),Math.max(z0,0,-z1)),Math.hypot(Math.max(Math.abs(x0),Math.abs(x1)),Math.max(Math.abs(z0),Math.abs(z1)))];}
function receiverFailures(id,parts,stock,rows){
 const failures=[],anchors=anchorIndexes(id),sweeps=new Map();for(const bucket of stock.sweeps.values())for(const row of bucket)sweeps.set(row.id,row);
 for(const [i,part]of parts.entries()){
  const padded=part.clone().expandByScalar(.006);
  for(const row of rows){
   if(row.name==='turretMissionReceiver'||!padded.intersectsBox(row.bounds))continue;
   if(anchors.includes(i)&&anchorStock(id,row))continue;
   if(row.solidBox||padded.intersectsTriangle(row.tri))failures.push({part:i,kind:row.kind??'surface',mesh:row.name,triangle:row.id});
  }
  const range=radial(padded,stock.pivot);
  for(const row of sweeps.values())if(padded.min.y<=row.bounds.max.y&&padded.max.y>=row.bounds.min.y&&range[0]<=row.radial[1]&&range[1]>=row.radial[0])failures.push({part:i,kind:'opposite-owner yaw sweep',mesh:row.name,triangle:row.id});
 }
 return failures;
}

await ensureInteriorFills(ids);
let cases=0,partsChecked=0;
for(const id of ids)for(const quality of['high','low']){
 const spec=getSpec(id),tank=createTank(id,null,{quality,camoSeed:4242,proceduralOnly:true,geometryReceipt:true});tank.root.updateMatrixWorld(true);
 const receiver=tank.root.getObjectByName('turretMissionReceiver'),turret=tank.root.getObjectByName('rig_turret');
 assert(receiver?.isMesh,`${id}: actual permanent receiver exists`);assert.equal(receiver.parent,turret,`${id}: receiver follows native turret`);
 const parts=nativeParts(receiver,turret);assert.equal(parts.length,counts[id]);partsChecked+=parts.length;
 const stock=collectMissionStock(tank,'turret',-Infinity,false,spec),rows=nativeRows(stock),host=rows.filter(row=>anchorStock(id,row));
 for(const i of anchorIndexes(id)){
  const part=parts[i];assert(contactCount(id,part,rows)>0,`${id}: finite socket ${i} meets its real structural host`);
  assert.equal(contactCount(id,part.clone().translate(new Vector3(0,.30,0)),rows),0,`${id}: floating receiver negative control`);
  const center=part.getCenter(new Vector3()),top=nativeTop(host,center.x,center.z);
  if(id==='ua_m1a1')assert(part.max.y>top-.032&&part.max.y<top-.020,`${id}: socket engages underside without entering roof cloth`);
  else assert(part.min.y<top-.002&&part.min.y>top-.035,`${id}: foot has bounded embed rather than a gap or a buried pedestal`);
 }
 // Every finite component connects to a supported socket through overlapping
 // native stock. Floating crossarms cannot pass merely because feet exist.
 const supported=new Set(anchorIndexes(id));let progressed=true;
 while(progressed){progressed=false;for(let i=0;i<parts.length;i++)if(!supported.has(i)&&[...supported].some(j=>parts[i].clone().intersect(parts[j]).getSize(new Vector3()).toArray().every(n=>n>.001))){supported.add(i);progressed=true;}}
 assert.equal(supported.size,parts.length,`${id}: all receiver components carry load to real anchors`);
 const failures=receiverFailures(id,parts,stock,rows);assert.deepEqual(failures,[],`${id}/${quality}: native receiver clears stock and the complete main-gun/recoil/yaw envelope`);
 assert(missionAttachmentVolumesClear(spec,{frame:'turret',x:0,y:0,z:0,...DRONE_DOCK_CRADLE},parts.map(p=>({min:p.min.toArray(),max:p.max.toArray()}))),`${id}: complete receiver clears all roof gun sweeps`);
 const moving=rows.find(row=>row.kind==='main-gun pitch/recoil sweep');assert(moving,'native gun sweep included');
 const intrusive=parts[0].clone().translate(moving.bounds.getCenter(new Vector3()).sub(parts[0].getCenter(new Vector3())));
 assert(receiverFailures(id,[intrusive],stock,rows).some(f=>f.kind==='main-gun pitch/recoil sweep'),'real evaluator rejects receiver intruding into gun sweep');
 const pad=MISSION_RECEIVER_SEATS[id],seat=nativeSupportedSeat(stock,{frame:'turret',x:pad.x,y:pad.topY+.045,z:pad.z,...DRONE_DOCK_CRADLE});
 assert(seat,`${id}: four real native pad hits`);for(const y of seat.supportY)assert(Math.abs(y-pad.topY)<1e-6);
 assert(missionAttachmentMotionClear(spec,seat),`${id}: roof gun and launch sweep clear the drone`);
 assert.equal(nativeMissionCollision(stock,seat),null,`${id}: complete native dock clearance`);
 assert.equal(nativeMissionTakeoffCollision(stock,seat),null,`${id}: native takeoff column clearance`);
 assert(nativeMissionCollision(stock,{...seat,y:seat.y-.30}),`${id}: buried payload negative control`);
 let disposed=0;receiver.geometry.addEventListener('dispose',()=>disposed++);tank.dispose();assert.equal(disposed,1,`${id}: factory disposes receiver geometry once`);
 cases++;
}
console.log(`Mission receiver native contact/clearance passed: ${cases} HIGH/LOW cases, ${partsChecked} finite stock components, connected supports, floating and gun-intrusion controls.`);
