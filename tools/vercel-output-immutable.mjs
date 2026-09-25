#!/usr/bin/env node
// Per-file immutable cache routes for the prebuilt Vercel output (2026-09-25).
//
// Vite emits every bundle under /assets/ as `[name]-[hash][ext]`, so those files may be cached
// for a year — but a vercel.json header rule such as `/assets/(.*)` applies to 404s as well, and
// Vercel's edge cached those under deploy 89: one transient miss during a promotion became a
// permanent "A game file failed to download" for every player on that edge. The rule is gone
// (deploy 93, tools/vercel-config.selftest.mjs). This tool runs after `vercel build` and before
// `vercel deploy --prebuilt`: it lists the hashed files that actually exist in the build output
// and writes one immutable header route per group of them into `.vercel/output/config.json`,
// ahead of the filesystem handle. A path that is not in the build never matches an immutable
// route, so a miss keeps Vercel's default must-revalidate answer and heals on the next request.
//
//   node tools/vercel-output-immutable.mjs [--output=.vercel/output] [--group=40]
//   node tools/vercel-output-immutable.mjs --check     # exit 1 unless the config already covers every file
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

export const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';
/** Vite's `[name]-[hash][extname]` (an eight-character base64url hash). */
export const HASHED_ASSET_RE = /-[A-Za-z0-9_-]{8}\.[a-z0-9]+$/;
export const DEFAULT_GROUP = 40;
const ROUTE_PREFIX = '^/assets/(?:';

/** Every hashed file under `<staticDir>/assets`, as posix paths relative to `assets/`, sorted. */
export function listHashedAssets(staticDir) {
  const root = join(staticDir, 'assets');
  if (!existsSync(root)) return [];
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (HASHED_ASSET_RE.test(entry)) out.push(relative(root, full).split('\\').join('/'));
    }
  };
  walk(root);
  return out.sort();
}

export function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** True for a route this tool wrote, or for any other immutable header route on /assets. */
export function isImmutableAssetRoute(route) {
  if (!route || typeof route.src !== 'string' || typeof route.handle === 'string') return false;
  const headers = route.headers || {};
  const cache = String(headers['cache-control'] ?? headers['Cache-Control'] ?? '');
  return route.src.startsWith('^/assets') && /immutable/.test(cache);
}

export function buildImmutableRoutes(files, group = DEFAULT_GROUP) {
  const size = Math.max(1, Math.floor(group));
  const routes = [];
  for (let i = 0; i < files.length; i += size) {
    const names = files.slice(i, i + size).map(escapeRegex);
    routes.push({
      src: `${ROUTE_PREFIX}${names.join('|')})$`,
      caseSensitive: true,
      headers: { 'cache-control': IMMUTABLE_CACHE_CONTROL },
      continue: true,
    });
  }
  return routes;
}

/** The config with every immutable /assets route replaced by fresh per-file routes ahead of the first handle. */
export function applyImmutableRoutes(config, files, group = DEFAULT_GROUP) {
  const routes = (Array.isArray(config.routes) ? config.routes : []).filter((route) => !isImmutableAssetRoute(route));
  const firstHandle = routes.findIndex((route) => route && typeof route.handle === 'string');
  const insertAt = firstHandle === -1 ? routes.length : firstHandle;
  routes.splice(insertAt, 0, ...buildImmutableRoutes(files, group));
  return { ...config, routes };
}

/** Files the config's immutable routes do not cover (empty when every hashed file is immutable). */
export function uncoveredAssets(config, files) {
  const patterns = (config.routes || []).filter(isImmutableAssetRoute).map((route) => new RegExp(route.src));
  return files.filter((file) => !patterns.some((re) => re.test(`/assets/${file}`)));
}

function arg(name, fallback) {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const output = arg('output', '.vercel/output');
  const group = Number(arg('group', String(DEFAULT_GROUP)));
  const configPath = join(output, 'config.json');
  if (!existsSync(configPath)) { console.error(`vercel-output-immutable: no ${configPath} — run \`vercel build\` first`); process.exit(1); }
  const files = listHashedAssets(join(output, 'static'));
  if (files.length === 0) { console.error(`vercel-output-immutable: no hashed files under ${join(output, 'static', 'assets')}`); process.exit(1); }
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  if (process.argv.includes('--check')) {
    const missing = uncoveredAssets(config, files);
    if (missing.length) { console.error(`vercel-output-immutable: ${missing.length} of ${files.length} hashed files have no immutable route (${missing.slice(0, 3).join(', ')})`); process.exit(1); }
    console.log(`vercel-output-immutable: every one of the ${files.length} hashed files is covered`);
    process.exit(0);
  }
  const next = applyImmutableRoutes(config, files, group);
  writeFileSync(configPath, `${JSON.stringify(next, null, 2)}\n`);
  const written = next.routes.filter(isImmutableAssetRoute).length;
  console.log(`vercel-output-immutable: ${files.length} hashed files under /assets → ${written} immutable routes (groups of ${Math.max(1, Math.floor(group))}) ahead of the filesystem handle; misses keep Vercel's default`);
}
