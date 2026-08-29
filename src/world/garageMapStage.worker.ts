// Full battlefield heightfields are intentionally sampled off the UI thread.
// Only the bounded, transferable Garage slice returns to the renderer.
import { sampleGarageMapStageData } from './garageMapStage.ts';

interface WorkerScope {
  onmessage: ((event: MessageEvent<string>) => void) | null;
  postMessage(message: unknown, transfer: Transferable[]): void;
}

const scope = globalThis as unknown as WorkerScope;
scope.onmessage = (event) => {
  const sample = sampleGarageMapStageData(event.data);
  scope.postMessage(sample, [
    sample.terrainPositions.buffer,
    sample.terrainColors.buffer,
    sample.terrainIndices.buffer,
  ]);
};
