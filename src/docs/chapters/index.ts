// The Field Manual's data-built chapters, by topic. Copyright © 2026 Kevin B. Liu.
// Each builder reads the game's own tables and writes its sections as markup. tools/docs-prerender.mjs runs them in Node
// and writes the result into the chapter's page; a page that was not prerendered (or the search index) loads this
// module on demand, so no chapter page carries the builders or their data up front.
import { modesSections } from './modes.ts';
import { studioSections } from './studio.ts';
import { audioSections } from './audio.ts';
import { multiplayerSections } from './multiplayer.ts';
import { battlefieldsSections } from './battlefields.ts';
import { combatSections } from './combat.ts';
import { tanksSections } from './tanks.ts';
import { fleetGridSections } from './fleetGrid.ts';
import { startSections } from './start.ts';
import { controlsSections } from './controls.ts';
import type { RichSection } from './types.ts';
import { keepPhrases } from '../designations.ts';

const BUILDERS: Readonly<Record<string, () => RichSection[]>> = {
  modes: modesSections,
  studio: studioSections,
  audio: audioSections,
  multiplayer: multiplayerSections,
  battlefields: battlefieldsSections,
  combat: combatSections,
  tanks: tanksSections,
  fleet: fleetGridSections,
  start: startSections,
  controls: controlsSections,
};

/** A table this wide or wider reflows on a narrow screen instead of scrolling columns off it (chapters.css .dm-table--stack). */
const STACK_COLUMNS = 4;

/**
 * Every data-built table of four or more columns: marked .dm-table--stack, each body cell labelled with its column's
 * header (data-label, which the narrow layout prints before the cell) and every part given its table role, which the
 * reflow's block display would otherwise drop for assistive technology. Narrower tables pass unchanged.
 */
function stackWideTables(html: string): string {
  return html.replace(/<div class="dm-table([^"]*)"([^>]*)><table>([\s\S]*?)<\/table><\/div>/g, (whole, modifiers: string, attributes: string, inner: string) => {
    const head = /<thead><tr>([\s\S]*?)<\/tr><\/thead>/.exec(inner)?.[1] ?? '';
    const labels = [...head.matchAll(/<th\b[^>]*>([\s\S]*?)<\/th>/g)].map(([, label]) => label.replace(/<[^>]+>/g, '').trim());
    if (labels.length < STACK_COLUMNS) return whole;
    const rows = inner
      .replace('<thead><tr>', '<thead role="rowgroup"><tr role="row">')
      .replace(/<th scope="col">/g, '<th scope="col" role="columnheader">')
      .replace(/<tbody>([\s\S]*?)<\/tbody>/, (_, body: string) => `<tbody role="rowgroup">${body.replace(/<tr>([\s\S]*?)<\/tr>/g, (__, cells: string) => {
        let column = 0;
        const labelled = cells.replace(/<(th|td)\b([^>]*)>/g, (___, tag: string, rest: string) =>
          `<${tag}${rest} role="${tag === 'th' ? 'rowheader' : 'cell'}" data-label="${labels[column++] ?? ''}">`);
        return `<tr role="row">${labelled}</tr>`;
      })}</tbody>`);
    return `<div class="dm-table dm-table--stack${modifiers}"${attributes}><table role="table">${rows}</table></div>`;
  });
}

/** A data-built chapter's sections, or null for a chapter written as text sections (src/docs/topics.ts). Its numeric
 *  phrases (7 v 7, 500 m) never break (src/docs/designations.ts). */
export function richSections(slug: string): RichSection[] | null {
  return BUILDERS[slug]?.().map((section) => ({ ...section, html: keepPhrases(stackWideTables(section.html)) })) ?? null;
}

export type { RichSection } from './types.ts';
