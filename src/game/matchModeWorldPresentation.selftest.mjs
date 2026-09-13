import assert from 'node:assert/strict';
import { DoubleSide, Matrix4, Object3D, Scene, Vector3 } from 'three';

import { createMatchModeWorldPresentation, LINE_WORKS, planLineWorks } from './matchModeWorldPresentation.ts';

const ALLY = 0x6fe887;
const ENEMY = 0xf26a62;
const NEUTRAL = 0xe7edf1;
const AMBER = 0xf3a536;
const HEAL = 0x65e68a;

const base = {
  label: 'Objective', perspectiveTeam: 'alpha', respawns: true, target: null,
  score: { alpha: 0, bravo: 0 }, flags: [], zones: [], ball: null, goals: [],
  horde: null, pickups: [], playerAmmo: null, playerAmmoCapacity: null,
};

function close(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < 1e-9,
    `${message}: expected ${expected}, received ${actual}`);
}

function assertVector(actual, expected, message) {
  assert.deepEqual(actual.toArray(), expected, message);
}

function assertQuaternion(actual, expected, message) {
  close(actual.x, expected.x, `${message}.x`);
  close(actual.y, expected.y, `${message}.y`);
  close(actual.z, expected.z, `${message}.z`);
  close(actual.w, expected.w, `${message}.w`);
}

function assertBasicMaterial(material, color, opacity, message) {
  assert.equal(material.type, 'MeshBasicMaterial', `${message} type`);
  assert.equal(material.color.getHex(), color, `${message} color`);
  close(material.opacity, opacity, `${message} opacity`);
  assert.equal(material.transparent, opacity < 1, `${message} transparency`);
  assert.equal(material.depthWrite, opacity >= 1, `${message} depth write`);
  assert.equal(material.side, DoubleSide, `${message} side`);
  assert.equal(material.toneMapped, false, `${message} tone mapping`);
}

const scene = new Scene();
const view = createMatchModeWorldPresentation(scene);
assert.equal(scene.children.includes(view.root), true);
assert.equal(view.root.name, 'match-mode-objectives');
assert.equal(view.root.visible, false);
assert.equal(view.root.renderOrder, 2);
assert.equal(view.root.children.length, 0, 'objective geometry is lazy');

view.update({ ...base, id: 'standard', label: 'Standard Battle', respawns: false }, 0);
assert.equal(view.root.visible, false);
assert.equal(view.root.children.length, 0, 'standard battle allocates no markers');

view.update({
  ...base,
  id: 'capture_the_flag',
  label: 'Capture the Flag',
  flags: [
    { team: 'alpha', baseX: 10, baseY: 4, baseZ: -80, x: 10, y: 9, z: -80,
      status: 'home', carrierId: null, returnAtS: null },
    { team: 'bravo', baseX: -8, baseY: 2, baseZ: 85, x: -8, y: 10, z: 85,
      status: 'carried', carrierId: 'carrier', returnAtS: null },
    { team: 'alpha', baseX: 0, baseY: 0, baseZ: 0, x: 0, y: 0, z: 0,
      status: 'dropped', carrierId: null, returnAtS: 8 },
  ],
}, 1);
assert.equal(view.root.visible, true);
assert.equal(view.root.children.length, 2);
const alphaFlag = view.root.getObjectByName('alpha-flag');
const bravoFlag = view.root.getObjectByName('bravo-flag');
assert.ok(alphaFlag && bravoFlag);
assert.equal(alphaFlag.visible, true);
assert.equal(bravoFlag.visible, true);
assertVector(alphaFlag.position, [10, 4, -80], 'home flag uses its base height');
assertVector(bravoFlag.position, [-8, 7.5, 85], 'carried flag follows world height');
close(alphaFlag.rotation.y, 0.22, 'alpha flag rotation');
close(bravoFlag.rotation.y, 0.22 + Math.PI, 'bravo flag rotation');
for (const [marker, color] of [[alphaFlag, ALLY], [bravoFlag, ENEMY]]) {
  assert.equal(marker.children.length, 3);
  const [pole, banner, ring] = marker.children;
  assert.equal(pole.geometry.type, 'CylinderGeometry');
  assert.deepEqual(pole.geometry.parameters,
    { radiusTop: 0.11, radiusBottom: 0.15, height: 4.5, radialSegments: 8,
      heightSegments: 1, openEnded: false, thetaStart: 0, thetaLength: Math.PI * 2 });
  assertVector(pole.position, [0, 2.25, 0], 'flag pole placement');
  assertBasicMaterial(pole.material, 0xd6dde2, 1, 'flag pole material');
  assert.equal(banner.geometry.type, 'PlaneGeometry');
  assert.equal(banner.geometry.parameters.width, 2.8);
  assert.equal(banner.geometry.parameters.height, 1.35);
  assertVector(banner.position, [1.45, 3.7, 0], 'flag banner placement');
  assertBasicMaterial(banner.material, color, 0.93, 'flag banner material');
  assert.equal(ring.geometry.type, 'RingGeometry');
  close(ring.rotation.x, -Math.PI / 2, 'flag ring lays on terrain');
  close(ring.position.y, 0.08, 'flag ring terrain offset');
  assertBasicMaterial(ring.material, color, 0.38, 'flag ring material');
}
assert.equal(alphaFlag.children[2].visible, true);
assert.equal(bravoFlag.children[2].visible, false);

