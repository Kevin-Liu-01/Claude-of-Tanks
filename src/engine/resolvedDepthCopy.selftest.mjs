import assert from 'node:assert/strict';
import * as THREE from 'three';
import { copyResolvedDepth } from './resolvedDepthCopy.ts';

function fixture(samples = 4) {
  const source = new THREE.WebGLRenderTarget(32, 24, {
    depthTexture: new THREE.DepthTexture(32, 24), samples,
  });
  const destination = new THREE.WebGLRenderTarget(32, 24, {
    depthTexture: new THREE.DepthTexture(32, 24),
  });
  const depthTextures = [source.depthTexture, destination.depthTexture];
  const props = new WeakMap();
  const calls = [];
  const fail = { stage: '', reason: null, cleanup: null };
  const binding = { target: destination, face: 0, mip: 0, scissor: false };
  const gl = {
    FRAMEBUFFER: 36160, READ_FRAMEBUFFER: 36008, DRAW_FRAMEBUFFER: 36009,
    DEPTH_BUFFER_BIT: 256, NEAREST: 9728,
    getParameter() { assert.fail('the fast copy must not query native state'); },
    isFramebuffer() { assert.fail('the fast copy must not probe native handles'); },
    isContextLost() { assert.fail('the synchronous copy adds no native lifetime query'); },
    blitFramebuffer(...args) {
      assert.strictEqual(this, gl);
      calls.push({ stage: 'blit', args });
      if (fail.stage === 'blit') throw fail.reason;
    },
  };
  const cache = new Map();
  const actual = new Map();
  function initialize(target) {
    target.depthTexture.needsUpdate = true;
    props.set(target, { __webglFramebuffer: {}, __webglMultisampledFramebuffer: {},
      __boundDepthTexture: target.depthTexture });
    props.set(target.depthTexture, { __renderTarget: target, __webglTexture: {},
      __version: target.depthTexture.version });
  }
  initialize(source);
  initialize(destination);
  const state = {
    bindFramebuffer(kind, framebuffer) {
      assert.strictEqual(this, state);
      const stage = `${kind === gl.READ_FRAMEBUFFER ? 'read' : 'draw'}-${framebuffer ? 'bind' : 'clear'}`;
      calls.push({ stage, kind, framebuffer });
      if (fail.stage === stage) throw fail.reason;
      if (fail.cleanup && stage.endsWith('-clear')) throw fail.cleanup;
      // Match pinned WebGLState: FRAMEBUFFER/DRAW share a cache entry;
      // FRAMEBUFFER changes native READ too, but not Three's READ cache.
      if (cache.get(kind) === framebuffer) return false;
      cache.set(kind, framebuffer);
      actual.set(kind, framebuffer);
      if (kind === gl.DRAW_FRAMEBUFFER) cache.set(gl.FRAMEBUFFER, framebuffer);
      if (kind === gl.FRAMEBUFFER) {
        cache.set(gl.DRAW_FRAMEBUFFER, framebuffer);
        actual.set(gl.READ_FRAMEBUFFER, framebuffer);
        actual.set(gl.DRAW_FRAMEBUFFER, framebuffer);
      }
      return true;
    },
  };
  const renderer = {
    getContext: () => gl, state,
    properties: { has: (object) => props.has(object), get: (object) => {
      assert(props.has(object), 'guarded property reads cannot initialize resources');
      return props.get(object);
    } },
    getRenderTarget: () => binding.target,
    getActiveCubeFace: () => binding.face,
    getActiveMipmapLevel: () => binding.mip,
    getScissorTest: () => binding.scissor,
    setRenderTarget(target) {
      binding.target = target;
      state.bindFramebuffer(gl.FRAMEBUFFER, props.get(target).__webglFramebuffer);
    },
    copyTextureToTexture(...args) { calls.push({ stage: 'fallback', args }); },
  };
  renderer.setRenderTarget(destination);
  cache.set(gl.READ_FRAMEBUFFER, null);
  calls.length = 0;
  return { source, destination, props, calls, fail, binding, gl, renderer, cache, actual, initialize,
    dispose() { source.dispose(); destination.dispose(); depthTextures.forEach((texture) => texture.dispose()); } };
}

