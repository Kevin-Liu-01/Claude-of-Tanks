// 261 (owner 2026-10-27 on both PL-01s: "make the pl-01's gun and gun assembly properly match with turret and gun housing
// onnn it to make it properly look good. can do two varieties for the 105 and normal versions"): each gun pitches in its
// own housing on the turret nose (profiles/pl01GunAssembly.ts) and stays in it over its whole range. Until 261 one
// six-facet housing overlapped a fixed nose cap: at full elevation it lifted clear of the nose and the cap stood out
// beneath it, and at full depression over the rear deck the gun ran into the hull. At every pitch from full depression to
// full elevation in 2.5-degree steps, the recoiling parts in battery and at 0.135 m:
//   - nothing the gun draws cuts the turret: every gun sample stands at least CUT_KEEP_M outside every turret mesh (signed
//     against the nearest facet, so a sample buried in a solid fails too), the tube TUBE_KEEP_M;
//   - the joint is closed from the side: every sight line across the turret along x through the gap between the fixed drum
//     and the moving rear, from the housing's lower edge to its brow, meets the turret (the cheeks);
//   - the tube stays in its shroud or shield: behind the housing's front face each tube sample is enclosed (rays up, down
//     and sideways meet the gun's own housing within 0.5 m);
//   - over the hull, under the published gunPitchByYawDeg, the barrel keeps 25 mm and the mount 20 mm at every yaw
//     (gunHullClearance.test-support.mjs), and over the glacis the gun keeps its full depression.
// Negative controls: a 2 cm cube in the slot is cut; the same sight lines just ahead of the cheeks find no turret; a
// recoiling block beside the shroud shows; at its bare depression the gun meets its rear deck.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { minimumMechanicalGunPitch } from '../../sim/gunPitchLimits.ts';
import {
  SurfaceGrid, closestOnTriangle, densePoints, gunHullProbe, gunHullSweep, meshTriangles, meshesUnder,
} from '../gunHullClearance.test-support.mjs';
import { PL01_CHEEK_R_M, PL01_DRUM_R_M, PL01_MANTLET_ARC_M } from './pl01GunAssembly.ts';

const DEG = Math.PI / 180, CUT_KEEP_M = .003, TUBE_KEEP_M = .01, STROKES_M = [0, .135];
const BARREL_KEEP = .025, MOUNT_KEEP = .020;
const T0 = Date.now();

