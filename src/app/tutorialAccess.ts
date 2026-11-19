/**
 * tutorialAccess.ts — when the first-game tutorial runs, and its chunk's one owner (272). Copyright © 2026 Kevin B. Liu.
 *
 * The boot holds only ui/tutorial/tutorialRecord.ts: main.ts loads this module only while a chapter could still run (or
 * on a replay), so a player who has finished or skipped the tutorial, or who played before it existed, asks for nothing
 * (no request, no byte beyond the record's check). A chapter that is due loads the overlay, its stylesheet and its
 * strings as a second lazy chunk, then runs:
 *
 * - garage: the Garage's first showing for a new player (main.ts after the entry gate), or a replay;
 * - battle: the rollout of a local Standard battle (never a room's, Watch, the Proving Ground, a couch battle or a
 *   campaign operation) once the Garage chapter has passed;
 * - tips: the Garage's next showing after that battle.
 *
 * Skip at any step records every chapter skipped. Replay (Settings, or `/?tutorial=1` from the Field Manual's
 * first-battle page) clears the record and runs the Garage chapter at once when the Garage is showing. While the battle
 * chapter runs, body.cot-tutorial is raised, and the first-battle key strip (ui/settings.ts) stands down for it.
 */
import type { ActionId } from '../game/input.ts';
import { setBodyFlag } from '../ui/bodyFlags.ts';
import type { TutorialChapter, TutorialOutcome, TutorialRecord } from '../ui/tutorial/tutorialRecord.ts';
import { createLazyChunk, importAll } from './lazyChunk.ts';

/** The boot's record (ui/tutorial/tutorialRecord.ts), handed in so this chunk imports none of it: a runtime import from
 *  both the boot and this chunk would split the record into a boot request of its own. */
export interface TutorialRecordPort {
  readonly read: () => TutorialRecord | null;
  readonly due: (chapter: TutorialChapter) => boolean;
  readonly mark: (chapter: TutorialChapter | 'all', outcome: TutorialOutcome) => void;
  readonly reset: () => void;
}

export interface TutorialAccessDeps {
  readonly record: TutorialRecordPort;
  readonly on: (event: string, listener: (payload: unknown) => void) => () => void;
  readonly inputKind: () => 'keyboard' | 'touch' | 'pad';
  readonly keyLabel: (action: ActionId) => string;
  readonly codeLabel: (code: string) => string;
  readonly playerPosition: () => { readonly x: number; readonly z: number } | null;
  /** The Garage is the screen showing (no battle, Studio or loading veil). */
  readonly onGarage: () => boolean;
  /** A chapter's screen: live, covered by a surface the step did not open (the card hides), or gone (the run closes,
   *  keeping its place). See ui/tutorial/tutorialRunner.ts. */
  readonly screen: (chapter: TutorialChapter) => 'live' | 'covered' | 'gone';
  /** This rollout is a local Standard battle the player drives (see the module comment). */
  readonly isTutorialBattle: () => boolean;
  /** 273: this rollout is the training battle (the tutorial's own mode, sim/trainingGround.ts). */
  readonly isTrainingBattle: () => boolean;
  /** A new player's first battle is a gentle one: easy bots (the Deploy screen shows the choice). */
  readonly preferEasyBots: () => void;
  /** 273: what the battle's guide reads (ui/tutorial/tutorialGuide.ts), and the battle state camera, armour and hit
   *  steps read (ui/tutorial/tutorialRunner.ts TutorialPort). */
  readonly guide: import('../ui/tutorial/tutorialGuide.ts').GuidePort;
  readonly view: () => import('../ui/tutorial/tutorialRunner.ts').TutorialView | null;
  readonly playerId: () => string | null;
  readonly armourOn: () => boolean;
  /** 274: a step taught a subject another surface would teach (the armour colours' one-time tip stands down). */
  readonly taught: (subject: 'armourColours') => void;
  /** 273: a training step cues its scripted shooter while it shows (game/state.ts cueTrainingActor). */
  readonly cue: (actor: string, on: boolean) => void;
  /** 273: a ring reached is the training battle's checkpoint (game/state.ts setTrainingCheckpoint). */
  readonly checkpoint: (x: number, z: number) => void;
  /** 273: the training chapter is complete: the battle ends and the Garage comes back. */
  readonly trainingComplete: () => void;
}

export interface TutorialAccess {
  /** The Garage has shown (the first time, or on a return from a battle). */
  garageShown(): void;
  /** 273: a training battle rolled out before this access was resident (main.ts loads it then): run its chapter. */
  trainingRolledOut(): void;
  /** Settings' Replay, or the Field Manual's link. */
  replay(): void;
  /** The chapter running and its step (receipts and the capture tool), or null. */
  current(): { chapter: TutorialChapter; step: string | null } | null;
  /** Diagnostics only (main.ts gates it): clear the record and run one chapter now, on whatever screen is showing. */
  debugStart(chapter: TutorialChapter): void;
  /** Diagnostics only (273): show a guide spec over the battle showing (null clears it), its labels taken as written;
   *  resolves to a reader of what it drew (the receipts' snapshot). */
  debugGuide(spec: import('../ui/tutorial/tutorialSteps.ts').TutorialGuideSpec | null): Promise<() => unknown>;
}

