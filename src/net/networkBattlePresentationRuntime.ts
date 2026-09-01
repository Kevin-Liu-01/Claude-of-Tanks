import { checkedIntegrationPort } from '../app/checkedIntegrationPort.ts';
import { throwIfNetworkBattleEntryAborted } from './networkBattleEntryAbort.ts';
import type {
  BrowserBattleBridge,
  createBrowserBattleBridge,
} from './browserBattleBridge.ts';
import type { createBrowserInputRuntime } from './browserInputRuntime.ts';
import type { SampledSnapshotFrame } from './snapshot.ts';
import type { createNetworkStatus } from '../ui/networkStatus.ts';
import type { BattleLoadRosterRow, BattleLoadScreen } from '../ui/battleLoad.ts';
import type { OpeningEffectsWarmOptions } from '../game/battleWarmRuntime.ts';
import type { NetworkBrowserMatch } from './networkBrowserSessionRuntime.ts';
import type { NetworkBattleActivationRequest } from './networkBattleActivationRuntime.ts';

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

type NetworkMatchPort = NetworkBrowserMatch;

type NetworkBridgePort = BrowserBattleBridge;
type NetworkBattleFxPort = OpeningEffectsWarmOptions['fx'] &
  NetworkBattleActivationRequest['fx'];

type NetworkStatusPort = ReturnType<typeof createNetworkStatus>;

interface BrowserBattleBridgeModulePort {
  createBrowserBattleBridge: typeof createBrowserBattleBridge;
}

interface NetworkStatusModulePort {
  createNetworkStatus: typeof createNetworkStatus;
}

interface BrowserInputRuntimeModulePort {
  createBrowserInputRuntime: typeof createBrowserInputRuntime;
}

type NetworkEntryModules = readonly [
  BrowserBattleBridgeModulePort,
  NetworkStatusModulePort,
  BrowserInputRuntimeModulePort,
];

export interface NetworkBattlePresentationOptions {
  load: {
    battleLoad: BattleLoadScreen;
    audio: {
      resume(): unknown;
      loadingOn(active: boolean): unknown;
      ambientOn(active: boolean): unknown;
    };
    lighting: { setFarCascadeDormant(dormant: boolean): void };
    ensureBattleVisuals(): MaybePromise<unknown>;
    nextFrame(): MaybePromise<unknown>;
    primeReveal(): Promise<unknown>;
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
    ): BattleLoadRosterRow[];
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
    installInputRuntime(factory: typeof createBrowserInputRuntime): void;
    createStatus(factory: typeof createNetworkStatus): NetworkStatusPort;
    publishStatus(status: NetworkStatusPort): void;
    attachRecovery(client: unknown, status: NetworkStatusPort): void;
    create(
      factory: typeof createBrowserBattleBridge,
      request: NetworkBattlePresentationRequest,
      spectator: boolean,
    ): NetworkBridgePort;
    publish(bridge: NetworkBridgePort): void;
    groundSampler(x: number, z: number): unknown;
    waitForInitialSnapshot(
      request: { viewerId: string; spectator: boolean },
    ): Promise<SampledSnapshotFrame>;
    waitForPeerReadiness(): Promise<unknown>;
  };
  warm: {
    getFx(): NetworkBattleFxPort;
    terrain(bridge: NetworkBridgePort): MaybePromise<unknown>;
    wrecks(bridge: NetworkBridgePort): MaybePromise<unknown>;
    openingEffects(
      fx: NetworkBattleFxPort,
      bridge: NetworkBridgePort,
    ): MaybePromise<unknown>;
    shotCards(specIds: string[]): void;
    compile(): MaybePromise<unknown>;
  };
  presentation: {
    resetRoundState(): void;
    setGarageLighting(active: boolean): void;
    activate(request: NetworkBattleActivationRequest): void;
    runBlackWatchdog(): unknown;
  };
}

export interface NetworkBattlePresentationRuntime {
  present(request: NetworkBattlePresentationRequest): Promise<void>;
}

