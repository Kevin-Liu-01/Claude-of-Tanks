import assert from 'node:assert/strict';
import {
  SOURCED_TEXTURE_COMPOSITION_PROTOCOL as protocol,
  isSourcedTextureCompositionReady,
  validateSourcedTextureCompositionRequest,
  validateSourcedTextureCompositionReply,
} from './sourcedTextureCompositionProtocol.ts';
import { createSourcedTextureCompositionHandler } from './sourcedTextureCompositionWorker.ts';

// Ownership/control-flow tests, not a browser raster or performance claim.
class Bitmap {
  constructor(role, width = 2, height = 2, rgba = [100, 150, 200, 255]) {
    Object.assign(this, { role, width, height, rgba, closes: 0, failClose: false });
  }
  close() {
    this.closes++;
    if (this.failClose) throw new Error('close failure');
    this.width = this.height = 0;
  }
}
const isBitmap = value => value instanceof Bitmap;
function request(requestId = 1, changes = {}) {
  return { type: 'compose', protocol, requestId, key: `fixture-${requestId}`, size: 2,
    options: { roughInAlpha: true, tint: [0.5, 0.5, 0.5] }, includeSurface: false,
    bitmaps: { color: new Bitmap('color'), ao: new Bitmap('ao', 1, 1, [128, 7, 9, 255]),
      rough: new Bitmap('rough', 2, 2, [128, 13, 17, 255]) }, ...changes };
}
function expectation(job) {
  return { requestId: job.requestId, key: job.key, size: job.size, includeSurface: job.includeSurface,
    closedBitmaps: Object.values(job.bitmaps).filter(Boolean).length };
}
function fakePorts() {
  const state = { canvases: [], contexts: [], draws: [], reads: [], replies: [], transfers: [],
    resizes: [], closes: 0, failPost: false, failRead: false, failDraw: false, failContext: false };
  const ports = {
    isBitmap,
    createCanvas(width, height) {
      let backingWidth = width, backingHeight = height;
      const canvas = {
        get width() { return backingWidth; },
        set width(value) { backingWidth = value; state.resizes.push({ canvas, dimension: 'width', value }); },
        get height() { return backingHeight; },
        set height(value) { backingHeight = value; state.resizes.push({ canvas, dimension: 'height', value }); },
        getContext(kind, options) {
        assert.equal(kind, '2d');
        assert.deepEqual(options, { willReadFrequently: true });
        if (state.failContext) return null;
        const context = { image: null,
          drawImage(bitmap, x, y, w, h) {
            if (state.failDraw) throw new Error('draw failure');
            assert.deepEqual([x, y, w, h], [0, 0, canvas.width, canvas.height]);
            this.image = bitmap;
            state.draws.push({ role: bitmap.role, from: [bitmap.width, bitmap.height], to: [w, h], canvas });
          },
          getImageData(x, y, w, h) {
            if (state.failRead) throw new Error('read failure');
            assert.deepEqual([x, y, w, h], [0, 0, canvas.width, canvas.height]);
            const data = new Uint8ClampedArray(w * h * 4);
            for (let i = 0; i < data.length; i += 4) data.set(this.image.rgba, i);
            state.reads.push(data);
            return { data };
          },
        };
        state.contexts.push(context);
        return context;
      } };
      state.canvases.push(canvas);
      return canvas;
    },
    postMessage(reply, transfer) {
      if (state.failPost) throw new Error('post failure');
      const received = structuredClone(reply, { transfer });
      state.transfers.push(transfer);
      state.replies.push(received);
      for (const buffer of transfer) assert.equal(buffer.byteLength, 0, 'real transfer detaches output owner');
    },
    close() { state.closes++; },
  };
  return { state, ports };
}
function assertClosed(job) {
  for (const bitmap of new Set(Object.values(job.bitmaps).filter(isBitmap))) {
    assert.equal(bitmap.closes, 1, 'close each transferred bitmap once');
    assert.deepEqual([bitmap.width, bitmap.height], [0, 0]);
  }
}
function pixels(rgba, size) {
  return Uint8ClampedArray.from(Array.from({ length: size * size }, () => rgba).flat());
}

