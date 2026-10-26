// camoPicker.ts — the Garage's camo picker (INTERACTION-REDESIGN B; owner 2026-10-26: "make map selection much more
// intituitve, as well as camo"), on the kit picker (components/picker.ts, layout 'swatches').
// Copyright © 2026 Kevin B. Liu.
//
// Every paint the catalog carries shows as a swatch of itself on the selected tank (the Garage's swatch painter, a crop
// of the real pattern tile), named, with its nation and kind as its facts. The kinds are the filter chips: nation service
// coats (the tank's own factory coat first), signatures, seasonal and theatre, special. Auto leads the grid as the set's
// R choice, and "Make your own" (the custom camo studio) is the last swatch. Hovering or focusing a paint tries it on the
// hero (the caller's try-on, game/garageCamoTryOn.ts); one press wears it; favourites and recents are the tank's own
// (memory camo.<specId>). The pure item builder carries what the selftest pins; the controller only adds the swatches.

import { createPicker, type PickerItem, type PickerText } from './components/picker.ts';
import { CUSTOM_CAMO_ID, camoPatternTags } from '../vehicles/camoPolicy.ts';
import type { IconId } from './icons/icon.ts';

export const CAMO_KINDS = Object.freeze(['service', 'signature', 'seasonal', 'special'] as const);
export type CamoKind = typeof CAMO_KINDS[number];
type CamoFactKind = CamoKind | 'auto' | 'custom';

/** A paint's kind: a nation's service coat (its factory delivery, a service or national colourway), a vehicle's
 *  signature, a special (brand, livery, novelty), or a seasonal and theatre pattern (every field pattern else). */
export function camoKindOf(patternId: string, tags: readonly string[]): CamoKind {
  if (patternId === 'factory' || patternId.startsWith('service_') || patternId.startsWith('national_')) return 'service';
  if (patternId === 'signature' || patternId.startsWith('sig_') || tags.includes('signature')) return 'signature';
  if (tags.includes('special')) return 'special';
  return 'seasonal';
}

export interface CamoPickerWords {
  /** A paint's name in the locale. */
  label(patternId: string): string;
  /** The nation a flag tag names ('ua' → 'Ukraine'), or null for any other tag. */
  nationOfTag(tag: string): string | null;
  /** A nation's name in the locale. */
  nationName(nation: string): string;
  kindName(kind: CamoFactKind): string;
  readonly auto: string;
  readonly makeOwn: string;
}

const KIND_GLYPH: Readonly<Record<CamoKind, IconId>> = Object.freeze({
  service: 'globe', signature: 'stamp', seasonal: 'regionWoodland', special: 'spray',
});

/**
 * The picker's items for one tank: Auto first, the catalog's paints in its order (each named, its nation and kind as its
 * facts, its kind and tags to filter by), and "Make your own" last when the custom studio is there.
 */
export function camoPickerItems(patterns: readonly string[], nation: string | null, words: CamoPickerWords,
  { custom }: { custom: boolean }): PickerItem[] {
  const items: PickerItem[] = [];
  for (const id of patterns) {
    if (id === CUSTOM_CAMO_ID) continue;
    if (id === 'auto') {
      items.unshift({ id, name: words.auto, facts: [words.kindName('auto')], tags: ['auto'] });
      continue;
    }
    const tags = camoPatternTags(id, nation);
    const kind = camoKindOf(id, tags);
    const flag = tags.map((tag) => words.nationOfTag(tag)).find((value): value is string => Boolean(value)) ?? null;
    items.push({ id, name: words.label(id), facts: flag ? [words.nationName(flag), words.kindName(kind)] : [words.kindName(kind)],
      tags: [kind, ...tags] });
  }
  if (custom) items.push({ id: CUSTOM_CAMO_ID, name: words.makeOwn, glyph: 'brush', facts: [words.kindName('custom')], tags: ['custom'] });
  return items;
}

export function camoPickerFilters(words: CamoPickerWords): { id: CamoKind; label: string; icon: IconId }[] {
  return CAMO_KINDS.map((kind) => ({ id: kind, label: words.kindName(kind), icon: KIND_GLYPH[kind] }));
}

