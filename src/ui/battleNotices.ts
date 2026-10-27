// The battle's own toasts beside its centre alerts (UI-LOCKDOWN B14): one region of the kit's notices under the battle's
// detection and alert (battleHudLayout.ts --hud-battle-notices-top), where the pointer lock's notice and the network's
// banner each stood fixed at the centre top, over the objective and each other. One shows at a time, the higher priority
// first (the network's), the other waiting in the kit's queue: two stacked reached the resting sight at 1024x600, under
// the centre's two rows. The kit (components/notice.ts) loads on the first one, so a boot module that may raise one gains
// a few bytes, never the kit; the killcam's veil hides the region (battleHudLayout.css body.cot-kc-live).
// Copyright © 2026 Kevin B. Liu.
import type { ToastOptions } from './components/notice.ts';

/** The battle region's name. */
const REGION = 'battle';

/** A battle toast: the kit's, in the battle's region. */
type BattleNoticeOptions = Omit<ToastOptions, 'region'>;

/** Where a battle surface raises its toasts (the kit's region by default; a receipt passes its own). */
export interface BattleNoticePort {
  /** Shows a toast, or updates the one with its id. */
  show(options: BattleNoticeOptions): void;
  /** Dismisses a toast by its id, wherever it shows or waits. */
  dismiss(id: string): void;
}

let kit: Promise<typeof import('./components/notice.ts')> | null = null;

// (the HUD's lanes make room under a shown toast, battleHudLayout.ts: told when one comes, and when one has gone, after
// the kit's 200 ms exit)
const relayout = (): void => { window.dispatchEvent(new Event('cot-hud-relayout')); };

function loadKit(): Promise<typeof import('./components/notice.ts')> {
  kit ??= import('./components/notice.ts').then((module) => {
    module.noticeRegion(REGION, { placement: 'top', className: 'cot-battle-notices', limit: 1 });
    return module;
  });
  return kit;
}

export const battleNotices: BattleNoticePort = {
  show(options) {
    void loadKit().then((module) => { module.notify({ ...options, region: REGION }); relayout(); }, () => {});
  },
  // (nothing to do before the kit has loaded: no toast was raised)
  dismiss(id) {
    if (kit) void kit.then((module) => { module.dismissNotice(id); setTimeout(relayout, 220); }, () => {});
  },
};
