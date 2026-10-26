// heroCardChips.ts — the tier chip every hero card wears (Main 10-26: one DOM chip from the tier table, so a re-tier moves
// every card with no render; players never see a baked tier). The Garage roster draws it in its card; the shared tiles
// (heroCard.ts decorateHeroTile), the Gallery grid and the Field Manual's fleet cards take it from here.
// Copyright © 2026 Kevin B. Liu.
import { t } from './i18n.ts';
import { tierNumeral } from '../techTree/tiers.ts';

/** The chip's words, "Tier X": the word in the data face, the numeral in tungsten. */
export function tierChipHTML(numeral: string): string {
  const text = t('garage.card.tier', { tier: numeral });
  const at = text.lastIndexOf(numeral);
  // a word that leads with its numeral ("IX级") is one word in one colour: a white 级 after an orange IX read as a stray
  // character (the r18 zh critic)
  if (at === 0) return `<b>${text}</b>`;
  return at < 0 ? text : `${text.slice(0, at)}<b>${numeral}</b>${text.slice(at + numeral.length)}`;
}

/** A card's tier chip from the tier table (empty for an untiered vehicle): the class the cards' stylesheets place. */
export function heroTierChipHTML(specId: string): string {
  const numeral = tierNumeral(specId);
  return numeral ? `<span class="hc-tier" aria-hidden="true">${tierChipHTML(numeral)}</span>` : '';
}
