import { mountDocsIcons, type DocsIconKey } from './docsIcons.ts';
import { getLocale, t } from '../ui/i18n.ts';
import { hrefForLocale } from '../ui/localeRouting.ts';

// The Filming manual's take viewer and process (2026-10-06, owner: "the frames, previz, engine review 1 and round
// four loop ... along with the process"). The media is public/media/filming-r1, built by
// tools/media-r5/docs-media.mjs; its manifest records each file's source and filming.selftest.mjs holds the two equal.
// Each take's scene ships beside its clips as the Studio saves it (the shot library's code), to open in the Studio from
// a link (/studio?scene=, src/game/studioSceneLink.ts) or to save for Load JSON (owner 2026-10-07: the Studio's scene
// export and import are "a big feature i love").
const MEDIA_ROOT = '/media/filming-r1';

export type FilmingStage = 'r4' | 'review1' | 'previz' | 'review2' | 'review3' | 'final';
/** Every stage a take can show, in the order the rounds made them. */
export const FILMING_STAGES: readonly FilmingStage[] = ['r4', 'review1', 'previz', 'review2', 'review3', 'final'];
// A take opens on its most finished render; the frames strip is cut from its latest engine render.
const OPENING_STAGES: readonly FilmingStage[] = ['final', 'review3', 'review2', 'r4'];

interface StageText { readonly label: string; readonly detail: string; readonly note: string }
const STAGE_TEXT: Readonly<Record<FilmingStage, StageText>> = {
  r4: { label: t('docs.filming.stage.r4.label'), detail: t('docs.filming.stage.r4.detail'), note: t('docs.filming.stage.r4.note') },
  review1: { label: t('docs.filming.stage.review1.label'), detail: t('docs.filming.stage.review1.detail'), note: t('docs.filming.stage.review1.note') },
  previz: { label: t('docs.filming.stage.previz.label'), detail: t('docs.filming.stage.previz.detail'), note: t('docs.filming.stage.previz.note') },
  review2: { label: t('docs.filming.stage.review2.label'), detail: t('docs.filming.stage.review2.detail'), note: t('docs.filming.stage.review2.note') },
  review3: { label: t('docs.filming.stage.review3.label'), detail: t('docs.filming.stage.review3.detail'), note: t('docs.filming.stage.review3.note') },
  final: { label: t('docs.filming.stage.final.label'), detail: t('docs.filming.stage.final.detail'), note: t('docs.filming.stage.final.note') },
};

export interface FilmingTake {
  readonly id: string;
  readonly n: number;
  readonly title: string;
  readonly place: string;
  readonly time: string;
  readonly story: string;
  readonly stages: readonly FilmingStage[];
  /** The engine render the frames strip is cut from. */
  readonly frames: FilmingStage;
}

