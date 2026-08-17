import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const loaderPath = resolve(root, 'src/vehicles/sourceGeometryLoader.js');
const loaderText = readFileSync(loaderPath, 'utf8');
const generated = [
  'amx40', 'fv510', 'k1a1', 'leopard-revolution', 'leopard2a4',
  'leopard2a7', 't14', 'type10', 'type99a',
];

for (const stem of generated) {
  assert.match(loaderText, new RegExp(`import\\(['\"]\\./profiles/${stem}-source-geometry\\.js['\"]\\)`),
    `${stem} must stay behind a dynamic import`);
}

const consumers = [
  'src/vehicles/modern2.js',
  'src/vehicles/modern3.js',
  'src/vehicles/france.js',
  'src/vehicles/profiles/leopard.js',
  'src/vehicles/profiles/uk.js',
];
for (const file of consumers) {
  const text = readFileSync(resolve(root, file), 'utf8');
  assert.doesNotMatch(text, /from\s+['"][^'"]*source-geometry\.js['"]/, `${file} reintroduced an eager payload`);
}

const module = await import('../src/vehicles/sourceGeometryLoader.js');
const initial = module.sourceGeometryLoadState();
assert.deepEqual(initial.loaded, [], 'importing the registry must not evaluate payload chunks');
assert.deepEqual(initial.pending, [], 'importing the registry must not start network work');
assert.equal(module.hasSourceGeometry('leo2a4'), true);
assert.equal(module.hasSourceGeometry('m1a2'), false);

console.log('source-geometry lazy self-test passed');
