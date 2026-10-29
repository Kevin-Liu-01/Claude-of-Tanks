/**
 * The solo sim Worker's channel (RUST-ENGINE-DECISION §7 step 5, the rework of 2026-10-26): a free sortie's authority
 * steps in a Worker of its own, driven by the page directly. It runs the deterministic authority and the world kernels a
 * room's host runs, but a sortie is not a multiplayer session: one seat (the player) and the bots the page planned
 * (rosterState.planBattleSeats), no room, seat token, signalling, election or migration. The frames are the match wire's,
 * an internal format that never leaves the page.
 */
import type { TeamArrangement } from '../sim/matchRuleset.ts';
import type { SimKernelsStatus } from '../world/simKernelsStatus.ts';

/** One seat of the sortie: the player's or a bot's, its side, vehicle and name (a bot's callsign, as the card shows it). */
export interface SoloSimSeat {
  playerId: string;
  name: string;
  team: 'alpha' | 'bravo';
  specId: string;
  isPlayer: boolean;
  difficulty?: 'easy' | 'normal' | 'hard';
  equipment?: readonly string[];
}

/** The battlefield the authority plays: the map, the mode (its terrain variant), the collision manifests and the kernels. */
export interface SoloSimWorld {
  mapId: string;
  mode: string;
  /** Where the collision manifests are served; null: the bare height field. */
  manifestBase: string | null;
  /** The world kernels' module URL; null: the TypeScript. */
  simKernelsUrl: string | null;
}

export interface SoloSimBoot extends SoloSimWorld {
  seed: number;
  seats: SoloSimSeat[];
  /** The visible count (3 s, solo's); held until the page releases it at its reveal. */
  countdownS: number;
  arrangement?: TeamArrangement | null;
}

export type PageToSoloSim =
  /** Build the battlefield and load the vehicles' anatomy ahead (the Battle hover); the boot takes them. */
  | { type: 'prepare'; world: SoloSimWorld; specIds: string[] }
  | { type: 'boot'; boot: SoloSimBoot }
  /** The page's client's frames (its hello, its inputs). */
  | { type: 'frame'; bytes: ArrayBuffer }
  /** The page's client opened a fresh connection (its stall recovery): the next frame is a new hello. */
  | { type: 'reconnect' }
  | { type: 'pause'; paused: boolean }
  | { type: 'countdown'; held: boolean }
  | { type: 'stop' };

export type SoloSimToPage =
  | { type: 'prepared'; ok: boolean; ms: number; error?: string }
  /** The authority runs: its tick, what its world steps on, and the boot's ms (the world, the anatomy, the actor, in all). */
  | { type: 'ready'; tick: number; kernels: SimKernelsStatus;
    timings: { worldMs: number; fleetMs: number; actorMs: number; bootMs: number; prepared: boolean } }
  | { type: 'boot_failed'; error: string }
  | { type: 'frame'; bytes: ArrayBuffer }
  /** The authority closed the page's connection (the battle ended and lingered out, or a refused frame). */
  | { type: 'closed'; reason: number; detail: string }
  | { type: 'paused'; paused: boolean; tick: number };

/** The page's end of the channel (a Worker in the browser; the receipts pair two in-process ends). */
export interface SoloSimPort<In, Out> {
  post(message: Out, transfer?: Transferable[]): void;
  onMessage(listener: (message: In) => void): () => void;
  close(): void;
}