for (const samples of [0, 4]) {
  const f = fixture(samples);
  try {
    const sourceFramebuffer = f.props.get(f.source).__webglFramebuffer;
    const destinationFramebuffer = f.props.get(f.destination).__webglFramebuffer;
    copyResolvedDepth(f.renderer, f.source, f.destination);
    assert.deepEqual(f.calls, [
      { stage: 'read-bind', kind: f.gl.READ_FRAMEBUFFER, framebuffer: sourceFramebuffer },
      { stage: 'draw-bind', kind: f.gl.DRAW_FRAMEBUFFER, framebuffer: destinationFramebuffer },
      { stage: 'blit', args: [0, 0, 32, 24, 0, 0, 32, 24, f.gl.DEPTH_BUFFER_BIT, f.gl.NEAREST] },
      { stage: 'read-clear', kind: f.gl.READ_FRAMEBUFFER, framebuffer: null },
      { stage: 'draw-clear', kind: f.gl.DRAW_FRAMEBUFFER, framebuffer: null },
    ]);
    assert.strictEqual(f.binding.target, f.destination, 'native logical target is not changed');
    assert.equal(f.actual.get(f.gl.READ_FRAMEBUFFER), null);
    assert.equal(f.actual.get(f.gl.DRAW_FRAMEBUFFER), null);
    f.renderer.setRenderTarget(f.destination);
    assert.equal(f.actual.get(f.gl.DRAW_FRAMEBUFFER), destinationFramebuffer,
      'DRAW/FRAMEBUFFER cache cleanup forces the next existing setRenderTarget to bind');
    assert.equal(f.actual.get(f.gl.READ_FRAMEBUFFER), destinationFramebuffer);
  } finally { f.dispose(); }
}

const unsupported = {
  sameTarget: (f) => { f.source = f.destination; },
  sameDepth: (f) => { f.source.depthTexture = f.destination.depthTexture; },
  dimensions: (f) => { f.source.width++; },
  zero: (f) => { f.source.width = f.destination.width = 0; },
  fractional: (f) => { f.source.height = f.destination.height = 4.5; },
  destinationSamples: (f) => { f.destination.samples = 4; },
  unresolved: (f) => { f.source.resolveDepthBuffer = false; },
  scissor: (f) => { f.destination.scissorTest = true; },
  rendererScissor: (f) => { f.binding.scissor = true; },
  mip: (f) => { f.binding.mip = 1; },
  face: (f) => { f.binding.face = 1; },
  wrongCurrentTarget: (f) => { f.binding.target = f.source; },
  imageSize: (f) => { f.destination.depthTexture.image.width++; },
  colorMipmaps: (f) => { f.source.texture.generateMipmaps = true; },
  explicitColorMipmaps: (f) => { f.destination.texture.mipmaps.push({}); },
  depthMipmaps: (f) => { f.source.depthTexture.mipmaps.push({}); },
  generatedDepthMipmaps: (f) => { f.destination.depthTexture.generateMipmaps = true; },
  noDepth: (f) => { f.source.depthTexture = null; },
  noDepthBuffer: (f) => { f.destination.depthBuffer = false; },
  stencil: (f) => { f.source.stencilBuffer = true; },
  cubeTarget: (f) => { Object.setPrototypeOf(f.source, THREE.WebGLCubeRenderTarget.prototype); },
  multipleColorTargets: (f) => { f.source.textures.push(f.source.texture); },
  multiview: (f) => { f.source.multiview = true; },
  arrayDepth: (f) => { f.destination.useArrayDepthTexture = true; },
  arrayFramebuffer: (f) => { f.props.get(f.source).__webglFramebuffer = [{}]; },
  missingFramebuffer: (f) => { delete f.props.get(f.source).__webglFramebuffer; },
  invalidFramebuffer: (f) => { f.props.get(f.source).__webglFramebuffer = 1; },
  invalidTextureHandle: (f) => { f.props.get(f.source.depthTexture).__webglTexture = []; },
  aliasedFramebuffer: (f) => { f.props.get(f.source).__webglFramebuffer = f.props.get(f.destination).__webglFramebuffer; },
  aliasedTexture: (f) => { f.props.get(f.source.depthTexture).__webglTexture = f.props.get(f.destination.depthTexture).__webglTexture; },
  missingTexture: (f) => { delete f.props.get(f.destination.depthTexture).__webglTexture; },
  staleAttachment: (f) => { f.props.get(f.source).__boundDepthTexture = {}; },
  staleLink: (f) => { f.props.get(f.source.depthTexture).__renderTarget = f.destination; },
  dirtyDepth: (f) => { f.destination.depthTexture.needsUpdate = true; },
  missingProperties: (f) => { f.props.delete(f.source); },
  external: (f) => { f.props.get(f.source).__useDefaultFramebuffer = false; },
  externalTextures: (f) => { f.props.get(f.destination).__hasExternalTextures = true; },
  format: (f) => { f.source.depthTexture.format = THREE.DepthStencilFormat; },
  type: (f) => { f.source.depthTexture.type = THREE.FloatType; },
  internalFormat: (f) => { f.source.depthTexture.internalFormat = 'DEPTH_COMPONENT32F'; },
  layered: (f) => { f.source.depth = 2; },
  missingBlit: (f) => { f.gl.blitFramebuffer = undefined; },
  missingBind: (f) => { f.renderer.state.bindFramebuffer = undefined; },
  missingContextMethod: (f) => { f.renderer.getContext = undefined; },
  missingContext: (f) => { f.renderer.getContext = () => null; },
  thrownContext: (f) => { f.renderer.getContext = () => { throw new Error('unavailable context'); }; },
};
for (const [name, mutate] of Object.entries(unsupported)) {
  const f = fixture();
  try {
    mutate(f);
    copyResolvedDepth(f.renderer, f.source, f.destination);
    assert.deepEqual(f.calls, [{ stage: 'fallback', args: [f.source.depthTexture, f.destination.depthTexture] }],
      `${name}: unsupported state must use the exact native copy before any fast-path mutation`);
  } finally { f.dispose(); }
}

