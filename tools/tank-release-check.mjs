#!/usr/bin/env node
// One pre-landing command for tank work: generated-asset freshness + muzzle
// bore/barrel circularity, existing geometry/track/contiguity/fittings
// standard, tests and build.
//
//   node tools/tank-release-check.mjs --ids=a,b --gate            # integrator mode: every step, npm test and build:private
//   node tools/tank-release-check.mjs --ids=a,b --gate --lane     # lane mode: the same steps without npm test and build:private
//   node tools/tank-release-check.mjs --ids=a,b --lane --dry-run  # print the plan, run nothing
//
// Everything after the imports is runTankRelease (tools/tank-release-plan.mjs), which its selftest
// drives with fake children; this file only supplies the spawning runners and the exit status.
// The selftest pins these statements exactly: add behaviour to runTankRelease, not here.

import { runCommand, runCapturedCommand } from './capture-command.mjs';
import { runTankRelease } from './tank-release-plan.mjs';

const status = await runTankRelease(process.argv.slice(2), { runCommand, runCapturedCommand });
if (status) process.exit(status);
