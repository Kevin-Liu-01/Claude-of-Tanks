#!/usr/bin/env node
// Per-file cache routes for the prebuilt Vercel output (2026-09-25; collision manifests and runtime files 2026-10-01).
//
// Vite emits every bundle under /assets/ as `[name]-[hash][ext]`, so those files may be cached
// for a year — but a vercel.json header rule such as `/assets/(.*)` applies to 404s as well, and
// Vercel's edge cached those under deploy 89: one transient miss during a promotion became a
// permanent "A game file failed to download" for every player on that edge. The rule is gone
// (deploy 93, tools/vercel-config.selftest.mjs). This tool runs after `vercel build` and before
// `vercel deploy --prebuilt`: it lists the files that actually exist in the build output and writes
// one header route per group of them into `.vercel/output/config.json`, ahead of the filesystem
// handle. A path that is not in the build never matches a route, so a miss keeps Vercel's default
// must-revalidate answer and heals on the next request.
//
// Three families (INFRA-P10 / FE-P17, 2026-10-01 — 158,928 revalidations a week were 28 % of production requests):
//   - /assets/<name>-<hash>.<ext> (Vite)                       → immutable for a year;
//   - /mp-collision/<map>.<sha256[0..12]>.json (content-addressed collision manifests; the index stays default)
//                                                              → immutable for a year;
//   - images, audio and fonts under textures/, icons/, fonts/, audio/, maps/, minimaps/ (same URL across deploys)
//                                                              → max-age=3600, stale-while-revalidate=86400.
//
//   node tools/vercel-output-immutable.mjs [--output=.vercel/output] [--group=40]
//   node tools/vercel-output-immutable.mjs --check     # exit 1 unless the config already covers every file
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

export const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';
/** Not content-hashed, so a deploy may change a file under the same URL: an hour fresh, a day served stale while revalidating. */
export const RUNTIME_CACHE_CONTROL = 'public, max-age=3600, stale-while-revalidate=86400';
/** Vite's `[name]-[hash][extname]` (an eight-character base64url hash). */
export const HASHED_ASSET_RE = /-[A-Za-z0-9_-]{8}\.[a-z0-9]+$/;
/**
 * The collision manifests vite.config.ts emits as `<map>.<sha256[0..12]>.json` (a mode's battlefield variant as
 * `<map>@<variant>.<sha256[0..12]>.json`, 2026-10-08); `index.json` names them and is not hashed.
 */
const COLLISION_MANIFEST_RE = /^[a-z0-9_-]+(?:@[a-z0-9-]+)?\.[0-9a-f]{12}\.json$/;
/** Public directories the game loads at runtime; only their images, audio and fonts take the moderate TTL. */
const RUNTIME_DIRS = Object.freeze(['textures', 'icons', 'fonts', 'audio', 'maps', 'minimaps']);
const RUNTIME_FILE_RE = /\.(?:png|webp|jpe?g|avif|gif|svg|ktx2|ogg|mp3|wav|m4a|opus|woff2?|ttf|otf)$/i;
export const DEFAULT_GROUP = 40;
/** Keep each route's `src` well under the 4,096-character source limit Vercel documents for routing rules. */
const MAX_SOURCE_LENGTH = 3000;
const MANAGED_PREFIXES = ['assets', 'mp-collision', ...RUNTIME_DIRS];

function walk(root, accept) {
  if (!existsSync(root)) return [];
  const out = [];
  const visit = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) visit(full);
      else if (accept(entry)) out.push(relative(root, full).split('\\').join('/'));
    }
  };
  visit(root);
  return out.sort();
}

/** Every hashed file under `<staticDir>/assets`, as posix paths relative to `assets/`, sorted. */
export function listHashedAssets(staticDir) {
  return walk(join(staticDir, 'assets'), (name) => HASHED_ASSET_RE.test(name));
}

