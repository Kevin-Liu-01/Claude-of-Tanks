// src/world/maps/buildScopes.ts — the map kits' ambient build slots, declared in one place (2026-11-02 audit R1).
// A kit keeps its build context in a module-level slot set for the length of one synchronous build: the wear, facade,
// house-plan and member slots (regional/house.ts, facade.ts), the ruin walls, lattices, sill shadow and palette
// (shell.ts, lattice.ts, openings.ts, hessian.ts), the structure kit's craft capture and part tag (structureKit.ts).
// That is sound only while no pacing yield falls inside a scope: a paced build that yielded inside one would hand its
// context to whatever other world build ran before it resumed (the Garage's background build, a rematch prefetch), and
// the 225 part-tag leak showed what a slot that outlives its build does to a world's pieces. Each slot registers here;
// the pacers assert that none is open where they hand control back (props.ts createPropsAsync, regional/index.ts).
// Import-free, so every kit module can register without a cycle.

/** Each slot by name: whether a build is inside its scope now (a module evaluated again replaces its own). */
const scopes = new Map<string, () => boolean>();

/** A kit's slot: `open` reports whether a build is inside its scope now. */
export function registerBuildScope(name: string, open: () => boolean): void {
  scopes.set(name, open);
}

/** The registered slots' names, and the ones open now (diagnostics and receipts). */
export function buildScopeNames(): string[] {
  return [...scopes.keys()];
}
export function openBuildScopes(): string[] {
  const open: string[] = [];
  for (const [name, isOpen] of scopes) if (isOpen()) open.push(name);
  return open;
}

/**
 * Throw when a slot is open at a pacing yield: a kit build must close every scope it opened before it yields. `outer`
 * names slots a caller already held open around this build (a nested build drained in one go), which stay allowed.
 */
export function assertNoBuildScopeOpen(where: string, outer: readonly string[] | null = null): void {
  for (const [name, isOpen] of scopes) {
    if (!isOpen() || outer?.includes(name)) continue;
    throw new Error(`${where}: the ${name} build scope is open at a pacing yield (a kit build closes its scopes before it yields)`);
  }
}