function housingProbe(id) {
  const tank = createTank(id, null, { proceduralOnly: true, quality: 'high', geometryReceipt: true, camoSeed: 4242 });
  tank.root.updateMatrixWorld(true);
  const turret = tank.root.getObjectByName('rig_turret'), gun = tank.root.getObjectByName('rig_gun'), recoil = tank.root.getObjectByName('rig_recoil');
  const receipt = gun.userData.pl01GunHousingReceipt;
  const extra = [];
  const fixedMeshes = () => [...meshesUnder(turret, [gun]), ...extra];
  const recoiling = new Set(); recoil.traverse((o) => recoiling.add(o));
  const gInv = new THREE.Matrix4().copy(gun.matrixWorld).invert();
  const gunMeshes = meshesUnder(gun);
  const mountSoup = meshTriangles(gunMeshes.filter((m) => !recoiling.has(m)), gInv).tri;
  const mount = densePoints(mountSoup, .008), tube = densePoints(meshTriangles(gunMeshes.filter((m) => recoiling.has(m)), gInv).tri, .015);
  const v = new THREE.Vector3(), q = [0, 0, 0];
  /** The gun's smallest signed clearance to the turret at one pitch (negative: inside a turret solid). */
  const cut = (pitchDeg, samples = [[mount, [0], 'mount'], [tube, STROKES_M, 'tube']]) => {
    gun.rotation.x = -pitchDeg * DEG;
    tank.root.updateMatrixWorld(true);
    const { tri, starts } = meshTriangles(fixedMeshes(), new THREE.Matrix4());
    const grid = new SurfaceGrid(tri, { cell: .05, rq: .065 });
    const partOf = (t) => { let name = null; for (const [s, mesh] of starts) { if (s > t) break; name = mesh.name || mesh.parent?.name || '?'; } return name; };
    const worst = { mount: { d: Infinity }, tube: { d: Infinity } };
    for (const [pts, strokes, kind] of samples) for (const back of strokes) {
      for (let i = 0; i < pts.length; i += 3) {
        v.set(pts[i], pts[i + 1], pts[i + 2] - back).applyMatrix4(gun.matrixWorld);
        let d = grid.distance(v.x, v.y, v.z);
        const t = grid.nearest;
        if (t >= 0) {
          const o = t * 9, c = closestOnTriangle(tri, o, v.x, v.y, v.z, q);
          const ux = tri[o + 3] - tri[o], uy = tri[o + 4] - tri[o + 1], uz = tri[o + 5] - tri[o + 2];
          const wx = tri[o + 6] - tri[o], wy = tri[o + 7] - tri[o + 1], wz = tri[o + 8] - tri[o + 2];
          const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
          // signed only where the nearest point lies inside the facet (the offset runs along its normal): beside an edge
          // or a corner a facet's normal does not say which side the sample is on
          const ox = v.x - c[0], oy = v.y - c[1], oz = v.z - c[2], dot = ox * nx + oy * ny + oz * nz;
          if (dot < 0 && dot * dot >= .98 * (ox * ox + oy * oy + oz * oz) * (nx * nx + ny * ny + nz * nz)) d = -d;
        }
        if (d < worst[kind].d) worst[kind] = { d, tri: t >= 0 ? Array.from(tri.slice(t * 9, t * 9 + 9), (c) => +c.toFixed(3)) : null, world: v.toArray().map((c) => +c.toFixed(3)), part: t >= 0 ? partOf(t) : null, at: [pts[i], pts[i + 1], pts[i + 2]].map((c) => +c.toFixed(3)), stroke: back };
      }
    }
    gun.rotation.x = 0;
    tank.root.updateMatrixWorld(true);
    return worst;
  };
  const twoSided = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
  const proxies = (meshes) => meshes.filter((m) => !m.isInstancedMesh).map((m) => {
    const o = new THREE.Mesh(m.geometry, twoSided); o.matrixAutoUpdate = false; o.matrixWorld.copy(m.matrixWorld); return o;
  });
  const raycaster = new THREE.Raycaster();
  /** Sight lines along x through the gap ring at radius r (gun pivot frame), every 2 degrees from `deg0` to `deg1`:
   * the count that meet no turret mesh. */
  const sideWindows = (r, deg0, deg1) => {
    const seen = proxies(fixedMeshes()), pivot = new THREE.Vector3().setFromMatrixPosition(gun.matrixWorld), misses = [];
    raycaster.far = 4;
    for (let a = deg0; a <= deg1 + 1e-9; a += 2) {
      const y = pivot.y + r * Math.sin(a * DEG), z = pivot.z + r * Math.cos(a * DEG);
      for (const sign of [-1, 1]) {
        raycaster.set(new THREE.Vector3(-2 * sign, y, z), new THREE.Vector3(sign, 0, 0));
        if (!raycaster.intersectObjects(seen, false).length) misses.push([+a.toFixed(1), sign]);
      }
    }
    return misses;
  };
  /** Tube samples behind the housing's face `faceZ` (gun frame) that are not enclosed by the gun's own housing. */
  const exposedTube = (faceZ) => {
    const recoilingNow = new Set(); recoil.traverse((o) => recoilingNow.add(o));
    const seen = proxies(meshesUnder(gun).filter((m) => !recoilingNow.has(m))), dirs = [[0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0]].map((d) => new THREE.Vector3(...d));
    const tubeNow = densePoints(meshTriangles(meshesUnder(gun).filter((m) => recoilingNow.has(m)), gInv).tri, .015);
    raycaster.far = .5;
    let behind = 0, exposed = 0;
    for (const back of STROKES_M) for (let i = 0; i < tubeNow.length; i += 12) {
      if (tubeNow[i + 2] - back > faceZ - .01) continue;
      behind++;
      v.set(tubeNow[i], tubeNow[i + 1], tubeNow[i + 2] - back).applyMatrix4(gun.matrixWorld);
      if (dirs.some((d) => { raycaster.set(v, d); return !raycaster.intersectObjects(seen, false).length; })) exposed++;
    }
    return { behind, exposed };
  };
  return {
    id, tank, turret, gun, recoil, receipt, cut, sideWindows, exposedTube, mountCount: mount.length / 3,
    withTurretMesh(mesh, run) { turret.add(mesh); tank.root.updateMatrixWorld(true); extra.push(mesh); try { return run(); } finally { extra.pop(); turret.remove(mesh); } },
    dispose: () => { twoSided.dispose(); tank.dispose(); },
  };
}

