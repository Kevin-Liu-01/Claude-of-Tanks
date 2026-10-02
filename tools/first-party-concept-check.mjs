// Lock-free child: tank-standard-check owns its one FIFO lease. No source score.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import * as THREE from 'three';
import {createConceptFixtureRunner,createConceptInputGuard} from './concept-fixture-runner.mjs';
const ids=process.argv.find(a=>a.startsWith('--ids='))?.slice(6).split(',')??[];
const output=path.resolve(process.argv.find(a=>a.startsWith('--out='))?.slice(6)??'.qa-dev/reports/first-party-concepts');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function runtimeDigest() {
  const files=['package.json','package-lock.json'];
  function walk(dir) {
    for(const entry of fs.readdirSync(dir,{withFileTypes:true})) {
      const p=path.join(dir,entry.name);
      if(entry.isDirectory())walk(p);
      else if(/\.(?:ts|js|mjs|json|html)$/.test(p))files.push(p);
    }
  }
  walk('src');walk('tools');walk('docs/references/concepts');
  return hash(files.sort().map(p=>`${p}:${hash(fs.readFileSync(p))}`).join('\n'));
}
// Freeze before loading any runtime, policy or owner document. Node caches these
// modules, so a later digest must never qualify an earlier in-memory revision.
const inputs=createConceptInputGuard(runtimeDigest);
await import('../src/vehicles/tankFactory.ts');
const {ALL_TANK_IDS,TANK_SPECS}=await import('../src/vehicles/specs.ts');
const {firstPartyConcept,validateSelectedIds}=await import('./first-party-concept-policy.mjs');
const {readConceptDesign}=await import('./first-party-concept-record.mjs');
const {assertConceptDatums}=await import('./first-party-concept-datums.mjs');
validateSelectedIds(ids,ALL_TANK_IDS);
assert.ok(ids.every(firstPartyConcept),'Only explicitly authored concepts use this gate');
const documents=new Map(ids.map(id=>[id,readConceptDesign(id)]));
inputs.assertCurrent();
async function dimensions(id) {
  const {createTank}=await import('../src/vehicles/tankFactory.ts');
  const {ensureInteriorFills,hasInteriorFills}=await import('../src/vehicles/interiorFills.ts');
  await ensureInteriorFills([id]);assert.ok(hasInteriorFills(id),'Final generated fills must be loaded');
  const design=firstPartyConcept(id);assertConceptDatums(TANK_SPECS[id],design);
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
const runFixture=createConceptFixtureRunner(
  test=>spawnSync(process.execPath,[test],{encoding:'utf8'}),runtimeDigest);
let failed=false;
for(const id of ids) {
  const design=firstPartyConcept(id),startedAt=new Date().toISOString(),inputSha256Before=inputs.assertCurrent();
  const child=runFixture(design.test,inputSha256Before);
  const log=`${child.stdout??''}${child.stderr??''}`;
  fs.writeFileSync(path.join(output,`${id}.log`),log);
  const report={id,startedAt,comparisonPurpose:'owner-authored-concept',comparisonApplicable:false,score:null,
    ...documents.get(id),inputSha256Before,
    test:{path:design.test,exitCode:child.status,logSha256:hash(log),
      invocation:child.invocation,reused:child.reused},dimensions:[],passed:false};
  try {
    assert.equal(child.status,0,'Actual profile preservation/stock/attachment fixture must pass');
    assert.ok(child.inputsStable,'Runtime/tool inputs stayed frozen during fixture execution');
    report.dimensions=await dimensions(id);
    report.inputSha256After=inputs.assertCurrent();
    report.passed=true;
  } catch(error) {report.error=String(error);report.inputSha256After=runtimeDigest();failed=true;}
  report.completedAt=new Date().toISOString();
  fs.writeFileSync(path.join(output,`${id}.json`),`${JSON.stringify(report,null,2)}\n`);
  console.log(`[concept] ${id}: ${report.passed?'PASS':'FAIL'} physical design; source comparison N/A${report.error?` — ${report.error}`:''}`);
}
if(failed)process.exitCode=1;
