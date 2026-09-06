import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { sourceCornerZ } from './t14XCorner.ts';

const near = (actual, expected, tolerance, label) => assert.ok(
  Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance,
  `${label}: ${actual} vs ${expected} ± ${tolerance}`,
);
const hit = (mesh, origin, direction) => new THREE.Raycaster(
  new THREE.Vector3(...origin), new THREE.Vector3(...direction), 0, 12,
).intersectObject(mesh, false)[0]?.point;

function sourceFixtureChecks(root) {
  const detail = root.getObjectByName('turretDetail');
  const deck = root.getObjectByName('hullDetail');
  const mount = root.getObjectByName('gunMount');
  const barrel = root.getObjectByName('gun');
  // The source's maximum RWS diameter belongs to the lower bearing, not
  // the tall optic head. An oversized cylinder passes outer silhouette IoU.
  near(hit(detail, [-2, 2.95, -1.254], [1, 0, 0])?.x, -.60075, .003, 'actual upper optic radius');
  for (const [y, z] of [[2.9, -1.47542], [3.1, -1.59968], [3.14, -1.62631]]) {
    near(hit(detail, [.14, y, 0], [0, 0, -1])?.z, z, .004, 'sloping RWS fork face');
  }
  for (const [x, z, y] of [[-.60, 1.80, 1.68108], [.60, 1.60, 1.68877]]) {
    near(hit(deck, [x, 2, z], [0, -1, 0])?.y, y, .004, 'staggered source crew hatch seat');
  }
  near(hit(mount, [1, 2.05, .90], [-1, 0, 0])?.x, .33126, .002, 'octagonal source mantlet width');
  assert.ok(!hit(mount, [.25, 2.05, 1.5], [1, 0, 0]), 'no oversized detached collar ahead of mantlet');
  near(hit(barrel, [0, 3, 5.45228], [0, -1, 0])?.y, 2.16670, .003, 'muzzle-reference bracket top');
  assert.equal(barrel.parent.name, 'rig_recoil', 'muzzle-reference fixture recoils with barrel, not fixed mantlet');
}

function shoulderChecks(hull) {
  for (const side of [-1,1]) {
    for (const [z,y] of [[2.4,1.63749],[2.9,1.59502],[3.47,1.49228],[3.65,1.45324],
      [4,1.30624],[4.18,1.21421],[4.26,1.17331]]) {
      near(hit(hull,[side*1.35,3,z],[0,-1,0])?.y,y,.008,'source shoulder armor, not a bare low fender');
    }
    const channel=hit(hull,[side*1.64,3,3.47],[0,-1,0]);
    const inboard=hit(hull,[side*1.35,3,3.47],[0,-1,0]);
    near(channel?.y,1.42345,.005,'actual recessed front-lamp channel floor');
    assert.ok(inboard.y-channel.y>.05,'lamp channel is real negative space between armor strips');
    near(hit(hull,[side*1.75,3,4],[0,-1,0])?.y,1.32151,.012,'continuous outer shoulder cap');
  }
}

function glacisPanelChecks(root) {
  const detail=root.getObjectByName('hullDetail');
  const reactive=root.getObjectByName('hullExternalArmor');
  const panelHit=(origin,direction)=>new THREE.Raycaster(new THREE.Vector3(...origin),
    new THREE.Vector3(...direction),0,12).intersectObjects([detail,reactive],false)[0]?.point;
  for (const x of [-.7356,-.4904,-.2452,0,.2452,.4904,.7356]) {
    for (const [z,y] of [[3.3,1.44514],[3.6,1.32999],[3.8,1.23040],[4,1.13082]]) {
      near(panelHit([x,2,z],[0,-1,0])?.y,y,.003,'seven narrow source panel courses');
    }
  }
  assert.ok(!panelHit([.1226,2,3.8],[0,-1,0]),'real seam between separately enclosed armor panels');
  for (const [x,z,y] of [[0,2.5,1.62822],[0,2.9,1.54129],[-.27,3,1.54393]]) {
    near(hit(detail,[x,2,z],[0,-1,0])?.y,y,.008,'source asymmetric upper plate and service hatch');
  }
}

