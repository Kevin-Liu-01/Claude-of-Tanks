/**
 * End every battle-owned presentation lifetime before a resident player tank
 * is reused by the garage. Combat FX owns meshes parented to the tank (impact
 * decals) as well as world-space particles, lights, tracers, prints and
 * timers, while the tank visual owns articulation, damage and LOD state.
 * Reset both owners at the same phase boundary so neither can leak into the
 * showroom.
 *
 * @param {{
 *   fx: {resetAll: () => void},
 *   visual?: {
 *     resetForGaragePresentation?: () => void,
 *     resetDestroyed?: () => void,
 *   } | null,
 * }} deps
 */
export function resetBattleTankForGarage({ fx, visual = null }) {
  if (!fx || typeof fx.resetAll !== 'function') {
    throw new TypeError('garage lifecycle requires an FX reset owner');
  }

  // Run this first: impact decals are children of the battle visual. They
  // must detach before that visual is parked, disposed or adopted as hero.
  fx.resetAll();

  if (!visual) return;
  if (typeof visual.resetForGaragePresentation === 'function') {
    visual.resetForGaragePresentation();
  } else if (typeof visual.resetDestroyed === 'function') {
    // Compatibility for non-procedural/diagnostic visuals that predate the
    // complete showroom lifecycle API.
    visual.resetDestroyed();
  }
}
