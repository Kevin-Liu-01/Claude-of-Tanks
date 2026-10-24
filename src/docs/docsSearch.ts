// Field Manual search (bui01/src/pages/08-docs .side .search). Copyright © 2026 Kevin B. Liu.
// topics.ts loads this module with the field's first focus or ⌘K, and it loads the reader's locale's index
// (src/docs/searchIndex.<locale>.json: every chapter's title and lede and every section's heading and text, written by
// tools/docs-prerender.mjs), matched in the browser: search costs nothing at first paint. While a query is typed its hits
// take the shelf's place in the side column.
import { getLocale, t } from '../ui/i18n.ts';
import { hrefForLocale } from '../ui/localeRouting.ts';
import type { ManualRecord } from './searchIndex.ts';

export interface ManualEntry {
  readonly href: string;
  readonly title: string;
  readonly chapter: string;
  readonly text: string;
  /** title, chapter and text folded for matching */
  readonly folded: readonly [string, string, string];
}

/** Case and accents folded (Kyū-maru finds "kyu"; full-width Latin finds its ASCII). */
const fold = (text: string): string => text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();

export const entryOf = (href: string, title: string, chapter: string, text: string): ManualEntry =>
  ({ href, title, chapter, text, folded: [fold(title), fold(chapter), fold(text)] });

/** The index's records as search entries. */
export const entriesOf = (records: readonly ManualRecord[]): ManualEntry[] =>
  records.map((record) => entryOf(record.href, record.title, record.chapter, record.text));

/** The reader's locale's index (a chunk of its own, fetched once). */
async function loadEntries(locale: string): Promise<ManualEntry[]> {
  const module = locale === 'zh-CN'
    ? await import('./searchIndex.zh-CN.json', { with: { type: 'json' } })
    : await import('./searchIndex.en-US.json', { with: { type: 'json' } });
  return entriesOf(module.default as readonly ManualRecord[]);
}

/** A query's terms: words in a spaced script; Chinese, written without spaces, matches as typed. */
const termsOf = (query: string): string[] => fold(query).split(/\s+/).filter(Boolean);

/** The entries holding every term, best first: a title hit (most at a word's start), then the chapter, then the text. */
export function searchManual(entries: readonly ManualEntry[], query: string, limit = 8): ManualEntry[] {
  const terms = termsOf(query);
  if (!terms.length) return [];
  const scored: Array<[ManualEntry, number]> = [];
  for (const entry of entries) {
    const [title, chapter, text] = entry.folded;
    let score = 0;
    for (const term of terms) {
      const inTitle = title.indexOf(term), inChapter = chapter.indexOf(term), inText = text.indexOf(term);
      if (inTitle < 0 && inChapter < 0 && inText < 0) { score = 0; break; }
      if (inTitle >= 0) score += inTitle === 0 || title[inTitle - 1] === ' ' ? 10 : 6;
      if (inChapter >= 0) score += 3;
      if (inText >= 0) score += 1 + 1 / (1 + inText / 200);
    }
    if (score > 0) scored.push([entry, score]);
  }
  return scored.sort((a, b) => b[1] - a[1]).slice(0, limit).map(([entry]) => entry);
}

const esc = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pattern = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The text with the query's words marked (on the text as written: a word typed without its accents marks nothing). */
export function markedText(text: string, query: string): string {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return esc(text);
  let out = '', at = 0;
  for (const match of text.matchAll(new RegExp(words.map(pattern).join('|'), 'giu'))) {
    out += `${esc(text.slice(at, match.index))}<mark>${esc(match[0])}</mark>`;
    at = match.index + match[0].length;
  }
  return out + esc(text.slice(at));
}

/** About two lines of the text around the query's first word. */
export function snippetOf(text: string, query: string, room = 64): string {
  const lower = text.toLowerCase();
  const found = query.toLowerCase().split(/\s+/).filter(Boolean).map((word) => lower.indexOf(word)).filter((at) => at >= 0);
  const at = found.length ? Math.min(...found) : 0;
  const start = Math.max(0, at - room), end = Math.min(text.length, start + room * 2);
  return `${start > 0 ? '…' : ''}${text.slice(start, end).trim()}${end < text.length ? '…' : ''}`;
}

export async function mountDocsSearch(root: HTMLElement, input: HTMLInputElement): Promise<void> {
  const side = root.querySelector<HTMLElement>('.dm-side');
  const status = root.querySelector<HTMLElement>('.dm-search__status');
  const list = root.querySelector<HTMLElement>('.dm-search__hits');
  if (!side || !status || !list) return;
  const locale = getLocale();
  const entries = await loadEntries(locale);
  const links = (): HTMLAnchorElement[] => [...list.querySelectorAll<HTMLAnchorElement>('a')];
  const update = (): void => {
    const query = input.value.trim();
    const hits = searchManual(entries, query);
    side.classList.toggle('is-searching', query.length > 0);
    list.hidden = !hits.length;
    list.innerHTML = hits.map((entry) => `<a class="dm-hit" href="${esc(hrefForLocale(entry.href, locale))}">`
      + `<b>${markedText(entry.title, query)}</b><small>${esc(entry.chapter)}</small><span>${markedText(snippetOf(entry.text, query), query)}</span></a>`).join('');
    status.textContent = !query ? '' : hits.length ? t('docs.search.count', { count: hits.length }) : t('docs.search.none');
  };
  input.addEventListener('input', update);
  input.addEventListener('keydown', (event) => {
    const first = links()[0];
    if (event.key === 'ArrowDown' && first) { event.preventDefault(); first.focus(); }
    else if (event.key === 'Enter' && first) { event.preventDefault(); first.click(); }
    else if (event.key === 'Escape' && input.value) { event.preventDefault(); input.value = ''; update(); }
  });
  list.addEventListener('keydown', (event) => {
    const all = links();
    const at = all.indexOf(document.activeElement as HTMLAnchorElement);
    if (at < 0) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const next = at + (event.key === 'ArrowDown' ? 1 : -1);
      (next < 0 ? input : all[Math.min(next, all.length - 1)]).focus();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      input.focus();
    }
  });
  // a hit in this chapter scrolls to its section: the shelf comes back
  list.addEventListener('click', (event) => {
    const link = (event.target as Element | null)?.closest('a');
    if (link && link.pathname === location.pathname) { input.value = ''; update(); }
  });
  update();
}
