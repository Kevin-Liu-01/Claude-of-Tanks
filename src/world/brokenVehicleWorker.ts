// src/world/brokenVehicleWorker.ts — a broken vehicle body off the main thread (perf-248, brokenVehiclePool.ts): the
// kit's own builder from the job's seed (brokenVehicleBuild.ts), sent back on the exact geometry wire.
import { buildBrokenVehicle } from './brokenVehicleBuild.ts';
import { packBrokenVehicleGeometry, type BrokenVehicleGeometryWire, type BrokenVehicleJob } from './brokenVehicleJob.ts';

export interface BrokenVehicleRequest { id: number; job: BrokenVehicleJob }
export type BrokenVehicleReply =
  | { id: number; ok: true; wire: BrokenVehicleGeometryWire }
  | { id: number; ok: false; message: string };

declare const self: {
  onmessage: ((event: MessageEvent<BrokenVehicleRequest>) => void) | null;
  postMessage(reply: BrokenVehicleReply, transfer?: ArrayBuffer[]): void;
};

// (a worker scope, never a page: a receipt imports the module for its types)
if (typeof window === 'undefined' && typeof self !== 'undefined' && typeof (self as { postMessage?: unknown }).postMessage === 'function') {
  self.onmessage = ({ data }) => {
    try {
      const { wire, transfer } = packBrokenVehicleGeometry(buildBrokenVehicle(data.job));
      self.postMessage({ id: data.id, ok: true, wire }, transfer);
    } catch (error) {
      // the build makes this body itself at its join (and fails there as the inline build would)
      self.postMessage({ id: data.id, ok: false, message: error instanceof Error ? error.message : String(error) });
    }
  };
}