const report = {};
for (const id of ['pl01', 'pl01_105']) {
  const probe = housingProbe(id);
  try {
    const { receipt } = probe;
    assert.ok(receipt?.revision, `${id}: the gun carries its housing receipt`);
    assert.equal(receipt.revision, id === 'pl01' ? 'mspo2013-shroud-r1' : 'cv90105-shield-r1', `${id}: its own gun fit`);
    assert.ok(receipt.drumR < receipt.mantletArcM && receipt.mantletArcM < receipt.cheekR, `${id}: the moving arc runs between the drum and the cheeks`);
    const pitches = [];
    for (let p = -10; p <= 20 + 1e-9; p += 2.5) pitches.push(p);
    const cuts = pitches.map((p) => ({ p, ...probe.cut(p) }));
    if (process.env.PL01_HOUSING_ONLY) for (const c of cuts) console.log(id, c.p, (c.mount.d * 1000).toFixed(1), c.mount.part, c.mount.at, (c.tube.d * 1000).toFixed(1), c.tube.part, JSON.stringify(c.mount.tri), JSON.stringify(c.mount.world));
    for (const { p, mount, tube } of cuts) {
      assert.ok(mount.d >= CUT_KEEP_M, `${id} at ${p} deg: the gun housing ${mount.d < 0 ? 'is buried' : 'stands'} ${(Math.abs(mount.d) * 1000).toFixed(1)} mm ${mount.d < 0 ? 'inside' : 'from'} ${mount.part} at ${mount.at}`);
      assert.ok(tube.d >= TUBE_KEEP_M, `${id} at ${p} deg: the tube stands ${(tube.d * 1000).toFixed(1)} mm from ${tube.part} at ${tube.at} (stroke ${tube.stroke})`);
    }
    // the joint from the side, from the housing's lower edge to its brow, at two radii inside the gap
    const brow = receipt.topDeg - 1;
    for (const r of [PL01_DRUM_R_M + .0008, (PL01_DRUM_R_M + PL01_MANTLET_ARC_M) / 2]) {
      const misses = probe.sideWindows(r, receipt.lowDeg + 1, Math.min(brow, Math.asin((receipt.browY - probe.gun.position.y) / r) / DEG - 1));
      assert.deepEqual(misses, [], `${id}: a sight line through the joint at r ${r.toFixed(3)} m meets no turret part`);
    }
    const ahead = probe.sideWindows(PL01_CHEEK_R_M + .03, -10, 10);
    assert.ok(ahead.length > 0, `${id}: negative control: the same sight lines just ahead of the cheeks meet no turret part`);
    const faceZ = receipt.stationDepths.at(-1) + (id === 'pl01' ? 0 : 0.14);
    const tubeIn = probe.exposedTube(faceZ);
    assert.ok(tubeIn.behind > 50 && tubeIn.exposed === 0, `${id}: the tube is enclosed behind its housing's face (${tubeIn.exposed} of ${tubeIn.behind} samples show)`);
    // negative controls: a cube in the slot, a recoiling block beside the shroud
    const cube = new THREE.Mesh(new THREE.BoxGeometry(.02, .02, .02)); cube.name = 'negativeControlCube';
    const [, py, pz] = probe.gun.position.toArray();
    cube.position.set(0, py, pz + PL01_MANTLET_ARC_M);
    const cubeCut = probe.withTurretMesh(cube, () => probe.cut(0));
    if (process.env.PL01_HOUSING_ONLY) console.log("cube", JSON.stringify(cubeCut));
    assert.ok(cubeCut.mount.d < CUT_KEEP_M && cubeCut.mount.part === 'negativeControlCube', `${id}: negative control: a cube in the slot is cut`);
    cube.geometry.dispose();
    const block = new THREE.Mesh(new THREE.BoxGeometry(.04, .04, .04)); block.name = 'negativeControlBlock';
    block.position.set(0.36, 0, faceZ - 0.6);
    probe.recoil.add(block); probe.tank.root.updateMatrixWorld(true);
    const shown = probe.exposedTube(faceZ);
    probe.recoil.remove(block); block.geometry.dispose();
    assert.ok(shown.exposed > 0, `${id}: negative control: a recoiling block beside the housing shows`);
    report[id] = {
      mountMm: Math.min(...cuts.map((c) => c.mount.d)) * 1000, tubeMm: Math.min(...cuts.map((c) => c.tube.d)) * 1000,
      worstPitch: cuts.reduce((a, b) => (b.mount.d < a.mount.d ? b : a)).p, tubeBehind: tubeIn.behind, samples: probe.mountCount,
    };
  } finally { probe.dispose(); }
}

