import { mountDocsIcons, type DocsIconKey } from './docsIcons.ts';
import { t } from '../ui/i18n.ts';

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
}

export const TOPIC_ORDER = [
  'build', 'models', 'simulation', 'vehicles', 'rendering', 'performance',
  'worlds', 'ai', 'multiplayer', 'audio', 'interface', 'studio', 'filming',
] as const;

export const topics: Record<string, TopicDefinition> = {
  build: {
    label: t('docs.topic.build.label'),
    title: t('docs.topic.build.title'),
    lede: t('docs.topic.build.lede'),
    hero: '/media/hero-rails-r2/04_urban-overhead-dive.webm',
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
      ['/media/showcase-r1/process/action-review-02.webp', t('docs.topic.build.media2')],
    ],
  },
  models: {
    label: t('docs.topic.models.label'),
    title: t('docs.topic.models.title'),
    lede: t('docs.topic.models.lede'),
    hero: '/media/hero-rails-r2/03_steppe-charge-thread.webm',
    icon: 'models',
    sectionIcons: ['research', 'construction', 'rig', 'anatomy', 'iconPipeline', 'critique'],
    sections: [
      [t('docs.topic.models.s1.t'), t('docs.topic.models.s1.p1'), t('docs.topic.models.s1.p2')],
      [t('docs.topic.models.s2.t'), t('docs.topic.models.s2.p1'), t('docs.topic.models.s2.p2')],
      [t('docs.topic.models.s3.t'), t('docs.topic.models.s3.p1'), t('docs.topic.models.s3.p2')],
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
    hero: '/media/hero-rails-r2/01_desert-ground-rush.webm',
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
      ['/media/presentation-r1/04_desert_last_stand.webp', t('docs.topic.ai.media1')],
      ['/media/presentation-r1/43_frontier_contact.webp', t('docs.topic.ai.media2')],
    ],
  },
  audio: {
    label: t('docs.topic.audio.label'),
    title: t('docs.topic.audio.title'),
    lede: t('docs.topic.audio.lede'),
    hero: '/media/hero-rails-r2/05_coastal-shell-skim.webm',
    icon: 'audio',
    // Player-facing guide to the sound engine; docs/AUDIO.md is the engineering source of truth.
    sectionIcons: ['assets', 'weapons', 'armor', 'loading', 'vehicles', 'radio', 'spatial', 'modes', 'mix'],
    sections: [
      [t('docs.topic.audio.s1.t'), t('docs.topic.audio.s1.p1'), t('docs.topic.audio.s1.p2')],
      [t('docs.topic.audio.s2.t'), t('docs.topic.audio.s2.p1'), t('docs.topic.audio.s2.p2')],
      [t('docs.topic.audio.s3.t'), t('docs.topic.audio.s3.p1'), t('docs.topic.audio.s3.p2')],
      [t('docs.topic.audio.s4.t'), t('docs.topic.audio.s4.p1'), t('docs.topic.audio.s4.p2')],
      [t('docs.topic.audio.s5.t'), t('docs.topic.audio.s5.p1'), t('docs.topic.audio.s5.p2')],
      [t('docs.topic.audio.s6.t'), t('docs.topic.audio.s6.p1'), t('docs.topic.audio.s6.p2')],
      [t('docs.topic.audio.s7.t'), t('docs.topic.audio.s7.p1'), t('docs.topic.audio.s7.p2')],
      [t('docs.topic.audio.s8.t'), t('docs.topic.audio.s8.p1'), t('docs.topic.audio.s8.p2')],
      [t('docs.topic.audio.s9.t'), t('docs.topic.audio.s9.p1'), t('docs.topic.audio.s9.p2')],
    ],
    media: [
      ['/media/presentation-r1/04_desert_last_stand.webp', t('docs.topic.audio.media1')],
      ['/media/showcase-r2/19_live_sniper.webp', t('docs.topic.audio.media2')],
    ],
  },
  performance: {
    label: t('docs.topic.performance.label'),
    title: t('docs.topic.performance.title'),
    lede: t('docs.topic.performance.lede'),
    hero: '/media/hero-rails-r2/02_winter-ice-orbit.webm',
    icon: 'performance',
    sectionIcons: ['loading', 'profiling', 'optimization', 'device', 'budgets', 'verification'],
    sections: [
      [t('docs.topic.performance.s1.t'), t('docs.topic.performance.s1.p1'), t('docs.topic.performance.s1.p2')],
      [t('docs.topic.performance.s2.t'), t('docs.topic.performance.s2.p1'), t('docs.topic.performance.s2.p2')],
      [t('docs.topic.performance.s3.t'), t('docs.topic.performance.s3.p1'), t('docs.topic.performance.s3.p2')],
      [t('docs.topic.performance.s4.t'), t('docs.topic.performance.s4.p1'), t('docs.topic.performance.s4.p2')],
      [t('docs.topic.performance.s5.t'), t('docs.topic.performance.s5.p1'), t('docs.topic.performance.s5.p2')],
      [t('docs.topic.performance.s6.t'), t('docs.topic.performance.s6.p1'), t('docs.topic.performance.s6.p2')],
    ],
    media: [
      ['/media/showcase-r2/17_live_player_hud.webp', t('docs.topic.performance.media1')],
      ['/media/showcase-r2/16_mobile_garage.webp', t('docs.topic.performance.media2')],
    ],
  },
  simulation: {
    label: t('docs.topic.simulation.label'),
    title: t('docs.topic.simulation.title'),
    lede: t('docs.topic.simulation.lede'),
    hero: '/media/hero-rails-r2/01_desert-ground-rush.webm',
    icon: 'combat',
    sectionIcons: ['simulation', 'aiming', 'armor', 'weapons', 'modes', 'modes', 'aiming', 'verification'],
    sections: [
      [t('docs.topic.simulation.s1.t'), t('docs.topic.simulation.s1.p1'), t('docs.topic.simulation.s1.p2')],
      [t('docs.topic.simulation.s2.t'), t('docs.topic.simulation.s2.p1'), t('docs.topic.simulation.s2.p2')],
      [t('docs.topic.simulation.s3.t'), t('docs.topic.simulation.s3.p1'), t('docs.topic.simulation.s3.p2')],
      [t('docs.topic.simulation.s4.t'), t('docs.topic.simulation.s4.p1'), t('docs.topic.simulation.s4.p2')],
      [t('docs.topic.simulation.s5.t'), t('docs.topic.simulation.s5.p1'), t('docs.topic.simulation.s5.p2')],
      [t('docs.topic.simulation.roles.t'), t('docs.topic.simulation.roles.p1'), t('docs.topic.simulation.roles.p2')],
      [t('docs.topic.simulation.flight.t'), t('docs.topic.simulation.flight.p1'), t('docs.topic.simulation.flight.p2')],
      [t('docs.topic.simulation.s6.t'), t('docs.topic.simulation.s6.p1'), t('docs.topic.simulation.s6.p2')],
    ],
    media: [
      ['/media/showcase-r2/25_live_killcam_xray.webp', t('docs.topic.simulation.media1')],
      ['/media/presentation-r1/04_desert_last_stand.webp', t('docs.topic.simulation.media2')],
    ],
  },
  vehicles: {
    label: t('docs.topic.vehicles.label'),
    title: t('docs.topic.vehicles.title'),
    lede: t('docs.topic.vehicles.lede'),
    hero: '/media/hero-rails-r2/03_steppe-charge-thread.webm',
    icon: 'vehicles',
    sectionIcons: ['specification', 'rig', 'vehicles', 'anatomy', 'release'],
    sections: [
      [t('docs.topic.vehicles.s1.t'), t('docs.topic.vehicles.s1.p1'), t('docs.topic.vehicles.s1.p2')],
      [t('docs.topic.vehicles.s2.t'), t('docs.topic.vehicles.s2.p1'), t('docs.topic.vehicles.s2.p2')],
      [t('docs.topic.vehicles.s3.t'), t('docs.topic.vehicles.s3.p1'), t('docs.topic.vehicles.s3.p2')],
      [t('docs.topic.vehicles.s4.t'), t('docs.topic.vehicles.s4.p1'), t('docs.topic.vehicles.s4.p2')],
      [t('docs.topic.vehicles.s5.t'), t('docs.topic.vehicles.s5.p1'), t('docs.topic.vehicles.s5.p2')],
    ],
    media: [
      ['/media/showcase-r2/11_gallery_hero.webp', t('docs.topic.vehicles.media1')],
      ['/media/presentation-r1/ui_tank_closeup_modern.webp', t('docs.topic.vehicles.media2')],
    ],
  },
  rendering: {
    label: t('docs.topic.rendering.label'),
    title: t('docs.topic.rendering.title'),
    lede: t('docs.topic.rendering.lede'),
    hero: '/media/hero-rails-r2/04_urban-overhead-dive.webm',
    icon: 'rendering',
    sectionIcons: ['rendering', 'measured', 'device', 'loading', 'performance'],
    sections: [
      [t('docs.topic.rendering.s1.t'), t('docs.topic.rendering.s1.p1'), t('docs.topic.rendering.s1.p2')],
      [t('docs.topic.rendering.s2.t'), t('docs.topic.rendering.s2.p1'), t('docs.topic.rendering.s2.p2')],
      [t('docs.topic.rendering.s3.t'), t('docs.topic.rendering.s3.p1'), t('docs.topic.rendering.s3.p2')],
      [t('docs.topic.rendering.s4.t'), t('docs.topic.rendering.s4.p1'), t('docs.topic.rendering.s4.p2')],
      [t('docs.topic.rendering.s5.t'), t('docs.topic.rendering.s5.p1'), t('docs.topic.rendering.s5.p2')],
    ],
    media: [
      ['/media/showcase-r2/19_live_sniper.webp', t('docs.topic.rendering.media1')],
      ['/media/showcase-r1/105_foreground_urban_hero_abramsx.webp', t('docs.topic.rendering.media2')],
    ],
  },
  worlds: {
    label: t('docs.topic.worlds.label'),
    title: t('docs.topic.worlds.title'),
    lede: t('docs.topic.worlds.lede'),
    hero: '/maps/fjord.webp',
    icon: 'worlds',
    sectionIcons: ['battlefields', 'navigation', 'construction', 'damage', 'quality'],
    sections: [
      [t('docs.topic.worlds.s1.t'), t('docs.topic.worlds.s1.p1'), t('docs.topic.worlds.s1.p2')],
      [t('docs.topic.worlds.s2.t'), t('docs.topic.worlds.s2.p1'), t('docs.topic.worlds.s2.p2')],
      [t('docs.topic.worlds.s3.t'), t('docs.topic.worlds.s3.p1'), t('docs.topic.worlds.s3.p2')],
      [t('docs.topic.worlds.s4.t'), t('docs.topic.worlds.s4.p1'), t('docs.topic.worlds.s4.p2')],
      [t('docs.topic.worlds.s5.t'), t('docs.topic.worlds.s5.p1'), t('docs.topic.worlds.s5.p2')],
    ],
    media: [
      ['/maps/autumn.webp', t('docs.topic.worlds.media1')],
      ['/maps/coastal.webp', t('docs.topic.worlds.media2')],
    ],
  },
  multiplayer: {
    label: t('docs.topic.multiplayer.label'),
    title: t('docs.topic.multiplayer.title'),
    lede: t('docs.topic.multiplayer.lede'),
    hero: '/media/hero-rails-r2/05_coastal-shell-skim.webm',
    icon: 'multiplayer',
    sectionIcons: ['multiplayer', 'interface', 'perception', 'combat', 'verification'],
    sections: [
      [t('docs.topic.multiplayer.s1.t'), t('docs.topic.multiplayer.s1.p1'), t('docs.topic.multiplayer.s1.p2')],
      [t('docs.topic.multiplayer.s2.t'), t('docs.topic.multiplayer.s2.p1'), t('docs.topic.multiplayer.s2.p2')],
      [t('docs.topic.multiplayer.s3.t'), t('docs.topic.multiplayer.s3.p1'), t('docs.topic.multiplayer.s3.p2')],
      [t('docs.topic.multiplayer.s4.t'), t('docs.topic.multiplayer.s4.p1'), t('docs.topic.multiplayer.s4.p2')],
      [t('docs.topic.multiplayer.s5.t'), t('docs.topic.multiplayer.s5.p1'), t('docs.topic.multiplayer.s5.p2')],
    ],
    media: [
      ['/media/presentation-r1/ui_spectator_switcher.webp', t('docs.topic.multiplayer.media1')],
      ['/media/home/ui_roster.webp', t('docs.topic.multiplayer.media2')],
    ],
  },
  interface: {
    label: t('docs.topic.interface.label'),
    title: t('docs.topic.interface.title'),
    lede: t('docs.topic.interface.lede'),
    hero: '/media/presentation-r1/ui_spectator_switcher.webp',
    icon: 'interface',
    sectionIcons: ['garage', 'interface', 'replay', 'mobile', 'accessibility'],
    sections: [
      [t('docs.topic.interface.s1.t'), t('docs.topic.interface.s1.p1'), t('docs.topic.interface.s1.p2')],
      [t('docs.topic.interface.s2.t'), t('docs.topic.interface.s2.p1'), t('docs.topic.interface.s2.p2')],
      [t('docs.topic.interface.s3.t'), t('docs.topic.interface.s3.p1'), t('docs.topic.interface.s3.p2')],
      [t('docs.topic.interface.s4.t'), t('docs.topic.interface.s4.p1'), t('docs.topic.interface.s4.p2')],
      [t('docs.topic.interface.s5.t'), t('docs.topic.interface.s5.p1'), t('docs.topic.interface.s5.p2')],
    ],
    media: [
      ['/media/presentation-r1/ui_spectator_switcher_mobile.webp', t('docs.topic.interface.media1')],
      ['/media/presentation-r1/ui_mobile.webp', t('docs.topic.interface.media2')],
    ],
  },
  studio: {
    label: t('docs.topic.studio.label'),
    title: t('docs.topic.studio.title'),
    lede: t('docs.topic.studio.lede'),
    hero: '/media/hero-rails-r2/04_urban-overhead-dive.webm',
    icon: 'studio',
    sectionIcons: ['specification', 'workflow', 'weapons', 'studio', 'critique'],
    sections: [
      [t('docs.topic.studio.s1.t'), t('docs.topic.studio.s1.p1'), t('docs.topic.studio.s1.p2')],
      [t('docs.topic.studio.s2.t'), t('docs.topic.studio.s2.p1'), t('docs.topic.studio.s2.p2')],
      [t('docs.topic.studio.s3.t'), t('docs.topic.studio.s3.p1'), t('docs.topic.studio.s3.p2')],
      [t('docs.topic.studio.s4.t'), t('docs.topic.studio.s4.p1'), t('docs.topic.studio.s4.p2')],
      [t('docs.topic.studio.s5.t'), t('docs.topic.studio.s5.p1'), t('docs.topic.studio.s5.p2')],
    ],
    media: [
      ['/media/showcase-r2/15_studio_workspace.webp', t('docs.topic.studio.media1')],
      ['/media/showcase-r1/process/action-review-02.webp', t('docs.topic.studio.media2')],
    ],
  },
  // How the media rounds were filmed (2026-10-06). The second section holds the take viewer and the third the
  // process, both filled by filming.ts; public/media/filming-r1 is built by tools/media-r5/docs-media.mjs.
  filming: {
    label: t('docs.topic.filming.label'),
    title: t('docs.topic.filming.title'),
    lede: t('docs.topic.filming.lede'),
    hero: '/media/director-r4/silent-loop.mp4',
    icon: 'filming',
    sectionIcons: ['specification', 'filming', 'workflow', 'navigation', 'perception', 'studio', 'critique', 'rendering', 'audio', 'release'],
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
    ],
    media: [
      ['/media/filming-r1/previz-sheet.webp', t('docs.topic.filming.media1')],
      ['/media/filming-r1/plan-view.webp', t('docs.topic.filming.media2')],
    ],
    mediaAt: [3, 5],
  },
};

