// The kit's notifications (owner 2026-10-25: "make notifications a lot better...stop using the box with one border
// colored... make much better primitives for stuff like this and more covering all edge cases"). Copyright © 2026
// Kevin B. Liu.
//
// One family. The severity is the glyph's tone and a faint wash, never a coloured stripe:
// - notice(): an inline notice in the flow (a form's refusal, a panel's warning), static markup;
// - banner(): the same notice across its container (offline, a version refusal);
// - notify(): a toast in a placed region. It is queued per region (a stacking limit, then a waiting line by priority),
//   deduplicated (a repeat raises its "×3" and restarts its time), pre-empting (a higher priority displaces the lowest
//   one shown, which waits again), timed by severity (an error and a progress stay), its time held while the pointer or
//   focus is on it, while the page is hidden and while the game is paused (pauseNotices), dismissible (its close
//   control, Escape), with actions, a progress figure and a retry that runs through progress to success or the error
//   again. A prompt is a toast with focus: its first action takes the focus, which returns when it closes.
// - noticeRegion() places a region: fixed overlays for the menus and the site (never moving the page; a phone's tab bar
//   keeps the bottom), or a host's own band ('host': the HUD's planners place their bands).
// - watchConnectivity() keeps one offline notice while the browser is offline.
// Live regions: a region is polite and an error is an alert (assertive). Reduced motion keeps only the fade.
//
// The queue (NoticeQueue) is plain state on an injected clock, so the receipt drives it in Node; the DOM layer below
// draws what it decides. The catalog gives the two control names (Dismiss, Retry); every text is the caller's.
import { icon, type IconId } from '../icons/icon.ts';
import { t } from '../i18n.ts';
import { attrs, esc, type Attrs } from './escape.ts';

export type NoticeSeverity = 'info' | 'success' | 'warning' | 'error' | 'progress';

/** Each severity's glyph (its tone comes from notices.css). */
const GLYPH: Readonly<Record<NoticeSeverity, IconId>> = { info: 'info', success: 'check', warning: 'lampWarn', error: 'alert', progress: 'clock' };
/** How long a toast stays by severity, in ms; null: until it is dismissed (an error, a progress). */
const DURATION: Readonly<Record<NoticeSeverity, number | null>> = { info: 4500, success: 4500, warning: 7000, error: null, progress: null };

interface NoticeContent {
  readonly severity?: NoticeSeverity;
  /** The one line that says what happened. */
  readonly text: string;
  /** A second, quieter line (a reason, a count); keep it short: explanations belong in tips. */
  readonly detail?: string;
  /** A glyph in place of the severity's own. */
  readonly icon?: IconId;
  readonly className?: string;
}

interface StaticAction {
  readonly label: string;
  readonly primary?: boolean;
  readonly attrs?: Attrs;
}

function content(options: NoticeContent): string {
  const severity = options.severity ?? 'info';
  return `<span class="cot-c-notice__glyph">${icon(options.icon ?? GLYPH[severity], { size: 20 })}</span>`
    + `<span class="cot-c-notice__body"><span class="cot-c-notice__text">${esc(options.text)}</span>`
    + `${options.detail ? `<span class="cot-c-notice__detail">${esc(options.detail)}</span>` : ''}</span>`;
}

function actionButton(label: string, primary: boolean | undefined, extra?: Attrs): string {
  return `<button type="button" class="cot-c-btn cot-c-btn--36${primary ? ' cot-c-btn--primary' : ''}" data-ui-sound="press"`
    + `${attrs(extra)}>${esc(label)}</button>`;
}

/**
 * An inline notice in the flow. An error is an alert and any other severity a status, so inserting one announces it;
 * pass live: false for one that is there when the view opens. Its actions carry the caller's attributes.
 */
export function notice(options: NoticeContent & { readonly actions?: readonly StaticAction[]; readonly live?: boolean }): string {
  const severity = options.severity ?? 'info';
  const role = options.live === false ? '' : severity === 'error' ? ' role="alert"' : ' role="status"';
  const acts = options.actions?.length
    ? `<span class="cot-c-notice__acts">${options.actions.map((a) => actionButton(a.label, a.primary, a.attrs)).join('')}</span>` : '';
  return `<div class="cot-c-notice${options.className ? ` ${options.className}` : ''}" data-severity="${severity}"${role}>`
    + `${content(options)}${acts}</div>`;
}

