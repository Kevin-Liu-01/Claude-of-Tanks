import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tankReleaseArgs, tankReleaseInvocation, tankReleaseLabel, tankReleasePlanLines, tankReleaseSteps, tankReleaseStages } from './tank-release-plan.mjs';
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
  'node-test tools/tank-assets-check.mjs --ids=leo2a7v,t14_armata',
  'node-test tools/track-duplicate-audit.mjs --ids=leo2a7v,t14_armata',
  'node-test tools/muzzle-bore-probe.mjs --ids=leo2a7v,t14_armata',
  'node-test tools/turret-barrel-circularity.mjs --ids=leo2a7v,t14_armata',
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
assert.equal(tankReleaseSteps('m1a1_abrams_hc',false).length,15,'non-source release retains all other checks (2026-09-13: + the sealed-hull ledger check; 2026-10-11: + ledger and mission-seat checks; 2026-10-15: + the spare-track ledger)');
for(const ids of ['',',','t14_armata,'])assert.throws(()=>tankReleaseSteps(ids,true),/nonempty/);
// Fast checks (2026-09-15): the same steps, staged — serial browser scoring first, then every
// remaining probe beside the receipt suite and the build, four at a time.
const stages=tankReleaseStages('leo2a7v,t14_armata',true,'node-test');
assert.deepEqual(stages.map(stage=>[stage.name,stage.concurrency,stage.steps.length]),
  [['scoring',1,3],['fleet probes, receipts and build',4,13]]);
assert.deepEqual(stages[0].steps.map(step=>step.args[0]),
  ['tools/tank-standard-check.mjs','tools/tank-sealed-check.mjs','tools/procedural-fidelity.mjs'],
  'the load-sensitive scoring stays serial and first');
assert.deepEqual(stages.flatMap(stage=>stage.steps),steps,'staging reorders nothing and drops nothing');
assert.ok(stages[1].steps.some(step=>step.command==='npm'&&step.args[0]==='test'));
assert.ok(stages[1].steps.some(step=>step.command==='npm'&&step.args[1]==='build:private'));
const plain=tankReleaseStages('m1a1_abrams_hc',false,'node-test');
assert.deepEqual(plain.map(stage=>stage.steps.length),[2,13],'without a reference the scoring stage has no fidelity step');
console.log('tank-release-plan: strict fidelity plus geometry, complete scope, CPU phases, nonnested capture locks and staged concurrency pass');

// Lane mode (2026-10-16, test-speed R8e): a lane landing runs only the per-id steps. The embedded
// `npm test` and `npm run build:private` stay in the integrator mode (asserted above, unchanged);
// the anatomy freshness check is scoped to the ids; nothing else differs by a byte.
const lane=tankReleaseSteps('leo2a7v,t14_armata',true,'node-test',{lane:true});
const anatomyIndex=steps.indexOf(byTool('gen-combat-anatomy'));
assert.deepEqual(lane,steps.filter(step=>step.command!=='npm').map((step,index)=>index===anatomyIndex
  ?{...step,args:[...step.args,'--ids=leo2a7v,t14_armata']}:step),
  'lane mode = the integrator steps without npm test and build:private, the anatomy check scoped to the ids');
assert.deepEqual(lane.find(step=>step.args[0]==='tools/gen-combat-anatomy.mjs').args,
  ['tools/gen-combat-anatomy.mjs','--check','--ids=leo2a7v,t14_armata'],'the lane anatomy check measures the selected ids');
assert.equal(lane.some(step=>step.command==='npm'),false,'lane mode embeds neither the suite nor the build');
for(const step of lane){
  assert.equal(step.command,'node-test',`lane step ${step.args[0]} is a node tool`);
  assert.ok(step.args.some(arg=>arg.startsWith('--ids=')),`lane step ${step.args[0]} is scoped to the selected ids`);
}
assert.deepEqual(tankReleaseSteps('leo2a7v,t14_armata',true,'node-test',{}),steps,'the integrator mode is the default');
assert.deepEqual(tankReleaseSteps('leo2a7v,t14_armata',true,'node-test',{lane:false}),steps);
assert.deepEqual(tankReleaseSteps('m1a1_abrams_hc',false,'node-test',{lane:true}).map(step=>step.args[0]),
  tankReleaseSteps('m1a1_abrams_hc',false,'node-test').filter(step=>step.command!=='npm').map(step=>step.args[0]),
  'without --gate or a reference, lane mode still keeps every per-id step');
