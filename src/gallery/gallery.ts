import type { DamageLab, DamageLabVisual } from './damageLab.ts';
import { createDamageWorkbench } from './damageWorkbench.ts';
import { createDamageBurst } from './damageBurst.ts';
import { minimumMechanicalGunPitch } from '../sim/gunPitchLimits.ts';
import type { RuntimeValue } from '../runtimeTypes.ts';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createTank, ensureTankBuilder } from '../vehicles/fleetFactory.ts';
import { VISIBLE_TANK_IDS, getSpec } from '../vehicles/specs.ts';
import {
  buildGalleryRecords,
  filterGalleryRecords,
  serializeGallerySpec,
  technicalLabel,
} from './catalog.ts';
import type { GalleryRecord, GalleryVehicleSpec } from './catalog.ts';
import { compareVehicleEras, VEHICLE_ERAS } from '../vehicles/taxonomy.ts';
import { createInspectionOverlay, inspectionLegend } from './overlays.ts';
import type { InspectionMode } from './overlays.ts';
import {
  createSurfaceMarkup,
  MARKUP_OPERATIONS,
  type SurfaceInspectionInfo,
} from './surfaceMarkup.ts';
import { uiIconSVG } from '../ui/uiIcons.ts';
import { flagIconUrl } from '../ui/flags.ts';
import { createInfoButton } from '../ui/contextInfo.ts';
import type { InfoButtonOptions } from '../ui/contextInfo.ts';
import { cameraViewGlyphSVG } from './viewGlyphs.ts';
import { t, onLocaleChange, getLocale, formatNumber } from '../ui/i18n.ts';
import { bindStaticI18nAuto } from '../presentation/staticI18n.ts';
import { applyGalleryCameraRange, galleryFitDistance, resizeGalleryCamera } from './cameraFit.ts';

type GalleryMode = InspectionMode | 'markup';
type GalleryView = 'hero' | 'front' | 'left' | 'right' | 'rear' | 'top'
  | 'elevated-left' | 'elevated-right';

interface GalleryVisual extends DamageLabVisual {
  root: THREE.Group;
  dispose(): void;
  centerOnPresentationPoint?(x: number, z: number): void;
  seatOnFloor?(floorY: number): void;
  presentationAnchorWorld?(target: THREE.Vector3): RuntimeValue;
}

