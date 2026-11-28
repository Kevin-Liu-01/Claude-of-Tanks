import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { moduleImportEdges } from './static-import-closure.mjs';

const repoRoot = resolve(import.meta.dirname, '..');
const tracked = execFileSync(
  'git',
  ['ls-files', '--cached', '--others', '--exclude-standard', 'api', 'server', 'src', 'tools'],
  {
  cwd: repoRoot,
  encoding: 'utf8',
  },
).trim().split('\n').filter((file) =>
  /\.(?:html|js|mjs|ts)$/.test(file) && existsSync(resolve(repoRoot, file)));

const missing = [];

for (const file of tracked) {
  const rawSource = readFileSync(resolve(repoRoot, file), 'utf8');
  const sources = file.endsWith('.html')
    ? [...rawSource.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((match) => match[1])
    : [rawSource];
  for (const source of sources) {
    // every import declaration and literal import(), type-only ones included (they must resolve too); Worker URLs aside
    for (const { specifier: rawSpecifier } of moduleImportEdges(source, file).filter((edge) => edge.kind !== 'worker')) {
      const specifier = rawSpecifier.split(/[?#]/, 1)[0];
      let target = null;
      if (specifier.startsWith('/src/')) target = resolve(repoRoot, specifier.slice(1));
      else if (specifier.startsWith('./') || specifier.startsWith('../')) {
        target = resolve(repoRoot, dirname(file), specifier);
      }
      if (target && !existsSync(target)) missing.push(`${file} -> ${specifier}`);
    }
  }
}

assert.deepEqual(missing, [], `tracked local imports must resolve:\n${missing.join('\n')}`);
console.log(`local-import-integrity.selftest: ${tracked.length} repository modules have resolvable imports`);
