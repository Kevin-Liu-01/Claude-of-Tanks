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
import { iconUrl } from '../ui/icons.ts';
import { flagIconUrl } from '../ui/flags.ts';
import { createInfoButton } from '../ui/contextInfo.ts';
import type { InfoButtonOptions, InfoImage } from '../ui/contextInfo.ts';
import { cameraViewGlyphSVG } from './viewGlyphs.ts';

type GalleryMode = InspectionMode | 'markup';
type GalleryView = 'hero' | 'front' | 'left' | 'right' | 'rear' | 'top'
  | 'elevated-left' | 'elevated-right';

interface GalleryVisual {
  root: THREE.Object3D;
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

const GALLERY_SECTION_INFO: Readonly<Record<string, string>> = Object.freeze({
  'Operational profile': 'Normalized combat-role ratings derived from the currently selected gameplay specification.',
  'Technical summary': 'A concise description and authored highlights for the selected first-party procedural vehicle.',
  Articulation: 'Live controls for the same hull, turret, and gun rig used by the game.',
  'Surface markup': 'Select exact rendered triangles and export a reproducible geometry review packet.',
  Specification: 'Canonical dimensions, mobility, firepower, and survivability values from current game data.',
  'Ammunition suite': 'The selected vehicle’s shell families, 1 km penetration, damage, and ballistic role.',
});

function appendGalleryInfo(
  target: Element | null | undefined,
  options: InfoButtonOptions,
): void {
  if (target && !target.querySelector(':scope > .cot-info-trigger')) {
    target.appendChild(createInfoButton(options));
  }
}

function galleryVehicleImage(
  view = 'angle',
  caption = 'Procedural vehicle render',
): InfoImage {
  if (!selectedId) return null;
  const spec = getSpec(selectedId) as GalleryVehicleSpec;
  const name = spec.label?.displayName || spec.name;
  return {
    src: iconUrl(spec.id, view),
    alt: `${name} ${caption.toLowerCase()}`,
    fit: 'contain',
    caption: `${name} // ${caption}`,
  };
}

function mountGalleryInfo(): void {
  const workspaceHeads = document.querySelectorAll('.workspace-group-head');
  appendGalleryInfo(workspaceHeads[0], {
    label: 'About the fleet archive', title: 'Fleet archive',
    text: 'Search and filter the complete public first-party vehicle roster, then select a model for live inspection.',
    image: () => galleryVehicleImage('angle', 'Selected archive vehicle'),
  });
  appendGalleryInfo(workspaceHeads[1], {
    label: 'About the technical dossier', title: 'Technical dossier',
    text: 'Live gameplay data, articulation, diagnostic overlays, and exact-surface review tools for the selected vehicle.',
    image: () => galleryVehicleImage('side', 'Technical vehicle profile'),
  });
  appendGalleryInfo(document.querySelector('.view-controls-label'), {
    label: 'About camera controls', title: 'Camera controls',
    text: 'Choose a deterministic inspection angle, orbit freely, or enable automatic rotation around the current model.',
    image: () => galleryVehicleImage('angle', 'Inspection camera reference'),
  });
  appendGalleryInfo(document.querySelector('.mode-dock > p'), {
    label: 'About diagnostic layers', title: 'Diagnostic layers',
    text: 'Switch between rendered appearance, armor volumes, internal modules, crew stations, and exact triangle markup.',
    image: () => galleryVehicleImage(activeMode === 'modules' ? 'modules_side'
      : (activeMode === 'crew' ? 'crew_side'
        : (activeMode === 'armor' ? 'armor_side' : 'angle')), 'Active diagnostic layer'),
  });
  document.querySelectorAll('.section-label').forEach((heading) => {
    const label = heading.querySelector('span')?.textContent.trim();
    if (label && GALLERY_SECTION_INFO[label]) appendGalleryInfo(heading, {
      label: `About ${label}`, title: label, text: GALLERY_SECTION_INFO[label],
      image: () => galleryVehicleImage(
        label === 'Specification' || label === 'Ammunition suite' ? 'side' : 'angle',
        `${label} reference`,
      ),
    });
  });
}

mountGalleryInfo();
const viewport = $<HTMLElement>('#viewport');
const vehicleList = $<HTMLElement>('#vehicleList');
const loadingState = $<HTMLElement>('#loadingState');
const modeButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-mode]')];
const viewButtons = [...document.querySelectorAll<HTMLButtonElement>('[data-view]')];
for (const button of viewButtons) {
  const label = button.textContent.trim();
  button.replaceChildren();
  button.insertAdjacentHTML('beforeend', `<i class="view-button-icon">${cameraViewGlyphSVG(button.dataset.view || 'hero')}</i><span>${label}</span>`);
  button.title = `${label} camera view`;
}
const autoRotateButton = $('#autoRotate');
autoRotateButton.replaceChildren();
autoRotateButton.insertAdjacentHTML('beforeend', `<i class="view-button-icon">${cameraViewGlyphSVG('auto')}</i><span>Auto</span>`);
autoRotateButton.title = 'Toggle automatic rotation';
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
scene.fog = new THREE.Fog(0x0a0d10, 18, 45);
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
let overlay = createInspectionOverlay(null, null, 'appearance');
let selectedId: string | null = null;
let activeMode: GalleryMode = 'appearance';
let filteredRecords: GalleryRecord[] = records;
let pointerStart: { x: number; y: number } | null = null;
let loadVersion = 0;
let toastTimer: ReturnType<typeof setTimeout> | undefined;

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
  const extentX = Math.max(currentCenter.x - bounds.min.x, bounds.max.x - currentCenter.x);
  const extentY = Math.max(currentCenter.y - bounds.min.y, bounds.max.y - currentCenter.y);
  const extentZ = Math.max(currentCenter.z - bounds.min.z, bounds.max.z - currentCenter.z);
  const radius = Math.max(extentX, extentY * 1.3, extentZ * 0.78) * 1.28;
  const distance = radius / Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
  camera.up.set(0, 1, 0);
  if (name === 'top') camera.up.set(0, 0, -1);
  camera.position.copy(currentCenter).addScaledVector(viewDirection, distance);
  controls.target.copy(currentCenter);
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
  const legend = activeMode === 'markup'
    ? [['Selected surface', '#ff5a5f'], ['Hover triangle', '#65a9ff']]
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
    empty.textContent = 'No archive records match the current filters.';
    vehicleList.append(empty);
  }
  $('#archiveCount').textContent = `${filteredRecords.length} of ${records.length} records`;
}

