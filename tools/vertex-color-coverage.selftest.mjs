// One shared scan (owner via coordinator, 2026-10-10): a mesh whose material reads vertex colour (vertexColors) while
// its geometry carries no 'color' attribute renders black: the missing attribute reads as zero, and an instanced mesh's
// instance colour does not stand in (vertexColors multiplies the geometry's colour as well). It covers every builder
// that can reach a scene: the playable fleet as rendered (HIGH and LOW), the drone kits, flight pool and docks, the
// ten Garage environment packs, and the world's destructible prop and map-vehicle kits (every map's fleet).
//
// KNOWN lists hits whose fix is in flight in another lane. It may only shrink: a listed hit that no longer occurs fails,
// so the entry is removed with the fix.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { installCanvasFixture } from '../src/vehicles/canvasFixture.test-support.mjs';

// 2026-10-11 (integ/215): the ten Garage packs' instanced ground-cover tufts carry a colour attribute since garage look
// round 2 (ad48a9f63), so their ten KNOWN rows are gone; nothing is in flight.
const KNOWN = new Map([]);

// Headless DOM: the canvas fixture, plus an image element that never loads (textures stay blank; geometry, materials and
// attributes are what the scan reads) and ImageData.
const restoreCanvas = installCanvasFixture();
const doc = globalThis.document;
const hadCreateElementNS = !!doc.createElementNS;
if (!hadCreateElementNS) doc.createElementNS = (_ns, tag) => (tag === 'img'
  ? Object.assign(new EventTarget(), { width: 0, height: 0, src: '', crossOrigin: null, complete: false, style: {} })
  : doc.createElement(tag));
const hadImageData = !!globalThis.ImageData;
if (!hadImageData) globalThis.ImageData = class ImageData {
  constructor(data, width, height) {
    if (typeof data === 'number') { height = width; width = data; data = new Uint8ClampedArray(width * height * 4); }
    this.data = data; this.width = width; this.height = height ?? data.length / 4 / width;
  }
};

/** Meshes under `root` that read vertex colour without a colour attribute, as `<scope>|<mesh name>` keys. */
function offenders(scope, root) {
  const found = new Set();
  root.traverse((object) => {
    if (!object.isMesh || !object.geometry?.attributes?.position) return;
    for (const material of [].concat(object.material)) {
      if (material?.vertexColors && !object.geometry.attributes.color) found.add(`${scope}|${object.name || '(unnamed)'}`);
    }
  });
  return found;
}
const hits = new Set();
const record = (keys) => { for (const key of keys) hits.add(key); };

// Negative and positive controls on the scan itself.
{
  const box = new THREE.BoxGeometry(1, 1, 1), painted = new THREE.MeshStandardMaterial({ vertexColors: true });
  const root = new THREE.Group(), bare = new THREE.Mesh(box, painted); bare.name = 'bare'; root.add(bare);
  const coloured = new THREE.Mesh(box.clone(), painted); coloured.name = 'coloured';
  coloured.geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(coloured.geometry.attributes.position.count * 3).fill(1), 3));
  const plain = new THREE.Mesh(box, new THREE.MeshStandardMaterial()); plain.name = 'plain';
  const tufts = new THREE.InstancedMesh(box, painted, 4); tufts.name = 'tufts'; tufts.setColorAt(0, new THREE.Color(1, 1, 1));
  root.add(coloured, plain, tufts);
  assert.deepEqual([...offenders('control', root)].sort(), ['control|bare', 'control|tufts'],
    'flags a bare vertex-colour mesh and an instanced one whose instance colour cannot stand in; passes the rest');
}

// 1. The playable fleet, as rendered (the fleet passes build proceduralOnly, whose materials differ), HIGH and LOW.
const { createTank } = await import('../src/vehicles/tankFactory.ts');
const { TANK_SPECS } = await import('../src/vehicles/specs.ts');
const { ensureInteriorFills } = await import('../src/vehicles/interiorFills.ts');
const fleet = Object.keys(TANK_SPECS);
await ensureInteriorFills(fleet);
for (const id of fleet) for (const quality of ['high', 'low']) {
  const tank = createTank(id, null, { quality, camoSeed: 4242 });
  record(offenders(`tank:${id}:${quality}`, tank.root));
  tank.dispose();
}