function cornerPocketChecks(root) {
  const visible = [];
  root.traverseVisible(object => {
    if (object.isMesh && !/^procShadow/.test(object.name) && !object.userData.geometryAuditIgnore
      && !object.userData.vehicleMarking) visible.push(object);
  });
  const frontHit = (x, y) => new THREE.Raycaster(new THREE.Vector3(x, y, 4),
    new THREE.Vector3(0, 0, -1), 0, 6).intersectObjects(visible, false)[0];
  for (const side of [-1, 1]) {
    // Independent Object_11 rays: the two small frontal corner recesses are
    // different openings from the main optic and the aft side-shroud slots.
    for (const [y, z] of [[2.14, .25764], [2.19, .26647], [2.24, .27530]]) {
      const back = frontHit(side * 1.15, y);
      near(back?.point.z, z, .003, 'actual source corner-pocket backing, including every visible material');
      assert.equal(back.object.name, 'turret', 'the recess backing is structural armor, not a dark surface');
      assert.ok(back.face.normal.y < -.10 && back.face.normal.z > .80,
        'source reverse-sloped pocket back is a real front-facing triangle');
    }
    const back = frontHit(side * 1.15, 2.14).point.z;
    const floor = frontHit(side * 1.15, 2.06).point.z;
    const lip = frontHit(side * 1.15, 2.29).point.z;
    near(floor, .40519, .010, 'source sloping corner-pocket floor');
    near(lip, .342, .010, 'separate upper corner-pocket lip');
    assert.ok(floor - back > .14 && lip - back > .075,
      'source corner cavity retains real air depth below its enclosing lips');
    for (const [y, z] of [[2.06, .749819], [2.14, .576938], [2.19, .474258]]) {
      near(frontHit(side * 1.12, y)?.point.z, z, .003, 'source steep inboard jamb, not a blended pocket extension');
    }
    near(frontHit(side * 1.08, 2.29)?.point.z, .392173, .020,
      'adjacent source air above the jamb is not filled by the old cheek');
    near(frontHit(side * 1.08, 2.17)?.point.z, .721396, .003,
      'held-out ninth inboard bevel preserves adjacent air');
  }
  for (const [x, y, z] of [[1.195, 2.09, .206917], [1.245, 2.09, .163262],
    [1.195, 2.225, .245004], [1.28, 2.20, .180783], [1.30, 2.26, .186679],
    [1.32, 2.20, .176572], [1.32, 2.26, .173851]]) {
    near(frontHit(x, y)?.point.z, z, .003, 'source folded lower recess and separate rising outer return');
  }
  for (const [x, y, z] of [[.045, 3.12, -1.612993], [.055, 2.99, -1.526463]]) {
    near(frontHit(x, y)?.point.z, z, .003, 'source RWS tapered support is present behind its front opening');
  }
  for (const [x, y] of [[-.02, 3.12], [.175, 3.12], [.175, 3.13]]) {
    assert.equal(frontHit(x, y), undefined, 'genuine source RWS side gap remains through-air across all visible meshes');
  }
}

function sideShroudChecks(root) {
  const visible = [];
  // These are physical source-wall rays, not paint-seat rays. At Y2.18/Z-.35
  // the correctly offset designation is X-1.3588394, while the actual wall
  // is X-1.3528324 (source -1.3528323). Independent marking footprint tests
  // enforce its 6 mm seat; exclude only that decal, never real equipment.
  root.traverseVisible(object => {
    if (object.isMesh && !/^procShadow/.test(object.name) && !object.userData.geometryAuditIgnore
      && !object.userData.vehicleMarking) visible.push(object);
  });
  const sideHit = (side, y, z) => new THREE.Raycaster(new THREE.Vector3(side * 4, y, z),
    new THREE.Vector3(-side, 0, 0), 0, 8).intersectObjects(visible, false)[0]?.point;
  for (const y of [2.06, 2.18, 2.30]) {
    near(sideHit(-1, y, -.40)?.x, -1.350417, .010, 'source left shroud is closed, not a mirrored right aperture');
    near(sideHit(1, y, -.40)?.x, 1.343075, .010, 'source aft right jamb remains solid');
  }
  for (const z of [-.35, -.25, -.15]) {
    near(sideHit(1, 2.18, z)?.x, .771940, .004, 'source right aperture has genuinely deep visible backing');
    near(sideHit(-1, 2.18, z)?.x, (1.3676015 + .000249 * 2.18 + .0482515 * z) / -.998835,
      .004, 'closed left source shroud plane');
  }
  for (const z of [-.30, -.20]) {
    near(sideHit(1, 2.02, z)?.x, .731708, .004, 'source right opening extends below the invented lower lip');
    assert.ok(sideHit(1, 2.40, z)?.x > 1.3, 'real upper aperture armor stays attached');
  }
}

