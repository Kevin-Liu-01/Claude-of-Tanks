import {
  bakeCirrusPixels,
  bakeCumulusPixels,
  type CumulusBakeConfig,
} from './skyCloudBake.ts';

interface CloudBakeRequest {
  cumulusSize: number;
  cirrusSize: number;
  config: CumulusBakeConfig;
}

interface CloudWorkerScope {
  onmessage: ((event: MessageEvent<CloudBakeRequest>) => void) | null;
  postMessage(message: Record<string, unknown>, transfer: Transferable[]): void;
}

const workerScope = globalThis as unknown as CloudWorkerScope;

workerScope.onmessage = ({ data }) => {
  const { cumulusSize, cirrusSize, config } = data;
  const cirrus = bakeCirrusPixels(cirrusSize, cirrusSize, config);
  workerScope.postMessage(
    { kind: 'cirrus', size: cirrusSize, pixels: cirrus },
    [cirrus.buffer as ArrayBuffer],
  );
  const cumulus = bakeCumulusPixels(cumulusSize, cumulusSize, config);
  workerScope.postMessage(
    { kind: 'cumulus', size: cumulusSize, pixels: cumulus },
    [cumulus.buffer as ArrayBuffer],
  );
};
