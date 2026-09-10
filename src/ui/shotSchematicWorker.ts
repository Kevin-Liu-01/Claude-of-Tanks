import type { RuntimeValue } from '../runtimeTypes.ts';
import { bakeSchematicSteps, validSchematicSize, type SchematicRequest } from './shotSchematic.ts';

export interface SchematicMessage { id: number; request: SchematicRequest }
export interface SchematicReply { id: number; request: SchematicRequest; blob: Blob | null }

export function isSchematicMessage(value: RuntimeValue): value is SchematicMessage {
  if (!value || typeof value !== 'object' || !('id' in value) || !('request' in value)) return false;
  const request = value.request;
  return typeof value.id === 'number' && Number.isSafeInteger(value.id) && value.id > 0
    && !!request && typeof request === 'object'
    && 'url' in request && typeof request.url === 'string' && request.url.length > 0 && request.url.length < 4096
    && 'width' in request && typeof request.width === 'number'
    && 'height' in request && typeof request.height === 'number'
    && validSchematicSize(request.width, request.height);
}

export interface SchematicWorkerPorts {
  decode(url: string): Promise<ImageBitmap>;
  createCanvas(width: number, height: number): OffscreenCanvas;
  post(reply: SchematicReply): void;
}

/** A worker job owns its decoded bitmap and both canvases, including errors. */
export function createSchematicWorkerHandler(ports: SchematicWorkerPorts): (data: RuntimeValue) => Promise<void> {
  let busy = false;
  return async data => {
    if (!isSchematicMessage(data)) return;
    if (busy) { ports.post({ ...data, blob: null }); return; }
    busy = true;
    let bitmap: ImageBitmap | null = null;
    let target: OffscreenCanvas | null = null;
    try {
      bitmap = await ports.decode(data.request.url);
      const steps = bakeSchematicSteps(bitmap, bitmap.width, bitmap.height, data.request, ports.createCanvas);
      let next = steps.next();
      while (!next.done) next = steps.next();
      target = next.value;
      if (!target) throw new Error('Schematic preparation incomplete');
      const blob = await target.convertToBlob({ type: 'image/png' });
      ports.post({ ...data, blob });
    } catch {
      ports.post({ ...data, blob: null });
    } finally {
      try { bitmap?.close(); }
      finally {
        if (target) { target.width = 0; target.height = 0; }
        busy = false;
      }
    }
  };
}

interface WorkerScope {
  onmessage: ((event: MessageEvent<RuntimeValue>) => void) | null;
  postMessage(reply: SchematicReply): void;
}
function isWorkerScope(value: RuntimeValue): value is WorkerScope {
  return !!value && typeof value === 'object' && 'postMessage' in value
    && typeof value.postMessage === 'function' && 'onmessage' in value;
}

const scope = globalThis;
if (typeof document === 'undefined' && isWorkerScope(scope)) {
  const handler = createSchematicWorkerHandler({
    decode: async url => {
      const response = await fetch(url, { credentials: 'same-origin' });
      if (!response.ok) throw new Error('Schematic image unavailable');
      return createImageBitmap(await response.blob());
    },
    createCanvas: (width, height) => new OffscreenCanvas(width, height),
    post: reply => scope.postMessage(reply),
  });
  scope.onmessage = event => { void handler(event.data).catch(() => { /* owning client deadline settles lost replies */ }); };
}