view.update({
  ...base,
  id: 'capture_the_flag',
  label: 'Capture the Flag',
  flags: [
    { team: 'alpha', baseX: 0, baseY: 1, baseZ: -100, x: 3, y: 9, z: -96,
      status: 'dropped', carrierId: null, returnAtS: 12 },
  ],
}, 1.5);
assert.equal(view.root.children.length, 2, 'flag markers are retained');
assert.equal(view.root.getObjectByName('alpha-flag'), alphaFlag);
assertVector(alphaFlag.position, [3, 6.5, -96], 'dropped flag placement');
close(alphaFlag.rotation.y, 0.33, 'retained flag rotation');
assert.equal(alphaFlag.children[2].visible, false);
assert.equal(bravoFlag.visible, false, 'unused retained flag is hidden');

view.update({
  ...base,
  id: 'zone_control',
  label: 'Zone Control',
  target: 1000,
  zones: [
    { id: 'a', x: -40, y: 1, z: 7, control: 0.5, owner: 'alpha', contested: false },
    { id: 'b', x: 2, y: 3, z: 4, control: -0.25, owner: 'bravo', contested: true },
    { id: 'c', x: 40, y: 5, z: -6, control: 0, owner: null, contested: false },
    { id: 'overflow', x: 99, y: 99, z: 99, control: 1, owner: 'alpha', contested: false },
  ],
}, 1.75);
assert.equal(alphaFlag.visible, false);
assert.equal(bravoFlag.visible, false);
const zoneMarkers = [1, 2, 3].map((index) =>
  view.root.getObjectByName(`capture-zone-${index}`));
assert.equal(zoneMarkers.every(Boolean), true);
const zoneExpected = [
  { position: [-40, 1, 7], color: ALLY, opacity: 0.47 },
  { position: [2, 3, 4], color: AMBER, opacity: 0.68 },
  { position: [40, 5, -6], color: NEUTRAL, opacity: 0.28 },
];
for (let index = 0; index < zoneMarkers.length; index += 1) {
  const marker = zoneMarkers[index];
  const [ring, core] = marker.children;
  assert.equal(marker.visible, true);
  assert.equal(marker.children.length, 2);
  assertVector(marker.position, zoneExpected[index].position, `zone ${index + 1} position`);
  assert.equal(ring.geometry.type, 'RingGeometry');
  close(ring.rotation.x, -Math.PI / 2, `zone ${index + 1} ring rotation`);
  assert.equal(core.geometry.type, 'CylinderGeometry');
  close(core.position.y, 3.5, `zone ${index + 1} core height`);
  assert.equal(ring.material, core.material, `zone ${index + 1} shares its material`);
  assert.equal(marker.userData.markerMaterial, ring.material);
  assertBasicMaterial(ring.material, zoneExpected[index].color,
    zoneExpected[index].opacity, `zone ${index + 1} material`);
}
const retainedZones = [...zoneMarkers];
delete zoneMarkers[0].userData.markerMaterial;
view.update({
  ...base,
  id: 'zone_control',
  label: 'Zone Control',
  target: 1000,
  zones: [
    { id: 'a', x: -30, y: 2, z: 9, control: 0, owner: null, contested: false },
  ],
}, 1.8);
assert.deepEqual([1, 2, 3].map((index) => view.root.getObjectByName(`capture-zone-${index}`)),
  retainedZones, 'zone markers are retained');
