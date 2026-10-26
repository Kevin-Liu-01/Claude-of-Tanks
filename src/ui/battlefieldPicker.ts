// battlefieldPicker.ts — the one battlefield picker (INTERACTION-REDESIGN.md part A; owner 2026-10-26: "make map selection much
// more intituitve"). Copyright © 2026 Kevin B. Liu.
//
// Deploy, the Rooms host, the Studio and the proving ground choose a battlefield here. The cards are the kit picker's
// (components/picker.ts): each battlefield's own picture, its name and two facts, the caller's cards already narrowed to
// the chosen mode, Random first, chips for the biomes, Favourites and Recent remembered across every surface. Beside
// the cards one large preview shows the battlefield under the pointer or the focus: its picture, and inset in its corner
// its tactical map with the chosen mode's opening objectives (deployObjectives.ts, the Deploy screen's own drawing).
// Leaving the cards restores the chosen battlefield; one press chooses it. Nothing opens a dialog.

import { createPicker, type PickerFilter, type PickerItem, type PickerText } from './components/picker.ts';
import { esc } from './components/escape.ts';
import { minimapAssetUrl } from './minimapAssetUrl.ts';
import { createUiCanvas } from './uiCanvas.ts';

/** A battlefield as its cards show it; `hero` is the preview's larger picture (the card's poster when absent). */
export interface BattlefieldCard extends PickerItem {
  readonly hero?: string;
}

interface BattlefieldPickerOptions {
  /** The registry id (src/ui/interactionRegistry.ts): one per surface. */
  readonly id: string;
  readonly label: string;
  /** In display order, narrowed to the battlefields the mode plays; the Random card (randomId) first where it may be chosen. */
  readonly cards: readonly BattlefieldCard[];
  readonly value: string | null;
  /** The chosen mode: the preview draws its opening objectives. */
  readonly mode: string;
  readonly randomId?: string;
  readonly filters?: readonly PickerFilter[];
  readonly text: PickerText;
  readonly onChoose: (id: string) => void;
  /** The card under the pointer or the focus, or null when it leaves: a caller whose space hides the preview (a narrow
   *  host, under 520 px) shows it in its own place (the Studio's battlefield card). */
  readonly onPreview?: (card: BattlefieldCard | null) => void;
}

export interface BattlefieldPicker {
  setCards(cards: readonly BattlefieldCard[], mode: string, value?: string | null): void;
  setValue(id: string | null): void;
  focus(): void;
  dispose(): void;
}

/** Favourites and recents belong to the player, not the surface: one memory for every battlefield picker. */
const MEMORY = 'battlefield';

export function createBattlefieldPicker(host: HTMLElement, options: BattlefieldPickerOptions): BattlefieldPicker {
  let cards = options.cards;
  let mode = options.mode;
  let value = options.value;
  host.classList.add('cot-bf');
  // the preview is the cards' echo, so assistive tech reads the chosen option, not this figure
  host.innerHTML = '<div class="cot-bf__in"><figure class="cot-bf__preview" aria-hidden="true">'
    + '<div class="cot-bf__hero cot-c-media cot-c-media--soft"><img alt="" decoding="async">'
    + '<div class="cot-bf__map" hidden><img alt="" decoding="async"></div></div>'
    + '<figcaption class="cot-bf__cap"><b class="cot-bf__name"></b><span class="cot-bf__facts"></span></figcaption></figure>'
    + '<div class="cot-bf__cards"></div></div>';
  const hero = host.querySelector<HTMLImageElement>('.cot-bf__hero>img')!;
  const inset = host.querySelector<HTMLElement>('.cot-bf__map')!;
  const plate = inset.querySelector<HTMLImageElement>('img')!;
  // the objectives' canvas is the kit's (uiCanvas: its store follows its box and ratio); deployObjectives.ts draws on it
  const canvas = createUiCanvas(inset, '').canvas;
  const name = host.querySelector<HTMLElement>('.cot-bf__name')!;
  const facts = host.querySelector<HTMLElement>('.cot-bf__facts')!;
  // the objectives' drawer and its data load with the first battlefield shown (they share the HUD's glyph modules)
  let drawer: Promise<typeof import('./deployObjectives.ts')> | null = null;
  let shownId: string | null | undefined;
  /** The card under the pointer or the focus, which an update from outside keeps in the preview. */
  let previewed: BattlefieldCard | null = null;

  /** Show one battlefield in the preview: the chosen one when nothing is previewed. */
  const show = (card: BattlefieldCard | null): void => {
    const next = card ?? cards.find((item) => item.id === value) ?? null;
    if (next?.id === shownId) return;
    shownId = next?.id ?? null;
    const picture = next?.hero ?? next?.media?.poster ?? '';
    if (picture) hero.src = picture; else hero.removeAttribute('src');
    name.textContent = next?.name ?? '';
    facts.innerHTML = (next?.facts ?? []).slice(0, 2).map((fact) => `<span>${esc(fact)}</span>`).join('');
    // Random has no one map to show: its own card's picture, no tactical inset
    const map = next && next.id !== options.randomId ? next.id : null;
    inset.hidden = !map;
    if (!map) return;
    plate.src = minimapAssetUrl(map);
    drawer ??= import('./deployObjectives.ts');
    void drawer.then(({ drawDeployObjectives }) => (shownId === map ? drawDeployObjectives(canvas, map, mode) : undefined))
      .catch(() => { /* the bare tactical map */ });
  };

  const picker = createPicker(host.querySelector<HTMLElement>('.cot-bf__cards')!, {
    id: options.id,
    label: options.label,
    items: cards,
    value,
    layout: 'cards',
    text: options.text,
    filters: options.filters,
    randomId: options.randomId,
    memory: MEMORY,
    onPreview: (item) => { previewed = item as BattlefieldCard | null; show(previewed); options.onPreview?.(previewed); },
    onChoose: (item) => {
      value = item.id;
      previewed = null;
      shownId = undefined;
      show(null);
      options.onChoose(item.id);
    },
  });
  show(null);

  return {
    setCards(next, nextMode, nextValue): void {
      const same = next.length === cards.length && next.every((card, i) => card.id === cards[i].id && card.name === cards[i].name);
      cards = next;
      mode = nextMode;
      if (nextValue !== undefined) value = nextValue;
      // an update that changes only the mode or the choice (a room's every render) keeps the grid, its scroll and the
      // player's focus; the preview redraws its objectives for the mode
      if (same) picker.setValue(value); else picker.setItems(next, value);
      shownId = undefined;
      show(previewed);
    },
    setValue(id): void {
      value = id;
      picker.setValue(id);
      shownId = undefined;
      show(previewed);
    },
    focus(): void { picker.focus(); },
    dispose(): void {
      picker.dispose();
      host.replaceChildren();
      host.classList.remove('cot-bf');
    },
  };
}