/** A notice across its container's width (offline, a version refusal). */
export function banner(options: Parameters<typeof notice>[0]): string {
  return notice({ ...options, className: `cot-c-notice--banner${options.className ? ` ${options.className}` : ''}` });
}

/* ------------------------------------------------------------------------------------------------- the queue */

export interface NoticeAction {
  readonly label: string;
  readonly primary?: boolean;
  readonly run: () => void;
  /** Keep the toast after the action (default: an action closes it). */
  readonly keep?: boolean;
}

export interface ToastOptions extends NoticeContent {
  /** A stable id: a second notify with it updates the toast in place. */
  readonly id?: string;
  /** Repeats with this key coalesce into one toast: its count rises ("×3") and its time restarts. */
  readonly dedupeKey?: string;
  /** 0 by default; when a region is full, a higher priority displaces the lowest one shown (which waits again). */
  readonly priority?: number;
  /** ms; null keeps it until dismissed; default by severity. */
  readonly durationMs?: number | null;
  /** A close control and Escape (default true; a progress is not dismissible unless it says so). */
  readonly dismissible?: boolean;
  readonly actions?: readonly NoticeAction[];
  /** 0-1: a progress figure beside the text. */
  readonly progress?: number;
  /** A placed region's name (default 'menu', placed at the bottom on first use). */
  readonly region?: string;
  /** A prompt the player asked for: its first action takes the focus, which returns when it closes. */
  readonly focus?: boolean;
  /** An error the player can retry: a Retry action runs this, through progress, to success or the error again. */
  readonly retry?: () => Promise<unknown>;
}

export interface QueuedToast {
  readonly id: string;
  options: ToastOptions;
  count: number;
  /** The time left (ms), or null for one that stays. */
  remaining: number | null;
  /** When its time last started running, or null while held. */
  runningSince: number | null;
  held: boolean;
}

/** The severity's default time, or the toast's own. */
export function toastDuration(options: ToastOptions): number | null {
  return options.durationMs === undefined ? DURATION[options.severity ?? 'info'] : options.durationMs;
}

/**
 * One region's line: at most `limit` shown, the rest waiting by priority (then arrival). Plain state on an injected
 * clock; the DOM layer calls show/hide for what it decides and expire() when a toast's time runs out.
 */
export class NoticeQueue {
  readonly shown: QueuedToast[] = [];
  readonly waiting: QueuedToast[] = [];
  limit: number;
  private paused = false;
  private readonly now: () => number;
  private readonly hooks: { show(toast: QueuedToast): void; hide(toast: QueuedToast): void; update(toast: QueuedToast): void };
  constructor(limit: number, now: () => number,
    hooks: { show(toast: QueuedToast): void; hide(toast: QueuedToast): void; update(toast: QueuedToast): void }) {
    this.limit = limit;
    this.now = now;
    this.hooks = hooks;
  }

  private find(id: string): QueuedToast | undefined {
    return this.shown.find((toast) => toast.id === id) ?? this.waiting.find((toast) => toast.id === id);
  }

  /** Add or update; returns the toast's id. */
  push(id: string, options: ToastOptions): QueuedToast {
    const byKey = options.dedupeKey ? [...this.shown, ...this.waiting].find((toast) => toast.options.dedupeKey === options.dedupeKey) : undefined;
    const existing = this.find(id) ?? byKey;
    if (existing) {
      if (byKey === existing && existing.id !== id) existing.count += 1;
      existing.options = { ...existing.options, ...options };
      this.restart(existing);
      if (this.shown.includes(existing)) this.hooks.update(existing);
      return existing;
    }
    const toast: QueuedToast = { id, options, count: 1, remaining: toastDuration(options), runningSince: null, held: false };
    if (this.shown.length < this.limit) this.display(toast);
    else {
      const lowest = [...this.shown].filter((shown) => !shown.held).sort((a, b) => this.rank(a) - this.rank(b))[0];
      if (lowest && (lowest.options.priority ?? 0) < (options.priority ?? 0)) {
        this.withdraw(lowest);
        this.wait(lowest);
        this.display(toast);
      } else this.wait(toast);
    }
    return toast;
  }

