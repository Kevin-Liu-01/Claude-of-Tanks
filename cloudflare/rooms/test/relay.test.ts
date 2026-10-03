/**
 * Relay credentials minted inside the room (2026-10-02, docs/MULTIPLAYER-V2.md §13.14), under wrangler.relay.test.jsonc:
 * the real Worker and Room object with a FAKE Cloudflare Realtime TURN key whose provider call is answered by a fetch
 * double (the object's outbound fetch is this isolate's global). A seated player of the running match receives a grant
 * minted for that request alone; a waiting room's seat, an unseated socket, a foreign room's seat, a newcomer the locked
 * match turns away, a seat whose match ended and a seat of an expired room are refused without a provider call; the seat's window refuses the seventh grant of a minute;
 * the eight-hour lease the configuration asks for is clamped to the hour; a failing provider degrades to STUN with one
 * warning that carries no secret. (No secret configured at all: test/p2p.test.ts, under wrangler.test.jsonc.)
 */
import { env } from 'cloudflare:workers';
import { reset, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ROOM_IDLE_TTL_MS, ROOM_RELAY_SEAT_LIMIT, ROOM_RELAY_WINDOW_MS } from '../../../src/mp/room/protocol.ts';
import type { RoomRelayPayload } from '../../../src/mp/room/protocol.ts';
import { closeClients, connect, create, identity, startedRoom, token } from './client.ts';

/** The fake key and token of wrangler.relay.test.jsonc (test values: nothing here is a real credential). */
const KEY_ID = 'relay-test-key-id';
const API_TOKEN = 'relay-test-api-token';
const STUN = 'stun:stun.cloudflare.com:3478';

interface ProviderCall { url: string; method: string; authorization: string | null; body: unknown }

/** The provider double: every call recorded, each answered with a credential of its own (`cred-<n>`). */
function provider(answer?: (call: ProviderCall, ordinal: number) => Response | Promise<Response>): ProviderCall[] {
  const calls: ProviderCall[] = [];
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const headers = new Headers(init?.headers);
    const call: ProviderCall = { url: String(input), method: String(init?.method ?? 'GET'), authorization: headers.get('authorization'), body: init?.body ? JSON.parse(String(init.body)) : null };
    calls.push(call);
    if (answer) return answer(call, calls.length);
    return new Response(JSON.stringify({ iceServers: [
      { urls: [STUN, 'stun:stun.cloudflare.com:53'] },
      { urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turns:turn.cloudflare.com:443?transport=tcp'], username: `user-${calls.length}`, credential: `cred-${calls.length}` },
    ] }), { status: 201 });
  });
  return calls;
}

const grantOf = (message: { type: string; payload: Record<string, unknown> }): RoomRelayPayload => {
  expect(message.type, JSON.stringify(message.payload)).toBe('room_relay');
  return message.payload as unknown as RoomRelayPayload;
};
const credentialOf = (grant: RoomRelayPayload): string | undefined => grant.iceServers.find((server) => server.credential)?.credential;
const codeOf = (message: { type: string; payload: Record<string, unknown> }): unknown => (message.type === 'error' ? message.payload.code : `${message.type} (not refused)`);

function storedText(code: string): Promise<string> {
  return runInDurableObject(env.ROOMS.getByName(code), (_instance, state) => state.storage.sql
    .exec<{ data: string }>('SELECT data FROM room_state WHERE id=1').toArray().map((row) => row.data).join('\n'));
}

/** Only Date is faked: the room object's own timers (deferred closes, coalesced broadcasts) keep running. */
function clockAhead(ms: number): void {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(Date.now() + ms);
}

afterEach(async () => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  closeClients();
  await reset();
});

