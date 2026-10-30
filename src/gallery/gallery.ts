import type { DamageLab, DamageLabVisual } from './damageLab.ts';
import type { InActionBlock } from './inAction.ts';
import type { AnatomyHost, AnatomyMode, AnatomyToggle, AnatomyView, AnatomyVehicle } from './anatomyView.ts';
import type { ArmorMetric } from './anatomyPalette.ts';
import { createDamageWorkbench } from './damageWorkbench.ts';
import { createDamageBurst } from './damageBurst.ts';
import { minimumMechanicalGunPitch } from '../sim/gunPitchLimits.ts';
import type { RuntimeValue } from '../runtimeTypes.ts';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { pinchRestoresPage } from '../ui/pinchZoomGuard.ts';
import { createTank, createTankSteps, ensureTankBuilder, offThreadDecorPlanner, type CreateTankOptions } from '../vehicles/fleetFactory.ts';
import { linkTankId, stampTankIdLink } from '../game/tankIdBoundaries.ts';
import { testDriveHref } from '../game/testDriveLink.ts';
import { hrefForLocale } from '../ui/localeRouting.ts';
import { migrateStoredTankIds } from '../game/tankIdStorageMigration.ts';
import { VISIBLE_TANK_IDS, getSpec } from '../vehicles/specs.ts';
import { tankLabelRecord } from '../vehicles/tankLabels.ts';
import { buildGalleryRecords, filterGalleryRecords, serializeGallerySpec } from './catalog.ts';
import type { GalleryRecord, GalleryVehicleSpec } from './catalog.ts';
import type { HeroManifest } from '../ui/heroCard.ts';
import type { TechnicalLabelData } from '../ui/technicalDiagramLabels.ts';
import { compareVehicleEras, isPostwarVehicleEra, VEHICLE_ERAS } from '../vehicles/taxonomy.ts';
import {
  CONCEPT_PROTOTYPE_FILTER_META,
  VEHICLE_BATTLE_ROLE_META,
  VEHICLE_BATTLE_ROLE_ORDER,
  vehicleFacetLabel,
} from '../vehicles/vehicleFacets.ts';
import { classFacetsMarkup, facetButton, flagLabel as flagLabelOf, fleetClasses, nationFacetsMarkup, nationFlags } from './galleryFacets.ts';
import {
  createSurfaceMarkup,
  MARKUP_OPERATIONS,
  type SurfaceInspectionInfo,
} from './surfaceMarkup.ts';
import { flagIconUrl } from '../ui/flags.ts';
import { flagIconCode } from '../ui/flagCodes.ts';
import { iconUrl, tankThumbUrl } from '../ui/icons.ts';
import { icon, type IconId } from '../ui/icons/icon.ts';
import { shellIconId } from '../ui/shellIcons.ts';
import { emptyState, esc, scale20, scaleCells, segmented, statRow, tabs, wireRoving } from '../ui/components/components.ts';
import { createPickerMenu, panelRoom, type PickerMenu } from '../ui/components/pickerMenu.ts';
import { closeSurface, openSurface, type TransientSurface } from '../ui/components/surfaceStack.ts';
import { markLoadFailed, pressFailed } from '../ui/components/loadFailure.ts';
import { pickerText } from '../ui/pickerText.ts';
import type { NoticeSeverity } from '../ui/components/notice.ts';
import { flag, silhouette } from '../ui/components/identity.ts';
import { revealWhenReady } from '../ui/components/reveal.ts';
import { drawTrueScale } from './trueScale.ts';
import { t, getLocale, formatNumber } from '../ui/i18n.ts';
import { bindStaticI18nAuto } from '../presentation/staticI18n.ts';
import { applyGalleryCameraRange, fitGalleryDepth, galleryFitDistance, resizeGalleryCamera } from './cameraFit.ts';

type GalleryMode = 'appearance' | AnatomyMode | 'markup';
const GALLERY_MODES: readonly GalleryMode[] = ['appearance', 'armor', 'modules', 'crew', 'markup'];
const ANATOMY_MODES: readonly GalleryMode[] = ['armor', 'modules', 'crew'];
const isAnatomyMode = (mode: GalleryMode): mode is AnatomyMode => ANATOMY_MODES.includes(mode);
type GalleryView = 'hero' | 'front' | 'left' | 'right' | 'rear' | 'top'
  | 'elevated-left' | 'elevated-right';

interface GalleryVisual extends DamageLabVisual {
  root: THREE.Group;
  dispose(): void;
  centerOnPresentationPoint?(x: number, z: number): void;
  seatOnFloor?(floorY: number): void;
  presentationAnchorWorld?(target: THREE.Vector3): RuntimeValue;
}

interface GalleryLoadOptions {
  view?: string;
  mode?: string;
}

declare global {
  interface Window {
    __TANK_GALLERY_READY?: boolean;
    __TANK_GALLERY?: Record<string, RuntimeValue>;
  }
}

// Saved camouflage keys follow the id renames before any tank is painted (SSOT 2.19).
migrateStoredTankIds((() => { try { return globalThis.localStorage; } catch { return null; } })());

