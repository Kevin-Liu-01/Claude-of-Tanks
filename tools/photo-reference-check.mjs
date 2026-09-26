// Lock-free child of the standard gate. Reports physical proof and explicitly
// leaves numerical source fidelity unverified; never writes a 3D score receipt.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {Box3} from 'three';
import {createTank} from '../src/vehicles/tankFactory.ts';
import {getSpec,ALL_TANK_IDS} from '../src/vehicles/specs.ts';
import {ensureInteriorFills,hasInteriorFills} from '../src/vehicles/interiorFills.ts';
import {validateSelectedIds} from './first-party-concept-policy.mjs';
import {photoDimensionsPassed} from './photo-reference-policy.mjs';
import {readPhotoReference} from './photo-reference-record.mjs';
const ids=process.argv.find(a=>a.startsWith('--ids='))?.slice(6).split(',')??[];
validateSelectedIds(ids,ALL_TANK_IDS);
const documents=new Map(ids.map(id=>[id,readPhotoReference(id)]));
const output=path.resolve(process.argv.find(a=>a.startsWith('--out='))?.slice(6)??'.qa-dev/reports/photo-references');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function digest(){
  const files=['package.json','package-lock.json',...new Set([...documents.values()].map(d=>d.packetPath))];
  function walk(dir){for(const e of fs.readdirSync(dir,{withFileTypes:true})){
    const file=path.join(dir,e.name);if(e.isDirectory())walk(file);else if(/\.(ts|js|mjs|json|html)$/.test(file))files.push(file);
  }}
  walk('src');walk('tools');return hash(files.sort().map(file=>`${file}:${hash(fs.readFileSync(file))}`).join('\n'));
}
fs.mkdirSync(output,{recursive:true});
const tests=new Map();let failed=false;
for(const id of ids){
  const {target,packetPath,packetSha256}=documents.get(id);
  const report={id,startedAt:new Date().toISOString(),comparisonPurpose:'photographic-reference',numerical3DComparison:'unverified',
    score:null,packetPath,packetSha256,inputSha256Before:digest(),dimensions:[],passed:false};
  try{
    if(!tests.has(target.test)){
      const child=spawnSync(process.execPath,[target.test],{encoding:'utf8'});
      tests.set(target.test,{path:target.test,exitCode:child.status});
      fs.writeFileSync(path.join(output,`${id}.log`),`${child.stdout??''}${child.stderr??''}`);
    }
    report.test=tests.get(target.test);assert.equal(report.test.exitCode,0,'Native configuration/articulation fixture');
    const spec=getSpec(id);assert.equal(spec.gun.caliberMm,target.caliberMm);
    assert.equal(spec.gun.launcherMuzzles?.length??0,target.launcherTubes);
    assert.equal(spec.armor.crew.length,target.crew);
    assert.equal(spec.armor.crew.some(c=>c.turretLocal),!target.unmannedTurret);
    await ensureInteriorFills([id]);assert(hasInteriorFills(id),'Generated interior closure required');
    for(const quality of ['high','low']){
      const tank=createTank(id,null,{quality,proceduralOnly:true,geometryReceipt:true,camoSeed:4242});
      try{
        tank.root.updateMatrixWorld(true);const box=new Box3().setFromObject(tank.root);
        const row={quality,fillLoaded:true,bounds:{min:box.min.toArray(),max:box.max.toArray()}};
        report.dimensions.push(row);assert(photoDimensionsPassed(row,target),`${quality}: exterior dimensions exceed 3%`);
      }finally{tank.dispose();}
    }
    report.inputSha256After=digest();assert.equal(report.inputSha256Before,report.inputSha256After,'Frozen measured inputs');report.passed=true;
  }catch(error){report.error=String(error);report.inputSha256After=digest();failed=true;}
  report.completedAt=new Date().toISOString();fs.writeFileSync(path.join(output,`${id}.json`),JSON.stringify(report,null,2)+'\n');
  console.log(`[photo] ${id}: ${report.passed?'PASS':'FAIL'} physical configuration; numerical 3D comparison UNVERIFIED${report.error?` — ${report.error}`:''}`);
}
if(failed)process.exitCode=1;
