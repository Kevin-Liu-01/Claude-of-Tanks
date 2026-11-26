/**
 * viteBattleChunkPrefetch.ts — the game page names the solo battle's code (entry-cpu-278; Kevin 2026-11-25, a friend
 * stuck loading).
 *
 * A cold solo press on a 4 Mbps link spent its first 6 s at 2 % "Surveying terrain" fetching one wave of 196 chunks
 * (2.8 MB on the wire: the world and its kits, effects, the HUD, the warm and start runtimes) with the main thread idle
 * for 4.2 of those seconds (tools/mp-two-peer-e2e.mjs --solo, the fetch table). Those chunks are the static-import
 * closures of the dynamic imports the solo entry makes. The build writes that closure, less the game entry's own boot
 * graph, into the game document as an inert JSON script (`<script type="application/json" id="cot-battle-chunks">`, never
 * executed, so the page's script-src hashes are untouched); src/app/battleChunkPrefetch.ts preloads it behind an
 * interactive Garage at the 'idle' fetch class. Nothing is evaluated before the press: a modulepreload fetches and
 * compiles a module, and the press's own import() then evaluates it from the module map.
 *
 * The roots are source modules. A root the bundle no longer holds fails the build (the list cannot rot silently). Roster
 * and map-specific chunks stay out: they depend on the press (the roster, the map) and the Garage already holds the
 * player's own vehicle.
 */
import { resolve } from 'node:path';
import type { Plugin } from 'vite';

export const BATTLE_CHUNKS_ID = 'cot-battle-chunks';

/** The solo entry's dynamic import targets whose closures the press fetches (the cold winter fetch table's first wave). */
export const BATTLE_CHUNK_ROOTS: readonly string[] = [
  'src/game/soloBattleLoadingRuntime.ts',
  'src/game/soloBattleRuntime.ts',
  'src/game/soloBattleStartRuntime.ts',
  'src/game/battleClientRuntime.ts',
  'src/game/battleVisualStreamer.ts',
  'src/game/battleWarmRuntime.ts',
  'src/game/garageReturnRuntime.ts',
  'src/game/killcam.ts',
  'src/game/armorAimOverlay.ts',
  'src/game/mobileAutoAimRuntime.ts',
  'src/game/missionAttachmentVisual.ts',
  'src/app/battleEndGarageWarm.ts',
  'src/fx/effects.ts',
  'src/ui/hud.ts',
  'src/ui/settings.ts',
  'src/ui/battleNotices.ts',
  'src/ui/damagePanel.ts',
  'src/ui/deployObjectives.ts',
  'src/ui/deployScreen.ts',
  'src/ui/mapLqip.ts',
  'src/vehicles/auxiliaryInventory.ts',
  'src/vehicles/wreckTurretDriver.ts',
  'src/world/map.ts',
  'src/world/maps/index.ts',
];

export interface BundleChunkLike {
  readonly type: string;
  readonly fileName: string;
  readonly isEntry?: boolean;
  readonly facadeModuleId?: string | null;
  readonly moduleIds?: readonly string[];
  readonly imports?: readonly string[];
}

const slash = (path: string): string => path.replace(/\\/g, '/');

/**
 * The chunk files a press would fetch for `roots` (absolute module paths): each root's chunk (its facade, else the chunk
 * holding it) and their static imports, transitively, less the static closure of the entry whose facade is `entry` (an
 * HTML input's entry chunk has the document as its facade, as tools/viteGameEntryMeta.ts reads it).
 * Sorted for a stable document. Throws naming every root no chunk holds.
 */
export function battleChunkFiles(bundle: Record<string, BundleChunkLike>, entry: string, roots: readonly string[]): string[] {
  const chunks = Object.values(bundle).filter((item) => item.type === 'chunk');
  const byFile = new Map(chunks.map((chunk) => [chunk.fileName, chunk]));
  const closure = (start: BundleChunkLike, into: Set<string>): void => {
    const stack = [start.fileName];
    while (stack.length) {
      const file = stack.pop()!;
      if (into.has(file)) continue;
      into.add(file);
      for (const next of byFile.get(file)?.imports ?? []) if (byFile.has(next)) stack.push(next);
    }
  };
  const entryChunk = chunks.find((chunk) => chunk.isEntry && slash(chunk.facadeModuleId ?? '') === slash(entry));
  if (!entryChunk) throw new Error(`battle chunk prefetch: no entry chunk for ${entry}`);
  const boot = new Set<string>();
  closure(entryChunk, boot);
  const wanted = new Set<string>();
  const missing: string[] = [];
  for (const root of roots) {
    const id = slash(root);
    const holder = chunks.find((chunk) => slash(chunk.facadeModuleId ?? '') === id)
      ?? chunks.find((chunk) => (chunk.moduleIds ?? []).some((moduleId) => slash(moduleId) === id));
    if (!holder) { missing.push(root); continue; }
    closure(holder, wanted);
  }
  if (missing.length) throw new Error(`battle chunk prefetch: no chunk holds ${missing.join(', ')} (update BATTLE_CHUNK_ROOTS)`);
  return [...wanted].filter((file) => !boot.has(file)).sort();
}

/** The inert JSON script, before `</head>` (once). */
export function withBattleChunks(html: string, hrefs: readonly string[]): string {
  if (html.includes(`id="${BATTLE_CHUNKS_ID}"`)) return html;
  // (JSON of plain /assets paths holds no '<', so it cannot close the script early)
  return html.replace(/<\/head>/i, `<script type="application/json" id="${BATTLE_CHUNKS_ID}">${JSON.stringify(hrefs)}</script>\n</head>`);
}

export function battleChunkPrefetch(root = process.cwd()): Plugin {
  const entryHtml = resolve(root, 'index.html');
  let base = '/';
  return {
    name: 'cot-battle-chunk-prefetch',
    apply: 'build',
    configResolved(config) { base = config.base || '/'; },
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (!ctx?.bundle || !ctx.filename || resolve(ctx.filename) !== entryHtml) return html;
        const files = battleChunkFiles(ctx.bundle as Record<string, BundleChunkLike>, entryHtml,
          BATTLE_CHUNK_ROOTS.map((path) => resolve(root, path)));
        return withBattleChunks(html, files.map((file) => `${base}${file}`));
      },
    },
  };
}