const $ = <T extends HTMLElement = HTMLInputElement>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing Tank Gallery element: ${selector}`);
  return element;
};

/** Per-viewer conveniences (sort, layout, peer scale, favourites); blocked storage leaves the defaults. */
const STORE_KEY = 'cot.gallery.v2';
interface StoredPrefs { sort?: string; descending?: boolean; layout?: 'list' | 'grid'; peer?: 'fleet' | 'class'; favourites?: string[] }
function readPrefs(): StoredPrefs {
  try { return JSON.parse(globalThis.localStorage?.getItem(STORE_KEY) || '{}') as StoredPrefs; } catch { return {}; }
}
function writePrefs(): void {
  try {
    globalThis.localStorage?.setItem(STORE_KEY, JSON.stringify({
      sort: browse.sort, descending: browse.descending, layout: browse.layout, peer: peerScale, favourites: [...favourites],
    }));
  } catch { /* storage may be blocked */ }
}

bindStaticI18nAuto();
const viewport = $<HTMLElement>('#viewport');
const vehicleList = $<HTMLElement>('#vehicleList');
const loadingState = $<HTMLElement>('#loadingState');
const loadingSilhouette = $<HTMLElement>('#loadingSil');
const takeMedia = $<HTMLElement>('#takeMedia');
// the layers are the kit's segmented control, each with its key (1 to 5) and its glyph (the 261 census: a hand-built dock)
const LAYER_GLYPHS: Readonly<Record<GalleryMode, IconId>> = { appearance: 'vehicle', armor: 'layerArmor', modules: 'layerXray', crew: 'team', markup: 'layerMarkup' };
{
  const dock = document.createElement('template');
  dock.innerHTML = segmented({ label: t('gallery.view.modeDockAria'), className: 'layers', value: 'appearance',
    options: GALLERY_MODES.map((mode, index) => ({ value: mode, label: t(`gallery.view.mode.${mode}`), icon: LAYER_GLYPHS[mode], key: String(index + 1) })) });
  $('#layerDock').replaceWith(dock.content);
}
const layerDock = $<HTMLElement>('.layers');
const modeButtons = [...layerDock.querySelectorAll<HTMLButtonElement>('[data-value]')];
const viewLabelKey: Record<string, string> = {
  hero: 'gallery.view.view.hero',
  front: 'gallery.view.view.front',
  left: 'gallery.view.view.left',
  right: 'gallery.view.view.right',
  rear: 'gallery.view.view.rear',
  top: 'gallery.view.view.top',
  'elevated-left': 'gallery.view.view.elevatedLeft',
  'elevated-right': 'gallery.view.view.elevatedRight',
};
// the camera's eight framings are the kit's picker menu (261 census: a hand-built column of eight)
const viewMenu = createPickerMenu($<HTMLElement>('.views'), {
  id: 'gallery-camera-view', label: t('gallery.viewer.viewControlsAria'), value: 'hero', layout: 'list', text: pickerText(),
  items: Object.keys(viewLabelKey).map((name) => ({ id: name, name: t(viewLabelKey[name]) })),
  onChoose: (item) => frameView(item.id),
});

const records = buildGalleryRecords(
  VISIBLE_TANK_IDS.map((id) => getSpec(id) as GalleryVehicleSpec),
);
const recordById = new Map(records.map((record) => [record.id, record]));

/* ------------------------------------------------------------------------------------------------ the 3D stage */

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true,
  powerPreference: 'high-performance',
  preserveDrawingBuffer: true,
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
renderer.setClearColor(0x0a0d10, 0);
viewport.prepend(renderer.domElement);

const scene = new THREE.Scene();
const galleryFog = new THREE.Fog(0x0a0d10, 18, 45);
scene.fog = galleryFog;
const camera = new THREE.PerspectiveCamera(34, 1, 0.05, 180);
camera.position.set(-8, 4.6, 8.5);
// A pinch over the viewer is the orbit's dolly (OrbitControls cancels the ctrl+wheel). Once the page itself is
// pinch-zoomed in, the zoom-out half of a pinch is the page's (2026-10-16): this capture listener, registered before
// OrbitControls' own, keeps that wheel from the controls so the browser un-zooms over the canvas too.
renderer.domElement.addEventListener('wheel', (event) => {
  if (pinchRestoresPage(event)) event.stopImmediatePropagation();
}, { capture: true, passive: true });
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.075;
controls.minDistance = 2.2;
controls.maxDistance = 38;
controls.target.set(0, 1.3, 0);
controls.update();

// Lookdev (brand-ui SPEC 12.5): a neutral key, fill and rim over a plain plinth; the sci-fi grid, neon rings and the
// teal rim are retired.
scene.add(new THREE.HemisphereLight(0xdbe2e6, 0x25221d, 1.55));
const keyLight = new THREE.DirectionalLight(0xffe2bb, 3.15);
keyLight.position.set(-9, 13, 11);
scene.add(keyLight);
const rimLight = new THREE.DirectionalLight(0xc9d3da, 1.6);
rimLight.position.set(10, 7, -8);
scene.add(rimLight);
const fillLight = new THREE.DirectionalLight(0x8ea2b0, 0.95);
fillLight.position.set(0, 4, 10);
scene.add(fillLight);

const GALLERY_FLOOR_Y_M = -0.025;
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(13, 96),
  new THREE.MeshStandardMaterial({ color: 0x101418, roughness: 0.95, metalness: 0.08 }),
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = GALLERY_FLOOR_Y_M;
scene.add(ground);

const engineCtx = {
  setupShadowMaterial: (material: THREE.Material): THREE.Material => material,
  anisotropy: 1,
  renderer,
};
const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2();
const currentBounds = new THREE.Box3();
// The specimen's posed bounds, padded for the damage lab's loose parts: the near plane's nearest specimen (fitGalleryDepth).
const stageBounds = new THREE.Box3();
const STAGE_DEPTH_MARGIN_M = .5;
const currentCenter = new THREE.Vector3();
const viewDirection = new THREE.Vector3();
const presentationCenter = new THREE.Vector3();

let visual: GalleryVisual | null = null;
let damageLab: DamageLab | null = null;
const damageBurst = createDamageBurst(scene);
const damagePoint = new THREE.Vector3();
const damageEnd = new THREE.Vector3();
let selectedId: string | null = null;
let activeMode: GalleryMode = 'appearance';
let activeView: GalleryView = 'hero';
let pointerStart: { x: number; y: number } | null = null;
let loadVersion = 0;
let announceTimer: ReturnType<typeof setTimeout> | undefined;
let dossierShownId = '';

const damageHost = document.createElement('div');
damageHost.className = 'damage-workbench-host';
$('#dossier-damage').append(damageHost);
const damageWorkbench = createDamageWorkbench(damageHost, {
  select(target) {
    setMode(target.plate ? 'armor' : target.kind === 'crew' ? 'crew' : 'modules', false);
    emphasizeDamageTarget();
  },
  change(action) {
    if (action === 'detonate' && damageLab && anatomyView?.plateCenterWorld(damageLab.selected.slice(6), damagePoint)) {
      damageBurst.play(damagePoint);
    }
    for (const id of ['hullYaw', 'turretYaw', 'gunPitch']) $("#" + id).disabled = !!damageLab?.combat.destroyed;
    if (action === 'reset') { damageBurst.clear(); updateArticulation(); }
    setMode(activeMode, false);
    emphasizeDamageTarget();
    viewport.classList.toggle('is-probing', damageWorkbench.probe);
  },
  overlay() {
    if (!isAnatomyMode(activeMode) || activeMode === 'armor') setMode('modules', false);
    else setMode(activeMode, false);
    void anatomyReady.then(() => anatomyView?.setToggle('hits', damageWorkbench.hitboxes));
  },
  copy() { if (damageLab) writeClipboard(JSON.stringify({ vehicleId: selectedId, ...damageLab.snapshot() }, null, 2), t('gallery.damage.copied')); },
});
// The damage lab is the gallery's heaviest graph — the sim's damage, movement and armour and the auxiliary weapons table,
// about 495 kB raw in 9 requests (main 395305d45) — so it loads after the first tank is on screen (2026-10-07, push 3b:
// the owner's load-time priority). The Damage lab tab holds a placeholder of its size while the module takes more than
// 200 ms; a failed load is retried by the next tank load.
type DamageLabModule = typeof import('./damageLab.ts');
let damageLabModule: Promise<DamageLabModule> | null = null;
function loadDamageLab(): Promise<DamageLabModule> {
  if (damageLabModule) return damageLabModule;
  const pending = document.createElement('div');
  pending.className = 'damage-workbench';
  pending.setAttribute('aria-busy', 'true');
  const slow = setTimeout(() => damageHost.append(pending), 200);
  damageLabModule = import('./damageLab.ts').then(
    (module) => { clearTimeout(slow); pending.remove(); return module; },
    (error: unknown) => { clearTimeout(slow); pending.remove(); damageLabModule = null; throw error; },
  );
  return damageLabModule;
}
// The take (owner 2026-10-12, brand-ui SPEC 12.5): the selected vehicle's own newest take is the dossier's hero media.
// Its module and the fleet index load once the first tank is on screen; until then, and for a vehicle the index lacks,
// the frame keeps the vehicle's hero card.
let inAction: InActionBlock | null = null;
let inActionLoad: Promise<void> | null = null;
let takeIds: ReadonlySet<string> | null = null;
function showInAction(id: string): void {
  if (inAction) { inAction.show(id); return; }
  inActionLoad ??= import('./inAction.ts').then(
    ({ mountInAction }) => {
      inAction = mountInAction(takeMedia, $<HTMLElement>('#takeActions'));
      void inAction.ids.then((ids) => { takeIds = ids; renderFacets(); });
    },
    () => { inActionLoad = null; },
  );
  void inActionLoad.then(() => { if (selectedId === id) inAction?.show(id); });
}
function damageTargetKey(key: string | null): string {
  if (!key || !damageLab) return '';
  return damageLab.targets.some(target => target.key === key) ? key : '';
}
function emphasizeDamageTarget(): void {
  void anatomyReady.then(() => { if (damageLab?.selected) anatomyView?.select(damageLab.selected); });
}
function colorDamageOverlay(): void {
  if (!damageLab || !anatomyView) return;
  const lab = damageLab;
  anatomyView.setStates((pick) => {
    const key = pick.kind === 'module' ? `module:${pick.part.module}` : pick.kind === 'crew' ? `crew:${pick.station.crew}` : '';
    const target = lab.targets.find(part => part.key === key);
    return target ? lab.condition(target) : 'ok';
  });
}

// Anatomy layers (Armor, Modules, Crew) draw real models from the combat armor model. The view and its builders load
// through import() the first time one of them opens, so the Gallery's first load and the game boot graph stay as they
// were; the scene is built once per vehicle and specimen state and kept while the layers switch.
type AnatomyModule = typeof import('./anatomyView.ts');
let anatomyModule: Promise<AnatomyModule> | null = null;
let anatomyView: AnatomyView | null = null;
let anatomyReady: Promise<void> = Promise.resolve();
let armorMetric: ArmorMetric = 'ke';
function loadAnatomy(): Promise<AnatomyModule> {
  anatomyModule ??= import('./anatomyView.ts');
  return anatomyModule;
}
const anatomyHost = (): AnatomyHost => ({
  renderer, scene, camera, viewport,
  console: $<HTMLElement>('.viewer-bottom-console'),
  legend: $<HTMLElement>('#overlayLegend'),
  onSelect(pick, readout) {
    const panel = $('#inspectionReadout');
    if (!readout || !pick) { panel.hidden = true; return; }
    $('#inspectionId').textContent = readout.id;
    $('#inspectionOwner').textContent = readout.owner;
    $('#inspectionTitle').textContent = readout.title;
    const combatModule = pick.kind === 'module' ? damageLab?.combat.modules[pick.part.module as keyof DamageLab['combat']['modules']] : null;
    $('#inspectionDetails').textContent = combatModule
      ? `${readout.details} · ${t('gallery.anatomy.detail.hp', { hp: Math.round(combatModule.maxHp) })}` : readout.details;
    panel.hidden = false;
    const key = pick.kind === 'armor' ? `plate:${pick.surface.plate.name}` : pick.kind === 'module' ? `module:${pick.part.module}`
      : pick.kind === 'crew' ? `crew:${pick.station.crew}` : 'module:gun';
    const target = damageTargetKey(key);
    if (target) damageWorkbench.select(target, false);
  },
  onToggle() { updateUrl(); },
});
function anatomyVehicle(): AnatomyVehicle | null {
  if (!visual || !selectedId) return null;
  const spec = getSpec(selectedId) as GalleryVehicleSpec & { era?: string; gun?: { caliberMm?: number; shells?: Array<{ caliberMm?: number }> } };
  const removed = damageLab ? [...damageLab.snapshot().removed].sort() : [];
  return {
    id: selectedId,
    key: `${selectedId}|${removed.join(',')}`,
    armor: (damageLab ? damageLab.armor() : spec.armor) as AnatomyVehicle['armor'],
    caliberMm: Number(spec.gun?.shells?.[0]?.caliberMm || spec.gun?.caliberMm || 0),
    modern: isPostwarVehicleEra(spec.era as Parameters<typeof isPostwarVehicleEra>[0]),
    root: visual.root,
  };
}
function showAnatomy(mode: AnatomyMode, announce: boolean): void {
  // the loading notice covers a slow build only, and leaves the moment the layer shows (it outlived the render before)
  let loading: GalleryNotice | null = null;
  const slow = setTimeout(() => { loading = showToast(t('gallery.anatomy.loading'), { severity: 'progress' }); }, 250);
  const settle = (): void => { clearTimeout(slow); loading?.dismiss(); loading = null; };
  anatomyReady = loadAnatomy().then(async (module) => {
    // The pressed mode paints before its scene is built: with the module loaded the build ran in the press's own
    // microtask and held its paint (click-perf-244). The layer shows once its programs are linked (click-perf-248: its
    // first frame compiled them); the loading toast covers a slow build or link.
    await afterNextPaint();
    let vehicle = anatomyVehicle();
    if (!vehicle || activeMode !== mode) { settle(); return; }
    if (!anatomyView) {
      anatomyView = module.createAnatomyView(anatomyHost());
      anatomyView.setMetric(armorMetric);
    }
    await anatomyView.prepare(vehicle);
    settle();
    vehicle = anatomyVehicle();
    if (!vehicle || activeMode !== mode) return;
    anatomyView.show(mode, vehicle);
    colorDamageOverlay();
    if (announce) announceLine(t('gallery.view.toast.modeVisible', { count: anatomyView.count, mode: t(`gallery.view.mode.${mode}`).toLowerCase() }));
  }, () => {
    // a module that did not arrive is not asked for again in this document: the anatomy layers keep the kit's error state,
    // and their next press reloads the page once online
    settle();
    markLoadFailed(modeButtons.filter((button) => isAnatomyMode(button.dataset.value as GalleryMode)), t('gallery.anatomy.loadFailed'));
    showToast(t('gallery.anatomy.loadFailed'), { severity: 'error' });
  });
}

const VIEW_DIRECTIONS: Readonly<Record<GalleryView, readonly [number, number, number]>> = Object.freeze({
  hero: [-1, 0.45, 1],
  front: [0, 0.07, 1],
  left: [-1, 0.06, 0],
  right: [1, 0.06, 0],
  rear: [0, 0.07, -1],
  top: [0, 1, 0.015],
  'elevated-left': [-1, 0.6, 0.2],
  'elevated-right': [1, 0.6, 0.2],
});

function effectiveVisible(object: THREE.Object3D): boolean {
  for (let node: THREE.Object3D | null = object; node; node = node.parent) {
    if (!node.visible) return false;
  }
  return true;
}

function forceHeroLod(root: THREE.Object3D): void {
  root.traverse((object) => {
    if (!(object instanceof THREE.LOD)) return;
    object.autoUpdate = false;
    object.levels.forEach((level, index) => {
      if (level.object) level.object.visible = index === 0;
    });
  });
}

function visibleBox(root: THREE.Object3D): THREE.Box3 {
  currentBounds.makeEmpty();
  root.updateMatrixWorld(true);
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !object.geometry) return;
    if (!effectiveVisible(object) || object.userData.gallerySurfaceMarkup) return;
    if (object.name.startsWith('gallery_') || /shadow/i.test(object.name || '')) return;
    if (object instanceof THREE.InstancedMesh) {
      if (!object.count) return;
      object.computeBoundingBox();
      if (object.boundingBox && !object.boundingBox.isEmpty()) {
        currentBounds.union(object.boundingBox.clone().applyMatrix4(object.matrixWorld));
      }
      return;
    }
    if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
    const boundingBox = object.geometry.boundingBox;
    if (boundingBox) currentBounds.union(boundingBox.clone().applyMatrix4(object.matrixWorld));
  });
  return currentBounds;
}

function frameView(requestedName = 'hero'): void {
  if (!visual) return;
  const name: GalleryView = requestedName in VIEW_DIRECTIONS
    ? requestedName as GalleryView : 'hero';
  activeView = name;
  const bounds = visibleBox(visual.root);
  bounds.getCenter(currentCenter);
  // Keep the platform and rendered body mass at the view center. Full visible
  // bounds still determine distance so long guns and roof kit remain in frame.
  if (visual.presentationAnchorWorld) {
    visual.presentationAnchorWorld(presentationCenter);
    currentCenter.x = presentationCenter.x;
    currentCenter.z = presentationCenter.z;
  }
  viewDirection.fromArray(VIEW_DIRECTIONS[name] || VIEW_DIRECTIONS.hero).normalize();
  camera.up.set(0, 1, 0);
  if (name === 'top') camera.up.set(0, 0, -1);
  const distance = galleryFitDistance(bounds, currentCenter, viewDirection, camera.up,
    camera.fov, camera.aspect);
  camera.position.copy(currentCenter).addScaledVector(viewDirection, distance);
  controls.target.copy(currentCenter);
  applyGalleryCameraRange(camera, controls, galleryFog, bounds, distance);
  controls.update();
  viewMenu.setValue(name);
}

// the page's notices never cover the dossier's name or a control: beside the panes they stand at the stage's foot above
// the turntable and photo buttons, and on a stacked page just above the dossier's actions (they ride its sticky bar,
// where the copy and markup triggers sit; on a short page the bar scrolls with the dossier, and the notice stands in it,
// beside the button that raised it: a window-foot notice covered the dossier's tabs at 844 x 390, the g15 critic)
const stage = document.querySelector<HTMLElement>('#viewport');
const actions = document.querySelector<HTMLElement>('.acts');
type NoticeKit = typeof import('../ui/components/notice.ts');
let noticeKit: Promise<NoticeKit> | null = null;
/** The kit's notices load with the page's first notice and make their regions then (a static import made them one more
 *  Gallery boot request: Main's 253 ruling). */
function loadNotices(): Promise<NoticeKit> {
  noticeKit ??= import('../ui/components/notice.ts').then((kit) => {
    if (stage) kit.noticeRegion('gallery', { placement: 'host', host: stage, limit: 2, className: 'gallery-notices' });
    if (actions) kit.noticeRegion('gallery-stack', { placement: 'host', host: actions, limit: 2, className: 'gallery-notices gallery-notices--stack' });
    return kit;
  });
  return noticeKit;
}
// (gallery.css: the page scrolls, stage over the panes, on a phone or a short window under 1100 px)
const stackedPage = typeof matchMedia === 'function' ? matchMedia('(width < 768px), ((height < 520px) and (width < 1100px))') : null;
/**
 * A designation's line breaks fall between its words, never inside its number (the gauntlet 10-25: "Challenger 1 Mk / 2",
 * "Svinets- / 2", "Hetman / II"): a hyphen holds its halves, and a short last token (a mark, a numeral, a suffix) stays
 * with the word before it.
 */
const keepDesignation = (name: string): string => name.replace(/-(?=\S)/g, '-\u2060').replace(/ (?=\S{1,4}$)/, '\u00a0');

/** A notice's handle from the moment it is asked for: a dismissal before the kit has loaded cancels it. */
interface GalleryNotice { dismiss(): void }
/** A layer's count is read out, never shown: it was a helper sentence left over the stage (the UI gauntlet). */
function announceLine(message: string): void {
  const line = $('#announce');
  line.textContent = message;
  clearTimeout(announceTimer);
  announceTimer = setTimeout(() => { line.textContent = ''; }, 1800);
}
function showToast(message: string, { severity = 'info' as NoticeSeverity } = {}): GalleryNotice {
  // the kit's notice in its own region at the top of the window (the gauntlet 10-25: the old box sat over the compare
  // plate, the chips and the cards at every stacked size), with its status glyph, its time and its dismiss
  let dismissed = false;
  let shown: GalleryNotice | null = null;
  void loadNotices().then((kit) => {
    if (dismissed) return;
    shown = kit.notify({ text: message, severity, region: stage && !stackedPage?.matches ? 'gallery' : 'gallery-stack', dedupeKey: message });
  }, () => { /* the notice is lost with its module; the page goes on */ });
  return { dismiss() { dismissed = true; shown?.dismiss(); } };
}

function poseRecord(): { hullYawDeg: number; turretYawDeg: number; gunPitchDeg: number } {
  return {
    hullYawDeg: Number($('#hullYaw').value),
    turretYawDeg: Number($('#turretYaw').value),
    gunPitchDeg: Number($('#gunPitch').value),
  };
}

function renderSurfaceInspection(info: SurfaceInspectionInfo | null): void {
  const readout = $('#inspectionReadout');
  if (!info) {
    readout.hidden = true;
    return;
  }
  $('#inspectionId').textContent = `F${info.faceIndex}`;
  $('#inspectionOwner').textContent = info.ownership;
  $('#inspectionTitle').textContent = info.mesh;
  $('#inspectionDetails').textContent = t(info.instanceId === null ? 'gallery.inspection.triangle' : 'gallery.inspection.triangleInstance',
    { face: info.faceIndex, instance: info.instanceId ?? '', point: info.point.join(', ') });
  readout.hidden = false;
}

const surfaceMarkup = createSurfaceMarkup({
  renderer,
  camera,
  controls,
  getSpec,
  getPose: poseRecord,
  renderFrame: () => renderer.render(scene, camera),
  showToast,
  onHover: renderSurfaceInspection,
});

function updateUrl(): void {
  if (!selectedId) return;
  const url = new URL(location.href);
  url.searchParams.set('id', selectedId);
  stampTankIdLink(url.searchParams);
  if (activeMode === 'appearance') url.searchParams.delete('layer');
  else url.searchParams.set('layer', activeMode);
  const metric = anatomyView?.state().metric || armorMetric;
  if (activeMode === 'armor' && metric !== 'ke') url.searchParams.set('metric', String(metric));
  else url.searchParams.delete('metric');
  if (rivalPinned && rivalId) url.searchParams.set('vs', rivalId);
  else url.searchParams.delete('vs');
  history.replaceState({ id: selectedId, layer: activeMode }, '', `${url.pathname}${url.search}`);
}

function renderLegend(): void {
  const root = $('#overlayLegend');
  if (isAnatomyMode(activeMode)) return; // the anatomy view owns the legend in its layers
  root.classList.remove('anatomy-legend');
  const legend: ReadonlyArray<readonly [string, string]> = activeMode === 'markup'
    ? [
        [t('gallery.legend.markup.selected'), 'var(--team-enemy)'],
        [t('gallery.legend.markup.hover'), 'var(--team-own)'],
      ]
    : [];
  root.replaceChildren(...legend.map(([label, color]) => {
    const item = document.createElement('span');
    item.style.setProperty('--legend', color);
    const marker = document.createElement('i');
    item.append(marker, label);
    return item;
  }));
}

/* ------------------------------------------------------------------------------------------- facets and the fleet */

const prefs = readPrefs();
const favourites = new Set((Array.isArray(prefs.favourites) ? prefs.favourites : []).filter((id) => recordById.has(id)));
let peerScale: 'fleet' | 'class' = prefs.peer === 'class' ? 'class' : 'fleet';
let rivalId: string | null = null;
let rivalPinned = false;

/** One number a vehicle can be read, compared and sorted by (better: 1 more is better, -1 less is, 0 a size). */
interface StatDef {
  readonly key: string;
  readonly label: string;
  readonly icon: IconId;
  readonly unit: string;
  readonly better: 1 | -1 | 0;
  readonly digits: number;
  readonly group: 'firepower' | 'protection' | 'mobility' | 'size';
  readonly value: (record: GalleryRecord) => number;
}
const gunArcs = new Map(records.map((record) => {
  const spec = getSpec(record.id) as GalleryVehicleSpec;
  return [record.id, { depression: Math.abs(Number(spec.gunDepressionDeg || 0)), elevation: Math.abs(Number(spec.gunElevationDeg || 0)) }];
}));
const STATS: readonly StatDef[] = Object.freeze([
  { key: 'penetration', label: 'gallery.stat.penetration', icon: 'penetration', unit: 'gallery.unit.mm', better: 1, digits: 0, group: 'firepower', value: (r) => r.metrics.bestPenetrationMm },
  { key: 'dpm', label: 'gallery.stat.dpm', icon: 'damage', unit: '', better: 1, digits: 0, group: 'firepower', value: (r) => r.metrics.dpm },
  { key: 'reload', label: 'gallery.stat.reload', icon: 'reload', unit: 'gallery.unit.s', better: -1, digits: 1, group: 'firepower', value: (r) => r.metrics.reloadS },
  { key: 'caliber', label: 'gallery.stat.caliber', icon: 'gun', unit: 'gallery.unit.mm', better: 1, digits: 0, group: 'firepower', value: (r) => r.metrics.caliberMm },
  { key: 'aim', label: 'gallery.stat.aim', icon: 'scope', unit: 'gallery.unit.s', better: -1, digits: 1, group: 'firepower', value: (r) => r.metrics.aimTimeS },
  { key: 'turretTraverse', label: 'gallery.stat.turretTraverse', icon: 'turretRing', unit: 'gallery.unit.degS', better: 1, digits: 0, group: 'firepower', value: (r) => r.metrics.turretTraverseDegS },
  { key: 'depression', label: 'gallery.stat.depression', icon: 'moveBack', unit: 'gallery.unit.deg', better: 1, digits: 0, group: 'firepower', value: (r) => gunArcs.get(r.id)?.depression ?? 0 },
  { key: 'elevation', label: 'gallery.stat.elevation', icon: 'moveForward', unit: 'gallery.unit.deg', better: 1, digits: 0, group: 'firepower', value: (r) => gunArcs.get(r.id)?.elevation ?? 0 },
  { key: 'hp', label: 'gallery.dossier.spec.hp', icon: 'shield', unit: 'gallery.unit.hitPoints', better: 1, digits: 0, group: 'protection', value: (r) => r.metrics.hp },
  { key: 'ke', label: 'gallery.stat.ke', icon: 'layerArmor', unit: 'gallery.unit.mm', better: 1, digits: 0, group: 'protection', value: (r) => r.metrics.bestKeMm },
  { key: 'ce', label: 'gallery.stat.ce', icon: 'armorFlashlight', unit: 'gallery.unit.mm', better: 1, digits: 0, group: 'protection', value: (r) => r.metrics.bestCeMm },
  { key: 'speed', label: 'gallery.stat.speed', icon: 'speed', unit: 'gallery.unit.kmh', better: 1, digits: 0, group: 'mobility', value: (r) => r.metrics.topSpeedKmh },
  { key: 'reverse', label: 'gallery.stat.reverse', icon: 'moveBack', unit: 'gallery.unit.kmh', better: 1, digits: 0, group: 'mobility', value: (r) => r.metrics.reverseSpeedKmh },
  { key: 'powerWeight', label: 'gallery.dossier.spec.powerWeight', icon: 'performance', unit: 'gallery.unit.hpt', better: 1, digits: 1, group: 'mobility', value: (r) => r.metrics.powerToWeight },
  { key: 'engine', label: 'gallery.dossier.spec.engine', icon: 'engine', unit: 'gallery.unit.hp', better: 1, digits: 0, group: 'mobility', value: (r) => r.metrics.enginePowerHp },
  { key: 'hullTraverse', label: 'gallery.dossier.spec.hullTraverse', icon: 'steerLeft', unit: 'gallery.unit.degS', better: 1, digits: 0, group: 'mobility', value: (r) => r.metrics.hullTraverseDegS },
  { key: 'weight', label: 'gallery.dossier.spec.weight', icon: 'track', unit: 'gallery.unit.t', better: 0, digits: 1, group: 'mobility', value: (r) => r.metrics.weightTons },
  { key: 'length', label: 'gallery.stat.length', icon: 'statRange', unit: 'gallery.unit.m', better: 0, digits: 2, group: 'size', value: (r) => r.dimensions.overallLengthM },
  { key: 'width', label: 'gallery.stat.width', icon: 'statRange', unit: 'gallery.unit.m', better: 0, digits: 2, group: 'size', value: (r) => r.dimensions.widthM },
  { key: 'height', label: 'gallery.stat.height', icon: 'altitude', unit: 'gallery.unit.m', better: 0, digits: 2, group: 'size', value: (r) => r.dimensions.heightM },
] satisfies StatDef[]);
const STAT_GROUPS = Object.freeze([
  ['firepower', 'gallery.stat.firepower', 'gun'],
  ['protection', 'gallery.stat.protection', 'shield'],
  ['mobility', 'gallery.stat.mobility', 'speed'],
  ['size', 'gallery.stat.size', 'statRange'],
] as const);
const RATINGS = Object.freeze([
  ['firepower', 'gallery.stat.firepower', 'damage'],
  ['protection', 'gallery.stat.protection', 'shield'],
  ['mobility', 'gallery.stat.mobility', 'speed'],
  ['survivability', 'gallery.stat.survivability', 'crew'],
] as const);
const statByKey = new Map(STATS.map((stat) => [stat.key, stat]));

/** The low and high of every stat across a peer set (the fleet, or one class), computed once per set. */
const rangeCache = new Map<string, Map<string, readonly [number, number]>>();
function peerRanges(record: GalleryRecord): Map<string, readonly [number, number]> {
  const key = peerScale === 'class' ? `class:${record.vehicleClass?.id || ''}` : 'fleet';
  let ranges = rangeCache.get(key);
  if (ranges) return ranges;
  const peers = peerScale === 'class' ? records.filter((other) => other.vehicleClass?.id === record.vehicleClass?.id) : records;
  ranges = new Map(STATS.map((stat) => {
    const values = peers.map(stat.value).filter((value) => Number.isFinite(value) && value > 0);
    return [stat.key, [values.length ? Math.min(...values) : 0, values.length ? Math.max(...values) : 0] as const];
  }));
  rangeCache.set(key, ranges);
  return ranges;
}
function statCells(stat: StatDef, value: number, range: readonly [number, number]): number {
  const [low, high] = range;
  return stat.better < 0 ? scaleCells(value, high, low) : scaleCells(value, low, high);
}
const formatStat = (stat: StatDef, value: number): string =>
  formatNumber(value, { maximumFractionDigits: stat.digits, minimumFractionDigits: stat.digits && value % 1 ? 1 : 0 });

type SortKey = 'tier' | 'name' | 'nation' | 'era' | 'firepower' | 'protection' | 'mobility' | 'survivability' | string;
interface BrowseState {
  query: string;
  nation: string;
  era: string;
  vehicleClass: string;
  role: string;
  autoloader: boolean;
  take: boolean;
  concept: boolean;
  favourite: boolean;
  sort: SortKey;
  descending: boolean;
  layout: 'list' | 'grid';
}
const SORTS: readonly SortKey[] = ['tier', 'name', 'nation', 'era', ...RATINGS.map(([key]) => key), ...STATS.map((stat) => stat.key)];
const browse: BrowseState = {
  query: '', nation: '', era: '', vehicleClass: '', role: '', autoloader: false, take: false, concept: false, favourite: false,
  sort: SORTS.includes(prefs.sort || '') ? prefs.sort as SortKey : 'tier',
  descending: prefs.descending !== false,
  layout: prefs.layout === 'grid' ? 'grid' : 'list',
};
const phoneQuery = globalThis.matchMedia?.('(width < 768px)');
const effectiveLayout = (): 'list' | 'grid' => (phoneQuery?.matches ? 'grid' : browse.layout);
let filteredRecords: GalleryRecord[] = records;

/** A nation id's localized name (`nation.<id>`), or the id itself when the catalog has none. */
function nationName(nation: string): string {
  const key = `nation.${nation}`;
  const name = t(key);
  return name === key ? nation : name;
}
/** One flag per nation (galleryFacets.ts, shared with the page's static shell). */
const { codes: flagCodes, nations: nationsByFlag } = nationFlags(records);
const flagLabel = (code: string): string => flagLabelOf(code, nationsByFlag, t);

const GALLERY_ERA_ICONS: Readonly<Record<string, IconId>> = Object.freeze({
  [VEHICLE_ERAS.INTERWAR]: 'eraInterwar',
  [VEHICLE_ERAS.WORLD_WAR_II]: 'eraWorldWarII',
  [VEHICLE_ERAS.COLD_WAR]: 'eraColdWar',
  [VEHICLE_ERAS.MODERN]: 'eraModern',
  [VEHICLE_ERAS.NEXT_GENERATION]: 'eraNextGeneration',
});
const CLASS_ICONS: Readonly<Record<string, IconId>> = Object.freeze({
  mbt: 'classMbt', medium: 'classMedium', heavy: 'classHeavy', light: 'classLight', ifv: 'classIfv', apc: 'classApc',
  td: 'classTd', spaa: 'classSpaa', 'fire-support': 'classFireSupport',
});
const ROLE_ICONS: Readonly<Record<string, IconId>> = Object.freeze({
  breakthrough: 'roleBreakthrough', frontline: 'roleFrontline', flanker: 'roleFlanker', sniper: 'roleSniper',
  scout: 'roleScout', support: 'roleSupport',
});
const eras = [...new Map(records.map((record) => [record.eraKey || '', record.era])).entries()]
  .filter(([key]) => key)
  .sort((a, b) => compareVehicleEras(a[0] as Parameters<typeof compareVehicleEras>[0], b[0] as Parameters<typeof compareVehicleEras>[1]));
const classes = fleetClasses(records);
const roles = VEHICLE_BATTLE_ROLE_ORDER.filter((id) => records.some((record) => record.battleRole?.id === id));

function renderFacets(): void {
  // the nation and class rows: site/gallery.html ships their default state (tools/gallery-shell.mjs), so these renders
  // fill the flags in and set the pressed state without moving anything
  $('#nationFacets').innerHTML = nationFacetsMarkup({ codes: flagCodes, nations: nationsByFlag, selected: browse.nation, translate: t, flagSrc: flagIconUrl });
  $('#classFacets').innerHTML = classFacetsMarkup(classes, browse.vehicleClass, t);
  $('#eraFacets').innerHTML = eras.map(([key, label]) => facetButton(`data-facet="era" data-value="${esc(key)}"`, browse.era === key, label,
    icon(GALLERY_ERA_ICONS[key] || 'clock', { size: 14 }), 'named')).join('');
  $('#roleFacets').innerHTML = roles.map((id) => facetButton(`data-facet="role" data-value="${esc(id)}"`, browse.role === id,
    vehicleFacetLabel(VEHICLE_BATTLE_ROLE_META[id], t), icon(ROLE_ICONS[id] || 'vehicle', { size: 14 }), 'named')).join('');
  $('#extraFacets').innerHTML = [
    facetButton('data-facet="autoloader"', browse.autoloader, t('gallery.facet.autoloader'), icon('autoloader', { size: 14 }), 'named'),
    facetButton('data-facet="take"', browse.take, t('gallery.facet.take'), icon('play', { size: 14 }), 'named', !takeIds),
    facetButton('data-facet="concept"', browse.concept, vehicleFacetLabel(CONCEPT_PROTOTYPE_FILTER_META, t), icon('lightbulb', { size: 14 }), 'named'),
    facetButton('data-facet="favourite"', browse.favourite, t('gallery.facet.favourite'), icon('star', { size: 14 }), 'named',
      !favourites.size && !browse.favourite),
  ].join('');
  // More filters (247): the era, role and extra facets fold under one disclosure, which names how many of them are on
  // and opens by itself when a link or a reload arrives with one set
  const more = [browse.era, browse.role, browse.autoloader, browse.take, browse.concept, browse.favourite].filter(Boolean).length;
  const count = $('#moreFacetCount');
  count.textContent = String(more);
  count.hidden = !more;
  const disclosure = document.querySelector<HTMLDetailsElement>('#moreFacets');
  // (laid over the list beside the stage, it stays shut: its count says how many are on)
  if (disclosure && more && !moreFacetsShown && !matchMedia(MORE_FACETS_OVER).matches) disclosure.open = true;
  moreFacetsShown = true;
}
/** The plate over the list stands within the window under its summary and scrolls past that (the g18 critic at 1024 x 600:
 *  its last row cut by the screen's foot, Sniper, Scout and Support out of reach). */
function fitMoreFacets(this: HTMLDetailsElement): void {
  const plate = this.querySelector<HTMLElement>(':scope>.toggles--glyphs');
  if (!plate) return;
  plate.style.removeProperty('max-height');
  if (!this.open || !matchMedia(MORE_FACETS_OVER).matches) return;
  const room = innerHeight - this.getBoundingClientRect().bottom - 12;
  if (plate.getBoundingClientRect().height > room) plate.style.maxHeight = `${Math.max(120, Math.floor(room))}px`;
}
let moreFacetsShown = false;
/** Where the open More filters lay a plate over the list (gallery.css); there they close as a menu does. */
const MORE_FACETS_OVER = '(width >= 768px) and (height >= 520px)';
function closeMoreFacetsOver(event: Event): void {
  const disclosure = document.querySelector<HTMLDetailsElement>('#moreFacets');
  if (!disclosure?.open || !matchMedia(MORE_FACETS_OVER).matches) return;
  if (event instanceof KeyboardEvent) {
    if (event.key !== 'Escape' || !disclosure.contains(document.activeElement)) return;
    disclosure.open = false;
    disclosure.querySelector('summary')?.focus();
  } else if (!disclosure.contains(event.target as Node)) disclosure.open = false;
}
document.addEventListener('pointerdown', closeMoreFacetsOver, true);
document.addEventListener('keydown', closeMoreFacetsOver);
function onFacet(event: Event): void {
  const button = (event.target as Element | null)?.closest<HTMLButtonElement>('button[data-facet]');
  if (!button || button.disabled) return;
  const facet = button.dataset.facet as keyof BrowseState;
  const value = button.dataset.value ?? '';
  if (facet === 'nation' || facet === 'era' || facet === 'vehicleClass' || facet === 'role') {
    browse[facet] = browse[facet] === value ? '' : value;
  } else if (facet === 'autoloader' || facet === 'take' || facet === 'concept' || facet === 'favourite') {
    browse[facet] = !browse[facet];
  }
  renderFacets();
  document.querySelector<HTMLElement>(`button[data-facet="${facet}"]${value ? `[data-value="${CSS.escape(value)}"]` : ''}`)?.focus();
  applyFilters();
}

function sortLabel(key: SortKey): string {
  if (key === 'tier') return t('gallery.sort.tier');
  if (key === 'name') return t('gallery.sort.name');
  if (key === 'nation') return t('gallery.archive.filter.nation');
  if (key === 'era') return t('gallery.archive.filter.era');
  const rating = RATINGS.find(([ratingKey]) => ratingKey === key);
  if (rating) return t(rating[1]);
  const stat = statByKey.get(key);
  return stat ? t(stat.label) : key;
}
function sortValue(record: GalleryRecord, key: SortKey): number | string {
  if (key === 'tier') return record.tier;
  if (key === 'name') return record.displayName;
  if (key === 'nation') return flagLabel(flagIconCode(record.nation));
  if (key === 'era') return eras.findIndex(([eraKey]) => eraKey === record.eraKey);
  if (key in record.ratings) return record.ratings[key as keyof GalleryRecord['ratings']];
  return statByKey.get(key)?.value(record) ?? 0;
}
function sortRecords(list: GalleryRecord[]): GalleryRecord[] {
  const direction = browse.descending ? -1 : 1;
  const textSort = browse.sort === 'name' || browse.sort === 'nation';
  return [...list].sort((a, b) => {
    const left = sortValue(a, browse.sort);
    const right = sortValue(b, browse.sort);
    const primary = typeof left === 'string' || typeof right === 'string'
      ? String(left).localeCompare(String(right), getLocale()) * (textSort ? -direction : direction)
      : (Number(left) - Number(right)) * direction;
    return primary || b.tier - a.tier || a.displayName.localeCompare(b.displayName, getLocale());
  });
}
/** The value the list shows at a row's end: the sort's own value, or the era / tier when the group names the other. */
function rowValue(record: GalleryRecord): string {
  const key = browse.sort;
  if (key === 'tier') return record.era;
  if (key === 'name' || key === 'nation' || key === 'era') return record.tierNumeral;
  if (key in record.ratings) return formatNumber(record.ratings[key as keyof GalleryRecord['ratings']]);
  const stat = statByKey.get(key);
  if (!stat) return '';
  const unit = stat.unit ? ` ${t(stat.unit)}` : '';
  return `${formatStat(stat, stat.value(record))}${unit}`;
}
interface RosterGroup { key: string; label: string; lead: string; rows: GalleryRecord[] }
function groupRecords(list: GalleryRecord[]): RosterGroup[] {
  const key = browse.sort;
  if (key !== 'tier' && key !== 'nation' && key !== 'era') return [{ key: '', label: '', lead: '', rows: list }];
  const groups = new Map<string, RosterGroup>();
  for (const record of list) {
    const code = flagIconCode(record.nation);
    const groupKey = key === 'tier' ? String(record.tier) : key === 'nation' ? code : record.eraKey || '';
    let group = groups.get(groupKey);
    if (!group) {
      group = key === 'tier'
        ? { key: groupKey, label: t('gallery.tier', { tier: record.tierNumeral }), lead: '', rows: [] }
        : key === 'nation'
          ? { key: groupKey, label: flagLabel(code), lead: flag(record.nation, 'sm'), rows: [] }
          : { key: groupKey, label: record.era, lead: icon(GALLERY_ERA_ICONS[groupKey] || 'clock', { size: 16 }), rows: [] };
      groups.set(groupKey, group);
    }
    group.rows.push(record);
  }
  return [...groups.values()];
}

let heroCards: { module: typeof import('../ui/heroCard.ts'); manifest: HeroManifest; classes: typeof import('../vehicles/vehicleFacets.ts');
  glyphs: typeof import('../ui/vehicleFacetIcons.ts'); chips: typeof import('../ui/heroCardChips.ts') } | null = null;
Promise.all([import('../ui/heroCard.ts'), import('../ui/heroCard.css')])
  .then(async ([module]) => {
    const manifest = await module.loadHeroManifest();
    if (!manifest) return;
    // the class glyph and the tier chip ride with the cards (the chunk the card module already pulls)
    const [classes, glyphs, chips] = await Promise.all([import('../vehicles/vehicleFacets.ts'), import('../ui/vehicleFacetIcons.ts'),
      import('../ui/heroCardChips.ts')]);
    heroCards = { module, manifest, classes, glyphs, chips };
    const mask = module.heroCardFlagMask(manifest);
    vehicleList.style.setProperty('--hc-flag-mask', mask);
    takeMedia.style.setProperty('--hc-flag-mask', mask);
    if (effectiveLayout() === 'grid') renderRoster();
    if (selectedId) decorateTake(selectedId);
  })
  .catch(() => { /* the packaged angle icons stay */ });

/** A row names a long designation by its short form (the full name on its tip) so the list keeps one row height. */
const rowName = (record: GalleryRecord): string => record.displayName.length > 20 && record.shortName ? record.shortName : record.displayName;
const rowTip = (record: GalleryRecord): string => rowName(record) === record.displayName ? '' : ` data-tip="${esc(record.displayName)}"`;
/** A fleet row (07-gallery .fam .it): flag, silhouette, name and the sort's value. */
function rowMarkup(record: GalleryRecord): string {
  const selected = record.id === selectedId;
  const dev = record.developmentOnly ? `<b class="it__dev">${esc(record.rosterTag || t('garage.card.devTag'))}</b>` : '';
  // a hero card names its vehicle's class by its glyph in the top right (owner 10-26), its name the glyph's tip and label
  const classId = heroCards && record.vehicleClass ? record.vehicleClass.id : '';
  const classMeta = classId && heroCards ? (heroCards.classes.VEHICLE_CLASS_META as Readonly<Record<string, Parameters<typeof heroCards.classes.vehicleFacetLabel>[0]>>)[classId] : null;
  const classPlate = classMeta && heroCards
    ? `<span class="it__class" role="img" aria-label="${esc(heroCards.classes.vehicleFacetLabel(classMeta, t))}" data-tip="${esc(heroCards.classes.vehicleFacetLabel(classMeta, t))}">`
      + `${heroCards.glyphs.vehicleClassGlyphSVG(classId, 12)}</span>` : '';
  return `<button type="button" class="it" role="option" data-id="${esc(record.id)}" aria-selected="${selected}" tabindex="-1">`
    + `<span class="it__art">${heroCards ? heroCards.chips.heroTierChipHTML(record.id) : ''}</span>${flag(record.nation, 'sm')}${silhouette(record.id)}${classPlate}`
    + `<span class="it__name"${rowTip(record)}>${esc(keepDesignation(rowName(record)))}${dev}</span><span class="e">${esc(rowValue(record))}</span></button>`;
}
function renderRoster(): void {
  const layout = effectiveLayout();
  const focusedId = (document.activeElement as HTMLElement | null)?.closest?.<HTMLElement>('.it')?.dataset.id;
  vehicleList.dataset.layout = layout;
  vehicleList.removeAttribute('aria-busy');
  const groups = groupRecords(filteredRecords);
  vehicleList.innerHTML = groups.map((group) => (group.label
    ? `<div class="fam__group" role="group" aria-label="${esc(group.label)}"><div class="gh" aria-hidden="true">${group.lead}`
      + `<span>${esc(group.label)}</span><span class="n">${formatNumber(group.rows.length)}</span></div>`
    : '<div class="fam__group">') + group.rows.map(rowMarkup).join('') + '</div>').join('');
  if (!filteredRecords.length) {
    // a typed query that matches nothing is named, so the line never blames filters the reader did not set
    const query = $<HTMLInputElement>('#gallerySearch').value.trim();
    vehicleList.innerHTML = emptyState({ text: query ? t('gallery.empty.noQueryMatch', { query }) : t('gallery.empty.noMatch'), className: 'fam__empty',
      action: { label: t('gallery.empty.clear'), attrs: { 'data-clear-filters': true } } });
  }
  // (a short window sets that line under the search, gallery.css)
  vehicleList.parentElement?.classList.toggle('is-empty', !filteredRecords.length);
  if (layout === 'grid' && heroCards) {
    for (const row of vehicleList.querySelectorAll<HTMLElement>('.it')) {
      const art = row.querySelector<HTMLElement>('.it__art');
      const id = row.dataset.id || '';
      if (art) heroCards.module.decorateHeroCard(art, id, heroCards.manifest, { tankSizes: '180px', flagSizes: '240px', priority: id === selectedId });
    }
  }
  const tabStop = vehicleList.querySelector<HTMLElement>('.it[aria-selected=true]') ?? vehicleList.querySelector<HTMLElement>('.it');
  if (tabStop) tabStop.tabIndex = 0;
  if (focusedId) vehicleList.querySelector<HTMLElement>(`.it[data-id="${CSS.escape(focusedId)}"]`)?.focus({ preventScroll: true });
  const count = $<HTMLOutputElement>('#archiveCount');
  count.textContent = filteredRecords.length === records.length
    ? formatNumber(records.length) : `${formatNumber(filteredRecords.length)}/${formatNumber(records.length)}`;
  count.setAttribute('aria-label', t('gallery.count', { shown: filteredRecords.length, total: records.length }));
}
/** Scroll the fleet list itself (never the page) so a row is in view, in the frame's callback: a press that marks the
 *  selection and then measured the list laid it out inside the press (perf 249); several presses reveal the last row. */
let revealPending: HTMLElement | null = null;
function revealRow(row: HTMLElement | null): void {
  if (!row) return;
  const queued = revealPending;
  revealPending = row;
  if (!queued) requestAnimationFrame(() => {
    const target = revealPending;
    revealPending = null;
    if (target?.isConnected) revealRowNow(target);
  });
}
function revealRowNow(row: HTMLElement, settle = true): void {
  // the rows skip rendering off view (content-visibility), so their heights are estimates until they show: once the
  // first scroll has laid the rows near the target out, a second pass in the next frame lands it exactly
  if (settle) requestAnimationFrame(() => { if (row.isConnected) revealRowNow(row, false); });
  const list = vehicleList.getBoundingClientRect();
  const box = row.getBoundingClientRect();
  if (box.top < list.top) vehicleList.scrollTop += box.top - list.top - 8;
  else if (box.bottom > list.bottom) vehicleList.scrollTop += box.bottom - list.bottom + 8;
  // the list's top stands on a whole row (the g16 critic read a row the scroller's top cut as clipped by the toolbar)
  const top = list.top;
  const first = [...vehicleList.querySelectorAll<HTMLElement>('.it, .gh')].find((element) => element.getBoundingClientRect().bottom > top + 1);
  const cut = first?.getBoundingClientRect();
  const shown = row.getBoundingClientRect();
  if (cut && cut.top < top - 0.5 && shown.top - (cut.bottom - top) >= top) vehicleList.scrollTop += cut.bottom - top;
  if (box.left < list.left) vehicleList.scrollLeft += box.left - list.left - 12;
  else if (box.right > list.right) vehicleList.scrollLeft += box.right - list.right + 12;
}
function markSelectedRow(): void {
  for (const row of vehicleList.querySelectorAll<HTMLElement>('.it')) {
    const on = row.dataset.id === selectedId;
    row.setAttribute('aria-selected', String(on));
    row.tabIndex = on ? 0 : -1;
  }
  revealRow(vehicleList.querySelector<HTMLElement>('.it[aria-selected=true]'));
}
function applyFilters(): void {
  const code = browse.nation;
  const list = filterGalleryRecords(records, {
    query: $('#gallerySearch').value,
    era: browse.era || 'all',
    vehicleClass: browse.vehicleClass || 'all',
    battleRole: browse.role || 'all',
  }).filter((record) => (!code || flagIconCode(record.nation) === code)
    && (!browse.autoloader || record.metrics.autoloader)
    && (!browse.take || !takeIds || takeIds.has(record.id))
    && (!browse.concept || (!!record.designStatus && record.designStatus.id !== 'service'))
    && (!browse.favourite || favourites.has(record.id)));
  filteredRecords = sortRecords(list);
  renderRoster();
}
// the sort is the kit's picker menu (pickerMenu.ts): a raw select in the census, its twenty keys now named with their glyphs
let sortMenu: PickerMenu | null = null;
function sortGlyph(key: SortKey): IconId | undefined {
  const rating = RATINGS.find(([ratingKey]) => ratingKey === key);
  return (rating?.[2] ?? statByKey.get(key)?.icon) as IconId | undefined;
}
function populateSort(): void {
  const items = SORTS.map((key) => { const glyph = sortGlyph(key); return { id: key, name: sortLabel(key), ...(glyph ? { glyph } : {}) }; });
  if (sortMenu) sortMenu.setItems(items, browse.sort);
  else sortMenu = createPickerMenu($<HTMLElement>('#gallerySort'), { id: 'gallery-sort', label: t('gallery.sort.aria'), items,
    value: browse.sort, layout: 'list', text: pickerText(), onChoose: (item) => chooseSort(item.id as SortKey) });
  syncSortDirection();
}
function chooseSort(key: SortKey): void {
  browse.sort = key;
  browse.descending = !(browse.sort === 'name' || browse.sort === 'nation' || statByKey.get(browse.sort)?.better === -1);
  syncSortDirection();
  writePrefs();
  applyFilters();
}
function syncSortDirection(): void {
  const button = $('#sortDirection');
  const label = t(browse.descending ? 'gallery.sort.descending' : 'gallery.sort.ascending');
  button.setAttribute('aria-pressed', String(browse.descending));
  button.setAttribute('aria-label', label);
}
function syncLayoutSwitch(): void {
  for (const button of document.querySelectorAll<HTMLElement>('.layout-switch [data-value]')) {
    const on = button.dataset.value === browse.layout;
    button.setAttribute('aria-checked', String(on));
    button.tabIndex = on ? 0 : -1;
  }
}

/* --------------------------------------------------------------------------------------------------- the dossier */

const DOSSIER_TABS = ['overview', 'stats', 'ammo', 'anatomy', 'damage', 'markup'] as const;
type DossierTab = typeof DOSSIER_TABS[number];
let activeTab: DossierTab = 'overview';
const tabsHost = $<HTMLElement>('#dossierTabs');
tabsHost.innerHTML = tabs({
  label: t('gallery.dossier.aria'),
  selected: activeTab,
  panelPrefix: 'dossier',
  tabs: [
    { id: 'overview', label: t('gallery.tab.overview') },
    { id: 'stats', label: t('gallery.tab.stats') },
    { id: 'ammo', label: t('gallery.tab.ammo') },
    { id: 'anatomy', label: t('gallery.tab.anatomy') },
    { id: 'damage', label: t('gallery.tab.damage') },
    { id: 'markup', label: t('gallery.view.mode.markup') },
  ],
});
const markupTab = $<HTMLButtonElement>('#dossierTabs [data-tab="markup"]');
function selectTab(tab: DossierTab, focus = false): void {
  activeTab = tab;
  for (const button of tabsHost.querySelectorAll<HTMLElement>('[role=tab]')) {
    const on = button.dataset.tab === tab;
    button.setAttribute('aria-selected', String(on));
    button.tabIndex = on ? 0 : -1;
    if (on && focus) button.focus({ preventScroll: true });
    const list = button.parentElement;
    // the strip brings the tab into view in the frame's callback, with the frame's own layout (perf 249)
    if (on && list) requestAnimationFrame(() => {
      if (button.offsetLeft < list.scrollLeft || button.offsetLeft + button.offsetWidth > list.scrollLeft + list.clientWidth) {
        list.scrollLeft = button.offsetLeft - 16;
      }
    });
  }
  for (const id of DOSSIER_TABS) $<HTMLElement>(`#dossier-${id}`).hidden = id !== tab;
  const record = selectedId ? recordById.get(selectedId) : null;
  if (tab === 'overview' && record) renderVersus(record); // its canvas measures its box once it shows
}
wireRoving(tabsHost, (value) => selectTab(value as DossierTab));