  /** Change a shown or waiting toast's options; its time restarts when its duration or text changes. */
  update(id: string, change: Partial<ToastOptions>): void {
    const toast = this.find(id);
    if (!toast) return;
    toast.options = { ...toast.options, ...change };
    this.restart(toast);
    if (this.shown.includes(toast)) this.hooks.update(toast);
  }

  /** Remove a toast (dismissed, acted on or expired) and show the next one waiting. */
  remove(id: string): void {
    const toast = this.find(id);
    if (!toast) return;
    const wasShown = this.shown.includes(toast);
    this.withdraw(toast);
    const at = this.waiting.indexOf(toast);
    if (at >= 0) this.waiting.splice(at, 1);
    if (wasShown) this.fill();
  }

  /** The pointer or focus is on it (held), or not. */
  hold(id: string, held: boolean): void {
    const toast = this.find(id);
    if (!toast || toast.held === held) return;
    toast.held = held;
    this.sync(toast);
  }

  /** The game's pause or a hidden page holds every toast's time. */
  pause(paused: boolean): void {
    this.paused = paused;
    for (const toast of this.shown) this.sync(toast);
  }

  /** The toasts whose time has run out (the DOM layer removes them). */
  expired(): string[] {
    const now = this.now();
    return this.shown.filter((toast) => toast.remaining !== null && toast.runningSince !== null
      && now - toast.runningSince >= toast.remaining).map((toast) => toast.id);
  }

  /** The ms until the next toast's time runs out, or null when none is running. */
  nextDeadline(): number | null {
    const now = this.now();
    let next: number | null = null;
    for (const toast of this.shown) {
      if (toast.remaining === null || toast.runningSince === null) continue;
      const left = Math.max(0, toast.remaining - (now - toast.runningSince));
      next = next === null ? left : Math.min(next, left);
    }
    return next;
  }

  /** Lower first: the lowest priority, then the oldest shown (the one a higher priority displaces). */
  private rank(toast: QueuedToast): number { return (toast.options.priority ?? 0) * 1e6 + this.shown.indexOf(toast); }

  private display(toast: QueuedToast): void {
    this.shown.push(toast);
    this.hooks.show(toast);
    this.sync(toast);
  }

  private withdraw(toast: QueuedToast): void {
    const at = this.shown.indexOf(toast);
    if (at < 0) return;
    this.shown.splice(at, 1);
    toast.runningSince = null;
    this.hooks.hide(toast);
  }

  private wait(toast: QueuedToast): void {
    const priority = toast.options.priority ?? 0;
    const at = this.waiting.findIndex((other) => (other.options.priority ?? 0) < priority);
    if (at < 0) this.waiting.push(toast); else this.waiting.splice(at, 0, toast);
  }

  private fill(): void {
    while (this.shown.length < this.limit && this.waiting.length) this.display(this.waiting.shift()!);
  }

  private restart(toast: QueuedToast): void {
    toast.remaining = toastDuration(toast.options);
    toast.runningSince = null;
    this.sync(toast);
  }

  private sync(toast: QueuedToast): void {
    if (!this.shown.includes(toast)) return;
    const holding = this.paused || toast.held;
    if (holding && toast.runningSince !== null) {
      if (toast.remaining !== null) toast.remaining = Math.max(0, toast.remaining - (this.now() - toast.runningSince));
      toast.runningSince = null;
    } else if (!holding && toast.runningSince === null && toast.remaining !== null) {
      toast.runningSince = this.now();
    }
  }
}

/* ------------------------------------------------------------------------------------------------ the DOM layer */

type Placement = 'bottom' | 'bottom-end' | 'top' | 'top-end' | 'host';
interface RegionOptions {
  /** Where its overlay sits; 'host' leaves it to its host (the HUD's planners place their bands). */
  readonly placement?: Placement;
  /** The element it lives in (default the body). */
  readonly host?: HTMLElement;
  /** How many show at once (default 3). */
  readonly limit?: number;
  readonly className?: string;
}

