/**
 * battleInputOwner.ts — who owns battle input right now (2026-11-02 audit F4). DOM-free, Node-runnable.
 *
 *   presentation  a kill-cam replay or a battle-ending camera beat owns the screen; its any-key skip wins over the Esc
 *                 menu and the resume veil, and so does the press that skipped it, for PRESENTATION_DONE_GRACE_MS after
 *                 it releases the screen
 *   menu          the Settings panel owns the keyboard
 *   veil          the click-to-resume veil waits for a press: 'relock' (the browser refused a pointer relock) or
 *                 'pause' (the battle lost the page: a focus loss, a background tab, an app switch)
 *   play          the player owns input (pointer locked, a touch layout, cursor aim)
 *
 * Precedence is that order: a live presentation outranks an open menu, which outranks the veil. Every Esc, pointer-lock
 * and replay path asks this owner (settingsAccess's menu action and gear, the panel's own openings, its pointer-unlock
 * and focus veil, the report gate), so no consumer keeps its own "a replay owns the screen" latch. One owner per bus
 * (battleInputOwnerFor): it hears the presentation edges itself, so it is current whichever consumer loads first.
 *
 * Whether a kill-cam replay is live is never this owner's copy: it reads the replay controller's own flag
 * (src/game/killcamScreen.ts, killcam.ts `active`; IR15), so a lost, repeated or stale kill-cam edge cannot hold or take
 * the screen. The edges still drive what only an edge can: the begin drops the veil, the done starts the skip press's
 * grace and tells the listeners. The ending beat (the result presentation runtime's camera) is tracked from its own
 * begin / done pair.
 */

import { killcamOwnsScreen } from '../game/killcamScreen.ts';

export type PresentationSource = 'killcam' | 'ending';
export type VeilTrigger = 'relock' | 'pause';
export type BattleInputState = 'play' | 'veil' | 'menu' | 'presentation';

/**
 * controls_gunnery r7: menu-suppression grace after a replay releases the screen. The ANY-KEY skip that finishes a
 * replay is handled by the kill-cam's CAPTURE-phase keydown listener, which emits 'killcam:done' synchronously — the
 * input layer's BUBBLE-phase listener then sees the very same keydown and would fire the settingsMenu action with the
 * screen already released, opening the options menu on the skip press itself. The grace absorbs that same-event race
 * (sub-ms in practice); a human deliberately opening the menu after a skip is always slower than 250 ms.
 */
export const PRESENTATION_DONE_GRACE_MS = 250;

export interface BattleInputOwner {
  readonly state: BattleInputState;
  /** The veil's trigger while it is up, else null. */
  readonly veil: VeilTrigger | null;
  readonly menuOpen: boolean;
  /** A presentation owns the screen: one is live, or the last one released it inside the done grace. */
  presentationOwns(): boolean;
  /** The Esc menu may open: no menu yet and no presentation owning the screen. */
  canOpenMenu(): boolean;
  /** A presentation's begin edge. The ending beat goes live; a kill-cam begin only acts while its replay is on screen. */
  beginPresentation(source: PresentationSource): void;
  /** A presentation's done edge: the grace starts once nothing is live (a kill-cam done while its replay is up is void). */
  endPresentation(source: PresentationSource): void;
  /** A phase flip: the reset of last resort for an ending beat whose done never came (no grace). */
  resetPresentation(): void;
  /** Open the menu; false (and nothing changes) while a presentation owns the screen or the menu is already open. */
  openMenu(): boolean;
  closeMenu(): void;
  /** Raise the veil; false while the menu is open, a presentation is live, or a veil is already up. */
  showVeil(trigger: VeilTrigger): boolean;
  /** Drop the veil; true when one was up. */
  hideVeil(): boolean;
  /** Called after every change of state, veil or menu (the panel projects the veil's DOM class from it). */
  onChange(listener: () => void): () => void;
}

interface BattleInputOwnerOptions {
  now?: () => number;
  graceMs?: number;
  /** A kill-cam replay is on screen: the replay controller's own flag (killcamScreen.ts). None: no replay can be. */
  killcamLive?: () => boolean;
}

const defaultNow = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

const noReplay = (): boolean => false;

