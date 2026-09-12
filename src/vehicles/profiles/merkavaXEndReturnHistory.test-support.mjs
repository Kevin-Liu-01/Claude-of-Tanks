// Test-only composition of two separately qualified additive bodywork seams.
// Neither sibling is an inverse for physical geometry or a refreshed golden.
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';

export const MERKAVA_END_RETURN_BEFORE_SHA256 =
  'a7cb2366ce25ac6c6e3ff9c9d78ad7bf4c8fa2a6b0f6211ef9d92e6391d127f6';
export const MERKAVA_END_RETURN_SEAMS = Object.freeze([
  Object.freeze({id:'merkava3d_x',symbol:'addMerkava3dXFrontReturns',file:'merkava3dXFrontReturn.ts',
    sha256:'31f87c0c11deb1fc86f5fa1ffede512494f2cf2fec0e0e1a555626889c3c5479'}),
  Object.freeze({id:'merkava4_x',symbol:'addMerkava4XEndReturns',file:'merkava4XEndReturns.ts',
    sha256:'28c6b33721161a0c601b1e561a58c635e6d0c242b4be45a7fce6a67ba66da39d'}),
]);
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const count=(source,part)=>source.split(part).length-1;
const read=file=>fs.readFileSync(new URL(file,import.meta.url),'utf8');

function beforeRollers(source,readHelper){
  const imported="import { merkavaXReturnRollers, lineMerkavaXUpperBand } from './merkavaXReturnRollers.ts';\n";
  if(!source.includes('merkavaXReturnRollers'))return source;
  assert.equal(count(source,'merkavaXReturnRollers'),4,'One roller import path/symbol and two exact calls');
  assert.equal(count(source,imported),1,'One exact roller helper import');
  assert.equal(hash(readHelper('merkavaXReturnRollers.ts')),
    '75afb5ab186d62ebb2a5ece37071b2298f855f865831f3c50891da19c0069df2','Complete reviewed roller helper');
  assert.equal(hash(readHelper('../upperReturnBandStock.ts')),
    '3de12aa98490a81195866eb36baf263f54fc73e7d3866e6466ee3cdce69629ea','Complete reviewed closed upper stock leaf');
  const lining='  lineMerkavaXUpperBand(P,[-1.6645,-.733,.27,2.017],.0038);\n';
  assert.equal(count(source,'lineMerkavaXUpperBand'),2,'Only one import and one native lining call');
  assert.equal(count(source,lining+'  merkava4HullDetails(P);'),1,'Lining stays at its immutable Mk4 gear seam');
  let before=source.replace(imported,'');
  before=before.replace(lining,'');
  const prefix='P.gear=KIT.buildRunningGear(P,merkavaXReturnRollers(P,{';
  assert.equal(count(before,prefix),2,'Only the two known gear calls');
  before=before.replaceAll(prefix,'P.gear=KIT.buildRunningGear(P,{');
  // a6a3c8570 changes only the qualified support stations and their comments.
  // Authenticate each complete tail before recovering the immutable old call;
  // do not normalize arbitrary comments, geometry inputs or station drift.
  for(const [comment,tail,suffix] of[
    ['    // Inferred supports occupy existing axle gaps at full suspension stroke.\n',
      '    topY:1.230,botY:.0976,paintedEnds:true,arms:true,coveredTop:true',
      '},[-1.8821825,-.8756825,.9765675,1.8323175],1.075,.25,.0027));'],
    ['    // Existing road axles stay fixed; supports sit between their swept wheels.\n',
      '    topY:1.105,botY:.0956,paintedEnds:true,arms:true,coveredTop:true',
      '},[-1.6645,-.733,.27,2.017],.945,.29,.0063,true));'],
  ]){
    assert.equal(count(before,comment),1,'One exact support comment');
    assert.equal(count(before,comment+tail+suffix),1,'Support comment stays at its own immutable gear seam');
    assert.equal(count(before,suffix),1,'Exact independently tested station/seat seam');
    before=before.replace(comment+tail+suffix,tail+'});');
  }
  return before;
}

function beforePaintedBasketFloor(source,readHelper){
  // 2026-09-11 fleet paint standard: the Mk4 basket floor carries camouflage
  // through the material-only painted-detail bucket. Authenticate the exact
  // helper import and the single migrated put() call, then recover the
  // immutable original line; no geometry, station or other drift is normalized.
  const imported="import {markFixedPaintedPanel} from './fixedPaintedPanel.ts';\n";
  if(!source.includes('markFixedPaintedPanel'))return source;
  assert.equal(count(source,'markFixedPaintedPanel'),2,'One painted-panel import and one exact floor call');
  assert.equal(count(source,imported),1,'One exact painted-panel helper import');
  assert.equal(hash(readHelper('fixedPaintedPanel.ts')),
    'd9a7bbdc298b5ae6833078d422bc64535830e5675687dadb8beb5e39bdc8492f','Complete reviewed painted-panel helper');
  const painted="  put('turretPaintedDetail',markFixedPaintedPanel(box(1.882,.009,.601),'merkava4-x-basket-floor','turretDetail'),.022,1.8225,-3.3205);\n";
  const original="  put('turretDetail',box(1.882,.009,.601),.022,1.8225,-3.3205);\n";
  assert.equal(count(source,painted),1,'Only the one known basket-floor put() is migrated');
  assert.equal(count(source,original),0,'The original floor line is not duplicated');
  return source.replace(imported,'').replace(painted,original);
}

export function authenticateMerkavaEndReturnHistory(requiredId, {
  source=read('merkavaX.ts'), readHelper=read,
}={}) {
  assert.ok(MERKAVA_END_RETURN_SEAMS.some(s=>s.id===requiredId),'Known physical test owner');
  let before=beforeRollers(beforePaintedBasketFloor(source,readHelper),readHelper);
  const present=[];
  for(const s of MERKAVA_END_RETURN_SEAMS){
    const imported=`import { ${s.symbol} } from './${s.file}';\n`;
    const anchor=`  addMerkavaXShoulderReturns(P, '${s.id}');\n`;
    const call=`  ${s.symbol}(P);\n`;
    const occurrences=count(source,s.symbol);
    if(occurrences===0){
      assert.notEqual(s.id,requiredId,'The physical test owner must actually be emitted');
      continue;
    }
    assert.equal(occurrences,2,`${s.id}: exactly one import and one call`);
    assert.equal(count(source,imported),1,`${s.id}: exact single import`);
    assert.equal(count(source,anchor+call),1,`${s.id}: call at its own immutable builder seam`);
    assert.equal(hash(readHelper(s.file)),s.sha256,`${s.id}: entire independently reviewed helper`);
    before=before.replace(imported,'').replace(anchor+call,anchor);
    present.push(s.id);
  }
  assert.equal(hash(before),MERKAVA_END_RETURN_BEFORE_SHA256,
    'Complete original shared profile: no other source change is normalized');
  return Object.freeze({beforeSha256:MERKAVA_END_RETURN_BEFORE_SHA256,present:Object.freeze(present)});
}
