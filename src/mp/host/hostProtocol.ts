/**
 * The browser host (P2 client lane, 2026-09-28; docs/MULTIPLAYER-V2.md §13): the vocabulary between the main thread
 * (`matchHost.ts`: the room, the WebRTC acceptor, the host's own loopback client) and the Worker that runs the match
 * actor (`matchHostCore.ts`). Links are numbered by the main thread (0 = the host's own loopback link); frames travel
 * as transferred ArrayBuffers; the Worker never learns a player identity beyond the seat claims the actor verifies.
 * Pure types and one port shape, so the Node receipts drive the core through an in-process port pair.
 */
import type { CloseReasonId } from '../wire/constants.ts';
import type { SnapshotFrame } from '../wire/messages.ts';

export interface HostBootSeat {
  seat: number;
  playerId: string;
  name: string;
  team: 'alpha' | 'bravo' | 'spectator';
  specId: string;
  equipment?: readonly string[] | null;
}

export interface HostBootBot {
  playerId: string;
  name: string;
  team: 'alpha' | 'bravo';
  specId: string;
  difficulty?: 'easy' | 'normal' | 'hard';
}

/** What the old host serialized beside the wire keyframe: the parts of an entity a row does not carry. */
export interface MigrationEntityExtras {
  entityId: number;
  kills: number;
  damage: number;
  modules: Record<string, string>;
  crew: Record<string, boolean>;
  burning: boolean;
}

/** The retained state a newly elected host boots from (decrypted on the main thread with the host secret). */
export interface HostResumeState {
  /** The authority tick the keyframe describes. */
  tick: number;
  battleTimeMs: number;
  phase: 'countdown' | 'playing' | 'ended';
  frame: SnapshotFrame;
  entities: MigrationEntityExtras[];
}

export interface HostBootConfig {
  roomId: string;
  matchId: string;
  generation: number;
  mapId: string;
  mode: string;
  seed: number;
  seats: HostBootSeat[];
  bots: HostBootBot[];
  countdownS: number;
  battleLimitS?: number | null;
  /** The per-match secret the seat tokens are signed with (never leaves the host's browser). */
  hostSecret: string;
  /** Where the collision manifests are served (`<base>/index.json`, `<base>/<map>.json`); null = the bare height field. */
  manifestBase: string | null;
  /** A migration: boot at this state, at the tick the main thread computed (the keyframe's plus the wall time since). */
  resume: (HostResumeState & { resumeTick: number }) | null;
}

export interface HostMatchReport {
  matchId: string;
  generation: number;
  tick: number;
  phase: 'loading' | 'countdown' | 'playing' | 'ended';
  verdict?: { result: 'alpha' | 'bravo' | 'draw'; reason: string };
}

export interface HostCoreStats {
  tick: number;
  phase: string;
  clients: number;
  bytesOut: number;
  bytesIn: number;
  snapshots: number;
  keyframes: number;
  migrationKeyframes: number;
  tickP95Ms: number;
  verdict: string | null;
}

export type HostToWorkerMessage =
  | { type: 'boot'; config: HostBootConfig }
  | { type: 'link_open'; peer: number; label: string }
  | { type: 'link_frame'; peer: number; bytes: ArrayBuffer }
  | { type: 'link_close'; peer: number }
  | { type: 'link_pressure'; peer: number; bufferedAmount: number }
  | { type: 'stop'; reason: CloseReasonId; detail: string }
  | { type: 'stats' };

export type WorkerToHostMessage =
  | { type: 'ready'; tick: number; entities: number; resumed: boolean }
  | { type: 'boot_failed'; error: string }
  | { type: 'link_send'; peer: number; bytes: ArrayBuffer }
  /** The actor closed the link: the main thread sends the wire CLOSE and closes the channel. */
  | { type: 'link_close'; peer: number; reason: CloseReasonId; detail: string }
  | { type: 'report'; report: HostMatchReport }
  | { type: 'stats'; stats: HostCoreStats }
  | { type: 'log'; level: 'info' | 'warn' | 'error'; message: string; fields?: Record<string, unknown> };

/** One end of the main ↔ Worker channel (a Worker / `self` in the browser, an in-process pair in the receipts). */
export interface HostPort<Out, In> {
  post(message: Out, transfer?: ArrayBuffer[]): void;
  onMessage(listener: (message: In) => void): () => void;
  close(): void;
}

/** An in-process port pair (the receipts, the headless host): messages cross on a microtask, buffers are handed over as they are. */
export function createHostPortPair<A, B>(): { main: HostPort<A, B>; worker: HostPort<B, A> } {
  const toWorker = new Set<(message: A) => void>();
  const toMain = new Set<(message: B) => void>();
  let closed = false;
  const main: HostPort<A, B> = {
    post(message) { if (closed) return; queueMicrotask(() => { if (!closed) for (const listener of [...toWorker]) listener(message); }); },
    onMessage(listener) { toMain.add(listener); return () => { toMain.delete(listener); }; },
    close() { closed = true; toWorker.clear(); toMain.clear(); },
  };
  const worker: HostPort<B, A> = {
    post(message) { if (closed) return; queueMicrotask(() => { if (!closed) for (const listener of [...toMain]) listener(message); }); },
    onMessage(listener) { toWorker.add(listener); return () => { toWorker.delete(listener); }; },
    close() { closed = true; toWorker.clear(); toMain.clear(); },
  };
  return { main, worker };
}

/** The event kinds the host rides inside wire EVENT messages for migration (defined with the client's store). */
export { MIGRATION_EVENT_KIND } from '../match/migrationStore.ts';

/** The host's own loopback link number. */
export const HOST_LOOPBACK_PEER = 0;
