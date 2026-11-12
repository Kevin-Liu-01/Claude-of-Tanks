/**
 * tutorialRecord.ts — whether the first-game tutorial still has a chapter to show (272). Copyright © 2026 Kevin B. Liu.
 *
 * The tutorial has three chapters: the Garage on the first visit, the first battle, and the strategy tips on the
 * Garage after it. Each is pending, done or skipped in the player's local profile (`cot.tutorial.v1`); Skip marks
 * every chapter skipped at once. A browser with no record is a new player only if it holds no sign of play: a
 * battle in the profile (game/profile.ts `cot.profile.v2`, written when a battle ends) or the first-battle hint
 * record (ui/settings.ts, written at a battle's rollout). A returning player from before the tutorial existed never
 * sees it unless they ask (Settings > Replay tutorial, or `/?tutorial=1` from the Field Manual).
 *
 * This is the only part of the tutorial on the boot path: a few lines over localStorage. A browser with nothing left to
 * show (finished, skipped, or a returning player) loads nothing more; otherwise main.ts loads app/tutorialAccess.ts,
 * which loads the overlay, the steps and their strings when a chapter runs.
 */

export const TUTORIAL_STORAGE_KEY = 'cot.tutorial.v1';
export const TUTORIAL_CHAPTERS = ['garage', 'battle', 'tips'] as const;
export type TutorialChapter = (typeof TUTORIAL_CHAPTERS)[number];
export type TutorialOutcome = 'done' | 'skipped';
export type TutorialRecord = Partial<Record<TutorialChapter, TutorialOutcome>>;

/** Keys that only a browser that has played holds (see the module comment). */
const PLAYED_KEYS = ['cot.profile.v2', 'cot.battle.hints.v2', 'cot.battle.hints.v1'] as const;

type RecordStorage = Pick<Storage, 'getItem' | 'setItem'>;

function storageOf(storage?: RecordStorage | null): RecordStorage | null {
  if (storage !== undefined) return storage;
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

/** The stored record, or null when this browser has none (or refuses storage). */
export function readTutorialRecord(storage?: RecordStorage | null): TutorialRecord | null {
  const store = storageOf(storage);
  if (!store) return null;
  try {
    const raw = store.getItem(TUTORIAL_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const record: TutorialRecord = {};
    for (const chapter of TUTORIAL_CHAPTERS) {
      const value = parsed?.[chapter];
      if (value === 'done' || value === 'skipped') record[chapter] = value;
    }
    return record;
  } catch { return null; }
}

function writeRecord(record: TutorialRecord, storage?: RecordStorage | null): void {
  try { storageOf(storage)?.setItem(TUTORIAL_STORAGE_KEY, JSON.stringify(record)); } catch { /* the record lasts this page */ }
}

/** True when this browser holds a sign of play from before the tutorial existed. */
export function hasPlayedBefore(storage?: RecordStorage | null): boolean {
  const store = storageOf(storage);
  if (!store) return true; // no storage: never show a tutorial we could not remember finishing
  try { return PLAYED_KEYS.some((key) => store.getItem(key) != null); } catch { return true; }
}

/** The chapter is still to show: recorded as neither done nor skipped, and the player is new (or asked to replay). */
export function tutorialChapterDue(chapter: TutorialChapter, storage?: RecordStorage | null): boolean {
  const record = readTutorialRecord(storage);
  if (!record) return !hasPlayedBefore(storage);
  return record[chapter] === undefined;
}

/** Record one chapter's outcome; Skip passes 'skipped' for every chapter still pending. */
export function markTutorialChapter(chapter: TutorialChapter | 'all', outcome: TutorialOutcome, storage?: RecordStorage | null): void {
  const record = readTutorialRecord(storage) ?? {};
  for (const name of chapter === 'all' ? TUTORIAL_CHAPTERS : [chapter]) if (record[name] === undefined || chapter !== 'all') record[name] = outcome;
  writeRecord(record, storage);
}

/** Replay: every chapter pending again (an empty record, which is not "no record": it never asks about past play). */
export function resetTutorialRecord(storage?: RecordStorage | null): void {
  writeRecord({}, storage);
}

/** Any chapter could still run: the boot loads the tutorial's access (app/tutorialAccess.ts) only then. */
export function tutorialMayRun(storage?: RecordStorage | null): boolean {
  return TUTORIAL_CHAPTERS.some((chapter) => tutorialChapterDue(chapter, storage));
}

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
