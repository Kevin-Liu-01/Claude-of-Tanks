// The armour paint by panel (263, game/armorPaintPanels.ts): each connected triangle cluster of a painted draw takes one
// zone (the area-weighted majority of the paint's own score), so a border falls on a part's edge; gear is bare; a part is
// judged in its own rig's frame; a cluster with no majority goes by part (a small dome whole, a large welded casting split
// at its creases); a turret part by the barrel and a geometry drawn twice keep the per-point score (0). Held here: a tile
// across a border takes one zone, a side slab its side, an indexed box its faces, gear above the hull bare, the barrel
// bare, a hull part under the turret the roof, a dome whole, a fold by its crease, the measure of where panels and the
// per-point paint disagree, a shared geometry and an unpainted draw left out, the slices equal to the whole; the hook's
// attribute default and shader; and a T-72B3 battle build, its draws near and far as unbaked, its far stand-ins carrying
// the panels.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { installCanvasFixture } from '../vehicles/canvasFixture.test-support.mjs';

const restoreCanvas = installCanvasFixture();
const { bakePaintPanels, bakePaintPanelSteps, measurePanels, panelBakeStats } = await import('./armorPaintPanels.ts');
const { zoneAt, zonePlates } = await import('../sim/armorZones.ts');
const { tagVehicleMaterial } = await import('../vehicles/appearanceAudit.ts');
const { applyBurnHook, removeBurnHook, makeBurnUniforms } = await import('../vehicles/materials.ts');

const plate = (name, verts) => ({ name, kind: 'main', verts, physicalMm: 50, keMm: 50, ceMm: 50 });
const hullPlates = [
  plate('upper_glacis', [[-1, 1, 1], [1, 1, 1], [1, 2, 1], [-1, 2, 1]]),
  plate('lower_front', [[-1, 0, 1], [1, 0, 1], [1, 1, 1], [-1, 1, 1]]),
  plate('side_R', [[1, 0, 1], [1, 0, -1], [1, 2, -1], [1, 2, 1]]),
  plate('side_L', [[-1, 0, -1], [-1, 0, 1], [-1, 2, 1], [-1, 2, -1]]),
  plate('roof', [[-1, 2, 1], [1, 2, 1], [1, 2, -1], [-1, 2, -1]]),
  plate('rear', [[1, 0, -1], [-1, 0, -1], [-1, 2, -1], [1, 2, -1]]),
];
const UPPER = 0, LOWER = 1, SIDE_R = 2, ROOF = 4;
const hullZones = zonePlates(hullPlates);
const template = (turretZones = [], turretBox = null) => ({
  zones: [...hullZones, ...turretZones], hullZones: hullZones.length,
  turretMin: new THREE.Vector3(...(turretBox ? turretBox[0] : [1, 1, 1])), turretMax: new THREE.Vector3(...(turretBox ? turretBox[1] : [-1, -1, -1])),
  hullCentre: new THREE.Vector3(0, 1, 0), hullHalf: new THREE.Vector3(1, 1, 1),
  turretCentre: new THREE.Vector3(0, 0.3, 0), turretHalf: new THREE.Vector3(0.6, 0.3, 0.6),
  barrelFrom: turretBox ? 0.8 : NaN, barrelRadius: 0.15,
});
const paint = tagVehicleMaterial(new THREE.MeshStandardMaterial(), 'armorPaint', 'armor-paint');
const tyre = tagVehicleMaterial(new THREE.MeshStandardMaterial(), 'tireRubber', 'tire-rubber');
const box = (w, h, d, x, y, z, indexed = false) => {
  const geometry = new THREE.BoxGeometry(w, h, d).translate(x, y, z);
  return indexed ? geometry : geometry.toNonIndexed();
};
/** The attribute's values on the triangles whose normal is `axis` (a box face). */
const faceValues = (geometry, axis) => {
  const zone = geometry.getAttribute('apZone'), normal = geometry.getAttribute('normal');
  const values = new Set();
  for (let v = 0; v < zone.count; v++) {
    if (Math.abs(normal.getX(v) - axis[0]) + Math.abs(normal.getY(v) - axis[1]) + Math.abs(normal.getZ(v) - axis[2]) < 1e-6) values.add(zone.getX(v));
  }
  return [...values];
};
function hullScene() {
  const root = new THREE.Group();
  const hull = new THREE.Group();
  hull.name = 'rig_hull';
  root.add(hull);
  const add = (geometry, material = paint) => { const mesh = new THREE.Mesh(geometry, material); hull.add(mesh); return mesh; };
  const meshes = {
    // a tile on the glacis across the upper/lower border (y = 1): the score splits it, the panel does not
    tile: add(box(0.6, 0.4, 0.05, 0, 1.1, 1.025)),
    slab: add(box(0.04, 0.6, 1, 1.02, 0.8, 0)),
    indexed: add(box(0.5, 0.3, 0.3, 0.6, 1.6, 0.86, true)),
    gear: add(box(0.1, 0.1, 0.1, 0, 2.35, 0)),
    tyre: add(box(0.3, 0.3, 0.3, 0.9, 0.2, 0), tyre),
  };
  const shared = box(0.2, 0.2, 0.05, 0, 0.5, 1.025);
  meshes.twinA = add(shared);
  meshes.twinB = add(shared);
  meshes.twinB.position.x = 0.4;
  return { root, hull, meshes };
}

