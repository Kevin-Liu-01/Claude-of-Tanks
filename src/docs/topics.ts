import { mountDocsIcons, type DocsIconKey } from './docsIcons.ts';
import { icon } from '../ui/icons/icon.ts';
import { getLocale, t } from '../ui/i18n.ts';
import { hrefForLocale } from '../ui/localeRouting.ts';
import { pictureMarkup, stillDataSaver } from '../presentation/responsivePicture.ts';
import type { RichSection } from './chapters/types.ts';
import { keepDesignations, keepPhrases } from './designations.ts';
import { revealStills } from '../presentation/revealStills.ts';
import { importWhenOnline, markLoadFailed, pressFailed } from '../ui/components/loadFailure.ts';

type TopicSection = readonly [string, ...string[]];
type TopicMedia = readonly [string, string];

interface TopicDefinition {
  label: string;
  title: string;
  /** The tab title, the head's own string (metadata.docs<Topic>.title: "<label> · Claude of Tanks"). */
  pageTitle: string;
  lede: string;
  hero: string;
  icon: DocsIconKey;
  sectionIcons: readonly DocsIconKey[];
  sections: readonly TopicSection[];
  media: readonly TopicMedia[];
  /** The sections the two figures follow (default the second and the fourth). */
  mediaAt?: readonly [number, number];
  /** Built from the game's own tables (src/docs/chapters): its sections come from richSections(), not `sections`. */
  rich?: boolean;
  /** One section that takes the whole body (the fleet's grid): no "on this page" rail beside it. */
  full?: boolean;
}

export const TOPIC_ORDER = [
  'start', 'controls', 'modes', 'tanks', 'fleet', 'combat', 'battlefields', 'multiplayer', 'audio', 'studio', 'build', 'simulation', 'models', 'rendering', 'ai', 'filming',
] as const;

