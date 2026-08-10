#!/usr/bin/env node
// One pre-landing command for tank work: generated-asset freshness + muzzle
// bore, existing geometry/track/contiguity/fittings standard, tests and build.

import { execFileSync } from 'node:child_process';

const idArg = process.argv.find((arg) => arg.startsWith('--ids='))
  || process.argv.find((arg) => arg.startsWith('--tanks='));
if (!idArg) {
  console.error('usage: node tools/tank-release-check.mjs --ids=a,b [--gate]');
  process.exit(1);
}
const ids = idArg.slice(idArg.indexOf('=') + 1);
const gate = process.argv.includes('--gate');

function run(command, args) {
  console.log(`\n[tank-release] ${command} ${args.join(' ')}`);
  execFileSync(command, args, { stdio: 'inherit' });
}

try {
  run(process.execPath, ['tools/tank-assets-check.mjs', `--ids=${ids}`]);
  run(process.execPath, ['tools/tank-standard-check.mjs', `--ids=${ids}`, ...(gate ? ['--gate'] : [])]);
  run('npm', ['test']);
  run('npm', ['run', 'build:private']);
  console.log(`\n[tank-release] PASS ${ids}`);
} catch (error) {
  console.error(`\n[tank-release] FAIL ${ids}`);
  process.exit(error.status || 2);
}