assertVector(zoneMarkers[0].position, [-30, 2, 9],
  'zone transforms remain live without an optional material reference');
assert.equal(zoneMarkers[0].visible, true);
assert.equal(zoneMarkers[1].visible, false);
assert.equal(zoneMarkers[2].visible, false);

const goals = [
  { team: 'alpha', x: -30, y: 2, z: -80 },
  { team: 'bravo', x: 50, y: 4, z: 110 },
];
view.update({
  ...base,
  id: 'turbo_ball',
  label: 'Turbo Ball',
  ball: { x: 6, y: 3.2, z: -4, vx: 0, vy: 0, vz: 0, lastTouchId: null },
  goals,
}, 2);
assert.equal(zoneMarkers.every((marker) => !marker.visible), true);
const ball = view.root.getObjectByName('turbo-ball');
assert.ok(ball);
assert.equal(ball.visible, true);
assert.equal(ball.geometry.type, 'SphereGeometry');
assert.equal(ball.geometry.parameters.radius, 2.2);
assertVector(ball.position, [6, 3.2, -4], 'turbo ball placement');
assertVector(ball.rotation, [1.1, 1.6, 0.7, 'XYZ'], 'turbo ball rotation');
assert.equal(ball.material.type, 'MeshStandardMaterial');
assert.equal(ball.material.color.getHex(), 0xe8eef2);
assert.equal(ball.material.roughness, 0.28);
assert.equal(ball.material.metalness, 0.36);
assert.equal(ball.material.emissive.getHex(), 0x25313a);
assert.equal(ball.material.emissiveIntensity, 0.45);
const goalMarkers = ['alpha-turbo-goal', 'bravo-turbo-goal'].map((name) =>
  view.root.getObjectByName(name));
assert.equal(goalMarkers.every(Boolean), true);
const midpoint = new Vector3(10, 13, 15);
for (let index = 0; index < goalMarkers.length; index += 1) {
  const marker = goalMarkers[index];
  const hoop = marker.children[0];
  assert.equal(marker.visible, true);
  assertVector(marker.position, [goals[index].x, goals[index].y, goals[index].z],
    `goal ${index + 1} position`);
  const expectedLook = new Object3D();
  expectedLook.position.copy(marker.position);
  expectedLook.lookAt(midpoint);
  assertQuaternion(marker.quaternion, expectedLook.quaternion, `goal ${index + 1} look-at`);
  assert.equal(marker.children.length, 1);
  assert.equal(hoop.geometry.type, 'TorusGeometry');
  close(hoop.position.y, 10, `goal ${index + 1} hoop height`);
  assert.equal(marker.userData.markerMaterial, hoop.material);
  assertBasicMaterial(hoop.material, index === 0 ? ALLY : ENEMY, 0.65,
    `goal ${index + 1} material`);
}
const retainedTurbo = { ball, goals: [...goalMarkers], childCount: view.root.children.length };
view.update({ ...base, id: 'turbo_ball', label: 'Turbo Ball' }, 2.5);
assert.equal(view.root.getObjectByName('turbo-ball'), retainedTurbo.ball);
assert.deepEqual(['alpha-turbo-goal', 'bravo-turbo-goal'].map((name) =>
  view.root.getObjectByName(name)), retainedTurbo.goals);
assert.equal(view.root.children.length, retainedTurbo.childCount,
  'Turbo markers are retained rather than rebuilt');
assert.equal(ball.visible, false);
assert.equal(goalMarkers.every((marker) => !marker.visible), true);

view.update({
  ...base,
  id: 'endless_horde',
  label: 'Endless Horde',
  respawns: false,
  horde: { wave: 4, alive: 0, total: 0, nextWaveInS: 1, healChance: 0.4 },
}, 2.75);
assert.equal(goalMarkers.every((marker) => !marker.visible), true);
const pickupMarkers = Array.from({ length: 12 }, (_, index) =>
  view.root.getObjectByName(`horde-pickup-${index + 1}`));
assert.equal(pickupMarkers.every(Boolean), true);
assert.equal(pickupMarkers.every((marker) => !marker.visible), true,
  'new pickup pool starts hidden');
