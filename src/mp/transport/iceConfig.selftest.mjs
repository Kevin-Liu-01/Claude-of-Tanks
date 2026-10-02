// The ICE resolver of one room session (2026-10-02, docs/MULTIPLAYER-V2.md §13.14): a LAN room asks nothing; a private
// room asks the room it is seated in — one request for resolutions in flight together, a grant reused for its window,
// the newest valid grant (else host candidates) when the room refuses, times out, predates the request or answers
// garbage — and it never rejects, so a credential never blocks a connection.
import assert from 'node:assert/strict';
import { RELAY_GRANT_REUSE_MS, createRoomIceResolver } from './iceConfig.ts';

const TURN_GRANT = {
  iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }, { urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turns:turn.cloudflare.com:443?transport=tcp'], username: 'u', credential: 'c' }],
  relay: true, expiresInSeconds: 3600,
};
const STUN_GRANT = { iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }], relay: false };

/** A scripted room: `answers` is consumed one per request (a value, an Error to throw, or a function of the call ordinal). */
function scriptedRoom(answers) {
  const room = {
    requests: 0,
    async requestRelay() {
      room.requests++;
      const next = answers.length > 1 ? answers.shift() : answers[0];
      const value = typeof next === 'function' ? await next(room.requests) : next;
      if (value instanceof Error) throw value;
      return value;
    },
  };
  return room;
}
const refusal = (code) => Object.assign(new Error(code), { name: 'RoomError', code });

// ---- a LAN room uses host candidates and asks nothing; no room at all degrades the same way
{
  const room = scriptedRoom([TURN_GRANT]);
  assert.deepEqual(await createRoomIceResolver({ mode: 'lan', room })(), { iceServers: [], relayOnly: false, relayAvailable: false, source: 'lan' });
  assert.equal(room.requests, 0);
  assert.deepEqual(await createRoomIceResolver({ mode: 'private', room: null })(),
    { iceServers: [], relayOnly: false, relayAvailable: false, source: 'host-fallback', degradedReason: 'relay_unconfigured' });
}

// ---- the room's grant: relay credentials, or STUN alone from a room without the secret (the link keeps its direct paths)
{
  const relayed = await createRoomIceResolver({ mode: 'private', room: scriptedRoom([TURN_GRANT]) })();
  assert.deepEqual(relayed, {
    iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }, { urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turns:turn.cloudflare.com:443?transport=tcp'], username: 'u', credential: 'c' }],
    relayOnly: false, relayAvailable: true, source: 'room', expiresInSeconds: 3600,
  });
  const direct = await createRoomIceResolver({ mode: 'private', room: scriptedRoom([STUN_GRANT]) })();
  assert.deepEqual(direct, { iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }], relayOnly: false, relayAvailable: false, source: 'room' },
    'a STUN-only room is an answer, not a degradation');
  const none = await createRoomIceResolver({ mode: 'private', room: scriptedRoom([{ iceServers: [], relay: false }]) })();
  assert.deepEqual(none, { iceServers: [], relayOnly: false, relayAvailable: false, source: 'room' }, 'a LAN helper\'s private room names no server');
}

// ---- one request for a burst: resolutions in flight share it, a grant inside the window is reused, the next window asks again
{
  let now = 1_000_000;
  let release = null;
  const room = scriptedRoom([(ordinal) => new Promise((resolve) => { release = () => resolve({ ...TURN_GRANT, iceServers: [{ ...TURN_GRANT.iceServers[1], credential: `c${ordinal}` }] }); })]);
  const resolve = createRoomIceResolver({ mode: 'private', room, clock: () => now });
  const burst = [resolve(), resolve(), resolve()];
  await new Promise((settle) => setTimeout(settle, 0));
  assert.equal(room.requests, 1, 'an election\'s offers in flight together ask the room once');
  release();
  const answers = await Promise.all(burst);
  assert.ok(answers.every((answer) => answer.iceServers[0].credential === 'c1'));
  answers[0].iceServers[0].credential = 'mutated';
  answers[1].iceServers.push({ urls: 'stun:mutated.test' });
  now += RELAY_GRANT_REUSE_MS - 1;
  const reused = await resolve();
  assert.equal(room.requests, 1, 'a grant inside the reuse window is handed out again');
  assert.equal(reused.iceServers.length, 1);
  assert.equal(reused.iceServers[0].credential, 'c1', 'every caller gets its own copy: a mutation never reaches the next connection');
  now += 2;
  const pending = resolve();
  await new Promise((settle) => setTimeout(settle, 0));
  release();
  assert.equal((await pending).iceServers[0].credential, 'c2', 'past the window the room mints again');
  assert.equal(room.requests, 2);
}

// ---- the room refuses (rate_limit, a socket blip, a room that predates the request): the newest valid grant, else host candidates
{
  let now = 0;
  const room = scriptedRoom([TURN_GRANT, refusal('rate_limit'), refusal('not_in_room'), new TypeError('boom'), { iceServers: [{ urls: 'https://not-ice.test' }] }]);
  const resolve = createRoomIceResolver({ mode: 'private', room, clock: () => now });
  assert.equal((await resolve()).source, 'room');
  for (const reason of ['rate_limit', 'not_in_room', 'relay_unavailable', 'relay_invalid']) {
    now += RELAY_GRANT_REUSE_MS;
    const fallback = await resolve();
    assert.equal(fallback.degradedReason, reason, `${reason}: named`);
    assert.equal(fallback.relayAvailable, true, `${reason}: the newest grant, still valid, carries the connection`);
    assert.equal(fallback.iceServers[1].credential, 'c');
  }
  // a room that predates room_relay, before any grant: host candidates, as the first multiplayer did
  const legacy = await createRoomIceResolver({ mode: 'private', room: scriptedRoom([refusal('unknown_message')]) })();
  assert.deepEqual(legacy, { iceServers: [], relayOnly: false, relayAvailable: false, source: 'host-fallback', degradedReason: 'unknown_message' });
  const phase = await createRoomIceResolver({ mode: 'private', room: scriptedRoom([refusal('relay_phase')]) })();
  assert.equal(phase.degradedReason, 'relay_phase');
}

// ---- a grant about to expire is neither reused nor a fallback: the relay would drop the connection within the minute
{
  let now = 0;
  const room = scriptedRoom([{ ...TURN_GRANT, expiresInSeconds: 90 }, refusal('rate_limit')]);
  const resolve = createRoomIceResolver({ mode: 'private', room, clock: () => now });
  assert.equal((await resolve()).expiresInSeconds, 90);
  now += 31_000;
  const late = await resolve();
  assert.equal(room.requests, 2, 'inside the reuse window, but 59 s from its expiry: asked again');
  assert.equal(late.source, 'host-fallback');
  assert.equal(late.degradedReason, 'rate_limit');
}

assert.throws(() => createRoomIceResolver({ mode: 'private', room: null, reuseMs: -1 }), /invalid/);
console.log('iceConfig.selftest: LAN asks nothing; the room\'s grant (TURN or STUN alone), one request per burst, reuse, the newest valid grant on a refusal, host candidates last');
