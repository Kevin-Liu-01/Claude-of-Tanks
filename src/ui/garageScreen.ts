// garageScreen.ts — the Garage screen's one open-state owner (2026-11-02 audit F5). Copyright © 2026 Kevin B. Liu.
//
// The Garage's "open" used to be a writable `api.isOpen` beside `root.style.display`, a module swatch flag, `hasPresented`
// and per-opener latches, and its lazy menus (Deploy, the tech tree, photo mode, the custom camo studio, the roster
// filter) opened after their download without asking whether the Garage still showed: a quick battle entry over a cold
// chunk left a modal Deploy on the surface stack through the battle, where it took the first Escape. This owner holds
// the one state, counts each open span as an epoch, hands a lazy opener a ticket that lapses when the Garage hides (or
// hides and opens again) or hands the player on, and runs every Garage-owned closer when it hides. Pure: no DOM, so the
// selftest drives it.
//
// (round 8 Y4 s3-03, review r2) A battle start does not hide the Garage at once: the solo entry shows its loader and loads
// the world under it, and the Garage hides only at the activation after that (soloBattleStartRuntime.ts ui.hideGarage).
// A chunk that landed inside that covered load still held a current ticket and opened its surface over the loader (the
// couch lobby: its modal and a pairing lobby). So the press that hands the player on (garage.ts: a start handed to the
// entry, the BATTLE, Watch, campaign and room presses) ends the tickets with handOff(), while the Garage still shows.
// (round 8 Y4 residual) A start refused after its hand-off leaves the Garage the player's: an opener whose load is still
// in flight takes the next press as the one it opens for (createLazyOpener), so that press is not lost.

export type GarageScreenPhase = 'unpresented' | 'open' | 'hidden';

/** A lazy opener's claim on the open span it started in: `current()` is false once the Garage hid or handed the player
 *  on since. */
export interface GarageScreenTicket {
  readonly epoch: number;
  current(): boolean;
}

export interface GarageScreen {
  readonly phase: GarageScreenPhase;
  readonly isOpen: boolean;
  /** The tickets' count: every show from closed, every hide and every hand-off moves it on. */
  readonly epoch: number;
  /** 'first' for the first presentation, 'reopen' for a later one, 'already' when it was open. */
  show(): 'first' | 'reopen' | 'already';
  /** Hide and run every registered closer (newest first); false when it was not open. */
  hide(): boolean;
  /**
   * The player was handed on from the open Garage (a battle start, the play menu): every ticket taken before lapses, so
   * a lazy opener still loading opens nothing over what follows. The Garage still shows (under the battle's loader until
   * the activation hides it; a start refused later leaves it open, and a new press takes a new ticket, a press on an
   * opener whose load is still in flight included: createLazyOpener). False when it was not open (its tickets had lapsed
   * already).
   */
  handOff(): boolean;
  ticket(): GarageScreenTicket;
  /** A closer the next hides run (a sub-surface, a timer): the Garage takes everything it opened with it. */
  onHide(closer: () => void): () => void;
}

export function createGarageScreen({ warn = (message: string, error: unknown) => console.warn(message, error) }: {
  warn?: (message: string, error: unknown) => void;
} = {}): GarageScreen {
  let phase: GarageScreenPhase = 'unpresented';
  let epoch = 0;
  const closers = new Set<() => void>();

  const screen: GarageScreen = {
    get phase() { return phase; },
    get isOpen() { return phase === 'open'; },
    get epoch() { return epoch; },
    show() {
      if (phase === 'open') return 'already';
      const first = phase === 'unpresented';
      phase = 'open';
      epoch += 1;
      return first ? 'first' : 'reopen';
    },
    hide() {
      if (phase !== 'open') return false;
      phase = 'hidden';
      epoch += 1;
      // one closer that throws never keeps the others (or the hide) from running
      for (const closer of [...closers].reverse()) {
        try { closer(); } catch (error) { warn('[garage] a closer failed while the Garage hid', error); }
      }
      return true;
    },
    handOff() {
      if (phase !== 'open') return false;
      epoch += 1;
      return true;
    },
    ticket() {
      const issued = epoch;
      return { epoch: issued, current: () => phase === 'open' && epoch === issued };
    },
    onHide(closer) {
      closers.add(closer);
      return () => { closers.delete(closer); };
    },
  };
  return screen;
}

export type LazyOpenerPhase = 'idle' | 'loading';

