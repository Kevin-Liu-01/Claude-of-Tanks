import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as middlewareConfig } from '../middleware.ts';
import { typecheckVerdict } from './typecheck.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const typecheckSource = readFileSync(join(ROOT, 'tools/typecheck.mjs'), 'utf8');

assert.equal(middlewareConfig.runtime, 'nodejs',
  'localized middleware must use Node.js: the legacy Edge bundler cannot parse JSON import attributes');

assert.equal(manifest.devDependencies['@typescript/native'], 'npm:typescript@7.0.2',
  'the project typecheck must pin the native TypeScript 7 compiler');
assert.equal(manifest.devDependencies.typescript, 'npm:@typescript/typescript6@6.0.2',
  'tooling that imports the typescript package must receive the TypeScript 6 compatibility API');
assert.equal(manifest.scripts.typecheck, 'node tools/typecheck.mjs', 'typecheck is the one-compile tool');
assert.match(typecheckSource, /node_modules\/@typescript\/native\/bin\/tsc/,
  'typecheck must invoke TypeScript 7 explicitly instead of relying on npm bin-link ordering');
assert.match(typecheckSource, /'--noUnusedLocals', '--noUnusedParameters'/, 'one compile carries the unused-symbol flags');
assert.match(typecheckSource, /realpathSync\(process\.argv\[1\]\) === fileURLToPath\(import\.meta\.url\)/,
  'typecheck runs as a command through a symlinked checkout too, never skipping silently');
assert.match(manifest.devDependencies.oxlint, /^\d+\.\d+\.\d+$/, 'oxlint is pinned to an exact version');
assert.equal(manifest.scripts.lint, 'oxlint', 'npm run lint runs oxlint with .oxlintrc.json');

// The one-compile verdict: every non-unused diagnostic fails, unused symbols fail only in the core owners, and a
// compiler whose output is not a complete diagnostic list fails closed.
{
  const root = '/repo';
  const verdict = (output, status = output ? 2 : 0) => typecheckVerdict({ output, status, root });
  const unusedTool = "tools/probe.ts(3,7): error TS6133: 'x' is declared but its value is never read.";
  const unusedCore = "src/game/state.ts(9,7): error TS6133: 'y' is declared but its value is never read.";
  assert.deepEqual(verdict(''), { ok: true, kind: 'clean', report: '', count: 0 });
  assert.equal(verdict(`${unusedTool}\n`).ok, true, 'unused symbols outside the core owners pass');
  assert.equal(verdict("src/world/maps/alpine.ts(1,1): error TS6133: 'z' is declared but its value is never read.").ok, true,
    'a text-pinned map config keeps its unused names');
  assert.equal(verdict("src/game/state.ts(2,9): error TS6138: Property 'p' is declared but its value is never read.").ok, true,
    'unused private properties stay ungated');
  const unused = verdict(`${unusedTool}\n${unusedCore}\n`);
  assert.deepEqual([unused.ok, unused.kind, unused.count, unused.report], [false, 'unused', 1, unusedCore]);
  const chained = "tools/probe.ts(4,1): error TS2322: Type 'string' is not assignable to type 'number'.\n  The expected type comes from here.";
  const type = verdict(`${unusedCore}\n${chained}\n`);
  assert.deepEqual([type.ok, type.kind, type.count, type.report], [false, 'type', 1, chained],
    'a type error anywhere fails first, with its continuation lines');
  assert.equal(verdict("error TS5023: Unknown compiler option '--bogus'.\n", 1).kind, 'type', 'an error without a location fails');
  assert.equal(verdict('', 1).kind, 'compiler', 'a failed compiler without diagnostics fails');
  assert.equal(verdict('', null).kind, 'compiler', 'a killed compiler fails');
  assert.equal(verdict(`${unusedTool}\npanic: runtime error: index out of range\n\ngoroutine 1 [running]:\n`).kind, 'compiler',
    'a crash after part of the output fails');
}

const require = createRequire(import.meta.url);
const compatibilityCompiler = require('typescript');
assert.match(compatibilityCompiler.version, /^6\./,
  'the package imported by Vercel must expose the TypeScript 6 compiler API');
assert.equal(typeof compatibilityCompiler.createLanguageService, 'function',
  'the Vercel function builder requires createLanguageService');
assert.equal(typeof compatibilityCompiler.transpileModule, 'function',
  'the Vercel function builder requires transpileModule');

const configPath = join(ROOT, 'tsconfig.json');
const config = compatibilityCompiler.readConfigFile(configPath, compatibilityCompiler.sys.readFile);
const parsedConfig = compatibilityCompiler.parseJsonConfigFileContent(
  config.config, compatibilityCompiler.sys, ROOT);
assert.deepEqual(parsedConfig.errors, [], 'the deployment compiler must accept the project config');
for (const file of ['middleware.ts', 'src/presentation/localizedHtml.ts', 'src/presentation/siteMetadata.ts']) {
  const emitted = compatibilityCompiler.transpileModule(readFileSync(join(ROOT, file), 'utf8'), {
    fileName: file,
    compilerOptions: { ...parsedConfig.options, noEmit: false },
  });
  const imports = compatibilityCompiler.preProcessFile(emitted.outputText).importedFiles;
  assert.deepEqual(imports.filter(({ fileName }) => /\.[cm]?tsx?$/.test(fileName)), [],
    `${file}: emitted deployment imports must reference JavaScript, not unshipped TypeScript sources`);
}

const nativeManifest = JSON.parse(readFileSync(
  join(ROOT, 'node_modules/@typescript/native/package.json'), 'utf8'));
assert.equal(nativeManifest.version, '7.0.2');

console.log('typescriptToolchain.selftest: native TS7 in one compile, its verdicts, oxlint + Vercel-compatible TS6 API verified');
