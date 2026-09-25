/**
 * A stand-in for `MatchContainer` in the Workers-runtime suite: the same
 * surface the Room object touches — `startAndWaitForPorts()` (RPC), the
 * control routes of server/match/control.ts and the `/match` WebSocket —
 * without a container. Tests read and steer it through `runInDurableObject`.
 */
import { DurableObject } from 'cloudflare:workers';

export interface StubState {
  starts: number;
  configs: unknown[];
  phase: 'loading' | 'countdown' | 'playing' | 'ended' | 'stopped';
  verdict: { result: 'alpha' | 'bravo' | 'draw'; reason: string } | null;
  /** When set, control requests answer with this status (simulating a dead container). */
  failWith: number | null;
  authorizations: string[];
  matchSockets: number;
}

export class MatchContainerStub extends DurableObject<Env> {
  state: StubState = { starts: 0, configs: [], phase: 'loading', verdict: null, failWith: null, authorizations: [], matchSockets: 0 };

  async startAndWaitForPorts(): Promise<void> {
    this.state.starts++;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/match' && request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
      const pair = new WebSocketPair();
      const server = pair[1];
      server.accept();
      this.state.matchSockets++;
      server.addEventListener('message', (event) => {
        const data = event.data;
        // echo the frame back prefixed with "echo:" so the test proves the bytes crossed the proxy
        server.send(typeof data === 'string' ? `echo:${data}` : new Uint8Array([0x65, ...new Uint8Array(data as ArrayBuffer)]));
      });
      return new Response(null, { status: 101, webSocket: pair[0] });
    }
    this.state.authorizations.push(request.headers.get('authorization') ?? '');
    if (this.state.failWith !== null) return new Response('down', { status: this.state.failWith });
    if (request.method === 'POST' && url.pathname === '/control/matches') {
      const body = await request.json();
      this.state.configs.push(body);
      this.state.phase = 'countdown';
      this.state.verdict = null;
      return Response.json({ roomId: (body as { roomId: string }).roomId, matchId: (body as { matchId: string }).matchId, matchPath: '/match' }, { status: 201 });
    }
    const room = /^\/control\/matches\/([A-Z0-9]{6})$/.exec(url.pathname)?.[1];
    if (request.method === 'GET' && room) {
      if (this.state.configs.length === 0) return Response.json({ error: 'not_found' }, { status: 404 });
      const config = this.state.configs.at(-1) as { matchId: string };
      return Response.json({ roomId: room, matchId: config.matchId, phase: this.state.phase, tick: 0, verdict: this.state.verdict });
    }
    if (request.method === 'DELETE' && room) { this.state.phase = 'stopped'; return new Response(null, { status: 204 }); }
    return Response.json({ error: 'not_found' }, { status: 404 });
  }
}
