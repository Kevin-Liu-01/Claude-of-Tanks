import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import ts from 'typescript-compiler-api';
import { Scene } from 'three';
import { WebGLInfo } from 'three/src/renderers/webgl/WebGLInfo.js';
import { createPostFrameAccounting } from '../src/engine/postFrameAccounting.ts';
import { installPhaseResourceFrameAccounting, beginPhaseResourceFrameSample,
  hasFreshPhaseResourceFrame } from './phase-resource-frame-accounting.mjs';

// Load the actual snapshot and gate consumers without starting the probe's
// browser/server CLI. No gate or receipt owner is replaced with a fixture.
const source = readFileSync(new URL('./phase-resource-probe.mjs', import.meta.url), 'utf8');
const tree = ts.createSourceFile('phase-resource-probe.mjs', source,
  ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const declarations = tree.statements.filter((statement) => ts.isVariableStatement(statement)
  && statement.declarationList.declarations.some(({ name }) => ts.isIdentifier(name)
    && (name.text.startsWith('check') || ['RESOURCE_BUDGETS', 'sampleResources', 'evaluateBudgets']
      .includes(name.text)))).map((statement) => statement.getText(tree)).join('\n');

function fixture(autoReset = true, nestedAccounting = false) {
  const gl = { TRIANGLES: 4, LINES: 1, LINE_STRIP: 3, LINE_LOOP: 2, POINTS: 0 };
  const info = new WebGLInfo(gl);
  info.autoReset = autoReset;
  const debug = { game: { phase: 'battle', tanks: [] }, scene: new Scene(),
    lighting: { scheduledMask: 15 } };
  let fail = '';
  const renderer = { info, shadowMap: { render() {
    info.update(60, gl.TRIANGLES, 1);
    if (fail === 'shadow') throw new Error('shadow failed');
  } } };
  const pass = (draw) => {
    // The real Three.js counter owns primitive accounting; only GPU submission
    // is controlled. This is the renderer's normal per-pass reset behavior.
    if (info.autoReset) info.reset();
    draw();
  };
  const post = { render(...args) {
    assert.equal(this, post, 'the installed wrapper preserves the post receiver');
    pass(() => {
      renderer.shadowMap.render();
      info.update(300, gl.TRIANGLES, 1);
      info.update(6, gl.LINES, 1);
      info.update(5, gl.POINTS, 1);
    });
    if (fail === 'scene') throw new Error('scene failed');
    pass(() => info.update(3, gl.TRIANGLES, 1));
    if (fail === 'final') throw new Error('final failed');
    if (fail === 'phase') debug.game.phase = 'garage';
    return args;
  } };
  const frameAccounting = createPostFrameAccounting(renderer, post.render.bind(post));
  if (nestedAccounting) post.render = frameAccounting.render;
  Object.assign(debug, { renderer, post });
  const window = { __DEBUG: debug };
  const context = createContext({ window, performance: {}, hasFreshPhaseResourceFrame });
  context.page = { evaluate: (fn) => fn() };
  const consumers = runInContext(`${declarations}\n({sampleResources, evaluateBudgets})`, context);
  const evaluate = (fn, value) => {
    context.argument = value;
    return runInContext(`(${fn.toString()})(argument)`, context);
  };
  return { window, debug, info, post, consumers, frameAccounting,
    install: () => evaluate(installPhaseResourceFrameAccounting),
    begin: (phase) => evaluate(beginPhaseResourceFrameSample, phase),
    fail: (value) => { fail = value; },
    receipt: () => window.__PHASE_RESOURCE_LAST_RENDER,
    gate(sample, name = 'garage-returned') {
      const resources = consumers.sampleResources();
      const result = consumers.evaluateBudgets([{ name, frameSample: sample, resources }]);
      return result.checks.find((check) => check.name === `${name} fresh completed-frame receipt`);
    },
  };
}

const baseline = fixture();
baseline.post.render();
assert.equal(baseline.info.render.calls, 1);
assert.equal(baseline.info.render.triangles, 1, 'the final-pass counter reproduces the misleading HUD tail');
baseline.install();
const initialSample = baseline.begin('battle');
assert.equal(baseline.receipt(), null);
assert.equal(baseline.consumers.sampleResources().renderer.calls, undefined,
  'the actual snapshot owner must not fall back to the raw final-pass counter');
assert.equal(baseline.gate(initialSample, 'battle-active').pass, false,
  'a sample with no wrapped completed render fails the actual freshness gate');
assert.deepEqual(baseline.post.render(0.016, 0.020), [0.016, 0.020]);
const complete = baseline.receipt();
assert.equal(complete.completed, true);
assert.equal(complete.calls, 5);
assert.equal(complete.triangles, 121);
assert.equal(complete.lines, 3);
assert.equal(complete.points, 5);
assert.equal(complete.shadowCalls, 1);
assert.equal(complete.shadowTriangles, 20);
assert.equal(complete.shadowMask, 15);
assert.equal(baseline.info.autoReset, true);
assert.equal(baseline.consumers.sampleResources().renderer.calls, 5);
assert.equal(baseline.window.__PHASE_RESOURCE_FRAMES.length, 1);
assert.equal(baseline.gate(initialSample, 'battle-active').pass, true);

// A retained Battle receipt and the current raw renderer tail cannot certify
// returned Garage. Starting a new sample neither renders nor extends its wait.
baseline.debug.game.phase = 'garage';
assert.equal(baseline.gate(initialSample).pass, false, 'a changed live phase invalidates the receipt');
const attemptedBefore = baseline.window.__PHASE_RESOURCE_RENDER_COUNT;
const garageSample = baseline.begin('garage');
assert.equal(baseline.window.__PHASE_RESOURCE_RENDER_COUNT, attemptedBefore);
assert.equal(baseline.window.__PHASE_RESOURCE_FRAMES.length, 0);
assert.equal(baseline.receipt(), null);
assert.equal(baseline.gate(garageSample).pass, false);
assert.equal(hasFreshPhaseResourceFrame(garageSample, complete, 'garage'), false,
  'a prior sample receipt remains stale even if externally retained');
baseline.debug.lighting.scheduledMask = 0;
baseline.post.render();
assert.equal(baseline.gate(garageSample).pass, true);
assert.equal(baseline.receipt().sampleId, garageSample.id);
assert.equal(baseline.receipt().completedRender, 2);
const nextGarageSample = baseline.begin('garage');
assert.equal(baseline.gate(nextGarageSample).pass, false,
  'an older same-phase Garage receipt is not fresh evidence for a new sample');

for (const autoReset of [true, false]) {
  const nested = fixture(autoReset, true);
  const reset = nested.info.reset;
  let resets = 0;
  nested.info.reset = () => { resets += 1; reset(); };
  nested.install();
  const nestedSample = nested.begin('battle');
  nested.post.render(0.016, 0.020);
  assert.equal(resets, 1, 'the real nested production owner must not reset outer probe totals');
  assert.equal(nested.info.autoReset, autoReset);
  assert.equal(nested.receipt().calls, 5);
  assert.equal(nested.receipt().triangles, 121);
  assert.equal(nested.frameAccounting.lastCompletedFrame.calls, 5);
  assert.equal(nested.frameAccounting.lastCompletedFrame.triangles, 121);
  assert.equal(nested.gate(nestedSample, 'battle-active').pass, true);
  nested.fail('final');
  assert.throws(() => nested.post.render(), /final failed/);
  assert.equal(nested.info.autoReset, autoReset);
  assert.equal(nested.frameAccounting.lastCompletedFrame.serial, 1);
  assert.equal(nested.window.__PHASE_RESOURCE_COMPLETED_RENDER_COUNT, 1);

  const resetFailure = fixture(autoReset);
  resetFailure.install();
  resetFailure.begin('battle');
  resetFailure.info.reset = () => { throw new Error('reset failed'); };
  assert.throws(() => resetFailure.post.render(), /reset failed/);
  assert.equal(resetFailure.info.autoReset, autoReset, 'reset exceptions also restore ownership');
  assert.equal(resetFailure.receipt(), null);

  for (const failure of ['shadow', 'scene', 'final']) {
    const failed = fixture(autoReset);
    failed.install();
    const sample = failed.begin('battle');
    failed.fail(failure);
    assert.throws(() => failed.post.render(), new RegExp(`${failure} failed`));
    assert.equal(failed.info.autoReset, autoReset, `${failure}: restore caller reset ownership`);
    assert.equal(failed.receipt(), null, `${failure}: no partial-success publication`);
    assert.equal(failed.window.__PHASE_RESOURCE_FRAMES.length, 0);
    assert.equal(failed.window.__PHASE_RESOURCE_COMPLETED_RENDER_COUNT, 0);
    assert.equal(failed.window.__PHASE_RESOURCE_RENDER_COUNT, 1, 'existing attempt counter stays unchanged');
    assert.equal(failed.gate(sample, 'battle-active').pass, false);
    failed.fail('');
    failed.post.render();
    const recovered = failed.receipt();
    assert.equal(failed.info.autoReset, autoReset);
    assert.equal(recovered.calls, 5, 'the recovered frame excludes partial counters');
    assert.equal(recovered.shadowCalls, 1);
    assert.equal(failed.gate(sample, 'battle-active').pass, true);
    failed.fail('final');
    assert.throws(() => failed.post.render(), /final failed/);
    assert.equal(failed.receipt(), recovered, 'failed attempts cannot overwrite completed evidence');
    assert.equal(failed.window.__PHASE_RESOURCE_FRAMES.length, 1);
  }
}

const changed = fixture();
changed.install();
const changedSample = changed.begin('garage');
changed.post.render();
assert.equal(changed.gate(changedSample).pass, false, 'a fresh receipt in the wrong phase fails');
changed.fail('phase');
changed.post.render();
assert.equal(changed.receipt().phase, 'battle');
assert.equal(changed.receipt().endPhase, 'garage');
assert.equal(changed.gate(changedSample).pass, false, 'a phase change inside a transaction is not Garage evidence');
changed.fail('');
changed.post.render();
assert.equal(changed.gate(changedSample).pass, true);
const valid = changed.receipt();
for (const invalid of [null, {}, { ...valid, completed: false },
  { ...valid, sampleId: changedSample.id - 1 },
  { ...valid, completedRender: changedSample.afterCompletedRender },
  { ...valid, calls: null }, { ...valid, triangles: NaN }, { ...valid, shadowCalls: -1 }]) {
  assert.equal(hasFreshPhaseResourceFrame(changedSample, invalid, 'garage'), false);
}
for (let index = 0; index < 2401; index += 1) changed.post.render();
assert.equal(changed.window.__PHASE_RESOURCE_FRAMES.length, 2400, 'history retains its existing bounded size');
assert.equal(changed.window.__PHASE_RESOURCE_FRAMES.at(-1), changed.receipt());

console.log('phase-resource-frame-accounting selftest passed: complete frames, fresh phase receipts, failure cleanup');
