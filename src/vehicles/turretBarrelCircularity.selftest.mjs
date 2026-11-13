import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createTank } from './tankFactory.ts';
import { measureTurretBarrelCircularity } from './turretBarrelCircularity.ts';

function createBarrelFixture(scaleX = 1, offsetX = 0) {
  const root = new THREE.Group();
  const gunRig = new THREE.Group();
  gunRig.name = 'rig_gun';
  root.add(gunRig);

  const geometry = new THREE.CylinderGeometry(0.1, 0.1, 3, 24);
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, 0, 2.5);
  const barrel = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  barrel.name = 'gun';
  barrel.scale.x = scaleX;
  barrel.position.x = offsetX;
  gunRig.add(barrel);

  const muzzle = new THREE.Object3D();
  muzzle.name = 'rig_muzzle';
  muzzle.position.z = 4;
  gunRig.add(muzzle);
  return root;
}

const circularFixture = createBarrelFixture();
const circularResult = measureTurretBarrelCircularity({ root: circularFixture });
assert.equal(circularResult.pass, true, 'a circular barrel passes the cross-section gate');
assert.ok(circularResult.worst?.aspectRatio < 1.01,
  `circular fixture stays round (${circularResult.worst?.aspectRatio})`);

const ovalFixture = createBarrelFixture(2);
const ovalResult = measureTurretBarrelCircularity({ root: ovalFixture });
assert.equal(ovalResult.pass, false, 'a one-axis-scaled barrel fails the cross-section gate');
assert.ok(ovalResult.worst?.aspectRatio > 1.9,
  `oval fixture exposes its distortion (${ovalResult.worst?.aspectRatio})`);

const offAxisFixture = createBarrelFixture(1, 0.045);
const offAxisResult = measureTurretBarrelCircularity({ root: offAxisFixture });
assert.equal(offAxisResult.pass, false,
  'a circular barrel offset from its declared firing axis fails the centering gate');
assert.ok(offAxisResult.worstAxis?.aspectRatio < 1.01,
  `off-axis fixture remains geometrically round (${offAxisResult.worstAxis?.aspectRatio})`);
assert.ok(Math.abs((offAxisResult.worstAxis?.lateralAxisOffsetM ?? 0) - 0.045) < 1e-4,
  `off-axis fixture exposes its 45 mm lateral error (${offAxisResult.worstAxis?.lateralAxisOffsetM})`);

// 270: tubes away from the gun's centre. Each numbered tube (gunBarrelN) is sliced about its own fire axis
// (rig_muzzle_tip_N), however far out it sits; of equal tubes in one cradle the bore is the one on that axis; a rotary
// cluster's bore is its barrels' common centre. Each rule has its failing twin.
function tube(name, x, y, radius = 0.05) {
  const geometry = new THREE.CylinderGeometry(radius, radius, 3, 24);
  geometry.rotateX(Math.PI / 2);
  geometry.translate(x, y, 2.5);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial());
  mesh.name = name;
  return mesh;
}
function marker(name, x, y) {
  const object = new THREE.Object3D();
  object.name = name;
  object.position.set(x, y, 4);
  return object;
}
function sideFixture({ tubes, tips }) {
  const root = new THREE.Group();
  const gunRig = new THREE.Group();
  gunRig.name = 'rig_gun';
  root.add(gunRig);
  gunRig.add(marker('rig_muzzle', 0, 0));
  tubes.forEach(([index, x, y]) => gunRig.add(tube(`gunBarrel${index}`, x, y)));
  tips.forEach(([index, x, y]) => gunRig.add(marker(`rig_muzzle_tip_${index}`, x, y)));
  return root;
}
function rotorFixture({ shiftX = 0, tagged = true } = {}) {
  const root = new THREE.Group();
  const gunRig = new THREE.Group();
  gunRig.name = 'rig_gun';
  root.add(gunRig);
  gunRig.add(marker('rig_muzzle', 0, 0));
  const rotor = new THREE.Group();
  if (tagged) rotor.userData.gunRotor = { barrels: 6, cycleS: 0.05 };
  gunRig.add(rotor);
  for (let barrel = 0; barrel < 6; barrel++) {
    const angle = (barrel + 0.5) * Math.PI / 3; // no barrel on the vertical: the nearest sits 26 mm off the bore, as on the M163
    rotor.add(tube('gun', shiftX + 0.052 * Math.sin(angle), 0.052 * Math.cos(angle), 0.016));
  }
  return root;
}
const measured = (root) => measureTurretBarrelCircularity({ root }, { requireMeasurement: true });

const flanks = measured(sideFixture({ tubes: [[0, -1.2, 0.15], [1, 1.2, 0.15]], tips: [[0, -1.2, 0.15], [1, 1.2, 0.15]] }));
assert.equal(flanks.pass, true, `flank tubes 1.2 m out are measured on their own axes (${flanks.reason ?? flanks.worstAxis?.lateralAxisOffsetM})`);
assert.ok(flanks.samples.some((sample) => sample.lane === 'barrel-1' && Math.abs(sample.centerXM - 1.2) < 1e-3),
  'the right flank tube is sliced at x 1.2 m');
