// Shared garage/matchmaking eligibility and pure candidate ordering.
//
// The vehicle registry intentionally contains legacy, QA and generic-source
// entries that remain useful to the tech tree and developer tools. They are
// not part of the curated garage carousel and must never leak into a normal
// player match. Keeping the exclusion policy here gives the garage and the
// battle picker one source of truth.

export const GARAGE_HIDDEN_TANK_IDS = new Set([
  'newc_tiger', 'newc_pziii', 'bmp1', 'm1128', 'm1296', 'm1a2',
  // Generic community placeholders are useful source/QA references, not
  // authored vehicles a player should meet in matchmaking.
  'recon_tank', 'q_heavy',
]);

export const isGarageVisibleTankId = (id) =>
  typeof id === 'string' && !GARAGE_HIDDEN_TANK_IDS.has(id);

/**
 * Curate a pre-shuffled entity pool for a player match.
 *
 * Same-era vehicles always rank ahead of cross-era fallbacks. Within an era,
 * the closest tier ranks first; stable sort preserves the seeded shuffle for
 * equally suitable candidates, so successive battles still feel varied.
 * Hidden/non-garage registry entries are removed before ranking.
 */
export function rankMatchCandidates(candidates, player, tierOf) {
  const playerEra = player && player.spec ? player.spec.era : null;
  const playerTier = tierOf(player.specId);
  return (candidates || [])
    .filter((ent) => ent && ent !== player && isGarageVisibleTankId(ent.specId))
    .map((ent, shuffleIndex) => ({
      ent,
      shuffleIndex,
      sameEra: !playerEra || (ent.spec && ent.spec.era === playerEra),
      tierDelta: Math.abs(tierOf(ent.specId) - playerTier),
    }))
    .sort((a, b) =>
      (a.sameEra === b.sameEra ? 0 : a.sameEra ? -1 : 1) ||
      (a.tierDelta - b.tierDelta) ||
      (a.shuffleIndex - b.shuffleIndex))
    .map((row) => row.ent);
}