interface Region { readonly el: HTMLElement; readonly queue: NoticeQueue; timer: ReturnType<typeof setTimeout> | null }
const regions = new Map<string, Region>();
const elements = new Map<string, HTMLElement>();
const returnFocus = new Map<string, HTMLElement | null>();
let serial = 0;
let gamePaused = false;
let watchingVisibility = false;
const canDraw = (): boolean => typeof document !== 'undefined' && typeof document.createElement === 'function';
const clock = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());
const pageHidden = (): boolean => typeof document !== 'undefined' && document.visibilityState === 'hidden';

function schedule(region: Region): void {
  if (region.timer !== null) clearTimeout(region.timer);
  region.timer = null;
  const next = region.queue.nextDeadline();
  if (next === null) return;
  region.timer = setTimeout(() => {
    region.timer = null;
    for (const id of region.queue.expired()) region.queue.remove(id);
    schedule(region);
  }, next + 16);
}

function render(region: Region, toast: QueuedToast, el: HTMLElement): void {
  const o = toast.options;
  const severity = o.severity ?? 'info';
  el.className = `cot-c-notice cot-c-notice--toast${o.className ? ` ${o.className}` : ''}`;
  el.dataset.severity = severity;
  if (severity === 'error') el.setAttribute('role', 'alert'); else el.removeAttribute('role');
  const count = toast.count > 1 ? `<span class="cot-c-notice__count num">×${toast.count}</span>` : '';
  const progress = o.progress !== undefined && severity === 'progress'
    ? `<span class="cot-c-notice__count num">${Math.round(Math.min(1, Math.max(0, o.progress)) * 100)}%</span>` : '';
  const actions: NoticeAction[] = [...(o.actions ?? [])];
  if (o.retry && severity === 'error') actions.push({ label: t('notice.retry'), primary: true, keep: true, run: () => retry(toast.id, o) });
  const acts = actions.length
    ? `<span class="cot-c-notice__acts">${actions.map((a, i) => actionButton(a.label, a.primary, { 'data-notice-action': i })).join('')}</span>` : '';
  const dismissible = o.dismissible ?? severity !== 'progress';
  const close = dismissible
    ? `<button type="button" class="cot-c-btn cot-c-btn--36 cot-c-btn--icon cot-c-btn--ghost cot-c-notice__close" data-notice-close `
      + `aria-label="${esc(t('notice.dismiss'))}">${icon('close', { size: 16 })}</button>` : '';
  el.innerHTML = `${content(o)}${count}${progress}${acts}${close}`;
  el.onclick = (event) => {
    const target = (event.target as Element | null)?.closest<HTMLElement>('[data-notice-action],[data-notice-close]');
    if (!target) return;
    if (target.hasAttribute('data-notice-close')) { region.queue.remove(toast.id); schedule(region); return; }
    const action = actions[Number(target.dataset.noticeAction)];
    action?.run();
    if (action && !action.keep) { region.queue.remove(toast.id); schedule(region); }
  };
  el.onkeydown = (event) => {
    if (event.key !== 'Escape' || !dismissible) return;
    event.stopPropagation();
    region.queue.remove(toast.id);
    schedule(region);
  };
}

function retry(id: string, options: ToastOptions): void {
  const attempt = options.retry;
  if (!attempt) return;
  update(id, { severity: 'progress', dismissible: false });
  attempt().then(
    () => update(id, { severity: 'success', durationMs: undefined, dismissible: true, retry: undefined }),
    () => update(id, { severity: 'error', dismissible: true, retry: attempt }),
  );
}

function regionFor(name: string): Region | null {
  if (!canDraw()) return null;
  if (!regions.has(name)) noticeRegion(name);
  return regions.get(name) ?? null;
}

