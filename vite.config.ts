// vite.config.ts — LOADING PERF (boot r9).
//
// The dev-server module graph was the single biggest boot item (~1.0 s of the
// ~3.5 s headless boot): ~76 ES modules discovered one import-depth level at a
// time (fetch → parse → discover → fetch ...), each paying its transform on
// first request. Production builds bundle all of this away, so the fix is
// dev-only and lives here rather than in app code:
//
//  - server.warmup pre-transforms the src modules at server start, so the
//    browser's requests hit a warm cache instead of serializing esbuild work;
//  - a dev-only transformIndexHtml hook injects <link rel="modulepreload">
//    for main.ts's reachable STATIC import graph (relative paths only),
//    flattening the depth-first discovery waterfall into one parallel fetch
//    wave. Dynamic imports are deliberately excluded: preloading them would
//    defeat the source-geometry/model-loader lazy boundaries and recreate the
//    production boot problem in development.
//  - optimizeDeps.include pins the three.js prebundle so the first page hit
//    never triggers a mid-boot re-optimize (probe servers inherit this too).
//
// Build output is unaffected: the plugin only applies to `vite dev`/`serve`,
// and every headless tool that calls createServer() inherits this config.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, renameSync } from 'node:fs';
import type { ServerResponse } from 'node:http';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Connect } from 'vite';
import { renderProductStats } from './src/productStats.ts';
import { localizeHtmlDocument } from './src/presentation/localizedHtml.ts';
import { publicRouteForEntry, resolveLocalePath } from './src/ui/localeRouting.ts';
import { replaceAppVersionTokens, resolveAppVersion } from './tools/appVersion.ts';
import { assertPublicBuildEnv } from './tools/publicBuildEnv.ts';
import { isExistingProjectDocument } from './tools/existing-document-route.ts';
import { sharedWorkerChunks } from './tools/viteSharedWorkers.ts';
import { glslMinify } from './tools/viteGlslMinify.ts';
import { BOOT_RUNTIME_MODULES, i18nPageCatalogs, VITE_PRELOAD_HELPER } from './tools/viteI18nPageCatalogs.ts';
import { i18nStudioCatalog } from './tools/viteI18nStudioCatalog.ts';

const appVersion = resolveAppVersion(dirname(fileURLToPath(import.meta.url)));

/** The telemetry sink origin for the inline watchdog: an http(s) origin without a trailing slash, else empty (the Vercel fallback). */
function telemetrySinkOrigin(value: string | undefined): string {
  const url = String(value ?? '').trim().replace(/\/+$/, '');
  return /^https?:\/\//.test(url) ? url : '';
}

/**
 * Transitive relative-import closure starting at src/main.ts.
 * Cheap regex scan (static `import ... from '...'`, bare `import '...'`, and
 * `export ... from '...'`); only ./ and ../
 * specifiers are followed — package imports live in the prebundle.
 * @param {string} root project root
 * @returns {string[]} root-absolute URL paths, entry first
 */
