import type { RuntimeValue } from '../runtimeTypes.ts';
import { checkedIntegrationPort } from '../app/checkedIntegrationPort.ts';
import { throwIfNetworkBattleEntryAborted } from './networkBattleEntryAbort.ts';
import type {
  BrowserBattleBridge,
  createBrowserBattleBridge,
  prepareBrowserBattleRosterAssets,
} from './browserBattleBridge.ts';
import type { BrowserRosterAssetPreparation } from './browserRosterAssets.ts';
import type { createBrowserInputRuntime } from './browserInputRuntime.ts';
import type { SampledSnapshotFrame } from './snapshot.ts';
import type { createNetworkStatus } from '../ui/networkStatus.ts';
import type { BattleLoadRosterRow, BattleLoadScreen } from '../ui/battleLoad.ts';
import type { OpeningEffectsWarmOptions } from '../game/battleWarmRuntime.ts';
import type { NetworkBrowserMatch } from './networkBrowserSessionRuntime.ts';
import type { NetworkBattleActivationRequest } from './networkBattleActivationRuntime.ts';
import type { ProgramPreparationResult } from '../engine/programWarm.ts';

type MaybePromise<T> = T | PromiseLike<T>;

export interface NetworkBattlePresentationPlayer {
  id: string;
  specId: string;
  team?: string;
  name?: string;
  camo?: string;
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

const NETWORK_LOAD_STAGES = ['modulesWorldAndConnect', 'roster', 'initialSnapshot',
  'atmosphere', 'nightLighting', 'terrainGrid', 'wreckWarm', 'compile', 'panelJoin', 'combatWarm', 'reveal', 'readyBarrier'] as const;
type NetworkLoadStage = typeof NETWORK_LOAD_STAGES[number];
type NetworkRevealSlice = 'activation' | 'finalShadows' | 'blackWatchdog' | 'primeReveal' | 'loaderFade';
type NetworkPreparationSlice = 'rosterAssets' | 'panelMasks' | 'compile';

interface NetworkLoadInterval<Stage extends string> {
  stage: Stage;
  /** Page performance.now() timebase, matching long-task startTime. */
  startTime: number;
  /** Absent while this operation is pending. */
  endTime?: number;
}

export interface NetworkBattleLoadTrace {
  mode: string;
  map: string;
  stages: Record<string, number>;
  startedAt: number;
  endedAt?: number;
  status: 'pending' | 'complete' | 'failed';
  stageIntervals: NetworkLoadInterval<NetworkLoadStage>[];
  revealSlices: NetworkLoadInterval<NetworkRevealSlice>[];
  /** Independent job lifetimes; overlapping durations must not be added. */
  preparationSlices: NetworkLoadInterval<NetworkPreparationSlice>[];
  modulesMs?: number;
  worldMs?: number;
  connectMs?: number;
  rosterAssetsFailed?: boolean;
  blackCheck?: RuntimeValue;
  programCompile?: RuntimeValue;
  scarCompile?: RuntimeValue;
  shadowPrime?: RuntimeValue;
  totalMs?: number;
}

function createNetworkLoadTimer(trace: NetworkBattleLoadTrace, now: () => number) {
  const close = (rows: NetworkLoadInterval<string>[], at: number): void => {
    const interval = rows.at(-1);
    if (interval && interval.endTime === undefined) interval.endTime = at;
  };
  return {
    mark(stage: NetworkLoadStage): void {
      const at = now();
      const interval = trace.stageIntervals.at(-1)!;
      trace.stages[stage] = Math.round(at - interval.startTime);
      close(trace.stageIntervals, at);
      const next = NETWORK_LOAD_STAGES[NETWORK_LOAD_STAGES.indexOf(stage) + 1];
      if (next) trace.stageIntervals.push({ stage: next, startTime: at });
    },
    beginSlice(stage: NetworkRevealSlice): void {
      trace.revealSlices.push({ stage, startTime: now() });
    },
    endSlice(): void { close(trace.revealSlices, now()); },
    finish(status: 'complete' | 'failed'): void {
      const at = now();
      close(trace.stageIntervals, at);
      close(trace.revealSlices, at);
      trace.status = status;
      trace.endedAt = at;
      trace.totalMs = Math.round(at - trace.startedAt);
    },
  };
}

async function measurePreparation<T>(
  trace: NetworkBattleLoadTrace,
  now: () => number,
  stage: NetworkPreparationSlice,
  prepare: () => MaybePromise<T>,
): Promise<T> {
  const interval: NetworkLoadInterval<NetworkPreparationSlice> = { stage, startTime: now() };
  trace.preparationSlices.push(interval);
  try { return await prepare(); }
  finally { interval.endTime = now(); }
}

function observePreparation<T>(promise: Promise<T>): Promise<PromiseSettledResult<T>> {
  return promise.then(
    (value) => ({ status: 'fulfilled', value }),
    (reason: RuntimeValue) => ({ status: 'rejected', reason }),
  );
}

/** Import completion can outlive acquisition failure. Close admission before
 * draining the material owner, so late imports cannot start abandoned work. */
function createRosterAssetLifetime(trace: NetworkBattleLoadTrace, now: () => number) {
  let closed = false;
  let preparation: BrowserRosterAssetPreparation | null = null;
  let pending: Promise<PromiseSettledResult<void>> | null = null;
  return {
    start(create: () => BrowserRosterAssetPreparation): void {
      if (closed) return;
      pending = observePreparation(measurePreparation(trace, now, 'rosterAssets', () => {
        preparation = create();
        return preparation.ready;
      }));
    },
    async join(): Promise<void> {
      const result = await pending;
      // Optional prepainting retains the ordinary roster retry/fallback path.
      trace.rosterAssetsFailed = result?.status === 'rejected';
    },
    players(fallback: NetworkBattlePresentationPlayer[]): NetworkBattlePresentationPlayer[] {
      return preparation?.players ?? fallback;
    },
    async dispose(): Promise<void> {
      closed = true;
      const drain = preparation?.dispose();
      await pending;
      await drain;
    },
  };
}

type NetworkMatchPort = NetworkBrowserMatch;

type NetworkBridgePort = BrowserBattleBridge;
type NetworkBattleFxPort = OpeningEffectsWarmOptions['fx'] &
  NetworkBattleActivationRequest['fx'];

type NetworkStatusPort = ReturnType<typeof createNetworkStatus>;

interface BrowserBattleBridgeModulePort {
  createBrowserBattleBridge: typeof createBrowserBattleBridge;
  prepareBrowserBattleRosterAssets: typeof prepareBrowserBattleRosterAssets;
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
      resume(): RuntimeValue;
      loadingOn(active: boolean): RuntimeValue;
      ambientOn(active: boolean): RuntimeValue;
    };
    lighting: { setFarCascadeDormant(dormant: boolean): void };
    ensureBattleVisuals(): MaybePromise<RuntimeValue>;
    nextFrame(): MaybePromise<RuntimeValue>;
    primeReveal(): Promise<RuntimeValue>;
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
      loadWorld: () => MaybePromise<RuntimeValue>;
      connect: () => MaybePromise<NetworkMatchPort>;
      publishMatch: (match: NetworkMatchPort) => void;
      connectAfterWorld: boolean;
      timings: NetworkBattleLoadTrace;
    }): Promise<{ modules: NetworkEntryModules }>;
    loadModules(): MaybePromise<NetworkEntryModules>;
    loadWorld(
      mapId: string,
      onProgress: (fraction: number, label: string) => void,
    ): MaybePromise<RuntimeValue>;
    publishMatch(match: NetworkMatchPort): void;
    getMatch(): NetworkMatchPort | null;
  };
  bridge: {
    prepareRosterAssets(
      factory: typeof prepareBrowserBattleRosterAssets,
      request: NetworkBattlePresentationRequest,
      spectator: boolean,
    ): BrowserRosterAssetPreparation;
    installInputRuntime(factory: typeof createBrowserInputRuntime): void;
    createStatus(factory: typeof createNetworkStatus): NetworkStatusPort;
    publishStatus(status: NetworkStatusPort): void;
    attachRecovery(client: RuntimeValue, status: NetworkStatusPort): void;
    create(
      factory: typeof createBrowserBattleBridge,
      request: NetworkBattlePresentationRequest,
      spectator: boolean,
    ): NetworkBridgePort;
    publish(bridge: NetworkBridgePort): void;
    groundSampler(x: number, z: number): RuntimeValue;
    waitForInitialSnapshot(
      request: { viewerId: string; spectator: boolean },
    ): Promise<SampledSnapshotFrame>;
    waitForPeerReadiness(): Promise<RuntimeValue>;
  };
  warm: {
    atmosphere?(initial: SampledSnapshotFrame): MaybePromise<void>;
    nightLighting?(): MaybePromise<void>;
    getFx(): NetworkBattleFxPort;
    terrain(bridge: NetworkBridgePort): MaybePromise<RuntimeValue>;
    wrecks(bridge: NetworkBridgePort, signal?: AbortSignal): MaybePromise<RuntimeValue>;
    playerPanel(bridge: NetworkBridgePort, viewerId: string): MaybePromise<RuntimeValue>;
    openingEffects(
      fx: NetworkBattleFxPort,
      bridge: NetworkBridgePort,
      signal?: AbortSignal,
    ): MaybePromise<RuntimeValue>;
    shotCards(specIds: string[]): void;
    compile(signal?: AbortSignal): MaybePromise<{ preparation: ProgramPreparationResult }>;
    finalShadows(signal?: AbortSignal): MaybePromise<RuntimeValue>;
  };
  presentation: {
    resetRoundState(): void;
    setGarageLighting(active: boolean): void;
    setWaitingForPeers(waiting: boolean): void;
    activate(request: NetworkBattleActivationRequest): void;
    runBlackWatchdog(signal?: AbortSignal): MaybePromise<RuntimeValue>;
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
      ['prepareRosterAssets', 'installInputRuntime', 'createStatus', 'publishStatus', 'attachRecovery',
        'create', 'publish', 'groundSampler', 'waitForInitialSnapshot',
        'waitForPeerReadiness'],
    );
    checkedIntegrationPort(
      options.warm ?? {},
      'network battle warmup',
      ['getFx', 'terrain', 'wrecks', 'playerPanel', 'openingEffects', 'shotCards', 'compile', 'finalShadows'],
    );
    checkedIntegrationPort(
      options.presentation ?? {},
      'network battle activation',
      ['resetRoundState', 'setGarageLighting', 'setWaitingForPeers', 'activate', 'runBlackWatchdog'],
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

      load.audio.resume();
      load.audio.loadingOn(true);
      load.lighting.setFarCascadeDormant(false);

      const loadStartedAt = now();
      const trace: NetworkBattleLoadTrace = {
        mode: modeLabel, map: mapId, stages: {}, startedAt: loadStartedAt,
        status: 'pending',
        stageIntervals: [{ stage: 'modulesWorldAndConnect', startTime: loadStartedAt }],
        revealSlices: [],
        preparationSlices: [],
      };
      const timer = createNetworkLoadTimer(trace, now);
      const rosterAssets = createRosterAssetLifetime(trace, now);
      const mark = timer.mark;
      recordTrace(trace);

      try {
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
        loadModules: async () => {
          const [modules] = await Promise.all([entry.loadModules(), load.ensureBattleVisuals()]);
          rosterAssets.start(() => bridge.prepareRosterAssets(
            modules[0].prepareBrowserBattleRosterAssets, request, spectator,
          ));
          return modules;
        },
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

      // Asset painting overlaps acquisition, but scene objects still wait for
      // the world and connection. Never race the painter with visual creation.
      await rosterAssets.join();
      throwIfNetworkBattleEntryAborted(signal);
      const preparedPlayers = rosterAssets.players(matchPlayers);

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
        matchPlayers: preparedPlayers,
        modeLabel,
        connectMatch,
        signal,
        connectAfterWorld,
        transitionShown,
      }, spectator);
      try {
        await preparedBridge.prepareRoster(preparedPlayers, (fraction, specId) => {
          load.battleLoad.progress(
            0.56 + fraction * 0.27,
            `Painting ${roster.vehicleName(specId)}`,
          );
        });
        throwIfNetworkBattleEntryAborted(signal);
        // Every visual now owns its own cache reference; release temporary
        // entry leases before advancing to snapshot/render preparation.
        await rosterAssets.dispose();
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

      await warm.atmosphere?.(initial);
      throwIfNetworkBattleEntryAborted(signal);
      mark('atmosphere');
      await warm.nightLighting?.();
      throwIfNetworkBattleEntryAborted(signal);
      mark('nightLighting');

      load.battleLoad.progress(0.845, 'Warming suspension terrain');
      await warm.terrain(preparedBridge);
      throwIfNetworkBattleEntryAborted(signal);
      mark('terrainGrid');
      load.battleLoad.progress(0.85, 'Priming wreck variants');
      await warm.wrecks(preparedBridge, signal);
      throwIfNetworkBattleEntryAborted(signal);
      mark('wreckWarm');

      load.battleLoad.progress(0.86, 'Preparing player panel');
      throwIfNetworkBattleEntryAborted(signal);
      // Wreck preparation has installed the final shared shader hooks, and the
      // viewer snapshot has made the exact source visible. Mask preparation
      // can now overlap scene compilation, using its private clone/camera and
      // independently owned readbacks. Observe failure before yielding.
      const panel = !spectator && preparedBridge.entities.get(viewerId)
        ? observePreparation(measurePreparation(trace, now, 'panelMasks',
          () => warm.playerPanel(preparedBridge, viewerId)))
        : null;
      try {
        load.battleLoad.progress(0.87, 'Compiling combat shaders');
        await load.nextFrame();
        throwIfNetworkBattleEntryAborted(signal);
        const compiled = await measurePreparation(trace, now, 'compile', () => warm.compile(signal));
        trace.programCompile = compiled;
        throwIfNetworkBattleEntryAborted(signal);
        // Exhausting a cooperative generator is not proof that its programs
        // are ready. Never move unfinished shader work into the atomic opening
        // render; the finally block drains the borrowed panel before recovery.
        if (compiled?.preparation?.status !== 'complete' || compiled.preparation.pending !== 0) {
          throw new Error('Battle shaders could not finish preparing. Please retry from the Garage.');
        }
        mark('compile');
        load.battleLoad.progress(0.875, 'Completing player panel');
        const result = await panel;
        throwIfNetworkBattleEntryAborted(signal);
        if (result?.status === 'rejected') throw result.reason;
        mark('panelJoin');
      } finally {
        // Never race/abandon the mask job on compile/frame/cancellation errors.
        // The launcher may dispose its borrowed visual when present rejects.
        // This non-rejecting join preserves the primary error and drains every
        // writer before Garage restoration or opening-effect material changes.
        await panel;
        // Shader generators may reject with the raw AbortSignal reason.
        // Cancellation wins after this shader/panel scope has fully drained;
        // unrelated later render failures retain their original error policy.
        throwIfNetworkBattleEntryAborted(signal);
      }
      throwIfNetworkBattleEntryAborted(signal);

      load.battleLoad.progress(0.88, 'Priming combat effects');
      trace.scarCompile = await warm.openingEffects(fx, preparedBridge, signal);
      throwIfNetworkBattleEntryAborted(signal);
      warm.shotCards([...preparedBridge.entities.values()].map((entity) => entity.specId));
      mark('combatWarm');

      presentation.setWaitingForPeers(initial.meta?.phase === 'loading');
      timer.beginSlice('activation');
      presentation.activate({ viewerId, own, spectator, mapId, bridge: preparedBridge, fx });
      timer.endSlice();
      throwIfNetworkBattleEntryAborted(signal);
      // Spectator camera blending settles during the existing real-frame
      // reveal path; only the player activation snaps a reusable final pose.
      if (!spectator) {
        timer.beginSlice('finalShadows');
        trace.shadowPrime = await warm.finalShadows(signal);
        timer.endSlice();
        throwIfNetworkBattleEntryAborted(signal);
      }
      timer.beginSlice('blackWatchdog');
      try {
        trace.blackCheck = await presentation.runBlackWatchdog(signal);
      } catch (error) {
        // The watchdog owns compatibility fallback; an unexpected rejection
        // leaves the frame unverified and must keep the reveal covered.
        trace.blackCheck = {
          failed: true,
          error: error instanceof Error ? error.message : String(error),
        };
      } finally {
        timer.endSlice();
      }
      throwIfNetworkBattleEntryAborted(signal);

      if (trace.blackCheck && typeof trace.blackCheck === 'object'
        && 'failed' in trace.blackCheck && trace.blackCheck.failed === true) {
        throw new Error('Battle graphics could not be verified. Please retry from the Garage.');
      }
      load.audio.loadingOn(false);
      load.audio.ambientOn(true);
      load.battleLoad.progress(1, 'Ready');
      // Uncover only after one complete battle frame has presented from the
      // final camera/world pose. This is the same reveal barrier as solo entry
      // and prevents both black flashes and a first-frame shader hitch.
      timer.beginSlice('primeReveal');
      await load.primeReveal();
      timer.endSlice();
      throwIfNetworkBattleEntryAborted(signal);
      timer.beginSlice('loaderFade');
      await load.battleLoad.hide();
      timer.endSlice();
      throwIfNetworkBattleEntryAborted(signal);
      mark('reveal');
      // READY starts the shared authority countdown. Declare it only after the
      // expensive first frame and loader fade so none of that countdown is hidden.
      await bridge.waitForPeerReadiness();
      throwIfNetworkBattleEntryAborted(signal);
      mark('readyBarrier');
      presentation.setWaitingForPeers(false);
      load.setAdaptiveSuspended(false);
      timer.finish('complete');
      } catch (error) {
        await rosterAssets.dispose();
        timer.finish('failed');
        throw error;
      }
    },
  };
}
