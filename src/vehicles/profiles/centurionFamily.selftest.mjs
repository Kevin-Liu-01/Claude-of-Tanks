// Release 262 (the owner: the Centurions and the Strv 81 "based on proper historical references so they will no longer
// look so chungus"): the rebuilt Centurion family (profiles/centurionFamily.ts) holds its published proportions and keeps
// the three marks distinct. Until 262 the Mk 3 and Mk 5/2 carried a 3D-print fit (a pointed wedge nose 0.80 m wide, a
// crown at 2.50-2.57 m, shelves to 1.51 m) and the Strv 81 the same casting squashed to 0.82 of its height.
//   - hull 7.557 m long (front guards to rear plate) within 1 %, 3.28-3.39 m over the side plates, the roof at 1.70 m;
//   - the cast turret over a 1.88 m ring 0.47 m ahead of the hull's middle, unsquashed, its roof at 2.62-2.72 m and the
//     casting at least 1.10 m wide 0.30 m behind its front face (the wedge nose read 0.80);
//   - the guns: the Mk 3's 20-pdr Type A swells only at its muzzle counterweight, the Strv 81B's Type B carries its short
//     fume-extractor can 42-52 % along, the Mk 5/2's L7 its bore evacuator 40-50 % along and stands shorter;
//   - the Mk 5 pattern's cupola machine gun (Mk 5/2, Strv 81B, Sho't Kal) and none on the Mk 3 (roofWeaponPolicy.ts);
//   - the Sho't Kal (release 262's new IDF Centurion): the Mk 5/2's L7, its AVDS-1790 hump at 1.90 m, the commander's
//     .50 and the loader's .30; the Mk 13 (262's other new mark): the L7A2's thermal sleeve and one cupola gun.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { carriesNoRoofWeapon } from '../roofWeaponPolicy.ts';

const box = (object, keep = () => true) => {
  const b = new THREE.Box3(), v = new THREE.Vector3();
  object.updateMatrixWorld(true);
  object.traverse((o) => {
    if (!o.isMesh || !keep(o)) return;
    const p = o.geometry.getAttribute('position');
    for (let i = 0; i < p.count; i++) b.expandByPoint(v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld));
  });
  return b;
};
const under = (root, object) => { for (let p = object; p; p = p.parent) if (p === root) return true; return false; };

/** The gun's outer radius by station along its axis (rays toward the bore from above and from either side; rig_gun is
 * level and unrotated at rest), in 40 stations of its length. */
function gunRadii(gun, len) {
  const meshes = [];
  gun.traverse((o) => { if (o.isMesh) meshes.push(o); });
  const at = gun.getWorldPosition(new THREE.Vector3()), ray = new THREE.Raycaster(), bins = new Float64Array(40);
  for (let k = 4; k < 40; k++) {
    const z = at.z + ((k + 0.5) / 40) * len;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1]]) {
      ray.set(new THREE.Vector3(at.x + dx * 0.6, at.y + dy * 0.6, z), new THREE.Vector3(-dx, -dy, 0));
      const hit = ray.intersectObjects(meshes, false)[0];
      if (hit) bins[k] = Math.max(bins[k], Math.hypot(hit.point.x - at.x, hit.point.y - at.y));
    }
  }
  return bins;
}

