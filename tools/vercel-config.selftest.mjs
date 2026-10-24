import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
/**
 * vercel-config.selftest — the deployment configuration's invariants.
 *
 * 2026-09-25 (owner report "A game file failed to download (tankThumbs-….js)"): a `headers` rule in
 * vercel.json applies to every response on its path, a 404 included, and the edge caches that 404 for
 * the rule's max-age. An `immutable` rule on `/assets/(.*)` therefore turned one transient miss during
 * a deploy into a permanent failure for every player on that edge node. Hashed assets keep Vercel's
 * default must-revalidate caching; mid-session deploys are covered by skew protection + the pin.
 */
const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
for (const rule of config.headers || []) {
  const value = (rule.headers || []).map((h) => `${h.key}: ${h.value}`).join(' | ');
  assert.ok(!/^\/assets/.test(rule.source),
    `vercel.json must not carry a headers rule for /assets (${rule.source}: ${value}) — the edge caches 404s under it`);
  assert.ok(!/immutable|max-age=\d{5,}/.test(value),
    `long-lived Cache-Control on ${rule.source} would cache error responses at the edge (${value})`);
}
// 2026-10-01 (INFRA-P1): a per-branch map left every other branch building — 13 paid `mp/*` preview builds in two
// days. The boolean turns git deployments off for every branch; production ships only through the prebuilt CLI deploy.
assert.equal(config.git?.deploymentEnabled, false,
  'git auto-deploys stay off for every branch, not a per-branch map (docs/DEPLOYS.md)');
// INFRA-P17: one function glob carries the 10 s ceiling for every routable API file. Vercel builds every
// `api/*.ts` except `_`-prefixed paths (api/_lib/* is shared code, never a function), and a `functions` key
// that matches no function fails the build — so the glob is checked against the files that exist.
assert.deepEqual(Object.keys(config.functions || {}), ['api/*.ts'], 'one glob configures every API function');
assert.equal(config.functions['api/*.ts'].maxDuration, 10, 'API functions keep the 10 s ceiling');
const apiFunctions = readdirSync(new URL('../api/', import.meta.url), { withFileTypes: true })
  .filter((entry) => entry.isFile() && entry.name.endsWith('.ts') && !entry.name.startsWith('_'));
assert.ok(apiFunctions.length > 0, 'the api/*.ts glob matches at least one function');
// The Node line Vercel builds and runs with (the project setting is 24.x) is pinned in the repository too.
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
assert.equal(manifest.engines?.node, '24.x', 'package.json engines.node names the deployed Node line');
assert.match(readFileSync(new URL('../.nvmrc', import.meta.url), 'utf8').trim(), /^24(?:\.\d+){0,2}$/,
  '.nvmrc selects the same Node major as engines.node');
// Security audit 2026-10-22 (NV-13): `vercel pull` writes the dashboard's Build & Development settings into the release
// worktree, and `vercel build` then runs that install and build command on the operator's machine with the production
// environment loaded. The repository pins them, with the values the dashboard's Vite preset resolved to on 2026-10-23
// (framework vite, every command at its default): the CLI's own npm install, the package's build script, Vite's dist.
// A dashboard edit can no longer change what a release runs; changing it is a reviewed commit here.
assert.equal(config.framework, 'vite', 'framework pinned');
assert.equal(config.installCommand, 'npm install --no-audit', 'install pinned to the CLI default for npm (build-utils runNpmInstall)');
assert.equal(config.buildCommand, 'npm run build', 'build pinned to the package build script (static-build runs it when unset)');
assert.equal(config.outputDirectory, 'dist', 'output pinned to the Vite preset default');
assert.ok(manifest.scripts?.build, 'the pinned build command names an existing script');
console.log(`vercel-config.selftest: no immutable asset rule, git auto-deploys off for every branch, one api/*.ts function glob (${apiFunctions.length} functions), Node 24.x pinned, build settings pinned`);
