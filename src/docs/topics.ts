import { mountDocsIcons, type DocsIconKey } from './docsIcons.ts';
import { getLocale, t } from '../ui/i18n.ts';
import { hrefForLocale } from '../ui/localeRouting.ts';
import { pictureMarkup, stillDataSaver } from '../presentation/responsivePicture.ts';
import type { RichSection } from './chapters/types.ts';

type TopicSection = readonly [string, ...string[]];
type TopicMedia = readonly [string, string];

interface TopicDefinition {
  label: string;
  title: string;
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
}

export const TOPIC_ORDER = [
  'start', 'controls', 'modes', 'tanks', 'combat', 'battlefields', 'multiplayer', 'audio', 'studio', 'build', 'simulation', 'models', 'rendering', 'ai', 'filming',
] as const;

export const topics: Record<string, TopicDefinition> = {
  // Every mode, its goal and its rules, from the game's own tables (src/docs/chapters/modes.ts).
  modes: {
    label: t('docs.topic.modes.label'),
    title: t('docs.topic.modes.title'),
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
    lede: t('docs.topic.start.lede'),
    hero: '/media/site50-r14/loops/s226-church-duel.webm',
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
    lede: t('docs.topic.tanks.lede'),
    hero: '/media/site50-r14/loops/s05-barn-advance.webm',
    icon: 'fleet',
    sectionIcons: [],
    sections: [],
    media: [],
    rich: true,
  },
  // Armour, angling and spotting, charted from the sim's own functions (src/docs/chapters/combat.ts).
  combat: {
    label: t('docs.topic.combat.label'),
    title: t('docs.topic.combat.title'),
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
      ['/media/showcase-r2/15_studio_workspace.webp', t('docs.topic.build.media1')],
      ['/media/site50-r14/frames/sheet-2.webp', t('docs.topic.build.media2')],
    ],
  },
  models: {
    label: t('docs.topic.models.label'),
    title: t('docs.topic.models.title'),
    lede: t('docs.topic.models.lede'),
    hero: '/media/site50-r14/loops/s07-lake-shellfire.webm',
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
      ['/media/showcase-r2/11_gallery_hero.webp', t('docs.topic.models.media1')],
      ['/media/presentation-r1/ui_tank_closeup_modern.webp', t('docs.topic.models.media2')],
    ],
  },
  ai: {
    label: t('docs.topic.ai.label'),
    title: t('docs.topic.ai.title'),
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
    lede: t('docs.topic.simulation.lede'),
    hero: '/media/site50-r14/loops/s24-ice-duel.webm',
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
      ['/media/showcase-r2/25_live_killcam_xray.webp', t('docs.topic.simulation.media1')],
      ['/media/site50-r14/stills/s27-caravanserai-kill.webp', t('docs.topic.simulation.media2')],
    ],
  },

  rendering: {
    label: t('docs.topic.rendering.label'),
    title: t('docs.topic.rendering.title'),
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
      ['/media/showcase-r2/19_live_sniper.webp', t('docs.topic.rendering.media1')],
      ['/media/site50-r14/stills/s38-church-knockout-close.webp', t('docs.topic.rendering.media2')],
    ],
  },

  // Rooms, codes, the local network, seats and who hosts, from the room service's own rules (src/docs/chapters/multiplayer.ts).
  multiplayer: {
    label: t('docs.topic.multiplayer.label'),
    title: t('docs.topic.multiplayer.title'),
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
    lede: t('docs.topic.filming.lede'),
    hero: '/media/site50-r14/loops/s21-fields-assault.webm',
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
      // (2026-10-19) the media rounds' finals: the library, mounted by filming.ts
      [t('docs.topic.filming.s11.t'), t('docs.topic.filming.s11.p1')],
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
  '/media/presentation-r1/ui_tank_closeup_modern.webp': [1920, 1080],
  '/media/showcase-r2/11_gallery_hero.webp': [1920, 1080],
  '/media/showcase-r2/15_studio_workspace.webp': [1920, 1080],
  '/media/showcase-r2/19_live_sniper.webp': [1920, 1080],
  '/media/showcase-r2/25_live_killcam_xray.webp': [1920, 1080],
  '/media/site50-r14/frames/sheet-2.webp': [2400, 540],
};
const DEFAULT_FIGURE_SIZE = [1920, 1080] as const;
/** A figure fills the article column (about 760 px; the full width on narrow screens). */
const FIGURE_SIZES_ATTRIBUTE = '(max-width: 900px) 100vw, 760px';

