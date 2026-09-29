/**
 * The room's Garage presence before and between battles (Multiplayer v2 only,
 * cutover 2026-09-29): the lobby the Play menu holds while the player browses
 * the Garage (a pending lobby) and the lobby the battle composition owns after
 * a handoff (an owned room). Both feed the Garage's room strip, the joined-room
 * preparation (the selected world and the roster's builders warm while
 * commanders ready up), and the strip's Ready / Start / selection relays back
 * into the menu, which sends the room's commands. v1's room coordinator did
 * this through the whole network composition; this is the small owner
 * `src/main.ts` loads with the menu. Node-runnable: every surface is a port.
 */
import type { SerializedLobby } from '../room/lobbyShape.ts';
import { createLobbyPreloader } from './lobbyPreloader.ts';
import type { LobbyPreloaderOptions } from './lobbyPreloader.ts';

interface LobbyIntentContext {
  state: SerializedLobby;
  playerId: string;
  role: 'host' | 'client';
}

/** The Garage strip's view of the room (src/ui/garage.ts setRoomStatus). */
interface LobbyRoomStatus {
  roomCode: string;
  mode: string;
  ready: boolean;
  canSetReady: boolean;
  readyCount: number;
  total: number;
}

/** The Play menu as the strip drives it: it holds the seat's commands for both a pending and an owned room. */
interface LobbyIntentMenu {
  setReady(ready: boolean): boolean;
  syncGarageSelection(): boolean;
  startRound(): boolean;
}

interface LobbyIntentPorts {
  getMenu(): Promise<LobbyIntentMenu> | null;
  setGarageStatus(status: LobbyRoomStatus | null): void;
  /** The joined-room preparation (world, builders, the battle-only modules) behind explicit room intent. */
  preloader: LobbyPreloaderOptions;
}

export interface LobbyIntent {
  /** The menu's lobby while it owns the seat (null once it closes or hands off). */
  handleLobbyChange(context: LobbyIntentContext | null): void;
  /** The composition's room state (the `network:roomState` event: the owned room, null once released). */
  handleRoomState(payload: unknown): void;
  /** Explicit Battle intent while a room exists prepares the room's battlefield instead of a solo roster. */
  prepareLobby(): boolean;
  /** The Garage's Ready toggle; true when the click reached the room (the caller unlocks audio on it). */
  setReady(ready: boolean): boolean;
  /** The Garage's vehicle pick reaches the waiting room's seat. */
  syncSelection(): void;
  /** The end screen's Start for the admin of an owned room. */
  startRound(): boolean;
  readonly current: LobbyIntentContext | null;
}

function isContext(value: unknown): value is LobbyIntentContext {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  const state = candidate.state as Record<string, unknown> | undefined;
  return !!state && typeof state === 'object' && Array.isArray(state.players)
    && typeof candidate.playerId === 'string' && (candidate.role === 'host' || candidate.role === 'client');
}

/** The strip's view of a lobby for one seat (null when the seat is not in it). */
export function lobbyRoomStatus(state: SerializedLobby, playerId: string): LobbyRoomStatus | null {
  const me = state.players.find((player) => player.id === playerId);
  if (!me) return null;
  const active = state.players.filter((player) => player.team !== 'spectator');
  return {
    roomCode: state.roomCode,
    mode: state.mode,
    ready: !!me.ready,
    canSetReady: state.phase === 'waiting' && me.team !== 'spectator' && !!me.specId && me.connected !== false,
    readyCount: active.filter((player) => player.ready).length,
    total: active.length,
  };
}

export function createLobbyIntent({ getMenu, setGarageStatus, preloader }: LobbyIntentPorts): LobbyIntent {
  if (typeof getMenu !== 'function' || typeof setGarageStatus !== 'function' || !preloader) {
    throw new TypeError('lobby intent requires its menu, Garage and preparation ports');
  }
  const preload = createLobbyPreloader(preloader);
  let pending: LobbyIntentContext | null = null;
  let owned: LobbyIntentContext | null = null;
  const current = (): LobbyIntentContext | null => owned ?? pending;

  /** A Garage click reaches the menu only while the same room is still the current one. */
  const relay = (context: LobbyIntentContext, apply: (menu: LobbyIntentMenu) => void): boolean => {
    const menuPromise = getMenu();
    if (!menuPromise) return false;
    menuPromise.then((menu) => {
      if (current()?.state.roomCode === context.state.roomCode) apply(menu);
    }).catch(() => { /* the menu is the room's own surface; a failed menu import already presented itself */ });
    return true;
  };

  return {
    handleLobbyChange(context) {
      pending = context && isContext(context) ? context : null;
      if (pending) preload.preload(pending.state);
      // An owned room paints its own status (the composition's room port); the pending lobby paints only without one.
      if (owned) return;
      setGarageStatus(pending ? lobbyRoomStatus(pending.state, pending.playerId) : null);
    },
    handleRoomState(payload) {
      owned = isContext(payload) ? payload : null;
      if (owned) preload.preload(owned.state);
    },
    prepareLobby() {
      const context = current();
      return context ? preload.preload(context.state) : false;
    },
    setReady(ready) {
      const context = current();
      if (!context || !lobbyRoomStatus(context.state, context.playerId)?.canSetReady) return false;
      return relay(context, (menu) => { menu.setReady(!!ready); });
    },
    syncSelection() {
      const context = current();
      if (!context || context.state.phase !== 'waiting') return;
      relay(context, (menu) => { menu.syncGarageSelection(); });
    },
    startRound() {
      const context = current();
      if (!context || context.role !== 'host' || context.state.phase !== 'waiting') return false;
      return relay(context, (menu) => { menu.startRound(); });
    },
    get current() { return current(); },
  };
}
