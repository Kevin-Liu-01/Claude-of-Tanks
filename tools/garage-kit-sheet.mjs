// garage-kit-sheet.mjs (garage r9, 2026-10-17): a standalone review stage for the shared Garage kit. Served by the vite
// dev server at /tools/garage-kit-sheet.html?skin=<architecture>; it builds every kit piece in one Garage's region
// skin on a lit ground and exposes window.__KIT_SHEET.view(name) for screenshot harnesses (tools capture, not the game).
// Pieces render through the same builders and the same display atlas the Garage packs use.
import * as THREE from 'three';
import { KitBuilder, kitRandom } from '../src/ui/garageKitGeometry.ts';
import { GARAGE_KIT_SKINS } from '../src/ui/garageKitSkins.ts';
import { GARAGE_PROP_BUILDERS, buildGarageProp } from '../src/ui/garagePropKit.ts';
import { GARAGE_BENCH_BUILDERS, buildGarageBenchPiece } from '../src/ui/garageBenchKit.ts';
import * as Cranes from '../src/ui/garageCraneKit.ts';
import { buildWallRun, buildIndoorWallBay, buildColumnProtector, buildShadowBoard } from '../src/ui/garageWallKit.ts';
import { buildWallPlate, buildPostSign, buildHangingSign, buildABoard, buildSupergraphic, buildGroundStencil } from '../src/ui/garageSignKit.ts';
import {
  buildFramedPrint, buildPoster, buildFabricBanner, buildPvcBanner, buildMetalPlate, buildNameboard, buildMonitor,
  buildComputerStation, buildSlideshowFrame,
} from '../src/ui/garageDisplayKit.ts';
import { buildGaragePlatformCollar, paintGarageDeckTextures } from '../src/ui/garagePlatformKit.ts';
import {
  createGarageDisplayMaterial, createGarageDecalMaterial, ensureGarageDisplayAtlas, onGarageDisplayAtlasReady,
} from '../src/ui/garageDisplayAtlas.ts';
import { createGarageAtmosphere, atmosphereShaft, atmospherePlume, atmosphereBand, atmosphereMotes, setGarageAtmosphereClock } from '../src/ui/garageAtmosphereKit.ts';

const params = new URLSearchParams(location.search);
const architecture = params.get('skin') || 'recovery_yard';
const skin = GARAGE_KIT_SKINS[architecture] || GARAGE_KIT_SKINS.recovery_yard;
const canvas = document.getElementById('c');
const width = Number(params.get('w') || 1600), height = Number(params.get('h') || 900);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setSize(width, height, false);
renderer.setPixelRatio(1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xb9c8d6);
const camera = new THREE.PerspectiveCamera(36, width / height, 0.1, 400);
scene.add(new THREE.HemisphereLight(0xdfe8f2, 0x6a5a48, 1.15));
const sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
sun.position.set(30, 42, 24);
sun.castShadow = true;
sun.shadow.mapSize.set(4096, 4096);
Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 160 });
sun.shadow.bias = -0.0004;
scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ color: skin.ground, roughness: 0.96 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const solidMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0.06 });
const displayMaterial = createGarageDisplayMaterial();
const decalMaterial = createGarageDecalMaterial();
const surfaceMaterials = {
  stone: new THREE.MeshStandardMaterial({ color: 0x8a4a38, roughness: 0.95 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x7a5a3a, roughness: 0.92 }),
  plaster: new THREE.MeshStandardMaterial({ color: 0xc8c0b0, roughness: 0.95 }),
  route: new THREE.MeshStandardMaterial({ color: 0x8a8a84, roughness: 0.95 }),
  roof: new THREE.MeshStandardMaterial({ color: 0x6a5a50, roughness: 0.95 }),
};
const labels = [];
const stats = [];
const pieces = new Map();

