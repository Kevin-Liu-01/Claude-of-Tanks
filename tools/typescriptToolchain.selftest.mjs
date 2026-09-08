import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const unusedCheckSource = readFileSync(join(ROOT, 'tools/core-unused-check.mjs'), 'utf8');

assert.equal(manifest.devDependencies['@typescript/native'], 'npm:typescript@7.0.2',
  'the project typecheck must pin the native TypeScript 7 compiler');
assert.equal(manifest.devDependencies.typescript, 'npm:@typescript/typescript6@6.0.2',
  'tooling that imports the typescript package must receive the TypeScript 6 compatibility API');
assert.match(manifest.scripts.typecheck, /node_modules\/@typescript\/native\/bin\/tsc/,
  'typecheck must invoke TypeScript 7 explicitly instead of relying on npm bin-link ordering');
assert.match(unusedCheckSource, /node_modules\/@typescript\/native\/bin\/tsc/,
  'the unused-code gate must invoke the same explicit TypeScript 7 compiler');
assert.match(unusedCheckSource, /result\.status !== 0/,
  'the unused-code gate must not turn a missing or failed compiler into a passing result');

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

console.log('typescriptToolchain.selftest: native TS7 + Vercel-compatible TS6 API verified');
