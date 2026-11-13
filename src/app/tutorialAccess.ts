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
  /** A new player's first battle is a gentle one: easy bots (the Deploy screen shows the choice). */
  readonly preferEasyBots: () => void;
}

export interface TutorialAccess {
  /** The Garage has shown (the first time, or on a return from a battle). */
  garageShown(): void;
  /** Settings' Replay, or the Field Manual's link. */
  replay(): void;
  /** The chapter running and its step (receipts and the capture tool), or null. */
  current(): { chapter: TutorialChapter; step: string | null } | null;
  /** Diagnostics only (main.ts gates it): clear the record and run one chapter now, on whatever screen is showing. */
  debugStart(chapter: TutorialChapter): void;
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

  function start(chapter: TutorialChapter, stillWanted: () => boolean): void {
    if (run || starting) return;
    starting = chapter;
    if (chapter === 'battle') setBodyFlag(BODY_FLAG, 'battle', true);
    chunk.load().then((runner) => {
      starting = null;
      if (run || !stillWanted() || !tutorialChapterDue(chapter)) { setBodyFlag(BODY_FLAG, 'battle', false); return; }
      run = runner.runTutorialChapter({
        chapter,
        startAt: resumeAt[chapter] ?? 0,
        port: { on: deps.on, inputKind: deps.inputKind, keyLabel: deps.keyLabel, codeLabel: deps.codeLabel, playerPosition: deps.playerPosition,
          screen: deps.screen },
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
  deps.on('battle:rollout', () => {
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
    if (run?.chapter !== 'battle') return;
    stopRun();
    markTutorialChapter('battle', 'done');
  });

  return {
    garageShown(): void {
      if (!deps.onGarage()) return;
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
  };
}