function place(result, x, z, yaw = 0, label = '') {
  const group = new THREE.Group();
  group.position.set(x, 0, z);
  group.rotation.y = yaw + Math.PI; // every kit front is local +Z; the review cameras look from -Z
  const solid = new THREE.Mesh(result.solid, solidMaterial);
  solid.castShadow = true; solid.receiveShadow = true;
  group.add(solid);
  if (result.display) group.add(new THREE.Mesh(result.display, displayMaterial));
  if (result.decal) { const mesh = new THREE.Mesh(result.decal, decalMaterial); mesh.renderOrder = 2; group.add(mesh); }
  for (const [bucket, geometry] of result.surfaces) {
    const mesh = new THREE.Mesh(geometry, surfaceMaterials[bucket] || surfaceMaterials.plaster);
    mesh.castShadow = true; mesh.receiveShadow = true;
    group.add(mesh);
  }
  scene.add(group);
  if (label) {
    const box = result.solid.boundingBox;
    pieces.set(label, group);
    labels.push({ text: `${label} ${result.triangles}`, at: new THREE.Vector3(x, (box ? box.max.y : 1) + 0.25, z) });
    stats.push({ label, triangles: result.triangles, display: result.displayTriangles, decal: result.decalTriangles });
  }
  return group;
}

const build = (fn, seed = 1) => {
  const b = new KitBuilder(kitRandom(seed), skin);
  fn(b);
  return b.build();
};

