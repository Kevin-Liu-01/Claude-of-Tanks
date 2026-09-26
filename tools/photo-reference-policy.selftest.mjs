import assert from 'node:assert/strict';
import {readPhotoReference} from './photo-reference-record.mjs';
import {PHOTO_REFERENCE_IDS,photoTarget,photoReceiptPassed} from './photo-reference-policy.mjs';
import {roofEquipmentVerdict} from './source-equipment-policy.mjs';
import {tankReleaseSteps} from './tank-release-plan.mjs';
import {sourceOpeningsVerdict} from './source-openings-policy.mjs';
for(const id of ['unknown','spz_puma_s1_x','type89_x','__proto__'])assert.throws(()=>readPhotoReference(id));
for(const id of PHOTO_REFERENCE_IDS){
  const doc=readPhotoReference(id),{target,packet,packetSha256,packetPath}=doc;
  const dimensions=['high','low'].map(quality=>({quality,fillLoaded:true,
    bounds:{min:[-target.widthM/2,0,-target.overallLengthM/2],max:[target.widthM/2,target.tallestM,target.overallLengthM/2]}}));
  const report={id,passed:true,comparisonPurpose:'photographic-reference',numerical3DComparison:'unverified',score:null,
    packetSha256,packetPath,startedAt:new Date(2000).toISOString(),test:{path:target.test,exitCode:0},
    inputSha256Before:'a'.repeat(64),inputSha256After:'a'.repeat(64),dimensions};
  assert(photoReceiptPassed(id,report,packet,packetSha256,1000));
  for(const patch of [{score:95},{numerical3DComparison:'passed'},{passed:false},{packetSha256:'b'.repeat(64)},
    {id:'type89_x'},{startedAt:new Date(0).toISOString()},{inputSha256After:'c'.repeat(64)},
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
  assert.equal(roofEquipmentVerdict(id,{...census,mg:1},config,receipt).passed,false);
  assert.equal(sourceOpeningsVerdict({id,scan:{holeCells:1}}).passed,false,'photo targets cannot waive unexplained holes');
  const steps=tankReleaseSteps(id,true,'node');
  assert.equal(steps.length,12,'all physical, anatomy, test and build steps retained');
  assert.equal(steps.some(step=>step.args[0]==='tools/procedural-fidelity.mjs'),false,'do not fabricate 3D scores');
}
const mixed=tankReleaseSteps('cv90_x,spz_puma_s1_x,type89_x,borsuk',true,'node');
assert(mixed.find(step=>step.args[0]==='tools/procedural-fidelity.mjs').args.includes('--ids=spz_puma_s1_x,type89_x'));
console.log('photo qualification: explicit membership, unchanged 3% dimensions, fresh physical proof, unverified 3D scores and negative controls PASS');
