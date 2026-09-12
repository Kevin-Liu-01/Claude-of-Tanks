import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank, KIT } from '../tankFactory.ts';
import { LECLERC_CLASSIC_X_DATUMS as D } from './leclercClassicXFrame.ts';

const near = (actual, expected, tolerance, label) => assert.ok(Number.isFinite(actual)
  && Math.abs(actual - expected) <= tolerance, `${label}: ${actual}, source ${expected} ±${tolerance}`);
const ray = (objects, p, d, far = 20) => new THREE.Raycaster(
  new THREE.Vector3(...p), new THREE.Vector3(...d), 0, far).intersectObjects(objects, false)[0];

function visibleMeshes(root) {
  const meshes = [];
  root.traverse(o => {
    if (o.isMesh && !o.userData.shadowOnly && !o.userData.vehicleMarking
      && !/Proxy|procShadow/.test(o.name)) meshes.push(o);
  });
  return meshes;
}

function worldBounds(meshes) {
  const box = new THREE.Box3(), matrix = new THREE.Matrix4(), point = new THREE.Vector3();
  for (const mesh of meshes) for (let instance = 0; instance < (mesh.isInstancedMesh ? mesh.count : 1); instance++) {
    if (mesh.isInstancedMesh) { mesh.getMatrixAt(instance, matrix); matrix.premultiply(mesh.matrixWorld); }
    else matrix.copy(mesh.matrixWorld);
    const position = mesh.geometry.attributes.position;
    for (let i = 0; i < position.count; i++) {
      point.fromBufferAttribute(position, i).applyMatrix4(matrix);
      assert.ok(point.toArray().every(Number.isFinite), 'all authored/animated geometry is finite');
      box.expandByPoint(point);
    }
  }
  return box;
}

function framesAndEnvelope(tank, all) {
  // Fleet mouth standard (2026-09-12, terminal-surface-fit-r2): the flush
  // lining sits 0.3-0.9 mm proud of the terminal face as a shading device; the
  // source envelope receipt measures authored stock only.
  const bounds = worldBounds(all.filter((mesh) => !/^muzzleBoreShadowFallback/.test(mesh.name)));
  near(bounds.min.x, -1.8, .0001, 'source forward guard left extreme');
  near(bounds.max.x, 1.8, .0001, 'source forward guard right extreme');
  near(bounds.min.y, 0, .0001, 'actual source ground plane');
  near(bounds.min.z, -3.71963792937, .00001, 'real fuel-carry aft bracket');
  // Low quality folds the flush lining into the static batch, so the stock
  // envelope may carry the lining's 0.3-0.9 mm crown past the terminal face.
  near(bounds.max.z, D.muzzleZ, .001, 'actual older-file terminal tube (flush lining crown allowed)');
  near(bounds.max.y, 3.19835755241, .00001, 'source tapered stock maximum');
  const turret = tank.root.getObjectByName('rig_turret'), gun = tank.root.getObjectByName('rig_gun');
  for (const [index, axis] of ['x', 'y', 'z'].entries()) {
    near(turret.position[axis], D.turretPivot[index], 1e-8, 'measured inner-bearing axis');
    near(gun.position[axis] + turret.position[axis], D.trunnion[index], 1e-8,
      'explicit inferred attachment on measured circular axis');
  }
  assert.ok(tank.root.getObjectByName('gunMount'), 'real pitching mount geometry is present');
}

function heldOutSurfaces(all) {
  // Source Object4 at intermediate longitudinal stations; no broad camera fit.
  const hull = all.filter(m => m.name === 'hull');
  near(ray(hull, [0, 3, -2.5], [0, -1, 0])?.point.y, 1.666856, .001,
    'source rear-deck main plane');
  near(ray(hull, [.5, 3, 3], [0, -1, 0])?.point.y, 1.392771444, .00002,
    'source Object287 folded bow course above231 and main tub');
  near(ray(all, [-.5, 4, -1], [0, -1, 0])?.point.y, 2.414513274, .0001,
    'actual lowered port well floor, not the outer roof AABB');
  near(ray(all, [-1.0, 4, -1], [0, -1, 0])?.point.y, 2.462109369, .0001,
    'actual left roof plane beside the well');
  for (const [x, y, z] of [[1.0040145, 3.19835755241, -1.1813242],
    [-1.1669338, 3.19835755241, -1.1813242]])
    near(ray(all, [x, 4, z], [0, -1, 0])?.point.y, y, .00001, 'complete source stock height');
  assert.equal(ray(all, [1.055, 3.0, -1.1813], [-1, 0, 0], .03), undefined,
    'the source tapered stock is not filled out to its broad base width');
}

