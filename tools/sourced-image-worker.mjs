import { stripTypeScriptTypes } from 'node:module';

export const SOURCE_WORKER_PROTOCOL = 'urban-sourced-image-worker-composition-v1';

/** Exact production bodies, with only TS/export syntax removed. */
function extractComposerBodies(source) {
  const slice = (start, end) => {
    if (source.split(start).length !== 2) throw new Error(`Ambiguous composer owner: ${start}`);
    const begin = source.indexOf(start), finish = source.indexOf(end, begin + start.length);
    if (finish <= begin) throw new Error(`Missing composer boundary: ${end}`);
    return source.slice(begin, finish);
  };
  const bodies = [
    slice('function canvasContext(', 'function readScaledPixels('),
    slice('function readScaledPixels(', 'function touchLru'),
    slice('export function composeAlbedo(', '/** Pack AO'),
    slice('export function composeSurface(', '// Pigment variants'),
  ].join('\n').replace(/^export /gm, '');
  return stripTypeScriptTypes(bodies);
}

/** Independent pinned legacy main-thread Canvas implementation. */
export function extractMainComposer(source) {
  return 'let _readbackCanvas = null, _readbackCtx = null, _readbackSize = 0;\n'
    + extractComposerBodies(source) + '\nreturn { composeAlbedo, composeSurface };';
}

export function extractWorkerComposer(source) {
  const marker = '/*__PRODUCTION_COMPOSERS__*/';
  const runtime = workerRuntime.toString();
  if (runtime.split(marker).length !== 2) throw new Error('Worker composer injection marker changed');
  return `(${runtime.replace(marker, extractComposerBodies(source))})(${JSON.stringify(SOURCE_WORKER_PROTOCOL)});\n`;
}