const strayFlank = measured(sideFixture({ tubes: [[0, -1.2, 0.15], [1, 1.245, 0.15]], tips: [[0, -1.2, 0.15], [1, 1.2, 0.15]] }));
assert.equal(strayFlank.pass, false, 'a flank tube 45 mm off its fire axis fails');
assert.ok(Math.abs(strayFlank.worstAxis.lateralAxisOffsetM - 0.045) < 1e-4,
  `the stray flank tube's 45 mm reads (${strayFlank.worstAxis.lateralAxisOffsetM})`);

// one cradle, two equal barrels 0.15 m apart (the 2A38M): it fires down the inner one
const pair = measured(sideFixture({ tubes: [[0, -0.875, 0], [0, -0.725, 0]], tips: [[0, -0.725, 0]] }));
assert.equal(pair.pass, true, `a twin-barrel cradle fires down its inner barrel (${pair.worstAxis?.lateralAxisOffsetM})`);
const between = measured(sideFixture({ tubes: [[0, -0.875, 0], [0, -0.725, 0]], tips: [[0, -0.8, 0]] }));
assert.equal(between.pass, false, 'a fire axis between the two barrels fails');

const rotary = measured(rotorFixture());
assert.equal(rotary.pass, true, `a six-barrel rotor's bore is its cluster's centre (${rotary.worstAxis?.lateralAxisOffsetM})`);
assert.equal(rotary.worstAxis.source, 'rotor-cluster', 'the rotor reads as one cluster');
const strayRotor = measured(rotorFixture({ shiftX: 0.045 }));
assert.equal(strayRotor.pass, false, 'a rotor 45 mm off the bore fails');
const untagged = measured(rotorFixture({ tagged: false }));
assert.equal(untagged.pass, false, 'six barrels with no rotor tag read as one barrel off the bore');

for (const id of [
  't90a_2006',
  't90sm_2013',
  'fv4034',
  'challenger2',
  'challenger2e',
  'ua_challenger2',
  't80',
  'm60a2',
  'bmpt_terminator2',
  'bmpt_t90',
  'hayate_ifv',
  'm551_sheridan',
  'm551a1_tts',
  'leclerc_s2',
  'leclerc_sxxi',
  'leclerc_s1',
  't72b3m_2022',
  't72bu_1989',
  'c1_ariete_preserie',
  'kf51_evo',
  'merkava3_baz',
  // 270: the air defence's flank twins, the 2A38M's paired barrels and the M163's rotor
  'gepard_1a2',
  'pza_loara',
  'pantsir_s1',
  'm163_vads',
]) {
  const visual = createTank(id, null, {
    proceduralOnly: true,
    geometryReceipt: true,
    quality: 'high',
    camoSeed: 4242,
    staticPreview: true,
  });
  try {
    const result = measureTurretBarrelCircularity(visual, { requireMeasurement: true });
    assert.equal(result.pass, true,
      `${id} keeps circular, axis-centered barrel sections (worst ratio ${result.worst?.aspectRatio}, lateral ${result.worstAxis?.lateralAxisOffsetM})`);
    assert.ok(result.worst && result.worst.aspectRatio <= 1.08,
      `${id} exposes a measurable main-gun contour`);
    if (['fv4034', 'challenger2', 'challenger2e', 'ua_challenger2'].includes(id)) {
      const sleeveResult = measureTurretBarrelCircularity(visual, {
        requireMeasurement: true,
        meshNamePattern: /^gunMount$/,
        checkAxisAlignment: false,
      });
      assert.equal(sleeveResult.pass, true,
        `${id} keeps its forward gun sleeve circular (${sleeveResult.worst?.aspectRatio})`);
      const maximumSleeveDiameterM = Math.max(...sleeveResult.samples.map((sample) =>
        Math.max(sample.widthM, sample.heightM)));
      assert.ok(maximumSleeveDiameterM <= 0.23,
        `${id} L30 sleeve must stay at a normal diameter (${maximumSleeveDiameterM} m)`);
    }
    if (id === 't90sm_2013') {
      let maximumJacketDiameterM = 0;
      for (const sample of result.samples) {
        if (sample.source === 'barrel') {
          maximumJacketDiameterM = Math.max(
            maximumJacketDiameterM,
            sample.widthM,
            sample.heightM,
          );
        }
      }
      assert.ok(maximumJacketDiameterM <= 0.26,
        `t90sm_2013 thermal jacket must stay at a normal diameter (${maximumJacketDiameterM} m)`);
    }
  } finally {
    visual.dispose();
  }
}

console.log('turretBarrelCircularity.selftest: circular, axis-centered geometry enforced for reported barrels, flank twins, paired '
  + 'cradles and rotary clusters');