// ---- the hull: panels, gear, a shared geometry, an unpainted draw
{
  const { root, hull, meshes } = hullScene();
  const armor = {};
  const stats = bakePaintPanels(root, template(), { hull, turret: null, gun: null }, armor);
  assert.deepEqual(faceValues(meshes.tile.geometry, [0, 0, 1]), [UPPER + 1], 'the tile\'s face takes one zone, the upper glacis');
  {
    // the score alone would split it: its lower strip lies nearer the lower plate
    const zone = zoneAt(hullZones, 0, 0.95, 1.05, 0, 0, 1);
    assert.equal(zone, LOWER, 'the per-point score gives the tile\'s lower strip the lower plate');
  }
  assert.deepEqual(faceValues(meshes.slab.geometry, [1, 0, 0]), [SIDE_R + 1], 'the side slab\'s face takes the side');
  assert.deepEqual(faceValues(meshes.indexed.geometry, [0, 0, 1]), [UPPER + 1], 'an indexed box: its front face the glacis');
  for (const axis of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
    assert.equal(faceValues(meshes.indexed.geometry, axis).length, 1, `an indexed box: one value a face (${axis})`);
  }
  assert.ok([...meshes.gear.geometry.getAttribute('apZone').array].every((v) => v === -1), 'gear above the hull\'s cells is bare');
  assert.ok(meshes.tyre.geometry.getAttribute('apZone') === undefined, 'an unpainted draw carries no panels');
  assert.ok([...meshes.twinA.geometry.getAttribute('apZone').array].every((v) => v === 0), 'a geometry drawn twice keeps the per-point score');
  assert.equal(stats.shared, 1);
  assert.ok(stats.baked > 0 && stats.bare > 0 && stats.clusters > 0 && stats.votes <= 4 * stats.triangles, `the tally (${JSON.stringify(stats)})`);
  // the bake is once a geometry: a second bake under the same armour leaves it as it is
  const again = bakePaintPanels(root, template(), { hull, turret: null, gun: null }, armor);
  assert.equal(again.geometries, 0, 'a baked vehicle bakes nothing twice');
}

