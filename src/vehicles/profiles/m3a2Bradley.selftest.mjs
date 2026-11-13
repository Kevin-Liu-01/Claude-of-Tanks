// Release 268 (owner 2026-11-02, "also make a new variant of the bradley based on the old turret we had before doing
// this. i liked the shape and all the stuff arounnd it") built the M3A2 Bradley, 'm3a2_bradley', as the shared Bradley
// hull under main's 7cc204ab32 m2a2_bradley turret and its kit, mirrored so the TOW pod stands on the turret's LEFT (+X),
// the pod turret-fixed (profiles/bradleyClassicTurret.ts). 269 (owner 2026-11-05: "the m3a2 bradley USA should be m2a2
// bradley, and our current m2a2 bradley usa should be the m3a2 bradley") swapped the two: the M2A2 carries the classic
// turret (modern3.ts buildM2A2Bradley) and the M3A2 the turret measured from the owner's source with the crew bags
// (modern3.ts buildBradleySourceTurretIfv). The M3A2's spec is the M2A2's vehicle with the M3's stowed loads
// (m3a2BradleySpecs.ts). This receipt is the classic turret's (on the M2A2) and, since 270 (Main 2026-11-06: "The
// comparison registration follows the owner's swap"), the M2A2's photo packet fixture
// (docs/references/photos/m2a2-bradley-20261106.json); the M3A2 is measured against the source turret's model
// (tools/procedural-fidelity.html) and keeps no packet.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { createTank } from '../tankFactory.ts';
import { getSpec } from '../specs.ts';
import { BRADLEY_TURRET_RING } from '../modern3.ts';
import { CLASSIC_GUN_PIVOT, CLASSIC_TOW_MOUTHS, CLASSIC_MUZZLE_Z, CLASSIC_GUN_PITCH_BY_YAW_DEG } from '../bradleyClassicTurretLayout.ts';
import { bradleySourceArmorInput } from '../modern3Specs.ts';

const ID = 'm3a2_bradley', CLASSIC = 'm2a2_bradley';
const m3 = getSpec(ID), m2 = getSpec(CLASSIC);

// ---- spec: the M2A2's vehicle with the M3's stowed loads; the M3A2 on the source turret's gun datums, the M2A2 on the
// classic turret's
for (const key of ['nation', 'role', 'hp', 'enginePowerHp', 'weightTons', 'topSpeedKmh', 'reverseSpeedKmh',
  'gunElevationDeg', 'gunDepressionDeg', 'gunPitchDegS']) assert.deepEqual(m3[key], m2[key], `${ID} ${key} is the M2A2's`);
assert.equal(m3.name, 'M3A2 Bradley');
assert.equal(m3.gun.caliberMm, m2.gun.caliberMm, `${ID} fires the M2A2's 25 mm`);
assert.deepEqual(m3.gun.shells.map((s) => s.name), m2.gun.shells.map((s) => s.name), `${ID} carries the M2A2's rounds`);
for (const [i, shell] of m3.gun.shells.entries()) {
  const base = m2.gun.shells[i];
  for (const key of ['type', 'caliberMm', 'pen100Mm', 'pen1000Mm', 'pen2000Mm', 'dmg', 'velocityMps', 'reloadS', 'guided', 'launcherTubes'])
    assert.deepEqual(shell[key], base[key], `${ID} ${shell.name} ${key} is the M2A2's`);
  // the M3 stows 12 TOW (the M2 7) and 1,500 rounds of 25 mm (the M2 900): Wikipedia "M3 Bradley", "M2 Bradley"
  assert.equal(shell.count, shell.guided ? 12 : Math.round(base.count * 1500 / 900), `${ID} ${shell.name} stowed load`);
}
assert.deepEqual(m3.armor.turretPivot, m2.armor.turretPivot, `${ID} turns on the family's ring`);
assert.deepEqual(m3.armor.turretPivot, [BRADLEY_TURRET_RING.x, BRADLEY_TURRET_RING.deckY, BRADLEY_TURRET_RING.z],
  `${ID}'s ring is the shared hull's datum`);
assert.deepEqual(m3.armor.gunPivot, bradleySourceArmorInput().gunPivot, `${ID} carries the source turret's gun pivot`);
assert.equal(m3.gunPitchByYawDeg, undefined, `${ID}'s source turret depresses its full 9 deg at every yaw`);
assert.deepEqual(m3.gun.launcherMuzzles, getSpec('ua_m2a3_bradley').gun.launcherMuzzles,
  `${ID} fires TOW from the source turret's pod, as the Ukrainian M2A3 does`);
assert.deepEqual(m2.armor.gunPivot, [...CLASSIC_GUN_PIVOT], `${CLASSIC} carries the classic turret's gun pivot`);
// 269 (2026-11-06): the combat-rig census (combatGunRigs.generated.ts) seats the combat barrel on the drawn 25 mm, whose
// suppressor mouth is CLASSIC_MUZZLE_Z (2.23), not the spec's 2.30; the swap had left the source turret's row on the M2A2.
assert.equal(m2.armor.gunBarrel.lengthM, CLASSIC_MUZZLE_Z, `${CLASSIC}'s combat barrel ends at the drawn muzzle`);
assert.deepEqual(m2.gunPitchByYawDeg, CLASSIC_GUN_PITCH_BY_YAW_DEG, `${CLASSIC} keeps the classic turret's rear stops`);
assert.deepEqual(m2.gun.launcherMuzzles.map(({ x, y, z, frame }) => [x, y, z, frame]),
  CLASSIC_TOW_MOUTHS.map(({ x, y, z }) => [x, y, z, 'turret']), `${CLASSIC} fires TOW from the pod's two collar mouths`);

