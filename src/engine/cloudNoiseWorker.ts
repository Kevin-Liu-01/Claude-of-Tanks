import type { RuntimeValue } from '../runtimeTypes.ts';
import {
  CLOUD_DETAIL_SIZE,
  CLOUD_NOISE_SEED,
  CLOUD_SHAPE_SIZE,
  CLOUD_WEATHER_SIZE,
  bakeCloudDetailVolume,
  bakeCloudShapeVolume,
  bakeCloudWeatherMap,
} from './cloudNoise.ts';

/**
 * Round 68 (2026-09-24): the volumetric cloud layer's noise bakes off the main thread (the pattern of
 * skyCloudWorker.ts). The three buffers are posted as they finish, each transferred, smallest first so the
 * layer can upload the weather field and the detail volume while the shape volume is still baking.
 */
interface CloudNoiseRequest {
  seed?: number;
  shapeSize?: number;
  detailSize?: number;
  weatherSize?: number;
}

interface CloudNoiseWorkerScope {
  onmessage: ((event: MessageEvent<CloudNoiseRequest>) => void) | null;
  postMessage(message: Record<string, RuntimeValue>, transfer: Transferable[]): void;
}

function isCloudNoiseWorkerScope(value: RuntimeValue): value is CloudNoiseWorkerScope {
  return value !== null && typeof value === 'object' &&
    'postMessage' in value && typeof value.postMessage === 'function' &&
    'onmessage' in value;
}

const workerScope: RuntimeValue = globalThis;
if (!isCloudNoiseWorkerScope(workerScope)) {
  throw new TypeError('cloud noise worker requires a WorkerGlobalScope');
}

workerScope.onmessage = ({ data }) => {
  const seed = data?.seed ?? CLOUD_NOISE_SEED;
  const weatherSize = data?.weatherSize ?? CLOUD_WEATHER_SIZE;
  const detailSize = data?.detailSize ?? CLOUD_DETAIL_SIZE;
  const shapeSize = data?.shapeSize ?? CLOUD_SHAPE_SIZE;
  const weather = bakeCloudWeatherMap(weatherSize, seed);
  workerScope.postMessage({ kind: 'weather', size: weatherSize, pixels: weather }, [weather.buffer as ArrayBuffer]);
  const detail = bakeCloudDetailVolume(detailSize, seed);
  workerScope.postMessage({ kind: 'detail', size: detailSize, pixels: detail }, [detail.buffer as ArrayBuffer]);
  const shape = bakeCloudShapeVolume(shapeSize, seed);
  workerScope.postMessage({ kind: 'shape', size: shapeSize, pixels: shape }, [shape.buffer as ArrayBuffer]);
};
