import { throwIfNetworkBattleEntryAborted } from './networkBattleEntryAbort.ts';

type MaybePromise<T> = T | PromiseLike<T>;

export interface NetworkBattlePresentationPlayer {
  id: string;
  specId: string;
  team?: string;
  name?: string;
}

export interface NetworkBattlePresentationRequest {
  viewerId: string;
  own: NetworkBattlePresentationPlayer;
  mapId: string;
  matchPlayers: NetworkBattlePresentationPlayer[];
  modeLabel: string;
  connectMatch: () => MaybePromise<NetworkMatchPort>;
  signal?: AbortSignal;
  connectAfterWorld?: boolean;
  transitionShown?: boolean;
}

export interface NetworkBattleLoadTrace {
  mode: string;
  map: string;
  stages: Record<string, number>;
  modulesMs?: number;
  worldMs?: number;
  connectMs?: number;
  blackCheck?: unknown;
  totalMs?: number;
}

interface NetworkMatchPort {
  client?: unknown;
  close?(reason?: string): unknown;
}

interface NetworkEntityVisualPort {
  setGroundSampler?(sampler: (x: number, z: number) => unknown): void;
}

interface NetworkEntityPort {
  specId: string;
  visual?: NetworkEntityVisualPort | null;
}

interface NetworkBridgePort {
  entities: Map<string, NetworkEntityPort>;
  prepareRoster(
    players: NetworkBattlePresentationPlayer[],
    onProgress: (fraction: number, specId: string) => void,
  ): Promise<void>;
  apply(snapshot: unknown, dt: number): void;
  dispose(): void;
}

interface NetworkStatusPort {
  set?(status: unknown): void;
  dispose?(): void;
}

type NetworkFactory = (...args: any[]) => any;

interface BrowserBattleBridgeModulePort {
  createBrowserBattleBridge: NetworkFactory;
}

interface NetworkStatusModulePort {
  createNetworkStatus: NetworkFactory;
}

interface BrowserInputRuntimeModulePort {
  createBrowserInputRuntime: NetworkFactory;
}

type NetworkEntryModules = readonly [
  BrowserBattleBridgeModulePort,
  NetworkStatusModulePort,
  BrowserInputRuntimeModulePort,
];

interface BattleLoadPort {
  show(options: {
    mapName: string;
    thumb: string;
    biome: string;
    mode: string;
    allies: unknown[];
    enemies: unknown[];
  }): void;
  rosters(allies: unknown[], enemies: unknown[]): void;
  progress(fraction: number, label: string): void;
  hide(): MaybePromise<unknown>;
}

export interface NetworkBattlePresentationOptions {
  load: {
    battleLoad: BattleLoadPort;
    audio: {
      resume(): unknown;
      loadingOn(active: boolean): unknown;
      ambientOn(active: boolean): unknown;
    };
    lighting: { setFarCascadeDormant(dormant: boolean): void };
    ensureBattleVisuals(): MaybePromise<unknown>;
    nextFrame(): MaybePromise<unknown>;
    now?: () => number;
    recordTrace?: (trace: NetworkBattleLoadTrace) => void;
    setAdaptiveSuspended(suspended: boolean): void;
  };
  roster: {
    getMap(mapId: string): { name: string; thumb: string; biome: string };
    rows(
      players: NetworkBattlePresentationPlayer[],
      team: string,
      viewerId: string,
    ): unknown[];
    vehicleName(specId: string): string;
    emitBattleStart(payload: { playerId: string; specId: string; mapId: string }): void;
    setCamoBiome(mapId: string): void;
  };
  entry: {
    acquire(options: {
      loadModules: () => MaybePromise<NetworkEntryModules>;
      loadWorld: () => MaybePromise<unknown>;
      connect: () => MaybePromise<NetworkMatchPort>;
      publishMatch: (match: NetworkMatchPort) => void;
      connectAfterWorld: boolean;
      timings: NetworkBattleLoadTrace;
    }): Promise<{ modules: NetworkEntryModules }>;
    loadModules(): MaybePromise<NetworkEntryModules>;
    loadWorld(
      mapId: string,
      onProgress: (fraction: number, label: string) => void,
    ): MaybePromise<unknown>;
    publishMatch(match: NetworkMatchPort): void;
    getMatch(): NetworkMatchPort | null;
  };
  bridge: {
    installInputRuntime(factory: NetworkFactory): void;
    createStatus(factory: NetworkFactory): NetworkStatusPort;
    publishStatus(status: NetworkStatusPort): void;
    attachRecovery(client: unknown, status: NetworkStatusPort): void;
    create(
      factory: NetworkFactory,
      request: NetworkBattlePresentationRequest,
      spectator: boolean,
    ): NetworkBridgePort;
    publish(bridge: NetworkBridgePort): void;
    groundSampler(x: number, z: number): unknown;
    waitForInitialSnapshot(request: { viewerId: string; spectator: boolean }): Promise<unknown>;
    waitForPeerReadiness(): Promise<unknown>;
  };
  warm: {
    getFx(): unknown;
    terrain(bridge: NetworkBridgePort): MaybePromise<unknown>;
    wrecks(bridge: NetworkBridgePort): MaybePromise<unknown>;
    openingEffects(fx: unknown, bridge: NetworkBridgePort): MaybePromise<unknown>;
    shotCards(specIds: string[]): void;
    compile(): MaybePromise<unknown>;
  };
  presentation: {
    resetRoundState(): void;
    setGarageLighting(active: boolean): void;
    activate(request: {
      viewerId: string;
      own: NetworkBattlePresentationPlayer;
      spectator: boolean;
      mapId: string;
      bridge: NetworkBridgePort;
      fx: unknown;
    }): void;
    runBlackWatchdog(): unknown;
  };
}

