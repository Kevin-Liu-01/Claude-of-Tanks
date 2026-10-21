// The Gallery anatomy draws the combat data, exactly, for every vehicle (Armor, Modules and Crew layers).
//
// For each registered vehicle the receipt builds the anatomy scene the browser shows (anatomyScene.ts) in an
// articulated pose and checks it against the sim and the armor model it reads:
//   armor  — rays from around the vehicle hit the drawn heat map first where traceTank strikes its first plate, on the
//            same plate (a seam or coincident surfaces may tie: both hits then land on the same point), and
//            every main-armor triangle carries the ramp colour of its plate's value;
//   modules— one model per combat module part (tracks: hit volume only), in the part's combat frame, inside the part's
//            hit-shape bounds;
//   crew   — one P50 (1.75 m) mannequin per station, its head centre on the station's combat head shape;
//   hits   — one drawn hit volume per combat shape (and the barrel), each spanning exactly its shape's bounds;
//   purity — building the scene leaves the armor model byte-identical (canonical JSON before and after).
// ANATOMY_RAYS (default 72 per vehicle) and ANATOMY_IDS narrow or widen a run.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import '../vehicles/tankFactory.ts';
import { ALL_TANK_IDS, getSpec } from '../vehicles/specs.ts';
import { traceTank } from '../sim/armor.ts';
import { isPostwarVehicleEra } from '../vehicles/taxonomy.ts';
import {
  TRACK_MODULES, cellPolytope, crewStations, plateMetricMm, plateTestPolygon, shapeBounds,
} from './anatomyData.ts';
import { armorRampRgb, armorRampHex, crewRole, moduleSystem, ARMOR_RAMP } from './anatomyPalette.ts';
import { buildAnatomyScene } from './anatomyScene.ts';
import { MANNEQUIN_STATURE_M, mannequinStandingHeight } from './anatomyCrew.ts';

// --- unit contracts -------------------------------------------------------------------------------------------------
{
  // The ramp's lightness rises with thickness at every stop (order survives colour-vision loss and greyscale).
  const luma = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  for (let index = 1; index < ARMOR_RAMP.length; index += 1) {
    assert.ok(luma(armorRampRgb(ARMOR_RAMP[index][0])) > luma(armorRampRgb(ARMOR_RAMP[index - 1][0])), `ramp lightness rises at ${ARMOR_RAMP[index][0]} mm`);
  }
  assert.equal(armorRampHex(-5), ARMOR_RAMP[0][1]);
  assert.equal(armorRampHex(5000), ARMOR_RAMP.at(-1)[1]);
  // A cell of six axis planes is its box; a quad plate's test polygon is the quad.
  const planes = [[1, 0, 0, -1], [-1, 0, 0, -1], [0, 1, 0, -2], [0, -1, 0, -2], [0, 0, 1, -3], [0, 0, -1, -3]]
    .map(([x, y, z, c]) => ({ normal: [x, y, z], constant: c, plate: { name: 'p' } }));
  const box = cellPolytope({ min: [-5, -5, -5], max: [5, 5, 5], faces: planes });
  assert.equal(box.polygons.length, 6, 'six planes cut six faces');
  assert.equal(box.unbounded, 0);
  for (const polygon of box.polygons) for (const point of polygon.points) {
    assert.ok(Math.abs(Math.abs(point[0]) - 1) < 1e-9 || Math.abs(Math.abs(point[1]) - 2) < 1e-9 || Math.abs(Math.abs(point[2]) - 3) < 1e-9);
  }
  const quad = plateTestPolygon({ verts: [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0]] }, 'quad');
  assert.equal(quad.length, 4, 'a convex quad is its own test region');
  assert.equal(plateTestPolygon({ verts: [[0, 0, 0], [0, 1, 0], [1, 1, 0], [1, 0, 0]] }, 'quad').length, 4, 'wound the other way, the normal flips');
  assert.equal(crewRole('weaponOperatorLeft'), 'gunner');
  assert.equal(crewRole('assistantLoader'), 'loader');
  assert.equal(moduleSystem('transmission'), 'mobility');
  assert.equal(moduleSystem('autoloader'), 'ammunition');
  assert.ok(Math.abs(mannequinStandingHeight() - MANNEQUIN_STATURE_M) < 1e-9, 'the mannequin stands at P50 1.75 m');
}