function mediaFigure([src, caption]: TopicMedia): string {
  const [width, height] = TOPIC_FIGURE_SIZES[src] ?? DEFAULT_FIGURE_SIZE;
  return `<figure class="topic-figure">${pictureMarkup({ src, width, height, alt: caption, sizes: FIGURE_SIZES_ATTRIBUTE })}<figcaption>${caption}</figcaption></figure>`;
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
  's26-minaret-fire': { r960: true, phone: true },
};
const LOOP_HERO = /^\/media\/site50-r14\/loops\/([\w-]+)\.webm$/;

/**
 * A topic header: its take's first frame as the page's LCP picture (a 640 still under data saving, which never plays),
 * and the take's loop over it under the site's one playback policy (src/presentation/mediaPlayer.ts): the 960 rung
 * first, the 1920 loop only on wide screens, the phone rung on phones, nothing by itself under reduced motion or data
 * saving. A still header is the picture alone.
 */
export function topicHeroMarkup(hero: string, alt: string, saving = stillDataSaver()): string {
  const take = LOOP_HERO.exec(hero)?.[1];
  if (!take) {
    const [width, height] = TOPIC_FIGURE_SIZES[hero] ?? (hero.startsWith('/maps/') ? [3840, 2160] : DEFAULT_FIGURE_SIZE);
    return pictureMarkup({ src: hero, width, height, alt, eager: true, className: 'topic-hero-poster' }, saving);
  }
  const loops = '/media/site50-r14/loops';
  const poster = pictureMarkup({
    src: `${loops}/${take}.jpg`, rungs: [{ src: `${loops}/${take}.jpg`, width: 1920 }], width: 1920, height: 1080, alt,
    eager: true, className: 'topic-hero-poster', tone: 'var(--surface-page)',
    // a phone and data saving show the take's 640 still (the phone pre-scroll budget, SPEC 8.3); the loop crossfades in
    saveData: { src: `/media/site50-r14/stills/${take}-thumb.webp`, width: 640 },
    phone: { src: `/media/site50-r14/stills/${take}-thumb.webp`, width: 640 },
  }, saving);
  const rungs = TOPIC_HERO_RUNGS[take] ?? {};
  const sources = [
    rungs.r960 ? `<source data-src="${loops}/${take}-960.webm" type="video/webm">` : '',
    `<source data-src="${loops}/${take}.webm" type="video/webm"${rungs.r960 ? ' data-rung="wide"' : ''}>`,
    rungs.phone ? `<source data-src="/media/web-video-r1/${take}-mobile.mp4" type="video/mp4" data-rung="phone">` : '',
  ].join('');
  const label = alt.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  return `${poster}<video data-media-player muted loop playsinline preload="none" aria-hidden="true" data-label="${label}">${sources}</video>`;
}

