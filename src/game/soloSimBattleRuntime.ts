/**
 * A free sortie's battle on the solo sim Worker (RUST-ENGINE-DECISION §7 step 5, the rework of 2026-10-26, phase 3). Solo's
 * own entry around the Worker's authority, under the press's cover (soloBattleEntryRuntime): the Worker builds its
 * battlefield and the roster's anatomy while the page loads its world; the battle presentation is built on that world and
 * the page's client is seated with the sortie's planned seats; the viewer's vehicle is built first and the covered warms
 * run over it; the other seats are taken in under the cover; the battle phase is activated and the loader fades; the
 * Worker's held count runs from that reveal. The presentation keeps the game state the HUD, killcam and end screen read,
 * and the battle frame's hold (Esc, the killcam) stands the Worker's tick.
 *
 * No room, session, host, seat token, signalling, status strip or multiplayer telemetry: the network presentation and the
 * app's load, warm and activation ports are shared with the multiplayer composition, nothing else. Node-runnable: every
 * app surface is a port (soloSimBattleRuntime.selftest.mjs drives it over the in-process core).
 */
import { createBattlePresentation } from '../mp/presentation/battlePresentation.ts';
import type { BattlePresentation, RosterPrebuild, RosterPrebuildSeat } from '../mp/presentation/battlePresentation.ts';
import { createControlSampler } from '../mp/presentation/controlSampler.ts';
import type { ControlSampler } from '../mp/presentation/controlSampler.ts';
import type { MatchFrame } from '../mp/match/matchClient.ts';
import { MATCH_BUILD } from '../mp/wire/matchBuild.ts';
import type { WelcomeMessage } from '../mp/wire/messages.ts';
// (the multiplayer composition's port shapes, types only: the app passes the same load, warm and activation ports to both)
import type {
  BrowserEntryLifecycle, BrowserLoadPorts, BrowserPendingProgram, BrowserPresentationPorts, BrowserRosterPorts,
  BrowserScenePorts, BrowserWarmPorts, BrowserWarmPreparation, BrowserWarmView,
} from '../mp/session/browserComposition.ts';
import { terrainVariantFor } from '../sim/matchRuleset.ts';
import type { TeamArrangement } from '../sim/matchRuleset.ts';
import { getSpec } from '../vehicles/specs.ts';
import { createSoloSimSession } from './soloSimSession.ts';
import type { SoloSimSession } from './soloSimSession.ts';
import type { PageToSoloSim, SoloSimBoot, SoloSimPort, SoloSimSeat, SoloSimToPage, SoloSimWorld } from './soloSimProtocol.ts';

/** One sortie: the player's vehicle, the battlefield, the mode, and every seat planned up front (rosterState.planBattleSeats). */
export interface SoloSimSortie {
  specId: string;
  mapId: string;
  mode: string;
  /** The authority's seed (the weather, the match's draws). */
  seed: number;
  /** The player's seat first, then the bots, each with its side, vehicle and callsign as the load card named it. */
  seats: SoloSimSeat[];
  arrangement?: TeamArrangement | null;
  /** The visible count from the reveal (solo's 3 s). */
  countdownS: number;
  /** The paint each seat wears (the player's selection, a bot's biome roll). */
  camoFor(playerId: string, specId: string): string;
}

/** What a sortie's entry recorded, stage by stage (window.__SOLO_SIM_LOAD). */
export interface SoloSimLoadTrace {
  version: 1;
  map: string;
  mode: string;
  seats: number;
  stages: Record<string, number>;
  startedAt: number;
  status: 'pending' | 'complete' | 'failed';
  totalMs?: number;
  boot?: { tick: number; bootMs: number } | null;
  compile?: { attempts: number; outcome: 'complete' | 'deferred'; pending: number | null; programs?: readonly BrowserPendingProgram[] };
  streamedRoster?: { actors: number; buildMs: number; ms: number };
  /** (262) The opening warm's own time inside combatWarm, and what it reported (its pacing, texture staging, batches). */
  openingEffects?: { ms: number; detail?: unknown };
  blackCheck?: unknown;
  failure?: { stage: string; message: string };
}

