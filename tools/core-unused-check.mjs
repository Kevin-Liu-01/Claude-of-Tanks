#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { relative, resolve, sep } from 'node:path';
import process from 'node:process';

const root = process.cwd();
const compiler = resolve(root, 'node_modules/.bin/tsc');
const result = spawnSync(compiler, [
  '-p', 'tsconfig.json', '--noEmit', '--noUnusedLocals', '--noUnusedParameters',
], {
  cwd: root,
  encoding: 'utf8',
  maxBuffer: 32 * 1024 * 1024,
});
if (result.error) throw result.error;

const normalized = (fileName) => relative(root, resolve(fileName)).split(sep).join('/');
const isCoreRuntime = (fileName) => {
  const path = normalized(fileName);
  if (path === 'src/main.ts' || path === 'middleware.ts' || path === 'vite.config.ts') return true;
  if (path.startsWith('server/') || path.startsWith('api/')) return true;
  if (path.startsWith('src/world/maps/') || path.startsWith('src/vehicles/')) return false;
  return /^(?:src\/(?:app|audio|dev|engine|fx|game|net|sim|ui|world)\/)/.test(path);
};
const diagnosticPattern = /^(.*?)\(\d+,\d+\): error TS(6133|6192|6196|6198|6199):.*$/gm;
const compilerOutput = `${result.stdout || ''}${result.stderr || ''}`;
const diagnostics = [...compilerOutput.matchAll(diagnosticPattern)]
  .filter((match) => isCoreRuntime(match[1]))
  .map((match) => match[0]);

if (diagnostics.length) {
  process.stderr.write(`${diagnostics.join('\n')}\n`);
  process.exitCode = 1;
} else {
  console.log('core-unused-check: application, network, simulation, UI, and world owners are clean');
}
