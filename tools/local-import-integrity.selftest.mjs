import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseAst } from 'rolldown/parseAst';

const repoRoot = resolve(import.meta.dirname, '..');
const tracked = execFileSync('git', ['ls-files', 'api', 'server', 'src', 'tools'], {
  cwd: repoRoot,
  encoding: 'utf8',
}).trim().split('\n').filter((file) => /\.(?:html|js|mjs|ts)$/.test(file));

const missing = [];

function moduleSpecifiers(source, file) {
  const specifiers = [];
  const sourceFile = parseAst(source, { lang: file.endsWith('.ts') ? 'ts' : 'js' }, file);
  const visit = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const child of node) visit(child);
      return;
    }
    if ((node.type === 'ImportDeclaration' || node.type === 'ExportNamedDeclaration' ||
         node.type === 'ExportAllDeclaration') && typeof node.source?.value === 'string') {
      specifiers.push(node.source.value);
    } else if (node.type === 'ImportExpression' && typeof node.source?.value === 'string') {
      specifiers.push(node.source.value);
    }
    for (const child of Object.values(node)) {
      if (child && typeof child === 'object') visit(child);
    }
  };
  visit(sourceFile);
  return specifiers;
}

for (const file of tracked) {
  const rawSource = readFileSync(resolve(repoRoot, file), 'utf8');
  const sources = file.endsWith('.html')
    ? [...rawSource.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)].map((match) => match[1])
    : [rawSource];
  for (const source of sources) {
    for (const rawSpecifier of moduleSpecifiers(source, file)) {
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
console.log(`local-import-integrity.selftest: ${tracked.length} tracked modules have resolvable imports`);