function reachableSrcModules(root: string): string[] {
  const entry = resolve(root, 'src/main.ts');
  const seen = new Set<string>();
  const queue: string[] = [entry];
  const specRe = /(?:import|export)\s+(?:[^'"]*?\sfrom\s*)?['"]([^'"]+)['"]/g;
  while (queue.length) {
    const file = queue.pop();
    if (!file) continue;
    if (seen.has(file)) continue;
    let text;
    try { text = readFileSync(file, 'utf8'); } catch (_) { continue; }
    seen.add(file);
    if (file.endsWith('.json')) continue;
    for (const m of text.matchAll(specRe)) {
      const spec = m[1];
      if (!spec || !spec.startsWith('.')) continue;
      queue.push(resolve(dirname(file), spec));
    }
  }
  return [...seen].map((f) => '/' + relative(root, f).replace(/\\/g, '/'));
}

/**
 * Pretty routes (owner: "/studio", "/gallery", and "/home"). Pure URL rewrites — the
 * browser's address bar keeps the pretty path while the server serves the
 * real file. /studio boots the game (index.html; src/game/studio.ts sees the
 * pathname and auto-enters), /home serves the showcase page (home.html — a
 * real build entry, so /home also ships in dist; vercel.json carries the
 * same two rewrites for the deployed host). Queries pass through
 * (/studio?map=desert works).
 */
const rewriteRoutes = (documentRoot: string): Connect.NextHandleFunction => (req, res, next) => {
  const url = req.url || '';
  const qi = url.indexOf('?');
  const path = qi === -1 ? url : url.slice(0, qi);
  const query = qi === -1 ? '' : url.slice(qi);
  const localePath = resolveLocalePath(path);
  const localizedQuery = localePath.locale ? `${query}${query ? '&' : '?'}_cot_locale=${localePath.locale}` : query;
  if (localePath.pathname === '/surface-studio') {
    const params = new URLSearchParams(query.startsWith('?') ? query.slice(1) : query);
    if (!params.has('layer')) params.set('layer', 'markup');
    res.statusCode = 308;
    res.setHeader('Location', `${localePath.locale ? '/cn' : ''}/gallery?${params.toString()}`);
    res.end();
    return;
  }
  if (path === '/404.html') {
    forceNotFoundStatus(res);
    req.url = '/404.html' + query;
  } else if (localePath.route) {
    if (localePath.route.id === 'notFound') forceNotFoundStatus(res);
    const entry = localePath.route.sourceHtml;
    const source = existsSync(resolve(documentRoot, entry)) ? entry : `site/${entry}`;
    req.url = `/${source}${localizedQuery}`;
  }
  else if (/^\/(?:home|gallery|docs(?:-[a-z]+)?)\.html$/.test(path)
    && existsSync(resolve(documentRoot, `site${path}`))) {
    req.url = `/site${path}${query}`;
  }
  else if (path !== '/' && !path.startsWith('/api/') &&
    req.headers.accept?.includes('text/html') && !isExistingProjectDocument(path,documentRoot)) {
    forceNotFoundStatus(res);
    req.url = '/404.html' + query;
  }
  next();
};

/**
 * The peer-to-peer host's collision manifests (Multiplayer v2 §13, P2 client lane 2026-09-28): the browser host builds
 * its world from the same `server/world-collision-manifests/<map>.json` the match container loads, served under
 * `/mp-collision/` — the index as `index.json` and every map as `<map>.<sha256[0..12]>.json` (content-addressed: the
 * host reads the index, then fetches the map's file by its hash; `src/mp/host/worldCollision.ts`), and a mode's
 * battlefield variant as `<map>@<variant>.<sha256[0..12]>.json` (Frontline's trenches, 2026-10-08). Dev serves them
 * from the source directory; the build emits them beside the page (never through the boot chunk, never under
 * `/assets/`: the immutable routes stay the bundle's). About 105 MB of JSON, fetched one map at a time and only when
 * hosting.
 */
const COLLISION_MANIFEST_DIR = resolve(dirname(fileURLToPath(import.meta.url)), 'server/world-collision-manifests');
const COLLISION_MANIFEST_ROUTE = '/mp-collision';

function collisionManifestFiles(): Array<{ name: string; path: string }> {
  if (!existsSync(COLLISION_MANIFEST_DIR)) return [];
  const out: Array<{ name: string; path: string }> = [];
  for (const file of readdirSync(COLLISION_MANIFEST_DIR)) {
    if (!file.endsWith('.json')) continue;
    const path = resolve(COLLISION_MANIFEST_DIR, file);
    if (file === 'index.json') { out.push({ name: 'index.json', path }); continue; }
    const hash = createHash('sha256').update(readFileSync(path)).digest('hex').slice(0, 12);
    out.push({ name: `${file.slice(0, -5)}.${hash}.json`, path });
  }
  return out;
}

const collisionManifestPlugin = () => ({
  name: 'cot-mp-collision-manifests',
  configureServer(server: { middlewares: { use(handler: Connect.NextHandleFunction): void } }) {
    let files: Map<string, string> | null = null;
    server.middlewares.use((req, res, next) => {
      const url = req.url || '';
      if (!url.startsWith(`${COLLISION_MANIFEST_ROUTE}/`)) { next(); return; }
      files ??= new Map(collisionManifestFiles().map((entry) => [entry.name, entry.path]));
      const name = url.slice(COLLISION_MANIFEST_ROUTE.length + 1).split('?', 1)[0]!;
      const path = files.get(name);
      if (!path) { res.statusCode = 404; res.end(); return; }
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.setHeader('cache-control', name === 'index.json' ? 'no-cache' : 'public, max-age=31536000, immutable');
      res.end(readFileSync(path));
    });
  },
  generateBundle(this: { emitFile(file: { type: 'asset'; fileName: string; source: Buffer }): void }) {
    for (const entry of collisionManifestFiles()) {
      this.emitFile({ type: 'asset', fileName: `${COLLISION_MANIFEST_ROUTE.slice(1)}/${entry.name}`, source: readFileSync(entry.path) });
    }
  },
});

/**
 * The peer harness of the peer-to-peer certification (docs/MULTIPLAYER-V2.md §13.8, P3 lane 2026-09-28): one seat of a
 * match with no renderer (`tools/mp-p2p-peer/`), driven by `tools/mp-p2p-soak.mjs` through `window.__peer`. Served
 * only by the dev server (`apply: 'serve'`, no build hook, not a rollup input) at /mp-p2p-peer/ — the page's module is
 * the source file under /tools/, transformed like any other dev module. `tools/mp-p2p-peer.selftest.mjs` proves the
 * build emits nothing for it. Registered before `cot-routes`, whose HTML rewrite would otherwise answer 404.
 */
const PEER_HARNESS_ROUTE = '/mp-p2p-peer';
const PEER_HARNESS_PAGE = resolve(dirname(fileURLToPath(import.meta.url)), 'tools/mp-p2p-peer/index.html');

const peerHarnessPlugin = () => ({
  name: 'cot-mp-p2p-peer-harness',
  apply: 'serve' as const,
  configureServer(server: { middlewares: { use(handler: Connect.NextHandleFunction): void } }) {
    server.middlewares.use((req, res, next) => {
      const path = (req.url || '').split('?', 1)[0];
      if (path !== PEER_HARNESS_ROUTE && path !== `${PEER_HARNESS_ROUTE}/`) { next(); return; }
      res.setHeader('content-type', 'text/html; charset=utf-8');
      res.setHeader('cache-control', 'no-store');
      res.end(readFileSync(PEER_HARNESS_PAGE));
    });
  },
});

/** Keep Vite's static-file layer from replacing an intentional 404 with 200. */
function forceNotFoundStatus(res: ServerResponse): void {
  res.statusCode = 404;
  const writeHead = res.writeHead;
  res.writeHead = ((...args: Parameters<typeof res.writeHead>) => {
    args[0] = 404;
    return writeHead.apply(res, args);
  }) as typeof res.writeHead;
}

export default defineConfig({
  // Workers Vite still bundles on their own (the match host, the material painter, the sky/cloud/schematic/texture
  // workers) keep ES modules so their donor families stay on-demand imports, and their chunks take the same base36
  // hash alphabet so every /assets URL moved together (2026-09-25, docs/DEVELOPMENT.md "Asset caching").
  // The match host's catalog chunks split like the page's (tools/viteI18nStudioCatalog.ts), so both builds emit the same
  // catalog files.
  worker: { format: 'es', plugins: () => [i18nStudioCatalog()], rollupOptions: { output: { hashCharacters: 'base36' } } },
  plugins: [
    // 2026-10-02 (tools/viteSharedWorkers.ts): the wreck bake and Garage workshop workers are entries of the page
    // build and import the page's own chunks (dist/assets 954 files / 34.9 MB -> 682 / 27.7 MB; a worker never
    // downloads again a module the page already holds). The match host stays separate: its spec-only graph would
    // split four boot chunks (+5 game / +4 gallery requests) or drag the builder core into the host. The small
    // workers are single self-contained files.
    ...sharedWorkerChunks({ workers: {
      'src/world/wreckBakeWorker.ts': {},
      'src/game/garageWorkshopGeometryWorker.ts': { privateCopies: ['src/vehicles/profileBuilderAdapter.ts'] },
    } }),
    // 2026-10-02 (tools/viteGlslMinify.ts): comments and line-edge whitespace out of the game's own complete shader
    // programs at build time; lines, directives, in-line text and every library shader stay as written (game boot
    // -31.3 KB raw / -10.4 KB brotli).
    glslMinify(),
    { name: 'cot-public-build-env', apply: 'build', configResolved(config) { assertPublicBuildEnv(config.env); } },
    {
      name: 'cot-app-version',
      enforce: 'pre',
      transformIndexHtml(html) {
        // entry telemetry (docs/ENTRY-RESILIENCE.md): the inline watchdog's
        // beacon follows the same self-hosted switch as src/analytics.ts.
        // The sink origin (VITE_TELEMETRY_URL, the Cloudflare telemetry Worker) reaches the
        // inline watchdog through the meta's data-url; unset means the Vercel fallback.
        return replaceAppVersionTokens(html, appVersion)
          .replaceAll('{{COT_TELEMETRY}}', process.env.VITE_SELF_HOSTED === '1' ? 'off' : 'on')
          .replaceAll('{{COT_TELEMETRY_URL}}', telemetrySinkOrigin(process.env.VITE_TELEMETRY_URL));
      },
    },
    {
      name: 'cot-product-stats',
      transformIndexHtml(html) {
        return renderProductStats(html);
      },
    },
    {
      name: 'cot-locale-documents',
      enforce: 'post',
      transformIndexHtml(html, ctx) {
        const original = ctx?.originalUrl || '';
        const requestUrl = new URL(original || '/', 'http://vite.local');
        const requestedLocale = requestUrl.searchParams.get('_cot_locale');
        const localePath = resolveLocalePath(requestUrl.pathname);
        const sourceHtml = resolve(ctx?.filename || '').split('/').at(-1) || '';
        const route = localePath.route ?? publicRouteForEntry(sourceHtml);
        if (!route) return html;
        const locale = requestedLocale === 'zh-CN' || localePath.locale === 'zh-CN' ? 'zh-CN' : 'en-US';
        return localizeHtmlDocument(html, route, locale);
      },
    },
    // FE-P3 + 2026-10-02 (tools/viteI18nPageCatalogs.ts): every document loads its own catalogs. The game keeps the full
    // ones; each public page loads a generated page catalog holding only the keys its code and markup can show. Every
    // built page preloads its English chunk and names its zh-CN chunk in an inert meta, which localizeHtmlDocument turns
    // into a modulepreload on Chinese documents (build-time /cn/ pages and the middleware's request-time ones), so
    // English visitors never fetch Chinese and Chinese pages never flash English.
    // 2026-10-05 (tools/viteI18nStudioCatalog.ts): the game's catalogs leave the Scene Studio's strings out; each
    // locale's Studio slice loads with the Studio's chunk.
    i18nStudioCatalog(),
    i18nPageCatalogs(),
    {
      name: 'cot-site-entry-output',
      enforce: 'post',
      // Source organization must not change deployed URLs or localized output.
      writeBundle(options) {
        const outputRoot = resolve(options.dir || 'dist');
        const entries = resolve(outputRoot, 'site');
        if (!existsSync(entries)) return;
        for (const name of readdirSync(entries)) {
          if (/^[^/]+\.html$/.test(name)) renameSync(resolve(entries, name), resolve(outputRoot, name));
        }
      },
    },
    peerHarnessPlugin(),
    {
      name: 'cot-routes',
      configureServer(server) {
        server.middlewares.use(rewriteRoutes(server.config.root));
      },
      configurePreviewServer(server) {
        server.middlewares.use(rewriteRoutes(resolve(server.config.root,server.config.build.outDir)));
      },
    },
    collisionManifestPlugin(),
    {
      name: 'cot-dev-modulepreload',
      apply: 'serve',
      transformIndexHtml(_html, ctx) {
        // This optimization belongs only to the playable game entry. Vite
      // invokes HTML transforms for every multi-page input; injecting the
      // game graph into /home, /docs or /gallery makes a presentation visit
        // visit download the complete simulation and fleet source tree.
        if (resolve(ctx?.filename || '') !== resolve(process.cwd(), 'index.html')) return [];
        return reachableSrcModules(process.cwd()).map((href) => ({
          tag: 'link',
          attrs: { rel: 'modulepreload', href },
          injectTo: 'head',
        }));
      },
    },
  ],
  server: {
    // Jev commander dev path (docs/JEV-COMMANDER.md): the dev server has no function runtime, so the
    // same-origin /api/jev route forwards to the local proxy (`npm run jev:dev`, port 8794). A battle with
    // the proxy down simply falls back to the classic brain; VITE_JEV_URL overrides the route entirely.
    proxy: {
      '/api/jev': { target: process.env.COT_JEV_DEV_URL || 'http://127.0.0.1:8794', changeOrigin: false },
    },
    warmup: {
      // same reachable set as the preload links: pre-transform in parallel at
      // server start, so the browser's preload wave hits a warm cache
      clientFiles: reachableSrcModules(process.cwd()).map((u) => '.' + u),
    },
  },
  build: {
    // Vite's per-chunk gzip report re-compresses ~950 chunks on every build. Sizes are owned by
    // tools/bundle-budget.mjs (`npm run check:bundle`), which measures the page closures instead.
    reportCompressedSize: false,
    rollupOptions: {
      // Multi-page build: the game and independently bootable public/tools
      // surfaces. Presentation routes never inherit the playable boot graph.
      input: {
        main: resolve(process.cwd(), 'index.html'),
        notFound: resolve(process.cwd(), '404.html'),
        home: resolve(process.cwd(), 'site/home.html'),
        hudPreview: resolve(process.cwd(), 'site/hud-preview.html'),
        docs: resolve(process.cwd(), 'site/docs.html'),
        docsTopic: resolve(process.cwd(), 'site/docs-topic.html'),
        docsBuild: resolve(process.cwd(), 'site/docs-build.html'),
        docsModels: resolve(process.cwd(), 'site/docs-models.html'),
        docsSimulation: resolve(process.cwd(), 'site/docs-simulation.html'),
        docsVehicles: resolve(process.cwd(), 'site/docs-vehicles.html'),
        docsRendering: resolve(process.cwd(), 'site/docs-rendering.html'),
        docsPerformance: resolve(process.cwd(), 'site/docs-performance.html'),
        docsWorlds: resolve(process.cwd(), 'site/docs-worlds.html'),
        docsAi: resolve(process.cwd(), 'site/docs-ai.html'),
        docsMultiplayer: resolve(process.cwd(), 'site/docs-multiplayer.html'),
        docsAudio: resolve(process.cwd(), 'site/docs-audio.html'),
        docsInterface: resolve(process.cwd(), 'site/docs-interface.html'),
        docsStudio: resolve(process.cwd(), 'site/docs-studio.html'),
        docsFilming: resolve(process.cwd(), 'site/docs-filming.html'),
        gallery: resolve(process.cwd(), 'site/gallery.html'),
      },
      output: {
        // 2026-09-25: hashes encode as base36 — every /assets URL changed once so no edge node keeps serving
        // the 404s it cached for deploy-93 chunks under the deploy-89 immutable rule (docs/DEVELOPMENT.md
        // "Asset caching"); the eight-character width and the [name]-[hash] shape stay the same.
        hashCharacters: 'base36',
        // 2026-10-02 (tools/viteI18nPageCatalogs.ts): every document's boot runtime is one chunk — the locale runtime
        // and routing, static-markup localization, responsive layout and Vite's modulepreload polyfill. Every page loads
        // all of them at boot; automatic chunking split them in two only because lazy chunks import the locale runtime
        // alone. One chunk keeps the game at its request count now that its English catalog is a chunk of its own.
        // Vite's preload helper keeps a chunk of its own (the higher priority claims it before the boot group would
        // pull it in as a dependency): the shared workers load it, and the boot chunk's polyfill needs a document. The
        // plugin fails the build when the boot chunk holds anything else or a worker reaches it.
        codeSplitting: {
          groups: [
            { name: 'preload-helper', test: VITE_PRELOAD_HELPER, priority: 1 },
            { name: 'i18n', test: BOOT_RUNTIME_MODULES },
            // 2026-10-03 (physics lane): the solo sim, the authority host and the client's prediction world all step
            // hulls against the same contact rules — the structure support field and the hull-on-hull pass ride with
            // the collision primitives they are built on, instead of splitting into two chunks of their own (+1 game
            // request) once the prediction world became their third importer.
            { name: 'collision', test: /[\\/]src[\\/](world[\\/]collision|sim[\\/]structureSupport|sim[\\/]tankBodyContacts)\.ts$/ },
            // 2026-10-05 (media Studio): three's Pass base and the light-model family (atmosphere, cloudscapes, light
            // model core, haze law, ground bounce) stay the one chunk the game, map, terrain and urban kit share. The
            // Studio's cinema passes and horizon relight import members of it; without the group those split into a
            // chunk of their own, one more game boot request for code the Studio only reuses. The group takes exactly
            // these six, not their dependencies (which would pull three itself in): the one chunk they formed before.
            { name: 'groundBounce', test: /(?:[\\/]three[\\/]examples[\\/]jsm[\\/]postprocessing[\\/]Pass\.js|[\\/]src[\\/]engine[\\/](?:atmosphere|cloudscapes|lightModelCore|hazeLaw|groundBounce)\.ts)$/, includeDependenciesRecursively: false },
          ],
        },
      },
    },
  },
  optimizeDeps: {
    entries: [
      'index.html', '404.html', 'site/home.html', 'site/docs.html', 'site/docs-topic.html', 'site/gallery.html',
      'site/docs-build.html', 'site/docs-models.html',
      'site/docs-simulation.html', 'site/docs-vehicles.html', 'site/docs-rendering.html',
      'site/docs-performance.html', 'site/docs-worlds.html', 'site/docs-ai.html',
      'site/docs-multiplayer.html', 'site/docs-audio.html', 'site/docs-interface.html', 'site/docs-studio.html',
      'site/docs-filming.html',
    ],
    include: [
      'three',
      'three/examples/jsm/utils/BufferGeometryUtils.js',
      'three/examples/jsm/geometries/RoundedBoxGeometry.js',
    ],
  },
});