{
  const f = fixture();
  try {
    copyResolvedDepth(f.renderer, f.source, f.destination);
    const oldSource = f.props.get(f.source).__webglFramebuffer;
    f.source.setSize(48, 40); f.destination.setSize(48, 40);
    f.source.depthTexture.image.width = f.destination.depthTexture.image.width = 48;
    f.source.depthTexture.image.height = f.destination.depthTexture.image.height = 40;
    f.initialize(f.source); f.initialize(f.destination);
    f.calls.length = 0;
    copyResolvedDepth(f.renderer, f.source, f.destination);
    assert.notEqual(f.calls[0].framebuffer, oldSource, 'resize/recreated resources are read fresh without cached native handles');
    assert.deepEqual(f.calls[2].args.slice(0, 8), [0, 0, 48, 40, 0, 0, 48, 40]);
  } finally { f.dispose(); }
}
{
  const f = fixture();
  try {
    f.source.width = 0;
    f.renderer.copyTextureToTexture = () => { throw null; };
    let caught = false;
    try { copyResolvedDepth(f.renderer, f.source, f.destination); }
    catch (error) { caught = true; assert.strictEqual(error, null); }
    assert(caught, 'native fallback exceptions remain untouched');
    assert.equal(f.calls.length, 0, 'fallback failure does not enter fast-path cleanup');
  } finally { f.dispose(); }
}

for (const stage of ['read-bind', 'draw-bind', 'blit', 'read-clear', 'draw-clear']) {
  for (const reason of [new Error(stage), 0, null, undefined]) {
    const f = fixture();
    try {
      Object.assign(f.fail, { stage, reason });
      let caught = false;
      try { copyResolvedDepth(f.renderer, f.source, f.destination); }
      catch (error) { caught = true; assert.strictEqual(error, reason); }
      assert(caught, `${stage}: falsy native errors must still escape`);
      assert.equal(f.calls.filter((call) => call.stage === 'read-clear').length, 1);
      assert.equal(f.calls.filter((call) => call.stage === 'draw-clear').length, 1);
      assert(!f.calls.some((call) => call.stage === 'fallback'), 'never duplicate a partially attempted blit through fallback');
    } finally { f.dispose(); }
  }
}
{
  const f = fixture();
  try {
    Object.assign(f.fail, { stage: 'blit', reason: 0, cleanup: new Error('cleanup') });
    let caught = false;
    try { copyResolvedDepth(f.renderer, f.source, f.destination); }
    catch (error) { caught = true; assert.strictEqual(error, 0); }
    assert(caught);
    assert.deepEqual(f.calls.slice(-2).map((call) => call.stage), ['read-clear', 'draw-clear']);
  } finally { f.dispose(); }
}
console.log('resolvedDepthCopy: query-free exact depth blit, native fallback and independent failure cleanup PASS');
