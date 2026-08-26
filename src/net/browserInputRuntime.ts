import { encodeAimIntent } from './aimIntent.js';
import { NetworkInputCadence, type NetworkInputSample } from './inputCadence.ts';
import { PLAYER_ACTION_BITS } from './protocol.js';

type ActionName = 'reloadMagazine' | 'specialAction';

interface VectorLike {
  x: number;
  y: number;
  z: number;
}

interface BrowserInputPlayer {
  state?: {
    pos: VectorLike;
    yaw: number;
  } | null;
  input?: {
    throttle?: number;
    steer?: number;
    brake?: boolean;
    fire?: boolean;
    aimPoint?: VectorLike | null;
    shellSlot?: number;
  } | null;
  combat?: { destroyed?: boolean } | null;
}

export interface BrowserNetworkInputFrame extends NetworkInputSample {
  throttle: number;
  steer: number;
  brake: boolean;
  fire: boolean;
  aimYaw: number;
  aimPitch: number;
  aimDistance: number;
  shellSlot: number;
  actionBits: number;
}

const ACTION_MASK = PLAYER_ACTION_BITS.REPAIR |
  PLAYER_ACTION_BITS.FIRST_AID |
  PLAYER_ACTION_BITS.EXTINGUISHER |
  PLAYER_ACTION_BITS.RELOAD_MAGAZINE |
  PLAYER_ACTION_BITS.SPECIAL_ACTION;

const NAMED_ACTION_BITS: Readonly<Record<ActionName, number>> = Object.freeze({
  reloadMagazine: PLAYER_ACTION_BITS.RELOAD_MAGAZINE,
  specialAction: PLAYER_ACTION_BITS.SPECIAL_ACTION,
});

/**
 * Browser-owned multiplayer input state. This module stays behind explicit
 * private/LAN/ranked intent so solo garage boot does not import protocol aim
 * encoding or the network cadence controller.
 */
export class BrowserInputRuntime {
  readonly cadence = new NetworkInputCadence();
  #pendingActionBits = 0;

  queueConsumable(slot: number): void {
    if (!Number.isInteger(slot) || slot < 0 || slot > 2) return;
    this.#pendingActionBits |= 1 << slot;
  }

  queueAction(action: ActionName): void {
    this.#pendingActionBits |= NAMED_ACTION_BITS[action];
  }

  frame(player: BrowserInputPlayer | null | undefined): BrowserNetworkInputFrame | null {
    if (!player?.state || !player.input || player.combat?.destroyed) return null;
    const { pos, yaw } = player.state;
    const target = player.input.aimPoint || {
      x: pos.x + Math.sin(yaw) * 1000,
      y: pos.y,
      z: pos.z + Math.cos(yaw) * 1000,
    };
    return {
      throttle: player.input.throttle || 0,
      steer: player.input.steer || 0,
      brake: !!player.input.brake,
      fire: !!player.input.fire,
      ...encodeAimIntent(pos, target),
      shellSlot: player.input.shellSlot! | 0,
      actionBits: this.#pendingActionBits & ACTION_MASK,
    };
  }

  advance(elapsedS: number): void { this.cadence.advance(elapsedS); }

  shouldSend(input: BrowserNetworkInputFrame): boolean {
    return this.cadence.shouldSend(input);
  }

  /** Commit only after the client transport accepts the frame. */
  commit(input: BrowserNetworkInputFrame): number {
    const elapsedS = this.cadence.commit(input);
    this.#pendingActionBits = 0;
    return elapsedS;
  }

  /** Host authority consumes action edges before advancing and restores on error. */
  acknowledge(actionBits: number): void {
    this.#pendingActionBits &= ~(actionBits & ACTION_MASK);
  }

  restore(actionBits: number): void {
    this.#pendingActionBits |= actionBits & ACTION_MASK;
  }

  resetCadence(): void { this.cadence.reset(); }

  reset(): void {
    this.#pendingActionBits = 0;
    this.cadence.reset();
  }

  get pendingActionBits(): number { return this.#pendingActionBits; }
}

export function createBrowserInputRuntime(): BrowserInputRuntime {
  return new BrowserInputRuntime();
}