interface GallerySelectController {
  control: HTMLElement;
  close(restoreFocus?: boolean): void;
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

const $ = <T extends HTMLElement = HTMLInputElement>(selector: string): T => {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing Tank Gallery element: ${selector}`);
  return element;
};

const GALLERY_SECTION_INFO_KEYS = Object.freeze({
  'gallery.dossier.section.operational': 'gallery.dossier.ratingHint',
  'gallery.dossier.section.summary': 'gallery.dossier.summaryHint',
  'gallery.dossier.section.articulation': 'gallery.dossier.articulationHint',
  'gallery.dossier.section.markup': 'gallery.dossier.markupHint',
  'gallery.dossier.section.specification': 'gallery.dossier.specificationHint',
  'gallery.dossier.section.ammunition': 'gallery.dossier.ammunitionHint',
});

function appendGalleryInfo(
  target: Element | null | undefined,
  options: InfoButtonOptions,
): void {
  if (target && !target.querySelector(':scope > .cot-info-trigger')) {
    target.appendChild(createInfoButton(options));
  }
}

function mountGalleryInfo(): void {
  const workspaceHeads = document.querySelectorAll('.workspace-group-head');
  appendGalleryInfo(workspaceHeads[0], {
    label: t('gallery.about.fleet'), title: t('gallery.about.fleetTitle'),
    text: t('gallery.about.fleetText'),
    guide: 'dossier',
  });
  appendGalleryInfo(workspaceHeads[1], {
    label: t('gallery.about.dossier'), title: t('gallery.about.dossierTitle'),
    text: t('gallery.about.dossierText'),
    guide: 'dossier',
  });
  appendGalleryInfo(document.querySelector('.view-controls-label'), {
    label: t('gallery.about.camera'), title: t('gallery.about.cameraTitle'),
    text: t('gallery.about.cameraText'),
    guide: 'camera',
  });
  appendGalleryInfo(document.querySelector('.mode-dock > p'), {
    label: t('gallery.about.layers'), title: t('gallery.about.layersTitle'),
    text: t('gallery.about.layersText'),
    guide: 'layers',
  });
  document.querySelectorAll('.section-label').forEach((heading) => {
    const labelElement = heading.querySelector<HTMLElement>('[data-i18n]');
    const labelKey = labelElement?.dataset.i18n || '';
    const helpKey = GALLERY_SECTION_INFO_KEYS[labelKey as keyof typeof GALLERY_SECTION_INFO_KEYS];
    if (helpKey) {
      const label = t(labelKey);
      appendGalleryInfo(heading, {
      label: `${t('gallery.about.layersTitle')} · ${label}`,
      title: label, text: t(helpKey),
      guide: ({
        'gallery.dossier.section.operational': 'performance',
        'gallery.dossier.section.summary': 'dossier',
        'gallery.dossier.section.articulation': 'armament',
        'gallery.dossier.section.markup': 'markup',
        'gallery.dossier.section.specification': 'dossier',
        'gallery.dossier.section.ammunition': 'ammunition',
      } as const)[labelKey as keyof typeof GALLERY_SECTION_INFO_KEYS],
    });
    }
  });
}

mountGalleryInfo();
bindStaticI18nAuto();
const viewport = $<HTMLElement>('#viewport');
const vehicleList = $<HTMLElement>('#vehicleList');
const loadingState = $<HTMLElement>('#loadingState');
const modeButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-mode]')];
const viewButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-view]')];
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
function refreshViewButtonLabels(): void {
  for (const button of viewButtons) {
    const key = viewLabelKey[button.dataset.view || 'hero'];
    const label = key ? t(key) : button.dataset.view || '';
    button.replaceChildren();
    button.insertAdjacentHTML('beforeend',
      `<i class="view-button-icon">${cameraViewGlyphSVG(button.dataset.view || 'hero')}</i><span>${label}</span>`);
    button.title = t('gallery.view.viewTitle', { name: label });
  }
}
refreshViewButtonLabels();
const autoRotateButton = $('#autoRotate');
function refreshAutoRotate(): void {
  autoRotateButton.replaceChildren();
  autoRotateButton.insertAdjacentHTML('beforeend',
    `<i class="view-button-icon">${cameraViewGlyphSVG('auto')}</i><span>${t('gallery.view.auto')}</span>`);
  autoRotateButton.title = t('gallery.view.autoTitle');
}
refreshAutoRotate();
document.querySelectorAll<HTMLElement>('[data-ui-icon]').forEach((element) => {
  element.innerHTML = uiIconSVG(element.dataset.uiIcon || 'info', 16);
});
const viewerHelpItem = (icon: string, label: string): string =>
  `<span><i>${uiIconSVG(icon, 11)}</i>${label}</span>`;
const records = buildGalleryRecords(
  VISIBLE_TANK_IDS.map((id) => getSpec(id) as GalleryVehicleSpec),
);
const recordById = new Map(records.map((record) => [record.id, record]));

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
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.075;
controls.minDistance = 2.2;
controls.maxDistance = 38;
controls.target.set(0, 1.3, 0);
controls.update();

scene.add(new THREE.HemisphereLight(0xdbe6ea, 0x25221d, 1.55));
const keyLight = new THREE.DirectionalLight(0xffe2bb, 3.15);
keyLight.position.set(-9, 13, 11);
scene.add(keyLight);
const rimLight = new THREE.DirectionalLight(0x6ac8db, 2.2);
rimLight.position.set(10, 7, -8);
scene.add(rimLight);
const fillLight = new THREE.DirectionalLight(0x8ea2b0, 0.95);
fillLight.position.set(0, 4, 10);
scene.add(fillLight);

const GALLERY_FLOOR_Y_M = -0.025;
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(13, 96),
  new THREE.MeshStandardMaterial({ color: 0x11171a, roughness: 0.93, metalness: 0.13 }),
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = GALLERY_FLOOR_Y_M;
scene.add(ground);
const grid = new THREE.GridHelper(25, 25, 0x775a36, 0x283137);
grid.position.y = -0.015;
grid.material.transparent = true;
grid.material.opacity = 0.32;
scene.add(grid);
for (const [inner, outer, color, opacity] of [
  [6.85, 6.9, 0xe9a346, 0.58],
  [7.55, 7.58, 0x64cfdb, 0.22],
]) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(inner, outer, 128),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity, side: THREE.DoubleSide, toneMapped: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = -0.008;
  scene.add(ring);
}

const engineCtx = {
  setupShadowMaterial: (material: THREE.Material): THREE.Material => material,
  anisotropy: 1,
  renderer,
};
const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2();
const currentBounds = new THREE.Box3();
const currentCenter = new THREE.Vector3();
const viewDirection = new THREE.Vector3();
const presentationCenter = new THREE.Vector3();

let visual: GalleryVisual | null = null;
let damageLab: DamageLab | null = null;
const damageBurst = createDamageBurst(scene);
const damagePoint = new THREE.Vector3();
const damageEnd = new THREE.Vector3();
let overlay = createInspectionOverlay(null, null, 'appearance');
let selectedId: string | null = null;
let activeMode: GalleryMode = 'appearance';
let filteredRecords: GalleryRecord[] = records;
let pointerStart: { x: number; y: number } | null = null;
let loadVersion = 0;
let toastTimer: ReturnType<typeof setTimeout> | undefined;

const damageHost = document.createElement('div');
damageHost.className = 'damage-workbench-host';
$('#articulationHeading').closest('section')!.after(damageHost);
const damageWorkbench = createDamageWorkbench(damageHost, {
  select(target) {
    setMode(target.plate ? 'armor' : target.kind === 'crew' ? 'crew' : 'modules', false);
    emphasizeDamageTarget();
  },
  change(action) {
    if (action === 'detonate') {
      const picker = overlay.pickables.find(object => object.userData.inspection?.plateName === damageLab?.selected.slice(6));
      if (picker) { new THREE.Box3().setFromObject(picker).getCenter(damagePoint); damageBurst.play(damagePoint); }
    }
    for (const id of ['hullYaw', 'turretYaw', 'gunPitch']) $("#" + id).disabled = !!damageLab?.combat.destroyed;
    if (action === 'reset') { damageBurst.clear(); updateArticulation(); }
    setMode(activeMode, false);
    emphasizeDamageTarget();
  },
  overlay() {
    if (activeMode === 'appearance' || activeMode === 'markup') setMode('modules', false);
    else setMode(activeMode, false);
  },
  copy() { if (damageLab) writeClipboard(JSON.stringify({ vehicleId: selectedId, ...damageLab.snapshot() }, null, 2), t('gallery.damage.copied')); },
});
// The damage lab is the gallery's heaviest graph — the sim's damage, movement and armour and the auxiliary weapons table,
// about 495 kB raw in 9 requests (main 395305d45) — so it loads after the first tank is on screen (2026-10-07, push 3b:
// the owner's load-time priority). The workbench shows a short loading state when the module takes more than 200 ms; a
// failed load is retried by the next tank load.
type DamageLabModule = typeof import('./damageLab.ts');
let damageLabModule: Promise<DamageLabModule> | null = null;
function loadDamageLab(): Promise<DamageLabModule> {
  if (damageLabModule) return damageLabModule;
  const pending = document.createElement('section');
  pending.className = 'dossier-section damage-workbench';
  pending.setAttribute('aria-busy', 'true');
  pending.innerHTML = `<div class="section-label"><span>${t('gallery.damage.heading')}</span></div><p class="damage-help" role="status">…</p>`;
  const slow = setTimeout(() => damageHost.append(pending), 200);
  damageLabModule = import('./damageLab.ts').then(
    (module) => { clearTimeout(slow); pending.remove(); return module; },
    (error: unknown) => { clearTimeout(slow); pending.remove(); damageLabModule = null; throw error; },
  );
  return damageLabModule;
}
function inspectionTarget(object: THREE.Object3D): string {
  const data = object.userData.inspection;
  if (data?.plateName && damageLab?.targets.some(target => target.key === `plate:${data.plateName}`)) return `plate:${data.plateName}`;
  if (data?.module) return `module:${data.module}`;
  if (data?.crew) return `crew:${data.crew}`;
  return '';
}
function emphasizeDamageTarget(): void {
  const picker = overlay.pickables.find(object => inspectionTarget(object) === damageLab?.selected);
  overlay.emphasize(picker || null);
}
function colorDamageOverlay(): void {
  if (!damageLab) return;
  for (const picker of overlay.pickables) {
    const target = damageLab.targets.find(part => part.key === inspectionTarget(picker));
    if (!target) continue;
    const state = damageLab.condition(target); if (state === 'ok') continue;
    const model = picker.userData.inspectionVisual || picker;
    model.traverse((object: THREE.Object3D) => {
      if (!(object instanceof THREE.Mesh) && !(object instanceof THREE.LineSegments)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) if (material instanceof THREE.MeshBasicMaterial || material instanceof THREE.LineBasicMaterial) material.color.set(state === 'yellow' ? '#ffc457' : '#ed6254');
    });
  }
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
  viewButtons.forEach((button) => button.classList.toggle('active', button.dataset.view === name));
}

function showToast(message: string): void {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 1800);
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
  const instance = info.instanceId === null ? '' : ` · instance ${info.instanceId}`;
  $('#inspectionDetails').textContent = `Triangle ${info.faceIndex}${instance} · world [${info.point.join(', ')}]`;
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
  if (activeMode === 'appearance') url.searchParams.delete('layer');
  else url.searchParams.set('layer', activeMode);
  history.replaceState({ id: selectedId, layer: activeMode }, '', `${url.pathname}${url.search}`);
}

function renderLegend(): void {
  const root = $('#overlayLegend');
  const legend: ReadonlyArray<readonly [string, string]> = damageWorkbench.hitboxes && (activeMode === 'modules' || activeMode === 'crew')
    ? [[t(activeMode === 'modules' ? 'gallery.legend.module' : 'gallery.legend.crew'), activeMode === 'modules' ? '#e9a346' : '#64cfdb'], [t('gallery.damage.state.yellow'), '#ffc457'], [t('gallery.damage.state.red'), '#ed6254']]
    : activeMode === 'markup'
    ? [
        [t('gallery.legend.markup.selected'), '#ff5a5f'],
        [t('gallery.legend.markup.hover'), '#65a9ff'],
      ]
    : inspectionLegend(activeMode as InspectionMode);
  root.replaceChildren(...legend.map(([label, color]) => {
    const item = document.createElement('span');
    item.style.setProperty('--legend', color);
    const marker = document.createElement('i');
    item.append(marker, label);
    return item;
  }));
}

function renderRoster(): void {
  const fragment = document.createDocumentFragment();
  for (const record of filteredRecords) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `vehicle-card${record.id === selectedId ? ' active' : ''}`;
    button.dataset.id = record.id;
    button.role = 'option';
    button.setAttribute('aria-selected', String(record.id === selectedId));

    const image = document.createElement('img');
    image.src = record.image;
    image.alt = '';
    image.loading = 'lazy';
    image.addEventListener('error', () => { image.style.visibility = 'hidden'; }, { once: true });
    const copy = document.createElement('span');
    const meta = document.createElement('small');
    meta.textContent = `${record.nation} // ${record.era}`;
    if (record.developmentOnly) {
      const devTag = document.createElement('b');
      devTag.className = 'vehicle-dev-tag';
      devTag.textContent = record.rosterTag || 'DEV';
      meta.append(' ', devTag);
    }
    const title = document.createElement('strong');
    title.textContent = record.displayName;
    const era = document.createElement('small');
    era.textContent = record.era;
    copy.append(meta, title, era);
    const tier = document.createElement('span');
    tier.className = 'vehicle-tier';
    tier.textContent = record.tierNumeral;
    button.append(image, copy, tier);
    button.addEventListener('click', () => loadTank(record.id));
    fragment.append(button);
  }
  vehicleList.replaceChildren(fragment);
  if (!filteredRecords.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-roster';
    empty.textContent = t('gallery.empty.noMatch');
    vehicleList.append(empty);
  }
  $('#archiveCount').textContent = t('gallery.count', {
    shown: filteredRecords.length,
    total: records.length,
  });
}