const [cage, shellGroup, healGroup] = pickupMarkers[0].children;
assert.equal(pickupMarkers[0].children.length, 3);
assert.equal(cage.geometry.type, 'OctahedronGeometry');
assert.equal(cage.material.wireframe, true);
assertBasicMaterial(cage.material, NEUTRAL, 0.26, 'pickup cage material');
assert.equal(shellGroup.children.length, 3);
assert.deepEqual(shellGroup.children.map((shell) => shell.position.x), [-0.48, 0, 0.48]);
assert.equal(shellGroup.children.every((shell) => shell.geometry.type === 'CylinderGeometry'), true);
assert.equal(shellGroup.children.every((shell) => shell.rotation.z === Math.PI), true);
assertBasicMaterial(shellGroup.children[0].material, AMBER, 1, 'pickup shells material');
assert.equal(healGroup.children.length, 2);
assert.equal(healGroup.children.every((part) => part.geometry.type === 'BoxGeometry'), true);
assertBasicMaterial(healGroup.children[0].material, HEAL, 1, 'pickup heal material');

view.update({
  ...base,
  id: 'endless_horde',
  label: 'Endless Horde',
  respawns: false,
  horde: { wave: 5, alive: 7, total: 7, nextWaveInS: 0, healChance: 0.4 },
  pickups: Array.from({ length: 15 }, (_, index) => ({
    id: `loot-${index}`, kind: index % 2 ? 'ammo' : 'heal', x: index, y: 3.2, z: -index,
    active: index !== 0, spawnedWave: index + 1,
  })),
}, 3);
assert.equal(pickupMarkers.filter((marker) => marker.visible).length, 12,
  'presentation keeps a fixed loot-marker pool');
assertVector(pickupMarkers[0].position,
  [1, 3.2 + Math.sin(3 * 2.1 + 1) * 0.45, -1], 'first active pickup position');
close(pickupMarkers[0].rotation.y, 3 * 0.75 + 0.6, 'first active pickup rotation');
assert.equal(pickupMarkers[0].userData.heal.visible, false);
assert.equal(pickupMarkers[0].userData.ammo.visible, true);
assertVector(pickupMarkers[1].position,
  [2, 3.2 + Math.sin(3 * 2.1 + 2) * 0.45, -2], 'second active pickup position');
close(pickupMarkers[1].rotation.y, 3 * 0.75 + 1.2, 'second active pickup rotation');
assert.equal(pickupMarkers[1].userData.heal.visible, true);
assert.equal(pickupMarkers[1].userData.ammo.visible, false);

view.update({
  ...base,
  id: 'endless_horde',
  label: 'Endless Horde',
  respawns: false,
  horde: { wave: 6, alive: 2, total: 9, nextWaveInS: 0, healChance: 0.4 },
  pickups: [
    { id: 'loot-heal', kind: 'heal', x: 9, y: 2, z: 3, active: true, spawnedWave: 6 },
  ],
}, 3.5);
assert.equal(pickupMarkers[0].visible, true);
assert.equal(pickupMarkers.slice(1).every((marker) => !marker.visible), true);
assert.equal(pickupMarkers[0].userData.heal.visible, true);
assert.equal(pickupMarkers[0].userData.ammo.visible, false);
delete pickupMarkers[0].userData.heal;
delete pickupMarkers[0].userData.ammo;
view.update({
  ...base,
  id: 'endless_horde',
  label: 'Endless Horde',
  respawns: false,
  horde: { wave: 7, alive: 1, total: 10, nextWaveInS: 0, healChance: 0.4 },
  pickups: [
    { id: 'loot-ammo', kind: 'ammo', x: 1, y: 2, z: 3, active: true, spawnedWave: 7 },
  ],
}, 3.75);
assert.equal(pickupMarkers[0].visible, true,
  'the retained pickup pool tolerates optional icon groups');


