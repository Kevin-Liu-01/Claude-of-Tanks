/**
 * One HTTP server hosting the v2 room service and the match service on one
 * port: `/rooms/<CODE>` (room WebSocket), `/match` (match WebSocket),
 * `/healthz`, `/metrics`, `/control/*` and `/rooms/healthz`. The LAN helper
 * (`server/rooms/main.ts`), `tools/mp-rooms-e2e.mjs` and the receipts compose
 * it the same way.
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createMatchService, type MatchService } from '../match/service.ts';
import { createLogger, silentLogger, type Logger } from '../match/log.ts';
import { createLocalRoomService, type LocalRoomService } from './localRoomService.ts';
import type { RoomPolicyGuards } from '../../src/mp/room/roomPolicy.ts';

export interface RoomsServerOptions {
  host?: string;
  port?: number;
  seatSecret: string;
  controlSecret?: string;
  allowedOrigins?: readonly string[] | null;
  world?: 'dedicated' | 'terrain';
  countdownS?: number;
  battleLimitS?: number;
  maxActors?: number;
  guards?: Partial<RoomPolicyGuards>;
  log?: Logger;
  wallClock?: () => number;
  random?: () => number;
}

export interface RoomsServer {
  readonly address: AddressInfo;
  /** `ws://host:port` — the room endpoint clients configure. */
  readonly url: string;
  readonly matchService: MatchService;
  readonly roomService: LocalRoomService;
  close(): Promise<void>;
}

export async function createRoomsServer({
  host = '127.0.0.1',
  port = 0,
  seatSecret,
  controlSecret = seatSecret,
  allowedOrigins = null,
  world = 'dedicated',
  countdownS,
  battleLimitS,
  maxActors = 64,
  guards,
  log = silentLogger,
  wallClock,
  random,
}: RoomsServerOptions): Promise<RoomsServer> {
  const server = http.createServer();
  const matchService = await createMatchService({ server, host, port, allowedOrigins, seatSecret, controlSecret, maxActors, log, wallClock });
  const roomService = createLocalRoomService({
    matchService, seatSecret, allowedOrigins, matchUrl: '/match', world, countdownS, battleLimitS, guards, log, wallClock, random,
  });
  server.on('request', (request, response) => {
    if (matchService.handleRequest(request, response) || roomService.handleRequest(request, response)) return;
    const body = JSON.stringify({ error: 'not_found' });
    response.writeHead(404, { 'content-type': 'application/json; charset=utf-8', 'content-length': Buffer.byteLength(body) });
    response.end(body);
  });
  server.on('upgrade', (request, socket, head) => {
    if (matchService.handleUpgrade(request, socket, head) || roomService.handleUpgrade(request, socket, head)) return;
    socket.write('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n');
    socket.destroy();
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => { server.off('error', reject); resolve(); });
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('rooms server did not bind a TCP address');
  const url = `ws://${host}:${address.port}`;
  log.info('rooms server listening', { url });
  return {
    address,
    url,
    matchService,
    roomService,
    async close() {
      await roomService.close();
      await matchService.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

export { createLogger };
