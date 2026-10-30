import { createPickerMenu, type PickerMenu } from './components/pickerMenu.ts';
import type { PickerItem } from './components/picker.ts';
import type { SelectMenuController } from './selectPickerMenu.ts';
import { flagIconUrl } from './flags.ts';
import { pickerText } from './pickerText.ts';

/** One nation choice: its value, its name, and the nation whose flag it wears (none: the globe, as AUTO and MIXED). */
interface NationChoice { readonly value: string; readonly name: string; readonly nation?: string }

const nationItems = (choices: readonly NationChoice[]): PickerItem[] => choices.map(({ value, name, nation }) =>
  nation ? { id: value, name, chip: flagIconUrl(nation) } : { id: value, name, glyph: 'globe' });

/** The shared nation menu (the kit's picker menu): each choice by its official flag and name. */
export function createNationMenu(host: HTMLElement, label: string, choices: readonly NationChoice[], value: string,
  onChoose: (value: string) => void): PickerMenu & { setChoices(choices: readonly NationChoice[], value: string): void } {
  const menu = createPickerMenu(host, {
    id: 'nation-dropdown', label, items: nationItems(choices), value, layout: 'list', text: pickerText(),
    onChoose: (item) => onChoose(item.id),
  });
  return { ...menu, setChoices: (next, chosen) => menu.setItems(nationItems(next), chosen) };
}

/** The menu's popover lives in the body: a surface that rebuilds its field disposes the old one. */
export type NationSelectController = SelectMenuController;

/** The nation menu over a canonical <select> (a lobby's arrangement field, the crew voice), which keeps its storage and
 *  its change event; a disabled option is left out of the menu. */
export function createNationSelect(
  select: HTMLSelectElement,
  label: string,
  nationForValue: (value: string) => string | undefined,
): NationSelectController {
  const choices = (): NationChoice[] => [...select.options].filter((option) => !option.disabled)
    .map((option) => ({ value: option.value, name: option.label, nation: nationForValue(option.value) }));
  const host = document.createElement('div');
  host.className = 'cot-nation-menu';
  select.hidden = true; select.tabIndex = -1; select.setAttribute('aria-hidden', 'true');
  select.after(host);
  const menu = createNationMenu(host, label, choices(), select.value, (value) => {
    if (value === select.value) return;
    select.value = value;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  return {
    refresh() { menu.setChoices(choices(), select.value); menu.setDisabled(select.disabled); },
    close: () => menu.close(),
    dispose: () => menu.dispose(),
  };
}
