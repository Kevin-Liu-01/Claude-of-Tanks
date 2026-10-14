// The ICE resolver of one room session (2026-10-02, docs/MULTIPLAYER-V2.md §13.14): a LAN room asks nothing; a private
// room asks the room it is seated in — one request for resolutions in flight together, a grant reused for its window,
// the newest valid grant (else the official STUN servers, 2026-10-13) when the room refuses, times out, predates the
// request or answers garbage — and it never rejects, so a credential never blocks a connection. Every degradation is
// reported once per reason (the ice_degraded telemetry note), including a grant that carries no relay.
import assert from 'node:assert/strict';
import * as iceConfig from './iceConfig.ts';
import { OFFICIAL_STUN_URLS } from '../../../api/_lib/policy.ts';

const { RELAY_GRANT_REUSE_MS, createRoomIceResolver } = iceConfig;
// (through the namespace so the timeout case also runs, and fails, against a resolver without the retry)
const RELAY_REQUEST_RETRIES = iceConfig.RELAY_REQUEST_RETRIES ?? 0;

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
/** What a seat with no grant to use links with: the official STUN servers, never an empty list (host candidates alone). */
const STUN_FALLBACK = (reason) => ({
  iceServers: [{ urls: OFFICIAL_STUN_URLS.length === 1 ? OFFICIAL_STUN_URLS[0] : [...OFFICIAL_STUN_URLS] }],
  relayOnly: false, relayAvailable: false, source: 'stun-fallback', degradedReason: reason,
});
const refusal = (code) => Object.assign(new Error(code), { name: 'RoomError', code });

// ---- a LAN room uses host candidates and asks nothing; no room at all degrades the same way
{
  const room = scriptedRoom([TURN_GRANT]);
  assert.deepEqual(await createRoomIceResolver({ mode: 'lan', room })(), { iceServers: [], relayOnly: false, relayAvailable: false, source: 'lan' });
  assert.equal(room.requests, 0);
  assert.deepEqual(await createRoomIceResolver({ mode: 'private', room: null })(), STUN_FALLBACK('relay_unconfigured'));
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
  // a room that predates room_relay, before any grant: the official STUN servers (no longer host candidates alone)
  const legacy = await createRoomIceResolver({ mode: 'private', room: scriptedRoom([refusal('unknown_message')]) })();
  assert.deepEqual(legacy, STUN_FALLBACK('unknown_message'));
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
  assert.deepEqual(late, STUN_FALLBACK('rate_limit'));
}

// ---- a request that timed out or met a closed socket ('internal': a starved seat or a busy room under load), with no
// grant held: asked once more before host candidates (2026-10-11; before, the first connection of a loaded seat was built
// with no servers at all and could not cross a NAT — mp-p2p-headless' first attempts, "internal")
{
  const room = scriptedRoom([refusal('internal'), STUN_GRANT]);
  const first = await createRoomIceResolver({ mode: 'private', room })();
  assert.equal(first.source, 'room', `a timed-out first request is asked again and its grant carries the connection (${first.source}, ${first.degradedReason ?? ''})`);
  assert.equal(first.iceServers[0].urls, 'stun:stun.cloudflare.com:3478');
  assert.equal(room.requests, 2);
  assert.equal(RELAY_REQUEST_RETRIES, 1);
  // bounded: a room that never answers costs one more request, then the official STUN servers — not an empty list,
  // which linked on a LAN but never across a NAT (2026-10-13: 2 of 10 loaded connections had linked with 0 servers)
  const silent = scriptedRoom([refusal('internal')]);
  const gaveUp = await createRoomIceResolver({ mode: 'private', room: silent })();
  assert.deepEqual(gaveUp, STUN_FALLBACK('internal'), `a timed-out room falls back to STUN, not to no servers (${JSON.stringify(gaveUp)})`);
  assert.ok(gaveUp.iceServers.length > 0 && gaveUp.iceServers.every((server) => [].concat(server.urls).every((url) => /^stun:/.test(url))),
    'the fallback is STUN alone: no TURN server the room did not name');
  assert.equal(silent.requests, 1 + RELAY_REQUEST_RETRIES, 'one retry, no more');
  // a refusal is not retried (it answers the same a moment later)
  const limited = scriptedRoom([refusal('rate_limit'), STUN_GRANT]);
  assert.equal((await createRoomIceResolver({ mode: 'private', room: limited })()).degradedReason, 'rate_limit');
  assert.equal(limited.requests, 1, 'a refusal is answered once');
  // with a valid grant held, a timeout falls back to it at once (no second request)
  let now = 0;
  const held = scriptedRoom([TURN_GRANT, refusal('internal'), STUN_GRANT]);
  const resolveHeld = createRoomIceResolver({ mode: 'private', room: held, clock: () => now });
  await resolveHeld();
  now += RELAY_GRANT_REUSE_MS;
  const fellBack = await resolveHeld();
  assert.equal(fellBack.relayAvailable, true, 'the held grant carries the connection');
  assert.equal(fellBack.degradedReason, 'internal');
  assert.equal(held.requests, 2, 'no retry while a grant is held');
}

