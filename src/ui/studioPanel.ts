import { STUDIO_TIMES, type StudioLight, type StudioTimeOfDay } from '../game/studioLight.ts';
import type { RuntimeValue } from '../runtimeTypes.ts';
import type { ProductionFormat, ProductionRigId } from '../game/studioProduction.ts';
import { mountStudioProductionPanel, STUDIO_PRODUCTION_CSS } from './studioProductionPanel.ts';
import { mountStudioPicturePanel, type StudioPicturePanelApi } from './studioPicturePanel.ts';
/**
 * studioPanel.ts — SCENE STUDIO control panel (src/game/studio.ts's UI).
 *
 * Workspace layout: one scrollable, grouped workspace (Battlefield / Tanks /
 * Effects / Global / Output). The panel stays a THIN VIEW over the studio API
 * — every control
 * calls the same window.__STUDIO methods the scripted shoot uses, so
 * anything staged by hand round-trips through state()/load() unchanged.
 *
 * Layout: right workspace dock, top-left phase badge with EXIT,
 * bottom-left key hints + live camera readout.
 */
import { FONT_STACK, ensureFonts } from './fonts.ts';
import { iconUrl } from './icons.ts';
import { MAP_HEROES, MAP_THUMBS } from './mapThumbs.ts';
import { mountMediaArchive } from '../presentation/mediaArchive.ts';
import { PRODUCT_STATS } from '../productStats.ts';
import { vehicleEraLabelI18n } from '../vehicles/taxonomy.ts';
import { createInfoButton, type InfoButton } from './contextInfo.ts';
import { createPlanView, type StudioPlanFeatures } from './studioPlanView.ts';
import { getLocale, t } from './i18n.ts';
import { STUDIO_FX_PARAMS } from '../game/studioFxSettings.ts';
import { hrefForLocale } from './localeRouting.ts';
import { FILM_RESOLUTIONS, createFilmPlan, filmOutputSize, normalizeFilm } from '../game/studioFilmPlan.ts';

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
  readonly body: HTMLDivElement;
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

