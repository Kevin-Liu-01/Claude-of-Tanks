// Explicit photographic targets only. Missing/failed 3D references never opt in.
import {resolveTankId} from '../src/vehicles/tankIdAliases.ts';
const IFVS='docs/references/photos/ifvs-20260925.json';
const T64S='docs/references/photos/t64-20261031.json';
/**
 * Each photo-class id's packet (docs/references/photos) and the native fixture its packet must name. A packet holds
 * exactly the ids this table assigns it. Stage A takes the photo route only for an id with no registered 3D oracle: a
 * registered oracle always measures and the packet never overrides it (stageARoute; geometry-gate refuses the pair). A
 * lane adds its ids' rows here with their packet (Main 2026-10-31: the photo route ends per-batch exemptions).
 */
export const PHOTO_REFERENCES=Object.freeze({
  marder2:Object.freeze({packet:IFVS,test:'src/vehicles/profiles/marder2.selftest.mjs'}),
  cv9040c:Object.freeze({packet:IFVS,test:'src/vehicles/ifvReplicas.selftest.mjs'}),
  dardo:Object.freeze({packet:IFVS,test:'src/vehicles/europePhotoIfvs.selftest.mjs'}),
  lrmv_lynx:Object.freeze({packet:IFVS,test:'src/vehicles/europePhotoIfvs.selftest.mjs'}),
  borsuk:Object.freeze({packet:IFVS,test:'src/vehicles/europePhotoIfvs.selftest.mjs'}),
  amx10p:Object.freeze({packet:IFVS,test:'src/vehicles/amx10p.selftest.mjs'}),
  amx10p_25:Object.freeze({packet:IFVS,test:'src/vehicles/amx10p.selftest.mjs'}),
  // 266 (Main 2026-10-31): the true T-64s on their published dimensions; the prints they were measured against (the
  // T-64BV1 and Donbas prints, and the BM1M print the build departs from) are deregistered
  t64bm1m:Object.freeze({packet:T64S,test:'src/vehicles/profiles/t64Foundation.selftest.mjs'}),
  t64bv:Object.freeze({packet:T64S,test:'src/vehicles/profiles/t64Foundation.selftest.mjs'}),
  t64b1v_2022:Object.freeze({packet:T64S,test:'src/vehicles/profiles/t64Foundation.selftest.mjs'}),
});
export const PHOTO_REFERENCE_IDS=Object.freeze(Object.keys(PHOTO_REFERENCES));
export function isPhotoReference(id){return Object.hasOwn(PHOTO_REFERENCES,id);}
export function photoReferencePacket(id){return isPhotoReference(id)?PHOTO_REFERENCES[id].packet:null;}
export function photoTarget(id,packet){
  if(!isPhotoReference(id)||packet?.schemaVersion!==1
    ||packet.comparisonPurpose!=='photographic-reference'
    ||packet.numerical3DComparison!=='unverified'||packet.dimensionToleranceFraction!==.03)return null;
  // The packet keeps the ids it was written under (docs/references, unstamped = schema 1): read its targets in
  // today's ids (tankIdAliases.ts, SSOT 2.19). It holds exactly its members, never a transplanted target.
  const members=PHOTO_REFERENCE_IDS.filter(key=>PHOTO_REFERENCES[key].packet===PHOTO_REFERENCES[id].packet);
  const targets=Object.fromEntries(Object.entries(packet.targets??{}).map(([key,value])=>[resolveTankId(key,packet.tankIdSchema),value]));
  if(Object.keys(targets).length!==members.length||!members.every(key=>Object.hasOwn(targets,key)))return null;
  const target=targets[id];
  if(!target.authority||!target.envelopeBasis||!target.sources?.length
    ||!target.sources.every(url=>typeof url==='string'&&url.startsWith('https://'))
    ||!['widthM','overallLengthM','tallestM','caliberMm','crew'].every(k=>Number.isFinite(target[k])&&target[k]>0)
    ||!['launcherTubes','roofMachineGuns'].every(k=>Number.isInteger(target[k])&&target[k]>=0)
    ||typeof target.unmannedTurret!=='boolean')return null;
  return target.test===PHOTO_REFERENCES[id].test?target:null;
}
/**
 * Stage A's route (Main 2026-10-31): a registered 3D oracle always measures (a packet never overrides it), an owner
 * concept proves its design, a photo-class id proves its packet; an id with none of them is procedural-only.
 */
