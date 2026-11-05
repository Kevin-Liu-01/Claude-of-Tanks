/**
 * What a client keeps for a host migration (P2 client lane; docs/MULTIPLAYER-V2.md §13.2 "Keyframes"): the browser
 * host rides two sealed blobs inside wire EVENT messages — `mp:keyframe` (every entity, every
 * ROOM_MATCH_KEYFRAME_INTERVAL_MS) and `mp:config` (the boot configuration) — in base64url chunks under the event
 * limit. The MatchClient hands every event here first; migration chunks are assembled and retained (the newest
 * complete blob per kind), never presented. Only the seat the room elects can open a blob: it receives the host
 * secret in `host_changed` (src/mp/host/migrationState.ts). Bounded: one blob in flight per kind.
 * Beside the blobs it keeps the world the elected host merges into the keyframe (a fall, a stage or a revive reaches a
 * peer as its event, the snapshot lists only later), each dated by the link it arrived on, so a host that restarted the
 * battle leaves everything retained of the battle before it in one move (abandonBattle).
 */
import type { DestructionLogEntry } from '../../sim/destructionEvents.ts';
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
  /** The link this client follows (beginLink at each WELCOME): everything retained is dated by the link it arrived on. */
  private link = 0;
  private readonly pending = new Map<string, { generation: number; link: number; id: number; tick: number; parts: number; chunks: Array<Uint8Array | null>; received: number }>();
  private readonly complete = new Map<string, RetainedBlob>();
  private readonly completeLink = new Map<string, number>();
  /** Every obstacle a `world_prop_destroyed` named this round, with the link of its newest naming. */
  private readonly fallenOn = new Map<number, number>();
  /** Every stage, breach or fall a destruction event named this round, in arrival order. */
  private readonly destructionOn: Array<{ entry: DestructionLogEntry; link: number }> = [];
  /** The tick of each entity's newest `mode_respawn` this round, by authoritative id. */
  private readonly respawnOn = new Map<string, { tick: number; link: number }>();
  private chunksReceived = 0;
  private blobsCompleted = 0;
  private rejected = 0;

  /**
   * A newer host generation (the session followed a host change): its blobs outrank every older generation's whatever
   * tick they claim — the chunk tick is the sealer's plaintext word, so an earlier host could otherwise pin its own state
   * over every later host's (security audit 2026-10-22). Completed blobs stay (the elected seat resumes from them);
   * partial chunks from the old host are dropped.
   */
  /** The newest host generation the session followed (0 before any host change). */
  get hostGeneration(): number { return this.generation; }

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
    // a host sends a blob's chunks at once, so a blob never spans two links: a chunk on a newer link is a new blob (a kept
    // host's ids restart at 1, at the generation of the host it replaced)
    if (!entry || entry.id !== payload.id || entry.generation !== this.generation || entry.link !== this.link) {
      entry = { generation: this.generation, link: this.link, id: payload.id as number, tick: payload.tick as number, parts, chunks: new Array<Uint8Array | null>(parts).fill(null), received: 0 };
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
      // within a generation, a later link's host is the one this client follows (on one link, the higher tick)
      const currentLink = this.completeLink.get(event.kind) ?? 0;
      const newer = !current || entry.generation > current.generation || (entry.generation === current.generation
        && (entry.link > currentLink || (entry.link === currentLink && entry.tick >= current.tick)));
      if (newer) {
        this.complete.set(event.kind, { id: entry.id, tick: entry.tick, generation: entry.generation, blob, receivedAtMs: nowMs });
        this.completeLink.set(event.kind, entry.link);
      }
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

  /** A link's WELCOME (matchClient.ts receiveWelcome): what arrives from here on is that link's host's. */
  beginLink(): void { this.link++; }

  /** A `world_prop_destroyed` this client received, presented or still queued (RetainedMigrationState.fallen). */
  retainFallen(obstacleIndex: number): void { this.fallenOn.set(obstacleIndex, this.link); }

  /** A stage, breach or fall a destruction event named (RetainedMigrationState.destruction). */
  retainDestruction(entry: DestructionLogEntry): void { this.destructionOn.push({ entry, link: this.link }); }

  /** An entity's `mode_respawn` at `tick` (RetainedMigrationState.respawns): the newest per id. */
  retainRespawn(id: string, tick: number): void { this.respawnOn.set(id, { tick, link: this.link }); }

  get fallen(): number[] { return [...this.fallenOn.keys()]; }
  get destruction(): DestructionLogEntry[] { return this.destructionOn.map((retained) => retained.entry); }
  get respawns(): Array<[id: string, tick: number]> { return [...this.respawnOn].map(([id, retained]) => [id, retained.tick]); }

  /**
   * The current link's host restarted the battle (matchClient.ts followTimeline: a kept host's last resort, round 2 U1):
   * everything retained before this link is of a battle no longer played, and the next election would have resumed it.
   * At the same generation the old keyframe's higher tick outranked every keyframe of the restarted battle until its
   * timeline caught up; its falls, destruction and revives were merged into the next host's resume
   * (migrationState.ts resumeStateFromRetained: the fallen props knocked down, old revives counted once the restarted
   * timeline passed their ticks). It all goes in this one move, so a store added here cannot outlive the battle it is
   * of. What this link's host sent stays (its events may come before the snapshot that tells the restart), and so does
   * the sealed configuration: it is the match's, not the battle's.
   */
  abandonBattle(): void {
    const kind = MIGRATION_EVENT_KIND.KEYFRAME;
    if ((this.completeLink.get(kind) ?? 0) < this.link) { this.complete.delete(kind); this.completeLink.delete(kind); }
    const pending = this.pending.get(kind);
    if (pending && pending.link < this.link) this.pending.delete(kind);
    for (const [index, link] of this.fallenOn) if (link < this.link) this.fallenOn.delete(index);
    let kept = 0;
    for (const retained of this.destructionOn) if (retained.link >= this.link) this.destructionOn[kept++] = retained;
    this.destructionOn.length = kept;
    for (const [id, retained] of this.respawnOn) if (retained.link < this.link) this.respawnOn.delete(id);
  }

  /** A new match: nothing retained applies. */
  clear(): void {
    this.generation = 0;
    this.pending.clear();
    this.complete.clear();
    this.completeLink.clear();
    this.fallenOn.clear();
    this.destructionOn.length = 0;
    this.respawnOn.clear();
  }
}
