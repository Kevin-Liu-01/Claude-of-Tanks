import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {readPhotoReference} from './photo-reference-record.mjs';
import {resolveTankId} from '../src/vehicles/tankIdAliases.ts';
import {ALL_TANK_IDS} from '../src/vehicles/specs.ts';
import {firstPartyConcept} from './first-party-concept-policy.mjs';
import {PHOTO_REFERENCE_IDS,photoReferencePacket,photoTarget,photoReceiptPassed,isPhotoReference,stageARoute,stageAPassed}
  from './photo-reference-policy.mjs';
import {roofEquipmentVerdict} from './source-equipment-policy.mjs';
import {tankReleaseSteps} from './tank-release-plan.mjs';
import {approvedOpeningsVerdict} from './approved-openings.mjs';
for(const id of ['unknown','puma_s1','type89','__proto__'])assert.throws(()=>readPhotoReference(id));
for(const id of PHOTO_REFERENCE_IDS){
  const doc=readPhotoReference(id),{target,packet,packetSha256,packetPath}=doc;
  const dimensions=['high','low'].map(quality=>({quality,fillLoaded:true,
    bounds:{min:[-target.widthM/2,0,-target.overallLengthM/2],max:[target.widthM/2,target.tallestM,target.overallLengthM/2]}}));
  const report={id,passed:true,comparisonPurpose:'photographic-reference',numerical3DComparison:'unverified',score:null,
    packetSha256,packetPath,startedAt:new Date(2000).toISOString(),test:{path:target.test,exitCode:0},
    inputSha256Before:'a'.repeat(64),inputSha256After:'a'.repeat(64),dimensions};
  assert(photoReceiptPassed(id,report,packet,packetSha256,1000));
  for(const patch of [{score:95},{numerical3DComparison:'passed'},{passed:false},{packetSha256:'b'.repeat(64)},
    {id:'type89'},{startedAt:new Date(0).toISOString()},{inputSha256After:'c'.repeat(64)},
    {test:{path:target.test,exitCode:1}},{dimensions:dimensions.slice(1)},
    {dimensions:[{...dimensions[0],fillLoaded:false},dimensions[1]]},
    {dimensions:[{...dimensions[0],bounds:{min:[0,0,0],max:[50,50,50]}},dimensions[1]]}])
    assert.equal(photoReceiptPassed(id,{...report,...patch},packet,packetSha256,1000),false);
  for(const patch of [{dimensionToleranceFraction:.04},{numerical3DComparison:'passed'},{targets:{...packet.targets,extra:target}},
    {targets:{...packet.targets,[id]:{...target,test:'skip.mjs'}}}])assert.equal(photoTarget(id,{...packet,...patch}),null);
  const config={id,comparisonPurpose:'photographic-reference',roofMachineGuns:target.roofMachineGuns,packetSha256};
  const receipt={id,verified:true,path:packetPath,sha256:packetSha256};
  const census={mg:target.roofMachineGuns,invalidWeaponMarkers:0};
  assert(roofEquipmentVerdict(id,census,config,receipt).passed);
  assert.equal(roofEquipmentVerdict(id,census,config,{...receipt,verified:false}).passed,false);
  assert.equal(roofEquipmentVerdict(id,census,config).passed,false);
  assert.equal(roofEquipmentVerdict(id,{...census,mg:target.roofMachineGuns+1},config,receipt).passed,false);
  assert.equal(approvedOpeningsVerdict({id,scan:{holeCells:1}}).passed,false,'photo targets cannot waive unexplained holes');
  const steps=tankReleaseSteps(id,true,'node');
  assert.equal(steps.length,20,'all physical, anatomy, test and build steps retained'); // (integ/226: + the vehicles' ledger and mission-seat checks, + the spare-track ledger; 2026-10-17: + the material registration; 2026-10-18 227 gun-gaps: + the gun-junction ledger; 266: + the id-scoped tanks receipts) 265 integration: + the id-scoped fill exposure beside the id-scoped tanks step (19); 267: + the whip-rod census (20).
  assert.equal(steps.some(step=>step.args[0]==='tools/procedural-fidelity.mjs'),false,'no outside-model score');
}
// Per-id packets (265): each id reads the packet registered to it, which holds exactly that packet's ids, and the fixture
// its target names; a packet never qualifies an id registered to another one.
const IFVS='docs/references/photos/ifvs-20260925.json',ZTZ='docs/references/photos/ztz85-iii-20261028.json';
assert.equal(new Set(PHOTO_REFERENCE_IDS).size,PHOTO_REFERENCE_IDS.length,'an id has one packet');
for(const id of ['marder2','cv9040c','dardo','lrmv_lynx','borsuk','amx10p','amx10p_25'])assert.equal(photoReferencePacket(id),IFVS);
assert.equal(photoReferencePacket('ztz85_iii'),ZTZ);
for(const id of ['type59','__proto__','toString'])assert.equal(photoReferencePacket(id),null);
const ztz=readPhotoReference('ztz85_iii'),marder=readPhotoReference('marder2');
assert.equal(ztz.packetPath,ZTZ);assert.equal(marder.packetPath,IFVS);
assert.equal(ztz.target.test,'src/vehicles/profiles/ztz85iii.selftest.mjs','the fixture is the one the packet names');
assert.equal(photoTarget('ztz85_iii',marder.packet),null,'the IFV packet cannot qualify the ZTZ-85-III');
assert.equal(photoTarget('marder2',ztz.packet),null,"the ZTZ-85-III's packet cannot qualify an IFV");
assert.throws(()=>readPhotoReference('ztz85_iii',()=>readFileSync(IFVS)),/no complete explicit photographic target/);
assert.throws(()=>readPhotoReference('marder2',()=>readFileSync(ZTZ)),/no complete explicit photographic target/);
{
  const {target,packet,packetSha256}=ztz;
  const dimensions=['high','low'].map(quality=>({quality,fillLoaded:true,
    bounds:{min:[-target.widthM/2,0,-target.overallLengthM/2],max:[target.widthM/2,target.tallestM,target.overallLengthM/2]}}));
  const report={id:'ztz85_iii',passed:true,comparisonPurpose:'photographic-reference',numerical3DComparison:'unverified',score:null,
    packetSha256,packetPath:ZTZ,startedAt:new Date(2000).toISOString(),test:{path:target.test,exitCode:0},
    inputSha256Before:'a'.repeat(64),inputSha256After:'a'.repeat(64),dimensions};
  assert(photoReceiptPassed('ztz85_iii',report,packet,packetSha256,1000));
  assert.equal(photoReceiptPassed('ztz85_iii',{...report,packetPath:IFVS},packet,packetSha256,1000),false,'a report naming another packet');
  const config={id:'ztz85_iii',comparisonPurpose:'photographic-reference',roofMachineGuns:1,packetSha256};
  const census={mg:1,invalidWeaponMarkers:0};
  assert(roofEquipmentVerdict('ztz85_iii',census,config,{id:'ztz85_iii',verified:true,path:ZTZ,sha256:packetSha256}).passed);
  assert.equal(roofEquipmentVerdict('ztz85_iii',census,config,{id:'ztz85_iii',verified:true,path:IFVS,sha256:packetSha256}).passed,false);
  // The fixture: present in the packet, shaped as a src/vehicles selftest, present in the checkout and naming the id.
  const withTest=test=>{const t={...target};if(test===undefined)delete t.test;else t.test=test;return {...packet,targets:{ztz85_iii:t}};};
  for(const test of [undefined,'skip.mjs','src/vehicles/../../skip.selftest.mjs','tools/photo-reference-policy.selftest.mjs'])
    assert.equal(photoTarget('ztz85_iii',withTest(test)),null,`${test}: not a vehicle fixture`);
  assert.throws(()=>readPhotoReference('ztz85_iii',()=>JSON.stringify(withTest('src/vehicles/profiles/missing.selftest.mjs'))),/is missing or does not name it/);
  assert.throws(()=>readPhotoReference('ztz85_iii',()=>JSON.stringify(withTest('src/vehicles/profiles/marder2.selftest.mjs'))),/is missing or does not name it/);
}
const mixed=tankReleaseSteps('cv9040c,puma_s1,type89,borsuk',true,'node');
assert.equal(mixed.some(step=>step.args[0]==='tools/procedural-fidelity.mjs'),false,'no release step compares with an outside model');
// --- stage A's routes (owner 2026-11-12): a photo-class id passes through its packet, a concept through its design; an
// id with neither is N/A and never fails (no outside model qualifies or fails a build) --------------------------------
for(const id of PHOTO_REFERENCE_IDS)assert.equal(stageARoute(id),'photo');
const PACKETS=new Set(PHOTO_REFERENCE_IDS.map(photoReferencePacket));
for(const packet of PACKETS){
  // the packet's keys in today's ids, as photoTarget reads them
  const {targets,tankIdSchema}=JSON.parse(readFileSync(packet,'utf8'));
  assert.deepEqual(Object.keys(targets).map(key=>resolveTankId(key,tankIdSchema)).sort(),
    PHOTO_REFERENCE_IDS.filter(id=>photoReferencePacket(id)===packet).sort(),`${packet}: exactly its members`);
}
const bare=ALL_TANK_IDS.find(id=>!isPhotoReference(id)&&!firstPartyConcept(id));
assert.ok(bare,'the fleet has an id with no photo packet and no concept to control with');
assert.equal(stageARoute(bare),'none');
assert.equal(stageAPassed('none'),true,'an id with no A-stage evidence never fails stage A');
assert.throws(()=>readPhotoReference(bare),/no photographic packet/);
const concept=ALL_TANK_IDS.find(id=>firstPartyConcept(id));
assert.equal(stageARoute(concept,{concept:true}),'concept');
assert.equal(stageAPassed('concept',{conceptProof:true}),true);
assert.equal(stageAPassed('concept',{conceptProof:false,photoProof:true}),false,'a photo receipt never passes a concept');
// the photo route passes on its own fresh receipt only
assert.equal(stageAPassed('photo',{photoProof:true}),true);
assert.equal(stageAPassed('photo',{photoProof:false}),false);
assert.equal(stageAPassed('photo',{conceptProof:true}),false);
console.log(`photo qualification: ${PHOTO_REFERENCE_IDS.length} photo ids on ${PACKETS.size} packets, `
  +`explicit per-id packets, packet-named fixtures, unchanged 3% dimensions, fresh physical proof; stage A's photo, concept and `
  +`no-record routes and negative controls PASS`);
