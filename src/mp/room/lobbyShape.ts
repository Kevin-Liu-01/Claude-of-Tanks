/**
 * The lobby as the room publishes it to the Play menu, the Garage strip, the end screen and the battle composition
 * (`roomToLobby` in roomPolicy.ts): the room snapshot flattened to what those surfaces render. Node-runnable types.
 */
import type { TeamArrangement } from '../../sim/matchRuleset.ts';

export type LobbyTeam = 'alpha' | 'bravo' | 'spectator';
export type LobbyPhase = 'waiting' | 'starting' | 'playing';

export interface LobbyPlayer {
  id: string;
  name: string;
  team: LobbyTeam;
  specId: string | null;
  equipment: string[];
  camo: string;
  ready: boolean;
  connected: boolean;
  /** The room's admin (the seat whose controls set the map, the size and the start). */
  isHost: boolean;
  rating: number | null;
}

export interface LobbyRoundResult {
  round: number;
  result: string | null;
  reason: string | null;
}

export interface SerializedLobby {
  roomCode: string;
  mode: string;
  gameMode: string;
  phase: LobbyPhase;
  hostId: string;
  maxPlayers: number;
  maxSpectators: number;
  allowTeamSwitch: boolean;
  locked: boolean;
  mapId: string;
  teamSize: number;
  /** Team arrangement for the co-op modes (owner 2026-09-15); admin-set, null keeps the mode's defaults. */
  arrangement: TeamArrangement | null;
  /** Frontline Assault campaign operation the room plays (admin-set), null for a free sortie. */
  campaignOperationId: string | null;
  revision: number;
  matchSeed: number | null;
  round: number;
  lastResult: LobbyRoundResult | null;
  players: LobbyPlayer[];
}