export const topics: Record<string, TopicDefinition> = {
  // Every mode, its goal and its rules, from the game's own tables (src/docs/chapters/modes.ts).
  modes: {
    label: t('docs.topic.modes.label'),
    title: t('docs.topic.modes.title'),
    pageTitle: t('metadata.docsModes.title'),
    lede: t('docs.topic.modes.lede'),
    hero: '/media/site50-r14/loops/s21-fields-assault.webm',
    icon: 'modes',
    sectionIcons: [],
    sections: [],
    media: [],
    rich: true,
  },
  // Every action and its keys, touch and Watch mode, from the game's own bindings (src/docs/chapters/controls.ts).
  controls: {
    label: t('docs.topic.controls.label'),
    title: t('docs.topic.controls.title'),
    pageTitle: t('metadata.docsControls.title'),
    lede: t('docs.topic.controls.lede'),
    hero: '/media/site50-r14/loops/s26-minaret-fire.webm',
    icon: 'interface',
    sectionIcons: [],
    sections: [],
    media: [],
    rich: true,
  },
  // A first battle, step by step, with the game's own keys, clocks and counts (src/docs/chapters/start.ts).
  start: {
    label: t('docs.topic.start.label'),
    title: t('docs.topic.start.title'),
    pageTitle: t('metadata.docsStart.title'),
    lede: t('docs.topic.start.lede'),
    hero: '/media/docs-hero-r2/frontier-t90m-leo2a6.webm',
    icon: 'manual',
    sectionIcons: [],
    sections: [],
    media: [],
    rich: true,
  },
  // The fleet by class, role, tier and nation, the equipment and the kits, from the game's tables (src/docs/chapters/tanks.ts).
  tanks: {
    label: t('docs.topic.tanks.label'),
    title: t('docs.topic.tanks.title'),
    pageTitle: t('metadata.docsTanks.title'),
    lede: t('docs.topic.tanks.lede'),
    hero: '/media/site50-r14/loops/s05-barn-advance.webm',
    icon: 'fleet',
    sectionIcons: [],
    sections: [],
    media: [],
    rich: true,
  },
  // Every playable tank in one grid, filtered and presented three ways (src/docs/chapters/fleetGrid.ts, src/docs/fleetGrid.ts).
  fleet: {
    label: t('docs.topic.fleet.label'),
    title: t('docs.topic.fleet.title'),
    pageTitle: t('metadata.docsFleet.title'),
    lede: t('docs.topic.fleet.lede'),
    hero: '/media/site50-r14/loops/s227-oasis-duel.webm',
    icon: 'gallery',
    sectionIcons: [],
    sections: [],
    media: [],
    rich: true,
    full: true,
  },
  // Armour, angling and spotting, charted from the sim's own functions (src/docs/chapters/combat.ts).
  combat: {
    label: t('docs.topic.combat.label'),
    title: t('docs.topic.combat.title'),
    pageTitle: t('metadata.docsCombat.title'),
    lede: t('docs.topic.combat.lede'),
    hero: '/media/site50-r14/loops/s24-ice-duel.webm',
    icon: 'combat',
    sectionIcons: [],
    sections: [],
    media: [],
    rich: true,
  },
  // Every battlefield with its art and landscapes, the rotation, time of day and the Proving Ground (src/docs/chapters/battlefields.ts).
  battlefields: {
    label: t('docs.topic.battlefields.label'),
    title: t('docs.topic.battlefields.title'),
    pageTitle: t('metadata.docsBattlefields.title'),
    lede: t('docs.topic.battlefields.lede'),
    hero: '/maps/fjord.webp',
    icon: 'battlefields',
    sectionIcons: [],
    sections: [],
    media: [],
    rich: true,
  },
  build: {
    label: t('docs.topic.build.label'),
    title: t('docs.topic.build.title'),
    pageTitle: t('metadata.docsBuild.title'),
    lede: t('docs.topic.build.lede'),
    hero: '/media/site50-r14/loops/s23-village-crossroads.webm',
    icon: 'build',
    sectionIcons: ['architecture', 'workflow', 'isolation', 'evidence', 'memory', 'landing'],
    sections: [
      [t('docs.topic.build.s1.t'), t('docs.topic.build.s1.p1'), t('docs.topic.build.s1.p2')],
      [t('docs.topic.build.s2.t'), t('docs.topic.build.s2.p1'), t('docs.topic.build.s2.p2')],
      [t('docs.topic.build.s3.t'), t('docs.topic.build.s3.p1'), t('docs.topic.build.s3.p2')],
      [t('docs.topic.build.s4.t'), t('docs.topic.build.s4.p1'), t('docs.topic.build.s4.p2')],
      [t('docs.topic.build.s5.t'), t('docs.topic.build.s5.p1'), t('docs.topic.build.s5.p2')],
      [t('docs.topic.build.s6.t'), t('docs.topic.build.s6.p1'), t('docs.topic.build.s6.p2')],
    ],
    media: [
      ['/media/ui-246/studio-workspace.webp', t('docs.topic.build.media1')],
      ['/media/site50-r14/frames/sheet-2.webp', t('docs.topic.build.media2')],
    ],
  },
  models: {
    label: t('docs.topic.models.label'),
    title: t('docs.topic.models.title'),
    pageTitle: t('metadata.docsModels.title'),
    lede: t('docs.topic.models.lede'),
    hero: '/media/docs-hero-r2/verdant-challenger3-t80u.webm',
    icon: 'models',
    sectionIcons: ['research', 'construction', 'rig', 'vehicles', 'anatomy', 'iconPipeline', 'critique'],
    sections: [
      [t('docs.topic.models.s1.t'), t('docs.topic.models.s1.p1'), t('docs.topic.models.s1.p2')],
      [t('docs.topic.models.s2.t'), t('docs.topic.models.s2.p1'), t('docs.topic.models.s2.p2')],
      [t('docs.topic.models.s3.t'), t('docs.topic.models.s3.p1'), t('docs.topic.models.s3.p2')],
      [t('docs.topic.models.s7.t'), t('docs.topic.models.s7.p1'), t('docs.topic.models.s7.p2')],
      [t('docs.topic.models.s4.t'), t('docs.topic.models.s4.p1'), t('docs.topic.models.s4.p2')],
      [t('docs.topic.models.s5.t'), t('docs.topic.models.s5.p1'), t('docs.topic.models.s5.p2')],
      [t('docs.topic.models.s6.t'), t('docs.topic.models.s6.p1'), t('docs.topic.models.s6.p2')],
    ],
    media: [
      ['/media/ui-246/gallery-hero.webp', t('docs.topic.models.media1')],
      ['/media/ui-246/garage-closeup.webp', t('docs.topic.models.media2')],
    ],
  },
  ai: {
    label: t('docs.topic.ai.label'),
    title: t('docs.topic.ai.title'),
    pageTitle: t('metadata.docsAi.title'),
    lede: t('docs.topic.ai.lede'),
    hero: '/media/site50-r14/loops/s04-column-under-fire.webm',
    icon: 'ai',
    sectionIcons: ['perception', 'navigation', 'aiming', 'teamwork', 'survival', 'verification'],
    sections: [
      [t('docs.topic.ai.s1.t'), t('docs.topic.ai.s1.p1'), t('docs.topic.ai.s1.p2')],
      [t('docs.topic.ai.s2.t'), t('docs.topic.ai.s2.p1'), t('docs.topic.ai.s2.p2')],
      [t('docs.topic.ai.s3.t'), t('docs.topic.ai.s3.p1'), t('docs.topic.ai.s3.p2')],
      [t('docs.topic.ai.s4.t'), t('docs.topic.ai.s4.p1'), t('docs.topic.ai.s4.p2')],
      [t('docs.topic.ai.s5.t'), t('docs.topic.ai.s5.p1'), t('docs.topic.ai.s5.p2')],
      [t('docs.topic.ai.s6.t'), t('docs.topic.ai.s6.p1'), t('docs.topic.ai.s6.p2')],
    ],
    media: [
      ['/media/site50-r14/stills/s04-column-under-fire-close.webp', t('docs.topic.ai.media1')],
      ['/media/site50-r14/stills/s06-farm-charge.webp', t('docs.topic.ai.media2')],
    ],
  },
  // What each shot, warning and engine tells you, quoted and measured from the audio engine (src/docs/chapters/audio.ts).
  audio: {
    label: t('docs.topic.audio.label'),
    title: t('docs.topic.audio.title'),
    pageTitle: t('metadata.docsAudio.title'),
    lede: t('docs.topic.audio.lede'),
    hero: '/media/site50-r14/loops/s34-furnace-salvo.webm',
    icon: 'audio',
    sectionIcons: [],
    sections: [],
    media: [],
    rich: true,
  },

  simulation: {
    label: t('docs.topic.simulation.label'),
    title: t('docs.topic.simulation.title'),
    pageTitle: t('metadata.docsSimulation.title'),
    lede: t('docs.topic.simulation.lede'),
    hero: '/media/site50-r14/loops/s226-church-duel.webm',
    icon: 'simulation',
    sectionIcons: ['simulation', 'interface', 'perception', 'navigation', 'verification'],
    sections: [
      [t('docs.topic.simulation.s1.t'), t('docs.topic.simulation.s1.p1'), t('docs.topic.simulation.s1.p2')],
      [t('docs.topic.simulation.s7.t'), t('docs.topic.simulation.s7.p1'), t('docs.topic.simulation.s7.p2')],
      [t('docs.topic.simulation.s8.t'), t('docs.topic.simulation.s8.p1'), t('docs.topic.simulation.s8.p2')],
      [t('docs.topic.simulation.s9.t'), t('docs.topic.simulation.s9.p1'), t('docs.topic.simulation.s9.p2')],
      [t('docs.topic.simulation.s6.t'), t('docs.topic.simulation.s6.p1'), t('docs.topic.simulation.s6.p2')],
    ],
    media: [
      ['/media/ui-246/killcam-xray.webp', t('docs.topic.simulation.media1')],
      ['/media/site50-r14/stills/s27-caravanserai-kill.webp', t('docs.topic.simulation.media2')],
    ],
  },

  rendering: {
    label: t('docs.topic.rendering.label'),
    title: t('docs.topic.rendering.title'),
    pageTitle: t('metadata.docsRendering.title'),
    lede: t('docs.topic.rendering.lede'),
    hero: '/media/site50-r14/loops/s20-road-return-fire.webm',
    icon: 'rendering',
    sectionIcons: ['rendering', 'measured', 'device', 'loading', 'profiling', 'performance'],
    sections: [
      [t('docs.topic.rendering.s1.t'), t('docs.topic.rendering.s1.p1'), t('docs.topic.rendering.s1.p2')],
      [t('docs.topic.rendering.s2.t'), t('docs.topic.rendering.s2.p1'), t('docs.topic.rendering.s2.p2')],
      [t('docs.topic.rendering.s3.t'), t('docs.topic.rendering.s3.p1'), t('docs.topic.rendering.s3.p2')],
      [t('docs.topic.rendering.s6.t'), t('docs.topic.rendering.s6.p1'), t('docs.topic.rendering.s6.p2')],
      [t('docs.topic.rendering.s7.t'), t('docs.topic.rendering.s7.p1'), t('docs.topic.rendering.s7.p2')],
      [t('docs.topic.rendering.s5.t'), t('docs.topic.rendering.s5.p1'), t('docs.topic.rendering.s5.p2')],
    ],
    media: [
      ['/media/ui-246/battle-sight.webp', t('docs.topic.rendering.media1')],
      ['/media/site50-r14/stills/s38-church-knockout-close.webp', t('docs.topic.rendering.media2')],
    ],
  },

  // Rooms, codes, the local network, seats and who hosts, from the room service's own rules (src/docs/chapters/multiplayer.ts).
  multiplayer: {
    label: t('docs.topic.multiplayer.label'),
    title: t('docs.topic.multiplayer.title'),
    pageTitle: t('metadata.docsMultiplayer.title'),
    lede: t('docs.topic.multiplayer.lede'),
    hero: '/media/site50-r14/loops/s18-street-knockout.webm',
    icon: 'multiplayer',
    sectionIcons: [],
    sections: [],
    media: [],
    rich: true,
  },

  // Opening, setting, shooting and exporting a scene, from the Studio's own tables and names (src/docs/chapters/studio.ts).
  studio: {
    label: t('docs.topic.studio.label'),
    title: t('docs.topic.studio.title'),
    pageTitle: t('metadata.docsStudio.title'),
    lede: t('docs.topic.studio.lede'),
    hero: '/media/site50-r14/loops/s33-water-tower.webm',
    icon: 'studio',
    sectionIcons: [],
    sections: [],
    media: [],
    rich: true,
  },

  // How the media rounds were filmed (2026-10-06). The second section holds the take viewer and the third the
  // process, both filled by filming.ts; public/media/filming-r1 is built by tools/media-r5/docs-media.mjs.
  filming: {
    label: t('docs.topic.filming.label'),
    title: t('docs.topic.filming.title'),
    pageTitle: t('metadata.docsFilming.title'),
    lede: t('docs.topic.filming.lede'),
    hero: '/media/site50-r14/loops/s07-lake-shellfire.webm',
    icon: 'filming',
    sectionIcons: ['specification', 'filming', 'workflow', 'navigation', 'perception', 'studio', 'critique', 'rendering', 'audio', 'release', 'gallery'],
    sections: [
      [t('docs.topic.filming.s1.t'), t('docs.topic.filming.s1.p1'), t('docs.topic.filming.s1.p2')],
      [t('docs.topic.filming.s2.t'), t('docs.topic.filming.s2.p1')],
      [t('docs.topic.filming.s3.t'), t('docs.topic.filming.s3.p1')],
      [t('docs.topic.filming.s4.t'), t('docs.topic.filming.s4.p1'), t('docs.topic.filming.s4.p2')],
      [t('docs.topic.filming.s5.t'), t('docs.topic.filming.s5.p1'), t('docs.topic.filming.s5.p2')],
      [t('docs.topic.filming.s6.t'), t('docs.topic.filming.s6.p1'), t('docs.topic.filming.s6.p2')],
      [t('docs.topic.filming.s7.t'), t('docs.topic.filming.s7.p1'), t('docs.topic.filming.s7.p2')],
      [t('docs.topic.filming.s8.t'), t('docs.topic.filming.s8.p1'), t('docs.topic.filming.s8.p2')],
      [t('docs.topic.filming.s9.t'), t('docs.topic.filming.s9.p1'), t('docs.topic.filming.s9.p2')],
      [t('docs.topic.filming.s10.t'), t('docs.topic.filming.s10.p1'), t('docs.topic.filming.s10.p2')],
      // (2026-10-19) the media rounds' finals: the library, mounted by filming.ts (its tabs name its collections, so the
      // section carries no paragraph of its own)
      [t('docs.topic.filming.s11.t')],
    ],
    media: [
      ['/media/filming-r1/previz-sheet.webp', t('docs.topic.filming.media1')],
      ['/media/filming-r1/plan-view.webp', t('docs.topic.filming.media2')],
    ],
    mediaAt: [3, 5],
  },
};

