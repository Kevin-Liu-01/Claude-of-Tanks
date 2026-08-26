/**
 * Lazy solo-authority boundary. Importing this module intentionally acquires
 * AI, spotting, route planning, collision, movement, and combat integration;
 * garage boot must reach it only through explicit battle/capture intent.
 */
export {
  createCollider,
  prepareNextOpeningRoute,
  setupBattle,
  simStep,
} from './state.js';
