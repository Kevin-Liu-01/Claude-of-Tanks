// One datum, one place, at runtime (UI-LOCKDOWN part C; owner 2026-10-25: "prevent things like that silly double ping
// indicator from happening again"). The browser half of the surface-registry census: after a probe or a gauntlet capture
// sets a screen and state, `datumProblems(page)` collects the visible [data-datum] readouts. Two visible elements of one
// datum fail, a data-datum the registry has no row for fails, and so does a visible live figure (a row's `readout`
// pattern: "42 ms", "fps") outside any [data-datum]. The static half is src/ui/surfaceRegistry.selftest.mjs.
//   import { datumProblems } from '<lane>/tools/datum-census.mjs';
//   problems.push(...await datumProblems(page));                    // the whole page
//   problems.push(...await datumProblems(page, { scope: '.cot-hud, .cot-mp-status' }));
import { SURFACE_REGISTRY } from '../src/ui/surfaceRegistry.ts';

/** Every datum key, and the live figures (each row's `readout`) to find outside any [data-datum]: [datum, RegExp source]. */
export const DATUM_KEYS = Object.keys(SURFACE_REGISTRY);
export const DATUM_READOUTS = Object.entries(SURFACE_REGISTRY).flatMap(([key, row]) => (row.readout ? [[key, row.readout]] : []));

/** Runs in the page (page.evaluate): self-contained, its inputs serialisable. A nested element of the same datum folds
 *  into its outer one (a value inside its readout); `exclude` drops subtrees (a probe's own furniture). Over the whole
 *  page, an open modal (aria-modal, an open <dialog>) is the screen: what its scrim veils is the screen behind it. */
export function datumCensusInPage({ keys, readouts, scope = 'body', exclude = '' }) {
  const shown = (el) => el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
    && el.getBoundingClientRect().width >= 1 && el.getBoundingClientRect().height >= 1;
  const name = (el) => `${el.tagName.toLowerCase()}${el.classList.length ? `.${[...el.classList].join('.')}` : ''}`;
  const known = new Set(keys);
  const patterns = readouts.map(([datum, source]) => [datum, new RegExp(source, 'i')]);
  const modal = scope === 'body'
    ? [...document.querySelectorAll('[aria-modal="true"], dialog[open]')].filter((el) => shown(el)).pop() : null;
  const elements = new Set();
  for (const root of modal ? [modal] : document.querySelectorAll(scope)) {
    for (const el of root.querySelectorAll('*')) elements.add(el);
  }
  const named = new Map();
  const unregistered = [];
  for (const el of elements) {
    if (exclude && el.closest(exclude)) continue;
    const datum = el.dataset?.datum;
    if (datum !== undefined) {
      if (el.parentElement?.closest('[data-datum]')?.dataset.datum === datum || !shown(el)) continue;
      if (!known.has(datum)) { unregistered.push(`${name(el)} data-datum="${datum}" (no registry row)`); continue; }
      const list = named.get(datum) ?? [];
      list.push(name(el));
      named.set(datum, list);
      continue;
    }
    if (el.childElementCount || el.closest('[data-datum]')) continue;
    const text = (el.textContent ?? '').trim();
    if (!text || text.length > 24) continue;
    const hit = patterns.find(([, re]) => re.test(text));
    if (hit && shown(el)) unregistered.push(`${name(el)} "${text}" (a ${hit[0]} figure outside any [data-datum])`);
  }
  const duplicates = [...named].filter(([, list]) => list.length > 1).map(([datum, list]) => `${datum}: ${list.join(', ')}`);
  return { duplicates, unregistered };
}

/** The census of the page as it stands, as problem lines (empty when it holds). */
export async function datumProblems(page, { scope = 'body', exclude = '' } = {}) {
  const { duplicates, unregistered } = await page.evaluate(datumCensusInPage,
    { keys: DATUM_KEYS, readouts: DATUM_READOUTS, scope, exclude });
  return [...duplicates.map((d) => `duplicate datum ${d}`), ...unregistered.map((u) => `unregistered readout ${u}`)];
}
