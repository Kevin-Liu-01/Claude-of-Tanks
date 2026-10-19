// The tank hero cards' lazy boundary: the card module and its stylesheet load together, on demand, from
// the surfaces that show vehicle cards (the Garage roster, the end screen's vehicle tile, the Gallery
// list). Stylesheets load with a dynamic import beside their module, never statically inside its graph
// (runtimeStyles.selftest.mjs): plain-Node selftests cannot load CSS.
// First-party: Kevin B. Liu (NOTICE.md).

export type HeroCardModule = typeof import('./heroCard.ts');

let request: Promise<HeroCardModule> | null = null;

/** The hero card module with its stylesheet applied; one request per page. */
export function loadHeroCards(): Promise<HeroCardModule> {
  request ||= Promise.all([import('./heroCard.ts'), import('./heroCard.css')]).then(([module]) => module);
  return request;
}
