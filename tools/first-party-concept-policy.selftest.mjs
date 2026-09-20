import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {FIRST_PARTY_CONCEPTS,firstPartyConcept,partitionConceptIds,validateSelectedIds,
  assertNoConceptReferences,conceptEquipmentVerdict,conceptReceiptPassed,CONCEPT_DESIGN_PATH} from './first-party-concept-policy.mjs';
import {roofEquipmentVerdict} from './source-equipment-policy.mjs';
import {sourceOpeningsVerdict} from './source-openings-policy.mjs';
const bytes=fs.readFileSync(CONCEPT_DESIGN_PATH),record=JSON.parse(bytes),hash=createHash('sha256').update(bytes).digest('hex');
assert.deepEqual(record.designs,FIRST_PARTY_CONCEPTS);
assert.deepEqual(Object.keys(FIRST_PARTY_CONCEPTS),['ztz100_prototype','object695_x']);
assert.deepEqual(partitionConceptIds(['ztz100_x','ztz100_prototype','object695_x']),{comparisons:['ztz100_x'],concepts:['ztz100_prototype','object695_x']});
for(const id of ['unknown','ztz100_x','toString','__proto__'])assert.equal(firstPartyConcept(id),null);
for(const ids of [[],['unknown'],['object695_x','object695_x']])assert.throws(()=>validateSelectedIds(ids,Object.keys(FIRST_PARTY_CONCEPTS)),/known playable/);
for(const id of Object.keys(FIRST_PARTY_CONCEPTS)) {
  const design=firstPartyConcept(id);
  assert.throws(()=>assertNoConceptReferences({[id]:{source:'glb'}}),/retired comparison/);
  assertNoConceptReferences({[id]:{source:'procedural'}});
  assert.equal(roofEquipmentVerdict(id,{mg:0,invalidWeaponMarkers:0},undefined).passed,true);
  assert.equal(roofEquipmentVerdict(id,{mg:0,invalidWeaponMarkers:0},{id}).passed,false,'obsolete source grant cannot win');
  for(const census of [null,{}, {mg:0,invalidWeaponMarkers:1},{mg:1,invalidWeaponMarkers:0},{mg:NaN,invalidWeaponMarkers:0}]) {
    assert.equal(conceptEquipmentVerdict(id,census).passed,false,'exact census stays physical');
  }
  assert.equal(sourceOpeningsVerdict({id,scan:{holeCells:0}}).passed,true);
  assert.equal(sourceOpeningsVerdict({id,scan:{holeCells:1}}).passed,false,'no blanket concept-hole exception');
  const dimension=quality=>({quality,passed:true,fillLoaded:true,bounds:{min:[-design.widthM/2,0,-design.overallLengthM/2],max:[design.widthM/2,design.tallestM,design.overallLengthM/2]}});
  const receipt={id,comparisonPurpose:'owner-authored-concept',comparisonApplicable:false,score:null,passed:true,
    designSha256:hash,startedAt:new Date(2000).toISOString(),test:{path:design.test,exitCode:0},
    inputSha256Before:'a'.repeat(64),inputSha256After:'a'.repeat(64),dimensions:[dimension('high'),dimension('low')]};
  assert.equal(conceptReceiptPassed(id,receipt,1000,hash),true);
  for(const patch of [{score:99},{id:'ztz100_x'},{comparisonPurpose:'preservation'},{comparisonApplicable:true},
    {passed:false},{designSha256:'b'.repeat(64)},{startedAt:new Date(0).toISOString()},
    {test:{path:design.test,exitCode:1}},{test:{path:'wrong',exitCode:0}},
    {inputSha256After:'c'.repeat(64)},
    {dimensions:[{...dimension('high'),fillLoaded:false},dimension('low')]},
    {dimensions:[{...dimension('high'),bounds:{min:[0,0,0],max:[100,100,100]}},dimension('low')]},{dimensions:[{quality:'high',passed:true}]},
    {dimensions:[{quality:'high',passed:true},{quality:'low',passed:false}]}]) {
    assert.equal(conceptReceiptPassed(id,{...receipt,...patch},1000,hash),false,JSON.stringify(patch));
  }
  assert.equal(conceptReceiptPassed(id,{geoMin:100,gatePassed:true,qualityBar:'preservation'},0,hash),false,'old comparison cannot satisfy physical proof');
}
assert.equal(roofEquipmentVerdict('legacy',{mg:0,invalidWeaponMarkers:0}).passed,false,'default physical roof requirement remains');
console.log('first-party-concept-policy: exact authorization, fresh physical receipts, stale/unknown/source negatives PASS');
