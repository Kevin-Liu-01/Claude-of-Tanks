import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { TANK_RELEASE_LANE_NOTE, runTankRelease, tankReleaseArgs, tankReleaseInvocation, tankReleaseLabel, tankReleasePlanLines,
  tankReleaseSteps, tankReleaseStages } from './tank-release-plan.mjs';
const steps=tankReleaseSteps('leo2a7v,t14_armata',true,'node-test');
const byTool=tool=>steps.find(step=>step.args[0]===`tools/${tool}.mjs`);
assert.deepEqual(steps.map(step=>[step.command,...step.args].join(' ')),[
  'node-test tools/tank-standard-check.mjs --ids=leo2a7v,t14_armata --gate --stages',
  'node-test tools/tank-sealed-check.mjs --ids=leo2a7v,t14_armata --ledger=docs/geometry-gate/sealed.json --gate',
  'node-test tools/procedural-fidelity.mjs --ids=leo2a7v,t14_armata --check --board --neutral-board',
  'node-test tools/gen-combat-anatomy.mjs --check --ids=leo2a7v,t14_armata',
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
  'node-test tools/test-heavy.mjs tanks --ids=leo2a7v,t14_armata',
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
// 2026-10-16 (test-speed R4b): the release reports every standard stage, so a red geometry gate cannot hide B2-B4.
assert.ok(byTool('tank-standard-check').args.includes('--stages'));
assert.ok(tankReleaseSteps('m1a1_abrams_hc',false,'node-test')[0].args.includes('--stages'),'with or without --gate');
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
assert.equal(tankReleaseSteps('m1a1_abrams_hc',false).length,18,'non-source release retains all other checks (2026-09-13: + the sealed-hull ledger check; 2026-10-11: + ledger and mission-seat checks; 2026-10-15: + the spare-track ledger; 2026-10-17: + the material registration; 2026-10-18: + the gun-junction ledger; 266: + the id-scoped tanks receipts)');
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
  [['scoring',1,3],['fleet probes, receipts and build',4,17]]);
assert.deepEqual(stages[0].steps.map(step=>step.args[0]),
  ['tools/tank-standard-check.mjs','tools/tank-sealed-check.mjs','tools/procedural-fidelity.mjs'],
  'the load-sensitive scoring stays serial and first');
assert.deepEqual(stages.flatMap(stage=>stage.steps),steps,'staging reorders nothing and drops nothing');
assert.ok(stages[1].steps.some(step=>step.command==='npm'&&step.args[0]==='test'));
assert.ok(stages[1].steps.some(step=>step.command==='npm'&&step.args[1]==='build:private'));
const plain=tankReleaseStages('m1a1_abrams_hc',false,'node-test');
assert.deepEqual(plain.map(stage=>stage.steps.length),[2,16],'without a reference the scoring stage has no fidelity step');
console.log('tank-release-plan: strict fidelity plus geometry, complete scope, CPU phases, nonnested capture locks and staged concurrency pass');

// Lane mode (2026-10-16, test-speed R8e): a lane landing skips exactly the embedded `npm test` and
// `npm run build:private`. Every other step is the integrator mode's byte for byte. Since 266 every step is per id:
// the fleet-wide combat-anatomy check is the manual `fleet` suite's command (a shared-builder edit that could stale
// other tanks' rows is "the shared fleet core changed" in npm run test:recommend; the owner triggers the suite).
const lane=tankReleaseSteps('leo2a7v,t14_armata',true,'node-test',{lane:true});
const withoutNpm=list=>list.filter(step=>step.command!=='npm');
assert.deepEqual(lane,withoutNpm(steps),'lane mode = the integrator steps minus npm test and build:private, nothing else');
assert.deepEqual(steps.map(tankReleaseLabel).filter(label=>!lane.map(tankReleaseLabel).includes(label)),['npm test','npm run build:private'],
  'lane mode drops exactly the suite and the private build');
assert.deepEqual(lane.find(step=>step.args[0]==='tools/gen-combat-anatomy.mjs').args,['tools/gen-combat-anatomy.mjs','--check','--ids=leo2a7v,t14_armata'],
  'the lane anatomy freshness check is scoped to the ids');
for(const [gate,laneFlag] of [[true,false],[false,false],[true,true],[false,true]]){
  const plan=tankReleaseSteps('m1a1_abrams_hc',gate,'node-test',{lane:laneFlag});
  const anatomy=plan.find(step=>step.args[0]==='tools/gen-combat-anatomy.mjs');
  assert.deepEqual(anatomy.args,['tools/gen-combat-anatomy.mjs','--check','--ids=m1a1_abrams_hc'],`gate=${gate} lane=${laneFlag}: the anatomy check is per id`);
  assert.deepEqual(plan.find(step=>step.args[0]==='tools/test-heavy.mjs').args,['tools/test-heavy.mjs','tanks','--ids=m1a1_abrams_hc'],
    `gate=${gate} lane=${laneFlag}: the id-scoped tanks receipts of the ids`);
}
{
  // the fleet-wide anatomy check lives on as the manual fleet suite's command, and no step runs a whole manual suite
  const { MANUAL_SUITES } = await import('./selftest-tiers.mjs');
  assert.ok(MANUAL_SUITES.fleet.commands.some(command=>command.join(' ')==='node tools/gen-combat-anatomy.mjs --check'));
  assert.ok(steps.every(step=>step.args[0]!=='tools/test-heavy.mjs'||(step.args[1]==='tanks'&&step.args[2].startsWith('--ids='))),
    'tank:release:check runs only the id-scoped tanks form of the manual tier');
}
assert.deepEqual(tankReleaseSteps('leo2a7v,t14_armata',true,'node-test',{}),steps,'the integrator mode is the default');
assert.deepEqual(tankReleaseSteps('leo2a7v,t14_armata',true,'node-test',{lane:false}),steps);
assert.deepEqual(tankReleaseSteps('m1a1_abrams_hc',false,'node-test',{lane:true}),withoutNpm(tankReleaseSteps('m1a1_abrams_hc',false,'node-test')),
  'without --gate or a reference, lane mode still keeps every other step');
const laneStages=tankReleaseStages('leo2a7v,t14_armata',true,'node-test',{lane:true});
assert.deepEqual(laneStages.map(stage=>[stage.name,stage.concurrency,stage.steps.length]),[['scoring',1,3],['fleet probes',4,15]]); // the integrator stage's 17 less npm test and build:private
assert.deepEqual(laneStages.flatMap(stage=>stage.steps),lane,'lane staging reorders nothing and drops nothing');
assert.deepEqual(tankReleaseStages('leo2a7v,t14_armata',true,'node-test',{lane:false}),stages,'integrator staging unchanged');

// The command line: --lane alone selects lane mode; --ids= and --tanks= spell the ids.
assert.deepEqual(tankReleaseArgs(['--ids=a,b','--gate','--lane']),{ids:'a,b',gate:true,lane:true,dryRun:false});
assert.deepEqual(tankReleaseArgs(['--tanks=a','--dry-run']),{ids:'a',gate:false,lane:false,dryRun:true});
assert.deepEqual(tankReleaseArgs(['--gate']),{ids:null,gate:true,lane:false,dryRun:false});
for(const flag of ['--lane=0','--lanes','-lane','lane'])assert.equal(tankReleaseArgs(['--ids=a',flag]).lane,false,`${flag} is not lane mode`);
const LANE_NOTE='npm test and npm run build:private NOT RUN (lane mode): the integrator mode runs both; '
  +'the release gate runs the default receipt tier and npm run build (the same vite build and localized pages, plus the public strip)';
assert.equal(TANK_RELEASE_LANE_NOTE,LANE_NOTE);
// Every flag combination: mode, header, notes and stages follow --lane and --gate alone.
for(const gate of [false,true])for(const laneFlag of [false,true]){
  const argv=['--ids=m1a1_abrams_hc',...(gate?['--gate']:[]),...(laneFlag?['--lane']:[])];
  const invocation=tankReleaseInvocation(argv,'node-test');
  const tag=argv.join(' ');
  assert.equal(invocation.mode,laneFlag?'lane':'integrator',tag);
  assert.equal(invocation.header,`${laneFlag?'lane':'integrator'} mode${gate?' --gate':''}: m1a1_abrams_hc`,tag);
  assert.deepEqual(invocation.notes,laneFlag?[LANE_NOTE]:[],`${tag}: a lane run always says what it skipped; the integrator run skips nothing`);
  assert.deepEqual(invocation.stages,tankReleaseStages('m1a1_abrams_hc',gate,'node-test',{lane:laneFlag}),tag);
  const npm=invocation.stages.flatMap(stage=>stage.steps).filter(step=>step.command==='npm').map(tankReleaseLabel);
  assert.deepEqual(npm,laneFlag?[]:['npm test','npm run build:private'],`${tag}: the suite and the private build run exactly in the integrator mode`);
}
const laneRun=tankReleaseInvocation(['--ids=leo2a7v,t14_armata','--gate','--lane','--dry-run'],'node-test');
assert.deepEqual(laneRun.stages,laneStages,'the lane CLI runs the lane stages');
assert.equal(laneRun.dryRun,true);
const fullRun=tankReleaseInvocation(['--ids=leo2a7v,t14_armata','--gate'],'node-test');
assert.deepEqual(fullRun.stages,stages,'the integrator CLI runs every step, the suite and the build');
assert.equal(fullRun.dryRun,false);
assert.match(tankReleaseInvocation(['--lane','--dry-run']).usage ?? '',/^usage: .*--ids=a,b \[--gate\] \[--lane\] \[--dry-run\]$/,'ids stay mandatory');
assert.deepEqual(tankReleasePlanLines(laneRun).filter(line=>line.startsWith('  ')),lane.map(step=>`  ${tankReleaseLabel(step)}`),
  '--dry-run prints every lane step');
assert.deepEqual(tankReleasePlanLines(fullRun).filter(line=>line.startsWith('[tank-release] stage ')),
  ['[tank-release] stage "scoring": 3 step(s), 1 at a time','[tank-release] stage "fleet probes, receipts and build": 17 step(s), 4 at a time']);

// The note's claims, pinned where they live. The gate (tools/gate.mjs) runs the default receipt tier and `npm run build`;
// `npm run build` runs build:private's commands with the same prebuild, then the public strip and provenance.
// The two differ only by VITE_PUBLIC_BUILD=1, a key no source read on 2026-10-16 (docs/DEVELOPMENT.md "Fast checks").
const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
assert.equal(pkg.scripts['tank:release:check'],'node tools/tank-release-check.mjs');
assert.ok(pkg.scripts.build.startsWith(`VITE_PUBLIC_BUILD=1 ${pkg.scripts['build:private']} && `),
  `npm run build runs build:private's commands first (build: ${pkg.scripts.build}; build:private: ${pkg.scripts['build:private']})`);
for(const hook of ['pre','post'])assert.equal(pkg.scripts[`${hook}build`],pkg.scripts[`${hook}build:private`],`the ${hook}build hooks match`);
const gateSource=readFileSync(new URL('./gate.mjs',import.meta.url),'utf8');
assert.match(gateSource,/GATE_STEPS = Object\.freeze\(\[[^\]]*'build'[^\]]*'receipts'[^\]]*\]\)/,'the gate runs the build and the receipts');
assert.match(gateSource,/if \(step === 'build'\) return \{ step, commands: \[\[npm, 'run', 'build'\]\]/,'the gate build is npm run build');
assert.match(gateSource,/if \(step === 'receipts'\) \{\s*return \{ step, commands: \[\['node', 'tools\/run-selftests\.mjs', 'all'/,'the gate receipts are every receipt');
assert.equal(pkg.scripts.test,'node tools/run-selftests.mjs all','npm test is the default-tier run');

// The CLI is exactly runTankRelease plus the spawning runners and the exit status: any other statement fails here.
const cliSource=readFileSync(new URL('./tank-release-check.mjs',import.meta.url),'utf8');
const cliCode=cliSource.split('\n').map(line=>line.trim()).filter(line=>line&&!line.startsWith('//')&&!line.startsWith('#!'));
assert.deepEqual(cliCode,[
  "import { runCommand, runCapturedCommand } from './capture-command.mjs';",
  "import { runTankRelease } from './tank-release-plan.mjs';",
  'const status = await runTankRelease(process.argv.slice(2), { runCommand, runCapturedCommand });',
  'if (status) process.exit(status);',
],'the CLI holds no logic of its own');
assert.match(readFileSync(new URL('./capture-command.mjs',import.meta.url),'utf8'),
  /reject\(Object\.assign\(new Error\(`\$\{command\} exited \$\{code \?\? signal\}`\),\{status:code \?\? 128\}\)\)/,
  'a failed child rejects with its exit status, which runTankRelease returns');

// runTankRelease with fake children: the real control flow, output order, failure reporting and exit status.
async function fakeRelease(argv,{fail={},slow=false}={}){
  const out=[],calls=[];
  let inFlight=0,maxInFlight=0;
  const child=capture=>async(command,args)=>{
    const label=tankReleaseLabel({command,args});
    inFlight++; maxInFlight=Math.max(maxInFlight,inFlight);
    calls.push({label,capture,inFlight});
    try{
      if(slow)await new Promise(resolve=>setTimeout(resolve,1));
      if(label in fail)throw Object.assign(new Error(`${command} exited ${fail[label]}`),{status:fail[label]});
    }finally{inFlight--;}
  };
  let tick=0;
  const status=await runTankRelease(argv,{node:'node-test',runCommand:child(false),runCapturedCommand:child(true),
    log:line=>out.push(['log',line]),error:line=>out.push(['error',line]),now:()=>(tick+=1000)});
  return {status,out,calls,maxInFlight,text:out.map(([,line])=>line).join('\n')};
}
const laneArgv=['--ids=leo2a7v,t14_armata','--gate','--lane'];
const lanePass=await fakeRelease(laneArgv,{slow:true});
assert.equal(lanePass.status,0,'a passing lane run exits 0');
assert.deepEqual(lanePass.calls.map(call=>call.label),lane.map(tankReleaseLabel),'a lane run starts every lane step once, in plan order');
assert.deepEqual(lanePass.calls.map(call=>call.capture),lane.map(step=>step.capture),'each step runs through the runner its capture flag names');
assert.equal(lanePass.calls.some(call=>call.label.startsWith('npm ')),false,'a lane run never starts npm test or the build');
assert.equal(lanePass.maxInFlight,4,'the probes stage runs four at a time');
assert.deepEqual(lanePass.calls.slice(0,4).map(call=>call.inFlight),[1,1,1,1],
  'the scoring steps run one at a time, and the probes start only after the scoring stage finished');
const laneLines=lanePass.out.map(([,line])=>line.trim());
assert.equal(laneLines[0],'[tank-release] lane mode --gate: leo2a7v,t14_armata');
assert.equal(laneLines[1],`[tank-release] ${LANE_NOTE}`,'the note precedes the run');
const passIndex=laneLines.findIndex(line=>line.startsWith('[tank-release] PASS'));
assert.match(laneLines[passIndex],/^\[tank-release\] PASS \(lane mode\) leo2a7v,t14_armata \(\d+\.\d min\)$/);
assert.deepEqual(laneLines.slice(passIndex+1),[`[tank-release] ${LANE_NOTE}`],'a lane PASS repeats the note and ends there');
assert.equal(lanePass.out.some(([kind])=>kind==='error'),false);
const integratorPass=await fakeRelease(['--ids=leo2a7v,t14_armata','--gate'],{slow:true});
assert.equal(integratorPass.status,0);
assert.deepEqual(integratorPass.calls.map(call=>call.label),steps.map(tankReleaseLabel),'an integrator run starts every step, the suite and the build included');
const plainIntegrator=await fakeRelease(['--ids=m1a1_abrams_hc']);
assert.equal(plainIntegrator.status,0);
assert.deepEqual(plainIntegrator.calls.filter(call=>call.label.startsWith('npm ')).map(call=>[call.label,call.capture]),
  [['npm test',false],['npm run build:private',true]],'without --gate the integrator mode still runs the suite and the private build');
assert.match(plainIntegrator.text,/\[tank-release\] PASS \(integrator mode\) m1a1_abrams_hc/);
assert.doesNotMatch(plainIntegrator.text,/NOT RUN/,'an integrator run claims nothing was skipped');
const plainLane=await fakeRelease(['--ids=m1a1_abrams_hc','--lane']);
assert.equal(plainLane.status,0);
assert.equal(plainLane.text.split('\n').filter(line=>line===`[tank-release] ${LANE_NOTE}`).length,2,'without --gate a lane run still prints the note before and after');
assert.equal(plainLane.calls.some(call=>call.label.startsWith('npm ')),false);
// Failures: a lane failure exits with the earliest failed step's status, every failure of the stage is listed in plan
// order, no PASS line is printed and no later stage starts.
const scoringFail=await fakeRelease(laneArgv,{fail:{[tankReleaseLabel(lane[1])]:7}});
assert.equal(scoringFail.status,7,'a failed lane step fails the lane run with its status');
assert.deepEqual(scoringFail.calls.map(call=>call.label),lane.slice(0,3).map(tankReleaseLabel),'the scoring stage finishes; the probes never start');
assert.doesNotMatch(scoringFail.text,/PASS/);
assert.equal(scoringFail.text.split('\n').filter(line=>line===`[tank-release] ${LANE_NOTE}`).length,1,'no closing note after a failure');
assert.equal(scoringFail.out.at(-1)[1],'\n[tank-release] FAIL (lane mode) leo2a7v,t14_armata','the FAIL line is the last output');
assert.deepEqual(scoringFail.out.filter(([kind])=>kind==='error').map(([,line])=>line.trim()),[
  `[tank-release] FAILED step: ${tankReleaseLabel(lane[1])} (node-test exited 7)`,
  '[tank-release] FAIL (lane mode) leo2a7v,t14_armata',
]);
const probeFails=await fakeRelease(laneArgv,{slow:true,fail:{[tankReleaseLabel(lane[9])]:5,[tankReleaseLabel(lane[4])]:3}});
assert.equal(probeFails.status,3,'the earliest failed step in plan order sets the status');
assert.equal(probeFails.calls.length,lane.length,'a stage runs every step before it reports');
assert.deepEqual(probeFails.out.filter(([kind])=>kind==='error').map(([,line])=>line.trim()),[
  `[tank-release] FAILED step: ${tankReleaseLabel(lane[4])} (node-test exited 3)`,
  `[tank-release] FAILED step: ${tankReleaseLabel(lane[9])} (node-test exited 5)`,
  '[tank-release] FAIL (lane mode) leo2a7v,t14_armata',
],'every failure of the stage is reported, in plan order');
const npmFail=await fakeRelease(['--ids=m1a1_abrams_hc','--gate'],{fail:{'npm test':1}});
assert.equal(npmFail.status,1,'an integrator suite failure fails the run');
assert.match(npmFail.text,/FAILED step: npm test \(npm exited 1\)\n\n\[tank-release\] FAIL \(integrator mode\) m1a1_abrams_hc$/);
const statusless=await fakeRelease(laneArgv,{fail:{[tankReleaseLabel(lane[0])]:0}});
assert.equal(statusless.status,2,'a failure without a status exits 2');
// Before any step: --dry-run runs nothing; usage exits 1; a bad id is a FAIL line with status 2, not a stack trace.
const dry=await fakeRelease([...laneArgv,'--dry-run']);
assert.equal(dry.status,0);
assert.deepEqual(dry.calls,[],'--dry-run starts no child');
assert.deepEqual(dry.out.map(([,line])=>line),['[tank-release] lane mode --gate: leo2a7v,t14_armata',`[tank-release] ${LANE_NOTE}`,...tankReleasePlanLines(laneRun)]);
const usage=await fakeRelease(['--lane']);
assert.equal(usage.status,1);
assert.deepEqual(usage.calls,[]);
assert.match(usage.out[0][1],/^usage: /);
for(const [argv,message] of [[['--ids=nope','--lane'],/^\n\[tank-release\] FAIL \(lane mode\) nope: .*known playable/],
  [['--ids=m1a1_abrams_hc,m1a1_abrams_hc','--gate','--lane'],/^\n\[tank-release\] FAIL \(lane mode\) m1a1_abrams_hc,m1a1_abrams_hc: tank:release:check --ids lists m1a1_abrams_hc 2 times: /],
  [['--ids=m1a1_abrams_hc,'],/^\n\[tank-release\] FAIL \(integrator mode\) m1a1_abrams_hc,: release requires nonempty tank IDs$/]]){
  const bad=await fakeRelease(argv);
  assert.equal(bad.status,2,`${argv.join(' ')} exits 2`);
  assert.deepEqual(bad.calls,[]);
  assert.equal(bad.out.length,1);
  assert.equal(bad.out[0][0],'error');
  assert.match(bad.out[0][1],message);
}
console.log('tank-release-plan: lane mode skips exactly npm test and build:private, every step is per id; '
  +'command line, CLI, output, failure reporting and exit status pass');

const concept=tankReleaseSteps('ztz100_prototype,object695',true,'node-test');
assert.equal(concept.some(s=>s.args[0]==='tools/procedural-fidelity.mjs'),false,'obsolete comparisons are not run');
assert.equal(concept.length,18,'every other mandatory release step remains');
for(const step of concept.filter(s=>s.args[0]?.startsWith('tools/')&&s.args.some(a=>a.startsWith('--ids=')))) {
  assert.ok(step.args.includes('--ids=ztz100_prototype,object695'),'all physical checks retain both concepts');
}
for(const name of ['tank-standard-check','tank-sealed-check'])assert.ok(concept.find(s=>s.args[0]===`tools/${name}.mjs`).args.includes('--gate'));
// 262: the ZTZ-100 is a concept now (the ZTZ-20 family); strv122 is the mixed run's source comparison
const mixed=tankReleaseSteps('strv122,ztz100_prototype,object695',true,'node-test');
assert.deepEqual(mixed.find(s=>s.args[0]==='tools/procedural-fidelity.mjs').args,
 ['tools/procedural-fidelity.mjs','--ids=strv122','--check','--board','--neutral-board']);
assert.throws(()=>tankReleaseSteps('unknown_x',true),/known playable/,'unknown IDs cannot obtain N/A qualification');

const type100=tankReleaseSteps('type100',true,'node-test');
assert.equal(type100.some(step=>step.args[0]==='tools/procedural-fidelity.mjs'),false);
assert.equal(type100.length,18,'Type100 retains every physical/anatomy/assets/test/build release step');
for(const step of type100.filter(step=>step.args.some(arg=>arg.startsWith('--ids='))))
  assert.ok(step.args.includes('--ids=type100'));
const allConcepts=tankReleaseSteps('type100,object695,ztz100_prototype,ztz100,ztz20',true,'node-test');
assert.equal(allConcepts.some(step=>step.args[0]==='tools/procedural-fidelity.mjs'),false,'the ZTZ family runs no source comparison');

// R4c (2026-10-16): a repeated id fails by name before any step runs.
assert.throws(()=>tankReleaseSteps('leo2a7v,t14_armata,leo2a7v',true,'node-test'),/tank:release:check --ids lists leo2a7v 2 times/);
console.log('tank-release-plan: a repeated id fails before any step');