// ---- ice_degraded (2026-10-13, MP-SINCE-0930 step 6b): every degradation reported once per reason, never a credential;
// a STUN-only grant (the rooms Worker without its TURN secrets) is `no_relay`; a LAN room and a relayed grant say nothing
{
  const seen = [];
  const onDegraded = (reason) => seen.push(reason);
  await createRoomIceResolver({ mode: 'lan', room: scriptedRoom([STUN_GRANT]), onDegraded })();
  let now = 0;
  const relayed = createRoomIceResolver({ mode: 'private', room: scriptedRoom([TURN_GRANT]), onDegraded, clock: () => now });
  await relayed(); now += RELAY_GRANT_REUSE_MS; await relayed();
  assert.deepEqual(seen, [], 'a LAN room and a relayed grant are not degradations');
  const stunOnly = createRoomIceResolver({ mode: 'private', room: scriptedRoom([STUN_GRANT]), onDegraded, clock: () => now });
  await stunOnly(); await stunOnly(); now += RELAY_GRANT_REUSE_MS; await stunOnly();
  assert.deepEqual(seen, ['no_relay'], 'a grant without TURN is reported once, however many connections it carries');
  seen.length = 0;
  const flaky = createRoomIceResolver({ mode: 'private', room: scriptedRoom([refusal('internal'), refusal('internal'), refusal('rate_limit'), TURN_GRANT, refusal('rate_limit')]), onDegraded, clock: () => now });
  assert.equal((await flaky()).degradedReason, 'internal');
  assert.equal((await flaky()).degradedReason, 'rate_limit');
  assert.equal((await flaky()).relayAvailable, true);
  now += RELAY_GRANT_REUSE_MS;
  const held = await flaky();
  assert.equal(held.degradedReason, 'rate_limit');
  assert.equal(held.relayAvailable, true, 'the held grant still carries the relay');
  assert.deepEqual(seen, ['internal', 'rate_limit'], 'each reason once; a refusal answered from a held grant is still a degradation of that reason');
  seen.length = 0;
  await createRoomIceResolver({ mode: 'private', room: null, onDegraded })();
  assert.deepEqual(seen, ['relay_unconfigured']);
  // the report carries a reason alone, and a reporter that throws never breaks a connection
  const thrower = createRoomIceResolver({ mode: 'private', room: scriptedRoom([refusal('relay_phase')]), onDegraded: () => { throw new Error('sink down'); } });
  assert.deepEqual(await thrower(), STUN_FALLBACK('relay_phase'));
  for (const reason of ['no_relay', 'internal', 'rate_limit', 'relay_unconfigured']) assert.match(reason, /^[a-z_]{1,48}$/);
  // a caller-supplied STUN list is honoured; anything but stun: is dropped from it
  const custom = await createRoomIceResolver({ mode: 'private', room: null, fallbackStunUrls: ['stun:a.test:3478', 'turn:evil.test:3478', 'stun:b.test:3478'] })();
  assert.deepEqual(custom.iceServers, [{ urls: ['stun:a.test:3478', 'stun:b.test:3478'] }]);
}

assert.throws(() => createRoomIceResolver({ mode: 'private', room: null, reuseMs: -1 }), /invalid/);
assert.throws(() => createRoomIceResolver({ mode: 'private', room: null, onDegraded: 'nope' }), /invalid/);
console.log('iceConfig.selftest: LAN asks nothing; the room\'s grant (TURN or STUN alone), one request per burst, reuse, the newest valid grant on a refusal, a timed-out first request asked once more, the official STUN servers last (never no servers), ice_degraded once per reason');
