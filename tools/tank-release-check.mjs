#!/usr/bin/env node
// One pre-landing command for tank work: generated-asset freshness + muzzle
// bore/barrel circularity, existing geometry/track/contiguity/fittings
// standard, tests and build.

import { runCommand, runCapturedCommand } from './capture-command.mjs';
import { tankReleaseStages } from './tank-release-plan.mjs';

const idArg = process.argv.find((arg) => arg.startsWith('--ids='))
  || process.argv.find((arg) => arg.startsWith('--tanks='));
if (!idArg) {
  console.error('usage: node tools/tank-release-check.mjs --ids=a,b [--gate]');
  process.exit(1);
}
const ids = idArg.slice(idArg.indexOf('=') + 1);
const gate = process.argv.includes('--gate');

const label=({command,args})=>`${command} ${args.join(' ')}`;
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
  for(const stage of tankReleaseStages(ids,gate))await runStage(stage);
  console.log(`\n[tank-release] PASS ${ids} (${((performance.now()-started)/60000).toFixed(1)} min)`);
} catch (error) {
  console.error(`\n[tank-release] FAIL ${ids}`);
  process.exit(error.status || 2);
}
