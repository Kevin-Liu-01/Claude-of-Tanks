import { env, exports } from 'cloudflare:workers';
import { evictDurableObject, reset, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RoomActorState } from '../../../src/mp/room/roomActor.ts';
import {
  ROOM_ADMIN_DISCONNECT_GRACE_MS, ROOM_IDLE_TTL_MS, ROOM_MATCH_POLL_MS, ROOM_MAX_PLAYERS, ROOM_MAX_SPECTATORS,
} from '../../../src/mp/room/protocol.ts';
import type { RoomSnapshot } from '../../../src/mp/room/protocol.ts';
import { verifySeatToken } from '../../../server/match/seatToken.ts';
import type { MatchContainerStub, StubState } from './matchContainerStub.ts';

interface Message { type: string; requestId?: string; payload: Record<string, unknown> }
const origin = 'https://cot.kevinliu.studio';
const clients: Client[] = [];
let requestSequence = 0;
const token = (seed: string): string => seed.repeat(64).slice(0, 64);

class Client {
  readonly messages: Message[] = [];
  readonly closed: Promise<CloseEvent>;
  private readonly waiters = new Set<() => void>();
  private queue: Promise<void> = Promise.resolve();
  constructor(readonly socket: WebSocket, readonly code: string) {
    socket.accept();
    // The room sends binary UTF-8 JSON; this runtime hands it to the client as a Blob, decoded in order.
    socket.addEventListener('message', (event) => {
      const data = event.data as string | Blob | ArrayBuffer;
      this.queue = this.queue.then(async () => {
        const text = typeof data === 'string' ? data : data instanceof Blob ? await data.text() : new TextDecoder().decode(data);
        this.messages.push(JSON.parse(text));
        for (const waiter of [...this.waiters]) waiter();
      });
    });
    this.closed = new Promise((resolve) => socket.addEventListener('close', resolve, { once: true }));
    clients.push(this);
  }
  next(predicate: (message: Message) => boolean, timeoutMs = 3_000): Promise<Message> {
    const existing = this.messages.find(predicate);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters.delete(waiter);
        reject(new Error(`Expected room receipt did not arrive: ${predicate.toString().slice(0, 160)}; received ${
          this.messages.map((message) => `${message.type}${message.payload.code ? `:${String(message.payload.code)}` : ''}`).join(',')}`));
      }, timeoutMs);
      const waiter = () => {
        const message = this.messages.find(predicate);
        if (!message) return;
        clearTimeout(timer);
        this.waiters.delete(waiter);
        resolve(message);
      };
      this.waiters.add(waiter);
    });
  }
  last(type: string): Message | undefined { return this.messages.filter((message) => message.type === type).at(-1); }
  send(type: string, payload: Record<string, unknown> = {}, requestId?: string, binary = true): void {
    const text = JSON.stringify({ type, requestId, payload: { roomCode: this.code, ...payload } });
    this.socket.send(binary ? new TextEncoder().encode(text) : text);
  }
  request(type: string, payload: Record<string, unknown> = {}, binary = true): Promise<Message> {
    const requestId = String(++requestSequence);
    const result = this.next((message) => message.requestId === requestId);
    this.send(type, payload, requestId, binary);
    return result;
  }
}

async function connect(code: string, ip = `test-${code}`): Promise<Client> {
  const response = await exports.default.fetch(`https://room.test/rooms/${code}`, {
    headers: { Upgrade: 'websocket', Origin: origin, 'CF-Connecting-IP': ip },
  });
  expect(response.status).toBe(101);
  if (!response.webSocket) throw new Error('Worker did not upgrade WebSocket');
  return new Client(response.webSocket, code);
}

function identity(id: string, resume = token('a'), next = token('b'), extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { player: { id, name: id }, resumeToken: resume, nextResumeToken: next, selection: { specId: 'm1a2' }, ...extra };
}

async function create(code: string, settings: Record<string, unknown> = { teamSize: 2, mapId: 'verdant' }): Promise<Client> {
  const admin = await connect(code);
  const response = await admin.request('room_create', { ...identity('admin'), mode: 'private', settings });
  expect(response.type).toBe('room_created');
  return admin;
}

function stubState(code: string): Promise<StubState> {
  return runInDurableObject(env.MATCH.getByName(code), (instance) => (instance as unknown as MatchContainerStub).state);
}

function setStub(code: string, patch: Partial<StubState>): Promise<void> {
  return runInDurableObject(env.MATCH.getByName(code), (instance) => { Object.assign((instance as unknown as MatchContainerStub).state, patch); });
}

/** Fake time accumulates across polls: each poll schedules the next one on the clock it saw. */
let clockOffsetMs = 0;

/** Run the room's alarm as its next status poll: the clock moves past the poll deadline first. */
async function pollAlarm(code: string): Promise<boolean> {
  clockOffsetMs += ROOM_MATCH_POLL_MS + 1;
  vi.useFakeTimers();
  vi.setSystemTime(Date.now() + clockOffsetMs);
  try { return await runDurableObjectAlarm(env.ROOMS.getByName(code)); }
  finally { vi.useRealTimers(); }
}

function storedState(code: string): Promise<RoomActorState> {
  return runInDurableObject(env.ROOMS.getByName(code), (_instance, state) => JSON.parse(state.storage.sql
    .exec<{ data: string }>('SELECT data FROM room_state WHERE id=1').one().data) as RoomActorState);
}

afterEach(async () => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  clockOffsetMs = 0;
  for (const client of clients.splice(0)) {
    try { client.socket.close(); } catch { /* already closed */ }
  }
  await reset();
});

