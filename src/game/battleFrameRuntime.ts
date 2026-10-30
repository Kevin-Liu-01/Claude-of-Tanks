import type { PlayerFrameInput, PlayerFrameSample } from './playerFrameInput.ts';
import type { GameState } from './stateCore.ts';
import { FRAME_STAGE, frameStages } from './stateCore.ts';

interface BattlePauseInfo {
  paused: boolean;
  resumes: number;
  lastDtR: number;
  lastResumeDtR: number;
}

export interface BattleFrameReceipt {
  dtSeconds: number;
  inBattle: boolean;
  paused: boolean;
  killcamActive: boolean;
  livePaused: boolean;
  presentationAlpha: number;
}

interface BattleFrameSettingsPort {
  isOpen(): boolean;
}

interface BattleFrameKillcamPort {
  isActive(): boolean;
}

interface BattleFrameNetworkPort {
  isActive(): boolean;
  pump(dtSeconds: number, nowMs: number): void;
}

interface BattleFrameCountdownPort {
  isWarmPending(): boolean;
  advance(seconds: number, wallDtSeconds: number, warmPending: boolean): number;
  show(seconds: number, warmPending?: boolean): void;
  /**
   * The battle rolls out: once a battle. `late` when this client never saw the count run (a network battle joined
   * after its countdown: a late join, a rejoin, a host migration), so the rollout's cues stay silent.
   */
  rollout(late?: boolean): void;
  /** A whole second of the running count begins (presentation only; never while PREPARING holds the count). */
  second?(seconds: number): void;
}

/**
 * The local Worker driver (game/localSimDriver.ts, ?localDriver=worker): a local battle whose core steps in a Worker. The
 * page posts the player's input as it samples it, applies the ticks that arrived and draws the newest, smoothed by at
 * most one tick; it steps nothing itself.
 */
interface BattleFrameLocalSimPort {
  isActive(): boolean;
  postInput(): void;
  /** Applies every tick that arrived (`onTick` after each) and returns the draw's alpha. */
  advance(onTick: () => void): number;
  /** The battle does not run this frame. */
  hold(): void;
}

interface BattleFramePresentationPort {
  captureSoloPose(): void;
  update(dtSeconds: number, alpha: number): void;
  updateResult(): void;
}

interface BattleFrameRuntimeOptions {
  game: GameState;
  settings: BattleFrameSettingsPort;
  killcam: BattleFrameKillcamPort;
  input: PlayerFrameInput;
  network: BattleFrameNetworkPort;
  countdown: BattleFrameCountdownPort;
  presentation: BattleFramePresentationPort;
  localSim?: BattleFrameLocalSimPort | null;
  getRigMode(): string;
  stepSimulation(): void;
  emitPause(paused: boolean): void;
  simulationDt?: number;
  maxSimulationSteps?: number;
}

export interface BattleFrameRuntime {
  readonly pauseInfo: BattlePauseInfo;
  readonly receipt: BattleFrameReceipt;
  advance(
    dtSeconds: number,
    wallDtSeconds: number,
    nowMs: number,
    cameraLocked: boolean,
  ): BattleFrameReceipt;
  resetSimulationAccumulator(): void;
  /**
   * The local Worker driver: a key or a button changed between frames, so the tank's controls are sampled and posted
   * now (with the last frame's battle flags), not at the next frame.
   */
  postInputNow(): void;
}

/**
 * Owns rendered-frame advancement of gameplay truth. It retains its input
 * sample and return receipt, keeping the hot path allocation-neutral while
 * concentrating pause edges, fixed-step debt, countdown release, network
 * cadence, result progression, and presentation interpolation in one module.
 */
