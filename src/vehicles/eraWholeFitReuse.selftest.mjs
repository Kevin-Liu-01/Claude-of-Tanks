import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {registerHooks, stripTypeScriptTypes} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createInvocationEraWholeReuse} from './eraWholeFitReuse.ts';
import {assertWholeReuseContract, digest} from './eraWholeFitReuse.test-support.mjs';
import {installCanvasFixture} from './canvasFixture.test-support.mjs';

assertWholeReuseContract(createInvocationEraWholeReuse);
const sha = s => createHash('sha256').update(s).digest('hex');
const upstream = execFileSync('git', ['show',
  'e8ef757e231ae2792292eb98f1d066fd5815d2df:src/vehicles/tankFactoryCore.ts'], {encoding:'utf8'});
const current = fs.readFileSync(new URL('./tankFactoryCore.ts', import.meta.url), 'utf8');
const fitting = s => s.slice(s.indexOf('  const fittedEraSurfaces = (plate:'),
  s.indexOf('\n  // Preserve the builder', s.indexOf('  const fittedEraSurfaces = (plate:')));
assert.equal(sha(fitting(upstream)), 'c7b1c143893cdab08bd99fbd41c033f25a1fbc1028ac48d088b2e8c503ea0641');
const unwrap = s => s.replace('    return wholeEraFitReuse.fit(parts, sideSuffix, frame, () => {\n', '')
  .replace('    return [...exactSurfaces, ...deduplicateEraSurfaces(surfaces)];\n    });',
    '    return [...exactSurfaces, ...deduplicateEraSurfaces(surfaces)];');
assert.equal(unwrap(fitting(current)), fitting(upstream), 'complete original fitting calculation stays byte-exact');
const collection = s => s.slice(s.indexOf('function createEraSurfaceFrame('), s.indexOf('interface TankPresentationSetup'));
assert.equal(collection(current), collection(upstream), 'unchanged complete frame, collection, PCA and fallback algorithms');
assert.equal(current.split('const wholeEraFitReuse = createInvocationEraWholeReuse();').length, 2);
assert.equal(current.split('try { createTankAssemblyStage30(); } finally { wholeEraFitReuse.close(); }').length, 2);

async function child(reference) {
  const restoreCanvas=installCanvasFixture();
  let served=0, active;
  globalThis.__eraWholeFitCheckpoint = memo => {
    assert.ok(active);
    return {
      fit(parts,side,frame,calculate) {
        const expected=calculate(); let calculations=0;
        const actual=memo.fit(parts,side,frame,()=>{calculations++;return calculate();});
        assert.deepEqual(actual,expected,'every complete production fit, order and coordinate remains exact');
        active.calls++; active.calculations+=calculations;
        active.outputs.push(sha(JSON.stringify(actual)));
        return reference?expected:actual;
      },
      close() {
        active.memo=memo.stats();memo.close();
        assert.equal(memo.stats().retainedPartLists,0);assert.equal(memo.stats().retainedFrames,0);
        assert.equal(memo.stats().closed,true);active.closed=true;
      },
    };
  };
  const hook=registerHooks({load(url,context,next){
    if(url!==new URL('./tankFactoryCore.ts',import.meta.url).href)return next(url,context);
    served++;
    return {format:'module',shortCircuit:true,source:stripTypeScriptTypes(current.replace(
      'const wholeEraFitReuse = createInvocationEraWholeReuse();',
      'const wholeEraFitReuse = globalThis.__eraWholeFitCheckpoint(createInvocationEraWholeReuse());'))};
  }});
  try {
    const {createTank}=await import('./tankFactory.ts');
    const rows=[];
    for(const cycle of [0,1])for(const id of ['m1a2','challenger_3x','challenger2','leo2_revolution','t90m_x'])for(const quality of ['high','low']){
      active={calls:0,calculations:0,outputs:[],closed:false};
      const tank=createTank(id,null,{quality,proceduralOnly:true,materialMode:'geometry-only',camoSeed:4242,decor:true,batchStatic:true});
      try {
        assert.equal(active.closed,true,'memo lifetime ends before returning the native tank');
        assert.ok(tank.root.userData.__decorSummary,'real decoration attachment completes, not a swallowed missing-canvas failure');
        rows.push({id,quality,cycle,...active,content:digest(tank.root),
          decorations:tank.root.userData.__decorSummary,
          eraReceipt:tank.root.userData.eraVisualBindingReceipt});
      }finally{tank.dispose();active=null;}
    }
    assert.equal(served,1);
    for(const id of ['m1a2','challenger_3x'])assert.ok(rows.filter(r=>r.id===id).every(r=>r.memo.hits>0&&r.calculations<r.calls));
    assert.ok(rows.filter(r=>r.id==='challenger2').every(r=>r.calls===0));
    assert.ok(rows.filter(r=>r.id==='t90m_x').every(r=>r.memo.bypasses>0),'actual authored-facet bypass exercised');
    console.log('ERA_WHOLE_NATIVE '+JSON.stringify(rows));
  }finally{hook.deregister();delete globalThis.__eraWholeFitCheckpoint;restoreCanvas();}
}

if(process.argv.includes('--native-child'))await child(process.argv.includes('--reference'));
else{
  const run=reference=>{
    const result=spawnSync(process.execPath,[fileURLToPath(import.meta.url),'--native-child',...(reference?['--reference']:[])],
      {encoding:'utf8',timeout:180000,maxBuffer:16*1024*1024});
    assert.ifError(result.error);assert.equal(result.status,0,result.stderr||result.stdout);
    const line=result.stdout.split('\n').find(s=>s.startsWith('ERA_WHOLE_NATIVE '));assert.ok(line);
    return JSON.parse(line.slice('ERA_WHOLE_NATIVE '.length));
  };
  const before=run(true),after=run(false);
  assert.deepEqual(after,before,'complete original/memo Node scene, instance, material, LOD, fitting and ERA receipts remain equal');
  assert.equal(after.length,20);
  console.log(JSON.stringify({pass:true,nodeBuilds:40,rows:after.map(({outputs,eraReceipt,...r})=>({...r,outputHash:sha(JSON.stringify(outputs)),receiptHash:sha(JSON.stringify(eraReceipt??null))})),
    scope:'Actual Node builds and complete calculation reuse, not rendered pixels or browser/GPU latency'}));
}
