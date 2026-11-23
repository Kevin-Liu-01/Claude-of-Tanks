// The battle's notices: the one owner of every battle message in words (notices-audit-275, Kevin 2026-11-21: "look through
// our new notification system and look at possible notifications and decide what to do"). Copyright © 2026 Kevin B. Liu.
//
// Two lanes, one priority table (NOTICE_PRIORITY), one markup (the kit's notice, components/notice.ts, with
// keyPrompt.ts's "[KEY] text" line for keys):
// - the condition lane (this module): a state that holds until it stops being true, raised and dismissed by its owner:
//   the network's banner, an incoming strike, the parked gun limit or self-right, the pointer lock's notice, and the
//   first-use hints under them all. One region of the kit's notices under the battle's detection and alert
//   (battleHudLayout.ts --hud-battle-notices-top, the guidance plan's box), one shown at a time, the higher priority
//   first, the rest waiting in the kit's queue (UI-LOCKDOWN B14: two stacked reached the resting sight at 1024x600);
// - the event lane (battleNoticeEvents.ts): what just happened (an objective changing hands, a denial, a confirmation),
//   briefly, in the planners' alert seat on the centre line. Its own module, so the HUD (which has the kit already) owns
//   it per instance and a boot module that raises a condition gains a few bytes here, never the kit.
// The kit loads on the first condition; the killcam's veil hides the region (battleHudLayout.css body.cot-kc-live).
// The condition lane is the page's (one region, on the page's document): on a couch split screen only the page's own HUD
// raises conditions (its player's tank, the network, the pointer lock), never a pane's HUD, whose seat's state stays on its
// own surfaces (its reticle's chip, its own event lane). Per-pane regions are 275.1's.
// The game's pause holds both lanes' time (pause, from the HUD's ui:pause).
import { createLazyChunk } from '../app/lazyChunk.ts';
import type { ToastOptions } from './components/notice.ts';
import { markDatum } from './dom.ts';

/**
 * The ladder every battle notice is raised at, in both lanes (a higher one takes its lane; the displaced one waits):
 * - lost: the player cannot play (the network dropped or failed);
 * - threat: a threat to the tank or its gun, now (an incoming strike, a gun blocked or overturned, no rounds to fire);
 * - turned: the battle turned (a flag, a sector, a goal, a wave, a line, the ending's caption);
 * - answered: the player's own action answered (a denial, a confirmation the HUD shows nowhere else);
 * - ambient: the rest (the pointer lock, a reconnecting or migrating link, a cache dropped);
 * - teaching: the first-use hints, under everything and withdrawn by any combat notice (firstUseHintPolicy.ts).
 * While scoped only `threat` and above interrupt: an event under `turned` is dropped, a `turned` one waits for the scope
 * to drop (battleNoticeEvents.ts).
 */
export const NOTICE_PRIORITY = Object.freeze({ lost: 4, threat: 3, turned: 2, answered: 1, ambient: 0, teaching: -1 });

/** The battle region's name. */
const REGION = 'battle';

/** A battle condition: the kit's toast, in the battle's region. */
type BattleNoticeOptions = Omit<ToastOptions, 'region'>;

/** Where a battle surface raises its conditions (the kit's region by default; a receipt passes its own). */
export interface BattleNoticePort {
  /** Raises a condition, or updates the one with its id. */
  condition(options: BattleNoticeOptions): void;
  /** Takes a condition down by its id, wherever it shows or waits. */
  dismiss(id: string): void;
}

// (2026-11-02 audit R6) the kit under the one lazy-chunk policy (app/lazyChunk.ts): `??=` kept a failed import for the
// document, so after one failed notice chunk every later battle notice (the parked aim warnings, the pointer lock's
// prompt, the network's banner) was dropped; the next notice asks again
const kit = createLazyChunk(() => import('./components/notice.ts').then((module) => {
  module.noticeRegion(REGION, { placement: 'top', className: 'cot-battle-notices', limit: 1 });
  // (the battle's one place for its conditions, however many come and go: surfaceRegistry.ts toasts)
  const region = document.querySelector<HTMLElement>('.cot-c-notices.cot-battle-notices');
  if (region) markDatum(region, 'toasts');
  module.pauseNotices(paused);
  return module;
}));

// (the HUD's lanes make room under a shown notice, battleHudLayout.ts: told when one comes, and when one has gone, after
// the kit's exit)
const relayout = (): void => { window.dispatchEvent(new Event('cot-hud-relayout')); };
let paused = false;

export const battleNotices: BattleNoticePort & {
  /** The game's pause holds every condition's time (notices-audit-275: before, the pointer lock's notice and the hints ran
   *  out behind the pause menu). Never fetches the kit. */
  pause(on: boolean): void;
} = {
  condition(options) {
    void kit.load().then((module) => { module.notify({ ...options, region: REGION }); relayout(); }, () => {});
  },
  // (nothing to do before the kit has loaded or while it is failed: no notice was raised; a dismiss never fetches)
  dismiss(id) {
    if (kit.state === 'ready' || kit.state === 'loading') void kit.load().then((module) => { module.dismissNotice(id); setTimeout(relayout, 220); }, () => {});
  },
  pause(on) {
    paused = on;
    if (kit.state === 'ready') void kit.load().then((module) => module.pauseNotices(on), () => {});
  },
};
