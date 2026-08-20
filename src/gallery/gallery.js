import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createTank } from '../vehicles/tankFactory.js';
import { ALL_TANK_IDS, getSpec } from '../vehicles/specs.js';
import {
  buildGalleryRecords,
  classLabel,
  filterGalleryRecords,
  serializeGallerySpec,
} from './catalog.js';
import { createInspectionOverlay, inspectionLegend } from './overlays.js';
import { createSurfaceMarkup, MARKUP_OPERATIONS } from './surfaceMarkup.js';
import { mountMediaArchive } from '../presentation/mediaArchive.js';

const $ = (selector) => document.querySelector(selector);
const viewport = $('#viewport');
const vehicleList = $('#vehicleList');
const loadingState = $('#loadingState');
const modeButtons = [...document.querySelectorAll('[data-mode]')];
const viewButtons = [...document.querySelectorAll('[data-view]')];
const records = buildGalleryRecords(ALL_TANK_IDS.map(getSpec));
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

const ground = new THREE.Mesh(
  new THREE.CircleGeometry(13, 96),
  new THREE.MeshStandardMaterial({ color: 0x11171a, roughness: 0.93, metalness: 0.13 }),
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.025;
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

const engineCtx = { setupShadowMaterial: (material) => material, anisotropy: 1, renderer };
const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2();
const currentBounds = new THREE.Box3();
const currentCenter = new THREE.Vector3();
const currentSize = new THREE.Vector3();
const viewDirection = new THREE.Vector3();

let visual = null;
let overlay = createInspectionOverlay(null, null, 'appearance');
let selectedId = null;
let activeMode = 'appearance';
let filteredRecords = records;
let pointerStart = null;
let loadVersion = 0;
let toastTimer = 0;

const VIEW_DIRECTIONS = Object.freeze({
  hero: [-1, 0.45, 1],
  front: [0, 0.07, 1],
  left: [-1, 0.06, 0],
  right: [1, 0.06, 0],
  rear: [0, 0.07, -1],
  top: [0, 1, 0.015],
  'elevated-left': [-1, 0.6, 0.2],
  'elevated-right': [1, 0.6, 0.2],
});

function effectiveVisible(object) {
  for (let node = object; node; node = node.parent) if (!node.visible) return false;
  return true;
}

function forceHeroLod(root) {
  root.traverse((object) => {
    if (!object.isLOD) return;
    object.autoUpdate = false;
    object.levels.forEach((level, index) => {
      if (level.object) level.object.visible = index === 0;
    });
  });
}

function visibleBox(root) {
  currentBounds.makeEmpty();
  root.updateMatrixWorld(true);
  root.traverse((object) => {
    if (!(object.isMesh || object.isInstancedMesh) || !object.geometry) return;
    if (!effectiveVisible(object) || object.userData.gallerySurfaceMarkup) return;
    if (object.name.startsWith('gallery_') || /shadow/i.test(object.name || '')) return;
    if (object.isInstancedMesh) {
      if (!object.count) return;
      object.computeBoundingBox();
      if (object.boundingBox && !object.boundingBox.isEmpty()) {
        currentBounds.union(object.boundingBox.clone().applyMatrix4(object.matrixWorld));
      }
      return;
    }
    if (!object.geometry.boundingBox) object.geometry.computeBoundingBox();
    currentBounds.union(object.geometry.boundingBox.clone().applyMatrix4(object.matrixWorld));
  });
  return currentBounds;
}

function frameView(name = 'hero') {
  if (!visual) return;
  const bounds = visibleBox(visual.root);
  bounds.getCenter(currentCenter);
  bounds.getSize(currentSize);
  viewDirection.fromArray(VIEW_DIRECTIONS[name] || VIEW_DIRECTIONS.hero).normalize();
  const radius = Math.max(currentSize.x, currentSize.y * 1.3, currentSize.z * 0.78) * 0.64;
  const distance = radius / Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
  camera.up.set(0, 1, 0);
  if (name === 'top') camera.up.set(0, 0, -1);
  camera.position.copy(currentCenter).addScaledVector(viewDirection, distance);
  controls.target.copy(currentCenter);
  controls.update();
  viewButtons.forEach((button) => button.classList.toggle('active', button.dataset.view === name));
}

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 1800);
}