assert.equal(isSourcedTextureCompositionReady({ type: 'ready', protocol }), true);
for (const bad of [null, [], { type: 'ready', protocol: 'old' }, { type: 'ready', protocol, extra: 1 }]) {
  assert.equal(isSourcedTextureCompositionReady(bad), false);
}
assert.equal(validateSourcedTextureCompositionRequest(request(), isBitmap).type, 'compose');
const brick = request(1, { size: 512 });
brick.bitmaps.color = new Bitmap('color', 1024, 512);
brick.bitmaps.ao = new Bitmap('ao', 64, 32);
brick.bitmaps.rough = null;
assert.equal(validateSourcedTextureCompositionRequest(brick, isBitmap), brick,
  'preserve square composition of brick and upscaling of smaller optional maps');
for (const change of [
  { type: 'wrong' }, { protocol: 'old' }, { requestId: 0 }, { requestId: 1.5 },
  { requestId: Number.MAX_SAFE_INTEGER + 1 }, { key: '' }, { key: 'x'.repeat(1025) },
  { size: 0 }, { size: 1025 }, { size: 1.1 }, { includeSurface: true },
  { options: { tint: [1, 2] } },
  { options: { tint: Array(3) } }, { options: { desat: NaN } }, { options: { lift: -1 } },
  { options: { roughMul: Infinity } }, { options: { roughInAlpha: 1 } }, { options: { extra: true } },
  { extra: true },
]) assert.throws(() => validateSourcedTextureCompositionRequest(request(1, change), isBitmap));
for (const bitmaps of [
  { color: null, ao: null, rough: null }, { color: {}, ao: null, rough: null },
  { color: new Bitmap('color', 1), ao: null, rough: null },
  { color: new Bitmap('color', 1025), ao: null, rough: null },
  { color: new Bitmap('color'), ao: new Bitmap('ao', 0), rough: null },
]) assert.throws(() => validateSourcedTextureCompositionRequest(request(1, { bitmaps }), isBitmap));
const aliased = request(); aliased.bitmaps.rough = aliased.bitmaps.ao;
assert.throws(() => validateSourcedTextureCompositionRequest(aliased, isBitmap), /Aliased/);
assert.throws(() => validateSourcedTextureCompositionRequest(request()), /native bitmap/,
  'default request validation never accepts fake native ownership');

{
  const { state, ports } = fakePorts();
  const handler = createSourcedTextureCompositionHandler(ports);
  assert.equal(isSourcedTextureCompositionReady(state.replies[0]), true);
  assert.equal(state.canvases.length, 0, 'ready requires no Canvas allocation/composition');
  const job = request(), expected = expectation(job);
  handler.receive(job);
  const reply = validateSourcedTextureCompositionReply(state.replies.at(-1), expected);
  assert.equal(reply.type, 'complete');
  assert.deepEqual(reply.albedo, pixels([25, 38, 50, 128], 2));
  assert.equal(reply.surface, null);
  assert.equal(state.reads.length, 3, 'one input readback per consumed role, no output roundtrip');
  assert.equal(state.canvases.length, 2, 'one color surface and one shared AO/rough scratch');
  assert.equal(state.closes, 0, 'success leaves persistent worker alive');
  assertClosed(job);

  const building = request(2, { options: { separateSurface: true, tint: [0.5, 0.5, 0.5] }, includeSurface: true });
  const buildingExpected = expectation(building);
  handler.receive(building);
  const built = validateSourcedTextureCompositionReply(state.replies.at(-1), buildingExpected);
  assert.deepEqual(built.albedo, pixels([50, 75, 100, 255], 2), 'building AO is not multiplied twice');
  assert.deepEqual(built.surface, pixels([128, 128, 0, 255], 2));
  assert.equal(state.canvases.length, 2, 'persistent reuse is bounded');
  assert.equal(state.contexts.length, 2, 'retain matching readback contexts');
  assert.equal(state.resizes.filter(row => row.canvas === state.canvases[0]).length, 2,
    'color is reset to fresh-canvas state for the second job');
  assert.equal(state.resizes.filter(row => row.canvas === state.canvases[1]).length, 0,
    'same-size AO/rough scratch retains legacy reuse/reset behavior');
  assert.equal(state.reads.length, 6);
  assert.equal(state.transfers.at(-1).length, 2, 'albedo and surface transfer separately');
  assertClosed(building);

  const cached = request(3, { size: 1, options: { separateSurface: true }, includeSurface: false });
  const cachedExpected = expectation(cached);
  handler.receive(cached);
  const reused = validateSourcedTextureCompositionReply(state.replies.at(-1), cachedExpected);
  assert.deepEqual(reused.albedo, pixels([100, 150, 200, 255], 1));
  assert.equal(state.reads.length, 7, 'cached surface does not reread optional maps');
  assertClosed(cached);
  handler.dispose(); handler.dispose();
  assert.equal(state.closes, 1, 'idempotent final worker close');
  for (const canvas of state.canvases) assert.deepEqual([canvas.width, canvas.height], [0, 0]);
  const late = request(4);
  handler.receive(late);
  assertClosed(late);
  assert.equal(state.replies.length, 4, 'closed handler never posts a late reply');
}

