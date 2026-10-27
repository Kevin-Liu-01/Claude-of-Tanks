// modePicker.ts — the one battle-mode picker (INTERACTION-REDESIGN.md part C; line 1, and line 2's "a mode's rules
// card"). Copyright © 2026 Kevin B. Liu.
//
// The Rooms host and Deploy choose a battle mode here. The cards are the kit picker's (components/picker.ts): each
// mode's glyph in its own hue (tokens --mode-<id>), its name and its first two rules. Beside them one preview shows the
// rules card of the mode under the pointer or the focus: its sentence and every rule line the battle keeps, which the
// caller reads from sim/matchRuleset.ts. Leaving the cards restores the chosen mode; one press chooses it.

import { createPicker, type PickerItem, type PickerText } from './components/picker.ts';
import { esc } from './components/escape.ts';
import { icon } from './icons/icon.ts';
import { t } from './i18n.ts';
import { matchRulesetFor, rulesetLines, type TeamArrangement } from '../sim/matchRuleset.ts';
import type { GameModeId } from '../sim/matchModes.ts';

/** A mode as its card shows it; `description` and `rules` fill the preview's rules card. */
export interface ModeCard extends PickerItem {
  readonly description: string;
  readonly rules: readonly string[];
}

interface ModePickerOptions {
  /** The registry id (src/ui/interactionRegistry.ts): one per surface. */
  readonly id: string;
  readonly label: string;
  /** In the one presentation order (sim/gameModeCatalog.ts MODE_PRESENTATION_ORDER). */
  readonly cards: readonly ModeCard[];
  readonly value: string;
  readonly text: PickerText;
  /** 'list' (the default: a name over its rules) or 'cards' (each mode's picture above them, as Deploy shows its modes). */
  readonly layout?: 'list' | 'cards';
  /** Given, the surface shows the rules card itself (Deploy's plate is its chosen mode's rules card): the mode under the
   *  pointer or the focus, or null for the chosen one. The picker then draws no rules card of its own. */
  readonly onPreview?: (card: ModeCard | null) => void;
  readonly onChoose: (id: string) => void;
}

export interface ModePicker {
  setCards(cards: readonly ModeCard[], value?: string): void;
  setValue(id: string): void;
  focus(): void;
  dispose(): void;
}

/** A mode's rule lines, as its card and its rules card read them: the lines sim/matchRuleset.ts generates from the table
 *  the battle reads, so a card never promises a rule the battle does not keep (the team arrangement as the player set it,
 *  the nation as copy). The Rooms host's mode cards read them. */
export function modeRuleLines(id: GameModeId, arrangement: TeamArrangement | null): string[] {
  return rulesetLines(matchRulesetFor(id, null, arrangement)).map((line) => t(`rules.line.${line.key}`,
    line.key === 'enemyNation' ? { value: t(`campaign.enemy.${line.values.value}`) }
      : line.key === 'teamsMono' ? { scope: t(`rules.teams.scope.${line.values.scope}`) } : { ...line.values }));
}

/** Favourites and recents belong to the player, not the surface: one memory for every mode picker. */
const MEMORY = 'mode';

export function createModePicker(host: HTMLElement, options: ModePickerOptions): ModePicker {
  let cards = options.cards;
  let value = options.value;
  host.classList.add('cot-mp');
  // the rules card is the cards' echo, so assistive tech reads the chosen option, not this figure
  host.innerHTML = '<div class="cot-mp__in"><figure class="cot-mp__preview" aria-hidden="true"><span class="cot-mp__glyph"></span>'
    + '<figcaption><b class="cot-mp__name"></b><p class="cot-mp__desc"></p><ul class="cot-mp__rules"></ul></figcaption></figure>'
    + '<div class="cot-mp__cards"></div></div>';
  const glyph = host.querySelector<HTMLElement>('.cot-mp__glyph')!;
  const name = host.querySelector<HTMLElement>('.cot-mp__name')!;
  const description = host.querySelector<HTMLElement>('.cot-mp__desc')!;
  const rules = host.querySelector<HTMLElement>('.cot-mp__rules')!;
  // a surface that shows the rules card itself keeps none here
  if (options.onPreview) host.querySelector('.cot-mp__preview')?.remove();
  /** The card under the pointer or the focus, which an update from outside keeps in the preview. */
  let previewed: ModeCard | null = null;

  /** Show one mode's rules card: the chosen one when nothing is previewed. */
  const show = (card: ModeCard | null): void => {
    if (options.onPreview) { options.onPreview(card); return; }
    const next = card ?? cards.find((item) => item.id === value) ?? null;
    glyph.innerHTML = next?.glyph ? icon(next.glyph, { size: 32 }) : '';
    if (next?.tone) glyph.dataset.modeTone = next.tone; else delete glyph.dataset.modeTone;
    name.textContent = next?.name ?? '';
    description.textContent = next?.description ?? '';
    rules.innerHTML = (next?.rules ?? []).map((rule) => `<li>${esc(rule)}</li>`).join('');
  };

  const picker = createPicker(host.querySelector<HTMLElement>('.cot-mp__cards')!, {
    id: options.id,
    label: options.label,
    items: cards,
    value,
    layout: options.layout ?? 'list',
    text: options.text,
    memory: MEMORY,
    onPreview: (item) => { previewed = item as ModeCard | null; show(previewed); },
    onChoose: (item) => {
      value = item.id;
      previewed = null;
      show(null);
      options.onChoose(item.id);
    },
  });
  show(null);

  return {
    setCards(next, nextValue): void {
      cards = next;
      if (nextValue !== undefined) value = nextValue;
      picker.setItems(next, value);
      show(previewed);
    },
    setValue(id): void {
      value = id;
      picker.setValue(id);
      show(previewed);
    },
    focus(): void { picker.focus(); },
    dispose(): void {
      picker.dispose();
      host.replaceChildren();
      host.classList.remove('cot-mp');
    },
  };
}
