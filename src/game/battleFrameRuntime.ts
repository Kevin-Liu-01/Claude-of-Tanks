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
    let appliedDtSeconds = dtSeconds;

    if (livePaused !== pauseInfo.paused) {
      pauseInfo.paused = livePaused;
      if (!livePaused) {
        // Never replay the wall-clock pause as four simulation steps. One
        // fixed step is the most the first resumed frame may integrate.
        appliedDtSeconds = Math.min(appliedDtSeconds, simulationDt);
        pauseInfo.resumes += 1;
        pauseInfo.lastResumeDtR = appliedDtSeconds;
      }
      emitPause(livePaused);
    }
    pauseInfo.lastDtR = appliedDtSeconds;

    inputSample.dtSeconds = appliedDtSeconds;
    inputSample.inBattle = inBattle;
    inputSample.paused = paused;
    inputSample.killcamActive = killcamActive;
    inputSample.cameraLocked = cameraLocked;
    inputSample.rigMode = getRigMode();
    inputSample.player = game.player as PlayerFrameSample['player'];
    input.poll(inputSample);

    // A persistent Garage room is pumped before the event-paced early return
    // in main. Every other phase reaches this owner and pumps exactly once.
    if (game.phase !== 'garage') network.pump(appliedDtSeconds, nowMs);

    if (inBattle && !paused && !killcamActive) {
      if (network.isActive()) {
        countdown.show(game.preBattleS);
        simulationAccumulator = 0;
      } else if (game.preBattleS > 0) {
        if (game.preBattleS !== Infinity) {
          const heldSeconds = game.preBattleS;
          game.preBattleS = countdown.advance(
            game.preBattleS,
            wallDtSeconds,
            countdown.isWarmPending(),
          );
          countdown.show(game.preBattleS);
          if (heldSeconds > 0 && game.preBattleS === 0) countdown.rollout();
        }
        simulationAccumulator = 0;
      } else {
        simulationAccumulator = Math.min(
          simulationAccumulator + appliedDtSeconds,
          simulationDt * maxSimulationSteps,
        );
        while (simulationAccumulator >= simulationDt) {
          stepSimulation();
          presentation.captureSoloPose();
          simulationAccumulator -= simulationDt;
        }
      }
      presentation.updateResult();
    }

    const presentationAlpha = network.isActive()
      ? 1
      : simulationAccumulator / simulationDt;
    if (!killcamActive && !livePaused) {
      presentation.update(appliedDtSeconds, presentationAlpha);
    }

    receipt.dtSeconds = appliedDtSeconds;
    receipt.inBattle = inBattle;
    receipt.paused = paused;
    receipt.killcamActive = killcamActive;
    receipt.livePaused = livePaused;
    receipt.presentationAlpha = presentationAlpha;
    return receipt;
  };

  return {
    pauseInfo,
    receipt,
    advance,
    resetSimulationAccumulator,
  };
}