/** The featured takes and the stages each has shipped (tools/media-r5/docs-media.mjs DOCS_TAKES, same order). */
export const FILMING_TAKES: readonly FilmingTake[] = Object.freeze([
  { id: 's05-barn-advance', n: 5, title: t('docs.filming.take.s05.title'), place: t('map.verdant'), time: t('docs.filming.time.day'), story: t('docs.filming.take.s05.story'), stages: ['r4', 'review1', 'previz', 'review2', 'review3', 'final'], frames: 'final' },
  { id: 's22-walking-barrage', n: 22, title: t('docs.filming.take.s22.title'), place: t('map.verdant'), time: t('docs.filming.time.night'), story: t('docs.filming.take.s22.story'), stages: ['r4', 'review1', 'previz', 'review2', 'review3', 'final'], frames: 'final' },
  { id: 's21-fields-assault', n: 21, title: t('docs.filming.take.s21.title'), place: t('map.verdant'), time: t('docs.filming.time.day'), story: t('docs.filming.take.s21.story'), stages: ['r4', 'review1', 'previz', 'review2', 'review3', 'final'], frames: 'final' },
  { id: 's47-ironworks-crane', n: 47, title: t('docs.filming.take.s47.title'), place: t('map.foundry'), time: t('docs.filming.time.night'), story: t('docs.filming.take.s47.story'), stages: ['r4', 'review1', 'previz', 'review2', 'review3'], frames: 'review3' },
  { id: 's04-column-under-fire', n: 4, title: t('docs.filming.take.s04.title'), place: t('map.verdant'), time: t('docs.filming.time.day'), story: t('docs.filming.take.s04.story'), stages: ['r4', 'review1', 'previz', 'review2', 'review3', 'final'], frames: 'final' },
  { id: 's13-farm-race', n: 13, title: t('docs.filming.take.s13.title'), place: t('map.frontier'), time: t('docs.filming.time.sunset'), story: t('docs.filming.take.s13.story'), stages: ['r4', 'review1', 'previz', 'review2', 'review3', 'final'], frames: 'final' },
  { id: 's44-oasis-sunset', n: 44, title: t('docs.filming.take.s44.title'), place: t('map.oasis'), time: t('docs.filming.time.sunset'), story: t('docs.filming.take.s44.story'), stages: ['r4', 'review1', 'previz', 'review2', 'review3', 'final'], frames: 'final' },
  { id: 's11-container-rows', n: 11, title: t('docs.filming.take.s11.title'), place: t('map.railyard'), time: t('docs.filming.time.day'), story: t('docs.filming.take.s11.story'), stages: ['r4', 'review1', 'previz', 'review2', 'review3', 'final'], frames: 'final' },
] satisfies readonly FilmingTake[]);

export const filmingVideo = (take: FilmingTake, stage: FilmingStage): string => `${MEDIA_ROOT}/${take.id}-${stage}.mp4`;
export const filmingPoster = (take: FilmingTake, stage: FilmingStage): string => `${MEDIA_ROOT}/${take.id}-${stage}.webp`;
export const filmingFrames = (take: FilmingTake): string => `${MEDIA_ROOT}/${take.id}-frames.webp`;
export const filmingThumb = (take: FilmingTake): string => `${MEDIA_ROOT}/${take.id}-thumb.webp`;
export const filmingScene = (take: FilmingTake): string => `${MEDIA_ROOT}/${take.id}.scene.json`;
/** The take's scene opened in the Studio, in the page's language. */
export const filmingStudioLink = (take: FilmingTake): string => hrefForLocale(`/studio?scene=${filmingScene(take)}`, getLocale());

// The frames strip's four moments (seconds into the take), as docs-media.mjs cuts them.
const FRAME_TIMES = ['0.0', '2.2', '4.4', '6.5'];

const STEPS: readonly (readonly [DocsIconKey, string, string])[] = [
  ['memory', t('docs.filming.step.1.t'), t('docs.filming.step.1.p')],
  ['specification', t('docs.filming.step.2.t'), t('docs.filming.step.2.p')],
  ['navigation', t('docs.filming.step.3.t'), t('docs.filming.step.3.p')],
  ['verification', t('docs.filming.step.4.t'), t('docs.filming.step.4.p')],
  ['perception', t('docs.filming.step.5.t'), t('docs.filming.step.5.p')],
  ['critique', t('docs.filming.step.6.t'), t('docs.filming.step.6.p')],
  ['build', t('docs.filming.step.7.t'), t('docs.filming.step.7.p')],
  ['rendering', t('docs.filming.step.8.t'), t('docs.filming.step.8.p')],
  ['audio', t('docs.filming.step.9.t'), t('docs.filming.step.9.p')],
  ['filming', t('docs.filming.step.10.t'), t('docs.filming.step.10.p')],
];

const NUMBERS: readonly (readonly [string, string])[] = [
  ['50', t('docs.filming.number.1')],
  [t('docs.filming.number.seconds', { n: '6.6' }), t('docs.filming.number.2')],
  ['3840 × 2160', t('docs.filming.number.3')],
  ['8–48', t('docs.filming.number.4')],
  ['2', t('docs.filming.number.5')],
  ['4', t('docs.filming.number.6')],
];