// ---- a cluster with no majority, by part: a small dome whole, a large welded casting split at its crease
{
  const root = new THREE.Group(), hull = new THREE.Group();
  root.add(hull);
  // a dome (0.39 m²) on the glacis's top corner, across the glacis, the roof and the side
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(0.85, 1.9, 0.85).toNonIndexed(), paint);
  // a casting folded over the front edge: 1.6 x 0.6 m down the glacis and 1.6 x 0.6 m back over the roof, its normals
  // shared (smooth) along the fold: the fold is a crease, so it is two parts
  const fold = new THREE.BufferGeometry();
  const P = [[-0.8, 1.4, 1.02], [0.8, 1.4, 1.02], [0.8, 2.02, 1.02], [-0.8, 2.02, 1.02], [-0.8, 2.02, 0.4], [0.8, 2.02, 0.4]];
  const N = [[0, 0, 1], [0, 0, 1], [0, Math.SQRT1_2, Math.SQRT1_2], [0, Math.SQRT1_2, Math.SQRT1_2], [0, 1, 0], [0, 1, 0]];
  const tris = [[0, 1, 2], [0, 2, 3], [3, 2, 5], [3, 5, 4]];
  fold.setAttribute('position', new THREE.Float32BufferAttribute(tris.flat().flatMap((i) => P[i]), 3));
  fold.setAttribute('normal', new THREE.Float32BufferAttribute(tris.flat().flatMap((i) => N[i]), 3));
  const casting = new THREE.Mesh(fold, paint);
  // the same dome drawn flat-shaded (each facet its own normals) on the other corner: still one part
  const faceted = new THREE.SphereGeometry(0.25, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(-0.85, 1.9, 0.85).toNonIndexed();
  faceted.computeVertexNormals();
  const facets = new THREE.Mesh(faceted, paint);
  hull.add(dome, casting, facets);
  root.updateMatrixWorld(true);
  const samples = [];
  measurePanels((sample) => samples.push(sample));
  const stats = bakePaintPanels(root, template(), { hull, turret: null, gun: null }, {});
  measurePanels(null);
  assert.ok(samples.length > 0 && samples.every((x) => x.area > 0 && x.panel) && samples.some((x) => x.panel !== x.point),
    'the measure hands on each baked triangle, its panel\'s plate and the per-point paint\'s');
  const domeValues = new Set(dome.geometry.getAttribute('apZone').array);
  assert.ok(domeValues.size === 1 && [...domeValues][0] > 0, `a small dome across three zones takes one (${[...domeValues]})`);
  const facetValues = new Set(facets.geometry.getAttribute('apZone').array);
  assert.ok(facetValues.size === 1 && [...facetValues][0] > 0, `a flat-shaded dome, facet by facet, is one part (${[...facetValues]})`);
  const z = casting.geometry.getAttribute('apZone').array;
  assert.ok(z[0] === z[3] && z[6] === z[9] && z[0] > 0 && z[6] > 0, 'each side of the fold is one part');
  assert.equal(z[0], UPPER + 1, 'the fold\'s front: the upper glacis');
  assert.equal(z[6], ROOF + 1, 'its top: the roof');
  assert.ok(stats.wholeParts >= 1, `a part with no majority baked whole (${stats.wholeParts})`);
  assert.ok(stats.bakedArea > 0 && stats.disagreeArea > 0 && stats.disagreeArea < stats.bakedArea,
    `the dome's minority zones disagree with the per-point paint (${stats.disagreeArea.toFixed(3)} of ${stats.bakedArea.toFixed(3)} m²)`);
}