export interface SoloSimBattlePorts {
  lifecycle: Pick<BrowserEntryLifecycle, 'primeReveal'>;
  load: Pick<BrowserLoadPorts, 'audio' | 'lighting' | 'ensureBattleVisuals' | 'loadModules' | 'loadWorld' | 'prebuildRoster'
    | 'loadAuthorityObstacles' | 'nextFrame' | 'setAdaptiveSuspended'> & {
    battleLoad: Pick<BrowserLoadPorts['battleLoad'], 'progress' | 'hide'>;
    recordTrace?(trace: SoloSimLoadTrace): void;
  };
  roster: Pick<BrowserRosterPorts, 'vehicleName' | 'emitBattleStart' | 'setCamoBiome'>;
  scene: BrowserScenePorts;
  warm: BrowserWarmPorts;
  presentation: Pick<BrowserPresentationPorts, 'activate' | 'setGarageLighting' | 'runBlackWatchdog'>;
  /** The Worker's channel: the one the Battle hover prepared for this battlefield, or a fresh Worker. */
  openWorker(battlefield: Pick<SoloSimWorld, 'mapId' | 'mode'>): SoloSimPort<SoloSimToPage, PageToSoloSim>;
  /** Where the Worker reads the battlefield (the collision manifests) and its kernels. */
  world: Pick<SoloSimWorld, 'manifestBase' | 'simKernelsUrl'>;
  /** The page's match line (the Worker runs the same build: wire/matchBuild.ts). */
  clientBuild?: string;
  now?(): number;
  reportWarning?(scope: string, message: string): void;
  /** The battle presentation's factory (the receipts record one). */
  createPresentation?: typeof createBattlePresentation;
  /** The page hidden: the Worker's tick stands, as the page's own battle stands with its frames. */
  visibility?: { hidden(): boolean; onChange(listener: () => void): () => void };
}

export interface SoloSimBattleRuntime {
  /** The sortie's entry: resolves at the reveal, rejects on a failure (the solo entry's covered Garage restore follows). */
  begin(sortie: SoloSimSortie): Promise<void>;
  /** A sortie loading or live: the battle frame pumps it and reads the presentation's actors. */
  readonly active: boolean;
  readonly inMatch: boolean;
  /** One display frame: the Worker's frames to the presentation. */
  pump(dtSeconds: number, nowMs: number): void;
  /** The battle frame's hold (the settings open, the killcam): the Worker's tick stands (and while the page is hidden). */
  setPaused(paused: boolean): boolean;
  queueConsumable(slot: number): void;
  queueAction(action: Parameters<ControlSampler['queueAction']>[0]): void;
  /** The Garage return: the Worker stops and the presentation goes. */
  disposePresentation(): void;
  stats(): { active: boolean; inMatch: boolean; revealed: boolean; frames: number; actors: number; paused: boolean } | null;
}

/** The strict shader preparation's windows, as the multiplayer entry's (browserComposition COMPILE_STALL_WINDOWS). */
const COMPILE_STALL_WINDOWS = 3;
const COMPILE_CEILING_MS = 20_000;

class SortieSupersededError extends Error {
  constructor(detail: string) { super(`solo sim sortie superseded: ${detail}`); this.name = 'SortieSupersededError'; }
}

const messageOf = (error: unknown): string => (error instanceof Error ? error.message : String(error));

/** A failed sortie's error, named with its stage (`boot`: the Worker could not start, and the page can take the battle). */
function stageError(error: unknown, stage: string): Error & { soloSimStage: string } {
  const failure = error instanceof Error ? error : new Error(String(error));
  return Object.assign(failure, { soloSimStage: (failure as { soloSimStage?: string }).soloSimStage ?? stage });
}

interface ActiveSortie {
  sortie: SoloSimSortie;
  viewerId: string;
  abort: AbortController;
  /** The Worker's channel until the session owns it. */
  port: SoloSimPort<SoloSimToPage, PageToSoloSim> | null;
  presentation: BattlePresentation | null;
  session: SoloSimSession | null;
  controls: ControlSampler;
  welcomed: boolean;
  lit: boolean;
  activating: boolean;
  activated: boolean;
  revealed: boolean;
  failed: boolean;
  frames: number;
  trace: SoloSimLoadTrace;
  stageAt: number;
  entry: { resolve(): void; reject(error: unknown): void };
  unsubscribe: (() => void)[];
}

