// Every document's viewport bands before its first paint (2026-10-22, nav-perf-240; the owner's web rule "reduce visual
// pops").
//
// The layout CSS reads the body's `data-cot-width`, `data-cot-panels` and friends and the root's `--cot-ui-scale`
// (src/ui/responsiveLayout.ts). A page module wrote them, and a module runs after the browser may already have
// painted: on a cold phone the public top bar painted in its desktop form and re-laid out when the module arrived,
// and the 404 and the landing copy moved with it. This plugin bundles src/ui/responsiveSeed.ts (the same classifier,
// tree-shaken to its first write) into a small IIFE and inlines it as the first element of every document's body,
// so the first frame already has its bands; installResponsiveLayout() keeps them current from there.
import { resolve } from 'node:path';
import { build } from 'rolldown';
import type { Plugin } from 'vite';

const SEED_ENTRY = 'src/ui/responsiveSeed.ts';
/** The marker the inline script carries, so a document is seeded once. */
const SEED_ID = 'cot-responsive-seed';

async function bundleSeed(root: string): Promise<string> {
  const result = await build({
    input: resolve(root, SEED_ENTRY),
    write: false,
    output: { format: 'iife', minify: true },
  });
  const code = result.output[0]?.code?.trim();
  if (!code) throw new Error(`${SEED_ENTRY} bundled to nothing`);
  if (/<\/script/i.test(code)) throw new Error(`${SEED_ENTRY} cannot be inlined: it contains </script`);
  return code;
}

/** `html` with the seed as the first element of its body (unchanged when there is no body or it is seeded already). */
export function injectResponsiveSeed(html: string, code: string): string {
  if (html.includes(`id="${SEED_ID}"`)) return html;
  return html.replace(/<body\b[^>]*>/i, (tag) => `${tag}<script id="${SEED_ID}">${code}</script>`);
}

export function responsiveSeed(): Plugin {
  let root = process.cwd();
  let code: Promise<string> | null = null;
  return {
    name: 'cot-responsive-seed',
    configResolved(config) { root = config.root; },
    transformIndexHtml: {
      order: 'post',
      async handler(html) {
        code ??= bundleSeed(root);
        return injectResponsiveSeed(html, await code);
      },
    },
  };
}
