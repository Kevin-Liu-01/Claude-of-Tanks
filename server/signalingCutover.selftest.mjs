import assert from 'node:assert/strict';
import { WebSocket } from 'ws';

// Deliberately incomplete/invalid old provider settings: cutover must not even
// validate these or construct a Redis client. No real cloud credential is used.
process.env.VERCEL = '1';
process.env.COT_SIGNAL_BACKEND = 'cloudflare';
process.env.COT_SIGNAL_REDIS_REDIS_URL = 'invalid-retired-provider';
const { default: server } = await import('../api/signal.ts');
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
try {
  const url = `http://127.0.0.1:${server.address().port}/api/signal`;
  const response = await fetch(url);
  assert.equal(response.status, 410);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), {
    ok: false, error: 'signaling_moved', refreshRequired: true,
  });
  await new Promise((resolve, reject) => {
    const socket = new WebSocket(url.replace('http:', 'ws:'));
    const timer = setTimeout(() => { socket.terminate(); reject(new Error('upgrade did not close')); }, 2000);
    socket.on('open', () => { clearTimeout(timer); socket.close(); reject(new Error('retired endpoint accepted socket')); });
    socket.on('error', (error) => {
      clearTimeout(timer);
      try { assert.match(error.message, /410/); resolve(); } catch (failure) { reject(failure); }
    });
  });
} finally {
  await new Promise((resolve) => server.close(resolve));
}
console.log('signaling cutover: old HTTP/WS retired without Redis PASS');
