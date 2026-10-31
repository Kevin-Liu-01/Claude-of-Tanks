import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {FIRST_PARTY_CONCEPTS,firstPartyConcept,partitionConceptIds,validateSelectedIds,
  assertNoConceptReferences,conceptEquipmentVerdict,conceptReceiptPassed,conceptDesignPath,conceptDesignReady,conceptDocumentPassed} from './first-party-concept-policy.mjs';
import {roofEquipmentVerdict} from './source-equipment-policy.mjs';
import {sourceOpeningsVerdict} from './source-openings-policy.mjs';
import {readConceptDesign} from './first-party-concept-record.mjs';
import {assertConceptDatums,assertConceptWeapons} from './first-party-concept-datums.mjs';
import {resolveTankId} from '../src/vehicles/tankIdAliases.ts';
const oldPath='docs/references/concepts/missile-turrets-20260919.json';
const typePath='docs/references/concepts/type100-ifv-20260919.json';
const familyPath='docs/references/concepts/ztz20-family-20261027.json';
assert.deepEqual(Object.keys(FIRST_PARTY_CONCEPTS),['ztz99a2_qinglong','vt4a1_baihu','t72b3_zhuque','t72b3m_xuanwu','ztz99_longwei','m6_linebacker','t72b3_zubr_ii','t72b3m_hetman_ii','t80u_zoria','t72b3m_hetman','t72b3_sich','t80u_husarz','t72b3m_wilk','t72b3_zubr','t80u_yun','t72b3m_kunlun','t72b3_qilin','t80u_bars_m','t72b3m_bulat_m','t72b3_bastion_m','type96_72_long','type96_80_feng','type96_72m_lei','t72_rys','object148_proto','carro45t','spz_wotan','cv90','cv90_mk4_concept','raiju_ifv','xk2_black_panther','griffin_viper','c2_ariete','tos1a_tagil','ztz100_prototype','object695','type100','christian2','ztz20','ztz100','ztz20_prototype','pt64_tur','challenger3_td_rws','pt84_orzel','pt84_sokol','pt84_zbik','ee_t3_osorio','ee_t4_osorio']);
assert.equal(conceptDesignPath('ztz100_prototype'),oldPath);
assert.equal(conceptDesignPath('object695'),oldPath);
assert.equal(conceptDesignPath('type100'),typePath);
assert.equal(conceptDesignPath('ztz20'),familyPath); assert.equal(conceptDesignPath('ztz100'),familyPath);
assert.equal(conceptDesignPath('ztz20_prototype'),familyPath);
// the dated documents keep their schema-1 keys; the policy reads them in today's ids
const designIds=(file)=>{const doc=JSON.parse(fs.readFileSync(file));return Object.keys(doc.designs).map(key=>resolveTankId(key,doc.tankIdSchema));};
assert.deepEqual(designIds(oldPath),['ztz100_prototype','object695']);
assert.deepEqual(designIds(typePath),['type100']);
// 262 (owner 2026-10-27): the ZTZ-20, its pre-production ZTZ-100 and its turret testbed share one family record; the
// missile testbed keeps its missile-turret record (amended for the family hull)
assert.deepEqual(designIds(familyPath),['ztz20','ztz100','ztz20_prototype']);
// 262: the ZTZ-100 left the source-comparison route (its oracle measures the ZTZ-20 concept); strv122 stays a comparison
assert.deepEqual(partitionConceptIds(['strv122','ztz100','ztz100_prototype','object695']),{comparisons:['strv122'],concepts:['ztz100','ztz100_prototype','object695']});
for(const id of ['unknown','strv122','toString','__proto__']) {
  assert.equal(firstPartyConcept(id),null);assert.equal(conceptDesignPath(id),null);
  assert.throws(()=>readConceptDesign(id),/no owner-authored/);
}
for(const ids of [[],['unknown'],['object695','object695']])assert.throws(()=>validateSelectedIds(ids,Object.keys(FIRST_PARTY_CONCEPTS)),/known playable/);
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
  assert.equal(sourceOpeningsVerdict({id,scan:{holeCells:0}}).passed,id !== 'c2_ariete');
  assert.equal(sourceOpeningsVerdict({id,scan:{holeCells:1}}).passed,false,'no blanket concept-hole exception');
  const dimension=quality=>({quality,passed:true,fillLoaded:true,bounds:{min:[-design.widthM/2,0,-design.overallLengthM/2],max:[design.widthM/2,design.tallestM,design.overallLengthM/2]}});
  const receipt={id,comparisonPurpose:'owner-authored-concept',comparisonApplicable:false,score:null,passed:true,
    designPath,designSha256:hash,startedAt:new Date(2000).toISOString(),test:{path:design.test,exitCode:0},
    inputSha256Before:'a'.repeat(64),inputSha256After:'a'.repeat(64),dimensions:[dimension('high'),dimension('low')]};
  assert.equal(conceptReceiptPassed(id,receipt,1000,hash),conceptDesignReady(id));
  for(const patch of [{score:99},{id:'strv122'},{comparisonPurpose:'preservation'},{comparisonApplicable:true},
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
  if(design.specDimensions)spec.dims={...design.specDimensions};
  if (design.id==='cv90') {
    spec.gun={shells:[{type:'AP',caliberMm:40,count:180}]};assertConceptDatums(spec,design);
    assert.throws(()=>assertConceptDatums({...spec,dims:{...spec.dims,widthM:8}},design));
    assert.throws(()=>assertConceptWeapons([{guided:true,caliberMm:40,count:1}],design));
    continue;
  }
  if (design.weaponSystem === 'guided-missile-carrier') {
    const shell={guided:true,caliberMm:140,count:64,launcherTubes:16,reloadS:1};
    spec.gun={shells:[shell]};assertConceptDatums(spec,design);
    const rounded=structuredClone(spec);
    rounded.armor.turretPivot[1]-=Number.EPSILON;
    assertConceptDatums(rounded,design);
    for(const delta of [1e-9, .001, .1]) {
      const shifted=structuredClone(spec);shifted.armor.turretPivot[1]+=delta;
      assert.throws(()=>assertConceptDatums(shifted,design), /declared turret ring/);
    }
    for(const point of [[0,NaN,0],[0,Infinity,0],[0],null]) {
      assert.throws(()=>assertConceptDatums({...spec,armor:{...spec.armor,turretPivot:point}},design));
    }

    for(const patch of [{guided:false},{count:0},{count:65},{launcherTubes:15},{reloadS:.5},{caliberMm:120}])
      assert.throws(()=>assertConceptWeapons([{...shell,...patch}],design));
    continue;
  }
  if (design.weaponSystem === 'conventional-cannon') {
    const shell={type:'APFSDS',caliberMm:design.mainCaliberMm,count:24};
    spec.gun={shells:[shell]};
    assertConceptDatums(spec,design);
    const inheritedShells=['APFSDS','HEAT','HE'].map(type=>({type,caliberMm:design.mainCaliberMm}));
    assertConceptDatums({...spec,gun:{shells:inheritedShells}},design);
    assertConceptWeapons([{...shell,count:null}],design);
    for(const patch of [{guided:true},{launcherTubes:1},{caliberMm:design.mainCaliberMm+5},
      {count:0},{count:-1},{count:Infinity},{count:NaN},{count:1.5},{count:'24'}])
      assert.throws(()=>assertConceptWeapons([{...shell,...patch}],design));
    assert.throws(()=>assertConceptWeapons([...inheritedShells,{...shell,count:-1}],design));
    assert.throws(()=>assertConceptWeapons([],design));
    assert.throws(()=>assertConceptWeapons([shell,{...shell,caliberMm:design.mainCaliberMm+5}],design));
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
