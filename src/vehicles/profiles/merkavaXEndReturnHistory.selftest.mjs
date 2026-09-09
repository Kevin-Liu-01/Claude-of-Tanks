import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import {authenticateMerkavaEndReturnHistory as authenticate,
  MERKAVA_END_RETURN_SEAMS as seams,
  MERKAVA_END_RETURN_BEFORE_SHA256 as beforeHash} from './merkavaXEndReturnHistory.test-support.mjs';

const source=fs.readFileSync(new URL('./merkavaX.ts',import.meta.url),'utf8');
const readHelper=file=>fs.readFileSync(new URL(file,import.meta.url),'utf8');
const imported=s=>`import { ${s.symbol} } from './${s.file}';\n`;
const anchor=s=>`  addMerkavaXShoulderReturns(P, '${s.id}');\n`;
const call=s=>`  ${s.symbol}(P);\n`;
const remove=(value,s)=>value.replace(imported(s),'').replace(anchor(s)+call(s),anchor(s));
const present=seams.filter(s=>source.includes(imported(s)));
assert.ok(present.length>0);
let rejected=0,historicalSingleSeamFailures=0;
for(const s of present){
  const proof=authenticate(s.id);
  assert.deepEqual(proof.present,present.map(p=>p.id));
  // Independent single-sibling and combined forms retain the same old hash.
  const single=seams.filter(p=>p.id!==s.id).reduce(remove,source);
  assert.deepEqual(authenticate(s.id,{source:single}).present,[s.id]);
  if(present.length===2){
    assert.notEqual(crypto.createHash('sha256').update(remove(source,s)).digest('hex'),beforeHash,
      'Original one-sibling normalization remains a failing witness on the composed profile');
    historicalSingleSeamFailures++;
  }
  const other=seams.find(p=>p.id!==s.id);
  for(const bad of[
    source+'// unauthorized whole-profile change\n',
    source.replace(imported(s),''),
    source.replace(imported(s),imported(s)+imported(s)),
    source.replace(call(s),''),
    source.replace(call(s),call(s)+call(s)),
    source.replace(anchor(s)+call(s),anchor(s)).replace(anchor(other),anchor(other)+call(s)),
    source.replace(anchor(s)+call(s),call(s)+anchor(s)),
  ]){
    assert.throws(()=>authenticate(s.id,{source:bad}));rejected++;
  }
  assert.throws(()=>authenticate(s.id,{readHelper:file=>readHelper(file)+(file===s.file?'\n':'')}));rejected++;
  assert.throws(()=>authenticate(s.id,{source:remove(source,s)}));rejected++;
}
assert.throws(()=>authenticate('merkava4'));rejected++;
console.log(JSON.stringify({pass:true,owners:present.map(s=>s.id),negativeControls:rejected,historicalSingleSeamFailures,
  scope:'Test-only exact additive seams and immutable helper bytes; no physical result is inverted.'}));
