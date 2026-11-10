// Proof (implicit state machine audit S1, 2026-11-02): how the rooms Worker's Durable Objects end an event. Room's five
// handlers (fetch, webSocketMessage, its invalid-payload path, webSocketClose, alarm) and PadPair's four each ended with
// the same hand-copied steps: the work, `await #applyAlarm()`, `#flushCloses()`. A handler that skipped the flush
// leaked a retired socket, one that skipped the alarm left a stale alarm or never deallocated, and a throw in the work
// (an actor's tick in alarm()) skipped both. And the two objects deallocated their storage by different rules (Room:
// the actor's `empty`; PadPair: the actor's `vacant` and the runtime's socket count, with deleteAll repeated on every
// vacant event and no schema made again after it).
// The objects need the Workers runtime (cloudflare/rooms vitest, not run in this lane); here, in Node:
//   - the shared end (cloudflare/rooms/src/eventEnd.ts endEvent): work, then the alarm, then the flush; a throw still
//     flushes the retired sockets, leaves the alarm to the runtime's retry, and rethrows;
//   - the shared deallocation rule (mayDeallocate);
//   - both objects' sources: every handler ends through #endEvent, nothing else applies the alarm or flushes, and
//     deleteAll runs only under mayDeallocate, behind a storage latch, with the schema made again on the next write.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const shared = await import('../../cloudflare/rooms/src/eventEnd.ts').catch(() => null);
assert.ok(shared?.endEvent && shared?.mayDeallocate, 'the Durable Objects end their events through one shared end (cloudflare/rooms/src/eventEnd.ts)');
const { endEvent, mayDeallocate } = shared;

// ---- the end itself
{
  const order = [];
  const end = { applyAlarm: async () => { order.push('alarm'); }, flushCloses: () => { order.push('flush'); } };
  const result = await endEvent(async () => { order.push('work'); await Promise.resolve(); order.push('work done'); return 7; }, end);
  assert.equal(result, 7);
  assert.deepEqual(order, ['work', 'work done', 'alarm', 'flush'], 'the work, then the alarm, then the flush');
  order.length = 0;
  await assert.rejects(endEvent(async () => { order.push('work'); throw new Error('tick failed'); }, end), /tick failed/, 'a failed event still fails (the runtime retries an alarm)');
  assert.deepEqual(order, ['work', 'flush'], 'and still closes the sockets it retired, its alarm left to the retry');
  order.length = 0;
  const failingAlarm = { applyAlarm: async () => { order.push('alarm'); throw new Error('storage'); }, flushCloses: () => { order.push('flush'); } };
  await assert.rejects(endEvent(() => { order.push('work'); }, failingAlarm), /storage/);
  assert.deepEqual(order, ['work', 'alarm', 'flush'], 'a failed alarm write still flushes');
}

// ---- the deallocation rule
{
  const base = { holdsState: false, actorSockets: 0, alarmWanted: false, storageUsed: true };
  assert.equal(mayDeallocate(base), true, 'nothing held, no socket, no alarm, something stored: deallocate');
  assert.equal(mayDeallocate({ ...base, holdsState: true }), false, 'a held room or pairing stays');
  assert.equal(mayDeallocate({ ...base, actorSockets: 1 }), false, 'a socket the actor counts keeps the storage');
  assert.equal(mayDeallocate({ ...base, alarmWanted: true }), false, 'an alarm still wanted keeps it');
  assert.equal(mayDeallocate({ ...base, storageUsed: false }), false, 'storage already deallocated is not deallocated again');
}

// ---- both objects' handlers end through it
const HANDLERS = ['fetch', 'webSocketMessage', 'webSocketClose', 'alarm'];
for (const file of ['room.ts', 'padPair.ts']) {
  const source = readFileSync(new URL(`../../cloudflare/rooms/src/${file}`, import.meta.url), 'utf8');
  /** A method's body by brace matching from its signature. */
  const bodyOf = (signature) => {
    const at = source.indexOf(signature);
    assert.ok(at >= 0, `${file}: ${signature}`);
    let depth = 0;
    for (let index = source.indexOf('{', at + signature.length - 1); index < source.length; index++) {
      if (source[index] === '{') depth++;
      else if (source[index] === '}' && --depth === 0) return source.slice(at, index + 1);
    }
    return assert.fail(`${file}: unbalanced ${signature}`);
  };
  for (const handler of HANDLERS) {
    assert.match(bodyOf(`async ${handler}(`), /this\.#endEvent\(/, `${file}: ${handler} ends through #endEvent`);
  }
  // outside #endEvent (and the Room constructor's restore, which retires no socket) nothing applies the alarm or flushes
  let rest = source.replace(bodyOf('#endEvent<T>('), '').replace(bodyOf('async #applyAlarm(): Promise<void> {'), '').replace(bodyOf('#flushCloses(): void {'), '');
  const constructorBody = bodyOf('constructor(ctx');
  rest = rest.replace(constructorBody, constructorBody.replace(/await this\.#applyAlarm\(\);/, ''));
  assert.doesNotMatch(rest, /#applyAlarm\(\)/, `${file}: no handler applies the alarm by hand`);
  assert.doesNotMatch(rest, /#flushCloses\(\)/, `${file}: no handler flushes by hand`);
  const alarm = bodyOf('async #applyAlarm(): Promise<void> {');
  assert.match(alarm, /mayDeallocate\(/, `${file}: deallocates by the shared rule`);
  assert.equal((source.match(/deleteAll\(\)/g) ?? []).length, 1, `${file}: one deleteAll`);
  assert.match(alarm, /#storageUsed = false/, `${file}: behind the storage latch`);
  assert.match(bodyOf('#persist(): void {'), /this\.#ensureSchema\(\)/, `${file}: the state table is made again before a write after a deallocation`);
}
console.log('roomEvents: Room and PadPair end every event through one end (alarm after the work, closes whatever happened) and deallocate by one rule, once');
