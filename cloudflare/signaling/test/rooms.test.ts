import { env, exports } from 'cloudflare:workers';
import { evictDurableObject, reset, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RuntimeValue } from '../../../src/runtimeTypes.ts';
import type { SignalingRoomSnapshot } from '../../../server/roomStore.ts';
import { signalingResumeHash } from '../../../server/signalingMembership.ts';
import { MAX_PENDING_SOCKETS, RATE_MAX_MESSAGES, ROOM_IDLE_TTL_MS, record } from '../src/protocol.ts';

interface Message { type: string; requestId?: string; payload: Record<string, RuntimeValue> }
const origin = 'https://cot.kevinliu.studio';
const clients: Client[] = [];
let requestSequence = 0;

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
    const existing = this.messages.find(predicate);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.socket.removeEventListener('message', onMessage);
        reject(new Error('Expected signaling receipt did not arrive')); }, 3_000);
      const onMessage = (event: MessageEvent) => {
        const message: Message = JSON.parse(String(event.data));
        if (!predicate(message)) return;
        clearTimeout(timer);
        this.socket.removeEventListener('message', onMessage);
        resolve(message);
      };
      this.socket.addEventListener('message', onMessage);
    });
  }
  send(type: string, payload: Record<string, RuntimeValue> = {}, requestId?: string): void {
    this.socket.send(JSON.stringify({ type, requestId, payload: { roomCode: this.code, ...payload } }));
  }
  request(type: string, payload: Record<string, RuntimeValue> = {}): Promise<Message> {
    const requestId = String(++requestSequence);
    const result = this.next((message) => message.requestId === requestId);
    this.send(type, payload, requestId);
    return result;
  }
}

async function connect(code: string): Promise<Client> {
  const response = await exports.default.fetch(`https://room.test/rooms/${code}`, {
    headers: { Upgrade: 'websocket', Origin: origin, 'CF-Connecting-IP': `test-${code}` },
  });
  expect(response.status).toBe(101);
  if (!response.webSocket) throw new Error('Worker did not upgrade WebSocket');
  return new Client(response.webSocket, code);
}

function identity(id: string, token = 'a'.repeat(64), sessionId = `${id}_session`): Record<string, RuntimeValue> {
  return { player: { id, name: id }, sessionId, nextResumeToken: token };
}

async function create(code: string, maxPlayers = 14): Promise<Client> {
  const host = await connect(code);
  const response = await host.request('room_create', { ...identity('host'), maxPlayers });
  expect(response.type).toBe('room_created');
  return host;
}

afterEach(async () => {
  vi.restoreAllMocks();
  for (const client of clients.splice(0)) {
    try { client.socket.close(); } catch { /* already closed */ }
  }
  await reset();
});

