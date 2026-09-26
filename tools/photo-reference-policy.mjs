// Explicit photographic targets only. Missing/failed 3D references never opt in.
export const PHOTO_REFERENCE_IDS=Object.freeze(['cv90_x','dardo','lrmv_lynx','borsuk']);
export const PHOTO_REFERENCE_PACKET='docs/references/photos/ifvs-20260925.json';
export function isPhotoReference(id){return PHOTO_REFERENCE_IDS.includes(id);}
export function photoTarget(id,packet){
  if(!isPhotoReference(id)||packet?.schemaVersion!==1
    ||packet.comparisonPurpose!=='photographic-reference'
    ||packet.numerical3DComparison!=='unverified'||packet.dimensionToleranceFraction!==.03
    ||Object.keys(packet.targets??{}).length!==PHOTO_REFERENCE_IDS.length)return null;
  if(!PHOTO_REFERENCE_IDS.every(key=>Object.hasOwn(packet.targets,key)))return null;
  const target=packet.targets[id];
  if(!target.authority||!target.envelopeBasis||!target.sources?.length
    ||!target.sources.every(url=>typeof url==='string'&&url.startsWith('https://'))
    ||!['widthM','overallLengthM','tallestM','caliberMm','crew'].every(k=>Number.isFinite(target[k])&&target[k]>0)
    ||!['launcherTubes','roofMachineGuns'].every(k=>Number.isInteger(target[k])&&target[k]>=0)
    ||typeof target.unmannedTurret!=='boolean')return null;
  const expected=id==='cv90_x'?'src/vehicles/ifvReplicas.selftest.mjs':'src/vehicles/europePhotoIfvs.selftest.mjs';
  return target.test===expected?target:null;
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
    &&report.score===null&&report.packetPath===PHOTO_REFERENCE_PACKET
    &&/^[a-f0-9]{64}$/.test(packetHash??'')&&report.packetSha256===packetHash
    &&Date.parse(report.startedAt)>=startedAt&&report.test?.path===target.test&&report.test.exitCode===0
    &&/^[a-f0-9]{64}$/.test(report.inputSha256Before??'')&&report.inputSha256Before===report.inputSha256After
    &&report.dimensions?.length===2&&['high','low'].every(quality=>report.dimensions.some(row=>
      row.quality===quality&&photoDimensionsPassed(row,target))));
}
export function photoEquipmentVerdict(id,census,configuration,receipt){
  const valid=isPhotoReference(id)&&configuration?.id===id&&configuration?.comparisonPurpose==='photographic-reference'
    &&receipt?.id===id&&receipt?.verified===true&&receipt.path===PHOTO_REFERENCE_PACKET
    &&/^[a-f0-9]{64}$/.test(receipt.sha256??'')&&configuration.packetSha256===receipt.sha256
    &&Number.isInteger(configuration.roofMachineGuns)&&configuration.roofMachineGuns>=0;
  return {passed:Boolean(valid&&census?.invalidWeaponMarkers===0&&census.mg===configuration.roofMachineGuns),
    required:configuration?.roofMachineGuns,observed:census?.mg,authority:PHOTO_REFERENCE_PACKET};
}
