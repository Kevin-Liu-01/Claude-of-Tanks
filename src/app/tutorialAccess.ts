/**
 * tutorialAccess.ts — when the first-game tutorial runs, and its chunk's one owner (272; the journey, 274).
 * Copyright © 2026 Kevin B. Liu.
 *
 * The boot holds only ui/tutorial/tutorialRecord.ts: main.ts loads this module only while a chapter could still run (or
 * on a replay), so a player who has finished or skipped the tutorial asks for nothing (no request, no byte beyond the
 * record's check). A chapter that is due loads the overlay, its stylesheet and its strings as a second lazy chunk, then
 * runs. The tutorial is one journey (274, Kevin: "Deploy launches the training battle"):
 *
 * - garage: the Garage's first showing for a new player (main.ts after the entry gate), or a replay; its last card lights
 *   Deploy, and that press is the tutorial's: it launches the training battle (the loaner on Verdant Fields);
 * - training: every rollout of the training battle; its last step won ends the battle and brings the Garage back;
 * - debrief: that Garage's showing; its "Show me around" brings the tour;
 * - tour: the five stops and the close;
 * - offer: a returning player's (or 272's record's) Garage, once: Start launches the training battle, Not now puts the
 *   journey away; either answer is recorded.
 *
 * Skip at any step records every chapter skipped. Replay (Settings, or `/?tutorial=1` from the Field Manual's
 * first-battle page) clears the record and runs the Garage chapter at once when the Garage is showing. While the training
 * chapter runs, body.cot-tutorial is raised, and the first-battle key strip (ui/settings.ts) stands down for it.
 */
import type { ActionId } from '../game/input.ts';
import { setBodyFlag } from '../ui/bodyFlags.ts';
import type { TutorialChapter, TutorialOfferAnswer, TutorialOutcome, TutorialRecord } from '../ui/tutorial/tutorialRecord.ts';
import { createLazyChunk, importAll } from './lazyChunk.ts';

/** The boot's record (ui/tutorial/tutorialRecord.ts), handed in so this chunk imports none of it: a runtime import from
 *  both the boot and this chunk would split the record into a boot request of its own. */
export interface TutorialRecordPort {
  readonly read: () => TutorialRecord | null;
  readonly due: (chapter: TutorialChapter) => boolean;
  readonly mark: (chapter: Exclude<TutorialChapter, 'offer'> | 'all', outcome: TutorialOutcome) => void;
  readonly reset: () => void;
  /** 274: the offer's answer, recorded so it never shows again. */
  readonly answerOffer: (answer: TutorialOfferAnswer) => void;
}

export interface TutorialAccessDeps {
  readonly record: TutorialRecordPort;
  readonly on: (event: string, listener: (payload: unknown) => void) => () => void;
  readonly inputKind: () => 'keyboard' | 'touch' | 'pad';
  readonly keyLabel: (action: ActionId) => string;
  readonly codeLabel: (code: string) => string;
  /** 274: a step's icon as markup (ui/uiIcons.ts uiIconSVG; passed in, as the key labels are). */
  readonly iconSvg: (id: string) => string;
  readonly playerPosition: () => { readonly x: number; readonly z: number } | null;
  /** The Garage is the screen showing (no battle, Studio or loading veil). */
  readonly onGarage: () => boolean;
  /** A chapter's screen: live, covered by a surface the step did not open (the card hides), or gone (the run closes,
   *  keeping its place). See ui/tutorial/tutorialRunner.ts. */
  readonly screen: (chapter: TutorialChapter) => 'live' | 'covered' | 'gone';
  /** 273: this rollout is the training battle (the tutorial's own mode, sim/trainingGround.ts). */
  readonly isTrainingBattle: () => boolean;
  /** 274: launch the training battle (the Garage chapter's Deploy, the offer's Start): its rollout runs its chapter. */
  readonly launchTraining: () => void;
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
  /** A battle card that explains rather than asks holds the battle while it shows (main.ts: the frame's own pause). */
  readonly hold: (on: boolean) => void;
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
  debugStart(chapter: TutorialChapter, atStep?: number): void;
  /** Diagnostics only (273): show a guide spec over the battle showing (null clears it), its labels taken as written;
   *  resolves to a reader of what it drew (the receipts' snapshot). */
  debugGuide(spec: import('../ui/tutorial/tutorialSteps.ts').TutorialGuideSpec | null): Promise<() => unknown>;
}

const BODY_FLAG = 'cot-tutorial';