function validateNetworkPresentationPorts(options: NetworkBattlePresentationOptions): void {
  try {
    checkedIntegrationPort<BattleLoadScreen>(
      options.load?.battleLoad ?? {},
      'network battle load screen',
      ['show', 'rosters', 'progress', 'hide'],
    );
    checkedIntegrationPort(
      options.load?.audio ?? {},
      'network battle audio',
      ['resume', 'loadingOn', 'ambientOn'],
    );
    checkedIntegrationPort(
      options.load?.lighting ?? {},
      'network battle lighting',
      ['setFarCascadeDormant'],
    );
    checkedIntegrationPort(
      options.load ?? {},
      'network battle loading',
      ['ensureBattleVisuals', 'nextFrame', 'primeReveal', 'setAdaptiveSuspended'],
    );
    checkedIntegrationPort(
      options.roster ?? {},
      'network battle roster',
      ['getMap', 'rows', 'vehicleName', 'emitBattleStart', 'setCamoBiome'],
    );
    checkedIntegrationPort(
      options.entry ?? {},
      'network battle entry',
      ['acquire', 'loadModules', 'loadWorld', 'publishMatch', 'getMatch'],
    );
    checkedIntegrationPort(
      options.bridge ?? {},
      'network battle bridge',
      ['installInputRuntime', 'createStatus', 'publishStatus', 'attachRecovery',
        'create', 'publish', 'groundSampler', 'waitForInitialSnapshot',
        'waitForPeerReadiness'],
    );
    checkedIntegrationPort(
      options.warm ?? {},
      'network battle warmup',
      ['getFx', 'terrain', 'wrecks', 'openingEffects', 'shotCards', 'compile'],
    );
    checkedIntegrationPort(
      options.presentation ?? {},
      'network battle activation',
      ['resetRoundState', 'setGarageLighting', 'activate', 'runBlackWatchdog'],
    );
  } catch {
    throw new TypeError('network battle presentation requires every lifecycle port');
  }
}

function validateNetworkPresentationRequest(
  request: NetworkBattlePresentationRequest,
): void {
  if (!request.viewerId || !request.own?.id || !request.own.specId ||
      !request.mapId || !request.modeLabel || !Array.isArray(request.matchPlayers) ||
      typeof request.connectMatch !== 'function') {
    throw new TypeError('network battle presentation requires a complete request');
  }
}

function presentationTeams(team: string | undefined): {
  spectator: boolean;
  displayTeam: string;
  opposingTeam: string;
} {
  const spectator = team === 'spectator';
  const displayTeam = spectator ? 'alpha' : String(team || 'alpha');
  return {
    spectator,
    displayTeam,
    opposingTeam: displayTeam === 'alpha' ? 'bravo' : 'alpha',
  };
}

/**
 * Own the cold-client path from an opaque network loader to one fully prepared
 * battle frame. Private/LAN and dedicated launchers share this operation; the
 * composition root supplies concrete renderer, world, transport and UI ports.
 */
export function createNetworkBattlePresentationRuntime(
  options: NetworkBattlePresentationOptions,
): NetworkBattlePresentationRuntime {
  validateNetworkPresentationPorts(options);
  const {
  load,
  roster,
  entry,
  bridge,
  warm,
  presentation,
  } = options;

  const now = load.now ?? (() => performance.now());
  const recordTrace = load.recordTrace ?? (() => {});

  return {
    async present(request) {
      validateNetworkPresentationRequest(request);
      const {
      viewerId,
      own,
      mapId,
      matchPlayers,
      modeLabel,
      connectMatch,
      signal,
      connectAfterWorld = false,
      transitionShown = false,
      } = request;
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
      const { spectator, displayTeam, opposingTeam } = presentationTeams(own.team);
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
      let initial: SampledSnapshotFrame;
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
      // Uncover only after one complete battle frame has presented from the
      // final camera/world pose. This is the same reveal barrier as solo entry
      // and prevents both black flashes and a first-frame shader hitch.
      await load.primeReveal();
      await load.battleLoad.hide();
      load.setAdaptiveSuspended(false);
      mark('reveal');
      trace.totalMs = Math.round(now() - loadStartedAt);
    },
  };
}
