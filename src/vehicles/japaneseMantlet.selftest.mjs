// 261 (owner: "the stb 1 and type 74 still need completgely new mantlets and turret geometrry around the mantlets"): each
// tank's gun pitches in its own shield, seated in a channel cast into its own turret front (profiles/japaneseMantlets.ts;
// the STB-1 prototype's and the production Type 74's shields are different castings). At every whole degree of the gun's
// travel (the spec's full depression to full elevation; the hydropneumatic hull pitch moves turret and gun as one) and
// with the recoiling tube in battery and at 0.135 m (gunHullClearance.test-support.mjs gunShieldProbe):
//   - the gun's parts ahead of the receiver face and inside the shield's sides keep GUN_SHIELD_KEEP_M from every fixed
//     turret part (cheeks, brow, sill, searchlight, sights): nothing of the gun passes through its turret;
//   - every ray of a 20 mm grid shot down the turret's axis into the channel's mouth meets the shield or the gun before
//     the receiver face: the shield fills its channel at every pitch, no gap opens round it;
//   - the shield's side seams stay narrow (2-26 mm at the trunnion) and the two tanks' shields differ.
// Negative controls: the gun slid 30 mm sideways reaches a cheek; the mouth without its shield shows the receiver face.
import assert from 'node:assert/strict';
import { GUN_SHIELD_KEEP_M, gunShieldProbe } from './gunHullClearance.test-support.mjs';

const T0 = Date.now(), report = {}, fits = {};
for (const id of ['stb1', 'type74']) {
  const probe = gunShieldProbe(id);
  try {
    const { fit } = probe;
    const [lo, hi] = probe.pitchesDeg;
    assert.ok(lo <= -6 && hi >= 9, `${id}: the travel covers the published -6..+9 degrees (${lo}..${hi})`);
    const seam = fit.halfWidthM - fit.shieldHalfWidthM;
    assert.ok(seam >= .002 && seam <= .026, `${id}: shield/cheek seam ${(seam * 1000).toFixed(1)} mm`);
    let worst = { clearance: Infinity }, rays = 0;
    const pitches = new Set([lo]);
    for (let p = Math.ceil(lo); p <= hi; p++) pitches.add(p);
    pitches.add(hi);
    for (const p of pitches) {
      const m = probe.measure(p);
      assert.ok(m.ahead > 2000, `${id} at ${p} deg: the gun is sampled ahead of its receiver (${m.ahead})`);
      assert.ok(m.clearance >= GUN_SHIELD_KEEP_M,
        `${id} at ${p} deg: ${m.part} stands ${(m.clearance * 1000).toFixed(1)} mm from the gun at ${m.at} (keep ${GUN_SHIELD_KEEP_M * 1000} mm)`);
      assert.equal(m.holes, 0, `${id} at ${p} deg: ${m.holes}/${m.rays} rays see the receiver face (first at ${m.hole})`);
      if (m.clearance < worst.clearance) worst = m;
      rays += m.rays;
    }
    const shifted = probe.withShift(.03, () => probe.measure(0));
    assert.ok(shifted.clearance < GUN_SHIELD_KEEP_M, `${id}: negative control: the gun slid 30 mm sideways reaches its cheek (${(shifted.clearance * 1000).toFixed(1)} mm)`);
    const bare = probe.withoutShield(() => probe.measure(0));
    assert.ok(bare.holes > 0, `${id}: negative control: the mouth without its shield shows the receiver face`);
    report[id] = { travel: [lo, hi], worstMm: +(worst.clearance * 1000).toFixed(1), at: [worst.pitchDeg, worst.part, worst.at], seamMm: +(seam * 1000).toFixed(1), rays };
    fits[id] = fit;
  } finally { probe.dispose(); }
}
assert.notEqual(fits.stb1.shield, fits.type74.shield, 'the STB-1 and the Type 74 do not share one shield casting');
console.log(`japaneseMantlet: ${JSON.stringify(report)}; both guns stay inside their shields over the whole travel PASS (${((Date.now() - T0) / 1000).toFixed(0)} s)`);
