// 262 (owner on the Challenger 1 rebuild: "based on proper historical referrences so they will no longer look so
// chungus"; the rebuilt Challenger turrets became the fictional FV4030/5 and FV4030/6, 2026-10-28): each main gun leaves
// its turret through a real port and stays in it over its whole published pitch range. The L11A5 runs in the slot
// between the nose plates behind a drum shield and a canvas boot. At every 5 degrees from full depression to full
// elevation (and at both stops), in battery and at the recoil stroke, the tube ahead of the port's face
// keeps TURRET_GUN_PORT_KEEP_M from every turret part, the tube behind the face is hidden (inside the turret, the shield,
// the mantlet or the boot), and the gun's mount ahead of the face never touches the turret.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { TURRET_GUN_PORT_KEEP_M, turretGunPortProbe } from './gunHullClearance.test-support.mjs';

for (const id of ['challenger_x', 'challenger_x_sleek']) {
  const probe = turretGunPortProbe(id);
  try {
    assert.ok(probe.pitchesDeg[0] <= -10 && probe.pitchesDeg.at(-1) >= 20, `${id}: the sweep spans the published -10 to +20 degrees`);
    for (const pitch of probe.pitchesDeg) {
      const m = probe.measure(pitch);
      console.log(`${id} pitch ${pitch}: tube ${(m.clearance * 100).toFixed(1)} cm (${m.part ?? 'none within 6.5 cm'}) at ${m.at}, mount ${(m.mountClearance * 100).toFixed(1)} cm, ${m.ahead} ahead, ${m.behind} behind, ${m.exposed} exposed`);
      assert.ok(m.ahead > 1000 && m.behind > 20, `${id} at ${pitch} deg: the tube is sampled ahead of and behind its port`);
      assert.ok(m.clearance >= TURRET_GUN_PORT_KEEP_M,
        `${id} at ${pitch} deg: ${m.part} stands ${(m.clearance * 100).toFixed(1)} cm from the tube at ${m.at} (keep ${TURRET_GUN_PORT_KEEP_M * 100} cm)`);
      assert.equal(m.exposed, 0, `${id} at ${pitch} deg: the tube shows behind its port's face`);
      assert.ok(m.mountClearance > .002, `${id} at ${pitch} deg: the gun's mount touches ${m.mountPart} ahead of the port`);
    }
    // negative control: a 3 cm bar across the tube 0.4 m ahead of the port fails
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.50, 0.03, 0.03));
    bar.name = 'negativeControlBar';
    const muzzleLine = probe.measure(0);
    bar.position.set(0, muzzleLine.at ? muzzleLine.at[1] : 0.4, probe.port.faceZ + 0.4);
    const crossed = probe.withTurretMesh(bar, () => probe.measure(0));
    assert.ok(crossed.clearance < TURRET_GUN_PORT_KEEP_M && crossed.part === 'negativeControlBar', `${id}: a bar across the tube fails`);
    bar.geometry.dispose();
  } finally {
    probe.dispose();
  }
}
console.log('challengerXGunPort.selftest: the FV4030/5 and FV4030/6 guns stay in their ports over the full pitch range');
