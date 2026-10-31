/**
 * PadPair: one Durable Object per phone-controller code (docs/PHONE-CONTROLLER.md). It hosts the shared `PadActor`
 * (src/pad/padActor.ts) behind hibernatable WebSockets — the `Room` object's patterns: a SQLite state row, socket
 * attachments, alarms, the keepalive auto-response — and nothing else. It is its own channel beside the rooms: no seat,
 * room, match or report, and no game traffic but the capped relay of last resort.
 *
 * The Worker hands it `/pad/new/<CODE>` (a code it drew), `/pad/join/<CODE>` or `/pad/resume/<CODE>`. A held code
 * answers 409 to `/pad/new` so the Worker draws again. Resume tokens are stored as SHA-256 hashes; SDP is relayed and
 * never parsed; ICE servers come from the same issuer as the matches' (`server/relayCredentials.ts`: STUN alone while
 * the relay secrets are unset).
 */
import { DurableObject } from 'cloudflare:workers';
import { createHash } from 'node:crypto';
import { createRelayIssuer, pickRelayEnv } from '../../../server/relayCredentials.ts';
import type { RelayIssuer } from '../../../server/relayCredentials.ts';
import { PadActor } from '../../../src/pad/padActor.ts';
import type { PadActorState, PadSocketRecord } from '../../../src/pad/padActor.ts';
import { PAD_KEEPALIVE_REQUEST, PAD_KEEPALIVE_RESPONSE, PAD_MAX_MESSAGE_BYTES, normalizePadCode } from '../../../src/pad/padProtocol.ts';
import type { PadEndReason, PadHostMessage } from '../../../src/pad/padProtocol.ts';
import { allowedOrigin, isWebSocketUpgrade, json } from './util.ts';

/** The desktop, one phone, and one socket resuming. */
const MAX_PAD_SOCKETS = 3;

interface PadAttachment extends PadSocketRecord {
  version: 1;
  code: string;
}

function isAttachment(value: unknown): value is PadAttachment {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return record.version === 1 && typeof record.code === 'string' && typeof record.id === 'string' &&
    (record.role === 'desktop' || record.role === 'phone' || record.role === 'pending');
}

/** The internal route the Worker forwards: the kind and the code. */
function padForward(pathname: string): { kind: 'new' | 'join' | 'resume'; code: string } | null {
  const match = /^\/pad\/(new|join|resume)\/([A-Za-z0-9]{6})$/.exec(pathname);
  const code = match ? normalizePadCode(match[2]) : null;
  return match && code ? { kind: match[1] as 'new' | 'join' | 'resume', code } : null;
}

export class PadPair extends DurableObject<Env> {
  #actor: PadActor | null = null;
  #sockets = new Map<string, WebSocket>();
  #ids = new Map<WebSocket, string>();
  #nextAlarm: number | null = null;
  #alarmWanted: number | null | undefined = undefined;
  #pendingCloses: Array<{ ws: WebSocket; reason: string }> = [];
  #relay: RelayIssuer | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PAD_KEEPALIVE_REQUEST, PAD_KEEPALIVE_RESPONSE));
    this.ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS pad_state (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL)');
    const row = this.ctx.storage.sql.exec<{ data: string }>('SELECT data FROM pad_state WHERE id=1').toArray()[0];
    let state: PadActorState | null = null;
    if (row) { try { state = JSON.parse(row.data) as PadActorState; } catch { state = null; } }
    const sockets = this.ctx.getWebSockets();
    const code = state?.code ?? (sockets.length ? (sockets[0]!.deserializeAttachment() as PadAttachment | null)?.code : '') ?? '';
    if (code) {
      const actor = this.#activate(code);
      actor.restore(state);
      for (const ws of sockets) {
        const attachment: unknown = ws.deserializeAttachment();
        if (!isAttachment(attachment) || attachment.code !== code) { ws.close(1008, 'invalid'); continue; }
        this.#sockets.set(attachment.id, ws);
        this.#ids.set(ws, attachment.id);
        actor.attachSocket(attachment);
      }
    }
    this.ctx.blockConcurrencyWhile(async () => { this.#nextAlarm = await this.ctx.storage.getAlarm(); });
  }

  #activate(code: string): PadActor {
    if (this.#actor && this.#actor.code === code) return this.#actor;
    this.#actor = new PadActor(code, {
      now: () => Date.now(),
      randomToken: () => {
        const bytes = crypto.getRandomValues(new Uint8Array(16));
        return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      },
      sha256Hex: (text) => createHash('sha256').update(text).digest('hex'),
      send: (socketId, message) => this.#send(socketId, message),
      close: (socketId, reason) => this.#close(socketId, reason),
      schedule: (atMs) => { this.#alarmWanted = atMs; },
      persist: () => this.#persist(),
      iceServers: () => (this.#relay ??= createRelayIssuer({ env: pickRelayEnv(this.env) })).issue(),
    });
    return this.#actor;
  }

  #send(socketId: string, message: PadHostMessage): void {
    const ws = this.#sockets.get(socketId);
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    try { ws.send(JSON.stringify(message)); } catch { /* its close handler detaches */ }
  }

