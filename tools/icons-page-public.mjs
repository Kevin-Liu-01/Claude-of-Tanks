// What the icons page (tools/icons-page.html) loads from public/ in the chain's two GPU steps (2026-11-01, item 266).
//
// genIcons and presentation-centering --update serve the page from Vite, whose public directory is all of public/. The
// changed-only keys used to read all of it (steps.mjs `reads: ['public/**']`), so the vehicle count in public/llms.txt
// or site.webmanifest re-ran both steps on every id. The page loads at most the directories below. Measured
// 2026-11-01: both tools on 14 ids across the fleet made 978 requests each, none for a public file but the browser's
// own /favicon.ico; of every src module that names a public path, the page loads one, the material painter's client,
// whose worker fetches public/fonts/chakra-petch/ChakraPetch-Bold-Latin.woff2. The two steps key exactly these
// directories, and their server refuses every other public file (tools/served-public.mjs: 403, and the run fails), so a
// new load outside them fails loudly instead of slipping past the keys. A page that needs another directory adds it
// here; the edit moves both steps' keys once.
import { servedPublicOnly } from './served-public.mjs';

export const ICONS_PAGE_PUBLIC = Object.freeze(['fonts']);

/** The icons page's server plugin: ICONS_PAGE_PUBLIC's directories of public/, any other public file refused. */
export const iconsPagePublicOnly = (refused) => servedPublicOnly({ dirs: ICONS_PAGE_PUBLIC }, refused);