const pad = (n: number): string => String(n).padStart(2, '0');
const takeLabel = (take: FilmingTake): string => t('docs.filming.viewer.take', { n: pad(take.n) });

function viewerMarkup(): string {
  const stageButtons = FILMING_STAGES.map((stage, index) => `<button type="button" class="filming-stage-button" data-filming-stage="${stage}" aria-pressed="false"><b>${pad(index + 1)}</b><span>${STAGE_TEXT[stage].label}</span></button>`).join('');
  const takeCards = FILMING_TAKES.map((take, index) => `<button type="button" class="filming-take-card" data-filming-take="${index}" aria-pressed="false"><img src="${filmingThumb(take)}" alt="" width="384" height="216" loading="lazy" decoding="async"><span><b>${pad(take.n)}</b><strong>${take.title}</strong><small>${take.place} · ${take.time}</small></span></button>`).join('');
  return `<div class="filming-viewer" data-filming-viewer role="region" aria-label="${t('docs.filming.viewer.aria')}">
    <figure class="filming-screen"><video data-filming-video muted loop playsinline controls preload="metadata"${reducedMotion() ? '' : ' autoplay'}></video>
      <figcaption><span><strong data-filming-stage-label></strong><small data-filming-stage-detail></small></span><b data-filming-take-label></b></figcaption></figure>
    <div class="filming-stage-bar" role="group" aria-label="${t('docs.filming.viewer.stagesAria')}">${stageButtons}</div>
    <p class="filming-stage-note" data-filming-stage-note></p>
    <figure class="filming-frames"><div class="filming-frame-row" data-filming-frames>${FRAME_TIMES.map((time) => `<span class="filming-frame" role="img" data-filming-frame="${time}"><b>${time} s</b></span>`).join('')}</div><figcaption data-filming-frames-caption></figcaption></figure>
    <div class="filming-take-story"><h3 data-filming-take-title></h3><p class="filming-take-meta" data-filming-take-meta></p><p data-filming-take-story></p>
      <div class="filming-take-scene"><a data-filming-studio href="">${t('docs.filming.viewer.openStudio')}</a><a data-filming-scene href="" download>${t('docs.filming.viewer.sceneJson')}</a><small>${t('docs.filming.viewer.sceneNote')}</small></div></div>
    <div class="filming-take-grid" role="group" aria-label="${t('docs.filming.viewer.takesAria')}">${takeCards}</div>
  </div>`;
}

function processMarkup(): string {
  const numbers = NUMBERS.map(([value, label]) => `<div><dt>${value}</dt><dd>${label}</dd></div>`).join('');
  const steps = STEPS.map(([icon, title, text], index) => `<li><span class="filming-step-icon" data-doc-icon="${icon}"></span><b>${pad(index + 1)}</b><strong>${title}</strong><span>${text}</span></li>`).join('');
  return `<dl class="filming-numbers" aria-label="${t('docs.filming.numbers.aria')}">${numbers}</dl><ol class="filming-steps">${steps}</ol>`;
}

