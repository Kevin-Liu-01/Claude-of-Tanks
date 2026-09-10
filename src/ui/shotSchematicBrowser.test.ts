// Native raster regression only; never imported by the application.
import { legacySchematic } from './shotSchematicReference.test.ts';
import { createSchematicClient, prepareSchematicFallback, type SchematicWorkerPort } from './shotSchematicClient.ts';
import { iconUrl } from './icons.ts';

interface Case { id: string; url: string; width: number; height: number }
function imageAt(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => { image.onload = image.onerror = null; resolve(image); };
    image.onerror = () => { image.onload = image.onerror = null; reject(new Error(`Image unavailable: ${url}`)); };
    image.src = url;
  });
}
async function pixelsAt(url: string): Promise<Uint8ClampedArray<ArrayBuffer>> {
  const image = await imageAt(url), canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
  try {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('No native Canvas2D');
    ctx.drawImage(image, 0, 0);
    return new Uint8ClampedArray(ctx.getImageData(0, 0, canvas.width, canvas.height).data);
  } finally { canvas.width = canvas.height = 0; image.src = ''; }
}
async function digest(pixels: Uint8ClampedArray<ArrayBuffer>): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', pixels));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}
function differences(expected: Uint8ClampedArray, actual: Uint8ClampedArray) {
  let bytes = 0, maxDelta = 0;
  const first: Array<{ index: number; expected: number; actual: number }> = [];
  for (let index = 0; index < Math.max(expected.length, actual.length); index++) {
    if (expected[index] === actual[index]) continue;
    bytes++; maxDelta = Math.max(maxDelta, Math.abs(expected[index] - actual[index]));
    if (first.length < 12) first.push({ index, expected: expected[index], actual: actual[index] });
  }
  return { bytes, maxDelta, first };
}
async function syntheticSource(): Promise<string> {
  const canvas = document.createElement('canvas'); canvas.width = 61; canvas.height = 37;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('No Canvas2D');
  const image = ctx.createImageData(canvas.width, canvas.height);
  for (let i = 0; i < image.data.length; i += 4) {
    image.data[i] = (i * 73) % 256; image.data[i + 1] = (i * 13 + 33) % 256; image.data[i + 2] = (i * 23 + 141) % 256;
    image.data[i + 3] = [0, 1, 7, 8, 15, 16, 128, 216, 255][i / 4 % 9];
  }
  ctx.putImageData(image, 0, 0);
  try {
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('Fixture encode unavailable');
    return URL.createObjectURL(blob);
  } finally { canvas.width = canvas.height = 0; }
}

export async function runSchematicParity() {
  const NativeWorker = window.Worker;
  let constructed = 0, successfulReplies = 0, terminated = 0, workerFallbacks = 0;
  class ObservedWorker extends NativeWorker {
    constructor(url: string | URL, options?: WorkerOptions) {
      super(url, options); constructed++;
      this.addEventListener('message', event => {
        if (event.data?.blob instanceof Blob && event.data.blob.type === 'image/png') successfulReplies++;
      });
    }
    override terminate(): void { terminated++; super.terminate(); }
  }
  // Exercise the production validator, but NEVER let a rejected worker reply
  // become a successful DOM fallback disguised as native-worker parity.
  const workerClient = createSchematicClient({
    worker: () => {
      const native = new ObservedWorker(new URL('./shotSchematicWorker.ts', import.meta.url), { type: 'module' });
      const port: SchematicWorkerPort = {
        onmessage: null, onerror: null, onmessageerror: null,
        postMessage: message => native.postMessage(message),
        terminate: () => { native.onmessage = native.onerror = native.onmessageerror = null; native.terminate(); },
      };
      native.onmessage = event => port.onmessage?.({ data: event.data });
      native.onerror = () => port.onerror?.(); native.onmessageerror = () => port.onmessageerror?.();
      return port;
    },
    fallback: async () => { workerFallbacks++; throw new Error('Worker leg must not use fallback'); },
    dataUrl: blob => new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null); reader.readAsDataURL(blob);
    }),
    schedule: (callback, delay) => { const timer = setTimeout(callback, delay); return () => clearTimeout(timer); },
  });
  const synthetic = await syntheticSource();
  const cases: Case[] = [
    ...['m1a2', 't90'].flatMap(id => [
      { id: `${id}-top`, url: iconUrl(id, 'top'), width: 192, height: 192 },
      { id: `${id}-side`, url: iconUrl(id, 'side'), width: 368, height: 184 },
    ]),
    { id: 'transparent-edges', url: synthetic, width: 192, height: 192 },
    { id: 'tiny-transparent', url: synthetic, width: 7, height: 3 },
    { id: 'one-pixel', url: synthetic, width: 1, height: 1 },
  ];
  const rows = [];
  try {
    for (const item of cases) {
      const image = await imageAt(item.url);
      const reference = legacySchematic(image, item.width, item.height);
      const expected = await pixelsAt(reference);
      const repliesBefore = successfulReplies;
      const workerUrl = await workerClient.get(item.id, { ...item, url: new URL(item.url, document.baseURI).href });
      const fallbackBlob = await prepareSchematicFallback(item, new AbortController().signal);
      if (!workerUrl || !fallbackBlob) throw new Error(`Schematic preparation failed: ${item.id}`);
      const fallbackUrl = URL.createObjectURL(fallbackBlob);
      try {
        const worker = await pixelsAt(workerUrl), fallback = await pixelsAt(fallbackUrl);
        rows.push({ id: item.id, source: [image.naturalWidth, image.naturalHeight], output: [item.width, item.height],
          workerExecuted: successfulReplies === repliesBefore + 1 && workerFallbacks === 0,
          referenceHash: await digest(expected), workerHash: await digest(worker), fallbackHash: await digest(fallback),
          worker: differences(expected, worker), fallback: differences(expected, fallback) });
      } finally { URL.revokeObjectURL(fallbackUrl); image.src = ''; }
    }
    return { rows, worker: { constructed, successfulReplies, fallbacks: workerFallbacks, get terminated() { return terminated; } },
      pass: workerFallbacks === 0 && rows.length === cases.length
        && rows.every(row => row.workerExecuted && !row.worker.bytes && !row.fallback.bytes) };
  } finally {
    workerClient.dispose(); URL.revokeObjectURL(synthetic);
  }
}
