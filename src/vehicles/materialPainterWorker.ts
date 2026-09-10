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

export interface MaterialPainterFontPorts {
  fonts: Pick<FontFaceSet, 'add' | 'delete' | 'has' | 'check'>;
  readBytes(url: string): Promise<ArrayBuffer>;
  createFont(bytes: ArrayBuffer): FontFace;
}
/** Individual loaded font readiness; FontFaceSet.ready may wait on rendering. */
export async function loadMaterialPainterFont(url: string, ports: MaterialPainterFontPorts): Promise<boolean> {
  let font: FontFace | null = null;
  try {
    font = ports.createFont(await ports.readBytes(url));
    ports.fonts.add(font);
    await font.load();
    if (font.status !== 'loaded' || !ports.fonts.has(font)
      || !ports.fonts.check("900 16px 'ABC Monument Grotesk'", '0123456789')) throw new Error('Material font unavailable');
    return true;
  } catch {
    if (font) { try { ports.fonts.delete(font); } catch { /* failed realm will be terminated */ } }
    return false;
  }
}

export interface MaterialPainterWorkerPorts {
  initialize(fontUrl: string): Promise<boolean>;
  paint(request: MaterialPainterRequest): MaterialPainterResult;
  post(reply: MaterialPainterReply, transfer: ArrayBuffer[]): void;
}
export function createMaterialPainterWorkerHandler(ports: MaterialPainterWorkerPorts): (data: RuntimeValue) => Promise<void> {
  let busy = false;
  const reject = (requestId: number): void => {
    try { ports.post({ requestId, ok: false }, []); } catch { /* lost owner; client deadline handles it */ }
  };
  return async data => {
    if (!isMaterialPainterMessage(data)) return;
    if (busy) { reject(data.requestId); return; }
    busy = true;
    try {
      if (!await ports.initialize(data.fontUrl)) throw new Error('Material worker unavailable');
      const result = ports.paint(data.request);
      if (!isMaterialPainterResult(result, data.request)) throw new Error('Material worker result invalid');
      const transfer: ArrayBuffer[] = [];
      for (const pixels of [result.albedo, result.normal, result.roughness]) {
        if (!(pixels.buffer instanceof ArrayBuffer)) throw new Error('Material pixels not transferable');
        transfer.push(pixels.buffer);
      }
      ports.post({ requestId: data.requestId, ok: true, result }, transfer);
    } catch { reject(data.requestId); }
    finally { busy = false; }
  };
}

interface PainterWorkerScope {
  fonts: FontFaceSet;
  onmessage: ((event: MessageEvent<RuntimeValue>) => void) | null;
  postMessage(reply: MaterialPainterReply, transfer: ArrayBuffer[]): void;
}
function isPainterWorkerScope(value: RuntimeValue): value is PainterWorkerScope {
  return value !== null && typeof value === 'object' && 'postMessage' in value
    && typeof value.postMessage === 'function' && 'onmessage' in value && 'fonts' in value;
}
function nativeWorkerSupported(): boolean {
  return typeof OffscreenCanvas === 'function' && typeof FontFace === 'function'
    && typeof Path2D === 'function' && typeof DOMMatrix === 'function' && typeof fetch === 'function';
}
function startNativeWorker(scope: PainterWorkerScope): void {
  let ready: Promise<boolean> | null = null;
  let fontOwner: string | null = null;
  const handler = createMaterialPainterWorkerHandler({
    initialize: fontUrl => {
      if (!nativeWorkerSupported() || (fontOwner !== null && fontOwner !== fontUrl)) return Promise.resolve(false);
      fontOwner = fontUrl;
      ready ??= loadMaterialPainterFont(fontUrl, {
        fonts: scope.fonts,
        readBytes: async url => {
          const response = await fetch(url);
          if (!response.ok) throw new Error('Material font download failed');
          return response.arrayBuffer();
        },
        createFont: bytes => new FontFace('ABC Monument Grotesk', bytes,
          { weight: '700 900', style: 'normal', display: 'optional' }),
      });
      return ready;
    },
    paint: request => paintMaterialBase(request, (width, height) => new OffscreenCanvas(width, height)),
    post: (reply, transfer) => scope.postMessage(reply, transfer),
  });
  scope.onmessage = event => { void handler(event.data); };
}

const workerScope = globalThis;
if (typeof document === 'undefined' && isPainterWorkerScope(workerScope)) startNativeWorker(workerScope);
