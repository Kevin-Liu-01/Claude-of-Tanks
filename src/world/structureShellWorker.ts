// src/world/structureShellWorker.ts — the shell bands of one structure, off the main thread (2026-10-13, the perf stream:
// Plan W, structureShellPool.ts). The same derivation the build runs inline (structureCollision.ts
// deriveRuntimeStructureShellBands) over the geometry the wire rebuilds (structureShellWire.ts).
import { deriveRuntimeStructureShellBands, type StructureCollisionRuntimeBand } from './structureCollision.ts';
import { unpackStructureShellWire, type StructureShellWire } from './structureShellWire.ts';

export interface StructureShellRequest { id: number; wire: StructureShellWire }
export type StructureShellReply =
  | { id: number; ok: true; bands: StructureCollisionRuntimeBand[] }
  | { id: number; ok: false; message: string };

declare const self: {
  onmessage: ((event: MessageEvent<StructureShellRequest>) => void) | null;
  postMessage(reply: StructureShellReply): void;
};

self.onmessage = ({ data }) => {
  try {
    self.postMessage({ id: data.id, ok: true, bands: deriveRuntimeStructureShellBands(unpackStructureShellWire(data.wire)) });
  } catch (error) {
    // the main thread derives this structure itself (and fails there as the inline build would)
    self.postMessage({ id: data.id, ok: false, message: error instanceof Error ? error.message : String(error) });
  }
};
