import type { RuntimeValue } from '../runtimeTypes.ts';
import { composeAlbedoPixels, composeSurfacePixels } from './sourcedTextureComposer.ts';
import {
  SOURCED_TEXTURE_COMPOSITION_PROTOCOL,
  isNativeSourcedTextureBitmap,
  validateSourcedTextureCompositionRequest,
  type SourcedTextureBitmapGuard,
  type SourcedTextureCompositionComplete,
  type SourcedTextureCompositionError,
  type SourcedTextureCompositionPixels,
  type SourcedTextureCompositionReady,
  type SourcedTextureCompositionReply,
  type SourcedTextureCompositionRequest,
} from './sourcedTextureCompositionProtocol.ts';

interface CompositionContext {
  drawImage(image: ImageBitmap, x: number, y: number, width: number, height: number): void;
  getImageData(x: number, y: number, width: number, height: number): { data: Uint8ClampedArray };
}

interface CompositionCanvas {
  width: number;
  height: number;
  getContext(kind: '2d', options: CanvasRenderingContext2DSettings): CompositionContext | null;
}

export interface SourcedTextureCompositionWorkerPorts {
  createCanvas(width: number, height: number): CompositionCanvas;
  isBitmap: SourcedTextureBitmapGuard;
  postMessage(reply: SourcedTextureCompositionReady | SourcedTextureCompositionReply, transfer: ArrayBuffer[]): void;
  close(): void;
}

export interface SourcedTextureCompositionHandler {
  receive(value: RuntimeValue): void;
  dispose(): void;
}

function ownedBitmaps(value: RuntimeValue, isBitmap: SourcedTextureBitmapGuard): Set<ImageBitmap> {
  if (!value || typeof value !== 'object') return new Set();
  const bitmaps = (value as { bitmaps?: RuntimeValue }).bitmaps;
  if (!bitmaps || typeof bitmaps !== 'object') return new Set();
  return new Set(Object.values(bitmaps).filter(isBitmap));
}

function errorReply(value: RuntimeValue, error: RuntimeValue): SourcedTextureCompositionError {
  const identity = value as Partial<SourcedTextureCompositionRequest> | null;
  return { type: 'error', protocol: SOURCED_TEXTURE_COMPOSITION_PROTOCOL,
    requestId: typeof identity?.requestId === 'number' ? identity.requestId : 0,
    key: typeof identity?.key === 'string' ? identity.key : '',
    error: (error instanceof Error ? error.message : String(error)).slice(0, 2048) || 'Composition failed' };
}

/** Bounded retained surface, no startup Canvas work; readbacks are job-owned. */
function createPixelReader(ports: SourcedTextureCompositionWorkerPorts, fresh: boolean): {
  read(bitmap: ImageBitmap | null, size: number): SourcedTextureCompositionPixels | null;
  dispose(): void;
} {
  let canvas: CompositionCanvas | null = null;
  let context: CompositionContext | null = null;
  return {
    read(bitmap, size) {
      if (!bitmap) return null;
      const created = !canvas;
      if (!canvas) {
        canvas = ports.createCanvas(size, size);
        context = canvas.getContext('2d', { willReadFrequently: true });
      }
      if (!context) throw new Error('Canvas2D is unavailable for sourced texture composition');
      // Color matches a fresh legacy albedo canvas. Optional maps match the
      // existing scratch: only a size change clears it between AO/rough jobs.
      if (!created && (fresh || canvas.width !== size || canvas.height !== size)) {
        canvas.width = size;
        canvas.height = size;
      }
      context.drawImage(bitmap, 0, 0, size, size);
      const data = context.getImageData(0, 0, size, size).data;
      if (!(data instanceof Uint8ClampedArray) || !(data.buffer instanceof ArrayBuffer)
        || data.byteLength !== size * size * 4 || data.byteOffset !== 0
        || data.buffer.byteLength !== data.byteLength) throw new Error('Invalid Canvas2D readback');
      return data as SourcedTextureCompositionPixels;
    },
    dispose() {
      if (canvas) { canvas.width = 0; canvas.height = 0; }
      canvas = null;
      context = null;
    },
  };
}

