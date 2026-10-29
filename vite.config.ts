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
import { expandTypeMarkers } from './src/ui/typeFaces.ts';
import { localizeHtmlDocument } from './src/presentation/localizedHtml.ts';
import { publicRouteForEntry, resolveLocalePath } from './src/ui/localeRouting.ts';
import { replaceAppVersionTokens, resolveAppVersion } from './tools/appVersion.ts';
import { resolveMatchBuild } from './tools/matchBuild.ts';
import { assertPublicBuildEnv } from './tools/publicBuildEnv.ts';
import { isExistingProjectDocument } from './tools/existing-document-route.ts';
import { sharedWorkerChunks } from './tools/viteSharedWorkers.ts';
import { glslMinify } from './tools/viteGlslMinify.ts';
import { cssInTsMinify } from './tools/viteCssInTsMinify.ts';
import { BOOT_RUNTIME_MODULES, i18nPageCatalogs, VITE_PRELOAD_HELPER } from './tools/viteI18nPageCatalogs.ts';
import { i18nStudioCatalog } from './tools/viteI18nStudioCatalog.ts';
import { gameEntryMeta } from './tools/viteGameEntryMeta.ts';
import { responsiveSeed } from './tools/viteResponsiveSeed.ts';
import { speculationRules } from './tools/viteSpeculationRules.ts';

const appVersion = resolveAppVersion(dirname(fileURLToPath(import.meta.url)));
/** The match build line every page and host Worker of this build send in their HELLO (src/mp/wire/matchBuild.ts). */
const matchBuild = resolveMatchBuild(dirname(fileURLToPath(import.meta.url)), appVersion);

/**
 * The page catalog plugin (tools/viteI18nPageCatalogs.ts). Its build scan also reads the game's whole graph and every
 * worker's: the Studio catalog split of the page and of the worker builds serves the game's catalogs restricted to the
 * keys that scan finds (2026-10-15, the perf lane), so both builds emit the same, smaller catalog files.
 */
const pageCatalogs = i18nPageCatalogs();
const gameCatalogKeys = (): readonly string[] | null => pageCatalogs.api.gameCatalogKeys();

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
// (physics stream, 2026-10-16; the coordinator's ruling with the MP lane) the manifests are served on their format's route,
// and the production before them keeps its own files, frozen byte for byte, so a tab left open at the deploy that hosts
// or is elected still decodes its own format and its own world (collisionManifestRoutes.selftest). (The maps lane,
// 2026-10-20; the coordinator's ruling) this build's at /mp-collision/v3/ (the v5 codec), production 228's at
// /mp-collision/v2/ (server/world-collision-manifests-228, ed0f3e31b's); production 224's at /mp-collision/ are retired
// (the build-mismatch refusal sends an older tab to Refresh).
const COLLISION_MANIFEST_SOURCES: ReadonlyArray<{ route: string; dir: string }> = [
  { route: '/mp-collision/v3', dir: resolve(dirname(fileURLToPath(import.meta.url)), 'server/world-collision-manifests') },
  { route: '/mp-collision/v2', dir: resolve(dirname(fileURLToPath(import.meta.url)), 'server/world-collision-manifests-228') },
];

function collisionManifestFiles(dir: string): Array<{ name: string; path: string }> {
  if (!existsSync(dir)) return [];
  const out: Array<{ name: string; path: string }> = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.json')) continue;
    const path = resolve(dir, file);
    if (file === 'index.json') { out.push({ name: 'index.json', path }); continue; }
    const hash = createHash('sha256').update(readFileSync(path)).digest('hex').slice(0, 12);
    out.push({ name: `${file.slice(0, -5)}.${hash}.json`, path });
  }
  return out;
}

