/**
 * viteGameEntryMeta.ts — the public pages name the game's entry chunk (brand-ui SPEC 8.3, BUI-F7).
 *
 * The landing's Play button may prefetch the game's entry chunk on hover or focus, and only then
 * (src/presentation/publicPages.ts). Its name is content-hashed, so the build writes it into each public page as
 * `<meta name="cot-game-entry" content="/assets/main-<hash>.js">`. The game's own documents gain nothing: the game
 * entry's bytes stay exactly as they were. The dev server writes no meta and prefetches nothing.
 */
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

export const GAME_ENTRY_META = 'cot-game-entry';

/** The entry chunk of the game document (`index.html`, input `main`) in a finished bundle. */
export function gameEntryChunk(bundle: Record<string, { type: string; isEntry?: boolean; name?: string; fileName: string;
  facadeModuleId?: string | null }>, entryHtml: string): string | null {
  const wanted = resolve(entryHtml).replace(/\\/g, '/');
  const chunk = Object.values(bundle).find((item) => item.type === 'chunk' && item.isEntry
    && (item.facadeModuleId ?? '').replace(/\\/g, '/') === wanted);
  return chunk ? `/${chunk.fileName}` : null;
}

/** Insert the meta before `</head>` (once). */
export function withGameEntryMeta(html: string, href: string): string {
  if (html.includes(`name="${GAME_ENTRY_META}"`)) return html;
  return html.replace(/<\/head>/i, `<meta name="${GAME_ENTRY_META}" content="${href}">\n</head>`);
}

export function gameEntryMeta(root = process.cwd()): Plugin {
  const entryHtml = resolve(root, 'index.html');
  return {
    name: 'cot-game-entry-meta',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (!ctx?.bundle || !ctx.filename || resolve(ctx.filename) === entryHtml) return html;
        const href = gameEntryChunk(ctx.bundle as Parameters<typeof gameEntryChunk>[0], entryHtml);
        return href ? withGameEntryMeta(html, href) : html;
      },
    },
  };
}
