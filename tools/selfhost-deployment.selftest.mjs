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

console.log('selfhost-deployment.selftest: static game, signaling, ICE, ranked, and TURN are locally owned');
