import {assertHollowMuzzle} from '../../../tools/physical-muzzle.test-support.mjs';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank, KIT } from '../tankFactory.ts';
import { LECLERC_CLASSIC_X_DATUMS as D } from './leclercClassicXFrame.ts';
import { near } from '../../../tools/receipt-kit.test-support.mjs';
import { getSpec } from '../specs.ts';
import { traceTank, tankPoseFromState } from '../../sim/armor.ts';
import { AMX56_KIT_SURFACE_GROUP } from '../leclercClassicXKitArmor.ts';

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
  near(bounds.min.x, -2.0625, .0001, 'owner-added side armor fastener left extreme');
  near(bounds.max.x, 2.0625, .0001, 'owner-added side armor fastener right extreme');
  const sourceHull = worldBounds(all.filter(m => m.name === 'hull'));
  near(sourceHull.min.x, -1.8, .0001, 'original source forward guard left extreme retained');
  near(sourceHull.max.x, 1.8, .0001, 'original source forward guard right extreme retained');
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
    // The owner-added service cases sit on this bin. Sample its retained
    // source roof below their pallet, rather than calling the case a defect.
    near(ray(all, [x, x === .5 ? 2.352 : 4, z], [0, -1, 0])?.point.y, y, tolerance,
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
  assertHollowMuzzle(tank.root,D.muzzleZ);
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
    near(m.elements[13], tank.root.getObjectByName('rig_hull')?.userData.runningGearReceipts?.at(-1)?.wheelY ?? D.wheelY, 1e-6, 'road-wheel axle height follows the ground-datum seat (2026-09-17)');
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

function fieldPackage(tank, all) {
  const armor=all.filter(m=>m.name==='hullExternalArmor');
  const cage=all.filter(m=>m.name==='hullOpenLattice');
  assert(cage.length && armor.length,'separate real armor and open lattice');
  for(const side of [-1,1]) {
    for(const z of [-1.8,-.8,.2,1.0]) {
      const outside=ray(armor,[side*3,1.19,z],[-side,0,0]);
      const inside=ray(armor,[side*1.70,1.19,z],[side,0,0]);
      assert(outside && inside && Math.abs(outside.point.x-inside.point.x)>.20,
        'new skirt is finite thick stock outside the original running gear');
      assert(ray(armor,[side*1.72,2,z],[0,-1,0]),'continuous bridge joins fender to skirt');
    }
    for(const z of [-2.925,-1.575,-.225,1.125,2.475]) {
      assert(ray(cage,[side*2.4,.43,z],[-side,0,0],.65),'physical cage rail');
      assert.equal(ray(all,[side*2.4,.469,z],[-side,0,0],.65),undefined,'actual air between slats, including regenerated fills');
    }
  }
  const turret=tank.root.getObjectByName('rig_turret');
  const moving=all.filter(m=>m.name==='turretOpenLattice'||m.name==='turretCloth');
  const fixed=all.filter(m=>['hull','hullExternalArmor','hullDetail'].includes(m.name));
  assert(moving.length>=2,'cargo and cages have separate finishes');
  const sample=new THREE.Vector3();let supported=0;
  for(let yaw=0;yaw<360;yaw+=15){
    turret.rotation.y=yaw*Math.PI/180;tank.root.updateMatrixWorld(true);
    for(const mesh of moving){
      let owner=mesh.parent;while(owner&&owner!==turret)owner=owner.parent;
      assert.equal(owner,turret,'baskets and cargo belong to turret yaw');
      const positions=mesh.geometry.attributes.position;
      for(let i=0;i<positions.count;i+=3){
        sample.fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld);
        const roof=ray(fixed,[sample.x,5,sample.z],[0,-1,0]);
        if(roof){assert(sample.y-roof.point.y>.15,'all added moving equipment clears hull through full yaw');supported++;}
      }
    }
  }
  assert(supported>100,'sweep covers actual overlapping hull projections');
  turret.rotation.y=0;tank.root.updateMatrixWorld(true);
}

