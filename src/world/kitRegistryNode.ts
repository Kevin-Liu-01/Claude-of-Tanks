// src/world/kitRegistryNode.ts — the kit registries' synchronous loader under Node (2026-10-15, the perf lane).
// The architecture styles (maps/regional/index.ts) and the set-piece builders (landmarks/index.ts) are lazy chunks in the
// browser: a battle entry loads the kits its map builds (map.ts createMapAsync). Node runs the synchronous builders — the
// headless collision builds, the server's world, the receipts, the bake tools — which need every kit at once, so under
// Node each registry requires every module of its table synchronously (require of an ES module, Node 22.12+), in the
// table's order, while the registry itself evaluates: exactly when, and in the order, its static imports ran.
// Anywhere else (a page, a worker) this answers null and the registry loads on demand — and so does a Node run under
// COT_KITS_LAZY=1, the lab that builds every map the browser's way (worldKits.ts loadMapKits, then the build).
type NodeProcess = { versions?: { node?: string }; env?: Record<string, string | undefined>; getBuiltinModule?: (id: string) => unknown };
type NodeModule = { createRequire(url: string): (id: string) => Record<string, unknown> };

/** A synchronous `require` resolving beside `url` (the registry's import.meta.url) under Node; null in a browser or a worker. */
export function nodeKitRequire(url: string): ((id: string) => Record<string, unknown>) | null {
  const proc = (globalThis as { process?: NodeProcess }).process;
  if (!proc?.versions?.node || typeof proc.getBuiltinModule !== 'function' || proc.env?.COT_KITS_LAZY === '1') return null;
  const nodeModule = proc.getBuiltinModule('node:module') as NodeModule | undefined;
  return nodeModule ? nodeModule.createRequire(url) : null;
}
