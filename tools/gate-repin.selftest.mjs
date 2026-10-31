// gate:repin's plan: chunks (one capture ticket each), the first failing chunk stops the rest, and the printed dims rows.
// The guard it relies on (geometry-gate.mjs --require-oracles) is geometry-gate-policy.selftest.mjs's missingOraclesError.
import assert from 'node:assert/strict';
import { dimsSummary, repinAll, repinChunks } from './gate-repin.mjs';

assert.deepEqual(repinChunks(['a', 'b', 'c', 'd', 'e'], 2), [['a', 'b'], ['c', 'd'], ['e']]);
assert.deepEqual(repinChunks(['a'], 10), [['a']]);
assert.throws(() => repinChunks(['a'], 0), /--chunk must be a positive integer/);

const ran = [];
const ok = await repinAll(['a', 'b', 'c'], { size: 2, run: async (chunk) => { ran.push(chunk.join(',')); } });
assert.deepEqual(ran, ['a,b', 'c'], 'every chunk runs, in order');
assert.deepEqual(ok, { done: ['a', 'b', 'c'], failed: null, rest: [], error: null });

// negative control: a chunk that fails (a missing oracle, a page error) stops the run; later chunks never start
ran.length = 0;
const stop = await repinAll(['a', 'b', 'c', 'd', 'e'], { size: 2, run: async (chunk) => {
  ran.push(chunk.join(','));
  if (chunk.includes('c')) throw new Error('registered comparison oracle missing for 1 id(s)');
} });
assert.deepEqual(ran, ['a,b', 'c,d']);
assert.deepEqual(stop.done, ['a', 'b']);
assert.deepEqual(stop.failed, ['c', 'd']);
assert.deepEqual(stop.rest, ['e']);
assert.match(stop.error.message, /oracle missing/);

const line = dimsSummary({ id: 't64bv1', geoMin: 0, requiredMinimum: 90, components: { dims: 0 }, dimRows: [
  { name: 'heightM', actual: 2.5358, roofFittingsTop: 2.8448, published: 2.274, pct: 11.51 },
  { name: 'hullLengthM', actual: 7.5009, published: 7.1932, pct: 4.28, method: 'donor frame: donor silhouette' },
] });
assert.match(line, /^t64bv1 +geo +0\/90 dims 0 {2}height 2\.536\.\.2\.845 vs 2\.274 11\.5% {2}hull 7\.501 vs 7\.193 4\.3% \(donor frame: donor silhouette\)$/);
assert.match(dimsSummary({ id: 'x', geoMin: 95, dimRows: [] }), /geo +95\/90 dims - {2}height - {2}hull -$/, 'a record without dims rows prints dashes');

console.log('gate-repin.selftest: chunks, stop-at-first-failure and the dims summary pass');
