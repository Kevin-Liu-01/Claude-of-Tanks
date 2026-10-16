import type { PlayerFrameInput, PlayerFrameSample } from './playerFrameInput.ts';
import type { GameState } from './stateCore.ts';

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
  };

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
  const followNetworkCountdown = (): void => {
    const seconds = game.preBattleS;
    if (seconds === Infinity) { resetCountdownEdges(); return; }
    if (!Number.isFinite(seconds)) return;
    if (seconds > 0) { reportSecond(seconds, false); return; }
    if (!rolledOut) rollout(!countSeen);
  };

  const advanceSoloSimulation = (appliedDtSeconds: number): void => {
    simulationAccumulator = Math.min(
      simulationAccumulator + appliedDtSeconds,
      simulationDt * maxSimulationSteps,
    );
    while (simulationAccumulator >= simulationDt) {
      stepSimulation();
      presentation.captureSoloPose();
      simulationAccumulator -= simulationDt;
    }
  };

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
      advanceCountdown(wallDtSeconds);
      simulationAccumulator = 0;
    } else {
      advanceSoloSimulation(appliedDtSeconds);
    }
    presentation.updateResult();
  };

  const updatePresentation = (
    appliedDtSeconds: number,
    networkActive: boolean,
    killcamActive: boolean,
    livePaused: boolean,
  ): number => {
    const alpha = networkActive ? 1 : simulationAccumulator / simulationDt;
    if (!killcamActive && !livePaused) presentation.update(appliedDtSeconds, alpha);
    return alpha;
  };

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
    pollFrameInput(appliedDtSeconds, inBattle, paused, killcamActive, cameraLocked);

    // A persistent Garage room is pumped before the event-paced early return
    // in main. Every other phase reaches this owner and pumps exactly once.
    if (game.phase !== 'garage') network.pump(appliedDtSeconds, nowMs);
    const networkActive = network.isActive();
    if (inBattle && networkActive) networkBattleOwned = true;
    const retiringNetworkBattle = networkBattleOwned && !networkActive;

    if (inBattle && !paused && !killcamActive && !retiringNetworkBattle) {
      advanceLiveBattle(appliedDtSeconds, wallDtSeconds, networkActive);
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

  return {
    pauseInfo,
    receipt,
    advance,
    resetSimulationAccumulator,
  };
}
