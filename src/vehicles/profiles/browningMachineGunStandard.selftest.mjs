import assert from 'node:assert/strict';
import * as THREE from 'three';
import { FITTINGS } from './kit.ts';

const materialSlots = [
  'dark', 'detail', 'shadow', 'hull', 'gunmetalAmmo', 'glass',
  'canvasCloth', 'wood', 'spareTrack', 'barrel', 'rubber',
];
const mats = Object.fromEntries(materialSlots.map((slot) => [
  slot,
  new THREE.MeshStandardMaterial({ color: slot === 'dark' ? 0x202326 : 0x77806f }),
]));

const CLASSES = Object.freeze({
  m2: Object.freeze({ name: 'Browning M2HB', caliberMm: 12.7 }),
  heavy: Object.freeze({ name: 'Browning-pattern HMG', caliberMm: 12.7 }),
  dshk: Object.freeze({ name: 'DShK-pattern HMG', caliberMm: 12.7 }),
  nsvt: Object.freeze({ name: 'NSVT-pattern HMG', caliberMm: 12.7 }),
  kord: Object.freeze({ name: 'Kord-pattern HMG', caliberMm: 12.7 }),
  mag: Object.freeze({ name: 'Browning-derived GPMG', caliberMm: 7.62 }),
  mag58: Object.freeze({ name: 'MAG 58 GPMG', caliberMm: 7.62 }),
});

function triangleCount(root) {
  let triangles = 0;
  root.traverse((node) => {
    if (!node.isMesh) return;
    triangles += node.geometry.index
      ? node.geometry.index.count / 3
      : node.geometry.attributes.position.count / 3;
  });
  return triangles;
}

try {
  for (const [weaponClass, expected] of Object.entries(CLASSES)) {
    const weapon = FITTINGS.pintleMG({
      mats,
      cls: weaponClass,
      shield: 'armored',
      ammo: true,
      tone: 'two-tone',
      seed: 4242,
    });

    assert.equal(weapon.userData.fittingRoot, true, `${weaponClass}: semantic fitting root`);
    assert.equal(weapon.userData.fitting, 'pintleMG', `${weaponClass}: canonical fitting kind`);
    assert.equal(weapon.userData.browningDerivedStandard, 'cot-browning-family-v2',
      `${weaponClass}: participates in the fleet Browning-derived quality standard`);
    assert.equal(weapon.userData.weaponClass, weaponClass);
    assert.equal(weapon.userData.weaponName, expected.name);
    assert.equal(weapon.userData.caliberMm, expected.caliberMm);
    assert.equal(weapon.userData.machineGunFinish, 'gunmetal');
    assert.equal(weapon.userData.hasConnectedFeed, true);
    assert.equal(weapon.userData.hasEngineeredCradle, true);
    assert.equal(weapon.userData.shieldVariant, 'armored');
    assert.ok(triangleCount(weapon) >= 1000,
      `${weaponClass}: clears the detailed receiver/mount/shield geometry floor`);

    const body = weapon.getObjectByName('browningDerivedMachineGunBody');
    assert.ok(body?.isMesh, `${weaponClass}: exposes one stable machine-gun body surface`);
    assert.equal(body.userData.fittingSlot, 'dark', `${weaponClass}: weapon remains gunmetal`);
    assert.equal(body.userData.appearanceRole, 'machineGun');

    const ammo = weapon.children.find((node) => node.userData.fittingSlot === 'gunmetalAmmo');
    assert.ok(ammo?.isMesh, `${weaponClass}: exposes a connected neutral ammunition assembly`);
    assert.equal(ammo.material, mats.dark,
      `${weaponClass}: ammunition resolves to the gunmetal material, never host camouflage`);

    for (const node of weapon.children) {
      assert.equal(node.userData.combatHitboxRole, 'equipment',
        `${weaponClass}: auxiliary weapon primitives never become primary armor`);
      assert.equal(node.userData.surfaceMarkupSelectable, true,
        `${weaponClass}: every visible merged surface is selectable in Gallery and Studio`);
    }
    assert.ok(weapon.userData.aabb.max[2] > 0.65,
      `${weaponClass}: weapon publishes a real forward firing silhouette`);
    weapon.traverse((node) => node.geometry?.dispose?.());
  }

  for (const [label, fitting] of [
    ['American M2HB hero mount', FITTINGS.americanM2({ mats, shield: 'split' })],
    ['American armored RWS', FITTINGS.americanRws({ mats, variant: 'armored' })],
    ['Open-yoke remote station', FITTINGS.openYokeRws({ mats, variant: 'sepv3-armored' })],
  ]) {
    assert.equal(fitting.userData.browningDerivedStandard, 'cot-browning-family-v2',
      `${label}: shares the fleet Browning-derived standard`);
    assert.equal(fitting.userData.machineGunFinish, 'gunmetal');
    assert.equal(fitting.userData.hasConnectedFeed, true);
    assert.equal(fitting.userData.hasEngineeredCradle, true);
    fitting.traverse((node) => node.geometry?.dispose?.());
  }

  const exactHero = new THREE.Group();
  exactHero.add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.5), mats.dark));
  exactHero.userData.hasConnectedFeed = true;
  exactHero.userData.hasEngineeredCradle = true;
  FITTINGS.markExact(exactHero, 'pintleMG');
  assert.equal(exactHero.userData.browningDerivedStandard, 'cot-browning-family-v2-exact',
    'source-measured hero guns retain their shape while joining the Browning-family contract');
  assert.equal(exactHero.userData.machineGunFinish, 'gunmetal');
  assert.equal(exactHero.userData.hasConnectedFeed, true,
    'exact registration preserves authored capability receipts');
  assert.equal(exactHero.children[0].userData.surfaceMarkupSelectable, true,
    'exact visible weapon primitives remain selectable in Gallery and Studio');
  exactHero.traverse((node) => node.geometry?.dispose?.());
} finally {
  for (const material of Object.values(mats)) material.dispose();
}

console.log('browningMachineGunStandard.selftest: all MG classes, mounts, feeds, finishes, and shields verified');
