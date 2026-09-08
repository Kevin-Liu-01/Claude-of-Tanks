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

function operationFixture() {
  const f = fixture();
  const scene = {}, camera = {}, source = {}, destination = {}, program = {}, location = {};
  const failure = { method: '', reason: null };
  const calls = [];
  const record = (owner, name, args, cost, result) => {
    calls.push({ owner, name, args });
    clock += cost;
    if (failure.method === name) throw failure.reason;
    return result;
  };
  const gl = {
    ACTIVE_UNIFORMS: 35718, LINK_STATUS: 35714,
    getProgramParameter(...args) { return record(this, 'getProgramParameter', args, args[1] === 35718 ? 3 : 7, 2); },
    getUniformLocation(...args) { return record(this, 'getUniformLocation', args, 5, location); },
    getActiveUniform(...args) { return record(this, 'getActiveUniform', args, 2, source); },
    getProgramInfoLog(...args) { return record(this, 'getProgramInfoLog', args, 1, 'PRIVATE_PROGRAM_LOG'); },
    getShaderInfoLog(...args) { return record(this, 'getShaderInfoLog', args, 1, 'PRIVATE_SHADER_LOG'); },
    getParameter(...args) { return record(this, 'getParameter', args, 1, 4); },
  };
  const originalTarget = f.renderer.setRenderTarget;
  Object.assign(f.renderer, {
    getContext() { calls.push({ name: 'getContext' }); return gl; },
    render(...args) {
      assert.equal(gl.getProgramInfoLog(program), 'PRIVATE_PROGRAM_LOG');
      assert.equal(gl.getShaderInfoLog(source), 'PRIVATE_SHADER_LOG');
      assert.equal(gl.getShaderInfoLog(destination), 'PRIVATE_SHADER_LOG');
      assert.equal(gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS), 2);
      assert.equal(gl.getProgramParameter(program, gl.LINK_STATUS), 2);
      assert.strictEqual(gl.getActiveUniform(program, 0), source);
      assert.strictEqual(gl.getUniformLocation(program, 'PRIVATE_UNIFORM'), location);
      return record(this, 'render', args, 2, source);
    },
    copyTextureToTexture(...args) {
      assert.equal(gl.getParameter(3317), 4);
      return record(this, 'copyTextureToTexture', args, 2, destination);
    },
    setRenderTarget(...args) {
      originalTarget.apply(this, args);
      return record(this, 'setRenderTarget', args, 2, camera);
    },
    clear(...args) { return record(this, 'clear', args, 4, true); },
  });
  f.passes.slice(1).forEach((pass) => { pass.enabled = false; });
  f.passes[0].render = function (renderer, write) {
    assert.strictEqual(renderer.render(scene, camera), source);
    assert.strictEqual(renderer.render(scene, camera, null), source);
    assert.strictEqual(renderer.copyTextureToTexture(source, destination), destination);
    assert.strictEqual(renderer.setRenderTarget(write, 4, 5), camera);
    assert.strictEqual(renderer.clear(true, false, true), true);
  };
  f.renderMethods[0] = f.passes[0].render;
  f.descriptors[0] = Object.getOwnPropertyDescriptor(f.passes[0], 'render');
  const descriptors = [f.renderer, gl].map((owner) => Object.getOwnPropertyDescriptors(owner));
  return { ...f, gl, calls, failure, scene, camera, source, destination, program,
    assertOperationsRestored() {
      [f.renderer, gl].forEach((owner, index) => assert.deepEqual(Object.getOwnPropertyDescriptors(owner), descriptors[index]));
      f.assertRestored();
    } };
}

