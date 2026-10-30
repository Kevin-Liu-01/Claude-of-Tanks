import { STUDIO_TIMES, type StudioLight, type StudioTimeOfDay } from '../game/studioLight.ts';
import type { RuntimeValue } from '../runtimeTypes.ts';
import { galleryHref } from '../game/tankIdBoundaries.ts';
import type { ProductionFormat, ProductionRigId } from '../game/studioProduction.ts';
import { mountStudioProductionPanel, presetText, productionLabel, shotLabel, shotRuns, type WorkspaceId } from './studioProductionPanel.ts';
import { PRODUCTION_PRESETS } from '../game/studioProduction.ts';
import { createCommandPalette, type StudioCommand } from './studioCommands.ts';
import { QUEUE_PRESETS, queueEstimate, queueFileName, recordRenderRate, stillSize, type QueuePreset } from './studioQueue.ts';
import { mountStudioPicturePanel, type StudioPicturePanelApi } from './studioPicturePanel.ts';
/**
 * studioPanel.ts — the Studio's interface (src/game/studio.ts's UI): the Premiere direction's page 09 on the live kit
 * (createStudioPanel below; its rules are studioPanel.css).
 */
import { ensureFonts } from './fonts.ts';
import { iconUrl, tankThumbUrl } from './icons.ts';
import { type IconId } from './icons/icon.ts';
import { uiIconSVG } from './uiIcons.ts';
import { markDatum } from './dom.ts';
import { wireRovingKeys } from './components/components.ts';
import { noticeRegion, notify } from './components/notice.ts';
import { flagIconUrl } from './flags.ts';
import { brandMarkSVG } from './brandMark.ts';
import { MAP_HEROES, MAP_THUMBS } from './mapThumbs.ts';
import { createBattlefieldPicker, type BattlefieldCard, type BattlefieldPicker } from './battlefieldPicker.ts';
import { createPickerMenu } from './components/pickerMenu.ts';
import { closeSurface, openSurface, type TransientSurface } from './components/surfaceStack.ts';
import type { PickerItem } from './components/picker.ts';
import { pickerText } from './pickerText.ts';
import { createGarageCamoPicker } from './camoPicker.ts';
import { camoTagNation } from '../vehicles/camoPolicy.ts';
import { mapRegionTags } from './regionTags.ts';
import { mountMediaArchive } from '../presentation/mediaArchive.ts';
import { vehicleEraLabelI18n } from '../vehicles/taxonomy.ts';
import { createInfoButton, type InfoButton } from './contextInfo.ts';
import { createPlanView, type StudioPlanFeatures } from './studioPlanView.ts';
import { getLocale, t } from './i18n.ts';
import { STUDIO_FX_PARAMS } from '../game/studioFxSettings.ts';
import { hrefForLocale } from './localeRouting.ts';
import { SCENE_LINK_GLYPHS, browserSceneLinkEnv, copySceneLink } from './studioSceneLinkUi.ts';
import { FILM_RESOLUTIONS, createFilmPlan, filmOutputSize, normalizeFilm } from '../game/studioFilmPlan.ts';
import { coverImage, createUiCanvas, drawImageFit } from './uiCanvas.ts';

/** The Studio's workspaces: the outliner's groups (the inspector shows one at a time). */
type StudioGroupId = 'battlefield' | 'tanks' | 'effects' | 'cinematics' | 'output';
/**
 * The inspector's sections. Only the scene file's head carries a panel of its own, the scene's complete JSON; the
 * help-only panels left in the 247 sweep (less is more), as the Gallery's did in its Premiere port.
 */
type StudioSectionId = 'map' | 'selectedTank' | 'addTanks' | 'layersEvents' | 'storyboard' | 'camera' | 'picture' | 'output';

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
  /** The file's name (the container's extension is added when it has none). */
  readonly name?: string;
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

/**
 * Where the selected tank sits on the canvas, in CSS pixels (studio.ts projectSelection): the box around it, its ground
 * centre, the hull's right axis and the up axis (a metre each) and a metre ring on the ground as offsets from that centre.
 */
export interface StudioSelectionFrame {
  visible: boolean;
  left: number;
  top: number;
  right: number;
  bottom: number;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  ux: number;
  uy: number;
  readonly ring: Float32Array;
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
  /** The shuttle's signed rate (J/K/L): negative while the playhead runs back. */
  readonly shuttleRate: number;
  /** The view is the shots' camera at the playhead. */
  readonly lookThrough: boolean;
  setLookThrough(on: boolean): boolean;
  /** Undo/redo between the scene's settled edits (Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z). */
  undo(): Promise<boolean>;
  redo(): Promise<boolean>;
  readonly history: { readonly undo: number; readonly redo: number; readonly savedAt: number };
  /** The last autosaved scene (this browser), and opening it. */
  autosaved(): { readonly savedAt: number; readonly map: string; readonly tanks: number } | null;
  restoreAutosave(): Promise<boolean>;
  /** The film's soundtrack as peaks over the timeline (the sound lane); null while busy or playing. */
  soundPreview(buckets: number): Promise<{ readonly peaks: Float32Array; readonly cues: number } | null>;
  /** Where a dragged or placed tank lands: on the nearest road, on the ground under the pointer, or on its own level. */
  readonly placementSnap: 'road' | 'terrain' | 'off';
  setPlacementSnap(snap: 'road' | 'terrain' | 'off'): string;
  /** A pose preset on a tank; false when hull-down finds no crest ahead. */
  applyPosePreset(actor: StudioActor, preset: 'hull-down' | 'firing' | 'knocked-out'): boolean;
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
  /** The paint picker's try-on: `actor` wears `patternId` as a tile until null puts its paint back (no history). */
  previewActorCamo(actor: StudioActor | null, patternId: string | null): void;
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
  capture(options: { readonly width: number; readonly height?: number; readonly download: boolean; readonly name?: string }): RuntimeValue;
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
  /** A shot's thumbnail (a data URL) while it shows the shot as authored, else null. */
  shotThumbnail(id: string): string | null;
  projectSelection(out: StudioSelectionFrame): boolean;
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
   * The battlefield's build in the viewport (shell-first, 247): the Studio's own panels stay up and wait (inert) while
   * the viewport shows the map's picture, its name and the build's progress; null hands the viewport to the scene.
   */
  setStage(stage: { readonly mapId: string; readonly name: string } | null): void;
  setStageProgress(fraction: number, label: string): void;
  /**
   * What an action did, as the kit's toast over the picture: the sentence, and an optional technical detail on its own
   * line. Information fades after a few seconds; an error stays until dismissed or replaced, and announces as an alert.
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
  /** The header's undo, redo and saved state after a step or an autosave. */
  refreshHistory(): void;
  /** The command palette (Ctrl/Cmd+K). */
  openCommands(): void;
  /** After a live frame: the selection's outline, name tag and gizmo follow the tank. */
  drawSelection(): void;
  /** A shot's new thumbnail, into its outliner row and its clip on the camera lane. */
  setShotThumbnail(id: string, url: string): void;
}

/** The transport and add glyphs from the sprite (brand-ui 247: one glyph set), and the brand's badge. */
const STUDIO_GLYPHS = Object.freeze({
  mark: brandMarkSVG(24),
  stepBack: uiIconSVG('stepBack', 16),
  pause: uiIconSVG('pause', 16),
  stepForward: uiIconSVG('stepForward', 16),
  plus: uiIconSVG('plus', 15),
});

/** The outliner's order (09-studio .out: Scene, Actors, Shots, Effects), the Director first and Export last. */
const OUTLINE: ReadonlyArray<readonly [WorkspaceId, IconId]> = Object.freeze([
  ['director', 'studio'], ['battlefield', 'map'], ['tanks', 'vehicle'], ['cinematics', 'toolPhoto'], ['effects', 'detonation'], ['output', 'film'],
] as const);
/** The camera keys' blends (studio.ts `transition`), as the timeline's shot cards offer them. */
const SHOT_TRANSITIONS = Object.freeze(['smooth', 'linear', 'cut', 'bezier', 'spline'] as const);
/** A labelled segmented choice (labelledSegments): its value, its lock while an export runs and its change listeners. */
interface Segments {
  value: string;
  disabled: boolean;
  readonly element: HTMLElement;
  has(value: string): boolean;
  onChange(listener: () => void): void;
}
const FILM_FORMATS = Object.freeze([['landscape', '16:9'], ['portrait', '9:16'], ['square', '1:1'], ['card', '1.91:1']] as const);
/** A production format as its ratio reads (16:9, 9:16, 1:1, 1.91:1). */
const formatRatio = (format: ProductionFormat): string => FILM_FORMATS.find(([id]) => id === format)?.[1] ?? '16:9';
const SVG_NS = 'http://www.w3.org/2000/svg';
/** The palette's shortcut as this platform writes it. */
// the keys in words: the shipped faces carry no command-key glyph, so a Mac reads Cmd (the type system's coverage rule)
const ON_MAC = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
const PALETTE_KEY = ON_MAC ? 'Cmd K' : 'Ctrl K';
/** The kit's key cap (components.ts keycap: cot-c-kbd, hidden from assistive technology) built as a node: the Studio's
 *  sinks write no markup from data (studioSceneShare.selftest §10). No Studio key is an arrow, so no sprite glyph. */
function studioKeycap(key: string): HTMLElement {
  const cap = document.createElement('kbd');
  cap.className = 'cot-c-kbd';
  cap.setAttribute('aria-hidden', 'true');
  cap.textContent = key;
  return cap;
}
const UNDO_KEY = ON_MAC ? 'Cmd Z' : 'Ctrl Z';
/** The Studio's shortcuts a focused panel lets through to the runtime. */
function studioShortcut(e: KeyboardEvent): boolean {
  if (e.altKey) return false;
  if (e.metaKey || e.ctrlKey) return e.code === 'KeyZ' || e.code === 'KeyY' || e.code === 'KeyK';
  return e.code === 'KeyJ' || e.code === 'KeyK' || e.code === 'KeyL' || e.code === 'F8';
}
/** The gizmo's turn ring, in CSS pixels (09-studio .giz: an 86 px plate, a 30 px ring). */
const GIZMO_RADIUS = 30;
/** At most this many camouflage swatches paint in one frame (each a 2 m crop of the real pattern tile). */
const SWATCHES_PER_FRAME = 3;
/** The room one ruler label takes (m:ss in 11 px figures and its gap): a narrow ruler labels fewer ticks. */
const RULER_LABEL_PX = 44;
/** The battlefield popover's height: the inspector's room under the map card within these, under its 4 px gap and an
 *  8 px margin. */
const MAP_POP_MIN = 200;
const MAP_POP_MAX = 560;
const MAP_POP_GAP = 12;
/** Under this much room below the card the picker cannot show its bar and two rows of cards: it opens as a sheet over
 * the Studio instead (the s16 critic: on a phone, at 844 x 390, 1024 x 600 and 1280 x 720 the popover cut its cards and
 * the card above scrolled under the tab bar). */
const MAP_POP_SHEET_BELOW = Number.POSITIVE_INFINITY; // the sheet at every size: one form (the s17 critic: a nested box at 1440 and up)
/** The sheet stands centred over the Studio under its bar, this wide and tall where the screen has the room, with a
 *  gutter on every side (the s20 critic: flush to the screen's right edge and foot, its top across the inspector's Map
 *  section). From 1440 px it is wider and taller: the preview beside three maps to a row (the s19 and s20 critics: one
 *  narrow column of maps beside a mostly empty preview at 1440 to 2560). */
