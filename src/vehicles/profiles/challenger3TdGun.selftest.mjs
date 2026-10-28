// Release 262 (the Challenger 3 TD, profiles/challenger3Td.ts): the deep mantlet rides between the two cheeks of the new
// turret, so the gun must clear its own turret, not only its hull. At every whole degree from full depression to full
// elevation, in battery and at full recoil, everything of the gun ahead of the slot face (the mantlet, the coax port,
// the root jacket, the evacuator and the tube) keeps GUN_SLOT_KEEP_M from every other part of the turret: the cheeks'
// inner walls, the dischargers, the sights and the turret's camouflage suit. A 3 cm rod laid across the slot 0.30 m
// ahead of its face fails the same measure. The hull side (the published depression curve over the glacis trough) is
// nationalGunClearance.selftest.mjs's.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GUN_SLOT_KEEP_M, gunSlotProbe } from '../gunHullClearance.test-support.mjs';

const probe = gunSlotProbe('challenger3_td');
try {
  const { slot, pitchesDeg } = probe;
  assert.ok(pitchesDeg[0] === -10 && pitchesDeg.at(-1) === 20, 'the sweep runs -10 to +20 degrees');
  let worst = null;
  for (const pitch of pitchesDeg) {
    const m = probe.measure(pitch);
    assert.ok(m.ahead > 2000, `pitch ${pitch}: the gun is sampled ahead of the slot face`);
    assert.ok(m.clearance >= GUN_SLOT_KEEP_M,
      `pitch ${pitch}: ${m.part} stands ${(m.clearance * 1000).toFixed(1)} mm from the gun at ${m.at} (keep ${GUN_SLOT_KEEP_M * 1000} mm)`);
    if (!worst || m.clearance < worst.clearance) worst = m;
  }
  console.log(`challenger3_td: the gun clears its turret ahead of the slot face at every pitch (nearest ${(worst.clearance * 1000).toFixed(1)} mm`
    + ` from ${worst.part ?? 'nothing within 6.5 cm'} at ${worst.pitchDeg} deg)`);
  // negative control: a rod across the slot in front of the mantlet
  const rod = new THREE.Mesh(new THREE.BoxGeometry(slot.halfWidth * 2.2, 0.03, 0.03));
  rod.name = 'negativeControlRod';
  rod.position.set(0, 0.30, slot.faceZ + 0.30);
  const crossed = probe.withTurretMesh(rod, () => probe.measure(0));
  assert.ok(crossed.clearance < GUN_SLOT_KEEP_M && crossed.part === 'negativeControlRod', 'a rod across the slot fails');
  rod.geometry.dispose();
} finally {
  probe.dispose();
}
console.log('challenger3TdGun.selftest: the Challenger 3 TD gun clears its slot and turret through its whole travel');
