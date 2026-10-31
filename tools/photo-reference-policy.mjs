// Explicit photographic targets only. Missing/failed 3D references never opt in.
import {resolveTankId} from '../src/vehicles/tankIdAliases.ts';
// Each packet is an approved, dated document under docs/references/photos that holds exactly the ids registered to it
// here. Each of its targets names the fixture test that proves it: read from the packet, never inferred from the id.
const PHOTO_REFERENCE_PACKETS=Object.freeze({
  'docs/references/photos/ifvs-20260925.json':Object.freeze(['marder2','cv9040c','dardo','lrmv_lynx','borsuk','amx10p','amx10p_25']),
  // 265 (Main 2026-10-28, option (a)): the ground-up ZTZ-85-III of 263, whose registered print was fused and ~9% tall
  'docs/references/photos/ztz85-iii-20261028.json':Object.freeze(['ztz85_iii']),
});
export const PHOTO_REFERENCE_IDS=Object.freeze(Object.values(PHOTO_REFERENCE_PACKETS).flat());
/** The packet holding an id's photographic target; null for an id with none. */
export function photoReferencePacket(id){
  return Object.keys(PHOTO_REFERENCE_PACKETS).find(file=>PHOTO_REFERENCE_PACKETS[file].includes(id))??null;
}
export function isPhotoReference(id){return PHOTO_REFERENCE_IDS.includes(id);}
// A fixture under src/vehicles that npm test runs (photo-reference-record.mjs also requires it to exist and name the id)
const PHOTO_FIXTURE=/^src\/vehicles\/[A-Za-z0-9_/]+\.selftest\.mjs$/;
export function photoTarget(id,packet){
  const packetPath=photoReferencePacket(id),ids=packetPath?PHOTO_REFERENCE_PACKETS[packetPath]:[];
  if(!packetPath||packet?.schemaVersion!==1
    ||packet.comparisonPurpose!=='photographic-reference'
    ||packet.numerical3DComparison!=='unverified'||packet.dimensionToleranceFraction!==.03
    ||Object.keys(packet.targets??{}).length!==ids.length)return null;
  // The packet keeps the ids it was written under (docs/references, unstamped = schema 1): read its targets in
  // today's ids (tankIdAliases.ts, SSOT 2.19).
  const targets=Object.fromEntries(Object.entries(packet.targets??{}).map(([key,value])=>[resolveTankId(key,packet.tankIdSchema),value]));
  if(!ids.every(key=>Object.hasOwn(targets,key)))return null;
  const target=targets[id];
  if(!target.authority||!target.envelopeBasis||!target.sources?.length
    ||!target.sources.every(url=>typeof url==='string'&&url.startsWith('https://'))
    ||!['widthM','overallLengthM','tallestM','caliberMm','crew'].every(k=>Number.isFinite(target[k])&&target[k]>0)
    ||!['launcherTubes','roofMachineGuns'].every(k=>Number.isInteger(target[k])&&target[k]>=0)
    ||typeof target.unmannedTurret!=='boolean'||typeof target.test!=='string'||!PHOTO_FIXTURE.test(target.test))return null;
  return target;
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
  const valid=isPhotoReference(id)&&configuration?.id===id&&configuration?.comparisonPurpose==='photographic-reference'
    &&receipt?.id===id&&receipt?.verified===true&&receipt.path===photoReferencePacket(id)
    &&/^[a-f0-9]{64}$/.test(receipt.sha256??'')&&configuration.packetSha256===receipt.sha256
    &&Number.isInteger(configuration.roofMachineGuns)&&configuration.roofMachineGuns>=0;
  return {passed:Boolean(valid&&census?.invalidWeaponMarkers===0&&census.mg===configuration.roofMachineGuns),
    required:configuration?.roofMachineGuns,observed:census?.mg,authority:photoReferencePacket(id)};
}
