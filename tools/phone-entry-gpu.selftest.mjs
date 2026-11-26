// phone-entry-gpu.selftest (mobile-gpu-reset-277): the probe's in-page GPU allocation tracker counts what a WebGL context
// is asked to hold, against a stand-in context whose calls do nothing: texture levels and cube faces by their format,
// immutable storage with its mip chain, generateMipmap's third, buffers by their bound target (an index buffer through
// its vertex array), renderbuffers with their samples, a texture attached to a framebuffer counted as a render target,
// every delete, a lost context's generation, and the census of the largest allocations.
import assert from 'node:assert/strict';
import { installGpuTracker } from './phone-entry-gpu.mjs';

class FakeContext {}
for (const name of ['activeTexture', 'bindTexture', 'deleteTexture', 'texImage2D', 'copyTexImage2D', 'texImage3D', 'compressedTexImage2D',
  'compressedTexImage3D', 'texStorage2D', 'texStorage3D', 'generateMipmap', 'bindBuffer', 'bindBufferBase', 'bindBufferRange',
  'bindVertexArray', 'bufferData', 'deleteBuffer', 'bindRenderbuffer', 'renderbufferStorage', 'renderbufferStorageMultisample',
  'deleteRenderbuffer', 'framebufferTexture2D', 'framebufferTextureLayer', 'linkProgram', 'getExtension']) {
  FakeContext.prototype[name] = function noop() { return null; };
}
const listeners = {};
const intervals = [];
const saved = { window: globalThis.window, document: globalThis.document, setInterval: globalThis.setInterval };
const frames = [];
globalThis.window = { WebGL2RenderingContext: FakeContext, addEventListener: (type, listener) => { listeners[type] = listener; },
  requestAnimationFrame: (callback) => { frames.push(callback); return frames.length; } };