for (const id of process.env.PL01_HOUSING_ONLY ? [] : ['pl01', 'pl01_105']) {
  const probe = gunHullProbe(id);
  try {
    const { spec } = probe;
    assert.ok(spec.gunPitchByYawDeg, `${id}: publishes its gun curve`);
    assert.ok(Math.abs(minimumMechanicalGunPitch(spec, 0) + spec.gunDepressionDeg * DEG) < 1e-9, `${id}: the full depression over the glacis`);
    const barrel = gunHullSweep(probe, spec, { partsAt: () => 'barrel' });
    assert.ok(barrel.d >= BARREL_KEEP - 1e-4, `${id}: the barrel keeps 25 mm from its hull at every yaw (${(barrel.d * 1000).toFixed(1)} mm at yaw ${barrel.yd}, pitch ${(barrel.pitch / DEG).toFixed(2)}, ${barrel.part})`);
    const mount = gunHullSweep(probe, spec, { partsAt: () => 'mount' });
    assert.ok(mount.d >= MOUNT_KEEP - 1e-4, `${id}: the mount keeps 20 mm from its hull at every yaw (${(mount.d * 1000).toFixed(1)} mm at yaw ${mount.yd}, pitch ${(mount.pitch / DEG).toFixed(2)}, ${mount.part})`);
    const bare = gunHullSweep(probe, { gunDepressionDeg: spec.gunDepressionDeg }, { stop: BARREL_KEEP });
    assert.ok(bare.d < BARREL_KEEP, `${id}: negative control: at its bare -${spec.gunDepressionDeg} the gun comes within 25 mm of its hull`);
    Object.assign(report[id], { hullBarrelMm: barrel.d * 1000, hullMountMm: mount.d * 1000, hullAt: [mount.yd, mount.part] });
  } finally { probe.dispose(); }
}
const fmt = (o) => Object.fromEntries(Object.entries(o).map(([k, x]) => [k, typeof x === 'number' ? +x.toFixed(1) : x]));
for (const [id, r] of Object.entries(report)) console.log(id, JSON.stringify(fmt(r)));
console.log(`pl01GunHousing.selftest: both PL-01 guns stay in their housings and clear their hulls at every pitch (${((Date.now() - T0) / 1000).toFixed(0)} s)`);
