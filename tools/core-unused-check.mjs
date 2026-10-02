#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { relative, resolve, sep } from 'node:path';
import process from 'node:process';

const root = process.cwd();
const compiler = resolve(root, 'node_modules/@typescript/native/bin/tsc');
const result = spawnSync(process.execPath, [compiler,
  '-p', 'tsconfig.json', '--noEmit', '--noUnusedLocals', '--noUnusedParameters',
], {
  cwd: root,
  encoding: 'utf8',
  maxBuffer: 32 * 1024 * 1024,
});
if (result.error) throw result.error;

// Byte-authenticated sources keep their remaining unused names until the receipts that compare their
// exact text move: the map configs (badlandsRelief's historical byte projection, villageWear and
// mangroveWaterPalette's config digests) and their registry, plus the vehicle profiles whose whole
// source a history receipt hashes. Every other file under src/vehicles and src/world/maps is gated.
const TEXT_PINNED = new Set([
  'src/vehicles/profiles/chieftain10X.ts', // chieftain10XPublishedFoundation
  'src/vehicles/profiles/merkavaX.ts', // merkavaXEndReturnHistory
  'src/vehicles/profiles/t72buX.ts', // fixedSourceSkirtPaint
  'src/vehicles/profiles/t90.ts', // historicalT90MLamps
  ...[
    'alpine', 'autumn', 'badlands', 'blackglass', 'caldera', 'coastal', 'copperMesa', 'delta', 'desert', 'fjord',
    'index', 'mars', 'railyard', 'ruinspires', 'skybridge', 'steppe', 'titanGorge', 'urban', 'whiteout', 'winter',
  ].map((name) => `src/world/maps/${name}.ts`),
]);

const normalized = (fileName) => relative(root, resolve(fileName)).split(sep).join('/');
const isCoreRuntime = (fileName) => {
  const path = normalized(fileName);
  if (path === 'src/main.ts' || path === 'middleware.ts' || path === 'vite.config.ts') return true;
  if (path.startsWith('server/') || path.startsWith('api/')) return true;
  if (TEXT_PINNED.has(path)) return false;
  return /^(?:src\/(?:app|audio|dev|engine|fx|game|mp|net|sim|ui|vehicles|world)\/)/.test(path);
};
const diagnosticPattern = /^(.*?)\(\d+,\d+\): error TS(6133|6192|6196|6198|6199):.*$/gm;
const compilerOutput = `${result.stdout || ''}${result.stderr || ''}`;
if (result.status !== 0 && !/error TS(?:6133|6192|6196|6198|6199):/.test(compilerOutput)) {
  process.stderr.write(compilerOutput);
  process.exitCode = result.status || 1;
  process.exit();
}
const diagnostics = [...compilerOutput.matchAll(diagnosticPattern)]
  .filter((match) => isCoreRuntime(match[1]))
  .map((match) => match[0]);

if (diagnostics.length) {
  process.stderr.write(`${diagnostics.join('\n')}\n`);
  process.exitCode = 1;
} else {
  console.log('core-unused-check: application, network, simulation, UI, vehicle and world owners are clean');
}
