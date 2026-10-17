#!/usr/bin/env node
// One pre-landing command for tank work: generated-asset freshness + muzzle
// bore/barrel circularity, existing geometry/track/contiguity/fittings
// standard, tests and build.
//
//   node tools/tank-release-check.mjs --ids=a,b --gate            # integrator mode: every step, npm test and build:private
//   node tools/tank-release-check.mjs --ids=a,b --gate --lane     # lane mode: only the per-id steps (no suite, no build)
//   node tools/tank-release-check.mjs --ids=a,b --lane --dry-run  # print the plan, run nothing
//
// Every decision lives in tankReleaseInvocation (tools/tank-release-plan.mjs, covered by its selftest);
// this file prints it and runs its stages.

import { runCommand, runCapturedCommand } from './capture-command.mjs';
import { tankReleaseInvocation, tankReleaseLabel as label, tankReleasePlanLines } from './tank-release-plan.mjs';

const release = tankReleaseInvocation(process.argv.slice(2));
if (release.usage) {
  console.error(release.usage);
  process.exit(1);
}
const { ids, mode } = release;
const printNotes = () => { for (const note of release.notes) console.log(`[tank-release] ${note}`); };
console.log(`[tank-release] ${release.header}`);
printNotes();
if (release.dryRun) {
  for (const line of tankReleasePlanLines(release)) console.log(line);
  process.exit(0);
}

async function run(step) {
  console.log(`\n[tank-release] ${label(step)}`);
  // Standard checking manages its own render phases. Wrapping that entire
  // child would deadlock its queue; wrap only otherwise-unlocked probes.
  const execute=step.capture?runCapturedCommand:runCommand;
  const started=performance.now();
  try { await execute(step.command,step.args); }
  catch (error) { error.step=label(step); throw error; }
  console.log(`\n[tank-release] done ${label(step)} (${((performance.now()-started)/1000).toFixed(0)} s)`);
}

// Fast checks (2026-09-15): stages run in order; the steps of a stage run concurrently
// (bounded), every failure of a stage is reported, and the earliest failed step's status wins.
async function runStage({name,concurrency,steps}) {
  console.log(`\n[tank-release] stage "${name}": ${steps.length} step(s), ${Math.min(concurrency,steps.length)} at a time`);
  const failures=[];
  let next=0;
  const worker=async()=>{
    while(next<steps.length){
      const index=next++;
      try{await run(steps[index]);}
      catch(error){failures.push({index,error});}
    }
  };
  await Promise.all(Array.from({length:Math.min(concurrency,steps.length)},worker));
  if(failures.length){
    failures.sort((a,b)=>a.index-b.index);
    for(const {error} of failures)console.error(`[tank-release] FAILED step: ${error.step} (${error.message})`);
    throw failures[0].error;
  }
}

try {
  const started=performance.now();
  for(const stage of release.stages)await runStage(stage);
  console.log(`\n[tank-release] PASS (${mode} mode) ${ids} (${((performance.now()-started)/60000).toFixed(1)} min)`);
  printNotes();
} catch (error) {
  console.error(`\n[tank-release] FAIL (${mode} mode) ${ids}`);
  process.exit(error.status || 2);
}
