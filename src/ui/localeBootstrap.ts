import { getLocale } from './i18n.ts';
import { synchronizeLocaleRoute } from './localeRouting.ts';

// This lightweight head entry runs before the playable module graph. A saved
// or browser-selected Chinese locale reaches `/cn/` before the Garage starts.
synchronizeLocaleRoute(getLocale());
