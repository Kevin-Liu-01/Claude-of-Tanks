import assert from 'node:assert/strict';
import { evaluateFidelityGate } from './geometry-gate-policy.mjs';
const valid = { qualityBar:'exemplar', totalScore:95, wholeScores:{front:96,left:94},
  componentScores:{hull:95,turret:94,gun:93,tracks:94},
  componentViews:{turret:{front:94,rear:92}} };
assert.equal(evaluateFidelityGate(valid).gatePassed,true);
for(const score of [0,89.47,91.99,91.996,NaN]) {
  const result=evaluateFidelityGate({...valid,componentScores:{turret:score}});
  assert.equal(result.gatePassed,false);
  assert.equal(result.failures[0].metric,'component.turret');
}
assert.equal(evaluateFidelityGate({...valid,componentViews:{turret:{left:91}}}).gatePassed,false);
assert.equal(evaluateFidelityGate({...valid,componentScores:{turret:null},componentViews:{turret:null}}).gatePassed,true);
assert.equal(evaluateFidelityGate({...valid,wholeScores:{front:91}}).gatePassed,false);
assert.equal(evaluateFidelityGate({...valid,qualityBar:'fleet',componentScores:{gun:89}}).gatePassed,true);
// Exercise the actual page wiring too: the policy helper is not sufficient
// if a caller quantizes its inputs before invoking it.
const page=await(await import('node:fs/promises')).readFile(new URL('./procedural-fidelity.html',import.meta.url),'utf8');
assert.match(page,/componentScores:rawScores/,'the browser passes unrounded component means');
assert.doesNotMatch(page,/componentScores:scores/,'display scores never feed the gate');
console.log('fidelity-component-floor: exemplar rejects weak valid components, including zero; unavailable source masks remain explicit null');
