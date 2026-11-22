/**
 * Couch mode's briefing (docs/COUCH-MODE.md "The briefing"; Kevin 2026-11-20: "the tutorial popup that happens in couch
 * mode is terrible. have it be centered in screen when i press start and go through a couple things then go!"). Start
 * opens one briefing for the whole room, centred over the screen: which seat is which pane, the phone's controls, and
 * how the seats take sides. The host steps it with Enter or Space; each phone marks its seat ready, or skips (ready too,
 * and the screen goes to the last step); GO deploys, as does every seat being ready. Pure and Node-runnable: the
 * overlay (src/ui/couchBriefing.ts) and the phones' readout (padReceiver.ts, the status's `b`) read this.
 */

/** The briefing's steps, in order. */
export const COUCH_BRIEF_STEPS = ['seats', 'phone', 'sides'] as const;
export type CouchBriefStep = (typeof COUCH_BRIEF_STEPS)[number];

/** What a press did: moved the briefing on, deployed it, or nothing (a stranger's ready, a step past the end). */
export type CouchBriefOutcome = 'step' | 'go' | 'none';

export interface CouchBriefing {
  readonly seats: readonly number[];
  readonly step: number;
  readonly steps: number;
  readonly stepId: CouchBriefStep;
  isReady(seat: number): boolean;
  /** Every seat in play is ready. */
  readonly allReady: boolean;
  /** The host's Next (Enter, Space): the next step, or GO from the last. */
  next(): CouchBriefOutcome;
  back(): boolean;
  /** GO: the briefing is over (once). */
  go(): CouchBriefOutcome;
  /** A phone's Ready, or its Skip (ready too, and the screen goes to the last step). GO once every seat is ready. */
  ready(seat: number, skip?: boolean): CouchBriefOutcome;
  /** It deployed: nothing moves it again. */
  readonly done: boolean;
}

export function createCouchBriefing(seats: readonly number[]): CouchBriefing {
  const inPlay = Object.freeze([...seats]);
  const ready = new Set<number>();
  const last = COUCH_BRIEF_STEPS.length - 1;
  let step = 0;
  let done = false;
  const go = (): CouchBriefOutcome => {
    if (done) return 'none';
    done = true;
    return 'go';
  };
  const briefing: CouchBriefing = {
    seats: inPlay,
    get step() { return step; },
    steps: COUCH_BRIEF_STEPS.length,
    get stepId() { return COUCH_BRIEF_STEPS[step]!; },
    isReady: (seat) => ready.has(seat),
    get allReady() { return inPlay.length > 0 && inPlay.every((seat) => ready.has(seat)); },
    get done() { return done; },
    next() {
      if (done) return 'none';
      if (step < last) { step++; return 'step'; }
      return go();
    },
    back() {
      if (done || step === 0) return false;
      step--;
      return true;
    },
    go,
    ready(seat, skip = false) {
      if (done || !inPlay.includes(seat)) return 'none';
      ready.add(seat);
      if (skip) step = last;
      return briefing.allReady ? go() : 'step';
    },
  };
  return briefing;
}

/** A seat's view of the briefing on its phone (the status's `b`): the step, how many, and whether this seat is ready. */
export interface CouchBriefSeatView {
  s: number;
  n: number;
  r: boolean;
}

export function couchBriefSeatView(briefing: CouchBriefing | null, seat: number): CouchBriefSeatView | undefined {
  if (!briefing || briefing.done || !briefing.seats.includes(seat)) return undefined;
  return { s: briefing.step, n: briefing.steps, r: briefing.isReady(seat) };
}
