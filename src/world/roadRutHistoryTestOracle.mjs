import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';

// Preserve immutable pre-filter full-RGBA fixtures and the filtered factory
// before its zero-core early-out. Strict, unique projections retain every
// other live mask/shore/yard operation. The live-map test compares ALL current
// RGBA bytes with the unoptimized factory, not just the historical R/B/A.
const source = readFileSync(new URL('./terrain.ts', import.meta.url), 'utf8');
const current = 'const rut = roadRutMask(d, rutInverseWidth);';
const original = 'const rut = Math.exp(-Math.pow((d - 1.55) / 0.55, 2));';
const zeroCoreGuard = '    if (core === 0) return;\n';
assert.equal(source.split(current).length, 2, 'unique actual production rut consumer');
assert.equal(source.split(zeroCoreGuard).length, 2, 'unique exact zero-core early-out');
const unoptimized = source.replace(zeroCoreGuard, '');
const historicalUrl = new URL('./terrain.ts?selftest=historical-point-ruts', import.meta.url).href;
const unoptimizedUrl = new URL('./terrain.ts?selftest=filtered-unoptimized-ruts', import.meta.url).href;
const hooks = registerHooks({ load(request, context, next) {
  if (request === historicalUrl) {
    return { format: 'module-typescript', source: unoptimized.replace(current, original), shortCircuit: true };
  }
  if (request === unoptimizedUrl) {
    return { format: 'module-typescript', source: unoptimized, shortCircuit: true };
  }
  return next(request, context);
} });
let historical, unoptimizedFiltered;
try {
  historical = (await import(historicalUrl)).makeMaskTexture;
  unoptimizedFiltered = (await import(unoptimizedUrl)).makeMaskTexture;
}
finally { hooks.deregister(); }
export const historicalMaskTexture = historical;
export const unoptimizedFilteredMaskTexture = unoptimizedFiltered;