function opticalAir(all) {
  for (const [x, y, front, glass, back, owner] of [
    [-.57, 2.16, 1.8785, 1.863994525, 1.85537146, 'gunner'],
    [.58, 2.70, .973385, .919431882, .90551426, 'panoramic'],
  ]) {
    near(ray(all, [x, y, front + .1], [0, 0, -1])?.point.z, glass, .00005,
      `${owner}: integrated first surface is the actual recessed source glass`);
    near(ray(all.filter(m => m.name !== 'turretGlass'), [x, y, front + .1], [0, 0, -1])?.point.z,
      back, .00005, `${owner}: genuine separate physical backing`);
    assert.equal(ray(all, [x, y, front], [0, 0, -1], front - glass - .001), undefined,
      `${owner}: true air before the lens; no painted solid mouth`);
  }
  assert.equal(ray(all, [-.90, 2.10, -2.5], [0, 0, 1], .20), undefined,
    'rear basket center is empty between real rails');
  near(ray(all, [-.90, 2.08, -2.20], [0, -1, 0])?.point.y, 1.935448, .00001,
    'open basket has the actual narrow floor rather than a floating rail cage');
}

function correctedRoof(all) {
  for (const [x, z, y, tolerance] of [[-.8, 0, 2.163613558, .00001],
    [-1.1, 0, 2.30867856, .00001], [-1, 0, 2.282347565, .001],
    [-.5, .6, 2.300891636, .0001], [.5, .1824385, 2.45354557, .00001],
    [.7767935, .1824385, 2.491897345, .00001], [.085, -1.915, 2.880746841, .00001],
    [-1.4, -2.6, 2.298399671, .001], [-.15, -2.1, 1.925250646, .00001]])
    near(ray(all, [x, 4, z], [0, -1, 0])?.point.y, y, tolerance,
      `held-out source first surface X${x}/Z${z}`);
  assert.equal(ray(all, [-.75, 2.22, -.3], [0, 0, 1], .5), undefined,
    'port coaming retains genuine145mm-deep air, not a solid low hatch box');
  near(ray(all, [-.6, 2.2, 0], [-1, 0, 0])?.point.x, -.967655746, .0001,
    'actual port coaming inward wall has its independent source clearance');
  assert.equal(ray(all, [.026035, 2.84, -1.850], [0, 0, -1], .012), undefined,
    'enlarged mast rim has an inclined forward underside, not a tall solid head');
  const support = ray(all, [1.4, 2.38, .174996], [-1, 0, 0], .4);
  assert.ok(support && support.point.x > 1.07,
    'actual crew cap has a full source-backed support body below it');
  assert.ok(ray(all, [-1.65, 1.923, -2.1], [1, 0, 0], .13),
    'actual basket floor positively engages its outboard frame, not a floating inset plate');
}

function hullEquipment(all) {
  for (const [x, y] of [[-1.1, 1.449501317], [1, 1.465289829]])
    near(ray(all, [x, 2, 3.4], [0, -1, 0])?.point.y, y, .00001,
      'actual independently canted source bow-light hood');
  for (const x of [-.9719255, .9694035]) {
    near(ray(all, [x, 1.3849, 3.6], [0, 0, -1])?.point.z, 3.400365164, .001,
      'source closed curved lens is recessed behind its actual hood');
    assert.equal(ray(all, [x, 1.3849, 3.451], [0, 0, -1], .047), undefined,
      'actual bow light aperture has air before the lens');
  }
  near(ray(all, [1.469231, 2, -3.563797], [0, -1, 0])?.point.y,
    1.53314364, .00001, 'upturned exhaust retains the source deep floor');
  near(ray(all, [1.57, 2, -3.563797], [0, -1, 0])?.point.y,
    1.648367, .00001, 'actual annular mouth has positive stock around its opening');
  assert.equal(ray(all, [1.469231, 1.64, -3.563797], [0, -1, 0], .10), undefined,
    'rear exhaust has true vertical air, not a black disk on a capped pipe');
  near(ray(all, [1.60, 1.60, -3.5], [0, 0, 1])?.point.z, -3.37854728, .00002,
    'source401 rear shoulder mounting face engages the real exhaust root');
}

