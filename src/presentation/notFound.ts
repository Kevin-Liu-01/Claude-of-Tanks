import { getLocale, t } from '../ui/i18n.ts';
import { hrefForLocale } from '../ui/localeRouting.ts';
import type { ManualRecord } from '../docs/searchIndex.ts';
import { localeRouteChanged } from './publicNav.ts';
import { revealStills } from './revealStills.ts';

// the page's still and its four ways out fade in once decoded over their boxes' tone (a failed one keeps the tone)
revealStills(document.querySelectorAll<HTMLImageElement>('.not-found__still, .nf-go > img'));

// The missing page carries the public shell (its bar, menu sheet and footer are static markup written by
// tools/public-shell.mjs); publicNav.ts localizes it, its links and the page's static copy, so this module sets the tab
// title and runs the search. The meta description is localized before JavaScript: the build writes /cn/404.html and the
// middleware serves the localized shell for other /cn misses (src/presentation/localizedHtml.ts).
document.title = t('notFound.metaTitle');

// The search (brand-ui SPEC 12.3.4): the fleet and the Field Manual, matched in the browser. Both indexes load with the
// field's first focus (notFoundIndexes.ts: fleetWall.json and the manual's prebuilt index in the reader's locale), so
// the first paint carries neither. The vehicles lead, then the manual's sections; Enter opens the first hit.
interface FleetRecord { readonly name: string; readonly href: string; readonly entry: { readonly searchText: string } }
interface Hit { readonly kind: 'vehicle' | 'manual'; readonly href: string; readonly title: string; readonly detail: string }
type Search = (query: string) => Hit[];

const fold = (text: string): string => text.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase();
const VEHICLE_HITS = 4;
const MANUAL_HITS = 6;

function loadSearch(): Promise<Search> {
  return Promise.all([import('../docs/docsSearch.ts'), import('./notFoundIndexes.ts')]).then(([docs, indexes]) => {
    const manual = docs.entriesOf((getLocale() === 'zh-CN' ? indexes.manualZh : indexes.manualEn) as readonly ManualRecord[]);
    const vehicles = (indexes.fleet as readonly FleetRecord[]).map((record) => ({ record, name: fold(record.name), text: record.entry.searchText }));
    return (query: string): Hit[] => {
      const terms = fold(query).split(/\s+/).filter(Boolean);
      if (!terms.length) return [];
      const tanks = vehicles.filter((vehicle) => terms.every((term) => vehicle.text.includes(term) || vehicle.name.includes(term)))
        .sort((a, b) => Number(b.name.startsWith(terms[0])) - Number(a.name.startsWith(terms[0])))
        .slice(0, VEHICLE_HITS)
        .map(({ record }): Hit => ({ kind: 'vehicle', href: record.href, title: record.name, detail: t('publicNav.tankGallery') }));
      const sections = docs.searchManual(manual, query, MANUAL_HITS)
        .map((entry): Hit => ({ kind: 'manual', href: entry.href, title: entry.title, detail: t('publicNav.fieldManual') }));
      return [...tanks, ...sections];
    };
  });
}

function mountSearch(form: HTMLFormElement): void {
  const input = form.querySelector<HTMLInputElement>('input[type="search"]');
  const list = form.querySelector<HTMLOListElement>('[data-nf-hits]');
  const empty = form.querySelector<HTMLElement>('[data-nf-empty]');
  const rows = {
    vehicle: form.querySelector<HTMLTemplateElement>('template[data-nf-hit="vehicle"]'),
    manual: form.querySelector<HTMLTemplateElement>('template[data-nf-hit="manual"]'),
  };
  if (!input || !list || !empty || !rows.vehicle || !rows.manual) return;
  let search: Promise<Search> | null = null;
  const load = (): Promise<Search> => (search ??= loadSearch());
  const render = (hits: readonly Hit[], query: string): void => {
    list.replaceChildren(...hits.map((hit) => {
      const row = (rows[hit.kind] as HTMLTemplateElement).content.firstElementChild!.cloneNode(true) as HTMLLIElement;
      const link = row.querySelector('a')!;
      link.href = hrefForLocale(hit.href, getLocale());
      link.querySelector('b')!.textContent = hit.title;
      link.querySelector('small')!.textContent = hit.detail;
      return row;
    }));
    list.hidden = !hits.length;
    empty.hidden = !!hits.length || !query.trim();
  };
  input.addEventListener('focus', () => void load(), { once: true });
  input.addEventListener('input', () => {
    const query = input.value;
    void load().then((find) => { if (input.value === query) render(find(query), query); });
  });
  // the hits are the field's list: they close when the search loses the focus or on Esc (back to the field), reopen when
  // the field takes it again, and the arrows walk them (Down from the field enters them, Up from the first leaves them)
  const links = (): HTMLAnchorElement[] => [...list.querySelectorAll<HTMLAnchorElement>('a')];
  const close = (): void => { list.hidden = true; empty.hidden = true; };
  input.addEventListener('focus', () => {
    if (!input.value.trim()) return;
    if (links().length) list.hidden = false; else empty.hidden = false;
  });
  form.addEventListener('focusout', (event) => { if (!form.contains(event.relatedTarget as Node | null)) close(); });
  form.addEventListener('keydown', (event) => {
    const open = !list.hidden || !empty.hidden;
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      event.stopPropagation();
      close();
      input.focus();
      return;
    }
    if (event.key === 'ArrowDown' && list.hidden && event.target === input && links().length && input.value.trim()) {
      event.preventDefault();
      list.hidden = false;
      return;
    }
    if ((event.key !== 'ArrowDown' && event.key !== 'ArrowUp') || list.hidden) return;
    const all = links();
    const at = all.indexOf(document.activeElement as HTMLAnchorElement);
    const to = event.key === 'ArrowDown' ? Math.min(all.length - 1, at + 1) : at - 1;
    event.preventDefault();
    if (to < 0) input.focus(); else all[to]?.focus();
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const first = list.querySelector<HTMLAnchorElement>('a');
    if (first && !list.hidden) location.assign(first.href);
  });
}

document.querySelectorAll<HTMLFormElement>('form[data-nf-search]').forEach(mountSearch);

// GA4 as on the other public non-game pages (../googleAnalytics.ts gates the production host and Consent Mode), on
// src/analytics.ts's after-idle schedule; this page carries no Vercel Analytics. Self-hosted builds compile it out.
if (import.meta.env.VITE_SELF_HOSTED !== '1' && !localeRouteChanged) {
  window.setTimeout(() => {
    // (analytics that did not arrive are skipped: nothing on the page waits for them)
    const mountGoogleAnalytics = (): void => void import('../googleAnalytics.ts')
      .then((analytics) => analytics.mountGoogleAnalytics()).catch(() => undefined);
    if ('requestIdleCallback' in window) requestIdleCallback(mountGoogleAnalytics, { timeout: 4000 });
    else mountGoogleAnalytics();
  }, 3800);
}