/** A lazy opener's load in flight: the newest press it opens for. */
export interface LazyOpenerLoad<P> {
  /** The newest press's own values (its trigger, the selection it asked for). */
  readonly press: P;
  /** Whether the landed load may open: the newest press's ticket holds (the Garage still shows and handed nobody on
   *  since), and no close came after it. */
  current(): boolean;
}

/** A Garage surface that loads on its press, with one load in flight (the Couch lobby, the tech tree, the Service Record). */
export interface LazyOpener<P> {
  readonly phase: LazyOpenerPhase;
  /** The load in flight would open now (a toggle reads it as open). */
  readonly wanted: boolean;
  /**
   * A press: the load to start (the caller loads, opens only if `current()` once it landed, then settles it), or null
   * when one is in flight, which now opens for this press instead (its values, a ticket taken now).
   */
  press(values: P): LazyOpenerLoad<P> | null;
  /** A close while the load is in flight: it opens nothing unless a press comes after. */
  cancel(): void;
  /** The started load settled (it opened, opened nothing or failed): the next press starts another. */
  settle(load: LazyOpenerLoad<P>): void;
}

/**
 * A lazy opener's press (round 8 Y4 residual, the review's r4 finding on 2026-11-02 audit F5's rule): the lazy toggle's
 * rule below for a surface opened per press. A press while the load is in flight is not dropped: it becomes the press the
 * load opens for, with its own ticket. The hand-off lapses the tickets taken before it while the Garage still shows (a
 * BATTLE or Launch press whose start was refused, a room menu the player closed); the openers' latches used to drop the
 * player's next press there, the load landed on the first press's lapsed ticket and opened nothing, and only a third
 * press opened the surface. The load still checks the newest press's ticket, so nothing opens over a loader or a battle.
 */
export function createLazyOpener<P>(screen: Pick<GarageScreen, 'ticket'>): LazyOpener<P> {
  /** The load in flight: the newest press's values and ticket (null once a close cancelled it). */
  let claim: { press: P; ticket: GarageScreenTicket | null } | null = null;
  let pending: LazyOpenerLoad<P> | null = null;
  return {
    get phase() { return pending ? 'loading' : 'idle'; },
    get wanted() { return pending?.current() === true; },
    press(values) {
      if (claim) {
        claim.press = values;
        claim.ticket = screen.ticket();
        return null;
      }
      const own = { press: values, ticket: screen.ticket() as GarageScreenTicket | null };
      claim = own;
      const load: LazyOpenerLoad<P> = {
        get press() { return own.press; },
        current: () => own.ticket?.current() === true,
      };
      pending = load;
      return load;
    },
    cancel() {
      if (claim) claim.ticket = null;
    },
    settle(load) {
      if (load !== pending) return;
      pending = null;
      claim = null;
    },
  };
}

export type LazyPanelPhase = 'idle' | 'loading' | 'mounted';

/** A panel the Garage mounts on its first press (the roster filter). */
export interface LazyPanel {
  readonly isOpen: boolean;
  toggle(): void;
}

export interface LazyPanelToggle<P extends LazyPanel> {
  readonly phase: LazyPanelPhase;
  /** The mounted panel, or null before its load lands. */
  readonly panel: P | null;
  /** A press of the panel's button. */
  press(): void;
}

/**
 * A lazily mounted panel's button (2026-11-02 audit F5). A press before the mount means "open": the first one starts the
 * load, and a repeat press while it loads changes nothing (the player saw nothing happen; two impatient presses used to
 * queue two toggles and leave the panel closed). Once mounted, a press toggles. The mount opens the panel only while
 * the Garage still shows the span of the latest press, so a load that lands after the Garage hid opens nothing. A failed
 * load goes back to idle: the next press asks again (the lazy-chunk failure policy is the loaders lane's).
 */
export function createLazyPanelToggle<P extends LazyPanel>(
  screen: Pick<GarageScreen, 'ticket'>,
  load: () => Promise<P>,
): LazyPanelToggle<P> {
  let phase: LazyPanelPhase = 'idle';
  let panel: P | null = null;
  let wanted: GarageScreenTicket | null = null;
  return {
    get phase() { return phase; },
    get panel() { return panel; },
    press() {
      if (panel) { panel.toggle(); return; }
      wanted = screen.ticket();
      if (phase === 'loading') return;
      phase = 'loading';
      load().then((mounted) => {
        panel = mounted;
        phase = 'mounted';
        const open = wanted?.current() === true;
        wanted = null;
        if (open && !mounted.isOpen) mounted.toggle();
      }, () => {
        phase = 'idle';
        wanted = null;
      });
    },
  };
}
