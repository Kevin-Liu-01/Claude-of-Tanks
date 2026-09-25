import {
  createBattleEndingDirector, resolveCameraBeat,
  type BattleEndingDirector, type BattleEndingPlan, type BattleEndingBeat,
} from './battleEnding.ts';
import type { ObjectiveStateView } from '../ui/minimapObjectives.ts';

export type BattleResult = 'victory' | 'defeat' | 'draw';

interface ResultPlayer {
  combat?: { destroyed?: boolean } | null;
  state?: { pos?: { x: number; y: number; z: number } | null } | null;
}

interface ResultGame {
  result?: BattleResult | null;
  resultReason?: string | null;
  gameMode?: string | null;
  timeS: number;
  player?: ResultPlayer | null;
  /** The live match ruleset; a non-null respawn timer means a destroyed player comes back at spawn. */
  ruleset?: { respawnS?: number | null } | null;
}

interface ResultKillcam {
  lastBeginWallMs?: number | null;
  playForResult(
    result: BattleResult,
    timeS: number,
    onDone: () => void,
    options?: { freshKill?: boolean; finalKill?: boolean; ownDeath?: boolean },
  ): boolean;
}

interface ResultCameraRig {
  release(): void;
  startDeathCam?(): void;
}

/** The browser camera twin of the director (battleEndingCamera.ts); a receipt supplies a fake. */
interface EndingCameraPort {
  begin(plan: BattleEndingPlan, onSkip: () => void): boolean;
  frame(u: number): void;
  end(): void;
}

interface EndingPorts {
  camera: EndingCameraPort;
  /** The live mode presentation state (game.matchModeState) for the deciding objective. */
  modeState(): ObjectiveStateView | null;
  /** Bus seam: 'ending:begin' / 'ending:done' (report gate, HUD clock flash and caption, settings). */
  emitBeat(phase: 'begin' | 'done', plan: BattleEndingPlan): void;
  director?: BattleEndingDirector;
}

interface BattleResultFlowReceipt {
  played: boolean;
  result: BattleResult;
  timeS: number;
  resultWallMs: number;
  kcBeginWallMs: number | null;
  /** The director's beat for this verdict and what actually ran (replay / camera beat / none). */
  beat: BattleEndingBeat;
  ran: BattleEndingBeat | 'replay';
}

interface BattleResultPresentationOptions {
  game: ResultGame;
  killcam: ResultKillcam;
  rig: ResultCameraRig;
  veilHud(veiled: boolean): void;
  showEndOverlay(result: BattleResult): void;
  emitPresented(result: BattleResult): void;
  exitPointerLock(): void;
  recordFlow(receipt: BattleResultFlowReceipt): void;
  /** Battle endings (2026-09-25): the camera beats; absent, every verdict without a replay presents at once. */
  ending?: EndingPorts | null;
  now?: () => number;
  deathBeatMs?: number;
}

interface BattleResultPresentationSnapshot {
  endShown: boolean;
  deathCamShown: boolean;
  pendingDeadlineMs: number | null;
  /** The camera beat on screen, or null. */
  beat: BattleEndingBeat | null;
}

interface BattleResultPresentationRuntime {
  update(): void;
  reset(): void;
  clearPending(): void;
  /** Feed the director the bus facts it reads (mode:* events, tank:destroyed). */
  observe(type: string, payload: unknown): void;
  snapshot(): BattleResultPresentationSnapshot;
}

interface PendingReplay {
  deadline: number;
  fire(): void;
}

interface RunningBeat {
  plan: BattleEndingPlan;
  result: BattleResult;
}

const DEFAULT_DEATH_BEAT_MS = 2600;

