#!/usr/bin/env node
// One pre-landing command for tank work: generated-asset freshness + muzzle
// bore/barrel circularity, existing geometry/track/contiguity/fittings
// standard, tests and build.

import { runCommand, runCapturedCommand } from './capture-command.mjs';
import { tankReleaseSteps } from './tank-release-plan.mjs';

const idArg = process.argv.find((arg) => arg.startsWith('--ids='))
  || process.argv.find((arg) => arg.startsWith('--tanks='));
if (!idArg) {
  console.error('usage: node tools/tank-release-check.mjs --ids=a,b [--gate]');
  process.exit(1);
}
const ids = idArg.slice(idArg.indexOf('=') + 1);
const gate = process.argv.includes('--gate');

async function run({command,args,capture}) {
  console.log(`\n[tank-release] ${command} ${args.join(' ')}`);
  // Standard checking manages its own render phases. Wrapping that entire
  // child would deadlock its queue; wrap only otherwise-unlocked probes.
  const execute=capture?runCapturedCommand:runCommand;
  await execute(command,args);
}

try {
  for(const step of tankReleaseSteps(ids,gate))await run(step);
  console.log(`\n[tank-release] PASS ${ids}`);
} catch (error) {
  console.error(`\n[tank-release] FAIL ${ids}`);
  process.exit(error.status || 2);
}
