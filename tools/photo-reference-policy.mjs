// Explicit photographic targets only. Missing/failed 3D references never opt in.
import {resolveTankId} from '../src/vehicles/tankIdAliases.ts';
// Each packet is an approved, dated document under docs/references/photos that holds exactly the ids registered to it
// here. Each of its targets names the fixture test that proves it: read from the packet, never inferred from the id.
const PHOTO_REFERENCE_PACKETS=Object.freeze({
  'docs/references/photos/ifvs-20260925.json':Object.freeze(['marder2','cv9040c','dardo','lrmv_lynx','borsuk','amx10p','amx10p_25']),
  // 265 (Main 2026-10-28, option (a)): the ground-up ZTZ-85-III of 263, whose registered print was fused and ~9% tall
  'docs/references/photos/ztz85-iii-20261028.json':Object.freeze(['ztz85_iii']),
  // 266 (Main 2026-10-31): the true T-64s on their published dimensions; the prints they were measured against (the
  // T-64BV1 and Donbas prints, and the BM1M print the build departs from) are deregistered
  'docs/references/photos/t64-20261031.json':Object.freeze(['t64bm1m','t64bv','t64b1v_2022']),
  // 266 (Main 2026-10-31): the Brazil line's six real vehicles, built from photographs and published dimensions with no
  // 3D model to follow; the fictional EE-T3 and EE-T4 prove their owner design records instead (first-party concepts)
  'docs/references/photos/ccl-x1-pioneiro-20261029.json':Object.freeze(['x1_pioneiro']),
  'docs/references/photos/ccl-x1a2-carcara-20261029.json':Object.freeze(['x1a2_carcara']),
  'docs/references/photos/mb-3-tamoyo-1-20261029.json':Object.freeze(['tamoyo1']),
  'docs/references/photos/mb-3-tamoyo-3-20261029.json':Object.freeze(['tamoyo3']),
  'docs/references/photos/ee-t1-osorio-105-20261029.json':Object.freeze(['osorio_p1']),
  'docs/references/photos/ee-t1-osorio-120-20261029.json':Object.freeze(['osorio_p2']),
  // 266 (Main 2026-10-31): the M60 batch's two Israeli marks, built on the rebuilt M60A1's castings from the Latrun
  // museum tanks' photographs, with no 3D model to follow
  'docs/references/photos/magach-latrun-20261031.json':Object.freeze(['magach6b','magach7c']),
  // 267 (Main 2026-10-31, the Japan line): the Type 90 (B) on the production Type 90's build, and the TK-X and the Type
  // 10B on the modern Type 10's, each proved by JGSDF/TRDI photographs; the production Type 10 print the TK-X was
  // registered against is deregistered (a prototype cannot match it)
  'docs/references/photos/type90b-20261031.json':Object.freeze(['type90b']),
  'docs/references/photos/type10-tk-x-20261031.json':Object.freeze(['type10_tk_x']),
  'docs/references/photos/type10b-20261031.json':Object.freeze(['type10b']),
  // 268 (the owner, 2026-11-01: "now update the ... bmp 3 rok, bwp-1"): the BMP-3 in ROK service on the fleet's BMP-3
  // hull and the BWP-1 under the RCWS-30, built from photographs with no 3D model to follow
  'docs/references/photos/bmp-family-20261101.json':Object.freeze(['bmp3_rok','bwp1']),
  // 268 (the owner, 2026-11-01: "now update the c2 protottype, c1 prototype s1 ... K2B ... k1e1"): the C1 and C2 Ariete
  // prototypes, the K1E1 and the K2B, rebuilt from photographs; the prints the first three were registered to (the series
  // C1 Ariete, the K1A1) show other variants and are deregistered (Main's ruling 2026-10-28); the K2B had no 3D target
  'docs/references/photos/ariete-prototypes-20261101.json':Object.freeze(['c1_ariete_proto_serie1','c2_ariete_proto']),
  'docs/references/photos/korea-k1e1-k2b-20261101.json':Object.freeze(['k1e1','k2b']),
  // 269 (the owner, 2026-11-02: "also update the cheiftainn mk 3 and mk 9"): the Chieftain Mk 9 on the source-built Mk 10
  // castings without Stillbrew (the Mk 5 to the Mk 9 looked externally the same), proved by photographs of its base Mk 6
  // and of 1979-90 BAOR Chieftains, with no 3D model to follow
  'docs/references/photos/chieftain-mk9-20261102.json':Object.freeze(['chieftain_mk9']),
  // 267 (Main 2026-10-28 and 2026-10-29, as the 2A4-era Leopards): the Eurosatory 2024 KF51 Panther EVO and KF51-U,
  // rebuilt from photographs, their registered print (the 2022 demonstrator) unregistered
  'docs/references/photos/kf51-evo-20261101.json':Object.freeze(['kf51_evo']),
  'docs/references/photos/kf51-u-20261101.json':Object.freeze(['kf51_u']),
  // 268 (owner 2026-11-02): the M3A2 Bradley, the shared Bradley hull under main's classic M2A2 turret (mirrored); the
  // turret is kept as main built it, not measured to a model, so the id proves its packet
  'docs/references/photos/m3a2-bradley-20261102.json':Object.freeze(['m3a2_bradley']),
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
  const valid=isPhotoReference(id)&&configuration?.id===id&&configuration?.comparisonPurpose==='photographic-reference'
    &&receipt?.id===id&&receipt?.verified===true&&receipt.path===photoReferencePacket(id)
    &&/^[a-f0-9]{64}$/.test(receipt.sha256??'')&&configuration.packetSha256===receipt.sha256
    &&Number.isInteger(configuration.roofMachineGuns)&&configuration.roofMachineGuns>=0;
  return {passed:Boolean(valid&&census?.invalidWeaponMarkers===0&&census.mg===configuration.roofMachineGuns),
    required:configuration?.roofMachineGuns,observed:census?.mg,authority:photoReferencePacket(id)};
}
