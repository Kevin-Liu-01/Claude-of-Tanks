export type BattleResult = 'victory' | 'defeat' | 'draw' | string;

interface ResultPlayer {
  combat?: { destroyed?: boolean } | null;
}

interface ResultGame {
  result?: BattleResult | null;
  timeS: number;
  player?: ResultPlayer | null;
}

interface ResultKillcam {
  lastBeginWallMs?: number | null;
  playForResult(
    result: BattleResult,
    timeS: number,
    onDone: () => void,
    options?: { freshKill: boolean },
  ): boolean;
}

interface ResultCameraRig {
  release(): void;
  startDeathCam?(): void;
}

export interface BattleResultFlowReceipt {
  played: boolean;
  result: BattleResult;
  timeS: number;
  resultWallMs: number;
  kcBeginWallMs: number | null;
}

export interface BattleResultPresentationOptions {
  game: ResultGame;
  killcam: ResultKillcam;
  rig: ResultCameraRig;
  veilHud(veiled: boolean): void;
  showEndOverlay(result: BattleResult): void;
  emitPresented(result: BattleResult): void;
  exitPointerLock(): void;
  recordFlow(receipt: BattleResultFlowReceipt): void;
  now?: () => number;
  deathBeatMs?: number;
}

export interface BattleResultPresentationSnapshot {
  endShown: boolean;
  deathCamShown: boolean;
  pendingDeadlineMs: number | null;
}

export interface BattleResultPresentationRuntime {
  update(): void;
  reset(): void;
  clearPending(): void;
  snapshot(): BattleResultPresentationSnapshot;
}

interface PendingReplay {
  deadline: number;
  fire(): void;
}

const DEFAULT_DEATH_BEAT_MS = 2600;

/**
 * Own the result/replay presentation state machine independently from the
 * fixed-step and render loop. The owner deliberately uses wall time only for
 * the cinematic death beat; gameplay state remains simulation-authored.
 */
export function createBattleResultPresentationRuntime({
  game,
  killcam,
  rig,
  veilHud,
  showEndOverlay,
  emitPresented,
  exitPointerLock,
  recordFlow,
  now = () => performance.now(),
  deathBeatMs = DEFAULT_DEATH_BEAT_MS,
}: BattleResultPresentationOptions): BattleResultPresentationRuntime {
  const required = [killcam?.playForResult, rig?.release, veilHud,
    showEndOverlay, emitPresented, exitPointerLock, recordFlow, now];
  if (required.some((entry) => typeof entry !== 'function')) {
    throw new TypeError('battle result presentation requires every lifecycle port');
  }
  if (!Number.isFinite(deathBeatMs) || deathBeatMs < 0) {
    throw new TypeError('deathBeatMs must be a non-negative finite number');
  }

  let endShown = false;
  let deathCamShown = false;
  let pending: PendingReplay | null = null;

  const record = (played: boolean, result: BattleResult): void => {
    recordFlow({
      played,
      result,
      timeS: game.timeS,
      resultWallMs: now(),
      kcBeginWallMs: killcam.lastBeginWallMs ?? null,
    });
  };

  const presentResult = (result: BattleResult): void => {
    veilHud(false);
    showEndOverlay(result);
    emitPresented(result);
    rig.release();
    if (result === 'defeat') rig.startDeathCam?.();
  };

  const armResultReplay = (result: BattleResult): void => {
    const played = killcam.playForResult(
      result,
      game.timeS,
      () => presentResult(result),
    );
    record(played, result);
    if (played) veilHud(true);
    else presentResult(result);
  };

  const update = (): void => {
    const result = game.result ?? null;
    if (result && !endShown) {
      endShown = true;
      exitPointerLock();
      if (pending) {
        // A player-death beat was already armed. Preserve its original
        // deadline but redirect its completion into the final verdict flow.
        pending.fire = () => armResultReplay(result);
      } else {
        const freshKill = !deathCamShown && !!game.player?.combat?.destroyed;
        const played = !deathCamShown && killcam.playForResult(
          result,
          game.timeS,
          () => presentResult(result),
          { freshKill },
        );
        record(played, result);
        if (played) veilHud(true);
        else presentResult(result);
      }
    } else if (!result) {
      endShown = false;
    }

    if (!result && game.player?.combat?.destroyed && !deathCamShown) {
      deathCamShown = true;
      rig.startDeathCam?.();
      const afterDeath = (): void => {
        veilHud(false);
        rig.release();
        rig.startDeathCam?.();
      };
      pending = {
        deadline: now() + deathBeatMs,
        fire: () => {
          // Releasing pointer lock may itself cost a browser frame. Do it at
          // the covered replay boundary, never on the live destruction frame.
          exitPointerLock();
          if (killcam.playForResult('defeat', game.timeS, afterDeath)) veilHud(true);
          else afterDeath();
        },
      };
    }

    if (pending && now() >= pending.deadline) {
      const fire = pending.fire;
      pending = null;
      fire();
    }
  };

  return {
    update,
    reset() {
      endShown = false;
      deathCamShown = false;
      pending = null;
    },
    clearPending() {
      pending = null;
    },
    snapshot() {
      return {
        endShown,
        deathCamShown,
        pendingDeadlineMs: pending?.deadline ?? null,
      };
    },
  };
}
