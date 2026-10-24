// The Gallery's two always-visible facet rows, nations and classes, as markup. gallery.ts renders them on every change,
// and tools/gallery-shell.mjs writes their default state into site/gallery.html, so the first layout already holds
// them (247: on a slow phone they filled in 11 s late and pushed the list and the dossier 64 px down). Pure strings with
// no DOM and no bundler imports, so Node runs them too. Copyright © 2026 Kevin B. Liu.
import { esc } from '../ui/components/escape.ts';
import { icon } from '../ui/icons/icon.ts';
import { flagIconCode } from '../ui/flagCodes.ts';
import { VEHICLE_CLASS_META, VEHICLE_CLASS_ORDER, vehicleFacetLabel } from '../vehicles/vehicleFacets.ts';

type Translate = (key: string) => string;
type VehicleClass = typeof VEHICLE_CLASS_ORDER[number];
type FacetKind = 'flag' | 'chip' | 'named';

/** A facet's button: a flag or a short chip named by its label, or (behind More filters) a glyph beside its own name.
 *  `i18n` carries the static shell's data-i18n attributes, which the build localizes for /cn. */
export function facetButton(attrs: string, pressed: boolean, label: string, content: string, kind: FacetKind,
  disabled = false, i18n = ''): string {
  const cls = kind === 'flag' ? '' : ' class="cot-c-chip"';
  const name = kind === 'named' ? '' : ` aria-label="${esc(label)}"`;
  const body = kind === 'named' ? `${content}<span>${esc(label)}</span>` : content;
  return `<button type="button"${cls} ${attrs} aria-pressed="${pressed}"${name}${i18n} data-ui-sound="toggle"${disabled ? ' disabled' : ''}>${body}</button>`;
}

interface FacetRecord {
  readonly nation: string;
  readonly vehicleClass?: { readonly id: string } | null;
}

/** One flag per nation (the USSR, Russia and USSR/Russia vehicles share one taxonomy, SPEC 12.5): the most vehicles
 *  first, ties by flag code, so every locale shows one order. */
export function nationFlags(records: readonly FacetRecord[]): { codes: string[]; nations: Map<string, string[]> } {
  const nations = new Map<string, string[]>();
  const counts = new Map<string, number>();
  for (const record of records) {
    const code = flagIconCode(record.nation);
    const list = nations.get(code) ?? [];
    if (!list.includes(record.nation)) list.push(record.nation);
    nations.set(code, list);
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  const codes = [...nations.keys()].sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || a.localeCompare(b));
  return { codes, nations };
}

/** The classes the fleet has, in the taxonomy's order. */
export function fleetClasses(records: readonly FacetRecord[]): VehicleClass[] {
  return VEHICLE_CLASS_ORDER.filter((id) => records.some((record) => record.vehicleClass?.id === id));
}

interface NationRowOptions {
  readonly codes: readonly string[];
  readonly nations: ReadonlyMap<string, readonly string[]>;
  readonly selected: string;
  readonly translate: Translate;
  /** The flag image's source, or null in the static shell: its box holds the place and the page fills it in. */
  readonly flagSrc: ((nation: string) => string) | null;
}

const nationName = (nation: string, translate: Translate): string => {
  const key = `nation.${nation}`;
  const name = translate(key);
  return name === key ? nation : name;
};

/** A flag's label: its nations' names, "USSR / Russia" for a shared flag. */
export function flagLabel(code: string, nations: ReadonlyMap<string, readonly string[]>, translate: Translate): string {
  return [...new Set((nations.get(code) ?? []).map((nation) => nationName(nation, translate)))].join(' / ');
}

export function nationFacetsMarkup(options: NationRowOptions): string {
  const { codes, nations, selected, translate, flagSrc } = options;
  const shell = !flagSrc;
  const named = (key: string): string => (shell ? ` data-i18n-aria-label="${key}"` : '');
  return facetButton('data-facet="nation" data-value=""', !selected, translate('gallery.archive.filter.allNations'),
    icon('pixels', { size: 16 }), 'flag', false, named('gallery.archive.filter.allNations'))
    + codes.map((code) => {
      const list = nations.get(code) ?? [];
      const src = flagSrc ? ` src="${esc(flagSrc(list[0] || ''))}"` : '';
      return facetButton(`data-facet="nation" data-value="${esc(code)}"`, selected === code, flagLabel(code, nations, translate),
        `<img class="cot-c-flag"${src} alt="" width="20" height="15" draggable="false">`, 'flag', false,
        list.length === 1 ? named(`nation.${list[0]}`) : '');
    }).join('');
}

export function classFacetsMarkup(classes: readonly VehicleClass[], selected: string, translate: Translate, shell = false): string {
  return classes.map((id) => {
    const meta = VEHICLE_CLASS_META[id];
    const i18n = shell
      ? ` data-i18n-aria-label="${meta.labelKey}" data-i18n="${meta.shortKey}"`
      : '';
    return facetButton(`data-facet="vehicleClass" data-value="${esc(id)}"`, selected === id, vehicleFacetLabel(meta, translate),
      esc(vehicleFacetLabel(meta, translate, { short: true })), 'chip', false, i18n);
  }).join('');
}