const DIAGRAMS = [['armor_side', 'garage.dossier.image.armorSide'], ['modules_side', 'garage.dossier.image.modulesSide'],
  ['crew_side', 'garage.dossier.image.crewSide']] as const;
// the switch names each drawing by its layer (the long names wrapped onto a second row); the long name is its alt
const DIAGRAM_SHORT: Readonly<Record<typeof DIAGRAMS[number][0], string>> = Object.freeze({
  armor_side: 'gallery.view.mode.armor', modules_side: 'gallery.view.mode.modules', crew_side: 'gallery.view.mode.crew',
});
let diagram: typeof DIAGRAMS[number][0] = 'armor_side';
$<HTMLElement>('#diagramSwitch').innerHTML = DIAGRAMS.map(([view, key]) => `<button type="button" role="radio" class="cot-c-seg__opt"`
  + ` data-value="${view}" aria-checked="${view === diagram}" tabindex="${view === diagram ? 0 : -1}" data-ui-sound="select"`
  + ` aria-label="${esc(t(key))}">${esc(t(DIAGRAM_SHORT[view]))}</button>`).join('');
wireRoving($<HTMLElement>('#diagramSwitch'), (value) => { diagram = value as typeof diagram; renderDiagram(); });
const diagramImage = $<HTMLImageElement>('#diagramImage');
diagramImage.addEventListener('error', () => { diagramImage.closest('figure')!.hidden = true; });
diagramImage.addEventListener('load', () => { diagramImage.closest('figure')!.hidden = false; });
// a press shows the drawing at the window's size, named by its overlay's header; a press or Escape puts it back
const diagramFigure = diagramImage.closest('figure')!;
// the zoomed drawing is a modal transient surface (src/ui/components/surfaceStack.ts): opening it closes an open menu, a
// press on it puts it back, and Escape is the stack's
const diagramSurface: TransientSurface = {
  id: 'gallery-drawing',
  element: () => diagramFigure,
  close: (reason) => { setDiagramZoom(false); if (reason === 'escape') diagramImage.focus({ preventScroll: true }); },
  modal: true,
};
const setDiagramZoom = (on: boolean): void => {
  if (on) openSurface(diagramSurface, diagramImage); else closeSurface(diagramSurface);
  diagramFigure.classList.toggle('is-zoomed', on);
  // the dossier's scroll fade is a mask, which masks a fixed descendant to the column too: it lifts while a drawing is
  // zoomed (the g13 critic: the zoom showed only through the dossier, its drawing under the stage)
  diagramFigure.closest('.dossier-scroll')?.classList.toggle('has-zoom', on);
  diagramImage.setAttribute('aria-expanded', String(on));
  mountDiagramLabels();
};
// the zoomed drawing's own close, the kit's icon button in its corner (the g15 critic: a press or Escape put it back, but
// nothing on the screen said so)
const diagramClose = document.createElement('button');
diagramClose.type = 'button';
diagramClose.className = 'cot-c-btn cot-c-btn--36 cot-c-btn--icon diagram-close';
diagramClose.setAttribute('aria-label', t('gallery.diagram.close'));
diagramClose.title = t('gallery.diagram.close');
diagramClose.innerHTML = icon('close', { size: 18 });
diagramClose.addEventListener('click', (event) => { event.stopPropagation(); setDiagramZoom(false); diagramImage.focus(); });
diagramFigure.append(diagramClose);
diagramImage.tabIndex = 0;
diagramImage.setAttribute('role', 'button');
diagramImage.setAttribute('aria-expanded', 'false');
diagramFigure.addEventListener('click', () => setDiagramZoom(!diagramFigure.classList.contains('is-zoomed')));
diagramImage.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setDiagramZoom(!diagramFigure.classList.contains('is-zoomed')); }
});
function renderDiagram(): void {
  if (!selectedId) return;
  const record = recordById.get(selectedId);
  diagramImage.src = iconUrl(selectedId, diagram);
  const labelKey = DIAGRAMS.find(([view]) => view === diagram)?.[1];
  diagramImage.alt = `${record?.displayName || ''} ${labelKey ? t(labelKey) : ''}`.trim();
  mountDiagramLabels();
}
// 253: the drawings carry no text; their labels are DOM text from the tank's sidecar (src/ui/technicalDiagramLabels.ts),
// laid out at the drawing's shown size. Inline the dossier's head names the tank; zoomed, the overlay's header does.
let diagramLabels: { dispose(): void } | null = null;
let diagramLabelsFor = '';
const diagramLabelData = new Map<string, Promise<TechnicalLabelData | null>>();
function mountDiagramLabels(): void {
  const id = selectedId, view = diagram, zoomed = diagramFigure.classList.contains('is-zoomed');
  const key = id ? `${id}|${view}|${zoomed}` : '';
  if (key === diagramLabelsFor) return;
  diagramLabelsFor = key;
  diagramLabels?.dispose();
  diagramLabels = null;
  if (!id) return;
  // (the labels' module loads with the first drawing, not with the page)
  void import('../ui/technicalDiagramLabels.ts').then(async (labels) => {
    const kind = labels.technicalKindOfView(view);
    if (!kind) return;
    let pending = diagramLabelData.get(id);
    if (!pending) {
      pending = fetch(labels.technicalLabelsUrl(id)).then((response) => (response.ok ? response.json() : null))
        .then((json) => (json ? labels.parseTechnicalLabels(json, id) : null)).catch(() => null);
      diagramLabelData.set(id, pending);
    }
    const data = await pending;
    if (!data || diagramLabelsFor !== key) return;
    const record = recordById.get(id);
    diagramLabels = labels.mountTechnicalDiagramLabels(diagramFigure, data, kind,
      record ? { name: record.displayName, tier: record.tierNumeral } : null, { header: zoomed, image: diagramImage });
  });
}