// Practical notes no data-built chapter covers, after the chapter's own sections (docs.guide.<key>.t/p1/p2).
const FIELD_GUIDES: Readonly<Record<string, readonly string[]>> = {
  simulation: ['simulation.6'], rendering: ['rendering.1', 'performance.1'], ai: ['ai.1', 'ai.2'],
};
for (const [slug, keys] of Object.entries(FIELD_GUIDES)) {
  const topic = topics[slug];
  const guides: TopicSection[] = keys.map((key) => [t(`docs.guide.${key}.t`), t(`docs.guide.${key}.p1`), t(`docs.guide.${key}.p2`)]);
  topic.sections = [...topic.sections, ...guides];
  topic.sectionIcons = [...topic.sectionIcons, ...guides.map(() => topic.icon)];
}

/** Each figure's intrinsic size, so the page never shifts as a figure loads (tools/media-fallback.selftest.mjs reads
 *  every file's own header against this table). */
export const TOPIC_FIGURE_SIZES: Readonly<Record<string, readonly [number, number]>> = {
  '/media/filming-r1/plan-view.webp': [2000, 594],
  '/media/filming-r1/previz-sheet.webp': [1920, 720],
  '/media/site50-r14/frames/sheet-2.webp': [2400, 540],
  '/media/ui-246/battle-sight.webp': [1920, 1080],
  '/media/ui-246/gallery-hero.webp': [1920, 1080],
  '/media/ui-246/garage-closeup.webp': [1920, 1080],
  '/media/ui-246/killcam-xray.webp': [1920, 1080],
  '/media/ui-246/studio-workspace.webp': [1920, 1080],
};
const DEFAULT_FIGURE_SIZE = [1920, 1080] as const;
/** A figure fills the article column to its block edge, the tables' (about half the screen beside the shelf; the full
 *  width on narrow screens), as the data-built chapters' figures do. */
const FIGURE_SIZES_ATTRIBUTE = '(width < 1100px) 100vw, 60vw';

function mediaFigure([src, caption]: TopicMedia): string {
  const [width, height] = TOPIC_FIGURE_SIZES[src] ?? DEFAULT_FIGURE_SIZE;
  return `<figure class="topic-figure">${pictureMarkup({ src, width, height, alt: caption, sizes: FIGURE_SIZES_ATTRIBUTE })}<figcaption>${keepDesignations(caption)}</figcaption></figure>`;
}

/**
 * The rungs a topic hero's take ships beyond its 1920 loop (brand-ui SPEC 8.3 video ladder): `r960`, the 960 x 540 VP9
 * loop topic headers lead with (≤ 1.8 MB); `phone`, the 960 x 540 H.264 phone rung in web-video-r1, which is also the
 * fallback for a browser without VP9. tools/media-fallback.selftest.mjs holds this table to the files on disk.
 */
