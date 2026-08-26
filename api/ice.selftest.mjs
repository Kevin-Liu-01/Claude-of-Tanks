import assert from 'node:assert/strict';
import { createIceConfigHandler } from './ice.js';

async function invoke(handler, { method = 'GET', origin = 'https://cot.kevinliu.studio' } = {}) {
  const headers = new Map();
  let text = '';
  const response = {
    statusCode: 200,
    setHeader(name, value) { headers.set(name.toLowerCase(), value); },
    end(value = '') { text = String(value); },
  };
  await handler({ method, headers: { origin } }, response);
  return { status: response.statusCode, headers, body: JSON.parse(text) };
}

const missing = await invoke(createIceConfigHandler({ env: {} }));
assert.equal(missing.status, 503);
assert.equal(missing.body.error, 'turn_service_unconfigured');

const forbidden = await invoke(createIceConfigHandler({ env: {} }), {
  origin: 'https://attacker.example',
});
assert.equal(forbidden.status, 403);

const generated = await invoke(createIceConfigHandler({
  env: {
    COT_CLOUDFLARE_TURN_KEY_ID: 'key-id',
    COT_CLOUDFLARE_TURN_API_TOKEN: 'secret',
  },
  fetchImpl: async (url, init) => {
    assert.match(url, /key-id\/credentials\/generate-ice-servers$/);
    assert.equal(init.headers.authorization, 'Bearer secret');
    return new Response(JSON.stringify({
      iceServers: [
        { urls: ['stun:stun.cloudflare.com:3478'] },
        { urls: ['turns:turn.cloudflare.com:443?transport=tcp'], username: 'short', credential: 'lived' },
      ],
    }), { status: 201 });
  },
}));
assert.equal(generated.status, 200);
assert.equal(generated.body.expiresInSeconds, 28800);
assert.equal(generated.body.iceServers.length, 2);
assert.equal(generated.headers.get('cache-control'), 'private, no-store, max-age=0');

console.log('ice endpoint selftest: origin gate and short-lived TURN proxy passed');