// ---- (264) a spaced part outside the cells takes the plate behind it: the authority's own ray inward along its normal
{
  const { tankPoseFromState } = await import('../sim/armor.ts');
  const upper = plate('side_upper_R', [[1, 1, 1], [1, 1, -1], [1, 2, -1], [1, 2, 1]]);
  const lower = plate('side_lower_R', [[1, 0, 1], [1, 0, -1], [1, 1, -1], [1, 1, 1]]);
  const roofPlate = plate('roof', [[-1, 2, 1], [1, 2, 1], [1, 2, -1], [-1, 2, -1]]);
  const front = plate('front', [[-1, 0, 1], [1, 0, 1], [1, 2, 1], [-1, 2, 1]]);
  // one cell, its whole +x side given to the lower plate (the authority's face assignment), the rest to the roof/front
  const vertices = [[-1, 0, -1], [1, 0, -1], [1, 2, -1], [-1, 2, -1], [-1, 0, 1], [1, 0, 1], [1, 2, 1], [-1, 2, 1]];
  const quads = [[4, 5, 6], [4, 6, 7], [0, 3, 2], [0, 2, 1], [1, 2, 6], [1, 6, 5], [0, 4, 7], [0, 7, 3], [3, 7, 6], [3, 6, 2], [0, 1, 5], [0, 5, 4]];
  const faces = quads.map((indices) => {
    const [a, b, c] = indices.map((i) => new THREE.Vector3(...vertices[i]));
    const n = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
    return { indices, normal: n.toArray(), constant: -n.dot(a), center: a.clone().add(b).add(c).multiplyScalar(1 / 3).toArray(), internal: false,
      plate: n.x > 0.5 ? lower : n.z > 0.5 ? front : roofPlate };
  });
  const armor = { hullPlates: [upper, lower, roofPlate, front], turretPlates: [], modules: [], crew: [], turretPivot: [0, 0, 0], gunPivot: [0, 0, 0],
    collisionShells: { hull: [{ min: [-1, 0, -1], max: [1, 2, 1], vertices, faces }], turret: [] } };
  const zones = zonePlates(armor.hullPlates);
  const tmpl = { ...template(), zones, hullZones: zones.length };
  const skirtScene = () => {
    const root = new THREE.Group(), hull = new THREE.Group();
    root.add(hull);
    // a skirt panel 0.3 m off the side, at the upper plate's height
    const skirt = new THREE.Mesh(box(0.02, 0.4, 1, 1.3, 1.5, 0), paint);
    hull.add(skirt);
    root.updateMatrixWorld(true);
    return { root, hull, skirt };
  };
  const plain = skirtScene();
  bakePaintPanels(plain.root, tmpl, { hull: plain.hull, turret: null, gun: null }, armor);
  assert.deepEqual(faceValues(plain.skirt.geometry, [1, 0, 0]), [1], 'without the authority, the skirt takes the zone where it sits: the upper side');
  const pose = tankPoseFromState({ pos: new THREE.Vector3(), yaw: 0, visualPitch: 0, visualRoll: 0, turretYaw: 0, gunPitch: 0 });
  // (267) with the authority, a skirt the sim traces (its spaced plate at it) takes the plate the shell meets through it;
  // one it does not trace is air to the round: bare
  const skirtPlate = { name: 'skirt_R', kind: 'spaced', physicalMm: 10, keMm: 10, ceMm: 10,
    verts: [[1.31, 1.3, 0.5], [1.31, 1.3, -0.5], [1.31, 1.7, -0.5], [1.31, 1.7, 0.5]] };
  const spaced = { ...armor, hullPlates: [...armor.hullPlates, skirtPlate] };
  const asked = skirtScene();
  const stats = bakePaintPanels(asked.root, tmpl, { hull: asked.hull, turret: null, gun: null }, spaced, { pose });
  assert.deepEqual(faceValues(asked.skirt.geometry, [1, 0, 0]), [2], 'with it, the plate the shell meets through it: the lower side');
  assert.ok(stats.standoff > 0 && stats.standoffRays > 0, `the skirt's ray (${stats.standoffRays})`);
  const air = skirtScene();
  const airStats = bakePaintPanels(air.root, tmpl, { hull: air.hull, turret: null, gun: null }, armor, { pose });
  assert.deepEqual(faceValues(air.skirt.geometry, [1, 0, 0]), [-1], 'a skirt the sim does not trace stands off the armour: bare');
  assert.ok(airStats.offArmour > 0, `the skirt counted off the armour (${airStats.offArmour})`);

  // (267) what a round's damage reads: a box standing on the roof is bare whole (its flush underside too), a plate flush
  // on the roof is painted, the hull's own armour standing off the side is painted (the cells are hulled from it)
  const roofScene = () => {
    const root = new THREE.Group(), hull = new THREE.Group();
    root.add(hull);
    const add = (geometry, role) => { const mesh = new THREE.Mesh(geometry, paint); if (role) mesh.userData.combatHitboxRole = role; hull.add(mesh); return mesh; };
    const meshes = {
      stowage: add(box(0.6, 0.4, 0.6, -0.4, 2.2, 0), 'nonArmor'),
      flush: add(box(0.4, 0.03, 0.4, 0.5, 2.015, 0.5), 'nonArmor'),
      armour: add(box(0.1, 0.4, 0.4, 1.3, 1.0, -0.5), 'armor'),
    };
    root.updateMatrixWorld(true);
    return { root, hull, meshes };
  };
  const roof = roofScene();
  const roofStats = bakePaintPanels(roof.root, tmpl, { hull: roof.hull, turret: null, gun: null }, armor, { pose });
  assert.deepEqual([...new Set(roof.meshes.stowage.geometry.getAttribute('apZone').array)], [-1], 'a stowage box on the roof: bare whole');
  assert.ok(faceValues(roof.meshes.flush.geometry, [0, 1, 0]).every((v) => v > 0), 'a plate flush on the roof: painted');
  assert.ok(faceValues(roof.meshes.armour.geometry, [1, 0, 0]).every((v) => v > 0), 'the hull\'s own armour off the cells: painted');
  assert.ok(roofStats.offArmour >= 12, `the box's twelve triangles off the armour (${roofStats.offArmour})`);
  // negative control: without the authority the box's flush underside takes the zone where it sits (above the cells, its
  // top and sides were bare before 267 too: the hull's gear rule)
  const roofPlain = roofScene();
  bakePaintPanels(roofPlain.root, tmpl, { hull: roofPlain.hull, turret: null, gun: null }, armor);
  assert.ok(faceValues(roofPlain.meshes.stowage.geometry, [0, -1, 0]).every((v) => v > 0), 'the control: no authority, the box\'s underside is painted');
}