export const TOPIC_HERO_RUNGS: Readonly<Record<string, { readonly r960?: true; readonly phone?: true }>> = {
  's05-barn-advance': { r960: true, phone: true },
  's07-lake-shellfire': { r960: true, phone: true },
  's18-street-knockout': { r960: true, phone: true },
  's226-church-duel': { r960: true, phone: true },
  's227-oasis-duel': { r960: true, phone: true },
  's26-minaret-fire': { r960: true, phone: true },
};

/** A loop hero's files and its caption's catalog key, by its collection: a site50-r14 take spreads over the loops, the
 *  stills and web-video-r1 (its rungs in TOPIC_HERO_RUNGS); a docs-hero-r2 take (the media lane's 251 duels) keeps its
 *  whole ladder beside its loop. Null for a still hero. */
export interface TopicHeroLadder {
  readonly take: string;
  readonly captionKey: string;
  readonly poster: string;
  readonly still: string;
  readonly wide: string;
  readonly r960: string | null;
  readonly phone: string | null;
}
/** The trail's separator: the sprite's chevron (never a typed ›). */
const CRUMB = icon('chevronRight', { size: 16 });

export function topicHeroLadder(hero: string): TopicHeroLadder | null {
  const site50 = /^\/media\/site50-r14\/loops\/([\w-]+)\.webm$/.exec(hero)?.[1];
  if (site50) {
    const loops = '/media/site50-r14/loops', rungs = TOPIC_HERO_RUNGS[site50] ?? {};
    return { take: site50, captionKey: `media.site50.title.${camelTake(site50)}`, poster: `${loops}/${site50}.jpg`,
      still: `/media/site50-r14/stills/${site50}-thumb.webp`, wide: hero, r960: rungs.r960 ? `${loops}/${site50}-960.webm` : null,
      phone: rungs.phone ? `/media/web-video-r1/${site50}-mobile.mp4` : null };
  }
  const r2 = /^\/media\/docs-hero-r2\/([\w-]+)\.webm$/.exec(hero)?.[1];
  if (r2) {
    const dir = '/media/docs-hero-r2';
    return { take: r2, captionKey: `media.docsHero.title.${camelTake(r2)}`, poster: `${dir}/${r2}.jpg`, still: `${dir}/${r2}-thumb.webp`,
      wide: hero, r960: `${dir}/${r2}-960.webm`, phone: `${dir}/${r2}-mobile.mp4` };
  }
  return null;
}

/** The inline previews (LQIP) behind the banners' pictures, by path (src/docs/heroLqip.json, tools/hero-lqip.mjs).
 *  tools/docs-prerender.mjs hands them in, so they ride in the served markup and never in this module's bundle. */
let heroLqips: Readonly<Record<string, string>> = {};
export function setTopicHeroLqips(table: Readonly<Record<string, string>>): void { heroLqips = table; }
/** The banner's picture in a box of its own under the kit's reveal from the served markup: it waits over the banner's
 *  preview and fades in once decoded (revealStills below), never painting in bands over a slow link. */
const waitsOverPreview = (markup: string): string => (markup.startsWith('<picture>')
  ? markup.replace('<picture>', '<picture data-reveal>') : `<picture data-reveal>${markup}</picture>`);
/** A banner's preview, on the banner itself (docs.css .dm-banner): its picture fades in over it once decoded. */
function bannerLqip(hero: string): string {
  const lqip = heroLqips[topicHeroLadder(hero)?.poster ?? hero];
  return lqip ? ` style="--dm-banner-lqip:url(&quot;${lqip}&quot;)"` : '';
}

/**
 * A topic header: its take's first frame as the page's LCP picture (a 640 still under data saving, which never plays),
 * and the take's loop over it under the site's one playback policy (src/presentation/mediaPlayer.ts): the 960 rung
 * first, the 1920 loop only on wide screens, the phone rung on phones, nothing by itself under reduced motion or data
 * saving. A still header is the picture alone.
 */
export function topicHeroMarkup(hero: string, alt: string, saving = stillDataSaver()): string {
  const ladder = topicHeroLadder(hero);
  if (!ladder) {
    const [width, height] = TOPIC_FIGURE_SIZES[hero] ?? (hero.startsWith('/maps/') ? [3840, 2160] : DEFAULT_FIGURE_SIZE);
    return waitsOverPreview(pictureMarkup({ src: hero, width, height, alt, eager: true, className: 'topic-hero-poster' }, saving));
  }
  const poster = pictureMarkup({
    src: ladder.poster, rungs: [{ src: ladder.poster, width: 1920 }], width: 1920, height: 1080, alt,
    eager: true, className: 'topic-hero-poster',
    // a phone and data saving show the take's 640 still (the phone pre-scroll budget, SPEC 8.3); the loop crossfades in
    saveData: { src: ladder.still, width: 640 },
    phone: { src: ladder.still, width: 640 },
  }, saving);
  const sources = [
    ladder.r960 ? `<source data-src="${ladder.r960}" type="video/webm">` : '',
    `<source data-src="${ladder.wide}" type="video/webm"${ladder.r960 ? ' data-rung="wide"' : ''}>`,
    ladder.phone ? `<source data-src="${ladder.phone}" type="video/mp4" data-rung="phone">` : '',
  ].join('');
  const label = alt.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  return `${waitsOverPreview(poster)}<video data-media-player muted loop playsinline preload="none" aria-hidden="true" data-label="${label}">${sources}</video>`;
}

