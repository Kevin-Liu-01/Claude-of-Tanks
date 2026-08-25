// vite.config.js — LOADING PERF (boot r9).
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
//    for main.js's reachable STATIC import graph (relative paths only),
//    flattening the depth-first discovery waterfall into one parallel fetch
//    wave. Dynamic imports are deliberately excluded: preloading them would
//    defeat the source-geometry/model-loader lazy boundaries and recreate the
//    production boot problem in development.
//  - optimizeDeps.include pins the three.js prebundle so the first page hit
//    never triggers a mid-boot re-optimize (probe servers inherit this too).
//
// Build output is unaffected: the plugin only applies to `vite dev`/`serve`,
// and every headless tool that calls createServer() inherits this config.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';

/**
 * Pin every generated build asset to the deployment that emitted its HTML.
 * Vercel keeps prior deployments addressable through the same-origin `dpl`
 * query. Without it, a garage tab opened before a deploy asks the newest
 * deployment for its old lazy fleet/map/kill-cam hashes and receives 404s.
 * Public files keep their stable root URLs; only Vite-owned hashed assets need
 * the version lock.
 */
export function deploymentPinnedAssetUrl(
  filename,
  { type } = {},
  deploymentId = process.env.VERCEL_DEPLOYMENT_ID,
) {
  const id = String(deploymentId || '').trim();
  if (!id || type === 'public') return undefined;
  return `/${filename}?dpl=${encodeURIComponent(id)}`;
}

const deploymentId = String(process.env.VERCEL_DEPLOYMENT_ID || '').trim();

/**
 * Transitive relative-import closure starting at src/main.js.
 * Cheap regex scan (static `import ... from '...'`, bare `import '...'`, and
 * `export ... from '...'`); only ./ and ../
 * specifiers are followed — package imports live in the prebundle.
 * @param {string} root project root
 * @returns {string[]} root-absolute URL paths, entry first
 */
function reachableSrcModules(root) {
  const entry = resolve(root, 'src/main.js');
  const seen = new Set();
  const queue = [entry];
  const specRe = /(?:import|export)\s+(?:[^'"]*?\sfrom\s*)?['"]([^'"]+)['"]/g;
  while (queue.length) {
    const file = queue.pop();
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
 * real file. /studio boots the game (index.html; src/game/studio.js sees the
 * pathname and auto-enters), /home serves the showcase page (home.html — a
 * real build entry, so /home also ships in dist; vercel.json carries the
 * same two rewrites for the deployed host). Queries pass through
 * (/studio?map=desert works).
 */
function rewriteRoutes(req, res, next) {
  const url = req.url || '';
  const qi = url.indexOf('?');
  const path = qi === -1 ? url : url.slice(0, qi);
  const query = qi === -1 ? '' : url.slice(qi);
  if (path === '/studio' || path === '/studio/') req.url = '/index.html' + query;
  else if (path === '/gallery' || path === '/gallery/') req.url = '/gallery.html' + query;
  else if (path === '/surface-studio' || path === '/surface-studio/') {
    const params = new URLSearchParams(query.startsWith('?') ? query.slice(1) : query);
    if (!params.has('layer')) params.set('layer', 'markup');
    res.statusCode = 308;
    res.setHeader('Location', `/gallery?${params.toString()}`);
    res.end();
    return;
  }
  else if (path === '/home' || path === '/home/') req.url = '/home.html' + query;
  else if (path === '/docs' || path === '/docs/') req.url = '/docs.html' + query;
  else if (/^\/docs\/(simulation|vehicles|rendering|worlds|multiplayer|interface|studio)\/?$/.test(path)) {
    const topic = path.split('/').filter(Boolean).at(-1);
    req.url = `/docs-${topic}.html${query}`;
  }
  next();
}

export default {
  // Vite does not enable Vercel Skew Protection automatically. Supplying the
  // deployment id on the entry, static dependencies, module-preload graph,
  // and later dynamic imports keeps one browser document on one module graph.
  experimental: deploymentId ? {
    renderBuiltUrl(filename, context) {
      return deploymentPinnedAssetUrl(filename, context, deploymentId);
    },
  } : undefined,
  plugins: [
    {
      name: 'cot-routes',
      configureServer(server) {
        server.middlewares.use(rewriteRoutes);
      },
      configurePreviewServer(server) {
        server.middlewares.use(rewriteRoutes);
      },
    },
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
    warmup: {
      // same reachable set as the preload links: pre-transform in parallel at
      // server start, so the browser's preload wave hits a warm cache
      clientFiles: reachableSrcModules(process.cwd()).map((u) => '.' + u),
    },
  },
  build: {
    rollupOptions: {
      // Multi-page build: the game and independently bootable public/tools
      // surfaces. Presentation routes never inherit the playable boot graph.
      input: {
        main: resolve(process.cwd(), 'index.html'),
        home: resolve(process.cwd(), 'home.html'),
        docs: resolve(process.cwd(), 'docs.html'),
        docsTopic: resolve(process.cwd(), 'docs-topic.html'),
        docsSimulation: resolve(process.cwd(), 'docs-simulation.html'),
        docsVehicles: resolve(process.cwd(), 'docs-vehicles.html'),
        docsRendering: resolve(process.cwd(), 'docs-rendering.html'),
        docsWorlds: resolve(process.cwd(), 'docs-worlds.html'),
        docsMultiplayer: resolve(process.cwd(), 'docs-multiplayer.html'),
        docsInterface: resolve(process.cwd(), 'docs-interface.html'),
        docsStudio: resolve(process.cwd(), 'docs-studio.html'),
        gallery: resolve(process.cwd(), 'gallery.html'),
      },
    },
  },
  optimizeDeps: {
    entries: [
      'index.html', 'home.html', 'docs.html', 'docs-topic.html', 'gallery.html',
      'docs-simulation.html', 'docs-vehicles.html', 'docs-rendering.html',
      'docs-worlds.html', 'docs-multiplayer.html', 'docs-interface.html', 'docs-studio.html',
    ],
    include: [
      'three',
      'three/examples/jsm/utils/BufferGeometryUtils.js',
      'three/examples/jsm/geometries/RoundedBoxGeometry.js',
    ],
  },
};