const laneStages=tankReleaseStages('leo2a7v,t14_armata',true,'node-test',{lane:true});
assert.deepEqual(laneStages.map(stage=>[stage.name,stage.concurrency,stage.steps.length]),[['scoring',1,3],['per-id probes',4,11]]);
assert.deepEqual(laneStages.flatMap(stage=>stage.steps),lane,'lane staging reorders nothing and drops nothing');
assert.deepEqual(tankReleaseStages('leo2a7v,t14_armata',true,'node-test',{lane:false}),stages,'integrator staging unchanged');
// The command line: --lane alone selects lane mode; --ids= and --tanks= spell the ids.
assert.deepEqual(tankReleaseArgs(['--ids=a,b','--gate','--lane']),{ids:'a,b',gate:true,lane:true,dryRun:false});
assert.deepEqual(tankReleaseArgs(['--tanks=a','--dry-run']),{ids:'a',gate:false,lane:false,dryRun:true});
assert.deepEqual(tankReleaseArgs(['--gate']),{ids:null,gate:true,lane:false,dryRun:false});
for(const flag of ['--lane=0','--lanes','-lane','lane'])assert.equal(tankReleaseArgs(['--ids=a',flag]).lane,false,`${flag} is not lane mode`);
// What the CLI prints and runs, in process (a spawned CLI would widen this receipt's inputs to the repository).
const laneRun=tankReleaseInvocation(['--ids=leo2a7v,t14_armata','--gate','--lane','--dry-run'],'node-test');
assert.equal(laneRun.header,'lane mode --gate: leo2a7v,t14_armata');
assert.deepEqual(laneRun.stages,laneStages,'the lane CLI runs the per-id stages');
assert.deepEqual(laneRun.notes,[
  'npm test and npm run build:private NOT RUN (lane mode; the release gate runs both)',
  'combat anatomy re-measured for leo2a7v,t14_armata only; every other row is compared as committed (the integrator mode re-measures the fleet)',
],'lane output never implies a suite, build or fleet-wide anatomy pass');
assert.equal(laneRun.dryRun,true);
const fullRun=tankReleaseInvocation(['--ids=leo2a7v,t14_armata','--gate'],'node-test');
assert.equal(fullRun.header,'integrator mode --gate: leo2a7v,t14_armata');
assert.deepEqual(fullRun.stages,stages,'the integrator CLI runs every step, the suite and the build');
assert.deepEqual(fullRun.notes,[],'the integrator mode skips nothing');
assert.equal(fullRun.dryRun,false);
assert.match(tankReleaseInvocation(['--lane','--dry-run']).usage ?? '',/^usage: .*--ids=a,b \[--gate\] \[--lane\] \[--dry-run\]$/,'ids stay mandatory');
assert.deepEqual(tankReleasePlanLines(laneRun).filter(line=>line.startsWith('  ')),lane.map(step=>`  ${tankReleaseLabel(step)}`),
  '--dry-run prints every lane step');
assert.deepEqual(tankReleasePlanLines(fullRun).filter(line=>line.startsWith('[tank-release] stage ')),
  ['[tank-release] stage "scoring": 3 step(s), 1 at a time','[tank-release] stage "fleet probes, receipts and build": 13 step(s), 4 at a time']);
// The CLI is a shell over tankReleaseInvocation: it reads its decision from there, runs only its stages and
// prints its notes before the run and after a PASS.
const cli=readFileSync(new URL('./tank-release-check.mjs',import.meta.url),'utf8');
assert.match(cli,/const release = tankReleaseInvocation\(process\.argv\.slice\(2\)\);/,'the CLI takes every decision from the plan');
assert.match(cli,/for\(const stage of release\.stages\)await runStage\(stage\);/,'the CLI runs exactly the planned stages');
assert.doesNotMatch(cli,/tankReleaseSteps|tankReleaseStages|tankReleaseArgs|process\.argv\.(?:find|includes|some)/,'no second, unplanned composition or flag parse');
assert.match(cli,/console\.log\(`\[tank-release\] \$\{release\.header\}`\);\nprintNotes\(\);\nif \(release\.dryRun\)/,'the notes precede the run and the dry run');
assert.match(cli,/PASS \(\$\{mode\} mode\)[^\n]*\n\s*printNotes\(\);/,'a lane PASS repeats the notes');
console.log('tank-release-plan: lane mode runs exactly the per-id steps; the integrator mode keeps npm test and build:private; command line and CLI wiring pass');

const concept=tankReleaseSteps('ztz100_prototype,object695',true,'node-test');
assert.equal(concept.some(s=>s.args[0]==='tools/procedural-fidelity.mjs'),false,'obsolete comparisons are not run');
assert.equal(concept.length,15,'every other mandatory release step remains');
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
assert.equal(type100.length,15,'Type100 retains every physical/anatomy/assets/test/build release step');
for(const step of type100.filter(step=>step.args.some(arg=>arg.startsWith('--ids='))))
  assert.ok(step.args.includes('--ids=type100'));
const allConcepts=tankReleaseSteps('type100,object695,ztz100_prototype,ztz100',true,'node-test');
assert.deepEqual(allConcepts.find(step=>step.args[0]==='tools/procedural-fidelity.mjs').args,
  ['tools/procedural-fidelity.mjs','--ids=ztz100','--check','--board','--neutral-board']);