function renderDossier(record: GalleryRecord): void {
  const allIndex = records.findIndex((item) => item.id === record.id) + 1;
  $('#dossierIndex').textContent = String(allIndex).padStart(3, '0');
  $('#dossierMeta').textContent = `${record.nation} // ${record.era} // Tier ${record.tierNumeral}`;
  $('#dossierName').textContent = record.displayName;
  $('#dossierDesignation').textContent = `fleet://${record.id} · ${record.era}`;
  $('#dossierAuthor').textContent = `Original procedural model by ${record.authorship?.creator || 'Kevin B. Liu'}`;
  $('#dossierTankIcon').src = record.image;
  $('#dossierTankIcon').alt = `${record.displayName} side profile`;
  const ratingPresentation: Readonly<Record<string, { tone: string; icon: string }>> = {
    firepower: { tone: '#e9a346', icon: 'damage' },
    protection: { tone: '#67d19a', icon: 'shield' },
    mobility: { tone: '#64cfdb', icon: 'speed' },
    survivability: { tone: '#c18cff', icon: 'crew' },
  };
  $('#ratingGrid').innerHTML = Object.entries(record.ratings).map(([name, value]) => {
    const presentation = ratingPresentation[name];
    return `<div class="rating" data-rating="${name}" style="--rating:${value};--tone:${presentation.tone}">` +
      `<span class="rating-icon">${uiIconSVG(presentation.icon, 22)}</span>` +
      `<span class="rating-metric"><small>${name}</small><strong>${value}<span> / 100</span></strong></span></div>`;
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

  const loadingMetrics = record.metrics.autoloader
    ? [
        ['Magazine system', `${record.metrics.magazineSize} × ${record.shells[0]?.damage || 0} damage / ${record.metrics.intraClipS}s cycle`],
        ['Full reload / DPM', `${record.metrics.reloadS}s / ${record.metrics.dpm.toLocaleString('en-US')}`],
      ]
    : [['Reload / DPM', `${record.metrics.reloadS}s / ${record.metrics.dpm.toLocaleString('en-US')}`]];
  const metricRows = [
    ['Hit points', record.metrics.hp.toLocaleString('en-US')],
    ['Combat weight', `${record.metrics.weightTons} t`],
    ['Engine output', `${record.metrics.enginePowerHp.toLocaleString('en-US')} hp`],
    ['Power / weight', `${record.metrics.powerToWeight} hp/t`],
    ['Forward / reverse', `${record.metrics.topSpeedKmh} / ${record.metrics.reverseSpeedKmh} km/h`],
    ['Hull traverse', `${record.metrics.hullTraverseDegS}°/s`],
    ['Primary caliber', `${record.metrics.caliberMm} mm`],
    ...loadingMetrics,
    ['Peak KE / CE', `${record.metrics.bestKeMm} / ${record.metrics.bestCeMm} mm`],
    ['Overall envelope', `${record.dimensions.overallLengthM} × ${record.dimensions.widthM} × ${record.dimensions.heightM} m`],
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
    type.textContent = `${shell.type} // ${shell.velocityMps.toLocaleString('en-US')} m/s`;
    identity.append(name, type);
    const performance = document.createElement('span');
    performance.textContent = `${shell.penetrationMm} mm`;
    const damage = document.createElement('small');
    damage.textContent = `${shell.damage} damage`;
    performance.append(damage);
    row.append(identity, performance);
    return row;
  }));
}