const CSS = `
.cot-studio{position:fixed;inset:0;z-index:58;display:none;pointer-events:none;
  font-family:${FONT_STACK};color:#e6edf3;-webkit-user-select:none;user-select:none;}
.cot-studio *{box-sizing:border-box;margin:0;padding:0;}
.cot-studio .badge{position:absolute;top:16px;left:20px;pointer-events:auto;display:flex;
  align-items:center;gap:10px;padding:8px 12px;background:rgba(6,9,12,.85);
  border:1px solid rgba(190,204,216,.28);border-left:3px solid #e69a2d;backdrop-filter:blur(4px);}
.cot-studio .badge .bm{width:18px;height:18px;object-fit:contain;display:block;}
.cot-studio .badge .t{font-size:12px;font-weight:800;letter-spacing:.26em;color:#ffd27a;}
.cot-studio .badge .m{font-size:10px;font-weight:700;letter-spacing:.14em;color:#8a97a3;}
.cot-studio .badge button{display:inline-flex;align-items:center;gap:5px;}
.cot-studio .badge button img{display:block;width:18px;height:15px;object-fit:contain;}
.cot-studio .busy{position:absolute;top:16px;left:50%;transform:translateX(-50%);
  padding:8px 18px;background:rgba(6,9,12,.88);border:1px solid rgba(230,154,45,.5);
  color:#ffd27a;font-size:11px;font-weight:800;letter-spacing:.18em;text-transform:uppercase;display:none;}
.cot-studio .dock{position:absolute;top:0;right:0;bottom:0;width:390px;pointer-events:auto;
  background:rgba(5,8,11,.94);border-left:1px solid rgba(210,221,230,.17);
  box-shadow:-12px 0 28px rgba(0,0,0,.26);backdrop-filter:blur(12px) saturate(.85);
  padding:16px 14px 28px;overflow-y:auto;overflow-x:hidden;scrollbar-width:thin;
  scrollbar-color:rgba(230,154,45,.4) transparent;}
.cot-studio .dock::-webkit-scrollbar{width:7px;}
.cot-studio .dock::-webkit-scrollbar-thumb{background:rgba(230,154,45,.35);}
.cot-studio .pgroup{position:relative;margin-bottom:19px;}
.cot-studio .pgroup+.pgroup{padding-top:2px;}
.cot-studio .ghead{display:grid;grid-template-columns:28px minmax(0,1fr) 20px;align-items:center;
  column-gap:8px;margin:0 2px 8px;}
.cot-studio .gnum{grid-row:1 / 3;align-self:stretch;display:flex;align-items:center;justify-content:center;
  border-right:1px solid rgba(230,154,45,.42);font-size:9px;font-weight:900;letter-spacing:.08em;
  color:#e69a2d;}
.cot-studio .gtitle{font-size:11px;font-weight:900;letter-spacing:.23em;color:#dce5ec;
  line-height:1.25;text-transform:uppercase;}
.cot-studio .gsub{font-size:7.5px;font-weight:700;letter-spacing:.12em;color:#65727d;
  line-height:1.45;text-transform:uppercase;}
.cot-studio .ghead>.cot-info-trigger{grid-column:3;grid-row:1/3;align-self:center;justify-self:end}
.cot-studio .gbody{display:grid;gap:7px;}
.cot-studio .sec{position:relative;border:1px solid rgba(190,204,216,.17);
  background:rgba(10,15,20,.68);padding:10px 10px 9px;}
.cot-studio .sec::before{content:'';position:absolute;top:-1px;left:-1px;width:3px;height:17px;
  background:#e69a2d;}
.cot-studio .sec>.h{font-size:10px;font-weight:800;letter-spacing:.24em;color:#c9d4dd;
  text-transform:uppercase;margin-bottom:9px;border-bottom:1px solid rgba(190,204,216,.16);
  padding-bottom:6px;padding-left:7px;display:flex;justify-content:space-between;align-items:baseline;}
.cot-studio .sec>.h .sub{font-size:8px;color:#5f6b76;letter-spacing:.1em;font-weight:700;}
.cot-studio .sec>.h .sub{min-width:0;margin-left:auto;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.cot-studio .sec>.h>.cot-info-trigger{margin-left:6px;flex:none}
.cot-studio .cot-info-trigger{width:20px;height:20px;min-width:20px;min-height:20px;max-width:20px;max-height:20px;
  padding:0;display:inline-grid;place-items:center;border:1px solid rgba(154,174,189,.3);border-radius:50%;
  background:rgba(8,12,16,.76);color:#9aabb8;font-size:inherit;line-height:1;letter-spacing:0;text-transform:none;box-shadow:none}
.cot-studio .row{display:flex;align-items:center;gap:6px;margin-bottom:6px;flex-wrap:wrap;}
.cot-studio label.k{font-size:9px;font-weight:700;letter-spacing:.12em;color:#8a97a3;
  text-transform:uppercase;min-width:52px;}
.cot-studio input[type=range]{flex:1;-webkit-appearance:none;appearance:none;height:16px;
  min-width:60px;background:transparent;}
.cot-studio input[type=range]::-webkit-slider-runnable-track{height:3px;
  background:linear-gradient(90deg,rgba(230,154,45,.55),rgba(190,204,216,.22));}
.cot-studio input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:11px;height:13px;
  margin-top:-5px;background:linear-gradient(180deg,#ffc169,#e69a2d);border:1px solid #0b0f12;}
.cot-studio input[type=range]::-moz-range-track{height:3px;background:rgba(190,204,216,.22);}
.cot-studio input[type=range]::-moz-range-thumb{width:10px;height:12px;border-radius:0;
  background:#e69a2d;border:1px solid #0b0f12;}
.cot-studio input[type=number],.cot-studio input[type=text]{width:58px;background:rgba(4,7,10,.9);
  border:1px solid rgba(190,204,216,.25);color:#ffd27a;font-family:${FONT_STACK};
  font-size:11px;font-weight:700;padding:3px 5px;}
.cot-studio input[type=text]{width:100%;}
.cot-studio select{background:rgba(4,7,10,.9);border:1px solid rgba(190,204,216,.25);
  color:#e6edf3;font-family:${FONT_STACK};font-size:11px;font-weight:600;padding:4px 5px;flex:1;min-width:0;}
.cot-studio button{cursor:pointer;background:linear-gradient(180deg,rgba(26,34,42,.95),rgba(15,21,27,.95));
  color:#d8e0e7;border:1px solid rgba(190,204,216,.3);font-family:${FONT_STACK};font-size:9.5px;
  font-weight:800;letter-spacing:.1em;text-transform:uppercase;padding:5px 8px;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.05);}
.cot-studio button:hover{border-color:#e69a2d;color:#ffd27a;}
.cot-studio button:focus-visible,.cot-studio input:focus-visible,.cot-studio select:focus-visible{
  outline:2px solid #ffd27a;outline-offset:1px;}
.cot-studio button.on{background:linear-gradient(180deg,#8a5a14,#5c3a0a);
  border-color:#ffc169;color:#fff2d9;}
.cot-studio button.prime{background:linear-gradient(180deg,#ffa02e,#d95f00);
  border-color:#ffc169;color:#fff7ea;font-size:11px;padding:8px 10px;width:100%;
  letter-spacing:.2em;}
.cot-studio button.warn{border-color:rgba(240,90,90,.55);color:#f0a0a0;}
.cot-studio .grid{display:grid;grid-template-columns:1fr 1fr;gap:5px;}
.cot-studio .grid3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px;}
/* --- battlefield picker ----------------------------------------------------- */
.cot-studio .mapPick{position:relative;width:100%;}
.cot-studio .mapBtn{position:relative;display:block;width:100%;height:148px;padding:0;overflow:hidden;
  text-align:left;border-color:rgba(190,204,216,.32);background:#111820;}
.cot-studio .mapBtn:hover{border-color:#e69a2d;}
.cot-studio .mapBtn:disabled{cursor:wait;opacity:.78;}
.cot-studio .mapBtn .mhero{display:block;width:100%;height:100%;object-fit:cover;
  transform:scale(1.01);transition:transform .2s ease,filter .2s ease;}
.cot-studio .mapBtn:hover .mhero{transform:scale(1.035);filter:saturate(1.08);}
.cot-studio .mapBtn .mshade{position:absolute;inset:42% 0 0;background:linear-gradient(180deg,transparent,
  rgba(4,7,10,.35) 25%,rgba(4,7,10,.94) 100%);pointer-events:none;}
.cot-studio .mapBtn .mcopy{position:absolute;left:11px;right:42px;bottom:10px;min-width:0;}
.cot-studio .mapBtn .mn{display:block;font-size:13px;font-weight:900;letter-spacing:.07em;color:#fff3db;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:0 2px 7px #000;}
.cot-studio .mapBtn .mid{position:absolute;top:9px;left:9px;padding:3px 6px;
  background:rgba(4,7,10,.78);border:1px solid rgba(255,255,255,.2);font-size:7px;font-weight:900;
  letter-spacing:.16em;color:#ffd27a;}
.cot-studio .mapBtn .mar{position:absolute;right:10px;bottom:12px;width:22px;height:22px;display:grid;
  place-items:center;background:rgba(4,7,10,.74);border:1px solid rgba(255,255,255,.2);
  color:#ffd27a;font-size:8px;}
.cot-studio .mapPop{position:absolute;top:calc(100% + 5px);left:0;right:0;z-index:20;display:none;
  max-height:min(65vh,560px);background:rgba(5,8,11,.99);border:1px solid rgba(230,154,45,.55);
  box-shadow:0 18px 54px rgba(0,0,0,.8);}
.cot-studio .mapPop.open{display:flex;flex-direction:column;}
.cot-studio .mapPopHead{display:flex;align-items:center;justify-content:space-between;padding:8px 9px 7px;
  border-bottom:1px solid rgba(190,204,216,.15);font-size:8px;font-weight:900;letter-spacing:.2em;
  color:#aebbc6;text-transform:uppercase;}
.cot-studio .mapPopHead span:last-child{color:#687784;letter-spacing:.08em;}
.cot-studio .mapGrid{display:grid;grid-template-columns:1fr 1fr;grid-auto-rows:max-content;
  align-content:start;flex:1;min-height:0;gap:7px;padding:8px;overflow-y:auto;
  overscroll-behavior:contain;scrollbar-width:thin;
  scrollbar-color:rgba(230,154,45,.4) transparent;}
.cot-studio .mapCard{position:relative;display:block;min-width:0;padding:0 0 7px;overflow:hidden;
  align-self:start;text-align:left;text-transform:none;background:rgba(14,19,24,.9);
  border:1px solid rgba(190,204,216,.2);}
.cot-studio .mapCard:hover{border-color:rgba(230,154,45,.72);color:#ffd27a;}
.cot-studio .mapCard[aria-selected="true"]{border-color:#e69a2d;
  box-shadow:inset 0 -2px 0 #e69a2d;background:rgba(52,36,12,.6);}
.cot-studio .mapCard img{display:block;width:100%;aspect-ratio:16/9;object-fit:cover;margin-bottom:6px;
  background:#111820;}
.cot-studio .mapCard .cn{display:block;padding:0 7px;font-size:9px;font-weight:900;letter-spacing:.045em;
  color:#e6edf3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.cot-studio .mapCard .check{position:absolute;top:5px;right:5px;display:none;width:18px;height:18px;
  place-items:center;background:#e69a2d;color:#111820;font-size:10px;box-shadow:0 2px 8px #000;}
.cot-studio .mapCard[aria-selected="true"] .check{display:grid;}
/* tank silhouette icon (public/icons/<id>_side_silhouette.png, mask-tinted) */
.cot-studio .tic{flex:none;background:#cfd9e2;-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;
  -webkit-mask-position:center;mask-position:center;-webkit-mask-size:contain;mask-size:contain;}
/* --- tank picker ------------------------------------------------------------ */
.cot-studio .pick{position:relative;width:100%;}
.cot-studio .pickBtn{display:flex;align-items:center;gap:8px;width:100%;padding:6px 8px;
  text-align:left;letter-spacing:.06em;font-size:10.5px;}
.cot-studio .pickBtn .tic{width:44px;height:17px;}
.cot-studio .pickBtn .nm{flex:1;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;}
.cot-studio .pickBtn .ar{color:#8a97a3;font-size:8px;}
.cot-studio .pickPop{position:absolute;top:calc(100% + 4px);left:0;right:0;z-index:5;display:none;
  background:rgba(5,8,11,.98);border:1px solid rgba(230,154,45,.45);max-height:328px;
  box-shadow:0 14px 40px rgba(0,0,0,.7);}
.cot-studio .pickPop.open{display:flex;flex-direction:column;}
.cot-studio .pickPop .flt{margin:7px;width:calc(100% - 14px);}
.cot-studio .pickPop .lst{overflow-y:auto;scrollbar-width:thin;
  scrollbar-color:rgba(230,154,45,.4) transparent;}
.cot-studio .pickPop .lst::-webkit-scrollbar{width:7px;}
.cot-studio .pickPop .lst::-webkit-scrollbar-thumb{background:rgba(230,154,45,.35);}
.cot-studio .prow{display:flex;align-items:center;gap:8px;padding:4px 8px;cursor:pointer;
  border-left:2px solid transparent;}
.cot-studio .prow:hover{background:rgba(52,36,12,.55);border-left-color:#e69a2d;}
.cot-studio .prow.cur{background:rgba(52,36,12,.4);border-left-color:#ffd27a;}
.cot-studio .prow .tic{width:46px;height:17px;}
.cot-studio .prow .nm{flex:1;font-size:10.5px;font-weight:700;color:#e6edf3;white-space:nowrap;
  overflow:hidden;text-overflow:ellipsis;}
.cot-studio .prow .era{font-size:7.5px;font-weight:800;letter-spacing:.12em;color:#8a97a3;
  border:1px solid rgba(190,204,216,.25);padding:1px 4px;text-transform:uppercase;}
.cot-studio .prow .dev{font-size:7px;font-weight:900;letter-spacing:.12em;color:#8fd0ff;
  border:1px solid rgba(103,191,255,.55);background:rgba(21,62,92,.32);padding:2px 4px;}
.cot-studio .pgh{padding:5px 8px 3px;font-size:8px;font-weight:800;letter-spacing:.2em;
  color:#e69a2d;text-transform:uppercase;border-bottom:1px solid rgba(190,204,216,.12);}
/* --- actor list -------------------------------------------------------------- */
.cot-studio .alist{max-height:168px;overflow-y:auto;scrollbar-width:thin;margin-bottom:6px;}
.cot-studio .arow{display:flex;align-items:center;gap:7px;padding:4px 6px;cursor:pointer;
  border:1px solid transparent;border-left:2px solid rgba(190,204,216,.2);margin-bottom:3px;
  background:rgba(14,19,24,.6);}
.cot-studio .arow:hover{border-color:rgba(230,154,45,.4);}
.cot-studio .arow.sel{border-color:#e69a2d;border-left-color:#ffd27a;background:rgba(52,36,12,.55);}
.cot-studio .arow .tic{width:40px;height:15px;}
.cot-studio .arow.st-bad .tic{background:#e0766a;}
.cot-studio .arow.st-warn .tic{background:#e0b46a;}
.cot-studio .arow .nm{flex:1;font-size:10.5px;font-weight:700;color:#e6edf3;white-space:nowrap;
  overflow:hidden;text-overflow:ellipsis;}
.cot-studio .arow .st{font-size:7.5px;font-weight:800;letter-spacing:.08em;color:#8a97a3;
  text-transform:uppercase;}
.cot-studio .arow.st-bad .st{color:#e0766a;}
.cot-studio .arow.st-warn .st{color:#e0b46a;}
.cot-studio .arow .del{padding:1px 6px;font-size:10px;}
/* --- selected actor header ---------------------------------------------------- */
.cot-studio .selhead{display:flex;align-items:center;gap:9px;margin-bottom:8px;
  padding:6px 8px;background:rgba(14,19,24,.7);border:1px solid rgba(190,204,216,.16);}
.cot-studio .selhead .tic{width:56px;height:21px;background:#ffd27a;}
.cot-studio .selhead .nm{flex:1;min-width:0;}
.cot-studio .selhead .nm .n1{font-size:12px;font-weight:800;color:#ffd27a;letter-spacing:.05em;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.cot-studio .selhead .nm .n2{font-size:8px;font-weight:700;color:#8a97a3;letter-spacing:.14em;
  text-transform:uppercase;}
/* --- effects board ------------------------------------------------------------ */
.cot-studio .fxg{margin-bottom:8px;}
.cot-studio .fxg:last-child{margin-bottom:0;}
.cot-studio .fxg .gh{font-size:8px;font-weight:800;letter-spacing:.22em;color:#e69a2d;
  text-transform:uppercase;margin-bottom:5px;display:flex;align-items:center;gap:6px;}
.cot-studio .fxg .gh::after{content:'';flex:1;height:1px;background:rgba(230,154,45,.25);}
.cot-studio .fxstack{max-height:188px;overflow-y:auto;margin-bottom:8px;scrollbar-width:thin;
  scrollbar-color:rgba(230,154,45,.4) transparent;}
.cot-studio .fxempty{padding:10px 7px;border:1px dashed rgba(190,204,216,.2);color:#687784;
  font-size:8.5px;line-height:1.5;letter-spacing:.1em;text-align:center;text-transform:uppercase;}
.cot-studio .fxrow{display:grid;grid-template-columns:8px minmax(0,1fr) 54px auto;align-items:center;gap:7px;
  min-height:38px;padding:5px 5px 5px 7px;margin-bottom:3px;cursor:pointer;background:rgba(14,19,24,.72);
  border:1px solid transparent;border-left:2px solid rgba(190,204,216,.22);}
.cot-studio .fxrow:hover,.cot-studio .fxrow:focus-visible{border-color:rgba(230,154,45,.5);outline:none;}
.cot-studio .fxrow.sel{border-color:#e69a2d;border-left-color:#ffd27a;background:rgba(52,36,12,.62);}
.cot-studio .fxrow .pip{width:6px;height:6px;border-radius:50%;background:#e69a2d;
  box-shadow:0 0 7px rgba(255,177,70,.65);}
.cot-studio .fxrow .fn{min-width:0;}
.cot-studio .fxrow .fn .n1{font-size:9.5px;font-weight:800;color:#dce5ec;letter-spacing:.1em;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-transform:uppercase;}
.cot-studio .fxrow .fn .n2{font-size:7.5px;font-weight:700;color:#7d8c98;letter-spacing:.08em;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-transform:uppercase;margin-top:2px;}
.cot-studio .fxrow.sel .fn .n1{color:#ffd27a;}
.cot-studio .fxrow .ftime{width:54px;font-size:9px;text-align:right;padding:3px 4px;}
.cot-studio .fxrow .del{padding:2px 6px;font-size:10px;}
.cot-studio .fxstackbar{display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:6px;}
.cot-studio .fxstackbar .hint{font-size:7.5px;color:#71808d;letter-spacing:.08em;text-transform:uppercase;}
/* --- cinematic storyboard ---------------------------------------------------- */
.cot-studio .storyClock{display:flex;align-items:center;justify-content:space-between;margin:5px 0 7px;
  color:#ffd27a;font-size:10px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;}
.cot-studio .storyClock .limit{color:#71808d;font-size:7.5px;letter-spacing:.08em;}
.cot-studio .scrub{width:100%;display:block;margin:1px 0 8px;}
.cot-studio .timelineBoard{display:grid;gap:3px;margin:7px 0 8px;padding:5px;
  background:rgba(3,6,9,.78);border:1px solid rgba(190,204,216,.16);}
.cot-studio .tlane{display:grid;grid-template-columns:34px minmax(0,1fr);align-items:center;gap:5px;}
.cot-studio .tlane>.lbl{font-size:7px;font-weight:900;letter-spacing:.13em;color:#71808d;text-align:right;}
.cot-studio .tltrack{position:relative;height:18px;cursor:crosshair;overflow:hidden;
  background:linear-gradient(90deg,rgba(230,154,45,.05),rgba(190,204,216,.04));
  border-left:1px solid rgba(230,154,45,.45);border-right:1px solid rgba(190,204,216,.16);}
.cot-studio .tltrack::before{content:'';position:absolute;inset:0;
  background:repeating-linear-gradient(90deg,transparent 0,transparent calc(10% - 1px),rgba(190,204,216,.1) calc(10% - 1px),rgba(190,204,216,.1) 10%);}
.cot-studio .tlmarker{position:absolute;top:4px;width:8px;height:10px;transform:translateX(-50%);
  border:0;padding:0;background:#e69a2d;box-shadow:0 0 5px rgba(230,154,45,.55);z-index:2;}
.cot-studio .tlmarker.actor{background:#7fc7ff;}
.cot-studio .tlmarker.fx{width:6px;border-radius:50%;background:#ef6d58;}
.cot-studio .tlmarker.sel{outline:2px solid #fff2d9;outline-offset:1px;}
.cot-studio .playhead{position:absolute;top:0;bottom:0;width:1px;background:#fff2d9;
  box-shadow:0 0 5px #ffd27a;pointer-events:none;z-index:3;}
.cot-studio .shotboard{display:grid;gap:4px;max-height:154px;overflow-y:auto;margin:6px 0 8px;}
.cot-studio .shotcard{display:grid;grid-template-columns:28px minmax(0,1fr) 66px 24px 28px;align-items:center;
  gap:5px;padding:5px;background:rgba(14,19,24,.72);border:1px solid rgba(190,204,216,.17);}
.cot-studio .shotcard.sel{border-color:#e69a2d;background:rgba(52,36,12,.62);}
.cot-studio .shotcard .num{font-size:8px;font-weight:900;color:#e69a2d;text-align:center;}
.cot-studio .shotcard .copy{min-width:0;cursor:pointer;}
.cot-studio .shotcard .name{font-size:9px;font-weight:900;color:#dce5ec;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.cot-studio .shotcard .time{font-size:7.5px;font-weight:700;color:#71808d;margin-top:2px;}
.cot-studio .shotcard select{font-size:8px;padding:3px;}
.cot-studio .shotcard .del{padding:2px 5px;}
.cot-studio .recStatus{margin:6px 0;font-size:8px;font-weight:800;letter-spacing:.1em;
  color:#71808d;text-transform:uppercase;text-align:center;}
.cot-studio .recStatus.on{color:#ff806b;animation:studioRecPulse 1s ease-in-out infinite;}
.cot-studio .filmHead{display:flex;align-items:center;gap:6px;margin:1px 0 8px;font-size:8px;font-weight:900;
  letter-spacing:.2em;color:#e69a2d;text-transform:uppercase;}
.cot-studio .filmHead::after{content:'';flex:1;height:1px;background:rgba(230,154,45,.25);}
.cot-studio .filmHead.live{margin-top:12px;}
.cot-studio .filmHint{margin:5px 0 2px;font-size:8px;line-height:1.5;letter-spacing:.06em;color:#71808d;}
.cot-studio .filmVeil{position:absolute;inset:0;z-index:40;display:none;flex-direction:column;align-items:center;
  justify-content:center;gap:13px;padding:24px 16px;pointer-events:auto;background:rgba(3,5,8,.86);
  backdrop-filter:blur(3px);}
.cot-studio .filmVeil.on{display:flex;}
.cot-studio .filmVeil .fvTitle{font-size:11px;font-weight:900;letter-spacing:.26em;color:#ffd27a;}
.cot-studio .filmVeil .fvPreview{display:block;max-width:min(78vw,960px);max-height:58vh;background:#05080b;
  border:1px solid rgba(230,154,45,.45);box-shadow:0 18px 60px rgba(0,0,0,.75);}
.cot-studio .filmVeil .fvBar{width:min(78vw,560px);height:4px;background:rgba(190,204,216,.18);}
.cot-studio .filmVeil .fvBar i{display:block;height:100%;width:0;background:linear-gradient(90deg,#d95f00,#ffd27a);}
.cot-studio .filmVeil .fvText{font-size:10px;font-weight:800;letter-spacing:.14em;color:#c9d4dd;text-align:center;}
.cot-studio .filmVeil button{min-width:160px;min-height:36px;}
@keyframes studioRecPulse{50%{opacity:.45;}}
.cot-studio .foot{position:absolute;left:20px;bottom:14px;pointer-events:none;
  font-size:10px;font-weight:600;letter-spacing:.08em;color:#9fb0bf;
  text-shadow:0 1px 4px rgba(0,0,0,.9);line-height:1.7;}
.cot-studio .foot .cam{color:#ffd27a;font-weight:700;}
.cot-studio .val{font-size:10px;font-weight:800;color:#ffd27a;min-width:34px;text-align:right;}
/* --- sun (media r5): compass dial, lighting presets, elevation --------------- */
.cot-studio .sun{display:grid;grid-template-columns:78px minmax(0,1fr);gap:8px;align-items:center;margin-bottom:6px;}
.cot-studio .sunDial{width:78px;height:78px;display:block;touch-action:none;cursor:grab;
  background:radial-gradient(circle at 50% 50%,rgba(16,23,30,.95) 0 58%,rgba(8,12,16,.95) 59% 100%);
  border:1px solid rgba(190,204,216,.28);border-radius:50%;}
.cot-studio .sunDial:focus-visible{outline:2px solid #ffd27a;outline-offset:2px;}
.cot-studio .sunDial.drag{cursor:grabbing;}
.cot-studio .sunSide{display:grid;gap:5px;min-width:0;}
.cot-studio .sunRead{display:flex;justify-content:space-between;gap:6px;font-size:9px;font-weight:800;
  letter-spacing:.12em;color:#8a97a3;text-transform:uppercase;}
.cot-studio .sunRead b{color:#ffd27a;font-weight:900;letter-spacing:.06em;}
.cot-studio .sunPresets{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:3px;}
.cot-studio .sunPresets button{padding:5px 2px;font-size:8px;letter-spacing:.06em;min-height:26px;}
.cot-studio .sunNote{font-size:8.5px;font-weight:700;letter-spacing:.08em;color:#6f7d88;}
.cot-studio-archive{width:min(94vw,1560px);max-width:none;padding:0;border:1px solid rgba(190,204,216,.32);
  background:#05080b;color:#e6edf3;box-shadow:0 36px 140px rgba(0,0,0,.82);font-family:${FONT_STACK};}
.cot-studio-archive::backdrop{background:rgba(1,3,5,.9);backdrop-filter:blur(10px);}
.cot-studio-archive>header{display:flex;align-items:end;justify-content:space-between;gap:24px;padding:22px 24px 18px;
  border-bottom:1px solid rgba(190,204,216,.17);background:linear-gradient(120deg,rgba(230,154,45,.1),transparent 55%);}
.cot-studio-archive>header small,.cot-studio-archive>header strong,.cot-studio-archive>header span{display:block;}
.cot-studio-archive>header small{color:#e69a2d;font-size:8px;font-weight:900;letter-spacing:.2em;text-transform:uppercase;}
.cot-studio-archive>header strong{margin-top:5px;font-size:clamp(26px,4vw,50px);line-height:.95;text-transform:uppercase;}
.cot-studio-archive>header span{margin-top:7px;color:#84939f;font-size:10px;}
.cot-studio-archive>header button{width:42px;height:42px;padding:0;border:1px solid rgba(190,204,216,.24);
  background:transparent;color:#ffd27a;font-size:22px;}
.cot-studio-archive .archiveBody{padding:18px 18px 24px;}
`;

