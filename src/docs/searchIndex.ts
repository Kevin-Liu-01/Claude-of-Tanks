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
/** Chinese prose takes no space after its full-width stops and commas (joined paragraphs or cells would add one). */
const cjkJoined = (text: string): string => text.replace(/([\u3001\u3002\uff01\uff0c\uff1a\uff1b\uff1f\u300d\u300f\uff09])\s+/g, '$1');
/** A chart's axis ticks (runs of four or more bare numbers) say nothing a snippet can use; prose keeps its figures. */
const prose = (text: string): string => cjkJoined(text.replace(/(?:[\d.,%]+\s+){3,}[\d.,%]+/g, ' ').replace(/\s{2,}/g, ' ')).trim();
const decode = (html: string): string => html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
/**
 * A data-built section's searchable text: its prose first, then each table or figure on a line of its own, its cells
 * joined by a middle dot. A table's words still find the section; a snippet keeps to its match's line
 * (docsSearch.ts snippetOf), so it never runs from a sentence into the cells under it.
 */
function sectionText(html: string): string {
  const blocks: string[] = [];
  const body = html.replace(/<(table|figure)\b[\s\S]*?<\/\1>/g, (block) => {
    blocks.push(prose(block.split(/<\/(?:td|th|li|figcaption)>/).map((cell) => decode(cell).replace(/\s+/g, ' ').trim()).filter(Boolean).join(' · ')));
    return ' ';
  });
  return [prose(decode(body)), ...blocks].filter(Boolean).join('\n');
}

export function manualRecords(): ManualRecord[] {
  return TOPIC_ORDER.flatMap((slug) => {
    const { label, title, lede, sections } = topics[slug];
    const chapter: ManualRecord = { href: `/docs/${slug}`, title, chapter: label, text: plain(lede) };
    // a chapter built from the game's tables indexes its sections as written (their anchors, headings and text)
    const rich = richSections(slug);
    if (rich) return [chapter, ...rich.map((section) => ({ href: `/docs/${slug}#${section.id}`, title: section.title, chapter: label, text: sectionText(section.html) }))];
    return [chapter, ...sections.map(([heading, ...paragraphs], index) => ({
      href: `/docs/${slug}#${topicSectionId(index)}`, title: heading, chapter: label, text: plain(cjkJoined(paragraphs.join(' '))),
    }))];
  });
}
