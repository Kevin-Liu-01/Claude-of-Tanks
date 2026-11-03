// 2026-11-02 audit (06-ui-3 #7): the Garage stage's variant reveal (garageVariantReveal.ts). The requested variant is
// revealed whole (tints, scene mode, name) in one call once its pack is ready; a newer request or a dispose supersedes
// a reveal in flight; three failed attempts leave the shown variant as it was, and asking again retries. The stage
// itself needs WebGL: its wiring is pinned in its source below.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createGarageVariantReveal } from './garageVariantReveal.ts';

const flush = async () => { for (let i = 0; i < 6; i++) await new Promise((resolve) => setImmediate(resolve)); };
const deferred = () => { let resolve, reject; const promise = new Promise((ok, no) => { resolve = ok; reject = no; }); return { promise, resolve, reject }; };

function harness() {
  const revealed = [];
  const failed = [];
  const readiness = [];
  const reveal = createGarageVariantReveal({
    whenReady: () => { const next = deferred(); readiness.push(next); return next.promise; },
    reveal: (variantId, stats, attempt) => revealed.push([variantId, attempt]),
    fail: (variantId, error, attempts) => failed.push([variantId, error, attempts]),
    wait: async () => {},
  });
  return { reveal, revealed, failed, readiness };
}

// 1. A ready request reveals at once; one that waits keeps the shown variant whole until its pack is ready.
{
  const { reveal, revealed, readiness } = harness();
  reveal.request('verdant_motor_pool', { ready: true });
  assert.deepEqual(revealed, [['verdant_motor_pool', 0]]);
  assert.deepEqual(reveal.state, { phase: 'shown', shown: 'verdant_motor_pool', requested: 'verdant_motor_pool' });
  reveal.request('saltmere', null);
  await flush();
  assert.equal(revealed.length, 1, 'nothing of the requested variant (its tints included) shows before its pack is ready');
  assert.deepEqual(reveal.state, { phase: 'revealing', shown: 'verdant_motor_pool', requested: 'saltmere' });
  readiness[0].resolve({ ready: true });
  await flush();
  assert.deepEqual(revealed[1], ['saltmere', 1], 'then it is revealed whole, in one call');
  assert.equal(reveal.state.phase, 'shown');
}

// 2. Three failed attempts leave the shown variant as it was; asking again retries.
{
  const { reveal, revealed, failed, readiness } = harness();
  reveal.request('verdant_motor_pool', { ready: true });
  reveal.request('cinder', null);
  await flush();
  readiness[0].reject(new Error('decode failed'));
  await flush();
  readiness[1].resolve({ ready: false });
  await flush();
  readiness[2].reject(new Error('still failing'));
  await flush();
  assert.equal(readiness.length, 3, 'three attempts');
  assert.deepEqual(failed, [['cinder', 'still failing', 3]]);
  assert.deepEqual(revealed, [['verdant_motor_pool', 0]], 'the failed variant never half-applied');
  assert.deepEqual(reveal.state, { phase: 'failed', shown: 'verdant_motor_pool', requested: 'cinder' });
  reveal.request('cinder', null);
  await flush();
  readiness[3].resolve({ ready: true });
  await flush();
  assert.deepEqual(revealed.at(-1), ['cinder', 1], 'a later request for it tries again');
}

// 3. A newer request supersedes a reveal in flight.
{
  const { reveal, revealed, readiness } = harness();
  reveal.request('verdant_motor_pool', { ready: true });
  reveal.request('saltmere', null);
  await flush();
  reveal.request('ironworks', { ready: true });
  readiness[0].resolve({ ready: true });
  await flush();
  assert.deepEqual(revealed.map(([id]) => id), ['verdant_motor_pool', 'ironworks'], 'the older reveal never lands');
  assert.equal(reveal.state.shown, 'ironworks');
  // two waits in a row: only the newest reveals
  reveal.request('saltmere', null);
  reveal.request('cinder', null);
  await flush();
  assert.equal(readiness.length, 2, 'the superseded request never even asks (its microtask sees the newer one)');
  readiness[1].resolve({ ready: true });
  await flush();
  assert.deepEqual(revealed.at(-1), ['cinder', 1]);
}

// 4. A dispose stops a reveal in flight, and later requests do nothing.
{
  const { reveal, revealed, failed, readiness } = harness();
  reveal.request('verdant_motor_pool', { ready: true });
  reveal.request('saltmere', null);
  await flush();
  reveal.dispose();
  readiness[0].resolve({ ready: true });
  await flush();
  assert.deepEqual(revealed.map(([id]) => id), ['verdant_motor_pool'], 'no reveal after the dispose');
  reveal.request('cinder', { ready: true });
  assert.equal(revealed.length, 1);
  assert.deepEqual(failed, []);
  assert.equal(reveal.state.phase, 'disposed');
}

// 5. The stage's wiring: the tints live in the one reveal, the dispose stops the reveal and the idle slices.
{
  const stage = readFileSync(new URL('./garageStage.ts', import.meta.url), 'utf8');
  const setVariant = stage.slice(stage.indexOf('  const setVariant = (variantId: string): string => {'), stage.indexOf('  setVariant(initialVariantId);'));
  assert.ok(setVariant.length > 0);
  assert.doesNotMatch(setVariant, /\.color\.|\.emissive\.|garageVariantId =/, 'a request changes no tint and names no variant');
  assert.match(setVariant, /variantReveal\.request\(variant\.id, isVerdant \|\| architectureStats\.ready \? architectureStats : null\);/);
  assert.equal((stage.match(/applyVariantTints\(/g) || []).length, 1, 'the tints are applied in one place: the reveal');
  assert.match(stage, /reveal: \(variantId, stats, attempt\) => \{\n\s+const variant = getGarageVariant\(variantId\);\n\s+group\.userData\.garageVariantId = variant\.id;/);
  assert.match(stage, /stageDisposed = true;\n\s+variantReveal\.dispose\(\);/);
  assert.match(stage, /const run = \(\): void => \{ if \(!stageDisposed\) work\(\); \};/, 'every idle slice checks the dispose');
  assert.doesNotMatch(stage, /variantPresentationGeneration/);
}

console.log('garageVariantReveal.selftest: whole reveals, failed reveals keep the shown variant, supersede, dispose, stage wiring PASS');
