// The surface paint worker (2026-10-07, the time-to-battle lane): the props build's fixed-input prints — the straw's
// (hayPrint.ts), the dry-stone walls' (fieldStoneSurface.ts), and (2026-10-08) the tiles it paints from its own noise:
// the boulders' rock tile (rockDressing.ts) and the building kit's detail tiles (structureDetailTile.ts) — painted off
// the main thread while the terrain and the vegetation build there. The same painters, the same arguments (the props
// noise rebuilt from its seed), the same typed arrays back: the same texels.
import { SimplexNoise } from '../engine/simplexFast.ts';
import { paintFieldStoneBuffers, type FieldStoneLithology } from './fieldStoneSurface.ts';
import { paintHayBuffers } from './hayPrint.ts';
import { paintRockDetailBuffers, type BoulderLithology } from './rockDressing.ts';
import { paintStructureDetailBuffers } from './structureDetailTile.ts';

/** A print the worker paints, by its exact arguments (surfacePaintPrefetch.ts surfacePaintKey). */
export type SurfacePaintRequest =
  | { kind: 'hay'; size: number; seed: number }
  | { kind: 'fieldStone'; size: number; seed: number; lithology?: FieldStoneLithology }
  | { kind: 'rockDetail'; lithology: BoulderLithology; noiseSeed: number }
  | { kind: 'structureDetail'; detail: 'wood' | 'canvas' | 'steel'; noiseSeed: number };

export type SurfacePaintJob = SurfacePaintRequest & { id: number };

export type SurfacePaintReply =
  | { id: number; ok: true; buffers: Record<string, unknown> }
  | { id: number; ok: false; message: string };

declare const self: {
  onmessage: ((event: MessageEvent<SurfacePaintJob>) => void) | null;
  postMessage(reply: SurfacePaintReply, transfer?: ArrayBuffer[]): void;
};

/** The props build's noise for its seed (props.ts: new SimplexNoise({ random: mulberry32(seed + 7) }); this is seed + 7). */
export function propsPaintNoise(noiseSeed: number): SimplexNoise {
  let a = noiseSeed;
  const random = (): number => {
    a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
  return new SimplexNoise({ random });
}

const drain = <T>(painter: Generator<unknown, T, void>): T => {
  let step = painter.next();
  while (!step.done) step = painter.next();
  return step.value;
};

/** One job's buffers (the painter its request names). */
function paintSurfaceJob(data: SurfacePaintRequest): Record<string, unknown> {
  switch (data.kind) {
    case 'hay': return drain(paintHayBuffers(data.size, data.seed)) as unknown as Record<string, unknown>;
    case 'fieldStone': return drain(paintFieldStoneBuffers(data.size, data.seed, data.lithology)) as unknown as Record<string, unknown>;
    case 'rockDetail': return drain(paintRockDetailBuffers(propsPaintNoise(data.noiseSeed), data.lithology)) as unknown as Record<string, unknown>;
    case 'structureDetail': return paintStructureDetailBuffers(propsPaintNoise(data.noiseSeed), data.detail) as unknown as Record<string, unknown>;
    default: throw new Error(`Unknown surface paint ${(data as { kind?: string }).kind}`);
  }
}

// (a worker scope, or a receipt's stand-in `self`: never a page, whose window would take the handler)
if (typeof window === 'undefined' && typeof self !== 'undefined' && typeof (self as { postMessage?: unknown }).postMessage === 'function') {
  self.onmessage = ({ data }) => {
    try {
      const buffers = paintSurfaceJob(data);
      const transfer: ArrayBuffer[] = [];
      for (const value of Object.values(buffers)) {
        if (ArrayBuffer.isView(value) && value.buffer instanceof ArrayBuffer && !transfer.includes(value.buffer)) transfer.push(value.buffer);
      }
      self.postMessage({ id: data.id, ok: true, buffers }, transfer);
    } catch (error) {
      self.postMessage({ id: data.id, ok: false, message: error instanceof Error ? error.message : 'Surface paint failed' });
    }
  };
}