export interface NetworkBattlePresentationRuntime {
  present(request: NetworkBattlePresentationRequest): Promise<void>;
}

/**
 * Own the cold-client path from an opaque network loader to one fully prepared
 * battle frame. Private/LAN and dedicated launchers share this operation; the
 * composition root supplies concrete renderer, world, transport and UI ports.
 */
export function createNetworkBattlePresentationRuntime({
  load,
  roster,
  entry,
  bridge,
  warm,
  presentation,
}: NetworkBattlePresentationOptions): NetworkBattlePresentationRuntime {
  const required = [load?.battleLoad?.show, load?.battleLoad?.rosters,
    load?.battleLoad?.progress, load?.battleLoad?.hide, load?.audio?.resume,
    load?.audio?.loadingOn, load?.audio?.ambientOn,
    load?.lighting?.setFarCascadeDormant, load?.ensureBattleVisuals,
    load?.nextFrame, load?.setAdaptiveSuspended, roster?.getMap, roster?.rows,
    roster?.vehicleName, roster?.emitBattleStart, roster?.setCamoBiome,
    entry?.acquire, entry?.loadModules, entry?.loadWorld, entry?.publishMatch,
    entry?.getMatch, bridge?.installInputRuntime, bridge?.createStatus,
    bridge?.publishStatus, bridge?.attachRecovery, bridge?.create,
    bridge?.publish, bridge?.groundSampler, bridge?.waitForInitialSnapshot,
    bridge?.waitForPeerReadiness, warm?.getFx, warm?.terrain, warm?.wrecks,
    warm?.openingEffects, warm?.shotCards, warm?.compile,
    presentation?.resetRoundState, presentation?.setGarageLighting,
    presentation?.activate, presentation?.runBlackWatchdog];
  if (required.some((value) => typeof value !== 'function')) {
    throw new TypeError('network battle presentation requires every lifecycle port');
  }

  const now = load.now ?? (() => performance.now());
  const recordTrace = load.recordTrace ?? (() => {});

  return {
    async present({
      viewerId,
      own,
      mapId,
      matchPlayers,
      modeLabel,
      connectMatch,
      signal,
      connectAfterWorld = false,
      transitionShown = false,
    }) {
      if (!viewerId || !own?.id || !own.specId || !mapId || !modeLabel
        || !Array.isArray(matchPlayers) || typeof connectMatch !== 'function') {
        throw new TypeError('network battle presentation requires a complete request');
      }
      throwIfNetworkBattleEntryAborted(signal);

      await load.ensureBattleVisuals();
      throwIfNetworkBattleEntryAborted(signal);
      load.audio.resume();
      load.audio.loadingOn(true);
      load.lighting.setFarCascadeDormant(false);

      const loadStartedAt = now();
      const trace: NetworkBattleLoadTrace = { mode: modeLabel, map: mapId, stages: {} };
      let markAt = loadStartedAt;
      const mark = (name: string) => {
        const markedAt = now();
        trace.stages[name] = Math.round(markedAt - markAt);
        markAt = markedAt;
      };
      recordTrace(trace);

      presentation.resetRoundState();
      roster.setCamoBiome(mapId);
      const spectator = own.team === 'spectator';
      const displayTeam = spectator ? 'alpha' : String(own.team || 'alpha');
      const opposingTeam = displayTeam === 'alpha' ? 'bravo' : 'alpha';
      const allies = () => roster.rows(matchPlayers, displayTeam, viewerId);
      const enemies = () => roster.rows(matchPlayers, opposingTeam, viewerId);

      if (!transitionShown) {
        const map = roster.getMap(mapId);
        roster.emitBattleStart({ playerId: viewerId, specId: own.specId, mapId });
        load.battleLoad.show({
          mapName: map.name,
          thumb: map.thumb,
          biome: map.biome,
          mode: modeLabel,
          allies: allies(),
          enemies: enemies(),
        });
      } else {
        load.battleLoad.rosters(allies(), enemies());
      }
      load.battleLoad.progress(0.02, 'Securing match channel');
      await load.nextFrame();
      throwIfNetworkBattleEntryAborted(signal);

      load.battleLoad.progress(0.08, 'Loading battlefield');
      const { modules } = await entry.acquire({
        loadModules: entry.loadModules,
        loadWorld: () => entry.loadWorld(mapId, (fraction, label) => {
          load.battleLoad.progress(0.08 + fraction * 0.48, label);
        }),
        connect: async () => {
          const match = await connectMatch();
          if (signal?.aborted) {
            match.close?.('network_entry_cancelled');
            throwIfNetworkBattleEntryAborted(signal);
          }
          return match;
        },
        connectAfterWorld,
        publishMatch: (match) => {
          try {
            throwIfNetworkBattleEntryAborted(signal);
            entry.publishMatch(match);
          } catch (error) {
            match.close?.('network_entry_cancelled');
            throw error;
          }
        },
        timings: trace,
      });
      throwIfNetworkBattleEntryAborted(signal);
      const [
        { createBrowserBattleBridge },
        { createNetworkStatus },
        { createBrowserInputRuntime },
      ] = modules;
      const fx = warm.getFx();
      bridge.installInputRuntime(createBrowserInputRuntime);
      mark('modulesWorldAndConnect');

      const status = bridge.createStatus(createNetworkStatus);
      bridge.publishStatus(status);
      bridge.attachRecovery(entry.getMatch()?.client ?? null, status);
      const map = roster.getMap(mapId);
      load.battleLoad.show({
        mapName: map.name,
        thumb: map.thumb,
        biome: map.biome,
        mode: modeLabel,
        allies: allies(),
        enemies: enemies(),
      });

      const preparedBridge = bridge.create(createBrowserBattleBridge, {
        viewerId,
        own,
        mapId,
        matchPlayers,
        modeLabel,
        connectMatch,
        connectAfterWorld,
        transitionShown,
      }, spectator);
      try {
        await preparedBridge.prepareRoster(matchPlayers, (fraction, specId) => {
          load.battleLoad.progress(
            0.56 + fraction * 0.27,
            `Painting ${roster.vehicleName(specId)}`,
          );
        });
        throwIfNetworkBattleEntryAborted(signal);
      } catch (error) {
        preparedBridge.dispose();
        throw error;
      }
      mark('roster');

      for (const entity of preparedBridge.entities.values()) {
        entity.visual?.setGroundSampler?.(bridge.groundSampler);
      }
      load.battleLoad.progress(0.84, 'Synchronizing authority');
      let initial: unknown;
      try {
        initial = await bridge.waitForInitialSnapshot({ viewerId, spectator });
        throwIfNetworkBattleEntryAborted(signal);
      } catch (error) {
        preparedBridge.dispose();
        throw error;
      }
      mark('initialSnapshot');
      bridge.publish(preparedBridge);
      preparedBridge.apply(initial, 1 / 60);
      presentation.setGarageLighting(false);

      load.battleLoad.progress(0.845, 'Warming suspension terrain');
      await warm.terrain(preparedBridge);
      throwIfNetworkBattleEntryAborted(signal);
      mark('terrainGrid');
      load.battleLoad.progress(0.85, 'Priming wreck variants');
      await warm.wrecks(preparedBridge);
      throwIfNetworkBattleEntryAborted(signal);
      load.battleLoad.progress(0.87, 'Priming combat effects');
      await warm.openingEffects(fx, preparedBridge);
      throwIfNetworkBattleEntryAborted(signal);
      mark('combatWarm');
      warm.shotCards([...preparedBridge.entities.values()].map((entity) => entity.specId));

      load.battleLoad.progress(0.88, 'Compiling combat shaders');
      await load.nextFrame();
      try {
        await warm.compile();
      } catch (_) { /* warm only */ }
      throwIfNetworkBattleEntryAborted(signal);
      mark('compile');
      load.battleLoad.progress(0.96, 'Waiting for every commander');
      await bridge.waitForPeerReadiness();
      throwIfNetworkBattleEntryAborted(signal);
      mark('readyBarrier');

      presentation.activate({ viewerId, own, spectator, mapId, bridge: preparedBridge, fx });
      try {
        trace.blackCheck = presentation.runBlackWatchdog();
      } catch (error) {
        trace.blackCheck = {
          error: error instanceof Error ? error.message : String(error),
        };
      }

      load.audio.loadingOn(false);
      load.audio.ambientOn(true);
      load.battleLoad.progress(1, 'Ready');
      load.setAdaptiveSuspended(false);
      await load.battleLoad.hide();
      mark('reveal');
      trace.totalMs = Math.round(now() - loadStartedAt);
    },
  };
}
