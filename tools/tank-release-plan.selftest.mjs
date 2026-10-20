import assert from 'node:assert/strict';
import { tankReleaseSteps, tankReleaseStages } from './tank-release-plan.mjs';
const steps=tankReleaseSteps('leo2a7v,t14_armata',true,'node-test');
const byTool=tool=>steps.find(step=>step.args[0]===`tools/${tool}.mjs`);
assert.deepEqual(steps.map(step=>[step.command,...step.args].join(' ')),[
  'node-test tools/tank-standard-check.mjs --ids=leo2a7v,t14_armata --gate',
  'node-test tools/tank-sealed-check.mjs --ids=leo2a7v,t14_armata --ledger=docs/geometry-gate/sealed.json --gate',
  'node-test tools/procedural-fidelity.mjs --ids=leo2a7v,t14_armata --check --board --neutral-board',
  'node-test tools/gen-combat-anatomy.mjs --check',
  'node-test tools/fleet-geometry-ledger.mjs --check --ids=leo2a7v,t14_armata',
  'node-test tools/gen-mission-attachment-seats.mjs --check --ids=leo2a7v,t14_armata',
  'node-test tools/presentation-centering.mjs --check --ids=leo2a7v,t14_armata',
  'node-test tools/module-visual-align-probe.mjs --ids=leo2a7v,t14_armata --gate',
  'node-test tools/module-hit-probe.mjs --ids=leo2a7v,t14_armata',
  'node-test tools/spare-track-placement-check.mjs --ids=leo2a7v,t14_armata --ledger=docs/geometry-gate/spare-track.json --gate',
  'node-test tools/vehicle-material-registration.mjs --ids=leo2a7v,t14_armata',
  'node-test tools/gun-junction-census.mjs --ids=leo2a7v,t14_armata --ledger=docs/geometry-gate/gun-junction.json --check --gate',
  'node-test tools/tank-assets-check.mjs --ids=leo2a7v,t14_armata',
  'node-test tools/track-duplicate-audit.mjs --ids=leo2a7v,t14_armata',
  'node-test tools/muzzle-bore-probe.mjs --ids=leo2a7v,t14_armata',
  'node-test tools/turret-barrel-circularity.mjs --ids=leo2a7v,t14_armata',
  'node-test tools/counter-drone-engage.mjs --ids=leo2a7v --check',
  'npm test',
  'npm run build:private',
], 'fail-fast ordering retains every existing command, assertion flag and complete ID scope exactly once');
for(const tool of ['procedural-fidelity','tank-standard-check']) {
  const step=byTool(tool);
  assert.ok(step,`strict release cannot omit ${tool}`);
  assert.equal(step.command,'node-test');
  assert.ok(step.args.includes('--ids=leo2a7v,t14_armata'),'source comparisons retain the entire selected scope');
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
assert.equal(byTool('vehicle-material-registration').capture,true,'the material registration builds through the shared resource queue');
for(const tool of ['fleet-geometry-ledger','gen-mission-attachment-seats']) {
  // 2026-10-11: the closure's ledger and mission-seat receipts gate the release check, scoped to the ids
  assert.deepEqual(byTool(tool).args.slice(1),['--check','--ids=leo2a7v,t14_armata'],`release gates ${tool} on the selected ids`);
  assert.equal(byTool(tool).capture,true,`${tool} builds through the shared resource queue`);
}
assert.ok(steps.some(step=>step.command==='npm'&&step.args[0]==='test'));
assert.ok(steps.some(step=>step.command==='npm'&&step.args[1]==='build:private'));
assert.equal(steps.find(step=>step.command==='npm'&&step.args[0]==='test').capture,false,
  'npm selftests own their phase leases; no outer lock');
assert.equal(steps.find(step=>step.command==='npm'&&step.args[1]==='build:private').capture,true,
  'standalone private build uses the shared resource queue');
assert.equal(tankReleaseSteps('m1a1_abrams_hc',false).some(step=>step.args[0]==='tools/procedural-fidelity.mjs'),false,
  'non-source release does not require an unavailable reference');
assert.equal(tankReleaseSteps('m1a1_abrams_hc',false).length,17,'non-source release retains all other checks (2026-09-13: + the sealed-hull ledger check; 2026-10-11: + ledger and mission-seat checks; 2026-10-15: + the spare-track ledger; 2026-10-17: + the material registration; 2026-10-18: + the gun-junction ledger)');
// guards 229: the counter-drone step only for a release naming a pinned vehicle, on those ids, CPU only (no capture lease)
assert.equal(byTool('counter-drone-engage').capture,false,'the counter-drone pilot runs build no geometry: no capture lease');
assert.deepEqual(tankReleaseSteps('m1a1,t14_armata,leclerc_xlr',false,'n').find(step=>step.args[0]==='tools/counter-drone-engage.mjs').args,
  ['tools/counter-drone-engage.mjs','--ids=m1a1,leclerc_xlr','--check'],'it re-flies the pinned vehicles the release names');
assert.equal(tankReleaseSteps('t14_armata',false).some(step=>step.args[0]==='tools/counter-drone-engage.mjs'),false,'a release naming none skips it');
{
  const { COUNTER_DRONE_PINS } = await import('../src/sim/counterDroneStations.test-support.mjs');
  const { COUNTER_DRONE_PINNED_IDS } = await import('./tank-release-plan.mjs');
  assert.deepEqual([...COUNTER_DRONE_PINNED_IDS].sort(),Object.keys(COUNTER_DRONE_PINS.runs).sort(),'the release plan names exactly the pinned vehicles');
}
for(const ids of ['',',','t14_armata,'])assert.throws(()=>tankReleaseSteps(ids,true),/nonempty/);
// Fast checks (2026-09-15): the same steps, staged — serial browser scoring first, then every
// remaining probe beside the receipt suite and the build, four at a time.
const stages=tankReleaseStages('leo2a7v,t14_armata',true,'node-test');
assert.deepEqual(stages.map(stage=>[stage.name,stage.concurrency,stage.steps.length]),
  [['scoring',1,3],['fleet probes, receipts and build',4,16]]);
assert.deepEqual(stages[0].steps.map(step=>step.args[0]),
  ['tools/tank-standard-check.mjs','tools/tank-sealed-check.mjs','tools/procedural-fidelity.mjs'],
  'the load-sensitive scoring stays serial and first');
assert.deepEqual(stages.flatMap(stage=>stage.steps),steps,'staging reorders nothing and drops nothing');
assert.ok(stages[1].steps.some(step=>step.command==='npm'&&step.args[0]==='test'));
assert.ok(stages[1].steps.some(step=>step.command==='npm'&&step.args[1]==='build:private'));
const plain=tankReleaseStages('m1a1_abrams_hc',false,'node-test');
assert.deepEqual(plain.map(stage=>stage.steps.length),[2,15],'without a reference the scoring stage has no fidelity step');
console.log('tank-release-plan: strict fidelity plus geometry, complete scope, CPU phases, nonnested capture locks and staged concurrency pass');

const concept=tankReleaseSteps('ztz100_prototype,object695',true,'node-test');
assert.equal(concept.some(s=>s.args[0]==='tools/procedural-fidelity.mjs'),false,'obsolete comparisons are not run');
assert.equal(concept.length,17,'every other mandatory release step remains');
for(const step of concept.filter(s=>s.args[0]?.startsWith('tools/')&&s.args.some(a=>a.startsWith('--ids=')))) {
  assert.ok(step.args.includes('--ids=ztz100_prototype,object695'),'all physical checks retain both concepts');
}
for(const name of ['tank-standard-check','tank-sealed-check'])assert.ok(concept.find(s=>s.args[0]===`tools/${name}.mjs`).args.includes('--gate'));
const mixed=tankReleaseSteps('ztz100,ztz100_prototype,object695',true,'node-test');
assert.deepEqual(mixed.find(s=>s.args[0]==='tools/procedural-fidelity.mjs').args,
 ['tools/procedural-fidelity.mjs','--ids=ztz100','--check','--board','--neutral-board']);
assert.throws(()=>tankReleaseSteps('unknown_x',true),/known playable/,'unknown IDs cannot obtain N/A qualification');

const type100=tankReleaseSteps('type100',true,'node-test');
assert.equal(type100.some(step=>step.args[0]==='tools/procedural-fidelity.mjs'),false);
assert.equal(type100.length,17,'Type100 retains every physical/anatomy/assets/test/build release step');
for(const step of type100.filter(step=>step.args.some(arg=>arg.startsWith('--ids='))))
  assert.ok(step.args.includes('--ids=type100'));
const allConcepts=tankReleaseSteps('type100,object695,ztz100_prototype,ztz100',true,'node-test');
assert.deepEqual(allConcepts.find(step=>step.args[0]==='tools/procedural-fidelity.mjs').args,
  ['tools/procedural-fidelity.mjs','--ids=ztz100','--check','--board','--neutral-board']);
