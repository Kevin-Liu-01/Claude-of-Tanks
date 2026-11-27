// The battle notices' event lane (notices-audit-275; battleNotices.ts is the owner and holds the ladder): what just
// happened, briefly, in the planners' alert seat on the window's centre line. Copyright © 2026 Kevin B. Liu.
//
// Before, hud.ts drew its own band (.cot-alert, its words, glyph and count in markup of its own) on a private queue with
// its own severity order. Now an event is the kit's notice (components/notice.ts noticeContentHtml: its glyph, its words,
// a quieter detail line, its count) on the kit's queue, raised at NOTICE_PRIORITY's rung, its keys on keyPrompt.ts's
// "[KEY] text" line. The seat keeps its name, .cot-alert with .show while one shows, because the notice planners, the HUD
// editor, the couch panes and the layout probes place and read it by that name.
//
// The rules (Kevin approved, 2026-11-21):
// - one event shows at a time; a higher rung takes the seat and the displaced one waits; one that waited past
//   EVENT_STALE_MS is dropped (the battle has moved on); each shows EVENT_HOLD_MS; the game's pause holds the time;
// - a repeat while it shows counts on it ("×3") and restarts its time; a repeat inside EVENT_HELD_MS of the last is a
//   held input, not a repeat (a trigger held on an empty gun raised it every tick: "×60" a second);
// - an `answered` or `ambient` event raised again inside EVENT_COOLDOWN_MS of leaving is dropped (denial spam), unless
//   it has a slot (a toggle's answer always answers);
// - while scoped nothing under `threat` interrupts: under `turned` is dropped, `turned` waits (the latest one) and shows
//   when the scope drops if it is under SCOPE_DEFER_MS old;
// - a slot keeps one event per slot, the newer state replacing the older in place (273: the armour overlay's OFF
//   outliving the ON pressed a moment after it);
// - "A · B" words show A as the line and B as its detail; an event with keys shows its key line as the detail instead;
// - (notices-276b) every event names its kind (noticeKinds.ts), and while the crew looks
//   through another view (view()) a tank kind is held, the latest of each, and shown when the view returns to the tank if
//   it is under VIEW_HOLD_MS old; a tank event showing as the view changes is taken down and held with them.
import type { ActionId } from '../game/input.ts';
import { currentBattleScope, type BattleScope } from '../game/battleScope.ts';
import { NOTICE_PRIORITY } from './battleNotices.ts';
import { NoticeQueue, noticeContentHtml, type QueuedToast } from './components/notice.ts';
import { markDatum } from './dom.ts';
import type { IconId } from './icons/icon.ts';
import type { NoticeArtId } from './components/noticeArt.ts';
import { noticeKind, shownInView, VIEW_HOLD_MS, type NoticeKind, type NoticeView } from './noticeKinds.ts';

type EventSeverity = 'info' | 'success' | 'warning' | 'error';

/** The bus event a module outside the HUD raises an event with (its payload a BattleEvent): every HUD hears it on its own
 *  bus (a couch pane's seat bus too) and raises it on its lane. */
export const BATTLE_EVENT = 'ui:battleEvent';

export interface BattleEvent {
  /** What it is (noticeKinds.ts): its subject and its shape. */
  readonly kind: NoticeKind;
  /** The words (catalog text); "A · B" shows B as the detail line. */
  readonly text: string;
  /** NOTICE_PRIORITY's rung. */
  readonly priority: number;
  readonly severity?: EventSeverity;
  readonly icon?: IconId;
  /** The kind's picture in the notice's empty side (components/noticeArt.ts; the kinds Kevin and Main ruled on 2026-11-23). */
  readonly art?: NoticeArtId;
  /** One event per slot: a newer one replaces it in place, and never cools down. */
  readonly slot?: string;
  /** A key line for the detail (keyPrompt.ts "[KEY] text"), drawn when it shows and again when the keys change. */
  readonly keys?: { readonly line: string; readonly actions: Readonly<Record<string, ActionId>>; readonly vars?: Readonly<Record<string, string | number>> };
}

interface EventLaneHost {
  /** The HUD's root, where the seat mounts, and its document (a couch pane's own). */
  readonly root: HTMLElement;
  readonly doc: Pick<Document, 'createElement'>;
  /** A catalog line's keys as markup (keyPrompt.ts formatKeyLineWith on the HUD's caps). */
  keyLine(line: string, actions: Readonly<Record<string, ActionId>>, vars?: Readonly<Record<string, string | number>>): string;
  readonly now?: () => number;
}