wireRoving($<HTMLElement>('.peer-switch'), (value) => {
  peerScale = value === 'class' ? 'class' : 'fleet';
  writePrefs();
  if (selectedId) renderStats(recordById.get(selectedId)!);
});
for (const button of document.querySelectorAll<HTMLElement>('.peer-switch [data-value]')) {
  const on = button.dataset.value === peerScale;
  button.setAttribute('aria-checked', String(on));
  button.tabIndex = on ? 0 : -1;
}

function decorateTake(id: string): void {
  const still = $<HTMLImageElement>('#takeStill');
  const record = recordById.get(id);
  still.src = record?.image || '';
  revealWhenReady(still.parentElement!, still);
  for (const layer of takeMedia.querySelectorAll(':scope > picture')) layer.remove();
  takeMedia.classList.remove('cot-hc', 'hc-loaded');
  if (heroCards) heroCards.module.decorateHeroCard(takeMedia, id, heroCards.manifest, { tankSizes: '480px', flagSizes: '480px', priority: true });
}
// a still the network dropped loads again, quietly, once it is back
window.addEventListener('online', () => {
  const still = $<HTMLImageElement>('#takeStill');
  const src = still.getAttribute('src');
  if (!src || !still.parentElement?.hasAttribute('data-failed')) return;
  still.src = src;
  revealWhenReady(still.parentElement, still);
});

