// The mid-session re-bundle report (tools/viteOptimizerReload.ts, roster-errors-279): a full reload on the client hot
// channel logs one console.error naming the second copy of three and still goes out; other payloads pass silently; a
// server with no client hot channel is left alone. The dev plugin reports only where hmr is off, the map probe with its
// own label, and vite.config.ts carries the plugin and a worktree's own optimizer cache.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { optimizerReloadReport, reportOptimizerReloads } from './viteOptimizerReload.ts';

function fakeServer(hmr) {
  const sent = [];
  return { sent, config: { server: { hmr } }, environments: { client: { hot: { send: (payload) => sent.push(payload.type) } } } };
}
function logsOf(run) {
  const logged = [], consoleError = console.error;
  console.error = (line) => logged.push(line);
  try { run(); } finally { console.error = consoleError; }
  return logged;
}

{
  const server = fakeServer(false);
  const logged = logsOf(() => {
    assert.equal(reportOptimizerReloads(server, 'map-probe', 'add it to the probe include'), true);
    server.environments.client.hot.send({ type: 'update' });
    server.environments.client.hot.send({ type: 'full-reload', path: '*' });
  });
  assert.deepEqual(server.sent, ['update', 'full-reload'], 'every payload still goes out');
  assert.equal(logged.length, 1, 'a mid-session re-bundle is reported once');
  assert.match(logged[0], /^\[map-probe\] vite re-bundled its dependencies mid-session: .*second copy of three \(add it to the probe include\)$/);
  assert.equal(reportOptimizerReloads({}), false, 'a server without a client hot channel is left alone');
}

{
  const plugin = optimizerReloadReport();
  assert.equal(plugin.apply, 'serve', 'the dev server only; the build has no optimizer');
  for (const [hmr, reported] of [[false, 1], [undefined, 0], [true, 0]]) {
    const server = fakeServer(hmr);
    const logged = logsOf(() => {
      plugin.configureServer(server);
      server.environments.client.hot.send({ type: 'full-reload', path: '*' });
    });
    assert.equal(logged.length, reported, `hmr ${hmr}: ${reported ? 'the page never takes the reload' : 'the page takes the reload'}`);
    assert.deepEqual(server.sent, ['full-reload']);
  }
}

{
  const config = readFileSync(new URL('../vite.config.ts', import.meta.url), 'utf8');
  assert.match(config, /^\s+optimizerReloadReport\(\),$/m, 'vite.config.ts carries the report');
  // vite's optimizer hash includes the root, so worktrees sharing one linked node_modules re-bundled one another's
  // dependencies on every server start (two interrupted deps_temp_* directories on 2026-11-26)
  assert.match(config, /^\s+cacheDir: '\.vite',$/m, "each checkout keeps its own optimizer cache (<root>/.vite)");
  assert.match(readFileSync(new URL('../.gitignore', import.meta.url), 'utf8'), /^\/\.vite\/$/m, 'the cache is never tracked');
}

console.log('viteOptimizerReload.selftest: PASS (re-bundle reported once with hmr off, payloads pass, vite.config carries it and its own cache)');
