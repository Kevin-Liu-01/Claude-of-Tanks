import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createArmorAimOverlay } from './armorAimOverlay.ts';
import { ARMOR_PAINT_ZONE_TEXELS, makeBurnUniforms } from '../vehicles/materials.ts';

// 262: the scoped flashlight is paint (vehicles/materials.ts ARMOR_PAINT, riding the burn hook): this runtime fills
// each scoped vehicle's zone table — every authored main plate's plane and outline, and its colour blended from samples
// on the cells' faces the authority gives that plate — and its frames, and turns the paint on only in scope.
const glacis = {
  name: 'test_glacis', kind: 'main', physicalMm: 50, keMm: 50, ceMm: 50,
  verts: [[-1, 0, 1], [1, 0, 1], [1, 2, 1], [-1, 2, 1]],
};
const rear = {
  name: 'test_rear', kind: 'main', physicalMm: 20, keMm: 20, ceMm: 20,
  verts: [[1, 0, -1], [-1, 0, -1], [-1, 2, -1], [1, 2, -1]],
};
const skirt = {
  name: 'test_skirt', kind: 'spaced', physicalMm: 10, keMm: 10, ceMm: 10,
  verts: [[1.3, 0, 1], [1.3, 0, -1], [1.3, 2, -1], [1.3, 2, 1]],
};
const vertices = [
  [-1, 0, -1], [1, 0, -1], [1, 2, -1], [-1, 2, -1],
  [-1, 0, 1], [1, 0, 1], [1, 2, 1], [-1, 2, 1],
];
const quads = [
  [[4, 5, 6], [4, 6, 7], [0, 3, 2], [0, 2, 1]],
  [[1, 2, 6], [1, 6, 5], [0, 4, 7], [0, 7, 3]],
  [[3, 7, 6], [3, 6, 2], [0, 1, 5], [0, 5, 4]],
];
const faces = quads.flat().map((indices) => {
  const a = new THREE.Vector3().fromArray(vertices[indices[0]]);
  const b = new THREE.Vector3().fromArray(vertices[indices[1]]);
  const c = new THREE.Vector3().fromArray(vertices[indices[2]]);
  const normal = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
  return {
    indices,
    normal: normal.toArray(),
    constant: -normal.dot(a),
    center: a.add(b).add(c).multiplyScalar(1 / 3).toArray(),
    plate: normal.z < -0.5 ? rear : glacis,
    internal: false,
  };
});

function makeTarget(id, x) {
  const root = new THREE.Group();
  root.visible = true;
  const hull = new THREE.Group();
  hull.name = 'rig_hull';
  const turret = new THREE.Group();
  turret.name = 'rig_turret';
  root.add(hull, turret);
  root.position.set(x, 0, 0);
  root.updateMatrixWorld(true);
  const uniforms = makeBurnUniforms(7);
  return {
    id,
    state: { pos: new THREE.Vector3(x, 0, 0), yaw: 0, visualPitch: 0, visualRoll: 0, turretYaw: 0, gunPitch: 0 },
    combat: { destroyed: false, eraSpent: new Set() },
    visual: { root, armorPaint: () => ({ uniforms, hull, turret }) },
    spec: {
      armor: {
        turretPivot: [0, 0, 0], gunPivot: [0, 0, 0],
        hullPlates: [glacis, rear, skirt], turretPlates: [], modules: [], crew: [],
        collisionShells: { hull: [{ min: [-1, 0, -1], max: [1, 2, 1], vertices, faces }], turret: [] },
      },
    },
    uniforms,
  };
}
const target = makeTarget('overlay-test', 0);
// a second vehicle of the same spec shares its armour model (and so its zone table's geometry)
const secondTarget = { ...makeTarget('overlay-test-2', 4), spec: target.spec };
const shellSpec = { name: 'test AP', type: 'AP', caliberMm: 100, pen100Mm: 150, pen1000Mm: 100 };