/** A text section's paragraph: its `code` spans, its numeric phrases held on one line (src/docs/designations.ts). */
function formatText(text: string): string {
  return keepPhrases(text.replace(/`([^`]+)`/g, '<code>$1</code>'));
}

export function topicSectionId(index: number): string {
  return `topic-section-${index + 1}`;
}

type TopicId = typeof TOPIC_ORDER[number];
type TopicGroupKey = 'play' | 'behind';

/** The manual's two shelves (08-docs .side .grp): what a player meets in the game, and how it is engineered. */
export const TOPIC_GROUPS: ReadonlyArray<{ readonly key: TopicGroupKey; readonly icon: DocsIconKey; readonly topics: readonly TopicId[] }> = [
  { key: 'play', icon: 'combat', topics: ['start', 'controls', 'modes', 'tanks', 'fleet', 'combat', 'battlefields', 'multiplayer', 'audio', 'studio'] },
  { key: 'behind', icon: 'architecture', topics: ['build', 'simulation', 'models', 'rendering', 'ai', 'filming'] },
];
const groupLabel = (key: TopicGroupKey): string => (key === 'play' ? t('docs.group.play') : t('docs.group.behind'));

/** The title in the direction's two voices (08 h1): its first words solid, its last words in the hollow outline. A
 *  Chinese title has no spaces and stays solid (the type package keeps CJK solid, SPEC 4.7). */
const VOICE_TAIL = new Set(['a', 'an', 'the', 'to', 'of', 'for', 'and', 'in', 'on', 'with', 'at', 'by', 'from']);
const CJK = /[\u3400-\u9fff\uf900-\ufaff]/;
/**
 * Each Chinese chapter title (i18nCatalog.zh-CN.json docs.topic.<slug>.title) cut into the phrases a line may break
 * between: the banner keeps a Chinese word whole (docs.css .dm-phrases), so 构建 never splits as 构/建. A title whose
 * phrases no longer spell it (the copy changed) is set whole and breaks where the browser breaks; topics.selftest.mjs
 * holds the two equal.
 */
export const ZH_TITLE_PHRASES: Readonly<Record<TopicId, readonly string[]>> = {
  start: ['从车库', '到胜利'],
  controls: ['全部按键', '与视角'],
  modes: ['全部', '作战方式'],
  tanks: ['车队', '与装备'],
  fleet: ['全部战车，', '并排', '一览'],
  combat: ['炮弹', '如何', '造成', '伤害'],
  battlefields: ['全部', '战场'],
  multiplayer: ['组队', '作战'],
  audio: ['像车组一样', '听见战场'],
  studio: ['拍摄', '你自己的', '战斗'],
  build: ['通过', '可验证', '循环', '构建的', '浏览器', '游戏'],
  simulation: ['每一次', '命中', '都有其', '轨迹'],
  models: ['从参考资料', '到可上场的', '战车'],
  rendering: ['渲染', '可以', '自适应，', '规则', '却不能变'],
  ai: ['一个', '机器人', '控制器，', '覆盖', '所有', '战场'],
  filming: ['五十个', '镜头，', '全部', '在游戏内', '拍摄'],
};
/** The title's two voices: split after its first comma, else at the word break nearest its middle (never leaving a short
 * function word at the end of the first voice); a title with neither stays one voice. A Chinese title splits only after
 * its punctuation (a comma, a semicolon, a colon), never inside a word, and breaks only between its phrases. */
function titleMarkup(title: string, phrases: readonly string[] = []): string {
  if (CJK.test(title)) return cjkTitleMarkup(title, phrases);
  const comma = title.search(/[,，]/);
  let cut = comma > 0 ? comma + 1 : -1;
  if (cut < 0) {
    const breaks = [...title.matchAll(/ /g)].map((match) => match.index ?? 0)
      .filter((at) => !VOICE_TAIL.has(title.slice(0, at).split(' ').pop()?.toLowerCase() ?? ''));
    if (!breaks.length) return `<span>${holdTail(title)}</span>`;
    cut = breaks.reduce((best, at) => (Math.abs(at - title.length / 2) < Math.abs(best - title.length / 2) ? at : best));
  }
  return `<span>${holdTail(title.slice(0, cut).trim())}</span> <span class="t-hollow">${holdTail(title.slice(cut).trim())}</span>`;
}

/** A short function word holds to the word after it (a no-break space), so no line of a title ends on one: a phone sets
 *  the two voices as one balanced run, which had left "HEAR THE BATTLE THE / WAY A CREW DOES" (the manual's r41). */
const holdTail = (text: string): string => text.split(' ').reduce((out, word, index, words) => (index === words.length - 1
  ? out + word : out + word + (VOICE_TAIL.has(word.toLowerCase()) ? '\u00a0' : ' ')), '');

function cjkTitleMarkup(title: string, phrases: readonly string[]): string {
  const marked = phrases.length > 1 && phrases.join('') === title;
  // the voices split after the title's first punctuation, the one boundary the copy itself marks
  const voices = (marked ? phrases : [title]).reduce<string[][]>((out, phrase) => {
    out[out.length - 1].push(phrase);
    if (out.length === 1 && /[，,；;：:]$/.test(phrase)) out.push([]);
    return out;
  }, [[]]).filter((voice) => voice.length);
  if (!marked) {
    const cut = title.search(/[，,；;：:]/) + 1;
    if (cut > 0 && cut < title.length) voices.splice(0, voices.length, [title.slice(0, cut)], [title.slice(cut)]);
  }
  const phrase = marked ? ' class="dm-phrases"' : '';
  const span = (voice: readonly string[], hollow: boolean): string => `<span${hollow ? ` class="t-hollow${marked ? ' dm-phrases' : ''}"` : phrase}>${voice.join('<wbr>')}</span>`;
  // no space between the voices: the first ends on its full-width mark, and a phone sets them on one line
  return voices.map((voice, index) => span(voice, index > 0)).join('');
}

function sectionMarkup(section: TopicSection, index: number, media?: TopicMedia): string {
  const [title, ...paragraphs] = section;
  return `<section class="dm-section" id="${topicSectionId(index)}"><h2>${title}</h2>${paragraphs.map((text) => `<p>${formatText(text)}</p>`).join('')}`
    + `${media ? mediaFigure(media) : ''}</section>`;
}

/** The manual's search: its matching loads with the field's first focus, and Cmd K (Ctrl K elsewhere) goes to the field. */
function mountSearchEntry(root: HTMLElement): void {
  const input = root.querySelector<HTMLInputElement>('.dm-search input');
  if (!input) return;
  // a matching is asked for once, never while offline: one that did not arrive is not asked for again in this document, so
  // the field keeps the kit's error state and its next press reloads the page once online
  const field = input.closest('.dm-search__field') ?? input.parentElement;
  const mount = (): void => importWhenOnline(() => import('./docsSearch.ts').then(({ mountDocsSearch }) => mountDocsSearch(root, input)), () => {
    markLoadFailed([field]);
    field?.addEventListener('pointerdown', () => pressFailed(field));
  });
  input.addEventListener('focus', mount, { once: true });
  document.addEventListener('keydown', (event) => {
    if (event.key.toLowerCase() !== 'k' || !(event.metaKey || event.ctrlKey) || event.altKey || !input.offsetParent) return;
    event.preventDefault();
    input.focus();
    input.select();
  });
  // one key cap a key: the platform's modifier, then K
  const keys = root.querySelector('.dm-search__keys');
  if (keys) keys.innerHTML = t(/Mac|iP(?:hone|ad|od)/.test(navigator.platform) ? 'docs.search.shortcutMac' : 'docs.search.shortcut')
    .split(' ').map((key) => `<kbd class="cot-c-kbd">${key}</kbd>`).join('');
}

/** A table wider than its column scrolls under a fade at its end (chapters.css .dm-table.is-scrollable). */
function markScrollableTables(root: HTMLElement): void {
  if (typeof ResizeObserver !== 'function') return;
  const observer = new ResizeObserver((entries) => {
    for (const { target } of entries) target.classList.toggle('is-scrollable', target.scrollWidth > target.clientWidth + 1);
  });
  for (const box of root.querySelectorAll<HTMLElement>('.dm-table')) observer.observe(box);
}

/**
 * A chart's ticks and units hold the type floor at every width. The SVG scales as a picture (a phone draws the 640-unit
 * chart at about half size), so where it is drawn smaller than its units its type is set in chart units at the inverse of
 * the drawn scale: chapters.css sizes `.dm-chart svg` text as the floor times --dm-chart-k, the chart's units per drawn
 * pixel (never under 1, so a chart drawn at or above its size keeps its type as drawn), measured here.
 */
function counterScaleCharts(root: HTMLElement): void {
  const charts = root.querySelectorAll<SVGSVGElement>('.dm-chart svg');
  if (!charts.length || typeof ResizeObserver !== 'function') return;
  const observer = new ResizeObserver((entries) => {
    for (const { target, contentRect } of entries) {
      const svg = target as SVGSVGElement;
      const units = svg.viewBox.baseVal?.width ?? 0;
      if (units > 0 && contentRect.width > 0) svg.style.setProperty('--dm-chart-k', Math.max(1, units / contentRect.width).toFixed(3));
    }
  });
  for (const svg of charts) observer.observe(svg);
}

/**
 * The narrow layout folds the shelf into one scrolling row (docs.css, under 1100 px). It opens with the current chapter
 * in view and an item's start on the page's gutter (the row's scroll padding), so no item opens cut at the left edge, and
 * without moving the page; each end fades only while the row scrolls on past it (data-scrolled, data-at-end).
 */
function mountShelfRow(shelf: HTMLElement): void {
  const edges = (): void => {
    shelf.toggleAttribute('data-scrolled', shelf.scrollLeft > 1);
    shelf.toggleAttribute('data-at-end', shelf.scrollLeft >= shelf.scrollWidth - shelf.clientWidth - 1);
  };
  const current = shelf.querySelector<HTMLElement>(':scope > a[aria-current="page"]');
  if (current && shelf.scrollWidth > shelf.clientWidth) {
    const style = getComputedStyle(shelf);
    const start = parseFloat(style.scrollPaddingLeft) || 0;
    const end = parseFloat(style.scrollPaddingRight) || 0;
    const origin = shelf.getBoundingClientRect().left - shelf.scrollLeft;
    const at = (item: HTMLElement): number => item.getBoundingClientRect().left - origin;
    // the least scroll that brings the current chapter clear of the row's end fade
    const need = at(current) + current.offsetWidth + end - shelf.clientWidth;
    if (need > 0) {
      // the first item that, set on the gutter, leaves the current chapter in view leads the row
      const lead = [...shelf.querySelectorAll<HTMLElement>(':scope > a')].find((item) => at(item) - start >= need) ?? current;
      shelf.scrollLeft = Math.min(at(lead) - start, shelf.scrollWidth - shelf.clientWidth);
    }
  }
  edges();
  shelf.addEventListener('scroll', edges, { passive: true });
  if (typeof ResizeObserver === 'function') new ResizeObserver(edges).observe(shelf);
}

/** "On this page" follows the reader: the last section to have reached the top third of the screen is the current one.
 *  The observed band runs from far above the screen down to that line, so a jump past several sections (a link, a
 *  search hit) still counts each of them; a thin band at the line missed a section that jumped across it. */
function mountTocSpy(root: HTMLElement): void {
  const links = [...root.querySelectorAll<HTMLAnchorElement>('.dm-toc a[href^="#"]')];
  const targets = links.map((link) => document.getElementById(link.hash.slice(1))).filter((el): el is HTMLElement => el !== null);
  if (!targets.length) return;
  const reached = new Set<Element>();
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) reached.add(entry.target); else reached.delete(entry.target);
    }
    const current = targets.filter((target) => reached.has(target)).pop() ?? targets[0];
    for (const link of links) {
      if (link.hash === `#${current.id}`) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    }
  }, { rootMargin: '100000px 0px -70%' });
  for (const target of targets) observer.observe(target);
}

