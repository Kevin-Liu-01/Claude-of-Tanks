/**
 * tutorialRecord.ts — whether the first-game tutorial still has a chapter to show (272; the journey's record, 274).
 * Copyright © 2026 Kevin B. Liu.
 *
 * The tutorial is one journey (274, Kevin: "Deploy launches the training battle"): the Garage on the first visit, whose
 * Deploy launches the training battle, the training battle's chapter, its debrief on the Garage, and the five-stop tour.
 * Each chapter is pending, done or skipped in the player's local profile (`cot.tutorial.v1`, written with `v: 2`); Skip
 * marks every chapter skipped at once. A browser with no record is a new player only if it holds no sign of play: a
 * battle in the profile (game/profile.ts `cot.profile.v2`, written when a battle ends) or the first-battle hint record
 * (ui/settings.ts, written at a battle's rollout).
 *
 * A returning player (signs of play and no record), and any record from before the journey (272's garage, battle and
 * tips chapters, written without `v`), is offered the journey once: a card on the Garage, Start or Not now, and either
 * answer is recorded (`offer`), so it never shows again. Replay (Settings, or `/?tutorial=1` from the Field Manual)
 * starts the journey from the Garage whatever the record says.
 *
 * This is the only part of the tutorial on the boot path: a few lines over localStorage. A browser with nothing left to
 * show (finished, skipped, or a returning player) loads nothing more; otherwise main.ts loads app/tutorialAccess.ts,
 * which loads the overlay, the steps and their strings when a chapter runs.
 */

/** (272.0.1, Main 2026-11-12) The tutorial's switch. 272.0.1 turned it off when a click on the dimmed screen at step 7
 *  (Deploy) launched a Proving Ground battle and left the card over the loading screen; 272.1 turns it back on with the
 *  fix (the dim is inert, the card's lifetime follows its screen). Off: no chapter starts for a new player,
 *  `/?tutorial=1` does nothing, and Settings and the Field Manual offer no Replay. */
export const TUTORIAL_ON: boolean = true;

export const TUTORIAL_STORAGE_KEY = 'cot.tutorial.v1';
/** The journey's chapters, in order (274): each recorded done or skipped. */
export const TUTORIAL_CHAPTERS = ['garage', 'training', 'debrief', 'tour'] as const;
/** A chapter the tutorial runs: the journey's four, and the one-time offer to a returning player (274). */
export type TutorialChapter = (typeof TUTORIAL_CHAPTERS)[number] | 'offer';
type RecordedChapter = (typeof TUTORIAL_CHAPTERS)[number];
export type TutorialOutcome = 'done' | 'skipped';
/** The offer's answer: the player started the journey from it, or put it away (Not now). */
export type TutorialOfferAnswer = 'start' | 'later';
export type TutorialRecord = Partial<Record<RecordedChapter, TutorialOutcome>> & { offer?: TutorialOfferAnswer };
/** The record's format: 2 is the journey's (274); a record without it is 272's (garage, battle, tips). */
const RECORD_VERSION = 2;
/** A finished journey whose offer is answered, as stored: what the tools write for a profile the tutorial leaves alone. */
export const TUTORIAL_FINISHED_RECORD = JSON.stringify({ v: RECORD_VERSION, garage: 'skipped', training: 'skipped', debrief: 'skipped',
  tour: 'skipped', offer: 'later' });

/** Keys that only a browser that has played holds (see the module comment). */
const PLAYED_KEYS = ['cot.profile.v2', 'cot.battle.hints.v2', 'cot.battle.hints.v1'] as const;

type RecordStorage = Pick<Storage, 'getItem' | 'setItem'>;

function storageOf(storage?: RecordStorage | null): RecordStorage | null {
  if (storage !== undefined) return storage;
  try { return typeof localStorage === 'undefined' ? null : localStorage; } catch { return null; }
}