export function createBattleInputOwner({
  now = defaultNow,
  graceMs = PRESENTATION_DONE_GRACE_MS,
  killcamLive = noReplay,
}: BattleInputOwnerOptions = {}): BattleInputOwner {
  let endingLive = false;
  let releasedAtMs = -Infinity;
  let menuOpen = false;
  let veil: VeilTrigger | null = null;
  const listeners = new Set<() => void>();
  const changed = (): void => { for (const listener of [...listeners]) listener(); };

  const live = (): boolean => endingLive || killcamLive();
  const presentationOwns = (): boolean => live() || now() - releasedAtMs < graceMs;

  const owner: BattleInputOwner = {
    get state(): BattleInputState {
      if (live()) return 'presentation';
      if (menuOpen) return 'menu';
      return veil ? 'veil' : 'play';
    },
    get veil() { return veil; },
    get menuOpen() { return menuOpen; },
    presentationOwns,
    canOpenMenu: () => !menuOpen && !presentationOwns(),
    beginPresentation(source) {
      if (source === 'ending') {
        if (endingLive) return;
        endingLive = true;
      } else if (!killcamLive()) {
        return; // a begin edge with no replay on screen takes nothing
      }
      veil = null; // a veil on top would sit over the replay and its mousedown would eat the skip press
      changed();
    },
    endPresentation(source) {
      if (source === 'ending') {
        if (!endingLive) return;
        endingLive = false;
      } else if (killcamLive()) {
        return; // a done edge while the replay is still on screen releases nothing
      }
      // the screen is released only when the last owner ends: an ending beat outlives an overlapping replay's done
      if (!live()) releasedAtMs = now();
      changed();
    },
    resetPresentation() {
      if (!endingLive && releasedAtMs === -Infinity) return;
      endingLive = false;
      releasedAtMs = -Infinity;
      changed();
    },
    openMenu() {
      if (menuOpen || presentationOwns()) return false;
      menuOpen = true;
      veil = null; // the panel supersedes the click-to-resume veil
      changed();
      return true;
    },
    closeMenu() {
      if (!menuOpen) return;
      menuOpen = false;
      changed();
    },
    showVeil(trigger) {
      if (menuOpen || live() || veil) return false;
      veil = trigger;
      changed();
      return true;
    },
    hideVeil() {
      if (!veil) return false;
      veil = null;
      changed();
      return true;
    },
    onChange(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
  return owner;
}

interface PresentationBus {
  on(event: string, handler: (payload?: unknown) => void): unknown;
}

interface BusOwner {
  readonly owner: BattleInputOwner;
  readonly now: (() => number) | undefined;
  readonly graceMs: number | undefined;
}

const owners = new WeakMap<object, BusOwner>();

/**
 * The one input owner of a bus. Created on first ask, it reads the kill-cam replay's own flag on that bus
 * (killcamOwnsScreen) and subscribes to the presentation edges once: 'killcam:begin' / 'killcam:done' (src/game/killcam.ts;
 * done on finish, skip and cancel alike), 'ending:begin' / 'ending:done' (the result presentation runtime's camera beats;
 * done on finish and cancel), and 'phase:change' as the ending beat's reset of last resort.
 *
 * The first caller fixes the owner's clock and grace. A later caller that names a different one is refused (a TypeError),
 * never silently handed the first caller's: a receipt on a fake clock builds its owner first, or on its own bus.
 */
export function battleInputOwnerFor(bus: PresentationBus, options: BattleInputOwnerOptions = {}): BattleInputOwner {
  const known = owners.get(bus);
  if (known) {
    if (options.now !== undefined && options.now !== known.now) {
      throw new TypeError('battle input owner: this bus\'s owner already runs on another clock');
    }
    if (options.graceMs !== undefined && options.graceMs !== known.graceMs) {
      throw new TypeError('battle input owner: this bus\'s owner already runs with another done grace');
    }
    return known.owner;
  }
  const owner = createBattleInputOwner({ ...options, killcamLive: () => killcamOwnsScreen(bus) });
  owners.set(bus, { owner, now: options.now, graceMs: options.graceMs });
  bus.on('killcam:begin', () => owner.beginPresentation('killcam'));
  bus.on('killcam:done', () => owner.endPresentation('killcam'));
  bus.on('ending:begin', () => owner.beginPresentation('ending'));
  bus.on('ending:done', () => owner.endPresentation('ending'));
  bus.on('phase:change', () => owner.resetPresentation());
  return owner;
}