/** How long an event shows (ms). */
export const EVENT_HOLD_MS = 2400;
/** A waiting event older than this is dropped rather than shown late (ms). */
export const EVENT_STALE_MS = 3000;
/** A low-rung event raised again this soon after it left is dropped (ms). */
export const EVENT_COOLDOWN_MS = 4000;
/** A repeat this soon after the last raise of the same words is the same held input (ms). */
export const EVENT_HELD_MS = 250;
/** A `turned` event held behind the scope is shown when it drops, if it is younger than this (ms). */
export const SCOPE_DEFER_MS = 6000;

export function createBattleEventLane(host: EventLaneHost) {
  const now = host.now ?? (() => performance.now());
  const el = host.doc.createElement('div');
  el.className = 'cot-alert';
  markDatum(el, 'notices');
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.dataset.severity = 'warning';
  host.root.append(el);
  /** The seat's role while nothing shows (blank() puts it back after an alert). */
  const idleRole = el.getAttribute('role') ?? '';

  const events = new Map<string, BattleEvent>();
  const born = new Map<string, number>();
  const lastRaise = new Map<string, number>();
  const leftAt = new Map<string, number>();
  let serial = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let scoped = false;
  let deferred: { event: BattleEvent; at: number } | null = null;
  let view: NoticeView = 'tank';
  /** The tank events held behind a view: the latest of each (by its slot, else its words), with when it was raised. */
  const held = new Map<string, { event: BattleEvent; at: number }>();

  const keyOf = (event: BattleEvent): string => `${event.severity ?? 'warning'}|${event.text}`;

  function paint(toast: QueuedToast): void {
    const event = events.get(toast.id);
    if (!event) return;
    const severity = event.severity ?? 'warning';
    const [line, ...rest] = event.text.split(' · ');
    const keys = event.keys ? host.keyLine(event.keys.line, event.keys.actions, event.keys.vars) : '';
    // (a compact seat reads as its glyph: the words in the live region and in the hover tip)
    el.dataset.tip = event.text;
    el.innerHTML = noticeContentHtml({
      severity, icon: severity === 'error' ? 'alert' : event.icon ?? 'info', text: line, art: event.art,
      detailHtml: keys || undefined, detail: keys ? undefined : rest.join(' · ') || undefined,
    }) + (toast.count > 1 ? `<span class="cot-c-notice__count num">×${toast.count}</span>` : '');
    el.dataset.severity = severity;
    el.setAttribute('role', severity === 'error' ? 'alert' : 'status');
    el.classList.add('show');
  }

  const queue = new NoticeQueue(1, now, {
    show: paint,
    update: paint,
    hide: (toast) => {
      el.classList.remove('show');
      const event = events.get(toast.id);
      if (event) leftAt.set(keyOf(event), now());
      // (a displaced event waits again: its staleness counts from now, not from when it was raised)
      born.set(toast.id, now());
    },
  });

  /** (life-reset-279) The seat as a fresh lane holds it when nothing shows: no words, tip, error severity or alert role
   *  (an emptied lane kept the last event's, and a revived crew's seat read "AMMUNITION TYPE EMPTY" as its tip). */
  function blank(): void {
    if (queue.shown.length) return;
    el.classList.remove('show');
    el.innerHTML = '';
    delete el.dataset.tip;
    el.dataset.severity = 'warning';
    el.setAttribute('role', idleRole);
  }
  /** The seat's own events (its tank's and its crew's), which end with its life; the battle's and the link's stay. */
  const ownEvent = (event: BattleEvent | undefined): boolean => {
    const subject = event ? noticeKind(event.kind).subject : null;
    return subject === 'tank' || subject === 'crew';
  };

  function forget(id: string): void {
    queue.remove(id);
    events.delete(id);
    born.delete(id);
  }
  function dropStale(at: number): void {
    for (const toast of [...queue.waiting]) if (at - (born.get(toast.id) ?? at) > EVENT_STALE_MS) forget(toast.id);
  }
  function schedule(): void {
    if (timer) clearTimeout(timer);
    timer = null;
    const next = queue.nextDeadline();
    if (next === null) return;
    timer = setTimeout(() => {
      timer = null;
      dropStale(now());
      for (const id of queue.expired()) forget(id);
      schedule();
    }, Math.ceil(next));
  }

  // (battle-teardown-276) the events a battle raised go with it (game/battleScope.ts), however it is left: the lane empties
  // and looks through the tank again. An event raised outside a battle (a receipt, a preview) is the lane's alone.
  let adopted: BattleScope | null = null;
  function adoptScope(): void {
    const scope = currentBattleScope();
    if (!scope || scope === adopted) return;
    adopted = scope;
    scope.defer(() => {
      if (adopted !== scope) return;
      adopted = null;
      lane.clear();
      view = 'tank';
    });
  }

  const lane = {
    el,
    /** Raises an event (or counts a repeat, or replaces its slot's). */
    raise(event: BattleEvent): void {
      adoptScope();
      const at = now();
      if (!shownInView(event.kind, view)) { held.set(event.slot ?? keyOf(event), { event, at }); return; }
      if (scoped && event.priority < NOTICE_PRIORITY.threat) {
        if (event.priority >= NOTICE_PRIORITY.turned) deferred = { event, at };
        return;
      }
      const key = keyOf(event);
      const prior = lastRaise.get(key);
      lastRaise.set(key, at);
      if (prior !== undefined && at - prior < EVENT_HELD_MS) return;
      const live = [...queue.shown, ...queue.waiting].some((toast) => toast.options.dedupeKey === key);
      const left = leftAt.get(key);
      if (!event.slot && !live && event.priority <= NOTICE_PRIORITY.answered && left !== undefined && at - left < EVENT_COOLDOWN_MS) return;
      dropStale(at);
      const id = event.slot ? `event-${event.slot}` : `event-${++serial}`;
      const toast = queue.push(id, {
        text: event.text, severity: event.severity ?? 'warning', dedupeKey: key, priority: event.priority,
        durationMs: EVENT_HOLD_MS, dismissible: false,
      });
      events.set(toast.id, event);
      born.set(toast.id, at);
      if (queue.shown.includes(toast)) paint(toast);
      schedule();
    },
    /** The game's pause holds the time. */
    pause(on: boolean): void {
      queue.pause(on);
      schedule();
    },
    /** The scope came up or went down: a `turned` event held behind it shows now if it is still fresh. */
    scope(on: boolean): void {
      if (on === scoped) return;
      scoped = on;
      if (on || !deferred) return;
      const held = deferred;
      deferred = null;
      if (now() - held.at < SCOPE_DEFER_MS) this.raise(held.event);
    },
    /** What the crew looks through (noticeKinds.ts NoticeView): off the tank its own events are held (and a shown one taken
     *  down); back on it the held ones still fresh are raised. */
    view(next: NoticeView): void {
      if (next === view) return;
      view = next;
      const at = now();
      if (next !== 'tank') {
        for (const toast of [...queue.shown, ...queue.waiting]) {
          const event = events.get(toast.id);
          if (!event || shownInView(event.kind, next)) continue;
          held.set(event.slot ?? keyOf(event), { event, at: born.get(toast.id) ?? at });
          forget(toast.id);
          // (taken down by the view, not seen out: no cooldown when it returns)
          leftAt.delete(keyOf(event));
        }
        if (!queue.shown.length) el.classList.remove('show');
        schedule();
        return;
      }
      const back = [...held.values()].filter((entry) => at - entry.at < VIEW_HOLD_MS);
      held.clear();
      for (const entry of back) this.raise(entry.event);
    },
    /** The keys changed (a rebinding, another device): the shown event's key line is drawn again. */
    relabel(): void {
      const shown = queue.shown[0];
      if (shown && events.get(shown.id)?.keys) paint(shown);
    },
    /** Empties the lane (a battle's record starting over). */
    clear(): void {
      if (timer) clearTimeout(timer);
      timer = null;
      // (the waiting line first, so emptying the seat shows nothing from it)
      for (const toast of [...queue.waiting, ...queue.shown]) forget(toast.id);
      lastRaise.clear();
      leftAt.clear();
      deferred = null;
      held.clear();
      blank();
    },
    /** (life-reset-279) The seat's life ended (game/lifeScope.ts): its tank's and crew's events go with it, shown, waiting,
     *  held behind a view or deferred behind the scope, and their repeat and cooldown memory; the battle's stay. The lane
     *  looks through the tank again. */
    endLife(): void {
      for (const toast of [...queue.waiting, ...queue.shown]) if (ownEvent(events.get(toast.id))) forget(toast.id);
      for (const [key, entry] of held) if (ownEvent(entry.event)) held.delete(key);
      if (deferred && ownEvent(deferred.event)) deferred = null;
      lastRaise.clear();
      leftAt.clear();
      view = 'tank';
      blank();
      schedule();
    },
  };
  return lane;
}

export type BattleEventLane = ReturnType<typeof createBattleEventLane>;
