import assert from 'node:assert/strict';
import { tankReleaseSteps } from './tank-release-plan.mjs';
const steps=tankReleaseSteps('leo2a7v_x,t14_x',true,'node-test');
const byTool=tool=>steps.find(step=>step.args[0]===`tools/${tool}.mjs`);
assert.deepEqual(steps.map(step=>[step.command,...step.args].join(' ')),[
  'node-test tools/tank-standard-check.mjs --ids=leo2a7v_x,t14_x --gate',
  'node-test tools/procedural-fidelity.mjs --ids=leo2a7v_x,t14_x --check --board --neutral-board',
  'node-test tools/gen-combat-anatomy.mjs --check',
  'node-test tools/presentation-centering.mjs --check --ids=leo2a7v_x,t14_x',
  'node-test tools/module-visual-align-probe.mjs --ids=leo2a7v_x,t14_x --gate',
  'node-test tools/module-hit-probe.mjs --ids=leo2a7v_x,t14_x',
  'node-test tools/tank-assets-check.mjs --ids=leo2a7v_x,t14_x',
  'node-test tools/track-duplicate-audit.mjs --ids=leo2a7v_x,t14_x',
  'node-test tools/muzzle-bore-probe.mjs --ids=leo2a7v_x,t14_x',
  'node-test tools/turret-barrel-circularity.mjs --ids=leo2a7v_x,t14_x',
  'npm test',
  'npm run build:private',
], 'fail-fast ordering retains every existing command, assertion flag and complete ID scope exactly once');
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
assert.equal(byTool('gen-combat-anatomy').capture,true,'fleet construction uses the shared resource queue');
assert.equal(byTool('module-hit-probe').capture,true,'fleet CPU probing uses the shared resource queue');
assert.ok(steps.some(step=>step.command==='npm'&&step.args[0]==='test'));
assert.ok(steps.some(step=>step.command==='npm'&&step.args[1]==='build:private'));
assert.equal(steps.find(step=>step.command==='npm'&&step.args[0]==='test').capture,false,
  'npm selftests own their phase leases; no outer lock');
assert.equal(steps.find(step=>step.command==='npm'&&step.args[1]==='build:private').capture,true,
  'standalone private build uses the shared resource queue');
assert.equal(tankReleaseSteps('m1a2',false).some(step=>step.args[0]==='tools/procedural-fidelity.mjs'),false,
  'non-source release does not require an unavailable reference');
assert.equal(tankReleaseSteps('m1a2',false).length,11,'non-source release retains all other checks');
for(const ids of ['',',','t14_x,'])assert.throws(()=>tankReleaseSteps(ids,true),/nonempty/);
console.log('tank-release-plan: strict fidelity plus geometry, complete scope, CPU phases and nonnested capture locks pass');