function formatText(text: string): string {
  return text.replace(/`([^`]+)`/g, '<code>$1</code>');
}

export function topicSectionId(index: number): string {
  return `topic-section-${index + 1}`;
}

type TopicId = typeof TOPIC_ORDER[number];
type TopicGroupKey = 'play' | 'behind';

/** The manual's two shelves (08-docs .side .grp): what a player meets in the game, and how it is engineered. */
export const TOPIC_GROUPS: ReadonlyArray<{ readonly key: TopicGroupKey; readonly icon: DocsIconKey; readonly topics: readonly TopicId[] }> = [
  { key: 'play', icon: 'combat', topics: ['start', 'controls', 'modes', 'tanks', 'combat', 'battlefields', 'multiplayer', 'audio', 'studio'] },
  { key: 'behind', icon: 'architecture', topics: ['build', 'simulation', 'models', 'rendering', 'ai', 'filming'] },
];
const groupLabel = (key: TopicGroupKey): string => (key === 'play' ? t('docs.group.play') : t('docs.group.behind'));

/** The title in the direction's two voices (08 h1): its first words solid, its last words in the hollow outline. A
 *  Chinese title has no spaces and stays one solid line (the type package keeps CJK solid, SPEC 4.7). */
function titleMarkup(title: string): string {
  const words = title.split(' ');
  if (words.length < 2) return `<span>${title}</span>`;
  const cut = Math.ceil(words.length / 2);
  return `<span>${words.slice(0, cut).join(' ')}</span> <span class="t-hollow">${words.slice(cut).join(' ')}</span>`;
}

/** Minutes to read a topic: 200 Latin words, or 400 Chinese characters, a minute. */
function readMinutes(topic: TopicDefinition, rich: readonly RichSection[] | null): number {
  const text = [topic.lede, ...(rich ? rich.map((section) => section.text) : topic.sections.flat())].join(' ');
  const cjk = (text.match(/[㐀-鿿]/g) ?? []).length;
  const words = text.replace(/[㐀-鿿]/g, ' ').split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200 + cjk / 400));
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
  input.addEventListener('focus', () => { void import('./docsSearch.ts').then(({ mountDocsSearch }) => mountDocsSearch(root, input)); }, { once: true });
  document.addEventListener('keydown', (event) => {
    if (event.key.toLowerCase() !== 'k' || !(event.metaKey || event.ctrlKey) || event.altKey || !input.offsetParent) return;
    event.preventDefault();
    input.focus();
    input.select();
  });
  const kbd = root.querySelector('.dm-search kbd');
  if (kbd && !/Mac|iP(?:hone|ad|od)/.test(navigator.platform)) kbd.textContent = 'Ctrl K';
}

/** "On this page" follows the reader: the section crossing the top third of the screen is the current one. */
function mountTocSpy(root: HTMLElement): void {
  const links = [...root.querySelectorAll<HTMLAnchorElement>('.dm-toc a[href^="#"]')];
  const targets = links.map((link) => document.getElementById(link.hash.slice(1))).filter((el): el is HTMLElement => el !== null);
  if (!targets.length) return;
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      for (const link of links) {
        if (link.hash === `#${entry.target.id}`) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      }
    }
  }, { rootMargin: '-20% 0px -70%' });
  for (const target of targets) observer.observe(target);
}