describe('cot-rooms Worker: relay credentials minted inside the room for its seated players', () => {
  it('mints one grant per request for a seated player of the running match — host, peer and spectator alike, never cached across seats, the eight-hour ask clamped to the hour', async () => {
    const calls = provider();
    const { admin, guest, watcher } = await startedRoom('RLY010');
    const guestGrant = grantOf(await guest.request('room_relay'));
    expect(calls.length).toBe(1);
    expect(calls[0]).toEqual({
      url: `https://rtc.live.cloudflare.com/v1/turn/keys/${KEY_ID}/credentials/generate-ice-servers`,
      method: 'POST', authorization: `Bearer ${API_TOKEN}`, body: { ttl: 3600 },
    });
    expect(guestGrant).toEqual({
      iceServers: [
        { urls: [STUN, 'stun:stun.cloudflare.com:53'] },
        { urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turns:turn.cloudflare.com:443?transport=tcp'], username: 'user-1', credential: 'cred-1' },
      ],
      relay: true,
      expiresInSeconds: 3600,
    });
    const hostGrant = grantOf(await admin.request('room_relay'));
    const watcherGrant = grantOf(await watcher.request('room_relay'));
    const againGrant = grantOf(await guest.request('room_relay'));
    expect(calls.length, 'every request is its own provider call').toBe(4);
    expect([credentialOf(guestGrant), credentialOf(hostGrant), credentialOf(watcherGrant), credentialOf(againGrant)]).toEqual(['cred-1', 'cred-2', 'cred-3', 'cred-4']);
    // a grant goes to the requesting socket alone and never into the room's state, broadcasts or storage
    for (const [client, own] of [[guest, ['cred-1', 'cred-4']], [admin, ['cred-2']], [watcher, ['cred-3']]] as const) {
      const text = JSON.stringify(client.messages.filter((message) => message.type !== 'room_relay'));
      for (const credential of ['cred-1', 'cred-2', 'cred-3', 'cred-4', API_TOKEN, KEY_ID]) expect(text).not.toContain(credential);
      expect(client.all('room_relay').map((message) => credentialOf(message.payload as unknown as RoomRelayPayload))).toEqual(own);
    }
    const stored = await storedText('RLY010');
    for (const secret of ['cred-1', 'cred-2', 'user-1', API_TOKEN, KEY_ID]) expect(stored).not.toContain(secret);
  });

  it('refuses a waiting room\'s seat, an unseated socket, a foreign room\'s seat, a newcomer, a seat whose match ended and a seat of an expired room — none reaches the provider', async () => {
    const calls = provider();
    // no match yet: a seated player of a waiting room has nothing to connect to
    const waiting = await create('RLY020');
    expect(codeOf(await waiting.request('room_relay'))).toBe('relay_phase');
    const { admin, guest, matchId } = await startedRoom('RLY021');
    // a socket that never joined, and one that presented another seat's identity without its capability
    const stranger = await connect('RLY021', 'stranger');
    expect(codeOf(await stranger.request('room_relay'))).toBe('not_in_room');
    expect(codeOf(await stranger.request('room_join', identity('guest', token('9'), token('8'))))).toBe('resume_denied');
    expect(codeOf(await stranger.request('room_relay'))).toBe('not_in_room');
    // a seat of another room: that room runs no match; its socket is no seat of this one
    const foreign = await create('RLY022');
    expect(codeOf(await foreign.request('room_relay'))).toBe('relay_phase');
    // a running room admits no newcomer (it locks at the start and stays locked), so no seat without a token exists here;
    // the actor's receipt (src/mp/room/roomActor.selftest.mjs) refuses one restored without it
    const late = await connect('RLY021', 'late');
    expect(codeOf(await late.request('room_join', identity('late', token('3'), token('4'))))).toBe('room_locked');
    expect(codeOf(await late.request('room_relay'))).toBe('not_in_room');
    // a request the room could not answer to anyone (no requestId) is malformed
    guest.send('room_relay');
    expect((await guest.next((message) => message.type === 'error' && message.payload.code === 'invalid_payload')).requestId).toBeUndefined();
    expect(calls.length, 'no refused request reached the provider').toBe(0);
    // the seat's grant while the match runs, then the end: its seat token is gone and so is its relay
    grantOf(await guest.request('room_relay'));
    expect(calls.length).toBe(1);
    expect((await admin.command({ type: 'match_report', matchId, generation: 1, phase: 'ended', tick: 600, verdict: { result: 'alpha', reason: 'elimination' } })).type).toBe('room_ack');
    await guest.next((message) => message.type === 'match_status' && message.payload.status === 'ended');
    expect(codeOf(await guest.request('room_relay'))).toBe('relay_phase');
    expect(codeOf(await admin.request('room_relay'))).toBe('relay_phase');
    expect(calls.length).toBe(1);
    // the room expires 24 h after its last message: the seats are gone with it
    const { guest: expiring } = await startedRoom('RLY023');
    clockAhead(ROOM_IDLE_TTL_MS + 1);
    try { expect(await runDurableObjectAlarm(env.ROOMS.getByName('RLY023'))).toBe(true); }
    finally { vi.useRealTimers(); }
    expect((await expiring.closed).reason).toBe('expired');
    const after = await connect('RLY023', 'after');
    expect(codeOf(await after.request('room_relay'))).toBe('not_in_room');
    expect(codeOf(await after.request('room_join', identity('guest', token('d'), token('5'))))).toBe('room_not_found');
    expect(calls.length).toBe(1);
  });

  it('grants a seat six relays a minute, refuses the seventh without a provider call, and mints again in the next window', async () => {
    const calls = provider();
    const { guest, admin } = await startedRoom('RLY030');
    for (let index = 0; index < ROOM_RELAY_SEAT_LIMIT; index++) grantOf(await guest.request('room_relay'));
    expect(codeOf(await guest.request('room_relay'))).toBe('rate_limit');
    expect(calls.length).toBe(ROOM_RELAY_SEAT_LIMIT);
    // the window is the seat's: the host still has its own
    grantOf(await admin.request('room_relay'));
    expect(calls.length).toBe(ROOM_RELAY_SEAT_LIMIT + 1);
    clockAhead(ROOM_RELAY_WINDOW_MS + 1);
    grantOf(await guest.request('room_relay'));
    vi.useRealTimers();
    expect(calls.length, 'a fresh window mints again').toBe(ROOM_RELAY_SEAT_LIMIT + 2);
  });

  it('degrades to STUN with one warning when the provider fails, and the warning carries neither the token nor the key id', async () => {
    const warnings: string[] = [];
    vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => { warnings.push(args.map(String).join(' ')); });
    const calls = provider(() => new Response('{"error":"bad token"}', { status: 401 }));
    const { guest } = await startedRoom('RLY040');
    expect(grantOf(await guest.request('room_relay'))).toEqual({ iceServers: [{ urls: STUN }], relay: false });
    expect(calls.length).toBe(1);
    const lines = warnings.filter((line) => line.includes('cot-relay'));
    expect(lines.length).toBe(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({ tag: 'cot-relay', event: 'upstream_failure', error: 'turn_service_unavailable', upstreamStatus: 401, reason: 'http' });
    for (const secret of [API_TOKEN, KEY_ID, 'Bearer']) expect(lines[0]).not.toContain(secret);
    // a provider that never answers within its budget: the same STUN grant, the joiner never sees an error
    provider(() => { throw new DOMException('The operation was aborted due to timeout', 'TimeoutError'); });
    expect(grantOf(await guest.request('room_relay'))).toEqual({ iceServers: [{ urls: STUN }], relay: false });
  });
});

