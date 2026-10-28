// The fleet chapter's grid behaviour (owner 2026-10-27: "see and scroll through a grid of literally all tanks laid out and
// filterable with differrent presenntationnn options"). Copyright © 2026 Kevin B. Liu.
// The tiles, the filter bar and the filters' choices are prerendered (src/docs/chapters/fleetGrid.ts); topics.ts loads
// this module at the first sign of use (a pointer or the focus on the bar, or a link that carries filters) and hands it the
// control that was pressed meanwhile. It mounts the kit's picker menu over each filter's drawn trigger in place, filters the
// tiles (each filter, then every search word against the tank's name, aliases and its choices' words in both languages),
// keeps the state in the address (?nation=de&tier=10&view=side, replaced, never pushed) and builds the angle and side
// pictures the first time their presentation is chosen, every one lazy, so only the tiles near the screen fetch theirs.
import { createPickerMenu, type PickerMenu } from '../ui/components/pickerMenu.ts';
import type { PickerItem } from '../ui/components/picker.ts';
import { setRoving, wireRoving } from '../ui/components/components.ts';
import type { IconId } from '../ui/icons/icon.ts';
import { flagIconUrl } from '../ui/flags.ts';
import { pickerText } from '../ui/pickerText.ts';

const FACETS = ['nation', 'tier', 'era', 'class', 'role'] as const;
type Facet = typeof FACETS[number];
const VIEWS = ['hero', 'angle', 'side'] as const;
type View = typeof VIEWS[number];
/** Every value's picker id (a picker item's id is never empty). */
const ALL = 'all';

interface Option { readonly id: string; readonly name: string; readonly count: number; readonly glyph?: IconId; readonly chip?: string }
interface Data {
  readonly total: number;
  readonly facets: ReadonlyArray<{ readonly key: Facet; readonly label: string; readonly options: readonly Option[] }>;
  readonly words: Readonly<Record<string, string>>;
  readonly text: { readonly count: string; readonly total: string };
}

/** Lower case with the accents folded away, so "schutzenpanzer" finds the Schützenpanzer. */
const fold = (text: string): string => text.normalize('NFD').replace(/[̀-ͯ⁠]/g, '').toLocaleLowerCase('en-US');
const escapeText = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
/** The count, a readout: its figures in the data face (.num holds figures only), its words in the reading face. */
const fill = (template: string, values: Record<string, number>): string => template.split(/(\{\w+\})/)
  .map((part) => (/^\{\w+\}$/.test(part) ? `<span class="num">${values[part.slice(1, -1)] ?? ''}</span>` : escapeText(part))).join('');
/** The picture each presentation builds per tile (the sizes the hero card's are written for). */
const SIZES = '(width < 520px) 46vw, (width < 1100px) 30vw, 240px';

function layerMarkup(view: Exclude<View, 'hero'>, id: string, [angle, thumb, side]: readonly string[]): string {
  const picture = view === 'angle'
    ? `<img src="/icons/${id}_angle.webp?v=${angle}" srcset="/icons/thumbs/${id}_angle.webp?v=${thumb} 256w, /icons/${id}_angle.webp?v=${angle} 512w"`
      + ` sizes="${SIZES}" width="512" height="512" alt="" loading="lazy" decoding="async">`
    : `<img src="/icons/${id}_side.webp?v=${side}" width="512" height="256" alt="" loading="lazy" decoding="async">`;
  return `<span class="dm-fleet__layer dm-fleet__${view}" data-layer="${view}" data-reveal>${picture}</span>`;
}

