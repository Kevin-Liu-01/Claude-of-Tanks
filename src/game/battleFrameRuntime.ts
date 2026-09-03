import type { PlayerFrameInput, PlayerFrameSample } from './playerFrameInput.ts';
import type { GameState } from './stateCore.ts';

export interface BattlePauseInfo {
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
  show(seconds: number): void;
  rollout(): void;
}

interface BattleFramePresentationPort {
  captureSoloPose(): void;
  update(dtSeconds: number, alpha: number): void;
  updateResult(): void;
}

export interface BattleFrameRuntimeOptions {
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

  const resetSimulationAccumulator = (): void => {
    simulationAccumulator = 0;
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
    if (game.preBattleS === Infinity) return;
    const heldSeconds = game.preBattleS;
    game.preBattleS = countdown.advance(
      game.preBattleS,
      wallDtSeconds,
      countdown.isWarmPending(),
    );
    countdown.show(game.preBattleS);
    if (heldSeconds > 0 && game.preBattleS === 0) countdown.rollout();
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

    if (inBattle && !paused && !killcamActive) {
      advanceLiveBattle(appliedDtSeconds, wallDtSeconds, networkActive);
    }
    const presentationAlpha = updatePresentation(
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
