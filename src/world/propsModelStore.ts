export interface BakedPropModel {
  positions: Float32Array;
  normals: Float32Array;
  colors: Float32Array;
  indices: Uint16Array;
  bbox: { min: [number, number, number]; max: [number, number, number] };
  tris: number;
}

export type BakedPropModels = Record<string, BakedPropModel>;

const MAGIC = 'COTPROP1';
const HEADER_BYTES = 12;
const RECORD_HEADER_BYTES = 40;
const align4 = (value: number): number => (value + 3) & ~3;

function requireRange(offset: number, bytes: number, length: number, label: string): void {
  if (offset < 0 || bytes < 0 || offset + bytes > length) {
    throw new Error(`prop archive truncated while reading ${label}`);
  }
}

/** Decode zero-copy typed-array views over one immutable decompressed archive. */
export function decodePropModelArchive(buffer: ArrayBuffer): BakedPropModels {
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength < HEADER_BYTES) {
    throw new TypeError('prop archive requires an ArrayBuffer');
  }
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const magic = new TextDecoder().decode(bytes.subarray(0, 8));
  if (magic !== MAGIC) throw new Error('invalid prop archive signature');
  const count = view.getUint32(8, true);
  const models: BakedPropModels = Object.create(null) as BakedPropModels;
  let offset = HEADER_BYTES;
  for (let record = 0; record < count; record += 1) {
    requireRange(offset, RECORD_HEADER_BYTES, buffer.byteLength, 'record header');
    const nameLength = view.getUint16(offset, true);
    const indexBytes = view.getUint16(offset + 2, true);
    const vertexCount = view.getUint32(offset + 4, true);
    const indexCount = view.getUint32(offset + 8, true);
    const tris = view.getUint32(offset + 12, true);
    if (indexBytes !== 2) throw new Error('unsupported prop archive index width');
    const bounds: number[] = [];
    for (let index = 0; index < 6; index += 1) {
      bounds.push(view.getFloat32(offset + 16 + index * 4, true));
    }
    offset += RECORD_HEADER_BYTES;
    requireRange(offset, nameLength, buffer.byteLength, 'model name');
    const name = new TextDecoder().decode(bytes.subarray(offset, offset + nameLength));
    offset += align4(nameLength);
    if (!name || models[name]) throw new Error('duplicate or empty prop archive model name');
    const scalarCount = vertexCount * 3;
    const scalarBytes = scalarCount * 4;
    requireRange(offset, scalarBytes * 3 + indexCount * indexBytes,
      buffer.byteLength, `${name} streams`);
    const positions = new Float32Array(buffer, offset, scalarCount);
    offset += scalarBytes;
    const normals = new Float32Array(buffer, offset, scalarCount);
    offset += scalarBytes;
    const colors = new Float32Array(buffer, offset, scalarCount);
    offset += scalarBytes;
    const indices = new Uint16Array(buffer, offset, indexCount);
    offset += indexCount * indexBytes;
    offset = align4(offset);
    models[name] = {
      positions,
      normals,
      colors,
      indices,
      bbox: {
        min: [bounds[0], bounds[1], bounds[2]],
        max: [bounds[3], bounds[4], bounds[5]],
      },
      tris,
    };
  }
  if (offset !== buffer.byteLength) throw new Error('prop archive has trailing data');
  return models;
}

let residentModels: BakedPropModels | null = null;
let loadPromise: Promise<BakedPropModels> | null = null;

async function loadPackedModels(): Promise<BakedPropModels> {
  if (typeof DecompressionStream !== 'function') {
    const fallback = await import('./propsModelFallback.ts');
    return fallback.loadFallbackPropModels() as BakedPropModels;
  }
  const url = new URL('./props-models.bin.gz', import.meta.url);
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`prop archive request failed (${response.status})`);
  }
  // Static hosts disagree about `.gz`: Vite preview and some CDNs advertise
  // Content-Encoding and Fetch hands us already-decoded bytes; object stores
  // often serve the same file as opaque bytes. Support both without guessing.
  if (response.headers.get('content-encoding')?.toLowerCase().includes('gzip')) {
    return decodePropModelArchive(await response.arrayBuffer());
  }
  const decompressed = response.body.pipeThrough(new DecompressionStream('gzip'));
  return decodePropModelArchive(await new Response(decompressed).arrayBuffer());
}

/** Start the exact prop archive transfer; concurrent callers share one retryable request. */
export function preloadPropModels(): Promise<BakedPropModels> {
  if (residentModels) return Promise.resolve(residentModels);
  if (loadPromise) return loadPromise;
  const request = loadPackedModels().then((models) => {
    residentModels = models;
    return models;
  });
  loadPromise = request;
  request.catch(() => {
    if (loadPromise === request) loadPromise = null;
  });
  return request;
}

export function requirePropModels(): BakedPropModels {
  if (!residentModels) throw new Error('prop models were not preloaded before world construction');
  return residentModels;
}