function updateArticulation(): void {
  if (!visual) return;
  const hullYaw = Number($('#hullYaw').value);
  const turretYaw = Number($('#turretYaw').value);
  const gunPitch = Number($('#gunPitch').value);
  visual.root.rotation.y = THREE.MathUtils.degToRad(hullYaw);
  const turret = visual.root.getObjectByName('rig_turret');
  const gun = visual.root.getObjectByName('rig_gun');
  if (turret) turret.rotation.y = THREE.MathUtils.degToRad(turretYaw);
  if (gun) gun.rotation.x = -THREE.MathUtils.degToRad(gunPitch);
  visual.root.updateMatrixWorld(true);
  $('#hullYawValue').textContent = `${hullYaw}°`;
  $('#turretYawValue').textContent = `${turretYaw}°`;
  $('#gunPitchValue').textContent = `${gunPitch}°`;
  surfaceMarkup.updatePose();
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
  const nextMode: GalleryMode = ['appearance', 'armor', 'modules', 'crew', 'markup']
    .includes(requestedMode || '') ? requestedMode as GalleryMode : 'appearance';
  activeMode = nextMode;
  overlay.clear();
  const spec = selectedId ? getSpec(selectedId) : null;
  overlay = createInspectionOverlay(
    spec,
    visual,
    activeMode === 'markup' ? 'appearance' : activeMode,
  );
  surfaceMarkup.setActive(activeMode === 'markup');
  modeButtons.forEach((button) => button.classList.toggle('active', button.dataset.mode === activeMode));
  $('#inspectionReadout').hidden = true;
  $('#viewerHelp').innerHTML = activeMode === 'markup'
    ? `${viewerHelpItem('rematch', 'Orbit')}${viewerHelpItem('check', 'Shift-click adds')}${viewerHelpItem('autoAim', 'Select geometry')}`
    : `${viewerHelpItem('rematch', 'Orbit')}${viewerHelpItem('optics', 'Zoom')}${viewerHelpItem('autoAim', 'Select volume')}`;
  if (activeMode === 'markup') {
    controls.autoRotate = false;
    $('#autoRotate').setAttribute('aria-pressed', 'false');
  }
  renderLegend();
  updateUrl();
  if (announce) {
    if (activeMode === 'appearance') showToast('Exterior surface restored');
    else if (activeMode === 'markup') showToast(`${surfaceMarkup.getState().selectableMeshes} meshes ready for markup`);
    else showToast(`${overlay.count} ${activeMode} volumes visible`);
  }
}

function disposeTank(): void {
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
  configureArticulation(spec);
  renderRoster();
  frameView(options.view || 'hero');
  setMode(options.mode || activeMode, false);
  updateUrl();
  await nextFrame();
  loadingState.classList.add('hidden');
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
  $('#inspectionId').textContent = String(data.id || '');
  $('#inspectionOwner').textContent = String(data.owner || '');
  $('#inspectionTitle').textContent = String(data.title || '');
  if (data.mode === 'armor') {
    $('#inspectionDetails').textContent = `${technicalLabel(data.kind)} layer · ${data.physicalMm} mm physical · ${data.keMm} mm KE · ${data.ceMm} mm CE`;
  } else {
    const dimensions = Array.isArray(data.dimensionsM) ? data.dimensionsM : [];
    $('#inspectionDetails').textContent = `${data.mode === 'crew' ? 'Crew station' : 'Internal module'} · ${dimensions.join(' × ')} m kill-cam anatomy model`;
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
    showToast('Clipboard permission unavailable');
  }
}

function resize(): void {
  const width = Math.max(1, viewport.clientWidth);
  const height = Math.max(1, viewport.clientHeight);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
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
  showToast(controls.autoRotate ? 'Automatic turntable enabled' : 'Automatic turntable disabled');
});
$('#copyLink').addEventListener('click', () => writeClipboard(location.href, 'Gallery link copied'));
$('#copySpec').addEventListener('click', () => {
  if (!selectedId) return;
  writeClipboard(JSON.stringify(
    serializeGallerySpec(getSpec(selectedId) as GalleryVehicleSpec),
    null,
    2,
  ), 'Vehicle data copied');
});
renderer.domElement.addEventListener('pointerdown', (event) => {
  pointerStart = { x: event.clientX, y: event.clientY };
});
renderer.domElement.addEventListener('pointerup', (event) => {
  if (!pointerStart) return;
  const moved = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y);
  pointerStart = null;
  if (moved >= 5) return;
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

function animate() {
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
    markup: surfaceMarkup.getState(),
    camera: { position: camera.position.toArray(), target: controls.target.toArray() },
  }),
  setMarkupOperation: surfaceMarkup.setOperation,
  selectSurface: surfaceMarkup.selectScreen,
  exportMarkupJSON: surfaceMarkup.exportRecord,
};
