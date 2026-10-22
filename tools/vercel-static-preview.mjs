#!/usr/bin/env node
// A local static server that answers a built dist the way the production deployment does (2026-10-22, nav-perf-240).
//
// `vite preview` serves every file with the same revalidating headers and no compression, so a warm-cache navigation
// recorded against it pays round trips production never pays, and a cold one downloads uncompressed bytes. This
// server walks vercel.json through the same route evaluator the routing receipts use (tools/vercelRoutes.test-support.mjs),
// gives each file the Cache-Control the prebuilt deploy writes for it (tools/vercel-output-immutable.mjs; everything
// else keeps Vercel's default `public, max-age=0, must-revalidate`), answers If-None-Match with 304, compresses text with
// brotli, and stands in for the three functions: /api/github-stars returns a fixed count after a latency with the
// function's own Cache-Control, /api/telemetry accepts and drops, /api/jev is unavailable.
//
//   node tools/vercel-static-preview.mjs [--dist=dist] [--port=4180] [--api-latency-ms=350]
//        [--vercel-json=<path>] [--cache-tool=<path to a vercel-output-immutable.mjs>]
// The last two answer an older build with the routes and cache families it shipped with (a before/after recording).
//
// The star counter skips loopback hosts (src/ui/githubStars.ts), so a recorder that wants the production behaviour
// maps a name such as cot.test to 127.0.0.1 (Chrome's --host-resolver-rules) and loads http://cot.test:<port>/.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { brotliCompressSync, constants as zlib } from 'node:zlib';
import { resolveVercelRequest, vercelJsonRoutes } from './vercelRoutes.test-support.mjs';

const ROOT = resolve(new URL('..', import.meta.url).pathname);
const DEFAULT_CACHE_CONTROL = 'public, max-age=0, must-revalidate';
const STARS_CACHE_CONTROL = 'public, max-age=60, s-maxage=900, stale-while-revalidate=86400';

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif',
  '.gif': 'image/gif', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
  '.otf': 'font/otf', '.mp4': 'video/mp4', '.webm': 'video/webm', '.m4v': 'video/mp4', '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.opus': 'audio/opus', '.wav': 'audio/wav', '.glb': 'model/gltf-binary',
  '.ktx2': 'image/ktx2', '.wasm': 'application/wasm', '.bin': 'application/octet-stream',
};
const COMPRESSIBLE = new Set(['.html', '.js', '.mjs', '.css', '.json', '.txt', '.xml', '.svg', '.webmanifest', '.bin']);

function listFiles(dir) {
  const out = new Set();
  const visit = (at) => {
    for (const entry of readdirSync(at)) {
      const full = join(at, entry);
      if (statSync(full).isDirectory()) visit(full);
      else out.add(`/${relative(dir, full).split('\\').join('/')}`);
    }
  };
  visit(dir);
  return out;
}

/** `/<path>` → the Cache-Control the prebuilt deploy gives that file. */
function cacheControlTable(dist, cacheRoutePlan) {
  const table = new Map();
  for (const { prefix, files, cacheControl } of cacheRoutePlan(dist)) {
    for (const file of files) table.set(`/${prefix}/${file}`, cacheControl);
  }
  return table;
}