function renderDossier(record: GalleryRecord): void {
  const allIndex = records.findIndex((item) => item.id === record.id) + 1;
  $('#dossierIndex').textContent = String(allIndex).padStart(3, '0');
  $('#dossierMeta').textContent = `${record.nation} // ${record.era} // Tier ${record.tierNumeral}`;
  $('#dossierName').textContent = record.displayName;
  $('#dossierDesignation').textContent = `fleet://${record.id} · ${record.era}`;
  $('#dossierAuthor').textContent = t('gallery.dossier.authorLine', {
    creator: record.authorship?.creator || 'Kevin B. Liu',
  });
  $('#dossierTankIcon').src = record.image;
  $('#dossierTankIcon').alt = `${record.displayName} side profile`;
  const ratingPresentation: Readonly<Record<string, { tone: string; icon: string; key: string }>> = {
    firepower: { tone: '#e9a346', icon: 'damage', key: 'gallery.dossier.rating.firepower' },
    protection: { tone: '#67d19a', icon: 'shield', key: 'gallery.dossier.rating.protection' },
    mobility: { tone: '#64cfdb', icon: 'speed', key: 'gallery.dossier.rating.mobility' },
    survivability: { tone: '#c18cff', icon: 'crew', key: 'gallery.dossier.rating.survivability' },
  };
  $('#ratingGrid').innerHTML = Object.entries(record.ratings).map(([name, value]) => {
    const presentation = ratingPresentation[name];
    return `<div class="rating" data-rating="${name}" style="--rating:${value};--tone:${presentation.tone}">` +
      `<span class="rating-icon">${uiIconSVG(presentation.icon, 22)}</span>` +
      `<span class="rating-metric"><small>${t(presentation.key)}</small><strong>${value}<span> / 100</span></strong></span></div>`;
  }).join('');

  const brief = $('#technicalBrief');
  brief.replaceChildren(...record.brief.map((copy) => {
    const paragraph = document.createElement('p');
    paragraph.textContent = copy;
    return paragraph;
  }));
  $('#highlights').replaceChildren(...record.highlights.map((copy) => {
    const item = document.createElement('li');
    item.textContent = copy;
    return item;
  }));

  const numberLocale = getLocale();
  const fmt = (value: number): string => new Intl.NumberFormat(numberLocale).format(value);
  const loadingMetrics: Array<[string, string]> = record.metrics.autoloader
    ? [
        [
          t('gallery.dossier.spec.magazine'),
          t('gallery.dossier.spec.magazineAuto', {
            size: record.metrics.magazineSize,
            damage: record.shells[0]?.damage || 0,
            cycle: record.metrics.intraClipS,
          }),
        ],
        [
          t('gallery.dossier.spec.fullReload'),
          t('gallery.dossier.spec.reloadValue', { reload: record.metrics.reloadS, dpm: fmt(record.metrics.dpm) }),
        ],
      ]
    : [
        [
          t('gallery.dossier.spec.reload'),
          t('gallery.dossier.spec.reloadValue', { reload: record.metrics.reloadS, dpm: fmt(record.metrics.dpm) }),
        ],
      ];
  const metricRows: Array<[string, string]> = [
    [t('gallery.dossier.spec.hp'), fmt(record.metrics.hp)],
    [t('gallery.dossier.spec.weight'), t('gallery.dossier.spec.weightValue', { value: record.metrics.weightTons })],
    [t('gallery.dossier.spec.engine'), t('gallery.dossier.spec.engineValue', { value: fmt(record.metrics.enginePowerHp) })],
    [t('gallery.dossier.spec.powerWeight'), t('gallery.dossier.spec.powerWeightValue', { value: record.metrics.powerToWeight })],
    [t('gallery.dossier.spec.forwardReverse'), t('gallery.dossier.spec.forwardReverseValue', { forward: record.metrics.topSpeedKmh, reverse: record.metrics.reverseSpeedKmh })],
    [t('gallery.dossier.spec.hullTraverse'), t('gallery.dossier.spec.hullTraverseValue', { value: record.metrics.hullTraverseDegS })],
    [t('gallery.dossier.spec.primaryCaliber'), t('gallery.dossier.spec.primaryCaliberValue', { value: record.metrics.caliberMm })],
    ...loadingMetrics,
    [t('gallery.dossier.spec.peakKeCe'), t('gallery.dossier.spec.peakKeCeValue', { ke: record.metrics.bestKeMm, ce: record.metrics.bestCeMm })],
    [t('gallery.dossier.spec.envelope'), t('gallery.dossier.spec.envelopeValue', { length: record.dimensions.overallLengthM, width: record.dimensions.widthM, height: record.dimensions.heightM })],
  ];
  $('#specGrid').innerHTML = metricRows.map(([label, value]) => `<div><dt>${label}</dt><dd>${value}</dd></div>`).join('');

  const ammunition = $('#ammunitionList');
  ammunition.replaceChildren(...record.shells.map((shell) => {
    const row = document.createElement('div');
    row.className = 'ammunition';
    const identity = document.createElement('span');
    const name = document.createElement('strong');
    name.textContent = shell.name || shell.type;
    const type = document.createElement('small');
    type.textContent = t('gallery.dossier.shellTypeVelocity', { type: shell.type, velocity: fmt(shell.velocityMps) });
    identity.append(name, type);
    const performance = document.createElement('span');
    performance.textContent = t('gallery.dossier.shellPenetration', { value: shell.penetrationMm });
    const damage = document.createElement('small');
    damage.textContent = t('gallery.dossier.shellDamage', { value: shell.damage });
    performance.append(damage);
    row.append(identity, performance);
    return row;
  }));
}

