import type { RuntimeValue } from '../../runtimeTypes.ts';
import type { SerializedLobby } from '../room/lobbyShape.ts';
import { worldKeyFor } from '../../sim/matchRuleset.ts';

export interface LobbyPreloaderOptions {
  getGamePhase(): string;
  preloadPresentation(): Promise<RuntimeValue>;
  preloadVisuals(): Promise<RuntimeValue>;
  preloadBattleModules(): Promise<RuntimeValue>;
  ensureTankBuilders(specIds: string[]): Promise<RuntimeValue>;
  loadWorldModule(): Promise<RuntimeValue>;
  cancelBackgroundWorldBuildsExcept(mapId: string | null): void;
  prefetchWorld(mapId: string, options?: { intent?: boolean }): RuntimeValue;
  /**
   * (mp-fixes-277) The next match's bots, painted, warmed as the round's roster prewarm warms its seats
   * (battlePresentation.ts prewarmRosterVisuals: the builders' module cache and the coalesced texture bakes by vehicle and
   * paint), so the round finds them done.
   */
  prewarmBots?(seats: Array<{ playerId: string; specId: string; camo: string; isViewer: false }>): Promise<RuntimeValue>;
}

interface LobbyPreloader {
  preload(state: SerializedLobby | null | undefined): boolean;
  readonly pendingCount: number;
  readonly preparedBuilderCount: number;
}

/**
 * Own fire-and-forget room preparation without repeating transfers on every
 * lobby state packet. Failed transfers leave their key retryable. World
 * residency belongs to the world coordinator, not a permanent map-ID latch.
 */
export function createLobbyPreloader({
  getGamePhase,
  preloadPresentation,
  preloadVisuals,
  preloadBattleModules,
  ensureTankBuilders,
  loadWorldModule,
  cancelBackgroundWorldBuildsExcept,
  prefetchWorld,
  prewarmBots,
}: LobbyPreloaderOptions): LobbyPreloader {
  const prepared = new Set<string>();
  const pending = new Map<string, Promise<void>>();
  const preparedBuilders = new Set<string>();
  const pendingBuilders = new Set<string>();

  const request = (key: string, start: () => Promise<RuntimeValue>): void => {
    if (prepared.has(key) || pending.has(key)) return;
    let transfer: Promise<RuntimeValue>;
    try {
      transfer = Promise.resolve(start());
    } catch (error) {
      transfer = Promise.reject(error);
    }
    const tracked = transfer.then(() => {
      prepared.add(key);
    }).catch(() => {
      // Optional lobby preparation never blocks room interaction. A later
      // state packet retries this exact failed transfer.
    }).finally(() => {
      if (pending.get(key) === tracked) pending.delete(key);
    });
    pending.set(key, tracked);
  };

  const preload = (state: SerializedLobby | null | undefined): boolean => {
    if (!state || getGamePhase() !== 'garage' || state.phase !== 'waiting') return false;

    request('presentation', preloadPresentation);
    request('visuals', preloadVisuals);
    request('battle-modules', preloadBattleModules);
    request('world-module', loadWorldModule);

    const missingBuilders: string[] = [];
    // (mp-fixes-277, room protocol 3) the next match's bots beside the players: a cold joiner's roster stage built them
    // after the WELCOME (7-12 s at 4 Mbps), the lobby's wait builds them now
    const bots = (state.nextBots ?? []).filter((bot) => !(state.gameMode === 'ac130' && bot.team === 'alpha'));
    for (const seat of [...(state.players || []), ...bots]) {
      if (state.gameMode === 'ac130' && seat.team === 'alpha') continue;
      const specId = seat.specId;
      if (!specId || preparedBuilders.has(specId) || pendingBuilders.has(specId)) continue;
      pendingBuilders.add(specId);
      missingBuilders.push(specId);
    }
    const painted = bots.filter((bot): bot is typeof bot & { camo: string } => typeof bot.camo === 'string');
    if (prewarmBots && painted.length) {
      // one warm per plan: a lobby packet that names the same bots asks again for nothing (the bakes coalesce anyway)
      const key = `bots:${painted.map((bot) => `${bot.specId}/${bot.camo}`).sort().join(',')}`;
      request(key, () => prewarmBots(painted.map((bot, index) => ({ playerId: `next-bot-${index}`, specId: bot.specId, camo: bot.camo, isViewer: false as const }))));
    }
    if (missingBuilders.length) {
      const key = `builders:${missingBuilders.slice().sort().join(',')}`;
      request(key, () => ensureTankBuilders(missingBuilders).then(() => {
        for (const specId of missingBuilders) preparedBuilders.add(specId);
      }).finally(() => {
        for (const specId of missingBuilders) pendingBuilders.delete(specId);
      }));
    }

    const mapId = state.mapId;
    // (improve-271 plan 036) the world the room's mode plays: a variant mode's own key, never the standard battlefield
    const nextMapId = !mapId || mapId === 'random' ? null : worldKeyFor(mapId, state.gameMode);
    // Cached and in-flight builds coalesce at the world owner. Reasserting
    // intent also permits a later packet to retry failed/cancelled builds or
    // maps skipped for capacity; merely remembering their ID would lose them.
    cancelBackgroundWorldBuildsExcept(nextMapId);
    if (nextMapId) prefetchWorld(nextMapId, { intent: true });
    return true;
  };

  return {
    preload,
    get pendingCount() { return pending.size; },
    get preparedBuilderCount() { return preparedBuilders.size; },
  };
}