function sightCavityChecks(root) {
  const turret = root.getObjectByName('turret'), visible = [];
  root.traverseVisible(object => {
    if (object.isMesh && !/^procShadow/.test(object.name) && !object.userData.geometryAuditIgnore
      && !object.userData.vehicleMarking) visible.push(object);
  });
  const frontHit = (x, y) => new THREE.Raycaster(new THREE.Vector3(x, y, 4),
    new THREE.Vector3(0, 0, -1), 0, 6).intersectObjects(visible, false)[0]?.point;
  for (const x of [.60, .70]) {
    for (const y of [2.25, 2.29, 2.35]) {
      near(frontHit(x, y)?.z, .631867, .003, 'source central glass is physically recessed behind its rim');
      near(hit(turret, [x, y, 4], [0, 0, -1])?.z, .567251, .003, 'source structural sight backing behind glass');
      assert.ok(hit(turret, [-x, y, 4], [0, 0, -1]).z - frontHit(x, y).z > .25,
        'sight retains real air depth relative to neighboring armor');
    }
    near(frontHit(x, 2.20)?.z, .651326, .003, 'source lower optical body');
  }
  near(frontHit(.68, 2.205)?.z, .631867, .003, 'source glass aperture begins at Y2.20018, not a raised lower bar');
  for (const x of [.55, .60, .70]) {
    near(frontHit(x, 2.15)?.z, .795427, .003, 'source steep sight floor encloses the opening');
  }
  for (const y of [2.20, 2.25, 2.35]) {
    near(frontHit(.55, y)?.z, .714899, .003, 'source raised inclined inboard sight rim');
  }
}

function cornerPartitionChecks(turret) {
  const triangles = (turret.geometry.index?.count ?? turret.geometry.attributes.position.count) / 3;
  assert.ok(triangles < 5000, 'active source facets must not expand into the former82k redundant structural triangles');
  // This is an implementation-invariance check, not the source-fidelity
  // oracle: the independent fixed source rays above remain authoritative.
  // Stop before the separately retained outboard return can occlude the cell.
  for (const side of [-1, 1]) for (let a = 0; a <= 16; a++) for (let b = 0; b <= 16; b++) {
    const x = .995 + a / 16 * .315, y = 2.025 + b / 16 * .270;
    near(hit(turret, [side * x, y, 4], [0, 0, -1])?.z, sourceCornerZ(x, y), .00002,
      'closed active-cell surface equals the unchanged analytic corner envelope');
  }
}

