// A Vite plugin that serves a tool's page only the public files its changed-only key reads (2026-11-01, item 266).
//
// A tool page served from Vite can fetch anything under public/. A GPU step keys only what its page loads (the icons
// page: tools/icons-page-public.mjs), so its server refuses every other public file (403, reported to the tool, which
// fails the run): a new load outside the keyed files fails loudly instead of slipping past the key.
import { statSync } from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';

const isFile = (file) => { try { return statSync(file).isFile(); } catch { return false; } };

/**
 * Serves the public files under `dirs` (top-level directories of public/) and the exact `files` (paths under public/,
 * as a page fetches them: '/models/x.glb'); any other public file is answered 403 and passed to `refused` as its
 * repository path. The browser's own favicon request is answered empty, unread.
 */
export function servedPublicOnly({ dirs = [], files = [] }, refused) {
  const exact = new Set(files.map((file) => file.replace(/^\/+/, '').split('/').join(sep)));
  return {
    name: 'cot-served-public',
    configureServer(server) {
      const { root, publicDir } = server.config;
      server.middlewares.use((req, res, next) => {
        let path;
        try { path = decodeURIComponent(new URL(req.url, 'http://tool').pathname); } catch { return next(); }
        if (path === '/favicon.ico') { res.statusCode = 204; res.end(); return; }
        // Vite serves a public file at its root path; the repository root and /@fs/ reach it by its full path
        for (const file of [join(publicDir, path), join(root, path), path.startsWith('/@fs/') ? path.slice(4) : null]) {
          const inPublic = file && relative(publicDir, file);
          if (!inPublic || inPublic.startsWith('..') || isAbsolute(inPublic) || !isFile(file)) continue;
          if (dirs.includes(inPublic.split(sep)[0]) || exact.has(inPublic)) return next();
          refused(relative(root, file));
          res.statusCode = 403;
          res.end('not an input of this page\'s changed-only key (tools/served-public.mjs)');
          return;
        }
        next();
      });
    },
  };
}
