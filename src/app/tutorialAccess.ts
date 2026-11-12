/**
 * tutorialAccess.ts — when the first-game tutorial runs, and its chunk's one owner (272). Copyright © 2026 Kevin B. Liu.
 *
 * The boot holds only this and ui/tutorial/tutorialRecord.ts: a player who has finished or skipped the tutorial, or who
 * played before it existed, asks for nothing more (no request, no byte beyond these lines). A chapter that is due loads
 * the overlay, its stylesheet and its strings as one lazy chunk, then runs:
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
import {
  markTutorialChapter, resetTutorialRecord, tutorialChapterDue, readTutorialRecord, type TutorialChapter,
} from '../ui/tutorial/tutorialRecord.ts';
import { createLazyChunk, importAll } from './lazyChunk.ts';

/** The URL flag the Field Manual's Replay link carries; the boot drops it from the address once read. */
const TUTORIAL_REPLAY_PARAM = 'tutorial';

/** The Field Manual's Replay link: whether the address asks for it, and the address without it. */
export function readTutorialReplay(href: string): { asked: boolean; cleaned: string } {
  try {
    const url = new URL(href);
    if (!url.searchParams.has(TUTORIAL_REPLAY_PARAM)) return { asked: false, cleaned: href };
    url.searchParams.delete(TUTORIAL_REPLAY_PARAM);
    return { asked: true, cleaned: url.toString() };
  } catch { return { asked: false, cleaned: href }; }
}

export interface TutorialAccessDeps {
  readonly on: (event: string, listener: (payload: unknown) => void) => () => void;
  readonly inputKind: () => 'keyboard' | 'touch' | 'pad';
  readonly keyLabel: (action: ActionId) => string;
  readonly playerPosition: () => { readonly x: number; readonly z: number } | null;
  /** The Garage is the screen showing (no battle, Studio or loading veil). */
  readonly onGarage: () => boolean;
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
  const chunk = createLazyChunk(() => importAll([
    import('../ui/tutorial/tutorialRunner.ts'),
    import('../ui/tutorial/tutorial.css'),
    import('../ui/tutorialStrings.ts').then((strings) => strings.ensureTutorialStrings()),
  ]).then(([runner]) => runner));
  let run: import('../ui/tutorial/tutorialRunner.ts').TutorialRun | null = null;
  let starting: TutorialChapter | null = null;

  function start(chapter: TutorialChapter, stillWanted: () => boolean): void {
    if (run || starting) return;
    starting = chapter;
    if (chapter === 'battle') setBodyFlag(BODY_FLAG, 'battle', true);
    chunk.load().then((runner) => {
      starting = null;
      if (run || !stillWanted() || !tutorialChapterDue(chapter)) { setBodyFlag(BODY_FLAG, 'battle', false); return; }
      run = runner.runTutorialChapter({
        chapter,
        port: { on: deps.on, inputKind: deps.inputKind, keyLabel: deps.keyLabel, playerPosition: deps.playerPosition },
        onEnd: (outcome) => {
          run = null;
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
    if (run && run.chapter !== 'battle') { stopRun(); if (teaching) markTutorialChapter('garage', 'done'); }
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
      if (run?.chapter === 'battle') { stopRun(); markTutorialChapter('battle', 'done'); }
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
      resetTutorialRecord();
      if (deps.onGarage()) start('garage', deps.onGarage);
    },
    debugStart(chapter: TutorialChapter): void {
      stopRun();
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