// ---- row 1: clutter (z = 0)
const propNames = Object.keys(GARAGE_PROP_BUILDERS);
const bigProps = new Set(['forklift', 'bowser', 'lowLoader', 'lightTower', 'skip', 'generator', 'compressor', 'oilRack', 'gasCage', 'tarpStack']);
let x = -40;
propNames.filter((n) => !bigProps.has(n)).forEach((name, index) => {
  const row = index < 9 ? 0 : 1;
  const col = index % 9;
  const span = name === 'towBar' ? 3.2 : name === 'trackPallet' || name === 'pallet' ? 1.6 : 1.3;
  place(build((b) => buildGarageProp(b, name), index * 13 + 7), (row ? -10 : -40) + col * 1.5 + (name === 'towBar' ? 0.8 : 0), 0, 0.35, name);
  void span;
});
x = -40;
for (const name of propNames.filter((n) => bigProps.has(n))) {
  const span = name === 'lowLoader' ? 9 : name === 'bowser' ? 6 : name === 'forklift' ? 4 : 3.6;
  place(build((b) => buildGarageProp(b, name), x * 17 + 3), x + span / 2, 9, 0.35, name);
  x += span + 1.5;
}
// ---- row 3: benches and stands (z = 18)
x = -40;
for (const name of Object.keys(GARAGE_BENCH_BUILDERS)) {
  place(build((b) => buildGarageBenchPiece(b, name), x * 11 + 5), x + 1.5, 18, 0.2, name);
  x += name === 'weldingScreens' ? 5 : 3.6;
}
// ---- row 4: cranes (z = 34)
const CRANE_Z = 122; // the cranes stand behind every other row, so no row is framed through them
place(build((b) => Cranes.buildOverheadCrane(b, { span: 14, runway: 16, railY: 7, load: { kind: 'powerpack' } })), -32, CRANE_Z, 0, 'overhead-single-work');
place(build((b) => Cranes.buildOverheadCrane(b, { span: 14, runway: 12, railY: 7, girders: 2, swl: 40, load: { kind: 'coil' } })), -12, CRANE_Z, 0, 'overhead-double');
place(build((b) => Cranes.buildPortalGantry(b, { span: 10, height: 6.5, runway: 14, lattice: true, load: { kind: 'hull' } })), 8, CRANE_Z, 0, 'portal-lattice');
place(build((b) => Cranes.buildJibCrane(b, { height: 4, reach: 4, load: { kind: 'roadwheels' } })), 20, CRANE_Z - 3, 0, 'jib');
place(build((b) => Cranes.buildAFrameGantry(b, { span: 4, height: 3.6, load: { kind: 'powerpack' } })), 27, CRANE_Z - 3, 0, 'a-frame');
place(build((b) => Cranes.buildMonorailBeam(b, { length: 6, height: 4.5, load: { kind: 'roadwheels' } })), 33, CRANE_Z - 4, 0, 'monorail');
place(build((b) => Cranes.buildRailBreakdownCrane(b, { load: { kind: 'crate' } })), 44, CRANE_Z, 0, 'breakdown');
place(build((b) => Cranes.buildMagnetHandler(b, {})), 56, CRANE_Z, 0, 'magnet');
place(build((b) => { Cranes.buildRopewayPylon(b, { height: 9 }); }), 66, CRANE_Z, 0, 'ropeway');
// ---- row 5: walls, signs and displays (z = 52)
place(build((b) => buildWallRun(b, 'hesco', [[0, 0], [8, 0]], { mural: 'brand.banner.h', muralEvery: 8 })), -40, 52, 0, 'hesco');
place(build((b) => buildWallRun(b, 'twall', [[0, 0], [6, 0]], { mural: 'stencil.crest', muralEvery: 3 })), -30, 52, 0, 'twall');
place(build((b) => buildWallRun(b, 'heras', [[0, 0], [7, 0]], { mural: 'brand.wordmark.light', muralEvery: 1 })), -22, 52, 0, 'heras');
place(build((b) => buildWallRun(b, 'brick', [[0, 0], [6, 0]])), -13, 52, 0, 'brick');
place(build((b) => buildWallRun(b, 'palisade', [[0, 0], [5, 0]])), -5, 52, 0, 'palisade');
place(build((b) => buildWallRun(b, 'gabion', [[0, 0], [4, 0]])), 2, 52, 0, 'gabion');
place(build((b) => buildWallRun(b, 'quay', [[0, 0], [4, 0]])), 8, 52, 0, 'quay');
place(build((b) => buildWallRun(b, 'kerb', [[0, 0], [4, 0]])), 14, 52, 0, 'kerb');
place(build((b) => { b.push().translate(0, 0, 0); buildIndoorWallBay(b, { width: 6, height: 6, numeral: 3 }); b.pop(); }), 24, 52, 0, 'indoor-bay');
place(build((b) => buildColumnProtector(b, 0.4, 0.3)), 30, 53, 0, 'protector');
place(build((b) => { b.translate(0, 1.4, 0); buildShadowBoard(b, 1.8, 1.0); }), 33, 52, 0, 'shadowboard');
// signs
place(build((b) => buildPostSign(b, 'picto.speed10', 0.6, 0.6)), -40, 62, 0, 'post');
place(build((b) => { b.translate(0, 2.6, 0); buildHangingSign(b, 'picto.overhead', 0.5, 0.5); }), -38, 62, 0, 'hanging');
place(build((b) => buildABoard(b, 'picto.forklift')), -36, 62, 0, 'aboard');
place(build((b) => { b.translate(0, 1.6, 0); buildWallPlate(b, 'picto.firstaid', 0.4, 0.4); }), -34, 62, 0, 'plate');
place(build((b) => buildGroundStencil(b, 'num.04', 2, 2)), -31, 62, 0, 'stencil');
// displays
place(build((b) => { b.translate(0, 1.7, 0); buildFramedPrint(b, 'still.desert', 1.6, 0.9); }), -27, 62, 0, 'print');
place(build((b) => { b.translate(0, 1.5, 0); buildPoster(b, 'still.winter', 0.8, 1.2, 'board', [0.3, 0, 0.7, 1]); }), -24.5, 62, 0, 'poster');
place(build((b) => { b.translate(0, 5, 0); buildFabricBanner(b, 'brand.banner.v', 1.2, 4.5, { hang: 0.6 }); }), -22, 62, 0, 'banner-v');
place(build((b) => { b.translate(0, 4, 0); buildFabricBanner(b, 'brand.banner.h', 8, 1.25); }), -15, 62, 0, 'banner-h');
place(build((b) => buildPvcBanner(b, 'brand.banner.h', 4, 0.62, 2.0)), -8, 62, 0, 'pvc');
place(build((b) => { b.translate(0, 1.6, 0); buildMetalPlate(b, 'brand.crest.metal', 0.9, 0.9); }), -4, 62, 0, 'crest-plate');
place(build((b) => buildNameboard(b, architecture === 'recovery_yard' ? 'badlands' : 'verdant', 2.6, 1.2)), 0, 62, 0, 'nameboard');
place(build((b) => buildComputerStation(b, { screens: ['readout.armor.abrams', 'map.badlands', 'readout.modules.t90'], width: 2.0 })), 5, 62, 0, 'station');
place(build((b) => { b.translate(0, 1.6, 0); buildMonitor(b, 'map.verdant', 0.8, 'wall'); }), 8.5, 62, 0, 'monitor');
const slideshowMount = { mount: null };
place(build((b) => { slideshowMount.mount = buildSlideshowFrame(b, { width: 4.2, mount: 'trailer' }); }), 15, 62, 0, 'led-trailer');
// ---- row 6: the platform collars (z = 80)
const collarArchitectures = Object.keys(GARAGE_KIT_SKINS);
const deck = paintGarageDeckTextures(512, 0.6);
const deckTexture = new THREE.DataTexture(deck.albedo, deck.size, deck.size, THREE.RGBAFormat);
deckTexture.colorSpace = THREE.SRGBColorSpace; deckTexture.needsUpdate = true;
const deckNormal = new THREE.DataTexture(deck.normal, deck.size / 2, deck.size / 2, THREE.RGBAFormat);
deckNormal.needsUpdate = true;
collarArchitectures.forEach((arch, index) => {
  const cx = -40 + (index % 5) * 14.5, cz = 82 + Math.floor(index / 5) * 15;
  const result = buildGaragePlatformCollar(arch, { pedestalAngle: 2.3 });
  const group = place(result, cx, cz, 0, arch);
  const podium = new THREE.Mesh(new THREE.CylinderGeometry(6, 6.35, 0.36, 64), [
    new THREE.MeshStandardMaterial({ color: 0x3a3c3e, roughness: 0.8 }),
    new THREE.MeshStandardMaterial({ map: deckTexture, normalMap: deckNormal, roughness: 0.64, metalness: 0.1 }),
    new THREE.MeshStandardMaterial({ color: 0x3a3c3e }),
  ]);
  podium.position.y = 0.18; podium.receiveShadow = true;
  group.add(podium);
});
// ---- atmosphere sample (z = 100)
const atmosphere = createGarageAtmosphere({
  cards: [
    atmosphereShaft([0, 9, 100], [3, 0, 102], 2.4), atmosphereShaft([5, 9, 100], [8, 0, 102], 2.0, 0.3),
    ...atmosphereMotes([3, 3, 101], 3),
    ...atmospherePlume([16, 0, 100], 9, 1.4, 'smoke'), ...atmospherePlume([22, 0, 100], 7, 1.2, 'steam'),
    atmosphereBand([-20, 0, 108], [40, 0, 108], 3, 'mist'), atmosphereBand([-20, 0, 98], [10, 0, 98], 0.55, 'dust'),
  ],
});
scene.add(atmosphere);
setGarageAtmosphereClock(() => 1.25);