/** Place a region (once; a later call with the same name changes only its limit). */
export function noticeRegion(name: string, options: RegionOptions = {}): void {
  if (!canDraw()) return;
  const existing = regions.get(name);
  if (existing) { if (options.limit) existing.queue.limit = options.limit; return; }
  const el = document.createElement('section');
  el.className = `cot-c-notices${options.className ? ` ${options.className}` : ''}`;
  el.dataset.placement = options.placement ?? 'bottom';
  el.setAttribute('aria-live', 'polite');
  el.setAttribute('aria-relevant', 'additions text');
  (options.host ?? document.body).append(el);
  // the hooks run only after the region exists (a show needs a push, which needs the region)
  let region: Region;
  const queue = new NoticeQueue(options.limit ?? 3, clock, {
    show(toast) {
      const item = document.createElement('div');
      item.tabIndex = -1;
      elements.set(toast.id, item);
      render(region, toast, item);
      item.dataset.state = 'enter';
      region.el.append(item);
      requestAnimationFrame(() => { delete item.dataset.state; });
      const hold = (held: boolean) => { region.queue.hold(toast.id, held); schedule(region); };
      item.addEventListener('pointerenter', () => hold(true));
      item.addEventListener('pointerleave', () => hold(item.contains(document.activeElement)));
      item.addEventListener('focusin', () => hold(true));
      item.addEventListener('focusout', (event) => hold(item.contains(event.relatedTarget as Node | null)));
      if (toast.options.focus) {
        returnFocus.set(toast.id, document.activeElement instanceof HTMLElement ? document.activeElement : null);
        (item.querySelector<HTMLElement>('[data-notice-action]') ?? item).focus();
      }
    },
    hide(toast) {
      const item = elements.get(toast.id);
      elements.delete(toast.id);
      if (!item) return;
      const hadFocus = item.contains(document.activeElement);
      item.dataset.state = 'exit';
      setTimeout(() => item.remove(), 200);
      const back = returnFocus.get(toast.id);
      returnFocus.delete(toast.id);
      if (hadFocus && back?.isConnected) back.focus();
    },
    update(toast) {
      const item = elements.get(toast.id);
      if (item) render(region, toast, item);
    },
  });
  region = { el, queue, timer: null };
  regions.set(name, region);
  if (!watchingVisibility) {
    watchingVisibility = true;
    document.addEventListener('visibilitychange', () => applyPause());
  }
  region.queue.pause(gamePaused || pageHidden());
}

function applyPause(): void {
  for (const region of regions.values()) { region.queue.pause(gamePaused || pageHidden()); schedule(region); }
}

export interface ToastHandle {
  readonly id: string;
  update(change: Partial<ToastOptions>): void;
  dismiss(): void;
}

/** Show a toast (or update the one with this id, or count a repeat of this dedupe key). */
export function notify(options: ToastOptions): ToastHandle {
  const id = options.id ?? `cot-notice-${++serial}`;
  const region = regionFor(options.region ?? 'menu');
  const toast = region?.queue.push(id, options);
  if (region) schedule(region);
  const realId = toast?.id ?? id;
  return { id: realId, update: (change) => update(realId, change), dismiss: () => dismissNotice(realId) };
}

function update(id: string, change: Partial<ToastOptions>): void {
  for (const region of regions.values()) { region.queue.update(id, change); schedule(region); }
}

/** Dismiss a toast wherever it is shown or waiting. */
export function dismissNotice(id: string): void {
  for (const region of regions.values()) { region.queue.remove(id); schedule(region); }
}

/** The game's pause holds every toast's time (as a hidden page does). */
export function pauseNotices(paused: boolean): void {
  gamePaused = paused;
  applyPause();
}

/** One offline notice while the browser is offline, replaced by a short "back online" when it returns. */
export function watchConnectivity(text: { readonly offline: string; readonly online: string }, region = 'menu'): () => void {
  if (typeof window === 'undefined') return () => {};
  const offline = (): void => { notify({ id: 'cot-connectivity', severity: 'warning', text: text.offline, durationMs: null, dismissible: false, priority: 10, region }); };
  const online = (): void => { notify({ id: 'cot-connectivity', severity: 'success', text: text.online, durationMs: undefined, dismissible: true, region }); };
  window.addEventListener('offline', offline);
  window.addEventListener('online', online);
  if (typeof navigator !== 'undefined' && navigator.onLine === false) offline();
  return () => { window.removeEventListener('offline', offline); window.removeEventListener('online', online); };
}