interface GarageCamoPickerOptions {
  /** The registry id (src/ui/interactionRegistry.ts), stamped as data-picker: garage-camo, and studio-camo to come. */
  readonly id: string;
  readonly host: HTMLElement;
  /** The set's name, for assistive tech. */
  readonly label: string;
  readonly patterns: readonly string[];
  readonly words: CamoPickerWords;
  readonly text: PickerText;
  /** The custom camo studio is there: "Make your own" is the last swatch. */
  readonly custom: boolean;
  /** A swatch surface (the Garage's: the kit's UI canvas, drawing its tile to fit its box). */
  createSwatch(): HTMLCanvasElement;
  /** Paint `patternId` as `specId` wears it into `canvas` (the Garage's swatch painter: queued under its frame budget). */
  paintSwatch(canvas: HTMLCanvasElement, specId: string, patternId: string): void;
  /** The paint under the pointer or the focus, or null to put the worn one back (at most once a frame). */
  onPreview(patternId: string | null): void;
  /** A press wore `patternId`. */
  onChoose(patternId: string): void;
  /** "Make your own" was chosen: open the custom camo studio. */
  onMakeOwn(): void;
}

export interface GarageCamoPicker {
  /** Show `specId`'s paints (a nation's coats, its recents and favourites) with `worn` chosen. */
  setTank(specId: string, nation: string | null, worn: string): void;
  /** The worn paint changed elsewhere (the band, the studio). */
  setValue(patternId: string): void;
  focus(): void;
  dispose(): void;
}

/** The camo picker in `host`: the kit picker, its swatches painted for the selected tank and kept while it stays. */
export function createGarageCamoPicker(options: GarageCamoPickerOptions): GarageCamoPicker {
  const { host } = options;
  let picker: ReturnType<typeof createPicker> | null = null;
  let tank: string | null = null;
  let worn: string | null = null;
  // the tank's painted swatches, by paint: a re-render (a filter, a search) moves them back in, never repaints them
  const swatches = new Map<string, HTMLCanvasElement>();
  const swatchFor = (id: string): HTMLCanvasElement => {
    let canvas = swatches.get(id);
    if (!canvas) {
      canvas = options.createSwatch();
      canvas.classList.add('cot-camo-swatch');
      if (tank) options.paintSwatch(canvas, tank, id);
      swatches.set(id, canvas);
    }
    return canvas;
  };
  /** Each option the picker drew without a picture takes its paint's swatch (a microtask after the picker's render). */
  const hydrate = (): void => {
    for (const option of host.querySelectorAll<HTMLElement>('.cot-c-picker__opt[data-id]')) {
      const id = option.dataset.id;
      if (!id || id === CUSTOM_CAMO_ID || option.querySelector('.cot-c-picker__media')) continue;
      const media = document.createElement('span');
      media.className = 'cot-c-picker__media cot-c-media cot-c-media--soft';
      media.appendChild(swatchFor(id));
      option.prepend(media);
    }
  };
  const observer = typeof MutationObserver === 'function' ? new MutationObserver(hydrate) : null;
  observer?.observe(host, { childList: true, subtree: true });

  const mount = (specId: string, nation: string | null): void => {
    picker?.dispose();
    swatches.clear();
    tank = specId;
    picker = createPicker(host, {
      id: options.id,
      label: options.label,
      items: camoPickerItems(options.patterns, nation, options.words, { custom: options.custom }),
      value: worn,
      layout: 'swatches',
      text: options.text,
      filters: camoPickerFilters(options.words),
      randomId: 'auto',
      memory: `camo.${specId}`,
      onPreview: (item) => options.onPreview(item && item.id !== CUSTOM_CAMO_ID ? item.id : null),
      onChoose: (item) => {
        // "Make your own" opens the studio and wears nothing: the worn paint stays the chosen swatch until the studio
        // applies its own
        if (item.id === CUSTOM_CAMO_ID) { picker?.setValue(worn); options.onMakeOwn(); return; }
        worn = item.id;
        options.onChoose(item.id);
      },
    });
    hydrate();
  };

  return {
    setTank(specId, nation, wearing) {
      worn = wearing;
      if (specId === tank && picker) { picker.setValue(wearing); return; }
      mount(specId, nation);
    },
    setValue(patternId) { worn = patternId; picker?.setValue(patternId); },
    focus() { picker?.focus(); },
    dispose() {
      observer?.disconnect();
      picker?.dispose();
      picker = null;
      swatches.clear();
      tank = null;
    },
  };
}
