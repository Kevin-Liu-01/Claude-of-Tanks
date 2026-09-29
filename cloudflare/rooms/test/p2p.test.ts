/**
 * The deployed shape (Free plan, docs/MULTIPLAYER-V2.md §13): the Room object
 * with the peer-to-peer match host — no MATCH binding, no shim. The election,
 * the rtc:// URL, the per-match host secret (only on the host's own copies),
 * the signaling relay and its refusals, the host's reports, host migration on
 * a dropped socket (across an eviction), a leave and a decline, silence past
 * the report budget, the old host back as a peer, and the lost end.
 */
import { env, exports } from 'cloudflare:workers';
import { evictDurableObject, reset, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RoomActorState } from '../../../src/mp/room/roomActor.ts';
import { ROOM_HOST_DISCONNECT_GRACE_MS, ROOM_MATCH_REPORT_STALE_AFTER_MS, ROOM_MAX_PAYLOAD_BYTES, ROOM_SIGNAL_MAX_BYTES } from '../../../src/mp/room/protocol.ts';
import type { RoomHostChangedPayload, RoomMatchStartPayload, RoomSnapshot } from '../../../src/mp/room/protocol.ts';
import { verifySeatToken } from '../../../server/match/seatToken.ts';
import { Client, closeClients, connect, create, identity, origin, token } from './client.ts';

const derivedSecret = (matchId: string): string => createHash('sha256').update(`${env.MATCH_SEAT_SECRET}:${matchId}`).digest('hex');
const room = (client: Client): RoomSnapshot => client.last('room_state')!.payload.room as RoomSnapshot;
const start = (client: Client): RoomMatchStartPayload => client.last('match_start')!.payload as unknown as RoomMatchStartPayload;

function storedState(code: string): Promise<RoomActorState> {
  return runInDurableObject(env.ROOMS.getByName(code), (_instance, state) => JSON.parse(state.storage.sql
    .exec<{ data: string }>('SELECT data FROM room_state WHERE id=1').one().data) as RoomActorState);
}

/** Move the clock past `ms` and run the room's alarm (the leases and the report budget are alarms). */
async function alarmAfter(code: string, ms: number): Promise<boolean> {
  vi.useFakeTimers();
  vi.setSystemTime(Date.now() + ms + 1);
  try { return await runDurableObjectAlarm(env.ROOMS.getByName(code)); }
  finally { vi.useRealTimers(); }
}

/**
 * Admin + guest (commanders, plus a third commander on request) + a spectator, everyone ready, the admin starts;
 * returns the sockets and the match id.
 */
async function startedRoom(code: string, { adminDeclines = false, third = false } = {}): Promise<{ admin: Client; guest: Client; third: Client | null; watcher: Client; matchId: string }> {
  const admin = await create(code);
  const guest = await connect(code, `${code}-guest`);
  expect((await guest.request('room_join', identity('guest', token('c'), token('d')))).type).toBe('room_joined');
  const thirdClient = third ? await connect(code, `${code}-third`) : null;
  if (thirdClient) expect((await thirdClient.request('room_join', identity('third', token('1'), token('2')))).type).toBe('room_joined');
  const watcher = await connect(code, `${code}-watcher`);
  expect((await watcher.request('room_join', identity('watcher', token('e'), token('f'), { team: 'spectator' }))).type).toBe('room_joined');
  if (adminDeclines) expect((await admin.command({ type: 'host_decline', declined: true })).type).toBe('room_ack');
  for (const client of [admin, guest, thirdClient]) if (client) expect((await client.command({ type: 'set_ready', ready: true })).type).toBe('room_ack');
  const ack = await admin.command({ type: 'start' });
  expect(ack.type).toBe('room_ack');
  const matchId = ack.payload.matchId as string;
  for (const client of [admin, guest, thirdClient, watcher]) if (client) await client.next((message) => message.type === 'match_start');
  return { admin, guest, third: thirdClient, watcher, matchId };
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

  it('honours a decline at start and mid-match (to a willing successor only), migrates at once on a leave, and ends lost with no commander left', async () => {
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
    // the new host declines with no willing successor left: it keeps hosting
    expect((await third!.command({ type: 'host_decline', declined: true })).type).toBe('room_ack');
    expect(room(watcher).host).toMatchObject({ hostId: 'third', generation: 2 });
    expect(third!.all('host_changed').length).toBe(2);
    // the host leaves: at once, to the admin — declined, but the admin comes first among the last resorts
    expect((await third!.request('room_leave')).type).toBe('room_ack');
    const left = (await admin.next((message) => message.type === 'host_changed' && message.payload.generation === 3)).payload as unknown as RoomHostChangedPayload;
    expect(left).toEqual({ hostId: 'admin', generation: 3, resumeTick: 0, reason: 'left', hostSecret: derivedSecret(matchId) });
    expect((await watcher.next((message) => message.type === 'host_changed' && message.payload.generation === 3)).payload.hostSecret).toBeUndefined();
    expect(room(watcher).phase).toBe('playing');
    // the admin leaves too: the guest (declined) hosts as the last commander; the room's admin role moved with it
    expect((await admin.request('room_leave')).type).toBe('room_ack');
    const last = (await guest.next((message) => message.type === 'host_changed' && message.payload.generation === 4)).payload as unknown as RoomHostChangedPayload;
    expect(last).toEqual({ hostId: 'guest', generation: 4, resumeTick: 0, reason: 'left', hostSecret: derivedSecret(matchId) });
    expect(room(watcher).adminId).toBe('guest');
    // the last commander leaves: the match is lost, the room waits, only the spectator remains
    expect((await guest.request('room_leave')).type).toBe('room_ack');
    const lost = await watcher.next((message) => message.type === 'match_status' && message.payload.status === 'lost');
    expect(lost.payload.verdict).toBeNull();
    const after = (await watcher.next((message) => message.type === 'room_state' && (message.payload.room as RoomSnapshot).phase === 'waiting' && (message.payload.room as RoomSnapshot).lastResult !== null)).payload.room as RoomSnapshot;
    expect(after.lastResult).toEqual({ round: 1, result: null, reason: 'match_lost' });
    expect(after.host).toMatchObject({ hostId: null, generation: 4 });
    expect(after.players.map((player) => player.id)).toEqual(['watcher']);
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
});
