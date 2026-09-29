// The peer harness page (docs/MULTIPLAYER-V2.md §13.8) is a development surface only: the vite plugin that serves it
// applies to `serve` alone and carries no build hook, the page is not a rollup input, a finished `dist/` (when one
// exists in the checkout) contains nothing of it, and the dev server answers the route with the page whose module is
// the source file under /tools/ (transformed like any dev module, ahead of the HTML 404 rewrite of `cot-routes`).
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import net from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createServer } from 'vite';
import config from '../vite.config.ts';

const root = resolve(new URL('..', import.meta.url).pathname);
const BUILD_HOOKS = ['buildStart', 'buildEnd', 'generateBundle', 'writeBundle', 'closeBundle', 'renderChunk', 'transform', 'load', 'resolveId', 'transformIndexHtml', 'options', 'outputOptions'];

// ---- the plugin: serve-only, no build hook, before the HTML rewrite
const plugins = config.plugins.flat();
const harness = plugins.find((plugin) => plugin?.name === 'cot-mp-p2p-peer-harness');
assert.ok(harness, 'the harness plugin is registered');
assert.equal(harness.apply, 'serve', 'the harness plugin applies to the dev server alone');
for (const hook of BUILD_HOOKS) assert.equal(hook in harness, false, `the harness plugin carries no ${hook} hook`);
assert.equal(typeof harness.configureServer, 'function');
const routes = plugins.findIndex((plugin) => plugin?.name === 'cot-routes');
assert.ok(plugins.indexOf(harness) < routes, 'the harness middleware runs before cot-routes (whose HTML rewrite answers 404 for unknown documents)');

// ---- not a build input; the page's module is the source under /tools/
const inputs = Object.values(config.build.rollupOptions.input);
assert.equal(inputs.some((entry) => String(entry).includes('mp-p2p-peer')), false, 'the harness page is not a rollup input');
const page = readFileSync(join(root, 'tools/mp-p2p-peer/index.html'), 'utf8');
assert.match(page, /<script type="module" src="\/tools\/mp-p2p-peer\/peer\.ts"><\/script>/);
const module = readFileSync(join(root, 'tools/mp-p2p-peer/peer.ts'), 'utf8');
assert.match(module, /__peer/);
assert.doesNotMatch(module, /from '\.\.\/\.\.\/src\/main\.ts'/, 'the harness never imports the game boot');

// ---- a finished build carries nothing of it (only when a dist exists in this checkout)
const dist = join(root, 'dist');
if (existsSync(dist)) {
  const offenders = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) { walk(path); continue; }
      if (name.includes('mp-p2p-peer')) offenders.push(path);
      else if (/\.(?:js|html|json)$/.test(name) && readFileSync(path, 'utf8').includes('mp-p2p-peer')) offenders.push(path);
    }
  };
  walk(dist);
  assert.deepEqual(offenders, [], 'dist/ mentions the harness nowhere');
  console.log(`mp-p2p-peer.selftest: dist/ scanned, nothing of the harness in it`);
}

// ---- the dev server serves the page and transforms its module
const freePort = () => new Promise((resolvePort, reject) => {
  const probe = net.createServer();
  probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => { const { port } = probe.address(); probe.close(() => resolvePort(port)); });
});
const cacheDir = mkdtempSync(join(tmpdir(), 'cot-mp-p2p-peer-selftest-'));
const port = await freePort();
const server = await createServer({
  ...config, configFile: false, root, cacheDir, logLevel: 'error',
  server: { ...config.server, host: '127.0.0.1', port, strictPort: true, hmr: false, warmup: { clientFiles: [] } },
  optimizeDeps: { ...config.optimizeDeps, noDiscovery: true, include: [] },
});
try {
  await server.listen();
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  for (const path of ['/mp-p2p-peer/', '/mp-p2p-peer']) {
    const response = await fetch(`${origin}${path}`, { headers: { accept: 'text/html' } });
    assert.equal(response.status, 200, `${path} is served`);
    assert.match(response.headers.get('content-type') ?? '', /text\/html/);
    const html = await response.text();
    assert.match(html, /\/tools\/mp-p2p-peer\/peer\.ts/, `${path} carries the harness module`);
  }
  const missing = await fetch(`${origin}/mp-p2p-nothing/`, { headers: { accept: 'text/html' } });
  assert.equal(missing.status, 404, 'an unknown document still answers 404');
  const transformed = await server.transformRequest('/tools/mp-p2p-peer/peer.ts');
  assert.ok(transformed && typeof transformed.code === 'string' && transformed.code.includes('__peer'), 'the harness module transforms');
  assert.doesNotMatch(transformed.code, /from ['"]\.\.?\//, 'relative imports are rewritten to root-absolute dev URLs');
  assert.match(transformed.code, /from ['"]\/src\/mp\/session\/headlessSession\.ts['"]/, 'the session composition is reached as a dev module');
} finally {
  await server.close();
  rmSync(cacheDir, { recursive: true, force: true });
}
console.log('mp-p2p-peer.selftest: the harness is serve-only, outside the build inputs, served at /mp-p2p-peer/ and its module transforms');
