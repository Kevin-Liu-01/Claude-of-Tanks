// garageScreen.ts — the Garage screen's one open-state owner (2026-11-02 audit F5). Copyright © 2026 Kevin B. Liu.
//
// The Garage's "open" used to be a writable `api.isOpen` beside `root.style.display`, a module swatch flag, `hasPresented`
// and per-opener latches, and its lazy menus (Deploy, the tech tree, photo mode, the custom camo studio, the roster
// filter) opened after their download without asking whether the Garage still showed: a quick battle entry over a cold
// chunk left a modal Deploy on the surface stack through the battle, where it took the first Escape. This owner holds
// the one state, counts each open span as an epoch, hands a lazy opener a ticket that lapses when the Garage hides (or
// hides and opens again), and runs every Garage-owned closer when it hides. Pure: no DOM, so the selftest drives it.

export type GarageScreenPhase = 'unpresented' | 'open' | 'hidden';

/** A lazy opener's claim on the open span it started in: `current()` is false once the Garage hid since. */
export interface GarageScreenTicket {
  readonly epoch: number;
  current(): boolean;
}

export interface GarageScreen {
  readonly phase: GarageScreenPhase;
  readonly isOpen: boolean;
  /** The open span's count: every show from closed and every hide moves it on. */
  readonly epoch: number;
  /** 'first' for the first presentation, 'reopen' for a later one, 'already' when it was open. */
  show(): 'first' | 'reopen' | 'already';
  /** Hide and run every registered closer (newest first); false when it was not open. */
  hide(): boolean;
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