// ---- (267) gear is bare whole wherever it is drawn: equipment, a machine gun, the running gear (instanced too), a suit
{
  const root = new THREE.Group(), hull = new THREE.Group();
  root.add(hull);
  const add = (mesh, data = {}, name = '') => { Object.assign(mesh.userData, data); mesh.name = name; hull.add(mesh); return mesh; };
  const gear = [
    add(new THREE.Mesh(box(0.3, 0.3, 0.3, 0, 2.1, 0), paint), { combatHitboxRole: 'equipment' }),
    add(new THREE.Mesh(box(0.1, 0.1, 1, 0.5, 2.05, 0), paint), { appearanceRole: 'machineGun' }),
    add(new THREE.InstancedMesh(box(0.1, 0.1, 0.1, 0, 0.3, 0), paint, 2), { runningGear: true }),
    add(new THREE.Mesh(box(1, 0.01, 1, 0, 2.01, 0), paint), {}, 'x_ghillie_hull_net'),
  ];
  const marking = add(new THREE.Mesh(box(0.4, 0.02, 0.4, -0.5, 2.0, -0.5), paint), { combatHitboxRole: 'equipment' }, 'turretPermanentMarkingSurface');
  const kit = add(new THREE.Mesh(box(0.3, 0.3, 0.04, 0.5, 1.5, 1.03), paint), { combatHitboxRole: 'nonArmor' });
  root.updateMatrixWorld(true);
  const stats = bakePaintPanels(root, template(), { hull, turret: null, gun: null }, {});
  for (const mesh of gear) {
    assert.deepEqual([...new Set(mesh.geometry.getAttribute('apZone').array)], [-1], `${mesh.name || Object.keys(mesh.userData)[0]}: gear, bare whole`);
  }
  assert.ok(faceValues(marking.geometry, [0, 1, 0]).every((v) => v > 0), 'the marking surface is painted (the turret\'s own face)');
  assert.ok(faceValues(kit.geometry, [0, 0, 1]).every((v) => v > 0), 'the control: other kit is judged by where it sits');
  assert.ok(stats.gear >= 12 * 3, `gear counted (${stats.gear})`);
}

// ---- (267) a large face a few zones share keeps the per-point border, naming them: the paint scores those alone
{
  const root = new THREE.Group(), hull = new THREE.Group();
  root.add(hull);
  const front = new THREE.Mesh(box(1.6, 1.6, 0.02, 0, 1, 1.01), paint);
  hull.add(front);
  root.updateMatrixWorld(true);
  const sets = [];
  const zoneSet = (zones) => {
    const key = [...zones].sort((a, b) => a - b).join(','), at = sets.indexOf(key);
    return at >= 0 ? at : sets.push(key) - 1;
  };
  const tmpl = { ...template(), zoneSet };
  const stats = bakePaintPanels(root, tmpl, { hull, turret: null, gun: null }, {});
  assert.deepEqual(faceValues(front.geometry, [0, 0, 1]), [-2], 'the face across the upper/lower border names set 0');
  assert.equal(sets[0], `${UPPER},${LOWER}`, 'set 0: the upper and the lower front');
  assert.ok(stats.sets > 0 && stats.sets <= stats.perPoint, `the set's triangles are per-point ones (${stats.sets} of ${stats.perPoint})`);
  // the control: a template without set slots keeps the full per-point score
  const plain = new THREE.Mesh(box(1.6, 1.6, 0.02, 0, 1, 1.01), paint);
  const plainRoot = new THREE.Group(), plainHull = new THREE.Group();
  plainRoot.add(plainHull); plainHull.add(plain); plainRoot.updateMatrixWorld(true);
  bakePaintPanels(plainRoot, template(), { hull: plainHull, turret: null, gun: null }, {});
  assert.deepEqual(faceValues(plain.geometry, [0, 0, 1]), [0], 'the control: no pair slots, the per-point score');
}