function poseRecord() {
  return {
    hullYawDeg: Number($('#hullYaw').value),
    turretYawDeg: Number($('#turretYaw').value),
    gunPitchDeg: Number($('#gunPitch').value),
  };
}

function renderSurfaceInspection(info) {
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

function updateUrl() {
  if (!selectedId) return;
  const url = new URL(location.href);
  url.searchParams.set('id', selectedId);
  if (activeMode === 'appearance') url.searchParams.delete('layer');
  else url.searchParams.set('layer', activeMode);
  history.replaceState({ id: selectedId, layer: activeMode }, '', `${url.pathname}${url.search}`);
}

function renderLegend() {
  const root = $('#overlayLegend');
  const legend = activeMode === 'markup'
    ? [['Selected surface', '#ff5a5f'], ['Hover triangle', '#65a9ff']]
    : inspectionLegend(activeMode);
  root.replaceChildren(...legend.map(([label, color]) => {
    const item = document.createElement('span');
    item.style.setProperty('--legend', color);
    const marker = document.createElement('i');
    item.append(marker, label);
    return item;
  }));
}

function renderRoster() {
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
    meta.textContent = `${record.nation} // ${record.vehicleClass}`;
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

function renderDossier(record) {
  const allIndex = records.findIndex((item) => item.id === record.id) + 1;
  $('#dossierIndex').textContent = String(allIndex).padStart(3, '0');
  $('#dossierMeta').textContent = `${record.nation} // ${record.vehicleClass} // Tier ${record.tierNumeral}`;
  $('#dossierName').textContent = record.displayName;
  $('#dossierDesignation').textContent = `fleet://${record.id} · ${record.era}`;
  $('#dossierAuthor').textContent = `Original procedural model by ${record.authorship.creator}`;
  $('#viewerRecord').textContent = `Archive record ${String(allIndex).padStart(3, '0')} / ${String(records.length).padStart(3, '0')}`;

  const ratingTones = { firepower: '#e9a346', protection: '#67d19a', mobility: '#64cfdb', survivability: '#c18cff' };
  $('#ratingGrid').innerHTML = Object.entries(record.ratings).map(([name, value]) =>
    `<div class="rating" style="--rating:${value};--tone:${ratingTones[name]}"><small>${name}</small><strong>${value}<span> / 100</span></strong></div>`).join('');

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
    name.textContent = shell.name;
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

function updateArticulation() {
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

function configureArticulation(spec) {
  const hullInput = $('#hullYaw');
  const turretInput = $('#turretYaw');
  const gunInput = $('#gunPitch');
  const fixedMount = spec.class === 'td' && Number(spec.turretTraverseDegS || 0) <= 0;
  turretInput.min = fixedMount ? String(-(Number(spec.gunTraverseDeg || 12))) : '-180';
  turretInput.max = fixedMount ? String(Number(spec.gunTraverseDeg || 12)) : '180';
  turretInput.value = '0';
  hullInput.value = '0';
  gunInput.min = String(-Math.abs(Number(spec.gunDepressionDeg || 8)));
  gunInput.max = String(Math.abs(Number(spec.gunElevationDeg || 18)));
  gunInput.value = '0';
  updateArticulation();
}

function setMode(nextMode, announce = true) {
  if (!['appearance', 'armor', 'modules', 'crew', 'markup'].includes(nextMode)) nextMode = 'appearance';
  activeMode = nextMode;
  overlay.clear();
  const spec = selectedId ? getSpec(selectedId) : null;
  overlay = createInspectionOverlay(spec, visual, activeMode === 'markup' ? 'appearance' : activeMode);
  surfaceMarkup.setActive(activeMode === 'markup');
  modeButtons.forEach((button) => button.classList.toggle('active', button.dataset.mode === activeMode));
  $('#inspectionReadout').hidden = true;
  $('#viewerHelp').innerHTML = activeMode === 'markup'
    ? 'Drag to orbit <b>·</b> Shift-click to add <b>·</b> Select exact geometry'
    : 'Drag to orbit <b>·</b> Scroll to zoom <b>·</b> Select a volume for data';
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

function disposeTank() {
  surfaceMarkup.detachTank();
  overlay.clear();
  overlay = createInspectionOverlay(null, null, 'appearance');
  if (visual) {
    visual.root.removeFromParent();
    visual.dispose();
  }
  visual = null;
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

async function loadTank(id, options = {}) {
  if (!recordById.has(id)) id = records[0]?.id;
  if (!id) return;
  const version = ++loadVersion;
  loadingState.classList.remove('hidden');
  await nextFrame();
  if (version !== loadVersion) return;

  disposeTank();
  selectedId = id;
  const spec = getSpec(id);
  const record = recordById.get(id);
  visual = createTank(id, engineCtx, { camoSeed: 4242, quality: 'high', proceduralOnly: true });
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

function renderInspection(hit) {
  const data = hit?.object?.userData?.inspection;
  const readout = $('#inspectionReadout');
  if (!data) {
    readout.hidden = true;
    overlay.emphasize(null);
    return;
  }
  overlay.emphasize(hit.object);
  $('#inspectionId').textContent = data.id;
  $('#inspectionOwner').textContent = data.owner;
  $('#inspectionTitle').textContent = data.title;
  if (data.mode === 'armor') {
    $('#inspectionDetails').textContent = `${classLabel(data.kind)} layer · ${data.physicalMm} mm physical · ${data.keMm} mm KE · ${data.ceMm} mm CE`;
  } else {
    $('#inspectionDetails').textContent = `${data.mode === 'crew' ? 'Crew station' : 'Internal module'} · ${data.dimensionsM.join(' × ')} m diagnostic volume`;
  }
  readout.hidden = false;
}

function pickInspection(clientX, clientY) {
  if (!overlay.pickables.length) return;
  const rect = renderer.domElement.getBoundingClientRect();
  pointerNdc.set(((clientX - rect.left) / rect.width) * 2 - 1, -(((clientY - rect.top) / rect.height) * 2 - 1));
  raycaster.setFromCamera(pointerNdc, camera);
  renderInspection(raycaster.intersectObjects(overlay.pickables, false)[0]);
}

function applyFilters() {
  filteredRecords = filterGalleryRecords(records, {
    query: $('#gallerySearch').value,
    nation: $('#nationFilter').value,
    vehicleClass: $('#classFilter').value,
  });
  renderRoster();
}

function populateFilters() {
  const nations = [...new Set(records.map((record) => record.nation))].sort();
  const classes = [...new Map(records.map((record) => [record.classKey, record.vehicleClass])).entries()]
    .sort((a, b) => a[1].localeCompare(b[1]));
  $('#nationFilter').append(...nations.map((nation) => new Option(nation, nation)));
  $('#classFilter').append(...classes.map(([key, label]) => new Option(label, key)));
}

async function writeClipboard(text, successMessage) {
  try {
    await navigator.clipboard.writeText(text);
    showToast(successMessage);
  } catch (_) {
    showToast('Clipboard permission unavailable');
  }
}

function resize() {
  const width = Math.max(1, viewport.clientWidth);
  const height = Math.max(1, viewport.clientHeight);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

$('#gallerySearch').addEventListener('input', applyFilters);
$('#nationFilter').addEventListener('change', applyFilters);
$('#classFilter').addEventListener('change', applyFilters);
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
  writeClipboard(JSON.stringify(serializeGallerySpec(getSpec(selectedId)), null, 2), 'Vehicle data copied');
});
const galleryArchive = $('#galleryArchive');
$('#galleryArchiveOpen').addEventListener('click', () => {
  galleryArchive.showModal();
  mountMediaArchive(galleryArchive.querySelector('[data-media-archive]'), { mode: 'wall', limit: 88, filters: false })
    .catch((error) => showToast(error.message));
});
$('#galleryArchiveClose').addEventListener('click', () => galleryArchive.close());
galleryArchive.addEventListener('click', (event) => { if (event.target === galleryArchive) galleryArchive.close(); });

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
  if (event.key === '/' && !/input|select|textarea/i.test(document.activeElement?.tagName || '')) {
    event.preventDefault();
    $('#gallerySearch').focus();
    return;
  }
  const editing = /input|select|textarea/i.test(document.activeElement?.tagName || '');
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
const initialId = recordById.has(preferredId)
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