// Independent scalar oracle, from the owner's source study (not builder
// metadata). Material-fused source nodes cannot support honest component
// silhouette masks, so explicit occupied/empty-space probes are essential.
for (const quality of ['high', 'low']) {
  const tank = createTank('t14_x', null, { quality, proceduralOnly: true, geometryReceipt: true });
  const structuralGeometry = tank.root.getObjectByName('turret')?.geometry;
  let structuralDisposals = 0;
  structuralGeometry?.addEventListener('dispose', () => { structuralDisposals++; });
  try {
    tank.root.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(tank.root);
    near(bounds.max.y, 3.7679, .06, 'highest source antenna');
    near(bounds.max.z - bounds.min.z, 9.9701, .12, 'source overall length');
    near(bounds.max.x - bounds.min.x, 3.90, .06, 'source cage width');
    assert.ok(bounds.min.y > -.04 && bounds.min.y < .04, 'native shoe contact at ground');
    const shoes = tank.root.getObjectByName('gearTrackPads');
    shoes.geometry.computeBoundingBox();
    near(shoes.geometry.boundingBox.getSize(new THREE.Vector3()).y, .06829, .002,
      'source-measured radial shoe web and guide extent');
    const shoeBounds = new THREE.Box3().setFromObject(shoes);
    near(shoeBounds.min.z, -3.27183, .025, 'source rear wrap extent without oversized pitch radius');
    near(shoeBounds.max.z, 3.82843, .025, 'source front wrap extent');
    near(shoeBounds.max.y, 1.16572, .025, 'source return course height');
    const hull = tank.root.getObjectByName('hull');
    const turret = tank.root.getObjectByName('turret');
    assert.ok(hull?.isMesh && turret?.isMesh, 'independently authored structural meshes');
    sourceFixtureChecks(tank.root);
    shoulderChecks(hull);
    glacisPanelChecks(tank.root);
    cornerPocketChecks(tank.root);
    sideShroudChecks(tank.root);
    sightCavityChecks(tank.root);
    cornerPartitionChecks(turret);
    near(hit(hull, [0, 0, -3.5], [0, 1, 0])?.y, .70621, .012, 'source central stern underside');
    for (const [y, z] of [[.8, -3.60204], [1, -3.70313], [1.2, -3.80519]]) {
      near(hit(hull, [1, y, -5], [0, 0, 1])?.z, z, .012, `source central rear plate ${y}`);
    }
    assert.ok(!hit(hull, [0, .9, -4.1], [0, 1, 0]), 'recess behind central plate is not filled to aft-fender envelope');
    for (const [x, y, z] of [[-1, 2.25, .72791], [-1, 2.45, .45772],
      [-.85, 2.45, .62465], [-.70, 2.25, 1.01603], [-.55, 2.25, 1.11835]]) {
      near(hit(turret, [x, y, 4], [0, 0, -1])?.z, z, .025, 'source front cheek plane');
    }
    for (const side of [-1, 1]) for (const [x, y, z] of [[1.38, 2.25, .11401],
      [1.38, 2.35, .02304], [1.3, 2.45, .09291]]) {
      near(hit(turret, [side * x, y, 4], [0, 0, -1])?.z, z, .045, 'source stepped outer shroud');
    }
    for (const [z, roof] of [[2.4, 1.53814], [2.8, 1.50063], [3.2, 1.45481], [3.6, 1.3225], [4, 1.12424]]) {
      near(hit(hull, [0, 6, z], [0, -1, 0])?.y, roof, .012, `measured bow station ${z}`);
      const underside = hit(hull, [0, -.2, z], [0, 1, 0])?.y;
      assert.ok(Number.isFinite(underside) && underside < roof - .1, `closed positive-thickness bow ${z}`);
    }
    const wheels = tank.root.getObjectByName('gearRoadWheelTires');
    assert.ok(wheels?.isInstancedMesh && wheels.count === 14, 'seven native road wheels per side');
    const wheelCenters = [], matrix = new THREE.Matrix4();
    for (let i = 0; i < wheels.count; i++) {
      wheels.getMatrixAt(i, matrix);
      wheelCenters.push(new THREE.Vector3().setFromMatrixPosition(matrix).applyMatrix4(wheels.matrixWorld));
    }
    for (const side of [-1, 1]) for (const z of [-2.1577, -1.3711, -.574, .215, 1.0117, 1.8668, 2.7725]) {
      assert.ok(wheelCenters.some(p => Math.sign(p.x) === side && Math.abs(p.z - z) < .0001),
        `source axle preserved ${side}/${z}`);
    }
    const gun = tank.root.getObjectByName('rig_gun');
    const yaw = tank.root.getObjectByName('rig_turret');
    assert.equal(gun.parent, yaw, 'cannon pitch follows turret yaw');
    near(gun.getWorldPosition(new THREE.Vector3()).y, 2.051, .001, 'physical cannon bore');
    near(new THREE.Box3().setFromObject(gun).max.z, 5.64301, .008, 'source cannon muzzle');
    const rws = tank.root.getObjectByName('armataXRemoteMachineGun');
    assert.equal(rws.parent, yaw, 'roof weapon is mounted to rotating assembly');
    assert.equal(rws.userData.firingAxis, '+Z', 'level collinear receiver and barrel');
    near(new THREE.Box3().setFromObject(rws).max.z, -.70595, .005, 'exposed source roof-MG muzzle');
    const local = rws.position.clone();
    yaw.rotation.y = .9;
    gun.rotation.x = -.15;
    tank.root.updateMatrixWorld(true);
    assert.ok(rws.position.equals(local), 'roof cradle remains seated through articulation');
  } finally {
    tank.dispose();
    if (structuralGeometry) assert.equal(structuralDisposals, 1, 'per-vehicle corner and turret geometry is disposed exactly once');
  }
}
console.log('t14XGeometry: measured bow, actual sight/side voids, solid backing, source axles, cannon and exposed roof weapon pass in high/low detail');
