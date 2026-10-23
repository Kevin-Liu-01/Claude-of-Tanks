import { STUDIO_TIMES, type StudioLight, type StudioTimeOfDay } from '../game/studioLight.ts';
import type { RuntimeValue } from '../runtimeTypes.ts';
import { galleryHref } from '../game/tankIdBoundaries.ts';
import type { ProductionFormat, ProductionRigId } from '../game/studioProduction.ts';
import { mountStudioProductionPanel, productionLabel, type WorkspaceId } from './studioProductionPanel.ts';
import { mountStudioPicturePanel, type StudioPicturePanelApi } from './studioPicturePanel.ts';
/**
 * studioPanel.ts — the Studio's interface (src/game/studio.ts's UI): the Premiere direction's page 09 on the live kit
 * (createStudioPanel below; its rules are studioPanel.css).
 */
import { ensureFonts } from './fonts.ts';
import { iconUrl } from './icons.ts';
import { type IconId } from './icons/icon.ts';
import { uiIconSVG } from './uiIcons.ts';
import { flagIconUrl } from './flags.ts';
import { MAP_HEROES, MAP_THUMBS } from './mapThumbs.ts';
import { mountMediaArchive } from '../presentation/mediaArchive.ts';
import { vehicleEraLabelI18n } from '../vehicles/taxonomy.ts';
import { createInfoButton, type InfoButton } from './contextInfo.ts';
import { createPlanView, type StudioPlanFeatures } from './studioPlanView.ts';
import { getLocale, t } from './i18n.ts';
import { STUDIO_FX_PARAMS } from '../game/studioFxSettings.ts';
import { hrefForLocale } from './localeRouting.ts';
import { SCENE_LINK_GLYPHS, browserSceneLinkEnv, copySceneLink } from './studioSceneLinkUi.ts';
import { FILM_RESOLUTIONS, createFilmPlan, filmOutputSize, normalizeFilm } from '../game/studioFilmPlan.ts';
import './studioPanel.css';

const STUDIO_GUIDES = {
  battlefield: 'environment', map: 'environment', tanks: 'actors', addTanks: 'actors',
  selectedTank: 'actors', effects: 'effects', layersEvents: 'effects', cinematics: 'timeline',
  storyboard: 'timeline', camera: 'camera', picture: 'camera', output: 'output', productionArchive: 'recipe',
} as const;

const STUDIO_GROUP_INFO_KEYS = Object.freeze({
  battlefield: 'studioPanel.info.group.battlefield',
  tanks: 'studioPanel.info.group.tanks',
  effects: 'studioPanel.info.group.effects',
  cinematics: 'studioPanel.info.group.cinematics',
  output: 'studioPanel.info.group.output',
} as const);

const STUDIO_SECTION_INFO_KEYS = Object.freeze({
  map: 'studioPanel.info.section.map',
  addTanks: 'studioPanel.info.section.addTanks',
  selectedTank: 'studioPanel.info.section.selectedTank',
  layersEvents: 'studioPanel.info.section.layersEvents',
  storyboard: 'studioPanel.info.section.storyboard',
  camera: 'studioPanel.info.section.camera',
  picture: 'studioPanel.info.section.picture',
  output: 'studioPanel.info.section.output',
  productionArchive: 'studioPanel.info.section.productionArchive',
} as const);

type StudioGroupInfoId = keyof typeof STUDIO_GROUP_INFO_KEYS;
type StudioSectionInfoId = keyof typeof STUDIO_SECTION_INFO_KEYS;

type StudioActorState = string;

interface StudioPoint {
  x: number;
  y: number;
  z: number;
}

export interface StudioActor {
  readonly uid: string;
  readonly name?: string | null;
  readonly spec: {
    readonly id: string;
    readonly name: string;
    readonly dims: { readonly heightM: number };
    readonly gunDepressionDeg?: number;
    readonly gunElevationDeg?: number;
  };
  readonly state: { readonly pos: StudioPoint };
  readonly pose: {
    readonly x: number;
    readonly z: number;
    readonly facingDeg: number;
    readonly turretDeg: number;
    readonly gunDeg: number;
  };
  readonly stateName: StudioActorState;
  readonly camo?: string | null;
}

interface StudioEffect {
  readonly id: string;
  readonly type: string;
  readonly tMs: number;
  readonly params?: object;
  readonly selected?: boolean;
  readonly actor?: string | number | null;
  readonly from?: readonly number[];
  readonly to?: readonly number[];
  readonly at?: readonly number[];
}

interface StudioCameraShot {
  readonly id: string;
  readonly label: string;
  readonly tMs: number;
  readonly fov: number;
  readonly transition: string;
}

interface StudioStoryboard {
  readonly shots: readonly StudioCameraShot[];
  readonly actorTracks: ReadonlyArray<{
    readonly actor: string;
    readonly keys: ReadonlyArray<{ readonly tMs: number }>;
  }>;
}

interface StudioCameraState {
  readonly mode: 'fly' | 'orbit' | string;
  readonly pos: readonly number[];
  readonly lookAt: readonly number[];
  readonly yawDeg: number;
  readonly pitchDeg: number;
  readonly fov: number;
  readonly rollDeg: number;
}

interface StudioSpecInfo {
  readonly id: string;
  readonly name: string;
  /** The nation its flag names (owner UI rule 3: every vehicle shows its flag and silhouette). */
  readonly nation?: string;
  readonly era?: string;
  readonly developmentOnly?: boolean;
  readonly rosterTag?: string;
}

interface StudioLightState {
  readonly time: StudioTimeOfDay;
  readonly headlights: boolean;
  readonly sunAzimuthDeg: number | null;
  readonly sunElevationDeg: number | null;
  readonly override: StudioLight | null;
  readonly band: { readonly min: number; readonly max: number };
  readonly times: readonly StudioTimeOfDay[];
  readonly space: boolean;
}

interface StudioRecordingStatus {
  readonly active: boolean;
  readonly supported: boolean;
  readonly elapsedMs: number;
  readonly durationMs: number;
  readonly mimeType?: string | null;
}

interface StudioFilmProgress {
  readonly stage: 'preparing' | 'rendering' | 'finishing';
  readonly frame: number;
  readonly frames: number;
  readonly remainingMs: number | null;
}

interface StudioFilmSettings {
  readonly fps: number;
  readonly samples: number;
  readonly shake: number;
  readonly shutterDeg: number;
  readonly filter: string;
  readonly speed: ReadonlyArray<{ readonly tMs: number; readonly speed: number; readonly ease: string }>;
}

interface StudioFilmExportOptions {
  readonly resolution: number;
  readonly fps: number;
  readonly samples: number;
  readonly shake: number;
  readonly download: boolean;
  readonly onProgress: (progress: StudioFilmProgress) => void;
  readonly onFrame: (canvas: HTMLCanvasElement) => void;
}

interface StudioEffectRecipe {
  readonly type: string;
  readonly actor?: string;
  readonly from?: readonly number[];
  readonly to?: readonly number[];
  readonly at?: readonly number[];
  readonly hFrac?: number;
  readonly params?: Readonly<Record<string, RuntimeValue>>;
}

export interface StudioPanelApi extends StudioPicturePanelApi {
  readonly MAP_IDS: readonly string[];
  readonly TANK_IDS: readonly string[];
  readonly CAMO_PATTERN_IDS: readonly string[];
  readonly ACTOR_STATES: readonly string[];
  readonly mapId: string | null;
  readonly timeOfDay: StudioTimeOfDay;
  setTimeOfDay(time: StudioTimeOfDay): Promise<RuntimeValue>;
  setLight(patch: StudioLight | null): Promise<RuntimeValue>;
  getLight(): StudioLightState;
  readonly timeScale: number;
  readonly fxTimeMs: number;
  readonly durationMs: number;
  readonly playing: boolean;
  readonly railVisible: boolean;
  readonly selectedShotId: string | null;
  readonly _internal: {
    selected: StudioActor | null;
    readonly actors: readonly StudioActor[];
    placeArmed: string | null;
    readonly markerActive: boolean;
    readonly markerPos: StudioPoint;
    readonly cam: { speed: number };
  };
  getMapInfo(id: string): { readonly name: string };
  getSpecInfo(id: string): StudioSpecInfo;
  getCamera(): StudioCameraState;
  getStoryboard(): StudioStoryboard;
  /** The battlefield's plan for the Plan view (the HUD minimap's features and the map's extent). */
  getPlanFeatures(): StudioPlanFeatures | null;
  listEffects(): readonly StudioEffect[];
  recordingStatus(): StudioRecordingStatus;
  state(): Record<string, RuntimeValue>;
  exit(): void;
  setMap(id: string): Promise<RuntimeValue> | RuntimeValue;
  addActor(config: Readonly<Record<string, RuntimeValue>>): RuntimeValue;
  removeActor(actor: StudioActor): RuntimeValue;
  updateActor(actor: StudioActor, patch: Readonly<Record<string, RuntimeValue>>): RuntimeValue;
  setActorState(actor: StudioActor, state: string, ageS?: number | null): RuntimeValue;
  selectActor(uid: string): RuntimeValue;
  effect(recipe: StudioEffectRecipe): RuntimeValue;
  clearEffects(): RuntimeValue;
  setFxQuality(quality: 'battle' | 'cinematic'): RuntimeValue;
  readonly fxQuality: string;
  setTrackDust(on: boolean): RuntimeValue;
  readonly trackDust: boolean;
  setAmbience(on: boolean): RuntimeValue;
  readonly ambience: boolean;
  advanceFx(milliseconds: number): RuntimeValue;
  setStoryboardDuration(milliseconds: number): RuntimeValue;
  setTimeScale(scale: number): RuntimeValue;
  stop(): RuntimeValue;
  pause(): RuntimeValue;
  play(): RuntimeValue;
  seek(milliseconds: number): RuntimeValue;
  addCameraShot(): RuntimeValue;
  keyActor(actor: StudioActor): RuntimeValue;
  setRailVisible(visible: boolean): RuntimeValue;
  clearActorTrack(actor: StudioActor): RuntimeValue;
  directDuel(options?: { variant?: number }): RuntimeValue;
  directProduction(options: { presetId: string; format?: ProductionFormat; vehicleId?: string }): Promise<RuntimeValue>;
  applyProductionCamera(rig: ProductionRigId): void;
  setProductionFormat(format: ProductionFormat): void;
  readonly productionFormat: ProductionFormat;
  setCamera(config: Readonly<Record<string, RuntimeValue>>): RuntimeValue;
  recordVideo(options: { readonly fps: number; readonly download: boolean }): Promise<{ size: number }>;
  stopRecording(): RuntimeValue;
  capture(options: { readonly width: number; readonly height?: number; readonly download: boolean }): RuntimeValue;
  exportFilm(options: StudioFilmExportOptions): Promise<{ readonly bytes: number }>;
  cancelFilmExport(): RuntimeValue;
  filmExportStatus(): { readonly active: boolean; readonly supported: boolean };
  getFilm(): StudioFilmSettings | null;
  setFilm(patch: Readonly<Record<string, RuntimeValue>> | null): RuntimeValue;
  load(state: RuntimeValue): Promise<RuntimeValue>;
  updateEffect(id: string, patch: Readonly<Record<string, RuntimeValue>>): RuntimeValue;
  removeEffect(id: string): RuntimeValue;
  selectEffect(id: string): RuntimeValue;
  selectCameraShot(id: string): RuntimeValue;
  updateCameraShot(id: string, patch: Readonly<Record<string, RuntimeValue>>): RuntimeValue;
  removeCameraShot(id: string): RuntimeValue;
}

interface SliderControl {
  readonly row: HTMLDivElement;
  readonly input: HTMLInputElement;
  set(value: number): void;
  setRange(min: number, max: number): void;
}

interface PanelGroup {
  readonly root: HTMLElement;
  readonly body: HTMLElement;
}

type StudioEffectAction = readonly [string, () => RuntimeValue, boolean?];

function imageFor(
  catalog: Readonly<Record<string, string>>,
  id: string,
): string | undefined {
  return catalog[id];
}

function errorMessage(error: RuntimeValue): string {
  return error instanceof Error ? error.message : String(error);
}

interface StudioPanelRuntime {
  readonly root: HTMLDivElement;
  show(): void;
  hide(): void;
  setBusy(text: string | null): void;
  /**
   * A scene-link notice: the sentence, and an optional technical detail on its own line. Information fades after a few
   * seconds; an error stays until dismissed or replaced, and announces assertively.
   */
  notice(text: string, tone?: 'info' | 'error', detail?: string): void;
  setPlaceArmed(specId: string | null): void;
  setSelected(actor: StudioActor | null): void;
  setSelectedEffect(effect: StudioEffect | null): void;
  refreshActors(): void;
  refreshSelected(): void;
  refreshEffects(): void;
  refreshCamera(): void;
  refreshTime(): void;
  refreshStoryboard(): void;
  refreshMap(): void;
  refreshPicture(): void;
  refreshAll(): void;
  tick(dt: number): void;
}

/** Glyphs the sprite does not draw (step back, pause, step forward, add) and the mark, in its stroke: constant markup. */
const STUDIO_GLYPHS = Object.freeze({
  mark: '<svg class="cot-mark" viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false"><path d="M2 8V2h6M16 2h6v6M22 16v6h-6M8 22H2v-6" fill="none" stroke="currentColor" stroke-width="2"/><path d="M6.5 16.5 12 8.2l5.5 8.3" fill="none" stroke="var(--accent)" stroke-width="2.4" stroke-linecap="square" stroke-linejoin="miter"/></svg>',
  stepBack: '<svg class="cot-i" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square"><path d="M6 5v14M18 5 9 12l9 7Z"/></svg>',
  pause: '<svg class="cot-i" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square"><path d="M8 5v14M16 5v14"/></svg>',
  stepForward: '<svg class="cot-i" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square"><path d="M18 5v14M6 5l9 7-9 7Z"/></svg>',
  plus: '<svg class="cot-i" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="square"><path d="M12 5v14M5 12h14"/></svg>',
});

/** The outliner's order (09-studio .out: Scene, Actors, Shots, Effects), the Director first and Export last. */
const OUTLINE: ReadonlyArray<readonly [WorkspaceId, IconId]> = Object.freeze([
  ['director', 'studio'], ['battlefield', 'map'], ['tanks', 'vehicle'], ['cinematics', 'toolPhoto'], ['effects', 'detonation'], ['output', 'media'],
] as const);
/** The camera keys' blends (studio.ts `transition`), as the timeline's shot cards offer them. */
const SHOT_TRANSITIONS = Object.freeze(['smooth', 'linear', 'cut', 'bezier', 'spline'] as const);
const FILM_FORMATS = Object.freeze([['landscape', '16:9'], ['portrait', '9:16'], ['square', '1:1']] as const);
/** At most this many camouflage swatches paint in one frame (each a 2 m crop of the real pattern tile). */
const SWATCHES_PER_FRAME = 3;

