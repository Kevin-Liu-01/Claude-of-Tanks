// Fleet browser tools' servers and first page loads (2026-10-16, test-speed PLAN R4c; tools/tool-page-load.mjs).
// Pins: (1) the defaults are a 180 s navigation, a 60 s ready wait and one retry, each overridable, and 0 disables
// the retry; (2) loadReadyPage retries only a timeout, once, and rethrows anything else at once; (3) with strictPort
// false a busy port moves Vite to the next free one, boundOrigin reads the 127.0.0.1 address really bound, and the page
// reaches our server, not the one on the requested port; (4) the release and regen browser tools use these helpers,
// with no strict port and no `localhost` URL left.
import assert from 'node:assert/strict';
import { createServer as createNetServer } from 'node:net';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'vite';
import { boundOrigin, isTimeoutError, loadReadyPage, NAV_RETRIES, NAV_TIMEOUT_MS, pageLoadBudget, READY_TIMEOUT_MS,
  toolServerOptions } from './tool-page-load.mjs';

// (1) budgets
assert.deepEqual([NAV_TIMEOUT_MS, READY_TIMEOUT_MS, NAV_RETRIES], [180_000, 60_000, 1]);
assert.deepEqual(pageLoadBudget({ env: {} }), { navTimeoutMs: 180_000, readyTimeoutMs: 60_000, retries: 1 });
assert.deepEqual(pageLoadBudget({ env: {}, readyTimeoutMs: 120_000 }), { navTimeoutMs: 180_000, readyTimeoutMs: 120_000, retries: 1 });
assert.deepEqual(pageLoadBudget({ env: { COT_NAV_TIMEOUT_MS: '240000', COT_READY_TIMEOUT_MS: '90000', COT_NAV_RETRIES: '3' } }),
  { navTimeoutMs: 240_000, readyTimeoutMs: 90_000, retries: 3 });
assert.equal(pageLoadBudget({ env: { COT_NAV_RETRIES: '0' } }).retries, 0, 'COT_NAV_RETRIES=0 disables the retry');
assert.equal(pageLoadBudget({ env: { COT_NAV_RETRIES: 'x' } }).retries, 1);
assert.equal(pageLoadBudget({ env: { COT_NAV_TIMEOUT_MS: '0' } }).navTimeoutMs, 180_000, 'a non-positive timeout keeps the default');

// (2) retry policy, against a scripted page
const timeout = () => Object.assign(new Error('Navigation timeout of 180000 ms exceeded'), { name: 'TimeoutError' });
function scriptedPage(outcomes) {
  const calls = [];
  return {
    calls,
    async goto(url, options) { calls.push(['goto', url, options]); const next = outcomes.shift(); if (next?.goto) throw next.goto; },
    async waitForFunction(expression, options) { calls.push(['wait', expression, options]); const next = outcomes.shift(); if (next?.wait) throw next.wait; },
  };
}
const quiet = [];
const warn = (line) => quiet.push(line);
{
  const page = scriptedPage([{ goto: timeout() }, {}, {}]);
  assert.equal(await loadReadyPage(page, 'http://127.0.0.1:1/p', { label: 't', ready: 'R', warn }), 2, 'a timed-out navigation is retried once');
  assert.deepEqual(page.calls.map(([kind]) => kind), ['goto', 'goto', 'wait']);
  assert.deepEqual(page.calls[0][2], { waitUntil: 'domcontentloaded', timeout: 180_000 });
  assert.deepEqual(page.calls[2].slice(1), ['R', { timeout: 60_000 }]);
  assert.match(quiet.at(-1), /^\[t\] page load timed out \(attempt 1 of 2\); retrying$/);
}
{
  const page = scriptedPage([{}, { wait: timeout() }, {}, {}]);
  assert.equal(await loadReadyPage(page, 'u', { ready: 'R', warn }), 2, 'a timed-out ready wait is retried once');
}
{
  const page = scriptedPage([{ goto: timeout() }, { goto: timeout() }]);
  await assert.rejects(loadReadyPage(page, 'u', { ready: 'R', warn }), /Navigation timeout/, 'two timeouts fail');
  assert.equal(page.calls.length, 2, 'only one retry');
}
{
  const page = scriptedPage([{ goto: new Error('net::ERR_CONNECTION_REFUSED') }]);
  await assert.rejects(loadReadyPage(page, 'u', { ready: 'R', warn }), /ERR_CONNECTION_REFUSED/);
  assert.equal(page.calls.length, 1, 'a failure that is not a timeout is never retried');
}
{
  const page = scriptedPage([{ goto: timeout() }]);
  await assert.rejects(loadReadyPage(page, 'u', { ready: 'R', warn, budget: pageLoadBudget({ env: { COT_NAV_RETRIES: '0' } }) }), /timeout/);
  assert.equal(page.calls.length, 1, 'retries 0 makes one attempt');
}
await assert.rejects(loadReadyPage(scriptedPage([]), 'u', {}), /ready expression/);
assert.ok(isTimeoutError(timeout()) && isTimeoutError(new Error('Waiting failed: 60000ms timeout exceeded')));
assert.ok(!isTimeoutError(new Error('Evaluation failed')));