for (const aoPresent of [false, true]) for (const roughPresent of [false, true]) {
  const { state, ports } = fakePorts(), handler = createSourcedTextureCompositionHandler(ports);
  const job = request();
  if (!aoPresent) job.bitmaps.ao = null;
  if (!roughPresent) job.bitmaps.rough = null;
  const expected = expectation(job);
  handler.receive(job);
  const reply = validateSourcedTextureCompositionReply(state.replies.at(-1), expected);
  assert.deepEqual(reply.albedo, pixels(aoPresent
    ? [25, 38, 50, roughPresent ? 128 : 230] : [50, 75, 100, roughPresent ? 128 : 230], 2));
  assert.equal(state.reads.length, 1 + Number(aoPresent) + Number(roughPresent));
  assertClosed(job); handler.dispose();

  const buildingPorts = fakePorts(), buildingHandler = createSourcedTextureCompositionHandler(buildingPorts.ports);
  const building = request(1, { options: { separateSurface: true }, includeSurface: true });
  if (!aoPresent) building.bitmaps.ao = null;
  if (!roughPresent) building.bitmaps.rough = null;
  const buildingExpected = expectation(building);
  buildingHandler.receive(building);
  const built = validateSourcedTextureCompositionReply(buildingPorts.state.replies.at(-1), buildingExpected);
  assert.deepEqual(built.albedo, pixels([100, 150, 200, 255], 2));
  assert.deepEqual(built.surface, pixels([aoPresent ? 128 : 255, roughPresent ? 128 : 230, 0, 255], 2));
  assert.equal(buildingPorts.state.reads.length, 1 + Number(aoPresent) + Number(roughPresent));
  assertClosed(building); buildingHandler.dispose();
}

for (const includeSurface of [false, true]) {
  const { state, ports } = fakePorts(), handler = createSourcedTextureCompositionHandler(ports);
  const job = request(1, { options: { separateSurface: true, roughInAlpha: true }, includeSurface });
  const expected = expectation(job);
  handler.receive(job);
  const reply = validateSourcedTextureCompositionReply(state.replies.at(-1), expected);
  assert.deepEqual(reply.albedo, pixels([100, 150, 200, 128], 2),
    'separateSurface omits albedo AO but never removes terrain roughness alpha');
  assert.equal(state.reads.length, includeSurface ? 3 : 2);
  if (includeSurface) assert.deepEqual(reply.surface, pixels([128, 128, 0, 255], 2));
  assertClosed(job); handler.dispose();
}

{
  const { state, ports } = fakePorts(), handler = createSourcedTextureCompositionHandler(ports);
  const job = request(1, { size: 4 });
  job.bitmaps.color = new Bitmap('color', 1024, 512);
  const expected = expectation(job);
  handler.receive(job);
  validateSourcedTextureCompositionReply(state.replies.at(-1), expected);
  assert.deepEqual(state.draws[0].from, [1024, 512]);
  assert.deepEqual(state.draws[0].to, [4, 4], 'retain legacy five-argument square stretch');
  assertClosed(job); handler.dispose();
}