const BODY_FLAG = 'cot-tutorial';

export function createTutorialAccess(deps: TutorialAccessDeps): TutorialAccess {
  const { read: readTutorialRecord, due: tutorialChapterDue, mark: markTutorialChapter, reset: resetTutorialRecord } = deps.record;
  const chunk = createLazyChunk(() => importAll([
    import('../ui/tutorial/tutorialRunner.ts'),
    import('../ui/tutorial/tutorial.css'),
    import('../ui/tutorialStrings.ts').then((strings) => strings.ensureTutorialStrings()),
  ]).then(([runner]) => runner));
  let run: import('../ui/tutorial/tutorialRunner.ts').TutorialRun | null = null;
  let starting: TutorialChapter | null = null;
  /** Where a chapter whose screen went away stood: it resumes there (272, the owner: "closes and keeps its progress"). */
  const resumeAt: Partial<Record<TutorialChapter, number>> = {};
  /** The Garage closed on its Deploy step: the battle that follows decides (a tutorial battle is Deploy pressed). */
  let closedOnDeploy = false;
  /** 273: the training battle's run as the debrief reads it (the one running, or the last finished), and whether its
   *  debrief waits for the Garage. */
  let training: { startedAt: number; endedAt: number | null; shots: number; pens: number; held: number; destroyed: number;
    shown: string[]; complete: boolean } | null = null;
  let debriefDue = false;
  const HELD_KINDS = new Set(['ricochet', 'nonpen', 'spaced_absorb']);
  const counting = (): boolean => !!training && run?.chapter === 'training';
  deps.on('shell:fired', (payload) => { if (counting() && (payload as { isPlayer?: boolean } | null)?.isPlayer) training!.shots += 1; });
  deps.on('shell:hit', (payload) => {
    if (!counting()) return;
    const hit = payload as { kind?: string; attackerId?: string; targetId?: string } | null;
    const me = deps.playerId();
    if (!me || !hit?.kind) return;
    if (hit.attackerId === me && hit.kind === 'pen') training!.pens += 1;
    if (hit.targetId === me && HELD_KINDS.has(hit.kind)) training!.held += 1;
  });
  deps.on('tank:destroyed', (payload) => {
    const kill = payload as { id?: string; killerId?: string } | null;
    const me = deps.playerId();
    if (counting() && me && kill?.killerId === me && kill.id !== me) training!.destroyed += 1;
  });
  const trainingRun = (): import('../ui/tutorial/tutorialRunner.ts').TrainingRunView | null => (training ? {
    seconds: ((training.endedAt ?? performance.now()) - training.startedAt) / 1000, shots: training.shots, pens: training.pens,
    held: training.held, destroyed: training.destroyed, shown: training.shown, complete: training.complete,
  } : null);
  /** Diagnostics' guide (debugGuide), apart from any run. */
  let debugLayer: import('../ui/tutorial/tutorialGuide.ts').TutorialGuideLayer | null = null;

  function start(chapter: TutorialChapter, stillWanted: () => boolean): void {
    if (run || starting) return;
    starting = chapter;
    if (chapter === 'battle' || chapter === 'training') setBodyFlag(BODY_FLAG, 'battle', true);
    chunk.load().then((runner) => {
      starting = null;
      if (run || !stillWanted() || !tutorialChapterDue(chapter)) { setBodyFlag(BODY_FLAG, 'battle', false); return; }
      run = runner.runTutorialChapter({
        chapter,
        startAt: resumeAt[chapter] ?? 0,
        port: { on: deps.on, inputKind: deps.inputKind, keyLabel: deps.keyLabel, codeLabel: deps.codeLabel, playerPosition: deps.playerPosition,
          screen: deps.screen, guide: deps.guide, view: deps.view, playerId: deps.playerId, armourOn: deps.armourOn, taught: deps.taught, cue: deps.cue,
          checkpoint: deps.checkpoint, trainingRun },
        onStep: (stepId) => { if (chapter === 'training') training?.shown.push(stepId); },
        onClose: (index, stepId) => {
          run = null;
          setBodyFlag(BODY_FLAG, 'battle', false);
          resumeAt[chapter] = index;
          closedOnDeploy = chapter === 'garage' && stepId === 'garage.deploy';
        },
        onEnd: (outcome) => {
          run = null;
          delete resumeAt[chapter];
          setBodyFlag(BODY_FLAG, 'battle', false);
          // the training battle keeps no record yet (tutorialRecord.ts TutorialChapter): its Skip ends its own run only;
          // its last card ends the battle and brings the Garage back
          if (chapter === 'training') {
            if (outcome !== 'skipped' && training) {
              training.complete = true;
              training.endedAt = performance.now();
              debriefDue = true;
              deps.trainingComplete();
            }
            return;
          }
          // the debrief's "Show me around" brings the tour (Skip ends both)
          if (chapter === 'debrief') { debriefDue = false; if (outcome !== 'skipped') start('tour', deps.onGarage); return; }
          if (chapter === 'tour') return;
          if (outcome === 'skipped') markTutorialChapter('all', 'skipped');
          else markTutorialChapter(chapter, 'done');
        },
      });
    }).catch((error) => {
      starting = null;
      setBodyFlag(BODY_FLAG, 'battle', false);
      console.warn('[tutorial] the overlay did not load; the game goes on without it', error);
    });
  }

  function stopRun(): void {
    if (!run) return;
    const ending = run;
    run = null;
    ending.stop();
    setBodyFlag(BODY_FLAG, 'battle', false);
  }

  // A battle's rollout: the battle chapter, or (a Garage chapter cut short by Deploy) the Garage chapter recorded done.
  // A battle the tutorial does not teach (a room, the Proving Ground, Watch) only puts a Garage chapter away for later.
  /** The training battle is the tutorial's own: its chapter runs on every rollout of it (273). */
  function runTraining(): void {
    if (run) stopRun();
    closedOnDeploy = false;
    delete resumeAt.training;
    training = { startedAt: performance.now(), endedAt: null, shots: 0, pens: 0, held: 0, destroyed: 0, shown: [], complete: false };
    debriefDue = false;
    start('training', deps.isTrainingBattle);
  }
  deps.on('battle:rollout', () => {
    if (deps.isTrainingBattle()) { runTraining(); return; }
    const teaching = deps.isTutorialBattle();
    if (run && run.chapter !== 'battle') stopRun();
    // the Garage closed on Deploy (Enter, or the press itself): a tutorial battle is that Deploy, so the chapter is done;
    // any other battle (Test Drive, a room, Watch) leaves it to resume on Deploy
    if (closedOnDeploy && teaching) { markTutorialChapter('garage', 'done'); delete resumeAt.garage; }
    closedOnDeploy = false;
    if (!teaching || tutorialChapterDue('garage') || !tutorialChapterDue('battle')) return;
    start('battle', () => true);
  });
  // the battle's end ends its chapter: the player has fought it; the tips follow on the Garage
  deps.on('battle:ended', () => {
    if (run?.chapter === 'training') { stopRun(); return; }
    if (run?.chapter !== 'battle') return;
    stopRun();
    markTutorialChapter('battle', 'done');
  });

  return {
    trainingRolledOut(): void {
      if (deps.isTrainingBattle() && run?.chapter !== 'training' && starting !== 'training') runTraining();
    },
    garageShown(): void {
      if (!deps.onGarage()) return;
      // 273: a training battle just finished: its debrief, then the tour (the debrief's Show me around)
      if (debriefDue) { start('debrief', deps.onGarage); return; }
      if (tutorialChapterDue('garage')) {
        if (readTutorialRecord() === null) deps.preferEasyBots();
        start('garage', deps.onGarage);
      } else if (!tutorialChapterDue('battle') && tutorialChapterDue('tips')) {
        start('tips', deps.onGarage);
      }
    },
    replay(): void {
      stopRun();
      for (const chapter of ['garage', 'battle', 'tips'] as const) delete resumeAt[chapter];
      closedOnDeploy = false;
      resetTutorialRecord();
      if (deps.onGarage()) start('garage', deps.onGarage);
    },
    debugStart(chapter: TutorialChapter): void {
      stopRun();
      if (chapter === 'training') { delete resumeAt.training; start('training', () => true); return; }
      for (const name of ['garage', 'battle', 'tips'] as const) delete resumeAt[name];
      closedOnDeploy = false;
      resetTutorialRecord();
      for (const earlier of ['garage', 'battle', 'tips'] as const) {
        if (earlier === chapter) break;
        markTutorialChapter(earlier, 'done');
      }
      start(chapter, () => true);
    },
    current: () => (run ? { chapter: run.chapter, step: run.stepId } : starting ? { chapter: starting, step: null } : null),
    debugGuide: (spec) => chunk.load().then((runner) => {
      debugLayer?.destroy();
      debugLayer = spec ? runner.createTutorialGuide(deps.guide) : null;
      debugLayer?.show(spec, { marker: spec?.marker?.label ?? '', actor: spec?.actor?.label ?? '', distance: (m) => `${m} m` });
      return () => debugLayer?.snapshot() ?? null;
    }),
  };
}