function delta(stat: StatDef | null, own: number, rival: number, digits = 0): { delta?: string; better?: boolean } {
  const diff = own - rival;
  if (!Number.isFinite(diff) || Math.abs(diff) < 10 ** -Math.max(1, digits) / 2 || stat?.better === 0) return {};
  const text = `${diff > 0 ? '+' : '−'}${formatNumber(Math.abs(diff), { maximumFractionDigits: digits })}`;
  return { delta: text, better: (stat ? stat.better : 1) * diff > 0 };
}
function renderOverview(record: GalleryRecord): void {
  const unit = (key: string): string => `<small>${esc(t(key))}</small>`;
  $('#dossierFacts').innerHTML = [
    ['gun', formatNumber(record.metrics.caliberMm), unit('gallery.unit.mm'), t('gallery.stat.caliber')],
    ['team', formatNumber(record.metrics.crewCount), unit('gallery.unit.crew'), t('gallery.stat.crew')],
    ['track', formatNumber(record.metrics.weightTons, { maximumFractionDigits: 1 }), unit('gallery.unit.t'), t('gallery.dossier.spec.weight')],
    ['shield', formatNumber(record.metrics.hp), unit('gallery.unit.hitPoints'), t('gallery.dossier.spec.hp')],
  ].map(([glyph, value, suffix, label]) => `<div data-tip="${esc(label)}">${icon(glyph as IconId, { size: 16 })}`
    + `<b class="num">${value}${suffix}</b><span class="sr-only">${esc(label)}</span></div>`).join('');
  const rival = rivalId ? recordById.get(rivalId) : null;
  $('#ratingGrid').innerHTML = RATINGS.map(([key, label, glyph]) => {
    const value = record.ratings[key];
    const rivalValue = rival?.ratings[key];
    return statRow({
      label: t(label), value: formatNumber(value), unit: '/100', icon: glyph,
      cells: scaleCells(value, 0, 100), rivalCells: rivalValue === undefined ? undefined : scaleCells(rivalValue, 0, 100),
      ...(rivalValue === undefined ? {} : delta(null, value, rivalValue)),
    });
  }).join('');
  const spec = getSpec(record.id) as GalleryVehicleSpec;
  const plates = [...(spec.armor?.hullPlates || []), ...(spec.armor?.turretPlates || [])];
  const features: string[] = [];
  if (plates.some((plate) => plate.kind === 'era' || plate.era)) features.push(`<li>${icon('armorFlashlight', { size: 16 })}${esc(t('gallery.legend.armor.era'))}</li>`);
  if (plates.some((plate) => plate.kind === 'composite')) features.push(`<li>${icon('layerArmor', { size: 16 })}${esc(t('gallery.feature.composite'))}</li>`);
  if (plates.some((plate) => plate.kind === 'spaced')) features.push(`<li>${icon('shield', { size: 16 })}${esc(t('gallery.feature.spaced'))}</li>`);
  if (record.metrics.autoloader) {
    features.push(`<li>${icon('autoloader', { size: 16 })}<span class="num">${formatNumber(record.metrics.magazineSize)} × ${formatNumber(record.metrics.intraClipS, { maximumFractionDigits: 1 })} ${esc(t('gallery.unit.s'))}</span></li>`);
  }
  const noteKey = tankLabelRecord(spec).noteKey;
  const note = noteKey ? t(noteKey) : '';
  if (note && note !== noteKey) features.push(`<li class="note">${esc(note.trim())}</li>`);
  $('#dossierFeatures').innerHTML = features.join('');
  renderVersus(record);
}
function renderStats(record: GalleryRecord): void {
  const ranges = peerRanges(record);
  const rival = rivalId ? recordById.get(rivalId) : null;
  // the deltas and the outlined cell are the overview's rival, named here (the switch above sets only the bars' scale)
  const ref = $('#statRef');
  ref.hidden = !rival;
  if (rival) ref.innerHTML = `<i aria-hidden="true"></i>${esc(t('gallery.stats.versus', { name: rival.shortName || rival.displayName }))}`;
  $('#statGroups').innerHTML = STAT_GROUPS.map(([group, label, glyph]) => {
    const rows = STATS.filter((stat) => stat.group === group).map((stat) => {
      const value = stat.value(record);
      if (!Number.isFinite(value) || (value <= 0 && stat.key !== 'turretTraverse')) return '';
      const range = ranges.get(stat.key) ?? [0, 0];
      const rivalValue = rival ? stat.value(rival) : undefined;
      return statRow({
        label: t(stat.label), value: formatStat(stat, value), unit: stat.unit ? t(stat.unit) : undefined, icon: stat.icon,
        cells: statCells(stat, value, range),
        rivalCells: rivalValue && rivalValue > 0 ? statCells(stat, rivalValue, range) : undefined,
        ...(rivalValue && rivalValue > 0 ? delta(stat, value, rivalValue, stat.digits) : {}),
      });
    }).join('');
    return rows ? `<section class="stat-group"><h2>${icon(glyph, { size: 16 })}${esc(t(label))}</h2>${rows}</section>` : '';
  }).join('');
}
/** A shell type in the locale (脱壳弹, not APFSDS): the Garage's names, read by key so the page loads no Garage module
 * (importing shellLabels.ts split it into a chunk of its own on the game's boot path). */
