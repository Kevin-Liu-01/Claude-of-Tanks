import type { RuntimeValue } from '../runtimeTypes.ts';
import {
  CLOUD_BLUE_SIZE,
  CLOUD_LOCAL_SIZE,
  CLOUD_NOISE_SEED,
  CLOUD_WEATHER_SIZE,
  bakeCloudBlueNoise,
  bakeCloudLocalWeather,
  bakeCloudWeatherMap,
  bakeCloudWeatherStreets,
} from './cloudNoise.ts';

/**
 * Round 68 (2026-09-24): the volumetric cloud layer's noise bakes off the main thread (the pattern of
 * skyCloudWorker.ts). The buffers are posted as they finish, each transferred, smallest first. Clouds 2.0
 * (2026-10-06): the blue noise, the two round-71 weather fields and the local weather; the shape and detail volumes
 * are baked on the GPU (cloudVolumeNoise.ts).
 */
interface CloudNoiseRequest {
  seed?: number;
  weatherSize?: number;
  localSize?: number;
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
  const localSize = data?.localSize ?? CLOUD_LOCAL_SIZE;
  const blueSize = data?.blueSize ?? CLOUD_BLUE_SIZE;
  const post = (kind: string, size: number, pixels: Uint8Array): void => {
    workerScope.postMessage({ kind, size, pixels }, [pixels.buffer as ArrayBuffer]);
  };
  post('blue', blueSize, bakeCloudBlueNoise(blueSize, seed));
  post('weather', weatherSize, bakeCloudWeatherMap(weatherSize, seed));
  post('streets', weatherSize, bakeCloudWeatherStreets(weatherSize, seed));
  post('local', localSize, bakeCloudLocalWeather(localSize, seed));
};
