import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { join, resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

// Executes the actual CLI lifecycle with fake owned ports; no browser, Vite,
// filesystem mutation, queue ticket, signal to another process, or GPU work.
const source = readFileSync(new URL('./shot-schematic-parity-probe.mjs', import.meta.url), 'utf8');
const body = source.replace(/^import .*;\n/gm, '');
const flush = async () => { for (let i = 0; i < 60; i++) await Promise.resolve(); };
function fixture({ queued = false, hungFixture = false, hungClose = false,
  status = 200, marker = 'shot-schematic-native-pixel-parity-v1', responses = [], consoleError = null } = {}) {
  const calls = [], timers = new Map(), reports = [], listeners = new Map();
  let serial = 0, admit, held = false;
  const process = new EventEmitter();
  process.argv = ['node', 'probe', '--out=/fixture/new'];
  process.exit = code => calls.push(['exit', code]);
  const child = new EventEmitter();
  Object.assign(child, { pid: 123, exitCode: null, signalCode: null,
    kill(signal) { calls.push(['kill', signal]); child.signalCode = signal; child.emit('exit'); } });
  const page = {
    setDefaultTimeout() {}, on(name, callback) { listeners.set(name, callback); },
    async goto() {
      for (const response of responses) listeners.get('response')?.({ status: () => response.status, url: () => response.url });
      if (consoleError) listeners.get('console')?.({ type: () => 'error', text: () => consoleError });
      return { status: () => status, headers: () => ({ 'x-cot-probe': marker }) };
    },
    async waitForFunction() { calls.push(['waitForFunction']); },
    async evaluate(fn) {
      if (!fn.toString().includes('runSchematicParity')) return 'ANGLE (Native GPU)';
      calls.push(['fixture']);
      if (hungFixture) return new Promise(() => {});
      return { pass: true, rows: [{ pass: true }] };
    },
  };
  const browser = { process: () => child, version: async () => 'fixture', newPage: async () => page,
    async close() {
      calls.push(['browser.close']);
      if (hungClose) return new Promise(() => {});
      child.exitCode = 0; child.emit('exit');
    } };
  const ports = {
    process, console: { log() {} }, createHash, resolve, join, tmpdir: () => '/fixture/tmp',
    mkdir: async path => calls.push(['mkdir', path]),
    mkdtemp: async prefix => { calls.push(['mkdtemp', prefix]); return prefix + 'owned'; },
    readFile: async () => 'frozen-source',
    writeFile: async (_path, bytes) => { reports.push(JSON.parse(bytes)); },
    rm: async (path, options) => calls.push(['rm', path, options]),
    createCaptureLock: () => ({
      acquire: () => new Promise(resolveAcquire => {
        admit = () => { held = true; resolveAcquire(); };
        if (!queued) admit();
      }),
      refresh() {}, release() { if (held) { held = false; calls.push(['release']); } },
    }),
    createServer: async options => {
      calls.push(['server', options]);
      return { listen: async () => {}, httpServer: { closeAllConnections() {} },
        close: async () => { calls.push(['server.close']); } };
    },
    puppeteer: { launch: async options => { calls.push(['launch', options]); return browser; } },
    setTimeout(fn, ms) { const id = ++serial; timers.set(id, { fn, ms }); return id; },
    clearTimeout(id) { timers.delete(id); },
    setInterval: () => ({ unref() {} }), clearInterval() {},
  };
  const completed = runInNewContext(`(async () => { ${body}\n })()`, ports);
  return { calls, reports, timers, completed, process, admit: () => admit(),
    expire(ms) {
      const matching = [...timers].filter(([, item]) => item.ms === ms);
      assert.equal(matching.length, 1, `one owned ${ms}ms deadline`);
      timers.delete(matching[0][0]); matching[0][1].fn();
    } };
}
{
  const f = fixture(); await f.completed;
  const report = f.reports[0], server = f.calls.find(([name]) => name === 'server')[1];
  const launch = f.calls.find(([name]) => name === 'launch')[1];
  assert.equal(report.pass, true);
  assert.equal(server.cacheDir, '/fixture/tmp/cot-schematic-vite-owned');
  assert.equal(server.optimizeDeps.noDiscovery, true);
  const plugin = server.plugins[0], headers = {};
  let route, html;
  const response = { setHeader(name, value) { headers[name] = value; }, end(value) { html = value; } };
  assert.equal(plugin.enforce, 'pre', 'fixture route precedes the normal application pretty-route 404 middleware');
  plugin.configureServer({ middlewares: { use(path, handler) { route = path; handler({}, response); } } });
  assert.equal(route, '/__shot-schematic-test__'); assert.equal(response.statusCode, 200);
  assert.equal(headers['X-Cot-Probe'], report.protocol);
  assert.match(html, /src\/ui\/shotSchematicBrowser\.test\.ts/);
  assert.match(html, /<link rel="icon" type="image\/svg\+xml" href="\/brand\/favicon\.svg">/);
  assert.ok(Object.hasOwn(report.source, 'public/brand/favicon.svg'));
  assert.equal(launch.protocolTimeout, 65000); assert.equal(launch.timeout, 30000);
  assert.equal(report.optimizerCache.removed, true);
  assert.equal(f.calls.filter(([name]) => name === 'release').length, 1);
  assert.ok(f.calls.findIndex(([name]) => name === 'browser.close') < f.calls.findIndex(([name]) => name === 'rm'));
  assert.equal(f.timers.size, 0); assert.equal(f.process.listenerCount('SIGINT'), 0);
}
{
  const responses = [{ status: 200, url: 'http://fixture/ok' },
    ...Array.from({ length: 70 }, (_, i) => ({ status: 404, url: `http://fixture/missing-${i}` }))];
  const f = fixture({ responses, consoleError: 'Failed to load resource: 404' }); await f.completed;
  const report = f.reports[0];
  assert.equal(report.failedResponses.length, 64); assert.equal(report.failedResponsesDropped, 6);
  assert.deepEqual(report.failedResponses[0], { status: 404, url: 'http://fixture/missing-0', urlTruncated: false });
  assert.equal(report.pass, false, 'HTTP diagnostics never suppress the original console-error gate');
  assert.deepEqual(report.errors, ['Failed to load resource: 404']);
}
for (const navigation of [{ status: 404 }, { status: 200, marker: null }]) {
  const f = fixture(navigation); await f.completed;
  assert.equal(f.reports[0].pass, false);
  assert.match(f.reports[0].errors.join(' '), /Unexpected schematic fixture response/);
  assert.equal(f.calls.some(([name]) => name === 'waitForFunction' || name === 'fixture'), false,
    'wrong route fails before the 60-second module-ready wait or parity execution');
  assert.equal(f.reports[0].optimizerCache.removed, true);
}
{
  const f = fixture({ queued: true }); await flush();
  f.process.emit('SIGTERM'); await f.completed;
  assert.equal(f.reports[0].pass, false); assert.equal(f.reports[0].capture.acquired, false);
  assert.deepEqual(f.calls.filter(([name]) => ['exit', 'release', 'server', 'launch', 'mkdtemp'].includes(name)), [['exit', 143]]);
  f.admit(); await flush();
  assert.equal(f.calls.filter(([name]) => name === 'release').length, 1, 'late admission releases only its own lease');
  assert.equal(f.calls.some(([name]) => name === 'launch'), false);
}
{
  const f = fixture({ hungFixture: true }); await flush();
  assert.ok(f.calls.some(([name]) => name === 'fixture'));
  f.expire(60000); await f.completed;
  assert.equal(f.reports[0].pass, false);
  assert.match(f.reports[0].errors.join(' '), /Node schematic parity deadline/);
  assert.equal(f.calls.filter(([name]) => name === 'browser.close').length, 1);
  assert.equal(f.reports[0].optimizerCache.removed, true);
}
{
  const f = fixture({ hungClose: true }); await flush();
  f.expire(5000); await f.completed;
  assert.equal(f.reports[0].pass, false, 'forced cleanup cannot produce a clean parity receipt');
  assert.deepEqual(f.calls.filter(([name]) => name === 'kill'), [['kill', 'SIGKILL']]);
  assert.equal(f.calls.filter(([name]) => name === 'release').length, 1);
  assert.equal(f.reports[0].optimizerCache.removed, true);
}
console.log('shot schematic probe: private cache, owned deadlines, queued cancellation and browser cleanup pass');
