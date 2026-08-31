import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = await readFile(new URL('./garageDressingAccess.ts', import.meta.url), 'utf8');

assert.match(source, /createGarageDressing\(engineCtx, pos/,
  'the zero-geometry compatibility owner must exist at first paint');
assert.doesNotMatch(source, /import\(['"].*garageDressing|DEFAULT_LOADERS|pending/,
  'Garage readiness must not depend on a deferred module or retry state');
assert.match(source, /pump: async \(\) => false/);
assert.match(source, /isBuilt: \(\) => true/);
assert.match(source, /preload: async \(\) => runtime/);

console.log('garageDressingAccess.selftest: immediate zero-work compatibility owner passed');
