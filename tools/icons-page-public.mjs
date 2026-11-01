// What the icons page (tools/icons-page.html) loads from public/ in the chain's two GPU steps (2026-11-01, item 266).
//
// genIcons and presentation-centering --update serve the page from Vite, whose public directory is all of public/. The
// changed-only keys used to read all of it (steps.mjs `reads: ['public/**']`), so the vehicle count in public/llms.txt
// or site.webmanifest re-ran both steps on every id. The page loads at most the directories below. Measured
// 2026-11-01: both tools on 14 ids across the fleet made 978 requests each, none for a public file but the browser's
// own /favicon.ico; of every src module that names a public path, the page loads one, the material painter's client,
// whose worker fetches public/fonts/chakra-petch/ChakraPetch-Bold-Latin.woff2. The two steps key exactly these
// directories, and their server refuses every other public file (403, and the run fails), so a new load outside them
// fails loudly instead of slipping past the keys. A page that needs another directory adds it here; the edit moves
// both steps' keys once.
import { statSync } from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';

export const ICONS_PAGE_PUBLIC = Object.freeze(['fonts']);

const isFile = (file) => { try { return statSync(file).isFile(); } catch { return false; } };

/**
 * A Vite plugin that serves only ICONS_PAGE_PUBLIC's directories of public/: any other public file is answered 403
 * and passed to `refused` as its repository path. The browser's own favicon request is answered empty, unread.
 */
export function iconsPagePublicOnly(refused) {
  return {
    name: 'cot-icons-page-public',
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
          if (ICONS_PAGE_PUBLIC.includes(inPublic.split(sep)[0])) return next();
          refused(relative(root, file));
          res.statusCode = 403;
          res.end('not an input of the icons page (tools/icons-page-public.mjs)');
          return;
        }
        next();
      });
    },
  };
}
