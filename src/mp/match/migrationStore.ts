/**
 * What a client keeps for a host migration (P2 client lane; docs/MULTIPLAYER-V2.md §13.2 "Keyframes"): the browser
 * host rides two sealed blobs inside wire EVENT messages — `mp:keyframe` (every entity, every
 * ROOM_MATCH_KEYFRAME_INTERVAL_MS) and `mp:config` (the boot configuration) — in base64url chunks under the event
 * limit. The MatchClient hands every event here first; migration chunks are assembled and retained (the newest
 * complete blob per kind), never presented. Only the seat the room elects can open a blob: it receives the host
 * secret in `host_changed` (src/mp/host/migrationState.ts). Bounded: one blob in flight per kind.
 */
import type { WireEvent } from '../wire/messages.ts';
import { base64UrlToBytes } from './base64url.ts';

export const MIGRATION_EVENT_KIND = Object.freeze({
  CONFIG: 'mp:config',
  KEYFRAME: 'mp:keyframe',
} as const);

export const MIGRATION_MAX_CHUNKS = 64;

export interface MigrationChunkPayload {
  id: number;
  tick: number;
  part: number;
  parts: number;
  data: string;
}

export function isMigrationEventKind(kind: string): boolean {
  return kind === MIGRATION_EVENT_KIND.CONFIG || kind === MIGRATION_EVENT_KIND.KEYFRAME;
}

export interface RetainedBlob {
  id: number;
  tick: number;
  /** The host generation this client followed when the chunks arrived (its own view, never the sender's claim). */
  generation: number;
  blob: Uint8Array;
  /** Local clock when the last chunk arrived. */
  receivedAtMs: number;
}

export class MigrationStore {
  private generation = 0;
  private readonly pending = new Map<string, { generation: number; id: number; tick: number; parts: number; chunks: Array<Uint8Array | null>; received: number }>();
  private readonly complete = new Map<string, RetainedBlob>();
  private chunksReceived = 0;
  private blobsCompleted = 0;
  private rejected = 0;

  /**
   * A newer host generation (the session followed a host change): its blobs outrank every older generation's whatever
   * tick they claim — the chunk tick is the sealer's plaintext word, so an earlier host could otherwise pin its own state
   * over every later host's (security audit 2026-10-22). Completed blobs stay (the elected seat resumes from them);
   * partial chunks from the old host are dropped.
   */
  setGeneration(generation: number): void {
    if (!Number.isInteger(generation) || generation <= this.generation) return;
    this.generation = generation;
    this.pending.clear();
  }

  /** Feed one wire event; returns true when it was a migration event (consumed, never presented). */
  receive(event: WireEvent, nowMs: number): boolean {
    if (!isMigrationEventKind(event.kind)) return false;
    const payload = event.payload as Partial<MigrationChunkPayload>;
    const parts = payload.parts as number;
    const part = payload.part as number;
    if (!Number.isSafeInteger(payload.id) || !Number.isSafeInteger(payload.tick) || (payload.tick as number) < 0 || !Number.isInteger(part) || !Number.isInteger(parts) ||
        typeof payload.data !== 'string' || parts < 1 || parts > MIGRATION_MAX_CHUNKS || part < 0 || part >= parts) {
      this.rejected++;
      return true;
    }
    const chunk = base64UrlToBytes(payload.data);
    if (!chunk) { this.rejected++; return true; }
    this.chunksReceived++;
    let entry = this.pending.get(event.kind);
    if (!entry || entry.id !== payload.id || entry.generation !== this.generation) {
      entry = { generation: this.generation, id: payload.id as number, tick: payload.tick as number, parts, chunks: new Array<Uint8Array | null>(parts).fill(null), received: 0 };
      this.pending.set(event.kind, entry);
    }
    if (entry.chunks[part] === null) entry.received++;
    entry.chunks[part] = chunk;
    if (entry.received === entry.parts) {
      let total = 0;
      for (const piece of entry.chunks) total += piece!.byteLength;
      const blob = new Uint8Array(total);
      let offset = 0;
      for (const piece of entry.chunks) { blob.set(piece!, offset); offset += piece!.byteLength; }
      const current = this.complete.get(event.kind);
      const newer = !current || entry.generation > current.generation || (entry.generation === current.generation && entry.tick >= current.tick);
      if (newer) this.complete.set(event.kind, { id: entry.id, tick: entry.tick, generation: entry.generation, blob, receivedAtMs: nowMs });
      this.pending.delete(event.kind);
      this.blobsCompleted++;
    }
    return true;
  }

  get keyframe(): RetainedBlob | null { return this.complete.get(MIGRATION_EVENT_KIND.KEYFRAME) ?? null; }
  get config(): RetainedBlob | null { return this.complete.get(MIGRATION_EVENT_KIND.CONFIG) ?? null; }

  stats(): { chunksReceived: number; blobsCompleted: number; rejected: number; keyframeTick: number; configTick: number } {
    return { chunksReceived: this.chunksReceived, blobsCompleted: this.blobsCompleted, rejected: this.rejected, keyframeTick: this.keyframe?.tick ?? -1, configTick: this.config?.tick ?? -1 };
  }

  /** A new match: nothing retained applies. */
  clear(): void {
    this.generation = 0;
    this.pending.clear();
    this.complete.clear();
  }
}