// Practical field guides follow the original technical anchors.
const guideCounts: Record<string, number> = {"vehicles": 3, "simulation": 6, "worlds": 1, "interface": 2, "ai": 2, "rendering": 1, "performance": 1, "studio": 1};
for (const [slug, count] of Object.entries(guideCounts)) {
  const topic = topics[slug];
  const guides: TopicSection[] = Array.from({length: count}, (_, i) => [
    t(`docs.guide.${slug}.${i + 1}.t`), t(`docs.guide.${slug}.${i + 1}.p1`), t(`docs.guide.${slug}.${i + 1}.p2`),
  ]);
  topic.sections = [...topic.sections, ...guides];
  topic.sectionIcons = [...topic.sectionIcons, ...guides.map(() => topic.icon)];
}

function mediaFigure([src, caption]: TopicMedia): string {
  return `<figure class="topic-figure"><img src="${src}" alt="${caption}" loading="lazy"><figcaption>${caption}</figcaption></figure>`;
}

function formatText(text: string): string {
  return text.replace(/`([^`]+)`/g, '<code>$1</code>');
}

export function topicSectionId(index: number): string {
  return `topic-section-${index + 1}`;
}

function sectionMarkup(section: TopicSection, index: number, icon: DocsIconKey, media?: TopicMedia): string {
  const [title, ...paragraphs] = section;
  return `<section class="topic-section" id="${topicSectionId(index)}"><p class="section-index">${String(index + 1).padStart(2, '0')} // ${title}</p><h2><span class="topic-section-icon" data-doc-icon="${icon}"></span><span>${title}</span></h2>${paragraphs.map((text) => `<p>${formatText(text)}</p>`).join('')}${media ? mediaFigure(media) : ''}</section>`;
}