function insideShape(shape, point) {
  const p = new THREE.Vector3(...point);
  if (shape.kind === 'ellipsoid') {
    return [0, 1, 2].reduce((sum, axis) => sum + ((p.getComponent(axis) - shape.center[axis]) / shape.radii[axis]) ** 2, 0) <= 1 + 1e-9;
  }
  if (shape.kind === 'capsule') {
    const a = new THREE.Vector3(...shape.a), b = new THREE.Vector3(...shape.b);
    return new THREE.Line3(a, b).closestPointToPoint(p, true, new THREE.Vector3()).distanceTo(p) <= shape.radius + 1e-9;
  }
  const radial = [0, 1, 2].filter((axis) => axis !== shape.axis);
  return Math.abs(p.getComponent(shape.axis) - shape.center[shape.axis]) <= shape.halfLength + 1e-9
    && radial.reduce((sum, axis, k) => sum + ((p.getComponent(axis) - shape.center[axis]) / shape.radii[k]) ** 2, 0) <= 1 + 1e-9;
}

function canonical(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : `"${value}"`;
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'boolean') return String(value);
  if (typeof value === 'function') return 'null';
  if (ArrayBuffer.isView(value) || Array.isArray(value)) return `[${Array.from(value, canonical).join(',')}]`;
  return `{${Object.keys(value).filter((key) => value[key] !== undefined && typeof value[key] !== 'function').sort()
    .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
}
const hash = (value) => createHash('sha256').update(canonical(value)).digest('hex');

// --- fleet census ---------------------------------------------------------------------------------------------------
const RAYS = Number(process.env.ANATOMY_RAYS || 72);
const ids = process.env.ANATOMY_IDS ? process.env.ANATOMY_IDS.split(',') : [...ALL_TANK_IDS];
const TURRET_YAW = 0.35, GUN_PITCH = 0.05;
const totals = { unshapedCrew: 0, vehicles: 0, rays: 0, ties: 0, surfaces: 0, parts: 0, models: 0, crew: 0, hits: 0, maxModuleTriangles: 0, maxFigureTriangles: 0 };
const failures = [];
const fail = (id, message) => { if (failures.length < 40) failures.push(`${id}: ${message}`); };
const raycaster = new THREE.Raycaster();

for (const id of ids) {
  const spec = getSpec(id);
  const armor = spec.armor;
  const before = hash(armor);
  const scene = buildAnatomyScene(armor, {
    caliberMm: Number(spec.gun?.shells?.[0]?.caliberMm || spec.gun?.caliberMm || 0),
    modern: isPostwarVehicleEra(spec.era),
  });
  scene.setToggles({ armor: true, addOns: true, modules: true, crew: true, hits: true });
  scene.syncPose(TURRET_YAW, GUN_PITCH);
  scene.frames.root.updateMatrixWorld(true);
  totals.vehicles += 1;
  totals.surfaces += scene.surfaces.length;

  // Armor: drawn heat map against traceTank, plate for plate.
  const armorMeshes = [];
  scene.frames.root.traverse((object) => { if (object.isMesh && object.userData.anatomyArmor) armorMeshes.push(object); });
  const bounds = new THREE.Box3();
  for (const mesh of armorMeshes) bounds.expandByObject(mesh);
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const radius = size.length() / 2 + 4;
  let seed = 0x9e3779b9;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const pose = { pos: new THREE.Vector3(), yaw: 0, pitch: 0, roll: 0, turretYaw: TURRET_YAW, gunPitch: GUN_PITCH };
  for (let ray = 0; ray < RAYS; ray += 1) {
    const y = 1 - (2 * (ray + 0.5)) / RAYS, ring = Math.sqrt(1 - y * y), phi = ray * 2.399963229728653;
    const direction = new THREE.Vector3(Math.cos(phi) * ring, y * 0.8 + 0.1, Math.sin(phi) * ring).normalize();
    const from = center.clone().addScaledVector(direction, radius);
    const target = new THREE.Vector3(bounds.min.x + random() * size.x, bounds.min.y + random() * size.y, bounds.min.z + random() * size.z);
    const to = from.clone().add(target.sub(from).multiplyScalar(2));
    const length = to.distanceTo(from);
    const sim = traceTank(from, to, pose, armor).filter((hit) => hit.kind === 'plate');
    raycaster.set(from, to.clone().sub(from).normalize());
    raycaster.far = length;
    const drawn = raycaster.intersectObjects(armorMeshes, false).map((hit) => ({ hit, pick: scene.pick(hit) }));
    if (!sim.length && !drawn.length) continue;
    totals.rays += 1;
    const first = drawn[0], simFirst = sim[0];
    if (first?.pick?.surface.plate === simFirst?.plate) continue;
    const drawnAt = first ? first.hit.distance : Infinity, simAt = simFirst ? simFirst.t * length : Infinity;
    // A ray through a seam or onto coincident surfaces meets two plates at one point: a tie, not a disagreement.
    if (Math.abs(drawnAt - simAt) < 2e-3) { totals.ties += 1; continue; }
    fail(id, `ray ${ray}: drawn ${first?.pick?.surface.plate.name ?? 'nothing'} @${drawnAt.toFixed(3)} m, sim ${simFirst?.plate.name ?? 'nothing'} @${simAt.toFixed(3)} m`);
  }
  // Every main-armor triangle carries its plate's ramp colour (sRGB, rounded to the byte).
  for (const mesh of armorMeshes) {
    const color = mesh.geometry.getAttribute('color'), ids3 = mesh.geometry.getAttribute('aSurface');
    for (let vertex = 0; vertex < color.count; vertex += 3) {
      const surface = scene.surfaces[ids3.getX(vertex)];
      if (surface.layer !== 'main') continue;
      const expected = armorRampRgb(plateMetricMm(surface.plate, 'ke'));
      const got = new THREE.Color(color.getX(vertex), color.getY(vertex), color.getZ(vertex)).convertLinearToSRGB();
      const delta = Math.max(...[got.r, got.g, got.b].map((value, axis) => Math.abs(value * 255 - expected[axis])));
      if (delta > 0.6) { fail(id, `surface ${surface.plate.name} colour off its ramp value by ${delta.toFixed(2)}`); break; }
    }
  }

  // Modules: one model per non-track part, in its frame, inside its hit-shape bounds.
  const models = new Map();
  scene.frames.root.traverse((object) => { if (object.userData.anatomy?.kind === 'module') models.set(`${object.userData.anatomy.index}:${object.userData.anatomy.part}`, object); });
  for (const part of scene.parts) {
    totals.parts += 1;
    const model = models.get(`${part.index}:${part.part}`);
    if (TRACK_MODULES.has(part.module)) { if (model) fail(id, `${part.module} drew a model`); continue; }
    if (!model) { fail(id, `module ${part.module} part ${part.part} has no model`); continue; }
    totals.models += 1;
    const frameName = { hull: 'anatomy_frame_hull', turret: 'anatomy_frame_turret', gun: 'anatomy_frame_gun', roofGun: 'anatomy_frame_roof_gun' }[part.frame];
    if (model.parent?.parent?.name !== frameName) fail(id, `module ${part.module} rides ${model.parent?.parent?.name}, not ${frameName}`);
    const frame = model.parent.parent;
    const inverse = frame.matrixWorld.clone().invert();
    const local = new THREE.Box3();
    model.traverse((object) => {
      if (!object.isMesh) return;
      const box = object.isInstancedMesh ? (object.computeBoundingBox(), object.boundingBox.clone()) : (object.geometry.computeBoundingBox(), object.geometry.boundingBox.clone());
      local.union(box.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse, object.matrixWorld)));
    });
    for (let axis = 0; axis < 3; axis += 1) {
      const key = 'xyz'[axis];
      if (local.min[key] < part.min[axis] - 2e-3 || local.max[key] > part.max[axis] + 2e-3) {
        fail(id, `module ${part.module}.${part.part} model leaves its hit shapes on ${key}: [${local.min[key].toFixed(3)}, ${local.max[key].toFixed(3)}] vs [${part.min[axis].toFixed(3)}, ${part.max[axis].toFixed(3)}]`);
        break;
      }
    }
  }
  if (models.size !== scene.parts.filter((part) => !TRACK_MODULES.has(part.module)).length) fail(id, `${models.size} module models for ${scene.parts.length} parts`);
  for (const volume of armor.modules || []) {
    if (!scene.parts.some((part) => part.volume === volume)) fail(id, `combat module ${volume.module} is not drawn`);
  }
  totals.maxModuleTriangles = Math.max(totals.maxModuleTriangles, scene.stats().moduleTriangles);

  // Crew: one mannequin per station, head centre on the station's head shape.
  const stations = crewStations(armor);
  const figures = [];
  scene.frames.root.traverse((object) => { if (object.userData.anatomy?.kind === 'crew') figures.push(object); });
  if (figures.length !== (armor.crew || []).length) fail(id, `${figures.length} mannequins for ${(armor.crew || []).length} crew`);
  for (const station of stations) {
    totals.crew += 1;
    const figure = figures.find((object) => object.userData.anatomy.index === station.index);
    if (!figure) { fail(id, `crew ${station.crew} has no mannequin`); continue; }
    if (figure.userData.anatomy.role !== crewRole(station.crew)) fail(id, `crew ${station.crew} drawn as ${figure.userData.anatomy.role}`);
    if (figure.userData.anatomy.statureM !== MANNEQUIN_STATURE_M) fail(id, `crew ${station.crew} stature ${figure.userData.anatomy.statureM}`);
    const frame = figure.parent.parent;
    const head = figure.getObjectByName('anatomy_crew_head').getWorldPosition(new THREE.Vector3()).applyMatrix4(frame.matrixWorld.clone().invert());
    const offset = head.distanceTo(new THREE.Vector3(...station.head));
    if (offset > 1e-6) fail(id, `crew ${station.crew} head ${offset.toFixed(4)} m off its station anchor`);
    // Unsplit stations keep the two combat body shapes, head second: the anchor is that shape's centre. Every anchor
    // lies inside a combat crew shape (a shell aimed at the drawn head strikes this crew member).
    if (station.shapes.length === 2 && station.shapes[1].kind === 'ellipsoid') {
      const shapeOffset = new THREE.Vector3(...station.shapes[1].center).distanceTo(new THREE.Vector3(...station.head));
      if (shapeOffset > 1e-6) fail(id, `crew ${station.crew} head anchor ${shapeOffset.toFixed(4)} m off the combat head shape`);
    }
    if (station.shapes.length && !station.shapes.some((shape) => insideShape(shape, station.head))) {
      fail(id, `crew ${station.crew} head anchor lies outside every combat crew shape`);
    }
    if (!station.shapes.length) totals.unshapedCrew += 1;
    let triangles = 0;
    figure.traverse((object) => { if (object.isMesh) triangles += object.geometry.getAttribute('position').count / 3; });
    totals.maxFigureTriangles = Math.max(totals.maxFigureTriangles, triangles);
  }

  // Hit volumes: exactly the combat shapes.
  const hits = [];
  scene.frames.root.traverse((object) => { if (object.isMesh && object.name.startsWith('anatomy_hit_')) hits.push(object); });
  const shapeCount = scene.parts.reduce((sum, part) => sum + part.shapes.length, 0) + stations.reduce((sum, station) => sum + station.shapes.length, 0)
    + (armor.gunBarrel && armor.gunBarrel.collision !== false ? 1 : 0);
  if (hits.length !== shapeCount) fail(id, `${hits.length} hit volumes for ${shapeCount} combat shapes`);
  totals.hits += hits.length;
  for (const mesh of hits) {
    const shape = mesh.userData.anatomyHit?.shape;
    if (!shape) continue;
    mesh.geometry.computeBoundingBox();
    const expected = shapeBounds(shape), box = mesh.geometry.boundingBox;
    const delta = Math.max(...[0, 1, 2].map((axis) => Math.max(Math.abs(box.min.getComponent(axis) - expected.min[axis]), Math.abs(box.max.getComponent(axis) - expected.max[axis]))));
    // Tessellated round shapes stay within their facet sag of the exact bounds (and never outside them).
    if (delta > 0.02 || [0, 1, 2].some((axis) => box.min.getComponent(axis) < expected.min[axis] - 1e-6 || box.max.getComponent(axis) > expected.max[axis] + 1e-6)) {
      fail(id, `hit volume ${shape.kind} spans ${delta.toFixed(4)} m off its shape bounds`);
      break;
    }
  }

  scene.dispose();
  if (hash(armor) !== before) fail(id, 'building the anatomy changed the armor model');
}

assert.deepEqual(failures, [], `anatomy fidelity:\n  ${failures.join('\n  ')}`);
assert.ok(totals.vehicles === ids.length && totals.rays > 0);
assert.ok(totals.maxModuleTriangles <= 40000, `module set ${totals.maxModuleTriangles} triangles (budget 40k per vehicle)`);
assert.ok(totals.maxFigureTriangles <= 3000, `mannequin ${totals.maxFigureTriangles} triangles (budget 3k)`);
console.log(`anatomy fidelity: ${totals.vehicles} vehicles · ${totals.rays} armor rays agree with traceTank (${totals.ties} coincident-surface ties) · `
  + `${totals.surfaces} armor surfaces · ${totals.models} module models in ${totals.parts} combat parts · ${totals.crew} mannequins on their head shapes · `
  + `${totals.hits} hit volumes · max ${Math.round(totals.maxModuleTriangles)} module / ${Math.round(totals.maxFigureTriangles)} figure triangles PASS`);
