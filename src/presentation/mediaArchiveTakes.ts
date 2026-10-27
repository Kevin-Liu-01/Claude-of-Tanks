import { t } from '../ui/i18n.ts';

/**
 * A take's title in the locale (media.site50.title.<camelCase id>), for an archive that shows the takes: the manual's
 * wall hands it to mountMediaArchive. Its own module so that only the pages that show takes carry their 126 titles; the
 * Studio's Field frames (battlefield stills and frames) never load them.
 */
export function takeTitle(take: string): string | null {
  const key = `media.site50.title.${take.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase())}`;
  const text = t(key);
  return text === key ? null : text;
}
