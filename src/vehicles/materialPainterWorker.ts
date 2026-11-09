import type { RuntimeValue } from '../runtimeTypes.ts';
import { createMaterialPainter, type MaterialCanvas, type PlateFeatures } from './materialPainter.ts';
import {
  isMaterialPainterMessage, isMaterialPainterResult,
  type MaterialPainterReply, type MaterialPainterRequest, type MaterialPainterResult,
} from './materialPainterProtocol.ts';

/** Own every intermediate canvas, including the shared painter's grain tile. */
export function paintMaterialBase<C extends MaterialCanvas>(
  request: MaterialPainterRequest, createCanvas: (width: number, height: number) => C,
): MaterialPainterResult {
  const owned: C[] = [];
  const makeCanvas = (width: number, height: number): C => {
    const canvas = createCanvas(width, height); owned.push(canvas); return canvas;
  };
  try {
    const painter = createMaterialPainter(makeCanvas);
    const entry = { camoCanvas: makeCanvas(4, 4), normalCanvas: makeCanvas(4, 4),
      roughCanvas: makeCanvas(4, 4), feats: null as PlateFeatures | null };
    for (const checkpoint of painter.bakeBaseSteps(entry, request)) void checkpoint;
    if (!entry.feats) throw new Error('Material feature plan missing');
    const read = (canvas: C): Uint8ClampedArray<ArrayBuffer> => {
      const pixels = painter.canvas2d(canvas).getImageData(0, 0, canvas.width, canvas.height).data;
      if (!(pixels.buffer instanceof ArrayBuffer)) throw new Error('Material pixels not transferable');
      return new Uint8ClampedArray(pixels.buffer, pixels.byteOffset, pixels.length);
    };
    return { identity: request.identity, dimensions: { ...request.dimensions },
      albedo: read(entry.camoCanvas), normal: read(entry.normalCanvas), roughness: read(entry.roughCanvas),
      features: entry.feats };
  } finally {
    for (const canvas of owned) { canvas.width = 0; canvas.height = 0; }
  }
}

interface MaterialPainterWorkerPorts {
  /** The worker's realm can paint (the base material draws no text since glacis-269, so no font loads). */
  supported(): boolean;
  paint(request: MaterialPainterRequest): MaterialPainterResult;
  post(reply: MaterialPainterReply, transfer: ArrayBuffer[]): void;
}
export function createMaterialPainterWorkerHandler(ports: MaterialPainterWorkerPorts): (data: RuntimeValue) => void {
  const reject = (requestId: number): void => {
    try { ports.post({ requestId, ok: false }, []); } catch { /* lost owner; client deadline handles it */ }
  };
  return data => {
    if (!isMaterialPainterMessage(data)) return;
    try {
      if (!ports.supported()) throw new Error('Material worker unavailable');
      const result = ports.paint(data.request);
      if (!isMaterialPainterResult(result, data.request)) throw new Error('Material worker result invalid');
      const transfer: ArrayBuffer[] = [];
      for (const pixels of [result.albedo, result.normal, result.roughness]) {
        if (!(pixels.buffer instanceof ArrayBuffer)) throw new Error('Material pixels not transferable');
        transfer.push(pixels.buffer);
      }
      ports.post({ requestId: data.requestId, ok: true, result }, transfer);
    } catch { reject(data.requestId); }
  };
}

interface PainterWorkerScope {
  onmessage: ((event: MessageEvent<RuntimeValue>) => void) | null;
  postMessage(reply: MaterialPainterReply, transfer: ArrayBuffer[]): void;
}
function isPainterWorkerScope(value: RuntimeValue): value is PainterWorkerScope {
  return value !== null && typeof value === 'object' && 'postMessage' in value
    && typeof value.postMessage === 'function' && 'onmessage' in value;
}
function nativeWorkerSupported(): boolean {
  return typeof OffscreenCanvas === 'function' && typeof Path2D === 'function' && typeof DOMMatrix === 'function';
}
function startNativeWorker(scope: PainterWorkerScope): void {
  const handler = createMaterialPainterWorkerHandler({
    supported: nativeWorkerSupported,
    paint: request => paintMaterialBase(request, (width, height) => new OffscreenCanvas(width, height)),
    post: (reply, transfer) => scope.postMessage(reply, transfer),
  });
  scope.onmessage = event => { handler(event.data); };
}

const workerScope = globalThis;
if (typeof document === 'undefined' && isPainterWorkerScope(workerScope)) startNativeWorker(workerScope);
