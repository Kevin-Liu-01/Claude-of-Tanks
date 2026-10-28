// selectPickerMenu.ts — a form's <select> on the kit's picker menu (INTERACTION-REDESIGN.md, the picker menu; owner
// 2026-10-27: "audit all dropdowns and ui surfaces and make sure they share components"). Copyright © 2026 Kevin B. Liu.
//
// The <select> keeps its storage and its change event (a room's operation, the arrangement's counts and teams); the kit's
// picker menu stands in its place: the field trigger and its list, each option a row, a disabled option left out, the
// menu a surface on the page's stack. It replaced createCustomSelect, the pre-Premiere select skin with its own popover,
// keys and dismissal: every dropdown in the game is now the one menu.

import { createPickerMenu } from './components/pickerMenu.ts';
import type { PickerItem } from './components/picker.ts';
import { pickerText } from './pickerText.ts';

/** A <select>'s menu: redraw it from the select's options and state, close it, drop it. */
export interface SelectMenuController { refresh(): void; close(): void; dispose(): void }

interface SelectMenuOptions {
  /** The registry id (src/ui/interactionRegistry.ts; the menu's transient surface takes it too). */
  readonly id: string;
  /** The set's name: the select's label by default. */
  readonly label?: string;
}

/** The kit's picker menu over `select`, which it hides and keeps as the field's storage. */
export function createSelectPickerMenu(select: HTMLSelectElement, options: SelectMenuOptions): SelectMenuController {
  const label = options.label ?? select.closest('label')?.querySelector('span')?.textContent ?? select.getAttribute('aria-label') ?? '';
  const items = (): PickerItem[] => [...select.options].filter((option) => !option.disabled)
    .map((option) => ({ id: option.value, name: option.label }));
  const host = document.createElement('div');
  host.className = 'cot-select-menu';
  select.hidden = true;
  select.tabIndex = -1;
  select.setAttribute('aria-hidden', 'true');
  select.after(host);
  const menu = createPickerMenu(host, {
    id: options.id, label, items: items(), value: select.value, layout: 'list', text: pickerText(),
    // as a native select does: input, then change
    onChoose: (item) => {
      if (item.id === select.value) return;
      select.value = item.id;
      select.dispatchEvent(new Event('input', { bubbles: true }));
      select.dispatchEvent(new Event('change', { bubbles: true }));
    },
  });
  // a field that cannot change (a guest's, a room past waiting) reads disabled; one its section hides closes
  const refresh = (): void => {
    menu.setItems(items(), select.value);
    menu.setDisabled(select.disabled);
    if (host.closest('[hidden]')) menu.close();
  };
  select.addEventListener('change', refresh);
  refresh();
  return {
    refresh,
    close: () => menu.close(),
    dispose() { select.removeEventListener('change', refresh); menu.dispose(); },
  };
}