const overlay = createArmorAimOverlay();
const entry = overlay.prime(target);
const secondEntry = overlay.prime(secondTarget);
assert.ok(entry && secondEntry, 'every scoped enemy with paint gets an entry');
assert.equal(overlay.prime({ ...target, id: 'no-paint', visual: { root: new THREE.Group() } }), null, 'a visual without paint gets none');
assert.equal(target.uniforms.uApOn.value, 0, 'primed paint stays off before scope');

// the zone table: the two main plates (the spaced skirt is a layer, not a zone), each a plane and an outline
{
  const table = entry.table;
  assert.equal(table.length, 2 * ARMOR_PAINT_ZONE_TEXELS * 4, 'one run of texels per main plate');
  assert.deepEqual([...table.slice(0, 4)].map((v) => +v.toFixed(6)), [0, 0, 1, -1], 'the glacis plane: z = 1, facing +z');
  const edges = [];
  for (let e = 1; e < ARMOR_PAINT_ZONE_TEXELS - 1; e++) edges.push([...table.slice(e * 4, e * 4 + 4)]);
  assert.equal(edges.filter((edge) => edge[0] || edge[1] || edge[2]).length, 4, 'the glacis outline: four edge planes');
  for (const edge of edges) assert.ok(edge[0] * 0 + edge[1] * 1 + edge[2] * 1 + edge[3] <= 0, 'the outline centre is inside every edge');
  assert.equal(table[(ARMOR_PAINT_ZONE_TEXELS - 1) * 4 + 3], 0, 'no colour before a sample');
  assert.notEqual(secondEntry.table, entry.table, 'each vehicle paints its own colours');
  assert.equal(secondEntry.template, entry.template, 'vehicles of one spec share the zones');
}

overlay.update({ enabled: true, scoped: true, targets: [target, secondTarget], target: null, shellSpec,
  muzzle: new THREE.Vector3(0, 1, 6), nowMs: 0 });
assert.equal(target.uniforms.uApOn.value, 1, 'scope turns the paint on without a direct reticle target');
assert.equal(secondTarget.uniforms.uApOn.value, 1, 'scope paints every visible enemy');
assert.equal(target.uniforms.uApZones.value, entry.texture, 'the paint reads this vehicle\'s table');
assert.deepEqual(target.uniforms.uApCounts.value.toArray(), [2, 0, 0], 'two hull zones, no turret, no mantlet');
assert.deepEqual([...target.uniforms.uApHullC.value.toArray(), ...target.uniforms.uApHullH.value.toArray()], [0, 1, 0, 1, 1, 1],
  'the hull\'s cell bounds as a box: centre and half extents');
// the frames: world → hull frame is the inverse of the hull's world matrix
{
  const probe = new THREE.Vector3(4.5, 1, 0.5).applyMatrix4(secondTarget.uniforms.uApHullInv.value);
  assert.ok(probe.distanceTo(new THREE.Vector3(0.5, 1, 0.5)) < 1e-9, 'a world point maps into the second vehicle\'s hull frame');
}
// one batch samples the first vehicle (the query budget rotates); the face the round meets head-on is penetrable (green)
{
  const green = new THREE.Color(0x48d985);
  const at = (ARMOR_PAINT_ZONE_TEXELS - 1) * 4;
  assert.ok(Math.abs(entry.table[at] - green.r) + Math.abs(entry.table[at + 1] - green.g) + Math.abs(entry.table[at + 2] - green.b) < 1e-6
    && entry.table[at + 3] === 1, 'the glacis zone is green: a 150 mm round on a 50 mm face head-on');
  assert.ok(entry.texture.version > 0, 'the table uploads when a zone is painted');
  assert.equal(secondEntry.table[at + 3], 0, 'one update keeps the single-batch query budget');
  // the rear plate is behind the glacis from the muzzle: its samples see the glacis first, so they stand in hidden
  const rearAt = (2 * ARMOR_PAINT_ZONE_TEXELS - 1) * 4;
  assert.equal(entry.table[rearAt + 3], 1, 'a zone seen only through other armour still takes its blended colour');
}