export function createTutorialAccess(deps: TutorialAccessDeps): TutorialAccess {
  const { read: readTutorialRecord, due: tutorialChapterDue, mark: markTutorialChapter, reset: resetTutorialRecord, answerOffer } = deps.record;
  const chunk = createLazyChunk(() => importAll([
    import('../ui/tutorial/tutorialRunner.ts'),
    import('../ui/tutorial/tutorial.css'),
    import('../ui/tutorialStrings.ts').then((strings) => strings.ensureTutorialStrings()),
  ]).then(([runner]) => runner));
  let run: import('../ui/tutorial/tutorialRunner.ts').TutorialRun | null = null;
  let starting: TutorialChapter | null = null;
  /** Where a chapter whose screen went away stood: it resumes there (272, the owner: "closes and keeps its progress"). */
  const resumeAt: Partial<Record<TutorialChapter, number>> = {};
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

  /** Run a chapter once its chunk is in, if it is still wanted and still due (`force`: diagnostics open it regardless). */
  function start(chapter: TutorialChapter, stillWanted: () => boolean, force = false): void {
    if (run || starting) return;
    starting = chapter;
    if (chapter === 'training') setBodyFlag(BODY_FLAG, 'battle', true);
    chunk.load().then((runner) => {
      starting = null;
      if (run || !stillWanted() || (!force && !tutorialChapterDue(chapter))) { setBodyFlag(BODY_FLAG, 'battle', false); return; }
      run = runner.runTutorialChapter({
        chapter,
        startAt: resumeAt[chapter] ?? 0,
        port: { on: deps.on, inputKind: deps.inputKind, keyLabel: deps.keyLabel, codeLabel: deps.codeLabel, iconSvg: deps.iconSvg, playerPosition: deps.playerPosition,
          screen: deps.screen, guide: deps.guide, view: deps.view, playerId: deps.playerId, armourOn: deps.armourOn, taught: deps.taught, cue: deps.cue,
          checkpoint: deps.checkpoint, trainingRun, hold: deps.hold },
        onStep: (stepId) => { if (chapter === 'training') training?.shown.push(stepId); },
        onClose: (index) => {
          run = null;
          setBodyFlag(BODY_FLAG, 'battle', false);
          resumeAt[chapter] = index;
        },
        onEnd: (outcome) => {
          run = null;
          delete resumeAt[chapter];
          setBodyFlag(BODY_FLAG, 'battle', false);
          // the offer (274): Start launches the training battle, Not now puts the journey away; either is recorded
          if (chapter === 'offer') {
            answerOffer(outcome === 'done' ? 'start' : 'later');
            if (outcome === 'done') deps.launchTraining();
            return;
          }
          // Skip anywhere ends the whole journey
          if (outcome === 'skipped') { markTutorialChapter('all', 'skipped'); debriefDue = false; return; }
          markTutorialChapter(chapter, 'done');
          // the Garage chapter's last card was Deploy: its press launches the training battle (274)
          if (chapter === 'garage') deps.launchTraining();
          // the training battle won: the battle ends and the Garage brings the debrief
          else if (chapter === 'training' && training) {
            training.complete = true;
            training.endedAt = performance.now();
            debriefDue = true;
            deps.trainingComplete();
          }
          // the debrief's "Show me around" brings the tour
          else if (chapter === 'debrief') { debriefDue = false; start('tour', deps.onGarage); }
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

  /** The training battle is the tutorial's own: its chapter runs on every rollout of it (273). A battle the tutorial does
   *  not teach (Test Drive, a room, Watch) closes a Garage chapter where it stood: it resumes on the Garage's next showing. */
  function runTraining(): void {
    if (run) stopRun();
    delete resumeAt.training;
    training = { startedAt: performance.now(), endedAt: null, shots: 0, pens: 0, held: 0, destroyed: 0, shown: [], complete: false };
    debriefDue = false;
    start('training', deps.isTrainingBattle);
  }
  deps.on('battle:rollout', () => {
    if (deps.isTrainingBattle()) runTraining();
    else if (run) stopRun();
  });
  // a training battle that ends before its last step (Leave, a loss) ends its chapter, recording nothing
  deps.on('battle:ended', () => { if (run?.chapter === 'training') stopRun(); });

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
      } else if (tutorialChapterDue('offer')) {
        start('offer', deps.onGarage);
      }
    },
    replay(): void {
      stopRun();
      for (const chapter of Object.keys(resumeAt) as TutorialChapter[]) delete resumeAt[chapter];
      debriefDue = false;
      resetTutorialRecord();
      if (deps.onGarage()) start('garage', deps.onGarage);
    },
    debugStart(chapter: TutorialChapter, atStep?: number): void {
      stopRun();
      // (atStep: the chapter opened at that step, the capture tools' stills of one card; diagnostics only)
      for (const name of Object.keys(resumeAt) as TutorialChapter[]) delete resumeAt[name];
      if (atStep != null && atStep > 0) resumeAt[chapter] = atStep;
      if (chapter === 'garage') resetTutorialRecord();
      start(chapter, () => true, true);
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