function renderTopicPage(): void {
  const slug = location.pathname.split('/').filter(Boolean).at(-1) || 'simulation';
  const topic = topics[slug] || topics.simulation;
  document.title = `${topic.label} — ${t('docs.topic.pageTitle')}`;

  const topicNav = TOPIC_ORDER.map((id) => `<a href="/docs/${id}"${id === slug ? ' aria-current="page"' : ''}><span class="topic-nav-icon" data-doc-icon="${topics[id].icon}"></span><span>${topics[id].label}</span></a>`).join('');
  const root = document.querySelector<HTMLElement>('#topicRoot');
  if (!root) throw new Error('technical manual topic root is unavailable');
  const heroAlt = t('docs.topic.heroAlt', { label: topic.label });
  const heroMarkup = /\.(webm|mp4)$/.test(topic.hero)
    ? `<video autoplay muted loop playsinline preload="metadata" poster="${topic.hero.replace(/\.(webm|mp4)$/, '.jpg')}" aria-label="${heroAlt}"><source src="${topic.hero}" type="${topic.hero.endsWith('.mp4') ? 'video/mp4' : 'video/webm'}"></video>`
    : `<img src="${topic.hero}" alt="${heroAlt}">`;
  const [firstFigureAt, secondFigureAt] = topic.mediaAt ?? [1, 3];
  const sectionMap = topic.sections.map(([title], index) => `<a href="#${topicSectionId(index)}"><span data-doc-icon="${topic.sectionIcons[index] || topic.icon}"></span><b>${String(index + 1).padStart(2, '0')}</b><strong>${title}</strong></a>`).join('');
  root.innerHTML = `
    <header class="topic-hero">${heroMarkup}<div class="topic-hero-shade"></div><div class="shell"><p class="topic-kicker"><span data-doc-icon="${topic.icon}"></span><span>${t('docs.topic.kicker', { label: topic.label })}</span></p><h1>${topic.title}</h1><p>${topic.lede}</p></div></header>
    <nav class="topic-nav" aria-label="${t('docs.topic.navAria')}"><div class="shell"><a href="/docs"><span class="topic-nav-icon" data-doc-icon="manual"></span><span>${t('docs.topic.manualIndex')}</span></a>${topicNav}</div></nav>
    <div class="shell topic-layout"><article><nav class="topic-section-map" aria-label="${t('docs.topic.onThisPage')}">${sectionMap}${['vehicles','worlds','simulation'].includes(slug) ? `<a href="#reference"><strong>${t(`docs.reference.${slug}.title`)}</strong></a>` : ''}</nav>${topic.sections.map((section, index) => sectionMarkup(section, index, topic.sectionIcons[index] || topic.icon, topic.media[index === firstFigureAt ? 0 : index === secondFigureAt ? 1 : -1])).join('')}</article><aside><span class="topic-aside-icon" data-doc-icon="${topic.icon}"></span><p>${t('docs.topic.asideKicker')}</p><strong>${topic.label}</strong><span>${t('docs.topic.asideBody')}</span><a href="/docs">${t('docs.topic.asideLink')}</a></aside></div>`;
  mountDocsIcons(root);
  const article = root.querySelector<HTMLElement>('article');
  if (article && ['vehicles', 'worlds', 'simulation'].includes(slug)) {
    void import('./reference.ts').then(({mountReference}) => mountReference(article, slug));
  }
  if (article && slug === 'filming') {
    void import('./filming.ts').then(({mountFilming}) => mountFilming(article));
  }

  const navStrip = root.querySelector<HTMLElement>('.topic-nav .shell');
  const activeTopic = navStrip?.querySelector<HTMLElement>('[aria-current="page"]');
  if (navStrip && activeTopic && navStrip.scrollWidth > navStrip.clientWidth) {
    navStrip.scrollLeft = Math.max(0, activeTopic.offsetLeft - (navStrip.clientWidth - activeTopic.offsetWidth) / 2);
  }
}

if (typeof document !== 'undefined') renderTopicPage();