/** The content-addressed collision manifests under `<staticDir>/mp-collision` (never `index.json`). */
export function listCollisionManifests(staticDir) {
  return walk(join(staticDir, 'mp-collision'), (name) => COLLISION_MANIFEST_RE.test(name)).filter((path) => !path.includes('/'));
}

/** `{ dir: [paths relative to dir] }` for the runtime images, audio and fonts that exist. */
export function listRuntimeFiles(staticDir) {
  return Object.fromEntries(RUNTIME_DIRS.map((dir) => [dir, walk(join(staticDir, dir), (name) => RUNTIME_FILE_RE.test(name))]));
}

/** The families the tool writes for an output directory: a URL prefix, its files and their Cache-Control. */
export function cacheRoutePlan(staticDir) {
  const runtime = listRuntimeFiles(staticDir);
  return [
    { prefix: 'assets', files: listHashedAssets(staticDir), cacheControl: IMMUTABLE_CACHE_CONTROL },
    { prefix: 'mp-collision', files: listCollisionManifests(staticDir), cacheControl: IMMUTABLE_CACHE_CONTROL },
    ...RUNTIME_DIRS.map((dir) => ({ prefix: dir, files: runtime[dir], cacheControl: RUNTIME_CACHE_CONTROL })),
  ];
}

export function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function routeCacheControl(route) {
  const headers = route.headers || {};
  return String(headers['cache-control'] ?? headers['Cache-Control'] ?? '');
}

/** True for a route this tool wrote, or for any other immutable header route on /assets. */
export function isImmutableAssetRoute(route) {
  if (!route || typeof route.src !== 'string' || typeof route.handle === 'string') return false;
  return route.src.startsWith('^/assets') && /immutable/.test(routeCacheControl(route));
}

/** True for any route this tool manages: an immutable /assets rule, or a family route it writes. */
export function isManagedCacheRoute(route) {
  if (isImmutableAssetRoute(route)) return true;
  if (!route || typeof route.src !== 'string' || typeof route.handle === 'string') return false;
  const cache = routeCacheControl(route);
  return (cache === IMMUTABLE_CACHE_CONTROL || cache === RUNTIME_CACHE_CONTROL)
    && MANAGED_PREFIXES.some((prefix) => route.src.startsWith(`^/${escapeRegex(prefix)}/(?:`));
}

/** One route per group of files under `/<prefix>/`: at most `group` names and MAX_SOURCE_LENGTH characters each. */
export function buildCacheRoutes(prefix, files, cacheControl, group = DEFAULT_GROUP) {
  const size = Math.max(1, Math.floor(group));
  const head = `^/${escapeRegex(prefix)}/(?:`;
  const routes = [];
  let names = [];
  let length = head.length + 2;
  const flush = () => {
    if (names.length === 0) return;
    routes.push({ src: `${head}${names.join('|')})$`, caseSensitive: true, headers: { 'cache-control': cacheControl }, continue: true });
    names = [];
    length = head.length + 2;
  };
  for (const file of files) {
    const name = escapeRegex(file);
    if (names.length >= size || (names.length > 0 && length + name.length + 1 > MAX_SOURCE_LENGTH)) flush();
    names.push(name);
    length += name.length + 1;
  }
  flush();
  return routes;
}

export function buildImmutableRoutes(files, group = DEFAULT_GROUP) {
  return buildCacheRoutes('assets', files, IMMUTABLE_CACHE_CONTROL, group);
}

/** The config with every managed route replaced by fresh per-file routes for `plan`, ahead of the first handle. */
export function applyCacheRoutes(config, plan, group = DEFAULT_GROUP) {
  const routes = (Array.isArray(config.routes) ? config.routes : []).filter((route) => !isManagedCacheRoute(route));
  const firstHandle = routes.findIndex((route) => route && typeof route.handle === 'string');
  const insertAt = firstHandle === -1 ? routes.length : firstHandle;
  routes.splice(insertAt, 0, ...plan.flatMap(({ prefix, files, cacheControl }) => buildCacheRoutes(prefix, files, cacheControl, group)));
  return { ...config, routes };
}

