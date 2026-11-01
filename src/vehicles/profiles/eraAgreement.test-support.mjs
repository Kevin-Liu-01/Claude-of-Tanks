// 267 (Main's tanks-suite triage, ruled "armour and visuals agree in both directions"): an id's gameplay ERA plates and
// the ERA clusters its build draws are the same set. Shared by the default-tier receipt (eraSeating.selftest.mjs: the
// negative controls and the held disagreements) and the manual fleet sweep (eraSeatingFleet.selftest.mjs: every id).
// First-party test support: Kevin B. Liu (NOTICE.md).
import { createTank } from '../tankFactory.ts';
import { TANK_SPECS } from '../specs.ts';

/** The gameplay ERA plate names of a spec, sorted. */
export const eraPlateNames = (spec) => [...new Set([...spec.armor.hullPlates, ...spec.armor.turretPlates]
  .filter((plate) => plate.kind === 'era').map((plate) => plate.name))].sort();

/** Both directions: spec ERA plates with nothing drawn on them, and drawn ERA clusters with no plate under them. */
export const eraAgreement = (plates, drawn) => ({
  specUndrawn: plates.filter((name) => !drawn.includes(name)),
  drawnUnspecced: drawn.filter((name) => !plates.includes(name)),
});

/** The ERA clusters an id's build draws (its gameplay clusters), sorted. */
export function drawnEraOf(id) {
  const tank = createTank(id, null, { proceduralOnly: true, quality: 'low', geometryReceipt: true });
  try { return [...(tank.root.userData.eraClusterNames ?? [])].sort(); } finally { tank.dispose(); }
}

/** An id's disagreement, or null when its plates and its drawn ERA agree. */
export function eraDisagreement(id, drawn = drawnEraOf(id)) {
  const found = eraAgreement(eraPlateNames(TANK_SPECS[id]), drawn);
  return found.specUndrawn.length || found.drawnUnspecced.length ? found : null;
}

/** Disagreements held while another lane owns the fix: { id: { specUndrawn: [...], drawnUnspecced: [...] } }. A held id
 * may not gain one and must be removed as it is fixed (both receipts check it exactly). Empty at 267: the fleet agrees. */
export const KNOWN_ERA_DISAGREEMENTS = Object.freeze({});