function composeRequest(
  request: SourcedTextureCompositionRequest,
  readColor: (bitmap: ImageBitmap | null, size: number) => SourcedTextureCompositionPixels | null,
  read: (bitmap: ImageBitmap | null, size: number) => SourcedTextureCompositionPixels | null,
): SourcedTextureCompositionComplete {
  const { bitmaps, size, options, includeSurface } = request;
  const albedo = readColor(bitmaps.color, size)!;
  const wantsAO = !options.separateSurface || includeSurface;
  const wantsRough = options.roughInAlpha || includeSurface;
  const ao = wantsAO ? read(bitmaps.ao, size) : null;
  const rough = wantsRough ? read(bitmaps.rough, size) : null;
  composeAlbedoPixels(albedo, options.separateSurface ? null : ao, rough, options);
  const surface = includeSurface ? new Uint8ClampedArray(size * size * 4) : null;
  if (surface) composeSurfacePixels(surface, ao, rough, options.roughMul);
  return { type: 'complete', protocol: SOURCED_TEXTURE_COMPOSITION_PROTOCOL,
    requestId: request.requestId, key: request.key, size, albedo, surface, closedBitmaps: 0 };
}

function closeBitmaps(bitmaps: Set<ImageBitmap>): { count: number; failed: boolean } {
  let count = 0, failed = false;
  for (const bitmap of bitmaps) {
    try {
      bitmap.close();
      if (bitmap.width !== 0 || bitmap.height !== 0) throw new Error('Bitmap close was not observed');
      count++;
    } catch (_) { failed = true; }
  }
  return { count, failed };
}

/** Serial synchronous jobs; the client owns scheduling, deadlines and termination. */
export function createSourcedTextureCompositionHandler(
  ports: SourcedTextureCompositionWorkerPorts,
): SourcedTextureCompositionHandler {
  const colorReader = createPixelReader(ports, true);
  const reader = createPixelReader(ports, false);
  let stopped = false;
  let lastRequestId = 0;
  const dispose = (): void => {
    if (stopped) return;
    stopped = true;
    try { colorReader.dispose(); }
    finally { try { reader.dispose(); } finally { ports.close(); } }
  };
  const send = (reply: SourcedTextureCompositionReady | SourcedTextureCompositionReply): void => {
    const transfer: ArrayBuffer[] = [];
    if (reply.type === 'complete') {
      transfer.push(reply.albedo.buffer);
      if (reply.surface) transfer.push(reply.surface.buffer);
    }
    try { ports.postMessage(reply, transfer); } catch (_) { dispose(); }
  };
  const receive = (value: RuntimeValue): void => {
    const bitmaps = ownedBitmaps(value, ports.isBitmap);
    if (stopped) { closeBitmaps(bitmaps); return; }
    let reply: SourcedTextureCompositionReply | null = null;
    let cleanupFailed = false;
    try {
      const request = validateSourcedTextureCompositionRequest(value, ports.isBitmap);
      if (request.requestId <= lastRequestId) throw new Error('Composition requestId must increase');
      lastRequestId = request.requestId;
      reply = composeRequest(request, colorReader.read, reader.read);
    } catch (error) { reply = errorReply(value, error); }
    finally {
      const closed = closeBitmaps(bitmaps);
      cleanupFailed = closed.failed;
      if (cleanupFailed) reply = errorReply(value, new Error('Bitmap cleanup failed'));
      else if (reply?.type === 'complete') reply.closedBitmaps = closed.count;
    }
    send(reply ?? errorReply(value, new Error('Composition did not complete')));
    if (cleanupFailed) dispose();
  };
  send({ type: 'ready', protocol: SOURCED_TEXTURE_COMPOSITION_PROTOCOL });
  return { receive, dispose };
}

// Importing the handler from a headless selftest or the browser main thread
// has no side effects. Only the dedicated worker installs native ports.
if (typeof self !== 'undefined' && typeof document === 'undefined'
  && typeof OffscreenCanvas !== 'undefined' && typeof ImageBitmap !== 'undefined') {
  const scope = self as RuntimeValue as {
    onmessage: ((event: MessageEvent<RuntimeValue>) => void) | null;
    onmessageerror: (() => void) | null;
    postMessage(value: SourcedTextureCompositionReady | SourcedTextureCompositionReply, transfer: ArrayBuffer[]): void;
    close(): void;
  };
  const handler = createSourcedTextureCompositionHandler({
    createCanvas: (width, height) => new OffscreenCanvas(width, height),
    isBitmap: isNativeSourcedTextureBitmap,
    postMessage: (reply, transfer) => scope.postMessage(reply, transfer),
    close: () => { scope.onmessage = null; scope.onmessageerror = null; scope.close(); },
  });
  scope.onmessage = ({ data }) => handler.receive(data);
  scope.onmessageerror = () => handler.dispose();
}