export function mountFleetGrid(root: HTMLElement, pending: () => Element | null): void {
  const source = root.querySelector('#dmFleetData');
  if (!source?.textContent) return;
  const data = JSON.parse(source.textContent) as Data;
  const tiles = [...root.querySelectorAll<HTMLElement>('.dm-fleet__tile')];
  const input = root.querySelector<HTMLInputElement>('[data-fleet-search]');
  const count = root.querySelector<HTMLElement>('[data-fleet-count]');
  const empty = root.querySelector<HTMLElement>('.dm-fleet__empty');
  const views = root.querySelector<HTMLElement>('[data-fleet-views]');

  // each tile's words: its name and aliases, then its choices' words and its design status's
  const words = new Map(tiles.map((tile) => [tile, fold([
    tile.querySelector('.dm-fleet__name')?.textContent ?? '', tile.dataset.aliases ?? '',
    ...FACETS.map((facet) => data.words[`${facet}:${tile.dataset[facet]}`] ?? ''), data.words[`status:${tile.dataset.status}`] ?? '',
  ].join(' '))]));

  const params = new URLSearchParams(location.search);
  const state: Record<Facet, string> = { nation: '', tier: '', era: '', class: '', role: '' };
  for (const facet of FACETS) {
    const value = params.get(facet) ?? '';
    if (data.facets.find((entry) => entry.key === facet)?.options.some((option) => option.id && option.id === value)) state[facet] = value;
  }
  let view: View = (VIEWS as readonly string[]).includes(params.get('view') ?? '') ? params.get('view') as View : 'hero';
  if (input && params.get('q')) input.value = params.get('q') ?? '';

  /** The address carries the grid's state, so a filtered or re-presented grid can be shared. */
  const writeAddress = (): void => {
    const next = new URLSearchParams(location.search);
    for (const facet of FACETS) if (state[facet]) next.set(facet, state[facet]); else next.delete(facet);
    const query = input?.value.trim() ?? '';
    if (query) next.set('q', query); else next.delete('q');
    if (view !== 'hero') next.set('view', view); else next.delete('view');
    const search = next.toString();
    history.replaceState(history.state, '', `${location.pathname}${search ? `?${search}` : ''}${location.hash}`);
  };

  const apply = (): void => {
    const query = fold(input?.value.trim() ?? '').split(/\s+/).filter(Boolean);
    let shown = 0;
    for (const tile of tiles) {
      const hay = words.get(tile) ?? '';
      const on = FACETS.every((facet) => !state[facet] || tile.dataset[facet] === state[facet]) && query.every((word) => hay.includes(word));
      if (tile.hidden === on) tile.hidden = !on;
      if (on) shown++;
    }
    if (count) count.innerHTML = shown === data.total ? fill(data.text.total, { total: data.total }) : fill(data.text.count, { shown, total: data.total });
    if (empty) empty.hidden = shown > 0;
    writeAddress();
  };

  /** A presentation's pictures, built the first time it is chosen. */
  const present = (next: View): void => {
    view = next;
    if (next !== 'hero') {
      for (const tile of tiles) {
        const media = tile.querySelector('.dm-fleet__media');
        if (!media || media.querySelector(`[data-layer="${next}"]`)) continue;
        media.insertAdjacentHTML('beforeend', layerMarkup(next, tile.dataset.id ?? '', (tile.dataset.v ?? '').split(' ')));
      }
    }
    root.dataset.view = next;
    if (views) setRoving(views, next);
  };

  const menus = new Map<Facet, PickerMenu>();
  for (const facet of data.facets) {
    const host = root.querySelector<HTMLElement>(`[data-fleet-facet="${facet.key}"]`);
    if (!host) continue;
    const items: PickerItem[] = facet.options.map((option) => ({
      // no count beside a choice: the grid's own count says what shows (a trigger holds its choice alone, on one line)
      id: option.id || ALL, name: option.name,
      ...(option.chip ? { chip: flagIconUrl(option.chip) } : option.glyph ? { glyph: option.glyph } : {}),
    }));
    menus.set(facet.key, createPickerMenu(host, {
      id: 'docs-fleet-filter', label: facet.label, items, value: state[facet.key] || ALL, layout: 'list', text: pickerText(),
      onChoose: (item) => { state[facet.key] = item.id === ALL ? '' : item.id; apply(); },
    }));
  }

  const clear = (): void => {
    for (const facet of FACETS) { state[facet] = ''; menus.get(facet)?.setValue(ALL); }
    if (input) input.value = '';
    apply();
  };
  root.querySelector('[data-fleet-clear]')?.addEventListener('click', clear);
  let frame = 0;
  input?.addEventListener('input', () => {
    if (frame) return;
    frame = requestAnimationFrame(() => { frame = 0; apply(); });
  });
  if (views) wireRoving(views, (value) => { present(value as View); writeAddress(); });

  if (view !== 'hero') present(view);
  apply();

  // the control pressed while this module loaded: its menu opens, its presentation is chosen, the filters clear
  const pressed = pending();
  const facet = pressed?.closest<HTMLElement>('[data-fleet-facet]')?.dataset.fleetFacet as Facet | undefined;
  if (facet) menus.get(facet)?.open();
  else if (pressed instanceof HTMLElement && pressed.isConnected && (views?.contains(pressed) || pressed.matches('[data-fleet-clear]'))) pressed.click();
}