// campaign slice 3 (2026-09-12): Frontline Assault sectors are dressed as trench
// lines — sandbag parapet, timber revetment on posts, crates in the lee and a
// picket-and-wire belt out front — lit, instanced, ground-fitted, planned once
// per sector layout and hidden for every other mode.
{
  const frontScene = new Scene();
  const ground = (x, z) => 2 + x * 0.05 - z * 0.02;
  const setUp = [];
  const released = [];
  const front = createMatchModeWorldPresentation(frontScene, {
    groundHeight: ground, setupMaterial: (m) => setUp.push(m), releaseMaterial: (m) => released.push(m),
  });
  const lines = [-60, 0, 60].map((x, index) => ({
    id: `line-${index + 1}`, x, y: ground(x, 0) + 0.12, z: 0, control: 0, owner: null, contested: false,
  }));
  const frontState = {
    ...base, id: 'frontline_assault', label: 'Frontline Assault', zones: lines,
    horde: { wave: 1, alive: 3, total: 3, nextWaveInS: 0, healChance: 0 },
    line: { index: 0, total: 3, holdS: 0 },
  };
  front.update(frontState, 1);
  const works = front.root.getObjectByName('line-works');
  assert.ok(works && works.visible, 'frontline sectors carry trench works');
  assert.equal(front.root.getObjectByName('capture-zone-1').visible, true, 'sector rings stay');
  const plan = planLineWorks(lines, ground);
  assert.equal(plan.lines, 3);
  assert.equal(plan.bags.length, 3 * 2 * LINE_WORKS.bagCourses * LINE_WORKS.bagsPerWing);
  assert.equal(plan.planks.length, 3 * LINE_WORKS.planksPerLine);
  assert.equal(plan.posts.length, 3 * LINE_WORKS.postsPerLine);
  assert.equal(plan.pickets.length, 3 * LINE_WORKS.picketsPerLine);
  assert.equal(plan.crates.length, 3 * LINE_WORKS.cratesPerLine);
  assert.equal(plan.wire.length, 3 * LINE_WORKS.wireSegmentsPerLine * 6);
  for (const name of ['bags', 'planks', 'posts', 'pickets', 'crates']) {
    const mesh = works.getObjectByName(`line-works-${name}`);
    assert.equal(mesh.isInstancedMesh, true, `${name} are instanced`); // three r185: InstancedMesh.type reads 'Mesh'
    assert.equal(mesh.count, plan[name].length, `${name} pool matches the plan`);
    assert.equal(mesh.castShadow && mesh.receiveShadow, true, `${name} are lit dressing that casts shadow`);
    assert.equal(mesh.material.type, 'MeshStandardMaterial', `${name} are lit`);
  }
  assert.equal(works.getObjectByName('line-works-wire').type, 'LineSegments');
  // the parapet stands ahead of each sector toward the attackers (-x here), the
  // wire belt further out, the crates in the lee; every piece follows the ground
  for (const [index, zone] of lines.entries()) {
    const bags = plan.bags.slice(index * 60, (index + 1) * 60);
    // apex 4 m ahead of the ring centre, wing tips sweeping back to ~1.7 m ahead
    assert.ok(bags.every((bag) => bag.x < zone.x - 1.0 && bag.x > zone.x - 4.6 && Math.abs(bag.z - zone.z) < 7),
      `sector ${index + 1} parapet stands ahead of the ring`);
    assert.ok(bags[0].x < bags[9].x, `sector ${index + 1} wings sweep back from the apex`);
    const pickets = plan.pickets.slice(index * 7, (index + 1) * 7);
    assert.ok(pickets.every((picket) => picket.x < zone.x - 10 && picket.x > zone.x - 12),
      `sector ${index + 1} wire belt is out front`);
    const crates = plan.crates.slice(index * 4, (index + 1) * 4);
    assert.ok(crates.every((crate) => crate.x > zone.x + 0.5), `sector ${index + 1} crates sit in the lee`);
  }
  for (const bag of plan.bags) {
    const g = ground(bag.x, bag.z);
    assert.ok(bag.y >= g + 0.08 && bag.y <= g + 0.55, 'bags sit on the sampled ground');
  }
  for (const picket of plan.pickets) close(picket.y, ground(picket.x, picket.z) + 0.62, 'pickets stand on the ground');
  const courses = new Set(plan.bags.slice(0, 60).map((bag) => Math.round((bag.y - ground(bag.x, bag.z)) * 100)));
  assert.equal(courses.size, 3, 'three sandbag courses');
  const bagsMesh = works.getObjectByName('line-works-bags');
  assert.ok(bagsMesh.instanceColor && bagsMesh.instanceColor.count >= 180, 'sacks carry per-piece weathering tones');
  assert.equal(bagsMesh.geometry.type, 'CapsuleGeometry', 'sacks are flattened capsules, not bricks');
  const matrix = new Matrix4();
  bagsMesh.getMatrixAt(0, matrix);
  const firstBag = new Vector3().setFromMatrixPosition(matrix);
  const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-4,
    `${message}: expected ${expected}, received ${actual}`); // Float32 instance buffers
  near(firstBag.x, plan.bags[0].x, 'first bag x');
  near(firstBag.y, plan.bags[0].y, 'first bag y');
  near(firstBag.z, plan.bags[0].z, 'first bag z');
  const wirePositions = works.getObjectByName('line-works-wire').geometry.getAttribute('position');
  assert.equal(wirePositions.count, 3 * LINE_WORKS.wireSegmentsPerLine * 2);
  near(wirePositions.getY(0), ground(plan.pickets[0].x, plan.pickets[0].z) + 0.35, 'lowest strand height');
  // identical sectors keep their matrices; new sectors refill the same pools
  const version = bagsMesh.instanceMatrix.version;
  front.update(frontState, 2);
  assert.equal(bagsMesh.instanceMatrix.version, version, 'unchanged sectors keep their matrices');
  front.update({ ...frontState, zones: lines.map((zone) => ({ ...zone, z: zone.z + 20 })) }, 3);
  assert.ok(bagsMesh.instanceMatrix.version > version, 'moved sectors refill the works');
  assert.equal(front.root.getObjectByName('line-works'), works, 'the works group is retained across layouts');
  assert.equal(front.root.getObjectByName('line-works-bags'), bagsMesh, 'the bag pool is retained');
  // fewer sectors rebuild the pools to size
  front.update({ ...frontState, zones: lines.slice(0, 2) }, 3.5);
  const rebuilt = front.root.getObjectByName('line-works-bags');
  assert.notEqual(rebuilt, bagsMesh);
  assert.equal(rebuilt.count, 2 * 60, 'two sectors, two sectors of bags');
  // other modes hide the works
  front.update({ ...base, id: 'zone_control', label: 'Zone Control', zones: lines }, 4);
  assert.equal(front.root.getObjectByName('line-works').visible, false, 'trench works belong to Frontline Assault only');
  front.update(null, 5);
  // without a sampler the sector's own height grounds the works
  const plain = planLineWorks([{ x: 0, y: 5.12, z: 0 }]);
  assert.equal(plain.lines, 1);
  assert.ok(plain.bags.every((bag) => bag.y >= 5.08 && bag.y <= 5.55), 'fallback ground is the sector height');
  assert.equal(planLineWorks([]).bags.length, 0);
  // the plan is deterministic
  assert.deepEqual(planLineWorks(lines, ground), plan);
  // every lit works material joined the cascaded-shadow setup (two builds: three sectors, then two)
  assert.equal(setUp.length, 8, `lit works materials are set up per build (${setUp.length})`);
  assert.ok(setUp.every((m) => m.isMeshStandardMaterial));
  assert.equal(released.length, 4, 'the first build released its materials when the pools were resized');
  front.dispose();
  assert.equal(released.length, 8, 'dispose releases the live works materials too');
  assert.equal(frontScene.children.length, 0, 'dispose removes the works with the root');
}

