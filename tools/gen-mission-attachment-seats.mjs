import fs from 'node:fs';
import path from 'node:path';
import {Matrix4,Quaternion,Vector3} from 'three';
import {createTank} from '../src/vehicles/tankFactory.ts';
import {TANK_SPECS} from '../src/vehicles/specs.ts';
import {ensureInteriorFills} from '../src/vehicles/interiorFills.ts';
import {MISSION_ATTACHMENT_SEATS} from '../src/sim/missionAttachmentSeats.generated.ts';
import {missionAttachmentCandidates,missionAttachmentMotionClear,missionAttachmentSignature,missionAttachmentTurretPivot,DRONE_DOCK_CRADLE} from '../src/sim/missionAttachment.ts';
import {authoredSupportCandidates,collectMissionStock,nativeSupportedSeat,nativeMissionCollision,nativeMissionTakeoffCollision,nativeRoofHeight,missionStockFingerprint} from './mission-attachment-geometry.mjs';
import {missionSeatTrials} from './mission-attachment-seat-trials.mjs';
const args=process.argv.slice(2),value=(name,fallback)=>args.find(a=>a.startsWith(name+'='))?.slice(name.length+1)??fallback;
const check=args.includes('--check'),dryRun=args.includes('--dry-run'),ids=value('--ids',Object.keys(TANK_SPECS).join(',')).split(',');
const seeds=value('--seeds','4000,4242,8191').split(',').map(Number),qualities=value('--qualities','high,low').split(',');
const reportPath=value('--report','.qa-dev/drone-dock/native-seats-report.json');
// Authored stands taller than the standard rises reach; a --hints row for the same id replaces one. The BMPT's braced
// stand is the one src/game/missionAttachmentMechanical.selftest.mjs certifies independently: no other BMPT roof or
// hull seat clears its twin 30 mm envelope (2026-10-08: none in 295,000 grid candidates).
const AUTHORED_DOCKS=[
 {id:'bmpt_t90',chosen:{frame:'turret',x:.07,y:1.3280000162124634,z:.09,payloadOffset:[-.24,-.24],braced:true},riseM:.32},
];
const hintsPath=value('--hints',''),fileHints=hintsPath?JSON.parse(fs.readFileSync(hintsPath)):[];
const hintRows=[...AUTHORED_DOCKS.filter(dock=>!fileHints.some(row=>row.id===dock.id)),...fileHints];
const hints=Object.fromEntries(hintRows.filter(r=>r.chosen).map(r=>[r.id,r.chosen]));
// A measured, authored bracket may need a nonstandard rise. This is only a
// candidate preference: every support, weapon, launch and seed/LOD check runs.
const hintRises=new Map(hintRows.filter(r=>r.riseM!==undefined).map(r=>{
 if(!r.chosen||!Number.isFinite(r.riseM)||r.riseM<.025||r.riseM>.35)throw new Error('Invalid authored dock rise for '+r.id);
 return [r.id,r.riseM];
}));
const stockPool=new Map();
const records={...MISSION_ATTACHMENT_SEATS},report={schemaVersion:1,seeds,qualities,mode:check?'check':dryRun?'dry-run':'update',rows:[]};
function ensureCase(cases,id,quality,seed){
 const key=quality+':'+seed;
 if(!cases.has(key)){
  const tank=createTank(id,null,{proceduralOnly:true,geometryReceipt:true,quality,camoSeed:seed});tank.root.updateMatrixWorld(true);
  cases.set(key,{tank,spec:TANK_SPECS[id],frames:new Map(),quality,seed});
 }
 return cases.get(key);
}
function caseStock(entry,frame,candidates){
 if(!entry.frames.has(frame)){
  const heights=candidates.filter(c=>c.frame===frame).map(c=>c.y);
  const floor=heights.length?Math.min(...heights)-.50:-Infinity;
  const fingerprint=missionStockFingerprint(entry.tank,frame),key=frame+':'+floor+':'+fingerprint;
  let stock=stockPool.get(key);if(!stock){stock=collectMissionStock(entry.tank,frame,floor,false,entry.spec);stockPool.set(key,stock);}
  entry.frames.set(frame,stock);
 }
 return entry.frames.get(frame);
}
function sameSupport(stock,seat){
 const supported=nativeSupportedSeat(stock,{...seat,y:Math.max(...seat.supportY)+.045},seat.y-Math.max(...seat.supportY));
 if(!supported)return false;
 return supported.supportY.every((y,i)=>Math.abs(y-seat.supportY[i])<.001);
}
function launchPivotFailure(entry,spec){
 if(spec.armor.turretless)return null;
 const owner=entry.tank.root.getObjectByName('rig_turret');
 if(!owner)return {kind:'missing native turret owner'};
 const local=new Matrix4().copy(entry.tank.root.matrixWorld).invert().multiply(owner.matrixWorld);
 const native=new Vector3(),orientation=new Quaternion();local.decompose(native,orientation,new Vector3());
 if(orientation.angleTo(new Quaternion())>1e-6)return {kind:'unsupported native launch orientation',actual:orientation.toArray()};
 // Auxiliary inventory datums are serialized to four decimal places.
 return native.distanceTo(new Vector3(...missionAttachmentTurretPivot(spec)))>1e-4?{kind:'native launch pivot',actual:native.toArray()}:null;
}
function validateCases(spec,seat,candidates,cases){
 const failures=[],hashes={};
 for(const quality of qualities)for(const seed of seeds){
  const entry=ensureCase(cases,spec.id,quality,seed),stock=caseStock(entry,seat.frame,candidates);
  hashes[quality+':'+seed]=stock.geometryHash;
  const pivotFailure=launchPivotFailure(entry,spec);if(pivotFailure)failures.push({quality,seed,...pivotFailure});
  if(!sameSupport(stock,seat))failures.push({quality,seed,kind:'support'});
  const collision=nativeMissionCollision(stock,seat)??nativeMissionTakeoffCollision(stock,seat);if(collision)failures.push({quality,seed,...collision});
  if(!nativeMissionCollision(stock,{...seat,y:seat.y-.3}))failures.push({quality,seed,kind:'buried-payload negative control missed'});
 }
 return {failures,hashes};
}
function refinedCandidates(spec,cases,candidates){
 // The cantilever pass offsets this list, so it carries the authored supports too.
 const entry=ensureCase(cases,spec.id,'high',4000),result=authoredSupportCandidates(spec.id,DRONE_DOCK_CRADLE).map(c=>({...c,...DRONE_DOCK_CRADLE}));
 for(const frame of spec.armor.turretless?['hull']:['turret','hull']){
  const stock=caseStock(entry,frame,candidates),rows=stock.support;if(!rows.length)continue;
  const minX=Math.min(...rows.map(r=>r.bounds.min.x)),maxX=Math.max(...rows.map(r=>r.bounds.max.x));
  const minZ=Math.min(...rows.map(r=>r.bounds.min.z)),maxZ=Math.max(...rows.map(r=>r.bounds.max.z));
  for(let z=minZ+.18;z<maxZ-.18;z+=.06)for(let x=minX+.17;x<maxX-.17;x+=.06){
   const y=nativeRoofHeight(stock,x,z);if(Number.isFinite(y))result.push({frame,x,y:y+.045,z,...DRONE_DOCK_CRADLE});
  }
 }
 return result;
}
function reportSearchProgress(id,refined,checked,rejections){
 if(checked%500===0)console.log(id,'search',refined?'native-grid':'metadata-grid',checked,JSON.stringify(rejections));
}
function findSeat(spec,candidates,cases,refined=false,cantilever=false){
 const entry=ensureCase(cases,spec.id,'high',4000);
 const pivotFailure=launchPivotFailure(entry,spec);if(pivotFailure)return {seat:null,checked:0,firstFailure:pivotFailure,reason:pivotFailure.kind};
 let checked=0,firstFailure=null;const rejections={};
 const reject=key=>{rejections[key]=(rejections[key]??0)+1;};
 const authored=!refined&&hintRises.has(spec.id)
  ?{candidate:{...hints[spec.id],...DRONE_DOCK_CRADLE},riseM:hintRises.get(spec.id)}:undefined;
 for(const {rise,candidate} of missionSeatTrials(candidates,authored)){
  const stock=caseStock(entry,candidate.frame,candidates),seat=nativeSupportedSeat(stock,candidate,rise);checked++;
  reportSearchProgress(spec.id,refined,checked,rejections);
  if(!seat){reject(candidate.frame+':support');continue;}
  if(!missionAttachmentMotionClear(spec,seat)){reject(candidate.frame+':roof-gun');continue;}
  const collision=nativeMissionCollision(stock,seat)??nativeMissionTakeoffCollision(stock,seat);if(collision){reject(candidate.frame+':'+collision.kind+':'+collision.mesh);firstFailure??=collision;continue;}
  const validation=validateCases(spec,seat,candidates,cases);
  if(validation.failures.length){firstFailure??=validation.failures[0];continue;}
  return {seat:{...seat,signature:missionAttachmentSignature(spec),geometryHash:stock.geometryHash},checked,validation};
 }
 if(!refined){
  const result=findSeat(spec,refinedCandidates(spec,cases,candidates),cases,true);
  return {...result,checked:checked+result.checked,refined:true};
 }
 if(!cantilever){
  const offsets=[[.24,0],[-.24,0],[0,.24],[0,-.24],[.36,0],[-.36,0],[0,.36],[0,-.36],[.48,0],[-.48,0],[0,.48],[0,-.48]];
  const shifted=offsets.flatMap(payloadOffset=>candidates.map(c=>({...c,payloadOffset})));
  const result=findSeat(spec,shifted,cases,true,true);return {...result,checked:checked+result.checked,cantilever:true};
 }
 return {seat:null,checked,firstFailure,rejections};
}
function inspectRecord(spec,seat,candidates,cases){
 if(!seat)return {pass:false,reason:'missing native seat record'};
 if(seat.signature!==missionAttachmentSignature(spec))return {pass:false,reason:'stale authoritative geometry signature'};
 if(!missionAttachmentMotionClear(spec,seat))return {pass:false,reason:'authoritative roof-gun sweep'};
 const validation=validateCases(spec,seat,candidates,cases);
 const entry=ensureCase(cases,spec.id,'high',4000),stock=caseStock(entry,seat.frame,candidates);
 if(stock.geometryHash!==seat.geometryHash)validation.failures.push({kind:'stale native geometry hash'});
 // Actual buried-volume negative control must fail on the same real stock.
 const buried=nativeMissionCollision(stock,{...seat,y:seat.y-.3});
 if(!buried)validation.failures.push({kind:'buried-payload negative control missed'});
 return {pass:validation.failures.length===0,validation};
}
function flush(){
 fs.mkdirSync(path.dirname(reportPath),{recursive:true});fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');
 if(check||dryRun)return;
 const rows=Object.entries(records).sort(([a],[b])=>a.localeCompare(b)).map(([id,record])=>'  '+JSON.stringify(id)+': '+JSON.stringify(record));
 fs.writeFileSync('src/sim/missionAttachmentSeats.generated.ts',`// Generated by tools/gen-mission-attachment-seats.mjs. Do not hand-edit.\nimport type { MissionAttachmentNativeRecord } from './missionAttachment.ts';\nexport const MISSION_ATTACHMENT_SEATS: Readonly<Record<string,MissionAttachmentNativeRecord>> = {\n${rows.join(',\n')}\n};\n`);
}
for(const id of ids){
 stockPool.clear();
 const spec=TANK_SPECS[id];if(!spec)throw new Error('Unknown vehicle '+id);
 await ensureInteriorFills([id]);
 // Authored supports (a receiver's pads, a welded patch) are narrow, and the
 // .06 m native grid can step over them (2026-10-08: no Twardy, M1A1 SA or
 // Russian patch seat in 280,000+ candidates each). Offer them after any
 // hint and the current record, before the broad grid; every check runs.
 const candidates=[...(hints[id]?[hints[id]]:[]),...(records[id]?[records[id]]:[]),...authoredSupportCandidates(id,DRONE_DOCK_CRADLE),...missionAttachmentCandidates(spec)].map(c=>({...c,...DRONE_DOCK_CRADLE})),cases=new Map();
 try{
  const result=check?inspectRecord(spec,records[id],candidates,cases):findSeat(spec,candidates,cases);
  if(result.seat)records[id]=result.seat;
  const pass=check?result.pass:!!result.seat;
  report.rows.push({id,pass,...result});flush();console.log(id,pass?'PASS':'FAIL',result.checked??'',result.reason??'');
 }finally{for(const entry of cases.values())entry.tank.dispose();}
}
report.pass=report.rows.every(r=>r.pass);flush();console.log(`mission seats: ${report.rows.filter(r=>r.pass).length}/${report.rows.length} ${check?'verified':'generated'}`);
if(!report.pass)process.exitCode=1;