/** What is stored: the journey's record, a record from before it (272), or none (or storage refused). */
function readStored(storage?: RecordStorage | null): { record: TutorialRecord; legacy: boolean } | null {
  const store = storageOf(storage);
  if (!store) return null;
  try {
    const raw = store.getItem(TUTORIAL_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (parsed?.v !== RECORD_VERSION) return { record: {}, legacy: true };
    const record: TutorialRecord = {};
    for (const chapter of TUTORIAL_CHAPTERS) {
      const value = parsed[chapter];
      if (value === 'done' || value === 'skipped') record[chapter] = value;
    }
    if (parsed.offer === 'start' || parsed.offer === 'later') record.offer = parsed.offer;
    return { record, legacy: false };
  } catch { return null; }
}

/** The journey's record, or null when this browser has none of its own (none at all, 272's, or storage refused). */
export function readTutorialRecord(storage?: RecordStorage | null): TutorialRecord | null {
  const stored = readStored(storage);
  return stored && !stored.legacy ? stored.record : null;
}

function writeRecord(record: TutorialRecord, storage?: RecordStorage | null): void {
  try { storageOf(storage)?.setItem(TUTORIAL_STORAGE_KEY, JSON.stringify({ v: RECORD_VERSION, ...record })); } catch { /* the record lasts this page */ }
}

/** True when this browser holds a sign of play from before the tutorial existed. */
export function hasPlayedBefore(storage?: RecordStorage | null): boolean {
  const store = storageOf(storage);
  if (!store) return true; // no storage: never show a tutorial we could not remember finishing
  try { return PLAYED_KEYS.some((key) => store.getItem(key) != null); } catch { return true; }
}

/** The chapter is still to show. The garage: a new player's, or a replay's (an empty record), until recorded. The training
 *  battle, its debrief and the tour run whenever the journey brings them (the training battle exists only for the
 *  tutorial, so its rollout is the journey's ask; the record keeps their outcomes). The offer: a returning player's, or
 *  272's record, until it is answered (any journey record means it was answered, replayed or started). */
export function tutorialChapterDue(chapter: TutorialChapter, storage?: RecordStorage | null): boolean {
  if (chapter === 'training' || chapter === 'debrief' || chapter === 'tour') return true;
  if (!storageOf(storage)) return false; // no storage: never a tutorial (or an offer) it could not remember answering
  const stored = readStored(storage);
  const record = stored && !stored.legacy ? stored.record : null;
  if (chapter === 'offer') return !record && (stored?.legacy === true || hasPlayedBefore(storage));
  if (!record) return !stored && !hasPlayedBefore(storage);
  return record.garage === undefined;
}

/** Record one chapter's outcome; Skip passes 'skipped' for every chapter still pending. */
export function markTutorialChapter(chapter: RecordedChapter | 'all', outcome: TutorialOutcome, storage?: RecordStorage | null): void {
  const record = readTutorialRecord(storage) ?? {};
  for (const name of chapter === 'all' ? TUTORIAL_CHAPTERS : [chapter]) if (record[name] === undefined || chapter !== 'all') record[name] = outcome;
  writeRecord(record, storage);
}

/** Record the offer's answer (274): it never shows again. Start keeps the journey ahead (the Garage chapter recorded done:
 *  the training battle launches at once); Not now records the journey skipped. */
export function answerTutorialOffer(answer: TutorialOfferAnswer, storage?: RecordStorage | null): void {
  writeRecord(answer === 'start' ? { offer: answer, garage: 'done' }
    : { offer: answer, garage: 'skipped', training: 'skipped', debrief: 'skipped', tour: 'skipped' }, storage);
}

/** Replay: every chapter pending again (an empty journey record, which is not "no record": it never asks about past play). */
export function resetTutorialRecord(storage?: RecordStorage | null): void {
  const offer = readTutorialRecord(storage)?.offer;
  writeRecord(offer ? { offer } : {}, storage);
}

/** Something could still run on the boot's Garage (the Garage chapter, or the offer): the boot loads the tutorial's access
 *  (app/tutorialAccess.ts) only then. */
export function tutorialMayRun(storage?: RecordStorage | null): boolean {
  return TUTORIAL_ON && (tutorialChapterDue('garage', storage) || tutorialChapterDue('offer', storage));
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