/**
 * Build the studio panel.
 * @param {object} S the studio API (createStudio's `api`)
 * @returns {object} { root, show, hide, tick, setBusy, setSelected,
 *   setPlaceArmed, refreshActors, refreshSelected, refreshCamera,
 *   refreshTime, refreshAll }
 */
export function createStudioPanel(S: StudioPanelApi): StudioPanelRuntime {
  ensureFonts();
  if (!document.getElementById('cot-studio-css')) {
    const st = document.createElement('style');
    st.id = 'cot-studio-css';
    st.textContent = CSS + STUDIO_PRODUCTION_CSS;
    document.head.appendChild(st);
  }

  const root = el('div', 'cot-studio');
  document.body.appendChild(root);

  /** Tinted side-silhouette icon for a tank id (mask, so one PNG serves any tint). */
  function tankIcon(id: string, cls = 'tic'): HTMLDivElement {
    const d = el('div', cls);
    const u = `url(${iconUrl(id, 'side_silhouette')})`;
    d.style.webkitMaskImage = u;
    d.style.maskImage = u;
    return d;
  }

  // --- top badge -------------------------------------------------------------
  const badge = el('div', 'badge');
  const badgeMark = document.createElement('img');
  badgeMark.className = 'bm';
  badgeMark.src = '/brand/nav/studio.svg';
  badgeMark.alt = '';
  badgeMark.draggable = false;
  const badgeTitle = el('div', 't', t('studioPanel.header.title'));
  const badgeMap = el('div', 'm', '');
  const galleryBtn = el('button');
  galleryBtn.innerHTML = `<img src="/brand/nav/tank-gallery.svg" alt="">${t('studioPanel.tankGallery')}`;
  galleryBtn.addEventListener('click', () => {
    const id = S._internal.selected?.spec?.id;
    window.location.href = hrefForLocale(id ? `/gallery?id=${encodeURIComponent(id)}` : '/gallery', getLocale());
  });
  const exitBtn = el('button', null, t('studio.exitF8'));
  exitBtn.addEventListener('click', () => S.exit());
  badge.append(badgeMark, badgeTitle, badgeMap, galleryBtn, exitBtn);
  root.appendChild(badge);

  const busy = el('div', 'busy');
  root.appendChild(busy);

  // --- right dock --------------------------------------------------------------
  const dock = el('div', 'dock');
  root.appendChild(dock);
  // keep canvas drag-look from firing when interacting with the dock
  for (const evName of ['pointerdown', 'pointermove', 'pointerup', 'wheel', 'keydown']) {
    dock.addEventListener(evName, (e) => e.stopPropagation());
  }

  // === BATTLEFIELD group ===
  const battlefieldGroup = panelGroup('01', 'battlefield', t('studioPanel.panel.battlefield.title'), t('studioPanel.panel.battlefield.sub'));
  dock.appendChild(battlefieldGroup.root);
  const secScene = section('map', t('studioPanel.section.map'), t('studioPanel.section.mapSub', { count: PRODUCT_STATS.battlefields }));
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
  const mapArrow = el('span', 'mar', '▼');
  mapBtn.append(mapHero, mapShade, mapCopy, mapId, mapArrow);
  const mapPop = el('div', 'mapPop');
  mapPop.setAttribute('role', 'listbox');
  mapPop.setAttribute('aria-label', t('studioPanel.map.listAria'));
  const mapPopHead = el('div', 'mapPopHead');
  mapPopHead.append(el('span', null, t('studioPanel.map.heading')), el('span', null, t('studioPanel.map.previewHint')));
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
    card.append(
      thumb,
      el('span', 'cn', info.name || id),
      el('span', 'check', '✓'),
    );
    card.addEventListener('click', () => chooseMap(id));
    mapCards.set(id, card);
    mapGrid.appendChild(card);
  }
  mapPop.append(mapPopHead, mapGrid);
  mapPick.append(mapBtn, mapPop);
  secScene.appendChild(mapPick);
  const timeLabel = el('label', 'row');
  timeLabel.appendChild(el('span', '', t('studioPanel.timeOfDay')));
  const timeSelect = el('select');
  timeSelect.setAttribute('aria-label', t('studioPanel.timeOfDay'));
  const timeOptions = new Map<StudioTimeOfDay, HTMLOptionElement>();
  for (const time of STUDIO_TIMES) {
    const option = el('option', '', t(`atmosphere.${time}`));
    option.value = time;
    timeOptions.set(time, option);
    timeSelect.appendChild(option);
  }
  timeSelect.addEventListener('change', () => {
    timeSelect.disabled = true;
    S.setTimeOfDay(timeSelect.value as StudioTimeOfDay)
      .catch((error: RuntimeValue) => flashBusy(errorMessage(error)))
      .finally(() => { timeSelect.disabled = false; api.refreshMap(); });
  });
  timeLabel.appendChild(timeSelect);
  secScene.appendChild(timeLabel);

  // --- sun (media r5): bearing on a north-up compass (world +Z up, -X right, as the tactical map), lighting
  // presets relative to the camera, elevation inside the time's band. Slider-rate changes coalesce to one apply.
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const svg = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] => {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
    return node;
  };
  const sunBlock = el('div', 'sun');
  const dial = svg('svg', { viewBox: '-50 -50 100 100', class: 'sunDial', role: 'slider', tabindex: 0,
    'aria-label': t('studioPanel.light.bearingAria'), 'aria-valuemin': 0, 'aria-valuemax': 359 });
  dial.append(
    svg('circle', { r: 44, fill: 'none', stroke: 'rgba(190,204,216,.22)', 'stroke-width': 1 }),
    svg('circle', { r: 30, fill: 'none', stroke: 'rgba(190,204,216,.10)', 'stroke-width': 1 }),
  );
  for (let tick = 0; tick < 360; tick += 30) {
    const a = tick * Math.PI / 180, r0 = tick % 90 ? 40 : 36;
    dial.appendChild(svg('line', { x1: -Math.sin(a) * r0, y1: -Math.cos(a) * r0, x2: -Math.sin(a) * 44, y2: -Math.cos(a) * 44,
      stroke: tick % 90 ? 'rgba(190,204,216,.25)' : 'rgba(190,204,216,.5)', 'stroke-width': 1 }));
  }
  const north = svg('text', { x: 0, y: -27, 'text-anchor': 'middle', 'font-size': 9, 'font-weight': 900,
    fill: '#8a97a3', 'font-family': 'sans-serif' });
  north.textContent = t('studioPanel.light.north');
  const camWedge = svg('path', { d: 'M0 0 L-9 -30 A31 31 0 0 1 9 -30 Z', fill: 'rgba(143,208,255,.20)',
    stroke: 'rgba(143,208,255,.55)', 'stroke-width': 1 });
  const sunRay = svg('line', { x1: 0, y1: 0, x2: 0, y2: -38, stroke: 'rgba(255,193,105,.55)', 'stroke-width': 1.5 });
  const sunDot = svg('circle', { cx: 0, cy: -38, r: 6.5, fill: '#ffb84d', stroke: '#0b0f12', 'stroke-width': 1.5 });
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
    const button = el('button', null, t(`studioPanel.light.${key}`));
    button.type = 'button';
    button.title = t(`studioPanel.light.${key}Hint`);
    button.addEventListener('click', () => {
      const bearing = offset === null ? null : Math.round(((cameraBearing() + offset) % 360 + 360) % 360);
      queueLight({ sunAzimuthDeg: bearing });
    });
    presetButtons.push(button);
    sunPresets.appendChild(button);
  }
  const sunNote = el('div', 'sunNote', '');
  sunSide.append(sunRead, sunPresets);
  sunBlock.append(dial, sunSide);
  const lampRow = el('div', 'row');
  const lampBtn = el('button', null, t('studioPanel.light.headlights'));
  lampBtn.type = 'button';
  lampBtn.title = t('studioPanel.light.headlightsHint');
  lampBtn.addEventListener('click', () => queueLight({ headlights: !S.getLight().headlights }));
  lampRow.append(lampBtn, sunNote);
  const elevation = sliderRow(t('studioPanel.light.elevation'), 1, 80, 0.5, (value) => {
    queueLight({ sunElevationDeg: value });
  });
  elevation.input.setAttribute('aria-label', t('studioPanel.light.elevationAria'));
  const elevationReset = el('button', null, t('studioPanel.light.auto'));
  elevationReset.type = 'button';
  elevationReset.title = t('studioPanel.light.autoHint');
  elevationReset.addEventListener('click', () => queueLight({ sunElevationDeg: null }));
  elevation.row.appendChild(elevationReset);
  secScene.append(sunBlock, elevation.row, lampRow);

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
    sunDot.setAttribute('fill', light.time === 'night' ? '#dfe8ff' : light.time === 'dusk' ? '#ff9c6b' : '#ffb84d');
    refreshSunCamera();
    dial.setAttribute('aria-valuenow', String(Math.round(az)));
    dial.setAttribute('aria-valuetext', t('studioPanel.light.bearingValue', { deg: Math.round(az) }));
    bearingRead.innerHTML = '';
    bearingRead.append(t('studioPanel.light.bearing') + ' ', el('b', null, `${Math.round(az)}°`));
    elevationRead.innerHTML = '';
    elevationRead.append(t(light.time === 'night' ? 'studioPanel.light.moon' : 'studioPanel.light.sun') + ' ', el('b', null, `${elev.toFixed(1)}°`));
    elevation.setRange(light.band.min, light.band.max);
    elevation.set(elev);
    elevationReset.classList.toggle('on', light.override?.sunElevationDeg === undefined);
    presetButtons[4].classList.toggle('on', light.override?.sunAzimuthDeg === undefined);
    sunNote.textContent = light.space ? t('studioPanel.light.spaceNote') : '';
    lampBtn.classList.toggle('on', light.headlights);
    lampBtn.setAttribute('aria-pressed', String(light.headlights));
    for (const [time, option] of timeOptions) option.disabled = !light.times.includes(time);
  }
  battlefieldGroup.body.appendChild(secScene);

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
    mapArrow.textContent = next ? '▲' : '▼';
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
        !(event.target instanceof Node && mapPick.contains(event.target))) toggleMapPick(false);
  });

  // === TANKS group ===
  const tanksGroup = panelGroup('02', 'tanks', t('studioPanel.panel.tanks.title'), t('studioPanel.panel.tanks.sub'));
  dock.appendChild(tanksGroup.root);
  const secActors = section('addTanks', t('studioPanel.section.addTanks'), t('studioPanel.section.addTanksSub'));
  // -- tank picker (icon rows, filterable) --
  let pickedId = 'm1a2';
  const pick = el('div', 'pick');
  const pickBtn = el('button', 'pickBtn');
  const pickIcon = tankIcon(pickedId);
  const pickName = el('span', 'nm', '');
  const pickArrow = el('span', 'ar', '▼');
  pickBtn.append(pickIcon, pickName, pickArrow);
  const pickPop = el('div', 'pickPop');
  const pickFlt = document.createElement('input');
  pickFlt.type = 'text';
  pickFlt.className = 'flt';
  pickFlt.placeholder = t('studioPanel.picker.filterPlaceholder');
  const pickList = el('div', 'lst');
  pickPop.append(pickFlt, pickList);
  pick.append(pickBtn, pickPop);
  secActors.appendChild(pick);

  const specInfo = (id: string): StudioSpecInfo => {
    try { return S.getSpecInfo(id); } catch (_) { return { id, name: id, era: '' }; }
  };
  function setPicked(id: string): void {
    pickedId = id;
    const info = specInfo(id);
    pickName.textContent = info.name;
    const u = `url(${iconUrl(id, 'side_silhouette')})`;
    pickIcon.style.webkitMaskImage = u;
    pickIcon.style.maskImage = u;
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
        const row = el('div', 'prow' + (id === pickedId ? ' cur' : ''));
        row.appendChild(tankIcon(id));
        row.appendChild(el('span', 'nm', info.name));
        if (info.developmentOnly) row.appendChild(el('span', 'dev', info.rosterTag || t('studioPanel.picker.devFallback')));
        if (info.era) row.appendChild(el('span', 'era', vehicleEraLabelI18n(info.era, t, { short: true })));
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
  addRow2.style.marginTop = '6px';
  const addAtMarker = el('button', null, t('studio.addInView'));
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
  const placeBtn = el('button', null, t('studio.clickToPlace'));
  placeBtn.addEventListener('click', () => {
    S._internal.placeArmed = S._internal.placeArmed ? null : pickedId;
    api.setPlaceArmed(S._internal.placeArmed);
  });
  addRow2.append(addAtMarker, placeBtn);
  secActors.appendChild(addRow2);
  const alist = el('div', 'alist');
  alist.style.marginTop = '6px';
  secActors.appendChild(alist);
  tanksGroup.body.appendChild(secActors);

  // === SELECTED ACTOR section ===
  const secSel = section('selectedTank', t('studioPanel.section.selectedTank'), t('studioPanel.section.selectedTankSub'));
  const selHead = el('div', 'selhead');
  const selIcon = tankIcon('m1a2');
  const selNames = el('div', 'nm');
  const selN1 = el('div', 'n1', '');
  const selN2 = el('div', 'n2', '');
  selNames.append(selN1, selN2);
  selHead.append(selIcon, selNames);
  secSel.appendChild(selHead);
  const facing = sliderRow('Facing', 0, 360, 1, (v) => patchSel({ facingDeg: v }));
  const turret = sliderRow('Turret', -180, 180, 1, (v) => patchSel({ turretDeg: v }));
  const gun = sliderRow('Gun', -10, 25, 0.5, (v) => patchSel({ gunDeg: v }));
  secSel.append(facing.row, turret.row, gun.row);
  const posRow = el('div', 'row');
  posRow.appendChild(el('label', 'k', t('studioPanel.selected.posLabel')));
  const px = numInput((v) => patchSel({ x: v }));
  const pz = numInput((v) => patchSel({ z: v }));
  posRow.append(px, pz);
  secSel.appendChild(posRow);
  const camoRow = el('div', 'row');
  camoRow.appendChild(el('label', 'k', t('studioPanel.selected.camoLabel')));
  const camoSel = document.createElement('select');
  for (const cid of ['inherit', ...S.CAMO_PATTERN_IDS]) {
    const o = document.createElement('option');
    o.value = cid;
    o.textContent = cid === 'inherit' ? t('studioPanel.selected.camoInherit') : cid.toUpperCase();
    camoSel.appendChild(o);
  }
  camoSel.addEventListener('change', () => patchSel({ camo: camoSel.value === 'inherit' ? null : camoSel.value }));
  camoRow.appendChild(camoSel);
  secSel.appendChild(camoRow);
  const stateRow = el('div', 'row');
  stateRow.appendChild(el('label', 'k', t('studioPanel.selected.stateLabel')));
  const stateSel = document.createElement('select');
  for (const sid of S.ACTOR_STATES) {
    const o = document.createElement('option');
    o.value = sid;
    o.textContent = sid.toUpperCase();
    stateSel.appendChild(o);
  }
  stateSel.addEventListener('change', () => {
    const a = S._internal.selected;
    if (a) S.setActorState(a, stateSel.value);
  });
  stateRow.appendChild(stateSel);
  secSel.appendChild(stateRow);
  const delRow = el('div', 'grid');
  const recoilBtn = el('button', null, t('studio.recoilPose'));
  recoilBtn.addEventListener('click', () => patchSel({ recoilAgeS: 0.05 }));
  const delBtn = el('button', 'warn', t('studio.remove'));
  delBtn.addEventListener('click', () => { const a = S._internal.selected; if (a) S.removeActor(a); });
  delRow.append(recoilBtn, delBtn);
  secSel.appendChild(delRow);
  tanksGroup.body.appendChild(secSel);

  // === EFFECTS group ===
  const effectsGroup = panelGroup('03', 'effects', t('studioPanel.panel.effects.title'), t('studioPanel.panel.effects.sub'));
  dock.appendChild(effectsGroup.root);
  const secFx = section('layersEvents', t('studioPanel.section.layersEvents'), t('studioPanel.section.layersEventsSub'));
  const fxStackBar = el('div', 'fxstackbar');
  fxStackBar.appendChild(el('div', 'hint', t('studioPanel.effects.hint')));
  const clearStackBtn = el('button', 'warn', t('studio.clearAll'));
  clearStackBtn.addEventListener('click', () => S.clearEffects());
  fxStackBar.appendChild(clearStackBtn);
  const fxStack = el('div', 'fxstack');
  fxStack.setAttribute('role', 'listbox');
  fxStack.setAttribute('aria-label', t('studioPanel.effects.listAria'));
  secFx.append(fxStackBar, fxStack);
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
  function fxGroup(title: string, defs: readonly StudioEffectAction[]): void {
    const g = el('div', 'fxg');
    g.appendChild(el('div', 'gh', title));
    const grid = el('div', 'grid');
    for (const [label, fn, wide] of defs) {
      const b = el('button', null, label);
      if (wide) b.style.gridColumn = '1 / -1';
      b.addEventListener('click', fn);
      grid.appendChild(b);
    }
    g.appendChild(grid);
    secFx.appendChild(g);
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
  const cineToggles = el('div', 'grid');
  const cineBtn = el('button', null, t('studioPanel.fx.cinematicOff'));
  cineBtn.addEventListener('click', () => S.setFxQuality(S.fxQuality === 'cinematic' ? 'battle' : 'cinematic'));
  const dustBtn = el('button', null, t('studioPanel.fx.trackDustOff'));
  dustBtn.addEventListener('click', () => S.setTrackDust(!S.trackDust));
  cineToggles.append(cineBtn, dustBtn);
  cineGroup.appendChild(cineToggles);
  secFx.appendChild(cineGroup);
  function refreshCinematicToggles(): void {
    const on = S.fxQuality === 'cinematic';
    cineBtn.classList.toggle('on', on);
    cineBtn.textContent = t(on ? 'studioPanel.fx.cinematicOn' : 'studioPanel.fx.cinematicOff');
    dustBtn.classList.toggle('on', S.trackDust);
    dustBtn.textContent = t(S.trackDust ? 'studioPanel.fx.trackDustOn' : 'studioPanel.fx.trackDustOff');
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
  const fxParamRows = new Map<string, { input: HTMLInputElement; val: HTMLElement }>();
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
        const row = el('div', 'row');
        row.appendChild(el('label', 'k', t(def.label)));
        const input = document.createElement('input');
        input.type = 'range';
        input.min = String(def.min);
        input.max = String(def.max);
        input.step = String(def.step);
        input.setAttribute('aria-label', t(def.label));
        const val = el('div', 'val', '');
        input.addEventListener('input', () => { val.textContent = input.value; });
        input.addEventListener('change', () => {
          S.updateEffect(effect.id, { params: { [def.key]: Number(input.value) } });
        });
        row.append(input, val);
        fxParamsBox.appendChild(row);
        fxParamRows.set(def.key, { input, val });
      }
    }
    for (const def of defs) {
      const row = fxParamRows.get(def.key);
      if (!row) continue;
      const raw = (effect.params as Readonly<Record<string, unknown>> | undefined)?.[def.key];
      const value = typeof raw === 'number' && Number.isFinite(raw) ? raw : def.value;
      row.input.value = String(value);
      row.val.textContent = String(Math.round(value * 100) / 100);
    }
  }
  effectsGroup.body.appendChild(secFx);

  // === GLOBAL group ===
  const globalGroup = panelGroup('04', 'cinematics', t('studioPanel.panel.cinematics.title'), t('studioPanel.panel.cinematics.sub'));
  globalGroup.root.dataset.group = 'global'; // stable automation selector
  dock.appendChild(globalGroup.root);
  const secTime = section('storyboard', t('studioPanel.section.storyboard'), t('studioPanel.section.storyboardSub'));
  const duration = sliderRow(t('studioPanel.storyboard.lengthLabel'), 1, 20, 0.5, (v) => S.setStoryboardDuration(v * 1000));
  secTime.appendChild(duration.row);
  const ts = sliderRow(t('studioPanel.storyboard.speedLabel'), 0.25, 2, 0.05, (v) => S.setTimeScale(v));
  secTime.appendChild(ts.row);
  const timeRow = el('div', 'grid3');
  const restartBtn = el('button', null, t('studio.restart'));
  restartBtn.addEventListener('click', () => S.stop());
  const pauseBtn = el('button', null, t('studio.play'));
  pauseBtn.addEventListener('click', () => (S.playing ? S.pause() : S.play()));
  const stepBtn = el('button', null, t('studio.stepOneFrame'));
  stepBtn.addEventListener('click', () => { S.pause(); S.seek(S.fxTimeMs + 1000 / 30); });
  timeRow.append(restartBtn, pauseBtn, stepBtn);
  secTime.appendChild(timeRow);
  const clockLine = el('div', 'storyClock');
  const clockNow = el('span', null, t('studioPanel.storyboard.clockDefault'));
  const clockLimit = el('span', 'limit', t('studioPanel.storyboard.clockLimit'));
  clockLine.append(clockNow, clockLimit);
  secTime.appendChild(clockLine);
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
  secTime.appendChild(scrub);

  const timelineBoard = el('div', 'timelineBoard');
  function timelineLane(label: string): HTMLDivElement {
    const lane = el('div', 'tlane');
    lane.appendChild(el('div', 'lbl', label));
    const track = el('div', 'tltrack');
    track.addEventListener('pointerdown', (event) => {
      if (event.target !== track) return;
      const rect = track.getBoundingClientRect();
      S.seek(((event.clientX - rect.left) / Math.max(1, rect.width)) * S.durationMs);
    });
    lane.appendChild(track);
    timelineBoard.appendChild(lane);
    return track;
  }
  const cameraLane = timelineLane(t('studioPanel.timeline.laneCamera'));
  const actorLane = timelineLane(t('studioPanel.timeline.laneActors'));
  const effectLane = timelineLane(t('studioPanel.timeline.laneEffects'));
  secTime.appendChild(timelineBoard);

  const authorRow = el('div', 'grid');
  const addShotBtn = el('button', null, t('studio.addCameraShot'));
  addShotBtn.addEventListener('click', () => S.addCameraShot());
  const keyActorBtn = el('button', null, t('studio.keySelectedTank'));
  keyActorBtn.addEventListener('click', () => {
    const actor = S._internal.selected;
    if (!actor) { flashBusy(t('studio.selectTankFirst')); return; }
    S.keyActor(actor);
  });
  authorRow.append(addShotBtn, keyActorBtn);
  secTime.appendChild(authorRow);
  const railRow = el('div', 'grid');
  railRow.style.marginTop = '5px';
  const railBtn = el('button', null, t('studio.showCameraRail'));
  railBtn.addEventListener('click', () => S.setRailVisible(!S.railVisible));
  const clearTrackBtn = el('button', 'warn', t('studio.clearTankTrack'));
  clearTrackBtn.addEventListener('click', () => {
    const actor = S._internal.selected;
    if (!actor) { flashBusy(t('studio.selectTankFirst')); return; }
    S.clearActorTrack(actor);
  });
  railRow.append(railBtn, clearTrackBtn);
  secTime.appendChild(railRow);
  // the take from above: routes, the camera's track and its distance and height (studioPlanView.ts)
  const planView = createPlanView(S, t);
  let planShown = true;
  const planBtn = el('button', null, t('studioPanel.plan.hide'));
  planBtn.style.marginTop = '5px';
  planBtn.addEventListener('click', () => {
    planShown = !planShown;
    planView.root.hidden = !planShown;
    planBtn.textContent = planShown ? t('studioPanel.plan.hide') : t('studioPanel.plan.show');
    planBtn.classList.toggle('on', planShown);
    if (planShown) planView.refreshPlan();
  });
  planBtn.classList.add('on');
  secTime.append(planBtn, planView.root);
  const duelBtn = el('button', 'prime', t('studio.directDuel'));
  let duelVariant = 0;
  duelBtn.style.marginTop = '6px';
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
  secTime.appendChild(duelBtn);
  const shotboard = el('div', 'shotboard');
  secTime.appendChild(shotboard);
  const resetFxBtn = el('button', 'warn', t('studio.clearAllEffects'));
  resetFxBtn.style.cssText = 'width:100%;margin-top:2px;';
  resetFxBtn.addEventListener('click', () => S.clearEffects());
  secTime.appendChild(resetFxBtn);
  globalGroup.body.appendChild(secTime);

  // === CAMERA section ===
  const secCam = section('camera', t('studioPanel.section.camera'));
  const camModeRow = el('div', 'grid');
  const flyBtn = el('button', null, t('studio.freeFly'));
  const orbBtn = el('button', null, t('studio.orbit'));
  flyBtn.addEventListener('click', () => { S.setCamera({ mode: 'fly' }); api.refreshCamera(); });
  orbBtn.addEventListener('click', () => {
    const a = S._internal.selected;
    const m = S._internal.markerPos;
    const t = a ? a.state.pos : m;
    S.setCamera({ mode: 'orbit', lookAt: [t.x, t.y + 1.6, t.z] });
    api.refreshCamera();
  });
  camModeRow.append(flyBtn, orbBtn);
  secCam.appendChild(camModeRow);
  const fov = sliderRow('FOV', 15, 100, 1, (v) => S.setCamera({ fov: v }));
  const roll = sliderRow('Roll', -45, 45, 0.5, (v) => S.setCamera({ rollDeg: v }));
  const spd = sliderRow('Speed', 2, 60, 1, (v) => { S._internal.cam.speed = v; });
  secCam.append(fov.row, roll.row, spd.row);
  globalGroup.body.appendChild(secCam);
  const secPicture = section('picture', t('studioPanel.section.picture'), t('studioPanel.section.pictureSub'));
  const picturePanel = mountStudioPicturePanel(S, secPicture, {
    sliderRow, selectedActor: () => S._internal.selected, flash: (text) => flashBusy(text),
  });
  globalGroup.body.appendChild(secPicture);

  // === OUTPUT group ===
  const outputGroup = panelGroup('05', 'output', t('studioPanel.panel.output.title'), t('studioPanel.panel.output.sub'));
  dock.appendChild(outputGroup.root);
  const secCap = section('output', t('studioPanel.section.output'), t('studioPanel.section.outputSub'));
  // --- film: deterministic offline export (studioFilm*.ts) ----------------------
  secCap.appendChild(el('div', 'filmHead', t('studio.film.heading')));
  const filmSizeRow = el('div', 'row');
  const filmSize = document.createElement('select');
  for (const resolution of FILM_RESOLUTIONS) {
    const option = document.createElement('option');
    option.value = String(resolution);
    option.textContent = `${resolution}p`;
    filmSize.appendChild(option);
  }
  const filmFps = document.createElement('select');
  for (const fps of [24, 30, 60]) {
    const option = document.createElement('option');
    option.value = String(fps);
    option.textContent = t('studio.film.fpsOption', { fps });
    filmFps.appendChild(option);
  }
  filmSizeRow.append(el('label', 'k', t('studio.film.size')), filmSize, el('label', 'k', t('studio.film.rate')), filmFps);
  secCap.appendChild(filmSizeRow);
  const filmBlurRow = el('div', 'row');
  const filmBlur = document.createElement('select');
  for (const [key, samples] of [['studio.film.blurOff', 1], ['studio.film.blurDraft', 4], ['studio.film.blurGood', 8],
    ['studio.film.blurBest', 16], ['studio.film.blurMaster', 32]] as const) {
    const option = document.createElement('option');
    option.value = String(samples);
    option.textContent = t(key);
    filmBlur.appendChild(option);
  }
  filmBlur.value = '8';
  filmFps.value = '30';
  const filmShake = document.createElement('select');
  for (const [key, shake] of [['studio.film.shakeFull', 1], ['studio.film.shakeHalf', 0.5],
    ['studio.film.shakeQuarter', 0.25], ['studio.film.shakeOff', 0]] as const) {
    const option = document.createElement('option');
    option.value = String(shake);
    option.textContent = t(key);
    filmShake.appendChild(option);
  }
  filmShake.title = t('studio.film.shakeTitle');
  filmBlurRow.append(el('label', 'k', t('studio.film.blur')), filmBlur, el('label', 'k', t('studio.film.shake')), filmShake);
  secCap.appendChild(filmBlurRow);
  const filmSummary = el('div', 'recStatus', '');
  secCap.appendChild(filmSummary);
  const filmBtn = el('button', 'prime', t('studio.film.export'));
  secCap.appendChild(filmBtn);
  secCap.appendChild(el('div', 'filmHint', t('studio.film.hint')));
  // Authoring the export settings records them in the scene's `film` block.
  for (const control of [filmFps, filmBlur, filmShake]) {
    control.addEventListener('change', () => {
      try { S.setFilm({ fps: Number(filmFps.value), samples: Number(filmBlur.value), shake: Number(filmShake.value) }); } catch { /* exporting */ }
      updateFilmSummary();
    });
  }
  filmSize.addEventListener('change', () => updateFilmSummary());
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
  const veilCancel = el('button', 'warn', t('studio.film.cancel'));
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
  filmBtn.addEventListener('click', () => {
    if (S.filmExportStatus().active || S.recordingStatus().active) return;
    filmVeil.classList.add('on');
    veilFill.style.width = '0%';
    veilText.textContent = t('studio.film.preparing');
    veilCancel.focus();
    S.exportFilm({
      resolution: Number(filmSize.value),
      fps: Number(filmFps.value),
      samples: Number(filmBlur.value),
      shake: Number(filmShake.value),
      download: true,
      onProgress: showFilmProgress,
      onFrame: drawFilmPreview,
    })
      .then((result) => flashBusy(t('studio.film.saved', { size: (result.bytes / 1048576).toFixed(1) })))
      .catch((error: RuntimeValue) => flashBusy(error instanceof Error && error.name === 'AbortError'
        ? t('studio.film.cancelled')
        : t('studio.film.failed', { error: errorMessage(error) })))
      .finally(() => { filmVeil.classList.remove('on'); api.refreshStoryboard(); });
  });
  let filmSignature = '';
  function updateFilmSummary(): void {
    const film = S.getFilm();
    const signature = film ? `${film.fps}/${film.samples}/${film.shake}` : '';
    if (signature !== filmSignature) {
      filmSignature = signature;
      if (film) {
        filmFps.value = String(film.fps);
        if ([...filmBlur.options].some((option) => option.value === String(film.samples))) filmBlur.value = String(film.samples);
        if ([...filmShake.options].some((option) => option.value === String(film.shake))) filmShake.value = String(film.shake);
      }
    }
    const status = S.filmExportStatus();
    const busyOutput = status.active || S.recordingStatus().active;
    filmBtn.disabled = busyOutput || !status.supported;
    for (const control of [filmSize, filmFps, filmBlur, filmShake]) control.disabled = busyOutput;
    if (!status.supported) { filmSummary.textContent = t('studio.film.unsupported'); return; }
    try {
      const format = S.productionFormat;
      const { width, height } = filmOutputSize(format, Number(filmSize.value));
      const plan = createFilmPlan(normalizeFilm({ ...(film ?? {}), fps: Number(filmFps.value), samples: Number(filmBlur.value) }), 0, S.durationMs);
      filmSummary.textContent = t('studio.film.summary', {
        ratio: format === 'portrait' ? '9:16' : format === 'square' ? '1:1' : '16:9',
        width, height, seconds: (plan.map.durationMs / 1000).toFixed(1), frames: plan.frames,
      });
    } catch (error) {
      filmSummary.textContent = errorMessage(error);
    }
  }
  secCap.appendChild(el('div', 'filmHead live', t('studio.film.liveHeading')));
  const videoRow = el('div', 'row');
  videoRow.appendChild(el('label', 'k', 'Video'));
  const fpsSel = document.createElement('select');
  for (const [label, fps] of [['60 FPS · 12 Mbps', 60], ['30 FPS · 12 Mbps', 30]] as const) {
    const option = document.createElement('option');
    option.value = String(fps);
    option.textContent = label;
    fpsSel.appendChild(option);
  }
  videoRow.appendChild(fpsSel);
  secCap.appendChild(videoRow);
  const recordBtn = el('button', 'prime', t('studio.recordVideo'));
  recordBtn.addEventListener('click', () => {
    if (S.recordingStatus().active) {
      S.stopRecording();
      return;
    }
    S.recordVideo({ fps: Number(fpsSel.value), download: true })
      .then((result) => flashBusy(t('studio.videoSaved', { size: (result.size / 1048576).toFixed(1) })))
      .catch((error: RuntimeValue) => flashBusy(t('studio.recordFailed', { error: errorMessage(error) })));
    api.refreshStoryboard();
  });
  secCap.appendChild(recordBtn);
  const recStatus = el('div', 'recStatus', t('studio.recordReady'));
  secCap.appendChild(recStatus);
  const capRow = el('div', 'row');
  capRow.style.marginTop = '8px';
  capRow.appendChild(el('label', 'k', 'Width'));
  const capSel = document.createElement('select');
  for (const [label, w] of [
    ['2560 px', 2560],
    ['3200 px', 3200],
    ['3840 px', 3840],
    ['5120 px', 5120],
  ] as const) {
    const o = document.createElement('option');
    o.value = String(w);
    o.textContent = label;
    capSel.appendChild(o);
  }
  capRow.appendChild(capSel);
  secCap.appendChild(capRow);
  const capBtn = el('button', null, t('studio.capturePng'));
  capBtn.style.width = '100%';
  capBtn.addEventListener('click', () => {
    S.capture({ width: parseInt(capSel.value, 10), download: true });
  });
  secCap.appendChild(capBtn);
  const svRow = el('div', 'grid3');
  svRow.style.marginTop = '6px';
  const saveBtn = el('button', null, t('studio.saveJson'));
  saveBtn.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(S.state(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `studio_scene_${S.mapId || 'map'}_${Date.now()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  });
  const loadBtn = el('button', null, t('studio.loadJson'));
  const fileIn = document.createElement('input');
  fileIn.type = 'file';
  fileIn.accept = 'application/json,.json';
  fileIn.style.display = 'none';
  fileIn.addEventListener('change', () => {
    const f = fileIn.files && fileIn.files[0];
    if (!f) return;
    f.text().then((txt) => S.load(JSON.parse(txt)))
      .catch((error: RuntimeValue) => flashBusy(t('studio.loadFailed', { error: errorMessage(error) })));
    fileIn.value = '';
  });
  loadBtn.addEventListener('click', () => fileIn.click());
  const copyBtn = el('button', null, t('studio.copyJson'));
  copyBtn.addEventListener('click', () => {
    const txt = JSON.stringify(S.state());
    if (navigator.clipboard) navigator.clipboard.writeText(txt).catch(() => {});
    flashBusy(t('studio.sceneJsonCopied'));
  });
  svRow.append(saveBtn, loadBtn, copyBtn);
  secCap.append(svRow, fileIn);
  // localStorage slots
  const slotRow = el('div', 'grid3');
  slotRow.style.marginTop = '5px';
  for (let i = 1; i <= 3; i++) {
    const b = el('button', null, t('studio.slot', { n: i }));
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
  secCap.appendChild(slotRow);
  outputGroup.body.appendChild(secCap);

  const secArchive = section('productionArchive', t('studioPanel.section.productionArchive'), t('studioPanel.section.productionArchiveSub'));
  const archiveCopy = el('div', 'fxempty', t('studioPanel.archive.copy'));
  const archiveBtn = el('button', null, t('studioPanel.archive.button'));
  archiveBtn.style.width = '100%';
  archiveBtn.addEventListener('click', () => {
    let dialog = document.querySelector<HTMLDialogElement>('.cot-studio-archive');
    if (!dialog) {
      dialog = document.createElement('dialog');
      dialog.className = 'cot-studio-archive';
      dialog.innerHTML = `<header><div><small>${t('studioPanel.fieldFramesEyebrow')}</small><strong>${t('studioPanel.fieldFrames')}</strong><span>${t('studioPanel.fieldFramesSub')}</span></div><button type="button" aria-label="${t('studioPanel.closeArchive')}">×</button></header><div class="archiveBody" data-media-archive></div>`;
      const createdDialog = dialog;
      createdDialog.querySelector<HTMLButtonElement>('button')?.addEventListener(
        'click',
        () => createdDialog.close(),
      );
      createdDialog.addEventListener('click', (event) => {
        if (event.target === createdDialog) createdDialog.close();
      });
      document.body.appendChild(dialog);
    }
    dialog.showModal();
    const archiveRoot = dialog.querySelector<HTMLElement>('[data-media-archive]');
    if (!archiveRoot) throw new Error('[studio] missing production archive root');
    mountMediaArchive(archiveRoot, { mode: 'compact', limit: 61 })
      .catch((error: RuntimeValue) => flashBusy(errorMessage(error)));
  });
  secArchive.append(archiveCopy, archiveBtn);
  outputGroup.body.appendChild(secArchive);

  const productionPanel = mountStudioProductionPanel(S, root, dock, () => api.refreshAll());

  // --- footer hints ------------------------------------------------------------
  const foot = el('div', 'foot');
  const footCam = el('div', 'cam', '');
  const footHint = el('div', null, t('studioPanel.footer.controls'));
  foot.append(footCam, footHint);
  root.appendChild(foot);

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

  function section(infoId: StudioSectionInfoId, title: string, sub = ''): HTMLDivElement {
    const s = el('div', 'sec');
    const h = el('div', 'h', title);
    if (sub) h.appendChild(el('span', 'sub', sub));
    const helpKey = STUDIO_SECTION_INFO_KEYS[infoId];
    if (helpKey) h.appendChild(createInfoButton({
      label: t('studioPanel.info.about', { title }),
      title,
      text: t(helpKey),
      json: infoId === 'output' ? () => S.state() : null,
      guide: STUDIO_GUIDES[infoId],
    }));
    s.appendChild(h);
    return s;
  }
  function panelGroup(index: string, infoId: StudioGroupInfoId, title: string, sub: string): PanelGroup {
    const groupRoot = el('section', 'pgroup');
    groupRoot.dataset.group = infoId;
    const head = el('div', 'ghead');
    head.append(
      el('span', 'gnum', index),
      el('div', 'gtitle', title),
      el('div', 'gsub', sub),
    );
    const helpKey = STUDIO_GROUP_INFO_KEYS[infoId];
    if (helpKey) head.appendChild(createInfoButton({
      label: t('studioPanel.info.about', { title }),
      title,
      text: t(helpKey),
      guide: STUDIO_GUIDES[infoId],
    }));
    const body = el('div', 'gbody');
    groupRoot.append(head, body);
    return { root: groupRoot, body };
  }
  function sliderRow(
    label: string,
    min: number,
    max: number,
    step: number,
    onInput: (value: number) => void,
  ): SliderControl {
    const row = el('div', 'row');
    row.appendChild(el('label', 'k', label));
    const r = document.createElement('input');
    r.type = 'range';
    r.min = String(min);
    r.max = String(max);
    r.step = String(step);
    const val = el('div', 'val', '');
    r.addEventListener('input', () => {
      val.textContent = r.value;
      onInput(parseFloat(r.value));
    });
    row.append(r, val);
    return {
      row, input: r,
      set(value: number) {
        r.value = String(value);
        val.textContent = String(Math.round(value * 10) / 10);
      },
      setRange(rangeMin: number, rangeMax: number) {
        r.min = String(rangeMin);
        r.max = String(rangeMax);
      },
    };
  }
  function numInput(onChange: (value: number) => void): HTMLInputElement {
    const n = document.createElement('input');
    n.type = 'number';
    n.step = '1';
    n.addEventListener('change', () => onChange(parseFloat(n.value) || 0));
    return n;
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
  /** amber/red tinting class for an actor row by damage state */
  function stateClass(name: StudioActorState): string {
    if (name === 'engine-smoking') return ' st-warn';
    if (name === 'burning' || name === 'wrecked' || name === 'wrecked-burnt'
      || name === 'turret-popped') return ' st-bad';
    return '';
  }

  function effectAnchorLabel(effect: StudioEffect): string {
    if (effect.actor != null) return `ACTOR ${String(effect.actor)}`;
    if (effect.from && effect.to) return 'FLIGHT PATH';
    if (effect.at) return `POINT ${effect.at.map((v) => Number(v).toFixed(1)).join(' / ')}`;
    return 'MAP MARKER';
  }

  function rebuildEffectList() {
    fxStack.textContent = '';
    const effects = S.listEffects();
    rebuildFxParams(effects);
    refreshCinematicToggles();
    if (!effects.length) {
      fxStack.appendChild(el('div', 'fxempty', t('studioPanel.fx.empty')));
      return;
    }
    for (const effect of effects) {
      const row = el('div', 'fxrow' + (effect.selected ? ' sel' : ''));
      row.tabIndex = 0;
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', String(effect.selected));
      row.dataset.effectId = effect.id;
      row.appendChild(el('span', 'pip'));
      const names = el('div', 'fn');
      names.append(
        el('div', 'n1', effect.type.replaceAll('_', ' ')),
        el('div', 'n2', `${effectAnchorLabel(effect)} · T ${(effect.tMs / 1000).toFixed(2)} S`),
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
      time.setAttribute('aria-label', t('studioPanel.effects.timeAria', { type: effect.type.replaceAll('_', ' ') }));
      time.addEventListener('pointerdown', (event) => event.stopPropagation());
      time.addEventListener('click', (event) => event.stopPropagation());
      time.addEventListener('change', (event) => {
        event.stopPropagation();
        S.updateEffect(effect.id, { tMs: Number(time.value) * 1000 });
      });
      row.appendChild(time);
      const del = el('button', 'del warn', '✕');
      del.title = t('studioPanel.effects.deleteTitle', { type: effect.type.replaceAll('_', ' ') });
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
    }
  }

  function addTimelineMarker(
    track: HTMLElement,
    className: string,
    timeMs: number,
    title: string,
    onClick: () => void,
    selected = false,
  ): void {
    const marker = el('button', `tlmarker ${className}${selected ? ' sel' : ''}`);
    marker.type = 'button';
    marker.style.left = `${Math.max(0, Math.min(100, (timeMs / Math.max(1, S.durationMs)) * 100))}%`;
    marker.title = title;
    marker.setAttribute('aria-label', title);
    marker.addEventListener('click', (event) => {
      event.stopPropagation();
      onClick();
    });
    track.appendChild(marker);
  }

  function addPlayhead(track: HTMLElement): void {
    const playhead = el('div', 'playhead');
    playhead.style.left = `${Math.max(0, Math.min(100, (S.fxTimeMs / Math.max(1, S.durationMs)) * 100))}%`;
    track.appendChild(playhead);
  }

  function rebuildStoryboard() {
    const board = S.getStoryboard();
    cameraLane.textContent = '';
    actorLane.textContent = '';
    effectLane.textContent = '';
    shotboard.querySelectorAll<InfoButton>('.cot-info-trigger')
      .forEach((button) => button.disposeInfo?.());
    shotboard.textContent = '';
    board.shots.forEach((shot, index) => {
      addTimelineMarker(
        cameraLane,
        'camera',
        shot.tMs,
        t('studioPanel.shot.timelineMarkerTitle', { label: shot.label, t: (shot.tMs / 1000).toFixed(2) }),
        () => S.selectCameraShot(shot.id),
        shot.id === S.selectedShotId,
      );
      const card = el('div', `shotcard${shot.id === S.selectedShotId ? ' sel' : ''}`);
      card.appendChild(el('div', 'num', String(index + 1).padStart(2, '0')));
      const copy = el('div', 'copy');
      copy.append(
        el('div', 'name', shot.label),
        el('div', 'time', `${(shot.tMs / 1000).toFixed(2)} S · FOV ${Math.round(shot.fov)}`),
      );
      copy.addEventListener('click', () => S.selectCameraShot(shot.id));
      card.appendChild(copy);
      const transition = document.createElement('select');
      transition.setAttribute('aria-label', t('studioPanel.shot.transitionAria', { label: shot.label }));
      for (const id of ['smooth', 'linear', 'cut', 'bezier', 'spline']) {
        const option = document.createElement('option');
        option.value = id;
        option.textContent = id.toUpperCase();
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
      const del = el('button', 'del warn', '✕');
      del.title = t('studioPanel.shot.removeTitle', { label: shot.label });
      del.setAttribute('aria-label', del.title);
      del.addEventListener('click', () => S.removeCameraShot(shot.id));
      card.appendChild(del);
      shotboard.appendChild(card);
    });
    for (const track of board.actorTracks) {
      for (const key of track.keys) {
        addTimelineMarker(
          actorLane,
          'actor',
          key.tMs,
          `${track.actor} pose at ${(key.tMs / 1000).toFixed(2)} seconds`,
          () => S.seek(key.tMs),
        );
      }
    }
    for (const effect of S.listEffects()) {
      addTimelineMarker(
        effectLane,
        'fx',
        effect.tMs,
        `${effect.type.replaceAll('_', ' ')} at ${(effect.tMs / 1000).toFixed(2)} seconds`,
        () => { S.selectEffect(effect.id); S.seek(effect.tMs); },
        effect.selected,
      );
    }
    addPlayhead(cameraLane);
    addPlayhead(actorLane);
    addPlayhead(effectLane);
    if (!board.shots.length) {
      shotboard.appendChild(el('div', 'fxempty', t('studioPanel.storyboard.empty')));
    }
  }

  // --- public panel API -------------------------------------------------------
  let refreshAcc = 0, planAcc = 0;
  const api: StudioPanelRuntime = {
    root,
    show() { root.style.display = 'block'; productionPanel.setVisible(true); api.refreshAll(); },
    hide() { root.style.display = 'none'; productionPanel.setVisible(false); togglePick(false); toggleMapPick(false); },
    setBusy(text) {
      busy.style.display = text ? 'block' : 'none';
      if (text) busy.textContent = text;
    },
    setPlaceArmed(specId) {
      placeBtn.classList.toggle('on', !!specId);
      placeBtn.textContent = specId
        ? t('studio.clickMapToPlace', { spec: specId.toUpperCase() })
        : t('studio.clickToPlace');
    },
    setSelected(_actor) {
      api.refreshActors();
      api.refreshStoryboard();
    },
    setSelectedEffect(_effect) {
      api.refreshEffects();
    },
    refreshActors() {
      alist.textContent = '';
      const sel = S._internal.selected;
      S._internal.actors.forEach((a) => {
        const row = el('div', 'arow' + (a === sel ? ' sel' : '') + stateClass(a.stateName));
        row.appendChild(tankIcon(a.spec.id));
        row.appendChild(el('div', 'nm', `${a.name ? a.name + ' · ' : ''}${a.spec.name}`));
        row.appendChild(el('div', 'st', a.stateName));
        const del = el('button', 'del', '✕');
        del.addEventListener('click', (e) => { e.stopPropagation(); S.removeActor(a); });
        row.appendChild(del);
        row.addEventListener('click', () => S.selectActor(a.uid));
        alist.appendChild(row);
      });
      api.refreshSelected();
      if (planShown) planView.refreshPlan();
    },
    refreshSelected() {
      const a = S._internal.selected;
      secSel.style.opacity = a ? '1' : '0.35';
      if (!a) {
        selN1.textContent = t('studioPanel.emptySelected');
        selN2.textContent = t('studioPanel.emptySelectedSub');
        selIcon.style.visibility = 'hidden';
        return;
      }
      selIcon.style.visibility = 'visible';
      const u = `url(${iconUrl(a.spec.id, 'side_silhouette')})`;
      selIcon.style.webkitMaskImage = u;
      selIcon.style.maskImage = u;
      selN1.textContent = a.spec.name;
      selN2.textContent = `${a.name ? a.name + ' · ' : ''}${a.uid} · ${a.stateName}`;
      gun.setRange(-(a.spec.gunDepressionDeg ?? 10), a.spec.gunElevationDeg ?? 20);
      facing.set(a.pose.facingDeg);
      turret.set(a.pose.turretDeg);
      gun.set(a.pose.gunDeg);
      px.value = String(Math.round(a.pose.x * 10) / 10);
      pz.value = String(Math.round(a.pose.z * 10) / 10);
      camoSel.value = a.camo || 'inherit';
      stateSel.value = a.stateName;
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
      flyBtn.classList.toggle('on', c.mode === 'fly');
      orbBtn.classList.toggle('on', c.mode === 'orbit');
    },
    refreshTime() {
      productionPanel.refresh();
      const scale = S.timeScale;
      if (scale > 0 && Number(ts.input.value) !== scale) ts.set(scale);
      const pauseLabel = scale === 0 ? t('studio.play') : t('studio.pause');
      if (pauseBtn.textContent !== pauseLabel) pauseBtn.textContent = pauseLabel;
      pauseBtn.classList.toggle('on', S.timeScale === 0);
      const seconds = S.durationMs / 1000;
      if (Number(duration.input.value) !== seconds) duration.set(seconds);
      scrub.max = String(S.durationMs);
      if (document.activeElement !== scrub) scrub.value = String(S.fxTimeMs);
      const text = `${(S.fxTimeMs / 1000).toFixed(2)} / ${seconds.toFixed(2)} S`;
      if (clockNow.textContent !== text) clockNow.textContent = text;
      const left = `${Math.max(0, Math.min(100, (S.fxTimeMs / Math.max(1, S.durationMs)) * 100))}%`;
      for (const playhead of timelineBoard.querySelectorAll<HTMLElement>('.playhead')) {
        playhead.style.left = left;
      }
      if (planShown && !S.playing) planView.refreshTime();
      const rec = S.recordingStatus();
      recordBtn.textContent = rec.active ? t('studio.stopRecording') : t('studio.recordVideo');
      recordBtn.classList.toggle('on', rec.active);
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
    },
    refreshStoryboard() {
      const isRecording = S.recordingStatus().active;
      railBtn.classList.toggle('on', S.railVisible);
      railBtn.textContent = S.railVisible ? t('studio.hideCameraRail') : t('studio.showCameraRail');
      duration.input.disabled = isRecording;
      scrub.disabled = isRecording;
      restartBtn.disabled = isRecording;
      pauseBtn.disabled = isRecording;
      stepBtn.disabled = isRecording;
      addShotBtn.disabled = isRecording;
      keyActorBtn.disabled = isRecording || !S._internal.selected;
      clearTrackBtn.disabled = isRecording || !S._internal.selected;
      duelBtn.disabled = isRecording || S._internal.actors.length < 2;
      railBtn.disabled = isRecording;
      timeSelect.disabled = isRecording;
      rebuildStoryboard();
      updateFilmSummary();
      if (planShown) planView.refreshPlan();
      api.refreshTime();
    },
    refreshMap() {
      timeSelect.value = S.timeOfDay;
      refreshSun();
      const id = S.mapId;
      badgeMap.textContent = id ? id.toUpperCase() : '';
      if (!id) return;
      const info = S.getMapInfo ? S.getMapInfo(id) : { name: id };
      mapHero.src = imageFor(MAP_HEROES, id) || imageFor(MAP_THUMBS, id) || '';
      mapName.textContent = info.name || id;
      mapId.textContent = id.toUpperCase();
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
    },
    tick(dt) {
      refreshAcc += dt;
      planAcc += dt;
      // the plan follows the playhead at ~15 fps while the take plays
      if (planShown && S.playing && planAcc >= 1 / 15) { planAcc = 0; planView.refreshTime(); }
      if (refreshAcc < 0.25) return;
      refreshAcc = 0;
      const c = S.getCamera();
      footCam.textContent =
        `CAM ${c.pos.map((v) => v.toFixed(1)).join(', ')}  ·  yaw ${c.yawDeg.toFixed(1)}°  ` +
        `pitch ${c.pitchDeg.toFixed(1)}°  ·  fov ${c.fov.toFixed(0)}  ·  T ${(S.fxTimeMs / 1000).toFixed(2)}s`;
      refreshSunCamera();
      api.refreshTime();
    },
  };
  return api;
}
