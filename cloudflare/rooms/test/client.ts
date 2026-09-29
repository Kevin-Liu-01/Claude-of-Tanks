/**
 * The room-socket client the Workers-runtime suites drive: one WebSocket to
 * the Worker under test, envelopes in, decoded envelopes out (the room sends
 * binary UTF-8 JSON, handed to the client as a Blob and decoded in order),
 * `next(predicate)` waits, `request()` correlates by requestId.
 */
import { exports } from 'cloudflare:workers';
import { expect } from 'vitest';

export interface Message { type: string; requestId?: string; payload: Record<string, unknown> }
export const origin = 'https://cot.kevinliu.studio';
const clients: Client[] = [];
let requestSequence = 0;
export const token = (seed: string): string => seed.repeat(64).slice(0, 64);

export class Client {
  readonly messages: Message[] = [];
  /** P1b: text frames that are not envelopes — the room's keepalive answer (`pong`), in order. */
  readonly raw: string[] = [];
  readonly closed: Promise<CloseEvent>;
  private readonly waiters = new Set<() => void>();
  private queue: Promise<void> = Promise.resolve();
  constructor(readonly socket: WebSocket, readonly code: string) {
    socket.accept();
    socket.addEventListener('message', (event) => {
      const data = event.data as string | Blob | ArrayBuffer;
      this.queue = this.queue.then(async () => {
        const text = typeof data === 'string' ? data : data instanceof Blob ? await data.text() : new TextDecoder().decode(data);
        if (typeof data === 'string' && !text.startsWith('{')) this.raw.push(text);
        else this.messages.push(JSON.parse(text));
        for (const waiter of [...this.waiters]) waiter();
      });
    });
    this.closed = new Promise((resolve) => socket.addEventListener('close', resolve, { once: true }));
    clients.push(this);
  }
  /** Wait until at least `count` raw text frames arrived. */
  rawCount(count: number, timeoutMs = 3_000): Promise<number> {
    if (this.raw.length >= count) return Promise.resolve(this.raw.length);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.waiters.delete(waiter); reject(new Error(`Expected ${count} raw frames, received ${this.raw.length}`)); }, timeoutMs);
      const waiter = () => {
        if (this.raw.length < count) return;
        clearTimeout(timer);
        this.waiters.delete(waiter);
        resolve(this.raw.length);
      };
      this.waiters.add(waiter);
    });
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
  /** The messages of one type, oldest first. */
  all(type: string): Message[] { return this.messages.filter((message) => message.type === type); }
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
  /** A `room_command`, answered by its ack or error. */
  command(command: Record<string, unknown>): Promise<Message> {
    return this.request('room_command', { command });
  }
}

export async function connect(code: string, ip = `test-${code}`): Promise<Client> {
  const response = await exports.default.fetch(`https://room.test/rooms/${code}`, {
    headers: { Upgrade: 'websocket', Origin: origin, 'CF-Connecting-IP': ip },
  });
  expect(response.status).toBe(101);
  if (!response.webSocket) throw new Error('Worker did not upgrade WebSocket');
  return new Client(response.webSocket, code);
}

export function identity(id: string, resume = token('a'), next = token('b'), extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { player: { id, name: id }, resumeToken: resume, nextResumeToken: next, selection: { specId: 'm1a2' }, ...extra };
}

export async function create(code: string, settings: Record<string, unknown> = { teamSize: 2, mapId: 'verdant' }): Promise<Client> {
  const admin = await connect(code);
  const response = await admin.request('room_create', { ...identity('admin'), mode: 'private', settings });
  expect(response.type).toBe('room_created');
  return admin;
}

/** Close every client a test opened (the suites' afterEach). */
export function closeClients(): void {
  for (const client of clients.splice(0)) {
    try { client.socket.close(); } catch { /* already closed */ }
  }
}