// Serialized into its own one-shot worker realm. No Canvas work runs at startup.
function workerRuntime(protocol) {
  let accepted = false;
  let activeReadbacks = null;
  const ownedCanvases = [], contextOwners = new Map();
  let _readbackCanvas = null, _readbackCtx = null, _readbackSize = 0;
  const texSize = size => {
    if (size !== 1024) throw new Error('Unexpected production texture size');
    return size;
  };
  const now = () => performance.now();
  const document = { createElement(tag) {
    if (tag !== 'canvas') throw new Error('Unexpected production element');
    const canvas = new OffscreenCanvas(1, 1);
    ownedCanvases.push(canvas);
    const nativeGetContext = canvas.getContext;
    Object.defineProperty(canvas, 'getContext', { configurable: true, value: function (...args) {
      const context = Reflect.apply(nativeGetContext, this, args);
      if (args[0] === '2d' && context && !contextOwners.has(context)) {
        const descriptor = Object.getOwnPropertyDescriptor(context, 'getImageData');
        const original = context.getImageData;
        const wrapper = function (...readArgs) {
          if (!activeReadbacks) return Reflect.apply(original, this, readArgs);
          const startMs = now();
          try { return Reflect.apply(original, this, readArgs); }
          finally { activeReadbacks.push({ startMs, durationMs: now() - startMs,
            width: readArgs[2], height: readArgs[3] }); }
        };
        Object.defineProperty(context, 'getImageData', { configurable: true, writable: true, value: wrapper });
        contextOwners.set(context, { descriptor, wrapper,
          attributes: context.getContextAttributes?.() ?? null });
      }
      return context;
    } });
    return canvas;
  } };

  /*__PRODUCTION_COMPOSERS__*/

  const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
  const keys = (value, allowed, required = allowed) => {
    if (!object(value) || Object.keys(value).some(key => !allowed.includes(key))
      || required.some(key => !Object.hasOwn(value, key))) throw new Error('Invalid message fields');
  };
  function validate(message) {
    keys(message, ['type', 'requestId', 'input', 'images']);
    if (message.type !== 'compose') throw new Error('Expected one compose message');
    if (typeof message.requestId !== 'string' || !/^[\w.-]{1,128}$/.test(message.requestId)) {
      throw new Error('Invalid requestId');
    }
    keys(message.input, ['kind', 'options']);
    const { kind, options } = message.input;
    if (!['terrain', 'building'].includes(kind)) throw new Error('Invalid composition kind');
    keys(options, ['roughInAlpha', 'roughMul', 'tint', 'desat', 'lift', 'separateSurface'], ['roughInAlpha']);
    if (options.roughInAlpha !== (kind === 'terrain')) throw new Error('Wrong runtime roughness contract');
    if (Object.hasOwn(options, 'separateSurface') && options.separateSurface !== (kind === 'building')) {
      throw new Error('Wrong runtime surface contract');
    }
    for (const [name, maximum] of [['roughMul', 4], ['desat', 1], ['lift', 1]]) {
      if (Object.hasOwn(options, name) && (!Number.isFinite(options[name]) || options[name] < 0 || options[name] > maximum)) {
        throw new Error(`Invalid ${name}`);
      }
    }
    if (options.tint != null && (!Array.isArray(options.tint) || options.tint.length !== 3
      || options.tint.some(value => !Number.isFinite(value) || value < 0 || value > 4))) throw new Error('Invalid tint');
    keys(message.images, ['color', 'ao', 'rough']);
    for (const [role, image] of Object.entries(message.images)) {
      if (role !== 'color' && image === null) continue;
      if (!(image instanceof ImageBitmap) || image.width !== 1024 || ![512, 1024].includes(image.height)) {
        throw new Error(`Invalid native bitmap: ${role}`);
      }
    }
    const present = Object.values(message.images).filter(Boolean);
    if (new Set(present).size !== present.length) throw new Error('Bitmap roles must have distinct native owners');
  }
  function cleanup(bitmaps) {
    const receipt = { bitmapsClosed: 0, canvasesCleared: 0, contextsRestored: 0, errors: [] };
    for (const [context, { descriptor, wrapper }] of contextOwners) {
      try {
        if (context.getImageData !== wrapper) throw new Error('Owned readback wrapper changed');
        if (descriptor) Object.defineProperty(context, 'getImageData', descriptor);
        else delete context.getImageData;
        receipt.contextsRestored++;
      } catch (error) { receipt.errors.push(String(error)); }
    }
    for (const bitmap of bitmaps) {
      try {
        bitmap.close();
        if (bitmap.width !== 0 || bitmap.height !== 0) throw new Error('Bitmap close not observed');
        receipt.bitmapsClosed++;
      } catch (error) { receipt.errors.push(String(error)); }
    }
    for (const canvas of ownedCanvases) {
      try {
        canvas.width = canvas.height = 0;
        if (canvas.width !== 0 || canvas.height !== 0) throw new Error('Canvas clear not observed');
        receipt.canvasesCleared++;
      } catch (error) { receipt.errors.push(String(error)); }
    }
    receipt.complete = receipt.errors.length === 0 && receipt.bitmapsClosed === bitmaps.size
      && receipt.canvasesCleared === ownedCanvases.length && receipt.contextsRestored === contextOwners.size;
    return receipt;
  }
  function receive(event) {
    if (accepted) return;
    accepted = true;
    self.onmessage = null;
    const message = event.data;
    const bitmaps = new Set(object(message?.images)
      ? Object.values(message.images).filter(value => value instanceof ImageBitmap) : []);
    const reply = { type: 'composition-result', protocol,
      requestId: typeof message?.requestId === 'string' ? message.requestId : null,
      status: 'failed', kind: message?.input?.kind ?? null, size: 1024,
      bitmapImagesReceived: bitmaps.size, outputs: [], timing: null, readyToTerminate: true };
    let transfers = [];
    try {
      validate(message);
      const { input, images } = message;
      reply.imagePresence = { color: true, ao: images.ao !== null, rough: images.rough !== null };
      const readbacks = [];
      activeReadbacks = readbacks;
      const compositionStartedAt = now();
      let canvases;
      try {
        const albedo = composeAlbedo(images.color, input.kind === 'terrain' ? images.ao : null,
          images.rough, input.options);
        canvases = [{ role: 'albedo', canvas: albedo }];
        if (input.kind === 'building') canvases.push({ role: 'surface',
          canvas: composeSurface(images.ao, images.rough, 1024, input.options.roughMul ?? 1) });
      } finally { activeReadbacks = null; }
      const compositionEndedAt = now();
      const outputReadbacks = [], outputPixels = [];
      for (const { role, canvas } of canvases) {
        const startMs = now();
        const pixels = canvas.getContext('2d').getImageData(0, 0, 1024, 1024).data;
        outputReadbacks.push({ role, startMs, durationMs: now() - startMs });
        outputPixels.push({ role, pixels });
      }
      const prepStartedAt = now();
      reply.outputs = outputPixels.map(({ role, pixels }) => {
        if (!(pixels instanceof Uint8ClampedArray) || pixels.byteLength !== 1024 * 1024 * 4) {
          throw new Error('Invalid native RGBA output');
        }
        const buffer = pixels.byteOffset === 0 && pixels.buffer.byteLength === pixels.byteLength
          ? pixels.buffer : pixels.slice().buffer;
        return { role, width: 1024, height: 1024, byteLength: pixels.byteLength, buffer };
      });
      transfers = reply.outputs.map(output => output.buffer);
      const transferPrepMs = now() - prepStartedAt;
      reply.timing = { compositionStartedAt, compositionEndedAt,
        compositionMs: compositionEndedAt - compositionStartedAt,
        readbacks, readbackMs: readbacks.reduce((sum, row) => sum + row.durationMs, 0),
        outputReadbacks, outputReadbackMs: outputReadbacks.reduce((sum, row) => sum + row.durationMs, 0),
        transferPrepMs, composerContextAttributes: [...contextOwners.values()].map(row => row.attributes) };
      reply.status = 'complete';
    } catch (error) { reply.error = String(error); reply.outputs = []; transfers = []; }
    finally {
      activeReadbacks = null;
      reply.cleanup = cleanup(bitmaps);
      if (!reply.cleanup.complete) {
        reply.status = 'failed'; reply.error = 'Worker resource cleanup failed'; reply.outputs = []; transfers = [];
      }
    }
    // This necessary output readback/packing precedes transfer. Main-thread
    // round-trip timing owns dispatch, transfer, receive and canvas adoption;
    // the main receipt labels subsequent termination/revoke cleanup separately.
    try { self.postMessage(reply, transfers); }
    finally { self.close(); }
  }
  self.onmessage = receive;
  self.onmessageerror = () => receive({ data: null });
}

