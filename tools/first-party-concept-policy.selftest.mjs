import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {FIRST_PARTY_CONCEPTS,firstPartyConcept,partitionConceptIds,validateSelectedIds,
  assertNoConceptReferences,conceptEquipmentVerdict,conceptReceiptPassed,conceptDesignPath,conceptDesignReady,conceptDocumentPassed} from './first-party-concept-policy.mjs';
import {roofEquipmentVerdict} from './source-equipment-policy.mjs';
import {sourceOpeningsVerdict} from './source-openings-policy.mjs';
import {readConceptDesign} from './first-party-concept-record.mjs';
import {assertConceptDatums,assertConceptWeapons} from './first-party-concept-datums.mjs';
const oldPath='docs/references/concepts/missile-turrets-20260919.json';
const typePath='docs/references/concepts/type100-ifv-20260919.json';
assert.deepEqual(Object.keys(FIRST_PARTY_CONCEPTS),['k2','griffin_viper','ariete_c2_x','tos1a_tagil','ztz100_prototype','object695_x','type100']);
assert.equal(conceptDesignPath('ztz100_prototype'),oldPath);
assert.equal(conceptDesignPath('object695_x'),oldPath);
assert.equal(conceptDesignPath('type100'),typePath);
assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(oldPath)).designs),['ztz100_prototype','object695_x']);
assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(typePath)).designs),['type100']);
assert.deepEqual(partitionConceptIds(['ztz100_x','ztz100_prototype','object695_x']),{comparisons:['ztz100_x'],concepts:['ztz100_prototype','object695_x']});
for(const id of ['unknown','ztz100_x','toString','__proto__']) {
  assert.equal(firstPartyConcept(id),null);assert.equal(conceptDesignPath(id),null);
  assert.throws(()=>readConceptDesign(id),/no owner-authored/);
}
for(const ids of [[],['unknown'],['object695_x','object695_x']])assert.throws(()=>validateSelectedIds(ids,Object.keys(FIRST_PARTY_CONCEPTS)),/known playable/);
for(const id of Object.keys(FIRST_PARTY_CONCEPTS)) {
  const design=firstPartyConcept(id),designPath=conceptDesignPath(id);
  const bytes=fs.readFileSync(designPath),record=JSON.parse(bytes),hash=createHash('sha256').update(bytes).digest('hex');
  assert.equal(conceptDocumentPassed(id,record),true);
  assert.deepEqual(readConceptDesign(id),{designPath,designSha256:hash});
  const other=fs.readFileSync(designPath===oldPath?typePath:oldPath);
  assert.throws(()=>readConceptDesign(id,()=>other),/membership or contract/,'wrong approval document cannot authorize an ID');
  for(const patch of [{schemaVersion:2},{dimensionToleranceFraction:.04},{comparisonApplicable:true},
    {sourceScore:99},{designs:{...record.designs,unknown:design}},
    {designs:{...record.designs,[id]:{...design,cells:design.cells+1}}}])
    assert.equal(conceptDocumentPassed(id,{...record,...patch}),false,'exact document authority remains fail-closed');
  assert.throws(()=>assertNoConceptReferences({[id]:{source:'glb'}}),/retired comparison/);
  assertNoConceptReferences({[id]:{source:'procedural'}});
  assert.equal(roofEquipmentVerdict(id,{mg:design.roofMachineGuns,invalidWeaponMarkers:0},undefined).passed,true);
  assert.equal(roofEquipmentVerdict(id,{mg:0,invalidWeaponMarkers:0},{id}).passed,false,'obsolete source grant cannot win');
  for(const census of [null,{}, {mg:0,invalidWeaponMarkers:1},{mg:design.roofMachineGuns+1,invalidWeaponMarkers:0},{mg:NaN,invalidWeaponMarkers:0}]) {
    assert.equal(conceptEquipmentVerdict(id,census).passed,false,'exact census stays physical');
  }
  // C2 retains the C1 tow-coupler air. A zero-cell scan without its complete
  // measured rear-stock receipt must not authorize filling that opening.
  assert.equal(sourceOpeningsVerdict({id,scan:{holeCells:0}}).passed,id !== 'ariete_c2_x');
  assert.equal(sourceOpeningsVerdict({id,scan:{holeCells:1}}).passed,false,'no blanket concept-hole exception');
  const dimension=quality=>({quality,passed:true,fillLoaded:true,bounds:{min:[-design.widthM/2,0,-design.overallLengthM/2],max:[design.widthM/2,design.tallestM,design.overallLengthM/2]}});
  const receipt={id,comparisonPurpose:'owner-authored-concept',comparisonApplicable:false,score:null,passed:true,
    designPath,designSha256:hash,startedAt:new Date(2000).toISOString(),test:{path:design.test,exitCode:0},
    inputSha256Before:'a'.repeat(64),inputSha256After:'a'.repeat(64),dimensions:[dimension('high'),dimension('low')]};
  assert.equal(conceptReceiptPassed(id,receipt,1000,hash),conceptDesignReady(id));
  for(const patch of [{score:99},{id:'ztz100_x'},{comparisonPurpose:'preservation'},{comparisonApplicable:true},
    {passed:false},{designPath:'wrong'},{designPath:designPath===oldPath?typePath:oldPath},{designSha256:'b'.repeat(64)},{startedAt:new Date(0).toISOString()},
    {test:{path:design.test,exitCode:1}},{test:{path:'wrong',exitCode:0}},
    {inputSha256After:'c'.repeat(64)},
    {dimensions:[{...dimension('high'),fillLoaded:false},dimension('low')]},
    {dimensions:[{...dimension('high'),bounds:{min:[0,0,0],max:[100,100,100]}},dimension('low')]},{dimensions:[{quality:'high',passed:true}]},
    {dimensions:[{quality:'high',passed:true},{quality:'low',passed:false}]}]) {
    assert.equal(conceptReceiptPassed(id,{...receipt,...patch},1000,hash),false,JSON.stringify(patch));
  }
  const spec={armor:{turretPivot:design.ring,gunPivot:design.gunLocal,gunBarrel:{lengthM:design.barrelLengthM,radiusM:design.barrelRadiusM}},
    dims:{hullLengthM:design.hullLengthM,widthM:design.widthM,overallLengthM:design.overallLengthM},
    gunElevationDeg:design.pitchDeg[1],gunDepressionDeg:-design.pitchDeg[0],
    gun:{shells:[{caliberMm:design.mainCaliberMm??design.backupCaliberMm,count:180},
      {guided:true,launcherTubes:design.cells,count:design.guidedAmmoTotal??12}]}};
  if (design.weaponSystem === 'guided-missile-carrier') {
    const shell={guided:true,caliberMm:140,count:64,launcherTubes:16,reloadS:1};
    spec.gun={shells:[shell]};assertConceptDatums(spec,design);
    for(const patch of [{guided:false},{count:0},{count:65},{launcherTubes:15},{reloadS:.5},{caliberMm:120}])
      assert.throws(()=>assertConceptWeapons([{...shell,...patch}],design));
    continue;
  }
  if (design.weaponSystem === 'conventional-cannon') {
    const shell={type:'APFSDS',caliberMm:120,count:24};
    spec.gun={shells:[shell]};
    assertConceptDatums(spec,design);
    const inheritedShells=['APFSDS','HEAT','HE'].map(type=>({type,caliberMm:120}));
    assertConceptDatums({...spec,gun:{shells:inheritedShells}},design);
    assertConceptWeapons([{...shell,count:null}],design);
    for(const patch of [{guided:true},{launcherTubes:1},{caliberMm:125},
      {count:0},{count:-1},{count:Infinity},{count:NaN},{count:1.5},{count:'24'}])
      assert.throws(()=>assertConceptWeapons([{...shell,...patch}],design));
    assert.throws(()=>assertConceptWeapons([...inheritedShells,{...shell,count:-1}],design));
    assert.throws(()=>assertConceptWeapons([],design));
    assert.throws(()=>assertConceptWeapons([shell,{...shell,caliberMm:125}],design));
    assert.throws(()=>assertConceptDatums({...spec,gunElevationDeg:21},design));
    continue;
  }
  if (design.weaponSystem === 'unguided-rocket-battery') {
    const shell={type:'HE',caliberMm:220,count:72,launcherTubes:24};
    spec.gun={shells:[shell],fixedLaunchCanisters:true,launcherMuzzles:Array.from({length:24},(_,i)=>({x:i,y:0,z:2.6})),autoloader:{magazineSize:24,intraClipS:.25,fullReloadS:48}};
    assertConceptDatums(spec,design);
    for(const patch of [{guided:true},{count:73},{launcherTubes:23},{type:'AP'},{caliberMm:125}])
      assert.throws(()=>assertConceptWeapons([{...shell,...patch}],design));
    assert.throws(()=>assertConceptWeapons([],design));
    assert.throws(()=>assertConceptDatums({...spec,gun:{...spec.gun,launcherMuzzles:Array(24).fill({x:0,y:0,z:2.6})}},design));
    assert.throws(()=>assertConceptDatums({...spec,gun:{...spec.gun,autoloader:{magazineSize:24,intraClipS:.20,fullReloadS:48}}},design));
    continue;
  }
  assertConceptWeapons(spec.gun.shells,design);
  for(const shells of [[],[{caliberMm:125},spec.gun.shells[1]], [spec.gun.shells[0]],
    [spec.gun.shells[0],{...spec.gun.shells[1],launcherTubes:design.cells+1}]])
    assert.throws(()=>assertConceptWeapons(shells,design));
  if(design.guidedAmmoTotal!==undefined)for(const count of [0,9,NaN,2.5])
    assert.throws(()=>assertConceptWeapons([spec.gun.shells[0],{...spec.gun.shells[1],count}],design));
  if(conceptDesignReady(id))assertConceptDatums(spec,design);
  else assert.throws(()=>assertConceptDatums(spec,design),/pending measurement/);
  assert.equal(conceptReceiptPassed(id,{geoMin:100,gatePassed:true,qualityBar:'preservation'},0,hash),false,'old comparison cannot satisfy physical proof');
}
assert.equal(roofEquipmentVerdict('legacy',{mg:0,invalidWeaponMarkers:0}).passed,false,'default physical roof requirement remains');
console.log('first-party-concept-policy: exact authorization, fresh physical receipts, stale/unknown/source negatives PASS');