function updateArticulation(): void {
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
  visual.root.rotation.y = THREE.MathUtils.degToRad(hullYaw);
  const turret = visual.root.getObjectByName('rig_turret');
  const gun = visual.root.getObjectByName('rig_gun');
  if (turret) turret.rotation.y = THREE.MathUtils.degToRad(turretYaw);
  if (gun) gun.rotation.x = -THREE.MathUtils.degToRad(gunPitch);
  overlay.update?.();
  visual.root.updateMatrixWorld(true);
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
  const nextMode: GalleryMode = !damageLab?.combat.destroyed && ['appearance', 'armor', 'modules', 'crew', 'markup']
    .includes(requestedMode || '') ? requestedMode as GalleryMode : 'appearance';
  activeMode = nextMode;
  overlay.clear();
  const spec = selectedId ? getSpec(selectedId) : null;
  overlay = createInspectionOverlay(
    spec && damageLab ? { ...spec, armor: damageLab.armor() } : spec,
    visual,
    activeMode === 'markup' ? 'appearance' : activeMode,
    damageWorkbench.hitboxes,
  );
  colorDamageOverlay();
  surfaceMarkup.setActive(activeMode === 'markup');
  modeButtons.forEach((button) => { button.classList.toggle('active', button.dataset.mode === activeMode); button.disabled = !!damageLab?.combat.destroyed && button.dataset.mode !== 'appearance'; });
  $('#inspectionReadout').hidden = true;
  $('#viewerHelp').innerHTML = activeMode === 'markup'
    ? `${viewerHelpItem('rematch', t('gallery.view.modeDockHelp'))}${viewerHelpItem('check', t('gallery.view.modeDockHelpShift'))}${viewerHelpItem('autoAim', t('gallery.view.modeDockHelpMarkup'))}`
    : `${viewerHelpItem('rematch', t('gallery.view.modeDockHelp'))}${viewerHelpItem('optics', t('gallery.view.modeDockHelpZoom'))}${viewerHelpItem('autoAim', t('gallery.view.modeDockHelpSelect'))}`;
  if (activeMode === 'markup') {
    controls.autoRotate = false;
    $('#autoRotate').setAttribute('aria-pressed', 'false');
  }
  renderLegend();
  updateUrl();
  if (announce) {
    if (activeMode === 'appearance') showToast(t('gallery.view.toast.appearanceRestored'));
    else if (activeMode === 'markup') showToast(t('gallery.view.toast.markupReady', { count: surfaceMarkup.getState().selectableMeshes }));
    else showToast(t('gallery.view.toast.modeVisible', { count: overlay.count, mode: t(`gallery.view.mode.${activeMode}`).toLowerCase() }));
  }
}

