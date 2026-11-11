/**
 * The end of every Durable Object event (audit S1, 2026-11-02), shared by Room and PadPair. Each handler (fetch,
 * webSocketMessage, webSocketClose, alarm, and the invalid-payload path) ended with the same hand-copied steps: the
 * actor's work, the socket attachment, `await #applyAlarm()` (arm, re-arm, cancel, or deallocate the storage), then
 * `#flushCloses()` (close the sockets the actor retired during the event, from a timer: room.ts #close). A handler
 * that skipped the flush leaked a retired socket, one that skipped the alarm left a stale alarm or never deallocated,
 * and a throw in the work (an actor's tick in alarm()) skipped both. Every handler now ends through `endEvent`:
 *   - the alarm is applied after the work succeeds (a failed alarm event leaves the runtime's retry as it was);
 *   - the retired sockets are closed whatever the work did.
 * Node-runnable (no `cloudflare:workers` import): the rule is pinned by server/rooms/roomEvents.selftest.mjs.
 */
export interface EventEnd {
  applyAlarm(): Promise<void>;
  flushCloses(): void;
}

export async function endEvent<T>(work: () => T | Promise<T>, end: EventEnd): Promise<T> {
  try {
    const result = await work();
    await end.applyAlarm();
    return result;
  } finally {
    end.flushCloses();
  }
}

/**
 * When an object deallocates its storage (`deleteAll`), the one rule both objects use (audit S1: Room read the actor's
 * `empty`, PadPair the actor's `vacant` and the runtime's socket count, and PadPair repeated `deleteAll` on every
 * vacant event): its actor holds no state and counts no socket, no alarm is wanted, and the storage holds something
 * since it was last deallocated. A socket the actor retired in the event is no longer the actor's (it closes from the
 * flush), so it does not keep the storage.
 */
export function mayDeallocate({ holdsState, actorSockets, alarmWanted, storageUsed }: {
  holdsState: boolean; actorSockets: number; alarmWanted: boolean; storageUsed: boolean;
}): boolean {
  return !holdsState && actorSockets === 0 && !alarmWanted && storageUsed;
}
