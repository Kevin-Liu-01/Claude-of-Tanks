// The Field Manual index's feature videos (docs-refresh-279; Kevin 2026-11-26: "add these videos to docs"): the launch
// clips, each beside the chapter that explains what it shows. Copyright © 2026 Kevin B. Liu.
// The films are on Vercel Blob (src/presentation/blobMedia.ts): a card is written only for an item the manifest has a URL
// for, and the section only when one is, so the page never points at a film that is not uploaded. Each film loads
// nothing until it is played (preload="none"); its poster, a small still in public/, is set when the card nears the
// viewport (src/docs/docs.ts mountFeatureVideos). tools/docs-prerender.mjs writes this into site/docs.html between
// <!--docs:videos--> markers; the static page localizes the data-i18n copy as it does the rest of the index.
import { BLOB_MEDIA, blobMediaItem, type BlobMediaManifest } from '../presentation/blobMedia.ts';
import { t } from '../ui/i18n.ts';

/** The clips in page order: the manifest id, the copy's key, the chapter it explains, and the release a dated clip shows. */
export const FEATURE_VIDEOS: ReadonlyArray<{ readonly id: string; readonly key: string; readonly chapter: string; readonly release?: string }> = [
  { id: 'feature-armour', key: 'armour', chapter: '/docs/combat' },
  { id: 'feature-host-migration', key: 'hostMigration', chapter: '/docs/multiplayer#leaving' },
  { id: 'feature-fleet', key: 'fleet', chapter: '/docs/fleet' },
  { id: 'feature-performance', key: 'performance', chapter: '/docs/rendering' },
  // (Main 2026-11-26) a release's cut is labelled with its release, so it does not read as current later
  { id: 'feature-release-277', key: 'release', chapter: '/docs/build', release: '277' },
];

/** Each chapter link's label: the chapter's own name in the manual. */
const CHAPTER_LABEL: Readonly<Record<string, string>> = {
  '/docs/combat': 'docs.topic.combat.label', '/docs/multiplayer#leaving': 'docs.mp.leaving', '/docs/fleet': 'docs.topic.fleet.label',
  '/docs/rendering': 'docs.topic.rendering.label', '/docs/build': 'docs.topic.build.label',
};

const esc = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const vars = (values: Record<string, string>): string => ` data-i18n-vars='${JSON.stringify(values).replace(/'/g, '&#39;')}'`;

/** The section's markup (English, with its data-i18n keys), or '' when no clip is uploaded yet. */
export function featureVideosMarkup(manifest: BlobMediaManifest = BLOB_MEDIA): string {
  const cards = FEATURE_VIDEOS.flatMap(({ id, key, chapter, release }) => {
    const item = blobMediaItem(id, manifest);
    if (!item?.poster || !item.width || !item.height || !item.durationS) return [];
    const titleKey = `docs.videos.${key}.title`;
    const titleVars: Record<string, string> = release ? { release } : {};
    const seconds = String(Math.round(item.durationS));
    const link = CHAPTER_LABEL[chapter];
    return [`        <figure class="docs-video">`
      + `<video controls playsinline preload="none" width="${item.width}" height="${item.height}" data-feature-video data-poster="${esc(item.poster)}"`
      + ` aria-label="${esc(t(titleKey, titleVars))}" data-i18n-aria-label="${titleKey}"${release ? vars(titleVars) : ''}>`
      + `<source src="${esc(item.url)}" type="${esc(item.type)}"></video>`
      + `<figcaption><strong data-i18n="${titleKey}"${release ? vars(titleVars) : ''}>${esc(t(titleKey, titleVars))}</strong>`
      + `<span data-i18n="docs.videos.${key}.caption">${esc(t(`docs.videos.${key}.caption`))}</span>`
      + `<small><span data-i18n="docs.videos.length"${vars({ seconds })}>${esc(t('docs.videos.length', { seconds }))}</span>`
      + ` · <a class="inline-link" href="${chapter}" data-i18n="${link}">${esc(t(link))}</a></small></figcaption></figure>`];
  });
  if (!cards.length) return '';
  return `    <section class="docs-videos" aria-labelledby="videosTitle">\n`
    + `      <header class="docs-videos-head"><h2 id="videosTitle" data-i18n="docs.videos.title">${esc(t('docs.videos.title'))}</h2>`
    + `<p data-i18n="docs.videos.lede">${esc(t('docs.videos.lede'))}</p></header>\n`
    + `      <div class="docs-video-grid">\n${cards.join('\n')}\n      </div>\n    </section>`;
}