function disposeTank(): void {
  damageWorkbench.attach(null);
  damageLab?.dispose(); damageLab = null; damageBurst.clear();
  surfaceMarkup.detachTank();
  overlay.clear();
  overlay = createInspectionOverlay(null, null, 'appearance');
  if (visual) {
    visual.root.removeFromParent();
    visual.dispose();
  }
  visual = null;
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
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
  loadingState.classList.remove('hidden');
  await nextFrame();
  if (version !== loadVersion) return;

  disposeTank();
  selectedId = id;
  await ensureTankBuilder(id);
  if (version !== loadVersion) return;
  const spec = getSpec(id) as GalleryVehicleSpec;
  const record = recordById.get(id);
  if (!record) throw new Error(`Missing Gallery record for ${id}`);
  visual = createTank(id, engineCtx, {
    camoSeed: 4242,
    quality: 'high',
    proceduralOnly: true,
    // Gallery models remain first-party/procedural-only, but now show the
    // same authored field equipment players see in the garage and battle.
    // Measurement tools that omit this explicit opt-in still get bare hulls.
    decor: true,
  }) as GalleryVisual;
  visual.centerOnPresentationPoint?.(0, 0);
  visual.seatOnFloor?.(GALLERY_FLOOR_Y_M);
  scene.add(visual.root);
  forceHeroLod(visual.root);
  visual.root.updateMatrixWorld(true);
  surfaceMarkup.attachTank(visual.root, id);
  renderDossier(record);
  visual.setGroundSampler(() => GALLERY_FLOOR_Y_M); // the lab's floor from the first frame (the lab sets it again)
  for (const input of [$('#hullYaw'), $('#turretYaw'), $('#gunPitch')]) input.disabled = false;
  configureArticulation(spec);
  renderRoster();
  frameView(options.view || 'hero');
  setMode(options.mode || activeMode, false);
  updateUrl();
  await nextFrame();
  loadingState.classList.add('hidden');
  const { createDamageLab } = await loadDamageLab();
  if (version !== loadVersion || !visual) return;
  damageLab = createDamageLab(getSpec(id), visual, GALLERY_FLOOR_Y_M);
  damageLab.syncPose();
  damageWorkbench.attach(damageLab);
  setMode(activeMode, false); // the overlays read the lab's armour from here on
  window.__TANK_GALLERY_READY = true;
}