  /** Detach now, close after the event (the Room object's rule: a close inside the event crashed the runtime). */
  #close(socketId: string, reason: PadEndReason): void {
    const ws = this.#sockets.get(socketId);
    this.#sockets.delete(socketId);
    if (ws) { this.#ids.delete(ws); this.#pendingCloses.push({ ws, reason }); }
  }

  #flushCloses(): void {
    if (!this.#pendingCloses.length) return;
    const pending = this.#pendingCloses.splice(0);
    setTimeout(() => { for (const { ws, reason } of pending) { try { ws.close(1000, reason); } catch { /* closed */ } } }, 0);
  }

  #persist(): void {
    const state = this.#actor?.exportState() ?? null;
    if (!state) { this.ctx.storage.sql.exec('DELETE FROM pad_state WHERE id=1'); return; }
    this.ctx.storage.sql.exec('INSERT INTO pad_state (id,data) VALUES (1,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data', JSON.stringify(state));
  }

  async #applyAlarm(): Promise<void> {
    const wanted = this.#alarmWanted === undefined ? (this.#actor?.nextDeadline() ?? null) : this.#alarmWanted;
    this.#alarmWanted = undefined;
    if (wanted === null) {
      if (this.#nextAlarm !== null) await this.ctx.storage.deleteAlarm();
      this.#nextAlarm = null;
      // a code that holds nothing and has no live socket deallocates
      if (this.#actor?.vacant && this.ctx.getWebSockets().length === 0) await this.ctx.storage.deleteAll();
      return;
    }
    if (this.#nextAlarm === null || Math.abs(wanted - this.#nextAlarm) > 250) {
      await this.ctx.storage.setAlarm(wanted);
      this.#nextAlarm = wanted;
    }
  }

  #attach(ws: WebSocket, socketId: string, code: string): void {
    const record = this.#actor?.socketRecord(socketId);
    if (record) ws.serializeAttachment({ version: 1, code, ...record } satisfies PadAttachment);
  }

  async fetch(request: Request): Promise<Response> {
    const route = padForward(new URL(request.url).pathname);
    if (!route || (this.#actor && this.#actor.code !== route.code)) return json({ error: 'invalid_pad_route' }, 404);
    if (!allowedOrigin(request, this.env.ALLOWED_ORIGINS)) return json({ error: 'origin_forbidden' }, 403);
    if (!isWebSocketUpgrade(request)) return json({ error: 'websocket_required' }, 426);
    const actor = this.#activate(route.code);
    if (route.kind === 'new' && !actor.vacant) return json({ error: 'pad_code_held' }, 409);
    if (this.ctx.getWebSockets().length >= MAX_PAD_SOCKETS) return json({ error: 'pad_full' }, 429);
    const pair = new WebSocketPair();
    const ws = pair[1];
    const socketId = crypto.randomUUID();
    this.ctx.acceptWebSocket(ws);
    this.#sockets.set(socketId, ws);
    this.#ids.set(ws, socketId);
    if (route.kind === 'new') actor.openDesktop(socketId);
    else if (route.kind === 'join') actor.openJoin(socketId);
    else actor.openResume(socketId);
    if (this.#sockets.has(socketId)) this.#attach(ws, socketId, route.code);
    await this.#applyAlarm();
    this.#flushCloses();
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  async webSocketMessage(ws: WebSocket, data: string | ArrayBuffer): Promise<void> {
    const socketId = this.#ids.get(ws);
    const actor = this.#actor;
    if (!socketId || !actor) {
      if (!this.#pendingCloses.some((pending) => pending.ws === ws)) ws.close(1008, 'unknown');
      return;
    }
    const text = typeof data === 'string' ? data : data.byteLength > PAD_MAX_MESSAGE_BYTES ? null : new TextDecoder().decode(data);
    actor.handleMessage(socketId, text ?? 'x'.repeat(PAD_MAX_MESSAGE_BYTES + 1));
    if (this.#sockets.has(socketId)) this.#attach(ws, socketId, actor.code);
    await this.#applyAlarm();
    this.#flushCloses();
  }

  async webSocketClose(ws: WebSocket, code = 1000, reason = ''): Promise<void> {
    const socketId = this.#ids.get(ws);
    if (socketId) {
      this.#sockets.delete(socketId);
      this.#ids.delete(ws);
      this.#actor?.handleClose(socketId);
      try { ws.close(code, reason); } catch { /* closed, or a code the runtime refuses to echo */ }
    }
    await this.#applyAlarm();
    this.#flushCloses();
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    await this.webSocketClose(ws);
  }

  async alarm(): Promise<void> {
    this.#nextAlarm = null;
    this.#actor?.tick();
    await this.#applyAlarm();
    this.#flushCloses();
  }
}
