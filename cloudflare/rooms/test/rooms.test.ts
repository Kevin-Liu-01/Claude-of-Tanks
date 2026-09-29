import { env, exports } from 'cloudflare:workers';
import { evictDurableObject, reset, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RoomActorState } from '../../../src/mp/room/roomActor.ts';
import {
  ROOM_ADMIN_DISCONNECT_GRACE_MS, ROOM_IDLE_TTL_MS, ROOM_MAX_PLAYERS, ROOM_MAX_SPECTATORS,
} from '../../../src/mp/room/protocol.ts';
import type { RoomSnapshot } from '../../../src/mp/room/protocol.ts';
import { closeClients, connect, create, identity, origin, token } from './client.ts';

function storedState(code: string): Promise<RoomActorState> {
  return runInDurableObject(env.ROOMS.getByName(code), (_instance, state) => JSON.parse(state.storage.sql
    .exec<{ data: string }>('SELECT data FROM room_state WHERE id=1').one().data) as RoomActorState);
}

afterEach(async () => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  closeClients();
  await reset();
});

describe('cot-rooms Worker: the room lifecycle (the deployed shape)', () => {
  it('serves health, exact routes and origins, and upgrades only WebSockets', async () => {
    const health = await exports.default.fetch('https://room.test/healthz');
    expect(await health.json()).toEqual({ ok: true, service: 'cot-rooms', backend: 'durable-object', matchHost: 'p2p' });
    for (const path of ['/rooms', '/rooms/abcdef', '/rooms/ABCDEF/extra', '/rooms/ABCDEF?token=secret']) {
      expect((await exports.default.fetch(`https://room.test${path}`, { headers: { Upgrade: 'websocket', Origin: origin } })).status).toBe(404);
    }
    expect((await exports.default.fetch('https://room.test/rooms/ABCDEF', { headers: { Upgrade: 'websocket' } })).status).toBe(403);
    expect((await exports.default.fetch('https://room.test/rooms/ABCDEF', { headers: { Upgrade: 'websocket', Origin: `${origin}.evil` } })).status).toBe(403);
    expect((await exports.default.fetch('https://room.test/rooms/ABCDEF', { headers: { Origin: origin } })).status).toBe(426);
    expect((await exports.default.fetch('https://room.test/rooms/ABCDEF/match', { headers: { Origin: origin } })).status).toBe(426);
  });

  it('creates, joins with auto-balance, refuses the wrong code, and keeps capabilities as hashes only', async () => {
    const admin = await create('ROOM01');
    const guest = await connect('ROOM01');
    const joined = await guest.request('room_join', identity('guest', token('c'), token('d')));
    expect(joined.type).toBe('room_joined');
    const room = joined.payload.room as RoomSnapshot;
    expect(room.adminId).toBe('admin');
    expect(room.players.map((player) => player.team)).toEqual(['alpha', 'bravo']);
    const notified = await admin.next((message) => message.type === 'room_state' && (message.payload.room as RoomSnapshot).players.length === 2);
    expect(JSON.stringify(notified)).not.toContain('resume');
    expect((await guest.request('room_command', { command: { type: 'set_map', mapId: 'alpine' } })).payload.code).toBe('admin_only');
    expect((await guest.request('room_join', identity('other'))).payload.code).toBe('already_joined');
    const stranger = await connect('ROOM01');
    expect((await stranger.request('room_join', { ...identity('guest', token('f'), token('f')) })).payload.code).toBe('resume_denied');
    expect((await stranger.request('room_command', { command: { type: 'set_ready', ready: true } })).payload.code).toBe('not_in_room');
    expect((await stranger.request('room_join', { ...identity('late'), roomCode: 'OTHER1' })).payload.code).toBe('invalid_room_code');
    const stored = await storedState('ROOM01');
    expect(stored.room?.players.length).toBe(2);
    expect(JSON.stringify(stored)).not.toContain(token('a'));
    expect(JSON.stringify(stored)).not.toContain(token('d'));
    expect(Object.keys(stored.resumeHashes).sort()).toEqual(['admin', 'guest']);
    // text frames work too (the browser client sends binary)
    expect((await guest.request('room_ping', {}, false)).type).toBe('room_pong');
  });

  it('seats 28 players and 8 spectators, then refuses the 29th and the 9th', async () => {
    const admin = await create('ROOM02', { teamSize: 14 });
    for (let index = 2; index <= ROOM_MAX_PLAYERS; index++) {
      const client = await connect('ROOM02', `p${index}`);
      const joined = await client.request('room_join', identity(`p${index}`, token('c'), token('d')));
      expect(joined.type, `player ${index}`).toBe('room_joined');
    }
    const late = await connect('ROOM02', 'late');
    expect((await late.request('room_join', identity('late', token('c'), token('d')))).payload.code).toBe('room_full');
    for (let index = 1; index <= ROOM_MAX_SPECTATORS; index++) {
      const client = await connect('ROOM02', `s${index}`);
      const joined = await client.request('room_join', identity(`s${index}`, token('c'), token('d'), { team: 'spectator' }));
      expect(joined.type, `spectator ${index}`).toBe('room_joined');
    }
    const ninth = await connect('ROOM02', 'ninth');
    expect((await ninth.request('room_join', identity('ninth', token('c'), token('d'), { team: 'spectator' }))).payload.code).toBe('spectators_full');
    const state = admin.last('room_state')?.payload.room as RoomSnapshot;
    expect(state.players.filter((player) => player.team === 'alpha').length).toBe(14);
    expect(state.players.filter((player) => player.team === 'bravo').length).toBe(14);
    expect(state.players.filter((player) => player.team === 'spectator').length).toBe(8);
  }, 40_000);

  it('migrates admin at once on leave, after the grace on disconnect, and resumes with the rotated capability across hibernation', async () => {
    const admin = await create('ROOM05', { teamSize: 3 });
    const second = await connect('ROOM05', 'second');
    await second.request('room_join', identity('second', token('c'), token('d')));
    const third = await connect('ROOM05', 'third');
    await third.request('room_join', identity('third', token('e'), token('f')));
    expect((await admin.request('room_leave')).type).toBe('room_ack');
    await admin.closed;
    const migrated = (await second.next((message) => message.type === 'room_state' && (message.payload.room as RoomSnapshot).adminId !== 'admin')).payload.room as RoomSnapshot;
    expect(migrated.adminId).toBe('second');
    expect(migrated.players.length).toBe(2);
    // the new admin's socket drops: the alarm fires the 30 s lease and the most senior connected seat takes over
    second.socket.close();
    await second.closed;
    await third.next((message) => message.type === 'room_state' && (message.payload.room as RoomSnapshot).players.find((player) => player.id === 'second')?.connected === false);
    const leaseAt = await runInDurableObject(env.ROOMS.getByName('ROOM05'), (_instance, state) => state.storage.getAlarm());
    expect(leaseAt).not.toBeNull();
    expect((leaseAt ?? 0) - Date.now()).toBeLessThanOrEqual(ROOM_ADMIN_DISCONNECT_GRACE_MS);
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + ROOM_ADMIN_DISCONNECT_GRACE_MS + 1);
    expect(await runDurableObjectAlarm(env.ROOMS.getByName('ROOM05'))).toBe(true);
    vi.useRealTimers();
    const afterLease = (await third.next((message) => message.type === 'room_state' && (message.payload.room as RoomSnapshot).adminId === 'third')).payload.room as RoomSnapshot;
    expect(afterLease.adminId).toBe('third');
    // second resumes with the rotated capability after the object is evicted (hibernation restore)
    await evictDurableObject(env.ROOMS.getByName('ROOM05'));
    expect((await third.request('room_ping')).type).toBe('room_pong');
    const resumed = await connect('ROOM05', 'second-again');
    const rejoined = await resumed.request('room_join', identity('second', token('d'), token('7')));
    expect(rejoined.type).toBe('room_joined');
    expect((rejoined.payload.room as RoomSnapshot).players.length).toBe(2);
    expect((rejoined.payload.room as RoomSnapshot).players.find((player) => player.id === 'second')?.connected).toBe(true);
    const stale = await connect('ROOM05', 'second-stale');
    expect((await stale.request('room_join', identity('second', token('c'), token('c')))).payload.code).toBe('resume_denied');
  });

  it('expires 24 h after the last message and deallocates, and never closes on departures', async () => {
    const admin = await create('ROOM06', { teamSize: 1 });
    admin.socket.close();
    await admin.closed;
    const stub = env.ROOMS.getByName('ROOM06');
    expect((await storedState('ROOM06')).room?.players.length).toBe(1);
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + ROOM_ADMIN_DISCONNECT_GRACE_MS + 1);
    await runDurableObjectAlarm(stub);
    expect((await storedState('ROOM06')).room).not.toBeNull();
    vi.setSystemTime(Date.now() + ROOM_IDLE_TTL_MS + 1);
    await runDurableObjectAlarm(stub);
    vi.useRealTimers();
    const rows = await runInDurableObject(stub, (_instance, state) => state.storage.sql
      .exec("SELECT name FROM sqlite_master WHERE type='table' AND name='room_state'").toArray().length);
    expect(rows).toBe(0);
    const fresh = await connect('ROOM06', 'fresh');
    expect((await fresh.request('room_join', identity('anyone'))).payload.code).toBe('room_not_found');
    expect((await fresh.request('room_create', { ...identity('anyone'), mode: 'private' })).type).toBe('room_created');
  });

  it('keeps chat bounded, replays history to a joiner, and rate limits a flooding socket', async () => {
    const admin = await create('ROOM07');
    for (let index = 0; index < 60; index++) admin.send('room_chat', { text: `line ${index}` });
    await admin.next((message) => message.type === 'room_chat' && message.payload.entry !== undefined && (message.payload.entry as { text: string }).text === 'line 59');
    const guest = await connect('ROOM07');
    const joined = await guest.request('room_join', identity('guest', token('c'), token('d')));
    const history = joined.payload.chat as Array<{ text: string }>;
    expect(history.length).toBe(48);
    expect(history[0]!.text).toBe('line 12');
    for (let index = 0; index < 130; index++) guest.send('room_ping');
    const closed = await guest.closed;
    expect(closed.reason).toBe('rate_limit');
  });
});
