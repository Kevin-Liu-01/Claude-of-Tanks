// viteBlobMedia.ts — the site's big media on Vercel Blob, in Vite (media-blob-279; Main 2026-11-26). The pages, the
// runtime JSON and the code keep writing a moved file's old /media/ path (src/presentation/blobMedia.json maps it to its
// Blob URL):
//   - the build: every entry page's moved paths become their URLs before Vite reads the page's assets, so Vite never looks
//     for a file public/ no longer has; tools/blob-media.mjs rewrite does the rest of dist after the build and fails it
//     when a moved file has no URL;
//   - the dev server: a request for a moved path answers 302 to its Blob URL, from the same manifest (404 with the reason
//     before the upload). No local copy is served: there is none.
// A test build reads a fixture manifest through COT_BLOB_MEDIA_MANIFEST (tools/blob-media.mjs fixture).
// Copyright © 2026 Kevin B. Liu.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Plugin } from 'vite';
import { pathIndex, rewriteText, type MediaPathIndex } from './blobMediaRewrite.ts';

export function blobMedia(root: string): Plugin {
  const manifestPath = (): string => (process.env.COT_BLOB_MEDIA_MANIFEST
    ? resolve(process.env.COT_BLOB_MEDIA_MANIFEST) : resolve(root, 'src/presentation/blobMedia.json'));
  let index: MediaPathIndex | null = null;
  const load = (): MediaPathIndex => (index ??= pathIndex(JSON.parse(readFileSync(manifestPath(), 'utf8'))));
  return {
    name: 'cot-blob-media',
    transformIndexHtml: { order: 'pre', handler: (html) => rewriteText(html, load()) },
    configureServer(server) {
      server.watcher.add(manifestPath());
      server.watcher.on('change', (file) => { if (resolve(file) === manifestPath()) index = null; });
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? '').split(/[?#]/)[0];
        if (!path.startsWith('/media/')) return next();
        const item = load().get(decodeURIComponent(path));
        if (!item) return next();
        res.setHeader('Cache-Control', 'no-store');
        if (!item.url) {
          res.statusCode = 404;
          res.end(`${path} is on Vercel Blob and not uploaded yet (tools/blob-media.mjs upload)`);
          return;
        }
        res.statusCode = 302;
        res.setHeader('Location', item.url);
        res.end();
      });
    },
  };
}
