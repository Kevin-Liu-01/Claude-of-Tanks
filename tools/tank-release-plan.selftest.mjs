import assert from 'node:assert/strict';
import { tankReleaseSteps } from './tank-release-plan.mjs';
const steps=tankReleaseSteps('leo2a7v_x,t14_x',true,'node-test');
const byTool=tool=>steps.find(step=>step.args[0]===`tools/${tool}.mjs`);
for(const tool of ['procedural-fidelity','tank-standard-check']) {
  const step=byTool(tool);
  assert.ok(step,`strict release cannot omit ${tool}`);
  assert.equal(step.command,'node-test');
  assert.ok(step.args.includes('--ids=leo2a7v_x,t14_x'),'source comparisons retain the entire selected scope');
}
assert.ok(byTool('procedural-fidelity').args.includes('--check'));
assert.ok(byTool('procedural-fidelity').args.includes('--board'));
assert.ok(byTool('procedural-fidelity').args.includes('--neutral-board'),
  'strict source release retains fresh equal-material visual/articulation evidence after scoring');
assert.equal(byTool('procedural-fidelity').capture,true);
assert.ok(byTool('tank-standard-check').args.includes('--gate'));
assert.equal(byTool('tank-standard-check').capture,false,'standard children acquire their own phase locks');
assert.equal(byTool('module-hit-probe').capture,false);
assert.ok(steps.some(step=>step.command==='npm'&&step.args[0]==='test'));
assert.ok(steps.some(step=>step.command==='npm'&&step.args[1]==='build:private'));
assert.equal(tankReleaseSteps('m1a2',false).some(step=>step.args[0]==='tools/procedural-fidelity.mjs'),false,
  'non-source release does not require an unavailable reference');
for(const ids of ['',',','t14_x,'])assert.throws(()=>tankReleaseSteps(ids,true),/nonempty/);
console.log('tank-release-plan: strict fidelity plus geometry, complete scope, CPU phases and nonnested capture locks pass');
