// src/world/kitRegistryNode.ts — when the kit registries load every kit at once (2026-10-15, the perf lane).
// The architecture styles (maps/regional/index.ts) and the set-piece builders (landmarks/index.ts) are lazy chunks in the
// browser: a battle entry loads the kits its map builds (worldKits.ts loadMapKits, from map.ts createMapAsync). Node runs
// the synchronous builders — the headless collision builds, the server's world, the receipts, the bake tools — which
// need every kit at once, so under Node each registry imports every module of its table while it evaluates (a top-level
// await, one module after another in the table's order), and every module importing a registry starts with every kit
// in it, as with the static imports. The registry's own dynamic imports keep the module graph a receipt loads (a
// receipt that reloads the kits' graph under a resolve hook reloads the kits with it).
// A page or a worker loads on demand — and so does a Node run under COT_KITS_LAZY=1, the lab that builds every map the
// browser's way (worldKits.ts loadMapKits, then the build).
type NodeProcess = { versions?: { node?: string }; env?: Record<string, string | undefined> };

/** True under Node (outside the COT_KITS_LAZY=1 lab): the registries load every kit while they evaluate. */
export function preloadEveryKit(): boolean {
  const proc = (globalThis as { process?: NodeProcess }).process;
  return !!proc?.versions?.node && proc.env?.COT_KITS_LAZY !== '1';
}
