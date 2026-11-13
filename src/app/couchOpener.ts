/**
 * The couch lobby's opener (round 8 Y4 s3-03): one of the Garage's lazy openers under 2026-11-02 audit F5's rule. The
 * Couch press (src/ui/garage.ts) takes the Garage screen's ticket; the couch runtime and the lobby's chunk load; the
 * lobby opens only if the Garage that asked still shows. Before, a press and then Launch on the same Deploy foot inside a
 * cold download opened the lobby's modal over the loader or the battle, and a pairing lobby nobody wanted. (review r2)
 * The ticket lapses when the Garage hands the player on (Launch: garageScreen.handOff; residual fix-up r1: enter() for the
 * start launchBattle hands on, under whose loader a press takes a ticket that never holds), not only when it hides at the
 * battle's activation after the covered load. A chunk that did not arrive rejects to the press as a CouchChunkError,
 * which the press reports under the loaders' policy (the button's error state, Reload page); an error from the open step
 * (the lobby, its socket) rejects unchanged and is not a failed chunk. Pure: no DOM (couchOpener.selftest drives it with
 * the real Garage screen owner and garage.ts's own launchBattle).
 */
export interface CouchOpenTicket {
  current(): boolean;
}

/** A couch chunk (the couch runtime or the lobby's module) did not arrive: the press's load failure. */
export class CouchChunkError extends Error {
  constructor(cause: unknown) {
    super('[couch] part of the couch lobby did not arrive', { cause });
    this.name = 'CouchChunkError';
  }
}

/** Load, then open over the Garage that asked: true when it opened, false when that Garage hid or handed the player on
 *  meanwhile. A load rejection becomes a CouchChunkError (its cause kept); an open-step error rejects as it is. */
export async function openCouchWhenCurrent<Loaded>({ ticket, load, open }: {
  readonly ticket: CouchOpenTicket;
  readonly load: () => Promise<Loaded>;
  readonly open: (loaded: Loaded) => void;
}): Promise<boolean> {
  let loaded: Loaded;
  try {
    loaded = await load();
  } catch (error) {
    throw new CouchChunkError(error);
  }
  if (!ticket.current()) return false;
  open(loaded);
  return true;
}
