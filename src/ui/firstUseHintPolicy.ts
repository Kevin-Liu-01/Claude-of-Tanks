/**
 * firstUseHintPolicy.ts — when a first-use hint may show (owner 2026-11-20, mobile-hud-274: "esp stuff like the module
 * damage thats so good. make sure it properly is taken into account with other ui stuff like our existing
 * notifications"). Copyright © 2026 Kevin B. Liu.
 *
 * DOM-free and deterministic: the runtime (firstUseHints.ts) offers hints as the battle meets them and steps this with a
 * snapshot of the battle; this answers what to show and what to withdraw. The rules:
 * - one hint on screen at a time; the rest wait in a queue, the most urgent first, then the oldest;
 * - none in the first START_DELAY_MS after the rollout, and HINT_GAP_MS between one and the next;
 * - none while scoped, after the player's death, in the kill-cam, under the tutorial's card, in a battle the tutorial
 *   teaches, in a watched, couch or spectated battle, or with hints turned off;
 * - combat first: none while a combat notice (a detection, an alert, a fresh hit or kill row) is up, and a combat notice
 *   (or any gate) that comes while a hint shows withdraws it: back to the queue's head, unless it had shown MIN_SEEN_MS,
 *   which counts as seen;
 * - each hint once: a seen hint is never offered again, and at most MAX_PER_BATTLE show in one battle.
 */

interface HintPolicyOptions {
  readonly seen: ReadonlySet<string>;
  readonly startDelayMs?: number;
  readonly gapMs?: number;
  readonly minSeenMs?: number;
  readonly maxPerBattle?: number;
}

/** The battle as the policy needs it, read by the runtime at each step. */
interface HintSnapshot {
  readonly now: number;
  /** A gate is closed: scoped, dead, kill-cam, tutorial card or battle, watched, hints off. */
  readonly blocked: boolean;
  /** A combat notice is up. */
  readonly combat: boolean;
}

interface HintStep {
  /** Show this hint now (the runtime raises it and calls shown). */
  readonly show: string | null;
  /** Take this hint down now; `seen` says whether it counts as seen. */
  readonly withdraw: { readonly id: string; readonly seen: boolean } | null;
}

export const START_DELAY_MS = 10_000;
export const HINT_GAP_MS = 2_000;
export const MIN_SEEN_MS = 4_000;
export const MAX_PER_BATTLE = 2;

interface Queued { readonly id: string; readonly urgency: number; readonly at: number }

export function createHintPolicy(options: HintPolicyOptions) {
  const seen = new Set(options.seen);
  const startDelay = options.startDelayMs ?? START_DELAY_MS;
  const gap = options.gapMs ?? HINT_GAP_MS;
  const minSeen = options.minSeenMs ?? MIN_SEEN_MS;
  const maxPerBattle = options.maxPerBattle ?? MAX_PER_BATTLE;
  let queue: Queued[] = [];
  let showing: { id: string; since: number } | null = null;
  let rolloutAt: number | null = null;
  let lastEndAt = -Infinity;
  let shownThisBattle = 0;

  const sortQueue = () => queue.sort((a, b) => a.urgency - b.urgency || a.at - b.at);
  const end = (now: number, id: string, counted: boolean) => {
    showing = null;
    lastEndAt = now;
    if (counted) seen.add(id);
  };

  return {
    /** A battle the player drives rolled out: the per-battle count and the queue start over. */
    battleStart(now: number): void {
      queue = [];
      showing = null;
      rolloutAt = now;
      lastEndAt = -Infinity;
      shownThisBattle = 0;
    },
    /** The battle is over (or left): nothing waits into the next. */
    battleEnd(): void { queue = []; showing = null; rolloutAt = null; },
    /** The battle met a hint's moment: it waits its turn, unless seen, waiting or showing already. */
    offer(id: string, urgency: number, now: number): boolean {
      if (rolloutAt === null || seen.has(id) || showing?.id === id || queue.some((q) => q.id === id)) return false;
      queue.push({ id, urgency, at: now });
      sortQueue();
      return true;
    },
    /** The shown hint closed by its time or the player's close: seen. */
    closed(id: string, now: number): void { if (showing?.id === id) end(now, id, true); },
    step(snapshot: HintSnapshot): HintStep {
      const { now } = snapshot;
      if (showing) {
        if (!snapshot.blocked && !snapshot.combat) return { show: null, withdraw: null };
        const { id, since } = showing;
        const counted = now - since >= minSeen;
        end(now, id, counted);
        if (!counted) { queue.unshift({ id, urgency: -Infinity, at: since }); }
        return { show: null, withdraw: { id, seen: counted } };
      }
      if (rolloutAt === null || !queue.length || snapshot.blocked || snapshot.combat) return { show: null, withdraw: null };
      if (now < rolloutAt + startDelay || now < lastEndAt + gap || shownThisBattle >= maxPerBattle) return { show: null, withdraw: null };
      const next = queue.shift()!;
      showing = { id: next.id, since: now };
      // (a hint withdrawn before it was seen comes back without spending the battle's count a second time)
      if (next.urgency !== -Infinity) shownThisBattle++;
      return { show: next.id, withdraw: null };
    },
    /** For the runtime's timer: whether anything is showing or waiting. */
    busy(): boolean { return !!showing || queue.length > 0; },
    hasSeen(id: string): boolean { return seen.has(id); },
    showingId(): string | null { return showing?.id ?? null; },
  };
}

export type HintPolicy = ReturnType<typeof createHintPolicy>;
