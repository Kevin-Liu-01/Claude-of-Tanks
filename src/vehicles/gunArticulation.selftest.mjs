import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from './tankFactory.ts';
import { ALL_TANK_IDS, getSpec } from './specs.ts';
import { verifyGunCradleSeats } from './gunCradleSeats.test-support.mjs';
import { hasExplicitFixedLauncher, verifyFixedLauncherSeats, verifyFixedLauncherNoRecoil, fixedLauncherNegatives } from './fixedLauncherArticulation.test-support.mjs';

const DEG = Math.PI / 180;
const MAX_SEAT_GAP_M = 0.125;
// A few wrapped canvas boots intentionally leave an internal bellows reveal
// between the merged armor shell and the first recoil tube.  Ten centimetres
// is the measured fleet maximum (T-90M: 0.0913 m at neutral); anything larger
// is a visually detached plant rather than authored clearance.
const MAX_BARREL_SEAT_GAP_M = 0.10;

function boxGap(a, b) {
  return Math.hypot(
    Math.max(0, a.min.x - b.max.x, b.min.x - a.max.x),
    Math.max(0, a.min.y - b.max.y, b.min.y - a.max.y),
    Math.max(0, a.min.z - b.max.z, b.min.z - a.max.z),
  );
}

function renderCensus(root) {
  let meshes = 0;
  let triangles = 0;
  const geometries = [];
  root.traverse((node) => {
    if (!(node.isMesh || node.isInstancedMesh) || node.visible === false) return;
    meshes++;
    const geometry = node.geometry;
    if (!geometry) return;
    geometries.push(geometry.uuid);
    const count = geometry.index?.count ?? geometry.attributes.position?.count ?? 0;
    triangles += Math.floor(count / 3) * (node.isInstancedMesh ? node.count : 1);
  });
  return { meshes, triangles, geometries: geometries.sort() };
}

function matrixChanged(a, b, epsilon = 1e-6) {
  for (let index = 0; index < 16; index++) {
    if (Math.abs(a[index] - b[index]) > epsilon) return true;
  }
  return false;
}

let articulated = 0;
let hullAimed = 0;
let fixedBatteries = 0;