/**
 * Own the result/replay presentation state machine independently from the
 * fixed-step and render loop. The owner deliberately uses wall time only for
 * the cinematic death beat and the ending beats; gameplay state remains
 * simulation-authored. Battle endings (owner 2026-09-25): every verdict asks
 * the director (battleEnding.ts) for its beat — the final-kill replay through
 * the killcam, or a camera beat (time's up, objective orbit, wreck orbit,
 * pull-back) through the ending camera — before the report is presented.
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
  ending = null,
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
  if (ending && [ending.camera?.begin, ending.camera?.frame, ending.camera?.end, ending.modeState, ending.emitBeat]
    .some((entry) => typeof entry !== 'function')) {
    throw new TypeError('battle ending presentation requires the camera, mode-state and beat ports');
  }

  const director = ending?.director ?? createBattleEndingDirector();
  let endShown = false;
  let deathCamShown = false;
  let pending: PendingReplay | null = null;
  let beat: RunningBeat | null = null;

  const record = (played: boolean, result: BattleResult, plan: BattleEndingPlan, ran: BattleEndingBeat | 'replay'): void => {
    recordFlow({
      played,
      result,
      timeS: game.timeS,
      resultWallMs: now(),
      kcBeginWallMs: killcam.lastBeginWallMs ?? null,
      beat: plan.beat,
      ran,
    });
  };

  const presentResult = (result: BattleResult): void => {
    veilHud(false);
    showEndOverlay(result);
    emitPresented(result);
    rig.release();
    if (result === 'defeat') rig.startDeathCam?.();
  };

  const verdictFor = (result: BattleResult) => {
    const pos = game.player?.state?.pos ?? null;
    return {
      result,
      reason: game.resultReason ?? null,
      mode: game.gameMode ?? null,
      playerDestroyed: !!game.player?.combat?.destroyed,
      player: pos && Number.isFinite(pos.x) && Number.isFinite(pos.z) ? { x: pos.x, z: pos.z, y: pos.y } : null,
    };
  };

  const finishBeat = (): void => {
    if (!beat) return;
    const { plan, result } = beat;
    beat = null;
    ending?.camera.end();
    director.end();
    presentResult(result);
    ending?.emitBeat('done', plan);
  };

  const cancelBeat = (): void => {
    if (!beat) return;
    const { plan } = beat;
    beat = null;
    ending?.camera.end();
    director.end();
    ending?.emitBeat('done', plan);
  };

  /** No replay ran: the director's camera beat, or the report at once. */
  const startCameraBeat = (plan: BattleEndingPlan, result: BattleResult): BattleEndingBeat => {
    const resolved = resolveCameraBeat(plan, false);
    if (resolved.beat === 'none' || resolved.beat === 'replay' || !ending) {
      presentResult(result);
      return 'none';
    }
    const cameraPlan: BattleEndingPlan = { ...plan, beat: resolved.beat, durationS: resolved.durationS };
    if (!ending.camera.begin(cameraPlan, () => director.skip())) {
      presentResult(result);
      return 'none';
    }
    director.begin(cameraPlan, now());
    beat = { plan: cameraPlan, result };
    ending.emitBeat('begin', cameraPlan);
    return resolved.beat;
  };

  /**
   * The verdict flow: ask the director, let the killcam take the replay beats (the player's own death, the
   * final kill whoever fired it), otherwise run the camera beat, otherwise present at once.
   * @param ownDeath the player's own death may still be replayed (it did not already play mid-battle)
   */
  const armEnding = (result: BattleResult, freshKill: boolean, ownDeath: boolean): void => {
    const plan = director.plan(verdictFor(result), ending?.modeState() ?? null);
    let played = false;
    if (plan.replay && (ownDeath || plan.replay.finalKill)) {
      played = killcam.playForResult(result, game.timeS, () => presentResult(result), {
        freshKill, finalKill: plan.replay.finalKill, ownDeath,
      });
    }
    if (played) {
      record(true, result, plan, 'replay');
      veilHud(true);
      return;
    }
    const ran = startCameraBeat(plan, result);
    record(false, result, plan, ran);
  };

  const update = (): void => {
    const result = game.result ?? null;
    // Reviving modes (owner 2026-09-16: "it should 3 2 1 and you're back at spawn") revive a destroyed player
    // at spawn; both branches below read the same two facts.
    const revives = game.ruleset?.respawnS != null;
    const destroyed = !!game.player?.combat?.destroyed;
    if (result && !endShown) {
      endShown = true;
      exitPointerLock();
      if (pending) {
        // A player-death beat was already armed. Preserve its original
        // deadline but redirect its completion into the final verdict flow.
        pending.fire = () => armEnding(result, false, true);
      } else {
        const freshKill = !deathCamShown && destroyed;
        // owner 2026-09-21 ("if u die before end it shows a kill cam of that end"): a reviving mode never ran a
        // mid-battle death replay, so the verdict is the only chance for one — and it belongs to a player who
        // is dead when the battle ends. A revived player alive at the end gets the ordinary result cinematic.
        // Non-reviving modes keep their flow unchanged. The final-kill replay (any shooter) is never barred.
        const deathReplayBarred = result === 'defeat' && revives && !destroyed;
        armEnding(result, freshKill, !deathCamShown && !deathReplayBarred);
      }
    } else if (!result) {
      endShown = false;
    }

    // Reviving modes: a destroyed player keeps the live chase view and the pointer lock while the HUD counts
    // down; no death cam, no kill-cam replay, no post-replay orbit. The mode revives the entity at spawn and
    // the camera follows it.
    if (!result && destroyed && !deathCamShown && !revives) {
      deathCamShown = true;
      // Destruction hands pointer ownership to the post-death UI immediately.
      // Keeping the lock through the cinematic forced players to press Esc
      // before they could use spectator and battle controls.
      exitPointerLock();
      rig.startDeathCam?.();
      const afterDeath = (): void => {
        veilHud(false);
        rig.release();
        rig.startDeathCam?.();
      };
      pending = {
        deadline: now() + deathBeatMs,
        fire: () => {
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

    if (beat) {
      const t = now();
      ending?.camera.frame(director.progress(t));
      if (director.finished(t)) finishBeat();
    }
  };

  return {
    update,
    reset() {
      cancelBeat();
      director.reset();
      endShown = false;
      deathCamShown = false;
      pending = null;
    },
    clearPending() {
      cancelBeat();
      pending = null;
    },
    observe(type, payload) {
      director.observe(type, payload);
    },
    snapshot() {
      return {
        endShown,
        deathCamShown,
        pendingDeadlineMs: pending?.deadline ?? null,
        beat: beat?.plan.beat ?? null,
      };
    },
  };
}
