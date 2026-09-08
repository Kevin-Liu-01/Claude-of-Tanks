import assert from 'node:assert/strict';
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import { renderCoveredComposerWarm } from './coveredComposerWarm.ts';

let clock = 0;
const savedPerformance = Object.getOwnPropertyDescriptor(globalThis, 'performance');
Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => clock } });

class RecordedPass extends Pass {
  constructor(index, context) {
    super();
    this.index = index;
    this.context = context;
    this.cost = index + 1;
  }
  render(...args) {
    const [renderer, write, read, dt, mask] = args;
    const { composer, draws, bufferName, fail, neighbor } = this.context;
    assert.strictEqual(renderer, composer.renderer);
    assert.equal(args.length, 5, 'the wrapper preserves the native composer argument list');
    assert.equal(dt, 0);
    assert.equal(mask, false);
    draws.push({ index: this.index, write: bufferName(write), read: bufferName(read),
      screen: this.renderToScreen, neighborEnabled: neighbor.enabled, enabled: this.enabled });
    renderer.setRenderTarget(write, 4, 5);
    renderer.info.programs.push({});
    clock += this.cost;
    if (this instanceof LateFxProbe) this.needsSwap = this.context.active;
    if (fail.index === this.index) throw fail.reason;
  }
}
class SceneProbe extends RecordedPass {}
class AerialProbe extends RecordedPass {}
class LateFxProbe extends RecordedPass {}
class OutputProbe extends RecordedPass {}

function fixture(parity = 0, active = true) {
  const target = new THREE.WebGLRenderTarget(16, 16);
  const prior = new THREE.WebGLRenderTarget(8, 8);
  const binding = { target: prior, face: 2, mip: 3 };
  const fail = { index: -1, reason: null, restore: null };
  const renderer = {
    getPixelRatio: () => 1,
    getSize: (size) => size.set(16, 16),
    getRenderTarget: () => binding.target,
    getActiveCubeFace: () => binding.face,
    getActiveMipmapLevel: () => binding.mip,
    setRenderTarget(next, face = 0, mip = 0) {
      if (next === prior && fail.restore) throw fail.restore;
      Object.assign(binding, { target: next, face, mip });
    },
    info: { programs: [{}, {}] },
  };
  const composer = new EffectComposer(renderer, target);
  let renders = 0;
  composer.render = function (...args) {
    renders++;
    return EffectComposer.prototype.render.apply(this, args);
  };
  const context = { composer, draws: [], fail, active,
    bufferName: (buffer) => buffer === composer.renderTarget1 ? 1 : 2 };
  const passes = [new SceneProbe(0, context), new AerialProbe(1, context),
    new LateFxProbe(2, context), new OutputProbe(3, context)];
  context.neighbor = passes[1];
  passes[0].needsSwap = false;
  passes.forEach((pass) => composer.addPass(pass));
  if (parity) composer.swapBuffers();
  const renderMethods = passes.map((pass) => pass.render);
  const descriptors = passes.map((pass) => Object.getOwnPropertyDescriptor(pass, 'render'));
  const assertRestored = () => {
    assert.equal(composer.renderToScreen, true);
    assert.deepEqual(binding, { target: prior, face: 2, mip: 3 });
    for (const [index, pass] of passes.entries()) {
      assert.strictEqual(pass.render, renderMethods[index]);
      assert.deepEqual(Object.getOwnPropertyDescriptor(pass, 'render'), descriptors[index]);
    }
  };
  return { ...context, renderer, passes, binding, prior, renderMethods, descriptors,
    renders: () => renders, assertRestored };
}