export function createSoloSimBattleRuntime(ports: SoloSimBattlePorts): SoloSimBattleRuntime {
  const { lifecycle, load, roster, scene, warm, presentation: activation, world, clientBuild = MATCH_BUILD } = ports;
  const now = ports.now ?? (() => performance.now());
  const reportWarning = ports.reportWarning ?? ((scope, message) => console.warn(`[${scope}] ${message}`));
  let current: ActiveSortie | null = null;
  // the battle frame's hold, and the page hidden: either stands the Worker's tick
  let held = false;
  let hidden = false;
  const applyHold = (active: ActiveSortie): void => { active.session?.setPaused(held || hidden); };

  const markStage = (active: ActiveSortie, stage: string): void => {
    const at = now();
    active.trace.stages[stage] = Math.round(at - active.stageAt);
    active.stageAt = at;
  };

  const release = (active: ActiveSortie): void => {
    active.abort.abort('sortie_ended');
    for (const unsubscribe of active.unsubscribe.splice(0)) unsubscribe();
    if (active.session) active.session.dispose();
    else active.port?.close();
    active.port = null;
    active.session = null;
    active.presentation?.dispose();
    active.presentation = null;
    if (current === active) current = null;
  };

  const fail = (active: ActiveSortie, error: unknown, stage: string): void => {
    if (active.failed) return;
    active.failed = true;
    active.trace.status = 'failed';
    active.trace.failure = { stage, message: messageOf(error) };
    active.trace.totalMs = Math.round(now() - active.trace.startedAt);
    load.recordTrace?.(active.trace);
    release(active);
    active.entry.reject(stageError(error, stage));
  };

  /** The strict shader preparation, window after window while programs keep linking; past its ceiling the reveal links the rest. */
  const prepareCombatShaders = async (active: ActiveSortie, check: (detail: string) => void): Promise<void> => {
    const startedAt = now();
    let previous: BrowserWarmPreparation = undefined;
    let attempts = 0, stalled = 0;
    while (true) {
      attempts++;
      const compiled = await warm.compile?.(active.abort.signal);
      check('compile');
      const preparation = compiled?.preparation;
      const pending = preparation?.pending ?? null;
      const incomplete = !!preparation && (preparation.status !== 'complete' || (preparation.pending ?? 0) !== 0);
      if (!incomplete) { active.trace.compile = { attempts, outcome: 'complete', pending: 0 }; return; }
      if (!(preparation.status === 'incomplete' && preparation.reason === 'budget')) {
        throw new Error(`Combat shaders could not be prepared (${preparation.status ?? 'unknown'}${preparation.reason ? `: ${preparation.reason}` : ''}).`);
      }
      const progressed = !previous || (previous.pending ?? Infinity) > (pending ?? Infinity);
      previous = preparation;
      stalled = progressed ? 0 : stalled + 1;
      if (stalled >= COMPILE_STALL_WINDOWS || now() - startedAt >= COMPILE_CEILING_MS) {
        const programs = Array.isArray(compiled?.pendingPrograms) ? compiled.pendingPrograms : undefined;
        active.trace.compile = { attempts, outcome: 'deferred', pending, ...(programs?.length ? { programs } : {}) };
        return;
      }
      load.battleLoad.progress(0.87, pending === null ? 'Compiling combat shaders' : `Compiling combat shaders (${pending} still linking)`);
      await load.nextFrame();
      check('compileRetry');
    }
  };

  /** The authority's WELCOME: the battle's lights, the viewer's vehicle, prediction. */
  const welcome = async (active: ActiveSortie, message: WelcomeMessage): Promise<void> => {
    const check = (detail: string): void => {
      if (active.abort.signal.aborted || current !== active) throw new SortieSupersededError(detail);
    };
    const battlePresentation = active.presentation!;
    if (!active.lit) {
      active.lit = true;
      activation.setGarageLighting(false);
      await warm.atmosphere?.({ meta: { weatherSeed: message.seed } });
      check('atmosphere');
      await warm.nightLighting?.();
      check('nightLighting');
      void Promise.resolve(warm.submitPrograms?.(active.abort.signal)).catch((error) => {
        if (!active.abort.signal.aborted) reportWarning('solo sim entry', `early program submission: ${messageOf(error)}`);
      });
    }
    await battlePresentation.rosterReady();
    check('roster');
    for (const actor of battlePresentation.actors.values()) actor.visual.setGroundSampler?.(scene.groundSampler);
    const own = battlePresentation.ownActor;
    if (!own) throw new Error('The player\'s vehicle is unavailable.');
    markStage(active, 'roster');
    active.welcomed = true;
    load.battleLoad.progress(0.84, 'Synchronizing battle');
  };

  /** The first frame with the roster in place: warm under the cover, take in the other seats, activate, reveal. */
  const activate = async (active: ActiveSortie): Promise<void> => {
    const battlePresentation = active.presentation!;
    const signal = active.abort.signal;
    const view: BrowserWarmView = { entities: battlePresentation.actors };
    const check = (detail: string): void => {
      if (signal.aborted || current !== active) throw new SortieSupersededError(detail);
    };
    try {
      try { warm.playerPanelPrograms?.(view, active.viewerId); } catch { /* the panel stage compiles them */ }
      markStage(active, 'atmosphere');
      load.battleLoad.progress(0.845, 'Warming suspension terrain');
      await warm.terrain?.(view);
      check('terrain');
      load.battleLoad.progress(0.85, 'Priming wreck variants');
      await warm.wrecks?.(view, signal);
      check('wrecks');
      markStage(active, 'terrainAndWrecks');
      load.battleLoad.progress(0.86, 'Compiling combat shaders');
      await load.nextFrame();
      check('compile');
      await prepareCombatShaders(active, check);
      markStage(active, 'compile');
      load.battleLoad.progress(0.87, 'Preparing player panel');
      await warm.playerPanel?.(view, active.viewerId);
      check('panel');
      load.battleLoad.progress(0.88, 'Priming combat effects');
      const fx = scene.getFx();
      // (262) paced as the page's solo deployment warm, its covered yield: a room's GPU pacing cost the merged 7v7 entry 8 s
      const openingStartedAt = now();
      const opening = await warm.openingEffects?.(fx, view, signal, { pacing: 'covered' });
      check('openingEffects');
      active.trace.openingEffects = { ms: Math.round(now() - openingStartedAt), ...(opening == null ? {} : { detail: opening }) };
      warm.shotCards?.([...battlePresentation.actors.values()].map((actor) => actor.specId));
      markStage(active, 'combatWarm');
      // the other seats, taken in under the cover after the viewer's warms (deferRoster), their programs warmed
      load.battleLoad.progress(0.885, 'Painting vehicles');
      const streamStartedAt = now();
      const streamed = await battlePresentation.streamRoster();
      check('streamedRoster');
      const buildMs = Math.round(now() - streamStartedAt);
      for (const actor of streamed) actor.visual.setGroundSampler?.(scene.groundSampler);
      if (streamed.length) {
        warm.shotCards?.(streamed.map((actor) => actor.specId));
        await warm.streamedVehicles?.({ entities: new Map(streamed.map((actor) => [actor.id, actor])) }, signal);
        check('streamedVehicles');
      }
      active.trace.streamedRoster = { actors: streamed.length, buildMs, ms: Math.round(now() - streamStartedAt) };
      markStage(active, 'streamedRoster');
      activation.activate({
        viewerId: active.viewerId,
        own: { id: active.viewerId, specId: active.sortie.specId },
        spectator: false,
        mapId: active.sortie.mapId,
        bridge: {
          setPerspective: (entityId) => {
            const actor = entityId ? battlePresentation.actors.get(String(entityId)) : null;
            if (actor) battlePresentation.setPerspective(actor.entityId);
          },
        },
        fx,
      });
      active.activated = true;
      markStage(active, 'activation');
      await warm.presentation?.(signal);
      check('openingGroundCover');
      await warm.finalShadows?.(signal);
      check('finalShadows');
      markStage(active, 'finalShadows');
      if (activation.runBlackWatchdog) {
        let blackCheck: unknown;
        try { blackCheck = await activation.runBlackWatchdog(signal); } catch (error) { blackCheck = { failed: true, error: messageOf(error) }; }
        active.trace.blackCheck = blackCheck;
        check('blackWatchdog');
        if (blackCheck && typeof blackCheck === 'object' && (blackCheck as { failed?: unknown }).failed === true) {
          throw new Error('Battle graphics could not be verified. Please retry from the Garage.');
        }
      }
      load.audio.loadingOn(false);
      load.audio.ambientOn(true);
      load.battleLoad.progress(1, 'Ready');
      await lifecycle.primeReveal();
      check('reveal');
      markStage(active, 'primeReveal');
      await load.battleLoad.hide();
      check('loaderFade');
      markStage(active, 'loaderFade');
      load.setAdaptiveSuspended(false);
      active.revealed = true;
      // the held count runs from the reveal (solo's 3 s, as the page's own count runs from its reveal)
      active.session?.releaseCountdown();
      active.trace.status = 'complete';
      active.trace.totalMs = Math.round(now() - active.trace.startedAt);
      load.recordTrace?.(active.trace);
      active.entry.resolve();
    } catch (error) {
      fail(active, error, active.activated ? 'reveal' : 'warm');
    }
  };

  const handleFrame = (active: ActiveSortie, frame: MatchFrame | null): void => {
    if (!frame || current !== active || !active.presentation) return;
    active.frames++;
    if (active.activating || !active.welcomed || active.failed || !active.presentation.ownActor) return;
    active.activating = true;
    void activate(active);
  };

  const begin = (sortie: SoloSimSortie): Promise<void> => {
    if (current) return Promise.reject(new Error('A sortie is already running.'));
    const player = sortie.seats.find((seat) => seat.isPlayer);
    if (!player) return Promise.reject(new Error('A sortie seats its player.'));
    const startedAt = now();
    let entry!: ActiveSortie['entry'];
    const settled = new Promise<void>((resolve, reject) => { entry = { resolve, reject }; });
    const active: ActiveSortie = {
      sortie, viewerId: player.playerId, abort: new AbortController(), port: null, presentation: null, session: null,
      controls: createControlSampler(() => active.presentation?.ownActor ?? null),
      welcomed: false, lit: false, activating: false, activated: false, revealed: false, failed: false, frames: 0,
      trace: { version: 1, map: sortie.mapId, mode: sortie.mode, seats: sortie.seats.length, stages: {}, startedAt, status: 'pending' },
      stageAt: startedAt, entry, unsubscribe: [],
    };
    current = active;
    held = false;
    hidden = ports.visibility?.hidden() ?? false;
    if (ports.visibility) {
      active.unsubscribe.push(ports.visibility.onChange(() => {
        hidden = ports.visibility!.hidden();
        if (current === active) applyHold(active);
      }));
    }
    const check = (detail: string): void => {
      if (active.abort.signal.aborted || current !== active) throw new SortieSupersededError(detail);
    };
    void (async () => {
      const terrainVariant = terrainVariantFor(sortie.mode);
      const battlefield: SoloSimWorld = { mapId: sortie.mapId, mode: sortie.mode, ...world };
      // the Worker builds its battlefield and the roster's anatomy beside the page's world (the Battle hover may have begun)
      let port: SoloSimPort<SoloSimToPage, PageToSoloSim>;
      try { port = ports.openWorker(battlefield); } catch (error) { throw stageError(error, 'boot'); }
      active.port = port;
      port.post({ type: 'prepare', world: battlefield, specIds: [...new Set(sortie.seats.map((seat) => seat.specId))] });
      load.setAdaptiveSuspended(true);
      scene.resetRoundState();
      roster.setCamoBiome(sortie.mapId);
      roster.emitBattleStart({ playerId: player.playerId, specId: sortie.specId, mapId: sortie.mapId });
      load.audio.resume();
      load.audio.loadingOn(true);
      const specIds = [...new Set(sortie.seats.map((seat) => seat.specId))];
      void Promise.resolve().then(() => load.audio.warmBattleEvents?.(specIds)).catch(() => {});
      load.lighting.setFarCascadeDormant(false);
      load.battleLoad.progress(0.02, 'Loading battlefield');
      await load.nextFrame();
      check('cover');
      await Promise.all([
        load.loadModules(),
        load.ensureBattleVisuals(),
        load.loadWorld(sortie.mapId, (fraction, label) => {
          if (current === active) load.battleLoad.progress(0.02 + fraction * 0.54, label);
        }, terrainVariant),
      ]);
      check('world');
      markStage(active, 'modulesAndWorld');
      // every seat's vehicle, built from here: the viewer's first (its roster waits on that one alone), then its side's and
      // the enemy's under the cover's warms; the presentation takes them in after those warms (deferRoster)
      const order = (seat: SoloSimSeat): number => (seat.isPlayer ? 0 : seat.team === player.team ? 1 : 2);
      const seats: RosterPrebuildSeat[] = [...sortie.seats].sort((a, b) => order(a) - order(b)).map((seat) => ({
        playerId: seat.playerId, specId: seat.specId, camo: sortie.camoFor(seat.playerId, seat.specId), isViewer: seat.isPlayer,
      }));
      let prebuilt: RosterPrebuild | null = null;
      try { prebuilt = load.prebuildRoster?.(seats, active.abort.signal) ?? null; } catch { prebuilt = null; }
      const camoOf = new Map(seats.map((seat) => [seat.playerId, seat.camo]));
      const battlePresentation = (ports.createPresentation ?? createBattlePresentation)({
        engineCtx: scene.engineCtx,
        game: scene.game,
        bus: scene.bus,
        worldCollision: scene.getWorldCollision(),
        ...(scene.clearVehicleDecals ? { clearVehicleDecals: scene.clearVehicleDecals } : {}),
        ...(scene.onVisualReady ? { onVisualReady: scene.onVisualReady } : {}),
        camoFor: (entry) => camoOf.get(entry.playerId) ?? 'factory',
        prebuilt,
        deferRoster: true,
        solo: true,
        onRosterProgress: (fraction, specId) => {
          if (current === active) load.battleLoad.progress(0.56 + fraction * 0.27, `Painting ${roster.vehicleName(specId)}`);
        },
      });
      active.presentation = battlePresentation;
      // a world laid out otherwise than the authority's manifest (the mobile tier, the trench works) reads the destroyed
      // list through the manifest's identities; never awaited
      if (!battlePresentation.sharesAuthorityIndices && load.loadAuthorityObstacles) {
        void Promise.resolve().then(() => load.loadAuthorityObstacles!(sortie.mapId, active.abort.signal, terrainVariant)).then((identity) => {
          if (current === active) battlePresentation.setAuthorityObstacles(identity);
        }).catch((error) => {
          if (!active.abort.signal.aborted) reportWarning('solo sim authority obstacles', messageOf(error));
        });
      }
      load.battleLoad.progress(0.56, 'Seating the battle');
      const boot: SoloSimBoot = {
        ...battlefield, seed: sortie.seed, seats: sortie.seats, countdownS: sortie.countdownS,
        ...(sortie.arrangement !== undefined ? { arrangement: sortie.arrangement } : {}),
      };
      const presentationPorts = {
        adapter: battlePresentation,
        controls: active.controls.sample,
        prediction: null as Parameters<typeof createSoloSimSession>[0]['presentation']['prediction'],
        onWelcome: async (message: WelcomeMessage) => {
          try {
            await welcome(active, message);
            // (the session enables the client's prediction from this once the welcome is through)
            const predictionWorld = battlePresentation.predictionWorld();
            const own = battlePresentation.ownActor;
            if (predictionWorld && own) {
              presentationPorts.prediction = { world: predictionWorld, specFor: (specId: string) => (specId === own.specId ? own.spec : getSpec(specId)) };
            }
          } catch (error) {
            fail(active, error, 'roster');
          }
        },
      };
      active.port = null;
      active.session = createSoloSimSession({
        port, boot, clientBuild, clock: now,
        presentation: presentationPorts,
        onFailed: (error) => fail(active, new Error(`The battle's simulation could not start: ${error}`), 'boot'),
        onError: (error) => reportWarning('solo sim', error),
      });
      // the Worker's link lost short of a verdict: a live battle ends without a record (the end screen offers the Garage);
      // an entry fails (the page takes a battle the Worker never seated). A verdict's own close finds the result set.
      active.unsubscribe.push(active.session.client.onPhase((phase, detail) => {
        if ((phase !== 'closed' && phase !== 'failed') || current !== active) return;
        if (active.revealed) { battlePresentation.endDisconnected(); return; }
        fail(active, new Error(`The battle's simulation stopped: ${detail || phase}`), active.welcomed ? 'connect' : 'boot');
      }));
      if (held || hidden) applyHold(active);
      void active.session.ready.then((ready) => {
        active.trace.boot = ready;
        markStage(active, 'boot');
      }, () => { /* onFailed reports it */ });
    })().catch((error) => fail(active, error, (error as { soloSimStage?: string }).soloSimStage ?? (active.presentation ? 'roster' : 'world')));
    return settled;
  };

  return {
    begin,
    get active() { return current !== null; },
    get inMatch() { return !!current?.activated; },
    pump(dtSeconds, nowMs) {
      const active = current;
      if (!active?.session) return;
      handleFrame(active, active.session.update(nowMs, Math.max(0, Math.min(0.25, dtSeconds))));
    },
    setPaused(next) {
      const active = current;
      if (!active?.session) return false;
      held = next;
      applyHold(active);
      return true;
    },
    queueConsumable(slot) { current?.controls.queueConsumable(slot); },
    queueAction(action) { current?.controls.queueAction(action); },
    disposePresentation() {
      const active = current;
      if (!active) return;
      if (!active.revealed && !active.failed) fail(active, new SortieSupersededError('returned_to_garage'), 'abandoned');
      else release(active);
    },
    stats() {
      const active = current;
      return active ? {
        active: true, inMatch: active.activated, revealed: active.revealed, frames: active.frames,
        actors: active.presentation?.actors.size ?? 0, paused: held || hidden,
      } : null;
    },
  };
}