/** Self-contained: may be serialized with .toString() into browser acquisition. */
export function validateWorkerReply(reply, requestId, input) {
  const require = (condition, message) => { if (!condition) throw new Error(message); };
  const finite = value => Number.isFinite(value) && value >= 0;
  require(reply?.type === 'composition-result' && reply.protocol === 'urban-sourced-image-worker-composition-v1', 'Wrong worker protocol');
  require(reply.requestId === requestId && typeof requestId === 'string', 'Wrong worker request identity');
  require(reply.status === 'complete' && !reply.error && reply.readyToTerminate === true, 'Worker did not complete');
  require(reply.kind === input.kind && ['terrain', 'building'].includes(reply.kind) && reply.size === 1024, 'Wrong worker output contract');
  const presence = reply.imagePresence;
  require(presence?.color === true && typeof presence.ao === 'boolean' && typeof presence.rough === 'boolean', 'Missing bitmap presence');
  if (input.images) {
    require(!!input.images.color && presence.ao === (input.images.ao != null)
      && presence.rough === (input.images.rough != null), 'Worker optional inputs differ');
  }
  const count = 1 + Number(presence.ao) + Number(presence.rough);
  require(reply.bitmapImagesReceived === count && reply.cleanup?.complete === true
    && reply.cleanup.bitmapsClosed === count && Array.isArray(reply.cleanup.errors)
    && reply.cleanup.errors.length === 0, 'Worker bitmap cleanup incomplete');
  const roles = input.kind === 'terrain' ? ['albedo'] : ['albedo', 'surface'];
  const canvasCount = roles.length + (count > 1 ? 1 : 0);
  require(reply.cleanup.canvasesCleared === canvasCount && reply.cleanup.contextsRestored === canvasCount, 'Worker canvas cleanup incomplete');
  require(Array.isArray(reply.outputs) && reply.outputs.length === roles.length, 'Missing worker outputs');
  for (let index = 0; index < roles.length; index++) {
    const output = reply.outputs[index];
    require(output.role === roles[index] && output.width === 1024 && output.height === 1024
      && output.byteLength === 4194304 && output.buffer instanceof ArrayBuffer
      && output.buffer.byteLength === 4194304, 'Invalid worker RGBA buffer');
  }
  require(new Set(reply.outputs.map(output => output.buffer)).size === roles.length, 'Aliased worker outputs');
  const timing = reply.timing;
  require(timing && ['compositionMs', 'readbackMs', 'outputReadbackMs', 'transferPrepMs',
    'compositionStartedAt', 'compositionEndedAt'].every(key => finite(timing[key])), 'Invalid worker timings');
  require(Math.abs(timing.compositionMs - (timing.compositionEndedAt - timing.compositionStartedAt)) <= 0.01, 'Worker composition span differs');
  require(Array.isArray(timing.readbacks) && timing.readbacks.length === count, 'Wrong composer readback count');
  for (const row of timing.readbacks) require(finite(row.startMs) && finite(row.durationMs)
    && row.width === 1024 && row.height === 1024 && row.startMs >= timing.compositionStartedAt
    && row.startMs + row.durationMs <= timing.compositionEndedAt + 0.01, 'Invalid composer readback');
  require(Math.abs(timing.readbackMs - timing.readbacks.reduce((sum, row) => sum + row.durationMs, 0)) <= 0.01
    && timing.readbackMs <= timing.compositionMs + 0.01, 'Worker readback total differs');
  require(Array.isArray(timing.outputReadbacks) && timing.outputReadbacks.length === roles.length, 'Missing output readback cost');
  for (let index = 0; index < roles.length; index++) {
    const row = timing.outputReadbacks[index];
    require(row.role === roles[index] && finite(row.startMs) && finite(row.durationMs)
      && row.startMs >= timing.compositionEndedAt, 'Output readback overlaps composition');
  }
  require(Math.abs(timing.outputReadbackMs - timing.outputReadbacks.reduce((sum, row) => sum + row.durationMs, 0)) <= 0.01, 'Worker output-readback total differs');
  return reply;
}
