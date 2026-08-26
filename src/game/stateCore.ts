/**
 * Lightweight integration state shared by the garage, Studio, and battle
 * runtime. This module deliberately has no Three.js, DOM, WebGL, vehicle, or
 * simulation imports so presentation-only entry points do not acquire the
 * combat graph merely to create a bus or an empty session.
 */

export type RandomSource = () => number;
export type EventListener = (payload: unknown) => void;
export type EventRecorder = (event: string, payload: unknown) => void;

export interface EventBus {
  on(event: string, listener: EventListener): () => void;
  off(event: string, listener: EventListener): void;
  emit(event: string, payload: unknown): void;
}

export interface GameState {
  phase: 'garage' | 'battle' | 'ended' | 'shot';
  preBattleS: number;
  mapId: string;
  tanks: unknown[];
  allTanks: unknown[];
  battleCount: number;
  tankById: Map<string, unknown>;
  player: unknown | null;
  shells: unknown[];
  nextShellId: number;
  timeS: number;
  fireTickAcc: number;
  combatRng: RandomSource;
  result: 'victory' | 'defeat' | 'draw' | null;
  resultReason: string | null;
  spotting: unknown | null;
  openingRouteJobs: unknown[];
}

/** Canonical deterministic PRNG used by the legacy solo runtime. */
export function mulberry32(seed: number): RandomSource {
  let state = seed | 0;
  return function random(): number {
    state |= 0;
    state = state + 0x6D2B79F5 | 0;
    let value = Math.imul(state ^ state >>> 15, 1 | state);
    value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

/**
 * Synchronous event bus. Listeners are copied before dispatch so subscribing
 * or unsubscribing from inside a callback cannot corrupt the active delivery.
 */
export function createBus(onEmit: EventRecorder | null = null): EventBus {
  const listeners = new Map<string, EventListener[]>();
  return {
    on(event, listener) {
      let group = listeners.get(event);
      if (!group) {
        group = [];
        listeners.set(event, group);
      }
      group.push(listener);
      return () => this.off(event, listener);
    },
    off(event, listener) {
      const group = listeners.get(event);
      if (!group) return;
      const index = group.indexOf(listener);
      if (index >= 0) group.splice(index, 1);
    },
    emit(event, payload) {
      if (onEmit) {
        try {
          onEmit(event, payload);
        } catch {
          // Diagnostics are observational and must never affect gameplay.
        }
      }
      const group = listeners.get(event);
      if (group) {
        for (const listener of group.slice()) listener(payload);
      }
    },
  };
}

/** Create an empty mutable session without loading any battle implementation. */
export function createGameState(): GameState {
  return {
    phase: 'garage',
    preBattleS: 0,
    mapId: 'verdant',
    tanks: [],
    allTanks: [],
    battleCount: 0,
    tankById: new Map(),
    player: null,
    shells: [],
    nextShellId: 1,
    timeS: 0,
    fireTickAcc: 0,
    combatRng: mulberry32(6000),
    result: null,
    resultReason: null,
    spotting: null,
    openingRouteJobs: [],
  };
}