export function stageARoute(id,{registered=false,concept=false}={}){
  if(registered)return 'oracle';
  if(concept)return 'concept';
  return isPhotoReference(id)?'photo':'none';
}
/**
 * Stage A's verdict on a route's evidence: the photo and concept routes on their fresh receipts; the oracle on its fresh
 * geometry packet under --gate (outside it, a stale or absent packet stays N/A as before); a procedural-only id fails a
 * forced gate and is N/A outside it. Only the route's own evidence counts: a photo receipt never passes an oracle.
 */
export function stageAPassed(route,{forceGate=false,gateApplicable=false,exactGatePassed=false,photoProof=false,conceptProof=false}={}){
  if(route==='photo')return photoProof===true;
  if(route==='concept')return conceptProof===true;
  if(route==='oracle')return forceGate?gateApplicable&&exactGatePassed:!gateApplicable||exactGatePassed;
  return !forceGate;
}
/** The geometry gate's refusal (rule c): an id with both a photo packet and a registered 3D oracle is a registry error. */
export function assertNoPhotoOverride(ids,registered){
  for(const id of ids)if(isPhotoReference(id)&&registered.has(id))
    throw new Error(`${id}: photographic qualification cannot override a registered 3D target`);
}
export function photoDimensionsPassed(row,target){
  const min=row?.bounds?.min,max=row?.bounds?.max;
  if(!target||row?.fillLoaded!==true||!Array.isArray(min)||!Array.isArray(max)
    ||min.length!==3||max.length!==3||![...min,...max].every(Number.isFinite)
    ||min.some((n,i)=>n>=max[i]))return false;
  return [Math.abs(max[0]-min[0]-target.widthM)/target.widthM,
    Math.abs(max[2]-min[2]-target.overallLengthM)/target.overallLengthM,
    Math.abs(max[1]-target.tallestM)/target.tallestM].every(error=>error<=.03);
}
export function photoReceiptPassed(id,report,packet,packetHash,startedAt){
  const target=photoTarget(id,packet);
  return Boolean(target&&report?.id===id&&report.passed===true
    &&report.comparisonPurpose==='photographic-reference'&&report.numerical3DComparison==='unverified'
    &&report.score===null&&report.packetPath===photoReferencePacket(id)
    &&/^[a-f0-9]{64}$/.test(packetHash??'')&&report.packetSha256===packetHash
    &&Date.parse(report.startedAt)>=startedAt&&report.test?.path===target.test&&report.test.exitCode===0
    &&/^[a-f0-9]{64}$/.test(report.inputSha256Before??'')&&report.inputSha256Before===report.inputSha256After
    &&report.dimensions?.length===2&&['high','low'].every(quality=>report.dimensions.some(row=>
      row.quality===quality&&photoDimensionsPassed(row,target))));
}
export function photoEquipmentVerdict(id,census,configuration,receipt){
  const packetPath=photoReferencePacket(id);
  const valid=isPhotoReference(id)&&configuration?.id===id&&configuration?.comparisonPurpose==='photographic-reference'
    &&receipt?.id===id&&receipt?.verified===true&&receipt.path===packetPath
    &&/^[a-f0-9]{64}$/.test(receipt.sha256??'')&&configuration.packetSha256===receipt.sha256
    &&Number.isInteger(configuration.roofMachineGuns)&&configuration.roofMachineGuns>=0;
  return {passed:Boolean(valid&&census?.invalidWeaponMarkers===0&&census.mg===configuration.roofMachineGuns),
    required:configuration?.roofMachineGuns,observed:census?.mg,authority:packetPath};
}