// ---- the slices equal the whole, the same answer twice
{
  const whole = hullScene(), sliced = hullScene();
  bakePaintPanels(whole.root, template(), { hull: whole.hull, turret: null, gun: null }, {});
  const stats = panelBakeStats();
  const work = bakePaintPanelSteps(sliced.root, template(), { hull: sliced.hull, turret: null, gun: null }, {}, stats);
  let slices = 0;
  for (let next = work.next(); !next.done; next = work.next()) slices++;
  for (const key of ['tile', 'slab', 'indexed', 'gear']) {
    assert.deepEqual([...sliced.meshes[key].geometry.getAttribute('apZone').array], [...whole.meshes[key].geometry.getAttribute('apZone').array],
      `${key}: the slices bake what the whole does`);
  }
  assert.ok(stats.sliceMs >= 0 && stats.ms >= 0);
  void slices;
}

// ---- the turret: its sweep live on the hull, the barrel bare, a turret part by the barrel live
{
  const turretPlates = [plate('turret_front', [[-0.6, 0, 0.6], [0.6, 0, 0.6], [0.6, 0.6, 0.6], [-0.6, 0.6, 0.6]])];
  const turretZones = zonePlates(turretPlates);
  const root = new THREE.Group();
  const hull = new THREE.Group(), turret = new THREE.Group(), gun = new THREE.Group();
  turret.position.set(0, 2, 0);
  gun.position.set(0, 0.3, 0.6);
  root.add(hull);
  hull.add(turret);
  turret.add(gun);
  const under = new THREE.Mesh(box(0.3, 0.05, 0.3, 0.5, 2.0, 0.5), paint);
  hull.add(under);
  const barrel = new THREE.Mesh(box(0.1, 0.1, 1.5, 0, 0, 1.65), paint);
  gun.add(barrel);
  const cheek = new THREE.Mesh(box(0.2, 0.2, 0.1, 0, 0.3, 1.4), paint);
  turret.add(cheek);
  const face = new THREE.Mesh(box(0.3, 0.3, 0.05, -0.4, 0.2, 0.62), paint);
  turret.add(face);
  // a mantlet's front on the gun, centred on the bore just past the barrel's start: the barrel covers a third of it
  const mantlet = new THREE.Mesh(box(0.6, 0.4, 0.02, 0, 0, 0.86), paint);
  gun.add(mantlet);
  // and a gun shield standing ahead of the turret's envelope: the turret's armour all the same
  const shield = new THREE.Mesh(box(0.5, 0.3, 0.02, 0, 0, 1.2), paint);
  gun.add(shield);
  root.updateMatrixWorld(true);
  bakePaintPanels(root, template(turretZones, [[-0.85, -0.05, -0.85], [0.85, 0.85, 1.6]]), { hull, turret, gun }, {});
  assert.deepEqual(faceValues(under.geometry, [0, 1, 0]), [ROOF + 1], 'a hull part under the turret is hull armour at any yaw: the roof');
  assert.ok([...barrel.geometry.getAttribute('apZone').array].every((v) => v === -1), 'the barrel is bare');
  assert.ok([...cheek.geometry.getAttribute('apZone').array].every((v) => v === 0), 'a turret part by the barrel is live');
  assert.deepEqual(faceValues(face.geometry, [0, 0, 1]), [hullZones.length + 1], 'a turret face clear of the barrel takes the turret\'s front');
  assert.deepEqual(faceValues(mantlet.geometry, [0, 0, 1]), [hullZones.length + 1], 'a mantlet\'s front on the bore takes its zone, not bare');
  assert.deepEqual(faceValues(shield.geometry, [0, 0, 1]), [hullZones.length + 1], 'a gun shield ahead of the envelope takes the turret\'s zone');
}