const SHELL_TYPE_KEY = 'garage.shellType.';
const shellTypeName = (type: string): string => {
  const key = SHELL_TYPE_KEY + type.replace(/-(?:T|MP)$/, '');
  const name = t(key);
  return name === key ? type : name;
};
function renderAmmo(record: GalleryRecord): void {
  const best = Math.max(1, ...records.flatMap((other) => other.shells.map((shell) => shell.penetrationMm)));
  $('#ammunitionList').innerHTML = record.shells.map((shell) => {
    const type = String(shell.type || '').toUpperCase();
    const glyph = shellIconId(type);
    const name = keepDesignation(shell.name || shell.type), typeName = shellTypeName(type);
    // the round's type once: a designation that already names it ("3BK31 HEAT", "3OF82 HE-Frag") takes no subtitle
    const named = name.split(/[^A-Za-z]+/).includes(typeName);
    return `<div class="shell">${icon(glyph, { size: 24 })}<span class="shell-id"><b>${esc(name)}</b>${named ? '' : `<small>${esc(typeName)}</small>`}</span>`
      + `<span class="shell-nums"><span data-tip="${esc(t('gallery.stat.penetration'))}"><b class="num">${formatNumber(shell.penetrationMm)}</b>${esc(t('gallery.unit.mm'))}</span>`
      + `<span data-tip="${esc(t('gallery.stat.damage'))}">${icon('damage', { size: 14 })}<b class="num">${formatNumber(shell.damage)}</b></span>`
      + `<span data-tip="${esc(t('gallery.stat.velocity'))}">${icon('speed', { size: 14 })}<b class="num">${formatNumber(shell.velocityMps)}</b>${esc(t('gallery.unit.mps'))}</span></span>`
      + `<span class="sr-only">${esc(t('gallery.stat.penetration'))}</span>`
      + `${scale20(scaleCells(shell.penetrationMm, 0, best))}</div>`;
  }).join('');
}

/* the versus card: any rival, three head-to-head numbers and both vehicles at true scale */
function defaultRival(record: GalleryRecord): string | null {
  const own = flagIconCode(record.nation);
  const score = (other: GalleryRecord): number => Math.abs(other.tier - record.tier) * 1000
    + (other.vehicleClass?.id === record.vehicleClass?.id ? 0 : 500)
    + Math.abs(other.ratings.firepower + other.ratings.protection + other.ratings.mobility
      - record.ratings.firepower - record.ratings.protection - record.ratings.mobility);
  const candidates = records.filter((other) => other.id !== record.id && flagIconCode(other.nation) !== own);
  return candidates.sort((a, b) => score(a) - score(b) || a.id.localeCompare(b.id))[0]?.id ?? null;
}
// the rival is the kit's picker menu (pickerMenu.ts): the fleet by nation, each with its tier and nation, a chip per
// nation, search, favourites and recents (a raw select of about 220 in the census)
let rivalMenu: PickerMenu | null = null;
function populateRivals(): void {
  const order = new Map(flagCodes.map((code, index) => [code, index]));
  const items = [...records].sort((a, b) => (order.get(flagIconCode(a.nation)) ?? 99) - (order.get(flagIconCode(b.nation)) ?? 99)
    || a.displayName.localeCompare(b.displayName, getLocale())).map((record) => ({
    id: record.id, name: record.displayName, facts: [t('gallery.tier', { tier: record.tierNumeral }), nationName(record.nation)],
    tags: [flagIconCode(record.nation)], media: { poster: tankThumbUrl(record.id), tank: true },
  }));
  if (rivalMenu) { rivalMenu.setItems(items, rivalId); return; }
  rivalMenu = createPickerMenu($<HTMLElement>('#rivalMenu'), { id: 'gallery-rival', label: t('gallery.versus.rival'), items,
    value: rivalId, layout: 'list', text: pickerText(), memory: 'rival', bounds: rivalMenuBounds,
    filters: flagCodes.map((code) => ({ id: code, label: flagLabel(code) })), onChoose: (item) => setRival(item.id, true) });
}
/** The rival menu's room: the dossier's scrolling panel, or on a stacked page the window under the sticky site bar (the
 * g14 critic: at 1024 x 600 the menu climbed over the bar's language switch and Play button). */
function rivalMenuBounds(): { top: number; bottom: number; left?: number; right?: number; span?: boolean } {
  const bar = document.querySelector('.public-nav')?.getBoundingClientRect();
  // on the bar's rule, which hangs 1 px below it (publicNav.css .public-nav::after): the menu's ring lies on that rule,
  // opaque over the dossier's picture, which runs under it
  const top = Math.max(0, bar ? bar.bottom + 1 : 0);
  const panel = document.querySelector<HTMLElement>('.dossier-scroll');
  if (!panel) return { top, bottom: innerHeight };
  // with its sides: a dossier no wider than a column is spanned (pickerMenu.ts placeMenu), so no sliver of its text shows
  // beside the menu (the 261 critics: the title sliced, "O" and "Ti" beside it, at 1024 and 900 where it does not scroll)
  const room = panelRoom(panel);
  const scrolls = /auto|scroll/.test(getComputedStyle(panel).overflowY);
  // spanned at every width: at 2560 the dossier widens past a column (the 261 critic: a trigger-wide menu cut its text)
  return { top: scrolls ? Math.max(top, room.top) : top, bottom: scrolls ? room.bottom : innerHeight, left: room.left, right: room.right,
    span: true };
}
/** The rival's side of the versus card (07-gallery .vsc .s): its flag and its silhouette facing the selection; the
 * picker above names it (the g10 critic read the name under the picker as the same name twice). */