const HERO_TAKE = /\/media\/site50-r14\/loops\/([\w-]+)\.webm$/;
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
  const take = HERO_TAKE.exec(topic.hero)?.[1];
  const caption = take ? t(`media.site50.title.${camelTake(take)}`) : '';
  const shelves = TOPIC_GROUPS.map((shelf) => `<p class="dm-grp"><span data-doc-icon="${shelf.icon}"></span><span>${groupLabel(shelf.key)}</span></p>`
    + shelf.topics.map((topicId) => `<a href="${docsHref(topicId)}"${topicId === slug ? ' aria-current="page"' : ''}>${topics[topicId].label}</a>`).join('')).join('');
  const reference = REFERENCE_TOPICS.includes(slug);
  if (topic.rich && !rich) throw new Error(`topics: ${slug} is built from the game's tables: pass its richSections()`);
  const toc = (rich ? rich.map(({ id, title }) => `<a href="#${id}">${title}</a>`)
    : topic.sections.map(([title], index) => `<a href="#${topicSectionId(index)}">${title}</a>`)).join('')
    + (reference ? `<a href="#reference">${t('docs.reference.vehicles.title')}</a>` : '');
  const [firstFigureAt, secondFigureAt] = topic.mediaAt ?? [1, 3];
  const neighbour = (topicId: TopicId | undefined, side: 'prev' | 'next'): string => (topicId
    ? `<a class="cot-c-btn cot-c-btn--ghost dm-pager__${side}" href="${docsHref(topicId)}"><span data-doc-icon="${topics[topicId].icon}"></span><span>${topics[topicId].label}</span></a>`
    : '');
  // the search field leads the shelf (08 .side .search); docsSearch.ts fills its status and hits
  const search = `<div class="dm-search" role="search"><label class="dm-search__field"><span data-doc-icon="search"></span>`
    + `<input type="search" placeholder="${t('docs.search.placeholder')}" aria-label="${t('docs.search.label')}" aria-controls="dmSearchHits" autocomplete="off" spellcheck="false" enterkeyhint="search">`
    + `<kbd class="cot-c-kbd" aria-hidden="true">Cmd K</kbd></label><p class="dm-search__status" role="status"></p><div class="dm-search__hits" id="dmSearchHits" hidden></div></div>`;
  return `<div class="dm">`
    + `<aside class="dm-side" aria-label="${t('docs.topic.navAria')}"><a class="dm-home" href="${docsHref()}"><span data-doc-icon="manual"></span><span>${t('docs.topic.manualIndex')}</span></a>${search}${shelves}</aside>`
    // the article column is the skip link's target (#main); a loop hero's picture is named by its take, whose caption
    // then stays visual only
    + `<div class="dm-main" id="main" tabindex="-1"><header class="dm-banner">${topicHeroMarkup(topic.hero, caption || t('docs.topic.heroAlt', { label: topic.label }), saving)}`
    + `<div class="dm-banner__t"><nav class="dm-crumb" aria-label="${t('docs.topic.crumbAria')}"><a href="${docsHref()}">${t('publicNav.fieldManual')}</a><i aria-hidden="true">›</i>`
    + `<span>${groupLabel(group.key)}</span><i aria-hidden="true">›</i><span aria-current="page">${topic.label}</span></nav>`
    + `<h1>${titleMarkup(topic.title)}</h1></div>${caption ? `<p class="dm-banner__cap cot-c-cap" aria-hidden="true"><span data-doc-icon="filming"></span><span>${caption}</span></p>` : ''}</header>`
    + `<div class="dm-body"><article class="dm-article${topic.rich ? ' dm-article--wide' : ''}"><p class="dm-lede">${topic.lede}</p>`
    + `<p class="dm-meta"><span data-doc-icon="simulation"></span><span>${t('docs.topic.readTime', { minutes: readMinutes(topic, rich) })}</span></p>`
    + (rich ? rich.map(({ id, title, html }) => `<section class="dm-section" id="${id}"><h2>${title}</h2>${html}</section>`).join('')
      : topic.sections.map((section, index) => sectionMarkup(section, index, topic.media[index === firstFigureAt ? 0 : index === secondFigureAt ? 1 : -1])).join(''))
    + `</article><aside class="dm-toc"><nav aria-label="${t('docs.topic.onThisPage')}">${toc}</nav></aside></div>`
    + `<nav class="dm-pager" aria-label="${t('docs.topic.pagerAria')}">${neighbour(order[at - 1], 'prev')}${neighbour(order[at + 1], 'next')}</nav></div></div>`;
}

const REFERENCE_TOPICS: readonly TopicId[] = ['tanks'];

/**
 * The chapter page's behaviour. A page the build prerendered (tools/docs-prerender.mjs: `data-prerendered` names the
 * chapter and its locale) keeps its markup; a page without it (the topic template, or a locale the build did not write)
 * renders the chapter here first.
 */
function renderTopicPage(): void {
  const last = location.pathname.split('/').filter(Boolean).at(-1) || 'simulation';
  const slug: TopicId = isTopicId(last) ? last : 'simulation';
  const topic = topics[slug];
  document.title = `${topic.label} · ${t('docs.topic.pageTitle')}`;
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
  mountSearchEntry(root);
  const heroVideos = root.querySelectorAll<HTMLVideoElement>('video[data-media-player]');
  if (heroVideos.length) {
    void Promise.all([import('../presentation/mediaPlayer.ts'), import('../presentation/mediaPlayer.css')]).then(([{ mountMediaPlayers }]) => mountMediaPlayers(heroVideos,
      (playing, video) => t(playing ? 'publicPages.video.pauseAria' : 'publicPages.video.playAria', { label: video.dataset.label || '' })));
  }
  const article = root.querySelector<HTMLElement>('article');
  if (article && reference) {
    void import('./reference.ts').then(({mountReference}) => mountReference(article, slug));
  }
  if (article && slug === 'filming') {
    void import('./filming.ts').then(({mountFilming}) => mountFilming(article));
  }

  // the narrow layout folds the shelf into one scrolling row: it opens on the current chapter, without moving the page
  const shelf = root.querySelector<HTMLElement>('.dm-side');
  const current = shelf?.querySelector<HTMLElement>('[aria-current="page"]');
  if (shelf && current && shelf.scrollWidth > shelf.clientWidth) {
    shelf.scrollLeft = Math.max(0, current.offsetLeft - (shelf.clientWidth - current.offsetWidth) / 2);
  }
}

if (typeof document !== 'undefined') renderTopicPage();