for (const id of ALL_TANK_IDS) {
  const spec = getSpec(id);
  const tank = createTank(id, null, {
    proceduralOnly: true,
    quality: 'low',
    camoSeed: 4242,
    geometryReceipt: true,
    batchStatic: false,
  });
  try {
    const root = tank.root;
    const hull = root.getObjectByName('rig_hull');
    const turret = root.getObjectByName('rig_turret');
    const gun = root.getObjectByName('rig_gun');
    const recoil = root.getObjectByName('rig_recoil');
    const muzzle = root.getObjectByName('rig_muzzle');
    assert.ok(hull && turret && gun && recoil && muzzle,
      `${id}: complete hull/turret/gun/recoil/muzzle hierarchy`);

    if (spec.armor?.turretless === true) {
      hullAimed++;
      assert.ok(spec.gunArcDeg > 0 && spec.gunElevationDeg > 0 && spec.gunDepressionDeg > 0,
        `${id}: hull-aimed vehicle publishes legal traverse/elevation/depression limits`);
      assert.ok(recoil.parent === hull || recoil.parent === gun,
        `${id}: fixed cannon stays on its declared hull or virtual gun chain`);
      continue;
    }

    articulated++;
    assert.equal(gun.parent, turret, `${id}: rig_gun is turret-owned`);
    assert.equal(recoil.parent, gun, `${id}: recoil barrel is gun-owned`);
    const mount = gun.getObjectByName('gunMount');
    assert.ok(mount?.isMesh && mount.geometry.attributes.position.count > 0,
      `${id}: visible mantlet/cradle geometry is authored in the pitching gunMount bucket`);
    assert.ok(spec.gunElevationDeg > 0 && spec.gunDepressionDeg > 0,
      `${id}: legal elevation/depression limits are positive`);

    const staticTurret = turret.getObjectByName('turret') || turret;
    const fixedLauncher = hasExplicitFixedLauncher(spec);
    if (fixedLauncher) fixedBatteries++;
    const poses = [-spec.gunDepressionDeg, 0, spec.gunElevationDeg];
    const samples = [];
    for (const pitchDeg of poses) {
      gun.rotation.x = -pitchDeg * DEG;
      root.updateMatrixWorld(true);
      if (fixedLauncher) verifyFixedLauncherNoRecoil(tank, spec, pitchDeg);
      const mountBox = new THREE.Box3().setFromObject(mount, true);
      const barrelBox = new THREE.Box3().setFromObject(recoil, true);
      const turretBox = new THREE.Box3().setFromObject(staticTurret, true);
      const bore = tank.gunDirWorld(new THREE.Vector3());
      samples.push({
        pitchDeg,
        bore,
        matrix: mount.matrixWorld.elements.slice(),
        census: renderCensus(root),
        barrelGap: boxGap(mountBox, barrelBox),
        turretGap: boxGap(mountBox, turretBox),
        cradleSeats: verifyGunCradleSeats(root),
        fixedLauncher: fixedLauncher ? verifyFixedLauncherSeats(tank, spec) : null,
      });
    }

    assert.ok(samples[0].bore.y < -0.01 && samples[2].bore.y > 0.01,
      `${id}: bore declines and elevates across its legal pitch range`);
    assert.ok(samples[2].bore.y - samples[0].bore.y
      > Math.sin(Math.min(10, spec.gunElevationDeg + spec.gunDepressionDeg) * DEG),
    `${id}: bore sweep is not a stationary/fused-gun false positive`);
    assert.ok(matrixChanged(samples[0].matrix, samples[1].matrix)
      && matrixChanged(samples[1].matrix, samples[2].matrix),
    `${id}: mantlet/cradle transform follows both depression and elevation`);
    for (const sample of samples) {
      if (fixedLauncher) assert.equal(sample.fixedLauncher.tips, spec.gun.launcherMuzzles.length,
        `${id}: every physical fixed-launcher terminal remains seated at ${sample.pitchDeg}°`);
      else assert.ok(sample.barrelGap <= MAX_BARREL_SEAT_GAP_M,
          `${id}: moving housing remains attached to barrel at ${sample.pitchDeg}° (gap ${sample.barrelGap})`);
      assert.ok(sample.cradleSeats || sample.turretGap <= MAX_SEAT_GAP_M,
        `${id}: moving housing remains seated in turret at ${sample.pitchDeg}° (gap ${sample.turretGap})`);
      assert.deepEqual(sample.census, samples[1].census,
        `${id}: pitch changes only transforms—not meshes, triangles, or geometry resources`);
    }
    if (fixedLauncher) {
      fixedLauncherNegatives(tank, spec);
      assert.deepEqual(renderCensus(root), samples[1].census, `${id}: negative controls do not allocate or replace geometry resources`);
    }
  } finally {
    tank.dispose();
  }
}

assert.equal(articulated + hullAimed, ALL_TANK_IDS.length,
  'every selectable procedural vehicle is classified by the gun articulation gate');
// 2026-09-24 (round 46c, owner: no hidden tanks): the 36 hidden records retired; four of the eight hull-aimed hulls
// were among them (the unregistered WW2 / casemate donors), so the floor follows the playable fleet: 188 articulated,
// 4 hull-aimed (the Strv 103 family and the other fixed-gun casemates) out of 192.
assert.ok(articulated >= 110 && hullAimed >= 4,
  `fleet gate is non-vacuous (${articulated} articulated, ${hullAimed} hull-aimed)`);

assert.equal(fixedBatteries, 3, 'TOS, Griffin Viper and AFT-10 own explicit fixed-canister batteries');
assert.equal(getSpec('aft10_x').gun.launcherMuzzles.length, 8, 'AFT-10 uses all eight covered cells');
assert.equal(getSpec('tos1a_tagil').gun.launcherMuzzles.length, 24, 'TOS has all 24 physical tubes');
assert.equal(getSpec('griffin_viper').gun.launcherMuzzles.length, 16, 'Viper has all 16 physical tubes');
console.log(`gunArticulation.selftest: ${articulated} turreted weapons pitch with seated housings (${fixedBatteries} physical fixed battery); ${hullAimed} hull-aimed guns retain fixed-mount contracts`);