const MAP_SHEET = 760;
const MAP_SHEET_HEIGHT = 560;
const MAP_SHEET_WIDE = 1040;
const MAP_SHEET_WIDE_HEIGHT = 640;
const MAP_SHEET_WIDE_FROM = 1440;
const MAP_SHEET_TOP = 56;
const MAP_SHEET_GUTTER = 16;
/** A phone's gutter. */
const MAP_SHEET_GUTTER_NARROW = 8;
/** Each viewer's Quick | Pro choice (a convenience: a private window starts on Quick). */
const CONTROLS_MODE_KEY = 'cot.studio.controls';
function readControlsMode(): 'quick' | 'pro' {
  try { return localStorage.getItem(CONTROLS_MODE_KEY) === 'pro' ? 'pro' : 'quick'; } catch (_) { return 'quick'; }
}

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
  // the battlefield's build (setStage): the map's picture under its name, the stage and one bar, over the viewport cell
  const stagePlate = el('div', 'st-load');
  stagePlate.hidden = true;
  const stageArt = el('img', 'st-load__art');
  stageArt.alt = '';
  stageArt.decoding = 'async';
  stageArt.width = 1280;
  stageArt.height = 720;
  const stageName = el('h2', 'st-load__name');
  const stageLabel = el('p', 'st-load__label');
  stageLabel.setAttribute('role', 'status');
  const stageBar = el('div', 'st-load__bar');
  const stageFill = el('i');
  stageBar.append(stageFill);
  const stageCopy = el('div', 'st-load__copy');
  stageCopy.append(stageName, stageLabel, stageBar);
  stagePlate.append(stageArt, stageCopy);
  vp.append(stagePlate);
  // keep the canvas's drag-look and fly keys from firing while a panel is in use (the viewport passes them through); the
  // Studio's own shortcuts (J/K/L, undo and redo, the palette, F8) still reach it from a focused button, and the runtime
  // ignores them while a field is being typed in
  for (const panel of [head, out, dock, shelf, timeline]) {
    for (const evName of ['pointerdown', 'pointermove', 'pointerup', 'wheel']) {
      panel.addEventListener(evName, (e) => e.stopPropagation());
    }
    panel.addEventListener('keydown', (e) => { if (!studioShortcut(e)) e.stopPropagation(); });
  }

  // --- the header (09-studio header) ---------------------------------------------------------------------------
  const mark = el('span', 'st');
  mark.innerHTML = STUDIO_GLYPHS.mark;
  mark.append(el('span', 'wd', t('studio.ws.title')));
  const projectName = markDatum(el('span', 'pn', ''), 'map-name');
  // the scene's safety (09-studio header .sv and the undo/redo pair): its autosave, and the steps either side
  const savedState = el('span', 'sv');
  savedState.hidden = true;
  savedState.append(el('i'), el('span'));
  const restoreBtn = chipButton(t('studio.ws.restore'), 'undo');
  restoreBtn.hidden = true;
  restoreBtn.addEventListener('click', () => {
    restoreBtn.disabled = true;
    void S.restoreAutosave().finally(() => { restoreBtn.disabled = false; api.refreshHistory(); });
  });
  const undoBtn = iconButton(t('studio.ws.undoTitle'));
  undoBtn.innerHTML = uiIconSVG('undo', 16);
  undoBtn.addEventListener('click', () => { void S.undo(); });
  const redoBtn = iconButton(t('studio.ws.redoTitle'));
  redoBtn.classList.add('redo');
  redoBtn.innerHTML = uiIconSVG('undo', 16);
  redoBtn.addEventListener('click', () => { void S.redo(); });
  const historyTools = el('span', 'hist');
  historyTools.append(savedState, restoreBtn, undoBtn, redoBtn);
  /** "2 minutes ago" in the page's language, empty under a minute. */
  function agoText(at: number): string {
    const minutes = Math.round((Date.now() - at) / 60000);
    if (minutes < 1) return '';
    const format = new Intl.RelativeTimeFormat(getLocale(), { numeric: 'auto' });
    if (minutes < 60) return format.format(-minutes, 'minute');
    return minutes < 1440 ? format.format(-Math.round(minutes / 60), 'hour') : format.format(-Math.round(minutes / 1440), 'day');
  }
  function refreshSaved(): void {
    const { savedAt } = S.history;
    savedState.hidden = !savedAt;
    if (!savedAt) return;
    const ago = agoText(savedAt);
    const text = ago ? t('studio.ws.saved', { ago }) : t('studio.ws.savedNow');
    const label = savedState.lastElementChild;
    if (label && label.textContent !== text) label.textContent = text;
  }
  const formatSeg = el('div', 'cot-c-seg');
  formatSeg.setAttribute('role', 'radiogroup');
  wireRovingKeys(formatSeg);
  formatSeg.setAttribute('aria-label', productionLabel('format'));
  const formatButtons = FILM_FORMATS.map(([format, ratio]) => {
    const option = el('button', 'cot-c-seg__opt', ratio);
    option.type = 'button';
    option.setAttribute('role', 'radio');
    option.dataset.value = format;
    option.dataset.tip = productionLabel(format);
    option.addEventListener('click', () => chooseFormat(format));
    formatSeg.appendChild(option);
    return option;
  });
  // Quick | Pro (brand-ui SPEC 12.6): Quick keeps the essentials, Pro adds the fine controls; each viewer's own choice
  const modeSeg = el('div', 'cot-c-seg st-mode');
  modeSeg.setAttribute('role', 'radiogroup');
  wireRovingKeys(modeSeg);
  modeSeg.setAttribute('aria-label', t('studio.ws.controls'));
  const modeButtons = (['quick', 'pro'] as const).map((mode) => {
    const option = el('button', 'cot-c-seg__opt', t(`studio.ws.mode.${mode}`));
    option.type = 'button';
    option.setAttribute('role', 'radio');
    option.dataset.value = mode;
    option.addEventListener('click', () => setControlsMode(mode));
    modeSeg.appendChild(option);
    return option;
  });
  let proControls = readControlsMode() === 'pro';
  function setControlsMode(mode: 'quick' | 'pro'): void {
    proControls = mode === 'pro';
    root.dataset.studioMode = mode;
    for (const option of modeButtons) {
      const on = option.dataset.value === mode;
      option.setAttribute('aria-checked', String(on));
      option.tabIndex = on ? 0 : -1;
    }
    try { localStorage.setItem(CONTROLS_MODE_KEY, mode); } catch (_) { /* private windows */ }
    if (proControls && planShown) planView.refreshPlan();
  }
  const headRight = el('div', 'r');
  // Commands (09-studio header): the palette over every action, with its shortcut
  const commandsBtn = chipButton(t('studio.ws.commands'), 'search');
  commandsBtn.classList.add('cmd');
  commandsBtn.appendChild(studioKeycap(PALETTE_KEY));
  commandsBtn.addEventListener('click', () => commandPalette.open());
  const linkBtn = chipButton(t('studio.sceneLink.copyButton'), null);
  linkBtn.insertAdjacentHTML('afterbegin', SCENE_LINK_GLYPHS.link);
  linkBtn.dataset.tip = t('studio.sceneLink.copyTitle');
  linkBtn.dataset.sceneLinkCopy = '';
  linkBtn.addEventListener('click', () => {
    copySceneLink(S.state(), browserSceneLinkEnv())
      .then((result) => api.notice(result.message, result.ok ? 'info' : 'error', result.detail));
  });
  const galleryBtn = chipButton(t('studioPanel.tankGallery'), 'gallery');
  galleryBtn.classList.add('gal');
  galleryBtn.addEventListener('click', () => {
    const id = S._internal.selected?.spec?.id;
    window.location.href = hrefForLocale(id ? galleryHref(id) : '/gallery', getLocale());
  });
  const exportBtn = kitButton(t('studio.ws.exportFilm'), 'primary', 'film');
  exportBtn.addEventListener('click', () => startFilmExport());
  // Exit is a chip as its neighbours are (a ghost button set it in unbordered capitals among them)
  const exitBtn = chipButton(t('studio.ws.exit'), 'close');
  exitBtn.appendChild(studioKeycap('F8'));
  exitBtn.addEventListener('click', () => S.exit());
  // the pointer or the focus on Exit is the sign the Garage is next: a direct /studio visit builds its hero then (main.ts)
  const exitIntent = (): void => { window.dispatchEvent(new Event('cot:studio-exit-intent')); };
  exitBtn.addEventListener('pointerenter', exitIntent, { once: true });
  exitBtn.addEventListener('focus', exitIntent, { once: true });
  // Queue · N (09-studio header): the render queue's deliveries, run one after another
  const queueBtn = chipButton(t('studio.ws.queue'), 'clock');
  queueBtn.classList.add('que');
  queueBtn.setAttribute('aria-haspopup', 'dialog');
  queueBtn.setAttribute('aria-expanded', 'false');
  queueBtn.addEventListener('click', () => toggleQueue());
  headRight.append(commandsBtn, linkBtn, queueBtn, galleryBtn, exportBtn, exitBtn);
  head.append(mark, projectName, historyTools, modeSeg, formatSeg, headRight);

  // --- the viewport (09-studio .vp): chips, notices and the frame readout over the canvas ---------------------------
  const vpTop = el('div', 'st-vpt');
  const shotChip = chipButton('', 'toolPhoto');
  shotChip.addEventListener('click', () => productionPanel.activate('cinematics'));
  // Look through (09-studio .vpt): the view is the shots' camera at the playhead; navigating leaves it
  const lookChip = chipButton(t('studio.ws.lookThrough'), 'scope', true);
  lookChip.addEventListener('click', () => S.setLookThrough(!S.lookThrough));
  // the camera's mode and lens are the Cinematics workspace's controls, not chips beside them (UI-LOCKDOWN G17)
  vpTop.append(shotChip, lookChip);
  const vpTools = el('div', 'st-vpb');
  const guidesChip = chipButton(t('studio.ws.guides'), 'pixels', true);
  guidesChip.addEventListener('click', () => {
    const check = root.querySelector<HTMLInputElement>('[data-production-guides]');
    if (!check) return;
    check.checked = !check.checked;
    check.dispatchEvent(new Event('change'));
    guidesChip.setAttribute('aria-pressed', String(check.checked));
  });
  vpTools.append(guidesChip);
  const frameCounter = markDatum(el('span', 'st-fc'), 'playhead');
  // the selection (09-studio .sel and .giz): an outline round the selected tank with its name tag, and the move and turn
  // gizmo at its feet; drawn from the live camera after each frame (drawSelection), never into an export
  const selBox = el('div', 'st-sel');
  selBox.hidden = true;
  selBox.setAttribute('aria-hidden', 'true');
  // the name tag sits on the outline's top edge, kept inside the picture and below the chips
  const selTag = markDatum(el('span', 'st-sel-tag'), 'tank-name');
  selTag.hidden = true;
  selTag.setAttribute('aria-hidden', 'true');
  const selTagText = el('span');
  selTag.append(selTagText);
  const svgNode = <Tag extends keyof SVGElementTagNameMap>(tag: Tag, cls: string): SVGElementTagNameMap[Tag] => {
    const node = document.createElementNS(SVG_NS, tag);
    node.setAttribute('class', cls);
    return node;
  };
  const gizmo = svgNode('svg', 'st-giz');
  gizmo.setAttribute('aria-hidden', 'true');
  gizmo.setAttribute('hidden', '');
  const gizmoRing = svgNode('polygon', 'ring');
  const gizmoX = svgNode('line', 'ax ax--x');
  const gizmoY = svgNode('line', 'ax ax--y');
  const gizmoHeadX = svgNode('polygon', 'hd');
  const gizmoHeadY = svgNode('polygon', 'hd');
  const gizmoOrigin = svgNode('circle', 'o');
  gizmoOrigin.setAttribute('r', '4');
  gizmo.append(gizmoRing, gizmoX, gizmoY, gizmoHeadX, gizmoHeadY, gizmoOrigin);
  vp.append(selBox, selTag, gizmo, vpTop, vpTools, frameCounter);
  const selFrame: StudioSelectionFrame = { visible: false, left: 0, top: 0, right: 0, bottom: 0, cx: 0, cy: 0, rx: 0, ry: 0,
    ux: 0, uy: 0, ring: new Float32Array(64) };
  let selTagKey = '';
  let selTagWidth = 0;
  /** An axis of the gizmo: its line from the centre and its arrowhead past the tip. */
  function gizmoAxis(line: SVGLineElement, head: SVGPolygonElement, cx: number, cy: number, dx: number, dy: number): void {
    const tipX = cx + dx, tipY = cy + dy;
    line.setAttribute('x1', cx.toFixed(1)); line.setAttribute('y1', cy.toFixed(1));
    line.setAttribute('x2', tipX.toFixed(1)); line.setAttribute('y2', tipY.toFixed(1));
    const length = Math.hypot(dx, dy);
    if (length < 4) { head.setAttribute('points', ''); return; }
    const ux = dx / length, uy = dy / length;
    head.setAttribute('points', `${(tipX + ux * 6).toFixed(1)},${(tipY + uy * 6).toFixed(1)} ${(tipX - ux + uy * 4).toFixed(1)},`
      + `${(tipY - uy - ux * 4).toFixed(1)} ${(tipX - ux - uy * 4).toFixed(1)},${(tipY - uy + ux * 4).toFixed(1)}`);
  }
  function drawSelection(): void {
    const a = S._internal.selected;
    if (!a || root.style.display !== 'block' || !S.projectSelection(selFrame)) {
      selBox.hidden = true;
      selTag.hidden = true;
      gizmo.setAttribute('hidden', '');
      return;
    }
    const f = selFrame;
    // measured before this frame's writes: the picture, and the foot of the chips over it
    const vpWidth = vp.clientWidth, vpHeight = vp.clientHeight;
    const chipsFoot = vpTop.offsetTop + vpTop.offsetHeight + 4;
    selBox.hidden = false;
    selBox.style.left = `${Math.round(f.left)}px`;
    selBox.style.top = `${Math.round(f.top)}px`;
    selBox.style.width = `${Math.max(8, Math.round(f.right - f.left))}px`;
    selBox.style.height = `${Math.max(8, Math.round(f.bottom - f.top))}px`;
    // the tag names the tank; its heading is the transform's field and the facing slider (UI-LOCKDOWN G13)
    const key = a.uid;
    selTag.hidden = false;
    if (key !== selTagKey) {
      selTagKey = key;
      selTag.replaceChildren(flagNode(specInfo(a.spec.id).nation || ''), selTagText);
      selTagText.textContent = a.spec.name;
      selTagWidth = selTag.offsetWidth;
    }
    // above the outline, or under it when the chips leave no room above: never on the tank, never past the picture's sides
    const tagLeft = Math.max(4, Math.min(f.left, vpWidth - selTagWidth - 4));
    let tagTop = f.top - 24;
    if (tagTop < chipsFoot) tagTop = Math.max(f.bottom + 4, chipsFoot);
    selTag.style.left = `${Math.round(tagLeft)}px`;
    selTag.style.top = `${Math.round(Math.min(tagTop, vpHeight - 26))}px`;
    // the gizmo at one screen size: the ring's widest reach is GIZMO_RADIUS, the axes keep their true directions
    let reach = 0;
    for (let i = 0; i < f.ring.length; i += 2) reach = Math.max(reach, Math.hypot(f.ring[i], f.ring[i + 1]));
    if (reach < 0.5) { gizmo.setAttribute('hidden', ''); return; }
    const k = GIZMO_RADIUS / reach;
    let ring = '';
    for (let i = 0; i < f.ring.length; i += 2) ring += `${(f.cx + f.ring[i] * k).toFixed(1)},${(f.cy + f.ring[i + 1] * k).toFixed(1)} `;
    gizmoRing.setAttribute('points', ring);
    gizmoAxis(gizmoX, gizmoHeadX, f.cx, f.cy, f.rx * k, f.ry * k);
    gizmoAxis(gizmoY, gizmoHeadY, f.cx, f.cy, f.ux * k, f.uy * k);
    gizmoOrigin.setAttribute('cx', f.cx.toFixed(1));
    gizmoOrigin.setAttribute('cy', f.cy.toFixed(1));
    gizmo.removeAttribute('hidden');
  }

  const busy = el('div', 'busy');
  vp.appendChild(busy);
  // What an action did (a scene link, a delivery, a staged take): the kit's toast, one at a time over the picture's top
  noticeRegion('studio', { host: vp, placement: 'host', limit: 1, className: 'st-notices' });

  // --- the outliner (09-studio .out): one group per workspace, its head the workspace's switch ----------------------
  const outlineGroups = new Map<WorkspaceId, HTMLDivElement>();
  const outlineHeads = new Map<WorkspaceId, HTMLButtonElement>();
  const workspaceNames = new Map<WorkspaceId, string>();
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
  // INTERACTION-REDESIGN A: the battlefields are the kit's battlefield picker (battlefieldPicker.ts), built on the first
  // open: each map's picture, name and biomes, the biome chips, search and favourites. The inspector is narrower than the
  // picker's own preview needs, so the card above it is the preview: the map under the pointer or the focus shows there,
  // and leaving puts the scene's map back.
  const mapPop = el('div', 'mapPop');
  // a sheet names itself and closes from its own head (a touch screen has no Escape)
  const mapPopHead = el('div', 'mapPopHead');
  const mapPopClose = el('button', 'cot-c-btn cot-c-btn--icon cot-c-btn--ghost mapPopX');
  mapPopClose.type = 'button';
  mapPopClose.innerHTML = uiIconSVG('close', 18);
  mapPopClose.setAttribute('aria-label', t('picker.close'));
  mapPopClose.addEventListener('click', () => { toggleMapPick(false); mapBtn.focus(); });
  mapPopHead.append(el('span', 'mapPopTitle', t('studioPanel.section.map')), mapPopClose);
  let mapPicker: BattlefieldPicker | null = null;
  const mapRegions = [...new Set(S.MAP_IDS.flatMap((id) => mapRegionTags(id)))];
  const mapPickerCards = (): BattlefieldCard[] => S.MAP_IDS.map((id) => {
    const thumb = imageFor(MAP_THUMBS, id) || '';
    return { id, name: mapLabel(id), facts: mapRegionTags(id).slice(0, 2).map((tag) => t(`camoTag.${tag}`)),
      media: { poster: thumb }, hero: imageFor(MAP_HEROES, id) || thumb, tags: [...mapRegionTags(id)] };
  });
  mapPick.append(mapBtn, mapPop);
  secScene.appendChild(mapPick);
  // the times of day: the kit's picker menu (261 census: seven times, some a battlefield lacks), the battlefield's own
  // times choosable; the change lights the scene before the menu takes another
  const timeHost = el('div', 'timeMenu');
  let timeBusy = false;
  /** The times the scene's battlefield has (all seven until its light is read). */
  let timesOpen: readonly StudioTimeOfDay[] = STUDIO_TIMES;
  const timeItems = (): PickerItem[] => STUDIO_TIMES.map((time) => ({ id: time, name: t(`atmosphere.${time}`),
    ...(timesOpen.includes(time) ? {} : { disabled: t('studioPanel.light.timeUnavailable') }) }));
  function chooseTime(time: StudioTimeOfDay): void {
    if (timeBusy || time === S.timeOfDay || !timesOpen.includes(time)) return;
    timeBusy = true;
    timeMenu.setDisabled(true);
    S.setTimeOfDay(time)
      .catch((error: RuntimeValue) => flashBusy(errorMessage(error)))
      .finally(() => { timeBusy = false; timeMenu.setDisabled(S.recordingStatus().active); api.refreshMap(); });
  }
  const timeMenu = createPickerMenu(timeHost, {
    id: 'studio-hour', label: t('studioPanel.timeOfDay'), items: timeItems(), value: S.timeOfDay ?? 'day', layout: 'list', text: pickerText(),
    onChoose: (item) => chooseTime(item.id as StudioTimeOfDay),
  });
  secScene.appendChild(timeHost);

  // --- the sun (media r5): bearing on a north-up compass (world +Z up, -X right, as the tactical map), lighting
  // presets relative to the camera, elevation inside the time's band. Slider-rate changes coalesce to one apply.
  const secLight = el('div', 'sec');
  secLight.appendChild(sectionHead(t('studio.ws.light'), 'timeDay'));
  const svg = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] => {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
    return node;
  };
  const sunBlock = el('div', 'sun');
  const dial = svg('svg', { viewBox: '-50 -50 100 100', class: 'sunDial', role: 'slider', tabindex: 0,
    'aria-label': t('studioPanel.light.bearingAria'), 'aria-valuemin': 0, 'aria-valuemax': 359 });
  dial.append(svg('circle', { r: 44, class: 'ring', 'stroke-width': 1 }), svg('circle', { r: 30, class: 'ring', 'stroke-width': 1 }));
  // north's tick is its label (the line ran through the glyph)
  for (let tick = 30; tick < 360; tick += 30) {
    const a = tick * Math.PI / 180, r0 = tick % 90 ? 40 : 36;
    dial.appendChild(svg('line', { x1: -Math.sin(a) * r0, y1: -Math.cos(a) * r0, x2: -Math.sin(a) * 44, y2: -Math.cos(a) * 44,
      class: tick % 90 ? 'tick' : 'tick major', 'stroke-width': 1 }));
  }
  // north reads at the rim, and the camera's wedge stays inside the inner ring, clear of it at every bearing
  const north = svg('text', { x: 0, y: -38, 'text-anchor': 'middle', 'dominant-baseline': 'central', class: 'north' });
  north.textContent = t('studioPanel.light.north');
  const camWedge = svg('path', { d: 'M0 0 L-7.5 -25 A26 26 0 0 1 7.5 -25 Z', class: 'cam', 'stroke-width': 1 });
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
    button.dataset.tip = t(`studioPanel.light.${key}Hint`);
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
  const lampBtn = chipButton(t('studioPanel.light.headlights'), 'lightbulb', false);
  lampBtn.dataset.tip = t('studioPanel.light.headlightsHint');
  lampBtn.addEventListener('click', () => queueLight({ headlights: !S.getLight().headlights }));
  const elevation = sliderRow(t('studioPanel.light.elevation'), 1, 80, 0.5, (value) => {
    queueLight({ sunElevationDeg: value });
  });
  elevation.input.setAttribute('aria-label', t('studioPanel.light.elevationAria'));
  const elevationReset = chipButton(t('studioPanel.light.auto'), null, false);
  elevationReset.dataset.tip = t('studioPanel.light.autoHint');
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
      // whole degrees as the bearing and the outliner write them; a half step keeps its decimal
      el('b', null, `${Number.isInteger(elev) ? elev : elev.toFixed(1)}°`));
    elevation.setRange(light.band.min, light.band.max);
    elevation.set(elev);
    press(elevationReset, light.override?.sunElevationDeg === undefined);
    press(presetButtons[4], light.override?.sunAzimuthDeg === undefined);
    sunNote.textContent = light.space ? t('studioPanel.light.spaceNote') : '';
    press(lampBtn, light.headlights);
    if (light.times.join() !== timesOpen.join()) {
      timesOpen = light.times;
      timeMenu.setItems(timeItems(), light.time);
    } else timeMenu.setValue(light.time);
  }
  battlefieldGroup.body.append(secScene, secLight);

  // the scene's outliner rows: the battlefield (09-studio "Glacier Pass") and its light ("Morning · 105° / 15°")
  const mapRow = outlineRow(() => { productionPanel.activate('battlefield'); toggleMapPick(true); });
  const mapRowThumb = document.createElement('img');
  mapRowThumb.className = 'th';
  mapRowThumb.alt = '';
  mapRowThumb.decoding = 'async';
  // the rows name their sections: the map and its light read once, on the inspector's card and dial (the s16 critic)
  mapRow.pick.append(mapRowThumb, el('span', 'nm', t('studioPanel.section.map')));
  const lightRow = outlineRow(() => { productionPanel.activate('battlefield'); secLight.scrollIntoView({ block: 'nearest' }); });
  lightRow.pick.innerHTML = uiIconSVG('timeDay', 16);
  // the row names the light; its sun's angles are the dial's (UI-LOCKDOWN G15)
  lightRow.pick.append(el('span', 'nm', t('studioPanel.timeOfDay')));
  sceneRows.append(mapRow.row, lightRow.row);

  /** A map's name in the locale (翠野原, not Verdant Fields), its own name where the catalog has none. */
  function mapLabel(id: string): string {
    const nameKey = `map.${id}`;
    return t(nameKey) === nameKey ? (S.getMapInfo ? S.getMapInfo(id).name : '') || id : t(nameKey);
  }
  /** The battlefield card shows `id` (the picker's preview), or the scene's own map. */
  function paintMapCard(id: string | null): void {
    const shown = id ?? S.mapId;
    if (!shown) return;
    mapHero.src = imageFor(MAP_HEROES, shown) || imageFor(MAP_THUMBS, shown) || '';
    mapName.textContent = mapLabel(shown);
    mapId.textContent = shown;
  }
  /**
   * The popover takes the inspector's room under the card, with the map's heading at the inspector's top: a focus moving
   * in it scrolls its own grid, never the inspector, so the card above it (its preview) stays whole (the s15 critic: on a
   * phone and at 1024 x 600 the card scrolled away or showed as a strip).
   */
  function fitMapPop(): void {
    mapPop.style.cssText = '';
    const scroller = mapPick.closest<HTMLElement>('.st-insp');
    if (!scroller) return;
    const pad = parseFloat(getComputedStyle(scroller).paddingTop) || 0;
    scroller.scrollTop += secScene.getBoundingClientRect().top - scroller.getBoundingClientRect().top - pad;
    const box = scroller.getBoundingClientRect();
    const room = box.bottom - mapPick.getBoundingClientRect().bottom - MAP_POP_GAP;
    const sheet = room < MAP_POP_SHEET_BELOW;
    mapPop.classList.toggle('sheet', sheet);
    if (!sheet) {
      if (mapPop.parentElement !== mapPick) mapPick.append(mapPop);
      mapPop.style.maxHeight = `${Math.round(Math.max(MAP_POP_MIN, Math.min(MAP_POP_MAX, innerHeight * 0.65, room)))}px`;
      return;
    }
    // the inspector contains its paint: the sheet stands in the Studio's root, centred under the bar
    const host = mapPick.closest<HTMLElement>('.cot-studio');
    if (host && mapPop.parentElement !== host) host.append(mapPop);
    const wide = innerWidth >= MAP_SHEET_WIDE_FROM;
    const gutter = innerWidth < 600 ? MAP_SHEET_GUTTER_NARROW : MAP_SHEET_GUTTER;
    const width = Math.min(innerWidth - 2 * gutter, wide ? MAP_SHEET_WIDE : MAP_SHEET);
    const tall = innerHeight - MAP_SHEET_TOP - gutter;
    const height = Math.min(tall, wide ? MAP_SHEET_WIDE_HEIGHT : MAP_SHEET_HEIGHT);
    mapPop.style.cssText = `left:${Math.round((innerWidth - width) / 2)}px;width:${Math.round(width)}px;`
      + `top:${Math.round(MAP_SHEET_TOP + (tall - height) / 2)}px;height:${Math.round(height)}px`;
    requestAnimationFrame(trimMapSheet);
  }
  /** The sheet ends on its maps' last whole row: it gives up the cut row's height, half above and half below (the s20
   *  critic: its foot sliced the third and fourth rows of maps). */
  function trimMapSheet(): void {
    if (!mapPop.classList.contains('sheet') || !mapPop.classList.contains('open')) return;
    const grid = mapPop.querySelector<HTMLElement>('.cot-c-picker__grid');
    if (!grid || grid.scrollHeight <= grid.clientHeight + 1) return;
    const top = grid.getBoundingClientRect().top + grid.clientTop;
    const bottom = top + grid.clientHeight - (parseFloat(getComputedStyle(grid).paddingBottom) || 0);
    let foot = -Infinity;
    for (const cell of grid.children) {
      const cellBox = cell.getBoundingClientRect();
      if (cellBox.height > 0 && cellBox.top >= top - 0.5 && cellBox.bottom <= bottom + 0.5) foot = Math.max(foot, cellBox.bottom);
    }
    const cut = Number.isFinite(foot) ? Math.floor(bottom - foot) : 0;
    if (cut < 2) return;
    const sheetBox = mapPop.getBoundingClientRect();
    mapPop.style.height = `${Math.round(sheetBox.height - cut)}px`;
    mapPop.style.top = `${Math.round(sheetBox.top + cut / 2)}px`;
  }
  // the battlefield popover and the render queue are transient surfaces (components/surfaceStack.ts): one opens as the other
  // closes, and Escape and a press outside are the stack's
  const mapSurface: TransientSurface = {
    id: 'studio-battlefield',
    element: () => mapPop,
    owns: (node) => mapPick.contains(node) || mapRow.row.contains(node),
    close: (reason) => { toggleMapPick(false); if (reason === 'escape') mapBtn.focus(); },
  };
  function toggleMapPick(open?: boolean): void {
    const next = open != null ? open : !mapPop.classList.contains('open');
    if (next) openSurface(mapSurface, mapBtn); else closeSurface(mapSurface);
    mapPop.classList.toggle('open', next);
    mapBtn.setAttribute('aria-expanded', String(next));
    if (!next) { paintMapCard(null); return; }
    fitMapPop();
    if (mapPicker) mapPicker.setValue(S.mapId);
    else {
      mapPicker = createBattlefieldPicker(mapPop, {
        id: 'studio-battlefield', label: t('studioPanel.map.listAria'), cards: mapPickerCards(), value: S.mapId, mode: 'studio',
        text: pickerText(), filters: mapRegions.map((tag) => ({ id: tag, label: t(`camoTag.${tag}`) })),
        onPreview: (card) => paintMapCard(card ? card.id : null),
        onChoose: (id) => { chooseMap(id); mapBtn.focus(); },
      });
      mapPop.prepend(mapPopHead);
    }
    mapPicker.focus();
  }
  function setMapLoading(loading: boolean): void {
    mapBtn.disabled = loading;
    mapPick.setAttribute('aria-busy', String(loading));
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

  // === TANKS group ===
  const tanksGroup = panelGroup('02', 'tanks', t('studioPanel.panel.tanks.title'));
  dock.appendChild(tanksGroup.root);

  // === SELECTED ACTOR section (09-studio .insp: the hero card, Transform, Pose, Paint and state) ===
  const secSel = section('selectedTank', t('studioPanel.section.selectedTank'), 'vehicle');
  // the card shows the tank alone; its flag and name sit on their own line under it (no text on a tank)
  const hero = el('div', 'st-hero');
  const heroSil = el('span', 'cot-c-sil');
  // its name and flag are the selection tag's (UI-LOCKDOWN G12)
  hero.append(heroSil);
  secSel.append(hero);
  const transform = el('div', 'sec');
  transform.appendChild(sectionHead(t('studio.ws.transform'), 'freeLook'));
  const fields = el('div', 'fld');
  const px = numField('x', (v) => patchSel({ x: v }));
  const pz = numField('z', (v) => patchSel({ z: v }));
  const heading = numField('°', (v) => patchSel({ facingDeg: ((v % 360) + 360) % 360 }));
  fields.append(px.label, pz.label, heading.label);
  // the snap (09-studio Transform .seg): where a dragged or placed tank lands
  const snapSeg = el('div', 'cot-c-seg');
  snapSeg.setAttribute('role', 'radiogroup');
  wireRovingKeys(snapSeg);
  snapSeg.setAttribute('aria-label', t('studio.ws.snap'));
  const snapButtons = (['road', 'terrain', 'off'] as const).map((snap) => {
    const option = el('button', 'cot-c-seg__opt', t(`studio.ws.snap.${snap}`));
    option.type = 'button';
    option.setAttribute('role', 'radio');
    option.dataset.value = snap;
    option.dataset.tip = t(`studio.ws.snapTitle.${snap}`);
    option.addEventListener('click', () => { S.setPlacementSnap(snap); refreshSnap(); });
    snapSeg.appendChild(option);
    return option;
  });
  function refreshSnap(): void {
    for (const option of snapButtons) {
      const on = option.dataset.value === S.placementSnap;
      option.setAttribute('aria-checked', String(on));
      option.tabIndex = on ? 0 : -1;
    }
  }
  refreshSnap();
  transform.append(fields, snapSeg);
  const pose = el('div', 'sec');
  pose.appendChild(sectionHead(t('studio.ws.pose'), 'turretRing'));
  const facing = sliderRow(t('studio.ws.facing'), 0, 360, 1, (v) => patchSel({ facingDeg: v }), 'steerLeft');
  const turret = sliderRow(t('studio.ws.turret'), -180, 180, 1, (v) => patchSel({ turretDeg: v }), 'turretRing');
  const gun = sliderRow(t('studio.ws.gun'), -10, 25, 0.5, (v) => patchSel({ gunDeg: v }), 'gun');
  const recoilBtn = chipButton(t('studio.recoilPose'), 'fireGun');
  recoilBtn.addEventListener('click', () => patchSel({ recoilAgeS: 0.05 }));
  recoilBtn.dataset.pro = '';
  // the pose presets (09-studio .poses): the selected tank's silhouette over each pose's name
  const poses = el('div', 'poses');
  const poseSils: HTMLSpanElement[] = [];
  for (const preset of ['hull-down', 'firing', 'knocked-out'] as const) {
    const option = el('button');
    option.type = 'button';
    option.dataset.pose = preset;
    const sil = el('span', 'cot-c-sil');
    sil.setAttribute('aria-hidden', 'true');
    poseSils.push(sil);
    option.append(sil, el('span', null, t(`studio.ws.posePreset.${preset}`)));
    option.addEventListener('click', () => {
      const a = S._internal.selected;
      if (!a) return;
      if (!S.applyPosePreset(a, preset)) api.notice(t('studio.ws.noCrest'), 'info');
      api.refreshSelected();
    });
    poses.appendChild(option);
  }
  pose.append(facing.row, turret.row, gun.row, recoilBtn, poses);
  // paint: the kit's camo picker (camoPicker.ts, the Garage's): every catalogue paint as its real swatch on this tank, by
  // kind, with search and the tank's favourites and recents (memory camo.<specId>, shared with the Garage); its own paint
  // reset puts the scene's paint back (a bespoke strip of 174 swatches named by their ids in the census)
  const paint = el('div', 'sec');
  paint.appendChild(sectionHead(t('studio.ws.paint'), 'camouflage'));
  const camoHost = el('div', 'cot-camo-picker st-camo');
  const inheritBtn = kitButton(t('studioPanel.selected.camoInherit'), 'ghost', 'undo');
  inheritBtn.addEventListener('click', () => patchSel({ camo: null }));
  // the swatches paint a few a frame, the painter and the fleet's specs loading with the first
  let swatchPainter: Promise<SwatchPainter> | null = null;
  const swatchQueue: Array<readonly [HTMLCanvasElement, string, string]> = [];
  let swatchFrame = 0;
  function pumpSwatches(): void {
    if (swatchFrame || !swatchQueue.length) return;
    swatchPainter ??= Promise.all([import('./camoSwatchPainter.ts'), import('../vehicles/specs.ts')])
      .then(([painter, specs]) => ({ paint: painter.paintCamoSwatch, auto: painter.paintAutoCamoSwatch, spec: specs.getSpec }));
    swatchFrame = requestAnimationFrame(() => {
      swatchFrame = 0;
      void swatchPainter?.then((painter) => {
        for (const [canvas, specId, patternId] of swatchQueue.splice(0, SWATCHES_PER_FRAME)) {
          const spec = painter.spec(specId) as unknown as Parameters<SwatchPainter['paint']>[1] | undefined;
          if (!spec || !canvas.isConnected) continue;
          if (patternId === 'auto') painter.auto(canvas, spec);
          else painter.paint(canvas, spec, patternId);
        }
        pumpSwatches();
      });
    });
  }
  const camoLabel = (id: string): string => {
    const generic = `garage.camo.generic.${id}`;
    return t(generic) !== generic ? t(generic) : id === 'auto' ? t('garage.camo.auto') : t(`camoPattern.${id}`);
  };
  const camoPicker = createGarageCamoPicker({
    id: 'studio-camo', host: camoHost, label: t('studioPanel.selected.camoLabel'), patterns: S.CAMO_PATTERN_IDS,
    words: {
      label: camoLabel, nationOfTag: camoTagNation, nationName: (nation) => t(`nation.${nation}`),
      kindName: (kind) => t(`garage.camo.kind.${kind}`), auto: camoLabel('auto'), makeOwn: t('garage.camo.makeOwn'),
    },
    text: pickerText(), custom: false,
    createSwatch: () => createUiCanvas(null, '', { draw: coverImage }).canvas,
    paintSwatch: (canvas, specId, patternId) => { swatchQueue.push([canvas, specId, patternId]); pumpSwatches(); },
    // the selected tank tries the paint under the pointer or the focus on (the Garage's try-on), and a press wears it
    onPreview: (patternId) => S.previewActorCamo(S._internal.selected, patternId),
    onChoose: (patternId) => patchSel({ camo: patternId }),
    onMakeOwn: () => {},
  });
  // the selected tank's state: the kit's picker menu (261 census: six states)
  const stateHost = el('div', 'stateMenu');
  const stateMenu = createPickerMenu(stateHost, {
    id: 'studio-state', label: t('studioPanel.selected.stateLabel'), value: S.ACTOR_STATES[0] ?? null, layout: 'list', text: pickerText(),
    items: S.ACTOR_STATES.map((sid) => ({ id: sid, name: t(`studio.ws.state.${sid}`) })),
    onChoose: (item) => { const a = S._internal.selected; if (a) S.setActorState(a, item.id); },
  });
  paint.append(camoHost, inheritBtn, stateHost);
  const delBtn = kitButton(t('studio.remove'), 'danger', 'trash');
  delBtn.classList.add('cot-c-btn--wide');
  delBtn.addEventListener('click', () => { const a = S._internal.selected; if (a) S.removeActor(a); });
  secSel.append(transform, pose, paint, delBtn);
  const selEmpty = el('div', 'note', t('studioPanel.emptySelected'));
  tanksGroup.body.append(selEmpty, secSel);

  // === ADD TANKS section: the roster on the kit's picker menu (each tank's portrait, its name and era), add in view or
  // click to place. A hand-made list until 261 (owner 2026-10-27: every list of tanks shows each tank, one row look)
  const secActors = section('addTanks', t('studioPanel.section.addTanks'), 'zoomIn');
  let pickedId = 'm1a1_abrams_hc';
  const pick = el('div', 'pick');
  secActors.appendChild(pick);

  const specInfo = (id: string): StudioSpecInfo => {
    try { return S.getSpecInfo(id); } catch (_) { return { id, name: id, era: '' }; }
  };
  // the playable roster first, then the development builds, each group a filter chip
  const actorItems = (): PickerItem[] => [...S.TANK_IDS].sort((a, b) => Number(!!specInfo(a).developmentOnly) - Number(!!specInfo(b).developmentOnly)).map((id) => {
    const info = specInfo(id);
    const tag = info.developmentOnly ? info.rosterTag || t('studioPanel.picker.devFallback')
      : info.era ? vehicleEraLabelI18n(info.era, t, { short: true }) : '';
    return { id, name: info.name, ...(tag ? { facts: [tag] } : {}), media: { poster: tankThumbUrl(id), tank: true },
      tags: [info.developmentOnly ? 'development' : 'production'] };
  });
  const actorMenu = createPickerMenu(pick, {
    id: 'studio-actor', label: t('studioPanel.section.addTanks'), items: actorItems(), value: pickedId, layout: 'list', text: pickerText(),
    memory: 'studio-actor',
    filters: [{ id: 'production', label: t('studioPanel.picker.productionGroup') }, { id: 'development', label: t('studioPanel.picker.developmentGroup') }],
    onChoose: (item) => { pickedId = item.id; },
  });
  function setPicked(id: string): void {
    pickedId = id;
    actorMenu.setValue(id);
  }
  function togglePick(open: boolean): void {
    if (open) actorMenu.open();
    else actorMenu.close();
  }
  setPicked(pickedId);

  const addRow2 = el('div', 'grid');
  const addAtMarker = kitButton(t('studio.addInView'));
  addAtMarker.dataset.tip = t('studio.addInViewTitle');
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
  clearStackBtn.hidden = true;
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
  // the render switches: each chip names its layer and its pressed state says on or off
  cineGroup.appendChild(el('div', 'gh', t('studioPanel.fxGroup.render')));
  const cineToggles = el('div', 'grid');
  const cineBtn = chipButton(t('studioPanel.fx.cinematic'), null, false);
  cineBtn.addEventListener('click', () => S.setFxQuality(S.fxQuality === 'cinematic' ? 'battle' : 'cinematic'));
  const dustBtn = chipButton(t('studioPanel.fx.trackDust'), null, false);
  dustBtn.addEventListener('click', () => S.setTrackDust(!S.trackDust));
  // the map's air (world/mapAmbience.ts): pollen, leaves, snow, dust, embers by map
  const airBtn = chipButton(t('studioPanel.fx.ambience'), null, true);
  airBtn.addEventListener('click', () => { S.setAmbience(!S.ambience); refreshCinematicToggles(); });
  // the third switch takes the row the first two leave (a lone half-width chip read as a stray)
  airBtn.style.gridColumn = '1 / -1';
  cineToggles.append(cineBtn, dustBtn, airBtn);
  cineGroup.appendChild(cineToggles);
  secBoard.appendChild(cineGroup);
  function refreshCinematicToggles(): void {
    const on = S.fxQuality === 'cinematic';
    press(cineBtn, on);
    press(dustBtn, S.trackDust);
    press(airBtn, S.ambience);
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
  fxParamsBox.dataset.pro = '';
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
  // the timeline's header adds shots and keys tanks (these two stay as the controls it drives, out of the panel)
  authorRow.append(addShotBtn, keyActorBtn);
  const railRow = el('div', 'col');
  const railBtn = chipButton(t('studio.showCameraRail'), 'cameraPath', false);
  railBtn.addEventListener('click', () => S.setRailVisible(!S.railVisible));
  const clearTrackBtn = kitButton(t('studio.clearTankTrack'), 'danger');
  clearTrackBtn.addEventListener('click', () => {
    const actor = S._internal.selected;
    if (!actor) { flashBusy(t('studio.selectTankFirst')); return; }
    S.clearActorTrack(actor);
  });
  railRow.append(railBtn, clearTrackBtn);
  secTime.append(railRow);
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
  planBtn.dataset.pro = '';
  planView.root.dataset.pro = '';
  secTime.append(planBtn, planView.root);
  setControlsMode(proControls ? 'pro' : 'quick');
  const duelBtn = kitButton(t('studio.directDuel'), 'primary');
  duelBtn.classList.add('cot-c-btn--wide');
  let duelVariant = 0;
  duelBtn.dataset.tip = t('studio.directDuelTitle');
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
  resetFxBtn.hidden = true;
  resetFxBtn.addEventListener('click', () => S.clearEffects());
  secTime.append(duelBtn, resetFxBtn);
  globalGroup.body.appendChild(secTime);
  addButton('cinematics', t('studio.ws.addShot'), () => S.addCameraShot());

  // === CAMERA section ===
  const secCam = section('camera', t('studioPanel.section.camera'), 'optics');
  const camModeSeg = el('div', 'cot-c-seg');
  camModeSeg.setAttribute('role', 'radiogroup');
  wireRovingKeys(camModeSeg);
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
  roll.row.dataset.pro = '';
  spd.row.dataset.pro = '';
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
  // the export settings are a few each (five or fewer): the kit's segmented controls, every choice in view (the
  // interaction census: raw selects), each at the inspector's width on its own line (side by side, a 2 + 1 wrap beside a
  // three-line one gave the pair two heights and two tops: the s15 critic)
  const filmSizeRow = el('div', 'film-rows');
  const filmSize = labelledSegments(t('studio.film.size'),
    FILM_RESOLUTIONS.map((resolution) => [String(resolution), `${resolution}p`] as const), String(FILM_RESOLUTIONS[0]));
  // the choices are bare rates under their heading: "24 FPS" as a choice read to the datum census as a live frame-rate
  // figure outside its registered place (UI-LOCKDOWN C, s19)
  const filmFps = labelledSegments(t('studio.film.frameRate'), [24, 30, 60].map((fps) => [String(fps), String(fps)] as const), '30');
  filmSizeRow.append(filmSize.row, filmFps.row);
  secCap.appendChild(filmSizeRow);
  const filmBlurRow = el('div', 'film-rows');
  const filmBlur = labelledSegments(t('studio.film.blur'), ([['studio.film.blurOff', 1], ['studio.film.blurDraft', 4],
    ['studio.film.blurGood', 8], ['studio.film.blurBest', 16], ['studio.film.blurMaster', 32]] as const)
    .map(([key, samples]) => [String(samples), t(key)] as const), '8');
  const filmShake = labelledSegments(t('studio.film.shake'), ([['studio.film.shakeFull', 1], ['studio.film.shakeHalf', 0.5],
    ['studio.film.shakeQuarter', 0.25], ['studio.film.shakeOff', 0]] as const).map(([key, shake]) => [String(shake), t(key)] as const), '1');
  filmShake.seg.element.dataset.tip = t('studio.film.shakeTitle');
  filmBlurRow.append(filmBlur.row, filmShake.row);
  filmBlurRow.dataset.pro = '';
  secCap.appendChild(filmBlurRow);
  const filmSummary = el('div', 'recStatus filmSummary', '');
  secCap.appendChild(filmSummary);
  // the export settings run from the header's Export film, the workspace's one primary (the s13 critic: two accent
  // Export film buttons in view at once)
  // Authoring the export settings records them in the scene's `film` block.
  for (const control of [filmFps.seg, filmBlur.seg, filmShake.seg]) {
    control.onChange(() => {
      try {
        S.setFilm({ fps: Number(filmFps.seg.value), samples: Number(filmBlur.seg.value), shake: Number(filmShake.seg.value) });
      } catch { /* exporting */ }
      updateFilmSummary();
    });
  }
  filmSize.seg.onChange(() => updateFilmSummary());
  // Export veil: blocks the canvas and panel while frames render; live preview at the native aspect.
  const filmVeil = el('div', 'filmVeil');
  filmVeil.setAttribute('role', 'dialog');
  filmVeil.setAttribute('aria-modal', 'true');
  filmVeil.setAttribute('aria-label', t('studio.film.veilTitle'));
  // (UI-LOCKDOWN A) the frame's preview: a uiCanvas sized by its CSS box (the film's aspect, --fv-aspect), the latest
  // frame covering it (no bars) at min(DPR, 2)
  const veilSurface = createUiCanvas(null, 'fvPreview', {
    draw: (ctx, width, height, surface) => {
      ctx.clearRect(0, 0, width, height);
      if (surface.image) drawImageFit(ctx, surface.image, width, height, 'cover');
    },
  });
  const veilPreview = veilSurface.canvas;
  let veilAspect = 0;
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
    if (aspect !== veilAspect) { veilAspect = aspect; veilPreview.style.setProperty('--fv-aspect', String(aspect)); }
    veilSurface.setImage(canvas);
  }
  /** One film through the veil (Export film and the queue): resolves with its size; an AbortError when cancelled. */
  function renderFilm(options: { resolution: number; fps: number; samples: number; shake: number; name?: string },
    onProgress?: (fraction: number) => void): Promise<{ readonly bytes: number }> {
    filmVeil.classList.add('on');
    veilFill.style.width = '0%';
    veilText.textContent = t('studio.film.preparing');
    veilCancel.focus();
    const started = performance.now();
    let frames = 0;
    return S.exportFilm({
      ...options,
      download: true,
      onProgress: (progress) => {
        frames = progress.frames;
        showFilmProgress(progress);
        onProgress?.(progress.frames ? progress.frame / progress.frames : 0);
      },
      onFrame: drawFilmPreview,
    })
      .then((result) => {
        const size = filmOutputSize(S.productionFormat, options.resolution);
        recordRenderRate(performance.now() - started, frames, options.samples, size.width, size.height);
        return result;
      })
      .finally(() => { filmVeil.classList.remove('on'); api.refreshStoryboard(); });
  }
  const aborted = (error: RuntimeValue): boolean => error instanceof Error && error.name === 'AbortError';
  function startFilmExport(): void {
    if (S.filmExportStatus().active || S.recordingStatus().active || !S.filmExportStatus().supported) return;
    renderFilm({
      resolution: Number(filmSize.seg.value),
      fps: Number(filmFps.seg.value),
      samples: Number(filmBlur.seg.value),
      shake: Number(filmShake.seg.value),
    })
      .then((result) => flashBusy(t('studio.film.saved', { size: (result.bytes / 1048576).toFixed(1) })))
      .catch((error: RuntimeValue) => flashBusy(aborted(error)
        ? t('studio.film.cancelled')
        : t('studio.film.failed', { error: errorMessage(error) })));
  }
  let filmSignature = '';
  function updateFilmSummary(): void {
    const film = S.getFilm();
    const signature = film ? `${film.fps}/${film.samples}/${film.shake}` : '';
    if (signature !== filmSignature) {
      filmSignature = signature;
      if (film) {
        filmFps.seg.value = String(film.fps);
        if (filmBlur.seg.has(String(film.samples))) filmBlur.seg.value = String(film.samples);
        if (filmShake.seg.has(String(film.shake))) filmShake.seg.value = String(film.shake);
      }
    }
    const status = S.filmExportStatus();
    const busyOutput = status.active || S.recordingStatus().active;
    exportBtn.disabled = busyOutput || !status.supported;
    for (const control of [filmSize.seg, filmFps.seg, filmBlur.seg, filmShake.seg]) control.disabled = busyOutput;
    if (!status.supported) { filmSummary.textContent = t('studio.film.unsupported'); return; }
    try {
      const format = S.productionFormat;
      const { width, height } = filmOutputSize(format, Number(filmSize.seg.value));
      // the plan still checks the film (its error shows here); the summary names only the output's size, which nothing
      // else on the screen says (the s20 critic: its ratio, length and frames repeated the top bar, the timeline and the
      // viewport's frame count)
      createFilmPlan(normalizeFilm({ ...(film ?? {}), fps: Number(filmFps.seg.value), samples: Number(filmBlur.seg.value) }), 0, S.durationMs);
      filmSummary.textContent = t('studio.film.summary', { width, height });
    } catch (error) {
      filmSummary.textContent = errorMessage(error);
    }
  }
  // --- live recording, stills and the scene file ---------------------------------------------------------------
  const secLive = el('div', 'sec');
  secLive.dataset.pro = '';
  secLive.appendChild(sectionHead(t('studio.film.liveHeading'), 'cameraPath'));
  const fpsSel = labelledSegments(t('studio.ws.video'), [60, 30].map((fps) => [String(fps), t('studio.film.fpsBitrate', { fps, mbps: 12 })] as const), '60');
  const recordBtn = kitButton(t('studio.recordVideo'), undefined, 'cameraPath');
  recordBtn.classList.add('cot-c-btn--wide');
  recordBtn.setAttribute('aria-pressed', 'false');
  recordBtn.addEventListener('click', () => {
    if (S.recordingStatus().active) {
      S.stopRecording();
      return;
    }
    S.recordVideo({ fps: Number(fpsSel.seg.value), download: true })
      .then((result) => flashBusy(t('studio.videoSaved', { size: (result.size / 1048576).toFixed(1) })))
      .catch((error: RuntimeValue) => flashBusy(t('studio.recordFailed', { error: errorMessage(error) })));
    api.refreshStoryboard();
  });
  const recStatus = el('div', 'recStatus', t('studio.recordReady'));
  const capSel = labelledSegments(t('studio.ws.width'), [2560, 3200, 3840, 5120].map((w) => [String(w), `${w} px`] as const), '2560');
  const capBtn = kitButton(t('studio.capturePng'), undefined, 'toolPhoto');
  capBtn.classList.add('cot-c-btn--wide');
  capBtn.addEventListener('click', () => {
    S.capture({ width: parseInt(capSel.seg.value, 10), download: true });
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
  // the scene's link is the header's Copy scene link (one control, one style: the s13 critic read a capitals twin here)
  // localStorage slots: the kit's buttons, as Save, Load and Copy above them (a chip row stood 6 px shorter)
  const slotRow = el('div', 'grid3');
  for (let i = 1; i <= 3; i++) {
    const b = kitButton(t('studio.slot', { n: i }));
    b.dataset.tip = t('studio.slotTitle');
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
  secScene2.append(svRow, slotRow, fileIn);
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
      // its keys and pointer stay in it: an Esc closing it never also exits the Studio (the runtime listens on the window)
      for (const name of ['keydown', 'pointerdown', 'pointermove', 'pointerup', 'wheel']) {
        createdDialog.addEventListener(name, (event) => event.stopPropagation());
      }
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

  // --- the shelf (09-studio .shelf): the templates, the sequences then the filmed scenes, each staged by a press; the
  // browser (studioTemplateSheet.ts) holds every one, the tanks' own takes too (owner 2026-10-27) ---------------------
  const shelfHead = el('div', 'h');
  const shelfTitle = el('b', null, t('studio.director.ui.templates'));
  const shelfActs = el('div', 'acts');
  const archiveBtn = chipButton(t('studio.ws.allScenes'), 'media');
  archiveBtn.addEventListener('click', openArchive);
  shelfActs.append(archiveBtn);
  shelfHead.append(shelfTitle, shelfActs);
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
  // the J/K/L shuttle's rate beside the clock, only while it is not plain play or stop
  const shuttleBadge = el('span', 'rate');
  shuttleBadge.hidden = true;
  const duration = sliderRow(t('studioPanel.storyboard.lengthLabel'), 1, 20, 0.5, (v) => S.setStoryboardDuration(v * 1000));
  const ts = sliderRow(t('studioPanel.storyboard.speedLabel'), 0.25, 2, 0.05, (v) => S.setTimeScale(v));
  const transportRight = el('div', 'r');
  const keyBtn = chipButton(t('studio.keySelectedTank'), 'stamp');
  keyBtn.addEventListener('click', () => keyActorBtn.click());
  const shotBtn = chipButton(t('studio.addCameraShot'), 'toolPhoto');
  shotBtn.addEventListener('click', () => S.addCameraShot());
  ts.row.dataset.pro = '';
  transportRight.append(duration.row, ts.row, shotBtn, keyBtn);
  // the playhead reads in the frame chip alone (UI-LOCKDOWN G14)
  transport.append(restartBtn, pauseBtn, stepBtn, shuttleBadge);
  transport.appendChild(studioKeycap(t('studio.ws.spaceKey')));
  transport.append(transportRight);
  const lanes = el('div', 'st-lanes');
  lanes.appendChild(el('div', 'lb'));
  const ruler = el('div', 'tk tk--ruler');
  // the ruler's marks (ticks and m:ss labels on the playhead's travel), under the scrub that seeks through them
  const rulerMarks = el('div', 'tm');
  rulerMarks.setAttribute('aria-hidden', 'true');
  ruler.appendChild(rulerMarks);
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
  const rulerClock = (sec: number): string => {
    const minutes = Math.floor(sec / 60);
    const rest = sec - minutes * 60;
    return `${minutes}:${rest < 10 ? '0' : ''}${Number.isInteger(rest) ? rest : rest.toFixed(1)}`;
  };
  let rulerFor = '';
  // the ruler's width, from its own observer (never read in the frame loop): a narrow ruler takes fewer labels
  let rulerWidth = 0;
  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(([entry]) => { rulerWidth = entry?.contentRect.width ?? 0; drawRuler(); }).observe(rulerMarks);
  }
  /** A labelled tick every step (at most ten across the take, and one per RULER_LABEL_PX of the ruler) and a short one
   *  between; redrawn when the length or the ruler's width changes. */
  function drawRuler(): void {
    const key = `${S.durationMs}|${Math.round(rulerWidth)}`;
    if (key === rulerFor) return;
    rulerFor = key;
    const seconds = S.durationMs / 1000;
    const most = rulerWidth > 0 ? Math.max(2, Math.min(10, Math.floor(rulerWidth / RULER_LABEL_PX))) : 10;
    const step = [0.5, 1, 2, 5, 10, 15, 30, 60, 120].find((value) => seconds / value <= most) ?? 300;
    const marks: HTMLElement[] = [];
    for (let k = 0; k * step <= seconds + 1e-6; k++) {
      const at = k * step * 1000;
      const tick = el('i', 'mj');
      tick.style.left = pct(at);
      marks.push(tick);
      // the first label would sit under the playhead's thumb at rest, so its tick stands alone; every label stands to
      // the left of its tick, the scene's end included (it reads the length: the s13 critic read the bare end tick as a
      // label cut off; the s16 critic read an end label flipped to the other side as inconsistent); a label closer to
      // the end's than a label's width leaves its tick bare (the s15 critic: "0:10" over "0:12" on a phone)
      const end = at >= S.durationMs - step * 400;
      const crowdsEnd = !end && rulerWidth > 0 && ((S.durationMs - at) / Math.max(1, S.durationMs)) * rulerWidth < RULER_LABEL_PX;
      if (k > 0 && !crowdsEnd && (!end || at >= S.durationMs - 1)) {
        const label = el('b', end ? 'end' : null, rulerClock(k * step));
        label.style.left = pct(at);
        marks.push(label);
      }
      if (at + step * 500 < S.durationMs) {
        const minor = el('i');
        minor.style.left = pct(at + step * 500);
        marks.push(minor);
      }
    }
    rulerMarks.replaceChildren(...marks);
  }

  // --- the production panel: the Director, and the outliner's heads, the shelf, the toggle and the frame ------------
  const productionPanel = mountStudioProductionPanel(S, root, dock, () => api.refreshAll(), {
    head(id, button) {
      const glyph = OUTLINE.find(([outlineId]) => outlineId === id)?.[1] ?? 'studio';
      const label = button.textContent ?? '';
      workspaceNames.set(id, label);
      button.innerHTML = uiIconSVG(glyph, 15);
      button.append(el('span', 'nm', label));
      outlineHeads.set(id, button);
      const row = outlineGroups.get(id)?.querySelector('.gh');
      row?.prepend(button);
    },
    takes: shelf,
    browse: shelfActs,
    toggle: headRight,
    guides: vp,
    notice: (text, tone, detail) => api.notice(text, tone, detail),
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
  // The canvas moves into the cell hidden (data-studio-settling) and shows once the grid has settled, so its move from the
  // full window is no layout shift (248: CLS 0.164 on a cold /studio); the build's plate covers the cell meanwhile.
  let settleCap = 0;
  const settled = (): void => {
    clearTimeout(settleCap);
    delete document.body.dataset.studioSettling;
  };
  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(() => {
      if (root.style.display !== 'block') return;
      cancelAnimationFrame(viewportFrame);
      viewportFrame = requestAnimationFrame(() => {
        syncViewport();
        if ('studioSettling' in document.body.dataset) requestAnimationFrame(settled);
      });
    }).observe(vp);
  }

  // --- the render queue (brand-ui SPEC 12.6; studioQueue.ts): deliveries in the scene's frame, one after another ---------
  interface QueueJob {
    readonly preset: QueuePreset;
    readonly label: string;
    readonly estimate: { readonly seconds: number; readonly bytes: number; readonly files: number };
    state: 'waiting' | 'running' | 'done' | 'failed' | 'cancelled';
    progress: number;
  }
  const queueJobs: QueueJob[] = [];
  let queueRunning = false;
  const queuePop = el('div', 'st-queue');
  queuePop.hidden = true;
  queuePop.setAttribute('role', 'dialog');
  const queuePresets = el('div', 'qp');
  const queueList = el('div', 'ql');
  const queueEmpty = el('p', 'qe', t('studio.ws.queue.empty'));
  const queueFoot = el('div', 'qf');
  const queueStart = kitButton(t('studio.ws.queue.start'), 'primary');
  queueStart.addEventListener('click', () => { void runQueue(); });
  const queueClear = kitButton(t('studio.ws.queue.clear'), 'ghost');
  queueClear.addEventListener('click', () => {
    for (let i = queueJobs.length - 1; i >= 0; i--) if (queueJobs[i].state !== 'waiting' && queueJobs[i].state !== 'running') queueJobs.splice(i, 1);
    refreshQueue();
  });
  queueFoot.append(queueClear, queueStart);
  queueFoot.hidden = true;
  const queueHead = el('h3', 'qh', t('studio.ws.queueTitle'));
  queueHead.id = 'st-queue-title';
  queuePop.setAttribute('aria-labelledby', queueHead.id);
  // the queue's state (its jobs, or that it is empty) under its name, the deliveries to add after it: a phone's short
  // popover cut the state off below the presets
  queuePop.append(queueHead, queueList, queueEmpty, queuePresets, queueFoot);
  head.appendChild(queuePop);
  const queueSurface: TransientSurface = {
    id: 'studio-queue',
    element: () => queuePop,
    owns: (node) => queueBtn.contains(node),
    close: (reason) => { toggleQueue(false); if (reason === 'escape') queueBtn.focus(); },
  };
  const presetName = (preset: QueuePreset): string => t(`studio.ws.queue.preset.${preset.id}`);
  /** "about 1.4 min · about 22 MB" in the page's language. */
  function costText(estimate: QueueJob['estimate']): string {
    const time = estimate.seconds < 90 ? t('studio.ws.queue.seconds', { n: Math.max(1, Math.round(estimate.seconds)) })
      : t('studio.ws.queue.minutes', { n: (estimate.seconds / 60).toFixed(1) });
    const megabytes = estimate.bytes / 1e6;
    return t('studio.ws.queue.estimate', { time, size: t('studio.ws.queue.megabytes', { n: megabytes < 10 ? megabytes.toFixed(1) : Math.round(megabytes) }) });
  }
  function estimateFor(preset: QueuePreset): QueueJob['estimate'] {
    return queueEstimate(preset, S.productionFormat, S.durationMs, Number(filmBlur.seg.value), shotRuns(S.getStoryboard().shots, S.durationMs).length);
  }
  function toggleQueue(open = queuePop.hidden): void {
    if (open) openSurface(queueSurface, queueBtn); else closeSurface(queueSurface);
    queuePop.hidden = !open;
    queueBtn.setAttribute('aria-expanded', String(open));
    // the popover opens under its button (a phone opens it from the palette, its button hidden: the stylesheet places it)
    if (open && queueBtn.offsetParent) {
      queuePop.style.right = `${Math.max(8, Math.round(head.getBoundingClientRect().right - queueBtn.getBoundingClientRect().right))}px`;
    }
    if (open) refreshQueue();
  }
  function refreshQueue(): void {
    const pending = queueJobs.filter((job) => job.state === 'waiting' || job.state === 'running').length;
    setLabel(queueBtn, pending ? t('studio.ws.queueCount', { count: pending }) : t('studio.ws.queue'));
    if (queuePop.hidden) return;
    const shots = S.getStoryboard().shots.length;
    queuePresets.replaceChildren(...QUEUE_PRESETS.map((preset) => {
      const row = el('div', 'qr');
      const name = el('span', 'qn', presetName(preset));
      const cost = el('span', 'qc', costText(estimateFor(preset)));
      const add = chipButton(t('studio.ws.queue.add'), null);
      add.insertAdjacentHTML('afterbegin', STUDIO_GLYPHS.plus);
      add.disabled = preset.id === 'stills-shots' && !shots;
      add.addEventListener('click', () => {
        queueJobs.push({ preset, label: presetName(preset), estimate: estimateFor(preset), state: 'waiting', progress: 0 });
        refreshQueue();
      });
      row.append(name, cost, add);
      return row;
    }));
    queueList.replaceChildren(...queueJobs.map((job, index) => {
      const row = el('div', `qr qr--${job.state}`);
      const status = job.state === 'running' ? `${Math.round(job.progress * 100)}%`
        : job.state === 'waiting' ? costText(job.estimate) : t(`studio.ws.queue.state.${job.state}`);
      row.append(el('span', 'qn', job.label), el('span', 'qc', status));
      if (job.state === 'waiting') {
        const remove = el('button', 'x');
        remove.type = 'button';
        remove.innerHTML = uiIconSVG('close', 14);
        remove.setAttribute('aria-label', t('studio.ws.queue.remove', { name: job.label }));
        remove.addEventListener('click', () => { queueJobs.splice(index, 1); refreshQueue(); });
        row.appendChild(remove);
      }
      return row;
    }));
    queueEmpty.hidden = queueJobs.length > 0;
    const busy = queueRunning || S.filmExportStatus().active || S.recordingStatus().active;
    queueStart.disabled = busy || !queueJobs.some((job) => job.state === 'waiting');
    queueClear.disabled = !queueJobs.some((job) => job.state !== 'waiting' && job.state !== 'running');
    // an empty queue shows no actions at all (the kit's disabled ink still read as live beside "Nothing queued")
    queueFoot.hidden = !queueJobs.length;
  }
  const nextFrame = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => resolve()));
  /** Run every waiting job in turn; a cancelled film stops the queue there, a failed job moves on. */
  async function runQueue(): Promise<void> {
    if (queueRunning) return;
    queueRunning = true;
    let files = 0;
    refreshQueue();
    try {
      for (const job of queueJobs) {
        if (job.state !== 'waiting') continue;
        job.state = 'running';
        job.progress = 0;
        refreshQueue();
        try {
          files += await runJob(job);
          job.state = 'done';
        } catch (error) {
          job.state = aborted(error) ? 'cancelled' : 'failed';
          if (job.state === 'failed') console.error('[studio] queued render failed', error);
        }
        refreshQueue();
        if (job.state === 'cancelled') break;
      }
    } finally {
      queueRunning = false;
      refreshQueue();
      if (files) api.notice(t('studio.ws.queue.done', { count: files }), 'info');
    }
  }
  async function runJob(job: QueueJob): Promise<number> {
    const map = S.mapId ?? 'studio';
    const ratio = formatRatio(S.productionFormat);
    const report = (fraction: number): void => { job.progress = fraction; refreshQueue(); };
    if (job.preset.kind === 'film') {
      await renderFilm({
        resolution: job.preset.resolution, fps: job.preset.fps,
        samples: Number(filmBlur.seg.value), shake: Number(filmShake.seg.value),
        name: queueFileName(map, `${job.preset.resolution}p${job.preset.fps}`, ratio, '').replace(/\.$/, ''),
      }, report);
      return 1;
    }
    const { width, height } = stillSize(S.productionFormat);
    if (job.preset.id === 'still-now') {
      S.capture({ width, height, download: true, name: queueFileName(map, `still-${(S.fxTimeMs / 1000).toFixed(2)}s`, ratio, 'png') });
      return 1;
    }
    // a still at every shot: the lens on each key in turn, then the playhead and shot back where they were
    const runs = shotRuns(S.getStoryboard().shots, S.durationMs);
    const playhead = S.fxTimeMs, shotBefore = S.selectedShotId;
    let made = 0;
    for (const [index, { first: shot }] of runs.entries()) {
      S.selectCameraShot(shot.id);
      await nextFrame();
      S.capture({ width, height, download: true,
        name: queueFileName(map, `shot-${String(index + 1).padStart(2, '0')}-${shotLabel(shot.label)}`, ratio, 'png') });
      made++;
      report(made / runs.length);
    }
    if (shotBefore) S.selectCameraShot(shotBefore);
    S.seek(playhead);
    return made;
  }

  // --- the command palette (Ctrl/Cmd+K): every action, run through the control that does it -------------------------
  const commandPalette = createCommandPalette(studioCommands);
  root.appendChild(commandPalette.root);
  function studioCommands(): StudioCommand[] {
    const list: StudioCommand[] = [];
    const add = (id: string, label: string, run: () => void, extra: Omit<Partial<StudioCommand>, 'id' | 'label' | 'run'> = {}): void => {
      list.push({ id, label, run, ...extra });
    };
    const via = (button: HTMLButtonElement) => () => { if (!button.disabled) button.click(); };
    const text = (node: Element): string => node.textContent?.trim() ?? '';
    const selected = S._internal.selected;
    add('play', S.playing ? t('studio.pause') : t('studio.play'), via(pauseBtn), { hint: t('studio.ws.spaceKey'), keywords: 'play pause' });
    add('restart', t('studio.restart'), via(restartBtn), { keywords: 'restart beginning' });
    add('step', t('studio.stepOneFrame'), via(stepBtn), { keywords: 'step frame next' });
    if (!undoBtn.disabled) add('undo', t('studio.ws.cmd.undo'), via(undoBtn), { hint: UNDO_KEY, keywords: 'undo' });
    if (!redoBtn.disabled) add('redo', t('studio.ws.cmd.redo'), via(redoBtn), { hint: `Shift ${UNDO_KEY}`, keywords: 'redo' });
    if (!restoreBtn.hidden) add('restore', t('studio.ws.restore'), via(restoreBtn), { keywords: 'restore autosave last scene' });
    add('shot', t('studio.addCameraShot'), via(shotBtn), { keywords: 'add camera shot key' });
    if (!keyBtn.disabled) add('key', t('studio.keySelectedTank'), via(keyBtn), { keywords: 'key selected tank keyframe' });
    if (!lookChip.disabled) add('look', t('studio.ws.lookThrough'), via(lookChip), { keywords: 'look through camera view shot' });
    add('guides', t('studio.ws.guides'), via(guidesChip), { keywords: 'guides thirds safe frame' });
    if (selected) {
      for (const option of poses.querySelectorAll<HTMLButtonElement>('[data-pose]')) {
        add(`pose-${option.dataset.pose}`, t('studio.ws.cmd.pose', { name: text(option) }), via(option), { keywords: `pose ${option.dataset.pose}` });
      }
      add('remove', t('studio.ws.cmd.remove', { name: selected.spec.name }), () => { S.removeActor(selected); }, { hint: 'Del', keywords: 'remove delete tank' });
    }
    for (const [id, button] of outlineHeads) {
      add(`go-${id}`, t('studio.ws.cmd.workspace', { name: workspaceNames.get(id) ?? text(button) }), via(button), { keywords: `go workspace ${id}` });
    }
    for (const option of formatButtons) {
      add(`frame-${option.dataset.value}`, t('studio.ws.cmd.frame', { ratio: text(option) }), via(option), { keywords: `frame format aspect ${option.dataset.value}` });
    }
    for (const option of modeButtons) {
      add(`controls-${option.dataset.value}`, t('studio.ws.cmd.controls', { name: text(option) }), via(option), { keywords: `controls ${option.dataset.value}` });
    }
    for (const option of snapButtons) {
      add(`snap-${option.dataset.value}`, t('studio.ws.cmd.snap', { name: text(option) }), via(option), { keywords: `snap ${option.dataset.value}` });
    }
    if (!timeBusy && !S.recordingStatus().active) {
      for (const time of timesOpen) add(`time-${time}`, t('studio.ws.cmd.time', { name: t(`atmosphere.${time}`) }), () => chooseTime(time), { keywords: `light time ${time}` });
    }
    for (const preset of PRODUCTION_PRESETS) {
      add(`stage-${preset.id}`, t('studio.ws.cmd.stage', { name: presetText(preset.id, 'title', preset.title) }), () => {
        S.directProduction({ presetId: preset.id, format: S.productionFormat })
          .then(() => api.refreshAll())
          .catch((error: RuntimeValue) => api.notice(errorMessage(error), 'error'));
      }, { searchOnly: true, keywords: `stage sequence template director ${preset.id}` });
    }
    add('templates', t('studio.director.ui.templates'), () => productionPanel.openTemplates(),
      { keywords: 'templates presets sequences takes scenes browse library' });
    add('export', t('studio.ws.exportFilm'), via(exportBtn), { keywords: 'export film render video' });
    add('link', t('studio.sceneLink.copyButton'), via(linkBtn), { keywords: 'copy scene link share' });
    add('queue', t('studio.ws.queueTitle'), () => toggleQueue(true), { keywords: 'render queue deliveries stills' });
    add('gallery', t('studioPanel.tankGallery'), via(galleryBtn), { keywords: 'tank gallery' });
    add('exit', t('studio.ws.exit'), via(exitBtn), { hint: 'F8', keywords: 'exit close garage' });
    // named only: the battlefields and the fleet
    for (const id of S.MAP_IDS) {
      add(`map-${id}`, t('studio.ws.cmd.map', { name: S.getMapInfo(id).name }), () => chooseMap(id), { searchOnly: true, keywords: `battlefield map ${id}` });
    }
    for (const id of S.TANK_IDS) {
      add(`tank-${id}`, t('studio.ws.cmd.addTank', { name: specInfo(id).name }), () => { setPicked(id); addAtMarker.click(); },
        { searchOnly: true, keywords: `add tank ${id}` });
    }
    return list;
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
  function sectionHead(title: string, glyph: IconId, id?: StudioSectionId): HTMLDivElement {
    const h = el('div', 'sh');
    h.innerHTML = uiIconSVG(glyph, 16);
    h.append(title);
    // the scene file's own panel: the complete JSON that __STUDIO.load() takes
    if (id === 'output') h.appendChild(createInfoButton({
      label: t('studioPanel.info.about', { title }),
      title,
      text: t('studioPanel.info.section.output'),
      json: () => S.state(),
      guide: 'output',
    }));
    return h;
  }
  function section(id: StudioSectionId, title: string, glyph: IconId): HTMLDivElement {
    const s = el('div', 'sec');
    s.appendChild(sectionHead(title, glyph, id));
    return s;
  }
  /** One workspace's controls in the inspector; the production panel shows one group at a time. */
  function panelGroup(index: string, id: StudioGroupId, title: string): PanelGroup {
    const groupRoot = el('section', 'pgroup');
    groupRoot.dataset.group = id;
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
      name.dataset.tip = label; // the range input carries the name
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
  /** A labelled choice of a few: the kit's segmented control in this panel's idiom (wireRovingKeys), its value read and
   *  set as the select it replaced was. */
  function labelledSegments(label: string, choices: readonly (readonly [string, string])[], value: string): { row: HTMLElement; seg: Segments } {
    const row = el('div', 'production-lens');
    const group = el('div', 'cot-c-seg');
    group.setAttribute('role', 'radiogroup');
    group.setAttribute('aria-label', label);
    wireRovingKeys(group);
    let current = value;
    const listeners: (() => void)[] = [];
    const buttons = choices.map(([choice, text]) => {
      const option = el('button', 'cot-c-seg__opt', text);
      option.type = 'button';
      option.setAttribute('role', 'radio');
      option.dataset.value = choice;
      option.addEventListener('click', () => {
        if (choice === current) return;
        seg.value = choice;
        for (const listener of listeners) listener();
      });
      group.appendChild(option);
      return option;
    });
    const seg: Segments = {
      get value() { return current; },
      set value(next: string) {
        current = next;
        for (const option of buttons) {
          option.setAttribute('aria-checked', String(option.dataset.value === next));
          option.tabIndex = option.dataset.value === next ? 0 : -1;
        }
      },
      get disabled() { return buttons.some((option) => option.disabled); },
      set disabled(off: boolean) { for (const option of buttons) option.disabled = off; },
      element: group,
      has: (next) => choices.some(([choice]) => choice === next),
      onChange: (listener) => { listeners.push(listener); },
    };
    seg.value = value;
    row.append(el('span', null, label), group);
    return { row, seg };
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
    // nothing to clear shows no clear (the kit's disabled ink still read as live beside the empty list)
    clearStackBtn.hidden = resetFxBtn.hidden = !effects.length;
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
      time.dataset.tip = t('studioPanel.effects.timeTitle');
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
      del.setAttribute('aria-label', t('studioPanel.effects.deleteTitle', { type: effectName(effect.type) }));
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

  /** A shot's thumbnail slots: its outliner row and its camera clip (setShotThumbnail fills them in place). */
  const shotThumbSlots = new Map<string, { img: HTMLImageElement; glyph: Element | null }[]>();
  /** A shot's thumbnail, in place of its glyph until the lens has sat on the shot (studio.ts grabShotThumbnail). */
  function shotThumb(id: string, glyph: Element | null): HTMLImageElement {
    const img = el('img', 'th');
    img.alt = '';
    img.decoding = 'async';
    img.draggable = false;
    const url = S.shotThumbnail(id);
    if (url) {
      img.src = url;
      glyph?.setAttribute('hidden', '');
    } else img.hidden = true;
    const slots = shotThumbSlots.get(id) ?? [];
    slots.push({ img, glyph });
    shotThumbSlots.set(id, slots);
    return img;
  }

  function rebuildStoryboard() {
    const board = S.getStoryboard();
    drawRuler();
    laneHost.textContent = '';
    shotThumbSlots.clear();
    shotboard.querySelectorAll<InfoButton>('.cot-info-trigger')
      .forEach((button) => button.disposeInfo?.());
    shotboard.textContent = '';
    shotRows.textContent = '';
    const runs = shotRuns(board.shots, S.durationMs);
    outlineCount('cinematics', runs.length);
    // the camera lane (09-studio .tl Camera): one clip per shot, from its first key to the next shot's, its thumbnail
    // beside its name and a tick at each later key of the shot
    const cameraLane = timelineLane(t('studio.ws.laneCamera'), 'toolPhoto');
    for (const run of runs) {
      const shot = run.first;
      const name = shotLabel(shot.label);
      const clip = el('button', 'clip');
      clip.append(shotThumb(shot.id, null), el('span', 'cl', name));
      clip.type = 'button';
      clip.style.left = pct(run.startMs);
      clip.style.width = `calc(${pct(Math.max(0, run.endMs - run.startMs))} - 3px)`;
      clip.setAttribute('aria-pressed', String(run.keys.some((key) => key.id === S.selectedShotId)));
      clip.dataset.tip = t('studioPanel.shot.timelineMarkerTitle', { label: name, t: (shot.tMs / 1000).toFixed(2) });
      clip.addEventListener('click', (event) => { event.stopPropagation(); S.selectCameraShot(shot.id); });
      for (const key of run.keys.slice(1)) {
        const tick = el('i', 'ck');
        tick.style.left = `${((key.tMs - run.startMs) / Math.max(1, run.endMs - run.startMs)) * 100}%`;
        clip.appendChild(tick);
      }
      cameraLane.appendChild(clip);
      // its outliner row (09-studio .out Shots): the thumbnail, the name and the shot's length
      const line = outlineRow(() => { productionPanel.activate('cinematics'); S.selectCameraShot(shot.id); });
      line.row.setAttribute('aria-current', String(run.keys.some((key) => key.id === S.selectedShotId)));
      line.pick.innerHTML = uiIconSVG('toolPhoto', 16);
      line.pick.append(shotThumb(shot.id, line.pick.firstElementChild), el('span', 'nm', name),
        el('span', 'd', seconds(Math.max(0, run.endMs - run.startMs))));
      shotRows.appendChild(line.row);
    }
    // the storyboard's cards: one per shot, as the outliner and the camera lane count them; its blend is how the shot
    // begins (its first key's), and removing it removes every key it holds
    runs.forEach((run, index) => {
      const shot = run.first;
      const selected = run.keys.some((key) => key.id === S.selectedShotId);
      const name = shotLabel(shot.label);
      const card = el('div', `shotcard${selected ? ' sel' : ''}`);
      card.appendChild(el('div', 'num', String(index + 1).padStart(2, '0')));
      const copy = el('div', 'copy');
      copy.append(
        el('div', 'name', name),
        el('div', 'time', `${seconds(shot.tMs)} · ${Math.round(shot.fov)}°`),
      );
      copy.addEventListener('click', () => S.selectCameraShot(shot.id));
      card.appendChild(copy);
      // how the shot begins: five blends, every one in view on the kit's segmented control under the shot's name (a raw
      // select in the census)
      const transition = el('div', 'cot-c-seg shot-blend');
      transition.setAttribute('role', 'radiogroup');
      transition.setAttribute('aria-label', t('studioPanel.shot.transitionAria', { label: name }));
      wireRovingKeys(transition);
      for (const id of SHOT_TRANSITIONS) {
        const option = el('button', 'cot-c-seg__opt', t(`studio.ws.transition.${id}`));
        option.type = 'button';
        option.setAttribute('role', 'radio');
        option.dataset.value = id;
        option.setAttribute('aria-checked', String(id === shot.transition));
        option.tabIndex = id === shot.transition ? 0 : -1;
        option.addEventListener('click', () => { if (id !== shot.transition) S.updateCameraShot(shot.id, { transition: id }); });
        transition.appendChild(option);
      }
      card.appendChild(transition);
      card.appendChild(createInfoButton({
        label: t('studioPanel.shot.showJsonLabel', { label: name }),
        title: t('studioPanel.shot.replicateTitle', { label: name }),
        json: () => ({ ...S.state(), fxTime: shot.tMs, timeScale: 0 }),
        guide: 'recipe',
      }));
      const del = el('button', 'x');
      del.type = 'button';
      del.innerHTML = uiIconSVG('close', 14);
      del.setAttribute('aria-label', t('studioPanel.shot.removeTitle', { label: name }));
      del.addEventListener('click', () => { for (const key of run.keys) S.removeCameraShot(key.id); });
      card.appendChild(del);
      shotboard.appendChild(card);
    });
    // a lane per tank with keys: its flag, silhouette and name, a diamond per pose key
    for (const track of board.actorTracks) {
      const actor = S._internal.actors.find((entry) => entry.uid === track.actor || entry.name === track.actor);
      const lane = timelineLane(actor?.spec.name ?? track.actor, actor ? identity(actor.spec.id) : 'vehicle');
      for (const key of track.keys) {
        const mark = el('button', 'key');
        mark.type = 'button';
        // a key at either end stays whole inside its lane, clear of the lane's name
        mark.style.left = `clamp(6px, ${pct(key.tMs)}, calc(100% - 6px))`;
        const title = t('studio.ws.keyTitle', { actor: actor?.spec.name ?? track.actor, s: (key.tMs / 1000).toFixed(2) });
        mark.setAttribute('aria-label', title);
        mark.addEventListener('click', (event) => { event.stopPropagation(); S.seek(key.tMs); });
        lane.appendChild(mark);
      }
    }
    // the effects lane: a chip per moment, as wide as its name up to the next moment (where its name ellipsizes);
    // effects that fire together share one ("Dust burst ×2", "Dust burst +1")
    const effectLane = timelineLane(t('studio.ws.laneEffects'), 'detonation');
    const together = Math.max(40, S.durationMs * 0.004);
    const moments: StudioEffect[][] = [];
    for (const effect of [...S.listEffects()].sort((a, b) => a.tMs - b.tMs)) {
      const moment = moments[moments.length - 1];
      if (moment && effect.tMs - moment[0].tMs <= together) moment.push(effect);
      else moments.push([effect]);
    }
    moments.forEach((moment, index) => {
      const first = moment[0];
      const next = moments[index + 1]?.[0].tMs ?? S.durationMs;
      const name = effectName(first.type);
      const label = moment.length < 2 ? name : moment.every((effect) => effect.type === first.type)
        ? t('studio.ws.fxMany', { name, count: moment.length }) : t('studio.ws.fxPlus', { name, count: moment.length - 1 });
      const clip = el('button', 'clip clip--fx');
      clip.appendChild(el('span', 'cl', label));
      clip.type = 'button';
      clip.style.left = pct(first.tMs);
      clip.style.maxWidth = `calc(${pct(Math.max(0, next - first.tMs))} - 3px)`;
      clip.setAttribute('aria-pressed', String(moment.some((effect) => !!effect.selected)));
      clip.dataset.tip = moment.map((effect) => t('studio.ws.fxTitle', { type: effectName(effect.type), s: (effect.tMs / 1000).toFixed(2) })).join('\n');
      clip.addEventListener('click', (event) => { event.stopPropagation(); S.selectEffect(first.id); S.seek(first.tMs); });
      effectLane.appendChild(clip);
    });
    // the sound lane (09-studio .tl Sound): the film's soundtrack as it will mix, redrawn once the scene settles
    const soundLane = timelineLane(t('studio.ws.laneSound'), 'sound');
    soundLane.classList.add('tk--sound');
    soundLane.appendChild(soundWave);
    scheduleSound();
  }

  // the sound lane's waveform: one element kept across the timeline's rebuilds, redrawn when the scene changes
  const SOUND_BUCKETS = 400;
  const soundWave = document.createElementNS(SVG_NS, 'svg');
  soundWave.setAttribute('viewBox', `0 0 ${SOUND_BUCKETS} 20`);
  soundWave.setAttribute('preserveAspectRatio', 'none');
  soundWave.setAttribute('aria-hidden', 'true');
  const soundPath = document.createElementNS(SVG_NS, 'path');
  soundWave.appendChild(soundPath);
  let soundKey = '';
  let soundTimer: ReturnType<typeof setTimeout> | 0 = 0;
  /** What the soundtrack depends on: the effects, the take's length, the shots (the listener) and the tanks. */
  function soundSignature(): string {
    return JSON.stringify([S.mapId, S.durationMs, S.listEffects().map((effect) => [effect.id, effect.type, effect.tMs, effect.actor ?? null, effect.params ?? null]),
      // the shots place the listener (the panel's shot type leaves the camera out; the storyboard carries it)
      (S.getStoryboard().shots as ReadonlyArray<StudioCameraShot & { readonly pos?: readonly number[]; readonly lookAt?: readonly number[] }>)
        .map((shot) => [shot.tMs, shot.pos ?? null, shot.lookAt ?? null, shot.transition]),
      S._internal.actors.map((actor) => [actor.uid, actor.spec.id, actor.pose.x, actor.pose.z, actor.pose.facingDeg, actor.pose.turretDeg, actor.pose.gunDeg])]);
  }
  function scheduleSound(): void {
    const key = soundSignature();
    if (key === soundKey) return;
    soundKey = key;
    soundWave.classList.add('stale');
    if (soundTimer) clearTimeout(soundTimer);
    soundTimer = setTimeout(drawSound, 1500);
  }
  async function drawSound(): Promise<void> {
    soundTimer = 0;
    const key = soundKey;
    const result = root.style.display === 'block' ? await S.soundPreview(SOUND_BUCKETS).catch(() => null) : null;
    if (!result) { soundTimer = setTimeout(drawSound, 1500); return; } // busy or playing: again once it settles
    if (key !== soundKey) return; // the scene moved on while it mixed; its own redraw is queued
    let peak = 0;
    for (const value of result.peaks) peak = Math.max(peak, value);
    let d = '';
    for (let i = 0; i < result.peaks.length; i++) {
      const half = (peak > 0 ? (result.peaks[i] / peak) * 9.4 : 0) + 0.3;
      d += `M${i + 0.5} ${(10 - half).toFixed(2)}V${(10 + half).toFixed(2)}`;
    }
    soundPath.setAttribute('d', d);
    soundWave.classList.remove('stale');
  }

  // --- the playhead, every frame (261): the scrub, the lanes' playhead and the frame readout follow the clock as it
  // moves (they stepped four times a second while a take played), and an unchanged clock writes nothing ------------
  let playheadMs = NaN, playheadDuration = NaN, readout = '';
  function syncPlayhead(): void {
    const ms = S.fxTimeMs, duration = S.durationMs;
    if (ms !== playheadMs || duration !== playheadDuration) {
      playheadMs = ms;
      playheadDuration = duration;
      const at = Math.max(0, Math.min(1, ms / Math.max(1, duration)));
      scrub.max = String(duration);
      if (document.activeElement !== scrub) scrub.value = String(ms);
      scrub.style.setProperty('--fill', `${at * 100}%`);
      playhead.style.setProperty('--t', String(at));
    }
    // the frame readout (09-studio .fc): the frame at 30 fps; Pro adds the camera's place and aim (Quick reads no raw
    // coordinates, which read as a debug overlay)
    const frames = Math.round(duration / 1000 * 30);
    const frame = Math.min(frames, Math.round(ms / 1000 * 30));
    const camera = proControls ? S.getCamera() : null;
    const place = camera ? `${camera.pos.map((v) => v.toFixed(1)).join(', ')} · ${camera.yawDeg.toFixed(0)}° / ${camera.pitchDeg.toFixed(0)}°` : '';
    const text = `${frame}/${frames}/${place}`;
    if (text === readout) return;
    readout = text;
    frameCounter.replaceChildren(el('b', null, t('studio.ws.frame', { frame, frames })), ...(place ? [el('span', 'co', place)] : []));
  }

  // --- public panel API -------------------------------------------------------
  let refreshAcc = 0, planAcc = 0;
  const api: StudioPanelRuntime = {
    root,
    show() {
      document.body.dataset.studioSettling = '';
      settleCap = window.setTimeout(settled, 600); // a grid that never resizes still shows its canvas
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
    setStage(stage) {
      // everything waits but the way out: Exit stays live through the build, and its press abandons the entry (studio.ts
      // doExit; the loading census 262: the whole app went inert, Exit included)
      const waiting = !!stage;
      for (const part of app.children) if (part !== head) (part as HTMLElement).inert = waiting;
      for (const part of head.children) if (part !== headRight) (part as HTMLElement).inert = waiting;
      for (const part of headRight.children) if (part !== exitBtn) (part as HTMLElement).inert = waiting;
      app.toggleAttribute('aria-busy', waiting);
      if (!stage) {
        stagePlate.hidden = true;
        return;
      }
      const src = `/maps/cards/${stage.mapId}.webp`;
      if (stageArt.getAttribute('src') !== src) stageArt.src = src;
      stageName.textContent = stage.name;
      stageLabel.textContent = '';
      stageFill.style.transform = 'scaleX(0)';
      stagePlate.hidden = false;
    },
    setStageProgress(fraction, label) {
      stageFill.style.transform = `scaleX(${Math.max(0, Math.min(1, fraction)).toFixed(3)})`;
      if (label) stageLabel.textContent = label;
    },
    notice(text, tone = 'info', detail = '') {
      notify({ id: 'studio-notice', region: 'studio', severity: tone, text, detail: detail || undefined });
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
      drawSelection();
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
        del.addEventListener('click', (e) => { e.stopPropagation(); S.removeActor(a); });
        line.row.append(trail, del);
        actorRows.appendChild(line.row);
      });
      api.refreshSelected();
      if (planShown) planView.refreshPlan();
    },
    refreshSelected() {
      scheduleSound();
      const a = S._internal.selected;
      secSel.hidden = !a;
      selEmpty.hidden = !!a;
      if (!a) return;
      // the hero card (09-studio .insp .hero-icon): the live card's layers over the silhouette, the name at its foot
      if (hero.dataset.spec !== a.spec.id) {
        hero.dataset.spec = a.spec.id;
        hero.querySelector('.hc-host')?.remove();
        heroSil.style.setProperty('--sil', `url(${iconUrl(a.spec.id, 'side_silhouette')})`);
        for (const sil of poseSils) sil.style.setProperty('--sil', `url(${iconUrl(a.spec.id, 'side_silhouette')})`);
        const specId = a.spec.id;
        void Promise.all([import('./heroCard.ts'), import('./heroCard.css')])
          .then(([cards]) => (hero.dataset.spec === specId
            ? cards.decorateHeroTile(hero, specId, { tankSizes: '340px', flagSizes: '340px', priority: true }) : false))
          .catch(() => false);
      }
      gun.setRange(-(a.spec.gunDepressionDeg ?? 10), a.spec.gunElevationDeg ?? 20);
      facing.set(a.pose.facingDeg);
      turret.set(a.pose.turretDeg);
      gun.set(a.pose.gunDeg);
      if (document.activeElement !== px.input) px.input.value = String(Math.round(a.pose.x * 10) / 10);
      if (document.activeElement !== pz.input) pz.input.value = String(Math.round(a.pose.z * 10) / 10);
      if (document.activeElement !== heading.input) heading.input.value = String(Math.round(a.pose.facingDeg));
      camoPicker.setTank(a.spec.id, specInfo(a.spec.id).nation ?? null, a.camo || '');
      inheritBtn.hidden = !a.camo;
      stateMenu.setValue(a.stateName);
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
      flyBtn.tabIndex = c.mode === 'fly' ? 0 : -1;
      orbBtn.tabIndex = c.mode === 'orbit' ? 0 : -1;
      press(lookChip, S.lookThrough && !lookChip.disabled);
    },
    refreshTime() {
      productionPanel.refresh();
      refreshFormat();
      const scale = S.timeScale;
      if (scale > 0 && Number(ts.input.value) !== scale) ts.set(scale);
      const playing = scale !== 0;
      const pauseLabel = playing ? t('studio.pause') : t('studio.play');
      const rate = S.shuttleRate;
      const rateText = rate === 0 || rate === 1 ? '' : `${rate < 0 ? '−' : ''}${Math.abs(rate)}×`;
      if (shuttleBadge.textContent !== rateText) {
        shuttleBadge.textContent = rateText;
        shuttleBadge.hidden = !rateText;
      }
      if (pauseBtn.getAttribute('aria-label') !== pauseLabel) {
        pauseBtn.setAttribute('aria-label', pauseLabel);
        pauseBtn.dataset.tip = t('studio.ws.playTitle', { action: pauseLabel });
        if (playing) pauseBtn.innerHTML = STUDIO_GLYPHS.pause;
        else pauseBtn.innerHTML = uiIconSVG('play', 16);
      }
      const seconds = S.durationMs / 1000;
      if (Number(duration.input.value) !== seconds) duration.set(seconds);
      syncPlayhead();
      if (planShown && !S.playing) planView.refreshTime();
      const rec = S.recordingStatus();
      setLabel(recordBtn, rec.active ? t('studio.stopRecording') : t('studio.recordVideo'));
      press(recordBtn, rec.active);
      recStatus.classList.toggle('on', rec.active);
      const recText = rec.active
        ? t('studio.recordingStatus', {
          elapsed: (rec.elapsedMs / 1000).toFixed(1),
          total: (rec.durationMs / 1000).toFixed(1),
          mime: rec.mimeType || t('studio.videoMime'),
        })
        : (rec.supported
          ? t('studio.recordReady')
          : t('studio.recordUnsupported'));
      if (recStatus.textContent !== recText) recStatus.textContent = recText;
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
      timeMenu.setDisabled(isRecording || timeBusy);
      rebuildStoryboard();
      updateFilmSummary();
      const board = S.getStoryboard();
      lookChip.disabled = !board.shots.length;
      press(lookChip, S.lookThrough && !lookChip.disabled);
      const runs = shotRuns(board.shots, S.durationMs);
      const shotIndex = runs.findIndex((run) => run.keys.some((key) => key.id === S.selectedShotId));
      setLabel(shotChip, shotIndex < 0 ? t('studio.ws.noShot')
        : t('studio.ws.shot', { n: String(shotIndex + 1).padStart(2, '0'), label: shotLabel(runs[shotIndex].first.label) }));
      if (planShown) planView.refreshPlan();
      api.refreshTime();
    },
    refreshMap() {
      refreshSun();
      const id = S.mapId;
      if (!id) return;
      const info = S.getMapInfo ? S.getMapInfo(id) : { name: id };
      const name = mapLabel(id);
      paintMapCard(null);
      projectName.textContent = name;
      mapRowThumb.src = imageFor(MAP_THUMBS, id) || '';
      if (planShown) planView.refreshPlan();
      mapBtn.setAttribute('aria-label', t('studioPanel.map.chooseAriaCurrent', { name: info.name || id }));
      mapPicker?.setValue(id);
    },
    refreshPicture() { picturePanel.refresh(); },
    refreshAll() {
      api.refreshMap();
      api.refreshPicture();
      api.refreshActors();
      api.refreshHistory();
      api.refreshEffects();
      api.refreshCamera();
      api.refreshStoryboard();
      api.refreshTime();
      outlineCount('director', null);
      outlineCount('battlefield', null);
      outlineCount('output', null);
    },
    tick(dt) {
      syncPlayhead();
      refreshAcc += dt;
      planAcc += dt;
      // the plan follows the playhead at ~15 fps while the take plays
      if (planShown && proControls && S.playing && planAcc >= 1 / 15) { planAcc = 0; planView.refreshTime(); }
      if (refreshAcc < 0.25) return;
      refreshAcc = 0;
      refreshSunCamera();
      api.refreshTime();
      refreshSaved();
    },
    drawSelection,
    openCommands() { commandPalette.open(); },
    refreshHistory() {
      const history = S.history;
      undoBtn.disabled = !history.undo;
      redoBtn.disabled = !history.redo;
      refreshSaved();
      // an empty Studio offers the last autosaved scene until something is staged or saved here
      const saved = history.savedAt ? null : S.autosaved();
      const empty = !S._internal.actors.length && !S.getStoryboard().shots.length;
      restoreBtn.hidden = !(saved && empty);
      if (saved && empty) {
        restoreBtn.dataset.tip = t('studio.ws.restoreTitle', { map: S.getMapInfo(saved.map).name, count: saved.tanks,
          ago: agoText(saved.savedAt) || t('studio.ws.justNow') });
      }
    },
    setShotThumbnail(id, url) {
      for (const slot of shotThumbSlots.get(id) ?? []) {
        slot.img.src = url;
        slot.img.hidden = false;
        slot.glyph?.setAttribute('hidden', '');
      }
    },
  };
  return api;
}

type SwatchPainter = {
  readonly paint: typeof import('./camoSwatchPainter.ts').paintCamoSwatch;
  readonly auto: typeof import('./camoSwatchPainter.ts').paintAutoCamoSwatch;
  readonly spec: typeof import('../vehicles/specs.ts').getSpec;
};