export function createBattleFrameRuntime({
  game,
  settings,
  killcam,
  input,
  network,
  countdown,
  presentation,
  localSim = null,
  getRigMode,
  stepSimulation,
  emitPause,
  simulationDt = 1 / 60,
  maxSimulationSteps = 4,
}: BattleFrameRuntimeOptions): BattleFrameRuntime {
  const required = [settings?.isOpen, killcam?.isActive, input?.poll,
    network?.isActive, network?.pump, countdown?.isWarmPending,
    countdown?.advance, countdown?.show, countdown?.rollout,
    presentation?.captureSoloPose, presentation?.update,
    presentation?.updateResult, getRigMode, stepSimulation, emitPause];
  if (required.some((entry) => typeof entry !== 'function')) {
    throw new TypeError('battle frame runtime requires every frame port');
  }
  if (!Number.isFinite(simulationDt) || simulationDt <= 0) {
    throw new TypeError('simulationDt must be a positive finite number');
  }
  if (!Number.isInteger(maxSimulationSteps) || maxSimulationSteps <= 0) {
    throw new TypeError('maxSimulationSteps must be a positive integer');
  }

  let simulationAccumulator = 0;
  let networkBattleOwned = false;
  // the local Worker driver's draw alpha this frame (time since its newest tick, at most one tick)
  let localSimAlpha = 1;
  const captureLocalTick = (): void => {
    frameStages?.stage(FRAME_STAGE.pose);
    presentation.captureSoloPose();
  };
  // The countdown's presentation edges, once a battle: the rollout, whether a running count was seen, the last whole
  // second reported (the count only falls, so 3, 2, 1 are each reported once even across a PREPARING hold).
  let rolledOut = false;
  let countSeen = false;
  let lastWholeSecond = Infinity;
  const pauseInfo: BattlePauseInfo = {
    paused: false,
    resumes: 0,
    lastDtR: 0,
    lastResumeDtR: -1,
  };
  const receipt: BattleFrameReceipt = {
    dtSeconds: 0,
    inBattle: false,
    paused: false,
    killcamActive: false,
    livePaused: false,
    presentationAlpha: 0,
  };
  const inputSample: PlayerFrameSample = {
    dtSeconds: 0,
    inBattle: false,
    paused: false,
    killcamActive: false,
    cameraLocked: false,
    rigMode: 'ARCADE',
    player: null,
  };

  const resetCountdownEdges = (): void => {
    rolledOut = false;
    countSeen = false;
    lastWholeSecond = Infinity;
  };

  const resetSimulationAccumulator = (): void => {
    simulationAccumulator = 0;
    networkBattleOwned = false;
    resetCountdownEdges();
  };

  const rollout = (late: boolean): void => {
    rolledOut = true;
    countdown.rollout(late);
  };

  const reportSecond = (seconds: number, warmPending: boolean): void => {
    if (warmPending || !(seconds > 0) || !Number.isFinite(seconds)) return;
    countSeen = true;
    const whole = Math.ceil(seconds);
    if (whole >= lastWholeSecond) return;
    lastWholeSecond = whole;
    countdown.second?.(whole);
  };

  // hot-path: every battle frame
  const applyPauseEdge = (livePaused: boolean, dtSeconds: number): number => {
    let appliedDtSeconds = dtSeconds;
    if (livePaused === pauseInfo.paused) return appliedDtSeconds;
    pauseInfo.paused = livePaused;
    if (!livePaused) {
      appliedDtSeconds = Math.min(appliedDtSeconds, simulationDt);
      pauseInfo.resumes += 1;
      pauseInfo.lastResumeDtR = appliedDtSeconds;
    }
    emitPause(livePaused);
    return appliedDtSeconds;
  };

  // hot-path: every battle frame
  const pollFrameInput = (
    appliedDtSeconds: number,
    inBattle: boolean,
    paused: boolean,
    killcamActive: boolean,
    cameraLocked: boolean,
  ): void => {
    inputSample.dtSeconds = appliedDtSeconds;
    inputSample.inBattle = inBattle;
    inputSample.paused = paused;
    inputSample.killcamActive = killcamActive;
    inputSample.cameraLocked = cameraLocked;
    inputSample.rigMode = getRigMode();
    inputSample.player = game.player as PlayerFrameSample['player'];
    input.poll(inputSample);
    // the local Worker driver: the input leaves the moment it is sampled
    if (inBattle && localSim?.isActive()) localSim.postInput();
  };

  // hot-path: every countdown frame
  const advanceCountdown = (wallDtSeconds: number): void => {
    // armed, not yet opened: a new battle's count
    if (game.preBattleS === Infinity) { resetCountdownEdges(); return; }
    const heldSeconds = game.preBattleS;
    const warmPending = countdown.isWarmPending();
    game.preBattleS = countdown.advance(
      game.preBattleS,
      wallDtSeconds,
      warmPending,
    );
    // Countdown 2026-09-14 (owner: "seems to stall at 3"): the presentation is told when the
    // count is held for warm work, so it shows PREPARING instead of a frozen numeral.
    countdown.show(game.preBattleS, warmPending);
    reportSecond(game.preBattleS, warmPending);
    if (heldSeconds > 0 && game.preBattleS === 0) rollout(false);
  };

  /**
   * A network battle's count arrives in snapshots (the authority's countdown phase; 0 once it plays). Its fall to 0
   * rolls the battle out; a battle first seen already at 0 was joined after its count and rolls out late. Infinity is a
   * round armed before its first snapshot.
   */
  // hot-path: every networked countdown frame
  const followNetworkCountdown = (): void => {
    const seconds = game.preBattleS;
    if (seconds === Infinity) { resetCountdownEdges(); return; }
    if (!Number.isFinite(seconds)) return;
    if (seconds > 0) { reportSecond(seconds, false); return; }
    if (!rolledOut) rollout(!countSeen);
  };

  // hot-path: every local battle frame (the local driver: the core steps here, in the frame that renders it)
  const advanceLocalSimulation = (appliedDtSeconds: number): void => {
    simulationAccumulator = Math.min(
      simulationAccumulator + appliedDtSeconds,
      simulationDt * maxSimulationSteps,
    );
    while (simulationAccumulator >= simulationDt) {
      stepSimulation();
      frameStages?.stage(FRAME_STAGE.pose);
      presentation.captureSoloPose();
      simulationAccumulator -= simulationDt;
    }
  };

  // hot-path: every battle frame
  const advanceLiveBattle = (
    appliedDtSeconds: number,
    wallDtSeconds: number,
    networkActive: boolean,
  ): void => {
    if (networkActive) {
      countdown.show(game.preBattleS);
      followNetworkCountdown();
      simulationAccumulator = 0;
    } else if (game.preBattleS > 0) {
      frameStages?.stage(FRAME_STAGE.countdown);
      advanceCountdown(wallDtSeconds);
      simulationAccumulator = 0;
      localSim?.hold();
    } else if (localSim?.isActive()) {
      simulationAccumulator = 0;
      localSimAlpha = localSim.advance(captureLocalTick);
    } else {
      advanceLocalSimulation(appliedDtSeconds);
    }
    frameStages?.stage(FRAME_STAGE.pose);
    presentation.updateResult();
  };

  // hot-path: every battle frame
  const updatePresentation = (
    appliedDtSeconds: number,
    networkActive: boolean,
    killcamActive: boolean,
    livePaused: boolean,
  ): number => {
    const alpha = networkActive ? 1 : localSim?.isActive() ? localSimAlpha : simulationAccumulator / simulationDt;
    frameStages?.stage(FRAME_STAGE.presentation);
    if (!killcamActive && !livePaused) presentation.update(appliedDtSeconds, alpha);
    return alpha;
  };

  // hot-path: every frame
  const writeReceipt = (
    appliedDtSeconds: number,
    inBattle: boolean,
    paused: boolean,
    killcamActive: boolean,
    livePaused: boolean,
    presentationAlpha: number,
  ): BattleFrameReceipt => {
    receipt.dtSeconds = appliedDtSeconds;
    receipt.inBattle = inBattle;
    receipt.paused = paused;
    receipt.killcamActive = killcamActive;
    receipt.livePaused = livePaused;
    receipt.presentationAlpha = presentationAlpha;
    return receipt;
  };

  // hot-path: every frame (the battle frame owner)
  const advance = (
    dtSeconds: number,
    wallDtSeconds: number,
    nowMs: number,
    cameraLocked: boolean,
  ): BattleFrameReceipt => {
    const inBattle = game.phase === 'battle';
    if (!inBattle) { networkBattleOwned = false; resetCountdownEdges(); }
    // Transport teardown is synchronous; restoring the Garage is not. A
    // retired network battlefield never becomes a solo simulation in between.
    if (inBattle && network.isActive()) networkBattleOwned = true;
    const paused = settings.isOpen();
    const killcamActive = killcam.isActive();
    const livePaused = paused && inBattle && !killcamActive && !game.result;
    const appliedDtSeconds = applyPauseEdge(livePaused, dtSeconds);
    pauseInfo.lastDtR = appliedDtSeconds;
    frameStages?.stage(FRAME_STAGE.input);
    pollFrameInput(appliedDtSeconds, inBattle, paused, killcamActive, cameraLocked);

    // A persistent Garage room is pumped before the event-paced early return
    // in main. Every other phase reaches this owner and pumps exactly once.
    frameStages?.stage(FRAME_STAGE.network);
    if (game.phase !== 'garage') network.pump(appliedDtSeconds, nowMs);
    const networkActive = network.isActive();
    if (inBattle && networkActive) networkBattleOwned = true;
    const retiringNetworkBattle = networkBattleOwned && !networkActive;

    if (inBattle && !paused && !killcamActive && !retiringNetworkBattle) {
      advanceLiveBattle(appliedDtSeconds, wallDtSeconds, networkActive);
    } else {
      localSim?.hold();
    }
    const presentationAlpha = retiringNetworkBattle ? 1 : updatePresentation(
      appliedDtSeconds, networkActive, killcamActive, livePaused,
    );
    return writeReceipt(
      appliedDtSeconds,
      inBattle,
      paused,
      killcamActive,
      livePaused,
      presentationAlpha,
    );
  };

  const postInputNow = (): void => {
    if (!localSim?.isActive() || !inputSample.inBattle || inputSample.paused || inputSample.killcamActive) return;
    inputSample.player = game.player as PlayerFrameSample['player'];
    input.sampleTank?.(inputSample);
    localSim.postInput();
  };

  return {
    pauseInfo,
    receipt,
    advance,
    resetSimulationAccumulator,
    postInputNow,
  };
}