// (3) a busy port: Vite moves on, the origin is the bound port, the page reaches our server
const options = toolServerOptions(41000, { span: 900 });
assert.deepEqual({ ...options, port: 0 }, { host: '127.0.0.1', port: 0, strictPort: false, hmr: false, watch: null });
assert.ok(options.port >= 41000 && options.port < 41900);
const sockets = new Set();
const squatter = createNetServer((socket) => {
  sockets.add(socket);
  socket.end('HTTP/1.1 200 OK\r\ncontent-length: 8\r\nconnection: close\r\n\r\nsquatter');
});
await new Promise((resolve, reject) => { squatter.once('error', reject); squatter.listen(options.port, '127.0.0.1', resolve); });
const root = mkdtempSync(join(tmpdir(), 'tool-page-load-'));
writeFileSync(join(root, 'index.html'), '<!doctype html><title>ours</title>');
const server = await createServer({ root, configFile: false, logLevel: 'silent', cacheDir: join(root, '.vite'),
  optimizeDeps: { noDiscovery: true }, server: options });
try {
  await server.listen();
  const origin = boundOrigin(server);
  const bound = Number(new URL(origin).port);
  assert.equal(new URL(origin).hostname, '127.0.0.1');
  assert.notEqual(bound, options.port, 'strictPort false moved past the busy port instead of failing');
  assert.match(await (await fetch(`${origin}/index.html`)).text(), /<title>ours<\/title>/, 'the bound origin reaches our server');
  assert.equal(await (await fetch(`http://127.0.0.1:${options.port}/index.html`)).text(), 'squatter', 'the requested port is someone else');
} finally {
  await server.close();
  for (const socket of sockets) socket.destroy();
  await new Promise((resolve) => squatter.close(resolve));
  rmSync(root, { recursive: true, force: true });
}
assert.throws(() => boundOrigin({ httpServer: { address: () => null } }), /did not expose a TCP port/);
assert.equal(boundOrigin({ httpServer: { address: () => ({ address: '::1', family: 'IPv6', port: 9 }) } }), 'http://[::1]:9');

// the overrides are read by name (process.env is never passed whole), so receipts that import the helper stay cacheable
assert.match(readFileSync('tools/tool-page-load.mjs', 'utf8'), /const \{ COT_NAV_TIMEOUT_MS, COT_READY_TIMEOUT_MS, COT_NAV_RETRIES \} = process\.env;/);
{
  const { collectSelftestInputs } = await import('./selftest-inputs.mjs');
  for (const file of ['tools/tool-page-load.mjs', 'tools/id-list.mjs', 'tools/module-visual-align-probe.mjs', 'tools/geometry-gate.mjs']) {
    assert.equal(collectSelftestInputs(readFileSync(file, 'utf8'), file).opaqueEnvironment, false, `${file}: no whole-environment read`);
  }
}

// (4) wiring in the release and regen browser tools
const ICONS_LOADERS = ['genIcons', 'tank-assets-check', 'presentation-centering', 'muzzle-bore-probe'];
const SERVED = [...ICONS_LOADERS, 'track-duplicate-audit', 'module-visual-align-probe', 'geometry-gate', 'tank-standard-check',
  'procedural-fidelity'];
for (const tool of SERVED) {
  const source = readFileSync(`tools/${tool}.mjs`, 'utf8');
  assert.match(source, /import \{[^}]*\bboundOrigin\b[^}]*\btoolServerOptions\b[^}]*\} from '\.\/tool-page-load\.mjs';/, `${tool}: imports the helpers`);
  assert.match(source, /server: toolServerOptions\(\d+/, `${tool}: its Vite server comes from toolServerOptions`);
  assert.match(source, /boundOrigin\(server\)/, `${tool}: its URLs use the bound origin`);
  assert.doesNotMatch(source, /strictPort:\s*true/, `${tool}: no strict port`);
  assert.doesNotMatch(source, /localhost:\$\{|server\.config\.server\.port/, `${tool}: no \`localhost\` URL`);
}
for (const tool of [...ICONS_LOADERS, 'module-visual-align-probe', 'geometry-gate', 'procedural-fidelity']) {
  const source = readFileSync(`tools/${tool}.mjs`, 'utf8');
  assert.match(source, /loadReadyPage\(page, /, `${tool}: its first page load retries a timeout`);
  assert.doesNotMatch(source, /Number\(process\.env\.COT_NAV_(TIMEOUT_MS|RETRIES)\)/, `${tool}: no private navigation budget`);
}
console.log(`tool-page-load: 180 s navigation, 60 s ready, one timeout retry; a busy port moves on and the bound origin reaches our server; ${SERVED.length} fleet browser tools wired`);