function rearRoofFold(all) {
  for (const [x, z, y, tolerance] of [[-.13, -1.90, 2.208530438, .00001],
    [1.30, -.60, 2.256898184, .00001], [.12, -1.95, 2.297250389, .0001],
    [.5, -1.92, 2.34582165, .005]])
    near(ray(all, [x, 4, z], [0, -1, 0])?.point.y, y, tolerance,
      'actual source aft fold, separate support and unchanged overlying bin');
  near(ray(all, [1.32, 2.24, -2.2], [0, 0, 1])?.point.z, -1.771119291, .00001,
    'source outer folded face, not the former rectangular rear shoulder');
  assert.equal(ray(all, [1.25, 2.24, -1.92], [0, 0, 1], .08), undefined,
    'genuine empty outer aft corner is not filled by a wide terrace');
  near(ray(all, [.025177, 2.24, -2.2], [0, 0, 1])?.point.z, -2.048056126, .00002,
    'actual source856 rear-pocket backing');
  assert.equal(ray(all, [.025177, 2.24, -2.085], [0, 0, 1], .035), undefined,
    'measured rear pocket keeps its true37.7mm air depth');
  const support = ray(all, [.12, 2.286, -2.15], [0, 0, 1]);
  assert.ok(support && support.point.z < -2.05,
    'actual mast root sits inside closed source support stock');
  near(ray(all, [.1, 4, -1.75], [0, -1, 0])?.point.y, 2.3445813656, .00001,
    'the supporting roof encloses the source base at its forward contact, above the2.297m base crown');
}

function guardAndCarry(all) {
  const armor = all.filter(m => m.name === 'hull' || m.name === 'hullRubber');
  const guard = armor.filter(m => m.name === 'hull');
  for (const x of [-1.4, 1.4]) {
    near(ray(guard, [x, .98, 4], [0, 0, -1])?.point.z, 3.45376004, .00001,
      'source external folded guard plane is unchanged by concealed clearance repair');
    near(ray(armor, [x, 2, 3.4], [0, -1, 0])?.point.y, 1.32311251, .00001,
      'source bow course287 remains the actual first surface above guard692');
    assert.equal(ray(armor, [x, .98, 3.35], [0, 0, 1], .075), undefined,
      'actual track bay has air where source hidden stock interpenetrates source track');
    near(3.45376004 - ray(armor, [x, .98, 3.40], [0, 0, 1])?.point.z, .008, .0005,
      'inferred concealed shell retains positive8mm stock rather than an erased cap');
    near(ray(armor, [x, 2, 3.60], [0, -1, 0])?.point.y, 1.27248097, .00001,
      'actual shallow cap roof, not the old false diagonal wedge');
  }
  for (const offset of [0, -.472281, .670426, 1.164037]) {
    near(ray(all, [-.49 + offset, 2, -3.50], [0, -1, 0])?.point.y,
      1.61976345, .00001, 'one of four real source carry cheek crowns');
    near(ray(all, [-.37 + offset, 2, -3.50], [0, -1, 0])?.point.y,
      1.47737756, .00001, 'actual lower central channel floor preserves its relief');
    assert.equal(ray(all, [-.37 + offset, 1.59, -3.50], [0, 0, 1], .1), undefined,
      'real narrow source carry channel has air above the stepped floor');
    const roots = ray(all, [-.49 + offset, 1.54, -3.31], [0, 0, 1], .025);
    assert.ok(roots, 'each carry cheek overlaps the retained rear stock/vent backing');
  }
}

