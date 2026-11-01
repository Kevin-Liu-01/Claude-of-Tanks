// A Vite plugin that serves a tool's page only the public files its changed-only key reads (2026-11-01, item 266).
//
// A tool page served from Vite can fetch anything under public/. A GPU step keys only what its page loads (the icons
// page: tools/icons-page-public.mjs), so its server refuses every other public file (403, reported to the tool, which
// fails the run): a new load outside the keyed files fails loudly instead of slipping past the key.
import { realpathSync, statSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path';

const isFile = (file) => { try { return statSync(file).isFile(); } catch { return false; } };
const real = (path) => { try { return realpathSync(path); } catch { return path; } };
const inside = (rel) => rel !== '' && !rel.startsWith('..') && !isAbsolute(rel);

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
      const { publicDir } = server.config;
      // the public directory in both forms: a Vite that resolves its root reports /private/var/... where the tool
      // passed macOS's /var/... (267: Vite 8.3 in one lane)
      const publicDirs = [...new Set([publicDir, real(publicDir)])];
      /** The public file a request names, relative to public/, or null: Vite serves one at its root path, the
       *  repository path (/public/...) and /@fs/ (its full path, either form of a symlinked directory). */
      const publicFileOf = (path) => {
        const names = [path.slice(1), path.startsWith('/public/') ? path.slice('/public/'.length) : null];
        if (path.startsWith('/@fs/')) {
          const file = path.slice(4);
          for (const form of [file, join(real(dirname(file)), basename(file))]) {
            for (const dir of publicDirs) names.push(relative(dir, form));
          }
        }
        return names.map((name) => name && name.split('/').join(sep))
          .find((name) => name && inside(name) && isFile(join(publicDir, name))) ?? null;
      };
      server.middlewares.use((req, res, next) => {
        let path;
        try { path = decodeURIComponent(new URL(req.url, 'http://tool').pathname); } catch { return next(); }
        if (path === '/favicon.ico') { res.statusCode = 204; res.end(); return; }
        const inPublic = publicFileOf(path);
        if (inPublic === null || dirs.includes(inPublic.split(sep)[0]) || exact.has(inPublic)) return next();
        refused(`public/${inPublic.split(sep).join('/')}`);
        res.statusCode = 403;
        res.end('not an input of this page\'s changed-only key (tools/served-public.mjs)');
      });
    },
  };
}