function versusSide(record: GalleryRecord): string {
  return `${flag(record.nation, 'sm')}${silhouette(record.id, 'right')}`;
}
function renderVersus(record: GalleryRecord): void {
  const rival = rivalId ? recordById.get(rivalId) : null;
  // the selection's side is its silhouette alone: its name and flag are the dossier's head (UI-LOCKDOWN G7, G8)
  $('#versusOwn').innerHTML = silhouette(record.id, 'left');
  if (!rival) { $('#versusMid').innerHTML = ''; $('#versusRival').innerHTML = ''; return; }
  rivalMenu?.setValue(rival.id);
  $('#versusRival').innerHTML = versusSide(rival);
  // every number carries its unit (247 round 2): penetration in mm, reload in seconds, top speed in km/h (hit points are
  // the dossier's facts, UI-LOCKDOWN G9)
  const rows: Array<[IconId, string, string, number, number, number]> = [
    ['penetration', 'gallery.stat.penetration', 'gallery.unit.mm', record.metrics.bestPenetrationMm, rival.metrics.bestPenetrationMm, 1],
    ['reload', 'gallery.stat.reload', 'gallery.unit.s', record.metrics.reloadS, rival.metrics.reloadS, -1],
    ['speed', 'gallery.stat.speed', 'gallery.unit.kmh', record.metrics.topSpeedKmh, rival.metrics.topSpeedKmh, 1],
  ];
  $('#versusMid').innerHTML = rows.map(([glyph, label, unitKey, own, other, better]) => {
    const ownBetter = (own - other) * better > 0;
    const otherBetter = (other - own) * better > 0;
    const digits = glyph === 'reload' ? 1 : 0;
    const value = (n: number, wins: boolean): string => `<em class="num${wins ? ' w' : ''}">${formatNumber(n, { maximumFractionDigits: digits })}`
      + `<small>${esc(t(unitKey))}</small></em>`;
    return `<div data-tip="${esc(t(label))}">${value(own, ownBetter)}${icon(glyph, { size: 14, label: t(label) })}${value(other, otherBetter)}</div>`;
  }).join('');
  void drawTrueScale($<HTMLCanvasElement>('#versusScale'), [
    { id: record.id, lengthM: record.dimensions.overallLengthM, tone: '--ink-1', facing: 'right' },
    { id: rival.id, lengthM: rival.dimensions.overallLengthM, tone: '--ink-3', facing: 'left' },
  ], { layout: 'apart', label: `${record.displayName} · ${rival.displayName}` });
}
function drawStageScale(record: GalleryRecord): void {
  const rival = rivalId ? recordById.get(rivalId) : null;
  void drawTrueScale($<HTMLCanvasElement>('#stageScale'), [
    ...(rival ? [{ id: rival.id, lengthM: rival.dimensions.overallLengthM, tone: '--ink-4', facing: 'right' as const }] : []),
    { id: record.id, lengthM: record.dimensions.overallLengthM, tone: '--ink-2', facing: 'right' },
  ], { layout: 'overlay', human: $<HTMLElement>('#stageHuman'), label: t('gallery.inset.aria', { name: record.displayName }) });
}
function setRival(id: string | null, pinned: boolean): void {
  rivalId = id && recordById.has(id) && id !== selectedId ? id : null;
  rivalPinned = pinned && !!rivalId;
  const record = selectedId ? recordById.get(selectedId) : null;
  if (!record) return;
  renderOverview(record);
  renderStats(record);
  drawStageScale(record);
  updateUrl();
}

function renderDossier(record: GalleryRecord): void {
  // a newly chosen vehicle opens at its film and name, not at the last one's scroll
  if (record.id !== dossierShownId) { dossierShownId = record.id; $('.dossier-scroll').scrollTop = 0; }
  $('#dossierName').textContent = keepDesignation(record.displayName);
  // a long name takes a second line before it gives up size: one title scale across the fleet
  $('#dossierName').style.setProperty('--name-fit', String(Math.max(0.85, Math.min(1, 24 / Math.max(1, record.displayName.length)))));
  const flagImage = $<HTMLImageElement>('#dossierFlag');
  flagImage.src = flagIconUrl(record.nation);
  flagImage.dataset.tip = nationName(record.nation);
  // the data voice's rules (the kit's .cot-c-rules): tier, class, role and era, a glyph and a value each
  const tags = [
    `<span>${esc(t('gallery.tier', { tier: record.tierNumeral }))}</span>`,
    record.vehicleClass ? `<span>${icon(CLASS_ICONS[record.vehicleClass.id] || 'vehicle', { size: 14 })}${esc(record.vehicleClass.shortLabel)}</span>` : '',
    record.battleRole ? `<span>${icon(ROLE_ICONS[record.battleRole.id] || 'vehicle', { size: 14 })}${esc(record.battleRole.label)}</span>` : '',
    `<span>${icon(GALLERY_ERA_ICONS[record.eraKey || ''] || 'clock', { size: 14 })}${esc(record.era)}</span>`,
    record.developmentOnly ? `<span class="is-dev">${esc(record.rosterTag || t('garage.card.devTag'))}</span>` : '',
  ];
  $('#dossierTags').innerHTML = `<span class="cot-c-rules">${tags.join('')}</span>`;
  decorateTake(record.id);
  if (!rivalPinned || rivalId === record.id) { rivalId = defaultRival(record); rivalPinned = false; }
  renderOverview(record);
  renderStats(record);
  renderAmmo(record);
  renderDiagram();
  drawStageScale(record);
  const favourite = $('#favourite');
  favourite.setAttribute('aria-pressed', String(favourites.has(record.id)));
}

/** A pose slider's fill runs from its zero to its value (from its left edge it read as half the range at 0°). */
function paintPoseFill(input: HTMLInputElement): void {
  const min = Number(input.min), max = Number(input.max);
  const at = (value: number): string => `${(((value - min) / Math.max(1e-6, max - min)) * 100).toFixed(2)}%`;
  const zero = Math.min(max, Math.max(min, 0)), value = Number(input.value);
  input.style.setProperty('--lo', at(Math.min(zero, value)));
  input.style.setProperty('--hi', at(Math.max(zero, value)));
}

function updateArticulation(): void {
  for (const id of ['hullYaw', 'turretYaw', 'gunPitch']) paintPoseFill($<HTMLInputElement>(`#${id}`));
  if (!visual) return;
  const hullYaw = Number($('#hullYaw').value);
  const turretYaw = Number($('#turretYaw').value);
  const gunInput = $('#gunPitch');
  const spec = selectedId ? getSpec(selectedId) : null;
  if (spec?.gunPitchByYawDeg) {
    gunInput.min = String(THREE.MathUtils.radToDeg(
      minimumMechanicalGunPitch(spec, THREE.MathUtils.degToRad(turretYaw))));
    gunInput.value = String(Math.max(Number(gunInput.min), Number(gunInput.value)));
  }
  const gunPitch = Number(gunInput.value);
  paintPoseFill(gunInput);
  visual.root.rotation.y = THREE.MathUtils.degToRad(hullYaw);
  const turret = visual.root.getObjectByName('rig_turret');
  const gun = visual.root.getObjectByName('rig_gun');
  if (turret) turret.rotation.y = THREE.MathUtils.degToRad(turretYaw);
  if (gun) gun.rotation.x = -THREE.MathUtils.degToRad(gunPitch);
  visual.root.updateMatrixWorld(true);
  stageBounds.copy(visibleBox(visual.root)).expandByScalar(STAGE_DEPTH_MARGIN_M);
  anatomyView?.update();
  $('#hullYawValue').textContent = `${hullYaw}°`;
  $('#turretYawValue').textContent = `${turretYaw}°`;
  $('#gunPitchValue').textContent = `${Number(gunPitch.toFixed(2))}°`;
  surfaceMarkup.updatePose();
  damageLab?.syncPose();
}

function configureArticulation(spec: GalleryVehicleSpec): void {
  const hullInput = $('#hullYaw');
  const turretInput = $('#turretYaw');
  const gunInput = $('#gunPitch');
  const fixedMount = spec.role === 'td' && Number(spec.turretTraverseDegS || 0) <= 0;
  turretInput.min = fixedMount ? String(-(Number(spec.gunTraverseDeg || 12))) : '-180';
  turretInput.max = fixedMount ? String(Number(spec.gunTraverseDeg || 12)) : '180';
  turretInput.value = '0';
  hullInput.value = '0';
  gunInput.min = String(-Math.abs(Number(spec.gunDepressionDeg || 8)));
  gunInput.max = String(Math.abs(Number(spec.gunElevationDeg || 18)));
  gunInput.value = '0';
  updateArticulation();
}

function setMode(requestedMode: string | undefined, announce = true): void {
  const nextMode: GalleryMode = !damageLab?.combat.destroyed && GALLERY_MODES
    .includes((requestedMode || '') as GalleryMode) ? requestedMode as GalleryMode : 'appearance';
  const previousMode = activeMode;
  activeMode = nextMode;
  if (isAnatomyMode(activeMode)) showAnatomy(activeMode, announce);
  else anatomyView?.hide();
  surfaceMarkup.setActive(activeMode === 'markup');
  modeButtons.forEach((button) => {
    const on = button.dataset.value === activeMode;
    button.setAttribute('aria-checked', String(on));
    button.tabIndex = on ? 0 : -1;
    button.disabled = !!damageLab?.combat.destroyed && button.dataset.value !== 'appearance';
  });
  if (previousMode !== activeMode || !isAnatomyMode(activeMode)) $('#inspectionReadout').hidden = true;
  markupTab.hidden = activeMode !== 'markup';
  markupTab.disabled = activeMode !== 'markup';
  if (activeMode === 'markup' && previousMode !== 'markup') selectTab('markup');
  else if (activeMode !== 'markup' && activeTab === 'markup') selectTab('overview');
  if (activeMode === 'markup') {
    controls.autoRotate = false;
    $('#autoRotate').setAttribute('aria-pressed', 'false');
  }
  renderLegend();
  updateUrl();
  if (announce && activeMode === 'markup') announceLine(t('gallery.view.toast.markupReady', { count: surfaceMarkup.getState().selectableMeshes }));
}

function disposeTank(): void {
  inAction?.show(null); // the outgoing vehicle's take stops with it
  damageWorkbench.attach(null);
  damageLab?.dispose(); damageLab = null; damageBurst.clear();
  surfaceMarkup.detachTank();
  anatomyView?.release();
  if (visual) {
    visual.root.removeFromParent();
    visual.dispose();
  }
  visual = null;
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}
/** After the next paint: the frame's callback, then a task (frameScheduler.ts nextPaintFrame, kept off the Gallery's
 *  boot requests). */
function afterNextPaint(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));
}

// Gallery models remain first-party/procedural-only, but show the same authored field equipment players see in the
// garage and battle. Measurement tools that omit this explicit opt-in still get bare hulls.
const GALLERY_TANK_OPTIONS: CreateTankOptions = { camoSeed: 4242, quality: 'high', proceduralOnly: true, decor: true };

/** The selected tank's model, built a frame-sized slice at a time (null once a later selection superseded it). A
 *  decoration that fails the sliced build falls back to the synchronous one, which keeps its warning and bare fitting. */
async function buildGalleryTank(id: string, current: () => boolean): Promise<GalleryVisual | null> {
  let sliceStartedAt = performance.now();
  // the decoration plans in the decor worker (stage 2b): a step that yields its wait is awaited, never polled
  let steps: ReturnType<typeof createTankSteps> | null = createTankSteps(id, engineCtx,
    { ...GALLERY_TANK_OPTIONS, decorPlanner: offThreadDecorPlanner() ?? undefined });
  try {
    for (;;) {
      const result = steps.next();
      if (result.done) {
        steps = null;
        if (current()) return result.value as GalleryVisual;
        result.value.dispose();
        return null;
      }
      if (result.value) { await result.value; sliceStartedAt = performance.now(); }
      else if (performance.now() - sliceStartedAt >= 10) { await nextFrame(); sliceStartedAt = performance.now(); }
      if (!current()) return null;
    }
  } catch (error) {
    steps = null;
    console.warn('[gallery] the sliced build failed; building at once', error);
    return current() ? createTank(id, engineCtx, GALLERY_TANK_OPTIONS) as GalleryVisual : null;
  } finally {
    // an abandoned build closes its iterator, which disposes what it had made
    steps?.return(undefined as never);
  }
}

async function loadTank(
  requestedId: string | null | undefined,
  options: GalleryLoadOptions = {},
): Promise<void> {
  let id = requestedId;
  if (!id || !recordById.has(id)) id = records[0]?.id;
  if (!id) return;
  const version = ++loadVersion;
  window.__TANK_GALLERY_READY = false;
  selectedId = id;
  const record = recordById.get(id);
  if (!record) throw new Error(`Missing Gallery record for ${id}`);
  // the dossier and the list answer at once; the model follows, built in frame-sized slices while the outgoing tank
  // stays on the stage under the loading silhouette (click-perf-244: the whole build was one long task after the paint)
  renderDossier(record);
  markSelectedRow();
  loadingSilhouette.style.setProperty('--sil', `url(${iconUrl(id, 'side_silhouette')})`);
  loadingSilhouette.removeAttribute('data-skeleton');
  loadingState.classList.remove('hidden');
  await nextFrame();
  if (version !== loadVersion) return;

  await ensureTankBuilder(id);
  if (version !== loadVersion) return;
  const spec = getSpec(id) as GalleryVehicleSpec;
  const built = await buildGalleryTank(id, () => version === loadVersion);
  if (!built) return;
  // Its programs link before it shows (KHR_parallel_shader_compile where the GPU has it): the first frame with a new
  // tank used to compile them inside the render loop (click-perf-244: ~300 ms per row press on desktop).
  await renderer.compileAsync(built.root, camera, scene).catch(() => { /* the first frame compiles what is left */ });
  if (version !== loadVersion) { built.dispose(); return; }
  disposeTank();
  visual = built;
  visual.centerOnPresentationPoint?.(0, 0);
  visual.seatOnFloor?.(GALLERY_FLOOR_Y_M);
  scene.add(visual.root);
  forceHeroLod(visual.root);
  visual.root.updateMatrixWorld(true);
  surfaceMarkup.attachTank(visual.root, id);
  visual.setGroundSampler(() => GALLERY_FLOOR_Y_M); // the lab's floor from the first frame (the lab sets it again)
  for (const input of [$('#hullYaw'), $('#turretYaw'), $('#gunPitch')]) input.disabled = false;
  configureArticulation(spec);
  frameView(options.view || 'hero');
  setMode(options.mode || activeMode, false);
  updateUrl();
  await nextFrame();
  loadingState.classList.add('hidden');
  if (version === loadVersion) showInAction(id);
  const { createDamageLab } = await loadDamageLab();
  if (version !== loadVersion || !visual) return;
  damageLab = createDamageLab(getSpec(id), visual, GALLERY_FLOOR_Y_M);
  damageLab.syncPose();
  damageWorkbench.attach(damageLab);
  setMode(activeMode, false); // the overlays read the lab's armour from here on
  window.__TANK_GALLERY_READY = true;
}

