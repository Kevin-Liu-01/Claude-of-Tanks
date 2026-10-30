/**
 * The phone controller's pairing on the real Worker and PadPair object (docs/PHONE-CONTROLLER.md): /pad/new hands a
 * desktop a fresh code, /pad/join pairs it once, a wrong code is refused as unknown, signals relay between the two,
 * the keepalive is answered without waking the object, a code expires on its alarm (and its storage deallocates),
 * a phone resumes with its token across an eviction, and junk routes never reach an object. No relay secret here: an
 * ICE grant is STUN alone.
 */
import { env, exports } from 'cloudflare:workers';
import { evictDurableObject, runDurableObjectAlarm, runInDurableObject } from 'cloudflare:test';
import { afterEach, describe, expect, it } from 'vitest';
import { PAD_KEEPALIVE_REQUEST, PAD_KEEPALIVE_RESPONSE } from '../../../src/pad/padProtocol.ts';
import { origin } from './client.ts';

interface PadMessage { t: string; [key: string]: unknown }

class PadClient {
  readonly messages: PadMessage[] = [];
  readonly raw: string[] = [];
  readonly closed: Promise<CloseEvent>;
  private readonly waiters = new Set<() => void>();
  constructor(readonly socket: WebSocket) {
    socket.accept();
    socket.addEventListener('message', (event) => {
      const text = typeof event.data === 'string' ? event.data : new TextDecoder().decode(event.data as ArrayBuffer);
      if (text.startsWith('{')) this.messages.push(JSON.parse(text) as PadMessage); else this.raw.push(text);
      for (const waiter of [...this.waiters]) waiter();
    });
    this.closed = new Promise((resolve) => socket.addEventListener('close', resolve, { once: true }));
  }
  next(t: string, timeoutMs = 3_000): Promise<PadMessage> {
    const found = () => this.messages.find((message) => message.t === t);
    if (found()) return Promise.resolve(found()!);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.waiters.delete(waiter); reject(new Error(`no ${t}; got ${this.messages.map((m) => m.t).join(',')}`)); }, timeoutMs);
      const waiter = () => { const hit = found(); if (!hit) return; clearTimeout(timer); this.waiters.delete(waiter); resolve(hit); };
      this.waiters.add(waiter);
    });
  }
  send(value: unknown): void { this.socket.send(typeof value === 'string' ? value : JSON.stringify(value)); }
}

const clients: PadClient[] = [];
afterEach(() => { for (const client of clients.splice(0)) { try { client.socket.close(1000, 'test'); } catch { /* closed */ } } });

async function upgrade(path: string, ip: string): Promise<PadClient> {
  const response = await exports.default.fetch(`https://rooms.test${path}`, { headers: { Upgrade: 'websocket', Origin: origin, 'CF-Connecting-IP': ip } });
  expect(response.status).toBe(101);
  const client = new PadClient(response.webSocket!);
  clients.push(client);
  return client;
}

describe('phone controller pairing', () => {
  it('pairs a desktop and one phone, relays signals, answers the keepalive and grants STUN', async () => {
    const desktop = await upgrade('/pad/new', 'pad-a');
    const code = await desktop.next('code');
    expect(code.code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{6}$/);
    expect(typeof code.token).toBe('string');

    desktop.send(PAD_KEEPALIVE_REQUEST);
    await expect.poll(() => desktop.raw).toContain(PAD_KEEPALIVE_RESPONSE);

    const wrong = await upgrade('/pad/join/ZZZZZZ', 'pad-a');
    expect((await wrong.next('end')).reason).toBe('unknown');

    const phone = await upgrade(`/pad/join/${String(code.code).toLowerCase()}`, 'pad-b');
    expect((await phone.next('joined')).token).toBeTypeOf('string');
    expect((await desktop.next('peer')).state).toBe('here');

    const second = await upgrade(`/pad/join/${String(code.code)}`, 'pad-c');
    expect((await second.next('end')).reason).toBe('unknown');

    phone.send({ t: 'signal', kind: 'offer', sdp: 'v=0' });
    expect(await desktop.next('signal')).toEqual({ t: 'signal', kind: 'offer', sdp: 'v=0' });
    phone.send({ t: 'ice' });
    const ice = await phone.next('ice');
    expect(ice.relay).toBe(false);
    expect(JSON.stringify(ice.iceServers)).toContain('stun:stun.cloudflare.com:3478');
  });

  it('expires a waiting code on its alarm and deallocates', async () => {
    const desktop = await upgrade('/pad/new', 'pad-d');
    const code = String((await desktop.next('code')).code);
    const stub = env.PADS.getByName(code);
    await runInDurableObject(stub, async (_instance, state) => {
      const row = JSON.parse(state.storage.sql.exec<{ data: string }>('SELECT data FROM pad_state WHERE id=1').one().data) as { expiresAt: number };
      state.storage.sql.exec('UPDATE pad_state SET data=? WHERE id=1', JSON.stringify({ ...row, expiresAt: Date.now() - 1 }));
    });
    await evictDurableObject(stub);
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    expect((await desktop.next('end')).reason).toBe('expired');
    await desktop.closed;
    const late = await upgrade(`/pad/join/${code}`, 'pad-d');
    expect((await late.next('end')).reason).toBe('unknown');
  });

  it('resumes a phone across an eviction with its token', async () => {
    const desktop = await upgrade('/pad/new', 'pad-e');
    const code = String((await desktop.next('code')).code);
    const phone = await upgrade(`/pad/join/${code}`, 'pad-f');
    const token = String((await phone.next('joined')).token);
    await evictDurableObject(env.PADS.getByName(code));
    const back = await upgrade(`/pad/resume/${code}`, 'pad-f');
    back.send({ t: 'resume', token });
    await back.next('resumed');
    expect((await phone.next('end')).reason).toBe('replaced');
    back.send({ t: 'end' });
    expect((await desktop.next('end')).reason).toBe('ended');
  });

  it('answers junk without an object', async () => {
    for (const path of ['/pad/join/ZZZZZZ?x=1', '/pad/nope', '/pad/join/ZZZ0ZZ']) {
      const response = await exports.default.fetch(`https://rooms.test${path}`, { headers: { Upgrade: 'websocket', Origin: origin } });
      expect(response.status).toBe(404);
    }
    const foreign = await exports.default.fetch('https://rooms.test/pad/new', { headers: { Upgrade: 'websocket', Origin: 'https://evil.test' } });
    expect(foreign.status).toBe(403);
    const plain = await exports.default.fetch('https://rooms.test/pad/new', { headers: { Origin: origin } });
    expect(plain.status).toBe(426);
  });
});