const camelTake = (take: string): string => take.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());
const isTopicId = (value: string): value is TopicId => (TOPIC_ORDER as readonly string[]).includes(value);

/** A manual route in the page's locale (the Chinese pages are prerendered with /cn links, not rewritten on click). */
const docsHref = (topicId?: string): string => hrefForLocale(topicId ? `/docs/${topicId}` : '/docs', getLocale());

/**
 * A chapter of the Field Manual (bui01/src/pages/08-docs) as markup: the shelf of chapters, the banner (the take under
 * its fade, the breadcrumb, the two-voice title, the take's caption), the reading column (lede, reading time, sections,
 * figures), "on this page" and the neighbouring chapters. DOM-free, so tools/docs-prerender.mjs writes it into each
 * chapter's page at build time in both locales (brand-ui SPEC 12.4: prerendered topics, no client-only stub).
 */
export function topicPageMarkup(slug: TopicId, saving = stillDataSaver(), rich: readonly RichSection[] | null = null): string {
  const topic = topics[slug];
  const group = TOPIC_GROUPS.find((shelf) => shelf.topics.includes(slug)) ?? TOPIC_GROUPS[0];
  const order = TOPIC_GROUPS.flatMap((shelf) => shelf.topics);
  const at = order.indexOf(slug);
  const ladder = topicHeroLadder(topic.hero);
  const caption = ladder ? t(ladder.captionKey) : '';
  const shelves = TOPIC_GROUPS.map((shelf) => `<p class="dm-grp"><span data-doc-icon="${shelf.icon}" data-doc-size="16"></span><span>${groupLabel(shelf.key)}</span></p>`
    + shelf.topics.map((topicId) => `<a href="${docsHref(topicId)}"${topicId === slug ? ' aria-current="page"' : ''}>${topics[topicId].label}</a>`).join('')).join('');
  const reference = REFERENCE_TOPICS.includes(slug);
  if (topic.rich && !rich) throw new Error(`topics: ${slug} is built from the game's tables: pass its richSections()`);
  // the reader starts at the first section: it is the current one before the spy (mountTocSpy) sees a scroll
  const current = (index: number): string => (index === 0 ? ' aria-current="location"' : '');
  const toc = topic.full ? '' : (rich ? rich.map(({ id, title }, index) => `<a href="#${id}"${current(index)}>${title}</a>`)
    : topic.sections.map(([title], index) => `<a href="#${topicSectionId(index)}"${current(index)}>${title}</a>`)).join('')
    + (reference ? `<a href="#reference">${t('docs.reference.vehicles.title')}</a>` : '');
  const [firstFigureAt, secondFigureAt] = topic.mediaAt ?? [1, 3];
  const neighbour = (topicId: TopicId | undefined, side: 'prev' | 'next'): string => (topicId
    ? `<a class="cot-c-btn cot-c-btn--ghost dm-pager__${side}" href="${docsHref(topicId)}"><span data-doc-icon="${topics[topicId].icon}"></span><span>${topics[topicId].label}</span></a>`
    : '');
  // the search field leads the shelf (08 .side .search); docsSearch.ts fills its status and hits
  const search = `<div class="dm-search" role="search"><label class="dm-search__field"><span data-doc-icon="search" data-doc-size="16"></span>`
    + `<input type="search" placeholder="${t('docs.search.placeholder')}" aria-label="${t('docs.search.label')}" aria-controls="dmSearchHits" autocomplete="off" spellcheck="false" enterkeyhint="search">`
    + `<span class="dm-search__keys" aria-hidden="true">${t('docs.search.shortcutMac').split(' ').map((key) => `<kbd class="cot-c-kbd">${key}</kbd>`).join('')}</span></label><p class="dm-search__status" role="status"></p><div class="dm-search__hits" id="dmSearchHits" hidden></div></div>`;
  return `<div class="dm">`
    + `<aside class="dm-side" aria-label="${t('docs.topic.navAria')}"><a class="dm-home" href="${docsHref()}"><span data-doc-icon="manual" data-doc-size="16"></span><span>${t('docs.topic.manualIndex')}</span></a>${search}${shelves}</aside>`
    // the article column is the skip link's target (#main); a loop hero's picture is named by its take, whose caption
    // then stays visual only
    + `<div class="dm-main" id="main" tabindex="-1"><header class="dm-banner"${bannerLqip(topic.hero)}>${topicHeroMarkup(topic.hero, caption || t('docs.topic.heroAlt', { label: topic.label }), saving)}`
    + `<div class="dm-banner__t"><nav class="dm-crumb" aria-label="${t('docs.topic.crumbAria')}"><a href="${docsHref()}">${t('publicNav.fieldManual')}</a>`
    + `<span class="dm-crumb__step"><i aria-hidden="true">${CRUMB}</i><span>${groupLabel(group.key)}</span></span>`
    + `<span class="dm-crumb__step"><i aria-hidden="true">${CRUMB}</i><span aria-current="page">${topic.label}</span></span></nav>`
    + `<h1>${titleMarkup(topic.title, ZH_TITLE_PHRASES[slug])}</h1></div></header>`
    + `<div class="dm-body${topic.full ? ' dm-body--full' : ''}"><article class="dm-article${topic.rich ? ' dm-article--wide' : ''}">`
    + (rich ? rich.map(({ id, title, html }) => `<section class="dm-section" id="${id}"><h2>${title}</h2>${html}</section>`).join('')
      : topic.sections.map((section, index) => sectionMarkup(section, index, topic.media[index === firstFigureAt ? 0 : index === secondFigureAt ? 1 : -1])).join(''))
    + `</article>${topic.full ? '' : `<aside class="dm-toc"><nav aria-label="${t('docs.topic.onThisPage')}">${toc}</nav></aside>`}</div>`
    + `<nav class="dm-pager" aria-label="${t('docs.topic.pagerAria')}">${neighbour(order[at - 1], 'prev')}${neighbour(order[at + 1], 'next')}</nav></div></div>`;
}