const collisionManifestPlugin = () => ({
  name: 'cot-mp-collision-manifests',
  configureServer(server: { middlewares: { use(handler: Connect.NextHandleFunction): void } }) {
    const files = new Map<string, Map<string, string>>();
    server.middlewares.use((req, res, next) => {
      const url = req.url || '';
      // (each route its own prefix: '/mp-collision/v3/' and '/mp-collision/v2/' never overlap)
      const source = COLLISION_MANIFEST_SOURCES.find((entry) => url.startsWith(`${entry.route}/`));
      if (!source) { next(); return; }
      if (!files.has(source.route)) files.set(source.route, new Map(collisionManifestFiles(source.dir).map((entry) => [entry.name, entry.path])));
      const name = url.slice(source.route.length + 1).split('?', 1)[0]!;
      const path = files.get(source.route)!.get(name);
      if (!path) { res.statusCode = 404; res.end(); return; }
      res.setHeader('content-type', 'application/json; charset=utf-8');
      res.setHeader('cache-control', name === 'index.json' ? 'no-cache' : 'public, max-age=31536000, immutable');
      res.end(readFileSync(path));
    });
  },
  generateBundle(this: { emitFile(file: { type: 'asset'; fileName: string; source: Buffer }): void }) {
    for (const { route, dir } of COLLISION_MANIFEST_SOURCES) {
      for (const entry of collisionManifestFiles(dir)) {
        this.emitFile({ type: 'asset', fileName: `${route.slice(1)}/${entry.name}`, source: readFileSync(entry.path) });
      }
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
  // 2026-10-13 (MP plan step 13): the same-wire build check's line — the page and the match host Worker read the same
  // constant (src/mp/wire/matchBuild.ts MATCH_BUILD), so a host can refuse a seat whose prediction code differs.
  define: { __COT_MATCH_BUILD__: JSON.stringify(matchBuild) },
  // Workers Vite still bundles on their own (the match host, the material painter, the sky/cloud/schematic/texture
  // workers) keep ES modules so their donor families stay on-demand imports, and their chunks take the same base36
  // hash alphabet so every /assets URL moved together (2026-09-25, docs/DEVELOPMENT.md "Asset caching").
  // The match host's catalog chunks split like the page's (tools/viteI18nStudioCatalog.ts), so both builds emit the same
  // catalog files.
  worker: { format: 'es', plugins: () => [i18nStudioCatalog({ gameKeys: gameCatalogKeys })], rollupOptions: { output: { hashCharacters: 'base36' } } },
  plugins: [
    // 2026-10-02 (tools/viteSharedWorkers.ts): the wreck bake and Garage workshop workers are entries of the page
    // build and import the page's own chunks (dist/assets 954 files / 34.9 MB -> 682 / 27.7 MB; a worker never
    // downloads again a module the page already holds). The match host stays separate: its spec-only graph would
    // split four boot chunks (+5 game / +4 gallery requests) or drag the builder core into the host. The small
    // workers are single self-contained files. The riding-parts and decor workers (UI-LOCKDOWN E) run the profile kit
    // and the decoration the page has already loaded by the time they start.
    ...sharedWorkerChunks({ workers: {
      'src/world/wreckBakeWorker.ts': {},
      'src/game/garageWorkshopGeometryWorker.ts': { privateCopies: ['src/vehicles/profileBuilderAdapter.ts'] },
      'src/vehicles/ridingPartsWorker.ts': {},
      'src/vehicles/decorPlanWorker.ts': {},
    } }),
    // 2026-10-02 (tools/viteGlslMinify.ts): comments and line-edge whitespace out of the game's own complete shader
    // programs at build time; lines, directives, in-line text and every library shader stay as written (game boot
    // -31.3 KB raw / -10.4 KB brotli).
    glslMinify(),
    // 2026-10-18 (brand-ui BUI-F3, tools/viteCssInTsMinify.ts): comments and layout whitespace out of the CSS kept in
    // TS literals (the HUD, menus, settings, end screen and kill cam sheets ensureStyle() injects); strings,
    // interpolation edges and the CSS token stream stay exactly as written (the build fails otherwise).
    cssInTsMinify(),
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
      // The type system (src/ui/typeFaces.ts): every document's `<!--cot:type …-->` marker becomes its font preloads and
      // the one <style id="cot-font-faces"> (faces, fallbacks, type tokens). Pre-order, so Vite sees it as source markup.
      name: 'cot-type-faces',
      enforce: 'pre',
      transformIndexHtml(html) {
        return expandTypeMarkers(html);
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
    // locale's Studio slice loads with the Studio's chunk. 2026-10-15 (the perf lane): in the build they also leave out
    // every string the game's graph and its workers cannot show (the docs, home, gallery and media pages' strings).
    i18nStudioCatalog({ gameKeys: gameCatalogKeys }),
    pageCatalogs,
    // 2026-10-22 (nav-perf-240): every public page readies the next page before the click (the rules' comment), and
    // every document paints its first frame with its viewport bands (the seed's comment).
    speculationRules(),
    responsiveSeed(),
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
    // brand-ui BUI-F7: the public pages name the game's entry chunk for the Play button's hover prefetch (the game's
    // own documents are left byte for byte as they were).
    gameEntryMeta(),
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
        docsRendering: resolve(process.cwd(), 'site/docs-rendering.html'),
        docsAi: resolve(process.cwd(), 'site/docs-ai.html'),
        docsMultiplayer: resolve(process.cwd(), 'site/docs-multiplayer.html'),
        docsAudio: resolve(process.cwd(), 'site/docs-audio.html'),
        docsStudio: resolve(process.cwd(), 'site/docs-studio.html'),
        docsFilming: resolve(process.cwd(), 'site/docs-filming.html'),
        docsModes: resolve(process.cwd(), 'site/docs-modes.html'),
        docsBattlefields: resolve(process.cwd(), 'site/docs-battlefields.html'),
        docsCombat: resolve(process.cwd(), 'site/docs-combat.html'),
        docsTanks: resolve(process.cwd(), 'site/docs-tanks.html'),
        docsStart: resolve(process.cwd(), 'site/docs-start.html'),
        docsControls: resolve(process.cwd(), 'site/docs-controls.html'),
        docsFleet: resolve(process.cwd(), 'site/docs-fleet.html'),
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
            // 2026-10-25 (nav-perf, UI-LOCKDOWN E; 252's bundle growth): the turret seat plane (its five vehicle modules), the
            // tech tree's tier table and the deterministic math are all three loaded at boot by exactly the game, cn and
            // Gallery pages. On their own they were two new boot requests on each, and the deterministic math, pulled into
            // the collision chunk as one of its dependencies, put that whole 57 KB chunk on the Gallery's boot for 15 KB of
            // math its vehicle markings and launcher muzzles import. One chunk, exactly these modules, ahead of the collision
            // group's dependency sweep.
            // 2026-10-25 (integrator 253): the UI canvas primitive (canvas-ui-253) and the vehicle eras table (equipment-rules-253)
            // load at boot on the same three pages; on their own they were one and two more boot requests on each (Main's
            // 253 ruling: no extra request). Both are leaves (uiCanvas imports nothing, vehicleEras only types).
            { name: 'turretSeatPlane', priority: 1, test: /[\\/]src[\\/](?:vehicles[\\/](?:turretSeatPlane|vehicleMesh|coplanarDepth|turretRingLoader|combatAnatomyCalibrationRegistry)|techTree[\\/]tiers|sim[\\/](?:detMath|vehicleEras)|ui[\\/]uiCanvas)\.ts$/, includeDependenciesRecursively: false },
            // 2026-10-26 (premiere-gallery-studio, INTERACTION-REDESIGN C): the kit picker, its words and the picker menu
            // (components/picker.ts, pickerText.ts, components/pickerMenu.ts) load at boot on the game (the Garage's camo,
            // equipment and rival pickers) and the Gallery (its sort and rival menus). They ride with the pinch guard, the one
            // leaf those two pages (and only they) boot that no worker loads (the worker-shared chunks may not reach the i18n
            // boot chunk, which pickerText does); on their own they were one more game boot request and two on the Gallery.
            // 2026-10-26 (premiere-gallery-studio, 258): the hero cards' tier chip (ui/heroCardChips.ts, 0.4 KB, the Garage's roster
            // at boot and the lazy shared hero tiles) rides here too: it reads the locale runtime as pickerText does, and on its
            // own it was one more game and cn boot request.
            // 2026-10-27 (261, the dropdown audit): the kit menu over a form's <select> (ui/selectPickerMenu.ts: the Rooms fields,
            // the Gallery's markup primitive) rides here too; on its own it was one more Gallery boot request.
            { name: 'kitPicker', test: /[\\/]src[\\/]ui[\\/](?:pinchZoomGuard|pickerText|heroCardChips|selectPickerMenu|components[\\/](?:picker|pickerMenu))\.ts$/, includeDependenciesRecursively: false },
            // 2026-10-26 (integrator 257): the GPU catch-up gate (engine/gpuCatchUp.ts, battle-spikes-253) is a leaf the
            // program warm owner imports at boot; once the lazy post passes became its second importer (9a878b0208, each
            // pass's links between tasks) it split out of programWarm's chunk into one more game and cn boot request
            // (564 B). It rides with the program warm owner again, as on 256.
            // 2026-10-27 (integrator 261): the program receipt (engine/programReceipt.ts, 0.8 KB, the room-stalls lane's
            // revealPrograms and lateLinks receipts) is a leaf main imports at boot and the lazy network composition imports
            // too; on its own it was one more game and cn boot request. It rides with the program warm owner it measures.
            { name: 'programWarm', test: /[\\/]src[\\/]engine[\\/](?:programWarm|gpuCatchUp|programReceipt)\.ts$/, includeDependenciesRecursively: false },
            // 2026-10-25 (nav-perf): the spotting stats ride with the vehicle actions, where 252 had them; the Garage's lazy
            // equipment preview is their second importer, and on their own they were one more game boot request
            // 2026-10-25 (integrator 253): the DOM-free equipment rules (equipment-rules-253) ride with them too: the game and cn
            // load them at boot (the Garage, matchRuleset), and on their own they were one more boot request
            // 2026-10-26 (premiere-gallery-studio): the battlefield preview's minimap URL (minimapAssetUrl.ts, the game's boot and
            // the lazy battlefield picker) rides here too: on its own it was one more game and cn boot request.
            // 2026-10-26 (consumables-260): the DOM-free consumable rules and the Garage's loadout helpers (sim/consumableRules.ts,
            // game/consumableLoadout.ts) load at boot on exactly the game and cn (the Garage, the room selection) and in the lazy
            // HUD and battle; on their own they were one more boot request on both.
            { name: 'vehicleActions', test: /[\\/]src[\\/](?:game[\\/](?:vehicleActions|consumableLoadout)|sim[\\/](?:spottingStats|equipmentRules|consumableRules)|ui[\\/]minimapAssetUrl)\.ts$/, includeDependenciesRecursively: false },
            // 2026-10-05 (media Studio): three's Pass base and the light-model family (atmosphere, cloudscapes, light
            // model core, haze law, ground bounce) stay the one chunk the game, map, terrain and urban kit share. The
            // Studio's cinema passes and horizon relight import members of it; without the group those split into a
            // chunk of their own, one more game boot request for code the Studio only reuses. The group takes exactly
            // these six, not their dependencies (which would pull three itself in): the one chunk they formed before.
            // 2026-10-14 (integrator 223; tank id schema 2): the id alias layer (schema map, boundaries, storage migration)
            // rides with the fleet's spec registry, a leaf chunk the game and the gallery both load at boot. The vehicle code,
            // the gallery and main all import it, so on its own it became one more boot request on every page. The group takes
            // exactly these four modules, none of their dependencies.
            { name: 'fleetSpecRegistry', test: /[\\/]src[\\/](?:vehicles[\\/](?:fleetSpecRegistry|tankIdAliases)|game[\\/](?:tankIdBoundaries|tankIdStorageMigration))\.ts$/, includeDependenciesRecursively: false },
            // 2026-10-16 (the perf lane; 226's bundle budget: game requests 131 over 128): the fleet's leaf layout data — the
            // supplied frames, skirt and hull layouts, upgrade datums and the national donor designs — are pure tables
            // (no import but other tables) that the builders, the gallery and main all reach, so each split into a chunk of
            // its own (14 boot requests of 0.1-10 KB). One group takes exactly these modules, none of their dependencies.
            // 2026-10-28 (integrator 263): the Christian II's turret datums and envelope (christian2Armor.ts, christian2-262) and the
            // Leopard 2-pattern hull datums it reads are tables the specs (boot) and the lazy builder both import; on their own
            // they were one more game, cn and Gallery boot request.
            { name: 'fleetLayouts', test: /[\\/]src[\\/]vehicles[\\/](?:christian2Armor|leopard2HullDatums|marder2Frame|abramsUpgradeDatums|amx10pSkirtLayout|griffinViperLayout|m6LinebackerLayout|abramsSourceXDatums|aresApcXFrame|tos1aTagilLayout|escortFieldKitLayout|national(?:DonorTurrets|UkraineDesign|PolandDesign|ChinaDesign|RussiaDesign|ModernizationDesign)|profiles[\\/](?:xk2Frame|strv122XSuppliedFrame|leopardRevolutionPrototypeFrame|leopardImprovedHull|challenger1XSuppliedFrame))\.ts$/, includeDependenciesRecursively: false },
            // 2026-10-19 (ac130-fx-228 r2; the game's entry is over its budget): a kill's source identity (the AC-130's and
            // the drone's label and icon, ui/killSourceIdentity.ts) is read by the loading roster at boot and by the HUD,
            // killcam, battle report, final blow and debrief; on its own it became one more boot request and one more
            // entry in the entry chunk's preload map. It rides in the tank-icon helpers' chunk: every surface that names a
            // source already imports it and only the game boots it (in the ui icon library's it reached every docs page;
            // with the loading roster it added preload edges); the group takes exactly these two modules, none of their
            // dependencies.
            // 2026-10-25 (premiere-site, the owner's primitives pass): the kit's vehicle identity (components/identity.ts: flag,
            // silhouette, vehicle) rides here too. It imports the icon helpers and the flags, and loads where they do (the Gallery,
            // the game's lazy screens); on its own it was one more Gallery boot request. The shell glyph map (shellIcons.ts,
            // 0.7 KB) joins it too: the Garage and the Gallery share it now, and on its own it was one more boot request on both.
            { name: 'icons', test: /[\\/]src[\\/]ui[\\/](?:icons|killSourceIdentity|shellIcons|components[\\/]identity)\.ts$/, includeDependenciesRecursively: false },
            // brand-ui BUI-F1: the design tokens (src/ui/tokens/tokens.css, linked first by the game and cn documents) keep
            // a stylesheet of their own; merged into a shared chunk they reorder the entry's imports and minified names.
            { name: 'designTokens', test: /[\\/]src[\\/]ui[\\/]tokens[\\/]tokens\.css$/, includeDependenciesRecursively: false },
            // 2026-10-18 (brand-ui BUI-F3): the style injector (src/ui/styleLayers.ts, ensureStyle with its cascade layer)
            // rides with the type sheet (src/ui/fonts.ts), which injects through it and which 18 of its 24 callers import
            // already: on its own it became one more boot request on the game and Gallery pages for 0.3 KB, and beside
            // dom.ts it made every fonts importer preload the DOM helpers too. Exactly these two modules.
            // 2026-10-25 (premiere-site 250): the kit's escape helper (components/escape.ts, pure, 0.3 KB) rides here too: every
            // page that builds kit markup or a kit notice (the game, the Gallery, the Field Manual) loads this chunk at boot, so
            // the docs page's notices no longer pull the test-drive link's chunk and the fleet registry behind it.
            { name: 'fonts', test: /[\\/]src[\\/]ui[\\/](?:fonts|styleLayers|components[\\/]escape)\.ts$/, includeDependenciesRecursively: false },
            // 2026-10-25 (tech-tree view 252): the kit's markup factories (src/ui/components/components.ts and its escape
            // helper) ride in the chunk the game and the Gallery share at boot with the test-drive link, where they sat
            // before. The tech tree's lazy chunk is their third importer; on their own they became one more boot request on
            // both pages. Exactly these modules, none of their dependencies (the escape helper moved to the fonts chunk, 250).
            { name: 'testDriveLink', test: /[\\/]src[\\/](?:game[\\/]testDriveLink|ui[\\/]components[\\/]components)\.ts$/, includeDependenciesRecursively: false },
            // 2026-10-18 (brand-ui BUI-F7): the site's one playback policy (src/presentation/mediaPlayer.ts, which imports
            // nothing) rides in the fleet takes' chunk. As a chunk of its own it became one more entry in the game entry's
            // preload list for the Garage's import('./fleetTakes.ts'), new bytes on every game boot; grouped with the
            // scene-link helper instead it moved that chunk earlier in the Studio's list. Here the entry is byte-identical
            // apart from hashes. The public pages reach the player with import() beside their first bytes (with the fleet
            // takes' small helpers, about 7 KB brotli, only on pages that show a video).
            { name: 'fleetTakes', test: /[\\/]src[\\/](?:ui[\\/]fleetTakes|presentation[\\/]mediaPlayer)\.ts$/, includeDependenciesRecursively: false },
            // 2026-10-26 (premiere-site, the interaction redesign's battlefield picker): the picker's facts (ui/battlefieldFacts.ts,
            // loaded with Deploy's picker) read the landscape tags. As their third importer, with main and the Rooms host's
            // playMenu, the tags split off the chunk they shared with the random-map mosaic and the play-mode normaliser: one more
            // game and cn boot request for 1 KB. The three ride together again, exactly these modules.
            { name: 'playMode', test: /[\\/]src[\\/](?:mp[\\/]session[\\/]playMode|ui[\\/](?:randomPreviews|regionTags))\.ts$/, includeDependenciesRecursively: false },
            // 2026-10-18 (brand-ui BUI-F9): the accessibility reader and the token selection it writes ride with the shared DOM
            // primitives, a leaf chunk only the game loads at boot. The main entry, the input layer's chunk and the lazy HUD,
            // FX and kill cam all import the reader, so on its own it became one more game boot request. The group takes
            // exactly these three modules, none of their dependencies.
            { name: 'dom', test: /[\\/]src[\\/]ui[\\/](?:dom|accessibilityPreferences|tokens[\\/]tokenSelection)\.ts$/, includeDependenciesRecursively: false },
            { name: 'groundBounce', test: /(?:[\\/]three[\\/]examples[\\/]jsm[\\/]postprocessing[\\/]Pass\.js|[\\/]src[\\/]engine[\\/](?:atmosphere|cloudscapes|lightModelCore|hazeLaw|groundBounce)\.ts)$/, includeDependenciesRecursively: false },
            // 2026-10-19 (gameplay-modes-228 round 2): TEAM NATIONS' country table and its planner are one chunk — the
            // garage's TEAMS switch reads the table, the solo roster plans with both, the rooms read both — instead of
            // two boot requests (the table and the planner each split off on their own)
            { name: 'teamNations', test: /[\\/]src[\\/]sim[\\/](?:countries|teamNations)\.ts$/, includeDependenciesRecursively: false },
          ],
        },
      },
    },
  },
  optimizeDeps: {
    entries: [
      'index.html', '404.html', 'site/home.html', 'site/docs.html', 'site/docs-topic.html', 'site/gallery.html',
      'site/docs-build.html', 'site/docs-models.html',
      'site/docs-simulation.html', 'site/docs-rendering.html',
      'site/docs-ai.html',
      'site/docs-multiplayer.html', 'site/docs-audio.html', 'site/docs-studio.html',
      'site/docs-filming.html', 'site/docs-modes.html', 'site/docs-controls.html', 'site/docs-fleet.html', 'site/docs-start.html', 'site/docs-tanks.html', 'site/docs-combat.html', 'site/docs-battlefields.html',
    ],
    include: [
      'three',
      'three/examples/jsm/utils/BufferGeometryUtils.js',
      'three/examples/jsm/geometries/RoundedBoxGeometry.js',
    ],
  },
});