// 2. Drones: every nation's airframe (both details where the kit has them), the flight pool, and docks on three carriers
//    (a turret seat, a braced stand and a receiver bracket).
const droneModel = await import('../src/fx/droneModel.ts');
const { createDronePresentation } = await import('../src/fx/dronePresentation.ts');
const { syncMissionAttachment, clearMissionAttachment } = await import('../src/game/missionAttachmentVisual.ts');
for (const nation of Object.keys(droneModel.DRONE_DESIGNS)) for (const detail of ['full', 'lite']) {
  const kit = droneModel.createDroneModelKit(nation, detail), root = new THREE.Group();
  const parts = kit.parts ?? [
    { geometry: kit.body, material: kit.bodyMaterial }, { geometry: kit.equipment, material: kit.equipmentMaterial },
    { geometry: kit.lens, material: kit.lensMaterial }];
  for (const part of parts) root.add(new THREE.Mesh(part.geometry, part.material));
  root.add(new THREE.Mesh(kit.rotor, kit.rotorMaterial ?? kit.bodyMaterial));
  if (kit.rotorBlur) root.add(new THREE.Mesh(kit.rotorBlur, kit.blurMaterial));
  root.traverse((o) => { if (o.isMesh) o.name = `airframe-${detail}`; });
  record(offenders(`drone:${nation}`, root));
  kit.dispose();
}
{
  const group = new THREE.Group(), pool = createDronePresentation(group);
  pool.begin(1);
  for (const [i, nation] of ['USA', 'Russia', 'Germany', 'Japan', 'Ukraine'].entries()) {
    pool.write(new THREE.Vector3(i * 3, 20, 0), new THREE.Vector3(0, 0, 10), i + 1, 0, 5, nation);
  }
  pool.end();
  record(offenders('drone:flight-pool', group));
  pool.reset();
}
for (const id of ['m1a1_abrams_hc', 'bmpt_t90', 'ua_m1a1']) {
  const tank = createTank(id, null, { quality: 'high', camoSeed: 4242 });
  syncMissionAttachment(tank.root, TANK_SPECS[id], { kind: 'drone', active: false, cooldownS: 0 }, false);
  const dock = tank.root.getObjectByName('Reusable mission payload rail');
  assert.ok(dock, `${id}: the dock is built`);
  record(offenders(`dock:${id}`, dock));
  clearMissionAttachment(tank.root); tank.dispose();
}

// 3. The ten Garage environment packs.
const garageKit = await import('../src/ui/garageEnvironmentKit.ts');
const { GARAGE_VARIANTS } = await import('../src/game/garageVariants.ts');
const engineCtx = { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), renderer: null,
  setupShadowMaterial: (m) => m, releaseShadowMaterial: () => true, anisotropy: 1, quality: 'high' };
const assets = garageKit.createGarageEnvironmentAssetLibrary(engineCtx);
for (const variant of GARAGE_VARIANTS) {
  const build = garageKit.buildGarageEnvironment(engineCtx, assets, variant);
  record(offenders(`garage:${variant.id}`, build.root));
  build.dispose?.();
}

// 4. World kits: every destructible prop and every map's vehicle fleet, intact and broken. The kits return geometry; the
//    props system draws each with its family's material (props.ts: straw takes the hay print, an unknown family the
//    baked one). Every family but wood and straw reads vertex colour. Wall modules are left out: props.ts re-materials
//    them per map (field stone or field mud, which read no vertex colour) and places each only on its own style's maps;
//    the 2026-10-10 live scan of all 33 maps found no wall, prop or vehicle mesh missing its colour.
const { DESTRUCTIBLE_TYPES, civilianVehicleTypes } = await import('../src/world/maps/inhabitKit.ts');
const { MAP_IDS } = await import('../src/world/maps/index.ts');
// 2026-10-11 (integ/217): the market stall draws in the canvas family since the maprev stall fix (7153064d9: its awning
// real canvas on its own stream); props.ts's structureCanvas reads vertex colour, and the stall carries it intact and broken.
const FAMILIES = new Set(['wood', 'straw', 'stone', 'plaster', 'baked', 'vehicle', 'structureCanvas']);
const readsVertexColour = (family) => family !== 'wood' && family !== 'straw';
let kits = 0;
const rng = (seed) => () => { seed = (seed + 0x6D2B79F5) | 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const checkKit = (scope, kind, type) => {
  if (type.wall) return;
  assert.ok(FAMILIES.has(type.mat), `${scope} ${kind}: material family '${type.mat}' is known to this scan (update FAMILIES)`);
  for (const [state, builder] of [['intact', type.build], ['broken', type.broken]]) {
    if (!builder) continue;
    const geometry = builder(rng(0x5eed));
    if (readsVertexColour(type.mat) && !geometry.attributes.color) hits.add(`${scope}|${kind}:${state}`);
    geometry.dispose(); kits++;
  }
};
for (const [kind, type] of Object.entries(DESTRUCTIBLE_TYPES)) checkKit('props', kind, type);
for (const mapId of MAP_IDS) for (const mobile of [false, true]) {
  for (const [kind, type] of Object.entries(civilianVehicleTypes(mapId, mobile))) checkKit(`vehicles:${mapId}${mobile ? ':mobile' : ''}`, kind, type);
}

// The verdict: nothing new, and nothing stale in KNOWN.
const unexpected = [...hits].filter((key) => !KNOWN.has(key)).sort();
const stale = [...KNOWN.keys()].filter((key) => !hits.has(key)).sort();
assert.deepEqual(unexpected, [], `meshes that read vertex colour without a colour attribute (they render black):\n${unexpected.join('\n')}`);
assert.deepEqual(stale, [], `KNOWN entries that no longer occur (remove them with the fix):\n${stale.join('\n')}`);
if (!hadCreateElementNS) delete doc.createElementNS;
if (!hadImageData) delete globalThis.ImageData;
restoreCanvas();
console.log(`vertex-color coverage: ${fleet.length} tanks x 2 qualities, ${Object.keys(droneModel.DRONE_DESIGNS).length} drone nations, flight pool, 3 docks, `
  + `${GARAGE_VARIANTS.length} garage packs, ${kits} prop and map-vehicle kits; ${KNOWN.size} known hits in flight elsewhere`);
