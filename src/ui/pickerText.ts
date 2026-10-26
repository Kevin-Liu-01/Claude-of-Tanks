// pickerText.ts — the kit picker's words in the player's locale (components/picker.ts takes translated text and reads
// no catalog). Every picker passes the same words, so search, the favourites and the empty state read alike everywhere.
// Copyright © 2026 Kevin B. Liu.
import type { PickerText } from './components/picker.ts';
import { t } from './i18n.ts';

export function pickerText(): PickerText {
  return {
    search: t('picker.search'),
    favourites: t('picker.favourites'),
    recent: t('picker.recent'),
    favourite: t('picker.favourite'),
    empty: t('picker.empty'),
    clear: t('picker.clear'),
    more: t('picker.more'),
  };
}
