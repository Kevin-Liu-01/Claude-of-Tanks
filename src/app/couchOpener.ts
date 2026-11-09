/**
 * The couch lobby's opener (round 8 Y4 s3-03): one of the Garage's lazy openers under 2026-11-02 audit F5's rule. The
 * Couch press (src/ui/garage.ts) takes the Garage screen's ticket; the couch runtime and the lobby's chunk load; the
 * lobby opens only if the Garage that asked still shows. Before, a press and then Launch on the same Deploy foot inside a
 * cold download opened the lobby's modal over the loader or the battle, and a pairing lobby nobody wanted. A chunk that
 * did not arrive rejects to the press, which reports it under the loaders' policy (the button's error state, Reload
 * page). Pure: no DOM (couchOpener.selftest drives it with the real Garage screen owner).
 */
export interface CouchOpenTicket {
  current(): boolean;
}

/** Load, then open over the Garage that asked: true when it opened, false when that Garage hid meanwhile. */
export async function openCouchWhenCurrent<Loaded>({ ticket, load, open }: {
  readonly ticket: CouchOpenTicket;
  readonly load: () => Promise<Loaded>;
  readonly open: (loaded: Loaded) => void;
}): Promise<boolean> {
  const loaded = await load();
  if (!ticket.current()) return false;
  open(loaded);
  return true;
}