// 2026-10-02: the owner's field kit (6e8c2fbd3) is installed side armor. Its thick folded modules carry
// spaced plates on the exact loft triangles (leclercClassicXKitArmor.ts), in the AMX-10P 25 kit's protection
// family; the open slat screens below stay unarmored, and the retained source skirt is the layer behind.
function fieldKitArmor(all) {
  const spec = getSpec('leclerc_classic_x');
  const kit = spec.armor.hullPlates.filter(p => p.surfaceGroup?.startsWith(`${AMX56_KIT_SURFACE_GROUP}:`));
  const loft = all.find(m => m.name === 'hullExternalArmor');
  const key = vs => vs.map(v => v.map(n => n.toFixed(5)).join(',')).sort().join('|');
  const rendered = new Set(), position = loft.geometry.attributes.position, point = new THREE.Vector3();
  for (let i = 0; i < position.count; i += 3) rendered.add(key([0, 1, 2].map(offset =>
    point.fromBufferAttribute(position, i + offset).applyMatrix4(loft.matrixWorld).toArray())));
  assert.equal(kit.length, 80, 'five outward faces x four station spans x two triangles x two sides');
  const family = getSpec('amx10p_25').armor.hullPlates.find(p => /^skirt_[LR]_\d/.test(p.name));
  for (const plate of kit) {
    assert(rendered.has(key(plate.verts)), `${plate.name}: combat armor is an actual rendered field-kit facet`);
    assert.equal(plate.kind, 'spaced');
    assert.deepEqual([plate.physicalMm, plate.keMm, plate.ceMm], [family.physicalMm, family.keMm, family.ceMm],
      'the AMX-10P 25 kit protection family');
    assert(plate.verts.every(v => v[1] >= .94), 'the open lower slat screens carry no invisible solid armor');
  }
  const pose = tankPoseFromState({ pos: new THREE.Vector3(), yaw: 0, visualPitch: 0, visualRoll: 0, turretYaw: 0, gunPitch: 0 });
  const spaced = (from, to) => traceTank(new THREE.Vector3(...from), new THREE.Vector3(...to), pose, spec.armor)
    .filter(h => h.kind === 'plate' && h.plate.kind === 'spaced');
  for (const side of [-1, 1]) {
    for (const z of [-2.925, -1.575, -.225, 1.125, 2.475]) for (const y of [.47, .62, .78, .90])
      assert.equal(spaced([side * 2.4, y, z], [side * 1.85, y, z]).length, 0, 'slat screens and their gaps stay unarmored');
    for (const z of [-1.8, -.8, .2, 1.0]) {
      const layers = spaced([side * 3, 1.19, z], [side * 1.0, 1.19, z]);
      assert.equal(layers.length, 2, `side shot at z${z}: kit module then retained source skirt, once each`);
      assert.equal(layers[0].plate.surfaceGroup, `${AMX56_KIT_SURFACE_GROUP}:${side}`, 'the outer layer is the installed kit');
      assert(layers[1].plate.name.includes('_source_'), 'the inner layer is the retained source skirt');
    }
  }
  // Exact shared kit edges charge once along the faces' own normal.
  const normal = v => new THREE.Vector3(...v[1]).sub(new THREE.Vector3(...v[0]))
    .cross(new THREE.Vector3(...v[2]).sub(new THREE.Vector3(...v[0]))).normalize();
  const edges = new Map(); let shared = 0;
  for (const plate of kit) for (let i = 0; i < 3; i++) {
    const a = plate.verts[i], b = plate.verts[(i + 1) % 3];
    const edge = `${plate.surfaceGroup}:` + [a, b].map(v => v.map(n => n.toFixed(6)).join(',')).sort().join('|');
    const other = edges.get(edge);
    if (!other) { edges.set(edge, plate); continue; }
    const n = normal(plate.verts).add(normal(other.verts)).normalize();
    if (n.lengthSq() < .5) continue;
    const mid = new THREE.Vector3(...a).add(new THREE.Vector3(...b)).multiplyScalar(.5);
    const hits = spaced(mid.clone().addScaledVector(n, .05).toArray(), mid.clone().addScaledVector(n, -.01).toArray())
      .filter(h => h.plate.surfaceGroup === plate.surfaceGroup);
    assert.equal(hits.length, 1, `${plate.name}/${other.name}: an exact shared kit edge charges once`);
    shared++;
  }
  assert(shared > 100, 'the seam sweep covers the kit triangles');
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
    boreAndOwnership(tank, all); groundScroll(tank, gear); fieldPackage(tank, all); fieldKitArmor(all);
  } finally { tank.dispose(); }
}
console.log('leclercClassicX: actual high/low source frame, selected surfaces/optical and basket air, round deep bore, ownership, 48-phase ground and field-kit armor (80 loft plates, open slats, kit-then-skirt layering, single-charge seams) PASS');