/**
 * Build the Studio: the Premiere direction's page 09 (streams/brand-ui/phase2/bui01/src/pages/09-studio.html) on the
 * live kit. A header (the battlefield, the frame, the scene link, Export film, exit), the outliner (the Director, the
 * scene, the tanks, the shots, the effects, export: a head per workspace, its rows under it), the viewport (the game's
 * canvas, its frame, chips and readout), the inspector (the open workspace's controls), the shelf (the site's takes) and
 * the timeline (transport and one lane per camera, tank and effect). The panel stays a thin view over the Studio API:
 * every control calls the same window.__STUDIO methods the scripted shoot uses, so anything staged by hand round-trips
 * through state()/load() unchanged.
 * @param {object} S the studio API (createStudio's `api`)
 * @returns {object} { root, show, hide, tick, setBusy, setSelected, setPlaceArmed, refreshActors, refreshSelected,
 *   refreshCamera, refreshTime, refreshAll }
 */
export function createStudioPanel(S: StudioPanelApi): StudioPanelRuntime {
  ensureFonts();

  const root = el('div', 'cot-studio');
  document.body.appendChild(root);
  const app = el('div', 'st-app');
  root.appendChild(app);
  const head = el('header', 'st-head');
  const out = el('nav', 'st-out');
  out.setAttribute('aria-label', t('studio.ws.outlineAria'));
  const vp = el('main', 'st-vp');
  const dock = el('aside', 'st-insp');
  dock.setAttribute('aria-label', t('studio.ws.inspectorAria'));
  const shelf = el('section', 'st-shelf');
  const timeline = el('section', 'st-tl');
  timeline.setAttribute('aria-label', t('studio.ws.timelineAria'));
  app.append(head, out, vp, dock, shelf, timeline);
  // keep the canvas's drag-look and fly keys from firing while a panel is in use (the viewport passes them through)
  for (const panel of [head, out, dock, shelf, timeline]) {
    for (const evName of ['pointerdown', 'pointermove', 'pointerup', 'wheel', 'keydown']) {
      panel.addEventListener(evName, (e) => e.stopPropagation());
    }
  }

  // --- the header (09-studio header) ---------------------------------------------------------------------------
  const mark = el('span', 'st');
  mark.innerHTML = STUDIO_GLYPHS.mark;
  mark.append(t('studio.ws.title'));
  const projectName = el('span', 'pn', '');
  const formatSeg = el('div', 'cot-c-seg');
  formatSeg.setAttribute('role', 'radiogroup');
  formatSeg.setAttribute('aria-label', productionLabel('format'));
  const formatButtons = FILM_FORMATS.map(([format, ratio]) => {
    const option = el('button', 'cot-c-seg__opt', ratio);
    option.type = 'button';
    option.setAttribute('role', 'radio');
    option.dataset.value = format;
    option.title = productionLabel(format);
    option.addEventListener('click', () => chooseFormat(format));
    formatSeg.appendChild(option);
    return option;
  });
  const headRight = el('div', 'r');
  const linkBtn = chipButton(t('studio.sceneLink.copyButton'), null);
  linkBtn.insertAdjacentHTML('afterbegin', SCENE_LINK_GLYPHS.link);
  linkBtn.title = t('studio.sceneLink.copyTitle');
  linkBtn.dataset.sceneLinkCopy = '';
  linkBtn.addEventListener('click', () => {
    copySceneLink(S.state(), browserSceneLinkEnv())
      .then((result) => api.notice(result.message, result.ok ? 'info' : 'error', result.detail));
  });
  const galleryBtn = chipButton(t('studioPanel.tankGallery'), 'gallery');
  galleryBtn.addEventListener('click', () => {
    const id = S._internal.selected?.spec?.id;
    window.location.href = hrefForLocale(id ? galleryHref(id) : '/gallery', getLocale());
  });
  const exportBtn = kitButton(t('studio.ws.exportFilm'), 'primary', 'record');
  exportBtn.addEventListener('click', () => startFilmExport());
  const exitBtn = kitButton(t('studio.ws.exit'), 'ghost');
  exitBtn.insertAdjacentHTML('beforeend', `<kbd class="cot-c-kbd" aria-hidden="true">F8</kbd>`);
  exitBtn.addEventListener('click', () => S.exit());
  headRight.append(linkBtn, galleryBtn, exportBtn, exitBtn);
  head.append(mark, projectName, formatSeg, headRight);

  // --- the viewport (09-studio .vp): chips, notices and the frame readout over the canvas ---------------------------
  const vpTop = el('div', 'st-vpt');
  const shotChip = chipButton('', 'toolPhoto');
  shotChip.addEventListener('click', () => productionPanel.activate('cinematics'));
  const modeChip = chipButton('', 'freeLook');
  modeChip.addEventListener('click', () => {
    if (S.getCamera().mode === 'orbit') S.setCamera({ mode: 'fly' }); else orbitCamera();
    api.refreshCamera();
  });
  vpTop.append(shotChip, modeChip);
  const vpTools = el('div', 'st-vpb');
  const guidesChip = chipButton(t('studio.ws.guides'), 'pixels', true);
  guidesChip.addEventListener('click', () => {
    const check = root.querySelector<HTMLInputElement>('[data-production-guides]');
    if (!check) return;
    check.checked = !check.checked;
    check.dispatchEvent(new Event('change'));
    guidesChip.setAttribute('aria-pressed', String(check.checked));
  });
  const lensChip = chipButton('', 'optics');
  lensChip.addEventListener('click', () => productionPanel.activate('cinematics'));
  vpTools.append(guidesChip, lensChip);
  const frameCounter = el('span', 'st-fc');
  vp.append(vpTop, vpTools, frameCounter);

  const busy = el('div', 'busy');
  vp.appendChild(busy);
  // Scene-link notices: a glyph (constant markup), the sentence and the detail as text, and a dismiss button.
  const notice = el('div', 'notice');
  notice.dataset.studioNotice = '';
  const noticeGlyph = el('span', 'ng');
  const noticeText = el('div', 'nt');
  const noticeMessage = el('b');
  // the technical reason (a refused field's path) waits behind Details; the sentence says what happened and what to do
  const noticeMore = el('details', 'nd');
  const noticeDetail = el('code');
  noticeMore.append(el('summary', null, t('studio.sceneLink.details')), noticeDetail);
  noticeText.append(noticeMessage, noticeMore);
  const noticeClose = el('button', 'nx', '×');
  noticeClose.type = 'button';
  noticeClose.setAttribute('aria-label', t('studio.sceneLink.dismiss'));
  noticeClose.title = t('studio.sceneLink.dismiss');
  notice.append(noticeGlyph, noticeText, noticeClose);
  vp.appendChild(notice);
  let noticeTimer: ReturnType<typeof setTimeout> | null = null;
  const hideNotice = (): void => {
    if (noticeTimer !== null) clearTimeout(noticeTimer);
    noticeTimer = null;
    delete notice.dataset.open;
  };
  noticeClose.addEventListener('click', hideNotice);

  // --- the outliner (09-studio .out): one group per workspace, its head the workspace's switch ----------------------
  const outlineGroups = new Map<WorkspaceId, HTMLDivElement>();
  const outlineHeads = new Map<WorkspaceId, HTMLButtonElement>();
  for (const [id] of OUTLINE) {
    const group = el('div', 'og');
    group.dataset.og = id;
    group.appendChild(el('div', 'gh'));
    outlineGroups.set(id, group);
    out.appendChild(group);
  }
  /** A group head's trailing "+": adds to that workspace and opens it. */
  function addButton(id: WorkspaceId, label: string, action: () => void): HTMLButtonElement {
    const add = el('button', 'add');
    add.type = 'button';
    add.innerHTML = STUDIO_GLYPHS.plus;
    add.setAttribute('aria-label', label);
    add.title = label;
    add.addEventListener('click', () => { productionPanel.activate(id); action(); });
    outlineGroups.get(id)?.querySelector('.gh')?.appendChild(add);
    return add;
  }
  const sceneRows = el('div', 'og-rows');
  const actorRows = el('div', 'og-rows');
  const shotRows = el('div', 'og-rows');
  const effectRows = el('div', 'og-rows');
  outlineGroups.get('battlefield')?.appendChild(sceneRows);
  outlineGroups.get('tanks')?.appendChild(actorRows);
  outlineGroups.get('cinematics')?.appendChild(shotRows);
  outlineGroups.get('effects')?.appendChild(effectRows);

  // === BATTLEFIELD group ===
  const battlefieldGroup = panelGroup('01', 'battlefield', t('studioPanel.panel.battlefield.title'));
  dock.appendChild(battlefieldGroup.root);
  const secScene = section('map', t('studioPanel.section.map'), 'map');
  const mapPick = el('div', 'mapPick');
  const mapBtn = el('button', 'mapBtn');
  mapBtn.type = 'button';
  mapBtn.setAttribute('aria-haspopup', 'listbox');
  mapBtn.setAttribute('aria-expanded', 'false');
  mapBtn.setAttribute('aria-label', t('studioPanel.map.chooseAria'));
  const mapHero = document.createElement('img');
  mapHero.className = 'mhero';
  mapHero.alt = '';
  mapHero.draggable = false;
  const mapShade = el('span', 'mshade');
  const mapCopy = el('span', 'mcopy');
  const mapName = el('span', 'mn');
  mapCopy.append(mapName);
  const mapId = el('span', 'mid');
  const mapArrow = el('span', 'mar');
  mapArrow.innerHTML = uiIconSVG('chevronDown', 16);
  mapBtn.append(mapHero, mapShade, mapCopy, mapId, mapArrow);
  const mapPop = el('div', 'mapPop');
  mapPop.setAttribute('role', 'listbox');
  mapPop.setAttribute('aria-label', t('studioPanel.map.listAria'));
  const mapGrid = el('div', 'mapGrid');
  const mapCards = new Map<string, HTMLButtonElement>();
  const mapImages: HTMLImageElement[] = [];
  for (const id of S.MAP_IDS) {
    const info = S.getMapInfo ? S.getMapInfo(id) : { name: id };
    const card = el('button', 'mapCard');
    card.type = 'button';
    card.dataset.mapId = id;
    card.setAttribute('role', 'option');
    card.setAttribute('aria-selected', 'false');
    card.setAttribute('aria-label', t('studioPanel.map.cardAria', { name: info.name || id }));
    const thumb = document.createElement('img');
    thumb.alt = '';
    thumb.loading = 'lazy';
    thumb.decoding = 'async';
    thumb.dataset.src = imageFor(MAP_THUMBS, id) || '';
    mapImages.push(thumb);
    card.append(thumb, el('span', 'cn', info.name || id), el('span', 'check', '✓'));
    card.addEventListener('click', () => chooseMap(id));
    mapCards.set(id, card);
    mapGrid.appendChild(card);
  }
  mapPop.append(mapGrid);
  mapPick.append(mapBtn, mapPop);
  secScene.appendChild(mapPick);
  // the times of day: a segmented row (09-studio .seg), the times this map has enabled
  const timeSeg = el('div', 'cot-c-seg');
  timeSeg.setAttribute('role', 'radiogroup');
  timeSeg.setAttribute('aria-label', t('studioPanel.timeOfDay'));
  const timeOptions = new Map<StudioTimeOfDay, HTMLButtonElement>();
  let timeBusy = false;
  for (const time of STUDIO_TIMES) {
    const option = el('button', 'cot-c-seg__opt', t(`atmosphere.${time}`));
    option.type = 'button';
    option.setAttribute('role', 'radio');
    option.dataset.value = time;
    option.addEventListener('click', () => {
      if (timeBusy || time === S.timeOfDay) return;
      timeBusy = true;
      for (const other of timeOptions.values()) other.disabled = true;
      S.setTimeOfDay(time)
        .catch((error: RuntimeValue) => flashBusy(errorMessage(error)))
        .finally(() => { timeBusy = false; api.refreshMap(); });
    });
    timeOptions.set(time, option);
    timeSeg.appendChild(option);
  }
  secScene.appendChild(timeSeg);

  // --- the sun (media r5): bearing on a north-up compass (world +Z up, -X right, as the tactical map), lighting
  // presets relative to the camera, elevation inside the time's band. Slider-rate changes coalesce to one apply.
  const secLight = el('div', 'sec');
  secLight.appendChild(sectionHead(t('studio.ws.light'), 'timeDay'));
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const svg = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] => {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
    return node;
  };
  const sunBlock = el('div', 'sun');
  const dial = svg('svg', { viewBox: '-50 -50 100 100', class: 'sunDial', role: 'slider', tabindex: 0,
    'aria-label': t('studioPanel.light.bearingAria'), 'aria-valuemin': 0, 'aria-valuemax': 359 });
  dial.append(svg('circle', { r: 44, class: 'ring', 'stroke-width': 1 }), svg('circle', { r: 30, class: 'ring', 'stroke-width': 1 }));
  for (let tick = 0; tick < 360; tick += 30) {
    const a = tick * Math.PI / 180, r0 = tick % 90 ? 40 : 36;
    dial.appendChild(svg('line', { x1: -Math.sin(a) * r0, y1: -Math.cos(a) * r0, x2: -Math.sin(a) * 44, y2: -Math.cos(a) * 44,
      class: tick % 90 ? 'tick' : 'tick major', 'stroke-width': 1 }));
  }
  const north = svg('text', { x: 0, y: -24, 'text-anchor': 'middle', class: 'north' });
  north.textContent = t('studioPanel.light.north');
  const camWedge = svg('path', { d: 'M0 0 L-9 -30 A31 31 0 0 1 9 -30 Z', class: 'cam', 'stroke-width': 1 });
  const sunRay = svg('line', { x1: 0, y1: 0, x2: 0, y2: -38, class: 'ray', 'stroke-width': 1.5 });
  const sunDot = svg('circle', { cx: 0, cy: -38, r: 6.5, class: 'sun', 'stroke-width': 1.5 });
  dial.append(north, camWedge, sunRay, sunDot);
  const sunSide = el('div', 'sunSide');
  const sunRead = el('div', 'sunRead');
  const bearingRead = el('span');
  const elevationRead = el('span');
  sunRead.append(bearingRead, elevationRead);
  const sunPresets = el('div', 'sunPresets');
  const presetButtons: HTMLButtonElement[] = [];
  const cameraBearing = (): number => {
    const c = S.getCamera();
    const dx = c.lookAt[0] - c.pos[0], dz = c.lookAt[2] - c.pos[2];
    return ((Math.atan2(dx, dz) * 180 / Math.PI) % 360 + 360) % 360;
  };
  // relative to the camera's bearing: the sun ahead (backlight), just off-axis ahead (rim), across (side), behind (front)
  for (const [key, offset] of [['back', 0], ['rim', 32], ['side', 90], ['front', 180], ['map', null]] as const) {
    const button = chipButton(t(`studioPanel.light.${key}`), null, offset === null ? false : undefined);
    button.title = t(`studioPanel.light.${key}Hint`);
    button.addEventListener('click', () => {
      const bearing = offset === null ? null : Math.round(((cameraBearing() + offset) % 360 + 360) % 360);
      queueLight({ sunAzimuthDeg: bearing });
    });
    presetButtons.push(button);
    sunPresets.appendChild(button);
  }
  const sunNote = el('div', 'note', '');
  sunSide.append(sunRead, sunPresets);
  sunBlock.append(dial, sunSide);
  const lampBtn = chipButton(t('studioPanel.light.headlights'), 'lampOk', false);
  lampBtn.title = t('studioPanel.light.headlightsHint');
  lampBtn.addEventListener('click', () => queueLight({ headlights: !S.getLight().headlights }));
  const elevation = sliderRow(t('studioPanel.light.elevation'), 1, 80, 0.5, (value) => {
    queueLight({ sunElevationDeg: value });
  });
  elevation.input.setAttribute('aria-label', t('studioPanel.light.elevationAria'));
  const elevationReset = chipButton(t('studioPanel.light.auto'), null, false);
  elevationReset.title = t('studioPanel.light.autoHint');
  elevationReset.addEventListener('click', () => queueLight({ sunElevationDeg: null }));
  const lampRow = el('div', 'grid');
  lampRow.append(lampBtn, elevationReset);
  secLight.append(sunBlock, elevation.row, lampRow, sunNote);

  // one apply in flight; the latest request waits behind it (a dragged dial never queues a backlog)
  let lightInFlight: Promise<void> | null = null;
  let lightPending: Record<string, number | boolean | null> | null = null;
  function queueLight(patch: Record<string, number | boolean | null>): void {
    lightPending = { ...(lightPending ?? {}), ...patch };
    if (lightInFlight) return;
    const pump = async (): Promise<void> => {
      while (lightPending) {
        const next = lightPending;
        lightPending = null;
        try { await S.setLight(next as StudioLight); } catch (error) { flashBusy(errorMessage(error as RuntimeValue)); }
      }
    };
    lightInFlight = pump().finally(() => { lightInFlight = null; refreshSun(); });
  }
  const bearingFromPointer = (event: PointerEvent): number => {
    const box = dial.getBoundingClientRect();
    const x = event.clientX - (box.left + box.width / 2), y = event.clientY - (box.top + box.height / 2);
    // dial right = world -X, dial up = world +Z
    return Math.round(((Math.atan2(-x, -y) * 180 / Math.PI) % 360 + 360) % 360);
  };
  let dialDrag = false;
  dial.addEventListener('pointerdown', (event) => {
    dialDrag = true;
    dial.classList.add('drag');
    dial.setPointerCapture(event.pointerId);
    queueLight({ sunAzimuthDeg: bearingFromPointer(event) });
  });
  dial.addEventListener('pointermove', (event) => {
    if (dialDrag) queueLight({ sunAzimuthDeg: bearingFromPointer(event) });
  });
  const endDrag = (): void => { dialDrag = false; dial.classList.remove('drag'); };
  dial.addEventListener('pointerup', endDrag);
  dial.addEventListener('pointercancel', endDrag);
  dial.addEventListener('keydown', (event) => {
    const step = event.shiftKey ? 15 : 5;
    const current = S.getLight().sunAzimuthDeg ?? 0;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') queueLight({ sunAzimuthDeg: (current + 360 - step) % 360 });
    else if (event.key === 'ArrowRight' || event.key === 'ArrowUp') queueLight({ sunAzimuthDeg: (current + step) % 360 });
    else return;
    event.preventDefault();
  });
  function refreshSunCamera(): void {
    // the wedge points along the camera's bearing (dial up = world +Z, so a bearing turns it counter-clockwise)
    camWedge.setAttribute('transform', `rotate(${(-cameraBearing()).toFixed(1)})`);
  }
  function refreshSun(): void {
    const light = S.getLight();
    const az = light.sunAzimuthDeg ?? 0, elev = light.sunElevationDeg ?? 0;
    const a = az * Math.PI / 180;
    const radius = 38 - Math.max(0, Math.min(1, elev / 80)) * 18; // a high sun stands nearer the centre
    sunDot.setAttribute('cx', String(-Math.sin(a) * radius));
    sunDot.setAttribute('cy', String(-Math.cos(a) * radius));
    sunRay.setAttribute('x2', String(-Math.sin(a) * radius));
    sunRay.setAttribute('y2', String(-Math.cos(a) * radius));
    sunDot.setAttribute('class', `sun${light.time === 'night' ? ' night' : light.time === 'dusk' ? ' dusk' : ''}`);
    refreshSunCamera();
    dial.setAttribute('aria-valuenow', String(Math.round(az)));
    dial.setAttribute('aria-valuetext', t('studioPanel.light.bearingValue', { deg: Math.round(az) }));
    bearingRead.replaceChildren(`${t('studioPanel.light.bearing')} `, el('b', null, `${Math.round(az)}°`));
    elevationRead.replaceChildren(`${t(light.time === 'night' ? 'studioPanel.light.moon' : 'studioPanel.light.sun')} `,
      el('b', null, `${elev.toFixed(1)}°`));
    elevation.setRange(light.band.min, light.band.max);
    elevation.set(elev);
    press(elevationReset, light.override?.sunElevationDeg === undefined);
    press(presetButtons[4], light.override?.sunAzimuthDeg === undefined);
    sunNote.textContent = light.space ? t('studioPanel.light.spaceNote') : '';
    press(lampBtn, light.headlights);
    for (const [time, option] of timeOptions) {
      option.disabled = timeBusy || !light.times.includes(time);
      option.setAttribute('aria-checked', String(time === light.time));
      option.tabIndex = time === light.time ? 0 : -1;
    }
    lightRow.pick.querySelector('.d')!.textContent = `${Math.round(az)}° / ${Math.round(elev)}°`;
  }
  battlefieldGroup.body.append(secScene, secLight);

  // the scene's outliner rows: the battlefield (09-studio "Glacier Pass") and its light ("Morning · 105° / 15°")
  const mapRow = outlineRow(() => { productionPanel.activate('battlefield'); toggleMapPick(true); });
  const mapRowThumb = document.createElement('img');
  mapRowThumb.className = 'th';
  mapRowThumb.alt = '';
  mapRowThumb.decoding = 'async';
  mapRow.pick.append(mapRowThumb, el('span', 'nm', ''));
  const lightRow = outlineRow(() => { productionPanel.activate('battlefield'); secLight.scrollIntoView({ block: 'nearest' }); });
  lightRow.pick.innerHTML = uiIconSVG('timeDay', 16);
  lightRow.pick.append(el('span', 'nm', ''), el('span', 'd', ''));
  sceneRows.append(mapRow.row, lightRow.row);

  let mapPreviewsHydrated = false;
  function hydrateMapPreviews() {
    if (mapPreviewsHydrated) return;
    mapPreviewsHydrated = true;
    for (const image of mapImages) {
      if (image.dataset.src) image.src = image.dataset.src;
    }
  }
  function toggleMapPick(open?: boolean): void {
    const next = open != null ? open : !mapPop.classList.contains('open');
    mapPop.classList.toggle('open', next);
    mapBtn.setAttribute('aria-expanded', String(next));
    if (next) {
      hydrateMapPreviews();
      const currentMapId = S.mapId;
      if (currentMapId) {
        requestAnimationFrame(() => mapCards.get(currentMapId)?.focus({ preventScroll: true }));
      }
    }
  }
  function setMapLoading(loading: boolean): void {
    mapBtn.disabled = loading;
    mapPick.setAttribute('aria-busy', String(loading));
    for (const card of mapCards.values()) card.disabled = loading;
  }
  function chooseMap(id: string): void {
    toggleMapPick(false);
    if (!id || id === S.mapId) return;
    setMapLoading(true);
    Promise.resolve(S.setMap(id))
      .catch((error: RuntimeValue) => flashBusy(t('studio.mapFailed', { error: errorMessage(error) })))
      .finally(() => {
        setMapLoading(false);
        api.refreshMap();
      });
  }
  mapBtn.addEventListener('click', () => toggleMapPick());
  mapPop.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      toggleMapPick(false);
      mapBtn.focus();
    }
  });
  document.addEventListener('pointerdown', (event) => {
    if (mapPop.classList.contains('open') &&
        !(event.target instanceof Node && (mapPick.contains(event.target) || mapRow.row.contains(event.target)))) toggleMapPick(false);
  });

  // === TANKS group ===
  const tanksGroup = panelGroup('02', 'tanks', t('studioPanel.panel.tanks.title'));
  dock.appendChild(tanksGroup.root);

  // === SELECTED ACTOR section (09-studio .insp: the hero card, Transform, Pose, Paint and state) ===
  const secSel = section('selectedTank', t('studioPanel.section.selectedTank'), 'vehicle');
  const hero = el('div', 'st-hero');
  const heroSil = el('span', 'cot-c-sil');
  const heroName = el('span', 'nm', '');
  hero.append(heroSil, heroName);
  secSel.appendChild(hero);
  const transform = el('div', 'sec');
  transform.appendChild(sectionHead(t('studio.ws.transform'), 'freeLook'));
  const fields = el('div', 'fld');
  const px = numField('x', (v) => patchSel({ x: v }));
  const pz = numField('z', (v) => patchSel({ z: v }));
  const heading = numField('°', (v) => patchSel({ facingDeg: ((v % 360) + 360) % 360 }));
  fields.append(px.label, pz.label, heading.label);
  transform.appendChild(fields);
  const pose = el('div', 'sec');
  pose.appendChild(sectionHead(t('studio.ws.pose'), 'turretRing'));
  const facing = sliderRow(t('studio.ws.facing'), 0, 360, 1, (v) => patchSel({ facingDeg: v }), 'steerLeft');
  const turret = sliderRow(t('studio.ws.turret'), -180, 180, 1, (v) => patchSel({ turretDeg: v }), 'turretRing');
  const gun = sliderRow(t('studio.ws.gun'), -10, 25, 0.5, (v) => patchSel({ gunDeg: v }), 'gun');
  const recoilBtn = chipButton(t('studio.recoilPose'), 'fireGun');
  recoilBtn.addEventListener('click', () => patchSel({ recoilAgeS: 0.05 }));
  pose.append(facing.row, turret.row, gun.row, recoilBtn);
  // paint: the garage's pick and every catalogue pattern as its real swatch, painted as it scrolls into view
  const paint = el('div', 'sec');
  paint.appendChild(sectionHead(t('studio.ws.paint'), 'camouflage'));
  const swatches = el('div', 'sw');
  swatches.setAttribute('role', 'group');
  swatches.setAttribute('aria-label', t('studioPanel.selected.camoLabel'));
  const swatchButtons = new Map<string, HTMLButtonElement>();
  const inheritSwatch = chipButton(t('studioPanel.selected.camoInherit'), null, true);
  inheritSwatch.addEventListener('click', () => patchSel({ camo: null }));
  swatchButtons.set('inherit', inheritSwatch);
  swatches.appendChild(inheritSwatch);
  for (const cid of S.CAMO_PATTERN_IDS) {
    const swatch = el('button');
    swatch.type = 'button';
    swatch.setAttribute('aria-pressed', 'false');
    swatch.setAttribute('aria-label', cid);
    swatch.title = cid;
    swatch.dataset.camo = cid;
    swatch.appendChild(document.createElement('canvas'));
    swatch.addEventListener('click', () => patchSel({ camo: cid }));
    swatchButtons.set(cid, swatch);
    swatches.appendChild(swatch);
  }
  const stateSeg = el('div', 'cot-c-seg');
  stateSeg.setAttribute('role', 'radiogroup');
  stateSeg.setAttribute('aria-label', t('studioPanel.selected.stateLabel'));
  const stateButtons = new Map<string, HTMLButtonElement>();
  for (const sid of S.ACTOR_STATES) {
    const option = el('button', 'cot-c-seg__opt', t(`studio.ws.state.${sid}`));
    option.type = 'button';
    option.setAttribute('role', 'radio');
    option.dataset.value = sid;
    option.addEventListener('click', () => {
      const a = S._internal.selected;
      if (a) S.setActorState(a, sid);
    });
    stateButtons.set(sid, option);
    stateSeg.appendChild(option);
  }
  paint.append(swatches, stateSeg);
  const delBtn = kitButton(t('studio.remove'), 'danger', 'trash');
  delBtn.classList.add('cot-c-btn--wide');
  delBtn.addEventListener('click', () => { const a = S._internal.selected; if (a) S.removeActor(a); });
  secSel.append(transform, pose, paint, delBtn);
  const selEmpty = el('div', 'note', t('studioPanel.emptySelected'));
  tanksGroup.body.append(selEmpty, secSel);

  // lazy, batched swatch painting: only what is on screen, a few per frame, each pattern once per tank
  let swatchSpecId = '';
  let swatchPainter: Promise<SwatchPainter> | null = null;
  const swatchQueue: HTMLButtonElement[] = [];
  let swatchFrame = 0;
  const swatchObserver = typeof IntersectionObserver === 'function' ? new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const button = entry.target as HTMLButtonElement;
      if (button.dataset.painted !== swatchSpecId) swatchQueue.push(button);
    }
    pumpSwatches();
  }, { root: dock }) : null;
  for (const [cid, button] of swatchButtons) if (cid !== 'inherit') swatchObserver?.observe(button);
  function pumpSwatches(): void {
    if (swatchFrame || !swatchQueue.length || !swatchSpecId) return;
    swatchPainter ??= Promise.all([import('./camoSwatchPainter.ts'), import('../vehicles/specs.ts')])
      .then(([painter, specs]) => ({ paint: painter.paintCamoSwatch, spec: specs.getSpec }));
    swatchFrame = requestAnimationFrame(() => {
      swatchFrame = 0;
      void swatchPainter?.then((painter) => {
        const spec = painter.spec(swatchSpecId);
        for (const button of swatchQueue.splice(0, SWATCHES_PER_FRAME)) {
          const canvas = button.querySelector('canvas');
          if (!canvas || !spec || !button.dataset.camo || button.dataset.painted === swatchSpecId) continue;
          painter.paint(canvas, spec as unknown as Parameters<SwatchPainter['paint']>[1], button.dataset.camo);
          button.dataset.painted = swatchSpecId;
        }
        pumpSwatches();
      });
    });
  }
  function repaintSwatches(specId: string): void {
    if (specId === swatchSpecId) return;
    swatchSpecId = specId;
    swatchQueue.length = 0;
    // a new tank wears every pattern its own way: the observer re-reports what is on screen
    for (const [cid, button] of swatchButtons) {
      if (cid === 'inherit' || !swatchObserver) continue;
      swatchObserver.unobserve(button);
      swatchObserver.observe(button);
    }
  }

  // === ADD TANKS section: the roster picker (flag, silhouette, name, era), add in view or click to place ===
  const secActors = section('addTanks', t('studioPanel.section.addTanks'), 'zoomIn');
  let pickedId = 'm1a1_abrams_hc';
  const pick = el('div', 'pick');
  const pickBtn = el('button', 'pickBtn');
  pickBtn.type = 'button';
  const pickIdentity = el('span', 'id');
  const pickName = el('span', 'nm', '');
  const pickArrow = el('span', 'ar');
  pickArrow.innerHTML = uiIconSVG('chevronDown', 16);
  pickBtn.append(pickIdentity, pickName, pickArrow);
  const pickPop = el('div', 'pickPop');
  const pickFlt = document.createElement('input');
  pickFlt.type = 'search';
  pickFlt.className = 'flt';
  pickFlt.placeholder = t('studioPanel.picker.filterPlaceholder');
  pickFlt.setAttribute('aria-label', t('studioPanel.picker.filterPlaceholder'));
  const pickList = el('div', 'lst');
  pickPop.append(pickFlt, pickList);
  pick.append(pickBtn, pickPop);
  secActors.appendChild(pick);

  const specInfo = (id: string): StudioSpecInfo => {
    try { return S.getSpecInfo(id); } catch (_) { return { id, name: id, era: '' }; }
  };
  function setPicked(id: string): void {
    pickedId = id;
    pickName.textContent = specInfo(id).name;
    pickIdentity.replaceChildren(...identity(id));
  }
  function buildPickList(filter = ''): void {
    pickList.textContent = '';
    const f = filter.trim().toLowerCase();
    const groups: ReadonlyArray<readonly [string, string[]]> = [
      [t('studioPanel.picker.productionGroup'), S.TANK_IDS.filter((id) => !specInfo(id).developmentOnly)],
      [t('studioPanel.picker.developmentGroup'), S.TANK_IDS.filter((id) => specInfo(id).developmentOnly)],
    ];
    for (const [label, ids] of groups) {
      const hits = ids.filter((id) => {
        if (!f) return true;
        const info = specInfo(id);
        return id.toLowerCase().includes(f) || String(info.name).toLowerCase().includes(f);
      });
      if (!hits.length) continue;
      pickList.appendChild(el('div', 'pgh', label));
      for (const id of hits) {
        const info = specInfo(id);
        const row = el('button', 'prow' + (id === pickedId ? ' cur' : ''));
        row.type = 'button';
        row.append(...identity(id));
        row.appendChild(el('span', 'nm', info.name));
        const tagText = info.developmentOnly ? info.rosterTag || t('studioPanel.picker.devFallback')
          : info.era ? vehicleEraLabelI18n(info.era, t, { short: true }) : '';
        if (tagText) row.appendChild(el('span', 'e', tagText));
        row.addEventListener('click', () => {
          setPicked(id);
          togglePick(false);
        });
        pickList.appendChild(row);
      }
    }
  }
  function togglePick(open?: boolean): void {
    const o = open != null ? open : !pickPop.classList.contains('open');
    pickPop.classList.toggle('open', o);
    if (o) {
      pickFlt.value = '';
      buildPickList();
      pickFlt.focus();
    }
  }
  pickBtn.addEventListener('click', () => togglePick());
  pickFlt.addEventListener('input', () => buildPickList(pickFlt.value));
  pickFlt.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') togglePick(false);
    if (e.key === 'Enter') {
      const first = pickList.querySelector<HTMLElement>('.prow');
      if (first) first.click();
    }
  });
  document.addEventListener('pointerdown', (e) => {
    if (pickPop.classList.contains('open') &&
        !(e.target instanceof Node && pick.contains(e.target))) togglePick(false);
  });
  setPicked(pickedId);

  const addRow2 = el('div', 'grid');
  const addAtMarker = kitButton(t('studio.addInView'));
  addAtMarker.title = t('studio.addInViewTitle');
  addAtMarker.addEventListener('click', () => {
    const point = S._internal.markerActive
      ? S._internal.markerPos
      : (() => {
        const camera = S.getCamera();
        return { x: camera.lookAt[0], z: camera.lookAt[2] };
      })();
    S.addActor({ id: pickedId, pos: [point.x, point.z] });
  });
  const placeBtn = kitButton(t('studio.clickToPlace'));
  placeBtn.setAttribute('aria-pressed', 'false');
  placeBtn.addEventListener('click', () => {
    S._internal.placeArmed = S._internal.placeArmed ? null : pickedId;
    api.setPlaceArmed(S._internal.placeArmed);
  });
  addRow2.append(addAtMarker, placeBtn);
  secActors.appendChild(addRow2);
  tanksGroup.body.appendChild(secActors);
  addButton('tanks', t('studio.ws.addTank'), () => { secActors.scrollIntoView({ block: 'nearest' }); togglePick(true); });

  // === EFFECTS group ===
  const effectsGroup = panelGroup('03', 'effects', t('studioPanel.panel.effects.title'));
  dock.appendChild(effectsGroup.root);
  const secFx = section('layersEvents', t('studioPanel.section.layersEvents'), 'detonation');
  const fxStack = el('div', 'fxstack');
  fxStack.setAttribute('role', 'listbox');
  fxStack.setAttribute('aria-label', t('studioPanel.effects.listAria'));
  const clearStackBtn = kitButton(t('studio.clearAll'), 'danger', 'trash');
  clearStackBtn.classList.add('cot-c-btn--wide');
  clearStackBtn.addEventListener('click', () => S.clearEffects());
  secFx.append(fxStack, clearStackBtn);
  const selOr = <Result>(fn: (actor: StudioActor | null) => Result): Result =>
    fn(S._internal.selected);
  const withSelected = <Result>(fn: (actor: StudioActor) => Result): Result | null => {
    const actor = S._internal.selected;
    if (!actor) { flashBusy(t('studio.selectActorFirst')); return null; }
    return fn(actor);
  };
  const atMarker = <Result>(fn: () => Result): Result | null => {
    if (!S._internal.markerActive) {
      flashBusy(t('studio.clickBattlefieldPlaceMarker'));
      return null;
    }
    return fn();
  };
  const fireProjectile = (effect: StudioEffectRecipe): RuntimeValue => {
    const fired = S.effect(effect);
    // A shell born on a frozen timeline is still at its muzzle. Advance one
    // real simulation frame so the button immediately shows the projectile
    // and its improved tracer profile without unfreezing the composition.
    if (fired && S.timeScale === 0) S.advanceFx(1000 / 60);
    return fired;
  };
  /** actor-anchored when one is selected, marker-anchored otherwise */
  const impactFx = (kind: string, hFrac = 0.55, caliberMm = 120) => withSelected((a) => S.effect({
    type: 'impact', actor: a.uid, hFrac, params: { kind, caliberMm, normal: [0.15, 0.35, -0.92] },
  }));
  const secBoard = el('div', 'sec');
  secBoard.appendChild(sectionHead(t('studio.ws.addEffect'), 'detonation'));
  function fxGroup(title: string, defs: readonly StudioEffectAction[]): void {
    const g = el('div', 'fxg');
    g.appendChild(el('div', 'gh', title));
    const grid = el('div', 'grid');
    for (const [label, fn, wide] of defs) {
      const b = chipButton(label, null);
      if (wide) b.style.gridColumn = '1 / -1';
      b.addEventListener('click', fn);
      grid.appendChild(b);
    }
    g.appendChild(grid);
    secBoard.appendChild(g);
  }
  fxGroup(t('studioPanel.fxGroup.gunnery'), [
    [t('studioPanel.fx.fireGun'), () => withSelected((a) => fireProjectile({ type: 'fire', actor: a.uid }))],
    [t('studioPanel.fx.muzzleFlash'), () => selOr((a) => S.effect(a
      ? { type: 'muzzle_flash', actor: a.uid } : { type: 'muzzle_flash' }))],
    [t('studioPanel.fx.mgBurst'), () => withSelected((a) => S.effect({ type: 'mg_burst', actor: a.uid }))],
    [t('studioPanel.fx.recoilFlash'), () => withSelected((a) => S.effect({ type: 'firing_moment', actor: a.uid, params: { ageS: 0.05 } }))],
    [t('studioPanel.fx.tracerMarker'), () => withSelected((a) => {
      if (!S._internal.markerActive) {
        flashBusy(t('studioPanel.fx.placeTracerOrigin'));
        return false;
      }
      const m = S._internal.markerPos;
      const actorPos = a.state.pos;
      fireProjectile({
        type: 'tracer',
        from: [m.x, m.y + 1.8, m.z],
        to: [actorPos.x, actorPos.y + a.spec.dims.heightM * 0.6, actorPos.z],
        params: { shellType: 'APFSDS' },
      });
    }), true],
  ]);
  fxGroup(t('studioPanel.fxGroup.strikes'), [
    [t('studioPanel.fx.explSmall'), () => atMarker(() => S.effect({ type: 'explosion', params: { size: 'small' } }))],
    [t('studioPanel.fx.explMedium'), () => atMarker(() => S.effect({ type: 'explosion', params: { size: 'medium' } }))],
    [t('studioPanel.fx.explLarge'), () => atMarker(() => S.effect({ type: 'explosion', params: { size: 'large' } }))],
    [t('studioPanel.fx.barrage'), () => atMarker(() => S.effect({ type: 'barrage', params: { count: 5, radiusM: 10 } }))],
    [t('studioPanel.fx.dustBurst'), () => atMarker(() => S.effect({ type: 'dust' }))],
    [t('studioPanel.fx.sparks'), () => atMarker(() => S.effect({ type: 'sparks' }))],
    [t('studioPanel.fx.frozenFireball'), () => atMarker(() => S.effect({
      type: 'explosion_moment', params: { ageS: 0.6 },
    })), true],
  ]);
  fxGroup(t('studioPanel.fxGroup.armorHits'), [
    [t('studioPanel.fx.impactPen'), () => impactFx('pen', 0.55)],
    [t('studioPanel.fx.nonPen'), () => impactFx('nonpen', 0.5)],
    [t('studioPanel.fx.ricochet'), () => impactFx('ricochet', 0.72)],
    [t('studioPanel.fx.heSplash'), () => impactFx('he_splash', 0.5, 152)],
    [t('studioPanel.fx.eraPop'), () => impactFx('era', 0.45)],
    [t('studioPanel.fx.armorScars'), () => withSelected((a) => S.effect({ type: 'armor_scar', actor: a.uid }))],
  ]);
  fxGroup(t('studioPanel.fxGroup.vehicleState'), [
    [t('studioPanel.fx.killAmmoRack'), () => withSelected((a) => S.effect({ type: 'tank_kill', actor: a.uid }))],
    [t('studioPanel.fx.killBurnOut'), () => withSelected((a) => S.effect({ type: 'tank_kill', actor: a.uid, params: { cause: 'fire', pop: false } }))],
    [t('studioPanel.fx.detrackL'), () => withSelected((a) => S.effect({ type: 'detrack', actor: a.uid, params: { side: 'L' } }))],
    [t('studioPanel.fx.detrackR'), () => withSelected((a) => S.effect({ type: 'detrack', actor: a.uid, params: { side: 'R' } }))],
    [t('studioPanel.fx.exhaustBelch'), () => withSelected((a) => S.effect({ type: 'exhaust', actor: a.uid }))],
    [t('studioPanel.fx.engineSmoke'), () => withSelected((a) => S.effect({ type: 'engine_smoke', actor: a.uid }))],
    [t('studioPanel.fx.setBurning'), () => withSelected((a) => S.effect({ type: 'burning', actor: a.uid }))],
    [t('studioPanel.fx.extinguish'), () => withSelected((a) => {
      S.effect({ type: 'burning', actor: a.uid, params: { off: true } });
      S.effect({ type: 'engine_smoke', actor: a.uid, params: { off: true } });
    })],
  ]);
  // media r5 cinematic pyrotechnics: quality toggles + the new effect types
  const cineGroup = el('div', 'fxg');
  cineGroup.appendChild(el('div', 'gh', t('studioPanel.fxGroup.cinematic')));
  const cineToggles = el('div', 'grid3');
  const cineBtn = chipButton(t('studioPanel.fx.cinematicOff'), null, false);
  cineBtn.addEventListener('click', () => S.setFxQuality(S.fxQuality === 'cinematic' ? 'battle' : 'cinematic'));
  const dustBtn = chipButton(t('studioPanel.fx.trackDustOff'), null, false);
  dustBtn.addEventListener('click', () => S.setTrackDust(!S.trackDust));
  // the map's air (world/mapAmbience.ts): pollen, leaves, snow, dust, embers by map
  const airBtn = chipButton(t('studioPanel.fx.ambienceOn'), null, true);
  airBtn.addEventListener('click', () => { S.setAmbience(!S.ambience); refreshCinematicToggles(); });
  cineToggles.append(cineBtn, dustBtn, airBtn);
  cineGroup.appendChild(cineToggles);
  secBoard.appendChild(cineGroup);
  function refreshCinematicToggles(): void {
    const on = S.fxQuality === 'cinematic';
    press(cineBtn, on);
    setLabel(cineBtn, t(on ? 'studioPanel.fx.cinematicOn' : 'studioPanel.fx.cinematicOff'));
    press(dustBtn, S.trackDust);
    setLabel(dustBtn, t(S.trackDust ? 'studioPanel.fx.trackDustOn' : 'studioPanel.fx.trackDustOff'));
    press(airBtn, S.ambience);
    setLabel(airBtn, t(S.ambience ? 'studioPanel.fx.ambienceOn' : 'studioPanel.fx.ambienceOff'));
  }
  fxGroup(t('studioPanel.fxGroup.cinematic'), [
    [t('studioPanel.fx.smokeScreen'), () => withSelected((a) => S.effect({ type: 'smoke_screen', actor: a.uid }))],
    [t('studioPanel.fx.flare'), () => selOr((a) => (a
      ? S.effect({ type: 'flare', actor: a.uid })
      : atMarker(() => S.effect({ type: 'flare' }))))],
    [t('studioPanel.fx.embers'), () => selOr((a) => (a
      ? S.effect({ type: 'embers', actor: a.uid })
      : atMarker(() => S.effect({ type: 'embers' }))))],
    [t('studioPanel.fx.fireField'), () => atMarker(() => S.effect({ type: 'fire_field' }))],
    [t('studioPanel.fx.shockwave'), () => atMarker(() => S.effect({ type: 'shockwave' }))],
    [t('studioPanel.fx.debris'), () => atMarker(() => S.effect({ type: 'debris' }))],
    [t('studioPanel.fx.explHuge'), () => atMarker(() => S.effect({ type: 'explosion', params: { size: 'huge' } })), true],
  ]);
  // parameters of the selected layer (cinematic types): applied on release,
  // replaying the stack once per change
  const fxParamsBox = el('div', 'fxg');
  fxParamsBox.hidden = true;
  secFx.insertBefore(fxParamsBox, fxStack.nextSibling);
  let fxParamsKey = '';
  const fxParamRows = new Map<string, SliderControl>();
  function rebuildFxParams(effects: readonly StudioEffect[]): void {
    const effect = effects.find((item) => item.selected) ?? null;
    const defs = effect ? STUDIO_FX_PARAMS[effect.type] : undefined;
    if (!effect || !defs) {
      fxParamsBox.hidden = true;
      fxParamsKey = '';
      return;
    }
    fxParamsBox.hidden = false;
    const key = `${effect.id}:${effect.type}`;
    if (key !== fxParamsKey) {
      fxParamsKey = key;
      fxParamsBox.textContent = '';
      fxParamRows.clear();
      fxParamsBox.appendChild(el('div', 'gh', t('studioPanel.fxParams.title')));
      for (const def of defs) {
        const slider = sliderRow(t(def.label), def.min, def.max, def.step, () => { /* applied on release */ });
        slider.input.setAttribute('aria-label', t(def.label));
        slider.input.addEventListener('change', () => {
          S.updateEffect(effect.id, { params: { [def.key]: Number(slider.input.value) } });
        });
        fxParamsBox.appendChild(slider.row);
        fxParamRows.set(def.key, slider);
      }
    }
    for (const def of defs) {
      const row = fxParamRows.get(def.key);
      if (!row) continue;
      const raw = (effect.params as Readonly<Record<string, unknown>> | undefined)?.[def.key];
      row.set(typeof raw === 'number' && Number.isFinite(raw) ? raw : def.value);
    }
  }
  effectsGroup.body.append(secFx, secBoard);
  addButton('effects', t('studio.ws.addEffect'), () => secBoard.scrollIntoView({ block: 'start' }));

  // === GLOBAL group: the shots, the camera, the picture ===
  const globalGroup = panelGroup('04', 'cinematics', t('studioPanel.panel.cinematics.title'));
  globalGroup.root.dataset.group = 'global'; // stable automation selector
  dock.appendChild(globalGroup.root);
  const secTime = section('storyboard', t('studioPanel.section.storyboard'), 'toolPhoto');
  const shotboard = el('div', 'shotboard');
  secTime.appendChild(shotboard);
  const authorRow = el('div', 'grid');
  const addShotBtn = kitButton(t('studio.addCameraShot'));
  addShotBtn.addEventListener('click', () => S.addCameraShot());
  const keyActorBtn = kitButton(t('studio.keySelectedTank'));
  keyActorBtn.addEventListener('click', () => {
    const actor = S._internal.selected;
    if (!actor) { flashBusy(t('studio.selectTankFirst')); return; }
    S.keyActor(actor);
  });
  authorRow.append(addShotBtn, keyActorBtn);
  const railRow = el('div', 'grid');
  const railBtn = chipButton(t('studio.showCameraRail'), 'cameraPath', false);
  railBtn.addEventListener('click', () => S.setRailVisible(!S.railVisible));
  const clearTrackBtn = kitButton(t('studio.clearTankTrack'), 'danger');
  clearTrackBtn.addEventListener('click', () => {
    const actor = S._internal.selected;
    if (!actor) { flashBusy(t('studio.selectTankFirst')); return; }
    S.clearActorTrack(actor);
  });
  railRow.append(railBtn, clearTrackBtn);
  secTime.append(authorRow, railRow);
  // the take from above: routes, the camera's track and its distance and height (studioPlanView.ts)
  const planView = createPlanView(S, t);
  let planShown = true;
  const planBtn = chipButton(t('studioPanel.plan.hide'), 'map', true);
  planBtn.addEventListener('click', () => {
    planShown = !planShown;
    planView.root.hidden = !planShown;
    setLabel(planBtn, planShown ? t('studioPanel.plan.hide') : t('studioPanel.plan.show'));
    press(planBtn, planShown);
    if (planShown) planView.refreshPlan();
  });
  secTime.append(planBtn, planView.root);
  const duelBtn = kitButton(t('studio.directDuel'), 'primary');
  duelBtn.classList.add('cot-c-btn--wide');
  let duelVariant = 0;
  duelBtn.title = t('studio.directDuelTitle');
  duelBtn.addEventListener('click', () => {
    try {
      S.directDuel({ variant: duelVariant });
      duelVariant = (duelVariant + 1) % 4;
      flashBusy(t('studio.duelReady'));
    } catch (error) {
      flashBusy(errorMessage(error));
    }
  });
  const resetFxBtn = kitButton(t('studio.clearAllEffects'), 'danger');
  resetFxBtn.classList.add('cot-c-btn--wide');
  resetFxBtn.addEventListener('click', () => S.clearEffects());
  secTime.append(duelBtn, resetFxBtn);
  globalGroup.body.appendChild(secTime);
  addButton('cinematics', t('studio.ws.addShot'), () => S.addCameraShot());

  // === CAMERA section ===
  const secCam = section('camera', t('studioPanel.section.camera'), 'optics');
  const camModeSeg = el('div', 'cot-c-seg');
  camModeSeg.setAttribute('role', 'radiogroup');
  camModeSeg.setAttribute('aria-label', t('studioPanel.section.camera'));
  const flyBtn = el('button', 'cot-c-seg__opt', t('studio.freeFly'));
  const orbBtn = el('button', 'cot-c-seg__opt', t('studio.orbit'));
  for (const option of [flyBtn, orbBtn]) { option.type = 'button'; option.setAttribute('role', 'radio'); }
  flyBtn.addEventListener('click', () => { S.setCamera({ mode: 'fly' }); api.refreshCamera(); });
  orbBtn.addEventListener('click', () => { orbitCamera(); api.refreshCamera(); });
  camModeSeg.append(flyBtn, orbBtn);
  secCam.appendChild(camModeSeg);
  const fov = sliderRow(t('studio.ws.fov'), 15, 100, 1, (v) => S.setCamera({ fov: v }));
  const roll = sliderRow(t('studio.ws.roll'), -45, 45, 0.5, (v) => S.setCamera({ rollDeg: v }));
  const spd = sliderRow(t('studio.ws.flySpeed'), 2, 60, 1, (v) => { S._internal.cam.speed = v; });
  secCam.append(fov.row, roll.row, spd.row);
  globalGroup.body.appendChild(secCam);
  const secPicture = section('picture', t('studioPanel.section.picture'), 'visionThermal');
  const picturePanel = mountStudioPicturePanel(S, secPicture, {
    sliderRow, selectedActor: () => S._internal.selected, flash: (text) => flashBusy(text),
  });
  globalGroup.body.appendChild(secPicture);
  function orbitCamera(): void {
    const a = S._internal.selected;
    const m = S._internal.markerPos;
    const target = a ? a.state.pos : m;
    S.setCamera({ mode: 'orbit', lookAt: [target.x, target.y + 1.6, target.z] });
  }

  // === OUTPUT group ===
  const outputGroup = panelGroup('05', 'output', t('studioPanel.panel.output.title'));
  dock.appendChild(outputGroup.root);
  const secCap = section('output', t('studio.film.heading'), 'deploy');
  // --- film: deterministic offline export (studioFilm*.ts) ----------------------
  const filmSizeRow = el('div', 'grid');
  const filmSize = labelledSelect(t('studio.film.size'));
  for (const resolution of FILM_RESOLUTIONS) {
    const option = document.createElement('option');
    option.value = String(resolution);
    option.textContent = `${resolution}p`;
    filmSize.select.appendChild(option);
  }
  const filmFps = labelledSelect(t('studio.film.rate'));
  for (const fps of [24, 30, 60]) {
    const option = document.createElement('option');
    option.value = String(fps);
    option.textContent = t('studio.film.fpsOption', { fps });
    filmFps.select.appendChild(option);
  }
  filmSizeRow.append(filmSize.row, filmFps.row);
  secCap.appendChild(filmSizeRow);
  const filmBlurRow = el('div', 'grid');
  const filmBlur = labelledSelect(t('studio.film.blur'));
  for (const [key, samples] of [['studio.film.blurOff', 1], ['studio.film.blurDraft', 4], ['studio.film.blurGood', 8],
    ['studio.film.blurBest', 16], ['studio.film.blurMaster', 32]] as const) {
    const option = document.createElement('option');
    option.value = String(samples);
    option.textContent = t(key);
    filmBlur.select.appendChild(option);
  }
  filmBlur.select.value = '8';
  filmFps.select.value = '30';
  const filmShake = labelledSelect(t('studio.film.shake'));
  for (const [key, shake] of [['studio.film.shakeFull', 1], ['studio.film.shakeHalf', 0.5],
    ['studio.film.shakeQuarter', 0.25], ['studio.film.shakeOff', 0]] as const) {
    const option = document.createElement('option');
    option.value = String(shake);
    option.textContent = t(key);
    filmShake.select.appendChild(option);
  }
  filmShake.select.title = t('studio.film.shakeTitle');
  filmBlurRow.append(filmBlur.row, filmShake.row);
  secCap.appendChild(filmBlurRow);
  const filmSummary = el('div', 'recStatus', '');
  secCap.appendChild(filmSummary);
  const filmBtn = kitButton(t('studio.film.export'), 'primary', 'deploy');
  filmBtn.classList.add('cot-c-btn--wide');
  secCap.appendChild(filmBtn);
  // Authoring the export settings records them in the scene's `film` block.
  for (const control of [filmFps.select, filmBlur.select, filmShake.select]) {
    control.addEventListener('change', () => {
      try {
        S.setFilm({ fps: Number(filmFps.select.value), samples: Number(filmBlur.select.value), shake: Number(filmShake.select.value) });
      } catch { /* exporting */ }
      updateFilmSummary();
    });
  }
  filmSize.select.addEventListener('change', () => updateFilmSummary());
  // Export veil: blocks the canvas and panel while frames render; live preview at the native aspect.
  const filmVeil = el('div', 'filmVeil');
  filmVeil.setAttribute('role', 'dialog');
  filmVeil.setAttribute('aria-modal', 'true');
  filmVeil.setAttribute('aria-label', t('studio.film.veilTitle'));
  const veilPreview = document.createElement('canvas');
  veilPreview.className = 'fvPreview';
  const veilBar = el('div', 'fvBar');
  const veilFill = el('i');
  veilBar.appendChild(veilFill);
  const veilText = el('div', 'fvText', t('studio.film.preparing'));
  veilText.setAttribute('aria-live', 'polite');
  const veilCancel = kitButton(t('studio.film.cancel'), 'danger');
  veilCancel.addEventListener('click', () => S.cancelFilmExport());
  filmVeil.append(el('div', 'fvTitle', t('studio.film.veilTitle')), veilPreview, veilBar, veilText, veilCancel);
  for (const evName of ['pointerdown', 'pointermove', 'pointerup', 'wheel', 'keydown']) {
    filmVeil.addEventListener(evName, (e) => e.stopPropagation());
  }
  root.appendChild(filmVeil);
  const clockText = (ms: number): string => {
    const seconds = Math.max(0, Math.round(ms / 1000));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
  };
  function showFilmProgress(progress: StudioFilmProgress): void {
    veilFill.style.width = `${progress.frames ? (progress.frame / progress.frames) * 100 : 0}%`;
    veilText.textContent = progress.stage === 'preparing' ? t('studio.film.preparing')
      : progress.stage === 'finishing' ? t('studio.film.finishing')
        : progress.remainingMs === null
          ? t('studio.film.progressFirst', { frame: progress.frame, frames: progress.frames })
          : t('studio.film.progress', { frame: progress.frame, frames: progress.frames, remaining: clockText(progress.remainingMs) });
  }
  function drawFilmPreview(canvas: HTMLCanvasElement): void {
    const aspect = canvas.width / Math.max(1, canvas.height);
    const width = aspect >= 1 ? 640 : Math.round(480 * aspect);
    const height = Math.round(width / aspect);
    if (veilPreview.width !== width || veilPreview.height !== height) { veilPreview.width = width; veilPreview.height = height; }
    veilPreview.getContext('2d')?.drawImage(canvas, 0, 0, width, height);
  }
  function startFilmExport(): void {
    if (S.filmExportStatus().active || S.recordingStatus().active || !S.filmExportStatus().supported) return;
    filmVeil.classList.add('on');
    veilFill.style.width = '0%';
    veilText.textContent = t('studio.film.preparing');
    veilCancel.focus();
    S.exportFilm({
      resolution: Number(filmSize.select.value),
      fps: Number(filmFps.select.value),
      samples: Number(filmBlur.select.value),
      shake: Number(filmShake.select.value),
      download: true,
      onProgress: showFilmProgress,
      onFrame: drawFilmPreview,
    })
      .then((result) => flashBusy(t('studio.film.saved', { size: (result.bytes / 1048576).toFixed(1) })))
      .catch((error: RuntimeValue) => flashBusy(error instanceof Error && error.name === 'AbortError'
        ? t('studio.film.cancelled')
        : t('studio.film.failed', { error: errorMessage(error) })))
      .finally(() => { filmVeil.classList.remove('on'); api.refreshStoryboard(); });
  }
  filmBtn.addEventListener('click', startFilmExport);
  let filmSignature = '';
  function updateFilmSummary(): void {
    const film = S.getFilm();
    const signature = film ? `${film.fps}/${film.samples}/${film.shake}` : '';
    if (signature !== filmSignature) {
      filmSignature = signature;
      if (film) {
        filmFps.select.value = String(film.fps);
        if ([...filmBlur.select.options].some((option) => option.value === String(film.samples))) filmBlur.select.value = String(film.samples);
        if ([...filmShake.select.options].some((option) => option.value === String(film.shake))) filmShake.select.value = String(film.shake);
      }
    }
    const status = S.filmExportStatus();
    const busyOutput = status.active || S.recordingStatus().active;
    filmBtn.disabled = busyOutput || !status.supported;
    exportBtn.disabled = filmBtn.disabled;
    for (const control of [filmSize.select, filmFps.select, filmBlur.select, filmShake.select]) control.disabled = busyOutput;
    if (!status.supported) { filmSummary.textContent = t('studio.film.unsupported'); return; }
    try {
      const format = S.productionFormat;
      const { width, height } = filmOutputSize(format, Number(filmSize.select.value));
      const plan = createFilmPlan(normalizeFilm({ ...(film ?? {}), fps: Number(filmFps.select.value), samples: Number(filmBlur.select.value) }), 0, S.durationMs);
      filmSummary.textContent = t('studio.film.summary', {
        ratio: format === 'portrait' ? '9:16' : format === 'square' ? '1:1' : '16:9',
        width, height, seconds: (plan.map.durationMs / 1000).toFixed(1), frames: plan.frames,
      });
    } catch (error) {
      filmSummary.textContent = errorMessage(error);
    }
  }
  // --- live recording, stills and the scene file ---------------------------------------------------------------
  const secLive = el('div', 'sec');
  secLive.appendChild(sectionHead(t('studio.film.liveHeading'), 'record'));
  const fpsSel = labelledSelect(t('studio.ws.video'));
  for (const fps of [60, 30]) {
    const option = document.createElement('option');
    option.value = String(fps);
    option.textContent = `${t('studio.film.fpsOption', { fps })} · 12 Mbps`;
    fpsSel.select.appendChild(option);
  }
  const recordBtn = kitButton(t('studio.recordVideo'), undefined, 'record');
  recordBtn.classList.add('cot-c-btn--wide');
  recordBtn.setAttribute('aria-pressed', 'false');
  recordBtn.addEventListener('click', () => {
    if (S.recordingStatus().active) {
      S.stopRecording();
      return;
    }
    S.recordVideo({ fps: Number(fpsSel.select.value), download: true })
      .then((result) => flashBusy(t('studio.videoSaved', { size: (result.size / 1048576).toFixed(1) })))
      .catch((error: RuntimeValue) => flashBusy(t('studio.recordFailed', { error: errorMessage(error) })));
    api.refreshStoryboard();
  });
  const recStatus = el('div', 'recStatus', t('studio.recordReady'));
  const capSel = labelledSelect(t('studio.ws.width'));
  for (const [label, w] of [['2560 px', 2560], ['3200 px', 3200], ['3840 px', 3840], ['5120 px', 5120]] as const) {
    const o = document.createElement('option');
    o.value = String(w);
    o.textContent = label;
    capSel.select.appendChild(o);
  }
  const capBtn = kitButton(t('studio.capturePng'), undefined, 'toolPhoto');
  capBtn.classList.add('cot-c-btn--wide');
  capBtn.addEventListener('click', () => {
    S.capture({ width: parseInt(capSel.select.value, 10), download: true });
  });
  secLive.append(fpsSel.row, recordBtn, recStatus, capSel.row, capBtn);
  const secScene2 = el('div', 'sec');
  secScene2.appendChild(sectionHead(t('studio.ws.sceneFile'), 'copy'));
  const svRow = el('div', 'grid3');
  const saveBtn = kitButton(t('studio.saveJson'));
  saveBtn.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(S.state(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `studio_scene_${S.mapId || 'map'}_${Date.now()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  });
  const loadBtn = kitButton(t('studio.loadJson'));
  const fileIn = document.createElement('input');
  fileIn.type = 'file';
  fileIn.accept = 'application/json,.json';
  fileIn.hidden = true;
  fileIn.addEventListener('change', () => {
    const f = fileIn.files && fileIn.files[0];
    if (!f) return;
    f.text().then((txt) => S.load(JSON.parse(txt)))
      .catch((error: RuntimeValue) => flashBusy(t('studio.loadFailed', { error: errorMessage(error) })));
    fileIn.value = '';
  });
  loadBtn.addEventListener('click', () => fileIn.click());
  const copyBtn = kitButton(t('studio.copyJson'));
  copyBtn.addEventListener('click', () => {
    const txt = JSON.stringify(S.state());
    if (navigator.clipboard) navigator.clipboard.writeText(txt).catch(() => {});
    flashBusy(t('studio.sceneJsonCopied'));
  });
  svRow.append(saveBtn, loadBtn, copyBtn);
  // Copy scene link (studioSceneLinkUi.ts): the scene itself rides in the link's #fragment, capped and schema-checked.
  const sceneLinkBtn = kitButton(t('studio.sceneLink.copy'));
  sceneLinkBtn.insertAdjacentHTML('afterbegin', SCENE_LINK_GLYPHS.link);
  sceneLinkBtn.classList.add('cot-c-btn--wide');
  sceneLinkBtn.title = t('studio.sceneLink.copyTitle');
  sceneLinkBtn.dataset.sceneLinkCopy = '';
  sceneLinkBtn.addEventListener('click', () => {
    copySceneLink(S.state(), browserSceneLinkEnv())
      .then((result) => api.notice(result.message, result.ok ? 'info' : 'error', result.detail));
  });
  // localStorage slots
  const slotRow = el('div', 'grid3');
  for (let i = 1; i <= 3; i++) {
    const b = chipButton(t('studio.slot', { n: i }), null);
    b.title = t('studio.slotTitle');
    b.addEventListener('click', (e) => {
      const key = `cot.studio.slot${i}.v1`;
      if (e.shiftKey) {
        try {
          localStorage.setItem(key, JSON.stringify(S.state()));
          flashBusy(t('studio.savedSlot', { n: i }));
        } catch (_) { flashBusy(t('studio.saveFailed')); }
      } else {
        const txt = localStorage.getItem(key);
        if (!txt) {
          flashBusy(t('studio.slotEmpty', { n: i }));
          return;
        }
        S.load(JSON.parse(txt))
          .catch((error: RuntimeValue) => flashBusy(t('studio.loadFailed', { error: errorMessage(error) })));
      }
    });
    slotRow.appendChild(b);
  }
  secScene2.append(svRow, sceneLinkBtn, slotRow, fileIn);
  outputGroup.body.append(secCap, secLive, secScene2);

  function openArchive(): void {
    let dialog = document.querySelector<HTMLDialogElement>('.cot-studio-archive');
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.className = 'cot-studio-archive';
      dialog.innerHTML = `<header><strong></strong><button type="button" class="cot-c-btn cot-c-btn--36 cot-c-btn--icon"></button></header><div class="archiveBody" data-media-archive></div>`;
      dialog.querySelector('strong')!.textContent = t('studioPanel.fieldFrames');
      const close = dialog.querySelector<HTMLButtonElement>('button')!;
      close.setAttribute('aria-label', t('studioPanel.closeArchive'));
      close.innerHTML = uiIconSVG('close', 18);
      const createdDialog = dialog;
      close.addEventListener('click', () => createdDialog.close());
      createdDialog.addEventListener('click', (event) => {
        if (event.target === createdDialog) createdDialog.close();
      });
      document.body.appendChild(dialog);
    }
    dialog.showModal();
    const archiveRoot = dialog.querySelector<HTMLElement>('[data-media-archive]');
    if (!archiveRoot) throw new Error('[studio] missing production archive root');
    // The archive's stylesheet loads at this boundary, its one host in the game (the game boot does not carry it).
    import('../presentation/mediaArchive.css')
      .then(() => mountMediaArchive(archiveRoot, { mode: 'compact', limit: 61 }))
      .catch((error: RuntimeValue) => flashBusy(errorMessage(error)));
  }

  // --- the shelf (09-studio .shelf): the scenes made with the Studio, each staged as filmed ---------------------------
  const shelfHead = el('div', 'h');
  const shelfTitle = el('b');
  shelfTitle.append(el('span', 't-accent', t('studio.ws.shelfLead')), t('studio.ws.shelfRest'));
  const archiveBtn = chipButton(t('studio.ws.allScenes'), 'media');
  archiveBtn.addEventListener('click', openArchive);
  shelfHead.append(shelfTitle, archiveBtn);
  shelf.appendChild(shelfHead);

  // --- the timeline (09-studio .tl): transport, then a lane per camera, tank and effect under one playhead ---------
  const transport = el('div', 'tp');
  const restartBtn = iconButton(t('studio.restart'));
  restartBtn.innerHTML = STUDIO_GLYPHS.stepBack;
  restartBtn.addEventListener('click', () => S.stop());
  const pauseBtn = iconButton(t('studio.play'));
  pauseBtn.innerHTML = uiIconSVG('play', 16);
  pauseBtn.addEventListener('click', () => (S.playing ? S.pause() : S.play()));
  const stepBtn = iconButton(t('studio.stepOneFrame'));
  stepBtn.innerHTML = STUDIO_GLYPHS.stepForward;
  stepBtn.addEventListener('click', () => { S.pause(); S.seek(S.fxTimeMs + 1000 / 30); });
  const clockNow = el('span', 'tc');
  const playKey = el('kbd', 'cot-c-kbd', t('studio.ws.spaceKey'));
  playKey.setAttribute('aria-hidden', 'true');
  const duration = sliderRow(t('studioPanel.storyboard.lengthLabel'), 1, 20, 0.5, (v) => S.setStoryboardDuration(v * 1000));
  const ts = sliderRow(t('studioPanel.storyboard.speedLabel'), 0.25, 2, 0.05, (v) => S.setTimeScale(v));
  const transportRight = el('div', 'r');
  const keyBtn = chipButton(t('studio.keySelectedTank'), 'stamp');
  keyBtn.addEventListener('click', () => keyActorBtn.click());
  const shotBtn = chipButton(t('studio.addCameraShot'), 'toolPhoto');
  shotBtn.addEventListener('click', () => S.addCameraShot());
  transportRight.append(duration.row, ts.row, shotBtn, keyBtn);
  transport.append(restartBtn, pauseBtn, stepBtn, clockNow, playKey, transportRight);
  const lanes = el('div', 'st-lanes');
  lanes.appendChild(el('div', 'lb'));
  const ruler = el('div', 'tk tk--ruler');
  const scrub = document.createElement('input');
  scrub.type = 'range';
  scrub.className = 'scrub';
  scrub.min = '0';
  scrub.max = String(S.durationMs);
  scrub.step = '10';
  scrub.value = '0';
  scrub.setAttribute('aria-label', t('studio.scrubAria'));
  let scrubFrame = 0;
  scrub.addEventListener('input', () => {
    cancelAnimationFrame(scrubFrame);
    scrubFrame = requestAnimationFrame(() => S.seek(Number(scrub.value)));
  });
  ruler.appendChild(scrub);
  lanes.appendChild(ruler);
  const laneHost = el('div');
  laneHost.style.display = 'contents';
  lanes.appendChild(laneHost);
  const playhead = el('i', 'ph');
  lanes.appendChild(playhead);
  timeline.append(transport, lanes);
  /** One lane: its label (a glyph, or a tank's flag and silhouette) and a track that seeks where it is clicked. */
  function timelineLane(label: string, lead: IconId | readonly Node[]): HTMLDivElement {
    const lb = el('div', 'lb');
    if (typeof lead === 'string') lb.innerHTML = uiIconSVG(lead, 14);
    else lb.append(...lead);
    lb.append(el('span', 'nm', label));
    const track = el('div', 'tk');
    track.addEventListener('pointerdown', (event) => {
      if (event.target !== track) return;
      const rect = track.getBoundingClientRect();
      S.seek(((event.clientX - rect.left) / Math.max(1, rect.width)) * S.durationMs);
    });
    laneHost.append(lb, track);
    return track;
  }
  const pct = (ms: number): string => `${Math.max(0, Math.min(100, (ms / Math.max(1, S.durationMs)) * 100))}%`;

  // --- the production panel: the Director, and the outliner's heads, the shelf, the toggle and the frame ------------
  const productionPanel = mountStudioProductionPanel(S, root, dock, () => api.refreshAll(), {
    head(id, button) {
      const glyph = OUTLINE.find(([outlineId]) => outlineId === id)?.[1] ?? 'studio';
      const label = button.textContent ?? '';
      button.innerHTML = uiIconSVG(glyph, 15);
      button.append(el('span', 'nm', label));
      outlineHeads.set(id, button);
      const row = outlineGroups.get(id)?.querySelector('.gh');
      row?.prepend(button);
      // the workspace's help, beside its head (the groups' own heads are the outliner's)
      if (id in STUDIO_GROUP_INFO_KEYS) {
        const infoId = id as StudioGroupInfoId;
        const title = label;
        row?.appendChild(createInfoButton({
          label: t('studioPanel.info.about', { title }), title, text: t(STUDIO_GROUP_INFO_KEYS[infoId]), guide: STUDIO_GUIDES[infoId],
        }));
      }
    },
    takes: shelf,
    toggle: headRight,
    guides: vp,
  });
  // the Director's frame select becomes the header's segmented frame (09-studio header .seg)
  const directorFormat = root.querySelector<HTMLSelectElement>('[data-production-format]');
  directorFormat?.closest('label')?.remove();
  function chooseFormat(format: ProductionFormat): void {
    if (!directorFormat || directorFormat.disabled) return;
    directorFormat.value = format;
    directorFormat.dispatchEvent(new Event('change'));
    refreshFormat();
  }
  function refreshFormat(): void {
    const format = S.productionFormat;
    for (const option of formatButtons) {
      const on = option.dataset.value === format;
      option.setAttribute('aria-checked', String(on));
      option.tabIndex = on ? 0 : -1;
      option.disabled = !!directorFormat?.disabled;
    }
  }
  /** A head's name, with how many rows it holds (09-studio "Actors · 2", "Shots · 3"). */
  const outlineCount = (id: WorkspaceId, count: number | null): void => {
    const name = outlineHeads.get(id)?.querySelector('.nm');
    const text = t(`studio.ws.head.${id}`, { count: count ?? 0 });
    if (name && name.textContent !== text) name.textContent = text;
  };

  // the viewport cell sizes the game's canvas (#app, studioPanel.css): measured whenever the grid moves
  let viewportFrame = 0;
  const syncViewport = (): void => {
    const box = vp.getBoundingClientRect();
    const style = document.documentElement.style;
    style.setProperty('--studio-vp-x', `${Math.round(box.left)}px`);
    style.setProperty('--studio-vp-y', `${Math.round(box.top)}px`);
    style.setProperty('--studio-vp-w', `${Math.max(1, Math.round(box.width))}px`);
    style.setProperty('--studio-vp-h', `${Math.max(1, Math.round(box.height))}px`);
    window.dispatchEvent(new Event('cot:layoutchange'));
  };
  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(() => {
      if (root.style.display !== 'block') return;
      cancelAnimationFrame(viewportFrame);
      viewportFrame = requestAnimationFrame(syncViewport);
    }).observe(vp);
  }

  // --- helpers -------------------------------------------------------------------
  function el<Tag extends keyof HTMLElementTagNameMap>(
    tag: Tag,
    cls: string | null = null,
    text: string | number | null = null,
  ): HTMLElementTagNameMap[Tag] {
    const d = document.createElement(tag);
    if (cls) d.className = cls;
    if (text != null) d.textContent = String(text);
    return d;
  }
  /** A kit button (36 px; caps from the kit), its glyph before its label. */
  function kitButton(label: string, variant?: 'primary' | 'ghost' | 'danger', glyph?: IconId): HTMLButtonElement {
    const b = el('button', `cot-c-btn cot-c-btn--36${variant ? ` cot-c-btn--${variant}` : ''}`);
    b.type = 'button';
    b.dataset.uiSound = variant === 'primary' ? 'confirm' : 'press';
    if (glyph) b.innerHTML = uiIconSVG(glyph, 18);
    b.appendChild(el('span', 'cot-c-btn__label', label));
    return b;
  }
  /** A kit chip: a toggle when `pressed` is given (aria-pressed carries the state). */
  function chipButton(label: string, glyph: IconId | null, pressed?: boolean): HTMLButtonElement {
    const b = el('button', 'cot-c-chip');
    b.type = 'button';
    b.dataset.uiSound = pressed === undefined ? 'press' : 'toggle';
    if (glyph) b.innerHTML = uiIconSVG(glyph, 16);
    b.appendChild(el('span', 'cot-c-chip__label', label));
    if (pressed !== undefined) b.setAttribute('aria-pressed', String(pressed));
    return b;
  }
  function iconButton(label: string): HTMLButtonElement {
    const b = el('button', 'ib');
    b.type = 'button';
    b.setAttribute('aria-label', label);
    b.title = label;
    return b;
  }
  /** A nation's flag (the kit's .cot-c-flag), built as a node. */
  function flagNode(nation: string): HTMLImageElement {
    const img = document.createElement('img');
    img.className = 'cot-c-flag cot-c-flag--sm';
    img.src = flagIconUrl(nation);
    img.alt = '';
    img.draggable = false;
    img.setAttribute('aria-hidden', 'true');
    return img;
  }
  /** A vehicle's flag and silhouette (owner UI rule 3: every vehicle shows both), as nodes: an id never reaches markup. */
  function identity(id: string, facing: 'left' | 'right' = 'left'): Node[] {
    const sil = el('span', `cot-c-sil${facing === 'right' ? ' cot-c-sil--right' : ''}`);
    sil.setAttribute('aria-hidden', 'true');
    sil.style.setProperty('--sil', `url(${iconUrl(id, 'side_silhouette')})`);
    return [flagNode(specInfo(id).nation || ''), sil];
  }
  function setLabel(button: HTMLElement, text: string): void {
    const label = button.querySelector('.cot-c-chip__label,.cot-c-btn__label');
    if (label && label.textContent !== text) label.textContent = text;
  }
  function press(button: HTMLElement | undefined, on: boolean): void {
    button?.setAttribute('aria-pressed', String(on));
  }
  /** An outliner row: a selecting button, and whatever trails it (a duration, a state glyph, a remove button). */
  function outlineRow(onPick: () => void): { row: HTMLDivElement; pick: HTMLButtonElement } {
    const row = el('div', 'it');
    const pickButton = el('button');
    pickButton.type = 'button';
    pickButton.addEventListener('click', onPick);
    row.appendChild(pickButton);
    return { row, pick: pickButton };
  }
  function sectionHead(title: string, glyph: IconId, infoId?: StudioSectionInfoId): HTMLDivElement {
    const h = el('div', 'sh');
    h.innerHTML = uiIconSVG(glyph, 16);
    h.append(title);
    const helpKey = infoId ? STUDIO_SECTION_INFO_KEYS[infoId] : null;
    if (infoId && helpKey) h.appendChild(createInfoButton({
      label: t('studioPanel.info.about', { title }),
      title,
      text: t(helpKey),
      json: infoId === 'output' ? () => S.state() : null,
      guide: STUDIO_GUIDES[infoId],
    }));
    return h;
  }
  function section(infoId: StudioSectionInfoId, title: string, glyph: IconId): HTMLDivElement {
    const s = el('div', 'sec');
    s.appendChild(sectionHead(title, glyph, infoId));
    return s;
  }
  /** One workspace's controls in the inspector; the production panel shows one group at a time. */
  function panelGroup(index: string, infoId: StudioGroupInfoId, title: string): PanelGroup {
    const groupRoot = el('section', 'pgroup');
    groupRoot.dataset.group = infoId;
    groupRoot.dataset.index = index;
    groupRoot.setAttribute('aria-label', title);
    return { root: groupRoot, body: groupRoot };
  }
  function sliderRow(
    label: string,
    min: number,
    max: number,
    step: number,
    onInput: (value: number) => void,
    glyph?: IconId,
  ): SliderControl {
    const row = el('div', `sl${glyph ? ' sl--glyph' : ''}`);
    const name = el('label');
    if (glyph) {
      name.innerHTML = uiIconSVG(glyph, 16);
      name.title = label;
    } else name.textContent = label;
    const r = document.createElement('input');
    r.type = 'range';
    r.min = String(min);
    r.max = String(max);
    r.step = String(step);
    r.setAttribute('aria-label', label);
    const val = el('span', 'val', '');
    const fill = (): void => {
      const span = Number(r.max) - Number(r.min);
      r.style.setProperty('--fill', `${span > 0 ? ((Number(r.value) - Number(r.min)) / span) * 100 : 0}%`);
    };
    r.addEventListener('input', () => {
      val.textContent = r.value;
      fill();
      onInput(parseFloat(r.value));
    });
    row.append(name, r, val);
    return {
      row, input: r,
      set(value: number) {
        r.value = String(value);
        val.textContent = String(Math.round(value * 10) / 10);
        fill();
      },
      setRange(rangeMin: number, rangeMax: number) {
        r.min = String(rangeMin);
        r.max = String(rangeMax);
        fill();
      },
    };
  }
  function labelledSelect(label: string): { row: HTMLLabelElement; select: HTMLSelectElement } {
    const row = el('label', 'production-lens');
    const select = document.createElement('select');
    row.append(label, select);
    return { row, select };
  }
  function numField(prefix: string, onChange: (value: number) => void): { label: HTMLLabelElement; input: HTMLInputElement } {
    const label = el('label');
    const n = document.createElement('input');
    n.type = 'number';
    n.step = '0.1';
    n.addEventListener('change', () => onChange(parseFloat(n.value) || 0));
    label.append(el('small', null, prefix), n);
    return { label, input: n };
  }
  function patchSel(patch: Readonly<Record<string, RuntimeValue>>): void {
    const a = S._internal.selected;
    if (a) { S.updateActor(a, patch); }
  }
  let busyTimer: ReturnType<typeof setTimeout> | null = null;
  function flashBusy(text: string): void {
    api.setBusy(text);
    if (busyTimer !== null) clearTimeout(busyTimer);
    busyTimer = setTimeout(() => api.setBusy(null), 1600);
  }
  /** warn/danger tint of a tank's silhouette by damage state */
  function stateClass(name: StudioActorState): string {
    if (name === 'engine-smoking') return ' is-warn';
    if (name === 'burning' || name === 'wrecked' || name === 'wrecked-burnt'
      || name === 'turret-popped') return ' is-bad';
    return '';
  }
  const stateGlyph = (name: StudioActorState): IconId | null => (name === 'engine-smoking' ? 'smoke'
    : name === 'burning' || name === 'wrecked-burnt' ? 'statusFire' : name === 'wrecked' || name === 'turret-popped' ? 'skull' : null);
  const effectName = (type: string): string => {
    const key = `studio.ws.fx.${type}`;
    const name = t(key);
    return name === key ? type.replaceAll('_', ' ') : name;
  };
  const seconds = (ms: number): string => t('studio.ws.seconds', { s: (ms / 1000).toFixed(2) });

  function effectAnchorLabel(effect: StudioEffect): string {
    if (effect.actor != null) return t('studio.ws.anchor.actor', { id: String(effect.actor) });
    if (effect.from && effect.to) return t('studio.ws.anchor.flight');
    if (effect.at) return t('studio.ws.anchor.point', { at: effect.at.map((v) => Number(v).toFixed(1)).join(' / ') });
    return t('studio.ws.anchor.marker');
  }

  function rebuildEffectList() {
    fxStack.textContent = '';
    effectRows.textContent = '';
    const effects = S.listEffects();
    rebuildFxParams(effects);
    refreshCinematicToggles();
    outlineCount('effects', effects.length);
    if (!effects.length) {
      fxStack.appendChild(el('div', 'fxempty', t('studioPanel.fx.empty')));
      return;
    }
    for (const effect of effects) {
      const row = el('div', 'fxrow');
      row.tabIndex = 0;
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', String(!!effect.selected));
      row.dataset.effectId = effect.id;
      const names = el('div', 'fn');
      names.append(
        el('div', 'n1', effectName(effect.type)),
        el('div', 'n2', `${effectAnchorLabel(effect)} · ${seconds(effect.tMs)}`),
      );
      row.appendChild(names);
      const time = document.createElement('input');
      time.type = 'number';
      time.className = 'ftime';
      time.min = '0';
      time.max = String(S.durationMs / 1000);
      time.step = '0.05';
      time.value = (effect.tMs / 1000).toFixed(2);
      time.title = t('studioPanel.effects.timeTitle');
      time.setAttribute('aria-label', t('studioPanel.effects.timeAria', { type: effectName(effect.type) }));
      time.addEventListener('pointerdown', (event) => event.stopPropagation());
      time.addEventListener('click', (event) => event.stopPropagation());
      time.addEventListener('change', (event) => {
        event.stopPropagation();
        S.updateEffect(effect.id, { tMs: Number(time.value) * 1000 });
      });
      row.appendChild(time);
      const del = el('button', 'x');
      del.type = 'button';
      del.innerHTML = uiIconSVG('close', 14);
      del.title = t('studioPanel.effects.deleteTitle', { type: effectName(effect.type) });
      del.setAttribute('aria-label', del.title);
      del.addEventListener('click', (event) => {
        event.stopPropagation();
        S.removeEffect(effect.id);
      });
      row.appendChild(del);
      row.addEventListener('click', () => S.selectEffect(effect.id));
      row.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          S.selectEffect(effect.id);
        } else if (event.key === 'Delete' || event.key === 'Backspace') {
          event.preventDefault();
          S.removeEffect(effect.id);
        }
      });
      fxStack.appendChild(row);
      // its outliner row (09-studio .out Effects): the name and the time it fires
      const line = outlineRow(() => { productionPanel.activate('effects'); S.selectEffect(effect.id); });
      line.row.setAttribute('aria-current', String(!!effect.selected));
      line.pick.innerHTML = uiIconSVG('detonation', 16);
      line.pick.append(el('span', 'nm', effectName(effect.type)), el('span', 'd', seconds(effect.tMs)));
      effectRows.appendChild(line.row);
    }
  }

  function rebuildStoryboard() {
    const board = S.getStoryboard();
    laneHost.textContent = '';
    shotboard.querySelectorAll<InfoButton>('.cot-info-trigger')
      .forEach((button) => button.disposeInfo?.());
    shotboard.textContent = '';
    shotRows.textContent = '';
    outlineCount('cinematics', board.shots.length);
    // the camera lane: each shot a clip from its key to the next (09-studio .tl Camera)
    const cameraLane = timelineLane(t('studio.ws.laneCamera'), 'toolPhoto');
    board.shots.forEach((shot, index) => {
      const selected = shot.id === S.selectedShotId;
      const next = board.shots[index + 1]?.tMs ?? S.durationMs;
      const clip = el('button', 'clip', shot.label);
      clip.type = 'button';
      clip.style.left = pct(shot.tMs);
      clip.style.width = `calc(${pct(Math.max(0, next - shot.tMs))} - 3px)`;
      clip.setAttribute('aria-pressed', String(selected));
      clip.title = t('studioPanel.shot.timelineMarkerTitle', { label: shot.label, t: (shot.tMs / 1000).toFixed(2) });
      clip.addEventListener('click', (event) => { event.stopPropagation(); S.selectCameraShot(shot.id); });
      cameraLane.appendChild(clip);
      const card = el('div', `shotcard${selected ? ' sel' : ''}`);
      card.appendChild(el('div', 'num', String(index + 1).padStart(2, '0')));
      const copy = el('div', 'copy');
      copy.append(
        el('div', 'name', shot.label),
        el('div', 'time', `${seconds(shot.tMs)} · ${Math.round(shot.fov)}°`),
      );
      copy.addEventListener('click', () => S.selectCameraShot(shot.id));
      card.appendChild(copy);
      const transition = document.createElement('select');
      transition.setAttribute('aria-label', t('studioPanel.shot.transitionAria', { label: shot.label }));
      for (const id of SHOT_TRANSITIONS) {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = t(`studio.ws.transition.${id}`);
        transition.appendChild(option);
      }
      transition.value = shot.transition;
      transition.addEventListener('change', () => S.updateCameraShot(shot.id, {
        transition: transition.value,
      }));
      card.appendChild(transition);
      card.appendChild(createInfoButton({
        label: t('studioPanel.shot.showJsonLabel', { label: shot.label }),
        title: t('studioPanel.shot.replicateTitle', { label: shot.label }),
        json: () => ({ ...S.state(), fxTime: shot.tMs, timeScale: 0 }),
        guide: 'recipe',
      }));
      const del = el('button', 'x');
      del.type = 'button';
      del.innerHTML = uiIconSVG('close', 14);
      del.title = t('studioPanel.shot.removeTitle', { label: shot.label });
      del.setAttribute('aria-label', del.title);
      del.addEventListener('click', () => S.removeCameraShot(shot.id));
      card.appendChild(del);
      shotboard.appendChild(card);
      // its outliner row (09-studio .out Shots): the label and the shot's length
      const line = outlineRow(() => { productionPanel.activate('cinematics'); S.selectCameraShot(shot.id); });
      line.row.setAttribute('aria-current', String(selected));
      line.pick.innerHTML = uiIconSVG('toolPhoto', 16);
      line.pick.append(el('span', 'nm', shot.label), el('span', 'd', seconds(Math.max(0, next - shot.tMs))));
      shotRows.appendChild(line.row);
    });
    // a lane per tank with keys: its flag, silhouette and name, a diamond per pose key
    for (const track of board.actorTracks) {
      const actor = S._internal.actors.find((entry) => entry.uid === track.actor || entry.name === track.actor);
      const lane = timelineLane(actor?.spec.name ?? track.actor, actor ? identity(actor.spec.id) : 'vehicle');
      for (const key of track.keys) {
        const mark = el('button', 'key');
        mark.type = 'button';
        mark.style.left = pct(key.tMs);
        const title = t('studio.ws.keyTitle', { actor: actor?.spec.name ?? track.actor, s: (key.tMs / 1000).toFixed(2) });
        mark.title = title;
        mark.setAttribute('aria-label', title);
        mark.addEventListener('click', (event) => { event.stopPropagation(); S.seek(key.tMs); });
        lane.appendChild(mark);
      }
    }
    // the effects lane: a clip where each fires
    const effectLane = timelineLane(t('studio.ws.laneEffects'), 'detonation');
    for (const effect of S.listEffects()) {
      const clip = el('button', 'clip clip--fx', effectName(effect.type));
      clip.type = 'button';
      clip.style.left = pct(effect.tMs);
      clip.style.maxWidth = '30%';
      clip.setAttribute('aria-pressed', String(!!effect.selected));
      clip.title = t('studio.ws.fxTitle', { type: effectName(effect.type), s: (effect.tMs / 1000).toFixed(2) });
      clip.addEventListener('click', (event) => { event.stopPropagation(); S.selectEffect(effect.id); S.seek(effect.tMs); });
      effectLane.appendChild(clip);
    }
    if (!board.shots.length) {
      shotboard.appendChild(el('div', 'fxempty', t('studioPanel.storyboard.empty')));
    }
  }

  // --- public panel API -------------------------------------------------------
  let refreshAcc = 0, planAcc = 0;
  const api: StudioPanelRuntime = {
    root,
    show() {
      root.style.display = 'block';
      syncViewport();
      productionPanel.setVisible(true);
      api.refreshAll();
    },
    hide() { root.style.display = 'none'; productionPanel.setVisible(false); togglePick(false); toggleMapPick(false); },
    setBusy(text) {
      busy.style.display = text ? 'block' : 'none';
      if (text) busy.textContent = text;
    },
    notice(text, tone = 'info', detail = '') {
      hideNotice();
      noticeGlyph.innerHTML = tone === 'error' ? SCENE_LINK_GLYPHS.broken : SCENE_LINK_GLYPHS.done;
      noticeMessage.textContent = text;
      noticeDetail.textContent = detail;
      noticeMore.hidden = !detail;
      noticeMore.open = false;
      notice.dataset.tone = tone;
      notice.setAttribute('role', tone === 'error' ? 'alert' : 'status');
      notice.setAttribute('aria-live', tone === 'error' ? 'assertive' : 'polite');
      notice.dataset.open = '';
      if (tone !== 'error') noticeTimer = setTimeout(hideNotice, 5000);
    },
    setPlaceArmed(specId) {
      press(placeBtn, !!specId);
      setLabel(placeBtn, specId
        ? t('studio.clickMapToPlace', { spec: specInfo(specId).name })
        : t('studio.clickToPlace'));
    },
    setSelected(_actor) {
      api.refreshActors();
      api.refreshStoryboard();
    },
    setSelectedEffect(_effect) {
      api.refreshEffects();
    },
    refreshActors() {
      actorRows.textContent = '';
      const sel = S._internal.selected;
      outlineCount('tanks', S._internal.actors.length);
      S._internal.actors.forEach((a) => {
        // 09-studio .out Actors: flag, silhouette, name, then its state and remove
        const line = outlineRow(() => { productionPanel.activate('tanks'); S.selectActor(a.uid); });
        line.row.className = `it${stateClass(a.stateName)}`;
        line.row.setAttribute('aria-current', String(a === sel));
        line.pick.replaceChildren(...identity(a.spec.id));
        line.pick.append(el('span', 'nm', `${a.name ? `${a.name} · ` : ''}${a.spec.name}`));
        const trail = el('span', 'e');
        const glyph = stateGlyph(a.stateName);
        if (glyph) {
          trail.innerHTML = uiIconSVG(glyph, 14);
          trail.setAttribute('role', 'img');
          trail.setAttribute('aria-label', t(`studio.ws.state.${a.stateName}`));
        }
        const del = el('button', 'x');
        del.type = 'button';
        del.innerHTML = uiIconSVG('close', 14);
        del.setAttribute('aria-label', t('studio.ws.removeTank', { name: a.spec.name }));
        del.title = del.getAttribute('aria-label') ?? '';
        del.addEventListener('click', (e) => { e.stopPropagation(); S.removeActor(a); });
        line.row.append(trail, del);
        actorRows.appendChild(line.row);
      });
      api.refreshSelected();
      if (planShown) planView.refreshPlan();
    },
    refreshSelected() {
      const a = S._internal.selected;
      secSel.hidden = !a;
      selEmpty.hidden = !!a;
      if (!a) return;
      // the hero card (09-studio .insp .hero-icon): the live card's layers over the silhouette, the name at its foot
      if (hero.dataset.spec !== a.spec.id) {
        hero.dataset.spec = a.spec.id;
        hero.querySelector('.hc-host')?.remove();
        heroSil.style.setProperty('--sil', `url(${iconUrl(a.spec.id, 'side_silhouette')})`);
        heroName.replaceChildren(flagNode(specInfo(a.spec.id).nation || ''), a.spec.name);
        const specId = a.spec.id;
        void Promise.all([import('./heroCard.ts'), import('./heroCard.css')])
          .then(([cards]) => (hero.dataset.spec === specId
            ? cards.decorateHeroTile(hero, specId, { tankSizes: '296px', flagSizes: '296px', priority: true }) : false))
          .catch(() => false);
        repaintSwatches(a.spec.id);
      }
      gun.setRange(-(a.spec.gunDepressionDeg ?? 10), a.spec.gunElevationDeg ?? 20);
      facing.set(a.pose.facingDeg);
      turret.set(a.pose.turretDeg);
      gun.set(a.pose.gunDeg);
      if (document.activeElement !== px.input) px.input.value = String(Math.round(a.pose.x * 10) / 10);
      if (document.activeElement !== pz.input) pz.input.value = String(Math.round(a.pose.z * 10) / 10);
      if (document.activeElement !== heading.input) heading.input.value = String(Math.round(a.pose.facingDeg));
      for (const [cid, button] of swatchButtons) press(button, (a.camo || 'inherit') === cid);
      for (const [sid, option] of stateButtons) {
        option.setAttribute('aria-checked', String(sid === a.stateName));
        option.tabIndex = sid === a.stateName ? 0 : -1;
      }
    },
    refreshEffects() {
      rebuildEffectList();
      rebuildStoryboard();
    },
    refreshCamera() {
      const c = S.getCamera();
      fov.set(c.fov);
      roll.set(c.rollDeg);
      spd.set(S._internal.cam.speed);
      flyBtn.setAttribute('aria-checked', String(c.mode === 'fly'));
      orbBtn.setAttribute('aria-checked', String(c.mode === 'orbit'));
      setLabel(modeChip, c.mode === 'orbit' ? t('studio.orbit') : t('studio.freeFly'));
      setLabel(lensChip, `${Math.round(c.fov)}°`);
    },
    refreshTime() {
      productionPanel.refresh();
      refreshFormat();
      const scale = S.timeScale;
      if (scale > 0 && Number(ts.input.value) !== scale) ts.set(scale);
      const playing = scale !== 0;
      const pauseLabel = playing ? t('studio.pause') : t('studio.play');
      if (pauseBtn.getAttribute('aria-label') !== pauseLabel) {
        pauseBtn.setAttribute('aria-label', pauseLabel);
        pauseBtn.title = pauseLabel;
        if (playing) pauseBtn.innerHTML = STUDIO_GLYPHS.pause;
        else pauseBtn.innerHTML = uiIconSVG('play', 16);
      }
      const seconds = S.durationMs / 1000;
      if (Number(duration.input.value) !== seconds) duration.set(seconds);
      scrub.max = String(S.durationMs);
      if (document.activeElement !== scrub) scrub.value = String(S.fxTimeMs);
      scrub.style.setProperty('--fill', `${Math.max(0, Math.min(100, (S.fxTimeMs / Math.max(1, S.durationMs)) * 100))}%`);
      const now = `${(S.fxTimeMs / 1000).toFixed(2).padStart(5, '0')}`;
      if (clockNow.dataset.now !== now || clockNow.dataset.total !== String(seconds)) {
        clockNow.dataset.now = now;
        clockNow.dataset.total = String(seconds);
        clockNow.replaceChildren(`00:${now} `, el('small', null, `/ 00:${seconds.toFixed(2).padStart(5, '0')}`));
      }
      playhead.style.setProperty('--t', String(Math.max(0, Math.min(1, S.fxTimeMs / Math.max(1, S.durationMs)))));
      if (planShown && !S.playing) planView.refreshTime();
      const rec = S.recordingStatus();
      setLabel(recordBtn, rec.active ? t('studio.stopRecording') : t('studio.recordVideo'));
      press(recordBtn, rec.active);
      recStatus.classList.toggle('on', rec.active);
      recStatus.textContent = rec.active
        ? t('studio.recordingStatus', {
          elapsed: (rec.elapsedMs / 1000).toFixed(1),
          total: (rec.durationMs / 1000).toFixed(1),
          mime: rec.mimeType || t('studio.videoMime'),
        })
        : (rec.supported
          ? t('studio.recordReady')
          : t('studio.recordUnsupported'));
      // the frame readout (09-studio .fc): the frame at 30 fps and the camera's place and aim
      const frames = Math.round(S.durationMs / 1000 * 30);
      const frame = Math.min(frames, Math.round(S.fxTimeMs / 1000 * 30));
      const camera = S.getCamera();
      frameCounter.replaceChildren(el('b', null, t('studio.ws.frame', { frame, frames })),
        ` · ${camera.pos.map((v) => v.toFixed(1)).join(', ')} · ${camera.yawDeg.toFixed(0)}° / ${camera.pitchDeg.toFixed(0)}°`);
    },
    refreshStoryboard() {
      const isRecording = S.recordingStatus().active;
      press(railBtn, S.railVisible);
      setLabel(railBtn, S.railVisible ? t('studio.hideCameraRail') : t('studio.showCameraRail'));
      duration.input.disabled = isRecording;
      scrub.disabled = isRecording;
      restartBtn.disabled = isRecording;
      pauseBtn.disabled = isRecording;
      stepBtn.disabled = isRecording;
      addShotBtn.disabled = isRecording;
      shotBtn.disabled = isRecording;
      keyActorBtn.disabled = isRecording || !S._internal.selected;
      keyBtn.disabled = keyActorBtn.disabled;
      clearTrackBtn.disabled = isRecording || !S._internal.selected;
      duelBtn.disabled = isRecording || S._internal.actors.length < 2;
      railBtn.disabled = isRecording;
      for (const option of timeOptions.values()) if (isRecording) option.disabled = true;
      rebuildStoryboard();
      updateFilmSummary();
      const board = S.getStoryboard();
      const shotIndex = board.shots.findIndex((shot) => shot.id === S.selectedShotId);
      setLabel(shotChip, shotIndex < 0 ? t('studio.ws.noShot')
        : t('studio.ws.shot', { n: String(shotIndex + 1).padStart(2, '0'), label: board.shots[shotIndex].label }));
      if (planShown) planView.refreshPlan();
      api.refreshTime();
    },
    refreshMap() {
      refreshSun();
      const id = S.mapId;
      if (!id) return;
      const info = S.getMapInfo ? S.getMapInfo(id) : { name: id };
      mapHero.src = imageFor(MAP_HEROES, id) || imageFor(MAP_THUMBS, id) || '';
      mapName.textContent = info.name || id;
      mapId.textContent = id;
      projectName.textContent = info.name || id;
      mapRowThumb.src = imageFor(MAP_THUMBS, id) || '';
      mapRow.pick.querySelector('.nm')!.textContent = info.name || id;
      lightRow.pick.querySelector('.nm')!.textContent = t(`atmosphere.${S.timeOfDay}`);
      if (planShown) planView.refreshPlan();
      mapBtn.setAttribute('aria-label', t('studioPanel.map.chooseAriaCurrent', { name: info.name || id }));
      for (const [cardId, card] of mapCards) {
        card.setAttribute('aria-selected', String(cardId === id));
      }
    },
    refreshPicture() { picturePanel.refresh(); },
    refreshAll() {
      api.refreshMap();
      api.refreshPicture();
      api.refreshActors();
      api.refreshEffects();
      api.refreshCamera();
      api.refreshStoryboard();
      api.refreshTime();
      outlineCount('director', null);
      outlineCount('battlefield', null);
      outlineCount('output', null);
    },
    tick(dt) {
      refreshAcc += dt;
      planAcc += dt;
      // the plan follows the playhead at ~15 fps while the take plays
      if (planShown && S.playing && planAcc >= 1 / 15) { planAcc = 0; planView.refreshTime(); }
      if (refreshAcc < 0.25) return;
      refreshAcc = 0;
      refreshSunCamera();
      api.refreshTime();
    },
  };
  return api;
}

type SwatchPainter = {
  readonly paint: typeof import('./camoSwatchPainter.ts').paintCamoSwatch;
  readonly spec: typeof import('../vehicles/specs.ts').getSpec;
};