const VIEWS = {
  props: { from: [-31, 2.6, -5], at: [-31, 0.4, 0], labelRange: 8 },
  props2: { from: [-14, 2.6, -5], at: [-14, 0.4, 0], labelRange: 8 },
  propsBig: { from: [-22, 6.5, -3], at: [-22, 1, 9], labelRange: 16 },
  propsBig2: { from: [2, 6.5, -3], at: [2, 1, 9], labelRange: 16 },
  benches: { from: [-26, 3.4, 11], at: [-26, 1, 18] },
  cranes: { from: [-5, 14, 12], at: [-5, 4, 36] },
  cranesSmall: { from: [40, 9, 20], at: [42, 3, 34] },
  walls: { from: [-14, 5, 40], at: [-14, 1.2, 52] },
  indoor: { from: [27, 3.4, 45], at: [27, 2.6, 52] },
  signs: { from: [-34, 2.4, 55.5], at: [-34, 1.2, 62] },
  displays: { from: [-10, 4.2, 50], at: [-10, 2.5, 62] },
  computers: { from: [8, 3.0, 55], at: [8, 1.6, 62] },
  collars: { from: [-25, 9, 66], at: [-25, 0, 82] },
  collarsRight: { from: [40, 9, 66], at: [40, 0, 82] },
  atmosphere: { from: [8, 4, 86], at: [8, 4, 102] },
};