view.update(null, 4);
assert.equal(view.root.visible, false);
const disposableMesh = view.root.getObjectByName('turbo-ball');
disposableMesh.material = [disposableMesh.material];
const materiallessMesh = disposableMesh.clone();
materiallessMesh.material = null;
view.root.add(materiallessMesh);
const disposedGeometries = new Map();
const disposedMaterials = new Map();
view.root.traverse((object) => {
  if (object.geometry && !disposedGeometries.has(object.geometry)) {
    disposedGeometries.set(object.geometry, 0);
    object.geometry.addEventListener('dispose', () => {
      disposedGeometries.set(object.geometry, disposedGeometries.get(object.geometry) + 1);
    });
  }
  const materials = Array.isArray(object.material) ? object.material : [object.material];
  for (const material of materials) {
    if (!material || disposedMaterials.has(material)) continue;
    disposedMaterials.set(material, 0);
    material.addEventListener('dispose', () => {
      disposedMaterials.set(material, disposedMaterials.get(material) + 1);
    });
  }
});
view.dispose();
assert.equal(scene.children.includes(view.root), false);
assert.equal([...disposedGeometries.values()].every((count) => count === 1), true,
  'shared objective geometries dispose exactly once');
assert.equal([...disposedMaterials.values()].every((count) => count === 1), true,
  'shared objective materials dispose exactly once');

console.log('matchModeWorldPresentation.selftest: geometry, retained state, and lifecycle passed');