for (const failure of ['failRead', 'failDraw', 'failContext']) {
  const { state, ports } = fakePorts(), handler = createSourcedTextureCompositionHandler(ports);
  state[failure] = true;
  const job = request(), expected = expectation(job);
  handler.receive(job);
  assert.equal(validateSourcedTextureCompositionReply(state.replies.at(-1), expected).type, 'error');
  assertClosed(job); handler.dispose();
  assert.equal(state.closes, 1);
  for (const canvas of state.canvases) assert.deepEqual([canvas.width, canvas.height], [0, 0]);
}

{
  const { state, ports } = fakePorts(), handler = createSourcedTextureCompositionHandler(ports);
  const invalid = request(1, { size: 0 });
  invalid.bitmaps.extra = new Bitmap('extra');
  handler.receive(invalid);
  assert.equal(state.replies.at(-1).type, 'error');
  assertClosed(invalid);
  assert.equal(state.canvases.length, 0, 'malformed jobs never allocate Canvas');
  const good = request(2), expected = expectation(good);
  handler.receive(good);
  assert.equal(validateSourcedTextureCompositionReply(state.replies.at(-1), expected).type, 'complete');
  const duplicate = request(2);
  handler.receive(duplicate);
  assert.match(state.replies.at(-1).error, /must increase/);
  assertClosed(duplicate); handler.dispose();
}

for (const failure of ['reply-post', 'ready-post', 'bitmap-close']) {
  const { state, ports } = fakePorts();
  if (failure === 'ready-post') state.failPost = true;
  const handler = createSourcedTextureCompositionHandler(ports);
  const job = request();
  if (failure === 'reply-post') state.failPost = true;
  if (failure === 'bitmap-close') job.bitmaps.ao.failClose = true;
  handler.receive(job);
  assert.equal(state.closes, 1, 'fatal transport/cleanup failure closes worker');
  for (const bitmap of Object.values(job.bitmaps)) assert.equal(bitmap.closes, 1);
  for (const canvas of state.canvases) assert.deepEqual([canvas.width, canvas.height], [0, 0]);
  handler.dispose();
  assert.equal(state.closes, 1);
}

{
  const expected = { requestId: 1, key: 'fixture', size: 2, includeSurface: true, closedBitmaps: 3 };
  const reply = { type: 'complete', protocol, requestId: 1, key: 'fixture', size: 2,
    albedo: new Uint8ClampedArray(16), surface: new Uint8ClampedArray(16), closedBitmaps: 3 };
  assert.equal(validateSourcedTextureCompositionReply(reply, expected), reply);
  for (const change of [
    { protocol: 'old' }, { requestId: 2 }, { key: 'other' }, { size: 1 }, { closedBitmaps: 2 },
    { albedo: new Uint8Array(16) }, { albedo: new Uint8ClampedArray(15) },
    { albedo: new Uint8ClampedArray(new ArrayBuffer(20), 4, 16) },
    { surface: null }, { surface: reply.albedo }, { extra: true },
  ]) assert.throws(() => validateSourcedTextureCompositionReply({ ...reply, ...change }, expected));
  const detached = new Uint8ClampedArray(16);
  structuredClone(detached, { transfer: [detached.buffer] });
  assert.throws(() => validateSourcedTextureCompositionReply({ ...reply, albedo: detached }, expected));
  assert.throws(() => validateSourcedTextureCompositionReply(reply, { ...expected, includeSurface: false }));
  for (const error of ['', 'x'.repeat(2049), 1]) {
    assert.throws(() => validateSourcedTextureCompositionReply({ type: 'error', protocol,
      requestId: 1, key: 'fixture', error }, expected));
  }
}
console.log('sourcedTextureCompositionWorker.selftest: PASS protocol, direct RGBA transfer, persistent ownership and cleanup');
