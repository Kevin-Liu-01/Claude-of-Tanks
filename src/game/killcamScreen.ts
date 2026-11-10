/**
 * killcamScreen.ts — the one owner of "a kill-cam replay owns the screen" (2026-11-02 audit F4, IR15). DOM-free and
 * import-free, so the boot facades (the battle input owner, the lazy audio facade) read it without the replay chunk.
 *
 * The fact is the replay controller's own `active` flag (src/game/killcam.ts: set in begin(), cleared in teardown(), which
 * every finish, skip and cancel of a live replay runs, and a replay that throws while it is built; teardown clears it and
 * emits 'killcam:done' even when a restore or a completion callback throws, round 3 A9). The controller publishes its
 * reader on the bus it binds, and the consumers read the fact here rather than keeping a copy: the battle input owner
 * (src/ui/battleInputOwner.ts, which the Esc menu, the veil and the report gate ask), the audio battle mode's kill-cam
 * overlay (src/audio/battleMode.ts, through audioEngine.ts and lazyAudio.ts), and the phase policy
 * (src/game/battlePhasePolicy.ts isKillcamActive, which main.ts binds to the same flag through killcam.isActive()).
 * 'killcam:begin' / 'killcam:done' stay edge notifications: a consumer acts on an edge (a sound, a closed panel, the
 * skip press's grace) and reads the state here, so a repeated or lost edge cannot leave two consumers disagreeing about
 * whether a replay is on screen.
 *
 * Before the replay chunk binds (and on a bus it never binds) no replay can be on screen: false.
 */

type KillcamReader = () => boolean;

const readers = new WeakMap<object, KillcamReader>();

/** The replay controller's bindBus: its `active` flag is the fact for every consumer on this bus. */
export function publishKillcamScreen(bus: object, isActive: KillcamReader): void {
  if (typeof isActive !== 'function') throw new TypeError('the kill-cam screen fact needs the controller\'s reader');
  readers.set(bus, isActive);
}

/** A kill-cam replay (or a staged replay frame) is on screen for this bus. */
export function killcamOwnsScreen(bus: object | null | undefined): boolean {
  if (!bus) return false;
  const read = readers.get(bus);
  return read ? read() === true : false;
}
