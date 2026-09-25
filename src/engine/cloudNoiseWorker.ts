import type { RuntimeValue } from '../runtimeTypes.ts';
import {
  CLOUD_BLUE_SIZE,
  CLOUD_CURL_SIZE,
  CLOUD_DETAIL_SIZE,
  CLOUD_NOISE_SEED,
  CLOUD_SHAPE_SIZE,
  CLOUD_WEATHER_SIZE,
  bakeCloudBlueNoise,
  bakeCloudCurlVolume,
  bakeCloudDetailVolume,
  bakeCloudShapeVolume,
  bakeCloudWeatherMap,
  bakeCloudWeatherStreets,
} from './cloudNoise.ts';

/**
 * Round 68 (2026-09-24): the volumetric cloud layer's noise bakes off the main thread (the pattern of
 * skyCloudWorker.ts). The buffers are posted as they finish, each transferred, smallest first so the layer can
 * upload the blue-noise tile, the two weather fields and the curl and detail volumes while the shape volume is
 * still baking (round 71 added the street field, the curl volume and the blue noise).
 */
interface CloudNoiseRequest {
  seed?: number;
  shapeSize?: number;
  detailSize?: number;
  weatherSize?: number;
  curlSize?: number;
  blueSize?: number;
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
  const curlSize = data?.curlSize ?? CLOUD_CURL_SIZE;
  const blueSize = data?.blueSize ?? CLOUD_BLUE_SIZE;
  const post = (kind: string, size: number, pixels: Uint8Array): void => {
    workerScope.postMessage({ kind, size, pixels }, [pixels.buffer as ArrayBuffer]);
  };
  post('blue', blueSize, bakeCloudBlueNoise(blueSize, seed));
  post('weather', weatherSize, bakeCloudWeatherMap(weatherSize, seed));
  post('streets', weatherSize, bakeCloudWeatherStreets(weatherSize, seed));
  post('curl', curlSize, bakeCloudCurlVolume(curlSize, seed));
  post('detail', detailSize, bakeCloudDetailVolume(detailSize, seed));
  post('shape', shapeSize, bakeCloudShapeVolume(shapeSize, seed));
};