// ---- the hook: a draw without panels reads 0; the vertex reads the attribute, the fragment the panel
{
  const material = tagVehicleMaterial(new THREE.MeshStandardMaterial(), 'armorPaint', 'armor-paint');
  const burn = makeBurnUniforms(5);
  applyBurnHook(material, burn);
  assert.deepEqual(material.defaultAttributeValues, { apZone: [0] }, 'the hook defaults the attribute to 0');
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  material.onBeforeCompile(shader, {});
  assert.ok(shader.vertexShader.includes('attribute float apZone;') && shader.vertexShader.includes('vApZone = apZone;'), 'the vertex passes the panel on');
  assert.ok(shader.fragmentShader.includes('bool apPanel = apBaked > 0;'), 'the fragment reads it');
  removeBurnHook(material, burn);
  assert.equal(Object.prototype.hasOwnProperty.call(material, 'defaultAttributeValues'), false, 'and taking the hook off takes the default off');
}

// ---- a T-72B3 battle build: draws near and far as unbaked, the far stand-ins carry the panels
{
  const { createTank, ensureTankBuilder } = await import('../vehicles/fleetFactory.ts');
  const { getSpec } = await import('../vehicles/specs.ts');
  const { createTankState } = await import('../sim/movement.ts');
  const { createArmorAimOverlay } = await import('./armorAimOverlay.ts');
  await ensureTankBuilder('t72b3');
  const spec = getSpec('t72b3');
  const build = () => createTank('t72b3', null, { camoSeed: 7, quality: 'ai', geometryQuality: 'low', batchStatic: true,
    battleDetailLod: true, eraVisualBindingReceipt: false, staticDrawMerge: 'dual' });
  const draws = (root, dist) => {
    root.updateMatrixWorld(true);
    let count = 0, panels = 0, stand = 0;
    const visit = (o) => {
      if (!o.visible) return;
      if (o.isLOD) { let pick = o.levels[0]; for (const l of o.levels) if (dist >= l.distance) pick = l; if (pick) visit(pick.object); return; }
      if (o.isMesh && o.layers.isEnabled(0)) { count++; if (o.userData.farLod) { stand++; if (o.geometry.getAttribute('apZone')) panels++; } }
      for (const c of o.children) visit(c);
    };
    visit(root);
    return { count, panels, stand };
  };
  const settle = async (visual, state, dist) => { for (let i = 0; i < 2; i++) { visual.syncFromState(state, 1 / 30, dist); await new Promise((r) => setTimeout(r, 5)); } };
  const plain = build(), baked = build();
  const state = createTankState(spec, new THREE.Vector3(0, 0, 0), 0);
  const overlay = createArmorAimOverlay();
  await settle(baked, state, 10);
  await overlay.bakePanels({ id: 'panels', state, combat: null, visual: baked, spec }, async () => {});
  const stats = baked.root.userData.armorPaintPanels;
  assert.ok(stats.baked + stats.bare > 0.5 * stats.triangles, `t72b3: most painted triangles bake a zone or bare (${stats.baked} + ${stats.bare} of ${stats.triangles})`);
  assert.ok(stats.gear > 0 && stats.offArmour > 0, `t72b3: its gear and the parts standing off its armour are bare (${stats.gear}, ${stats.offArmour})`);
  await settle(plain, state, 10);
  assert.equal(draws(baked.root, 10).count, draws(plain.root, 10).count, 't72b3: the same draws near');
  // (the far LOD admits one build at a time: each is built here, as the streamer's slice does)
  plain.prepareFarLod(); baked.prepareFarLod();
  await settle(plain, state, 200); await settle(baked, state, 200);
  const far = draws(baked.root, 200), farPlain = draws(plain.root, 200);
  assert.equal(far.count, farPlain.count, 't72b3: the same draws far');
  assert.ok(far.panels > 0 && far.panels < far.stand + 1, `t72b3: the far stand-ins carry the panels (${far.panels} of ${far.stand})`);
  overlay.dispose();
  plain.dispose(); baked.dispose();
  console.log(`armorPaintPanels.selftest: t72b3 ${stats.baked}/${stats.triangles} baked, ${stats.bare} bare (${stats.gear} gear, ${stats.offArmour} off the armour), ${stats.sets} per-point naming a zone set, ${stats.votes} votes, slice ${stats.sliceMs} ms`);
}

restoreCanvas();
console.log('armorPaintPanels.selftest: panels on parts\' edges, gear bare, parts in their own rig\'s frame, no-majority clusters by part, the disagreement measure, shared and unpainted left out, slices = whole, the hook\'s default, a battle build\'s draws unchanged; (267) only what a round\'s damage reads: gear bare by role, parts standing off the armour bare, a traced skirt painted, split faces naming their zones');