export async function createStaticPreview({ dist = join(ROOT, 'dist'), apiLatencyMs = 350, starCount = 128, log = () => {},
  vercelJson = join(ROOT, 'vercel.json'), cacheTool = join(ROOT, 'tools', 'vercel-output-immutable.mjs') } = {}) {
  const root = resolve(dist);
  if (!existsSync(join(root, 'index.html'))) throw new Error(`${root} has no index.html`);
  const routes = vercelJsonRoutes(JSON.parse(readFileSync(vercelJson, 'utf8')));
  const files = listFiles(root);
  const { cacheRoutePlan } = await import(pathToFileURL(resolve(cacheTool)).href);
  const cacheControls = cacheControlTable(root, cacheRoutePlan);
  const encoded = new Map();

  const body = (file) => {
    let entry = encoded.get(file);
    if (entry) return entry;
    const raw = readFileSync(join(root, file));
    const etag = `"${createHash('sha1').update(raw).digest('base64url').slice(0, 20)}"`;
    const br = COMPRESSIBLE.has(extname(file)) && raw.length > 512
      ? brotliCompressSync(raw, { params: { [zlib.BROTLI_PARAM_QUALITY]: 5 } }) : null;
    entry = { raw, br, etag };
    encoded.set(file, entry);
    return entry;
  };

  const sendFile = (req, res, file, status, headers) => {
    const entry = body(file);
    res.setHeader('content-type', TYPES[extname(file)] || 'application/octet-stream');
    res.setHeader('cache-control', headers['cache-control'] || cacheControls.get(file) || DEFAULT_CACHE_CONTROL);
    for (const [name, value] of Object.entries(headers)) if (name !== 'cache-control') res.setHeader(name, value);
    res.setHeader('etag', entry.etag);
    res.setHeader('vary', 'Accept-Encoding');
    if (status === 200 && req.headers['if-none-match'] === entry.etag) {
      res.statusCode = 304;
      res.end();
      return 304;
    }
    const useBr = entry.br && /\bbr\b/.test(String(req.headers['accept-encoding'] || ''));
    const payload = useBr ? entry.br : entry.raw;
    if (useBr) res.setHeader('content-encoding', 'br');
    res.statusCode = status;
    res.setHeader('content-length', payload.length);
    res.end(req.method === 'HEAD' ? undefined : payload);
    return status;
  };

  const api = (req, res, path) => {
    if (path === '/api/github-stars') {
      setTimeout(() => {
        res.setHeader('content-type', 'application/json; charset=utf-8');
        res.setHeader('cache-control', STARS_CACHE_CONTROL);
        res.end(JSON.stringify({ stargazers_count: starCount }));
      }, apiLatencyMs);
      return 200;
    }
    res.setHeader('cache-control', 'private, no-store, max-age=0');
    if (path === '/api/telemetry') {
      req.resume();
      res.statusCode = 204;
      res.end();
      return 204;
    }
    res.statusCode = 503;
    res.setHeader('content-type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'unavailable' }));
    return 503;
  };

  const server = createServer((req, res) => {
    const url = new URL(req.url || '/', 'http://local');
    const path = decodeURIComponent(url.pathname);
    let status;
    if (path.startsWith('/api/')) status = api(req, res, path);
    else {
      const outcome = resolveVercelRequest(routes, { path, query: url.search }, files);
      if (outcome.location) {
        res.statusCode = outcome.status;
        res.setHeader('location', outcome.location);
        res.end();
        status = outcome.status;
      } else if (outcome.status === 200) {
        status = sendFile(req, res, outcome.file, 200, outcome.headers);
      } else {
        const localized = path.startsWith('/cn/') && files.has('/cn/404.html') ? '/cn/404.html' : '/404.html';
        status = sendFile(req, res, localized, 404, outcome.headers);
      }
    }
    log(`${status} ${req.method} ${req.url}`);
  });
  return server;
}

function option(name, fallback) {
  const hit = process.argv.find((value) => value.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(option('port', '4180'));
  const server = await createStaticPreview({
    dist: resolve(option('dist', join(ROOT, 'dist'))),
    apiLatencyMs: Number(option('api-latency-ms', '350')),
    vercelJson: resolve(option('vercel-json', join(ROOT, 'vercel.json'))),
    cacheTool: resolve(option('cache-tool', join(ROOT, 'tools', 'vercel-output-immutable.mjs'))),
    log: process.argv.includes('--verbose') ? (line) => console.log(line) : () => {},
  });
  server.listen(port, '127.0.0.1', () => console.log(`vercel-static-preview: http://127.0.0.1:${port}/`));
}