describe('cot-rooms Worker', () => {
  it('serves health, exact routes and origins, and upgrades only WebSockets', async () => {
    const health = await exports.default.fetch('https://room.test/healthz');
    expect(await health.json()).toEqual({ ok: true, service: 'cot-rooms', backend: 'durable-object', matchHost: 'container' });
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

  it('starts a match through the container: start RPC, control POST with the bearer, per-seat tokens, and the proxied /match socket', async () => {
    const admin = await create('ROOM03');
    const guest = await connect('ROOM03');
    await guest.request('room_join', identity('guest', token('c'), token('d')));
    await admin.request('room_command', { command: { type: 'set_ready', ready: true } });
    await guest.request('room_command', { command: { type: 'set_ready', ready: true } });
    const ack = await admin.request('room_command', { command: { type: 'start' } });
    expect(ack.type).toBe('room_ack');
    const stub = await stubState('ROOM03');
    expect(stub.starts).toBe(1);
    expect(stub.configs.length).toBe(1);
    expect(stub.authorizations.at(-1)).toBe('Bearer rooms-test-control-secret-0123456789');
    const config = stub.configs[0] as { roomId: string; seats: unknown[]; bots: unknown[]; mapId: string };
    expect(config.roomId).toBe('ROOM03');
    expect(config.seats.length).toBe(2);
    expect(config.bots.length).toBe(2);
    const adminStart = await admin.next((message) => message.type === 'match_start');
    const guestStart = await guest.next((message) => message.type === 'match_start');
    expect(adminStart.payload.matchUrl).toBe('/rooms/ROOM03/match');
    // the Worker's own secret: a local `.dev.vars` (the wrangler dev recipe) overrides wrangler.test.jsonc's value here too
    const verified = verifySeatToken(env.MATCH_SEAT_SECRET, guestStart.payload.seatToken, Date.now());
    expect(verified.ok).toBe(true);
    if (verified.ok) { expect(verified.claims.playerId).toBe('guest'); expect(verified.claims.roomId).toBe('ROOM03'); }
    expect(adminStart.payload.seatToken).not.toBe(guestStart.payload.seatToken);
    expect((admin.last('room_state')?.payload.room as RoomSnapshot).phase).toBe('starting');
    // the match socket route reaches the container's /match through the Worker
    const proxied = await exports.default.fetch('https://room.test/rooms/ROOM03/match', {
      headers: { Upgrade: 'websocket', Origin: origin, 'CF-Connecting-IP': 'match' },
    });
    expect(proxied.status).toBe(101);
    const socket = proxied.webSocket!;
    socket.accept();
    const echoed = new Promise<string>((resolve) => socket.addEventListener('message', (event) => resolve(String(event.data)), { once: true }));
    socket.send('hello');
    expect(await echoed).toBe('echo:hello');
    socket.close();
    expect((await stubState('ROOM03')).matchSockets).toBe(1);
    // the poll alarm moves the room to playing, then records the verdict and unlocks the room
    await setStub('ROOM03', { phase: 'playing' });
    expect(await pollAlarm('ROOM03')).toBe(true);
    expect((await admin.next((message) => message.type === 'room_state' && (message.payload.room as RoomSnapshot).phase === 'playing')).type).toBe('room_state');
    await setStub('ROOM03', { phase: 'ended', verdict: { result: 'alpha', reason: 'elimination' } });
    await pollAlarm('ROOM03');
    const status = await guest.next((message) => message.type === 'match_status');
    expect(status.payload.status).toBe('ended');
    expect((status.payload.verdict as { result: string }).result).toBe('alpha');
    const finished = (await admin.next((message) => message.type === 'room_state' && (message.payload.room as RoomSnapshot).phase === 'waiting' && (message.payload.room as RoomSnapshot).lastResult !== null)).payload.room as RoomSnapshot;
    expect(finished.lastResult).toEqual({ round: 1, result: 'alpha', reason: 'elimination' });
    expect(finished.players.every((player) => !player.ready)).toBe(true);
    // rematch in the same room: a second start, round 2, fresh tokens
    await admin.request('room_command', { command: { type: 'set_ready', ready: true } });
    await guest.request('room_command', { command: { type: 'set_ready', ready: true } });
    expect((await admin.request('room_command', { command: { type: 'start' } })).type).toBe('room_ack');
    const second = await guest.next((message) => message.type === 'match_start' && message.payload.round === 2);
    expect(second.payload.seatToken).not.toBe(guestStart.payload.seatToken);
    expect((await stubState('ROOM03')).starts).toBe(2);
  });

  it('reports a lost container after two unanswered polls and a start the host refuses', async () => {
    const admin = await create('ROOM04', { teamSize: 1 });
    await admin.request('room_command', { command: { type: 'set_ready', ready: true } });
    expect((await admin.request('room_command', { command: { type: 'start' } })).type).toBe('room_ack');
    await setStub('ROOM04', { failWith: 502 });
    await pollAlarm('ROOM04');
    expect((await storedState('ROOM04')).room?.match?.status).toBe('starting');
    await pollAlarm('ROOM04');
    const lost = await admin.next((message) => message.type === 'match_status' && message.payload.status === 'lost');
    expect(lost.payload.status).toBe('lost');
    const state = (await admin.next((message) => message.type === 'room_state' && (message.payload.room as RoomSnapshot).phase === 'waiting' && (message.payload.room as RoomSnapshot).lastResult !== null)).payload.room as RoomSnapshot;
    expect(state.lastResult).toEqual({ round: 1, result: null, reason: 'match_lost' });
    await admin.request('room_command', { command: { type: 'set_ready', ready: true } });
    const refused = await admin.request('room_command', { command: { type: 'start' } });
    expect(refused.payload.code).toBe('match_host_unavailable');
    expect((await storedState('ROOM04')).room?.round).toBe(1);
  });

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
