// Lock-free child: tank-standard-check owns its one FIFO lease. No source score.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import * as THREE from 'three';
import '../src/vehicles/tankFactory.ts';
import {ALL_TANK_IDS,TANK_SPECS} from '../src/vehicles/specs.ts';
import {firstPartyConcept,validateSelectedIds,FIRST_PARTY_CONCEPTS,CONCEPT_DESIGN_PATH} from './first-party-concept-policy.mjs';
const ids=process.argv.find(a=>a.startsWith('--ids='))?.slice(6).split(',')??[];
validateSelectedIds(ids,ALL_TANK_IDS);
assert.ok(ids.every(firstPartyConcept),'Only explicitly authored concepts use this gate');
const output=path.resolve(process.argv.find(a=>a.startsWith('--out='))?.slice(6)??'.qa-dev/reports/first-party-concepts');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const designBytes=fs.readFileSync(CONCEPT_DESIGN_PATH),designRecord=JSON.parse(designBytes);
assert.deepEqual(designRecord.designs,FIRST_PARTY_CONCEPTS,'Authored design record and QA contract agree');
assert.equal(designRecord.dimensionToleranceFraction,.03,'Existing dimension tolerance is unchanged');
function runtimeDigest() {
  const files=['package.json','package-lock.json',CONCEPT_DESIGN_PATH];
  function walk(dir) {
    for(const entry of fs.readdirSync(dir,{withFileTypes:true})) {
      const p=path.join(dir,entry.name);
      if(entry.isDirectory())walk(p);
      else if(/\.(?:ts|js|mjs|json|html)$/.test(p))files.push(p);
    }
  }
  walk('src');walk('tools');
  return hash(files.sort().map(p=>`${p}:${hash(fs.readFileSync(p))}`).join('\n'));
}
function assertDatums(spec,design) {
  assert.deepEqual(spec.armor.turretPivot,design.ring,'declared turret ring');
  assert.deepEqual(spec.armor.gunPivot,design.gunLocal,'declared local gun trunnion');
  assert.equal(spec.armor.gunBarrel.lengthM,design.barrelLengthM);
  assert.equal(spec.armor.gunBarrel.radiusM,design.barrelRadiusM);
  assert.equal(spec.dims.hullLengthM,design.hullLengthM,'preserved declared hull length');
  assert.equal(spec.dims.widthM,design.widthM,'declared complete width');
  assert.equal(spec.dims.overallLengthM,design.overallLengthM,'declared complete length');
  assert.equal(spec.gunElevationDeg,design.pitchDeg[1]);
  assert.equal(spec.gunDepressionDeg,-design.pitchDeg[0]);
  assert.ok(spec.gun.shells.some(s=>!s.guided&&s.caliberMm===design.backupCaliberMm),'real backup ammunition caliber');
  const missiles=spec.gun.shells.filter(s=>s.guided);
  assert.ok(missiles.length>0&&missiles.every(s=>s.launcherTubes===design.cells),'all missile modes share the declared cells');
}
async function dimensions(id) {
  const {createTank}=await import('../src/vehicles/tankFactory.ts');
  const {ensureInteriorFills,hasInteriorFills}=await import('../src/vehicles/interiorFills.ts');
  await ensureInteriorFills([id]);assert.ok(hasInteriorFills(id),'Final generated fills must be loaded');
  const design=firstPartyConcept(id);assertDatums(TANK_SPECS[id],design);
  return ['high','low'].map(quality=>{
    const tank=createTank(id,null,{quality,proceduralOnly:true,geometryReceipt:true,camoSeed:4242});
    try {
      tank.root.updateMatrixWorld(true);
      const bounds=new THREE.Box3().setFromObject(tank.root),size=bounds.getSize(new THREE.Vector3());
      assert.ok([...bounds.min.toArray(),...bounds.max.toArray()].every(Number.isFinite),'finite complete geometry');
      const widthError=Math.abs(size.x-design.widthM)/design.widthM;
      const lengthError=Math.abs(size.z-design.overallLengthM)/design.overallLengthM;
      const heightError=Math.abs(bounds.max.y-design.tallestM)/design.tallestM;
      assert.ok(widthError<=.03&&lengthError<=.03&&heightError<=.03,'actual complete design dimensions within3%');
      return {quality,passed:true,fillLoaded:true,bounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},widthError,lengthError,heightError};
    } finally {tank.dispose();}
  });
}
fs.mkdirSync(output,{recursive:true});
let failed=false;
for(const id of ids) {
  const design=firstPartyConcept(id),startedAt=new Date().toISOString(),inputSha256Before=runtimeDigest();
  const child=spawnSync(process.execPath,[design.test],{encoding:'utf8'});
  const log=`${child.stdout??''}${child.stderr??''}`;
  fs.writeFileSync(path.join(output,`${id}.log`),log);
  const report={id,startedAt,comparisonPurpose:'owner-authored-concept',comparisonApplicable:false,score:null,
    designPath:CONCEPT_DESIGN_PATH,designSha256:hash(designBytes),inputSha256Before,
    test:{path:design.test,exitCode:child.status,logSha256:hash(log)},dimensions:[],passed:false};
  try {
    assert.equal(child.status,0,'Actual profile preservation/stock/attachment fixture must pass');
    report.dimensions=await dimensions(id);
    report.inputSha256After=runtimeDigest();assert.equal(report.inputSha256After,inputSha256Before,'Runtime/tool inputs stayed frozen');
    report.passed=true;
  } catch(error) {report.error=String(error);report.inputSha256After=runtimeDigest();failed=true;}
  report.completedAt=new Date().toISOString();
  fs.writeFileSync(path.join(output,`${id}.json`),`${JSON.stringify(report,null,2)}\n`);
  console.log(`[concept] ${id}: ${report.passed?'PASS':'FAIL'} physical design; source comparison N/A${report.error?` — ${report.error}`:''}`);
}
if(failed)process.exitCode=1;
