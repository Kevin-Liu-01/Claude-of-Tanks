// 2026-11-02 audit F10: the killcam's wreck receipt (game/killcamWreckReceipt.ts), one for the victim and for an
// attacker that died after firing (a traded kill):
//  - the receipt reads the visual's declared wreck state: a cook-off comes back a cook-off (the attacker's re-wreck had
//    pop:false hard-coded), and the killing hit's ammo-rack flag makes one too;
//  - a turret its authority held is declared held again (awaitWreckTurretPose, then the held pose) BEFORE the late
//    re-wreck, so no local body is thrown and settled by its seat (the attacker's re-wreck declared none: its turret lay
//    where the authority's collision turret was not);
//  - a wreck the replay never lifted keeps its own turret; a standing visual has no receipt.
// The real visual's side (an awaited pose before a late-age wreck lies at that pose) is wreckTurretMode.selftest's.
import assert from 'node:assert/strict';
import { recordKillcamWreck, restoreKillcamWreck, KILLCAM_REWRECK_AGE_S } from './killcamWreckReceipt.ts';

function visual({ state = 'plain', held = null } = {}) {
  const calls = [];
  let wreck = state;
  return {
    calls,
    isDestroyed: () => wreck !== 'intact',
    wreckState: () => wreck,
    wreckTurretHeldPose(out) { if (!held) return false; out.set(held); return true; },
    awaitWreckTurretPose() { calls.push(['await']); },
    setWreckTurretPose(pose) { calls.push(['pose', Array.from(pose)]); },
    setDestroyed(options) { calls.push(['wreck', options]); wreck = options.pop ? 'cookoff' : 'plain'; },
    resetDestroyed() { wreck = 'intact'; },
  };
}
const held = [4, 1.2, -3, 0, 0.38, 0, 0.92];

// a standing visual: no receipt
assert.equal(recordKillcamWreck(visual({ state: 'intact' })), null, 'a standing visual has no wreck receipt');

// an attacker cooked off after firing, its turret held by its authority: lifted by the restage, then re-wrecked
{
  const v = visual({ state: 'cookoff', held });
  const receipt = recordKillcamWreck(v);
  assert.equal(receipt.pop, true, 'a cook-off reads as one from its declared state');
  assert.deepEqual(Array.from(receipt.turretPose), held, "and keeps its authority's turret pose");
  v.resetDestroyed();
  restoreKillcamWreck(v, receipt);
  assert.deepEqual(v.calls, [['await'], ['pose', held], ['wreck', { pop: true, ageS: KILLCAM_REWRECK_AGE_S }]],
    "the authority's pose is declared before the late cook-off re-wreck");
}

// a plain wreck no authority held: plain again, no pose declared
{
  const v = visual({ state: 'plain' });
  const receipt = recordKillcamWreck(v);
  assert.deepEqual([receipt.pop, receipt.turretPose], [false, null]);
  v.resetDestroyed();
  restoreKillcamWreck(v, receipt);
  assert.deepEqual(v.calls, [['wreck', { pop: false, ageS: KILLCAM_REWRECK_AGE_S }]], 'a plain wreck comes back plain');
}

// the victim's hint: the killing hit's ammo-rack flag makes a cook-off
assert.equal(recordKillcamWreck(visual({ state: 'plain' }), true).pop, true, "the killing hit's ammo-rack flag pops it");

// a wreck the replay never lifted (pre-destroyed) keeps its own turret: no pose is declared over it
{
  const v = visual({ state: 'cookoff', held });
  restoreKillcamWreck(v, recordKillcamWreck(v));
  assert.deepEqual(v.calls.map((c) => c[0]), ['wreck'], 'a wreck still lying keeps its own turret');
}

console.log('killcamWreckReceipt.selftest: a restaged wreck, victim or attacker, comes back with its own look and its authority\'s turret pose declared first');
