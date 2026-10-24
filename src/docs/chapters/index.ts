// The Field Manual's data-built chapters, by topic. Copyright © 2026 Kevin B. Liu.
// Each builder reads the game's own tables and writes its sections as markup. tools/docs-prerender.mjs runs them in Node
// and writes the result into the chapter's page; a page that was not prerendered (or the search index) loads this
// module on demand, so no chapter page carries the builders or their data up front.
import { modesSections } from './modes.ts';
import type { RichSection } from './types.ts';

const BUILDERS: Readonly<Record<string, () => RichSection[]>> = {
  modes: modesSections,
};

/** A data-built chapter's sections, or null for a chapter written as text sections (src/docs/topics.ts). */
export function richSections(slug: string): RichSection[] | null {
  return BUILDERS[slug]?.() ?? null;
}

export type { RichSection } from './types.ts';