// framed views: the named pieces' combined bounds seen from the front-left and above (the kit's fronts face the camera)
const FRAMED = {
  'props-small-a': ['drum200', 'jerrycan', 'ammoBoxSteel', 'ammoCrate', 'pallet', 'roadWheel', 'trackPallet', 'towBar', 'chocks'],
  'props-small-b': ['cone', 'bollard', 'extinguisher', 'gasCylinder', 'cableReel', 'coiledHose', 'sandbag', 'palletJack', 'spillBin'],
  'props-big-a': ['forklift', 'lightTower', 'generator', 'compressor', 'oilRack'],
  'props-big-b': ['bowser', 'lowLoader', 'skip', 'gasCage', 'tarpStack'],
  'benches-a': ['workbench', 'rollCab', 'partsTrolley', 'weldingCart', 'fumeArm'],
  'benches-b': ['weldingScreens', 'standSet', 'turretStand', 'powerPackStand'],
  'crane-overhead': ['overhead-single-work'],
  'crane-double': ['overhead-double'],
  'crane-portal': ['portal-lattice'],
  'cranes-small': ['jib', 'a-frame', 'monorail'],
  'cranes-special': ['breakdown', 'magnet', 'ropeway'],
  'walls-a': ['hesco', 'twall', 'heras', 'brick'],
  'walls-b': ['palisade', 'gabion', 'quay', 'kerb'],
  'indoor': ['indoor-bay', 'protector', 'shadowboard'],
  'signs': ['post', 'hanging', 'aboard', 'plate', 'stencil'],
  'displays-a': ['print', 'poster', 'banner-v', 'banner-h'],
  'displays-b': ['pvc', 'crest-plate', 'nameboard', 'station', 'monitor', 'led-trailer'],
  'collars-a': ['field_shed', 'shade_depot', 'repair_bunker', 'brick_arsenal', 'naval_drydock'],
  'collars-b': ['rail_roundhouse', 'rain_canopy', 'rock_cavern', 'recovery_yard', 'factory_line'],
};
function framed(names) {
  const box = new THREE.Box3();
  for (const name of names) { const g = pieces.get(name); if (g) box.expandByObject(g); }
  const center = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
  if (names.some((name) => GARAGE_KIT_SKINS[name])) size.y = 2; // a collar row is framed for its width, not its pedestals
  const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)), tanH = tanV * camera.aspect;
  const dist = Math.max(size.x * 0.56 / tanH + size.z * 0.5, size.y * 0.6 / tanV + size.z * 0.5, 2.5);
  const dir = new THREE.Vector3(-0.22, names.some((name) => GARAGE_KIT_SKINS[name]) ? 0.9 : 0.36, -1).normalize();
  return { from: center.clone().addScaledVector(dir, dist).toArray(), at: center.toArray(), labelRange: Math.max(size.x, size.z) * 0.6 + 1 };
}
for (const [name, names] of Object.entries(FRAMED)) VIEWS[name] = null;

function view(name) {
  const v = VIEWS[name] ?? framed(FRAMED[name] ?? []);
  if (!v) throw new Error(`no view ${name}`);
  camera.position.set(...v.from);
  camera.lookAt(new THREE.Vector3(...v.at));
  camera.updateMatrixWorld(true);
  renderer.render(scene, camera);
  // labels for the screenshot
  const layer = document.getElementById('labels');
  layer.innerHTML = '';
  const target = new THREE.Vector3(...v.at);
  for (const label of labels) {
    if (label.at.distanceTo(target) > (v.labelRange ?? 14)) continue;
    const p = label.at.clone().project(camera);
    if (p.z > 1 || Math.abs(p.x) > 1 || Math.abs(p.y) > 1) continue;
    const el = document.createElement('div');
    el.className = 'label';
    el.textContent = label.text;
    el.style.left = `${((p.x + 1) / 2) * width}px`;
    el.style.top = `${((1 - p.y) / 2) * height}px`;
    layer.appendChild(el);
  }
  return true;
}

ensureGarageDisplayAtlas({ anisotropy: 8 });
window.__KIT_SHEET = {
  ready: false, stats, views: Object.keys(FRAMED), allViews: Object.keys(VIEWS), view,
};
onGarageDisplayAtlasReady(() => { window.__KIT_SHEET.ready = true; view('props'); });