const packet = JSON.parse(readFileSync(new URL('../../../docs/references/photos/m2a2-bradley-20261106.json', import.meta.url), 'utf8'));
const target = packet.targets[CLASSIC];
assert.equal(target.test, 'src/vehicles/profiles/m3a2Bradley.selftest.mjs');
assert.deepEqual(Object.keys(packet.targets), [CLASSIC], `the packet holds the ${CLASSIC} only (${ID} is not in this packet)`);

for (const quality of ['high', 'low']) {
  const m3a2 = createTank(ID, null, { quality, proceduralOnly: true, geometryReceipt: true, camoSeed: 4242 });
  try {
    m3a2.root.updateMatrixWorld(true);
    const turretRig = m3a2.root.getObjectByName('rig_turret');
    assert.ok(turretRig.userData.bradleyA2TurretClosureReceipt, `${quality}: ${ID} carries the source turret`);
    assert.equal(turretRig.userData.bradleyClassicTurretReceipt, undefined, `${quality}: ${ID} carries no classic turret`);
  } finally { m3a2.dispose(); }
  const tank = createTank(CLASSIC, null, { quality, proceduralOnly: true, geometryReceipt: true, camoSeed: 4242 });
  try {
    tank.root.updateMatrixWorld(true);
    const turretRig = tank.root.getObjectByName('rig_turret'), gunRig = tank.root.getObjectByName('rig_gun');
    const receipt = turretRig.userData.bradleyClassicTurretReceipt;
    assert.ok(receipt?.revision.startsWith('classic-7cc204ab32'), `${quality}: ${CLASSIC} carries the classic turret`);
    assert.equal(turretRig.userData.bradleyA2TurretClosureReceipt, undefined, `${quality}: ${CLASSIC} carries no family turret`);
    // the photo packet's envelope, the photo check's own rule (3 %)
    const size = new THREE.Box3().setFromObject(tank.root).getSize(new THREE.Vector3());
    for (const [axis, want] of [['x', target.widthM], ['z', target.overallLengthM], ['y', target.tallestM]]) {
      assert.ok(Math.abs(size[axis] / want - 1) <= packet.dimensionToleranceFraction,
        `${quality}: ${CLASSIC} ${axis} ${size[axis].toFixed(3)} against the packet's ${want}`);
    }
    // mirrored: the TOW launcher on the left (+X), the bin on the right. 2026-11-05 (269 T2, the ODS rebuild): the
    // receipt carries the stowed launcher's box and the bin in place of the 268 shell's bridges to them
    assert.ok(receipt.towBox.x0 > 0 && receipt.bin.innerX < 0, `${quality}: ${CLASSIC}'s TOW launcher is on the turret's left`);
    // the pod is turret stock: the gun group stays a slim 25 mm (mantlet block, boot, tube)
    const gunBox = new THREE.Box3().setFromObject(gunRig);
    const gunLocal = [gunBox.min, gunBox.max].map((v) => turretRig.worldToLocal(v.clone()));
    assert.ok(Math.min(...gunLocal.map((v) => v.x)) > CLASSIC_GUN_PIVOT[0] - 0.30
      && Math.max(...gunLocal.map((v) => v.x)) < CLASSIC_GUN_PIVOT[0] + 0.30, `${quality}: ${CLASSIC}'s gun group carries no TOW pod`);
    // each mouth opens clear ahead (nothing within 1 m in front of it, down its axis into the 170 mm bore) on its collar:
    // a ray just off the bore (inside the 2 cm rim) meets the collar's face at the mouth
    const turretMeshes = [];
    turretRig.traverse((o) => { if (o.isMesh && !gunRig.getObjectById(o.id)) turretMeshes.push(o); });
    const back = new THREE.Vector3(0, 0, -1);
    for (const m of CLASSIC_TOW_MOUTHS) {
      const mouth = turretRig.localToWorld(new THREE.Vector3(m.x, m.y, m.z));
      const ahead = new THREE.Raycaster(mouth.clone().add(new THREE.Vector3(0, 0, 1.0)), back, 0, 0.99)
        .intersectObjects(turretMeshes, false)[0];
      assert.equal(ahead, undefined, `${quality}: ${CLASSIC}'s TOW mouth ${m.y.toFixed(3)} opens clear (${ahead?.distance})`);
      const rim = new THREE.Raycaster(mouth.clone().add(new THREE.Vector3(0.095, 0, 1.0)), back, 0, 1.2)
        .intersectObjects(turretMeshes, false)[0];
      assert.ok(rim && Math.abs(rim.distance - 1.0) < 0.01, `${quality}: ${CLASSIC}'s TOW mouth ${m.y.toFixed(3)} stands on its collar (${rim?.distance})`);
    }
    // seated: up through the deck under the turret's overhang, the turret's own underside within 10 cm of the ring
    const turret = turretRig.getObjectByName('turret');
    for (const [x, z] of [[0.62, 0.30], [-0.62, 0.30], [0.62, -0.80], [-0.62, -0.80]]) {
      const origin = turretRig.localToWorld(new THREE.Vector3(x, -0.30, z));
      const hit = new THREE.Raycaster(origin, new THREE.Vector3(0, 1, 0), 0, 0.6).intersectObject(turret, false)[0];
      const y = hit && turretRig.worldToLocal(hit.point.clone()).y;
      assert.ok(hit && y > -0.10 && y < 0.10, `${quality}: ${CLASSIC}'s turret closes on the deck at (${x}, ${z}): ${y}`);
    }
  } finally { tank.dispose(); }
}
console.log(`m3a2Bradley.selftest: the M3A2 is the M2A2 with the M3's loads under the source turret; the M2A2 carries the `
  + 'classic turret, mirrored to the left TOW, turret-fixed, seated on the shared hull, inside its photo packet envelope');