function boreAndOwnership(tank, all) {
  const muzzle = tank.gunMuzzleWorld(new THREE.Vector3());
  near(muzzle.x, D.trunnion[0], 1e-8, 'actual firing marker circular X axis');
  near(muzzle.y, D.trunnion[1], 1e-8, 'actual firing marker circular Y axis');
  near(muzzle.z, D.muzzleZ, 1e-8, 'actual firing marker is the rim, not deep bore disk');
  const gunParts = all.filter(m => m.name === 'gun' || m.name === 'gunDark');
  for (const z of [3.0, 4.0, 5.5]) {
    near(ray(gunParts, [D.trunnion[0], 3, z], [0, -1, 0])?.point.y,
      D.trunnion[1] + .1400485, .00002, 'actual source circular jacket crown');
    near(ray(gunParts, [1, D.trunnion[1], z], [-1, 0, 0])?.point.x,
      D.trunnion[0] + .1400485, .00002, 'independent equal source horizontal radius');
  }
  // Fleet mouth standard (2026-09-12, terminal-surface-fit-r2): the outer
  // course of the lathe reaches the muzzle marker, so the mouth-face scan seats
  // the flush lining 0.3 mm proud of that face; the source's deep 120 mm
  // backing stays behind it as metal. Low quality folds the lining into the
  // static batch; the metal witness excludes that batch too (the lathe and its
  // dark floor are never batched).
  const metal = all.filter(m => !/muzzleBoreShadowFallback|mobileStaticBatch/.test(m.name));
  const lining = ray(all, [D.trunnion[0], D.trunnion[1], 6.6], [0, 0, -1]);
  assert.equal(lining?.object.name, 'muzzleBoreShadowFallbackDisc', 'visible mouth is the fleet lining, not a lit throat');
  near(lining?.point.z, D.muzzleZ + .0003, .0005, 'mouth lining sits flush on the terminal face at the muzzle marker');
  near(ray(metal, [D.trunnion[0], D.trunnion[1], 6.6], [0, 0, -1])?.point.z,
    4.60643577576, .0013, 'source deep backing plus existing 1.2mm inner liner');
  assert.equal(ray(metal, [D.trunnion[0], D.trunnion[1], 6.31], [0, 0, -1], 1.5), undefined,
    'front bore stays physically open for its actual deep source interval');
  for (const [dx, dy] of [[.045, 0], [-.045, 0], [0, .045], [0, -.045]]) {
    const wall = ray(metal, [D.trunnion[0] + dx, D.trunnion[1] + dy, 6.6], [0, 0, -1]);
    near(wall?.point.z, 4.60643577576, .0013, 'real 120 mm calibre: off-axis rays reach the same backing');
  }
  const gun = tank.root.getObjectByName('gun');
  assert.ok(gun.parent.name === 'rig_recoil' || gun.parent.parent?.name === 'rig_recoil',
    'tube and attached MRS share the real recoil owner');
}

function groundScroll(tank, gear) {
  const tires = tank.root.getObjectByName('gearRoadWheelTires'), m = new THREE.Matrix4();
  for (let i = 0; i < tires.count; i++) {
    tires.getMatrixAt(i, m);
    const side = i % 2;
    near(m.elements[12], D.wheelCenters[side], 1e-6, 'source asymmetric road-wheel axle X');
    near(m.elements[13], D.wheelY, 1e-6, 'source road-wheel axle height');
    near(m.elements[14], (side ? D.wheelZsRight : D.wheelZsLeft)[Math.floor(i / 2)],
      1e-6, 'independent source left/right wheel stations');
  }
  const shoes = [];
  tank.root.traverse(o => { if (o.isMesh && o.userData.trackRigidLinkChords) shoes.push(o); });
  assert.equal(shoes.length, 2, 'one actual rigid link course per side');
  const envelope = worldBounds(shoes);
  near(envelope.min.z, -3.091904883, .006, 'independent source rear track extreme');
  near(envelope.max.z, 3.413659938, .006, 'independent source forward track extreme');
  near(envelope.max.y, 1.236155960, .02,
    'source upper course; native rigid-link tessellation remains within20mm');
  const layout = structuredClone(gear.roadWheelLayout), pitch = shoes[0].userData.trackShoePitchM;
  for (let phase = 0; phase < 48; phase++) {
    gear.update(pitch * phase / 48, -pitch * phase / 48, 0);
    tank.root.updateMatrixWorld(true);
    near(worldBounds(shoes).min.y, 0, .0001, `actual contact phase${phase}`);
    assert.deepEqual(gear.roadWheelLayout, layout, 'scroll never changes source axle stations');
  }
}

for (const quality of ['high', 'low']) {
  const original = KIT.buildRunningGear;
  let tank, gear;
  KIT.buildRunningGear = (...args) => { gear = original(...args); return gear; };
  try { tank = createTank('leclerc_classic_x', null,
    { quality, proceduralOnly: true, geometryReceipt: true, batchStatic: false }); }
  finally { KIT.buildRunningGear = original; }
  try {
    tank.root.updateMatrixWorld(true);
    const all = visibleMeshes(tank.root);
    framesAndEnvelope(tank, all); heldOutSurfaces(all); opticalAir(all); correctedRoof(all); guardAndCarry(all);
    hullEquipment(all); rearRoofFold(all);
    boreAndOwnership(tank, all); groundScroll(tank, gear);
  } finally { tank.dispose(); }
}
console.log('leclercClassicX: actual high/low source frame, selected surfaces/optical and basket air, round deep bore, ownership and48-phase ground PASS');
