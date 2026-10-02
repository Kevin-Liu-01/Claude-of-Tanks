/**
 * The deployed shape (Free plan, docs/MULTIPLAYER-V2.md §13): the Room object
 * with the peer-to-peer match host — no MATCH binding, no shim. The election,
 * the rtc:// URL, the per-match host secret (only on the host's own copies),
 * the signaling relay and its refusals, the host's reports, host migration on
 * a dropped socket (across an eviction), a leave and a decline, silence past
 * the report budget, the old host back as a peer, and the lost end. With no
 * relay secret (this configuration, 2026-10-02 §13.14) a seat's relay request
 * is answered with STUN alone — no provider call, no error to the joiner.
 */
import { env, exports } from 'cloudflare:workers';
import { evictDurableObject, reset, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RoomActorState } from '../../../src/mp/room/roomActor.ts';
import {
  ROOM_ADMIN_DISCONNECT_GRACE_MS, ROOM_HOST_DISCONNECT_GRACE_MS, ROOM_IDLE_TTL_MS, ROOM_KEEPALIVE_REQUEST, ROOM_KEEPALIVE_RESPONSE,
  ROOM_MATCH_REPORT_STALE_AFTER_MS, ROOM_MAX_PAYLOAD_BYTES, ROOM_RATE_MAX_MESSAGES, ROOM_SEAT_DISCONNECT_TTL_MS, ROOM_SIGNAL_MAX_BYTES,
  ROOM_STATE_COALESCE_MS,
} from '../../../src/mp/room/protocol.ts';
import type { RoomHostChangedPayload, RoomMatchStartPayload, RoomSnapshot } from '../../../src/mp/room/protocol.ts';
import { verifySeatToken } from '../../../server/match/seatToken.ts';
import { Client, closeClients, connect, create, identity, origin, startedRoom, token } from './client.ts';

const derivedSecret = (matchId: string): string => createHash('sha256').update(`${env.MATCH_SEAT_SECRET}:${matchId}`).digest('hex');
const room = (client: Client): RoomSnapshot => client.last('room_state')!.payload.room as RoomSnapshot;
const start = (client: Client): RoomMatchStartPayload => client.last('match_start')!.payload as unknown as RoomMatchStartPayload;

function storedState(code: string): Promise<RoomActorState> {
  return runInDurableObject(env.ROOMS.getByName(code), (_instance, state) => JSON.parse(state.storage.sql
    .exec<{ data: string }>('SELECT data FROM room_state WHERE id=1').one().data) as RoomActorState);
}

const alarmOf = (code: string): Promise<number | null> => runInDurableObject(env.ROOMS.getByName(code), (_instance, state) => state.storage.getAlarm());

/** Drop a socket from the room's side at once (a client-side close without a status trails by seconds in this runtime). */
async function dropSocket(client: Client): Promise<void> {
  client.socket.send(new Uint8Array(ROOM_MAX_PAYLOAD_BYTES + 1));
  await client.closed;
}

/** Move the clock past `ms` and run the room's alarm (the leases and the report budget are alarms). */
async function alarmAfter(code: string, ms: number): Promise<boolean> {
  vi.useFakeTimers();
  vi.setSystemTime(Date.now() + ms + 1);
  try { return await runDurableObjectAlarm(env.ROOMS.getByName(code)); }
  finally { vi.useRealTimers(); }
}

afterEach(async () => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  closeClients();
  await reset();
});