const REFERENCE_TOPICS: readonly TopicId[] = ['tanks'];

/**
 * A chapter's hero cards outside the fleet grid (the tanks chapter's classes): the card's flag and tank fade in together
 * once both have decoded, under the kit's reveal sheet (components.css [data-reveal], [data-ready]; the card is served with
 * its data-reveal, chapters/fleet.ts heroCardMarkup, so it waits over its tone before this runs). A card whose picture
 * failed keeps its tone ([data-failed]) and loads again once the browser is back online.
 */
function revealHeroCards(cards: readonly HTMLElement[]): void {
  const settle = (card: HTMLElement): void => {
    const images = [...card.querySelectorAll('img')];
    if (images.some((image) => !image.complete)) return;
    if (images.some((image) => !image.naturalWidth)) { card.setAttribute('data-failed', ''); return; }
    void Promise.all(images.map((image) => image.decode().catch(() => undefined))).then(() => card.setAttribute('data-ready', ''));
  };
  for (const card of cards) {
    card.setAttribute('data-reveal', '');
    for (const image of card.querySelectorAll('img')) for (const type of ['load', 'error']) image.addEventListener(type, () => settle(card));
    settle(card);
  }
  if (cards.length) addEventListener('online', () => {
    for (const card of cards) {
      if (!card.hasAttribute('data-failed')) continue;
      card.removeAttribute('data-failed');
      for (const image of card.querySelectorAll('img')) image.src = image.getAttribute('src') ?? '';
    }
  });
}

/** A reader on the fleet chapter this long has its pictures warmed for a print, this many (a hero card is two) per idle turn. */
const FLEET_WARM_AFTER_MS = 8000;
const FLEET_WARM_BATCH = 12;
/** The address parameters that carry the fleet grid's state (fleetGrid.ts): a link with any loads the grid's code at once. */
const FLEET_PARAMS = ['nation', 'tier', 'era', 'class', 'role', 'q', 'view'];

/**
 * The fleet chapter's grid before its code loads (src/docs/chapters/fleetGrid.ts prerenders it). A tile's picture fades in
 * once it has decoded (its layer's data-ready; a picture that failed is ready too, so none stays hidden), over the tile's
 * own tone. The filters' and presentations' code (fleetGrid.ts) loads at the first sign of use: a pointer over the bar, the
 * focus in it, a touch, or a link that carries the grid's state. A control pressed before it has loaded is handed to it,
 * which then opens that menu or chooses that presentation.
 */