const reducedMotion = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Fill the Filming manual's second section with the take viewer and its third with the process. */
export function mountFilming(article: HTMLElement): void {
  const viewerSection = article.querySelector<HTMLElement>('#topic-section-2');
  const processSection = article.querySelector<HTMLElement>('#topic-section-3');
  if (processSection) {
    processSection.insertAdjacentHTML('beforeend', processMarkup());
    mountDocsIcons(processSection);
  }
  if (!viewerSection) return;
  viewerSection.insertAdjacentHTML('beforeend', viewerMarkup());
  const root = viewerSection.querySelector<HTMLElement>('[data-filming-viewer]');
  const video = root?.querySelector<HTMLVideoElement>('[data-filming-video]');
  if (!root || !video) return;
  // The muted property, not only the attribute, lets the browser start a clip without a gesture.
  video.muted = true;
  const field = (name: string): HTMLElement => root.querySelector<HTMLElement>(`[data-filming-${name}]`)!;
  const stageButtons = [...root.querySelectorAll<HTMLButtonElement>('[data-filming-stage]')];
  const takeButtons = [...root.querySelectorAll<HTMLButtonElement>('[data-filming-take]')];
  const frames = [...root.querySelectorAll<HTMLElement>('[data-filming-frame]')];
  let take = FILMING_TAKES[0];
  let stage: FilmingStage = OPENING_STAGES.find((s) => take.stages.includes(s)) ?? take.stages[0];

  const show = (): void => {
    const text = STAGE_TEXT[stage];
    stageButtons.forEach((button) => {
      const own = button.dataset.filmingStage as FilmingStage;
      button.disabled = !take.stages.includes(own);
      button.setAttribute('aria-pressed', String(own === stage));
    });
    field('stage-label').textContent = text.label;
    field('stage-detail').textContent = text.detail;
    field('stage-note').textContent = text.note;
    field('take-label').textContent = takeLabel(take);
    video.setAttribute('aria-label', t('docs.filming.viewer.videoAria', { take: take.title, stage: text.label }));
    const src = filmingVideo(take, stage);
    if (video.getAttribute('src') !== src) {
      video.pause();
      video.poster = filmingPoster(take, stage);
      video.src = src;
      video.load();
    }
    if (!reducedMotion()) video.play().catch(() => {});
  };

  const showTake = (): void => {
    takeButtons.forEach((button) => button.setAttribute('aria-pressed', String(FILMING_TAKES[Number(button.dataset.filmingTake)] === take)));
    field('take-title').textContent = take.title;
    field('take-meta').textContent = `${takeLabel(take)} · ${take.place} · ${take.time}`;
    field('take-story').textContent = take.story;
    field('studio').setAttribute('href', filmingStudioLink(take));
    field('scene').setAttribute('href', filmingScene(take));
    field('scene').setAttribute('download', `${take.id}.scene.json`);
    const strip = filmingFrames(take);
    frames.forEach((frame, index) => {
      frame.style.backgroundImage = `url("${strip}")`;
      frame.style.backgroundPosition = `${(index * 100) / (frames.length - 1)}% 0`;
      frame.setAttribute('aria-label', t('docs.filming.viewer.frameAria', { take: take.title, time: FRAME_TIMES[index] }));
    });
    field('frames-caption').textContent = t('docs.filming.viewer.frames', { stage: STAGE_TEXT[take.frames].label });
  };

  root.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const stageButton = target?.closest<HTMLButtonElement>('[data-filming-stage]');
    if (stageButton && !stageButton.disabled) {
      stage = stageButton.dataset.filmingStage as FilmingStage;
      show();
      return;
    }
    const takeButton = target?.closest<HTMLButtonElement>('[data-filming-take]');
    if (!takeButton) return;
    take = FILMING_TAKES[Number(takeButton.dataset.filmingTake)] ?? take;
    // A picked stage stays picked from take to take wherever the take has it.
    if (!take.stages.includes(stage)) stage = OPENING_STAGES.find((s) => take.stages.includes(s)) ?? take.stages[0];
    showTake();
    show();
  });

  // Arrow keys move along the stage bar and across the take grid.
  root.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
    const focused = document.activeElement;
    if (!(focused instanceof HTMLButtonElement)) return;
    const inStages = stageButtons.includes(focused);
    const group = inStages ? stageButtons.filter((button) => !button.disabled) : takeButtons;
    const current = group.indexOf(focused);
    if (current < 0) return;
    event.preventDefault();
    const columns = inStages ? group.length : (document.body?.dataset.cotWidth === 'phone' || document.body?.dataset.cotWidth === 'compact' ? 2 : 4);
    const step = event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' ? -columns : columns;
    group[Math.max(0, Math.min(group.length - 1, current + step))].focus();
  });

  showTake();
  show();
}
