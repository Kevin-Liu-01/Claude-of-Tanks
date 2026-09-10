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
assert.equal(beforeHash,'a7cb2366ce25ac6c6e3ff9c9d78ad7bf4c8fa2a6b0f6211ef9d92e6391d127f6',
  'Original full-profile historical bytes are not rebased to the current fitting');
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
const rejectMutation=(from,to,label)=>{
  assert.ok(source.includes(from),`${label}: rejecting control must change the actual source`);
  const bad=source.replace(from,to);assert.notEqual(bad,source);
  assert.throws(()=>authenticate('merkava4_x',{source:bad}),label);rejected++;
};
rejectMutation('[-1.6645,-.733,.27,2.017]','[-1.6645,-.732,.27,2.017]','Mk4 runtime station drift');
assert.throws(()=>authenticate('merkava4_x',{readHelper:file=>readHelper(file)+(file==='merkavaXReturnRollers.ts'?'\n':'')}));rejected++;
assert.throws(()=>authenticate('merkava4_x',{readHelper:file=>readHelper(file)+(file==='../upperReturnBandStock.ts'?'\n':'')}));rejected++;
rejectMutation('],.0038);','],.0039);','Lining depth drift');
rejectMutation('[-1.8821825,-.8756825,.9765675,1.8323175]',
  '[-1.8811825,-.8756825,.9765675,1.8323175]','Mk3 runtime station drift');
rejectMutation('lineMerkavaXUpperBand(P,[-1.6645,-.733,.27,2.017],.0038);',
  'lineMerkavaXUpperBand(P,[-1.6645,-.732,.27,2.017],.0038);','Independent lining station drift');
rejectMutation('[-1.8821825,-.8756825,.9765675,1.8323175]',
  '[-2.10,-.82,.92,2.38]','Old Mk3 intersecting stations cannot replace the repaired call');
rejectMutation('[-1.6645,-.733,.27,2.017]',
  '[-2.02,-.73,.78,2.30]','Old Mk4 intersecting stations cannot replace the repaired call');
for(const [comment,other]of[
  ['    // Inferred supports occupy existing axle gaps at full suspension stroke.\n','    topY:1.105'],
  ['    // Existing road axles stay fixed; supports sit between their swept wheels.\n','    topY:1.230'],
]){
  rejectMutation(comment,'','Missing support comment');
  rejectMutation(comment,comment.replace('supports','rollers'),'Changed support comment');
  rejectMutation(comment,comment+comment,'Duplicate support comment');
  const moved=source.replace(comment,'').replace(other,comment+other);
  assert.notEqual(moved,source);assert.throws(()=>authenticate('merkava4_x',{source:moved}),
    'Support comment cannot move to the sibling gear seam');rejected++;
}
rejectMutation('wheelR:.371,wheelW:.38,wheelY:.446','wheelR:.371,wheelW:.38,wheelY:.447',
  'Unrelated road-axle geometry drift');
console.log(JSON.stringify({pass:true,owners:present.map(s=>s.id),negativeControls:rejected,historicalSingleSeamFailures,
  scope:'Test-only exact additive seams and immutable helper bytes; no physical result is inverted.'}));