function pickInspection(clientX: number, clientY: number): void {
  anatomyView?.pickAt(clientX, clientY);
}

async function writeClipboard(text: string, successMessage: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    showToast(successMessage, { severity: 'success' });
  } catch (_) {
    showToast(t('gallery.toast.clipboardUnavailable'), { severity: 'warning' });
  }
}

function renderFrame(): void {
  if (visual) fitGalleryDepth(camera, stageBounds, GALLERY_FLOOR_Y_M);
  if (anatomyView?.mode) anatomyView.render();
  else renderer.render(scene, camera);
}
function savePhoto(): void {
  if (!selectedId) return;
  renderFrame();
  // the press answers (the interaction census: Photo gave none): the file's download, or why it failed
  renderer.domElement.toBlob((blob) => {
    if (!blob) { showToast(t('gallery.photo.failed'), { severity: 'error' }); return; }
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `claude-of-tanks-${selectedId}-${activeView}.png`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast(t('gallery.photo.saved'), { severity: 'success' });
  }, 'image/png');
}

function resize(): void {
  const width = Math.max(1, viewport.clientWidth);
  const height = Math.max(1, viewport.clientHeight);
  renderer.setSize(width, height, false);
  if (visual) {
    const bounds = visibleBox(visual.root);
    const fit = resizeGalleryCamera(camera.position, controls.target, camera.up,
      bounds, camera.fov, camera.aspect, width / height);
    applyGalleryCameraRange(camera, controls, galleryFog, bounds, fit);
  }
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  controls.update();
}

/** The next or previous vehicle of the filtered list. */
function stepVehicle(step: number): void {
  if (!filteredRecords.length) return;
  const at = filteredRecords.findIndex((record) => record.id === selectedId);
  const next = filteredRecords[(at + step + filteredRecords.length) % filteredRecords.length];
  if (next) void loadTank(next.id);
}

$('#gallerySearch').addEventListener('input', applyFilters);
$('#archiveFilters').addEventListener('submit', (event) => event.preventDefault());
for (const id of ['#nationFacets', '#classFacets', '#eraFacets', '#roleFacets', '#extraFacets']) $(id).addEventListener('click', onFacet);
$('#sortDirection').addEventListener('click', () => {
  browse.descending = !browse.descending;
  syncSortDirection();
  writePrefs();
  applyFilters();
});
wireRoving($<HTMLElement>('.layout-switch'), (value) => {
  browse.layout = value === 'grid' ? 'grid' : 'list';
  writePrefs();
  renderRoster();
  markSelectedRow();
});
phoneQuery?.addEventListener?.('change', () => { renderRoster(); markSelectedRow(); });
vehicleList.addEventListener('click', (event) => {
  const target = event.target as Element | null;
  if (target?.closest('[data-clear-filters]')) {
    Object.assign(browse, { nation: '', era: '', vehicleClass: '', role: '', autoloader: false, take: false, concept: false, favourite: false });
    $('#gallerySearch').value = '';
    renderFacets();
    applyFilters();
    return;
  }
  const row = target?.closest<HTMLElement>('.it');
  if (row?.dataset.id) void loadTank(row.dataset.id);
});
vehicleList.addEventListener('keydown', (event) => {
  const row = (event.target as Element | null)?.closest<HTMLElement>('.it');
  if (!row) return;
  const rows = [...vehicleList.querySelectorAll<HTMLElement>('.it')];
  const at = rows.indexOf(row);
  const columns = effectiveLayout() === 'grid' && !phoneQuery?.matches ? 2 : 1;
  const steps: Readonly<Record<string, number>> = phoneQuery?.matches
    ? { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -1, ArrowDown: 1 }
    : { ArrowUp: -columns, ArrowDown: columns, ArrowLeft: columns > 1 ? -1 : 0, ArrowRight: columns > 1 ? 1 : 0 };
  let to = -1;
  if (event.key === 'Home') to = 0;
  else if (event.key === 'End') to = rows.length - 1;
  else if (steps[event.key]) to = Math.max(0, Math.min(rows.length - 1, at + steps[event.key]));
  if (to < 0) return;
  event.preventDefault();
  row.tabIndex = -1;
  rows[to].tabIndex = 0;
  rows[to].focus({ preventScroll: true });
  revealRow(rows[to]);
});
// A row under the pointer fetches its vehicle's builder chunks, so the click only builds (nav-perf-240).
const warmedBuilders = new Set<string>();
vehicleList.addEventListener('pointerover', (event) => {
  const id = event.target instanceof Element ? event.target.closest<HTMLElement>('.it')?.dataset.id : undefined;
  if (!id || warmedBuilders.has(id)) return;
  warmedBuilders.add(id);
  ensureTankBuilder(id).catch(() => warmedBuilders.delete(id));
});
$('#hullYaw').addEventListener('input', updateArticulation);
$('#turretYaw').addEventListener('input', updateArticulation);
$('#gunPitch').addEventListener('input', updateArticulation);
// (a layer whose module did not arrive keeps the kit's error state: its press reloads the page once online)
wireRoving(layerDock, (mode) => { if (!pressFailed(modeButtons.find((button) => button.dataset.value === mode))) setMode(mode); });
$('#autoRotate').addEventListener('click', () => {
  controls.autoRotate = !controls.autoRotate;
  controls.autoRotateSpeed = 0.75;
  $('#autoRotate').setAttribute('aria-pressed', String(controls.autoRotate));
});
$('#photo').addEventListener('click', savePhoto);
// the proving ground (v2 progression, 2026-10-17): this vehicle on the game's measured range (game/testDriveLink.ts)
$('#testDrive').addEventListener('click', () => {
  if (!selectedId) return;
  location.href = hrefForLocale(testDriveHref(selectedId), getLocale());
});
$('#favourite').addEventListener('click', () => {
  if (!selectedId) return;
  if (favourites.has(selectedId)) favourites.delete(selectedId); else favourites.add(selectedId);
  $('#favourite').setAttribute('aria-pressed', String(favourites.has(selectedId)));
  writePrefs();
  renderFacets();
  if (browse.favourite) applyFilters();
});
$('#copyLink').addEventListener('click', () => writeClipboard(
  location.href,
  t('gallery.toast.linkCopied'),
));
$('#copySpec').addEventListener('click', () => {
  if (!selectedId) return;
  writeClipboard(JSON.stringify(
    serializeGallerySpec(getSpec(selectedId) as GalleryVehicleSpec),
    null,
    2,
  ), t('gallery.toast.specCopied'));
});
renderer.domElement.addEventListener('pointerdown', (event) => {
  pointerStart = { x: event.clientX, y: event.clientY };
});
renderer.domElement.addEventListener('pointerup', (event) => {
  if (!pointerStart) return;
  const moved = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
  pointerStart = null;
  if (moved >= 5) return;
  if (damageWorkbench.probe && damageLab) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointerNdc.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(pointerNdc, camera);
    damageEnd.copy(raycaster.ray.direction).multiplyScalar(300).add(raycaster.ray.origin);
    damageWorkbench.showTrace(damageLab.trace(raycaster.ray.origin, damageEnd));
    return;
  }
  if (activeMode === 'markup') surfaceMarkup.selectScreen(event.clientX, event.clientY, event.shiftKey);
  else pickInspection(event.clientX, event.clientY);
});
renderer.domElement.addEventListener('pointermove', (event) => {
  if (event.buttons) return;
  if (activeMode === 'markup') surfaceMarkup.hoverScreen(event.clientX, event.clientY);
  else if (event.pointerType === 'mouse') anatomyView?.hoverAt(event.clientX, event.clientY);
});
renderer.domElement.addEventListener('pointerleave', () => { surfaceMarkup.clearHover(); anatomyView?.clearHover(); });

document.addEventListener('keydown', (event) => {
  const editing = /input|select|textarea/i.test(document.activeElement?.tagName || '');
  if (event.key === '/' && !editing) {
    event.preventDefault();
    $('#gallerySearch').focus();
    return;
  }
  if (editing || event.altKey) return;
  if (event.shiftKey && /^[1-4]$/.test(event.key) && activeMode === 'markup') {
    surfaceMarkup.setOperation(MARKUP_OPERATIONS[Number(event.key) - 1], true);
    return;
  }
  if (!event.ctrlKey && !event.metaKey && /^[1-5]$/.test(event.key)) {
    setMode(GALLERY_MODES[Number(event.key) - 1]);
    return;
  }
  if (!event.ctrlKey && !event.metaKey && (event.key === '[' || event.key === ']')) {
    event.preventDefault();
    stepVehicle(event.key === ']' ? 1 : -1);
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.code === 'KeyZ' && activeMode === 'markup') {
    event.preventDefault();
    surfaceMarkup.undo();
    return;
  }
  if (event.code === 'Delete' && activeMode === 'markup') surfaceMarkup.deleteSelected();
});

window.addEventListener('popstate', () => {
  const params = new URLSearchParams(location.search);
  loadTank(linkTankId(params), { mode: params.get('layer') || 'appearance' });
});
new ResizeObserver(resize).observe(viewport);

let previousFrameTime = performance.now();
function animate() {
  const time = performance.now(), dt = Math.min(.05, (time - previousFrameTime) / 1000); previousFrameTime = time;
  damageLab?.update(dt); damageBurst.update(dt);
  controls.update();
  anatomyView?.update();
  renderFrame();
  requestAnimationFrame(animate);
}

renderFacets();
populateSort();
syncLayoutSwitch();
populateRivals();
applyFilters();
resize();
animate();

const initial = new URLSearchParams(location.search);
if (initial.get('metric') === 'ce' || initial.get('metric') === 'physical') armorMetric = initial.get('metric') as ArmorMetric;
// A link names its vehicle under its own id schema (`&ids=`; none = 1, SSOT 2.19).
const preferredId = linkTankId(initial);
const initialId = preferredId && recordById.has(preferredId)
  ? preferredId
  : (recordById.has('m1a1_abrams_hc') ? 'm1a1_abrams_hc' : records[0]?.id);
const initialRival = initial.get('vs');
if (initialRival && recordById.has(initialRival) && initialRival !== initialId) { rivalId = initialRival; rivalPinned = true; }
loadTank(initialId, { mode: initial.get('layer') || 'appearance' });
// The browse pane, the dossier and the view labels fill synchronously above: they show at once, in place (no shift).
document.documentElement.classList.add('gallery-ready');
// The faces arriving rewrap the filter chips above the fleet: keep the selected row in view once they have.
void document.fonts?.ready.then(() => revealRow(vehicleList.querySelector<HTMLElement>('.it[aria-selected=true]')));

window.__TANK_GALLERY = {
  get ready() { return !!window.__TANK_GALLERY_READY; },
  get count() { return records.length; },
  loadTank,
  setMode,
  frameView,
  /** Reproduces a camera a surface-markup export recorded (its camera.position and camera.target). */
  setCamera: (position: readonly [number, number, number], target: readonly [number, number, number]) => {
    camera.up.set(0, 1, 0);
    camera.position.set(...position);
    controls.target.set(...target);
    controls.update();
  },
  getState: () => ({
    selectedId,
    rivalId,
    mode: activeMode,
    tab: activeTab,
    shown: filteredRecords.length,
    overlayCount: anatomyView?.mode ? anatomyView.count : 0,
    anatomy: anatomyView?.state() || null,
    damage: damageLab?.snapshot(),
    markup: surfaceMarkup.getState(),
    camera: { position: camera.position.toArray(), target: controls.target.toArray() },
  }),
  selectTab: (tab: DossierTab) => selectTab(tab),
  setRival: (id: string | null) => setRival(id, true),
  damageAction: (action: string, key?: string) => {
    const changed = damageLab?.apply(action as import('./damageLab.ts').DamageAction, key);
    if (changed) { setMode(activeMode, false); damageWorkbench.refresh(); }
    return changed;
  },
  resetDamage: () => { damageLab?.reset(); updateArticulation(); setMode(activeMode, false); damageWorkbench.refresh(); },
  waitAnatomyReady: () => anatomyReady,
  setAnatomyToggle: (toggle: AnatomyToggle, value: boolean) => anatomyView?.setToggle(toggle, value),
  setArmorMetric: (metric: ArmorMetric) => { armorMetric = metric; anatomyView?.setMetric(metric); },
  selectPart: (key: string | null) => anatomyView?.select(key),
  setMarkupOperation: surfaceMarkup.setOperation,
  selectSurface: surfaceMarkup.selectScreen,
  exportMarkupJSON: surfaceMarkup.exportRecord,
};