function renderInspection(hit: THREE.Intersection<THREE.Object3D> | undefined): void {
  const data = hit?.object?.userData?.inspection as Record<string, RuntimeValue> | undefined;
  const readout = $('#inspectionReadout');
  if (!data || !hit) {
    readout.hidden = true;
    overlay.emphasize(null);
    return;
  }
  overlay.emphasize(hit.object as THREE.Mesh);
  damageWorkbench.select(inspectionTarget(hit.object), false);
  $('#inspectionId').textContent = String(data.id || '');
  $('#inspectionOwner').textContent = String(data.owner || '');
  $('#inspectionTitle').textContent = String(data.title || '');
  if (data.mode === 'armor') {
    $('#inspectionDetails').textContent = t('gallery.inspection.armorDetail', {
      kind: String(technicalLabel(data.kind)),
      layer: String(t('gallery.inspection.layer')),
      physical: Number(data.physicalMm || 0),
      ke: Number(data.keMm || 0),
      ce: Number(data.ceMm || 0),
    });
  } else {
    const dimensions = Array.isArray(data.dimensionsM) ? data.dimensionsM : [];
    const external = data.kind === 'external';
    $('#inspectionDetails').textContent = t('gallery.inspection.moduleDetail', {
      label: external ? technicalLabel(data.kind)
        : String(data.mode === 'crew' ? t('gallery.legend.crew') : t('gallery.legend.module')),
      dimensions: dimensions.join(' × '),
      killCam: external ? '' : String(t('gallery.legend.killCam')),
    });
  }
  readout.hidden = false;
}

function pickInspection(clientX: number, clientY: number): void {
  if (!overlay.pickables.length) return;
  const rect = renderer.domElement.getBoundingClientRect();
  pointerNdc.set(((clientX - rect.left) / rect.width) * 2 - 1, -(((clientY - rect.top) / rect.height) * 2 - 1));
  raycaster.setFromCamera(pointerNdc, camera);
  renderInspection(raycaster.intersectObjects(overlay.pickables, false)[0]);
}

function applyFilters(): void {
  filteredRecords = filterGalleryRecords(records, {
    query: $('#gallerySearch').value,
    nation: $('#nationFilter').value,
    era: $('#eraFilter').value,
  });
  renderRoster();
}

const gallerySelects: GallerySelectController[] = [];

const GALLERY_ERA_ICONS: Readonly<Record<string, string>> = Object.freeze({
  [VEHICLE_ERAS.INTERWAR]: 'eraInterwar',
  [VEHICLE_ERAS.WORLD_WAR_II]: 'eraWorldWarII',
  [VEHICLE_ERAS.COLD_WAR]: 'eraColdWar',
  [VEHICLE_ERAS.MODERN]: 'eraModern',
  [VEHICLE_ERAS.NEXT_GENERATION]: 'eraNextGeneration',
});

