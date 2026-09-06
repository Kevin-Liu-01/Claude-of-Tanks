import http from 'node:http';

/** Retire the old rendezvous path without opening Redis or a background timer. */
export function createRetiredSignalingServer(): http.Server {
  const body = JSON.stringify({ ok: false, error: 'signaling_moved', refreshRequired: true });
  const server = http.createServer((_request, response) => {
    response.writeHead(410, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    });
    response.end(body);
  });
  server.on('upgrade', (_request, socket) => {
    socket.end('HTTP/1.1 410 Gone\r\nConnection: close\r\nCache-Control: no-store\r\n'
      + 'Content-Length: 0\r\n\r\n');
  });
  return server;
}
