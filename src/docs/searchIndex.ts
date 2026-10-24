// The Field Manual's search index (tools/docs-prerender.mjs writes it per locale into src/docs/searchIndex.<locale>.json,
// which src/docs/docsSearch.ts loads with the search field's first use). Copyright © 2026 Kevin B. Liu.
// Every chapter and every section in manual order: a chapter's title and lede, each section's heading and text. Node only
// (it runs the data-built chapters' builders, src/docs/chapters).
import { TOPIC_ORDER, topicSectionId, topics } from './topics.ts';
import { richSections } from './chapters/index.ts';

export interface ManualRecord {
  readonly href: string;
  readonly title: string;
  readonly chapter: string;
  readonly text: string;
}

const plain = (text: string): string => text.replace(/`/g, '');

export function manualRecords(): ManualRecord[] {
  return TOPIC_ORDER.flatMap((slug) => {
    const { label, title, lede, sections } = topics[slug];
    const chapter: ManualRecord = { href: `/docs/${slug}`, title, chapter: label, text: plain(lede) };
    // a chapter built from the game's tables indexes its sections as written (their anchors, headings and text)
    const rich = richSections(slug);
    if (rich) return [chapter, ...rich.map((section) => ({ href: `/docs/${slug}#${section.id}`, title: section.title, chapter: label, text: section.text }))];
    return [chapter, ...sections.map(([heading, ...paragraphs], index) => ({
      href: `/docs/${slug}#${topicSectionId(index)}`, title: heading, chapter: label, text: plain(paragraphs.join(' ')),
    }))];
  });
}