function wireFleetGrid(root: HTMLElement): void {
  root.classList.add('is-live');
  const settle = (layer: Element | null): void => {
    if (!layer || layer.hasAttribute('data-ready')) return;
    const images = [...layer.querySelectorAll('img')];
    if (!images.length || images.some((image) => !image.complete)) return;
    void Promise.all(images.map((image) => image.decode().catch(() => undefined))).then(() => layer.setAttribute('data-ready', ''));
  };
  const onImage = (event: Event): void => {
    if (event.target instanceof HTMLImageElement) settle(event.target.closest('.dm-fleet__layer'));
  };
  // a picture that failed (the link dropped) hides over its tile's tone, never a broken frame, and loads again online
  const failed = new Set<HTMLImageElement>();
  const onError = (event: Event): void => {
    if (!(event.target instanceof HTMLImageElement)) return;
    event.target.setAttribute('data-failed', '');
    failed.add(event.target);
    onImage(event);
  };
  addEventListener('online', () => {
    for (const image of failed) {
      image.removeAttribute('data-failed');
      image.src = image.getAttribute('src') ?? '';
    }
    failed.clear();
  });
  root.addEventListener('load', onImage, true);
  root.addEventListener('error', onError, true);
  // A print draws every tile (fleet.css) but has only the pictures already loaded: Chrome lays it out at once, and loads
  // that beforeprint starts land after it (canvas-ui's PDF probe: 57 of 443 in). So a reader who stays a while has the
  // presentation on screen warmed a few tiles at a time in idle time (never all at once, nothing while the tab is hidden,
  // nothing under data saving); beforeprint still asks for whatever is left.
  const lazyOf = (): HTMLImageElement[] => [...root.querySelectorAll<HTMLImageElement>(`[data-layer="${root.dataset.view ?? 'hero'}"] img[loading="lazy"]`)];
  const idle = (step: () => void): void => {
    if ('requestIdleCallback' in window) requestIdleCallback(step, { timeout: 2000 });
    else setTimeout(step, 200);
  };
  const warm = (): void => {
    if (document.hidden) {
      document.addEventListener('visibilitychange', warm, { once: true });
      return;
    }
    const batch = lazyOf().slice(0, FLEET_WARM_BATCH);
    for (const image of batch) image.loading = 'eager';
    if (batch.length === FLEET_WARM_BATCH) idle(warm);
  };
  if (!stillDataSaver()) setTimeout(() => idle(warm), FLEET_WARM_AFTER_MS);
  addEventListener('beforeprint', () => { for (const image of lazyOf()) image.loading = 'eager'; });
  for (const layer of root.querySelectorAll('.dm-fleet__layer')) settle(layer);

  const bar = root.querySelector<HTMLElement>('.dm-fleet__bar');
  let pressed: Element | null = null;
  let asked = false;
  let mounted = false;
  const load = (): void => {
    // (asked once, never while offline: a module that did not arrive is not asked for again in this document, so the bar
    // keeps the kit's error state and its next press reloads the page once online)
    if (asked) return;
    asked = true;
    importWhenOnline(() => import('./fleetGrid.ts').then(({ mountFleetGrid }) => { mounted = true; mountFleetGrid(root, () => pressed); }),
      () => markLoadFailed([bar]));
  };
  const onEarlyPress = (event: Event): void => {
    const control = event.target instanceof Element ? event.target.closest('button') : null;
    if (mounted || !control) return;
    event.preventDefault();
    event.stopPropagation();
    if (pressFailed(bar)) return;
    pressed = control;
    load();
  };
  for (const type of ['pointerover', 'focusin', 'touchstart'] as const) bar?.addEventListener(type, load, { once: true, passive: true });
  root.addEventListener('click', onEarlyPress, true);
  const params = new URLSearchParams(location.search);
  if (FLEET_PARAMS.some((name) => params.has(name))) load();
}

/**
 * The chapter page's behaviour. A page the build prerendered (tools/docs-prerender.mjs: `data-prerendered` names the
 * chapter and its locale) keeps its markup; a page without it (the topic template, or a locale the build did not write)
 * renders the chapter here first.
 */
function renderTopicPage(): void {
  const last = location.pathname.split('/').filter(Boolean).at(-1) || 'simulation';
  const slug: TopicId = isTopicId(last) ? last : 'simulation';
  const topic = topics[slug];
  document.title = topic.pageTitle;
  const root = document.querySelector<HTMLElement>('#topicRoot');
  if (!root) throw new Error('technical manual topic root is unavailable');
  const prerendered = root.dataset.prerendered === slug && root.dataset.prerenderedLocale === getLocale() && root.querySelector('.dm');
  // data saving swaps the banner's take for its 640 still, which the prerender (written for every reader) does not carry
  if (!prerendered || stillDataSaver()) {
    // a chapter built from the game's tables is always prerendered: its builders run in Node only (src/docs/chapters)
    if (!topic.rich) root.innerHTML = topicPageMarkup(slug);
  }
  wireTopicPage(root, slug);
}

/** The chapter's behaviour over its markup: icons, the contents spy, search, the banner's player and the shelf. */
function wireTopicPage(root: HTMLElement, slug: TopicId): void {
  const reference = REFERENCE_TOPICS.includes(slug);
  mountDocsIcons(root);
  mountTocSpy(root);
  markScrollableTables(root);
  counterScaleCharts(root);
  mountSearchEntry(root);
  const heroVideos = root.querySelectorAll<HTMLVideoElement>('video[data-media-player]');
  // A part is asked for once, never while offline: one whose module did not arrive is not asked for again in this document,
  // and leaves the page as served (the banner's poster, the chapter's prerendered text).
  const whenOnline = (load: () => Promise<unknown>): void => importWhenOnline(load);
  if (heroVideos.length) {
    whenOnline(() => Promise.all([import('../presentation/mediaPlayer.ts'), import('../presentation/mediaPlayer.css')]).then(([{ mountMediaPlayers }]) => mountMediaPlayers(heroVideos,
      (playing, video) => t(playing ? 'publicPages.video.pauseAria' : 'publicPages.video.playAria', { label: video.dataset.label || '' }),
      (playing) => t(playing ? 'publicPages.video.pauseTip' : 'publicPages.video.playTip'))));
  }
  const article = root.querySelector<HTMLElement>('article');
  if (article && reference) {
    whenOnline(() => import('./reference.ts').then(({mountReference}) => mountReference(article, slug)));
  }
  if (article && slug === 'filming') {
    whenOnline(() => import('./filming.ts').then(({mountFilming}) => mountFilming(article)));
  }
  const fleet = article?.querySelector<HTMLElement>('[data-fleet]');
  if (fleet) wireFleetGrid(fleet);
  // the banner's poster and the chapter's figures and hero cards fade in once decoded (the fleet grid's tiles have their own)
  revealStills(root.querySelectorAll<HTMLImageElement>('.dm-banner img, .dm-figure > img'));
  revealHeroCards([...root.querySelectorAll<HTMLElement>('.dm-hc')].filter((card) => !card.closest('.dm-fleet')));

  // the narrow layout folds the shelf into one scrolling row that opens on the current chapter
  const shelf = root.querySelector<HTMLElement>('.dm-side');
  if (shelf) mountShelfRow(shelf);
}

if (typeof document !== 'undefined') renderTopicPage();