globalThis.document = { querySelector: () => null };
globalThis.setInterval = (callback) => { intervals.push(callback); return 0; };
try {
  installGpuTracker(0);
  const T = globalThis.window.__GPU_TRACK;
  const gl = new FakeContext();
  const MB = 1048576;
  const [TEXTURE_2D, CUBE, CUBE_PX, ARRAY_BUFFER, ELEMENT, RENDERBUFFER] = [0x0DE1, 0x8513, 0x8515, 0x8892, 0x8893, 0x8D41];
  const RGBA = 0x1908, RGB = 0x1907, UBYTE = 0x1401, HALF = 0x140B, RGBA8 = 0x8058, RGBA16F = 0x881A, DEPTH24 = 0x81A6;

  // a 1024x1024 RGBA8 texture, then its mips by generateMipmap
  const colour = {};
  gl.bindTexture(TEXTURE_2D, colour);
  gl.texImage2D(TEXTURE_2D, 0, RGBA, 1024, 1024, 0, RGBA, UBYTE, null);
  assert.equal(T.tex, 4 * MB);
  gl.generateMipmap(TEXTURE_2D);
  assert.equal(T.tex, 4 * MB + Math.round(4 * MB / 3), 'generateMipmap adds a third');
  // the six-argument upload takes its size from the source; RGB is held as RGBA
  const photo = {};
  gl.activeTexture(0x84C0 + 3);
  gl.bindTexture(TEXTURE_2D, photo);
  gl.texImage2D(TEXTURE_2D, 0, RGB, RGB, UBYTE, { naturalWidth: 512, naturalHeight: 256 });
  assert.equal(T.tex - (4 * MB + Math.round(4 * MB / 3)), 512 * 256 * 4, 'an image upload, RGB padded to four bytes');
  gl.texImage2D(TEXTURE_2D, 0, RGB, RGB, UBYTE, { naturalWidth: 512, naturalHeight: 256 });
  assert.equal(T.tex - (4 * MB + Math.round(4 * MB / 3)), 512 * 256 * 4, 'a level uploaded again replaces itself');
  gl.deleteTexture(photo);
  assert.equal(T.tex, 4 * MB + Math.round(4 * MB / 3), 'a delete releases what it held');
  // immutable storage: the whole mip chain, six faces for a cube
  const cube = {};
  gl.bindTexture(CUBE, cube);
  gl.texStorage2D(CUBE, 2, RGBA16F, 64, 64);
  assert.equal(T.tex, 4 * MB + Math.round(4 * MB / 3) + 6 * (64 * 64 * 8 + 32 * 32 * 8));
  gl.deleteTexture(cube);
  // a cube face uploaded alone counts once per face
  const faces = {};
  gl.bindTexture(CUBE, faces);
  for (let face = 0; face < 6; face++) gl.texImage2D(CUBE_PX + face, 0, RGBA, 16, 16, 0, RGBA, HALF, null);
  assert.equal(T.tex, 4 * MB + Math.round(4 * MB / 3) + 6 * 16 * 16 * 8);
  gl.deleteTexture(faces);

  // a render target: the texture attached to a framebuffer moves from textures to render targets
  const target = {};
  gl.bindTexture(TEXTURE_2D, target);
  gl.texImage2D(TEXTURE_2D, 0, RGBA16F, 487, 1055, 0, RGBA, HALF, null);
  gl.framebufferTexture2D(0x8D40, 0x8CE0, TEXTURE_2D, target, 0);
  assert.equal(T.rt, 487 * 1055 * 8);
  assert.equal(T.tex, 4 * MB + Math.round(4 * MB / 3), 'counted once, as a render target');
  gl.bindTexture(TEXTURE_2D, target);
  gl.texImage2D(TEXTURE_2D, 0, RGBA16F, 400, 800, 0, RGBA, HALF, null);
  assert.equal(T.rt, 400 * 800 * 8, 'a resized render target stays one');

  // buffers by their target; an index buffer bound through a vertex array
  const vertices = {}, indices = {}, vao = {};
  gl.bindBuffer(ARRAY_BUFFER, vertices);
  gl.bufferData(ARRAY_BUFFER, new Float32Array(3000), 0x88E4);
  gl.bindVertexArray(vao);
  gl.bindBuffer(ELEMENT, indices);
  gl.bindVertexArray(null);
  gl.bindVertexArray(vao);
  gl.bufferData(ELEMENT, 6000, 0x88E4);
  assert.equal(T.buf, 12000 + 6000);
  gl.deleteBuffer(vertices);
  assert.equal(T.buf, 6000);

  // a multisampled depth renderbuffer
  const depth = {};
  gl.bindRenderbuffer(RENDERBUFFER, depth);
  gl.renderbufferStorageMultisample(RENDERBUFFER, 4, DEPTH24, 100, 100);
  assert.equal(T.rb, 100 * 100 * 4 * 4);
  gl.linkProgram({});
  assert.equal(T.links, 1);
  assert.equal(T.live, T.tex + T.rt + T.buf + T.rb, 'live is the sum of its kinds');
  assert.equal(T.peak >= T.live, true);

  // the census names the largest allocations by kind and shape
  const census = T.census(4);
  assert.equal(census.largest[0].kind, 'tex');
  assert.equal(census.largest[0].shape, '1024x1024 0x1908');
  assert.ok(census.shapes.some((row) => row.shape === 'rt 400x800 0x881a'), JSON.stringify(census.shapes));
  assert.equal(census.byKindMb.rb, +((100 * 100 * 16) / MB).toFixed(1));

  // a lost context holds nothing; the old generation's deletes are not counted again
  listeners.webglcontextlost();
  assert.equal(T.live, 0);
  assert.equal(T.losses, 1);
  gl.deleteTexture(colour);
  assert.equal(T.live, 0, 'a delete of a lost generation changes nothing');
  gl.bindBuffer(ARRAY_BUFFER, vertices);
  gl.bufferData(ARRAY_BUFFER, 4096, 0x88E4);
  assert.equal(T.live, 4096, 'the restored context counts afresh');
  assert.equal(intervals.length, 1, 'one sampler');
  // the largest single-frame allocation: positive bytes between two animation frames, deletes not subtracted
  T.recording = true; T.frameBytes = 0; T.frameMax = 0;
  const tick = () => frames.shift()();
  const fresh = {};
  gl.bindBuffer(ARRAY_BUFFER, fresh);
  gl.bufferData(ARRAY_BUFFER, 1000, 0x88E4);
  gl.bufferData(ARRAY_BUFFER, 3000, 0x88E4);
  tick();
  assert.equal(T.frameMax, 3000, 'a re-specified buffer counts only its growth (1000, then 2000 more)');
  gl.deleteBuffer(fresh);
  const big = {};
  gl.bindBuffer(ARRAY_BUFFER, big);
  gl.bufferData(ARRAY_BUFFER, 8192, 0x88E4);
  tick();
  assert.equal(T.frameMax, 8192, 'a frame that freed and allocated counts what it allocated');
  tick();
  assert.equal(T.frameMax, 8192, 'an empty frame changes nothing');
  void RGBA8;
} finally {
  globalThis.window = saved.window;
  globalThis.document = saved.document;
  globalThis.setInterval = saved.setInterval;
}
console.log('phone-entry-gpu.selftest: texture levels, faces and storage chains, mips, render targets, buffers through vertex arrays, renderbuffers, deletes, census and context loss counted PASS');