/** The hashed /assets family alone (the 2026-09-25 shape). */
export function applyImmutableRoutes(config, files, group = DEFAULT_GROUP) {
  return applyCacheRoutes(config, [{ prefix: 'assets', files, cacheControl: IMMUTABLE_CACHE_CONTROL }], group);
}

/** `/<prefix>/<file>` paths of `plan` that no route of the config answers with the family's Cache-Control. */
export function uncoveredFiles(config, plan) {
  const routes = (config.routes || []).filter(isManagedCacheRoute).map((route) => ({ re: new RegExp(route.src), cache: routeCacheControl(route) }));
  const missing = [];
  for (const { prefix, files, cacheControl } of plan) {
    for (const file of files) {
      const path = `/${prefix}/${file}`;
      const hits = routes.filter(({ re }) => re.test(path));
      if (hits.length !== 1 || !(hits[0].cache === cacheControl || (prefix === 'assets' && /immutable/.test(hits[0].cache)))) missing.push(path);
    }
  }
  return missing;
}

/** Files under /assets the config's immutable routes do not cover (empty when every hashed file is immutable). */
export function uncoveredAssets(config, files) {
  const patterns = (config.routes || []).filter(isImmutableAssetRoute).map((route) => new RegExp(route.src));
  return files.filter((file) => !patterns.some((re) => re.test(`/assets/${file}`)));
}

function arg(name, fallback) {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

function summary(plan, config) {
  const routeCount = (prefix) => (config.routes || []).filter((route) => isManagedCacheRoute(route)
    && (prefix === 'assets' ? route.src.startsWith('^/assets') : route.src.startsWith(`^/${escapeRegex(prefix)}/(?:`))).length;
  const family = (prefix) => plan.find((entry) => entry.prefix === prefix);
  const runtimeFiles = RUNTIME_DIRS.reduce((sum, dir) => sum + family(dir).files.length, 0);
  const runtimeRoutes = RUNTIME_DIRS.reduce((sum, dir) => sum + routeCount(dir), 0);
  return `${family('assets').files.length} hashed files under /assets → ${routeCount('assets')} immutable routes; `
    + `${family('mp-collision').files.length} collision manifests → ${routeCount('mp-collision')} immutable routes; `
    + `${runtimeFiles} runtime files in ${RUNTIME_DIRS.join(', ')} → ${runtimeRoutes} routes (${RUNTIME_CACHE_CONTROL})`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const output = arg('output', '.vercel/output');
  const group = Number(arg('group', String(DEFAULT_GROUP)));
  const configPath = join(output, 'config.json');
  if (!existsSync(configPath)) { console.error(`vercel-output-immutable: no ${configPath} — run \`vercel build\` first`); process.exit(1); }
  const plan = cacheRoutePlan(join(output, 'static'));
  if (plan[0].files.length === 0) { console.error(`vercel-output-immutable: no hashed files under ${join(output, 'static', 'assets')}`); process.exit(1); }
  const config = JSON.parse(readFileSync(configPath, 'utf8'));
  if (process.argv.includes('--check')) {
    const missing = uncoveredFiles(config, plan);
    const total = plan.reduce((sum, { files }) => sum + files.length, 0);
    if (missing.length) { console.error(`vercel-output-immutable: ${missing.length} of ${total} files have no cache route of their family (${missing.slice(0, 3).join(', ')})`); process.exit(1); }
    console.log(`vercel-output-immutable: every one of the ${total} files is covered — ${summary(plan, config)}`);
    process.exit(0);
  }
  const next = applyCacheRoutes(config, plan, group);
  writeFileSync(configPath, `${JSON.stringify(next, null, 2)}\n`);
  console.log(`vercel-output-immutable: ${summary(plan, next)}, groups of ${Math.max(1, Math.floor(group))} ahead of the filesystem handle; misses keep Vercel's default`);
}
