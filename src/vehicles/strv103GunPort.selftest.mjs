// 259 (owner on both Strv 103s: "dont allow the strv 103 bs gun to like glitch through the front of its gate"): the fixed
// 105 mm tube leaves its hull through a real port and passes its gate. Until 259 the glacis cut the 103A's tube from its
// crown to its belly over 1.4 m, its splash rail and its travel clamp's yoke ran through it and its beak lip touched it;
// the 103B's glacis, its louvre banks, its nose shelf and its nose screen's centre bar did the same. Each tube now leaves
// through the housing on its glacis (profiles/casemate.ts addFixedGunPort): ahead of the housing's face it stands at least
// FIXED_GUN_KEEP_M from every other hull mesh (the port ring and decorations included), and behind that face it is hidden, at every
// hull pitch the hydropneumatic aim allows (the whole tank pitches: the gun is one body with its hull). A bar laid across
// the tube ahead of the port fails the same measure.
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { FIXED_GUN_KEEP_M, fixedGunHullProbe } from './gunHullClearance.test-support.mjs';

for (const id of ['strv103a', 'strv103b']) {
  const probe = fixedGunHullProbe(id);
  try {
    assert.ok(probe.pitchesDeg[0] < -10 && probe.pitchesDeg[2] > 10, `${id}: the sweep spans the hull's published pitch range`);
    const measures = probe.pitchesDeg.map((pitch) => probe.measure(pitch));
    for (const m of measures) console.log(`${id} pitch ${m.pitchDeg}: clearance ${(m.clearance * 100).toFixed(1)} cm (${m.part ?? 'none within 6.5 cm'}) at ${m.at}, ${m.ahead} samples ahead, ${m.behind} behind, ${m.exposed} exposed`);
    for (const m of measures) {
      assert.ok(m.ahead > 1000 && m.behind > 200, `${id} at ${m.pitchDeg} deg: the tube is sampled ahead of and behind its port`);
      assert.ok(m.clearance >= FIXED_GUN_KEEP_M,
        `${id} at ${m.pitchDeg} deg: ${m.part} stands ${(m.clearance * 100).toFixed(1)} cm from the tube at ${m.at} (keep ${FIXED_GUN_KEEP_M * 100} cm)`);
      assert.equal(m.exposed, 0, `${id} at ${m.pitchDeg} deg: the tube shows behind its port's face`);
    }
    // negative control: a 3 cm bar across the tube 0.5 m ahead of the port
    const bar = new THREE.Mesh(new THREE.BoxGeometry(0.40, 0.03, 0.03));
    bar.name = 'negativeControlBar';
    bar.position.set(0, probe.port.axisY, probe.port.z + 0.5);
    const crossed = probe.withHullMesh(bar, () => probe.measure(0));
    assert.ok(crossed.clearance < FIXED_GUN_KEEP_M && crossed.part === 'negativeControlBar', `${id}: a bar across the tube fails`);
    bar.geometry.dispose();
  } finally {
    probe.dispose();
  }
}
console.log('strv103GunPort.selftest: both Strv 103 tubes leave through their ports and clear every hull part at every hull pitch');
