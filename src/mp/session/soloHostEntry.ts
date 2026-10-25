/**
 * A solo battle on a local host (RUST-ENGINE-DECISION §7 step 5; `?soloAuthority=host`, off by default). The battle is a
 * LAN room in the page (room/inPageRoom.ts) whose only seat hosts its p2p match: the authority steps in the browser
 * host's Worker on the world kernels, and the page keeps the client — the room, session, host and presentation a
 * multiplayer battle uses, handed to the browser composition as the Play menu hands a room's match. The room's bots
 * fill each side to `teamSize`. Loaded only when the flag asks for it.
 */
import { RoomClient } from '../room/roomClient.ts';
import { IN_PAGE_ROOM_ENDPOINT, createInPageRoomService } from '../room/inPageRoom.ts';
import { ROOM_SOLO_MAX_TEAM_SIZE } from '../room/protocol.ts';
import type { InPageRoomService } from '../room/inPageRoom.ts';
import { createRoomConnectionAdapter } from './playMenuAdapter.ts';
import type { BrowserLaunchRequest } from './browserComposition.ts';
import { readSides } from '../../game/teamArrangement.ts';

export interface SoloHostRequest {
  specId: string;
  mapId: string;
  gameMode: string;
  /** Hulls a side, the player's included (the room's bots fill the rest; 1..21): the stored sides' larger by default. */
  teamSize?: number;
  equipment: string[];
  camo: string;
}

let service: InPageRoomService | null = null;

/**
 * Create the solo room, ready its seat and start it; the room's match_start hands the session to `launch` (main.ts
 * beginMultiplayerV2Battle). Resolves with the launch's answer: false when the room could not start.
 */
export async function beginSoloOnLocalHost(request: SoloHostRequest, launch: (request: BrowserLaunchRequest) => Promise<boolean>): Promise<boolean> {
  service ??= createInPageRoomService();
  const rooms = service;
  let handOff: ((entered: Promise<boolean>) => void) | null = null;
  const launched = new Promise<Promise<boolean>>((resolve) => { handOff = resolve; });
  // the room seats symmetric sides: the larger of the stored ones, the player included
  const sides = readSides();
  const teamSize = request.teamSize ?? Math.max(sides.allies + 1, sides.enemies);
  const adapter = createRoomConnectionAdapter({
    clientBuild: import.meta.env.MODE,
    createRoomClient: (options) => new RoomClient({ ...options, transport: { ...options.transport, createSocket: rooms.createSocket } }),
    onHostStart: (lobbyState, connection) => {
      // the composition owns the seat from here on
      adapter.forget();
      handOff?.(launch({ role: 'host', session: connection.session, lobbyState }));
    },
  });
  const connection = await adapter.connect({
    kind: 'create', mode: 'lan', roomsUrl: IN_PAGE_ROOM_ENDPOINT, solo: true, player: { id: 'solo-commander', name: 'Commander' },
    selection: { specId: request.specId, mapId: request.mapId, gameMode: request.gameMode, equipment: request.equipment, camo: request.camo },
    teamSize: Math.max(1, Math.min(ROOM_SOLO_MAX_TEAM_SIZE, Math.round(teamSize))),
  });
  if (!connection) return false;
  try {
    await connection.session.command({ type: 'set_ready', ready: true });
    await connection.session.command({ type: 'start' });
  } catch (error) {
    adapter.close('solo_start_failed');
    throw error;
  }
  return launched.then((entered) => entered);
}