function createGallerySelectIcon(
  select: HTMLSelectElement,
  option: HTMLOptionElement,
): HTMLSpanElement {
  const icon = document.createElement('span');
  icon.className = 'gallery-select-icon';
  icon.setAttribute('aria-hidden', 'true');
  if (select.id === 'nationFilter' && option.value !== 'all') {
    const flag = document.createElement('img');
    flag.className = 'gallery-select-flag';
    flag.src = flagIconUrl(option.value);
    flag.alt = '';
    flag.draggable = false;
    icon.append(flag);
    return icon;
  }
  const iconId = select.id === 'eraFilter'
    ? (GALLERY_ERA_ICONS[option.value] || 'clock')
    : 'globe';
  icon.insertAdjacentHTML('beforeend', uiIconSVG(iconId, 16));
  return icon;
}

function renderGallerySelectChoice(
  target: HTMLElement,
  select: HTMLSelectElement,
  option: HTMLOptionElement | undefined,
): void {
  target.replaceChildren();
  if (!option) return;
  const choice = document.createElement('span');
  choice.className = 'gallery-select-choice';
  const text = document.createElement('span');
  text.className = 'gallery-select-choice-label';
  text.textContent = option.textContent;
  choice.append(createGallerySelectIcon(select, option), text);
  target.append(choice);
}

function mountGallerySelect(select: HTMLSelectElement): GallerySelectController | null {
  const field = select.closest('.gallery-filter');
  const label = field?.querySelector('.filter-label');
  if (!field || !label) return null;

  const control = document.createElement('div');
  control.className = 'gallery-select';
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'gallery-select-trigger';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  const valueLabel = document.createElement('span');
  valueLabel.className = 'gallery-select-value';
  valueLabel.id = `${select.id}Value`;
  trigger.setAttribute('aria-labelledby', `${label.id} ${valueLabel.id}`);
  trigger.append(valueLabel);

  const list = document.createElement('div');
  list.className = 'gallery-select-list';
  list.id = `${select.id}List`;
  list.role = 'listbox';
  list.setAttribute('aria-labelledby', label.id);
  trigger.setAttribute('aria-controls', list.id);
  const options = [...select.options];
  const optionButtons = options.map((option) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'gallery-select-option';
    button.role = 'option';
    button.tabIndex = -1;
    button.dataset.value = option.value;
    renderGallerySelectChoice(button, select, option);
    list.append(button);
    return button;
  });

  function selectedIndex(): number {
    const index = optionButtons.findIndex((button) => button.dataset.value === select.value);
    return index < 0 ? 0 : index;
  }

  function syncSelection(): void {
    const index = selectedIndex();
    renderGallerySelectChoice(valueLabel, select, options[index]);
    optionButtons.forEach((button, buttonIndex) => {
      button.setAttribute('aria-selected', String(buttonIndex === index));
    });
  }

  function close(restoreFocus = false): void {
    if (!control.classList.contains('open')) return;
    control.classList.remove('open');
    trigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus) trigger.focus();
  }

  function open(index = selectedIndex()): void {
    for (const item of gallerySelects) {
      if (item.control !== control) item.close();
    }
    control.classList.add('open');
    trigger.setAttribute('aria-expanded', 'true');
    optionButtons[Math.max(0, Math.min(optionButtons.length - 1, index))]?.focus();
  }

  function choose(button: HTMLButtonElement): void {
    select.value = button.dataset.value || '';
    syncSelection();
    select.dispatchEvent(new Event('change', { bubbles: true }));
    close(true);
  }

  trigger.addEventListener('click', () => {
    if (control.classList.contains('open')) close();
    else open();
  });
  trigger.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      open();
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      open(event.key === 'Home' ? 0 : optionButtons.length - 1);
    }
  });
  optionButtons.forEach((button, index) => {
    button.addEventListener('click', () => choose(button));
    button.addEventListener('keydown', (event) => {
      let nextIndex = index;
      if (event.key === 'ArrowDown') nextIndex = (index + 1) % optionButtons.length;
      else if (event.key === 'ArrowUp') nextIndex = (index - 1 + optionButtons.length) % optionButtons.length;
      else if (event.key === 'Home') nextIndex = 0;
      else if (event.key === 'End') nextIndex = optionButtons.length - 1;
      else if (event.key === 'Escape') {
        event.preventDefault();
        close(true);
        return;
      } else if (event.key === 'Tab') {
        close();
        return;
      } else return;
      event.preventDefault();
      optionButtons[nextIndex]?.focus();
    });
  });
  select.addEventListener('change', syncSelection);
  select.hidden = true;
  select.tabIndex = -1;
  select.setAttribute('aria-hidden', 'true');
  control.append(trigger, list);
  field.append(control);
  syncSelection();
  const api = { control, close };
  gallerySelects.push(api);
  return api;
}