describe('cot-rooms Worker with the peer-to-peer match host (the deployed shape)', () => {
  it('names the p2p host in health and has no match socket to proxy', async () => {
    const health = await exports.default.fetch('https://room.test/healthz');
    expect(await health.json()).toEqual({ ok: true, service: 'cot-rooms', backend: 'durable-object', matchHost: 'p2p' });
    const proxied = await exports.default.fetch('https://room.test/rooms/ROOM10/match', { headers: { Upgrade: 'websocket', Origin: origin, 'CF-Connecting-IP': 'm' } });
    expect(proxied.status).toBe(503);
    expect(await proxied.json()).toEqual({ error: 'match_host_unavailable' });
  });

  it('starts a match in the admin\'s browser: the rtc:// URL and hostId for every seat, the per-match secret only for the host, tokens signed with it', async () => {
    const { admin, guest, watcher, matchId } = await startedRoom('ROOM11');
    const hostSecret = derivedSecret(matchId);
    for (const [client, playerId, team] of [[admin, 'admin', 'alpha'], [guest, 'guest', 'bravo'], [watcher, 'watcher', 'spectator']] as const) {
      const payload = start(client);
      expect(payload.matchUrl).toBe('rtc://ROOM11/1');
      expect(payload.hostId).toBe('admin');
      expect(payload.team).toBe(team);
      expect(payload.hostSecret).toBe(playerId === 'admin' ? hostSecret : undefined);
      const verified = verifySeatToken(hostSecret, payload.seatToken, Date.now());
      expect(verified.ok).toBe(true);
      if (verified.ok) expect(verified.claims.playerId).toBe(playerId);
      expect(verifySeatToken(env.MATCH_SEAT_SECRET, payload.seatToken, Date.now())).toEqual({ ok: false, reason: 'bad_signature' });
    }
    // the election, after every match_start, as host_changed(start); the host's copy carries the secret
    const adminChanged = (await admin.next((message) => message.type === 'host_changed')).payload as unknown as RoomHostChangedPayload;
    expect(adminChanged).toEqual({ hostId: 'admin', generation: 1, resumeTick: 0, reason: 'start', hostSecret });
    expect(admin.messages.findIndex((message) => message.type === 'match_start')).toBeLessThan(admin.messages.findIndex((message) => message.type === 'host_changed'));
    expect((await guest.next((message) => message.type === 'host_changed')).payload).toEqual({ hostId: 'admin', generation: 1, resumeTick: 0, reason: 'start' });
    expect((await watcher.next((message) => message.type === 'host_changed')).payload).toEqual({ hostId: 'admin', generation: 1, resumeTick: 0, reason: 'start' });
    // the room's host record, and the secret nowhere else: not in any room_state, not in the stored state
    const snapshot = room(guest);
    expect(snapshot.phase).toBe('starting');
    expect(snapshot.host).toMatchObject({ transport: 'p2p', hostId: 'admin', generation: 1 });
    expect(snapshot.players.every((player) => player.hostDeclined === false)).toBe(true);
    for (const client of [admin, guest, watcher]) {
      expect(JSON.stringify(client.all('room_state'))).not.toContain(hostSecret);
      expect(JSON.stringify(client.all('room_state'))).not.toContain(env.MATCH_SEAT_SECRET);
    }
    const stored = await storedState('ROOM11');
    expect(JSON.stringify(stored)).not.toContain(hostSecret);
    expect(JSON.stringify(stored)).not.toContain('hostSecret');
    expect(stored.matchUrl).toBe('rtc://ROOM11/1');
    expect(stored.nextPollAt).toBeNull();
    expect(stored.hostReportDueAt).not.toBeNull();
  });

  it('relays signals between the host and a peer with `from`, and refuses the wrong generation, non-host pairs, oversize and out-of-phase signals', async () => {
    const { admin, guest, watcher } = await startedRoom('ROOM12');
    const offer = { to: 'admin', generation: 1, kind: 'offer', sdp: 'v=0 offer-from-guest' };
    expect((await guest.request('room_signal', offer)).payload).toEqual({ relayed: true });
    const relayed = await admin.next((message) => message.type === 'room_signal');
    expect(relayed.payload).toEqual({ ...offer, from: 'guest' });
    const answer = { to: 'guest', generation: 1, kind: 'answer', sdp: 'v=0 answer-from-admin' };
    admin.send('room_signal', answer);
    expect((await guest.next((message) => message.type === 'room_signal')).payload).toEqual({ ...answer, from: 'admin' });
    const candidate = { to: 'admin', generation: 1, kind: 'candidate', candidate: { candidate: 'candidate:1 1 udp 1 203.0.113.1 5000 typ host', sdpMid: '0', sdpMLineIndex: 0 } };
    guest.send('room_signal', candidate);
    expect((await admin.next((message) => message.type === 'room_signal' && message.payload.kind === 'candidate')).payload).toEqual({ ...candidate, from: 'guest' });
    // a spectator is a peer of the host like anyone
    watcher.send('room_signal', { to: 'admin', generation: 1, kind: 'offer', sdp: 'v=0 offer-from-watcher' });
    expect((await admin.next((message) => message.type === 'room_signal' && message.payload.from === 'watcher')).payload.sdp).toBe('v=0 offer-from-watcher');
    // refusals
    expect((await guest.request('room_signal', { ...offer, generation: 2 })).payload.code).toBe('signal_generation');
    expect((await guest.request('room_signal', { to: 'watcher', generation: 1, kind: 'offer', sdp: 'x' })).payload.code).toBe('signal_target');
    expect((await watcher.request('room_signal', { to: 'guest', generation: 1, kind: 'offer', sdp: 'x' })).payload.code).toBe('signal_target');
    expect((await guest.request('room_signal', { to: 'guest', generation: 1, kind: 'offer', sdp: 'x' })).payload.code).toBe('signal_target');
    expect((await guest.request('room_signal', { to: 'nobody', generation: 1, kind: 'offer', sdp: 'x' })).payload.code).toBe('signal_target');
    expect((await guest.request('room_signal', { ...offer, sdp: 'v'.repeat(ROOM_SIGNAL_MAX_BYTES) })).payload.code).toBe('signal_size');
    expect((await guest.request('room_signal', { ...offer, kind: 'sdp' })).payload.code).toBe('invalid_payload');
    expect((await guest.request('room_signal', { ...offer, candidate: 'not a record' })).payload.code).toBe('invalid_payload');
    // a room without a running match: out of phase
    const idle = await create('ROOM13');
    const other = await connect('ROOM13', 'other');
    await other.request('room_join', identity('other', token('c'), token('d')));
    expect((await other.request('room_signal', { to: 'admin', generation: 0, kind: 'offer', sdp: 'x' })).payload.code).toBe('signal_phase');
    expect(idle.all('room_signal').length).toBe(0);
    expect(admin.all('room_signal').length).toBe(3);
  });

  it('follows the host\'s reports, migrates after the 8 s grace across an eviction, seats the old host as a peer, and records the successor\'s verdict', async () => {
    const { admin, guest, watcher, matchId } = await startedRoom('ROOM14');
    // only the host of the current generation reports
    expect((await guest.command({ type: 'match_report', matchId, generation: 1, phase: 'playing', tick: 10 })).payload.code).toBe('host_only');
    expect((await admin.command({ type: 'match_report', matchId, generation: 2, phase: 'playing', tick: 10 })).payload.code).toBe('host_only');
    expect((await admin.command({ type: 'match_report', matchId: 'm9-ffffffff', generation: 1, phase: 'playing' })).payload.code).toBe('invalid_command');
    expect((await admin.command({ type: 'match_report', matchId, generation: 1, phase: 'live' })).payload.code).toBe('invalid_payload');
    expect((await admin.command({ type: 'match_report', matchId, generation: 1, phase: 'loading', tick: 0 })).type).toBe('room_ack');
    expect(room(guest).phase).toBe('starting');
    expect((await admin.command({ type: 'match_report', matchId, generation: 1, phase: 'playing', tick: 300 })).type).toBe('room_ack');
    const playing = (await guest.next((message) => message.type === 'room_state' && (message.payload.room as RoomSnapshot).phase === 'playing')).payload.room as RoomSnapshot;
    expect(playing.match?.status).toBe('playing');
    // the host's socket drops (an oversized frame makes the object close it: a server-side close completes at once,
    // where a client-side close() without a status trails by seconds in this runtime): nothing moves until the grace
    admin.socket.send(new Uint8Array(ROOM_MAX_PAYLOAD_BYTES + 1));
    await admin.closed;
    await guest.next((message) => message.type === 'room_state' && (message.payload.room as RoomSnapshot).players.find((player) => player.id === 'admin')?.connected === false);
    const leaseAt = await runInDurableObject(env.ROOMS.getByName('ROOM14'), (_instance, state) => state.storage.getAlarm());
    expect(leaseAt).not.toBeNull();
    expect((leaseAt ?? 0) - Date.now()).toBeLessThanOrEqual(ROOM_HOST_DISCONNECT_GRACE_MS);
    expect((await storedState('ROOM14')).hostReport).toMatchObject({ generation: 1, phase: 'playing', tick: 300 });
    // the object is evicted meanwhile: the lease, the report and the election come back from storage
    await evictDurableObject(env.ROOMS.getByName('ROOM14'));
    expect((await guest.request('room_ping')).type).toBe('room_pong');
    expect(await alarmAfter('ROOM14', ROOM_HOST_DISCONNECT_GRACE_MS)).toBe(true);
    const guestChanged = (await guest.next((message) => message.type === 'host_changed' && message.payload.generation === 2)).payload as unknown as RoomHostChangedPayload;
    expect(guestChanged).toEqual({ hostId: 'guest', generation: 2, resumeTick: 300, reason: 'timeout', hostSecret: derivedSecret(matchId) });
    expect((await watcher.next((message) => message.type === 'host_changed' && message.payload.generation === 2)).payload).toEqual({ hostId: 'guest', generation: 2, resumeTick: 300, reason: 'timeout' });
    const migrated = (await guest.next((message) => message.type === 'room_state' && (message.payload.room as RoomSnapshot).host.generation === 2)).payload.room as RoomSnapshot;
    expect(migrated.host.hostId).toBe('guest');
    expect(migrated.phase).toBe('playing');
    expect(migrated.match?.id).toBe(matchId);
    // the old host is back: a peer of the new host, with the current URL and no secret; its reports are refused
    const returned = await connect('ROOM14', 'admin-again');
    expect((await returned.request('room_join', identity('admin', token('b'), token('9')))).type).toBe('room_joined');
    const again = (await returned.next((message) => message.type === 'match_start')).payload as unknown as RoomMatchStartPayload;
    expect(again.matchUrl).toBe('rtc://ROOM14/2');
    expect(again.hostId).toBe('guest');
    expect(again.hostSecret).toBeUndefined();
    expect(again.seatToken).toBe(start(admin).seatToken);
    expect((await returned.command({ type: 'match_report', matchId, generation: 2, phase: 'playing', tick: 400 })).payload.code).toBe('host_only');
    expect((await returned.request('room_signal', { to: 'guest', generation: 2, kind: 'offer', sdp: 'v=0 rejoin' })).payload).toEqual({ relayed: true });
    expect((await guest.next((message) => message.type === 'room_signal')).payload.from).toBe('admin');
    // the successor's verdict ends the match: match_status to everyone, the room waiting, the election cleared
    expect((await guest.command({ type: 'match_report', matchId, generation: 2, phase: 'ended', tick: 900, verdict: { result: 'bravo', reason: 'elimination' } })).type).toBe('room_ack');
    for (const client of [guest, watcher, returned]) {
      const status = await client.next((message) => message.type === 'match_status');
      expect(status.payload.status).toBe('ended');
      expect(status.payload.verdict).toEqual({ result: 'bravo', reason: 'elimination' });
    }
    const finished = (await guest.next((message) => message.type === 'room_state' && (message.payload.room as RoomSnapshot).phase === 'waiting' && (message.payload.room as RoomSnapshot).lastResult !== null)).payload.room as RoomSnapshot;
    expect(finished.lastResult).toEqual({ round: 1, result: 'bravo', reason: 'elimination' });
    expect(finished.host).toMatchObject({ transport: 'p2p', hostId: null, generation: 2 });
    expect((await guest.command({ type: 'match_report', matchId, generation: 2, phase: 'playing' })).payload.code).toBe('invalid_command');
    const stored = await storedState('ROOM14');
    expect(stored.hostReport).toBeNull();
    expect(stored.hostReportDueAt).toBeNull();
    expect(Object.keys(stored.matchTokens)).toEqual([]);
    // a rematch (started by the admin, back inside its grace) elects at generation 3 — the admin again — and issues
    // tokens under the new match's secret
    await guest.command({ type: 'set_ready', ready: true });
    await returned.command({ type: 'set_ready', ready: true });
    expect((await guest.command({ type: 'start' })).payload.code).toBe('admin_only');
    const ack = await returned.command({ type: 'start' });
    expect(ack.type).toBe('room_ack');
    const second = (await guest.next((message) => message.type === 'match_start' && message.payload.round === 2)).payload as unknown as RoomMatchStartPayload;
    expect(second.matchUrl).toBe('rtc://ROOM14/3');
    expect(second.hostId).toBe('admin');
    expect(second.hostSecret).toBeUndefined();
    const adminSecond = (await returned.next((message) => message.type === 'match_start' && message.payload.round === 2)).payload as unknown as RoomMatchStartPayload;
    expect(adminSecond.hostSecret).toBe(derivedSecret(ack.payload.matchId as string));
    expect(verifySeatToken(derivedSecret(ack.payload.matchId as string), second.seatToken, Date.now()).ok).toBe(true);
    expect(verifySeatToken(derivedSecret(matchId), second.seatToken, Date.now()).ok).toBe(false);
  });

  it('honours a decline at start and mid-match (P1b: a departure — the next candidate at once, never a seat that stepped down), migrates at once on a leave, and ends lost with no commander left', async () => {
    const { admin, guest, third, watcher, matchId } = await startedRoom('ROOM15', { adminDeclines: true, third: true });
    expect(start(admin).hostId).toBe('guest');
    expect(start(admin).hostSecret).toBeUndefined();
    expect(start(guest).hostSecret).toBe(derivedSecret(matchId));
    expect(room(watcher).players.find((player) => player.id === 'admin')?.hostDeclined).toBe(true);
    // the host declines while the match runs: the third seat is the willing successor (the admin declined)
    expect((await guest.command({ type: 'match_report', matchId, generation: 1, phase: 'playing', tick: 120 })).type).toBe('room_ack');
    expect((await guest.command({ type: 'host_decline', declined: true })).type).toBe('room_ack');
    const declined = (await third!.next((message) => message.type === 'host_changed' && message.payload.generation === 2)).payload as unknown as RoomHostChangedPayload;
    expect(declined).toEqual({ hostId: 'third', generation: 2, resumeTick: 120, reason: 'declined', hostSecret: derivedSecret(matchId) });
    expect((await admin.next((message) => message.type === 'host_changed' && message.payload.generation === 2)).payload.hostSecret).toBeUndefined();
    expect((await storedState('ROOM15')).steppedDown).toEqual(['guest']);
    // the new host declines with no WILLING successor left (P1 kept it and stalled its peers for the 30 s report
    // budget): the admin — declined, but the last resort — takes over at once; the guest, which stepped down, is skipped
    expect((await third!.command({ type: 'host_decline', declined: true })).type).toBe('room_ack');
    const lastResort = (await admin.next((message) => message.type === 'host_changed' && message.payload.generation === 3)).payload as unknown as RoomHostChangedPayload;
    expect(lastResort).toEqual({ hostId: 'admin', generation: 3, resumeTick: 0, reason: 'declined', hostSecret: derivedSecret(matchId) });
    expect((await guest.next((message) => message.type === 'host_changed' && message.payload.generation === 3)).payload.hostSecret).toBeUndefined();
    expect((await storedState('ROOM15')).steppedDown).toEqual(['guest', 'third']);
    // every commander has stepped down: the admin's own decline finds nobody — it keeps hosting, no fourth election
    expect((await admin.command({ type: 'host_decline', declined: true })).type).toBe('room_ack');
    expect((await storedState('ROOM15')).steppedDown).toEqual(['guest', 'third', 'admin']);
    expect(room(watcher).host).toMatchObject({ hostId: 'admin', generation: 3 });
    expect(admin.all('host_changed').length).toBe(3);
    // the host leaves: at once, by the full ladder — the guest, lowest joinedAt of the declined, stepped down or not
    expect((await admin.request('room_leave')).type).toBe('room_ack');
    const left = (await guest.next((message) => message.type === 'host_changed' && message.payload.generation === 4)).payload as unknown as RoomHostChangedPayload;
    expect(left).toEqual({ hostId: 'guest', generation: 4, resumeTick: 0, reason: 'left', hostSecret: derivedSecret(matchId) });
    expect((await watcher.next((message) => message.type === 'host_changed' && message.payload.generation === 4)).payload.hostSecret).toBeUndefined();
    expect(room(watcher).phase).toBe('playing');
    expect(room(watcher).adminId).toBe('guest');
    // the guest leaves too: the third seat hosts as the last commander; the room's admin role moved with it
    expect((await guest.request('room_leave')).type).toBe('room_ack');
    const last = (await third!.next((message) => message.type === 'host_changed' && message.payload.generation === 5)).payload as unknown as RoomHostChangedPayload;
    expect(last).toEqual({ hostId: 'third', generation: 5, resumeTick: 0, reason: 'left', hostSecret: derivedSecret(matchId) });
    expect(room(watcher).adminId).toBe('third');
    // the last commander leaves: the match is lost, the room waits, only the spectator remains; the stepped-down set clears
    expect((await third!.request('room_leave')).type).toBe('room_ack');
    const lost = await watcher.next((message) => message.type === 'match_status' && message.payload.status === 'lost');
    expect(lost.payload.verdict).toBeNull();
    const after = (await watcher.next((message) => message.type === 'room_state' && (message.payload.room as RoomSnapshot).phase === 'waiting' && (message.payload.room as RoomSnapshot).lastResult !== null)).payload.room as RoomSnapshot;
    expect(after.lastResult).toEqual({ round: 1, result: null, reason: 'match_lost' });
    expect(after.host).toMatchObject({ hostId: null, generation: 5 });
    expect(after.players.map((player) => player.id)).toEqual(['watcher']);
    expect((await storedState('ROOM15')).steppedDown).toEqual([]);
  });

  it('treats a host silent for three poll intervals as dropped', async () => {
    const { admin, guest, matchId } = await startedRoom('ROOM16');
    expect((await admin.command({ type: 'match_report', matchId, generation: 1, phase: 'playing', tick: 60 })).type).toBe('room_ack');
    expect(await alarmAfter('ROOM16', ROOM_MATCH_REPORT_STALE_AFTER_MS)).toBe(true);
    const changed = (await guest.next((message) => message.type === 'host_changed' && message.payload.generation === 2)).payload as unknown as RoomHostChangedPayload;
    expect(changed).toMatchObject({ hostId: 'guest', generation: 2, resumeTick: 60, reason: 'timeout' });
    expect(changed.hostSecret).toBe(derivedSecret(matchId));
    expect((await admin.next((message) => message.type === 'host_changed' && message.payload.generation === 2)).payload.hostSecret).toBeUndefined();
    // the silent host, still connected, is a peer now: its report is refused, the new host's accepted
    expect((await admin.command({ type: 'match_report', matchId, generation: 1, phase: 'playing', tick: 61 })).payload.code).toBe('host_only');
    expect((await guest.command({ type: 'match_report', matchId, generation: 2, phase: 'playing', tick: 61 })).type).toBe('room_ack');
  });

  // ---- P1b cost pass (2026-09-28)

  it('answers the keepalive frame through the hibernation auto-response: the object never handles it, the runtime records it, and the rate window never sees it', async () => {
    const admin = await create('ROOM17');
    const guest = await connect('ROOM17', 'ROOM17-guest');
    expect((await guest.request('room_join', identity('guest', token('c'), token('d')))).type).toBe('room_joined');
    const before = await storedState('ROOM17');
    const socketsBefore = await runInDurableObject(env.ROOMS.getByName('ROOM17'), (_instance, state) =>
      state.getWebSockets().map((ws) => state.getWebSocketAutoResponseTimestamp(ws)));
    expect(socketsBefore).toEqual([null, null]);
    // the exact text frame is answered with the exact text frame, in order, without any envelope
    guest.socket.send(ROOM_KEEPALIVE_REQUEST);
    expect(await guest.rawCount(1)).toBe(1);
    expect(guest.raw).toEqual([ROOM_KEEPALIVE_RESPONSE]);
    expect(guest.all('room_pong').length).toBe(0);
    // the runtime recorded it on that socket alone; the actor saw nothing (its touch is unchanged)
    const stamps = await runInDurableObject(env.ROOMS.getByName('ROOM17'), (_instance, state) =>
      state.getWebSockets().map((ws) => state.getWebSocketAutoResponseTimestamp(ws)?.getTime() ?? null));
    expect(stamps.filter((stamp) => stamp !== null).length).toBe(1);
    expect(stamps.some((stamp) => stamp !== null && Math.abs(stamp - Date.now()) < 5_000)).toBe(true);
    expect((await storedState('ROOM17')).room?.touchedAt).toBe(before.room?.touchedAt);
    expect(await runInDurableObject(env.ROOMS.getByName('ROOM17'), (_instance, state) => state.getWebSocketAutoResponse()?.request)).toBe(ROOM_KEEPALIVE_REQUEST);
    // the record lives with the socket in the runtime, not with the object: it survives an eviction (the 24 h expiry reads it after any number of restarts)
    await evictDurableObject(env.ROOMS.getByName('ROOM17'));
    const afterEviction = await runInDurableObject(env.ROOMS.getByName('ROOM17'), (_instance, state) =>
      state.getWebSockets().map((ws) => state.getWebSocketAutoResponseTimestamp(ws)?.getTime() ?? null));
    expect(afterEviction.filter((stamp) => stamp !== null)).toEqual(stamps.filter((stamp) => stamp !== null));
    expect(await runInDurableObject(env.ROOMS.getByName('ROOM17'), (_instance, state) => state.getWebSocketAutoResponse()?.response)).toBe(ROOM_KEEPALIVE_RESPONSE);
    // the frame is a keepalive, not a message: more of them than the rate window allows leave the socket open and every
    // one answered (the envelope ping, still accepted for older clients, closes the socket as rate_limit past the window)
    for (let index = 0; index < ROOM_RATE_MAX_MESSAGES + 10; index++) guest.socket.send(ROOM_KEEPALIVE_REQUEST);
    expect(await guest.rawCount(ROOM_RATE_MAX_MESSAGES + 11, 10_000)).toBe(ROOM_RATE_MAX_MESSAGES + 11);
    expect(guest.raw.every((frame) => frame === ROOM_KEEPALIVE_RESPONSE)).toBe(true);
    expect((await guest.request('room_ping')).type).toBe('room_pong');
    expect((await guest.command({ type: 'set_ready', ready: true })).type).toBe('room_ack');
    // a text frame that is not the keepalive is an envelope like any other (here: not JSON → invalid_payload)
    guest.socket.send('nope');
    expect((await guest.next((message) => message.type === 'error')).payload.code).toBe('invalid_payload');
    // the same frame from an older client's envelope path still works, and the rate window counts those
    for (let index = 0; index < ROOM_RATE_MAX_MESSAGES + 10; index++) admin.send('room_ping');
    const closed = await admin.closed;
    expect(closed.reason).toBe('rate_limit');
  });

  it('coalesces room_state: a burst of changes fans out once per window with the newest revision, and an ack names the revision it produced', async () => {
    const admin = await create('ROOM18');
    const guest = await connect('ROOM18', 'ROOM18-guest');
    expect((await guest.request('room_join', identity('guest', token('c'), token('d')))).type).toBe('room_joined');
    const watcher = await connect('ROOM18', 'ROOM18-watcher');
    expect((await watcher.request('room_join', identity('watcher', token('e'), token('f'), { team: 'spectator' }))).type).toBe('room_joined');
    await admin.next((message) => message.type === 'room_state' && (message.payload.room as RoomSnapshot).players.length === 3);
    // let the joins' window pass, then a burst of readiness toggles from one seat, each acknowledged
    await new Promise((resolve) => setTimeout(resolve, ROOM_STATE_COALESCE_MS + 50));
    const statesBefore = admin.all('room_state').length;
    const toggles = 12;
    const acks: number[] = [];
    for (let index = 0; index < toggles; index++) {
      const ack = await guest.command({ type: 'set_ready', ready: index % 2 === 0 });
      expect(ack.type).toBe('room_ack');
      acks.push(ack.payload.revision as number);
    }
    // every seat converges to the last acknowledged revision within the window
    const final = (await admin.next((message) => message.type === 'room_state' && (message.payload.room as RoomSnapshot).revision >= acks[toggles - 1]!, ROOM_STATE_COALESCE_MS * 4)).payload.room as RoomSnapshot;
    expect(final.revision).toBe(acks[toggles - 1]);
    expect(final.players.find((player) => player.id === 'guest')?.ready).toBe(false);
    await watcher.next((message) => message.type === 'room_state' && (message.payload.room as RoomSnapshot).revision >= acks[toggles - 1]!, ROOM_STATE_COALESCE_MS * 4);
    const fanOut = admin.all('room_state').length - statesBefore;
    expect(fanOut).toBeGreaterThanOrEqual(1);
    expect(fanOut).toBeLessThan(toggles);
    expect(acks).toEqual([...acks].sort((a, b) => a - b));
    expect(new Set(acks).size).toBe(toggles);
    // a join inside a window broadcasts at once, with every coalesced change folded in
    const third = await connect('ROOM18', 'ROOM18-third');
    expect((await guest.command({ type: 'select_vehicle', specId: 't90m' })).type).toBe('room_ack');
    expect((await third.request('room_join', identity('third', token('1'), token('2')))).type).toBe('room_joined');
    const joined = (await admin.next((message) => message.type === 'room_state' && (message.payload.room as RoomSnapshot).players.length === 4)).payload.room as RoomSnapshot;
    expect(joined.players.find((player) => player.id === 'guest')?.specId).toBe('t90m');
  });

  // ---- the lifecycle proofs (2026-09-30, docs/MULTIPLAYER-V2.md §13.11): rooms never hang

  it('keeps an emptied room for its idle TTL with the expiry as its only alarm; the next seat to join owns it and can start', async () => {
    const admin = await create('ROOM19', { teamSize: 1, mapId: 'verdant' });
    const createdAt = (await storedState('ROOM19')).room!.createdAt;
    expect((await admin.request('room_leave')).type).toBe('room_ack');
    await admin.closed;
    const emptied = await storedState('ROOM19');
    expect(emptied.room?.players).toEqual([]);
    expect(emptied.room?.phase).toBe('waiting');
    expect(emptied.adminLeaseAt).toBeNull();
    const alarm = await alarmOf('ROOM19');
    expect(alarm).not.toBeNull();
    expect(Math.abs((alarm ?? 0) - (emptied.room!.touchedAt + ROOM_IDLE_TTL_MS))).toBeLessThanOrEqual(1_000);
    expect(emptied.room!.touchedAt).toBeGreaterThanOrEqual(createdAt);
    // the departed creator's id stayed admin before: no joiner's snapshot validated, the code was dead for 24 h
    const late = await connect('ROOM19', 'ROOM19-late');
    const joined = await late.request('room_join', identity('late', token('c'), token('d')));
    expect(joined.type).toBe('room_joined');
    const snapshot = joined.payload.room as RoomSnapshot;
    expect(snapshot.adminId).toBe('late');
    expect(snapshot.players.map((player) => [player.id, player.isAdmin])).toEqual([['late', true]]);
    expect((await late.command({ type: 'set_ready', ready: true })).type).toBe('room_ack');
    const ack = await late.command({ type: 'start' });
    expect(ack.type).toBe('room_ack');
    await late.next((message) => message.type === 'match_start');
    expect(start(late).hostId).toBe('late');
    expect(start(late).hostSecret).toBe(derivedSecret(ack.payload.matchId as string));
  });

  it('does not re-arm the admin lease while nobody else is connected, and hands the room to the next seat admitted at once', async () => {
    const admin = await create('ROOM20', { teamSize: 2 });
    await dropSocket(admin);
    const dropped = await storedState('ROOM20');
    const droppedAt = dropped.room!.touchedAt;
    expect(dropped.adminLeaseAt).toBe(droppedAt + ROOM_ADMIN_DISCONNECT_GRACE_MS);
    // the lease is held, but the alarm is the seat's reap: there is nobody to migrate to (the lease re-armed every 30 s before)
    const alarm = await alarmOf('ROOM20');
    expect(Math.abs((alarm ?? 0) - (droppedAt + ROOM_SEAT_DISCONNECT_TTL_MS))).toBeLessThanOrEqual(1_000);
    // the reap alarm run early (the runtime helper runs whatever alarm is set): the due lease finds nobody and stays, un-re-armed
    await alarmAfter('ROOM20', ROOM_ADMIN_DISCONNECT_GRACE_MS);
    expect((await storedState('ROOM20')).adminLeaseAt).toBe(droppedAt + ROOM_ADMIN_DISCONNECT_GRACE_MS);
    expect((await storedState('ROOM20')).room!.adminId).toBe('admin');
    expect(Math.abs(((await alarmOf('ROOM20')) ?? 0) - (droppedAt + ROOM_SEAT_DISCONNECT_TTL_MS))).toBeLessThanOrEqual(1_000);
    // two minutes into the absence a guest joins: the due lease becomes the alarm and runs at once — the guest is admin
    vi.useFakeTimers();
    vi.setSystemTime(droppedAt + 120_000);
    const guest = await connect('ROOM20', 'ROOM20-guest');
    expect((await guest.request('room_join', identity('guest', token('c'), token('d')))).type).toBe('room_joined');
    const due = await alarmOf('ROOM20');
    expect(due).not.toBeNull();
    expect(due!).toBeLessThanOrEqual(Date.now());
    await runDurableObjectAlarm(env.ROOMS.getByName('ROOM20'));
    vi.useRealTimers();
    const migrated = (await guest.next((message) => message.type === 'room_state' && (message.payload.room as RoomSnapshot).adminId === 'guest')).payload.room as RoomSnapshot;
    expect(migrated.players.find((player) => player.id === 'guest')?.isAdmin).toBe(true);
    expect((await storedState('ROOM20')).adminLeaseAt).toBeNull();
  });

  it('keeps a disconnected admin\'s lease when another seat leaves during the grace', async () => {
    const admin = await create('ROOM21', { teamSize: 3 });
    const guest = await connect('ROOM21', 'ROOM21-guest');
    expect((await guest.request('room_join', identity('guest', token('c'), token('d')))).type).toBe('room_joined');
    const third = await connect('ROOM21', 'ROOM21-third');
    expect((await third.request('room_join', identity('third', token('e'), token('f')))).type).toBe('room_joined');
    await dropSocket(admin);
    const leaseAt = (await storedState('ROOM21')).adminLeaseAt;
    expect(leaseAt).not.toBeNull();
    expect((await third.request('room_leave')).type).toBe('room_ack');
    await third.closed;
    // the leave cleared the lease before: the guest then had no admin until the admin came back or the room expired
    expect((await storedState('ROOM21')).adminLeaseAt).toBe(leaseAt);
    expect(Math.abs(((await alarmOf('ROOM21')) ?? 0) - leaseAt!)).toBeLessThanOrEqual(1_000);
    expect(await alarmAfter('ROOM21', ROOM_ADMIN_DISCONNECT_GRACE_MS)).toBe(true);
    const migrated = (await guest.next((message) => message.type === 'room_state' && (message.payload.room as RoomSnapshot).adminId === 'guest')).payload.room as RoomSnapshot;
    expect(migrated.players.map((player) => player.id).sort()).toEqual(['admin', 'guest']);
  });

  it('reaps a seat whose socket stayed gone for the disconnect TTL while the room waits — never during a match, whose end restarts the lease', async () => {
    const admin = await create('ROOM22', { teamSize: 1, mapId: 'verdant' });
    const guest = await connect('ROOM22', 'ROOM22-guest');
    expect((await guest.request('room_join', identity('guest', token('c'), token('d')))).type).toBe('room_joined');
    await dropSocket(guest);
    const dropped = await storedState('ROOM22');
    const droppedAt = dropped.room!.touchedAt;
    expect(dropped.seatLeases).toEqual({ guest: droppedAt + ROOM_SEAT_DISCONNECT_TTL_MS });
    expect(Math.abs(((await alarmOf('ROOM22')) ?? 0) - (droppedAt + ROOM_SEAT_DISCONNECT_TTL_MS))).toBeLessThanOrEqual(1_000);
    // the ghost holds bravo: a newcomer is refused (the stuck 1v1 room the proofs found)
    const newcomer = await connect('ROOM22', 'ROOM22-new');
    expect((await newcomer.request('room_join', identity('new', token('1'), token('2')))).payload.code).toBe('room_full');
    newcomer.socket.close();
    expect(await alarmAfter('ROOM22', ROOM_SEAT_DISCONNECT_TTL_MS)).toBe(true);
    const reaped = (await admin.next((message) => message.type === 'room_state' && (message.payload.room as RoomSnapshot).players.length === 1)).payload.room as RoomSnapshot;
    expect(reaped.players.map((player) => player.id)).toEqual(['admin']);
    expect(reaped.touchedAt).toBe(droppedAt);
    const afterReap = await storedState('ROOM22');
    expect(afterReap.seatLeases).toEqual({});
    expect(afterReap.resumeHashes.guest).toBeUndefined();
    // the freed slot: the newcomer joins; then a match starts and its seat drops — kept for the match
    const again = await connect('ROOM22', 'ROOM22-again');
    expect((await again.request('room_join', identity('new', token('1'), token('2')))).type).toBe('room_joined');
    expect((await admin.command({ type: 'set_ready', ready: true })).type).toBe('room_ack');
    expect((await again.command({ type: 'set_ready', ready: true })).type).toBe('room_ack');
    const ack = await admin.command({ type: 'start' });
    expect(ack.type).toBe('room_ack');
    const matchId = ack.payload.matchId as string;
    await dropSocket(again);
    const inMatch = await storedState('ROOM22');
    expect(inMatch.seatLeases!.new).toBeDefined();
    expect(inMatch.room!.players.length).toBe(2);
    const budget = await alarmOf('ROOM22');
    expect(budget!).toBeLessThan(inMatch.seatLeases!.new!);
    expect((await admin.command({ type: 'match_report', matchId, generation: 1, phase: 'playing', tick: 60 })).type).toBe('room_ack');
    expect((await admin.command({ type: 'match_report', matchId, generation: 1, phase: 'ended', tick: 900, verdict: { result: 'alpha', reason: 'elimination' } })).type).toBe('room_ack');
    await admin.next((message) => message.type === 'room_state' && (message.payload.room as RoomSnapshot).phase === 'waiting' && (message.payload.room as RoomSnapshot).lastResult !== null);
    const ended = await storedState('ROOM22');
    expect(ended.room!.players.length).toBe(2);
    expect(ended.seatLeases!.new).toBe(ended.room!.match!.endedAt! + ROOM_SEAT_DISCONNECT_TTL_MS);
    expect(Math.abs(((await alarmOf('ROOM22')) ?? 0) - ended.seatLeases!.new!)).toBeLessThanOrEqual(1_000);
  });

  it('ends the match at once when the elected last resort cannot host (`unable`) and nobody else can — the report budget ran before', async () => {
    const { admin, guest, watcher, matchId } = await startedRoom('ROOM23');
    expect((await guest.command({ type: 'host_decline', declined: true, unable: true })).type).toBe('room_ack');
    expect((await guest.command({ type: 'host_decline', declined: true, unable: 'yes' })).payload.code).toBe('invalid_command');
    expect((await admin.command({ type: 'match_report', matchId, generation: 1, phase: 'playing', tick: 90 })).type).toBe('room_ack');
    await dropSocket(admin);
    expect(await alarmAfter('ROOM23', ROOM_HOST_DISCONNECT_GRACE_MS)).toBe(true);
    const elected = (await guest.next((message) => message.type === 'host_changed' && message.payload.generation === 2)).payload as unknown as RoomHostChangedPayload;
    expect(elected).toEqual({ hostId: 'guest', generation: 2, resumeTick: 90, reason: 'timeout', hostSecret: derivedSecret(matchId) });
    expect((await storedState('ROOM23')).hostReportDueAt).not.toBeNull();
    // its client answers at once: elected but unable — the match is lost now, not after the 30 s report budget
    expect((await guest.command({ type: 'host_decline', declined: true, unable: true })).type).toBe('room_ack');
    for (const client of [guest, watcher]) expect((await client.next((message) => message.type === 'match_status')).payload.status).toBe('lost');
    const lost = (await watcher.next((message) => message.type === 'room_state' && (message.payload.room as RoomSnapshot).phase === 'waiting' && (message.payload.room as RoomSnapshot).lastResult !== null)).payload.room as RoomSnapshot;
    expect(lost.lastResult).toEqual({ round: 1, result: null, reason: 'match_lost' });
    expect(lost.host).toMatchObject({ hostId: null, generation: 2 });
    const stored = await storedState('ROOM23');
    expect(stored.hostReportDueAt).toBeNull();
    expect(stored.hostLeaseAt).toBeNull();
    expect(stored.steppedDown).toEqual([]);
    // the admin's seat, disconnected, is kept for its lease from the match's end
    expect(stored.seatLeases!.admin).toBe(stored.room!.match!.endedAt! + ROOM_SEAT_DISCONNECT_TTL_MS);
  });

  it('answers a seat\'s relay request with STUN alone while no relay secret is set: no provider call, no error, the link and the room carry on (§13.14)', async () => {
    const fetches: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => { fetches.push(String(input)); throw new Error('no provider call without a secret'); });
    const warnings: string[] = [];
    vi.spyOn(console, 'warn').mockImplementation((...args: unknown[]) => { warnings.push(args.map(String).join(' ')); });
    const { admin, guest, watcher } = await startedRoom('ROOM24');
    for (const client of [guest, admin, watcher]) {
      const answer = await client.request('room_relay');
      expect(answer.type).toBe('room_relay');
      expect(answer.payload).toEqual({ iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }], relay: false });
    }
    expect(fetches).toEqual([]);
    expect(warnings.filter((line) => line.includes('cot-relay')), 'an unset secret is the configured STUN-only room, not a fault').toEqual([]);
    // the signaling relay is untouched: the peer's offer still reaches the host
    expect((await guest.request('room_signal', { to: 'admin', generation: 1, kind: 'offer', sdp: 'v=0 stun-only' })).payload).toEqual({ relayed: true });
    expect((await admin.next((message) => message.type === 'room_signal')).payload.sdp).toBe('v=0 stun-only');
  });
});