overlay.update({ enabled: true, scoped: false, targets: [target, secondTarget], shellSpec, nowMs: 100 });
assert.equal(target.uniforms.uApOn.value, 0, 'leaving scope turns the paint off');
assert.equal(secondTarget.uniforms.uApOn.value, 0, 'scope exit turns every enemy\'s paint off');

overlay.update({ enabled: true, scoped: true, targets: [target, secondTarget], shellSpec, muzzle: new THREE.Vector3(0, 1, 6), nowMs: 150 });
overlay.update({ enabled: false, scoped: true, targets: [target, secondTarget], shellSpec, nowMs: 200 });
assert.equal(target.uniforms.uApOn.value, 0, 'the setting turns the paint off at once');
const restoreWarm = overlay.warm();
restoreWarm();
overlay.clear();
assert.equal(target.uniforms.uApZones.value, null, 'battle cleanup lets go of the table');
overlay.dispose();

// the mantlet's footprint (Main's ruling, 262): after the zones, a mantlet or gun-notch plate's box — its x range, its
// height +-0.1 m, its z range +-0.35 m — and its zone, so a forward surface over it paints the mantlet
{
  const cheek = { name: 'test_turret_cheek', kind: 'main', physicalMm: 300, keMm: 300, ceMm: 300,
    verts: [[-1, 0, 1], [1, 0, 1], [1, 2, 1], [-1, 2, 1]] };
  const mantlet = { name: 'test_gun_mantlet', kind: 'main', physicalMm: 200, keMm: 200, ceMm: 200,
    verts: [[-0.3, 0.8, 1], [0.3, 0.8, 1], [0.3, 1.2, 1], [-0.3, 1.2, 1]] };
  const turretTarget = makeTarget('overlay-turret', 8);
  const hullCells = target.spec.armor.collisionShells.hull;
  turretTarget.spec = { armor: { ...target.spec.armor, turretPlates: [cheek, mantlet], collisionShells: { hull: hullCells, turret: hullCells } } };
  const turretOverlay = createArmorAimOverlay();
  const turretEntry = turretOverlay.prime(turretTarget);
  assert.equal(turretEntry.template.footprints, 1, 'one mantlet, one footprint');
  const foot = [...turretEntry.table.slice(4 * 4 * ARMOR_PAINT_ZONE_TEXELS)].map((v) => +v.toFixed(6));
  assert.deepEqual(foot, [-0.3, 0.7, 0.65, 3, 0.3, 1.3, 1.35, 0], 'the footprint box after the four zones, its zone the mantlet\'s');
  // the bare barrel: a cylinder along the gun from just ahead of the turret's front and its mantlet's (z = 1 + 0.05)
  const turretGroup = turretTarget.visual.root.children[1], gun = new THREE.Group();
  gun.position.set(0, 1, 0.5);
  turretGroup.add(gun);
  turretTarget.visual.root.updateMatrixWorld(true);
  const paint = turretTarget.visual.armorPaint();
  turretTarget.visual = { root: turretTarget.visual.root, armorPaint: () => ({ ...paint, gun }) };
  turretOverlay.clear();
  turretOverlay.prime(turretTarget);
  turretOverlay.update({ enabled: true, scoped: true, targets: [turretTarget], shellSpec, muzzle: new THREE.Vector3(8, 1, 6), nowMs: 0 });
  assert.deepEqual(turretTarget.uniforms.uApCounts.value.toArray(), [2, 2, 1], 'the paint reads the footprint');
  assert.deepEqual(turretTarget.uniforms.uApGun.value.toArray().map((v) => +v.toFixed(6)), [1.05, 0.15], 'the barrel from 5 cm ahead of the turret, 15 cm about the gun');
  const muzzlePoint = new THREE.Vector3(8, 1, 2.5).applyMatrix4(turretTarget.uniforms.uApGunInv.value);
  assert.ok(muzzlePoint.distanceTo(new THREE.Vector3(0, 0, 2)) < 1e-9, 'a world point maps into the gun\'s frame');
  turretOverlay.dispose();
}

console.log('armorAimOverlay.selftest: zone tables, mantlet footprints, scope-owned paint on every enemy, frames, bounded sampling and cleanup passed');
