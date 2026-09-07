import { env, exports } from 'cloudflare:workers';
import { evictDurableObject, reset, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RuntimeValue } from '../../../src/runtimeTypes.ts';
import { SIGNALING_DETACHED_GRACE_MS, SIGNALING_PEER_IDLE_TTL_MS,
  type SignalingRoomSnapshot } from '../../../server/roomStore.ts';

// Deliberately pin the product policy, not an arbitrary short test-only lease.
const disconnectGraceMs = SIGNALING_DETACHED_GRACE_MS;
const silenceMs = SIGNALING_PEER_IDLE_TTL_MS;
const origin = 'https://cot.kevinliu.studio';
interface Message { type: string; requestId?: string; payload: Record<string, RuntimeValue> }
const clients: Client[] = [];
let sequence = 0;

class Client {
  readonly messages: Message[] = [];
  readonly closed: Promise<CloseEvent>;
  constructor(readonly socket: WebSocket, readonly code: string) {
    socket.accept();
    socket.addEventListener('message', (event) => { this.messages.push(JSON.parse(String(event.data))); });
    this.closed = new Promise((resolve) => socket.addEventListener('close', resolve, { once: true }));
    clients.push(this);
  }
  next(predicate: (message: Message) => boolean): Promise<Message> {
    const previous = this.messages.find(predicate);
    if (previous) return Promise.resolve(previous);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.socket.removeEventListener('message', listener);
        reject(new Error('Abandonment receipt did not arrive'));
      }, 3_000);
      const listener = (event: MessageEvent) => {
        const message: Message = JSON.parse(String(event.data));
        if (!predicate(message)) return;
        clearTimeout(timer);
        this.socket.removeEventListener('message', listener);
        resolve(message);
      };
      this.socket.addEventListener('message', listener);
    });
  }
  request(type: string, payload: Record<string, RuntimeValue> = {}): Promise<Message> {
    const requestId = `abandon-${++sequence}`;
    const answer = this.next((message) => message.requestId === requestId);
    this.socket.send(JSON.stringify({ type, requestId, payload: { roomCode: this.code, ...payload } }));
    return answer;
  }
}

async function connect(code: string): Promise<Client> {
  const response = await exports.default.fetch(`https://room.test/rooms/${code}`, {
    headers: { Upgrade: 'websocket', Origin: origin, 'CF-Connecting-IP': `abandon-${code}` },
  });
  expect(response.status).toBe(101);
  if (!response.webSocket) throw new Error('No native socket');
  return new Client(response.webSocket, code);
}

function identity(id: string, token = 'a'.repeat(64), sessionId = `${id}_session`): Record<string, RuntimeValue> {
  return { player: { id, name: id }, sessionId, nextResumeToken: token };
}

async function create(code: string): Promise<Client> {
  const host = await connect(code);
  expect((await host.request('room_create', { ...identity('host'), maxPlayers: 2 })).type).toBe('room_created');
  return host;
}

async function join(code: string, id = 'guest'): Promise<Client> {
  const guest = await connect(code);
  expect((await guest.request('room_join', identity(id, 'b'.repeat(64)))).type).toBe('room_joined');
  return guest;
}

async function snapshot(code: string): Promise<SignalingRoomSnapshot> {
  return runInDurableObject(env.ROOMS.getByName(code), (_instance, state) => JSON.parse(state.storage.sql
    .exec<{ data: string }>('SELECT data FROM room_state WHERE id=1').one().data));
}

async function emptyReceipt(code: string) {
  return runInDurableObject(env.ROOMS.getByName(code), async (_instance, state) => ({
    sockets: state.getWebSockets().length,
    tables: state.storage.sql.exec<{ total: number }>(
      "SELECT COUNT(*) AS total FROM sqlite_master WHERE name='room_state'").one().total,
    keys: (await state.storage.list()).size,
    alarm: await state.storage.getAlarm(),
  }));
}

afterEach(async () => {
  vi.restoreAllMocks();
  for (const client of clients.splice(0)) {
    try { client.socket.close(); } catch { /* the test may already have expired it */ }
  }
  await reset();
});

