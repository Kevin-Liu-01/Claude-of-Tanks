import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [compose, caddy, dockerfile, development] = await Promise.all([
  readFile(new URL('../compose.selfhost.yaml', import.meta.url), 'utf8'),
  readFile(new URL('../deploy/Caddyfile', import.meta.url), 'utf8'),
  readFile(new URL('../Dockerfile.selfhost', import.meta.url), 'utf8'),
  readFile(new URL('../docs/DEVELOPMENT.md', import.meta.url), 'utf8'),
]);

for (const service of ['web:', 'signal:', 'match:', 'turn:']) {
  assert.match(compose, new RegExp(`^  ${service}`, 'm'),
    `self-host stack includes ${service.slice(0, -1)}`);
}
for (const route of ['/api/signal', '/api/ice', '/ranked/*', '/match']) {
  assert.ok(caddy.includes(route), `same-origin gateway owns ${route}`);
}
for (const secret of ['COT_TURN_SHARED_SECRET', 'COT_TURN_EXTERNAL_IP', 'COT_TURN_URLS']) {
  assert.match(compose, new RegExp(`\\$\\{${secret}:\\?`),
    `${secret} must be explicit instead of silently using a hosted service`);
}
assert.match(compose, /coturn\/coturn:4\.6\.3-r3/);
assert.match(dockerfile, /RUN npm run build/);
assert.match(dockerfile, /VITE_SELF_HOSTED=1/,
  'the local image must compile out hosted analytics');
assert.match(development, /docker compose --env-file \.env -f compose\.selfhost\.yaml up --build -d/);
assert.doesNotMatch(compose, /cloudflare|vercel|upstash|google/i,
  'complete self-host deployment has no managed runtime dependency');

const [backend, gateway, example, dockerIgnore, gitIgnore, backendImage] = await Promise.all([
  readFile(new URL('../compose.multiplayer.yaml', import.meta.url), 'utf8'),
  readFile(new URL('../deploy/Caddyfile.multiplayer', import.meta.url), 'utf8'),
  readFile(new URL('../.env.multiplayer.example', import.meta.url), 'utf8'),
  readFile(new URL('../.dockerignore', import.meta.url), 'utf8'),
  readFile(new URL('../.gitignore', import.meta.url), 'utf8'),
  readFile(new URL('../Dockerfile.multiplayer', import.meta.url), 'utf8'),
]);
for (const service of ['gateway:', 'signal:']) {
  assert.match(backend, new RegExp(`^  ${service}`, 'm'));
}
assert.doesNotMatch(backend, /^  (web|turn|redis|db|match):/m);
assert.doesNotMatch(backend,
  /target: web|COT_TURN_SHARED_SECRET|UPSTASH_REDIS_REST_TOKEN|COT_RATING_FILE|match-data|dedicatedMatchServer/,
  'private-room hosting requires no dedicated service, rating storage, or provider secrets');
for (const field of ['COT_MULTIPLAYER_ADDRESS', 'COT_MULTIPLAYER_ALLOWED_ORIGINS']) {
  assert.ok(backend.includes('${' + field + ':?'), `${field} cannot silently default in production`);
}
for (const route of ['/api/signal', '/healthz/signaling']) {
  assert.ok(gateway.includes(route), `backend gateway owns ${route}`);
}
assert.doesNotMatch(gateway, /file_server|\/api\/ice|\/ranked|\/match|match:8790/,
  'only private signaling is routed; TURN stays on the frontend origin');
assert.match(gateway, /respond "Not found" 404/);
assert.match(backend, /tls-data:\/data/);
assert.match(backend, /tls-config:\/config/);
assert.equal((backend.match(/init: true/g) || []).length, 1);
assert.equal((backend.match(/stop_grace_period: 15s/g) || []).length, 1);
assert.equal((backend.match(/^    ports:/gm) || []).length, 1,
  'only the gateway publishes ports; services remain on the Docker network');
assert.match(example, /VITE_SIGNAL_URL=wss:\/\//);
assert.doesNotMatch(example, /^#?\s*VITE_MATCH_SERVICE_URL=/m,
  'the supported private/LAN setup does not configure a ranked backend');
for (const ignores of [dockerIgnore, gitIgnore]) {
  assert.match(ignores, /^\.env$/m);
  assert.match(ignores, /^\.env\.\*$/m);
  assert.match(ignores, /^!\.env\.\*\.example$/m);
}
assert.match(dockerIgnore, /^\.vercel$/m,
  'Vercel project credentials must never enter backend images');
assert.match(backendImage, /npm ci --omit=dev --ignore-scripts/);
assert.doesNotMatch(backendImage, /COPY \. \.|COPY public|RUN npm run build/);
assert.match(backendImage, /^USER node$/m);
assert.doesNotMatch(backendImage, /\/var\/lib\/claude-of-tanks|ratings\.json/,
  'the signaling image needs no writable rating directory');
assert.equal((backend.match(/read_only: true/g) || []).length, 1);

console.log('selfhost-deployment.selftest: static game, signaling, ICE, ranked, and TURN are locally owned');
console.log('selfhost-deployment.selftest: signaling-only private backend and secret exclusions pass');
