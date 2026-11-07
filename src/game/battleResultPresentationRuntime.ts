import {
  createBattleEndingDirector, resolveCameraBeat,
  type BattleEndingDirector, type BattleEndingPlan, type BattleEndingBeat,
} from './battleEnding.ts';
import type { ObjectiveStateView } from '../ui/minimapObjectives.ts';

export type BattleResult = 'victory' | 'defeat' | 'draw';

interface ResultPlayer {
  /** The seat's hull: a mode's revive of it ('mode:respawn' with this id) ends its death flow (round 5 U4). */
  id?: string | null;
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
  /** Leave the death orbit for the player's camera (engine/cameraRig.ts); another owner is left as it is. */
  endDeathCam?(): void;
}

/**
 * The game bus, as far as this owner hears it itself: a network battle's restart (round 4 E6b review r1) and a mode's
 * revive of a hull (round 5 U4; both drivers tell it: state.ts's mode events, battlePresentation.ts mode_respawn).
 */
interface ResultBus {
  on(type: 'battle:restarted' | 'mode:respawn', listener: (payload?: unknown) => void): unknown;
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
  /**
   * The bus this owner hears a network battle's restart on ('battle:restarted', told once by
   * mp/presentation/battlePresentation.ts resetSettledWorld), as the HUD, the report and the records hear it themselves.
   */
  bus: ResultBus;
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
  /** The battle's teardown (main.ts clearBattle, before killcam.cancel()): no ending beat, no death beat and no
   *  death replay left on this owner's books (round 5 U4). */
  clearPending(): void;
  /** Watch mode (watch-mode-243): a freshly taken seat gets the player's death flow afresh (round 5 U4: its death
   *  replay off this owner's books too). */
  newSeat(): void;
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
/** The most one update may advance the beat clock: a frame step with room for a slow device's frame (4 fps), never a
 *  pause. */
const MAX_BEAT_STEP_MS = 250;

/**
 * Own the result/replay presentation state machine independently from the
 * fixed-step and render loop. The owner deliberately uses presentation time
 * (the beat clock: wall time while it is updated) only for the cinematic death
 * beat and the ending beats; gameplay state remains simulation-authored. Battle endings (owner 2026-09-25): every verdict asks
 * the director (battleEnding.ts) for its beat — the final-kill replay through
 * the killcam, or a camera beat (time's up, objective orbit, wreck orbit,
 * pull-back) through the ending camera — before the report is presented.
 */
export function createBattleResultPresentationRuntime({
  game,
  bus,
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
  const required = [bus?.on, killcam?.playForResult, rig?.release, veilHud,
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
  // The beat clock (2026-11-02 audit F4): the death beat and the ending beats run on presentation time, which advances
  // only across update() calls, at most one frame step (MAX_BEAT_STEP_MS) each. update() runs only while the battle
  // frame does (never while Settings pauses the battle, nor in a hidden tab), so a beat holds through a pause instead of
  // firing the moment play resumes. It reads the wall clock (now()) at its first update, so unpaused frames keep
  // wall-time deadlines.
  let beatClockMs: number | null = null;
  let lastWallMs = 0;
  const advanceBeatClock = (): number => {
    const wall = now();
    if (beatClockMs === null) beatClockMs = wall;
    else beatClockMs += Math.min(MAX_BEAT_STEP_MS, Math.max(0, wall - lastWallMs));
    lastWallMs = wall;
    return beatClockMs;
  };
  /** The beat clock as of this update (a port called before the first update reads the wall clock). */
  const beatNow = (): number => beatClockMs ?? now();
  let endShown = false;
  let deathCamShown = false;
  let pending: PendingReplay | null = null;
  let beat: RunningBeat | null = null;
  /**
   * The player's death replay is on screen and its HUD and camera are this owner's to hand back (round 4 E6b review
   * r2; round 5 U4): set when the killcam takes the death beat's replay (the beat's fire), cleared by the replay's
   * own end (afterDeath, which hands them back) and by dropDeathFlow on every other exit that ends the replay's life
   * here: a battle's start (reset), a network battle's restart and a mode's revive of the hull (their listeners hand
   * back first: handBackDeathFlow), the battle's teardown (clearPending) and a freshly taken Watch seat (newSeat). A
   * verdict's replay that takes the screen from it leaves it set: the verdict's own end hands back (presentResult),
   * and its one reader, the restart's listener, cannot hear a restart after this seat's verdict
   * (battlePresentation.ts resetSettledWorld's policy) before the teardown or the next battle's reset clears it.
   */
  let deathReplayShown = false;

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
    director.begin(cameraPlan, beatNow());
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
    const clock = advanceBeatClock();
    const result = game.result ?? null;
    // Reviving modes (owner 2026-09-16: "it should 3 2 1 and you're back at spawn") revive a destroyed player
    // at spawn; both branches below read the same two facts.
    const revives = game.ruleset?.respawnS != null;
    const destroyed = !!game.player?.combat?.destroyed;
    if (result && !endShown) {
      endShown = true;
      exitPointerLock();
      if (pending) {
        // The verdict landed inside the player's death beat (a network battle shows its own tank's death a
        // moment before the verdict's event; a last ally falling within the beat): the ending starts now, and
        // its replay opens on the killcam's live wreck hold, which carries the beat on. The report waits only
        // for a running replay or camera beat, so a beat left to its deadline let the report in first.
        pending = null;
        armEnding(result, true, true);
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
      // Keep capture through the death beat and spectator handoff. Esc remains
      // the player's explicit release; a final result still releases above.
      rig.startDeathCam?.();
      const afterDeath = (): void => {
        deathReplayShown = false;
        veilHud(false);
        rig.release();
        rig.startDeathCam?.();
      };
      pending = {
        deadline: clock + deathBeatMs,
        fire: () => {
          if (killcam.playForResult('defeat', game.timeS, afterDeath)) {
            deathReplayShown = true;
            veilHud(true);
          } else afterDeath();
        },
      };
    }

    if (pending && clock >= pending.deadline) {
      const fire = pending.fire;
      pending = null;
      fire();
    }

    if (beat) {
      ending?.camera.frame(director.progress(clock));
      if (director.finished(clock)) finishBeat();
    }
  };

  /**
   * (round 5 U4) The player's death flow leaves the screen to whoever owns it next: no death beat stays pending and
   * no death replay stays on this owner's books (deathReplayShown's one clearer but the replay's own end). Before,
   * the battle's teardown and a fresh Watch seat left the replay on the books after the killcam's cancel had taken it
   * off the screen (main.ts clearBattle runs clearPending, then killcam.cancel(), which runs no afterDeath), so a
   * restart heard without a reset unveiled the HUD and released the rig for a replay that was gone: the release took
   * the camera from whichever owner had pinned it since. Whether the death cam ran (deathCamShown) is each caller's
   * to say.
   */
  const dropDeathFlow = (): void => {
    pending = null;
    deathReplayShown = false;
  };

  /**
   * The hull lives again on this battle's screen (a network battle's restart, a mode's revive): what its abandoned
   * death flow held there goes back to the player. A death replay on screen at that edge is cancelled by the
   * killcam's own listener, and a cancelled replay runs no onDone (afterDeath) and keeps the rig's external pin
   * (killcam.ts cancel -> finish(false) -> teardown(false); publishReplayCompletion runs onDone only on a finish or
   * skip), so its HUD and its camera come back here. The death orbit ends with the player's camera (the rig leaves
   * only its own 'death' owner; an external pin, the ally chase or the flyby stays). Neither listener touches what
   * the other one does, so the order in which the killcam and this owner hear the edge does not matter.
   */
  const handBackDeathFlow = (replaying: boolean, orbiting: boolean): void => {
    if (replaying) {
      veilHud(false);
      rig.release();
    }
    if (orbiting) rig.endDeathCam?.();
  };

  /** A battle's start over: no ending beat, no ending facts, no result shown, the player's death flow afresh. */
  const startOver = (): void => {
    cancelBeat();
    director.reset();
    endShown = false;
    deathCamShown = false;
    dropDeathFlow();
  };

  // (round 4 E6b) A network battle restarted under this seat opens a new battle (the session's decision; Kevin may
  // overrule): the battle start's own reset (startOver), so its ending reads only its facts (the director's last kill,
  // zone, flag, goal and wave: a restarted battle that ended on time framed the abandoned battle's last wreck) and the
  // player's death flow is its own again (a death beat pending at the restart played its replay over the restarted
  // battle; a seat whose death cam had run got none, and no death replay at the verdict, when it died again). It runs
  // unconditionally: a restart cannot follow this seat's verdict (the edge's policy, battlePresentation.ts
  // resetSettledWorld; review r1). What a battle's start does not need: a seat whose death orbit ran gets its camera
  // back, its hull alive at its spawn (a start opens on its own flyby); before, the orbit circled the living hull until
  // the battle ended. A seat whose death replay was on screen gets its HUD and its camera back here too (review r2,
  // handBackDeathFlow): before, the restarted battle played under a frozen camera with no HUD until the seat died again
  // or the battle ended. This owner hears the edge itself (review r1), so a receipt drives it as the page does.
  bus.on('battle:restarted', () => {
    const orbiting = deathCamShown;
    const replaying = deathReplayShown;
    startOver();
    handBackDeathFlow(replaying, orbiting);
  });

  // (round 5 U4) A mode revived the player's hull: its life's death flow ends, as at a restart, and the battle goes
  // on (its ending facts and verdict stand). A mode can revive a hull its ruleset gives no respawn timer, so update()
  // ran the full death flow for it: Horde (matchRuleset.ts endless_horde, respawnS null) stands every fallen ally up
  // at the next wave's start (matchModes.ts startHordeWave), the human seat's hull too, 8 s after a wave is cleared,
  // inside a death replay of up to 15 s. The killcam's own 'mode:respawn' listener cancels that replay, so before,
  // the revived hull played on under the replay's frozen pin with the HUD veiled; a revive inside the death beat left
  // the orbit on the living hull and the beat's late fire restarted it; and the hull's next death got no death cam or
  // replay (deathCamShown stayed set). In a mode with a respawn timer the flow never starts (update's `revives`), so
  // this is a no-op there. After the verdict the ending owns the camera and the report, so a revive then is not this
  // owner's.
  bus.on('mode:respawn', (payload) => {
    const id = typeof payload === 'object' && payload !== null ? Reflect.get(payload, 'id') : null;
    const player = game.player;
    if (endShown || !player || id == null || id !== player.id) return;
    const orbiting = deathCamShown;
    const replaying = deathReplayShown;
    deathCamShown = false;
    dropDeathFlow();
    handBackDeathFlow(replaying, orbiting);
  });

  return {
    update,
    reset: startOver,
    clearPending() {
      cancelBeat();
      dropDeathFlow();
    },
    newSeat() {
      if (endShown) return;
      deathCamShown = false;
      dropDeathFlow();
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