function populateFilters(): void {
  const nations = [...new Set(records.map((record) => record.nation))].sort();
  const eras = [...new Map(records.map((record) => [record.eraKey, record.era])).entries()]
    .sort((a, b) => compareVehicleEras(
      a[0] as Parameters<typeof compareVehicleEras>[0],
      b[0] as Parameters<typeof compareVehicleEras>[1],
    ));
  $('#nationFilter').append(...nations.map((nation) => new Option(nation, nation)));
  $('#eraFilter').append(...eras.map(([key, label]) => new Option(label, key)));
  mountGallerySelect($<HTMLSelectElement>('#nationFilter'));
  mountGallerySelect($<HTMLSelectElement>('#eraFilter'));
}

async function writeClipboard(text: string, successMessage: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    showToast(successMessage);
  } catch (_) {
    showToast(t('gallery.toast.clipboardUnavailable'));
  }
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

$('#gallerySearch').addEventListener('input', applyFilters);
$('#nationFilter').addEventListener('change', applyFilters);
$('#eraFilter').addEventListener('change', applyFilters);
$('#hullYaw').addEventListener('input', updateArticulation);
$('#turretYaw').addEventListener('input', updateArticulation);
$('#gunPitch').addEventListener('input', updateArticulation);
modeButtons.forEach((button) => button.addEventListener('click', () => setMode(button.dataset.mode)));
viewButtons.forEach((button) => button.addEventListener('click', () => frameView(button.dataset.view)));
$('#autoRotate').addEventListener('click', () => {
  controls.autoRotate = !controls.autoRotate;
  controls.autoRotateSpeed = 0.75;
  $('#autoRotate').setAttribute('aria-pressed', String(controls.autoRotate));
  showToast(controls.autoRotate
    ? t('gallery.toast.turntableOn')
    : t('gallery.toast.turntableOff'));
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
  if (activeMode !== 'markup' || event.buttons) return;
  surfaceMarkup.hoverScreen(event.clientX, event.clientY);
});
renderer.domElement.addEventListener('pointerleave', surfaceMarkup.clearHover);

document.addEventListener('keydown', (event) => {
  const editing = /input|select|textarea/i.test(document.activeElement?.tagName || '')
    || !!document.activeElement?.closest('.gallery-select');
  if (event.key === '/' && !editing) {
    event.preventDefault();
    $('#gallerySearch').focus();
    return;
  }
  if (editing) return;
  if (event.shiftKey && /^[1-4]$/.test(event.key) && activeMode === 'markup') {
    surfaceMarkup.setOperation(MARKUP_OPERATIONS[Number(event.key) - 1], true);
    return;
  }
  if (/^[1-5]$/.test(event.key)) {
    setMode(['appearance', 'armor', 'modules', 'crew', 'markup'][Number(event.key) - 1]);
    return;
  }
  if ((event.ctrlKey || event.metaKey) && event.code === 'KeyZ' && activeMode === 'markup') {
    event.preventDefault();
    surfaceMarkup.undo();
    return;
  }
  if (event.code === 'Delete' && activeMode === 'markup') surfaceMarkup.deleteSelected();
});
document.addEventListener('pointerdown', (event) => {
  for (const item of gallerySelects) {
    if (!(event.target instanceof Node) || !item.control.contains(event.target)) item.close();
  }
});

window.addEventListener('popstate', () => {
  const params = new URLSearchParams(location.search);
  loadTank(params.get('id'), { mode: params.get('layer') || 'appearance' });
});
new ResizeObserver(resize).observe(viewport);

let previousFrameTime = performance.now();
function animate() {
  const time = performance.now(), dt = Math.min(.05, (time - previousFrameTime) / 1000); previousFrameTime = time;
  damageLab?.update(dt); damageBurst.update(dt); overlay.update?.();
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

populateFilters();
renderRoster();
resize();
animate();

const initial = new URLSearchParams(location.search);
const preferredId = initial.get('id');
const initialId = preferredId && recordById.has(preferredId)
  ? preferredId
  : (recordById.has('m1a2') ? 'm1a2' : records[0]?.id);
loadTank(initialId, { mode: initial.get('layer') || 'appearance' });

window.__TANK_GALLERY = {
  get ready() { return !!window.__TANK_GALLERY_READY; },
  get count() { return records.length; },
  loadTank,
  setMode,
  frameView,
  getState: () => ({
    selectedId,
    mode: activeMode,
    overlayCount: overlay.count,
    damage: damageLab?.snapshot(),
    markup: surfaceMarkup.getState(),
    camera: { position: camera.position.toArray(), target: controls.target.toArray() },
  }),
  damageAction: (action: string, key?: string) => {
    const changed = damageLab?.apply(action as import('./damageLab.ts').DamageAction, key);
    if (changed) { setMode(activeMode, false); damageWorkbench.refresh(); }
    return changed;
  },
  resetDamage: () => { damageLab?.reset(); updateArticulation(); setMode(activeMode, false); damageWorkbench.refresh(); },
  setMarkupOperation: surfaceMarkup.setOperation,
  selectSurface: surfaceMarkup.selectScreen,
  exportMarkupJSON: surfaceMarkup.exportRecord,
};
