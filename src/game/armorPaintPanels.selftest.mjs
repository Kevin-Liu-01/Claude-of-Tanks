// The armour paint by panel (263, game/armorPaintPanels.ts): each connected triangle cluster of a painted draw takes one
// zone (the area-weighted majority of the paint's own score), so a border falls on a part's edge; gear is bare; what the
// pose decides (a hull part under the turret's sweep, a turret part by the barrel) and a geometry drawn twice keep the
// per-point score (0). Held here: a tile across a border takes one zone, a side slab its side, an indexed box its faces,
// gear above the hull bare, the barrel bare, the turret's sweep live, a shared geometry and an unpainted draw left out,
// the slices equal to the whole, the same answer twice; the hook's attribute default and shader; and a T-72B3 battle
// build, its draws near and far as unbaked, its far stand-ins carrying the panels.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { installCanvasFixture } from '../vehicles/canvasFixture.test-support.mjs';

const restoreCanvas = installCanvasFixture();
const { bakePaintPanels, bakePaintPanelSteps, panelBakeStats } = await import('./armorPaintPanels.ts');
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
const UPPER = 0, LOWER = 1, SIDE_R = 2;
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
  assert.equal(meshes.tyre.geometry.getAttribute('apZone'), undefined, 'an unpainted draw carries no panels');
  assert.ok([...meshes.twinA.geometry.getAttribute('apZone').array].every((v) => v === 0), 'a geometry drawn twice keeps the per-point score');
  assert.equal(stats.shared, 1);
  assert.ok(stats.baked > 0 && stats.bare > 0 && stats.clusters > 0 && stats.votes <= stats.triangles, 'the tally');
  // the bake is once a geometry: a second bake under the same armour leaves it as it is
  const again = bakePaintPanels(root, template(), { hull, turret: null, gun: null }, armor);
  assert.equal(again.geometries, 0, 'a baked vehicle bakes nothing twice');
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
  root.updateMatrixWorld(true);
  bakePaintPanels(root, template(turretZones, [[-0.85, -0.05, -0.85], [0.85, 0.85, 0.85]]), { hull, turret, gun }, {});
  assert.ok([...under.geometry.getAttribute('apZone').array].every((v) => v === 0), 'a hull part under the turret\'s sweep is live');
  assert.ok([...barrel.geometry.getAttribute('apZone').array].every((v) => v === -1), 'the barrel is bare');
  assert.ok([...cheek.geometry.getAttribute('apZone').array].every((v) => v === 0), 'a turret part by the barrel is live');
  assert.deepEqual(faceValues(face.geometry, [0, 0, 1]), [hullZones.length + 1], 'a turret face clear of the barrel takes the turret\'s front');
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
  assert.ok(stats.baked > 0.5 * stats.triangles, `t72b3: most painted triangles bake (${stats.baked} of ${stats.triangles})`);
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
  console.log(`armorPaintPanels.selftest: t72b3 ${stats.baked}/${stats.triangles} baked, ${stats.votes} votes, slice ${stats.sliceMs} ms`);
}

restoreCanvas();
console.log('armorPaintPanels.selftest: panels on parts\' edges, gear bare, the pose\'s parts live, shared and unpainted left out, slices = whole, the hook\'s default, a battle build\'s draws unchanged');