try {
  for (const parity of [0, 1]) for (const active of [false, true]) for (const disabled of [false, true]) {
    const control = fixture(parity, active);
    control.passes[1].enabled = !disabled;
    control.composer.renderToScreen = false;
    control.composer.render(0);
    const candidate = fixture(parity, active);
    candidate.passes[1].enabled = !disabled;
    const enabled = candidate.passes.map((pass) => pass.enabled);
    const before = clock;
    const result = renderCoveredComposerWarm(candidate.composer);
    assert.deepEqual(candidate.draws, control.draws,
      'one real composer transaction preserves neighbors, routing, arguments and dynamic swap behavior');
    assert.equal(candidate.bufferName(candidate.composer.readBuffer), control.bufferName(control.composer.readBuffer));
    assert.equal(candidate.bufferName(candidate.composer.writeBuffer), control.bufferName(control.composer.writeBuffer));
    assert.deepEqual(candidate.passes.map((pass) => pass.enabled), enabled);
    assert.equal(candidate.passes[2].needsSwap, active);
    assert.equal(candidate.renders(), 1, 'diagnostics never render a pass or frame twice');
    candidate.assertRestored();
    let programCount = 2;
    assert.deepEqual(result.passes, candidate.passes.flatMap((pass, index) => pass.enabled ? [{
      index, label: pass.constructor.name, renderMs: pass.cost,
      programsBefore: programCount++, programsAfter: programCount,
    }] : []));
    assert.equal(result.totalMs, clock - before);
  }

  {
    const f = fixture();
    const pass = f.passes[1];
    const ownRender = function (...args) { return RecordedPass.prototype.render.apply(this, args); };
    Object.defineProperty(pass, 'render', { configurable: true, writable: true, enumerable: false, value: ownRender });
    f.renderMethods[1] = ownRender;
    f.descriptors[1] = Object.getOwnPropertyDescriptor(pass, 'render');
    renderCoveredComposerWarm(f.composer);
    f.assertRestored();
  }

  for (const index of [0, 1, 2, 3]) for (const reason of [new Error('native pass failed'), 0]) {
    const f = fixture();
    f.fail.index = index;
    f.fail.reason = reason;
    let caught = false;
    try { renderCoveredComposerWarm(f.composer); }
    catch (error) { caught = true; assert.strictEqual(error, reason); }
    assert(caught, 'a native pass error remains the original thrown value');
    assert.equal(f.draws.length, index + 1, 'failure cannot submit later passes');
    f.assertRestored();
  }

  for (const primary of [null, new Error('primary draw failure'), 0]) {
    const f = fixture();
    const restore = new Error('target restore failed');
    f.fail.restore = restore;
    if (primary !== null) { f.fail.index = 1; f.fail.reason = primary; }
    let caught = false;
    try { renderCoveredComposerWarm(f.composer); }
    catch (error) { caught = true; assert.strictEqual(error, primary === null ? restore : primary); }
    assert(caught);
    assert.equal(f.composer.renderToScreen, true, 'target failure cannot skip compositor restoration');
    f.passes.forEach((pass, index) => assert.strictEqual(pass.render, f.renderMethods[index]));
  }

  {
    const f = fixture();
    let screen = true;
    const problem = new Error('screen restore failed');
    Object.defineProperty(f.composer, 'renderToScreen', {
      get: () => screen,
      set(value) { if (value) throw problem; screen = value; },
    });
    assert.throws(() => renderCoveredComposerWarm(f.composer), (error) => error === problem);
    assert.deepEqual(f.binding, { target: f.prior, face: 2, mip: 3 },
      'compositor restoration failure cannot skip renderer restoration');
    f.passes.forEach((pass, index) => assert.strictEqual(pass.render, f.renderMethods[index]));
  }

  {
    const f = fixture();
    for (let index = 4; index < 24; index++) f.composer.addPass(new OutputProbe(index, f));
    const result = renderCoveredComposerWarm(f.composer);
    assert.equal(f.draws.length, 24, 'receipt bounds do not skip rendering');
    assert.equal(result.passes.length, 16, 'the diagnostic receipt never exceeds sixteen pass rows');
    assert.deepEqual(result.passes.map((row) => row.index), Array.from({ length: 16 }, (_, index) => index));
    for (const pass of f.composer.passes) assert.equal(Object.hasOwn(pass, 'render'), false);
  }

  {
    const f = fixture();
    f.composer.renderToScreen = false;
    Object.defineProperty(f.passes[0], 'constructor', { value: { name: 'x'.repeat(200) } });
    Object.preventExtensions(f.passes[1]);
    const result = renderCoveredComposerWarm(f.composer);
    assert.equal(f.composer.renderToScreen, false, 'already-covered routing is restored verbatim');
    assert.equal(result.passes[0].label, 'x'.repeat(64), 'labels cannot make the diagnostic receipt unbounded');
    assert.deepEqual(result.passes.map((row) => row.index), [0, 2, 3],
      'an unwrappable pass still renders but has no fabricated timing row');
    assert.equal(f.draws.length, 4);
    f.passes.forEach((pass, index) => assert.strictEqual(pass.render, f.renderMethods[index]));
  }

  {
    const f = fixture();
    f.composer.addPass(f.passes[0]);
    const result = renderCoveredComposerWarm(f.composer);
    assert.deepEqual(f.draws.map((draw) => draw.index), [0, 1, 2, 3, 0]);
    assert.deepEqual(result.passes.map((row) => row.index), [1, 2, 3],
      'repeated pass identities are not double wrapped or attributed to an ambiguous slot');
    f.assertRestored();
  }

  {
    const f = fixture();
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'performance');
    Object.defineProperty(globalThis, 'performance', { configurable: true, get() { throw new Error('clock unavailable'); } });
    // Timer is part of native EffectComposer, not optional instrumentation.
    // Keep its update callable so only diagnostic clock reads fail.
    f.composer.timer.update = () => {};
    Object.defineProperty(f.renderer.info, 'programs', { get() { throw new Error('counter unavailable'); } });
    for (const pass of f.passes) pass.render = function () { clock += this.cost; };
    try {
      const result = renderCoveredComposerWarm(f.composer);
      assert(Number.isNaN(result.totalMs));
      assert(result.passes.every((row) => Number.isNaN(row.renderMs)
        && Number.isNaN(row.programsBefore) && Number.isNaN(row.programsAfter)),
      'unavailable diagnostics remain unknown and cannot stop the real draw');
      assert.equal(f.renders(), 1);
    } finally { Object.defineProperty(globalThis, 'performance', descriptor); }
  }
} finally {
  if (savedPerformance) Object.defineProperty(globalThis, 'performance', savedPerformance);
  else delete globalThis.performance;
}

console.log('coveredComposerWarm: exact composer routing/parity, bounded timings and error restoration PASS');