try {
  {
    const f = operationFixture();
    const result = renderCoveredComposerWarm(f.composer);
    assert.deepEqual(result.passes[0].operations, {
      render: { count: 2, totalMs: 44, maxMs: 22 },
      shaderDiagnostics: { count: 6, totalMs: 6, maxMs: 1 },
      getProgramParameter: { count: 2, totalMs: 6, maxMs: 3 },
      getLinkStatus: { count: 2, totalMs: 14, maxMs: 7 },
      getActiveUniform: { count: 2, totalMs: 4, maxMs: 2 },
      getUniformLocation: { count: 2, totalMs: 10, maxMs: 5 },
      copyTextureToTexture: { count: 1, totalMs: 3, maxMs: 3 },
      getParameter: { count: 1, totalMs: 1, maxMs: 1 },
      setRenderTarget: { count: 1, totalMs: 2, maxMs: 2 },
      clear: { count: 1, totalMs: 4, maxMs: 4 },
    }, 'nested operation times are inclusive; ACTIVE_UNIFORMS and LINK_STATUS have separate keys');
    assert.equal(result.passes[0].renderMs, 53);
    assert.equal(f.calls.filter((call) => call.name === 'getContext').length, 1);
    assert.equal(f.calls.filter((call) => call.name === 'getProgramParameter').length, 4,
      'diagnostics never issue their own GL query');
    for (const call of f.calls.filter((call) => call.owner)) {
      assert.strictEqual(call.owner, call.name.startsWith('get') ? f.gl : f.renderer);
    }
    assert.deepEqual(f.calls.filter((call) => call.name === 'render').map((call) => call.args),
      [[f.scene, f.camera], [f.scene, f.camera, null]], 'native argument arity and identities stay exact');
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE/);
    f.assertOperationsRestored();
    const before = JSON.stringify(result);
    f.renderer.clear(false);
    assert.equal(JSON.stringify(result), before, 'no wrapper or live timing writer survives return');
  }

  for (const method of ['render', 'copyTextureToTexture', 'setRenderTarget', 'clear',
    'getProgramParameter', 'getUniformLocation', 'getActiveUniform', 'getParameter',
    'getProgramInfoLog', 'getShaderInfoLog']) for (const reason of [new Error('native operation'), 0]) {
    const f = operationFixture();
    f.failure.method = method;
    f.failure.reason = reason;
    let caught = false;
    try { renderCoveredComposerWarm(f.composer); }
    catch (error) { caught = true; assert.strictEqual(error, reason); }
    assert(caught, `${method}: the original native thrown value must escape`);
    f.assertOperationsRestored();
  }

  for (const frozen of ['renderer', 'gl', 'both']) {
    const f = operationFixture();
    if (frozen !== 'gl') Object.freeze(f.renderer);
    if (frozen !== 'renderer') Object.freeze(f.gl);
    const owners = [f.renderer, f.gl];
    const descriptors = owners.map((owner) => Object.getOwnPropertyDescriptors(owner));
    const result = renderCoveredComposerWarm(f.composer);
    assert.equal(f.renders(), 1, 'frozen diagnostic owners cannot stop the native transaction');
    const operations = result.passes[0].operations;
    assert.equal(!!operations?.render, frozen === 'gl');
    assert.equal(!!operations?.getUniformLocation, frozen === 'renderer');
    owners.forEach((owner, index) => assert.deepEqual(Object.getOwnPropertyDescriptors(owner), descriptors[index]));
    f.assertRestored();
  }

  {
    const f = operationFixture();
    const rendererPrototype = { clear: f.renderer.clear };
    Object.setPrototypeOf(f.renderer, rendererPrototype);
    delete f.renderer.clear;
    const glPrototype = { getUniformLocation: f.gl.getUniformLocation };
    Object.setPrototypeOf(f.gl, glPrototype);
    delete f.gl.getUniformLocation;
    Object.defineProperty(f.gl, 'getActiveUniform', {
      value: f.gl.getActiveUniform, configurable: true, writable: false, enumerable: false,
    });
    const owners = [f.renderer, f.gl, rendererPrototype, glPrototype];
    const descriptors = owners.map((owner) => Object.getOwnPropertyDescriptors(owner));
    const result = renderCoveredComposerWarm(f.composer);
    assert.equal(result.passes[0].operations.clear.count, 1);
    assert.equal(result.passes[0].operations.getUniformLocation.count, 2);
    owners.forEach((owner, index) => assert.deepEqual(Object.getOwnPropertyDescriptors(owner), descriptors[index]),
      'inherited methods/prototypes and existing data descriptors restore exactly');
    f.assertRestored();
  }

  {
    const f = operationFixture();
    let clearReads = 0, uniformReads = 0;
    const clear = f.renderer.clear, uniform = f.gl.getUniformLocation;
    Object.defineProperty(f.renderer, 'clear', { configurable: true, get() { clearReads++; return clear; } });
    delete f.gl.getUniformLocation;
    const prototype = {};
    Object.defineProperty(prototype, 'getUniformLocation', { get() { uniformReads++; return uniform; } });
    Object.setPrototypeOf(f.gl, prototype);
    const owners = [f.renderer, f.gl, prototype];
    const descriptors = owners.map((owner) => Object.getOwnPropertyDescriptors(owner));
    const result = renderCoveredComposerWarm(f.composer);
    assert.equal(clearReads, 1);
    assert.equal(uniformReads, 2, 'diagnostics must not evaluate own or inherited method accessors');
    assert.equal(result.passes[0].operations.clear, undefined);
    assert.equal(result.passes[0].operations.getUniformLocation, undefined);
    owners.forEach((owner, index) => assert.deepEqual(Object.getOwnPropertyDescriptors(owner), descriptors[index]));
    f.assertRestored();
  }

  {
    const f = fixture();
    const old = { type: 'MeshDepthMaterial' };
    f.renderer.info.programs = [old, { type: 'ShaderMaterial' }];
    f.passes[0].render = () => {
      // Simulate Three's unordered release array and retain a known wrapper.
      f.renderer.info.programs = [old, ...['MeshDepthMaterial', 'MeshDistanceMaterial',
        'MeshStandardMaterial', 'MeshBasicMaterial', 'ShaderMaterial', 'RawShaderMaterial',
        'PRIVATE_CLASS'].map((type) => ({ type }))];
      f.renderer.info.programs.push(f.renderer.info.programs[1]);
    };
    f.passes.slice(1).forEach((pass) => { pass.enabled = false; });
    const result = renderCoveredComposerWarm(f.composer);
    assert.deepEqual(result.passes[0].newProgramTypes,
      { depth: 1, distance: 1, standard: 1, basic: 1, shader: 1, raw: 1, other: 1 },
      'new wrapper identities are classified once despite array reordering, releases and duplicate references');
    assert.doesNotMatch(JSON.stringify(result), /PRIVATE_CLASS|MeshDepthMaterial/);
  }

  {
    const f = operationFixture();
    const primary = new Error('native draw primary');
    const cleanup = new Error('method restoration secondary');
    f.failure.method = 'render';
    f.failure.reason = primary;
    const originalClear = f.renderer.clear;
    let restored = 0;
    f.composer.renderer = new Proxy(f.renderer, {
      defineProperty(target, name, descriptor) {
        if (name === 'clear' && descriptor.value === originalClear) {
          restored++;
          Reflect.defineProperty(target, name, descriptor);
          throw cleanup;
        }
        return Reflect.defineProperty(target, name, descriptor);
      },
    });
    assert.throws(() => renderCoveredComposerWarm(f.composer), (error) => error === primary);
    assert.equal(restored, 1);
    f.assertOperationsRestored();
  }

  for (const context of ['throw', 'accessor']) {
    const f = operationFixture();
    let reads = 0;
    if (context === 'throw') f.renderer.getContext = () => { throw new Error('diagnostic context unavailable'); };
    else Object.defineProperty(f.renderer, 'getContext', { get() { reads++; return () => f.gl; } });
    const result = renderCoveredComposerWarm(f.composer);
    assert(result.passes[0].operations.render);
    assert.equal(result.passes[0].operations.getUniformLocation, undefined);
    assert.equal(reads, 0, 'optional context discovery must not invoke an accessor');
    f.assertRestored();
  }

  {
    const f = operationFixture();
    f.passes[0].render = () => f.gl.getProgramParameter(f.program, 123456);
    const result = renderCoveredComposerWarm(f.composer);
    assert.equal(result.passes[0].operations, undefined, 'other program pnames call native code without false reflection attribution');
    assert.equal(f.calls.filter((call) => call.name === 'getProgramParameter').length, 1);
  }

  {
    const f = operationFixture();
    f.composer.timer.update = () => {};
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'performance');
    Object.defineProperty(globalThis, 'performance', { configurable: true, get() { throw new Error('no clock'); } });
    try {
      const result = renderCoveredComposerWarm(f.composer);
      for (const timing of Object.values(result.passes[0].operations)) {
        assert(timing.count > 0);
        assert(Number.isNaN(timing.totalMs) && Number.isNaN(timing.maxMs));
      }
      f.assertOperationsRestored();
    } finally { Object.defineProperty(globalThis, 'performance', descriptor); }
  }

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
      operations: { setRenderTarget: { count: 1, totalMs: 0, maxMs: 0 } },
      newProgramTypes: { depth: 0, distance: 0, standard: 0, basic: 0, shader: 0, raw: 0, other: 1 },
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
      assert(result.passes.every((row) => row.newProgramTypes === undefined),
        'unavailable program identity snapshots cannot fabricate zero new-program counts');
      assert.equal(f.renders(), 1);
    } finally { Object.defineProperty(globalThis, 'performance', descriptor); }
  }
} finally {
  if (savedPerformance) Object.defineProperty(globalThis, 'performance', savedPerformance);
  else delete globalThis.performance;
}

console.log('coveredComposerWarm: exact composer routing/parity, bounded timings and error restoration PASS');
