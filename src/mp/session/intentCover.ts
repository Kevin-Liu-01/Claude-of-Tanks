import type { RosterPresentation } from '../../game/rosterPresentation.ts';
import type { BattleLoadScreen } from '../../ui/battleLoad.ts';
import type { BrowserLaunchRequest } from './browserComposition.ts';
import { resetRoundState, type RoundState } from './roundState.ts';

interface MapPresentation {
  name: string;
  thumb: string;
  biome: string;
}

interface IntentCoverOptions {
  game: RoundState;
  battleLoad: BattleLoadScreen;
  rosterRows: RosterPresentation['lobbyRows'];
  getMapPresentation(mapId: string | null, fallback: string): MapPresentation;
  coverRendering(): void;
  uncoverRendering(): void;
}

interface IntentCover {
  show(request?: BrowserLaunchRequest): void;
  releaseAfterFailure(): Promise<void>;
}

/** The seat's own id from the room session the menu hands over (an untyped handle at this boundary). */
function readPeerId(session: unknown): string {
  if (!session || typeof session !== 'object') return '';
  const roomInfo = (session as { roomInfo?: unknown }).roomInfo;
  if (!roomInfo || typeof roomInfo !== 'object') return '';
  const peerId = (roomInfo as { peerId?: unknown }).peerId;
  return typeof peerId === 'string' ? peerId : '';
}

/**
 * Present a complete opaque room briefing before the demand-loaded browser
 * multiplayer composition crosses its first asynchronous boundary. The full
 * launcher replaces the same surface once available; this tiny boot-safe
 * owner keeps first-time hosts from exposing Garage or an incomplete world.
 */
export function createIntentCover({
  game,
  battleLoad,
  rosterRows,
  getMapPresentation,
  coverRendering,
  uncoverRendering,
}: IntentCoverOptions): IntentCover {
  const required = [battleLoad?.show, battleLoad?.progress, battleLoad?.hide,
    rosterRows, getMapPresentation, coverRendering, uncoverRendering];
  if (!game || required.some((entry) => typeof entry !== 'function')) {
    throw new TypeError('network battle intent cover requires loader, roster, and lifecycle ports');
  }

  return {
    show(request = {}) {
      const state = request.lobbyState;
      const viewerId = readPeerId(request.session);
      const own = state?.players?.find((player) => player.id === viewerId);
      const requestedMapId = String(state?.mapId || 'random');
      const fixedMapId = requestedMapId === 'random' ? null : requestedMapId;
      const map = getMapPresentation(fixedMapId, 'Random battlefield');
      const displayTeam = own?.team === 'spectator'
        ? 'alpha'
        : String(own?.team || 'alpha');
      const lobby = { players: state?.players ?? [], gameMode: state?.gameMode };

      coverRendering();
      resetRoundState(game);
      battleLoad.show({
        mapName: map.name,
        thumb: map.thumb,
        biome: fixedMapId ? map.biome : 'none',
        mode: state?.mode === 'lan'
          ? 'LAN Battle · Direct Wi-Fi'
          : 'Private Battle · Room Code',
        allies: rosterRows(lobby, displayTeam, viewerId),
        enemies: rosterRows(
          lobby,
          displayTeam === 'alpha' ? 'bravo' : 'alpha',
          viewerId,
        ),
      });
      battleLoad.progress(0.005, 'Loading multiplayer runtime');
    },

    async releaseAfterFailure() {
      uncoverRendering();
      await battleLoad.hide();
    },
  };
}
