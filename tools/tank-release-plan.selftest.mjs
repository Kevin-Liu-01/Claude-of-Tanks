import assert from 'node:assert/strict';
import { tankReleaseSteps, tankReleaseStages } from './tank-release-plan.mjs';
const steps=tankReleaseSteps('leo2a7v_x,t14_x',true,'node-test');
const byTool=tool=>steps.find(step=>step.args[0]===`tools/${tool}.mjs`);
assert.deepEqual(steps.map(step=>[step.command,...step.args].join(' ')),[
  'node-test tools/tank-standard-check.mjs --ids=leo2a7v_x,t14_x --gate',
  'node-test tools/tank-sealed-check.mjs --ids=leo2a7v_x,t14_x --ledger=docs/geometry-gate/sealed.json --gate',
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
assert.equal(tankReleaseSteps('m1a2',false).length,12,'non-source release retains all other checks (2026-09-13: + the sealed-hull ledger check)');
for(const ids of ['',',','t14_x,'])assert.throws(()=>tankReleaseSteps(ids,true),/nonempty/);
// Fast checks (2026-09-15): the same steps, staged — serial browser scoring first, then every
// remaining probe beside the receipt suite and the build, four at a time.
const stages=tankReleaseStages('leo2a7v_x,t14_x',true,'node-test');
assert.deepEqual(stages.map(stage=>[stage.name,stage.concurrency,stage.steps.length]),
  [['scoring',1,3],['fleet probes, receipts and build',4,10]]);
assert.deepEqual(stages[0].steps.map(step=>step.args[0]),
  ['tools/tank-standard-check.mjs','tools/tank-sealed-check.mjs','tools/procedural-fidelity.mjs'],
  'the load-sensitive scoring stays serial and first');
assert.deepEqual(stages.flatMap(stage=>stage.steps),steps,'staging reorders nothing and drops nothing');
assert.ok(stages[1].steps.some(step=>step.command==='npm'&&step.args[0]==='test'));
assert.ok(stages[1].steps.some(step=>step.command==='npm'&&step.args[1]==='build:private'));
const plain=tankReleaseStages('m1a2',false,'node-test');
assert.deepEqual(plain.map(stage=>stage.steps.length),[2,10],'without a reference the scoring stage has no fidelity step');
console.log('tank-release-plan: strict fidelity plus geometry, complete scope, CPU phases, nonnested capture locks and staged concurrency pass');

const concept=tankReleaseSteps('ztz100_prototype,object695_x',true,'node-test');
assert.equal(concept.some(s=>s.args[0]==='tools/procedural-fidelity.mjs'),false,'obsolete comparisons are not run');
assert.equal(concept.length,12,'every other mandatory release step remains');
for(const step of concept.filter(s=>s.args[0]?.startsWith('tools/')&&s.args.some(a=>a.startsWith('--ids=')))) {
  assert.ok(step.args.includes('--ids=ztz100_prototype,object695_x'),'all physical checks retain both concepts');
}
for(const name of ['tank-standard-check','tank-sealed-check'])assert.ok(concept.find(s=>s.args[0]===`tools/${name}.mjs`).args.includes('--gate'));
const mixed=tankReleaseSteps('ztz100_x,ztz100_prototype,object695_x',true,'node-test');
assert.deepEqual(mixed.find(s=>s.args[0]==='tools/procedural-fidelity.mjs').args,
 ['tools/procedural-fidelity.mjs','--ids=ztz100_x','--check','--board','--neutral-board']);
assert.throws(()=>tankReleaseSteps('unknown_x',true),/known playable/,'unknown IDs cannot obtain N/A qualification');
