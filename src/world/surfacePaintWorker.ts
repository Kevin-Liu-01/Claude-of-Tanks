// The surface paint worker (2026-10-07, the time-to-battle lane): the props build's fixed-input prints — the straw's
// (hayPrint.ts) and the dry-stone walls' (fieldStoneSurface.ts) — painted off the main thread while the terrain and the
// vegetation build there. The same painters, the same arguments, the same typed arrays back: the same texels.
import { paintFieldStoneBuffers, type FieldStoneLithology } from './fieldStoneSurface.ts';
import { paintHayBuffers } from './hayPrint.ts';

export interface SurfacePaintJob {
  id: number;
  kind: 'hay' | 'fieldStone';
  size: number;
  seed: number;
  lithology?: FieldStoneLithology;
}

export type SurfacePaintReply =
  | { id: number; ok: true; buffers: Record<string, unknown> }
  | { id: number; ok: false; message: string };

declare const self: {
  onmessage: ((event: MessageEvent<SurfacePaintJob>) => void) | null;
  postMessage(reply: SurfacePaintReply, transfer?: ArrayBuffer[]): void;
};

self.onmessage = ({ data }) => {
  try {
    const painter = data.kind === 'hay'
      ? paintHayBuffers(data.size, data.seed)
      : paintFieldStoneBuffers(data.size, data.seed, data.lithology);
    let step = painter.next();
    while (!step.done) step = painter.next();
    const buffers = step.value as unknown as Record<string, unknown>;
    const transfer: ArrayBuffer[] = [];
    for (const value of Object.values(buffers)) {
      if (ArrayBuffer.isView(value) && value.buffer instanceof ArrayBuffer) transfer.push(value.buffer);
    }
    self.postMessage({ id: data.id, ok: true, buffers }, transfer);
  } catch (error) {
    self.postMessage({ id: data.id, ok: false, message: error instanceof Error ? error.message : 'Surface paint failed' });
  }
};