const report = {};
for (const id of ['centurion3', 'centurion5_2', 'strv81', 'shot_kal', 'centurion13']) {
  const tank = createTank(id, null, { proceduralOnly: true, quality: 'high', geometryReceipt: true, camoSeed: 4242 });
  try {
    const root = tank.root, turret = root.getObjectByName('rig_turret'), gun = root.getObjectByName('rig_gun');
    root.updateMatrixWorld(true);
    const hull = box(root, (o) => !under(turret, o) && !/antenna|whip/i.test(o.name ?? ''));
    const length = hull.max.z - hull.min.z, width = hull.max.x - hull.min.x;
    assert.ok(Math.abs(length - 7.557) / 7.557 < 0.01, `${id}: hull ${length.toFixed(3)} m long (7.557)`);
    assert.ok(width >= 3.28 && width <= 3.39, `${id}: ${width.toFixed(3)} m over the side plates (3.28-3.39)`);
    assert.ok(Math.abs(turret.position.z - 0.47) < 1e-6 && Math.abs(turret.position.y - 1.70) < 1e-6, `${id}: the ring seat`);
    assert.deepEqual(turret.scale.toArray(), [1, 1, 1], `${id}: the turret is not squashed`);
    assert.equal(turret.userData.turretSectionScale, undefined, `${id}: no squash baked onto the turret's parts`);
    const casting = turret.children.filter((o) => o.isMesh && /^turret$/.test(o.name));
    const shell = box(turret, (o) => casting.includes(o) || o.name === 'turret');
    // the roof over the ring centre (clear of the cupola, the loader's hatch and the sight head)
    const ray = new THREE.Raycaster(turret.localToWorld(new THREE.Vector3(0, 3, 0)), new THREE.Vector3(0, -1, 0));
    const roof = ray.intersectObjects(casting, false)[0]?.point.y ?? NaN;
    assert.ok(roof >= 2.62 && roof <= 2.72, `${id}: the casting's roof at ${roof.toFixed(3)} m (2.62-2.72)`);
    // the casting's width 0.30 m behind its front face (world frame at rest: turret unrotated)
    const front = shell.max.z;
    const slice = box(turret, (o) => casting.includes(o) || o.name === 'turret');
    let half = 0;
    const v = new THREE.Vector3();
    for (const o of casting.length ? casting : [turret.getObjectByName('turret')].filter(Boolean)) {
      const p = o.geometry.getAttribute('position');
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
        if (Math.abs(v.z - (front - 0.30)) < 0.06) half = Math.max(half, Math.abs(v.x));
      }
    }
    assert.ok(slice.max.y > 0 && half * 2 >= 1.10, `${id}: the casting is ${(half * 2).toFixed(2)} m wide 0.30 m behind its face (no wedge nose)`);
    // the gun and its fittings
    const muzzle = root.getObjectByName('rig_muzzle') ?? gun;
    const len = muzzle.getWorldPosition(new THREE.Vector3()).z - gun.getWorldPosition(new THREE.Vector3()).z;
    const r = gunRadii(gun, len), tube = Math.min(...r.slice(20, 30).filter((x) => x > 0));
    const bulge = (a, b) => Math.max(...r.slice(Math.floor(a * 40), Math.ceil(b * 40)));
    if (id === 'centurion3') {
      assert.ok(bulge(0.3, 0.85) < tube * 1.3, `${id}: the 20-pdr Type A carries no fume extractor`);
      assert.ok(bulge(0.9, 1.0) > tube * 1.25, `${id}: the Type A's muzzle counterweight`);
    } else if (id === 'strv81') {
      assert.ok(bulge(0.42, 0.52) > tube * 1.5 && bulge(0.6, 0.85) < tube * 1.3, `${id}: the Type B's fume extractor 42-52 % along`);
    } else if (id === 'centurion13') {
      // the sleeve clads the tube 52-82 % along: measure it against the bare tube between it and the muzzle
      const bare = Math.min(...r.slice(35, 39).filter((x) => x > 0)), clad = Math.min(...r.slice(22, 32).filter((x) => x > 0));
      assert.ok(bulge(0.40, 0.50) > bare * 1.35 && clad > bare * 1.12, `${id}: the L7A2's evacuator and thermal sleeve`);
    } else {
      assert.ok(bulge(0.40, 0.50) > tube * 1.35 && bulge(0.62, 0.85) < tube * 1.25, `${id}: the L7's bore evacuator 40-50 % along`);
    }
    if (id === 'shot_kal') {
      // the AVDS-1790 hump over the engine stands 1.90 m high behind the turret
      const deck = new THREE.Raycaster(new THREE.Vector3(0.62, 4, -2.3), new THREE.Vector3(0, -1, 0));
      const hull = []; root.traverse((o) => { if (o.isMesh && !under(turret, o) && !/procShadow/.test(o.name)) hull.push(o); });
      const top = deck.intersectObjects(hull, false)[0]?.point.y ?? 0;
      assert.ok(top > 1.88 && top < 1.95, `${id}: the AVDS deck at ${top.toFixed(3)} m`);
    }

    const cupolaGun = [];
    turret.traverse((o) => { if (o.userData?.fitting === 'pintleMG' && o.parent?.userData?.fitting !== 'pintleMG') cupolaGun.push(o); });
    if (id === 'centurion3') assert.ok(carriesNoRoofWeapon(id) && cupolaGun.length === 0, `${id}: the Mk 3 carries no roof gun`);
    else if (id === 'shot_kal') assert.equal(cupolaGun.length, 2, `${id}: the commander's .50 and the loader's .30`);
    else assert.equal(cupolaGun.length, 1, `${id}: the Mk 5 pattern's cupola machine gun`);
    report[id] = { ...report[id], length: +length.toFixed(3), width: +width.toFixed(3), roof: +roof.toFixed(3), noseWidth: +(half * 2).toFixed(2), gun: +len.toFixed(2) };
  } finally {
    tank.dispose?.();
  }
}
assert.ok(report.centurion5_2.gun < report.centurion3.gun - 0.15, 'the L7 stands shorter than the 20-pdr');
assert.equal(report.shot_kal.gun, report.centurion5_2.gun, 'the Sho\'t Kal keeps the Mk 5/2\'s L7');
assert.equal(report.centurion13.gun, report.centurion5_2.gun, 'the Mk 13 keeps the L7');
console.log(`centurionFamily.selftest: ${JSON.stringify(report)}; published proportions, five distinct marks PASS`);