describe('private room abandonment and durable lease cleanup', () => {
  it('pins the shared disconnect and heartbeat budgets', () => {
    expect(disconnectGraceMs).toBe(90_000);
    expect(silenceMs).toBe(180_000);
  });
  it('keeps a brief disconnect resumable, then deletes an all-abandoned room including SQL metadata and alarm', async () => {
    const start = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(start);
    const host = await create('ABAND1');
    const guest = await join('ABAND1');
    host.socket.close();
    guest.socket.close();
    await Promise.all([host.closed, guest.closed]);
    const saved = await snapshot('ABAND1');
    expect(saved.rooms[0].peers.every((peer) => peer.connectionId === null)).toBe(true);
    const stub = env.ROOMS.getByName('ABAND1');
    clock.mockReturnValue(start + disconnectGraceMs - 1);
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect((await snapshot('ABAND1')).rooms[0].peers).toHaveLength(2);
    clock.mockReturnValue(start + disconnectGraceMs);
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect(await emptyReceipt('ABAND1')).toEqual({ sockets: 0, tables: 0, keys: 0, alarm: null });
    expect(await runDurableObjectAlarm(stub)).toBe(false);
  });

  it('does not let guest polls keep a disconnected host room alive indefinitely', async () => {
    const start = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(start);
    const host = await create('HOST90');
    const guest = await join('HOST90');
    host.socket.close();
    await host.closed;
    await snapshot('HOST90');
    clock.mockReturnValue(start + disconnectGraceMs - 1);
    expect((await guest.request('room_poll')).type).toBe('room_polled');
    clock.mockReturnValue(start + disconnectGraceMs);
    expect(await runDurableObjectAlarm(env.ROOMS.getByName('HOST90'))).toBe(true);
    expect((await guest.next((message) => message.type === 'room_closed')).payload.reason).toBe('expired');
    await guest.closed;
    expect(await emptyReceipt('HOST90')).toEqual({ sockets: 0, tables: 0, keys: 0, alarm: null });
  });

  it('reclaims a disconnected guest seat while the host keeps polling', async () => {
    const start = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(start);
    const host = await create('GUEST9');
    const guest = await join('GUEST9');
    guest.socket.close();
    await guest.closed;
    await snapshot('GUEST9');
    clock.mockReturnValue(start + disconnectGraceMs - 1);
    expect((await host.request('room_poll')).type).toBe('room_polled');
    clock.mockReturnValue(start + disconnectGraceMs);
    expect(await runDurableObjectAlarm(env.ROOMS.getByName('GUEST9'))).toBe(true);
    const departed = await host.next((message) => message.type === 'peer_left');
    expect(departed.payload.peerId).toBe('guest');
    expect(departed.payload.reason).toBe('expired');
    expect(host.messages.some((message) => message.type === 'room_closed')).toBe(false);
    const replacement = await join('GUEST9', 'fresh_guest');
    expect((await replacement.request('room_poll')).type).toBe('room_polled');
    expect((await snapshot('GUEST9')).rooms[0].peers.map((peer) => peer.peerId).sort())
      .toEqual(['fresh_guest', 'host']);
  });

  it('expires an OPEN but heartbeat-silent host even when a guest remains active', async () => {
    const start = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(start);
    const host = await create('HALF01');
    const guest = await join('HALF01');
    clock.mockReturnValue(start + silenceMs - 1);
    expect((await guest.request('room_poll')).type).toBe('room_polled');
    expect(host.socket.readyState).toBe(WebSocket.OPEN);
    clock.mockReturnValue(start + silenceMs);
    expect(await runDurableObjectAlarm(env.ROOMS.getByName('HALF01'))).toBe(true);
    expect((await guest.next((message) => message.type === 'room_closed')).payload.reason).toBe('expired');
    await Promise.all([host.closed, guest.closed]);
    expect(await emptyReceipt('HALF01')).toEqual({ sockets: 0, tables: 0, keys: 0, alarm: null });
  });

  it('expires an OPEN but silent guest without discarding its recently polling host', async () => {
    const start = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(start);
    const host = await create('HALF02');
    const guest = await join('HALF02');
    clock.mockReturnValue(start + silenceMs - 1);
    expect((await host.request('room_poll')).type).toBe('room_polled');
    expect(guest.socket.readyState).toBe(WebSocket.OPEN);
    clock.mockReturnValue(start + silenceMs);
    expect(await runDurableObjectAlarm(env.ROOMS.getByName('HALF02'))).toBe(true);
    expect((await host.next((message) => message.type === 'peer_left')).payload.peerId).toBe('guest');
    expect((await guest.next((message) => message.type === 'room_closed')).payload.reason).toBe('expired');
    await guest.closed;
    expect((await host.request('room_poll')).type).toBe('room_polled');
    expect((await snapshot('HALF02')).rooms[0].peers.map((peer) => peer.peerId)).toEqual(['host']);
  });

  it('restores latest authenticated attachment heartbeat across hibernation without extending it on wake', async () => {
    const start = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(start);
    const host = await create('HEART1');
    const before = await snapshot('HEART1');
    clock.mockReturnValue(start + 30_000);
    expect((await host.request('room_poll')).type).toBe('room_polled');
    expect(await snapshot('HEART1')).toEqual(before);
    const stub = env.ROOMS.getByName('HEART1');
    clock.mockReturnValue(start + silenceMs - 1);
    await evictDurableObject(stub);
    clock.mockReturnValue(start + silenceMs);
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect(host.socket.readyState).toBe(WebSocket.OPEN);
    expect(host.messages.some((message) => message.type === 'room_closed')).toBe(false);
    const next = await runInDurableObject(stub, (_instance, state) => state.storage.getAlarm());
    expect(next).toBe(start + 30_000 + silenceMs);
    clock.mockReturnValue(start + 30_000 + silenceMs);
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    await host.closed;
    expect(await emptyReceipt('HEART1')).toEqual({ sockets: 0, tables: 0, keys: 0, alarm: null });
  });

  it('accepts a just-in-time host resume and ignores predecessor close plus an early old alarm', async () => {
    const start = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(start);
    const host = await create('RACE90');
    const guest = await join('RACE90');
    const stub = env.ROOMS.getByName('RACE90');
    let predecessor: WebSocket | undefined;
    await runInDurableObject(stub, (_instance, state) => {
      const saved: SignalingRoomSnapshot = JSON.parse(state.storage.sql
        .exec<{ data: string }>('SELECT data FROM room_state').one().data);
      const hostConnection = saved.rooms[0].peers.find((peer) => peer.peerId === 'host')?.connectionId;
      predecessor = state.getWebSockets().find((ws) => ws.deserializeAttachment().id === hostConnection);
    });
    expect(predecessor).toBeDefined();
    host.socket.close();
    await host.closed;
    await snapshot('RACE90');
    clock.mockReturnValue(start + disconnectGraceMs - 1);
    const successor = await connect('RACE90');
    expect((await successor.request('room_join', {
      ...identity('host', 'c'.repeat(64), 'new_host_session'), resumeToken: 'a'.repeat(64),
    })).type).toBe('room_joined');
    clock.mockReturnValue(start + disconnectGraceMs);
    await runInDurableObject(stub, async (instance) => {
      if (predecessor) await instance.webSocketClose(predecessor);
    });
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect((await successor.request('room_poll')).type).toBe('room_polled');
    expect((await guest.request('room_poll')).type).toBe('room_polled');
    expect(guest.messages.some((message) => message.type === 'room_closed')).toBe(false);
    const member = (await snapshot('RACE90')).rooms[0].peers.find((peer) => peer.peerId === 'host');
    expect(member?.sessionId).toBe('new_host_session');
    expect(member?.connectionId).not.toBeNull();
    expect(member?.disconnectedAt).toBeUndefined();
  });

  it('uses persisted legacy activity when a socket is missing instead of granting a new grace on every reboot', async () => {
    const start = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(start);
    const host = await create('LEGACY');
    const stub = env.ROOMS.getByName('LEGACY');
    await runInDurableObject(stub, (_instance, state) => {
      const saved: SignalingRoomSnapshot = JSON.parse(state.storage.sql
        .exec<{ data: string }>('SELECT data FROM room_state').one().data);
      const member = saved.rooms[0].peers[0];
      member.connectionId = null;
      delete member.disconnectedAt;
      delete member.lastActivityAt;
      state.storage.sql.exec('UPDATE room_state SET data=? WHERE id=1', JSON.stringify(saved));
      return state.storage.deleteAlarm();
    });
    clock.mockReturnValue(start + 60_000);
    await evictDurableObject(stub);
    const firstAlarm = await runInDurableObject(stub, (_instance, state) => state.storage.getAlarm());
    await host.closed;
    // No historical close timestamp exists, so use the persisted 180s idle
    // deadline rather than inventing a disconnect time from this actor wake.
    expect(firstAlarm).toBe(start + silenceMs);
    clock.mockReturnValue(start + silenceMs - 1);
    await evictDurableObject(stub);
    expect(await runInDurableObject(stub, (_instance, state) => state.storage.getAlarm())).toBe(firstAlarm);
    clock.mockReturnValue(start + silenceMs);
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect(await emptyReceipt('LEGACY')).toEqual({ sockets: 0, tables: 0, keys: 0, alarm: null });
  });

  it('retries a delivered cleanup alarm idempotently while a fresh owner reuses exactly the same room code', async () => {
    const start = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(start);
    const old = await create('RETRY9');
    old.socket.close();
    await old.closed;
    await snapshot('RETRY9');
    const stub = env.ROOMS.getByName('RETRY9');
    clock.mockReturnValue(start + disconnectGraceMs);
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect(await emptyReceipt('RETRY9')).toEqual({ sockets: 0, tables: 0, keys: 0, alarm: null });
    await runInDurableObject(stub, (instance) => instance.alarm());
    expect(await emptyReceipt('RETRY9')).toEqual({ sockets: 0, tables: 0, keys: 0, alarm: null });
    const [, replacement] = await Promise.all([
      runInDurableObject(stub, (instance) => instance.alarm()),
      connect('RETRY9').then(async (client) => {
        expect((await client.request('room_create', {
          ...identity('fresh_host', 'd'.repeat(64)), maxPlayers: 2,
        })).type).toBe('room_created');
        return client;
      }),
    ]);
    await runInDurableObject(stub, (instance) => instance.alarm());
    await evictDurableObject(stub);
    expect((await replacement.request('room_poll')).type).toBe('room_polled');
    const current = await snapshot('RETRY9');
    expect(current.rooms).toHaveLength(1);
    expect(current.rooms[0].hostId).toBe('fresh_host');
    expect(current.rooms[0].peers).toHaveLength(1);
  });

  it('preserves expired-ID proof fencing while allowing the rightful expired guest to reclaim a free seat', async () => {
    const start = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(start);
    const host = await create('PROOF9');
    const guest = await join('PROOF9');
    guest.socket.close();
    await guest.closed;
    await snapshot('PROOF9');
    clock.mockReturnValue(start + disconnectGraceMs - 1);
    await host.request('room_poll');
    clock.mockReturnValue(start + disconnectGraceMs);
    await runDurableObjectAlarm(env.ROOMS.getByName('PROOF9'));
    expect((await host.next((message) => message.type === 'peer_left')).payload.peerId).toBe('guest');
    const impostor = await connect('PROOF9');
    expect((await impostor.request('room_join', identity('guest', 'c'.repeat(64), 'impostor_session')))
      .payload.code).toBe('resume_denied');
    const owner = await connect('PROOF9');
    expect((await owner.request('room_join', {
      ...identity('guest', 'd'.repeat(64), 'returning_guest_session'), resumeToken: 'b'.repeat(64),
    })).type).toBe('room_joined');
    expect((await owner.request('room_poll')).type).toBe('room_polled');
    const room = (await snapshot('PROOF9')).rooms[0];
    expect(room.peers).toHaveLength(2);
    expect(room.peers.find((peer) => peer.peerId === 'guest')?.sessionId).toBe('returning_guest_session');
    expect(JSON.stringify(room)).not.toContain('d'.repeat(64));
  });

  it('keeps individually heartbeating peers alive across multiple idle windows then cleans up after silence', async () => {
    const start = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(start);
    const host = await create('ACTIVE');
    const guest = await join('ACTIVE');
    const stub = env.ROOMS.getByName('ACTIVE');
    for (let step = 1; step <= 8; step++) {
      clock.mockReturnValue(start + step * silenceMs / 2);
      expect((await host.request('room_poll')).type).toBe('room_polled');
      expect((await guest.request('room_poll')).type).toBe('room_polled');
      expect(await runDurableObjectAlarm(stub)).toBe(true);
      expect(host.socket.readyState).toBe(WebSocket.OPEN);
      expect(guest.socket.readyState).toBe(WebSocket.OPEN);
    }
    expect(host.messages.some((message) => message.type === 'room_closed')).toBe(false);
    expect(guest.messages.some((message) => message.type === 'room_closed')).toBe(false);
    clock.mockReturnValue(start + 5 * silenceMs - 1);
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect((await snapshot('ACTIVE')).rooms[0].peers).toHaveLength(2);
    clock.mockReturnValue(start + 5 * silenceMs);
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    await Promise.all([host.closed, guest.closed]);
    expect(await emptyReceipt('ACTIVE')).toEqual({ sockets: 0, tables: 0, keys: 0, alarm: null });
  });

  it('does not renew a guest heartbeat from invalid signal or cross-room requests, even across hibernation', async () => {
    const start = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(start);
    const host = await create('BADMSG');
    const guest = await join('BADMSG');
    const stub = env.ROOMS.getByName('BADMSG');
    clock.mockReturnValue(start + silenceMs - 1);
    expect((await host.request('room_poll')).type).toBe('room_polled');
    expect((await guest.request('room_signal', { toPeerId: 'host', signal: { kind: 'invalid' } }))
      .payload.code).toBe('invalid_payload');
    expect((await guest.request('room_poll', { roomCode: 'OTHER1' })).payload.code).toBe('invalid_room_code');
    await evictDurableObject(stub);
    clock.mockReturnValue(start + silenceMs);
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect((await host.next((message) => message.type === 'peer_left')).payload.peerId).toBe('guest');
    await guest.closed;
    expect((await host.request('room_poll')).type).toBe('room_polled');
    expect((await snapshot('BADMSG')).rooms[0].peers.map((peer) => peer.peerId)).toEqual(['host']);
  });

  it('propagates a failed expiry write without committing membership loss, then cleans up on alarm retry', async () => {
    const start = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(start);
    const host = await create('SQLERR');
    host.socket.close();
    await host.closed;
    const before = await snapshot('SQLERR');
    const stub = env.ROOMS.getByName('SQLERR');
    clock.mockReturnValue(start + disconnectGraceMs);
    await expect(runInDurableObject(stub, async (instance, state) => {
      const failure = vi.spyOn(state.storage.sql, 'exec').mockImplementationOnce(() => {
        throw new Error('injected_durable_write');
      });
      try { await instance.alarm(); } finally { failure.mockRestore(); }
    })).rejects.toThrow('injected_durable_write');
    expect(await snapshot('SQLERR')).toEqual(before);
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect(await emptyReceipt('SQLERR')).toEqual({ sockets: 0, tables: 0, keys: 0, alarm: null });
  });

  it('retries failed metadata deallocation after expiry has already removed the logical room', async () => {
    const start = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(start);
    const host = await create('DELERR');
    host.socket.close();
    await host.closed;
    await snapshot('DELERR');
    const stub = env.ROOMS.getByName('DELERR');
    clock.mockReturnValue(start + disconnectGraceMs);
    await expect(runInDurableObject(stub, async (instance, state) => {
      const failure = vi.spyOn(state.storage, 'deleteAll').mockRejectedValueOnce(new Error('injected_delete_all'));
      try { await instance.alarm(); } finally { failure.mockRestore(); }
    })).rejects.toThrow('injected_delete_all');
    expect(await runInDurableObject(stub, (_instance, state) => state.storage.sql
      .exec<{ total: number }>('SELECT COUNT(*) AS total FROM room_state').one().total)).toBe(0);
    expect((await emptyReceipt('DELERR')).tables).toBe(1);
    await runInDurableObject(stub, (instance) => instance.alarm());
    expect(await emptyReceipt('DELERR')).toEqual({ sockets: 0, tables: 0, keys: 0, alarm: null });
  });
});
