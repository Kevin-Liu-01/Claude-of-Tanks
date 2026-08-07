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
//    for main.js's REACHABLE import graph (static + dynamic specifiers,
//    relative paths only), flattening the depth-first discovery waterfall
//    into one parallel fetch wave. modulepreload fetches+compiles but does
//    NOT evaluate, so module side-effect order is untouched. Reachability
//    matters: preloading unreferenced work-in-progress files would surface
//    their transform errors on a page that never imports them.
//  - optimizeDeps.include pins the three.js prebundle so the first page hit
//    never triggers a mid-boot re-optimize (probe servers inherit this too).
//
// Build output is unaffected: the plugin only applies to `vite dev`/`serve`,
// and every headless tool that calls createServer() inherits this config.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve, relative } from 'node:path';

/**
 * Transitive relative-import closure starting at src/main.js.
 * Cheap regex scan (static `import ... from '...'`, bare `import '...'`,
 * `export ... from '...'` and dynamic `import('...')`); only ./ and ../
 * specifiers are followed — package imports live in the prebundle.
 * @param {string} root project root
 * @returns {string[]} root-absolute URL paths, entry first
 */
function reachableSrcModules(root) {
  const entry = resolve(root, 'src/main.js');
  const seen = new Set();
  const queue = [entry];
  const specRe = /(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s*['"]([^'"]+)['"]/g;
  while (queue.length) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    let text;
    try { text = readFileSync(file, 'utf8'); } catch (_) { continue; }
    seen.add(file);
    if (file.endsWith('.json')) continue;
    for (const m of text.matchAll(specRe)) {
      const spec = m[1] || m[2] || m[3];
      if (!spec || !spec.startsWith('.')) continue;
      queue.push(resolve(dirname(file), spec));
    }
  }
  return [...seen].map((f) => '/' + relative(root, f).replace(/\\/g, '/'));
}

/**
 * Pretty routes (owner: "/studio" and "/home"). Pure URL rewrites — the
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
  else if (path === '/home' || path === '/home/') req.url = '/home.html' + query;
  else if (path === '/docs' || path === '/docs/') req.url = '/docs.html' + query;
  next();
}

export default {
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
      transformIndexHtml() {
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
      // two-page build: the game + the /home showcase (which bundles its
      // module script, so the FEATURED_SHOTS import resolves in dist too)
      input: {
        main: resolve(process.cwd(), 'index.html'),
        home: resolve(process.cwd(), 'home.html'),
        docs: resolve(process.cwd(), 'docs.html'),
      },
    },
  },
  optimizeDeps: {
    entries: ['index.html', 'home.html', 'docs.html'],
    include: [
      'three',
      'three/examples/jsm/loaders/GLTFLoader.js',
      'three/examples/jsm/utils/SkeletonUtils.js',
      'three/examples/jsm/utils/BufferGeometryUtils.js',
      'three/examples/jsm/geometries/RoundedBoxGeometry.js',
    ],
  },
};
