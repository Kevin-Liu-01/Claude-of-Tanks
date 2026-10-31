// gate:repin's plan: chunks (one capture ticket each), the first failing chunk stops the rest, and the printed dims rows.
// The guards it relies on (geometry-gate.mjs --repin) are geometry-gate-policy.selftest.mjs's missingOraclesError and
// mergeLedgerRow.
import assert from 'node:assert/strict';
import { dimsSummary, notRepinned, repinAll, repinChunks } from './gate-repin.mjs';

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

// a row the re-pin could not replace is named with its page error; a re-measured row and an id outside the run are not
const ledger = { rows: [{ id: 't80u', geoMin: 94.1, repinError: 'procedural: turret differs from the independent source datum' },
  { id: 'type90', geoMin: 97.3 }, { id: 'stb1', geoMin: 29.1, repinError: 'an older run' }] };
assert.deepEqual(notRepinned(ledger, ['t80u', 'type90']), [{ id: 't80u', error: 'procedural: turret differs from the independent source datum' }]);
assert.deepEqual(notRepinned({ rows: [] }, ['t80u']), []);

console.log('gate-repin.selftest: chunks, stop-at-first-failure, rows not re-pinned and the dims summary pass');