describe('routed Durable Object signaling', () => {
  it('separates shallow health, exact routes/origins, and native upgrade admission', async () => {
    const health = await exports.default.fetch('https://room.test/healthz');
    expect(await health.json()).toEqual({ ok: true, service: 'cot-signaling', backend: 'durable-object' });
    for (const path of ['/rooms', '/rooms/abcdef', '/rooms/ABCDEF/extra', '/rooms/ABCDEF?token=secret']) {
      expect((await exports.default.fetch(`https://room.test${path}`)).status).toBe(404);
    }
    expect((await exports.default.fetch('https://room.test/rooms/ABCDEF',
      { headers: { Upgrade: 'websocket' } })).status).toBe(403);
    expect((await exports.default.fetch('https://room.test/rooms/ABCDEF',
      { headers: { Upgrade: 'websocket', Origin: `${origin}.evil` } })).status).toBe(403);
    expect((await exports.default.fetch('https://room.test/rooms/ABCDEF',
      { headers: { Origin: origin } })).status).toBe(426);
  });

  it('creates, derives sender identity, fences cross-room traffic, and closes only on explicit host leave', async () => {
    const host = await create('ROOM01');
    const guest = await connect('ROOM01');
    const joined = await guest.request('room_join', identity('guest', 'b'.repeat(64)));
    expect(joined.payload.hostId).toBe('host');
    expect(joined.payload.peers).toEqual([{ peerId: 'host', player: { id: 'host', name: 'host' },
      sessionId: 'host_session', isHost: true }]);
    const notification = await host.next((message) => message.type === 'peer_joined');
    expect(JSON.stringify(notification)).not.toContain('resumeToken');
    guest.send('room_signal', { fromPeerId: 'forged', fromSessionId: 'forged',
      toPeerId: 'host', toSessionId: 'host_session', signal: { kind: 'restart' } });
    const signal = await host.next((message) => message.type === 'room_signal');
    expect(signal.payload.fromPeerId).toBe('guest');
    expect(signal.payload.fromSessionId).toBe('guest_session');
    expect((await guest.request('room_poll', { roomCode: 'OTHER1' })).payload.code).toBe('invalid_room_code');
    const stranger = await connect('ROOM01');
    expect((await stranger.request('room_poll')).payload.code).toBe('resume_denied');
    expect((await stranger.request('room_signal', { toPeerId: 'host', signal: { kind: 'restart' } }))
      .payload.code).toBe('not_in_room');
    expect((await stranger.request('room_leave')).payload.code).toBe('resume_denied');
    host.send('room_leave');
    expect((await guest.next((message) => message.type === 'room_closed')).payload.reason).toBe('host_left');
    const fresh = await connect('ROOM01');
    expect((await fresh.request('room_join', identity('guest'))).payload.code).toBe('room_not_found');
  });

  it('persists hashes before receipts and restores live socket identity across real hibernation', async () => {
    const host = await create('HIBER1');
    const guest = await connect('HIBER1');
    await guest.request('room_join', identity('guest', 'b'.repeat(64)));
    const stub = env.ROOMS.getByName('HIBER1');
    const storedBefore = await runInDurableObject(stub, (_instance, state) =>
      state.storage.sql.exec<{ data: string }>('SELECT data FROM room_state').one().data);
    expect(storedBefore).not.toContain('a'.repeat(64));
    expect(storedBefore).not.toContain('b'.repeat(64));
    expect(storedBefore).toContain('resumeTokenHash');
    await guest.request('room_poll');
    await guest.request('room_poll');
    const storedAfter = await runInDurableObject(stub, (_instance, state) =>
      state.storage.sql.exec<{ data: string }>('SELECT data FROM room_state').one().data);
    expect(storedAfter).toBe(storedBefore);
    await evictDurableObject(stub);
    expect((await host.request('room_poll')).type).toBe('room_polled');
    expect((await guest.request('room_poll')).type).toBe('room_polled');
    guest.send('room_signal', { toPeerId: 'host', signal: { kind: 'description',
      description: { type: 'offer', sdp: 'v=0\r\nnon-secret-fixture' } } });
    expect((await host.next((message) => message.type === 'room_signal')).payload.fromPeerId).toBe('guest');
    const persisted = await runInDurableObject(stub, (_instance, state) =>
      state.storage.sql.exec<{ data: string }>('SELECT data FROM room_state').one().data);
    expect(persisted).not.toContain('non-secret-fixture');
  });

  it('denies guessed host IDs; rotates capabilities and retries lost join/create replies safely after eviction', async () => {
    const host = await create('PROOF1');
    const attacker = await connect('PROOF1');
    expect((await attacker.request('room_join', identity('host', 'c'.repeat(64)))).payload.code).toBe('resume_denied');
    expect((await attacker.request('room_create', identity('host', 'c'.repeat(64)))).payload.code)
      .toBe('room_code_exhausted');
    expect((await attacker.request('room_leave')).payload.code).toBe('resume_denied');
    const retry = await connect('PROOF1');
    expect((await retry.request('room_create', identity('host'))).type).toBe('room_created');
    expect((await host.next((message) => message.type === 'error')).payload.code).toBe('resume_denied');
    await host.closed;
    await evictDurableObject(env.ROOMS.getByName('PROOF1'));
    const successor = await connect('PROOF1');
    expect((await successor.request('room_join', { ...identity('host', 'b'.repeat(64), 'successor_session'),
      resumeToken: 'a'.repeat(64) })).type).toBe('room_joined');
    await retry.closed;
    const replay = await connect('PROOF1');
    expect((await replay.request('room_join', { ...identity('host', 'b'.repeat(64), 'retry_session'),
      resumeToken: 'a'.repeat(64) })).type).toBe('room_joined');
    await successor.closed;
    const stale = await connect('PROOF1');
    expect((await stale.request('room_join', { ...identity('host', 'c'.repeat(64)),
      resumeToken: 'a'.repeat(64) })).payload.code).toBe('resume_denied');
    expect((await replay.request('room_poll')).type).toBe('room_polled');
  });

  it('preserves detached seats through restart and allows normal guest departure without closing host', async () => {
    const host = await create('DETACH');
    const guest = await connect('DETACH');
    await guest.request('room_join', identity('guest', 'b'.repeat(64)));
    guest.socket.close();
    await guest.closed;
    await evictDurableObject(env.ROOMS.getByName('DETACH'), { webSockets: 'close' });
    const resumedHost = await connect('DETACH');
    expect((await resumedHost.request('room_join', { ...identity('host', 'c'.repeat(64), 'host_new_session'),
      resumeToken: 'a'.repeat(64) })).type).toBe('room_joined');
    const resumedGuest = await connect('DETACH');
    expect((await resumedGuest.request('room_join', { ...identity('guest', 'd'.repeat(64), 'guest_new_session'),
      resumeToken: 'b'.repeat(64) })).type).toBe('room_joined');
    resumedGuest.send('room_leave');
    expect((await resumedHost.next((message) => message.type === 'peer_left')).payload.peerId).toBe('guest');
    expect((await resumedHost.request('room_poll')).type).toBe('room_polled');
    expect(host.messages.some((message) => message.type === 'room_closed')).toBe(false);
  });

  it('recovers a committed replacement before attachment update and fences its predecessor on wake', async () => {
    const old = await create('CRASH1');
    const replacement = await connect('CRASH1');
    const stub = env.ROOMS.getByName('CRASH1');
    await runInDurableObject(stub, (_instance, state) => {
      const pending = state.getWebSockets().map((ws) => ws.deserializeAttachment())
        .find((attachment) => !attachment.authenticated);
      const snapshot: SignalingRoomSnapshot = JSON.parse(state.storage.sql
        .exec<{ data: string }>('SELECT data FROM room_state').one().data);
      const member = snapshot.rooms[0].peers[0];
      member.connectionId = pending.id;
      member.sessionId = 'successor_session';
      member.resumeTokenHash = signalingResumeHash('b'.repeat(64));
      state.storage.sql.exec('UPDATE room_state SET data=? WHERE id=1', JSON.stringify(snapshot));
    });
    await evictDurableObject(stub);
    expect((await replacement.request('room_poll')).type).toBe('room_polled');
    expect((await old.next((message) => message.type === 'error')).payload.code).toBe('resume_denied');
    await old.closed;
    const count = await runInDurableObject(stub, (_instance, state) =>
      state.getWebSockets().filter((ws) => ws.deserializeAttachment().authenticated).length);
    expect(count).toBe(1);
  });

  it('retires authenticated attachments if durable deletion committed before socket closure', async () => {
    const host = await create('CRASH2');
    const stub = env.ROOMS.getByName('CRASH2');
    await runInDurableObject(stub, (_instance, state) => {
      state.storage.sql.exec('DELETE FROM room_state');
    });
    await evictDurableObject(stub);
    await runInDurableObject(stub, () => undefined);
    expect((await host.next((message) => message.type === 'error')).payload.code).toBe('resume_denied');
    await host.closed;
    await runDurableObjectAlarm(stub);
    const remaining = await runInDurableObject(stub, async (_instance, state) => ({
      sockets: state.getWebSockets().length, alarm: await state.storage.getAlarm(),
    }));
    expect(remaining).toEqual({ sockets: 0, alarm: null });
  });

  it('enforces fourteen seats independently of pending socket capacity', async () => {
    const host = await create('SEATS1');
    for (let peer = 1; peer < 14; peer++) {
      const guest = await connect('SEATS1');
      expect((await guest.request('room_join', identity(`guest${peer}`))).type).toBe('room_joined');
    }
    const extra = await connect('SEATS1');
    expect((await extra.request('room_join', identity('extra'))).payload.code).toBe('room_full');
    expect((await host.request('room_poll')).type).toBe('room_polled');
  });

  it('bounds pending sockets and expires unauthenticated connections with an alarm', async () => {
    for (let index = 0; index < MAX_PENDING_SOCKETS; index++) await connect('PEND01');
    const excess = await exports.default.fetch('https://room.test/rooms/PEND01', {
      headers: { Upgrade: 'websocket', Origin: origin, 'CF-Connecting-IP': 'test-pending' },
    });
    expect(excess.status).toBe(429);
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 15_001);
    expect(await runDurableObjectAlarm(env.ROOMS.getByName('PEND01'))).toBe(true);
    await Promise.all(clients.map((client) => client.closed));
    const remaining = await runInDurableObject(env.ROOMS.getByName('PEND01'), (_instance, state) =>
      state.getWebSockets().length);
    expect(remaining).toBe(0);
  });

  it('rate limits new upgrades by the Cloudflare client address before opening more room sockets', async () => {
    let last: Response | null = null;
    for (let attempt = 0; attempt <= 120; attempt++) {
      last = await exports.default.fetch('https://room.test/rooms/UPGRAD', {
        headers: { Upgrade: 'websocket', Origin: origin, 'CF-Connecting-IP': 'test-upgrade-rate',
          'X-Forwarded-For': `untrusted-${attempt}` },
      });
      if (last.webSocket) new Client(last.webSocket, 'UPGRAD');
    }
    expect(last?.status).toBe(429);
    expect(last?.headers.get('retry-after')).toBe('60');
    expect(await last?.json()).toEqual({ error: 'rate_limit' });
  });

  it('expires idle rooms after24h, closes host and guests, and deallocates room storage', async () => {
    const host = await create('EXPIRE');
    const guest = await connect('EXPIRE');
    await guest.request('room_join', identity('guest'));
    vi.spyOn(Date, 'now').mockReturnValue(Date.now() + ROOM_IDLE_TTL_MS + 1);
    expect(await runDurableObjectAlarm(env.ROOMS.getByName('EXPIRE'))).toBe(true);
    expect((await host.next((message) => message.type === 'room_closed')).payload.reason).toBe('expired');
    expect((await guest.next((message) => message.type === 'room_closed')).payload.reason).toBe('expired');
    const count = await runInDurableObject(env.ROOMS.getByName('EXPIRE'), (_instance, state) =>
      state.storage.sql.exec<{ total: number }>("SELECT COUNT(*) AS total FROM sqlite_master WHERE name='room_state'").one().total);
    expect(count).toBe(0);
  });

  it('deallocates never-admitted and explicitly closed rooms, then recreates the same code safely', async () => {
    const stranger = await connect('EMPTY1');
    expect((await stranger.request('room_join', identity('stranger'))).payload.code).toBe('room_not_found');
    stranger.socket.close();
    await stranger.closed;
    const unused = await runInDurableObject(env.ROOMS.getByName('EMPTY1'), (_instance, state) =>
      state.storage.sql.exec<{ total: number }>("SELECT COUNT(*) AS total FROM sqlite_master WHERE name='room_state'").one().total);
    expect(unused).toBe(0);
    const host = await create('REUSE1');
    host.send('room_leave');
    await host.closed;
    const stub = env.ROOMS.getByName('REUSE1');
    const cleared = await runInDurableObject(stub, async (_instance, state) => ({
      tables: state.storage.sql.exec<{ total: number }>("SELECT COUNT(*) AS total FROM sqlite_master WHERE name='room_state'").one().total,
      alarm: await state.storage.getAlarm(),
    }));
    expect(cleared).toEqual({ tables: 0, alarm: null });
    const replacement = await create('REUSE1');
    await evictDurableObject(stub);
    expect((await replacement.request('room_poll')).type).toBe('room_polled');
    const saved = await runInDurableObject(stub, (_instance, state) =>
      state.storage.sql.exec<{ total: number }>('SELECT COUNT(*) AS total FROM room_state').one().total);
    expect(saved).toBe(1);
  });

  it('bounds messages and persists per-socket rate accounting across hibernation', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.now());
    const host = await create('RATES1', 2);
    for (let index = 0; index < 4; index++) await host.request('room_poll');
    await evictDurableObject(env.ROOMS.getByName('RATES1'));
    for (let index = 5; index < RATE_MAX_MESSAGES; index++) await host.request('room_poll');
    host.send('room_poll');
    expect((await host.closed).reason).toBe('rate_limit');
    const oversized = await connect('SIZES1');
    oversized.socket.send('x'.repeat(128 * 1024 + 1));
    expect((await oversized.closed).reason).toBe('invalid_payload');
    const binary = await connect('BINARY');
    binary.socket.send(new ArrayBuffer(4));
    expect((await binary.closed).reason).toBe('invalid_payload');
    const malformed = await connect('BADMSG');
    malformed.socket.send('{');
    expect((await malformed.next((message) => message.type === 'error')).payload.code).toBe('invalid_payload');
  });

  it('admits a fourteen-seat host negotiation burst and retains its bounded counter through hibernation', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.now());
    const host = await create('BURST1');
    const guests: Client[] = [];
    for (let peer = 1; peer < 14; peer++) {
      const guest = await connect('BURST1');
      expect((await guest.request('room_join', identity(`guest${peer}`))).type).toBe('room_joined');
      guests.push(guest);
    }
    expect((await host.request('room_poll')).type).toBe('room_polled');
    for (let peer = 1; peer < 14; peer++) {
      const target = { toPeerId: `guest${peer}`, toSessionId: `guest${peer}_session` };
      host.send('room_signal', { ...target, signal: { kind: 'description',
        description: { type: 'offer', sdp: 'v=0\r\nnon-secret-burst-fixture' } } });
      for (let index = 0; index < 12; index++) {
        host.send('room_signal', { ...target, signal: { kind: 'ice', candidate: {
          candidate: `candidate:${index} 1 udp 1 192.0.2.1 ${10000 + index} typ relay`,
          sdpMid: '0', sdpMLineIndex: 0,
        } } });
      }
    }
    await Promise.all(guests.map((guest) => guest.next((message) => {
      const signal = message.payload.signal;
      return message.type === 'room_signal' && record(signal) && signal.kind === 'ice'
        && record(signal.candidate) && typeof signal.candidate.candidate === 'string'
        && signal.candidate.candidate.startsWith('candidate:11 ');
    })));
    for (const guest of guests) {
      const signals = guest.messages.filter((message) => message.type === 'room_signal');
      expect(signals).toHaveLength(13);
      expect(signals.every((message) => message.payload.fromPeerId === 'host')).toBe(true);
    }
    expect((await host.request('room_poll')).type).toBe('room_polled');
    await evictDurableObject(env.ROOMS.getByName('BURST1'));
    // Create + initial poll + 169 signals + confirming poll = 172. Eviction
    // must neither forget that count nor revert the authenticated host budget.
    for (let index = 172; index < 448; index++) {
      expect((await host.request('room_poll')).type).toBe('room_polled');
    }
    host.send('room_poll');
    expect((await host.closed).reason).toBe('rate_limit');
  });

  it('keeps guests and unauthenticated host impersonators at 120 messages per window', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(Date.now());
    const host = await create('GRATE1');
    const guest = await connect('GRATE1');
    expect((await guest.request('room_join', identity('guest'))).type).toBe('room_joined');
    const claimedHost = { peerId: 'host', hostId: 'host', role: 'host', maxPlayers: 14 };
    for (let index = 1; index < RATE_MAX_MESSAGES; index++) {
      expect((await guest.request('room_poll', claimedHost)).type).toBe('room_polled');
    }
    await evictDurableObject(env.ROOMS.getByName('GRATE1'));
    guest.send('room_poll', claimedHost);
    expect((await guest.closed).reason).toBe('rate_limit');
    const stranger = await connect('GRATE1');
    for (let index = 0; index < RATE_MAX_MESSAGES; index++) {
      expect((await stranger.request('room_poll', claimedHost)).payload.code).toBe('resume_denied');
    }
    stranger.send('room_poll', claimedHost);
    expect((await stranger.closed).reason).toBe('rate_limit');
    expect((await host.request('room_poll')).type).toBe('room_polled');
  });
});
